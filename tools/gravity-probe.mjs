// CPU probe of a place's own gravity (src/gravity.js: Europa's 1.315 m/s²
// against Earth's 9.81), without a browser.
//
//   node tools/gravity-probe.mjs
//
// Checks, failing with exit code 1 if any fails, that under Europa's gravity
//   - a throw (src/rock.js placeFlightTime, as src/main.js throwVelocity
//     throws it, aimed for the drag by aimThrow as thingVelocity aims it
//     under another gravity) is let go as fast as the same throw on Earth
//     (within 3%: the drag's aim), and the stone src/rock.js flies comes
//     down at the tap (2 cm), when placeFlightTime says (FLIGHT_TOLERANCE),
//     after climbing as high as v²/(2g) says (APEX_TOLERANCE: the air's
//     drag; the air is still Earth's, src/gravity.js), longer and higher
//     than on Earth; a fall from rest takes sqrt(9.81/1.315) = 2.73 times
//     as long;
//   - the cavity (src/cavity.js) of a stone going in at the same Froude
//     number V²/(g·R) (V times sqrt(1.315/9.81)) is the same hole in R,
//     slower: its pinch-off 2.73 times as late and its bowl's time unit
//     2.73 times as long (within SIMILAR_TOLERANCE), as deep in radii
//     (within two of its slices, a third of R: the stone's path is traced
//     in the same substeps, 2.73 times as many of them);
//   - a drop's flight (src/spray.js flightPosition, SPRAY_VERTEX's closed
//     form) still follows its drag's equation, integrated finely (within
//     DROP_TOLERANCE of the landing time), and its slot is not freed before
//     it lands (landingBound, MOST_LIFE scaled); its terminal speed is where the drag meets
//     Europa's g; and a big slow drop, which the drag hardly slows, stays up
//     nearly 7.46 times as long;
//   - the rings' dispersion (src/rings.js ringFrequency, the solver's,
//     src/shaders/spectral.js) is the capillary–gravity one under 1.315: a
//     wave's phase speed sqrt(g/k + σk/ρ)·sqrt(tanh kh), the slowest group
//     speed the deep-water minimum (scaling as g^¼, slowestGroupSpeed), and
//     the GLSL twins (the rings' spectrum, the solver's update, the wind's
//     ripples, the spray's, the cannon's churn) take uGravity, not Earth's
//     9.81 (the gale's and the visitor's keep Earth's, by name);
//   - the jet (src/jet.js) of the medium toss as it goes in on Europa runs
//     within jet-probe's cost (COST_MOST ms a frame, mean, warm), however
//     much longer it lives, and its launch's time unit sqrt(z_p/g) is the
//     cavity's bowl unit;
// that in Europa's vacuum (src/air.js AIR_DENSITY 0) the toss is a parabola
// (v²/2g up, down at the tap), a drop's flight and life its parabola's (on
// the CPU, and SPRAY_VERTEX has the branch), the ice's lead is open and
// stays so, a bowling ball's blow breaks no crust, drops wet nothing, and the lead boils at src/boiling.js's rate,
// inside it, alike run to run, and not at all in air;
// and that after all this, back under Earth's gravity, every number above
// that is Earth's is what it was before Europa's was ever set (nothing
// computed under one gravity is kept for the other: src/spray.js's terminal
// speeds, src/rings.js's envelope tables).
import * as THREE from 'three';
import { GRAVITY, EARTH_GRAVITY, setGravity } from '../src/gravity.js';
import { EARTH_AIR, setAirDensity } from '../src/air.js';
import { IceSheet } from '../src/ice.js';
import { Boiling, BOIL } from '../src/boiling.js';
import { Rock, aimThrow, throwFlightTime, placeFlightTime, flightTime } from '../src/rock.js';
import { THINGS } from '../src/things.js';
import { Cavity, PINCH_TIME } from '../src/cavity.js';
import { JetColumn, CLEAN_FORM, sweepGains } from '../src/jet.js';
import { JET_COLLAPSE } from '../src/splash.js';
import { sprayFlight, flightPosition, landingBound, terminalSpeed, dragDeceleration } from '../src/spray.js';
import { SPRAY_VERTEX } from '../src/shaders/fluid.js';
import { ringFrequency, ringGroupSpeed, slowestGroupSpeed, SLOWEST_GROUP_SPEED } from '../src/rings.js';
import { costClock, costBetween } from './cost-clock.mjs';
import { readFile } from 'node:fs/promises';

