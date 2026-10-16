// CPU checks of the splash solver's spectral formulation, done the way the GPU
// does it: src/spectralWater.js with SPECTRAL_UPDATE_FRAGMENT and the solver's
// inverse FFT (SOLVER_FFT_PASS_FRAGMENT) in src/shaders/spectral.js, whose
// arithmetic this file reproduces on arrays. npm test runs it. It checks that
//   1. the Stockham passes (tools/stockham.mjs, the shader's arithmetic) match
//      a naive DFT, both signs; the solver's passes reproduced here match
//      tools/stockham.mjs; and their scaling divides out exactly, so on the
//      float32 path it changes nothing;
//   2. a Gaussian splat injected as the update pass does it comes back through
//      the solver's passes as the Gaussian (less its mean: the update pass keeps
//      the k = 0 bin at zero);
//   3. at the Nyquist index (texel N/2 on either axis) the update pass gives the
//      real coefficient a real field needs, so splats at fractional centres on
//      256² and 512² make real fields: with σ = 0.6 texels (the floor) a
//      height-only splat leaves the velocity at zero and a velocity-only one the
//      height (the solver transforms H + iV in one go, so an imaginary part of
//      one lands in the other), while its own field is what it was; the
//      smallest stone's cavity splat puts none of its velocity into the height;
//      and the fields stay real as they evolve. The old complex coefficient's
//      cross-talk is printed for comparison;
//   4. on the half-float path (devices without EXT_color_buffer_float), where
//      the state and the FFT targets store binary16, the cavity splat the
//      smallest stone once gave the solver (R = 7.5 mm, σ = 1.1·R, a depression
//      of 0.1·R, −0.045 · 6.3 m/s: a small, sharp splat of both kinds; the
//      ring is src/rings.js's now) on 512², advanced for six frames of 1/60 s,
//      keeps its ring: with the state rounded to binary16 after every step, and
//      then with every FFT pass's output rounded too, its peak height stays within
//      10% of the float32 path's, with subnormals kept and with them flushed to
//      zero (GPUs may do either). With the old scaling (1/N² in the state) the
//      ring is lost: that is shown, and checked, so the emulation can see it;
//   5. the half-float transform has room for the largest fields: splats of
//      4 m/s (a 16 cm stone's field reaches about 1.4 m/s), narrow and wide,
//      come back finite and accurate, where one 1/N² in the last pass would
//      overflow binary16;
//   6. the pool's walls (setPool): a splat injected with its mirror images
//      comes back as the four Gaussians, mirrored across the walls (less
//      their mean); as it evolves, the field stays even about every wall, so
//      no wave slopes across one, and a wave that reaches a wall comes back
//      off it; and at fractional centres on 256² and 512² its height and
//      velocity stay real, as in 3.
// Exits with status 1 if a check fails.
//
//   node tools/fft-test.mjs
import { performance } from 'node:perf_hooks';
import { fft1d, inverse2d } from './stockham.mjs';
import { DAMPING } from '../src/spectralWater.js';

