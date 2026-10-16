// CPU probe of the cavity a stone opens (src/cavity.js), without a browser.
//
// Throws each stone as the app does from the home view (src/main.js: the hand,
// the aim, normal power, src/rock.js flying it to the water), lets
// SplashSystem.impact build the splash against a stand-in pond, and steps it
// as the app's frame loop does (frames of 1/60 s in substeps of 1/240 s, the
// geometry once per frame) until the hole has closed, with the stone itself
// stepped alongside. For every stone, thrown and dropped straight in, it
// prints
//   - the entry: speed, angle from vertical, Froude number V²/(g·R);
//   - the timeline: when the stone's centre reaches the water, the pinch-off
//     (time in ms and in sqrt(R/g), its depth, and the stone's depth then),
//     when the jet starts against it, and the bowl left above the neck: its
//     floor's depth as it rises and when it has flattened into the surface;
//   - the hole over time: the mouth's radius, the lip's crest (radius and
//     height), the depth of the hole and the circle the surface dips from;
//   - the mesh: vertices, and the CPU cost of a frame's geometry;
// and checks, failing with exit code 1 if any check fails:
//   - the cavity's stone path follows the stone src/rock.js moves (within 3%
//     of its depth, or 2 mm);
//   - the pinch-off comes when the cavity's seal says (2.06·sqrt(R/g) after
//     entry for a deep seal, give or take the splash's few per cent; sooner
//     for a shallow or a surface seal), when the jet starts (a throw with no
//     jet heaves its mound later, MOUND_DELAY of the bowl's time units after
//     it, src/splash.js); the bowl's floor
//     starts at the pinch depth, only rises, and reaches the surface when the
//     hole is gone; the hole is never drawn deeper than its floor;
//   - every frame, the well the surface patch dips into holds every vertex of
//     the wall, and the lip's apron reaches two water cells past where it dips;
//   - the wall's normals face the hole's axis and the lip's face up;
//   - the crown's base sits on the lip: on its crest while the mouth widens,
//     then on its outer slope where the crest was widest.
//
// Then, since every throw's hole is its own (src/splash.js chooses the seal
// and the asymmetry, src/rock.js's stone shapes and turns it), it throws
// VARIETY_THROWS more stones of each size at random aims over the pond and
// powers, Math.random seeded, and runs every check on every frame of each,
// printing the seals they made and the worst margins.
//
//   node tools/cavity-probe.mjs [diameter-in-cm ...] [--aim=x:z] [--seed=12345] [--variety=24]
//
// Without diameters it runs the slider's 1.5, 4, 6, 8 and 16 cm.
import * as THREE from 'three';
import { SplashSystem, MOUND_DELAY } from '../src/splash.js';
import { Rock } from '../src/rock.js';
import { CAVITY_LAYOUT, PINCH_TIME } from '../src/cavity.js';

const { rows: CAVITY_ROWS, columns: CAVITY_COLUMNS, firstWallRow, mouthRow } = CAVITY_LAYOUT;

const option = (name, fallback) => { const hit = process.argv.find((argument) => argument.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const diameters = process.argv.slice(2).filter((argument) => !argument.startsWith('--')).map(Number);
const stoneDiameters = diameters.length > 0 ? diameters : [1.5, 4, 6, 8, 16];
const [aimX, aimZ] = option('aim', '0:-1.4').split(':').map(Number);
const seed = Number(option('seed', '12345'));
const VARIETY_THROWS = Number(option('variety', '24'));
// Park–Miller, so a run repeats exactly (the stones' shapes, turns and splashes are random).
let randomState = seed;
Math.random = () => { randomState = (randomState * 16807) % 2147483647; return (randomState - 1) / 2147483646; };
const POWERS = { soft: 1.3, normal: 1.0, hard: 0.72 };

const GRAVITY = 9.81;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const POND_DEPTH = 0.8;
const CELL = 6 / 512;
const radii = (value, radius) => (value / radius).toFixed(2);
const milliseconds = (seconds) => (seconds * 1000).toFixed(0);

const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const hand = new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);

function throwStone(radius, vertical, aim = [aimX, aimZ], power = 'normal') {
  const target = new THREE.Vector3(aim[0], 0, aim[1]);
  const flightTime = THREE.MathUtils.clamp(0.42 + 0.11 * hand.distanceTo(target), 0.5, 1.0) * POWERS[power];
  const velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  const rock = new Rock({ radius, position: hand, velocity, envTexture: null });
  if (vertical) {
    const speed = Math.hypot(velocity.x, velocity.y - GRAVITY * flightTime, velocity.z);
    rock.position.set(aim[0], 2 * radius, aim[1]);
    rock.velocity.set(0, -speed, 0);
  }
  for (let step = 0; step < 4 * 240; step++) {
    const impact = rock.update(FRAME / SUBSTEPS, POND_DEPTH);
    if (impact) return { impact, rock };
  }
  throw new Error('the stone never reached the water');
}

function standIns() {
  const water = {
    heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512, cell: CELL, depth: POND_DEPTH,
    addSplat: () => {}, addFoam: () => {},
  };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  return { water, splash };
}

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };

