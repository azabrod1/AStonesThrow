// The app's splash for the simulation's case, as time series, for the comparison
// in tools/basilisk/analyse.py (the README there says how they are used).
//
// A 3 cm stone (radius) entering vertically at exactly 6.3 m/s, as
// SplashSystem.impact builds it, stepped as the app's frame loop does (frames of
// 1/60 s in substeps of 1/240 s) but with the crown's and the jet's geometry
// evaluated every substep, so they are sampled four times as finely as a frame.
// Math.random is seeded, so the output is reproducible. It writes JSON with
//   - the stone's path the cavity follows (depth and speed every ms; times
//     are on the splash's clock, on which first contact is at
//     case.contactTime = one substep, 4.17 ms: the analysis shifts them),
//   - the cavity: when the centre reaches the water, the widest mouth, the
//     pinch-off (time, depth, the stone's depth then), the closure, and every
//     ms the mouth's radius, the lip's height and the hole's depth,
//   - the crown: when it tears and is gone, and every substep the rim's
//     height (the sheet's highest point) and reach (that point's distance from
//     the axis),
//   - the jet: when it is launched (the pinch-off), when its needle's first
//     material clears the still surface (startTime, which the comparison
//     sets against the simulation's emergence) and how fast it rises then
//     (tipSpeed), every substep the column's top, and every drop it sheds
//     (time, height, radius, rising speed),
//   - the ring: the ring source the splash hands the rings (src/rings.js)
//     with the solver's near-field splats as wide as a quarter of the stone
//     and more (the jet's mound and base) added, at the simulation's gauge
//     radii every 10 ms to 8 s, with rings.py's measures (the largest swing
//     within any 0.6 s, when the highest crest passes, its period from the
//     zero crossings either side and its wavelength by the dispersion on the
//     pond's depth). The ring is evolved with the simulation's damping
//     (2νk², the surface film off) to compare like for like; the app's film
//     makes it 5 to 10% lower (tools/ring-probe.mjs). It is the mean around
//     the circle of that radius (exactly, by Graf's addition theorem:
//     J0(k·d) averages to J0(k·r)·J0(k·s), s the splat's distance from the
//     entry), which is what an axisymmetric simulation's gauge measures. At
//     a single point across the throw (`pointSummary`) the drops that land
//     near it add their own ripples (the splats narrower than a quarter of
//     the stone are left out of both).
//
//   node tools/basilisk/app-numbers.mjs [out.json]
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { SplashSystem } from '../../src/splash.js';
import { JetColumn } from '../../src/jet.js';
import { DAMPING } from '../../src/spectralWater.js';
import { RingSources, RING_DAMPING, ringFrequency, ringGroupSpeed, splatSpectrum } from '../../src/rings.js';

let seed = 20261015;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};

const RADIUS = 0.03;
const SPEED = 6.3;
const GRAVITY = 9.81;
const POND_DEPTH = 0.8;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const GAUGES = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
const round = (value, digits = 5) => Number(value.toFixed(digits));

const record = { splats: [], time: 0 };
// The rings take the stone's ring source as the app hands it to them; only the bookkeeping is needed.
const rings = Object.assign(new RingSources({ depth: POND_DEPTH }), { uniforms: () => ({}) });
const water = {
  heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512, rings,
  addSplat: (splat) => record.splats.push({ time: record.time, rim: 1.7, height: 0, velocity: 0, ...splat }),
  addFoam: () => {},
};
const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });

// The jet's drops: whatever is spawned while a jet column steps.
let jetStepping = false;
for (const name of ['update', 'finishNow']) {
  const original = JetColumn.prototype[name];
  JetColumn.prototype[name] = function (...args) {
    jetStepping = true;
    try { return original.apply(this, args); } finally { jetStepping = false; }
  };
}
const jetDrops = [];
const spawnDroplet = splash.spawnDroplet.bind(splash);
splash.spawnDroplet = (x, y, z, vx, vy, vz, dropRadius, lens) => {
  if (jetStepping) jetDrops.push({ t: round(splash.time, 4), y: round(y, 4), radius: round(dropRadius, 5), vy: round(vy, 3) });
  spawnDroplet(x, y, z, vx, vy, vz, dropRadius, lens);
};

// The reference simulation's case: a ball, its air light enough that it seals deep (tools/basilisk/README.md),
// so the splash's choices are fixed to a deep seal with its nominal timing and a clean jet.
const impact = {
  x: 0, z: -1.4, height: RADIUS, speed: SPEED, velocity: new THREE.Vector3(0, -SPEED, 0), radius: RADIUS,
  fixed: { seal: 'deep', regime: 'clean' },
};
splash.impact(impact, water);
const cavity = splash.cavities[0];
const crown = splash.crowns.find((candidate) => !candidate.landing && !candidate.fan);

