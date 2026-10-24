// CPU probe of the Worthington jet: the slender-jet solver (src/slenderJet.js)
// against the physics it should reproduce, and the jet (src/jet.js) against
// the reference simulation (tools/basilisk), without a browser.
//
//   node tools/jet-probe.mjs [stoneRadius=0.03] [entrySpeed=6.3] [horizontalFraction=0]
//
// Checks, failing with exit code 1 if any fails:
//   - the solver, on columns of water 1 mm in radius without gravity:
//     a varicose wave grows at the slender-jet model's rate
//     sqrt(σ/(2ρa³)·x²(1 − x²)) (x = k·a; within GROWTH_TOLERANCE at x = 0.4
//     and 0.7, past the start-up transient, the column perturbed at rest);
//     a free end draws back at Taylor–Culick's sqrt(σ/(ρa)) (within
//     RETRACTION_TOLERANCE); a column perturbed at the most unstable
//     wavelength breaks into drops of 1.89 radii (Rayleigh: the water of one
//     wavelength; within DROP_TOLERANCE, the satellites between them under
//     a radius); and every one of these keeps its water to rounding;
//   - the jet of the given stone (by default the reference: a 3 cm stone
//     straight in at 6.3 m/s), run as the splash runs it (over the bowl the
//     stone's cavity leaves, src/cavity.js, a clean form, frames of 1/60 s in
//     substeps of 1/240 s): it is the same, drop for drop, when the frames
//     fall otherwise (1/30 s, and uneven ones), since the solver steps on
//     its own clock; for the reference it clears the surface, throws its
//     first drop and reaches its highest within REFERENCE's ranges of the
//     simulation's (results/comparison.md: 118 ms, drops of 2 to 6 mm from
//     120 ms on, the joined top 75 to 81 cm at 0.2 to 0.33 s, the highest tip
//     1.39 m), and no lump it throws is over LARGEST_DROP (a big stone's are
//     bigger: the air tears them in flight, src/splash.js);
//   - for the reference, the bigger stones of the sweep's table
//     (assets/jet/sweep.json: src/jet.js sweepGains), each one's clean jet
//     straight down against the simulated run the table took its gains from:
//     it clears the surface, throws its first drop and reaches its highest
//     within SWEPT's shares of the run's (tools/basilisk/jet-fit.mjs
//     measureJet, as tools/basilisk/sweep.py measures the run), its lumps
//     printed beside the run's drops;
//   - its cost: the solver's and the drawing's milliseconds per frame (mean
//     and worst), warm (after a few silent jets), printed; the mean under
//     COST_MOST;
//   - the surface seal (src/splash.js chooseSplash) against what was seen
//     (SEALS): Truscott & Techet's (2009) 5.7 cm billiard ball at 5.95 m/s
//     domes over, 1.1 to 1.3 sqrt(R/g) after impact, and its jet bursts
//     through; Worthington's (1908) roughened 1.5 cm marble dropped 15 cm
//     throws its jet with no seal, from 60 cm seals and "sometimes" bursts,
//     from 140 cm seals and its jet is trapped ("no rebounding jet");
//   - Worthington's rule, printed and checked loosely: his marble's jet from
//     15 cm rose "to a height which may be even greater than that from
//     which the sphere fell"; the app's reaches at least MARBLE_LEAST of
//     the drop height (its column, or the drops its needle breaks into,
//     flown with the splash's drag). It falls short of his rule: the launch
//     fitted to the 3 cm reference gives a small stone's jet too little
//     speed (noted in src/jet.js).
// It also prints the jet's timeline: when its water clears the surface and
// how fast, its top, its drops (count, sizes, the first few) and the water
// that fell back.
import { SlenderJet } from '../src/slenderJet.js';
import { JetColumn, CLEAN_FORM } from '../src/jet.js';
import { Cavity } from '../src/cavity.js';
import { chooseSplash, JET_COLLAPSE } from '../src/splash.js';
import { seededRandom } from '../src/spray.js';
import { measureJet } from './basilisk/jet-fit.mjs';
import SWEEP from '../assets/jet/sweep.js';

