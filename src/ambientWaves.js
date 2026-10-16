// Ambient wind waves: the ripples a breeze keeps on the whole pond.
//
// A second spectral field, independent of the splash solver
// (src/spectralWater.js): a fixed random draw from a wind-wave spectrum on its
// own periodic tile (AMBIENT_WAVES.tileSize metres, AMBIENT_WAVES.texels² texels,
// on every quality), evaluated afresh every rendered frame at the world time
// (Tessendorf's construction). It is neither forced nor damped and keeps no
// state, so it never drifts on half-float devices and the harness renders the
// same frame every run. Linear waves superpose, so adding it to the splash
// field is exact. The tile repeats over all the water with repeat wrapping;
// the gust envelope (gustEnvelope in src/shaders/scene.js) multiplies it, so
// patches of ripple drift downwind over calmer water and hide the repetition.
//
// Spectrum. For each wave vector k of the tile's lattice, the variance
//     S(k) = A · k⁻⁴ · exp(−(k_low/k)²) · exp(−(k/k_high)²) · (c + (1 − c) cos²(θ − θ_wind))
// with k_low = 2π / longestWave, k_high = 2π / shortestWave, c = crosswind and
// θ the direction of k. A is set so that the rms slope, √(E|∇h|²) over both
// axes, is rmsSlope where the gust envelope is 1. Waves travel downwind; an
// independent draw at upwindAmplitude times the amplitude travels upwind.
// Outside the circle |k| < π/cell (wavelengths under two texels, 4.7 cm) and at
// k = 0 the field is zero, so it is isotropic and has no Nyquist lines.
//
// Seed. The CPU draws once, from a seeded PRNG, two complex amplitudes per
// texel, (A₋, A₊), and the field at time t is
//     H(k, t) = A₋ e^{−iωt} + A₊ e^{+iωt},     h(x, t) = Σ_k H(k, t) e^{+ik·x}
// (the inverse FFT's sign, FFT_PASS_FRAGMENT), so A₋ travels along +k and A₊
// along −k. Of each pair ±k, the member with k·ŵ > 0 (ties broken by the
// crosswind side) takes the downwind draw in A₋ and the upwind draw in A₊; its
// mirror −k takes (conj A₊, conj A₋). Then H(−k, t) = conj H(k, t) at every t
// and the field is real. ω is the splash solver's dispersion,
//     ω² = (g k + σ k³/ρ) · tanh(k D),
// rounded to whole multiples of 2π/period so the field repeats exactly every
// period seconds; the time is passed wrapped into one period, which keeps
// the phases precise in float32 however long the page runs.
// tools/wave-probe.mjs checks all this on the CPU with the GPU's own FFT
// passes: the field is real, its rms slope is the target, waves travel
// downwind, the period holds, the packed channels below come back right and
// the mip roughness matches a measurement; it also prints the cost.
//
// Each frame (update): one evaluation pass writes H(k, t) and the spectra of
// its slopes and Laplacian, i·kx·H, i·kz·H and −k²·H, packed as two complex
// fields of two real ones each (AMBIENT_EVALUATE_FRAGMENT in
// src/shaders/spectral.js); the 2·log2 N inverse FFT passes, which transform
// both pairs at once, write the height texture: RGBA16F, R = height,
// G = ∂h/∂x, B = ∂h/∂z, A = ∇²h, all times HEIGHT_TEXTURE_UNITS (so heights
// are in millimetres, and on the half-float path the shortest waves stay out
// of the subnormal range), linear filtering with mipmaps, repeat wrapping.
// The slopes and the Laplacian are exact, where finite differences of the
// height would lose the shortest waves, which make the glints and the
// caustics; and they cost one lookup. The mipmaps make far ripples average to
// flat instead of shimmering. The slope variance they average away goes back
// into the water shader as roughness: unresolvedVariance[L] is the part of
// the slope variance a base-level lookup shows that a lookup at mip level L
// no longer does, computed here from the draw with a model of the box mips
// and the bilinear lookup, which tools/wave-probe.mjs compares with a
// measurement of the field itself.
//
// The wind's strength (setStrength, WIND_STRENGTHS): one factor on the whole
// field wherever it is used, through the one uniform its heights, slopes and
// Laplacian are scaled by (uAmbientMetresPerUnit), and its square on the
// slope variance the mips lose (unresolvedVariance, which the water shader's
// roughness takes), so the glitter and the caustics follow it too. The gusts
// still move their patches over it, so calm water is glassy but never dead:
// cat's paws of faint ripple drift across it. The foam's drift on the wind
// goes with the strength as well (setWindStrength in src/spectralWater.js).
// AMBIENT_WAVES.rmsSlope is the Breeze's.
//
// uniforms() gives the uniforms that every material sampling the field
// spreads into its own: shared objects, so update() reaches them all.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { AMBIENT_EVALUATE_FRAGMENT, FFT_PASS_FRAGMENT } from './shaders/spectral.js';
import { runInverseFft } from './spectralWater.js';

