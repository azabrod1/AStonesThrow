// Encodes the sky's panoramas for the page: each assets/sky/<name>_2k.hdr
// (or _4k: Swiss Alps'; Poly Haven's Radiance file, the source that
// tools/sky-probe.mjs measures, kept in the repository but not published,
// tools/build-site.mjs) becomes assets/sky/<name>_2k.jpg (_4k.jpg), the file
// src/sky.js loads: a JPEG gain map that Three.js's UltraHDRLoader decodes
// to half floats.
//
//   node tools/sky-encode.mjs [assets/sky/name_2k.hdr ...] [--verify] [--quality=n]
//
// With no files, every assets/sky/*_<n>k.hdr. Never edit a .jpg: rerun this.
// --verify also decodes each file with the pinned UltraHDRLoader in the
// headless browser (tools/browser.mjs) and checks that it gives exactly the
// half floats this tool's model of it gives; rerun it after a Three.js
// upgrade. --quality=n tries another quality for the base image.
//
// The format ("Ultra HDR"): a JPEG of 8-bit values, the base image, and after
// it a second JPEG, the gain map, that says how far to raise each pixel; a
// Multi-Picture Format directory (APP2) in the base image says where the gain
// map starts, and the gain map's XMP (APP1) holds its range.
//
// The decoder. UltraHDRLoader (three 0.183.2) decodes a channel's byte s with
// the gain map's byte g as
//   linear = toLinear(s · 2^(w·L)),   L = GainMapMin + (GainMapMax − GainMapMin)·g/255,
// with w = log2(1.8)/2 when HDRCapacityMin is 0, and toLinear the sRGB curve
// (a straight line under 10.3, read from a table at the argument's integer
// part up to 1024, computed above), clamped to 65504. It raises the byte as
// coded, not the linear value as the format's specification does, so a file
// made for the specification (libultrahdr, @monogrid/gainmap-js) would come
// out up to a fifth off, by the two formulas. This tool inverts the loader's
// arithmetic (decodeChannel), exactly: --verify checks it against the loader.
//
// The gain map is constant over each 8×8 block of pixels, the JPEG's own
// blocks, and is stored in colour at quality 100, so that a block with no AC
// terms decodes to its value exactly in every browser. Measured in
// Playwright's WebKit (Apple's ImageIO, as Safari decodes) against Chrome's
// libjpeg-turbo: a smooth gain map's pixels differ by 1 to 3 levels in 1.6%
// of them in colour, and in 28% in grey (WebKit converts a grey JPEG through
// its grey profile); one level is about 6% of the radiance, so a smooth map
// would speckle the sky on Apple's devices. A block-constant one decodes
// identically. Each block's boost is the least that brings its brightest
// channel's byte to SDR_TOP, so nothing is clipped: the sun's disc keeps the
// .hdr's peak (to half floats' 65504, where the page's half floats stop it).
// Two kinds of block follow each pixel instead, their bytes a level or two
// over what each needs, for the JPEG's rounding: one that holds a pixel over
// the dome's cap (DOME_CAP), where the sun's or the moon's disc would leave
// the glow beside it a few levels of the base image, its colour in coarse
// steps (frames showed green and purple specks on the sun's reflection),
// and one whose brightest pixel is CONTRAST times its darkest (coded), where
// a dark hill against a bright sky would be left a few levels, speckled by
// the base image's ringing (frames zoomed on a dawn skyline). WebKit decodes
// 0.04 to 0.14% of the gain map's pixels a level off, all in those blocks: a
// few percent of a pixel's brightness, at an edge or under the cap, which
// hides it; never its hue, since the boost is grey.
//
// The base image is then chosen pixel by pixel and channel by channel: the
// byte whose decode with its block's boost is nearest the .hdr's half float,
// what the page drew from the .hdr. The gain map's steps fall on the JPEG's
// block edges, where they cost the base image nothing. Its JPEG (mozjpeg, at
// SDR_QUALITY, its colour not subsampled, so that its colour's blocks are the
// gain map's too) is the only loss.
//
// Below the horizon the photo's ground is hidden by the water, whose sheet
// reaches 9 km (src/waterSurface.js; the cube's ground hemisphere covers it
// for the reflections, src/sky.js): from GROUND_FROM below the horizon it is
// blurred, fully by GROUND_FULL, which takes away two thirds of the bytes.
// Should the scene ever show the photo's ground, encode it sharp again.
//
// A panorama in SHARP_TO is softened above that many degrees too (softenSky,
// a blur of SKY_BLUR, eased in over SKY_EASE degrees): the garden's
// (src/sky.js `garden`, the Koi pond's) is a canopy of leaves overhead, the
// dearest thing a JPEG holds, seen only past the top of the view or blurred
// by the water's ripples in its reflection: sharp to 20° it is 0.70 MB
// against 1.28.
//
// Each file's line: its bytes against the .hdr's, how many blocks follow
// each pixel, the boost's range, the brightest pixel decoded against the
// .hdr's, and the luminance's error over the sky above the horizon (after
// the dome's cap, which leaves only the hue above it): the median and the
// 99th percentile.
//
// The ten panoramas added after (Highlands, Desert oasis, Rocky cove and
// Swiss Alps' 4K) come to 0.23 to 0.76 MB at 2K and 1.8 MB at 4K (against
// 25.6), off by 0.5 to 2.0% at the median and 4.1 to 13% at the 99th
// percentile (the starlit desert's); their frames were not compared.
// Measured on the first nineteen panoramas: 0.17 to 0.62 MB a file against the
// .hdr's 5.3 to 6.6 (5.4 MB in all against 113); over the sky the luminance
// is off by 0.4 to 1.3% at the median and 1.5 to 12% at the 99th percentile
// (the darkest leaves of foliage). Frames of every place and hour (the home
// view, and the sun and its reflection at 12° and 20° fields of view) and of
// two throws, drawn from the .hdr and from the .jpg on one GPU, differ by
// 0.005 to 0.47 levels of 255 on average and by at most 34, in single pixels
// of foliage, and look alike side by side enlarged. A SDR_QUALITY of 97
// would add half again to the bytes for a 99th percentile two thirds as
// large; 93 takes a tenth off and adds a third to it.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import encodeJpeg, { init as initEncoder } from '@jsquash/jpeg/encode.js';
import decodeJpeg, { init as initDecoder } from '@jsquash/jpeg/decode.js';

