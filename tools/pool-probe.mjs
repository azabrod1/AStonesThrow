// CPU probe of the pool's waves (src/spectralWater.js setPool): how long a
// splash's waves run round the basin, and when it is still enough for the
// solver to sleep.
//
// Throws a stone into the pool's middle as the app does from the shore view
// (the hand and the flight of tools/splash-probe.mjs), runs its splash
// (src/splash.js) against a stand-in pool that keeps what the solver would
// take (no splat off the pool; the ring's source too, released in the frame
// the app's solver takes it: releasePoolRing), and evolves every splat with
// the solver's own arithmetic on a 256² grid over its 6 m patch: each with
// its mirror images across the walls (SPECTRAL_UPDATE_FRAGMENT), injected
// at the end of its frame, each mode turned by its ω and damped by its γ,
// from the frame the splash leaves the water still, exactly to each later
// time. Within the pool it prints the largest height, slope and Laplacian
// (the caustics': times the floor's depth and the focusing, about 1.1 m for
// this sun, it is the light's change) at times after the last splat, for
// the open pond's damping (DAMPING) and the pool's (POOL_DAMPING), and any
// others given as POOL_CANDIDATES="base,least;base,least"; and when the
// largest slope falls below 3e-3
// (ripples plain to see) and below SLOPE_VISIBLE (1e-4: the bound the open
// pond's solver sleeps by, src/spectralWater.js).
//
// It checks that with POOL_DAMPING the largest rock's waves (30 cm, thrown
// hard) are under SLOPE_VISIBLE, and its caustics change by under 0.1%,
// POOL_SLEEP_SECONDS after its last splat, so the solver's sleep never
// clears waves that show. Exits with status 1 if not. It leaves out the
// pool's breaking (BREAKING in src/spectralWater.js), which only takes
// energy away, so the check holds with it too.
//
//   node tools/pool-probe.mjs [--radius=0.15] [--power=hard]
import * as THREE from 'three';
import { inverse2d } from './stockham.mjs';
import { SplashSystem } from '../src/splash.js';
import { Rock } from '../src/rock.js';
import { DAMPING, POOL_DAMPING, POOL_SLEEP_SECONDS } from '../src/spectralWater.js';
import { SLOPE_VISIBLE } from '../src/rings.js';

