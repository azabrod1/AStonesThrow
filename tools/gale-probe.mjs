// CPU check of the gale's waves (src/galeWaves.js); npm test runs it.
//
// Builds the seed with the app's own code (rounded to float32, as the GPU gets
// it), evaluates the two packed spectra as GALE_EVALUATE_FRAGMENT does and
// inverse-transforms them with the GPU's Stockham passes (tools/stockham.mjs).
// It checks that
//   1. the field is real, and the packed channels come back as the fields
//      transformed one at a time: (h, Dx, Dz, ∂Dx/∂z) and (∂h/∂x, ∂h/∂z,
//      ∂Dx/∂x, ∂Dz/∂z);
//   2. the sideways move sharpens the crests: the water is squeezed (J < 1)
//      at the crests and stretched in the troughs;
//   3. the significant height and the peak wavelength are the sea's
//      (JONSWAP's fits for the wind and the fetch, src/galeWaves.js);
//   4. the waves travel downwind: the energy's mean direction of travel is
//      the wind's, and the field a quarter second on matches itself moved
//      downwind by about the peak waves' phase speed;
//   5. the field repeats after one period;
//   6. the CPU's surface (GaleSurface, for the stones and the splash) is the
//      field: its height and slope at the texels against the transform's;
// then prints how much of the surface breaks (J under a few thresholds, at a
// few times), measures how much slope variance each mip level loses
// against the model the app uploads (7), runs the whitecaps' foam step
// (GALE_FOAM_FRAGMENT, with its arithmetic, on the fields sampled as the GPU
// samples them) over a few seconds and checks (8) that the boil rides the
// crests, its mean height over a standard deviation of the surface's, and
// higher than it lies when left where the crest was; that the raft lies
// lower, in the water behind them; and that the whitecaps cover a few per
// cent of the water and the raft not much more; and prints the cost.
//
//   node tools/gale-probe.mjs [--wind=x,z]
// Exits with status 1 if a check fails.
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { GALE, buildGaleSeed, GaleSurface, galeFrequency, seaState, crestSpeed, CPU_DROPPED_VARIANCE, FOAM_TEXELS, ACTIVE_LIFETIME, SPENT_LIFETIME, RAFT_LIFETIME, WHITECAP_SPEED } from '../src/galeWaves.js';
import { DEFAULT_WIND, WIND_STRENGTHS, latticeIndex } from '../src/ambientWaves.js';
import { FOAM_DRIFT } from '../src/spectralWater.js';
import { inverse2d } from './stockham.mjs';