const SDR_QUALITY = 95;        // mozjpeg's quality for the base image (chosen from sizes and frames: below)
const SDR_TOP = 250;           // the byte each block's brightest channel is raised to, under 255 for the JPEG's ringing
const BLOCK = 8;               // the JPEG's block: the gain map's cell
const GROUND_FROM = 2;         // degrees below the horizon where the blur starts...
const GROUND_FULL = 4;         // ...and where it is whole
const SHARP_TO = { ninomaru_teien_2k: 20 };   // degrees above the horizon a panorama is kept sharp to (softenSky); the rest whole
const SKY_BLUR = 6;            // pixels of a 2K panorama: the radius of each box pass softening it above SHARP_TO
const SKY_EASE = 8;            // degrees over which that softening comes in
const GROUND_BLUR = 16;        // pixels of a 2K panorama (2048 wide; a 4K's twice as many): the radius of each of its three box passes
const DARKEST_CODE = 0.5;      // the coded value a block of black is exposed for
const DOME_CAP = 30;           // src/sky.js's RADIANCE_CAP: times the sky's mean radiance, over which the dome shows only the hue
const CONTRAST = 4;            // a block whose brightest pixel's coded value is this many times its darkest's follows each pixel
const MAX_GAIN_MARGIN = 8;     // levels: the most a block that follows each pixel adds to its bytes, for the JPEG's rounding

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const codecFolder = path.dirname(require.resolve('@jsquash/jpeg/encode.js'));
await initEncoder(new WebAssembly.Module(await readFile(path.join(codecFolder, 'codec/enc/mozjpeg_enc.wasm'))));
await initDecoder(new WebAssembly.Module(await readFile(path.join(codecFolder, 'codec/dec/mozjpeg_dec.wasm'))));

