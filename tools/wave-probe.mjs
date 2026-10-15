// CPU check of the ambient wind waves (src/ambientWaves.js); npm test runs it.
//
// Builds the seed with the app's own code (rounded to float32, as the GPU gets
// it), evaluates H(k, t) as AMBIENT_EVALUATE_FRAGMENT does, and inverse-
// transforms it with the GPU's Stockham passes (tools/stockham.mjs), at
// 64 × 64 and at the shipped size. It checks that
//   1. the field is real: the imaginary part is zero; and the two packed
//      fields the shader writes come back as (h, ∂h/∂x) and (∂h/∂z, ∇²h);
//   2. its rms slope is the target;
//   3. one seeded mode's downwind draw travels downwind and its upwind draw
//      upwind, at the phase speed ω/k, and the field there is the travelling
//      cosine the shaders assume (h at texel n is h at x = n·cell);
//   4. the field repeats after one period, so wrapping the time is seamless;
// then measures how much slope variance each mip level loses (box mips of the
// slope channels, bilinear lookups) against the model the app uploads, and
// prints the cost of a frame.
//
//   node tools/wave-probe.mjs [--wind=x,z]
// Exits with status 1 if a check fails.
import { performance } from 'node:perf_hooks';
import { AMBIENT_WAVES, DEFAULT_WIND, buildWaveSeed, periodicFrequency, latticeIndex } from '../src/ambientWaves.js';
import { inverse2d } from './stockham.mjs';

