// Fits the app's jet to the sweep of simulations (tools/basilisk/sweep.py runs
// it and writes what it prints into assets/jet/sweep.json): for every
// simulated stone bigger than the reference, the gains src/jet.js takes from
// that table (sweepGains: `column`, the column's radii Rj over R; `thread`, a
// factor on the needle's launch radius; `needle`, a factor on the needle's
// speed over the body's) that bring the app's clean jet straight down
// closest to the simulated one, on four measures made as sweep.py makes them
// on the simulation (its opening comment), in stone radii and sqrt(R/g):
//   - the body: the column's radius two radii above the still surface, the
//     median from one to three units after it emerges (here the drawn
//     rings', the sleeve's included);
//   - the middle and the thread: its radius five and ten radii up, the
//     medians from two to six units;
//   - the joined column's highest (here the top of the solver's piece still
//     standing on the launch point).
// Together they fit the column's taper and its reach: a stone's gains are
// not a rod's.
// The distance is the sum of the logarithms of the ratios (miss), the least
// on a grid (GRID) and a finer one around its best (fit takes several runs
// for one set of gains, their mean distance). The reference stone's
// gains are 1: its jet stays the one fitted to the reference simulation
// (tools/jet-probe.mjs REFERENCE).
//
//   node tools/basilisk/jet-fit.mjs < fit-input.json
//
// Input: {rows: [{name, radius, speed, depth, body, middle, thread, top}, ...]}
// (depth the run's pond's).
// Output: {fits: [{radius, column, thread, needle, miss,
// runs: [the run's distance, its measures and the app's]}]}, one a row.
// measureJet is the measurement, for tools/jet-probe.mjs too.
import { JetColumn, CLEAN_FORM } from '../../src/jet.js';
import { Cavity } from '../../src/cavity.js';
import { JET_COLLAPSE } from '../../src/splash.js';

const GRAVITY = 9.81;
const SWEEP_DEPTH = 1.7;           // m: the sweep's pond (the app's lake at the reference aim, src/pondFloor.js), unless a run says
// The gains tried first (fit); a thread of 3 launches the needle at 0.2 of Rj, under the body's 0.27 (src/jet.js): never a rod.
const GRID = { column: [0.8, 1, 1.25, 1.5], thread: [1, 1.6, 2.2, 3], needle: [0.15, 0.3, 0.5, 0.75, 1] };
const TOP_FLOOR = 0.02;            // stone radii: a measure under it counts as this (water already gone)

const parkMiller = (seed) => { let state = seed; return () => { state = (state * 16807) % 2147483647; return state / 2147483647; }; };

/**
 * The app's clean jet from a stone of `radius` entering straight down at
 * `entrySpeed` (as tools/jet-probe.mjs builds it: over the bowl the stone's
 * cavity leaves, src/cavity.js, in a pond `floorDepth` deep, substeps of
 * 1/240 s), with the given gains (src/jet.js's own by default) and form,
 * measured as sweep.py measures the simulation; times from entry, lengths
 * in metres.
 */