/** The geometric checks on one frame of a cavity's mesh. */
function checkMesh(cavity, label) {
  const positions = cavity.positions;
  const normals = cavity.normals;
  const shape = cavity.push;
  if (shape.radius <= 0) return;
  const wallRows = { first: firstWallRow, last: mouthRow };
  const wellDepth = -shape.shiftY;
  // A vertex of the patch just outside the circle and one just inside, a
  // cell's diagonal apart, make the well's wall: the cavity stays inside that.
  const wellRadius = shape.radius - Math.SQRT2 * CELL;
  let worstCone = -Infinity;
  for (let row = 0; row < CAVITY_ROWS; row++) {
    for (let column = 0; column < CAVITY_COLUMNS; column++) {
      const vertex = row * CAVITY_COLUMNS + column;
      const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
      if (row <= wallRows.last && y < 0) {
        // The well: the circle carried down along the hole's axis to below its floor.
        const share = -y / wellDepth;
        const axisX = shape.x + shape.shiftX * share;
        const axisZ = shape.z + shape.shiftZ * share;
        worstCone = Math.max(worstCone, Math.hypot(x - axisX, z - axisZ) - wellRadius, -y - wellDepth);
      }
    }
  }
  check(worstCone < 0, `${label}: a wall vertex is ${(worstCone * 1000).toFixed(1)} mm outside the well the patch dips into at ${milliseconds(cavity.age)} ms`);
  margins.well = Math.max(margins.well, worstCone);
  // The apron's outer ring, from the dip's centre.
  let apronInner = Infinity;
  const lastRow = CAVITY_ROWS - 1;
  for (let column = 0; column < CAVITY_COLUMNS; column++) {
    const vertex = lastRow * CAVITY_COLUMNS + column;
    apronInner = Math.min(apronInner, Math.hypot(positions[vertex * 3] - shape.x, positions[vertex * 3 + 2] - shape.z));
  }
  check(apronInner >= shape.radius + 2 * CELL, `${label}: the apron ends ${((apronInner - shape.radius) / CELL).toFixed(1)} cells past the dip at ${milliseconds(cavity.age)} ms`);
  margins.apron = Math.min(margins.apron, (apronInner - shape.radius) / CELL);
  // Normals: the lip's face up, the wall's (well below the mouth) towards the axis.
  for (let column = 0; column < CAVITY_COLUMNS; column += 8) {
    const lip = (CAVITY_ROWS - 8) * CAVITY_COLUMNS + column;
    check(normals[lip * 3 + 1] > 0.5, `${label}: the lip's normal points down at ${milliseconds(cavity.age)} ms`);
    const wall = (wallRows.first + 8) * CAVITY_COLUMNS + column;
    const ring = wallRows.first + 8;
    const outX = positions[wall * 3] - cavity.rowX[ring], outZ = positions[wall * 3 + 2] - cavity.rowZ[ring];
    if (Math.hypot(outX, outZ) > 0.3 * cavity.radius && -positions[wall * 3 + 1] > 0.1 * cavity.radius) check(normals[wall * 3] * outX + normals[wall * 3 + 2] * outZ < 0, `${label}: a wall normal points away from the hole at ${milliseconds(cavity.age)} ms`);
  }
}

