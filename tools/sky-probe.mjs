// Measures an equirectangular HDRI for the sky dome (src/sky.js).
//
//   node tools/sky-probe.mjs assets/sky/name_2k.hdr [--png=preview.png]
//
// Parses the Radiance RGBE file (run-length encoded scanlines), decoding as
// Three.js's HDRLoader does (mantissa · 2^(exponent − 128) / 255), so the
// numbers are in the units of the texture the dome samples. Writes
// assets/sky/name.json next to the file (the `_2k` suffix dropped) and prints
// it. Never edit that JSON by hand: rerun the probe. Fields:
//
//   sun.elevation, sun.azimuth   degrees, in the file's frame (below), from the
//                                luminance-weighted centroid of the sun pixels:
//                                those above a quarter of the maximum luminance
//                                within SUN_WINDOW_DEGREES of the brightest pixel;
//   sun.direction                the same as a unit vector in Three.js's
//                                equirect frame (below);
//   sun.pixels                   how many pixels that is;
//   sunIrradiance                Σ L·dΩ over the sun pixels, RGB: the sun's
//                                irradiance on a surface facing it;
//   skyRadiance                  the cosine-weighted mean radiance of the upper
//                                hemisphere without the sun pixels, RGB: the
//                                sky's irradiance on a horizontal surface / π;
//   horizonRadiance              median and 90th percentile of the luminance
//                                over elevations 2° to 8° (a sanity number);
//   maxLuminance                 the brightest pixel above the horizon
//                                (half floats, as the dome holds the file,
//                                stop at 65504; the cap makes that moot).
// Luminance is Rec. 709: 0.2126 R + 0.7152 G + 0.0722 B.
//
// The equirect convention. The file is stored top row first ("-Y height
// +X width"): row r (from 0) is centred on elevation 90° − (r + ½)·180°/height,
// so the horizon lies between rows height/2 − 1 and height/2. Column c is
// centred on u = (c + ½)/width, and the azimuth printed here is 360°·u,
// measured from the image's left edge and growing to the right, which for a
// viewer inside the sphere is turning to the right (clockwise seen from above).
// Three.js's equirect lookup (equirectUv in its common shader chunk, with the
// loader's flipY putting row 0 at v = 1) gives the direction of (u, elevation)
// as (cos e · cos φ, sin e, cos e · sin φ) with φ = 2π(u − ½): the image
// centre is +X, u = ¼ is −Z, u = ¾ is +Z and the left and right edges are −X.
// Turning right from −Z (toward +X) therefore increases u, so a dome sampled
// this way shows the panorama as it was photographed, not mirrored, and
// sun.direction is where it shows the sun. Checked in the page for both
// panoramas, one of them mirrored: a 6° view along the scene's sun direction
// has the dome's sun core within 0.1° of its centre.
//
// --png writes a tone-mapped preview at half size (Reinhard on an exposure
// that puts the horizon median at 0.6), with a red cross on the sun.
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const SUN_WINDOW_DEGREES = 5;
const SUN_THRESHOLD = 0.25;      // of the maximum luminance
const HORIZON_BAND = [2, 8];     // degrees of elevation

const luminanceOf = (red, green, blue) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

/** Decode a Radiance RGBE file into linear RGB floats, top row first. */
export function parseRgbe(buffer) {
  let offset = 0;
  while (true) {
    const end = buffer.indexOf(10, offset);
    const line = buffer.subarray(offset, end).toString('latin1');
    offset = end + 1;
    if (line === '') break;
    if (line.startsWith('FORMAT=') && line !== 'FORMAT=32-bit_rle_rgbe') throw new Error(`unsupported ${line}`);
  }
  const sizeEnd = buffer.indexOf(10, offset);
  const sizeLine = buffer.subarray(offset, sizeEnd).toString('latin1');
  offset = sizeEnd + 1;
  const match = /^-Y (\d+) \+X (\d+)$/.exec(sizeLine);
  if (!match) throw new Error(`unsupported orientation "${sizeLine}"`);
  const height = Number(match[1]);
  const width = Number(match[2]);
  const pixels = new Float32Array(width * height * 3);
  const scanline = new Uint8Array(width * 4);
  for (let row = 0; row < height; row++) {
    const runLengthEncoded = buffer[offset] === 2 && buffer[offset + 1] === 2 && ((buffer[offset + 2] << 8) | buffer[offset + 3]) === width;
    if (runLengthEncoded) {
      offset += 4;
      for (let channel = 0; channel < 4; channel++) {
        let column = 0;
        while (column < width) {
          let count = buffer[offset++];
          if (count > 128) {
            count -= 128;
            const value = buffer[offset++];
            for (let repeat = 0; repeat < count; repeat++) scanline[(column++) * 4 + channel] = value;
          } else {
            for (let repeat = 0; repeat < count; repeat++) scanline[(column++) * 4 + channel] = buffer[offset++];
          }
        }
      }
    } else {
      for (let index = 0; index < width * 4; index++) scanline[index] = buffer[offset++];
    }
    for (let column = 0; column < width; column++) {
      const exponent = scanline[column * 4 + 3];
      const scale = exponent === 0 ? 0 : Math.pow(2, exponent - 128) / 255;
      const base = (row * width + column) * 3;
      for (let channel = 0; channel < 3; channel++) pixels[base + channel] = scanline[column * 4 + channel] * scale;
    }
  }
  return { width, height, pixels };
}

