// A thrown thing and a small rigid-body model of it. What it is (`thing`, a
// key of src/things.js THINGS: a definition, data) sets everything: its
// size, mass and density, its body's shape, its material, its drag, its
// look (its mesh, src/thingMeshes.js) and what it can do. The model reads
// the definition and never asks what the thing is: a body is a `sphere`
// (analytic) or a `mesh` (its mesh's own moments and lowest point), the air
// takes its `air.drag`, the deck and other things its `material`. The river
// stone, the default, is the stone there always was, and what follows is
// written of it, the other things after.
//
// In the air it follows a ballistic arc with a little drag and tumbles, at
// SPIN_LEAST to SPIN_MOST rad/s about a random axis (most stones turn
// slowly, a few fast). The moment its lowest point (of the tumbling mesh, not
// of a sphere) touches the surface it reports the impact (position, its
// centre's height, speed, direction, radius, and the stone's own properties
// below) so the splash can be built from it (the cavity follows the stone
// down from there): the splash starts at first contact, not once the stone is
// partly under, which for a 16 cm stone at 5 m/s down would be several
// milliseconds late. Under water a quadratic drag and, while its hole is open,
// the water's head on its front (the reference simulation's fit, C_d 0.46 and
// C_h 0.6) stop it within a few radii, a sideways lift curves its path a
// little, and once the hole has pinched off buoyancy-reduced gravity sinks it
// to the lake bed, where it settles into the sand (sinkStep in src/cavity.js,
// which traces the cavity along the same path; the splash tells the stone
// when its hole pinches off, setCavityTimes).
//
// Under a gale (src/galeWaves.js) the water moves up and down. The stone
// meets it at the height of the waves under it (update's surfaceAt, the
// CPU's sum of the gale's waves), and from then on it moves as the splash
// does, on still water, its surface at 0: its position is in that frame,
// and it is drawn lifted as the gale lifts the splash (galeLift in
// src/shaders/scene.js): by the surface's height while above the still
// level, and under it by h·(1 + y/bed), the water column stretching between
// the fixed bed and the moving surface, so a stone on the bed stays put. Its
// two halves are cut at the water's height over it, and the half under the
// water is seen through a level surface there.
//
// The stone's properties at impact (`shape`, `contact`, `spin`, `lift` in the
// report), which make one splash unlike the next (src/splash.js), and `seed`,
// drawn when the stone is thrown, which seeds the splash's own random stream
// (so a seeded throw splashes alike however its flight was stepped):
//   - shape, once per stone (stoneShape): the solid's second moments,
//     integrated exactly over the faceted mesh as signed tetrahedra from the
//     origin, about its centroid; their eigenvectors are the principal axes,
//     long, middle and short, and an ellipsoid with the same moments has
//     semi-axes a ≥ b ≥ c = sqrt(5·λ) (λ the moments per unit volume), in
//     nominal radii. Elongation is 1 − b/a and flatness 1 − c/b (Zingg's
//     ratios, 0 for a ball; the river-stone squash makes flatness 0.1 to 0.4),
//     and irregularity the rms departure of the mesh's vertices from that
//     ellipsoid along their direction from the centroid (about 0.05 to 0.08:
//     the lumps the noise raises).
//   - contact: which part hits first, from the angle between the contact
//     normal (at the lowest point the surface faces straight down) and the
//     principal axes: the axis nearest the vertical says it, the short one a
//     flat face (`face`), the middle one the rim between the faces (`edge`),
//     the long one an end (`point`). Also the angles themselves (faceAngle:
//     the short axis from the vertical; pointAngle: the long one), and
//     bluntness, how flat the stone is where it touches: the footprint on the
//     water of the faces within BLUNT_BAND·R of the lowest point (each by the
//     share of its corners inside), against a ball's cap that deep (1 for a
//     ball, more for a broad face, less for a point or a ridge).
//   - spin: the tumble's rate (rad/s) and axis, the spin ratio ω·R/V (the
//     stone's surface speed over the entry speed: 0.02 to 0.15 for a 6 cm
//     stone thrown normally), the share of the spin about the entry direction
//     (alongEntry, the cosine between the two: a spin about the path rifles
//     the cavity, one across it makes the splash lopsided, Truscott & Techet
//     2009) and the stone's orientation then (a quaternion), from which the
//     cavity works out how the stone was turned as it passed each depth.
//   - lift: the sideways push the water gives the stone as it goes in, as a
//     lift coefficient C_L times a unit direction across the entry velocity
//     (two vectors: the shape's, kept, and the spin's, which fades with the
//     tumble), at most LIFT_CAP. A tilted flattened stone is a plate at an
//     angle of attack α: the water's pressure on its face pushes it along the
//     face's normal, sideways by FLAT_LIFT·(flatness + elongation/2)·sin 2α;
//     its lumps add a little in a random direction (IRREGULAR_LIFT times the
//     irregularity); a spinning one is pushed along ω × v (the Magnus
//     direction, which Truscott & Techet find for spheres entering water) by
//     SPIN_LIFT·ω·R/V. sinkStep applies C_L·(3/8)·(ρw/ρs)·v²/R across the path
//     (the drag's form with C_L for C_d), so a stone with C_L 0.2 bends its
//     path by about 10° over its first six radii.
//
// Skipping (a Skip throw, src/main.js skipThrow). The thrower picks a flat
// stone (createRockGeometry's `flat`: the short axis squashed to
// SKIP_STONE.squash of the long one, its surface noise SKIP_STONE.surfaceNoise
// of a river stone's) and lets it go low and fast (launchSkip, at the
// velocity aimSkip finds for the tap: SKIP_THROW's speeds, from a crouch,
// nearly level, its first touch along the tap's direction on open water),
// its face nose-up by
// SKIP_TILT along the throw (about the "magic angle" of Clanet, Hersen &
// Bocquet 2004) and never to either side, spinning at SKIP_SPIN about its
// short axis, which holds the face's tilt in flight (a gyroscope: the spin
// is about the face's normal, so the tumble keeps the normal where it is).
// When it touches the water the contact
// is worked out at once to its end (skim, on the CPU, in steps of SKIM.step),
// much as Bocquet (2003) and Clanet et al. model it: the face is a disc of
// the stone's area (radius R·sqrt(a·b)), its wetted part the segment the
// water cuts off it as the stone sinks d below where it touched (a chord
// d/sin α deep, α the face's tilt from level), and the water pushes it along
// the face's normal by ½·ρ·SKIM.pressure·|v|²·(wetted area) while the face
// moves into it, times sin(α + λ·(θ − α))/sin α (λ = SKIM.fade, θ the angle
// the water meets the face at: α plus the angle the stone comes down at,
// less the angle it climbs at), and drags it along the face by
// ½·ρ·SKIM.friction·|v|²·(wetted area), the water it throws aside. Bocquet's
// push (λ = 0, with little drag) gives back nearly all the speed it took:
// every hop came out as tall as the last for its length, 15 and 10 cm high
// on a normal throw's second and third, and they looked bouncy, hanging in
// the air; with all of sin θ (λ = 1) each hop came out flatter than the last
// until the stone seemed to hover. With λ = 0.3 and the drag, every touch
// takes off about as much of the speed along the water as of the speed up
// from it, so each hop is an arc of much the same shape as the last at about
// six tenths its size, the touches coming quicker and quicker (a normal
// throw: 2.7 m long and 16 cm high, then 1.6 m and 9 cm, 0.9 m and 5 cm,
// 0.6 m and 3 cm). Gravity acts on the stone's own mass
// (trueMass, from its volume: a thin stone is light for its face). The
// contact ends one of two ways:
//   - a skip: the stone rises back out (d ≤ 0, moving up) at SKIM.leastExit
//     or more above level. It follows the contact's path (kept every
//     SKIM.sample, played back in the `skim` state), then flies on; the
//     touch is reported (`skim: true`, skimReport) so the splash draws its
//     ring and spray (src/splash.js skim). Each skip leaves the spin
//     SKIP_SPIN_KEPT of what it was and pitches the face by a random
//     SKIP_WOBBLE.degrees·(SKIP_WOBBLE.reference/ω) about the level axis
//     across its path: the slower it spins, the more it wobbles. Nothing
//     leans the face to either side: its normal, along which the water
//     pushes, stays in the vertical plane the stone was thrown in, and the
//     drag is along its path, so the stone stays in that plane (only a
//     pool's wall turns it).
//   - it goes in: its face goes wholly under (the chord reaches across it),
//     the contact lasts SKIM.longest, the stone slows below SKIM.slowest
//     along the water, its face is pitched nose-up by less than
//     SKIM.leastPitch (the leading edge catches), it would leave flatter
//     than SKIM.leastExit (it would only glide on), or in a pool it would
//     run into a wall (`skip.inside`, which src/main.js gives it; a touch
//     beyond a wall is left to the wall, src/pool.js). Then the touch is the
//     stone's impact, as for any throw (`water`, the splash built from it),
//     but for its lift under water, whose push across the throw's plane is
//     left out (its fast spin would curve it off to one side).
// The model has Clanet et al.'s magic angle: thrown normally (10 m/s, 30 cm
// up) the first hop is longest with the face at about 15° and the stone
// skips most often from 15° to 20° (five times), less either side (three at
// 10° and at 30°), and below about 7° it digs in at its first touch.
// tools/skip-probe.mjs prints what it does.
//
// The stone is two meshes: the part above the water in the main scene, the
// part below in the under-water pass (src/main.js), which the water shader
// shows through the surface. Below the water it is drawn where it is seen
// through the still surface (SEEN_THROUGH_WATER, src/shaders/scene.js), not
// on the straight line from the camera, once the water has closed over it:
// while its cavity is open (src/cavity.js) it is in air, seen through the
// hole, and drawn where it is; from the pinch-off, over NECK_CLOSE·sqrt(R/g)
// as the neck closes over it, it moves over to where the water shows it. The
// pinch-off is its cavity's (setCavityTimes, which the splash calls with the
// report's `rock`), PINCH_TIME·sqrt(R/g) after the impact until then. Seen
// from an eye under the water (src/main.js's Under view) it is drawn where it
// is, faded into the water's colour (waterFog) with the distance.
//
// Other things (src/things.js). A `mesh` body (a stone of any kind, a gem,
// a pizza) has its mesh's shape (stoneShape: its moments, its axes, its
// flatness) and touches where its mesh's lowest point is; its density is its
// definition's, or its mass over its mesh's volume (a pizza's disc). A
// `sphere` body (a ball, an apple) has a ball's shape (BALL_SHAPE: no
// elongation, flatness or lumps) and touches where a ball does (its lowest
// point R under its centre, BALL_CONTACT). Its mass is its own (`mass`); a
// thing sized by its diameter (a stone) has the nominal ball's of its
// density, as the air's drag always took it. In the air the drag is its
// `air.drag` on the disc of its radius (flyStep: a pizza's broad face
// catches the air). A floater that is not round turns flat side down on
// the water (rightOnWater). Under water each moves with its own density's constants
// (src/cavity.js underWater: the drag, head, lift and buoyancy over its
// inertia, the water it carries included), so a bowling ball sinks at half
// a stone's speed and a basketball stops within a radius or two.
//
// Floating. A thing lighter than water (pumice, a tennis ball, a light
// bowling ball, a basketball) rises once its hole has pinched off, and once
// its centre is within FLOAT.handover of its height under the still surface
// it floats (`float`, floatStep): buoyed by the water over its submerged
// part (`waterline`: a sphere's cap, as deep as it is under; anything
// else's own mesh, sliced once as it is thrown, waterlineTable, so a flat
// pizza floats as a slab does, by Archimedes, its toppings dry), carrying FLOAT.addedMass of that water,
// slowed by the drag on its wetted part and by the waves it makes (its bob
// damped at FLOAT.damping of critical, its drift at FLOAT.slowing). It
// comes up through the surface (a ring, `ripple`, if faster than
// FLOAT.ringFrom), may bob clear of it and fall back (in quietly, with a
// ring, if slower than FLOAT.quietEntry, else as any throw goes in), bobs a
// few times and comes to rest at the depth it floats at (`rest`, `afloat`),
// a basketball 4.3 cm under, a tennis ball 2.8 cm; one not round turns flat
// side down (rightOnWater; a thing kept upright, a pizza, its toppings up).
// Under a gale it rides the
// waves as it is drawn (syncMeshes' lift, as for a stone on the bed) and
// drifts downwind at FLOAT.drift (src/main.js sets `drift`), never resting.
// Afloat it is also in the water's mirror image (meshMirror: its part above
// the water, on the mirror's layer, its distance in alpha as the pool's
// walls write it, MIRROR_NEARNESS in src/shaders/scene.js).
//
// Meeting other things (src/collide.js): each is a sphere of
// collisionRadius, its mass its own and the water it carries
// (collisionMass), giving back collisionBounce of the speed it meets
// another at; knock moves it, and under the water its path with it, and
// wakes it afloat.
//
// Ground. A thing can come down on ground rather than water: the pool's
// deck, its height given by `groundAt` (src/pool.js poolGround, which
// src/main.js hands everything thrown in the pool): short of the pool (a
// big stone skipped slowly, a heavy ball thrown as far as it goes) or
// skipped out over a wall. It lands only where it
// was over the ground the step before too: one coming from over the water
// meets the ground's side. On the ground it lands as the thing does on
// paving (meetGround, with its THINGS `ground`): it bounces off at `bounce`
// of the speed it came down at, the friction taking `friction` times the
// push off the ground from its speed along it. A stone's lumps turn its
// path by up to GROUND.scatter and it tumbles end over end (its spin about
// the level axis across its path, at GROUND.tumble of its speed over its
// radius) until it comes down slower than GROUND.settle; then it tumbles
// along (`ground`, alongGround), its ellipsoid on it (ellipsoidDepth: the
// lumpy mesh would lift it off as it turns), slowing at
// GROUND.tumbling·g. A ball keeps at least `roll` of its speed along the
// ground (friction brings it to rolling, 5/7 for a solid ball, 3/5 for a
// shell) and spins as it rolls, and once down it rolls along, slowing at
// `rolling`·g. Either rests once slower than GROUND.stopped; over the
// ground's edge it falls again (into the pool).
import * as THREE from 'three';
import { SEEN_THROUGH_WATER, FLOATER_WATER } from './shaders/scene.js';
import { PINCH_TIME, NECK_CLOSE, SPIN_DECAY, sinkStep, underWater } from './cavity.js';
import { THINGS, DEFAULT_THING, WATER_DENSITY, STONE_DENSITY } from './things.js';
import { meshKind } from './thingMeshes.js';

