// CPU probe of the forward fan of an oblique entry (CrownSheet with `fan`,
// src/crown.js), without a browser.
//
// Runs one fan with a stand-in for the splash, as SplashSystem.impact makes it
// (strength and droplet count by the same rules), and prints its timeline
// in slow motion (frames of 1 ms: how far ahead and how high the rim is, the
// sheet's thickness straight ahead, drops so far), the drops it made, where
// they go (flown with the splash's own drag), and its CPU cost per frame at
// 60 fps (substeps of 1/240 s, geometry once per frame, after a few silent
// fans, so the code is warm).
//
//   node tools/fan-probe.mjs [stoneRadius=0.03] [entrySpeed=6.94] [horizontalFraction=0.676]
import { CrownSheet } from '../src/crown.js';

const stoneRadius = Number(process.argv[2] ?? 0.03);
const entrySpeed = Number(process.argv[3] ?? 6.94);
const horizontalFraction = Number(process.argv[4] ?? 0.676);
const sizeFactor = stoneRadius / 0.03;
const strength = Math.min(Math.max((horizontalFraction - 0.3) / 0.4, 0), 1);
const fanCount = Math.round(Math.min(Math.max(300 * sizeFactor ** 1.6 * Math.sqrt(entrySpeed / 6), 60), 1500) * strength);
// The stone travels towards −z, as a throw from the bank does.
const verticalSpeed = entrySpeed * Math.sqrt(1 - horizontalFraction ** 2);
const impact = { x: 0, z: -1.4, speed: entrySpeed, velocity: { x: 0, y: -verticalSpeed, z: -entrySpeed * horizontalFraction }, radius: stoneRadius };
const makeFan = () => new CrownSheet({ impact, startTime: 0, rimDroplets: Math.round(0.15 * fanCount), breakupDroplets: Math.round(0.85 * fanCount), material: null, fan: true, strength });
const millimetres = (metres) => (metres * 1000).toFixed(1);
if (strength <= 0) { console.log(`horizontal fraction ${horizontalFraction}: below 0.3, no fan`); process.exit(0); }

// Timeline in slow motion: one substep per 1 ms frame.
let drops = [];
const recorder = { frameSeconds: 0.001, spawnDroplet: (x, y, z, vx, vy, vz, radius) => drops.push({ time: clock, x, y, z, vx, vy, vz, radius }) };
let clock = 0;
const fan = makeFan();
console.log(`stone ${millimetres(stoneRadius)} mm at ${entrySpeed} m/s, horizontal fraction ${horizontalFraction} (${(Math.asin(horizontalFraction) * 180 / Math.PI).toFixed(1)}° from vertical): ` +
  `strength ${strength.toFixed(2)}, ${fanCount} drops, R/V ${(stoneRadius / entrySpeed * 1000).toFixed(1)} ms, launch ${(fan.launchDuration * 1000).toFixed(1)} ms, ` +
  `tears at ${(fan.breakTime * 1000).toFixed(1)} ms, gone at ${(fan.endTime * 1000).toFixed(1)} ms, h0 ${millimetres(fan.baseThickness)} mm`);
const middle = (fan.columns - 1) / 2;
while (!fan.finished) {
  clock += 0.001;
  fan.update(clock, 0.001, recorder);
  fan.updateGeometry(clock);
  let reach = 0, height = -1, edgeReach = 0;
  for (let column = 0; column < fan.columns; column++) {
    const vertex = column * 3;
    const ahead = fan.centreZ - fan.positions[vertex + 2];
    reach = Math.max(reach, ahead);
    height = Math.max(height, fan.positions[vertex + 1]);
    if (column === 0) edgeReach = Math.hypot(fan.positions[vertex] - fan.centreX, fan.positions[vertex + 2] - fan.centreZ);
  }
  const rows = fan.rows;
  const thicknessAhead = fan.thicknesses[Math.floor(rows / 2) * fan.columns + middle];
  console.log(`  ${(clock * 1000).toFixed(0)} ms: rim ${millimetres(reach)} mm ahead and ${millimetres(height)} mm up straight ahead, ${millimetres(edgeReach)} mm out at the sector's edge, ` +
    `mid-sheet ${millimetres(thicknessAhead)} mm thick, drops ${drops.length}`);
}
const radii = drops.map((drop) => drop.radius).sort((first, second) => first - second);
const percentile = (sorted, share) => sorted[Math.min(Math.floor(share * sorted.length), sorted.length - 1)];
const speeds = drops.map((drop) => Math.hypot(drop.vx, drop.vy, drop.vz));
const angles = drops.map((drop) => Math.atan2(Math.hypot(drop.vx, drop.vz), drop.vy) * 180 / Math.PI).sort((first, second) => first - second);
console.log(`drops: ${drops.length}, radius ${(radii[0] * 1000).toFixed(2)} / ${(percentile(radii, 0.5) * 1000).toFixed(2)} / ${(radii.at(-1) * 1000).toFixed(2)} mm (least, median, most), ` +
  `speed ${(speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length).toFixed(2)} m/s on average, ${angles[0].toFixed(0)}° to ${angles.at(-1).toFixed(0)}° from vertical (median ${percentile(angles, 0.5).toFixed(0)}°)`);
// Fly them to the water as SplashSystem.update does.
const substep = 1 / 240;
const flights = drops.map((drop) => {
  let { x, y, z, vx, vy, vz, time } = drop;
  let top = y;
  while (time < 3) {
    const speed = Math.hypot(vx, vy, vz);
    const drag = Math.min((0.00027 / drop.radius) * speed * substep, 0.5);
    vx -= vx * drag; vy -= vy * drag; vz -= vz * drag;
    vy -= 9.81 * substep;
    x += vx * substep; y += vy * substep; z += vz * substep;
    time += substep;
    top = Math.max(top, y);
    if (y <= 0 && vy < 0) break;
  }
  return { ahead: impact.z - z, top, time };
});
const aheads = flights.map((flight) => flight.ahead).sort((first, second) => first - second);
const tops = flights.map((flight) => flight.top).sort((first, second) => first - second);
const times = flights.map((flight) => flight.time).sort((first, second) => first - second);
console.log(`landings: ${millimetres(percentile(aheads, 0.5))} mm ahead (90% within ${millimetres(percentile(aheads, 0.9))} mm, furthest ${millimetres(aheads.at(-1))} mm), ` +
  `rising to ${millimetres(percentile(tops, 0.5))} mm (highest ${millimetres(tops.at(-1))} mm), down by ${percentile(times, 0.5).toFixed(3)} s (all by ${times.at(-1).toFixed(3)} s)`);

// Cost at 60 fps: substeps of 1/240 s, the geometry once per frame.
const nowhere = { frameSeconds: 1 / 60, spawnDroplet() {} };
let updateMicroseconds = 0, geometryMicroseconds = 0, frames = 0;
for (let run = 0; run < 200; run++) {
  const quiet = makeFan();
  let time = 0;
  const warm = run >= 20;
  while (!quiet.finished) {
    let started = performance.now();
    for (let step = 0; step < 4 && !quiet.finished; step++) { time += substep; quiet.update(time, substep, nowhere); }
    const updated = performance.now();
    quiet.updateGeometry(time);
    if (warm) { updateMicroseconds += (updated - started) * 1000; geometryMicroseconds += (performance.now() - updated) * 1000; frames++; }
    started = performance.now();
  }
}
console.log(`CPU at 60 fps: ${(updateMicroseconds / frames).toFixed(0)} µs per frame for the shedding and tear, ${(geometryMicroseconds / frames).toFixed(0)} µs for the geometry (${frames / 180} frames per fan)`);
