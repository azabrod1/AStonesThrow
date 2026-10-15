// CPU probe of a whole splash (src/splash.js with src/crown.js and src/jet.js),
// without a browser: how the splash scales with the stone.
//
// Throws each stone as the app does from the home view (src/main.js: the hand,
// the aim at a point on the water, normal power, src/rock.js flying it to the
// water), builds the splash with SplashSystem.impact against a stand-in pond
// that records what the splash does to the water, and steps it as the app's
// frame loop does: frames of 1/60 s in substeps of 1/240 s, the crown and jet
// geometry once per frame. For every stone it prints
//   - the entry: speed and angle from vertical;
//   - the crown: its sheet's time scales, its rim's peak height, its reach
//     from the centre and its span across the throw at that moment, when it
//     tears and when it is gone; the forward fan's reach;
//   - the jet: when it starts, its top and when, its widest diameter, when it
//     is gone;
//   - the droplets: spawned by source (contact spray, crown, fan, jet, the
//     crowns of landing drops, the rest), the most alive at once, the largest,
//     and how many are 4 mm and more;
//   - the water: the cavity splat (σ, depth, downward velocity), its foam
//     (from when the hole closes: stamps, reach, amount), all the foam
//     stamps, the specks;
//   - the ring: the pond's linear response to the splash's splats at 0.5, 1
//     and 2 m from the entry, across the throw: its height from trough to
//     crest, when the highest crest passes and its wavelength. It uses the
//     solver's own dispersion and damping (src/spectralWater.js and
//     SPECTRAL_UPDATE_FRAGMENT): ω² = (g k + σ k³/ρ)·tanh(k D) and the
//     damping DAMPING describes, so it is the ring the GPU makes, without
//     the patch's periodic wrap and its fade at the rim;
//   - the CPU cost per frame of the splash's update and geometry (mean,
//     median, 95th percentile and worst, and which frame that was), after a
//     few silent throws so the code is warm.
//
//   node tools/splash-probe.mjs [radius ...] [--aim=x:z] [--power=normal|soft|hard] [--vertical]
//
// Radii in metres (default the slider's 1.5, 4, 8 and 16 cm diameters and the
// 3 cm-radius reference); --vertical drops the stone straight in at the
// throw's speed instead.
import * as THREE from 'three';
import { SplashSystem } from '../src/splash.js';
import { CrownSheet } from '../src/crown.js';
import { JetColumn } from '../src/jet.js';
import { Rock } from '../src/rock.js';
import { DAMPING } from '../src/spectralWater.js';

