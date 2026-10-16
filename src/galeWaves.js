// The gale's waves: the wind sea a gale raises on the lake, metre-long and
// longer waves under the ripples (src/ambientWaves.js), which move the whole
// surface up and down, not only shade it.
//
// The sea. A wind of GALE.windSpeed blowing over GALE.fetch metres of open
// water raises a young, fetch-limited sea, whose spectrum is JONSWAP's
// (Hasselmann et al. 1973), in angular frequency ω:
//     S(ω) = α g² ω⁻⁵ exp(−5/4 (ω_p/ω)⁴) γ^r,   r = exp(−(ω − ω_p)² / (2σ²ω_p²)),
// with the dimensionless fetch χ = gF/U², the peak ω_p = 22 (g/U) χ^−0.33,
// α = 0.076 χ^−0.22, γ = 3.3 and σ = 0.07 below the peak, 0.09 above. For
// the gale (18 m/s over 1.5 km) that is a significant height (four standard
// deviations of the surface) of about 0.36 m, a peak period of 1.85 s and a
// peak wavelength of 5.3 m: crests breaking into whitecaps, as on any lake
// in a gale. Spread over direction θ from the wind as Donelan et al. (1985)
// measured, narrowest at the peak:
//     D(θ) = β / (2 tanh βπ) · sech²(βθ),
//     β = 2.61 (ω/ω_p)^1.3 below 0.95 ω_p, 2.28 (ω/ω_p)^−0.65 to 1.6 ω_p,
//         and 10^(−0.4 + 0.8393 exp(−0.567 ln((ω/ω_p)²))) above (Banner 1990).
// As a wavenumber spectrum on the tile's lattice, each wave vector k holds a
// variance S(ω(k)) dω/dk / k · D(θ) · Δk², with the dispersion of water
// GALE.depth deep, ω² = (gk + σk³/ρ) tanh(kD), as the ripples'. The tile is
// GALE.tileSize metres, GALE.texels² texels: waves from the tile's length
// down to two texels (0.5 m), where the ripples take over.
//
// The field is built as the ripples' is (buildWaveSeed in
// src/ambientWaves.js): two complex amplitudes per wave vector, the
// downwind draw (A₋) and the upwind one (A₊, the spectrum's share at θ + π),
// drawn once from a seeded generator, so the field is real, travels downwind,
// repeats exactly every GALE.period seconds and is the same every run. A
// wave h = a cos(k·x − ωt) has a variance a²/2, so each draw's components
// have a variance of a quarter of the wave vector's.
//
// Sharp crests. A wind sea's crests are sharp and its troughs broad, which a
// sum of cosines is not: the surface is moved sideways as well (Tessendorf's
// "choppy waves"), by
//     D(x, t) = λ Σ_k i (k/|k|) H(k, t) e^{ik·x},
// which carries the water toward each crest, as a trochoidal (Gerstner) wave
// does, λ = GALE.choppiness. Where it carries the water together faster than
// the surface can hold, the Jacobian of the move,
//     J = (1 + ∂Dx/∂x)(1 + ∂Dz/∂z) − (∂Dx/∂z)²,
// falls toward zero: the crest is breaking, and there the water whitens
// (whitecaps, below).
//
// Each frame (update) two evaluation passes (GALE_EVALUATE_FRAGMENT in
// src/shaders/spectral.js) write H(k, t) and its derivatives, packed two real
// fields to a complex one, and two inverse FFTs (the ripples' passes) turn
// them into two textures (RGBA16F, in millimetres, linear, mipmapped,
// repeat-wrapped):
//   displacement  h, Dx, Dz and ∂Dx/∂z (= ∂Dz/∂x);
//   derivatives   ∂h/∂x, ∂h/∂z, ∂Dx/∂x and ∂Dz/∂z.
// The water's vertex shader moves its vertices by the first, the fragment
// shader takes the normal and the Jacobian from the second, at the pixel's
// mip level, with what the mips average away given back as roughness
// (unresolvedVariance, as the ripples' is).
//
// On the CPU (GaleSurface) the stones and the splash ask where the surface
// is: the same sum, over the wave vectors that hold all but
// CPU_DROPPED_VARIANCE of the height's variance, evaluated at a point. The
// near water, where they land, is not moved sideways (GALE_SIDEWAYS_FROM in
// src/shaders/gale.js), so the height there is h at the point itself.
// tools/gale-probe.mjs checks all this on the CPU with the GPU's own FFT
// passes: the field is real and its channels come back right, its height
// and peak are the spectrum's, it travels downwind, repeats after a period,
// how much of it breaks, the CPU's surface against the field, the mip
// roughness against a measurement, and the cost.
//
// Whitecaps (GALE_FOAM_FRAGMENT says how): a foam map of FOAM_TEXELS² on
// the tile, at rest positions, in the units of the solver's foam map (the
// whole foam and its raft), which the water shades as it shades a splash's
// foam. One step a rendered frame, of the world time since the last; the
// map keeps what the breaking crests left, so when the gale rises it is
// first run over SPIN_UP_SECONDS before the moment, in SPIN_UP_STEPS, so
// the water opens on a sea that has been blowing (a moment's work under the
// veil, or as the setting changes). The foam drifts downwind with the
// splash's (FOAM_DRIFT in src/spectralWater.js, foamVelocity).
//
// Spray (GALE_SPRAY_VERTEX in src/shaders/gale.js says how): drops torn off
// the crests where the whitecaps' boil says one has just broken, streaks
// blown downwind, a wisp of SPRAY_DROPS from each of SPRAY_SLOTS places in
// cells SPRAY_CELL apart on the tile, over SPRAY_BLOCK cells a side just
// ahead of the eye (updateView), where spray can be seen at all: an
// instanced set of ribbons each, as the rain's streaks are.
//
// The gale's strength (setStrength): 0 is no gale (nothing runs), 1 the
// gale; the one uniform its heights and displacements are scaled by, as the
// ripples' strength works. Its uniforms join the ripples' shared ones
// (sharedWith), which every material on the water already spreads in, so the
// water, the foam's specks and the rest all see it; the shaders branch on
// uGaleMetresPerUnit, so with no gale none of it runs and nothing compiles
// anew when it starts.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { GALE_EVALUATE_FRAGMENT, GALE_FOAM_FRAGMENT, FFT_PASS_FRAGMENT } from './shaders/spectral.js';
import { GALE_SPRAY_VERTEX, GALE_SPRAY_FRAGMENT } from './shaders/gale.js';
import { runInverseFft } from './spectralWater.js';
import { latticeIndex, mipAxisFactor } from './ambientWaves.js';

