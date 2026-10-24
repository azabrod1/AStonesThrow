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
//     lyingAttitude: never on an edge or its end); a stone slid on the ice
//     goes SLIDE_RATIO times as far as on the deck;
//   - a Skip throw onto the ice skitters (it strikes the ice at least twice)
//     and rests on it;
//   - a stone sliding into a hole falls in (it is not held on the edge), and
//     a floater that broke through (an 11 lb bowling ball) comes up and
//     floats inside its hole;
//   - things on the ice meet (src/collide.js): a stone slid into one at rest
//     knocks it on, their momentum along the slide kept to MOMENTUM_KEPT;
//   - in a frozen pool (its walls and deck, src/pool.js) everything rests on
//     the ice inside the walls or on the deck outside, never below either,
//     and a stone slid at a wall comes back off it;
//   - the same seeded throw breaks the same hole; halving the substep keeps
//     each outcome and moves where a thing rests by under STEP_TOLERANCE of
//     its slide;
//   - a break (the step, the fit, the cracks and the mask's painting) costs
//     under BREAK_MS;
//   - shards (src/ice.js piecesOf, each made a thing as src/main.js makes
//     it, src/rock.js adrift): a 6 cm stone through thin ice, a 16 cm one
//     and a 30 cm rock through thick, each lets go SHARDS pieces once its
//     cavity has closed, each of ice's density, their rims' discs at most
//     SHARD.fill of the hole, each starting inside it, the same pieces for
//     the same seeded throw; followed SHARD_SECONDS with the things' meetings
//     and the hole's hold, every one comes up and rests afloat, flat, at the
//     height it floats at, inside its hole, none overlapping another;
//   - the flood: the ice round the hole is wet once its shards go, dry but
//     glazed FLOOD.dry seconds on, the far ice never wet; drops that land on
//     the ice wet it;
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
import { collideThings } from '../src/collide.js';
import { SplashSystem } from '../src/splash.js';
import { IceSheet, ICE, ICE_THICKNESS } from '../src/ice.js';

