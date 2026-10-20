// CPU probe of the things that can be thrown (src/things.js, src/rock.js),
// without a browser: each kind thrown from the shore's hand as the app throws
// it (src/main.js: the hand, the strength's flight time, and but for a
// river stone the aim of src/rock.js aimThrow), flown, into the lake (src/pondFloor.js's bed), and
// followed to rest, in substeps of 1/240 s. For each it prints its size,
// mass and density, how far its centre's path came down from the tap, how
// deep it went, and then, for a floater, when it came up, how high it bobbed
// clear, how many rings it sent out and where it floats at rest; for a
// sinker, the fastest it sank and where it rests. Then the pool's deck: each
// dropped onto the paving from a metre (how high it comes back up, bounce by
// bounce, and where it rests), a ball rolled off the deck into the pool, and
// a floater thrown hard at the pool's far wall. Checks, failing with exit
// code 1:
//   - the balls' sizes and weights are the rules' (golf 42.67 mm and 45.9 g,
//     tennis 6.7 cm and 58 g, bowling 21.59 cm and its pounds, basketball
//     sizes 5 to 7), and a bowling ball floats at 11 lb and sinks at 12;
//   - every throw's centre comes down within AIM_MISS of the tap (the aim
//     allows for the air's drag), and no ball is thrown faster than its
//     `fastest`: a bowling ball thrown hard at the far water comes down
//     short along the tap's direction;
//   - a floater comes up, sends out a ring, and rests within REST_SECONDS
//     at the depth Archimedes says (a ball's cap of its share of water's
//     density; a basketball 4.3 cm under, a tennis ball 2.8 cm) within
//     FLOAT_DEPTH_TOLERANCE, and a gale drifts it downwind at FLOAT.drift;
//     blown onto the shore it grounds at the waterline, never into the bed
//     (within SHORE_TOLERANCE), and floats off when the wind turns;
//   - a sinker rests on the bed; let go under deep water it sinks at its
//     terminal speed, sqrt((8/3)·(ρs/ρw − 1)·g·R/C_d) (a 16 lb bowling ball
//     1.5 m/s, a golf ball 0.4 m/s), within SINK_TOLERANCE;
//   - on the deck each comes back up from its first bounce at its `bounce`
//     squared of the height it fell (a basketball about 0.72, a bowling ball
//     under 0.07), then rests on the paving; a ball rolled off the deck goes
//     into the pool; a floater in the pool stays inside its walls;
//   - things meeting things (src/collide.js): a collision keeps the pair's
//     momentum (the water each carries counted) and gives back the root of
//     their bounces' product of the speed they closed at; a stone thrown at
//     a basketball afloat bounces off it, the ball moves off, dips, rings
//     the water and throws off spray, and rests afloat again; a 16 lb
//     bowling ball dropped on a tennis ball afloat drives it under, and it
//     comes back up and floats; a 5 ct diamond at 14 m/s through a tennis
//     ball afloat strikes it however its 1/240 s is cut into steps (it is
//     swept along the step), and a skip stone skimming into a basketball
//     afloat strikes it; two basketballs drifting into each other
//     bounce apart; one driven at a pool wall comes back off it (its bounce
//     times the water's share), and one driven into another against a wall
//     is sent back, neither past the wall, and so is a skipped pumice afloat
//     (it keeps its skip) and a basketball bobbed clear and knocked at a wall
//     below its top (in the air, the wall's side turns it back); a
//     basketball driven into a row of three touching ones,
//     or spaced apart, passes the knock along to the last; none of them
//     ever overlaps another by more than
//     OVERLAP_MOST after its meeting;
//   - the splash's drops meet the pool's walls and deck (src/splash.js
//     setGround): none goes into a wall or under the deck, and one thrown
//     over a wall lands on the deck and wets it, as does one crossing the
//     wall's line above the deck's top and ending the step below it, while
//     one rising past the deck's top at the wall comes back off its side;
//   - definitions as anyone might write them: the review's bad ones (a stone
//     look without its fields, body.soft null, presets an object, an
//     infinite diameter) are refused plainly, and good ones damaged at
//     random never make the check throw, and whatever defineThing takes
//     can be made and stepped;
//   - mass, density and volume agree for every thing not sized by its
//     diameter, the volume measured here from its mesh;
//   - making each thing as it is thrown, once prepared (src/rock.js
//     prepareThing), costs a fixed mesh's under FIXED_THROW_MS, or on a
//     busy machine under STONE_SHARE of a river stone's (the table printed
//     for every thing);
//   - a thing defined from outside (src/things.js defineThing: a plain beach
//     ball) is thrown and floats as its definition says, and a broken
//     definition is refused, with what is wrong with it;
//   - a pizza goes into the water as a plate: its slap keeps under 15% of
//     its speed into its face, and it goes a few centimetres under (the
//     middle of eight throws under 6 cm, the worst, let go nose-down, under
//     20), where as a ball of its density it dove 26 cm; afloat it soaks,
//     drapes wholly once soaked, and waterlogged after 2 to 7 minutes sinks
//     slowly, as a plate does (3 to 30 cm/s), to rest flat on the bed; a
//     frozen one is rigid (the air does not cup it), thaws over minutes, its
//     frost gone, before it soaks;
//   - toppings and fillings, drawn as each is thrown: six or more of the
//     pizza's recipes in 60, 3 to 16% of its mass (its own), none under the
//     cheese; apple and pumpkin pies float, cherry and blueberry sink;
//   - a rubber duck let go on the water at any angle rights itself (its
//     ballast) and rests within 5 s; dropped upside down on the deck, it,
//     and a pizza dropped tilted, settles onto its base;
//   - a pizza thrown with Skip skips, twice on average at normal strength;
//   - halving the substep moves a floater's highest bob by under
//     STEP_TOLERANCE and its rest not at all;
//   - a floater's step costs under STEP_COST_MS.
//
//   node tools/thing-probe.mjs
import * as THREE from 'three';
import { Rock, aimThrow, aimSkip, prepareThing, skipLowest, skipSpeed, SKIP_THROW } from '../src/rock.js';
import { THINGS, THING_NAMES, WATER_DENSITY, defineThing, validateThing } from '../src/things.js';
import { floorDepthAt } from '../src/pondFloor.js';
import { holdInPool, poolGround, POOL } from '../src/pool.js';
import { collideThings } from '../src/collide.js';
import { SplashSystem } from '../src/splash.js';
import { meshKind } from '../src/thingMeshes.js';

const GRAVITY = 9.81;
const STEP = 1 / 240;
const AIM_MISS = 0.05;                 // m
const REST_SECONDS = 24;              // s: a watermelon (960 kg/m³) dives over a metre and rises slowly, resting after 13 to 21 s as its throw falls (40 throws)
const FLOAT_DEPTH_TOLERANCE = 0.003;   // m
const SINK_TOLERANCE = 0.02;           // of the terminal speed
const STEP_TOLERANCE = 0.1;            // of the highest bob
const FIXED_THROW_MS = 1;              // ms: the most making a prepared thing (a fixed mesh's, src/rock.js prepareThing) may take as it is thrown...
const STONE_LOAD_MS = 3;               // ...unless a river stone's throw takes more than this (a busy machine: it takes 2.2 ms on a quiet one)...
const STONE_SHARE = 1 / 3;             // ...when it may take this share of a stone's
const STEP_COST_MS = 0.05;
const PIZZA_RIGHTS_SECONDS = 5;        // s: a pizza let go on the water at any angle lies flat by then
const COLUMN_VOLUME = 0.02;           // of a floater's volume: its buoyancy's columns (src/rock.js buoyancyColumns) hold its mesh's to this
const OVERLAP_MOST = 0.002;            // m
const SHORE_TOLERANCE = 0.002;         // m: the most a floater grounded on the shore may sink into the bed
const POWERS = { soft: 1.3, normal: 1.0, hard: 0.72 };
const DRAG_COEFFICIENT = 0.46;         // src/cavity.js's
const POOL_SQUARE = { minX: -1.5, minZ: -2.5, size: 3 };   // the solver's middle quarter (src/spectralWater.js poolSquare)

let randomState = 1;
Math.random = () => { randomState = (randomState * 16807) % 2147483647; return (randomState - 1) / 2147483646; };

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };
const centimetres = (metres) => (100 * metres).toFixed(1);

// The shore view's camera and hand (src/main.js), as the other probes have them.
const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const handFor = (radius) => {
  const beyond = Math.max(radius - 0.08, 0);
  return new THREE.Vector3(0.30, -0.32 - 1.6 * beyond, -0.55 - 1.2 * beyond).applyMatrix4(camera.matrixWorld);
};

/** What `name` is at slider `value` (src/main.js measureThing): a stone's radius from its size in cm. */
function measure(name, value) {
  const thing = THINGS[name];
  const size = value ?? thing.slider?.initial;
  const measured = thing.measure(size);
  return { thing, ...measured, size };
}

/** A thing thrown as the app throws it at (x, z), with `power`; `pooled` gives it the deck as ground. */
function throwThing(name, { x = 0, z = -1.4, power = 'normal', value, pooled = false } = {}) {
  const measured = measure(name, value);
  const hand = handFor(measured.radius);
  const target = new THREE.Vector3(x, 0, z);
  const flightTime = THREE.MathUtils.clamp(0.42 + 0.11 * hand.distanceTo(target), 0.5, 1.0) * POWERS[power];
  let velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  let landing = target;
  // Made first, as src/main.js makes it, so a fluttering thing is aimed by its own flight.
  const rock = new Rock({ radius: measured.radius, position: hand, velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: measured.mass });
  // Aimed as heavy as it is thrown (a pizza's toppings, a pie's filling: src/main.js throwAt).
  if (name !== 'stone') ({ velocity, landing } = aimThrow(hand, target, flightTime, { ...measured, mass: rock.mass }, rock.trialFlight()));
  rock.velocity.copy(velocity);
  if (pooled) rock.groundAt = poolGround(POOL_SQUARE);
  return { rock, measured, hand, target, landing, launch: velocity.clone() };
}

/** Steps a thing until it rests (or `seconds`), recording what the probe reports. */
function follow(rock, { seconds = 30, step = STEP, floor = floorDepthAt, pooled = false } = {}) {
  const record = { crossing: null, deepest: 0, surfaced: null, highestBob: -Infinity, ripples: 0, impacts: 0, fastestSink: 0, restAt: null, cost: 0, floatSteps: 0, apexes: [], states: new Set() };
  let previousY = rock.position.y, rising = false;
  for (let time = 0; time < seconds; time += step) {
    const wasAir = rock.state === 'air';
    const before = rock.position.clone(), velocityBefore = rock.velocity.clone();
    const started = performance.now();
    const impact = rock.update(step, floor);
    const spent = performance.now() - started;
    if (rock.state === 'float') { record.cost += spent; record.floatSteps++; }
    if (pooled) collideThings([rock], (thing) => holdInPool(thing, POOL_SQUARE));
    record.states.add(rock.state);
    if (impact?.ripple) record.ripples++;
    else if (impact) {
      record.impacts++;
      // Where the centre's path crosses the still water, from the step before the touch.
      if (record.crossing === null && wasAir) {
        const fall = before.y / Math.max(-velocityBefore.y, 1e-6);
        record.crossing = new THREE.Vector3(before.x + velocityBefore.x * fall, 0, before.z + velocityBefore.z * fall);
      }
    }
    if (rock.state === 'water') {
      record.deepest = Math.max(record.deepest, -rock.position.y);
      if (rock.body.time > (rock.body.openUntil ?? 0) + 0.05) record.fastestSink = Math.max(record.fastestSink, -rock.velocity.y);
    }
    if (rock.state === 'float' && record.surfaced === null) record.surfaced = time;
    if (record.surfaced !== null && (rock.state === 'float' || rock.state === 'air')) record.highestBob = Math.max(record.highestBob, rock.position.y);
    // Apexes on the deck: the top of each rise.
    if (rock.state === 'air' && rock.velocity.y <= 0 && rising) record.apexes.push(previousY);
    rising = rock.velocity.y > 0;
    previousY = rock.position.y;
    if (rock.state === 'rest') { record.restAt = time; break; }
  }
  return record;
}