const started = performance.now();
let failures = 0;
function check(passed, message) {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${message}`);
  if (!passed) failures++;
}

const DOMAIN_SIZE = 6;     // metres per side of the solver's patch
const POND_DEPTH = 0.8;
const HALF_MAX = 65504;    // binary16's largest finite value
const signedIndex = (texel, size) => (texel < size / 2 ? texel : texel - size);

/**
 * The binary16 value a half-float target stores for a float32 result: round to
 * nearest, ties to even; from 65520 up infinite. With flushSubnormals,
 * magnitudes under 2^−14 (the smallest normal) are stored as zero.
 */
const singleValue = new Float32Array(1);
const singleBits = new Uint32Array(singleValue.buffer);
const POWERS_OF_TWO = new Float64Array(64).map((unused, index) => 2 ** (index - 32));
function toBinary16(value, flushSubnormals = false) {
  singleValue[0] = value;
  const single = singleValue[0];
  const exponent = ((singleBits[0] >>> 23) & 0xff) - 127;
  if (exponent === 128) return single;                      // infinite or NaN already
  if (exponent < -25) return 0 * single;                    // under half the smallest subnormal
  if (exponent >= 16) return Math.sign(single) * Infinity;
  if (flushSubnormals && exponent < -14) return 0 * single;
  const spacing = POWERS_OF_TWO[Math.max(exponent, -14) - 10 + 32];
  const units = Math.abs(single) / spacing;                 // exact: spacing is a power of two
  let whole = Math.floor(units);
  const remainder = units - whole;
  if (remainder > 0.5 || (remainder === 0.5 && (whole & 1) === 1)) whole++;
  const stored = whole * spacing;
  return stored > HALF_MAX ? Math.sign(single) * Infinity : Math.sign(single) * stored;
}
const STORAGE = {
  exact: (value) => value,
  float32: (value) => Math.fround(value),
  half: (value) => toBinary16(value),
  halfFlushed: (value) => toBinary16(value, true),
};

/**
 * The scaling of the solver's inverse passes (SOLVER_FFT_PASS_FRAGMENT): the
 * passes along x (axis 0) halve their output, the passes along y leave it and
 * the last one divides by N; 1/N² in all, as the state holds N² times the
 * inverse transform's coefficients. Plain FFT_PASS_FRAGMENT scales nothing.
 */
const SOLVER_SCALING = (axis, subSize, size) => (axis === 0 ? 0.5 : subSize === size ? 1 / size : 1);
const NO_SCALING = () => 1;

/**
 * runInverseFft on arrays: log2 N passes along x (within each row), then along
 * y, exactly the arithmetic of tools/stockham.mjs; each pass's output is
 * multiplied by scaling(axis, subSize, size) and stored through `store`, the
 * last pass's through storeOutput. Also returns the largest magnitude a scratch
 * target held and whether any stored value was not finite.
 */
function inverseTransform({ re, im }, size, { scaling = NO_SCALING, store = STORAGE.exact, storeOutput = STORAGE.exact } = {}) {
  let sourceRe = Float64Array.from(re), sourceIm = Float64Array.from(im);
  let targetRe = new Float64Array(size * size), targetIm = new Float64Array(size * size);
  const cosines = new Float64Array(size), sines = new Float64Array(size), evens = new Int32Array(size);
  const passes = 2 * Math.log2(size);
  let passIndex = 0, largestStored = 0, finite = true;
  for (let axis = 0; axis < 2; axis++) {
    const along = axis === 0 ? 1 : size;     // step between neighbours along the transformed axis
    const across = axis === 0 ? size : 1;    // step between lines
    for (let subSize = 2; subSize <= size; subSize *= 2) {
      passIndex++;
      const half = subSize / 2;
      for (let index = 0; index < size; index++) {
        const angle = 2 * Math.PI * (index / subSize);
        cosines[index] = Math.cos(angle);
        sines[index] = Math.sin(angle);
        evens[index] = Math.floor(index / subSize) * half + (index % half);
      }
      const scale = scaling(axis, subSize, size);
      // Output index along the axis outside, the lines inside (so the memory runs along rows either way).
      for (let index = 0; index < size; index++) {
        const twiddleRe = cosines[index], twiddleIm = sines[index];
        const evenStart = evens[index] * along, oddStart = evenStart + (size / 2) * along, outStart = index * along;
        for (let line = 0; line < size; line++) {
          const offset = line * across;
          const even = evenStart + offset, odd = oddStart + offset, out = outStart + offset;
          const oddRe = sourceRe[odd], oddIm = sourceIm[odd];
          targetRe[out] = (sourceRe[even] + (twiddleRe * oddRe - twiddleIm * oddIm)) * scale;
          targetIm[out] = (sourceIm[even] + (twiddleRe * oddIm + twiddleIm * oddRe)) * scale;
        }
      }
      // What the pass's target stores.
      const last = passIndex === passes;
      const write = last ? storeOutput : store;
      if (write !== STORAGE.exact) {
        for (let index = 0; index < size * size; index++) {
          targetRe[index] = write(targetRe[index]);
          targetIm[index] = write(targetIm[index]);
        }
      }
      for (let index = 0; index < size * size; index++) {
        const largest = Math.max(Math.abs(targetRe[index]), Math.abs(targetIm[index]));
        if (largest === Infinity || Number.isNaN(largest)) finite = false;
        else if (!last && largest > largestStored) largestStored = largest;
      }
      [sourceRe, targetRe] = [targetRe, sourceRe];
      [sourceIm, targetIm] = [targetIm, sourceIm];
    }
  }
  return { re: sourceRe, im: sourceIm, largestStored, finite };
}

/** FFT_PASS_FRAGMENT's first read of the state (uFromState): H + iV as one complex field. */
function packState(state, size) {
  const re = new Float64Array(size * size), im = new Float64Array(size * size);
  for (let index = 0; index < size * size; index++) {
    re[index] = state[4 * index] - state[4 * index + 3];
    im[index] = state[4 * index + 1] + state[4 * index + 2];
  }
  return { re, im };
}
/** One of the state's two complex spectra (0: H, 1: V) on its own. */
function spectrumOf(state, size, which) {
  const re = new Float64Array(size * size), im = new Float64Array(size * size);
  for (let index = 0; index < size * size; index++) {
    re[index] = state[4 * index + 2 * which];
    im[index] = state[4 * index + 2 * which + 1];
  }
  return { re, im };
}

/**
 * SPECTRAL_UPDATE_FRAGMENT on arrays: the state is (H re, H im, V re, V im) per
 * texel, row-major with the row along the texture's y. Rotates every mode
 * through ω·dt, damps it, adds the splats (centre and σ in texels, as addSplat
 * queues them) and keeps k = 0 at zero; every stored value goes through
 * `store`. stateScale is N² as the solver now injects, 1 for the old 1/N²
 * injection; nyquist 'real' is the update pass's treatment of texel N/2,
 * 'complex' the old one. walls ({ x, y }, texels: uWalls) gives each splat
 * its mirror images across them, as in a pool.
 */
function updateState(state, size, { dt, splats = [], stateScale, nyquist = 'real', store = STORAGE.exact, walls = null }) {
  const { qx, qy, qMagnitude } = gridOf(size);
  const { cosine, sineOverOmega, omegaSine, decay } = rotationOf(size, dt);
  const next = new Float64Array(state.length);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const texel = row * size + column, here = 4 * texel;
      const heightRe = state[here], heightIm = state[here + 1], velocityRe = state[here + 2], velocityIm = state[here + 3];
      let nextHeightRe = (heightRe * cosine[texel] + velocityRe * sineOverOmega[texel]) * decay[texel];
      let nextHeightIm = (heightIm * cosine[texel] + velocityIm * sineOverOmega[texel]) * decay[texel];
      let nextVelocityRe = (-heightRe * omegaSine[texel] + velocityRe * cosine[texel]) * decay[texel];
      let nextVelocityIm = (-heightIm * omegaSine[texel] + velocityIm * cosine[texel]) * decay[texel];
      for (const splat of splats) {
        const rimSigma = splat.sigma * Math.max(splat.rim, 1);
        let shape = Math.exp(-0.5 * splat.sigma ** 2 * qMagnitude[texel] ** 2);
        if (splat.rim > 1) shape -= Math.exp(-0.5 * rimSigma ** 2 * qMagnitude[texel] ** 2);
        const magnitude = 2 * Math.PI * splat.sigma ** 2 / (size * size) * stateScale * shape;
        const phaseX = -qx[column] * splat.tx, phaseY = -qy[row] * splat.tz;
        let shiftRe, shiftIm;
        if (walls) {
          // Each axis's shift for the splat and its image across the wall, real along a Nyquist axis; their product.
          const imageX = -qx[column] * (2 * walls.x - splat.tx), imageY = -qy[row] * (2 * walls.y - splat.tz);
          const alongXRe = Math.cos(phaseX) + Math.cos(imageX), alongXIm = column === size / 2 ? 0 : Math.sin(phaseX) + Math.sin(imageX);
          const alongYRe = Math.cos(phaseY) + Math.cos(imageY), alongYIm = row === size / 2 ? 0 : Math.sin(phaseY) + Math.sin(imageY);
          shiftRe = alongXRe * alongYRe - alongXIm * alongYIm;
          shiftIm = alongXRe * alongYIm + alongXIm * alongYRe;
        } else if (nyquist === 'real' && (column === size / 2 || row === size / 2)) {
          // Along a Nyquist axis the shift is real: cos of that axis's phase.
          const alongXRe = Math.cos(phaseX), alongXIm = column === size / 2 ? 0 : Math.sin(phaseX);
          const alongYRe = Math.cos(phaseY), alongYIm = row === size / 2 ? 0 : Math.sin(phaseY);
          shiftRe = alongXRe * alongYRe - alongXIm * alongYIm;
          shiftIm = alongXRe * alongYIm + alongXIm * alongYRe;
        } else {
          shiftRe = Math.cos(phaseX + phaseY);
          shiftIm = Math.sin(phaseX + phaseY);
        }
        nextHeightRe += splat.height * shiftRe * magnitude;
        nextHeightIm += splat.height * shiftIm * magnitude;
        nextVelocityRe += splat.velocity * shiftRe * magnitude;
        nextVelocityIm += splat.velocity * shiftIm * magnitude;
      }
      if (texel === 0) nextHeightRe = nextHeightIm = nextVelocityRe = nextVelocityIm = 0;
      next[here] = store(nextHeightRe);
      next[here + 1] = store(nextHeightIm);
      next[here + 2] = store(nextVelocityRe);
      next[here + 3] = store(nextVelocityIm);
    }
  }
  return next;
}

/** Per grid size: the wave vector of every texel (radians per texel) as the update pass computes it, and ω and γ. */
const grids = new Map();
function gridOf(size) {
  if (grids.has(size)) return grids.get(size);
  const cell = DOMAIN_SIZE / size;
  const dampingWavenumber = 2 * Math.PI / DAMPING.baseWavelength;
  const lowWavenumber = 2 * Math.PI / (DOMAIN_SIZE * DAMPING.lowShare);
  const qx = new Float64Array(size).map((unused, column) => 2 * Math.PI * signedIndex(column, size) / size);
  const qy = qx;   // the same lattice along y
  const qMagnitude = new Float64Array(size * size), omega = new Float64Array(size * size), gamma = new Float64Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const texel = row * size + column;
      qMagnitude[texel] = Math.hypot(qx[column], qy[row]);
      const wavenumber = qMagnitude[texel] / cell;
      omega[texel] = Math.sqrt((9.81 * wavenumber + 7.2e-5 * wavenumber ** 3) * Math.tanh(Math.min(wavenumber * POND_DEPTH, 20)));
      gamma[texel] = DAMPING.base * Math.min(wavenumber / dampingWavenumber, 1) + DAMPING.viscosity * wavenumber ** 2 + (wavenumber < lowWavenumber ? DAMPING.low : 0);
    }
  }
  const grid = { qx, qy, qMagnitude, omega, gamma, rotations: new Map() };
  grids.set(size, grid);
  return grid;
}
/** The update pass's rotation and decay of every mode over dt. */
function rotationOf(size, dt) {
  const grid = gridOf(size);
  if (grid.rotations.has(dt)) return grid.rotations.get(dt);
  const count = size * size;
  const rotation = { cosine: new Float64Array(count), sineOverOmega: new Float64Array(count), omegaSine: new Float64Array(count), decay: new Float64Array(count) };
  for (let texel = 0; texel < count; texel++) {
    const omega = grid.omega[texel], sine = Math.sin(omega * dt);
    rotation.cosine[texel] = Math.cos(omega * dt);
    rotation.sineOverOmega[texel] = omega > 1e-6 ? sine / omega : dt;
    rotation.omegaSine[texel] = omega * sine;
    rotation.decay[texel] = Math.exp(-grid.gamma[texel] * dt);
  }
  grid.rotations.set(dt, rotation);
  return rotation;
}

const largestOf = (values) => values.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);

// 1. The passes.
console.log('1. The Stockham passes');
{
  const size = 32;
  const input = new Float64Array(2 * size);
  for (let index = 0; index < size; index++) {
    input[2 * index] = Math.sin(index * 0.7) + Math.cos(index * index * 0.1);
    input[2 * index + 1] = Math.cos(index * 1.3) * 0.5;
  }
  for (const sign of [-1, 1]) {
    const fast = fft1d(input, size, sign);
    let worst = 0;
    for (let frequency = 0; frequency < size; frequency++) {
      let re = 0, im = 0;
      for (let index = 0; index < size; index++) {
        const angle = sign * 2 * Math.PI * frequency * index / size;
        re += input[2 * index] * Math.cos(angle) - input[2 * index + 1] * Math.sin(angle);
        im += input[2 * index] * Math.sin(angle) + input[2 * index + 1] * Math.cos(angle);
      }
      worst = Math.max(worst, Math.abs(fast[2 * frequency] - re), Math.abs(fast[2 * frequency + 1] - im));
    }
    check(worst < 1e-12, `1D transform, sign ${sign > 0 ? '+1' : '−1'}, ${size} points: largest difference from a naive DFT ${worst.toExponential(2)}`);
  }
  const size2d = 64;
  const re = new Float64Array(size2d * size2d).map((unused, index) => Math.sin(index * 0.37) + Math.cos(index * index * 0.01));
  const im = new Float64Array(size2d * size2d).map((unused, index) => Math.cos(index * 1.3) * 0.5);
  const interleaved = new Float64Array(2 * size2d * size2d);
  re.forEach((value, index) => { interleaved[2 * index] = value; interleaved[2 * index + 1] = im[index]; });
  const reference = inverse2d(interleaved, size2d);
  const plain = inverseTransform({ re, im }, size2d);
  let identical = true;
  for (let index = 0; index < size2d * size2d; index++) identical &&= plain.re[index] === reference[2 * index] && plain.im[index] === reference[2 * index + 1];
  check(identical, `this file's ${size2d}² inverse passes reproduce tools/stockham.mjs bit for bit`);
  const scaled = inverseTransform({ re: re.map((value) => value * size2d * size2d), im: im.map((value) => value * size2d * size2d) }, size2d, { scaling: SOLVER_SCALING });
  identical = true;
  for (let index = 0; index < size2d * size2d; index++) identical &&= scaled.re[index] === plain.re[index] && scaled.im[index] === plain.im[index];
  check(identical, `the solver's scaled passes give N² times a spectrum the plain passes give it, bit for bit (powers of two): on the float32 path the scaling changes nothing`);
}

