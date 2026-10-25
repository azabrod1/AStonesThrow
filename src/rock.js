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
// slowly, a few fast; a thing with its own `air.spin`, its own range). The
// moment its lowest point (of the tumbling mesh, not of a sphere) touches
// the surface it reports the impact (position, its
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
// A held thing (hold, moveHeld, release) follows the hand in world space,
// without integrating its old flight or sink. Release starts from rest in
// the air, afloat or submerged at its new position; a submerged release
// has no impact cavity. The hand keeps it clear of the bed and pool walls.
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
// A broad thing skipped (a pizza: `abilities.skips`) is thrown by its mass,
// as a stone heavier than SKIP_THROW.fullRadius's is (skipSpeed), spun no
// faster at its rim than such a stone, aimed by its trailing edge, which
// touches first (skipLowest), and flies the skip's arc held level by its
// spin, as its aim does, the air left out (the plate's lift would sail it up
// off the water, its drag bring it down short); it skims as a stone does, by
// its own mass and face, and goes in as a plate (below), its slap a touch.
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
// `air.drag` on the disc of its radius (flyStep); a flat thing (`air.model`
// 'flutter', a pizza) flies as a plate (PLATE, flutter): the air's push on
// its face and its spin turn it, as a rigid body, from how it was let go
// (its own draws), and its aim flies that same flight (flutterTrial, in
// PHYSICS_STEP). Under water each moves with its own density's constants
// (src/cavity.js underWater: the drag, head, lift and buoyancy over its
// inertia, the water it carries included), so a bowling ball sinks at half
// a stone's speed and a basketball stops within a radius or two.
//
// Floating. A thing lighter than water (pumice, a tennis ball, a light
// bowling ball, a basketball) rises once its hole has pinched off, and once
// its centre is within FLOAT.handover of its height under the still surface
// it floats (`float`, floatStep): buoyed by the water over its submerged
// part (`waterline`: a sphere's cap, as deep as it is under; anything
// else's own mesh, cut into columns once, buoyancyColumns, so a flat pizza
// floats as a slab does, by Archimedes, at whatever angle it lies, its
// toppings dry), carrying FLOAT.addedMass of that water,
// slowed by the drag on its wetted part and by the waves it makes (its bob
// damped at FLOAT.damping of critical, its drift at FLOAT.slowing). It
// comes up through the surface (a ring, `ripple`, if faster than
// FLOAT.ringFrom), may bob clear of it and fall back (in quietly, with a
// ring, if slower than FLOAT.quietEntry, else as any throw goes in), bobs a
// few times and comes to rest at the depth it floats at (`rest`, `afloat`),
// a basketball 4.3 cm under, a tennis ball 2.8 cm. One not round is a rigid
// body on the water (turnAfloat): the water's push at the middle of what it
// displaces and its weight at its own (its volume's middle, moved by its
// `body.ballast`: a duck's heavy base, which rights it) turn it, its rocking
// damped as its bob is, so a pizza on its edge falls flat and one upside
// down floats upside down; it rests only lying stably (stableAfloat). A
// shard of ice (src/ice.js's pieces of a hole) is a floater from the moment
// it is made: its mesh built to its own outline (`piece`, src/thingMeshes.js
// shard), set adrift under the water (adrift), it floats up as a plate does.
//
// Plates use one water model from first wetting through bobbing or sinking
// (plateWaterStep, turnAfloat). Its face is the disc of its own area
// (plateRadius: a TV's or a phone's, not the disc of half its length). Drag
// and added mass act across the face; along it there is skin drag and its
// rim's, edge-on (PLATE_WATER). As more of the face wets, its added mass
// takes normal momentum, giving the slap over the first few steps. Under the
// water the Munk moment turns a moving plate broadside, and gliding (moving
// along its face as well as across it) it is lifted as in the air (PLATE's
// `slope`), so a thin one let go a little tilted flutters down at about its
// broadside speed, as a falling plate does; at the surface, where it planes,
// the displaced volume's lever turns it level, and neither acts. One that
// sinks lies down on the bed along its slope (aground, bedPlane). The disc's
// added rotational inertia resists the turning; a pie's weight, a little low
// in it (`body.ballast`), turns it back right way up under the water. Both
// light and dense plates use this model, so there is no sphere cavity or
// orientation-independent underwater path for a plate.
//
// What the water does to it (soak, showWet): out of the water a thing is
// wet and dries (darker and glossier by its look's `wet`; slowly in the cold,
// damp air under snow, where a frozen thing does not thaw: setAir); bread soaks
// (`water.soaks`), heavier and limper by the minute, floating lower, its
// rim no longer keeping its top dry. A soft thing's give is a spring
// (bendStep: cupped by the air in flight, which steadies it, flung on
// striking the water or the deck). A ball stays round: a real one gives
// for a hundredth of a second when struck, less than a frame.
//
// Its own parts (registerMesh `dress`: a pizza's toppings, a pie's filling)
// are drawn as it is made, from a stream of their own seeded from its own,
// added to its copy of the shared mesh and their weight to its own
// (`dressing`); it floats by the shared mesh.
//
// Its own random stream (`random`): what a throw draws (its turn, its spin,
// its bounces, its splash's seed) comes from a stream of its own seeded
// once from Math.random, so what its looks draw never moves its physics;
// a stone, whose lumps are drawn between its throw's draws, draws from
// Math.random as it always did.
// Under a gale it rides the
// waves as it is drawn (syncMeshes' lift, as for a stone on the bed) and
// drifts downwind at FLOAT.drift (src/main.js sets `drift`), never resting.
// Afloat it is also in the water's mirror image (meshMirror: its part above
// the water, on the mirror's layer, its distance in alpha as the pool's
// walls write it, MIRROR_NEARNESS in src/shaders/scene.js).
//
// Meeting other things (src/collide.js): each is a sphere of
// collisionRadius, where it is drawn (`centre`: a floater riding the
// water, src/floaterRide.js), its mass its own and the water it carries
// (collisionMass), giving back collisionBounce of the speed it meets
// another at, turned by the friction where they touch (collisionInertia,
// spinBy); knock moves it, and under the water its path with it, and wakes
// it afloat.
//
// Ground. A thing can come down on ground rather than water. What ground
// there is, is its `ground` (src/main.js hands it to everything thrown), or
// null:
//   - at(x, z): the ground's height there, or null over open water: the
//     pool's deck (src/pool.js poolGround), short of the pool (a big stone
//     skipped slowly, a heavy ball thrown as far as it goes) or skipped out
//     over a wall; a frozen lake's ice (src/ice.js), everywhere but its holes;
//   - material (optional; or materialAt(x, z), where it differs from place
//     to place: a frozen lake's beach is no ice): the ground's own surface,
//     where it changes how a thing goes along it ({ kind, friction, rolling,
//     tumbling, tumble }, each optional): ice is slick, so a thing on it takes the lesser of its
//     own friction and rolling resistance and the ice's, a stone slows at the
//     ice's `tumbling`·g and turns end over end at its `tumble`, and its
//     knock is heard as on ice (src/sound.js);
//   - meet(rock, height) (optional): asked whenever the thing comes down on
//     the ground (at `height`) or onto the water (height null), before
//     anything else is done: the ice says whether it holds (`{ ground:
//     height }`: it lands on it, even over a hole too small for it), or
//     whether it goes into the water through a hole (`{ hole, broke }`:
//     broke, the ice gave way under it this step, or a hole was opened wide
//     enough for its splash; `keep`, the share of its speed the break left
//     it), or has no opinion (null: open water). src/ice.js says when ice
//     breaks; the thing then goes in as into open water (breakThrough), and
//     its impact says so (`throughIce`, src/splash.js: no crown stands on
//     ice), and keeps the hole it went in by (`iceHole`, src/ice.js contain).
// It lands only where it was over the ground the step before too: one
// coming from over the water meets the ground's side. On the ground it lands
// as the thing does on paving (meetGround, with its THINGS `material`): it
// bounces off at `bounce` of the speed it came down at, the friction taking
// `friction` times the push off the ground from its speed along it. A
// stone's lumps turn its path by up to GROUND.scatter and it tumbles end
// over end (its spin about the level axis across its path, at GROUND.tumble
// of its speed over its radius) until it comes down slower than
// GROUND.settle; then it tumbles along (`ground`, alongGround), its
// ellipsoid on it (ellipsoidDepth: the lumpy mesh would lift it off as it
// turns), slowing at GROUND.tumbling·g. A thing kept upright (a pizza, a
// pie, a duck) settles at rest onto a face it lies on (restOn: a ballasted
// one onto its base). A ball keeps at least `roll` of its speed along the
// ground (friction brings it to rolling, 5/7 for a solid ball, 3/5 for a
// shell) and spins as it rolls, and once down it rolls along, slowing at
// `rolling`·g. Either rests once slower than GROUND.stopped. Over the
// ground's edge, or down a step of more than GROUND.step (off the deck onto
// a frozen pool's ice), it falls again; up a step it cannot climb (a frozen
// pool's wall, from the ice) it is turned back off it, at its own bounce,
// along whichever axis of its move rose (the pool's walls are square).
import * as THREE from 'three';
import { SEEN_THROUGH_WATER, SEEN_UNDER_CLEAR, CLEAR_SIDES_INSIDE, FLOATER_WATER } from './shaders/scene.js';
import { PINCH_TIME, NECK_CLOSE, SPIN_DECAY, sinkStep, underWater } from './cavity.js';
import { THINGS, DEFAULT_THING, WATER_DENSITY, STONE_DENSITY } from './things.js';
import { meshKind, meshVolume, withParts } from './thingMeshes.js';

// The stone's geometry is src/thingMeshes.js's now; the probes take it from here as they always did.
export { createRockGeometry } from './thingMeshes.js';

const GRAVITY = 9.81;
// s: the step everything thrown moves by (src/main.js steps the world by it, whatever the frame rate, so a throw goes
// as it went whatever the device; the probes step by it too).
export const PHYSICS_STEP = 1 / 240;
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
  addedInertia: 0.5,          // a floater not round turns as if this much heavier for the water its submerged part carries...
  turnSlowing: 0.8,           // 1/s: ...its turning slowed at this rate wholly under (its share under of it afloat)...
  settledRocking: 0.02,       // rad/s: ...and rests only once it rocks slower than this (Rock.turnAfloat)...
  settledLever: 0.01,         // ...its weight and the water's push in line to within this share of its radius...
  stabilityTilt: 0.05,        // rad: ...and a tilt of this either way turned back (Rock.stableAfloat); else it is set rocking...
  toppling: 0.002,            // ...(turned on by more than this lever, in radii: a watermelon on its side is turned by neither way)...
  nudge: 0.05,                // rad/s: ...at this, towards the side it falls to
};
// Ground (the header: the pool's deck), besides each thing's own (src/things.js `ground`).
const GROUND = {
  scatter: 0.05,               // a stone's path is turned by up to this (radians) by the lump that strikes...
  settle: 0.4,                 // m/s: ...until it comes down slower than this; then it tumbles or rolls along...
  tumbling: 0.9,               // ...a stone slowing at this times g...
  stopped: 0.05,               // m/s: ...and either rests once slower than this
  tumble: 0.5,                 // a stone turns end over end at this times its speed over its radius (it skids as it tumbles)...
  tumbleMost: 60,              // ...at most this (rad/s)
  step: 0.01,                  // m: a rise or a drop in the ground under a thing going along it of more than this is a wall or an edge
  settleSeconds: 0.25,         // s: a thing kept upright settles onto the face it lies on over this (Rock.restOn)...
  rightsFrom: 0.1,             // ...onto its base if its `body.ballast` is this far down (radii: a duck's, not a pie's)
};
// A flat thing's flight (`air.model` 'flutter', src/things.js: a pizza; the header): a plate in the air, its attitude its
// own, turned by the air's push and its spin (R here its face's disc, Rock.plateRadius). The push on its face is ½ρv²·πR² times C_N(α) = `slope`·sin α·cos² α +
// C_90·sin³ α (α the angle the air meets the face at; C_90 its `air.drag`, broadside), along its face's normal, and its
// skin's drag `skin`·½ρ|v|·πR² along its face; the push acts `centre`·R·cos α ahead of its middle (a plate's quarter
// chord, moving to its middle broadside), which pitches its leading edge up, and its spin turns that into a roll (a
// gyroscope's precession), so how it is let go and how fast it spins say how it flies; cupped by the air (a soft thing,
// Rock.bendStep) it is steadier, the push nearer its middle by `cupSteadies` of how cupped it is. The air drags on its
// turning too (`turnDrag`·ρR⁵|ω|ω about a diameter, `spinDrag` about its face: ∫ of the drag on a disc turning, 8/15·C_90).
// It is let go flat, held as a pizza is, tilted off level by `tilt` (degrees, σ) any way and spinning on its face at
// `spin` (rad/s) either way: its throw's own draws (Rock `random`), which its aim flies too (Rock.trialFlight).
const PLATE = { slope: 2.7, skin: 0.03, centre: 0.5, cupSteadies: 0.7, turnDrag: 8 / 15, spinDrag: 0.05, tilt: 6, spin: [5, 12] };
// A soft thing's give (`body.soft`, Rock.bendStep): a spring of `soft.rate` Hz, damped at this share of critical in the
// air and this in the water; striking the water or the ground flat it is flung by `splat` of its speed into its face
// (over its radius, in radii a second).
// Soaked through it is limp: its spring `limp` slower.
const BEND = { damping: 0.25, wetDamping: 0.6, splat: 0.04, limp: 0.6 };
// A disc's added mass normal to its face (R its face's disc, plateRadius):
// (4/3)ρR³ at the free surface, (8/3)ρR³ submerged. Wetting ramps over
// `wetted` of its volume under water; this is a coarse waterline estimate,
// not a resolved free-surface solver. Along its face, besides its skin's
// drag, its rim meets the water edge-on: a bluff edge's drag `edge` on its
// rim's frontal area, 2·V/(π·R_face) (a pie's tin, 3.5 cm deep, about six
// times its skin's; a pizza's twice), so a plate slides along its face for a
// few of its radii, not metres. The flow's turning (the Munk moment,
// turnAfloat) and its lift gliding (plateWaterStep) are full only `munkDepth`
// of its radius under: at the surface it planes.
const PLATE_WATER = { slam: 4 / 3, wetted: 0.1, edge: 1.0, munkDepth: 1 };
// The water on it (Rock.soak): out of the water it dries over `drySeconds`; a soaking thing at rest afloat floats again
// to find its new height every `settleSeconds`, if it has sunk FLOAT.settledOffset since. A frozen thing (`water.thaws`)
// thaws `airThaw` as fast in air as in water (the water carries its heat to it some fifteen times faster).
// Soaking under the water, its constants there are made again once its density has moved by `densityStep` of itself.
const WET = { drySeconds: 90, settleSeconds: 0.5, airThaw: 1 / 15, densityStep: 0.01 };
// The air the things are out in (setAir; the Weather, src/main.js WEATHERS). Under snow it is freezing, so a frozen
// thing out of the water does not thaw (its share afloat in the water still does: the lake keeps a few degrees over
// freezing), and so near saturated that a wet thing dries `drying` as fast: evaporation goes as the shortfall of the
// air's vapour pressure from saturation's, at 0 °C and 90% humidity about a twentieth of 20 °C and 50%'s.
const AIR = { freezing: false, drying: 1 };

