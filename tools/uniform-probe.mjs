// Browser probe: every program the page builds fits the uniform space WebGL 2
// promises each shader stage, so no phone that offers only that much fails to
// link it (a program that does not link draws nothing: a blank pond). WebGL 2
// promises 224 uniform vectors to a fragment shader and 256 to a vertex
// shader (MAX_FRAGMENT_UNIFORM_VECTORS, MAX_VERTEX_UNIFORM_VECTORS: OpenGL ES
// 3.0's least), and 16 textures to each (MAX_TEXTURE_IMAGE_UNITS,
// MAX_VERTEX_TEXTURE_IMAGE_UNITS). SwiftShader and a desktop GPU give far
// more, so nothing else here would notice a program going over; some phones
// give no more than this. The water's fragment shader holds the most (the
// ice's shadows, src/iceShadow.js, sit in it too): mind its count before
// adding to it.
//
// A stage's uniforms are those the program has active that its own source
// declares (one declared in both stages counts in both); they are packed as
// ANGLE packs them before it will compile a shader (GLSL ES 1.00, Appendix A:
// ANGLE's VariablePacker): rows of four components, the four-wide (vec4, mat4)
// from the top, the three-wide (vec3, mat3) in the next rows' first three
// columns, the two-wide (vec2) down columns 0-1 then 2-3, each scalar or
// scalar array in the first column with a run of rows free; the count is the
// fewest rows they fit in. Samplers take texture units, not rows: each
// element of a sampler array one.
//
// The page is started on High and taken through what builds programs of its
// own (src/main.js warmUp builds the core under the veil, the rest on first
// use): a throw, the storm (rain, gale, lightning), the blizzard (snow), thick
// ice with a throw onto it, the Pool, the Koi pond, and Low. Every program
// built along the way is counted, once, where it holds the most. It prints
// each stage's largest, with their headroom, and fails if any program goes
// past WebGL 2's least, naming that program's largest uniforms.
//
//   node tools/uniform-probe.mjs [--all]   (--all: every program's counts)
import { launchBrowser, patience } from './browser.mjs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// WebGL 2's least (OpenGL ES 3.0): uniform vectors and texture units, by stage.
const LEAST = { fragment: { vectors: 224, textures: 16 }, vertex: { vectors: 256, textures: 16 } };
const showAll = process.argv.includes('--all');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const file = path.join(root, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    const data = await readFile(file);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404); response.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
// The GPU if there is one, else SwiftShader (tools/browser.mjs).
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 480, height: 320 } });
await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
  const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
  try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
});
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(String(error)));
// Before any module runs: each shader's stage and source, and each program's shaders, as the page makes them; and the
// count (the header), run in the page after each step.
await page.addInitScript(() => {
  const stageOf = new WeakMap(), sourceOf = new WeakMap(), shadersOf = new WeakMap();
  const prototype = WebGL2RenderingContext.prototype;
  const { createShader, shaderSource, attachShader } = prototype;
  prototype.createShader = function (type) {
    const shader = createShader.call(this, type);
    if (shader) stageOf.set(shader, type === this.FRAGMENT_SHADER ? 'fragment' : 'vertex');
    return shader;
  };
  prototype.shaderSource = function (shader, source) { sourceOf.set(shader, source); return shaderSource.call(this, shader, source); };
  prototype.attachShader = function (program, shader) {
    if (!shadersOf.has(program)) shadersOf.set(program, []);
    shadersOf.get(program).push(shader);
    return attachShader.call(this, program, shader);
  };
  // Whether `variables` ({ columns, rows }) fit in `maxRows` rows of four, as ANGLE's VariablePacker places them.
  function fits(variables, maxRows) {
    const sorted = [...variables].sort((first, second) => second.columns - first.columns);
    const taken = Array.from({ length: maxRows }, () => [false, false, false, false]);
    let index = 0, top = 0;
    for (; index < sorted.length && sorted[index].columns === 4; index++) top += sorted[index].rows;
    if (top > maxRows) return false;
    for (let row = 0; row < top; row++) taken[row].fill(true);
    let threeRows = 0;
    for (; index < sorted.length && sorted[index].columns === 3; index++) threeRows += sorted[index].rows;
    if (top + threeRows > maxRows) return false;
    for (let row = top; row < top + threeRows; row++) taken[row][0] = taken[row][1] = taken[row][2] = true;
    let freeLeft = maxRows - top - threeRows, freeRight = freeLeft, nextLeft = top + threeRows, nextRight = maxRows;
    for (; index < sorted.length && sorted[index].columns === 2; index++) {
      const rows = sorted[index].rows;
      if (rows <= freeLeft) {
        for (let row = nextLeft; row < nextLeft + rows; row++) taken[row][0] = taken[row][1] = true;
        nextLeft += rows; freeLeft -= rows;
      } else if (rows <= freeRight) {
        nextRight -= rows; freeRight -= rows;
        for (let row = nextRight; row < nextRight + rows; row++) taken[row][2] = taken[row][3] = true;
      } else return false;
    }
    for (; index < sorted.length; index++) {
      const rows = sorted[index].rows;
      let placed = false;
      for (let column = 0; column < 4 && !placed; column++) {
        let run = 0;
        for (let row = 0; row < maxRows && !placed; row++) {
          run = taken[row][column] ? 0 : run + 1;
          if (run === rows) { for (let fill = row - rows + 1; fill <= row; fill++) taken[fill][column] = true; placed = true; }
        }
      }
      if (!placed) return false;
    }
    return true;
  }
  function rowsNeeded(variables) {
    let low = 0, high = 4096;
    while (low < high) { const middle = (low + high) >> 1; if (fits(variables, middle)) high = middle; else low = middle + 1; }
    return low;
  }
  window.__uniformCount = () => {
    const renderer = window.__pond.renderer, gl = renderer.getContext();
    const columnsOf = { [gl.FLOAT]: 1, [gl.INT]: 1, [gl.UNSIGNED_INT]: 1, [gl.BOOL]: 1, [gl.FLOAT_VEC2]: 2, [gl.INT_VEC2]: 2, [gl.UNSIGNED_INT_VEC2]: 2, [gl.BOOL_VEC2]: 2,
      [gl.FLOAT_VEC3]: 3, [gl.INT_VEC3]: 3, [gl.UNSIGNED_INT_VEC3]: 3, [gl.BOOL_VEC3]: 3, [gl.FLOAT_VEC4]: 4, [gl.INT_VEC4]: 4, [gl.UNSIGNED_INT_VEC4]: 4, [gl.BOOL_VEC4]: 4,
      [gl.FLOAT_MAT2]: 2, [gl.FLOAT_MAT3]: 3, [gl.FLOAT_MAT4]: 4, [gl.FLOAT_MAT2x3]: 3, [gl.FLOAT_MAT2x4]: 4, [gl.FLOAT_MAT3x2]: 2, [gl.FLOAT_MAT3x4]: 4, [gl.FLOAT_MAT4x2]: 2, [gl.FLOAT_MAT4x3]: 3 };
    const matrixRows = { [gl.FLOAT_MAT2]: 2, [gl.FLOAT_MAT3]: 3, [gl.FLOAT_MAT4]: 4, [gl.FLOAT_MAT2x3]: 2, [gl.FLOAT_MAT2x4]: 2, [gl.FLOAT_MAT3x2]: 3, [gl.FLOAT_MAT3x4]: 3, [gl.FLOAT_MAT4x2]: 4, [gl.FLOAT_MAT4x3]: 4 };
    const counted = [];
    for (const info of renderer.info.programs) {
      const shaders = shadersOf.get(info.program) ?? [];
      const stages = {};
      for (const shader of shaders) {
        const source = sourceOf.get(shader), stage = stageOf.get(shader);
        if (!source || !stage) continue;
        const declared = new Map();
        for (const match of source.matchAll(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)/g)) declared.set(match[2], match[1]);
        stages[stage] = { declared, variables: [], textures: 0, uniforms: [] };
      }
      const count = gl.getProgramParameter(info.program, gl.ACTIVE_UNIFORMS);
      for (let index = 0; index < count; index++) {
        const uniform = gl.getActiveUniform(info.program, index), base = uniform.name.split(/[[.]/)[0];
        for (const stage of Object.values(stages)) {
          const type = stage.declared.get(base);
          if (type === undefined) continue;
          if (type.includes('sampler')) { stage.textures += uniform.size; continue; }
          const columns = columnsOf[uniform.type];
          if (columns === undefined) continue;
          const variable = { name: uniform.name, columns, rows: (matrixRows[uniform.type] ?? 1) * uniform.size };
          stage.variables.push(variable);
        }
      }
      const label = `${info.name || info.type} [${[...(stages.fragment?.declared.keys() ?? [])].filter((name) => /^u[A-Z]/.test(name)).slice(0, 3).join(', ')}]`;
      const entry = { key: `${info.type} ${info.cacheKey}`, label };
      for (const [stage, { variables, textures }] of Object.entries(stages)) {
        const largest = [...variables].sort((first, second) => second.rows * second.columns - first.rows * first.columns).slice(0, 8).map(({ name, columns, rows }) => `${name} ${rows}×${columns}`);
        entry[stage] = { vectors: rowsNeeded(variables), textures, largest };
      }
      counted.push(entry);
    }
    return counted;
  };
});