// 2. A Gaussian splat comes back as the Gaussian.
console.log('\n2. The splat spectrum');
{
  const size = 64, amplitude = 0.37, sigma = 2.5, centreX = 40.3, centreY = 17.8;
  const state = updateState(new Float64Array(4 * size * size), size, { dt: 0, splats: [{ tx: centreX, tz: centreY, sigma, rim: 1, height: amplitude, velocity: 0 }], stateScale: size * size });
  const field = inverseTransform(packState(state, size), size, { scaling: SOLVER_SCALING });
  const mean = amplitude * 2 * Math.PI * sigma * sigma / (size * size);
  const wrapped = (offset) => offset - size * Math.round(offset / size);
  let worst = 0, worstImaginary = 0;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const expected = amplitude * Math.exp(-(wrapped(column - centreX) ** 2 + wrapped(row - centreY) ** 2) / (2 * sigma * sigma)) - mean;
      worst = Math.max(worst, Math.abs(field.re[row * size + column] - expected));
      worstImaginary = Math.max(worstImaginary, Math.abs(field.im[row * size + column]));
    }
  }
  check(worst < 1e-9 * amplitude && worstImaginary < 1e-9 * amplitude,
    `σ = ${sigma} texels at (${centreX}, ${centreY}) on ${size}²: largest difference from the Gaussian less its mean ${worst.toExponential(2)} (amplitude ${amplitude}), velocity ${worstImaginary.toExponential(2)}`);
}

