// CPU probe of the splash's spray (src/spray.js and its emitters in
// src/crown.js, src/jet.js and src/splash.js), without a browser.
//
// First the flight: SPRAY_VERTEX's closed form (two phases of linear drag,
// src/spray.js flightPosition) against an integration (fourth-order
// Runge–Kutta, steps of at most 0.1 ms and a twentieth of v_t / g) of the
// drag it stands for, Schiller and Naumann's on a sphere (dragDeceleration),
// for drops of 0.05 to 1 mm radius launched at 1 to 12 m/s, 15° to 75° above
// the horizontal, from 5 cm up: the error in their reach along the water and
// their apex, scaled by the larger of the two (so a drop that stops within a
// few millimetres is not judged by its millimetres), and in their time down,
// for each COAST from 1 to 1.6, which sets it (the least worst error); then
// the terminal speeds against Gunn and Kinzer's measurements, the life the
// CPU reckons (landingBound) against the closed form's landing and the size
// distribution's water against sprayDrops.
//
// Then the splashes: each stone size thrown softly, normally and hard at the
// reference aim, as tools/splash-probe.mjs throws them (frames of 1/60 s in
// four substeps, the geometry once a frame), and a skip's touch, each run with
// a recording spray: the sprites written, the drops they stand for (and so
// the weight of a sprite), the spray's water against the CPU drops', its drop
// sizes (the 10th, 50th and 90th percentiles by drops), launch speeds, the
// most sprites in the air at once, and from a run of its own with nothing
// recorded, the CPU cost per frame of writing them (mean, 95th percentile,
// worst), for High's budget and Low's (Medium's sprites only).
//
// Checks (exit code 1 if any fails):
//   - the closed form with COAST errs by at most FLIGHT_TOLERANCE in reach,
//     apex and time down, MEDIAN_TOLERANCE at the median, and COAST is
//     within COAST_SLACK of the best;
//   - the terminal speeds are within TERMINAL_TOLERANCE of Gunn and Kinzer's;
//   - landingBound never falls short of the flight, nor overshoots it by
//     more than BOUND_SLACK of it (plus a millisecond) at the median;
//   - a burst's water is what was asked within WATER_TOLERANCE;
//   - every sprite's life is positive and at most 4 s, and every sprite
//     comes down within LANDING_REACH of the entry;
//   - on every preset the sprites in the air at once fit its ring, and the
//     rock thrown hard writes at most HIGH_SPRITES sprites on High;
//   - the same seeded throw writes the same spray twice;
//   - the spray spends no draw of Math.random: a seeded throw draws it as
//     often with the spray as with a spray that writes nothing;
//   - the ring's upload ranges cover what was written since the last commit,
//     across its end too, and it starts over at slot 0 once everything has
//     landed;
//   - a change of wind moves no sprite already in the air, and one born in
//     a gale drifts with it.
//
//   node tools/spray-probe.mjs
import * as THREE from 'three';
import { SplashSystem } from '../src/splash.js';
import { Rock, throwFlightTime } from '../src/rock.js';
import { SpraySystem, seededRandom, sprayDrops, sprayFlight, flightPosition, landingBound, terminalSpeed, dragDeceleration, COAST, SPRAY_CAPACITY, SPRAY_STRIDE } from '../src/spray.js';
import { QUALITY } from '../src/main.js';

const GRAVITY = 9.81;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const POND_DEPTH = 0.8;
const FLIGHT_TOLERANCE = 0.2;
const MEDIAN_TOLERANCE = 0.08;
const COAST_SLACK = 0.1;
const TERMINAL_TOLERANCE = 0.08;
const BOUND_SLACK = 0.25;
const WATER_TOLERANCE = 0.03;
const LANDING_REACH = 5;    // m: a hard throw's forward fan throws its millimetre drops 3 to 4 m
const HIGH_SPRITES = 60000;
const MOST_LIFE = 4;
const failures = [];
const check = (passed, message) => { if (!passed) failures.push(message); };
const millimetres = (metres) => (metres * 1000).toFixed(2);
const percentile = (sorted, share) => sorted[Math.min(Math.floor(share * sorted.length), sorted.length - 1)] ?? 0;

