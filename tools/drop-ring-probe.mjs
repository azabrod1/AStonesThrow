// CPU probe of the drop rings (src/dropRings.js): the little rings a
// splash's drops leave where they land.
//
// Throws the reference stone (3 cm radius at 0:-1.4, as the shoot harness's
// --throws=0:-1.4:0.03) into the lake and a 12 cm rock into the pool, each
// seeded as the harness seeds its first throw (--seed=1: Park–Miller from 1),
// and steps the splash as the app's frame loop does (frames of 1/60 s in
// substeps of 1/240 s, src/main.js) with a stand-in pond that carries a
// DropRings with the rain's ring.json, so its table counts as come. For each
// throw and each quality preset's limit (QUALITY's dropRings) it prints
//   - the landing drops big enough to ring (DROP_RING.least): how many, when
//     after the impact (first, median, last), how far from it, their fall
//     speeds and how many of them land on the deck (none ring);
//   - the rings added, the drops merged into a ring (a lump's), the drops
//     turned away, the rings made to fade early
//     to make room, the most drawn at once;
//   - their sizes f, weights (the fall's scale) and lives;
// and checks, failing with exit code 1, that no frame holds more rings than
// the limit, that the reference throw leaves rings, and that every ring
// retires within DROP_RING.longest of its landing.
//
//   node tools/drop-ring-probe.mjs [--list]
//
// --list prints every ring of the High preset's run.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { SplashSystem } from '../src/splash.js';
import { Rock } from '../src/rock.js';
import { DropRings, DROP_RING, MAX_DROP_RINGS } from '../src/dropRings.js';
import { QUALITY } from '../src/main.js';
import { POOL } from '../src/pool.js';

const GRAVITY = 9.81;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const POND_DEPTH = 0.8;
const ring = JSON.parse(readFileSync(new URL('../assets/rain/ring.json', import.meta.url)));
const list = process.argv.includes('--list');

// The app's camera in the home view and its throwing hand (src/main.js), as tools/splash-probe.mjs has them.
const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const hand = new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);

/** Math.random as the shoot harness seeds it for throw i with --seed=n (Park–Miller from n + i). */
function seedRandom(seed) {
  let state = seed;
  Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}

/** Fly a stone from the hand to (x, z) at normal power; returns the impact and the stone. */
function throwStone(radius, x, z, depth) {
  const target = new THREE.Vector3(x, 0, z);
  const flightTime = THREE.MathUtils.clamp(0.42 + 0.11 * hand.distanceTo(target), 0.5, 1.0);
  const velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  const rock = new Rock({ radius, position: hand, velocity, envTexture: null });
  for (let step = 0; step < 4 * 240; step++) {
    const impact = rock.update(FRAME / SUBSTEPS, depth);
    if (impact) return { impact, rock };
  }
  throw new Error('the stone never reached the water');
}

const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };

/** One throw's splash with a limit of `limit` rings, stepped until its last ring has gone. */
function run({ radius, x, z, pool, limit }) {
  seedRandom(1);
  const depth = pool ? POOL.depth : POND_DEPTH;
  const { impact, rock } = throwStone(radius, x, z, depth);
  const dropRings = new DropRings({ ring, liveLimit: limit });
  const square = { minX: -1.5, minZ: -1.5 - 1, size: 3 };   // the pool: the patch's middle quarter (src/spectralWater.js poolSquare, centre (0, −1))
  let deckLandings = 0;
  const water = {
    heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512, cell: 6 / 512, depth,
    addSplat() {}, addFoam() {}, dropRings,
    floorDepthAt: () => depth,
  };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  if (pool) splash.setGround({ square, deck: POOL.deck, onWet: () => {} });
  const landOn = splash.landOn.bind(splash);
  splash.landOn = (height, onWet, landX, landZ, landRadius, ...rest) => { if (landRadius >= DROP_RING.least) deckLandings++; return landOn(height, onWet, landX, landZ, landRadius, ...rest); };
  const candidates = [];
  const rings = [];
  const add = dropRings.add.bind(dropRings);
  dropRings.add = (hit, time) => {
    if (hit.radius >= DROP_RING.least) candidates.push({ time: time - impactTime, distance: Math.hypot(hit.x - impact.x, hit.z - impact.z), fallSpeed: hit.fallSpeed });
    const added = add(hit, time);
    if (added && !rings.includes(added)) { added.landed = time - impactTime; rings.push(added); }
    return added;
  };
  const impactTime = splash.time;
  splash.impact(impact, water);
  let most = 0, overLimit = 0, overLife = 0;
  for (let frame = 0; frame < 8 * 60; frame++) {
    splash.setFrameSeconds(FRAME);
    for (let substep = 0; substep < SUBSTEPS; substep++) {
      rock.update(FRAME / SUBSTEPS, depth);
      splash.update(FRAME / SUBSTEPS, water);
    }
    splash.prepareFrame();
    dropRings.update(splash.time);
    most = Math.max(most, dropRings.live);
    if (dropRings.live > limit) overLimit++;
    for (const live of dropRings.rings) if (splash.time - live.start > DROP_RING.longest + FRAME) overLife++;
  }
  return { candidates, rings, dropRings, most, overLimit, overLife, deckLandings, entry: impact };
}