export function measureJet(radius, entrySpeed, gains = null, form = CLEAN_FORM, floorDepth = SWEEP_DEPTH) {
  const cavity = new Cavity({ impact: { x: 0, z: 0, height: radius, speed: entrySpeed, velocity: { x: 0, y: -entrySpeed, z: 0 }, radius }, startTime: 0, drawn: false, lean: 0, floorDepth });
  const jet = new JetColumn({
    x: 0, z: 0, radius, speed: JET_COLLAPSE * Math.sqrt(GRAVITY * cavity.pinchDepth), gains, startTime: 0, material: null,
    floor: (age, out) => cavity.bowlFloorAt(cavity.pinchTime + age, out), bowlUnit: cavity.bowlUnit, volume: 0.25 * cavity.bowlVolume,
    form: { ...form }, random: parkMiller(12345),
  });
  const drops = [];
  const splash = { time: 0, frameSeconds: 1 / 60, spray: null, spawnDroplet: (x, y, z, vx, vy, vz, dropRadius) => drops.push({ time: splash.time, y, vy, radius: dropRadius }), spawnFoamSpecks() {} };
  const water = { addSplat() {}, addFoam() {} };
  const unit = Math.sqrt(radius / GRAVITY);
  // The drawn column's radius at a height: the widest pair of rings either side of it.
  const radiusAt = (height) => {
    const ring = jet.ring;
    let widest = 0;
    for (let row = 0; row + 1 < ring.count; row++) {
      const below = ring.centre[row * 3 + 1], above = ring.centre[row * 3 + 4];
      if ((below - height) * (above - height) > 0 || ring.radius[row] <= 0 || ring.radius[row + 1] <= 0) continue;
      const share = above !== below ? (height - below) / (above - below) : 0;
      widest = Math.max(widest, ring.radius[row] + (ring.radius[row + 1] - ring.radius[row]) * share);
    }
    return widest;
  };
  // The top of the piece still standing on the launch point (the joined column).
  const joinedTop = () => {
    const solver = jet.solver;
    if (solver.count === 0) return -Infinity;
    let top = -Infinity;
    for (let node = solver.firstOfChain(solver.count - 1); node < solver.count; node++) top = Math.max(top, solver.positionY[node] + solver.beadRadius(node));
    return top;
  };
  const series = [];
  let emerged = null, highest = 0, joinedHighest = 0, joinedHighestTime = null;
  for (let tick = 1; !jet.finished && tick < 240 * 6; tick++) {
    const time = tick / 240;
    splash.time = time;
    jet.update(time, 1 / 240, splash, water);
    if (jet.finished) break;
    const top = joinedTop();
    if (emerged === null && top > 0) emerged = time;
    highest = Math.max(highest, top, jet.highest);
    if (top > joinedHighest) { joinedHighest = top; joinedHighestTime = time; }
    if (tick % 2 === 0) {
      jet.updateGeometry(time);
      series.push({ time, top, base: radiusAt(0.5 * radius), body: radiusAt(2 * radius), middle: radiusAt(5 * radius), thread: radiusAt(10 * radius) });
    }
  }
  const median = (values) => { const sorted = values.filter((value) => value > 0).sort((first, second) => first - second); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };
  const later = emerged === null ? [] : series.filter((sample) => sample.time >= emerged + unit && sample.time <= emerged + 3 * unit);
  const upper = emerged === null ? [] : series.filter((sample) => sample.time >= emerged + 2 * unit && sample.time <= emerged + 6 * unit);
  const topAt = (units) => {
    if (emerged === null) return 0;
    const wanted = emerged + units * unit;
    return series.reduce((best, sample) => (Math.abs(sample.time - wanted) < Math.abs(best.time - wanted) ? sample : best), series[0]).top;
  };
  const thrown = drops.filter((drop) => drop.vy > 0);
  const first = thrown.find((drop) => drop.radius >= 0.001) ?? thrown[0] ?? null;
  const sizes = thrown.map((drop) => drop.radius).sort((low, high) => low - high);
  // The radius by water: half the thrown water is in bigger drops than it.
  const thrownWater = sizes.reduce((sum, size) => sum + size ** 3, 0);
  let gathered = 0, byWater = null;
  for (const size of sizes) { gathered += size ** 3; if (byWater === null && gathered >= 0.5 * thrownWater) byWater = size; }
  const pinch = cavity.pinchTime;
  return {
    pinch, pinchDepth: cavity.pinchDepth, bodySpeed: jet.bodySpeed, tipSpeed: jet.tipSpeed, columnRadius: jet.columnRadius,
    emerges: emerged === null ? null : emerged + pinch,
    body: median(later.map((sample) => sample.body)), base: median(later.map((sample) => sample.base)),
    middle: median(upper.map((sample) => sample.middle)), thread: median(upper.map((sample) => sample.thread)),
    topAt: { 0.5: topAt(0.5), 1: topAt(1), 2: topAt(2), 4: topAt(4), 6: topAt(6) }, highest, joinedHighest,
    joinedHighestTime: joinedHighestTime === null ? null : joinedHighestTime + cavity.pinchTime,
    firstDrop: first ? { time: first.time + pinch, radius: first.radius } : null,
    drops: { count: thrown.length, p50: sizes.length ? sizes[Math.floor(sizes.length / 2)] : null, byWaterP50: byWater },
  };
}

/**
 * How far the app's jet is from the simulation's (row): the sum of the
 * absolute logarithms of the ratios of the body, the middle, the thread and
 * the joined column's highest.
 */
function miss(app, row) {
  const ratio = (measured, wanted) => Math.abs(Math.log(Math.max(measured, TOP_FLOOR * row.radius) / Math.max(wanted, 1e-9)));
  return ratio(app.body, row.body * row.radius) + ratio(app.middle, row.middle * row.radius) + ratio(app.thread, row.thread * row.radius) + ratio(app.joinedHighest, row.top * row.radius);
}

/**
 * A size's gains, one set for all its runs (its speeds): the grid's best
 * (GRID) by the summed distance, then a finer grid around it.
 */
function fit(rows) {
  let best = null;
  const tryGains = (gains) => {
    const apps = rows.map((row) => measureJet(row.radius, row.speed, gains, CLEAN_FORM, row.depth ?? SWEEP_DEPTH));
    const distance = rows.reduce((sum, row, index) => sum + miss(apps[index], row), 0) / rows.length;
    if (!best || distance < best.distance) best = { distance, gains, apps };
  };
  for (const column of GRID.column) for (const thread of GRID.thread) for (const needle of GRID.needle) tryGains({ column, thread, needle });
  const centre = best.gains;
  for (const column of [0.9, 1, 1.1]) for (const thread of [0.85, 1, 1.15]) for (const needle of [0.8, 1, 1.25]) {
    tryGains({ column: centre.column * column, thread: centre.thread * thread, needle: centre.needle * needle });
  }
  const { apps, gains, distance } = best;
  return {
    radius: rows[0].radius, ...gains, miss: distance,
    runs: rows.map((row, index) => {
      const app = apps[index], unit = Math.sqrt(row.radius / GRAVITY);
      return { name: row.name, speed: row.speed, miss: miss(app, row), sim: { body: row.body, middle: row.middle, thread: row.thread, top: row.top },
        app: { body: app.body / row.radius, middle: app.middle / row.radius, thread: app.thread / row.radius, top: app.joinedHighest / row.radius,
          topAfter: app.joinedHighestTime === null ? null : (app.joinedHighestTime - app.emerges) / unit, base: app.base / row.radius, emerges: app.emerges,
          highest: app.highest / row.radius, firstDrop: app.firstDrop?.radius ?? null, dropsMedian: app.drops.p50, dropsByWater: app.drops.byWaterP50 } };
    }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const { rows } = JSON.parse(text);
  process.stdout.write(JSON.stringify({ fits: rows.map((row) => fit([row])) }));
}