const stoneRadius = Number(process.argv[2] ?? 0.03);
const entrySpeed = Number(process.argv[3] ?? 6.3);
const horizontalFraction = Number(process.argv[4] ?? 0);
const isReference = process.argv.length <= 2;

const SURFACE_TENSION = 0.072, DENSITY = 1000;
const GROWTH_TOLERANCE = 0.08;
const RETRACTION_TOLERANCE = 0.03;
const DROP_TOLERANCE = 0.06;
const LARGEST_DROP = 0.012;          // m
const COST_MOST = 3;                 // ms per frame, the solver and the drawing, warm
const MARBLE = { radius: 0.0075, drop: 0.15 };   // Worthington's roughened marble and its fall
const MARBLE_LEAST = 0.5;            // its jet's water reaches at least this share of the drop height
// How far from the sweep's runs (assets/jet/sweep.json) the jets of its bigger stones may be: when they clear
// the surface and how high their water reaches against the joined column's highest, as shares of the
// simulation's. The lumps they throw up (as handed over, before the air tears them) are printed by water (half
// of it in bigger lumps) beside the simulation's drops, not checked: the app's column mostly falls back in
// pieces that land as they are, which the simulation's connectivity counts as drops.
const SWEPT = { emerges: [0.85, 1.25], highest: [0.6, 1.6] };
// The reference simulation's jet (tools/basilisk/results/comparison.md) and how far from it the app may be.
const REFERENCE = {
  emerges: [0.105, 0.16],            // s after entry: the simulation 118 ms
  firstDrop: [0.11, 0.2],            // s after entry: the simulation 120 ms
  firstDropRadius: [0.0005, 0.006],  // m: the simulation's first drops 2.4 and 3.7 mm
  highest: [0.6, 1.6],               // m: the joined top 75 to 81 cm, the highest tip 1.39 m
};
// The seal's observations (the header): a ball's radius and speed straight down, and what was seen.
const SEALS = [
  { name: "Truscott & Techet's billiard ball, 5.95 m/s", radius: 0.0286, speed: 5.95, seals: [0.5, 1], dome: [1.0, 1.4], trapped: [0, 0.25] },
  { name: "Worthington's marble from 15 cm", radius: 0.0075, speed: Math.sqrt(2 * 9.81 * 0.15), seals: [0, 0.2] },
  { name: "Worthington's marble from 60 cm", radius: 0.0075, speed: Math.sqrt(2 * 9.81 * 0.6), seals: [0.5, 1], trapped: [0.2, 0.7] },
  { name: "Worthington's marble from 140 cm", radius: 0.0075, speed: Math.sqrt(2 * 9.81 * 1.4), seals: [0.8, 1], trapped: [0.8, 1] },
];
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };
const millimetres = (metres) => (metres * 1000).toFixed(2);

// ---- the solver against the physics ------------------------------------------