const EUROPA = 1.315;
const FLIGHT_TOLERANCE = 0.02;     // of the flight time; and metres from the tap
const APEX_TOLERANCE = 0.05;       // of the apex in a vacuum: the air's drag (Earth's air: the header) takes a little off it
const SIMILAR_TOLERANCE = 0.03;
const DROP_TOLERANCE = 0.08;
const COST_MOST = 3;               // ms a frame (tools/jet-probe.mjs COST_MOST)
const SURFACE_TENSION_OVER_DENSITY = 7.2e-5;
const DEPTH = 0.8;
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };
const near = (value, expected, tolerance) => Math.abs(value / expected - 1) <= tolerance;
const ratio = Math.sqrt(EARTH_GRAVITY / EUROPA);

const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const hand = new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);
const target = new THREE.Vector3(0, 0, -1.4);
let randomState = 12345;
Math.random = () => { randomState = (randomState * 16807) % 2147483647; return (randomState - 1) / 2147483646; };

/** The medium toss to the reference tap as src/main.js throws it, flown by src/rock.js to the water: what it did. */
function toss(multiplier = 1) {
  const earthTime = throwFlightTime(hand, target, 'normal', 0.03) * multiplier;
  const time = placeFlightTime(hand, target, earthTime);
  let velocity = target.clone().sub(hand).divideScalar(time);
  velocity.y += 0.5 * GRAVITY * time;
  const released = velocity.length();
  const rock = new Rock({ radius: 0.03, position: hand, velocity: new THREE.Vector3(), envTexture: null });
  // Under another gravity src/main.js thingVelocity aims a stone for the air's drag, as anything else (src/rock.js aimThrow).
  if (GRAVITY !== EARTH_GRAVITY) ({ velocity } = aimThrow(hand, target, time, { thing: THINGS.stone, radius: 0.03, mass: rock.mass }));
  rock.velocity.copy(velocity);
  let apex = hand.y, flown = 0;
  const step = 1 / 240;
  for (let index = 0; index < 60 * 240; index++) {
    const impact = rock.update(step, 0.8);
    flown += step;
    apex = Math.max(apex, rock.position.y);
    if (impact) return { time, released, flown, apex, landing: rock.position.clone(), entry: rock.velocity.clone(), earthTime, launch: velocity.clone() };
  }
  throw new Error('the stone never came down');
}

/** A vertical entry's cavity at `speed`: its pinch and bowl. */
function cavityAt(speed, radius = 0.03) {
  const cavity = new Cavity({ impact: { x: 0, z: -1.4, height: radius, speed, velocity: { x: 0, y: -speed, z: 0 }, radius }, startTime: 0, drawn: false });
  return { pinch: cavity.pinchTime, depth: cavity.pinchDepth / radius, bowlUnit: cavity.bowlUnit, cavity };
}

/** A drop's landing from the still water's level up, integrated finely against its drag (src/spray.js dragDeceleration). */
function integratedLanding(radius, vx, vy) {
  let x = 0, y = 0, time = 0;
  const step = Math.min(terminalSpeed(radius) / GRAVITY / 40, 1e-4);
  while (y >= 0 || vy > 0) {
    const speed = Math.hypot(vx, vy), drag = dragDeceleration(radius, speed);
    vx -= (drag * vx / speed) * step;
    vy -= (GRAVITY + drag * vy / speed) * step;
    x += vx * step; y += vy * step; time += step;
    if (time > 60) break;
  }
  return time;
}
function dropNumbers() {
  const out = {};
  for (const [radius, vx, vy] of [[0.0002, 0.3, 1.5], [0.0005, 0.5, 2], [0.0012, 0, 0.3]]) {
    const flight = sprayFlight(radius, Math.hypot(vx, vy));
    const at = { x: 0, y: 0, z: 0 };
    let landed = 0;
    for (let age = 1e-4; age < 60; age += 1e-4) {
      flightPosition(0, 0, 0, vx, vy, 0, flight.fastTau, flight.fastTime, flight.slowTau, 0, 0, age, at);
      if (at.y < 0) { landed = age; break; }
    }
    out[radius] = { landed, bound: landingBound(0, vy, flight), integrated: integratedLanding(radius, vx, vy), terminal: terminalSpeed(radius) };
  }
  return out;
}