export const AMBIENT_WAVES = {
  texels: 256,            // per side, on every quality
  tileSize: 6,            // metres per side
  rmsSlope: 0.035,        // rms of |∇h| where the gust envelope is 1
  longestWave: 0.6,       // metres: k_low = 2π / longestWave
  shortestWave: 0.03,     // metres: k_high = 2π / shortestWave
  crosswind: 0.15,        // the directional factor's floor, c
  upwindAmplitude: 0.1,   // the upwind draw's amplitude against the downwind one
  period: 600,            // seconds: the field repeats exactly after this
  seed: 7,
};
// The wind blows mostly away from the camera (which looks toward −Z), a little to the right.
export const DEFAULT_WIND = [0.45, -0.9];
// The Wind control's strengths, against the field drawn at rmsSlope (the
// Breeze, the look the pond had before the control): the factor on the
// ripples' height and slope. Calm is the default (src/main.js). A Gale also
// raises the gale's waves (src/galeWaves.js), and its ripples ride on them.
export const WIND_STRENGTHS = { calm: 0.3, breeze: 1, windy: 1.8, gale: 4 };
const HEIGHT_TEXTURE_UNITS = 1000;   // the height texture holds millimetres

const GRAVITY = 9.81;
const SURFACE_TENSION_OVER_DENSITY = 7.2e-5;

/** ω for a wavenumber (rad/m) on water of the given depth, as SPECTRAL_UPDATE_FRAGMENT computes it. */
export function angularFrequency(wavenumber, depth) {
  return Math.sqrt((GRAVITY * wavenumber + SURFACE_TENSION_OVER_DENSITY * wavenumber ** 3) * Math.tanh(Math.min(wavenumber * depth, 20)));
}

/** ω rounded to a whole multiple of 2π/period, as AMBIENT_EVALUATE_FRAGMENT rounds it. */
export function periodicFrequency(wavenumber, depth, period) {
  const step = 2 * Math.PI / period;
  return Math.floor(angularFrequency(wavenumber, depth) / step + 0.5) * step;
}

