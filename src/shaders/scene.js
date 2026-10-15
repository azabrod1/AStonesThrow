// GLSL for the pond: water surface, pond floor with caustics, bubbles, and
// the foam specks that ride the surface after a splash (src/foamSpecks.js).
// All scene passes render linear HDR radiance; the composite pass tone-maps.
//
// GLSL_COMMON also carries the ambient wind waves (src/ambientWaves.js) and
// their gust envelope, for every shader that rides or shades the surface; the
// uniforms it declares come from AmbientWaves.uniforms() and stay inactive in
// shaders that never call the functions using them.

export const GLSL_COMMON = /* glsl */`
#define PI 3.141592653589793

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Soft mask that is 1 over the simulated patch and fades to 0 at its rim, so the
// periodic patch meets the flat water outside it without a seam.
float patchMask(vec2 domainUv) {
  vec2 d = abs(domainUv - 0.5) * 2.0;
  float edge = max(d.x, d.y);
  return 1.0 - smoothstep(0.78, 0.98, edge);
}

// Ambient wind waves: a periodic tile of ripples (src/ambientWaves.js) laid
// over all the water and multiplied by the gust envelope. Its texture holds
// height, ∂h/∂x, ∂h/∂z and ∇²h (r, g, b, a) in units of
// uAmbientMetresPerUnit, mipmapped and repeat-wrapped.
uniform sampler2D uAmbientHeight;
uniform float uAmbientTileSize;      // metres per side of the tile
uniform float uAmbientTexels;        // texels per side
uniform float uAmbientMetresPerUnit;
uniform vec2 uWindDirection;         // world XZ the wind blows toward, unit length
uniform float uGustTime;             // world seconds

// Gusts: cat's paws. Patches of ripple about GUST_SCALE metres across drift
// downwind at GUST_DRIFT m/s over calmer water, which keeps GUST_CALM of the
// ripple so it is never glass. Two octaves of value noise, turned off the
// world axes so the noise lattice never lines up with the view; the finer one
// drifts half as fast again, so the patches change shape as they travel. The
// smoothstep from GUST_EDGE_LOW to GUST_EDGE_HIGH makes them patches rather
// than a gentle swell of ripple. The splash's own ripples are not modulated.
#define GUST_SCALE 3.0
#define GUST_DRIFT 1.5
#define GUST_CALM 0.25
#define GUST_EDGE_LOW 0.42
#define GUST_EDGE_HIGH 0.62
float gustEnvelope(vec2 worldXZ, float time) {
  vec2 coarse = mat2(0.8, 0.6, -0.6, 0.8) * (worldXZ - uWindDirection * GUST_DRIFT * time) / GUST_SCALE;
  vec2 fine = mat2(0.6, -0.8, 0.8, 0.6) * (worldXZ - uWindDirection * 1.5 * GUST_DRIFT * time) / (0.45 * GUST_SCALE) + 13.7;
  float field = 0.65 * valueNoise(coarse) + 0.35 * valueNoise(fine);
  return mix(GUST_CALM, 1.0, smoothstep(GUST_EDGE_LOW, GUST_EDGE_HIGH, field));
}

// Height of the ambient waves at full gust, metres. In a vertex shader the
// lookup is at the base level; in a fragment shader at the pixel's mip level.
float ambientHeightAtFullGust(vec2 worldXZ) {
  return texture2D(uAmbientHeight, worldXZ / uAmbientTileSize).r * uAmbientMetresPerUnit;
}

float ambientHeight(vec2 worldXZ) {
  return ambientHeightAtFullGust(worldXZ) * gustEnvelope(worldXZ, uGustTime);
}

// Slope (dh/dx, dh/dz) at full gust, exact (from the spectrum), read at the
// pixel's mip level so far ripples average to flat. The water shader
// multiplies it by the gust envelope it also needs for its roughness.
vec2 ambientSlopeAtFullGust(vec2 worldXZ) {
  return texture2D(uAmbientHeight, worldXZ / uAmbientTileSize).gb * uAmbientMetresPerUnit;
}

// Laplacian of the height (1/m), exact, at the pixel's mip level. The sun's
// disc blurs a caustic on the floor 0.8 m down by under a centimetre, less
// than a texel, so it needs no blur of its own.
float ambientLaplacian(vec2 worldXZ) {
  return texture2D(uAmbientHeight, worldXZ / uAmbientTileSize).a * uAmbientMetresPerUnit * gustEnvelope(worldXZ, uGustTime);
}

// Sun glitter (F0 = 0.02): the sun reflected by a surface whose normal is n
// and whose slopes finer than n resolves are Gaussian with total variance
// slopeVariance (both axes): the Beckmann distribution, with its Smith
// shadowing (Walter et al.'s rational fit). Gaussian tails, not GGX's long
// ones: water's slopes are close to Gaussian, and at grazing angles a GGX tail
// paints a bright smear toward the horizon where no slope reaches the sun.
// Returns outgoing radiance for a sun of the given irradiance.
float beckmannShadowing(float cosine, float slopeVariance) {
  float cotangentOverWidth = cosine / sqrt(slopeVariance * max(1.0 - cosine * cosine, 1e-6));
  if (cotangentOverWidth >= 1.6) return 1.0;
  return (3.535 * cotangentOverWidth + 2.181 * cotangentOverWidth * cotangentOverWidth)
    / (1.0 + 2.276 * cotangentOverWidth + 2.577 * cotangentOverWidth * cotangentOverWidth);
}

vec3 sunGlitter(vec3 normal, vec3 toViewer, vec3 toSun, vec3 sunIrradiance, float slopeVariance) {
  vec3 halfVector = normalize(toSun + toViewer);
  float nDotH = max(dot(normal, halfVector), 1e-3);
  float nDotV = max(dot(normal, toViewer), 1e-3);
  float nDotL = max(dot(normal, toSun), 0.0);
  float vDotH = max(dot(toViewer, halfVector), 0.0);
  float cosineSquared = nDotH * nDotH;
  float tangentSquared = (1.0 - cosineSquared) / cosineSquared;
  float distribution = exp(-tangentSquared / slopeVariance) / (PI * slopeVariance * cosineSquared * cosineSquared);
  float fresnel = 0.02 + 0.98 * pow(1.0 - vDotH, 5.0);
  float shadowing = beckmannShadowing(nDotV, slopeVariance) * beckmannShadowing(max(nDotL, 1e-3), slopeVariance);
  return sunIrradiance * distribution * shadowing * fresnel / max(4.0 * nDotV * nDotL, 1e-3) * nDotL;
}
`;

