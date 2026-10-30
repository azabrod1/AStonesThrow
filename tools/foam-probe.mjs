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
//      layers fade with distance; the coarse bubbles' clear windows darken
//      FOAM_FILM_WINDOWS on average were every shown bubble windowed, and a
//      raft's share or a boil's that share of it, which their fade takes;
//      the 3×3 cell search finds every coarse bubble a point lies in (a
//      5×5 changes almost nothing), and the coarse bubbles lie on no
//      lattice (their structure factor at the grid's step, against the
//      0.135 of the 0.7 jitter they once had);
//   2. at the framings the foam is judged at (the home view at 1280×720, the
//      phone at 390×844 and twice the density, a 12° close-up), for a
//      Gaussian raft at the reference impact point, the share of the pixels
//      the shader's antialiased pattern covers matches a 5×5 supersampled
//      cover of the pattern with nothing faded, within 10%; and moving the
//      water 3 mm under the pixels, as a passing ripple does, changes the
//      shader's image no more than 1.6 times as much as it changes the
//      supersampled one (shimmer would change it far more);
//      also checks mean brightness within 6%, including the wet films
//      (faded foam's opacity lifted to its covered pixels' mean);
//      a breaking wave's churned boil scatters more than a drained raft; a
//      splash's boil on fresh water (FRESH_BOIL, freshBubbles,
//      freshBoilCloud): the surface holds at most FOAM_BOIL_HOLD of it, a
//      faint one whole; its bubbles fill the share of cells they should,
//      their mean white matches the one they fade to (the dome's mean,
//      whose fit over the view's elevation it integrates), and drawn where
//      they start to fade is within 5% of it, and they show no grid: their
//      centres spread over their cells and the white one cell over is no
//      more alike than far apart;
//      the cloud under them is tinted by each Water setting's absorption and
//      its churn spreads wide enough to show;
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
// The foam's defines are in src/shaders/scene.js, the bubble's (FOAM_BUBBLE_*, SURFACE_BUBBLE) in src/shaders/bubble.js.
const shaderSource = ['src/shaders/scene.js', 'src/shaders/bubble.js'].map((file) => readFileSync(path.join(root, file), 'utf8')).join('\n');
const defines = {};
for (const match of shaderSource.matchAll(/^#define (FOAM_\w+) (vec[234]\([^)]*\)|[-\d.e]+)/gm)) {
  defines[match[1]] = match[2].startsWith('vec') ? match[2].slice(5, -1).split(',').map(Number) : Number(match[2]);
}
const required = ['FOAM_BOIL_HOLD', 'FOAM_BUBBLE_CELL', 'FOAM_CLOUD_SCATTER', 'FOAM_CHURN_FREQUENCY', 'FOAM_FINE_CELL', 'FOAM_COARSE_CELL', 'FOAM_LACE_CELL', 'FOAM_LACE_WARP', 'FOAM_BUBBLE_SCALE', 'FOAM_MID', 'FOAM_FADED_SHADE'];
for (const name of required) if (!(name in defines)) throw new Error(`${name} not found in src/shaders/scene.js or bubble.js`);
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
// The ragged outline's noise (raggedNoise in the shader, with no gale: no stretch).
function raggedNoise(worldX, worldZ, coarseFade, fineFade) {
  const coarse = valueNoise(worldX * defines.FOAM_RAGGED_FREQUENCY + 31.7, worldZ * defines.FOAM_RAGGED_FREQUENCY + 31.7) - 0.5;
  const fineFrequency = defines.FOAM_RAGGED_FINE * defines.FOAM_RAGGED_FREQUENCY;
  const turnedX = 0.8 * worldX - 0.6 * worldZ, turnedZ = 0.6 * worldX + 0.8 * worldZ;   // mat2(0.8, 0.6, -0.6, 0.8) times position, column-major
  const fine = valueNoise(turnedX * fineFrequency + 11.9, turnedZ * fineFrequency + 11.9) - 0.5;
  return (1 - defines.FOAM_RAGGED_FINE_WEIGHT) * coarse * (1 - coarseFade) + defines.FOAM_RAGGED_FINE_WEIGHT * fine * (1 - fineFade);
}

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
// foamCells in the shader: the best two features by radius minus distance. The hottest function of the probe (the
// supersampled renders call it 25 times a pixel), so foamHash is computed inline, into locals, and the result is
// kept in locals until the end: the same arithmetic as foamHash and the shader, without an array or an object a visit.
// radii are drawn as mix(radii, u^skew) (the shader's); reach is the search's, 1 for the shader's 3×3 (a wider one
// checks it).
function foamCells(positionX, positionY, radii, jitter, seed, skew = 1, reach = 1) {
  const cellX = Math.floor(positionX), cellY = Math.floor(positionY);
  const withinX = positionX - cellX, withinY = positionY - cellY;
  const smallest = radii[0], radiusSpan = radii[1] - radii[0];
  let best = -10, runnerUp = -10, bestX = 1, bestY = 0, runnerUpX = 1, runnerUpY = 0, bestRadius = 1, bestKeyOut = 0;
  let bestKey = 0, runnerUpKey = 0;
  for (let row = -reach; row <= reach; row++) {
    for (let column = -reach; column <= reach; column++) {
      cellVisits++;
      // foamHash(cellX + column + seed[0], cellY + row + seed[1]), inline.
      const hashX = cellX + column + seed[0], hashY = cellY + row + seed[1];
      let first = fract(hashX * 0.1031), second = fract(hashY * 0.1030), third = fract(hashX * 0.0973);
      const mixed = first * (second + 33.33) + second * (first + 33.33) + third * (third + 33.33);
      first += mixed; second += mixed; third += mixed;
      const randomX = fract((first + second) * third), randomY = fract((first + third) * second), randomZ = fract((second + third) * first);
      const offsetX = withinX - column - 0.5 - jitter * (randomX - 0.5);
      const offsetY = withinY - row - 0.5 - jitter * (randomY - 0.5);
      const radius = smallest + radiusSpan * (skew === 1 ? randomZ : randomZ ** skew);
      const inside = radius - Math.sqrt(offsetX * offsetX + offsetY * offsetY);
      if (inside > best) {
        runnerUp = best; runnerUpX = bestX; runnerUpY = bestY;
        best = inside; bestX = offsetX; bestY = offsetY; bestRadius = radius; bestKeyOut = fract((randomX + randomY) * 7.31);
        runnerUpKey = bestKey; bestKey = randomZ;
      } else if (inside > runnerUp) {
        runnerUp = inside; runnerUpX = offsetX; runnerUpY = offsetY;
        runnerUpKey = randomZ;
      }
    }
  }
  return { best, runnerUp, bestX, bestY, runnerUpX, runnerUpY, bestRadius, edgeKey: bestKey + runnerUpKey, bestKey: bestKeyOut };
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
  const ready = mix(1 - defines.FOAM_LACE_READY, 1 + defines.FOAM_LACE_READY, cells.bestKey);
  return { raw, ready, gradientX, gradientY };
}
// Below 0 the lace sinks smoothly toward -FOAM_LACE_DEPTH, as fast as the cell is ready.
const sinkLace = (raw, ready) => raw > 0 ? raw : defines.FOAM_LACE_DEPTH * (Math.exp(raw * ready / defines.FOAM_LACE_DEPTH) - 1);
const fineCells = (worldX, worldZ) => foamCells(worldX / defines.FOAM_FINE_CELL, worldZ / defines.FOAM_FINE_CELL, defines.FOAM_FINE_RADII, defines.FOAM_BUBBLE_JITTER, [11.0, 18.7]);
const coarseCells = (worldX, worldZ, { jitter = defines.FOAM_BUBBLE_JITTER, reach = 1 } = {}) => foamCells(worldX / defines.FOAM_COARSE_CELL, worldZ / defines.FOAM_COARSE_CELL, defines.FOAM_COARSE_RADII, jitter, [23.0, 39.1], defines.FOAM_COARSE_SKEW, reach);
// The bubbles' value in the pattern's units (FOAM_BUBBLE_SCALE), a layer's best over its cell size, unclamped.
const bubbleValue = (cells, cellSize) => cells.best * cellSize / defines.FOAM_BUBBLE_SCALE;
// A coarse bubble's window, as foamLook draws it (the shader's end of foamLook): its film's opacity at the point, a
// share of the coarse bubbles windowed, where the coarse bubble shows over the fine (coarseBubble, fineBubble: the
// layers' values there), a pixel of `footprint` metres.
function windowFilm(coarse, coarseBubble, fineBubble, footprint, share) {
  const chosen = share >= coarse.bestKey ? 1 : 0;   // step(bestKey, share)
  const windowRadius = mix(defines.FOAM_WINDOW_SIZE[0], defines.FOAM_WINDOW_SIZE[1], fract(coarse.bestKey * 47.3));
  const filmWidth = Math.max(footprint / (defines.FOAM_COARSE_CELL * coarse.bestRadius), 0.04);
  const filmRadius = Math.hypot(coarse.bestX, coarse.bestY) / coarse.bestRadius;
  const centre = 1 - smoothstep(windowRadius - defines.FOAM_WINDOW_SOFT - filmWidth, windowRadius + defines.FOAM_WINDOW_SOFT + filmWidth, filmRadius);
  const pixelInBubbles = Math.max(footprint / defines.FOAM_BUBBLE_SCALE, 1e-3);
  const shows = smoothstep(-pixelInBubbles, pixelInBubbles, coarseBubble - fineBubble);
  return 1 - (1 - defines.FOAM_FILM_CENTRE) * centre * chosen * shows;
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
  const fineFade = fadeOf(defines.FOAM_FINE_CELL), coarseFade = fadeOf(defines.FOAM_COARSE_CELL);
  // A boil takes no lace (the shader's FOAM_LACE_BOIL_FROM/TO): its lace layer is held unresolved, bubbles alone.
  const laceFade = Math.max(fadeOf(defines.FOAM_LACE_CELL), smoothstep(defines.FOAM_LACE_BOIL_FROM, defines.FOAM_LACE_BOIL_TO, boilFraction));
  let gradientX = 0, gradientY = 0;
  let lace = defines.FOAM_LACE_MEDIAN;
  if (laceFade < 1) {
    const sample = laceRaw(worldX, worldZ);
    const sink = Math.exp(Math.min(sample.raw, 0) * sample.ready / defines.FOAM_LACE_DEPTH);
    lace = mix(sinkLace(sample.raw, sample.ready), defines.FOAM_LACE_MEDIAN, laceFade);
    const weight = defines.FOAM_LACE_WEIGHT * (1 - laceFade) * sink * (sample.raw > 0 ? 1 : sample.ready);
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
  const clumpFineFade = resolveAll ? 0 : smoothstep(defines.FOAM_FADE_START, defines.FOAM_FADE_END, footprint * defines.FOAM_CLUMP_FREQUENCY * defines.FOAM_CLUMP_FINE);
  let clump = 0;
  if (clumpFade < 1) {
    const coarseWeight = 1 - defines.FOAM_CLUMP_FINE_WEIGHT;
    const noise = valueNoiseWithGradient(worldX * defines.FOAM_CLUMP_FREQUENCY + 57.3, worldZ * defines.FOAM_CLUMP_FREQUENCY + 57.3);
    clump = (noise.value - 0.5) * (1 - clumpFade) * coarseWeight;
    gradientX += defines.FOAM_CLUMP * defines.FOAM_CLUMP_FREQUENCY * (1 - clumpFade) * coarseWeight * noise.gradientX;
    gradientY += defines.FOAM_CLUMP * defines.FOAM_CLUMP_FREQUENCY * (1 - clumpFade) * coarseWeight * noise.gradientY;
    if (clumpFineFade < 1) {
      // The finer octave, turned by mat2(0.8, 0.6, -0.6, 0.8): position' = (0.8x − 0.6z, 0.6x + 0.8z); its gradient turned back.
      const fineFrequency = defines.FOAM_CLUMP_FINE * defines.FOAM_CLUMP_FREQUENCY;
      const fine = valueNoiseWithGradient((0.8 * worldX - 0.6 * worldZ) * fineFrequency + 23.7, (0.6 * worldX + 0.8 * worldZ) * fineFrequency + 23.7);
      const fineWeight = defines.FOAM_CLUMP * fineFrequency * (1 - clumpFineFade) * defines.FOAM_CLUMP_FINE_WEIGHT;
      clump += (fine.value - 0.5) * (1 - clumpFineFade) * defines.FOAM_CLUMP_FINE_WEIGHT;
      gradientX += fineWeight * (0.8 * fine.gradientX + 0.6 * fine.gradientY);
      gradientY += fineWeight * (-0.6 * fine.gradientX + 0.8 * fine.gradientY);
    }
  }
  const raggedFade = resolveAll ? 0 : smoothstep(defines.FOAM_FADE_START, defines.FOAM_FADE_END, footprint * defines.FOAM_RAGGED_FREQUENCY);
  const raggedFineFade = resolveAll ? 0 : smoothstep(defines.FOAM_FADE_START, defines.FOAM_FADE_END, footprint * defines.FOAM_RAGGED_FREQUENCY * defines.FOAM_RAGGED_FINE);
  const ragged = raggedFade < 1 ? raggedNoise(worldX, worldZ, raggedFade, raggedFineFade) : 0;
  const density = defines.FOAM_LOG_SCALE * Math.log(foam / defines.FOAM_MID) + defines.FOAM_RAGGED * ragged + defines.FOAM_CLUMP * clump;
  const value = defines.FOAM_LACE_WEIGHT * lace + defines.FOAM_BUBBLE_WEIGHT * bubble + density;
  const change = Math.abs(gradientX * across[0] + gradientY * across[1]) + Math.abs(gradientX * across[2] + gradientY * across[3]);
  const spreadOfFaded = defines.FOAM_LACE_WEIGHT * defines.FOAM_LACE_SPREAD * laceFade + defines.FOAM_BUBBLE_WEIGHT * (defines.FOAM_FINE_SPREAD * fineFade * (1 - coarseFade) + defines.FOAM_UNION_SPREAD * coarseFade)
    + defines.FOAM_CLUMP * defines.FOAM_CLUMP_SPREAD * ((1 - defines.FOAM_CLUMP_FINE_WEIGHT) * clumpFade + defines.FOAM_CLUMP_FINE_WEIGHT * clumpFineFade)
    + defines.FOAM_RAGGED * defines.FOAM_CLUMP_SPREAD * ((1 - defines.FOAM_RAGGED_FINE_WEIGHT) * raggedFade + defines.FOAM_RAGGED_FINE_WEIGHT * raggedFineFade);
  const width = 0.5 * change + defines.FOAM_FADED_EDGE * spreadOfFaded + 1e-3;
  const winner = coarseWins ? coarse : fine, winnerFade = coarseWins ? coarseFade : fineFade;
  const shade = winner ? mix(resolvedShade(winner), defines.FOAM_FADED_SHADE, winnerFade) : defines.FOAM_FADED_SHADE;
  const wetness = 1 - smoothstep(0.25, defines.FOAM_FILM_PACKED, foam);
  const windowShare = mix(defines.FOAM_WINDOW_SHARE[0], defines.FOAM_WINDOW_SHARE[1], boilFraction);
  const fadedFilm = 1 - windowShare * defines.FOAM_FILM_WINDOWS;
  // Each window fades by its own size (the shader's windowFade).
  const windowFade = coarse && !resolveAll ? smoothstep(defines.FOAM_FADE_START, defines.FOAM_FADE_END, footprint / (2 * mix(defines.FOAM_WINDOW_SIZE[0], defines.FOAM_WINDOW_SIZE[1], fract(coarse.bestKey * 47.3)) * coarse.bestRadius * defines.FOAM_COARSE_CELL)) : 0;
  const film = coarse ? mix(windowFilm(coarse, coarseBubble, fineBubble, footprint, windowShare), fadedFilm, Math.max(coarseFade, windowFade)) : fadedFilm;
  // The faded value lifted for the opacity (the shader's FOAM_OPACITY_LIFT).
  const cover = smoothstep(-width, width, value);
  const lift = defines.FOAM_OPACITY_LIFT * spreadOfFaded * (1 - cover);
  return { cover, opacity: mix(defines.FOAM_THIN_OPACITY, 1, smoothstep(0, defines.FOAM_OPAQUE, value + lift)) * mix(1, film, wetness), shade };
}

const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

// 1. Layer statistics, sampled at random over 4 m².
const seededRandom = (() => { let state = 12345; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; })();
const samples = { lace: [], fine: [], union: [], clump: [], fineShade: [], unionShade: [], windows: [], raftWindows: [], boilWindows: [] };
for (let index = 0; index < 30000; index++) {
  const worldX = seededRandom() * 2, worldZ = seededRandom() * 2;
  { const lace = laceRaw(worldX, worldZ); samples.lace.push(sinkLace(lace.raw, lace.ready)); }
  samples.clump.push(valueNoise(worldX * defines.FOAM_CLUMP_FREQUENCY + 57.3, worldZ * defines.FOAM_CLUMP_FREQUENCY + 57.3) - 0.5);
  const fine = fineCells(worldX, worldZ), coarse = coarseCells(worldX, worldZ);
  const fineBubble = fine.best * defines.FOAM_FINE_CELL / defines.FOAM_BUBBLE_SCALE, coarseBubble = coarse.best * defines.FOAM_COARSE_CELL / defines.FOAM_BUBBLE_SCALE;
  samples.fine.push(clamp(fineBubble, -defines.FOAM_BUBBLE_CLAMP, defines.FOAM_BUBBLE_CLAMP));
  samples.union.push(clamp(Math.max(fineBubble, coarseBubble), -defines.FOAM_BUBBLE_CLAMP, defines.FOAM_BUBBLE_CLAMP));
  samples.fineShade.push(resolvedShade(fine));
  samples.unionShade.push(resolvedShade(coarseBubble > fineBubble ? coarse : fine));
  // Resolved (no fade): every shown coarse bubble windowed, then a raft's share and a boil's.
  const coarseValue = bubbleValue(coarse, defines.FOAM_COARSE_CELL), fineValue = bubbleValue(fine, defines.FOAM_FINE_CELL);
  samples.windows.push(1 - windowFilm(coarse, coarseValue, fineValue, 0, 1));
  samples.raftWindows.push(1 - windowFilm(coarse, coarseValue, fineValue, 0, defines.FOAM_WINDOW_SHARE[0]));
  samples.boilWindows.push(1 - windowFilm(coarse, coarseValue, fineValue, 0, defines.FOAM_WINDOW_SHARE[1]));
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
// The windows' darkening, every shown coarse bubble windowed, is the fade's FOAM_FILM_WINDOWS; a share of them darkens
// as that share of it (a bubble's key chooses it independently of its window's size), so the fade, 1 − share·it,
// holds for a raft's share and a boil's alike.
const windowsMean = mean(samples.windows);
check(Math.abs(windowsMean - defines.FOAM_FILM_WINDOWS) < 0.01, `the windows darken ${windowsMean.toFixed(3)} on average were every shown coarse bubble windowed, FOAM_FILM_WINDOWS ${defines.FOAM_FILM_WINDOWS}`);
for (const [name, share, values] of [['a raft', defines.FOAM_WINDOW_SHARE[0], samples.raftWindows], ['a boil', defines.FOAM_WINDOW_SHARE[1], samples.boilWindows]]) {
  check(Math.abs(mean(values) - share * windowsMean) < 0.1 * share * windowsMean + 0.003, `${name}'s windows (a share of ${share}) darken ${mean(values).toFixed(4)} on average, ${share} of every bubble's ${(share * windowsMean).toFixed(4)}: its fade holds`);
}
// The 3×3 search finds every disc over a point (the shader's header): what a 5×5 search finds that it misses, by the
// coarse layer's value as the pattern takes it (clamped), and by its best at all.
{
  let changedValue = 0, changedBest = 0;
  const trials = 40000;
  for (let index = 0; index < trials; index++) {
    const worldX = seededRandom() * 2, worldZ = seededRandom() * 2;
    const narrow = coarseCells(worldX, worldZ), wide = coarseCells(worldX, worldZ, { reach: 2 });
    if (wide.best !== narrow.best) changedBest++;
    const clampValue = (cells) => clamp(bubbleValue(cells, defines.FOAM_COARSE_CELL), -defines.FOAM_BUBBLE_CLAMP, defines.FOAM_BUBBLE_CLAMP);
    if (Math.abs(clampValue(wide) - clampValue(narrow)) > 1e-9) changedValue++;
  }
  check(changedValue / trials < 1e-3, `the 3×3 search finds every coarse bubble a point lies in: a 5×5 changes the clamped value at ${(100 * changedValue / trials).toFixed(3)}% of points (its best at ${(100 * changedBest / trials).toFixed(3)}%, deep in the gaps)`);
}
// No lattice (the shader's header): the coarse bubbles' centres, a grid jittered over j of a cell, keep sinc²(πj) of
// the grid's peaks, measured as the structure factor |mean e^(2πi·x)|² of their places within their cells at the
// grid's first harmonic, along each axis: about 0.135 at the 0.7 they once had (rows of them, close up), and only the
// sampling's 1/N with centres anywhere in their cells.
{
  const cells = 20000;
  const structure = (jitter) => {
    let realX = 0, imaginaryX = 0, realY = 0, imaginaryY = 0;
    for (let index = 0; index < cells; index++) {
      const cellX = Math.floor(seededRandom() * 4000) - 2000, cellY = Math.floor(seededRandom() * 4000) - 2000;
      const random = foamHash(cellX + 23.0, cellY + 39.1);   // coarseCells's seed
      const placeX = 0.5 + jitter * (random[0] - 0.5), placeY = 0.5 + jitter * (random[1] - 0.5);
      realX += Math.cos(2 * Math.PI * placeX); imaginaryX += Math.sin(2 * Math.PI * placeX);
      realY += Math.cos(2 * Math.PI * placeY); imaginaryY += Math.sin(2 * Math.PI * placeY);
    }
    return Math.max((realX ** 2 + imaginaryX ** 2) / cells ** 2, (realY ** 2 + imaginaryY ** 2) / cells ** 2);
  };
  const now = structure(defines.FOAM_BUBBLE_JITTER), lattice = structure(0.7);
  check(now < 0.002 && lattice > 0.1, `the coarse bubbles lie on no lattice: their structure factor at the grid's step ${now.toFixed(4)} (sampling alone gives about ${(1 / cells).toFixed(4)}; jittered over 0.7 of a cell, as they were, ${lattice.toFixed(3)})`);
}

// A bubble's material may drain, but must not turn a thick, multilayer boil
// into transparent holes; and a boil, drawn from the bubble layers with its
// lace held at the lace's median, must cover about what a raft of the same
// map value does (the structure changes, the footprint hardly). The boil
// foamLook draws is a breaking wave's (the gale's whitecaps, a splash's boil
// never: it is drawn as its surface's bubbles and the cloud under them,
// below): churned froth, many small bubbles packed layers deep, which
// scatters more than a drained raft's single layer of films.
let materialIsBounded = true, denseKeepsFill = true, raftCover = 0, boilCover = 0, raftOpacity = 0, boilOpacity = 0;
for (let index = 0; index < 1000; index++) {
  const worldX = seededRandom() * 2, worldZ = seededRandom() * 2;
  const across = [0.0001, 0, 0, 0.0001];
  const raftLook = foamLook(worldX, worldZ, across, 0.2, true, 0);
  const boilLook = foamLook(worldX, worldZ, across, 0.2, true, 1);
  const denseLook = foamLook(worldX, worldZ, across, 1, true, 1);
  materialIsBounded &&= [raftLook, boilLook, denseLook].every((look) => Number.isFinite(look.opacity) && look.opacity >= 0 && look.opacity <= 1);
  denseKeepsFill &&= denseLook.opacity >= defines.FOAM_THIN_OPACITY;
  raftCover += raftLook.cover / 1000;
  boilCover += boilLook.cover / 1000;
  raftOpacity += raftLook.opacity * raftLook.cover / 1000;   // the foam's opacity where there is foam
  boilOpacity += boilLook.opacity * boilLook.cover / 1000;
}
check(materialIsBounded, 'wet-film opacity stays finite and in [0, 1]');
check(boilOpacity / boilCover >= raftOpacity / raftCover && denseKeepsFill, `a breaking wave's churned froth scatters more than a drained raft (opacity ${(boilOpacity / boilCover).toFixed(3)} against ${(raftOpacity / raftCover).toFixed(3)}); thick foam keeps its opaque fill`);
check(Math.abs(raftCover - boilCover) < 0.06, `a boil's bubbles cover about what a raft's lace does at the same map value (raft ${raftCover.toFixed(3)}, boil ${boilCover.toFixed(3)})`);

// A splash's boil on fresh water (FRESH_BOIL, freshBubbles and
// freshBoilCloud in src/shaders/scene.js, whose twins these are: change
// both). The surface's share rises with the boil to FOAM_BOIL_HOLD and no
// further, all of a faint boil, a pebble's fizz. Its bubbles: alive in
// filled²·FOAM_BUBBLE_MOST of the cells; each a dome on the water
// (SURFACE_BUBBLE, src/shaders/bubble.js), whose mean white per unit of water under it, seen from
// any elevation, the shader's fit (FOAM_BUBBLE_MEAN_FIT) matches within 2%
// of the integral; their mean white over many cells and moments, seen from
// straight above, is the white they fade to when unresolved, and drawn
// (each pixel the film's mean over the radii within half a pixel of it, a
// square pixel's, SURFACE_BUBBLE's bubbleFilm) at the footprint where they
// start to fade it is within 5% of the same places point-sampled (the
// bubbles under a pixel lose some), so a boil keeps its strength with
// distance; their centres spread over their cells (no lattice), and one
// cell over, the white is no more alike than anywhere else (no grid). The
// deep cloud's colour, per Water
// setting (WATER_CLARITIES in src/main.js), is the Kubelka–Munk R∞ of the
// water's absorption against the cloud's scattering: pale, never brighter
// than white, losing most where the water absorbs most. The churn's
// stretched noise is centred (median about 0.5), so a thin cloud keeps its
// mean light, and spreads wide enough to show as lumps.
{
  const surfaceShare = (boil) => boil * (1 + (boil / defines.FOAM_BOIL_HOLD) ** 4) ** -0.25;
  const shares = [0.25, 0.5, 1, 2, 5, 20, 100].map((times) => surfaceShare(times * defines.FOAM_BOIL_HOLD));
  const rising = shares.every((share, index) => index === 0 || share > shares[index - 1]);
  check(rising && Math.abs(shares.at(-1) / defines.FOAM_BOIL_HOLD - 1) < 0.01, `the surface's share rises with the boil to ${shares.at(-1).toFixed(4)} at 100 times FOAM_BOIL_HOLD (${defines.FOAM_BOIL_HOLD}), ${(shares[4] / defines.FOAM_BOIL_HOLD).toFixed(3)} of it at 5 times`);
  const faint = surfaceShare(0.5 * defines.FOAM_BOIL_HOLD) / (0.5 * defines.FOAM_BOIL_HOLD);
  check(faint > 0.98, `a boil of half that is ${(100 * faint).toFixed(1)}% surface: a faint fizz has no cloud to speak of`);

  const [smallest, largest] = defines.FOAM_BUBBLE_RADII;
  const aliveShare = (filled) => defines.FOAM_BUBBLE_MOST * clamp(filled * filled, 0, 1);
  // The film (SURFACE_BUBBLE): the cap's white times what it mirrors (bubbleSky: the sky where the reflected ray
  // rises, bright at the horizon and falling to FOAM_BUBBLE_ZENITH at the zenith, the water's share where it falls), and the Fresnel's rise (1 − cosθ)⁴ to the edge's white, mirroring the
  // water except its edge-on glow, which rises as the Fresnel does (bubbleRise).
  const capWhite = defines.FOAM_BUBBLE_CAP_WHITE, edgeWhite = defines.FOAM_BUBBLE_EDGE_WHITE, mirror = defines.FOAM_BUBBLE_WATER_MIRROR;
  const bubbleSky = (reflectedUp) => {
    const skyRadiance = mix(1, defines.FOAM_BUBBLE_ZENITH, smoothstep(defines.FOAM_BUBBLE_ZENITH_FROM, defines.FOAM_BUBBLE_ZENITH_TO, reflectedUp));
    return mix(mirror, skyRadiance, smoothstep(defines.FOAM_BUBBLE_SKY_FROM, defines.FOAM_BUBBLE_SKY_TO, reflectedUp));
  };
  const bubbleRise = (cosTheta) => (edgeWhite - capWhite) * (1 - cosTheta) ** 4 * (mirror + (1 - mirror) * (1 - cosTheta) ** 4);
  // The dome's mean white per unit of the water under it, seen from an elevation of that sine (SURFACE_BUBBLE's header):
  // the sphere's screen disc less what lies under the water, integrated by screen area (screen y up, the view tilted by
  // the elevation, so a hit's normal rises by cosθ·sinβ + y·cosβ), spread over 1/sinβ as much water.
  const domeMean = (sinElevation) => {
    const cosElevation = Math.sqrt(1 - sinElevation * sinElevation);
    const steps = 300;
    let sum = 0;
    for (let row = 0; row < steps; row++) {
      for (let column = 0; column < steps; column++) {
        const screenX = ((column + 0.5) / steps) * 2 - 1, screenY = ((row + 0.5) / steps) * 2 - 1;
        const radiusSquared = screenX * screenX + screenY * screenY;
        if (radiusSquared > 1) continue;
        const cosTheta = Math.sqrt(1 - radiusSquared);
        const height = cosTheta * sinElevation + screenY * cosElevation;
        if (height < 0) continue;
        sum += capWhite * bubbleSky(2 * cosTheta * height - sinElevation) + bubbleRise(cosTheta);
      }
    }
    return (sum / (steps * steps)) * 4 / Math.PI / sinElevation;
  };
  const fit = defines.FOAM_BUBBLE_MEAN_FIT;
  const fittedMean = (sinElevation) => {
    const sine = Math.max(sinElevation, defines.FOAM_BUBBLE_LOWEST_VIEW);
    return (fit[0] + fit[1] * sine + fit[2] * sine ** 2 + fit[3] * sine ** 3 + defines.FOAM_BUBBLE_MEAN_FIT_QUARTIC * sine ** 4) / sine;
  };
  {
    const sines = [0.15, 0.2, 0.3, 0.5, 0.7, 1];
    const worst = Math.max(...sines.map((sine) => Math.abs(fittedMean(sine) / domeMean(sine) - 1)));
    check(worst < 0.02, `the dome's mean white, FOAM_BUBBLE_MEAN_FIT, fits its integral within ${(100 * worst).toFixed(1)}% over sinβ ${sines[0]} to 1 (${domeMean(1).toFixed(3)} of the edge white from straight above, ${domeMean(Math.sin(20 * Math.PI / 180)).toFixed(3)} at 20°)`);
  }
  // The biggest bubbles rise with the cloud under the boil (in holds; FOAM_BUBBLE_FAINT_RADIUS with none), so the
  // mean base does too, and the bubbles fade where their cells, taken as small as they are, shrink toward a pixel.
  const largestAt = (cloud) => mix(defines.FOAM_BUBBLE_FAINT_RADIUS, largest, smoothstep(0, defines.FOAM_BUBBLE_FULL_CLOUD, cloud));
  const fadeStartAt = (cloud) => defines.FOAM_FADE_START * defines.FOAM_BUBBLE_CELL * largestAt(cloud) / largest;
  const meanWhite = (filled, cloud = 0) => {
    const spanAt = largestAt(cloud) - smallest;
    return aliveShare(filled) * Math.PI * (smallest * smallest + 2 * smallest * spanAt / 3 + spanAt * spanAt / 5) * domeMean(1) * (1 - 0.5 * defines.FOAM_BUBBLE_RISE);
  };
  // ∫(1 − cosθ)⁴ and ∫(1 − cosθ)⁸ over the area u = r² from the centre (bubbleFilmArea): over w = 1 − sqrt(1 − u),
  // 2(w⁵/5 − w⁶/6) and 2(w⁹/9 − w¹⁰/10).
  const filmArea = (area) => { const edgeOn = 1 - Math.sqrt(1 - Math.min(area, 1)); return [2 * (edgeOn ** 5 / 5 - edgeOn ** 6 / 6), 2 * (edgeOn ** 9 / 9 - edgeOn ** 10 / 10)]; };
  // bubbleFilm's white over the radii from inner to outer, seen from straight above (bubbleWhite): the cap's white
  // mirrors the window of sky at the pixel's own radius, the Fresnel's rise the water and its edge-on glow, both in
  // closed form over the span.
  const filmBetween = (inner, outer, radial) => {
    const innerArea = inner * inner, outerArea = outer * outer, spanArea = outerArea - innerArea;
    const [fourthOuter, eighthOuter] = filmArea(outerArea), [fourthInner, eighthInner] = filmArea(innerArea);
    const rise = mirror * (fourthOuter - fourthInner) + (1 - mirror) * (eighthOuter - eighthInner);
    const cosTheta = Math.sqrt(1 - Math.min(radial, 1) ** 2);
    return (capWhite * (Math.min(outerArea, 1) - Math.min(innerArea, 1)) * bubbleSky(2 * cosTheta * cosTheta - 1) + (edgeWhite - capWhite) * rise) / spanArea;
  };
  // Point-sampled from straight above at a radius (radii) on the sphere, whose normal is up by cosθ = sqrt(1 − r²), so
  // the reflected ray rises 2cos²θ − 1: the sky over the middle of the cap, the water past 45° out, the edge's glow at the limb.
  const whiteFromAbove = (radial) => {
    const cosTheta = Math.sqrt(1 - Math.min(radial, 1) ** 2);
    return capWhite * bubbleSky(2 * cosTheta * cosTheta - 1) + bubbleRise(cosTheta);
  };
  // freshBubbles resolved, seen from straight above (where the ray cast at the dome, bubbleDome, meets the sphere at
  // the disc's own radius and the water cuts nothing away), at a point (metres) and time (s), point-sampled or, given
  // a pixel's footprint (metres), as drawn there; also whether its cell's bubble is alive, and where its centre lies
  // in its cell (0 to 1 each way); cloud, the cloud under the boil in holds, sizes the biggest bubbles.
  const bubbleAt = (worldX, worldZ, filled, time, footprint = 0, cloud = 0) => {
    const inCellsX = worldX / defines.FOAM_BUBBLE_CELL, inCellsZ = worldZ / defines.FOAM_BUBBLE_CELL;
    // Alternate rows of cells are shifted half a cell.
    const rowShift = 0.5 * (((Math.floor(inCellsZ) % 2) + 2) % 2);
    const cellX = Math.floor(inCellsX + rowShift), cellZ = Math.floor(inCellsZ);
    const clock = time / defines.FOAM_BUBBLE_LIFE + foamHash(cellX + 41, cellZ + 7)[0];
    const generation = Math.floor(clock), age = clock - generation;
    const shape = foamHash(cellX + generation * 17, cellZ + generation * 31);
    const place = foamHash(cellX + generation * 29 + 5, cellZ + generation * 13 + 61);
    const grown = mix(smallest, largestAt(cloud), shape[1] * shape[1]);
    const radius = grown * smoothstep(0, defines.FOAM_BUBBLE_RISE, age);
    // Its centre: anywhere in its cell that keeps its grown base inside.
    const within = { x: mix(grown, 1 - grown, place[0]), z: mix(grown, 1 - grown, place[1]) };
    const centreX = cellX + within.x - rowShift, centreZ = cellZ + within.z;
    const radial = Math.hypot(inCellsX - centreX, inCellsZ - centreZ) / Math.max(radius, 1e-4);
    const alive = shape[2] <= aliveShare(filled);
    if (!alive) return { alive, white: 0, within };
    if (footprint > 0) {
      const edge = footprint / defines.FOAM_BUBBLE_CELL / Math.max(radius, 1e-3);
      return { alive, white: filmBetween(Math.max(radial - 0.5 * edge, 0), radial + 0.5 * edge, radial), within };
    }
    return { alive, white: radial < 1 ? whiteFromAbove(radial) : 0, within };
  };
  {
    // The centres' spread over their cells: an even spread over a whole cell is 1/sqrt(12) = 0.289 of it rms from the
    // middle, and a bubble's own radius keeps it from the edges (the mean radius is 0.17 of a cell: about 0.19); held
    // to the middle fifth, as every centre once was so that the biggest fitted, they were 0.058, a lattice.
    let sum = 0, sumSquared = 0;
    const samples = 20000;
    for (let index = 0; index < samples; index++) {
      const cellX = Math.floor(seededRandom() * 400), cellZ = Math.floor(seededRandom() * 400);
      const { within } = bubbleAt((cellX + 0.5) * defines.FOAM_BUBBLE_CELL, (cellZ + 0.5) * defines.FOAM_BUBBLE_CELL, 1, seededRandom() * 30);
      sum += within.x - 0.5;
      sumSquared += (within.x - 0.5) ** 2;
    }
    const spread = Math.sqrt(sumSquared / samples - (sum / samples) ** 2);
    check(spread > 0.17, `the bubbles' centres spread over their cells, ${spread.toFixed(3)} of a cell rms from the middle (an even spread over the whole cell would be 0.289, their own radius from its edges about 0.19; on the lattice they were 0.058)`);
  }
  // Over a deep cloud (the boil's middle, bubbles of every size) and a fizz with none (small ones).
  for (const [filled, cloud] of [[1, 3], [0.5, 3], [1, 0]]) {
    let aliveCells = 0, whiteSum = 0;
    const samples = 400000;   // the white of a faint boil is in a few small rims: enough samples to hold its noise under a few per cent
    for (let index = 0; index < samples; index++) {
      const cellX = Math.floor(seededRandom() * 400), cellZ = Math.floor(seededRandom() * 400), time = seededRandom() * 30;
      aliveCells += bubbleAt((cellX + 0.5) * defines.FOAM_BUBBLE_CELL, (cellZ + 0.5) * defines.FOAM_BUBBLE_CELL, filled, time, 0, cloud).alive ? 1 : 0;
      whiteSum += bubbleAt(seededRandom() * 4.8, seededRandom() * 4.8, filled, time, 0, cloud).white;
    }
    const aliveMeasured = aliveCells / samples, whiteMeasured = whiteSum / samples;
    const where = `at ${filled} of the hold over a cloud of ${cloud} holds`;
    check(Math.abs(aliveMeasured / aliveShare(filled) - 1) < 0.05, `${where}, bubbles in ${(100 * aliveMeasured).toFixed(1)}% of the cells (${(100 * aliveShare(filled)).toFixed(1)}%: filled²·FOAM_BUBBLE_MOST)`);
    check(Math.abs(whiteMeasured / meanWhite(filled, cloud) - 1) < 0.1, `${where}, the bubbles' mean white ${whiteMeasured.toFixed(5)}, the white they fade to ${meanWhite(filled, cloud).toFixed(5)}`);
  }
  {
    // Drawn where the fade starts (FOAM_FADE_START cells a pixel), against point samples of the same places: a bubble
    // under a pixel loses some (SURFACE_BUBBLE), but most of the white is in the big ones.
    for (const cloud of [3, 0]) {
      const fadeStart = fadeStartAt(cloud);
      let pointSum = 0, drawnSum = 0;
      for (let index = 0; index < 200000; index++) {
        const worldX = seededRandom() * 4.8, worldZ = seededRandom() * 4.8, time = seededRandom() * 30;
        pointSum += bubbleAt(worldX, worldZ, 1, time, 0, cloud).white;
        drawnSum += bubbleAt(worldX, worldZ, 1, time, fadeStart, cloud).white;
      }
      const loss = 1 - drawnSum / pointSum;
      // The Fresnel's fourth power keeps most of a bubble's white in its outer tenth, so the small bubbles under a
      // pixel here lose more of it than the square's did (6% against 3%).
      check(Math.abs(loss) < 0.08, `over a cloud of ${cloud} holds, drawn at ${(1000 * fadeStart).toFixed(2)} mm a pixel, where they start to fade, the bubbles whiten ${(100 * loss).toFixed(1)}% less than point-sampled`);
    }
  }
  {
    // One cell over against a random distance away: the white's correlation at the lattice's own step (bubbles at
    // their cells' centres would give 1; foamHash's neighbours are a little alike, a few hundredths).
    const pairs = 40000, near = [], far = [];
    for (let index = 0; index < pairs; index++) {
      const worldX = seededRandom() * 4.8, worldZ = seededRandom() * 4.8, time = seededRandom() * 30;
      const here = bubbleAt(worldX, worldZ, 1, time).white;
      near.push([here, bubbleAt(worldX + defines.FOAM_BUBBLE_CELL, worldZ, 1, time).white]);
      far.push([here, bubbleAt(worldX + 0.37 + seededRandom(), worldZ + seededRandom(), 1, time).white]);
    }
    const correlation = (list) => {
      const meanFirst = mean(list.map((pair) => pair[0])), meanSecond = mean(list.map((pair) => pair[1]));
      const covariance = mean(list.map((pair) => (pair[0] - meanFirst) * (pair[1] - meanSecond)));
      return covariance / Math.sqrt(mean(list.map((pair) => (pair[0] - meanFirst) ** 2)) * mean(list.map((pair) => (pair[1] - meanSecond) ** 2)));
    };
    const atStep = correlation(near), apart = correlation(far);
    check(Math.abs(atStep) < 0.05 && Math.abs(atStep - apart) < 0.05, `the bubbles show no grid: the white one cell over correlates ${atStep.toFixed(3)}, far apart ${apart.toFixed(3)}`);
  }

  const mainSource = readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const clarities = [...mainSource.matchAll(/^ {2}(\w+): \{ absorb: \[([^\]]+)\]/gm)].map((match) => ({ name: match[1], absorb: match[2].split(',').map(Number) }));
  check(clarities.length >= 4, `read ${clarities.length} water clarities from src/main.js`);
  for (const { name, absorb } of clarities) {
    const deep = absorb.map((perMetre) => { const ratio = perMetre / defines.FOAM_CLOUD_SCATTER; return 1 + ratio - Math.sqrt(ratio * ratio + 2 * ratio); });
    const reddest = absorb.indexOf(Math.max(...absorb));
    check(deep.every((share) => share > 0.4 && share < 1) && deep[reddest] === Math.min(...deep), `${name}: a deep cloud sends back ${deep.map((share) => share.toFixed(2)).join(', ')} (r, g, b), least where the water absorbs most`);
  }
  const churn = [];
  const frequency = defines.FOAM_CHURN_FREQUENCY;
  for (let index = 0; index < 20000; index++) {
    const worldX = seededRandom() * 4, worldZ = seededRandom() * 4;
    churn.push(smoothstep(0.32, 0.68, 0.55 * valueNoise(worldX * frequency + 71.3, worldZ * frequency + 71.3)
      + 0.3 * valueNoise(worldX * 2.7 * frequency + 13.1, worldZ * 2.7 * frequency + 13.1)
      + 0.15 * valueNoise(worldX * 7 * frequency + 5.7, worldZ * 7 * frequency + 5.7)));
  }
  const median = quantile(churn, 0.5), range = quantile(churn, 0.9) - quantile(churn, 0.1);
  check(Math.abs(median - 0.5) < 0.05 && range > 0.6, `the cloud's churn: median ${median.toFixed(3)}, 10–90% range ${range.toFixed(2)} (a dense cloud's light varies by ±${(100 * defines.FOAM_CHURN * range / 2).toFixed(0)}% across it, a thin one's more)`);
}

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
  // Within 6%: faded foam's opacity is lifted to its covered pixels' mean (the shader's FOAM_OPACITY_LIFT), without
  // which it drew some 10% darker than this, a bias the windows on every coarse cell once hid by chance.
  check(Math.abs(mean(shader.image) / mean(truth.image) - 1) < 0.06, `${name}: brightness ${mean(shader.image).toFixed(4)}, supersampled ${mean(truth.image).toFixed(4)}`);
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