// ---- UltraHDRLoader's decode (three 0.183.2), as it is written ----
const SRGB_TO_LINEAR = new Float64Array(1024);
for (let index = 0; index < 1024; index++) SRGB_TO_LINEAR[index] = Math.pow(index * 0.003717127 + 0.0521327014, 2.4);
const srgbToLinear = (value) => (value < 10.31475 ? value * 0.000303527 : value < 1024 ? SRGB_TO_LINEAR[value | 0] : Math.pow(value * 0.003717127 + 0.0521327014, 2.4));
/** The loader's linear value for a base byte under a boost (offsets 0). */
const decodeChannel = (byte, boost) => Math.min(Math.max(srgbToLinear(byte * boost), 0), 65504);
/** The loader's boost for a gain byte. */
const boostOf = (gainByte, metadata) => {
  const logBoost = metadata.gainMapMin + (metadata.gainMapMax - metadata.gainMapMin) * (gainByte * 0.00392156862745098);
  return logBoost * metadata.weight === 0 ? 1 : Math.pow(2, logBoost * metadata.weight);
};
/** The loader's weight from the metadata as it parses it. */
const weightOf = ({ hdrCapacityMin, hdrCapacityMax }) => Math.min(Math.max((Math.log2(1.8 ** (hdrCapacityMax * 0.5)) - hdrCapacityMin) / (hdrCapacityMax - hdrCapacityMin), 0), 1);
/** The coded value whose toLinear is `linear` (the inverse of the curve, without the table's steps). */
const codeOf = (linear) => (linear < 0.0031308 ? linear / 0.000303527 : (Math.pow(linear, 1 / 2.4) - 0.0521327014) / 0.003717127);

/** The base byte whose decode under `boost` is nearest `target` (relative error; the decode only grows with the byte). */
function nearestByte(target, boost) {
  let low = 0, high = 255;
  while (low < high) {   // the least byte that decodes at or above the target
    const middle = (low + high) >> 1;
    if (decodeChannel(middle, boost) >= target) high = middle; else low = middle + 1;
  }
  let best = low, bestError = Infinity;
  for (let byte = Math.max(0, low - 1); byte <= Math.min(255, low + 1); byte++) {
    const error = Math.abs(Math.log((decodeChannel(byte, boost) + 1e-5) / (target + 1e-5)));
    if (error < bestError) { bestError = error; best = byte; }
  }
  return best;
}

/** The panorama as the page drew it: HDRLoader's half floats, as floats; and the file's size. */
async function readPanorama(file) {
  const bytes = await readFile(file);
  const decoded = new HDRLoader().setDataType(THREE.HalfFloatType).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const { width, height } = decoded;
  const pixels = new Float32Array(width * height * 3);
  for (let index = 0; index < width * height; index++) for (let channel = 0; channel < 3; channel++) pixels[3 * index + channel] = THREE.DataUtils.fromHalfFloat(decoded.data[4 * index + channel]);
  return { width, height, pixels, fileBytes: bytes.length };
}

/** Three box passes of `radius` along x (wrapping, the azimuth) and y (clamped) over rows from `firstRow`, in place, one channel at a time. */
function blurRows(pixels, width, height, firstRow, radius) {
  const rows = height - firstRow;
  const plane = new Float64Array(width * rows), scratch = new Float64Array(width * rows);
  for (let channel = 0; channel < 3; channel++) {
    for (let index = 0; index < width * rows; index++) plane[index] = pixels[3 * (firstRow * width + index) + channel];
    for (let pass = 0; pass < 3; pass++) {
      for (let row = 0; row < rows; row++) {
        let sum = 0;
        for (let offset = -radius; offset <= radius; offset++) sum += plane[row * width + ((offset % width) + width) % width];
        for (let column = 0; column < width; column++) {
          scratch[row * width + column] = sum / (2 * radius + 1);
          sum += plane[row * width + (column + radius + 1) % width] - plane[row * width + (column - radius + width) % width];
        }
      }
      for (let column = 0; column < width; column++) {
        const at = (row) => scratch[Math.min(rows - 1, Math.max(0, row)) * width + column];
        let sum = 0;
        for (let offset = -radius; offset <= radius; offset++) sum += at(offset);
        for (let row = 0; row < rows; row++) {
          plane[row * width + column] = sum / (2 * radius + 1);
          sum += at(row + radius + 1) - at(row - radius);
        }
      }
    }
    for (let index = 0; index < width * rows; index++) pixels[3 * (firstRow * width + index) + channel] = plane[index];
  }
}

