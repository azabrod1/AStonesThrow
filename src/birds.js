// The birds (src/main.js; drawn by src/birdMeshes.js): who flies over each
// place, and how. They are scenery, as the fish are: nothing thrown meets
// them, they touch neither the splash nor the water's waves, and they never
// come within reach of a throw. A thing thrown near a heron puts it up.
//
// Who lives where (BIRDS_BY_PLACE): a bird of every place, of where its
// photograph was taken (Poly Haven's coordinates), a few done well.
//   - Rocky cove (Cape Town's Atlantic shore): kelp gulls, each coming by
//     now and then to work the water out past the rocks, mostly gliding, a
//     few wingbeats now and then. Loch Ness: herring gulls, so.
//   - The Koi pond (Nagoya): a grey heron wading in the shallows of the far
//     bank, as herons stand in every garden pond with fish in it (wade). It
//     stands still for long spells, its head turning now and then, its neck
//     drawn in or stretched up; a splash anywhere in the pond makes it
//     stretch up and look; a thing thrown near it puts it up: it crouches,
//     jumps and flies off low over the garden with deep, slow beats, its neck
//     drawn in and its legs trailing, as herons fly; a minute or so later it
//     glides back in, flares and lands where it stood.
//   - The Pool (Sterkfontein Dam's shore, Lakeside's sky): two Egyptian geese
//     on the lawn past the deck, as they come to every pool in South Africa,
//     one standing, one resting with its head tucked in (graze); a thing
//     thrown near puts both up, and they come back together.
//   - Lakeside (Sterkfontein Dam): an African fish eagle, coming over the
//     open water now and then, sometimes circling up in a thermal; Harbour,
//     on the same dam: a string of sacred ibises; Mesas, the hill over it: a
//     pair of Egyptian geese. Highlands (the eastern Free State): a grey heron.
//   - Desert oasis (the Richtersveld): a Verreaux's eagle under the koppies.
//     Swiss Alps (Lago d'Isola): a pair of ravens. Wooded lake (Radków): a
//     pair of mute swans. The Polynesian lagoon: great frigatebirds, hardly
//     ever beating their wings, circling.
//   - None at night (setConditions: the true sun more than NIGHT_SUN below
//     the horizon, though the moon may light the scene).
//
// How they fly (visit). A flying bird is not always there: it comes into
// the view now and then from beyond one side of the frame, goes about over
// the water and leaves, and is away a while (`gap`) before it comes again.
// Each visit is a path of its own (makeVisit), drawn from the bird's seed
// and the visit's number: over from one side to the other, wandering nearer
// and farther, higher and lower; or in, round in a wide turn and back out;
// or, for a soaring kind, round and round in a thermal, rising, and off.
// The path is a cubic B-spline (splinePath: smooth to its curvature) flown
// at the visit's speed by its length, so the bird's heading, climb and bank
// (into its turn as a glider banks, tan(bank) = v²κ/g) all change smoothly;
// it flaps as its kind does (FLAPPING: in bouts drawn from its seed and the
// time, flapBout, and whenever it climbs but in a thermal). A flock flies
// its leader's path strung out behind it. All of it is closed form in time
// (visitAt), the visits made in order and the last few kept. A standing
// bird's state (`mode`) is changed only in the physics steps (step,
// startle: src/main.js), and each frame poses every bird at the frame's
// time (showAt), so a seeded game goes alike at any frame rate
// (tools/frame-rate-probe.mjs). Their randomness is their own seeded stream
// (seededRandom), never Math.random, so seeded throws stay as they were.
//
// A pose (`pose`, from which src/birdMeshes.js poses its model): where it
// is (x, y, z: its body's middle, or for a bird standing its feet), its
// heading, pitch and bank (rad), its wingbeat's phase and how hard it beats
// (beat, 0 to 1), how far its wings are folded (fold, 1 folded on its back),
// its neck (neck: 0 drawn in onto its shoulders, 1 stretched up), its head's
// turn (look, rad), its legs (legs: 0 trailing behind, 1 standing), how far
// it is crouched (crouch, 0 to 1) and whether it is seen at all (shown).
import * as THREE from 'three';
import { seededRandom } from './spray.js';
import { KOI_SHORE, koiShoreRadius, koiFloorDepthAt } from './pondFloor.js';
import { STEP_LENGTH } from './birdRig.js';

const GRAVITY = 9.81;
const NIGHT_SUN = 4;   // degrees: the true sun this far below the horizon (not the moon that lights a night), no bird is about
const EYE = { x: 0, z: 2.45 };   // the shore's eye (src/main.js VIEWS.shore): where visits are laid out from

// How a kind flaps (flapBout): its time cut into `window`-second spells, and in `share` of them a bout of `least` to
// `most` seconds of beating from the spell's start, eased in and out over `ease`; and it beats while it climbs,
// `climb` of full beating a m/s of climb. `steady`: it beats all the time (a goose, a swan, a crow going somewhere).
const FLAPPING = {
  gull: { window: 5.5, share: 0.4, least: 1.2, most: 2.6, ease: 0.35, climb: 1.4 },   // glides, a few beats now and then
  soaring: { window: 12, share: 0.18, least: 0.8, most: 1.6, ease: 0.3, climb: 0.5 },   // an eagle: a few beats in a minute
  fishing: { window: 6, share: 0.65, least: 2, most: 4, ease: 0.4, climb: 0.8 },   // a fish eagle low over the water: bouts of slow, shallow beats between glides
  frigate: { window: 20, share: 0.1, least: 0.6, most: 1.0, ease: 0.25, climb: 0.2 },   // hardly ever
  corvid: { window: 3.2, share: 0.75, least: 1.6, most: 2.8, ease: 0.25, climb: 1.4 },   // rows, with short glides
  steady: { steady: true },
};

// The kinds: their size (m: wingspan, bill to tail), their wingbeat (Hz; Pennycuick's: a gull about 3, a heron about
// 2), their speed (m/s), how they flap (FLAPPING) and, for one that stands, how high its body's middle is over its feet
// (m; where it takes off from and lands at).
export const BIRD_KINDS = {
  herring: { name: 'Herring gull', span: 1.4, length: 0.6, beat: 2.9, cruise: 8.5, flapping: 'gull', stand: 0 },
  kelp: { name: 'Kelp gull', span: 1.4, length: 0.6, beat: 2.8, cruise: 8.5, flapping: 'gull', stand: 0 },
  heron: { name: 'Grey heron', span: 1.75, length: 0.95, beat: 2.2, cruise: 9, flapping: 'steady', stand: 0.421 },   // stand: its model's hips (src/birdMeshes.js)
  goose: { name: 'Egyptian goose', span: 1.45, length: 0.7, beat: 3.8, cruise: 14, flapping: 'steady', stand: 0.32 },
  ibis: { name: 'African sacred ibis', span: 1.15, length: 0.7, beat: 3.6, cruise: 12, flapping: 'corvid', stand: 0 },
  fishEagle: { name: 'African fish eagle', span: 2.1, length: 0.72, beat: 2.2, cruise: 10, flapping: 'fishing', stand: 0 },
  eagle: { name: "Verreaux's eagle", span: 2.1, length: 0.85, beat: 2.0, cruise: 11, flapping: 'soaring', stand: 0 },
  raven: { name: 'Common raven', span: 1.2, length: 0.62, beat: 3.4, cruise: 10, flapping: 'corvid', stand: 0 },
  swan: { name: 'Mute swan', span: 2.2, length: 1.45, beat: 2.9, cruise: 15, flapping: 'steady', stand: 0 },
  frigate: { name: 'Great frigatebird', span: 2.2, length: 0.95, beat: 1.6, cruise: 9, flapping: 'frigate', stand: 0 },
};

