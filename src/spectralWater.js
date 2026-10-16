// Spectral height-field water.
//
// The surface is a square, periodic patch of N×N cells. Its state lives in
// Fourier space: for every wave vector k we keep the complex amplitude of the
// height and of its time derivative. Linear water waves obey
//     ω² = (g k + σ k³ / ρ) · tanh(k D)
// so each mode is advanced exactly by rotating (H, V) through ω·dt, which is
// stable for any time step and gives the correct dispersion: long ripples
// outrun short ones, as they do on a real pond. Damping is applied per mode
// (DAMPING): γ(k) = γ0·min(k/k_d, 1) + ν·k², plus γ_low for waves longer than
// 2.4 m so the patch never sloshes: γ0 in full for ripples shorter than
// 30 cm (k_d), in proportion to k for longer ones. It is a solver's damping,
// not a pond's (about ten times a real pond's): the patch is periodic, so
// its waves must die before they come round it, and it holds only the near
// field (below); the rings that cross the pond are src/rings.js's, damped as
// a real pond damps them.
//
// Disturbances enter as Gaussian "splats" (a height or vertical-velocity
// impulse at a point). A Gaussian has a closed-form spectrum, so splats are
// added in Fourier space without any forward transform. The splash's ring
// sources (its cavity's splats and the jet's secondary ring) go instead to
// the analytic rings the app hands the solver as `rings` (src/rings.js),
// which carry them across the whole pond with a real pond's damping; so this
// patch holds the near field (the drops' landings, the jet's mound and base),
// and its damping and its sleep (below) only ever need to outlast that. Each frame one
// inverse FFT (2·log2 N passes) brings height and velocity back to the grid
// as an RG16F texture: R = height (m), G = vertical velocity (m/s). The
// state holds the spectra without the inverse transform's 1/N² (the forward
// transform's units), so a small stone's coefficients stay normal half floats
// where float32 targets are missing; the passes divide it out on the way
// (SOLVER_FFT_PASS_FRAGMENT). Splats and foam centred off the patch are
// refused: a splat would wrap through the periodic transform and ring on the
// far side, and foam would leave a sliver along the edge. The state is
// RGBA32F (H and V, two complex numbers per mode); the FFT's two scratch
// targets are RG32F, since the solver's transform carries one complex field
// (the FFT pass's second pair is the ambient waves', which keep their own
// RGBA targets).
//
// A separate foam map (FOAM_FRAGMENT), RGBA16F. R is the amount of foam, 0
// to 1, and all the water shader and the specks read. The rest keeps apart
// two kinds that last very differently: a boil, the big bubbles a splash
// brings up, popping within a second or two, and a raft, the small bubbles
// left, lasting seconds. G is the raft's amount, B the raft's amount times its
// lifetime τ, A the boil's amount (R − G) times its own. Each stamp brings its
// kind and its τ (foamLifetime by default, growing with its radius), and where
// foam of one kind mixes, by stamping, spreading or drifting, its τ is the
// amount-weighted mean, so each kind decays as exp(−t/τ) with the τ of its own
// foam there. (With one mean for both, a boil of 0.8 s over a raft of 5 s
// would drag the raft's life down to under 2 s.) The map spreads
// (FOAM_DIFFUSIVITY, the same in metres on every grid), drifts with the wind
// (FOAM_DRIFT along setWind's direction, times the wind's strength,
// setWindStrength), is carried by surface flows
// (addFoamFlow: a source where the water wells up, which sweeps the foam out
// of a disc into a ring and keeps its amount), and is stamped by splashes and
// by fast surface motion; FOAM_FRAGMENT says how. The water shader turns the
// amount into a bubble pattern (FOAM_PATTERN in src/shaders/scene.js), about
// 90% covered at 0.5, half at 0.1 and nothing below FOAM_PRESENT ≈ 0.001, the
// pattern drifting with the map: foamUniforms.uFoamDrift is how far the wind
// has carried it since the map was last cleared, foamUniforms.uFoamVelocity
// the drift's velocity, which the specks ride too.
//
// Grid size (resize): the quality presets (src/main.js) change N. A mode of
// the state is N² times the field's Fourier series coefficient at its wave
// vector, which is the same on any grid (a splat's is 2πr²/D² times its
// shape, r its radius and D the patch in metres), so a resize carries the
// waves over: every mode both grids hold is copied, times (N_new/N_old)²
// (RESAMPLE_FRAGMENT; the smaller grid's Nyquist row and column are
// dropped, as their real field is not a free pair), the foam map is
// resampled by its bilinear mean (FOAM_RESAMPLE_FRAGMENT), and anything still
// queued is applied first. The targets keep their texture
// objects (setSize), so materials holding heightTexture stay bound; the
// sizes they need (uN, uCell, uTexelOffset) are the shared objects of
// gridUniforms, which a resize updates.
//
// Sleep. With nothing to add, a still pond needs no passes at all: step()
// does nothing while the solver is asleep, and wakes at the first splat or
// foam stamp queued. The app (src/main.js) puts it to sleep once quietSeconds
// (simulated seconds since the last splat or stamp) reaches SLEEP_SECONDS and
// nothing in the splash is alive; sleep() clears the state, height and foam
// textures once, so the pond is exactly still. SLEEP_SECONDS is the time the
// largest splash's field takes to fade below what a pixel shows, from the
// damping above and the foam's longest lifetime: see SLEEP_SECONDS. The rings
// (src/rings.js) keep their own time: each retires when it fades.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { SPECTRAL_UPDATE_FRAGMENT, SOLVER_FFT_PASS_FRAGMENT, FOAM_FRAGMENT } from './shaders/spectral.js';