/** Elevation (radians) of a row's centre, and the direction of a pixel in Three.js's equirect frame. */
const elevationOfRow = (row, height) => Math.PI / 2 - ((row + 0.5) / height) * Math.PI;
function directionOf(column, row, width, height) {
  const elevation = elevationOfRow(row, height);
  const phi = 2 * Math.PI * ((column + 0.5) / width - 0.5);
  return [Math.cos(elevation) * Math.cos(phi), Math.sin(elevation), Math.cos(elevation) * Math.sin(phi)];
}

export function measureSky({ width, height, pixels }) {
  const pixelSolidAngle = (row) => (2 * Math.PI / width) * (Math.PI / height) * Math.cos(elevationOfRow(row, height));
  let maxLuminance = 0;
  let brightestIndex = 0;
  for (let row = 0; row < height / 2; row++) {
    for (let column = 0; column < width; column++) {
      const base = (row * width + column) * 3;
      const luminance = luminanceOf(pixels[base], pixels[base + 1], pixels[base + 2]);
      if (luminance > maxLuminance) { maxLuminance = luminance; brightestIndex = row * width + column; }
    }
  }
  // The sun: pixels above a quarter of the maximum within the window around the brightest.
  const brightestDirection = directionOf(brightestIndex % width, Math.floor(brightestIndex / width), width, height);
  const windowCosine = Math.cos(SUN_WINDOW_DEGREES * Math.PI / 180);
  const isSun = new Uint8Array(width * height);
  const sunIrradiance = [0, 0, 0];
  const centroid = [0, 0, 0];
  let sunPixels = 0;
  const windowRows = Math.ceil(SUN_WINDOW_DEGREES / 180 * height) + 1;
  const brightestRow = Math.floor(brightestIndex / width);
  for (let row = Math.max(0, brightestRow - windowRows); row <= Math.min(height - 1, brightestRow + windowRows); row++) {
    const solidAngle = pixelSolidAngle(row);
    for (let column = 0; column < width; column++) {
      const direction = directionOf(column, row, width, height);
      const cosine = direction[0] * brightestDirection[0] + direction[1] * brightestDirection[1] + direction[2] * brightestDirection[2];
      if (cosine < windowCosine) continue;
      const base = (row * width + column) * 3;
      const luminance = luminanceOf(pixels[base], pixels[base + 1], pixels[base + 2]);
      if (luminance < SUN_THRESHOLD * maxLuminance) continue;
      isSun[row * width + column] = 1;
      sunPixels++;
      for (let channel = 0; channel < 3; channel++) sunIrradiance[channel] += pixels[base + channel] * solidAngle;
      for (let axis = 0; axis < 3; axis++) centroid[axis] += direction[axis] * luminance * solidAngle;
    }
  }
  const centroidLength = Math.hypot(...centroid);
  const sunDirection = centroid.map((component) => component / centroidLength);
  const sunElevation = Math.asin(sunDirection[1]) * 180 / Math.PI;
  let sunU = Math.atan2(sunDirection[2], sunDirection[0]) / (2 * Math.PI) + 0.5;
  sunU -= Math.floor(sunU);

  // The sky: cosine-weighted mean radiance of the upper hemisphere, sun excluded.
  const skyIrradiance = [0, 0, 0];
  const horizonLuminances = [];
  for (let row = 0; row < height / 2; row++) {
    const elevation = elevationOfRow(row, height);
    const weight = pixelSolidAngle(row) * Math.sin(elevation);
    const elevationDegrees = elevation * 180 / Math.PI;
    const inHorizonBand = elevationDegrees >= HORIZON_BAND[0] && elevationDegrees <= HORIZON_BAND[1];
    for (let column = 0; column < width; column++) {
      const base = (row * width + column) * 3;
      if (inHorizonBand) horizonLuminances.push(luminanceOf(pixels[base], pixels[base + 1], pixels[base + 2]));
      if (isSun[row * width + column]) continue;
      for (let channel = 0; channel < 3; channel++) skyIrradiance[channel] += pixels[base + channel] * weight;
    }
  }
  horizonLuminances.sort((first, second) => first - second);
  const percentile = (fraction) => horizonLuminances[Math.min(horizonLuminances.length - 1, Math.floor(fraction * horizonLuminances.length))];
  const significant = (value) => Number(value.toPrecision(5));
  return {
    width,
    height,
    sun: {
      elevation: Number(sunElevation.toFixed(2)),
      azimuth: Number((sunU * 360).toFixed(2)),
      direction: sunDirection.map((component) => Number(component.toFixed(5))),
      pixels: sunPixels,
    },
    sunIrradiance: sunIrradiance.map(significant),
    skyRadiance: skyIrradiance.map((value) => significant(value / Math.PI)),
    horizonRadiance: { median: significant(percentile(0.5)), p90: significant(percentile(0.9)) },
    maxLuminance: significant(maxLuminance),
  };
}

