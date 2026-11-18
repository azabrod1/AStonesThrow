// Europa's life above the ice (src/main.js; drawn by src/europaLifeMeshes.js):
// the birds' sibling at the one place with no air (src/birds.js has none for
// it). Scenery as the birds are: nothing thrown meets them, they touch
// neither the splash nor the water, and they keep far out of a throw's reach
// (LIFE.reach). Only at Europa (LIFE_BY_PLACE), and only with the Effects
// setting's birds on (src/main.js applyBirds).
//
// What could fly where there is no air (the research notes on Europa: no
// peer-reviewed source proposes life above its ice; this is design, on what
// physics allows): nothing glides or beats a wing, and nothing is slowed by
// drag, so everything above the ice is on a parabola under Europa's gravity
// (LIFE_GRAVITY, 1.315 m/s²: a fall of 1 m takes 1.23 s, a leap at 10 m/s
// rises 38 m and is up 15 s), bent only by thrust of its own. Two kinds:
//   - Plume drifters (`drifter`): vent-dwellers, the least implausible of the
//     notes' "flyers". They live in the warm, wet throat of a crack on the far
//     ice (`vent`), and now and then the crack vents (an eruption, a faint
//     jet of vapour and ice grains: `plume`) and throws one or two out, up at
//     5 to 7 m/s, 10 to 18 m high. Each has filled its bell with vapour in
//     the vent; past the top of its arc it brakes its fall by puffing it out
//     downward through its bell's mouth, a puff every second and a half or
//     so (jet propulsion, as a salp or a jellyfish swims, which needs no air
//     to push on): each puff gives back what gravity took since the last and
//     a little more or less, holding its fall to a slow sink (`sink`, under a
//     metre a second on the average), in a sawtooth of small rises and falls
//     (gravity unbraked between puffs), its bell squeezing with each puff (`pulse`) and flashing as it
//     does (as a comb jelly's photocytes flash when squeezed). It glows
//     blue-green (about 480 nm: where Earth's deep-sea light peaks, the
//     colour that carries farthest in seawater, which its ocean-born kind
//     would share), translucent, its filaments trailing. Down on the ice it
//     dims and is gone (back into the crack, or dormant: the notes' "die or
//     go dormant on landing").
//   - Ice hoppers (`hopper`): ballistic leapers, the notes' second kind, a
//     springtail's way (Collembola leap by a spring-loaded fork under the
//     tail, the furcula, and tumble as they go). One now and then crosses
//     the far ice in long, low leaps (2.9 to 4 m/s up: 3 to 6 m high and
//     4.4 to 6 s aloft each), resting between them, a slow somersault in some
//     (no air: its spin is whatever the leap gave it, constant till it lands,
//     a whole turn so it lands on its feet), a flash of its glowing band as it
//     leaps.
// The plume is sci-fi licence: water vapour is near invisible to an eye, and
// Europa's plumes are contested (a 2026 reanalysis of Hubble's data put the
// evidence under 90%); here it is a faint glowing column, the ice grains in
// it lit by the sun and by what it carries.
//
// All of it is closed form in time (showAt), laid out from the place's seed
// and each eruption's or crossing's number, in order, the last few kept, so a
// seeded game goes alike at any frame rate; nothing of theirs changes in a
// physics step (nothing thrown reaches them, so there is nothing to step).
// Their randomness is their own seeded stream (seededRandom), never
// Math.random. tools/europa-life-probe.mjs checks them.
//
// Gravity: LIFE_GRAVITY is the place's own (PLACES.europa.gravity) where a
// place has one, else EUROPA_GRAVITY, so it follows a per-place gravity once
// places carry theirs.
//
// A pose (`pose`, which src/europaLifeMeshes.js draws): where it is (x, y, z:
// a drifter's bell's middle, a hopper's feet), `heading` (rad about up, 0
// along +x), `spin` (a drifter's turn about its axis; a hopper's somersault,
// rad), `tilt` (a drifter's bell leaning along its way, rad), `pulse` (0 to 1:
// its bell squeezed by a puff), `sag` (a drifter's filaments swung down by a
// puff's thrust, 0 to 1), `crouch` (a hopper's legs bent, 0 to 1), `glow` (its
// light, 1 as it glows at rest, up to about 3 in a flash) and `fade` (0 to 1:
// coming out of the vent, or dimming once down), whether it is `shown`, and
// `id`, which flight or crossing it is (the meshes are handed out in order
// each frame, so one mesh may draw another drifter from one frame to the next).
import { seededRandom } from './spray.js';
import { PLACES } from './places.js';