const MAX_SPLATS = 32;
const MAX_FOAM = 16;
const MAX_FLOWS = 8;       // flows the foam pass moves the map with at once (the strongest this step)
// Damping per mode (see the header). tools/splash-probe.mjs reads these to
// evolve a splash's ring as the GPU does.
export const DAMPING = {
  base: 0.3,              // γ0, 1/s, for ripples shorter than baseWavelength...
  baseWavelength: 0.3,    // ...m, and in proportion to k for longer ones
  viscosity: 4e-5,        // ν, m²/s
  lowShare: 1 / 2.5,      // waves longer than this share of the patch (2.4 m)...
  low: 1.5,               // ...are damped this much harder, 1/s
};

// How long the solver runs on after its last splat or foam stamp before it
// may sleep (simulated seconds). The slowest part is the waves: the solver
// damps long waves least (DAMPING), so what is left of a splash after a few
// seconds is its longest waves, metres long, decaying with time constants of
// 10 to 25 s. Evolving every splat the solver gets from the largest splash
// (a 16 cm stone thrown hard: about 1090 splats over 1.0 s, its ring sources
// gone to src/rings.js) with the solver's own lattice, injection, dispersion
// and damping (on the CPU, 512 grid), the field's largest slope is 3.4e-4 at
// 30 s after its last splat, 8.8e-5 at 45 s, 3.1e-5 at 60 s and 1.7e-5 at
// 75 s, its height 0.08, 0.03, 0.014 and 0.007 mm, and the floor's caustics
// change by 0.07, 0.009, 0.004 and 0.002%. (With the ring sources the
// solver used to carry, the slope at 75 s was 4.4e-5.)
// A slope of 1e-4 turns a reflection by 2e-4 rad, under a third of a pixel
// at the phone's framing (1400 px per radian): at 75 s the field shows
// nowhere, with room for a second stone as big (a 4 cm stone's field is
// gone by 20 s). The foam is gone sooner: either
// kind decays at least as fast as exp(−t/6 s) (FOAM_LIFETIME.longest) and the
// pattern draws nothing under FOAM_PRESENT ≈ 0.00106 (src/shaders/scene.js),
// so even a full raft (1) is gone 6·ln(1/0.00106) = 41 s after its last
// stamp (the flows and the drift only move foam, and never raise it). Hence 75 s.
export const SLEEP_SECONDS = 75;
export const FOAM_DIFFUSIVITY = 5e-5;   // m²/s: a raft's edge spreads by about 3 cm in 10 s
const FOAM_LIFETIME = { base: 1.5, perMetre: 15, longest: 6 };   // τ = base + perMetre·radius, at most longest (s), of either kind
const CHURN_LIFETIME = 2.0;       // τ of the boil fast surface motion churns up (s)
// The surface water's drift downwind, which carries the foam and its specks
// (m/s): about 2% of the breeze, whose cat's paws travel at 1.5 m/s
// (GUST_DRIFT in src/shaders/scene.js); at the Breeze's strength, and in
// proportion to the wind's strength (setWindStrength, WIND_STRENGTHS in
// src/ambientWaves.js) otherwise.
export const FOAM_DRIFT = 0.03;
// A flow (addFoamFlow) wells up through a core of `core` times the radius it
// clears (the foam at its centre keeps exp(−1/core²) of its amount; the rest
// of the disc moves out whole), and is dropped once all but exp(−span) of its
// area is spent. tools/foam-probe.mjs runs FOAM_FRAGMENT with these.
export const FOAM_FLOW = { core: 0.25, span: 6 };

