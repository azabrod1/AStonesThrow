// CPU check of the GPU FFT formulation used in src/spectralWater.js.
//
// The shader runs log2(N) Stockham radix-2 passes per axis. Each pass reads two
// inputs per output; this file does the same arithmetic on arrays and compares
// the result against a naive DFT, then checks the closed-form Gaussian spectrum
// that the update pass adds for each splash. Run: node tools/fft-test.mjs

function stockhamPass(input, N, subtransformSize, sign) {
  // input/output: Float64Array of 2N (interleaved complex)
  const output = new Float64Array(2 * N);
  const half = subtransformSize / 2;
  for (let index = 0; index < N; index++) {
    const evenIndex = Math.floor(index / subtransformSize) * half + (index % half);
    const oddIndex = evenIndex + N / 2;
    const evenRe = input[2 * evenIndex], evenIm = input[2 * evenIndex + 1];
    const oddRe = input[2 * oddIndex], oddIm = input[2 * oddIndex + 1];
    const angle = sign * 2 * Math.PI * (index / subtransformSize);
    const twRe = Math.cos(angle), twIm = Math.sin(angle);
    output[2 * index] = evenRe + (twRe * oddRe - twIm * oddIm);
    output[2 * index + 1] = evenIm + (twRe * oddIm + twIm * oddRe);
  }
  return output;
}

function fft1d(input, N, sign) {
  let data = input;
  for (let size = 2; size <= N; size *= 2) data = stockhamPass(data, N, size, sign);
  return data;
}

function naiveDft(input, N, sign) {
  const output = new Float64Array(2 * N);
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = sign * 2 * Math.PI * k * n / N;
      const c = Math.cos(angle), s = Math.sin(angle);
      re += input[2 * n] * c - input[2 * n + 1] * s;
      im += input[2 * n] * s + input[2 * n + 1] * c;
    }
    output[2 * k] = re; output[2 * k + 1] = im;
  }
  return output;
}

const N = 32;
const input = new Float64Array(2 * N);
for (let n = 0; n < N; n++) { input[2 * n] = Math.sin(n * 0.7) + Math.cos(n * n * 0.1); input[2 * n + 1] = Math.cos(n * 1.3) * 0.5; }
for (const sign of [-1, 1]) {
  const a = fft1d(input, N, sign), b = naiveDft(input, N, sign);
  let worst = 0;
  for (let i = 0; i < 2 * N; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  console.log(`1D FFT sign ${sign}: max abs error vs naive DFT = ${worst.toExponential(2)}`);
}

// 2D inverse transform of a closed-form Gaussian spectrum should give back the Gaussian.
// Spectrum convention: inverse is unnormalised, h[n] = Σ_k H[k] e^{+2πi k·n/N}.
// Gaussian of amplitude A, radius s cells at n0:  H[k] = A (2π s²/N²) e^{-s²|q|²/2} e^{-i q·n0},  q = 2πk/N (wrapped).
const M = 64, amp = 0.37, sigma = 2.5, centreX = 40.3, centreY = 17.8;
const spectrum = new Float64Array(2 * M * M);
for (let ky = 0; ky < M; ky++) for (let kx = 0; kx < M; kx++) {
  const qx = 2 * Math.PI * (kx < M / 2 ? kx : kx - M) / M;
  const qy = 2 * Math.PI * (ky < M / 2 ? ky : ky - M) / M;
  const mag = amp * 2 * Math.PI * sigma * sigma / (M * M) * Math.exp(-sigma * sigma * (qx * qx + qy * qy) / 2);
  const phase = -(qx * centreX + qy * centreY);
  const i = 2 * (ky * M + kx);
  spectrum[i] = mag * Math.cos(phase); spectrum[i + 1] = mag * Math.sin(phase);
}
// rows then columns, inverse (sign +1)
let grid = spectrum;
for (let size = 2; size <= M; size *= 2) {
  const next = new Float64Array(2 * M * M);
  for (let row = 0; row < M; row++) {
    const line = grid.subarray(2 * row * M, 2 * (row + 1) * M);
    next.set(stockhamPass(line, M, size, 1), 2 * row * M);
  }
  grid = next;
}
for (let size = 2; size <= M; size *= 2) {
  const next = new Float64Array(2 * M * M);
  for (let col = 0; col < M; col++) {
    const line = new Float64Array(2 * M);
    for (let row = 0; row < M; row++) { line[2 * row] = grid[2 * (row * M + col)]; line[2 * row + 1] = grid[2 * (row * M + col) + 1]; }
    const out = stockhamPass(line, M, size, 1);
    for (let row = 0; row < M; row++) { next[2 * (row * M + col)] = out[2 * row]; next[2 * (row * M + col) + 1] = out[2 * row + 1]; }
  }
  grid = next;
}
let worst = 0, worstImag = 0;
for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
  const expected = amp * Math.exp(-((x - centreX) ** 2 + (y - centreY) ** 2) / (2 * sigma * sigma));
  worst = Math.max(worst, Math.abs(grid[2 * (y * M + x)] - expected));
  worstImag = Math.max(worstImag, Math.abs(grid[2 * (y * M + x) + 1]));
}
console.log(`2D inverse of Gaussian spectrum: max abs error ${worst.toExponential(2)} (amplitude ${amp}), max imaginary ${worstImag.toExponential(2)}`);
