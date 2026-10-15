// GLSL for the splash droplets: screen-space fluid rendering.
//
// Droplets are drawn as sphere impostors, stretched along their motion into
// capsules the way a camera's shutter would smear them. The depth pass writes
// view depth, the drop's true on-screen radius and a sun glint from the sphere
// normal; the thickness pass accumulates how much water the pixel looks
// through. The depth is smoothed with a bilateral blur so neighbouring drops
// merge into sheets, and the composite pass shades the result as water: sky
// reflection, refraction of the scene behind, sun highlights, and white
// scattering for fine spray. The composite pass also tone-maps the frame.
//
// Crown sheets (src/shaders/sheet.js) draw into the same targets with an
// on-screen radius of 999; the composite gives them full coverage once they
// are about half a millimetre thick and a faint scattering that grows with
// thickness, so the glassy wall stays clear while the bead and edge-on walls
// whiten.
//
// Jet columns write 998 there and, packed in the depth target's alpha
// (NORMAL_PACKING; uFullFloatInfo says how), their smooth normal and how round
// the surface is; so do the large drops a column breaks into (iLens), so they
// look like the bulb they were. The blur leaves them unsmoothed and the
// composite shades them as glass lenses with no film scattering, fading to
// spray only under a couple of pixels in radius (an on-screen radius taken
// from their thickness and depth); a round lens under about 6 pixels fades to
// the plain surface shading, which spares specks an upside-down horizon. A
// ray through a
// water sphere at incidence θ leaves turned by 2·(θ − asin(sin θ / 1.33))
// towards its centre, in the plane of the ray and the normal; through a tube
// it keeps its slope along the axis (taken as vertical) and turns only across
// it, by the same law with the effective index sqrt(1.33² − sin²γ) / cos γ for
// a ray at γ to the cross-section. So the column shows the pond from well to
// the side (the sun's glitter on it) and the bulb shows the sky upside down,
// rather than what is just behind them. That light is the sky cube above the
// horizon and, below it, the pond as a rough mirror of the sky plus the sun's
// glitter, offset so that the straight-through direction gives exactly the
// scene behind; reflections use the same function.

// Jet columns and the drops drawn like them pack their view normal (turned to
// face the viewer) and how round the surface is into the depth target's alpha,
// as an integer the target keeps exactly: 11 + 11 + 2 bits, below 2^24, in a
// float target; 5 + 5 + 1 bits, up to 2047, in a half-float one.
export const NORMAL_PACKING = /* glsl */`
float packNormal(vec3 normal, float roundness, float fullFloat) {
  vec2 clamped = clamp(normal.xy, -1.0, 1.0);
  if (fullFloat > 0.5) {
    vec2 fine = floor(clamped * 1023.0 + 1024.5);
    return (fine.x * 2048.0 + fine.y) * 4.0 + floor(clamp(roundness, 0.0, 1.0) * 3.0 + 0.5);
  }
  vec2 coarse = min(floor((clamped + 1.0) * 16.0), 31.0);
  return (coarse.x * 32.0 + coarse.y) * 2.0 + step(0.5, roundness);
}
vec3 unpackNormal(float packed, float fullFloat, out float roundness) {
  vec2 normalXy;
  if (fullFloat > 0.5) {
    float pair = floor(packed / 4.0);
    roundness = (packed - pair * 4.0) / 3.0;
    float high = floor(pair / 2048.0);
    normalXy = (vec2(high, pair - high * 2048.0) - 1024.0) / 1023.0;
  } else {
    float pair = floor(packed / 2.0);
    roundness = packed - pair * 2.0;
    float high = floor(pair / 32.0);
    normalXy = (vec2(high, pair - high * 32.0) + 0.5) / 16.0 - 1.0;
  }
  return normalize(vec3(normalXy, sqrt(max(1.0 - dot(normalXy, normalXy), 0.0))));
}
`;

