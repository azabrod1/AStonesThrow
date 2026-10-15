// The GPU's FFT pass (FFT_PASS_FRAGMENT in src/shaders/spectral.js) done on
// arrays, for the CPU checks in tools/fft-test.mjs and tools/wave-probe.mjs.
//
// One radix-2 Stockham pass reads two inputs per output, exactly as the shader
// does; log2(N) passes make a 1D transform. Complex values are interleaved
// (re, im) in a Float64Array. sign +1 is the inverse transform the GPU runs,
// unnormalised: x[n] = Σ_k X[k] e^{+2πi k·n/N}. A 2D grid is row-major, the
// row index being the texture's y (world z for the water textures), and is
// transformed rows first, then columns, as the GPU does.

export function stockhamPass(input, size, subtransformSize, sign) {
  const output = new Float64Array(2 * size);
  const half = subtransformSize / 2;
  for (let index = 0; index < size; index++) {
    const evenIndex = Math.floor(index / subtransformSize) * half + (index % half);
    const oddIndex = evenIndex + size / 2;
    const evenRe = input[2 * evenIndex], evenIm = input[2 * evenIndex + 1];
    const oddRe = input[2 * oddIndex], oddIm = input[2 * oddIndex + 1];
    const angle = sign * 2 * Math.PI * (index / subtransformSize);
    const twiddleRe = Math.cos(angle), twiddleIm = Math.sin(angle);
    output[2 * index] = evenRe + (twiddleRe * oddRe - twiddleIm * oddIm);
    output[2 * index + 1] = evenIm + (twiddleRe * oddIm + twiddleIm * oddRe);
  }
  return output;
}

export function fft1d(input, size, sign) {
  let data = input;
  for (let subtransformSize = 2; subtransformSize <= size; subtransformSize *= 2) data = stockhamPass(data, size, subtransformSize, sign);
  return data;
}

/** The GPU's 2D inverse transform of a size×size interleaved complex grid: rows, then columns. */
export function inverse2d(spectrum, size) {
  const grid = new Float64Array(spectrum);
  const line = new Float64Array(2 * size);
  for (let row = 0; row < size; row++) {
    grid.set(fft1d(grid.subarray(2 * row * size, 2 * (row + 1) * size), size, 1), 2 * row * size);
  }
  for (let column = 0; column < size; column++) {
    for (let row = 0; row < size; row++) {
      line[2 * row] = grid[2 * (row * size + column)];
      line[2 * row + 1] = grid[2 * (row * size + column) + 1];
    }
    const transformed = fft1d(line, size, 1);
    for (let row = 0; row < size; row++) {
      grid[2 * (row * size + column)] = transformed[2 * row];
      grid[2 * (row * size + column) + 1] = transformed[2 * row + 1];
    }
  }
  return grid;
}
