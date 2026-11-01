// CPU probe of the ice (src/ice.js): what is thrown at a frozen lake, as the
// app throws it (src/main.js: the shore's hand, the manner's arc, and but for
// a river stone the aim of src/rock.js aimThrow), flown onto the ice and
// followed until it rests on it or has gone through, in substeps of 1/240 s
// with the splash on the CPU (src/splash.js), the hole fitted to its cavity
// as src/main.js fits it. It prints, for thin and thick ice, each thing
// thrown each way: the blow it strikes against what the ice holds (the
// header of src/ice.js; the ratio is the blow over ICE.strength·h², before
// the blow's own spread), whether it went through (●), starred the ice (✳)
// or held (·), and how far a thing that held slid. Checks, failing with exit
// code 1:
//   - what breaks what (BREAKS): a pebble, a golf, tennis or basket ball
//     never goes through either ice (its blow under HOLDS of what it holds),
//     the default stone tossed normally always through thin ice (over BREAKS
//     of it) and never through thick, a brick and a 16 lb bowling ball
//     through thin, a 30 cm rock through both; every throw's outcome is the
//     one its blow and its draw say;
//   - a thing that went through went in as into open water, its impact
//     marked through the ice (no crown or fan in its splash); its hole holds
//     its cavity's lip at every moment of its life (its crest, and
//     HOLE.fall of its fall) and the jet's foot, all round; its cracks lie on
//     the ice inside the patch;
//   - a thing that held rests on the ice, never under its top but in a hole,
//     having slid farther than on the pool's deck; one that does not roll
//     slides flat once it has tipped onto a face (its height steady to
//     BOB_TOLERANCE, never tumbling) and rests lying on that face (src/rock.js
//     lyingAttitude: never on an edge or its end), its weight over the
//     corners it rests on (rollToRest: never balanced on one lump beside
//     it, which would tip it over); a stone slid on the ice
//     goes SLIDE_RATIO times as far as on the deck; a toy slide (made to
//     stop on ice: src/things.js `material.on.ice`) held by the ice from a
//     toss or a lob slides at most SCRAPED_MOST from where it struck it,
//     where a stone skates metres on, and at least one such throw on each
//     thickness is held, so the check checks something;
//   - a Skip throw onto the ice skitters (it strikes the ice at least twice)
//     and rests on it;
//   - a stone sliding into a hole falls in (it is not held on the edge), and
//     a floater that broke through (an 11 lb bowling ball) comes up and
//     floats inside its hole; a stone at rest where a 30 cm rock breaks thin
//     ice falls in; of 6 cm stones at rest round where a 16 cm stone breaks
//     thick ice, some tip in (src/ice.js tipAtEdge: those on the new hole's
//     crushed rim) and some stay, none left with its weight within
//     ICE.crushed of the thickness of the edge, nor hanging over the hole;
//     a toy slide at rest on a 30 cm rock's new hole's crushed rim tips in,
//     pushed against its own slowing on ice, as a stone there does;
//   - things on the ice meet (src/collide.js): a stone slid into one at rest
//     knocks it on, their momentum along the slide kept to MOMENTUM_KEPT;
//   - in a frozen pool (its walls and deck, src/pool.js) everything rests on
//     the ice inside the walls or on the deck outside, never below either,
//     and a stone slid at a wall comes back off it;
//   - the same seeded throw breaks the same hole; halving the substep keeps
//     each outcome and moves where a thing rests by under STEP_TOLERANCE of
//     its slide;
//   - a break (the step, the fit, the cracks and the mask's painting) costs
//     under BREAK_MS, each break's cost its least over the same seeded throw
//     run again when it comes near the budget (a collection or another
//     process can only lengthen a measurement), the worst over the breaks;
//   - weakened and weight (src/ice.js weakness, weigh): golf balls lobbed
//     again and again at one spot on thin ice (each blow cracking it) break
//     it within REPEATS.cracks throws, though not at once; 100 ct diamonds
//     (too light to crack it) never do in REPEATS.never, nor leave a weak
//     spot, nor 6 cm stones on thick ice; a 30 cm rock set down at rest
//     goes through thin ice but not thick, a 16 lb bowling ball rests on
//     thin ice alone, two side by side break it, two 2 m apart do not; a
//     blow beside a load more than the ice holds breaks it with a finite
//     strength (ICE.loadedLeast); stars at one place are one weak spot, and
//     scattered ones at most WEAK.most; WEIGH.things at rest on the ice
//     cost weigh under WEIGH.mostMicroseconds a step, one moved weighed again;
//   - shards (src/ice.js piecesOf, each made a thing as src/main.js makes
//     it, src/rock.js adrift): a 6 cm stone through thin ice, a 16 cm one
//     and a 30 cm rock through thick, each lets go SHARDS pieces the step
//     after the break, each of ice's density, their areas at most
//     SHARD.fill of the hole's, the same pieces for the same seeded throw;
//     followed SHARD_SECONDS with the things' meetings and the hole's hold,
//     every one comes up and rests afloat, flat (on either face), at the height it floats at,
//     its outline inside its hole, none overlapping another's (src/collide.js
//     outlineOverlap) by more than OUTLINE_TOLERANCE;
//   - a pebble dropped on a piece afloat rests on it on thick ice (a piece
//     there carries some 70 g), pushes it under and goes into the water on
//     thin (a few grams), and is never flung by meeting it (no faster after
//     a step than gravity makes it); a 6 cm stone dropped on a piece of
//     thin ice breaks it into pieces that float at rest, flat and apart,
//     on thick ice pushes it under no deeper than PIECE_DIP; a pizza at rest
//     on the sheet at a hole's lip meets a piece put under it (only what lies
//     on a piece does not meet it); a piece lifted and let go drops into
//     its hole and floats again, never landing on itself; a watermelon or a
//     pie that broke thin ice meets its hole's pieces once it has flooded;
//   - the flood: the ice round the hole is wet once its cavity has closed
//     (floodAt; its shards went the step after the break), dry but glazed
//     FLOOD.dry seconds on, the far ice never wet; drops that land on the
//     ice wet it;
//   - refreezing: a hole left alone skins over in REFREEZE.after +
//     REFREEZE.closing seconds, its shards frozen in as its new ice reaches
//     them (painted as the sheet's ice), its middle ground again, thin; a
//     stone thrown at it breaks the new ice, which lets go no shards; a hole
//     with a thing thrown afloat in it stays open; each step of it costs
//     under SKIN_MS.
//
//   node tools/ice-probe.mjs [--list]
import * as THREE from 'three';
import { Rock, aimThrow, aimSkip, skipSpeed, SKIP_THROW, throwFlightTime } from '../src/rock.js';
import { THINGS, THING_NAMES } from '../src/things.js';
import { floorDepthAt } from '../src/pondFloor.js';
import { holdInPool, poolGround, POOL } from '../src/pool.js';
import { collideThings, outlineOverlap, slabOverlap, passingBy, passBy, passesBy } from '../src/collide.js';
import { SplashSystem } from '../src/splash.js';
import { IceSheet, ICE, ICE_THICKNESS, WEAK, convexHull, insidePolygon, polygonEdgeDistance } from '../src/ice.js';

const GRAVITY = 9.81;
const STEP = 1 / 240;
const PATCH = { domainMin: [-3, -4], domainSize: 6 };    // the solver's patch (src/spectralWater.js)
const POOL_SQUARE = { minX: -1.5, minZ: -2.5, size: 3 };  // its middle quarter, the pool (water.poolSquare)
const ARC = { toss: { soft: 1.18, normal: 1.0, hard: null }, lob: { soft: 1.3, normal: 1.5, hard: 1.7 } };   // src/main.js's
const WAYS = [['toss', 'soft'], ['toss', 'normal'], ['toss', 'hard'], ['lob', 'normal']];
const BREAKS = 1.5;          // a throw that must break strikes at least this times what the ice holds...
const HOLDS = 0.6;           // ...and one that must not at most this (the blow's spread, e^(±2·0.2), is 0.67 to 1.5)
const SLIDE_RATIO = 4;
const SCRAPED_MOST = 1;      // m: a toy slide that held slides no farther (it went 4 to 12 m skating as a stone does)
const MOMENTUM_KEPT = 0.05;  // of the striker's momentum
const STEP_TOLERANCE = 0.15; // of a slide
const BOB_TOLERANCE = 0.0005; // m: a thing sliding flat on its face keeps its height to this
const WEIGHT_OVER = 1e-3;    // radii: a thing at rest has its weight over what it touches the ground by, or this near it
const BREAK_MS = 25;
const SHARDS = [3, 12];      // pieces a break lets go (least, most)
const REPEATS = { cracks: 8, never: 30 };   // throws again and again at one spot: one that cracks breaks it within `cracks`; one that does not, never in `never`
const PIECE_DIP = 0.03;     // m: a piece of ice afloat pushed under by a thing goes no deeper than this
const PIECE_UNDER = 0.005;  // m: a piece put this far into the sphere of a thing at rest at a hole's lip
const OUTLINE_TOLERANCE = 0.001;   // m: two shards' outlines overlap at rest by less than this, and lie inside their hole by it
const SHARD_SECONDS = 15;    // s a break's shards are followed for
const WEIGH = { things: 60, steps: 2000, mostMicroseconds: 60 };   // things at rest on the ice weighed each step, at most this a step (they cost some 350 µs before weigh kept its answer)
const SKIN_MS = 15;          // a step of the ice's clock (a hole's shards let go; its flood, new ice, the weighing) or a shard frozen in costs under this (it was 45 to 60 ms before it was spread over steps; here 2 to 8, as the runner allows)
const LONGEST = 40;          // s: a thing not at rest on the ice nor through it by then fails...
const FARTHEST = 30;         // m: ...unless it has slid this far from the pond's middle, where src/main.js lets it go (FARTHEST_AWAY)
const listing = process.argv.includes('--list');

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };
const centimetres = (metres) => (100 * metres).toFixed(1);

/**
 * Whether a thing at rest has its weight (its volume's middle, moved by its ballast) over the outline of the corners it
 * touches the ground by, or within WEIGHT_OVER of it (radii): a watermelon on its side rests on the ridge under it.
 */
function weightOverContacts(rock) {
  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(rock.quaternion);
  const positions = rock.physicsPositions, corners = [];
  for (let index = 0; index < positions.length; index += 3) corners.push(new THREE.Vector3().fromArray(positions, index).applyMatrix4(rotation));
  const lowest = Math.min(...corners.map((corner) => corner.y));
  const weight = rock.shape.centroid.clone().add(new THREE.Vector3().fromArray(rock.thing.body.ballast ?? [0, 0, 0])).applyMatrix4(rotation);
  const touching = corners.filter((corner) => corner.y < lowest + 1e-4);
  const outline = convexHull(touching.flatMap((corner) => [corner.x - weight.x, corner.z - weight.z]));
  if (outline.length < 4) return Math.hypot(touching[0].x - weight.x, touching[0].z - weight.z) < WEIGHT_OVER;
  return (outline.length >= 6 && insidePolygon(outline, 0, 0)) || polygonEdgeDistance(outline, 0, 0) < WEIGHT_OVER;
}

/** Math.random as the shoot harness seeds it (Park–Miller). */
function seedRandom(seed) {
  let state = seed;
  Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}
seedRandom(1);