const option = (name, fallback) => { const hit = process.argv.find((argument) => argument.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const radii = process.argv.slice(2).filter((argument) => !argument.startsWith('--')).map(Number);
const stoneRadii = radii.length > 0 ? radii : [0.0075, 0.02, 0.03, 0.04, 0.08];
const [aimX, aimZ] = option('aim', '0:-1.4').split(':').map(Number);
const power = { soft: 1.3, normal: 1.0, hard: 0.72 }[option('power', 'normal')];
const vertical = process.argv.includes('--vertical');

const GRAVITY = 9.81;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const POND_DEPTH = 0.8;
const millimetres = (metres) => (metres * 1000).toFixed(1);
const centimetres = (metres) => (metres * 100).toFixed(1);
const milliseconds = (seconds) => (seconds * 1000).toFixed(0);

// The app's camera in the home view and its throwing hand (src/main.js).
const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const hand = new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);

/** Fly a stone from the hand to the aim point as the app does; returns the impact and the stone. */
function throwStone(radius) {
  const target = new THREE.Vector3(aimX, 0, aimZ);
  const flightTime = THREE.MathUtils.clamp(0.42 + 0.11 * hand.distanceTo(target), 0.5, 1.0) * power;
  const velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  const rock = new Rock({ radius, position: hand, velocity, envTexture: null });
  if (vertical) {
    // Straight down from just above the water at the speed the throw would reach.
    const speed = Math.hypot(velocity.x, velocity.y - GRAVITY * flightTime, velocity.z);
    rock.position.set(aimX, 2 * radius, aimZ);
    rock.velocity.set(0, -speed, 0);
  }
  for (let step = 0; step < 4 * 240; step++) {
    const impact = rock.update(FRAME / SUBSTEPS, POND_DEPTH);
    if (impact) return { impact, rock };
  }
  throw new Error('the stone never reached the water');
}

// Stand-ins: a pond that records what the splash does to it, and the lighting.
function standIns() {
  const record = { splats: [], foam: [], time: 0 };
  const water = {
    heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512,
    addSplat: (splat) => record.splats.push({ time: record.time, rim: 1.7, height: 0, velocity: 0, ...splat }),
    addFoam: (foam) => record.foam.push({ time: record.time, ...foam }),
  };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  return { record, water, splash };
}

// Droplets by source: whichever sheet or column is stepping when a drop is born.
let source = 'other';
const tagged = (prototype, name, label) => {
  const original = prototype[name];
  prototype[name] = function (...args) {
    const previous = source;
    source = typeof label === 'function' ? label(this) : label;
    try { return original.apply(this, args); } finally { source = previous; }
  };
};
const crownLabel = (crown) => (crown.landing ? 'landing' : crown.fan ? 'fan' : 'crown');
tagged(CrownSheet.prototype, 'update', crownLabel);
tagged(CrownSheet.prototype, 'finishNow', crownLabel);
tagged(JetColumn.prototype, 'update', 'jet');
tagged(JetColumn.prototype, 'finishNow', 'jet');

/** One stone's splash, stepped to its end; returns what was measured. */
function runSplash(radius, { silent = false } = {}) {
  const { impact, rock } = throwStone(radius);
  const { record, water, splash } = standIns();
  const sources = {};
  const largest = {};
  let bigDrops = 0;
  const spawnDroplet = splash.spawnDroplet.bind(splash);
  splash.spawnDroplet = (x, y, z, vx, vy, vz, dropRadius, lens) => {
    sources[source] = (sources[source] ?? 0) + 1;
    largest[source] = Math.max(largest[source] ?? 0, dropRadius);
    if (dropRadius >= 0.004) bigDrops++;
    spawnDroplet(x, y, z, vx, vy, vz, dropRadius, lens);
  };
  let specks = 0;
  const spawnSpeck = splash.foamSpecks.spawn.bind(splash.foamSpecks);
  splash.foamSpecks.spawn = (...args) => { specks++; spawnSpeck(...args); };
  let landingCrowns = 0;
  const startLandingCrown = splash.startLandingCrown.bind(splash);
  splash.startLandingCrown = (hit) => { landingCrowns++; startLandingCrown(hit); };

  source = 'spray';
  splash.impact(impact, water);
  source = 'other';
  const crown = splash.crowns.find((candidate) => !candidate.landing && !candidate.fan);
  const fan = splash.crowns.find((candidate) => candidate.fan);
  const result = {
    radius, impact, crown: { launch: crown.launchDuration, drag: crown.dragSeconds, breakTime: crown.breakTime, endTime: crown.endTime, thickness: crown.baseThickness, height: 0, heightTime: 0, reach: 0, maxDrop: crown.maxDropRadius },
    fan: fan ? { reach: 0, endTime: fan.endTime } : null,
    jet: { start: null, top: 0, topTime: 0, widest: 0, gone: null },
    peakAlive: 0, frameMilliseconds: [], sources, largest, specks: 0, landingCrowns: 0, bigDrops: 0, record,
  };
  let jetColumn = null;
  for (let frame = 0; frame < 6 * 60; frame++) {
    const started = performance.now();
    splash.setFrameSeconds(FRAME);
    for (let substep = 0; substep < SUBSTEPS; substep++) {
      record.time = splash.time + FRAME / SUBSTEPS;
      rock.update(FRAME / SUBSTEPS, POND_DEPTH);
      splash.update(FRAME / SUBSTEPS, water);
    }
    splash.prepareFrame();
    const spent = performance.now() - started;
    if (splash.count > 0 || splash.crowns.length > 0 || splash.columns.length > 0) result.frameMilliseconds.push(spent);
    result.peakAlive = Math.max(result.peakAlive, splash.count);
    const time = splash.time;
    if (splash.crowns.includes(crown)) {
      for (let vertex = 0; vertex < crown.positions.length / 3; vertex++) {
        const height = crown.positions[vertex * 3 + 1];
        if (height > result.crown.height) {
          result.crown.height = height;
          result.crown.heightTime = time;
        }
      }
      if (Math.abs(time - result.crown.heightTime) < 1e-9) {
        // Its reach from the centre, and its span across the throw (the throw goes along z).
        let reach = 0, left = Infinity, right = -Infinity;
        for (let vertex = 0; vertex < crown.positions.length / 3; vertex++) {
          const x = crown.positions[vertex * 3];
          reach = Math.max(reach, Math.hypot(x - crown.centreX, crown.positions[vertex * 3 + 2] - crown.centreZ));
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
        result.crown.reach = reach;
        result.crown.span = right - left;
      }
    }
    if (fan && splash.crowns.includes(fan)) {
      for (let vertex = 0; vertex < fan.positions.length / 3; vertex++) result.fan.reach = Math.max(result.fan.reach, Math.hypot(fan.positions[vertex * 3] - fan.centreX, fan.positions[vertex * 3 + 2] - fan.centreZ));
    }
    if (!jetColumn && splash.columns.length > 0) { jetColumn = splash.columns[0]; result.jet.start = jetColumn.startTime; }
    if (jetColumn && splash.columns.includes(jetColumn)) {
      const positions = jetColumn.positions;
      if (positions[1] > result.jet.top) { result.jet.top = positions[1]; result.jet.topTime = time; }
      const columns = 24;
      for (let row = 6; row < positions.length / 3 / columns; row++) {
        const first = row * columns * 3, opposite = (row * columns + columns / 2) * 3;
        result.jet.widest = Math.max(result.jet.widest, Math.hypot(positions[first] - positions[opposite], positions[first + 1] - positions[opposite + 1], positions[first + 2] - positions[opposite + 2]));
      }
    } else if (jetColumn && result.jet.gone === null) {
      result.jet.gone = time;
    }
    if (time > 1.5 && splash.count === 0 && splash.crowns.length === 0 && splash.columns.length === 0 && splash.jets.length === 0) break;
  }
  result.specks = specks;
  result.landingCrowns = landingCrowns;
  result.bigDrops = bigDrops;
  if (!silent) return result;
  return null;
}

// The ring: the pond's linear response to the splats the splash made, as the
// solver evolves them, each axisymmetric about its own centre. Only splats of
// a quarter of the stone's radius and more count (the cavity, its wake, the
// jet's fall-back and the big drops); the fine drops' rings are a texture on
// it. At a point at a given distance across the throw from the entry, the
// height over the first six seconds: from the deepest trough to the highest
// crest, when that crest passes, and the half period around it, which gives
// the wavelength by the deep-water dispersion λ = g·T²/2π.
const besselJ0 = (argument) => {
  // Abramowitz & Stegun 9.4.1 and 9.4.3.
  const magnitude = Math.abs(argument);
  if (magnitude <= 3) {
    const ratio = (magnitude / 3) ** 2;
    return 1 + ratio * (-2.2499997 + ratio * (1.2656208 + ratio * (-0.3163866 + ratio * (0.0444479 + ratio * (-0.0039444 + ratio * 0.00021)))));
  }
  const inverse = 3 / magnitude;
  const amplitude = 0.79788456 + inverse * (-0.00000077 + inverse * (-0.0055274 + inverse * (-0.00009512 + inverse * (0.00137237 + inverse * (-0.00072805 + inverse * 0.00014476)))));
  const phase = magnitude - 0.78539816 + inverse * (-0.04166397 + inverse * (-0.00003954 + inverse * (0.00262573 + inverse * (-0.00054125 + inverse * (-0.00029333 + inverse * 0.00013558)))));
  return (amplitude * Math.cos(phase)) / Math.sqrt(magnitude);
};
const WAVENUMBER_STEP = 0.5;
const WAVENUMBERS = Array.from({ length: 540 }, (_, index) => WAVENUMBER_STEP * (index + 0.5));   // rad/m, to the 512 grid's Nyquist (268)
const waveOmega = WAVENUMBERS.map((wavenumber) => Math.sqrt((GRAVITY * wavenumber + 7.2e-5 * wavenumber ** 3) * Math.tanh(Math.min(wavenumber * POND_DEPTH, 20))));
const waveDamping = WAVENUMBERS.map((wavenumber) => DAMPING.base * Math.min((wavenumber * DAMPING.baseWavelength) / (2 * Math.PI), 1)
  + DAMPING.viscosity * wavenumber ** 2 + (wavenumber < (2 * Math.PI) / (6 * DAMPING.lowShare) ? DAMPING.low : 0));
const RING_STEP = 0.005;
const RING_SECONDS = 6;
function ringAt(record, pointX, pointZ, stoneRadius) {
  const samples = Math.round(RING_SECONDS / RING_STEP);
  const heights = new Float64Array(samples);
  for (const splat of record.splats) {
    if (splat.radius < 0.25 * stoneRadius) continue;
    const sigma = Math.max(splat.radius, (0.6 * 6) / 512);
    const rimSigma = sigma * Math.max(splat.rim, 1);
    const distance = Math.hypot(pointX - splat.x, pointZ - splat.z);
    const weights = WAVENUMBERS.map((wavenumber) => {
      let shape = Math.exp(-0.5 * sigma * sigma * wavenumber * wavenumber);
      if (splat.rim > 1) shape -= Math.exp(-0.5 * rimSigma * rimSigma * wavenumber * wavenumber);
      return wavenumber * besselJ0(wavenumber * distance) * sigma * sigma * shape * WAVENUMBER_STEP;
    });
    for (let sample = 0; sample < samples; sample++) {
      const age = sample * RING_STEP - splat.time;
      if (age < 0) continue;
      let sum = 0;
      for (let index = 0; index < WAVENUMBERS.length; index++) {
        const weight = weights[index];
        if (weight === 0) continue;
        const omega = waveOmega[index];
        sum += weight * (splat.height * Math.cos(omega * age) + (splat.velocity * Math.sin(omega * age)) / omega) * Math.exp(-waveDamping[index] * age);
      }
      heights[sample] += sum;
    }
  }
  let crest = 0, trough = 0, crestSample = 0;
  heights.forEach((height, sample) => {
    if (height > heights[crestSample]) crestSample = sample;
    crest = Math.max(crest, height);
    trough = Math.min(trough, height);
  });
  // The troughs either side of the highest crest: the half period around it.
  let before = crestSample, after = crestSample;
  while (before > 0 && heights[before - 1] < heights[before]) before--;
  while (after < samples - 1 && heights[after + 1] < heights[after]) after++;
  const halfPeriod = 0.5 * (after - before) * RING_STEP;
  return { height: crest - trough, crestTime: crestSample * RING_STEP, wavelength: (GRAVITY * (2 * halfPeriod) ** 2) / (2 * Math.PI) };
}

// Warm up, then measure.
for (const warmUpRadius of [0.03, 0.08, 0.03, 0.08]) runSplash(warmUpRadius, { silent: true });
console.log(`aim (${aimX}, ${aimZ}), ${option('power', 'normal')} power${vertical ? ', dropped straight in' : ''}; frames of 1/60 s in ${SUBSTEPS} substeps`);
for (const radius of stoneRadii) {
  const result = runSplash(radius);
  const { impact, crown, fan, jet } = result;
  const angle = Math.asin(Math.min(Math.hypot(impact.velocity.x, impact.velocity.z) / impact.speed, 1)) * 180 / Math.PI;
  console.log(`\nstone ${centimetres(2 * radius)} cm across (radius ${millimetres(radius)} mm, size factor ${(radius / 0.03).toFixed(2)}): enters at ${impact.speed.toFixed(2)} m/s, ${angle.toFixed(0)}° from vertical`);
  console.log(`  crown: launch ${milliseconds(crown.launch)} ms, drag time ${milliseconds(crown.drag)} ms, h0 ${millimetres(crown.thickness)} mm; rim peaks ${centimetres(crown.height)} cm up at ${milliseconds(crown.heightTime)} ms, ${centimetres(crown.reach)} cm out, ${centimetres(crown.span)} cm across; tears at ${milliseconds(crown.breakTime)} ms, gone at ${milliseconds(crown.endTime)} ms; drops up to ${millimetres(crown.maxDrop)} mm`);
  if (fan) console.log(`  fan: reaches ${centimetres(fan.reach)} cm, gone at ${milliseconds(fan.endTime)} ms`);
  if (jet.start !== null) console.log(`  jet: starts at ${milliseconds(jet.start)} ms, top ${centimetres(jet.top)} cm at ${milliseconds(jet.topTime)} ms, widest ${millimetres(jet.widest)} mm across, gone at ${jet.gone === null ? '-' : milliseconds(jet.gone)} ms`);
  const total = Object.values(result.sources).reduce((sum, count) => sum + count, 0);
  const bySource = ['spray', 'crown', 'fan', 'jet', 'landing', 'other'].filter((name) => result.sources[name]).map((name) => `${name} ${result.sources[name]} (to ${millimetres(result.largest[name])} mm)`).join(', ');
  console.log(`  droplets: ${total} spawned: ${bySource}; ${result.bigDrops} of 4 mm and more; at most ${result.peakAlive} alive; ${result.landingCrowns} landing crowns`);
  const cavity = result.record.splats[0];
  // The cavity's foam: the stamps as wide as the stone and more (the jet's mound's included), from when the hole closes.
  const cavityFoam = result.record.foam.filter((stamp) => stamp.radius >= 0.55 * radius && stamp.time >= (jet.start ?? 0) - 1e-9 && stamp.time < (jet.start ?? 0) + 2 * Math.sqrt(radius / GRAVITY));
  const widest = cavityFoam.reduce((best, stamp) => Math.max(best, stamp.radius), 0);
  const foamAmount = cavityFoam.reduce((sum, stamp) => sum + stamp.amount, 0);
  const foamEnd = cavityFoam.reduce((last, stamp) => Math.max(last, stamp.time), 0);
  console.log(`  water: cavity σ ${millimetres(cavity.radius)} mm, depth ${millimetres(-cavity.height)} mm, ${cavity.velocity.toFixed(2)} m/s; its foam ${cavityFoam.length} stamps from ${milliseconds(jet.start ?? 0)} to ${milliseconds(foamEnd)} ms, to σ ${millimetres(widest)} mm, amount ${foamAmount.toFixed(2)} in all; ${result.record.splats.length} splats, ${result.record.foam.length} foam stamps, ${result.specks} foam specks`);
  const throwLength = Math.hypot(impact.velocity.x, impact.velocity.z);
  const acrossX = throwLength > 1e-6 ? -impact.velocity.z / throwLength : 1, acrossZ = throwLength > 1e-6 ? impact.velocity.x / throwLength : 0;
  const rings = [0.5, 1, 2].map((distance) => ({ distance, ...ringAt(result.record, impact.x + acrossX * distance, impact.z + acrossZ * distance, radius) }));
  console.log(`  ring across the throw: ${rings.map((ring) => `at ${ring.distance} m ${millimetres(ring.height)} mm trough to crest, crest at ${ring.crestTime.toFixed(2)} s, λ ${centimetres(ring.wavelength)} cm`).join('; ')}`);
  const frames = result.frameMilliseconds;
  const mean = frames.reduce((sum, value) => sum + value, 0) / frames.length;
  const sorted = [...frames].sort((first, second) => first - second);
  const worst = frames.indexOf(sorted.at(-1));
  console.log(`  CPU: ${mean.toFixed(2)} ms per frame on average over ${frames.length} frames, median ${sorted[Math.floor(0.5 * sorted.length)].toFixed(2)}, 95th percentile ${sorted[Math.floor(0.95 * sorted.length)].toFixed(2)}, worst ${sorted.at(-1).toFixed(2)} ms (frame ${worst + 1})`);
}
