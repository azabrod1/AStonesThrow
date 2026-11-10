// White water (src/whiteWater.js): the opaque churn where a stream of water
// comes down on the pond, drawn as puffs flown in this shader.
//
// A puff is one instanced quad standing towards the eye, written once (its
// birth, place and velocity on still water, its life, its diameter at birth
// and at death, its drag's response time τ and its seed) and flown in closed
// form: under linear drag towards a fall of g·τ,
//   x(t) = x₀ + τ·v₀·(1 − e^(−t/τ)),   y(t) = y₀ + τ·(v₀ + g·τ)·(1 − e^(−t/τ)) − g·τ·t,
// held on the surface once it comes back down to it (it sinks into the churn
// there) and within the pool's walls (uWalls), its diameter swelling from
// the one to the other as the square root of its age. The quad stands
// WHITE_FRONT of its radius towards the eye, the front of the heap, so seen
// from above it is never in the water's plane; seen from the side it stands
// WHITE_FLAT as high as it is wide (a heap on the water is lower than it is
// wide), from above it is round; under a gale it is lifted by the surface
// under its centre (galeHeight, src/shaders/gale.js).
//
// Its shape is a heap of lumps, never a disc or a ball: a density on the
// quad, the heap (a core and four lumps round it, vLump*, each a Gaussian
// mound, summed so they merge without creases, the lumps turning about the
// core at the puff's own spin, throbbing and drifting out as it ages), times
// a froth of four octaves of value noise turning with them (WHITE_FROTH of
// it), plus the same froth beside it (WHITE_RAG), so the rim, where the heap
// thins, is shredded into scraps, plus fingers over the rim (WHITE_FINGERS:
// noise round the centre, fast across the angle and slow along the radius,
// so they streak outward, as a splash's rim tears into ligaments); its edge
// is where the density passes WHITE_FROM. A cumulus's outline (the heap with
// the froth alone) read as a cloud; the torn rim reads as a splash. It comes
// in at once (WHITE_IN of its life) and goes as white water does, not by
// fading but by breaking up: its edge is eaten in, the density it starts at
// rising by WHITE_ERODE from WHITE_ERODE_FROM of its life, until only scraps
// are left, and they go over its last WHITE_OUT. Below WHITE_FOOT of its
// radius over the still water it thins to nothing, so its foot meets the
// water softly (the water hides what is under it anyway).
//
// Its edge is soft (WHITE_SOFT) and it is thinner as it swells (WHITE_DILUTE:
// the same water over a wider puff), so many of them overlap into one plume,
// dense at its foot and mist at its end, rather than read one by one. And a
// fast one is drawn out along its way on the screen by as far as it flies in
// WHITE_SMEAR (what an exposure smears; thinner as it is longer): white
// water thrown off at metres a second is seen as streaks, not lumps.
//
// It is lit as the foam on the water is (FOAM_ALBEDO and FOAM_SKY_LIGHT in
// src/shaders/scene.js), so the two are one white; a dense scatterer, it is
// nearly opaque and as bright as the foam, never a grey haze. Its normal is
// the density's slope (the heap's, WHITE_RELIEF, and the froth's grain,
// WHITE_GRAIN, from the noise's own gradient), so its lumps and grain catch
// the sun: half-Lambert (light goes round a scattering lump's limb), and
// through its thin parts when seen against the sun (WHITE_THROUGH); the sky's
// light less on its underside, which sees the water; its hollows, where the
// froth is thin, and its foot, wet and in its own shade, darker.
import { GALE_SURFACE } from './gale.js';

