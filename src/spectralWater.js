// Spectral height-field water.
//
// The surface is a square, periodic patch of N×N cells. Its state lives in
// Fourier space: for every wave vector k we keep the complex amplitude of the
// height and of its time derivative. Linear water waves obey
//     ω² = (g k + σ k³ / ρ) · tanh(k D)
// so each mode is advanced exactly by rotating (H, V) through ω·dt, which is
// stable for any time step and gives the correct dispersion: long ripples
// outrun short ones, as they do on a real pond. Damping is applied per mode.
//
// Disturbances enter as Gaussian "splats" (a height or vertical-velocity
// impulse at a point). A Gaussian has a closed-form spectrum, so splats are
// added in Fourier space without any forward transform. Each frame one
// inverse FFT (2·log2 N passes) brings height and velocity back to the grid
// as an RGBA16F texture: R = height (m), G = vertical velocity (m/s).
//
// A separate foam texture (R channel, 0..1) decays, diffuses, and is stamped
// by splashes and by fast surface motion.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { SPECTRAL_UPDATE_FRAGMENT, FFT_PASS_FRAGMENT, FOAM_FRAGMENT } from './shaders/spectral.js';

const MAX_SPLATS = 32;
const MAX_FOAM = 16;

/**
 * The inverse FFT on the GPU: 2·log2(size) passes of FFT_PASS_FRAGMENT, rows
 * then columns, ping-ponging between the two scratch targets; the last pass
 * writes `output`. With fromState the first pass reads `input` as a state
 * texture (H + iV from its four channels); otherwise as two complex pairs,
 * as the ambient waves (src/ambientWaves.js) write it.
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
    this.fftA = createFloatTarget(size, size);
    this.fftB = createFloatTarget(size, size);
    // Display texture: linear filtering, half float, repeat wrapping (the patch is periodic).
    this.heightTarget = createFloatTarget(size, size, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, wrap: THREE.RepeatWrapping });
    this.foamA = createFloatTarget(size, size, { type: THREE.HalfFloatType, filter: THREE.LinearFilter });
    this.foamB = createFloatTarget(size, size, { type: THREE.HalfFloatType, filter: THREE.LinearFilter });

    this.splats = [];
    this.foamSplats = [];
    this.timeScaleDamping = 1;

    const splatArray = [];
    const ampArray = [];
    for (let i = 0; i < MAX_SPLATS; i++) { splatArray.push(new THREE.Vector4()); ampArray.push(new THREE.Vector2()); }
    this.updatePass = new FullscreenPass(SPECTRAL_UPDATE_FRAGMENT, {
      uState: { value: null },
      uN: { value: size },
      uCell: { value: this.cell },
      uDepth: { value: depth },
      uDt: { value: 0 },
      uGamma0: { value: 0.3 },
      uNu: { value: 4e-5 },
      uKLow: { value: 2 * Math.PI / (domainSize / 2.5) },
      uGammaLow: { value: 1.5 },
      uSplatCount: { value: 0 },
      uSplats: { value: splatArray },
      uSplatAmps: { value: ampArray },
    });
    this.fftPass = new FullscreenPass(FFT_PASS_FRAGMENT, {
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
      uTau: { value: 2.2 },
      uFoamCount: { value: 0 },
      uFoamSplats: { value: foamArray },
    });
    this.clear();
  }

  clear() {
    const previous = this.renderer.getRenderTarget();
    for (const target of [this.stateA, this.stateB, this.fftA, this.fftB, this.heightTarget, this.foamA, this.foamB]) {
      this.renderer.setRenderTarget(target);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(previous);
  }

  /** World XZ to texel coordinates (texel 0 sits at domainMin). */
  worldToTexel(x, z) {
    return [(x - this.domainMin[0]) / this.cell, (z - this.domainMin[1]) / this.cell];
  }

  /** World XZ to texture uv for sampling the height and foam textures. */
  get uvOffset() { return 0.5 / this.size; }

  /**
   * Queue a Gaussian disturbance.
   * @param x,z world position (m)   @param radius Gaussian sigma (m)
   * @param height peak height impulse (m)   @param velocity peak vertical velocity impulse (m/s)
   */
  addSplat({ x, z, radius, height = 0, velocity = 0, rim = 1.7 }) {
    const [tx, tz] = this.worldToTexel(x, z);
    this.splats.push({ tx, tz, sigma: Math.max(radius / this.cell, 0.6), height, velocity, rim });
  }

  addFoam({ x, z, radius, amount }) {
    const [tx, tz] = this.worldToTexel(x, z);
    this.foamSplats.push({ tx, tz, sigma: Math.max(radius / this.cell, 0.8), amount });
  }

  /** Advance the surface by dt seconds and refresh the height and foam textures. */
  step(dt) {
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

    // 3. Foam.
    const foam = this.foamPass.material.uniforms;
    foam.uFoam.value = this.foamA.texture;
    foam.uDt.value = dt;
    const foamChunk = this.foamSplats.slice(0, MAX_FOAM);
    foam.uFoamCount.value = foamChunk.length;
    foamChunk.forEach((splat, i) => foam.uFoamSplats.value[i].set(splat.tx, splat.tz, splat.sigma, splat.amount));
    this.foamSplats = this.foamSplats.slice(MAX_FOAM);
    this.foamPass.render(renderer, this.foamB);
    [this.foamA, this.foamB] = [this.foamB, this.foamA];

    renderer.setRenderTarget(previousTarget);
  }

  get heightTexture() { return this.heightTarget.texture; }
  get foamTexture() { return this.foamA.texture; }
}