/** Europa's surface gravity (m/s²; The Planetary Society: 1.315, some give 1.314). */
export const EUROPA_GRAVITY = 1.315;
/** The gravity the life of Europa falls under: the place's own if places carry one, else EUROPA_GRAVITY. */
export const LIFE_GRAVITY = PLACES.europa?.gravity ?? EUROPA_GRAVITY;

// Where they are laid out from: the level view's eye (src/main.js VIEWS.level, Europa's own view, `defaultView`).
export const LIFE_EYE = { x: 0, y: 0.16, z: 0.5 };
// Bearings are degrees right of straight ahead (−z) from the eye.
const along = (bearing, distance) => {
  const radians = bearing * Math.PI / 180;
  return { x: LIFE_EYE.x + Math.sin(radians) * distance, z: LIFE_EYE.z - Math.cos(radians) * distance };
};

export const LIFE_KINDS = {
  // Its bell (m across, tall), its filaments under it another 1.3 m: a gasbag of jelly as wide as the biggest of
  // Earth's jellyfish bells, under a seventh of Earth's weight.
  drifter: { name: 'Plume drifter', span: 1.0, height: 0.75 },
  hopper: { name: 'Ice hopper', length: 0.7, height: 0.33 },
};

// Each place's (only Europa's).
//   vent: the crack on the far ice the plume comes up from (`bearing` degrees right of ahead, `distance` m out). Jupiter
//     stands 4 to 16° left of ahead (tools/europa-sky.py JUPITER), the sun behind the eye's right: the plume rises right
//     of Jupiter in black sky, and what it throws out drifts across toward it or away.
//   eruptions: `gap` [least, most] s between eruptions (the first anywhere from under way already to `gap`'s most:
//     FIRST), each `lasts` s of jet (the plume building `rise` s before it and fading `fall` s after), throwing out 1
//     or 2 drifters (`second`: the share that throw two), `stagger` s apart.
//   drifter: thrown up at `up` m/s, out at `out` m/s (any way about, but `toward` of the time toward the eye's side of
//     the vent, so it crosses the view); `every` s between puffs, each `puff` s long, each giving what brings its
//     speed over the next period to a sink of `sink` m/s on the average, but no more than `most` times what gravity
//     takes in a period (so it slows into its sink over a few puffs); down, it dims over `dims` s; it fades in as it
//     comes out of the vent's glow over `emerge` s.
//   hopper: `count` crossings at a time, each crossing laid `distance` m out, from beyond one side of the frame to beyond
//     the other (`bearings`: from and to, either way), `gap` s between one's end and its next; each leap `up` m/s up and
//     `ahead` m/s along, resting `rest` s between, crouching `crouch` s before a leap and its legs giving `land` s as it
//     comes down; a share `tumble` of leaps a somersault.
export const LIFE_BY_PLACE = {
  europa: {
    vent: { bearing: 21, distance: 64 },
    eruptions: { gap: [7, 22], lasts: [3, 5], rise: 1.2, fall: 3, second: 0.4, stagger: [0.4, 1.4] },
    drifter: { up: [5.2, 6.8], out: [0.35, 1.2], toward: 0.6, every: [1.35, 1.85], puff: 0.38, sink: [0.55, 0.95], most: 1.5, dims: 3.5, emerge: 0.8 },
    hopper: { count: 1, distance: [20, 32], bearings: [-48, 48], gap: [10, 35], up: [2.9, 4.0], ahead: [2.1, 3.1], rest: [0.6, 2.4], crouch: 0.35, land: 0.45, tumble: 0.45 },
  },
};

// How far out they keep (m from the shore's eye and the level view's): a throw's water is the 6 m patch about the
// origin, so nothing of theirs comes within reach of it.
export const LIFE = { reach: 18, drifters: 6, hoppers: 1, kept: 8 };
const FIRST = [-0.4, 1];   // the first eruption or crossing at a share of `gap`'s most from the start (under way already if below 0)

const between = ([least, most], share) => least + (most - least) * share;