console.log('The things (src/things.js), thrown at (0, -1.4) normally into the lake:\n');

// ---- the catalog ----
const near = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;
check(near(2 * measure('golf').radius, 0.04267, 1e-5) && near(measure('golf').mass, 0.0459, 1e-5), 'golf ball: not 42.67 mm and 45.9 g');
check(near(2 * measure('tennis').radius, 0.067, 1e-5) && near(measure('tennis').mass, 0.058, 1e-5), 'tennis ball: not 6.7 cm and 58 g');
for (let pounds = 6; pounds <= 16; pounds++) {
  const ball = measure('bowling', pounds);
  check(near(2 * ball.radius, 0.2159, 1e-5) && near(ball.mass, pounds * 0.45359237, 1e-6), `bowling ball: ${pounds} lb is ${ball.mass.toFixed(3)} kg`);
  check((ball.density < WATER_DENSITY) === (pounds <= 11), `bowling ball: ${pounds} lb ${ball.density < WATER_DENSITY ? 'floats' : 'sinks'} (${ball.density.toFixed(0)} kg/m³)`);
}
for (const [size, diameter, grams] of [[5, 0.222, 480], [6, 0.23, 540], [7, 0.239, 620]]) {
  const ball = measure('basketball', size);
  check(near(2 * ball.radius, diameter, 1e-6) && near(ball.mass, grams / 1000, 1e-6), `basketball: size ${size} is ${centimetres(2 * ball.radius)} cm and ${(1000 * ball.mass).toFixed(0)} g`);
}

// ---- each thing in the lake ----
const lake = [];
for (const name of THING_NAMES) {
  for (const value of name === 'bowling' ? [8, 16] : [undefined]) {
    const { rock, measured, target } = throwThing(name, { value });
    const record = follow(rock);
    const label = `${THINGS[name].name}${value ? ` ${value} lb` : ''}`;
    const miss = record.crossing ? Math.hypot(record.crossing.x - target.x, record.crossing.z - target.z) : Infinity;
    lake.push({ name, label, rock, measured, record });
    let line = `${label.padEnd(20)} ${centimetres(2 * measured.radius).padStart(5)} cm ${(measured.mass ?? rock.mass).toFixed(3).padStart(6)} kg ${rock.density.toFixed(0).padStart(5)} kg/m³; down ${centimetres(miss)} cm from the tap, ${centimetres(record.deepest)} cm deep`;
    check(miss < AIM_MISS, `${label}: its path came down ${centimetres(miss)} cm from the tap`);
    if (rock.floats) {
      // Archimedes: at rest the share of it under the water is its density over water's (a sphere's cap; anything else's mesh, sliced).
      const under = rock.waterline(rock.position.y).share, wanted = rock.density / WATER_DENSITY;
      line += `; up after ${record.surfaced?.toFixed(2)} s, its centre ${centimetres(record.highestBob - rock.floatingHeight())} cm over where it floats at the highest, ${record.ripples} ring${record.ripples === 1 ? '' : 's'}; rests after ${record.restAt?.toFixed(1)} s, ${(100 * under).toFixed(1)}% of it under (${(100 * wanted).toFixed(1)}%)`;
      check(record.restAt !== null && record.restAt < REST_SECONDS && rock.afloat, `${label}: has not come to rest afloat within ${REST_SECONDS} s (${rock.state})`);
      // A plate slaps the water and floats (src/rock.js PLATE_WATER): it never dives to come back up through the surface.
      check(rock.plate || record.ripples >= 1, `${label}: came up without a ring`);
      check(Math.abs(under - wanted) < 0.01, `${label}: ${(100 * under).toFixed(1)}% of it under the water, Archimedes ${(100 * wanted).toFixed(1)}%`);
      if (rock.sphere) {
        // A ball's draft against the cap's (a basketball 4.3 cm, a tennis ball 2.8 cm).
        let low = 0, high = 2;
        for (let iteration = 0; iteration < 50; iteration++) { const middle = (low + high) / 2; if (middle * middle * (3 - middle) / 4 < wanted) low = middle; else high = middle; }
        const draft = rock.radius - rock.position.y, expected = rock.radius * (low + high) / 2;
        line += `, ${centimetres(draft)} cm deep (${centimetres(expected)})`;
        check(Math.abs(draft - expected) < FLOAT_DEPTH_TOLERANCE, `${label}: floats ${centimetres(draft)} cm under, Archimedes ${centimetres(expected)} cm`);
      } else {
        // Its buoyancy's columns hold its mesh's volume (against its shape's moments' integral), to COLUMN_VOLUME.
        const columns = rock.buoyancy;
        const held = columns ? columns.volume / rock.shape.volume : 0;
        line += `, its ${columns?.count} columns holding ${(100 * held).toFixed(1)}% of its mesh's volume`;
        check(columns && Math.abs(held - 1) < COLUMN_VOLUME, `${label}: its buoyancy's columns hold ${(100 * held).toFixed(1)}% of its volume`);
      }
      if (rock.thing.body.upright) {
        // Its top up and out of the water: its own +y up, its highest point (a pizza's crust, a pie's rim, a duck's head) over the water.
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rock.quaternion).y, top = rock.position.y + rock.waterline(rock.position.y).high;
        line += `; its top ${up > 0 ? 'up' : 'down'}, ${centimetres(top)} cm out of the water`;
        check(up > 0.98 && top > 0, `${label}: afloat with its top ${up > 0 ? 'up' : 'down'}, ${centimetres(top)} cm out of the water`);
      }
    } else {
      const bed = floorDepthAt(rock.position.x, rock.position.z);
      // Let go from rest under 10 m of water, its hole long closed: it sinks at its terminal speed.
      const settling = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, -2 * measured.radius, 0), velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: measured.mass });
      settling.goIn(STEP);
      settling.body.openUntil = -1;
      let sinking = 0;
      // Its speed along its path: a flat gem glides a little (its lift), so it falls a little slower.
      for (let time = 0; time < 6 && settling.state === 'water'; time += STEP) { settling.update(STEP, 10); sinking = Math.max(sinking, settling.velocity.length()); }
      // Its own density (a brick's from its mesh's volume), on the drag's nominal ball; a plate's on its face (underWater's `face`).
      const terminal = Math.sqrt((8 / 3) * (rock.density / WATER_DENSITY - 1) * GRAVITY * measured.radius / (DRAG_COEFFICIENT * (rock.form?.face ?? 1)));
      line += `; sinks at ${sinking.toFixed(2)} m/s (terminal ${terminal.toFixed(2)}), rests ${centimetres(-rock.position.y)} cm down on the bed's ${centimetres(bed)} after ${record.restAt?.toFixed(1)} s`;
      check(rock.state === 'rest' && rock.position.y < 0, `${label}: has not come to rest on the bed (${rock.state})`);
      // A gem's flat cut, a brick's slab, glides a little more (its lift): SINK_TOLERANCE twice over.
      check(Math.abs(sinking - terminal) < (['gem', 'brick'].includes(THINGS[name].look.mesh) ? 2 : 1) * SINK_TOLERANCE * terminal, `${label}: sinks at ${sinking.toFixed(2)} m/s, its terminal speed ${terminal.toFixed(2)}`);
    }
    console.log(line);
  }
}

// ---- the aim, for each ball at each strength and a few taps ----
console.log('\nThe balls\' aim (the centre\'s path at the still water against the tap), at three strengths and three taps:');
for (const name of THING_NAMES.filter((key) => THINGS[key].abilities.held)) {
  let worst = 0;
  for (const power of Object.keys(POWERS)) {
    for (const [x, z] of [[0, -0.6], [0.8, -1.8], [-1.2, -3.2]]) {
      const { rock, target, launch, measured } = throwThing(name, { x, z, power });
      const record = follow(rock, { seconds: 3 });
      const capped = launch.length() > measured.thing.fastest(measured.size) + 1e-6;
      check(!capped, `${THINGS[name].name}: thrown at ${launch.length().toFixed(2)} m/s, faster than its fastest ${measured.thing.fastest(measured.size).toFixed(2)}`);
      // A capped throw comes down short along the tap's direction; any other on the tap.
      const fastest = measured.thing.fastest(measured.size);
      if (record.crossing) worst = Math.max(worst, launch.length() >= fastest - 1e-3 ? 0 : Math.hypot(record.crossing.x - target.x, record.crossing.z - target.z));
    }
  }
  console.log(`  ${THINGS[name].name.padEnd(14)} worst miss ${centimetres(worst)} cm, at most ${THINGS[name].fastest(THINGS[name].slider?.initial).toFixed(1)} m/s`);
  check(worst < AIM_MISS, `${THINGS[name].name}: the aim missed by up to ${centimetres(worst)} cm`);
}
{
  // A 16 lb bowling ball thrown hard at the far water: no faster than it can be, short along the tap's direction.
  const { rock, hand, target, launch, measured } = throwThing('bowling', { x: 0, z: -3.5, power: 'hard', value: 16 });
  const record = follow(rock, { seconds: 3 });
  const fastest = measured.thing.fastest(16);
  const along = record.crossing ? Math.hypot(record.crossing.x - hand.x, record.crossing.z - hand.z) : 0;
  const reach = Math.hypot(target.x - hand.x, target.z - hand.z);
  const sideways = record.crossing ? Math.abs((record.crossing.x - hand.x) * (target.z - hand.z) - (record.crossing.z - hand.z) * (target.x - hand.x)) / reach : Infinity;
  console.log(`  a 16 lb bowling ball thrown hard 5.4 m out: ${launch.length().toFixed(2)} m/s (at most ${fastest.toFixed(2)}), down ${along.toFixed(2)} m out of ${reach.toFixed(2)}, ${centimetres(sideways)} cm aside`);
  check(launch.length() <= fastest + 1e-6, `bowling ball: thrown at ${launch.length().toFixed(2)} m/s, its fastest ${fastest.toFixed(2)}`);
  check(along < reach - 0.2 && sideways < AIM_MISS, 'bowling ball: a throw beyond its reach did not come down short along the tap\'s direction');
}

// ---- a gale's drift ----
{
  const { rock } = throwThing('basketball');
  follow(rock);
  rock.setDrift(new THREE.Vector2(1, 0));
  for (let time = 0; time < 12; time += STEP) rock.update(STEP, floorDepthAt);
  console.log(`\nUnder a gale a basketball afloat drifts at ${rock.velocity.x.toFixed(3)} m/s downwind (${rock.state})`);
  check(Math.abs(rock.velocity.x - 0.15) < 0.01 && rock.state === 'float', `basketball: a gale drifts it at ${rock.velocity.x.toFixed(3)} m/s (${rock.state})`);
}

