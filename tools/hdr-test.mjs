// CPU check of src/hdr.js, the sky's panorama decoder: npm test runs it.
//
//   node tools/hdr-test.mjs
//
// Every panorama in assets/sky/ decodes to the texels three's HDRLoader makes
// with HalfFloatType, bit for bit; so do a file whose scanlines are not
// run-length encoded and one cut short; a file without the magic token is
// refused. Prints both decoders' time for each panorama (median of three).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { decodeHdr } from '../src/hdr.js';

const skyFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sky');
const loader = new HDRLoader().setDataType(THREE.HalfFloatType);
const arrayBufferOf = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const median = (values) => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)];
const timed = (work) => { const times = []; let result; for (let run = 0; run < 3; run++) { const started = performance.now(); result = work(); times.push(performance.now() - started); } return { result, milliseconds: median(times) }; };

/** Both decoders agree on `buffer`: its size and every half. */
function same(buffer, label) {
  const theirs = loader.parse(buffer);
  const ours = decodeHdr(buffer);
  assert.equal(ours.width, theirs.width, `${label}: width`);
  assert.equal(ours.height, theirs.height, `${label}: height`);
  assert.equal(ours.data.length, theirs.data.length, `${label}: length`);
  for (let index = 0; index < ours.data.length; index++) {
    if (ours.data[index] !== theirs.data[index]) assert.fail(`${label}: half ${index} is ${ours.data[index]}, HDRLoader's ${theirs.data[index]}`);
  }
}

let ourTotal = 0, theirTotal = 0, files = 0;
for (const name of readdirSync(skyFolder).filter((entry) => entry.endsWith('.hdr')).sort()) {
  const buffer = arrayBufferOf(readFileSync(path.join(skyFolder, name)));
  same(buffer, name);
  const theirs = timed(() => loader.parse(buffer)).milliseconds;
  const ours = timed(() => decodeHdr(buffer)).milliseconds;
  ourTotal += ours;
  theirTotal += theirs;
  files++;
  console.log(`  ${name.padEnd(46)} HDRLoader ${theirs.toFixed(0).padStart(4)} ms, decodeHdr ${ours.toFixed(0).padStart(3)} ms`);
}
assert(files > 0, 'no panoramas found');
console.log(`PASS: ${files} panoramas decode to HDRLoader's halves bit for bit, in ${(ourTotal / files).toFixed(0)} ms each against ${(theirTotal / files).toFixed(0)} ms`);

// A small file of every exponent and byte, not run-length encoded (8 wide is the least run-length encoding allows, so 4 is flat).
{
  const width = 4, height = 64;
  const header = new TextEncoder().encode(`#?RADIANCE\n# a comment\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index++) pixels[index] = (index * 37 + (index >> 2) * 11) & 255;
  const bytes = new Uint8Array(header.length + pixels.length);
  bytes.set(header);
  bytes.set(pixels, header.length);
  same(bytes.buffer, 'a flat file');
  console.log('PASS: a file without run-length encoding decodes as HDRLoader decodes it');
}

// The smallest panorama cut short, mid-scanline: the rows it lacks are black, opaque.
{
  const name = readdirSync(skyFolder).filter((entry) => entry.endsWith('.hdr')).sort()[0];
  const whole = readFileSync(path.join(skyFolder, name));
  same(arrayBufferOf(whole.subarray(0, Math.floor(whole.length * 0.6))), `${name} cut short`);
  console.log('PASS: a file cut short decodes as HDRLoader decodes it');
}

assert.throws(() => decodeHdr(new TextEncoder().encode('P6\n4 4\n255\n').buffer), /bad initial token/);
console.log('PASS: a file that is not a Radiance picture is refused');