// Each place's birds (src/places.js PLACES): how many of which kind and their habit.
//   visit: now and then a bird comes into the view, goes about over the water a while and leaves (visitAt): each
//     visit a fresh path, `gap` [least, most] s apart (the first within `first` s of the place being shown), drawn
//     with `styles`' weights (cross: over from one side to the other, wandering nearer and farther; turn: in from one
//     side, round in a wide turn out over the water and back out the same side; circle: in, round and round over the
//     water, rising as in a thermal, and off; a soaring kind's), between `distance` [near, far] m from the shore's
//     eye and `height` [low, high] m over the water, its turns and circles centred `aim` degrees to the right of the
//     home view's line, give or take `spread`. `count` birds, each on its own visits, or with `together` one flock
//     on its leader's, each `spacing` m behind the one before and a little to one side, as a small flock strings out.
//   wade: `angle` (rad about the pond's centre, KOI_SHORE) and `offshore` (m out from the waterline) where it stands,
//     `heading` (rad from +x, turning toward −z) which way it faces: side on to the home view, so its outline reads.
//   graze: on dry ground `ground` m up, each bird at its own `spots` [x, z, heading] and in its own `postures` (stand,
//     or rest: its head tucked in, until something makes it look); the group goes together when one is put up, and
//     comes back together. Standing (wade or graze), a bird's ways are its kind's STANDING.
// Each a bird of where its photograph was taken (Poly Haven's places: the header), low enough to be in the home view's
// sky (under FRAME_TOP in tools/bird-probe.mjs, but for a thermal's last turns) and out of a throw's reach.
export const BIRDS_BY_PLACE = {
  cove: [{ kind: 'kelp', habit: 'visit', count: 3, distance: [32, 75], height: [1.5, 4], aim: 0, spread: 14, gap: [4, 30], first: 3, styles: { cross: 0.5, turn: 0.35, circle: 0.15 } }],
  loch: [{ kind: 'herring', habit: 'visit', count: 3, distance: [32, 75], height: [1.5, 4], aim: 0, spread: 14, gap: [4, 30], first: 3, styles: { cross: 0.5, turn: 0.35, circle: 0.15 } }],
  koi: [{ kind: 'heron', habit: 'wade', count: 1, angle: 4.3, offshore: 0.1, heading: -2.85 }],   // in 12 cm of water: to mid-shin
  lagoon: [{ kind: 'frigate', habit: 'visit', count: 2, distance: [45, 100], height: [3, 6], aim: 0, spread: 14, gap: [8, 40], first: 3, styles: { cross: 0.3, turn: 0.2, circle: 0.5 } }],
  swiss: [{ kind: 'raven', habit: 'visit', count: 2, together: true, spacing: 3, distance: [35, 80], height: [2, 4.5], aim: 0, spread: 14, gap: [10, 40], first: 3, styles: { cross: 0.6, turn: 0.4 } }],
  desert: [{ kind: 'eagle', habit: 'visit', count: 1, distance: [55, 110], height: [3.5, 6.5], aim: 0, spread: 12, gap: [10, 40], first: 3, styles: { cross: 0.35, turn: 0.2, circle: 0.45 } }],
  lakeside: [{ kind: 'fishEagle', habit: 'visit', count: 1, distance: [35, 85], height: [2.5, 5], aim: 14, spread: 12, gap: [8, 30], first: 3, styles: { cross: 0.35, turn: 0.25, circle: 0.4 } }],
  wooded: [{ kind: 'swan', habit: 'visit', count: 2, together: true, spacing: 4, distance: [35, 70], height: [1.5, 3.5], aim: 0, spread: 14, gap: [12, 45], first: 3, styles: { cross: 0.8, turn: 0.2 } }],
  harbour: [{ kind: 'ibis', habit: 'visit', count: 5, together: true, spacing: 3.5, distance: [40, 75], height: [2.5, 4.5], aim: 0, spread: 14, gap: [12, 40], first: 3, styles: { cross: 0.75, turn: 0.25 } }],
  mesas: [{ kind: 'goose', habit: 'visit', count: 2, together: true, spacing: 2.5, distance: [35, 65], height: [1.5, 3], aim: 0, spread: 14, gap: [12, 40], first: 3, styles: { cross: 0.75, turn: 0.25 } }],
  highlands: [{ kind: 'heron', habit: 'visit', count: 1, distance: [30, 55], height: [1.5, 3], aim: 0, spread: 14, gap: [12, 45], first: 3, styles: { cross: 0.7, turn: 0.3 } }],
  // On the Pool's lawn (src/pool.js: the deck, POOL.deck up, ends 3.9 m from the pool's middle at (0, −1)), beyond
  // its far side, where the home view's top sees it; side on to the eye.
  pool: [{ kind: 'goose', habit: 'graze', count: 2, ground: 0.1, spots: [[-1.5, -7.4, 0.2], [0.8, -8.4, Math.PI - 0.3]], postures: ['stand', 'rest'] }],
};

const BANK_MOST = THREE.MathUtils.degToRad(50);   // a gull turning tightly banks steeply, slowing as it does