export const WHITE_WATER_VERTEX = /* glsl */`
${GALE_SURFACE}
#define WHITE_GRAVITY 9.81
#define WHITE_FRONT 0.8      // the quad stands this share of its radius towards the eye
#define WHITE_SPIN 5.0       // rad/s: the lumps turn about the core at up to this, either way
#define WHITE_FLAT 0.7       // its height over its width, seen from the side
#define WHITE_SMEAR 0.025    // s: a puff is drawn out along its way by as far as it flies in this (what an exposure smears)...
#define WHITE_DILUTE 1.2      // a puff's opacity falls as its width to minus this
#define WHITE_SMEAR_MOST 3.0 // ...to at most this many times its width, and thinner as it is longer
attribute vec4 aOrigin;      // x, y, z on still water at birth, and the splash time it was born
attribute vec4 aLaunch;      // its velocity then (m/s), and its life (s)
attribute vec4 aShape;       // its diameter at birth and at death (m), its drag's response time τ (s), its seed (0 to 1)
uniform float uTime;         // splash seconds
uniform vec4 uWalls;         // the pool's walls: min x, max x, min z, max z (far off on the lake)
uniform vec3 uSunDir;
varying vec2 vOffset;        // the quad's corner, −1 to 1
varying float vAge;          // the share of its life gone
varying float vThin;         // what its smear leaves of its opacity
varying float vHeight;       // the point's height over still water, in radii
varying vec3 vChurn;         // the grain's turn (rad) and its offset
varying vec3 vSunView;       // the sun's direction and up, in view space
varying vec3 vUpView;
varying vec4 vLumpX;         // the four lumps round the core: their centres on the quad...
varying vec4 vLumpY;
varying vec4 vLumpR;         // ...and their radii

float whiteHash(float seed, float salt) { return fract(sin(seed * 91.7 + salt * 47.3) * 43758.5453); }

void main() {
  float age = uTime - aOrigin.w;
  float life = aLaunch.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float share = age / life;
  float tau = aShape.z;
  float fall = WHITE_GRAVITY * tau;
  float decay = 1.0 - exp(-age / tau);
  vec3 centre = aOrigin.xyz + vec3(aLaunch.x, aLaunch.y + fall, aLaunch.z) * tau * decay;
  centre.y = max(centre.y - fall * age, 0.0);
  float radius = 0.5 * mix(aShape.x, aShape.y, sqrt(share));
  centre.xz = clamp(centre.xz, uWalls.xz + 0.5 * radius, uWalls.yw - 0.5 * radius);
  // The eye's axes in the world (the view matrix's rows).
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 back = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  // Wider than it stands: seen from the side its height is WHITE_FLAT of its width; from above it is round.
  // Drawn out along its way on the screen (WHITE_SMEAR): fast white water is seen as streaks, not as lumps.
  vec3 velocity = vec3(aLaunch.x, aLaunch.y + fall, aLaunch.z) * (1.0 - decay) - vec3(0.0, fall, 0.0);
  vec2 way = vec2(dot(velocity, right), dot(velocity, up));
  float pace = length(way);
  float smear = min(1.0 + pace * WHITE_SMEAR / radius, WHITE_SMEAR_MOST);
  vec2 corner = vec2(position.x, position.y * mix(1.0, WHITE_FLAT, abs(up.y)));
  if (pace > 1e-4) { way /= pace; corner += way * dot(corner, way) * (smear - 1.0); }
  // Thinner too as it swells: the same water over a wider puff, so the plume is dense at its foot and mist at its end.
  vThin = inversesqrt(smear) * pow(aShape.x / (2.0 * radius), WHITE_DILUTE);
  vec3 point = centre + (right * corner.x + up * corner.y + back * WHITE_FRONT) * radius;
  vHeight = point.y / radius;
  if (uGaleMetresPerUnit > 0.0) point.y += galeHeight(centre.xz);
  gl_Position = projectionMatrix * viewMatrix * vec4(point, 1.0);
  vOffset = position.xy;
  vAge = share;
  // The lumps: four round the core at their own angles, turning at the puff's spin, drifting out as it ages and throbbing.
  float seed = aShape.w;
  float spin = (whiteHash(seed, 1.0) - 0.5) * 2.0 * WHITE_SPIN * age;
  vec4 draw = vec4(whiteHash(seed, 2.0), whiteHash(seed, 3.0), whiteHash(seed, 4.0), whiteHash(seed, 5.0));
  vec4 angle = vec4(0.0, 1.5708, 3.1416, 4.7124) + seed * 6.2832 + (draw - 0.5) * 1.2 + spin;
  vec4 reach = (0.28 + 0.16 * draw.yzwx) * (1.0 + 0.2 * share);
  vLumpX = cos(angle) * reach;
  vLumpY = sin(angle) * reach + 0.05;
  vLumpR = (0.24 + 0.12 * draw.wxyz) * (1.0 + 0.12 * sin(age * vec4(9.0, 11.0, 13.0, 7.0) + draw * 6.2832));
  vChurn = vec3(spin * 0.6, seed * 37.0, seed * 53.0);
  vSunView = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
  vUpView = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
}
`;