const POND_DEPTH = 0.8;
const argument = (name, fallback) => { const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const windArgument = argument('wind', DEFAULT_WIND.join(','));
const wind = windArgument.split(',').map(Number);
const windLength = Math.hypot(wind[0], wind[1]);
const windX = wind[0] / windLength, windZ = wind[1] / windLength;

let failures = 0;
function check(passed, message) {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${message}`);
  if (!passed) failures++;
}

/** H(k, t) for every texel, as AMBIENT_EVALUATE_FRAGMENT computes it (without the unit scale), interleaved complex. */
function evaluateSpectrum(amplitudes, texels, settings, time) {
  const spectrum = new Float64Array(2 * texels * texels);
  const latticeStep = 2 * Math.PI / settings.tileSize;
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const here = row * texels + column;
      const wavenumber = latticeStep * Math.hypot(latticeIndex(column, texels), latticeIndex(row, texels));
      const angle = periodicFrequency(wavenumber, POND_DEPTH, settings.period) * time;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const [downRe, downIm, upRe, upIm] = amplitudes.subarray(4 * here, 4 * here + 4);
      // A₋ e^{−iωt} + A₊ e^{+iωt}
      spectrum[2 * here] = downRe * cosine + downIm * sine + upRe * cosine - upIm * sine;
      spectrum[2 * here + 1] = downIm * cosine - downRe * sine + upIm * cosine + upRe * sine;
    }
  }
  return spectrum;
}

/** Slope field (∂h/∂x, ∂h/∂z) from spectral derivatives: one transform of i·kx·H − kz·H gives sx + i·sz. */
function spectralSlopes(spectrum, texels, tileSize) {
  const derivative = new Float64Array(spectrum.length);
  const latticeStep = 2 * Math.PI / tileSize;
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const here = row * texels + column;
      const wavenumberX = latticeStep * latticeIndex(column, texels), wavenumberZ = latticeStep * latticeIndex(row, texels);
      const re = spectrum[2 * here], im = spectrum[2 * here + 1];
      // i·kx·(re + i·im) − kz·(re + i·im)
      derivative[2 * here] = -wavenumberX * im - wavenumberZ * re;
      derivative[2 * here + 1] = wavenumberX * re - wavenumberZ * im;
    }
  }
  return inverse2d(derivative, texels);
}

function fieldStatistics(grid, texels) {
  let largestReal = 0, largestImaginary = 0, sumOfSquares = 0;
  for (let index = 0; index < texels * texels; index++) {
    largestReal = Math.max(largestReal, Math.abs(grid[2 * index]));
    largestImaginary = Math.max(largestImaginary, Math.abs(grid[2 * index + 1]));
    sumOfSquares += grid[2 * index] ** 2;
  }
  return { largestReal, largestImaginary, rms: Math.sqrt(sumOfSquares / (texels * texels)) };
}

/** The two complex fields AMBIENT_EVALUATE_FRAGMENT writes: H + i·(i·kx·H) and i·kz·H + i·(−k²·H). */
function packSpectrum(spectrum, texels, tileSize) {
  const first = new Float64Array(spectrum.length), second = new Float64Array(spectrum.length);
  const latticeStep = 2 * Math.PI / tileSize;
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const here = row * texels + column;
      const wavenumberX = latticeStep * latticeIndex(column, texels), wavenumberZ = latticeStep * latticeIndex(row, texels);
      const re = spectrum[2 * here], im = spectrum[2 * here + 1];
      const slopeXRe = -wavenumberX * im, slopeXIm = wavenumberX * re;   // i·kx·H
      first[2 * here] = re - slopeXIm;
      first[2 * here + 1] = im + slopeXRe;
      const squared = wavenumberX ** 2 + wavenumberZ ** 2;
      second[2 * here] = -wavenumberZ * im + squared * im;               // i·kz·H + i·(−k²·H)
      second[2 * here + 1] = wavenumberZ * re - squared * re;
    }
  }
  return [first, second];
}

function checkSize(texels) {
  const settings = { ...AMBIENT_WAVES, texels };
  const cell = settings.tileSize / texels;
  console.log(`\n${texels} × ${texels} tile of ${settings.tileSize} m (cell ${(cell * 100).toFixed(2)} cm), wind (${windX.toFixed(3)}, ${windZ.toFixed(3)}), rmsSlope target ${settings.rmsSlope}`);
  const { amplitudes: exactAmplitudes, heightVariance } = buildWaveSeed({ ...settings, windDirection: [windX, windZ] });
  const amplitudes = Float32Array.from(exactAmplitudes);

  // 1 and 2: real field, rms slope.
  const latticeStep = 2 * Math.PI / settings.tileSize;
  let averagedSlopeVariance = 0;
  for (let index = 0; index < texels * texels; index++) {
    const power = amplitudes[4 * index] ** 2 + amplitudes[4 * index + 1] ** 2 + amplitudes[4 * index + 2] ** 2 + amplitudes[4 * index + 3] ** 2;
    averagedSlopeVariance += latticeStep ** 2 * (latticeIndex(index % texels, texels) ** 2 + latticeIndex(Math.floor(index / texels), texels) ** 2) * power;
  }
  check(Math.abs(Math.sqrt(averagedSlopeVariance) / settings.rmsSlope - 1) < 1e-6,
    `time-averaged spectral rms slope √Σk²(|A₋|²+|A₊|²) = ${Math.sqrt(averagedSlopeVariance).toFixed(6)}`);
  for (const time of [0, 1.37]) {
    const spectrum = evaluateSpectrum(amplitudes, texels, settings, time);
    const field = inverse2d(spectrum, texels);
    const heights = fieldStatistics(field, texels);
    check(heights.largestImaginary <= 1e-12 * heights.largestReal,
      `t = ${time} s: largest |Im h| ${heights.largestImaginary.toExponential(2)} m against largest |Re h| ${heights.largestReal.toExponential(2)} m (ratio ${(heights.largestImaginary / heights.largestReal).toExponential(2)})`);
    const slopes = spectralSlopes(spectrum, texels, settings.tileSize);
    let slopeSum = 0, largestSlopeImaginary = 0;
    for (let index = 0; index < texels * texels; index++) slopeSum += slopes[2 * index] ** 2 + slopes[2 * index + 1] ** 2;
    for (let index = 0; index < texels * texels; index++) largestSlopeImaginary = Math.max(largestSlopeImaginary, Math.abs(slopes[2 * index + 1]));
    const slopeRms = Math.sqrt(slopeSum / (texels * texels));
    check(Math.abs(slopeRms / settings.rmsSlope - 1) < 0.05,
      `t = ${time} s: rms slope of the field ${slopeRms.toFixed(5)} (target ${settings.rmsSlope}; the two draws' cross term makes it wander a little); rms height ${(heights.rms * 1000).toFixed(3)} mm`);
    const [first, second] = packSpectrum(spectrum, texels, settings.tileSize).map((packed) => inverse2d(packed, texels));
    // The Laplacian on its own, from −k²·H.
    const curvatureSpectrum = new Float64Array(spectrum.length);
    for (let index = 0; index < texels * texels; index++) {
      const squared = latticeStep ** 2 * (latticeIndex(index % texels, texels) ** 2 + latticeIndex(Math.floor(index / texels), texels) ** 2);
      curvatureSpectrum[2 * index] = -squared * spectrum[2 * index];
      curvatureSpectrum[2 * index + 1] = -squared * spectrum[2 * index + 1];
    }
    const laplacian = inverse2d(curvatureSpectrum, texels);
    const curvature = fieldStatistics(laplacian, texels);
    let worstPacking = 0;
    for (let index = 0; index < texels * texels; index++) {
      worstPacking = Math.max(worstPacking,
        Math.abs(first[2 * index] - field[2 * index]) / heights.largestReal,
        Math.abs(first[2 * index + 1] - slopes[2 * index]) / slopeRms,
        Math.abs(second[2 * index] - slopes[2 * index + 1]) / slopeRms,
        Math.abs(second[2 * index + 1] - laplacian[2 * index]) / curvature.rms);
    }
    check(worstPacking < 1e-10, `t = ${time} s: the shader's packed fields come back as (h, ∂h/∂x) and (∂h/∂z, ∇²h) to within ${worstPacking.toExponential(1)} of their scale; ` +
      `rms ∇²h ${curvature.rms.toFixed(2)} /m, largest ${curvature.largestReal.toFixed(1)} /m (a caustic focus term of ±${(0.25 * 0.8 * curvature.rms).toFixed(2)} rms on the floor 0.8 m down)`);
  }
  console.log(`  time-averaged rms height ${(Math.sqrt(heightVariance) * 1000).toFixed(3)} mm`);

  // 3: travel. One pair ±k near the wind direction, one draw at a time.
  const indexX = Math.round(6 * windX) || 1, indexZ = Math.round(6 * windZ);
  const along = indexX * windX + indexZ * windZ;
  check(along > 0, `test mode m = (${indexX}, ${indexZ}) lies on the downwind side (m·ŵ = ${along.toFixed(3)})`);
  const column = (indexX + texels) % texels, row = (indexZ + texels) % texels;
  const mirrorColumn = (texels - column) % texels, mirrorRow = (texels - row) % texels;
  const here = 4 * (row * texels + column), mirror = 4 * (mirrorRow * texels + mirrorColumn);
  const wavenumberX = latticeStep * indexX, wavenumberZ = latticeStep * indexZ;
  const wavenumber = Math.hypot(wavenumberX, wavenumberZ);
  const omega = periodicFrequency(wavenumber, POND_DEPTH, settings.period);
  for (const [name, keepHere, keepMirror, expectedSign] of [['downwind draw', [0, 1], [2, 3], 1], ['upwind draw', [2, 3], [0, 1], -1]]) {
    const single = new Float32Array(amplitudes.length);
    for (const channel of keepHere) single[here + channel] = amplitudes[here + channel];
    for (const channel of keepMirror) single[mirror + channel] = amplitudes[mirror + channel];
    const timeStep = 0.05;
    const phases = [];
    let worstCosineError = 0;
    for (const time of [0.4, 0.4 + timeStep]) {
      const field = inverse2d(evaluateSpectrum(single, texels, settings, time), texels);
      let cosineSum = 0, sineSum = 0;
      for (let gridRow = 0; gridRow < texels; gridRow++) {
        for (let gridColumn = 0; gridColumn < texels; gridColumn++) {
          const phase = wavenumberX * gridColumn * cell + wavenumberZ * gridRow * cell;
          const value = field[2 * (gridRow * texels + gridColumn)];
          cosineSum += value * Math.cos(phase);
          sineSum += value * Math.sin(phase);
        }
      }
      // h = C cos(k·x − ψ): the crest sits where k·x = ψ.
      const crestPhase = Math.atan2(sineSum, cosineSum);
      const amplitude = 2 * Math.hypot(cosineSum, sineSum) / (texels * texels);
      phases.push(crestPhase);
      for (let gridRow = 0; gridRow < texels; gridRow++) {
        for (let gridColumn = 0; gridColumn < texels; gridColumn++) {
          const expected = amplitude * Math.cos(wavenumberX * gridColumn * cell + wavenumberZ * gridRow * cell - crestPhase);
          worstCosineError = Math.max(worstCosineError, Math.abs(field[2 * (gridRow * texels + gridColumn)] - expected));
        }
      }
    }
    let phaseChange = phases[1] - phases[0];
    phaseChange -= 2 * Math.PI * Math.round(phaseChange / (2 * Math.PI));
    const crestShift = phaseChange / wavenumber;   // along k̂
    const velocityX = crestShift / timeStep * wavenumberX / wavenumber, velocityZ = crestShift / timeStep * wavenumberZ / wavenumber;
    const downwindSpeed = velocityX * windX + velocityZ * windZ;
    check(Math.sign(downwindSpeed) === expectedSign && Math.abs(Math.hypot(velocityX, velocityZ) / (omega / wavenumber) - 1) < 1e-6 && worstCosineError < 1e-12,
      `${name}: crest moves at (${velocityX.toFixed(4)}, ${velocityZ.toFixed(4)}) m/s, ${downwindSpeed.toFixed(4)} m/s downwind; ` +
      `phase speed ω/k = ${(omega / wavenumber).toFixed(4)} m/s; a travelling cosine to within ${worstCosineError.toExponential(1)} m`);
  }

  // 4: period.
  const before = inverse2d(evaluateSpectrum(amplitudes, texels, settings, 2.5), texels);
  const after = inverse2d(evaluateSpectrum(amplitudes, texels, settings, 2.5 + settings.period), texels);
  let worstDifference = 0, largest = 0;
  for (let index = 0; index < texels * texels; index++) {
    worstDifference = Math.max(worstDifference, Math.abs(before[2 * index] - after[2 * index]));
    largest = Math.max(largest, Math.abs(before[2 * index]));
  }
  check(worstDifference <= 1e-9 * largest, `the field at t and t + ${settings.period} s differs by ${(worstDifference / largest).toExponential(2)} of its peak`);
  return { amplitudes, settings };
}

/** Bilinear lookup with repeat wrapping, texel centres at (i + ½)/n, as the GPU samples. */
function bilinear(level, levelTexels, u, v) {
  const x = u * levelTexels - 0.5, y = v * levelTexels - 0.5;
  const left = Math.floor(x), bottom = Math.floor(y);
  const fractionX = x - left, fractionY = y - bottom;
  const at = (column, row) => level[((row % levelTexels) + levelTexels) % levelTexels * levelTexels + (((column % levelTexels) + levelTexels) % levelTexels)];
  return (at(left, bottom) * (1 - fractionX) + at(left + 1, bottom) * fractionX) * (1 - fractionY)
    + (at(left, bottom + 1) * (1 - fractionX) + at(left + 1, bottom + 1) * fractionX) * fractionY;
}

/** Mean of |∇h|² over the tile as bilinear lookups at each mip level of the slope channels show it, as fractions of the field's. */
function measureMipSlopes(amplitudes, settings) {
  const texels = settings.texels;
  const spectrum = evaluateSpectrum(amplitudes, texels, settings, 0);
  const slopes = spectralSlopes(spectrum, texels, settings.tileSize);
  let fieldVariance = 0;
  for (let index = 0; index < texels * texels; index++) fieldVariance += slopes[2 * index] ** 2 + slopes[2 * index + 1] ** 2;
  fieldVariance /= texels * texels;
  const pyramid = (component) => {
    const base = new Float64Array(texels * texels);
    for (let index = 0; index < texels * texels; index++) base[index] = slopes[2 * index + component];
    const levels = [base];
    for (let size = texels / 2; size >= 1; size /= 2) {
      const finer = levels[levels.length - 1], coarser = new Float64Array(size * size);
      for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
          coarser[row * size + column] = 0.25 * (finer[2 * row * 2 * size + 2 * column] + finer[2 * row * 2 * size + 2 * column + 1]
            + finer[(2 * row + 1) * 2 * size + 2 * column] + finer[(2 * row + 1) * 2 * size + 2 * column + 1]);
        }
      }
      levels.push(coarser);
    }
    return levels;
  };
  const alongX = pyramid(0), alongZ = pyramid(1);
  // Deterministic sample points spread over the tile.
  const samples = 20000;
  return alongX.map((mipX, level) => {
    const size = texels >> level;
    let sum = 0;
    for (let sample = 0; sample < samples; sample++) {
      const u = (sample * 0.6180339887498949) % 1, v = (sample * 0.7548776662466927 + 0.31) % 1;
      sum += bilinear(mipX, size, u, v) ** 2 + bilinear(alongZ[level], size, u, v) ** 2;
    }
    return sum / samples / fieldVariance;
  });
}