// ---- the shore: a gale blowing floaters onto it ----
console.log('\nBlown onto the shore by a gale for a minute, then out again for a minute: where each grounds, how far into the bed it goes, where it is after');
for (const name of THING_NAMES) {
  const measured = measure(name);
  const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(0.3, 0, 2), velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: measured.mass });
  if (!rock.floats) continue;
  rock.startFloating(0);
  let deepest = 0, grounded = null;
  for (let time = 0; time < 120; time += STEP) {
    rock.setDrift(new THREE.Vector2(0, time < 60 ? 1 : -1));
    rock.update(STEP, floorDepthAt);
    if (time < 60) {
      deepest = Math.max(deepest, -floorDepthAt(rock.position.x, rock.position.z) - (rock.position.y + rock.lowestOffset()));
      grounded = rock.position.z;
    }
  }
  console.log(`  ${name.padEnd(13)} grounds at z ${grounded.toFixed(2)} m (bed ${(100 * floorDepthAt(0.3, grounded)).toFixed(1)} cm deep), ${centimetres(Math.max(deepest, 0))} cm into the bed at most; blown back out to z ${rock.position.z.toFixed(2)} (${rock.state})`);
  check(deepest <= SHORE_TOLERANCE && grounded < 2.8 && rock.position.z < 0 && rock.state === 'float',
    `${name}: blown onto the shore it went ${centimetres(deepest)} cm into the bed, to z ${grounded.toFixed(2)}, and back out only to z ${rock.position.z.toFixed(2)} (${rock.state})`);
}

// ---- the deck ----
console.log('\nOn the pool\'s deck, dropped from a metre onto the paving: how high it comes back, bounce by bounce, then where it rests');
for (const name of THING_NAMES) {
  const measured = measure(name, name === 'bowling' ? 16 : undefined);
  const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, POOL.deck + 1 + measured.radius, 1.5), velocity: new THREE.Vector3(0, 0, 0), envTexture: null, thing: name, mass: measured.mass });
  rock.spinRate = 0;
  rock.groundAt = poolGround(POOL_SQUARE);
  const record = follow(rock, { seconds: 10, pooled: true });
  const ratios = record.apexes.map((apex) => (apex - POOL.deck - rock.ellipsoidDepth()) / 1);
  const [least, most] = THINGS[name].material.bounce;
  console.log(`  ${THINGS[name].name.padEnd(14)} ${ratios.slice(0, 4).map((ratio) => ratio.toFixed(3)).join(', ') || 'no bounce'}; ${rock.state} ${centimetres(rock.position.y + rock.lowestOffset() - POOL.deck)} cm over the deck`);
  // A fluttering thing falls slower than free, so its first rise is not its bounce squared of the drop: its speeds are checked instead.
  if (ratios.length > 0 && THINGS[name].air.model !== 'flutter') check(ratios[0] > 0.95 * least * least && ratios[0] < 1.05 * most * most, `${THINGS[name].name}: came back ${ratios[0].toFixed(3)} of its fall, its bounce ${least}–${most} squared`);
  check(rock.state === 'rest' && Math.abs(rock.position.y + rock.lowestOffset() - POOL.deck) < 0.01, `${THINGS[name].name}: has not come to rest on the deck (${rock.state}, ${rock.position.y.toFixed(3)} m)`);
}
{
  const measured = measure('basketball');
  const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, POOL.deck + measured.radius, 1.2), velocity: new THREE.Vector3(0, 0, -1.5), envTexture: null, thing: 'basketball', mass: measured.mass });
  rock.groundAt = poolGround(POOL_SQUARE);
  rock.state = 'ground';
  const record = follow(rock, { seconds: 15, floor: POOL.depth, pooled: true });
  console.log(`  a basketball rolled at 1.5 m/s towards the pool: ${[...record.states].join(' → ')}`);
  check(record.states.has('water') || record.states.has('float'), 'basketball: rolled off the deck, it never went into the pool');
}
{
  const { rock } = throwThing('basketball', { x: 0.9, z: -2.4, power: 'hard', pooled: true });
  follow(rock, { floor: POOL.depth, pooled: true });
  const inside = (value, low) => value >= low + rock.radius - 1e-9 && value <= low + POOL_SQUARE.size - rock.radius + 1e-9;
  console.log(`  a basketball thrown hard at the pool's far corner rests at (${rock.position.x.toFixed(2)}, ${rock.position.z.toFixed(2)}), ${rock.afloat ? 'afloat' : rock.state}`);
  check(inside(rock.position.x, POOL_SQUARE.minX) && inside(rock.position.z, POOL_SQUARE.minZ) && rock.afloat, 'basketball: not afloat inside the pool\'s walls');
}

// ---- things meeting things (src/collide.js) ----
/** A thing of `name` at rest afloat at (x, z) on the lake. */
function afloatAt(name, x, z) {
  const measured = measure(name);
  const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(x, 0, z), velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: measured.mass });
  rock.state = 'float';
  rock.hasFloated = true;
  rock.position.y = rock.floatingHeight();
  rock.spinRate = 0;
  for (let time = 0; time < 2 && rock.state !== 'rest'; time += STEP) rock.update(STEP, floorDepthAt);
  return rock;
}
/** Steps `things` together as src/main.js does (each moved, then their meetings), `seconds` long; what happened. */
function together(things, seconds, floor = floorDepthAt) {
  const record = { knocks: 0, ripples: 0, overlap: 0, met: new Set(), lowest: new Map(things.map((thing) => [thing, Infinity])) };
  for (let time = 0; time < seconds; time += STEP) {
    for (const thing of things) {
      const impact = thing.update(STEP, floor);
      if (impact?.ripple) record.ripples++;
    }
    const knocks = collideThings(things);
    record.knocks += knocks.length;
    if (knocks.length > 0) record.met.add(time);
    record.ripples += knocks.length;
    for (let first = 0; first < things.length; first++) {
      for (let second = first + 1; second < things.length; second++) {
        const [one, other] = [things[first], things[second]];
        if (!one.collides || !other.collides || !(one.floater || other.floater)) continue;
        const overlap = one.collisionRadius + other.collisionRadius - one.centre.distanceTo(other.centre);

        record.overlap = Math.max(record.overlap, overlap);
      }
    }
    for (const thing of things) record.lowest.set(thing, Math.min(record.lowest.get(thing), thing.position.y - thing.floatingHeight?.()));
    if (things.every((thing) => thing.state === 'rest')) break;
  }
  return record;
}
// ---- a flat thing on the water at any angle, and in the air (src/rock.js turnAfloat, flutter) ----
console.log('\nA pizza let go on the water at an angle (buoyancyColumns, turnAfloat): its share under at its height there, where it floats turned so, and where it comes to rest');
{
  const shares = [];
  for (const degrees of [0, 45, 80, 90, 135]) {
    const measured = measure('pizza');
    const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 0, -1.4), velocity: new THREE.Vector3(), envTexture: null, thing: 'pizza', mass: measured.mass });
    rock.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(degrees));
    rock.spinRate = 0;
    const height = rock.floatingHeight();
    const share = rock.waterline(0.004).share;
    shares.push({ degrees, share, height });
    rock.state = 'float'; rock.hasFloated = true; rock.position.y = height;
    let time = 0;
    for (; time < 10 && rock.state !== 'rest'; time += STEP) rock.update(STEP, floorDepthAt);
    const up = rock.uprightAxis.clone().applyQuaternion(rock.quaternion).y;
    console.log(`  at ${String(degrees).padStart(3)}°: ${(100 * share).toFixed(1)}% under with its centre 4 mm up, floats with its centre ${centimetres(height)} cm up; rests after ${time.toFixed(1)} s ${up > 0 ? 'toppings up' : 'toppings down'}, ${THREE.MathUtils.radToDeg(Math.acos(Math.min(Math.abs(up), 1))).toFixed(1)}° off flat`);
    check(rock.afloat && Math.abs(up) > 0.99 && time < PIZZA_RIGHTS_SECONDS, `a pizza let go at ${degrees}° did not come to rest flat within ${PIZZA_RIGHTS_SECONDS} s (${rock.state}, ${Math.abs(up).toFixed(3)})`);
    // On its edge (90°) it balances and falls either way.
    check(degrees === 90 || (degrees < 90 ? up > 0 : up < 0), `a pizza let go at ${degrees}° came to rest ${up > 0 ? 'toppings up' : 'toppings down'}`);
  }
  // The review: at 0°, 45° and 80° the same share under and the same height (the waterline along its axis only).
  const [flat, tilted, steep] = shares;
  check(Math.abs(tilted.share - flat.share) > 0.02 && Math.abs(steep.share - flat.share) > 0.02 && Math.abs(steep.height - flat.height) > 0.005, 'a pizza floats as deep turned as flat (its waterline takes no account of its angle)');
}
console.log('\nPizzas thrown at (0, -1.4) on eight seeds (flutter: a plate in the air, its turn its own):');
{
  const tilts = [];
  for (let seed = 1; seed <= 8; seed++) {
    randomState = seed * 7919;
    const { rock } = throwThing('pizza', { x: 0, z: -1.4 });
    for (let time = 0; time < 3 && rock.state === 'air'; time += STEP) rock.update(STEP, floorDepthAt);
    const face = rock.shape.axes[2].clone().applyQuaternion(rock.quaternion);
    tilts.push(THREE.MathUtils.radToDeg(Math.acos(Math.min(Math.abs(face.y), 1))));
  }
  // Its spin holds it: the same throw spun slowly and fast turns over unlike.
  const spun = [5, 12].map((rate) => {
    randomState = 99;
    const { rock } = throwThing('pizza', { x: 0, z: -1.4 });
    rock.spinRate = rate;
    let most = 0;
    for (let time = 0; time < 0.6 && rock.state === 'air'; time += STEP) {
      rock.update(STEP, floorDepthAt);
      const face = rock.shape.axes[2].clone().applyQuaternion(rock.quaternion);
      most = Math.max(most, THREE.MathUtils.radToDeg(Math.acos(Math.min(Math.abs(face.y), 1))));
    }
    return most;
  });
  console.log(`  each in the air until it goes in: its face ${tilts.map((tilt) => tilt.toFixed(0)).join('°, ')}° off level as it went in; spun at 5 rad/s it tilted up to ${spun[0].toFixed(0)}°, at 12 rad/s ${spun[1].toFixed(0)}°`);
  check(Math.max(...tilts) - Math.min(...tilts) > 5, `pizzas thrown alike went in alike (${tilts.map((tilt) => tilt.toFixed(0)).join(', ')}°): their flight is steered, not flown`);
  check(Math.abs(spun[0] - spun[1]) > 2, 'a pizza flies the same however fast it spins');
}
console.log('\nSoaking (src/rock.js soak): a pizza and a frozen one afloat for two minutes');
{
  for (const name of ['pizza', 'frozen-pizza']) {
    const rock = afloatAt(name, 0, -1.4);
    const startHeight = rock.position.y, startDensity = rock.density, startDisc = rock.dryDisc;
    for (let time = 0; time < 120; time += STEP) rock.update(STEP, floorDepthAt);
    const sank = startHeight - rock.position.y;
    console.log(`  ${THINGS[name].name.padEnd(13)} soaked ${(100 * rock.soaked).toFixed(0)}%: ${startDensity.toFixed(0)} → ${rock.density.toFixed(0)} kg/m³, ${(1000 * sank).toFixed(1)} mm lower, its dry top ${centimetres(startDisc)} → ${centimetres(rock.dryDisc)} cm across its middle; ${rock.afloat ? 'afloat' : rock.state}`);
    if (name === 'pizza') check(rock.soaked > 0.4 && sank > 0.002 && rock.dryDisc < 0.7 * startDisc && rock.afloat, `a pizza afloat two minutes has not soaked (${(100 * rock.soaked).toFixed(0)}%, ${(1000 * sank).toFixed(1)} mm lower)`);
    else check(rock.soaked < 0.15 && rock.afloat, `a frozen pizza soaked as fast as a fresh one (${(100 * rock.soaked).toFixed(0)}%)`);
  }
}
console.log('\nWaterlogged, thawing, draping (src/rock.js soak, showWet, drape): a pizza afloat until it sinks, a frozen one thawing');
{
  // A fresh pizza soaks faster the lower it floats, waterlogged sinks, and sinks as a plate does: slowly, flat.
  const pizza = afloatAt('pizza', 0, -1.4);
  const drapeFresh = pizza.drape;
  let sankAt = null, fastest = 0, time = 0;
  for (; time < 600 && !(pizza.state === 'rest' && !pizza.afloat); time += STEP) {
    pizza.update(STEP, floorDepthAt);
    if (sankAt === null && pizza.state === 'water') sankAt = time;
    if (sankAt !== null) fastest = Math.max(fastest, -pizza.velocity.y);
  }
  const up = pizza.uprightAxis.clone().applyQuaternion(pizza.quaternion).y;
  console.log(`  a pizza afloat: waterlogged (${pizza.density.toFixed(0)} kg/m³) it sinks after ${sankAt?.toFixed(0)} s, at ${(100 * fastest).toFixed(1)} cm/s at most, and rests on the bed ${centimetres(-pizza.position.y)} cm down ${Math.abs(up) > 0.9 ? 'flat' : 'on edge'}; its drape ${drapeFresh.toFixed(2)} fresh, ${pizza.drape.toFixed(2)} soaked`);
  check(sankAt !== null && sankAt > 120 && sankAt < 420, `a pizza afloat sank ${sankAt === null ? 'never' : `after ${sankAt.toFixed(0)} s`}, not after 2 to 7 minutes`);
  check(fastest > 0.03 && fastest < 0.3 && pizza.state === 'rest' && Math.abs(up) > 0.9, `a waterlogged pizza sank at ${(100 * fastest).toFixed(1)} cm/s (a plate's 3 to 30) and rests ${pizza.state}, ${Math.abs(up).toFixed(2)} flat`);
  check(near(drapeFresh, THINGS.pizza.body.soft.drape, 0.01) && pizza.drape > 0.95, `a pizza drapes ${drapeFresh.toFixed(2)} fresh and ${pizza.drape.toFixed(2)} soaked (its soft.drape, then all of it)`);
  // A frozen one is rigid and frosted until it thaws, then goes soft, loses its frost and soaks as a fresh one does.
  const frozen = afloatAt('frozen-pizza', 0, -1.4);
  frozen.showWet();
  const frost = frozen.meshAbove.material.emissive.getHSL({}).l;
  const before = { drape: frozen.drape, soaked: frozen.soaked };
  for (let step = 0; step < 60 * 240; step++) frozen.update(STEP, floorDepthAt);
  const minute = { thawed: frozen.thawed, soaked: frozen.soaked };
  for (let step = 0; step < 540 * 240; step++) frozen.update(STEP, floorDepthAt);
  frozen.showWet();
  console.log(`  a frozen pizza afloat: thawed ${(100 * minute.thawed).toFixed(0)}% and soaked ${(100 * minute.soaked).toFixed(0)}% after a minute; after ten, thawed ${(100 * frozen.thawed).toFixed(0)}%, soaked ${(100 * frozen.soaked).toFixed(0)}%, its frost ${frost.toFixed(3)} → ${frozen.meshAbove.material.emissive.getHSL({}).l.toFixed(3)}, its drape ${before.drape.toFixed(2)} → ${frozen.drape.toFixed(2)}; ${frozen.afloat || frozen.state === 'float' ? 'afloat' : frozen.state}`);
  check(before.drape < 0.01 && minute.thawed > 0.05 && minute.thawed < 0.5 && minute.soaked < 0.1, `a frozen pizza is not rigid at first, or thaws or soaks too fast (drape ${before.drape}, thawed ${minute.thawed.toFixed(2)}, soaked ${minute.soaked.toFixed(2)} after a minute)`);
  check(frozen.thawed === 1 && frozen.soaked > 0.4 && frozen.drape > 0.7 && frozen.meshAbove.material.emissive.getHSL({}).l < 1e-6 && frost > 0.05, 'a frozen pizza afloat ten minutes has not thawed (its frost gone, soft), or not soaked after');
  // Frozen, the air does not cup it; thawed, it does (bendStep).
  const cups = [0, 1].map((thawed) => {
    const plate = new Rock({ radius: 0.15, position: new THREE.Vector3(0, 2, 0), velocity: new THREE.Vector3(0, -6, 0), envTexture: null, thing: 'frozen-pizza', mass: 0.3 });
    plate.thawed = thawed;
    for (let step = 0; step < 24; step++) plate.update(STEP, floorDepthAt);
    return Math.abs(plate.bend.cup);
  });
  check(cups[0] < 1e-4 && cups[1] > 1e-3, `a frozen pizza cups in the air (${cups[0].toFixed(4)}), or a thawed one does not (${cups[1].toFixed(4)})`);
}