// 3. Nyquist bins.
console.log('\n3. Nyquist bins: splats at fractional centres');
for (const size of [256, 512]) {
  const cell = DOMAIN_SIZE / size;
  const centre = { tx: 100.37 * size / 256, tz: 61.71 * size / 256 };
  const transformed = (splat, nyquist) => {
    const state = updateState(new Float64Array(4 * size * size), size, { dt: 0, splats: [splat], stateScale: size * size, nyquist });
    return {
      packed: inverseTransform(packState(state, size), size, { scaling: SOLVER_SCALING }),
      height: inverseTransform(spectrumOf(state, size, 0), size, { scaling: SOLVER_SCALING }),
    };
  };
  // σ = 0.6 texels (the floor), the default rim, one field at a time: the solver's height is
  // the packed transform's real part and its velocity the imaginary part.
  const heightOnly = { ...centre, sigma: 0.6, rim: 1.7, height: 0.37, velocity: 0 };
  const velocityOnly = { ...heightOnly, height: 0, velocity: 0.37 };
  const crossTalk = (field, name) => {
    const own = name === 'height' ? field.packed.re : field.packed.im, other = name === 'height' ? field.packed.im : field.packed.re;
    return { peak: largestOf(own), ratio: largestOf(other) / largestOf(own), own };
  };
  for (const [name, splat] of [['height', heightOnly], ['velocity', velocityOnly]]) {
    const before = crossTalk(transformed(splat, 'complex'), name), after = crossTalk(transformed(splat, 'real'), name);
    let change = 0;
    for (let index = 0; index < size * size; index++) change = Math.max(change, Math.abs(after.own[index] - before.own[index]));
    check(after.ratio < 1e-6 && change < 1e-5 * after.peak,
      `${size}², σ 0.6 texels, ${name} only: the ${name === 'height' ? 'velocity' : 'height'} is ${after.ratio.toExponential(2)} of the ${name} peak ${after.peak.toFixed(4)} (old complex Nyquist coefficient: ${before.ratio.toExponential(2)}); ` +
      `the ${name} itself moved by ${(change / after.peak).toExponential(2)} of its peak (the corner bin, N/2 on both axes, is cos φx·cos φy where it was cos(φx + φy))`);
  }
  // The smallest stone's cavity splat at the fractional aim (0.123, −1.437): its velocity, numerically
  // a hundred times its height, leaked into the height through a complex Nyquist coefficient.
  const radius = 0.0075;
  const cavity = { tx: (0.123 + 3) / cell, tz: (-1.437 + 4) / cell, sigma: Math.max(1.1 * radius / cell, 0.6), rim: 1.7, height: -0.1 * radius, velocity: -0.045 * 6.3 };
  const leak = (field) => {
    let leakage = 0;
    for (let index = 0; index < size * size; index++) leakage = Math.max(leakage, Math.abs(field.packed.re[index] - field.height.re[index]));
    return leakage / largestOf(field.height.re);
  };
  const cavityBefore = leak(transformed(cavity, 'complex')), cavityAfter = leak(transformed(cavity, 'real'));
  check(cavityAfter < 1e-6,
    `${size}², the smallest stone's cavity splat at (0.123, −1.437): the velocity's leak into the height is ${cavityAfter.toExponential(2)} of the height's peak (old: ${cavityBefore.toFixed(3)})`);
  // The fields stay real as they evolve: H and V transformed on their own after four frames.
  let state = updateState(new Float64Array(4 * size * size), size, { dt: 1 / 60, splats: [{ ...centre, sigma: 0.6, rim: 1, height: 0.2, velocity: -0.3 }], stateScale: size * size });
  for (let step = 0; step < 3; step++) state = updateState(state, size, { dt: 1 / 60, stateScale: size * size });
  const height = inverseTransform(spectrumOf(state, size, 0), size, { scaling: SOLVER_SCALING });
  const velocity = inverseTransform(spectrumOf(state, size, 1), size, { scaling: SOLVER_SCALING });
  const heightImaginary = largestOf(height.im) / largestOf(height.re), velocityImaginary = largestOf(velocity.im) / largestOf(velocity.re);
  check(heightImaginary < 1e-6 && velocityImaginary < 1e-6,
    `${size}², a plain σ 0.6 splat with both, after four frames: h and v are real (largest imaginary part ${heightImaginary.toExponential(2)} and ${velocityImaginary.toExponential(2)} of their peaks)`);
}

