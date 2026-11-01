// The raindrop's ring, on the CPU: the profile table src/rain.js
// draws every drop from, its statistics, and checks.
//
//   node tools/rain-probe.mjs            # prints the ring's timeline and the splashes', and checks
//   node tools/rain-probe.mjs --write    # also writes assets/rain/ring.json and ring_profile.bin
//
// The ring. A raindrop at its terminal speed (6.5 m/s for a 2 mm drop)
// opens a crater a few millimetres across in the water, which the water
// fills again; what runs out from it is the ring. Linear water waves take it
// from there: the crater, an axisymmetric depression η₀(r) = −a·exp(−r²/2s²)
// (CRATER: its depth a and width s) at rest, evolves as
//     η(r, t) = ∫ H(k) cos(ω(k) t) e^(−2νk²t) J₀(kr) k dk,
//     H(k) = −a s² exp(−k²s²/2)                        (its Hankel transform)
//     ω² = g k + (σ/ρ) k³                              (deep water, surface tension)
// with water's kinematic viscosity ν. Capillary waves are fast where short,
// gravity waves fast where long, and between them the slowest waves go
// 0.23 m/s at 1.7 cm: the ring is a train of crests, the short ones running
// ahead, closing up behind on that slowest wavelength, as rain's rings do on
// a pond. Its radial slope is −∫ H(k) cos(ωt) e^(−2νk²t) J₁(kr) k² dk.
// Both are summed here by the trapezoid rule over k up to K_SPAN/s, in
// K_STEPS steps (a step under π/R_MAX, so J₀(kR) is resolved at the table's
// edge), with the Bessel functions the shaders use (tools/ring-probe.mjs).
//
// The table: PROFILE_RADII radii from 0 to R_MAX and PROFILE_TIMES times
// from 0 to T_MAX, each holding the height (millimetres) and the radial
// slope, written as little-endian float32s, time-major (the shader fades the
// ring out over the table's last EDGE_SHARE of radius, where only the
// capillary forerunners reach, and its last FADE_SHARE of time); ring.json holds the
// sizes, the physical constants, the crater, the units and the slope
// spectrum below. src/rain.js
// uploads it as a half-float texture and draws each drop from it, scaled to
// its size f as a capillary ring scales, η_f(r, t) = f·η(r/f, t/f^1.5)
// (exact for pure capillary waves, near enough at these sizes).
//
// The slope spectrum, for the water shader's roughness: by Campbell's theorem
// rings dropped at random at a rate λ (per m² per second) give the water a
// slope variance per axis of λ/2 ∫∫ |∇η|² dA dt, and by Parseval for the
// Hankel transform ∫|∇η|² dA = 2π ∫ k³ H(k)² cos²(ωt) e^(−4νk²t) dk, so
// SLOPE_POWER[k] = 2π k³ H(k)² ∫ cos²(ωt) e^(−4νk²t) fade(t)² dt over the
// ring's life (fade: the drawn ring fades out over its last FADE_SHARE, as
// the shader fades it). It is printed at log-spaced wavenumbers and written
// to ring.json; src/rain.js computes it again for each rain's ring life and
// spreads it over its tile's lattice to find what each mip level loses, as
// src/ambientWaves.js does for the wind's ripples.
//
// The splashes (SPLASH in src/shaders/rain.js, every length of it the
// reference drop's scaled by a drop's size, every time by its size to
// SPLASH.timePower): for each intensity of
// RAIN, the timeline of its biggest drop's splash and its slot's period
// (rainSchedule, src/rain.js), and checks that the splash's phases come in
// order (the crown, then a bubble or the jet); that the longest splash with
// no bubble (the jet, and a droplet pinched off at its peak from the tallest
// jet, flying on up and back to the water) is over before the slot's next
// drop, so a slot's point never has two splashes to show; that a jet's fall
// spans six frames or more at 60 fps, a motion rather than a flash; that the shortest
// bubble fits under the cap the shader puts on a bubble's life (the period,
// less when the bubble starts, less 0.02 s), with what share of the bubble
// lives the cap cuts; and that the drops that leave a bubble and the jets
// that throw a droplet are drawn from the two ends of one hash without
// overlapping (bubbleShare + droplet.share at most 1).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPLASH } from '../src/shaders/rain.js';
import { RAIN, rainSchedule } from '../src/rain.js';

