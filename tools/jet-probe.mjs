// CPU probe of the Worthington jet (src/jet.js), without a browser.
//
// Runs one JetColumn of the default (clean) form over the bowl the stone's
// cavity leaves (src/cavity.js, a deep seal for a stone dropped straight in,
// or thrown with the given horizontal fraction), with stand-ins for the
// splash and the water, substeps of 1/240 s and a geometry evaluation every
// 1/60 s, and prints its timeline (the needle clearing the surface, tip
// pinches, breakup, fall-back), the drops it made, the volume accounting,
// whether the grid normals face outward, and the CPU cost per frame (after a
// few silent jets, so the code is warm).
//
//   node tools/jet-probe.mjs [stoneRadius=0.03] [entrySpeed=6.3] [profileSecondsAfterEntry=0.3] [horizontalFraction=0]
//
// A horizontal fraction of the entry speed makes the jet of an oblique entry,
// as SplashSystem.impact does: its body slower by 0.3 times it, its needle's
// extra speed lower by 0.9 times it, and leaning back (here towards +z, the
// stone having travelled towards −z) by 0.4 of the entry angle, at most 18°;
// the lean line says where its top and its drops went.
//
// The profile line gives the column's diameter where it leaves the water and
// up it, at the given time after the stone's entry. The landing lines fly the
// drops of 3.5 mm and more (LANDING_CROWN_RADIUS in src/splash.js: the ones that throw a crown where they land) with
// the splash's own drag and substeps, and say when and how fast they reach
// the water.
import { JetColumn } from '../src/jet.js';
import { Cavity } from '../src/cavity.js';

const stoneRadius = Number(process.argv[2] ?? 0.03);
const entrySpeed = Number(process.argv[3] ?? 6.3);
const profileAfterEntry = Number(process.argv[4] ?? 0.3);
const horizontalFraction = Number(process.argv[5] ?? 0);
const sizeFactor = stoneRadius / 0.03;
// As SplashSystem.impact: JET_SPEED, JET_OBLIQUE_SLOWING, NEEDLE_OBLIQUE.
const speed = Math.min(Math.max(0.75 * entrySpeed, 1.5), 8.0) * sizeFactor ** 0.15 * (1 - 0.3 * horizontalFraction);
const needle = 1 + (3.0 - 1) * (1 - 0.9 * horizontalFraction);
const lean = Math.min(0.4 * Math.asin(horizontalFraction), (18 * Math.PI) / 180);
const leaning = { lean, leanX: 0, leanZ: 1 };
const budget = Math.round(Math.min(Math.max(220 * sizeFactor ** 1.3, 80), 1200));
// The cavity's bowl: a deep seal, its nominal timing.
const sinking = entrySpeed * Math.sqrt(1 - horizontalFraction ** 2);
const cavity = new Cavity({
  impact: { x: 0, z: -1.4, height: stoneRadius, speed: entrySpeed, velocity: { x: 0, y: -sinking, z: -entrySpeed * horizontalFraction }, radius: stoneRadius },
  startTime: 0, drawn: false, lean,
});
const pinchDelay = cavity.pinchTime;   // the jet starts at the pinch-off
// As SplashSystem.impact: the jet carries JET_SHARE (0.25) of the water that fills the bowl.
const bowl = { floor: (age, out) => cavity.bowlFloorAt(cavity.pinchTime + age, out), bowlUnit: cavity.bowlUnit, volume: 0.25 * cavity.bowlVolume };
const form = { needle };

const drops = [];
const splash = {
  frameSeconds: 1 / 60,
  spawnDroplet: (x, y, z, vx, vy, vz, radius) => drops.push({ time: clock, x, y, z, vx, vy, vz, radius }),
  spawnFoamSpecks: (x, z, innerRadius, outerRadius, count) => splats.push({ time: clock, kind: 'specks', radius: outerRadius, count }),
};
const splats = [];
const water = { addSplat: (splat) => splats.push({ time: clock, kind: 'splat', ...splat }), addFoam: (foam) => splats.push({ time: clock, kind: 'foam', ...foam }) };