const out = {
  // The splash's clock starts a substep before the stone is where the impact
  // found it (src/cavity.js puts the impact state at its first path sample,
  // pathStep after the start), so first contact is at contactTime on it.
  case: { radius: RADIUS, speed: SPEED, pondDepth: POND_DEPTH, contactTime: round(cavity.pathStep, 6),
    note: "vertical entry at exactly 6.3 m/s; times on the splash's clock, first contact at contactTime" },
  stone: { t: [], depth: [], speed: [] },
  cavity: {
    surfaceTime: round(cavity.surfaceTime), widestTime: round(cavity.widestTime), widestMouth: round(cavity.mouthAt(cavity.widestTime)),
    pinchTime: round(cavity.pinchTime), pinchDepth: round(cavity.pinchDepth), stoneDepthAtPinch: round(cavity.stoneAt(cavity.pinchTime, {}).depth),
    closeTime: round(cavity.closeTime), t: [], mouth: [], lipHeight: [], holeDepth: [],
  },
  crown: { breakTime: round(crown.breakTime), endTime: round(crown.endTime), t: [], rimHeight: [], reach: [] },
  jet: { launchTime: null, startTime: null, tipSpeed: null, t: [], top: [], drops: jetDrops },
  ring: { r: GAUGES, t: [], eta: [], summary: [] },
};
for (let time = 0; time <= 0.6 + 1e-9; time += 0.001) {
  const stone = cavity.stoneAt(time, {});
  out.stone.t.push(round(time, 3));
  out.stone.depth.push(round(stone.depth));
  out.stone.speed.push(round(stone.speed, 4));
}

let column = null;
for (let frame = 0; frame < 2 * 60; frame++) {
  splash.setFrameSeconds(FRAME);
  for (let substep = 0; substep < SUBSTEPS; substep++) {
    record.time = splash.time + FRAME / SUBSTEPS;
    splash.update(FRAME / SUBSTEPS, water);
    const time = splash.time;
    if (!cavity.finished && splash.cavities.includes(cavity)) {
      cavity.updateGeometry(time);
      const lip = cavity.lipAt(cavity.age, {});
      out.cavity.t.push(round(cavity.age, 4));
      out.cavity.mouth.push(round(lip.mouth));
      out.cavity.lipHeight.push(round(lip.height));
      out.cavity.holeDepth.push(round(cavity.holeDepth));
    }
    if (splash.crowns.includes(crown)) {
      crown.updateGeometry(time);
      // The rim: the sheet's highest point, and its distance from the axis.
      let height = -Infinity, reach = 0;
      for (let vertex = 0; vertex < crown.positions.length / 3; vertex++) {
        if (crown.positions[vertex * 3 + 1] <= height) continue;
        height = crown.positions[vertex * 3 + 1];
        reach = Math.hypot(crown.positions[vertex * 3] - crown.centreX, crown.positions[vertex * 3 + 2] - crown.centreZ);
      }
      out.crown.t.push(round(time, 4));
      out.crown.rimHeight.push(round(height));
      out.crown.reach.push(round(reach));
    }
    if (!column && splash.columns.length > 0) {
      column = splash.columns[0];
      out.jet.launchTime = round(column.startTime);
    }
    if (column && splash.columns.includes(column)) {
      column.updateGeometry(time);
      out.jet.t.push(round(time, 4));
      out.jet.top.push(round(column.topHeight()));
      // The column's first water clears the still surface (src/slenderJet.js's top node): when, and how fast it rises then.
      if (out.jet.startTime === null && column.solver.count > 0 && column.topHeight() > 0) {
        out.jet.startTime = round(time);
        out.jet.tipSpeed = round(column.solver.velocityY[0], 4);
      }
    }
  }
  splash.prepareFrame();
}