// The stone's geometry is src/thingMeshes.js's now; the probes take it from here as they always did.
export { createRockGeometry } from './thingMeshes.js';

const GRAVITY = 9.81;
const SPIN_LEAST = 5;              // rad/s: the tumble in flight, from this...
const SPIN_MOST = 30;              // ...to this, most stones slow (the draw is skewed by SPIN_SKEW)
const SPIN_SKEW = 1.5;
const BLUNT_BAND = 0.1;            // in R: the band above the lowest point whose vertices measure bluntness
const FLAT_LIFT = 0.5;             // the lift of a tilted flattened stone, times (flatness + elongation/2)·sin 2α...
const IRREGULAR_LIFT = 0.8;        // ...of its lumps, times its irregularity, in a random direction...
const SPIN_LIFT = 0.6;             // ...and of its spin, times ω·R/V along ω × v
const LIFT_CAP = 0.35;             // at most this C_L in all
const CREST_REACH = 0.6;           // m: under a gale, no crest reaches higher than this above the still water
// Skipping (the header).
export const SKIM = {
  pressure: 2.0,      // C: the push along the face's normal, ½·ρ·C·|v|²·(wetted area) (the header)...
  friction: 0.3,      // ...C_f, the drag along the face...
  fade: 0.3,          // ...and λ, how the push follows the angle the water meets the face at: sin(α + λ·(θ − α)) / sin α (the header)
  step: 5e-5,         // s: the contact's integration step...
  sample: 5e-4,       // ...and its path kept this often, for playback
  longest: 0.25,      // s: a contact this long has stopped skimming: the stone goes in...
  slowest: 0.5,       // m/s: ...as does one this slow along the water...
  leastPitch: 2,      // degrees: ...one whose face is pitched nose-up less than this (its leading edge catches)...
  leastExit: 6,       // degrees: ...and one that would leave flatter than this (it would only glide on: a hop under 1/40 as high as it is long)
  leastTilt: 3,       // degrees: the wetted chord is d/sin α with α at least this
};
const SKIP_TILT = { mean: 20, spread: 6, least: 4, most: 40 };   // degrees: the face nose-up along the throw (a normal draw, clamped)
const SKIP_SPIN = { least: 60, most: 110 };                 // rad/s about the short axis (10 to 17 turns a second)
const SKIP_WOBBLE = { degrees: 3, reference: 80 };          // each skip pitches the face by about this (σ), times reference/ω
const SKIP_SPIN_KEPT = 0.85;                                // of the spin left after each skip
const MIRROR_NEARNESS_SCALE = 4;     // the mirror image's alpha is 1 − this / distance (MIRROR_COMMON in src/shaders/scene.js)
// Floating (the header).
const FLOAT = {
  handover: 1.0,              // in its half-height: a rising floater floats once its centre is this near where it floats...
  addedMass: 0.5,             // ...carrying this share of the water its submerged part displaces (src/cavity.js's C_a)...
  damping: 0.12,              // ...its bob damped at this share of critical (the waves it makes carry it off)...
  drag: 0.5,                  // ...the drag on its wetted part at this C_d...
  slowing: 0.8,               // 1/s: ...and its drift along the water fading at this rate besides
  ringFrom: 0.3,              // m/s: rising through the surface (or coming back down) faster than this, it sends out a ring
  quietEntry: 2.0,            // m/s: bobbed clear, it comes back in without a splash if slower than this
  settledSpeed: 0.006,        // m/s: it rests once slower than this...
  settledOffset: 0.0015,      // m: ...and this near the height it floats at
  drift: 0.15,                // m/s: under a gale it drifts downwind at this
  mirrorLeast: 0.03,          // m: a floater standing less than this out of the water is not in its mirror image
  righting: 3,                // rad/s: a floater that is not round turns flat side down at up to this (a pizza, slate, pumice)
};
// Ground (the header: the pool's deck), besides each thing's own (src/things.js `ground`).
const GROUND = {
  scatter: 0.05,               // a stone's path is turned by up to this (radians) by the lump that strikes...
  settle: 0.4,                 // m/s: ...until it comes down slower than this; then it tumbles or rolls along...
  tumbling: 0.9,               // ...a stone slowing at this times g...
  stopped: 0.05,               // m/s: ...and either rests once slower than this
  tumble: 0.5,                 // a stone turns end over end at this times its speed over its radius (it skids as it tumbles)...
  tumbleMost: 60,              // ...at most this (rad/s)
};
// A soft, flat thing's flight (`air.model` 'flutter', src/things.js: a pizza; the header): spun on its face, it keeps level
// as a frisbee does (turning to it at up to `turning` rad/s), its upright side up, wobbling by `pitch` radians `rate` times
// a second; it takes the drag on its face as the share it shows the air (at least `edgeOn`, edge on) and is lifted as a
// plate is (`glide`, of the drag); its aim flies it as it will fly (Rock.trialFlight).
const FLUTTER = { turning: 8, pitch: 0.25, rate: 2.5, spin: [4, 8], edgeOn: 0.15, glide: 0.6 };
// A throw's aim (aimThrow): the flight times it tries (least, most, step; s), the passes against the air's drag and their step (s).
const AIM = { times: [0.3, 2.0, 0.01], passes: 6, step: 1 / 120 };
// A ball's shape and contact (the header).
const BALL_SHAPE = Object.freeze({
  volume: (4 / 3) * Math.PI, centroid: new THREE.Vector3(), axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  semiAxes: [1, 1, 1], elongation: 0, flatness: 0, irregularity: 0,
});
const BALL_CONTACT = Object.freeze({ kind: 'edge', faceAngle: 45, pointAngle: 45, bluntness: 1 });
const rockRotation = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const WATERLINE = { levels: 48 };   // a floater's waterline table's levels (waterlineTable)

/** A standard normal draw (Box–Muller, from Math.random). */
function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * dt seconds through the air for a thing of `radius` and `mass` at `position`
 * with `velocity` (both moved): gravity, and the air's drag, tiny for a
 * stone but keeping long throws honest, and slowing a light ball (src/main.js
 * aims a ball's throw with it).
 */
export function flyStep(position, velocity, radius, mass, dt, drag = 0.47) {
  const speed = velocity.length();
  const dragAcceleration = 0.5 * 1.2 * drag * Math.PI * radius ** 2 * speed / mass;
  velocity.addScaledVector(velocity, -dragAcceleration * dt);
  velocity.y -= GRAVITY * dt;
  position.addScaledVector(velocity, dt);
}

/**
 * A throw from `hand` to `target` (src/main.js, tools/thing-probe.mjs) of
 * anything but a river stone (whose throw is as it always was),
 * `flightTime` the strength's (src/main.js throwVelocity's), for `measured`
 * ({thing, radius, mass, size}: src/things.js): no faster than it can be
 * thrown (`fastest`: of the flight times that are slow enough, the one
 * nearest the strength's, else as far as the fastest throw reaches along the
 * tap's direction) and aimed for the air's drag, which slows a light thing
 * (a tennis ball, pumice): its flight is flown (flyStep) and the aim moved
 * by its miss, AIM.passes times (and held to `fastest` after, a little
 * short). `flight`, if given, flies it as the thing itself flies (Rock
 * trialFlight: a pizza's flutter, whose wobble and glide no plain drag
 * says); else flyStep with its drag. Returns the velocity, the flight time,
 * the path every AIM.step (for the aim's arc) and where it comes down.
 */
export function aimThrow(hand, target, flightTime, measured, flight = null) {
  const fastest = measured.thing.fastest(measured.size);
  const throwTo = (point, time) => { const throwing = point.clone().sub(hand).divideScalar(time); throwing.y += 0.5 * GRAVITY * time; return throwing; };
  let aim = target.clone();
  let time = flightTime;
  if (throwTo(aim, time).length() > fastest) {
    // The flight time nearest the strength's at which `point` is reached no faster than `fastest`, or null.
    const slowEnough = (point) => {
      let best = null;
      for (let trying = AIM.times[0]; trying <= AIM.times[1]; trying += AIM.times[2]) {
        if (throwTo(point, trying).length() <= fastest && (best === null || Math.abs(trying - flightTime) < Math.abs(best - flightTime))) best = trying;
      }
      return best;
    };
    time = slowEnough(aim);
    if (time === null) {
      // Out of reach: as far as it goes along the tap's direction.
      const reach = Math.hypot(target.x - hand.x, target.z - hand.z);
      const along = (distance) => new THREE.Vector3(hand.x + (target.x - hand.x) * distance / reach, 0, hand.z + (target.z - hand.z) * distance / reach);
      let low = 0, high = reach;
      for (let iteration = 0; iteration < 24; iteration++) {
        const middle = 0.5 * (low + high);
        if (slowEnough(along(middle)) !== null) low = middle; else high = middle;
      }
      aim = along(low);
      time = slowEnough(aim) ?? flightTime;
    }
  }
  // The drag's miss, flown out and taken off the aim.
  const goal = aim.clone();
  const position = new THREE.Vector3(), moving = new THREE.Vector3();
  const flyOut = (throwing, path = null) => {
    position.copy(hand);
    moving.copy(throwing);
    flight?.reset(position, moving);
    for (let step = 0; step < 3 / AIM.step && (position.y > 0 || moving.y > 0); step++) {
      path?.push(position.clone());
      if (flight) flight.step(AIM.step, position, moving);
      else flyStep(position, moving, measured.radius, measured.mass, AIM.step, measured.thing.air.drag);
    }
    path?.push(position.clone());
    return position;
  };
  let throwing = throwTo(aim, time);
  for (let pass = 0; pass < AIM.passes; pass++) {
    const landed = flyOut(throwing);
    aim.x += goal.x - landed.x;
    aim.z += goal.z - landed.z;
    throwing = throwTo(aim, time);
  }
  if (throwing.length() > fastest) throwing.setLength(fastest);
  const path = [];
  const landing = flyOut(throwing, path).clone();
  landing.y = 0;
  return { velocity: throwing, flightTime: time, path, landing };
}

/**
 * A fluttering thing's flight, tried before it is thrown (aimThrow, the aim's
 * arc): `thing`, its definition, `shape` (Rock's: one of its kind made
 * before has it), `radius`, `density` and `ownMass` (Rock's); let go as one
 * is (flat, its spin, its wobble from the release: Rock's constructor), so
 * the trial is its flight. `reset(position, velocity)` lets it go there,
 * `step(dt, position, velocity)` moves the two given vectors as it moves.
 */
export function flutterTrial({ thing, shape, radius, density, ownMass }) {
  let trial = null;
  return {
    reset(position, velocity) {
      trial = Object.assign(Object.create(Rock.prototype), {
        thing, shape, radius, density, ownMass, flutterPhase: 0, age: 0, spinRate: 0.5 * (FLUTTER.spin[0] + FLUTTER.spin[1]),
        uprightAxis: thing.body.upright ? UP.clone() : shape.axes[2].clone(),
        quaternion: new THREE.Quaternion(), spinAxis: thing.body.upright ? UP.clone() : shape.axes[2].clone(), position: position.clone(), velocity: velocity.clone(),
      });
    },
    step(dt, position, velocity) {
      trial.age += dt;
      trial.fly(dt);
      trial.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(trial.spinAxis, trial.spinRate * dt));
      position.copy(trial.position);
      velocity.copy(trial.velocity);
    },
  };
}

