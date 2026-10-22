// CPU probe of skipping stones (src/rock.js skim, src/splash.js skim), without
// a browser.
//
// Throws skips as the app does with Skip on (src/main.js skipThrow, through
// the same code: the hand beside and below the shore view's eye let down to
// SKIP_THROW.handHeight, skipSpeed and aimSkip from src/rock.js, on open
// water by the lake's bed or inside the pool, src/pool.js; the stone's own
// random flat shape, tilt and spin), steps the stone and a splash system
// against a stand-in pond (in the pool, its walls and deck as the app has
// them: holdInPool, poolGround, poolInside) as the app's frame loop does
// (frames of 1/60 s in substeps of 1/240 s) until the stone rests, and for
// each set of throws (the 6 cm stone thrown softly, normally and hard, a 3, a
// 16 and a 30 cm stone thrown normally, then in the pool the 6 cm stone at
// each strength and a 30 cm rock) prints
//   - the skips per throw (10th percentile / median / 90th), the share that
//     make none, and the farthest any made;
//   - the first touch: the angle it came in at from level and left at, how
//     long the contact lasted, the speed along the water in and out, and the
//     first hop's length and height (the stone's centre over the water);
//   - where the stone went in: how far out, how fast and at what angle;
//   - a touch's spray (drops) and the ring pushes it sent;
//   - the CPU cost of working out a contact (skim) and of a frame;
// and checks, failing with exit code 1 if any check fails:
//   - the 6 cm stone thrown normally skips a median of MEDIAN_SKIPS[0] to
//     MEDIAN_SKIPS[1] times and at most NO_SKIP_SHARE of its throws make
//     none (a Skip throw should mostly skip);
//   - softer throws skip less: the medians run soft ≤ normal ≤ hard, and
//     soft's is below hard's;
//   - a skip is no livelier than a mirror's bounce: no skip leaves the
//     water rising faster than it came down; and the 6 cm stone's first hop
//     when thrown normally rises at most HIGHEST_HOP (a median of at most
//     MEDIAN_HOP);
//   - every hop is an arc, not a glide: it rises at least HOP_SHAPE of its
//     length;
//   - a 30 cm rock never skips (it is thrown too slowly to skim);
//   - in the lake a skip stays in the vertical plane it was thrown in: its
//     heading at every touch and where it goes in is the throw's, within
//     HEADING_TOLERANCE degrees, and where it comes to rest on the bed lies
//     within PLANE_TOLERANCE of that plane (in the pool its walls turn it);
//   - every touch that skips sends out a ring and throws some spray, within
//     the splash's caps, and every stone comes to rest (on the bed, or on
//     the pool's deck);
//   - the aim shows where the stone first comes down: its first touch of the
//     water lies within AIM_TOLERANCE of aimSkip's touch;
//   - in the pool no stone is ever below the deck outside the walls (on its
//     first flight too: a 30 cm rock thrown slowly comes down on the deck),
//     and the 6 cm stone thrown softly or normally stays in the pool;
//   - the steps converge: with SKIM.step halved, the 6 cm stone's first hop
//     changes by under STEP_TOLERANCE of its length, and with the frame's
//     substeps halved by under SUBSTEP_TOLERANCE (a contact's end carries
//     the rest of its substep on into the air);
//   - a contact costs under CONTACT_BUDGET milliseconds on average.
// Throw i of a set is seeded as the shoot harness seeds a page (Park–Miller
// from seed + i, just before the throw), so a run repeats exactly.
//
//   node tools/skip-probe.mjs [throws=60] [--seed=1] [--aim=x:z] [--list]
//
// --list prints every throw of the first set on a line of its own: its
// skips, each hop's length and where it went in.
import * as THREE from 'three';
import { SplashSystem } from '../src/splash.js';
import { Rock, aimSkip, skipSpeed, SKIM, SKIP_THROW } from '../src/rock.js';
import { holdInPool, poolGround, poolInside, POOL } from '../src/pool.js';
import { floorDepthAt } from '../src/pondFloor.js';

