// CPU probe of the rings (src/rings.js): the waves a stone's splash sends
// across the whole pond, evolved by exact linear theory instead of the 6 m
// solver. It prints, and checks where it says so:
//   1. The rings against the solver. An isolated ring source (stampCavity's,
//      for a 1.5, 4, 6 and 16 cm stone dropped straight in at 6.3 m/s)
//      evolved by the solver as src/spectralWater.js does it: its 512²
//      lattice over 6 m, its injection (SPECTRAL_UPDATE_FRAGMENT: 2πσ²·shape
//      per mode, σ at least 0.6 texels), its dispersion and its damping, the
//      per-mode rotation and decay composing exactly over frames, so the
//      state at t is the injected spectrum times one propagator, summed along
//      the row through the splat's centre. Against it, the rings' answer for
//      the same splat with the solver's damping in place of the film's: their
//      Hankel integral, and their GPU scheme (the spectrum and profile passes
//      done on arrays at the source's own sampling, read back with the water
//      shader's linear interpolation between texels; the near-field mask
//      left out, the solver having none). Out to 2 m and up to 2 s after
//      its release, before anything wraps around the patch, the height and
//      the slope must agree to 3% of their largest (the 1.5 cm pebble's to
//      15%: the solver's grid cuts its shortest waves, which the rings keep).
//   2. Every ring source a splash makes, made as the app makes them (the
//      splash handing them to RingSources: each stone size thrown as the app
//      throws, at the reference aim, and the reference stone dropped straight
//      in): its splats, its sampling (Δk, wavenumbers, reach) and its
//      retirement. Checked against the exact profile (float64, half the
//      plan's Δk, so nothing folds back): the largest slope anywhere when the
//      ring retires must be under SLOPE_VISIBLE (a ring never vanishes while
//      it shows), and the time it really falls under it is found; and at six
//      ages the scheme, as the water reads it (its annulus, the wavenumbers it
//      sums that frame, its near-field mask), must match the exact profile
//      (with the same mask) over its reach and a third beyond (where it draws
//      nothing) to within SLOPE_VISIBLE/2 plus 2% of the ring's steepest
//      slope then: no image folds back into what is drawn, and neither the
//      taper, the annulus nor the wavenumbers left out cut anything that
//      shows (2%, not 1%: the 1.5 cm pebble's capillary waves, 4 cm long
//      where they pile up at the slowest group speed, lie 10 texels to a wave
//      at 8 s, so a straight line between texels misses 5% of them, under a
//      tenth of a pixel's turn; other rings stay under 1%, and pixels coarser
//      than a texel read the mip chain). For an oblique throw's ring (its
//      splats strung along the throw)
//      it measures how much stronger it runs ahead than behind, and what the
//      rings leave out, the parts m ≥ 2: the sum of every splat's own ring
//      about its own centre against the m ≤ 1 parts, ahead, behind and to the
//      sides, at 1, 2 and 4 s (src/rings.js says why they are left out; the
//      check only guards against their growing, at 40%).
//   3. The reference vertical drop (a 3 cm-radius stone entering at 6.3 m/s,
//      as tools/basilisk/ simulates it) against that simulation's ring
//      continued linearly from 1 s (tools/basilisk/results/rings_linear.md,
//      REFERENCE below): at 0.5, 0.75, 1, 1.5 and 2 m, the ring's height from
//      trough to crest (the largest swing within any 0.6 s), when its highest
//      crest passes and its wavelength (twice the time between the zero
//      crossings either side of it, by the dispersion), measured as
//      rings.py measures the reference, with the reference's damping (2νk²,
//      the film off) and with the app's (the film on). With the film off it
//      must match the reference within 15% at 0.75 to 2 m, its crest within
//      5% of the time and its wavelength within 15%; at 0.5 m, where the
//      reference's window holds the near field, the height within 30% and the
//      crest within 5%, its wavelength only printed. It also prints the
//      ring with the solver's near-field splats (the jet's mound and base,
//      their damping), and the steepest slope and largest height at 0.5 m.
//   4. The cost of a frame while rings live: each ring's profile pass at ages
//      from 0.1 to 60 s (its texels in the annulus times the wavenumbers it
//      sums: fetches), and a minute of throwing (the default stone every 3 to
//      5 s at random places on the water in view, for 60 s, then quiet): how
//      many rings live, the profile passes' fetches, and the lookups the
//      water's pixels (the home view on a desktop and a phone's), the floor's
//      (of the rings its caustics take, RingSources.updateCaustics) and the
//      inner patch's vertices make, at each quality preset's limit of live
//      rings, and with a stone every 1.5 s at High's and Low's (which that
//      fills); and the CPU's: planning a source (once),
//      Rings.update's bookkeeping (each frame, on a stand-in renderer), and
//      a zoom's planning the live rings again, which must take one a frame.
// With --gpu (or --gpu=half, the half-float path) it also loads the page
// headless, throws the reference stone and reads back the rings' spectrum
// and profiles 1 and 6 s after the impact, against the same sums in float64:
// the shaders' arithmetic must stay under SLOPE_VISIBLE/2 of slope, beyond
// what storing the profile in half floats rounds (2^-11 of its largest).
// --all runs section 2 for every stone size (the default runs the 1.5, 6 and
// 16 cm stones and the vertical drop). Exits with status 1 if a check fails.
//
//   node tools/ring-probe.mjs [--all] [--gpu[=half]]
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { SplashSystem } from '../src/splash.js';
import { Rock, throwFlightTime } from '../src/rock.js';
import { DAMPING } from '../src/spectralWater.js';
import { QUALITY } from '../src/main.js';
import {
  RingSources, Rings, planSource, innerRadius, outerRadius, usedCount, nearField, texelsBetween, ringFrequency, ringGroupSpeed, ringDamping, splatSpectrum, profileRadius,
  INNER_SHARE, SLOWEST_GROUP_SPEED, PROFILE_TEXELS, PROFILE_MAPPING, DIRECT_LIMIT, TAPER_START, SLOPE_VISIBLE, RING_DAMPING, RING_SOURCE, REACH, WINDOW,
  MAX_RINGS, MAX_WAVENUMBERS, MAX_GROUPS, COEFFICIENT_SCALE, RING_TEXTURE_UNITS, FADE_SECONDS, CAUSTIC_RINGS, CAUSTIC_FADE_SECONDS,
} from '../src/rings.js';