export const PARTICLE_VERTEX = /* glsl */`
attribute vec3 iPosition;
attribute float iRadius;
attribute vec3 iVelocity;
attribute float iLens;
uniform float uProjScale;        // pixels per world unit at distance 1
uniform float uMinPixelRadius;
uniform float uStreakSeconds;
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;
varying float vPixelRadius;
varying float vStretch;          // half-length of the capsule in radii (1 = sphere)
varying vec2 vAxis;              // screen-space motion direction (view xy)
varying float vLens;
void main() {
  vec4 viewCentre = viewMatrix * vec4(iPosition, 1.0);
  float dist = max(-viewCentre.z, 0.05);
  float pixelRadius = iRadius * uProjScale / dist;
  float radius = iRadius * max(1.0, uMinPixelRadius / max(pixelRadius, 1e-4));
  vec3 viewVelocity = (viewMatrix * vec4(iVelocity, 0.0)).xyz;
  vec2 motion = viewVelocity.xy * uStreakSeconds;
  float streak = length(motion);
  vec2 axis = streak > 1e-5 ? motion / streak : vec2(1.0, 0.0);
  float stretch = 1.0 + 0.5 * streak / radius;
  // A drop drawn as a lens keeps its shape: a long streak would read as a pill.
  if (iLens > 0.5) stretch = min(stretch, 1.25);
  vec2 perpendicular = vec2(-axis.y, axis.x);
  vec2 offset = (axis * position.x * stretch + perpendicular * position.y) * radius;
  vQuad = position.xy;
  vViewCentre = viewCentre.xyz;
  vRadius = radius;
  vPixelRadius = pixelRadius;
  vStretch = stretch;
  vAxis = axis;
  vLens = iLens;
  gl_Position = projectionMatrix * vec4(viewCentre.xyz + vec3(offset, 0.0), 1.0);
}
`;

// Capsule distance in radius units for a quad point; also the sphere-local xy.
const CAPSULE = /* glsl */`
vec3 capsule(vec2 quad, float stretch) {
  float along = quad.x * stretch;
  float dx = max(abs(along) - (stretch - 1.0), 0.0) * sign(along);
  return vec3(dx, quad.y, dx * dx + quad.y * quad.y);
}
`;

export const PARTICLE_DEPTH_FRAGMENT = /* glsl */`
uniform mat4 projectionMatrix;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform vec3 uSunDirView;
uniform float uFullFloatInfo;    // 1 when this target is full float (NORMAL_PACKING)
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;
varying float vPixelRadius;
varying float vStretch;
varying vec2 vAxis;
varying float vLens;
${CAPSULE}
${NORMAL_PACKING}
void main() {
  vec3 c = capsule(vQuad, vStretch);
  if (c.z > 1.0) discard;
  float zOffset = sqrt(1.0 - c.z);
  vec2 perpendicular = vec2(-vAxis.y, vAxis.x);
  vec2 localXy = vAxis * c.x + perpendicular * c.y;
  vec3 viewPos = vViewCentre + vec3(localXy, zOffset) * vRadius;
  vec4 clip = projectionMatrix * vec4(viewPos, 1.0);
  float depth = (clip.z / clip.w) * 0.5 + 0.5;
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (depth > sceneDepth) discard;
  gl_FragDepth = depth;
  // Sun glint off the sphere: a sharp lobe around the mirror direction.
  vec3 n = vec3(localXy, zOffset);
  vec3 v = normalize(-viewPos);
  vec3 h = normalize(uSunDirView + v);
  float glint = pow(max(dot(n, h), 0.0), 90.0) / vStretch;
  if (vLens > 0.5) {
    // A drop from the jet column is drawn as the column is (src/shaders/sheet.js):
    // marker 998 and its exact normal packed in alpha, a round lens.
    gl_FragColor = vec4(-viewPos.z, 998.0, glint, packNormal(n, 1.0, uFullFloatInfo));
    return;
  }
  gl_FragColor = vec4(-viewPos.z, vPixelRadius, glint, 1.0);
}
`;