/** A straight column along x, radius a0·(1 + amplitude·cos(k·s)), at rest, no gravity. */
function column(radius, wavenumber, wavelengths, amplitude, segmentsPerWave = 9) {
  const solver = new SlenderJet({ capacity: 4000, gravity: 0 });
  const wavelength = (2 * Math.PI) / wavenumber;
  const segments = Math.round(wavelengths * segmentsPerWave);
  const spacing = (wavelength * wavelengths) / segments;
  for (let node = 0; node <= segments; node++) solver.push(node * spacing, 0, 0, 0, 0, 0);
  for (let segment = 0; segment < segments; segment++) {
    const local = radius * (1 + amplitude * Math.cos(wavenumber * (segment + 0.5) * spacing));
    solver.volume[segment] = Math.PI * local * local * spacing;
  }
  return { solver, wavelength };
}
function run(solver, seconds) {
  let time = 0;
  while (time < seconds) {
    const step = Math.min(solver.stableStep(), seconds - time);
    solver.advance(step);
    time += step;
    solver.refine(time);
  }
}
/** The varicose amplitude over the column's middle two wavelengths (a share of its radius). */
function amplitude(solver, wavelength, radius) {
  solver.measure();
  const middle = 0.5 * (solver.positionX[0] + solver.positionX[solver.count - 1]);
  let least = Infinity, most = 0;
  for (let node = 0; node < solver.count - 1; node++) {
    if (solver.chainEnd[node]) continue;
    const centre = 0.5 * (solver.positionX[node] + solver.positionX[node + 1]);
    if (Math.abs(centre - middle) > wavelength) continue;
    least = Math.min(least, solver.segmentRadius[node]);
    most = Math.max(most, solver.segmentRadius[node]);
  }
  return (most - least) / (2 * radius);
}
const radius = 0.001;
for (const share of [0.4, 0.7]) {
  const { solver, wavelength } = column(radius, share / radius, 12, 0.002);
  const theory = Math.sqrt((SURFACE_TENSION / (2 * DENSITY * radius ** 3)) * share * share * (1 - share * share));
  const span = 2 / theory;
  run(solver, span);   // past the start-up transient (a perturbation at rest grows as cosh)
  const before = amplitude(solver, wavelength, radius);
  run(solver, span);
  const growth = Math.log(amplitude(solver, wavelength, radius) / before) / span;
  console.log(`Rayleigh–Plateau at k·a = ${share}: grows at ${growth.toFixed(1)} /s, the model's ${theory.toFixed(1)} /s`);
  check(Math.abs(growth / theory - 1) <= GROWTH_TOLERANCE, `growth at k·a = ${share}: ${growth.toFixed(1)} /s against ${theory.toFixed(1)}`);
}
{
  const solver = new SlenderJet({ capacity: 4000, gravity: 0 });
  const spacing = 1.2 * radius, segments = 400;
  for (let node = 0; node <= segments; node++) solver.push(node * spacing, 0, 0, 0, 0, 0);
  for (let segment = 0; segment < segments; segment++) solver.volume[segment] = Math.PI * radius * radius * spacing;
  run(solver, 0.06);
  const early = solver.positionX[0];
  run(solver, 0.06);
  const speed = (solver.positionX[0] - early) / 0.06;
  const theory = Math.sqrt(SURFACE_TENSION / (DENSITY * radius));
  console.log(`Taylor–Culick: the free end draws back at ${speed.toFixed(3)} m/s, sqrt(σ/ρa) ${theory.toFixed(3)} m/s, its bulb ${millimetres(solver.beadRadius(0))} mm`);
  check(Math.abs(speed / theory - 1) <= RETRACTION_TOLERANCE, `Taylor–Culick: ${speed.toFixed(3)} m/s against ${theory.toFixed(3)}`);
}
for (const segmentsPerWave of [9, 4]) {
  const { solver } = column(radius, 0.7 / radius, 16, 0.01, segmentsPerWave);
  const water = solver.water();
  run(solver, 0.25);
  const drops = solver.events.filter((event) => event.kind === 'drop');
  const sizes = drops.map((drop) => drop.radius / radius).sort((first, second) => second - first);
  // The main drops: past the two bulbs the ends gathered, those over a radius.
  const main = sizes.slice(2).filter((size) => size > 1);
  const kept = (solver.water() + drops.reduce((sum, drop) => sum + drop.volume, 0)) / water - 1;
  const mean = main.reduce((sum, size) => sum + size, 0) / Math.max(main.length, 1);
  console.log(`breakup (${segmentsPerWave} segments a wavelength): ${main.length} main drops of ${mean.toFixed(2)} radii (Rayleigh 1.89), satellites ${sizes.filter((size) => size < 1).slice(0, 4).map((size) => size.toFixed(2)).join(' ')}; water kept to ${kept.toExponential(1)}`);
  check(main.length >= 10 && Math.abs(mean / 1.89 - 1) <= DROP_TOLERANCE, `breakup at ${segmentsPerWave} segments a wavelength: main drops ${mean.toFixed(2)} radii`);
  check(Math.abs(kept) < 1e-9, `breakup: water off by ${kept}`);
}

