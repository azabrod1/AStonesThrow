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
//     comes back up and floats; two basketballs drifting into each other
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
//     over a wall lands on the deck and wets it;
//   - a thing defined from outside (src/things.js defineThing: a plain beach
//     ball) is thrown and floats as its definition says, and a broken
//     definition is refused, with what is wrong with it;
//   - halving the substep moves a floater's highest bob by under
//     STEP_TOLERANCE and its rest not at all;
//   - a floater's step costs under STEP_COST_MS.
//
//   node tools/thing-probe.mjs
import * as THREE from 'three';
import { Rock, aimThrow } from '../src/rock.js';
import { THINGS, THING_NAMES, WATER_DENSITY, defineThing, validateThing } from '../src/things.js';
import { floorDepthAt } from '../src/pondFloor.js';
import { holdInPool, poolGround, POOL } from '../src/pool.js';
import { collideThings } from '../src/collide.js';
import { SplashSystem } from '../src/splash.js';

const GRAVITY = 9.81;
const STEP = 1 / 240;
const AIM_MISS = 0.05;                 // m
const REST_SECONDS = 15;
const FLOAT_DEPTH_TOLERANCE = 0.003;   // m
const SINK_TOLERANCE = 0.02;           // of the terminal speed
const STEP_TOLERANCE = 0.1;            // of the highest bob
const STEP_COST_MS = 0.05;
const OVERLAP_MOST = 0.002;            // m
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
  if (name !== 'stone') ({ velocity, landing } = aimThrow(hand, target, flightTime, measured, rock.trialFlight()));
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
      check(record.ripples >= 1, `${label}: came up without a ring`);
      check(Math.abs(under - wanted) < 0.01, `${label}: ${(100 * under).toFixed(1)}% of it under the water, Archimedes ${(100 * wanted).toFixed(1)}%`);
      if (rock.sphere) {
        // A ball's draft against the cap's (a basketball 4.3 cm, a tennis ball 2.8 cm).
        let low = 0, high = 2;
        for (let iteration = 0; iteration < 50; iteration++) { const middle = (low + high) / 2; if (middle * middle * (3 - middle) / 4 < wanted) low = middle; else high = middle; }
        const draft = rock.radius - rock.position.y, expected = rock.radius * (low + high) / 2;
        line += `, ${centimetres(draft)} cm deep (${centimetres(expected)})`;
        check(Math.abs(draft - expected) < FLOAT_DEPTH_TOLERANCE, `${label}: floats ${centimetres(draft)} cm under, Archimedes ${centimetres(expected)} cm`);
      } else {
        // Its mesh, sliced, holds its whole volume (the waterline's table against its shape's moments' integral).
        const table = rock.waterlineTable;
        check(table && Math.abs(table.shares.at(-1) - 1) < 1e-9, `${label}: its waterline's table does not hold its whole volume`);
      }
      if (rock.thing.body.upright) {
        // Toppings up and dry: its own +y up, the cheese (0.03 R over its middle) over the water.
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rock.quaternion).y, cheese = rock.position.y + 0.03 * rock.radius;
        line += `; its top ${up > 0 ? 'up' : 'down'}, the cheese ${centimetres(cheese)} cm over the water`;
        check(up > 0.98 && cheese > 0, `${label}: afloat with its toppings ${up > 0 ? 'up' : 'down'}, the cheese ${centimetres(cheese)} cm over the water`);
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
      // Its own density (a brick's from its mesh's volume), on the drag's nominal ball.
      const terminal = Math.sqrt((8 / 3) * (rock.density / WATER_DENSITY - 1) * GRAVITY * measured.radius / DRAG_COEFFICIENT);
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
        const overlap = one.collisionRadius + other.collisionRadius - one.meshAbove.position.distanceTo(other.meshAbove.position);

        record.overlap = Math.max(record.overlap, overlap);
      }
    }
    for (const thing of things) record.lowest.set(thing, Math.min(record.lowest.get(thing), thing.position.y - thing.floatingHeight?.()));
    if (things.every((thing) => thing.state === 'rest')) break;
  }
  return record;
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
  console.log(`A floater's step costs at most ${(1000 * cost).toFixed(2)} µs`);
  check(cost < STEP_COST_MS, `a floater's step costs ${(1000 * cost).toFixed(2)} µs`);
}

if (failures.length > 0) {
  console.log(`\nthing-probe: ${failures.length} check${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nthing-probe: all checks pass');
