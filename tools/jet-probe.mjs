// CPU probe of the Worthington jet (src/jet.js), without a browser.
//
// Runs one JetColumn with stand-ins for the splash and the water, substeps of
// 1/240 s and a geometry evaluation every 1/60 s, and prints its timeline
// (tip pinches, breakup, fall-back), the drops it made, the volume accounting,
// whether the grid normals face outward, and the CPU cost per frame (after a
// few silent jets, so the code is warm).
//
//   node tools/jet-probe.mjs [stoneRadius=0.03] [entrySpeed=6.3]
import { JetColumn } from '../src/jet.js';

const stoneRadius = Number(process.argv[2] ?? 0.03);
const entrySpeed = Number(process.argv[3] ?? 6.3);
const sizeFactor = stoneRadius / 0.03;
const tipSpeed = Math.min(Math.max(0.42 * entrySpeed + 0.7, 1.2), 6.0) * sizeFactor ** 0.15;
const budget = Math.round(Math.min(Math.max(220 * sizeFactor ** 1.3, 80), 1200));
const pinchDelay = 2.1 * Math.sqrt(stoneRadius / 9.81);

const drops = [];
const splash = { spawnDroplet: (x, y, z, vx, vy, vz, radius) => drops.push({ time: clock, x, y, z, vx, vy, vz, radius }) };
const splats = [];
const water = { addSplat: (splat) => splats.push({ time: clock, kind: 'splat', ...splat }), addFoam: (foam) => splats.push({ time: clock, kind: 'foam', ...foam }) };

let clock = 0;
for (let warmUp = 0; warmUp < 5; warmUp++) {
  const quiet = new JetColumn({ x: 0, z: -1.4, radius: stoneRadius, tipSpeed, startTime: 0, budget, material: null });
  const nowhere = { spawnDroplet() {}, addSplat() {}, addFoam() {} };
  for (let tick = 1; !quiet.finished && tick < 480; tick++) {
    quiet.update(tick / 240, 1 / 240, nowhere, nowhere);
    if (tick % 4 === 0) quiet.updateGeometry(tick / 240);
  }
}
const jet = new JetColumn({ x: 0, z: -1.4, radius: stoneRadius, tipSpeed, startTime: 0, budget, material: null });
const totalVolume = jet.volume(0, jet.launchEnd);
const substep = 1 / 240;
let frameSeconds = 0;
let geometryMilliseconds = 0;
let geometryCalls = 0;
let updateMilliseconds = 0;
let updateCalls = 0;
let lastPhase = jet.phase;
let lastTipDrops = 0;
let worstInward = 0;
const millimetres = (metres) => (metres * 1000).toFixed(1);
console.log(`stone ${millimetres(stoneRadius)} mm at ${entrySpeed} m/s: tip speed ${tipSpeed.toFixed(2)} m/s, T ${(jet.launchDuration * 1000).toFixed(0)} ms, ` +
  `first bulb ${millimetres(jet.firstBulbRadius)} mm, jet volume ${(totalVolume * 1e6).toFixed(1)} ml, budget ${budget} drops, jet starts ${(pinchDelay * 1000).toFixed(0)} ms after entry`);