/** The area of the segment a chord `depth` in from its edge cuts off a disc of `radius`. */
function discSegment(radius, depth) {
  const inside = Math.min(Math.max(depth, 0), 2 * radius);
  const offset = radius - inside;
  return radius * radius * Math.acos(offset / radius) - offset * Math.sqrt(Math.max(radius * radius - offset * offset, 0));
}

/** How long (s) a stone let go `height` over the water, rising at `rise` (m/s), flies before it comes down to it (in a vacuum: the air's drag on a stone is tiny). */
export function flightTime(height, rise) {
  return (rise + Math.sqrt(rise * rise + 2 * GRAVITY * Math.max(height, 0))) / GRAVITY;
}

/** How far along the water (m) a stone let go `height` over it at `speed`, `elevation` radians above level, comes down. */
export function reachAt(height, speed, elevation) {
  return speed * Math.cos(elevation) * flightTime(height, speed * Math.sin(elevation));
}

/**
 * The velocity a skip throw leaves `from` with at `speed` to come down on the
 * water (y = 0) at `to`: the lower of the two arcs (reachAt); beyond the
 * farthest it can reach, that arc.
 */
export function skipLaunch(from, to, speed) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const reach = (elevation) => reachAt(from.y - to.y, speed, elevation);
  // The reach grows with the elevation up to the farthest arc's (under 45° from above the water), found first.
  let low = 0, high = Math.PI / 4;
  for (let step = 0; step < 50; step++) {
    const third = (high - low) / 3;
    if (reach(low + third) < reach(high - third)) low += third; else high -= third;
  }
  const farthest = 0.5 * (low + high);
  low = -Math.PI / 3; high = farthest;
  for (let step = 0; step < 50; step++) {
    const middle = 0.5 * (low + high);
    if (reach(middle) < distance) low = middle; else high = middle;
  }
  const elevation = 0.5 * (low + high);
  const headingX = (to.x - from.x) / Math.max(distance, 1e-9), headingZ = (to.z - from.z) / Math.max(distance, 1e-9);
  const along = speed * Math.cos(elevation);
  return new THREE.Vector3(headingX * along, speed * Math.sin(elevation), headingZ * along);
}

// A skip throw (src/main.js skipThrow; tools/skip-probe.mjs throws the
// same): its speed by strength, in the lake and in the pool (3 m across:
// gentler, so most skips stay in it), for a stone up to `fullRadius`, beyond
// which it goes as fullRadius / R (a rough assumption: as the cube root of
// the mass); the hand let down to `handHeight` over the water (crouched,
// side-arm); let go nearly level, within `elevation` (degrees from level,
// down to up); first touching the lake where it is `shallowest` deep or more.
export const SKIP_THROW = {
  speed: { soft: 7, normal: 10, hard: 13 },
  poolSpeed: { soft: 6, normal: 7.5, hard: 9 },
  fullRadius: 0.04,
  handHeight: 0.3,
  elevation: { least: -3, most: 6 },
  shallowest: 0.3,
};

/** A skip throw's speed (m/s) at strength `power` for a stone of `radius` (SKIP_THROW), in the pool or the lake. */
export function skipSpeed(power, radius, pooled = false) {
  return (pooled ? SKIP_THROW.poolSpeed : SKIP_THROW.speed)[power] * Math.min(1, SKIP_THROW.fullRadius / radius);
}

/**
 * A skip throw's aim: let go from `from` at `speed`, nearly level
 * (SKIP_THROW.elevation), its first touch along the direction to `target`,
 * as near the target as such a release reaches, where `onWater(x, z)` says
 * there is open water; failing that, along the direction to `fallback`;
 * failing that, the farthest such release towards `fallback`, wherever it
 * comes down (a big stone thrown slowly may come down on the pool's deck).
 * Returns the velocity, the flight time and where it comes down (`touch`,
 * which the aim shows: always where the arc meets the water's level).
 */
export function aimSkip(from, target, speed, onWater, fallback) {
  const least = THREE.MathUtils.degToRad(SKIP_THROW.elevation.least), most = THREE.MathUtils.degToRad(SKIP_THROW.elevation.most);
  const nearest = reachAt(from.y, speed, least), farthest = reachAt(from.y, speed, most);
  // The touch along the direction to `towards`, as near it as may be, or null.
  const touchTowards = (towards) => {
    const distance = Math.hypot(towards.x - from.x, towards.z - from.z);
    if (distance < 1e-6) return null;
    const directionX = (towards.x - from.x) / distance, directionZ = (towards.z - from.z) / distance;
    const wanted = THREE.MathUtils.clamp(distance, nearest, farthest);
    for (let step = 0; step <= 64; step++) {
      // Outward and inward from the wanted reach, nearest first.
      for (const side of [1, -1]) {
        const reach = wanted + side * (farthest - nearest) * step / 64;
        if (reach >= nearest && reach <= farthest && onWater(from.x + directionX * reach, from.z + directionZ * reach)) return new THREE.Vector3(from.x + directionX * reach, 0, from.z + directionZ * reach);
      }
    }
    return null;
  };
  const touch = touchTowards(target) ?? touchTowards(fallback);
  let velocity;
  if (touch) velocity = skipLaunch(from, touch, speed);
  else {
    const distance = Math.hypot(fallback.x - from.x, fallback.z - from.z) || 1;
    const level = speed * Math.cos(most);
    velocity = new THREE.Vector3(((fallback.x - from.x) / distance) * level, speed * Math.sin(most), ((fallback.z - from.z) / distance) * level);
  }
  const time = flightTime(from.y, velocity.y);
  return { velocity, flightTime: time, touch: new THREE.Vector3(from.x + velocity.x * time, 0, from.z + velocity.z * time) };
}

/** The share of a ball's volume under a level `depth` up from its bottom, `depth` in radii (0 to 2): a spherical cap's. */
function capShare(depth) {
  const inside = Math.min(Math.max(depth, 0), 2);
  return inside * inside * (3 - inside) / 4;
}

/**
 * The share of a closed mesh's volume (unit radius, separate triangles)
 * below each of WATERLINE.levels + 1 levels along `axis`, from its lowest
 * point to its highest (a floater's waterline, Rock.waterline): each level's
 * volume is the sum, over its triangles clipped to the side below, of the
 * tetrahedra they make with a point on the level's plane (the plane's own
 * cap then adds nothing). Made once, as a thing is thrown.
 */
export function waterlineTable(geometry, axis) {
  const positions = geometry.attributes.position.array;
  const heights = new Float64Array(positions.length / 3);
  let low = Infinity, high = -Infinity;
  for (let vertex = 0; vertex < heights.length; vertex++) {
    heights[vertex] = positions[vertex * 3] * axis.x + positions[vertex * 3 + 1] * axis.y + positions[vertex * 3 + 2] * axis.z;
    low = Math.min(low, heights[vertex]); high = Math.max(high, heights[vertex]);
  }
  const point = (vertex) => [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
  const volumeBelow = (level) => {
    const originX = axis.x * level, originY = axis.y * level, originZ = axis.z * level;
    let volume = 0;
    for (let first = 0; first < heights.length; first += 3) {
      // The triangle clipped to below the level (Sutherland–Hodgman against one plane), then fanned.
      const polygon = [];
      for (let corner = 0; corner < 3; corner++) {
        const here = first + corner, next = first + ((corner + 1) % 3);
        const hereBelow = heights[here] <= level, nextBelow = heights[next] <= level;
        if (hereBelow) polygon.push(point(here));
        if (hereBelow !== nextBelow) {
          const share = (level - heights[here]) / (heights[next] - heights[here]);
          const a = point(here), b = point(next);
          polygon.push([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share]);
        }
      }
      for (let corner = 1; corner + 1 < polygon.length; corner++) {
        const [ax, ay, az] = [polygon[0][0] - originX, polygon[0][1] - originY, polygon[0][2] - originZ];
        const [bx, by, bz] = [polygon[corner][0] - originX, polygon[corner][1] - originY, polygon[corner][2] - originZ];
        const [cx, cy, cz] = [polygon[corner + 1][0] - originX, polygon[corner + 1][1] - originY, polygon[corner + 1][2] - originZ];
        volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
      }
    }
    return volume;
  };
  const total = volumeBelow(high + 1e-6);
  const shares = new Float64Array(WATERLINE.levels + 1);
  for (let level = 0; level <= WATERLINE.levels; level++) shares[level] = level === 0 ? 0 : level === WATERLINE.levels ? 1 : volumeBelow(low + ((high - low) * level) / WATERLINE.levels) / total;
  return { axis: axis.clone(), low, high, shares };
}

/** The depth (in radii up from its bottom) a ball of `share` of water's density floats at: capShare's inverse, by bisection. */
function floatingDepth(share) {
  let low = 0, high = 2;
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = 0.5 * (low + high);
    if (capShare(middle) < share) low = middle; else high = middle;
  }
  return 0.5 * (low + high);
}

/**
 * Eigenvalues and unit eigenvectors of a symmetric 3×3 matrix (row-major
 * array of 9), by Jacobi rotations; sorted from the largest eigenvalue down.
 */
function symmetricEigen(matrix) {
  const values = matrix.slice();
  const vectors = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 16; sweep++) {
    const offDiagonal = Math.abs(values[1]) + Math.abs(values[2]) + Math.abs(values[5]);
    if (offDiagonal < 1e-14) break;
    for (const [first, second] of [[0, 1], [0, 2], [1, 2]]) {
      const pivot = values[first * 3 + second];
      if (Math.abs(pivot) < 1e-16) continue;
      const theta = (values[second * 3 + second] - values[first * 3 + first]) / (2 * pivot);
      const tangent = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cosine = 1 / Math.sqrt(tangent * tangent + 1);
      const sine = tangent * cosine;
      // values ← Jᵀ·values·J and vectors ← vectors·J for the rotation J in the (first, second) plane.
      for (let index = 0; index < 3; index++) {
        const atFirst = values[index * 3 + first], atSecond = values[index * 3 + second];
        values[index * 3 + first] = cosine * atFirst - sine * atSecond;
        values[index * 3 + second] = sine * atFirst + cosine * atSecond;
      }
      for (let index = 0; index < 3; index++) {
        const atFirst = values[first * 3 + index], atSecond = values[second * 3 + index];
        values[first * 3 + index] = cosine * atFirst - sine * atSecond;
        values[second * 3 + index] = sine * atFirst + cosine * atSecond;
      }
      for (let index = 0; index < 3; index++) {
        const atFirst = vectors[index * 3 + first], atSecond = vectors[index * 3 + second];
        vectors[index * 3 + first] = cosine * atFirst - sine * atSecond;
        vectors[index * 3 + second] = sine * atFirst + cosine * atSecond;
      }
    }
  }
  const pairs = [0, 1, 2].map((index) => ({ value: values[index * 4], vector: new THREE.Vector3(vectors[index], vectors[3 + index], vectors[6 + index]).normalize() }));
  return pairs.sort((first, second) => second.value - first.value);
}