// ---- the flight ----------------------------------------------------------

/** A drop's flight under gravity and Schiller–Naumann drag (RK4), from (0, height) at `speed` and `elevation`: its reach, apex and time down. */
function integrate(radius, speed, elevation, height) {
  const step = Math.min(terminalSpeed(radius) / GRAVITY / 20, 1e-4);
  let x = 0, y = height, vx = speed * Math.cos(elevation), vy = speed * Math.sin(elevation), time = 0, apex = height;
  const acceleration = (velocityX, velocityY) => {
    const magnitude = Math.hypot(velocityX, velocityY);
    const drag = magnitude > 0 ? dragDeceleration(radius, magnitude) / magnitude : 0;
    return [-drag * velocityX, -drag * velocityY - GRAVITY];
  };
  while (y >= 0 && time < 10) {
    const [ax1, ay1] = acceleration(vx, vy);
    const [ax2, ay2] = acceleration(vx + 0.5 * step * ax1, vy + 0.5 * step * ay1);
    const [ax3, ay3] = acceleration(vx + 0.5 * step * ax2, vy + 0.5 * step * ay2);
    const [ax4, ay4] = acceleration(vx + step * ax3, vy + step * ay3);
    const previousY = y, previousX = x;
    x += (step / 6) * ((vx) + 2 * (vx + 0.5 * step * ax1) + 2 * (vx + 0.5 * step * ax2) + (vx + step * ax3));
    y += (step / 6) * ((vy) + 2 * (vy + 0.5 * step * ay1) + 2 * (vy + 0.5 * step * ay2) + (vy + step * ay3));
    vx += (step / 6) * (ax1 + 2 * ax2 + 2 * ax3 + ax4);
    vy += (step / 6) * (ay1 + 2 * ay2 + 2 * ay3 + ay4);
    time += step;
    apex = Math.max(apex, y);
    if (y < 0) {
      const back = y / (y - previousY);
      return { reach: x - (x - previousX) * back, apex, time: time - step * back };
    }
  }
  return { reach: x, apex, time };
}

/** Where the closed form (src/spray.js flightPosition) brings a drop launched along x from `height`, `rise` up, down to the still water, stepped finely: its reach, apex and time down. */
function closedLanding(radius, across, rise, height, coast = COAST, step = 2e-4) {
  const flight = sprayFlight(radius, Math.hypot(across, rise));
  const point = { x: 0, y: 0, z: 0 };
  let time = 0, apex = height, previous = { x: 0, y: height };
  while (time < 10) {
    time += step;
    flightPosition(0, height, 0, across, rise, 0, flight.fastTau, flight.fastTime, flight.slowTau, 0, 0, time, point, coast);
    apex = Math.max(apex, point.y);
    if (point.y < 0) {
      const back = point.y / (point.y - previous.y);
      return { reach: point.x - (point.x - previous.x) * back, apex, time: time - step * back, flight };
    }
    previous = { x: point.x, y: point.y };
  }
  return { reach: point.x, apex, time, flight };
}

/** The closed form's reach, apex and time down for the same launch as integrate's. */
function closedForm(radius, speed, elevation, height, coast) {
  return closedLanding(radius, speed * Math.cos(elevation), speed * Math.sin(elevation), height, coast);
}

const RADII = [0.00005, 0.0001, 0.0002, 0.0003, 0.0005, 0.00075, 0.001];
const SPEEDS = [1, 2, 4, 6, 9, 12];
const ELEVATIONS = [15, 45, 75].map((degrees) => THREE.MathUtils.degToRad(degrees));
const LAUNCH_HEIGHT = 0.05;
const flights = [];
for (const radius of RADII) for (const speed of SPEEDS) for (const elevation of ELEVATIONS) flights.push({ radius, speed, elevation, truth: integrate(radius, speed, elevation, LAUNCH_HEIGHT) });