export const GALE = {
  texels: 128,           // per side
  tileSize: 32,          // metres per side: six peak wavelengths
  windSpeed: 18,         // m/s, ten metres up: Beaufort 8, a gale
  fetch: 1500,           // metres of open water upwind
  depth: 3,              // metres, for the dispersion: the lake out where the waves are seen
  gamma: 3.3,            // JONSWAP's peak enhancement
  choppiness: 1.0,       // λ, the sideways move's scale
  period: 600,           // seconds: the field repeats exactly after this
  seed: 23,
};
// The gale's strength under each of the Wind control's strengths
// (WIND_STRENGTHS in src/ambientWaves.js): only a gale raises its waves.
export const GALE_STRENGTHS = { calm: 0, breeze: 0, windy: 0, gale: 1 };
const GRAVITY = 9.81;
const SURFACE_TENSION_OVER_DENSITY = 7.2e-5;
const HEIGHT_TEXTURE_UNITS = 1000;     // the textures hold millimetres
export const CPU_DROPPED_VARIANCE = 0.003;   // the share of the height's variance the CPU's sum leaves out
const FOAM_TEXELS = 256;
const BOIL_LIFETIME = 0.8;     // seconds: a whitecap's big bubbles
const RAFT_LIFETIME = 5.0;     // its raft's
const LONGEST_STEP = 0.1;      // seconds: a longer gap between frames steps the foam this far
const SPIN_UP_SECONDS = 6;
const SPRAY_CELL = 0.25;       // metres
const SPRAY_SLOTS = 3;
const SPRAY_DROPS = 3;
const SPRAY_BLOCK = 64;        // cells a side: 16 m
const SPRAY_AHEAD = 6;         // metres ahead of the eye, at most as far as where it looks at the water
const SPRAY_OPACITY = 0.8;
const SPRAY_MIN_PIXELS = 1.2;
const SPIN_UP_STEPS = 40;


/** The sea's parameters from the wind and the fetch (JONSWAP's fits): ω_p (rad/s), α, the significant height (m) and the peak wavelength in deep water (m). */
export function seaState({ windSpeed, fetch }) {
  const dimensionlessFetch = GRAVITY * fetch / windSpeed ** 2;
  const peakFrequency = 22 * (GRAVITY / windSpeed) * dimensionlessFetch ** -0.33;
  return {
    dimensionlessFetch,
    peakFrequency,
    alpha: 0.076 * dimensionlessFetch ** -0.22,
    significantHeight: 0.0016 * Math.sqrt(dimensionlessFetch) * windSpeed ** 2 / GRAVITY,
    peakWavelength: 2 * Math.PI * GRAVITY / peakFrequency ** 2,
  };
}