// The shore view's camera and hand (src/main.js), as the other probes have them.
const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const handFor = (radius) => {
  const beyond = Math.max(radius - 0.08, 0);
  return new THREE.Vector3(0.30, -0.32 - 1.6 * beyond, -0.55 - 1.2 * beyond).applyMatrix4(camera.matrixWorld);
};

/** What `name` is at slider `value` (src/main.js measureThing; a stone's value its diameter in cm). */
function measure(name, value) {
  const thing = THINGS[name];
  const size = value ?? thing.slider?.initial;
  return { thing, ...thing.measure(size), size };
}

/** The CPU's stand-ins for the water (a frozen lake's: its ring to the solver) and a splash system on them, as tools/skip-probe.mjs has them. */
function standIns(pool = false) {
  const water = {
    heightTexture: null, domainMin: PATCH.domainMin, domainSize: PATCH.domainSize, uvOffset: 0.5 / 512, cell: 6 / 512, depth: 0.8,
    addSplat() {}, addFoam() {}, holds: () => true, iced: true, pool,
    rings: { add() {}, uniforms: () => ({}) },
  };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  return { water, splash };
}

/** A thing thrown as the app throws it at (x, z), `manner` and `power`, onto `ice`; seeded as the harness seeds throw `seed`. */
function throwOnto(ice, name, { x = 0, z = -1.4, manner = 'toss', power = 'normal', value, seed = 1 } = {}) {
  seedRandom(seed);
  const measured = measure(name, value);
  const hand = handFor(measured.radius);
  const target = new THREE.Vector3(x, 0, z);
  const multiplier = ARC[manner][power];
  const flightTime = multiplier === null ? throwFlightTime(hand, target, power, measured.radius) : throwFlightTime(hand, target, 'normal', measured.radius) * multiplier;
  let velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  const rock = new Rock({ radius: measured.radius, position: hand, velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: measured.mass });
  if (name !== 'stone') ({ velocity } = aimThrow(hand, target, flightTime, { ...measured, mass: rock.mass }, rock.trialFlight()));
  rock.velocity.copy(velocity);
  rock.ground = ice.ground;
  return rock;
}

/**
 * Step `rock` (with `others`, met as src/main.js meets them) until it rests
 * on the ice, has gone through and settled, or LONGEST: what it did. Its
 * impact goes to a CPU splash and its hole is fitted to the cavity, as
 * src/main.js does; `contain` holds things (the pool's walls, the ice's holes).
 */
function follow(rock, ice, { step = STEP, others = [], pool = false, seconds = LONGEST } = {}) {
  const { water, splash } = standIns(pool);
  const record = { strikes: 0, broke: null, held: null, touched: null, rest: null, throughIce: null, impact: null, belowIce: 0, enteredWater: false, cavity: null, hole: null, breakMs: 0, fitMs: 0, states: new Set(), firstStrike: null, gone: false };
  const strikeBefore = ice.lastStrike;
  const things = [rock, ...others];
  const contain = (thing) => (pool ? holdInPool(thing, POOL_SQUARE) : null) ?? ice.contain(thing);
  for (let time = 0; time < seconds; time += step) {
    const heardBefore = rock.heard.length;
    const started = performance.now();
    let impact = null;
    for (const thing of things) {
      const event = thing.update(step, pool ? POOL.depth : floorDepthAt);
      if (thing === rock) impact = event;
    }
    const spent = performance.now() - started;
    if (!record.firstStrike && ice.lastStrike && ice.lastStrike !== strikeBefore) record.firstStrike = ice.lastStrike;
    collideThings(things, contain);
    record.states.add(rock.state);
    // Sliding on its face once tipped onto it (src/rock.js slideStep): its height steady.
    const sliding = rock.state === 'ground' ? rock.sliding : null;
    if (sliding && sliding.time >= sliding.seconds) {
      if (record.flat?.sliding !== sliding) record.flat = { sliding, height: rock.position.y };
      record.bob = Math.max(record.bob ?? 0, Math.abs(rock.position.y - record.flat.height));
    }
    if (rock.heard.length > heardBefore) {
      record.strikes += rock.heard.length - heardBefore;
      record.touched ??= rock.position.clone();
    }
    for (const thing of things) thing.heard.length = 0;
    if (impact && !impact.skim && !impact.ripple) {
      record.enteredWater = true;
      record.impact ??= impact;
      record.throughIce ??= Boolean(impact.throughIce);
      record.touched ??= new THREE.Vector3(impact.x, 0, impact.z);
      const before = performance.now();
      const cavity = splash.impact(impact, water);
      if (rock.iceHole && !rock.iceHole.settled) {
        ice.fitCavity(rock.iceHole, cavity, rock);
        record.fitMs = performance.now() - before;
        record.cavity = cavity;
        record.hole = rock.iceHole;
        record.breakMs = spent;
      }
    } else if (impact?.skim) {
      record.enteredWater = true;
      // A plate's slap is its entry (src/rock.js goIn): through the ice, it opens no cavity to fit its hole to.
      if (impact.slap) {
        record.impact ??= impact;
        record.throughIce ??= Boolean(impact.throughIce);
        record.hole ??= rock.iceHole;
        record.touched ??= new THREE.Vector3(impact.x, 0, impact.z);
      }
      splash.skim(impact, water);
    }
    splash.update(step, water);
    // Under the ice's top while over unbroken ice (and not gone in by a hole): it went through the ice unseen. What the
    // ground holds up, as on the deck: its ellipsoid in the air (src/rock.js ellipsoidDepth), its mesh as it slides on
    // it (slideStep) and at rest (restOn).
    const lowest = rock.state === 'rest' || rock.state === 'ground' ? rock.position.y + rock.lowestOffset() : rock.position.y - rock.ellipsoidDepth();
    if (!record.enteredWater && rock.state !== 'water' && ice.overWater(rock.position.x, rock.position.z) && !ice.holeAt(rock.position.x, rock.position.z)) {
      record.belowIce = Math.max(record.belowIce, ice.top - lowest);
    }
    if (Math.hypot(rock.position.x, rock.position.z + 1) > FARTHEST) { record.gone = true; break; }
    if (rock.state === 'rest' && others.every((other) => other.state === 'rest' || other.state === 'water')) { record.rest = time; break; }
    if (record.enteredWater && (rock.state === 'rest' || (rock.afloat && time > 8))) { record.rest = time; break; }
  }
  record.broke = Boolean(record.throughIce && record.hole);
  return record;
}

// ---- what breaks what ----
const things = [];
for (const name of THING_NAMES) {
  if (THINGS[name].hidden) continue;   // never thrown (src/things.js): the ice's own shards
  if (name === 'stone') for (const value of [1.5, 6, 16, 30]) things.push({ name, value, label: `stone ${value} cm` });
  else if (name === 'bowling') for (const value of [8, 16]) things.push({ name, value, label: `bowling ${value} lb` });
  else things.push({ name, label: THINGS[name].name });
}
const table = new Map();
const deckSlide = new Map();
console.log('What breaks what (src/ice.js): each thing thrown at (0, -1.4), its blow over what the ice holds, ● through, ✳ starred, · held (and how far it slid)\n');
console.log(`${''.padEnd(22)}${WAYS.map(([manner, power]) => `${manner} ${power}`.padEnd(30)).join('')}`);
for (const [thickness, metres] of Object.entries(ICE_THICKNESS).filter(([, metres]) => metres > 0)) {
  console.log(`${thickness} ice, ${centimetres(metres)} cm: it holds ${(ICE.strength * metres ** 2).toFixed(0)} N`);
  for (const { name, value, label } of things) {
    const cells = [];
    for (const [manner, power] of WAYS) {
      const ice = new IceSheet(PATCH);
      ice.setThickness(metres);
      const rock = throwOnto(ice, name, { manner, power, value });
      const record = follow(rock, ice);
      const strike = record.firstStrike ?? { blow: 0, holds: 1 };
      const ratio = strike.blow / (ICE.strength * metres ** 2);
      const slid = record.touched && !record.enteredWater ? Math.hypot(rock.position.x - record.touched.x, rock.position.z - record.touched.z) : 0;
      const outcome = record.broke ? '●' : ice.holes.length === 0 && ice.crackLines.length > 0 ? '✳' : '·';
      table.set(`${thickness} ${label} ${manner} ${power}`, { ratio, record, rock, ice, slid, outcome, strike, thrown: { metres, name, value, manner, power } });
      cells.push(`${outcome} ${ratio.toFixed(2).padStart(6)}${record.broke ? '' : record.gone ? ` gone past ${FARTHEST} m` : ` ${slid.toFixed(1)} m`}`.padEnd(30));
      // Every outcome is the one its own blow and draw say: through if its first blow was harder than the ice held then.
      check(record.broke === (strike.blow >= strike.holds), `${label} ${manner} ${power} on ${thickness} ice: ${record.broke ? 'went through' : 'held'} with a first blow of ${strike.blow.toFixed(0)} N against ${strike.holds.toFixed(0)} N held`);
      if (!record.broke) {
        check(record.gone || (record.rest !== null && rock.state === 'rest' && rock.onGround && Math.abs(rock.position.y + rock.lowestOffset() - ice.top) < 0.005),
          `${label} ${manner} ${power} on ${thickness} ice: held, but did not come to rest on it (${rock.state}, ${rock.position.y.toFixed(3)} m)`);
        check(!record.enteredWater, `${label} ${manner} ${power} on ${thickness} ice: held, yet went into the water`);
        check((record.bob ?? 0) <= BOB_TOLERANCE, `${label} ${manner} ${power} on ${thickness} ice: its height changed by ${centimetres(record.bob)} cm as it slid on its face`);
        if (!record.gone && !rock.sphere) {
          for (let step = 0; step < 240 && rock.settling; step++) rock.update(STEP, floorDepthAt);
          check(Math.abs(rock.quaternion.dot(rock.lyingAttitude())) > 0.9999, `${label} ${manner} ${power} on ${thickness} ice: rests not lying on a face (on an edge or an end)`);
          check(rock.thing.body.upright || weightOverContacts(rock), `${label} ${manner} ${power} on ${thickness} ice: rests with its weight beside what it stands on`);
        }
      } else {
        check(record.impact && record.throughIce, `${label} ${manner} ${power} on ${thickness} ice: went through without its impact saying so`);
      }
      check(record.belowIce < 0.003, `${label} ${manner} ${power} on ${thickness} ice: ${centimetres(record.belowIce)} cm under the ice's top, over the ice`);
    }
    console.log(`  ${label.padEnd(20)}${cells.join('')}`);
  }
}

