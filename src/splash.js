// The splash: droplets, bubbles, and the passes that draw the droplets as water.
//
// A stone entering water goes through stages with known timing, and the
// droplets are choreographed from them rather than solved for:
//   1. Crown: the contact line throws a little fast, fine spray, then a thin
//      sheet rises from the lip of the stone's cavity (stage 2), biased in the
//      direction of travel (src/crown.js). Its rim thickens into a bead, goes
//      wavy and sheds drops from the crests; after a few tens of milliseconds
//      the sheet tears from the rim down into droplets carrying its local
//      velocity. A thrown stone enters obliquely, θ about 40 to 55° from
//      vertical, and once more than FAN_THRESHOLD of the entry speed is
//      horizontal a forward fan comes first: a thin fast sheet over the sector
//      ahead, launched from the lip's forward side, low and mostly forward,
//      tearing into fine spray (CrownSheet with `fan`), at a strength growing
//      to full at FAN_FULL.
//   2. Cavity: the stone opens an air-filled hole behind it (src/cavity.js), a
//      closed form in depth and time drawn as a hole in the water surface, its
//      lip lifted around it and the stone at its bottom; an oblique stone's is
//      sheared along its path. It pinches off (deep seal) about 2.1·sqrt(R/g)
//      seconds after entry, almost independently of entry speed (Duclaux et
//      al. 2007), at about half the stone's depth then; the hole above the neck
//      collapses from the bottom up, and the surface closes to a mound
//      0.4·sqrt(R/g) later. The cavity splat (stampCavity) is the ring's
//      source: a downward push and a shallow depression. An oblique entry drags
//      it forward: besides the entry splat, one or two more where the stone is
//      one and two radii down its path (R·tan θ apart, at most
//      PATH_SLOPE_CAP·R), as it gets there and weaker; and each runs forward by
//      the horizontal fraction, so the ring is stronger ahead than behind.
//      Their foam is the air the hole held: it comes when the hole closes.
//   3. Worthington jet: where and when the hole closes, a narrow glassy column
//      fires up (src/jet.js), tip first and fastest, so it stretches as it
//      rises. A bulb at its tip pinches off into one to three large drops, then
//      the column breaks from the top down into drops about twice its local
//      radius while its slow base falls back into a mound that throws a
//      small secondary ring. After an oblique entry it leans back along the
//      stone's path by JET_LEAN·θ (at most JET_LEAN_CAP) and, from a dragged cavity,
//      is slower by JET_OBLIQUE_SLOWING times the horizontal fraction.
//   4. Bubbles entrained with the stone follow it down its path, rise and
//      burst into foam.
// Each stage also stamps the height field and the foam map. A stone falling
// straight in makes none of the oblique parts.
//
// Foam. The map keeps two kinds (src/spectralWater.js): a boil, big bubbles,
// dense and popping within a second (BOIL_LIFETIME), and a raft, the small
// bubbles left, sparse and lasting seconds (raftLifetime, longer the bigger
// the stone). Where the hole closes its air comes up over FOAM_SPREAD·sqrt(R/g)
// as both, the boil over about the mouth, the raft wider; the jet rises from
// a boil of its own, and where it falls back it stamps both again
// (fallBackFoam: src/jet.js meets the water through columnWater, which hands
// its foam to the splash). Each is a patch of three to five sub-stamps of
// unequal radii at random offsets (stampFoamPatch), never one Gaussian, drawn
// from a random sequence of the foam's own (foamRandom), so no two rafts share
// a shape and the foam shifts no other draw. Surfacing bubbles fizz, a faint
// boil each, and a landing drop leaves a small boil of its own. Two surface flows per stone
// carry it (addFoamFlow): the jet's base welling up where the hole closed
// (CLOSURE_FLOW) and the mound spreading where the jet falls back
// (FALLBACK_FLOW), each sweeping the foam out of a disc into a ring and arcs
// over FLOW_DECAY·sqrt(R/g); and the wind drifts it all (setWind).
//
// Drops ring the water where they land, and a large one (LANDING_CROWN_RADIUS
// and up: the jet's tip and breakup drops, the crown's biggest) that has
// flown at least LANDING_CROWN_FLIGHT and falls at LANDING_CROWN_SPEED or
// more throws a small crown of its own, a CrownSheet with the drop's radius
// and speed (at most MAX_LANDING_CROWNS alive; the rest, and smaller drops,
// kick up a few droplets instead).
//
// Foam specks (src/foamSpecks.js) are the grain of the foam a splash leaves:
// a patch where the crown's base was once it has gone, one where the jet
// falls back, a few where each drop lands (by its size) and one where each
// bubble surfaces. They ride the surface for 2 to 8 s.
//
// How the splash scales with the stone's radius R, against s = R / 3 cm (the
// size the constants were tuned at) and the entry speed V. Wherever the
// physics allows it scales as a Froude-similar splash does, lengths with R,
// times with sqrt(R/g) and speeds with V; the sheets' own scaling is in
// src/crown.js, the jet's in src/jet.js.
//   - The crown's and the fan's droplet counts go as s^DROPLET_COUNT_POWER ·
//     sqrt(V / 6 m/s) and their drops' radii as s^0.5 (src/crown.js), so a big
//     stone's crown is both denser and coarser; the contact spray stays fine
//     (s^0.4). A big stone sheds big drops, and those throw crowns of their
//     own where they land.
//   - The cavity's lengths go with R and its times with sqrt(R/g) (its
//     depths follow the stone, src/cavity.js): it pinches off 2.1·sqrt(R/g)
//     after entry and closes 0.4·sqrt(R/g) later, when the jet starts; the
//     jet's launch window goes as sqrt(s), its radius as R·s^0.25 (fatter at
//     the lower Froude number of a big stone) and its breakup as s^1.5 (a
//     capillary time), its tip speed follows V (times s^0.15): a big stone's
//     jet is a fat column that mostly falls back as one, not a taller needle.
//   - The cavity splat: σ = 1.1·R and a depression CAVITY_SPLAT_DEPTH·R deep
//     (the hole itself is the cavity's mesh), so the ring's wavelength goes
//     with R; its downward velocity 0.045·V adds a height that goes as
//     sqrt(R) (the speed over the frequency of waves of size R), and a big
//     jet's fall-back adds a strong second ring. The solver damps waves
//     longer than 30 cm less (src/spectralWater.js), so a big stone's ring
//     carries across the pond.
//   - Foam: the patches' radii go with R, the boil's peaks as sqrt(s) and the
//     raft's as s^0.25 times the cavity splat's strength, at most
//     FOAM_AMOUNT_CAP (a bigger cavity entrains more air for the area of its
//     mouth); the raft lasts
//     RAFT_LIFETIME.base + RAFT_LIFETIME.perMetre·R (3.2 s for the 1.5 cm
//     pebble, 5.4 s for the 16 cm stone); the flows clear discs of
//     CLOSURE_FLOW·R and FALLBACK_FLOW·R; the crown's specks go as s² (the
//     area its base covered); the bubbles as s², in a cloud as wide as the
//     stone.
// The counts are set for a believable splash, tens to a few hundred drops
// a stone and most of them millimetres across, not thousands of specks: a
// 3 cm stone throws about 400 (130 from the crown, 60 fine ones from the
// fan, a dozen contact spray, two dozen from the jet, 130 from the crowns of
// the drops that throw one where they land, 20 kicked up by the rest), at
// most about 190 in the air at once. The caps are for cost, set above what
// the slider's biggest stone (16 cm, s = 2.67) needs even thrown hard.
// Thrown normally (6.3 m/s, 42° from vertical) it spawns about 1500 drops:
// 650 from the crown (2.5 to 9 mm), 300 from the fan, 70 contact spray, a
// dozen from the jet, 180 from the crowns of the 25-odd drops that throw one
// where they land and 230 kicked up by the rest; at most 700 are alive at
// once (800 thrown hard), and it leaves 3400 foam specks. Its CPU work on a
// desktop is under a millisecond a frame on average and 3 to 7 ms in the
// worst frames, where the crown tears and drops land
// (tools/splash-probe.mjs measures all of this).
//
// Droplets are integrated on the CPU and rendered as screen-space water
// (src/shaders/fluid.js): sphere impostors into an info target (depth, what
// it is, the exact normal) and a summed optics target (thickness, coverage,
// sun glints, aeration), then the composite shades them. The crown sheets and
// jet columns are meshes drawn into the same two targets (src/shaders/
// sheet.js), so sheets, columns and drops are shaded as one water: the
// pond's Fresnel, reflection, refraction with its absorption, and its sun
// glitter, with drops of two device pixels and more as glass beads with their
// two glints and finer ones as a faint mist. Both meshes are evaluated in
// closed form once per rendered frame (prepareFrame); at most MAX_CROWNS
// stone crowns and MAX_JETS jets live at once, and nothing is drawn for them
// when none are alive. The cavities are drawn in the main scene instead
// (cavityGroup), with the water surface's own shader (src/waterSurface.js),
// so prepareScene brings them to the frame's time before that scene is drawn
// and hands the surface the circles it dips from; at most MAX_CAVITIES are
// open at once. The sheets' and columns' costly steps (the crown's tear, the
// jet's breakup) run once per rendered frame, the frame's simulated length
// given by setFrameSeconds before its substeps.
//
// The water mirrors the splash: mirrorObjects() lists what is alive to be
// drawn in the mirror image (the droplets, the crowns, the columns), each
// tagged by mirrorWith with MIRROR_LAYER and the cheap water material the
// mirror pass swaps in (src/main.js re-renders the mirror while the list is
// not empty, and only then). A new mesh joins with mirrorWith at its creation
// and a line in prepareFrame, which builds the list; whatever is on
// MIRROR_LAYER in the scenes the mirror draws must be in it. The cavities are
// left out: a hole lies below the mirror plane, so the water reflects none
// of it.
//
// With nothing in the air (no droplet, sheet or column) render() neither
// clears nor reads the fluid targets: it tone-maps the scene alone
// (TONE_MAP_FRAGMENT, the composite's own tone map), so a still pond pays one
// texture read per pixel for the splash. reset() retires everything at once
// (src/main.js throws a stone under the loading veil to compile every
// program, then resets); `inMotion` and `settled` tell the app when it may
// lower its frame rate and when its solver may sleep.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { CrownSheet } from './crown.js';
import { JetColumn } from './jet.js';
import { Cavity } from './cavity.js';
import { MAX_CAVITIES } from './waterSurface.js';
import { FoamSpecks } from './foamSpecks.js';
import { PARTICLE_VERTEX, PARTICLE_DEPTH_FRAGMENT, PARTICLE_THICKNESS_FRAGMENT, COMPOSITE_FRAGMENT, MIRROR_SHEET_FRAGMENT, MIRROR_COLUMN_FRAGMENT, MIRROR_DROP_FRAGMENT } from './shaders/fluid.js';
import { SHEET_VERTEX, SHEET_DEPTH_FRAGMENT, SHEET_THICKNESS_FRAGMENT, COLUMN_VERTEX, COLUMN_DEPTH_FRAGMENT, COLUMN_THICKNESS_FRAGMENT } from './shaders/sheet.js';
import { BUBBLE_VERTEX, BUBBLE_FRAGMENT } from './shaders/scene.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;   // the stone size the tuning constants were set for
const MAX_CROWNS = 5;            // an older crown tears at once when another arrives
const MAX_JETS = 3;              // an older jet breaks into drops at once when another starts
const LANDING_CROWN_RADIUS = 0.004;   // drops this big throw a crown where they land...
const MAX_LANDING_CROWNS = 6;         // ...while fewer than this many are alive...
const LANDING_CROWN_FLIGHT = 0.05;    // ...if they have flown this long (s)...
const LANDING_CROWN_SPEED = 1.0;      // ...and fall this fast (m/s): not the drops a crown's torn foot drops back
const LANDING_REFERENCE = 0.0086;     // a 3 cm stone's first tip drop: the landing crown tuning size
const LANDING_BREAKUP = 12;           // its crown's breakup droplets (scaling with the drop's area)
const CROWN_SPECKS = 220;             // foam specks where a 3 cm stone's crown stood (scaling with its area)
const CROWN_SPECK_CAP = 1600;         // at most (a 16 cm stone's crown wants 1560)
const LANDING_KICK_CHANCE = 0.4;      // a big drop landing without a crown kicks up droplets this often...
const LANDING_KICK_MOST = 2;          // ...one to this many
const LANDING_SPECK_FREE = 0.003;     // a landing drop leaves a foam speck per LANDING_SPECK_STEP of radius beyond this
const LANDING_SPECK_STEP = 0.0015;
const PATH_SLOPE_CAP = 1.2;           // the stone's path under water, horizontal over vertical, at most (50°)
const FAN_THRESHOLD = 0.3;            // the forward fan needs this horizontal fraction of the entry speed...
const FAN_FULL = 0.7;                 // ...and is at full strength from this one
const FAN_DROPLETS = 70;              // drops of a 3 cm stone's fan at about 6 m/s and full strength
const CROWN_DROPLETS = 150;           // drops of a 3 cm stone's crown at about 6 m/s (contact spray, rim and tear)
const DROPLET_COUNT_POWER = 1.6;      // the crown's and the fan's drop counts scale as (R / 3 cm)^this
const CROWN_DROPLET_CAP = 2000;       // at most (a 16 cm stone thrown hard wants about 870)
const FAN_DROPLET_CAP = 600;          // at most (the same stone's fan, about 400)
const SPRAY_DROP_RADIUS = 0.0008;     // the contact line's spray: drops of this radius...
const SPRAY_DROP_SPREAD = 0.001;      // ...to this much more, times (R / 3 cm)^0.4
const BUBBLES = 110;                  // bubbles a 3 cm stone drags down, scaling with R²...
const BUBBLE_CAP = 800;               // ...at most (a 16 cm stone wants 780)
// The foam (the map keeps two kinds, src/spectralWater.js). The air the hole
// held comes up where it closed as a boil, big bubbles, dense and short-lived,
// and leaves a raft of small bubbles, sparse and lasting seconds, longer the
// bigger the stone; each comes as a patch of sub-stamps (stampFoamPatch).
const BOIL_AMOUNT = 0.25;             // a 3 cm stone's boil: its sub-stamps' peak, scaling as sqrt(R / 3 cm) and the cavity splat's strength...
const RAFT_AMOUNT = 0.18;             // ...and its raft's, as (R / 3 cm)^0.25 (a small stone's raft is smaller, hardly thinner)...
const FOAM_AMOUNT_CAP = 0.8;          // ...at most
const BOIL_LIFETIME = 0.8;            // τ of a boil (s)
const RAFT_LIFETIME = { base: 3, perMetre: 30 };     // τ of a raft: base + perMetre·R (s), at most 6 (src/spectralWater.js)
const FOAM_SPREAD = 0.6;              // the hole's foam comes up over this many sqrt(R/g) from its closure
const JET_BASE_BOIL = 0.2;            // the boil where the jet rises, its sub-stamps' peak
const BUBBLE_FOAM = 0.04;             // a fizz where a bubble surfaces (a boil, popping as fast)
const LANDING_FOAM_LIFETIME = 1.2;    // a landing drop's foam is a boil of big bubbles, lasting this (s)
const FALLBACK_BOIL_CAP = 0.45;       // the jet's fall-back stamps its foam as a boil of at most this peak...
const FALLBACK_RAFT = 0.3;            // ...and a raft of this share of it...
const FALLBACK_RAFT_CAP = 0.15;       // ...at most
// Surface flows (addFoamFlow in src/spectralWater.js), which sweep the foam
// out of a disc into a ring: the jet's base welling up where the hole closed,
// and the mound where the jet falls back spreading. Their discs in stone
// radii; their strength decays over FLOW_DECAY·sqrt(R/g).
const CLOSURE_FLOW = 1.4;
const FALLBACK_FLOW = 2.0;
const FLOW_DECAY = 2;
const JET_LEAN = 0.4;                                // the jet leans back by this fraction of the entry angle,
const JET_LEAN_CAP = THREE.MathUtils.degToRad(18);   // at most this
const OBLIQUE_IMPULSE = 1.3;          // an oblique entry's cavity splats together carry at most this times a vertical one's
const JET_OBLIQUE_SLOWING = 0.3;      // and is slower by this times the horizontal fraction
const CAVITY_SPLAT_DEPTH = 0.1;       // the cavity splat's depression, in stone radii: the hole itself is the cavity's mesh
const HAZE_RADIUS = 0.5;             // device pixels: finer drops are mist (src/shaders/fluid.js)
const MIRROR_PAD = 0.05;              // metres around what is mirrored: drawn radii, streaks, a landing crown's ride
const MIRROR_DROP_RADIUS = 0.002;     // finer drops are left out of the mirror: their images there are under a pixel