// The ring: the rings' source with the simulation's damping, the solver's near-field splats with the solver's.
const besselJ0 = (argument) => {
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
const WAVENUMBER_STEP = 0.1;
const WAVENUMBERS = Array.from({ length: 2700 }, (_, index) => WAVENUMBER_STEP * (index + 0.5));
const waveOmega = WAVENUMBERS.map((wavenumber) => ringFrequency(wavenumber, POND_DEPTH));
const solverDamping = WAVENUMBERS.map((wavenumber) => DAMPING.base * Math.min((wavenumber * DAMPING.baseWavelength) / (2 * Math.PI), 1)
  + DAMPING.viscosity * wavenumber ** 2 + (wavenumber < (2 * Math.PI) / (6 * DAMPING.lowShare) ? DAMPING.low : 0));
const cleanDamping = WAVENUMBERS.map((wavenumber) => 2 * RING_DAMPING.viscosity * wavenumber ** 2);
const RING_STEP = 0.01;
const RING_SECONDS = 8;
// The ring source's splats (each group's, with its pair as two plain Gaussians of height) and the solver's near field, as one list.
const ringSplats = rings.sources.flatMap((source) => source.groups.flatMap((group) => {
  const own = [{ time: group.start, x: group.x, z: group.z, radius: group.sigma, rim: group.rim, height: group.height, velocity: group.velocity, ring: true }];
  if (!group.pair) return own;
  return own.concat([1, -1].map((side) => ({ time: group.start, x: group.x + side * group.pair.directionX * group.pair.offset, z: group.z + side * group.pair.directionZ * group.pair.offset,
    radius: group.pair.sigma, rim: 1, height: side * group.pair.height, velocity: 0, ring: true })));
}));
/** The ring's measures as tools/basilisk/rings.py takes them: the largest swing within 0.6 s, the highest crest, the period from the zero crossings either side of it and its wavelength by the dispersion. */
function ringMeasures(heights) {
  const span = Math.round(0.6 / RING_STEP);
  let swing = 0;
  for (let sample = 0; sample < heights.length; sample++) {
    let low = Infinity, high = -Infinity;
    for (let other = sample; other <= Math.min(sample + span, heights.length - 1); other++) { low = Math.min(low, heights[other]); high = Math.max(high, heights[other]); }
    swing = Math.max(swing, high - low);
  }
  let crest = 0;
  heights.forEach((height, sample) => { if (height > heights[crest]) crest = sample; });
  let before = crest, after = crest;
  while (before > 0 && heights[before] > 0) before--;
  while (after < heights.length - 1 && heights[after] > 0) after++;
  const omega = Math.PI / ((after - before) * RING_STEP);
  let wavenumber = omega * omega / GRAVITY;
  for (let step = 0; step < 60; step++) wavenumber = Math.max(wavenumber - (ringFrequency(wavenumber, POND_DEPTH) ** 2 - omega * omega) / (2 * ringFrequency(wavenumber, POND_DEPTH) * ringGroupSpeed(wavenumber, POND_DEPTH)), 0.5 * wavenumber);
  return { troughToCrest: round(swing, 7), crestTime: round(crest * RING_STEP, 3), wavelength: round(2 * Math.PI / wavenumber, 4) };
}
const samples = Math.round(RING_SECONDS / RING_STEP);
for (let sample = 0; sample < samples; sample++) out.ring.t.push(round(sample * RING_STEP, 3));
out.ring.pointSummary = [];
for (const around of [true, false])
for (const distance of GAUGES) {
  const heights = new Float64Array(samples);
  for (const splat of [...ringSplats, ...record.splats]) {
    if (splat.radius < 0.25 * RADIUS) continue;
    const sigma = splat.ring ? splat.radius : Math.max(splat.radius, (0.6 * 6) / 512);
    const rimSigma = sigma * Math.max(splat.rim, 1);
    const waveDamping = splat.ring ? cleanDamping : solverDamping;
    const offset = Math.hypot(distance + impact.x - splat.x, impact.z - splat.z);
    const fromEntry = Math.hypot(splat.x - impact.x, splat.z - impact.z);
    const weights = WAVENUMBERS.map((wavenumber) => {
      let shape = Math.exp(-0.5 * sigma * sigma * wavenumber * wavenumber);
      if (splat.rim > 1) shape -= Math.exp(-0.5 * rimSigma * rimSigma * wavenumber * wavenumber);
      const kernel = around ? besselJ0(wavenumber * distance) * besselJ0(wavenumber * fromEntry) : besselJ0(wavenumber * offset);
      return wavenumber * kernel * sigma * sigma * shape * WAVENUMBER_STEP;
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
  const summary = { r: distance, ...ringMeasures(heights) };
  if (around) {
    out.ring.eta.push(Array.from(heights, (height) => round(height, 7)));
    out.ring.summary.push(summary);
  }
  else out.ring.pointSummary.push(summary);
}

const file = process.argv[2];
if (file) writeFileSync(file, JSON.stringify(out));
else console.log(JSON.stringify(out));
const summary = {
  cavity: { ...out.cavity, t: undefined, mouth: undefined, lipHeight: undefined, holeDepth: undefined },
  crownPeak: (() => { const index = out.crown.rimHeight.indexOf(Math.max(...out.crown.rimHeight)); return { t: out.crown.t[index], height: out.crown.rimHeight[index], reach: out.crown.reach[index], breakTime: out.crown.breakTime, endTime: out.crown.endTime }; })(),
  jet: { startTime: out.jet.startTime, top: Math.max(...out.jet.top), drops: jetDrops.slice(0, 4) },
  ring: out.ring.summary,
  ringAtAPoint: out.ring.pointSummary,
};
console.error(JSON.stringify(summary, null, 1));
