// The snow's flakes on the CPU (src/snow.js flakeAt, FLAKE_MOTION's twin in
// src/shaders/snow.js; flakeDrawn, FLAKE_VERTEX's capsule), and checks:
//
//   node tools/snow-probe.mjs
//
// - the motion: on average a flake goes with the wind and falls at its
//   terminal speed (its swing and its gusts average out), and the velocity
//   the capsule is drawn along is the place's derivative;
// - its speeds: a flake's swing and gusts never lift it (it falls at every
//   moment, but in a blizzard's gusts), and the gusts grow with the wind;
// - how it is drawn: a blob in calm air, a streak in a blizzard's, its light
//   (opacity times area) the same either way; a far flake's sub-pixel
//   capsule faint, so the far snow thins into the haze;
// - the box: each intensity's flakes per cubic metre, and how many are drawn
//   larger than a pixel in the home view (1080 rows, 50° up and down);
// - the cost of the CPU's part, the uniforms a frame.
import { SNOW, STREAK_SECONDS, STREAK_MIN_PIXELS, GUST_SHARE, flakeAt, flakeDrawn, flakeAttributes } from '../src/snow.js';

const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

const WINDS = { calm: 0.9, breeze: 3, gale: 12 };   // m/s: DRIFT_WIND times WIND_STRENGTHS (src/main.js, src/ambientWaves.js)
const FOCAL = 0.5 * 1080 / Math.tan((50 / 2) * Math.PI / 180);   // pixels per unit tan of a 1080-row, 50° camera
const SAMPLE = 400;
const { flakes, sways } = flakeAttributes(SAMPLE);
const attributes = (index) => [flakes.subarray(index * 4, index * 4 + 4), sways.subarray(index * 4, index * 4 + 4)];

