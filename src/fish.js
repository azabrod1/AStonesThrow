// The fish (src/main.js; drawn by src/fishMeshes.js): who lives in each
// place's water, and how they swim. They are scenery: they never touch the
// splash, the waves or the things thrown, except that a thing thrown makes
// them dart away and a thing they can eat brings them to it.
//
// Who lives where (FISH_BY_PLACE): each place's water has the fish such
// water holds, a few of each, in the company their kind keeps:
//   - Lakeside, a temperate lake: a school of minnows in the shallows, a
//     shoal of perch, and a pike alone, lying in wait.
//   - Swiss Alps, an Alpine lake: brown trout, each alone, and a few Arctic
//     char together, deeper.
//   - Highlands, a mountain loch: brown trout alone, minnows schooling.
//   - Mesas, a dam on the veld: a largemouth bass alone and a shoal of
//     bluegill.
//   - Desert oasis, a spring pool: a school of pupfish, the blue males and
//     the brown females together, and a shoal of tilapia.
//   - Rocky cove, the sea: a shoal of grey mullet and a wrasse on its own.
//   - The Koi pond (a pond in a Japanese garden, src/pondFloor.js KOI_SHORE):
//     koi of the classic varieties in one loose group, and a goldfish.
// A few of each, not many: each is drawn and moves with care.
//   - The Pool: none, chlorinated.
//
// The company a kind keeps (`company`): 'school', a tight school that turns
// together (minnows, pupfish: Partridge's schooling fish keep about a body
// length apart and line up with their neighbours); 'shoal', a looser group
// that keeps together but each fish its own heading (perch, char, bluegill,
// tilapia, mullet, koi); 'alone' (pike, trout, bass, wrasse), each fish on
// its own. A group follows a goal, a point in its water it wanders to, and
// now and then rests, hanging nearly still; its fish steer by the boids'
// three rules (Reynolds 1987: keep apart, line up, keep together), weighted
// by the company kept, toward the goal.
//
// Each fish is a heading, a pitch and a speed: it turns toward where its
// rules want it to go no faster than its kind's turn rate, speeds up and
// slows to its kind's cruise, and its tail beats at a frequency that goes
// with its speed (a fish's stride is about 0.6 to 0.7 of a body length a
// beat: Bainbridge 1958). Its water (setWaters) is a box in plan (the
// solver's patch in a lake, the basin in a pond) and, at each point, the
// depth of the bed; it keeps between its kind's depths, off the bed and off
// the surface (deeper under ice and a gale's waves: setConditions).
//
// Fright (startle, step's `threats`): a fish sees what is coming. A thing in
// the air coming down within ANTICIPATE seconds of the water, or one moving
// through the water, or a splash, or the finger dipping (src/main.js says
// which), startles every fish within its alarm radius, which grows with the
// thing's size and the fish's shyness: the fish turns away and bursts off
// for a second or so (a C-start, Domenici & Blake 1997: it whips round in a
// fraction of a second, then dashes, a few body lengths a second, at most
// BURST_MOST), diving, turned along a wall it meets rather than into it
// (alongWalls; and no fish's nose ever goes into a wall, keepFromWalls), and its group takes fright from it a moment
// later. Afterwards it stays wary for a few seconds, and will not feed. A
// thing lying still on the bed is only an obstacle to swim round.
//
// Food (step's `foods`): a kind that eats (`eats`) comes to something edible
// in the water (src/things.js `edible`: a pizza, a pie, fruit) within
// FEED.sense once it has settled and the fish is no longer wary, and its
// groupmates follow it there: up to FEEDERS at a time, each to
// the near side of it, at the surface under a floater or at a sunk one
// where it lies, and bites, backing off a little after each bite. step
// returns the bites; src/main.js counts them against the thing, which goes
// once eaten (as many bites as its mass says, edibleBites), and a bite at
// the surface dimples it.
//
// Everything random (where the fish start, each one's size and markings,
// their goals, their fright) draws from the population's own stream
// (seededRandom), never Math.random, so a seeded throw is the same with fish.
// tools/fish-probe.mjs swims them on the CPU and checks all of the above.
import { seededRandom } from './spray.js';