const POND_DEPTH = 0.8;               // when the water does not say (the CPU probes' stand-in)
const SAND_ALBEDO = 0.33;             // the floor's mean sand colour (FLOOR_FRAGMENT in src/shaders/scene.js)

// The composite's tone map (COMPOSITE_FRAGMENT in src/shaders/fluid.js) for a
// frame with no water in the air: the same operations as its pixels with
// none, so such a frame comes out exactly as the composite made it.
const TONE_MAP_FRAGMENT = /* glsl */`
uniform sampler2D uScene;
uniform float uExposure;
varying vec2 vUv;
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
  vec3 color = texture2D(uScene, vUv).rgb;
  color = aces(color * uExposure / 0.6);
  gl_FragColor = vec4(linearToSrgb(color), 1.0);
}
`;

/**
 * The sand floor's radiance under the water, lit as FLOOR_FRAGMENT lights it
 * (the sun through the water above it, and the sky), without its caustics:
 * what the composite sees of the pond's bottom through a drop.
 */
function floorLight(lighting, depth) {
  const sunHeight = Math.max(lighting.sunDirection.y, 0.2);
  const light = new THREE.Vector3();
  for (const channel of ['x', 'y', 'z']) {
    const absorb = lighting.absorb[channel];
    light[channel] = SAND_ALBEDO * (lighting.sunIrradiance[channel] * Math.exp(-absorb * depth / sunHeight) * Math.max(lighting.sunDirection.y, 0)
      + lighting.skyAmbient[channel] * Math.exp(-absorb * depth) * 1.4);
  }
  return light;
}