const option = (name, fallback) => { const hit = process.argv.find((argument) => argument.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const throwCount = Number(process.argv.slice(2).find((argument) => !argument.startsWith('--')) ?? 60);
const firstSeed = Number(option('seed', '1'));
const [aimX, aimZ] = option('aim', '0:-1.4').split(':').map(Number);
const listing = process.argv.includes('--list');

const GRAVITY = 9.81;
const FRAME = 1 / 60;
let substeps = 4;
const PATCH = { minX: -3, minZ: -4, size: 6 };           // the solver's patch (src/main.js water.domainMin, domainSize)...
const POOL_SQUARE = { minX: -1.5, minZ: -2.5, size: 3 };  // ...and its middle quarter, the pool (water.poolSquare)
const MARGINS = { pond: 0.4, pool: 0.25, radii: 4 };     // src/main.js POND_MARGIN, POOL_MARGIN, MARGIN_RADII
const AIM_TOLERANCE = 0.12;    // m
const SUBSTEP_TOLERANCE = 0.03;
const MEDIAN_SKIPS = [3, 8];
const HEADING_TOLERANCE = 0.01; // degrees
const PLANE_TOLERANCE = 0.005;  // m
const HIGHEST_HOP = 0.3;       // m
const MEDIAN_HOP = 0.25;       // m
const HOP_SHAPE = 1 / 40;
const NO_SKIP_SHARE = 0.1;
const STEP_TOLERANCE = 0.02;
const CONTACT_BUDGET = 1;      // ms
const LONGEST_THROW = 30;      // s: a stone not at rest by then fails

const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const originalRandom = Math.random;

/** Math.random as the shoot harness seeds it (Park–Miller). */
function seedRandom(seed) {
  let state = seed;
  Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}

/** The lake bed's depth under the stand-in pond: deep enough that the stone sinks a while, as out in the lake. */
const bedDepth = () => 2;

function standIns() {
  const rings = [];
  const water = {
    heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512, cell: 6 / 512, depth: 0.8,
    addSplat() {}, addFoam() {}, holds: () => true,
    rings: { add(source, time) { rings.push({ ...source, time }); }, uniforms: () => ({}) },
  };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  return { water, splash, rings };
}

/** The hand of a skip throw (src/main.js handPosition, then skipThrow). */
function skipHand(radius) {
  const beyond = Math.max(radius - 0.08, 0);
  const hand = new THREE.Vector3(0.30, -0.32 - 1.6 * beyond, -0.55 - 1.2 * beyond).applyMatrix4(camera.matrixWorld);
  hand.y = Math.min(hand.y, SKIP_THROW.handHeight);
  return hand;
}

/** `point` brought inside `square` less `margin` (src/main.js keepOnWater). */
const keepInside = (point, square, margin) => new THREE.Vector3(
  THREE.MathUtils.clamp(point.x, square.minX + margin, square.minX + square.size - margin), 0,
  THREE.MathUtils.clamp(point.z, square.minZ + margin, square.minZ + square.size - margin));

/** One seeded skip throw, in the lake or the pool, flown, skipped and sunk (or tumbled on the deck) to rest, with what it did. */
function runThrow(radius, power, seed, pooled = false) {
  Math.random = originalRandom;
  const { water, splash, rings } = standIns();
  seedRandom(seed);
  const hand = skipHand(radius);
  const margin = Math.max(pooled ? MARGINS.pool : MARGINS.pond, MARGINS.radii * radius);
  const onWater = pooled ? poolInside(POOL_SQUARE, margin) : (x, z) => floorDepthAt(x, z) >= SKIP_THROW.shallowest;
  const target = new THREE.Vector3(aimX, 0, aimZ);
  const aimed = aimSkip(hand, target, skipSpeed(power, radius, pooled), onWater, keepInside(target, pooled ? POOL_SQUARE : PATCH, margin));
  const velocity = aimed.velocity;
  const rock = new Rock({ radius, position: hand, velocity, envTexture: null, skip: true });
  rock.launchSkip(velocity);
  if (pooled) {
    rock.skip.inside = poolInside(POOL_SQUARE, radius);
    rock.ground = poolGround(POOL_SQUARE);
  }
  const insidePool = poolInside(POOL_SQUARE, 0);
  let underDeck = false, firstWater = null;
  const tilt = THREE.MathUtils.radToDeg(Math.acos(rock.skip.normal.y));
  const heading = (vector) => Math.atan2(vector.z, vector.x);
  const thrown = heading(velocity);
  let turned = 0;
  const turnOf = (vector) => { turned = Math.max(turned, Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(heading(vector) - thrown), Math.cos(heading(vector) - thrown))))); };
  const result = { seed, tilt, touches: [], hops: [], heights: [], entry: null, contactMs: [], frameMs: [], rested: false, failures: [] };
  let lastExit = null, highest = 0;
  for (let frame = 0; frame < LONGEST_THROW * 60; frame++) {
    const started = performance.now();
    splash.setFrameSeconds(FRAME);
    for (let substep = 0; substep < substeps; substep++) {
      const before = performance.now();
      const event = rock.update(FRAME / substeps, pooled ? POOL.depth : bedDepth);
      if (pooled) {
        holdInPool(rock, POOL_SQUARE);
        if (!insidePool(rock.position.x, rock.position.z) && rock.position.y - rock.ellipsoidDepth() < POOL.deck - 0.01) underDeck = true;
      }
      if (event && !firstWater) firstWater = { x: event.x, z: event.z };
      const spent = performance.now() - before;
      if (lastExit && rock.state === 'air') highest = Math.max(highest, rock.position.y);
      if (event) turnOf(event.velocity);
      if (event?.skim) {
        turnOf(event.exitVelocity);
        result.contactMs.push(spent);
        if (lastExit) { result.hops.push(Math.hypot(event.x - lastExit.x, event.z - lastExit.z)); result.heights.push(highest); }
        lastExit = { x: event.exitX, z: event.exitZ };
        highest = 0;
        const ringsBefore = rings.length, dropsBefore = splash.count;
        splash.skim(event, water);
        const along = Math.hypot(event.velocity.x, event.velocity.z);
        result.touches.push({
          angle: THREE.MathUtils.radToDeg(Math.atan2(-event.velocity.y, along)), duration: event.duration,
          exitAngle: THREE.MathUtils.radToDeg(Math.atan2(event.exitVelocity.y, Math.hypot(event.exitVelocity.x, event.exitVelocity.z))),
          fallIn: -event.velocity.y, riseOut: event.exitVelocity.y,
          speedIn: along, speedOut: Math.hypot(event.exitVelocity.x, event.exitVelocity.z),
          rings: rings.length - ringsBefore, drops: splash.count - dropsBefore,
        });
      } else if (event) {
        result.contactMs.push(spent);
        const along = Math.hypot(event.velocity.x, event.velocity.z);
        result.entry = { distance: Math.hypot(event.x - hand.x, event.z - hand.z), speed: event.speed, angle: THREE.MathUtils.radToDeg(Math.atan2(-event.velocity.y, along)) };
        splash.impact(event, water);
      }
      splash.update(FRAME / substeps, water);
    }
    splash.prepareFrame();
    result.frameMs.push(performance.now() - started);
    for (let index = 0; index < splash.count * 3; index++) if (!Number.isFinite(splash.positions[index])) { result.failures.push('a drop went to NaN'); break; }
    if (rock.state === 'rest' && !splash.inMotion) { result.rested = true; break; }
  }
  if (!result.rested && rock.state === 'rest') result.rested = true;
  // How far from the throw's vertical plane it came to rest.
  const level = Math.hypot(velocity.x, velocity.z);
  result.offPlane = Math.abs((rock.position.x - hand.x) * (-velocity.z / level) + (rock.position.z - hand.z) * (velocity.x / level));
  result.skips = result.touches.length;
  result.turned = turned;
  result.underDeck = underDeck;
  result.inPool = insidePool(rock.position.x, rock.position.z);
  result.aimMiss = firstWater ? Math.hypot(firstWater.x - aimed.touch.x, firstWater.z - aimed.touch.z) : null;
  Math.random = originalRandom;
  return result;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const quantile = (values, share) => { const sorted = [...values].sort((first, second) => first - second); return sorted[Math.min(Math.floor(share * sorted.length), sorted.length - 1)] ?? NaN; };