const option = (name, fallback) => { const hit = process.argv.find((argument) => argument.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const GRAVITY = 9.81;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const POND_DEPTH = 0.8;          // the depth the waves take (src/main.js)
const POOL_DEPTH = 1.4;          // the basin's floor (src/pool.js)
const FOCUSING = 0.76;           // the caustics' focusing for the meadow's sun, 27° up (src/pondFloor.js)
const SIZE = 256;
const DOMAIN = { size: 6, minX: -3, minZ: -4, centre: [0, -1] };
const CELL = DOMAIN.size / SIZE;
const POOL = { minX: DOMAIN.centre[0] - DOMAIN.size / 4, minZ: DOMAIN.centre[1] - DOMAIN.size / 4, size: DOMAIN.size / 2 };
const WALLS = { x: (POOL.minX - DOMAIN.minX) / CELL, y: (POOL.minZ - DOMAIN.minZ) / CELL };
let failures = 0;
function check(passed, message) {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${message}`);
  if (!passed) failures++;
}

// The shore view's camera and hand (src/main.js), as tools/splash-probe.mjs has them.
const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();

function throwStone(radius, powerName, aimX, aimZ) {
  const beyond = Math.max(radius - 0.08, 0);
  const hand = new THREE.Vector3(0.30, -0.32 - 1.6 * beyond, -0.55 - 1.2 * beyond).applyMatrix4(camera.matrixWorld);
  const target = new THREE.Vector3(aimX, 0, aimZ);
  const flightTime = THREE.MathUtils.clamp(0.42 + 0.11 * hand.distanceTo(target), 0.5, 1.0) * { soft: 1.3, normal: 1.0, hard: 0.72 }[powerName];
  const velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  const rock = new Rock({ radius, position: hand, velocity, envTexture: null });
  for (let step = 0; step < 4 * 240; step++) {
    const impact = rock.update(FRAME / SUBSTEPS, () => POOL_DEPTH);
    if (impact) return { impact, rock };
  }
  throw new Error('the stone never reached the water');
}

/** Every splat the pool's solver takes from the splash, each with the splash time of the frame end it goes in at. */
function splashSplats(radius, powerName) {
  const { impact, rock } = throwStone(radius, powerName, 0, -1);
  const splats = [];
  let frameEnd = 0;
  const holds = (x, z) => x >= POOL.minX && x <= POOL.minX + POOL.size && z >= POOL.minZ && z <= POOL.minZ + POOL.size;
  const water = {
    heightTexture: null, domainMin: [DOMAIN.minX, DOMAIN.minZ], domainSize: DOMAIN.size, centre: DOMAIN.centre, uvOffset: 0.5 / SIZE, pool: POOL,
    rings: { add: () => true, uniforms: () => ({}) },
    floorDepthAt: () => POOL_DEPTH,
    addSplat: (splat) => { if (!holds(splat.x, splat.z)) return false; splats.push({ time: frameEnd, rim: 1.7, height: 0, velocity: 0, ...splat }); return true; },
    addFoam: () => true,
  };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  splash.impact(impact, water);
  for (let frame = 0; frame < 20 * 60; frame++) {
    splash.setFrameSeconds(FRAME);
    frameEnd = splash.time + FRAME;
    for (let substep = 0; substep < SUBSTEPS; substep++) {
      rock.update(FRAME / SUBSTEPS, () => POOL_DEPTH);
      splash.update(FRAME / SUBSTEPS, water);
    }
    splash.prepareFrame();
    if (!splash.inMotion && splash.time > 1) break;
  }
  return { splats, impact };
}

// The solver's lattice: each mode's wave vector (radians per texel), ω and, per damping, γ.
const signed = (index) => (index < SIZE / 2 ? index : index - SIZE);
const q = Float64Array.from({ length: SIZE }, (unused, index) => 2 * Math.PI * signed(index) / SIZE);
const omega = new Float64Array(SIZE * SIZE), magnitude = new Float64Array(SIZE * SIZE);
for (let row = 0; row < SIZE; row++) {
  for (let column = 0; column < SIZE; column++) {
    const texel = row * SIZE + column;
    magnitude[texel] = Math.hypot(q[column], q[row]);
    const wavenumber = magnitude[texel] / CELL;
    omega[texel] = Math.sqrt((GRAVITY * wavenumber + 7.2e-5 * wavenumber ** 3) * Math.tanh(Math.min(wavenumber * POND_DEPTH, 20)));
  }
}
function dampingOf({ base, least = 0 }) {
  const gamma = new Float64Array(SIZE * SIZE);
  const dampingWavenumber = 2 * Math.PI / DAMPING.baseWavelength, lowWavenumber = 2 * Math.PI / (DOMAIN.size * DAMPING.lowShare);
  for (let texel = 0; texel < SIZE * SIZE; texel++) {
    const wavenumber = magnitude[texel] / CELL;
    gamma[texel] = Math.max(base * Math.min(wavenumber / dampingWavenumber, 1), least) + DAMPING.viscosity * wavenumber ** 2 + (wavenumber < lowWavenumber ? DAMPING.low : 0);
  }
  return gamma;
}

/** The state (H and V, complex, in the forward transform's units) after `seconds` more: each mode turned and damped. */
function advance(state, gamma, seconds) {
  if (seconds <= 0) return;
  for (let texel = 0; texel < SIZE * SIZE; texel++) {
    const angle = omega[texel] * seconds, cosine = Math.cos(angle), sine = Math.sin(angle), decay = Math.exp(-gamma[texel] * seconds);
    const sineOverOmega = omega[texel] > 1e-6 ? sine / omega[texel] : seconds;
    const at = 4 * texel;
    const heightRe = state[at], heightIm = state[at + 1], velocityRe = state[at + 2], velocityIm = state[at + 3];
    state[at] = (heightRe * cosine + velocityRe * sineOverOmega) * decay;
    state[at + 1] = (heightIm * cosine + velocityIm * sineOverOmega) * decay;
    state[at + 2] = (-heightRe * omega[texel] * sine + velocityRe * cosine) * decay;
    state[at + 3] = (-heightIm * omega[texel] * sine + velocityIm * cosine) * decay;
  }
}

/** A splat with its mirror images, as SPECTRAL_UPDATE_FRAGMENT adds it with uWalls set. */
const alongX = new Float64Array(2 * SIZE), alongY = new Float64Array(2 * SIZE);
function inject(state, splat) {
  const tx = (splat.x - DOMAIN.minX) / CELL, tz = (splat.z - DOMAIN.minZ) / CELL;
  const sigma = Math.max(splat.radius / CELL, 0.6), rimSigma = sigma * Math.max(splat.rim, 1);
  for (let index = 0; index < SIZE; index++) {
    const nyquist = index === SIZE / 2;
    const directX = -q[index] * tx, imageX = -q[index] * (2 * WALLS.x - tx);
    alongX[2 * index] = Math.cos(directX) + Math.cos(imageX);
    alongX[2 * index + 1] = nyquist ? 0 : Math.sin(directX) + Math.sin(imageX);
    const directY = -q[index] * tz, imageY = -q[index] * (2 * WALLS.y - tz);
    alongY[2 * index] = Math.cos(directY) + Math.cos(imageY);
    alongY[2 * index + 1] = nyquist ? 0 : Math.sin(directY) + Math.sin(imageY);
  }
  for (let row = 0; row < SIZE; row++) {
    const yRe = alongY[2 * row], yIm = alongY[2 * row + 1];
    for (let column = 0; column < SIZE; column++) {
      const texel = row * SIZE + column;
      if (texel === 0) continue;
      const squared = magnitude[texel] ** 2;
      let shape = Math.exp(-0.5 * sigma * sigma * squared);
      if (splat.rim > 1) shape -= Math.exp(-0.5 * rimSigma * rimSigma * squared);
      const size = 2 * Math.PI * sigma * sigma * shape;
      const xRe = alongX[2 * column], xIm = alongX[2 * column + 1];
      const shiftRe = (xRe * yRe - xIm * yIm) * size, shiftIm = (xRe * yIm + xIm * yRe) * size;
      const at = 4 * texel;
      state[at] += splat.height * shiftRe;
      state[at + 1] += splat.height * shiftIm;
      state[at + 2] += splat.velocity * shiftRe;
      state[at + 3] += splat.velocity * shiftIm;
    }
  }
}

/** Within the pool: the largest height (m), slope and Laplacian (1/m, over 3 texels as the floor samples it). */
function measure(state) {
  const interleaved = new Float64Array(2 * SIZE * SIZE);
  for (let texel = 0; texel < SIZE * SIZE; texel++) { interleaved[2 * texel] = state[4 * texel]; interleaved[2 * texel + 1] = state[4 * texel + 1]; }
  const field = inverse2d(interleaved, SIZE);
  const at = (column, row) => field[2 * (row * SIZE + column)] / (SIZE * SIZE);
  let height = 0, slope = 0, laplacian = 0;
  const first = Math.ceil(WALLS.x) + 3, last = Math.floor(WALLS.x + SIZE / 2) - 3;
  const firstRow = Math.ceil(WALLS.y) + 3, lastRow = Math.floor(WALLS.y + SIZE / 2) - 3;
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = first; column <= last; column++) {
      const centre = at(column, row);
      height = Math.max(height, Math.abs(centre));
      slope = Math.max(slope, Math.hypot(at(column + 1, row) - at(column - 1, row), at(column, row + 1) - at(column, row - 1)) / (2 * CELL));
      laplacian = Math.max(laplacian, Math.abs(at(column + 3, row) + at(column - 3, row) + at(column, row + 3) + at(column, row - 3) - 4 * centre) / (9 * CELL * CELL));
    }
  }
  return { height, slope, laplacian };
}

const TIMES = [2, 5, 10, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300];
const CANDIDATES = (process.env.POOL_CANDIDATES ?? '').split(';').filter(Boolean).map((pair) => { const [base, least] = pair.split(',').map(Number); return { base, least }; });
const LAWS = [{ base: DAMPING.base, least: 0 }, ...CANDIDATES, POOL_DAMPING];

function run(radius, powerName, { checked = false } = {}) {
  const started = performance.now();
  const { splats, impact } = splashSplats(radius, powerName);
  const last = Math.max(...splats.map((splat) => splat.time));
  console.log(`\n${(200 * radius).toFixed(1)} cm stone thrown ${powerName} at the pool's middle: ${impact.speed?.toFixed?.(2) ?? '?'} m/s; ${splats.length} splats in the pool over ${last.toFixed(2)} s`);
  console.log('  damping γ0 | largest slope (height, caustic change) after the last splat at ' + TIMES.map((time) => `${time}`).join(', ') + ' s | slope under 3e-3, under 1e-4');
  for (const law of LAWS) {
    const gamma = dampingOf(law);
    const state = new Float64Array(4 * SIZE * SIZE);
    let now = 0;
    const byFrame = new Map();
    for (const splat of splats) { const key = splat.time.toFixed(6); if (!byFrame.has(key)) byFrame.set(key, []); byFrame.get(key).push(splat); }
    for (const [key, frameSplats] of [...byFrame.entries()].sort((first, second) => Number(first[0]) - Number(second[0]))) {
      advance(state, gamma, Number(key) - now);
      now = Number(key);
      for (const splat of frameSplats) inject(state, splat);
    }
    const rows = [];
    let plain = null, gone = null;
    for (const time of TIMES) {
      advance(state, gamma, last + time - now);
      now = last + time;
      const measured = measure(state);
      rows.push(measured);
      if (plain === null && measured.slope < 3e-3) plain = time;
      if (gone === null && measured.slope < SLOPE_VISIBLE) gone = time;
    }
    const marked = law === POOL_DAMPING ? ' (the pool\'s)' : law === LAWS[0] ? ' (the pond\'s)' : '';
    console.log(`  ${law.base.toFixed(2)}, least ${(law.least ?? 0).toFixed(3)}${marked} | ${rows.map((row) => `${row.slope.toExponential(1)} (${(row.height * 1000).toFixed(row.height < 1e-4 ? 3 : 2)} mm, ${(100 * row.laplacian * POOL_DEPTH * FOCUSING).toFixed(row.laplacian * POOL_DEPTH * FOCUSING < 1e-3 ? 3 : 1)}%)`).join(', ')} | ${plain ?? `> ${TIMES.at(-1)}`} s, ${gone ?? `> ${TIMES.at(-1)}`} s`);
    if (checked && law === POOL_DAMPING) {
      // The sleep's moment: evolved there exactly.
      const atSleep = new Float64Array(state.length);
      const replay = new Float64Array(4 * SIZE * SIZE);
      let replayNow = 0;
      for (const [key, frameSplats] of [...byFrame.entries()].sort((first, second) => Number(first[0]) - Number(second[0]))) {
        advance(replay, gamma, Number(key) - replayNow);
        replayNow = Number(key);
        for (const splat of frameSplats) inject(replay, splat);
      }
      advance(replay, gamma, last + POOL_SLEEP_SECONDS - replayNow);
      atSleep.set(replay);
      const measured = measure(atSleep);
      const causticChange = measured.laplacian * POOL_DEPTH * FOCUSING;
      check(measured.slope < SLOPE_VISIBLE && causticChange < 1e-3,
        `POOL_SLEEP_SECONDS (${POOL_SLEEP_SECONDS} s) after its last splat, with POOL_DAMPING (γ0 ${POOL_DAMPING.base}/s, at least ${POOL_DAMPING.least}/s): slope ${measured.slope.toExponential(2)} (under ${SLOPE_VISIBLE}), the caustics change by ${(100 * causticChange).toFixed(3)}% (under 0.1%), height ${(measured.height * 1000).toFixed(4)} mm`);
    }
  }
  console.log(`  (${((performance.now() - started) / 1000).toFixed(1)} s)`);
}

const radius = Number(option('radius', '0'));
if (radius > 0) {
  run(radius, option('power', 'normal'));
} else {
  run(0.03, 'normal');
  run(0.15, 'hard', { checked: true });
}
if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exitCode = 1;
} else if (radius === 0) {
  console.log('\npool-probe: all checks pass');
}
