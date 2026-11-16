// The mirror image's mip levels remade over a region alone (src/mirrorRegion.js
// refreshMipsInRegion), against the whole chain three makes (generateMipmap),
// in a browser:
//
//   node tools/mirror-mips-probe.mjs
//
// refreshMipsInRegion reaches into three's renderer for the target's texture
// and its framebuffer bindings, and stands in for generateMipmap wherever the
// mirror image is drawn again over a region (a splash's, a floater's, a
// bird's: src/main.js drawMirror). A three.js that kept those otherwise would
// leave the water's spread mirror (the levels below the first) stale or wrong
// there, and nothing else would notice: the frames differ by a level.
//
// It draws a target made as the mirror's is (half floats, mipmapped: src/gpu.js
// createFloatTarget) whole, then a picture changed inside a region with the
// levels remade over the region alone, and reads every level back beside
// those of the same picture drawn whole:
// - every level is what the module says it makes: each texel whose four
//   texels in the level above took in a change is their mean (the box filter
//   generateMipmap's is), and no other texel is touched, on a target whose
//   sides are powers of two and on one of the mirror's own kind of size, its
//   levels odd (an odd level's last row or column, which a driver may fold
//   three texels into, is left as the whole chain last made it);
// - on the power-of-two target the levels are the whole chain's too, as the
//   driver makes it (on odd levels a driver's filter is its own: it may make
//   a texel from three of the level above where the blit takes two, so the
//   two are a texel apart there, and are not compared); a level left stale
//   would be out by the picture's whole range;
// - three's own state is as it was: the draws after it make no GL error, and
//   a whole draw afterwards is the whole picture again.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, patience } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEAN = 0.002;    // how near its four texels' mean a remade texel must be (values 0 to 1, kept as half floats)
const SAME = 0.02;     // the most a power-of-two target's levels may differ from the driver's whole chain by