console.log('\nA plate meeting the water (src/rock.js PLATE_WATER): a pizza thrown as the app throws it, on eight seeds');
{
  const depths = [], kept = [];
  for (let seed = 1; seed <= 8; seed++) {
    randomState = seed * 104729;
    const { rock } = throwThing('pizza', { x: 0, z: -1.4 });
    let impact = null, deepest = 0, orientation = null;
    for (let step = 0; step < 240 * 8 && rock.state !== 'rest'; step++) {
      const turned = rock.quaternion.clone();
      const found = rock.update(STEP, floorDepthAt);
      if (found && !found.ripple && !impact) { impact = found; orientation = turned; }
      if (impact) deepest = Math.max(deepest, -rock.position.y);
    }
    // A floating plate's slap is a touch (src/rock.js goIn: a ring and spray, no hole), its speed after it `exitVelocity`.
    const face = rock.shape.axes[2].clone().applyQuaternion(orientation);
    kept.push(impact.slap ? Math.abs(impact.exitVelocity.dot(face) / impact.velocity.dot(face)) : Infinity);
    depths.push(deepest);
  }
  console.log(`  its centre at most ${depths.map((depth) => centimetres(depth)).join(', ')} cm under; the speed into its face its slap keeps ${kept.map((share) => (100 * share).toFixed(0)).join(', ')}%`);
  // Most go in a few centimetres; one let go nose-down slides down along its face, as a plate does (it dove 26 cm, every
  // throw, as a ball of its density).
  const sorted = [...depths].sort((first, second) => first - second);
  check(sorted[3] < 0.06 && sorted.at(-1) < 0.2, `pizzas thrown flat went ${centimetres(sorted[3])} cm under (the middle), ${centimetres(sorted.at(-1))} cm at most`);
  check(Math.max(...kept) < 0.15, `a pizza's slap kept ${(100 * Math.max(...kept)).toFixed(0)}% of its speed into its face`);
}

console.log('\nToppings and fillings (src/thingMeshes.js pizzaToppings, pieFilling), drawn as each is thrown, on 60 throws');
{
  const recipes = new Map(), fillings = new Map();
  let worstShare = 0, leastShare = Infinity, under = 0;
  for (let throwIndex = 0; throwIndex < 60; throwIndex++) {
    randomState = 7 + throwIndex * 31;
    const pizza = new Rock({ radius: 0.15, position: new THREE.Vector3(), velocity: new THREE.Vector3(), envTexture: null, thing: 'pizza', mass: 0.38 });
    recipes.set(pizza.dressing.name, (recipes.get(pizza.dressing.name) ?? 0) + 1);
    worstShare = Math.max(worstShare, pizza.dressing.share); leastShare = Math.min(leastShare, pizza.dressing.share);
    check(near(pizza.mass, 0.38 * (1 + pizza.dressing.share), 1e-9), 'a pizza\'s toppings\' mass is not its own');
    // Its toppings lie on its cheese: none of their corners below where they sink into it.
    const positions = pizza.geometry.attributes.position.array, shared = prepareThing(THINGS.pizza).geometry.attributes.position.count;
    for (let index = shared * 3 + 1; index < positions.length; index += 3) if (positions[index] < 0.03 - 0.0041) under++;
    pizza.dispose();
    const pie = new Rock({ radius: 0.115, position: new THREE.Vector3(), velocity: new THREE.Vector3(), envTexture: null, thing: 'pie', mass: 1.3 });
    const entry = fillings.get(pie.dressing.name) ?? { count: 0, floats: pie.floats, density: pie.density };
    entry.count++;
    fillings.set(pie.dressing.name, entry);
    pie.dispose();
  }
  console.log(`  pizzas: ${[...recipes].map(([name, count]) => `${name} ${count}`).join(', ')}; their toppings ${(100 * leastShare).toFixed(1)} to ${(100 * worstShare).toFixed(1)}% of their mass, ${under} corners under the cheese`);
  console.log(`  pies: ${[...fillings].map(([name, entry]) => `${name} ${entry.count} (${entry.density.toFixed(0)} kg/m³, ${entry.floats ? 'floats' : 'sinks'})`).join(', ')}`);
  check(recipes.size >= 6 && leastShare > 0.03 && worstShare < 0.16 && under === 0, `pizzas' toppings: ${recipes.size} recipes in 60, ${(100 * leastShare).toFixed(1)} to ${(100 * worstShare).toFixed(1)}% of their mass, ${under} corners under the cheese`);
  check(fillings.get('Apple')?.floats && fillings.get('Pumpkin')?.floats && fillings.get('Cherry')?.floats === false && fillings.get('Blueberry')?.floats === false, 'pies: apple and pumpkin do not float, or cherry and blueberry do not sink');
}

console.log('\nThe rubber duck (body.ballast): let go on the water at any angle, and dropped on the deck upside down');
{
  const measured = measure('duck');
  const poses = [[[1, 0, 0], 0], [[1, 0, 0], 90], [[1, 0, 0], 180], [[0, 0, 1], 90], [[0, 0, 1], -90], [[0, 0, 1], 150]];
  const rests = poses.map(([axis, degrees]) => {
    const duck = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 0, -1.4), velocity: new THREE.Vector3(), envTexture: null, thing: 'duck', mass: measured.mass });
    duck.quaternion.setFromAxisAngle(new THREE.Vector3(...axis), THREE.MathUtils.degToRad(degrees));
    Object.assign(duck, { state: 'float', hasFloated: true, spinRate: 0 });
    duck.position.y = duck.floatingHeight();
    let time = 0;
    for (; time < 10 && duck.state !== 'rest'; time += STEP) duck.update(STEP, floorDepthAt);
    return { time, up: duck.uprightAxis.clone().applyQuaternion(duck.quaternion).y, afloat: duck.afloat };
  });
  console.log(`  let go turned ${poses.map(([axis, degrees]) => `${degrees}° about ${axis[0] ? 'x' : 'z'}`).join(', ')}: upright (its up's height) ${rests.map((rest) => rest.up.toFixed(2)).join(', ')}, at rest after ${rests.map((rest) => rest.time.toFixed(1)).join(', ')} s`);
  check(rests.every((rest) => rest.afloat && rest.up > 0.95 && rest.time < 5), 'a rubber duck let go on the water did not right itself and rest within 5 s');
  // Dropped on the deck upside down, and a pizza tilted: each settles onto the face it lies on (Rock.restOn).
  for (const [name, angle] of [['duck', Math.PI], ['pizza', 0.5]]) {
    const thing = measure(name);
    const rock = new Rock({ radius: thing.radius, position: new THREE.Vector3(0, POOL.deck + 0.5, 1.5), velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: thing.mass });
    rock.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    rock.spinRate = 0;
    rock.groundAt = poolGround(POOL_SQUARE);
    follow(rock, { seconds: 10, pooled: true });
    for (let step = 0; step < 120; step++) rock.update(STEP, floorDepthAt);
    const up = rock.uprightAxis.clone().applyQuaternion(rock.quaternion).y, gap = rock.position.y + rock.lowestOffset() - POOL.deck;
    console.log(`  a ${THINGS[name].name.toLowerCase()} dropped on the deck turned ${THREE.MathUtils.radToDeg(angle).toFixed(0)}°: rests ${up > 0.99 ? 'upright' : up < -0.99 ? 'upside down' : `${THREE.MathUtils.radToDeg(Math.acos(up)).toFixed(0)}° off`}, ${(1000 * gap).toFixed(1)} mm over the deck`);
    check(rock.state === 'rest' && Math.abs(up) > 0.99 && (name !== 'duck' || up > 0) && Math.abs(gap) < 1e-3, `a ${name} dropped on the deck rests ${up.toFixed(2)} upright, ${(1000 * gap).toFixed(1)} mm over it`);
  }
}