const started = performance.now();
const everySize = process.argv.includes('--all');
const gpuArgument = process.argv.find((argument) => argument.startsWith('--gpu'));
const GRAVITY = 9.81;
const POND_DEPTH = 0.8;
const DOMAIN_SIZE = 6;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const REFERENCE_SPEED = 6.3;   // m/s: the reference vertical drop's entry speed
// The reference simulation's ring (tools/basilisk/results/rings_linear.md:
// the level-12 run continued linearly from 1.0 s, damped by 2νk²): at each
// distance its height from trough to crest (mm), when its highest crest
// passes (s after contact) and its wavelength (cm).
const REFERENCE = [
  { distance: 0.5, height: 16.60, crest: 1.47, wavelength: 49.0, tolerance: 0.3, wavelengthTolerance: Infinity },
  { distance: 0.75, height: 11.74, crest: 1.87, wavelength: 45.6, tolerance: 0.15, wavelengthTolerance: 0.15 },
  { distance: 1.0, height: 8.86, crest: 2.68, wavelength: 36.1, tolerance: 0.15, wavelengthTolerance: 0.15 },
  { distance: 1.5, height: 5.87, crest: 3.83, wavelength: 42.3, tolerance: 0.15, wavelengthTolerance: 0.15 },
  { distance: 2.0, height: 4.23, crest: 4.97, wavelength: 45.6, tolerance: 0.15, wavelengthTolerance: 0.15 },
];
let failures = 0;
function check(passed, message) {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${message}`);
  if (!passed) failures++;
}
const millimetres = (metres) => (metres * 1000).toFixed(2);
const exponent = (value) => value.toExponential(2);
const smoothstep = (low, high, value) => {
  const fraction = Math.min(Math.max((value - low) / (high - low), 0), 1);
  return fraction * fraction * (3 - 2 * fraction);
};

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

// ---- damping: the rings' (a pond's surface film), the reference simulation's (2νk², no film) and the solver's (DAMPING) ----
const filmDamping = (wavenumber) => ringDamping(wavenumber, POND_DEPTH);
const cleanDamping = (wavenumber) => 2 * RING_DAMPING.viscosity * wavenumber * wavenumber;
const SOLVER_DAMPING_WAVENUMBER = 2 * Math.PI / DAMPING.baseWavelength;
const SOLVER_LOW_WAVENUMBER = 2 * Math.PI / (DOMAIN_SIZE * DAMPING.lowShare);
const solverDamping = (wavenumber) => DAMPING.base * Math.min(wavenumber / SOLVER_DAMPING_WAVENUMBER, 1)
  + DAMPING.viscosity * wavenumber * wavenumber + (wavenumber < SOLVER_LOW_WAVENUMBER ? DAMPING.low : 0);
const dampingName = (damping) => (damping === filmDamping ? 'film' : damping === cleanDamping ? 'clean' : 'solver');

// ---- a source's spectrum: the weights w = k·Δk·Σ_groups W e^{−γτ}[Ĥ cos ωτ + V̂ sin(ωτ)/ω] (RING_SPECTRUM_FRAGMENT) ----
/**
 * The m = 0 and m = 1 weights of `source` at world time `time`, on the grid
 * (j + ½)·step, j < count (the first `used` of them); with `windowReach`
 * (the scheme's, as the spectrum pass does it) each wavenumber faded out as
 * its packet passes WINDOW times that reach; without it, the plain sum. What
 * does not change with time (ω, c_g, γ, and each group's Ĥ and V̂ for m = 0
 * and 1: its splat's height and velocity, its pair's height) is kept per
 * source and sampling.
 */
const spectrumTerms = new WeakMap();
function termsOf(source, step, count, damping) {
  let bySampling = spectrumTerms.get(source);
  if (!bySampling) spectrumTerms.set(source, bySampling = new Map());
  const key = `${step}:${count}:${dampingName(damping)}`;
  if (bySampling.has(key)) return bySampling.get(key);
  const omega = new Float64Array(count), speed = new Float64Array(count), decayRate = new Float64Array(count);
  const groups = source.groups.map(() => ({ height0: new Float64Array(count), height1: new Float64Array(count), velocity0: new Float64Array(count), velocity1: new Float64Array(count) }));
  for (let index = 0; index < count; index++) {
    const wavenumber = (index + 0.5) * step;
    omega[index] = ringFrequency(wavenumber, POND_DEPTH);
    speed[index] = ringGroupSpeed(wavenumber, POND_DEPTH);
    decayRate[index] = damping(wavenumber);
    source.groups.forEach((group, which) => {
      const shape = splatSpectrum(wavenumber, group.sigma, group.rim);
      const alongZeroth = besselJ0(wavenumber * group.offset);
      const alongFirst = 2 * besselJ1(wavenumber * group.offset);
      let heightZeroth = group.height * shape * alongZeroth;
      let heightFirst = group.height * shape * alongFirst;
      if (group.pair) {
        const pairShape = group.pair.sigma ** 2 * Math.exp(-0.5 * group.pair.sigma ** 2 * wavenumber * wavenumber) * group.pair.height;
        const behind = wavenumber * (group.offset - group.pair.offset);
        const ahead = wavenumber * (group.offset + group.pair.offset);
        heightZeroth += pairShape * (besselJ0(ahead) - besselJ0(behind));
        heightFirst += 2 * pairShape * (besselJ1(ahead) - besselJ1(behind));
      }
      const terms = groups[which];
      terms.height0[index] = heightZeroth;
      terms.height1[index] = heightFirst;
      terms.velocity0[index] = group.velocity * shape * alongZeroth;
      terms.velocity1[index] = group.velocity * shape * alongFirst;
    });
  }
  const terms = { omega, speed, decayRate, groups };
  bySampling.set(key, terms);
  return terms;
}
function ringWeights(source, time, { step, count, used = count, damping = filmDamping, windowReach = 0 }) {
  const { omega, speed, decayRate, groups } = termsOf(source, step, count, damping);
  const zeroth = new Float64Array(used);
  const first = new Float64Array(used);
  source.groups.forEach((group, which) => {
    const age = time - group.start;
    if (age < 0) return;
    const terms = groups[which];
    for (let index = 0; index < used; index++) {
      const window = windowReach > 0 ? 1 - smoothstep(WINDOW.start * windowReach, WINDOW.end * windowReach, speed[index] * age) : 1;
      if (window === 0) continue;
      const decay = Math.exp(-decayRate[index] * age) * window;
      const cosine = Math.cos(omega[index] * age);
      const sineOverOmega = Math.sin(omega[index] * age) / omega[index];
      zeroth[index] += decay * (terms.height0[index] * cosine + terms.velocity0[index] * sineOverOmega);
      first[index] += decay * (terms.height1[index] * cosine + terms.velocity1[index] * sineOverOmega);
    }
  });
  for (let index = 0; index < used; index++) {
    const wavenumber = (index + 0.5) * step;
    zeroth[index] *= wavenumber * step;
    first[index] *= wavenumber * step;
  }
  return { zeroth, first, step, count: used };
}

// ---- the near-field mask (NEAR_FIELD, RING_PROFILE_FRAGMENT) ----
/** The share of the ring shown at a radius and the share's slope, for a source's nearField(). */
function nearFieldShown(near, radius) {
  const width = Math.max(near.outer - near.inner, 1e-6);
  const across = Math.min(Math.max((radius - near.inner) / width, 0), 1);
  return { shown: 1 - near.hide * (1 - across ** 3 * (10 - 15 * across + 6 * across * across)), slope: near.hide * 30 * across * across * (1 - across) ** 2 / width };
}

// ---- the profile pass (RING_PROFILE_FRAGMENT) on arrays, in float64 ----
/**
 * Texel i of the profile at radius profileRadius(i/(PROFILE_TEXELS − 1), reach):
 * (∂η0/∂r, ∂η1/∂r, η1, η0) in metres, tapered, as the shader writes it (before
 * RING_TEXTURE_UNITS): zero outside [inner, outer], J0 and J1 in full below
 * kr = DIRECT_LIMIT, above it their first-order Hankel asymptotics with the
 * phase advanced by rotation; the near field `near` (nearField) masked.
 */
function schemeProfile(weights, reach, inner = 0, outer = Infinity, near = null) {
  const { zeroth, first, step, count } = weights;
  const profile = new Float64Array(4 * PROFILE_TEXELS);
  for (let texel = 0; texel < PROFILE_TEXELS; texel++) {
    const radius = profileRadius(texel / (PROFILE_TEXELS - 1), reach);
    if (radius < inner || radius > outer) continue;
    const directCount = Math.min(count, Math.max(0, Math.ceil(DIRECT_LIMIT / (radius * step) - 0.5)));
    let height0 = 0, slope0 = 0, height1 = 0, slope1 = 0;
    for (let index = 0; index < directCount; index++) {
      const wavenumber = (index + 0.5) * step;
      const argument = wavenumber * radius;
      const j0 = besselJ0(argument), j1 = besselJ1(argument);
      height0 += zeroth[index] * j0;
      slope0 -= zeroth[index] * wavenumber * j1;
      height1 += first[index] * j1;
      slope1 += first[index] * wavenumber * (j0 - (argument > 1e-6 ? j1 / argument : 0.5));
    }
    if (directCount < count) {
      let cosine = Math.cos((directCount + 0.5) * step * radius - 0.25 * Math.PI);
      let sine = Math.sin((directCount + 0.5) * step * radius - 0.25 * Math.PI);
      const turnCosine = Math.cos(step * radius), turnSine = Math.sin(step * radius);
      let cosineSum0 = 0, sineSum0 = 0, scaledSineSum0 = 0, sineSum1 = 0, cosineSum1 = 0, scaledCosineSum1 = 0;
      for (let index = directCount; index < count; index++) {
        const wavenumber = (index + 0.5) * step;
        const root = Math.sqrt(wavenumber);
        const zerothOverRoot = zeroth[index] / root, firstOverRoot = first[index] / root;
        cosineSum0 += zerothOverRoot * cosine;
        sineSum0 += zerothOverRoot / wavenumber * sine;
        scaledSineSum0 += zerothOverRoot * wavenumber * sine;
        sineSum1 += firstOverRoot * sine;
        cosineSum1 += firstOverRoot / wavenumber * cosine;
        scaledCosineSum1 += firstOverRoot * wavenumber * cosine;
        const nextCosine = cosine * turnCosine - sine * turnSine;
        sine = sine * turnCosine + cosine * turnSine;
        cosine = nextCosine;
      }
      const amplitude = Math.sqrt(2 / (Math.PI * radius));
      const inverse = 1 / (8 * radius);
      height0 += amplitude * (cosineSum0 + sineSum0 * inverse);
      slope0 -= amplitude * (scaledSineSum0 + 3 * cosineSum0 * inverse);
      height1 += amplitude * (sineSum1 + 3 * cosineSum1 * inverse);
      slope1 += amplitude * (scaledCosineSum1 - 7 * sineSum1 * inverse);
    }
    if (near) {
      const { shown, slope } = nearFieldShown(near, radius);
      slope0 = shown * slope0 + slope * height0;
      slope1 = shown * slope1 + slope * height1;
      height0 *= shown;
      height1 *= shown;
    }
    const taper = 1 - smoothstep(TAPER_START * reach, reach, radius);
    profile.set([slope0 * taper, slope1 * taper, height1 * taper, height0 * taper], 4 * texel);
  }
  return profile;
}
/** The profile the app draws for `source` at world time `time`: its plan's sampling, the wavenumbers it sums then, the window, its annulus and (with `mask`) its near field. */
function drawnProfile(source, time, { damping = filmDamping, mask = true } = {}) {
  const plan = source.plan;
  const weights = ringWeights(source, time, { step: plan.step, count: plan.count, used: usedCount(source, time), damping, windowReach: plan.reach });
  const inner = innerRadius(source, time);
  return schemeProfile(weights, plan.reach, inner, Math.max(outerRadius(source, time), inner), mask ? nearField(source, time) : null);
}
/** The profile as the water shader reads it at mip level 0 (linear between texel centres): (∂η0/∂r, ∂η1/∂r, η1, η0). */
function readProfile(profile, reach, radius) {
  if (radius >= reach) return [0, 0, 0, 0];
  const position = 0.5 * (Math.sqrt(PROFILE_MAPPING ** 2 + 4 * (1 + PROFILE_MAPPING) * radius / reach) - PROFILE_MAPPING);
  const texel = Math.min(Math.max(position * (PROFILE_TEXELS - 1), 0), PROFILE_TEXELS - 1);
  const lower = Math.min(Math.floor(texel), PROFILE_TEXELS - 2);
  const fraction = texel - lower;
  return [0, 1, 2, 3].map((channel) => profile[4 * lower + channel] * (1 - fraction) + profile[4 * (lower + 1) + channel] * fraction);
}

// ---- the exact profile: float64 sums of J0 and J1 at any radius ----
/**
 * η0, ∂η0/∂r, η1 and ∂η1/∂r at each of `radii` from the weights, with J0
 * and J1 in full up to kr = 25 and above it to second order in 1/(kr)
 * (relative error under 1e-6), the phase advanced by rotation and
 * recomputed every 64 terms; with `near` (nearField), masked as the profile
 * pass masks it. Arrays of the radii's length.
 */
function exactProfile(weights, radii, near = null) {
  const { zeroth, first, step, count } = weights;
  const heights0 = new Float64Array(radii.length), slopes0 = new Float64Array(radii.length);
  const heights1 = new Float64Array(radii.length), slopes1 = new Float64Array(radii.length);
  const quarter = 0.25 * Math.PI;
  radii.forEach((radius, which) => {
    const directCount = Math.min(count, Math.max(0, Math.ceil(25 / (radius * step) - 0.5)));
    let height0 = 0, slope0 = 0, height1 = 0, slope1 = 0;
    for (let index = 0; index < directCount; index++) {
      const wavenumber = (index + 0.5) * step;
      const argument = wavenumber * radius;
      const j0 = besselJ0(argument), j1 = besselJ1(argument);
      height0 += zeroth[index] * j0;
      slope0 -= zeroth[index] * wavenumber * j1;
      height1 += first[index] * j1;
      slope1 += first[index] * wavenumber * (j0 - (argument > 0 ? j1 / argument : 0.5));
    }
    let cosine = 0, sine = 0, turnCosine = 0, turnSine = 0;
    for (let index = directCount; index < count; index++) {
      if ((index - directCount) % 64 === 0) {
        const phase = (index + 0.5) * step * radius - quarter;
        cosine = Math.cos(phase); sine = Math.sin(phase);
        turnCosine = Math.cos(step * radius); turnSine = Math.sin(step * radius);
      }
      const wavenumber = (index + 0.5) * step;
      const argument = wavenumber * radius;
      const inverse = 1 / argument, inverseSquare = inverse * inverse;
      const scale = Math.sqrt(2 / (Math.PI * argument));
      const j0 = scale * ((1 - 9 / 128 * inverseSquare) * cosine - (-0.125 * inverse + 75 / 1024 * inverse * inverseSquare) * sine);
      const j1 = scale * ((1 + 15 / 128 * inverseSquare) * sine + (0.375 * inverse - 105 / 1024 * inverse * inverseSquare) * cosine);
      height0 += zeroth[index] * j0;
      slope0 -= zeroth[index] * wavenumber * j1;
      height1 += first[index] * j1;
      slope1 += first[index] * wavenumber * (j0 - j1 * inverse);
      const nextCosine = cosine * turnCosine - sine * turnSine;
      sine = sine * turnCosine + cosine * turnSine;
      cosine = nextCosine;
    }
    if (near) {
      const { shown, slope } = nearFieldShown(near, radius);
      slope0 = shown * slope0 + slope * height0;
      slope1 = shown * slope1 + slope * height1;
      height0 *= shown;
      height1 *= shown;
    }
    heights0[which] = height0; slopes0[which] = slope0; heights1[which] = height1; slopes1[which] = slope1;
  });
  return { heights0, slopes0, heights1, slopes1 };
}
/** The largest |∇η| a profile pair allows at radius r over all directions: |∂η0/∂r| + max(|∂η1/∂r|, |η1|/r). */
const slopeBound = (slope0, slope1, height1, radius) => Math.abs(slope0) + Math.max(Math.abs(slope1), Math.abs(height1) / Math.max(radius, 1e-6));
/** Wavenumbers enough for a source's exact sums: to where its narrowest Gaussian's spectrum is 1e-4. */
const exactCount = (source, step) => Math.ceil(Math.min(4.29 / Math.min(...source.groups.flatMap((group) => [group.sigma, group.pair ? group.pair.sigma : Infinity])), 450) / step);

// ---- the splash, as the app throws it, with RingSources for its rings ----
const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const hand = new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);
const AIM = { x: 0, z: -1.4 };
// The home view on a desktop and on a phone, as src/main.js hands the rings
// its camera (Rings.setCamera): its pixels per radian across the canvas and
// the nearest water it sees.
const HOME_VIEWS = [
  { name: 'desktop', width: 1920, height: 1080, fov: 48 },
  { name: 'phone', width: 1084, height: 2346, fov: 62 },
].map((view) => {
  const pitch = Math.atan2(1.15 - 0.12, 2.45 + 1.0);
  return { ...view, camera: { x: 0, z: 2.45, height: 1.15, pixelsPerRadian: 0.5 * view.height / Math.tan(THREE.MathUtils.degToRad(view.fov) / 2), nearest: 1.15 / Math.tan(pitch + THREE.MathUtils.degToRad(view.fov) / 2) } };
});
const footprintCache = new Map();   // viewFootprints by view name
/** A source's plan for one of HOME_VIEWS' cameras (RingSources.planFor). */
const planForView = (source, view) => planSource(source.groups, POND_DEPTH, {
  distance: Math.hypot(source.centreX - view.camera.x, source.centreZ - view.camera.z), height: view.camera.height, pixelsPerRadian: view.camera.pixelsPerRadian, nearest: view.camera.nearest,
});
/** The water a view's pixels see, on a grid of samples: each point with the world (x, z) one pixel to the right and one up moves it by. */
function viewFootprints({ width, height, fov }, columns = 160, rows = 160) {
  const view = new THREE.PerspectiveCamera(fov, width / height, 0.05, 1000);
  view.position.set(0, 1.15, 2.45);
  view.lookAt(0, 0.12, -1.0);
  view.updateMatrixWorld();
  const onWater = (ndcX, ndcY) => {
    const direction = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(view).sub(view.position).normalize();
    if (direction.y >= -1e-4) return null;
    const along = -view.position.y / direction.y;
    return { x: view.position.x + direction.x * along, z: view.position.z + direction.z * along };
  };
  const points = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const ndcX = -1 + 2 * (column + 0.5) / columns, ndcY = -1 + 2 * (row + 0.5) / rows;
      const point = onWater(ndcX, ndcY), right = onWater(ndcX + 2 / width, ndcY), up = onWater(ndcX, ndcY + 2 / height);
      if (point && right && up) points.push({ ...point, acrossX: [right.x - point.x, right.z - point.z], acrossY: [up.x - point.x, up.z - point.z] });
    }
  }
  return points;
}

/** A stone thrown at `aim` with normal power as the app throws, or (vertical) dropped straight in at REFERENCE_SPEED. */
function throwStone(radius, vertical, aim = AIM) {
  const target = new THREE.Vector3(aim.x, 0, aim.z);
  const flightTime = throwFlightTime(hand, target, 'normal', radius);
  const velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  const rock = new Rock({ radius, position: vertical ? new THREE.Vector3(aim.x, 1.02 * radius, aim.z) : hand, velocity: vertical ? new THREE.Vector3(0, -REFERENCE_SPEED, 0) : velocity, envTexture: null });
  for (let step = 0; step < 4 * 240; step++) {
    const impact = rock.update(FRAME / SUBSTEPS, POND_DEPTH);
    if (impact) {
      if (vertical) { impact.speed = REFERENCE_SPEED; impact.velocity.set(0, -REFERENCE_SPEED, 0); }
      return { impact, rock };
    }
  }
  throw new Error('the stone never reached the water');
}

/** One stone's splash on the CPU (drops skipped: they make no ring source): its ring sources and the splats left to the solver. */
function splashRings(radius, { vertical = false, aim = AIM, seed = 12345 } = {}) {
  let state = seed;
  const random = Math.random;
  Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  try {
    const { impact, rock } = throwStone(radius, vertical, aim);
    // The app hands the splash a Rings (src/rings.js), whose uniforms the specks spread; its bookkeeping is all this needs.
    const rings = Object.assign(new RingSources({ depth: POND_DEPTH }), { uniforms: () => ({}) });
    const solverSplats = [];
    const water = {
      heightTexture: null, domainMin: [-3, -4], domainSize: DOMAIN_SIZE, uvOffset: 0.5 / 512, cell: DOMAIN_SIZE / 512, depth: POND_DEPTH, rings,
      addSplat: (splat) => { solverSplats.push({ time: splash.time, rim: 1.7, height: 0, velocity: 0, ...splat }); return true; },
      addFoam: () => true,
      addFoamFlow: () => true,
    };
    const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
    const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
    splash.spawnDroplet = () => {};
    splash.impact(impact, water);
    for (let frame = 0; frame < 6 * 60; frame++) {
      splash.setFrameSeconds(FRAME);
      for (let substep = 0; substep < SUBSTEPS; substep++) {
        rock.update(FRAME / SUBSTEPS, POND_DEPTH);
        splash.update(FRAME / SUBSTEPS, water);
      }
      splash.prepareFrame();
      if (splash.time > 1.5 && splash.columns.length === 0 && splash.jets.length === 0 && splash.wakes.length === 0) break;
    }
    return { impact, sources: rings.sources, solverSplats };
  } finally {
    Math.random = random;
  }
}

// ---- 1. against the solver ----
console.log(`rings: film damping γ = film·k·√(νω/8) + 2νk² (film ${RING_DAMPING.film}, ν ${RING_DAMPING.viscosity} m²/s); source strength ${RING_SOURCE.strength}; a ring retires under a slope of ${SLOPE_VISIBLE}`);
console.log(`  γ (1/s) at λ 3, 5, 10, 20, 30, 50, 100 cm: rings ${[0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1].map((wavelength) => filmDamping(2 * Math.PI / wavelength).toFixed(3)).join(', ')}; solver ${[0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1].map((wavelength) => solverDamping(2 * Math.PI / wavelength).toFixed(3)).join(', ')}`);
console.log('\n1. An isolated ring source: the solver (its 512² lattice, injection, dispersion and damping) against the rings (with the solver\'s damping)');
const SOLVER_SIZE = 512;
const SOLVER_CELL = DOMAIN_SIZE / SOLVER_SIZE;
/** The solver's field along the row through a splat at a texel centre, at its age `age`: heights and ∂/∂x at 0, 1, 2… texels out. */
function solverRow(splat, age, texels) {
  const size = SOLVER_SIZE;
  const sigma = Math.max(splat.sigma / SOLVER_CELL, 0.6);
  const rimSigma = sigma * Math.max(splat.rim, 1);
  const signed = (texel) => (texel < size / 2 ? texel : texel - size);
  const columnSums = new Float64Array(size);
  for (let column = 0; column < size; column++) {
    const alongX = 2 * Math.PI * signed(column) / size;
    let sum = 0;
    for (let row = 0; row < size; row++) {
      if (column === 0 && row === 0) continue;
      const alongZ = 2 * Math.PI * signed(row) / size;
      const lattice = Math.hypot(alongX, alongZ);
      const wavenumber = lattice / SOLVER_CELL;
      let shape = Math.exp(-0.5 * sigma * sigma * lattice * lattice);
      if (splat.rim > 1) shape -= Math.exp(-0.5 * rimSigma * rimSigma * lattice * lattice);
      if (shape === 0) continue;
      const omega = ringFrequency(wavenumber, POND_DEPTH);
      const amplitude = splat.height * Math.cos(omega * age) + splat.velocity * Math.sin(omega * age) / omega;
      sum += 2 * Math.PI * sigma * sigma * shape * amplitude * Math.exp(-solverDamping(wavenumber) * age);
    }
    columnSums[column] = sum;
  }
  const heights = new Float64Array(texels), slopes = new Float64Array(texels);
  for (let texel = 0; texel < texels; texel++) {
    let height = 0, slope = 0;
    for (let column = 0; column < size; column++) {
      const alongX = 2 * Math.PI * signed(column) / size;
      height += columnSums[column] * Math.cos(alongX * texel);
      slope -= columnSums[column] * alongX / SOLVER_CELL * Math.sin(alongX * texel);
    }
    heights[texel] = height / (size * size);
    slopes[texel] = slope / (size * size);
  }
  return { heights, slopes };
}
const largestOf = (values) => values.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
/** The ring source stampCavity makes for a stone of this radius dropped straight in at REFERENCE_SPEED, through RingSources. */
function cavitySource(radius) {
  const sources = new RingSources({ depth: POND_DEPTH });
  SplashSystem.prototype.stampCavity.call({ time: 0, stampFoamPatch: () => {}, launchRing: SplashSystem.prototype.launchRing }, { x: 0, z: 0, radius, speed: REFERENCE_SPEED, strength: 1 }, { rings: sources, addFoam: () => true });
  return sources.sources[0];
}
const COMPARE_TEXELS = Math.round(2 / SOLVER_CELL);   // 2 m
for (const radius of [0.0075, 0.02, 0.03, 0.08]) {
  const source = cavitySource(radius);
  const group = source.groups[0];
  const plan = source.plan;
  const bound = radius < 0.01 ? 0.15 : 0.03;
  console.log(`  ${(200 * radius).toFixed(1)} cm stone: σ ${millimetres(group.sigma)} mm, rim ${group.rim}, ${group.velocity.toFixed(3)} m/s down, released ${(1000 * group.start).toFixed(0)} ms after the impact; the rings sample it with Δk ${plan.step.toFixed(3)} rad/m, ${plan.count} wavenumbers, reach ${plan.reach.toFixed(1)} m`);
  const fineStep = 0.05;
  const fineCount = Math.ceil(Math.min(4.29 / group.sigma * 1.2, 450) / fineStep);
  const radii = Array.from({ length: COMPARE_TEXELS }, (unused, texel) => texel * SOLVER_CELL);
  let worst = 0;
  for (const age of [0.25, 0.5, 1, 2]) {
    const time = group.start + age;
    const solver = solverRow(group, age, COMPARE_TEXELS);
    const exact = exactProfile(ringWeights(source, time, { step: fineStep, count: fineCount, damping: solverDamping }), radii);
    const scheme = drawnProfile(source, time, { damping: solverDamping, mask: false });
    const read = radii.map((radius) => readProfile(scheme, plan.reach, radius));
    const heightScale = largestOf(solver.heights), slopeScale = largestOf(solver.slopes);
    const exactHeight = largestOf(solver.heights.map((height, texel) => height - exact.heights0[texel])) / heightScale;
    const exactSlope = largestOf(solver.slopes.map((slope, texel) => slope - exact.slopes0[texel])) / slopeScale;
    const schemeHeight = largestOf(solver.heights.map((height, texel) => height - read[texel][3])) / heightScale;
    const schemeSlope = largestOf(solver.slopes.map((slope, texel) => slope - read[texel][0])) / slopeScale;
    worst = Math.max(worst, exactHeight, exactSlope, schemeHeight, schemeSlope);
    console.log(`    ${age.toFixed(2)} s after its release: solver's largest height ${millimetres(heightScale)} mm, slope ${exponent(slopeScale)}; differences of the Hankel integral ${(100 * exactHeight).toFixed(2)}% and ${(100 * exactSlope).toFixed(2)}%, of the rings' scheme ${(100 * schemeHeight).toFixed(2)}% and ${(100 * schemeSlope).toFixed(2)}%`);
  }
  check(worst < bound, `the ${(200 * radius).toFixed(1)} cm stone's ring agrees with the solver's to ${(100 * worst).toFixed(1)}% (at most ${100 * bound}%) out to 2 m over 2 s`);
}

// ---- 2. the ring sources a splash makes ----
console.log('\n2. The ring sources a splash makes (thrown as the app throws at (0, -1.4); "vertical": dropped straight in at 6.3 m/s)');
const sizes = everySize ? [0.0075, 0.02, 0.03, 0.04, 0.08] : [0.0075, 0.03, 0.08];
const runs = sizes.map((radius) => ({ radius, vertical: false })).concat([{ radius: 0.03, vertical: true }]);
const costRows = [];
let verticalRun = null;
for (const run of runs) {
  const runStarted = performance.now();
  const result = splashRings(run.radius, { vertical: run.vertical });
  if (run.vertical) verticalRun = result;
  const angle = Math.asin(Math.min(Math.hypot(result.impact.velocity.x, result.impact.velocity.z) / result.impact.speed, 1)) * 180 / Math.PI;
  console.log(`  ${(200 * run.radius).toFixed(1)} cm stone${run.vertical ? ', vertical' : ''}: enters at ${result.impact.speed.toFixed(2)} m/s, ${angle.toFixed(0)}° from vertical; ${result.sources.length} ring source${result.sources.length === 1 ? '' : 's'}, ${result.solverSplats.length} splats left to the solver (the splash run took ${((performance.now() - runStarted) / 1000).toFixed(1)} s)`);
  check(result.sources.length === 1, 'one ring source a throw (the jet\'s fall-back adds none)');
  for (const [which, source] of result.sources.entries()) {
    const plan = source.plan;
    const groups = source.groups.map((group) => `σ ${millimetres(group.sigma)} mm rim ${group.rim} ${group.height !== 0 ? `h ${millimetres(group.height)} mm ` : ''}v ${group.velocity.toFixed(3)} m/s${group.pair ? ` pair ±${millimetres(group.pair.height)} mm` : ''} at ${(group.start * 1000).toFixed(0)} ms, ${(100 * group.offset).toFixed(1)} cm along`).join('; ');
    console.log(`    source ${which + 1}: ${groups}`);
    console.log(`      sampling: Δk ${plan.step.toFixed(4)} rad/m, ${plan.count} wavenumbers to ${(plan.step * plan.count).toFixed(0)} rad/m, reach ${plan.reach.toFixed(1)} m (shows to ${plan.extent.toFixed(1)} m by the envelope); retires ${plan.lifetime.toFixed(1)} s after its last splat`);
    // The exact profile: half the plan's Δk and a window at twice its reach, so
    // its own images (of what lies within 2.8 R) come back no nearer than 2.2 R,
    // past everything compared here (1.33 R).
    const exactSampling = { step: plan.step / 2, count: 2 * plan.count, windowReach: 2 * plan.reach };
    // A cut reach (at REACH.most, or by MAX_WAVENUMBERS: planSource) is judged by what is drawn: the exact ring inside the reach, tapered as the profile is.
    const capped = plan.reach < REACH.margin * plan.extent / TAPER_START - 1e-9;
    const largestSlopeAt = (time, perTexel = 2) => {
      const inner = innerRadius(source, time);
      const scanRadii = [];
      for (let index = 0; index < perTexel * PROFILE_TEXELS; index++) {
        const radius = profileRadius((index + 0.5) / (perTexel * PROFILE_TEXELS), (capped ? 1 : 1.3) * plan.reach);
        if (radius >= inner) scanRadii.push(radius);
      }
      const exact = exactProfile(ringWeights(source, time, exactSampling), scanRadii);
      let largest = 0, where = 0;
      scanRadii.forEach((radius, index) => {
        const taper = capped ? 1 - smoothstep(TAPER_START * plan.reach, plan.reach, radius) : 1;
        const slope = taper * slopeBound(exact.slopes0[index], exact.slopes1[index], exact.heights1[index], radius);
        if (slope > largest) { largest = slope; where = radius; }
      });
      return { largest, where };
    };
    const atEnd = largestSlopeAt(plan.end, 4);
    check(atEnd.largest < SLOPE_VISIBLE, `when it retires (${plan.end.toFixed(1)} s) its steepest slope${capped ? ' inside its cut reach' : ''} is ${exponent(atEnd.largest)} at ${atEnd.where.toFixed(1)} m, under ${SLOPE_VISIBLE}`);
    // When it really falls under SLOPE_VISIBLE: bisection between a quarter of its life and its end.
    const first = source.groups[0].start;
    let visible = first + 0.25 * (plan.end - first), hidden = plan.end;
    if (largestSlopeAt(visible).largest < SLOPE_VISIBLE) {
      console.log(`      it is under ${SLOPE_VISIBLE} already ${(visible - first).toFixed(1)} s after it starts`);
    } else {
      for (let step = 0; step < 5; step++) {
        const middle = 0.5 * (visible + hidden);
        if (largestSlopeAt(middle).largest >= SLOPE_VISIBLE) visible = middle; else hidden = middle;
      }
      console.log(`      its steepest slope falls under ${SLOPE_VISIBLE} ${(hidden - first).toFixed(1)} s after it starts: it retires ${(plan.end - hidden).toFixed(1)} s late`);
    }
    // The scheme as the water reads it against the exact profile (with the same near-field mask), over the reach and a third beyond.
    const compareRadii = [];
    for (let texel = 0; texel < PROFILE_TEXELS - 1; texel++) {
      compareRadii.push(profileRadius(texel / (PROFILE_TEXELS - 1), plan.reach));
      compareRadii.push(profileRadius((texel + 0.5) / (PROFILE_TEXELS - 1), plan.reach));
    }
    for (let index = 1; index <= 400; index++) compareRadii.push(plan.reach * (1 + index / 1200));
    // At a cut reach the comparison stops where the taper starts.
    const ages = [0.5, 1, 2, 8, 0.5 * plan.lifetime, plan.lifetime].filter((age, index, all) => all.indexOf(age) === index);
    let worstExcess = -Infinity, cut = 0, cutAge = 0;
    const notes = [];
    for (const age of ages) {
      const time = first + age;
      const scheme = drawnProfile(source, time);
      const exact = exactProfile(ringWeights(source, time, exactSampling), compareRadii, nearField(source, time));
      let peak = 0, worst = 0, worstAt = 0;
      compareRadii.forEach((radius, index) => {
        const exactSlope = slopeBound(exact.slopes0[index], exact.slopes1[index], exact.heights1[index], radius);
        if (capped && radius >= TAPER_START * plan.reach) {
          if (exactSlope > cut) { cut = exactSlope; cutAge = age; }
          return;
        }
        const read = readProfile(scheme, plan.reach, radius);
        peak = Math.max(peak, exactSlope);
        const error = slopeBound(read[0] - exact.slopes0[index], read[1] - exact.slopes1[index], read[2] - exact.heights1[index], radius);
        if (error > worst) { worst = error; worstAt = radius; }
      });
      worstExcess = Math.max(worstExcess, worst - (SLOPE_VISIBLE / 2 + 0.02 * peak));
      notes.push(`${age.toFixed(1)} s: ${exponent(worst)} at ${worstAt.toFixed(2)} m (steepest ${exponent(peak)}; drawn ${innerRadius(source, time).toFixed(1)} to ${outerRadius(source, time).toFixed(1)} m, ${usedCount(source, time)} wavenumbers)`);
    }
    console.log(`      the drawn profile against the exact slope: ${notes.join('; ')}`);
    if (capped) console.log(`      its reach is cut (${plan.reach >= REACH.most - 1e-9 ? `the ${REACH.most} m cap` : `${MAX_WAVENUMBERS} wavenumbers at most`}): beyond ${(TAPER_START * plan.reach).toFixed(0)} m the drawn ring fades out where the exact one is up to ${exponent(cut)} steep (at ${cutAge.toFixed(1)} s)`);
    check(worstExcess <= 0, `its drawn profile matches the exact one within ${SLOPE_VISIBLE / 2} + 2% of its steepest slope, over its reach${capped ? ' to the taper' : ' and a third beyond'}`);
    if (source.groups.length > 1 || source.groups.some((group) => group.pair)) {
      const contrast = aheadBehind(source);
      console.log(`      ahead against behind, trough to crest: ${contrast.map(({ distance, ahead, behind }) => `${distance} m ${millimetres(ahead)}/${millimetres(behind)} mm (×${(ahead / behind).toFixed(2)})`).join('; ')}`);
      check(contrast.every(({ ahead, behind }) => ahead > 1.15 * behind && ahead < 2 * behind), 'it runs stronger ahead than behind (×1.15 to ×2)');
      const missed = higherOrders(source);
      console.log(`      the parts m ≥ 2 it leaves out: ${missed.map(({ age, worst, peak, where }) => `${(100 * worst / peak).toFixed(0)}% of its largest height at ${age} s (${where})`).join('; ')}`);
      check(missed.every(({ worst, peak }) => worst < 0.4 * peak), 'the parts m ≥ 2 left out stay under 40% of its largest height (they even out its contrast around it)');
    }
    // Retiring by the camera (Rings.setCamera): at its end, the steepest slope
    // the view's pixels show, each averaging the exact ring over its own
    // footprint along the radius as the mip chain does, must be under
    // SLOPE_VISIBLE.
    for (const view of HOME_VIEWS) {
      const cameraPlan = planForView(source, view);
      const shown = slopeShown(source, cameraPlan.end, cameraPlan.reach, view);
      console.log(`      by the ${view.name}'s home view (${view.camera.pixelsPerRadian.toFixed(0)} pixels a radian): reach ${cameraPlan.reach.toFixed(1)} m, ${cameraPlan.count} wavenumbers; retires ${(cameraPlan.end - first).toFixed(1)} s after it starts (${(plan.end - first).toFixed(1)} s by the slope alone), when its pixels show at most ${exponent(shown.largest)} of slope (at ${shown.where.toFixed(1)} m from its centre, ${shown.distance.toFixed(1)} m from the camera)`);
      check(shown.largest < SLOPE_VISIBLE, `retiring by the ${view.name}'s view, it shows under ${SLOPE_VISIBLE} when it goes`);
    }
    // The cost of its profile pass (section 4): fetches (every wavenumber it sums at every texel in its annulus), and of those the terms in full.
    const passCost = (time) => {
      const inner = innerRadius(source, time), outer = Math.max(outerRadius(source, time), inner), count = usedCount(source, time);
      let fetches = 0, directTerms = 0;
      for (let texel = 0; texel < PROFILE_TEXELS; texel++) {
        const radius = profileRadius(texel / (PROFILE_TEXELS - 1), plan.reach);
        if (radius < inner || radius > outer) continue;
        fetches += count;
        directTerms += Math.min(count, Math.max(0, Math.ceil(DIRECT_LIMIT / (Math.max(radius, 1e-9) * plan.step) - 0.5)));
      }
      return { fetches, directTerms };
    };
    let lifeFetches = 0, lifeFrames = 0;
    for (let age = 0; age < plan.end - first; age += 0.5) { lifeFetches += passCost(first + age).fetches; lifeFrames++; }
    costRows.push({
      name: `${(200 * run.radius).toFixed(1)} cm${run.vertical ? ' vertical' : ''}`, count: plan.count, groups: source.groups.length,
      pairs: source.groups.filter((group) => group.pair).length, byAge: [0.1, 1, 5, 10, 20, 40, 60].map((age) => passCost(first + age)),
      mean: lifeFetches / lifeFrames, lifetime: plan.end - first,
    });
  }
}