// The state on a grid of another size: each mode both grids hold, copied
// (see the header); every other mode is zero.
const RESAMPLE_FRAGMENT = /* glsl */`
uniform sampler2D uState;   // the state on the old grid
uniform float uFromSize;
uniform float uToSize;
uniform float uScale;       // (uToSize / uFromSize)²: the state's units are the forward transform's
void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  int toSize = int(uToSize);
  int fromSize = int(uFromSize);
  int keep = min(toSize, fromSize) / 2;
  ivec2 wave = ivec2(texel.x < toSize / 2 ? texel.x : texel.x - toSize, texel.y < toSize / 2 ? texel.y : texel.y - toSize);
  if (abs(wave.x) >= keep || abs(wave.y) >= keep) { gl_FragColor = vec4(0.0); return; }
  ivec2 source = ivec2(wave.x < 0 ? wave.x + fromSize : wave.x, wave.y < 0 ? wave.y + fromSize : wave.y);
  gl_FragColor = texelFetch(uState, source, 0) * uScale;
}
`;

// The foam map on a grid of another size: its bilinear mean, one linearly
// filtered fetch. Every channel is an amount or an amount times a lifetime,
// so the lifetimes stay the amount-weighted means FOAM_FRAGMENT keeps (a
// halving averages each 2×2 block).
const FOAM_RESAMPLE_FRAGMENT = /* glsl */`
uniform sampler2D uFoam;    // the map on the old grid
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uFoam, vUv);
}
`;

/** The lifetime τ (s) of foam stamped over a Gaussian of this radius (m). */
export function foamLifetime(radius) {
  return Math.min(FOAM_LIFETIME.base + FOAM_LIFETIME.perMetre * radius, FOAM_LIFETIME.longest);
}

/**
 * The inverse FFT on the GPU: 2·log2(size) passes of fftPass (FFT_PASS_FRAGMENT,
 * or the solver's SOLVER_FFT_PASS_FRAGMENT), rows then columns, ping-ponging
 * between the two scratch targets; the last pass writes `output`. With
 * fromState the first pass reads `input` as a state texture (H + iV from its
 * four channels); otherwise as two complex pairs, as the ambient waves
 * (src/ambientWaves.js) write it.
 */
export function runInverseFft(renderer, fftPass, input, [scratchA, scratchB], output, size, { fromState: firstFromState = true } = {}) {
  const fft = fftPass.material.uniforms;
  const totalPasses = 2 * Math.log2(size);
  let source = input;
  let fromState = firstFromState ? 1 : 0;
  let scratch = scratchA;
  let passIndex = 0;
  for (let axis = 0; axis < 2; axis++) {
    for (let subSize = 2; subSize <= size; subSize *= 2) {
      passIndex++;
      fft.uInput.value = source.texture;
      fft.uSubSize.value = subSize;
      fft.uHorizontal.value = axis === 0 ? 1 : 0;
      fft.uFromState.value = fromState;
      const target = passIndex === totalPasses ? output : scratch;
      fftPass.render(renderer, target);
      fromState = 0;
      source = target;
      scratch = target === scratchA ? scratchB : scratchA;
    }
  }
}