// 4. Half floats: the smallest stone's ring.
console.log('\n4. Half floats: the smallest stone\'s cavity splat on 512², six frames of 1/60 s');
{
  const size = 512, cell = DOMAIN_SIZE / size, radius = 0.0075;
  // The splat src/splash.js's stampCavity once gave the solver, at strength 1, at the reference aim (0, −1.4): a fractional texel row.
  const splat = { tx: 3 / cell, tz: 2.6 / cell, sigma: Math.max(1.1 * radius / cell, 0.6), rim: 1.7, height: -0.1 * radius, velocity: -0.045 * 6.3 };
  const run = (stateScale, store) => {
    let state = new Float64Array(4 * size * size);
    for (let frame = 0; frame < 6; frame++) state = updateState(state, size, { dt: 1 / 60, splats: frame === 0 ? [splat] : [], stateScale, store });
    return state;
  };
  const describe = (state) => {
    let largest = 0, nonzero = 0, subnormal = 0;
    for (const value of state) {
      const magnitude = Math.abs(value);
      if (magnitude > 0) { nonzero++; if (magnitude < 2 ** -14) subnormal++; }
      largest = Math.max(largest, magnitude);
    }
    return `coefficients up to ${largest.toExponential(2)}, ${(100 * subnormal / Math.max(nonzero, 1)).toFixed(0)}% of the nonzero ones subnormal`;
  };
  const heights = (state, options) => inverseTransform(packState(state, size), size, options).re;
  const reference = heights(run(size * size, STORAGE.float32), { scaling: SOLVER_SCALING, store: STORAGE.float32 });
  const referencePeak = largestOf(reference);
  console.log(`  float32 path: peak |h| ${(referencePeak * 1000).toFixed(4)} mm (σ ${splat.sigma.toFixed(3)} texels, ${splat.height * 1000} mm, ${splat.velocity} m/s)`);
  const millimetres = (metres) => `${(metres * 1000).toFixed(4)} mm`;
  for (const [mode, label] of [['half', 'subnormals kept'], ['halfFlushed', 'subnormals flushed']]) {
    const store = STORAGE[mode];
    const oldState = run(1, store);
    const oldPeak = largestOf(heights(oldState, { scaling: NO_SCALING }));
    const newState = run(size * size, store);
    const statePeak = largestOf(heights(newState, { scaling: SOLVER_SCALING }));
    check(Math.abs(statePeak / referencePeak - 1) < 0.1 && oldPeak < 0.01 * referencePeak,
      `binary16 state, ${label}: peak |h| ${millimetres(statePeak)} (${(100 * (statePeak / referencePeak - 1)).toFixed(2)}%; ${describe(newState)}); with the old scaling ${millimetres(oldPeak)} (${describe(oldState)})`);
    // The whole half-float path: the state and every pass's output stored as binary16, the output (always binary16) too.
    const path = inverseTransform(packState(newState, size), size, { scaling: SOLVER_SCALING, store, storeOutput: store });
    const referenceOutput = reference.map(store);
    let squared = 0;
    for (let index = 0; index < size * size; index++) squared += (path.re[index] - referenceOutput[index]) ** 2;
    const rmsError = Math.sqrt(squared / (size * size)) / largestOf(referenceOutput);
    const pathPeak = largestOf(path.re);
    check(path.finite && Math.abs(pathPeak / largestOf(referenceOutput) - 1) < 0.1 && rmsError < 0.01,
      `whole half-float path, ${label}: peak |h| ${millimetres(pathPeak)} (${(100 * (pathPeak / largestOf(referenceOutput) - 1)).toFixed(2)}%), rms difference from the float32 path ${rmsError.toExponential(2)} of the peak; scratch values up to ${path.largestStored.toFixed(3)}`);
  }
}