const GRAVITY = 9.81;
const SURFACE_TENSION_OVER_DENSITY = 7.2e-5;   // m³/s², as src/ambientWaves.js
const VISCOSITY = 1.0e-6;                      // m²/s, water at 20 °C
export const CRATER = { depth: 0.003, width: 0.0025 };   // a and s, metres: a 2 mm drop's crater, the reference drop
const R_MAX = 0.3;            // metres
const T_MAX = 0.8;            // seconds
const PROFILE_RADII = 384;
const PROFILE_TIMES = 192;
const K_SPAN = 7;             // k up to K_SPAN/s: exp(−K_SPAN²/2) of the crater's spectrum is left out
const K_STEPS = 2400;
export const FADE_SHARE = 0.3;   // the drawn ring fades out over this last share of T_MAX...
export const EDGE_SHARE = 0.15;  // ...and over this last share of R_MAX, so the table's edge cuts nothing sharply
const SPECTRUM_POINTS = 48;

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(repository, 'assets', 'rain');

// ---- Bessel functions, as the shaders evaluate them (Abramowitz and Stegun 9.4.1 to 9.4.6) ----
function besselJ0(argument) {
  const magnitude = Math.abs(argument);
  if (magnitude <= 3) {
    const ratio = (magnitude / 3) ** 2;
    return 1 + ratio * (-2.2499997 + ratio * (1.2656208 + ratio * (-0.3163866 + ratio * (0.0444479 + ratio * (-0.0039444 + ratio * 0.00021)))));
  }
  const inverse = 3 / magnitude;
  const amplitude = 0.79788456 + inverse * (-0.00000077 + inverse * (-0.0055274 + inverse * (-0.00009512 + inverse * (0.00137237 + inverse * (-0.00072805 + inverse * 0.00014476)))));
  const phase = magnitude - 0.78539816 + inverse * (-0.04166397 + inverse * (-0.00003954 + inverse * (0.00262573 + inverse * (-0.00054125 + inverse * (-0.00029333 + inverse * 0.00013558)))));
  return amplitude * Math.cos(phase) / Math.sqrt(magnitude);
}
function besselJ1(argument) {
  const magnitude = Math.abs(argument);
  let value;
  if (magnitude <= 3) {
    const ratio = (magnitude / 3) ** 2;
    value = magnitude * (0.5 + ratio * (-0.56249985 + ratio * (0.21093573 + ratio * (-0.03954289 + ratio * (0.00443319 + ratio * (-0.00031761 + ratio * 0.00001109))))));
  } else {
    const inverse = 3 / magnitude;
    const amplitude = 0.79788456 + inverse * (0.00000156 + inverse * (0.01659667 + inverse * (0.00017105 + inverse * (-0.00249511 + inverse * (0.00113653 - inverse * 0.00020033)))));
    const phase = magnitude - 2.35619449 + inverse * (0.12499612 + inverse * (0.0000565 + inverse * (-0.00637879 + inverse * (0.00074348 + inverse * (0.00079824 - inverse * 0.00029166)))));
    value = amplitude * Math.cos(phase) / Math.sqrt(magnitude);
  }
  return argument < 0 ? -value : value;
}

export const angularFrequency = (wavenumber) => Math.sqrt(GRAVITY * wavenumber + SURFACE_TENSION_OVER_DENSITY * wavenumber ** 3);
const craterSpectrum = (wavenumber) => -CRATER.depth * CRATER.width ** 2 * Math.exp(-0.5 * (wavenumber * CRATER.width) ** 2);
/** How much of the ring the shader draws at `time` (seconds): all of it, fading out over its last FADE_SHARE of T_MAX. */
export const ringFade = (time) => {
  const fraction = Math.min(Math.max((T_MAX - time) / (FADE_SHARE * T_MAX), 0), 1);
  return fraction * fraction * (3 - 2 * fraction);
};