// ---- the jet ----------------------------------------------------------------

// As SplashSystem.impact: JET_COLLAPSE, JET_OBLIQUE_SLOWING, NEEDLE_OBLIQUE, JET_LEAN.
const needle = 1 + (CLEAN_FORM.needle - 1) * (1 - 0.9 * horizontalFraction);
const lean = Math.min(0.4 * Math.asin(horizontalFraction), (18 * Math.PI) / 180);
const sinking = entrySpeed * Math.sqrt(1 - horizontalFraction ** 2);
const cavity = new Cavity({
  impact: { x: 0, z: -1.4, height: stoneRadius, speed: entrySpeed, velocity: { x: 0, y: -sinking, z: -entrySpeed * horizontalFraction }, radius: stoneRadius },
  startTime: 0, drawn: false, lean,
});
const pinch = cavity.pinchTime;
const speed = JET_COLLAPSE * Math.sqrt(9.81 * cavity.pinchDepth) * (1 - 0.3 * horizontalFraction);
const launch = { floor: (age, out) => cavity.bowlFloorAt(cavity.pinchTime + age, out), bowlUnit: cavity.bowlUnit, volume: 0.25 * cavity.bowlVolume };
const parkMiller = (seed) => { let state = seed; return () => { state = (state * 16807) % 2147483647; return state / 2147483647; }; };
const makeJet = () => new JetColumn({ x: 0, z: -1.4, radius: stoneRadius, speed, startTime: 0, material: null, lean, leanX: 0, leanZ: 1, ...launch, form: { ...CLEAN_FORM, needle }, random: parkMiller(12345) });
/** The apex a drop reaches from (y, velocity), flown with the splash's own drag and substep (src/splash.js update). */
function dropApex(y, velocityX, velocityY, velocityZ, dropRadius) {
  const step = 1 / 240;
  let highest = y;
  while (velocityY > 0) {
    const drag = Math.min((0.00027 / dropRadius) * Math.hypot(velocityX, velocityY, velocityZ) * step, 0.5);
    velocityX -= velocityX * drag; velocityY -= velocityY * drag; velocityZ -= velocityZ * drag;
    velocityY -= 9.81 * step;
    y += velocityY * step;
    highest = Math.max(highest, y);
  }
  return highest;
}

/** Run a jet to its end with the given frames (seconds each, cycled), substeps of a quarter frame; what it did. */
function runJet(frames, timed = false) {
  const jet = makeJet();
  const drops = [];
  const splash = { time: 0, frameSeconds: frames[0], spray: null, spawnDroplet: (x, y, z, vx, vy, vz, dropRadius) => drops.push({ time: splash.time, x, y, z, vx, vy, vz, radius: dropRadius }), spawnFoamSpecks() {} };
  const water = { addSplat() {}, addFoam() {} };
  const record = { jet, drops, emerged: null, emergeSpeed: 0, top: 0, update: [], geometry: [] };
  let time = 0;
  for (let frame = 0; !jet.finished && time < 4; frame++) {
    const seconds = frames[frame % frames.length];
    splash.frameSeconds = seconds;
    let started = performance.now();
    for (let substep = 0; substep < 4; substep++) {
      time += seconds / 4;
      splash.time = time;
      jet.update(time, seconds / 4, splash, water);
    }
    const updated = performance.now();
    if (!jet.finished) jet.updateGeometry(time);
    const drawn = performance.now();
    if (timed) { record.update.push(updated - started); record.geometry.push(drawn - updated); }
    const top = jet.solver.count > 0 ? jet.topHeight() : -Infinity;
    record.top = Math.max(record.top, top);
    if (record.emerged === null && top > 0) { record.emerged = time + pinch; record.emergeSpeed = jet.solver.velocityY[0]; }
    started = drawn;
  }
  return record;
}
for (let warmUp = 0; warmUp < 3; warmUp++) runJet([1 / 60]);
const steady = runJet([1 / 60], true);
const halting = runJet([1 / 30]);
const uneven = runJet([1 / 60, 1 / 45, 1 / 120, 1 / 50]);
// The same jet whatever the frames: its drops' radii (each frame pattern hands them over carried on to its own time).
const sameDrops = (first, second) => first.drops.length === second.drops.length && first.drops.every((drop, index) => Math.abs(drop.radius - second.drops[index].radius) < 1e-12);
check(sameDrops(steady, halting), `frames of 1/30 s change the jet: ${halting.drops.length} drops against ${steady.drops.length}`);
check(sameDrops(steady, uneven), `uneven frames change the jet: ${uneven.drops.length} drops against ${steady.drops.length}`);

