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
//
// A place's hours (src/sky.js: one place photographed from one spot at
// several times of day). Poly Haven turns every panorama so that its sun, or
// its brightest glow, lands on the same column, so the land lies at a
// different azimuth in each file; these options find where north is, so the
// app can keep the land still and move the sun.
//   --taken=2024-08-19T06:28+02:00 --at=-28.4853,29.0126   (the photo's time,
//   with its offset from UTC, and place) adds
//     taken, at        the two, as given;
//     solar            the true sun's elevation and azimuth then and there
//                      (degrees; azimuth from north toward east), from
//                      NOAA's solar position algorithm (about 0.01°; no
//                      refraction, which lifts the sun about half a degree
//                      at the horizon);
//     light            'sun' when the sun pixels are a disc (DISC_PIXELS at
//                      most) within SUN_MATCH_DEGREES of the true sun's
//                      elevation; 'moon' when they are a disc giving the
//                      ground at least DISC_SHARE of the sky's irradiance
//                      (a star gives under a thousandth) and the true sun is
//                      under −6°; otherwise 'none': what the sun window found
//                      is a glow after sunset or a star, and the sun's fields
//                      above mean nothing.
//   --align=reference_2k.hdr (whose JSON holds a north) turns this panorama
//   until its skyline lines up with the reference's: the vertical gradient of
//   log luminance (sky over land) in rows from ALIGN_BAND[0]° to
//   ALIGN_BAND[1]° of elevation, smoothed over ALIGN_SMOOTHING columns and
//   normalised row by row, correlated at every turn of a column round the
//   circle, the peak refined to a fraction of a column by a parabola. It adds
//     alignment        the turn (degrees: where the reference's column 0 lies
//                      in this file), the peak and the next best turn, in
//                      standard deviations of the correlation (a peak not
//                      clear of the next best is not to be trusted).
//   Either way a panorama whose light is the sun, or that was aligned, gets
//     north            the file azimuth of true north (degrees, as
//                      sun.azimuth): the sun's azimuth in the file less the
//                      true sun's when light is 'sun' and the time is known,
//                      else the reference's north plus the turn;
//     northFrom        'sun' or 'skyline' (the alignment's turn, when both
//                      are there, is printed against the sun's as a check).
//   --band=low,high    elevation band for skyline alignment (degrees;
//                      default -2,3). Mountain ridges need a higher band
//                      than a lake's far shore. Stored with the measurement.
// The two agree: across Poly Haven's thirteen Qwantani panoramas the turn
// from the skyline and the turn from the sun's true positions differed by
// 0.5° at most. Lined up this way, the photos' own time stamps turn out to be
// local time (UTC+2 there) for the 2024 series: the true sun's elevation then
// matches the measured one within 0.5° in every sunlit file.
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const SUN_WINDOW_DEGREES = 5;
const SUN_THRESHOLD = 0.25;      // of the maximum luminance
const HORIZON_BAND = [2, 8];     // degrees of elevation
const DISC_PIXELS = 64;          // the sun's or the moon's disc, on a 2k panorama, is at most this many pixels (a glow is thousands)
const DISC_SHARE = 0.01;         // the moon gives the ground at least this share of the sky's irradiance (a star under 0.001)
const SUN_MATCH_DEGREES = 2;     // a disc this close to the true sun's elevation is the sun
const ALIGN_BAND = [-2, 3];      // degrees of elevation: the far shore's skyline
const ALIGN_SMOOTHING = 5;       // columns

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

// ---- Time and place ------------------------------------------------------

const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (angle) => angle * 180 / Math.PI;

/**
 * The true sun's elevation and azimuth (degrees; azimuth from north toward
 * east) at a moment (a Date) and place (latitude and longitude in degrees,
 * east positive): NOAA's solar position algorithm, without refraction.
 */