/** The worst and median error of the closed form with `coast` over every flight, and where the worst was. */
function flightErrors(coast) {
  const errors = [];
  let worst = { error: 0 };
  for (const flight of flights) {
    const model = closedForm(flight.radius, flight.speed, flight.elevation, LAUNCH_HEIGHT, coast);
    const truth = flight.truth;
    const scale = Math.max(truth.reach, truth.apex - LAUNCH_HEIGHT, 0.01);
    const error = Math.max(Math.abs(model.reach - truth.reach) / scale, Math.abs(model.apex - truth.apex) / scale, Math.abs(model.time - truth.time) / truth.time);
    errors.push(error);
    if (error > worst.error) worst = { error, flight, model };
  }
  errors.sort((first, second) => first - second);
  return { worst, median: percentile(errors, 0.5) };
}

console.log('the flight: the closed form against Schiller–Naumann drag integrated, drops of 0.05 to 1 mm at 1 to 12 m/s, 15° to 75° up, from 5 cm');
let bestCoast = { coast: 0, worst: Infinity };
for (let coast = 1; coast <= 1.601; coast += 0.1) {
  const { worst, median } = flightErrors(coast);
  if (worst.error < bestCoast.worst) bestCoast = { coast, worst: worst.error };
  console.log(`  COAST ${coast.toFixed(1)}: worst error ${(100 * worst.error).toFixed(1)}% (${millimetres(worst.flight.radius)} mm at ${worst.flight.speed} m/s, ${THREE.MathUtils.radToDeg(worst.flight.elevation).toFixed(0)}°), median ${(100 * median).toFixed(1)}%`);
}
const configured = flightErrors(COAST);
console.log(`  best ${bestCoast.coast.toFixed(1)}; COAST ${COAST}: worst ${(100 * configured.worst.error).toFixed(1)}%, median ${(100 * configured.median).toFixed(1)}%`);
for (const sample of [[0.00005, 12, 15], [0.0001, 6, 45], [0.0003, 4, 60], [0.0005, 9, 30], [0.001, 3, 75]]) {
  const [radius, speed, degrees] = sample;
  const elevation = THREE.MathUtils.degToRad(degrees);
  const truth = integrate(radius, speed, elevation, LAUNCH_HEIGHT), model = closedForm(radius, speed, elevation, LAUNCH_HEIGHT, COAST);
  const { fastTau, fastTime, slowTau } = model.flight;
  console.log(`    ${millimetres(radius)} mm at ${speed} m/s, ${degrees}° up: reach ${(100 * truth.reach).toFixed(1)} cm (closed form ${(100 * model.reach).toFixed(1)}), apex ${(100 * truth.apex).toFixed(1)} cm (${(100 * model.apex).toFixed(1)}), down after ${(1000 * truth.time).toFixed(0)} ms (${(1000 * model.time).toFixed(0)}); τ1 ${(1000 * fastTau).toFixed(1)} ms for ${(1000 * fastTime).toFixed(1)} ms, τ2 ${(1000 * slowTau).toFixed(0)} ms`);
}
check(configured.worst.error <= FLIGHT_TOLERANCE, `the closed form errs by ${(100 * configured.worst.error).toFixed(1)}% (at most ${100 * FLIGHT_TOLERANCE}%)`);
check(configured.median <= MEDIAN_TOLERANCE, `the closed form errs by ${(100 * configured.median).toFixed(1)}% at the median (at most ${100 * MEDIAN_TOLERANCE}%)`);
check(Math.abs(COAST - bestCoast.coast) <= COAST_SLACK + 1e-9, `COAST ${COAST} is not within ${COAST_SLACK} of the best, ${bestCoast.coast.toFixed(1)}`);