const ratioOf = (thickness, label, manner = 'toss', power = 'normal') => table.get(`${thickness} ${label} ${manner} ${power}`).ratio;
for (const label of ['stone 1.5 cm', 'Tennis ball', 'Basketball', 'Rubber duck', 'Pizza']) {
  for (const [manner, power] of WAYS) {
    check(ratioOf('thin', label, manner, power) <= HOLDS, `${label} ${manner} ${power}: strikes thin ice at ${ratioOf('thin', label, manner, power).toFixed(2)} of what it holds, over ${HOLDS}`);
  }
}
check(ratioOf('thin', 'stone 6 cm') >= BREAKS, `the default stone tossed normally strikes thin ice at only ${ratioOf('thin', 'stone 6 cm').toFixed(2)} of what it holds`);
check(ratioOf('thick', 'stone 6 cm') <= HOLDS, `the default stone tossed normally strikes thick ice at ${ratioOf('thick', 'stone 6 cm').toFixed(2)} of what it holds`);
check(ratioOf('thin', 'Brick') >= BREAKS, `a brick strikes thin ice at only ${ratioOf('thin', 'Brick').toFixed(2)} of what it holds`);
check(ratioOf('thin', 'bowling 16 lb') >= BREAKS, `a 16 lb bowling ball strikes thin ice at only ${ratioOf('thin', 'bowling 16 lb').toFixed(2)} of what it holds`);
check(ratioOf('thick', 'stone 30 cm') >= BREAKS, `a 30 cm rock strikes thick ice at only ${ratioOf('thick', 'stone 30 cm').toFixed(2)} of what it holds`);
// A toy slide comes to a stop near where it struck the ice (but hard, it is let go fast and flat). Only a throw the
// ice held can be measured, so at least one on each thickness must be held, or this would pass checking nothing.
for (const thickness of ['thin', 'thick']) {
  let held = 0;
  for (const [manner, power] of WAYS.filter(([, power]) => power !== 'hard')) {
    const { record, slid } = table.get(`${thickness} Toy slide ${manner} ${power}`);
    if (record.broke) continue;
    held++;
    check(slid <= SCRAPED_MOST, `a toy slide ${manner} ${power} on ${thickness} ice slid ${slid.toFixed(2)} m, over ${SCRAPED_MOST} m`);
  }
  check(held >= 1, `no toy slide tossed or lobbed onto ${thickness} ice was held, so none could be measured sliding`);
}

// ---- the holes ----
console.log('\nEach hole against its cavity (src/cavity.js lipReach): the lip\'s crest and half its fall, and the jet\'s foot, inside it at every moment');
let worstMs = { break: 0, fit: 0, paint: 0 };
const totals = [];
let holes = 0;
for (const [key, entry] of table) {
  const { record, ice } = entry;
  if (!record.broke) continue;
  holes++;
  const { cavity, hole } = record;
  let outside = 0, samples = 0;
  const lip = {};
  // (A plate's slap opens no cavity: its hole is a round lip's, unfitted.)
  for (let sample = 0; cavity && sample <= 60; sample++) {
    cavity.lipAt(cavity.closeTime * sample / 60, lip);
    for (let index = 0; index < 90; index++) {
      const angle = (2 * Math.PI * index) / 90, cosine = Math.cos(angle), sine = Math.sin(angle);
      const crest = lip.mouth * cavity.shape(cosine, sine) + lip.width;
      for (const out of [crest, crest + 0.4 * cavity.radius]) {
        samples++;
        if (!ice.holeAt(lip.x + cosine * out, lip.z + sine * out)) outside++;
      }
    }
  }
  const foot = cavity ? cavity.closurePoint({}) : hole;
  check(outside === 0 && ice.holeAt(foot.x, foot.z), `${key}: ${outside} of ${samples} points of its cavity's lip lie on the ice${ice.holeAt(foot.x, foot.z) ? '' : ', and the jet\'s foot'}`);
  const painted = performance.now();
  ice.update();
  const paintMs = performance.now() - painted;
  for (const { points } of hole.cracks) {
    for (let index = 0; index < points.length; index += 2) {
      const x = points[index], z = points[index + 1];
      check(x > PATCH.domainMin[0] && x < PATCH.domainMin[0] + PATCH.domainSize && z > PATCH.domainMin[1] && z < PATCH.domainMin[1] + PATCH.domainSize && ice.overWater(x, z), `${key}: a crack runs off the ice to (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
  worstMs = { break: Math.max(worstMs.break, record.breakMs), fit: Math.max(worstMs.fit, record.fitMs), paint: Math.max(worstMs.paint, paintMs) };
  // The first break runs code not yet compiled (the app's warm-up breaks the ice once, under the veil, src/main.js).
  if (holes > 1) totals.push({ total: record.breakMs + record.fitMs + paintMs, thrown: entry.thrown });
  if (listing) console.log(`  ${key}: hole ${centimetres(hole.inner)} to ${centimetres(hole.outer)} cm, ${hole.cracks.length} cracks, a step ${record.breakMs.toFixed(2)} ms, fitted in ${record.fitMs.toFixed(2)} ms, painted in ${paintMs.toFixed(1)} ms`);
}
// A break's cost is measured once, in the middle of its throw, where a collection or another process's slice can
// land on it: a worst over 60-odd breaks catches any. So a break whose cost comes near the budget (RECHECK_SHARE of
// it) is thrown again, the same throw (seeded), up to RECHECK_RUNS times, and keeps its least: the time can only be
// lengthened by what else happens, never shortened, so the least is what the break itself costs. The worst over the
// breaks is then still the check: one break that is slow every time fails it.
const RECHECK_SHARE = 0.6, RECHECK_RUNS = 2;
let rechecked = 0;
for (const entry of totals) {
  if (entry.total < RECHECK_SHARE * BREAK_MS) continue;
  rechecked++;
  for (let run = 0; run < RECHECK_RUNS; run++) {
    const { metres, name, value, manner, power } = entry.thrown;
    const ice = new IceSheet(PATCH);
    ice.setThickness(metres);
    const record = follow(throwOnto(ice, name, { manner, power, value }), ice);
    if (!record.broke) break;   // (never: the same throw breaks the same ice)
    const painted = performance.now();
    ice.update();
    entry.total = Math.min(entry.total, record.breakMs + record.fitMs + (performance.now() - painted));
  }
}
const sortedTotals = totals.map((entry) => entry.total).sort((first, second) => first - second);
const medianTotal = sortedTotals[Math.floor(sortedTotals.length / 2)] ?? 0, worstTotal = sortedTotals.at(-1) ?? 0;
console.log(`  ${holes} holes: the worst step ${worstMs.break.toFixed(2)} ms, fit ${worstMs.fit.toFixed(2)} ms, painting ${worstMs.paint.toFixed(1)} ms; a whole break ${medianTotal.toFixed(1)} ms (median), at most ${worstTotal.toFixed(1)} ms after the first (${rechecked} near the budget thrown again, each its least of ${1 + RECHECK_RUNS})`);
check(worstTotal < BREAK_MS, `a break costs up to ${worstTotal.toFixed(1)} ms (the step, the fit and the painting), over ${BREAK_MS}`);

// ---- sliding ----
console.log('\nSliding: a stone set going at 3 m/s on the ice and on the pool\'s deck');
{
  const slide = (onIce) => {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thick);
    if (!onIce) ice.setPool(POOL_SQUARE, poolGround(POOL_SQUARE));
    seedRandom(3);
    const radius = 0.03;
    const start = onIce ? new THREE.Vector3(0, ice.top + radius, 0.5) : new THREE.Vector3(-2.5, POOL.deck + radius, 0.5);
    const rock = new Rock({ radius, position: start, velocity: new THREE.Vector3(onIce ? 0 : 0, -0.1, -3), envTexture: null });
    rock.ground = ice.ground;
    for (let time = 0; time < 30 && rock.state !== 'rest'; time += STEP) rock.update(STEP, floorDepthAt);
    return Math.hypot(rock.position.x - start.x, rock.position.z - start.z);
  };
  const onIce = slide(true), onDeck = slide(false);
  console.log(`  on the ice ${onIce.toFixed(2)} m, on the deck ${onDeck.toFixed(2)} m`);
  check(onIce > SLIDE_RATIO * onDeck, `a stone slid ${onIce.toFixed(2)} m on the ice and ${onDeck.toFixed(2)} m on the deck`);
}

// ---- a skip onto the ice ----
console.log('\nA Skip throw onto thick ice: it skitters');
{
  const ice = new IceSheet(PATCH);
  ice.setThickness(ICE_THICKNESS.thick);
  seedRandom(5);
  const radius = 0.03;
  const beyond = Math.max(radius - 0.08, 0);
  const hand = new THREE.Vector3(0.30, -0.32 - 1.6 * beyond, -0.55 - 1.2 * beyond).applyMatrix4(camera.matrixWorld);
  hand.y = Math.min(hand.y, SKIP_THROW.handHeight);
  const aimed = aimSkip(hand, new THREE.Vector3(0, 0, -1.4), skipSpeed('normal', radius, false), (x, z) => floorDepthAt(x, z) >= SKIP_THROW.shallowest, new THREE.Vector3(0, 0, -1.4));
  const rock = new Rock({ radius, position: hand, velocity: aimed.velocity, envTexture: null, skip: true });
  rock.launchSkip(aimed.velocity);
  rock.ground = ice.ground;
  const record = follow(rock, ice);
  console.log(`  it struck the ice ${record.strikes} times and ${record.broke ? 'went through' : record.gone ? `slid on past ${FARTHEST} m` : `rests ${Math.hypot(rock.position.x, rock.position.z + 1.4).toFixed(1)} m from where it was aimed`}`);
  check(record.broke || (record.strikes >= 2 && (record.gone || (rock.state === 'rest' && rock.onGround))), `a skip onto thick ice struck it ${record.strikes} times and ended ${rock.state}`);
}

// ---- into a hole ----
console.log('\nInto a hole: a stone slid into one, and a floater that broke through');
{
  const ice = new IceSheet(PATCH);
  ice.setThickness(ICE_THICKNESS.thin);
  const breaker = throwOnto(ice, 'brick', { manner: 'lob' });
  const broke = follow(breaker, ice);
  check(broke.broke, 'a brick lobbed onto thin ice did not break it');
  const hole = broke.hole ?? ice.holes[0];
  if (hole) {
    seedRandom(7);
    const radius = 0.02;
    const start = new THREE.Vector3(hole.x, ice.top + radius, hole.z + hole.outer + 0.6);
    const slider = new Rock({ radius, position: start, velocity: new THREE.Vector3(0, -0.05, -1.5), envTexture: null });
    slider.ground = ice.ground;
    const slid = follow(slider, ice, { seconds: 15 });
    console.log(`  a 4 cm stone slid at 1.5 m/s into the brick's hole: ${[...slid.states].join(' → ')}`);
    check(slid.enteredWater && !slider.grounded, `a stone slid into a hole did not fall in (${slider.state})`);
  }
  const floaterIce = new IceSheet(PATCH);
  floaterIce.setThickness(ICE_THICKNESS.thin);
  const floater = throwOnto(floaterIce, 'bowling', { value: 11, manner: 'lob' });
  const floated = follow(floater, floaterIce, { seconds: 30 });
  const its = floater.iceHole;
  const from = its ? Math.hypot(floater.position.x - its.x, floater.position.z - its.z) : Infinity;
  // Its room: the hole's edge's reach its way from the middle, less its own radius (src/ice.js contain).
  const room = its ? floaterIce.edgeReach(its, Math.atan2(floater.position.z - its.z, floater.position.x - its.x)) - floater.collisionRadius : 0;
  console.log(`  an 11 lb bowling ball lobbed onto thin ice: ${floated.broke ? 'through' : 'held'}, then ${floater.afloat ? 'afloat' : floater.state} ${its ? `${centimetres(from)} cm from its hole's middle (its room that way ${centimetres(room)} cm)` : ''}`);
  check(floated.broke && floater.afloat && from <= room + 0.005, 'an 11 lb bowling ball through thin ice did not come to float inside its hole');
}

// ---- things meeting on the ice ----
console.log('\nOn the ice, a stone slid into one at rest (src/collide.js)');
{
  const ice = new IceSheet(PATCH);
  ice.setThickness(ICE_THICKNESS.thick);
  seedRandom(11);
  const radius = 0.03;
  const resting = new Rock({ radius, position: new THREE.Vector3(0, ice.top + radius, -2), velocity: new THREE.Vector3(0, -0.05, 0), envTexture: null });
  resting.ground = ice.ground;
  for (let time = 0; time < 2 && resting.state !== 'rest'; time += STEP) resting.update(STEP, floorDepthAt);
  const striker = new Rock({ radius, position: new THREE.Vector3(0.01, ice.top + radius, -0.8), velocity: new THREE.Vector3(0, -0.05, -3), envTexture: null });
  striker.ground = ice.ground;
  const restingStart = resting.position.clone();
  let before = null, after = null;
  for (let time = 0; time < 20; time += STEP) {
    striker.update(STEP, floorDepthAt);
    resting.update(STEP, floorDepthAt);
    const momentum = striker.mass * striker.velocity.z + resting.mass * resting.velocity.z;
    if (after === null) before = momentum;
    collideThings([striker, resting], null);
    if (after === null && resting.velocity.lengthSq() > 0) after = striker.mass * striker.velocity.z + resting.mass * resting.velocity.z;
    if (striker.state === 'rest' && resting.state === 'rest') break;
  }
  const moved = Math.hypot(resting.position.x - restingStart.x, resting.position.z - restingStart.z);
  console.log(`  the stone at rest was knocked ${moved.toFixed(2)} m on; momentum along the slide ${before?.toFixed(3)} before, ${after?.toFixed(3)} kg·m/s just after`);
  check(moved > 0.2 && before !== null && after !== null && Math.abs(after - before) < MOMENTUM_KEPT * Math.abs(before), `a stone slid into one at rest on the ice knocked it ${moved.toFixed(2)} m, momentum ${before} → ${after}`);
}

// ---- a frozen pool ----
console.log('\nA frozen pool: things thrown at it rest on the ice inside its walls or on the deck outside');
{
  const inside = (x, z) => x > POOL_SQUARE.minX && x < POOL_SQUARE.minX + POOL_SQUARE.size && z > POOL_SQUARE.minZ && z < POOL_SQUARE.minZ + POOL_SQUARE.size;
  const outcomes = [];
  for (const [name, value, x, z, manner, power] of [['stone', 6, 0, -1.4, 'toss', 'hard'], ['basketball', undefined, 0.9, -2.3, 'toss', 'hard'], ['golf', undefined, -1.2, -2.3, 'toss', 'normal'], ['stone', 30, 0, -1, 'toss', 'normal'], ['tennis', undefined, 1.3, -1, 'lob', 'normal']]) {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thick);
    ice.setPool(POOL_SQUARE, poolGround(POOL_SQUARE));
    const rock = throwOnto(ice, name, { x, z, manner, power, value });
    const record = follow(rock, ice, { pool: true });
    const lowest = rock.position.y + rock.lowestOffset();
    const where = record.broke ? 'through' : inside(rock.position.x, rock.position.z) ? 'on the ice' : 'on the deck';
    outcomes.push(`${name}${value ? ` ${value}` : ''} ${where}`);
    const height = where === 'on the ice' ? ice.top : POOL.deck;
    check(record.broke || (rock.state === 'rest' && Math.abs(lowest - height) < 0.005), `${name} thrown at the frozen pool ended ${rock.state} at ${lowest.toFixed(3)} m, ${where}`);
  }
  console.log(`  ${outcomes.join('; ')}`);
  // The default stone thrown into each corner, as near the walls as a throw is aimed (src/main.js POOL_MARGIN), breaks
  // thin ice there, and a 30 cm rock too, its hole reaching to the walls and no further (src/ice.js holeBox).
  const corners = [];
  for (const [sideX, sideZ, value] of [[0, 0], [1, 0], [0, 1], [1, 1], [1, 0, 30]]) {
    const x = POOL_SQUARE.minX + (sideX ? POOL_SQUARE.size - 0.25 : 0.25), z = POOL_SQUARE.minZ + (sideZ ? POOL_SQUARE.size - 0.25 : 0.25);
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thin);
    ice.setPool(POOL_SQUARE, poolGround(POOL_SQUARE));
    const record = follow(throwOnto(ice, 'stone', { x, z, value }), ice, { pool: true, seconds: 3 });
    const hole = ice.holes[0];
    let nearest = Infinity;
    for (let index = 0; hole && index < hole.corners.length; index += 2) {
      const cornerX = hole.corners[index], cornerZ = hole.corners[index + 1];
      nearest = Math.min(nearest, cornerX - POOL_SQUARE.minX, POOL_SQUARE.minX + POOL_SQUARE.size - cornerX, cornerZ - POOL_SQUARE.minZ, POOL_SQUARE.minZ + POOL_SQUARE.size - cornerZ);
    }
    const label = value ? `a ${value} cm rock` : 'the default stone';
    corners.push(`${value ? `${value} cm ` : ''}${x.toFixed(2)}, ${z.toFixed(2)}: ${record.broke ? `broke, its edge ${centimetres(nearest)} cm from a wall` : 'held'}`);
    check(record.broke && nearest > 0 && (!value || nearest < 0.01), `${label} thrown into the frozen pool's corner at (${x.toFixed(2)}, ${z.toFixed(2)}) ${record.broke ? `broke a hole ${centimetres(nearest)} cm from the walls` : 'did not break the thin ice'}`);
  }
  console.log(`  thrown into each corner of thin ice: ${corners.join('; ')}`);
  // A stone slid at the far wall comes back off it.
  const ice = new IceSheet(PATCH);
  ice.setThickness(ICE_THICKNESS.thick);
  ice.setPool(POOL_SQUARE, poolGround(POOL_SQUARE));
  seedRandom(13);
  const rock = new Rock({ radius: 0.03, position: new THREE.Vector3(0, ice.top + 0.03, -1), velocity: new THREE.Vector3(0, -0.05, -3), envTexture: null });
  rock.ground = ice.ground;
  let turned = false;
  for (let time = 0; time < 30 && rock.state !== 'rest'; time += STEP) {
    rock.update(STEP, POOL.depth);
    holdInPool(rock, POOL_SQUARE);
    if (rock.velocity.z > 0) turned = true;
  }
  console.log(`  a stone slid at the far wall at 3 m/s: ${turned ? 'came back off it' : 'did not come back'}, rests at z ${rock.position.z.toFixed(2)}`);
  check(turned && inside(rock.position.x, rock.position.z) && rock.state === 'rest', `a stone slid at the frozen pool's wall ended ${rock.state} at z ${rock.position.z.toFixed(2)}${turned ? '' : ', never turned back'}`);
}

// ---- the same throw, and the step ----
console.log('\nThe same seeded throw twice, and with the substep halved');
{
  const run = (step) => {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thin);
    const rock = throwOnto(ice, 'stone', { value: 6, seed: 21 });
    const record = follow(rock, ice, { step });
    return { record, rock, ice, corners: ice.holes[0]?.corners };
  };
  const first = run(STEP), again = run(STEP), halved = run(STEP / 2);
  const same = first.corners && again.corners && first.corners.every((value, index) => value === again.corners[index]);
  console.log(`  the default stone on thin ice: ${first.record.broke ? 'through' : 'held'}; again ${same ? 'the same hole' : 'another hole'}; halved ${halved.record.broke ? 'through' : 'held'}`);
  check(same, 'the same seeded throw broke a different hole');
  check(first.record.broke === halved.record.broke, 'halving the substep changed whether the default stone went through thin ice');
  const runHeld = (step) => {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thick);
    const rock = throwOnto(ice, 'stone', { value: 6, seed: 23 });
    const record = follow(rock, ice, { step });
    return { rock, record };
  };
  const whole = runHeld(STEP), half = runHeld(STEP / 2);
  const slide = whole.record.touched ? Math.hypot(whole.rock.position.x - whole.record.touched.x, whole.rock.position.z - whole.record.touched.z) : 0;
  const apart = Math.hypot(whole.rock.position.x - half.rock.position.x, whole.rock.position.z - half.rock.position.z);
  console.log(`  the default stone on thick ice slid ${slide.toFixed(2)} m; with the substep halved it rests ${centimetres(apart)} cm from there`);
  check(apart < STEP_TOLERANCE * Math.max(slide, 0.1), `halving the substep moved where the default stone rests on thick ice by ${centimetres(apart)} cm of a ${slide.toFixed(2)} m slide`);
}

