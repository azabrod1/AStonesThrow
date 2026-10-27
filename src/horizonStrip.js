// The horizon strip's file taken apart for the GPU (src/sky.js, Horizon).
//
// The strip (assets/sky/<file>_horizon.jpg, tools/sky-encode.mjs) is a JPEG
// gain map as the panorama is, but 8192 × 456: decoded as the panorama is,
// by UltraHDRLoader on the main thread, it would hold the page for its
// 3.7 million pixels (the 2k panorama's 2 million take a good part of the
// start on a phone, under the veil; the strip comes after it, in play).
// So the page decodes it on the GPU instead: the file's two JPEGs, the base
// image and the gain map, become two 8-bit textures through the browser's
// own decoder (createImageBitmap, off the main thread), and the dome's
// shader raises each base byte by its gain byte as UltraHDRLoader would
// (HORIZON_DECODE, the loader's arithmetic as tools/sky-encode.mjs models
// it; the strip is coded for that arithmetic). Nothing is looped in
// JavaScript, and the two textures hold 15 MB and 3.7 MB (the gain map one
// byte a texel) against the 30 MB of half floats.
//
// The file's layout (the encoder writes it; "Ultra HDR"): the base JPEG,
// with a Multi-Picture Format directory (an APP2 segment, 'MPF\0') whose
// second entry says where the gain map's JPEG starts and how long it is;
// the gain map's XMP (an APP1 segment) holds GainMapMin, GainMapMax,
// HDRCapacityMin and HDRCapacityMax, from which the loader takes a weight.
//
// The decode (the loader's, three 0.183.2): a base byte b and a gain byte g
// give linear = toLinear(b · 2^(w · (GainMapMin + (GainMapMax − GainMapMin) · g / 255)))
// with toLinear the sRGB curve on the coded value 0 to 255 and past it
// (the loader reads a table at the integer part below 1024; the GPU takes
// the curve itself, within a coded level of it: --verify in the encoder
// measures the difference).
//
// Pure functions: the parse takes an ArrayBuffer and gives the two JPEGs'
// bytes and the metadata; decodeHorizonStrip adds the browser's decode to
// ImageBitmaps (colour management off, as the loader has it). No Three.js.

/** The sRGB curve on a coded value (the loader's toLinear), for the dome and the encoder's verify. */
export const HORIZON_DECODE = /* glsl */`
uniform sampler2D uHorizon;       // the strip's base image, bytes
uniform sampler2D uHorizonGain;   // its gain map, a byte a texel
uniform vec2 uHorizonMeta;        // w · GainMapMin, w · (GainMapMax − GainMapMin)
uniform vec4 uHorizonBand;        // the strip's width and height (texels; width 0: no strip), the elevation (radians) of its top row and of its bottom row
float horizonLinear(float coded) {
  return min(coded < 10.31475 ? coded * 0.000303527 : pow(coded * 0.003717127 + 0.0521327014, 2.4), 65504.0);   // the loader clamps to half floats' range
}
// The radiance of one texel (x wrapping with the azimuth, y clamped to the strip).
vec3 horizonTexel(vec2 texel) {
  vec2 uv = (vec2(texel.x, clamp(texel.y, 0.0, uHorizonBand.y - 1.0)) + 0.5) / uHorizonBand.xy;
  vec3 base = texture2D(uHorizon, uv).rgb * 255.0;
  float boost = exp2(uHorizonMeta.x + uHorizonMeta.y * texture2D(uHorizonGain, uv).r);
  return vec3(horizonLinear(base.r * boost), horizonLinear(base.g * boost), horizonLinear(base.b * boost));
}
// The strip's radiance at uv (0 to 1 across and down it), bilinear in the linear values: each texel is
// decoded with its own gain, so the base bytes of two blocks coded for different gains never mix.
vec3 horizonRadiance(vec2 uv) {
  vec2 position = uv * uHorizonBand.xy - 0.5;
  vec2 corner = floor(position);
  vec2 within = position - corner;
  vec3 lower = mix(horizonTexel(corner), horizonTexel(corner + vec2(1.0, 0.0)), within.x);
  vec3 upper = mix(horizonTexel(corner + vec2(0.0, 1.0)), horizonTexel(corner + vec2(1.0, 1.0)), within.x);
  return mix(lower, upper, within.y);
}
`;

