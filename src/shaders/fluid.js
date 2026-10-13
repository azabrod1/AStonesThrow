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

export const PARTICLE_VERTEX = /* glsl */`
attribute vec3 iPosition;
attribute float iRadius;
attribute vec3 iVelocity;
uniform float uProjScale;        // pixels per world unit at distance 1
uniform float uMinPixelRadius;
uniform float uStreakSeconds;
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;
varying float vPixelRadius;
varying float vStretch;          // half-length of the capsule in radii (1 = sphere)
varying vec2 vAxis;              // screen-space motion direction (view xy)
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
  vec2 perpendicular = vec2(-axis.y, axis.x);
  vec2 offset = (axis * position.x * stretch + perpendicular * position.y) * radius;
  vQuad = position.xy;
  vViewCentre = viewCentre.xyz;
  vRadius = radius;
  vPixelRadius = pixelRadius;
  vStretch = stretch;
  vAxis = axis;
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
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;
varying float vPixelRadius;
varying float vStretch;
varying vec2 vAxis;
${CAPSULE}
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
uniform vec2 uDirection;       // one texel step along the blur axis, in uv
uniform float uProjScale;
uniform float uBlurWorld;      // merging distance in metres
varying vec2 vUv;
void main() {
  float centre = texture2D(uDepth, vUv).r;
  if (centre <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
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
varying vec2 vUv;
#define PI 3.141592653589793

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
    if (dot(n, n) < 1e-12) n = vec3(0.0, 0.0, 1.0);
    n = normalize(n);
    if (n.z < 0.0) n = -n;

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
    vec3 info = texture2D(uFluidInfo, vUv).rgb;
    float pixelRadius = info.g;
    float glint = info.b;
    float sprayness = 1.0 - smoothstep(1.5, 5.0, pixelRadius);
    float coverage = clamp(pixelRadius * pixelRadius / (uMinPixelRadius * uMinPixelRadius), 0.12, 1.0);
    float forward = pow(clamp(0.5 - 0.5 * dot(v, uSunDirView), 0.0, 1.0), 6.0);
    vec3 sprayLight = uSkyAmbient * 1.2 + uSunIrradiance * (0.08 + 0.7 * forward);
    float scatter = 1.0 - exp(-thickness * 30.0);
    vec3 sprayColor = vec3(0.85, 0.88, 0.90) * sprayLight;
    vec3 surfaceColor = mix(refracted, reflected, fresnel) + specular + sprayColor * scatter * 0.25;
    vec3 fluid = mix(surfaceColor, mix(scene, sprayColor, 0.6), sprayness);
    fluid += uSunIrradiance * glint * 1.5;
    float alpha = (1.0 - exp(-thickness * 320.0)) * mix(1.0, coverage, sprayness);
    color = mix(scene, fluid, alpha);
  }
  color = aces(color * uExposure / 0.6);
  gl_FragColor = vec4(linearToSrgb(color), 1.0);
}
`;
