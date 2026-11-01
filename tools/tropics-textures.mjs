// Writes the Polynesian lagoon's two scanned surface textures (src/tropics.js
// SURFACES): assets/tropics/bark.jpg, the coconut palms' trunks, from Poly
// Haven's Palm Tree Bark (1.3 m round the trunk, 2.6 m up it), and
// assets/tropics/sand.jpg, the beach's dry sand, from its Sand 03 (2 m
// square; both CC0). Each is the photoscan's 1k colour and OpenGL normal map,
// downloaded at each run (never kept), averaged down `shrink` times each way
// (the bark: a trunk is never nearer the eye than 15 m, where 2.5 mm a texel
// is finer than a pixel at any zoom), packed into one JPEG, as a game packs a
// material's channels:
//   R, G   the normal's x and y, each n · ½ + ½: x along the image's rows, y
//          down its columns (the GL map's green, which points up the image,
//          negated), so the shader, sampling the image as it lies (row 0 at
//          v = 0, no flip), reads the surface's slope along u and v as
//          (−x/z, −y/z), z from x and y;
//   B      the colour's luminance (linear, Rec. 709) over its mean, halved:
//          ½ is the material's own colour, which the shader keeps (the
//          trunk's vertex colour, the place's sand), so only the scan's
//          detail is taken from it.
// Encoded at QUALITY, its chroma kept whole (4:4:4), so the channels keep
// apart. Never edit the files: rerun this.
//
//   node tools/tropics-textures.mjs
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import encodeJpeg, { init as initEncoder } from '@jsquash/jpeg/encode.js';
import decodeJpeg, { init as initDecoder } from '@jsquash/jpeg/decode.js';

const SOURCES = { bark: { asset: 'palm_tree_bark', shrink: 2 }, sand: { asset: 'sand_03', shrink: 1 } };
const RESOLUTION = '1k';
const QUALITY = 88;
const URL_OF = (asset, map) => `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/${RESOLUTION}/${asset}/${asset}_${map}_${RESOLUTION}.jpg`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const codecFolder = path.dirname(require.resolve('@jsquash/jpeg/encode.js'));
await initEncoder(new WebAssembly.Module(await readFile(path.join(codecFolder, 'codec/enc/mozjpeg_enc.wasm'))));
await initDecoder(new WebAssembly.Module(await readFile(path.join(codecFolder, 'codec/dec/mozjpeg_dec.wasm'))));

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return decodeJpeg(await response.arrayBuffer());
}
const toLinear = (byte) => { const value = byte / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };

await mkdir(path.join(root, 'assets/tropics'), { recursive: true });
for (const [name, { asset, shrink }] of Object.entries(SOURCES)) {
  const colour = await download(URL_OF(asset, 'diff'));
  const normal = await download(URL_OF(asset, 'nor_gl'));
  if (colour.width !== normal.width || colour.height !== normal.height) throw new Error(`${asset}: its maps differ in size`);
  const width = colour.width / shrink, height = colour.height / shrink;
  const pixels = width * height;
  // Each texel the mean of the source's `shrink`² under it: the luminance linear, the normal's tilt (renormalised
  // after, so a texel over a crease keeps its lean).
  const luminance = new Float64Array(pixels), tilt = new Float64Array(pixels * 3);
  let sum = 0;
  for (let row = 0; row < colour.height; row++) {
    for (let column = 0; column < colour.width; column++) {
      const source = 4 * (row * colour.width + column), index = Math.floor(row / shrink) * width + Math.floor(column / shrink);
      luminance[index] += (0.2126 * toLinear(colour.data[source]) + 0.7152 * toLinear(colour.data[source + 1]) + 0.0722 * toLinear(colour.data[source + 2])) / shrink ** 2;
      for (let axis = 0; axis < 3; axis++) tilt[3 * index + axis] += normal.data[source + axis] / 255 * 2 - 1;
    }
  }
  for (let index = 0; index < pixels; index++) sum += luminance[index];
  const mean = sum / pixels;
  const packed = new Uint8ClampedArray(pixels * 4);
  let clipped = 0, steepest = 0;
  for (let index = 0; index < pixels; index++) {
    const length = Math.hypot(tilt[3 * index], tilt[3 * index + 1], tilt[3 * index + 2]);
    const x = tilt[3 * index] / length, y = tilt[3 * index + 1] / length;
    steepest = Math.max(steepest, Math.hypot(x, y));
    const detail = 0.5 * luminance[index] / mean;
    if (detail > 1) clipped++;
    packed[4 * index] = Math.round((x * 0.5 + 0.5) * 255);
    packed[4 * index + 1] = Math.round((-y * 0.5 + 0.5) * 255);
    packed[4 * index + 2] = Math.round(Math.min(detail, 1) * 255);
    packed[4 * index + 3] = 255;
  }
  const file = Buffer.from(await encodeJpeg({ data: packed, width, height }, { quality: QUALITY, auto_subsample: false, chroma_subsample: 1 }));
  await writeFile(path.join(root, 'assets/tropics', `${name}.jpg`), file);
  console.log(`assets/tropics/${name}.jpg  ${width}×${height}  ${(file.length / 1024).toFixed(0)} KB  from ${asset}; detail clipped in ${(100 * clipped / pixels).toFixed(2)}%, steepest normal ${steepest.toFixed(2)} off vertical`);
}