// The page: its own modules from the repository, three from node_modules.
const PAGE = `<!doctype html><meta charset="utf-8"><title>mirror mips</title>
<script type="importmap">{ "imports": { "three": "/node_modules/three/build/three.module.js" } }</script>
<script type="module">
import * as THREE from 'three';
import { createFloatTarget } from '/src/gpu.js';
import { refreshMipsInRegion } from '/src/mirrorRegion.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
const gl = renderer.getContext();
// A picture over the whole target, smooth, and inside a patch (uPatch: its corners, pixels) another.
const material = new THREE.ShaderMaterial({
  uniforms: { uPatch: { value: new THREE.Vector4() } },
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: \`uniform vec4 uPatch;
    void main() {
      vec2 pixel = gl_FragCoord.xy;
      vec3 colour = 0.5 + 0.5 * vec3(sin(pixel.x * 0.11), sin(pixel.y * 0.07 + 1.0), sin((pixel.x + pixel.y) * 0.05));
      if (all(greaterThanEqual(pixel, uPatch.xy)) && all(lessThan(pixel, uPatch.zw))) colour = vec3(1.0, 0.9, 0.8) - 0.6 * colour;
      gl_FragColor = vec4(colour, 0.5 + 0.5 * sin(pixel.x * 0.03));
    }\`,
});
const scene = new THREE.Scene(), camera = new THREE.Camera();
const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
sheet.frustumCulled = false;
scene.add(sheet);

/** The picture drawn into \`target\`, with its patch or (null) without: whole, three making the whole chain; or over \`region\` alone, its levels remade there. */
function draw(target, patch, region = null) {
  if (patch) material.uniforms.uPatch.value.set(patch.x, patch.y, patch.x + patch.z, patch.y + patch.w);
  else material.uniforms.uPatch.value.set(-1, -1, -1, -1);
  if (region) { target.scissor.copy(region); target.scissorTest = true; }
  target.texture.generateMipmaps = !region;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  target.scissorTest = false;
  target.texture.generateMipmaps = true;
  renderer.setRenderTarget(null);
  if (region) refreshMipsInRegion(renderer, target, region);
}

/** Every mip level of \`target\`, read back: each its width, height and numbers. */
function levelsOf(target) {
  const texture = renderer.properties.get(target.texture).__webglTexture;
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const levels = [];
  for (let level = 0, width = target.width, height = target.height; ; level++, width = Math.max(1, width >> 1), height = Math.max(1, height >> 1)) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, level);
    const numbers = new Float32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, numbers);
    levels.push({ width, height, numbers });
    if (width === 1 && height === 1) break;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  renderer.resetState();
  return levels;
}

/** The most two targets' levels differ by, level by level. */
function difference(one, other) {
  return one.map((level, index) => {
    let most = 0;
    for (let at = 0; at < level.numbers.length; at++) most = Math.max(most, Math.abs(level.numbers[at] - other[index].numbers[at]));
    return most;
  });
}

/**
 * A target's levels after a region's draw (\`after\`) against those before it: how many texels were remade, how many are
 * wrong (neither the mean of their four texels above, where any of those changed, nor left as they were, where none
 * did), and how far the worst remade one is from its mean. An odd level's last row or column, with no four above, is left out.
 */
function remaking(before, after) {
  let remade = 0, wrong = 0, worst = 0, texels = 0;
  for (let level = 1; level < after.length; level++) {
    const above = after[level - 1], aboveBefore = before[level - 1], here = after[level], hereBefore = before[level];
    for (let row = 0; row < here.height; row++) {
      for (let column = 0; column < here.width; column++) {
        const columns = above.width === 1 ? [0] : [2 * column, 2 * column + 1], rows = above.height === 1 ? [0] : [2 * row, 2 * row + 1];
        if (columns.at(-1) >= above.width || rows.at(-1) >= above.height) continue;
        texels++;
        let changedAbove = false, changedHere = false, off = 0;
        for (let channel = 0; channel < 4; channel++) {
          let sum = 0;
          for (const aboveRow of rows) for (const aboveColumn of columns) {
            const at = (aboveRow * above.width + aboveColumn) * 4 + channel;
            sum += above.numbers[at];
            if (above.numbers[at] !== aboveBefore.numbers[at]) changedAbove = true;
          }
          const at = (row * here.width + column) * 4 + channel;
          off = Math.max(off, Math.abs(here.numbers[at] - sum / (rows.length * columns.length)));
          if (here.numbers[at] !== hereBefore.numbers[at]) changedHere = true;
        }
        if (changedHere) remade++;
        if (changedAbove) { worst = Math.max(worst, off); if (off > ${MEAN}) wrong++; }
        else if (changedHere && off > ${MEAN}) wrong++;
      }
    }
  }
  return { remade, wrong, worst, texels };
}

window.result = (() => {
  const runs = [];
  for (const [width, height, patch] of [[512, 256, new THREE.Vector4(37, 21, 90, 57)], [730, 411, new THREE.Vector4(201, 99, 123, 77)]]) {
    const options = { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true, mipmaps: true };   // as src/main.js makes the mirror's
    const whole = createFloatTarget(width, height, options), regional = createFloatTarget(width, height, options);
    draw(whole, patch);
    draw(regional, null);
    const wholeLevels = levelsOf(whole), before = levelsOf(regional);
    const stale = difference(wholeLevels, before);   // before the region is drawn: how far out a level left alone is
    draw(regional, patch, patch);
    const after = levelsOf(regional);
    const remade = difference(wholeLevels, after);
    draw(regional, patch);
    const again = difference(wholeLevels, levelsOf(regional));
    runs.push({ width, height, levels: remade.length, stale, remade, again, remaking: remaking(before, after), error: gl.getError() });
    whole.dispose(); regional.dispose();
  }
  return runs;
})();
</script>`;

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname === '/mirror-mips.html') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(PAGE); return; }
    const file = path.join(root, decodeURIComponent(pathname));
    if (!file.startsWith(root)) throw new Error('outside');
    const body = await readFile(file);   // read before the head is written: a file that is not there is a 404
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, resolve));
const browser = await launchBrowser();
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(String(error)));   // (the console's warnings are the driver's, of the read-backs)
await page.goto(`http://localhost:${server.address().port}/mirror-mips.html`);
const runs = await page.waitForFunction(() => window.result, null, { timeout: patience(60000) }).then((handle) => handle.jsonValue(), (error) => { console.log(`the page gave no result: ${error.message}; ${problems.join(' | ')}`); return null; });
await browser.close();
server.close();

const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }
const most = (values, from = 0) => Math.max(...values.slice(from));
check(Boolean(runs) && problems.length === 0, `the page drew and read back the mirror's kind of target (${problems.join(' | ') || 'no errors'})`);
for (const run of runs ?? []) {
  const size = `${run.width}×${run.height}`, even = Number.isInteger(Math.log2(run.width)) && Number.isInteger(Math.log2(run.height));
  check(most(run.stale, 1) > 0.2, `${size}: left alone, the levels under a changed region are out by up to ${most(run.stale, 1).toFixed(2)} (what a stale level would show)`);
  check(run.remade[0] === 0, `${size}: the region's draw is the whole draw's first level (${run.remade[0].toExponential(1)})`);
  const { remade, wrong, worst, texels } = run.remaking;
  check(wrong === 0 && remade > 0 && remade < texels, `${size}: of its lower levels' ${texels} texels the ${remade} that took in the change are remade, each its four texels' mean (to ${worst.toExponential(1)}), and no other is touched (${wrong} wrong)`);
  if (even) check(most(run.remade) < SAME, `${size}: its ${run.levels} levels remade over the region are the whole chain's, as the driver makes it, to ${most(run.remade).toExponential(1)} (under ${SAME})`);
  check(run.error === 0 && most(run.again) === 0, `${size}: three draws on as before (GL error ${run.error}), a whole draw after it the whole picture again (${most(run.again).toExponential(1)})`);
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