// ---- shards, the flood, new ice (src/ice.js) ----
/**
 * A stone `diameter` cm thrown (seeded `seed`, lobbed) onto ice `thickness`
 * (ICE_THICKNESS's name), then the world stepped as src/main.js steps it:
 * the ice's clock, its shards made things (adrift, held in their hole), the
 * things' meetings, its new ice reaching a shard freezing it in, a floater
 * in a hole keeping it open; `others` thrown too. step(seconds) steps on.
 */
function iceWorld({ diameter = 6, thickness = 'thin', seed = 1, x = 0, z = -1.4, lob = 1.5 } = {}) {
  seedRandom(seed);
  const ice = new IceSheet(PATCH);
  ice.setThickness(ICE_THICKNESS[thickness]);
  const { water, splash } = standIns();
  splash.setIce(ice);
  const world = { ice, splash, things: [], shards: [], frozen: [], broken: [], time: 0, opened: 0, costs: { release: 0, clock: 0, paint: 0, freeze: 0 } };
  world.throwStone = (stoneDiameter, at = { x, z }, lobbed = lob) => {
    const radius = stoneDiameter / 200;
    const hand = handFor(radius), target = new THREE.Vector3(at.x, 0, at.z);
    const flight = throwFlightTime(hand, target, 'normal', radius) * lobbed;
    const velocity = target.clone().sub(hand).divideScalar(flight);
    velocity.y += 0.5 * GRAVITY * flight;
    const stone = new Rock({ radius, position: hand, velocity, envTexture: null, thing: 'stone' });
    stone.ground = ice.ground;
    world.things.push(stone);
    return stone;
  };
  world.add = (rock) => { rock.ground = ice.ground; world.things.push(rock); return rock; };
  world.step = (seconds) => {
    for (const until = world.time + seconds; world.time < until - 1e-9; world.time += STEP) {
      // What the ice's clock costs a step: flooding round a hole whose cavity has closed, drying, preparing and growing
      // new ice, and weighing what lies on it (weigh); a hole's shards let go are the step's end's (below), the break's
      // own painting the break's (BREAK_MS).
      let started = performance.now();
      ice.setTime(world.time);
      ice.weigh(world.things);
      world.costs.clock = Math.max(world.costs.clock, performance.now() - started);
      for (const thing of world.things) {
        const impact = thing.update(STEP, floorDepthAt);
        if (impact && !impact.skim && !impact.ripple) {
          const cavity = splash.impact(impact, water);
          if (impact.throughIce) ice.fitCavity(thing.iceHole, cavity, thing);
        }
        thing.heard.length = 0;
      }
      collideThings(world.things, (thing) => ice.contain(thing));
      // At the step's end, as src/main.js: what the ice lets go by the next step's time (a hole's shards the step after
      // its break, the parts of a piece split in this one) made things, and a piece broken up (splitPiece) gone. Its cost
      // is the release's.
      started = performance.now();
      ice.letGo(world.time + STEP);
      const pieces = ice.shards.splice(0);
      if (pieces.length > 0) world.costs.release = Math.max(world.costs.release, performance.now() - started);
      for (const piece of pieces) {
        const shard = new Rock({ radius: piece.radius, position: piece.start.position, velocity: piece.start.velocity, envTexture: null, thing: 'ice-shard', mass: piece.mass, piece: piece.shape });
        shard.breakAway(piece.start);
        piece.hole.letGo ??= world.time + STEP;
        shard.iceHole = piece.hole;
        shard.ground = ice.ground;
        shard.pieceOf = piece;
        ice.adopt(shard);
        world.shards.push(shard);
        world.things.push(shard);
      }
      for (const broken of world.things.filter((thing) => thing.brokenUp)) {
        world.things.splice(world.things.indexOf(broken), 1);
        world.shards.splice(world.shards.indexOf(broken), 1);
        ice.forget(broken);
        world.broken.push(broken);
      }
      splash.update(STEP, water);
      // Once a frame (src/main.js render): the mask painted.
      if (Math.round(world.time / STEP) % 4 === 0) {
        started = performance.now();
        const painting = ice.holes.some((hole) => !hole.painted);
        ice.update();
        if (!painting) world.costs.paint = Math.max(world.costs.paint, performance.now() - started);
      }
      // At each step's end (src/main.js endStep): shards frozen in, holes with a floater in them stirred, what rests where
      // a hole has opened let fall.
      {
        for (const thing of [...world.things]) {
          if (!thing.iceHole || !(thing.state === 'float' || thing.afloat)) continue;
          if (!thing.piece) ice.disturb(thing.iceHole);
          else if (ice.reaches(thing)) {
            started = performance.now();
            ice.freezeIn(thing);
            world.costs.freeze = Math.max(world.costs.freeze, performance.now() - started);
            world.things.splice(world.things.indexOf(thing), 1);
            world.frozen.push(thing);
          }
        }
        if (ice.opened !== world.opened) {
          world.opened = ice.opened;
          for (const thing of world.things) if (thing.state === 'rest' && thing.onGround && ice.holeAt(thing.position.x, thing.position.z)) thing.loseGround();
        }
      }
    }
  };
  return world;
}
/** The mask's bytes (R, G, B, A) at (x, z). */
const maskAt = (ice, x, z) => {
  const texel = Math.floor((z - PATCH.domainMin[1]) / ice.cell) * ice.texels + Math.floor((x - PATCH.domainMin[0]) / ice.cell);
  return [...ice.maskData.slice(4 * texel, 4 * texel + 4)];
};
const GLAZE = 51;   // B once wet and dry (src/ice.js FLOOD.glaze, 0.2 of 255)