// The water. The inner patch is displaced by the splash height and the ambient
// height together, both faded out by patchMask at the patch's rim, so its edge
// meets the flat outer sheet (the ambient height there, a few millimetres
// 4 m and more from the camera, is far below a pixel). Shading takes the
// slope of both fields everywhere: the splash's inside the patch, the
// ambient's over all the water, outer sheet included.
export const WATER_VERTEX = /* glsl */`
uniform sampler2D uHeight;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uInner;
varying vec3 vWorld;
varying vec2 vDomainUv;
varying float vMask;
varying float vViewZ;
${GLSL_COMMON}
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 domainUv = (world.xz - uDomainMin) / uDomainSize + uTexelOffset;
  float mask = uInner > 0.5 ? patchMask(domainUv) : 0.0;
  float height = uInner > 0.5 ? texture2D(uHeight, domainUv).r + ambientHeight(world.xz) : 0.0;
  world.y += height * mask;
  vWorld = world;
  vDomainUv = domainUv;
  vMask = mask;
  vec4 viewPosition = viewMatrix * vec4(world, 1.0);
  vViewZ = viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const WATER_FRAGMENT = /* glsl */`
#include <packing>
uniform sampler2D uHeight;
uniform sampler2D uFoam;
uniform sampler2D uReflection;    // the sky dome seen through a mirrored camera
uniform mat4 uReflectionMatrix;   // world -> reflection texture coordinates
uniform sampler2D uUnderColor;
uniform sampler2D uUnderDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uFocalPx;        // pixels per unit tan(angle)
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform float uTime;
uniform float uN;
uniform float uCell;
uniform vec3 uAbsorb;          // per-metre absorption
uniform vec3 uWaterColor;      // in-scattered radiance at full depth
uniform float uScatterLength;  // metres over which in-scattering saturates
uniform float uRoughness;        // sub-grid roughness: a slope spread of uRoughness² (rms, both axes)
uniform float uAmbientUnresolved[AMBIENT_LEVELS];   // slope variance each mip level of the ambient waves loses
varying vec3 vWorld;
varying vec2 vDomainUv;
varying float vMask;
varying float vViewZ;
${GLSL_COMMON}