while (!jet.finished && clock < 2) {
  clock += substep;
  let started = performance.now();
  jet.update(clock, substep, splash, water);
  updateMilliseconds += performance.now() - started;
  updateCalls++;
  if (jet.tipDrops !== lastTipDrops) {
    const drop = drops.filter((candidate) => candidate.radius > 0.002).at(-1);
    console.log(`  ${(clock * 1000).toFixed(0)} ms (${((clock + pinchDelay) * 1000).toFixed(0)} after entry): tip drop ${jet.tipDrops}, radius ${millimetres(drop.radius)} mm at ${millimetres(drop.y)} mm high, rising ${drop.vy.toFixed(2)} m/s`);
    lastTipDrops = jet.tipDrops;
  }
  if (jet.phase !== lastPhase) {
    console.log(`  ${(clock * 1000).toFixed(0)} ms (${((clock + pinchDelay) * 1000).toFixed(0)} after entry): breakup starts at tau ${(jet.endTau / jet.launchDuration).toFixed(2)} T, foot at ${(jet.footTau() / jet.launchDuration).toFixed(2)} T`);
    lastPhase = jet.phase;
  }
  frameSeconds += substep;
  if (frameSeconds >= 1 / 60 - 1e-9 && !jet.finished) {
    frameSeconds = 0;
    started = performance.now();
    jet.updateGeometry(clock);
    geometryMilliseconds += performance.now() - started;
    geometryCalls++;
    // Normals of the rings below the cap must point away from the ring's centre.
    const columns = 24;
    const rows = jet.positions.length / 3 / columns;
    for (let row = 7; row < rows - 1; row++) {
      let centreX = 0, centreY = 0, centreZ = 0;
      for (let column = 0; column < columns; column++) {
        const vertex = (row * columns + column) * 3;
        centreX += jet.positions[vertex] / columns; centreY += jet.positions[vertex + 1] / columns; centreZ += jet.positions[vertex + 2] / columns;
      }
      for (let column = 0; column < columns; column++) {
        const vertex = (row * columns + column) * 3;
        const outX = jet.positions[vertex] - centreX, outY = jet.positions[vertex + 1] - centreY, outZ = jet.positions[vertex + 2] - centreZ;
        const outLength = Math.hypot(outX, outY, outZ);
        if (outLength < 1e-6) continue;
        const facing = (outX * jet.normals[vertex] + outY * jet.normals[vertex + 1] + outZ * jet.normals[vertex + 2]) / outLength;
        worstInward = Math.min(worstInward, facing);
      }
    }
    if (geometryCalls % 6 === 0) {
      const top = jet.positions[1];
      const footY = jet.positions[((rows - 1) * columns) * 3 + 1];
      let widest = 0;
      for (let row = 6; row < rows; row++) widest = Math.max(widest, Math.hypot(jet.positions[(row * columns) * 3] - jet.positions[(row * columns + 12) * 3], jet.positions[(row * columns) * 3 + 2] - jet.positions[(row * columns + 12) * 3 + 2]) / 2);
      const middle = jet.evaluate(0.5 * (jet.endTau + jet.footTau()), jet.state);
      console.log(`    ${(clock * 1000).toFixed(0)} ms: top ${millimetres(top)} mm, foot ${millimetres(footY)} mm, cap ${millimetres(jet.end.radius)} mm, mid-column radius ${millimetres(middle.radius)} mm, widest ring ${millimetres(widest)} mm, drops so far ${drops.length}`);
    }
  }
}
const volumeOf = (radius) => (4 / 3) * Math.PI * radius ** 3;
const dropVolume = drops.reduce((sum, drop) => sum + volumeOf(drop.radius), 0);
const fallen = jet.volume(jet.footTau(), jet.launchEnd);
const big = drops.filter((drop) => drop.radius > 0.002);
console.log(`  ${(clock * 1000).toFixed(0)} ms (${((clock + pinchDelay) * 1000).toFixed(0)} after entry): column gone`);
console.log(`drops: ${drops.length} (${big.length} over 2 mm), radii ${big.map((drop) => millimetres(drop.radius)).join(' ')}`);
console.log(`volume: drops ${(dropVolume * 1e6).toFixed(1)} ml + fallen back about ${(fallen * 1e6).toFixed(1)} ml of ${(totalVolume * 1e6).toFixed(1)} ml launched`);
console.log(`water: ${splats.map((splat) => `${splat.kind} r ${millimetres(splat.radius)} mm${splat.height ? ` h ${millimetres(splat.height)} mm` : ''}${splat.velocity ? ` v ${splat.velocity.toFixed(2)}` : ''}${splat.amount ? ` amount ${splat.amount.toFixed(2)}` : ''}`).join('; ')}`);
console.log(`normals: worst outward cosine ${worstInward.toFixed(3)} (negative means some point inward)`);
console.log(`CPU: ${(geometryMilliseconds / Math.max(geometryCalls, 1) * 1000).toFixed(0)} µs per frame for the geometry over ${geometryCalls} frames, ${(updateMilliseconds / updateCalls * 1000).toFixed(1)} µs per substep update`);