console.log('\nWeakened and weight (src/ice.js weakness, weigh): the same throw again and again at one spot, and things set down on the ice');
{
  // Again and again at (0, -1.4): a throw that cracks thin ice there breaks it in a few; one that never cracks it, never.
  const again = (name, { manner = 'toss', thickness = 'thin', value, times }) => {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS[thickness]);
    for (let throwIndex = 1; throwIndex <= times; throwIndex++) {
      const record = follow(throwOnto(ice, name, { manner, value, seed: throwIndex }), ice, { seconds: 12 });
      if (record.broke) return { broke: throwIndex, weak: ice.weakSpots.length };
    }
    return { broke: null, weak: ice.weakSpots.length };
  };
  const golf = again('golf', { manner: 'lob', times: REPEATS.cracks });
  const diamond = again('diamond', { value: 100, times: REPEATS.never });
  const stone = again('stone', { thickness: 'thick', times: REPEATS.never });
  console.log(`  golf balls lobbed at thin ice: ${golf.broke ? `through on throw ${golf.broke}, ${golf.weak} weak spot(s) before` : `held ${REPEATS.cracks} throws`}; 100 ct diamonds tossed: ${diamond.broke ? `through on throw ${diamond.broke}` : `held ${REPEATS.never}, ${diamond.weak} weak spots`}; 6 cm stones tossed at thick ice: ${stone.broke ? `through on throw ${stone.broke}` : `held ${REPEATS.never}, ${stone.weak} weak spots`}`);
  check(golf.broke !== null && golf.broke > 1, `golf balls lobbed again and again at one spot on thin ice did not break it after cracking it (${golf.broke})`);
  check(diamond.broke === null && diamond.weak === 0, `100 ct diamonds, too light to crack thin ice, broke or cracked it (${diamond.broke}, ${diamond.weak} weak spots)`);
  check(stone.broke === null, `6 cm stones broke thick ice (throw ${stone.broke})`);

  // Set down at rest: what the ice bears.
  const setDown = (thickness, things) => {
    const world = iceWorld({ thickness });
    const rocks = things.map(({ name, value, x }) => {
      const measured = measure(name, value);
      const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(x, world.ice.top + measured.radius + 0.002, -1.4), velocity: new THREE.Vector3(0, -0.05, 0), envTexture: null, thing: name, mass: measured.mass });
      return world.add(rock);
    });
    world.step(3);
    return { through: rocks.filter((rock) => rock.iceHole).length, holes: world.ice.holes.length };
  };
  const cases = [
    ['a 30 cm rock on thin ice', 'thin', [{ name: 'stone', value: 30, x: 0 }], true],
    ['a 30 cm rock on thick ice', 'thick', [{ name: 'stone', value: 30, x: 0 }], false],
    ['a 16 lb bowling ball on thin ice', 'thin', [{ name: 'bowling', value: 16, x: 0 }], false],
    ['two 16 lb bowling balls side by side on thin ice', 'thin', [{ name: 'bowling', value: 16, x: -0.12 }, { name: 'bowling', value: 16, x: 0.12 }], true],
    ['two 16 lb bowling balls 2 m apart on thin ice', 'thin', [{ name: 'bowling', value: 16, x: -1 }, { name: 'bowling', value: 16, x: 1 }], false],
  ];
  for (const [label, thickness, things, breaks] of cases) {
    const { through, holes } = setDown(thickness, things);
    console.log(`  ${label}: ${holes ? `gave way, ${through} through` : 'held'}`);
    check((holes > 0) === breaks && (!breaks || through > 0), `${label}: ${holes ? 'gave way' : 'held'}, which it should not`);
  }

  // Things at rest on the ice cost weigh next to nothing a step: it held, and nothing has moved (src/ice.js `held`); one
  // set down beside them weighs them all again.
  {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thick);
    seedRandom(5);
    const resting = [];
    for (let index = 0; index < WEIGH.things; index++) {
      const rock = new Rock({ radius: 0.03, position: new THREE.Vector3(-2 + 4 * Math.random(), ice.top + 0.03, -3 + 3 * Math.random()), velocity: new THREE.Vector3(), envTexture: null, thing: 'stone' });
      rock.ground = ice.ground;
      rock.restOn(ice.top);
      resting.push(rock);
    }
    for (let step = 0; step < 50; step++) ice.weigh(resting);
    const started = performance.now();
    for (let step = 0; step < WEIGH.steps; step++) ice.weigh(resting);
    const perStep = (performance.now() - started) / WEIGH.steps;
    const keptAnswer = ice.held.entries.length;
    resting[0].position.x += 0.01;
    ice.weigh(resting);
    const weighedAgain = ice.held.entries[0].x === resting[0].position.x;
    console.log(`  ${WEIGH.things} stones at rest on thick ice: weighing them costs ${(1000 * perStep).toFixed(1)} µs a step (${keptAnswer} held), one moved weighs them again: ${weighedAgain}`);
    check(1000 * perStep < WEIGH.mostMicroseconds && weighedAgain, `${WEIGH.things} things at rest on the ice cost weigh ${(1000 * perStep).toFixed(1)} µs a step${weighedAgain ? '' : ', and one moved is not weighed again'}`);
  }

  // Struck beside a load more than the ice holds there (weigh breaks at the mean; a blow draws its own, lower): it holds
  // ICE.loadedLeast of what it would whole, so the break's strength is the blow's over that, never endless.
  {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thin);
    const whole = ICE.strength * ICE_THICKNESS.thin ** 2;
    const load = new Rock({ radius: 0.1, position: new THREE.Vector3(0.05, 0, -1.4), velocity: new THREE.Vector3(), envTexture: null });
    ice.onIce.push({ rock: load, weight: 3 * whole });
    const rock = throwOnto(ice, 'stone', { manner: 'lob', seed: 1 });
    const record = follow(rock, ice, { seconds: 2 });
    ice.update();
    const hole = ice.holes[0], most = (ice.lastStrike?.blow ?? 0) / (ICE.loadedLeast * whole);   // its blow as it struck
    console.log(`  a 6 cm stone lobbed beside a load of three times what thin ice holds: ${hole ? `through, its break ${hole.strength.toFixed(0)} times what it held (at most ${most.toFixed(0)}), ${hole.cracks.length} cracks` : 'held'}`);
    check(record.broke && hole && hole.strength < 1000 && hole.strength <= most * 1.0001, `a blow beside a load the ice cannot hold broke it with a strength of ${hole?.strength}`);
  }

  // Stars again and again: at one place they are one spot, weaker each time to ICE.weakest; scattered, at most WEAK.most.
  {
    const ice = new IceSheet(PATCH);
    ice.setThickness(ICE_THICKNESS.thin);
    let state = 7;
    const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
    for (let star = 0; star < 20; star++) ice.star(0, -1.4, random, 0.9);
    const one = { spots: ice.weakSpots.length, share: ice.weakness(0, -1.4) };
    for (let star = 0; star < 300; star++) ice.star(-2.5 + 5 * random(), -3.5 + 5 * random(), random, 0.9);
    console.log(`  20 stars at one place: ${one.spots} weak spot, holding ${(100 * one.share).toFixed(0)}% there; 300 more scattered: ${ice.weakSpots.length} spots (at most ${WEAK.most})`);
    check(one.spots === 1 && Math.abs(one.share - ICE.weakest) < 1e-9, `20 stars at one place made ${one.spots} weak spots, holding ${one.share.toFixed(2)}`);
    check(ice.weakSpots.length <= WEAK.most, `${ice.weakSpots.length} weak spots, over ${WEAK.most}`);
  }
}