/** The jet of a vertical entry at `entry` m/s (as the splash starts it: src/splash.js JET_COLLAPSE), stepped as the app does; its cost and life. */
function jetOf(entry, timed) {
  const { cavity } = cavityAt(entry);
  const speed = JET_COLLAPSE * Math.sqrt(GRAVITY * cavity.pinchDepth);
  let state = 12345;
  const random = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  const jet = new JetColumn({ x: 0, z: -1.4, radius: 0.03, speed, startTime: 0, material: null, floor: (age, out) => cavity.bowlFloorAt(cavity.pinchTime + age, out), bowlUnit: cavity.bowlUnit, volume: 0.25 * cavity.bowlVolume, form: CLEAN_FORM, random });
  const splash = { time: 0, frameSeconds: 1 / 60, spray: null, spawnDroplet() {}, spawnFoamSpecks() {} };
  const water = { addSplat() {}, addFoam() {} };
  const costs = [];
  let time = 0, frames = 0;
  while (!jet.finished && time < 30) {
    const started = costClock();
    for (let substep = 0; substep < 4; substep++) { time += 1 / 240; splash.time = time; jet.update(time, 1 / 240, splash, water); }
    if (!jet.finished) jet.updateGeometry(time);
    if (timed) costs.push(costBetween(started, costClock()));
    frames++;
  }
  const mean = costs.reduce((sum, cost) => sum + cost, 0) / Math.max(costs.length, 1);
  return { jet, cavity, speed, life: time, frames, mean, worst: Math.max(0, ...costs) };
}

function earthNumbers() {
  const thrown = toss();
  const hole = cavityAt(6.3);
  return { thrown: [thrown.time, thrown.flown, thrown.apex, thrown.landing.x, thrown.landing.z], hole: [hole.pinch, hole.depth, hole.bowlUnit], drops: dropNumbers(), rings: [ringFrequency(10, DEPTH), ringGroupSpeed(60, DEPTH), slowestGroupSpeed()], gains: sweepGains(0.15) };
}

// ---- Earth, before -------------------------------------------------------------
setGravity(EARTH_GRAVITY);
const before = earthNumbers();
const earthHole = cavityAt(6.3);
const earthDrops = before.drops;

// ---- Europa --------------------------------------------------------------------
setGravity(EUROPA);
const fall = flightTime(1, 0);
console.log(`Europa, g = ${EUROPA} m/s² (Earth's / ${(EARTH_GRAVITY / EUROPA).toFixed(2)}): a fall of 1 m from rest ${(fall * 1000).toFixed(0)} ms, ${(fall / Math.sqrt(2 / EARTH_GRAVITY)).toFixed(3)} times Earth's (theory ${ratio.toFixed(3)})`);
check(near(fall / Math.sqrt(2 / EARTH_GRAVITY), ratio, 1e-9), 'a fall from rest is not sqrt(9.81/1.315) times as long');