// The slope variance of the ambient ripples that this pixel's lookup no
// longer shows and the base level does, at full gust: interpolated by mip
// level, the level computed as the GPU picks it (isotropic, from the larger
// screen derivative). Magnified, nearer the camera, it is zero.
float ambientUnresolvedVariance(vec2 worldXZ) {
  vec2 texelPosition = worldXZ / uAmbientTileSize * uAmbientTexels;
  vec2 acrossX = dFdx(texelPosition);
  vec2 acrossY = dFdy(texelPosition);
  float level = clamp(0.5 * log2(max(max(dot(acrossX, acrossX), dot(acrossY, acrossY)), 1e-8)), 0.0, float(AMBIENT_LEVELS - 1) - 0.001);
  int lower = int(level);
  return mix(uAmbientUnresolved[lower], uAmbientUnresolved[lower + 1], level - float(lower));
}

void main() {
  float texelStep = 1.0 / uN;
  float hl = texture2D(uHeight, vDomainUv - vec2(texelStep, 0.0)).r;
  float hr = texture2D(uHeight, vDomainUv + vec2(texelStep, 0.0)).r;
  float hd = texture2D(uHeight, vDomainUv - vec2(0.0, texelStep)).r;
  float hu = texture2D(uHeight, vDomainUv + vec2(0.0, texelStep)).r;
  vec3 toCamera = cameraPosition - vWorld;
  float viewDist = length(toCamera);
  // The splash's slope inside its patch plus the ambient ripples everywhere,
  // which the mipmaps flatten where they are finer than a pixel. What they
  // flatten becomes roughness, so the glitter keeps its brightness with distance.
  float gust = gustEnvelope(vWorld.xz, uGustTime);
  vec2 slope = vec2(hr - hl, hu - hd) / (2.0 * uCell) * vMask + ambientSlopeAtFullGust(vWorld.xz) * gust;
  float subGridSpread = uRoughness * uRoughness;
  float slopeVariance = subGridSpread * subGridSpread + ambientUnresolvedVariance(vWorld.xz) * gust * gust;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 v = toCamera / viewDist;
  float nDotV = max(dot(n, v), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - nDotV, 5.0);

  // Reflection of the sky and the far shore (the dome's photograph): a planar
  // mirror image, rendered at screen resolution, of a dome at infinity, so the
  // direction the surface reflects the view ray into is looked up through the
  // mirror camera (w = 0: a direction). A ripple tilting toward or away from
  // the camera moves the image up or down by twice its tilt; one tilting
  // sideways turns it far less at grazing angles, so reflections stretch into
  // vertical streaks, as they do on a lake. A ray turned below the horizon
  // would meet the next ripple; it takes the horizon's colour.
  vec3 reflectedRay = reflect(-v, n);
  reflectedRay.y = max(reflectedRay.y, 0.001);
  vec4 reflectCoord = uReflectionMatrix * vec4(reflectedRay, 0.0);
  vec2 reflectUv = reflectCoord.xy / max(reflectCoord.w, 1e-4);
  vec3 reflected = texture2D(uReflection, clamp(reflectUv, vec2(0.002), vec2(0.998))).rgb;

  // Refraction: shift the screen lookup by the surface slope, scaled by how much
  // water lies behind this point and by distance (a slope moves the image more
  // when the floor is far below the surface and the camera is close).
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float surfaceDistZ = -vViewZ;
  float rawDepth = texture2D(uUnderDepth, screenUv).r;
  // Nothing under the surface (past the floor's edge): as deep as the far plane,
  // which is past the far edge of the water.
  float underDistZ = rawDepth >= 1.0 ? uFar : -perspectiveDepthToViewZ(rawDepth, uNear, uFar);
  float pathZ = max(underDistZ - surfaceDistZ, 0.0);
  float path = pathZ * viewDist / surfaceDistZ;
  vec2 refractShift = slope * 0.25 * min(path, 3.0) * uFocalPx / max(viewDist, 0.3) / uResolution;
  vec2 refractUv = clamp(screenUv + refractShift, vec2(0.002), vec2(0.998));
  float rawDepth2 = texture2D(uUnderDepth, refractUv).r;
  float underDistZ2 = rawDepth2 >= 1.0 ? uFar : -perspectiveDepthToViewZ(rawDepth2, uNear, uFar);
  float path2 = max(underDistZ2 - surfaceDistZ, 0.0) * viewDist / surfaceDistZ;
  if (path2 < 0.02) { refractUv = screenUv; path2 = path; }
  vec3 underColor = texture2D(uUnderColor, refractUv).rgb;
  vec3 transmittance = exp(-uAbsorb * path2);
  float scattering = 1.0 - exp(-path2 / uScatterLength);
  vec3 refracted = underColor * transmittance + uWaterColor * scattering;

  vec3 color = mix(refracted, reflected, fresnel);
  color += min(sunGlitter(n, v, uSunDir, uSunIrradiance, slopeVariance), vec3(400.0));

  // Foam is patchy: bubbles clustered by a drifting noise, thinning as it decays.
  float foam = texture2D(uFoam, vDomainUv).r * vMask;
  float clump = valueNoise(vWorld.xz * 24.0 + uTime * 0.3) * 0.55 + valueNoise(vWorld.xz * 70.0) * 0.45;
  float foamCover = smoothstep(0.08, 0.7, foam) * smoothstep(0.55 - foam * 0.5, 0.8, clump);
  float nDotL = max(dot(n, uSunDir), 0.0);
  vec3 foamColor = vec3(0.94, 0.96, 0.97) * (uSunIrradiance * (0.3 + 0.35 * nDotL) + uSkyAmbient * 1.5);
  color = mix(color, foamColor, foamCover * 0.92);

  gl_FragColor = vec4(min(color, vec3(1000.0)), 1.0);
}
`;

export const FLOOR_VERTEX = /* glsl */`
varying vec3 vWorld;
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const FLOOR_FRAGMENT = /* glsl */`
uniform sampler2D uHeight;
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uN;
uniform float uCell;
uniform float uPondDepth;
uniform vec3 uAbsorb;
varying vec3 vWorld;
${GLSL_COMMON}

void main() {
  vec2 p = vWorld.xz;
  // Sand with pebbles.
  float grain = valueNoise(p * 38.0) * 0.45 + valueNoise(p * 130.0) * 0.25 + valueNoise(p * 7.0) * 0.5;
  vec3 sand = mix(vec3(0.26, 0.22, 0.15), vec3(0.42, 0.37, 0.27), grain);
  float pebble = smoothstep(0.62, 0.74, valueNoise(p * 6.5 + 7.3) * 0.7 + valueNoise(p * 21.0) * 0.3);
  vec3 pebbleColor = vec3(0.27, 0.26, 0.24) * (0.6 + 0.8 * valueNoise(p * 70.0));
  sand = mix(sand, pebbleColor, pebble * 0.8);
  float silt = valueNoise(p * 0.9 + 3.0);
  sand *= 0.75 + 0.45 * silt;

  // Caustics: where the surfaces above focus the sun. The beam reaching this
  // floor point crossed the surface up-sun of it; its irradiance scales with
  // the inverse area dilation of the refracted rays, which for small slopes is
  // 1 + 0.25 · depth · ∇²h.
  vec2 surfacePoint = p + uSunDir.xz / max(uSunDir.y, 0.2) * uPondDepth * 0.75;
  vec2 uv = (surfacePoint - uDomainMin) / uDomainSize + uTexelOffset;
  float mask = patchMask(uv);
  // Sampled three texels apart: the sun's width and the water blur fine detail.
  float texelStep = 3.0 / uN;
  float hc = texture2D(uHeight, uv).r;
  float hl = texture2D(uHeight, uv - vec2(texelStep, 0.0)).r;
  float hr = texture2D(uHeight, uv + vec2(texelStep, 0.0)).r;
  float hd = texture2D(uHeight, uv - vec2(0.0, texelStep)).r;
  float hu = texture2D(uHeight, uv + vec2(0.0, texelStep)).r;
  float laplacian = (hl + hr + hu + hd - 4.0 * hc) / (9.0 * uCell * uCell);
  // The ambient ripples add their own: a web of caustics drifting with them.
  float focus = 1.0 + 0.25 * uPondDepth * (laplacian * mask + ambientLaplacian(surfacePoint));
  float caustic = clamp(1.0 / max(focus, 0.5), 0.72, 1.45);

  float sunPath = uPondDepth / max(uSunDir.y, 0.2);
  vec3 sunlight = uSunIrradiance * exp(-uAbsorb * sunPath) * max(uSunDir.y, 0.0) * caustic;
  vec3 ambient = uSkyAmbient * exp(-uAbsorb * uPondDepth) * 1.4;
  vec3 color = sand * (sunlight + ambient);
  gl_FragColor = vec4(color, 1.0);
}
`;