/** Height (m) at `local` s of a drifter's flight: thrown up at `up`, its puffs starting at `puffs` (s), each giving `kicks` (m/s) over `puff` s. */
function drifterHeight(flight, local) {
  const { up, gravity } = flight;
  let height = up * local - gravity * local * local / 2;
  for (let index = 0; index < flight.puffs.length; index++) {
    const since = local - flight.puffs[index];
    if (since <= 0) break;
    const kick = flight.kicks[index];
    height += since < flight.puff ? kick / flight.puff * since * since / 2 : kick * (since - flight.puff / 2);
  }
  return height;
}
/** A drifter's upward speed (m/s) at `local` s of its flight. */
function drifterClimb(flight, local) {
  let climb = flight.up - flight.gravity * local;
  for (let index = 0; index < flight.puffs.length; index++) {
    const since = local - flight.puffs[index];
    if (since <= 0) break;
    climb += flight.kicks[index] * Math.min(since / flight.puff, 1);
  }
  return climb;
}

const freshPose = () => ({ id: '', x: 0, y: 0, z: 0, heading: 0, spin: 0, tilt: 0, pulse: 0, sag: 0, crouch: 0, glow: 1, fade: 0, shown: false });

/**
 * The life of a place: `drifters` (LIFE.drifters of them, each a drifter's pose that showAt fills or hides), `hoppers`
 * (LIFE.hoppers) and the `plume` ({ x, z, strength 0 to 1, time }). setPlace(place) lays out a place's (none but
 * Europa's), reset(time) starts them at `time`, showAt(time) poses them.
 */
