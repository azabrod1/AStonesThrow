// GLSL for the pond: water surface, pond floor with caustics, bubbles, and
// the foam specks that ride the surface after a splash (src/foamSpecks.js).
// All scene passes render linear HDR radiance; the composite pass tone-maps.

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

// GGX sun highlight for a wet surface (F0 = 0.02). Returns outgoing radiance for
// a sun of the given irradiance.
vec3 sunSpecular(vec3 n, vec3 v, vec3 l, vec3 sunIrradiance, float roughness) {
  vec3 h = normalize(l + v);
  float nDotH = max(dot(n, h), 0.0);
  float nDotV = max(dot(n, v), 1e-3);
  float nDotL = max(dot(n, l), 0.0);
  float vDotH = max(dot(v, h), 0.0);
  float a = roughness * roughness;
  float a2 = a * a;
  float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
  float d = a2 / (PI * denominator * denominator);
  float fresnel = 0.02 + 0.98 * pow(1.0 - vDotH, 5.0);
  float k = a * 0.5;
  float g = (nDotV / (nDotV * (1.0 - k) + k)) * (nDotL / (nDotL * (1.0 - k) + k));
  return sunIrradiance * d * g * fresnel / max(4.0 * nDotV * nDotL, 1e-3) * nDotL;
}

// Tiny wind ripples: three slow plane waves, slopes only. Keeps flat water from
// looking like glass without hiding the simulated ripples.
vec2 noiseSlope(vec2 p, float scale, float amplitude, vec2 drift, float t) {
  vec2 q = p * scale + drift * t;
  float e = 0.35;
  float dx = valueNoise(q + vec2(e, 0.0)) - valueNoise(q - vec2(e, 0.0));
  float dy = valueNoise(q + vec2(0.0, e)) - valueNoise(q - vec2(0.0, e));
  return vec2(dx, dy) * (amplitude * scale / (2.0 * e));
}