for (const [name, snow] of Object.entries(SNOW)) {
  console.log(`\n${name}: ${snow.flakes} flakes in ${snow.box.join(' × ')} m, falling ${snow.fall} m/s, ${snow.sizes.map((size) => (size * 1000).toFixed(0)).join(' to ')} mm`);
  for (const [windName, windSpeed] of Object.entries(WINDS)) {
    const drift = [windSpeed * 0.6, windSpeed * 0.8];
    let worstMean = 0, worstDerivative = 0, rising = 0, fastestSideways = 0;
    for (let index = 0; index < SAMPLE; index++) {
      const [flake, sway] = attributes(index);
      const span = 600;
      const start = flakeAt(flake, sway, 0, snow, drift).place;
      const end = flakeAt(flake, sway, span, snow, drift).place;
      const speed = 0.8 + 0.4 * flake[3];
      const expected = [drift[0], -snow.fall * speed, drift[1]];
      for (let axis = 0; axis < 3; axis++) worstMean = Math.max(worstMean, Math.abs((end[axis] - start[axis]) / span - expected[axis]));
      for (let step = 0; step < 50; step++) {
        const time = step * 0.37;
        const { velocity } = flakeAt(flake, sway, time, snow, drift);
        const before = flakeAt(flake, sway, time - 1e-4, snow, drift).place, after = flakeAt(flake, sway, time + 1e-4, snow, drift).place;
        for (let axis = 0; axis < 3; axis++) worstDerivative = Math.max(worstDerivative, Math.abs((after[axis] - before[axis]) / 2e-4 - velocity[axis]));
        if (velocity[1] > 0) rising++;
        fastestSideways = Math.max(fastestSideways, Math.hypot(velocity[0] - drift[0], velocity[2] - drift[1]));
      }
    }
    check(worstMean < 0.01, `${name}, ${windName}: a flake's mean velocity is the wind's and its fall's (worst ${worstMean.toFixed(4)} m/s off over 10 minutes)`);
    check(worstDerivative < 1e-3, `${name}, ${windName}: the drawn velocity is the place's derivative (worst ${worstDerivative.toExponential(1)} m/s)`);
    // Upward gusts lift a flake only where they outrun its fall: 0.68 of GUST_SHARE of the wind.
    const lifts = 0.68 * GUST_SHARE * windSpeed > 0.8 * snow.fall;
    check(lifts ? rising > 0 : rising === 0, `${name}, ${windName}: ${lifts ? 'the gusts lift some flakes' : 'no flake rises'} (${rising} of ${SAMPLE * 50} moments)`);
    // The swing's speed and the gusts' along x (1 of the gust) and z (1.3 of it), at most together.
    const swing = snow.sway * 2 * Math.PI / snow.swayPeriods[0], gust = GUST_SHARE * windSpeed;
    const bound = Math.hypot(swing + gust, swing + 1.3 * gust);
    check(fastestSideways <= bound + 1e-9, `${name}, ${windName}: the swing and gusts move it sideways at most ${fastestSideways.toFixed(2)} m/s from the wind (bound ${bound.toFixed(2)})`);
  }

  // Drawn: a mid-sized flake 3 m off.
  const diameter = 0.5 * (snow.sizes[0] + snow.sizes[1]);
  const still = flakeDrawn(diameter, snow.fall, 3, FOCAL);
  const driven = flakeDrawn(diameter, Math.hypot(WINDS.gale, snow.fall), 3, FOCAL);
  check(still.length / still.width < 2, `${name}: in calm air a ${(diameter * 1000).toFixed(0)} mm flake is a blob, under twice as long as wide (${(still.length / still.width).toFixed(2)})`);
  check(driven.length / driven.width > 3, `${name}: in a gale it streaks (${(driven.length / driven.width).toFixed(1)} long to wide)`);
  const lightOf = (drawn) => drawn.covered * drawn.width * drawn.length;
  check(Math.abs(lightOf(driven) / lightOf(still) - 1) < 1e-9, `${name}: a streak keeps a still flake's light`);
  const far = flakeDrawn(snow.sizes[0], snow.fall, 8, FOCAL);
  check(far.covered < 0.5, `${name}: its smallest flake 8 m off is drawn ${STREAK_MIN_PIXELS} px wide at ${(far.covered * 100).toFixed(0)}% opacity`);

  // The box: density, and the flakes resolved (wider than a pixel) in the home view's frustum.
  const volume = snow.box[0] * snow.box[1] * snow.box[2];
  let inView = 0, resolved = 0;
  const all = flakeAttributes(snow.flakes);
  const halfTan = Math.tan((50 / 2) * Math.PI / 180), aspect = 16 / 9;
  for (let index = 0; index < snow.flakes; index++) {
    const x = (all.flakes[index * 4] - 0.5) * snow.box[0], y = (all.flakes[index * 4 + 2] - 0.5) * snow.box[1], z = (all.flakes[index * 4 + 1] - 0.5) * snow.box[2];
    if (z >= -0.25 || y + 1.15 < 0) continue;   // behind the eye or under the water (the eye 1.15 m up, looking along −Z)
    const depth = -z;
    if (Math.abs(x) > depth * halfTan * aspect || Math.abs(y) > depth * halfTan) continue;
    inView++;
    const size = snow.sizes[0] + (snow.sizes[1] - snow.sizes[0]) * all.flakes[index * 4 + 3] ** 2;
    if (size * FOCAL / depth >= 1) resolved++;
  }
  console.log(`     ${(snow.flakes / volume).toFixed(1)} flakes per m³; ${inView} in the home view, ${resolved} of them over a pixel across`);
  check(resolved > 150, `${name}: over 150 flakes a pixel or more across in the home view (${resolved})`);
}

// The CPU's part: a frame sets a few uniforms (Snow.update), nothing per flake.
const { Snow } = await import('../src/snow.js');
const THREE = await import('three');
const lighting = { skyAmbient: new THREE.Vector3(1, 1, 1), sunIrradiance: new THREE.Vector3(), sunDirection: new THREE.Vector3(0, 1, 0) };
const snow = new Snow(lighting);
snow.setIntensity('heavy');
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 1000);
camera.updateProjectionMatrix();
const resolution = new THREE.Vector2(1920, 1080);
const frames = 20000;
const started = performance.now();
for (let frame = 0; frame < frames; frame++) snow.update(frame / 60, camera, resolution);
const microseconds = (performance.now() - started) * 1000 / frames;
console.log(`\nSnow.update: ${microseconds.toFixed(2)} µs a frame; one draw of ${snow.count} instanced quads (${snow.count * 2} triangles)`);
check(microseconds < 20, `the snow costs the CPU under 20 µs a frame (${microseconds.toFixed(2)})`);
snow.setIntensity(null);
check(!snow.on && snow.count === 0, 'with no snow nothing is drawn');
check(STREAK_SECONDS > 0, `the capsule is swept over ${(STREAK_SECONDS * 1000).toFixed(1)} ms`);

if (failures.length) { console.log(`snow-probe: ${failures.length} checks fail`); process.exit(1); }
console.log('snow-probe: all checks pass');
