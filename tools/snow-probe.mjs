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
// - precision: a day into a blizzard, the place the shader puts together in
//   floats from the wrapped offsets (clockOffsets) is the exact one, where
//   the clock multiplied in floats would be metres off;
// - a change of wind while it snows moves the flakes by a frame's carry, not
//   all at once, and the gusts follow it over a second or two;
// - the box reaches the water however high the eye;
// - the box: each intensity's flakes per cubic metre, the visibility they
//   alone would give (against its haze's, src/main.js WEATHERS), and how many are drawn
//   larger than a pixel in the home view (1080 rows, 50° up and down);
// - the cost of the CPU's part, the uniforms a frame.
import { SNOW, STREAK_SECONDS, STREAK_MIN_PIXELS, GUST_SHARE, flakeAt, flakeDrawn, flakeAttributes, flakeSpeed, clockOffsets } from '../src/snow.js';

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
      const { speed } = flakeSpeed(flake[3]);
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
  // The visibility the flakes alone give (3 over their extinction, as src/sky.js reckons the haze's): each hides
  // its own area (a millimetre's diffraction is too narrow a cone to dim what is behind), its diameter that of
  // FLAKE_VERTEX, small + Δ w² for w even in [0, 1), whose square averages small² + 2 small Δ/3 + Δ²/5.
  const [small, large] = snow.sizes, spread = large - small;
  const meanArea = Math.PI / 4 * (small * small + 2 * small * spread / 3 + spread * spread / 5);
  const ownVisibility = 3 / (snow.flakes / volume * meanArea);
  console.log(`     ${(snow.flakes / volume).toFixed(1)} flakes per m³, alone ${ownVisibility.toFixed(0)} m to see; ${inView} in the home view, ${resolved} of them over a pixel across`);
  check(resolved > 150, `${name}: over 150 flakes a pixel or more across in the home view (${resolved})`);
}

// Precision: the steady part of a flake's place, a day on in a blizzard's wind, as the shader sums it in floats
// from the wrapped offsets, against the exact place (doubles) wrapped into the box; and as it would be from the
// clock multiplied in floats.
{
  const snow = SNOW.blizzard, drift = [7.2, 9.6], time = 86400 + 0.37;
  const f = Math.fround;
  const wrapped = (value, span) => value - span * Math.floor(value / span);
  const offsets = clockOffsets(time, snow, drift);
  let worstWrapped = 0, worstNaive = 0;
  for (let index = 0; index < SAMPLE; index++) {
    const [flake] = attributes(index);
    const { step, speed } = flakeSpeed(flake[3]);
    const start = [flake[0] * snow.box[0], flake[2] * snow.box[1], flake[1] * snow.box[2]];
    const exact = [wrapped(start[0] + drift[0] * time, snow.box[0]), wrapped(start[1] - snow.fall * speed * time, snow.box[1]), wrapped(start[2] + drift[1] * time, snow.box[2])];
    const summed = [f(f(start[0]) + f(offsets.drift[0])), f(f(start[1]) - f(f(offsets.fall[0]) + f(step * f(offsets.fall[1])))), f(f(start[2]) + f(offsets.drift[1]))];
    const naive = [f(f(start[0]) + f(f(drift[0]) * f(time))), f(f(start[1]) - f(f(f(snow.fall) * f(speed)) * f(time))), f(f(start[2]) + f(f(drift[1]) * f(time)))];
    for (let axis = 0; axis < 3; axis++) {
      const span = snow.box[axis === 1 ? 1 : axis === 0 ? 0 : 2];
      const offBy = (value) => { const gap = Math.abs(wrapped(value, span) - exact[axis]); return Math.min(gap, span - gap); };
      worstWrapped = Math.max(worstWrapped, offBy(summed[axis]));
      worstNaive = Math.max(worstNaive, offBy(naive[axis]));
    }
  }
  console.log(`\na day into a blizzard: the shader's place is ${(worstWrapped * 1000).toFixed(4)} mm off at worst; the clock multiplied in floats would be ${(worstNaive * 1000).toFixed(0)} mm off`);
  check(worstWrapped < 1e-5, `a day on, the wrapped offsets keep a flake to within 0.01 mm (${(worstWrapped * 1000).toFixed(4)} mm)`);
  check(worstNaive > 0.01, `(and the probe sees the problem they fix: ${(worstNaive * 1000).toFixed(0)} mm without them)`);
  // The box's centre: at the eye, but no higher than 0.4 of its height (FLAKE_VERTEX), so its floor is under the water.
  for (const [name, entry] of Object.entries(SNOW)) {
    const bottoms = [1.15, 2.4, 4, 8].map((eye) => Math.min(eye, 0.4 * entry.box[1]) - 0.5 * entry.box[1]);
    check(bottoms.every((bottom) => bottom < 0), `${name}: the box reaches the water from an eye up to 8 m high (its floor at ${bottoms.map((bottom) => bottom.toFixed(1)).join(', ')} m)`);
  }
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

// A change of wind while it snows: the carry is summed frame by frame, so the flakes turn rather than all jump
// (the clock times the new wind would move them by kilometres), and the gusts grow over GUST_EASE.
{
  const gusty = new Snow(lighting);
  gusty.setWind([1, 0], WINDS.calm);
  gusty.setIntensity('heavy');
  let time = 0;
  for (; time < 600; time += 1 / 60) gusty.update(time, camera, resolution);
  const expected = clockOffsets(gusty.clock, SNOW.heavy, [WINDS.calm, 0]);
  const gap = (value, target, span) => { const off = Math.abs(((value - target) % span + span) % span); return Math.min(off, span - off); };
  check(gap(gusty.carry.drift[0], expected.drift[0], SNOW.heavy.box[0]) < 1e-6 && gap(gusty.carry.fall[1], expected.fall[1], SNOW.heavy.box[1]) < 1e-6,
    'in a steady wind the summed carry is clockOffsets\' (flakeAt\'s twin holds)');
  const before = gusty.carry.drift[0], gustBefore = gusty.flakes.material.uniforms.uGust.value;
  gusty.setWind([1, 0], WINDS.gale);
  gusty.update(time, camera, resolution);
  const moved = gap(gusty.carry.drift[0], before, SNOW.heavy.box[0]);
  const gustAfter = gusty.flakes.material.uniforms.uGust.value;
  check(moved < WINDS.gale / 50, `calm to gale ten minutes in: the flakes move ${(moved * 1000).toFixed(0)} mm in the next frame, a frame of the gale's carry`);
  check(gustAfter - gustBefore < 0.05 * GUST_SHARE * (WINDS.gale - WINDS.calm), `...and the gusts' speed moves ${(gustAfter - gustBefore).toFixed(3)} m/s, not at once to the gale's`);
  for (let frame = 1; frame <= 600; frame++) gusty.update(time + frame / 60, camera, resolution);
  check(Math.abs(gusty.flakes.material.uniforms.uGust.value / (GUST_SHARE * WINDS.gale) - 1) < 0.01, 'ten seconds on, the gusts are the gale\'s');
}
snow.setShare(0.4);
check(snow.count === Math.round(SNOW.heavy.flakes * 0.4), `the Low preset's share draws ${snow.count} of ${SNOW.heavy.flakes}`);
snow.setIntensity(null);
check(!snow.on && snow.count === 0, 'with no snow nothing is drawn');
check(STREAK_SECONDS > 0, `the capsule is swept over ${(STREAK_SECONDS * 1000).toFixed(1)} ms`);

if (failures.length) { console.log(`snow-probe: ${failures.length} checks fail`); process.exit(1); }
console.log('snow-probe: all checks pass');