const argument = (name, fallback) => { const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const wind = argument('wind', DEFAULT_WIND.join(',')).split(',').map(Number);
const windLength = Math.hypot(wind[0], wind[1]);
const windX = wind[0] / windLength, windZ = wind[1] / windLength;

let failures = 0;
function check(passed, message) {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${message}`);
  if (!passed) failures++;
}

const settings = GALE;
const texels = settings.texels;
const cell = settings.tileSize / texels;
const latticeStep = 2 * Math.PI / settings.tileSize;
const seed = buildGaleSeed({ ...settings, windDirection: [windX, windZ] });
const amplitudes = Float64Array.from(Float32Array.from(seed.amplitudes));   // as the GPU gets them

/** H(k, t) for every texel, as GALE_EVALUATE_FRAGMENT computes it, interleaved complex. */
function evaluateHeight(time) {
  const spectrum = new Float64Array(2 * texels * texels);
  const frequencyStep = 2 * Math.PI / settings.period;
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const here = row * texels + column;
      const wavenumber = latticeStep * Math.hypot(latticeIndex(column, texels), latticeIndex(row, texels));
      const angle = Math.floor(galeFrequency(wavenumber, settings.depth) / frequencyStep + 0.5) * frequencyStep * time;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const [downRe, downIm, upRe, upIm] = amplitudes.subarray(4 * here, 4 * here + 4);
      spectrum[2 * here] = downRe * cosine + downIm * sine + upRe * cosine - upIm * sine;
      spectrum[2 * here + 1] = downIm * cosine - downRe * sine + upIm * cosine + upRe * sine;
    }
  }
  return spectrum;
}

/** A spectrum times a factor of the wave vector: factor(kx, kz) → [re, im] multiplier. */
function multiply(spectrum, factor) {
  const result = new Float64Array(spectrum.length);
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const here = row * texels + column;
      const [factorRe, factorIm] = factor(latticeStep * latticeIndex(column, texels), latticeStep * latticeIndex(row, texels));
      const re = spectrum[2 * here], im = spectrum[2 * here + 1];
      result[2 * here] = factorRe * re - factorIm * im;
      result[2 * here + 1] = factorRe * im + factorIm * re;
    }
  }
  return result;
}

const lambda = settings.choppiness;
const reach = (kx, kz) => { const wavenumber = Math.hypot(kx, kz); return wavenumber > 0 ? lambda / wavenumber : 0; };
const FIELDS = {
  height: () => [1, 0],
  moveX: (kx, kz) => [0, reach(kx, kz) * kx],
  moveZ: (kx, kz) => [0, reach(kx, kz) * kz],
  moveXZ: (kx, kz) => [-reach(kx, kz) * kx * kz, 0],
  slopeX: (kx) => [0, kx],
  slopeZ: (kx, kz) => [0, kz],
  stretchX: (kx, kz) => [-reach(kx, kz) * kx * kx, 0],
  stretchZ: (kx, kz) => [-reach(kx, kz) * kz * kz, 0],
};

/** The two textures the GPU writes (packed first + i·second per pair), unpacked to eight real grids. */
function packedFields(time) {
  const height = evaluateHeight(time);
  const pack = (first, second) => {
    const one = multiply(height, FIELDS[first]), two = multiply(height, FIELDS[second]);
    const packed = new Float64Array(one.length);
    for (let index = 0; index < one.length; index += 2) {
      // one + i·two
      packed[index] = one[index] - two[index + 1];
      packed[index + 1] = one[index + 1] + two[index];
    }
    const field = inverse2d(packed, texels);
    const first_ = new Float64Array(texels * texels), second_ = new Float64Array(texels * texels);
    for (let index = 0; index < texels * texels; index++) { first_[index] = field[2 * index]; second_[index] = field[2 * index + 1]; }
    return [first_, second_];
  };
  const [h, moveX] = pack('height', 'moveX');
  const [moveZ, moveXZ] = pack('moveZ', 'moveXZ');
  const [slopeX, slopeZ] = pack('slopeX', 'slopeZ');
  const [stretchX, stretchZ] = pack('stretchX', 'stretchZ');
  return { h, moveX, moveZ, moveXZ, slopeX, slopeZ, stretchX, stretchZ };
}

const meanSquare = (grid) => grid.reduce((sum, value) => sum + value * value, 0) / grid.length;

console.log(`gale: ${settings.windSpeed} m/s over ${settings.fetch} m, ${texels}² on ${settings.tileSize} m (cell ${(cell * 100).toFixed(1)} cm), λ ${lambda}`);

// 1. Real, and the packing.
console.log('1. the field is real and its packed channels are the fields');
const fields = packedFields(0);
{
  let worstImaginary = 0, worstChannel = 0, scale = 0;
  for (const [name, factor] of Object.entries(FIELDS)) {
    const alone = inverse2d(multiply(evaluateHeight(0), factor), texels);
    let fieldScale = 0;
    for (let index = 0; index < texels * texels; index++) {
      worstImaginary = Math.max(worstImaginary, Math.abs(alone[2 * index + 1]));
      const packedName = { height: 'h' }[name] ?? name;
      worstChannel = Math.max(worstChannel, Math.abs(alone[2 * index] - fields[packedName][index]));
      fieldScale = Math.max(fieldScale, Math.abs(alone[2 * index]));
    }
    scale = Math.max(scale, fieldScale);
  }
  check(worstImaginary < 1e-9 * scale, `every field transforms to a real one (largest imaginary part ${worstImaginary.toExponential(2)} against ${scale.toFixed(3)})`);
  check(worstChannel < 1e-9 * scale, `each packed channel is its field (largest difference ${worstChannel.toExponential(2)})`);
}

// 2. Crests squeezed, troughs stretched.
console.log('2. the sideways move sharpens the crests');
const jacobian = (grids, index) => (1 + grids.stretchX[index]) * (1 + grids.stretchZ[index]) - grids.moveXZ[index] ** 2;
{
  const order = Array.from(fields.h.keys()).sort((first, second) => fields.h[second] - fields.h[first]);
  const share = Math.round(0.05 * order.length);
  const meanJacobian = (indices) => indices.reduce((sum, index) => sum + jacobian(fields, index), 0) / indices.length;
  const crests = meanJacobian(order.slice(0, share)), troughs = meanJacobian(order.slice(-share));
  check(crests < 0.9 && troughs > 1.1, `the Jacobian averages ${crests.toFixed(2)} on the highest 5% (crests) and ${troughs.toFixed(2)} on the lowest 5% (troughs)`);
}

// 3. Height and peak.
console.log('3. the significant height and the peak are the sea\'s');
const sea = seaState(settings);
const heightDeviation = Math.sqrt(meanSquare(fields.h));
const expectedDeviation = Math.sqrt(seed.heightVariance);
const significantHeight = 4 * expectedDeviation;
check(Math.abs(significantHeight / sea.significantHeight - 1) < 0.15, `significant height ${significantHeight.toFixed(3)} m from the drawn spectrum (this draw ${(4 * heightDeviation).toFixed(3)} m), JONSWAP's fit ${sea.significantHeight.toFixed(3)} m`);
{
  const binWidth = latticeStep / 2;
  const bins = new Map();
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const here = 4 * (row * texels + column);
      const power = amplitudes[here] ** 2 + amplitudes[here + 1] ** 2 + amplitudes[here + 2] ** 2 + amplitudes[here + 3] ** 2;
      if (!power) continue;
      const bin = Math.round(latticeStep * Math.hypot(latticeIndex(column, texels), latticeIndex(row, texels)) / binWidth);
      bins.set(bin, (bins.get(bin) ?? 0) + power);
    }
  }
  // The expected spectrum, not the draw: the same sum over the variances the draw's amplitudes come from.
  let peakBin = 0, peakPower = 0;
  for (const [bin, power] of bins) if (power > peakPower) { peakPower = power; peakBin = bin; }
  const peakWavelength = 2 * Math.PI / (peakBin * binWidth);
  check(Math.abs(peakWavelength / sea.peakWavelength - 1) < 0.2, `the drawn spectrum peaks at ${peakWavelength.toFixed(2)} m waves (JONSWAP's peak ${sea.peakWavelength.toFixed(2)} m in deep water, ${(2 * Math.PI / sea.peakFrequency).toFixed(2)} s)`);
}

