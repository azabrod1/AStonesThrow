// GLSL for snow (src/snow.js): the flakes falling through a box about the
// eye (FLAKE_VERTEX, FLAKE_FRAGMENT). src/snow.js says what they are; its
// flakeAt is FLAKE_MOTION's twin on the CPU (tools/snow-probe.mjs checks it):
// change both together.
import { GALE_SURFACE } from './gale.js';

// A flake's place and velocity: its start in the box, carried by the wind
// (uDrift) and falling at its terminal speed (uFall times one of SPEED_STEPS
// + 1 speeds from 0.8 to 1.2, flake by flake), swinging from side to side on
// an ellipse of uSway metres once every period between uSwayPeriods (a
// falling flake's flutter), and tossed by the wind's gusts (uGust, m/s, about
// GUST_PERIOD seconds), which carry it as the air does: a flake weighs
// nothing to the air. The swing and the gusts are sines, so they average
// out: on average a flake goes with the wind and falls at its speed.
//
// Precision. The clock runs on for as long as the page is open, and a
// blizzard's flakes drift 12 m/s: after an hour, 43 km from where they
// started, where a float holds millimetres. So the shader never multiplies
// the clock: src/snow.js works out, in doubles, the wind's carry wrapped
// into the box (uDriftOffset), the fall wrapped into it as 0.8 of the fall
// and a step of SPEED_SHARE of it (uFallOffsets: a flake's speed step k
// adds k of the second), and the clock wrapped to CYCLE seconds
// (uCycleTime), every swing and gust a whole number of turns in it.
export const SPEED_STEPS = 16;
export const SPEED_SHARE = 0.4 / SPEED_STEPS;
export const CYCLE = 60;            // seconds: every swing and gust repeats in it
export const FLAKE_MOTION = /* glsl */`
#define SNOW_TAU 6.283185307179586
#define SPEED_STEPS ${SPEED_STEPS.toFixed(1)}
#define SPEED_SHARE ${SPEED_SHARE}
#define CYCLE ${CYCLE.toFixed(1)}
#define GUST_PERIOD 2.4
// A rate of about 2π/period, a whole number of turns in CYCLE.
float cycleRate(float period) { return SNOW_TAU / CYCLE * max(floor(CYCLE / period + 0.5), 1.0); }
void flakeMotion(vec4 flake, vec4 sway, out vec3 place, out vec3 velocity) {
  float step = min(floor(flake.w * (SPEED_STEPS + 1.0)), SPEED_STEPS);
  float speed = 0.8 + SPEED_SHARE * step;
  vec3 start = vec3(flake.x, flake.z, flake.y) * uBox;
  float swayRate = cycleRate(mix(uSwayPeriods.x, uSwayPeriods.y, sway.z));
  vec2 swing = swayRate * uCycleTime + SNOW_TAU * sway.xy;
  float gustPeriod = GUST_PERIOD / mix(0.7, 1.3, sway.w);
  vec3 gustRate = vec3(cycleRate(gustPeriod), cycleRate(gustPeriod / 1.7), cycleRate(gustPeriod / 1.3));
  vec3 gust = gustRate * uCycleTime + vec3(0.0, 1.0, 2.0) + SNOW_TAU * 7.0 * sway.w;
  vec3 gustReach = uGust / gustRate.x * vec3(1.0, 0.4, 1.0);
  place = start + vec3(uDriftOffset.x, -(uFallOffsets.x + step * uFallOffsets.y), uDriftOffset.z)
    + uSway * vec3(sin(swing.x), 0.0, cos(swing.y))
    + gustReach * vec3(sin(gust.x), sin(gust.y), cos(gust.z));
  velocity = uDrift + vec3(0.0, -uFall * speed, 0.0)
    + uSway * swayRate * vec3(cos(swing.x), 0.0, -sin(swing.y))
    + gustReach * gustRate * vec3(cos(gust.x), cos(gust.y), -sin(gust.z));
}
`;

