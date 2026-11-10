// The water cannon (src/things.js 'cannon', a thing with a `stream`): a
// monitor nozzle held in the hand that shoots a stream of water at the aimed
// spot for as long as the press lasts (src/main.js: a tap is a squirt, the
// water already let out flies on and lands after). The strip's slider is its
// pressure, from a weak jet to a fire truck's deck gun.
//
// The nozzle (nozzle): the pressure P (bar) sets the exit speed by
// Bernoulli, V = sqrt(2P/ρ) (10 m/s at 0.5 bar, 45 at 10), and the bore
// grows with it (`stream.nozzle`, the radius at the slider's ends: a line
// rated for more carries more), so the flow Q = πr²V runs from under a
// litre a second to some ninety.
//
// The stream is no solver (CLAUDE.md: the jet column is the one solver). Each
// physics step while it fires records a parcel let out then: its launch
// velocity (aimVelocity: the low parabola from the nozzle to the aim, the
// farthest arc when the aim is out of reach, so the stream falls short
// honestly) and where and when it lands. A parcel is wherever its parabola
// puts it, so the stream in the air is the curve of the parcels not yet
// landed, bending as the aim is swept (its landing lags the aim by the
// flight time, as a real stream's does), and when the nozzle shuts its tail
// leaves the nozzle and the slug flies on.
//
// Its skin (skin, ROUGH): a stream under pressure is white, not glass. Its
// turbulence roughens its surface from x = ROUGH.onset · d · We^ROUGH.power
// from the nozzle (Wu & Faeth's form; a few diameters for the deck gun, a few
// tens for the weakest jet) and throws a sheath of drops off it, so what is
// seen is a white rope, wholly white by ROUGH.whole of that length and
// already veiled from the muzzle (ROUGH.veil): the sheath starts ROUGH.radius
// of the water's radius and widens by ROUGH.spread a metre, the same drops
// over a wider way, so it thins as it goes (the optical depth through its
// middle, ROUGH.depth at first). The water itself holds together for a
// length L_b = BREAKUP.length · d · We^BREAKUP.power (We = ρV²d/σ; about two
// metres for the weakest jet, tens for the deck gun: a fire stream reaches
// the pond whole); from ROUGH.brokenFrom of it holes open in the rope, and
// by BREAKUP.drawn of it there is nothing left to draw but drops. Each step
// mist leaves the rough skin (ROUGH.shed of the flow; BREAKUP.mist of it
// where it has broken up: src/spray.js sprites, flown in the vertex shader)
// and, where it has broken up, now and then a drop big enough to land and
// ring on its own (src/splash.js spawnDroplet).
//
// The landing, each step for each parcel that lands in it (so a seeded game
// goes alike at any frame rate, and 240 of them a second sum to the flow):
// a stream really drills metres down; what shows is a boiling crater a few
// footprints wide, so the solver (src/spectralWater.js addSplat) is pushed
// down over the footprint by IMPACT.push of the landing speed for the step,
// a crater with a rim, its centre jittered within the footprint (the
// turbulence that ruffles the water round a boil, from the stream's own
// seeded draws), and the rest of the stream's momentum goes to the churn: a
// boil of foam stamped each step, each stamp its own size and strength,
// laid onward of the landing the way the stream glances on (IMPACT.trail),
// wider the farther (addFoam: a ragged white streak, never a disc), foam
// specks drifting out of it (src/foamSpecks.js), drops torn off as it
// glances (IMPACT.sheet of its water as spray, thrown as the fan's middle
// below is, kicked about, and pulsing from step to step as a jet's splash
// does), big drops now and then (IMPACT.drops a second) and a few stray
// drops' rings around it (src/dropRings.js). Onset and shutoff ring the
// water by themselves. A floater in the footprint is shoved along the
// stream (Rock.knock, the stream's momentum on it, no more than
// IMPACT.pushCap a step), and the fish are frightened (the caller's
// startle). On ice the landing wets it instead (the caller's wetIce) and
// the sheet bounces. Everything is computed on still water; the rope's
// shader lifts it under a gale (galeLift), as the spray's and the white
// water's do.
//
// Its fan (throwFan, FAN): the stream comes in low (some 12° from the water
// at 3 bar), so it glances, and most of what it throws goes on the way it
// was going: a rooster tail. That is no cloud that hangs and swells (it was
// drawn so once, and read as smoke) but water in flight, thrown, streaked
// the way it goes and down again within half a second; and it is one sheet,
// not several plumes (drawn as five, their gaps showed as rays). So each
// landing parcel is thrown again as a line of water across the fan, each
// part of it (the fan's columns, src/sprayFan.js) launched off the water on
// a parabola of its own: fastest, steepest and farthest down the middle
// (FAN.speed, FAN.steep, on FAN.rise and FAN.lift times the angle the stream
// came down at), slower, lower and shorter towards the sides (FAN.spread),
// so the sheet is arched, and has height and width from wherever it is
// seen. No splash is steady, and none repeats: the fan wanders (FAN.sway) at
// a few places across it (FAN.controls, smooth between them), each a random
// walk drawn back to its mean, for how much water goes that way (so it
// comes in slugs, thick and thin) and, more slowly, for how fast and where
// (water whose speed changed within a flight would overtake itself, the
// sheet folding back into a hook), so its shape is lopsided and shifting.
// And it is no smooth sheet but tongues, as a splash's crown is: each part
// across it carries water by a walk of its own (FAN.fingers), and lasts as
// a sheet the longer the more it carries (FAN.reach, FAN.tongue), so there
// are long tongues and short, coming and going, with gaps between them back
// almost to the stream's foot. It starts as wide as the stream's sheath,
// thins as it widens and breaks up from almost the start (FAN.brokenFrom);
// where a part's sheet ends its water flies on as drops (FAN.drops, off the
// tongues: src/spray.js sprites with the sheet's velocity there and a
// little kick), which land. Where the fan comes down it rains: a few parts
// of it each step, by chance, strike the solver (FAN.pock: the chop of rain on
// water), draw a drop's ring (FAN.rings), or leave froth too faint to see by
// itself (FAN.froth), so froth gathers under the fan in a second or so and
// goes as slowly (stamps strong enough to see at once blinked on and off).
// On ice it glances the same, and leaves nothing where it lands.
//
// Its boil (whiten, WHITE; src/whiteWater.js draws it): at the stream's foot
// the water it drives air into heaps up white. Its scale is set by the
// stream's momentum flux ρQU against the weight of the water it heaps:
// L = (QU/g)^(1/3) (9 cm for the weakest jet, 27 at 3 bar, 74 for the deck
// gun), its speeds go as sqrt(gL) and its times as T = sqrt(L/g), so a
// bigger stream's boil is the same boil scaled up. Each landing parcel, by
// chance, throws WHITE.rate puffs each T, born about the landing and a
// little ahead, up a little (WHITE.rise) and rolling on a little
// (WHITE.glance), held by the air's drag, gone within WHITE.life (a third of
// a second at 3 bar: nothing of it hangs once the stream is shut); the rate
// and the rise pulse in two waves of their own (WHITE.pulse), as a plunging
// jet's cavity opens and collapses. Its draws are a stream of their own
// (whiteRandom, the plumes' sway with them), so drawing it shifts none of
// the stream's other draws; none on ice.
//
// Drawn once a frame (drawAt): the rope's rings (src/streamSheath.js, shaded
// by src/shaders/stream.js) along each piece of the stream in the air, from
// the muzzle while the nozzle is on (whatever the last parcel's head start)
// to the water where its head has landed, each ring where a parcel is or
// between two (sampleAt), with the skin's radius and depth there; a free
// end (a slug's tail after the nozzle shuts, a new stream's head) thins to
// nothing over ROUGH.taper. The fan is a grid of its own (drawFan,
// src/sprayFan.js) on the same program, shaded as a sheet of spray. The stream's randomness is its own (seededRandom
// of the nozzle's place, its start and its pressure), never Math.random.
//
// Pure bookkeeping (the sheath and the fan are the caller's, or none), so tools can drive
// it in Node with a stand-in water and splash (tools/thing-probe.mjs).
import * as THREE from 'three';
import { seededRandom, sprayDrops } from './spray.js';
import { SHEATH } from './streamSheath.js';
import { FAN_GRID } from './sprayFan.js';