/** Signed lattice index of a texel along one axis: 0 … N/2 − 1, then −N/2 … −1. */
export const latticeIndex = (texel, texels) => (texel < texels / 2 ? texel : texel - texels);

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
 * How much of a mode's slope power a lookup at mip level `level` keeps, on
 * average over the tile, factored by axis (each factor depends only on the
 * mode's lattice index along that axis, indexed here by texel): the 2^level
 * box the mip pyramid averages over, squared, times the mean-square gain
 * (2 + cos k·s)/3 of a bilinear lookup between texels s apart. A mode
 * (kx, kz) keeps factor[columnOf kx] · factor[rowOf kz] of its slope power.
 */
export function mipAxisFactor(texels, tileSize, level) {
  const cell = tileSize / texels;
  const width = 2 ** level;
  const factor = new Float64Array(texels);
  for (let texel = 0; texel < texels; texel++) {
    const wavenumber = 2 * Math.PI / tileSize * latticeIndex(texel, texels);
    const halfPhase = wavenumber * cell / 2;
    const box = Math.abs(halfPhase) < 1e-12 ? 1 : Math.sin(width * halfPhase) / (width * Math.sin(halfPhase));
    factor[texel] = box * box * (2 + Math.cos(wavenumber * cell * width)) / 3;
  }
  return factor;
}

/**
 * The seed: per texel (A₋ re, A₋ im, A₊ re, A₊ im) in metres, row-major with
 * the row along world z; the slope variance each mip level loses against the
 * base level; the height variance, and the slope variance a base-level lookup
 * shows (both averaged over time).
 * @returns {{ amplitudes: Float64Array, unresolvedVariance: number[], heightVariance: number, baseLevelVariance: number }}
 */
export function buildWaveSeed({ texels, tileSize, windDirection, rmsSlope, longestWave, shortestWave, crosswind, upwindAmplitude, seed }) {
  const amplitudes = new Float64Array(texels * texels * 4);
  const nextGaussian = gaussianSource(seededRandom(seed));
  const windLength = Math.hypot(windDirection[0], windDirection[1]);
  const windX = windDirection[0] / windLength, windZ = windDirection[1] / windLength;
  const lowWavenumber = 2 * Math.PI / longestWave;
  const highWavenumber = 2 * Math.PI / shortestWave;
  const latticeStep = 2 * Math.PI / tileSize;
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
      const cosine = along / Math.sqrt(squaredIndex);
      const variance = wavenumber ** -4 * Math.exp(-((lowWavenumber / wavenumber) ** 2)) * Math.exp(-((wavenumber / highWavenumber) ** 2))
        * (crosswind + (1 - crosswind) * cosine * cosine);
      const deviation = Math.sqrt(variance / 2);
      const downwindRe = deviation * nextGaussian(), downwindIm = deviation * nextGaussian();
      const upwindRe = upwindAmplitude * deviation * nextGaussian(), upwindIm = upwindAmplitude * deviation * nextGaussian();
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

  // Scale to the target rms slope: Σ k² (|A₋|² + |A₊|²) is the slope variance
  // averaged over time (the cross term of the two draws averages out).
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
  const scale = rmsSlope / Math.sqrt(slopeVariance);
  for (let index = 0; index < amplitudes.length; index++) amplitudes[index] *= scale;
  // Lost relative to the base level: its own bilinear smoothing is the grid's
  // resolution, drawn as it is, not detail finer than a pixel.
  const unresolvedVariance = keptByLevel.map((kept) => Math.max(keptByLevel[0] - kept, 0) * scale * scale);
  return { amplitudes, unresolvedVariance, heightVariance: heightVariance * scale * scale, baseLevelVariance: keptByLevel[0] * scale * scale };
}

export class AmbientWaves {
  /**
   * @param renderer THREE.WebGLRenderer
   * @param windDirection world XZ the wind blows toward (normalised here)
   * @param depth pond depth in metres, for the dispersion
   */
  constructor(renderer, { windDirection = DEFAULT_WIND, depth = 0.8, settings = AMBIENT_WAVES } = {}) {
    this.renderer = renderer;
    this.settings = settings;
    const size = settings.texels;
    this.size = size;
    this.passes = Math.log2(size);
    if (!Number.isInteger(this.passes)) throw new Error('ambient wave tile size must be a power of two');
    this.windDirection = new THREE.Vector2(windDirection[0], windDirection[1]).normalize();

    const { amplitudes, unresolvedVariance } = buildWaveSeed({ ...settings, windDirection: this.windDirection.toArray() });
    this.unresolvedVariance = unresolvedVariance;   // the water shader's uniform holds this array: setStrength rewrites it in place
    this.breezeVariance = unresolvedVariance.slice();
    this.strength = 1;
    this.seedTexture = new THREE.DataTexture(Float32Array.from(amplitudes), size, size, THREE.RGBAFormat, THREE.FloatType);
    this.seedTexture.needsUpdate = true;

    this.spectrumTarget = createFloatTarget(size, size);
    this.fftA = createFloatTarget(size, size);
    this.fftB = createFloatTarget(size, size);
    this.heightTarget = createFloatTarget(size, size, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, wrap: THREE.RepeatWrapping, mipmaps: true });

    this.evaluatePass = new FullscreenPass(AMBIENT_EVALUATE_FRAGMENT, {
      uSeed: { value: this.seedTexture },
      uN: { value: size },
      uTileSize: { value: settings.tileSize },
      uDepth: { value: depth },
      uFrequencyStep: { value: 2 * Math.PI / settings.period },
      uTime: { value: 0 },
      uOutputScale: { value: HEIGHT_TEXTURE_UNITS },
    });
    this.fftPass = new FullscreenPass(FFT_PASS_FRAGMENT, {
      uInput: { value: null },
      uN: { value: size },
      uSubSize: { value: 2 },
      uHorizontal: { value: 1 },
      uFromState: { value: 0 },
    });

    this.sharedUniforms = {
      uAmbientHeight: { value: this.heightTarget.texture },
      uAmbientTileSize: { value: settings.tileSize },
      uAmbientTexels: { value: size },
      uAmbientMetresPerUnit: { value: 1 / HEIGHT_TEXTURE_UNITS },
      uWindDirection: { value: this.windDirection },
      uGustTime: { value: 0 },
    };
  }

  /** Uniforms for every material that samples the field (GLSL_COMMON's ambientHeight and friends). */
  uniforms() { return this.sharedUniforms; }

  /** The wind's strength (the header): the field's height and slope times `strength`, the variance the mips lose times its square. */
  setStrength(strength) {
    this.strength = strength;
    this.sharedUniforms.uAmbientMetresPerUnit.value = strength / HEIGHT_TEXTURE_UNITS;
    for (let level = 0; level < this.unresolvedVariance.length; level++) this.unresolvedVariance[level] = this.breezeVariance[level] * strength * strength;
  }

  /** Mip levels of the height texture, for the size of the water shader's unresolvedVariance table. */
  get levels() { return this.passes + 1; }

  /** Evaluate the field at world time `time` (seconds) into the height texture. */
  update(time) {
    const period = this.settings.period;
    this.evaluatePass.material.uniforms.uTime.value = time - Math.floor(time / period) * period;
    this.sharedUniforms.uGustTime.value = time;
    const previousTarget = this.renderer.getRenderTarget();
    this.evaluatePass.render(this.renderer, this.spectrumTarget);
    runInverseFft(this.renderer, this.fftPass, this.spectrumTarget, [this.fftA, this.fftB], this.heightTarget, this.size, { fromState: false });
    this.renderer.setRenderTarget(previousTarget);
  }

  get heightTexture() { return this.heightTarget.texture; }
}