/** The air's state (above): `freezing` (no thaw out of the water) and `drying` (a share of a mild day's rate). */
export function setAir({ freezing = false, drying = 1 } = {}) {
  AIR.freezing = freezing;
  AIR.drying = drying;
}
const KNOCK_NOTHING = 1e-9;   // m: a knock that moves a thing less than this, without changing its speed, is nothing (Rock.knock)
const WHITE = new THREE.Color(1, 1, 1);
const AIR_DENSITY = 1.2;   // kg/m³ (flyStep's)
// A throw's aim (aimThrow): the flight times it tries (least, most, step; s), the passes against the air's drag (flown in
// PHYSICS_STEP, as the thing will fly), a flight of its own's passes (a plate's: at most coarsePasses of them coarse, AIM.step, until one comes down within
// coarseClose m), how near (m) a pass must come down for no more to be flown (a plate's flight,
// each pass hundreds of its steps, sooner) and the most (m)
// a pass may move the aim.
const AIM = { times: [0.3, 2.0, 0.01], passes: 6, flightPasses: 14, coarsePasses: 5, coarseClose: 0.03, step: 1 / 120, close: 0.003, flightClose: 0.01, farthestStep: 1.5 };
// A ball's shape and contact (the header).
const BALL_SHAPE = Object.freeze({
  volume: (4 / 3) * Math.PI, centroid: new THREE.Vector3(), axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  semiAxes: [1, 1, 1], elongation: 0, flatness: 0, irregularity: 0,
});
const BALL_CONTACT = Object.freeze({ kind: 'edge', faceAngle: 45, pointAngle: 45, bluntness: 1 });
const rockRotation = new THREE.Matrix4();
// Kept between steps so a floater's turn (Rock.turnAfloat) and a flat thing's flight (Rock.flutter) make nothing each step.
const scratch = {
  middle: new THREE.Vector3(), lever: new THREE.Vector3(), torque: new THREE.Vector3(), angular: new THREE.Vector3(),
  momentum: new THREE.Vector3(), gyroscopic: new THREE.Vector3(), turned: new THREE.Vector3(), step: new THREE.Quaternion(),
  axes: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], moments: [0, 0, 0],
  face: new THREE.Vector3(), along: new THREE.Vector3(), force: new THREE.Vector3(), pressure: new THREE.Vector3(),
  bed: new THREE.Vector3(),
};
const UP = new THREE.Vector3(0, 1, 0);
// A floater's columns (buoyancyColumns): this many across its widest, cut again on a grid turned by each of `turns`
// (radians) if they hold its mesh's volume worse than `held` of it.
const BUOYANCY = { columns: 20, held: 0.02, turns: [0.5, 0.7, 0.3] };
const RIDE_TILT = 0.36;   // the most a floater is tilted as it rides the water as drawn (rideTheWater): the slope's tangent, 20°