const GRAVITY = 9.81;
const WATER_DENSITY = 1000;
const SURFACE_TENSION = 0.072;
const BAR = 1e5;

export const CANNON = {
  burstSeconds: 1.5,     // s: a throw's burst (throwAt, Space, the Throw button, the harness)
  longestFlight: 2.5,    // s: no parcel is kept in the air longer (the records' room)
  capacity: 1024,        // parcels in flight at most (longestFlight × 240 steps, with room)
  muzzle: 2.4,           // the stream leaves this many of the thing's radii from the hand, along the aim (the nozzle's length)
};
export const BREAKUP = { length: 35, power: 0.2, widen: 2.5, drawn: 1.5, mist: 0.1, mistRadius: 0.0005, samples: 2, kick: 0.03, drops: 30, dropRadius: [0.002, 0.004] };
export const IMPACT = {
  push: 0.35,            // the step's push down on the footprint: this share of the landing speed, over the step
  jitter: 1.0,           // the push's centre wanders this share of the footprint
  footprint: 1.5,        // the crater's sigma in footprints (the stream's radius where it lands)
  rim: 1.7,              // the crater's rim (addSplat)
  boil: 0.5,             // foam stamped a second, times the landing speed over 10 m/s, saturating (addFoam)...
  boilRadii: [0.5, 1.6], // ...each stamp this many footprints in radius, drawn between...
  boilReach: 1.5,        // ...placed within this many footprints of the landing
  boilLife: 0.6,         // s
  trail: 0.05,           // the stamps are laid onward of the landing by up to the way the stream flies in this (s)...
  trailWiden: 3,         // ...this many times wider at the far end, less one
  specks: 0.5,           // a foam speck a step, as a chance (src/foamSpecks.js)...
  speckDrift: [0.1, 0.4],   // ...drifting out at m/s between
  sheet: 0.1,            // the share of the landing water torn off as drops...
  sheetRadius: 0.0007,   // ...of this mean radius (m), thrown as the fan's middle is (FAN)...
  sheetKick: 0.3,        // ...kicked by up to this share of its speed...
  pulse: [0.3, 1.7],     // ...pulsing from step to step between these shares
  drops: 120,            // big drops a second at 20 m/s (spawnDroplet: the chunks of the splash, which land and ring)
  dropRadius: [0.0015, 0.004],
  dropUp: [0.05, 0.2],   // their speed up, shares of the landing speed
  dropForward: 0.4,      // and onward, a share of the landing velocity
  rings: 0.1,            // a stray drop's ring a step, as a chance (src/dropRings.js)
  ringReach: [2, 6],     // footprints out
  startleEvery: 0.25,    // s between frights while landing goes on
  pushCap: 0.015,        // m/s a step: the most a floater is shoved
  boilFade: 1.0,         // s after the last landing the stream still counts as active (its boil)
};
// The stream's skin (the header): where it goes rough and white, and the sheath of drops it then wears (src/streamSheath.js).
export const ROUGH = {
  onset: 1.6e4,       // rough from this · d · We^power metres from the nozzle...
  power: -0.67,       // ...(Wu & Faeth's form; their 2000 is a pipe's fully developed turbulence, and a nozzle's contraction leaves the skin smooth far longer: a fire stream is glass for its first foot or so)...
  whole: 2.5,         // ...and wholly white by this many of that
  radius: 1.7,        // the sheath's radius where it starts, in the water's (the rope seen is some 0.7 of the sheath: src/shaders/stream.js)
  spread: 0.006,      // and it widens by this each metre flown
  depth: 4,           // the optical depth through its middle, wholly white; less as it widens (the same drops over a longer way across)
  brokenFrom: 0.6,    // holes open in it from this share of the breakup length, to BREAKUP.drawn of it, where it ends
  taper: 0.012,       // s: a free end (a slug's tail, a new stream's head) thins over the water let out in this long
  veil: 0.4,          // from the muzzle the stream wears this share of the sheath already (the air a stream under pressure carries: a thin jet of clear water would hardly be seen)
  shed: 0.01,         // the share of the flow the rough skin throws off as mist (BREAKUP.mist where it has broken up)
};
// The fan of spray the stream throws off the water where it lands (the header; src/sprayFan.js draws it).
export const FAN = {
  capacity: 512,        // moments of it in the air at most
  spread: 1.05,         // rad: its headings, to either side of the stream's way (some two thirds of that is seen: the sheet thins to nothing towards its sides)
  speed: [0.22, 0.15],  // thrown at this share of the landing speed down its middle, and at its sides...
  rise: 0.2,            // ...up at this (rad)...
  lift: 1.0,            // ...and this many times the angle the stream came down at...
  steep: [1.1, 0.45],   // ...times this down its middle, and at its sides
  width: 1.3,           // it starts this many of the stream's sheath across
  // It wanders, as a splash's turbulence does and no wave would: at `controls` places across it (smooth between
  // them), its speed (a share of it), its elevation and heading (rad) and how much water goes that way (a share),
  // each a random walk drawn back to nothing (its memory `time`, in T = sqrt(L/g), the white water's; `slow` times
  // that for how fast and where it goes: a sheet whose heading whips about is a ribbon, and one whose speed changes
  // within a flight overtakes itself and folds back into a hook), smoothed over `smooth` of that.
  controls: 5,
  sway: { speed: 0.22, steep: 0.09, yaw: 0.1, strength: 0.7, time: 0.6, slow: 4, smooth: 0.3 },
  // And each part across it by itself (`memory`, in T: about a flight, so they come and go as they fly), in how
  // much water it carries: the fan has fingers. Only its water: parts thrown at speeds of their own crumple the
  // sheet into creases.
  fingers: { strength: 0.9, memory: 3 },
  // The sheet does not last its flight: it comes apart into drops, which fly on and land (FAN.drops). A part thins
  // from `fadeFrom` of its `reach` to nothing by it, and its reach (a share of its flight) is its finger's: the
  // least where the finger is at or under `tongue`'s first, the most at or over its second (in the fingers' own
  // spread, some half of one). So the fan is tongues of water, long and short, with gaps between them back almost to
  // the stream's foot, as a splash's crown is, and its far edge their ends, never the arch's own outline.
  fadeFrom: 0.2,
  reach: [0.28, 0.95],
  tongue: [-0.6, 0.9],
  depth: 6,             // the optical depth through it where it starts, seen square on; less as it widens
  grain: 3,             // m: a fan whose middle's speed² / g is this has the shader's own count of streaks across it; a bigger one more in proportion, so they are no wider
  brokenFrom: 0.02,     // holes open in it from this share of a part's flight...
  brokenMost: 0.9,      // ...to this much by the end of its flight
  // Where it comes down it rains on the water: `rain` parts of it a step, each by chance
  rain: 3,
  pock: 0.12,           // striking the solver (addSplat: the chop of rain on water)...
  pockRadius: [0.015, 0.03],   // ...over this radius (m)...
  pockPush: [0.02, 0.07],      // ...down at this speed (m/s),
  rings: 0.008,         // drawing a drop's ring (src/dropRings.js),
  froth: 0.06,          // or leaving froth: a stamp too faint to see by itself (addFoam)...
  frothAmount: 0.008,   // ...this strong...
  frothRadius: 0.08,    // ...this share of the fan's width there in radius...
  frothLife: 2.0,       // ...lasting this long (s), so froth gathers under the fan in a second or so and goes as slowly
  // Drops leave it where it comes apart: at `drops` places on it a step, the thicker of two parts drawn (so off
  // its tongues), between these shares of that part's reach
  drops: 3,
  dropsFrom: [0.55, 1.1],
  dropShare: 0.1,       // this share of the flow in all...
  dropRadius: 0.0013,   // ...in drops of this mean radius (m)...
  kick: 0.06,           // ...kicked by this share of the sheet's speed there: they stream on off the tongue, a little apart
};
// The white water where it lands (the header; src/whiteWater.js): its scale is the length L = (QU/g)^(1/3) at which
// the stream's momentum flux ρQU heaps water up against its weight (9 cm for the weakest jet, 27 at 3 bar, 74 for the
// deck gun), its speeds go as sqrt(gL) and its times as sqrt(L/g) (T), so a bigger stream's churn is the same churn
// scaled up, with as many lumps.
export const WHITE = {
  rate: 10,               // puffs each T, times the pulse (60 a second at 3 bar)...
  pulse: 0.6,             // ...which swings the rate by up to this share (and the rise by up to its square)...
  pulseRates: [0.45, 0.72],   // ...in two waves of these many cycles each T (2.7 and 4.3 Hz at 3 bar)
  place: [-0.1, 0.3],     // born this many L along the stream from the landing...
  aside: 0.15,            // ...and up to this many to either side
  rise: [0.2, 0.6],       // up at these many sqrt(gL)...
  glance: [0.01, 0.06],   // ...and on with this share of the landing velocity's horizontal part (the fan carries the rest: FAN)...
  fan: 0.4,               // ...in a fan this wide to either side (rad) of the onward way (all round for a jet coming straight down)
  spread: 0.3,            // and out at up to this many sqrt(gL), any way
  drag: 0.6,              // the drag's response time, in T
  size: [0.3, 0.5],       // across at birth, in L...
  swell: [1.3, 1.8],      // ...and at death, times that
  life: [1.2, 2.4],       // in T: a boil at the stream's foot, gone as soon as the stream is
};