let clock = 0;
for (let warmUp = 0; warmUp < 5; warmUp++) {
  const quiet = new JetColumn({ x: 0, z: -1.4, radius: stoneRadius, speed, startTime: 0, budget, material: null, ...leaning, ...bowl, form });
  const nowhere = { frameSeconds: 1 / 60, spawnDroplet() {}, spawnFoamSpecks() {}, addSplat() {}, addFoam() {} };
  for (let tick = 1; !quiet.finished && tick < 480; tick++) {
    quiet.update(tick / 240, 1 / 240, nowhere, nowhere);
    if (tick % 4 === 0) quiet.updateGeometry(tick / 240);
  }
}
const jet = new JetColumn({ x: 0, z: -1.4, radius: stoneRadius, speed, startTime: 0, budget, material: null, ...leaning, ...bowl, form });
const totalVolume = jet.volume(0, jet.launchEnd);
const substep = 1 / 240;
let frameSeconds = 0;
let geometryMilliseconds = 0;
let geometryCalls = 0;
let updateMilliseconds = 0;
let updateCalls = 0;
let lastPhase = jet.phase;
let profiled = false;
let lastTipDrops = 0;
let worstInward = 0;
const millimetres = (metres) => (metres * 1000).toFixed(1);
console.log(`stone ${millimetres(stoneRadius)} mm at ${entrySpeed} m/s${horizontalFraction > 0 ? ` (horizontal fraction ${horizontalFraction}, lean ${(lean * 180 / Math.PI).toFixed(1)}°)` : ''}: body ${speed.toFixed(2)} m/s, needle ${jet.tipSpeed.toFixed(2)} m/s, ` +
  `pinch ${(cavity.pinchDepth * 1000).toFixed(0)} mm down, T ${(jet.launchDuration * 1000).toFixed(0)} ms of ${(jet.launchEnd * 1000).toFixed(0)} ms, ` +
  `first bulb ${millimetres(jet.firstBulbRadius)} mm, jet volume ${(totalVolume * 1e6).toFixed(1)} ml, budget ${budget} drops, jet starts ${(pinchDelay * 1000).toFixed(0)} ms after entry`);
let emerged = false;