export const PARTICLE_THICKNESS_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;
varying float vStretch;
${CAPSULE}
void main() {
  vec3 c = capsule(vQuad, vStretch);
  if (c.z > 1.0) discard;
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  float thickness = 2.0 * sqrt(1.0 - c.z) * vRadius / vStretch;
  gl_FragColor = vec4(thickness, 0.0, 0.0, 1.0);
}
`;

export const BLUR_FRAGMENT = /* glsl */`
uniform sampler2D uDepth;
uniform sampler2D uFluidInfo;  // the depth pass's target: a jet column (998) is already smooth
uniform vec2 uDirection;       // one texel step along the blur axis, in uv
uniform float uProjScale;
uniform float uBlurWorld;      // merging distance in metres
varying vec2 vUv;
void main() {
  float centre = texture2D(uDepth, vUv).r;
  if (centre <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (abs(texture2D(uFluidInfo, vUv).g - 998.0) < 0.5) { gl_FragColor = vec4(centre, 0.0, 0.0, 1.0); return; }
  float sigmaPx = clamp(uBlurWorld * uProjScale / centre, 0.8, 12.0);
  float radius = ceil(sigmaPx * 2.0);
  float depthSigma = max(uBlurWorld * 2.0, centre * 0.015);
  float sum = 0.0;
  float weightSum = 0.0;
  for (int i = -24; i <= 24; i++) {
    float x = float(i);
    if (abs(x) > radius) continue;
    float d = texture2D(uDepth, vUv + uDirection * x).r;
    if (d <= 0.0) continue;
    float dd = d - centre;
    float w = exp(-x * x / (2.0 * sigmaPx * sigmaPx)) * exp(-dd * dd / (2.0 * depthSigma * depthSigma));
    sum += d * w;
    weightSum += w;
  }
  gl_FragColor = vec4(sum / max(weightSum, 1e-6), 0.0, 0.0, 1.0);
}
`;

export const COMPOSITE_FRAGMENT = /* glsl */`
uniform sampler2D uScene;
uniform sampler2D uFluidDepth;
uniform sampler2D uThickness;
uniform sampler2D uFluidInfo;
uniform samplerCube uEnvCube;
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;
uniform vec2 uFluidTexel;
uniform vec3 uSunDirView;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uAbsorb;
uniform float uExposure;
uniform float uRefract;
uniform float uMinPixelRadius;
uniform float uFluidScale;      // fluid-buffer pixels per device pixel (the buffer's resolution scale)
uniform float uProjScale;      // fluid-target pixels per world unit at distance 1
uniform float uFullFloatInfo;  // 1 when the depth target is full float (NORMAL_PACKING)
varying vec2 vUv;
#define PI 3.141592653589793
${NORMAL_PACKING}

vec3 viewPosition(vec2 uv, float depth) {
  vec4 farPoint = uInverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  farPoint.xyz /= farPoint.w;
  return farPoint.xyz * (depth / -farPoint.z);
}

vec3 aces(vec3 color) {
  const mat3 inputMatrix = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outputMatrix = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = inputMatrix * color;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(outputMatrix * (a / b), 0.0, 1.0);
}

// Light arriving along a world direction at a point a little above the pond:
// the sky (the photographed panorama, far shore and all) above the horizon;
// below it the pond, a rough mirror of it with the sun's glitter (effective
// roughness GLITTER_ROUGHNESS, wider than the water shader's own because its
// waves spread the glitter too).
// body is the share left for light from under the surface (1 − Fresnel).
#define GLITTER_ROUGHNESS 0.4
vec3 pondView(vec3 direction, vec3 sunWorld, out float body) {
  if (direction.y >= 0.0) { body = 0.0; return textureCubeLodEXT(uEnvCube, direction, 1.0).rgb; }
  float cosine = -direction.y;
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosine, 5.0);
  body = 1.0 - fresnel;
  vec3 sky = textureCubeLodEXT(uEnvCube, vec3(direction.x, max(cosine, 0.04), direction.z), 2.0).rgb;
  vec3 halfVector = normalize(sunWorld - direction);
  float alpha = GLITTER_ROUGHNESS * GLITTER_ROUGHNESS;
  float alphaSquared = alpha * alpha;
  float denominator = halfVector.y * halfVector.y * (alphaSquared - 1.0) + 1.0;
  float distribution = alphaSquared / (PI * denominator * denominator);
  float glitterFresnel = 0.02 + 0.98 * pow(1.0 - max(dot(-direction, halfVector), 0.0), 5.0);
  vec3 glitter = uSunIrradiance * distribution * glitterFresnel * 0.25 / max(cosine, 0.05);
  return fresnel * sky + min(glitter, vec3(40.0));
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec3 scene = texture2D(uScene, vUv).rgb;
  float depth = texture2D(uFluidDepth, vUv).r;
  float thickness = texture2D(uThickness, vUv).r;
  vec3 color = scene;
  if (depth > 0.0 && thickness > 0.0) {
    vec3 pos = viewPosition(vUv, depth);
    vec2 dx = vec2(uFluidTexel.x, 0.0);
    vec2 dy = vec2(0.0, uFluidTexel.y);
    float dR = texture2D(uFluidDepth, vUv + dx).r;
    float dL = texture2D(uFluidDepth, vUv - dx).r;
    float dU = texture2D(uFluidDepth, vUv + dy).r;
    float dD = texture2D(uFluidDepth, vUv - dy).r;
    vec3 ddxRight = dR > 0.0 ? viewPosition(vUv + dx, dR) - pos : vec3(0.0);
    vec3 ddxLeft = dL > 0.0 ? pos - viewPosition(vUv - dx, dL) : vec3(0.0);
    vec3 ddyUp = dU > 0.0 ? viewPosition(vUv + dy, dU) - pos : vec3(0.0);
    vec3 ddyDown = dD > 0.0 ? pos - viewPosition(vUv - dy, dD) : vec3(0.0);
    vec3 ddx = (dR > 0.0 && (dL <= 0.0 || abs(ddxRight.z) < abs(ddxLeft.z))) ? ddxRight : ddxLeft;
    vec3 ddy = (dU > 0.0 && (dD <= 0.0 || abs(ddyUp.z) < abs(ddyDown.z))) ? ddyUp : ddyDown;
    vec3 n = cross(ddx, ddy);
    // Degenerate (no neighbours, or steps in line): face the viewer. Relative
    // to the steps, which are well under a millimetre in a narrow view.
    if (dot(n, n) <= 1e-8 * dot(ddx, ddx) * dot(ddy, ddy) || dot(n, n) == 0.0) n = vec3(0.0, 0.0, 1.0);
    n = normalize(n);
    if (n.z < 0.0) n = -n;

    // Crown sheets write an on-screen radius of 999, jet columns 998 with
    // their smooth normal packed in alpha.
    vec4 info = texture2D(uFluidInfo, vUv);
    float sheet = step(998.5, info.g);
    float column = step(997.5, info.g) - sheet;
    float roundness = 0.0;
    if (column > 0.5) n = unpackNormal(info.a, uFullFloatInfo, roundness);

    vec3 v = normalize(-pos);
    float nDotV = max(dot(n, v), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - nDotV, 5.0);
    vec3 worldN = normalize((uCameraWorld * vec4(n, 0.0)).xyz);
    vec3 worldV = normalize((uCameraWorld * vec4(v, 0.0)).xyz);
    vec3 r = reflect(-worldV, worldN);
    r.y = max(r.y, 0.04);
    vec3 reflected = textureCubeLodEXT(uEnvCube, r, 1.0).rgb;

    float t = clamp(thickness, 0.0, 0.06);
    vec2 refractUv = clamp(vUv + n.xy * uRefract * t, vec2(0.001), vec2(0.999));
    vec3 refracted = texture2D(uScene, refractUv).rgb * exp(-uAbsorb * thickness * 3.0);
    // A column's on-screen radius, from its thickness and depth.
    float columnRadius = 0.5 * thickness / max(n.z, 0.3) * uProjScale / depth;
    if (column > 0.5) {
      // A column is a lens: see the header.
      vec3 sunWorld = normalize((uCameraWorld * vec4(uSunDirView, 0.0)).xyz);
      vec3 eye = -v;
      // Sphere: turn within the plane of the ray and the normal.
      float cosIncidence = clamp(dot(n, v), 0.0, 1.0);
      float sinIncidence = sqrt(1.0 - cosIncidence * cosIncidence);
      float deviation = 2.0 * (asin(sinIncidence) - asin(sinIncidence / 1.333));
      vec3 outward = n - cosIncidence * v;
      float outwardLength = length(outward);
      vec3 sphereExit = outwardLength > 1e-4 ? eye * cos(deviation) - (outward / outwardLength) * sin(deviation) : eye;
      // Tube: keep the slope along the (vertical) axis, turn across it.
      vec3 axis = vec3(uCameraWorld[0].y, uCameraWorld[1].y, uCameraWorld[2].y);
      float along = dot(eye, axis);
      vec3 across = eye - along * axis;
      float acrossLength = max(length(across), 1e-4);
      vec3 acrossUnit = across / acrossLength;
      vec3 normalAcross = n - dot(n, axis) * axis;
      normalAcross /= max(length(normalAcross), 1e-4);
      float cosAcross = clamp(-dot(acrossUnit, normalAcross), 0.0, 1.0);
      float sinAcross = sqrt(1.0 - cosAcross * cosAcross);
      float index = sqrt(1.777 - along * along) / acrossLength;
      float turn = 2.0 * (asin(sinAcross) - asin(sinAcross / index));
      vec3 sideways = normalAcross + cosAcross * acrossUnit;
      float sidewaysLength = length(sideways);
      vec3 tubeExit = sidewaysLength > 1e-4 ? (acrossUnit * cos(turn) - (sideways / sidewaysLength) * sin(turn)) * acrossLength + along * axis : eye;
      vec3 exitView = normalize(mix(tubeExit, sphereExit, roundness));
      float bodyEye, bodyExit, bodyReflected;
      vec3 eyeLight = pondView(-worldV, sunWorld, bodyEye);
      vec3 exitLight = pondView(normalize((uCameraWorld * vec4(exitView, 0.0)).xyz), sunWorld, bodyExit);
      vec3 reflectedLight = pondView(reflect(-worldV, worldN), sunWorld, bodyReflected);
      vec3 under = texture2D(uScene, vUv).rgb - eyeLight;
      float carry = bodyEye > 0.01 ? 1.0 / bodyEye : 0.0;
      // A small round lens (a drop, or the bulb seen from afar) would only show
      // a speck of upside-down horizon: below about 6 pixels of radius it
      // fades to the plain surface shading.
      float lens = 1.0 - roundness * (1.0 - smoothstep(3.0, 6.0, columnRadius));
      refracted = mix(refracted, max(exitLight + under * bodyExit * carry, 0.0) * exp(-uAbsorb * thickness * 3.0), lens);
      reflected = mix(reflected, max(reflectedLight + under * bodyReflected * carry, 0.0), lens);
    }

    vec3 h = normalize(uSunDirView + v);
    float nDotH = max(dot(n, h), 0.0);
    float nDotL = max(dot(n, uSunDirView), 0.0);
    float a = 0.14 * 0.14;
    float a2 = a * a;
    float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
    float d = a2 / (PI * denominator * denominator);
    float vDotH = max(dot(v, h), 0.0);
    float fs = 0.02 + 0.98 * pow(1.0 - vDotH, 5.0);
    vec3 specular = uSunIrradiance * d * fs * nDotL * 0.25 / max(nDotV, 0.05);

    // Fine spray: drops only a few pixels wide have no usable surface, so they
    // are shaded as scattering points lit by the sky and, strongly, by the sun
    // when it is behind them (forward scattering through a drop). Drops smaller
    // than their impostor cover only part of the pixel.
    float pixelRadius = mix(info.g, columnRadius, column);
    float glint = info.b;
    // A column is one continuous surface, so it stays glass down to a couple
    // of pixels wide; drops turn to spray while they are still a few pixels.
    // Both limits are device pixels: a half-resolution fluid buffer must not
    // turn drops into spray at twice the size, nor let the impostor a drop is
    // widened to (uMinPixelRadius, in buffer pixels, so twice as wide on the
    // screen) keep the coverage floor it would have at full resolution: the
    // floor is scaled by the buffer pixel's area in device pixels.
    float devicePixelRadius = pixelRadius / uFluidScale;
    float sprayness = 1.0 - mix(smoothstep(1.5, 5.0, devicePixelRadius), smoothstep(1.0, 2.5, devicePixelRadius), column);
    float coverage = clamp(pixelRadius * pixelRadius / (uMinPixelRadius * uMinPixelRadius), 0.12 * uFluidScale * uFluidScale, 1.0);
    float forward = pow(clamp(0.5 - 0.5 * dot(v, uSunDirView), 0.0, 1.0), 6.0);
    vec3 sprayLight = uSkyAmbient * 1.2 + uSunIrradiance * (0.08 + 0.7 * forward);
    float scatter = 1.0 - exp(-thickness * 30.0);
    vec3 sprayColor = vec3(0.85, 0.88, 0.90) * sprayLight;
    vec3 surfaceColor = mix(refracted, reflected, fresnel) + specular + sprayColor * scatter * 0.25 * (1.0 - column);
    vec3 fluid = mix(surfaceColor, mix(scene, sprayColor, 0.6), sprayness);
    fluid += uSunIrradiance * glint * 1.5;
    // A sheet covers its pixels whatever its thickness (thin film reflects as
    // much as thick), so its alpha saturates within half a millimetre and
    // only softens edges.
    float alpha = (1.0 - exp(-thickness * mix(320.0, 5000.0, sheet))) * mix(1.0, coverage, sprayness);
    color = mix(scene, fluid, alpha);
    // A sheet is a glassy film, but its rippled surface scatters a little,
    // enough to whiten only where the view crosses a lot of water: the beaded
    // rim and torn edges, and walls seen edge-on.
    float sheetScatter = sheet * (1.0 - exp(-thickness * 80.0));
    color = mix(color, sprayColor, sheetScatter);
  }
  color = aces(color * uExposure / 0.6);
  gl_FragColor = vec4(linearToSrgb(color), 1.0);
}
`;