const { jet, drops } = steady;
const big = drops.filter((drop) => drop.radius >= 0.002);
const thrown = drops.filter((drop) => drop.vy > 0);
const firstDrop = thrown.find((drop) => drop.radius >= 0.001) ?? thrown[0];
const largest = drops.reduce((most, drop) => Math.max(most, drop.radius), 0);
const highest = Math.max(steady.top, jet.highest);
console.log(`\nstone ${millimetres(stoneRadius)} mm at ${entrySpeed} m/s${horizontalFraction > 0 ? ` (horizontal fraction ${horizontalFraction}, lean ${((lean * 180) / Math.PI).toFixed(1)}°)` : ''}: body ${speed.toFixed(2)} m/s, needle ${jet.tipSpeed.toFixed(2)} m/s, ` +
  `pinch ${(pinch * 1000).toFixed(0)} ms after entry, ${(cavity.pinchDepth * 1000).toFixed(0)} mm down, launch over ${(jet.launchEnd * 1000).toFixed(0)} ms, Rj ${millimetres(jet.columnRadius)} mm`);
console.log(`  clears the surface ${steady.emerged === null ? 'never' : `${(steady.emerged * 1000).toFixed(0)} ms after entry, rising ${steady.emergeSpeed.toFixed(1)} m/s`}; its water reaches ${(highest * 100).toFixed(1)} cm; gone ${((jet.age + pinch) * 1000).toFixed(0)} ms after entry`);
console.log(`  drops: ${drops.length}, ${big.length} of 2 mm and more, the largest ${millimetres(largest)} mm; the first thrown up ${firstDrop ? `${((firstDrop.time + pinch) * 1000).toFixed(0)} ms after entry, ${millimetres(firstDrop.radius)} mm, ${Math.hypot(firstDrop.vx, firstDrop.vy, firstDrop.vz).toFixed(1)} m/s, ${(firstDrop.y * 100).toFixed(1)} cm up` : 'none'}`);
console.log(`  the first ten thrown up (ms after entry / radius mm / height cm / speed m/s): ${thrown.slice(0, 10).map((drop) => `${((drop.time + pinch) * 1000).toFixed(0)}/${millimetres(drop.radius)}/${(drop.y * 100).toFixed(0)}/${Math.hypot(drop.vx, drop.vy, drop.vz).toFixed(1)}`).join('  ')}`);
console.log(`  water: launched ${((jet.volume(0, jet.launchEnd) + jet.baseWater) * 1e6).toFixed(0)} ml (the sleeve's ${(jet.baseWater * 1e6).toFixed(0)}), fell back ${(jet.solver.fallen * 1e6).toFixed(0)} ml, in drops ${(drops.reduce((sum, drop) => sum + (4 / 3) * Math.PI * drop.radius ** 3, 0) * 1e6).toFixed(0)} ml`);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const updateMean = mean(steady.update), geometryMean = mean(steady.geometry);
const worst = Math.max(...steady.update.map((value, index) => value + steady.geometry[index]));
console.log(`  CPU, warm: ${updateMean.toFixed(2)} ms per frame stepping, ${geometryMean.toFixed(2)} drawing, the worst frame ${worst.toFixed(1)} ms`);
if (isReference) check(largest <= LARGEST_DROP, `a drop of ${millimetres(largest)} mm, over ${millimetres(LARGEST_DROP)}`);
check(updateMean + geometryMean <= COST_MOST, `the jet costs ${(updateMean + geometryMean).toFixed(2)} ms a frame, over ${COST_MOST}`);
if (isReference) {
  const within = (value, [low, high]) => value !== null && value !== undefined && value >= low && value <= high;
  check(within(steady.emerged, REFERENCE.emerges), `the jet clears the surface ${steady.emerged} s after entry, outside ${REFERENCE.emerges}`);
  check(firstDrop && within(firstDrop.time + pinch, REFERENCE.firstDrop), `the first drop ${firstDrop ? firstDrop.time + pinch : 'never'} s after entry, outside ${REFERENCE.firstDrop}`);
  check(firstDrop && within(firstDrop.radius, REFERENCE.firstDropRadius), `the first drop ${firstDrop ? millimetres(firstDrop.radius) : '-'} mm, outside ${REFERENCE.firstDropRadius}`);
  check(within(highest, REFERENCE.highest), `the jet's water reaches ${highest.toFixed(2)} m, outside ${REFERENCE.highest}`);
}
// ---- the sweep's stones -------------------------------------------------------
// Every size the sweep's table holds above the reference (src/jet.js
// sweepGains), its clean jet straight down at its run's speed against that
// run (assets/jet/sweep.json, tools/basilisk/sweep.py).
if (isReference) {
  const within = (value, low, high) => value !== null && value !== undefined && value >= low && value <= high;
  for (const size of SWEEP.table.filter((row) => row.run)) {
    const run = SWEEP.runs.find((candidate) => candidate.name === size.run);
    const sim = { emerges: run.jet.emerges, drop: run.drops.radius_by_water_p50, top: run.jet.top };
    const app = measureJet(size.radius, run.speed, null, CLEAN_FORM, run.depth);
    const drop = app.drops.byWaterP50;
    console.log(`\nthe sweep's ${(size.radius * 200).toFixed(0)} cm stone at ${run.speed} m/s (${run.name}; gains column ${size.column.toFixed(2)}, thread ${size.thread.toFixed(2)}, needle ${size.needle.toFixed(2)}): ` +
      `clears the surface ${(app.emerges * 1000).toFixed(0)} ms after entry (the simulation ${(sim.emerges * 1000).toFixed(0)}), its lumps by water ${drop === null ? '-' : millimetres(drop)} mm (${millimetres(sim.drop)}), ` +
      `its water reaches ${app.highest.toFixed(2)} m (the joined column ${sim.top.toFixed(2)})`);
    check(within(app.emerges, SWEPT.emerges[0] * sim.emerges, SWEPT.emerges[1] * sim.emerges), `the ${size.run} jet clears the surface ${app.emerges} s after entry, the simulation's ${sim.emerges}`);
    check(within(app.highest, SWEPT.highest[0] * sim.top, SWEPT.highest[1] * sim.top), `the ${size.run} jet's water reaches ${app.highest.toFixed(2)} m, the simulation's column ${sim.top.toFixed(2)}`);
  }
}