/** The layer the mirror camera draws (src/main.js): the sky dome and whatever mirrorWith tags. */
export const MIRROR_LAYER = 1;

/**
 * Draw `object` in the water's mirror image with `material` in place of its
 * own; `bounds(box)`, if given, grows a world box around what it draws
 * (otherwise its geometry's bounding box is used).
 */
export function mirrorWith(object, material, bounds = null) {
  object.layers.enable(MIRROR_LAYER);
  object.userData.mirrorMaterial = material;
  if (bounds) object.userData.mirrorBounds = bounds;
  return object;
}

const randomRange = (lo, hi) => lo + Math.random() * (hi - lo);

/** τ (s) of the raft a stone of radius R (m) leaves. */
const raftLifetime = (radius) => RAFT_LIFETIME.base + RAFT_LIFETIME.perMetre * radius;

/**
 * A random sequence of the foam's own, seeded by `values` (a place and a
 * time): the foam's shapes are drawn from it rather than from Math.random, so
 * they shift no other draw of the splash (a seeded throw splashes the same
 * whatever its foam), yet no two rafts share a shape. Murmur3's finaliser over
 * the values' bits, then mulberry32.
 */
function foamRandom(...values) {
  const finalise = (bits) => {
    let mixed = Math.imul(bits ^ (bits >>> 16), 0x85ebca6b);
    mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
    return (mixed ^ (mixed >>> 16)) >>> 0;
  };
  const number = new Float64Array(1);
  const words = new Uint32Array(number.buffer);
  let state = 0x9e3779b9;
  for (const value of values) {
    number[0] = value;
    state = finalise(state ^ words[0]);
    state = finalise(state ^ words[1]);
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

export class SplashSystem {
  constructor({ capacity = 16000, bubbleCapacity = 3000, environment, lighting, water, ambientWaves, surface = null }) {
    this.capacity = capacity;
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.radii = new Float32Array(capacity);
    this.ages = new Float32Array(capacity);
    this.lenses = new Float32Array(capacity);   // 1 for drops drawn as glass lenses like the jet column

    this.bubbleCapacity = bubbleCapacity;
    this.bubbleCount = 0;
    this.bubblePositions = new Float32Array(bubbleCapacity * 3);
    this.bubbleVelocities = new Float32Array(bubbleCapacity * 3);
    this.bubbleSizes = new Float32Array(bubbleCapacity);
    this.bubblePhases = new Float32Array(bubbleCapacity);

    this.jets = [];      // scheduled Worthington jets
    this.columns = [];   // live jet columns
    this.crowns = [];    // live crown sheets
    this.plumes = [];    // scheduled bubble plumes
    this.wakes = [];     // scheduled cavity splats of an oblique entry
    this.foamStamps = [];   // scheduled foam: a cavity's, when it closes
    this.flowStarts = [];   // scheduled surface flows: a jet's base, when the hole closes
    this.cavities = [];  // open cavities (src/cavity.js), drawn in the main scene from cavityGroup
    this.cavityGroup = new THREE.Group();
    this.surface = surface;
    this.sceneTime = -1;  // splash time the cavities were last brought to
    this.time = 0;
    this.frameSeconds = 1 / 60;   // simulated length of the frame being stepped
    this.substep = 1 / 240;       // and of its substeps, which the stones are stepped with
    this.lighting = lighting;
    this.foamSpecks = new FoamSpecks({ water, lighting, ambientWaves });
    // The foam drifts down the wind the ripples blow with (the CPU probes' stand-ins have neither).
    if (ambientWaves.windDirection) water.setWind?.(ambientWaves.windDirection);

    // Droplet instances.
    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute('position', quad.getAttribute('position'));
    this.instancePositions = new THREE.InstancedBufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.instanceRadii = new THREE.InstancedBufferAttribute(this.radii, 1).setUsage(THREE.DynamicDrawUsage);
    this.instanceVelocities = new THREE.InstancedBufferAttribute(this.velocities, 3).setUsage(THREE.DynamicDrawUsage);
    this.instanceLenses = new THREE.InstancedBufferAttribute(this.lenses, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iPosition', this.instancePositions);
    geometry.setAttribute('iRadius', this.instanceRadii);
    geometry.setAttribute('iVelocity', this.instanceVelocities);
    geometry.setAttribute('iLens', this.instanceLenses);
    geometry.instanceCount = 0;
    this.particleGeometry = geometry;

    const particleUniforms = () => ({
      uProjScale: { value: 1000 },
      uMinPixelRadius: { value: 1.0 },
      uHazeRadius: { value: 0.5 },
      uStreakSeconds: { value: 0 },
      uSunDirView: { value: new THREE.Vector3() },
      uLeastRadius: { value: 0 },
      uSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    });
    this.streakSeconds = 0;
    // The optics pass sums all four channels (src/shaders/fluid.js).
    const summed = { depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };
    this.depthMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_DEPTH_FRAGMENT, uniforms: particleUniforms(), depthTest: true, depthWrite: true });
    this.thicknessMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_THICKNESS_FRAGMENT, uniforms: particleUniforms(), ...summed });
    this.particleMesh = new THREE.Mesh(geometry, this.depthMaterial);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.visible = false;
    this.particleScene = new THREE.Scene();
    this.particleScene.add(this.particleMesh);

    // Crown sheets: every crown's mesh shares these and swaps them per pass.
    const sheetUniforms = () => ({
      uSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    });
    // A landing crown rides the waves: the sheet's vertex shader samples the
    // splash's height field and the ambient waves (src/ambientWaves.js).
    const rideUniforms = () => ({
      uHeight: { value: water.heightTexture },
      uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
      uDomainSize: { value: water.domainSize },
      uTexelOffset: water.gridUniforms?.uTexelOffset ?? { value: water.uvOffset },   // shared: it follows the solver's grid
      ...ambientWaves.uniforms(),
    });
    this.sheetDepthMaterial = new THREE.ShaderMaterial({ vertexShader: SHEET_VERTEX, fragmentShader: SHEET_DEPTH_FRAGMENT, uniforms: { ...sheetUniforms(), ...rideUniforms() }, depthTest: true, depthWrite: true, side: THREE.DoubleSide });
    this.sheetThicknessMaterial = new THREE.ShaderMaterial({ vertexShader: SHEET_VERTEX, fragmentShader: SHEET_THICKNESS_FRAGMENT, uniforms: { ...sheetUniforms(), ...rideUniforms() }, ...summed, side: THREE.DoubleSide });
    // Jet columns, likewise.
    const columnUniforms = () => ({ ...sheetUniforms(), uProjScale: { value: 1000 }, uMinPixelRadius: { value: 1.0 } });
    this.columnDepthMaterial = new THREE.ShaderMaterial({ vertexShader: COLUMN_VERTEX, fragmentShader: COLUMN_DEPTH_FRAGMENT, uniforms: columnUniforms(), depthTest: true, depthWrite: true, side: THREE.DoubleSide });
    this.columnThicknessMaterial = new THREE.ShaderMaterial({ vertexShader: COLUMN_VERTEX, fragmentShader: COLUMN_THICKNESS_FRAGMENT, uniforms: columnUniforms(), ...summed, side: THREE.DoubleSide });
    this.sunDirView = new THREE.Vector3();

    // The mirror image's cheap water (src/shaders/fluid.js, MIRROR_*), drawn
    // over the dome's mirror image: premultiplied, the dome showing through.
    const mirrorBlend = { transparent: true, depthTest: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
    this.sheetMirrorMaterial = new THREE.ShaderMaterial({
      vertexShader: SHEET_VERTEX, fragmentShader: MIRROR_SHEET_FRAGMENT,
      uniforms: { ...rideUniforms(), uEnvCube: { value: environment.cubeTexture }, uSkyAmbient: { value: lighting.skyAmbient } },
      ...mirrorBlend, side: THREE.DoubleSide,
    });
    this.columnMirrorMaterial = new THREE.ShaderMaterial({
      vertexShader: COLUMN_VERTEX, fragmentShader: MIRROR_COLUMN_FRAGMENT,
      uniforms: { uProjScale: { value: 1000 }, uMinPixelRadius: { value: 1.0 }, uEnvCube: { value: environment.cubeTexture } },
      ...mirrorBlend, side: THREE.DoubleSide,
    });
    this.dropMirrorMaterial = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX, fragmentShader: MIRROR_DROP_FRAGMENT,
      uniforms: { ...particleUniforms(), uLeastRadius: { value: MIRROR_DROP_RADIUS }, uEnvCube: { value: environment.cubeTexture }, uSkyAmbient: { value: lighting.skyAmbient }, uSunIrradiance: { value: lighting.sunIrradiance } },
      ...mirrorBlend,
    });
    mirrorWith(this.particleMesh, this.dropMirrorMaterial, (box) => this.dropletBounds(box));
    this.mirrorList = [];
    this.dropletBox = new THREE.Box3();
    this.dropletMin = new THREE.Vector3();
    this.dropletMax = new THREE.Vector3();

    this.compositePass = new FullscreenPass(COMPOSITE_FRAGMENT, {
      uScene: { value: null },
      uFluidInfo: { value: null },
      uOptics: { value: null },
      uEnvCube: { value: environment.cubeTexture },
      uInverseProjection: { value: new THREE.Matrix4() },
      uCameraWorld: { value: new THREE.Matrix4() },
      uSunDirView: { value: new THREE.Vector3() },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uAbsorb: { value: lighting.absorb },
      uFloorLight: { value: floorLight(lighting, water.depth ?? POND_DEPTH) },
      uWaterColor: { value: lighting.waterColor ?? new THREE.Vector3() },
      uPondDepth: { value: water.depth ?? POND_DEPTH },
      uExposure: { value: lighting.exposure },
      uRefract: { value: 1.4 },
      uFluidScale: { value: 1.0 },
      uProjScale: { value: 1000 },
    });
    this.toneMapPass = new FullscreenPass(TONE_MAP_FRAGMENT, { uScene: { value: null }, uExposure: { value: lighting.exposure } });

    // Bubbles.
    const bubbleGeometry = new THREE.BufferGeometry();
    this.bubblePositionAttribute = new THREE.BufferAttribute(this.bubblePositions, 3).setUsage(THREE.DynamicDrawUsage);
    this.bubbleSizeAttribute = new THREE.BufferAttribute(this.bubbleSizes, 1).setUsage(THREE.DynamicDrawUsage);
    bubbleGeometry.setAttribute('position', this.bubblePositionAttribute);
    bubbleGeometry.setAttribute('aSize', this.bubbleSizeAttribute);
    bubbleGeometry.setDrawRange(0, 0);
    this.bubbleMaterial = new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERTEX,
      fragmentShader: BUBBLE_FRAGMENT,
      uniforms: { uProjScale: { value: 1000 }, uTint: { value: new THREE.Color(0.18, 0.30, 0.34) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.bubblePoints = new THREE.Points(bubbleGeometry, this.bubbleMaterial);
    this.bubblePoints.frustumCulled = false;

    this.fluidScale = 0.5;
    this.targets = null;
  }

  /** Something in the air or in the water is moving: droplets, sheets, columns, an open cavity, bubbles, or a stage still to come. */
  get inMotion() {
    return this.count > 0 || this.crowns.length > 0 || this.columns.length > 0 || this.cavities.length > 0 || this.bubbleCount > 0
      || this.jets.length > 0 || this.plumes.length > 0 || this.wakes.length > 0 || this.foamStamps.length > 0 || this.flowStarts.length > 0;
  }

  /** Nothing of the splash is left, foam specks included. */
  get settled() { return !this.inMotion && !this.foamSpecks.alive; }

  /**
   * Retire everything at once: droplets, sheets, columns, cavities, bubbles,
   * foam specks, the stages still to come and the mirror list, the fluid
   * targets cleared (with `renderer`), and the splash clock back to zero.
   */
  reset(renderer = null) {
    this.count = 0;
    this.bubbleCount = 0;
    for (const crown of this.crowns) { this.particleScene.remove(crown.mesh); crown.dispose(); }
    this.crowns = [];
    for (const column of [...this.columns]) this.retireColumn(column);
    for (const cavity of [...this.cavities]) this.retireCavity(cavity);
    this.jets = [];
    this.plumes = [];
    this.wakes = [];
    this.foamStamps = [];
    this.flowStarts = [];
    this.mirrorList.length = 0;
    this.particleMesh.visible = false;
    this.particleMesh.layers.disable(MIRROR_LAYER);
    this.particleGeometry.instanceCount = 0;
    this.bubblePoints.geometry.setDrawRange(0, 0);
    this.foamSpecks.reset();
    this.time = 0;
    this.sceneTime = -1;
    this.surface?.setCavities([]);
    if (renderer && this.targets) {
      const previous = renderer.getRenderTarget();
      renderer.setClearColor(0x000000, 0);
      for (const target of Object.values(this.targets)) {
        renderer.setRenderTarget(target);
        renderer.clear(true, true, false);
      }
      renderer.setRenderTarget(previous);
    }
  }

  // ---- choreography ----------------------------------------------------

  /** Build the splash for a stone that has just touched the water. */
  impact(info, water) {
    const { x, z, speed, velocity, radius } = info;
    const sizeFactor = radius / REFERENCE_RADIUS;
    const entrySpeed = Math.max(speed, 1.0);
    const horizontal = new THREE.Vector2(velocity.x, velocity.z);
    const horizontalFraction = Math.min(horizontal.length() / entrySpeed, 1);
    if (horizontal.lengthSq() > 1e-6) horizontal.normalize();
    const entryAngle = Math.asin(horizontalFraction);   // from vertical
    const jetLean = Math.min(JET_LEAN * entryAngle, JET_LEAN_CAP);

    // The hole the stone opens: the crown and the fan launch from its rim and
    // the jet rises where it closes.
    const cavity = this.startCavity(info, water, jetLean);

    // 1. Crown. The droplet total is split between fine spray from the contact
    // line now, drops shed by the sheet's rim, and the sheet's breakup.
    const crownCount = Math.round(THREE.MathUtils.clamp(CROWN_DROPLETS * sizeFactor ** DROPLET_COUNT_POWER * Math.sqrt(entrySpeed / 6), 50, CROWN_DROPLET_CAP));
    const sprayCount = Math.round(0.1 * crownCount);
    const rimCount = Math.round(0.1 * crownCount);
    for (let drop = 0; drop < sprayCount; drop++) {
      const angle = Math.random() * Math.PI * 2;
      const dirX = Math.cos(angle), dirZ = Math.sin(angle);
      const forward = (dirX * horizontal.x + dirZ * horizontal.y) * horizontalFraction;
      if (Math.random() < 0.45 * Math.max(-forward, 0)) continue;
      const ringRadius = radius * randomRange(0.9, 1.1);
      const tilt = THREE.MathUtils.degToRad(randomRange(50, 75));
      const dropSpeed = entrySpeed * randomRange(0.4, 0.9) * (1 + 0.45 * forward);
      const up = Math.cos(tilt) * dropSpeed;
      const out = Math.sin(tilt) * dropSpeed;
      this.spawnDroplet(
        x + dirX * ringRadius, 0.003, z + dirZ * ringRadius,
        dirX * out + velocity.x * 0.22, up, dirZ * out + velocity.z * 0.22,
        (SPRAY_DROP_RADIUS + SPRAY_DROP_SPREAD * Math.random()) * sizeFactor ** 0.4,
      );
    }
    const stoneCrowns = this.crowns.filter((candidate) => !candidate.landing && !candidate.fan);
    if (stoneCrowns.length >= MAX_CROWNS) {
      const oldest = stoneCrowns[0];
      oldest.finishNow(this);
      this.retireCrown(oldest);
    }
    const crown = new CrownSheet({
      impact: info, startTime: this.time, rimDroplets: rimCount,
      breakupDroplets: crownCount - sprayCount - rimCount, material: this.sheetDepthMaterial, rim: cavity,
    });
    this.crowns.push(crown);
    this.particleScene.add(crown.mesh);

    // The forward fan of an oblique entry: a thin, fast, low sheet ahead of
    // the crown, at a strength growing with the horizontal fraction.
    const fanStrength = THREE.MathUtils.clamp((horizontalFraction - FAN_THRESHOLD) / (FAN_FULL - FAN_THRESHOLD), 0, 1);
    if (fanStrength > 0) {
      const fanCount = Math.round(THREE.MathUtils.clamp(FAN_DROPLETS * sizeFactor ** DROPLET_COUNT_POWER * Math.sqrt(entrySpeed / 6), 15, FAN_DROPLET_CAP) * fanStrength);
      const fan = new CrownSheet({
        impact: info, startTime: this.time, rimDroplets: Math.round(0.15 * fanCount), breakupDroplets: Math.round(0.85 * fanCount),
        material: this.sheetDepthMaterial, fan: true, strength: fanStrength, rim: cavity,
      });
      this.crowns.push(fan);
      this.particleScene.add(fan.mesh);
    }

    // Cavity: a depression plus a downward push that launches the first ring.
    // An oblique entry drags it forward: up to two more, where the stone is
    // one and two radii down its path (k·R·tan θ ahead, θ the entry angle
    // from vertical), as it gets there, each weaker, stretch the depression
    // and its foam; and each runs forward by the horizontal fraction, so the
    // ring is stronger ahead.
    const travelX = horizontal.x * horizontalFraction;
    const travelZ = horizontal.y * horizontalFraction;
    // The wake splats share the impulse with the entry splat, so an oblique
    // entry rings at most OBLIQUE_IMPULSE times as hard as a vertical one.
    const pathSlope = Math.min(Math.tan(entryAngle), PATH_SLOPE_CAP);
    const wakeStep = radius * pathSlope;
    const sinkSpeed = Math.max(entrySpeed * Math.cos(entryAngle), 1.0);
    const wakeStrengths = [smoothstep(0.05, 0.25, horizontalFraction) * 0.8, smoothstep(0.3, 0.5, horizontalFraction) * 0.6];
    const impulseScale = Math.min(OBLIQUE_IMPULSE / (1 + wakeStrengths[0] + wakeStrengths[1]), 1);
    // Their foam is the air the hole held, which surfaces where it closes, so it comes then.
    const foamTime = this.time + cavity.closeTime;
    this.stampCavity({ x, z, radius, speed: entrySpeed, strength: impulseScale, travelX, travelZ, foamTime }, water);
    wakeStrengths.forEach((strength, index) => {
      const step = index + 1;
      if (strength > 0) {
        this.wakes.push({
          x: x + horizontal.x * wakeStep * step, z: z + horizontal.y * wakeStep * step, start: this.time + (step * radius) / sinkSpeed,
          radius, speed: entrySpeed, strength: strength * impulseScale, travelX, travelZ, foamTime,
        });
      }
    });

    // 2 and 3. Pinch-off, the collapse of the hole above it, then the jet from
    // where the hole closed, which after an oblique entry leans back along the
    // stone's path and, from a dragged cavity, rises slower.
    const closure = cavity.lipAt(cavity.closeTime, {});
    // The jet's base wells up there and sweeps the foam out from under it.
    this.flowStarts.push({ time: this.time + cavity.closeTime, flow: { x: closure.x, z: closure.z, radius: CLOSURE_FLOW * radius, decay: FLOW_DECAY * Math.sqrt(radius / GRAVITY) } });
    const tipSpeed = THREE.MathUtils.clamp(0.42 * entrySpeed + 0.7, 1.2, 6.0) * sizeFactor ** 0.15 * (1 - JET_OBLIQUE_SLOWING * horizontalFraction);
    this.jets.push({
      x: closure.x, z: closure.z, radius, start: this.time + cavity.closeTime,
      total: Math.round(THREE.MathUtils.clamp(220 * sizeFactor ** 1.3, 80, 1200)),
      tipSpeed, speed: entrySpeed,
      lean: jetLean, leanX: -horizontal.x, leanZ: -horizontal.y,
    });

    // 4. Bubbles follow the stone down its path, in a cloud as wide as the stone.
    this.plumes.push({
      x, z, start: this.time, duration: 0.3,
      total: Math.round(THREE.MathUtils.clamp(BUBBLES * sizeFactor ** 2, 30, BUBBLE_CAP)),
      spawned: 0, depth: Math.min(0.55, radius * 7), spread: sizeFactor,
      driftX: horizontal.x * pathSlope, driftZ: horizontal.y * pathSlope,
    });
  }

  /**
   * A cavity splat: the depression and downward push that launch a ring,
   * with its foam. (travelX, travelZ), a direction times a share from 0 to 1,
   * sets that share of the depression running that way: water rising behind
   * it and sinking ahead, the vertical velocity −c·∂h/∂x of a travelling
   * wave (c the speed of waves its size), as a pair of splats either side.
   * Splats on their own ring as strongly behind as ahead, whatever their
   * layout. The foam comes from foamTime (the cavity's closure), or now.
   */
  stampCavity({ x, z, radius, speed, strength, travelX = 0, travelZ = 0, foamTime = this.time }, water) {
    const sigma = radius * 1.1;
    const depth = CAVITY_SPLAT_DEPTH * radius * strength;
    const ringDepth = 0.3 * radius * strength;   // the depression the ring's travel is set from (it was the splat's own)
    water.addSplat({ x, z, radius: sigma, height: -depth, velocity: -0.045 * speed * strength });
    // The foam comes up where the hole closed over FOAM_SPREAD·sqrt(R/g): a
    // boil over about the mouth, and the wider raft it leaves.
    const sizeFactor = radius / REFERENCE_RADIUS;
    const random = foamRandom(x, z, foamTime);
    const span = FOAM_SPREAD * Math.sqrt(radius / GRAVITY);
    this.stampFoamPatch(water, random, { x, z, radius: 1.4 * radius, amount: Math.min(RAFT_AMOUNT * sizeFactor ** 0.25 * strength, FOAM_AMOUNT_CAP), reach: 1.2, radii: [0.3, 0.65], lifetime: raftLifetime(radius), time: foamTime, span });
    this.stampFoamPatch(water, random, { x, z, radius: 1.1 * radius, amount: Math.min(BOIL_AMOUNT * Math.sqrt(sizeFactor) * strength, FOAM_AMOUNT_CAP), reach: 1.0, radii: [0.3, 0.6], lifetime: BOIL_LIFETIME, boil: true, time: foamTime, span });
    const travel = Math.hypot(travelX, travelZ);
    if (travel > 0) {
      const lift = 0.6 * travel * Math.sqrt(GRAVITY * sigma) * ringDepth / sigma;   // ≈ c·depth/σ at the slope's peak
      const offsetX = (travelX / travel) * 0.8 * sigma;
      const offsetZ = (travelZ / travel) * 0.8 * sigma;
      water.addSplat({ x: x - offsetX, z: z - offsetZ, radius: 0.8 * sigma, velocity: lift, rim: 1 });
      water.addSplat({ x: x + offsetX, z: z + offsetZ, radius: 0.8 * sigma, velocity: -lift, rim: 1 });
    }
  }

  /**
   * The stone's cavity (src/cavity.js), keeping at most MAX_CAVITIES open (the
   * most the surface dips under; an older one closes at once). It
   * is drawn only where the surface patch is simulated: outside it the water
   * is a flat sheet with no hole to show.
   */
  startCavity(info, water, lean) {
    if (this.cavities.length >= MAX_CAVITIES) this.retireCavity(this.cavities[0]);
    const domainMin = water.domainMin ?? [-Infinity, -Infinity];
    const domainSize = water.domainSize ?? Infinity;
    const inside = (value, low) => Math.abs((value - low) / domainSize - 0.5) * 2 < 0.75;
    const cavity = new Cavity({
      impact: info, startTime: this.time, material: this.surface?.cavityMaterial ?? null,
      // The surface dips by whole vertices of its mesh, which may be coarser than the solver's grid (src/waterSurface.js).
      cell: Math.max(water.cell ?? 0, this.surface?.cell ?? 0) || undefined, floorDepth: water.depth, lean, step: this.substep,
      drawn: inside(info.x, domainMin[0]) && inside(info.z, domainMin[1]),
    });
    this.cavities.push(cavity);
    if (cavity.mesh) this.cavityGroup.add(cavity.mesh);
    return cavity;
  }

  retireCavity(cavity) {
    if (cavity.mesh) this.cavityGroup.remove(cavity.mesh);
    cavity.dispose();
    this.cavities.splice(this.cavities.indexOf(cavity), 1);
  }

  /** A big drop has landed: a crown of its own, its droplet count following the drop's area. */
  startLandingCrown(hit) {
    const breakup = Math.round(THREE.MathUtils.clamp(LANDING_BREAKUP * (hit.radius / LANDING_REFERENCE) ** 2, 3, 12));
    const crown = new CrownSheet({
      impact: { x: hit.x, z: hit.z, speed: hit.speed, velocity: { x: hit.velocityX, y: -hit.fallSpeed, z: hit.velocityZ }, radius: hit.radius },
      startTime: this.time, rimDroplets: Math.round(0.25 * breakup), breakupDroplets: breakup,
      material: this.sheetDepthMaterial, landing: true,
    });
    this.crowns.push(crown);
    this.particleScene.add(crown.mesh);
  }

  /** A crown has gone. A stone's leaves foam specks where its base stood, 0.9 to 2.2 stone radii from its centre. */
  retireCrown(crown) {
    if (!crown.landing && !crown.fan) {
      const radius = crown.radius;
      const count = Math.round(THREE.MathUtils.clamp(CROWN_SPECKS * crown.sizeFactor ** 2, 40, CROWN_SPECK_CAP));
      this.spawnFoamSpecks(crown.centreX, crown.centreZ, 0.9 * radius, 2.2 * radius, count, 0.03);
    }
    this.particleScene.remove(crown.mesh);
    crown.dispose();
    this.crowns.splice(this.crowns.indexOf(crown), 1);
  }

  /** The cavity has closed: fire the column from the mound where it closed, in a boil, keeping at most MAX_JETS. */
  startJet(jet, water) {
    water.addSplat({ x: jet.x, z: jet.z, radius: jet.radius * 0.6, height: 0.06 * jet.radius, velocity: 0.05 * jet.speed });
    this.stampFoamPatch(water, foamRandom(jet.x, jet.z, jet.start), { x: jet.x, z: jet.z, radius: jet.radius, amount: JET_BASE_BOIL, reach: 1.0, radii: [0.3, 0.6], lifetime: BOIL_LIFETIME, boil: true });
    if (this.columns.length >= MAX_JETS) {
      const oldest = this.columns[0];
      oldest.finishNow(this, this.columnWater(oldest, water));
      this.retireColumn(oldest);
    }
    const column = new JetColumn({
      x: jet.x, z: jet.z, radius: jet.radius, tipSpeed: jet.tipSpeed,
      startTime: jet.start, budget: jet.total, material: this.columnDepthMaterial,
      lean: jet.lean, leanX: jet.leanX, leanZ: jet.leanZ,
    });
    this.columns.push(column);
    this.particleScene.add(column.mesh);
  }

  retireColumn(column) {
    this.particleScene.remove(column.mesh);
    column.dispose();
    this.columns.splice(this.columns.indexOf(column), 1);
  }

  /**
   * The water as a column meets it: src/jet.js touches the water only when
   * the column falls back, with the mound's splats, which pass straight
   * through, and its foam, which fallBackFoam stamps the splash's way.
   */
  columnWater(column, water) {
    return { addSplat: (splat) => water.addSplat(splat), addFoam: (foam) => this.fallBackFoam(column, foam, water) };
  }

  /**
   * Where a column falls back (its `foam`: the place, the mound's reach and
   * how much it fell): a boil and a raft as patches, and the mound spreading,
   * a flow that sweeps them and whatever floats there outward into a ring.
   */
  fallBackFoam(column, foam, water) {
    const random = foamRandom(foam.x, foam.z, this.time);
    this.stampFoamPatch(water, random, { x: foam.x, z: foam.z, radius: 1.2 * foam.radius, amount: Math.min(FALLBACK_RAFT * foam.amount, FALLBACK_RAFT_CAP), reach: 1.2, radii: [0.3, 0.65], lifetime: raftLifetime(column.radius) });
    this.stampFoamPatch(water, random, { x: foam.x, z: foam.z, radius: foam.radius, amount: Math.min(foam.amount, FALLBACK_BOIL_CAP), reach: 1.0, radii: [0.3, 0.6], lifetime: BOIL_LIFETIME, boil: true });
    water.addFoamFlow?.({ x: foam.x, z: foam.z, radius: FALLBACK_FLOW * column.radius, decay: FLOW_DECAY * Math.sqrt(column.radius / GRAVITY) });
  }

  /**
   * Foam as a patch rather than one round Gaussian: three to five sub-stamps
   * of radius times radii[0] to radii[1], at random offsets up to
   * reach·radius from (x, z), peaks of 0.4 to 1 times `amount`, drawn from
   * `random`; a boil or a raft of the given lifetime. They come at `time`
   * (now if it has passed), the later ones spread over `span` seconds after.
   */
  stampFoamPatch(water, random, { x, z, radius, amount, reach, radii, lifetime, boil = false, time = this.time, span = 0 }) {
    const count = 3 + Math.floor(random() * 3);
    for (let piece = 0; piece < count; piece++) {
      const angle = random() * Math.PI * 2;
      const distance = reach * radius * Math.sqrt(random());
      const foam = {
        x: x + Math.cos(angle) * distance, z: z + Math.sin(angle) * distance,
        radius: radius * (radii[0] + (radii[1] - radii[0]) * random()), amount: amount * (0.4 + 0.6 * random()), lifetime, boil,
      };
      const at = time + span * piece / (count - 1);
      if (at > this.time) this.foamStamps.push({ time: at, foam }); else water.addFoam(foam);
    }
  }

  /** `count` foam specks in rafts over the ring between two radii around (x, z), drifting outward at up to `driftSpeed` m/s. */
  spawnFoamSpecks(x, z, innerRadius, outerRadius, count, driftSpeed) {
    this.foamSpecks.spawnPatch(x, z, innerRadius, outerRadius, count, this.time, driftSpeed);
  }

  /** `lens`: draw the drop as glass like the jet column it came from (unblurred, refracting). */
  spawnDroplet(x, y, z, vx, vy, vz, radius, lens = false) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx; this.velocities[i * 3 + 1] = vy; this.velocities[i * 3 + 2] = vz;
    this.radii[i] = radius;
    this.ages[i] = 0;
    this.lenses[i] = lens ? 1 : 0;
  }

  removeDroplet(i) {
    const last = --this.count;
    if (i !== last) {
      for (let c = 0; c < 3; c++) {
        this.positions[i * 3 + c] = this.positions[last * 3 + c];
        this.velocities[i * 3 + c] = this.velocities[last * 3 + c];
      }
      this.radii[i] = this.radii[last];
      this.ages[i] = this.ages[last];
      this.lenses[i] = this.lenses[last];
    }
  }

  spawnBubble(x, y, z, vx, vy, vz, size) {
    if (this.bubbleCount >= this.bubbleCapacity) return;
    const i = this.bubbleCount++;
    this.bubblePositions[i * 3] = x; this.bubblePositions[i * 3 + 1] = y; this.bubblePositions[i * 3 + 2] = z;
    this.bubbleVelocities[i * 3] = vx; this.bubbleVelocities[i * 3 + 1] = vy; this.bubbleVelocities[i * 3 + 2] = vz;
    this.bubbleSizes[i] = size;
    this.bubblePhases[i] = Math.random() * Math.PI * 2;
  }

  removeBubble(i) {
    const last = --this.bubbleCount;
    if (i !== last) {
      for (let c = 0; c < 3; c++) {
        this.bubblePositions[i * 3 + c] = this.bubblePositions[last * 3 + c];
        this.bubbleVelocities[i * 3 + c] = this.bubbleVelocities[last * 3 + c];
      }
      this.bubbleSizes[i] = this.bubbleSizes[last];
      this.bubblePhases[i] = this.bubblePhases[last];
    }
  }

  /** Advance droplets and bubbles by dt seconds, feeding the water surface. */
  update(dt, water) {
    this.time += dt;
    this.substep = dt;

    // Scheduled jets start their columns, and an oblique entry's cavity
    // reaches on as the stone moves along.
    for (const jet of this.jets) if (this.time >= jet.start) this.startJet(jet, water);
    this.jets = this.jets.filter((jet) => this.time < jet.start);
    for (const wake of this.wakes) if (this.time >= wake.start) this.stampCavity(wake, water);
    this.wakes = this.wakes.filter((wake) => this.time < wake.start);
    for (const stamp of this.foamStamps) if (this.time >= stamp.time) water.addFoam(stamp.foam);
    this.foamStamps = this.foamStamps.filter((stamp) => this.time < stamp.time);
    for (const start of this.flowStarts) if (this.time >= start.time) water.addFoamFlow?.(start.flow);
    this.flowStarts = this.flowStarts.filter((start) => this.time < start.time);
    for (const cavity of this.cavities) cavity.update(this.time);
    for (const cavity of this.cavities.filter((candidate) => candidate.finished)) this.retireCavity(cavity);

    // Bubble plumes.
    for (const plume of this.plumes) {
      const phase = Math.min((this.time - plume.start) / plume.duration, 1);
      const shouldHave = Math.round(plume.total * phase);
      while (plume.spawned < shouldHave) {
        const depth = plume.depth * (0.1 + 0.9 * Math.random()) * phase;
        const angle = Math.random() * Math.PI * 2;
        const offset = Math.random() * 0.05 * (0.3 + depth) * plume.spread;
        this.spawnBubble(
          plume.x + Math.cos(angle) * offset + plume.driftX * depth, -depth, plume.z + Math.sin(angle) * offset + plume.driftZ * depth,
          randomRange(-0.05, 0.05), randomRange(0.10, 0.32), randomRange(-0.05, 0.05),
          0.0006 + 0.0022 * Math.random() ** 2,
        );
        plume.spawned++;
      }
    }
    this.plumes = this.plumes.filter((plume) => plume.spawned < plume.total);

    // Droplets.
    const landings = [];
    for (let i = this.count - 1; i >= 0; i--) {
      const p = i * 3;
      let vx = this.velocities[p], vy = this.velocities[p + 1], vz = this.velocities[p + 2];
      const radius = this.radii[i];
      const speed = Math.hypot(vx, vy, vz);
      const drag = Math.min(0.00027 / radius * speed * dt, 0.5);
      vx -= vx * drag; vy -= vy * drag; vz -= vz * drag;
      vy -= GRAVITY * dt;
      const x = this.positions[p] + vx * dt;
      const y = this.positions[p + 1] + vy * dt;
      const z = this.positions[p + 2] + vz * dt;
      this.ages[i] += dt;
      if ((y <= 0 && vy < 0) || this.ages[i] > 6) {
        if (y <= 0 && radius > 0.0016) landings.push({ x, z, radius, fallSpeed: -vy, speed: Math.sqrt(vx * vx + vy * vy + vz * vz), velocityX: vx, velocityZ: vz, flight: this.ages[i] });
        this.removeDroplet(i);
        continue;
      }
      this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
      this.velocities[p] = vx; this.velocities[p + 1] = vy; this.velocities[p + 2] = vz;
    }

    // Falling drops ring the surface again. A big one throws a crown of its
    // own, or failing that a few secondary droplets, and each leaves a few
    // foam specks by its size.
    landings.sort((a, b) => b.radius - a.radius);
    let landingCrowns = 0;
    if (landings.length > 0) for (const crown of this.crowns) if (crown.landing) landingCrowns++;
    for (let n = 0; n < landings.length && n < 40; n++) {
      const hit = landings[n];
      const strength = Math.min(hit.radius / 0.005, 2) * Math.min(hit.fallSpeed / 4, 1.5);
      water.addSplat({ x: hit.x, z: hit.z, radius: Math.max(hit.radius * 3, 0.015), velocity: -0.22 * strength, rim: 1.6 });
      const crowned = hit.radius >= LANDING_CROWN_RADIUS && landingCrowns < MAX_LANDING_CROWNS && hit.flight >= LANDING_CROWN_FLIGHT && hit.fallSpeed >= LANDING_CROWN_SPEED;
      if (crowned) {
        this.startLandingCrown(hit);
        landingCrowns++;
      }
      if (hit.radius > 0.004) {
        water.addFoam({ x: hit.x, z: hit.z, radius: hit.radius * 3, amount: 0.05 * strength, lifetime: LANDING_FOAM_LIFETIME, boil: true });
        const sprayCount = crowned ? 0 : Math.random() < LANDING_KICK_CHANCE ? 1 + Math.floor(Math.random() * LANDING_KICK_MOST) : 0;
        for (let s = 0; s < sprayCount; s++) {
          const angle = Math.random() * Math.PI * 2;
          const out = randomRange(0.2, 0.9) * Math.min(hit.fallSpeed / 3, 1.5);
          this.spawnDroplet(hit.x, 0.003, hit.z, Math.cos(angle) * out, randomRange(0.5, 1.8) * Math.min(hit.fallSpeed / 3, 1.5), Math.sin(angle) * out, hit.radius * randomRange(0.3, 0.5));
        }
      }
      const specks = Math.floor((hit.radius - LANDING_SPECK_FREE) / LANDING_SPECK_STEP + Math.random());
      if (specks > 0) this.spawnFoamSpecks(hit.x, hit.z, 0, 2 * hit.radius, specks, 0.02);
    }

    // Crown sheets shed from the rim and tear; their droplets are placed where
    // the sheet is now, so they are not integrated until the next substep.
    for (const crown of this.crowns) crown.update(this.time, dt, this);
    for (const crown of this.crowns.filter((candidate) => candidate.finished)) this.retireCrown(crown);

    // Jet columns pinch off their tips, break up and fall back, the same way.
    for (const column of this.columns) column.update(this.time, dt, this, this.columnWater(column, water));
    for (const column of this.columns.filter((candidate) => candidate.finished)) this.retireColumn(column);

    // Bubbles rise, wobble and burst at the surface.
    for (let i = this.bubbleCount - 1; i >= 0; i--) {
      const p = i * 3;
      const size = this.bubbleSizes[i];
      const rise = THREE.MathUtils.clamp(size * 90, 0.08, 0.32);
      this.bubbleVelocities[p + 1] += (rise - this.bubbleVelocities[p + 1]) * Math.min(dt * 3, 1);
      const wobble = Math.sin(this.time * 9 + this.bubblePhases[i]) * 0.03;
      const x = this.bubblePositions[p] + (this.bubbleVelocities[p] + wobble) * dt;
      const y = this.bubblePositions[p + 1] + this.bubbleVelocities[p + 1] * dt;
      const z = this.bubblePositions[p + 2] + (this.bubbleVelocities[p + 2] - wobble) * dt;
      if (y >= -0.002) {
        if (Math.random() < 0.3) water.addFoam({ x, z, radius: 0.012, amount: BUBBLE_FOAM, lifetime: BOIL_LIFETIME, boil: true });
        // A surfacing bubble floats for a while as a speck its own size (2 to 4 mm across).
        this.foamSpecks.spawn(x, z, randomRange(-0.004, 0.004), randomRange(-0.004, 0.004), this.time, THREE.MathUtils.clamp(2 * size, 0.002, 0.004));
        this.removeBubble(i);
        continue;
      }
      this.bubblePositions[p] = x; this.bubblePositions[p + 1] = y; this.bubblePositions[p + 2] = z;
    }

    this.instancePositions.needsUpdate = true;
    this.instanceRadii.needsUpdate = true;
    this.instanceVelocities.needsUpdate = true;
    this.instanceLenses.needsUpdate = true;
    this.particleGeometry.instanceCount = this.count;
    this.bubblePositionAttribute.needsUpdate = true;
    this.bubbleSizeAttribute.needsUpdate = true;
    this.bubblePoints.geometry.setDrawRange(0, this.bubbleCount);
    this.foamSpecks.commit(this.time);
  }

  // ---- rendering --------------------------------------------------------

  /**
   * The fluid targets for a canvas of width × height device pixels at
   * fluidScale of its resolution. The info target is half float (src/shaders/
   * fluid.js says what that keeps of it: a column's roundness only as 0 or 1,
   * which changes a few pixels where the jet's bulb meets its column).
   */
  resize(width, height, fluidScale) {
    this.fluidScale = fluidScale;
    const w = Math.max(2, Math.round(width * fluidScale));
    const h = Math.max(2, Math.round(height * fluidScale));
    if (this.targets) Object.values(this.targets).forEach((t) => t.dispose());
    this.targets = {
      info: createFloatTarget(w, h, { type: THREE.HalfFloatType, depth: true }),
      optics: createFloatTarget(w, h, { type: THREE.HalfFloatType, filter: THREE.LinearFilter }),
    };
    this.fluidSize = new THREE.Vector2(w, h);
  }

  /**
   * Bring the cavities to the current time and hand the surface the circles
   * its patch dips from: once per rendered frame, before the main scene is
   * drawn (main.js calls it; prepareFrame does if it has not been).
   */
  prepareScene() {
    if (this.sceneTime === this.time) return;
    this.sceneTime = this.time;
    const shapes = [];
    for (const cavity of this.cavities) {
      cavity.updateGeometry(this.time);
      const shape = cavity.pushShape();
      if (shape) shapes.push(shape);
    }
    this.surface?.setCavities(shapes);
  }

  /**
   * Bring the cavities, crown sheets and jet columns to the current time and
   * list what the mirror draws: once per rendered frame, before the mirror
   * pass, not per substep.
   */
  prepareFrame() {
    this.prepareScene();
    for (const crown of this.crowns) crown.updateGeometry(this.time);
    for (const column of this.columns) column.updateGeometry(this.time);
    this.particleMesh.visible = this.count > 0;
    const list = this.mirrorList;
    list.length = 0;
    // The droplets join only while one is big enough to see in the mirror; off
    // the mirror layer otherwise, since the mirror pass draws what is on it.
    let mirroredDrops = false;
    for (let index = 0; index < this.count && !mirroredDrops; index++) mirroredDrops = this.radii[index] >= MIRROR_DROP_RADIUS;
    if (mirroredDrops) {
      this.particleMesh.layers.enable(MIRROR_LAYER);
      list.push(this.particleMesh);
    } else {
      this.particleMesh.layers.disable(MIRROR_LAYER);
    }
    for (const crown of this.crowns) list.push(mirrorWith(crown.mesh, this.sheetMirrorMaterial));
    for (const column of this.columns) list.push(mirrorWith(column.mesh, this.columnMirrorMaterial));
  }

  /** What is alive to be mirrored this frame (after prepareFrame): objects tagged by mirrorWith. Empty when the splash is over. */
  mirrorObjects() { return this.mirrorList; }

  /** Grow `box` around the droplets in the air that the mirror draws (their centres). */
  dropletBounds(box) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const positions = this.positions;
    for (let index = 0; index < this.count * 3; index += 3) {
      if (this.radii[index / 3] < MIRROR_DROP_RADIUS) continue;
      const x = positions[index], y = positions[index + 1], z = positions[index + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (minX <= maxX) box.union(this.dropletBox.set(this.dropletMin.set(minX, minY, minZ), this.dropletMax.set(maxX, maxY, maxZ)));
  }

  /** The world box around everything mirrorObjects() draws, padded by MIRROR_PAD. */
  mirrorBounds(box) {
    box.makeEmpty();
    for (const object of this.mirrorList) {
      if (object.userData.mirrorBounds) { object.userData.mirrorBounds(box); continue; }
      object.geometry.computeBoundingBox();
      box.union(this.dropletBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
    }
    if (!box.isEmpty()) box.expandByScalar(MIRROR_PAD);
    return box;
  }

  /** The mirror pass's view (its camera and the height of its target in pixels), before it draws mirrorObjects(). */
  setMirrorView(mirrorCamera, height) {
    const projScale = mirrorCamera.projectionMatrix.elements[5] * height * 0.5;
    this.dropMirrorMaterial.uniforms.uProjScale.value = projScale;
    this.dropMirrorMaterial.uniforms.uStreakSeconds.value = this.streakSeconds;
    this.dropMirrorMaterial.uniforms.uSunDirView.value.copy(this.lighting.sunDirection).transformDirection(mirrorCamera.matrixWorldInverse);
    this.columnMirrorMaterial.uniforms.uProjScale.value = projScale;
  }

  setPassMaterials(particleMaterial, sheetMaterial, columnMaterial) {
    this.particleMesh.material = particleMaterial;
    for (const crown of this.crowns) crown.mesh.material = sheetMaterial;
    for (const column of this.columns) column.mesh.material = columnMaterial;
  }

  /** The scene tone-mapped to the canvas (or target), with no water in the air. */
  toneMap(renderer, sceneTarget, output = null) {
    this.toneMapPass.material.uniforms.uScene.value = sceneTarget.texture;
    this.toneMapPass.material.uniforms.uExposure.value = this.lighting.exposure;
    this.toneMapPass.render(renderer, output);
  }

  /** Draw droplets, crown sheets and jet columns over the finished scene and present the frame to the canvas (or target). After prepareFrame. */
  render(renderer, camera, sceneTarget, output = null) {
    if (this.count === 0 && this.crowns.length === 0 && this.columns.length === 0) {
      // Nothing in the air: no fluid pass, no clear, no read of their targets.
      this.toneMap(renderer, sceneTarget, output);
      return;
    }
    const { info, optics } = this.targets;
    const projScale = camera.projectionMatrix.elements[5] * this.fluidSize.y * 0.5;
    this.sunDirView.copy(this.lighting.sunDirection).transformDirection(camera.matrixWorldInverse);
    for (const material of [this.depthMaterial, this.thicknessMaterial]) {
      material.uniforms.uProjScale.value = projScale;
      material.uniforms.uStreakSeconds.value = this.streakSeconds;
      material.uniforms.uSunDirView.value.copy(this.sunDirView);
      material.uniforms.uHazeRadius.value = HAZE_RADIUS * this.fluidScale;
    }
    for (const material of [this.columnDepthMaterial, this.columnThicknessMaterial]) material.uniforms.uProjScale.value = projScale;
    for (const material of [this.depthMaterial, this.thicknessMaterial, this.sheetDepthMaterial, this.sheetThicknessMaterial, this.columnDepthMaterial, this.columnThicknessMaterial]) {
      material.uniforms.uSceneDepth.value = sceneTarget.depthTexture;
      material.uniforms.uResolution.value.copy(this.fluidSize);
    }
    renderer.setClearColor(0x000000, 0);
    this.setPassMaterials(this.depthMaterial, this.sheetDepthMaterial, this.columnDepthMaterial);
    renderer.setRenderTarget(info);
    renderer.clear(true, true, false);
    renderer.render(this.particleScene, camera);

    this.setPassMaterials(this.thicknessMaterial, this.sheetThicknessMaterial, this.columnThicknessMaterial);
    renderer.setRenderTarget(optics);
    renderer.clear(true, false, false);
    renderer.render(this.particleScene, camera);

    const composite = this.compositePass.material.uniforms;
    composite.uScene.value = sceneTarget.texture;
    composite.uFluidInfo.value = info.texture;
    composite.uOptics.value = optics.texture;
    composite.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    composite.uCameraWorld.value.copy(camera.matrixWorld);
    composite.uSunDirView.value.copy(this.sunDirView);
    composite.uExposure.value = this.lighting.exposure;
    composite.uFluidScale.value = this.fluidScale;
    composite.uProjScale.value = projScale;
    this.compositePass.render(renderer, output);
  }

  /**
   * The simulated length of the frame about to be stepped, given before its
   * substeps: the crown's tear and the jet's breakup advance once per frame,
   * and the motion streaks follow it (shutter ≈ half a frame).
   */
  setFrameSeconds(seconds) {
    this.frameSeconds = seconds;
    this.streakSeconds = seconds * 0.5;
  }

  /**
   * After the camera's projection changes: the bubbles' and foam specks'
   * sizes on screen. height: the main pass's in device pixels; underHeight:
   * the under-water pass's, which draws the bubbles.
   */
  updateViewUniforms(camera, height, pixelRatio, underHeight = height) {
    this.bubbleMaterial.uniforms.uProjScale.value = camera.projectionMatrix.elements[5] * underHeight * 0.5;
    this.foamSpecks.setView(camera, height, pixelRatio);
  }
}