checkSize(64);
const shipped = checkSize(AMBIENT_WAVES.texels);
const buildStart = performance.now();
const { unresolvedVariance, baseLevelVariance } = buildWaveSeed({ ...AMBIENT_WAVES, windDirection: [windX, windZ] });
const buildMilliseconds = performance.now() - buildStart;

const kept = measureMipSlopes(shipped.amplitudes, shipped.settings);
const targetVariance = AMBIENT_WAVES.rmsSlope ** 2;
console.log(`
A base-level lookup shows ${(kept[0] * 100).toFixed(1)}% of the slope variance (model ${(baseLevelVariance / targetVariance * 100).toFixed(1)}%): the grid's bilinear smoothing, drawn as it is.`);
console.log(`Slope variance each mip level loses against the base level, as a fraction of rmsSlope² (${AMBIENT_WAVES.texels}² tile, measured at t = 0 on the field itself):`);
let worstModelError = 0;
const cell = AMBIENT_WAVES.tileSize / AMBIENT_WAVES.texels;
for (let level = 0; level < kept.length; level++) {
  const model = unresolvedVariance[level] / targetVariance;
  const measured = kept[0] - kept[level];
  worstModelError = Math.max(worstModelError, Math.abs(model - measured));
  console.log(`  level ${level}: texel ${(cell * 2 ** level * 100).toFixed(1).padStart(6)} cm (waves under ${(2 * cell * 2 ** level * 100).toFixed(1).padStart(6)} cm gone)   model ${model.toFixed(3)}   measured ${measured.toFixed(3)}`);
}
check(worstModelError < 0.05, `the uploaded model is within ${worstModelError.toFixed(3)} of the measurement at every level`);

