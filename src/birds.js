// The birds (src/main.js; drawn by src/birdSprites.js): who flies over each
// place, and how. They are scenery, as the fish are: nothing thrown meets
// them, they touch neither the splash nor the water's waves, and they never
// come within reach of a throw. A thing thrown near a heron puts it up.
//
// Who lives where (BIRDS_BY_PLACE): a bird of every place, of where its
// photograph was taken (Poly Haven's coordinates), a few done well.
//   - Rocky cove (Cape Town's Atlantic shore): three kelp gulls working the
//     water out past the rocks, in long loose loops, mostly gliding, now and
//     then a few wingbeats (patrol). Loch Ness: three herring gulls, so.
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
//   - Lakeside (Sterkfontein Dam): an African fish eagle working the open
//     water low; Harbour, on the same dam: a string of sacred ibises crossing
//     now and then (pass); Mesas, the hill over it: a pair of Egyptian geese
//     crossing. Highlands (the eastern Free State): a grey heron flying over.
//   - Desert oasis (the Richtersveld): a Verreaux's eagle, gliding along
//     under the koppies. Swiss Alps (Lago d'Isola): two ravens. Wooded lake
//     (Radków): a pair of mute swans crossing. The Polynesian lagoon: two
//     great frigatebirds, hardly ever beating their wings (patrol, soaring).
//   - None at night (setConditions: the sun more than NIGHT_SUN below the
//     horizon).
//
// How they move. A patrolling bird's loop is closed form in time (gullAt):
// its middle drifts slowly over the water, it goes round an ellipse across
// the line of sight, rising and falling twice a loop, banking into its turn
// as a glider does (tan(bank) = v·ω/g), and flaps as its kind does
// (FLAPPING: in bouts drawn from its seed and the time, flapBout, and
// whenever it climbs). A passing flock's crossings are closed form too
// (passAt): windows of time, each crossing's line and height drawn from the
// flock's seed and the window. A standing bird's state (`mode`) is changed
// only in the physics steps (step, startle: src/main.js), and each frame
// poses every bird at the frame's time (showAt), so a seeded game goes
// alike at any frame rate (tools/frame-rate-probe.mjs). Their randomness is
// their own seeded stream (seededRandom), never Math.random, so seeded
// throws stay as they were.
//
// A pose (`pose`, from which src/birdSprites.js chooses its picture): where it
// is (x, y, z: its body's middle, or for a bird standing its feet), its
// heading, pitch and bank (rad), its wingbeat's phase and how hard it beats
// (beat, 0 to 1), how far its wings are folded (fold, 1 folded on its back),
// its neck (neck: 0 drawn in onto its shoulders, 1 stretched up), its head's
// turn (look, rad), its legs (legs: 0 trailing behind, 1 standing), how far
// it is crouched (crouch, 0 to 1) and whether it is seen at all (shown).
import * as THREE from 'three';
import { seededRandom } from './spray.js';
import { KOI_SHORE, koiShoreRadius, koiFloorDepthAt } from './pondFloor.js';

const GRAVITY = 9.81;
const NIGHT_SUN = THREE.MathUtils.degToRad(4);   // the sun this far below the horizon: no bird is about
const EYE = { x: 0, z: 2.45 };   // the shore's eye (src/main.js VIEWS.shore): where the gulls' loops are laid out from

// How a kind flaps (flapBout): its time cut into `window`-second spells, and in `share` of them a bout of `least` to
// `most` seconds of beating from the spell's start, eased in and out over `ease`; and it beats while it climbs,
// `climb` of full beating a m/s of climb. `steady`: it beats all the time (a goose, a swan, a crow going somewhere).
const FLAPPING = {
  gull: { window: 5.5, share: 0.4, least: 1.2, most: 2.6, ease: 0.35, climb: 1.4 },   // glides, a few beats now and then
  soaring: { window: 12, share: 0.18, least: 0.8, most: 1.6, ease: 0.3, climb: 0.5 },   // an eagle: a few beats in a minute
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
  heron: { name: 'Grey heron', span: 1.75, length: 0.95, beat: 2.2, cruise: 9, flapping: 'steady', stand: 0.62 },
  goose: { name: 'Egyptian goose', span: 1.45, length: 0.7, beat: 3.8, cruise: 14, flapping: 'steady', stand: 0.32 },
  ibis: { name: 'African sacred ibis', span: 1.15, length: 0.7, beat: 3.6, cruise: 12, flapping: 'corvid', stand: 0 },
  fishEagle: { name: 'African fish eagle', span: 2.1, length: 0.72, beat: 2.2, cruise: 10, flapping: 'soaring', stand: 0 },
  eagle: { name: "Verreaux's eagle", span: 2.1, length: 0.85, beat: 2.0, cruise: 11, flapping: 'soaring', stand: 0 },
  raven: { name: 'Common raven', span: 1.2, length: 0.62, beat: 3.4, cruise: 10, flapping: 'corvid', stand: 0 },
  swan: { name: 'Mute swan', span: 2.2, length: 1.45, beat: 2.9, cruise: 15, flapping: 'steady', stand: 0 },
  frigate: { name: 'Great frigatebird', span: 2.2, length: 0.95, beat: 1.6, cruise: 9, flapping: 'frigate', stand: 0 },
};