// The kinds. length: [least, most] (m, nose to tail); depth: [shallowest,
// deepest] (m) the kind keeps; cruise: its cruising speed in body lengths a
// second; burst, its fright's; turn, its turn rate cruising (rad/s, ten
// times it bursting away); shy, its alarm radius's scale (1 a lake fish's);
// every kind ranges through the whole water, from just under the surface to
// just over the bed (its `depth`'s deepest is deeper than any bed here), each
// fish picking a new depth every few seconds (DEPTH);
// eats, whether it comes to food; company and count (FISH_BY_PLACE says how
// many). The body's shape and markings are src/fishMeshes.js's: `shape`, in
// shares of its length (its body's depth and width, where it is deepest,
// how pointed its snout, its tail's spread and fork, each fin's span along
// the body and height, how many scales along it) and `pattern`
// (FISH_PATTERNS there).
export const FISH_SPECIES = {
  minnow: { name: 'Minnow', length: [0.05, 0.08], depth: [0.08, 3], cruise: 1.6, burst: 7, turn: 3.2, shy: 1.2, eats: true, company: 'school', shape: { depth: 0.2, width: 0.12, tail: 0.2, fork: 0.5, snout: 0.7, peak: 0.36, dorsal: [0.42, 0.55, 0.12], anal: [0.62, 0.71, 0.08], pectoral: 0.09, pelvic: 0.06, scales: 80 }, pattern: 'minnow' },
  perch: { name: 'Perch', length: [0.16, 0.26], depth: [0.1, 3], cruise: 0.8, burst: 5, turn: 2.6, shy: 1.0, eats: true, company: 'shoal', shape: { depth: 0.28, width: 0.13, tail: 0.21, fork: 0.25, snout: 0.75, peak: 0.36, dorsal: [0.22, 0.42, 0.14], dorsal2: [0.46, 0.6, 0.1], anal: [0.62, 0.72, 0.09], pectoral: 0.1, pelvic: 0.08, scales: 60 }, pattern: 'perch' },
  pike: { name: 'Pike', length: [0.5, 0.75], depth: [0.1, 3], cruise: 0.35, burst: 4.5, turn: 1.4, shy: 0.7, eats: false, company: 'alone', shape: { depth: 0.15, width: 0.1, tail: 0.18, fork: 0.35, snout: 1.0, peak: 0.5, dorsal: [0.6, 0.73, 0.09], anal: [0.62, 0.74, 0.08], pectoral: 0.07, pelvic: 0.06, scales: 90 }, pattern: 'pike' },
  trout: { name: 'Brown trout', length: [0.28, 0.45], depth: [0.1, 3], cruise: 0.7, burst: 5, turn: 2.2, shy: 1.3, eats: true, company: 'alone', shape: { depth: 0.22, width: 0.12, tail: 0.21, fork: 0.15, snout: 0.75, peak: 0.38, dorsal: [0.36, 0.48, 0.11], adipose: [0.66, 0.7, 0.035], anal: [0.62, 0.7, 0.08], pectoral: 0.1, pelvic: 0.07, scales: 110 }, pattern: 'trout' },
  char: { name: 'Arctic char', length: [0.25, 0.38], depth: [0.1, 3], cruise: 0.6, burst: 5, turn: 2.2, shy: 1.2, eats: true, company: 'shoal', shape: { depth: 0.22, width: 0.12, tail: 0.21, fork: 0.25, snout: 0.75, peak: 0.38, dorsal: [0.36, 0.48, 0.11], adipose: [0.66, 0.7, 0.035], anal: [0.62, 0.7, 0.08], pectoral: 0.1, pelvic: 0.07, scales: 120 }, pattern: 'char' },
  bass: { name: 'Largemouth bass', length: [0.32, 0.5], depth: [0.1, 3], cruise: 0.5, burst: 4.5, turn: 2.0, shy: 0.9, eats: true, company: 'alone', shape: { depth: 0.27, width: 0.14, tail: 0.22, fork: 0.12, snout: 0.62, peak: 0.36, dorsal: [0.28, 0.44, 0.1], dorsal2: [0.45, 0.6, 0.12], anal: [0.6, 0.7, 0.09], pectoral: 0.11, pelvic: 0.08, scales: 62 }, pattern: 'bass' },
  bluegill: { name: 'Bluegill', length: [0.12, 0.2], depth: [0.1, 3], cruise: 0.9, burst: 5, turn: 3.2, shy: 1.0, eats: true, company: 'shoal', shape: { depth: 0.45, width: 0.11, tail: 0.23, fork: 0.2, snout: 0.6, peak: 0.4, dorsal: [0.3, 0.66, 0.12], anal: [0.55, 0.72, 0.1], pectoral: 0.15, pelvic: 0.1, scales: 45 }, pattern: 'bluegill' },
  tilapia: { name: 'Tilapia', length: [0.2, 0.32], depth: [0.1, 3], cruise: 0.7, burst: 4.5, turn: 2.6, shy: 0.9, eats: true, company: 'shoal', shape: { depth: 0.36, width: 0.13, tail: 0.21, fork: 0, snout: 0.62, peak: 0.38, dorsal: [0.28, 0.72, 0.1], anal: [0.6, 0.74, 0.1], pectoral: 0.13, pelvic: 0.1, scales: 32 }, pattern: 'tilapia' },
  pupfish: { name: 'Pupfish', length: [0.04, 0.065], depth: [0.06, 3], cruise: 1.5, burst: 7, turn: 3.2, shy: 1.2, eats: true, company: 'school', shape: { depth: 0.3, width: 0.15, tail: 0.2, fork: -0.15, snout: 0.55, peak: 0.4, dorsal: [0.45, 0.6, 0.11], anal: [0.55, 0.68, 0.09], pectoral: 0.1, pelvic: 0.06, scales: 28 }, pattern: 'pupfish' },
  mullet: { name: 'Grey mullet', length: [0.3, 0.45], depth: [0.1, 3], cruise: 0.8, burst: 5, turn: 2.4, shy: 1.2, eats: true, company: 'shoal', shape: { depth: 0.2, width: 0.15, tail: 0.22, fork: 0.45, snout: 0.5, peak: 0.36, dorsal: [0.3, 0.38, 0.09], dorsal2: [0.55, 0.63, 0.08], anal: [0.6, 0.7, 0.07], pectoral: 0.1, pelvic: 0.07, scales: 42 }, pattern: 'mullet' },
  wrasse: { name: 'Ballan wrasse', length: [0.25, 0.4], depth: [0.1, 3], cruise: 0.5, burst: 4, turn: 2.6, shy: 0.8, eats: true, company: 'alone', shape: { depth: 0.3, width: 0.15, tail: 0.2, fork: -0.15, snout: 0.65, peak: 0.4, dorsal: [0.25, 0.76, 0.08], anal: [0.6, 0.76, 0.08], pectoral: 0.11, pelvic: 0.07, scales: 40 }, pattern: 'wrasse' },
  koi: { name: 'Koi', length: [0.35, 0.6], depth: [0.08, 3], cruise: 0.38, burst: 3, turn: 1.8, shy: 0.55, eats: true, company: 'shoal', shape: { depth: 0.25, width: 0.16, tail: 0.24, fork: 0.22, snout: 0.5, peak: 0.38, dorsal: [0.33, 0.66, 0.08], anal: [0.64, 0.73, 0.07], pectoral: 0.14, pelvic: 0.09, scales: 32 }, pattern: 'koi' },
  goldfish: { name: 'Goldfish', length: [0.14, 0.22], depth: [0.08, 3], cruise: 0.7, burst: 4, turn: 2.2, shy: 0.7, eats: true, company: 'alone', shape: { depth: 0.36, width: 0.17, tail: 0.32, fork: 0.35, snout: 0.5, peak: 0.38, dorsal: [0.36, 0.62, 0.13], anal: [0.63, 0.72, 0.09], pectoral: 0.13, pelvic: 0.09, scales: 28 }, pattern: 'goldfish' },
};