vec2 windSlope(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  // Irregular cat's-paws: two octaves of drifting noise, plus faint plane waves.
  slope += noiseSlope(p, 9.0, 0.0022, vec2(0.6, 0.25), t);
  slope += noiseSlope(p, 23.0, 0.0008, vec2(-0.9, 0.5), t);
  slope += noiseSlope(p, 61.0, 0.00022, vec2(1.4, -0.7), t);
  vec2 d1 = normalize(vec2(0.80, 0.30));
  vec2 d2 = normalize(vec2(-0.45, 0.90));
  vec2 d3 = normalize(vec2(0.20, -1.00));
  float k1 = 2.0 * PI / 0.16, k2 = 2.0 * PI / 0.11, k3 = 2.0 * PI / 0.27;
  slope += d1 * 0.00020 * k1 * cos(k1 * dot(d1, p) - sqrt(9.81 * k1) * t);
  slope += d2 * 0.00012 * k2 * cos(k2 * dot(d2, p) - sqrt(9.81 * k2) * t + 1.7);
  slope += d3 * 0.00025 * k3 * cos(k3 * dot(d3, p) - sqrt(9.81 * k3) * t + 0.4);
  float gust = 0.3 + 0.7 * valueNoise(p * 0.45 + vec2(t * 0.06, t * 0.02));
  return slope * gust;
}
`;

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
  float h = uInner > 0.5 ? texture2D(uHeight, domainUv).r : 0.0;
  world.y += h * mask;
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
uniform sampler2D uReflection;    // sky and shore seen through a mirrored camera
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
uniform float uRoughness;
varying vec3 vWorld;
varying vec2 vDomainUv;
varying float vMask;
varying float vViewZ;
${GLSL_COMMON}

void main() {
  float texelStep = 1.0 / uN;
  float hl = texture2D(uHeight, vDomainUv - vec2(texelStep, 0.0)).r;
  float hr = texture2D(uHeight, vDomainUv + vec2(texelStep, 0.0)).r;
  float hd = texture2D(uHeight, vDomainUv - vec2(0.0, texelStep)).r;
  float hu = texture2D(uHeight, vDomainUv + vec2(0.0, texelStep)).r;
  vec3 toCamera = cameraPosition - vWorld;
  float viewDist = length(toCamera);
  // Beyond a few metres the wind ripples are smaller than a pixel: fade them out
  // and let a rougher highlight stand in for the glitter they would make.
  float farness = smoothstep(2.5, 14.0, viewDist);
  vec2 slope = vec2(hr - hl, hu - hd) / (2.0 * uCell) * vMask;
  slope += windSlope(vWorld.xz, uTime) * (1.0 - farness);
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  float roughness = mix(uRoughness, 0.19, farness);
  vec3 v = toCamera / viewDist;
  float nDotV = max(dot(n, v), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - nDotV, 5.0);

  // Reflection of the sky and the far shore: a planar mirror image rendered at
  // screen resolution, shifted by the surface slope (a tilt of s radians turns
  // the reflected ray by 2s).
  vec4 reflectCoord = uReflectionMatrix * vec4(vWorld, 1.0);
  vec2 reflectUv = reflectCoord.xy / reflectCoord.w;
  reflectUv += vec2(-slope.x, slope.y) * 2.0 * uFocalPx / uResolution;
  vec3 reflected = texture2D(uReflection, clamp(reflectUv, vec2(0.002), vec2(0.998))).rgb;

  // Refraction: shift the screen lookup by the surface slope, scaled by how much
  // water lies behind this point and by distance (a slope moves the image more
  // when the floor is far below the surface and the camera is close).
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float surfaceDistZ = -vViewZ;
  float rawDepth = texture2D(uUnderDepth, screenUv).r;
  float underDistZ = rawDepth >= 1.0 ? 1000.0 : -perspectiveDepthToViewZ(rawDepth, uNear, uFar);
  float pathZ = max(underDistZ - surfaceDistZ, 0.0);
  float path = pathZ * viewDist / surfaceDistZ;
  vec2 refractShift = slope * 0.25 * min(path, 3.0) * uFocalPx / max(viewDist, 0.3) / uResolution;
  vec2 refractUv = clamp(screenUv + refractShift, vec2(0.002), vec2(0.998));
  float rawDepth2 = texture2D(uUnderDepth, refractUv).r;
  float underDistZ2 = rawDepth2 >= 1.0 ? 1000.0 : -perspectiveDepthToViewZ(rawDepth2, uNear, uFar);
  float path2 = max(underDistZ2 - surfaceDistZ, 0.0) * viewDist / surfaceDistZ;
  if (path2 < 0.02) { refractUv = screenUv; path2 = path; }
  vec3 underColor = texture2D(uUnderColor, refractUv).rgb;
  vec3 transmittance = exp(-uAbsorb * path2);
  float scattering = 1.0 - exp(-path2 / uScatterLength);
  vec3 refracted = underColor * transmittance + uWaterColor * scattering;

  vec3 color = mix(refracted, reflected, fresnel);
  color += min(sunSpecular(n, v, uSunDir, uSunIrradiance, roughness), vec3(400.0));

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

  // Caustics: where the surface above focuses the sun. The beam reaching this
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
  float focus = 1.0 + 0.25 * uPondDepth * laplacian * mask;
  float caustic = clamp(1.0 / max(focus, 0.5), 0.72, 1.45);
  // Faint wandering caustic web from the wind ripples.
  vec2 w = windSlope(surfacePoint, 0.0);
  float web = valueNoise(surfacePoint * 9.0 + vec2(0.0, 0.0));
  caustic *= 0.92 + 0.16 * web;

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
// the water surface's own vertex shader gives that point (plus SPECK_LIFT, so
// the triangulated surface never covers it). It fades in over a tenth of a
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
  float height = texture2D(uHeight, domainUv).r * patchMask(domainUv);
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