// The flakes: each at its own place and phase in a box of uBox metres about
// the eye (lowered to reach the water when the eye is high), wrapped round
// it as the eye moves, and drawn as what it sweeps in
// uStreakSeconds (the eye's persistence): a capsule from where it is to
// where it was, as wide as the flake or uMinPixels, whichever is wider, its
// opacity the share of that capsule the flake covers, so a flake keeps its
// light whether it is seen round (calm) or as a streak (a blizzard's). They
// fade near the eye, toward the box's faces (so the wrap is not seen), into
// the haze, and are cut at the water, on a gale's waves where it blows.
export const FLAKE_VERTEX = /* glsl */`
${GALE_SURFACE}
attribute vec4 aFlake;          // its place in the box (x, z), its phase down the box, its size (0 to 1)
attribute vec4 aSway;           // its swing's phases (x, z), its period (0 to 1), its gusts' phase and rate
uniform float uCycleTime;       // s: the clock wrapped to CYCLE (Precision, above)
uniform vec3 uDriftOffset;      // m: the wind's carry, wrapped into the box
uniform vec2 uFallOffsets;      // m: the fall at 0.8 of uFall, and at SPEED_SHARE of it, each wrapped into the box
uniform vec3 uBox;
uniform vec3 uDrift;            // m/s: the wind
uniform float uFall;            // m/s: the flakes' terminal speed
uniform float uSway;            // m: the swing's reach
uniform vec2 uSwayPeriods;      // s: the swing's shortest and longest period
uniform float uGust;            // m/s: the gusts' speed
uniform vec2 uSizes;            // m: the smallest and largest flake across
uniform float uStreakSeconds;
uniform float uFocalPx;         // render-target pixels per unit tan
uniform float uMinPixels;
uniform float uOpacity;
uniform float uHazeDensity;     // the haze (src/sky.js): a flake far off fades into it
varying float vAlpha;
varying vec2 vShape;            // across (−1 to 1) and along the capsule, in half its widths
varying float vReach;           // half the swept segment's length, in half widths
varying float vHeight;          // the point's height over the still water...
varying float vSurface;         // ...and the water's there
${FLAKE_MOTION}
void main() {
  vec3 place, velocity;
  flakeMotion(aFlake, aSway, place, velocity);
  // The box about the eye, but never wholly above the water: an eye high over it keeps the snow down to it.
  vec3 centre = vec3(cameraPosition.x, min(cameraPosition.y, 0.4 * uBox.y), cameraPosition.z);
  vec3 local = mod(place - centre + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 head = centre + local;
  vec3 tail = head - velocity * uStreakSeconds;
  vec3 viewHead = (viewMatrix * vec4(head, 1.0)).xyz;
  vec3 viewTail = (viewMatrix * vec4(tail, 1.0)).xyz;
  vec3 middle = 0.5 * (viewHead + viewTail);
  vec3 swept = viewTail - viewHead;
  float sweptLength = length(swept);
  vec3 along = sweptLength > 1e-7 ? swept / sweptLength : vec3(0.0, 1.0, 0.0);
  vec3 across = cross(along, middle);
  float acrossLength = length(across);
  across = acrossLength > 1e-9 ? across / acrossLength : vec3(1.0, 0.0, 0.0);
  float depth = max(-middle.z, 1e-3);
  float diameter = mix(uSizes.x, uSizes.y, aFlake.w * aFlake.w);   // more small flakes than large
  float width = max(diameter, uMinPixels * depth / uFocalPx);
  float halfWidth = 0.5 * width;
  float reach = 0.5 * sweptLength + halfWidth;
  float end = position.y * 2.0 - 1.0;
  vec3 point = middle + along * end * reach + across * position.x * halfWidth;
  float covered = diameter * diameter / (width * (sweptLength + width));
  float near = smoothstep(0.25, 1.0, depth);
  float edge = 1.0 - smoothstep(0.35, 0.5, max(max(abs(local.x) / uBox.x, abs(local.z) / uBox.z), abs(local.y) / uBox.y));
  float haze = exp(-uHazeDensity * depth);
  vAlpha = -point.z > 0.05 ? uOpacity * covered * near * edge * haze : 0.0;
  vShape = vec2(position.x, end * reach / halfWidth);
  vReach = 0.5 * sweptLength / halfWidth;
  vHeight = mix(head.y, tail.y, position.y);
  vSurface = uGaleMetresPerUnit > 0.0 ? galeHeight(head.xz) : 0.0;
  gl_Position = projectionMatrix * vec4(point, 1.0);
}
`;

// A flake is a white scatterer: it shows the sky's light (and the sun's, if
// any comes through the cloud), so it is white against the dark water and
// the trees and grey against the bright cloud, as falling snow is.
export const FLAKE_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform vec3 uSunDir;
varying float vAlpha;
varying vec2 vShape;
varying float vReach;
varying float vHeight;
varying float vSurface;
#define FLAKE_SKY 1.5      // the sky's light on a white flake, lit all round
#define FLAKE_SUN 0.3      // and the sun's, on its one side
void main() {
  if (vHeight < vSurface || vAlpha <= 0.0) discard;
  float distance = length(vec2(vShape.x, max(abs(vShape.y) - vReach, 0.0)));
  float alpha = vAlpha * (1.0 - smoothstep(0.0, 1.0, distance));   // soft: a flake's lace thins to its edge
  if (alpha < 0.002) discard;
  vec3 light = uSkyAmbient * FLAKE_SKY + uSunIrradiance * max(uSunDir.y, 0.0) * FLAKE_SUN;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;