// ---- Worthington's marble ----------------------------------------------------
{
  const marbleSpeed = Math.sqrt(2 * 9.81 * MARBLE.drop);
  const marbleCavity = new Cavity({ impact: { x: 0, z: -1.4, height: MARBLE.radius, speed: marbleSpeed, velocity: { x: 0, y: -marbleSpeed, z: 0 }, radius: MARBLE.radius }, startTime: 0, drawn: false, lean: 0 });
  const marbleJet = new JetColumn({
    x: 0, z: -1.4, radius: MARBLE.radius, speed: JET_COLLAPSE * Math.sqrt(9.81 * marbleCavity.pinchDepth), startTime: 0, material: null,
    floor: (age, out) => marbleCavity.bowlFloorAt(marbleCavity.pinchTime + age, out), bowlUnit: marbleCavity.bowlUnit, volume: 0.25 * marbleCavity.bowlVolume, form: { ...CLEAN_FORM }, random: parkMiller(777),
  });
  let highestDrop = 0, columnTop = 0;
  const marbleSplash = { time: 0, frameSeconds: 1 / 60, spray: null, spawnDroplet: (x, y, z, vx, vy, vz, dropRadius) => { highestDrop = Math.max(highestDrop, dropApex(y, vx, vy, vz, dropRadius)); }, spawnFoamSpecks() {} };
  for (let tick = 1; !marbleJet.finished && tick < 480; tick++) {
    marbleSplash.time = tick / 240;
    marbleJet.update(tick / 240, 1 / 240, marbleSplash, { addSplat() {}, addFoam() {} });
    if (marbleJet.solver.count > 0) columnTop = Math.max(columnTop, marbleJet.topHeight());
  }
  const reached = Math.max(columnTop, highestDrop);
  console.log(`\nWorthington's marble dropped ${(MARBLE.drop * 100).toFixed(0)} cm: its column reaches ${(columnTop * 100).toFixed(1)} cm, its drops ${(highestDrop * 100).toFixed(1)} cm (his jet: the drop height or more)`);
  check(reached >= MARBLE_LEAST * MARBLE.drop, `Worthington's marble: the jet reaches ${(reached * 100).toFixed(1)} cm, under ${(MARBLE_LEAST * MARBLE.drop * 100).toFixed(0)}`);
}