/** The nozzle at `pressure` bar for a thing's `stream`: its radius (m), exit speed (m/s), flow (m³/s), breakup length (m) and where its skin roughens (`onset`, m). */
export function nozzle(pressure, stream) {
  const { min, max } = stream.pressure;
  const share = THREE.MathUtils.clamp((pressure - min) / Math.max(max - min, 1e-9), 0, 1);
  const radius = stream.nozzle[0] + (stream.nozzle[1] - stream.nozzle[0]) * share;
  const speed = Math.sqrt((2 * pressure * BAR) / WATER_DENSITY);
  const flow = Math.PI * radius * radius * speed;
  const diameter = 2 * radius;
  const weber = (WATER_DENSITY * speed * speed * diameter) / SURFACE_TENSION;
  return { radius, speed, flow, breakup: BREAKUP.length * diameter * weber ** BREAKUP.power, onset: ROUGH.onset * diameter * weber ** ROUGH.power };
}

/**
 * The launch velocity from `hand` ({x, y, z}, over the water at y 0) to the
 * aim (x, z) on it at `speed`: the low parabola, or, out of reach, the
 * farthest one (`short` then), with its flight time (s). `out`, if given, is
 * written and returned.
 */
export function aimVelocity(hand, x, z, speed, out = { vx: 0, vy: 0, vz: 0, flight: 0, short: false }) {
  const dx = x - hand.x, dz = z - hand.z;
  const distance = Math.hypot(dx, dz);
  const height = hand.y;   // the hand over the water
  const speedSquared = speed * speed;
  // tan θ = (V² − sqrt(V⁴ − g(gD² − 2hV²))) / (gD), the low solution.
  const discriminant = speedSquared * speedSquared - GRAVITY * (GRAVITY * distance * distance - 2 * height * speedSquared);
  let angle, short = false;
  if (discriminant >= 0 && distance > 1e-6) {
    angle = Math.atan((speedSquared - Math.sqrt(discriminant)) / (GRAVITY * distance));
  } else {
    // The farthest arc from this height: tan θ = V / sqrt(V² + 2gh).
    angle = Math.atan(speed / Math.sqrt(speedSquared + 2 * GRAVITY * Math.max(height, 0)));
    short = true;
  }
  const horizontal = speed * Math.cos(angle), vertical = speed * Math.sin(angle);
  const directionX = distance > 1e-6 ? dx / distance : 0, directionZ = distance > 1e-6 ? dz / distance : -1;
  out.vx = horizontal * directionX; out.vy = vertical; out.vz = horizontal * directionZ;
  // y(T) = h + vy·T − ½gT² = 0.
  out.flight = (vertical + Math.sqrt(vertical * vertical + 2 * GRAVITY * Math.max(height, 0))) / GRAVITY;
  out.short = short;
  return out;
}

/** The arc length flown in `age` seconds from a launch at (horizontal, vertical) speeds: ∫|v| dt in closed form. */
export function arcLength(horizontal, vertical, age) {
  const across = Math.max(horizontal, 1e-6);
  const integral = (u) => 0.5 * (u * Math.sqrt(across * across + u * u) + across * across * Math.asinh(u / across));
  return (integral(vertical) - integral(vertical - GRAVITY * age)) / GRAVITY;
}

const smoothstep = (edge0, edge1, value) => { const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1); return t * t * (3 - 2 * t); };

/**
 * The stream's skin `along` metres from a nozzle of bore `radius`, rough from
 * `onset` and broken up by `breakup` (ROUGH): how `white` it is (0 glass, 1
 * wholly white), the sheath's `radius`, the optical `depth` through its
 * middle and how far it has `broken` up (0 to 1). Written into `out`.
 */
export function skin(radius, onset, breakup, along, out = {}) {
  const white = smoothstep(onset, ROUGH.whole * onset, along);
  const start = ROUGH.radius * radius;
  const sheath = (start + ROUGH.spread * Math.max(along - onset, 0)) * (1 + Math.max(along / breakup - 1, 0));
  const broken = smoothstep(ROUGH.brokenFrom * breakup, BREAKUP.drawn * breakup, along);
  out.white = white; out.radius = sheath; out.broken = broken;
  out.depth = ROUGH.depth * Math.max(white, ROUGH.veil) * (start / sheath) * (1 - broken * broken);
  return out;
}

// What a sample of the stream mixes of its two parcels' launches (sampleAt).
const SAMPLED = ['time', 'vx', 'vy', 'vz', 'x', 'y', 'z', 'radius', 'speed', 'breakup', 'onset'];