// Terminal speeds against Gunn and Kinzer (1949), by diameter in mm.
const GUNN_KINZER = [[0.1, 0.27], [0.2, 0.72], [0.3, 1.17], [0.4, 1.62], [0.6, 2.47], [0.8, 3.27], [1.0, 4.03], [1.4, 5.17], [2.0, 6.49]];
const terminalErrors = GUNN_KINZER.map(([diameter, measured]) => ({ diameter, measured, model: terminalSpeed(diameter / 2000) }));
console.log(`  terminal speeds (Gunn and Kinzer's in brackets): ${terminalErrors.map(({ diameter, measured, model }) => `${diameter} mm ${model.toFixed(2)} (${measured})`).join(', ')} m/s`);
for (const { diameter, measured, model } of terminalErrors) check(Math.abs(model - measured) / measured <= TERMINAL_TOLERANCE, `the terminal speed of a drop ${diameter} mm across is ${model.toFixed(2)} m/s, Gunn and Kinzer measured ${measured}`);

// The CPU's life against the closed form's landing.
{
  const random = seededRandom(17);
  const overshoots = [];
  let short = 0;
  for (let sample = 0; sample < 3000; sample++) {
    const radius = 0.00005 + random() * 0.00095;
    const speed = random() * 10;
    const rise = (2 * random() - 0.6) * speed, height = random() * 0.6;
    const across = Math.sqrt(Math.max(speed * speed - rise * rise, 0));
    const exact = closedLanding(radius, across, rise, height, COAST, 1e-4).time;
    const bound = landingBound(height, rise, sprayFlight(radius, Math.hypot(across, rise)));
    if (bound < exact - 2e-4) short++;
    if (exact > 0) overshoots.push((bound - exact) / exact);
  }
  overshoots.sort((first, second) => first - second);
  console.log(`  life (landingBound) against the flight: never short in ${overshoots.length} launches: ${short === 0}; overshoot median ${(100 * percentile(overshoots, 0.5)).toFixed(1)}%, 90th percentile ${(100 * percentile(overshoots, 0.9)).toFixed(1)}%`);
  check(short === 0, `landingBound fell short of the flight ${short} times`);
  check(percentile(overshoots, 0.5) <= BOUND_SLACK, `landingBound overshoots the flight by ${(100 * percentile(overshoots, 0.5)).toFixed(1)}% at the median`);
}

// A burst's water.
{
  const spray = new SpraySystem();
  const water = 2e-6, radius = 0.0003;
  spray.burst({ x: 0, y: 0.1, z: 0, vx: 0, vy: 1, vz: 0, drops: sprayDrops(water, radius), radius, kick: 0.5, time: 0, random: seededRandom(3), sizeFactor: 0.25 });
  const share = spray.tally.water / water;
  console.log(`  a burst asked for ${(water * 1e6).toFixed(1)} mL in drops of ${millimetres(radius)} mm writes ${(spray.tally.water * 1e6).toFixed(3)} mL in ${spray.tally.sprites} sprites`);
  check(Math.abs(share - 1) <= WATER_TOLERANCE, `a burst's water is ${share.toFixed(3)} of what was asked`);
}

// ---- the splashes --------------------------------------------------------