await page.goto(`http://localhost:${server.address().port}/index.html?quality=high&paused=1`, { waitUntil: 'domcontentloaded' });
// Playwright's second argument goes to the page; the options are the third. Stretched on SwiftShader (tools/browser.mjs).
await page.waitForFunction(() => window.__pond && document.querySelector('#veil')?.classList.contains('gone'), undefined, { timeout: patience(180000) });

// Each program where it holds the most, by its cache key.
const programs = new Map();
async function count(step) {
  for (const entry of await page.evaluate(() => window.__uniformCount())) {
    const known = programs.get(entry.key);
    const holds = (candidate) => (candidate.fragment?.vectors ?? 0) + (candidate.vertex?.vectors ?? 0);
    if (!known || holds(entry) > holds(known)) programs.set(entry.key, { ...entry, step });
  }
}
const steps = [
  ['the start (High)', () => {}],
  ['a throw', (pond) => { pond.throwAt(0, -1.4, { radius: 0.03 }); pond.advance(1); }],
  ['the storm', async (pond) => { await pond.setWeather('storm'); pond.throwAt(0.2, -1.2, { radius: 0.03 }); pond.advance(1); }],
  ['the blizzard', async (pond) => { await pond.setWeather('blizzard'); pond.advance(1); }],
  ['thick ice', async (pond) => { await pond.setWeather('clear'); pond.setIce('thick'); pond.throwAt(-0.3, -1.3, { radius: 0.03 }); pond.advance(3); }],
  ['the Pool', async (pond) => { pond.setIce('none'); await pond.setSky('pool'); pond.throwAt(0, -1.4, { radius: 0.03 }); pond.advance(1); }],
  ['the Koi pond', async (pond) => { await pond.setSky('koi'); pond.throwAt(0, -1.4, { radius: 0.03, thing: 'pizza' }); pond.advance(1); }],
  ['Low', (pond) => { pond.setQuality('low'); pond.advance(1); }],
];
for (const [name, step] of steps) {
  await page.evaluate(`(${step.toString()})(window.__pond)`);
  await count(name);
}