export class WaterCannon {
  /**
   * @param water the solver (addSplat, addFoam, holds)
   * @param splash the SplashSystem (its spray, its clock, spawnDroplet, its foam specks), or a stand-in
   * @param dropRings src/dropRings.js (or null)
   * @param startle (x, z) → frighten the fish there (or null)
   * @param wetIce (x, z, radius) → true if ice lies there, wetted (or null)
   * @param sheath src/streamSheath.js: the white rope the stream is drawn as (or null: nothing drawn of it)
   * @param fan src/sprayFan.js: the sheet its fan of spray is drawn as (or null)
   */
  constructor({ water, splash, dropRings = null, startle = null, wetIce = null, sheath = null, fan = null }) {
    this.sheath = sheath;
    this.fan = fan;
    this.sample = { centre: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, age: 0, along: 0 };
    this.skinScratch = {};
    this.water = water;
    this.splash = splash;
    this.dropRings = dropRings;
    this.startle = startle;
    this.wetIce = wetIce;
    this.burst = null;        // the nozzle while it is on or just shut: { tOn, tOff, hand, aim, nozzle, radius, share, phase, handle }
    this.random = () => 0.5;  // the stream's own draws (seededRandom), from its start
    this.whiteRandom = () => 0.5;   // and its white water's (whiten), a stream of their own
    this.whitePhases = [0, 0];      // its pulse's (WHITE.pulseRates)
    this.lastTime = 0;
    this.landings = 0;        // parcels landed since the last reset
    this.lastLanding = -Infinity;
    this.lastStartle = -Infinity;
    this.landing = null;      // where the last parcel landed, this step: { x, z, radius, speed, directionX, directionZ }
    this.aimScratch = { vx: 0, vy: 0, vz: 0, flight: 0, short: false };
    this.exitScratch = { x: 0, y: 0, z: 0 };
    // The parcels: a ring of records, `head` the oldest still in the air, `count` all ever recorded.
    const capacity = CANNON.capacity;
    this.records = {
      time: new Float64Array(capacity), vx: new Float64Array(capacity), vy: new Float64Array(capacity), vz: new Float64Array(capacity),
      x: new Float64Array(capacity), y: new Float64Array(capacity), z: new Float64Array(capacity),
      flight: new Float64Array(capacity), radius: new Float64Array(capacity), speed: new Float64Array(capacity), breakup: new Float64Array(capacity),
      landX: new Float64Array(capacity), landZ: new Float64Array(capacity),
      onset: new Float64Array(capacity),        // where its skin roughens (nozzle)
      lead: new Uint8Array(capacity),           // the first let out after the nozzle was off: no water joins it to the parcel before
      handle: new Array(capacity).fill(null),   // the burst's handle each parcel was let out by
    };
    this.head = 0;
    this.count = 0;
    // The fan (FAN): a ring of the moments it was thrown at, `head` the oldest with any of it still in the air; for
    // each moment the launch of each part across it (the fan's columns).
    const moments = FAN.capacity, parts = FAN_GRID.columns;
    this.tail = {
      head: 0, count: 0,
      drift: new Float64Array(FAN.controls * 8),    // its wander (FAN.sway): at each control, for each of speed, elevation, heading and strength, the walk and its smoothed value
      swayed: new Float64Array(FAN.controls * 4),   // the smoothed values, this landing
      comb: new Float64Array(parts),                // each part's own wander (FAN.fingers)
      time: new Float64Array(moments), x: new Float64Array(moments), z: new Float64Array(moments),
      sideX: new Float64Array(moments), sideZ: new Float64Array(moments),   // level and square to the stream's way there
      emitted: new Float64Array(moments),           // when its water left the nozzle (the streaks ride on from the stream's)
      width: new Float64Array(moments),             // how wide it starts
      life: new Float64Array(moments),              // its longest part's flight
      flow: new Float64Array(moments),              // the stream's then (m³/s)
      grain: new Float64Array(moments),             // how many times the streaks across it (FAN.grain)
      lead: new Uint8Array(moments),                // the first thrown after a gap in the landings
      ice: new Uint8Array(moments),                 // thrown off ice
      velocity: new Float32Array(moments * parts * 3),   // each part's launch
      strength: new Float32Array(moments * parts),       // how much water each part carries, against the mean
      reach: new Float32Array(moments * parts),          // the share of its flight each part lasts as a sheet (FAN.reach)
    };
    this.thrown = { vx: 0, vy: 0, vz: 0 };   // the fan's middle's launch at the last landing (the spray goes with it)
    this.stepSeconds = 1 / 240;
  }

  /** Parcels in the air. */
  get inAir() { return this.count - this.head; }
  /** The nozzle is on (a press, or a burst not yet over). */
  get firing() { return this.burst !== null && this.lastTime < this.burst.tOff; }
  /** Something of the stream is happening: the nozzle on, water in the air, or its boil still fading. */
  get active() { return this.firing || this.inAir > 0 || this.fanInAir > 0 || this.lastTime < this.lastLanding + IMPACT.boilFade; }
  /** Moments of the fan with any of it still in the air. */
  get fanInAir() { return this.tail.count - this.tail.head; }
  /** A parcel has met the water since the last reset (the harness's hasImpacted). */
  get landed() { return this.landings > 0; }
  /** Where the nozzle is aimed ({ x, z }), or null. */
  get aim() { return this.burst ? { ...this.burst.aim } : null; }
  /** The pressure's share of its slider while firing, else 0 (the sound's strength). */
  get strength() { return this.firing ? this.burst.share : 0; }

  /**
   * Turn the nozzle on at `time`: from `hand` (a Vector3-like), at the aim
   * (x, z), at `pressure` bar through `thing`'s stream, for `seconds` (a
   * press's until stop; a burst's). Returns the burst's handle, which the
   * probes read as they read a thrown thing's: `thing`, `state` ('stream',
   * then 'done'), `position` (the first landing), `quaternion`.
   */
  start({ hand, x, z, pressure, thing, radius, time, seconds = Infinity }) {
    const stream = thing.stream;
    const made = nozzle(pressure, stream);
    const share = THREE.MathUtils.clamp((pressure - stream.pressure.min) / Math.max(stream.pressure.max - stream.pressure.min, 1e-9), 0, 1);
    const handle = { thing, state: 'stream', position: new THREE.Vector3(x, 0, z), quaternion: new THREE.Quaternion(), fadedAt: undefined, isRock: false, landedAt: null };
    if (this.burst) this.burst.handle.state = 'done';
    this.random = seededRandom(hand.x, hand.z, time, pressure);
    this.whiteRandom = seededRandom(hand.x, hand.z, time, pressure, 1);
    this.whitePhases = [this.whiteRandom() * Math.PI * 2, this.whiteRandom() * Math.PI * 2];
    this.tail.drift.fill(0);
    for (let part = 0; part < this.tail.comb.length; part++) this.tail.comb[part] = 2 * (this.whiteRandom() + this.whiteRandom() + this.whiteRandom() - 1.5);
    this.burst = { tOn: time, tOff: time + seconds, hand: { x: hand.x, y: hand.y, z: hand.z }, aim: { x, z }, nozzle: made, radius, share, handle };
    this.lastTime = time;
    return handle;
  }

  /** The aim the next parcels fly at (the sweep). */
  aimAt(x, z) {
    if (this.burst) { this.burst.aim.x = x; this.burst.aim.z = z; }
  }

  /** Shut the nozzle at `time`: the parcels already out fly on. */
  stop(time) {
    if (this.burst) this.burst.tOff = Math.min(this.burst.tOff, time);
  }

  /** The exit: the hand, out along the aim by the nozzle's length (CANNON.muzzle radii). */
  exitPoint(hand, x, z, radius, out) {
    const dx = x - hand.x, dz = z - hand.z;
    const distance = Math.hypot(dx, dz) || 1;
    const along = CANNON.muzzle * radius;
    out.x = hand.x + (dx / distance) * along; out.y = hand.y; out.z = hand.z + (dz / distance) * along;
    return out;
  }