console.log('\nA pizza skipped (src/main.js skipThrow: by its mass, aimed by its lowest point): 12 throws at each strength');
{
  const skipsBy = {};
  for (const power of ['soft', 'normal', 'hard']) {
    const counts = [];
    for (let trial = 0; trial < 12; trial++) {
      randomState = 900 + trial;
      const measured = measure('pizza');
      const from = new THREE.Vector3(0.3, SKIP_THROW.handHeight, 2.0), target = new THREE.Vector3(0, 0, -0.5);
      // As src/main.js throws it: made first, its tilt drawn, aimed by its own mass and tilt.
      const pizza = new Rock({ radius: measured.radius, position: from, velocity: new THREE.Vector3(), envTexture: null, thing: 'pizza', mass: measured.mass, skip: true });
      const tilt = pizza.skipTilt();
      const aimed = aimSkip(from.clone().setY(from.y - skipLowest(measured.radius, tilt)), target, skipSpeed(power, measured.radius, false, pizza.mass), (x, z) => floorDepthAt(x, z) >= SKIP_THROW.shallowest, target);
      pizza.launchSkip(aimed.velocity, tilt);
      let skips = 0;
      // Its skips, until it goes in: a slap (src/rock.js goIn) is where it does.
      for (let step = 0; step < 240 * 4 && pizza.state !== 'water' && pizza.state !== 'rest' && pizza.state !== 'float'; step++) {
        const touch = pizza.update(STEP, floorDepthAt);
        if (touch?.skim && !touch.slap) skips++;
      }
      counts.push(skips);
    }
    skipsBy[power] = counts;
  }
  const mean = (counts) => counts.reduce((sum, count) => sum + count, 0) / counts.length;
  console.log(`  skips: ${Object.entries(skipsBy).map(([power, counts]) => `${power} ${mean(counts).toFixed(1)} (${Math.min(...counts)} to ${Math.max(...counts)})`).join(', ')}; a river stone's are tools/skip-probe.mjs's`);
  check(mean(skipsBy.normal) >= 1.5 && Math.min(...skipsBy.normal) >= 1, `a pizza thrown with Skip skipped ${mean(skipsBy.normal).toFixed(1)} times on average, at least ${Math.min(...skipsBy.normal)}`);
}

console.log('\nA throw\'s own random stream (src/rock.js `random`): a basketball bounced on the deck, Math.random drawn from or not between its steps');
{
  const bounces = [false, true].map((drawing) => {
    randomState = 4242;
    const measured = measure('basketball');
    const ball = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 1.2, -3.5), velocity: new THREE.Vector3(0.2, 0, 0), envTexture: null, thing: 'basketball', mass: measured.mass });
    ball.groundAt = poolGround(POOL_SQUARE);
    const heights = [];
    let rising = false;
    for (let time = 0; time < 3; time += STEP) {
      if (drawing) Math.random();   // what drawing a mesh's ids, a paint, a splash would take from it
      ball.update(STEP, floorDepthAt);
      if (rising && ball.velocity.y <= 0) heights.push(ball.position.y);
      rising = ball.velocity.y > 0;
    }
    return heights;
  });
  const same = bounces[0].length === bounces[1].length && bounces[0].every((height, index) => height === bounces[1][index]);
  console.log(`  its bounces' tops ${bounces[0].map((height) => height.toFixed(4)).join(', ')} m, and with Math.random drawn from between its steps ${same ? 'the same' : bounces[1].map((height) => height.toFixed(4)).join(', ')}`);
  check(same, 'a basketball\'s bounces changed when Math.random was drawn from between its steps');
}

console.log('\nThe fixed step (src/main.js simulate, src/rock.js drawAt): drawing between steps, and what drawing does not change');
{
  // Frames of 1/165 s, jittered ±8%, stepped as src/main.js steps them: each frame drawn where the ball was at its end,
  // between its last two steps, whatever the frames before drew.
  const measured = measure('tennis');
  const ball = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 0.5, 0), velocity: new THREE.Vector3(10, 2, 0), envTexture: null, thing: 'tennis', mass: measured.mass });
  const stepsAt = [[0, ball.stepEnd.position.clone()]];
  let time = 0, stepsTime = 0, worst = 0, jitter = 7;
  for (let frame = 0; frame < 60; frame++) {
    jitter = (jitter * 16807) % 2147483647;
    const end = time + (1 / 165) * (1 + 0.16 * ((jitter % 1000) / 1000 - 0.5));
    while (stepsTime < end - 1e-12) { ball.update(STEP, 10); stepsTime += STEP; stepsAt.push([stepsTime, ball.stepEnd.position.clone()]); }
    ball.drawAt(1 - (stepsTime - end) / STEP);
    const [beforeTime, before] = stepsAt.at(-2), [, after] = stepsAt.at(-1);
    const truth = before.clone().lerp(after, (end - beforeTime) / STEP);
    worst = Math.max(worst, ball.meshAbove.position.distanceTo(truth));
    time = end;
  }
  console.log(`  a tennis ball at 10 m/s drawn in jittered frames of 1/165 s: at most ${(1000 * worst).toFixed(4)} mm from where it was at each frame's end`);
  check(worst < 1e-6, `drawn between its steps, a tennis ball strays ${(1000 * worst).toFixed(3)} mm from where it was`);
  // A pizza goes in alike however often it is drawn (its give is drawn, never felt: src/rock.js physicsPositions).
  const runs = [0, 4, 2].map((every) => {
    randomState = 31;
    const { rock } = throwThing('pizza', { x: 0, z: -1.4 });
    let impact = null, steps = 0;
    for (; steps < 1000 && !impact; steps++) {
      impact = rock.update(STEP, floorDepthAt);
      if (every && steps % every === 0) rock.flex();
    }
    // How it struck: a slap's push (src/rock.js goIn), an entry's bluntness.
    return { steps, x: impact.x, z: impact.z, bluntness: impact.slap ? impact.push : impact.contact.bluntness };
  });
  const alike = runs.every((run) => run.steps === runs[0].steps && run.x === runs[0].x && run.z === runs[0].z && run.bluntness === runs[0].bluntness);
  console.log(`  a pizza drawn never, every 4 steps and every 2: in at step ${runs.map((run) => run.steps).join(', ')}, z ${runs.map((run) => run.z.toFixed(4)).join(', ')}, bluntness ${runs.map((run) => run.bluntness.toFixed(2)).join(', ')}`);
  check(alike, 'a pizza goes in differently as it is drawn more or less often');
}
{
  // A thing that soaks, sized by its diameter (a defined sponge), stays a number; under a gale, a floater that bobs clear
  // of a crest leaves it where it was drawn.
  defineThing('probe-sponge', {
    name: 'Sponge', group: 'Other', note: 'Soaks', body: { shape: 'sphere', density: 300, size: { by: 'diameter', unit: 'cm', min: 4, max: 10, step: 1, initial: 6 } },
    material: { bounce: [0.2, 0.3], friction: 0.6 }, water: { restingHeight: 0.5, soaks: { seconds: 5, takes: 1 } }, look: { mesh: 'ball', paint: 'plain', color: [230, 210, 90] },
  });
  const sponge = afloatAt('probe-sponge', 0, -1.4);
  for (let time = 0; time < 20; time += STEP) sponge.update(STEP, floorDepthAt);
  const finite = [sponge.position.x, sponge.position.y, sponge.position.z, sponge.density].every(Number.isFinite);
  console.log(`  a sponge sized by its diameter, soaking: ${finite ? `${sponge.density.toFixed(0)} kg/m³, ${sponge.state}` : 'NaN'}`);
  check(finite && sponge.density > 300, `a soaking thing sized by its diameter went to ${sponge.density} kg/m³`);
  const tennis = afloatAt('tennis', 0, -1.4);
  tennis.velocity.y = 2.5;
  tennis.state = 'float';
  let jump = 0, drawn = null;
  for (let step = 0; step < 240 && tennis.state === 'float'; step++) {
    drawn = tennis.meshAbove.position.y;
    tennis.update(STEP, floorDepthAt, () => 0.15);
  }
  if (tennis.state === 'air') jump = Math.abs(tennis.meshAbove.position.y - drawn);
  console.log(`  under a 15 cm crest a tennis ball bobbing clear moves ${(100 * jump).toFixed(1)} cm as it leaves the water (${tennis.state})`);
  check(tennis.state === 'air' && jump < 0.02, `a floater bobbing clear of a crest jumped ${(100 * jump).toFixed(1)} cm`);
}