/**
 * The stone's shape (the header), in its own frame and in nominal radii: the
 * centroid, the principal axes long to short with the semi-axes a ≥ b ≥ c of
 * the ellipsoid with the same second moments, elongation 1 − b/a, flatness
 * 1 − c/b and irregularity, the rms departure of the vertices from that
 * ellipsoid.
 */
export function stoneShape(geometry) {
  const positions = geometry.attributes.position.array;
  let volume = 0;
  let centroidX = 0, centroidY = 0, centroidZ = 0;
  const moments = new Float64Array(9);   // ∫ x·xᵀ dV about the origin
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const bx = positions[index + 3], by = positions[index + 4], bz = positions[index + 5];
    const cx = positions[index + 6], cy = positions[index + 7], cz = positions[index + 8];
    // A tetrahedron from the origin to the face: signed volume a·(b × c)/6.
    const tetrahedron = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    volume += tetrahedron;
    const sumX = ax + bx + cx, sumY = ay + by + cy, sumZ = az + bz + cz;
    centroidX += tetrahedron * sumX / 4; centroidY += tetrahedron * sumY / 4; centroidZ += tetrahedron * sumZ / 4;
    // Its second moment with one corner at the origin: V/20·(Σ p·pᵀ + (Σ p)(Σ p)ᵀ).
    const corners = [ax, ay, az, bx, by, bz, cx, cy, cz];
    const sums = [sumX, sumY, sumZ];
    for (let row = 0; row < 3; row++) {
      for (let column = row; column < 3; column++) {
        let sum = sums[row] * sums[column];
        for (let corner = 0; corner < 3; corner++) sum += corners[corner * 3 + row] * corners[corner * 3 + column];
        moments[row * 3 + column] += (tetrahedron / 20) * sum;
      }
    }
  }
  centroidX /= volume; centroidY /= volume; centroidZ /= volume;
  const centroid = [centroidX, centroidY, centroidZ];
  const central = new Array(9);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const upper = row <= column ? moments[row * 3 + column] : moments[column * 3 + row];
      central[row * 3 + column] = upper / volume - centroid[row] * centroid[column];
    }
  }
  const [long, middle, short] = symmetricEigen(central);
  const semiAxes = [long, middle, short].map((pair) => Math.sqrt(5 * Math.max(pair.value, 1e-9)));
  const axes = [long.vector, middle.vector, short.vector];
  // Irregularity: each vertex's distance from the centroid against the ellipsoid's radius in its direction.
  let sumSquares = 0;
  const count = positions.length / 3;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] - centroidX, y = positions[index + 1] - centroidY, z = positions[index + 2] - centroidZ;
    const distance = Math.hypot(x, y, z);
    if (distance < 1e-9) continue;
    let inverseSquare = 0;
    for (let axis = 0; axis < 3; axis++) {
      const along = (x * axes[axis].x + y * axes[axis].y + z * axes[axis].z) / distance;
      inverseSquare += (along * along) / (semiAxes[axis] * semiAxes[axis]);
    }
    const departure = distance * Math.sqrt(inverseSquare) - 1;
    sumSquares += departure * departure;
  }
  return {
    volume, centroid: new THREE.Vector3(centroidX, centroidY, centroidZ), axes, semiAxes,
    elongation: 1 - semiAxes[1] / semiAxes[0],
    flatness: 1 - semiAxes[2] / semiAxes[1],
    irregularity: Math.sqrt(sumSquares / count),
  };
}