/** A ring's height series at a point (exact sums, no window), from the impact to `seconds`, sampled every `sample` s. */
function pointSeries(source, pointX, pointZ, { damping = filmDamping, seconds = 8, sample = 0.01, from = 0 } = {}) {
  const offsetX = pointX - source.centreX, offsetZ = pointZ - source.centreZ;
  const radius = Math.hypot(offsetX, offsetZ);
  const along = radius > 0 ? (offsetX * source.directionX + offsetZ * source.directionZ) / radius : 0;
  const step = 0.05, count = exactCount(source, step);
  const zerothBessel = Float64Array.from({ length: count }, (unused, index) => besselJ0((index + 0.5) * step * radius));
  const firstBessel = Float64Array.from({ length: count }, (unused, index) => besselJ1((index + 0.5) * step * radius) * along);
  const samples = Math.round(seconds / sample);
  const series = new Float64Array(samples);
  for (let index = 0; index < samples; index++) {
    const weights = ringWeights(source, from + index * sample, { step, count, damping });
    let height = 0;
    for (let term = 0; term < count; term++) height += weights.zeroth[term] * zerothBessel[term] + weights.first[term] * firstBessel[term];
    series[index] = height;
  }
  return series;
}
/**
 * The steepest slope a view's pixels show of a source at world time `time`:
 * at each water point of the view (viewFootprints) within `reach` of its
 * centre, the exact η0 and η1 averaged over the pixel's footprint along the
 * radius (the larger of the two pixel steps' radial parts, at least a grid
 * step), as the mip chain averages them: |Δη0|/F + max(|Δη1|/F, |η̄1|/r).
 */