const spread = (values, digits = 1) => `${quantile(values, 0.1).toFixed(digits)} / ${quantile(values, 0.5).toFixed(digits)} / ${quantile(values, 0.9).toFixed(digits)}`;

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };

// Warm up (the code, not the statistics: each throw is seeded on its own).
for (let warmUp = 0; warmUp < 3; warmUp++) runThrow(0.03, 'normal', 1000000 + warmUp);

const sets = [
  { label: '6 cm stone, normal', radius: 0.03, power: 'normal' },
  { label: '6 cm stone, soft', radius: 0.03, power: 'soft' },
  { label: '6 cm stone, hard', radius: 0.03, power: 'hard' },
  { label: '3 cm pebble, normal', radius: 0.015, power: 'normal' },
  { label: '16 cm stone, normal', radius: 0.08, power: 'normal' },
  { label: '30 cm rock, normal', radius: 0.15, power: 'normal' },
  { label: 'pool: 6 cm stone, soft', radius: 0.03, power: 'soft', pooled: true },
  { label: 'pool: 6 cm stone, normal', radius: 0.03, power: 'normal', pooled: true },
  { label: 'pool: 6 cm stone, hard', radius: 0.03, power: 'hard', pooled: true },
  { label: 'pool: 30 cm rock, normal', radius: 0.15, power: 'normal', pooled: true },
];
const medians = {};
for (const [setIndex, set] of sets.entries()) {
  const results = [];
  for (let index = 0; index < throwCount; index++) results.push(runThrow(set.radius, set.power, firstSeed + index, set.pooled));
  const skips = results.map((result) => result.skips);
  const firsts = results.filter((result) => result.touches.length > 0).map((result) => result.touches[0]);
  const firstHops = results.filter((result) => result.hops.length > 0).map((result) => result.hops[0]);
  const firstHeights = results.filter((result) => result.heights.length > 0).map((result) => result.heights[0]);
  const entries = results.map((result) => result.entry).filter(Boolean);
  const touches = results.flatMap((result) => result.touches);
  medians[set.label] = quantile(skips, 0.5);
  console.log(`${set.label} (${throwCount} throws, aim ${aimX}:${aimZ})`);
  console.log(`  skips ${spread(skips, 0)}, none ${(100 * skips.filter((count) => count === 0).length / throwCount).toFixed(0)}%, most ${Math.max(...skips)}; the face's tilt ${spread(results.map((result) => result.tilt))}°`);
  if (firsts.length > 0) {
    console.log(`  first touch: in at ${spread(firsts.map((touch) => touch.angle))}° from level, out at ${spread(firsts.map((touch) => touch.exitAngle))}°, ${spread(firsts.map((touch) => touch.duration * 1000), 0)} ms, along the water ${spread(firsts.map((touch) => touch.speedIn))} m/s in, ${spread(firsts.map((touch) => touch.speedOut))} out`);
    if (firstHops.length) console.log(`  first hop ${spread(firstHops, 2)} m long, ${spread(firstHeights.map((height) => height * 100), 0)} cm high`);
    console.log(`  a touch: ${spread(touches.map((touch) => touch.drops), 0)} drops, ${spread(touches.map((touch) => touch.rings), 0)} ring pushes`);
  }
  if (entries.length) console.log(`  went in ${spread(entries.map((entry) => entry.distance))} m out, at ${spread(entries.map((entry) => entry.speed))} m/s, ${spread(entries.map((entry) => entry.angle))}° from level`);
  if (set.pooled) console.log(`  in the pool at the end ${results.filter((result) => result.inPool).length} of ${throwCount}, on the deck ${results.filter((result) => !result.inPool).length}`);
  const misses = results.map((result) => result.aimMiss).filter((miss) => miss !== null);
  if (misses.length) console.log(`  the first touch lies ${spread(misses.map((miss) => miss * 100), 1)} cm from where the aim shows it`);
  const contacts = results.flatMap((result) => result.contactMs);
  const frames = results.flatMap((result) => result.frameMs);
  const contactCost = contacts.length ? `a contact ${mean(contacts).toFixed(3)} ms on average (worst ${Math.max(...contacts).toFixed(2)}), ` : '';
  console.log(`  CPU: ${contactCost}a frame ${mean(frames).toFixed(3)} ms (95th percentile ${quantile(frames, 0.95).toFixed(2)}, worst ${Math.max(...frames).toFixed(2)})`);
  if (listing && setIndex === 0) {
    for (const result of results) console.log(`    seed ${result.seed}: ${result.skips} skips, hops ${result.hops.map((hop, index) => `${hop.toFixed(2)} m/${(100 * result.heights[index]).toFixed(0)} cm`).join(' ') || '-'}, in ${result.entry ? result.entry.distance.toFixed(1) : '?'} m out at ${result.entry ? result.entry.speed.toFixed(1) : '?'} m/s`);
  }
  for (const result of results) {
    for (const failure of result.failures) check(false, `${set.label}, seed ${result.seed}: ${failure}`);
    check(result.rested, `${set.label}, seed ${result.seed}: the stone never came to rest`);
    check(result.aimMiss === null || result.aimMiss <= AIM_TOLERANCE, `${set.label}, seed ${result.seed}: the first touch is ${(100 * result.aimMiss).toFixed(1)} cm from where the aim shows it`);
    check(!result.underDeck, `${set.label}, seed ${result.seed}: the stone went below the deck outside the pool`);
    if (set.pooled && set.radius === 0.03 && set.power !== 'hard') check(result.inPool, `${set.label}, seed ${result.seed}: the stone ended on the deck`);
    result.hops.forEach((hop, index) => check(result.heights[index] >= HOP_SHAPE * hop, `${set.label}, seed ${result.seed}: hop ${index + 1} rose ${(100 * result.heights[index]).toFixed(1)} cm over ${hop.toFixed(2)} m, a glide`));
    if (!set.pooled) {
      check(result.offPlane <= PLANE_TOLERANCE, `${set.label}, seed ${result.seed}: the stone came to rest ${(100 * result.offPlane).toFixed(1)} cm off the plane it was thrown in`);
      check(result.turned <= HEADING_TOLERANCE, `${set.label}, seed ${result.seed}: the stone turned ${result.turned.toFixed(3)}° off the plane it was thrown in`);
    }
    for (const touch of result.touches) {
      check(touch.riseOut <= touch.fallIn, `${set.label}, seed ${result.seed}: a skip left rising at ${touch.riseOut.toFixed(2)} m/s, faster than it came down (${touch.fallIn.toFixed(2)})`);
      check(touch.rings > 0, `${set.label}, seed ${result.seed}: a skip sent out no ring`);
      check(touch.drops > 0, `${set.label}, seed ${result.seed}: a skip threw no spray`);
    }
  }
  if (set.label === '6 cm stone, normal') {
    check(medians[set.label] >= MEDIAN_SKIPS[0] && medians[set.label] <= MEDIAN_SKIPS[1], `the 6 cm stone thrown normally skips a median of ${medians[set.label]} times, not ${MEDIAN_SKIPS[0]} to ${MEDIAN_SKIPS[1]}`);
    const none = skips.filter((count) => count === 0).length / throwCount;
    check(none <= NO_SKIP_SHARE, `${(100 * none).toFixed(0)}% of the 6 cm stone's normal throws make no skip (at most ${100 * NO_SKIP_SHARE}%)`);
    check(mean(contacts) < CONTACT_BUDGET, `a contact costs ${mean(contacts).toFixed(3)} ms on average (budget ${CONTACT_BUDGET})`);
    check(Math.max(...firstHeights) <= HIGHEST_HOP && quantile(firstHeights, 0.5) <= MEDIAN_HOP, `the 6 cm stone's first hop rises ${(100 * quantile(firstHeights, 0.5)).toFixed(0)} cm (median), ${(100 * Math.max(...firstHeights)).toFixed(0)} cm at most (at most ${100 * MEDIAN_HOP} and ${100 * HIGHEST_HOP})`);
  }
  if (set.label.endsWith('30 cm rock, normal')) check(Math.max(...skips) === 0, `${set.label}: a 30 cm rock skipped (${Math.max(...skips)} times at most)`);
}
const soft = medians['6 cm stone, soft'], normal = medians['6 cm stone, normal'], hard = medians['6 cm stone, hard'];
check(soft <= normal && normal <= hard && soft < hard, `the medians do not grow with the strength: soft ${soft}, normal ${normal}, hard ${hard}`);