export const WHITE_WATER_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform float uOpacity;
varying vec2 vOffset;
varying float vAge;
varying float vThin;
varying float vHeight;
varying vec3 vChurn;
varying vec3 vSunView;
varying vec3 vUpView;
varying vec4 vLumpX;
varying vec4 vLumpY;
varying vec4 vLumpR;
#define WHITE_ALBEDO vec3(0.9, 0.92, 0.93)   // FOAM_ALBEDO (src/shaders/scene.js)
#define WHITE_SKY_LIGHT 1.5                  // FOAM_SKY_LIGHT
#define WHITE_CORE 0.45       // the core lump's radius on the quad
#define WHITE_LUMP 0.55       // the four lumps' height against the core's
#define WHITE_FROTH 0.45      // the froth's swing about the heap's density, as a share of it...
#define WHITE_RAG 0.2         // ...and beside it, so the rim, where the heap is thin, is shredded into scraps
#define WHITE_FINGERS 0.2    // the rim's fingers: torn outward, they streak away from the centre
#define WHITE_FINGER_COUNT 5.0  // the circle's radius in the noise's cells: some fifteen fingers round a puff
#define WHITE_THROUGH 0.6     // the sun's light through its thin parts, seen against it
#define WHITE_RELIEF 0.35     // how steeply the heap's lumps stand, for their light...
#define WHITE_GRAIN 0.12      // ...and the froth's grain
#define WHITE_FROM 0.12       // the density the edge starts at...
#define WHITE_SOFT 1.1       // ...and its width
#define WHITE_IN 0.04
#define WHITE_ERODE_FROM 0.15
#define WHITE_ERODE 0.8
#define WHITE_OUT 0.55
#define WHITE_FOOT 0.25

float whiteNoiseHash(vec2 point) {
  vec3 mixed = fract(vec3(point.xyx) * 0.1031);
  mixed += dot(mixed, mixed.yzx + 33.33);
  return fract((mixed.x + mixed.y) * mixed.z);
}
// Value noise and its gradient (x the value, yz the gradient).
vec3 whiteNoise(vec2 point) {
  vec2 cell = floor(point), within = fract(point);
  vec2 smoothed = within * within * (3.0 - 2.0 * within), slope = 6.0 * within * (1.0 - within);
  float corner = whiteNoiseHash(cell), alongX = whiteNoiseHash(cell + vec2(1.0, 0.0)) - corner;
  float alongY = whiteNoiseHash(cell + vec2(0.0, 1.0)) - corner, twist = whiteNoiseHash(cell + vec2(1.0, 1.0)) - corner - alongX - alongY;
  return vec3(corner + alongX * smoothed.x + alongY * smoothed.y + twist * smoothed.x * smoothed.y,
              slope * vec2(alongX + twist * smoothed.y, alongY + twist * smoothed.x));
}