/** ω for a wavenumber on water `depth` deep (the ripples' dispersion, src/ambientWaves.js). */
export function galeFrequency(wavenumber, depth) {
  return Math.sqrt((GRAVITY * wavenumber + SURFACE_TENSION_OVER_DENSITY * wavenumber ** 3) * Math.tanh(Math.min(wavenumber * depth, 20)));
}

/** dω/dk at a wavenumber, from the same dispersion. */
function groupSpeed(wavenumber, depth) {
  const depthTerm = Math.min(wavenumber * depth, 20);
  const tanh = Math.tanh(depthTerm);
  const sechSquared = 1 - tanh * tanh;
  const restoring = GRAVITY * wavenumber + SURFACE_TENSION_OVER_DENSITY * wavenumber ** 3;
  const derivative = (GRAVITY + 3 * SURFACE_TENSION_OVER_DENSITY * wavenumber ** 2) * tanh + restoring * depth * sechSquared * (wavenumber * depth < 20 ? 1 : 0);
  return derivative / (2 * Math.sqrt(restoring * tanh));
}

/** JONSWAP's S(ω), m²·s. */
export function jonswap(frequency, { peakFrequency, alpha }, gamma) {
  const width = frequency <= peakFrequency ? 0.07 : 0.09;
  const peaked = Math.exp(-((frequency - peakFrequency) ** 2) / (2 * width * width * peakFrequency * peakFrequency));
  return alpha * GRAVITY * GRAVITY * frequency ** -5 * Math.exp(-1.25 * (peakFrequency / frequency) ** 4) * gamma ** peaked;
}

/** Donelan and Banner's spreading D(θ) at a frequency against the peak's (∫D dθ = 1 over the circle). */
export function spreading(angle, frequencyRatio) {
  let beta;
  if (frequencyRatio < 0.95) beta = 2.61 * frequencyRatio ** 1.3;
  else if (frequencyRatio < 1.6) beta = 2.28 * frequencyRatio ** -0.65;
  else beta = 10 ** (-0.4 + 0.8393 * Math.exp(-0.567 * Math.log(frequencyRatio * frequencyRatio)));
  const sech = 1 / Math.cosh(beta * angle);
  return beta / (2 * Math.tanh(beta * Math.PI)) * sech * sech;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianSource(random) {
  let spare = null;
  return () => {
    if (spare !== null) { const value = spare; spare = null; return value; }
    const radius = Math.sqrt(-2 * Math.log(1 - random()));
    const angle = 2 * Math.PI * random();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/**
 * The seed: per texel (A₋ re, A₋ im, A₊ re, A₊ im) in metres, row-major with
 * the row along world z (the ripples' layout); the slope variance each mip
 * level loses against the base level; the height's variance.
 * @returns {{ amplitudes: Float64Array, unresolvedVariance: number[], heightVariance: number, slopeVariance: number }}
 */
export function buildGaleSeed({ texels, tileSize, windSpeed, fetch, depth, gamma, seed, windDirection }) {
  const sea = seaState({ windSpeed, fetch });
  const amplitudes = new Float64Array(texels * texels * 4);
  const nextGaussian = gaussianSource(seededRandom(seed));
  const windLength = Math.hypot(windDirection[0], windDirection[1]);
  const windX = windDirection[0] / windLength, windZ = windDirection[1] / windLength;
  const latticeStep = 2 * Math.PI / tileSize;
  const cellArea = latticeStep * latticeStep;
  const half = texels / 2;
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const indexX = latticeIndex(column, texels), indexZ = latticeIndex(row, texels);
      const squaredIndex = indexX * indexX + indexZ * indexZ;
      if (squaredIndex === 0 || squaredIndex >= half * half) continue;
      const along = indexX * windX + indexZ * windZ;
      const across = indexZ * windX - indexX * windZ;
      const downwindMember = along > 1e-9 || (Math.abs(along) <= 1e-9 && across > 0);
      if (!downwindMember) continue;
      const wavenumber = latticeStep * Math.sqrt(squaredIndex);
      const frequency = galeFrequency(wavenumber, depth);
      const angle = Math.atan2(across, along);   // from the wind, this member's direction of travel
      const omnidirectional = jonswap(frequency, sea, gamma) * groupSpeed(wavenumber, depth) / wavenumber * cellArea;
      const frequencyRatio = frequency / sea.peakFrequency;
      const downwindVariance = omnidirectional * spreading(angle, frequencyRatio);
      const upwindVariance = omnidirectional * spreading(angle > 0 ? angle - Math.PI : angle + Math.PI, frequencyRatio);
      const downwindDeviation = Math.sqrt(downwindVariance / 4), upwindDeviation = Math.sqrt(upwindVariance / 4);
      const downwindRe = downwindDeviation * nextGaussian(), downwindIm = downwindDeviation * nextGaussian();
      const upwindRe = upwindDeviation * nextGaussian(), upwindIm = upwindDeviation * nextGaussian();
      const here = 4 * (row * texels + column);
      amplitudes[here] = downwindRe;
      amplitudes[here + 1] = downwindIm;
      amplitudes[here + 2] = upwindRe;
      amplitudes[here + 3] = upwindIm;
      const mirror = 4 * (((texels - row) % texels) * texels + (texels - column) % texels);
      amplitudes[mirror] = upwindRe;
      amplitudes[mirror + 1] = -upwindIm;
      amplitudes[mirror + 2] = downwindRe;
      amplitudes[mirror + 3] = -downwindIm;
    }
  }

  // The variances, averaged over time: Σ (|A₋|² + |A₊|²) over every texel is
  // the height's, with k² the slope's; and what each mip level keeps of it.
  const levels = Math.log2(texels) + 1;
  const factors = Array.from({ length: levels }, (unused, level) => mipAxisFactor(texels, tileSize, level));
  let slopeVariance = 0, heightVariance = 0;
  const keptByLevel = new Array(levels).fill(0);
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const here = 4 * (row * texels + column);
      const power = amplitudes[here] ** 2 + amplitudes[here + 1] ** 2 + amplitudes[here + 2] ** 2 + amplitudes[here + 3] ** 2;
      if (power === 0) continue;
      const squaredX = (latticeStep * latticeIndex(column, texels)) ** 2, squaredZ = (latticeStep * latticeIndex(row, texels)) ** 2;
      slopeVariance += (squaredX + squaredZ) * power;
      heightVariance += power;
      for (let level = 0; level < levels; level++) keptByLevel[level] += (squaredX + squaredZ) * power * factors[level][column] * factors[level][row];
    }
  }
  const unresolvedVariance = keptByLevel.map((kept) => Math.max(keptByLevel[0] - kept, 0));
  return { amplitudes, unresolvedVariance, heightVariance, slopeVariance, sea };
}