// 4. Downwind.
console.log('4. the waves travel downwind');
{
  let alongWind = 0, total = 0;
  for (let row = 0; row < texels; row++) {
    for (let column = 0; column < texels; column++) {
      const indexX = latticeIndex(column, texels), indexZ = latticeIndex(row, texels);
      const length = Math.hypot(indexX, indexZ);
      if (!length) continue;
      const here = 4 * (row * texels + column);
      const forward = amplitudes[here] ** 2 + amplitudes[here + 1] ** 2;    // A₋ travels along +k
      const backward = amplitudes[here + 2] ** 2 + amplitudes[here + 3] ** 2;
      alongWind += (forward - backward) * (indexX * windX + indexZ * windZ) / length;
      total += forward + backward;
    }
  }
  check(alongWind / total > 0.7, `the energy's mean direction of travel is ${(alongWind / total).toFixed(2)} along the wind (1 would be all straight downwind)`);
  const later = packedFields(0.25).h;
  let bestShift = [0, 0], bestCorrelation = -Infinity;
  const reachCells = 8;
  for (let shiftZ = -reachCells; shiftZ <= reachCells; shiftZ++) {
    for (let shiftX = -reachCells; shiftX <= reachCells; shiftX++) {
      let correlation = 0;
      for (let row = 0; row < texels; row += 2) {
        for (let column = 0; column < texels; column += 2) {
          correlation += fields.h[row * texels + column] * later[((row + shiftZ + texels) % texels) * texels + (column + shiftX + texels) % texels];
        }
      }
      if (correlation > bestCorrelation) { bestCorrelation = correlation; bestShift = [shiftX, shiftZ]; }
    }
  }
  const moved = [bestShift[0] * cell, bestShift[1] * cell];
  const distance = Math.hypot(...moved);
  const phaseSpeed = GALE_PHASE_SPEED();
  check((moved[0] * windX + moved[1] * windZ) > 0.8 * distance && Math.abs(distance / (phaseSpeed * 0.25) - 1) < 0.5,
    `a quarter second on, the field matches itself moved ${distance.toFixed(2)} m, ${(Math.acos(Math.min(1, (moved[0] * windX + moved[1] * windZ) / distance)) * 180 / Math.PI).toFixed(0)}° off the wind (the peak waves go ${phaseSpeed.toFixed(2)} m/s: ${(phaseSpeed * 0.25).toFixed(2)} m)`);
}
function GALE_PHASE_SPEED() {
  const wavenumber = 2 * Math.PI / sea.peakWavelength;
  return galeFrequency(wavenumber, settings.depth) / wavenumber;
}