for (const [name, multiplier] of [['medium toss', 1], ['soft toss', 1.18], ['medium lob', 1.5]]) {
  setGravity(EARTH_GRAVITY);
  const onEarth = toss(multiplier);
  setGravity(EUROPA);
  const thrown = toss(multiplier);
  const upward = thrown.launch.y;   // as let go (aimed for the drag: a little faster than placeFlightTime's)
  const apexTheory = hand.y + upward * upward / (2 * EUROPA);
  const miss = Math.hypot(thrown.landing.x - target.x, thrown.landing.z - target.z);
  const angle = THREE.MathUtils.radToDeg(Math.acos(-thrown.entry.y / thrown.entry.length()));
  console.log(`  ${name}: let go at ${thrown.launch.length().toFixed(2)} m/s (placeFlightTime's ${thrown.released.toFixed(2)}, aimed for the drag; Earth's ${onEarth.released.toFixed(2)}), flies ${thrown.flown.toFixed(2)} s (placeFlightTime ${thrown.time.toFixed(2)}; Earth ${onEarth.flown.toFixed(2)}), up to ${thrown.apex.toFixed(2)} m (v²/2g ${apexTheory.toFixed(2)}), in ${(miss * 100).toFixed(1)} cm from the tap at ${thrown.entry.length().toFixed(2)} m/s, ${angle.toFixed(1)}° from vertical, F = ${(thrown.entry.lengthSq() / (EUROPA * 0.03)).toFixed(0)}`);
  check(near(thrown.released, onEarth.released, 1e-9) && near(thrown.launch.length(), onEarth.released, 0.03), `${name}: let go at ${thrown.launch.length()} m/s, not Earth's ${onEarth.released}`);
  check(near(thrown.flown, thrown.time, FLIGHT_TOLERANCE), `${name}: flies ${thrown.flown} s, not ${thrown.time}`);
  check(near(thrown.apex, apexTheory, APEX_TOLERANCE), `${name}: climbs to ${thrown.apex} m, not ${apexTheory}`);
  check(miss <= FLIGHT_TOLERANCE * 2, `${name}: comes down ${miss} m from the tap`);
  check(thrown.flown > onEarth.flown && thrown.apex > onEarth.apex, `${name}: no longer or higher than on Earth`);
}

// The cavity at the same Froude number: the same hole, slower.
{
  const speed = 6.3 * Math.sqrt(EUROPA / EARTH_GRAVITY);
  const hole = cavityAt(speed);
  console.log(`  cavity of a 6 cm stone straight in at ${speed.toFixed(2)} m/s (Earth's 6.3 at its Froude number, ${(6.3 ** 2 / (EARTH_GRAVITY * 0.03)).toFixed(0)}): pinches ${(hole.pinch * 1000).toFixed(0)} ms after entry (Earth's ${(earthHole.pinch * 1000).toFixed(0)}: ×${(hole.pinch / earthHole.pinch).toFixed(3)}, theory ×${ratio.toFixed(3)}; ${(hole.pinch / Math.sqrt(0.03 / EUROPA)).toFixed(2)} sqrt(R/g), PINCH_TIME ${PINCH_TIME}), ${hole.depth.toFixed(2)} R down (Earth's ${earthHole.depth.toFixed(2)}), the bowl's unit ×${(hole.bowlUnit / earthHole.bowlUnit).toFixed(3)}`);
  check(near(hole.pinch / earthHole.pinch, ratio, SIMILAR_TOLERANCE), `the cavity pinches ×${hole.pinch / earthHole.pinch} as late, not ×${ratio}`);
  check(Math.abs(hole.depth - earthHole.depth) <= 2 / 6 + 1e-9, `the cavity pinches ${hole.depth} R down, not Earth's ${earthHole.depth} (within two slices, a third of R)`);
  check(near(hole.bowlUnit / earthHole.bowlUnit, ratio, SIMILAR_TOLERANCE), `the bowl's unit ×${hole.bowlUnit / earthHole.bowlUnit}, not ×${ratio}`);
  const same = cavityAt(6.3);
  console.log(`  the same stone at 6.3 m/s (F = ${(6.3 ** 2 / (EUROPA * 0.03)).toFixed(0)}): pinches ${(same.pinch * 1000).toFixed(0)} ms after entry, ${same.depth.toFixed(2)} R down (past the sweep's Froude numbers, 11 to 135: src/cavity.js holds its head there)`);
}