// The wavenumbers and their weights (trapezoid), with H(k)·k and H(k)·k² precomputed.
const kMaximum = K_SPAN / CRATER.width;
const kStep = kMaximum / K_STEPS;
const wavenumbers = Float64Array.from({ length: K_STEPS + 1 }, (unused, index) => index * kStep);
const weights = Float64Array.from({ length: K_STEPS + 1 }, (unused, index) => (index === 0 || index === K_STEPS ? 0.5 : 1) * kStep);
const frequencies = wavenumbers.map(angularFrequency);

/** The ring's height (m) and radial slope at radius `radius` (m) and time `time` (s). */
export function ring(radius, time) {
  let height = 0, slope = 0;
  for (let index = 1; index <= K_STEPS; index++) {
    const wavenumber = wavenumbers[index];
    const amplitude = weights[index] * craterSpectrum(wavenumber) * Math.cos(frequencies[index] * time) * Math.exp(-2 * VISCOSITY * wavenumber * wavenumber * time) * wavenumber;
    height += amplitude * besselJ0(wavenumber * radius);
    slope -= amplitude * wavenumber * besselJ1(wavenumber * radius);
  }
  return { height, slope };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = [];
  function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

  // 0. The quadrature: a step under π/R_MAX, and the crater at t = 0 is the Gaussian.
  check(kStep * R_MAX < Math.PI, `k step ${kStep.toFixed(2)}/m: kR at the table's edge moves ${(kStep * R_MAX).toFixed(2)} rad a step, under π`);
  let worstStart = 0;
  for (const radius of [0, 0.001, 0.0025, 0.005, 0.01]) {
    const expected = -CRATER.depth * Math.exp(-0.5 * (radius / CRATER.width) ** 2);
    worstStart = Math.max(worstStart, Math.abs(ring(radius, 0).height - expected) / CRATER.depth);
  }
  check(worstStart < 1e-3, `at t = 0 the sum is the crater to ${(worstStart * 100).toFixed(3)}% of its depth`);

  // 1. The timeline: where the ring's leading crest and its steepest slope are, and how high.
  console.log('\n  time    leading edge   steepest at    slope   crest-to-trough   (the ring at each time; edge: last radius above 2% of the peak slope)');
  const timeline = [];
  for (const time of [0.05, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8]) {
    let steepest = 0, steepestAt = 0, highest = -Infinity, lowest = Infinity;
    const samples = [];
    for (let step = 0; step <= 400; step++) {
      const radius = (step / 400) * R_MAX;
      const { height, slope } = ring(radius, time);
      samples.push({ radius, slope });
      if (Math.abs(slope) > steepest) { steepest = Math.abs(slope); steepestAt = radius; }
      if (radius > 0.01) { highest = Math.max(highest, height); lowest = Math.min(lowest, height); }
    }
    const edge = samples.filter((sample) => Math.abs(sample.slope) > 0.02 * steepest).at(-1)?.radius ?? 0;
    timeline.push({ time, edge, steepestAt, steepest });
    console.log(`  ${time.toFixed(2)} s   ${(edge * 100).toFixed(1).padStart(6)} cm     ${(steepestAt * 100).toFixed(1).padStart(6)} cm    ${steepest.toFixed(4)}   ${((highest - lowest) * 1000).toFixed(3)} mm`);
  }
  const minimumSpeed = Math.min(...Array.from({ length: 2000 }, (unused, index) => { const wavenumber = 10 + index; return angularFrequency(wavenumber) / wavenumber; }));
  check(Math.abs(minimumSpeed - 0.23) < 0.01, `the slowest waves go ${minimumSpeed.toFixed(3)} m/s (capillary-gravity minimum, about 0.23)`);
  const late = timeline.find((entry) => entry.time === 0.4);
  check(late.steepestAt / 0.4 > 0.15 && late.steepestAt / 0.4 < 0.4, `at 0.4 s the steepest crest is ${(late.steepestAt * 100).toFixed(1)} cm out: ${(late.steepestAt / 0.4).toFixed(2)} m/s, near the group speed of the slowest waves`);
  // Where the shader's radial fade starts only the capillary forerunners
  // reach, late in the ring's life, when its time fade has begun: the slope
  // drawn there stays under 0.001 (a reflection moved by a tenth of a degree).
  let worstEdge = 0, worstEdgeTime = 0;
  for (let step = 1; step <= 40; step++) {
    const time = (step / 40) * T_MAX;
    let atEdge = 0;
    for (let index = 0; index <= 20; index++) atEdge = Math.max(atEdge, Math.abs(ring(R_MAX * (1 - EDGE_SHARE * (1 - index / 20)), time).slope));
    if (atEdge * ringFade(time) > worstEdge) { worstEdge = atEdge * ringFade(time); worstEdgeTime = time; }
  }
  check(worstEdge < 0.001, `beyond ${((1 - EDGE_SHARE) * R_MAX * 100).toFixed(1)} cm, where the drawn ring fades, its drawn slope is at most ${worstEdge.toFixed(5)} (at ${worstEdgeTime.toFixed(2)} s)`);

  // 2. The slope spectrum (per drop): 2π k³ H(k)² ∫ cos²(ωt) e^(−4νk²t) fade(t)² dt.
  const spectrumWavenumbers = Array.from({ length: SPECTRUM_POINTS }, (unused, index) => 20 * (kMaximum / 20) ** (index / (SPECTRUM_POINTS - 1)));
  const TIME_STEPS = 2000;
  const slopePower = spectrumWavenumbers.map((wavenumber) => {
    let timeIntegral = 0;
    for (let step = 0; step <= TIME_STEPS; step++) {
      const time = (step / TIME_STEPS) * T_MAX;
      const weight = (step === 0 || step === TIME_STEPS ? 0.5 : 1) * (T_MAX / TIME_STEPS);
      timeIntegral += weight * Math.cos(angularFrequency(wavenumber) * time) ** 2 * Math.exp(-4 * VISCOSITY * wavenumber * wavenumber * time) * ringFade(time) ** 2;
    }
    return 2 * Math.PI * wavenumber ** 3 * craterSpectrum(wavenumber) ** 2 * timeIntegral;
  });
  // ∫ P dk by the trapezoid rule on the log-spaced points: the slope variance per axis is rate/2 times it.
  let slopeIntegral = 0;
  for (let index = 1; index < SPECTRUM_POINTS; index++) slopeIntegral += 0.5 * (slopePower[index] + slopePower[index - 1]) * (spectrumWavenumbers[index] - spectrumWavenumbers[index - 1]);
  const peakIndex = slopePower.indexOf(Math.max(...slopePower));
  console.log(`\n  the slope spectrum peaks at k = ${spectrumWavenumbers[peakIndex].toFixed(0)}/m (${(2 * Math.PI / spectrumWavenumbers[peakIndex] * 100).toFixed(2)} cm); per axis, a rain of 100 rings per m² per second gives an rms slope of ${Math.sqrt(50 * slopeIntegral).toFixed(4)}`);

  // 3. The splashes: each intensity's biggest drop, its splash's timeline and its slot's period.
  console.log('\n  the splashes (each intensity\'s biggest drop: SPLASH scaled by its size)');
  console.log('  rain     size   crown    bubble from   jet from-to         tallest jet   droplet lands   period');
  const { crown, jet, droplet, bubble, gravity } = SPLASH;
  for (const [intensity, rain] of Object.entries(RAIN)) {
    const { period } = rainSchedule(rain);
    const biggest = Math.max(...rain.sizes);
    const slowest = biggest ** SPLASH.timePower, quickest = Math.min(...rain.sizes) ** SPLASH.timePower;   // the times' scales (lengths scale with the size itself)
    // A droplet pinched off the tallest jet at its peak, flying on up by its
    // highest rise and back to the water: H + v·t − g·t²/2 = 0.
    const tallest = jet.heights[1] * biggest;
    const launchSpeed = Math.sqrt(2 * gravity * tallest * droplet.rise[1]);
    const jetTo = jet.from + jet.rise + jet.fall;
    const pinchedAt = (jet.from + jet.rise) * slowest;
    const flight = (launchSpeed + Math.sqrt(launchSpeed * launchSpeed + 2 * gravity * tallest)) / gravity;
    const dropletLands = pinchedAt + flight;
    const bubbleFrom = bubble.from * slowest;
    console.log(`  ${intensity.padEnd(7)} ${biggest.toFixed(1).padStart(4)}   ${(crown.life * slowest).toFixed(4)} s   ${bubbleFrom.toFixed(4)} s      ${(jet.from * slowest).toFixed(3)}–${(jetTo * slowest).toFixed(3)} s     ${(tallest * 1000).toFixed(1).padStart(5)} mm      ${dropletLands.toFixed(3)} s         ${period.toFixed(3)} s`);
    check(crown.life < bubble.from && bubble.from < jet.from && jet.rise > 0 && jet.fall > 0,
      `${intensity}: the splash's phases are in order: the crown (to ${crown.life} s), a bubble (from ${bubble.from} s), the jet (${jet.from} s, up in ${jet.rise}, down in ${jet.fall}), of the reference drop`);
    const longestUncut = Math.max(jetTo * slowest, dropletLands);
    check(longestUncut < period,
      `${intensity}: the longest splash with no bubble (a droplet off the tallest jet, landing at ${dropletLands.toFixed(3)} s; the jet down by ${(jetTo * slowest).toFixed(3)} s) is over before the slot's next drop, ${period.toFixed(3)} s on`);
    // At 60 frames a second the jet's fall alone spans frames enough to be seen as a motion, not a flash.
    check(jet.fall * quickest * 60 >= 6,
      `${intensity}: the smallest drop's jet falls over ${(jet.fall * quickest * 60).toFixed(1)} frames at 60 fps, 6 or more`);
    const cap = period - bubbleFrom - 0.02;
    const cut = Math.min(Math.max((bubble.lives[1] - cap) / (bubble.lives[1] - bubble.lives[0]), 0), 1);
    const bubblesCut = 1 - Math.sqrt(1 - cut);   // a bubble's life is drawn as the square of a hash, most short
    check(bubble.lives[0] <= cap,
      `${intensity}: the shortest bubble (${bubble.lives[0]} s) fits under the cap on its life (${cap.toFixed(3)} s: the period less its start, less 0.02 s); the cap cuts ${(cut * 100).toFixed(1)}% of the lives' range (${(bubblesCut * 100).toFixed(1)}% of the bubbles)`);
    check(rain.bubbleShare + droplet.share <= 1,
      `${intensity}: the bubbles' share (${rain.bubbleShare}) and the droplets' (${droplet.share}) do not overlap in the one hash: ${(rain.bubbleShare + droplet.share).toFixed(2)}, at most 1`);
  }

  if (process.argv.includes('--write')) {
    const table = new Float32Array(PROFILE_TIMES * PROFILE_RADII * 2);
    for (let timeIndex = 0; timeIndex < PROFILE_TIMES; timeIndex++) {
      const time = (timeIndex / (PROFILE_TIMES - 1)) * T_MAX;
      for (let radiusIndex = 0; radiusIndex < PROFILE_RADII; radiusIndex++) {
        const { height, slope } = ring((radiusIndex / (PROFILE_RADII - 1)) * R_MAX, time);
        table[2 * (timeIndex * PROFILE_RADII + radiusIndex)] = height * 1000;
        table[2 * (timeIndex * PROFILE_RADII + radiusIndex) + 1] = slope;
      }
    }
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'ring_profile.bin'), Buffer.from(table.buffer));
    const measurement = {
      source: 'tools/rain-probe.mjs',
      physics: { gravity: GRAVITY, surfaceTensionOverDensity: SURFACE_TENSION_OVER_DENSITY, viscosity: VISCOSITY },
      crater: CRATER,
      radius: R_MAX, radii: PROFILE_RADII, time: T_MAX, times: PROFILE_TIMES,
      profile: 'ring_profile.bin',
      units: { height: 'mm', slope: 'm/m' },
      fadeShare: FADE_SHARE,
      edgeShare: EDGE_SHARE,
      slopeSpectrum: { wavenumbers: spectrumWavenumbers.map((value) => Number(value.toPrecision(6))), power: slopePower.map((value) => Number(value.toPrecision(6))) },
    };
    await writeFile(path.join(output, 'ring.json'), `${JSON.stringify(measurement, null, 2)}\n`);
    console.log(`wrote ${path.relative(repository, output)}/ring.json and ring_profile.bin (${table.byteLength} bytes)`);
  }

  if (failures.length) { console.log(`rain-probe: ${failures.length} checks fail`); process.exit(1); }
  console.log('rain-probe: all checks pass');
}
