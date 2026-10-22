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
//     having slid farther than on the pool's deck; a stone slid on the ice
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
//     under BREAK_MS.
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
const BREAK_MS = 25;
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
    // ground holds up, as on the deck: its ellipsoid as it goes (src/rock.js ellipsoidDepth), its mesh at rest (restOn).
    const lowest = rock.state === 'rest' ? rock.position.y + rock.lowestOffset() : rock.position.y - rock.ellipsoidDepth();
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
      const outcome = record.broke ? '●' : ice.holes.length === 0 && ice.cracks.length > 0 ? '✳' : '·';
      table.set(`${thickness} ${label} ${manner} ${power}`, { ratio, record, rock, ice, slid, outcome, strike });
      cells.push(`${outcome} ${ratio.toFixed(2).padStart(6)}${record.broke ? '' : record.gone ? ` gone past ${FARTHEST} m` : ` ${slid.toFixed(1)} m`}`.padEnd(30));
      // Every outcome is the one its own blow and draw say: through if its first blow was harder than the ice held then.
      check(record.broke === (strike.blow >= strike.holds), `${label} ${manner} ${power} on ${thickness} ice: ${record.broke ? 'went through' : 'held'} with a first blow of ${strike.blow.toFixed(0)} N against ${strike.holds.toFixed(0)} N held`);
      if (!record.broke) {
        check(record.gone || (record.rest !== null && rock.state === 'rest' && rock.onGround && Math.abs(rock.position.y + rock.lowestOffset() - ice.top) < 0.005),
          `${label} ${manner} ${power} on ${thickness} ice: held, but did not come to rest on it (${rock.state}, ${rock.position.y.toFixed(3)} m)`);
        check(!record.enteredWater, `${label} ${manner} ${power} on ${thickness} ice: held, yet went into the water`);
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
  for (const crack of hole.cracks) {
    for (let index = 0; index < crack.length; index += 2) {
      const x = crack[index], z = crack[index + 1];
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
  console.log(`  an 11 lb bowling ball lobbed onto thin ice: ${floated.broke ? 'through' : 'held'}, then ${floater.afloat ? 'afloat' : floater.state} ${its ? `${centimetres(from)} cm from its hole's middle (its room ${centimetres(its.inner - floater.collisionRadius)} cm)` : ''}`);
  check(floated.broke && floater.afloat && from <= its.inner - floater.collisionRadius + 0.005, 'an 11 lb bowling ball through thin ice did not come to float inside its hole');
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

if (failures.length > 0) {
  console.log(`\nice-probe: ${failures.length} check${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nice-probe: all checks pass');