// Drops.
{
  const drops = dropNumbers();
  for (const [radius, numbers] of Object.entries(drops)) {
    const earth = earthDrops[radius];
    console.log(`  a ${(radius * 2000).toFixed(1)} mm drop: terminal ${numbers.terminal.toFixed(2)} m/s (Earth's ${earth.terminal.toFixed(2)}), lands ${numbers.landed.toFixed(3)} s after launch (its drag's equation ${numbers.integrated.toFixed(3)}; Earth's ${earth.landed.toFixed(3)}: ×${(numbers.landed / earth.landed).toFixed(2)}; the slot's bound ${numbers.bound.toFixed(3)})`);
    check(near(dragDeceleration(Number(radius), numbers.terminal), EUROPA, 1e-3), `a ${radius} m drop's terminal speed is not where its drag meets Europa's g`);
    check(near(numbers.landed, numbers.integrated, DROP_TOLERANCE), `a ${radius} m drop lands at ${numbers.landed} s, its drag's equation says ${numbers.integrated}`);
    check(numbers.bound >= numbers.landed - 1e-3, `a ${radius} m drop's slot is freed at ${numbers.bound} s, before it lands at ${numbers.landed}`);
  }
  const big = drops[0.0012].landed / earthDrops[0.0012].landed;
  console.log(`  the big slow drop stays up ×${big.toFixed(2)} as long (a vacuum's ×${(EARTH_GRAVITY / EUROPA).toFixed(2)})`);
  check(near(big, EARTH_GRAVITY / EUROPA, 0.05), `the big slow drop stays up ×${big}, not about ×${EARTH_GRAVITY / EUROPA}`);
}