console.log('\nShards: the pieces a break lets go, followed as things (src/rock.js adrift, src/collide.js, src/ice.js contain)');
for (const [diameter, thickness, seed] of [[6, 'thin', 1], [16, 'thick', 2], [30, 'thick', 3]]) {
  const label = `a ${diameter} cm stone through ${thickness} ice`;
  const world = iceWorld({ diameter, thickness, seed });
  world.throwStone(diameter);
  world.step(SHARD_SECONDS);
  const { ice, shards } = world;
  const hole = ice.holes[0];
  if (!check(hole, `${label}: no hole`)) continue;
  const holeArea = Math.abs(hole.corners.reduce((sum, value, index, corners) => (index % 2 ? sum : sum + value * corners[(index + 3) % corners.length] - corners[(index + 2) % corners.length] * corners[index + 1]), 0)) / 2;
  const discs = shards.reduce((sum, shard) => sum + shard.pieceOf.area, 0);
  const lateness = (hole.letGo ?? Infinity) - hole.openedAt;
  let outside = 0, unsettled = 0, tilted = 0, overlap = 0, density = 0;
  for (const shard of shards) {
    // Each corner of its outline, as it is turned, inside the hole's edge at its own azimuth.
    const corners = shard.piece.corners;
    let past = 0;
    for (let index = 0; index < corners.length; index += 2) {
      const corner = new THREE.Vector3(corners[index] * shard.radius, 0, corners[index + 1] * shard.radius).applyQuaternion(shard.quaternion);
      const cornerX = shard.position.x + corner.x - hole.x, cornerZ = shard.position.z + corner.z - hole.z;
      past = Math.max(past, Math.hypot(cornerX, cornerZ) - ice.edgeReach(hole, Math.atan2(cornerZ, cornerX)));
    }
    if (past > OUTLINE_TOLERANCE) outside++;
    if (!(shard.afloat && shard.state === 'rest') || Math.abs(shard.position.y - shard.floatingHeight()) > 0.003) unsettled++;
    // Flat on either face: a slab driven under may come up over (clear ice looks the same either way up).
    if (Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(shard.quaternion).y) < Math.cos(THREE.MathUtils.degToRad(5))) tilted++;
    density = Math.max(density, Math.abs(shard.density / 917 - 1));
    for (const other of shards) if (other !== shard) overlap = Math.max(overlap, outlineOverlap(shard, other)?.depth ?? 0);
  }
  const again = iceWorld({ diameter, thickness, seed });
  again.throwStone(diameter);
  again.step(lateness + 2.5);
  const same = again.shards.length === shards.length && again.shards.every((shard, index) => shard.pieceOf.corners.every((value, corner) => value === shards[index].pieceOf.corners[corner]));
  console.log(`  ${label}: ${shards.length} shards ${centimetres(Math.min(...shards.map((shard) => 2 * shard.radius)))} to ${centimetres(Math.max(...shards.map((shard) => 2 * shard.radius)))} cm across, let go ${(1000 * lateness).toFixed(1)} ms after the break; their areas ${(100 * discs / holeArea).toFixed(0)}% of the hole's; after ${SHARD_SECONDS} s ${shards.length - unsettled} at rest afloat, ${tilted} tilted, ${outside} outside the hole, overlapping by ${Math.max(1000 * overlap, 0).toFixed(1)} mm at most; again ${same ? 'the same pieces' : 'other pieces'}`);
  check(shards.length >= SHARDS[0] && shards.length <= SHARDS[1], `${label}: ${shards.length} shards`);
  check(lateness <= 1.5 * STEP, `${label}: its shards were let go ${(1000 * lateness).toFixed(1)} ms after the break, not at it`);
  check(discs <= 0.62 * holeArea + 1e-9, `${label}: its shards' areas cover ${(100 * discs / holeArea).toFixed(0)}% of the hole's`);
  check(density < 1e-3, `${label}: a shard's density is off ice's by ${(100 * density).toFixed(2)}%`);
  check(unsettled === 0 && tilted === 0, `${label}: after ${SHARD_SECONDS} s ${unsettled} shards are not at rest afloat at their height, ${tilted} not flat`);
  check(outside === 0, `${label}: ${outside} shards are outside their hole`);
  check(overlap < OUTLINE_TOLERANCE, `${label}: two shards' outlines overlap by ${(1000 * overlap).toFixed(1)} mm`);
  check(same, `${label}: the same seeded throw let go other pieces`);
}

console.log('\nA pebble on a piece afloat (src/ice.js pieceUnder, landOnPiece; src/collide.js slabOverlap)');
for (const [thickness, diameter, carries] of [['thick', 16, true], ['thin', 6, false]]) {
  const world = iceWorld({ diameter, thickness, seed: 1 });
  world.throwStone(diameter);
  world.step(10);
  const piece = world.shards.filter((shard) => shard.state === 'rest' || shard.state === 'float').sort((one, other) => other.radius - one.radius)[0];
  if (!check(piece, `${thickness} ice: no piece afloat to drop a pebble on`)) continue;
  const pebble = world.add(new Rock({ radius: 0.01, position: new THREE.Vector3(piece.position.x, 0.05, piece.position.z), velocity: new THREE.Vector3(0, -2, 0), envTexture: null, thing: 'stone' }));
  // Never faster after a step than gravity alone makes it: no meeting flings it (a ball round the piece once did).
  let gained = 0;
  for (let time = 0; time < 3; time += STEP) {
    const before = pebble.velocity.length();
    world.step(STEP);
    gained = Math.max(gained, pebble.velocity.length() - before - GRAVITY * STEP);
  }
  const top = world.ice.pieceUnder(pebble.position.x, pebble.position.z)?.top;
  const resting = pebble.state === 'rest' && pebble.onGround && top !== undefined && Math.abs(pebble.position.y + pebble.lowestOffset() - top) < 0.003;
  const under = pebble.state === 'water' || (pebble.state === 'rest' && pebble.position.y < -0.05);
  console.log(`  a 2 cm pebble dropped at 2 m/s on a ${centimetres(2 * piece.radius)} cm piece of ${thickness} ice (it carries ${(1000 * world.ice.pieceCarries(piece)).toFixed(0)} g): ${resting ? 'rests on it' : under ? 'pushed it under and went into the water' : pebble.state}; gained at most ${gained.toFixed(2)} m/s in a step`);
  check(carries ? resting : under, `a pebble dropped on a piece of ${thickness} ice ${resting ? 'rests on it' : under ? 'went under' : `ended ${pebble.state}`}, which it should not`);
  check(gained < 0.05, `a pebble dropped on a piece of ${thickness} ice was flung, gaining ${gained.toFixed(2)} m/s in a step`);
}

// A piece afloat picked up, lifted and let go (src/main.js grab): its own top is no ground under it, held or falling
// (src/ice.js pieceUnder leaves out what asks, and what is held), so it drops into its hole and floats again; it never
// lands on itself (once it pushed itself under and went in past itself).
{
  const world = iceWorld({ diameter: 16, thickness: 'thick', seed: 1 });
  world.throwStone(16);
  world.step(10);
  const piece = world.shards.filter((shard) => shard.state === 'rest' || shard.state === 'float').sort((one, other) => other.radius - one.radius)[0];
  piece.hold();
  const liftedTo = new THREE.Vector3(piece.position.x, 0.15, piece.position.z);
  piece.moveHeld(liftedTo);
  const heldGround = world.ice.ground.at(liftedTo.x, liftedTo.z, piece);
  piece.release();
  for (let time = 0; time < 8; time += STEP) {
    piece.update(STEP, floorDepthAt);
    collideThings(world.things, (thing) => world.ice.contain(thing));
  }
  const onItself = passingBy(piece, piece);   // a piece pushed under by itself (src/collide.js passBy)
  const afloat = (piece.afloat || piece.state === 'float' || piece.state === 'rest') && Math.abs(piece.position.y - piece.floatingHeight()) < 0.01;
  console.log(`  a ${centimetres(2 * piece.radius)} cm piece of thick ice lifted to 15 cm and let go: its own top ${heldGround === null ? 'no ground under it' : `ground at ${centimetres(heldGround)} cm`}; ${onItself ? 'landed on itself' : afloat ? 'dropped into its hole and floats' : `ended ${piece.state} at ${centimetres(piece.position.y)} cm`}`);
  check(!onItself && afloat && (heldGround === null || heldGround < liftedTo.y - piece.radius * piece.piece.thickness), `a piece afloat lifted and let go ${onItself ? 'landed on itself' : `ended ${piece.state} at ${centimetres(piece.position.y)} cm`} (the ground under it held: ${heldGround})`);
}

// The pairs that pass each other by (src/collide.js passBy): a pair passing for two reasons (what broke a hole and split
// one of its pieces: until the hole floods, and until they are apart) passes until both have ended; a piece of a hole
// not yet flooded, taken in hand and put back in it, passes the hole's breaker again (src/ice.js adopt, as src/main.js
// endGrab calls it).
{
  const sphere = (x) => ({ centre: new THREE.Vector3(x, 0, 0), radius: 0.05, collisionRadius: 0.05 });
  const piece = sphere(0), thing = sphere(0.02);
  let flooded = false;
  passBy(piece, thing);
  passBy(piece, thing, () => flooded);
  const overlapping = passesBy(piece, thing);
  thing.centre.x = 0.5;
  const apartNotFlooded = passesBy(thing, piece);
  flooded = true;
  thing.centre.x = 0.02;
  const floodedOverlapping = passesBy(piece, thing);
  const piece2 = sphere(0), thing2 = sphere(0.02);
  let flooded2 = false;
  passBy(piece2, thing2, () => flooded2);
  passBy(piece2, thing2);
  flooded2 = true;
  const floodedStillOverlapping = passesBy(piece2, thing2);
  thing2.centre.x = 0.5;
  const ended = !passesBy(piece2, thing2) && !passingBy(piece2, thing2) && !passingBy(thing2, piece2);
  // (Once apart, that reason has ended for good: the first pair, apart before the flood, meets once the hole floods.)
  console.log(`  a pair passing until a flood and until apart: overlapping ${overlapping}, apart before the flood ${apartNotFlooded}, then flooded ${floodedOverlapping}; one flooded while overlapping ${floodedStillOverlapping}, then apart ${!ended}`);
  check(overlapping && apartNotFlooded && !floodedOverlapping && floodedStillOverlapping && ended, `a pair passing for two reasons passes until both have ended (overlapping ${overlapping}, apart before the flood ${apartNotFlooded}, then flooded ${floodedOverlapping}; flooded while overlapping ${floodedStillOverlapping}, then apart ${!ended})`);

  const world = iceWorld({ diameter: 16, thickness: 'thin', seed: 1 });
  const stone = world.throwStone(16);
  for (let time = 0; time < 2 && world.shards.length === 0; time += STEP) world.step(STEP);
  const shard = world.shards.find((candidate) => candidate.iceHole && !candidate.iceHole.flooded && passingBy(candidate, stone));
  let taken = false, forgotten = false, again = false;
  if (shard) {
    taken = true;
    shard.hold();
    forgotten = !passingBy(shard, stone);
    shard.release();
    world.ice.adopt(shard);
    again = passingBy(shard, stone);
  }
  console.log(`  a piece of a hole not yet flooded taken in hand: ${taken ? `its pass with the breaker forgotten ${forgotten}, put back and passing it again ${again}` : 'none found'}`);
  check(taken && forgotten && again, `a piece of a hole not yet flooded, taken and put back, passes the hole's breaker again (${taken ? `forgotten ${forgotten}, again ${again}` : 'no piece found'})`);
  // The breaker gone before its hole floods (faded past a cap: src/main.js retireRock, ice.forget): the hole no longer
  // names it, so a piece put back then passes nothing gone.
  let goneLetGo = false;
  if (shard) {
    world.ice.forget(stone);
    shard.hold();
    shard.release();
    world.ice.adopt(shard);
    goneLetGo = world.ice.holes.every((hole) => hole.by !== stone) && !passingBy(shard, stone);
  }
  console.log(`  the breaker gone before its hole floods: ${shard ? `no hole names it and a piece put back passes it ${!goneLetGo}` : 'no piece found'}`);
  check(goneLetGo, `a hole's breaker gone before the flood is let go: a piece put back does not pass it (${shard ? `passes ${!goneLetGo}` : 'no piece found'})`);
}