export class Rock {
  /**
   * @param radius nominal radius in metres
   * @param envTexture environment map for lighting
   * @param skip a flat stone for a skip throw (the header), let go by launchSkip
   * @param thing what it is (a key of src/things.js THINGS; the river stone if absent)
   * @param mass a ball's mass (kg; src/things.js measure); a stone's is its density's
   * @param mirrorLayer the layer the water's mirror image draws (src/splash.js MIRROR_LAYER): afloat, it is in it
   * @param water the water's uniforms (src/waterSurface.js rideUniforms): a floater given them rides the water's ripples as drawn (rideTheWater)
   */
  constructor({ radius, position, velocity, envTexture, waterFog = null, thing = DEFAULT_THING, mass = null, mirrorLayer = null, skip = false, water = null }) {
    this.radius = radius;
    this.position = position.clone();
    this.previous = position.clone();   // where it was a step ago
    this.velocity = velocity.clone();
    this.state = 'air';
    // A skip stone's state; `inside(x, z)`, given in a pool (src/main.js), says where its walls let it touch and skim.
    this.skip = skip ? { normal: new THREE.Vector3(0, 1, 0), skips: 0, contact: null, inside: null } : null;
    this.thing = THINGS[thing] ?? THINGS[DEFAULT_THING];
    this.sphere = this.thing.sphere;   // its body a sphere (the header), not its mesh's own shape
    // Its own mass, unless sized by its diameter: then its density's (`mass`, as a stone's always was).
    this.ownMass = this.thing.byDiameter ? null : mass ?? this.thing.measure(this.thing.slider?.initial).mass;
    this.afloat = false;           // at rest on the water (the header's floating)
    this.hasFloated = false;       // has floated, so bobbed clear it comes back in quietly
    this.drift = { x: 0, z: 0 };   // m/s: what a gale drifts it at, afloat (src/main.js)
    // The ground's height at (x, z), or null over the water: the pool's deck (src/pool.js poolGround, given by src/main.js; the header).
    this.groundAt = null;
    this.groundHeight = 0;         // the ground's height under a thing tumbling or rolling along it (`ground`)
    this.onGround = false;         // at rest on the ground (restOn), in sight as a floater is (src/main.js)
    this.drawn = { surface: 0, bedDepth: 1 };   // the water it was last drawn on (syncMeshes), for a knock's redraw
    this.age = 0;
    this.restTime = 0;
    this.quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this.spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.spinRate = SPIN_LEAST + (SPIN_MOST - SPIN_LEAST) * Math.random() ** SPIN_SKEW;
    const mesh = meshKind(this.thing.look.mesh);
    this.geometry = mesh.build(this.thing, { flat: Boolean(skip) });
    this.geometry.computeBoundingSphere();
    this.reach = this.geometry.boundingSphere.center.length() + this.geometry.boundingSphere.radius;   // furthest any point gets from the centre, in radii
    this.shape = this.sphere ? BALL_SHAPE : stoneShape(this.geometry);
    // Its density: its definition's, or its mass over its volume (a sphere's; a mesh's own, as a pizza's disc).
    const volume = this.sphere ? (4 / 3) * Math.PI * radius ** 3 : this.shape.volume * radius ** 3;
    this.density = this.thing.body.density ?? this.ownMass / volume;
    this.floats = this.density < WATER_DENSITY;
    // Which way is up for it: its own +y if it is kept upright (a pizza's toppings), else its short axis, either way.
    this.uprightAxis = this.thing.body.upright ? UP.clone() : this.shape.axes[2].clone();
    // A floater that is not a sphere floats by its mesh's own volume (waterlineTable).
    this.waterlineTable = this.floats && !this.sphere ? waterlineTable(this.geometry, this.uprightAxis) : null;
    this.liftHeading = Math.random() * Math.PI * 2;   // the direction its lumps push it (the header)
    this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, time: 0, liftX: 0, liftY: 0, liftZ: 0, spinLiftX: 0, spinLiftY: 0, spinLiftZ: 0, resting: false, openUntil: undefined };
    // Its constants under water (src/cavity.js underWater): the reference stone's for a river stone.
    this.body.water = underWater(this.density, this.thing.water.restingHeight);
    this.impactStep = 0;
    const look = this.thing.look;
    const baseColor = mesh.color(this.thing);
    // The seed of its splash's own random stream (src/splash.js), drawn now so
    // that a seeded throw splashes alike however its flight is stepped.
    this.splashSeed = Math.floor(Math.random() * 4294967296);
    // A fluttering thing is let go flat (held so, as a pizza is), spinning on its face (FLUTTER), its wobble from the release:
    // its flight is then known before it is thrown (flutterTrial: the aim).
    if (this.thing.air.model === 'flutter') {
      this.quaternion.identity();
      this.flutterPhase = 0;
      this.spinRate = 0.5 * (FLUTTER.spin[0] + FLUTTER.spin[1]);
      this.spinAxis.copy(this.uprightAxis);
    }
    const map = mesh.texture?.(this.thing) ?? null;   // a textured look's (a pizza's top); its own program (src/main.js warmUp)
    const makeMaterial = (clipNormalY) => new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: true,
      ...(map ? { map } : {}),
      roughness: look.roughness,
      metalness: 0.0,
      envMap: envTexture,
      envMapIntensity: look.reflection,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, clipNormalY, 0), 0)],   // at the water's height under the stone (syncMeshes)
    });
    this.meshAbove = new THREE.Mesh(this.geometry, makeMaterial(1));
    this.meshBelow = new THREE.Mesh(this.geometry, makeMaterial(-1));
    this.meshBelow.material.envMapIntensity = 0.35;
    // The part above the water in the water's mirror image, afloat (the header): its distance in alpha.
    // Only a floater has one (a mesh and a material draw random ids, which would move a seeded stone's splash).
    this.meshMirror = null;
    if (this.floats) {
      this.meshMirror = new THREE.Mesh(this.geometry, makeMaterial(1));
      this.meshMirror.material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.a = 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05);`);
      };
      this.meshMirror.material.customProgramCacheKey = () => 'mirror-nearness';
      if (mirrorLayer !== null) this.meshMirror.layers.set(mirrorLayer);
      this.meshMirror.visible = false;
    }
    // Under the water: where the surface shows it (the header), by this much.
    const seenThroughWater = this.seenThroughWater = { value: 0 };
    const waterLevel = this.waterLevel = { value: 0 };   // the surface's height above the stone, under a gale
    this.sinceImpact = -1;
    this.cavityTimes = null;   // its cavity's pinch-off (s after the impact), once the splash says
    // Seen from an eye under the water, it fades into the water's colour with
    // the distance through it (as the floor does, UNDER_FOG in src/shaders/scene.js,
    // with the water's light looking level).
    const fogExtinction = { value: waterFog?.extinction ?? new THREE.Vector3() };
    const fogColor = { value: waterFog?.color ?? new THREE.Vector3() };
    this.meshBelow.material.onBeforeCompile = (shader) => {
      shader.uniforms.uSeenThroughWater = seenThroughWater;
      shader.uniforms.uWaterLevel = waterLevel;
      shader.uniforms.uFogExtinction = fogExtinction;
      shader.uniforms.uFogColor = fogColor;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uSeenThroughWater;\nuniform float uWaterLevel;\n${SEEN_THROUGH_WATER}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  vec3 trueWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  mvPosition = viewMatrix * vec4(mix(trueWorld, seenThroughWater(trueWorld, uWaterLevel), uSeenThroughWater), 1.0);
  gl_Position = projectionMatrix * mvPosition;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFogExtinction;\nuniform vec3 uFogColor;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
  if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));`);
    };
    this.meshBelow.material.customProgramCacheKey = () => 'seen-through-water';
    if (this.floats && water) this.rideTheWater(water, { seenThroughWater, waterLevel, fogExtinction, fogColor });
    for (const mesh of this.meshes) {
      mesh.scale.setScalar(radius);
      mesh.frustumCulled = false;
    }
    this.syncMeshes();
  }

  /**
   * A floater's materials made to ride the water as it is drawn (the header):
   * the water's ripples, wind waves and rings are the GPU's (the physics
   * floats it on still water), so its vertices rise, fall and tilt with the
   * water's height at its middle and its slope across it
   * (src/shaders/scene.js FLOATER_WATER, read with the water's own uniforms),
   * and each part is cut where the water's surface really is, pixel by pixel,
   * in place of a level plane: the water laps along it, a pizza's crust and
   * all; inside its rim (`water.dry`: a pizza's crust) its top is never cut,
   * the rim holding the water out (src/waterSurface.js setDryDiscs hides the
   * water there). Its three programs (above, below, in the mirror) are its own, drawn
   * under the loading veil (src/main.js warmUp).
   */
  rideTheWater(water, { seenThroughWater, waterLevel, fogExtinction, fogColor }) {
    // Inside its rim, its share `water.dry` of its radius (src/things.js), the water never covers its top.
    const dryRadius = { value: (this.thing.water.dry ?? 0) * this.radius };
    const ride = (side) => (shader) => {
      Object.assign(shader.uniforms, water);
      shader.uniforms.uWaterLevel = waterLevel;
      shader.uniforms.uSeenThroughWater = seenThroughWater;
      shader.uniforms.uFogExtinction = fogExtinction;
      shader.uniforms.uFogColor = fogColor;
      shader.uniforms.uDryRadius = dryRadius;
      const declarations = `${FLOATER_WATER}\nuniform float uWaterLevel;\nuniform float uDryRadius;\nvarying vec3 vRideWorld;\nvarying vec2 vRideMiddle;\n`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${declarations}uniform float uSeenThroughWater;\n${side === 'below' ? SEEN_THROUGH_WATER : ''}`)
        .replace('#include <project_vertex>', `
  vec4 ridden = modelMatrix * vec4(transformed, 1.0);
  vec3 middle = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float across = 0.5 * length(modelMatrix[0].xyz);
  float slopeX = (floaterWaterHeight(middle.xz + vec2(across, 0.0)) - floaterWaterHeight(middle.xz - vec2(across, 0.0))) / (2.0 * across);
  float slopeZ = (floaterWaterHeight(middle.xz + vec2(0.0, across)) - floaterWaterHeight(middle.xz - vec2(0.0, across))) / (2.0 * across);
  ridden.y += floaterWaterHeight(middle.xz) + slopeX * (ridden.x - middle.x) + slopeZ * (ridden.z - middle.z);
  vRideWorld = ridden.xyz;
  vRideMiddle = middle.xz;
  ${side === 'below' ? 'ridden.xyz = mix(ridden.xyz, seenThroughWater(ridden.xyz, uWaterLevel), uSeenThroughWater);' : ''}
  vec4 mvPosition = viewMatrix * ridden;
  gl_Position = projectionMatrix * mvPosition;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${declarations}uniform vec3 uFogExtinction;\nuniform vec3 uFogColor;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  ${side === 'below' ? '' : '// Inside its rim (a pizza\'s crust holds the water out) its top is never under it.\n  if (distance(vRideWorld.xz, vRideMiddle) >= uDryRadius)'}
  if (vRideWorld.y ${side === 'below' ? '>' : '<'} uWaterLevel + floaterWaterHeight(vRideWorld.xz)) discard;`)
        .replace('#include <fog_fragment>', `#include <fog_fragment>
  ${side === 'below' ? 'if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));' : ''}`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  ${side === 'mirror' ? `gl_FragColor.a = 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05);` : ''}`);
    };
    for (const [mesh, side] of [[this.meshAbove, 'above'], [this.meshBelow, 'below'], [this.meshMirror, 'mirror']]) {
      if (!mesh) continue;
      mesh.material.clippingPlanes = [];
      mesh.material.onBeforeCompile = ride(side);
      mesh.material.customProgramCacheKey = () => `ride-${side}`;
    }
  }

  /** Its meshes: above the water, below it, and afloat in the mirror image. */
  get meshes() { return this.meshMirror ? [this.meshAbove, this.meshBelow, this.meshMirror] : [this.meshAbove, this.meshBelow]; }

  /** Its mass (kg): a ball's or a gem's own; a stone's the nominal ball's of its density (the air's drag's, as it always was). */
  get mass() { return this.thing.byDiameter ? this.density * (4 / 3) * Math.PI * this.radius ** 3 : this.ownMass; }

  /** The stone's own mass (kg), from its volume (the skim's; `mass`, the nominal ball's, is the air drag's). */
  get trueMass() { return this.density * this.shape.volume * this.radius ** 3; }

  /** The radius (m) of the disc with the area of its face: the ellipsoid's two long semi-axes' mean (the header). */
  get faceRadius() { return this.radius * Math.sqrt(this.shape.semiAxes[0] * this.shape.semiAxes[1]); }

  /**
   * Let a skip stone go at `velocity` (the header): its face tilted nose-up
   * along the throw by SKIP_TILT, never to either side, its long axis
   * anywhere in the face, spinning at SKIP_SPIN about its short axis.
   */
  launchSkip(velocity) {
    this.velocity.copy(velocity);
    const heading = new THREE.Vector3(velocity.x, 0, velocity.z).normalize();
    const side = new THREE.Vector3(-heading.z, 0, heading.x);
    const tilt = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(SKIP_TILT.mean + SKIP_TILT.spread * gaussian(), SKIP_TILT.least, SKIP_TILT.most));
    // The face's normal leans back against the throw (nose up), in the throw's vertical plane.
    const normal = new THREE.Vector3(0, Math.cos(tilt), 0).addScaledVector(heading, -Math.sin(tilt)).normalize();
    // The stone's frame (long, middle, short) onto the world's (a level-ish direction in the face, the one across, the normal).
    const [long, , short] = this.shape.axes;
    const middle = new THREE.Vector3().crossVectors(short, long).normalize();
    const turn = Math.random() * Math.PI * 2;
    const inFace = new THREE.Vector3().crossVectors(normal, side).normalize().applyAxisAngle(normal, turn);
    const across = new THREE.Vector3().crossVectors(normal, inFace);
    const world = new THREE.Matrix4().makeBasis(inFace, across, normal);
    const local = new THREE.Matrix4().makeBasis(long, middle, short).transpose();
    this.quaternion.setFromRotationMatrix(world.multiply(local));
    this.skip.normal.copy(normal);
    this.spinAxis.copy(normal);
    this.spinRate = SKIP_SPIN.least + (SKIP_SPIN.most - SKIP_SPIN.least) * Math.random();
    this.syncMeshes();
  }

  /**
   * The contact of a skip stone that has just touched the water, worked out
   * to its end (the header): whether it skips, how long it lasts, its path
   * (every SKIM.sample: time, position, velocity) and how it leaves. Under a
   * gale the water is taken as level at `surface`, its height where the
   * stone touched, for the few hundredths of a second the contact lasts.
   */
  skim(surface = 0) {
    const normal = this.skip.normal;
    const mass = this.trueMass;
    const face = this.faceRadius;
    const tilt = Math.acos(Math.min(Math.abs(normal.y), 1));
    const chordPerDepth = 1 / Math.sin(Math.max(tilt, THREE.MathUtils.degToRad(SKIM.leastTilt)));
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(-(normal.x * this.velocity.x + normal.z * this.velocity.z) / Math.max(horizontal, 1e-9), -1, 1));
    let x = this.position.x, y = this.position.y, z = this.position.z;
    let vx = this.velocity.x, vy = this.velocity.y, vz = this.velocity.z;
    const top = y;
    const samples = [0, x, y, z, vx, vy, vz];
    let time = 0, nextSample = SKIM.sample;
    let skips = pitch >= THREE.MathUtils.degToRad(SKIM.leastPitch);
    while (skips) {
      const chord = (top - y) * chordPerDepth;
      if (chord >= 2 * face || time >= SKIM.longest || Math.hypot(vx, vz) < SKIM.slowest) { skips = false; break; }
      if (this.skip.inside && !this.skip.inside(x, z)) { skips = false; break; }
      const dynamic = 0.5 * WATER_DENSITY * (vx * vx + vy * vy + vz * vz) * discSegment(face, chord) / mass;
      const intoFace = vx * normal.x + vy * normal.y + vz * normal.z;
      let ax = 0, ay = -GRAVITY, az = 0;
      if (intoFace < 0) {
        // The push fades as the stone climbs towards its tilt (the header): sin(α + λ·(θ − α)) of it over sin α.
        const meets = Math.asin(Math.min(-intoFace / Math.sqrt(vx * vx + vy * vy + vz * vz), 1));
        const push = SKIM.pressure * dynamic * Math.max(Math.sin(tilt + SKIM.fade * (meets - tilt)), 0) / Math.sin(Math.max(tilt, 1e-3));
        ax += push * normal.x; ay += push * normal.y; az += push * normal.z;
      }
      const tangentX = vx - intoFace * normal.x, tangentY = vy - intoFace * normal.y, tangentZ = vz - intoFace * normal.z;
      const tangent = Math.hypot(tangentX, tangentY, tangentZ);
      if (tangent > 1e-9) { const drag = SKIM.friction * dynamic / tangent; ax -= drag * tangentX; ay -= drag * tangentY; az -= drag * tangentZ; }
      vx += ax * SKIM.step; vy += ay * SKIM.step; vz += az * SKIM.step;
      x += vx * SKIM.step; y += vy * SKIM.step; z += vz * SKIM.step;
      time += SKIM.step;
      if (time >= nextSample) { samples.push(time, x, y, z, vx, vy, vz); nextSample += SKIM.sample; }
      if (y >= top && vy > 0) break;
    }
    // Out of the water too flat, it only glides on and digs in: it goes in at its touch instead.
    if (skips && Math.atan2(vy, Math.hypot(vx, vz)) < THREE.MathUtils.degToRad(SKIM.leastExit)) skips = false;
    if (samples[samples.length - 7] < time) samples.push(time, x, y, z, vx, vy, vz);
    return {
      skips, duration: time, samples: Float32Array.from(samples), age: 0, surface,
      exitPosition: new THREE.Vector3(x, y, z), exitVelocity: new THREE.Vector3(vx, vy, vz),
    };
  }

  /** Where the contact's path has the stone at `age` (s since it touched), into `position` and `velocity`. */
  skimAt(contact, age, position, velocity) {
    const samples = contact.samples;
    const count = samples.length / 7;
    // Samples come every SKIM.sample, but for the last.
    let index = THREE.MathUtils.clamp(Math.floor(age / SKIM.sample) - 1, 0, count - 2);
    while (index < count - 2 && samples[(index + 1) * 7] < age) index++;
    while (index > 0 && samples[index * 7] > age) index--;
    const from = index * 7, to = from + 7;
    const share = THREE.MathUtils.clamp((age - samples[from]) / Math.max(samples[to] - samples[from], 1e-9), 0, 1);
    const lerp = (offset) => samples[from + offset] + (samples[to + offset] - samples[from + offset]) * share;
    position.set(lerp(1), lerp(2), lerp(3));
    velocity.set(lerp(4), lerp(5), lerp(6));
  }

  /** Off the water after a skip (the header): its spin slower, its face pitched by a wobble. */
  afterSkip() {
    this.skip.skips++;
    this.spinRate *= SKIP_SPIN_KEPT;
    // About the level axis across its path: the tilt changes, not the lean to either side, so the path stays straight.
    const along = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    const axis = new THREE.Vector3(-this.velocity.z / along, 0, this.velocity.x / along);
    const angle = THREE.MathUtils.degToRad(SKIP_WOBBLE.degrees * gaussian()) * (SKIP_WOBBLE.reference / Math.max(this.spinRate, 1));
    const wobble = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.skip.normal.applyQuaternion(wobble);
    this.quaternion.premultiply(wobble);
    this.spinAxis.copy(this.skip.normal);
  }

  /** Height of the stone's lowest point below its centre (negative, metres), as it is turned now. */
  lowestOffset() {
    if (this.sphere) return -this.radius;
    const positions = this.geometry.attributes.position.array;
    // The world height of a mesh point is the rotation's second row dotted with it.
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    let lowest = 0;
    for (let index = 0; index < positions.length; index += 3) {
      lowest = Math.min(lowest, rowX * positions[index] + rowY * positions[index + 1] + rowZ * positions[index + 2]);
    }
    return lowest * this.radius;
  }

  /**
   * How far the stone's ellipsoid (its shape's) reaches below its origin (m),
   * as it is turned now: a smooth stand-in for lowestOffset's walk over the
   * lumpy mesh, cheap enough for every step (on the ground, afloat). A ball's radius.
   */
  ellipsoidDepth() {
    if (this.sphere) return this.radius;
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    let sum = 0;
    this.shape.axes.forEach((axis, index) => { sum += (this.shape.semiAxes[index] * (rowX * axis.x + rowY * axis.y + rowZ * axis.z)) ** 2; });
    const centroid = this.shape.centroid;
    return this.radius * (Math.sqrt(sum) - (rowX * centroid.x + rowY * centroid.y + rowZ * centroid.z));
  }

  /**
   * Which part of the stone touches first, as it is turned now (the header):
   * the kind, the short and long axes' angles from the vertical (degrees) and
   * the bluntness there. A ball's is a ball's (BALL_CONTACT).
   */
  contact() {
    if (this.sphere) return BALL_CONTACT;
    const positions = this.geometry.attributes.position.array;
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    // The world's down in the stone's frame is minus the rotation's second row.
    const down = new THREE.Vector3(-rowX, -rowY, -rowZ);
    const alignment = this.shape.axes.map((axis) => Math.abs(axis.dot(down)));
    const nearest = alignment.indexOf(Math.max(...alignment));
    let lowest = Infinity;
    for (let index = 0; index < positions.length; index += 3) lowest = Math.min(lowest, rowX * positions[index] + rowY * positions[index + 1] + rowZ * positions[index + 2]);
    // The faces within BLUNT_BAND of the lowest point, by the share of their
    // corners inside it, projected on the water: the footprint of the part
    // that goes in first.
    const acrossX = [rotation[0], rotation[4], rotation[8]], acrossZ = [rotation[2], rotation[6], rotation[10]];
    let footprint = 0;
    for (let index = 0; index < positions.length; index += 9) {
      let inside = 0;
      const projected = [];
      for (let corner = 0; corner < 3; corner++) {
        const offset = index + corner * 3;
        const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
        if (rowX * x + rowY * y + rowZ * z <= lowest + BLUNT_BAND) inside++;
        projected.push(acrossX[0] * x + acrossX[1] * y + acrossX[2] * z, acrossZ[0] * x + acrossZ[1] * y + acrossZ[2] * z);
      }
      if (inside === 0) continue;
      const area = 0.5 * Math.abs((projected[2] - projected[0]) * (projected[5] - projected[1]) - (projected[4] - projected[0]) * (projected[3] - projected[1]));
      footprint += area * inside / 3;
    }
    // A ball's cap BLUNT_BAND deep covers π·(2·BLUNT_BAND − BLUNT_BAND²) of the water.
    return {
      kind: ['point', 'edge', 'face'][nearest],
      faceAngle: THREE.MathUtils.radToDeg(Math.acos(Math.min(alignment[2], 1))),
      pointAngle: THREE.MathUtils.radToDeg(Math.acos(Math.min(alignment[0], 1))),
      bluntness: footprint / (Math.PI * (2 * BLUNT_BAND - BLUNT_BAND * BLUNT_BAND)),
    };
  }

  /**
   * The sideways push the water gives the stone (the header): the shape's
   * lift and the spin's, each C_L times a unit direction across the entry
   * velocity, together at most LIFT_CAP.
   */
  liftAt(velocity) {
    const speed = Math.max(velocity.length(), 1e-6);
    const along = velocity.clone().divideScalar(speed);
    const across = (vector) => vector.addScaledVector(along, -vector.dot(along));
    // A tilted flattened stone: its face's normal, turned to face the oncoming water, pushes it along itself.
    const normal = this.shape.axes[2].clone().applyQuaternion(this.quaternion);
    if (normal.dot(along) > 0) normal.negate();
    const attack = Math.asin(Math.min(Math.abs(normal.dot(along)), 1));   // the face from the direction of travel
    const shapeLift = across(normal.clone());
    if (shapeLift.lengthSq() > 1e-12) shapeLift.normalize().multiplyScalar(FLAT_LIFT * (this.shape.flatness + 0.5 * this.shape.elongation) * Math.abs(Math.sin(2 * attack)));
    else shapeLift.set(0, 0, 0);
    // Its lumps, in a direction of its own.
    const lumps = across(new THREE.Vector3(Math.cos(this.liftHeading), 0.3 * Math.sin(3 * this.liftHeading), Math.sin(this.liftHeading)));
    if (lumps.lengthSq() > 1e-12) shapeLift.addScaledVector(lumps.normalize(), IRREGULAR_LIFT * this.shape.irregularity);
    // The spin: along ω × v.
    const magnus = this.spinAxis.clone().cross(along);
    const spinLift = magnus.lengthSq() > 1e-12 ? magnus.normalize().multiplyScalar(SPIN_LIFT * this.spinRate * this.radius / speed) : magnus.set(0, 0, 0);
    const total = shapeLift.clone().add(spinLift).length();
    if (total > LIFT_CAP) { shapeLift.multiplyScalar(LIFT_CAP / total); spinLift.multiplyScalar(LIFT_CAP / total); }
    return { shape: shapeLift, spin: spinLift };
  }

  /**
   * The splash's cavity for this stone pinches off this many seconds after the
   * impact (on the splash's clock, which starts a substep before the stone's
   * own under water): its head acts until then (sinkStep), and it is seen
   * through the water from then on.
   */
  setCavityTimes(pinchTime) {
    this.cavityTimes = { pinchTime };
    this.body.openUntil = pinchTime - this.impactStep;
  }

  /**
   * The meshes where the stone is drawn: in the air where it is; in the water
   * lifted as the gale lifts the splash (the header), its halves cut at the
   * water's height `surface` over it. Afloat, its part above the water is in
   * the mirror image too.
   */
  syncMeshes(surface = 0, bedDepth = 1) {
    this.drawn.surface = surface;
    this.drawn.bedDepth = bedDepth;
    let lift = 0;
    // On still water (in it, afloat or on its bed) it rides the gale's lift; in the air, skimming or on the ground it is where it is.
    const stillWater = this.state === 'water' || this.state === 'rest' || this.state === 'float';
    if (stillWater && surface !== 0) lift = this.position.y >= 0 ? surface : surface * Math.max(1 + this.position.y / bedDepth, 0);
    for (const mesh of this.meshes) {
      mesh.position.set(this.position.x, this.position.y + lift, this.position.z);
      mesh.quaternion.copy(this.quaternion);
    }
    // Cut at the water: by a plane at its height over it (a floater that rides the water cuts itself at its true surface, rideTheWater).
    if (this.meshAbove.material.clippingPlanes.length) this.meshAbove.material.clippingPlanes[0].constant = -surface;   // keeps y ≥ surface
    if (this.meshBelow.material.clippingPlanes.length) this.meshBelow.material.clippingPlanes[0].constant = surface;    // keeps y ≤ surface
    if (this.meshMirror) {
      if (this.meshMirror.material.clippingPlanes.length) this.meshMirror.material.clippingPlanes[0].constant = -surface;
      // Only what stands out of the water enough to show in it: a flat thing's image (a pizza's) would be a sliver, which
      // the mirror's ripples break into stray lines (FLOAT.mirrorLeast).
      const afloat = this.state === 'float' || this.afloat;
      this.meshMirror.visible = afloat && this.position.y + this.waterline(this.position.y).high > FLOAT.mirrorLeast;
    }
    this.waterLevel.value = surface;
  }

  /**
   * What a gale drifts it at afloat (the header): FLOAT.drift along
   * `direction` (the wind's, a unit vector in world x and z as a Vector2's x
   * and y), or nothing for null. A floater at rest starts drifting.
   */
  setDrift(direction) {
    this.drift.x = direction ? direction.x * FLOAT.drift : 0;
    this.drift.z = direction ? direction.y * FLOAT.drift : 0;
    if ((this.drift.x !== 0 || this.drift.z !== 0) && this.afloat && this.state === 'rest') { this.state = 'float'; this.afloat = false; }
  }

  // ---- meeting other things (src/collide.js) -------------------------------

  /** Whether it can meet another thing: flying, under the water, or afloat (not at rest on the bed or the deck). */
  get collides() { return this.state === 'air' || this.state === 'water' || this.state === 'float' || this.afloat; }

  /** Whether it is a floater on (or rising to, or bobbed clear of) the water; one thrown is not, until it has gone in. */
  get floater() { return this.floats && (this.state !== 'air' || this.hasFloated); }

  /** Its radius as a sphere (m): a ball's; a stone's mean semi-axis. */
  get collisionRadius() {
    if (this.sphere) return this.radius;
    const [long, middle, short] = this.shape.semiAxes;
    return this.radius * (long + middle + short) / 3;
  }

  /** Its mass as it meets another thing (kg): its own and the water its wetted part carries (FLOAT.addedMass). */
  collisionMass() {
    let wetted = 0;
    if (this.state === 'water') wetted = 1;
    else if (this.state === 'float' || this.afloat) wetted = this.waterline(this.position.y).share;
    return this.mass + FLOAT.addedMass * WATER_DENSITY * (this.mass / this.density) * wetted;
  }

  /** How much of the speed it meets another thing at it gives back: the middle of its bounce (src/things.js `ground`). */
  get collisionBounce() { return (this.thing.material.bounce[0] + this.thing.material.bounce[1]) / 2; }

  /**
   * Knocked by another thing (src/collide.js): its velocity changed by
   * (dvx, dvy, dvz) and it moved by (dx, dy, dz), under the water its path
   * (sinkStep's body) with it; at rest afloat it bobs again.
   */
  knock(dvx, dvy, dvz, dx, dy, dz) {
    this.velocity.x += dvx; this.velocity.y += dvy; this.velocity.z += dvz;
    this.position.x += dx; this.position.y += dy; this.position.z += dz;
    if (this.state === 'water') {
      const body = this.body;
      body.vx += dvx; body.vy += dvy; body.vz += dvz;
      body.x += dx; body.y += dy; body.z += dz;
    }
    if (this.afloat && this.state === 'rest') { this.state = 'float'; this.afloat = false; }
    this.syncMeshes(this.drawn.surface, this.drawn.bedDepth);   // drawn where it now is, on the water it was drawn on
  }

  /** dt seconds through the air (flyStep). */
  fly(dt) {
    if (this.thing.air.model === 'flutter') { this.flutter(dt); return; }
    flyStep(this.position, this.velocity, this.radius, this.mass, dt, this.thing.air.drag);
  }

  /**
   * dt seconds through the air for a soft, flat thing (FLUTTER, the header):
   * its face turned towards broadside to the air and pitching about it, its
   * spin on its face, the drag on the share of its face the air meets, and a
   * little glide off it.
   */
  flutter(dt) {
    const speed = this.velocity.length();
    const face = this.uprightAxis.clone().applyQuaternion(this.quaternion);
    if (speed > 1e-6) {
      const along = this.velocity.clone().divideScalar(speed);
      // Level, as its spin holds a disc (a frisbee's), its upright side up, pitching about the level line across its path.
      if (face.y < 0 && !this.thing.body.upright) face.negate();
      const across = along.clone().cross(UP);
      if (across.lengthSq() < 1e-9) across.set(1, 0, 0);
      across.normalize();
      const pitch = FLUTTER.pitch * Math.sin(2 * Math.PI * FLUTTER.rate * this.age + this.flutterPhase);
      const wanted = UP.clone().applyAxisAngle(across, pitch);
      const turn = face.clone().cross(wanted);
      const off = Math.asin(Math.min(turn.length(), 1));
      if (off > 1e-5) this.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(turn.normalize(), Math.min(off, FLUTTER.turning * dt)));
      const shown = FLUTTER.edgeOn + (1 - FLUTTER.edgeOn) * Math.abs(face.dot(along));
      flyStep(this.position, this.velocity, this.radius, this.mass, dt, this.thing.air.drag * shown);
      // The glide: the air on its tilted face pushes it across its path, as on a plate: −(n·v̂)·(n − (n·v̂)·v̂) (lifted while it comes down level).
      const meets = face.dot(along);
      const sideways = face.clone().addScaledVector(along, -meets);
      const drag = 0.5 * 1.2 * this.thing.air.drag * Math.PI * this.radius ** 2 * speed * speed / this.mass;
      this.velocity.addScaledVector(sideways, -meets * FLUTTER.glide * drag * dt);
    } else {
      flyStep(this.position, this.velocity, this.radius, this.mass, dt, this.thing.air.drag);
    }
    // It spins on its face (its tumble's axis its face's normal).
    this.spinAxis.copy(this.uprightAxis).applyQuaternion(this.quaternion);
  }

  /** Its flight, tried (aimThrow; flutterTrial), or null for a thing whose flight is plain (flyStep says it all). */
  trialFlight() {
    return this.thing.air.model === 'flutter' ? flutterTrial(this) : null;
  }

  /**
   * A soft thing's shape as it is drawn now (`body.soft`, src/things.js: a
   * pizza; src/main.js calls this once a frame): in the air its edges trail
   * the centre, cupped against the air by `soft.cup` of its radius per
   * (m/s)² (at most `soft.most`), and flap in a saddle by `soft.flap` at
   * `soft.rate` a second; on the water or the ground it lies flat again
   * (over about a tenth of a second). Its mesh is bent along its face's
   * normal by r² of each point's distance from its middle.
   */
  flex() {
    const soft = this.thing.body.soft;
    if (!soft) return;
    const positions = this.geometry.attributes.position;
    if (!this.restShape) { this.restShape = positions.array.slice(); this.restNormals = this.geometry.attributes.normal.array.slice(); }
    let cup = 0, flap = 0;
    if (this.state === 'air') {
      const face = this.shape.axes[2].clone().applyQuaternion(this.quaternion);
      const speed = this.velocity.length();
      const facing = speed > 1e-6 ? face.dot(this.velocity) / speed : 0;
      cup = -Math.min(soft.cup * speed * speed, soft.most) * facing;
      flap = soft.flap * Math.min(speed / 4, 1);
    }
    // Eased towards what it should be, so it relaxes rather than snaps.
    this.flexed = this.flexed ?? { cup: 0, flap: 0 };
    this.flexed.cup += (cup - this.flexed.cup) * 0.35;
    this.flexed.flap += (flap - this.flexed.flap) * 0.35;
    if (Math.abs(this.flexed.cup) < 1e-4 && Math.abs(this.flexed.flap) < 1e-4 && this.flexedDrawn === false) return;
    const rest = this.restShape, restNormals = this.restNormals, array = positions.array, normals = this.geometry.attributes.normal.array;
    const phase = 2 * Math.PI * soft.rate * this.age;
    const [axisX, axisY, axisZ] = this.shape.axes;   // its long, middle and short axes, in its own frame
    for (let index = 0; index < array.length; index += 3) {
      const x = rest[index], y = rest[index + 1], z = rest[index + 2];
      const u = x * axisX.x + y * axisX.y + z * axisX.z, v = x * axisY.x + y * axisY.y + z * axisY.z;
      const amount = this.flexed.cup + this.flexed.flap * Math.sin(phase + 2 * Math.atan2(v, u));
      const bend = amount * (u * u + v * v);
      array[index] = x + axisZ.x * bend; array[index + 1] = y + axisZ.y * bend; array[index + 2] = z + axisZ.z * bend;
      // Its smooth normal tilted by the bend's slope, 2·amount·(u, v), on whichever face it is.
      const nx = restNormals[index], ny = restNormals[index + 1], nz = restNormals[index + 2];
      const facing = nx * axisZ.x + ny * axisZ.y + nz * axisZ.z;
      const slopeU = 2 * amount * u * facing, slopeV = 2 * amount * v * facing;
      const tx = nx - slopeU * axisX.x - slopeV * axisY.x, ty = ny - slopeU * axisX.y - slopeV * axisY.y, tz = nz - slopeU * axisX.z - slopeV * axisY.z;
      const length = Math.hypot(tx, ty, tz) || 1;
      normals[index] = tx / length; normals[index + 1] = ty / length; normals[index + 2] = tz / length;
    }
    positions.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.flexedDrawn = Math.abs(this.flexed.cup) >= 1e-4 || Math.abs(this.flexed.flap) >= 1e-4;
  }

  /**
   * Into the water from where the stone is, at its velocity: its path under
   * water starts (sinkStep) and the impact the splash is built from is
   * returned. `dt` is the step it touched in, `surface` the water's height
   * there (under a gale; the header).
   */
  goIn(dt, surface = 0) {
    this.state = 'water';
    // From here on it moves on still water, as the splash does (the header).
    this.position.y -= surface;
    const speed = this.velocity.length();
    const lift = this.liftAt(this.velocity);
    if (this.skip) {
      // A skip stone stays in the vertical plane it was thrown in (the header): its lift's push across it is left out.
      const along = Math.hypot(this.velocity.x, this.velocity.z) || 1;
      const acrossX = -this.velocity.z / along, acrossZ = this.velocity.x / along;
      for (const push of [lift.shape, lift.spin]) {
        const sideways = push.x * acrossX + push.z * acrossZ;
        push.x -= sideways * acrossX;
        push.z -= sideways * acrossZ;
      }
    }
    // Its hole is open, and its head acts, until the pinch-off: PINCH_TIME·sqrt(R/g) until the splash says (setCavityTimes).
    this.impactStep = dt;
    Object.assign(this.body, {
      x: this.position.x, y: this.position.y, z: this.position.z, vx: this.velocity.x, vy: this.velocity.y, vz: this.velocity.z, time: 0,
      liftX: lift.shape.x, liftY: lift.shape.y, liftZ: lift.shape.z, spinLiftX: lift.spin.x, spinLiftY: lift.spin.y, spinLiftZ: lift.spin.z, resting: false,
      openUntil: PINCH_TIME * Math.sqrt(this.radius / GRAVITY) - dt,
    });
    return {
      x: this.position.x,
      z: this.position.z,
      height: this.position.y,   // of the centre, above the water
      speed,
      velocity: this.velocity.clone(),
      radius: this.radius,
      shape: this.shape,
      contact: this.contact(),
      spin: {
        rate: this.spinRate,
        axis: this.spinAxis.clone(),
        ratio: (this.spinRate * this.radius) / Math.max(speed, 1e-6),
        alongEntry: this.spinAxis.dot(this.velocity) / Math.max(speed, 1e-6),
        orientation: this.quaternion.clone(),
      },
      lift: { shape: lift.shape, spin: lift.spin },
      seed: this.splashSeed,
      density: this.density,
      underWater: this.body.water,   // its constants under water (src/cavity.js), which the cavity traces its path with
      rock: this,
    };
  }

  /**
   * A skip's touch, for the splash (src/splash.js skim): where the stone
   * touched and left (its centre over the water), its velocity in and out,
   * how long the contact lasted, the face's radius, the stone's mass, the
   * upward push the water gave it (N·s, gravity's share over the contact
   * included), the speed a ball of the face's radius would carry that push
   * at (pushSpeed: an entry's ring is fitted for a ball, src/splash.js RING)
   * and how many skips came before.
   */
  skimReport(contact) {
    const mass = this.trueMass;
    const face = this.faceRadius;
    const push = mass * (contact.exitVelocity.y - this.velocity.y + GRAVITY * contact.duration);
    return {
      skim: true,
      x: this.position.x, z: this.position.z, exitX: contact.exitPosition.x, exitZ: contact.exitPosition.z,
      velocity: this.velocity.clone(), exitVelocity: contact.exitVelocity.clone(), duration: contact.duration,
      radius: face, mass, push, pushSpeed: push / (STONE_DENSITY * (4 / 3) * Math.PI * face ** 3),
      skips: this.skip.skips, rock: this,
    };
  }

  // ---- floating (the header) ----------------------------------------------

  /**
   * Where the water meets it with its centre `height` (m) over the still
   * water, as it is turned now: the share of it under (`share`), how fast
   * that share grows as it sinks (`slope`, per metre: its waterplane's area
   * over its volume), and how far its lowest and highest points are from
   * its centre (`low`, `high`, m, along the vertical). A sphere's is a cap's;
   * anything else's its mesh's own (waterlineTable, along its upright axis,
   * which floating turns to the vertical: rightOnWater).
   */
  waterline(height) {
    const radius = this.radius;
    if (!this.waterlineTable) {
      const half = this.halfHeight();
      const depth = Math.min(Math.max((half - height) / half, 0), 2);
      return { share: capShare(depth), slope: (6 * depth - 3 * depth * depth) / (4 * half), low: -half, high: half, depth };
    }
    const { axis, low, high, shares } = this.waterlineTable;
    // Its axis up or down: a point at `along` on it is at height + sign·along·R.
    const sign = axis.clone().applyQuaternion(this.quaternion).y >= 0 ? 1 : -1;
    const lookup = (along) => {
      const position = THREE.MathUtils.clamp((along - low) / (high - low), 0, 1) * WATERLINE.levels;
      const index = Math.min(Math.floor(position), WATERLINE.levels - 1);
      const blend = position - index;
      return { share: shares[index] + (shares[index + 1] - shares[index]) * blend, slope: (shares[index + 1] - shares[index]) * WATERLINE.levels / (high - low) };
    };
    const below = -height / radius;   // the water's level along its axis, from its centre, in radii
    const found = sign > 0 ? lookup(below) : lookup(-below);
    const share = sign > 0 ? found.share : 1 - found.share;
    const inside = sign > 0 ? below > low && below < high : -below > low && -below < high;
    return { share, slope: inside ? found.slope / radius : 0, low: radius * (sign > 0 ? low : -high), high: radius * (sign > 0 ? high : -low) };
  }

  /** Its half-height (m): a ball's radius; anything else's ellipsoid's depth as it is turned. */
  halfHeight() { return this.ellipsoidDepth(); }

  /** The height of its centre over the still water when it floats at rest (m), turned as it is now (Archimedes, by bisection). */
  floatingHeight() {
    if (!this.waterlineTable) {
      const half = this.halfHeight();
      return half * (1 - floatingDepth(this.density / WATER_DENSITY));
    }
    const wanted = this.density / WATER_DENSITY;
    const { low, high } = this.waterline(0);
    let lowest = -high, highest = -low;   // centre heights from all under to all clear
    for (let iteration = 0; iteration < 40; iteration++) {
      const middle = 0.5 * (lowest + highest);
      if (this.waterline(middle).share > wanted) lowest = middle; else highest = middle;
    }
    return 0.5 * (lowest + highest);
  }

  /** From under the water (or back down from the air) to afloat: a ring if it broke the surface fast enough (`ripple`), else null. */
  startFloating(speed) {
    this.state = 'float';
    this.hasFloated = true;
    return Math.abs(speed) > FLOAT.ringFrom ? { ripple: true, x: this.position.x, z: this.position.z, radius: this.radius, speed: Math.abs(speed), rising: speed > 0, rock: this } : null;
  }

  /**
   * dt seconds afloat (the header): buoyed by the water over its submerged
   * part (waterline: a ball's cap, anything else's mesh), its inertia its
   * own and FLOAT.addedMass of that water's, the drag on its wetted part
   * and the waves it makes slowing it. Returns whether it is still in the
   * water (it may bob clear); it settles once still.
   */
  floatStep(dt) {
    const volume = this.mass / this.density;   // m³: a stone's nominal ball's, as its mass is
    const line = this.waterline(this.position.y);
    const share = line.share;
    const inertia = this.mass + FLOAT.addedMass * WATER_DENSITY * volume * share;
    const buoyancy = WATER_DENSITY * GRAVITY * volume * share;
    // Its bob's stiffness, the buoyancy's change with depth, and the damping that is FLOAT.damping of critical for it.
    const stiffness = WATER_DENSITY * GRAVITY * volume * line.slope;
    const damping = 2 * FLOAT.damping * Math.sqrt(Math.max(stiffness, 0) * inertia);
    const half = 0.5 * (line.high - line.low);
    // The waterplane (dV/dy) while it is in the water's surface; all its face once under.
    const waterplane = line.slope > 0 ? volume * line.slope : share > 0.5 ? volume / (2 * half) : 0;
    const resisting = (damping + 0.5 * WATER_DENSITY * FLOAT.drag * waterplane * Math.abs(this.velocity.y)) / inertia;
    this.velocity.y = (this.velocity.y + ((buoyancy - this.mass * GRAVITY) / inertia) * dt) / (1 + resisting * dt);
    // Along the water, towards the drift (a gale's), slowed by the drag on its wetted section and its waves.
    const relativeX = this.velocity.x - this.drift.x, relativeZ = this.velocity.z - this.drift.z;
    // Its wetted cross-section against its drift: a sphere's cap's; anything else's its share of its own.
    const section = this.waterlineTable ? share * volume / (2 * this.radius) : discSegment(half, line.depth * half);
    const slowing = 0.5 * WATER_DENSITY * FLOAT.drag * section * Math.hypot(relativeX, relativeZ) / inertia + FLOAT.slowing * Math.min(4 * share, 1);
    const kept = 1 / (1 + slowing * dt);
    this.velocity.x = this.drift.x + relativeX * kept;
    this.velocity.z = this.drift.z + relativeZ * kept;
    this.position.addScaledVector(this.velocity, dt);
    this.spinRate *= Math.exp(-SPIN_DECAY * dt);
    if (!this.sphere) this.rightOnWater(dt);
    if (this.position.y + this.waterline(this.position.y).low >= 0 && this.velocity.y > 0) return false;   // bobbed clear of the water
    const still = Math.abs(this.velocity.y) < FLOAT.settledSpeed && Math.hypot(this.velocity.x, this.velocity.z) < FLOAT.settledSpeed;
    if (still && this.drift.x === 0 && this.drift.z === 0 && Math.abs(this.position.y - this.floatingHeight()) < FLOAT.settledOffset) {
      this.position.y = this.floatingHeight();
      this.velocity.set(0, 0, 0);
      this.state = 'rest';
      this.afloat = true;
    }
    return true;
  }

  /**
   * A floater that is not round turns flat side down (the header): its
   * upright axis (its short axis, or its own +y if it is kept upright, a
   * pizza's toppings up) towards the vertical at up to FLOAT.righting, as the
   * water's push on its lower side rights it.
   */
  rightOnWater(dt) {
    const short = this.uprightAxis.clone().applyQuaternion(this.quaternion);
    // Either way up, unless it is kept upright (a pizza: its toppings up).
    if (short.y < 0 && !this.thing.body.upright) short.negate();
    const axis = short.clone().cross(UP);
    const off = Math.asin(Math.min(axis.length(), 1));
    if (off < 1e-4) return;
    this.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), Math.min(off, FLOAT.righting * dt)));
  }

  // ---- the ground (the header) --------------------------------------------

  /** Come to rest where it is, its lowest point at `height` (it tumbled or rolled to a stop on the ground). */
  restOn(height) {
    this.position.y = height - this.lowestOffset();
    this.velocity.set(0, 0, 0);
    this.state = 'rest';
    this.onGround = true;
    this.syncMeshes();
  }

  /** Down on the ground at `height` (the header): out of it, then a bounce off it, or it settles to tumble or roll along it. */
  meetGround(height, dt) {
    this.position.y = height + this.ellipsoidDepth();
    if (this.velocity.y >= -GROUND.settle) {
      this.state = 'ground';
      this.alongGround(dt);
      return;
    }
    const ground = this.thing.material;
    const fall = -this.velocity.y;
    const bounce = ground.bounce[0] + (ground.bounce[1] - ground.bounce[0]) * Math.random();
    this.velocity.y = bounce * fall;
    const along = Math.hypot(this.velocity.x, this.velocity.z);
    // The friction slows it along the ground, a ball no lower than rolling.
    const least = ground.roll ? ground.roll * along : 0;
    const kept = along > 1e-9 ? Math.max(along - ground.friction * (1 + bounce) * fall, least) / along : 0;
    const turn = ground.roll ? 0 : GROUND.scatter * (2 * Math.random() - 1);
    const velocityX = this.velocity.x * kept, velocityZ = this.velocity.z * kept;
    this.velocity.x = velocityX * Math.cos(turn) - velocityZ * Math.sin(turn);
    this.velocity.z = velocityX * Math.sin(turn) + velocityZ * Math.cos(turn);
    this.spinAlongGround();
  }

  /** Tumbling or rolling along the ground (the header); over its edge it falls again, and it rests once slower than GROUND.stopped. */
  alongGround(dt) {
    const height = this.groundAt?.(this.position.x, this.position.z) ?? null;
    if (height === null) { this.state = 'air'; return; }
    this.groundHeight = height;
    this.velocity.y = 0;
    this.position.y = height + this.ellipsoidDepth();
    const along = Math.hypot(this.velocity.x, this.velocity.z);
    const slowing = this.thing.material.roll ? this.thing.material.rolling : GROUND.tumbling;
    const slowed = Math.max(along - slowing * GRAVITY * dt, 0);
    if (slowed < GROUND.stopped) { this.restOn(height); return; }
    this.velocity.x *= slowed / along;
    this.velocity.z *= slowed / along;
    this.spinAlongGround();
  }

  /** Its spin about the level axis across its path: a ball's rolling, v/R; a stone's tumble, GROUND.tumble of that (at most GROUND.tumbleMost). */
  spinAlongGround() {
    const along = Math.hypot(this.velocity.x, this.velocity.z);
    if (along < 1e-6) return;
    this.spinAxis.set(this.velocity.z / along, 0, -this.velocity.x / along);
    this.spinRate = this.thing.material.roll ? along / this.radius : Math.min(GROUND.tumble * along / this.radius, GROUND.tumbleMost);
  }

  /**
   * Advance by dt seconds. Returns an impact description the first time the
   * stone goes into the water, a skip's touch (skimReport) each time a skip
   * stone skips off it, a ring's (`ripple`) when a floater breaks the
   * surface (the header), otherwise null. surfaceAt(x, z), under a gale, is
   * the water's height there (m); null for still water.
   */
  update(dt, pondDepth, surfaceAt = null) {
    let surface = 0;
    this.age += dt;
    this.previous.copy(this.position);
    let impact = null;
    // Down on the ground (the header), if it was over it the step before too (else it met the ground's side, src/pool.js).
    const groundBefore = this.state === 'air' && this.groundAt ? this.groundAt(this.position.x, this.position.z) : null;
    if (this.state === 'air') this.fly(dt);
    const groundNow = groundBefore !== null ? this.groundAt(this.position.x, this.position.z) : null;
    if (groundNow !== null && this.position.y - this.ellipsoidDepth() <= groundNow) {
      this.meetGround(groundNow, dt);
    } else if (this.state === 'air') {
      // Only near the water is the mesh worth walking for its lowest point.
      if (surfaceAt && this.position.y <= this.reach * this.radius + CREST_REACH) surface = surfaceAt(this.position.x, this.position.z);
      const touching = this.position.y - surface <= this.reach * this.radius && this.position.y + this.lowestOffset() <= surface;
      // A skip stone's contact is worked out at once: if it skips, the stone follows it (`skim`) and the touch is reported.
      // In a pool, a touch beyond a wall is the wall's (src/pool.js turns the stone back off it).
      const walled = this.skip?.inside && !this.skip.inside(this.position.x, this.position.z);
      const contact = touching && this.velocity.y < 0 && this.skip && !walled ? this.skim(surface) : null;
      if (contact?.skips) {
        this.state = 'skim';
        this.skip.contact = contact;
        impact = this.skimReport(contact);
      } else if (touching && this.velocity.y < 0 && !walled) {
        // A floater that bobbed clear comes back in quietly if slow (the header); anything else goes in as a throw does.
        if (this.hasFloated && -this.velocity.y < FLOAT.quietEntry) {
          this.position.y -= surface;
          impact = this.startFloating(this.velocity.y);
        } else {
          impact = this.goIn(dt, surface);
        }
      }
    } else if (this.state === 'skim') {
      // Along the contact's path, then off the water again.
      const contact = this.skip.contact;
      surface = contact.surface;
      contact.age += dt;
      if (contact.age < contact.duration) this.skimAt(contact, contact.age, this.position, this.velocity);
      else {
        // Off the water, flying on for what is left of the step.
        this.position.copy(contact.exitPosition);
        this.velocity.copy(contact.exitVelocity);
        this.state = 'air';
        this.skip.contact = null;
        this.afterSkip();
        this.fly(contact.age - contact.duration);
      }
    } else if (this.state === 'ground') {
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.alongGround(dt);
    } else if (this.state === 'water') {
      // Drag, the sideways lift and buoyancy-reduced gravity (src/cavity.js, whose stone path is the same).
      const body = this.body;
      sinkStep(body, this.radius, dt, pondDepth);
      // A floater never rests on the bed: its buoyancy lifts it off.
      if (this.floats && body.resting) body.resting = false;
      this.position.set(body.x, body.y, body.z);
      if (surfaceAt) surface = surfaceAt(body.x, body.z);
      this.velocity.set(body.vx, body.vy, body.vz);
      this.spinRate *= Math.exp(-SPIN_DECAY * dt);
      if (body.resting) this.state = 'rest';
      // Rising to the surface, its hole closed: afloat from here (the header).
      else if (this.floats && body.vy > 0 && body.time > (body.openUntil ?? 0) && this.position.y > this.floatingHeight() - FLOAT.handover * this.halfHeight()) {
        impact = this.startFloating(body.vy);
      }
    } else if (this.state === 'float') {
      if (!this.floatStep(dt)) this.state = 'air';
      if (surfaceAt) surface = surfaceAt(this.position.x, this.position.z);
    } else {
      this.restTime += dt;
      if (this.afloat && surfaceAt) surface = surfaceAt(this.position.x, this.position.z);
    }
    if (this.state !== 'rest') {
      const spin = new THREE.Quaternion().setFromAxisAngle(this.spinAxis, this.spinRate * dt);
      this.quaternion.premultiply(spin);
    }
    // In its cavity's air until the pinch-off, under water once the surface has closed.
    // A skip's touch opens no hole, nor does a floater's ripple: what dips under the water is seen through it.
    if (impact && !impact.skim && !impact.ripple) this.sinceImpact = 0;
    else if (this.sinceImpact >= 0) this.sinceImpact += dt;
    if (this.sinceImpact >= 0) {
      const timeUnit = Math.sqrt(this.radius / GRAVITY);
      const pinchTime = this.cavityTimes?.pinchTime ?? PINCH_TIME * timeUnit;
      const progress = THREE.MathUtils.clamp((this.sinceImpact - pinchTime) / (NECK_CLOSE * timeUnit), 0, 1);
      this.seenThroughWater.value = progress * progress * (3 - 2 * progress);
    } else if (this.skip) {
      this.seenThroughWater.value = this.state === 'skim' ? 1 : 0;
    }
    // The bed's depth (a number, or a function of x and z, as sinkStep takes it) only matters to a lifted stone.
    const bedDepth = surface === 0 || this.state === 'air' ? 1 : typeof pondDepth === 'function' ? pondDepth(this.position.x, this.position.z) : pondDepth;
    this.syncMeshes(surface, bedDepth);
    return impact;
  }

  dispose() {
    this.geometry.dispose();
    this.meshAbove.material.dispose();
    this.meshBelow.material.dispose();
    this.meshMirror?.material.dispose();
  }
}