function slopeShown(source, time, reach, view) {
  if (!footprintCache.has(view.name)) footprintCache.set(view.name, viewFootprints(view));
  const points = footprintCache.get(view.name);
  const gridStep = 0.01;
  const radii = Array.from({ length: Math.ceil(reach / gridStep) + 2 }, (unused, index) => index * gridStep);
  const step = source.plan.step / 2;
  const exact = exactProfile(ringWeights(source, time, { step, count: Math.ceil(2 * source.plan.count), windowReach: 2 * source.plan.reach }), radii);
  const integral1 = new Float64Array(radii.length);
  for (let index = 1; index < radii.length; index++) integral1[index] = integral1[index - 1] + 0.5 * (exact.heights1[index] + exact.heights1[index - 1]) * gridStep;
  const at = (values, radius) => {
    const position = Math.min(Math.max(radius / gridStep, 0), radii.length - 1.001);
    const lower = Math.floor(position);
    return values[lower] + (values[lower + 1] - values[lower]) * (position - lower);
  };
  let largest = 0, where = 0, distance = 0;
  for (const point of points) {
    const offsetX = point.x - source.centreX, offsetZ = point.z - source.centreZ;
    const radius = Math.hypot(offsetX, offsetZ);
    if (radius >= reach || radius < 1e-3) continue;
    const outwardX = offsetX / radius, outwardZ = offsetZ / radius;
    const footprint = Math.max(Math.abs(outwardX * point.acrossX[0] + outwardZ * point.acrossX[1]), Math.abs(outwardX * point.acrossY[0] + outwardZ * point.acrossY[1]), gridStep);
    const low = Math.max(radius - footprint / 2, 0), high = Math.min(radius + footprint / 2, reach);
    const width = Math.max(high - low, 1e-9);
    const slope0 = Math.abs(at(exact.heights0, high) - at(exact.heights0, low)) / width;
    const slope1 = Math.abs(at(exact.heights1, high) - at(exact.heights1, low)) / width;
    const height1 = Math.abs(at(integral1, high) - at(integral1, low)) / width;
    const shown = slope0 + Math.max(slope1, height1 / radius);
    if (shown > largest) { largest = shown; where = radius; distance = Math.hypot(point.x, point.z - 2.45); }
  }
  return { largest, where, distance };
}
/** The largest swing within any `window` seconds of a series sampled every `sample` s (rings.py's trough to crest). */
function largestSwing(series, sample = 0.01, window = 0.6) {
  const span = Math.round(window / sample);
  let best = 0;
  for (let index = 0; index < series.length; index++) {
    let low = Infinity, high = -Infinity;
    for (let other = index; other <= Math.min(index + span, series.length - 1); other++) { low = Math.min(low, series[other]); high = Math.max(high, series[other]); }
    best = Math.max(best, high - low);
  }
  return best;
}
/** How much stronger an oblique throw's ring runs ahead than behind: its trough to crest at 0.5, 1 and 2 m either way. */
function aheadBehind(source) {
  return [0.5, 1, 2].map((distance) => {
    const ahead = pointSeries(source, source.centreX + source.directionX * distance, source.centreZ + source.directionZ * distance, { seconds: 7, sample: 0.02 });
    const behind = pointSeries(source, source.centreX - source.directionX * distance, source.centreZ - source.directionZ * distance, { seconds: 7, sample: 0.02 });
    return { distance, ahead: largestSwing(ahead, 0.02), behind: largestSwing(behind, 0.02) };
  });
}