// 5. Period.
console.log('5. the field repeats after one period');
{
  const start = evaluateHeight(0), end = evaluateHeight(settings.period);
  let worst = 0;
  for (let index = 0; index < start.length; index++) worst = Math.max(worst, Math.abs(start[index] - end[index]));
  check(worst < 1e-9, `H(k, ${settings.period} s) = H(k, 0) to ${worst.toExponential(2)}`);
}

// 6. The CPU's surface.
console.log('6. the CPU\'s surface is the field');
const surface = new GaleSurface(amplitudes, settings);
{
  const time = 3.7;
  surface.setTime(time);
  const grids = packedFields(time);
  let squaredError = 0, worst = 0, slopeError = 0, samples = 0, worstSlope = 0;
  const result = { height: 0, slopeX: 0, slopeZ: 0 };
  for (let row = 0; row < texels; row += 3) {
    for (let column = 0; column < texels; column += 3) {
      // Texel n holds the field at x = n·cell (the shaders offset their lookups by half a texel for it).
      surface.sample(column * cell, row * cell, result);
      const here = row * texels + column;
      const error = result.height - grids.h[here];
      squaredError += error * error;
      worst = Math.max(worst, Math.abs(error));
      const slopeDifference = Math.hypot(result.slopeX - grids.slopeX[here], result.slopeZ - grids.slopeZ[here]);
      slopeError += slopeDifference ** 2;
      worstSlope = Math.max(worstSlope, slopeDifference);
      samples++;
    }
  }
  const rmsError = Math.sqrt(squaredError / samples);
  check(rmsError < 0.01 && worst < 0.03, `${surface.count} wave vectors of ${texels * texels / 2} (all but ${(CPU_DROPPED_VARIANCE * 100).toFixed(1)}% of the variance): height off by ${(rmsError * 1000).toFixed(1)} mm rms, ${(worst * 1000).toFixed(1)} mm at worst, over ${samples} texels`);
  console.log(`       slope off by ${Math.sqrt(slopeError / samples).toFixed(3)} rms, ${worstSlope.toFixed(3)} at worst (the field's rms slope ${Math.sqrt(seed.slopeVariance).toFixed(3)}; the short waves the CPU leaves out are slope, not height)`);
}

// How much breaks.
console.log('how much of the surface breaks (J, the Jacobian of the sideways move)');
for (const time of [0, 1.3, 7.9, 42.0]) {
  const grids = time === 0 ? fields : packedFields(time);
  const values = Array.from(grids.h.keys(), (index) => jacobian(grids, index));
  const below = (threshold) => (values.filter((value) => value < threshold).length / values.length * 100).toFixed(2);
  console.log(`       t ${String(time).padStart(4)} s: J < 0.8 on ${below(0.8)}%, < 0.7 on ${below(0.7)}%, < 0.6 on ${below(0.6)}%, < 0.4 on ${below(0.4)}%, < 0.2 on ${below(0.2)}%, folded (< 0) on ${below(0)}%; least J ${Math.min(...values).toFixed(2)}`);
}

