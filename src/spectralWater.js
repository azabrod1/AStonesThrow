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
// 2.4 m so the patch never sloshes. A real pond damps its ripples through
// the surface film and viscosity, which fade towards nothing for long waves,
// so γ0 applies in full only to ripples shorter than 30 cm (k_d) and falls in
// proportion to k for longer ones: the ring of a big stone, half a metre
// long, carries across the pond, while a small stone's rings (10 to 30 cm)
// fade as they always did.
//
// Disturbances enter as Gaussian "splats" (a height or vertical-velocity
// impulse at a point). A Gaussian has a closed-form spectrum, so splats are
// added in Fourier space without any forward transform. Each frame one
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
// A separate foam map (FOAM_FRAGMENT): R the amount of foam, 0 to 1, G the
// lifetime τ of the foam there. It diffuses (FOAM_DIFFUSIVITY, the same
// spread in metres on every grid), is stamped by splashes and by fast surface
// motion, and decays as exp(−t/τ). Each stamp brings its own τ, growing with
// its radius (foamLifetime): a big stone's raft is thicker and lasts longer.
// The water shader turns the amount into a bubble pattern (FOAM_PATTERN in
// src/shaders/scene.js), solid above about 0.6 and gone below about 0.01, so
// a raft thins from its weak edge inward and a stamp of 0.65 is gone after
// about 4·τ. The map is RG16F.
//
// Grid size (resize): the quality presets (src/main.js) change N. A mode of
// the state is N² times the field's Fourier series coefficient at its wave
// vector, which is the same on any grid (a splat's is 2πr²/D² times its
// shape, r its radius and D the patch in metres), so a resize carries the
// waves over: every mode both grids hold is copied, times (N_new/N_old)²
// (RESAMPLE_FRAGMENT; the smaller grid's Nyquist row and column are
// dropped, as their real field is not a free pair), the foam map is
// resampled by its amount-weighted bilinear mean (FOAM_RESAMPLE_FRAGMENT),
// and anything still queued is applied first. The targets keep their texture
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
// damping above and the foam's longest lifetime: see SLEEP_SECONDS.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { SPECTRAL_UPDATE_FRAGMENT, SOLVER_FFT_PASS_FRAGMENT, FOAM_FRAGMENT } from './shaders/spectral.js';

const MAX_SPLATS = 32;
const MAX_FOAM = 16;
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
// may sleep (simulated seconds). The slowest part is the waves: the pond
// damps long waves least (DAMPING), so what is left of a splash after a few
// seconds is its longest waves, metres long, decaying with time constants of
// 10 to 25 s. Evolving every splat of the largest splash (a 16 cm stone
// thrown hard: about 1080 splats over 1.04 s) with the solver's own lattice,
// injection, dispersion and damping (on the CPU, 512 grid), the field's
// largest slope is 1.1e-3 at 30 s after its last splat, 4.7e-4 at 45 s,
// 1.3e-4 at 60 s and 4.4e-5 at 75 s, its height 0.31, 0.18, 0.06 and
// 0.015 mm, and the floor's caustics change by 0.17, 0.06, 0.015 and 0.005%.
// A slope of 1e-4 turns a reflection by 2e-4 rad, under a third of a pixel
// at the phone's framing (1400 px per radian): at 75 s the field shows
// nowhere, with room for a second stone as big (a 4 cm stone's field is
// gone by 20 s). The foam is gone sooner: the
// map decays at least as fast as exp(−t/6 s) (FOAM_LIFETIME.longest) and the
// pattern draws nothing under FOAM_PRESENT ≈ 0.0022 (src/shaders/scene.js),
// so even a full raft (1) is gone 6·ln(1/0.0022) = 37 s after its last
// stamp. Hence 75 s.
export const SLEEP_SECONDS = 75;
const FOAM_DIFFUSIVITY = 5e-5;   // m²/s: a raft's edge spreads by about 3 cm in 10 s
const FOAM_LIFETIME = { base: 1.5, perMetre: 15, longest: 6 };   // τ = base + perMetre·radius, at most longest (s)
const CHURN_LIFETIME = 2.0;       // τ of the foam fast surface motion churns up (s)

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