const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const hand = new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);
const originalRandom = Math.random;
let randomDraws = 0;
/** Math.random as the shoot harness seeds it (Park–Miller), counting its draws. */
function seedRandom(seed) {
  let state = seed;
  Math.random = () => { randomDraws++; state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}

function throwStone(radius, power) {
  const target = new THREE.Vector3(0, 0, -1.4);
  const flight = throwFlightTime(hand, target, power, radius);
  const velocity = target.clone().sub(hand).divideScalar(flight);
  velocity.y += 0.5 * GRAVITY * flight;
  const rock = new Rock({ radius, position: hand, velocity, envTexture: null });
  for (let step = 0; step < 4 * 240; step++) {
    const impact = rock.update(FRAME / SUBSTEPS, POND_DEPTH);
    if (impact) return impact;
  }
  throw new Error('the stone never reached the water');
}

function standIns() {
  const water = { heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512, addSplat() {}, addFoam() {} };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  return { water, splash };
}

/**
 * One splash, seeded, run to its end with `budget` (QUALITY's spray): the
 * stone's (radius, power) or a skip's touch. `mute` swaps in a spray that
 * writes nothing. Returns what the spray did and the Math.random draws.
 */
function runSplash({ radius, power = 'normal', skip = false, seed = 11, budget = QUALITY.high.spray, mute = false, timing = false }) {
  Math.random = originalRandom;
  const { water, splash } = standIns();
  const spray = splash.spray;
  spray.setBudget(budget);
  const sprites = [];
  let cpuWater = 0, burstMilliseconds = 0;
  if (mute) spray.burst = () => 0;
  else if (timing) {
    const burst = spray.burst.bind(spray);
    spray.burst = (options) => { const started = performance.now(); const written = burst(options); burstMilliseconds += performance.now() - started; return written; };
  } else {
    const write = spray.write.bind(spray);
    spray.write = (x, y, z, vx, vy, vz, dropRadius, weight, time) => {
      const before = spray.tally.sprites;
      write(x, y, z, vx, vy, vz, dropRadius, weight, time);
      if (spray.tally.sprites > before) sprites.push({ x, y, z, vx, vy, vz, radius: dropRadius, weight, time });
    };
  }
  const spawnDroplet = splash.spawnDroplet.bind(splash);
  splash.spawnDroplet = (...args) => { cpuWater += (4 / 3) * Math.PI * args[6] ** 3; spawnDroplet(...args); };
  seedRandom(seed);
  randomDraws = 0;
  let impact;
  if (skip) {
    const velocity = new THREE.Vector3(0, -1.2, -9);
    impact = { x: 0, z: -1.4, exitX: 0, exitZ: -1.5, velocity, radius, pushSpeed: 2, duration: 0.012, skim: true };
    splash.skim(impact, water);
  } else {
    impact = throwStone(radius, power);
    splash.impact(impact, water);
  }
  const frameMilliseconds = [];
  let peak = 0, peakTime = 0;
  for (let frame = 0; frame < 300; frame++) {
    const before = burstMilliseconds;
    splash.setFrameSeconds(FRAME);
    for (let substep = 0; substep < SUBSTEPS; substep++) splash.update(FRAME / SUBSTEPS, water);
    splash.prepareFrame();
    if (burstMilliseconds > before) frameMilliseconds.push(burstMilliseconds - before);
    if (!mute && !timing && frame % 2 === 0) {
      const live = spray.liveCount(splash.time);
      if (live > peak) { peak = live; peakTime = splash.time; }
    }
    if (splash.settled && frame > 30) break;
  }
  const result = { impact, sprites, cpuWater, tally: { ...spray.tally }, peak, peakTime, frameMilliseconds, draws: randomDraws, data: mute ? null : spray.data.slice(0, spray.used * SPRAY_STRIDE), spray };
  Math.random = originalRandom;
  return result;
}

/** Where each sprite comes down (the closed form with the spray's wind, which is none here, at its life: past its landing), and its life. */
function landings(result) {
  const reaches = [];
  const point = { x: 0, y: 0, z: 0 };
  for (const sprite of result.sprites) {
    const flight = sprayFlight(sprite.radius, Math.hypot(sprite.vx, sprite.vy, sprite.vz));
    const life = landingBound(sprite.y, sprite.vy, flight);
    flightPosition(sprite.x, sprite.y, sprite.z, sprite.vx, sprite.vy, sprite.vz, flight.fastTau, flight.fastTime, flight.slowTau, 0, 0, life, point);
    reaches.push({ reach: Math.hypot(point.x - result.impact.x, point.z - result.impact.z), life });
  }
  return reaches;
}

function describe(label, result) {
  const { tally, sprites } = result;
  // Sizes by drops: each sprite counts its weight.
  const bySize = sprites.map((sprite) => [sprite.radius, sprite.weight]).sort((first, second) => first[0] - second[0]);
  const total = bySize.reduce((sum, [, weight]) => sum + weight, 0);
  const sizeAt = (share) => { let running = 0; for (const [size, weight] of bySize) { running += weight; if (running >= share * total) return size; } return 0; };
  const speeds = sprites.map((sprite) => Math.hypot(sprite.vx, sprite.vy, sprite.vz)).sort((first, second) => first - second);
  const frames = [...result.frameMilliseconds].sort((first, second) => first - second);
  const mean = frames.reduce((sum, value) => sum + value, 0) / Math.max(frames.length, 1);
  console.log(`  ${label}: ${tally.sprites} sprites for ${Math.round(tally.drops)} drops (a sprite ${(tally.drops / Math.max(tally.sprites, 1)).toFixed(1)}), ${(tally.water * 1e6).toFixed(2)} mL against the drops' ${(result.cpuWater * 1e6).toFixed(1)} mL; `
    + `radii ${millimetres(sizeAt(0.1))} / ${millimetres(sizeAt(0.5))} / ${millimetres(sizeAt(0.9))} mm; launched at ${percentile(speeds, 0.5).toFixed(2)} m/s (90th percentile ${percentile(speeds, 0.9).toFixed(2)}); `
    + `at most ${result.peak} in the air (at ${(1000 * result.peakTime).toFixed(0)} ms); CPU ${mean.toFixed(2)} ms a frame, 95th percentile ${percentile(frames, 0.95).toFixed(2)}, worst ${(frames[frames.length - 1] ?? 0).toFixed(2)}`);
}

// Warm the code, then run each.
for (let warm = 0; warm < 2; warm++) runSplash({ radius: 0.03 });
const SIZES = [0.0075, 0.02, 0.03, 0.08, 0.15];
for (const [presetName, budget] of [['high', QUALITY.high.spray], ['low', QUALITY.low.spray], ['medium', QUALITY.medium.spray]]) {
  console.log(`\nthe splashes on ${presetName === 'high' ? 'High' : presetName === 'low' ? 'Low' : 'Medium'} (ring ${budget.ring}, share ${budget.share})`);
  const runs = [];
  const powers = presetName === 'high' ? ['soft', 'normal', 'hard'] : ['normal', 'hard'];
  for (const radius of SIZES) for (const power of powers) runs.push({ label: `${(200 * radius).toFixed(1)} cm stone, ${power}`, options: { radius, power, budget } });
  runs.push({ label: 'a 6 cm stone\'s skip', options: { radius: 0.03, skip: true, budget } });
  for (const { label, options } of runs) {
    const result = runSplash(options);
    result.frameMilliseconds = runSplash({ ...options, timing: true }).frameMilliseconds;
    if (presetName !== 'medium') describe(label, result);
    check(result.peak < budget.ring, `${label} on ${presetName}: ${result.peak} sprites in the air at once, more than the ring's ${budget.ring}`);
    if (presetName === 'high' && options.radius === 0.15 && options.power === 'hard') check(result.tally.sprites <= HIGH_SPRITES, `the rock thrown hard writes ${result.tally.sprites} sprites on High (at most ${HIGH_SPRITES})`);
    if (presetName === 'high') {
      const reaches = landings(result);
      const farthest = reaches.reduce((most, { reach }) => Math.max(most, reach), 0);
      const lives = reaches.map(({ life }) => life);
      check(lives.every((life) => life > 0 && life <= MOST_LIFE), `${label}: a sprite's life is not within (0, ${MOST_LIFE}] s`);
      check(farthest <= LANDING_REACH, `${label}: a sprite comes down ${farthest.toFixed(2)} m from the entry`);
    }
    if (presetName === 'medium') console.log(`  ${label}: ${result.tally.sprites} sprites, at most ${result.peak} in the air`);
  }
}

// ---- seeds and draws -----------------------------------------------------

console.log('\nseeds');
for (const options of [{ radius: 0.03, power: 'normal' }, { radius: 0.15, power: 'hard' }, { radius: 0.03, skip: true }]) {
  const label = options.skip ? 'a skip' : `${(200 * options.radius).toFixed(0)} cm stone, ${options.power}`;
  const first = runSplash(options), second = runSplash(options), mute = runSplash({ ...options, mute: true });
  const same = first.data.length === second.data.length && first.data.every((value, index) => value === second.data[index]);
  console.log(`  ${label}: the same spray twice: ${same}; Math.random drawn ${first.draws} times with the spray, ${mute.draws} without`);
  check(same, `${label}: the same seeded throw wrote different spray`);
  check(first.draws === mute.draws, `${label}: the spray spends draws of Math.random (${first.draws} against ${mute.draws})`);
}

// ---- the ring ------------------------------------------------------------

{
  const ranges = (spray) => spray.buffer.updateRanges.map(({ start, count }) => [start / SPRAY_STRIDE, count / SPRAY_STRIDE]);
  const spray = new SpraySystem({ capacity: 8 });
  const writeMany = (count, time) => { for (let index = 0; index < count; index++) spray.write(0, 0.5, 0, 0, 1, 0, 0.0003, 1, time); };
  writeMany(5, 0);
  spray.commit(0);
  const first = ranges(spray);
  spray.buffer.clearUpdateRanges();
  writeMany(5, 0.01);
  spray.commit(0.01);
  const across = ranges(spray);
  spray.buffer.clearUpdateRanges();
  writeMany(12, 0.02);
  spray.commit(0.02);
  const whole = ranges(spray);
  spray.buffer.clearUpdateRanges();
  const later = spray.lastDeath + 0.01;
  writeMany(2, later);
  spray.commit(later);
  const restart = ranges(spray);
  console.log(`\nthe ring (8 slots): 5 written ${JSON.stringify(first)}, 5 more across its end ${JSON.stringify(across)}, 12 ${JSON.stringify(whole)}, 2 once all had landed ${JSON.stringify(restart)} (slot, count); drawn ${spray.geometry.instanceCount}`);
  check(JSON.stringify(first) === '[[0,5]]', `the ring's first upload is ${JSON.stringify(first)}`);
  check(JSON.stringify(across) === '[[5,3],[0,2]]', `the ring's upload across its end is ${JSON.stringify(across)}`);
  check(JSON.stringify(whole) === '[[0,8]]', `the ring's upload of more than it holds is ${JSON.stringify(whole)}`);
  check(JSON.stringify(restart) === '[[0,2]]' && spray.geometry.instanceCount === 2, `the ring did not start over at slot 0 once everything had landed: ${JSON.stringify(restart)}, ${spray.geometry.instanceCount} drawn`);
  check(SPRAY_CAPACITY >= QUALITY.high.spray.ring, `the ring's ${SPRAY_CAPACITY} slots are fewer than High's ${QUALITY.high.spray.ring}`);
}

// ---- the wind ------------------------------------------------------------

{
  // A sprite keeps the drift it was born in: a change of wind moves no drop already in the air.
  const spray = new SpraySystem();
  spray.setWind(1, 0, 0.3);
  spray.write(0, 0.3, 0, 0.5, 2, 0, 0.0003, 1, 0);
  const before = { x: 0, y: 0, z: 0 }, after = { x: 0, y: 0, z: 0 };
  spray.positionAt(0, 0.2, before);
  spray.setWind(0, 1, 4);
  spray.positionAt(0, 0.2, after);
  spray.write(0, 0.3, 0, 0.5, 2, 0, 0.0003, 1, 0);
  const blown = spray.positionAt(1, 0.2, { x: 0, y: 0, z: 0 });
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  console.log(`\nthe wind: a drop in the air moves ${(1000 * moved).toFixed(3)} mm when the wind turns from calm to a gale; one born in the gale drifts ${(100 * blown.z).toFixed(1)} cm across it in 0.2 s`);
  check(moved < 1e-6, `a change of wind moves a drop already in the air by ${(1000 * moved).toFixed(2)} mm`);
  check(blown.z > 0.05, `a drop born in a gale drifts only ${(100 * blown.z).toFixed(1)} cm across it in 0.2 s`);
}

if (failures.length > 0) {
  console.log(`\nspray-probe: ${failures.length} check(s) failed`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(1);
}
console.log('\nspray-probe: all checks pass');