void main() {
  vec2 offset = vOffset;
  // The heap: the core and four lumps, each a Gaussian mound, summed (so they merge without creases).
  vec4 apartX = offset.x - vLumpX, apartY = offset.y - vLumpY;
  vec4 lumps = WHITE_LUMP * exp(-(apartX * apartX + apartY * apartY) / (vLumpR * vLumpR));
  float core = exp(-dot(offset, offset) / (WHITE_CORE * WHITE_CORE));
  float heap = core + lumps.x + lumps.y + lumps.z + lumps.w;
  vec2 heapSlope = -2.0 * (core * offset / (WHITE_CORE * WHITE_CORE) + vec2(dot(lumps, apartX / (vLumpR * vLumpR)), dot(lumps, apartY / (vLumpR * vLumpR))));
  // The froth: a turbulent grain of four octaves, turning with the lumps and spreading out as the puff swells.
  float turnCos = cos(vChurn.x), turnSin = sin(vChurn.x);
  float spreading = 1.0 - 0.3 * vAge;
  vec2 turned = vec2(turnCos * offset.x - turnSin * offset.y, turnSin * offset.x + turnCos * offset.y) * spreading;
  vec3 grain = 0.45 * whiteNoise(turned * 3.0 + vChurn.y) * vec3(1.0, 3.0, 3.0)
             + 0.28 * whiteNoise(turned * 7.0 + vChurn.z) * vec3(1.0, 7.0, 7.0)
             + 0.17 * whiteNoise(turned * 15.0 + vChurn.y + vChurn.z) * vec3(1.0, 15.0, 15.0)
             + 0.10 * whiteNoise(turned * 31.0 - vChurn.y) * vec3(1.0, 31.0, 31.0);
  // Back from the turned grain to the quad: the gradient turned back.
  vec2 grainSlope = spreading * vec2(turnCos * grain.y + turnSin * grain.z, -turnSin * grain.y + turnCos * grain.z);
  float swing = 2.0 * (grain.x - 0.5);
  // The fingers: noise round a circle in the noise's plane (fast across the angle, slow along the radius, which
  // only widens the circle), so they run outward; they grow over the rim, where the heap thins.
  float fromCentre = length(offset);
  vec2 around = offset / max(fromCentre, 1e-3);
  float fingers = whiteNoise(around * (WHITE_FINGER_COUNT + 1.5 * fromCentre - vAge) + vChurn.z).x;
  float rim = smoothstep(0.25, 0.9, fromCentre);
  float density = heap * (1.0 + WHITE_FROTH * swing) + WHITE_RAG * swing + WHITE_FINGERS * rim * 2.0 * (fingers - 0.5);
  vec2 slope = WHITE_RELIEF * heapSlope + WHITE_GRAIN * 2.0 * (WHITE_FROTH * heap + WHITE_RAG) * grainSlope;
  float erode = WHITE_FROM + WHITE_ERODE * smoothstep(WHITE_ERODE_FROM, 1.0, vAge);
  float alpha = smoothstep(erode, erode + WHITE_SOFT, density);
  alpha *= smoothstep(0.0, WHITE_IN, vAge) * (1.0 - smoothstep(1.0 - WHITE_OUT, 1.0, vAge));
  alpha *= smoothstep(0.0, WHITE_FOOT, vHeight) * uOpacity * vThin;
  if (alpha < 0.003) discard;
  // Lit as the foam on the water is, a dense scatterer: the sun on the froth's lumps as half-Lambert (light goes
  // round a scattering lump's limb), through its thin parts when seen against the sun, the sky less on its
  // underside, its hollows in their own shade, its foot darker.
  vec3 normal = normalize(vec3(-slope, 1.0));
  float facing = 0.5 + 0.5 * dot(normal, vSunView);
  float thin = 1.0 - smoothstep(erode, erode + 1.0, density);
  float sun = facing * facing + WHITE_THROUGH * thin * max(-vSunView.z, 0.0);
  float sky = 0.75 + 0.25 * dot(normal, vUpView);
  float hollow = mix(0.75, 1.0, smoothstep(erode, erode + 0.6, density));
  float foot = mix(0.8, 1.0, smoothstep(0.0, 0.8, vHeight));
  vec3 light = WHITE_ALBEDO * (uSunIrradiance * sun + uSkyAmbient * WHITE_SKY_LIGHT * sky) * hollow * foot;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;