// A heron's ways (the header).
//   idle: its time standing cut into `slot`-second spells, in each of which it may turn its head and set its neck, over
//     `turn` seconds at the spell's start, then hold: `looks` its head's turn (rad either side), its neck one of
//     `necks`, a share `still` of spells changing nothing.
//   alert: a splash within `alert` m: it stretches up and looks toward it for `hold` s, eased over `turn` s.
//   flush: a thing thrown coming down within `radius` m of it (and under `height` m), or a splash within `splash` m,
//     puts it up; it crouches `crouch` s, then flies off over `flight` s along a curve `far` m away and `climb` m up,
//     beating hard over the first `hard` s, its legs swinging back over `legsUp` s and its neck drawn in over `neckIn`.
//   away: `absent` s (drawn) before it comes back, put off `retry` s while a thing has been thrown near its spot in the
//     last `quiet` s.
//   land: it glides back in over `glide` s from `from` m out and `high` m up, beating `flaps` s of every few and
//     flaring over the last `flare` s, its wings folding over `fold` s once it stands.
const HERON = {
  idle: { slot: 4.2, turn: 0.8, looks: 0.9, necks: [0.12, 0.3, 0.55, 0.85], still: 0.35 },
  alert: { alert: 9, hold: 4.5, turn: 0.45 },
  flush: { radius: 2.6, height: 3, splash: 3.2, crouch: 0.28, flight: 9, far: 38, climb: 13, hard: 1.8, legsUp: 1.2, neckIn: 1.0 },
  away: { absent: [45, 90], retry: 12, quiet: 8 },
  land: { glide: 10, from: 34, high: 11, flare: 1.4, fold: 0.9 },
  tilt: 0,   // its body standing, nose up from level (its model stands as photographed)
  // walk: its standing cut into `every`-second spells from when it began to stand; in each it may walk to one of
  //   `spots` (m along the bank either way from its own spot) at `speed`, turning to go over `turn` s first and back to
  //   face as it stood after; none in the first spell (it has just come down).
  walk: { every: 10, spots: [-0.35, -0.12, 0.2, 0.45], speed: 0.17, turn: 0.9 },
  // strike: in a `share` of its spells, `at` s into it (once it has walked, if it walks): it draws its neck back over `coil` s,
  //   throws its bill into the water in `throw`, holds it there `hold`, and brings it back over `back`, swallowing.
  strike: { share: 0.5, at: 7.4, coil: 0.7, throw: 0.14, hold: 0.35, back: 0.9 },
};
// An Egyptian goose's, on a lawn: warier of what comes near (it is on open ground), quicker off and back sooner, and
// level standing. Its head's turns and neck are not drawn (one picture each), but they keep it from being still.
const GOOSE = {
  idle: { slot: 5, turn: 0.6, looks: 0.7, necks: [0.2, 0.5, 0.8], still: 0.5 },
  alert: { alert: 7, hold: 3.5, turn: 0.35 },
  flush: { radius: 3.4, height: 3, splash: 2.6, crouch: 0.18, flight: 8, far: 40, climb: 11, hard: 2.4, legsUp: 0.8, neckIn: 0.6 },
  away: { absent: [35, 70], retry: 10, quiet: 8 },
  land: { glide: 8, from: 30, high: 9, flare: 1.1, fold: 0.6 },
  tilt: 0,
};
const STANDING = { heron: HERON, goose: GOOSE };
const STANDING_HABITS = new Set(['wade', 'graze']);

/** Perlin's smootherstep from edge0 to edge1 (edge0 below edge1). */
const smoother = (edge0, edge1, value) => { const share = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1); return share * share * share * (share * (share * 6 - 15) + 10); };
/** A number in [0, 1) from a seed and an integer: the same every time it is asked. */
const hashed = (seed, index, salt = 0) => seededRandom(seed, index, salt)();
const between = ([least, most], share) => least + (most - least) * share;
/** The angle from `from` to `to`, the short way round (rad). */
const turnBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** A pose, at rest. */
function freshPose() {
  return { x: 0, y: 0, z: 0, heading: 0, pitch: 0, bank: 0, phase: 0, beat: 0, fold: 0, neck: 0, look: 0, legs: 0, crouch: 0, shown: false };
}

/** A point on the cubic Bézier through four [x, y, z] points at u (into `out`). */
function bezier(points, along, out) {
  const left = 1 - along;
  const weights = [left * left * left, 3 * left * left * along, 3 * left * along * along, along * along * along];
  out.x = out.y = out.z = 0;
  for (let index = 0; index < 4; index++) {
    out.x += weights[index] * points[index][0];
    out.y += weights[index] * points[index][1];
    out.z += weights[index] * points[index][2];
  }
  return out;
}

const EYE_HEIGHT = 1.15;   // the shore's eye's height (src/main.js VIEWS.shore)
const OUT = 64;   // degrees either side of the home view's line: out of a wide screen's frame (38° either side at 16:9), where visits begin and end
const CEILING = THREE.MathUtils.degToRad(6);   // a visit's points are kept this far above the eye's level, under the frame's top (7.4°)
const SPAN_SAMPLES = 16;   // a spline's span sampled this many times for its length table

/**
 * The radius (m) of the control points' circle for a turn at `speed` (m/s) banked `bank` degrees: v²/(g·tan(bank)),
 * widened by what the spline cuts off a circle drawn by eight points a turn (its curve runs 0.9 of their radius).
 */
const turnRadius = (speed, bank) => speed * speed / (GRAVITY * Math.tan(THREE.MathUtils.degToRad(bank))) / 0.9;

/**
 * A uniform cubic B-spline through (near) `points` ([x, y, z]), its ends pinned to the first and last (a phantom point
 * mirrored beyond each, so it starts at the first heading for the second), with a table of its length along it:
 * { controls, spans, parameters, lengths, length }.
 */
function splinePath(points) {
  const first = points[0], second = points[1], last = points[points.length - 1], before = points[points.length - 2];
  const controls = [first.map((value, axis) => 2 * value - second[axis]), ...points, last.map((value, axis) => 2 * value - before[axis])];
  const spans = controls.length - 3;
  const parameters = new Float64Array(spans * SPAN_SAMPLES + 1), lengths = new Float64Array(spans * SPAN_SAMPLES + 1);
  const previous = new THREE.Vector3(), current = new THREE.Vector3();
  const path = { controls, spans, parameters, lengths, length: 0 };
  splineAt(path, 0, previous);
  for (let index = 1; index < parameters.length; index++) {
    parameters[index] = index / SPAN_SAMPLES;
    splineAt(path, parameters[index], current);
    lengths[index] = lengths[index - 1] + current.distanceTo(previous);
    previous.copy(current);
  }
  path.length = lengths[lengths.length - 1];
  return path;
}

/** A B-spline's point at parameter `parameter` (0 to spans) into `out`, and its first and second derivatives if given. */
function splineAt(path, parameter, out, first, second) {
  const span = Math.min(Math.floor(parameter), path.spans - 1), local = parameter - span, rest = 1 - local;
  const squared = local * local, cubed = squared * local;
  const weights = [rest * rest * rest / 6, (3 * cubed - 6 * squared + 4) / 6, (-3 * cubed + 3 * squared + 3 * local + 1) / 6, cubed / 6];
  const slopes = [-rest * rest / 2, (3 * squared - 4 * local) / 2, (-3 * squared + 2 * local + 1) / 2, squared / 2];
  const bends = [rest, 3 * local - 2, -3 * local + 1, local];
  out.set(0, 0, 0); first?.set(0, 0, 0); second?.set(0, 0, 0);
  for (let index = 0; index < 4; index++) {
    const [x, y, z] = path.controls[span + index];
    out.x += weights[index] * x; out.y += weights[index] * y; out.z += weights[index] * z;
    if (first) { first.x += slopes[index] * x; first.y += slopes[index] * y; first.z += slopes[index] * z; }
    if (second) { second.x += bends[index] * x; second.y += bends[index] * y; second.z += bends[index] * z; }
  }
  return out;
}