// 7. The mips' lost slope variance against the model.
console.log('7. what each mip level loses');
{
  const bilinear = (level, size, u, v) => {
    const x = u * size - 0.5, y = v * size - 0.5;
    const left = Math.floor(x), bottom = Math.floor(y);
    const fractionX = x - left, fractionY = y - bottom;
    const at = (column, row) => level[((row % size) + size) % size * size + (((column % size) + size) % size)];
    return (at(left, bottom) * (1 - fractionX) + at(left + 1, bottom) * fractionX) * (1 - fractionY)
      + (at(left, bottom + 1) * (1 - fractionX) + at(left + 1, bottom + 1) * fractionX) * fractionY;
  };
  const pyramid = (base) => {
    const levels = [base];
    for (let size = texels / 2; size >= 1; size /= 2) {
      const finer = levels.at(-1), coarser = new Float64Array(size * size);
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
  const alongX = pyramid(fields.slopeX), alongZ = pyramid(fields.slopeZ);
  const sampleCount = 20000;
  const kept = alongX.map((mipX, level) => {
    const size = texels >> level;
    let sum = 0;
    for (let sample = 0; sample < sampleCount; sample++) {
      const u = (sample * 0.6180339887498949) % 1, v = (sample * 0.7548776662466927 + 0.31) % 1;
      sum += bilinear(mipX, size, u, v) ** 2 + bilinear(alongZ[level], size, u, v) ** 2;
    }
    return sum / sampleCount;
  });
  const fieldVariance = meanSquare(fields.slopeX) + meanSquare(fields.slopeZ);
  let worst = 0;
  const rows = [];
  for (let level = 0; level < kept.length; level++) {
    const measuredLost = (kept[0] - kept[level]) / fieldVariance;
    const modelLost = seed.unresolvedVariance[level] / seed.slopeVariance;
    worst = Math.max(worst, Math.abs(measuredLost - modelLost));
    rows.push(`${level}: ${measuredLost.toFixed(3)}/${modelLost.toFixed(3)}`);
  }
  console.log(`       lost, measured/model, as shares of the slope variance: ${rows.join('  ')}`);
  check(worst < 0.06, `the model of what the mips lose is within ${worst.toFixed(3)} of a measurement of this draw`);
}

// Cost.
console.log('cost');
{
  const passes = 2 * (1 + 2 * Math.log2(texels));
  console.log(`       GPU, each frame the gale blows: ${passes} passes over ${texels}² texels (${(passes * texels * texels / 1e6).toFixed(2)} M fragments), two ${texels}² RGBA16F targets with mips and three RGBA32F scratch targets`);
  const start = performance.now();
  let runs = 0;
  while (performance.now() - start < 300) { surface.setTime(runs * 0.016); runs++; }
  const setTimeMicroseconds = (performance.now() - start) * 1000 / runs;
  const sampleStart = performance.now();
  let samples = 0;
  const result = { height: 0, slopeX: 0, slopeZ: 0 };
  while (performance.now() - sampleStart < 300) { surface.sample(samples * 0.37, samples * 0.11, result); samples++; }
  const sampleMicroseconds = (performance.now() - sampleStart) * 1000 / samples;
  console.log(`       CPU: setting the time ${setTimeMicroseconds.toFixed(0)} µs a frame, a point ${sampleMicroseconds.toFixed(0)} µs (here; a phone is a few times slower)`);
}

// 8. The whitecaps: the foam step on the CPU (GALE_FOAM_FRAGMENT's
// arithmetic, its constants read from the shader), the fields sampled
// bilinearly at the map's texels as the GPU samples the textures.
console.log('8. the whitecaps (the foam step, GALE_FOAM_FRAGMENT)');
{
  const shaderSource = readFileSync(new URL('../src/shaders/spectral.js', import.meta.url), 'utf8');
  const foamDefine = (name) => Number(shaderSource.match(new RegExp(`#define ${name} ([-0-9.e]+)`))[1]);
  const BREAK_START = foamDefine('GALE_BREAK_START'), BREAK_FULL = foamDefine('GALE_BREAK_FULL'), BOIL = foamDefine('GALE_BOIL');
  const RAFT_RATE = foamDefine('GALE_RAFT_RATE'), RAFT_MOST = foamDefine('GALE_RAFT_MOST');
  const mapTexels = FOAM_TEXELS;
  const smoothstep = (low, high, value) => { const t = Math.min(Math.max((value - low) / (high - low), 0), 1); return t * t * (3 - 2 * t); };
  const wrap = (index, size) => ((index % size) + size) % size;
  /** A field texture sampled bilinearly at uv (texel n holds the field at n·cell; repeat-wrapped), as the GPU's LinearFilter does. */
  const bilinearField = (grid, u, v) => {
    const x = u * texels - 0.5, y = v * texels - 0.5;
    const left = Math.floor(x), bottom = Math.floor(y), fx = x - left, fy = y - bottom;
    const at = (column, row) => grid[wrap(row, texels) * texels + wrap(column, texels)];
    return (at(left, bottom) * (1 - fx) + at(left + 1, bottom) * fx) * (1 - fy) + (at(left, bottom + 1) * (1 - fx) + at(left + 1, bottom + 1) * fx) * fy;
  };
  /** The map (three channels, interleaved: foam, raft, spent) at uv: the shader's carried(), a clamped quadratic reconstruction. */
  const carried = (map, u, v) => {
    const px = u * mapTexels - 0.5, py = v * mapTexels - 0.5;
    const nx = Math.floor(px + 0.5), ny = Math.floor(py + 0.5), wx = px - nx, wy = py - ny;
    const at = (column, row, channel) => map[3 * (wrap(row, mapTexels) * mapTexels + wrap(column, mapTexels)) + channel];
    const result = [0, 0, 0];
    for (const channel of [0, 1, 2]) {
      const centre = at(nx, ny, channel), east = at(nx + 1, ny, channel), west = at(nx - 1, ny, channel), north = at(nx, ny + 1, channel), south = at(nx, ny - 1, channel);
      const upstream = centre + 0.5 * wx * (east - west) + 0.5 * wy * (north - south) + 0.5 * wx * wx * (east + west - 2 * centre) + 0.5 * wy * wy * (north + south - 2 * centre);
      result[channel] = Math.min(Math.max(upstream, Math.min(east, west, north, south, centre)), Math.max(east, west, north, south, centre));
    }
    return result;
  };
  const crest = crestSpeed(seed.sea, settings.depth);
  const drift = FOAM_DRIFT * WIND_STRENGTHS.gale;
  const step = 0.05, seconds = 6;
  /** Run the map from empty for `seconds`, the active whitewater carried at `boilSpeed` (m/s downwind); returns the map and the fields at the end. */
  const run = (boilSpeed) => {
    let map = new Float64Array(3 * mapTexels * mapTexels);
    const activeKeep = Math.exp(-step / ACTIVE_LIFETIME), spentKeep = Math.exp(-step / SPENT_LIFETIME), raftKeep = Math.exp(-step / RAFT_LIFETIME);
    const travel = [windX * boilSpeed * step / settings.tileSize, windZ * boilSpeed * step / settings.tileSize];
    const waterDrift = [windX * drift * step / settings.tileSize, windZ * drift * step / settings.tileSize];
    let grids = null;
    for (let count = 1; count * step <= seconds + 1e-9; count++) {
      grids = packedFields(count * step);
      const next = new Float64Array(map.length);
      for (let row = 0; row < mapTexels; row++) {
        for (let column = 0; column < mapTexels; column++) {
          const u = (column + 0.5) / mapTexels, v = (row + 0.5) / mapTexels;
          const withCrest = carried(map, u - travel[0], v - travel[1]);
          const withWater = carried(map, u - waterDrift[0], v - waterDrift[1]);
          const fieldU = u + 0.5 / texels - 0.5 / mapTexels, fieldV = v + 0.5 / texels - 0.5 / mapTexels;
          const jacobianHere = (1 + bilinearField(grids.stretchX, fieldU, fieldV)) * (1 + bilinearField(grids.stretchZ, fieldU, fieldV)) - bilinearField(grids.moveXZ, fieldU, fieldV) ** 2;
          const breaking = 1 - smoothstep(BREAK_FULL, BREAK_START, jacobianHere);
          const activeBefore = Math.max(withCrest[0] - withCrest[1] - withCrest[2], 0);
          const active = Math.max(activeBefore * activeKeep, breaking * BOIL);
          const spent = Math.min(withWater[2] * spentKeep + activeBefore * (1 - activeKeep), BOIL);
          const raft = Math.min(withWater[1] * raftKeep + breaking * RAFT_RATE * step, RAFT_MOST);
          const here = 3 * (row * mapTexels + column);
          next[here] = active + spent + raft;
          next[here + 1] = raft;
          next[here + 2] = spent;
        }
      }
      map = next;
    }
    return { map, grids };
  };
  /** The mean height under a channel's weight, in standard deviations of the surface, and the share of the water it covers over a threshold. */
  const measure = ({ map, grids }, channel, threshold) => {
    const deviation = Math.sqrt(meanSquare(grids.h));
    let weighted = 0, weight = 0, covered = 0;
    for (let row = 0; row < mapTexels; row++) {
      for (let column = 0; column < mapTexels; column++) {
        const here = 3 * (row * mapTexels + column);
        const amount = channel === 'active' ? Math.max(map[here] - map[here + 1] - map[here + 2], 0) : channel === 'boil' ? Math.max(map[here] - map[here + 1], 0) : map[here + 1];
        const u = (column + 0.5) / mapTexels, v = (row + 0.5) / mapTexels;
        const height = bilinearField(grids.h, u + 0.5 / texels - 0.5 / mapTexels, v + 0.5 / texels - 0.5 / mapTexels);
        weighted += amount * height;
        weight += amount;
        if (amount > threshold) covered++;
      }
    }
    return { height: weighted / Math.max(weight, 1e-12) / deviation, cover: covered / (mapTexels * mapTexels) };
  };
  const stepStart = performance.now();
  const riding = run(WHITECAP_SPEED * crest);
  const stepMilliseconds = (performance.now() - stepStart) / (seconds / step);
  const left = run(0);
  const activeRiding = measure(riding, 'active', 0.1), activeLeft = measure(left, 'active', 0.1);
  const boilRiding = measure(riding, 'boil', 0.1), spentRiding = measure(riding, 'spent', 0.1);
  const raftRiding = measure(riding, 'raft', 0.02);
  console.log(`       the peak's phase speed ${crest.toFixed(2)} m/s; the whitewater carried at ${WHITECAP_SPEED} of it, over ${seconds} s in steps of ${step} s (${stepMilliseconds.toFixed(0)} ms a step here)`);
  check(activeRiding.height > 1.0, `the active whitewater rides the crests: its mean height ${activeRiding.height.toFixed(2)} σ of the surface (${activeLeft.height.toFixed(2)} σ left where the crest broke)`);
  check(activeRiding.height > activeLeft.height + 0.3, `carried, it sits ${(activeRiding.height - activeLeft.height).toFixed(2)} σ higher than left behind`);
  check(spentRiding.height < activeRiding.height - 0.3, `the spent froth is shed behind the crest: its mean height ${spentRiding.height.toFixed(2)} σ`);
  check(raftRiding.height < activeRiding.height - 0.5, `the raft lies in the water behind: its mean height ${raftRiding.height.toFixed(2)} σ`);
  check(boilRiding.cover > 0.01 && boilRiding.cover < 0.12, `whitecaps (froth over 0.1, active and spent) cover ${(boilRiding.cover * 100).toFixed(1)}% of the water`);
  check(raftRiding.cover < 0.35, `the raft (over 0.02, where its lace begins to show) covers ${(raftRiding.cover * 100).toFixed(1)}%`);
}

if (failures) { console.log(`gale-probe: ${failures} check(s) failed`); process.exit(1); }
console.log('gale-probe: all checks pass');