// 5. Range: room for the largest fields.
console.log('\n5. Range of the half-float transform');
{
  const size = 512;
  for (const [name, sigma, rim] of [['narrow', 0.6, 1], ['wide', 7.5, 1]]) {
    const splat = { tx: 200.3, tz: 300.6, sigma, rim, height: 0.1, velocity: 4 };
    const state = updateState(new Float64Array(4 * size * size), size, { dt: 0, splats: [splat], stateScale: size * size, store: STORAGE.half });
    const exact = inverseTransform(packState(state, size), size, { scaling: SOLVER_SCALING });
    const stored = inverseTransform(packState(state, size), size, { scaling: SOLVER_SCALING, store: STORAGE.half });
    const once = inverseTransform(packState(state, size), size, { scaling: (axis, subSize) => (axis === 1 && subSize === size ? 1 / (size * size) : 1) });
    let squared = 0, peak = 0;
    for (let index = 0; index < size * size; index++) {
      squared += (stored.re[index] - exact.re[index]) ** 2 + (stored.im[index] - exact.im[index]) ** 2;
      peak = Math.max(peak, Math.hypot(exact.re[index], exact.im[index]));
    }
    const rmsError = Math.sqrt(squared / (size * size)) / peak;
    check(stored.finite && rmsError < 1e-3 && once.largestStored > HALF_MAX,
      `${name} splat, σ ${sigma} texels, 4 m/s: field peak ${peak.toFixed(2)}, state up to ${largestOf(state).toFixed(1)}, scratch up to ${stored.largestStored.toFixed(1)} (binary16 holds ${HALF_MAX}), rms error ${rmsError.toExponential(2)} of the peak; one 1/N² in the last pass would need ${once.largestStored.toExponential(2)}`);
  }
}