/**
 * The heights the m ≤ 1 parts miss: at 1, 2 and 4 s after the source starts,
 * on rings of radius 0.1 to 1.2 m in seven directions from ahead (0°) to
 * behind (180°), every splat's own axisymmetric ring about its own centre
 * (main splats and pairs, at their offsets along the throw) summed, against
 * η0 + η1·cos θ. Returns the largest miss and the largest height at each age.
 */
function higherOrders(source) {
  const splats = [];
  for (const group of source.groups) {
    splats.push({ groups: [{ ...group, offset: 0, pair: null }], along: group.offset });
    if (group.pair) {
      for (const side of [-1, 1]) splats.push({ groups: [{ start: group.start, sigma: group.pair.sigma, rim: 1, height: side * group.pair.height, velocity: 0, offset: 0, pair: null }], along: group.offset + side * group.pair.offset });
    }
  }
  const sampling = { step: 0.1, count: Math.ceil(Math.min(4.29 / Math.min(...splats.map((splat) => splat.groups[0].sigma)), 400) / 0.1) };
  return [1, 2, 4].map((age) => {
    const time = source.groups[0].start + age;
    const own = splats.map((splat) => ringWeights(splat, time, sampling));
    const together = ringWeights(source, time, sampling);
    let worst = 0, peak = 0, where = '';
    for (let ring = 1; ring <= 12; ring++) {
      const distance = 0.1 * ring;
      for (let angle = 0; angle <= 180; angle += 30) {
        const across = distance * Math.sin(angle * Math.PI / 180), along = distance * Math.cos(angle * Math.PI / 180);
        let exact = 0, kept = 0;
        for (let index = 0; index < sampling.count; index++) {
          const wavenumber = (index + 0.5) * sampling.step;
          splats.forEach((splat, which) => { exact += own[which].zeroth[index] * besselJ0(wavenumber * Math.hypot(along - splat.along, across)); });
          kept += together.zeroth[index] * besselJ0(wavenumber * distance) + together.first[index] * besselJ1(wavenumber * distance) * Math.cos(angle * Math.PI / 180);
        }
        peak = Math.max(peak, Math.abs(exact));
        if (Math.abs(exact - kept) > worst) { worst = Math.abs(exact - kept); where = `${distance.toFixed(1)} m, ${angle}° from ahead`; }
      }
    }
    return { age, worst, peak, where };
  });
}

