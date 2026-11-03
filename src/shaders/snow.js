// GLSL for snow (src/snow.js): the flakes falling through two boxes about
// the eye, a near and a far (FLAKE_VERTEX, FLAKE_FRAGMENT). src/snow.js
// says what they are; its flakeAt is FLAKE_MOTION's twin on the CPU
// (tools/snow-probe.mjs checks it): change both together.
import { GALE_SURFACE } from './gale.js';

// A flake's place and velocity: its start in its box, carried by the wind
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
// into the box (driftOffset), the fall wrapped into it as 0.8 of the fall
// and a step of SPEED_SHARE of it (fallOffsets: a flake's speed step k
// adds k of the second), and the clock wrapped to CYCLE seconds
// (uCycleTime), every swing and gust a whole number of turns in it. Each
// box has its own offsets, wrapped into its own size.
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
void flakeMotion(vec4 flake, vec4 sway, vec3 box, vec3 driftOffset, vec2 fallOffsets, out vec3 place, out vec3 velocity) {
  float step = min(floor(flake.w * (SPEED_STEPS + 1.0)), SPEED_STEPS);
  float speed = 0.8 + SPEED_SHARE * step;
  vec3 start = vec3(flake.x, flake.z, flake.y) * box;
  float swayRate = cycleRate(mix(uSwayPeriods.x, uSwayPeriods.y, sway.z));
  vec2 swing = swayRate * uCycleTime + SNOW_TAU * sway.xy;
  float gustPeriod = GUST_PERIOD / mix(0.7, 1.3, sway.w);
  vec3 gustRate = vec3(cycleRate(gustPeriod), cycleRate(gustPeriod / 1.7), cycleRate(gustPeriod / 1.3));
  vec3 gust = gustRate * uCycleTime + vec3(0.0, 1.0, 2.0) + SNOW_TAU * 7.0 * sway.w;
  vec3 gustReach = uGust / gustRate.x * vec3(1.0, 0.4, 1.0);
  place = start + vec3(driftOffset.x, -(fallOffsets.x + step * fallOffsets.y), driftOffset.z)
    + uSway * vec3(sin(swing.x), 0.0, cos(swing.y))
    + gustReach * vec3(sin(gust.x), sin(gust.y), cos(gust.z));
  velocity = uDrift + vec3(0.0, -uFall * speed, 0.0)
    + uSway * swayRate * vec3(cos(swing.x), 0.0, -sin(swing.y))
    + gustReach * gustRate * vec3(cos(gust.x), cos(gust.y), -sin(gust.z));
}
`;

// The flakes: each at its own place and phase in one of two boxes about the
// eye, the near (uBox, lowered to reach the water when the eye is high) or
// the far (uFarBox, standing on the water: the snow seen beyond the near box,
// out to the far bank, thinner in flakes a cubic metre, src/snow.js FAR),
// wrapped round its box as the eye moves, and drawn as what it sweeps in
// uStreakSeconds (the eye's persistence): a capsule from where it is to
// where it was, as the eye sees it (the sweep across the line of sight, so
// a flake swept toward the eye is round, not edge-on), as wide as the flake or uMinPixels, whichever is wider, its
// opacity the share of that capsule the flake covers, so a flake keeps its
// light whether it is seen round (calm) or as a streak (a blizzard's). They
// fade near the eye, toward their box's faces (so the wrap is not seen; a
// far flake also fades in across the near box's faces, so the two boxes
// hand over without a seam), into the haze, and are cut at the water, on a
// gale's waves where it blows.
export const FLAKE_VERTEX = /* glsl */`
${GALE_SURFACE}
attribute vec4 aFlake;          // its place in the box (x, z), its phase down the box, its size (0 to 1)
attribute vec4 aSway;           // its swing's phases (x, z), its period (0 to 1), its gusts' phase and rate
attribute float aFar;           // 1 for a flake of the far box, 0 for one of the near
uniform float uCycleTime;       // s: the clock wrapped to CYCLE (Precision, above)
uniform vec3 uDriftOffset;      // m: the wind's carry, wrapped into the near box
uniform vec2 uFallOffsets;      // m: the fall at 0.8 of uFall, and at SPEED_SHARE of it, each wrapped into the near box
uniform vec3 uFarDriftOffset;   // m: the same, wrapped into the far box
uniform vec2 uFarFallOffsets;
uniform vec3 uBox;              // m: the near box
uniform vec3 uFarBox;           // m: the far box
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
varying float vOpacity;         // the flake's opacity at its thickest, for where it is: fades, haze and the capsule's share
varying vec2 vShape;            // across (−1 to 1) and along the capsule, in half its widths
varying float vReach;           // half the swept segment's length, in half widths
varying float vHeight;          // the point's height over the still water...
varying float vSurface;         // ...and the water's there
varying float vUp;              // how far up the flake's side facing the eye looks (−1 to 1): what it is lit by
varying float vHalfPixels;      // half the capsule's width in render-target pixels: the rim is drawn a pixel wide
varying vec3 vForm;             // the flake's form (FLAKE_FRAGMENT): its plate's squash now (0 to 1), its axis across the quad (radians), its lumps' phase
varying float vDensity;         // how much of what is behind its middle it hides (DENSITY_MIN to 1)
#define FAR_FLOOR 0.5           // m: the far box's floor under the still water
#define DENSITY_MIN 0.3         // the most translucent flake's opacity against the most opaque: a lacy dendrite against a rimed clump
#define SQUASH_MIN 0.5          // how narrow the most plate-like flake turns, seen edge-on, against its width
#define TUMBLE_PERIODS vec2(0.6, 1.6)   // s: a flake turns over in one of these (a tumbling plate's)
${FLAKE_MOTION}
// How far into a box's faces a point is: 0.5 at a face.
float boxReach(vec3 local, vec3 box) { return max(max(abs(local.x) / box.x, abs(local.z) / box.z), abs(local.y) / box.y); }
void main() {
  bool far = aFar > 0.5;
  vec3 box = far ? uFarBox : uBox;
  vec3 place, velocity;
  flakeMotion(aFlake, aSway, box, far ? uFarDriftOffset : uDriftOffset, far ? uFarFallOffsets : uFallOffsets, place, velocity);
  // The near box about the eye, but never wholly above the water: an eye high over it keeps the snow down to it.
  // The far box stands on the water about the eye: the snow beyond the near box, over the far water, the bank and the sky.
  vec3 nearCentre = vec3(cameraPosition.x, min(cameraPosition.y, 0.4 * uBox.y), cameraPosition.z);
  vec3 centre = far ? vec3(cameraPosition.x, 0.5 * uFarBox.y - FAR_FLOOR, cameraPosition.z) : nearCentre;
  vec3 local = mod(place - centre + 0.5 * box, box) - 0.5 * box;
  vec3 head = centre + local;
  vec3 tail = head - velocity * uStreakSeconds;
  vec3 viewHead = (viewMatrix * vec4(head, 1.0)).xyz;
  vec3 viewTail = (viewMatrix * vec4(tail, 1.0)).xyz;
  vec3 middle = 0.5 * (viewHead + viewTail);
  // The sweep as the eye sees it, across the line of sight (flakeDrawn's): a flake swept toward the eye is seen round.
  vec3 toward = middle / max(length(middle), 1e-6);
  vec3 swept = viewTail - viewHead;
  swept -= dot(swept, toward) * toward;
  float sweptLength = length(swept);
  vec3 along = sweptLength > 1e-7 ? swept / sweptLength : normalize(cross(toward, vec3(1.0, 0.0, 0.0)));
  vec3 across = cross(along, toward);
  float depth = max(-middle.z, 1e-3);
  float diameter = mix(uSizes.x, uSizes.y, aFlake.w * aFlake.w);   // more small flakes than large
  float width = max(diameter, uMinPixels * depth / uFocalPx);
  float halfWidth = 0.5 * width;
  float reach = 0.5 * sweptLength + halfWidth;
  float end = position.y * 2.0 - 1.0;
  vec3 point = middle + along * end * reach + across * position.x * halfWidth;
  float covered = diameter * diameter / (width * (sweptLength + width));
  // Its form, from its own numbers (the attributes' sums, wrapped: as random as they, the same every run):
  // how opaque it is, how much of a plate (how narrow it turns edge-on), how fast it tumbles, where its lumps lie.
  float density = mix(DENSITY_MIN, 1.0, fract(17.0 * aFlake.x + 31.0 * aSway.y + 7.0 * aFlake.z));
  float plate = mix(SQUASH_MIN, 0.9, fract(23.0 * aFlake.y + 13.0 * aSway.x + 29.0 * aSway.z));
  float tumbleRate = cycleRate(mix(TUMBLE_PERIODS.x, TUMBLE_PERIODS.y, fract(11.0 * aSway.w + 37.0 * aFlake.x)));
  float tilt = tumbleRate * uCycleTime + SNOW_TAU * fract(19.0 * aFlake.y + 43.0 * aSway.z);
  float squash = mix(plate, 1.0, abs(cos(tilt)));
  vForm = vec3(squash, SNOW_TAU * fract(41.0 * aSway.x + 5.0 * aFlake.w), SNOW_TAU * fract(47.0 * aFlake.z + 3.0 * aSway.y));
  vHalfPixels = halfWidth * uFocalPx / depth;
  float near = smoothstep(0.25, 1.0, depth);
  // A near flake fades toward its box's faces; a far one fades in across them (where the near box hands over) and out toward its own.
  float handover = smoothstep(0.35, 0.5, boxReach(head - nearCentre, uBox));
  float edge = (far ? handover : 1.0 - handover) * (far ? 1.0 - smoothstep(0.35, 0.5, boxReach(local, uFarBox)) : 1.0);
  float haze = exp(-uHazeDensity * depth);
  vDensity = density;
  vOpacity = -point.z > 0.05 ? uOpacity * covered * near * edge * haze : 0.0;
  vShape = vec2(position.x, end * reach / halfWidth);
  vReach = 0.5 * sweptLength / halfWidth;
  vHeight = mix(head.y, tail.y, position.y);
  vSurface = uGaleMetresPerUnit > 0.0 ? galeHeight(head.xz) : 0.0;
  vUp = -dot(toward, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  gl_Position = projectionMatrix * vec4(point, 1.0);
}
`;

// A flake is a white scatterer in the sky's light, so it can be no brighter
// than the cloud it falls from: lit from above by the cloud and from below
// by the ground, a white sphere's side facing the eye shows its albedo times
// the mean of what that side sees, the cloud's radiance weighted (1 + up)/2
// and the ground's (1 − up)/2 (a tilted plane under a uniform sky). Seen
// level it is about 0.6 of the cloud: grey against the sky, white against
// the dark water and the trees, as falling snow is; seen from above, when
// the eye looks down on the near water, brighter; from below, against the
// cloud, darker still (its underside). The sun's light, if any comes through
// the cloud, on its one side.
//
// Its form. To the eye a flake a metre off is sharp (a 4 mm pupil focused
// on the far bank blurs it by a few millimetres; the soft bokeh discs of a
// photograph are a camera's wide aperture), so its silhouette is drawn
// sharp, softened only by RIM_MIN of its radius (or a pixel, for the
// anti-aliasing: a flake under a few pixels across is all rim, a soft dot).
// Its body is a ball of crystals, thick in the middle and thin at the rim,
// hiding 1 − (1 − density)^thickness of what is behind it: an opaque clump
// is flat white to near its edge, a lacy one a soft veil that lets the
// water through. No two are alike: each has its own density (vDensity,
// DENSITY_MIN to 1), its rim lumped (LUMPS of its radius, three lumps and
// five about it, at its own phase: a clump, not a disc or a triangle), and
// it is a plate turning over as it falls (vForm.x: squashed across its own
// axis toward its edge-on width and back once or twice a second), so the
// fall glitters as a real one does, each flake brightening and dimming as
// it turns. A streak (a blizzard's flake, swept many widths) keeps its
// capsule: the form fades out with the sweep.
export const FLAKE_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform vec3 uSunDir;
varying float vOpacity;
varying vec2 vShape;
varying float vReach;
varying float vHeight;
varying float vSurface;
varying float vUp;
varying float vHalfPixels;
varying vec3 vForm;
varying float vDensity;
#define FLAKE_ALBEDO 0.9     // a wet aggregate's; fresh snow's is 0.8 to 0.9
#define GROUND_LIGHT 0.4     // the ground's radiance in the cloud's: the dark pond (a tenth) among its snowy banks (0.8)
#define FLAKE_SUN 0.3        // the sun's light, on its one side
#define RIM_MIN 0.5          // the silhouette's softness, as a share of the radius, at least (a pixel otherwise): a clump's fluffy edge
#define LUMPS vec2(0.09, 0.05)   // the rim's lumps, as a share of the radius: three about it and five
void main() {
  if (vHeight < vSurface || vOpacity <= 0.0) discard;
  // The capsule's round cap, in half widths, turned to the flake's axis and squashed across it as its plate turns.
  float roundness = 1.0 / (1.0 + vReach);   // a still flake keeps its form; a streak its capsule
  vec2 cap = vec2(vShape.x, sign(vShape.y) * max(abs(vShape.y) - vReach, 0.0));
  vec2 axis = vec2(cos(vForm.y), sin(vForm.y));
  vec2 turned = vec2(dot(cap, axis), cap.y * axis.x - cap.x * axis.y);
  turned.y /= mix(1.0, vForm.x, roundness);
  float angle = atan(turned.y, turned.x);
  float distance = length(turned) * (1.0 + roundness * (LUMPS.x * cos(3.0 * angle + vForm.z) + LUMPS.y * cos(5.0 * angle - 2.0 * vForm.z)));
  float rim = clamp(1.0 / max(vHalfPixels, 1e-3), RIM_MIN, 1.0);
  // A ball of crystals: thick in the middle, thin at its rim, hiding 1 − (1 − density)^thickness of what is behind it.
  float thickness = sqrt(max(1.0 - distance * distance, 0.0));
  float body = 1.0 - pow(1.0 - vDensity, thickness);
  float alpha = vOpacity * body * (1.0 - smoothstep(1.0 - rim, 1.0, distance));
  if (alpha < 0.002) discard;
  float lit = mix(GROUND_LIGHT, 1.0, 0.5 * (1.0 + vUp));
  vec3 light = FLAKE_ALBEDO * uSkyAmbient * lit + uSunIrradiance * max(uSunDir.y, 0.0) * FLAKE_SUN;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;