// Each place's fish (src/main.js PLACES): kinds and how many; none in the Pool.
export const FISH_BY_PLACE = {
  lakeside: [{ species: 'minnow', count: 8 }, { species: 'perch', count: 4 }, { species: 'pike', count: 1 }],
  swiss: [{ species: 'trout', count: 2 }, { species: 'char', count: 3 }],
  highlands: [{ species: 'trout', count: 2 }, { species: 'minnow', count: 8 }],
  mesas: [{ species: 'bass', count: 1 }, { species: 'bluegill', count: 4 }],
  desert: [{ species: 'pupfish', count: 8 }, { species: 'tilapia', count: 3 }],
  cove: [{ species: 'mullet', count: 4 }, { species: 'wrasse', count: 1 }],
  koi: [{ species: 'koi', count: 7 }, { species: 'goldfish', count: 1 }],
  pool: [],
};

const GRAVITY = 9.81;
const ANTICIPATE = 0.5;        // s: a thing coming down sooner than this frightens the fish under where it will land
const ALARM = { least: 0.5, perRadius: 11, impact: 1.25, moving: 0.35 };   // m and m per m of the thing's radius: how far a thing frightens (times the kind's shy)
const FRIGHT = { seconds: [0.7, 1.4], wary: [3, 6], spread: 0.7, dive: 0.5, passOn: [0.08, 0.22], passReach: 1.5 };   // s; rad of scatter; how far down it dives; how its group takes fright
const REST = { chance: 0.06, seconds: [2, 6], speed: 0.15 };   // a group's rests: a chance a second, how long, at what share of its cruise
const GOAL = { reach: 0.5, seconds: [6, 16], wander: [0.8, 3.2], tries: 12 };   // when a goal is reached or given up, and how far the next is
const MARGIN = 0.35;           // m: a fish keeps this far inside its water's box
const CLEARANCE = 0.06;        // m: and its body this far off the bed
const SURFACE_GAP = 0.04;      // m: and its back this far under the surface (more under ice and a gale: setConditions)
const FEED = { sense: 6, settle: 1.5, chance: 0.8, follow: 2.5, seconds: [1.0, 2.6], reach: 0.6, backOff: 0.5 };   // m, s after it stops, chances a second (alone, following a groupmate there), s between bites, bite distance (body lengths), back-off (s)
export const FEEDERS = 6;      // fish at one thing at a time
const COMPANY = {              // the boids' weights (the header) and spacing in body lengths, by the company kept
  school: { apart: 1.1, align: 1.2, together: 1.6, goal: 0.6, reach: 8 },
  shoal: { apart: 2.2, align: 0.35, together: 0.5, goal: 0.8, reach: 8 },
  alone: { apart: 0, align: 0, together: 0, goal: 1, reach: 0 },
};
const OTHERS_APART = 1.0;      // body lengths: any two fish keep at least this far apart
const ACCELERATION = { cruise: 1.2, burst: 6 };   // body lengths a second, a second
const BURST_MOST = 0.8;        // m/s: the fastest any of them bolts (a big fish's ten lengths a second would be a blur)
const FLEE_TURN = 4;           // its turn rate fleeing, times its cruising one...
const C_START = { seconds: 0.15, turn: 14 };   // ...but first, for this long, a C-start: it whips round this many times as fast, then dashes
const PACE = { rate: [0.25, 0.7], swing: 0.45 };   // a fish's own pace (burst and coast): rad/s it swings at, and by how much of its cruise
const DEPTH = { seconds: [4, 14], own: { school: 0.15, shoal: 0.7, alone: 1 }, upper: 1 };   // how often a fish picks a new depth, how much its own over its group's, and how it favours the upper water
const STRIDE = 0.65;           // body lengths a tail beat
const TAIL_MOST = 4;           // tail beats a second at most (a bolting fish's tail sweeps wider rather than faster)
const PITCH_MOST = 0.4;        // rad: the steepest a fish climbs or dives, nose up or down
// How fast what a fish wants is eased in (a second's share: cruising, fleeing), how fast it turns into line with it
// (per second), and how fast its bend and its pitch follow: no fish wavers or trembles.
const STEADY = { cruising: 2.5, fleeing: 12, turn: 3, bend: 3, pitch: 2.5 };
const BODY_HALF_HEIGHT = 0.5;  // its depth's share above its centre (its back): its centre keeps its depth's half under the surface

/** How many bites a thing of `mass` (kg) takes to eat (src/main.js): a 30 cm pizza 95 (koi at it half a minute or so), a watermelon 500. */
export function edibleBites(mass) {
  return Math.round(Math.min(Math.max(mass * 250, 30), 500));
}