  /**
   * One physics step to `time`, `dt` long (the header): the parcel let out,
   * the mist off the ruffled stream, and the landing of every parcel that
   * comes down in it, on the water (`rocks`: the floaters it shoves). Returns
   * the last landing of the step, or null.
   */
  step(time, dt, rocks = []) {
    this.lastTime = time;
    this.stepSeconds = dt;
    this.landing = null;
    const burst = this.burst;
    const records = this.records, capacity = CANNON.capacity;
    if (burst && time >= burst.tOn && time < burst.tOff && this.inAir < capacity) {
      const exit = this.exitPoint(burst.hand, burst.aim.x, burst.aim.z, burst.radius, this.exitScratch);
      const aim = aimVelocity(exit, burst.aim.x, burst.aim.z, burst.nozzle.speed, this.aimScratch);
      const flight = Math.min(aim.flight, CANNON.longestFlight);
      const index = this.count % capacity;
      records.time[index] = time;
      records.vx[index] = aim.vx; records.vy[index] = aim.vy; records.vz[index] = aim.vz;
      records.x[index] = exit.x; records.y[index] = exit.y; records.z[index] = exit.z;
      records.flight[index] = flight;
      records.radius[index] = burst.nozzle.radius;
      records.speed[index] = burst.nozzle.speed;
      records.breakup[index] = burst.nozzle.breakup;
      records.landX[index] = exit.x + aim.vx * flight;
      records.landZ[index] = exit.z + aim.vz * flight;
      records.onset[index] = burst.nozzle.onset;
      const before = (this.count + capacity - 1) % capacity;
      records.lead[index] = this.count === 0 || records.handle[before] !== burst.handle || time - records.time[before] > 1.5 * dt ? 1 : 0;
      records.handle[index] = burst.handle;
      this.count++;
    }
    const splashTime = this.splash.time ?? time;
    // The mist off the rough skin, and more of it where the stream has broken up: a few samples along what flies (the header).
    if (this.inAir > 0 && burst) {
      const water = burst.nozzle.flow * dt;
      for (let sample = 0; sample < BREAKUP.samples; sample++) {
        const index = (this.head + Math.floor(this.random() * this.inAir)) % capacity;
        const age = time - records.time[index];
        const across = Math.hypot(records.vx[index], records.vz[index]);
        const along = arcLength(across, records.vy[index], age);
        const made = skin(records.radius[index], records.onset[index], records.breakup[index], along, this.skinScratch);
        const ruffled = ROUGH.shed * made.white + BREAKUP.mist * made.broken;
        if (ruffled <= 0) continue;
        const px = records.x[index] + records.vx[index] * age, py = records.y[index] + records.vy[index] * age - 0.5 * GRAVITY * age * age, pz = records.z[index] + records.vz[index] * age;
        if (py <= 0) continue;
        const vy = records.vy[index] - GRAVITY * age;
        const speed = Math.hypot(across, vy);
        const radius = 0.7 * made.radius;
        this.splash.spray?.burst({
          x: px, y: py, z: pz, vx: records.vx[index], vy, vz: records.vz[index],
          drops: sprayDrops((water * ruffled) / BREAKUP.samples, BREAKUP.mistRadius), radius: BREAKUP.mistRadius,
          kick: BREAKUP.kick * speed, spread: radius, time: splashTime, random: this.random, sizeFactor: Math.max(radius / 0.03, 0.25),
        });
        // A drop big enough to land and ring on its own, now and then.
        if (this.random() < (BREAKUP.drops * dt * made.broken) / BREAKUP.samples && this.splash.spawnDroplet) {
          const dropRadius = BREAKUP.dropRadius[0] + (BREAKUP.dropRadius[1] - BREAKUP.dropRadius[0]) * this.random();
          const kick = BREAKUP.kick * speed;
          this.splash.spawnDroplet(px, py, pz, records.vx[index] + (this.random() - 0.5) * kick, vy + (this.random() - 0.5) * kick, records.vz[index] + (this.random() - 0.5) * kick, dropRadius);
        }
      }
    }
    // The landings: every parcel down by the step's end (the oldest first).
    while (this.inAir > 0) {
      const index = this.head % capacity;
      if (records.time[index] + records.flight[index] > time + dt - 1e-12) break;
      this.land(index, time, dt, splashTime, rocks);
      this.head++;
    }
    this.stepFan(time, dt, splashTime);
    if (burst && time >= burst.tOff && this.inAir === 0) {
      burst.handle.state = 'done';
      this.burst = null;
    }
    return this.landing;
  }

  /** The parcel `index` meets the water (the header). */
  land(index, time, dt, splashTime, rocks) {
    const records = this.records;
    const x = records.landX[index], z = records.landZ[index];
    const flight = records.flight[index];
    const across = Math.hypot(records.vx[index], records.vz[index]);
    const vy = records.vy[index] - GRAVITY * flight;
    const speed = Math.hypot(across, vy);
    const along = arcLength(across, records.vy[index], flight);
    const breakup = records.breakup[index];
    const radius = records.radius[index] * (1 + (BREAKUP.widen - 1) * smoothstep(0, breakup, along)) * (1 + Math.max(along / breakup - 1, 0));   // past the breakup the shower widens on
    const water = Math.PI * records.radius[index] ** 2 * records.speed[index] * dt;   // the parcel's water, m³
    const directionX = across > 1e-9 ? records.vx[index] / across : 0, directionZ = across > 1e-9 ? records.vz[index] / across : 0;
    this.landings++;
    this.lastLanding = time;
    const handle = records.handle[index];
    if (handle && handle.landedAt === null) { handle.landedAt = time; handle.position.set(x, 0, z); }
    this.landing = { x, z, radius, speed, directionX, directionZ };
    const onIce = this.wetIce ? this.wetIce(x, z, IMPACT.footprint * radius) : false;
    const random = this.random;
    const footprint = IMPACT.footprint * radius;
    const sheath = skin(records.radius[index], records.onset[index], breakup, along, this.skinScratch).radius;
    this.throwFan(x, z, speed, Math.atan2(-vy, Math.max(across, 1e-9)), directionX, directionZ, sheath, water / dt, records.time[index], time, onIce);
    if (!onIce) {
      // The crater, its centre wandering within the footprint.
      let angle = random() * Math.PI * 2, out = IMPACT.jitter * radius * Math.sqrt(random());
      this.water.addSplat({ x: x + Math.cos(angle) * out, z: z + Math.sin(angle) * out, radius: footprint, velocity: -IMPACT.push * speed * dt, rim: IMPACT.rim });
      // Its churn: a stamp of foam each step, each its own size, place and strength (the header).
      // Laid along the way the stream glances on (IMPACT.trail), wider and so thinner the farther: a streak, never a disc.
      const onward = random() ** 2, trail = IMPACT.trail * across * onward;
      angle = random() * Math.PI * 2; out = IMPACT.boilReach * radius * Math.sqrt(random()) * (1 + IMPACT.trailWiden * onward);
      const stampRadius = (radius * (IMPACT.boilRadii[0] + (IMPACT.boilRadii[1] - IMPACT.boilRadii[0]) * random()) + 0.01) * (1 + IMPACT.trailWiden * onward);
      this.water.addFoam?.({ x: x + directionX * trail + Math.cos(angle) * out, z: z + directionZ * trail + Math.sin(angle) * out, radius: stampRadius, amount: Math.min(IMPACT.boil * dt * (speed / 10) * (0.5 + random()), 1), lifetime: IMPACT.boilLife, boil: true });
      // A speck of foam drifting out of it, now and then.
      if (this.splash.foamSpecks && random() < IMPACT.specks) {
        angle = random() * Math.PI * 2;
        const drift = IMPACT.speckDrift[0] + (IMPACT.speckDrift[1] - IMPACT.speckDrift[0]) * random();
        this.splash.foamSpecks.spawn(x + Math.cos(angle) * footprint, z + Math.sin(angle) * footprint, Math.cos(angle) * drift, Math.sin(angle) * drift, splashTime, undefined, random);
      }
      // A stray drop's ring round about.
      if (this.dropRings && random() < IMPACT.rings) {
        const reach = radius * (IMPACT.ringReach[0] + (IMPACT.ringReach[1] - IMPACT.ringReach[0]) * random()), turn = random() * Math.PI * 2;
        this.dropRings.add({ x: x + Math.cos(turn) * reach, z: z + Math.sin(turn) * reach, radius: 0.002, fallSpeed: 3 }, splashTime);
      }
      // Its white water heaping up and rolling on.
      if (this.splash.whiteWater) this.whiten(this.splash.whiteWater, x, z, speed, across, directionX, directionZ, water / dt, time, dt, splashTime);
    }
    // The drops torn off as it glances, off the water or the ice: they go with the fan's middle, kicked about, pulsing from step to step.
    const pulse = IMPACT.pulse[0] + (IMPACT.pulse[1] - IMPACT.pulse[0]) * random();
    const thrown = this.thrown;
    this.splash.spray?.burst({
      x, y: 0.01, z, vx: thrown.vx, vy: thrown.vy, vz: thrown.vz,
      drops: sprayDrops(IMPACT.sheet * water * pulse, IMPACT.sheetRadius), radius: IMPACT.sheetRadius,
      kick: IMPACT.sheetKick * Math.hypot(thrown.vx, thrown.vy, thrown.vz), spread: radius, time: splashTime, random, sizeFactor: Math.max(radius / 0.03, 0.25),
    });
    if (this.splash.spawnDroplet && random() < IMPACT.drops * dt * (speed / 20)) {
      const dropRadius = IMPACT.dropRadius[0] + (IMPACT.dropRadius[1] - IMPACT.dropRadius[0]) * random();
      const up = speed * (IMPACT.dropUp[0] + (IMPACT.dropUp[1] - IMPACT.dropUp[0]) * random());
      const turn = random() * Math.PI * 2, aside = up * (0.2 + 0.5 * random());
      this.splash.spawnDroplet(x, 0.005, z, Math.cos(turn) * aside + IMPACT.dropForward * records.vx[index], up, Math.sin(turn) * aside + IMPACT.dropForward * records.vz[index], dropRadius);
    }
    // The fish, now and then while it goes on.
    if (this.startle && time - this.lastStartle >= IMPACT.startleEvery) { this.lastStartle = time; this.startle(x, z); }
    // A floater in the footprint, shoved along the stream by its momentum on it (the header).
    if (!onIce) {
      for (const rock of rocks) {
        if (!rock.floats || rock.fading !== undefined || !(rock.state === 'float' || rock.afloat)) continue;
        const apart = Math.hypot(rock.position.x - x, rock.position.z - z), reach = footprint + rock.radius;
        if (apart >= reach) continue;
        const share = 1 - apart / reach;
        const push = Math.min(IMPACT.pushCap, (WATER_DENSITY * water * speed * share) / Math.max(rock.mass, 1e-3));
        rock.knock(directionX * push, 0, directionZ * push, 0, 0, 0);
      }
    }
  }