// ---- 3. the reference vertical drop against the reference simulation ----
console.log(`\n3. The reference vertical drop (R 3 cm, ${REFERENCE_SPEED} m/s straight in) against the reference simulation's ring (tools/basilisk/results/rings_linear.md; RING_SOURCE.strength ${RING_SOURCE.strength})`);
/** The wavelength of a wave of this period by the rings' dispersion on the pond's depth (Newton's method). */
function wavelengthOf(period) {
  const omega = 2 * Math.PI / period;
  let wavenumber = omega * omega / GRAVITY;
  for (let step = 0; step < 60; step++) {
    const value = ringFrequency(wavenumber, POND_DEPTH) ** 2 - omega * omega;
    const slope = 2 * ringFrequency(wavenumber, POND_DEPTH) * ringGroupSpeed(wavenumber, POND_DEPTH);
    wavenumber = Math.max(wavenumber - value / slope, 0.5 * wavenumber);
  }
  return 2 * Math.PI / wavenumber;
}
/** rings.py's measures of a series from the impact: trough to crest, the highest crest's time, its period by the zero crossings either side, its wavelength. */
function ringMeasures(series, sample = 0.01) {
  let crest = 0;
  series.forEach((height, index) => { if (height > series[crest]) crest = index; });
  let before = crest, after = crest;
  while (before > 0 && series[before] > 0) before--;
  while (after < series.length - 1 && series[after] > 0) after++;
  const period = 2 * (after - before) * sample;
  return { height: largestSwing(series, sample), crestTime: crest * sample, period, wavelength: wavelengthOf(period) };
}
{
  const { impact, sources, solverSplats } = verticalRun;
  const source = sources[0];
  const SAMPLE = 0.01, SECONDS = 8;
  /** The solver's near-field splats (as wide as a quarter of the stone and more: the jet's mound and base) at a point over time, with the solver's damping. */
  function solverSeries(pointX, pointZ) {
    const series = new Float64Array(Math.round(SECONDS / SAMPLE));
    for (const splat of solverSplats.filter((candidate) => candidate.radius >= 0.25 * impact.radius)) {
      const single = { centreX: splat.x, centreZ: splat.z, directionX: 1, directionZ: 0, groups: [{ start: splat.time, sigma: splat.radius, rim: splat.rim, height: splat.height, velocity: splat.velocity, offset: 0, pair: null }] };
      const part = pointSeries(single, pointX, pointZ, { damping: solverDamping, seconds: SECONDS, sample: SAMPLE });
      part.forEach((height, index) => { series[index] += height; });
    }
    return series;
  }
  const rows = [];
  for (const reference of REFERENCE) {
    const pointX = impact.x + reference.distance, pointZ = impact.z;
    const clean = ringMeasures(pointSeries(source, pointX, pointZ, { damping: cleanDamping, seconds: SECONDS, sample: SAMPLE }));
    const filmSeries = pointSeries(source, pointX, pointZ, { damping: filmDamping, seconds: SECONDS, sample: SAMPLE });
    const film = ringMeasures(filmSeries);
    const solver = solverSeries(pointX, pointZ);
    const withSolver = ringMeasures(filmSeries.map((height, index) => height + solver[index]));
    rows.push({ reference, clean, film, withSolver });
  }
  console.log('  distance | reference: trough to crest, crest at, λ | the app, film off (the reference\'s damping) | the app, film on | with the solver\'s mound and jet base');
  for (const { reference, clean, film, withSolver } of rows) {
    const text = (measure) => `${millimetres(measure.height)} mm, ${measure.crestTime.toFixed(2)} s, ${(100 * measure.wavelength).toFixed(0)} cm`;
    console.log(`  ${reference.distance.toFixed(2)} m | ${reference.height.toFixed(2)} mm, ${reference.crest.toFixed(2)} s, ${reference.wavelength.toFixed(0)} cm | ${text(clean)} (×${(1000 * clean.height / reference.height).toFixed(2)}) | ${text(film)} (×${(1000 * film.height / reference.height).toFixed(2)}) | ${text(withSolver)}`);
  }
  for (const { reference, clean } of rows) {
    const ratio = 1000 * clean.height / reference.height;
    const timing = Math.abs(clean.crestTime - (reference.crest - 0.0003)) / reference.crest;
    const length = Math.abs(100 * clean.wavelength - reference.wavelength) / reference.wavelength;
    const lengthText = Number.isFinite(reference.wavelengthTolerance) ? `(${100 * reference.wavelengthTolerance}%)` : '(not checked)';
    check(Math.abs(ratio - 1) <= reference.tolerance && timing <= 0.05 && length <= reference.wavelengthTolerance,
      `at ${reference.distance} m, film off: trough to crest ×${ratio.toFixed(2)} of the reference's (within ${100 * reference.tolerance}%), crest ${(100 * timing).toFixed(1)}% off its time (5%), wavelength ${(100 * length).toFixed(0)}% off ${lengthText}`);
  }
  // The steep near ring: at 0.5 m, its steepest slope and largest height over time, film on.
  let steepest = 0, steepestTime = 0, highest = 0;
  for (let time = 0.5; time <= 3; time += 0.02) {
    const weights = ringWeights(source, time, { step: 0.05, count: exactCount(source, 0.05) });
    const exact = exactProfile(weights, [0.5]);
    if (Math.abs(exact.slopes0[0]) > steepest) { steepest = Math.abs(exact.slopes0[0]); steepestTime = time; }
    highest = Math.max(highest, Math.abs(exact.heights0[0]));
  }
  console.log(`  at 0.5 m the ring is up to ${exponent(steepest)} steep (at ${steepestTime.toFixed(2)} s) and ${millimetres(highest)} mm high (film on)`);
  console.log('  (times from the impact; the reference\'s from contact; trough to crest the largest swing within 0.6 s; the wavelength from the period around the highest crest)');
}