// A floater that broke thin ice (a watermelon, a pie) floats back up in its own hole: it passes its pieces by only until
// the hole floods (src/ice.js setTime), then meets them as anything afloat does, never drifting through them.
for (const name of ['watermelon', 'pie']) {
  const world = iceWorld({ thickness: 'thin', seed: 1 });
  const measured = measure(name);
  const thing = world.add(new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 1.2, -1.4), velocity: new THREE.Vector3(0, -3, 0), envTexture: null, thing: name, mass: measured.mass }));
  let deepest = 0;
  for (let time = 0; time < 25; time += STEP) {
    world.step(STEP);
    if (thing.iceHole?.flooded) for (const shard of world.shards) if (shard.iceHole === thing.iceHole) deepest = Math.max(deepest, slabOverlap(shard, thing)?.depth ?? 0);
  }
  console.log(`  a ${name} through thin ice and back up in its hole: ${thing.iceHole ? `${world.shards.filter((shard) => shard.iceHole === thing.iceHole).length} pieces, overlapping it by ${(1000 * deepest).toFixed(1)} mm at most once the hole flooded` : 'it held'}`);
  check(thing.iceHole && deepest < 0.005, `a ${name} that broke thin ice ${thing.iceHole ? `drifts through its hole's pieces (${(1000 * deepest).toFixed(1)} mm)` : 'did not go through'}`);
}

// A thing at rest on the sheet at a hole's lip meets a piece that drifts under it (slabOverlap), as in the air; only what
// lies on a piece does not meet that one (src/ice.js pieceUnder). A pizza, its sphere reaching well over the hole from
// the ice it lies on (a stone's reaches its slab by a millimetre or two at most, and only as its random shape lies), the
// piece put under it until its slab is PIECE_UNDER into that sphere.
{
  const world = iceWorld({ diameter: 16, thickness: 'thick', seed: 1 });
  world.throwStone(16);
  world.step(10);
  const piece = world.shards.filter((shard) => shard.state === 'rest' || shard.state === 'float').sort((one, other) => other.radius - one.radius)[0];
  const hole = piece.iceHole, angle = Math.atan2(piece.position.z - hole.z, piece.position.x - hole.x);
  const measured = measure('pizza');
  const out = world.ice.edgeReach(hole, angle) + 0.05;
  const pizza = world.add(new Rock({ radius: measured.radius, position: new THREE.Vector3(hole.x + Math.cos(angle) * out, world.ice.top + 0.03, hole.z + Math.sin(angle) * out), velocity: new THREE.Vector3(0, -0.05, 0), envTexture: null, thing: 'pizza', mass: measured.mass }));
  world.step(3);
  for (let moved = 0; moved < 0.3 && (slabOverlap(piece, pizza)?.depth ?? 0) < PIECE_UNDER; moved += 0.001) {
    piece.position.x += 0.001 * Math.cos(angle);
    piece.position.z += 0.001 * Math.sin(angle);
    piece.syncMeshes();
  }
  const before = slabOverlap(piece, pizza)?.depth ?? 0;
  const resting = pizza.grounded && world.ice.at(pizza.position.x, pizza.position.z) !== null;
  collideThings([piece, pizza]);
  const after = slabOverlap(piece, pizza)?.depth ?? 0;
  console.log(`  a pizza at rest on thick ice at a hole's lip, a piece put ${(1000 * before).toFixed(1)} mm into it: ${after < before / 2 ? `they meet, ${(1000 * after).toFixed(1)} mm after a pass` : 'they pass through each other'}`);
  check(resting && before >= PIECE_UNDER, `a pizza at a hole's lip: ${resting ? `the piece reached only ${(1000 * before).toFixed(1)} mm into it` : `it is not on the ice (${pizza.state})`}`);
  check(after < before / 2, `a piece under a pizza at rest on the ice at a hole's lip passed through it (${(1000 * before).toFixed(1)} mm, then ${(1000 * after).toFixed(1)} mm)`);
}

// A 6 cm stone dropped on a piece: thin ice breaks under it into pieces of its own; thick does not, and goes under it, a
// little, tipping; never deeper than PIECE_DIP, so it is never lost from sight.
for (const [thickness, diameter, breaks] of [['thin', 6, true], ['thick', 16, false]]) {
  const world = iceWorld({ diameter, thickness, seed: 1 });
  world.throwStone(diameter);
  world.step(10);
  const piece = world.shards.filter((shard) => shard.state === 'rest' || shard.state === 'float').sort((one, other) => other.radius - one.radius)[0];
  if (!check(piece, `${thickness} ice: no piece afloat to drop a stone on`)) continue;
  const before = world.shards.length, top = (shard) => shard.position.y + (shard.piece.thickness * shard.radius) / 2;
  // The stone's shape is a seeded draw of its own, as a thrown thing's is (throwOnto): its blow, m·v²/R, follows its
  // collision radius, and the first throw's splash (its foam and bubbles) takes what it needs from Math.random before
  // this, so an unseeded stone's shape, and whether the piece breaks, would follow the splash's draws.
  seedRandom(1);
  const stone = world.add(new Rock({ radius: 0.03, position: new THREE.Vector3(piece.position.x + 0.3 * piece.radius, 0.06, piece.position.z), velocity: new THREE.Vector3(0, -4, 0), envTexture: null, thing: 'stone' }));
  let deepest = 0;
  for (let time = 0; time < 4; time += STEP) {
    world.step(STEP);
    if (!piece.brokenUp) deepest = Math.min(deepest, top(piece));
  }
  world.step(11);
  const parts = world.shards.length - before + (piece.brokenUp ? 1 : 0);
  let overlap = 0, unsettled = 0;
  for (const shard of world.shards) {
    if (!(shard.afloat && shard.state === 'rest') || Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(shard.quaternion).y) < Math.cos(THREE.MathUtils.degToRad(5))) unsettled++;
    for (const other of world.shards) if (other !== shard) overlap = Math.max(overlap, outlineOverlap(shard, other)?.depth ?? 0);
  }
  console.log(`  a 6 cm stone dropped at 4 m/s on a ${centimetres(2 * piece.radius)} cm piece of ${thickness} ice: ${piece.brokenUp ? `broke it into ${parts}` : `pushed it under, its top at most ${centimetres(-deepest)} cm under`}; the stone ${stone.iceHole ? 'went in' : stone.state}; 15 s on, ${world.shards.length - unsettled} of ${world.shards.length} pieces at rest afloat and flat, overlapping by ${(1000 * overlap).toFixed(1)} mm at most`);
  check(piece.brokenUp === breaks && (!breaks || parts >= 2) && stone.iceHole, `a 6 cm stone on a piece of ${thickness} ice: ${piece.brokenUp ? 'broke' : 'did not break'} it (${parts} parts), the stone ${stone.state}`);
  check(breaks || -deepest <= PIECE_DIP, `a piece of ${thickness} ice pushed under went ${centimetres(-deepest)} cm under`);
  check(unsettled === 0 && overlap < OUTLINE_TOLERANCE, `after a stone on a piece of ${thickness} ice, ${unsettled} pieces not at rest afloat and flat, overlapping by ${(1000 * overlap).toFixed(1)} mm`);
}

console.log('\nThe flood: the ice round a hole wet once its cavity has closed, then glazed; drops wet it');
{
  const world = iceWorld({ diameter: 6, thickness: 'thin', seed: 1 });
  world.throwStone(6);
  world.step(3);
  const { ice } = world;
  const hole = ice.holes[0];
  const ring = (share) => Array.from({ length: 24 }, (unused, index) => {
    const angle = (2 * Math.PI * index) / 24;
    return maskAt(ice, hole.x + Math.cos(angle) * ice.edgeReach(hole, angle) * share, hole.z + Math.sin(angle) * ice.edgeReach(hole, angle) * share)[2];
  });
  const near = ring(1.15), far = maskAt(ice, hole.x + 2.5, hole.z)[2];
  const wetNear = near.filter((byte) => byte > GLAZE + 100).length;
  world.step(75 + 1);
  const dried = ring(1.15).filter((byte) => byte !== GLAZE).length;
  console.log(`  a 6 cm stone through thin ice: wet just round its hole at ${wetNear} of 24 points, ${far > 0 ? 'wet' : 'dry'} 2.5 m off; ${75 + 1} s on, ${24 - dried} of them dry and glazed; ${ice.budget.wet} texels still wet`);
  check(wetNear >= 20, `the ice round a hole is wet at only ${wetNear} of 24 points`);
  check(far === 0, 'the ice 2.5 m from a hole was wetted');
  check(dried === 0, `${dried} points round a hole are not dry and glazed ${75 + 1} s on`);
  const spot = new IceSheet(PATCH);
  spot.setThickness(ICE_THICKNESS.thin);
  spot.wetSpot(0.5, -1, 0.02);
  spot.update();
  check(maskAt(spot, 0.5, -1)[2] > GLAZE, 'a drop landing on the ice did not wet it');
}