while (!jet.finished && clock < 2) {
  clock += substep;
  const dropsBeforeUpdate = drops.length;
  let started = performance.now();
  jet.update(clock, substep, splash, water);
  updateMilliseconds += performance.now() - started;
  updateCalls++;
  if (!emerged && jet.heightAt(0) > 0) {
    emerged = true;
    console.log(`  ${(clock * 1000).toFixed(0)} ms (${((clock + pinchDelay) * 1000).toFixed(0)} after entry): the needle clears the surface at ${jet.evaluate(0, jet.state).vy.toFixed(2)} m/s`);
  }
  if (jet.tipDrops !== lastTipDrops) {
    // The tip drop is the largest of those this pinch made (the rest are the neck's spray).
    const drop = drops.slice(dropsBeforeUpdate).reduce((largest, candidate) => (candidate.radius > largest.radius ? candidate : largest));
    console.log(`  ${(clock * 1000).toFixed(0)} ms (${((clock + pinchDelay) * 1000).toFixed(0)} after entry): tip drop ${jet.tipDrops}, radius ${millimetres(drop.radius)} mm at ${millimetres(drop.y)} mm high, rising ${drop.vy.toFixed(2)} m/s`);
    lastTipDrops = jet.tipDrops;
  }
  if (jet.phase !== lastPhase) {
    console.log(`  ${(clock * 1000).toFixed(0)} ms (${((clock + pinchDelay) * 1000).toFixed(0)} after entry): breakup starts at tau ${(jet.endTau / jet.launchDuration).toFixed(2)} T, foot at ${(jet.footTau() / jet.launchDuration).toFixed(2)} T`);
    lastPhase = jet.phase;
  }
  if (!profiled && clock + pinchDelay >= profileAfterEntry - 1e-9) {
    profiled = true;
    jet.updateGeometry(clock);
    const columns = 24;
    const rows = jet.positions.length / 3 / columns;
    const rings = [];
    for (let row = 6; row < rows; row++) {
      const first = (row * columns) * 3, opposite = (row * columns + columns / 2) * 3;
      rings.push({
        y: 0.5 * (jet.positions[first + 1] + jet.positions[opposite + 1]),
        diameter: Math.hypot(jet.positions[first] - jet.positions[opposite], jet.positions[first + 1] - jet.positions[opposite + 1], jet.positions[first + 2] - jet.positions[opposite + 2]),
      });
    }
    const top = jet.positions[1];
    if (lean > 0) console.log(`  lean ${(clock + pinchDelay).toFixed(3)} s after entry: top ${millimetres(jet.positions[2] + 1.4)} mm back from the collapse point, ${(Math.atan2(jet.positions[2] + 1.4, top) * 180 / Math.PI).toFixed(1)}° from vertical`);
    // Rings run from the cap down to the foot; interpolate the diameter at a height.
    const diameterAt = (height) => {
      for (let index = 1; index < rings.length; index++) {
        const upper = rings[index - 1], lower = rings[index];
        if (lower.y <= height && upper.y >= height) return lower.diameter + (upper.diameter - lower.diameter) * (height - lower.y) / Math.max(upper.y - lower.y, 1e-9);
      }
      return NaN;
    };
    console.log(`  profile ${(clock + pinchDelay).toFixed(3)} s after entry: top ${millimetres(top)} mm, diameter ${millimetres(diameterAt(0))} mm at the water, ${millimetres(diameterAt(0.05))} mm 5 cm up, ${millimetres(diameterAt(0.5 * top))} mm at mid-height, ${millimetres(diameterAt(0.85 * top))} mm under the bulb, bulb ${millimetres(2 * jet.end.radius)} mm`);
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
console.log(`water: ${splats.map((splat) => `${splat.kind} r ${millimetres(splat.radius)} mm${splat.height ? ` h ${millimetres(splat.height)} mm` : ''}${splat.velocity ? ` v ${splat.velocity.toFixed(2)}` : ''}${splat.amount ? ` amount ${splat.amount.toFixed(2)}` : ''}${splat.count ? ` count ${splat.count}` : ''}`).join('; ')}`);
// Fly the big drops to the water as SplashSystem.update does.
const landings = [];
for (const drop of drops.filter((candidate) => candidate.radius >= 0.0035)) {
  let { x, y, z, vx, vy, vz } = drop;
  let time = drop.time;
  while (time < 3) {
    const speed = Math.hypot(vx, vy, vz);
    const drag = Math.min((0.00027 / drop.radius) * speed * substep, 0.5);
    vx -= vx * drag; vy -= vy * drag; vz -= vz * drag;
    vy -= 9.81 * substep;
    x += vx * substep; y += vy * substep; z += vz * substep;
    time += substep;
    if (y <= 0 && vy < 0) break;
  }
  landings.push({ time: time + pinchDelay, radius: drop.radius, speed: Math.hypot(vx, vy, vz), offset: Math.hypot(x, z + 1.4) });
}
landings.sort((first, second) => first.time - second.time);
console.log(`landings of drops of 3.5 mm and more (s after entry, radius, speed, distance from the jet): ${landings.map((landing) => `${landing.time.toFixed(3)} s ${millimetres(landing.radius)} mm ${landing.speed.toFixed(2)} m/s ${millimetres(landing.offset)} mm`).join('; ')}`);
console.log(`normals: worst outward cosine ${worstInward.toFixed(3)} (negative means some point inward)`);
console.log(`CPU: ${(geometryMilliseconds / Math.max(geometryCalls, 1) * 1000).toFixed(0)} µs per frame for the geometry over ${geometryCalls} frames, ${(updateMilliseconds / updateCalls * 1000).toFixed(1)} µs per substep update`);