// ---- 4. the cost of a frame ----
console.log('\n4. The cost of a frame while rings live');
console.log(`  spectrum pass (whenever any ring lives): ${MAX_WAVENUMBERS}×${MAX_RINGS} fragments, those past the wavenumbers a ring sums that frame write zero at once; per wavenumber, for each of its splat groups (at most ${MAX_GROUPS}): one exp, a sine and cosine, J0 and J1 of the splat's offset, two exps and four Bessel values more for a pair`);
console.log(`  profile pass, per ring: ${PROFILE_TEXELS} fragments, those outside its annulus (inner: ${INNER_SHARE}·${SLOWEST_GROUP_SPEED} m/s × age less the source's extent; outer: its leading packet) write zero at once, the others fetch every wavenumber it sums then (to the shortest wave still steep enough to show); J0 and J1 in full below kr = ${DIRECT_LIMIT}, above it about a dozen multiply-adds per fetch; then the array's mip chain (${PROFILE_TEXELS}×1×${MAX_RINGS})`);
for (const row of costRows) {
  const millions = (fetches) => (fetches / 1e6).toFixed(2);
  console.log(`    ${row.name.padEnd(13)} ${String(row.count).padStart(5)} wavenumbers at most × ${row.groups} groups (${row.pairs} with a pair): at 0.1, 1, 5, 10, 20, 40, 60 s ${row.byAge.map((cost) => millions(cost.fetches)).join(', ')} M fetches; ${millions(row.mean)} M a frame over its ${row.lifetime.toFixed(0)} s`);
}
console.log('  per pixel and ring whose annulus holds it: the water fragment one fetch (textureGrad) and about 35 operations; the floor fragment two fetches; per vertex of the inner patch and per speck one fetch (textureLod); with no ring alive, nothing (a uniform branch on uRingCount) and no pass');

/**
 * A minute of throwing: the default stone (6 cm) thrown normally every 3 to
 * 5 s at random places on the water in view, for 60 s, then quiet until the
 * last ring retires. Each throw's ring source, made as the app makes it, is
 * added to RingSources (with `liveLimit`) at its time. Every half second:
 * the rings drawn (live and fading), the profile passes' fetches, and the
 * ring lookups the water's pixels, the floor's and the inner patch's
 * vertices make (`views`: their water points, each standing for its share of
 * the screen's pixels; the floor's look up only the rings its caustics take,
 * the youngest updateCaustics counts with a share). With `camera`
 * (HOME_VIEWS) the rings retire by it; a ring pushed out fades over
 * `fadeSeconds` (the preset's ringFade).
 */