/** The photo's ground below the horizon blurred, from GROUND_FROM to whole at GROUND_FULL (the header). */
function blurGround({ width, height, pixels }) {
  const rowAt = (degreesBelow) => Math.floor(height / 2 + (degreesBelow / 180) * height);
  const fromRow = rowAt(GROUND_FROM), fullRow = rowAt(GROUND_FULL);
  const sharp = pixels.slice(3 * fromRow * width);
  blurRows(pixels, width, height, fromRow, Math.round(GROUND_BLUR * width / 2048));
  for (let row = fromRow; row < Math.min(fullRow, height); row++) {
    const blurred = (row - fromRow) / (fullRow - fromRow);
    for (let index = 3 * row * width; index < 3 * (row + 1) * width; index++) pixels[index] = (1 - blurred) * sharp[index - 3 * fromRow * width] + blurred * pixels[index];
  }
}

/** The sky above `sharpTo` degrees softened (the header), eased in over SKY_EASE degrees. */
function softenSky({ width, height, pixels }, sharpTo) {
  const rowAt = (degreesUp) => Math.floor(height / 2 - (degreesUp / 180) * height);
  const sharp = pixels.slice();
  blurRows(pixels, width, height, 0, Math.round(SKY_BLUR * width / 2048));
  const from = rowAt(sharpTo), whole = rowAt(sharpTo + SKY_EASE);
  for (let row = 0; row < height; row++) {
    const soft = row > from ? 0 : Math.min(1, (from - row) / Math.max(from - whole, 1));
    for (let index = 3 * row * width; index < 3 * (row + 1) * width; index++) pixels[index] = (1 - soft) * sharp[index] + soft * pixels[index];
  }
}

/** Rec. 709 luminance of the RGB triple at `index` (in triples) of `pixels`. */
const luminanceOf = (pixels, index) => 0.2126 * pixels[3 * index] + 0.7152 * pixels[3 * index + 1] + 0.0722 * pixels[3 * index + 2];

/** Round a metadata number to what its XMP text says, so the encoder's arithmetic is the loader's. */
const asWritten = (value, direction) => Number((direction(value * 1e6) / 1e6).toFixed(6));

/** The XMP (APP1) payload of the gain map, as UltraHDRLoader reads it. */
function gainMapXmp(metadata) {
  const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0" hdrgm:GainMapMin="${metadata.gainMapMin}" hdrgm:GainMapMax="${metadata.gainMapMax}" hdrgm:Gamma="1" hdrgm:OffsetSDR="0" hdrgm:OffsetHDR="0" hdrgm:HDRCapacityMin="${metadata.hdrCapacityMin}" hdrgm:HDRCapacityMax="${metadata.hdrCapacityMax}" hdrgm:BaseRenditionIsHDR="False"/></rdf:RDF></x:xmpmeta>`;
  return Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xml, 'utf8')]);
}