const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

/** The JPEG's marker segments: [{ marker, start, length, payload }] up to the scan (SOS), whose data runs to the end. */
function segments(bytes) {
  const found = [];
  let offset = 2;   // after SOI
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) break;   // SOS: entropy-coded data follows
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    found.push({ marker, start: offset, length, payload: bytes.subarray(offset + 4, offset + 2 + length) });
    offset += 2 + length;
  }
  return found;
}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
const uint32 = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
const uint16 = (bytes, at) => (bytes[at] << 8) | bytes[at + 1];

/**
 * The strip's file taken apart: { base, gain, metadata } with base and gain
 * the two JPEGs' bytes (Uint8Arrays over the buffer) and metadata the
 * loader's { gainMapMin, gainMapMax, weight }. Throws on a file that is not
 * the encoder's.
 */
export function parseHorizonStrip(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('The horizon strip is not a JPEG');
  const directory = segments(bytes).find((segment) => segment.marker === 0xe2 && ascii(segment.payload, 0, 4) === 'MPF\0');
  if (!directory) throw new Error('The horizon strip has no Multi-Picture directory');
  const tiff = directory.start + 4 + 4;   // the TIFF header: after the marker, the length and 'MPF\0'
  if (ascii(bytes, tiff, 2) !== 'MM') throw new Error('The horizon strip\'s directory is not big-endian');
  const ifd = tiff + uint32(bytes, tiff + 4);
  const tags = uint16(bytes, ifd);
  let entries = -1;
  for (let tag = 0; tag < tags; tag++) {
    const at = ifd + 2 + 12 * tag;
    if (uint16(bytes, at) === 0xb002) entries = tiff + uint32(bytes, at + 8);
  }
  if (entries < 0) throw new Error('The horizon strip\'s directory has no images');
  const gainSize = uint32(bytes, entries + 16 + 4);
  const gainStart = tiff + uint32(bytes, entries + 16 + 8);
  if (gainStart + gainSize > bytes.length) throw new Error('The horizon strip\'s gain map runs past the file');
  const base = bytes.subarray(0, gainStart);
  const gain = bytes.subarray(gainStart, gainStart + gainSize);
  const xmp = segments(gain).find((segment) => segment.marker === 0xe1 && ascii(segment.payload, 0, XMP_HEADER.length) === XMP_HEADER);
  if (!xmp) throw new Error('The horizon strip\'s gain map has no XMP');
  const xml = ascii(xmp.payload, XMP_HEADER.length, xmp.payload.length - XMP_HEADER.length);
  const number = (name) => {
    const match = xml.match(new RegExp(`hdrgm:${name}="([^"]+)"`));
    if (!match) throw new Error(`The horizon strip's XMP has no ${name}`);
    return Number(match[1]);
  };
  const [gainMapMin, gainMapMax, hdrCapacityMin, hdrCapacityMax] = ['GainMapMin', 'GainMapMax', 'HDRCapacityMin', 'HDRCapacityMax'].map(number);
  // The loader's weight from the capacities, as it parses them.
  const weight = Math.min(Math.max((Math.log2(1.8 ** (hdrCapacityMax * 0.5)) - hdrCapacityMin) / (hdrCapacityMax - hdrCapacityMin), 0), 1);
  return { base, gain, metadata: { gainMapMin, gainMapMax, weight } };
}

/**
 * The strip decoded for the GPU: { base, gain, metadata, width, height },
 * base and gain ImageBitmaps of the two JPEGs with the browser's colour
 * management off (the bytes as coded). Close both when done with them.
 */
export async function decodeHorizonStrip(buffer) {
  const { base, gain, metadata } = parseHorizonStrip(buffer);
  const options = { colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'none' };
  const [baseImage, gainImage] = await Promise.all([base, gain].map((jpeg) => createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }), options)));
  if (baseImage.width !== gainImage.width || baseImage.height !== gainImage.height) {
    baseImage.close(); gainImage.close();
    throw new Error('The horizon strip\'s gain map is not the base image\'s size');
  }
  return { base: baseImage, gain: gainImage, metadata, width: baseImage.width, height: baseImage.height };
}