// Rings.
{
  for (const wavenumber of [10, 100, 300]) {
    const speed = ringFrequency(wavenumber, DEPTH) / wavenumber;
    const theory = Math.sqrt((EUROPA / wavenumber + SURFACE_TENSION_OVER_DENSITY * wavenumber) * Math.tanh(wavenumber * DEPTH));
    setGravity(EARTH_GRAVITY);
    const earth = ringFrequency(wavenumber, DEPTH) / wavenumber;
    setGravity(EUROPA);
    console.log(`  a ${(2 * Math.PI / wavenumber * 100).toFixed(1)} cm ring wave: ${speed.toFixed(3)} m/s (theory ${theory.toFixed(3)}; Earth's ${earth.toFixed(3)})`);
    check(near(speed, theory, 1e-9), `a ring wave of k = ${wavenumber} runs at ${speed}, not ${theory}`);
  }
  let slowest = Infinity;
  for (let wavenumber = 50; wavenumber < 1000; wavenumber += 0.25) slowest = Math.min(slowest, ringGroupSpeed(wavenumber, DEPTH));
  console.log(`  the slowest group speed ${slowest.toFixed(4)} m/s, slowestGroupSpeed ${slowestGroupSpeed().toFixed(4)} (Earth's ${SLOWEST_GROUP_SPEED})`);
  check(near(slowestGroupSpeed(), slowest, 0.02), `slowestGroupSpeed ${slowestGroupSpeed()} against the dispersion's ${slowest}`);
  // The GLSL twins: the place's uGravity, never Earth's literal.
  const source = async (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const rings = await source('rings.js'), spectral = await source('shaders/spectral.js'), white = await source('shaders/whiteWater.js');
  const spectrumShader = rings.slice(rings.indexOf('uniform float uGravity'), rings.indexOf('`', rings.indexOf('uniform float uGravity')));
  check(!/9\.81/.test(spectrumShader) && /uGravity \* wavenumber/.test(spectrumShader), "the rings' spectrum shader does not take uGravity");
  const glsl = (name) => spectral.slice(spectral.indexOf(`export const ${name}`), spectral.indexOf('`;', spectral.indexOf(`export const ${name}`)));
  for (const name of ['SPECTRAL_UPDATE_FRAGMENT', 'AMBIENT_EVALUATE_FRAGMENT']) check(!/9\.81/.test(glsl(name)) && /uGravity \*/.test(glsl(name)), `${name} does not take uGravity`);
  check(/9\.81/.test(glsl('GALE_EVALUATE_FRAGMENT')), "the gale's dispersion is no longer Earth's (src/galeWaves.js's CPU twin is)");
  check(/#define SPRAY_GRAVITY uGravity/.test(SPRAY_VERTEX), "the spray's shader does not take uGravity");
  check(/#define WHITE_GRAVITY uGravity/.test(white), "the cannon's churn does not take uGravity");
}

// The jet of the medium toss as it goes in on Europa.
{
  const thrown = toss();
  for (let warm = 0; warm < 2; warm++) jetOf(thrown.entry.length(), false);
  const run = jetOf(thrown.entry.length(), true);
  setGravity(EARTH_GRAVITY);
  for (let warm = 0; warm < 2; warm++) jetOf(6.42, false);
  const earth = jetOf(6.42, true);
  setGravity(EUROPA);
  console.log(`  the jet of the medium toss (in at ${thrown.entry.length().toFixed(2)} m/s): pinch ${(run.cavity.pinchTime * 1000).toFixed(0)} ms, ${(run.cavity.pinchDepth * 100).toFixed(1)} cm down, body ${run.speed.toFixed(2)} m/s, launch over ${(run.jet.launchEnd * 1000).toFixed(0)} ms, its water up to ${(run.jet.highest * 100).toFixed(0)} cm, gone ${run.life.toFixed(2)} s after its pinch (${run.frames} frames; Earth's ${earth.life.toFixed(2)} s, ${(earth.jet.highest * 100).toFixed(0)} cm); ${run.mean.toFixed(2)} ms a frame, the worst ${run.worst.toFixed(1)} (Earth's ${earth.mean.toFixed(2)}, ${earth.worst.toFixed(1)}); gains ${JSON.stringify(sweepGains(0.15))} for a 30 cm rock`);
  check(near(run.jet.launchEnd / run.cavity.bowlUnit, earth.jet.launchEnd / earth.cavity.bowlUnit, 1e-9), "the jet's launch is not in the bowl's unit");
  check(run.mean <= COST_MOST, `the Europa jet costs ${run.mean.toFixed(2)} ms a frame, over ${COST_MOST}`);
}

// ---- Europa's vacuum (src/air.js) ------------------------------------------------
{
  setAirDensity(0);
  // A toss with no air: a parabola, aimed for none, climbing exactly v²/(2g) and down at the tap.
  const thrown = toss();
  const rise = thrown.launch.y ** 2 / (2 * GRAVITY);
  console.log(`vacuum: the toss climbs ${(thrown.apex - hand.y).toFixed(3)} m (v²/2g ${rise.toFixed(3)}), down ${thrown.landing.distanceTo(new THREE.Vector3(target.x, thrown.landing.y, target.z)).toFixed(3)} m from the tap`);
  check(Math.abs(thrown.apex - hand.y - rise) < 0.02 * rise, `with no air the toss climbs ${(thrown.apex - hand.y).toFixed(3)} m, not v²/2g ${rise.toFixed(3)}`);
  check(Math.hypot(thrown.landing.x - target.x, thrown.landing.z - target.z) < 0.02, 'with no air the toss does not come down at the tap');
  // The spray: its phases all 0, its flight the parabola, its life the parabola's landing.
  const flight = sprayFlight(0.0002, 3);
  check(flight.fastTau === 0 && flight.fastTime === 0 && flight.slowTau === 0, 'with no air a drop still has drag phases');
  const at = flightPosition(0, 0.05, 0, 1.2, 2.5, -0.4, flight.fastTau, flight.fastTime, flight.slowTau, 0, 0, 1.7, {});
  check(Math.abs(at.x - 1.2 * 1.7) < 1e-12 && Math.abs(at.y - (0.05 + 2.5 * 1.7 - 0.5 * GRAVITY * 1.7 ** 2)) < 1e-12 && Math.abs(at.z + 0.4 * 1.7) < 1e-12, 'with no air a drop does not fly a parabola');
  const life = landingBound(0.05, 2.5, flight);
  check(Math.abs(0.05 + 2.5 * life - 0.5 * GRAVITY * life * life) < 1e-9, `with no air a drop's life ${life} is not its parabola's landing`);
  check(/aSlow\.x <= 0\.0/.test(SPRAY_VERTEX), "the spray's shader has no parabola for no air");
  // The ice in vacuum: its lead open from the start and never skinned over, a stone's hole skinned over in seconds,
  // drops wetting nothing; and the boiling, seeded by the step's time.
  const ice = new IceSheet({ domainMin: [-3, -4], domainSize: 6 });   // the solver's patch (src/spectralWater.js)
  ice.setThickness(0.01);
  const lead = { x: 0.1, z: -1.25, length: 3.6, width: 1.0, angle: 12, seed: 7 };
  ice.setVacuum(lead);
  check(ice.holes.length === 1 && ice.holes[0].lead && ice.holeAt(0, -1.3) === ice.holes[0], 'in vacuum the ice has no open lead');
  check(ice.strike({ position: new THREE.Vector3(1, 0, -2.5), velocity: new THREE.Vector3(0, -20, 0), mass: 7, radius: 0.11, collisionRadius: 0.11 }) === null && ice.holes.length === 1, 'a blow breaks a moon\'s crust');
  ice.wetSpot(1, -2.5, 0.05);
  check(!ice.wetBox, 'in vacuum a drop wets the ice');
  for (let time = 0; time <= 120; time += 0.25) ice.setTime(time);
  check(!ice.holes[0].skin && ice.holeAt(0, -1.3), 'the lead skinned over');
  const steps = (seed) => {
    const splats = [], foam = [];
    const water = { domainMin: [-3, -4], domainSize: 6, addSplat: (splat) => splats.push(splat), addFoam: (stamp) => foam.push(stamp) };
    const boiling = new Boiling();
    for (let step = 0; step < 10 * 120; step++) boiling.step(seed + step / 120, 1 / 120, { water, ice });
    return { bursts: boiling.bursts, splats, foam };
  };
  const area = (() => { const corners = ice.holes[0].corners; let sum = 0; for (let index = 0, count = corners.length / 2, previous = count - 1; index < count; previous = index++) sum += corners[2 * previous] * corners[2 * index + 1] - corners[2 * index] * corners[2 * previous + 1]; return Math.abs(sum) / 2; })();
  const boiled = steps(0);
  const expected = BOIL.rate * area * 10;
  console.log(`vacuum: the lead ${area.toFixed(2)} m² boils ${boiled.bursts} bursts in 10 s (${expected.toFixed(0)} expected), each inside it: ${boiled.splats.every((splat) => ice.holeAt(splat.x, splat.z))}`);
  check(Math.abs(boiled.bursts / expected - 1) < 0.1, `the lead boils ${boiled.bursts} bursts in 10 s, not about ${expected.toFixed(0)}`);
  check(boiled.splats.every((splat) => ice.holeAt(splat.x, splat.z) === ice.holes[0]), 'a burst outside the lead\'s open water');
  check(JSON.stringify(steps(0).splats) === JSON.stringify(boiled.splats), 'the boiling is not the same run to run');
  setAirDensity(EARTH_AIR);
  check(steps(0).bursts === 0, 'water boils in air');
  ice.setVacuum(null);
  check(ice.holes.length === 0, 'out of vacuum the lead stays');
}

// ---- Earth, after ----------------------------------------------------------------
setGravity(EARTH_GRAVITY);
randomState = 12345;
const after = earthNumbers();
const same = JSON.stringify(after) === JSON.stringify(before);
console.log(`Earth again: ${same ? 'every number as before' : 'numbers changed'} (the toss ${after.thrown[1].toFixed(3)} s, the pinch ${(after.hole[0] * 1000).toFixed(1)} ms, ${after.hole[1].toFixed(3)} R)`);
check(same, `back under Earth's gravity the numbers changed: ${JSON.stringify(before)} then ${JSON.stringify(after)}`);

if (failures.length) {
  console.error(`\ngravity-probe: ${failures.length} failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\ngravity-probe: all checks passed');