const range = (random, [least, most]) => least + (most - least) * random();
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, least, most) => Math.min(Math.max(value, least), most);
const smoothstep = (low, high, value) => { const share = clamp((value - low) / (high - low), 0, 1); return share * share * (3 - 2 * share); };

/**
 * The fish of one water (the header): `fish` the swimmers, `groups` their
 * groups. setWaters puts a place's fish in a water; step swims them.
 */
export class FishPopulation {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.fish = [];
    this.groups = [];
    this.time = 0;
    this.water = null;
    this.surfaceGap = SURFACE_GAP;
    this.bites = [];
    this.random = seededRandom(seed, 0);
  }

  /**
   * The place's fish (FISH_BY_PLACE[place]) in a water: `bounds` {minX, minZ,
   * maxX, maxZ} in plan and `depthAt(x, z)`, the bed's depth (m) there. They
   * start spread over it, each group about its own spot, from the place's
   * own stream, so a place's fish start alike whenever it is entered.
   */
  setWaters({ place, bounds, depthAt }) {
    this.water = { bounds, depthAt };
    this.place = place;
    this.random = seededRandom(this.seed, [...String(place)].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 7) % 1e9);
    this.fish = [];
    this.groups = [];
    this.time = 0;
    for (const { species: speciesName, count } of FISH_BY_PLACE[place] ?? []) {
      const species = FISH_SPECIES[speciesName];
      const groupCount = species.company === 'alone' ? count : 1;
      for (let index = 0; index < groupCount; index++) {
        const group = { species, company: COMPANY[species.company], members: [], goal: null, goalUntil: 0, restUntil: 0 };
        const home = this.placeIn(species, null, Infinity);
        group.goal = this.placeIn(species, home, GOAL.wander[1]);
        group.goalUntil = range(this.random, GOAL.seconds);
        this.groups.push(group);
        const members = species.company === 'alone' ? 1 : count;
        for (let member = 0; member < members; member++) {
          const length = range(this.random, species.length);
          const start = this.placeIn(species, home, species.company === 'alone' ? 0 : 0.6, length);
          const fish = {
            species, group, length,
            x: start.x, y: start.y, z: start.z,
            heading: this.random() * Math.PI * 2, pitch: 0, speed: species.cruise * length * range(this.random, [0.4, 0.8]), climb: 0,
            phase: this.random() * Math.PI * 2, beat: 0, bend: 0,
            seed: (member + 0.1 + 0.8 * this.random()) / members,   // its markings' (src/fishMeshes.js): a group's spread over them (a pond's koi of every variety)
            fright: 0, cStart: 0, fleeX: 0, fleeZ: 0, wary: 0, pending: null,
            wantX: 0, wantZ: 0,   // where it wants to go, eased (STEADY)
            pace: range(this.random, PACE.rate), paceAt: this.random() * Math.PI * 2,   // its burst and coast (PACE)
            depthShare: this.random() ** DEPTH.upper, depthUntil: range(this.random, DEPTH.seconds),   // where in its depths it is going (DEPTH)
            food: null, biteIn: 0, backOff: 0, feedAngle: null,
          };
          group.members.push(fish);
          this.fish.push(fish);
        }
      }
    }
  }

  /** How far a fish's middle keeps from the water's sides: its half length and a little, so its nose never goes into a wall. */
  keepFromWalls(fish) {
    return MARGIN * 0.5 + 0.55 * fish.length;
  }

  /**
   * A direction (x, z, unit) a fish would flee in, turned along the walls it
   * is near: what of it heads into a wall fades as the wall nears, so it
   * runs along the wall, and straight at a wall it turns the way that keeps
   * it farther from what frightened it (its flee's sideways part).
   */
  alongWalls(fish, x, z) {
    const { bounds } = this.water;
    const keep = this.keepFromWalls(fish), reach = 0.4 + 2 * fish.length;
    const room = (gap) => clamp(gap / reach, 0, 1);
    let alongX = x, alongZ = z;
    if (alongX < 0) alongX *= room(fish.x - bounds.minX - keep);
    if (alongX > 0) alongX *= room(bounds.maxX - keep - fish.x);
    if (alongZ < 0) alongZ *= room(fish.z - bounds.minZ - keep);
    if (alongZ > 0) alongZ *= room(bounds.maxZ - keep - fish.z);
    const left = Math.hypot(alongX, alongZ);
    if (left > 0.3) return [alongX / left, alongZ / left];
    // Cornered head-on: along the wall, whichever way it was leaning, else out of the corner toward the middle.
    const middleX = (bounds.minX + bounds.maxX) / 2 - fish.x, middleZ = (bounds.minZ + bounds.maxZ) / 2 - fish.z;
    const towardX = alongX + 0.3 * Math.sign(middleX) * (Math.abs(x) < Math.abs(z) ? 1 : 0.3);
    const towardZ = alongZ + 0.3 * Math.sign(middleZ) * (Math.abs(z) < Math.abs(x) ? 1 : 0.3);
    const length = Math.hypot(towardX, towardZ) || 1;
    return [towardX / length, towardZ / length];
  }

  /** Under ice or a gale's waves the fish keep deeper: `surfaceGap` (m) under the still surface for their backs. */
  setConditions({ surfaceGap = SURFACE_GAP } = {}) {
    this.surfaceGap = surfaceGap;
  }

  /** The depths (m, negative y) a fish's centre may take at (x, z), shallowest first: [top, bottom]; null where too shallow. Feeding, from the surface to the bed. */
  band(species, length, x, z, feeding = false) {
    const bed = this.water.depthAt(x, z);
    const half = BODY_HALF_HEIGHT * species.shape.depth * length;
    const top = -(feeding ? Math.max(this.surfaceGap, 0.015) + half : Math.max(species.depth[0], this.surfaceGap + half));
    const bottom = -Math.min(feeding ? Infinity : species.depth[1], bed - CLEARANCE - half);   // to food on the bed, whatever its depth
    return bottom < top ? [top, bottom] : null;
  }

  /** A point in the water for a fish of the kind: within `reach` of `near` (anywhere, without), at a depth it keeps. */
  placeIn(species, near, reach, length = species.length[0]) {
    const { bounds } = this.water;
    const random = this.random;
    let best = null;
    for (let attempt = 0; attempt < GOAL.tries * 2; attempt++) {
      let x, z;
      if (near && Number.isFinite(reach)) {
        const angle = random() * Math.PI * 2, distance = reach * Math.sqrt(random());
        x = near.x + Math.cos(angle) * distance;
        z = near.z + Math.sin(angle) * distance;
      } else {
        x = bounds.minX + MARGIN + (bounds.maxX - bounds.minX - 2 * MARGIN) * random();
        z = bounds.minZ + MARGIN + (bounds.maxZ - bounds.minZ - 2 * MARGIN) * random();
      }
      x = clamp(x, bounds.minX + MARGIN, bounds.maxX - MARGIN);
      z = clamp(z, bounds.minZ + MARGIN, bounds.maxZ - MARGIN);
      const band = this.band(species, length, x, z);
      if (!band) continue;
      // Each kind keeps to the upper part of its depths, where the light is, more often than not.
      const share = random() ** 1.6;
      best = { x, z, y: band[0] + (band[1] - band[0]) * share };
      break;
    }
    if (best) return best;
    // Nowhere deep enough near: the deepest point of the box's middle.
    const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
    const band = this.band(species, length, x, z) ?? [-0.3, -0.3];
    return { x, z, y: (band[0] + band[1]) / 2 };
  }

  /** A splash, or anything sudden, at (x, z): every fish within `alarm` (m, times its kind's shy) takes fright. */
  startle(x, y, z, alarm) {
    for (const fish of this.fish) {
      const reach = alarm * fish.species.shy;
      const apart = Math.hypot(fish.x - x, fish.z - z, Math.max(Math.abs(fish.y - y) - 0.4, 0));
      if (apart < reach) this.frighten(fish, x, z, 1 - apart / reach);
    }
  }

  frighten(fish, x, z, closeness = 1, passed = false) {
    const random = this.random;
    let awayX = fish.x - x, awayZ = fish.z - z;
    const length = Math.hypot(awayX, awayZ);
    // Straight under it: any way away (its heading's, turned); else away, scattered.
    const away = length < 1e-3 ? fish.heading + Math.PI / 2 * (random() < 0.5 ? 1 : -1) : Math.atan2(awayZ, awayX);
    const angle = away + (random() * 2 - 1) * FRIGHT.spread;
    awayX = Math.cos(angle); awayZ = Math.sin(angle);
    const seconds = range(random, FRIGHT.seconds) * (0.6 + 0.4 * closeness);
    if (fish.fright > seconds * 0.5 && fish.fleeX * awayX + fish.fleeZ * awayZ > 0) return;   // already fleeing this way
    fish.fright = Math.max(fish.fright, seconds);
    fish.cStart = C_START.seconds;
    fish.fleeX = awayX; fish.fleeZ = awayZ;
    fish.wary = range(random, FRIGHT.wary);
    fish.food = null;
    fish.feedAngle = null;
    if (passed) return;
    // Its group takes fright from it a moment later (a fish sees its neighbour bolt).
    for (const other of fish.group.members) {
      if (other === fish || other.fright > 0 || other.pending) continue;
      if (Math.hypot(other.x - fish.x, other.z - fish.z) > FRIGHT.passReach) continue;
      other.pending = { in: range(random, FRIGHT.passOn), x, z };
    }
  }

  /**
   * Swim every fish `seconds` on (in steps of at most 1/30 s). `threats`:
   * what frightens or is in the way, [{x, y, z, radius, vx, vy, vz, inAir,
   * still}]: a thing in the air (inAir) frightens the fish under where it
   * comes down if it will within ANTICIPATE; one in the water that moves
   * frightens those near it; one that lies still is in the way. `foods`:
   * what they may eat, [{id, x, y, z, radius, floating, settled}] (settled:
   * seconds it has lain or floated still). Returns the bites, [{id, x, y, z,
   * floating}], taken since.
   */
  step(seconds, { threats = [], foods = [] } = {}) {
    if (!this.water || this.fish.length === 0) return [];
    this.bites = [];
    const steps = Math.max(1, Math.ceil(seconds / (1 / 30) - 1e-9));
    const dt = seconds / steps;
    for (let index = 0; index < steps; index++) this.stepOnce(dt, threats, foods);
    return this.bites;
  }

  stepOnce(dt, threats, foods) {
    const random = this.random;
    this.time += dt;
    // What frightens: a thing coming down where it will land, and one moving through the water.
    for (const threat of threats) {
      if (threat.inAir) {
        if (threat.vy >= 0 && threat.y > 0.5) continue;
        const fall = threat.vy * threat.vy + 2 * GRAVITY * Math.max(threat.y, 0);
        const until = (threat.vy + Math.sqrt(fall)) / GRAVITY;
        if (until > ANTICIPATE) continue;
        this.startle(threat.x + threat.vx * until, 0, threat.z + threat.vz * until, (ALARM.least + ALARM.perRadius * threat.radius));
      } else if (!threat.still) {
        this.startle(threat.x, threat.y, threat.z, ALARM.moving + 3 * threat.radius);
      }
    }
    // A group's goal, and its rests.
    for (const group of this.groups) {
      const lead = group.members[0];
      if (!lead) continue;
      if (this.time > group.goalUntil || Math.hypot(lead.x - group.goal.x, lead.z - group.goal.z) < GOAL.reach) {
        group.goal = this.placeIn(group.species, lead, range(random, GOAL.wander), lead.length);
        group.goalUntil = this.time + range(random, GOAL.seconds);
      }
      if (this.time > group.restUntil && random() < REST.chance * dt) group.restUntil = this.time + range(random, REST.seconds);
    }
    // Who is at each thing to eat.
    const feeders = new Map();
    for (const fish of this.fish) if (fish.food) feeders.set(fish.food.id, (feeders.get(fish.food.id) ?? 0) + 1);
    for (const fish of this.fish) {
      if (fish.food && !foods.some((food) => food.id === fish.food.id)) fish.food = null;
      if (!fish.food) fish.feedAngle = null;
      if (fish.food) fish.food = foods.find((food) => food.id === fish.food.id);
    }
    for (const fish of this.fish) this.steer(fish, dt, threats, foods, feeders);
  }

  steer(fish, dt, threats, foods, feeders) {
    const random = this.random;
    const { species, group, length } = fish;
    const company = group.company;
    if (fish.pending) {
      fish.pending.in -= dt;
      if (fish.pending.in <= 0) { const { x, z } = fish.pending; fish.pending = null; this.frighten(fish, x, z, 0.6, true); }
    }
    fish.fright = Math.max(fish.fright - dt, 0);
    fish.cStart = Math.max(fish.cStart - dt, 0);
    fish.wary = Math.max(fish.wary - dt, 0);
    fish.backOff = Math.max(fish.backOff - dt, 0);
    fish.biteIn = Math.max(fish.biteIn - dt, 0);
    const resting = this.time < group.restUntil;
    let wantX = 0, wantY = 0, wantZ = 0;
    // Its own pace: it speeds up and coasts, each fish at its own rate.
    const pace = 1 + PACE.swing * Math.sin(this.time * fish.pace + fish.paceAt);
    let wantSpeed = species.cruise * length * (resting ? REST.speed : pace);
    // Its own depth, picked anew every so often: rising toward the light, sinking, never long at one level.
    if (this.time > fish.depthUntil) {
      fish.depthShare = random() ** DEPTH.upper;
      fish.depthUntil = this.time + range(random, DEPTH.seconds);
    }
    const ownBand = this.band(species, length, fish.x, fish.z);
    const ownY = ownBand ? ownBand[0] + (ownBand[1] - ownBand[0]) * fish.depthShare : group.goal.y;
    let goalY = ownY;
    let feeding = false;
    if (fish.fright > 0) {
      // Fleeing: away, but along a wall it comes to, never into it (alongWalls); down; fast at first.
      const [fleeX, fleeZ] = this.alongWalls(fish, fish.fleeX, fish.fleeZ);
      wantX = fleeX * 3; wantZ = fleeZ * 3; wantY = -FRIGHT.dive;
      wantSpeed = Math.min(species.burst * length, BURST_MOST) * Math.min(1, 0.4 + fish.fright) * (fish.cStart > 0 ? 0.3 : 1);
    } else {
      // Food: once wary no longer, a feeder comes to what has settled near enough.
      if (species.eats && !fish.food && fish.wary <= 0) {
        // A groupmate gone to food draws it after (fish learn where food is from each other).
        const mate = group.members.find((other) => other !== fish && other.food && (feeders.get(other.food.id) ?? 0) < FEEDERS);
        if (mate && random() < FEED.follow * dt) { fish.food = mate.food; feeders.set(mate.food.id, (feeders.get(mate.food.id) ?? 0) + 1); fish.biteIn = range(random, FEED.seconds) * 0.5; }
      }
      if (species.eats && !fish.food && fish.wary <= 0) {
        for (const food of foods) {
          if (food.settled < FEED.settle || (feeders.get(food.id) ?? 0) >= FEEDERS) continue;
          if (Math.hypot(food.x - fish.x, food.z - fish.z) > FEED.sense) continue;
          if (random() < FEED.chance * dt) { fish.food = food; feeders.set(food.id, (feeders.get(food.id) ?? 0) + 1); fish.biteIn = range(random, FEED.seconds) * 0.5; break; }
        }
      }
      if (fish.food) {
        feeding = true;
        const food = fish.food;
        // To its own spot at the side of it (the near side when it came; a little round after each bite), its mouth at the
        // edge: under a floater at the surface, else where it lies.
        if (fish.feedAngle === null) fish.feedAngle = Math.atan2(fish.z - food.z, fish.x - food.x);
        const sideX = Math.cos(fish.feedAngle), sideZ = Math.sin(fish.feedAngle);
        const edge = food.radius * 0.8 + length * 0.5;
        const targetX = food.x + sideX * edge, targetZ = food.z + sideZ * edge;
        const band = this.band(species, length, targetX, targetZ, true);
        const targetY = food.floating ? (band ? band[0] : -0.05) : Math.min(food.y, band ? band[0] : food.y);
        const toX = targetX - fish.x, toZ = targetZ - fish.z, distance = Math.hypot(toX, toZ);
        if (fish.backOff > 0) {
          // Backing off a little after a bite, still facing it (its pectorals row it back), never turning away.
          wantX = -sideX; wantZ = -sideZ; wantSpeed = -species.cruise * length * 0.25;
        } else if (distance > 1.5 * length) {
          if (distance > 1e-6) { wantX = toX / distance * 2; wantZ = toZ / distance * 2; }
          wantSpeed = species.cruise * length * clamp(distance / (2 * length), 0.3, 1.4);
        } else if (distance > length * FEED.reach || Math.abs(fish.y - targetY) > length * FEED.reach) {
          // Close: facing it, edging in (or back) to its spot, without circling round the spot.
          wantX = -sideX; wantZ = -sideZ;
          wantSpeed = species.cruise * length * clamp(-(toX * sideX + toZ * sideZ) / length, -0.25, 0.6);
        } else {
          // At it: nose toward it, nearly still, and bite now and then.
          wantX = -sideX; wantZ = -sideZ; wantSpeed = species.cruise * length * 0.15;
          if (fish.biteIn <= 0) {
            this.bites.push({ id: food.id, x: food.x + sideX * food.radius * 0.8, y: targetY, z: food.z + sideZ * food.radius * 0.8, floating: food.floating });
            fish.biteIn = range(random, FEED.seconds);
            fish.backOff = FEED.backOff * range(random, [0.5, 1.2]);
            fish.feedAngle += (random() - 0.5) * 0.6;
            fish.beat = Math.max(fish.beat, 0.5);   // a flick of the tail
          }
        }
        goalY = targetY;
      } else {
        // The group's goal, and the company kept.
        const toGoalX = group.goal.x - fish.x, toGoalZ = group.goal.z - fish.z;
        const toGoal = Math.hypot(toGoalX, toGoalZ) || 1;
        wantX += toGoalX / toGoal * company.goal * (resting ? 0.1 : 1);
        wantZ += toGoalZ / toGoal * company.goal * (resting ? 0.1 : 1);
        if (company.reach > 0) {
          let alignX = 0, alignZ = 0, middleX = 0, middleZ = 0, middleY = 0, near = 0;
          for (const other of group.members) {
            if (other === fish) continue;
            const apartX = fish.x - other.x, apartZ = fish.z - other.z, apartY = fish.y - other.y;
            const apart = Math.hypot(apartX, apartZ, apartY);
            if (apart > company.reach * length) continue;
            near++;
            alignX += Math.cos(other.heading); alignZ += Math.sin(other.heading);
            middleX += other.x; middleZ += other.z; middleY += other.y;
            const spacing = company.apart * length;
            if (apart < spacing && apart > 1e-6) {
              const push = (spacing - apart) / spacing * 4;
              wantX += apartX / apart * push; wantZ += apartZ / apart * push; wantY += apartY / apart * push * 0.5;
            }
          }
          if (near > 0) {
            wantX += alignX / near * company.align; wantZ += alignZ / near * company.align;
            const towardX = middleX / near - fish.x, towardZ = middleZ / near - fish.z;
            const toward = Math.hypot(towardX, towardZ);
            const together = company.together * smoothstep(company.apart * length, 2 * company.apart * length, toward);
            if (toward > 1e-6) { wantX += towardX / toward * together; wantZ += towardZ / toward * together; }
            // Its own depth, as far from its company's as the company keeps apart (a school stays a school in depth too).
            const own = DEPTH.own[species.company], middle = middleY / near, spread = 1.5 * company.apart * length;
            goalY = middle + clamp((ownY - middle) * own, -spread, spread);
          }
        }
      }
    }
    // Every other fish: kept apart; a small one keeps clear of a big hunter (a pike, a bass, a trout).
    for (const other of this.fish) {
      if (other === fish) continue;
      const apartX = fish.x - other.x, apartZ = fish.z - other.z;
      const reach = OTHERS_APART * 0.5 * (length + other.length) + (other.species.company === 'alone' && other.length > 3 * length ? other.length : 0);
      const apart = Math.hypot(apartX, apartZ, fish.y - other.y);
      if (apart < reach && apart > 1e-6) { wantX += apartX / apart * 2 * (reach - apart) / reach; wantZ += apartZ / apart * 2 * (reach - apart) / reach; }
    }
    // Things in the water: swum round.
    for (const threat of threats) {
      if (threat.inAir) continue;
      const apartX = fish.x - threat.x, apartZ = fish.z - threat.z, apartY = fish.y - threat.y;
      const reach = threat.radius + length * 0.8;
      const apart = Math.hypot(apartX, apartZ, apartY);
      if (apart < reach && apart > 1e-6) { wantX += apartX / apart * 3 * (reach - apart) / reach; wantZ += apartZ / apart * 3 * (reach - apart) / reach; }
    }
    // The water's sides: turned back from them, and from where its heading would take it within a second.
    const { bounds } = this.water;
    const edge = MARGIN + length;
    const keep = this.keepFromWalls(fish);
    const look = 0.6 * fish.speed + length, wallPush = fish.fright > 0 ? 1.5 : 4;   // fleeing, alongWalls has already turned it
    const lookX = fish.x + Math.cos(fish.heading) * look, lookZ = fish.z + Math.sin(fish.heading) * look;
    // As far as that point would be past the wall, smoothly (an on-off push would flick it to and fro).
    const past = (gap) => clamp(-gap / look, 0, 1);
    wantX += wallPush * (past(lookX - bounds.minX - keep) - past(bounds.maxX - keep - lookX));
    wantZ += wallPush * (past(lookZ - bounds.minZ - keep) - past(bounds.maxZ - keep - lookZ));
    if (fish.x < bounds.minX + edge) wantX += (bounds.minX + edge - fish.x) / edge * 3;
    if (fish.x > bounds.maxX - edge) wantX -= (fish.x - bounds.maxX + edge) / edge * 3;
    if (fish.z < bounds.minZ + edge) wantZ += (bounds.minZ + edge - fish.z) / edge * 3;
    if (fish.z > bounds.maxZ - edge) wantZ -= (fish.z - bounds.maxZ + edge) / edge * 3;
    // The shallows: turned back toward deeper water (the bed's slope).
    const ahead = 0.3 + length;
    const aheadX = fish.x + Math.cos(fish.heading) * ahead, aheadZ = fish.z + Math.sin(fish.heading) * ahead;
    if (!this.band(species, length, aheadX, aheadZ, feeding)) {
      const step = 0.2;
      const slopeX = this.water.depthAt(fish.x + step, fish.z) - this.water.depthAt(fish.x - step, fish.z);
      const slopeZ = this.water.depthAt(fish.x, fish.z + step) - this.water.depthAt(fish.x, fish.z - step);
      const slope = Math.hypot(slopeX, slopeZ) || 1;
      wantX += slopeX / slope * 3; wantZ += slopeZ / slope * 3;
    }

    // What it wants, eased over a fraction of a second (STEADY), so pulls that trade places from step to step never
    // make it waver; then turn toward it, no faster than it can, easing into and out of the turn.
    const settle = Math.min(1, (fish.fright > 0 ? STEADY.fleeing : STEADY.cruising) * dt);
    fish.wantX += (wantX - fish.wantX) * settle;
    fish.wantZ += (wantZ - fish.wantZ) * settle;
    const turnRate = species.turn * (fish.cStart > 0 ? C_START.turn : fish.fright > 0 ? FLEE_TURN : feeding ? 1.3 : 1);
    let turn = 0;
    if (Math.hypot(fish.wantX, fish.wantZ) > 1e-3) {
      const off = wrapAngle(Math.atan2(fish.wantZ, fish.wantX) - fish.heading);
      // As fast as it can when far off; slower as it lines up (no overshoot to hunt back and forth).
      turn = clamp(off * Math.min(1, STEADY.turn * dt), -turnRate * dt, turnRate * dt);
      fish.heading = wrapAngle(fish.heading + turn);
    }
    // The body bends into the turn (src/fishMeshes.js), more the sharper, eased.
    fish.bend += (clamp(turn / (dt * species.turn * 4), -1, 1) - fish.bend) * Math.min(1, STEADY.bend * dt);
    const acceleration = (fish.fright > 0 ? ACCELERATION.burst : ACCELERATION.cruise) * length;
    fish.speed += clamp(wantSpeed - fish.speed, -acceleration * dt * 1.5, acceleration * dt);
    // Up or down to its depth (the goal's, the group's, the food's), slowly, as its pitch allows.
    const band = this.band(species, length, fish.x, fish.z, feeding);
    let wantedY = goalY + wantY * 0.5;
    if (band) wantedY = clamp(wantedY, band[1], band[0]);
    const climbMost = Math.max(fish.speed, 0.3 * length) * 0.45;
    fish.climb += (clamp((wantedY - fish.y) * 1.5, -climbMost, climbMost) - fish.climb) * Math.min(1, 3 * dt);
    const pitch = clamp(Math.atan2(fish.climb, Math.max(Math.abs(fish.speed), 0.5 * species.cruise * length)), -PITCH_MOST, PITCH_MOST);
    fish.pitch += (pitch - fish.pitch) * Math.min(1, STEADY.pitch * dt);
    const wasX = fish.x, wasZ = fish.z;
    fish.x += Math.cos(fish.heading) * fish.speed * dt;
    fish.z += Math.sin(fish.heading) * fish.speed * dt;
    // Never into water too shallow for it, or onto the land: where it would be, it stays, slowing (the shallows' turn
    // above takes it back out).
    if (!this.band(species, length, fish.x, fish.z, feeding) && this.band(species, length, wasX, wasZ, feeding)) {
      fish.x = wasX; fish.z = wasZ;
      fish.speed *= Math.max(0, 1 - 3 * dt);
    }
    fish.y += fish.climb * dt;
    // Never out of its water: inside the box, nose and tail too, under the surface, over the bed. Held at a wall it
    // slows and turns along it rather than pressing into it.
    const heldX = clamp(fish.x, bounds.minX + keep, bounds.maxX - keep), heldZ = clamp(fish.z, bounds.minZ + keep, bounds.maxZ - keep);
    if (heldX !== fish.x || heldZ !== fish.z) {
      fish.speed *= Math.max(0, 1 - 3 * dt);   // the walls' push above turns it
      fish.x = heldX; fish.z = heldZ;
    }
    const kept = this.band(species, length, fish.x, fish.z, feeding);
    if (kept) fish.y = clamp(fish.y, kept[1], kept[0]);
    else fish.y = Math.min(fish.y, -(this.surfaceGap + BODY_HALF_HEIGHT * species.shape.depth * length));
    // The tail beats once a stride, at least slowly while it hangs still; a flick after a bite or as it bolts.
    // Never faster than TAIL_MOST beats a second: a faster beat would shimmer at the screen's sixty frames, not swim.
    const frequency = clamp(Math.abs(fish.speed) / (STRIDE * length), 0.6, TAIL_MOST);
    fish.phase = (fish.phase + 2 * Math.PI * frequency * dt) % (2 * Math.PI * 64);
    fish.beat += ((fish.fright > 0 ? 1 : 0) - fish.beat) * Math.min(1, 2 * dt);
  }
}