export const BUBBLE_VERTEX = /* glsl */`
attribute float aSize;
uniform float uProjScale;
varying float vFade;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-viewPosition.z, 0.05);
  gl_PointSize = max(aSize * 2.0 * uProjScale / dist, 1.5);
  vFade = clamp(aSize * 2.0 * uProjScale / dist / 1.5, 0.3, 1.0);
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const BUBBLE_FRAGMENT = /* glsl */`
uniform vec3 uTint;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float rim = smoothstep(0.35, 1.0, r2);
  vec2 hp = c - vec2(-0.35, -0.35);
  float highlight = exp(-dot(hp, hp) * 14.0);
  vec3 color = mix(uTint, vec3(1.0), rim * 0.55 + highlight * 0.8);
  float alpha = (0.25 + 0.6 * rim + highlight * 0.5) * vFade;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

// Foam specks: points riding the water surface. Each speck's whole life is a
// closed form of the splash time, so the CPU writes a speck once, when it is
// born: it drifts outward from where it was born at a speed decaying over
// SPECK_DRIFT_SECONDS, wanders a little, and sits on the waves at the height
// the water surface's own vertex shader gives that point, splash and ambient
// waves together (plus SPECK_LIFT, so the triangulated surface never covers it). It fades in over a tenth of a
// second and out over its last SPECK_FADE seconds, shrinking as it goes.
// A speck smaller than uMinPixelSize is drawn at that size, soft, with its
// opacity cut by the area it really covers (down to SPECK_MIN_COVERAGE): a
// hard dot of a pixel or two would flicker as it moves across pixels, and far
// specks should read as a faint grain where they gather, not as bright dots.
export const SPECK_VERTEX = /* glsl */`
#define SPECK_DRIFT_SECONDS 1.6
#define SPECK_WANDER 0.0012
#define SPECK_LIFT 0.0015
#define SPECK_FADE 0.35
#define SPECK_MIN_COVERAGE 0.12
attribute vec2 aDrift;       // initial outward drift, m/s
attribute vec4 aTiming;      // birth (splash seconds), life (s), diameter (m), random phase
uniform sampler2D uHeight;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uTime;
uniform float uProjScale;    // render-target pixels per world unit at distance 1
uniform float uMinPixelSize;
varying float vAlpha;
varying float vPixelSize;
${GLSL_COMMON}
void main() {
  float age = uTime - aTiming.x;
  float life = aTiming.y;
  if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; vPixelSize = 0.0; return; }
  float phase = aTiming.w;
  vec2 place = position.xz + aDrift * SPECK_DRIFT_SECONDS * (1.0 - exp(-age / SPECK_DRIFT_SECONDS));
  place += SPECK_WANDER * vec2(sin(age * 1.3 + phase) + 0.5 * sin(age * 3.1 + 2.0 * phase), cos(age * 1.1 + 1.7 * phase) + 0.5 * sin(age * 2.7 + 3.0 * phase));
  vec2 domainUv = (place - uDomainMin) / uDomainSize + uTexelOffset;
  float height = (texture2D(uHeight, domainUv).r + ambientHeight(place)) * patchMask(domainUv);
  vec4 viewPosition = viewMatrix * vec4(place.x, height + SPECK_LIFT, place.y, 1.0);
  float fadeOut = 1.0 - smoothstep(life - SPECK_FADE, life, age);
  float fade = smoothstep(0.0, 0.1, age) * fadeOut;
  float pixelSize = aTiming.z * (0.6 + 0.4 * fadeOut) * uProjScale / max(-viewPosition.z, 0.05);
  float drawn = max(pixelSize, uMinPixelSize);
  gl_PointSize = drawn;
  vPixelSize = drawn;
  vAlpha = fade * max((pixelSize * pixelSize) / (drawn * drawn), SPECK_MIN_COVERAGE);
  gl_Position = projectionMatrix * viewPosition;
}
`;

// A speck is lit like the foam map in WATER_FRAGMENT (white under the sun and
// sky, on a level surface), dimmed by uBrightness. Drawn over five pixels or more it is a
// translucent disc a little brighter at its rim, which is how a small surface
// bubble looks; smaller, a soft blob.
export const SPECK_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform float uOpacity;
uniform float uBrightness;
varying float vAlpha;
varying float vPixelSize;
void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float radiusSquared = dot(offset, offset);
  if (radiusSquared > 1.0) discard;
  float bubble = (0.7 + 0.3 * smoothstep(0.3, 0.8, radiusSquared)) * (1.0 - smoothstep(0.75, 1.0, radiusSquared));
  float blob = exp(-3.0 * radiusSquared);
  float shape = mix(blob, bubble, smoothstep(3.5, 5.0, vPixelSize));
  vec3 light = uSunIrradiance * (0.3 + 0.35 * max(uSunDir.y, 0.0)) + uSkyAmbient * 1.5;
  vec3 color = vec3(0.94, 0.96, 0.97) * light * uBrightness;
  float alpha = vAlpha * shape * uOpacity;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;