export class SpectralWater {
  /**
   * @param renderer THREE.WebGLRenderer
   * @param size cells per side, a power of two
   * @param domainSize metres per side
   * @param centre world XZ of the patch centre
   * @param depth pond depth in metres
   */
  constructor(renderer, { size = 512, domainSize = 6, centre = [0, -1], depth = 0.8 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.domainSize = domainSize;
    this.cell = domainSize / size;
    this.centre = centre;
    this.depth = depth;
    this.domainMin = [centre[0] - domainSize / 2, centre[1] - domainSize / 2];
    this.passes = Math.log2(size);
    if (!Number.isInteger(this.passes)) throw new Error('water grid size must be a power of two');

    this.stateA = createFloatTarget(size, size);
    this.stateB = createFloatTarget(size, size);
    this.fftA = createFloatTarget(size, size, { format: THREE.RGFormat });
    this.fftB = createFloatTarget(size, size, { format: THREE.RGFormat });
    // Display texture: linear filtering, half float, repeat wrapping (the patch is periodic).
    this.heightTarget = createFloatTarget(size, size, { format: THREE.RGFormat, type: THREE.HalfFloatType, filter: THREE.LinearFilter, wrap: THREE.RepeatWrapping });
    this.foamA = createFloatTarget(size, size, { type: THREE.HalfFloatType, filter: THREE.LinearFilter });
    this.foamB = createFloatTarget(size, size, { type: THREE.HalfFloatType, filter: THREE.LinearFilter });
    // The sizes every material sampling the water needs, as shared objects (the header: resize).
    this.gridUniforms = { uN: { value: size }, uCell: { value: this.cell }, uTexelOffset: { value: 0.5 / size } };

    this.splats = [];
    this.foamSplats = [];
    this.flows = [];             // surface flows carrying the foam (addFoamFlow)
    // How far the wind has carried the foam since the map was last cleared (m),
    // and at what velocity (m/s, setWind): the water shader's pattern and the
    // specks drift with the map.
    this.foamUniforms = { uFoamDrift: { value: new THREE.Vector2() }, uFoamVelocity: { value: new THREE.Vector2() } };
    this.windDirection = [1, 0];
    this.windStrength = 1;
    // The analytic rings (src/rings.js) the splash hands its ring sources to,
    // when the app attaches them; without them (the CPU probes' stand-ins
    // have none) the splash rings this patch as it always did.
    this.rings = null;
    this.timeScaleDamping = 1;
    this.asleep = true;          // a still pond: step() does nothing until something is queued
    this.quietSeconds = 0;       // simulated seconds since the last splat or foam stamp

    const splatArray = [];
    const ampArray = [];
    for (let i = 0; i < MAX_SPLATS; i++) { splatArray.push(new THREE.Vector4()); ampArray.push(new THREE.Vector2()); }
    this.updatePass = new FullscreenPass(SPECTRAL_UPDATE_FRAGMENT, {
      uState: { value: null },
      uN: { value: size },
      uCell: { value: this.cell },
      uDepth: { value: depth },
      uDt: { value: 0 },
      uGamma0: { value: DAMPING.base },
      uKDamp: { value: (2 * Math.PI) / DAMPING.baseWavelength },
      uNu: { value: DAMPING.viscosity },
      uKLow: { value: (2 * Math.PI) / (domainSize * DAMPING.lowShare) },
      uGammaLow: { value: DAMPING.low },
      uSplatCount: { value: 0 },
      uSplats: { value: splatArray },
      uSplatAmps: { value: ampArray },
    });
    this.fftPass = new FullscreenPass(SOLVER_FFT_PASS_FRAGMENT, {
      uInput: { value: null },
      uN: { value: size },
      uSubSize: { value: 2 },
      uHorizontal: { value: 1 },
      uFromState: { value: 0 },
    });
    this.foamPass = new FullscreenPass(FOAM_FRAGMENT, {
      uFoam: { value: null },
      uHeight: { value: this.heightTarget.texture },
      uN: { value: size },
      uDt: { value: 0 },
      uDiffusionRate: { value: 4 * FOAM_DIFFUSIVITY / (this.cell * this.cell) },
      uChurnLifetime: { value: CHURN_LIFETIME },
      uDrift: { value: new THREE.Vector2() },
      uFlowCount: { value: 0 },
      uFlows: { value: Array.from({ length: MAX_FLOWS }, () => new THREE.Vector4()) },
      uFoamCount: { value: 0 },
      uFoamSplats: { value: Array.from({ length: MAX_FOAM }, () => new THREE.Vector4()) },
      uFoamKinds: { value: Array.from({ length: MAX_FOAM }, () => new THREE.Vector2(FOAM_LIFETIME.base, 0)) },
    });
    this.resamplePass = new FullscreenPass(RESAMPLE_FRAGMENT, { uState: { value: null }, uFromSize: { value: size }, uToSize: { value: size }, uScale: { value: 1 } });
    this.foamResamplePass = new FullscreenPass(FOAM_RESAMPLE_FRAGMENT, { uFoam: { value: null }, uFromSize: { value: size }, uToSize: { value: size } });
    this.clear();
  }

  /** Zero every target and drop what is queued: a still pond, asleep. */
  clear() {
    const previous = this.renderer.getRenderTarget();
    for (const target of [this.stateA, this.stateB, this.fftA, this.fftB, this.heightTarget, this.foamA, this.foamB]) {
      this.renderer.setRenderTarget(target);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(previous);
    this.splats = [];
    this.foamSplats = [];
    this.flows = [];
    this.foamUniforms.uFoamDrift.value.set(0, 0);
    this.asleep = true;
    this.quietSeconds = 0;
  }

  /** Stop stepping a pond whose waves and foam have faded (the header: sleep): clear it once. */
  sleep() {
    if (!this.asleep) this.clear();
  }

  /** Step from now on even with nothing queued (the profiler measures what sleeping saves). */
  wake() {
    this.asleep = false;
  }

  /** Whether the last splat or foam stamp is SLEEP_SECONDS behind (the app also waits for the splash to end). */
  get settled() { return this.quietSeconds >= SLEEP_SECONDS; }

  /**
   * Change the grid to size × size cells, keeping the waves and the foam (the
   * header: grid size). Every target keeps its texture object.
   */
  resize(size) {
    if (size === this.size) return;
    if (!Number.isInteger(Math.log2(size))) throw new Error('water grid size must be a power of two');
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    while (this.splats.length > 0 || this.foamSplats.length > 0) this.step(0);   // what is queued is in the old grid's texels
    const fromSize = this.size;
    const resample = (pass, sourceName, target, source) => {
      target.setSize(size, size);
      pass.material.uniforms[sourceName].value = source.texture;
      pass.material.uniforms.uFromSize.value = fromSize;
      pass.material.uniforms.uToSize.value = size;
      pass.render(renderer, target);
    };
    if (!this.asleep) {
      this.resamplePass.material.uniforms.uScale.value = (size / fromSize) ** 2;
      resample(this.resamplePass, 'uState', this.stateB, this.stateA);
      [this.stateA, this.stateB] = [this.stateB, this.stateA];
      resample(this.foamResamplePass, 'uFoam', this.foamB, this.foamA);
      [this.foamA, this.foamB] = [this.foamB, this.foamA];
    }
    for (const target of [this.stateA, this.stateB, this.fftA, this.fftB, this.heightTarget, this.foamA, this.foamB]) target.setSize(size, size);

    this.size = size;
    this.cell = this.domainSize / size;
    this.passes = Math.log2(size);
    this.gridUniforms.uN.value = size;
    this.gridUniforms.uCell.value = this.cell;
    this.gridUniforms.uTexelOffset.value = 0.5 / size;
    this.updatePass.material.uniforms.uN.value = size;
    this.updatePass.material.uniforms.uCell.value = this.cell;
    this.fftPass.material.uniforms.uN.value = size;
    this.foamPass.material.uniforms.uN.value = size;
    this.foamPass.material.uniforms.uDiffusionRate.value = 4 * FOAM_DIFFUSIVITY / (this.cell * this.cell);
    if (this.asleep) {
      this.clear();
    } else {
      // The height texture from the carried state; the B targets are written before they are read.
      runInverseFft(renderer, this.fftPass, this.stateA, [this.fftA, this.fftB], this.heightTarget, this.size);
    }
    renderer.setRenderTarget(previousTarget);
  }

  dispose() {
    for (const target of [this.stateA, this.stateB, this.fftA, this.fftB, this.heightTarget, this.foamA, this.foamB]) target.dispose();
    for (const pass of [this.updatePass, this.fftPass, this.foamPass, this.resamplePass, this.foamResamplePass]) pass.material.dispose();
  }

  /** World XZ to texel coordinates (texel 0 sits at domainMin). */
  worldToTexel(x, z) {
    return [(x - this.domainMin[0]) / this.cell, (z - this.domainMin[1]) / this.cell];
  }

  /** World XZ to texture uv for sampling the height and foam textures. */
  get uvOffset() { return 0.5 / this.size; }

  /**
   * Queue a Gaussian disturbance; false, queuing nothing, for a point off the patch.
   * @param x,z world position (m)   @param radius Gaussian sigma (m)
   * @param height peak height impulse (m)   @param velocity peak vertical velocity impulse (m/s)
   */
  addSplat({ x, z, radius, height = 0, velocity = 0, rim = 1.7 }) {
    const [tx, tz] = this.worldToTexel(x, z);
    // Off the patch it would wrap through the periodic transform (and a NaN would spoil every mode).
    if (!(tx >= 0 && tx <= this.size && tz >= 0 && tz <= this.size)) return false;
    this.splats.push({ tx, tz, sigma: Math.max(radius / this.cell, 0.6), height, velocity, rim });
    return true;
  }

  /**
   * Stamp foam: a Gaussian of `radius` (m) and peak `amount`, lasting
   * `lifetime` (τ, s, at most FOAM_LIFETIME.longest), a boil or (by default)
   * a raft (the header); false, stamping nothing, off the patch.
   */
  addFoam({ x, z, radius, amount, lifetime = foamLifetime(radius), boil = false }) {
    const [tx, tz] = this.worldToTexel(x, z);
    if (!(tx >= 0 && tx <= this.size && tz >= 0 && tz <= this.size)) return false;
    this.foamSplats.push({ tx, tz, sigma: Math.max(radius / this.cell, 0.8), amount, lifetime: Math.min(lifetime, FOAM_LIFETIME.longest), boil });
    return true;
  }

  /**
   * A surface flow from (x, z): water welling up there and spreading, its
   * strength decaying as exp(−t/decay) from the next step on. Over its life it
   * sweeps the foam out of a disc of `radius` (m), area π·radius² in all,
   * carrying what was there outward into a ring (FOAM_FRAGMENT). It only
   * moves foam, so it neither wakes the solver nor counts as a stamp.
   */
  addFoamFlow({ x, z, radius, decay }) {
    if (!(radius > 0 && decay > 0)) return false;
    this.flows.push({ x, z, area: Math.PI * radius * radius, core: FOAM_FLOW.core * radius, decay, age: 0, step: 0 });
    return true;
  }

  /** The wind blows toward world XZ `direction` ([x, z] or a Vector2): the foam drifts that way at FOAM_DRIFT times the wind's strength. */
  setWind(direction) {
    const [x, z] = Array.isArray(direction) ? direction : [direction.x, direction.y];
    const length = Math.hypot(x, z) || 1;
    this.windDirection = [x / length, z / length];
    this.foamUniforms.uFoamVelocity.value.set(x / length, z / length).multiplyScalar(FOAM_DRIFT * this.windStrength);
  }

  /** The wind's strength against the Breeze's (WIND_STRENGTHS in src/ambientWaves.js): the foam's drift goes with it. */
  setWindStrength(strength) {
    this.windStrength = strength;
    this.foamUniforms.uFoamVelocity.value.set(this.windDirection[0], this.windDirection[1]).multiplyScalar(FOAM_DRIFT * strength);
  }

  /** Advance the surface by dt seconds and refresh the height and foam textures; nothing while asleep (the header). */
  step(dt) {
    if (this.splats.length > 0 || this.foamSplats.length > 0) {
      this.asleep = false;
      this.quietSeconds = 0;
    } else if (this.asleep) {
      return;
    } else {
      this.quietSeconds += dt;
    }
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();

    // 1. Spectral update with this frame's splats (chunked if there are many).
    const uniforms = this.updatePass.material.uniforms;
    uniforms.uState.value = this.stateA.texture;
    let remaining = this.splats;
    let first = true;
    do {
      const chunk = remaining.slice(0, MAX_SPLATS);
      remaining = remaining.slice(MAX_SPLATS);
      uniforms.uDt.value = first ? dt : 0;
      uniforms.uSplatCount.value = chunk.length;
      chunk.forEach((splat, i) => {
        uniforms.uSplats.value[i].set(splat.tx, splat.tz, splat.sigma, splat.rim);
        uniforms.uSplatAmps.value[i].set(splat.height, splat.velocity);
      });
      uniforms.uState.value = this.stateA.texture;
      this.updatePass.render(renderer, this.stateB);
      [this.stateA, this.stateB] = [this.stateB, this.stateA];
      first = false;
    } while (remaining.length > 0);
    this.splats = [];

    // 2. Inverse FFT: rows then columns. The final pass lands in the display texture.
    runInverseFft(renderer, this.fftPass, this.stateA, [this.fftA, this.fftB], this.heightTarget, this.size);

    // 3. Foam with this frame's stamps, chunked like the splats: the later
    // chunks advance no time (no decay, spreading, drift, flow or churn), so
    // they only stamp. The flows give this step's share of their area, the
    // strongest MAX_FLOWS of them (FOAM_FRAGMENT).
    const foam = this.foamPass.material.uniforms;
    const velocity = this.foamUniforms.uFoamVelocity.value;
    this.foamUniforms.uFoamDrift.value.addScaledVector(velocity, dt);
    for (const flow of this.flows) {
      const before = Math.exp(-flow.age / flow.decay);
      flow.age += dt;
      flow.step = flow.area * (before - Math.exp(-flow.age / flow.decay));
    }
    const flowing = this.flows.filter((flow) => flow.step > 0).sort((first, second) => second.step - first.step).slice(0, MAX_FLOWS);
    this.flows = this.flows.filter((flow) => flow.age < FOAM_FLOW.span * flow.decay);
    let remainingFoam = this.foamSplats;
    let firstFoam = true;
    do {
      const foamChunk = remainingFoam.slice(0, MAX_FOAM);
      remainingFoam = remainingFoam.slice(MAX_FOAM);
      foam.uFoam.value = this.foamA.texture;
      foam.uDt.value = firstFoam ? dt : 0;
      foam.uDrift.value.copy(velocity).multiplyScalar(firstFoam ? dt / this.cell : 0);
      foam.uFlowCount.value = firstFoam ? flowing.length : 0;
      flowing.forEach((flow, index) => {
        const [tx, tz] = this.worldToTexel(flow.x, flow.z);
        foam.uFlows.value[index].set(tx, tz, flow.step / (2 * Math.PI * this.cell * this.cell), (flow.core / this.cell) ** 2);
      });
      foam.uFoamCount.value = foamChunk.length;
      foamChunk.forEach((splat, index) => {
        foam.uFoamSplats.value[index].set(splat.tx, splat.tz, splat.sigma, splat.amount);
        foam.uFoamKinds.value[index].set(splat.lifetime, splat.boil ? 1 : 0);
      });
      this.foamPass.render(renderer, this.foamB);
      [this.foamA, this.foamB] = [this.foamB, this.foamA];
      firstFoam = false;
    } while (remainingFoam.length > 0);
    this.foamSplats = [];

    renderer.setRenderTarget(previousTarget);
  }

  get heightTexture() { return this.heightTarget.texture; }
  get foamTexture() { return this.foamA.texture; }
}