const scratchSample = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), bend: new THREE.Vector3(), turn: 0 };
const scratchPlace = { x: 0, y: 0, z: 0, heading: 0, walked: 0, walking: 0, spell: 0, walks: false, walkEnds: 0 };

/**
 * Where a path is `along` m along it (into `out`): its point, its direction (velocity: its derivative there) and its
 * heading's turn a metre (`turn`, rad/m, positive turning left: toward −z from +x), from the spline itself, not its
 * table, so they are as smooth as it is.
 */
function sampleAt(path, along, out) {
  const { lengths, parameters } = path;
  let low = 0, high = lengths.length - 1;
  while (high - low > 1) { const mid = (low + high) >> 1; if (lengths[mid] <= along) low = mid; else high = mid; }
  const share = (along - lengths[low]) / Math.max(lengths[high] - lengths[low], 1e-9);
  const parameter = parameters[low] + (parameters[high] - parameters[low]) * THREE.MathUtils.clamp(share, 0, 1);
  splineAt(path, parameter, out.position, out.velocity, out.bend);
  const { velocity, bend } = out;
  const level = velocity.x * velocity.x + velocity.z * velocity.z;
  // The heading atan2(−z', x') turns by (z'·x'' − x'·z'')/(x'² + z'²) a unit of the parameter; a metre is |v| of one.
  out.turn = (velocity.z * bend.x - velocity.x * bend.z) / Math.max(level * velocity.length(), 1e-9);
  return out;
}

/**
 * The birds of the place shown (setPlace), stepped with the world
 * (step, startle) and posed at a frame's time (showAt). `birds` lists them:
 * each its kind, its habit and its pose.
 */