// 6. The pool's walls.
console.log('\n6. The pool\'s walls: a splat with its mirror images');
{
  // The pool is the patch's middle quarter (setPool): its walls at N/4 and 3N/4 along each axis.
  const size = 64, walls = { x: size / 4, y: size / 4 }, amplitude = 0.37, sigma = 2.5, centreX = 22.3, centreY = 37.8;
  const splat = { tx: centreX, tz: centreY, sigma, rim: 1, height: amplitude, velocity: 0 };
  const state = updateState(new Float64Array(4 * size * size), size, { dt: 0, splats: [splat], stateScale: size * size, walls });
  const field = inverseTransform(packState(state, size), size, { scaling: SOLVER_SCALING });
  const wrapped = (offset) => offset - size * Math.round(offset / size);
  const images = [[centreX, centreY], [2 * walls.x - centreX, centreY], [centreX, 2 * walls.y - centreY], [2 * walls.x - centreX, 2 * walls.y - centreY]];
  const mean = 4 * amplitude * 2 * Math.PI * sigma * sigma / (size * size);
  let worst = 0, worstImaginary = 0;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let expected = -mean;
      for (const [imageX, imageY] of images) expected += amplitude * Math.exp(-(wrapped(column - imageX) ** 2 + wrapped(row - imageY) ** 2) / (2 * sigma * sigma));
      worst = Math.max(worst, Math.abs(field.re[row * size + column] - expected));
      worstImaginary = Math.max(worstImaginary, Math.abs(field.im[row * size + column]));
    }
  }
  check(worst < 1e-9 * amplitude && worstImaginary < 1e-9 * amplitude,
    `σ = ${sigma} texels at (${centreX}, ${centreY}) on ${size}², walls at ${walls.x} and ${walls.x + size / 2}: largest difference from its four images less their mean ${worst.toExponential(2)}, velocity ${worstImaginary.toExponential(2)}`);

  // Evolved, with the solver's dispersion and damping on its 6 m patch: even about every wall.
  let evolved = state;
  const frames = 150;
  for (let frame = 0; frame < frames; frame++) evolved = updateState(evolved, size, { dt: 1 / 60, stateScale: size * size });
  const height = inverseTransform(packState(evolved, size), size, { scaling: SOLVER_SCALING }).re;
  const at = (column, row) => height[((row % size + size) % size) * size + ((column % size + size) % size)];
  let peak = 0, oddness = 0, slopeAcross = 0, steepest = 0;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) peak = Math.max(peak, Math.abs(at(column, row)));
    for (const wall of [walls.x, walls.x + size / 2]) {
      for (let offset = 1; offset < size / 4; offset++) oddness = Math.max(oddness, Math.abs(at(wall + offset, row) - at(wall - offset, row)));
      slopeAcross = Math.max(slopeAcross, Math.abs(at(wall + 1, row) - at(wall - 1, row)) / 2);
    }
    for (let column = 0; column < size; column++) steepest = Math.max(steepest, Math.abs(at(column + 1, row) - at(column - 1, row)) / 2);
  }
  for (let column = 0; column < size; column++) {
    for (const wall of [walls.y, walls.y + size / 2]) {
      for (let offset = 1; offset < size / 4; offset++) oddness = Math.max(oddness, Math.abs(at(column, wall + offset) - at(column, wall - offset)));
      slopeAcross = Math.max(slopeAcross, Math.abs(at(column, wall + 1) - at(column, wall - 1)) / 2);
    }
  }
  check(oddness < 1e-9 * peak && slopeAcross < 1e-9 * steepest,
    `after ${frames} frames of 1/60 s: the field is even about all four walls (largest difference across one ${oddness.toExponential(2)} of its peak ${peak.toExponential(2)}), and slopes across them ${(slopeAcross / steepest).toExponential(2)} of its steepest`);

  // The waves come back off the walls: the pool's field is the open patch's (the same splat alone,
  // evolved alike) read at the point and at its mirror images across the walls, so what reaches a
  // wall runs on as if from the splat's image beyond it.
  let openEvolved = updateState(new Float64Array(4 * size * size), size, { dt: 0, splats: [splat], stateScale: size * size });
  for (let frame = 0; frame < frames; frame++) openEvolved = updateState(openEvolved, size, { dt: 1 / 60, stateScale: size * size });
  const openHeight = inverseTransform(packState(openEvolved, size), size, { scaling: SOLVER_SCALING }).re;
  const openAt = (column, row) => openHeight[((row % size + size) % size) * size + ((column % size + size) % size)];
  let imageDifference = 0, reflected = 0;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const mirrorColumn = 2 * walls.x - column, mirrorRow = 2 * walls.y - row;
      const fromImages = openAt(column, row) + openAt(mirrorColumn, row) + openAt(column, mirrorRow) + openAt(mirrorColumn, mirrorRow);
      imageDifference = Math.max(imageDifference, Math.abs(at(column, row) - fromImages));
      // In the pool, what the images add to the open field there: the reflections.
      if (column >= walls.x && column <= walls.x + size / 2 && row >= walls.y && row <= walls.y + size / 2) reflected = Math.max(reflected, Math.abs(at(column, row) - openAt(column, row)));
    }
  }
  check(imageDifference < 1e-9 * peak && reflected > 0.2 * peak,
    `after ${frames} frames the pool's field is the open patch's read at the point and its three mirror images (largest difference ${imageDifference.toExponential(2)} of the peak); the reflections reach ${(reflected / peak).toFixed(2)} of the peak in the pool`);

  // Real fields at fractional centres, as in 3.
  for (const gridSize of [256, 512]) {
    const gridWalls = { x: gridSize / 4, y: gridSize / 4 };
    const fractional = { tx: 100.37 * gridSize / 256, tz: 61.71 * gridSize / 256, sigma: 0.6, rim: 1.7 };
    for (const [name, amounts] of [['height', { height: 0.37, velocity: 0 }], ['velocity', { height: 0, velocity: 0.37 }]]) {
      const gridState = updateState(new Float64Array(4 * gridSize * gridSize), gridSize, { dt: 0, splats: [{ ...fractional, ...amounts }], stateScale: gridSize * gridSize, walls: gridWalls });
      const packed = inverseTransform(packState(gridState, gridSize), gridSize, { scaling: SOLVER_SCALING });
      const own = name === 'height' ? packed.re : packed.im, other = name === 'height' ? packed.im : packed.re;
      const ratio = largestOf(other) / largestOf(own);
      check(ratio < 1e-6, `${gridSize}², σ 0.6 texels at a fractional centre with its images, ${name} only: the ${name === 'height' ? 'velocity' : 'height'} is ${ratio.toExponential(2)} of the ${name} peak`);
    }
  }
}

console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s`);
if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('all FFT checks passed');
}