console.log('\nNew ice: a hole left alone skins over; a thing afloat in one keeps it open');
{
  const world = iceWorld({ diameter: 16, thickness: 'thick', seed: 2 });
  world.throwStone(16);
  world.step(5);
  const { ice } = world;
  const hole = ice.holes[0];
  const shardsBefore = world.shards.length;
  world.step(40 + 30 + 2 - 5);
  // A point of its new ice near its middle with room for the stone round it: not where a shard froze in, nor the old ice,
  // for the stone's radius and a margin round where it lands (the candidate with the widest ring of new ice about it).
  const newIce = (x, z) => { const thickness = ice.thicknessAt(x, z); return thickness > 0 && thickness < ice.thickness; };
  const clearRing = (point) => {
    let clear = 0;
    for (let ring = 0.005; ring <= 0.06; ring += 0.005) {
      let allNew = true;
      for (let spoke = 0; spoke < 12 && allNew; spoke++) allNew = newIce(point.x + ring * Math.cos(spoke * Math.PI / 6), point.z + ring * Math.sin(spoke * Math.PI / 6));
      if (!allNew) break;
      clear = ring;
    }
    return clear;
  };
  const candidates = [];
  for (const share of [0.15, 0.25, 0.35, 0.45]) for (let index = 0; index < 24; index++) candidates.push({ x: hole.x + share * hole.inner * Math.cos(index), z: hole.z + share * hole.inner * Math.sin(index) });
  const middle = candidates.filter((point) => newIce(point.x, point.z)).map((point) => ({ ...point, clear: clearRing(point) }))
    .sort((first, second) => second.clear - first.clear)[0] ?? { x: hole.x, z: hole.z, clear: 0 };
  const frozenPainted = world.frozen.filter((shard) => maskAt(ice, shard.position.x, shard.position.z)[0] > 128).length;
  const top = ice.at(middle.x, middle.z), thin = ice.thicknessAt(middle.x, middle.z);
  console.log(`  a 16 cm stone through thick ice: ${hole.skin?.closed ? 'skinned over' : 'still open'} ${(world.time - hole.openedAt).toFixed(0)} s after the break; its middle ${top === null ? 'water' : `ground at ${(1000 * top).toFixed(2)} mm, its new ice ${(1000 * thin).toFixed(2)} mm`} (clear of shards and the old ice for ${centimetres(middle.clear)} cm round); ${world.frozen.length} of ${shardsBefore} shards frozen in (${frozenPainted} painted as ice), ${world.things.filter((thing) => thing.piece).length} afloat`);
  const { release, clock, paint, freeze } = world.costs;
  console.log(`  at most a step: letting its shards go ${release.toFixed(1)} ms, the clock otherwise (the flood, drying, new ice prepared and grown, weighing what lies on the ice) ${clock.toFixed(1)} ms, the mask's painting and sending ${paint.toFixed(1)} ms, a shard frozen in ${freeze.toFixed(1)} ms`);
  check(hole.skin?.closed && !ice.holeAt(middle.x, middle.z) && top !== null && thin > 0 && thin < ice.thickness, `a hole left alone ${hole.skin?.closed ? '' : 'did not skin over'}${top === null ? ', its middle still water' : ''}`);
  check(world.frozen.length === shardsBefore && frozenPainted === shardsBefore, `${world.frozen.length} of ${shardsBefore} shards froze in, ${frozenPainted} painted as ice`);
  check(maskAt(ice, middle.x, middle.z)[3] > 128, 'a skinned-over hole\'s middle is not new ice in the mask');
  check(Math.max(release, clock, paint, freeze) < SKIN_MS, `the ice's clock, its painting or a shard frozen in cost ${Math.max(release, clock, paint, freeze).toFixed(1)} ms in a step`);
  // A stone at the old hole breaks the new ice: thin, it lets go no shards.
  check(middle.clear >= 0.03 + 0.01, `a skinned-over hole has no new ice clear of its shards for a 6 cm stone to land on (${centimetres(middle.clear)} cm clear at best)`);
  const holes = ice.holes.length;
  world.throwStone(6, middle);
  world.step(4);
  const rebroken = ice.holes.length > holes;
  console.log(`  a 6 cm stone thrown at its middle: ${rebroken ? 'broke the new ice' : 'held'} (${ice.lastStrike.blow.toFixed(0)} N against ${ice.lastStrike.holds.toFixed(1)} N), ${world.shards.length - shardsBefore} shards; its middle ${ice.holeAt(middle.x, middle.z) ? 'open water again' : 'ice'}, the mask's new ice there cut: ${maskAt(ice, middle.x, middle.z)[3] < 128}`);
  check(rebroken && world.shards.length === shardsBefore && ice.holeAt(middle.x, middle.z) && maskAt(ice, middle.x, middle.z)[3] < 128, 'a stone thrown at a skinned-over hole did not break its new ice open, or let go shards');
  // A pumice stone afloat in a hole keeps it open.
  const kept = iceWorld({ diameter: 6, thickness: 'thin', seed: 1 });
  kept.throwStone(6);
  kept.step(3);
  const keptHole = kept.ice.holes[0];
  const pumice = kept.add(new Rock({ radius: 0.03, position: new THREE.Vector3(keptHole.x, -0.01, keptHole.z), velocity: new THREE.Vector3(), envTexture: null, thing: 'pumice' }));
  pumice.adrift(pumice.position, pumice.velocity, pumice.quaternion);
  pumice.iceHole = keptHole;
  kept.step(80);
  console.log(`  a pumice stone afloat in a 6 cm stone's hole: ${keptHole.skin ? 'it skinned over' : 'still open'} 80 s on`);
  check(!keptHole.skin, 'a hole with a pumice stone afloat in it skinned over');
  // A stone at rest on the ice where a 30 cm rock breaks through: its ground gone, it falls in.
  const under = iceWorld({ diameter: 30, thickness: 'thin', seed: 3 });
  const resting = under.add(new Rock({ radius: 0.02, position: new THREE.Vector3(0.08, ICE_THICKNESS.thin * 0.083 + 0.02, -1.4), velocity: new THREE.Vector3(0, -0.05, 0), envTexture: null }));
  under.step(1);
  const restedOn = resting.state;
  under.throwStone(30);
  under.step(4);
  console.log(`  a 4 cm stone at rest (${restedOn}) where a 30 cm rock broke thin ice: ${resting.state}, ${(100 * resting.position.y).toFixed(1)} cm`);
  check(restedOn === 'rest' && resting.position.y < -0.05, `a stone at rest where a hole opened did not fall in (${resting.state} at ${(100 * resting.position.y).toFixed(1)} cm)`);
  // Stones at rest round where a 16 cm stone breaks thick ice: those on the new hole's crushed rim tip in (src/ice.js
  // tipAtEdge); none is left on the ice within the rim, nor hanging over the hole.
  const rim = iceWorld({ diameter: 16, thickness: 'thick', seed: 2 });
  const ringed = [];
  for (let index = 0; index < 32; index++) {
    const reach = 0.1 + 0.012 * index, angle = 2.4 * index;
    ringed.push(rim.add(new Rock({ radius: 0.03, position: new THREE.Vector3(reach * Math.cos(angle), rim.ice.top + 0.03, -1.4 + reach * Math.sin(angle)), velocity: new THREE.Vector3(0, -0.05, 0), envTexture: null })));
  }
  rim.step(1.5);
  const restedFirst = ringed.every((stone) => stone.state === 'rest');
  rim.throwStone(16);
  rim.step(6);
  const fromEdge = (point) => Math.min(...rim.ice.holes.map((hole) => (insidePolygon(hole.corners, point.x, point.z) ? -1 : 1) * polygonEdgeDistance(hole.corners, point.x, point.z)));
  const onIce = ringed.filter((stone) => stone.position.y > 0), wentIn = ringed.length - onIce.length;
  const nearest = Math.min(...onIce.map((stone) => fromEdge(stone.weightAt(new THREE.Vector3()))));
  const overhanging = onIce.filter((stone) => {
    const rotation = new THREE.Matrix4().makeRotationFromQuaternion(stone.quaternion), corners = stone.physicsPositions;
    for (let index = 0; index < corners.length; index += 3) {
      const corner = new THREE.Vector3().fromArray(corners, index).applyMatrix4(rotation).multiplyScalar(stone.radius).add(stone.position);
      if (fromEdge(corner) < 0) return true;
    }
    return false;
  }).length;
  console.log(`  6 cm stones at rest round where a 16 cm stone broke thick ice: ${wentIn} of ${ringed.length} went in; the nearest left on the ice has its weight ${centimetres(nearest)} cm from the edge, ${overhanging} hanging over it`);
  check(restedFirst && rim.ice.holes.length > 0, 'the stones round a 16 cm stone\'s break did not rest first, or it did not break the thick ice');
  // Some go in and some stay (none left would make the nearest's distance no test at all).
  check(wentIn > 0 && onIce.length > 0 && nearest >= ICE.crushed * ICE_THICKNESS.thick && overhanging === 0, `stones round a new hole: ${wentIn} went in, ${onIce.length} left, the nearest with its weight ${centimetres(nearest)} cm from its edge, ${overhanging} hanging over it`);
  // A toy slide at rest on a new hole's crushed rim tips in (src/ice.js tipAtEdge), pushed against its own slowing on
  // ice (material.on.ice), and a stone with its weight on the same spot does too, each at one push; pushed against the
  // ice's slowing a slide went a quarter as far, and stayed on the rim but for being tipped again while it was opening. A slide bridges a hole narrower than it (tipAtEdge), so the
  // hole is a 30 cm rock's through thick ice. Where to put it: on the far side from the hand, its weight half the
  // crushed rim outside the edge of the hole that ice breaks into with nothing on it; what lies on the ice bears on
  // how it breaks, so the spot is moved by what it missed by and tried again.
  const rimBreak = { diameter: 30, thickness: 'thick', seed: 1 };
  const crushedRim = ICE.crushed * ICE_THICKNESS.thick;
  const bare = iceWorld(rimBreak);
  bare.throwStone(rimBreak.diameter);
  bare.step(1.4);
  const bareHole = bare.ice.holes[0];
  let bareReach = bareHole.inner;
  while (insidePolygon(bareHole.corners, bareHole.x, bareHole.z - bareReach) || polygonEdgeDistance(bareHole.corners, bareHole.x, bareHole.z - bareReach) < 0.5 * crushedRim) bareReach += 0.001;
  const onRim = (thing, radius) => {
    // Where its weight lies from its middle once at rest, so it can be put down with its weight on the spot.
    const settled = iceWorld(rimBreak);
    const trial = settled.add(new Rock({ radius, position: new THREE.Vector3(0, settled.ice.top + radius + 0.01, -3), velocity: new THREE.Vector3(0, -0.05, 0), envTexture: null, thing }));
    settled.step(1.5);
    const offset = trial.weightAt(new THREE.Vector3()).sub(trial.position);
    let reach = bareReach, result = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const world = iceWorld(rimBreak);
      const rock = world.add(new Rock({ radius, position: new THREE.Vector3(bareHole.x - offset.x, world.ice.top + radius + 0.01, bareHole.z - reach - offset.z), velocity: new THREE.Vector3(0, -0.05, 0), envTexture: null, thing }));
      world.step(1.5);
      const rested = rock.state;
      // How many times the rim tips it: once, if the push carries it in against its own slowing.
      let tips = 0;
      const tipAtEdge = world.ice.tipAtEdge.bind(world.ice);
      world.ice.tipAtEdge = (thing) => { const tipped = tipAtEdge(thing); if (tipped && thing === rock) tips++; return tipped; };
      world.throwStone(rimBreak.diameter);
      let atBreak = null;
      for (let waited = 0; waited < 4 && atBreak === null; waited += STEP) {
        world.step(STEP);
        const hole = world.ice.holes[0];
        if (!hole) continue;
        const weight = rock.weightAt(new THREE.Vector3());
        atBreak = insidePolygon(hole.corners, weight.x, weight.z) ? -polygonEdgeDistance(hole.corners, weight.x, weight.z) : polygonEdgeDistance(hole.corners, weight.x, weight.z);
      }
      world.step(3);
      // In: under the ice (a stone sinks), or afloat in the hole (a slide floats high).
      result = { rested, atBreak, tips, wentIn: rock.position.y < 0 || !!world.ice.holeAt(rock.position.x, rock.position.z), state: rock.state };
      if (atBreak === null || (atBreak >= 0 && atBreak <= crushedRim)) break;
      reach -= atBreak - 0.5 * crushedRim;
    }
    return result;
  };
  const slideOnRim = onRim('slide', 0.211), stoneOnRim = onRim('stone', 0.03);
  const rimCm = (result) => (result.atBreak === null ? 'no hole' : `${centimetres(result.atBreak)} cm`);
  const rimSaid = (result) => (result.wentIn ? `tipped in (${result.tips} push${result.tips === 1 ? '' : 'es'})` : `stayed (${result.state}, ${result.tips} pushes)`);
  console.log(`  on a 30 cm rock's new hole's crushed rim (thick ice): a toy slide, its weight ${rimCm(slideOnRim)} from the edge as it opened, ${rimSaid(slideOnRim)}; a 6 cm stone, ${rimCm(stoneOnRim)} from it, ${rimSaid(stoneOnRim)}`);
  check([slideOnRim, stoneOnRim].every((result) => result.rested === 'rest' && result.atBreak !== null && result.atBreak >= 0 && result.atBreak <= crushedRim), `a toy slide and a stone were not at rest on the new hole's crushed rim as it opened (${[slideOnRim, stoneOnRim].map((result) => `${result.rested}, ${rimCm(result)}`).join('; ')}), so tipping off it went unchecked`);
  check(slideOnRim.wentIn && stoneOnRim.wentIn && slideOnRim.tips === 1 && stoneOnRim.tips === 1, `on a new hole's crushed rim a toy slide ${rimSaid(slideOnRim)} and a stone ${rimSaid(stoneOnRim)}: each should tip in at one push`);
}

if (failures.length > 0) {
  console.log(`\nice-probe: ${failures.length} check${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nice-probe: all checks pass');