console.log('\nThings meeting things (src/collide.js):');
{
  // One collision, alone: momentum kept, the bounce the pair's.
  const ball = afloatAt('basketball', 0, -1.4);
  const stone = new Rock({ radius: 0.03, position: new THREE.Vector3(), velocity: new THREE.Vector3(1, -6, -2), envTexture: null });
  stone.position.set(0.004, ball.meshAbove.position.y + ball.radius + 0.8 * stone.collisionRadius, -1.4);
  stone.syncMeshes();
  // The masses as they met (moving them apart changes how much of the ball is wet).
  const masses = new Map([ball, stone].map((thing) => [thing, thing.collisionMass()]));
  const momentum = () => [ball, stone].reduce((sum, thing) => sum.addScaledVector(thing.velocity, masses.get(thing)), new THREE.Vector3());
  const before = momentum();
  const normal = ball.meshAbove.position.clone().sub(stone.meshAbove.position).normalize();
  const closingBefore = stone.velocity.clone().sub(ball.velocity).dot(normal);
  collideThings([ball, stone]);
  const after = momentum();
  const closingAfter = stone.velocity.clone().sub(ball.velocity).dot(normal);
  const bounce = Math.sqrt(ball.collisionBounce * stone.collisionBounce);
  console.log(`  a stone striking a basketball afloat at ${closingBefore.toFixed(2)} m/s: they part at ${(-closingAfter).toFixed(2)} m/s (bounce ${bounce.toFixed(2)}), momentum ${before.toArray().map((value) => value.toFixed(4)).join(', ')} → ${after.toArray().map((value) => value.toFixed(4)).join(', ')} kg·m/s`);
  check(after.distanceTo(before) < 1e-9 * Math.max(before.length(), 1), 'a collision did not keep the pair\'s momentum');
  check(Math.abs(-closingAfter - bounce * closingBefore) < 1e-9, `a collision gave back ${(-closingAfter / closingBefore).toFixed(3)} of the closing speed, not ${bounce.toFixed(3)}`);
}
{
  // A glancing hit (src/collide.js rub): a tennis ball skimming over a basketball afloat. Their surfaces rub, so both spin
  // and the tennis ball's path turns; momentum and angular momentum are kept, no energy is made.
  const ball = afloatAt('basketball', 0, -1.4);
  const tennis = new Rock({ radius: measure('tennis').radius, position: new THREE.Vector3(), velocity: new THREE.Vector3(4, -1, 0), envTexture: null, thing: 'tennis', mass: measure('tennis').mass });
  tennis.spinRate = 0;
  const reach = ball.collisionRadius + tennis.collisionRadius;
  // Touching where the line between them is 55° off the tennis ball's path.
  const angle = THREE.MathUtils.degToRad(55);
  tennis.position.set(ball.meshAbove.position.x - 0.999 * reach * Math.sin(angle), ball.meshAbove.position.y + 0.999 * reach * Math.cos(angle), -1.4);
  tennis.previous.copy(tennis.position);
  tennis.syncMeshes();
  const pair = [ball, tennis];
  const masses = new Map(pair.map((thing) => [thing, thing.collisionMass()]));
  const spin = (thing) => thing.spinAxis.clone().multiplyScalar(thing.spinRate);
  const energy = () => pair.reduce((sum, thing) => sum + 0.5 * masses.get(thing) * thing.velocity.lengthSq() + 0.5 * thing.collisionInertia * spin(thing).lengthSq(), 0);
  // About the origin, from where they parted (the overlap's parting moves them, not their momentum).
  const angularMomentum = (velocities, spins) => pair.reduce((sum, thing, index) => sum.add(thing.meshAbove.position.clone().cross(velocities[index]).multiplyScalar(masses.get(thing))).addScaledVector(spins[index], thing.collisionInertia), new THREE.Vector3());
  const energyBefore = energy();
  const velocitiesBefore = pair.map((thing) => thing.velocity.clone()), spinsBefore = pair.map(spin);
  const headingBefore = Math.atan2(tennis.velocity.y, tennis.velocity.x);
  collideThings(pair);
  const energyAfter = energy();
  const turningBefore = angularMomentum(velocitiesBefore, spinsBefore), turningAfter = angularMomentum(pair.map((thing) => thing.velocity), pair.map(spin));
  const turned = THREE.MathUtils.radToDeg(Math.atan2(tennis.velocity.y, tennis.velocity.x) - headingBefore);
  console.log(`  a tennis ball glancing off a basketball afloat at 4.1 m/s: spun to ${tennis.spinRate.toFixed(1)} rad/s, the basketball to ${ball.spinRate.toFixed(1)} rad/s; energy ${energyBefore.toFixed(4)} → ${energyAfter.toFixed(4)} J; angular momentum kept to ${turningAfter.distanceTo(turningBefore).toExponential(1)} kg·m²/s`);
  check(tennis.spinRate > 1 && ball.spinRate > 0.1, 'a glancing hit spun neither ball');
  check(energyAfter <= energyBefore + 1e-9, 'a glancing hit made energy');
  check(turningAfter.distanceTo(turningBefore) < 1e-6 * Math.max(turningBefore.length(), 1), 'a glancing hit did not keep the pair\'s angular momentum');
  check(Number.isFinite(turned), 'a glancing hit left no path');
}
{
  // A stone thrown at a basketball afloat where the tap falls.
  const ball = afloatAt('basketball', 0, -1.4);
  const { rock: stone } = throwThing('stone', { x: 0, z: -1.4 });
  const startedAt = ball.position.clone();
  const record = together([ball, stone], 20);
  const moved = Math.hypot(ball.position.x - startedAt.x, ball.position.z - startedAt.z);
  console.log(`  a 6 cm stone thrown at a basketball afloat: ${record.knocks} knock(s), the ball dipped ${centimetres(-record.lowest.get(ball))} cm and moved ${centimetres(moved)} cm, ${record.ripples} ring(s); the ball ${ball.afloat ? 'rests afloat' : ball.state}, the stone ${stone.state}; worst overlap after a meeting ${(1000 * record.overlap).toFixed(2)} mm`);
  check(record.knocks >= 1 && moved > 0.01 && record.lowest.get(ball) < -0.005, 'a stone thrown at a basketball afloat did not knock it');
  check(ball.afloat && stone.state === 'rest' && stone.position.y < 0, `after the knock the ball is ${ball.afloat ? 'afloat' : ball.state} and the stone ${stone.state}`);
  check(record.overlap < OVERLAP_MOST, `a stone and a basketball overlapped by ${(1000 * record.overlap).toFixed(1)} mm`);
}
{
  // A 16 lb bowling ball dropped on a tennis ball afloat.
  const ball = afloatAt('tennis', 0.5, -1.6);
  const measured = measure('bowling', 16);
  const bowling = new Rock({ radius: measured.radius, position: new THREE.Vector3(0.5 + 0.02, ball.meshAbove.position.y + 0.8, -1.6), velocity: new THREE.Vector3(), envTexture: null, thing: 'bowling', mass: measured.mass });
  const record = together([ball, bowling], 20);
  console.log(`  a 16 lb bowling ball dropped from 80 cm on a tennis ball afloat: the tennis ball went ${centimetres(-record.lowest.get(ball))} cm under where it floats and ${ball.afloat ? 'floats again' : ball.state}; the bowling ball ${bowling.state}; worst overlap ${(1000 * record.overlap).toFixed(2)} mm`);
  check(record.lowest.get(ball) < -2 * ball.radius && ball.afloat, 'a bowling ball dropped on a tennis ball did not drive it under, or it did not float again');
  check(record.overlap < OVERLAP_MOST, `a bowling ball and a tennis ball overlapped by ${(1000 * record.overlap).toFixed(1)} mm`);
}
{
  // A 5 ct diamond at 14 m/s through a tennis ball afloat (review: it passed through it in one 1/240 s step). However
  // the 1/240 s is cut into steps, it strikes the ball and comes back.
  const results = [1, 2, 3, 4].map((parts) => {
    const ball = afloatAt('tennis', 0, -1.4);
    const measured = measure('diamond', 5);
    const start = ball.meshAbove.position.clone().add(new THREE.Vector3(-0.03, 0.03, 0));
    const diamond = new Rock({ radius: measured.radius, position: start, velocity: new THREE.Vector3(10, -10, 0), envTexture: null, thing: 'diamond', mass: measured.mass });
    let knocks = 0;
    for (let step = 0; step < parts; step++) {
      ball.update(STEP / parts, floorDepthAt);
      diamond.update(STEP / parts, floorDepthAt);
      knocks += collideThings([ball, diamond]).length;
    }
    return { parts, struck: ball.velocity.length() > 0.05, back: diamond.velocity.x < 0, knocks };
  });
  console.log(`  a 5 ct diamond at 14 m/s through a tennis ball afloat, 1/240 s cut into 1 to 4 steps: ${results.map((result) => `${result.parts}: ${result.struck && result.back ? 'struck it' : 'passed'}`).join(', ')}`);
  check(results.every((result) => result.struck && result.back), `a fast diamond passed through a tennis ball afloat (${results.filter((result) => !(result.struck && result.back)).map((result) => `${result.parts} step(s)`).join(', ')})`);
}
{
  // Masses and sizes far apart, swept in 1 to 4 steps: a 1000 ct ruby at 25 m/s through a tennis ball afloat (a heavy,
  // small, fast thing: it must not pass through), a 16 lb bowling ball at 6 m/s into one (the tennis ball must go), a
  // tennis ball at 20 m/s into a 40 cm pizza afloat (a light thing off a broad one: it must come back).
  const cases = [
    { label: 'a 1000 ct ruby at 25 m/s into a tennis ball', floater: ['tennis'], thrown: ['ruby', 1000], speed: 25 },
    { label: 'a 16 lb bowling ball at 6 m/s into a tennis ball', floater: ['tennis'], thrown: ['bowling', 16], speed: 6 },
    { label: 'a tennis ball at 20 m/s into a 40 cm pizza', floater: ['pizza', 3], thrown: ['tennis'], speed: 20 },
  ];
  for (const { label, floater, thrown, speed } of cases) {
    const results = [1, 2, 3, 4].map((parts) => {
      const measuredFloater = measure(...floater);
      const target = new Rock({ radius: measuredFloater.radius, position: new THREE.Vector3(0, 0, -1.4), velocity: new THREE.Vector3(), envTexture: null, thing: floater[0], mass: measuredFloater.mass });
      target.state = 'float'; target.hasFloated = true; target.quaternion.identity(); target.spinRate = 0;
      target.position.y = target.floatingHeight();
      target.syncMeshes();
      const measuredThrown = measure(...thrown);
      // Starting just clear of it, aimed through its middle at 45° down: within one 1/240 s step it would be past it.
      const reach = target.collisionRadius + 1.02 * measuredThrown.radius * (1 + 0.5 * speed * STEP / measuredThrown.radius);
      const start = target.meshAbove.position.clone().add(new THREE.Vector3(-reach / Math.SQRT2, reach / Math.SQRT2, 0));
      const thing = new Rock({ radius: measuredThrown.radius, position: start, velocity: new THREE.Vector3(speed / Math.SQRT2, -speed / Math.SQRT2, 0), envTexture: null, thing: thrown[0], mass: measuredThrown.mass });
      for (let step = 0; step < 2 * parts; step++) {
        target.update(STEP / parts, floorDepthAt);
        thing.update(STEP / parts, floorDepthAt);
        collideThings([target, thing]);
      }
      return { parts, struck: target.velocity.length() > 0.05, apart: thing.meshAbove.position.distanceTo(target.meshAbove.position) >= 0.999 * (thing.collisionRadius + target.collisionRadius) || thing.velocity.x < 0 };
    });
    console.log(`  ${label}, 1/240 s cut into 1 to 4 steps: ${results.map((result) => `${result.parts}: ${result.struck && result.apart ? 'struck it' : 'passed'}`).join(', ')}`);
    check(results.every((result) => result.struck && result.apart), `${label}: missed in ${results.filter((result) => !(result.struck && result.apart)).map((result) => `${result.parts} step(s)`).join(', ')}`);
  }
}
{
  // A skip stone skimming into a basketball afloat in its path (review: on the water, skimming, it went through it).
  const stone = new Rock({ radius: 0.03, position: new THREE.Vector3(0, 0.25, 0), velocity: new THREE.Vector3(0, -1.2, -9), envTexture: null, skip: true });
  stone.launchSkip(stone.velocity);
  for (let time = 0; time < 1 && stone.state !== 'skim'; time += STEP) stone.update(STEP, floorDepthAt);
  const skimming = stone.state === 'skim';
  const heading = new THREE.Vector3(stone.velocity.x, 0, stone.velocity.z).normalize();
  const ball = afloatAt('basketball', 0, 0);
  const rise = ball.meshAbove.position.y - stone.meshAbove.position.y;
  const apart = Math.sqrt(Math.max((ball.collisionRadius + stone.collisionRadius + 0.005) ** 2 - rise * rise, 0));
  ball.position.x = stone.position.x + heading.x * apart;
  ball.position.z = stone.position.z + heading.z * apart;
  ball.syncMeshes();
  let struckSkimming = false, overlap = 0;
  for (let step = 0; step < 60; step++) {
    ball.update(STEP, floorDepthAt);
    stone.update(STEP, floorDepthAt);
    const wasSkimming = stone.state === 'skim';
    const knocks = collideThings([ball, stone]);
    if (wasSkimming && knocks.length > 0) struckSkimming = true;
    overlap = Math.max(overlap, ball.collisionRadius + stone.collisionRadius - ball.meshAbove.position.distanceTo(stone.meshAbove.position));
  }
  console.log(`  a skip stone skimming into a basketball afloat: ${skimming ? (struckSkimming ? 'strikes it as it skims' : 'passes through it') : 'never skimmed'}; the ball moves off at ${ball.velocity.length().toFixed(2)} m/s; worst overlap ${(1000 * Math.max(overlap, 0)).toFixed(2)} mm`);
  check(skimming && struckSkimming && overlap < OVERLAP_MOST, 'a skimming stone did not strike a basketball afloat in its path');
}
{
  // Two basketballs afloat drifting into each other.
  const one = afloatAt('basketball', -0.4, -1.2), other = afloatAt('basketball', 0.4, -1.2);
  one.knock(0.6, 0, 0, 0, 0, 0);
  other.knock(-0.6, 0, 0, 0, 0, 0);
  const record = together([one, other], 20);
  const apart = one.position.distanceTo(other.position);
  console.log(`  two basketballs drifting together at 0.6 m/s each: met ${record.met.size} time(s), rest ${centimetres(apart)} cm apart (centres), worst overlap ${(1000 * record.overlap).toFixed(2)} mm`);
  check(record.met.size >= 1 && apart >= one.collisionRadius + other.collisionRadius - OVERLAP_MOST && one.afloat && other.afloat, 'two basketballs drifting together did not bounce apart and float');
  check(record.overlap < OVERLAP_MOST, `two basketballs overlapped by ${(1000 * record.overlap).toFixed(1)} mm`);
}