// The foam map on a grid of another size: bilinear in the amount and in the
// amount times the lifetime, so the lifetime stays the amount-weighted mean
// FOAM_FRAGMENT keeps (a halving averages each 2×2 block).
const FOAM_RESAMPLE_FRAGMENT = /* glsl */`
uniform sampler2D uFoam;    // the map on the old grid
uniform float uFromSize;
uniform float uToSize;
vec2 carried(ivec2 texel) {
  vec2 foam = texelFetch(uFoam, clamp(texel, ivec2(0), ivec2(int(uFromSize) - 1)), 0).rg;
  return vec2(foam.r, foam.r * foam.g);
}
void main() {
  vec2 position = gl_FragCoord.xy * (uFromSize / uToSize) - 0.5;
  ivec2 corner = ivec2(floor(position));
  vec2 weight = position - floor(position);
  vec2 sum = mix(mix(carried(corner), carried(corner + ivec2(1, 0)), weight.x), mix(carried(corner + ivec2(0, 1)), carried(corner + ivec2(1, 1)), weight.x), weight.y);
  gl_FragColor = vec4(sum.x, sum.x > 1e-6 ? sum.y / sum.x : 0.0, 0.0, 1.0);
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
    this.foamA = createFloatTarget(size, size, { format: THREE.RGFormat, type: THREE.HalfFloatType, filter: THREE.LinearFilter });
    this.foamB = createFloatTarget(size, size, { format: THREE.RGFormat, type: THREE.HalfFloatType, filter: THREE.LinearFilter });
    // The sizes every material sampling the water needs, as shared objects (the header: resize).
    this.gridUniforms = { uN: { value: size }, uCell: { value: this.cell }, uTexelOffset: { value: 0.5 / size } };

    this.splats = [];
    this.foamSplats = [];
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
    const foamArray = [];
    for (let i = 0; i < MAX_FOAM; i++) foamArray.push(new THREE.Vector4());
    this.foamPass = new FullscreenPass(FOAM_FRAGMENT, {
      uFoam: { value: null },
      uHeight: { value: this.heightTarget.texture },
      uN: { value: size },
      uDt: { value: 0 },
      uDiffusionRate: { value: 4 * FOAM_DIFFUSIVITY / (this.cell * this.cell) },
      uChurnLifetime: { value: CHURN_LIFETIME },
      uFoamCount: { value: 0 },
      uFoamSplats: { value: foamArray },
      uFoamLifetimes: { value: new Array(MAX_FOAM).fill(FOAM_LIFETIME.base) },
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

  /** Stamp foam: a Gaussian of `radius` (m) and peak `amount`, lasting `lifetime` (τ, s); false, stamping nothing, off the patch. */
  addFoam({ x, z, radius, amount, lifetime = foamLifetime(radius) }) {
    const [tx, tz] = this.worldToTexel(x, z);
    if (!(tx >= 0 && tx <= this.size && tz >= 0 && tz <= this.size)) return false;
    this.foamSplats.push({ tx, tz, sigma: Math.max(radius / this.cell, 0.8), amount, lifetime });
    return true;
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
    // chunks advance no time (no decay, spreading or churn), so they only stamp.
    const foam = this.foamPass.material.uniforms;
    let remainingFoam = this.foamSplats;
    let firstFoam = true;
    do {
      const foamChunk = remainingFoam.slice(0, MAX_FOAM);
      remainingFoam = remainingFoam.slice(MAX_FOAM);
      foam.uFoam.value = this.foamA.texture;
      foam.uDt.value = firstFoam ? dt : 0;
      foam.uFoamCount.value = foamChunk.length;
      foamChunk.forEach((splat, index) => {
        foam.uFoamSplats.value[index].set(splat.tx, splat.tz, splat.sigma, splat.amount);
        foam.uFoamLifetimes.value[index] = splat.lifetime;
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