/**
 * The surface's height on the CPU, for the stones and the splash: the field's
 * sum over the wave vectors (one of each ± pair, both its draws) that hold
 * all but CPU_DROPPED_VARIANCE of the height's variance, at a point. The
 * phases come from tables made once a call (e^{i m Δk x} along each axis)
 * and once a time (e^{i n Δω t}, the frequencies being whole multiples of
 * Δω), so a point costs a few multiplications per wave vector.
 */
export class GaleSurface {
  constructor(amplitudes, { texels, tileSize, depth, period }) {
    this.texels = texels;
    this.latticeStep = 2 * Math.PI / tileSize;
    this.frequencyStep = 2 * Math.PI / period;
    this.period = period;
    this.strength = 1;
    // One of each ± pair: h = 2 Re Σ H(k) e^{ik·x} over them.
    const members = [];
    let total = 0;
    for (let row = 0; row < texels; row++) {
      for (let column = 0; column < texels; column++) {
        const indexX = latticeIndex(column, texels), indexZ = latticeIndex(row, texels);
        if (indexZ < 0 || (indexZ === 0 && indexX <= 0)) continue;
        const here = 4 * (row * texels + column);
        const power = amplitudes[here] ** 2 + amplitudes[here + 1] ** 2 + amplitudes[here + 2] ** 2 + amplitudes[here + 3] ** 2;
        if (power === 0) continue;
        total += power;
        const wavenumber = this.latticeStep * Math.hypot(indexX, indexZ);
        const step = Math.floor(galeFrequency(wavenumber, depth) / this.frequencyStep + 0.5);
        members.push({ indexX, indexZ, step, power, amplitude: amplitudes.subarray(here, here + 4) });
      }
    }
    members.sort((first, second) => second.power - first.power);
    let kept = 0, count = 0;
    while (count < members.length && kept < (1 - CPU_DROPPED_VARIANCE) * total) kept += members[count++].power;
    const chosen = members.slice(0, count);
    this.count = count;
    this.keptShare = kept / total;
    this.indexX = Int32Array.from(chosen, (member) => member.indexX);
    this.indexZ = Int32Array.from(chosen, (member) => member.indexZ);
    this.steps = Int32Array.from(chosen, (member) => member.step);
    this.seed = new Float64Array(4 * count);
    chosen.forEach((member, index) => this.seed.set(member.amplitude, 4 * index));
    this.maxStep = Math.max(0, ...this.steps);
    this.spectrum = new Float64Array(2 * count);   // H(k, t), set by setTime
    this.timeTable = new Float64Array(2 * (this.maxStep + 1));
    this.axisX = new Float64Array(2 * texels);     // e^{i m Δk x}, m from −N/2 to N/2 − 1
    this.axisZ = new Float64Array(2 * texels);
    this.time = NaN;
  }