{
  // Knocks passed on: a basketball driven into a row of three touching ones (within a step, as a cradle's),
  // and one into a line of three spaced apart (one after another, over steps).
  for (const [label, gap] of [['touching', 0], ['30 cm apart', 0.3]]) {
    const row = [0, 1, 2, 3].map((index) => afloatAt('basketball', -0.9 + index * (2 * measure('basketball').radius + gap) + (index === 0 ? -0.3 : 0), -1.4));
    row[0].knock(1.2, 0, 0, 0, 0, 0);
    let worst = 0;
    const knocked = new Set();
    for (let time = 0; time < 25; time += STEP) {
      for (const thing of row) thing.update(STEP, floorDepthAt);
      for (const { ripple } of collideThings(row)) knocked.add(ripple.rock);
      for (let first = 0; first < row.length; first++) {
        for (let second = first + 1; second < row.length; second++) worst = Math.max(worst, row[first].collisionRadius + row[second].collisionRadius - row[first].meshAbove.position.distanceTo(row[second].meshAbove.position));
      }
      if (row.every((thing) => thing.state === 'rest')) break;
    }
    const travelled = row.map((thing) => thing.position.x.toFixed(2));
    const ordered = row.every((thing, index) => index === 0 || thing.position.x > row[index - 1].position.x);
    console.log(`  a basketball driven at 1.2 m/s into three more ${label}: ${knocked.size} knocked, they rest at x = ${travelled.join(', ')} m${row.every((thing) => thing.afloat) ? ', all afloat' : ''}; worst overlap ${(1000 * worst).toFixed(2)} mm`);
    check(row[3].position.x > -0.9 + 3 * (2 * row[3].radius + gap) + 0.03, `a row ${label}: the knock did not pass to the last ball`);
    check(ordered && row.every((thing) => thing.afloat) && worst < OVERLAP_MOST, `a row ${label}: out of order, not afloat, or overlapping by ${(1000 * worst).toFixed(1)} mm`);
  }
}

{
  // The pool's walls: a basketball afloat driven at one comes back off it; one driven into another against a wall
  // passes the knock on, and the wall sends it back (within the steps, src/collide.js's passes).
  const contain = (thing) => holdInPool(thing, POOL_SQUARE);
  const wallX = POOL_SQUARE.minX + POOL_SQUARE.size;
  const lone = afloatAt('basketball', wallX - 0.5, -1.0);
  lone.knock(1.0, 0, 0, 0, 0, 0);
  let turnedAt = null, arrived = 0, rings = 0;
  for (let time = 0; time < 3 && turnedAt === null; time += STEP) {
    lone.update(STEP, POOL.depth);
    arrived = lone.velocity.x;
    rings += collideThings([lone], contain).length;
    if (lone.velocity.x < 0) turnedAt = -lone.velocity.x;
  }
  const bounce = lone.collisionBounce * 0.8;
  console.log(`  a basketball afloat driven at a pool wall at 1 m/s reaches it at ${arrived.toFixed(2)} m/s and comes back at ${turnedAt?.toFixed(2)} (${(turnedAt / arrived).toFixed(2)}, its bounce times the water's ${bounce.toFixed(2)}; ${rings} ring)`);
  check(turnedAt !== null && Math.abs(turnedAt / arrived - bounce) < 1e-6, `a basketball driven at a wall came back at ${turnedAt?.toFixed(2)} m/s from ${arrived.toFixed(2)}, not ${bounce.toFixed(2)} of it`);
  const atWall = afloatAt('basketball', wallX - measure('basketball').radius, -1.6);
  const driven = afloatAt('basketball', wallX - 1.0, -1.6);
  driven.knock(1.2, 0, 0, 0, 0, 0);
  let worst = 0, outside = 0, nearest = -Infinity;
  for (let time = 0; time < 25; time += STEP) {
    for (const thing of [atWall, driven]) thing.update(STEP, POOL.depth);
    collideThings([atWall, driven], contain);
    worst = Math.max(worst, atWall.collisionRadius + driven.collisionRadius - atWall.meshAbove.position.distanceTo(driven.meshAbove.position));
    outside = Math.max(outside, atWall.position.x + atWall.radius - wallX, driven.position.x + driven.radius - wallX);
    nearest = Math.max(nearest, driven.position.x);
    if (atWall.state === 'rest' && driven.state === 'rest') break;
  }
  console.log(`  a basketball driven at 1.2 m/s into one against the wall: sent back ${centimetres(nearest - driven.position.x)} cm from where they met, the other ${centimetres(wallX - atWall.position.x - atWall.radius)} cm off the wall; worst overlap ${(1000 * worst).toFixed(2)} mm, past the wall ${(1000 * Math.max(outside, 0)).toFixed(2)} mm`);
  check(nearest - driven.position.x > 0.05 && worst < OVERLAP_MOST && outside < 1e-6 && driven.afloat && atWall.afloat, 'a basketball driven into one against a wall was not sent back, or they overlapped or crossed the wall');

  // A skipped pumice afloat keeps its skip, and the walls must hold it still (review: it floated through them).
  const pumice = new Rock({ radius: 0.015, position: new THREE.Vector3(1.46, 0, -1), velocity: new THREE.Vector3(), envTexture: null, thing: 'pumice', skip: true });
  Object.assign(pumice, { state: 'float', hasFloated: true });
  pumice.position.y = pumice.floatingHeight();
  pumice.velocity.x = 1;
  let farthest = -Infinity;
  for (let time = 0; time < 0.5; time += STEP) { pumice.update(STEP, POOL.depth); collideThings([pumice], contain); farthest = Math.max(farthest, pumice.position.x); }
  console.log(`  a skipped 3 cm pumice afloat driven at a wall at 1 m/s: it gets to x = ${farthest.toFixed(3)} m, the wall less its radius ${(wallX - pumice.radius).toFixed(3)}`);
  check(farthest <= wallX - pumice.radius + 1e-6, `a skipped pumice afloat went through the pool's wall (to x = ${farthest.toFixed(3)})`);

  // A basketball bobbed clear and knocked at a wall: in the air, below the wall's top, the wall's side turns it back (review: it went through and onto the deck).
  const bobbed = new Rock({ radius: measure('basketball').radius, position: new THREE.Vector3(1.37, 0.14, -1), velocity: new THREE.Vector3(3, 1, 0), envTexture: null, thing: 'basketball', mass: measure('basketball').mass });
  Object.assign(bobbed, { state: 'air', hasFloated: true });
  bobbed.previous.copy(bobbed.position);
  bobbed.groundAt = poolGround(POOL_SQUARE);
  let through = false;
  for (let step = 0; step < 240; step++) {
    bobbed.update(STEP, POOL.depth);
    collideThings([bobbed], contain);
    if (bobbed.position.x > wallX - bobbed.radius + 1e-6 && bobbed.position.y - bobbed.radius < POOL.deck) through = true;
  }
  console.log(`  a basketball bobbed clear, knocked at a wall at 3 m/s: ${through ? 'went through its side' : 'came back off its side'}, now ${bobbed.state} at x = ${bobbed.position.x.toFixed(2)}`);
  check(!through && !bobbed.onGround, 'a basketball in the air went through the side of a pool wall');
}

// ---- the splash's drops and the pool's walls and deck (src/splash.js setGround) ----
{
  const water = { heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512, cell: 6 / 512, depth: POOL.depth, addSplat: () => {}, addFoam: () => {} };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  const wet = [];
  splash.setGround({ square: POOL_SQUARE, deck: POOL.deck, onWet: (x, z, radius) => wet.push({ x, z, radius }) });
  const wallX = POOL_SQUARE.minX + POOL_SQUARE.size;
  // One drop low at the wall (below the deck's top), one thrown high over it.
  splash.spawnDroplet(wallX - 0.05, 0.05, -1, 2, 0.5, 0, 0.002);
  splash.spawnDroplet(wallX - 0.05, 0.3, -1, 1.5, 1, 0, 0.003);
  let through = false, landed = false;
  for (let time = 0; time < 1.5; time += STEP) {
    splash.update(STEP, water);
    for (let index = 0; index < splash.count; index++) {
      const x = splash.positions[index * 3], y = splash.positions[index * 3 + 1];
      if (x > wallX && y < POOL.deck - 1e-6) through = true;
    }
    if (wet.some((spot) => spot.x > wallX)) landed = true;
  }
  console.log(`\nThe splash's drops by the pool's wall: ${through ? 'one went into the wall or under the deck' : 'none went into the wall or under the deck'}; ${landed ? `landed on the deck, wetting ${wet.length} spot(s)` : 'none landed on the deck'}`);
  check(!through, 'a splash drop went through the pool\'s wall or under its deck');
  check(landed, 'a splash drop thrown over the pool\'s wall did not land on the deck');
  // One step that crosses the wall's line above the deck's top and ends below it went over the coping: it lands on the
  // deck. One that rises past the deck's top in the step crossed the wall's side below it: it comes back.
  const oneStep = (y, vx, vy) => {
    splash.reset();
    wet.length = 0;
    splash.spawnDroplet(wallX - 0.002, y, -1, vx, vy, 0, 0.002);
    splash.update(0.02, water);
    return { landed: wet.length > 0, back: splash.count > 0 && splash.positions[0] < wallX };
  };
  const overCoping = oneStep(POOL.deck + 0.004, 2, -1);
  const upTheSide = oneStep(POOL.deck - 0.004, 2, 1.5);
  console.log(`A drop over the coping in one step: ${overCoping.landed ? 'lands on the deck' : overCoping.back ? 'comes back into the pool' : 'is gone'}; one rising past the deck's top at the wall: ${upTheSide.back ? 'comes back off its side' : upTheSide.landed ? 'lands on the deck' : 'went through'}`);
  check(overCoping.landed && !overCoping.back, 'a splash drop that crossed above the deck\'s top and ended below it did not land on the deck');
  check(upTheSide.back && !upTheSide.landed, 'a splash drop rising past the deck\'s top at the wall went through its side');
}