  /**
   * The fan's line of water a parcel landing at (x, z) throws (the header,
   * FAN): each part across it launched off the water with a share of the
   * landing `speed`, as steeply as the stream came down (`incidence`, rad
   * from the water) and more, about the stream's way (the direction given),
   * as the fan wanders there; `sheath` the stream's sheath's radius there,
   * `flow` the stream's (m³/s), `emitted` when the water left the nozzle.
   */
  throwFan(x, z, speed, incidence, directionX, directionZ, sheath, flow, emitted, time, onIce) {
    const tail = this.tail, parts = FAN_GRID.columns, controls = FAN.controls;
    const scale = Math.cbrt((flow * speed) / GRAVITY), period = Math.sqrt(scale / GRAVITY);
    const memory = FAN.sway.time * period, smoothing = FAN.sway.smooth * memory, dt = this.stepSeconds;
    const random = this.whiteRandom, drift = tail.drift, swayed = tail.swayed;
    // The wander at each control (FAN.sway): each a walk of unit spread drawn back to nothing, then smoothed.
    for (let control = 0; control < controls; control++) {
      for (let which = 0; which < 4; which++) {
        const slower = which === 3 ? 1 : FAN.sway.slow, at = (control * 4 + which) * 2;
        drift[at] += (-drift[at] * dt) / (memory * slower) + Math.sqrt((2 * dt) / (memory * slower)) * 2 * (random() + random() + random() - 1.5);
        drift[at + 1] += ((drift[at] - drift[at + 1]) * dt) / (smoothing * slower);
        swayed[control * 4 + which] = drift[at + 1];
      }
    }
    // The wander at a place across the fan (−1 to 1): a smooth curve through the controls' (Catmull–Rom).
    const wander = (which, place) => {
      const along = ((place + 1) / 2) * (controls - 1), first = Math.min(Math.floor(along), controls - 2), share = along - first;
      const before = swayed[Math.max(first - 1, 0) * 4 + which], from = swayed[first * 4 + which];
      const to = swayed[(first + 1) * 4 + which], after = swayed[Math.min(first + 2, controls - 1) * 4 + which];
      return 0.5 * (2 * from + (to - before) * share + (2 * before - 5 * from + 4 * to - after) * share * share + (3 * from - before - 3 * to + after) * share * share * share);
    };
    // Each part's own (FAN.fingers): a walk too, far slower.
    const comb = tail.comb, kept = FAN.fingers.memory * period;
    for (let part = 0; part < parts; part++) comb[part] += (-comb[part] * dt) / kept + Math.sqrt((2 * dt) / kept) * 2 * (random() + random() + random() - 1.5);
    const onward = Math.atan2(directionZ, directionX);
    const room = tail.count - tail.head < FAN.capacity;
    const slot = tail.count % FAN.capacity;
    let longest = 0;
    for (let part = 0; part < parts; part++) {
      const place = -1 + (2 * part) / (parts - 1), middle = 1 - place * place;
      // Its neighbours' with it, so the fingers are a few parts wide.
      const beside = (apart) => comb[Math.min(Math.max(part + apart, 0), parts - 1)];
      const finger = (beside(-1) + 2 * comb[part] + beside(1)) / 4;
      const pace = speed * (FAN.speed[1] + (FAN.speed[0] - FAN.speed[1]) * middle) * Math.min(Math.max(1 + FAN.sway.speed * wander(0, place), 0.5), 1.6);
      const elevation = Math.min(Math.max((FAN.rise + FAN.lift * incidence) * (FAN.steep[1] + (FAN.steep[0] - FAN.steep[1]) * middle) + FAN.sway.steep * wander(1, place), 0.05), 1.4);
      const heading = onward + place * FAN.spread + FAN.sway.yaw * wander(2, place);
      const vx = pace * Math.cos(elevation) * Math.cos(heading), vy = pace * Math.sin(elevation), vz = pace * Math.cos(elevation) * Math.sin(heading);
      if (part === (parts - 1) / 2) { this.thrown.vx = vx; this.thrown.vy = vy; this.thrown.vz = vz; }
      if (!room) continue;
      const at = (slot * parts + part) * 3;
      tail.velocity[at] = vx; tail.velocity[at + 1] = vy; tail.velocity[at + 2] = vz;
      tail.strength[slot * parts + part] = Math.min(Math.max(1 + FAN.sway.strength * wander(3, place) + FAN.fingers.strength * finger, 0.1), 1.7);
      tail.reach[slot * parts + part] = FAN.reach[0] + (FAN.reach[1] - FAN.reach[0]) * smoothstep(FAN.tongue[0], FAN.tongue[1], finger);
      longest = Math.max(longest, (2 * vy) / GRAVITY);
    }
    if (!room) return;
    const before = (tail.count + FAN.capacity - 1) % FAN.capacity;
    tail.lead[slot] = tail.count === 0 || time - tail.time[before] > 1.5 * dt ? 1 : 0;
    tail.time[slot] = time; tail.x[slot] = x; tail.z[slot] = z;
    tail.sideX[slot] = -directionZ; tail.sideZ[slot] = directionX;
    tail.emitted[slot] = emitted;
    tail.width[slot] = 2 * FAN.width * sheath;
    tail.life[slot] = longest;
    tail.flow[slot] = flow;
    tail.grain[slot] = Math.min(Math.max((FAN.speed[0] * speed) ** 2 / GRAVITY / FAN.grain, 0.35), 4);
    tail.ice[slot] = onIce ? 1 : 0;
    tail.count++;
  }