/** A JPEG marker segment: FF, the marker, the length (counting itself) and the payload. */
function segment(marker, payload) {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** The Multi-Picture Format directory (APP2 payload, big-endian): the base image at 0, the gain map at its offset from the directory's TIFF header. */
function mpfPayload(baseSize, gainSize, gainOffset) {
  const payload = Buffer.alloc(4 + 8 + 2 + 3 * 12 + 4 + 2 * 16);
  payload.write('MPF\0', 0, 'latin1');
  payload.write('MM\0*', 4, 'latin1');
  payload.writeUInt32BE(8, 8);                // the first IFD, from the TIFF header
  payload.writeUInt16BE(3, 12);               // three tags
  const tag = (at, id, type, count, value) => { payload.writeUInt16BE(id, at); payload.writeUInt16BE(type, at + 2); payload.writeUInt32BE(count, at + 4); payload.writeUInt32BE(value, at + 8); };
  tag(14, 0xb000, 7, 4, 0x30313030);          // MPFVersion "0100"
  tag(26, 0xb001, 4, 1, 2);                   // NumberOfImages
  tag(38, 0xb002, 7, 32, 8 + 2 + 36 + 4);     // MPEntry, at its offset from the TIFF header
  payload.writeUInt32BE(0, 50);               // no next IFD
  payload.writeUInt32BE(0x030000, 54);        // the base image: primary, JPEG
  payload.writeUInt32BE(baseSize, 58);
  payload.writeUInt32BE(0, 62);
  payload.writeUInt32BE(0, 70);               // the gain map
  payload.writeUInt32BE(gainSize, 74);
  payload.writeUInt32BE(gainOffset, 78);
  return payload;
}

/** The file: the base image with its directory (after its JFIF APP0), then the gain map with its XMP. */
function container(baseJpeg, gainJpeg, metadata) {
  const app0Length = baseJpeg[2] === 0xff && baseJpeg[3] === 0xe0 ? 2 + baseJpeg.readUInt16BE(4) : 0;
  const gainFile = Buffer.concat([gainJpeg.subarray(0, 2), segment(0xe1, gainMapXmp(metadata)), gainJpeg.subarray(2)]);
  const directoryLength = 4 + mpfPayload(0, 0, 0).length;
  const baseSize = baseJpeg.length + directoryLength;
  const tiffHeader = 2 + app0Length + 4 + 4;  // SOI, APP0, the APP2's marker and length, 'MPF\0'
  const directory = segment(0xe2, mpfPayload(baseSize, gainFile.length, baseSize - tiffHeader));
  return Buffer.concat([baseJpeg.subarray(0, 2 + app0Length), directory, baseJpeg.subarray(2 + app0Length), gainFile]);
}

/** Encode one panorama; returns the file and its report. */
async function encodePanorama(hdrPath, quality) {
  const name = path.basename(hdrPath, '.hdr');
  const panorama = await readPanorama(hdrPath);
  const { width, height } = panorama;
  if (SHARP_TO[name] !== undefined) softenSky(panorama, SHARP_TO[name]);
  const reference = panorama.pixels.slice();   // the report's (over the sky: as softened, if it is)
  blurGround(panorama);
  const target = panorama.pixels;

  // What each pixel needs: log2 of the boost that brings its brightest
  // channel's byte to SDR_TOP. A block takes its brightest pixel's, unless it
  // holds a pixel over the dome's cap: then each pixel keeps its own.
  const measurement = JSON.parse(await readFile(hdrPath.replace(/_\d+k\.hdr$/, '.json'), 'utf8'));
  const cap = DOME_CAP * luminanceOf(measurement.skyRadiance, 0);
  const columns = width / BLOCK;
  const blockOf = (index) => Math.floor(index / width / BLOCK) * columns + Math.floor((index % width) / BLOCK);
  const needed = new Float64Array(width * height);
  const blocks = columns * (height / BLOCK);
  const blockNeeded = new Float64Array(blocks).fill(-Infinity), blockLeast = new Float64Array(blocks).fill(Infinity);
  const overCap = new Uint8Array(blocks), perPixel = new Uint8Array(blocks);
  for (let index = 0; index < width * height; index++) {
    const brightest = Math.max(target[3 * index], target[3 * index + 1], target[3 * index + 2]);
    needed[index] = Math.log2(Math.max(codeOf(brightest), DARKEST_CODE) / SDR_TOP);
    const block = blockOf(index);
    blockNeeded[block] = Math.max(blockNeeded[block], needed[index]);
    blockLeast[block] = Math.min(blockLeast[block], needed[index]);
    if (brightest > cap) overCap[block] = 1;
  }
  for (let block = 0; block < blocks; block++) perPixel[block] = overCap[block] || blockNeeded[block] - blockLeast[block] > Math.log2(CONTRAST) ? 1 : 0;
  for (let index = 0; index < width * height; index++) if (!perPixel[blockOf(index)]) needed[index] = blockNeeded[blockOf(index)];
  let lowest = Infinity, highest = -Infinity;
  for (const value of needed) { lowest = Math.min(lowest, value); highest = Math.max(highest, value); }
  highest += (highest - lowest) * (MAX_GAIN_MARGIN / (255 - MAX_GAIN_MARGIN));   // room for the margin over the brightest
  const hdrCapacityMax = 1, hdrCapacityMin = 0;   // only their weight counts: log2(1.8)/2 for any maximum over a minimum of 0
  const weight = weightOf({ hdrCapacityMin, hdrCapacityMax });
  const gainMapMin = asWritten(lowest / weight, Math.floor);
  const gainMapMax = asWritten(Math.max(highest / weight, gainMapMin + 1e-3), Math.ceil);
  const metadata = { gainMapMin, gainMapMax, hdrCapacityMin, hdrCapacityMax, weight };
  const leastByte = (logBoost) => {
    let gainByte = Math.max(0, Math.ceil(((logBoost / weight - gainMapMin) / (gainMapMax - gainMapMin)) * 255 - 1e-9));
    while (gainByte < 255 && Math.log2(boostOf(gainByte, metadata)) < logBoost) gainByte++;
    return gainByte;
  };

  // The gain map, and the boosts the browser will find in it. A block under
  // the cap decodes to its one value; one over it may decode a level or two
  // off, so its bytes take a margin, raised until nothing is clipped.
  let gainJpeg, boost, clipped;
  for (let margin = 1; ; margin *= 2) {
    const gainPixels = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let index = 0; index < width * height; index++) gainPixels.fill(Math.min(255, leastByte(needed[index]) + (perPixel[blockOf(index)] ? margin : 0)), 4 * index, 4 * index + 3);
    gainJpeg = Buffer.from(await encodeJpeg({ data: gainPixels, width, height }, { quality: 100, color_space: 3, auto_subsample: false, chroma_subsample: 1 }));
    const gainBack = await decodeJpeg(gainJpeg.buffer.slice(gainJpeg.byteOffset, gainJpeg.byteOffset + gainJpeg.length));
    boost = new Float64Array(width * height);
    clipped = 0;
    for (let index = 0; index < width * height; index++) {
      const [red, green, blue] = gainBack.data.subarray(4 * index, 4 * index + 3);
      const corner = 4 * ((Math.floor(index / width / BLOCK) * BLOCK) * width + Math.floor((index % width) / BLOCK) * BLOCK);
      if (red !== green || green !== blue || (!perPixel[blockOf(index)] && red !== gainBack.data[corner])) throw new Error(`${name}: the gain map's block at pixel ${index} does not decode to one grey`);
      boost[index] = boostOf(red, metadata);
      // Clipped: beyond the bytes' reach by more than a coded level (below 1024 the loader rounds to levels anyway).
      if (codeOf(Math.max(target[3 * index], target[3 * index + 1], target[3 * index + 2])) > 255 * boost[index] + 1) clipped++;
    }
    if (clipped === 0 || margin >= MAX_GAIN_MARGIN) break;
  }

  // The base image: per channel the byte nearest the target under its block's boost.
  const basePixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    for (let channel = 0; channel < 3; channel++) basePixels[4 * index + channel] = nearestByte(target[3 * index + channel], boost[index]);
    basePixels[4 * index + 3] = 255;
  }
  const baseJpeg = Buffer.from(await encodeJpeg({ data: basePixels, width, height }, { quality, auto_subsample: false, chroma_subsample: 1 }));
  const file = container(baseJpeg, gainJpeg, metadata);

  // The report: the file decoded as the loader does (mozjpeg's decoder is Chrome's libjpeg-turbo, byte for byte).
  const baseBack = await decodeJpeg(baseJpeg.buffer.slice(baseJpeg.byteOffset, baseJpeg.byteOffset + baseJpeg.length));
  const decoded = new Float32Array(width * height * 3);
  for (let index = 0; index < width * height; index++) for (let channel = 0; channel < 3; channel++) decoded[3 * index + channel] = THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(decodeChannel(baseBack.data[4 * index + channel], boost[index])));
  const capped = (pixels, index) => luminanceOf(pixels, index) * Math.min(1, cap / Math.max(pixels[3 * index], pixels[3 * index + 1], pixels[3 * index + 2], 1e-9));
  const errors = new Float64Array(width * height / 2);
  let brightest = 0, brightestDecoded = 0;
  for (let index = 0; index < width * height / 2; index++) {
    errors[index] = Math.abs(capped(decoded, index) / Math.max(capped(reference, index), 1e-4) - 1);
    if (Math.max(reference[3 * index], reference[3 * index + 1], reference[3 * index + 2]) > Math.max(reference[3 * brightest], reference[3 * brightest + 1], reference[3 * brightest + 2])) brightest = index;
    brightestDecoded = Math.max(brightestDecoded, decoded[3 * index], decoded[3 * index + 1], decoded[3 * index + 2]);
  }
  errors.sort();
  const percent = (value) => `${(100 * value).toFixed(1)}%`;
  const kilobytes = (bytes) => `${Math.round(bytes / 1024)} KB`;
  const report = `${name}: ${kilobytes(file.length)} (base ${kilobytes(baseJpeg.length)}, gain map ${kilobytes(gainJpeg.length)}, ${overCap.reduce((sum, over) => sum + over, 0)} blocks over the cap, ${perPixel.reduce((sum, each) => sum + each, 0)} per pixel${clipped ? `, ${clipped} pixels clipped` : ''}; the .hdr ${kilobytes(panorama.fileBytes)}); boost 2^${(gainMapMin * weight).toFixed(2)} to 2^${(gainMapMax * weight).toFixed(2)} on the coded value; brightest ${Math.round(brightestDecoded)} (the .hdr's ${Math.round(Math.max(...reference.subarray(3 * brightest, 3 * brightest + 3)))}); the sky's luminance off by ${percent(errors[errors.length >> 1])} at the median, ${percent(errors[Math.floor(errors.length * 0.99)])} at the 99th percentile`;
  return { name, file, report, decoded };
}