// ---- the seal against what was seen ------------------------------------------
console.log('');
for (const seen of SEALS) {
  const info = {
    radius: seen.radius, speed: seen.speed, velocity: { x: 0, y: -seen.speed, z: 0 },
    shape: { elongation: 0, flatness: 0, irregularity: 0.04 }, contact: { kind: 'point', faceAngle: 45, pointAngle: 45, bluntness: 1 }, spin: { ratio: 0, alongEntry: 1, axis: { x: 0, y: 1, z: 0 } },
  };
  const choice = chooseSplash(info, seededRandom(1, seen.radius), null);
  const within = (value, [low, high]) => value >= low && value <= high;
  const sealed = choice.seal.kind === 'surface';
  console.log(`${seen.name} (F = ${(seen.speed ** 2 / (9.81 * seen.radius)).toFixed(0)}): seals ${(100 * choice.surfaceChance).toFixed(0)}%` + (sealed ? `, the dome ${choice.seal.dome.toFixed(2)} sqrt(R/g) after impact (${(choice.seal.dome / choice.seal.pinch).toFixed(2)} of the pinch), the jet trapped ${(100 * choice.trappedChance).toFixed(0)}%` : ''));
  check(within(choice.surfaceChance, seen.seals), `${seen.name}: seals ${(100 * choice.surfaceChance).toFixed(0)}%, outside ${seen.seals.map((share) => `${100 * share}%`).join(' to ')}`);
  if (seen.dome) check(sealed && within(choice.seal.dome, seen.dome), `${seen.name}: the dome ${sealed ? choice.seal.dome.toFixed(2) : 'never'} sqrt(R/g) after impact, outside ${seen.dome}`);
  if (seen.trapped) check(sealed && within(choice.trappedChance, seen.trapped), `${seen.name}: the jet trapped ${sealed ? (100 * choice.trappedChance).toFixed(0) : '-'}%, outside ${seen.trapped.map((share) => `${100 * share}%`).join(' to ')}`);
}
console.log(failures.length === 0 ? '\njet-probe: all checks pass' : `\njet-probe: ${failures.length} checks fail:\n  ${failures.join('\n  ')}`);
process.exitCode = failures.length === 0 ? 0 : 1;