// The worst margins seen: how far a wall vertex came to the well's side (negative: inside), the apron's least overlap in cells.
const margins = { well: -Infinity, apron: Infinity };

function runCavity(radius, vertical, { silent = false, aim, power, name } = {}) {
  const { impact, rock } = throwStone(radius, vertical, aim, power);
  const { water, splash } = standIns();
  splash.impact(impact, water);
  const cavity = splash.cavities[0];
  const crown = splash.crowns.find((candidate) => !candidate.landing && !candidate.fan);
  const jetStart = splash.jets[0].start - cavity.startTime;
  const jetRegime = splash.jets[0].regime;
  const label = name ?? `${(200 * radius).toFixed(1)} cm ${vertical ? 'dropped' : 'thrown'}`;
  const costs = [];
  const result = {};
  let worstPath = 0;
  let worstBase = 0;
  let worstFloor = 0;
  for (let frame = 0; frame < 120 && !cavity.finished; frame++) {
    splash.setFrameSeconds(FRAME);
    for (let substep = 0; substep < SUBSTEPS; substep++) {
      // As in the app, the splash's first step is in the substep the stone touched in, which has moved it already.
      if (frame > 0 || substep > 0) rock.update(FRAME / SUBSTEPS, POND_DEPTH);
      splash.update(FRAME / SUBSTEPS, water);
    }
    if (cavity.finished) break;
    const started = performance.now();
    cavity.updateGeometry(splash.time);
    costs.push(performance.now() - started);
    crown.updateGeometry(splash.time);
    const age = cavity.age;
    // The stone the cavity follows against the stone itself.
    const stone = cavity.stoneAt(age, {});
    const depth = -rock.position.y;
    if (age < cavity.pinchTime && depth > 0) {
      const stray = Math.abs(stone.depth - depth) / Math.max(0.03 * depth, 0.002);
      if (stray > worstPath) { worstPath = stray; result.pathMillimetres = Math.abs(stone.depth - depth) * 1000; result.pathDepth = depth; }
    }
    // The crown's base row against the lip's crest at its launch time, now.
    const lip = cavity.lipAt(age, {});
    if (age < crown.endTime && lip.mouth > 0.95 * cavity.radius) {
      // Each vertex of the base row against the lip's height where it stands (the crown launches 3 mm into the water).
      const baseRow = crown.rows - 1;
      for (let column = 0; column < crown.columns; column++) {
        const vertex = (baseRow * crown.columns + column) * 3;
        const outX = crown.positions[vertex] - lip.x, outZ = crown.positions[vertex + 2] - lip.z;
        const distance = Math.hypot(outX, outZ);
        const crest = lip.mouth * cavity.shape(outX / distance, outZ / distance) + lip.width;
        worstBase = Math.max(worstBase, Math.abs(crown.positions[vertex + 1] - (cavity.lipHeightBeyond(lip, distance - crest) - 0.003)));
      }
    }
    // After the pinch the hole is drawn no deeper than the bowl's floor.
    if (age >= cavity.pinchTime && cavity.pinchSlice > 0) worstFloor = Math.max(worstFloor, cavity.holeDepth - cavity.bowlFloorAt(age).depth);
    if (!silent) checkMesh(cavity, label);
  }
  if (silent) return null;
  return Object.assign(result, { impact, cavity, label, costs, worstPath, worstBase, worstFloor, jetStart, jetRegime });
}