// Each place's birds (src/places.js PLACES): how many of which kind and their habit.
//   patrol: `distance` (m from the shore's eye to the middle of a loop), `bearing` (degrees either side of the home
//     view's line, or of `aim` degrees to its right: where the view shows open sky or water behind it), `across` and `depth` (m: the loop's half-widths, across the line of sight and along it), `height`
//     (m above the water) and `swing` (m it rises and falls), `drift` (m its middle wanders).
//   pass: now and then the group crosses the view together, one behind another, going somewhere: its time cut into
//     `every`-second windows from when the place was shown (reset), the first always with a crossing early in it (so
//     one comes soon after arriving), in `share` of the rest one at a time in the window drawn from its seed, along a
//     straight line across the line of sight at `distance` m from the eye, `bearing` degrees either side of the home
//     view's line, `height` m up, from `reach` times its distance out to one side to as far out the other (out of
//     the frame both ends), rising or falling up to `climb` m over it; each bird `spacing` m behind the one before
//     and a little to one side, as a small flock strings out.
//   wade: `angle` (rad about the pond's centre, KOI_SHORE) and `offshore` (m out from the waterline) where it stands,
//     `heading` (rad from +x, turning toward −z) which way it faces: side on to the home view, so its outline reads.
//   graze: on dry ground `ground` m up, each bird at its own `spots` [x, z, heading] and in its own `postures` (stand,
//     or rest: its head tucked in, until something makes it look); the group goes together when one is put up, and
//     comes back together. Standing (wade or graze), a bird's ways are its kind's STANDING.
// Each a bird of where its photograph was taken (Poly Haven's places: the header), low enough to be in the home view's
// sky (under FRAME_TOP in tools/bird-probe.mjs) and out of a throw's reach.
export const BIRDS_BY_PLACE = {
  cove: [{ kind: 'kelp', habit: 'patrol', count: 3, distance: [34, 52], bearing: 18, across: [9, 13], depth: [7, 11], height: [1.8, 2.8], swing: [0.25, 0.5], drift: [3, 6] }],
  loch: [{ kind: 'herring', habit: 'patrol', count: 3, distance: [36, 54], bearing: 18, across: [9, 13], depth: [7, 11], height: [1.8, 2.8], swing: [0.25, 0.5], drift: [3, 6] }],
  koi: [{ kind: 'heron', habit: 'wade', count: 1, angle: 4.3, offshore: 0.1, heading: -2.85 }],   // in 12 cm of water: to mid-shin
  lagoon: [{ kind: 'frigate', habit: 'patrol', count: 2, distance: [60, 85], bearing: 20, across: [14, 20], depth: [8, 10], height: [3, 4.5], swing: [0.5, 1], drift: [3, 6] }],
  swiss: [{ kind: 'raven', habit: 'patrol', count: 2, distance: [40, 60], bearing: 16, across: [8, 12], depth: [6, 9], height: [2, 3.2], swing: [0.3, 0.7], drift: [3, 6] }],
  desert: [{ kind: 'eagle', habit: 'patrol', count: 1, distance: [70, 95], bearing: 14, across: [14, 20], depth: [8, 12], height: [3.5, 4.5], swing: [0.5, 1], drift: [4, 8] }],
  lakeside: [{ kind: 'fishEagle', habit: 'patrol', count: 1, distance: [60, 85], aim: 22, bearing: 6, across: [8, 12], depth: [8, 12], height: [2.5, 4], swing: [0.6, 1.2], drift: [4, 8] }],
  wooded: [{ kind: 'swan', habit: 'pass', count: 2, every: 30, share: 0.75, distance: [35, 60], bearing: 15, height: [1.5, 3.5], reach: 1.25, climb: 1.5, spacing: 4 }],
  harbour: [{ kind: 'ibis', habit: 'pass', count: 5, every: 30, share: 0.75, distance: [40, 70], bearing: 15, height: [2.5, 4.5], reach: 1.3, climb: 1.5, spacing: 3.5 }],
  mesas: [{ kind: 'goose', habit: 'pass', count: 2, every: 30, share: 0.75, distance: [35, 60], bearing: 15, height: [1.5, 3], reach: 1.3, climb: 1, spacing: 2.5 }],
  highlands: [{ kind: 'heron', habit: 'pass', count: 1, every: 40, share: 0.8, distance: [30, 50], bearing: 15, height: [1.5, 3], reach: 1.3, climb: 1, spacing: 0 }],
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
  tilt: THREE.MathUtils.degToRad(22),   // its body standing, nose up from level
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
      const flock = group.habit === 'pass' ? this.layFlock(group, stream) : null;
      let groupSeed = null;
      for (let index = 0; index < group.count; index++) {
        const bird = { kind: group.kind, habit: group.habit, group, index, pose: freshPose(), seed: Math.floor(stream() * 2 ** 31) };
        groupSeed ??= bird.seed;
        bird.groupSeed = groupSeed;   // a group's shared draws (when it comes back, from which side): its first bird's seed
        if (group.habit === 'patrol') this.layPatrol(bird, group, stream);
        else if (group.habit === 'pass') Object.assign(bird, { flock, rank: index, phaseOffset: stream() * Math.PI * 2 });
        else this.laySpot(bird, group);
        this.birds.push(bird);
      }
    }
    this.reset(0);
  }

  /** A patrolling bird's loop (gullAt): its middle, size, height, speed round, way round and where on it it starts. */
  layPatrol(bird, group, stream) {
    const kind = BIRD_KINDS[bird.kind];
    const distance = between(group.distance, stream());
    const bearing = THREE.MathUtils.degToRad((group.aim ?? 0) + (stream() * 2 - 1) * group.bearing);
    const across = between(group.across, stream()), depth = between(group.depth, stream());
    bird.loop = {
      middleX: EYE.x + Math.sin(bearing) * distance,
      middleZ: EYE.z - Math.cos(bearing) * distance,
      // Across the line of sight (to the right) and along it (away): the ellipse's axes.
      acrossX: Math.cos(bearing), acrossZ: Math.sin(bearing), alongX: Math.sin(bearing), alongZ: -Math.cos(bearing),
      across, depth,
      height: between(group.height, stream()), swing: between(group.swing, stream()),
      drift: between(group.drift, stream()), driftRates: [0.011 + 0.008 * stream(), 0.009 + 0.008 * stream()], driftPhases: [stream() * 6.28, stream() * 6.28],
      // Round at its cruising speed: an ellipse's perimeter is about π·(3(a + b) − sqrt((3a + b)(a + 3b))) (Ramanujan).
      rate: (stream() < 0.5 ? 1 : -1) * kind.cruise * (0.9 + 0.2 * stream()) * 2 * Math.PI / (Math.PI * (3 * (across + depth) - Math.sqrt((3 * across + depth) * (across + 3 * depth)))),
      start: stream() * Math.PI * 2,
      swingPhase: stream() * Math.PI * 2,
      flapOffset: stream() * (FLAPPING[kind.flapping].window ?? 1),
    };
  }

  /** A flock's crossings (passAt): its seed, its windows, the ranges each crossing is drawn from, its speed. */
  layFlock(group, stream) {
    const kind = BIRD_KINDS[group.kind];
    return {
      seed: Math.floor(stream() * 2 ** 31),
      every: group.every, share: group.share, since: 0,
      distance: group.distance, bearing: THREE.MathUtils.degToRad(group.bearing), height: group.height, reach: group.reach, climb: group.climb,
      spacing: group.spacing, count: group.count,
      speed: kind.cruise * (0.9 + 0.2 * stream()),
      flapOffset: stream() * (FLAPPING[kind.flapping].window ?? 1),
    };
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

  /** Every bird as it starts at `time`: one that stands, standing at its spot; a passing flock's windows from now. */
  reset(time) {
    this.disturbed = -Infinity;
    for (const bird of this.birds) {
      if (bird.flock) bird.flock.since = time;
      if (!STANDING_HABITS.has(bird.habit)) continue;
      bird.mode = 'stand';
      bird.since = time - STANDING[bird.kind].land.fold;   // standing a while already: its wings folded
      bird.alertAt = -Infinity;
      bird.alertToward = 0;
      bird.returnAt = Infinity;
      bird.flight = null;
    }
  }

  /** Whether the birds are out: none while it is dark (the sun's direction, src/main.js lighting). */
  setConditions({ sunDirection }) {
    this.dark = sunDirection.y < -Math.sin(NIGHT_SUN);
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
    const { spot } = bird;
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
      if (bird.habit === 'patrol') this.poseGull(bird, time);
      else if (bird.habit === 'pass') this.posePass(bird, time);
      else this.poseStanding(bird, time);
      if (this.dark) bird.pose.shown = false;
    }
  }

  /** Where a gull is on its loop at `time` (into `out`, its body's middle). */
  gullAt(loop, time, out) {
    const angle = loop.start + loop.rate * time;
    const driftAcross = loop.drift * Math.sin(loop.driftRates[0] * time + loop.driftPhases[0]);
    const driftAlong = 0.6 * loop.drift * Math.sin(loop.driftRates[1] * time + loop.driftPhases[1]);
    const across = loop.across * Math.cos(angle) + driftAcross, along = loop.depth * Math.sin(angle) + driftAlong;
    out.x = loop.middleX + loop.acrossX * across + loop.alongX * along;
    out.z = loop.middleZ + loop.acrossZ * across + loop.alongZ * along;
    out.y = loop.height + loop.swing * Math.sin(2 * angle + loop.swingPhase);
    return out;
  }

  poseGull(bird, time) {
    const { pose, loop } = bird;
    const kind = BIRD_KINDS[bird.kind];
    const step = 0.05;
    const before = this.gullAt(loop, time - step, { x: 0, y: 0, z: 0 });
    const after = this.gullAt(loop, time + step, { x: 0, y: 0, z: 0 });
    this.gullAt(loop, time, pose);
    const velocityX = (after.x - before.x) / (2 * step), velocityY = (after.y - before.y) / (2 * step), velocityZ = (after.z - before.z) / (2 * step);
    const level = Math.hypot(velocityX, velocityZ);
    pose.heading = Math.atan2(-velocityZ, velocityX);
    pose.pitch = Math.atan2(velocityY, level) * 0.6;
    // Banked into the turn: tan(bank) = v·ω/g, ω its heading's rate (a turn to the right, its heading falling, banks right).
    const headingBefore = Math.atan2(-(pose.z - before.z), pose.x - before.x), headingAfter = Math.atan2(-(after.z - pose.z), after.x - pose.x);
    const turnRate = turnBetween(headingBefore, headingAfter) / step;
    pose.bank = THREE.MathUtils.clamp(-Math.atan(level * turnRate / GRAVITY), -BANK_MOST, BANK_MOST);
    const flapping = FLAPPING[kind.flapping];
    pose.beat = flapping.steady ? 1 : Math.min(1, this.flapBout(bird, time, flapping) + Math.max(velocityY, 0) * flapping.climb);
    pose.phase = 2 * Math.PI * kind.beat * time;
    pose.fold = 0;
    pose.neck = 0;
    pose.look = 0.25 * Math.sin(time * 0.37 + bird.seed);   // it looks about as it goes, a little
    pose.legs = 0;
    pose.crouch = 0;
    pose.shown = true;
  }

  /** How hard a bird beats at `time` from its bouts alone (its kind's FLAPPING), 0 to 1. */
  flapBout(bird, time, flapping) {
    const { window, share, least, most, ease } = flapping;
    const shifted = time + (bird.loop ?? bird.flock).flapOffset;
    const spell = Math.floor(shifted / window);
    if (hashed(bird.seed, spell, 1) >= share) return 0;
    const length = between([least, most], hashed(bird.seed, spell, 2));
    const into = shifted - spell * window;
    return smoother(0, ease, into) * (1 - smoother(length - ease, length, into));
  }

  /**
   * Where a bird of a passing flock is at `time` (into `out`, its body's middle), its heading and climb, and
   * whether it is crossing then: false between crossings.
   */
  passAt(bird, time, out) {
    const { flock } = bird;
    const longest = 2 * flock.reach * flock.distance[1] / flock.speed;
    const lagMost = (flock.count - 1) * flock.spacing / flock.speed;
    // Its own clock runs behind the leader's by its place in the line, so every bird of a crossing is in one window.
    const local = time - flock.since - bird.rank * flock.spacing / flock.speed;
    const window = Math.floor(local / flock.every);
    if (window < 0 || (window > 0 && hashed(flock.seed, window, 21) >= flock.share)) return false;
    const distance = between(flock.distance, hashed(flock.seed, window, 23));
    const duration = 2 * flock.reach * distance / flock.speed;
    const early = window === 0 ? 0.25 : 1;   // the first window's crossing in its first quarter
    const start = window * flock.every + early * hashed(flock.seed, window, 22) * Math.max(flock.every - longest - lagMost, 0);
    const along = (local - start) / duration;
    if (along < 0 || along > 1) return false;
    const bearing = (hashed(flock.seed, window, 24) * 2 - 1) * flock.bearing;
    const way = hashed(flock.seed, window, 26) < 0.5 ? 1 : -1;
    const climb = (hashed(flock.seed, window, 27) * 2 - 1) * flock.climb;
    // Across the line of sight (to the right, times its way) and along it (away from the eye).
    const acrossX = Math.cos(bearing) * way, acrossZ = Math.sin(bearing) * way;
    const alongX = Math.sin(bearing), alongZ = -Math.cos(bearing);
    const sideways = (along - 0.5) * 2 * flock.reach * distance;
    // Strung out to one side and the other, a little deeper or nearer by turns (the leader on the line).
    const aside = (bird.rank % 2 ? 1 : -1) * Math.ceil(bird.rank / 2) * flock.spacing * 0.45;
    out.x = EYE.x + alongX * (distance + aside) + acrossX * sideways;
    out.z = EYE.z + alongZ * (distance + aside) + acrossZ * sideways;
    out.y = between(flock.height, hashed(flock.seed, window, 25)) + climb * (along - 0.5) + 0.25 * Math.sin(bird.rank * 2.1) + 0.12 * Math.sin(time * 0.9 + bird.rank);
    out.heading = Math.atan2(-acrossZ, acrossX);
    out.pitch = Math.atan2(climb, 2 * flock.reach * distance);
    return true;
  }

  posePass(bird, time) {
    const { pose } = bird;
    const kind = BIRD_KINDS[bird.kind];
    pose.shown = this.passAt(bird, time, pose);
    // Between crossings, nowhere in particular, but the same at any frame rate (its last frame's place would not be).
    if (!pose.shown) { pose.x = EYE.x; pose.y = 0; pose.z = EYE.z; pose.heading = 0; pose.pitch = 0; }
    pose.bank = 0;
    const flapping = FLAPPING[kind.flapping];
    pose.beat = flapping.steady ? 1 : Math.min(1, this.flapBout(bird, time, flapping) + Math.max(pose.pitch, 0) * flapping.climb);
    pose.phase = 2 * Math.PI * kind.beat * time + bird.phaseOffset;
    pose.fold = 0;
    pose.neck = 0;
    pose.look = 0;
    pose.legs = 0;
    pose.crouch = 0;
    pose.flying = true;
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
      this.standing(bird, time, since);
      return;
    }
    if (bird.mode === 'flee') {
      const { crouch, flight, hard, legsUp, neckIn } = ways.flush;
      if (since < crouch) {
        // It crouches, its neck drawn in, its wings starting to open.
        this.standing(bird, bird.since, Infinity);
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
      // Off the bed: its feet leave the water as it springs, so its middle starts where its standing middle was.
      pose.beat = 1 - 0.45 * smoother(hard, hard + 2, flying);
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

  /** A heron standing at its spot, `since` s after it began to (its wings folding as it lands, its idle turns). */
  standing(bird, time, since) {
    const { pose, spot } = bird;
    const ways = STANDING[bird.kind];
    const { slot, turn, looks, necks, still } = ways.idle;
    pose.x = spot.x; pose.y = spot.y; pose.z = spot.z;
    pose.heading = spot.heading;
    pose.pitch = ways.tilt;
    pose.bank = 0;
    pose.flying = false;
    pose.legs = 1;
    pose.beat = 0;
    pose.fold = smoother(0, ways.land.fold, since);
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
    // A splash in sight: up and looking, for a while, then back to its spells.
    const { hold, turn: alertTurn } = ways.alert;
    const alerted = smoother(0, alertTurn, time - bird.alertAt) * (1 - smoother(hold, hold + 1, time - bird.alertAt));
    look += (bird.alertToward - look) * alerted;
    neck += (1 - neck) * alerted;
    pose.look = look;
    pose.neck = neck;
    // Resting, its head tucked in, until a splash makes it look (src/birdSprites.js draws it so).
    pose.posture = alerted > 0.5 ? 'stand' : bird.group.postures?.[bird.index] ?? 'stand';
    // Whether its pose is changing now (its mirror image is drawn again only then: src/main.js).
    pose.still = share >= 1 && (alerted === 0 || alerted === 1) && pose.fold >= 1;
  }

  /** What tools and probes read: each bird's kind, mode and pose. */
  report() {
    return this.birds.map((bird) => ({ kind: bird.kind, habit: bird.habit, mode: bird.mode ?? 'patrol', since: bird.since ?? null, returnAt: bird.returnAt ?? null, ...bird.pose, spot: bird.spot ? { ...bird.spot } : null }));
  }
}