export class EuropaLife {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.drifters = Array.from({ length: LIFE.drifters }, (_, index) => ({ kind: 'drifter', index, pose: freshPose() }));
    this.hoppers = Array.from({ length: LIFE.hoppers }, (_, index) => ({ kind: 'hopper', index, pose: freshPose() }));
    this.plume = { x: 0, z: 0, strength: 0, time: 0 };
    this.setPlace('none');
  }

  /** The life of `place` (LIFE_BY_PLACE; 'none', or a place without, has none). */
  setPlace(place) {
    this.place = place;
    this.layout = LIFE_BY_PLACE[place] ?? null;
    if (this.layout) Object.assign(this.plume, along(this.layout.vent.bearing, this.layout.vent.distance));
    this.reset(0);
  }

  /** Every eruption and crossing begins afresh from `time`. */
  reset(time) {
    this.origin = time;
    this.dropped = 0;   // drifters up that had no mesh to show them (more than LIFE.drifters at once)
    this.eruptions = [];
    this.crossings = this.hoppers.map(() => []);
    this.hide();
  }

  hide() {
    for (const creature of [...this.drifters, ...this.hoppers]) creature.pose.shown = false;
    this.plume.strength = 0;
  }

  /** Eruption `index`, starting at `start` s (local), and what it throws out. */
  layEruption(index, start) {
    const { eruptions: ways, drifter } = this.layout;
    const random = seededRandom(this.seed, index, 71);
    const lasts = between(ways.lasts, random());
    const count = random() < ways.second ? 2 : 1;
    const flights = [];
    for (let thrown = 0; thrown < count; thrown++) {
      const launch = start + 0.3 * lasts + (thrown ? between(ways.stagger, random()) : 0);
      const up = between(drifter.up, random());
      const out = between(drifter.out, random());
      // Any way about the vent, but mostly toward the eye's side of it, so it crosses the view rather than going off behind.
      const towardEye = Math.atan2(-(LIFE_EYE.z - this.plume.z), LIFE_EYE.x - this.plume.x) * 180 / Math.PI;   // a heading: about up, 0 along +x
      const way = (random() < drifter.toward ? towardEye + (random() * 2 - 1) * 70 : random() * 360) * Math.PI / 180;
      const every = between(drifter.every, random());
      const gravity = LIFE_GRAVITY;
      const flight = {
        launch, up, gravity, puff: drifter.puff,
        velocity: { x: Math.cos(way) * out, z: -Math.sin(way) * out }, heading: way, spinRate: (random() * 2 - 1) * 0.6, spin: random() * Math.PI * 2,
        puffs: [], kicks: [], landed: 0,
      };
      // Its puffs from the top of its arc on, each laid in turn from its speed then (closed form, once, here), till it
      // is down: its landing found by walking the closed form.
      const top = up / gravity, sink = between(drifter.sink, random()), fall = gravity * every;
      for (let puff = 0, at = top; puff < 400; puff++, at += every) {
        const before = drifterClimb(flight, at);
        flight.puffs.push(at);
        flight.kicks.push(Math.min(Math.max(fall / 2 - sink - before, 0), drifter.most * fall));
      }
      let local = top;
      while (local < 600 && drifterHeight(flight, local + 0.02) > 0) local += 0.02;
      flight.landed = local;
      flight.kicks.length = flight.puffs.filter((at) => at < local).length;
      flight.puffs.length = flight.kicks.length;
      flights.push(flight);
    }
    const end = Math.max(start + lasts + ways.fall, ...flights.map((flight) => flight.launch + flight.landed + drifter.dims));
    return { index, start, lasts, flights, end, next: start + lasts + between(ways.gap, random()) };
  }

  /** Crossing `index` of hopper `which`, starting at `start` s (local): its leaps. */
  layCrossing(which, index, start) {
    const ways = this.layout.hopper;
    const random = seededRandom(this.seed, which, index, 83);
    const rightward = random() < 0.5;
    const [fromBearing, toBearing] = rightward ? ways.bearings : [...ways.bearings].reverse();
    // Its line `distance` m from the eye at its nearest (its ends that over the cosine of their bearings).
    const from = along(fromBearing, between(ways.distance, random()) / Math.cos(fromBearing * Math.PI / 180));
    const to = along(toBearing, between(ways.distance, random()) / Math.cos(toBearing * Math.PI / 180));
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const heading = Math.atan2(-(to.z - from.z), to.x - from.x);
    const unit = { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
    const leaps = [];
    const gravity = LIFE_GRAVITY;
    let at = start, gone = 0;
    while (gone < length) {
      const rest = between(ways.rest, random());
      const up = between(ways.up, random()), ahead = between(ways.ahead, random());
      const aloft = 2 * up / gravity;
      const leap = { rest: at, launch: at + rest, aloft, up, gravity, from: gone, to: gone + ahead * aloft, tumble: random() < ways.tumble ? (random() < 0.5 ? 1 : -1) : 0 };
      leaps.push(leap);
      gone = leap.to;
      at = leap.launch + aloft;
    }
    return { index, start, leaps, heading, from, unit, end: at + ways.land, next: at + between(ways.gap, random()) };
  }

  /** The eruptions (laid in order, the last LIFE.kept kept) that may be under way at `local`. */
  eruptionsAt(local) {
    const list = this.eruptions;
    const ways = this.layout.eruptions;
    if (!list.length) list.push(this.layEruption(0, between(FIRST, seededRandom(this.seed, 0, 79)()) * ways.gap[1]));
    while (list[list.length - 1].start - ways.rise <= local) {
      list.push(this.layEruption(list[list.length - 1].index + 1, list[list.length - 1].next));
      if (list.length > LIFE.kept) list.shift();
    }
    return list;
  }

  crossingsAt(which, local) {
    const list = this.crossings[which];
    if (!list.length) list.push(this.layCrossing(which, 0, between(FIRST, seededRandom(this.seed, which, 89)()) * this.layout.hopper.gap[1]));
    while (list[list.length - 1].next <= local) {
      const last = list[list.length - 1];
      list.push(this.layCrossing(which, last.index + 1, last.next));
      if (list.length > LIFE.kept) list.shift();
    }
    return list;
  }

  /** Every creature and the plume posed at `time` (s, the frame's: closed form). */
  showAt(time) {
    this.hide();
    if (!this.layout) return;
    const local = time - this.origin;
    this.plume.time = time;
    const { eruptions: ways, drifter: drifterWays } = this.layout;
    // The plume: the strongest eruption under way, built over `rise` s, held, and fading over `fall` s.
    let slot = 0;
    for (const eruption of this.eruptionsAt(local)) {
      const since = local - eruption.start;
      const strength = since < 0 ? Math.max(0, 1 + since / ways.rise) ** 2 : since < eruption.lasts ? 1 : Math.max(0, 1 - (since - eruption.lasts) / ways.fall) ** 2;
      this.plume.strength = Math.max(this.plume.strength, strength);
      for (const flight of eruption.flights) {
        const flown = local - flight.launch;
        if (flown < 0 || flown > flight.landed + drifterWays.dims) continue;
        if (slot >= this.drifters.length) { this.dropped++; continue; }   // never, as laid out (tools/europa-life-probe.mjs)
        this.poseDrifter(this.drifters[slot++].pose, flight, flown, drifterWays);
        this.drifters[slot - 1].pose.id = `${eruption.index}:${eruption.flights.indexOf(flight)}`;
      }
    }
    this.hoppers.forEach((hopper, which) => {
      for (const crossing of this.crossingsAt(which, local)) {
        if (local >= crossing.start && local <= crossing.end) { this.poseHopper(hopper.pose, crossing, local, this.layout.hopper); hopper.pose.id = `${which}:${crossing.index}`; }
      }
    });
  }

  poseDrifter(pose, flight, flown, ways) {
    const local = Math.min(flown, flight.landed);
    pose.shown = true;
    pose.x = this.plume.x + flight.velocity.x * local;
    pose.z = this.plume.z + flight.velocity.z * local;
    const half = LIFE_KINDS.drifter.height / 2;
    pose.y = Math.max(drifterHeight(flight, local), 0) + half;
    pose.heading = flight.heading;
    pose.spin = flight.spin + flight.spinRate * local;
    // Leaning a little along its way as it climbs or sinks (its bell's axis tipped toward its motion, as a jellyfish's).
    const climb = drifterClimb(flight, local);
    pose.tilt = Math.atan2(Math.hypot(flight.velocity.x, flight.velocity.z), Math.abs(climb) + 2) * 0.5;
    // In a puff: its bell squeezed (a sine over the puff), its filaments swung down by the thrust, a flash.
    let pulse = 0, flash = 0;
    for (const start of flight.puffs) {
      const since = local - start;
      if (since < 0) break;
      if (since < flight.puff) pulse = Math.sin(Math.PI * since / flight.puff);
      flash = Math.max(flash, Math.exp(-since / 0.6) * Math.min(1, since / 0.08));
    }
    pose.pulse = flown > flight.landed ? 0 : pulse;
    pose.sag = pose.pulse;
    pose.glow = 1 + 1.6 * flash;
    pose.fade = Math.min(1, flown / ways.emerge) * (flown > flight.landed ? Math.max(0, 1 - (flown - flight.landed) / ways.dims) : 1);
    pose.crouch = flown > flight.landed ? Math.min(1, (flown - flight.landed) / 0.6) : 0;   // down: its bell slumping on the ice
  }

  poseHopper(pose, crossing, local, ways) {
    // Which leap: the last whose rest has begun.
    let leap = crossing.leaps[0];
    for (const candidate of crossing.leaps) if (candidate.rest <= local) leap = candidate;
    const index = crossing.leaps.indexOf(leap);
    const previous = crossing.leaps[index - 1];
    let gone = leap.from, height = 0, spin = 0, crouch = 0, flash = 0;
    if (local < leap.launch) {
      // Resting: its legs giving as it came down, then still, then crouching to leap.
      const landed = local - leap.rest;
      if (previous) crouch = Math.max(crouch, Math.sin(Math.min(1, landed / ways.land) * Math.PI) * 0.8);
      crouch = Math.max(crouch, Math.max(0, 1 - (leap.launch - local) / ways.crouch));
      if (previous) flash = Math.exp(-landed / 0.5);
    } else if (local < leap.launch + leap.aloft) {
      const flown = local - leap.launch;
      gone = leap.from + (leap.to - leap.from) * flown / leap.aloft;
      height = leap.up * flown - leap.gravity * flown * flown / 2;
      spin = leap.tumble * 2 * Math.PI * flown / leap.aloft;   // no torque in flight: a steady turn, a whole one by the landing
      flash = Math.exp(-flown / 0.8);
    } else {
      // Down after its last leap, its legs giving, then away (the crossing's end).
      gone = leap.to;
      const landed = local - leap.launch - leap.aloft;
      crouch = Math.sin(Math.min(1, landed / ways.land) * Math.PI) * 0.8;
      flash = Math.exp(-landed / 0.5);
    }
    pose.shown = true;
    pose.x = crossing.from.x + crossing.unit.x * gone;
    pose.z = crossing.from.z + crossing.unit.z * gone;
    pose.y = Math.max(height, 0);
    pose.heading = crossing.heading;
    pose.spin = spin;
    pose.crouch = crouch;
    pose.glow = 1 + 1.8 * flash;
    pose.fade = 1;
  }

  /** What tools read (src/main.js __pond.europaLife): each creature shown, its kind and pose, and the plume. */
  report() {
    const shown = [...this.drifters, ...this.hoppers].filter((creature) => creature.pose.shown);
    return { place: this.place, plume: { ...this.plume }, creatures: shown.map((creature) => ({ kind: creature.kind, ...creature.pose })) };
  }
}