  /**
   * The fan's step (the header): the moments all of whose water is down are
   * let go; where it comes down it rains on the water (FAN.rain parts of it,
   * each by chance a strike on the solver, a drop's ring or a little froth);
   * and drops leave it (FAN.drops places on it).
   */
  stepFan(time, dt, splashTime) {
    const tail = this.tail, capacity = FAN.capacity, parts = FAN_GRID.columns;
    while (tail.count > tail.head) {
      const slot = tail.head % capacity;
      if (tail.time[slot] + tail.life[slot] > time + dt - 1e-12) break;
      tail.head++;
    }
    const inAir = tail.count - tail.head;
    if (inAir === 0) return;
    const random = this.random;
    const newest = (tail.count - 1) % capacity;
    for (let drop = 0; drop < FAN.rain; drop++) {
      // A part of it, more often towards its middle (where there is more of it), and what is to be done there.
      const part = Math.round(((0.85 * (random() + random() - 1) + 1) / 2) * (parts - 1));
      const draw = random();
      if (draw >= FAN.pock + FAN.rings + FAN.froth) continue;
      // That part's water coming down now was thrown a flight ago.
      const back = Math.round((2 * tail.velocity[(newest * parts + part) * 3 + 1]) / GRAVITY / dt);
      if (back >= inAir) continue;
      const slot = (tail.count - 1 - back) % capacity;
      if (tail.ice[slot]) continue;
      const at = (slot * parts + part) * 3, place = -1 + (2 * part) / (parts - 1);
      const flight = (2 * tail.velocity[at + 1]) / GRAVITY;
      const range = Math.hypot(tail.velocity[at], tail.velocity[at + 2]) * flight;
      const wide = tail.width[slot] + 2 * FAN.spread * range;   // the fan's width where it lands
      const turn = random() * Math.PI * 2, out = (wide / parts + 0.02) * Math.sqrt(random());
      const x = tail.x[slot] + tail.sideX[slot] * place * 0.5 * tail.width[slot] + tail.velocity[at] * flight + Math.cos(turn) * out;
      const z = tail.z[slot] + tail.sideZ[slot] * place * 0.5 * tail.width[slot] + tail.velocity[at + 2] * flight + Math.sin(turn) * out;
      if (this.water.holds && !this.water.holds(x, z)) continue;
      const strength = tail.strength[slot * parts + part];
      if (draw < FAN.pock) {
        this.water.addSplat({ x, z, radius: FAN.pockRadius[0] + (FAN.pockRadius[1] - FAN.pockRadius[0]) * random(), velocity: -(FAN.pockPush[0] + (FAN.pockPush[1] - FAN.pockPush[0]) * random()) * strength });
      } else if (draw < FAN.pock + FAN.rings) {
        this.dropRings?.add({ x, z, radius: 0.001 + 0.0015 * random(), fallSpeed: Math.max(tail.velocity[at + 1], 1) }, splashTime);
      } else {
        this.water.addFoam?.({ x, z, radius: FAN.frothRadius * wide * (0.6 + 0.8 * random()), amount: FAN.frothAmount * strength, lifetime: FAN.frothLife });
      }
    }
    // The drops that leave it, where the sheet comes apart: they fly on with its velocity there, and land.
    if (!this.splash.spray) return;
    for (let sample = 0; sample < FAN.drops; sample++) {
      // The thicker of two parts drawn, where its sheet is coming apart.
      const one = Math.floor(random() * parts), other = Math.floor(random() * parts);
      const part = tail.reach[newest * parts + one] >= tail.reach[newest * parts + other] ? one : other;
      const place = -1 + (2 * part) / (parts - 1);
      const share = Math.min(tail.reach[newest * parts + part] * (FAN.dropsFrom[0] + (FAN.dropsFrom[1] - FAN.dropsFrom[0]) * random()), 0.97);
      const back = Math.min(Math.round((share * 2 * tail.velocity[(newest * parts + part) * 3 + 1]) / GRAVITY / dt), inAir - 1);
      const slot = (tail.count - 1 - back) % capacity, at = (slot * parts + part) * 3;
      const age = time - tail.time[slot];
      if (age < 0 || age >= (2 * tail.velocity[at + 1]) / GRAVITY) continue;   // in the water already
      const vy = tail.velocity[at + 1] - GRAVITY * age;
      const pace = Math.hypot(tail.velocity[at], vy, tail.velocity[at + 2]);
      this.splash.spray.burst({
        x: tail.x[slot] + tail.sideX[slot] * place * 0.5 * tail.width[slot] + tail.velocity[at] * age,
        y: Math.max(tail.velocity[at + 1] * age - 0.5 * GRAVITY * age * age, 0.005),
        z: tail.z[slot] + tail.sideZ[slot] * place * 0.5 * tail.width[slot] + tail.velocity[at + 2] * age,
        vx: tail.velocity[at], vy, vz: tail.velocity[at + 2],
        drops: sprayDrops((tail.flow[slot] * dt * FAN.dropShare * tail.strength[slot * parts + part]) / FAN.drops, FAN.dropRadius), radius: FAN.dropRadius,
        kick: FAN.kick * pace, spread: 0.015 + 0.02 * pace * age, time: splashTime, random,
      });
    }
  }

  /**
   * The white water a parcel landing at (x, z) throws up this step (the
   * header, WHITE): a puff now and then (src/whiteWater.js), from the
   * stream's white water's own draws, so it shifts none of the stream's;
   * `flow` the stream's (m³/s), landing at `speed` (`across` of it
   * horizontal, along the direction given).
   */
  whiten(whiteWater, x, z, speed, across, directionX, directionZ, flow, time, dt, splashTime) {
    const random = this.whiteRandom;
    const between = (range) => range[0] + (range[1] - range[0]) * random();
    const scale = Math.cbrt((flow * speed) / GRAVITY);
    const period = Math.sqrt(scale / GRAVITY), pace = Math.sqrt(GRAVITY * scale);
    const [firstRate, secondRate] = WHITE.pulseRates, [firstPhase, secondPhase] = this.whitePhases;
    const pulse = 1 + WHITE.pulse * (0.6 * Math.sin((2 * Math.PI * firstRate * time) / period + firstPhase) + 0.4 * Math.sin((2 * Math.PI * secondRate * time) / period + secondPhase));
    const wanted = (WHITE.rate * dt * pulse) / period;
    const count = Math.floor(wanted) + (random() < wanted - Math.floor(wanted) ? 1 : 0);
    const onward = across / Math.max(speed, 1e-9);
    for (let puff = 0; puff < count; puff++) {
      const along = scale * between(WHITE.place), aside = scale * WHITE.aside * (2 * random() - 1);
      // The boil rolls a little on the way the stream was going.
      const draw = random();
      const share = WHITE.glance[0] + (WHITE.glance[1] - WHITE.glance[0]) * draw * draw;
      const forward = share * across;
      const fan = Math.atan2(directionZ, directionX) + (2 * random() - 1) * (WHITE.fan + (Math.PI - WHITE.fan) * (1 - onward));
      const turn = random() * Math.PI * 2, out = pace * WHITE.spread * random();
      const size = scale * between(WHITE.size);
      whiteWater.puff({
        x: x + directionX * along - directionZ * aside, z: z + directionZ * along + directionX * aside,
        vx: Math.cos(fan) * forward + Math.cos(turn) * out, vy: pace * between(WHITE.rise) * (1 + WHITE.pulse * (pulse - 1)), vz: Math.sin(fan) * forward + Math.sin(turn) * out,
        size, swell: size * between(WHITE.swell), tau: WHITE.drag * period, life: period * between(WHITE.life), time: splashTime, seed: random(),
      });
    }
  }

  /**
   * The arc a press would fire along now, 25 points into `out` (a
   * Float32Array of 75, as the aim's arc is drawn), from `hand` at the aim
   * (x, z) at `pressure` through `thing`'s stream: where it lands, and
   * whether it falls short.
   */
  previewArc(hand, x, z, pressure, thing, out) {
    const made = nozzle(pressure, thing.stream);
    const { radius } = thing.measure(pressure);
    const exit = this.exitPoint(hand, x, z, radius, { x: 0, y: 0, z: 0 });
    const aim = aimVelocity(exit, x, z, made.speed, this.aimScratch);
    for (let point = 0; point < 25; point++) {
      const t = (aim.flight * point) / 24;
      out[point * 3] = exit.x + aim.vx * t;
      out[point * 3 + 1] = exit.y + aim.vy * t - 0.5 * GRAVITY * t * t;
      out[point * 3 + 2] = exit.z + aim.vz * t;
    }
    return { x: exit.x + aim.vx * aim.flight, z: exit.z + aim.vz * aim.flight, short: aim.short, flight: aim.flight };
  }

  /**
   * The stream at parcel coordinate `back` at `time`: 0 the newest parcel, 1
   * the one let out before it, a fraction between two (their launches mixed:
   * never ask across a gap). Into `sample`: the mixed launch (SAMPLED), and
   * where that water is now, its `centre`, the unit `axis` it flies along,
   * its `age` and the arc `along` it has flown. `age`, if given, stands for
   * the time's (a parcel's flight puts the sample on the water).
   */
  sampleAt(back, time, sample, age) {
    const records = this.records, capacity = CANNON.capacity;
    const whole = Math.floor(back), share = back - whole;
    const newer = (this.count - 1 - whole) % capacity;
    const older = share > 0 ? (this.count - 2 - whole) % capacity : newer;
    for (const field of SAMPLED) sample[field] = records[field][newer] + (records[field][older] - records[field][newer]) * share;
    const flown = Math.max(age ?? time - sample.time, 0);
    sample.age = flown;
    sample.centre.x = sample.x + sample.vx * flown; sample.centre.y = sample.y + sample.vy * flown - 0.5 * GRAVITY * flown * flown; sample.centre.z = sample.z + sample.vz * flown;
    const vy = sample.vy - GRAVITY * flown;
    const speed = Math.hypot(sample.vx, vy, sample.vz) || 1;
    sample.axis.x = sample.vx / speed; sample.axis.y = vy / speed; sample.axis.z = sample.vz / speed;
    sample.along = arcLength(Math.hypot(sample.vx, sample.vz), sample.vy, flown);
    return sample;
  }