// Cost of a frame on the GPU, and the one-off CPU cost.
const texels = AMBIENT_WAVES.texels;
const passes = 1 + 2 * Math.log2(texels);
const fragments = passes * texels * texels;
const fetches = texels * texels * (1 + 2 * 2 * Math.log2(texels));
const floatBytes = 16 * texels * texels;
console.log(`\nCost per rendered frame (GPU): ${passes} passes over ${texels}², ${(fragments / 1e6).toFixed(2)} M fragments, ${(fetches / 1e6).toFixed(2)} M texel fetches, ` +
  `then one mip chain of ${texels}² RGBA16F (${((texels * texels * 8 * 4) / 3 / 1e6).toFixed(2)} MB written). For scale, the splash solver at 512² runs ${1 + 2 * 9} passes, ${((1 + 18) * 512 * 512 / 1e6).toFixed(2)} M fragments.`);
console.log(`Per water pixel: 1 texture fetch (height and slopes) and the gust envelope (2 value-noise lookups), in place of the old procedural ripples (13 value-noise lookups); per floor pixel 1 fetch (the Laplacian) and the envelope; per surface vertex, speck or riding crown vertex 1 fetch and the envelope.`);
console.log(`Memory: seed ${(floatBytes / 1e6).toFixed(2)} MB (RGBA32F), spectrum and two FFT scratch targets ${(3 * floatBytes / 1e6).toFixed(2)} MB, height with mips ${(texels * texels * 8 * 4 / 3 / 1e6).toFixed(2)} MB.`);
console.log(`CPU, once at start: seed and mip table built in ${buildMilliseconds.toFixed(1)} ms. Per frame: two uniforms.`);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nall wave checks passed');
}