export function solarPosition(moment, latitude, longitude) {
  const julianDay = moment.getTime() / 86400000 + 2440587.5;
  const century = (julianDay - 2451545) / 36525;
  const meanLongitude = (280.46646 + century * (36000.76983 + century * 0.0003032)) % 360;
  const meanAnomaly = radians(357.52911 + century * (35999.05029 - 0.0001537 * century));
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century);
  const centre = Math.sin(meanAnomaly) * (1.914602 - century * (0.004817 + 0.000014 * century))
    + Math.sin(2 * meanAnomaly) * (0.019993 - 0.000101 * century) + Math.sin(3 * meanAnomaly) * 0.000289;
  const nutationNode = radians(125.04 - 1934.136 * century);
  const apparentLongitude = radians(meanLongitude + centre - 0.00569 - 0.00478 * Math.sin(nutationNode));
  const meanObliquity = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60;
  const obliquity = radians(meanObliquity + 0.00256 * Math.cos(nutationNode));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
  const obliquityTerm = Math.tan(obliquity / 2) ** 2;
  const longitudeRadians = radians(meanLongitude);
  const equationOfTime = 4 * degrees(obliquityTerm * Math.sin(2 * longitudeRadians) - 2 * eccentricity * Math.sin(meanAnomaly)
    + 4 * eccentricity * obliquityTerm * Math.sin(meanAnomaly) * Math.cos(2 * longitudeRadians)
    - 0.5 * obliquityTerm * obliquityTerm * Math.sin(4 * longitudeRadians) - 1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly));
  const minutesOfDay = moment.getUTCHours() * 60 + moment.getUTCMinutes() + moment.getUTCSeconds() / 60;
  const trueSolarMinutes = (((minutesOfDay + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440;
  const hourAngle = radians(trueSolarMinutes / 4 - 180);
  const latitudeRadians = radians(latitude);
  const cosineZenith = Math.sin(latitudeRadians) * Math.sin(declination) + Math.cos(latitudeRadians) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = 90 - degrees(Math.acos(Math.min(1, Math.max(-1, cosineZenith))));
  const azimuth = degrees(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitudeRadians) - Math.tan(declination) * Math.cos(latitudeRadians))) + 180;
  return { elevation, azimuth: ((azimuth % 360) + 360) % 360 };
}

/** The skyline's features (ALIGN_BAND): rows of the sky-over-land gradient, each normalised and clipped. */
function skylineFeatures({ width, height, pixels }, band) {
  const rows = [];
  for (let row = 0; row < height; row++) {
    const elevation = degrees(elevationOfRow(row, height));
    if (elevation < band[0] || elevation > band[1]) continue;
    const logarithm = new Float64Array(width);
    for (let column = 0; column < width; column++) {
      const base = (row * width + column) * 3;
      logarithm[column] = Math.log(luminanceOf(pixels[base], pixels[base + 1], pixels[base + 2]) + 1e-12);
    }
    const smoothed = new Float64Array(width);
    const half = (ALIGN_SMOOTHING - 1) / 2;
    for (let column = 0; column < width; column++) {
      let sum = 0;
      for (let offset = -half; offset <= half; offset++) sum += logarithm[(column + offset + width) % width];
      smoothed[column] = sum / ALIGN_SMOOTHING;
    }
    rows.push(smoothed);
  }
  const features = [];
  for (let index = 1; index < rows.length; index++) {
    const gradient = rows[index - 1].map((above, column) => above - rows[index][column]);   // brighter above: sky over land
    const mean = gradient.reduce((sum, value) => sum + value, 0) / width;
    const spread = Math.sqrt(gradient.reduce((sum, value) => sum + (value - mean) ** 2, 0) / width) + 1e-9;
    features.push(gradient.map((value) => Math.min(3, Math.max(-3, (value - mean) / spread))));
  }
  return features;
}

/**
 * The turn (degrees) that lines `image`'s skyline up with `reference`'s:
 * where the reference's column 0 lies in `image`. Also the correlation's peak
 * and its next best turn (more than a 60th of the circle away), in standard
 * deviations of the correlation over all turns.
 */
export function alignSkyline(reference, image, band = ALIGN_BAND) {
  const referenceFeatures = skylineFeatures(reference, band);
  const imageFeatures = skylineFeatures(image, band);
  const width = image.width;
  const correlation = new Float64Array(width);
  for (let shift = 0; shift < width; shift++) {
    let sum = 0;
    for (let row = 0; row < referenceFeatures.length; row++) {
      const referenceRow = referenceFeatures[row];
      const imageRow = imageFeatures[row];
      for (let column = 0; column < width; column++) sum += referenceRow[column] * imageRow[(column + shift) % width];
    }
    correlation[shift] = sum;
  }
  let best = 0;
  for (let shift = 1; shift < width; shift++) if (correlation[shift] > correlation[best]) best = shift;
  const left = correlation[(best - 1 + width) % width];
  const right = correlation[(best + 1) % width];
  const curvature = left - 2 * correlation[best] + right;
  const fraction = curvature < 0 ? 0.5 * (left - right) / curvature : 0;
  const mean = correlation.reduce((sum, value) => sum + value, 0) / width;
  const spread = Math.sqrt(correlation.reduce((sum, value) => sum + (value - mean) ** 2, 0) / width);
  const guard = Math.floor(width / 60);
  let runnerUp = -Infinity;
  for (let shift = 0; shift < width; shift++) {
    const apart = Math.min(Math.abs(shift - best), width - Math.abs(shift - best));
    if (apart > guard) runnerUp = Math.max(runnerUp, correlation[shift]);
  }
  return {
    turn: Number(((((best + fraction) * 360 / width) % 360 + 360) % 360).toFixed(2)),
    peak: Number(((correlation[best] - mean) / spread).toFixed(2)),
    nextBest: Number(((runnerUp - mean) / spread).toFixed(2)),
  };
}