// ---- PNG preview (no dependencies) -------------------------------------
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row++) rgb.copy(raw, row * (width * 3 + 1) + 1, row * width * 3, (row + 1) * width * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function previewPng({ width, height, pixels }, measurement) {
  const previewWidth = width >> 1;
  const previewHeight = height >> 1;
  const exposure = 0.6 / measurement.horizonRadiance.median;
  const rgb = Buffer.alloc(previewWidth * previewHeight * 3);
  for (let row = 0; row < previewHeight; row++) {
    for (let column = 0; column < previewWidth; column++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (const [rowOffset, columnOffset] of [[0, 0], [0, 1], [1, 0], [1, 1]]) sum += pixels[((2 * row + rowOffset) * width + 2 * column + columnOffset) * 3 + channel];
        const value = 0.25 * sum * exposure;
        rgb[(row * previewWidth + column) * 3 + channel] = Math.round(Math.pow(value / (1 + value), 1 / 2.2) * 255);
      }
    }
  }
  const sunColumn = Math.round(measurement.sun.azimuth / 360 * previewWidth);
  const sunRow = Math.round((90 - measurement.sun.elevation) / 180 * previewHeight);
  for (let offset = -12; offset <= 12; offset++) {
    for (const [row, column] of [[sunRow + offset, sunColumn], [sunRow, sunColumn + offset]]) {
      if (Math.abs(offset) < 4 || row < 0 || row >= previewHeight) continue;
      const wrapped = (column + previewWidth) % previewWidth;
      rgb.set([255, 0, 0], (row * previewWidth + wrapped) * 3);
    }
  }
  return encodePng(previewWidth, previewHeight, rgb);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const input = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const pngArgument = process.argv.find((argument) => argument.startsWith('--png='));
  if (!input) { console.error('usage: node tools/sky-probe.mjs assets/sky/name_2k.hdr [--png=preview.png]'); process.exit(1); }
  const image = parseRgbe(await readFile(input));
  const measurement = { source: path.basename(input), ...measureSky(image) };
  const output = path.join(path.dirname(input), `${path.basename(input, '.hdr').replace(/_\d+k$/, '')}.json`);
  await writeFile(output, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(JSON.stringify(measurement, null, 2));
  const luminance = (rgb) => luminanceOf(rgb[0], rgb[1], rgb[2]);
  console.log(`sky irradiance on the ground / sun's: ${(Math.PI * luminance(measurement.skyRadiance) / (luminance(measurement.sunIrradiance) * Math.sin(measurement.sun.elevation * Math.PI / 180))).toFixed(3)}`);
  console.log(`wrote ${output}`);
  if (pngArgument) {
    const pngPath = pngArgument.slice('--png='.length);
    await writeFile(pngPath, previewPng(image, measurement));
    console.log(`wrote ${pngPath}`);
  }
}