/** A standard normal draw (Box–Muller, from `random`). */
function gaussian(random = Math.random) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/** A seeded random stream (mulberry32): a throw's own (Rock `random`). */
function seededStream(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * dt seconds through the air for a thing of `radius` and `mass` at `position`
 * with `velocity` (both moved): gravity, and the air's drag, tiny for a
 * stone but keeping long throws honest, and slowing a light ball (src/main.js
 * aims a ball's throw with it).
 */
export function flyStep(position, velocity, radius, mass, dt, drag = 0.47) {
  const speed = velocity.length();
  const dragAcceleration = 0.5 * AIR_DENSITY * drag * Math.PI * radius ** 2 * speed / mass;
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
 * (a tennis ball, pumice): its flight is flown (flyStep, in the steps the
 * thing will fly, PHYSICS_STEP, to where it crosses the still water) and the aim moved
 * by its miss, up to AIM.passes times (and held to `fastest` after, a little
 * short). `flight`, if given, flies it as the thing itself flies (Rock
 * trialFlight: a pizza's flight as a plate, which no plain drag says), in
 * the thing's own steps (PHYSICS_STEP); else flyStep with its drag. Each
 * pass moves the aim by its miss through how the landing has followed the
 * aim so far (Broyden), and the best pass is kept. Returns the velocity, the flight time, the path every step (for the
 * aim's arc) and where it comes down.
 */
export function aimThrow(hand, target, flightTime, measured, flight = null) {
  // No faster than its own mass lets it go (a pie's filling, a pizza's toppings and all).
  const fastest = measured.thing.fastestFor(measured.mass);
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
  // Each pass is flown in the steps the thing will fly (PHYSICS_STEP): flown coarser it comes down elsewhere (a plate's
  // turning is not a ball's drag, and a ball's coarser steps fall ½·g·dt lower each second of its flight). A ball comes
  // down where its last step crosses the still water, not at the step's end: a hard throw's flat step is 5 cm along the
  // water. A plate (a flight of its own) keeps its step's end: its rim, not its centre, meets the water first, and its
  // aim was fitted so.
  const previous = new THREE.Vector3();
  const flyOut = (throwing, path = null, seconds = PHYSICS_STEP) => {
    position.copy(hand);
    moving.copy(throwing);
    flight?.reset(position, moving);
    for (let step = 0; step < 3 / seconds && (position.y > 0 || moving.y > 0); step++) {
      path?.push(position.clone());
      previous.copy(position);
      if (flight) flight.step(seconds, position, moving);
      else flyStep(position, moving, measured.radius, measured.mass, seconds, measured.thing.air.drag);
    }
    if (!flight && position.y < 0 && previous.y > 0) position.lerpVectors(previous, position, previous.y / (previous.y - position.y));
    path?.push(position.clone());
    return position;
  };
  // Each pass moves the aim by the miss through how the landing has been seen to follow the aim (Broyden's update of
  // that 2×2 map, from the identity: a ball's drag shifts its landing much as its aim, a plate's lift does not), and the
  // best pass is kept: a tumbling plate's landing need not follow its aim smoothly.
  let throwing = throwTo(aim, time);
  let map = [1, 0, 0, 1];   // d(landing)/d(aim), x and z
  let before = null, best = null;
  // A flight of its own is first flown coarsely (AIM.step) until it comes down near (AIM.coarseClose), then in its own
  // steps: the coarse passes cost half as much, and the fine ones start near.
  let coarse = Boolean(flight);
  for (let pass = 0; pass < (flight ? AIM.flightPasses : AIM.passes); pass++) {
    const landed = flyOut(throwing, null, coarse ? AIM.step : PHYSICS_STEP);
    const missX = goal.x - landed.x, missZ = goal.z - landed.z, miss = Math.hypot(missX, missZ);
    if (coarse && (miss < AIM.coarseClose || pass >= AIM.coarsePasses - 1)) { coarse = false; before = null; best = null; continue; }
    if (!coarse && (!best || miss < best.miss)) best = { miss, aimX: aim.x, aimZ: aim.z };
    if (!coarse && miss < (flight ? AIM.flightClose : AIM.close)) break;   // near enough: no more passes
    if (before) {
      const aimX = aim.x - before.aimX, aimZ = aim.z - before.aimZ, length = aimX * aimX + aimZ * aimZ;
      if (length > 1e-12) {
        const restX = landed.x - before.landedX - (map[0] * aimX + map[1] * aimZ), restZ = landed.z - before.landedZ - (map[2] * aimX + map[3] * aimZ);
        map = [map[0] + restX * aimX / length, map[1] + restX * aimZ / length, map[2] + restZ * aimX / length, map[3] + restZ * aimZ / length];
      }
    }
    before = { aimX: aim.x, aimZ: aim.z, landedX: landed.x, landedZ: landed.z };
    const determinant = map[0] * map[3] - map[1] * map[2];
    let stepX = missX, stepZ = missZ;
    if (Math.abs(determinant) > 0.05) { stepX = (map[3] * missX - map[1] * missZ) / determinant; stepZ = (map[0] * missZ - map[2] * missX) / determinant; }
    else map = [1, 0, 0, 1];
    const stepLength = Math.hypot(stepX, stepZ);
    if (stepLength > AIM.farthestStep) { stepX *= AIM.farthestStep / stepLength; stepZ *= AIM.farthestStep / stepLength; }
    aim.x += stepX;
    aim.z += stepZ;
    throwing = throwTo(aim, time);
  }
  aim.set(best.aimX, 0, best.aimZ);
  throwing = throwTo(aim, time);
  if (throwing.length() > fastest) throwing.setLength(fastest);
  const path = [];
  const landing = flyOut(throwing, path).clone();
  landing.y = 0;
  return { velocity: throwing, flightTime: time, path, landing };
}

/**
 * A fluttering thing's flight, tried before it is thrown (aimThrow, the aim's
 * arc): `thing`, its definition, `shape` (Rock's: one of its kind made
 * before has it), `radius`, `density` and `ownMass` (Rock's), and `release`,
 * how it is let go (Rock's: its turn, its spin's axis and rate, drawn as it
 * is made), so the trial is its flight; without one, flat, spinning at the
 * middle of PLATE.spin (the aim's arc before a throw, which has not drawn
 * its own yet). `reset(position, velocity)` lets it go there,
 * `step(dt, position, velocity)` moves the two given vectors as it moves.
 */
export function flutterTrial({ thing, shape, radius, density, ownMass, release = null }) {
  let trial = null;
  const turning = new THREE.Quaternion();
  return {
    reset(position, velocity) {
      trial = Object.assign(Object.create(Rock.prototype), {
        thing, shape, radius, density, ownMass, age: 0, state: 'air', soaked: 0, thawed: thing.water.thaws ? 0 : 1, bend: { cup: 0, cupRate: 0, flap: 0, flapRate: 0 },
        uprightAxis: thing.body.upright ? UP.clone() : shape.axes[2].clone(),
        // As it is let go (its own, from Rock's constructor), or flat, spinning at the middle of its spins (the aim's marker).
        quaternion: release?.quaternion.clone() ?? new THREE.Quaternion(),
        spinAxis: release?.spinAxis.clone() ?? shape.axes[2].clone(),
        spinRate: release?.spinRate ?? 0.5 * (PLATE.spin[0] + PLATE.spin[1]),
        position: position.clone(), velocity: velocity.clone(),
      });
    },
    step(dt, position, velocity) {
      trial.age += dt;
      trial.fly(dt);
      trial.bendStep(dt);
      trial.quaternion.premultiply(turning.setFromAxisAngle(trial.spinAxis, trial.spinRate * dt));
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
// the mass, which anything else skipped, a pizza, goes as, against a river
// stone's of `fullRadius`, spun no faster at its rim than such a stone); the
// hand let down to `handHeight` over the water (crouched,
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

/**
 * How far under its middle a broad thing skipped (not a stone, whose aim is
 * as it always was) reaches as it comes down, its face nose-up by `tilt`
 * (radians: its own, Rock.skipTilt, drawn before it is aimed): its trailing
 * edge, which touches first (src/main.js aims that at the touch).
 */
export function skipLowest(radius, tilt = THREE.MathUtils.degToRad(SKIP_TILT.mean)) { return radius * Math.sin(tilt); }

/** A skip throw's speed (m/s) at strength `power` for a stone of `radius` (SKIP_THROW), in the pool or the lake; for anything else, of its `mass` (kg). */
export function skipSpeed(power, radius, pooled = false, mass = null) {
  const heavier = mass === null ? radius / SKIP_THROW.fullRadius : Math.cbrt(mass / (STONE_DENSITY * (4 / 3) * Math.PI * SKIP_THROW.fullRadius ** 3));
  return (pooled ? SKIP_THROW.poolSpeed : SKIP_THROW.speed)[power] * Math.min(1, 1 / heavier);
}

// An ordinary throw's strength (src/main.js throwVelocity; the probes throw
// the same, throwFlightTime). A normal throw takes clamp(0.42 + 0.11·d, 0.5,
// 1.0) s to the tap d metres from the hand: the throw the splash was tuned
// on, and within a percent of the gentlest that reaches the tap (the least
// release speed, sqrt(g·(d − h)) from h above it). So no throw that reaches
// the tap goes in much slower: a soft one is a lob, `soft` times as long in
// the air, higher and steeper, at about the normal throw's speed (the page's
// soft Lob; its soft Toss is flatter, src/main.js ARC). A hard one
// is let go at `hardSpeed` (for a stone up to `fullRadius`; beyond it as
// fullRadius / R, as a skip's) on the lower of the two arcs that reach the
// tap at that speed: fast and flat, going in about twice as fast as a normal
// throw (a 6 cm stone at the reference tap: 12.4 m/s, 73° from vertical). It is never slower than `hardLeast` times the
// normal flight time, which a big stone, too heavy to throw that fast, keeps.
export const THROW_STRENGTH = { soft: 1.3, hardSpeed: 12, fullRadius: 0.04, hardLeast: 0.72 };

/**
 * The flight time (s) of a throw let go at `speed` from `hand` that comes
 * down at `target`, on the lower (flatter, shorter) of its two arcs, or null
 * if that speed cannot reach it. With u = T², the release speed squared is
 * D²/u + g·Δy + g²·u/4 (D the distance, Δy the target's height over the hand).
 */
export function lowArcTime(hand, target, speed) {
  const distanceSquared = hand.distanceToSquared(target);
  const sum = speed * speed - GRAVITY * (target.y - hand.y);
  const discriminant = sum * sum - GRAVITY * GRAVITY * distanceSquared;
  if (discriminant < 0) return null;
  return Math.sqrt((2 * (sum - Math.sqrt(discriminant))) / (GRAVITY * GRAVITY));
}

/** An ordinary throw's flight time (s) from `hand` to `target` at strength `power`, for a stone of `radius` (THROW_STRENGTH). */
export function throwFlightTime(hand, target, power, radius) {
  const normal = THREE.MathUtils.clamp(0.42 + 0.11 * hand.distanceTo(target), 0.5, 1.0);
  if (power === 'soft') return normal * THROW_STRENGTH.soft;
  if (power !== 'hard') return normal;
  const flat = lowArcTime(hand, target, THROW_STRENGTH.hardSpeed * Math.min(1, THROW_STRENGTH.fullRadius / radius));
  return Math.min(flat ?? Infinity, THROW_STRENGTH.hardLeast * normal);
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
 * A mesh floater's buoyancy (the header): its solid cut into columns along
 * `axis` (its short axis), `columns` across its widest (BUOYANCY.columns,
 * or its thing's own `water.columns`: a banana's 40), each the
 * stretch of the column inside the mesh (a column's crossings of the
 * surface, paired from the bottom up), with its share of the volume (the
 * shares made to add to 1, so the columns hold the mesh's own volume). The
 * water's level cuts each column, as it is turned, at any angle
 * (Rock.waterline): the part under it, and that part's middle, give the
 * water displaced and where its push acts, so a pizza on its edge floats
 * as a disc on its edge does and is turned flat by the push, not told to
 * be. Made once for a fixed mesh (prepareThing), as a stone of pumice is
 * thrown for one drawn at random; triangles find their columns from their
 * own corners, so a mesh of thousands takes a millisecond or two. A wall
 * thinner than a column's width lying along the grid's lines (a toy slide's
 * side panels) is hit by a whole row of columns or by none, so a cut that
 * holds the mesh's own volume worse than BUOYANCY.held is made again on the
 * grid turned by each of BUOYANCY.turns about the axis, which crosses such a
 * wall slantwise, and the truest cut kept (every other thing's first cut
 * holds it, so theirs is the grid it always was).
 */
export function buoyancyColumns(geometry, axis, columns = BUOYANCY.columns) {
  const volume = meshVolume(geometry);
  let best = null;
  for (const turn of [0, ...BUOYANCY.turns]) {
    const cut = columnsOf(geometry, axis, turn, columns);
    if (!best || Math.abs(cut.volume / volume - 1) < Math.abs(best.volume / volume - 1)) best = cut;
    if (Math.abs(best.volume / volume - 1) < BUOYANCY.held) break;
  }
  return best;
}

/** A mesh's columns (buoyancyColumns) along `axis`, `columns` across its widest, on a grid turned `turn` radians about it. */
function columnsOf(geometry, axis, turn, columns) {
  const positions = geometry.attributes.position.array;
  const along = axis.clone().normalize();
  const acrossU = new THREE.Vector3(1, 0, 0);
  if (Math.abs(acrossU.dot(along)) > 0.9) acrossU.set(0, 0, 1);
  acrossU.addScaledVector(along, -acrossU.dot(along)).normalize();
  if (turn !== 0) acrossU.applyAxisAngle(along, turn);
  const acrossV = new THREE.Vector3().crossVectors(along, acrossU);
  const count = positions.length / 3;
  const u = new Float64Array(count), v = new Float64Array(count), h = new Float64Array(count);
  let leastU = Infinity, mostU = -Infinity, leastV = Infinity, mostV = -Infinity;
  for (let vertex = 0; vertex < count; vertex++) {
    const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
    u[vertex] = x * acrossU.x + y * acrossU.y + z * acrossU.z;
    v[vertex] = x * acrossV.x + y * acrossV.y + z * acrossV.z;
    h[vertex] = x * along.x + y * along.y + z * along.z;
    leastU = Math.min(leastU, u[vertex]); mostU = Math.max(mostU, u[vertex]);
    leastV = Math.min(leastV, v[vertex]); mostV = Math.max(mostV, v[vertex]);
  }
  const cell = Math.max(mostU - leastU, mostV - leastV) / columns;
  // The columns' middles a little off the grid's round numbers, so none runs exactly through a mesh's corner or edge.
  const originU = leastU + cell * 0.5013, originV = leastV + cell * 0.4987;
  const across = Math.ceil((mostU - leastU) / cell) + 1, down = Math.ceil((mostV - leastV) / cell) + 1;
  const crossings = Array.from({ length: across * down }, () => []);
  for (let first = 0; first < count; first += 3) {
    const au = u[first], av = v[first], bu = u[first + 1], bv = v[first + 1], cu = u[first + 2], cv = v[first + 2];
    const area = (bu - au) * (cv - av) - (cu - au) * (bv - av);
    if (Math.abs(area) < 1e-14) continue;
    const fromColumn = Math.max(Math.ceil((Math.min(au, bu, cu) - originU) / cell), 0), toColumn = Math.min(Math.floor((Math.max(au, bu, cu) - originU) / cell), across - 1);
    const fromRow = Math.max(Math.ceil((Math.min(av, bv, cv) - originV) / cell), 0), toRow = Math.min(Math.floor((Math.max(av, bv, cv) - originV) / cell), down - 1);
    for (let column = fromColumn; column <= toColumn; column++) {
      const pointU = originU + column * cell;
      for (let row = fromRow; row <= toRow; row++) {
        const pointV = originV + row * cell;
        // Barycentric weights of the column's middle in the triangle's shadow.
        const weightB = ((pointU - au) * (cv - av) - (cu - au) * (pointV - av)) / area;
        const weightC = ((bu - au) * (pointV - av) - (pointU - au) * (bv - av)) / area;
        const weightA = 1 - weightB - weightC;
        if (weightA < 0 || weightB < 0 || weightC < 0) continue;
        crossings[column * down + row].push(weightA * h[first] + weightB * h[first + 1] + weightC * h[first + 2]);
      }
    }
  }
  const segments = [];
  for (let column = 0; column < across; column++) {
    for (let row = 0; row < down; row++) {
      const heights = crossings[column * down + row].sort((a, b) => a - b);
      for (let index = 0; index + 1 < heights.length; index += 2) {
        if (heights[index + 1] - heights[index] < 1e-9) continue;
        segments.push(originU + column * cell, originV + row * cell, heights[index], heights[index + 1]);
      }
    }
  }
  // In the mesh's own frame: each column's ends, and its share of the volume.
  const columnCount = segments.length / 4;
  const ends = new Float32Array(columnCount * 6), shares = new Float32Array(columnCount);
  let total = 0;
  for (let index = 0; index < columnCount; index++) total += segments[index * 4 + 3] - segments[index * 4 + 2];
  for (let index = 0; index < columnCount; index++) {
    const [pointU, pointV, low, high] = segments.slice(index * 4, index * 4 + 4);
    for (const [offset, height] of [[0, low], [3, high]]) {
      ends[index * 6 + offset] = acrossU.x * pointU + acrossV.x * pointV + along.x * height;
      ends[index * 6 + offset + 1] = acrossU.y * pointU + acrossV.y * pointV + along.y * height;
      ends[index * 6 + offset + 2] = acrossU.z * pointU + acrossV.z * pointV + along.z * height;
    }
    shares[index] = (high - low) / total;
  }
  // The columns' own middle: its weight acts there (Rock.turnAfloat), so a thing of one density wholly under is
  // turned by nothing, however the columns fall across it.
  const centroid = new THREE.Vector3();
  for (let index = 0; index < columnCount; index++) {
    centroid.x += shares[index] * 0.5 * (ends[index * 6] + ends[index * 6 + 3]);
    centroid.y += shares[index] * 0.5 * (ends[index * 6 + 1] + ends[index * 6 + 4]);
    centroid.z += shares[index] * 0.5 * (ends[index * 6 + 2] + ends[index * 6 + 5]);
  }
  // Each column as its middle and half its length (what Rock.waterline reads: half the products of its ends).
  const middles = new Float64Array(columnCount * 3), halves = new Float64Array(columnCount * 3);
  for (let index = 0; index < columnCount * 3; index++) {
    const column = Math.floor(index / 3), component = index % 3;
    middles[index] = 0.5 * (ends[column * 6 + component] + ends[column * 6 + 3 + component]);
    halves[index] = 0.5 * (ends[column * 6 + 3 + component] - ends[column * 6 + component]);
  }
  return { ends, middles, halves, shares: Float64Array.from(shares), count: columnCount, cell, axis: along, acrossU, acrossV, volume: total * cell * cell, centroid };
}

/**
 * The area (in nominal radii squared) a closed mesh of separate triangles
 * shows along `axis`: a plate's face, as the air and the water meet it
 * broadside (Rock.plateRadius). Each triangle's shadow along the axis, the
 * half of its cross product along it; the hull shows its face twice, from
 * either side.
 */
function faceArea(geometry, axis) {
  const positions = geometry.attributes.position.array;
  let doubled = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const ux = positions[index + 3] - ax, uy = positions[index + 4] - ay, uz = positions[index + 5] - az;
    const vx = positions[index + 6] - ax, vy = positions[index + 7] - ay, vz = positions[index + 8] - az;
    doubled += Math.abs(axis.x * (uy * vz - uz * vy) + axis.y * (uz * vx - ux * vz) + axis.z * (ux * vy - uy * vx));
  }
  return doubled / 4;
}

/** A plate's shape (stoneShape's, of its `geometry`) given its face as the disc of its area, in radii (`faceDisc`: Rock.plateRadius). */
function plateFace(shape, geometry) {
  shape.faceDisc = Math.sqrt(faceArea(geometry, shape.axes[2]) / Math.PI);
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

/**
 * The axis a floater's buoyancy is cut into columns along (buoyancyColumns):
 * its own `water.columnsAlong` if it says (src/things.js: a toy slide's,
 * slanted to all its faces, as it may float lying any way up), else its own
 * +y if it is kept upright (a pizza's, a duck's: the water's level then
 * crosses its columns as it floats, where their cut is truest), else its
 * short axis.
 */
function columnAxis(thing, shape) { return thing.water.columnsAlong ? new THREE.Vector3(...thing.water.columnsAlong).normalize() : thing.body.upright ? UP : shape.axes[2]; }

/** What prepareThing has made, for each definition (a thing defined again is a new definition). */
const PREPARED = new WeakMap();
/** How often prepareThing has built a fixed mesh and sliced a waterline (its buoyancy's columns): src/main.js's `budget`, which tools/quality-probe.mjs checks a throw leaves alone. */
export const PREPARATION_WORK = { meshes: 0, waterlines: 0 };

/**
 * A fixed mesh's thing (src/thingMeshes.js registerMesh `fixed`) made ready
 * to throw, once: its geometry, its shape (stoneShape), how far it reaches
 * (`reach`, its bounding sphere's; `farthest`, its farthest point's) and its
 * buoyancy's columns (buoyancyColumns, made the first time a size
 * of it floats, and kept), which every one thrown shares. Slicing a pizza's
 * mesh for its waterline took a throw over 30 ms; src/main.js prepares
 * every thing under the loading veil, and one defined later as it is
 * defined. Returns null for a mesh that is not fixed, whose kind fills what
 * it keeps between throws instead (registerMesh `prepare`: a ball's painted
 * spheres).
 */
export function prepareThing(thing) {
  const mesh = meshKind(thing.look.mesh);
  if (!mesh?.fixed) { mesh?.prepare?.(thing); return null; }
  if (!PREPARED.has(thing)) {
    // A fixed kind is built the same skipped or not (a stone's flat skip is drawn for each one thrown).
    const geometry = mesh.build(thing, {});
    PREPARATION_WORK.meshes++;
    geometry.computeBoundingSphere();
    const shape = thing.body.shape === 'sphere' ? BALL_SHAPE : stoneShape(geometry);
    let columns = null;
    const buoyancy = () => {
      if (!columns) { columns = buoyancyColumns(geometry, columnAxis(thing, shape), thing.water.columns); PREPARATION_WORK.waterlines++; }
      return columns;
    };
    // A floater's columns now, at its first size (another size may float where this one sinks: its columns are made as
    // it is first thrown, then kept).
    const { radius, mass } = thing.measure(thing.slider?.initial);
    const density = thing.body.density ?? mass / (shape.volume * radius ** 3);
    if (thing.body.shape !== 'sphere' && (density < WATER_DENSITY || thing.air.model === 'flutter')) buoyancy();
    // Its own parts (registerMesh `dress`) made once and let go: the first one thrown costs no more than the next.
    if (mesh.dress) { const parts = mesh.dress(thing, seededStream(1)); if (parts && !parts.shared) parts.geometry.dispose(); }
    if (thing.air.model === 'flutter' && thing.body.shape !== 'sphere') plateFace(shape, geometry);
    // How far its farthest point is from its middle, in radii, however it is turned (the hand holds it clear of the
    // water: src/main.js handPosition); `reach`, its bounding sphere's, is looser.
    const positions = geometry.attributes.position.array;
    let farthest = 0;
    for (let index = 0; index < positions.length; index += 3) farthest = Math.max(farthest, positions[index] ** 2 + positions[index + 1] ** 2 + positions[index + 2] ** 2);
    PREPARED.set(thing, { geometry, shape, reach: geometry.boundingSphere.center.length() + geometry.boundingSphere.radius, farthest: Math.sqrt(farthest), buoyancy });
  }
  return PREPARED.get(thing);
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
   * @param piece a shard's own outline (src/ice.js shards: its corners about its middle and its thickness, in radii), which its mesh is built to
   */
  constructor({ radius, position, velocity, envTexture, waterFog = null, thing = DEFAULT_THING, mass = null, mirrorLayer = null, skip = false, water = null, piece = null }) {
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
    // What ground there is besides the water ({ at, material, meet }; the header): the pool's deck, a frozen lake's ice
    // (given by src/main.js), or none.
    this.ground = null;
    this.iceHole = null;           // the hole in the ice it went into the water by (src/ice.js), which holds a floater in
    this.groundHeight = null;      // the ground's height under a thing tumbling or rolling along it (`ground`), once it has met it
    this.groundNormal = UP.clone();   // the normal of the plane it rests on (restOn: a sloping bed's)
    this.onGround = false;         // at rest on the ground (restOn)
    this.settling = null;          // settling onto the face it lies on, at rest on the ground (restOn, settleStep)
    this.fading = undefined;       // seconds into shrinking away, once src/main.js has begun it (fadeOut): frozen, it is no longer stepped
    this.drawn = { surface: 0, bedDepth: 1 };   // the water it was last drawn on (syncMeshes), for a knock's redraw
    this.age = 0;
    this.restTime = 0;
    const mesh = meshKind(this.thing.look.mesh);
    // What its throw draws at random (its turn, its spin, its splash's seed, its bounces): a stream of its own, seeded
    // from Math.random once, so what is drawn for its looks (Three.js's ids, a ball's paint) never moves its physics.
    // A stone's lumps are drawn between its throw's draws (registerMesh `sharedStream`): it draws from Math.random as it
    // always did, so a seeded stone is the same stone.
    this.random = mesh.sharedStream ? Math.random : seededStream(Math.floor(Math.random() * 4294967296));
    const random = this.random;
    this.quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6));
    this.spinAxis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    // Its tumble: a stone's, or its own (`air.spin`: a toy slide a metre long turns slower than a pebble).
    const [spinLeast, spinMost] = this.thing.air.spin ?? [SPIN_LEAST, SPIN_MOST];
    this.spinRate = spinLeast + (spinMost - spinLeast) * random() ** SPIN_SKEW;
    // A fixed mesh is prepared once for its definition and shared (prepareThing); a soft one's vertices flex, so it has
    // its own copy of them. Anything else (a stone's lumps, drawn at random) is built for each one thrown.
    const prepared = mesh.fixed ? prepareThing(this.thing) : null;
    // Its own parts (registerMesh `dress`: a pizza's toppings), drawn from a stream of their own seeded from its throw's,
    // added to its own copy of the shared mesh, their mass to its own.
    this.dressing = prepared && mesh.dress ? mesh.dress(this.thing, seededStream(Math.floor(random() * 4294967296))) : null;
    if (this.dressing && this.ownMass !== null) this.ownMass *= 1 + this.dressing.share;
    // (Its own copy, though a pie's parts are its filling's, kept: a mesh shared would stay on the GPU once drawn.)
    this.sharedGeometry = Boolean(prepared) && !this.thing.body.soft && !this.dressing;
    this.piece = piece;   // a shard's outline (src/ice.js), as it was broken
    this.geometry = prepared ? (this.sharedGeometry ? prepared.geometry : this.dressing ? withParts(prepared.geometry, this.dressing.geometry) : prepared.geometry.clone()) : mesh.build(this.thing, { flat: Boolean(skip), ...(piece ? { piece } : {}) });
    // Only what its parts are and weigh is kept: their triangles are its geometry's now.
    if (this.dressing) {
      if (!this.dressing.shared) this.dressing.geometry.dispose();
      this.dressing = { name: this.dressing.name, share: this.dressing.share };
    }
    if (!prepared) this.geometry.computeBoundingSphere();
    this.reach = prepared?.reach ?? this.geometry.boundingSphere.center.length() + this.geometry.boundingSphere.radius;   // furthest any point gets from the centre, in radii
    this.shape = this.sphere ? BALL_SHAPE : prepared?.shape ?? stoneShape(this.geometry);
    // Its density: its definition's, or its mass over its volume (a sphere's; a mesh's own, as a pizza's disc).
    const volume = this.sphere ? (4 / 3) * Math.PI * radius ** 3 : this.shape.volume * radius ** 3;
    this.density = this.thing.body.density ?? this.ownMass / volume;
    this.floats = this.density < WATER_DENSITY;
    // Which way is up for it: its own +y if it is kept upright (a pizza's toppings), else its short axis, either way.
    this.uprightAxis = this.thing.body.upright ? UP.clone() : this.shape.axes[2].clone();
    // A floater that is not a sphere floats by its mesh's own volume, at any angle (buoyancyColumns).
    this.buoyancy = (this.floats || this.thing.air.model === 'flutter') && !this.sphere ? (prepared ? prepared.buoyancy() : buoyancyColumns(this.geometry, columnAxis(this.thing, this.shape), this.thing.water.columns)) : null;
    // Where its weight acts afloat (turnAfloat, stableAfloat): its volume's middle, moved by its `body.ballast` (a duck's
    // heavy base), in its own frame and radii.
    this.massCentre = this.buoyancy ? this.buoyancy.centroid.clone().add(new THREE.Vector3().fromArray(this.thing.body.ballast ?? [0, 0, 0])) : null;
    this.liftHeading = random() * Math.PI * 2;   // the direction its lumps push it (the header)
    this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, time: 0, liftX: 0, liftY: 0, liftZ: 0, spinLiftX: 0, spinLiftY: 0, spinLiftZ: 0, resting: false, openUntil: undefined };
    // Non-plates use the cavity's path; plates integrate their own wet forces, on the disc of their face's area (plateRadius).
    this.plate = this.thing.air.model === 'flutter' && !this.sphere;
    if (this.plate && this.shape.faceDisc === undefined) plateFace(this.shape, this.geometry);
    this.carriedWater = 0;
    this.body.water = underWater(this.density, this.thing.water.restingHeight);
    this.impactStep = 0;
    const look = this.thing.look;
    const baseColor = mesh.color(this.thing);
    // The seed of its splash's own random stream (src/splash.js), drawn now so
    // that a seeded throw splashes alike however its flight is stepped.
    this.splashSeed = Math.floor(random() * 4294967296);
    // A fluttering thing is let go flat, held as a pizza is, a little tilted, spinning on its face (PLATE): its flight
    // is then known before it is thrown (flutterTrial: the aim). A soft one's give (bendStep), in radii and radii a second.
    if (this.thing.air.model === 'flutter') {
      const heading = random() * Math.PI * 2;
      const tilt = THREE.MathUtils.degToRad(PLATE.tilt * gaussian(random));
      this.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading)), tilt);
      const spin = PLATE.spin[0] + (PLATE.spin[1] - PLATE.spin[0]) * random();
      this.spinAxis.copy(this.shape.axes[2]).applyQuaternion(this.quaternion).multiplyScalar(random() < 0.5 ? -1 : 1);
      this.spinRate = spin;
    }
    this.bend = { cup: 0, cupRate: 0, flap: 0, flapRate: 0 };
    // A soft thing's rest shape, which flex bends what is drawn from; the physics reads the shared mesh's, without its
    // parts (physicsPositions).
    this.restShape = this.thing.body.soft ? this.geometry.attributes.position.array.slice() : null;
    this.physicsShape = prepared && this.geometry !== prepared.geometry ? prepared.geometry.attributes.position.array : null;
    // What the water has done to it (soak, showWet): how wet it is (1 out of the water, drying to 0) and how far soaked through.
    this.wet = 0;
    this.soaked = 0;
    this.thawed = this.thing.water.thaws ? 0 : 1;   // a frozen thing's share thawed (soak): it soaks and gives only as it thaws
    this.heard = [];   // its knocks on the ground since src/main.js last took them (src/sound.js)
    this.rideHeight = 0;           // the water's height under its middle as drawn (src/floaterRide.js reads it back), afloat
    this.centre = new THREE.Vector3();   // where things meet it (src/collide.js): where it is drawn, riding the water (syncMeshes)
    this.stepEnd = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };   // where it is drawn after its last step (syncMeshes)
    this.dry = { mass: this.mass, density: this.density };   // as thrown, before any soaking (the `mass` getter: a stone's is its density's)
    const glow = mesh.glow?.(this.thing) ?? null;      // a look's own light (a frozen pizza's frost)
    const map = mesh.texture?.(this.thing) ?? null;   // a textured look's (a pizza's top); its own program (src/main.js warmUp)
    const makeMaterial = (clipNormalY) => new THREE.MeshStandardMaterial({
      color: baseColor,
      ...(glow ? { emissive: glow } : {}),
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
   * floats it on still water), so it rises and falls with the water's
   * height at its middle and is turned, rigidly, to the water's slope across
   * its width, at most RIDE_TILT (src/shaders/scene.js FLOATER_WATER, read
   * with the water's own uniforms),
   * as far as it is at the water (`ride`, syncMeshes: wholly afloat; none in
   * the air clear of it, under it or on the ground, where it is drawn where
   * the physics has it, on its path and where it strikes),
   * and each part is cut where the water's surface really is, pixel by pixel,
   * in place of a level plane: the water laps along it, a pizza's crust and
   * all; inside its rim (`water.dry`: a pizza's crust) its top is never cut,
   * the rim holding the water out (src/waterSurface.js setDryDiscs hides the
   * water there). A soft thing drapes over the waves besides (`drape`, a
   * pizza's: showWet sets it): each of its points lifted by the water's height
   * under it, as a sheet lying on the water, rather than the whole turned
   * rigidly, by its drape's share (its normals the rigid tilt's: a sample
   * of the water's slope at each point would triple the work); anything
   * rigid has none, nor anything off the water. A clear thing (`look.seenThrough`: a
   * shard of ice) shows what lies under it through its top, by its mesh's
   * `clearShare`: the under-water pass at its pixel, dimmed by the water on
   * the way as the water's own surface dims it (WATER_FRAGMENT), less where
   * its face mirrors more, and none once it is clear of the water (in the
   * air, on the deck); and under the water, where ice bends light all but as
   * water does, it is drawn from above see-through, over what lies under it,
   * by its sides' inner faces (CLEAR_SIDES_INSIDE: seen down through its
   * top, the light in it turned back off them, a bright band along its far
   * edges as wide as it is thick seen aslant) and faintly by its top where a
   * ripple has washed over it (CLEAR_FILM_COVER), so that pass shows what
   * lies under it, the band and the film. Its
   * programs (above, below, in the mirror; a clear thing's above and below
   * its own) are every floater's alike, drawn under the loading veil
   * (src/main.js warmUp).
   */
  rideTheWater(water, { seenThroughWater, waterLevel, fogExtinction, fogColor }) {
    // Inside its rim, its share `water.dry` of its radius (src/things.js), the water never covers its top.
    const dryRadius = this.dryRadius = { value: (this.thing.water.dry ?? 0) * this.radius };
    const rideShare = this.rideShare = { value: 0 };
    const drapeShare = this.drapeShare = { value: this.drape };
    const seenThrough = Boolean(this.thing.look.seenThrough);
    // A clear thing's part under the water draws both its faces (its sides' inner ones, from above), see-through.
    if (seenThrough) Object.assign(this.meshBelow.material, { side: THREE.DoubleSide, transparent: true, depthWrite: false });
    this.ridesWater = true;   // src/main.js redraws its mirror image as the water moves under it
    const ride = (side) => (shader) => {
      Object.assign(shader.uniforms, water);
      shader.uniforms.uRide = rideShare;
      shader.uniforms.uWaterLevel = waterLevel;
      shader.uniforms.uSeenThroughWater = seenThroughWater;
      shader.uniforms.uFogExtinction = fogExtinction;
      shader.uniforms.uFogColor = fogColor;
      shader.uniforms.uDryRadius = dryRadius;
      shader.uniforms.uDrape = drapeShare;
      const clear = seenThrough && side === 'above', clearBelow = seenThrough && side === 'below';
      const declarations = `${FLOATER_WATER}\nuniform float uWaterLevel;\nuniform float uDryRadius;\nuniform float uRide;\nuniform float uDrape;\nvarying vec3 vRideWorld;\nvarying vec2 vRideMiddle;\n${clear ? 'varying float vClearShare;\n' : ''}${clearBelow ? 'varying float vRideUp;\n' : ''}`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${declarations}uniform float uSeenThroughWater;\n${side === 'below' ? SEEN_THROUGH_WATER : ''}${clear ? 'attribute float clearShare;\n' : ''}`)
        .replace('#include <project_vertex>', `
  vec4 ridden = modelMatrix * vec4(transformed, 1.0);
  vec3 middle = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // The water's slope across its whole width, its tilt at most RIDE_TILT: it is turned, as a body is, to lie on it
  // (shearing it by the slope, as this once did, made a ball an egg on a splash's steep ring).
  float across = length(modelMatrix[0].xyz);
  vec2 slope = vec2(
    floaterWaterHeight(middle.xz + vec2(across, 0.0)) - floaterWaterHeight(middle.xz - vec2(across, 0.0)),
    floaterWaterHeight(middle.xz + vec2(0.0, across)) - floaterWaterHeight(middle.xz - vec2(0.0, across))) / (2.0 * across) * uRide;
  slope *= min(1.0, ${RIDE_TILT.toFixed(4)} / max(length(slope), 1e-6));
  vec3 up = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 turnAxis = vec3(up.z, 0.0, -up.x);
  float turnSine = length(turnAxis);
  vec3 offset = ridden.xyz - middle;
  vec3 laid = ridden.xyz;   // where it is, as the physics has it (a soft thing drapes from there)
  if (turnSine > 1e-6) {
    turnAxis /= turnSine;
    offset = offset * up.y + cross(turnAxis, offset) * turnSine + turnAxis * dot(turnAxis, offset) * (1.0 - up.y);
    #ifndef FLAT_SHADED
      vec3 worldNormal = inverseTransformDirection(vNormal, viewMatrix);
      worldNormal = worldNormal * up.y + cross(turnAxis, worldNormal) * turnSine + turnAxis * dot(turnAxis, worldNormal) * (1.0 - up.y);
      vNormal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
    #endif
  }
  ridden.xyz = middle + offset;
  ridden.y += uRide * floaterWaterHeight(middle.xz);
  // A soft thing draped over the waves (the header): each point on the water's height under it, by its drape's share
  // (one more of the water's heights for each point; its normals keep the tilt over its whole width).
  if (uDrape * uRide > 0.0) ridden.xyz = mix(ridden.xyz, laid + vec3(0.0, uRide * floaterWaterHeight(laid.xz), 0.0), uDrape);
  vRideWorld = ridden.xyz;
  vRideMiddle = middle.xz;
  ${clear ? 'vClearShare = clearShare;' : ''}
  ${clearBelow ? 'vRideUp = inverseTransformDirection(vNormal, viewMatrix).y;' : ''}
  ${side === 'below' ? 'ridden.xyz = mix(ridden.xyz, seenThroughWater(ridden.xyz, uWaterLevel), uSeenThroughWater);' : ''}
  vec4 mvPosition = viewMatrix * ridden;
  gl_Position = projectionMatrix * mvPosition;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${declarations}uniform vec3 uFogExtinction;\nuniform vec3 uFogColor;\n${clear ? SEEN_UNDER_CLEAR : ''}${clearBelow ? CLEAR_SIDES_INSIDE : ''}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  ${side === 'below' ? '' : '// Inside its rim (a pizza\'s crust holds the water out) its top is never under it.\n  if (distance(vRideWorld.xz, vRideMiddle) >= uDryRadius)'}
  if (vRideWorld.y ${side === 'below' ? '>' : '<'} uWaterLevel + floaterWaterHeight(vRideWorld.xz)) discard;
  ${clearBelow ? '// A clear thing under the water, seen from above: its sides\' inner faces and its top under a film of water (the header).\n  if (cameraPosition.y > uWaterLevel && (abs(vRideUp) > 0.5 ? !gl_FrontFacing || vRideUp < 0.0 : gl_FrontFacing)) discard;' : ''}`)
        .replace('#include <opaque_fragment>', `${clear ? `vec2 onPiece = vRideWorld.xz - vRideMiddle;
  float pieceLooks = pieceWhite(onPiece, max(length(dFdx(onPiece)), length(dFdy(onPiece))));
  outgoingLight = totalSpecular + clearScatter(mix(diffuseColor.rgb, vec3(ICE_WHITE_ALBEDO), pieceLooks)) + seenUnderClear(vViewPosition, normal, vClearShare * (1.0 - pieceLooks), vRideWorld.y);` : ''}
  ${clearBelow ? 'float clearCover = 1.0;\n  if (cameraPosition.y > uWaterLevel) {\n    outgoingLight = abs(vRideUp) <= 0.5 ? clearSideInside(vRideWorld.y - uWaterLevel) : totalSpecular + clearFilm(diffuseColor.rgb);\n    clearCover = abs(vRideUp) <= 0.5 ? CLEAR_SIDE_COVER : CLEAR_FILM_COVER;\n  }' : ''}
  #include <opaque_fragment>
  ${clearBelow ? 'gl_FragColor.a = clearCover;' : ''}`)
        .replace('#include <fog_fragment>', `#include <fog_fragment>
  ${side === 'below' ? 'if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));' : ''}`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  ${side === 'mirror' ? `gl_FragColor.a = 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05);` : ''}`);
    };
    for (const [mesh, side] of [[this.meshAbove, 'above'], [this.meshBelow, 'below'], [this.meshMirror, 'mirror']]) {
      if (!mesh) continue;
      mesh.material.clippingPlanes = [];
      mesh.material.onBeforeCompile = ride(side);
      mesh.material.customProgramCacheKey = () => `ride-${side}${seenThrough && side !== 'mirror' ? '-clear' : ''}`;
    }
  }

  /**
   * Its mesh's corners as the physics has them: its shared mesh's (prepareThing), never a soft thing's give as drawn
   * (flex bends the geometry once a frame, and the physics would then depend on how often frames are drawn) nor its
   * own parts (a pizza's toppings, millimetres thin, which every step's walk over its corners would pay for).
   */
  get physicsPositions() { return this.physicsShape ?? this.restShape ?? this.geometry.attributes.position.array; }

  /** Its meshes: above the water, below it, and afloat in the mirror image. */
  get meshes() { return this.meshMirror ? [this.meshAbove, this.meshBelow, this.meshMirror] : [this.meshAbove, this.meshBelow]; }

  /** Its mass (kg): a ball's or a gem's own; a stone's the nominal ball's of its density (the air's drag's, as it always was). */
  get mass() { return this.thing.byDiameter ? this.density * (4 / 3) * Math.PI * this.radius ** 3 : this.ownMass; }

  /**
   * The radius (m) of the disc of a plate's face's area (faceArea): its
   * nominal radius is half its longest side, which for a TV or a phone
   * overstates its face by a third or more. The air and the water meet it as
   * this disc (PLATE, PLATE_WATER).
   */
  get plateRadius() { return this.radius * this.shape.faceDisc; }

  /** The water a plate's face slams (kg, PLATE_WATER: half a disc's added mass), which it carries as it bobs too. */
  get slamMass() { return PLATE_WATER.slam * WATER_DENSITY * this.plateRadius ** 3; }

  /** The stone's own mass (kg), from its volume (the skim's; `mass`, the nominal ball's, is the air drag's). */
  get trueMass() { return this.density * this.shape.volume * this.radius ** 3; }

  /** The radius (m) of the disc with the area of its face: the ellipsoid's two long semi-axes' mean (the header). */
  get faceRadius() { return this.radius * Math.sqrt(this.shape.semiAxes[0] * this.shape.semiAxes[1]); }

  /** A skip's tilt (radians, SKIP_TILT), drawn: as it is let go (a stone), or before it is aimed (a broad thing: skipLowest). */
  skipTilt() { return THREE.MathUtils.degToRad(THREE.MathUtils.clamp(SKIP_TILT.mean + SKIP_TILT.spread * gaussian(this.random), SKIP_TILT.least, SKIP_TILT.most)); }

  /**
   * Let a skip stone go at `velocity` (the header): its face tilted nose-up
   * along the throw by SKIP_TILT, never to either side, its long axis
   * anywhere in the face, spinning at SKIP_SPIN about its short axis.
   */
  launchSkip(velocity, tilt = this.skipTilt()) {
    this.velocity.copy(velocity);
    const heading = new THREE.Vector3(velocity.x, 0, velocity.z).normalize();
    const side = new THREE.Vector3(-heading.z, 0, heading.x);
    // The face's normal leans back against the throw (nose up), in the throw's vertical plane.
    const normal = new THREE.Vector3(0, Math.cos(tilt), 0).addScaledVector(heading, -Math.sin(tilt)).normalize();
    // The stone's frame (long, middle, short) onto the world's (a level-ish direction in the face, the one across, the normal).
    const [long, , shortAxis] = this.shape.axes;
    // A thing kept upright (a pizza) faces up with its top, whichever way its short axis came out.
    const short = this.thing.body.upright && shortAxis.dot(this.uprightAxis) < 0 ? shortAxis.clone().negate() : shortAxis;
    const middle = new THREE.Vector3().crossVectors(short, long).normalize();
    const turn = this.random() * Math.PI * 2;
    const inFace = new THREE.Vector3().crossVectors(normal, side).normalize().applyAxisAngle(normal, turn);
    const across = new THREE.Vector3().crossVectors(normal, inFace);
    const world = new THREE.Matrix4().makeBasis(inFace, across, normal);
    const local = new THREE.Matrix4().makeBasis(long, middle, short).transpose();
    this.quaternion.setFromRotationMatrix(world.multiply(local));
    this.skip.normal.copy(normal);
    this.spinAxis.copy(normal);
    // A broad thing (a pizza: anything but a stone, whose spin is as it always was) spun no faster at its rim than a
    // stone of SKIP_THROW.fullRadius (the header).
    const rimmed = this.thing.byDiameter ? 1 : Math.min(1, SKIP_THROW.fullRadius / this.faceRadius);
    this.spinRate = (SKIP_SPIN.least + (SKIP_SPIN.most - SKIP_SPIN.least) * this.random()) * rimmed;
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
    const angle = THREE.MathUtils.degToRad(SKIP_WOBBLE.degrees * gaussian(this.random)) * (SKIP_WOBBLE.reference / Math.max(this.spinRate, 1));
    const wobble = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.skip.normal.applyQuaternion(wobble);
    this.quaternion.premultiply(wobble);
    this.spinAxis.copy(this.skip.normal);
  }

  /** Height of the stone's lowest point below its centre (negative, metres), as it is turned now. */
  lowestOffset() { return this.lowestAlong(UP); }

  /** How far its lowest point lies below its centre along `up` (a unit vector: the level's, or a sloping bed's normal; negative, metres), as it is turned now (or by `quaternion`). */
  lowestAlong(up, quaternion = this.quaternion) {
    if (this.sphere) return -this.radius;
    const positions = this.physicsPositions;
    // A mesh point's height along `up` is the rotation's rows, weighted by `up`, dotted with it (along the level, the
    // second row: exactly the arithmetic it always was, so a seeded throw goes as it went).
    const rotation = rockRotation.makeRotationFromQuaternion(quaternion).elements;
    const rowX = rotation[0] * up.x + rotation[1] * up.y + rotation[2] * up.z;
    const rowY = rotation[4] * up.x + rotation[5] * up.y + rotation[6] * up.z;
    const rowZ = rotation[8] * up.x + rotation[9] * up.y + rotation[10] * up.z;
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
    const positions = this.physicsPositions;
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
    // Where it is drawn as things stand (drawAt draws a frame between two of these).
    this.stepEnd.position.copy(this.meshAbove.position);
    this.stepEnd.quaternion.copy(this.quaternion);
    // Cut at the water: by a plane at its height over it (a floater that rides the water cuts itself at its true surface, rideTheWater).
    if (this.meshAbove.material.clippingPlanes.length) this.meshAbove.material.clippingPlanes[0].constant = -surface;   // keeps y ≥ surface
    if (this.meshBelow.material.clippingPlanes.length) this.meshBelow.material.clippingPlanes[0].constant = surface;    // keeps y ≤ surface
    // At rest wholly under the water (on the bed) its part above the water draws nothing, and wholly out of it (on the
    // deck) its part below: hidden, a thing at rest costs one draw call, not two (src/main.js keeps tens of them).
    if (!this.floats) {
      const resting = this.state === 'rest', centre = this.position.y + lift, reach = this.reach * this.radius;
      this.meshAbove.visible = !(resting && centre + reach < surface);
      this.meshBelow.visible = !(resting && centre - reach > surface);
    }
    if (this.meshMirror) {
      if (this.meshMirror.material.clippingPlanes.length) this.meshMirror.material.clippingPlanes[0].constant = -surface;
      // Only what stands out of the water enough to show in it: a flat thing's image (a pizza's) would be a sliver, which
      // the mirror's ripples break into stray lines (FLOAT.mirrorLeast).
      const afloat = this.state === 'float' || this.afloat || this.state === 'held';
      this.meshMirror.visible = afloat && this.position.y + (this.buoyancy && this.extent ? this.extent.high : this.waterline(this.position.y).high) > FLOAT.mirrorLeast;
    }
    this.waterLevel.value = surface;
    // How far it rides the water as drawn (rideTheWater): wholly afloat; less as it stands clear of the still surface, out
    // of it or under it, none once clear by its half-height; none on the ground. Its float hands over in the surface, so
    // it never jumps.
    if (this.rideShare) {
      const half = this.halfHeight();
      const clear = Math.max(this.position.y - half, -this.position.y - half, 0);
      const afloat = (this.state === 'float' || (this.state === 'rest' && this.afloat)) && (!this.plate || clear === 0);
      this.rideShare.value = this.state === 'held' || this.state === 'ground' || this.state === 'skim' ? 0 : afloat ? 1 : Math.max(1 - clear / half, 0);
    }
    // Where it is drawn, riding the water as far as it does (src/floaterRide.js): where things meet it.
    this.centre.copy(this.meshAbove.position);
    if (this.rideShare) this.centre.y += this.rideHeight * this.rideShare.value;
  }

  /**
   * dt seconds of the water on it (the header): in the water (under it,
   * afloat) it is wet through, and out of it dries over WET.drySeconds (in
   * the snow's air, AIR.drying as fast). A frozen thing (`water.thaws`)
   * thaws over its `seconds` wholly under, its share under of that afloat
   * and WET.airThaw of it out of the water (none in freezing air). A
   * thing that soaks (src/things.js `water.soaks`: bread) takes up water as
   * it is wetted, its share under the water of it (the lower it floats, the
   * faster) and as far as it has thawed: soaked towards `takes` of its
   * volume of water over its `seconds`, heavier (it floats lower, and at rest
   * afloat finds its new height; waterlogged past water's density it sinks,
   * a plate slowly, broadside) and limper (bendStep).
   */
  soak(dt) {
    // On the bed (sunk, waterlogged) it is all under the water, as sinking; afloat its density's share of it (Archimedes).
    const onBed = this.state === 'rest' && !this.afloat && !this.onGround;
    const inWater = this.state === 'water' || this.state === 'float' || this.afloat || onBed;
    this.wet = inWater ? 1 : Math.max(this.wet - AIR.drying * dt / WET.drySeconds, 0);
    const under = this.state === 'water' || onBed ? 1 : inWater ? Math.min(this.density / WATER_DENSITY, 1) : 0;
    const thaws = this.thing.water.thaws;
    if (thaws && this.thawed < 1) this.thawed = Math.min(this.thawed + (under + (1 - under) * (AIR.freezing ? 0 : WET.airThaw)) * dt / thaws.seconds, 1);
    const soaks = this.thing.water.soaks;
    if (!soaks || !inWater || this.soaked >= 1 || this.thawed <= 0) return;
    this.soaked = Math.min(this.soaked + (1 - this.soaked) * under * this.thawed * dt / soaks.seconds, 1);
    const volume = this.dry.mass / this.dry.density;
    const mass = this.dry.mass + this.soaked * soaks.takes * WATER_DENSITY * volume;
    this.density = mass / volume;
    // A thing sized by its diameter has its density's mass (the `mass` getter); anything else keeps its own.
    if (!this.thing.byDiameter) this.ownMass = mass;
    // Under the water it sinks as it now weighs, its constants made again as its density moves by WET.densityStep.
    if (this.state === 'water' && Math.abs(this.density - this.body.water.density) > WET.densityStep * this.density) this.body.water = underWater(this.density, this.thing.water.restingHeight);
    // Soaked heavier than water, it sinks: from where it floats, its hole long closed.
    if (this.density >= WATER_DENSITY && this.floats) {
      this.floats = false;
      this.afloat = false;
      this.restTime = 0;   // its time at rest afloat is over: on the bed it is counted afresh
      this.state = this.plate ? 'float' : 'water';
      this.body.water = underWater(this.density, this.thing.water.restingHeight);
      Object.assign(this.body, { x: this.position.x, y: this.position.y, z: this.position.z, vx: this.velocity.x, vy: this.velocity.y, vz: this.velocity.z, resting: false, openUntil: -1 });
      return;
    }
    // At rest afloat, now and again: has it sunk to float lower? Then it floats on, settling again.
    if (this.afloat && this.state === 'rest' && (this.restTime % WET.settleSeconds) < dt && Math.abs(this.floatingHeight() - this.position.y) > FLOAT.settledOffset) {
      this.state = 'float';
      this.afloat = false;
    }
  }

  /**
   * How it looks wet (src/main.js calls this once a frame; the header): its
   * part out of the water darker and glossier by its look's `wet`, by how
   * wet or soaked it is; a frozen thing's frost (its tint and its glow)
   * gone as it thaws; the dry disc its rim keeps (`water.dry`) shrinking as
   * it soaks, none upside down; and how far a soft thing drapes over the
   * water's waves (`drape`, rideTheWater). Its materials' colours and
   * roughness are uniforms: no program changes.
   */
  showWet() {
    const wetLook = this.thing.look.wet, thaws = Boolean(this.thing.water.thaws);
    const wetness = Math.max(this.wet, this.soaked);
    if ((wetLook || thaws) && (wetness !== this.shownWet || this.thawed !== this.shownThawed)) {
      this.shownWet = wetness;
      this.shownThawed = this.thawed;
      const material = this.meshAbove.material;
      this.lookDry ??= { color: material.color.clone(), roughness: material.roughness, glow: material.emissive.clone() };
      for (const mesh of [this.meshAbove, this.meshMirror]) {
        if (!mesh) continue;
        mesh.material.color.copy(this.lookDry.color).lerp(WHITE, thaws ? this.thawed : 0).multiplyScalar(1 - (wetLook?.darker ?? 0) * wetness);
        mesh.material.roughness = this.lookDry.roughness * (1 - (wetLook?.glossier ?? 0) * wetness);
      }
      // Its frost goes from all of it as it thaws, its part under the water too (which is never drawn wetter).
      if (thaws) {
        this.meshBelow.material.color.copy(this.lookDry.color).lerp(WHITE, this.thawed);
        for (const mesh of this.meshes) mesh.material.emissive.copy(this.lookDry.glow).multiplyScalar(1 - this.thawed);
      }
    }
    if (this.dryRadius) this.dryRadius.value = this.dryDisc;
    if (this.drapeShare) this.drapeShare.value = this.drape;
  }

  /**
   * How far it drapes over the water's waves as drawn (rideTheWater): a soft
   * thing's `body.soft.drape`, all of it as it soaks through, as far as it
   * has thawed; nothing for anything rigid.
   */
  get drape() {
    const soft = this.thing.body.soft;
    if (!soft?.drape) return 0;
    return Math.min(soft.drape + (1 - soft.drape) * this.soaked, 1) * this.thawed;
  }

  /** The radius (m) inside its rim the water does not reach as it floats (`water.dry`): less as it soaks, none upside down or not afloat. */
  get dryDisc() {
    const dry = this.thing.water.dry;
    if (!dry || !(this.state === 'float' || this.afloat)) return 0;
    const up = scratch.face.copy(this.uprightAxis).applyQuaternion(this.quaternion).y;
    return up > 0.9 ? dry * this.radius * (1 - this.soaked) : 0;
  }

  /**
   * Drawn `share` (0 to 1) of the way from where its last step began to
   * where it ended (src/main.js steps the world in PHYSICS_STEP and draws
   * each frame between its steps): its meshes, as syncMeshes put them then.
   */
  drawAt(share) {
    const before = this.drawnBefore ?? this.stepEnd, after = this.stepEnd;
    for (const mesh of this.meshes) {
      mesh.position.lerpVectors(before.position, after.position, share);
      mesh.quaternion.slerpQuaternions(before.quaternion, after.quaternion, share);
    }
  }

  /** Pick up where it is drawn, including the waves' lift, without a jump. */
  hold() {
    if (this.state === 'held') return;
    this.position.copy(this.meshAbove.position);
    this.position.y += this.rideHeight * (this.rideShare?.value ?? 0);
    this.rideHeight = 0;
    this.quaternion.copy(this.meshAbove.quaternion);
    this.state = 'held';
    this.settling = null;
    this.carriedWater = 0;
    this.afloat = false;
    this.onGround = false;
    this.restTime = 0;
    this.velocity.set(0, 0, 0);
    this.spinRate = 0;
    if (this.skip) this.skip.contact = null;
    this.sinceImpact = -1;
    this.cavityTimes = null;
    this.seenThroughWater.value = 1;
    this.heldGlow = this.meshes.map((mesh) => mesh.material.emissive.clone());
    for (const mesh of this.meshes) mesh.material.emissive.addScalar(0.03);   // a little brighter (the ring under it says it is held)
    this.moveHeld(this.position, this.drawn.surface, this.drawn.bedDepth);
  }

  /** The hand's position, in world metres. No interpolation from the old flight. */
  moveHeld(position, surface = 0, bedDepth = 1) {
    this.position.copy(position);
    this.previous.copy(position);
    this.syncMeshes(surface, bedDepth);
    if (this.drawnBefore) {
      this.drawnBefore.position.copy(this.stepEnd.position);
      this.drawnBefore.quaternion.copy(this.stepEnd.quaternion);
    }
  }

  /** Let go from rest; sinking and buoyancy resume here, with no stale cavity. */
  release(surface = 0, bedDepth = 1) {
    if (this.state !== 'held') return;
    this.meshes.forEach((mesh, index) => mesh.material.emissive.copy(this.heldGlow[index]));
    this.heldGlow = null;
    this.velocity.set(0, 0, 0);
    this.restTime = 0;
    this.hasFloated = false;
    const ground = this.ground?.at(this.position.x, this.position.z) ?? null;
    if (ground !== null || this.position.y + this.lowestOffset() >= surface) {
      this.state = 'air';
      this.seenThroughWater.value = 0;
    } else {
      // Undo syncMeshes' stretched water column, keeping the drawn position
      // continuous even when a gale has raised or lowered the surface.
      this.position.y = this.position.y >= surface ? this.position.y - surface
        : (this.position.y - surface) / Math.max(1 + surface / bedDepth, 0.01);
      // Plates keep their directional water model even after soaking makes them sink.
      if (this.floats || this.plate) {
        this.state = 'float';
        this.hasFloated = true;
      } else {
        this.state = 'water';
        Object.assign(this.body, {
          x: this.position.x, y: this.position.y, z: this.position.z,
          vx: 0, vy: 0, vz: 0, time: 0, resting: false, openUntil: -1,
          liftX: 0, liftY: 0, liftZ: 0, spinLiftX: 0, spinLiftY: 0, spinLiftZ: 0,
        });
      }
      this.sinceImpact = Infinity;
      this.seenThroughWater.value = 1;
    }
    this.previous.copy(this.position);
    this.syncMeshes(surface, bedDepth);
    if (this.drawnBefore) {
      this.drawnBefore.position.copy(this.stepEnd.position);
      this.drawnBefore.quaternion.copy(this.stepEnd.quaternion);
    }
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

  /** Whether it can meet another thing: flying, skimming, under the water, or afloat (not at rest on the bed or the deck). */
  get collides() { return this.state === 'air' || this.state === 'skim' || this.state === 'water' || this.state === 'float' || this.afloat || this.grounded; }

  /** Whether it is on the ground (the header): going along it, or at rest on it (the deck, the ice), where things meet it as they meet a floater. */
  get grounded() { return this.state === 'ground' || (this.state === 'rest' && this.onGround); }

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

  /**
   * Its moment of inertia about its centre as it meets another thing
   * (kg·m², src/collide.js rub): a ball's, k·m·R² with k from how it rolls
   * (1/roll − 1: 2/5 solid, 2/3 a shell), anything else's a solid ball's of
   * its collision radius.
   */
  get collisionInertia() {
    const roll = this.thing.material.roll;
    return (roll ? 1 / roll - 1 : 0.4) * this.mass * this.collisionRadius ** 2;
  }

  /** Its spin changed by `change` (rad/s, the world's; src/collide.js rub): at rest afloat it wakes. */
  spinBy(change) {
    const angular = scratch.angular.copy(this.spinAxis).multiplyScalar(this.spinRate).add(change);
    this.spinRate = angular.length();
    if (this.spinRate > 1e-9) this.spinAxis.copy(angular).divideScalar(this.spinRate);
    if (this.afloat && this.state === 'rest') { this.state = 'float'; this.afloat = false; }
  }

  /** How much of the speed it meets another thing at it gives back: the middle of its bounce (src/things.js `ground`). */
  get collisionBounce() { return (this.thing.material.bounce[0] + this.thing.material.bounce[1]) / 2; }

  /**
   * Knocked by another thing (src/collide.js): its velocity changed by
   * (dvx, dvy, dvz) and it moved by (dx, dy, dz), under the water its path
   * (sinkStep's body) with it; at rest afloat it bobs again. A skip stone
   * knocked off its skim's path flies on from where it was knocked (its
   * touch counted as a skip): it meets the water again as it comes to it.
   */
  knock(dvx, dvy, dvz, dx, dy, dz) {
    // A knock of nothing leaves it as it is: a floater held in a hole or a pool is pushed back to its room (src/ice.js
    // contain, src/pool.js holdInPool), lands on it within rounding, and is then pushed back by that rounding, by
    // 1e-16 m, every step after; such a knock would otherwise wake it (below) so that it never rests.
    if (dvx === 0 && dvy === 0 && dvz === 0 && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < KNOCK_NOTHING) return;
    if (this.state === 'skim' && (dvx !== 0 || dvy !== 0 || dvz !== 0)) {
      this.state = 'air';
      this.skip.contact = null;
      this.skip.skips++;
    }
    this.velocity.x += dvx; this.velocity.y += dvy; this.velocity.z += dvz;
    // On the ground it is moved only along it: the ground holds it up.
    this.position.x += dx; this.position.y += this.grounded ? 0 : dy; this.position.z += dz;
    if (this.state === 'water') {
      const body = this.body;
      body.vx += dvx; body.vy += dvy; body.vz += dvz;
      body.x += dx; body.y += dy; body.z += dz;
    }
    if (this.afloat && this.state === 'rest') { this.state = 'float'; this.afloat = false; }
    // On the ground it goes along it again, or, knocked up off it, flies.
    if (this.grounded && (dvx !== 0 || dvy !== 0 || dvz !== 0)) {
      this.settling = null;
      this.onGround = false;
      if (this.velocity.y > GROUND.settle) this.state = 'air';
      else { this.state = 'ground'; this.velocity.y = 0; }
    }
    this.syncMeshes(this.drawn.surface, this.drawn.bedDepth);   // drawn where it now is, on the water it was drawn on
  }

  /** dt seconds through the air (flyStep). */
  fly(dt) {
    // Skipped, a plate flies the skip's arc, aimSkip's, held level by its spin (the header: the air left out, as the aim
    // leaves it; its lift would sail it up off the water and its drag bring it down short of the aim).
    if (this.plate && this.skip) {
      flyStep(this.position, this.velocity, this.radius, this.mass, dt, 0);
      return;
    }
    if (this.thing.air.model === 'flutter') { this.flutter(dt); return; }
    flyStep(this.position, this.velocity, this.radius, this.mass, dt, this.thing.air.drag);
  }

  /**
   * dt seconds through the air for a flat thing (PLATE, the header): a plate,
   * pushed along its face's normal by the air it meets and dragged along its
   * face, the push ahead of its middle turning it, its spin turning that turn
   * aside, as a rigid body (eulerTurn).
   */
  flutter(dt) {
    const radius = this.plateRadius, mass = this.mass, area = Math.PI * radius * radius;
    const velocity = this.velocity;
    const speed = velocity.length();
    const face = scratch.face.copy(this.shape.axes[2]).applyQuaternion(this.quaternion);
    const force = scratch.force.set(0, -GRAVITY * mass, 0);
    const torque = scratch.torque.set(0, 0, 0);
    if (speed > 1e-6) {
      const facing = face.dot(velocity) / speed;   // above 0: moving towards its face's side
      const sine = Math.min(Math.abs(facing), 1), cosine = Math.sqrt(1 - sine * sine);
      const dynamic = 0.5 * AIR_DENSITY * speed * speed * area;
      const push = dynamic * (PLATE.slope * sine * cosine * cosine + this.thing.air.drag * sine * sine * sine);
      const pushSign = facing > 0 ? -1 : 1;
      force.addScaledVector(face, pushSign * push);
      // Along its face: its skin's drag, and the way the push's point moves ahead of its middle.
      const along = scratch.along.copy(velocity).addScaledVector(face, -face.dot(velocity));
      const alongSpeed = along.length();
      force.addScaledVector(along, -0.5 * AIR_DENSITY * area * PLATE.skin * speed);
      if (alongSpeed > 1e-9) {
        const cupped = this.thing.body.soft ? Math.min(Math.abs(this.bend.cup) / this.thing.body.soft.most, 1) : 0;
        const ahead = PLATE.centre * radius * cosine * (1 - PLATE.cupSteadies * cupped);
        const point = scratch.pressure.copy(along).multiplyScalar(ahead / alongSpeed);
        torque.add(scratch.lever.copy(point).cross(scratch.middle.copy(face).multiplyScalar(pushSign * push)));
      }
    }
    // The air's drag on its turning: about a diameter, and about its face.
    const angular = scratch.angular.copy(this.spinAxis).multiplyScalar(this.spinRate);
    const aboutFace = angular.dot(face);
    const across = scratch.middle.copy(angular).addScaledVector(face, -aboutFace);
    const turnDrag = AIR_DENSITY * radius ** 5 * this.thing.air.drag;
    torque.addScaledVector(across, -PLATE.turnDrag * turnDrag * across.length());
    torque.addScaledVector(face, -PLATE.spinDrag * turnDrag * Math.abs(aboutFace) * aboutFace);
    velocity.addScaledVector(force, dt / mass);
    this.position.addScaledVector(velocity, dt);
    const turned = this.eulerTurn(angular, torque, dt);
    const rate = turned.length();
    this.spinRate = rate;
    if (rate > 1e-9) this.spinAxis.copy(turned).divideScalar(rate);
  }

  /**
   * Its principal moments of inertia (kg·m²: its shape's, an ellipsoid of the
   * same second moments, `carried` times them for the water it carries) and
   * its principal axes as it is turned now (into scratch.axes).
   */
  principal(carried = 1) {
    const [long, middle, short] = this.shape.semiAxes;
    const scale = this.mass * this.radius * this.radius * carried / 5;
    const moments = scratch.moments;
    moments[0] = (middle * middle + short * short) * scale;
    moments[1] = (long * long + short * short) * scale;
    moments[2] = (long * long + middle * middle) * scale;
    if (this.plate && this.state === 'float') {
      const added = (16 / 45) * WATER_DENSITY * this.plateRadius ** 5 * Math.min(this.carriedWater / (2 * this.slamMass), 1);
      moments[0] += added; moments[1] += added;
    }
    for (let index = 0; index < 3; index++) scratch.axes[index].copy(this.shape.axes[index]).applyQuaternion(this.quaternion);
    return { moments, axes: scratch.axes };
  }

  /**
   * Its angular velocity `angular` (rad/s, the world's) after dt seconds
   * under `torque` (N·m), as a rigid body: Euler's equations in its
   * principal frame, I·dω/dt = τ − ω × (I·ω) (principal). Into scratch.turned.
   */
  eulerTurn(angular, torque, dt, carried = 1) {
    const { moments, axes } = this.principal(carried);
    const momentum = scratch.momentum.set(0, 0, 0);
    for (let index = 0; index < 3; index++) momentum.addScaledVector(axes[index], moments[index] * angular.dot(axes[index]));
    const gyroscopic = scratch.gyroscopic.crossVectors(angular, momentum);
    const turned = scratch.turned.set(0, 0, 0);
    for (let index = 0; index < 3; index++) {
      turned.addScaledVector(axes[index], angular.dot(axes[index]) + ((torque.dot(axes[index]) - gyroscopic.dot(axes[index])) / moments[index]) * dt);
    }
    return turned;
  }

  /**
   * dt seconds of a soft thing's give (`body.soft`, src/things.js: a
   * pizza; the header): its edges are a spring of `soft.rate` Hz about its
   * middle (BEND), so they lag and swing back rather than follow at once.
   * In the air the air's push cups it, `soft.cup` of its radius per (m/s)²
   * against the share of its face the air meets (at most `soft.most`), and
   * flaps it in a saddle by `soft.flap`; on the water or the ground it is
   * let lie flat, and swings there (more damped in the water). Its cup
   * steadies its flight (flutter). Flex draws it so.
   */
  bendStep(dt) {
    const soft = this.thing.body.soft;
    if (!soft) return;
    const bend = this.bend;
    let cup = 0, flap = 0;
    if (this.state === 'air') {
      const face = scratch.face.copy(this.shape.axes[2]).applyQuaternion(this.quaternion);
      const speed = this.velocity.length();
      const facing = speed > 1e-6 ? face.dot(this.velocity) / speed : 0;
      cup = -Math.min(soft.cup * speed * speed, soft.most) * facing * this.thawed;
      flap = soft.flap * Math.min(speed / 4, 1) * this.thawed;
    }
    const frequency = 2 * Math.PI * soft.rate * (1 - BEND.limp * this.soaked);
    const damping = this.state === 'air' ? BEND.damping : BEND.wetDamping;
    bend.cupRate += (frequency * frequency * (cup - bend.cup) - 2 * damping * frequency * bend.cupRate) * dt;
    bend.flapRate += (frequency * frequency * (flap - bend.flap) - 2 * damping * frequency * bend.flapRate) * dt;
    bend.cup = THREE.MathUtils.clamp(bend.cup + bend.cupRate * dt, -soft.most, soft.most);
    bend.flap = THREE.MathUtils.clamp(bend.flap + bend.flapRate * dt, -soft.most, soft.most);
  }

  /** Struck flat on the water or the ground at `velocity` (BEND.splat): its edges flung on past its middle, which is stopped. */
  splat(velocity) {
    if (!this.thing.body.soft) return;
    const face = scratch.face.copy(this.shape.axes[2]).applyQuaternion(this.quaternion);
    this.bend.cupRate += BEND.splat * face.dot(velocity) / this.radius * this.thawed;
  }

  /** Its flight, tried (aimThrow; flutterTrial), or null for a thing whose flight is plain (flyStep says it all). */
  trialFlight() {
    return this.thing.air.model === 'flutter' ? flutterTrial({ thing: this.thing, shape: this.shape, radius: this.radius, density: this.density, ownMass: this.ownMass, release: { quaternion: this.quaternion, spinAxis: this.spinAxis, spinRate: this.spinRate } }) : null;
  }

  /**
   * A soft thing's shape as it is drawn now (`body.soft`, src/things.js: a
   * pizza; src/main.js calls this once a frame): its give as bendStep has
   * it, its mesh bent along its face's normal by r² of each point's distance
   * from its middle, the cup and, in a saddle, the flap (turning at
   * `soft.rate` a second).
   */
  flex() {
    const soft = this.thing.body.soft;
    if (!soft) return;
    const positions = this.geometry.attributes.position;
    if (!this.restNormals) this.restNormals = this.geometry.attributes.normal.array.slice();
    const { cup, flap } = this.bend;
    if (Math.abs(cup) < 1e-4 && Math.abs(flap) < 1e-4 && this.flexedDrawn === false) return;
    const rest = this.restShape, restNormals = this.restNormals, array = positions.array, normals = this.geometry.attributes.normal.array;
    const phase = 2 * Math.PI * soft.rate * this.age;
    const [axisX, axisY, axisZ] = this.shape.axes;   // its long, middle and short axes, in its own frame
    for (let index = 0; index < array.length; index += 3) {
      const x = rest[index], y = rest[index + 1], z = rest[index + 2];
      const u = x * axisX.x + y * axisX.y + z * axisX.z, v = x * axisY.x + y * axisY.y + z * axisY.z;
      const amount = cup + flap * Math.sin(phase + 2 * Math.atan2(v, u));
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
    this.flexedDrawn = Math.abs(cup) >= 1e-4 || Math.abs(flap) >= 1e-4;
  }

  /**
   * Into the water from where the stone is, at its velocity: its path under
   * water starts (sinkStep) and the impact the splash is built from is
   * returned. `dt` is the step it touched in, `surface` the water's height
   * there (under a gale; the header).
   */
  goIn(dt, surface = 0) {
    this.state = 'water';
    this.splat(this.velocity);
    // From here on it moves on still water, as the splash does (the header).
    this.position.y -= surface;
    const speed = this.velocity.length();
    const impactVelocity = this.velocity.clone();
    // Plates keep one direction-aware water model from first contact to the bed.
    // Report the contact as spray/rings, without tracing a sphere's cavity from
    // a speed the wetting face will immediately change.
    if (this.plate) {
      this.state = 'float';
      this.hasFloated = true;
      this.carriedWater = 0;
      const face = this.shape.axes[2].clone().applyQuaternion(this.quaternion);
      const push = Math.abs(face.dot(impactVelocity)) * this.mass * this.slamMass / (this.mass + this.slamMass);
      const faceRadius = this.faceRadius;
      return {
        skim: true, slap: true, x: this.position.x, z: this.position.z, exitX: this.position.x, exitZ: this.position.z,
        velocity: impactVelocity, exitVelocity: this.velocity.clone(), duration: 0, radius: faceRadius, mass: this.mass, push,
        pushSpeed: push / (STONE_DENSITY * (4 / 3) * Math.PI * faceRadius ** 3), skips: 0, rock: this,
      };
    }
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
    const impact = {
      x: this.position.x,
      z: this.position.z,
      height: this.position.y,   // of the centre, above the water
      speed,
      velocity: impactVelocity,
      radius: this.radius,
      shape: this.shape,
      contact: this.contact(),
      spin: {
        rate: this.spinRate,
        axis: this.spinAxis.clone(),
        ratio: (this.spinRate * this.radius) / Math.max(speed, 1e-6),
        alongEntry: this.spinAxis.dot(impactVelocity) / Math.max(speed, 1e-6),
        orientation: this.quaternion.clone(),
      },
      lift: { shape: lift.shape, spin: lift.spin },
      seed: this.splashSeed,
      density: this.density,
      underWater: this.body.water,   // its constants under water (src/cavity.js), which the cavity traces its path with
      rock: this,
    };
    return impact;
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
   * anything else's its mesh's own, at whatever angle it lies
   * (buoyancyColumns): also the middle of the water it displaces
   * (`centre`, in its own frame, in radii: where the water's push acts) and,
   * with `plane`, its waterplane's area and moments about its origin
   * (`plane`: area, x, z, xx, zz, xz, in metres, the world's level axes),
   * which the water's damping of its rocking is reckoned from (floatStep).
   */
  waterline(height, { plane = false } = {}) {
    const radius = this.radius;
    if (!this.buoyancy) {
      const half = this.halfHeight();
      const depth = Math.min(Math.max((half - height) / half, 0), 2);
      return { share: capShare(depth), slope: (6 * depth - 3 * depth * depth) / (4 * half), low: -half, high: half, depth };
    }
    const { middles, halves, shares, count, cell, acrossU, acrossV } = this.buoyancy;
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    // A column is cell wide: seen along the vertical it spans this much more than its ends do.
    const spread = 0.5 * cell * (Math.abs(rowX * acrossU.x + rowY * acrossU.y + rowZ * acrossU.z) + Math.abs(rowX * acrossV.x + rowY * acrossV.y + rowZ * acrossV.z));
    const level = -height / radius;   // the water's height over its centre, in radii
    const volume = this.mass / this.density;
    let share = 0, slope = 0, low = Infinity, high = -Infinity, centreX = 0, centreY = 0, centreZ = 0;
    let area = 0, firstX = 0, firstZ = 0, secondXX = 0, secondZZ = 0, secondXZ = 0;
    for (let index = 0; index < count; index++) {
      const at = index * 3;
      const middleX = middles[at], middleY = middles[at + 1], middleZ = middles[at + 2];
      let halfX = halves[at], halfY = halves[at + 1], halfZ = halves[at + 2];
      let rise = rowX * halfX + rowY * halfY + rowZ * halfZ;
      // Its half pointing up, so its lower end is middle − half.
      if (rise < 0) { rise = -rise; halfX = -halfX; halfY = -halfY; halfZ = -halfZ; }
      const middleHeight = rowX * middleX + rowY * middleY + rowZ * middleZ;
      const bottom = middleHeight - rise - spread, top = middleHeight + rise + spread;
      if (bottom < low) low = bottom;
      if (top > high) high = top;
      if (level <= bottom) continue;
      const wet = level >= top ? 1 : (level - bottom) / (top - bottom);
      const weight = shares[index] * wet;
      share += weight;
      // The wet part's middle: half of it up from its lower end, middle − half + wet·half·2·½.
      const along = wet - 1;
      centreX += weight * (middleX + along * halfX);
      centreY += weight * (middleY + along * halfY);
      centreZ += weight * (middleZ + along * halfZ);
      if (wet >= 1) continue;
      slope += shares[index] / (top - bottom);
      if (!plane) continue;
      // Its waterplane's part (m²), where the water's level crosses it (m, from its origin along the world's x and z).
      const part = volume * shares[index] / ((top - bottom) * radius);
      const reach = 2 * wet - 1;
      const crossX = middleX + reach * halfX, crossY = middleY + reach * halfY, crossZ = middleZ + reach * halfZ;
      const x = radius * (rotation[0] * crossX + rotation[4] * crossY + rotation[8] * crossZ), z = radius * (rotation[2] * crossX + rotation[6] * crossY + rotation[10] * crossZ);
      area += part; firstX += part * x; firstZ += part * z; secondXX += part * x * x; secondZZ += part * z * z; secondXZ += part * x * z;
    }
    this.extent = { low: low * radius, high: high * radius };   // as it is turned now (syncMeshes' mirror image reads it)
    const centre = this.buoyancyCentre ??= new THREE.Vector3();
    if (share > 0) centre.set(centreX / share, centreY / share, centreZ / share);
    else centre.copy(this.buoyancy.centroid);
    return {
      share, slope: slope / radius, low: low * radius, high: high * radius, centre,
      plane: plane ? { area, x: firstX, z: firstZ, xx: secondXX, zz: secondZZ, xz: secondXZ } : null,
    };
  }

  /** Its half-height (m): a ball's radius; anything else's ellipsoid's depth as it is turned. */
  halfHeight() { return this.ellipsoidDepth(); }

  /** The height of its centre over the still water when it floats at rest (m), turned as it is now (Archimedes, by bisection). */
  floatingHeight() {
    if (!this.buoyancy) {
      const half = this.halfHeight();
      return half * (1 - floatingDepth(this.density / WATER_DENSITY));
    }
    const wanted = this.density / WATER_DENSITY;
    const { low, high } = this.waterline(0);
    let lowest = -high, highest = -low;   // centre heights from all under to all clear
    for (let iteration = 0; iteration < 30; iteration++) {
      const middle = 0.5 * (lowest + highest);
      if (this.waterline(middle).share > wanted) lowest = middle; else highest = middle;
    }
    return 0.5 * (lowest + highest);
  }

  /**
   * Set adrift under the water, a floater already (a shard of ice the ice
   * broke and pushed under, src/ice.js shards): at `position`, moving at
   * `velocity`, turned to `quaternion`, it floats up from there (floatStep; a
   * plate's water model, the water it carries wholly under carried), seen
   * through the water as a thing gone in is.
   */
  adrift(position, velocity, quaternion) {
    this.position.copy(position);
    this.previous.copy(position);
    this.velocity.copy(velocity);
    this.quaternion.copy(quaternion);
    this.spinRate = 0;
    this.state = 'float';
    this.hasFloated = true;
    this.carriedWater = this.plate ? this.plateAddedMass(1) : 0;
    this.sinceImpact = Infinity;
    this.seenThroughWater.value = 1;
    this.wet = 1;
    this.syncMeshes();
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
   * and the waves it makes slowing it; a thing not round is turned by the
   * water's push too (turnAfloat). Returns whether it is still in the
   * water (it may bob clear); it settles once still.
   */
  floatStep(dt) {
    const volume = this.mass / this.density;   // m³: a stone's nominal ball's, as its mass is
    const line = this.waterline(this.position.y, { plane: Boolean(this.buoyancy) });
    const share = line.share;
    // A non-plate carries displaced water; a plate carries water only normal to its face.
    const inertia = this.mass + FLOAT.addedMass * WATER_DENSITY * volume * share;
    const buoyancy = WATER_DENSITY * GRAVITY * volume * share;
    const stiffness = WATER_DENSITY * GRAVITY * volume * line.slope;
    const half = 0.5 * (line.high - line.low);
    const waterplane = line.slope > 0 ? volume * line.slope : share > 0.5 ? volume / (2 * half) : 0;
    const normalY = this.plate ? scratch.face.copy(this.shape.axes[2]).applyQuaternion(this.quaternion).y : 0;
    const bobInertia = this.plate ? this.mass + this.plateAddedMass(share) * normalY ** 2 : inertia;
    const damping = 2 * FLOAT.damping * Math.sqrt(Math.max(stiffness, 0) * bobInertia);
    if (this.plate) this.plateWaterStep(dt, share, buoyancy, damping, this.plateUnder(line));
    else {
      const resisting = (damping + 0.5 * WATER_DENSITY * FLOAT.drag * waterplane * Math.abs(this.velocity.y)) / inertia;
      this.velocity.y = (this.velocity.y + ((buoyancy - this.mass * GRAVITY) / inertia) * dt) / (1 + resisting * dt);
      const relativeX = this.velocity.x - this.drift.x, relativeZ = this.velocity.z - this.drift.z;
      const section = this.buoyancy ? share * volume / (2 * this.radius) : discSegment(half, line.depth * half);
      const slowing = 0.5 * WATER_DENSITY * FLOAT.drag * section * Math.hypot(relativeX, relativeZ) / inertia + FLOAT.slowing * Math.min(4 * share, 1);
      const kept = 1 / (1 + slowing * dt);
      this.velocity.x = this.drift.x + relativeX * kept;
      this.velocity.z = this.drift.z + relativeZ * kept;
    }
    this.position.addScaledVector(this.velocity, dt);
    if (this.buoyancy) this.turnAfloat(dt, line, buoyancy, waterplane > 0 ? damping / waterplane : 0);
    else this.spinRate *= Math.exp(-SPIN_DECAY * dt);
    if (this.position.y + (this.buoyancy ? line.low : this.waterline(this.position.y).low) >= 0 && this.velocity.y > 0) return false;   // bobbed clear of the water
    // Still, at the height it floats at, and (not round) lying stably: it rests. The dearest tests last, each only once
    // the cheaper ones pass.
    const still = Math.abs(this.velocity.y) < FLOAT.settledSpeed && Math.hypot(this.velocity.x, this.velocity.z) < FLOAT.settledSpeed && this.drift.x === 0 && this.drift.z === 0
      && (!this.buoyancy || (this.rocking() < FLOAT.settledRocking && this.leverLength < FLOAT.settledLever * this.radius));
    // How far it is from where it floats, from this step's waterline (a Newton step: the share's excess over its slope),
    // so the search for that height is made only as it comes to rest.
    const off = still && line.slope > 0 ? Math.abs(share - this.density / WATER_DENSITY) / line.slope : Infinity;
    if (this.floats && still && off < FLOAT.settledOffset && (!this.buoyancy || this.stableAfloat())) {
      this.position.y = this.floatingHeight();
      this.velocity.set(0, 0, 0);
      this.spinRate = 0;
      this.state = 'rest';
      this.afloat = true;
    }
    return true;
  }

  /** How far under a plate is for the flow's turning and lift (0 at the surface, where it planes; 1 PLATE_WATER.munkDepth of its radius down), from its waterline. */
  plateUnder(line) { return Math.min(Math.max(-(this.position.y + line.high) / (PLATE_WATER.munkDepth * this.plateRadius), 0), 1); }

  /** Disc water carried normal to the face: half at the surface, all submerged. */
  plateAddedMass(share) {
    return this.slamMass * (1 + share) * Math.min(share / PLATE_WATER.wetted, 1);
  }

  /**
   * Wet plate translation, resolved across and along its face. Increasing
   * wetted added mass takes momentum only across the face; drag is integrated
   * implicitly in both directions. The same equations handle entry, bobbing,
   * rising and sinking, without an orientation-independent underwater path.
   * `under` (plateUnder) brings in its lift as it glides, deep under.
   */
  plateWaterStep(dt, share, buoyancy, damping, under = 0) {
    const face = scratch.face.copy(this.shape.axes[2]).applyQuaternion(this.quaternion);
    const relative = scratch.force.copy(this.velocity);
    relative.x -= this.drift.x; relative.z -= this.drift.z;
    const normal = relative.dot(face);
    const along = scratch.along.copy(relative).addScaledVector(face, -normal);
    const added = this.plateAddedMass(share);
    const wetted = Math.min(share / PLATE_WATER.wetted, 1);
    const wetArea = Math.PI * this.plateRadius ** 2 * wetted;
    const rimArea = 2 * (this.mass / this.density) / (Math.PI * this.faceRadius) * wetted;   // its rim, edge-on (PLATE_WATER)
    // Across its face: its drag broadside, and, gliding (moving along its face too), its lift, as in the air (PLATE: its
    // push's `slope` term, ½ρ·slope·|v_n|·|v_t|²/|v| per area), deep under only: at the surface it planes.
    const speed = relative.length(), alongSquared = along.lengthSq();
    const lift = speed > 1e-9 ? under * PLATE.slope * alongSquared / speed : 0;
    const normalDrag = 0.5 * WATER_DENSITY * wetArea * (this.thing.air.drag * Math.abs(normal) + lift);
    const skinDrag = 0.5 * WATER_DENSITY * (PLATE.skin * wetArea + PLATE_WATER.edge * rimArea) * along.length();
    const normalMass = this.mass + added;
    const normalDenominator = normalMass + normalDrag * dt;
    const tangentDenominator = this.mass + (skinDrag + this.mass * FLOAT.slowing * Math.min(4 * share, 1)) * dt;
    const keptMomentum = this.mass + Math.min(added, this.carriedWater);
    relative.copy(along).multiplyScalar(this.mass / tangentDenominator)
      .addScaledVector(face, normal * keptMomentum / normalDenominator);
    // Invert the directional inertia/drag tensor for gravity and buoyancy,
    // then the vertical spring damping (a rank-one implicit solve).
    const response = scratch.pressure.set(0, 1 / tangentDenominator, 0)
      .addScaledVector(face, face.y * (1 / normalDenominator - 1 / tangentDenominator));
    relative.addScaledVector(response, (buoyancy - this.mass * GRAVITY) * dt);
    relative.addScaledVector(response, -damping * dt * relative.y / (1 + damping * dt * response.y));
    this.velocity.copy(relative);
    this.velocity.x += this.drift.x; this.velocity.z += this.drift.z;
    this.carriedWater = added;
  }

  /**
   * Whether, lying as it does, it would be turned back from a small tilt
   * (FLOAT.stabilityTilt) about either level axis, or left as it was by
   * it (FLOAT.toppling: a ball, a watermelon rolled about its length): a
   * disc on its edge balances, but not stably. One that would not is set rocking
   * (FLOAT.nudge) towards the side it would fall to, as anything real is.
   */
  stableAfloat() {
    const saved = scratch.step.copy(this.quaternion);
    let fallsAbout = null;
    for (const [axis, sign] of [[0, 1], [0, -1], [2, 1], [2, -1]]) {
      const tilt = scratch.axes[0].set(axis === 0 ? 1 : 0, 0, axis === 2 ? 1 : 0);
      this.quaternion.copy(saved).premultiply(new THREE.Quaternion().setFromAxisAngle(tilt, sign * FLOAT.stabilityTilt));
      const line = this.waterline(this.position.y);
      const lever = scratch.lever.copy(line.centre).sub(this.massCentre).applyQuaternion(this.quaternion);
      // About x the push turns it by −lever.z, about z by lever.x: it falls on if that turns it on the way it was tilted.
      const turning = axis === 0 ? -lever.z : lever.x;
      if (turning * sign > FLOAT.toppling) { fallsAbout = { axis, sign }; break; }
    }
    this.quaternion.copy(saved);
    this.waterline(this.position.y);   // its extent as it is again
    if (!fallsAbout) return true;
    this.spinAxis.set(fallsAbout.axis === 0 ? fallsAbout.sign : 0, 0, fallsAbout.axis === 2 ? fallsAbout.sign : 0);
    this.spinRate = FLOAT.nudge;
    return false;
  }

  /** How fast it rocks (rad/s): its turning about the level axes. */
  rocking() { return this.spinRate * Math.hypot(this.spinAxis.x, this.spinAxis.z); }

  /**
   * A floater that is not round turned by the water (the header), as a
   * rigid body: the water's push, `buoyancy` (N), acts at the middle of
   * what it displaces (waterline's `centre`) and its weight at its own
   * middle (its shape's centroid), so a pizza on its edge, or one tilted by
   * a knock, is turned flat by the torque between them, at the rate its
   * inertia (its shape's moments, FLOAT.addedInertia of it more for the
   * water it carries) allows; on a flat face either way up it is stable,
   * so one that lands upside down floats upside down. Its rocking is damped
   * as its bob is: each part of its waterplane resists moving up and down
   * through the water at `damping` (N·s/m per m² of it: its bob's damping
   * over its waterplane), and its spin about the vertical fades as under
   * water. Turned about its middle, which stays where it was.
   */
  turnAfloat(dt, line, buoyancy, damping) {
    const radius = this.radius;
    const quaternion = this.quaternion;
    const centroid = this.massCentre;
    const middle = scratch.middle.copy(centroid).applyQuaternion(quaternion).multiplyScalar(radius);
    const lever = scratch.lever.copy(line.centre).applyQuaternion(quaternion).multiplyScalar(radius).sub(middle);
    // The push up at the lever's end: r × (0, B, 0).
    this.leverLength = Math.hypot(lever.x, lever.z);
    const torque = scratch.torque.set(-lever.z * buoyancy, 0, lever.x * buoyancy);
    // The waterplane's damping, about its middle: each part at (x, z) from it resists (ω × r)·ŷ = ω_z·x − ω_x·z.
    const plane = line.plane;
    const angular = scratch.angular.copy(this.spinAxis).multiplyScalar(this.spinRate);
    let dampXX = 0, dampZZ = 0, dampXZ = 0;
    if (plane && plane.area > 0) {
      const x = middle.x, z = middle.z;
      dampXX = damping * (plane.xx - 2 * x * plane.x + x * x * plane.area);
      dampZZ = damping * (plane.zz - 2 * z * plane.z + z * z * plane.area);
      dampXZ = damping * (plane.xz - x * plane.z - z * plane.x + x * z * plane.area);
    }
    if (this.plate) {
      // Munk moment: an edge-first disc turns broadside to its relative flow. It is deep water's: at the surface a plate
      // planes, the water under it only, and its pressure and its displaced volume's lever turn it level, so the moment
      // grows in only as its top goes under, in full PLATE_WATER.munkDepth of its radius down.
      const face = scratch.face.copy(this.shape.axes[2]).applyQuaternion(quaternion);
      const flow = scratch.force.copy(this.velocity);
      flow.x -= this.drift.x; flow.z -= this.drift.z;
      const under = this.plateUnder(line);
      torque.addScaledVector(scratch.pressure.crossVectors(face, flow), under * this.carriedWater * face.dot(flow));
    }
    // Its principal moments (principal: its shape's, with the water it carries) and Euler's equations (eulerTurn), the
    // damping then taken implicitly about the level axes.
    const turned = this.eulerTurn(angular, torque, dt, this.plate ? 1 : 1 + FLOAT.addedInertia * line.share);
    const { moments, axes } = this.principal(this.plate ? 1 : 1 + FLOAT.addedInertia * line.share);
    // Damped: τ_x = −(zz·ω_x − xz·ω_z), τ_z = −(xx·ω_z − xz·ω_x), against the moment about each level axis.
    const momentX = moments[0] * axes[0].x ** 2 + moments[1] * axes[1].x ** 2 + moments[2] * axes[2].x ** 2;
    const momentZ = moments[0] * axes[0].z ** 2 + moments[1] * axes[1].z ** 2 + moments[2] * axes[2].z ** 2;
    const dampedX = (turned.x + (dampXZ * turned.z / momentX) * dt) / (1 + (dampZZ / momentX) * dt);
    const dampedZ = (turned.z + (dampXZ * dampedX / momentZ) * dt) / (1 + (dampXX / momentZ) * dt);
    // The water it is in slows all its turning besides (as FLOAT.slowing its drift), and its spin about the vertical as under water.
    const plateDrag = this.plate ? WATER_DENSITY * this.plateRadius ** 5 * this.thing.air.drag * PLATE.turnDrag * angular.length() : 0;
    const slowed = 1 / (1 + (FLOAT.turnSlowing * line.share + plateDrag / Math.min(momentX, momentZ)) * dt);
    turned.x = dampedX * slowed; turned.z = dampedZ * slowed;
    turned.y *= Math.exp(-SPIN_DECAY * dt) * (this.plate ? slowed : 1);
    const rate = turned.length();
    this.spinRate = rate;
    if (rate > 1e-9) this.spinAxis.copy(turned).divideScalar(rate);
    // Turned about its middle: its origin moves as the middle would.
    if (rate * dt > 1e-9) {
      quaternion.premultiply(scratch.step.setFromAxisAngle(this.spinAxis, rate * dt));
      const after = scratch.lever.copy(centroid).applyQuaternion(quaternion).multiplyScalar(radius);
      this.position.add(middle).sub(after);
    }
    this.turned = true;
  }

  /**
   * Afloat where the bed comes up to its lowest point (a gale drifting it
   * onto the shore): it grounds there. The bed holds it from going on into
   * shallower water, and it sits no lower than the bed. It floats off again
   * once the water takes it back out. A plate sinking (one that does not
   * float) meets the bed's plane across it (bedPlane) and lies down on it
   * (restOn): on the shore's slope it touches with its higher end first and
   * comes to rest along the slope, not level at the depth under its middle
   * with one end in the sand. `pondDepth` is the bed's depth, as update
   * takes it.
   */
  aground(pondDepth) {
    const depthAt = (x, z) => (typeof pondDepth === 'function' ? pondDepth(x, z) : pondDepth);
    // Only where the bed is within its reach is its mesh worth walking for its lowest point.
    const depth = depthAt(this.position.x, this.position.z);
    if (depth > this.reach * this.radius - this.position.y) return;
    const sinking = this.plate && !this.floats;
    const plane = sinking ? this.bedPlane(depthAt) : { normal: UP, height: -depth };
    const lowest = this.lowestAlong(plane.normal);
    if ((this.position.y - plane.height) * plane.normal.y + lowest >= 0) return;
    let bed = depth;
    if (depth < depthAt(this.previous.x, this.previous.z)) {
      this.position.x = this.previous.x;
      this.position.z = this.previous.z;
      this.velocity.x = 0;
      this.velocity.z = 0;
      bed = depthAt(this.position.x, this.position.z);
    }
    if (sinking) {
      const { normal, height } = this.bedPlane(depthAt);
      this.restOn(height, normal);
      this.onGround = false;
      this.spinRate = 0;
      this.afloat = false;
      return;
    }
    this.position.y = Math.max(this.position.y, -bed - lowest);
    this.velocity.y = Math.max(this.velocity.y, 0);
  }

  /**
   * The bed's plane under it, from `depthAt(x, z)`, the bed's depth: its
   * slope across its own size (the depths a radius either way of its
   * middle), as high under its middle as keeps it out of the bed there too:
   * across a hollow (the shore's bed, levelling off away from the shore) it
   * rests on its ends, over a rise on its middle. Its normal (scratch.bed)
   * and its height under its middle.
   */
  bedPlane(depthAt) {
    const { x, z } = this.position, span = this.radius;
    const middle = depthAt(x, z), east = depthAt(x + span, z), west = depthAt(x - span, z), south = depthAt(x, z + span), north = depthAt(x, z - span);
    const normal = scratch.bed.set((east - west) / (2 * span), 1, (south - north) / (2 * span)).normalize();
    return { normal, height: -Math.min(middle, (east + west) / 2, (south + north) / 2) };
  }

  // ---- the ground (the header) --------------------------------------------

  /**
   * Come to rest where it is, its lowest point on the plane through
   * `height` under its middle whose normal is `normal` (level ground; a
   * sloping bed's, aground): it tumbled or rolled to a stop on the ground,
   * or a plate sank onto the bed. A thing kept upright (`body.upright`: a
   * pizza, a pie, a duck) settles onto a face it can lie on over
   * GROUND.settleSeconds (settleStep), lying along the plane: one ballasted
   * low (GROUND.rightsFrom: a duck) onto its base, anything else (a pie, its
   * weight only a little low) onto whichever of its top or bottom is nearer
   * down.
   */
  restOn(height, normal = UP) {
    this.groundHeight = height;
    this.groundNormal.copy(normal);
    this.position.y = height - this.lowestAlong(normal) / normal.y;
    this.velocity.set(0, 0, 0);
    this.state = 'rest';
    this.onGround = true;
    if (this.thing.body.upright) {
      const up = scratch.face.copy(this.uprightAxis).applyQuaternion(this.quaternion);
      const down = (this.thing.body.ballast?.[1] ?? 0) <= -GROUND.rightsFrom || up.dot(normal) >= 0 ? normal : scratch.along.copy(normal).negate();
      const turn = new THREE.Quaternion().setFromUnitVectors(up, down);
      this.settling = turn.w < 0.9999 ? { from: this.quaternion.clone(), to: turn.multiply(this.quaternion), time: 0 } : null;
    }
    this.syncMeshes();
  }

  /** Its ground gone from under it as it rests (a hole opened there, src/ice.js): it goes along the ground again, so it falls where there is none. */
  loseGround() {
    this.settling = null;
    this.onGround = false;
    this.state = 'ground';
  }

  /** dt seconds of settling onto the ground (restOn): turned on towards the face it lies on, its lowest point kept on the ground's plane. */
  settleStep(dt) {
    const settling = this.settling;
    settling.time = Math.min(settling.time + dt, GROUND.settleSeconds);
    const share = settling.time / GROUND.settleSeconds;
    this.quaternion.slerpQuaternions(settling.from, settling.to, share * share * (3 - 2 * share));
    this.position.y = this.groundHeight - this.lowestAlong(this.groundNormal) / this.groundNormal.y;
    if (settling.time >= GROUND.settleSeconds) this.settling = null;
  }

  /** Down on the ground at `height` (the header): out of it, then a bounce off it, or it settles to tumble or roll along it. */
  meetGround(height, dt) {
    this.position.y = height + this.ellipsoidDepth();
    this.groundHeight = height;
    if (this.velocity.y >= -GROUND.settle) {
      this.state = 'ground';
      this.alongGround(dt);
      return;
    }
    this.splat(this.velocity);
    const material = this.thing.material;
    const surface = this.groundSurface;   // the ground's own (the header: ice)
    const fall = -this.velocity.y;
    this.heard.push({ speed: fall, radius: this.radius, bounce: this.collisionBounce, surface: surface?.kind });   // its knock on the ground (src/sound.js)
    const bounce = material.bounce[0] + (material.bounce[1] - material.bounce[0]) * this.random();
    this.velocity.y = bounce * fall;
    const along = Math.hypot(this.velocity.x, this.velocity.z);
    // The friction slows it along the ground, a ball no lower than rolling.
    const friction = Math.min(material.friction, surface?.friction ?? Infinity);
    const least = material.roll ? material.roll * along : 0;
    const kept = along > 1e-9 ? Math.max(along - friction * (1 + bounce) * fall, least) / along : 0;
    const turn = material.roll ? 0 : GROUND.scatter * (2 * this.random() - 1);
    const velocityX = this.velocity.x * kept, velocityZ = this.velocity.z * kept;
    this.velocity.x = velocityX * Math.cos(turn) - velocityZ * Math.sin(turn);
    this.velocity.z = velocityX * Math.sin(turn) + velocityZ * Math.cos(turn);
    this.spinAlongGround();
  }

  /**
   * Tumbling or rolling along the ground (the header): over its edge, or
   * down a step, it falls again; up a step it cannot climb it is turned back
   * off it; it rests once slower than GROUND.stopped.
   */
  alongGround(dt) {
    let height = this.ground?.at(this.position.x, this.position.z) ?? null;
    const before = this.groundHeight ?? height;
    if (height === null || height < before - GROUND.step) { this.state = 'air'; return; }
    if (height > before + GROUND.step) height = this.turnBackFromStep();
    this.groundHeight = height;
    this.velocity.y = 0;
    this.position.y = height + this.ellipsoidDepth();
    const along = Math.hypot(this.velocity.x, this.velocity.z);
    const material = this.thing.material, surface = this.groundSurface;
    const slowing = material.roll ? Math.min(material.rolling, surface?.rolling ?? Infinity) : surface?.tumbling ?? GROUND.tumbling;
    const slowed = Math.max(along - slowing * GRAVITY * dt, 0);
    if (slowed < GROUND.stopped) { this.restOn(height); return; }
    this.velocity.x *= slowed / along;
    this.velocity.z *= slowed / along;
    this.spinAlongGround();
  }

  /** The ground's own surface where it is (the header: its `materialAt`, else its `material`), or null. */
  get groundSurface() {
    const ground = this.ground;
    return (ground?.materialAt ? ground.materialAt(this.position.x, this.position.z) : ground?.material) ?? null;
  }

  /**
   * Up a step it cannot climb (alongGround: a frozen pool's wall, met from
   * its ice): back where it was along each axis whose move alone rose (both,
   * if neither alone did: a corner), that part of its velocity turned back
   * at its own bounce. Returns the ground's height where it then is.
   */
  turnBackFromStep() {
    const at = (x, z) => this.ground.at(x, z) ?? -Infinity;
    const rises = (x, z) => at(x, z) > this.groundHeight + GROUND.step;
    let alongX = rises(this.position.x, this.previous.z), alongZ = rises(this.previous.x, this.position.z);
    if (!alongX && !alongZ) alongX = alongZ = true;
    if (alongX) { this.position.x = this.previous.x; this.velocity.x *= -this.collisionBounce; }
    if (alongZ) { this.position.z = this.previous.z; this.velocity.z *= -this.collisionBounce; }
    this.heard.push({ speed: Math.hypot(alongX ? this.velocity.x : 0, alongZ ? this.velocity.z : 0) / Math.max(this.collisionBounce, 0.05), radius: this.radius, bounce: this.collisionBounce });
    return this.ground.at(this.position.x, this.position.z) ?? this.groundHeight;
  }

  /**
   * Its spin about the level axis across its path: a ball's rolling, v/R; a
   * stone's tumble, GROUND.tumble of that, or the ground's own `tumble`
   * (ice: it slides more than it tumbles), at most GROUND.tumbleMost.
   */
  spinAlongGround() {
    const along = Math.hypot(this.velocity.x, this.velocity.z);
    if (along < 1e-6) return;
    this.spinAxis.set(this.velocity.z / along, 0, -this.velocity.x / along);
    const tumble = this.groundSurface?.tumble ?? GROUND.tumble;
    this.spinRate = this.thing.material.roll ? along / this.radius : Math.min(tumble * along / this.radius, GROUND.tumbleMost);
  }

  /**
   * Through the ice into the water (the header: the ground's `meet` said it
   * broke, or opened its hole wider): slowed by what the break took (`keep`
   * of its speed), it goes in from the water's level as into open water
   * (goIn), its impact marked `throughIce` (src/splash.js: no crown stands
   * on the ice). Returns the impact.
   */
  breakThrough(met, dt) {
    this.velocity.multiplyScalar(met.keep ?? 1);
    this.iceHole = met.hole;
    const impact = this.goIn(dt, 0);
    impact.throughIce = !met.open;
    return impact;
  }

  /**
   * Advance by dt seconds. Returns an impact description the first time the
   * stone goes into the water, a skip's touch (skimReport) each time a skip
   * stone skips off it, a ring's (`ripple`) when a floater breaks the
   * surface (the header), otherwise null. surfaceAt(x, z), under a gale, is
   * the water's height there (m); null for still water.
   */
  update(dt, pondDepth, surfaceAt = null) {
    if (this.state === 'held') {
      const surface = surfaceAt?.(this.position.x, this.position.z) ?? 0;
      const bedDepth = typeof pondDepth === 'function' ? pondDepth(this.position.x, this.position.z) : pondDepth;
      if (this.position.y + this.lowestOffset() < surface) this.wet = 1;
      this.moveHeld(this.position, surface, bedDepth);
      return null;
    }
    let surface = 0;
    this.age += dt;
    this.turned = false;   // a floater not round turns itself afloat (turnAfloat); anything else turns by its spin below
    // Where the last step left it (syncMeshes), as this step begins: drawAt draws it between there and where this one ends
    // (never from where a frame drew it, which may be short of either).
    this.drawnBefore ??= { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    this.drawnBefore.position.copy(this.stepEnd.position);
    this.drawnBefore.quaternion.copy(this.stepEnd.quaternion);
    this.previous.copy(this.position);
    let impact = null;
    // Down on the ground (the header), if it was over it the step before too (else it met the ground's side, src/pool.js).
    const ground = this.ground;
    const groundBefore = this.state === 'air' && ground ? ground.at(this.position.x, this.position.z) : null;
    if (this.state === 'air') this.fly(dt);
    const groundNow = groundBefore !== null ? ground.at(this.position.x, this.position.z) : null;
    if (groundNow !== null && this.position.y - this.ellipsoidDepth() <= groundNow) {
      // Ice may give way under it (the header: the ground's `meet`); else it lands on the ground.
      const met = ground.meet?.(this, groundNow) ?? null;
      if (met?.hole) impact = this.breakThrough(met, dt);
      else this.meetGround(groundNow, dt);
    } else if (this.state === 'air') {
      // Only near the water is the mesh worth walking for its lowest point.
      if (surfaceAt && this.position.y <= this.reach * this.radius + CREST_REACH) surface = surfaceAt(this.position.x, this.position.z);
      const touching = this.position.y - surface <= this.reach * this.radius && this.position.y + this.lowestOffset() <= surface;
      // In a pool, a touch beyond a wall is the wall's (src/pool.js turns the stone back off it).
      const walled = this.skip?.inside && !this.skip.inside(this.position.x, this.position.z);
      // On a frozen lake the water is only in its holes (the header: the ground's `meet`): one too small for it is the
      // ice's edge, which holds (it lands on the ice) or breaks (it goes in through it).
      const met = touching && this.velocity.y < 0 && !walled && ground?.meet ? ground.meet(this, null) : null;
      // A skip stone's contact is worked out at once: if it skips, the stone follows it (`skim`) and the touch is reported
      // (on open water: a hole wide enough for it is that).
      const open = !met || (met.ground === undefined && !met.broke);
      const contact = touching && this.velocity.y < 0 && this.skip && !walled && open ? this.skim(surface) : null;
      if (met && met.ground !== undefined) {
        this.meetGround(met.ground, dt);
      } else if (met?.broke) {
        impact = this.breakThrough(met, dt);
      } else if (contact?.skips) {
        this.state = 'skim';
        this.skip.contact = contact;
        impact = this.skimReport(contact);
      } else if (touching && this.velocity.y < 0 && !walled) {
        if (met?.hole) this.iceHole = met.hole;
        // A floater that bobbed clear comes back in quietly if slow (the header); anything else goes in as a throw does.
        if (this.hasFloated && -this.velocity.y < FLOAT.quietEntry) {
          this.position.y -= surface;
          impact = this.startFloating(this.velocity.y);
        } else {
          impact = this.goIn(dt, surface);
          // Into a hole in the ice too narrow for its splash: no crown stands on the ice (src/splash.js).
          if (met?.hole && !met.open) impact.throughIce = true;
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
      // (Only near the surface is where it floats worth working out: it floats with its centre within its reach of it.)
      else if (this.floats && body.vy > 0 && body.time > (body.openUntil ?? 0) && this.position.y > -(this.reach * this.radius + FLOAT.handover * this.halfHeight())
        && this.position.y > this.floatingHeight() - FLOAT.handover * this.halfHeight()) {
        impact = this.startFloating(body.vy);
      }
    } else if (this.state === 'float') {
      if (surfaceAt) surface = surfaceAt(this.position.x, this.position.z);
      if (!this.floatStep(dt)) {
        // Bobbed clear: into the air's frame, the waves' height under it added back (afloat it moved on still water).
        this.state = 'air';
        this.position.y += surface;
        surface = 0;
      } else {
        this.aground(pondDepth);
        if (surfaceAt) surface = surfaceAt(this.position.x, this.position.z);
      }
    } else {
      this.restTime += dt;
      if (this.afloat && surfaceAt) surface = surfaceAt(this.position.x, this.position.z);
      if (this.settling) this.settleStep(dt);
    }
    this.bendStep(dt);
    this.soak(dt);
    if (this.state !== 'rest' && !this.turned) {
      const spin = new THREE.Quaternion().setFromAxisAngle(this.spinAxis, this.spinRate * dt);
      this.quaternion.premultiply(spin);
      // Turned as it goes along the ground, or just off it, it stays on it (its ellipsoid's reach down changes as it
      // turns); in the air, only if the turn took it under the ground by less than a step (more is a wall's side).
      if (this.state === 'ground' && this.groundHeight !== null) this.position.y = this.groundHeight + this.ellipsoidDepth();
      else if (this.state === 'air' && this.ground) {
        const under = this.ground.at(this.position.x, this.position.z), bottom = this.position.y - this.ellipsoidDepth();
        if (under !== null && bottom < under && bottom > under - GROUND.step) this.position.y += under - bottom;
      }
    }
    // In its cavity's air until the pinch-off, under water once the surface has closed.
    // A skip's touch opens no hole, nor does a floater's ripple: what dips under the water is seen through it.
    if (impact && !impact.skim && !impact.ripple) this.sinceImpact = 0;
    else if (impact?.slap) this.sinceImpact = Infinity;   // a plate's slap opens no hole: what is under the water is seen through it at once
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
    if (!this.sharedGeometry) this.geometry.dispose();   // a shared one stays with its definition (prepareThing)
    this.meshAbove.material.dispose();
    this.meshBelow.material.dispose();
    this.meshMirror?.material.dispose();
  }
}