export class BirdPopulation {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.place = 'none';
    this.birds = [];
    this.dark = false;
    this.disturbed = -Infinity;   // when a thing was last thrown near a heron's spot (its kind's STANDING away.quiet)
  }

  /** The birds of `place` (none for a place without, or 'none'), each as it starts. */
  setPlace(place) {
    this.place = place;
    const stream = seededRandom(this.seed, 977);
    this.birds = [];
    for (const group of BIRDS_BY_PLACE[place] ?? []) {
      let groupSeed = null, visitor = null;
      for (let index = 0; index < group.count; index++) {
        const bird = { kind: group.kind, habit: group.habit, group, index, pose: freshPose(), seed: Math.floor(stream() * 2 ** 31) };
        groupSeed ??= bird.seed;
        bird.groupSeed = groupSeed;   // a group's shared draws (when it comes back, from which side): its first bird's seed
        if (group.habit === 'visit') {
          // Each on its own visits, or a flock all on its leader's (rank: its place behind the leader).
          if (!group.together || !visitor) visitor = this.layVisitor(group, bird.seed);
          Object.assign(bird, { visitor, rank: group.together ? index : 0, phaseOffset: stream() * Math.PI * 2, flapOffset: stream() * (FLAPPING[BIRD_KINDS[group.kind].flapping].window ?? 1) });
        } else this.laySpot(bird, group);
        this.birds.push(bird);
      }
    }
    this.reset(0);
  }

  /** A visiting bird's (or flock's) visits (visitAt): its seed, its group, the kind's speed; its visits made as asked for. */
  layVisitor(group, seed) {
    return { seed, group, cruise: BIRD_KINDS[group.kind].cruise, since: 0, visits: [], lagMost: group.together ? (group.count - 1) * group.spacing : 0 };
  }

  /**
   * A standing bird's spot: where its feet are (a heron's on the bed, src/birdSprites.js drawing what of it is under
   * the water there) and which way it faces.
   */
  laySpot(bird, group) {
    if (group.habit === 'graze') {
      const [x, z, heading] = group.spots[bird.index];
      bird.spot = { x, y: group.ground, z, heading };
      return;
    }
    const radius = koiShoreRadius(group.angle) - group.offshore;
    const x = KOI_SHORE.centre[0] + Math.cos(group.angle) * radius;
    const z = KOI_SHORE.centre[1] + Math.sin(group.angle) * radius;
    bird.spot = { x, y: -koiFloorDepthAt(x, z), z, heading: group.heading };
  }

  /** Every bird as it starts at `time`: one that stands, standing at its spot; a visitor's visits from now. */
  reset(time) {
    this.disturbed = -Infinity;
    for (const bird of this.birds) {
      if (bird.visitor) { bird.visitor.since = time; bird.visitor.visits.length = 0; }
      if (!STANDING_HABITS.has(bird.habit)) continue;
      bird.mode = 'stand';
      bird.since = time;
      bird.standSince = time;   // its walks' spells from now (src/birds.js standingPlace)
      bird.foldSince = time - STANDING[bird.kind].land.fold;   // standing a while already: its wings folded
      bird.alertAt = -Infinity;
      bird.alertToward = 0;
      bird.returnAt = Infinity;
      bird.flight = null;
    }
  }

  /** Whether the birds are out: none while it is dark (the true sun's elevation in degrees, src/sky.js lighting.solarElevation). */
  setConditions({ solarElevation }) {
    this.dark = solarElevation < -NIGHT_SUN;
  }

  /**
   * One physics step's end at `time` (src/main.js simulate): a bird that
   * stands sees what is coming down near it and goes (flush), and comes back
   * when its absence is over and nothing has been thrown near its spot for a
   * while.
   * `things` are the things thrown (src/rock.js: state, position, velocity).
   */
  step(time, things) {
    for (const bird of this.birds) {
      if (!STANDING_HABITS.has(bird.habit)) continue;
      const { spot } = bird;
      const ways = STANDING[bird.kind];
      for (const thing of things) {
        if (thing.state !== 'air' || thing.velocity.y >= 0 || thing.position.y > spot.y + ways.flush.height) continue;
        const near = Math.hypot(thing.position.x - spot.x, thing.position.z - spot.z);
        if (near < ways.flush.radius * 1.6) this.disturbed = time;
        if (bird.mode === 'stand' && near < ways.flush.radius) this.flush(bird, time, thing.position.x, thing.position.z);
      }
      if (bird.mode === 'flee' && time >= bird.since + ways.flush.crouch + ways.flush.flight) {
        bird.mode = 'away';
        bird.since = time;
      }
      if (bird.mode === 'away' && time >= bird.returnAt) {
        if (time - this.disturbed < ways.away.quiet) bird.returnAt = time + ways.away.retry;
        else this.land(bird, time);
      }
      if (bird.mode === 'land' && time >= bird.since + ways.land.glide) {
        bird.mode = 'stand';
        bird.since = time;
        bird.standSince = time;
        bird.foldSince = time;
        bird.alertAt = -Infinity;
      }
    }
  }

  /** A splash at (x, z) (src/main.js, at its step): a standing bird near enough goes; one in sight of it stretches up and looks. */
  startle(time, x, z) {
    for (const bird of this.birds) {
      if (!STANDING_HABITS.has(bird.habit)) continue;
      const ways = STANDING[bird.kind];
      const near = Math.hypot(x - bird.spot.x, z - bird.spot.z);
      if (near < ways.flush.radius * 1.6) this.disturbed = time;
      if (bird.mode !== 'stand') continue;
      if (near < ways.flush.splash) this.flush(bird, time, x, z);
      else if (near < ways.alert.alert) {
        // Its head toward the splash, as a turn from its heading, no more than it can look round.
        bird.alertToward = THREE.MathUtils.clamp(turnBetween(bird.spot.heading, Math.atan2(-(z - bird.spot.z), x - bird.spot.x)), -1.4, 1.4);
        bird.alertAt = time;
      }
    }
  }

  /**
   * Put a standing bird up at `time`: off along the bank, across the eye's
   * view (to the side away from (x, z)) and a little away from the eye, low
   * over the garden; across, as its pictures show it side on
   * (src/birdSprites.js). The rest of its group, standing, go with it.
   */
  flush(bird, time, x, z) {
    const spot = { ...this.standingPlace(bird, time, scratchPlace) };   // where it stands now (it may have walked)
    const ways = STANDING[bird.kind];
    const fromEyeX = spot.x - EYE.x, fromEyeZ = spot.z - EYE.z, fromEye = Math.hypot(fromEyeX, fromEyeZ);
    const fromThingX = spot.x - x, fromThingZ = spot.z - z;
    let acrossX = -fromEyeZ / fromEye, acrossZ = fromEyeX / fromEye;
    const thingSide = acrossX * fromThingX + acrossZ * fromThingZ;
    if (thingSide < 0 || (thingSide === 0 && hashed(bird.seed, Math.floor(time * 10), 4) < 0.5)) { acrossX = -acrossX; acrossZ = -acrossZ; }
    let awayX = acrossX + 0.45 * fromEyeX / fromEye, awayZ = acrossZ + 0.45 * fromEyeZ / fromEye;
    const length = Math.hypot(awayX, awayZ);
    awayX /= length; awayZ /= length;
    const { far, climb } = ways.flush;
    // From its feet, a short hop up and forward, then out and up along `away`.
    const start = [spot.x, spot.y + BIRD_KINDS[bird.kind].stand, spot.z];
    bird.flight = {
      points: [start, [spot.x + awayX * 2.2, spot.y + 2.2, spot.z + awayZ * 2.2], [spot.x + awayX * far * 0.6, spot.y + climb * 0.55, spot.z + awayZ * far * 0.6], [spot.x + awayX * far, spot.y + climb, spot.z + awayZ * far]],
    };
    bird.mode = 'flee';
    bird.since = time;
    bird.fleeHeading = spot.heading;   // it turns from where it faced as it springs off
    bird.returnAt = time + ways.flush.crouch + ways.flush.flight + between(ways.away.absent, hashed(bird.groupSeed, Math.floor(time * 10), 3));
    for (const other of this.birds) if (other.group === bird.group && other.mode === 'stand') this.flush(other, time, x, z);
  }

  /** Bring a standing bird back at `time`: a glide in from one side (its group's), to its spot, ending along its heading. */
  land(bird, time) {
    const { spot } = bird;
    const side = hashed(bird.groupSeed, Math.floor(time * 10), 5) < 0.5 ? 1 : -1;
    const { from, high } = STANDING[bird.kind].land;
    // Out behind it along the bank, a little off to one side (so it crosses the eye's view, side on); in along its
    // heading for the last few metres, coming down.
    const headingX = Math.cos(spot.heading), headingZ = -Math.sin(spot.heading);
    const outX = -headingX * 0.9 + side * headingZ * 0.35, outZ = -headingZ * 0.9 - side * headingX * 0.35;
    const length = Math.hypot(outX, outZ);
    const stand = BIRD_KINDS[bird.kind].stand;
    const start = [spot.x + (outX / length) * from, spot.y + stand + high, spot.z + (outZ / length) * from - from * 0.15];
    bird.flight = {
      points: [start, [spot.x + (outX / length) * from * 0.6, spot.y + stand + high * 0.7, spot.z + (outZ / length) * from * 0.6 - from * 0.1], [spot.x - headingX * 3.2, spot.y + stand + 0.7, spot.z - headingZ * 3.2], [spot.x, spot.y + stand, spot.z]],
    };
    bird.mode = 'land';
    bird.since = time;
  }

  /** Every bird posed at `time` (src/main.js, once a frame): its pose. */
  showAt(time) {
    for (const bird of this.birds) {
      if (bird.habit === 'visit') this.poseVisit(bird, time);
      else this.poseStanding(bird, time);
      if (this.dark) bird.pose.shown = false;
    }
  }

  /**
   * A visitor's visit `index` from `start` (s from when the place was shown): its path (a cubic B-spline through
   * control points drawn from its seed and the index, in the view's terms: bearing right of the home view's line,
   * distance from the eye, height over the water; see BIRDS_BY_PLACE), its speed, its length, and how long it lasts.
   * Its ends are out of the frame to either side, so the bird flies in and out of view; between them every turn is
   * smooth (the spline is C2, so its curvature and with it the bird's bank never jump).
   */
  makeVisit(visitor, index, start) {
    const { group } = visitor;
    const random = seededRandom(visitor.seed, index, 31);
    const range = (pair) => between(pair, random());
    const signed = (most) => (random() * 2 - 1) * most;
    const styles = Object.entries(group.styles);
    let pick = random() * styles.reduce((sum, [, weight]) => sum + weight, 0), style = styles[0][0];
    for (const [name, weight] of styles) { if (pick < weight) { style = name; break; } pick -= weight; }
    const side = random() < 0.5 ? 1 : -1;   // in from the right (1) or the left
    const speed = visitor.cruise * (0.85 + 0.3 * random());
    const [near, far] = group.distance;
    // A point by bearing (degrees right of the home view's line), distance and height; kept under the frame's top
    // (CEILING, but for a thermal's last turns: `free`) and out of reach.
    const points = [];
    const at = (bearing, distance, height, free = false) => {
      const radians = THREE.MathUtils.degToRad(bearing);
      const clampedDistance = Math.max(distance, near * 0.9);
      const ceiling = free ? Infinity : EYE_HEIGHT + clampedDistance * Math.tan(CEILING);
      points.push([EYE.x + Math.sin(radians) * clampedDistance, Math.min(height, ceiling), EYE.z - Math.cos(radians) * clampedDistance]);
    };
    const middle = () => group.aim + signed(group.spread);
    at(side * (OUT + random() * 8), range(group.distance), range(group.height));
    if (style === 'cross') {
      // Over, by two to three places strung across the view, each nearer or farther, higher or lower.
      // Each a step nearer or farther than the one before, smaller the faster it flies (a fast bird turns wide).
      const stops = 2 + Math.floor(random() * 2), wander = 14 * Math.min(1, 10 / speed);
      let distance = range(group.distance);
      for (let stop = 1; stop <= stops; stop++) {
        const share = stop / (stops + 1);
        distance = THREE.MathUtils.clamp(distance + signed(wander), near, far);
        at(side * (OUT - 2 * OUT * share) * 0.75 + group.aim * (1 - Math.abs(2 * share - 1)) + signed(6), distance, range(group.height));
      }
      at(-side * (OUT + random() * 8), range(group.distance), range(group.height));
    } else if (style === 'turn') {
      // In, out over the water and round (half a circle the far way, as wide as its speed asks at a bank of 20° to
      // 35°), and back out the side it came in, nearer or farther than it came.
      const apex = THREE.MathUtils.degToRad(middle());
      const radius = turnRadius(speed, 20 + random() * 15);
      const inner = between([near, (near + far) / 2], random());
      const aheadX = Math.sin(apex), aheadZ = -Math.cos(apex), rightX = Math.cos(apex), rightZ = Math.sin(apex);
      const centreX = EYE.x + aheadX * (inner + radius), centreZ = EYE.z + aheadZ * (inner + radius);
      at(side * 32 + signed(6), inner + random() * 10, range(group.height));
      const low = range(group.height), high = range(group.height);
      for (let step = 0; step <= 4; step++) {
        // From the circle's near point, round by its far side (away from where it came in), to its far point.
        const angle = Math.PI * step / 4;
        const towardEye = Math.cos(angle), awaySide = Math.sin(angle);
        points.push([centreX - aheadX * radius * towardEye - side * rightX * radius * awaySide, low + (high - low) * step / 4, centreZ - aheadZ * radius * towardEye - side * rightZ * radius * awaySide]);
      }
      // Out along the circle's far side's line (no nearer than its middle, so it never doubles back).
      const outward = inner + radius * (1 + random());
      at(side * 34 + signed(4), outward, range(group.height));
      at(side * (OUT + random() * 8), outward + signed(10), range(group.height));
    } else {
      // Circling: in to a thermal, round it one and a half to three times (eight points a turn), drifting with the
      // wind and rising a few metres a turn, then off to either side, high.
      const centreBearing = middle(), centreDistance = between([near + 15, far - 5], random());
      const radius = turnRadius(speed * 0.85, 25 + random() * 13), turns = 1.5 + random() * 1.5, way = random() < 0.5 ? 1 : -1;
      const radians = THREE.MathUtils.degToRad(centreBearing);
      const centre = [EYE.x + Math.sin(radians) * centreDistance, EYE.z - Math.cos(radians) * centreDistance];
      const drift = [signed(6), signed(4)];
      const base = range(group.height), climb = 1.5 + random() * 2;
      // Into the circle along the way it came (its first point where the circle's tangent runs from where it came
      // in toward the middle), round, and out where the tangent runs toward the side it leaves by.
      const approach = Math.atan2(centre[1] - points[0][2], centre[0] - points[0][0]);
      const from = approach - way * Math.PI / 2;
      const exit = random() < 0.5 ? side : -side;
      let count = Math.round(turns * 8);
      // The tangent at a step's angle is (−sin, cos)·way; across the view is about ±x.
      while (-Math.sin(from + way * count * Math.PI / 4) * way * exit < 0.7) count++;
      for (let step = 0; step <= count; step++) {
        const share = step / 8;
        const angle = from + way * share * Math.PI * 2;
        const height = base + climb * share;
        points.push([centre[0] + drift[0] * share + Math.cos(angle) * radius, height, centre[1] + drift[1] * share + Math.sin(angle) * radius]);
      }
      const last = points[points.length - 1];
      at(exit * 35, Math.hypot(last[0] - EYE.x, last[2] - EYE.z), last[1] + 1, true);
      at(exit * (OUT + random() * 8), range(group.distance), last[1] + 2, true);
    }
    const path = splinePath(points);
    const flown = style === 'circle' ? speed * 0.85 : speed;   // slower round a thermal
    return { index, style, start, speed: flown, path, length: path.length, duration: path.length / flown, thermal: style === 'circle' };
  }

  /**
   * The visit of `visitor` under way at `local` (s from when the place was shown) for a bird `lag` m behind its
   * leader, or null between visits. Visits are made in order (each `gap` after the one before has left, its whole
   * flock with it) and the few lately made are kept: the same at any frame rate, as each is drawn from its index.
   */
  visitAt(visitor, local, lag) {
    if (local < 0) return null;
    const { visits, group } = visitor;
    if (!visits.length || local < visits[0].start) {
      visits.length = 0;
      visits.push(this.makeVisit(visitor, 0, hashed(visitor.seed, 0, 32) * group.first));
    }
    for (let last = visits[visits.length - 1]; last.start + last.duration + visitor.lagMost / last.speed <= local; last = visits[visits.length - 1]) {
      const gap = between(group.gap, hashed(visitor.seed, last.index + 1, 32));
      visits.push(this.makeVisit(visitor, last.index + 1, last.start + last.duration + visitor.lagMost / last.speed + gap));
      if (visits.length > 4) visits.shift();
    }
    for (const visit of visits) {
      const along = (local - visit.start) * visit.speed - lag;
      if (along >= 0 && along <= visit.length) return { visit, along };
    }
    return null;
  }

  poseVisit(bird, time) {
    const { pose, visitor } = bird;
    const kind = BIRD_KINDS[bird.kind];
    const lag = bird.rank * (visitor.group.spacing ?? 0);
    const found = this.visitAt(visitor, time - visitor.since, lag);
    pose.phase = 2 * Math.PI * kind.beat * time + bird.phaseOffset;
    pose.fold = 0;
    pose.neck = 0;
    pose.legs = 0;
    pose.crouch = 0;
    pose.flying = true;
    pose.shown = Boolean(found);
    bird.style = found?.visit.style ?? null;
    if (!found) {
      // Between visits, nowhere in particular, but the same at any frame rate (its last frame's place would not be).
      pose.x = EYE.x; pose.y = 0; pose.z = EYE.z; pose.heading = 0; pose.pitch = 0; pose.bank = 0; pose.beat = 0; pose.look = 0;
      return;
    }
    const { visit, along } = found;
    const sample = sampleAt(visit.path, along, scratchSample);
    const { velocity } = sample;
    const level = Math.hypot(velocity.x, velocity.z);
    pose.x = sample.position.x; pose.y = sample.position.y; pose.z = sample.position.z;
    if (bird.rank) {
      // Strung out to one side and the other of the leader's line, a little higher or lower, bobbing.
      const aside = (bird.rank % 2 ? 1 : -1) * Math.ceil(bird.rank / 2) * visitor.group.spacing * 0.45;
      pose.x += (-velocity.z / level) * aside;
      pose.z += (velocity.x / level) * aside;
      pose.y += 0.25 * Math.sin(bird.rank * 2.1) + 0.12 * Math.sin(time * 0.9 + bird.rank);
    }
    pose.heading = Math.atan2(-velocity.z, velocity.x);
    pose.pitch = Math.atan2(velocity.y, level) * 0.6;
    // Banked into its turn as a glider is: tan(bank) = v²·(the heading's turn a metre)/g, a right turn (its heading
    // falling) banking right.
    pose.bank = THREE.MathUtils.clamp(-Math.atan(visit.speed * visit.speed * sample.turn / GRAVITY), -BANK_MOST, BANK_MOST);
    const flapping = FLAPPING[kind.flapping];
    // Beating as its kind does, and to climb (not in a thermal: the air lifts it).
    const climbRate = visit.speed * velocity.y / Math.max(Math.hypot(level, velocity.y), 1e-9);
    pose.beat = flapping.steady ? 1 : Math.min(1, this.flapBout(bird, time, flapping) + (visit.thermal ? 0 : Math.max(climbRate, 0) * flapping.climb));
    pose.look = 0.25 * Math.sin(time * 0.37 + bird.seed);   // it looks about as it goes, a little
  }

  /** How hard a bird beats at `time` from its bouts alone (its kind's FLAPPING), 0 to 1. */
  flapBout(bird, time, flapping) {
    const { window, share, least, most, ease } = flapping;
    const shifted = time + bird.flapOffset;
    const spell = Math.floor(shifted / window);
    if (hashed(bird.seed, spell, 1) >= share) return 0;
    const length = between([least, most], hashed(bird.seed, spell, 2));
    const into = shifted - spell * window;
    return smoother(0, ease, into) * (1 - smoother(length - ease, length, into));
  }

  poseStanding(bird, time) {
    const { pose, spot } = bird;
    const kind = BIRD_KINDS[bird.kind];
    const ways = STANDING[bird.kind];
    const since = time - bird.since;
    pose.shown = bird.mode !== 'away';
    pose.phase = 2 * Math.PI * kind.beat * time;
    pose.crouch = 0;
    if (bird.mode === 'stand') {
      this.standing(bird, time);
      return;
    }
    if (bird.mode === 'flee') {
      const { crouch, flight, hard, legsUp, neckIn } = ways.flush;
      if (since < crouch) {
        // It crouches, its neck drawn in, its wings starting to open.
        this.standing(bird, bird.since);
        const share = smoother(0, crouch, since);
        pose.crouch = share;
        pose.neck *= 1 - 0.7 * share;
        pose.fold = 1 - 0.5 * share;
        return;
      }
      const flying = since - crouch;
      const share = Math.min(flying / flight, 1);
      // Off from a standstill, faster and faster.
      const along = share ** 1.25;
      this.flyAlong(bird, along, Math.min(along + 0.01, 1), along > 0.99);
      pose.heading = bird.fleeHeading + turnBetween(bird.fleeHeading, pose.heading) * smoother(0, 0.45, flying);
      // Off the bed: its feet leave the water as it springs, so its middle starts where its standing middle was.
      pose.beat = 1 - 0.45 * smoother(hard, hard + 2, flying);
      pose.crouch = 1 - smoother(0, 0.2, flying);   // springing up out of its crouch
      pose.walking = 0;
      pose.strike = 0;
      pose.fold = 0.5 * (1 - smoother(0, 0.25, flying));
      pose.legs = 1 - smoother(0.15, legsUp, flying);
      pose.neck = 0.3 * (1 - smoother(0, neckIn, flying));
      pose.look = 0;
      // Out of sight over the garden: gone the moment it is far enough (the Koi pond's land ends at 35 m: src/sky.js backdrop).
      if (share >= 1) pose.shown = false;
      return;
    }
    if (bird.mode === 'land') {
      const { glide, flare } = ways.land;
      const share = Math.min(since / glide, 1);
      // Slowing all the way in.
      const along = 1 - (1 - share) ** 1.5;
      this.flyAlong(bird, along, Math.min(along + 0.01, 1), false);
      const toLand = glide - since;
      const flaring = 1 - smoother(0, flare, toLand);
      // Gliding in, a few beats now and then, then the flare: wings forward and beating hard, body up, legs down.
      const glideBeats = 0.6 * Math.max(0, Math.sin(time * 0.9 + bird.seed)) ** 4;
      pose.beat = Math.max(glideBeats, flaring);
      pose.pitch += flaring * THREE.MathUtils.degToRad(28);
      pose.legs = 1 - smoother(flare * 0.3, flare + 0.8, toLand);
      pose.neck = 0.35 * flaring;
      pose.fold = 0;
      pose.look = 0;
      pose.walking = 0;
      pose.strike = 0;
      return;
    }
    // Away: unseen.
    pose.x = spot.x; pose.y = spot.y; pose.z = spot.z;
  }

  /** A heron in flight `along` its flight's curve (0 to 1): its body's middle there, heading and pitch along it. */
  flyAlong(bird, along, ahead, last) {
    const { pose } = bird;
    const here = bezier(bird.flight.points, along, { x: 0, y: 0, z: 0 });
    const next = bezier(bird.flight.points, last ? along : ahead, { x: 0, y: 0, z: 0 });
    const behind = last ? bezier(bird.flight.points, along - 0.01, { x: 0, y: 0, z: 0 }) : here;
    const dx = next.x - behind.x, dy = next.y - behind.y, dz = next.z - behind.z;
    pose.x = here.x; pose.y = here.y; pose.z = here.z;
    if (Math.hypot(dx, dz) > 1e-6) pose.heading = Math.atan2(-dz, dx);
    pose.pitch = 0.5 * Math.atan2(dy, Math.hypot(dx, dz));
    pose.bank = 0;
    // `y` is its body's middle in flight; standing, its feet: the meshes put the body over the feet by its legs.
    pose.flying = true;
  }

  /**
   * Where a standing bird is at `time` and which way it faces: at its spot, or walking along the bank to another (its
   * kind's `walk`) or there, from when it began to stand (bird.standSince). Each spell's place is drawn from its seed
   * and the spell's number (the first's its own spot), so it is the same at any frame rate. Also how far it is along
   * its walk (m, for its stride) and how much it is walking.
   */
  standingPlace(bird, time, out) {
    const { spot } = bird;
    const walk = STANDING[bird.kind].walk;
    out.x = spot.x; out.z = spot.z; out.heading = spot.heading; out.walked = 0; out.walking = 0; out.spell = 0; out.walks = false; out.walkEnds = 0;
    if (!walk) { out.y = spot.y; return out; }
    const since = time - bird.standSince;
    const spell = Math.max(0, Math.floor(since / walk.every));
    const offsetOf = (index) => (index <= 0 ? 0 : walk.spots[Math.floor(hashed(bird.seed, index, 11) * walk.spots.length)]);
    const from = offsetOf(spell - 1), to = offsetOf(spell);
    const into = since - spell * walk.every;
    // Along the bank (the pond's tangent at the spot), the way that runs to the eye's right.
    const tangentX = -(spot.z - KOI_SHORE.centre[1]), tangentZ = spot.x - KOI_SHORE.centre[0];
    const tangentLength = Math.hypot(tangentX, tangentZ);
    const alongX = tangentX / tangentLength, alongZ = tangentZ / tangentLength;
    const distance = Math.abs(to - from), way = Math.sign(to - from);
    let offset = from;
    out.spell = spell;
    out.walks = distance > 0.01;
    out.walkEnds = out.walks ? distance / walk.speed + 2 * walk.turn : 0;   // s into the spell it has walked and turned back
    if (out.walks) {
      const duration = distance / walk.speed;
      const going = into - walk.turn;
      // Turned to go, walked (eased in and out over its first and last steps), turned back.
      const walkHeading = Math.atan2(-alongZ * way, alongX * way);
      const turnedTo = smoother(0, walk.turn, into), turnedBack = smoother(walk.turn + duration, 2 * walk.turn + duration, into);
      out.heading = spot.heading + turnBetween(spot.heading, walkHeading) * (turnedTo - turnedBack);
      const ease = 0.6 / duration;   // a share of the walk spent getting going and stopping
      const share = THREE.MathUtils.clamp(going / duration, 0, 1);
      // Distance along: constant speed with its ends eased (a smootherstep blended in over `ease`).
      const eased = share < ease ? share * share / (2 * ease * (1 - ease)) : share > 1 - ease ? 1 - (1 - share) * (1 - share) / (2 * ease * (1 - ease)) : (share - ease / 2) / (1 - ease);
      out.walked = eased * distance;
      offset = from + way * out.walked;
      out.walking = smoother(-0.25, 0.25, going) * (1 - smoother(duration - 0.25, duration + 0.25, going));
    }
    out.x = spot.x + alongX * offset;
    out.z = spot.z + alongZ * offset;
    out.y = bird.habit === 'wade' ? -koiFloorDepthAt(out.x, out.z) : spot.y;
    return out;
  }

  /** A bird standing (or crouching to go, frozen at `time`): its place, its wings folding as it lands, its idle ways. */
  standing(bird, time) {
    const { pose } = bird;
    const ways = STANDING[bird.kind];
    const { slot, turn, looks, necks, still } = ways.idle;
    const since = time - bird.standSince;
    const place = this.standingPlace(bird, time, scratchPlace);
    pose.x = place.x; pose.y = place.y; pose.z = place.z;
    pose.heading = place.heading;
    pose.pitch = ways.tilt;
    pose.bank = 0;
    pose.flying = false;
    pose.legs = 1;
    pose.beat = 0;
    pose.crouch = 0;
    pose.fold = smoother(0, ways.land.fold, time - bird.foldSince);
    // Walking: its stride's phase from how far it has gone (two steps a stride), so its feet never slide.
    pose.walking = place.walking;
    pose.stride = place.walked / (2 * STEP_LENGTH);
    // Its idle spells: in each it may turn its head and set its neck at the spell's start, then holds still.
    const spell = Math.floor(time / slot);
    const target = (index) => {
      // A spell that changes nothing keeps the one before's (up to a few back).
      let at = index;
      for (let back = 0; back < 4 && hashed(bird.seed, at, 7) < still; back++) at--;
      return { look: (hashed(bird.seed, at, 8) * 2 - 1) * looks, neck: necks[Math.floor(hashed(bird.seed, at, 9) * necks.length)] };
    };
    const from = target(spell - 1), to = target(spell);
    const share = smoother(0, turn, time - spell * slot);
    let look = from.look + (to.look - from.look) * share;
    let neck = from.neck + (to.neck - from.neck) * share;
    // Walking, it looks ahead, its neck at its ease.
    look *= 1 - place.walking;
    neck += (0.5 - neck) * place.walking;
    // A strike at a fish, once it has walked if it walks (its kind's `strike`): neck coiled back and low, thrown
    // forward into the water, held, brought back up.
    pose.strike = 0;
    const strike = ways.strike;
    if (strike && place.walkEnds < strike.at - 0.3 && place.spell > 0 && hashed(bird.seed, place.spell, 12) < strike.share) {
      const into = since - place.spell * ways.walk.every - strike.at;
      const coiled = smoother(0, strike.coil, into) * (1 - smoother(strike.coil, strike.coil + strike.throw, into));
      const thrown = smoother(strike.coil, strike.coil + strike.throw, into) * (1 - smoother(strike.coil + strike.throw + strike.hold, strike.coil + strike.throw + strike.hold + strike.back, into));
      neck += (0.15 - neck) * coiled;
      look *= 1 - Math.max(coiled, thrown);
      pose.crouch = 0.35 * coiled + 0.2 * thrown;
      pose.strike = thrown;
    }
    // A splash in sight: up and looking, for a while, then back to its spells.
    const { hold, turn: alertTurn } = ways.alert;
    const alerted = smoother(0, alertTurn, time - bird.alertAt) * (1 - smoother(hold, hold + 1, time - bird.alertAt));
    look += (bird.alertToward - look) * alerted;
    neck += (1 - neck) * alerted;
    pose.strike *= 1 - alerted;
    pose.pitch = ways.tilt - 0.3 * pose.strike;   // tipped forward into its strike
    pose.look = look;
    pose.neck = neck;
    // Resting, its head tucked in, until a splash makes it look (src/birdSprites.js draws it so).
    pose.posture = alerted > 0.5 ? 'stand' : bird.group.postures?.[bird.index] ?? 'stand';
    void since;
  }

  /** What tools and probes read: each bird's kind, mode and pose. */
  report() {
    return this.birds.map((bird) => ({ kind: bird.kind, habit: bird.habit, mode: bird.mode ?? (bird.pose.shown ? 'visiting' : 'away'), style: bird.style ?? null, since: bird.since ?? null, returnAt: bird.returnAt ?? null, ...bird.pose, spot: bird.spot ? { ...bird.spot } : null }));
  }
}