const failures = [];
const entries = [...programs.values()];
for (const [stage, least] of Object.entries(LEAST)) {
  const ranked = entries.filter((entry) => entry[stage]).sort((first, second) => second[stage].vectors - first[stage].vectors);
  const mostTextures = Math.max(...ranked.map((entry) => entry[stage].textures));
  console.log(`${stage}: ${ranked.length} programs; the most uniform vectors ${ranked[0][stage].vectors} of ${least.vectors} (${least.vectors - ranked[0][stage].vectors} to spare), the most textures ${mostTextures} of ${least.textures}`);
  for (const entry of showAll ? ranked : ranked.slice(0, 3)) console.log(`  ${String(entry[stage].vectors).padStart(4)} vectors, ${String(entry[stage].textures).padStart(2)} textures  ${entry.label} (${entry.step})`);
  for (const entry of ranked) {
    if (entry[stage].vectors > least.vectors) failures.push(`${entry.label}'s ${stage} shader packs into ${entry[stage].vectors} uniform vectors, past WebGL 2's ${least.vectors}; its largest: ${entry[stage].largest.join(', ')}`);
    if (entry[stage].textures > least.textures) failures.push(`${entry.label}'s ${stage} shader samples ${entry[stage].textures} textures, past WebGL 2's ${least.textures}`);
  }
}
if (problems.length) failures.push(`page errors: ${problems.slice(0, 3).join(' | ')}`);

await browser.close();
server.close();
if (failures.length) {
  console.log(`\nuniform-probe: ${failures.length} failed:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nuniform-probe: every program fits WebGL 2\'s least');