// ---- a thing defined from outside (src/things.js defineThing) ----
{
  const broken = validateThing('broken', { name: 'Broken', group: 'Test', note: 'x', body: { shape: 'cube', size: { by: 'fixed', diameter: 0.1 } }, material: { bounce: [0.9, 0.2], friction: 0.5 }, water: { restingHeight: 1 }, look: { mesh: 'teapot' } });
  let refused = null;
  try { defineThing('broken', { name: 'Broken' }); } catch (error) { refused = error.message; }
  console.log(`\nA broken definition: ${broken.length} problems ("${broken[0]}", …); defineThing refuses it: ${refused ? 'yes' : 'no'}`);
  check(broken.length >= 4 && refused !== null && !THING_NAMES.includes('broken'), 'a broken definition was not refused');
  const beachBall = defineThing('test-beach-ball', {
    name: 'Beach ball', group: 'Test', note: 'Defined by the probe',
    body: { shape: 'sphere', size: { by: 'fixed', diameter: 0.4, mass: 0.12 } },
    material: { bounce: [0.6, 0.7], friction: 0.5, roll: 'shell', rolling: 0.03 },
    air: { drag: 0.5 }, water: { restingHeight: 0.97 },
    look: { mesh: 'ball', paint: 'plain', color: [40, 120, 230], roughness: 0.4, reflection: 1.0 },
  });
  const { rock } = throwThing('test-beach-ball', { x: 0, z: -1.2 });
  const record = follow(rock);
  const draft = rock.radius - rock.position.y, expected = rock.radius - rock.floatingHeight();
  console.log(`A beach ball defined from outside (${centimetres(2 * beachBall.measure().radius)} cm, ${(1000 * beachBall.measure().mass).toFixed(0)} g): ${rock.afloat ? 'rests afloat' : rock.state}, ${centimetres(draft)} cm under (Archimedes ${centimetres(expected)})`);
  check((rock.afloat || rock.state === 'float') && Math.abs(draft - expected) < FLOAT_DEPTH_TOLERANCE, `a thing defined from outside does not float as it should (${rock.state}, ${centimetres(draft)} cm under, Archimedes ${centimetres(expected)})`);
  THING_NAMES.splice(THING_NAMES.indexOf('test-beach-ball'), 1);
  delete THINGS['test-beach-ball'];
}

// ---- definitions as anyone might write them (src/things.js validateThing, defineThing) ----
{
  // The review's: each refused, none crashing the check, none registered.
  const sphereLook = { mesh: 'ball', paint: 'plain', color: [200, 60, 40] };
  const good = {
    name: 'Probe ball', group: 'Test', note: 'Defined by the probe',
    body: { shape: 'sphere', size: { by: 'fixed', diameter: 0.2, mass: 0.3 } },
    material: { bounce: [0.5, 0.6], friction: 0.5 }, water: { restingHeight: 0.97 }, look: sphereLook,
  };
  const reviewCases = {
    'a stone look without its fields': { ...good, body: { shape: 'mesh', density: 2600, size: { by: 'diameter', unit: 'cm', min: 2, max: 10, step: 1, initial: 5 } }, look: { mesh: 'stone' } },
    'body.soft null': { ...good, body: { ...good.body, soft: null } },
    'presets an object': { ...good, body: { shape: 'sphere', size: { by: 'preset', presets: {}, initial: 1 } } },
    'an infinite diameter': { ...good, body: { shape: 'sphere', size: { by: 'preset', unit: 'size', initial: 1, presets: [{ value: 1, label: 'x', diameter: Infinity, mass: 1 }] } } },
  };
  const refusals = Object.entries(reviewCases).map(([label, definition]) => {
    let problems = null, error = null;
    try { problems = validateThing('probe-case', definition); } catch (thrown) { problems = `the check threw: ${thrown.message}`; }
    try { defineThing('probe-case', definition); } catch (thrown) { error = thrown.message; }
    return { label, refused: Array.isArray(problems) && problems.length > 0 && error !== null && !Object.hasOwn(THINGS, 'probe-case') };
  });
  console.log(`\nDefinitions as anyone might write them: the review's four refused plainly: ${refusals.map((entry) => `${entry.label} ${entry.refused ? 'yes' : 'NO'}`).join('; ')}`);
  check(refusals.every((entry) => entry.refused), `a bad definition was not refused plainly (${refusals.filter((entry) => !entry.refused).map((entry) => entry.label).join(', ')})`);
  // Random damage to good definitions (one field at a time put to something else JSON can hold): the check never throws,
  // and what defineThing takes can be made, measured and stepped.
  const junk = [null, undefined, {}, [], '', 'x', true, 0, -1, 1e9, 1e-9, Number.NaN, Infinity, [1], [Infinity, 1], { by: 'mass' }];
  const fields = (value, prefix = []) => (value && typeof value === 'object' ? Object.entries(value).flatMap(([key, entry]) => [[...prefix, key], ...fields(entry, [...prefix, key])]) : []);
  let fuzzRandom = 12345;
  const pick = (count) => { fuzzRandom = (fuzzRandom * 16807) % 2147483647; return fuzzRandom % count; };
  const sources = [good, ...['stone', 'slate', 'basketball', 'bowling', 'diamond', 'pizza', 'watermelon', 'brick'].map((key) => {
    const { key: unused, short, called, sphere, byDiameter, sizeShare, slider, measure: measuring, readout, properties, fastest, fastestFor, skips, ...rest } = THINGS[key];
    return structuredClone({ ...rest, material: { ...rest.material, roll: rest.material.roll === null ? undefined : rest.material.roll === 5 / 7 ? 'solid' : 'shell' } });
  })];
  let tried = 0, threw = 0, taken = 0, broken = 0;
  for (let trial = 0; trial < 1500; trial++) {
    const definition = structuredClone(sources[pick(sources.length)]);
    const paths = fields(definition);
    for (let damage = 0; damage <= pick(2); damage++) {
      const path = paths[pick(paths.length)];
      let holder = definition;
      for (const key of path.slice(0, -1)) holder = holder?.[key];
      if (holder && typeof holder === 'object') holder[path.at(-1)] = junk[pick(junk.length)];
    }
    tried++;
    try { validateThing('probe-fuzz', definition); } catch { threw++; }
    let thing = null;
    try { thing = defineThing('probe-fuzz', definition); } catch { /* refused: as it should be, if it is bad */ }
    if (!thing) continue;
    taken++;
    try {
      const measured = thing.measure(thing.slider?.initial);
      const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 0.5, -1.4), velocity: new THREE.Vector3(0, -3, -2), envTexture: null, thing: 'probe-fuzz', mass: measured.mass });
      for (let step = 0; step < 240; step++) rock.update(STEP, floorDepthAt);
      if (![rock.position.x, rock.position.y, rock.position.z, rock.density].every(Number.isFinite)) broken++;
      rock.dispose();
    } catch { broken++; }
  }
  THING_NAMES.splice(THING_NAMES.indexOf('probe-fuzz') >>> 0, THING_NAMES.includes('probe-fuzz') ? 1 : 0);
  delete THINGS['probe-fuzz'];
  console.log(`  ${tried} definitions damaged at random: the check threw on ${threw}; defineThing took ${taken}, of which ${broken} could not be made or stepped`);
  check(threw === 0 && broken === 0, `damaged definitions: the check threw on ${threw}, and ${broken} taken could not be made or stepped`);
}

// ---- mass, density and volume agree (src/things.js measure, src/rock.js) ----
{
  // Each thing's mass, against its density and the volume it displaces (its mesh's own, measured here apart from the
  // app's stoneShape), but for a thing sized by its diameter, whose mass is a ball's of its density (the river stone's).
  const disagree = [];
  for (const name of THING_NAMES) {
    const thing = THINGS[name];
    if (thing.byDiameter) continue;
    for (const value of thing.slider ? [thing.slider.min, thing.slider.max] : [undefined]) {
      const measured = thing.measure(value);
      const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(), velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: measured.mass });
      // A dressed thing's (a pizza's toppings, a pie's filling) is its shared mesh's: its parts are millimetres thin, and it floats by that mesh.
      const positions = (rock.dressing ? prepareThing(THINGS[name]).geometry : rock.geometry).attributes.position.array;
      let unit = 0;
      for (let index = 0; index < positions.length; index += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(index, index + 9);
        unit += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
      }
      const volume = (rock.sphere ? (4 / 3) * Math.PI : unit) * measured.radius ** 3;
      const ratio = (rock.density * volume) / rock.mass;
      if (Math.abs(ratio - 1) > (rock.sphere ? 1e-9 : 1e-3)) disagree.push(`${name}${value !== undefined ? ` ${value}` : ''} ${ratio.toFixed(3)}`);
      rock.dispose();
    }
  }
  console.log(`\nMass, density and volume: density × volume / mass for each thing at its least and most${disagree.length ? `: off for ${disagree.join(', ')}` : ': 1 for every one'}`);
  check(disagree.length === 0, `mass, density and volume disagree (${disagree.join(', ')})`);
}

// ---- what a throw costs the main thread (src/rock.js prepareThing) ----
{
  // Each thing made as the app throws it, after it is prepared (src/main.js warmUp): the median of 15. A thing of a
  // fixed mesh shares its prepared one; a stone's lumps are its own, built each throw.
  const rows = [], over = [];
  let preparing = 0;
  for (const name of THING_NAMES) {
    const thing = THINGS[name];
    const started = performance.now();
    prepareThing(thing);
    preparing += performance.now() - started;
    const measured = thing.measure(thing.slider?.initial);
    const times = [];
    for (let trial = 0; trial < 15; trial++) {
      const before = performance.now();
      const rock = new Rock({ radius: thing.byDiameter ? 0.03 : measured.radius, position: new THREE.Vector3(), velocity: new THREE.Vector3(), envTexture: null, thing: name, mass: measured.mass });
      if (thing.air.model === 'flutter') rock.trialFlight();
      times.push(performance.now() - before);
      rock.dispose();
    }
    times.sort((first, second) => first - second);
    const median = times[7];
    rows.push({ name, median, fixed: meshKind(thing.look.mesh).fixed });
  }
  // A fixed mesh's thing costs under FIXED_THROW_MS, or, on a machine busy enough that a river stone (built afresh each
  // throw, as it always was) costs more than STONE_LOAD_MS, under STONE_SHARE of a stone's throw on this same run.
  const stone = rows.find((row) => row.name === 'stone').median;
  const most = stone > STONE_LOAD_MS ? STONE_SHARE * stone : FIXED_THROW_MS;
  for (const row of rows) if (row.fixed && row.median > most) over.push(`${row.name} ${row.median.toFixed(2)} ms`);
  console.log(`\nWhat making a thing costs as it is thrown (ms, median of 15, once prepared; preparing them all took ${preparing.toFixed(0)} ms): ${rows.map((row) => `${row.name} ${row.median.toFixed(2)}`).join(', ')}`);
  check(over.length === 0, `a prepared thing costs more than ${most.toFixed(2)} ms to throw (${over.join(', ')})`);
}

// ---- the substep, and the cost ----
{
  const runs = [STEP, STEP / 2].map((step) => {
    randomState = 99;
    const { rock } = throwThing('basketball');
    const record = follow(rock, { step });
    return { bob: record.highestBob - rock.floatingHeight(), rest: rock.position.y, record };
  });
  const change = Math.abs(runs[1].bob - runs[0].bob) / Math.max(Math.abs(runs[0].bob), 1e-6);
  console.log(`\nHalving the substep moves a basketball's highest bob by ${(100 * change).toFixed(1)}% and its rest by ${(1000 * Math.abs(runs[1].rest - runs[0].rest)).toFixed(3)} mm`);
  check(change < STEP_TOLERANCE, `basketball: halving the substep moved its highest bob by ${(100 * change).toFixed(1)}%`);
  check(Math.abs(runs[1].rest - runs[0].rest) < 1e-4, 'basketball: halving the substep moved where it floats');
  const floating = lake.filter((entry) => entry.record.floatSteps > 0);
  const cost = Math.max(...floating.map((entry) => entry.record.cost / entry.record.floatSteps));
  console.log(floating.map((entry) => `${entry.name} ${(1000 * entry.record.cost / entry.record.floatSteps).toFixed(1)} µs × ${entry.record.floatSteps}`).join(", "));
  console.log(`A floater's step costs at most ${(1000 * cost).toFixed(2)} µs`);
  check(cost < STEP_COST_MS, `a floater's step costs ${(1000 * cost).toFixed(2)} µs`);
}

if (failures.length > 0) {
  console.log(`\nthing-probe: ${failures.length} check${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nthing-probe: all checks pass');
