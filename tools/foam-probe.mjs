// The foam's bubble pattern (FOAM_PATTERN in src/shaders/scene.js) on the CPU.
//
//   node tools/foam-probe.mjs
//
// Reads the pattern's constants from the shader's #defines, runs the same
// cellular layers in JavaScript (doubles where the GPU has floats: the
// hashes differ, the statistics do not) and checks:
//   1. each layer's median and spread (half its 10–90% range) over a large
//      area match the FOAM_*_MEDIAN and FOAM_*_SPREAD that a fading layer
//      tends to, and the mean shade of resolved bubbles matches
//      FOAM_FADED_SHADE, so foam keeps its strength and brightness as its
//      layers fade with distance; the wet films retain their mean opacity;
//   2. at the framings the foam is judged at (the home view at 1280×720, the
//      phone at 390×844 and twice the density, a 12° close-up), for a
//      Gaussian raft at the reference impact point, the share of the pixels
//      the shader's antialiased pattern covers matches a 5×5 supersampled
//      cover of the pattern with nothing faded, within 10%; and moving the
//      water 3 mm under the pixels, as a passing ripple does, changes the
//      shader's image no more than 1.6 times as much as it changes the
//      supersampled one (shimmer would change it far more);
//      also checks mean brightness within 10%, including the wet films;
//   3. prints the cell visits per foam pixel at each framing, the cost;
//   4. runs the foam map's step (FOAM_FRAGMENT in src/shaders/spectral.js)
//      with its arithmetic, on a corner of the Medium grid: a flow keeps the
//      amount (within 6%: where the hole's edge moves, the interpolation's
//      undershoot is clipped at zero, which adds a few per cent; nothing rises
//      above what was there), clears its core and carries the raft out to
//      where a source of its area puts it (within 10%), leaving under 2% of it
//      within 0.6 of the radius it clears (bilinear samples, also printed,
//      blur the hole's edge inward); the wind's drift moves a raft at
//      FOAM_DRIFT (within 2%) without widening it (its rms radius by under 3%,
//      where bilinear samples, also printed, widen it by about 40% in 8 s);
//      and a boil over a raft leaves the raft its own lifetime (within 3% of
//      the two exponentials after 8 s).
// It exits with 1 if a check fails.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOAM_FRAGMENT } from '../src/shaders/spectral.js';
import { FOAM_DRIFT, FOAM_DIFFUSIVITY, FOAM_FLOW } from '../src/spectralWater.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shaderSource = readFileSync(path.join(root, 'src/shaders/scene.js'), 'utf8');
const defines = {};
for (const match of shaderSource.matchAll(/^#define (FOAM_\w+) (vec2\([^)]*\)|[-\d.e]+)/gm)) {
  defines[match[1]] = match[2].startsWith('vec2') ? match[2].slice(5, -1).split(',').map(Number) : Number(match[2]);
}
const required = ['FOAM_FINE_CELL', 'FOAM_COARSE_CELL', 'FOAM_LACE_CELL', 'FOAM_LACE_WARP', 'FOAM_BUBBLE_SCALE', 'FOAM_MID', 'FOAM_FADED_SHADE'];
for (const name of required) if (!(name in defines)) throw new Error(`${name} not found in src/shaders/scene.js`);
const presentThreshold = defines.FOAM_MID * Math.exp(-(defines.FOAM_LACE_WEIGHT + defines.FOAM_BUBBLE_WEIGHT * defines.FOAM_BUBBLE_CLAMP + 0.5 * (defines.FOAM_RAGGED + defines.FOAM_CLUMP)) / defines.FOAM_LOG_SCALE);

const fract = (value) => value - Math.floor(value);
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const smoothstep = (low, high, value) => { const along = clamp((value - low) / (high - low), 0, 1); return along * along * (3 - 2 * along); };
const mix = (from, to, amount) => from + (to - from) * amount;

function hash21(positionX, positionY) {
  let first = fract(positionX * 0.1031), second = fract(positionY * 0.1031), third = fract(positionX * 0.1031);
  const dot = first * (second + 33.33) + second * (third + 33.33) + third * (first + 33.33);
  first += dot; second += dot; third += dot;
  return fract((first + second) * third);
}
function foamHash(positionX, positionY) {
  let first = fract(positionX * 0.1031), second = fract(positionY * 0.1030), third = fract(positionX * 0.0973);
  const dot = first * (second + 33.33) + second * (first + 33.33) + third * (third + 33.33);
  first += dot; second += dot; third += dot;
  return [fract((first + second) * third), fract((first + third) * second), fract((second + third) * first)];
}
// Value noise and its gradient.
function valueNoiseWithGradient(positionX, positionY) {
  const cornerX = Math.floor(positionX), cornerY = Math.floor(positionY);
  const withinX = positionX - cornerX, withinY = positionY - cornerY;
  const easeX = withinX * withinX * (3 - 2 * withinX), easeY = withinY * withinY * (3 - 2 * withinY);
  const lowerLeft = hash21(cornerX, cornerY), lowerRight = hash21(cornerX + 1, cornerY);
  const upperLeft = hash21(cornerX, cornerY + 1), upperRight = hash21(cornerX + 1, cornerY + 1);
  const twist = lowerLeft - lowerRight - upperLeft + upperRight;
  return {
    value: lowerLeft + (lowerRight - lowerLeft) * easeX + (upperLeft - lowerLeft) * easeY + twist * easeX * easeY,
    gradientX: 6 * withinX * (1 - withinX) * (lowerRight - lowerLeft + twist * easeY),
    gradientY: 6 * withinY * (1 - withinY) * (upperLeft - lowerLeft + twist * easeX),
  };
}
function valueNoise(positionX, positionY) {
  const cornerX = Math.floor(positionX), cornerY = Math.floor(positionY);
  const easeX = (positionX - cornerX) ** 2 * (3 - 2 * (positionX - cornerX)), easeY = (positionY - cornerY) ** 2 * (3 - 2 * (positionY - cornerY));
  return mix(mix(hash21(cornerX, cornerY), hash21(cornerX + 1, cornerY), easeX), mix(hash21(cornerX, cornerY + 1), hash21(cornerX + 1, cornerY + 1), easeX), easeY);
}
// Two value noises and their Jacobian [∂x/∂u, ∂y/∂u, ∂x/∂v, ∂y/∂v].
function valueNoisePair(positionX, positionY) {
  const cornerX = Math.floor(positionX), cornerY = Math.floor(positionY);
  const withinX = positionX - cornerX, withinY = positionY - cornerY;
  const easeX = withinX * withinX * (3 - 2 * withinX), easeY = withinY * withinY * (3 - 2 * withinY);
  const slopeX = 6 * withinX * (1 - withinX), slopeY = 6 * withinY * (1 - withinY);
  const lowerLeft = foamHash(cornerX, cornerY), lowerRight = foamHash(cornerX + 1, cornerY);
  const upperLeft = foamHash(cornerX, cornerY + 1), upperRight = foamHash(cornerX + 1, cornerY + 1);
  const values = [], jacobian = [0, 0, 0, 0];
  for (let component = 0; component < 2; component++) {
    const twist = lowerLeft[component] - lowerRight[component] - upperLeft[component] + upperRight[component];
    values.push(lowerLeft[component] + (lowerRight[component] - lowerLeft[component]) * easeX + (upperLeft[component] - lowerLeft[component]) * easeY + twist * easeX * easeY);
    jacobian[component] = (lowerRight[component] - lowerLeft[component] + twist * easeY) * slopeX;
    jacobian[2 + component] = (upperLeft[component] - lowerLeft[component] + twist * easeX) * slopeY;
  }
  return { values, jacobian };
}

let cellVisits = 0;
// foamCells in the shader: the best two features by radius minus distance.
function foamCells(positionX, positionY, radii, jitter, seed) {
  const cellX = Math.floor(positionX), cellY = Math.floor(positionY);
  const withinX = positionX - cellX, withinY = positionY - cellY;
  const result = { best: -10, runnerUp: -10, bestX: 1, bestY: 0, runnerUpX: 1, runnerUpY: 0, bestRadius: 1, edgeKey: 0 };
  let bestKey = 0, runnerUpKey = 0;
  for (let row = -1; row <= 1; row++) {
    for (let column = -1; column <= 1; column++) {
      cellVisits++;
      const random = foamHash(cellX + column + seed[0], cellY + row + seed[1]);
      const offsetX = withinX - column - 0.5 - jitter * (random[0] - 0.5);
      const offsetY = withinY - row - 0.5 - jitter * (random[1] - 0.5);
      const radius = mix(radii[0], radii[1], random[2]);
      const inside = radius - Math.hypot(offsetX, offsetY);
      if (inside > result.best) {
        Object.assign(result, { runnerUp: result.best, runnerUpX: result.bestX, runnerUpY: result.bestY, best: inside, bestX: offsetX, bestY: offsetY, bestRadius: radius });
        runnerUpKey = bestKey; bestKey = random[2];
      } else if (inside > result.runnerUp) {
        Object.assign(result, { runnerUp: inside, runnerUpX: offsetX, runnerUpY: offsetY });
        runnerUpKey = random[2];
      }
    }
  }
  result.edgeKey = bestKey + runnerUpKey;
  return result;
}

function laceRaw(worldX, worldZ) {
  const warp = valueNoisePair(worldX * defines.FOAM_LACE_WARP_FREQUENCY, worldZ * defines.FOAM_LACE_WARP_FREQUENCY);
  const cells = foamCells(worldX / defines.FOAM_LACE_CELL + defines.FOAM_LACE_WARP * (warp.values[0] - 0.5), worldZ / defines.FOAM_LACE_CELL + defines.FOAM_LACE_WARP * (warp.values[1] - 0.5), defines.FOAM_LACE_RADII, 0.9, [3.0, 5.1]);
  const thickness = defines.FOAM_LACE_THICKNESS * (1 - defines.FOAM_LACE_THINNING * fract(cells.edgeKey * 7.13));
  const raw = 1 - 2 * (cells.best - cells.runnerUp) / thickness;
  const bestLength = Math.max(Math.hypot(cells.bestX, cells.bestY), 1e-4), runnerUpLength = Math.max(Math.hypot(cells.runnerUpX, cells.runnerUpY), 1e-4);
  const cellGradientX = -2 / thickness * (cells.runnerUpX / runnerUpLength - cells.bestX / bestLength);
  const cellGradientY = -2 / thickness * (cells.runnerUpY / runnerUpLength - cells.bestY / bestLength);
  const warpScale = defines.FOAM_LACE_WARP * defines.FOAM_LACE_WARP_FREQUENCY;
  const gradientX = cellGradientX / defines.FOAM_LACE_CELL + warpScale * (cellGradientX * warp.jacobian[0] + cellGradientY * warp.jacobian[1]);
  const gradientY = cellGradientY / defines.FOAM_LACE_CELL + warpScale * (cellGradientX * warp.jacobian[2] + cellGradientY * warp.jacobian[3]);
  return { raw, gradientX, gradientY };
}
// Below 0 the lace sinks smoothly toward -FOAM_LACE_DEPTH.
const sinkLace = (raw) => raw > 0 ? raw : defines.FOAM_LACE_DEPTH * (Math.exp(raw / defines.FOAM_LACE_DEPTH) - 1);
const fineCells = (worldX, worldZ) => foamCells(worldX / defines.FOAM_FINE_CELL, worldZ / defines.FOAM_FINE_CELL, defines.FOAM_FINE_RADII, 0.7, [11.0, 18.7]);
const coarseCells = (worldX, worldZ) => foamCells(worldX / defines.FOAM_COARSE_CELL, worldZ / defines.FOAM_COARSE_CELL, defines.FOAM_COARSE_RADII, 0.7, [23.0, 39.1]);
function filmOpacity(cells, footprint, cellSize) {
  const radial = Math.hypot(cells.bestX, cells.bestY) / cells.bestRadius;
  const width = Math.max(footprint / (cellSize * cells.bestRadius), 0.04);
  const centre = 1 - smoothstep(0.65 - width, 0.98 + width, radial);
  return 1 - (1 - defines.FOAM_FILM_CENTRE) * centre;
}

function resolvedShade(cells) {
  const radial = Math.min(Math.hypot(cells.bestX, cells.bestY) / cells.bestRadius, 1);
  const domeHeight = Math.sqrt(1 - radial * radial);
  const crease = smoothstep(0, 0.12, cells.best - cells.runnerUp);
  return cells.best >= 0 ? mix(defines.FOAM_RIM_SHADE, 1, smoothstep(0, 0.6, domeHeight)) * mix(defines.FOAM_CREASE_SHADE, 1, crease) : defines.FOAM_GAP_SHADE;
}

// foamLook in the shader: cover, opacity and shade. across = [dx/dpixelX, dz/dpixelX, dx/dpixelY, dz/dpixelY].
function foamLook(worldX, worldZ, across, foam, resolveAll = false, boilFraction = 0) {
  const footprint = Math.sqrt(Math.hypot(across[0], across[1]) * Math.hypot(across[2], across[3]));
  const fadeOf = (cell) => resolveAll ? 0 : smoothstep(defines.FOAM_FADE_START, defines.FOAM_FADE_END, footprint / cell);
  const fineFade = fadeOf(defines.FOAM_FINE_CELL), coarseFade = fadeOf(defines.FOAM_COARSE_CELL), laceFade = fadeOf(defines.FOAM_LACE_CELL);
  let gradientX = 0, gradientY = 0;
  let lace = defines.FOAM_LACE_MEDIAN;
  if (laceFade < 1) {
    const sample = laceRaw(worldX, worldZ);
    const sink = Math.exp(Math.min(sample.raw, 0) / defines.FOAM_LACE_DEPTH);
    lace = mix(sinkLace(sample.raw), defines.FOAM_LACE_MEDIAN, laceFade);
    const weight = defines.FOAM_LACE_WEIGHT * (1 - laceFade) * sink;
    gradientX += weight * sample.gradientX; gradientY += weight * sample.gradientY;
  }
  let fine = null, fineBubble = defines.FOAM_FINE_MEDIAN, fineGradient = [0, 0];
  if (fineFade < 1) {
    fine = fineCells(worldX, worldZ);
    fineBubble = mix(fine.best * defines.FOAM_FINE_CELL / defines.FOAM_BUBBLE_SCALE, defines.FOAM_FINE_MEDIAN, fineFade);
    const length = Math.max(Math.hypot(fine.bestX, fine.bestY), 1e-4);
    fineGradient = [-fine.bestX / length * (1 - fineFade) / defines.FOAM_BUBBLE_SCALE, -fine.bestY / length * (1 - fineFade) / defines.FOAM_BUBBLE_SCALE];
  }
  let coarse = null, coarseBubble = -defines.FOAM_BUBBLE_CLAMP, coarseGradient = [0, 0];
  if (coarseFade < 1) {
    coarse = coarseCells(worldX, worldZ);
    coarseBubble = coarse.best * defines.FOAM_COARSE_CELL / defines.FOAM_BUBBLE_SCALE;
    const length = Math.max(Math.hypot(coarse.bestX, coarse.bestY), 1e-4);
    coarseGradient = [-coarse.bestX / length / defines.FOAM_BUBBLE_SCALE, -coarse.bestY / length / defines.FOAM_BUBBLE_SCALE];
  }
  const coarseWins = coarseBubble > fineBubble;
  let bubble = clamp(coarseWins ? coarseBubble : fineBubble, -defines.FOAM_BUBBLE_CLAMP, defines.FOAM_BUBBLE_CLAMP);
  const bubbleGradient = coarseWins ? coarseGradient : fineGradient;
  const inRange = Math.abs(bubble) < defines.FOAM_BUBBLE_CLAMP - 1e-3 ? 1 : 0;
  gradientX += defines.FOAM_BUBBLE_WEIGHT * (1 - coarseFade) * inRange * bubbleGradient[0]; gradientY += defines.FOAM_BUBBLE_WEIGHT * (1 - coarseFade) * inRange * bubbleGradient[1];
  bubble = mix(bubble, defines.FOAM_UNION_MEDIAN, coarseFade);
  const clumpFade = resolveAll ? 0 : smoothstep(defines.FOAM_FADE_START, defines.FOAM_FADE_END, footprint * defines.FOAM_CLUMP_FREQUENCY);
  let clump = 0;
  if (clumpFade < 1) {
    const noise = valueNoiseWithGradient(worldX * defines.FOAM_CLUMP_FREQUENCY + 57.3, worldZ * defines.FOAM_CLUMP_FREQUENCY + 57.3);
    clump = (noise.value - 0.5) * (1 - clumpFade);
    gradientX += defines.FOAM_CLUMP * defines.FOAM_CLUMP_FREQUENCY * (1 - clumpFade) * noise.gradientX;
    gradientY += defines.FOAM_CLUMP * defines.FOAM_CLUMP_FREQUENCY * (1 - clumpFade) * noise.gradientY;
  }
  const raggedFade = resolveAll ? 0 : smoothstep(defines.FOAM_FADE_START, defines.FOAM_FADE_END, footprint * defines.FOAM_RAGGED_FREQUENCY);
  const ragged = raggedFade < 1 ? (valueNoise(worldX * defines.FOAM_RAGGED_FREQUENCY + 31.7, worldZ * defines.FOAM_RAGGED_FREQUENCY + 31.7) - 0.5) * (1 - raggedFade) : 0;
  const density = defines.FOAM_LOG_SCALE * Math.log(foam / defines.FOAM_MID) + defines.FOAM_RAGGED * ragged + defines.FOAM_CLUMP * clump;
  const value = defines.FOAM_LACE_WEIGHT * lace + defines.FOAM_BUBBLE_WEIGHT * bubble + density;
  const change = Math.abs(gradientX * across[0] + gradientY * across[1]) + Math.abs(gradientX * across[2] + gradientY * across[3]);
  const spreadOfFaded = defines.FOAM_LACE_WEIGHT * defines.FOAM_LACE_SPREAD * laceFade + defines.FOAM_BUBBLE_WEIGHT * (defines.FOAM_FINE_SPREAD * fineFade * (1 - coarseFade) + defines.FOAM_UNION_SPREAD * coarseFade)
    + defines.FOAM_CLUMP * defines.FOAM_CLUMP_SPREAD * clumpFade + defines.FOAM_RAGGED * defines.FOAM_CLUMP_SPREAD * raggedFade;
  const width = 0.5 * change + defines.FOAM_FADED_EDGE * spreadOfFaded + 1e-3;
  const winner = coarseWins ? coarse : fine, winnerFade = coarseWins ? coarseFade : fineFade;
  const shade = winner ? mix(resolvedShade(winner), defines.FOAM_FADED_SHADE, winnerFade) : defines.FOAM_FADED_SHADE;
  const wetness = (1 - smoothstep(0.25, defines.FOAM_FILM_PACKED, foam)) * mix(1, 0.75, boilFraction);
  const film = coarse ? mix(filmOpacity(coarse, footprint, defines.FOAM_COARSE_CELL), defines.FOAM_FILM_MEAN, coarseFade) : defines.FOAM_FILM_MEAN;
  return { cover: smoothstep(-width, width, value), opacity: mix(defines.FOAM_THIN_OPACITY, 1, smoothstep(0, defines.FOAM_OPAQUE, value)) * mix(1, film, wetness), shade };
}

const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

// 1. Layer statistics, sampled at random over 4 m².
const seededRandom = (() => { let state = 12345; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; })();
const samples = { lace: [], fine: [], union: [], clump: [], fineShade: [], unionShade: [], film: [] };
for (let index = 0; index < 30000; index++) {
  const worldX = seededRandom() * 2, worldZ = seededRandom() * 2;
  samples.lace.push(sinkLace(laceRaw(worldX, worldZ).raw));
  samples.clump.push(valueNoise(worldX * defines.FOAM_CLUMP_FREQUENCY + 57.3, worldZ * defines.FOAM_CLUMP_FREQUENCY + 57.3) - 0.5);
  const fine = fineCells(worldX, worldZ), coarse = coarseCells(worldX, worldZ);
  const fineBubble = fine.best * defines.FOAM_FINE_CELL / defines.FOAM_BUBBLE_SCALE, coarseBubble = coarse.best * defines.FOAM_COARSE_CELL / defines.FOAM_BUBBLE_SCALE;
  samples.fine.push(clamp(fineBubble, -defines.FOAM_BUBBLE_CLAMP, defines.FOAM_BUBBLE_CLAMP));
  samples.union.push(clamp(Math.max(fineBubble, coarseBubble), -defines.FOAM_BUBBLE_CLAMP, defines.FOAM_BUBBLE_CLAMP));
  samples.fineShade.push(resolvedShade(fine));
  samples.unionShade.push(resolvedShade(coarseBubble > fineBubble ? coarse : fine));
  samples.film.push(filmOpacity(coarse, 0, defines.FOAM_COARSE_CELL));
}
const quantile = (values, share) => { const sorted = [...values].sort((first, second) => first - second); return sorted[Math.floor(share * (sorted.length - 1))]; };
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
console.log('Layer statistics (measured, shader):');
for (const [name, medianName, spreadName] of [['lace', 'FOAM_LACE_MEDIAN', 'FOAM_LACE_SPREAD'], ['fine', 'FOAM_FINE_MEDIAN', 'FOAM_FINE_SPREAD'], ['union', 'FOAM_UNION_MEDIAN', 'FOAM_UNION_SPREAD'], ['clump', null, 'FOAM_CLUMP_SPREAD']]) {
  const median = quantile(samples[name], 0.5), spread = (quantile(samples[name], 0.9) - quantile(samples[name], 0.1)) / 2;
  if (medianName) check(Math.abs(median - defines[medianName]) < 0.1, `${name} median ${median.toFixed(2)}, ${medianName} ${defines[medianName]}`);
  check(Math.abs(spread - defines[spreadName]) < 0.12 * defines[spreadName] + 0.05, `${name} spread ${spread.toFixed(2)}, ${spreadName} ${defines[spreadName]}`);
}
const shadeMean = (mean(samples.fineShade) + mean(samples.unionShade)) / 2;
check(Math.abs(shadeMean - defines.FOAM_FADED_SHADE) < 0.02, `mean resolved shade ${shadeMean.toFixed(3)} (fine ${mean(samples.fineShade).toFixed(3)}, with coarse ${mean(samples.unionShade).toFixed(3)}), FOAM_FADED_SHADE ${defines.FOAM_FADED_SHADE}`);
check(Math.abs(mean(samples.film) - defines.FOAM_FILM_MEAN) < 0.02, `mean film opacity ${mean(samples.film).toFixed(3)}, FOAM_FILM_MEAN ${defines.FOAM_FILM_MEAN}`);

// A bubble's material may drain, but must not change the simulated footprint
// or turn a thick, multilayer boil into transparent holes.
let materialIsBounded = true, freshIsDenser = true, keepsFootprint = true;
for (let index = 0; index < 1000; index++) {
  const worldX = seededRandom() * 2, worldZ = seededRandom() * 2;
  const across = [0.0001, 0, 0, 0.0001];
  const raftLook = foamLook(worldX, worldZ, across, 0.2, true, 0);
  const boilLook = foamLook(worldX, worldZ, across, 0.2, true, 1);
  const denseLook = foamLook(worldX, worldZ, across, 1, true, 1);
  materialIsBounded &&= [raftLook, boilLook, denseLook].every((look) => Number.isFinite(look.opacity) && look.opacity >= 0 && look.opacity <= 1);
  freshIsDenser &&= boilLook.opacity >= raftLook.opacity && denseLook.opacity >= defines.FOAM_THIN_OPACITY;
  keepsFootprint &&= raftLook.cover === boilLook.cover;
}
check(materialIsBounded, 'wet-film opacity stays finite and in [0, 1]');
check(freshIsDenser, 'fresh froth scatters more than a drained raft; thick foam keeps its opaque fill');
check(keepsFootprint, 'the foam population changes material, never coverage');

// 2. A raft seen from the home camera: σ 12 cm, a map value of 0.25 at its centre.
const camera = [0, 1.15, 2.45], impact = [0, 0, -1.4];
const subtract = (first, second) => first.map((value, index) => value - second[index]);
const normalise = (vector) => { const length = Math.hypot(...vector); return vector.map((value) => value / length); };
const cross = (first, second) => [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]];
const dot = (first, second) => first.reduce((sum, value, index) => sum + value * second[index], 0);
const FRAMINGS = {
  'home 1280×720': { width: 1280, height: 720, fov: 48, target: [0, 0.12, -1.0], crop: [240, 90] },
  'phone 780×1688': { width: 780, height: 1688, fov: 62, target: [0, 0.12, -1.0], crop: [300, 120] },
  'close-up 12°': { width: 1280, height: 720, fov: 12, target: impact, crop: [320, 180] },
};
const raft = { sigma: 0.12, centre: 0.25 };
function render(framing, { shift = 0, supersample = 0 } = {}) {
  const forward = normalise(subtract(framing.target, camera));
  const right = normalise(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const focal = framing.height / 2 / Math.tan(framing.fov * Math.PI / 360);
  const toImpact = subtract(impact, camera);
  const depth = dot(toImpact, forward);
  const left = Math.round(framing.width / 2 + dot(toImpact, right) / depth * focal - framing.crop[0] / 2);
  const top = Math.round(framing.height / 2 - dot(toImpact, up) / depth * focal - framing.crop[1] / 2);
  const ground = (pixelX, pixelY) => {
    const ray = normalise(forward.map((value, index) => value + right[index] * (pixelX - framing.width / 2) / focal - up[index] * (pixelY - framing.height / 2) / focal));
    const distance = -camera[1] / ray[1];
    return [camera[0] + ray[0] * distance, camera[2] + ray[2] * distance];
  };
  const image = new Float32Array(framing.crop[0] * framing.crop[1]);
  let coverSum = 0, foamPixels = 0;
  for (let row = 0; row < framing.crop[1]; row++) {
    for (let column = 0; column < framing.crop[0]; column++) {
      const centreX = left + column + 0.5, centreY = top + row + 0.5;
      const point = ground(centreX, centreY), alongX = ground(centreX + 1, centreY), alongY = ground(centreX, centreY + 1);
      const across = [alongX[0] - point[0], alongX[1] - point[1], alongY[0] - point[0], alongY[1] - point[1]];
      const foamAt = (spot) => raft.centre * Math.exp(-((spot[0] - impact[0]) ** 2 + (spot[1] - impact[2]) ** 2) / (2 * raft.sigma ** 2));
      let brightness = 0, cover = 0;
      if (supersample) {
        for (let sampleY = 0; sampleY < supersample; sampleY++) {
          for (let sampleX = 0; sampleX < supersample; sampleX++) {
            const spot = ground(centreX + (sampleX + 0.5) / supersample - 0.5, centreY + (sampleY + 0.5) / supersample - 0.5);
            const foam = foamAt(spot);
            if (foam <= presentThreshold) continue;
            const look = foamLook(spot[0], spot[1] + shift, across.map((value) => value / supersample), foam, true);
            cover += look.cover; brightness += look.cover * look.opacity * look.shade;
          }
        }
        cover /= supersample * supersample; brightness /= supersample * supersample;
      } else {
        const foam = foamAt(point);
        if (foam > presentThreshold) {
          foamPixels++;
          const look = foamLook(point[0], point[1] + shift, across, foam);
          cover = look.cover; brightness = look.cover * look.opacity * look.shade;
        }
      }
      coverSum += cover;
      image[row * framing.crop[0] + column] = brightness;
    }
  }
  return { image, cover: coverSum / image.length, foamPixels };
}
const meanDifference = (first, second) => first.reduce((sum, value, index) => sum + Math.abs(value - second[index]), 0) / first.length;
console.log(`Antialiasing: a raft of σ ${raft.sigma * 100} cm, ${raft.centre} at its centre, seen from the home camera:`);
for (const [name, framing] of Object.entries(FRAMINGS)) {
  cellVisits = 0;
  const shader = render(framing);
  const visitsPerFoamPixel = cellVisits / Math.max(shader.foamPixels, 1);
  const shaderMoved = render(framing, { shift: 0.003 });
  const truth = render(framing, { supersample: 5 });
  const truthMoved = render(framing, { supersample: 5, shift: 0.003 });
  const shimmer = meanDifference(shader.image, shaderMoved.image), truthShimmer = meanDifference(truth.image, truthMoved.image);
  check(Math.abs(shader.cover / truth.cover - 1) < 0.1, `${name}: cover ${shader.cover.toFixed(4)}, supersampled ${truth.cover.toFixed(4)}`);
  check(Math.abs(mean(shader.image) / mean(truth.image) - 1) < 0.1, `${name}: brightness ${mean(shader.image).toFixed(4)}, supersampled ${mean(truth.image).toFixed(4)}`);
  check(shimmer < 1.6 * truthShimmer + 1e-3, `${name}: change when the water moves 3 mm ${shimmer.toFixed(4)}, supersampled ${truthShimmer.toFixed(4)}`);
  console.log(`     ${name}: ${visitsPerFoamPixel.toFixed(1)} cell visits per foam pixel`);
}
// 4. The map's step on the CPU: (total, raft, raft × its lifetime, boil × its
// lifetime) per texel, each texel taking its stencil from where the flows
// brought it, spreading and drifting (Lax–Wendroff), each kind decaying at its
// own lifetime, then the stamps, as FOAM_FRAGMENT does.
const MAP_SIZE = 64, MAP_CELL = 6 / 256;   // a corner of the Medium grid
const SHORTEST_LIFETIME = Number(FOAM_FRAGMENT.match(/#define SHORTEST_LIFETIME ([\d.]+)/)[1]);
const stencil = new Float64Array(20);
const clampIndex = (index) => (index < 0 ? 0 : index > MAP_SIZE - 1 ? MAP_SIZE - 1 : index);
// A texel (clamped to the map, as the target's edge clamps), or with `bilinear` the bilinear sample at a point, into the stencil.
function sampleInto(map, positionX, positionY, offset, bilinear = false) {
  if (!bilinear) {
    const index = (clampIndex(positionY) * MAP_SIZE + clampIndex(positionX)) * 4;
    for (let channel = 0; channel < 4; channel++) stencil[offset + channel] = map[index + channel];
    return;
  }
  const cornerX = Math.floor(positionX), cornerY = Math.floor(positionY);
  const alongX = positionX - cornerX, alongY = positionY - cornerY;
  const left = clampIndex(cornerX), right = clampIndex(cornerX + 1), bottom = clampIndex(cornerY), top = clampIndex(cornerY + 1);
  const lowerLeft = (bottom * MAP_SIZE + left) * 4, lowerRight = (bottom * MAP_SIZE + right) * 4, upperLeft = (top * MAP_SIZE + left) * 4, upperRight = (top * MAP_SIZE + right) * 4;
  for (let channel = 0; channel < 4; channel++) {
    stencil[offset + channel] = (1 - alongY) * ((1 - alongX) * map[lowerLeft + channel] + alongX * map[lowerRight + channel]) + alongY * ((1 - alongX) * map[upperLeft + channel] + alongX * map[upperRight + channel]);
  }
}
function decayed(amount, product, dt) {
  const lifetime = amount > 1e-6 ? product / amount : SHORTEST_LIFETIME;
  const factor = Math.exp(-dt / Math.max(lifetime, SHORTEST_LIFETIME));
  return [amount * factor, product * factor];
}
// flows: { x, y (texels), spread (this step's area over 2π, texels²), core2 (texels²) }; drift: texels this step;
// bilinear reads the stencil around the upstream point bilinearly instead, for comparison.
function mapStep(map, { dt, drift = [0, 0], flows = [], stamps = [], diffusion = true, bilinear = false }) {
  const next = new Float32Array(map.length);
  const rate = diffusion ? Math.min(dt * 4 * FOAM_DIFFUSIVITY / (MAP_CELL * MAP_CELL), 1) : 0;
  for (let row = 0; row < MAP_SIZE; row++) {
    for (let column = 0; column < MAP_SIZE; column++) {
      let positionX = column - drift[0], positionY = row - drift[1], stretch = 1;
      for (const flow of flows) {
        const offsetX = positionX - flow.x, offsetY = positionY - flow.y;
        const distanceSquared = offsetX * offsetX + offsetY * offsetY, reach = distanceSquared + flow.core2;
        const shrink = Math.exp(-flow.spread / reach);
        positionX = flow.x + offsetX * shrink; positionY = flow.y + offsetY * shrink;
        stretch *= shrink * shrink * (1 + 2 * flow.spread * distanceSquared / (reach * reach));
      }
      const nearestX = bilinear ? positionX : Math.floor(positionX + 0.5), nearestY = bilinear ? positionY : Math.floor(positionY + 0.5);
      const withinX = positionX - nearestX, withinY = positionY - nearestY;
      sampleInto(map, nearestX, nearestY, 0, bilinear); sampleInto(map, nearestX + 1, nearestY, 4, bilinear); sampleInto(map, nearestX - 1, nearestY, 8, bilinear);
      sampleInto(map, nearestX, nearestY + 1, 12, bilinear); sampleInto(map, nearestX, nearestY - 1, 16, bilinear);
      const carried = [0, 0, 0, 0];
      for (let channel = 0; channel < 4; channel++) {
        const centre = stencil[channel], east = stencil[4 + channel], west = stencil[8 + channel], north = stencil[12 + channel], south = stencil[16 + channel];
        const interpolated = centre + 0.5 * withinX * (east - west) + 0.5 * withinY * (north - south)
          + 0.5 * withinX * withinX * (east + west - 2 * centre) + 0.5 * withinY * withinY * (north + south - 2 * centre);
        const upstream = Math.min(Math.max(interpolated, Math.min(centre, east, west, north, south)), Math.max(centre, east, west, north, south));
        carried[channel] = Math.max((upstream + rate * (0.25 * (east + west + north + south) - centre)) * stretch, 0);
      }
      let [raft, raftProduct] = decayed(carried[1], carried[2], dt);
      let [boil, boilProduct] = decayed(Math.max(carried[0] - carried[1], 0), carried[3], dt);
      for (const stamp of stamps) {
        const offsetX = column - stamp.x, offsetY = row - stamp.y;
        const added = stamp.amount * Math.exp(-(offsetX * offsetX + offsetY * offsetY) / (2 * stamp.sigma * stamp.sigma)) * Math.max(1 - raft - (stamp.boil ? boil : 0), 0);
        if (stamp.boil) { boil += added; boilProduct += added * stamp.lifetime; } else { raft += added; raftProduct += added * stamp.lifetime; }
      }
      const total = boil + raft, keep = total > 1 ? 1 / total : 1;
      next.set([total * keep, raft * keep, raftProduct * keep, boilProduct * keep], (row * MAP_SIZE + column) * 4);
    }
  }
  return next;
}
function mapMoments(map) {
  let sum = 0, sumX = 0, sumY = 0, spread = 0;
  for (let index = 0; index < MAP_SIZE * MAP_SIZE; index++) { sum += map[index * 4]; sumX += map[index * 4] * (index % MAP_SIZE); sumY += map[index * 4] * Math.floor(index / MAP_SIZE); }
  const meanX = sumX / sum, meanY = sumY / sum;
  for (let index = 0; index < MAP_SIZE * MAP_SIZE; index++) spread += map[index * 4] * ((index % MAP_SIZE - meanX) ** 2 + (Math.floor(index / MAP_SIZE) - meanY) ** 2);
  return { sum, meanX, meanY, rms: Math.sqrt(spread / sum) };
}
const mapMiddle = MAP_SIZE / 2, mapStepSeconds = 1 / 60;
const lastingRaft = (sigma) => mapStep(new Float32Array(MAP_SIZE * MAP_SIZE * 4), { dt: 0, diffusion: false, stamps: [{ x: mapMiddle, y: mapMiddle, sigma: sigma / MAP_CELL, amount: 0.5, lifetime: 1e6 }] });
console.log('The map\'s step (FOAM_FRAGMENT), on the Medium grid:');
{
  // A raft of σ 6 cm under a flow that clears 16 cm, its strength decaying over 0.18 s (a 16 cm stone's fall-back).
  const flowRadius = 0.16, decay = 0.18, area = Math.PI * flowRadius * flowRadius;
  const swept = (bilinear) => {
    let map = lastingRaft(0.06);
    for (let step = 0; step < 60; step++) {
      const share = area * (Math.exp(-step * mapStepSeconds / decay) - Math.exp(-(step + 1) * mapStepSeconds / decay));
      map = mapStep(map, { dt: mapStepSeconds, bilinear, flows: [{ x: mapMiddle, y: mapMiddle, spread: share / (2 * Math.PI * MAP_CELL * MAP_CELL), core2: (FOAM_FLOW.core * flowRadius / MAP_CELL) ** 2 }] });
    }
    let inHole = 0;   // the share of the amount left within 0.6 of the cleared radius
    for (let index = 0; index < MAP_SIZE * MAP_SIZE; index++) if (Math.hypot(index % MAP_SIZE - mapMiddle, Math.floor(index / MAP_SIZE) - mapMiddle) * MAP_CELL < 0.6 * flowRadius) inHole += map[index * 4];
    return { map, inHole: inHole / mapMoments(map).sum };
  };
  const before = mapMoments(lastingRaft(0.06));
  const { map, inHole } = swept(false), bilinearSweep = swept(true);
  const after = mapMoments(map);
  let weightedRadius = 0, inCore = 0;
  for (let index = 0; index < MAP_SIZE * MAP_SIZE; index++) {
    const distance = Math.hypot(index % MAP_SIZE - mapMiddle, Math.floor(index / MAP_SIZE) - mapMiddle) * MAP_CELL;
    weightedRadius += map[index * 4] * distance;
    if (distance < FOAM_FLOW.core * flowRadius) inCore = Math.max(inCore, map[index * 4]);
  }
  let sourceRadius = 0, norm = 0;   // a singular source of that area moves r to sqrt(r² + R²)
  for (let index = 1; index < 4000; index++) { const radius = index * 1e-4, density = radius * Math.exp(-radius * radius / (2 * 0.06 * 0.06)); sourceRadius += density * Math.hypot(radius, flowRadius); norm += density; }
  sourceRadius /= norm;
  let peakBefore = 0, peakAfter = 0;
  const original = lastingRaft(0.06);
  for (let index = 0; index < MAP_SIZE * MAP_SIZE; index++) { peakBefore = Math.max(peakBefore, original[index * 4]); peakAfter = Math.max(peakAfter, map[index * 4]); }
  check(Math.abs(after.sum / before.sum - 1) < 0.06, `a flow keeps the amount: ${(100 * (after.sum / before.sum - 1)).toFixed(2)}% (bilinear samples: ${(100 * (mapMoments(bilinearSweep.map).sum / before.sum - 1)).toFixed(2)}%)`);
  check(peakAfter <= peakBefore + 1e-6, `and brightens nothing: at most ${peakAfter.toFixed(3)} after, ${peakBefore.toFixed(3)} before`);
  check(inCore < 0.01 * 0.5, `a flow clears its core: at most ${inCore.toFixed(4)} left of 0.5`);
  check(Math.abs(weightedRadius / after.sum / sourceRadius - 1) < 0.1, `a flow carries the raft out to ${(100 * weightedRadius / after.sum).toFixed(1)} cm on average (a source of its area: ${(100 * sourceRadius).toFixed(1)} cm)`);
  check(inHole < 0.02, `a flow leaves ${(100 * inHole).toFixed(1)}% of the raft within 0.6 of the radius it clears (bilinear samples: ${(100 * bilinearSweep.inHole).toFixed(1)}%)`);
}
{
  // The same raft drifting with the wind for 8 s (no spreading, to see the drift's own).
  const velocity = [0.45 / Math.hypot(0.45, 0.9) * FOAM_DRIFT, -0.9 / Math.hypot(0.45, 0.9) * FOAM_DRIFT];
  const drifted = (bilinear) => {
    let map = lastingRaft(0.06);
    const before = mapMoments(map);
    for (let step = 0; step < 480; step++) map = mapStep(map, { dt: mapStepSeconds, diffusion: false, bilinear, drift: [velocity[0] * mapStepSeconds / MAP_CELL, velocity[1] * mapStepSeconds / MAP_CELL] });
    const after = mapMoments(map);
    return { moved: Math.hypot(after.meanX - before.meanX, after.meanY - before.meanY) * MAP_CELL, widened: after.rms / before.rms - 1 };
  };
  const laxWendroff = drifted(false), upstream = drifted(true);
  check(Math.abs(laxWendroff.moved / (8 * FOAM_DRIFT) - 1) < 0.02, `the drift moves a raft ${(100 * laxWendroff.moved).toFixed(2)} cm in 8 s (${(800 * FOAM_DRIFT).toFixed(2)} cm at FOAM_DRIFT)`);
  check(laxWendroff.widened < 0.03, `the drift widens it by ${(100 * laxWendroff.widened).toFixed(1)}% (an upstream bilinear sample: ${(100 * upstream.widened).toFixed(1)}%)`);
}
{
  // A boil of 0.4 (τ 0.8 s) over a raft of 0.1 (τ 5 s), wide and even, for 8 s.
  let map = mapStep(new Float32Array(MAP_SIZE * MAP_SIZE * 4), { dt: 0, diffusion: false, stamps: [{ x: mapMiddle, y: mapMiddle, sigma: 1e4, amount: 0.1, lifetime: 5 }, { x: mapMiddle, y: mapMiddle, sigma: 1e4, amount: 0.4, lifetime: 0.8, boil: true }] });
  for (let step = 0; step < 48; step++) map = mapStep(map, { dt: 10 * mapStepSeconds, diffusion: false });
  const exact = 0.1 * Math.exp(-8 / 5) + 0.4 * Math.exp(-8 / 0.8), oneLifetime = 0.5 * Math.exp(-8 / ((0.1 * 5 + 0.4 * 0.8) / 0.5));
  const left = map[(mapMiddle * MAP_SIZE + mapMiddle) * 4];
  check(Math.abs(left / exact - 1) < 0.03, `a boil over a raft leaves ${left.toFixed(4)} after 8 s (each kind at its own lifetime: ${exact.toFixed(4)}; one shared lifetime would leave ${oneLifetime.toFixed(4)})`);
}
if (failures.length) { console.log(`${failures.length} check(s) failed`); process.exit(1); }
console.log('foam pattern and map checks passed');