  /** The stream for this frame (the header): the parcels in the air at `time`, as the white rope. */
  drawAt(time) {
    const sheath = this.sheath;
    if (sheath && this.inAir === 0) sheath.hide();
    else if (sheath) {
      sheath.begin(this.records.time[(this.count - 1) % CANNON.capacity]);
      // Whether the newest water still joins the muzzle (the nozzle on, and it is this burst's).
      const attached = this.firing && this.records.handle[(this.count - 1) % CANNON.capacity] === this.burst.handle;
      this.drawSheath(time, attached);
      sheath.finish(this.splash.walls ?? null);
    }
    if (this.fan) this.drawFan(time);
  }

  /**
   * The white rope (src/streamSheath.js): each piece of the stream in the air
   * (the parcels between two gaps), its rings shared out by its parcels, from
   * the muzzle if it joins it and to the water if its head has landed; a free
   * end thins to nothing (ROUGH.taper).
   */
  drawSheath(time, attached) {
    const sheath = this.sheath, records = this.records, capacity = CANNON.capacity;
    const sample = this.sample, made = this.skinScratch;
    const inAir = this.inAir;
    const parcel = (back) => (this.count - 1 - back) % capacity;
    let first = 0;   // the piece's newest parcel, counted back from the newest of all
    while (first < inAir) {
      let last = first;
      while (last < inAir - 1 && !records.lead[parcel(last)]) last++;
      const joinsMuzzle = attached && first === 0;
      const reachesWater = !records.lead[parcel(last)];
      const ends = (joinsMuzzle ? 1 : 0) + (reachesWater ? 1 : 0);
      const rows = Math.min(Math.max(Math.round((SHEATH.rings * (last - first + 1)) / inAir) - ends, 2), sheath.room - ends);
      if (rows < 2) break;
      const tailTime = records.time[parcel(first)], headTime = records.time[parcel(last)];
      if (joinsMuzzle) {
        // From the muzzle: the newest parcel has a step's head start.
        const burst = this.burst;
        const exit = this.exitPoint(burst.hand, burst.aim.x, burst.aim.z, burst.radius, this.exitScratch);
        this.sampleAt(0, time, sample, 0);
        skin(sample.radius, sample.onset, sample.breakup, 0, made);
        sheath.ring(exit.x, exit.y, exit.z, sample.axis, made.radius, time, made.depth, made.broken);
      }
      for (let row = 0; row < rows; row++) {
        this.sampleAt(first + ((last - first) * row) / (rows - 1), time, sample);
        skin(sample.radius, sample.onset, sample.breakup, sample.along, made);
        const whole = (joinsMuzzle ? 1 : smoothstep(0, ROUGH.taper, tailTime - sample.time)) * (reachesWater ? 1 : smoothstep(0, ROUGH.taper, sample.time - headTime));
        sheath.ring(sample.centre.x, sample.centre.y, sample.centre.z, sample.axis, made.radius * (0.5 + 0.5 * whole), sample.time, made.depth * whole, made.broken);
      }
      if (reachesWater) {
        // Down to the water: where the oldest parcel comes down, the water there now let out a flight ago.
        const flight = records.flight[parcel(last)];
        this.sampleAt(last, time, sample, flight);
        skin(sample.radius, sample.onset, sample.breakup, sample.along, made);
        sheath.ring(sample.centre.x, sample.centre.y, sample.centre.z, sample.axis, made.radius, time - flight, made.depth, made.broken);
      }
      first = last + 1;
    }
  }

  /**
   * The fan's sheet (src/sprayFan.js; the header): a row for each of the
   * moments shared out along what is in the air, from the stream's foot
   * (while it is landing) to the oldest, each part of a row where its own
   * parabola has it, down to where it lands and no farther; thinning as the
   * fan widens, breaking up, and a row of no depth at each piece's ends, so
   * nothing is drawn from one piece to the next.
   */
  drawFan(time) {
    const fan = this.fan, tail = this.tail, capacity = FAN.capacity, parts = FAN_GRID.columns;
    const inAir = tail.count - tail.head;
    if (inAir === 0) { fan.hide(); return; }
    const slotAt = (back) => (tail.count - 1 - back) % capacity;
    fan.begin(tail.emitted[slotAt(0)]);
    let first = 0;   // the piece's newest moment, counted back from the newest of all
    while (first < inAir && fan.room >= 4) {
      let last = first;
      while (last < inAir - 1 && !tail.lead[slotAt(last)]) last++;
      const rows = Math.min(Math.max(Math.round((FAN_GRID.rows * (last - first + 1)) / inAir), 4), fan.room) - 2;
      const joinsFoot = first === 0 && time - tail.time[slotAt(0)] <= 2 * this.stepSeconds;
      const freeHead = tail.lead[slotAt(last)] === 1;
      const tailTime = tail.time[slotAt(first)], headTime = tail.time[slotAt(last)];
      for (let row = 0; row < rows; row++) {
        const slot = slotAt(Math.round(first + ((last - first) * row) / Math.max(rows - 1, 1)));
        const age = Math.max(time - tail.time[slot], 0);
        const whole = (joinsFoot ? 1 : smoothstep(0, ROUGH.taper, tailTime - tail.time[slot])) * (freeHead ? smoothstep(0, ROUGH.taper, tail.time[slot] - headTime) : 1);
        const start = tail.width[slot];
        // The row, and at a piece's ends the same row again with no depth.
        for (let pass = row === 0 ? -1 : 0; pass <= (row === rows - 1 ? 1 : 0); pass++) {
          const written = fan.row();
          if (written < 0) break;
          for (let part = 0; part < parts; part++) {
            const at = (slot * parts + part) * 3, place = -1 + (2 * part) / (parts - 1);
            const vx = tail.velocity[at], launch = tail.velocity[at + 1], vz = tail.velocity[at + 2];
            const flight = Math.max((2 * launch) / GRAVITY, 1e-6);
            const flown = Math.min(age, flight);   // a part that has landed stays where it did, undrawn
            const vy = launch - GRAVITY * flown;
            const pace = Math.hypot(vx, vy, vz) || 1;
            const along = arcLength(Math.hypot(vx, vz), launch, flown);
            const wide = start + 2 * FAN.spread * along;
            const broken = FAN.brokenMost * smoothstep(FAN.brokenFrom, 1, flown / flight);
            const strength = tail.strength[slot * parts + part];
            const reach = tail.reach[slot * parts + part];
            const lasting = 1 - smoothstep(FAN.fadeFrom * reach, reach, flown / flight);
            const depth = pass !== 0 || age >= flight ? 0 : FAN.depth * strength * (start / wide) * lasting * whole;
            // Rope still at the stream's foot, spray past it (to 1), and its hairs finer as it widens on (to 2: src/shaders/stream.js).
            const spray = smoothstep(0, 4 * start, along) + smoothstep(2.5, 7, wide / start);
            fan.vertex(written, part,
              tail.x[slot] + tail.sideX[slot] * place * 0.5 * start + vx * flown, Math.max(launch * flown - 0.5 * GRAVITY * flown * flown, 0), tail.z[slot] + tail.sideZ[slot] * place * 0.5 * start + vz * flown,
              vx / pace, vy / pace, vz / pace, tail.emitted[slot], depth, broken, spray, FAN.speed[0], tail.grain[slot]);
          }
        }
      }
      first = last + 1;
    }
    fan.finish(this.splash.walls ?? null);
  }

  /** Nothing in the air, the nozzle off, nothing landed (the app's clearPond). */
  reset() {
    if (this.burst) this.burst.handle.state = 'done';
    this.burst = null;
    this.head = 0;
    this.count = 0;
    this.landings = 0;
    this.lastLanding = -Infinity;
    this.lastStartle = -Infinity;
    this.landing = null;
    this.tail.head = 0; this.tail.count = 0;
    this.sheath?.hide();
    this.fan?.hide();
  }
}