  /** H(k, t) of the kept wave vectors at world time `time` (seconds), as the GPU's evaluation pass makes it. */
  setTime(time) {
    const wrapped = time - Math.floor(time / this.period) * this.period;
    if (wrapped === this.time) return;
    this.time = wrapped;
    const angle = this.frequencyStep * wrapped;
    const stepRe = Math.cos(angle), stepIm = Math.sin(angle);
    const table = this.timeTable;
    table[0] = 1; table[1] = 0;
    for (let step = 1; step <= this.maxStep; step++) {
      // Renormalised every 64 steps against the direct value, so the recurrence never drifts.
      if (step % 64 === 0) { table[2 * step] = Math.cos(angle * step); table[2 * step + 1] = Math.sin(angle * step); continue; }
      const previousRe = table[2 * step - 2], previousIm = table[2 * step - 1];
      table[2 * step] = previousRe * stepRe - previousIm * stepIm;
      table[2 * step + 1] = previousRe * stepIm + previousIm * stepRe;
    }
    for (let index = 0; index < this.count; index++) {
      const turnRe = table[2 * this.steps[index]], turnIm = table[2 * this.steps[index] + 1];
      const downRe = this.seed[4 * index], downIm = this.seed[4 * index + 1], upRe = this.seed[4 * index + 2], upIm = this.seed[4 * index + 3];
      // A₋ e^{−iωt} + A₊ e^{+iωt}
      this.spectrum[2 * index] = downRe * turnRe + downIm * turnIm + upRe * turnRe - upIm * turnIm;
      this.spectrum[2 * index + 1] = downIm * turnRe - downRe * turnIm + upIm * turnRe + upRe * turnIm;
    }
  }

  fillAxis(table, coordinate) {
    const half = this.texels / 2;
    const angle = this.latticeStep * coordinate;
    for (let index = -half; index < half; index++) {
      table[2 * (index + half)] = Math.cos(angle * index);
      table[2 * (index + half) + 1] = Math.sin(angle * index);
    }
  }

  /**
   * The surface at world (x, z) at the time last set (setTime): its height
   * (m) and slope, into `result` ({ height, slopeX, slopeZ }), times the
   * gale's strength.
   */
  sample(x, z, result = { height: 0, slopeX: 0, slopeZ: 0 }) {
    this.fillAxis(this.axisX, x);
    this.fillAxis(this.axisZ, z);
    const half = this.texels / 2;
    let height = 0, slopeX = 0, slopeZ = 0;
    for (let index = 0; index < this.count; index++) {
      const columnX = 2 * (this.indexX[index] + half), columnZ = 2 * (this.indexZ[index] + half);
      const phaseXRe = this.axisX[columnX], phaseXIm = this.axisX[columnX + 1];
      const phaseZRe = this.axisZ[columnZ], phaseZIm = this.axisZ[columnZ + 1];
      const phaseRe = phaseXRe * phaseZRe - phaseXIm * phaseZIm, phaseIm = phaseXRe * phaseZIm + phaseXIm * phaseZRe;
      const spectrumRe = this.spectrum[2 * index], spectrumIm = this.spectrum[2 * index + 1];
      const waveRe = spectrumRe * phaseRe - spectrumIm * phaseIm, waveIm = spectrumRe * phaseIm + spectrumIm * phaseRe;
      height += waveRe;
      // ∂/∂x of Re(w) is Re(i kx w) = −kx Im(w)
      slopeX -= this.indexX[index] * waveIm;
      slopeZ -= this.indexZ[index] * waveIm;
    }
    const scale = 2 * this.strength;
    result.height = scale * height;
    result.slopeX = scale * this.latticeStep * slopeX;
    result.slopeZ = scale * this.latticeStep * slopeZ;
    return result;
  }
}