function minuteOfThrowing(liveLimit, views, throws, camera = null, fadeSeconds = FADE_SECONDS) {
  const book = new RingSources({ depth: POND_DEPTH, liveLimit, fadeSeconds, camera });
  const pending = throws.flatMap(({ time, source }) => source.groups.map((group) => ({
    time: time + group.start, splat: {
      x: group.x, z: group.z, radius: group.sigma, height: group.height / RING_SOURCE.strength, velocity: group.velocity / RING_SOURCE.strength, rim: group.rim,
      pair: group.pair ? { height: group.pair.height / RING_SOURCE.strength, radius: group.pair.sigma, offset: group.pair.offset, directionX: group.pair.directionX, directionZ: group.pair.directionZ } : null,
    },
  }))).sort((first, second) => first.time - second.time);
  const samples = [];
  let next = 0;
  for (let time = 0; time < 300; time += 0.5) {
    while (next < pending.length && pending[next].time <= time) { book.add(pending[next].splat, pending[next].time); next++; }
    book.retire(time);
    const causticRings = book.updateCaustics(time);
    if (next === pending.length && book.sources.length === 0) break;
    let fetches = 0;
    const annuli = book.sources.map((source) => {
      const inner = innerRadius(source, time), outer = Math.max(outerRadius(source, time), inner);
      fetches += texelsBetween(inner, outer, source.plan.reach) * usedCount(source, time);
      return { x: source.centreX, z: source.centreZ, inner, outer, caustic: source.caustic };
    });
    const causticAnnuli = annuli.slice(annuli.length - causticRings).filter((annulus) => annulus.caustic > 0);
    const lookups = views.map((view) => {
      let total = 0;
      for (const point of view.points) {
        for (const annulus of view.caustics ? causticAnnuli : annuli) {
          const radius = Math.hypot(point.x - annulus.x, point.z - annulus.z);
          if (radius >= annulus.inner - point.margin && radius < annulus.outer + point.margin) total += point.weight;
        }
      }
      return total;
    });
    samples.push({ time, live: book.sources.filter((source) => !source.fading).length, fading: book.sources.filter((source) => source.fading).length, caustics: causticAnnuli.length, fetches, lookups });
  }
  return samples;
}
/** The water points a view's pixels see (on a grid of samples, each standing for its pixels) and, with `floor`, the surface points the floor's pixels take their caustics from. */
function viewPoints({ width, height, fov, floor = false, columns = 96, rows = 96 }) {
  const view = new THREE.PerspectiveCamera(fov, width / height, 0.05, 1000);
  view.position.set(0, 1.15, 2.45);
  view.lookAt(0, 0.12, -1.0);
  view.updateMatrixWorld();
  const points = [];
  const weight = (width * height) / (columns * rows);
  const sun = new THREE.Vector3(Math.cos(0.4712) * Math.sin(Math.atan2(0.42, 0.78)), Math.sin(0.4712), -Math.cos(0.4712) * Math.cos(Math.atan2(0.42, 0.78)));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const direction = new THREE.Vector3(-1 + 2 * (column + 0.5) / columns, -1 + 2 * (row + 0.5) / rows, 0.5).unproject(view).sub(view.position).normalize();
      if (direction.y >= -1e-4) continue;
      const depth = floor ? POND_DEPTH : 0;
      const along = -(view.position.y + depth) / direction.y;
      let x = view.position.x + direction.x * along, z = view.position.z + direction.z * along;
      if (floor) { x += sun.x / Math.max(sun.y, 0.2) * POND_DEPTH * 0.75; z += sun.z / Math.max(sun.y, 0.2) * POND_DEPTH * 0.75; }
      points.push({ x, z, weight, margin: floor ? 0.02 : 0 });
    }
  }
  return { points, caustics: floor };
}
/** The inner patch's vertices on high (a grid over the solver's 6 m square). */
function patchVertices(segments) {
  const points = [];
  for (let row = 0; row <= segments; row += 2) for (let column = 0; column <= segments; column += 2) points.push({ x: -3 + 6 * column / segments, z: -4 + 6 * row / segments, weight: 4, margin: 0 });
  return { points };
}
{
  let state = 2024;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  const throws = [];
  for (let time = 0.5; time < 60; time += 3 + 2 * random()) {
    const aim = { x: -1.6 + 3.2 * random(), z: -3.4 + 3.6 * random() };
    throws.push({ time, source: splashRings(0.03, { aim, seed: 1 + Math.floor(random() * 1e6) }).sources[0] });
  }
  const desktop = viewPoints({ width: 1920, height: 1080, fov: 48 });
  const phone = viewPoints({ width: 1084, height: 2346, fov: 62 });
  const desktopFloor = viewPoints({ width: 1920, height: 1080, fov: 48, floor: true });
  const views = [desktop, phone, desktopFloor, patchVertices(254)];
  console.log(`  a minute of throwing: ${throws.length} default stones (6 cm) thrown normally every 3 to 5 s at random places in view for 60 s, then quiet; per frame, the rings drawn (live + fading), the profile passes' fetches, and ring lookups by the water's pixels (desktop 1920×1080 at 48°, phone 1084×2346 at 62°), the floor's (desktop) and the inner patch's 255² vertices`);
  // Every layer live and no camera (the rings as they would be with neither
  // bound), then each preset's limit with the camera they retire by; then a
  // stone every 1.5 s, which fills High's live rings and Low's.
  const runs = [{ limit: MAX_RINGS, view: null }, ...Object.entries(QUALITY).flatMap(([name, preset]) => (name === 'high' ? HOME_VIEWS : HOME_VIEWS.filter((view) => view.name === 'phone')).map((view) => ({ limit: preset.rings, fade: preset.ringFade, view })))];
  const rapidThrows = [];
  for (let time = 0.5; time < 60; time += 1.5) {
    const aim = { x: -1.6 + 3.2 * random(), z: -3.4 + 3.6 * random() };
    rapidThrows.push({ time, source: splashRings(0.03, { aim, seed: 1 + Math.floor(random() * 1e6) }).sources[0] });
  }
  const rapidRuns = [{ limit: QUALITY.high.rings, fade: QUALITY.high.ringFade, view: HOME_VIEWS.find((view) => view.name === 'desktop'), rapid: true }, { limit: QUALITY.low.rings, fade: QUALITY.low.ringFade, view: HOME_VIEWS.find((view) => view.name === 'phone'), rapid: true }];
  for (const { limit, fade = FADE_SECONDS, view, rapid } of [...runs, ...rapidRuns]) {
    if (rapid && limit === QUALITY.high.rings) console.log(`  the same with ${rapidThrows.length} stones, one every 1.5 s for 60 s:`);
    const samples = minuteOfThrowing(limit, views, rapid ? rapidThrows : throws, view ? view.camera : null, fade);
    const during = samples.filter((sample) => sample.time >= 20 && sample.time < 60);
    const after = samples.filter((sample) => sample.time >= 60);
    const mean = (rows, pick) => rows.reduce((sum, row) => sum + pick(row), 0) / Math.max(rows.length, 1);
    const most = (rows, pick) => rows.reduce((best, row) => Math.max(best, pick(row)), 0);
    const millions = (value) => (value / 1e6).toFixed(1);
    const names = Object.entries(QUALITY).filter(([, preset]) => preset.rings === limit).map(([name]) => name);
    console.log(`    at most ${limit} live${names.length ? ` (${names.join(', ')})` : ' (every layer)'}, a pushed-out ring fading over ${fade} s, ${view ? `retiring by the ${view.name}'s view` : 'retiring by the slope alone'}: while throwing (20 to 60 s) ${mean(during, (row) => row.live + row.fading).toFixed(1)} rings drawn on average, at most ${most(during, (row) => row.live + row.fading)}; ${millions(mean(during, (row) => row.fetches))} M profile fetches a frame (at most ${millions(most(during, (row) => row.fetches))}); lookups ${millions(mean(during, (row) => row.lookups[0]))} M desktop water, ${millions(mean(during, (row) => row.lookups[1]))} M phone water (at most ${millions(most(during, (row) => row.lookups[1]))}), ${millions(mean(during, (row) => row.lookups[2]))} M desktop floor (its caustics taking ${mean(during, (row) => row.caustics).toFixed(1)} rings, at most ${most(during, (row) => row.caustics)}), ${millions(mean(during, (row) => row.lookups[3]))} M patch vertices`);
    const last = samples[samples.length - 1];
    console.log(`      after the last throw: ${mean(after.slice(0, 20), (row) => row.live + row.fading).toFixed(1)} rings drawn over its first 10 s, ${millions(mean(after.slice(0, 20), (row) => row.fetches))} M fetches, ${millions(mean(after.slice(0, 20), (row) => row.lookups[1]))} M phone lookups a frame; the last ring retires ${(last.time - 60).toFixed(0)} s after it`);
  }
  console.log(`  (a ring pushed out by a newer one fades out in a spare layer over the preset's ringFade, ${Object.entries(QUALITY).map(([name, preset]) => `${preset.ringFade} s on ${name}`).join(', ')} (${FADE_SECONDS} s by default): at most ${MAX_RINGS} layers in all; the floor's caustics take the youngest ${CAUSTIC_RINGS} live rings, an older one leaving them over ${CAUSTIC_FADE_SECONDS} s)`);
}
{
  // The CPU: planning a source, once; Rings.update's bookkeeping every frame (on a stand-in renderer that draws nothing).
  const reference = splashRings(0.03);
  const planned = performance.now();
  const repeats = 20;
  for (let repeat = 0; repeat < repeats; repeat++) for (const source of reference.sources) planSource(source.groups, POND_DEPTH);
  const planMilliseconds = (performance.now() - planned) / (repeats * reference.sources.length);
  const standIn = { getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {} };
  const rings = new Rings(standIn, { depth: POND_DEPTH });
  for (let copy = 0; copy < 8; copy++) for (const source of reference.sources) for (const group of source.groups) {
    rings.add({ x: group.x + copy, z: group.z, radius: group.sigma, height: group.height / RING_SOURCE.strength, velocity: group.velocity / RING_SOURCE.strength, rim: group.rim,
      pair: group.pair ? { height: group.pair.height / RING_SOURCE.strength, radius: group.pair.sigma, offset: group.pair.offset, directionX: group.pair.directionX, directionZ: group.pair.directionZ } : null }, group.start + 0.2 * copy);
  }
  const frames = 600;
  const updated = performance.now();
  for (let frame = 0; frame < frames; frame++) rings.update(2 + frame / 60);
  const updateMilliseconds = (performance.now() - updated) / frames;
  console.log(`  CPU: planning a source ${planMilliseconds.toFixed(2)} ms (once, when it starts); Rings.update with ${rings.live} rings drawn ${(updateMilliseconds * 1000).toFixed(1)} µs a frame (uniforms only; the passes are the GPU's)`);

  // A zoom (Rings.setCamera with more pixels per radian) plans the live rings again, one a frame.
  const home = HOME_VIEWS[0].camera;
  let time = 2 + frames / 60;
  rings.setCamera(home);
  while (rings.sources.some((source) => source.replan)) rings.update(time += 1 / 60);
  rings.setCamera({ ...home, pixelsPerRadian: 2 * home.pixelsPerRadian });
  const marked = rings.sources.filter((source) => source.replan).length;
  let mostPlanned = 0, slowest = 0, zoomFrames = 0;
  while (rings.sources.some((source) => source.replan) && zoomFrames < 100) {
    const before = rings.sources.filter((source) => source.replan).length;
    const started = performance.now();
    rings.update(time += 1 / 60);
    slowest = Math.max(slowest, performance.now() - started);
    mostPlanned = Math.max(mostPlanned, before - rings.sources.filter((source) => source.replan).length);
    zoomFrames++;
  }
  console.log(`  a zoom to twice the pixels per radian with ${rings.live} rings drawn: ${marked} to plan again, planned over ${zoomFrames} frames, the slowest ${slowest.toFixed(2)} ms (all in one frame: about ${(marked * planMilliseconds).toFixed(1)} ms)`);
  check(marked === rings.live && mostPlanned === 1 && zoomFrames === marked, 'a zoom plans the live rings again one a frame');
}

// ---- the GPU's own profiles (--gpu) ----
if (gpuArgument) await gpuCheck(gpuArgument === '--gpu=half');

console.log(`\n${failures === 0 ? 'ring-probe: all checks pass' : `ring-probe: ${failures} check(s) failed`} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
process.exit(failures === 0 ? 0 : 1);

/**
 * Loads the page headless (the container's SwiftShader, or PW_CHROMIUM),
 * throws the reference stone with Math.random seeded, and 1 and 6 s after the
 * impact reads back the spectrum target and each live ring's profile layer
 * (mip level 0), against ringWeights and schemeProfile in float64 with the
 * sources' own splats and plans.
 */
async function gpuCheck(half) {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  const { readFile } = await import('node:fs/promises');
  const { createServer } = await import('node:http');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`\nThe GPU's rings against float64 (${half ? 'half floats' : 'float32 where the device renders it'})`);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const data = await readFile(path.join(root, decodeURIComponent(url.pathname)));
      response.writeHead(200, { 'content-type': url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      response.end(data);
    } catch {
      response.writeHead(404); response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const containerChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_CHROMIUM || (existsSync(containerChromium) ? containerChromium : undefined),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
  await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
    const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) });
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  await page.goto(`http://localhost:${server.address().port}/index.html?paused=1&ui=0&quality=low${half ? '&floats=half' : ''}`);
  await page.waitForFunction(() => !!window.__pond, { timeout: 120000 });
  await page.evaluate(() => {
    let state = 12345;
    Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
    window.__pond.throwAt(0, -1.4, { radius: 0.03 });
    for (let step = 0; step < 600 && !window.__pond.hasImpacted(); step++) window.__pond.advance(1 / 60);
  });
  let elapsed = 0;
  for (const after of [1, 6]) {
    const readback = await page.evaluate((seconds) => {
      const pond = window.__pond;
      pond.advance(seconds);
      const rings = pond.rings;
      const renderer = pond.renderer;
      const gl = renderer.getContext();
      // Both targets are read as floats through a framebuffer of our own (a half-float target too).
      const spectrumTarget = rings.spectrumTarget;
      const spectrum = new Float32Array(spectrumTarget.width * spectrumTarget.height * 4);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderer.properties.get(spectrumTarget.texture).__webglTexture, 0);
      gl.readPixels(0, 0, spectrumTarget.width, spectrumTarget.height, gl.RGBA, gl.FLOAT, spectrum);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
      const texture = renderer.properties.get(rings.profileTarget.texture).__webglTexture;
      const layers = {};
      for (const source of rings.sources) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, texture, 0, source.layer);
        const pixels = new Float32Array(rings.profileTarget.width * 4);
        gl.readPixels(0, 0, rings.profileTarget.width, 1, gl.RGBA, gl.FLOAT, pixels);
        layers[source.layer] = Array.from(pixels);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      renderer.state.reset();
      return {
        time: pond.time, spectrumWidth: spectrumTarget.width, spectrumType: spectrumTarget.texture.type, spectrum: Array.from(spectrum), layers,
        sources: rings.sources.map((source) => ({ layer: source.layer, groups: source.groups, plan: source.plan, fading: source.fading })),
      };
    }, after - elapsed);
    elapsed = after;
    for (const source of readback.sources) {
      const weights = ringWeights(source, readback.time, { ...source.plan, used: usedCount(source, readback.time), windowReach: source.plan.reach });
      const scheme = drawnProfile(source, readback.time);
      const layer = readback.layers[source.layer];
      let worstSlope = 0, largestSlope = 0, worstHeight = 0, largestHeight = 0, worstSpectrum = 0, largestSpectrum = 0;
      for (let texel = 0; texel < PROFILE_TEXELS; texel++) {
        for (const channel of [0, 1]) {
          largestSlope = Math.max(largestSlope, Math.abs(scheme[4 * texel + channel]));
          worstSlope = Math.max(worstSlope, Math.abs(layer[4 * texel + channel] / RING_TEXTURE_UNITS - scheme[4 * texel + channel]));
        }
        for (const channel of [2, 3]) {
          largestHeight = Math.max(largestHeight, Math.abs(scheme[4 * texel + channel]));
          worstHeight = Math.max(worstHeight, Math.abs(layer[4 * texel + channel] / RING_TEXTURE_UNITS - scheme[4 * texel + channel]));
        }
      }
      for (let index = 0; index < weights.count; index++) {
        const wavenumber = (index + 0.5) * source.plan.step;
        const expected = weights.zeroth[index] / Math.sqrt(wavenumber) * COEFFICIENT_SCALE;
        const read = readback.spectrum[4 * (source.layer * readback.spectrumWidth + index)];
        largestSpectrum = Math.max(largestSpectrum, Math.abs(expected));
        worstSpectrum = Math.max(worstSpectrum, Math.abs(read - expected));
      }
      console.log(`  ${after} s after the impact, ring in layer ${source.layer} (${source.groups.length} groups, ${weights.count} wavenumbers summed): spectrum off by ${exponent(worstSpectrum / largestSpectrum)} of its largest; slope off by ${exponent(worstSlope)} (largest ${exponent(largestSlope)}), height by ${exponent(worstHeight * 1000)} mm (largest ${millimetres(largestHeight)} mm)`);
      // The profile is stored in half floats, which round a value to within 2^-11 of it.
      const stored = largestSlope * 2 ** -11;
      check(worstSlope < SLOPE_VISIBLE / 2 + stored, `the GPU's slope profile is within ${SLOPE_VISIBLE / 2} of float64, beyond the half floats' rounding (${exponent(stored)})`);
    }
  }
  if (problems.length) console.log(`  page errors: ${problems.join('; ')}`);
  check(problems.length === 0, 'the page ran without errors');
  await browser.close();
  server.close();
}