const GRAVITY = 9.81;
const STEP = 1 / 240;
const PATCH = { domainMin: [-3, -4], domainSize: 6 };    // the solver's patch (src/spectralWater.js)
const POOL_SQUARE = { minX: -1.5, minZ: -2.5, size: 3 };  // its middle quarter, the pool (water.poolSquare)
const ARC = { toss: { soft: 1.18, normal: 1.0, hard: null }, lob: { soft: 1.3, normal: 1.5, hard: 1.7 } };   // src/main.js's
const WAYS = [['toss', 'soft'], ['toss', 'normal'], ['toss', 'hard'], ['lob', 'normal']];
const BREAKS = 1.5;          // a throw that must break strikes at least this times what the ice holds...
const HOLDS = 0.6;           // ...and one that must not at most this (the blow's spread, e^(±2·0.2), is 0.67 to 1.5)
const SLIDE_RATIO = 4;
const MOMENTUM_KEPT = 0.05;  // of the striker's momentum
const STEP_TOLERANCE = 0.15; // of a slide
const BOB_TOLERANCE = 0.0005; // m: a thing sliding flat on its face keeps its height to this
const BREAK_MS = 25;
const SHARDS = [3, 9];       // pieces a break lets go (least, most)
const SHARD_SECONDS = 15;    // s a break's shards are followed for
const SKIN_MS = 15;          // a step of the ice's clock (a hole's shards let go and its flood, new ice) or a shard frozen in costs under this (it was 45 to 60 ms before it was spread over steps; here 2 to 8, as the runner allows)
const LONGEST = 40;          // s: a thing not at rest on the ice nor through it by then fails...
const FARTHEST = 30;         // m: ...unless it has slid this far from the pond's middle, where src/main.js lets it go (FARTHEST_AWAY)
const listing = process.argv.includes('--list');

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };
const centimetres = (metres) => (100 * metres).toFixed(1);

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
        ice.fitCavity(rock.iceHole, cavity);
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
      table.set(`${thickness} ${label} ${manner} ${power}`, { ratio, record, rock, ice, slid, outcome, strike });
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
  if (holes > 1) totals.push(record.breakMs + record.fitMs + paintMs);
  if (listing) console.log(`  ${key}: hole ${centimetres(hole.inner)} to ${centimetres(hole.outer)} cm, ${hole.cracks.length} cracks, a step ${record.breakMs.toFixed(2)} ms, fitted in ${record.fitMs.toFixed(2)} ms, painted in ${paintMs.toFixed(1)} ms`);
}
totals.sort((first, second) => first - second);
const medianTotal = totals[Math.floor(totals.length / 2)] ?? 0, worstTotal = totals.at(-1) ?? 0;
console.log(`  ${holes} holes: the worst step ${worstMs.break.toFixed(2)} ms, fit ${worstMs.fit.toFixed(2)} ms, painting ${worstMs.paint.toFixed(1)} ms; a whole break ${medianTotal.toFixed(1)} ms (median), at most ${worstTotal.toFixed(1)} ms after the first`);
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
  const world = { ice, splash, things: [], shards: [], frozen: [], time: 0, opened: 0, costs: { release: 0, clock: 0, paint: 0, freeze: 0 } };
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
      // What the ice's clock costs a step: letting a hole's shards go and flooding round it, or else drying, preparing
      // and growing new ice (the break's own painting is the break's, BREAK_MS).
      let started = performance.now();
      ice.setTime(world.time);
      const pieces = ice.shards.splice(0);
      const spent = performance.now() - started;
      if (pieces.length > 0) world.costs.release = Math.max(world.costs.release, spent);
      else world.costs.clock = Math.max(world.costs.clock, spent);
      for (const piece of pieces) {
        const shard = new Rock({ radius: piece.radius, position: piece.start.position, velocity: piece.start.velocity, envTexture: null, thing: 'ice-shard', mass: piece.mass, piece: piece.shape });
        shard.adrift(piece.start.position, piece.start.velocity, piece.start.quaternion);
        shard.iceHole = piece.hole;
        shard.ground = ice.ground;
        shard.pieceOf = piece;
        world.shards.push(shard);
        world.things.push(shard);
      }
      for (const thing of world.things) {
        const impact = thing.update(STEP, floorDepthAt);
        if (impact && !impact.skim && !impact.ripple) {
          const cavity = splash.impact(impact, water);
          if (impact.throughIce) ice.fitCavity(thing.iceHole, cavity);
        }
        thing.heard.length = 0;
      }
      collideThings(world.things, (thing) => ice.contain(thing));
      splash.update(STEP, water);
      // Once a frame (src/main.js): the mask painted, shards frozen in, holes with a floater in them stirred.
      if (Math.round(world.time / STEP) % 4 === 0) {
        started = performance.now();
        const painting = ice.holes.some((hole) => !hole.painted);
        ice.update();
        if (!painting) world.costs.paint = Math.max(world.costs.paint, performance.now() - started);
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
  const discs = shards.reduce((sum, shard) => sum + Math.PI * shard.radius ** 2, 0);
  const lateness = hole.releaseAt - hole.openedAt;
  let outside = 0, unsettled = 0, tilted = 0, overlap = 0, density = 0;
  for (const shard of shards) {
    const away = Math.hypot(shard.position.x - hole.x, shard.position.z - hole.z);
    const room = ice.edgeReach(hole, Math.atan2(shard.position.z - hole.z, shard.position.x - hole.x)) - shard.radius;
    if (away > room + 0.003) outside++;
    if (!(shard.afloat && shard.state === 'rest') || Math.abs(shard.position.y - shard.floatingHeight()) > 0.003) unsettled++;
    if (new THREE.Vector3(0, 1, 0).applyQuaternion(shard.quaternion).y < Math.cos(THREE.MathUtils.degToRad(5))) tilted++;
    density = Math.max(density, Math.abs(shard.density / 917 - 1));
    for (const other of shards) if (other !== shard) overlap = Math.max(overlap, shard.radius + other.radius - Math.hypot(shard.position.x - other.position.x, shard.position.z - other.position.z));
  }
  const again = iceWorld({ diameter, thickness, seed });
  again.throwStone(diameter);
  again.step(lateness + 2.5);
  const same = again.shards.length === shards.length && again.shards.every((shard, index) => shard.pieceOf.corners.every((value, corner) => value === shards[index].pieceOf.corners[corner]));
  console.log(`  ${label}: ${shards.length} shards ${centimetres(Math.min(...shards.map((shard) => 2 * shard.radius)))} to ${centimetres(Math.max(...shards.map((shard) => 2 * shard.radius)))} cm across, let go ${lateness.toFixed(2)} s after the break; their discs ${(100 * discs / holeArea).toFixed(0)}% of the hole; after ${SHARD_SECONDS} s ${shards.length - unsettled} at rest afloat, ${tilted} tilted, ${outside} outside the hole, overlapping by ${Math.max(1000 * overlap, 0).toFixed(1)} mm at most; again ${same ? 'the same pieces' : 'other pieces'}`);
  check(shards.length >= SHARDS[0] && shards.length <= SHARDS[1], `${label}: ${shards.length} shards`);
  check(lateness >= 0.12 - 1e-9, `${label}: its shards were let go ${lateness.toFixed(2)} s after the break, before its cavity closed`);
  check(discs <= 0.55 * holeArea + 1e-9, `${label}: its shards' discs cover ${(100 * discs / holeArea).toFixed(0)}% of the hole`);
  check(density < 1e-3, `${label}: a shard's density is off ice's by ${(100 * density).toFixed(2)}%`);
  check(unsettled === 0 && tilted === 0, `${label}: after ${SHARD_SECONDS} s ${unsettled} shards are not at rest afloat at their height, ${tilted} not flat`);
  check(outside === 0, `${label}: ${outside} shards are outside their hole`);
  check(overlap < 0.001, `${label}: two shards overlap by ${(1000 * overlap).toFixed(1)} mm`);
  check(same, `${label}: the same seeded throw let go other pieces`);
}

console.log('\nThe flood: the ice round a hole wet as its shards go, then glazed; drops wet it');
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
  console.log(`  at most a step: letting its shards go and the flood ${release.toFixed(1)} ms, the clock otherwise (drying, new ice prepared and grown) ${clock.toFixed(1)} ms, the mask's painting and sending ${paint.toFixed(1)} ms, a shard frozen in ${freeze.toFixed(1)} ms`);
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
}

if (failures.length > 0) {
  console.log(`\nice-probe: ${failures.length} check${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nice-probe: all checks pass');