// Warm up, then measure.
for (const warmUp of [0.03, 0.08, 0.03, 0.08, 0.02]) runCavity(warmUp, false, { silent: true });
console.log(`aim (${aimX}, ${aimZ}), normal power; frames of 1/60 s in ${SUBSTEPS} substeps; the mesh is ${CAVITY_ROWS} × ${CAVITY_COLUMNS} = ${CAVITY_ROWS * CAVITY_COLUMNS} vertices`);
for (const diameter of stoneDiameters) {
  const radius = diameter / 200;
  for (const vertical of [false, true]) {
    const result = runCavity(radius, vertical);
    const { impact, cavity, label } = result;
    const unit = Math.sqrt(radius / GRAVITY);
    const angle = Math.asin(Math.min(Math.hypot(impact.velocity.x, impact.velocity.z) / impact.speed, 1)) * 180 / Math.PI;
    const froude = impact.speed ** 2 / (GRAVITY * radius);
    console.log(`\n${label}: enters at ${impact.speed.toFixed(2)} m/s, ${angle.toFixed(0)}° from vertical, Froude number ${froude.toFixed(0)}; sqrt(R/g) = ${milliseconds(unit)} ms`);
    // The lip's highest, from the closed form every millisecond.
    let highest = 0, highestTime = 0;
    for (let time = 0; time < cavity.closeTime; time += 0.001) {
      const height = cavity.lipAt(time, {}).height;
      if (height > highest) { highest = height; highestTime = time; }
    }
    console.log(`  the centre reaches the water at ${(cavity.surfaceTime * 1000).toFixed(1)} ms; the mouth is widest, ${radii(cavity.mouthAt(cavity.widestTime), radius)} R, at ${milliseconds(cavity.widestTime)} ms; the lip is highest, ${radii(highest, radius)} R, at ${milliseconds(highestTime)} ms`);
    const stoneAtPinch = cavity.stoneAt(cavity.pinchTime, {}).depth;
    console.log(`  pinch-off at ${milliseconds(cavity.pinchTime)} ms (${(cavity.pinchTime / unit).toFixed(2)}·sqrt(R/g)), ${radii(cavity.pinchDepth, radius)} R down, the stone (the hole's bottom until then) ${radii(stoneAtPinch, radius)} R down; the jet starts ${((result.jetStart - cavity.pinchTime) * 1000).toFixed(1)} ms after the pinch`);
    const floors = [0.01, 0.03, 0.06, 0.1, 0.15, 0.2].map((after) => `${milliseconds(cavity.pinchTime + after)} ms ${radii(cavity.bowlFloorAt(cavity.pinchTime + after).depth, radius)} R`);
    console.log(`  the bowl's floor: ${floors.join(', ')}; it has flattened into the surface at ${milliseconds(cavity.closeTime)} ms (${((cavity.closeTime - cavity.pinchTime) / unit).toFixed(2)}·sqrt(R/g) after the pinch)`);
    // The closed form at exact times (the frames above only sample it).
    const marks = [0.1, 0.25, 0.5, 1, 1.5, 2, 2.1, 2.2, 2.3, 2.4];
    const line = marks.map((mark) => {
      cavity.updateGeometry(cavity.startTime + mark * unit);
      const lip = cavity.lipAt(mark * unit, {});
      return `${mark.toFixed(2)}: ${milliseconds(mark * unit).padStart(3)} ms mouth ${radii(lip.mouth, radius)} crest ${radii(lip.mouth + lip.width, radius)} up ${radii(lip.height, radius)} deep ${radii(cavity.holeDepth, radius)} dip ${radii(cavity.push.radius, radius)}`;
    });
    console.log(`  at times in sqrt(R/g), lengths in R: the mouth's radius, the crest's and its height, the hole's depth, the circle the surface dips from\n    ${line.join('\n    ')}`);
    const sorted = [...result.costs].sort((first, second) => first - second);
    const mean = result.costs.reduce((sum, value) => sum + value, 0) / Math.max(result.costs.length, 1);
    console.log(`  CPU: geometry ${mean.toFixed(3)} ms per frame on average over ${result.costs.length} frames, worst ${sorted.at(-1).toFixed(3)} ms`);
    check(result.worstPath <= 1, `${label}: the cavity's stone strays ${result.pathMillimetres?.toFixed(1)} mm from src/rock.js's at ${((result.pathDepth ?? 0) * 100).toFixed(1)} cm deep`);
    checkTiming(result, label);
  }
}