const quantile = (values, share) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] : NaN; };
const range = (values, digits = 2, scale = 1) => (values.length ? `${(Math.min(...values) * scale).toFixed(digits)} to ${(Math.max(...values) * scale).toFixed(digits)}, median ${(quantile(values, 0.5) * scale).toFixed(digits)}` : '—');

const throwsToRun = [
  { label: 'reference 3 cm stone, lake', radius: 0.03, x: 0, z: -1.4, pool: false },
  { label: '12 cm rock, pool', radius: 0.12, x: 0, z: -1.4, pool: true },
];
let failed = false;
console.log(`drop rings: drops of ${DROP_RING.least * 1000} mm radius or more; f capped at ${DROP_RING.largestSize}; life ${DROP_RING.life} s × f^1.5 up to ${DROP_RING.longest} s; drawn to f × ${DROP_RING.reach * 100} cm; at most ${MAX_DROP_RINGS}`);
for (const thrown of throwsToRun) {
  for (const [preset, settings] of Object.entries(QUALITY)) {
    const result = run({ ...thrown, limit: settings.dropRings });
    const { candidates, rings, dropRings } = result;
    if (preset === 'high') {
      console.log(`\n${thrown.label}: enters at ${result.entry.speed.toFixed(2)} m/s`);
      console.log(`  drops that ring where they land: ${candidates.length} (${result.deckLandings} more on the deck)`);
      console.log(`    landing ${range(candidates.map((hit) => hit.time))} s after the impact`);
      console.log(`    ${range(candidates.map((hit) => hit.distance), 1, 100)} cm from it, falling ${range(candidates.map((hit) => hit.fallSpeed))} m/s`);
      console.log(`  rings: sizes f ${range(rings.map((added) => added.size))}; weights (with the drops merged in) ${range(rings.map((added) => added.weight))}; lives ${range(rings.map((added) => added.life))} s`);
      if (list) for (const added of rings) console.log(`    at ${added.landed.toFixed(3)} s (${(added.x * 100).toFixed(1)}, ${(added.z * 100).toFixed(1)}) cm: f ${added.size.toFixed(2)}, weight ${added.weight.toFixed(2)}, life ${added.life.toFixed(2)} s`);
    }
    console.log(`  ${preset.padEnd(6)} limit ${String(settings.dropRings).padStart(2)}: ${dropRings.added} added, ${dropRings.merged} merged, ${dropRings.refused} turned away, ${dropRings.faded} made to fade early, at most ${result.most} alive`);
    if (result.overLimit > 0) { console.log(`  FAIL: ${result.overLimit} frames hold more than ${settings.dropRings} rings`); failed = true; }
    if (result.overLife > 0) { console.log(`  FAIL: a ring outlived ${DROP_RING.longest} s`); failed = true; }
    if (!thrown.pool && dropRings.added === 0) { console.log('  FAIL: the reference throw left no drop ring'); failed = true; }
  }
}
if (failed) process.exit(1);
console.log('\nPASS: every preset keeps to its limit, the reference throw leaves rings, every ring retires in time');