export class GaleWaves {
  /**
   * @param renderer THREE.WebGLRenderer
   * @param windDirection world XZ the wind blows toward (normalised here)
   * @param centre world XZ of the patch's centre (the sideways move starts out from it, GLSL_COMMON)
   * @param sharedWith the ripples (AmbientWaves): its shared uniforms take the gale's
   * @param lighting its skyAmbient, sunIrradiance and sunDirection light the spray
   */
  constructor(renderer, { windDirection, centre = [0, 0], sharedWith = null, lighting = null, settings = GALE } = {}) {
    this.renderer = renderer;
    this.settings = settings;
    const size = settings.texels;
    this.size = size;
    this.passes = Math.log2(size);
    if (!Number.isInteger(this.passes)) throw new Error('gale tile size must be a power of two');
    this.windDirection = new THREE.Vector2(windDirection[0], windDirection[1]).normalize();

    const { amplitudes, unresolvedVariance, heightVariance, sea } = buildGaleSeed({ ...settings, windDirection: this.windDirection.toArray() });
    this.sea = sea;
    this.heightVariance = heightVariance;
    this.unresolvedVariance = unresolvedVariance.slice();   // the water shader's uniform holds this array: setStrength rewrites it in place
    this.fullVariance = unresolvedVariance;
    this.surface = new GaleSurface(amplitudes, settings);
    this.seedTexture = new THREE.DataTexture(Float32Array.from(amplitudes), size, size, THREE.RGBAFormat, THREE.FloatType);
    this.seedTexture.needsUpdate = true;

    this.spectrumTarget = createFloatTarget(size, size);
    this.fftA = createFloatTarget(size, size);
    this.fftB = createFloatTarget(size, size);
    const fieldOptions = { type: THREE.HalfFloatType, filter: THREE.LinearFilter, wrap: THREE.RepeatWrapping, mipmaps: true };
    this.displacementTarget = createFloatTarget(size, size, fieldOptions);
    this.derivativeTarget = createFloatTarget(size, size, fieldOptions);
    this.foamTargets = [createFloatTarget(FOAM_TEXELS, FOAM_TEXELS, fieldOptions), createFloatTarget(FOAM_TEXELS, FOAM_TEXELS, fieldOptions)];
    this.foamIndex = 0;
    this.foamTime = null;   // the world time the foam map is at; null until the gale has risen
    this.foamVelocity = new THREE.Vector2();   // the surface's drift, m/s (foamVelocity)

    this.evaluatePass = new FullscreenPass(GALE_EVALUATE_FRAGMENT, {
      uSeed: { value: this.seedTexture },
      uN: { value: size },
      uTileSize: { value: settings.tileSize },
      uDepth: { value: settings.depth },
      uFrequencyStep: { value: 2 * Math.PI / settings.period },
      uTime: { value: 0 },
      uOutputScale: { value: HEIGHT_TEXTURE_UNITS },
      uChoppiness: { value: settings.choppiness },
      uPart: { value: 0 },
    });
    this.foamPass = new FullscreenPass(GALE_FOAM_FRAGMENT, {
      uPrevious: { value: null },
      uDisplacement: { value: this.displacementTarget.texture },
      uDerivatives: { value: this.derivativeTarget.texture },
      uMetresPerUnit: { value: 1 / HEIGHT_TEXTURE_UNITS },
      uFieldTexels: { value: size },
      uTexels: { value: FOAM_TEXELS },
      uDrift: { value: new THREE.Vector2() },
      uStep: { value: 0 },
      uBoilKeep: { value: 1 },
      uRaftKeep: { value: 1 },
    });
    this.fftPass = new FullscreenPass(FFT_PASS_FRAGMENT, {
      uInput: { value: null },
      uN: { value: size },
      uSubSize: { value: 2 },
      uHorizontal: { value: 1 },
      uFromState: { value: 0 },
    });

    this.sharedUniforms = {
      uGaleDisplacement: { value: this.displacementTarget.texture },
      uGaleDerivatives: { value: this.derivativeTarget.texture },
      uGaleTileSize: { value: settings.tileSize },
      uGaleTexels: { value: size },
      uGaleMetresPerUnit: { value: 0 },   // 0 while no gale blows
      uGaleCentre: { value: new THREE.Vector2(centre[0], centre[1]) },
      uGaleBed: { value: 1 },   // the bed's depth under the patch's centre (setBed)
      uGaleFoam: { value: this.foamTargets[0].texture },
      uGaleFoamTexels: { value: FOAM_TEXELS },
    };
    if (sharedWith) Object.assign(sharedWith.uniforms(), this.sharedUniforms);

    const cellsPerTile = Math.round(settings.tileSize / SPRAY_CELL);
    const sprayCount = SPRAY_BLOCK ** 2 * SPRAY_SLOTS;
    const sprayCells = new Float32Array(3 * sprayCount);
    let point = 0;
    for (let row = 0; row < SPRAY_BLOCK; row++) {
      for (let column = 0; column < SPRAY_BLOCK; column++) {
        for (let slot = 0; slot < SPRAY_SLOTS; slot++) sprayCells.set([column, row, slot], 3 * point++);
      }
    }
    const sprayGeometry = new THREE.InstancedBufferGeometry();
    // A ribbon per drop of the wisp: corners (across, along, which drop).
    const corners = [], indices = [];
    for (let drop = 0; drop < SPRAY_DROPS; drop++) {
      corners.push(-1, 0, drop, 1, 0, drop, -1, 1, drop, 1, 1, drop);
      indices.push(4 * drop, 4 * drop + 1, 4 * drop + 2, 4 * drop + 2, 4 * drop + 1, 4 * drop + 3);
    }
    sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    sprayGeometry.setIndex(indices);
    sprayGeometry.setAttribute('aSpray', new THREE.InstancedBufferAttribute(sprayCells, 3));
    sprayGeometry.instanceCount = sprayCount;
    this.spray = new THREE.Mesh(sprayGeometry, new THREE.ShaderMaterial({
      vertexShader: GALE_SPRAY_VERTEX,
      fragmentShader: GALE_SPRAY_FRAGMENT,
      uniforms: {
        ...this.sharedUniforms,
        uSprayOrigin: { value: new THREE.Vector2() },
        uSprayCell: { value: settings.tileSize / cellsPerTile },
        uSprayCellsPerTile: { value: cellsPerTile },
        uTime: { value: 0 },
        uWind: { value: this.windDirection },
        uBoilLifetime: { value: BOIL_LIFETIME },
        uFocalPx: { value: 1000 },
        uMinPixels: { value: SPRAY_MIN_PIXELS },
        uOpacity: { value: SPRAY_OPACITY },
        uSkyAmbient: { value: lighting?.skyAmbient ?? new THREE.Vector3(1, 1, 1) },
        uSunIrradiance: { value: lighting?.sunIrradiance ?? new THREE.Vector3() },
        uSunDir: { value: lighting?.sunDirection ?? new THREE.Vector3(0, 1, 0) },
      },
      side: THREE.DoubleSide,   // a ribbon's winding turns with its streak against the eye
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.spray.frustumCulled = false;
    this.spray.visible = false;
    this.strength = 0;
    this.setStrength(0);
  }

  /** Uniforms for every material that samples the field (GALE_SURFACE in src/shaders/gale.js, and GLSL_COMMON's lookups in src/shaders/scene.js). */
  uniforms() { return this.sharedUniforms; }

  /** The bed's depth under the patch's centre (m): under the water, things move with the column between it and the surface (galeLift). */
  setBed(depth) { this.sharedUniforms.uGaleBed.value = depth; }

  /** Whether the gale blows (a strength over 0): only then does update run its passes. */
  get on() { return this.strength > 0; }

  /** The gale's strength, 0 (none) to 1: its heights, displacements and slopes times it, the roughness its mips lose times its square. */
  setStrength(strength) {
    if (strength === 0) this.foamTime = null;   // the next gale rises afresh
    this.strength = strength;
    this.spray.visible = strength > 0;
    this.surface.strength = strength;
    this.sharedUniforms.uGaleMetresPerUnit.value = strength / HEIGHT_TEXTURE_UNITS;
    for (let level = 0; level < this.unresolvedVariance.length; level++) this.unresolvedVariance[level] = this.fullVariance[level] * strength * strength;
  }

  /** Mip levels of the textures, for the size of the water shader's unresolvedVariance table. */
  get levels() { return this.passes + 1; }

  /**
   * The spray to the frame: its clock, its size on the screen, and its
   * block, about SPRAY_AHEAD in front of the eye toward where it looks at the
   * water (focus, world XZ), and no farther than that.
   */
  updateView(time, camera, resolution, focus) {
    if (!this.on) return;
    const uniforms = this.spray.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uFocalPx.value = camera.projectionMatrix.elements[5] * resolution.y * 0.5;
    const towardX = focus[0] - camera.position.x, towardZ = focus[1] - camera.position.z;
    const along = Math.min(SPRAY_AHEAD / Math.max(Math.hypot(towardX, towardZ), 1e-6), 1);
    const cell = uniforms.uSprayCell.value;
    uniforms.uSprayOrigin.value.set(Math.floor((camera.position.x + towardX * along) / cell) - SPRAY_BLOCK / 2, Math.floor((camera.position.z + towardZ * along) / cell) - SPRAY_BLOCK / 2);
  }

  /** The surface's drift downwind (m/s, a Vector2): the foam's, which the splash's follows too (src/spectralWater.js). */
  setFoamVelocity(velocity) { this.foamVelocity.copy(velocity); }

  /**
   * Evaluate the field at world time `time` (seconds) into its two textures,
   * and step the foam to it (first spun up, when the gale has just risen);
   * the CPU's surface follows.
   */
  update(time) {
    if (!this.on) return;
    const previousTarget = this.renderer.getRenderTarget();
    if (this.foamTime === null) {
      const clearColour = this.renderer.getClearColor(new THREE.Color()), clearAlpha = this.renderer.getClearAlpha();
      this.renderer.setClearColor(0x000000, 0);
      for (const target of this.foamTargets) { this.renderer.setRenderTarget(target); this.renderer.clear(true, false, false); }
      this.renderer.setClearColor(clearColour, clearAlpha);
      this.foamTime = time - SPIN_UP_SECONDS;
      for (let step = 1; step < SPIN_UP_STEPS; step++) {
        const moment = time - SPIN_UP_SECONDS * (1 - step / SPIN_UP_STEPS);
        this.evaluate(moment);
        this.stepFoam(moment);
      }
    }
    this.evaluate(time);
    this.stepFoam(time);
    this.renderer.setRenderTarget(previousTarget);
    this.surface.setTime(time);
  }

  evaluate(time) {
    const period = this.settings.period;
    const uniforms = this.evaluatePass.material.uniforms;
    uniforms.uTime.value = time - Math.floor(time / period) * period;
    for (const [part, output] of [[0, this.displacementTarget], [1, this.derivativeTarget]]) {
      uniforms.uPart.value = part;
      this.evaluatePass.render(this.renderer, this.spectrumTarget);
      runInverseFft(this.renderer, this.fftPass, this.spectrumTarget, [this.fftA, this.fftB], output, this.size, { fromState: false });
    }
  }

  /**
   * For the warm-up (src/main.js): blow (strength 1) and run each pass once,
   * the evaluation's, the FFT's and the foam's, with no spin-up, so their
   * programs are built and the frame drawn next draws the spray; done(),
   * the strength back, and a gale that blows then spun up at its first frame.
   */
  warmUp() {
    const strength = this.strength;
    this.setStrength(1);
    const previousTarget = this.renderer.getRenderTarget();
    this.evaluate(0);
    this.foamTime = -LONGEST_STEP;
    this.stepFoam(0);
    this.renderer.setRenderTarget(previousTarget);
    return { done: () => { this.setStrength(strength); this.foamTime = null; } };
  }

  /** One step of the foam map from its time to `time` (at most LONGEST_STEP; none backwards). */
  stepFoam(time) {
    const step = Math.min(Math.max(time - this.foamTime, 0), LONGEST_STEP);
    this.foamTime = time;
    if (step === 0) return;
    const uniforms = this.foamPass.material.uniforms;
    const source = this.foamTargets[this.foamIndex], target = this.foamTargets[1 - this.foamIndex];
    uniforms.uPrevious.value = source.texture;
    uniforms.uMetresPerUnit.value = this.sharedUniforms.uGaleMetresPerUnit.value;
    uniforms.uDrift.value.copy(this.foamVelocity).multiplyScalar(step / this.settings.tileSize);
    uniforms.uStep.value = step;
    uniforms.uBoilKeep.value = Math.exp(-step / BOIL_LIFETIME);
    uniforms.uRaftKeep.value = Math.exp(-step / RAFT_LIFETIME);
    this.foamPass.render(this.renderer, target);
    this.foamIndex = 1 - this.foamIndex;
    this.sharedUniforms.uGaleFoam.value = target.texture;
  }

  /** The surface's height and slope at world (x, z) now (GaleSurface.sample); zero with no gale. */
  sample(x, z, result = { height: 0, slopeX: 0, slopeZ: 0 }) {
    if (!this.on) { result.height = 0; result.slopeX = 0; result.slopeZ = 0; return result; }
    return this.surface.sample(x, z, result);
  }
}