/** The path, the seal's timing, the jet's start and the crown's base, for one run. */
function checkTiming(result, label) {
  const { cavity } = result;
  const unit = Math.sqrt(cavity.radius / GRAVITY);
  check(result.worstPath <= 1, `${label}: the cavity's stone strays ${result.pathMillimetres?.toFixed(1)} mm from src/rock.js's at ${((result.pathDepth ?? 0) * 100).toFixed(1)} cm deep`);
  check(Math.abs(cavity.pinchTime / unit - cavity.seal.pinch) < 0.01, `${label}: pinch-off at ${(cavity.pinchTime / unit).toFixed(3)}·sqrt(R/g), its ${cavity.seal.kind} seal says ${cavity.seal.pinch.toFixed(3)}`);
  if (cavity.seal.kind === 'deep') check(Math.abs(cavity.seal.pinch - PINCH_TIME) < 0.15, `${label}: a deep seal pinches at ${cavity.seal.pinch.toFixed(2)}·sqrt(R/g)`);
  // A throw with no jet heaves its mound MOUND_DELAY of the bowl's time units after the pinch (src/splash.js).
  const jetDelay = result.jetRegime === 'none' ? MOUND_DELAY * cavity.bowlUnit : 0;
  check(Math.abs(result.jetStart - cavity.pinchTime - jetDelay) < 1e-9, `${label}: the jet (${result.jetRegime}) starts ${((result.jetStart - cavity.pinchTime) * 1000).toFixed(1)} ms from the pinch`);
  // The bowl: from the pinch depth, only rising, at the surface when the hole is gone.
  if (cavity.pinchSlice > 0) {
    check(Math.abs(cavity.bowlFloorAt(cavity.pinchTime).depth - cavity.pinchDepth) < 1e-9, `${label}: the bowl's floor starts ${radii(cavity.bowlFloorAt(cavity.pinchTime).depth, cavity.radius)} R down, the pinch ${radii(cavity.pinchDepth, cavity.radius)} R`);
    let previous = Infinity, rising = true;
    for (let time = cavity.pinchTime; time <= cavity.closeTime + 1e-9; time += 0.001) {
      const depth = cavity.bowlFloorAt(time).depth;
      if (depth > previous + 1e-12) rising = false;
      previous = depth;
    }
    check(rising, `${label}: the bowl's floor sinks somewhere after the pinch`);
    check(cavity.bowlFloorAt(cavity.closeTime).depth === 0, `${label}: the bowl's floor is ${radii(cavity.bowlFloorAt(cavity.closeTime).depth, cavity.radius)} R down when the hole is gone`);
  }
  check(result.worstFloor < 1e-6, `${label}: the hole is drawn ${(result.worstFloor * 1000).toFixed(2)} mm below the bowl's floor`);
  check(result.worstBase < 0.001, `${label}: the crown's base is ${(result.worstBase * 1000).toFixed(1)} mm off the lip`);
}

// The variety: every size thrown at random aims over the pond and powers.
console.log(`\nvariety: ${VARIETY_THROWS} more throws of each size at random aims and powers, Math.random seeded with ${seed}`);
for (const diameter of stoneDiameters) {
  const radius = diameter / 200;
  const seals = {};
  let worstPath = 0, worstBase = 0;
  margins.well = -Infinity; margins.apron = Infinity;
  for (let index = 0; index < VARIETY_THROWS; index++) {
    const aim = [THREE.MathUtils.randFloatSpread(1.8), -0.3 - Math.random() * 2.2];
    const power = ['soft', 'normal', 'hard'][Math.floor(Math.random() * 3)];
    const label = `${diameter} cm thrown ${power} at (${aim[0].toFixed(2)}, ${aim[1].toFixed(2)}) [variety ${index + 1}]`;
    const result = runCavity(radius, false, { aim, power, name: label });
    seals[result.cavity.seal.kind] = (seals[result.cavity.seal.kind] ?? 0) + 1;
    worstPath = Math.max(worstPath, result.worstPath);
    worstBase = Math.max(worstBase, result.worstBase);
    checkTiming(result, label);
  }
  console.log(`  ${diameter} cm: seals ${Object.entries(seals).map(([kind, count]) => `${kind} ${count}`).join(', ')}; worst: a wall vertex ${(margins.well * 1000).toFixed(1)} mm from the well's side (negative: inside), the apron ${margins.apron.toFixed(1)} cells past the dip, the stone ${(100 * worstPath / 1).toFixed(0)}% of its allowance off src/rock.js's path, the crown's base ${(worstBase * 1000).toFixed(2)} mm off the lip`);
}
console.log(failures.length === 0 ? '\ncavity-probe: all checks pass' : `\ncavity-probe: ${failures.length} checks fail:\n  ${[...new Set(failures)].slice(0, 30).join('\n  ')}`);
process.exitCode = failures.length === 0 ? 0 : 1;