/** Decode each file with the pinned UltraHDRLoader in the headless browser; compare with this tool's model. */
async function verify(results) {
  const { launchBrowser } = await import('./browser.mjs');
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const origin = 'https://three.invalid';
  await page.route(`${origin}/**`, async (route) => {
    const relative = new URL(route.request().url()).pathname.slice(1);
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) });
  });
  await page.setContent(`<script type="importmap">{"imports":{"three":"${origin}/build/three.module.js"}}</script>`);
  for (const { name, file, decoded } of results) {
    const fromBrowser = Buffer.from(await page.evaluate(async ([base64, loaderUrl]) => {
      const { UltraHDRLoader } = await import(loaderUrl);
      const { HalfFloatType } = await import('three');
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const texture = await new Promise((resolve, reject) => {
        try { new UltraHDRLoader().setDataType(HalfFloatType).parse(bytes.buffer, resolve); } catch (error) { reject(error); }
      });
      const halves = new Uint8Array(texture.data.buffer);
      let binary = '';
      for (let start = 0; start < halves.length; start += 32768) binary += String.fromCharCode(...halves.subarray(start, start + 32768));
      return btoa(binary);
    }, [file.toString('base64'), `${origin}/examples/jsm/loaders/UltraHDRLoader.js`]), 'base64');
    const halves = new Uint16Array(fromBrowser.buffer, fromBrowser.byteOffset, fromBrowser.length / 2);
    let differing = 0;
    for (let index = 0; index < decoded.length / 3; index++) for (let channel = 0; channel < 3; channel++) {
      if (halves[4 * index + channel] !== THREE.DataUtils.toHalfFloat(decoded[3 * index + channel])) differing++;
    }
    console.log(`${name}: UltraHDRLoader ${differing === 0 ? 'decodes exactly as modelled' : `differs from the model in ${differing} values`}`);
    if (differing) process.exitCode = 1;
  }
  await browser.close();
}

const argumentsGiven = process.argv.slice(2);
const quality = Number(argumentsGiven.find((argument) => argument.startsWith('--quality='))?.slice(10) ?? SDR_QUALITY);
const named = argumentsGiven.filter((argument) => !argument.startsWith('--'));
const skyFolder = path.join(root, 'assets/sky');
const inputs = named.length ? named.map((file) => path.resolve(file)) : (await readdir(skyFolder)).filter((file) => /_\d+k\.hdr$/.test(file)).sort().map((file) => path.join(skyFolder, file));
const results = [];
for (const input of inputs) {
  const result = await encodePanorama(input, quality);
  await writeFile(input.replace(/\.hdr$/, '.jpg'), result.file);
  console.log(result.report);
  results.push(result);
}
if (argumentsGiven.includes('--verify')) await verify(results);