// The contact's step: the first hop of the 6 cm stone's normal throws with SKIM.step halved.
const firstHop = (seed) => runThrow(0.03, 'normal', seed).hops[0];
const keptStep = SKIM.step;
const hops = [];
for (let index = 0; index < 10; index++) hops.push(firstHop(firstSeed + index));
SKIM.step = keptStep / 2;
const finer = [];
for (let index = 0; index < 10; index++) finer.push(firstHop(firstSeed + index));
SKIM.step = keptStep;
const changes = hops.map((hop, index) => (hop !== undefined && finer[index] !== undefined ? Math.abs(finer[index] - hop) / hop : 0));
const worstChange = Math.max(...changes);
console.log(`contact step: with SKIM.step halved the first hop changes by ${(100 * worstChange).toFixed(2)}% at most`);
check(worstChange < STEP_TOLERANCE, `halving SKIM.step changes a first hop by ${(100 * worstChange).toFixed(1)}% (at most ${100 * STEP_TOLERANCE}%)`);
// The frame's substeps: halved, the first hop moves by under SUBSTEP_TOLERANCE.
substeps = 8;
const halved = [];
for (let index = 0; index < 10; index++) halved.push(firstHop(firstSeed + index));
substeps = 4;
const substepChanges = hops.map((hop, index) => (hop !== undefined && halved[index] !== undefined ? Math.abs(halved[index] - hop) / hop : 0));
const worstSubstep = Math.max(...substepChanges);
console.log(`substeps: with them halved the first hop changes by ${(100 * worstSubstep).toFixed(2)}% at most`);
check(worstSubstep < SUBSTEP_TOLERANCE, `halving the substeps changes a first hop by ${(100 * worstSubstep).toFixed(1)}% (at most ${100 * SUBSTEP_TOLERANCE}%)`);

if (failures.length > 0) {
  console.log(`\nskip-probe: ${failures.length} check(s) failed`);
  for (const failure of failures.slice(0, 20)) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nskip-probe: all checks pass');
