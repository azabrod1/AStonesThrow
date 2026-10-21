// A Radiance .hdr panorama (RGBE: three mantissa bytes and a shared
// exponent a pixel, its scanlines run-length encoded) decoded into half
// floats, RGBA, for a THREE.DataTexture (src/sky.js loads one each time the
// place or the hour changes).
//
// It makes the texels three's HDRLoader makes with HalfFloatType, bit for
// bit (tools/hdr-test.mjs checks every panorama in assets/sky/), in a
// fraction of the time. HDRLoader works out each channel of each pixel as a
// float, byte · 2^(exponent − 128) / 255, held to 65504, and converts it to
// a half (Math.pow and DataUtils.toHalfFloat, six million times for a 2k
// panorama: about 180 ms of the main thread on a desktop, several times that
// on a phone, while the pond stands still). A channel's half depends on its
// byte and its pixel's exponent alone, so HALF_OF holds all 65536 of them,
// made by the same expression once, on the first decode (128 kB), and each
// channel is one lookup. The header and the run-length decoding follow
// HDRLoader's: a file it refuses, this refuses.
import { DataUtils } from 'three';

const HALF_MAX = 65504;
const HALF_ONE = DataUtils.toHalfFloat(1);
let HALF_OF = null;   // [exponent << 8 | byte] -> the channel's half

function halfTable() {
  if (HALF_OF) return HALF_OF;
  HALF_OF = new Uint16Array(65536);
  for (let exponent = 0; exponent < 256; exponent++) {
    const scale = Math.pow(2.0, exponent - 128.0) / 255.0;
    for (let byte = 0; byte < 256; byte++) HALF_OF[(exponent << 8) | byte] = DataUtils.toHalfFloat(Math.min(byte * scale, HALF_MAX));
  }
  return HALF_OF;
}

const fail = (message) => { throw new Error(`hdr: ${message}`); };

/** The header's lines up to the image size: its width, its height and where the pixels start. */
function readHeader(bytes) {
  let position = 0;
  const line = () => {
    const end = bytes.indexOf(0x0a, position);
    if (end < 0) return null;
    let text = '';
    for (let index = position; index < end; index++) text += String.fromCharCode(bytes[index]);
    position = end + 1;
    return text;
  };
  if (!/^#\?(\S+)/.test(line() ?? '')) fail('bad initial token');
  let format = false, width = 0, height = 0;
  for (let text = line(); text !== null; text = line()) {
    if (text.charAt(0) === '#') continue;
    if (/^\s*FORMAT=(\S+)\s*$/.test(text)) format = true;
    const size = text.match(/^\s*-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/);
    if (size) { height = parseInt(size[1], 10); width = parseInt(size[2], 10); }
    if (format && width) break;
  }
  if (!format) fail('missing format specifier');
  if (!width) fail('missing image size specifier');
  return { width, height, start: position };
}

/**
 * Decode an .hdr file's bytes (an ArrayBuffer) into { width, height, data },
 * data a Uint16Array of width · height RGBA halves, the top row first (as
 * HDRLoader's: the texture's flipY puts it at the top).
 */
export function decodeHdr(buffer) {
  const bytes = new Uint8Array(buffer);
  const { width, height, start } = readHeader(bytes);
  const half = halfTable();
  const data = new Uint16Array(width * height * 4);
  const pixels = bytes.subarray(start);
  // A file whose scanlines are not run-length encoded holds the pixels as they are.
  if (width < 8 || width > 0x7fff || pixels[0] !== 2 || pixels[1] !== 2 || (pixels[2] & 0x80)) {
    const count = Math.min(width * height, pixels.length >> 2);
    for (let pixel = 0, from = 0, to = 0; pixel < count; pixel++, from += 4, to += 4) {
      const exponent = pixels[from + 3] << 8;
      data[to] = half[exponent | pixels[from]];
      data[to + 1] = half[exponent | pixels[from + 1]];
      data[to + 2] = half[exponent | pixels[from + 2]];
      data[to + 3] = HALF_ONE;
    }
    return { width, height, data };
  }
  // Each scanline: 2, 2, its width (two bytes), then its reds, greens, blues and exponents one after another, each as
  // runs: a count over 128 repeats the next byte count − 128 times, any other count is that many bytes as they are.
  const scanline = new Uint8Array(4 * width);
  let position = 0, to = 0;
  for (let row = 0; row < height && position < pixels.length; row++) {
    if (position + 4 > pixels.length) fail('read error');
    if (pixels[position] !== 2 || pixels[position + 1] !== 2 || ((pixels[position + 2] << 8) | pixels[position + 3]) !== width) fail('bad rgbe scanline format');
    position += 4;
    let filled = 0;
    while (filled < 4 * width && position < pixels.length) {
      let count = pixels[position++];
      const repeated = count > 128;
      if (repeated) count -= 128;
      if (count === 0 || filled + count > 4 * width) fail('bad scanline data');
      if (repeated) {
        scanline.fill(pixels[position++], filled, filled + count);
      } else {
        scanline.set(pixels.subarray(position, position + count), filled);
        position += count;
      }
      filled += count;
    }
    for (let column = 0; column < width; column++, to += 4) {
      const exponent = scanline[column + 3 * width] << 8;
      data[to] = half[exponent | scanline[column]];
      data[to + 1] = half[exponent | scanline[column + width]];
      data[to + 2] = half[exponent | scanline[column + 2 * width]];
      data[to + 3] = HALF_ONE;
    }
  }
  // A file cut short leaves the rest black, as HDRLoader does.
  for (; to < data.length; to += 4) data[to + 3] = HALF_ONE;
  return { width, height, data };
}