/** What the sun window found, given the true sun's elevation: 'sun', 'moon' or 'none'. */
function classifyLight(measurement, solarElevation) {
  const sunPart = luminanceOf(...measurement.sunIrradiance) * Math.max(0, Math.sin(radians(measurement.sun.elevation)));
  const skyPart = Math.PI * luminanceOf(...measurement.skyRadiance);
  const disc = measurement.sun.pixels <= DISC_PIXELS;
  if (disc && Math.abs(measurement.sun.elevation - solarElevation) <= SUN_MATCH_DEGREES) return 'sun';
  if (disc && sunPart >= DISC_SHARE * skyPart && solarElevation < -6) return 'moon';
  return 'none';
}

const wrapDegrees = (angle) => Number((((angle % 360) + 360) % 360).toFixed(2));

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
  const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const pngArgument = process.argv.find((argument) => argument.startsWith('--png='));
  if (!input) { console.error('usage: node tools/sky-probe.mjs assets/sky/name_2k.hdr [--png=preview.png] [--taken=ISO time with offset --at=latitude,longitude] [--align=reference_2k.hdr]'); process.exit(1); }
  const measurementPath = (hdrPath) => path.join(path.dirname(hdrPath), `${path.basename(hdrPath, '.hdr').replace(/_\d+k$/, '')}.json`);
  const image = parseRgbe(await readFile(input));
  const measurement = { source: path.basename(input), ...measureSky(image) };
  const taken = option('taken');
  const at = option('at');
  const alignTo = option('align');
  let northFromSkyline = null;
  if (taken) {
    if (!at) { console.error('--taken needs --at=latitude,longitude'); process.exit(1); }
    const [latitude, longitude] = at.split(',').map(Number);
    const moment = new Date(taken);
    if (Number.isNaN(moment.getTime()) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) { console.error('unreadable --taken or --at'); process.exit(1); }
    const solar = solarPosition(moment, latitude, longitude);
    Object.assign(measurement, {
      taken,
      at: [latitude, longitude],
      solar: { elevation: Number(solar.elevation.toFixed(2)), azimuth: Number(solar.azimuth.toFixed(2)) },
      light: classifyLight(measurement, solar.elevation),
    });
  }
  if (alignTo) {
    const band = option('band') ? option('band').split(',').map(Number) : ALIGN_BAND;
    if (band.length !== 2 || !band.every(Number.isFinite) || band[0] < -90 || band[1] > 90 || band[1] - band[0] < 1) throw new Error('--band needs two elevations at least one degree apart');
    const referenceMeasurement = JSON.parse(await readFile(measurementPath(alignTo), 'utf8'));
    if (referenceMeasurement.north === undefined) { console.error(`${alignTo}'s measurement has no north: probe it first`); process.exit(1); }
    measurement.alignment = { reference: path.basename(alignTo), ...alignSkyline(parseRgbe(await readFile(alignTo)), image, band), ...(option('band') ? { band } : {}) };
    if (measurement.alignment.peak - measurement.alignment.nextBest < 1) console.warn(`warning: the skyline's peak (${measurement.alignment.peak}σ) is barely clear of the next best turn (${measurement.alignment.nextBest}σ)`);
    northFromSkyline = wrapDegrees(referenceMeasurement.north + measurement.alignment.turn);
  }
  if (measurement.light === 'sun') {
    measurement.north = wrapDegrees(measurement.sun.azimuth - measurement.solar.azimuth);
    measurement.northFrom = 'sun';
    if (alignTo) console.log(`north from the sun ${measurement.north}°, from the skyline ${northFromSkyline}°`);
  } else if (alignTo) {
    measurement.north = northFromSkyline;
    measurement.northFrom = 'skyline';
  }
  const output = measurementPath(input);
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
