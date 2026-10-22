// Browser probe of the quality presets (QUALITY in src/main.js) and of the
// frame loop, through the page itself. Exits with status 1 on a failure.
//
// 1. The page at phone size with ?quality=auto, unpaused, on the real clock:
//    it starts on high; the idle measurement steps it down (under SwiftShader
//    the frame rate is far below the thresholds, so to low; on a real GPU it
//    may stay high and the probe only checks consistency); the readout and
//    the settings' Quality page follow (Auto chosen, its row naming the
//    preset drawn); the idle pond runs no pass of the rings
//    (src/rings.js); the first throw compiles no GPU program (src/main.js
//    compiles them all under the loading veil; a failure names the programs
//    it compiled), and its rings outlive its
//    splash, a spectrum pass and one profile pass each; the splash
//    measurement never steps up. After every change of preset, automatic or
//    pressed, from every preset to every other, it checks what is actually
//    built (window.__pond.budget) against the preset: the solver's grid and
//    its textures, the water mesh's segments and triangles, the canvas, the
//    main, under-water, mirror and fluid targets. A change of preset in the
//    middle of a splash keeps the waves (the solver carries them to the new
//    grid). The Pool water (src/pool.js): switching to it and back compiles
//    no program (the warm-up drew both sceneries), its water mesh draws only
//    the pool's quads, a throw into it compiles none and keeps one ring, the
//    near field's (src/rings.js), which retires with it, and a change of
//    preset in it keeps the pool's mesh. The ice (src/ice.js): freezing the
//    water, a throw that breaks it, its shards (within the preset's) and its
//    flood, a hole's new ice and a frozen pool compile no program, and no
//    gale blows on it. Every kind of thing (src/things.js)
//    thrown at once, the floaters followed until they float in the mirror image,
//    compiles no program, and no first throw builds a fixed mesh or slices
//    its waterline (src/rock.js prepareThing did both under the veil; each
//    throw's time on the main thread is printed, not checked: under
//    SwiftShader one throw's varies from 2 to over 60 ms); a basketball
//    resting afloat adds at most FLOATER_FRAME_CALLS draw calls a frame
//    (its mirror image redrawn as the water moves; calls and triangles
//    printed). What comes to rest stays: in the pool on low the preset's
//    `resting` stones are all there 41 s on, each one draw call, and one more
//    come to rest shrinks the oldest away (src/main.js keepWithinCaps,
//    fadeOut), never at once. The world's
//    step is fixed: a basketball thrown alike at 60 frames a second and in
//    frames of 1/162 s is in the same place 2.5 s on. With the page running,
//    the water's height under a floater beside a splash is read back
//    (src/floaterRide.js), and a throw's sounds play and end (src/sound.js;
//    the browser lets audio start without a gesture here). Throws of every
//    kind, more than low keeps, the pond then cleared, leave no geometry,
//    texture or program behind. Rain (src/rain.js): each weather in
//    turn, with a throw in the downpour and a change of preset, reuses its
//    programs after the first selection, and the tile takes the preset's
//    size; clear again, nothing of the rain runs. The gale (src/galeWaves.js)
//    and the storm: the first gale compiles its passes and spray once, draws the finer
//    sheet that carries its waves, and a throw into it compiles none; the
//    storm compiles none through a lightning strike; in the pool the gale
//    raises no waves; calm again, the still sheet. pause(), resume(), pause(),
//    resume() in one tick leave one frame loop: one render per
//    requestAnimationFrame at most.
// 2. The same page on a fake clock (performance.now and requestAnimationFrame
//    advance a set step per frame, whatever SwiftShader takes, once however
//    many callbacks the frame runs: the probe's own waits poll on it): at 55 frames
//    a second the calibration keeps high through the idle pond and a splash;
//    at 20 a second the watch that follows steps down to medium within a few
//    seconds (even once the pond is still: at 20 a second the idle cap skips
//    no requestAnimationFrame, so the watch counts every frame); and on medium a pond where nothing happens draws every other
//    requestAnimationFrame at 60 a second, its simulated time still keeping
//    up with the clock. Then on high: the still pond draws every other one
//    at 60 a second too, and every fourth at 120 (a 120 Hz display); a throw
//    at twice MAX_FRAME_RATE a second draws every other one, held to
//    MAX_FRAME_RATE, and at MAX_FRAME_RATE every one, as at 90 a second (a
//    90 Hz display's frames are within the ceiling's slack), the idle cap
//    off and the simulated time keeping up throughout.
// 3. A 2560×1440 window on high: the canvas keeps within PIXEL_BUDGET.
//
// Under SwiftShader a second of world time with the solver awake costs some
// 9 s on high and 2.5 on low, so whatever a preset does not change (the pool,
// the ice, the things, the floater, the step, the long session, the ceiling
// on the fake clock) runs on low; each part's seconds are printed.
//
//   node tools/quality-probe.mjs
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALITY, PIXEL_BUDGET, MAX_FRAME_RATE } from '../src/main.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLOATER_FRAME_CALLS = 12;   // the most draw calls a basketball resting afloat may add to a frame: its halves, and its mirror image's region redrawn
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
const containerChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROMIUM || (existsSync(containerChromium) ? containerChromium : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const problems = [];
async function openPage({ width = 390, height = 844, query, initScript = null }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });   // 1×: the logic is the same and SwiftShader is slow
  await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
    const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
    try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
  await page.goto(`http://localhost:${server.address().port}/index.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__pond, undefined, { timeout: 300000 });
  return { page, context, width, height };
}

let failures = 0;
const check = (passed, text) => { console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${text}`); if (!passed) failures++; };
// Each part's seconds, printed as the next begins (under SwiftShader a world second with the solver awake costs some 9 s
// of real time on high, 2.5 on low: whatever does not need high runs on low).
const probeStart = Date.now();
let partStart = probeStart, partName = null;
const part = (name) => {
  const now = Date.now();
  if (partName) console.log(`  (${partName}: ${((now - partStart) / 1000).toFixed(0)} s)`);
  partName = name;
  partStart = now;
};
const order = (name) => ['high', 'medium', 'low'].indexOf(name);

/** What a preset should build for a window of width × height CSS pixels at devicePixelRatio. */
function expected(name, width, height, devicePixelRatio = 1) {
  const preset = QUALITY[name];
  const ratio = Math.min(devicePixelRatio, preset.maxDpr, Math.sqrt(PIXEL_BUDGET / (width * height)));
  const canvas = { width: Math.floor(width * ratio), height: Math.floor(height * ratio) };
  const scaled = (fraction, least) => ({ width: Math.max(least, Math.round(canvas.width * fraction)), height: Math.max(least, Math.round(canvas.height * fraction)) });
  return { grid: preset.grid, meshSegments: preset.meshSegments, canvas, under: scaled(preset.underScale, 1), fluid: scaled(preset.fluidScale, 2) };
}
const size = ({ width, height }) => `${width}×${height}`;
/** The quads across the water mesh: the patch's segments, or in the pool those over its square and one round it (src/waterSurface.js). */
const quadsAcross = (segments, pool) => (pool ? Math.min(Math.ceil(pool.size / (pool.domainSize / segments)) + 2, segments) : segments);
async function checkBuilt({ page, width, height }, label) {
  const budget = await page.evaluate(() => window.__pond.budget);
  const pool = budget.clarity === 'pool' ? await page.evaluate(() => ({ size: window.__pond.water.poolSquare.size, domainSize: window.__pond.water.domainSize })) : null;
  const want = expected(budget.quality, width, height);
  const { targets } = budget;
  check(budget.grid === want.grid && targets.solver.width === want.grid && targets.solver.height === want.grid, `${label}: ${budget.quality}'s solver is ${want.grid}² (grid ${budget.grid}, textures ${size(targets.solver)})`);
  const quads = quadsAcross(want.meshSegments, pool);
  check(budget.meshSegments === want.meshSegments && budget.meshTriangles === 2 * quads ** 2, `${label}: the water mesh has ${want.meshSegments} segments (${budget.meshSegments}, ${budget.meshTriangles} triangles${pool ? `, the pool's ${quads}² quads` : ''})`);
  check(size(budget.canvas) === size(want.canvas) && size(targets.main) === size(want.canvas), `${label}: canvas and main target ${size(want.canvas)} (${size(budget.canvas)}, ${size(targets.main)})`);
  check(size(targets.under) === size(want.under) && size(targets.reflection) === size(want.under), `${label}: under-water and mirror targets ${size(want.under)} (${size(targets.under)}, ${size(targets.reflection)})`);
  check(size(targets.fluid) === size(want.fluid), `${label}: fluid targets ${size(want.fluid)} (${size(targets.fluid)})`);
  return budget;
}
const pageState = (page) => page.evaluate(() => ({
  quality: window.__pond.quality,
  readout: document.getElementById('stats').textContent,
  pressed: [...document.querySelectorAll('#quality [role="radio"]')].filter((button) => button.getAttribute('aria-checked') === 'true').map((button) => button.dataset.value),
  row: document.querySelector('.menu-tier[data-open="quality"] .menu-tier-value').textContent,
  droplets: window.__pond.splash.count,
}));
/** The largest |height| in the splash solver's height texture (m). */
const largestHeight = (page) => page.evaluate(() => {
  const { renderer, water } = window.__pond;
  const gl = renderer.getContext();
  const { width, height } = water.heightTarget;
  const pixels = new Float32Array(width * height * 4);
  renderer.setRenderTarget(water.heightTarget);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
  renderer.setRenderTarget(null);
  let largest = 0;
  for (let index = 0; index < pixels.length; index += 4) largest = Math.max(largest, Math.abs(pixels[index]));
  return largest;
});

// ---- 1. the real clock -------------------------------------------------------
console.log('automatic quality on the real clock, 390×844');
part('the page, the idle and the splash measurements');
const phone = await openPage({ query: 'quality=auto' });
const { page } = phone;
const atStart = await pageState(page);
check(atStart.quality === 'high', `starts on high (got ${atStart.quality})`);
await checkBuilt(phone, 'at the start');

// The idle measurement: 30 warm-up frames and 60 measured. Wait for the readout to show a preset and the frames to pass.
const idleStart = Date.now();
await page.waitForFunction(() => /fps/.test(document.getElementById('stats').textContent), undefined, { timeout: 300000 });
await page.waitForFunction(() => window.__pond.quality !== 'high', undefined, { timeout: 600000 }).catch(() => {});
const afterIdle = await pageState(page);
const idleFps = Number(/(\d+) fps/.exec(afterIdle.readout)?.[1]);
console.log(`  idle: ${afterIdle.readout} after ${((Date.now() - idleStart) / 1000).toFixed(0)} s`);
if (idleFps < 30) check(afterIdle.quality === 'low', `idle below 30 fps steps down to low (got ${afterIdle.quality})`);
else if (idleFps < 50) check(afterIdle.quality === 'medium', `idle below 50 fps steps down to medium (got ${afterIdle.quality})`);
else check(afterIdle.quality === 'high', `idle at ${idleFps} fps stays high (got ${afterIdle.quality})`);
check(afterIdle.pressed.length === 1 && afterIdle.pressed[0] === 'auto' && afterIdle.row.toLowerCase().endsWith(afterIdle.quality), `the settings show Auto, drawing ${afterIdle.quality} (chosen: ${afterIdle.pressed.join(',') || 'none'}; row: ${afterIdle.row})`);
await checkBuilt(phone, 'after the idle measurement');
// The readout refreshes every 16 frames: give it that long.
await page.waitForFunction((name) => document.getElementById('stats').textContent.endsWith(name), afterIdle.quality, { timeout: 120000 }).catch(() => {});
const readoutAfterIdle = (await pageState(page)).readout;
check(readoutAfterIdle.endsWith(afterIdle.quality), `the readout names the preset (${readoutAfterIdle})`);

// The splash measurement: throw, wait for the splash to be measured or to end.
const ringsBeforeThrow = await page.evaluate(() => window.__pond.budget.rings);
check(ringsBeforeThrow.live === 0 && ringsBeforeThrow.passes === 0, `the idle pond runs no ring pass (${ringsBeforeThrow.live} rings, ${ringsBeforeThrow.passes} passes)`);
const programNames = (page) => page.evaluate(() => window.__pond.renderer.info.programs.map((program) => `${program.name} (${program.cacheKey.slice(0, 40)})`));
const programsBeforeThrow = await page.evaluate(() => window.__pond.budget.programs);
const namesBeforeThrow = await programNames(page);
await page.evaluate(() => window.__pond.throwAt(0, -1.4, { radius: 0.03 }));
await page.waitForFunction(() => window.__pond.splash.count > 0, undefined, { timeout: 300000 });
const splashStart = Date.now();
await page.waitForFunction(() => window.__pond.splash.count === 0, undefined, { timeout: 900000 }).catch(() => {});
const afterSplash = await pageState(page);
console.log(`  splash: ${afterSplash.readout} after ${((Date.now() - splashStart) / 1000).toFixed(0)} s of splash`);
const programsAfterSplash = await page.evaluate(() => window.__pond.budget.programs);
const namesAfterSplash = await programNames(page);
const compiled = namesAfterSplash.filter((name) => !namesBeforeThrow.includes(name));
check(programsAfterSplash === programsBeforeThrow, `the first throw compiles no program (${programsBeforeThrow} before, ${programsAfterSplash} after its splash${compiled.length ? `; new: ${compiled.join(', ')}` : ''})`);
const ringsAfterSplash = await page.evaluate(() => window.__pond.budget.rings);
check(ringsAfterSplash.live >= 1 && ringsAfterSplash.passes === 1 + ringsAfterSplash.live, `its rings outlive the splash: ${ringsAfterSplash.live} live, ${ringsAfterSplash.passes} passes a frame (a spectrum pass and one profile pass each)`);
check(order(afterSplash.quality) >= order(afterIdle.quality), `the splash never steps the quality up (${afterIdle.quality} -> ${afterSplash.quality})`);
check(afterSplash.pressed.length === 1 && afterSplash.pressed[0] === 'auto' && afterSplash.row.toLowerCase().endsWith(afterSplash.quality), `the settings show Auto, drawing ${afterSplash.quality} (row: ${afterSplash.row})`);
await checkBuilt(phone, 'after the splash measurement');

// A button press fixes the preset: no further automatic change. Then every preset to every other.
part('every preset to every other, and mid-splash');
await page.evaluate(() => window.__pond.setQuality('medium'));
const afterPress = await pageState(page);
check(afterPress.quality === 'medium', `setQuality('medium') applies (got ${afterPress.quality})`);
check(afterPress.pressed.length === 1 && afterPress.pressed[0] === 'medium' && afterPress.row === 'Medium', `and the settings show Medium, not Auto (chosen: ${afterPress.pressed.join(',')}; row: ${afterPress.row})`);
let previous = 'medium';
for (const name of ['high', 'medium', 'low', 'high', 'low', 'medium', 'high']) {
  await page.evaluate((preset) => window.__pond.setQuality(preset), name);
  await checkBuilt(phone, `${previous} -> ${name}`);
  previous = name;
}

// A change of preset in the middle of a splash carries the waves to the new grid.
await page.evaluate(() => { window.__pond.pause(); window.__pond.throwAt(0, -1.4, { radius: 0.04 }); window.__pond.advance(1.1); });
const onHigh = await largestHeight(page);
await page.evaluate(() => window.__pond.setQuality('medium'));
const onMedium = await largestHeight(page);
// The coarser grid drops the shortest ripples, so the peak may fall a little; a wrong scale of the carried modes would multiply it.
check(onHigh > 1e-4 && onMedium > 0.5 * onHigh && onMedium < 1.5 * onHigh, `a switch mid-splash keeps the waves: largest height ${(onHigh * 1000).toFixed(2)} mm on 512², ${(onMedium * 1000).toFixed(2)} mm on 256²`);
await page.evaluate(() => { window.__pond.advance(0.2); window.__pond.setQuality('high'); });
const backOnHigh = await largestHeight(page);
check(backOnHigh > 1e-4 && Number.isFinite(backOnHigh), `and back on 512² (${(backOnHigh * 1000).toFixed(2)} mm)`);
await checkBuilt(phone, 'after the switches mid-splash');

// The pool, and back to the lake: on low (whatever a preset's sizes, it draws the pool's quads; switched to medium in it).
part('the pool and the ice, on low');
await page.evaluate(() => window.__pond.setQuality('low'));
const programsBeforePool = await page.evaluate(() => window.__pond.budget.programs);
await page.evaluate(() => { window.__pond.setClarity('pool'); window.__pond.advance(0.1); });
const inPool = await page.evaluate(() => window.__pond.budget);
check(inPool.clarity === 'pool' && inPool.programs === programsBeforePool, `the pool compiles no program (${programsBeforePool} before, ${inPool.programs} drawing it)`);
await checkBuilt(phone, 'in the pool');
await page.evaluate(() => { window.__pond.throwAt(0, -1.4, { radius: 0.03 }); window.__pond.advance(1.0); });
const poolSplash = await page.evaluate(() => window.__pond.budget);
check(poolSplash.programs === programsBeforePool && poolSplash.rings.live === 1 && !poolSplash.solverAsleep,
  `a throw into the pool compiles no program (${poolSplash.programs}) and keeps one ring, its near field's (${poolSplash.rings.live} live), the solver awake`);
await page.evaluate(() => window.__pond.advance(1.5));
const poolLater = await page.evaluate(() => window.__pond.budget);
check(poolLater.rings.live === 0 && poolLater.rings.passes === 0 && !poolLater.solverAsleep, `its near-field ring retires with the near field (${poolLater.rings.live} live 2.5 s after the throw), the solver still awake with the pool's waves`);
await page.evaluate(() => window.__pond.setQuality('medium'));
await checkBuilt(phone, 'in the pool, low -> medium');
await page.evaluate(() => { window.__pond.setQuality('low'); window.__pond.setClarity('lake'); window.__pond.advance(0.1); });
const backOnLake = await page.evaluate(() => window.__pond.budget.programs);
check(backOnLake === programsBeforePool, `back on the lake, still no new program (${backOnLake})`);
await checkBuilt(phone, 'back on the lake');

// The ice (src/ice.js): the water's own programs draw it (ICE_COMMON in src/shaders/scene.js), so freezing the water, a
// throw that breaks it, its shards (floaters, src/things.js 'ice-shard'), the flood, a hole's new ice and a frozen pool
// compile nothing; on ice no gale blows, and the hole, its shards (within the preset's) and the wet are in the budget.
const programsBeforeIce = await page.evaluate(() => window.__pond.budget.programs);
await page.evaluate(() => { window.__pond.setIce('thin'); window.__pond.advance(0.1); });
const iced = await page.evaluate(() => window.__pond.budget);
check(iced.ice.name === 'thin' && iced.ice.thickness === 0.01 && iced.programs === programsBeforeIce && !iced.gale.blowing,
  `thin ice compiles no program (${programsBeforeIce} before, ${iced.programs} drawing it) and stills any gale`);
// (It flies some 0.8 s, and its shards go once its cavity has closed, some 0.3 s after.)
await page.evaluate(() => { window.__pond.throwAt(0, -1.4, { radius: 0.03, power: 'normal' }); window.__pond.advance(1.5); });
const broken = await page.evaluate(() => window.__pond.budget);
check(broken.ice.holes >= 1 && broken.programs === programsBeforeIce, `a stone through thin ice breaks a hole (${broken.ice.holes}) and compiles no program (${broken.programs})`);
check(broken.ice.shards >= 3 && broken.ice.shards <= broken.things.shards && broken.ice.wet > 0,
  `its shards come up (${broken.ice.shards}, at most the preset's ${broken.things.shards}) and the ice round it is wet (${broken.ice.wet} texels)`);
// Its new ice, begun at once (as if left alone REFREEZE.after seconds), compiles nothing.
await page.evaluate(() => { for (const hole of window.__pond.iceSheet.holes) hole.quiet = -1e9; window.__pond.advance(1.0); });
const skinning = await page.evaluate(() => window.__pond.budget);
check(skinning.ice.skinning >= 1 && skinning.programs === programsBeforeIce, `a hole skinning over (${skinning.ice.skinning}) compiles no program (${skinning.programs})`);
await page.evaluate(() => { window.__pond.setClarity('pool'); window.__pond.throwAt(0, -1, { radius: 0.03, power: 'normal' }); window.__pond.advance(1.0); });
const frozenPool = await page.evaluate(() => window.__pond.budget);
check(frozenPool.ice.name === 'thin' && frozenPool.programs === programsBeforeIce, `a frozen pool and a throw into it compile no program (${frozenPool.programs})`);
await page.evaluate(() => { window.__pond.setClarity('lake'); window.__pond.setIce('none'); window.__pond.advance(0.1); });
const thawed = await page.evaluate(() => window.__pond.budget);
check(thawed.ice.name === 'none' && thawed.ice.holes === 0 && thawed.programs === programsBeforeIce, `open water again compiles nothing (${thawed.programs})`);
await checkBuilt(phone, 'after the ice');

// Every kind of thing (src/things.js), thrown and followed until the floaters float in the mirror image, compiles no program.
part('every kind of thing, the floater\'s draw calls, the pool\'s resting stones, the fixed step, on low');
const programsBeforeThings = await page.evaluate(() => window.__pond.budget.programs);
const namesBeforeThings = await programNames(page);
// Each one's first throw makes no mesh and slices no waterline (src/rock.js prepareThing: warmUp made every thing ready;
// a pizza's waterline took a throw 33 to 57 ms). Each is timed too, for the record: the times vary too much here to check.
const preparedBefore = await page.evaluate(() => window.__pond.budget.preparation);
// All thrown at once, each to its own spot (a world second with splashes is dear here), and followed together.
const firstThrows = await page.evaluate((names) => {
  const pond = window.__pond;
  pond.pause();
  const spent = names.map((name, index) => {
    const started = performance.now();
    pond.throwAt(-1.2 + 0.6 * (index % 5), -0.6 - 0.6 * Math.floor(index / 5), { thing: name });
    return { thing: name, spent: performance.now() - started };
  });
  pond.advance(2.5);
  return spent;
}, ['slate', 'granite', 'basalt', 'pumice', 'golf', 'tennis', 'bowling', 'basketball', 'diamond', 'apple', 'pizza', 'frozen-pizza', 'pie', 'duck', 'watermelon', 'brick']);
console.log(`  first throws (ms on the main thread): ${firstThrows.map(({ thing, spent }) => `${thing} ${spent.toFixed(1)}`).join(', ')}`);
const preparedAfter = await page.evaluate(() => window.__pond.budget.preparation);
check(preparedBefore.meshes > 0 && preparedAfter.meshes === preparedBefore.meshes && preparedAfter.waterlines === preparedBefore.waterlines,
  `no first throw builds a fixed mesh or slices a waterline (meshes ${preparedBefore.meshes} → ${preparedAfter.meshes}, waterlines ${preparedBefore.waterlines} → ${preparedAfter.waterlines})`);
const programsAfterThings = await page.evaluate(() => window.__pond.budget.programs);
const thingsCompiled = (await programNames(page)).filter((name) => !namesBeforeThings.includes(name));
check(programsAfterThings === programsBeforeThings, `every kind of thing thrown, and a floater in the mirror image, compiles no program (${programsBeforeThings} before, ${programsAfterThings} after${thingsCompiled.length ? `; new: ${thingsCompiled.join(', ')}` : ''})`);

// What a floater resting on moving water costs a frame (src/main.js updateReflection: its mirror image is redrawn, in a
// scissored region, as the water it rides moves): the draw calls and triangles of a frame with a basketball afloat,
// against the still pond's. GPU-free counts: SwiftShader's milliseconds mean nothing.
const frameCounts = () => page.evaluate(() => {
  const pond = window.__pond, info = pond.renderer.info;
  info.autoReset = false;
  let calls = 0, triangles = 0;
  for (let frame = 0; frame < 20; frame++) {
    info.reset();
    pond.advance(1 / 60);
    calls += info.render.calls; triangles += info.render.triangles;
  }
  info.autoReset = true;
  return { calls: calls / 20, triangles: Math.round(triangles / 20) };
});
await page.evaluate(() => { window.__pond.pause(); window.__pond.clear(); window.__pond.advance(1); });
const stillPond = await frameCounts();
const restingBall = await page.evaluate(() => {
  const pond = window.__pond;
  const rock = pond.throwAt(0, -1.4, { thing: 'basketball' });
  for (let second = 0; second < 40 && !(rock.state === 'rest' && rock.afloat); second++) pond.advance(1);
  pond.advance(1);
  return rock.state === 'rest' && rock.afloat;
});
const withFloater = await frameCounts();
console.log(`  a frame: ${stillPond.calls} draw calls, ${stillPond.triangles} triangles on the still pond; ${withFloater.calls}, ${withFloater.triangles} with a basketball resting afloat`);
check(restingBall && withFloater.calls - stillPond.calls <= FLOATER_FRAME_CALLS, `a basketball resting afloat adds at most ${FLOATER_FRAME_CALLS} draw calls a frame (${withFloater.calls - stillPond.calls})`);
// What comes to rest stays (src/main.js keepWithinCaps): in the pool on low, the preset's `resting` stones lie on its
// floor, each one draw call (its part above the water hidden, src/rock.js syncMeshes), and no timer takes them; one
// more, come to rest, shrinks the oldest away (fadeOut: partway, smaller than its own size and still there; then gone),
// never at once.
await page.evaluate(() => { const pond = window.__pond; pond.clear(); pond.setQuality('low'); pond.setClarity('pool'); pond.advance(0.5); });
const emptyPool = await frameCounts();
const kept = await page.evaluate(() => {
  const pond = window.__pond;
  const { resting } = pond.budget.things;
  let state = 11;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  const throwOne = () => pond.throwAt(-1.1 + 2.2 * random(), -2.1 + 2.2 * random(), { thing: 'stone' });
  const stones = [];
  for (let index = 0; index < resting; index++) { stones.push(throwOne()); pond.advance(0.3); }
  pond.advance(5);
  const settled = stones.filter((stone) => stone.state === 'rest').length;
  pond.advance(41);   // past the 40 s that once took a stone at rest on the bed
  const result = {
    resting, settled,
    keptAfter: stones.filter((stone) => pond.rocks.includes(stone)).length,
    oneCall: stones.filter((stone) => !stone.meshAbove.visible && stone.meshBelow.visible).length,
  };
  const extra = throwOne();
  for (let step = 0; step < 600 && !pond.rocks.some((rock) => rock.fading !== undefined); step++) pond.advance(1 / 60);
  const fading = pond.rocks.find((rock) => rock.fading !== undefined);
  result.oldestFades = fading === stones[0];
  pond.advance(0.3);
  result.partway = fading ? { there: pond.rocks.includes(fading), scale: fading.meshBelow.scale.x / fading.radius } : null;   // its meshes' scale is its radius
  pond.advance(0.5);
  result.gone = fading ? !pond.rocks.includes(fading) : false;
  result.after = { kept: pond.budget.things.kept, extraKept: pond.rocks.includes(extra) };
  return result;
});
const restingPool = await frameCounts();
console.log(`  the pool on low: ${kept.settled} of ${kept.resting} stones at rest, ${kept.keptAfter} still there 41 s on, ${kept.oneCall} drawn once; ${emptyPool.calls} draw calls a frame empty, ${restingPool.calls} with them`);
check(kept.settled === kept.resting && kept.keptAfter === kept.resting, `the preset's ${kept.resting} stones at rest on the pool's floor all stay, 41 s on (${kept.keptAfter})`);
check(kept.oneCall === kept.resting && restingPool.calls - emptyPool.calls <= kept.resting + 2, `a stone at rest under the water is one draw call (${kept.oneCall} of ${kept.resting} with the part above hidden; ${restingPool.calls - emptyPool.calls} calls for them)`);
check(kept.oldestFades && kept.partway?.there && kept.partway.scale > 0.05 && kept.partway.scale < 0.95 && kept.gone && kept.after.kept === kept.resting && kept.after.extraKept,
  `one more at rest shrinks the oldest away, not at once (the oldest: ${kept.oldestFades}; partway ${kept.partway ? `there, at ${kept.partway.scale.toFixed(2)} of its size` : 'never'}; then gone: ${kept.gone}; ${kept.after.kept} kept)`);
await page.evaluate(() => { const pond = window.__pond; pond.clear(); pond.setClarity('lake'); pond.advance(0.1); });
// The world's step is fixed (src/main.js simulate, src/rock.js PHYSICS_STEP): the same throw, drawn 60 times a second or
// at a frame rate that steps it unevenly (a slow-motion speed of 0.37: frames of 1/162 s), goes exactly where it went.
const unevenly = await page.evaluate(() => {
  const pond = window.__pond;
  const run = (scale) => {
    pond.clear();
    pond.setTimeScale(scale);
    const random = Math.random;
    let state = 77;
    Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
    const rock = pond.throwAt(0.4, -1.8, { thing: 'basketball' });
    Math.random = random;
    pond.advance(2.5);
    pond.setTimeScale(1);
    return [rock.position.x, rock.position.y, rock.position.z, rock.state];
  };
  return [run(1), run(0.37)];
});
const apart = Math.hypot(unevenly[0][0] - unevenly[1][0], unevenly[0][1] - unevenly[1][1], unevenly[0][2] - unevenly[1][2]);
check(apart < 1e-9 && unevenly[0][3] === unevenly[1][3], `a basketball thrown alike at 60 frames a second and at frames of 1/162 s is where it was 2.5 s on (${apart.toExponential(1)} m apart, ${unevenly[0][3]} and ${unevenly[1][3]})`);
part('the floater\'s ride and the sounds, on the running page, on low');
// A floater rides the water as drawn, and things meet it there (src/floaterRide.js): with the page running, a basketball
// afloat has the water's height under it read back, without a frame waiting for it (SwiftShader answers slowly: up to
// a minute here), and where things meet it is where it is drawn.
const ride = await page.evaluate(async () => {
  const pond = window.__pond;
  pond.clear();
  pond.resume();
  const ball = pond.throwAt(0, -1.4, { thing: 'basketball' });
  for (let wait = 0; wait < 600 && ball.state !== 'float' && !ball.afloat; wait++) await new Promise((resolve) => setTimeout(resolve, 50));
  const readsBefore = pond.floaterRide.reads;
  let most = 0;
  const gl = pond.renderer.getContext();
  for (let wait = 0; wait < 1200 && pond.floaterRide.reads < readsBefore + 2; wait++) {
    gl.finish();   // a software renderer may otherwise leave the read's fence unanswered a long while
    await new Promise((resolve) => setTimeout(resolve, 50));
    most = Math.max(most, Math.abs(ball.rideHeight));
  }
  // The height read comes between steps; the next step's sync puts where things meet it there.
  ball.syncMeshes(ball.drawn.surface, ball.drawn.bedDepth);
  const share = ball.rideShare.value;
  return { ...pond.floaterRide, readsBefore, most, state: ball.state, meets: Math.abs(ball.centre.y - (ball.position.y + ball.rideHeight * share)) };
});
console.log(`  a basketball afloat: ${ride.reads - ride.readsBefore} reads of the water under it came back (${ride.requests} asked), its centre up to ${(1000 * ride.most).toFixed(2)} mm off the still water`);
// A browser whose renderer never answers the read's fence in the minute (GitHub's runners' SwiftShader at times) is
// said so, and asked for reads without breaking; any read that comes must be sane, and things meet the ball there.
const answered = ride.reads > ride.readsBefore;
if (!answered) console.log(`  (this browser answered none of the ${ride.requests} reads asked in a minute: the readback is checked where it answers)`);
check(ride.working && ride.requests > 0 && (!answered || ride.most < 0.05) && ride.meets < 1e-6, `the water's height under a floater is read back for the physics, and things meet it there (${ride.reads - ride.readsBefore} reads of ${ride.requests} asked, at most ${(1000 * ride.most).toFixed(1)} mm; the ball ${ride.state})`);
// The sounds (src/sound.js): started by a gesture (a key here), a throw's splash plays and stops. Where the browser has
// no audio to run (a CI runner), nothing plays; either way no voice is left held.
await page.keyboard.press('Shift');
const sounds = await page.evaluate(async () => {
  const pond = window.__pond;
  pond.setSound(true);
  for (let wait = 0; wait < 50 && pond.soundState !== 'running'; wait++) await new Promise((resolve) => setTimeout(resolve, 20));
  // Stepped to its splash here (headless frames are slow), its sounds counted as it goes in.
  pond.pause();
  const stone = pond.throwAt(0.2, -1.2, { radius: 0.04 });
  let most = 0;
  for (let frame = 0; frame < 120 && stone.state === 'air'; frame++) { pond.advance(1 / 60); most = Math.max(most, pond.soundsPlaying); }
  pond.advance(0.05);
  most = Math.max(most, pond.soundsPlaying);
  pond.resume();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return { most, after: pond.soundsPlaying, state: pond.soundState };
});
console.log(`  a throw's sounds (audio ${sounds.state}): up to ${sounds.most} at once, ${sounds.after} left 2.5 s after`);
check((sounds.state !== 'running' || sounds.most >= 1) && sounds.after === 0, `a throw sounds where the audio runs (${sounds.state}), and its sounds end (${sounds.most} at once, ${sounds.after} after)`);
await page.evaluate(() => { window.__pond.clear(); });

// A long session (resource lifetime): throws of every kind, more than low keeps, the oldest retired as the pond fills,
// then the pond cleared: the GPU's geometries and textures are back where they were, and no program was made.
part('a long session, on low');
const session = await page.evaluate(() => {
  const pond = window.__pond, memory = pond.renderer.info.memory;
  pond.pause();
  pond.setQuality('low');
  pond.clear();
  pond.advance(0.5);
  const before = { geometries: memory.geometries, textures: memory.textures, programs: pond.budget.programs };
  const names = ['stone', 'basketball', 'pizza', 'frozen-pizza', 'pie', 'duck', 'tennis', 'brick', 'pumice', 'diamond', 'watermelon', 'apple', 'bowling', 'golf'];
  let most = 0;
  const throws = 36;
  for (let throwing = 0; throwing < throws; throwing++) {
    pond.throwAt(-1 + (throwing % 7) * 0.33, -0.8 - (throwing % 5) * 0.4, { thing: names[throwing % names.length] });
    pond.advance(0.25);
    most = Math.max(most, pond.rocks.length);
  }
  pond.clear();
  pond.advance(0.5);
  const after = { geometries: memory.geometries, textures: memory.textures, programs: pond.budget.programs };
  pond.setQuality('high');
  pond.resume();
  return { before, after, most, throws };
});
console.log(`  ${session.throws} throws of every kind on low, at most ${session.most} in the pond at once: geometries ${session.before.geometries} → ${session.after.geometries}, textures ${session.before.textures} → ${session.after.textures}, programs ${session.before.programs} → ${session.after.programs}`);
check(session.after.geometries <= session.before.geometries && session.after.textures <= session.before.textures && session.after.programs === session.before.programs, `${session.throws} throws and a clear pond leave no geometry, texture or program behind`);

await page.evaluate(() => { window.__pond.clear(); window.__pond.resume(); });

// Rain compiles on first selection, then follows presets without new programs.
part('the rain, the gale and the storm');
let programsBeforeRain = await page.evaluate(() => window.__pond.budget.programs);
for (const weather of ['light-rain', 'heavy-rain']) {
  await page.evaluate((name) => window.__pond.setWeather(name), weather);
  await page.waitForFunction(() => window.__pond.raining, null, { timeout: 60000 });
  await page.evaluate(() => window.__pond.advance(0.2));
  const raining = await page.evaluate(() => ({ programs: window.__pond.budget.programs, weather: window.__pond.weather }));
  if (weather === 'light-rain') {
    check(raining.programs > programsBeforeRain, 'rain programs are deferred until rain is first selected');
    programsBeforeRain = raining.programs;
  } else {
    check(raining.programs === programsBeforeRain, `${weather} reuses the rain programs (${raining.programs})`);
  }
  check(raining.weather === weather, `the selected ${weather} is falling`);
}
await page.evaluate(() => { window.__pond.throwAt(0, -1.4, { radius: 0.03 }); window.__pond.advance(0.6); window.__pond.setQuality('medium'); window.__pond.advance(0.1); });
const rainMedium = await page.evaluate(() => ({ programs: window.__pond.budget.programs, rain: window.__pond.budget.rain }));
check(rainMedium.programs === programsBeforeRain && rainMedium.rain.falling && rainMedium.rain.texels === 256, `a throw into the downpour and a change to medium compile no program (${rainMedium.programs}); the rain's tile is ${rainMedium.rain.texels}² on medium`);
await page.evaluate(() => window.__pond.setQuality('high'));
await page.evaluate(() => window.__pond.setWeather('clear'));
const cleared = await page.evaluate(() => ({ raining: window.__pond.raining, programs: window.__pond.budget.programs }));
check(!cleared.raining && cleared.programs === programsBeforeRain, `clear again: no rain falls, and no program was compiled (${cleared.programs})`);
await checkBuilt(phone, 'after the rain');

// The gale compiles once on first selection; later changes reuse it.
let programsBeforeGale = await page.evaluate(() => window.__pond.budget.programs);
await page.evaluate(() => { window.__pond.setWind('gale'); window.__pond.advance(0.3); });
const galeBudget = await page.evaluate(() => ({ programs: window.__pond.budget.programs, gale: window.__pond.budget.gale }));
check(galeBudget.programs > programsBeforeGale, 'gale programs are deferred until a gale is first selected');
programsBeforeGale = galeBudget.programs;
check(galeBudget.gale.blowing && galeBudget.gale.sheetTriangles > 50000, `the gale blows and draws its finer sheet (${galeBudget.gale.sheetTriangles} triangles)`);
await page.evaluate(() => { window.__pond.throwAt(0, -1.4, { radius: 0.03 }); window.__pond.advance(0.8); });
const galeThrow = await page.evaluate(() => window.__pond.budget.programs);
check(galeThrow === programsBeforeGale, `a throw into the gale compiles no program (${galeThrow})`);
await page.evaluate(() => window.__pond.setWeather('storm'));
await page.waitForFunction(() => window.__pond.raining, null, { timeout: 60000 });
await page.evaluate(() => window.__pond.advance(2.5));   // the storm's first strike is at about 1.6 s of the clock (src/lightning.js)
const storm = await page.evaluate(() => ({ programs: window.__pond.budget.programs, wind: window.__pond.wind }));
check(storm.programs === programsBeforeGale && storm.wind === 'gale', `the storm compiles no program through a strike (${storm.programs}), its wind a gale (${storm.wind})`);
await page.evaluate(() => { window.__pond.setWeather('clear'); window.__pond.setClarity('pool'); window.__pond.advance(0.1); });
const pooledGale = await page.evaluate(() => ({ programs: window.__pond.budget.programs, gale: window.__pond.budget.gale }));
check(!pooledGale.gale.blowing && pooledGale.programs === programsBeforeGale, `in the pool the gale raises no waves (${pooledGale.gale.blowing ? 'blowing' : 'still'}) and nothing compiles`);
await page.evaluate(() => { window.__pond.setClarity('lake'); window.__pond.setWind('calm'); window.__pond.advance(0.1); });
const calmAgain = await page.evaluate(() => ({ programs: window.__pond.budget.programs, gale: window.__pond.budget.gale }));
check(!calmAgain.gale.blowing && calmAgain.gale.sheetTriangles < 5000 && calmAgain.programs === programsBeforeGale, `calm again: the still sheet (${calmAgain.gale.sheetTriangles} triangles), no program (${calmAgain.programs})`);
await checkBuilt(phone, 'after the gale');

part('one frame loop');
// pause, resume, pause, resume in one tick: one frame loop, so at most one render per requestAnimationFrame, and at least every
// other (the most the idle cap, on high too now, skips of a 60 Hz requestAnimationFrame).
const loops = await page.evaluate(() => new Promise((resolve) => {
  const pond = window.__pond;
  pond.pause(); pond.resume(); pond.pause(); pond.resume();
  const start = pond.framesRendered;
  let ticks = 0;
  const tick = () => { if (++ticks < 30) requestAnimationFrame(tick); else resolve({ renders: pond.framesRendered - start, ticks }); };
  requestAnimationFrame(tick);
}));
check(loops.renders <= loops.ticks + 1 && loops.renders >= loops.ticks / 2, `pause/resume/pause/resume leaves one frame loop: ${loops.renders} renders in ${loops.ticks} frames`);
await phone.context.close();

// ---- 2. a fake clock -------------------------------------------------------
console.log('the watch after calibration and the idle frame rate, on a fake clock');
part('the fake clock: calibration and the watch');
const fakeClock = `(() => {
  let fake = performance.now();
  let lastRealFrame = null;
  const realFrame = window.requestAnimationFrame.bind(window);
  window.__fakeStep = 18;
  window.__ticks = 0;
  performance.now = () => fake;
  window.requestAnimationFrame = (callback) => realFrame((realTime) => {
    if (realTime !== lastRealFrame) { lastRealFrame = realTime; fake += window.__fakeStep; window.__ticks++; }
    callback(fake);
  });
})();`;
const faked = await openPage({ query: 'quality=auto', initScript: fakeClock });
const fakePage = faked.page;
await fakePage.waitForFunction(() => window.__pond.budget.calibration === 'awaitingSplash', undefined, { timeout: 900000 });
check((await pageState(fakePage)).quality === 'high', 'at 55 frames a second the idle pond keeps high');
await fakePage.evaluate(() => window.__pond.throwAt(0, -1.4, { radius: 0.03 }));
await fakePage.waitForFunction(() => window.__pond.budget.calibration === 'done', undefined, { timeout: 900000 });
check((await pageState(fakePage)).quality === 'high', 'and so does its first splash');
const slowFrom = await fakePage.evaluate(() => { window.__fakeStep = 50; return performance.now(); });
await fakePage.waitForFunction(() => window.__pond.quality !== 'high', undefined, { timeout: 900000 }).catch(() => {});
const slowFor = await fakePage.evaluate((from) => (performance.now() - from) / 1000, slowFrom);
check((await pageState(fakePage)).quality === 'medium', `at 20 frames a second the watch steps down to medium (after ${slowFor.toFixed(1)} s)`);
check(slowFor < 6, 'within a few seconds');
await checkBuilt(faked, 'after the watch stepped down');
/** The renders, simulated and clock seconds over 40 faked frames at `hertz`, and whether the idle cap held at the start and the end. */
const overFrames = (hertz) => fakePage.evaluate((step) => new Promise((resolve) => {
  window.__fakeStep = step;
  const pond = window.__pond;
  const start = { renders: pond.framesRendered, ticks: window.__ticks, time: pond.time, clock: performance.now(), capped: pond.budget.frameCapped };
  const wait = () => {
    if (window.__ticks - start.ticks < 40) { requestAnimationFrame(wait); return; }
    resolve({ renders: pond.framesRendered - start.renders, ticks: window.__ticks - start.ticks, simulated: pond.time - start.time, clock: (performance.now() - start.clock) / 1000, capped: [start.capped, pond.budget.frameCapped] });
  };
  requestAnimationFrame(wait);
}), 1000 / hertz);
const drawsOneIn = (counted, every) => counted.renders >= (counted.ticks - 1) / every - 1 && counted.renders <= (counted.ticks + 1) / every + 1;
const keepsUp = (counted) => Math.abs(counted.simulated - counted.clock) <= 2.5 / 60;
/** Waits for the idle cap on or off as judged by a frame begun after the call (frameCapped is only updated by a frame). */
const waitForCap = async (on) => {
  const from = await fakePage.evaluate(() => window.__ticks);
  await fakePage.waitForFunction(([wanted, after]) => window.__ticks > after + 1 && window.__pond.budget.frameCapped === wanted, [on, from], { timeout: 900000 }).catch(() => {});
};
part('the fake clock: the idle cap and the ceiling');
// A pond where nothing happens on medium: frames at 30 a second on a 60 Hz clock.
await fakePage.evaluate(() => { window.__fakeStep = 1000 / 60; });
await waitForCap(true);
const capped = await overFrames(60);
check(capped.renders >= 0.4 * capped.ticks && capped.renders <= 0.6 * capped.ticks + 1, `a still pond on medium draws every other frame: ${capped.renders} renders in ${capped.ticks} frames`);
check(keepsUp(capped), `and its simulated time keeps up: ${capped.simulated.toFixed(3)} s simulated in ${capped.clock.toFixed(3)} s`);
// High idles at 30 too; while things happen, every preset is held to
// MAX_FRAME_RATE: a clock at twice it (a 120 Hz display) draws every other
// frame and the idle pond every fourth, a clock at it (60 Hz) every frame.
await fakePage.evaluate(() => window.__pond.setQuality('high'));
await waitForCap(true);
const highStill = await overFrames(60);
check(highStill.capped.every(Boolean) && drawsOneIn(highStill, 60 / QUALITY.high.idleFrameRate), `a still pond on high draws every other frame at 60 Hz: ${highStill.renders} renders in ${highStill.ticks} frames`);
const highStillFast = await overFrames(120);
check(highStillFast.capped.every(Boolean) && drawsOneIn(highStillFast, 120 / QUALITY.high.idleFrameRate) && keepsUp(highStillFast), `and every fourth at 120 Hz: ${highStillFast.renders} renders in ${highStillFast.ticks} frames, ${highStillFast.simulated.toFixed(3)} s simulated in ${highStillFast.clock.toFixed(3)} s`);
// The ceiling is every preset's: its frames with things moving are drawn on low (cheaper here).
await fakePage.evaluate(() => { window.__pond.setQuality('low'); window.__pond.throwAt(0, -1.4, { radius: 0.03 }); });
await waitForCap(false);
const flyingFast = await overFrames(2 * MAX_FRAME_RATE);
check(!flyingFast.capped.some(Boolean) && drawsOneIn(flyingFast, 2) && keepsUp(flyingFast), `a throw at ${2 * MAX_FRAME_RATE} Hz draws every other frame, ${MAX_FRAME_RATE} a second: ${flyingFast.renders} renders in ${flyingFast.ticks} frames, ${flyingFast.simulated.toFixed(3)} s simulated in ${flyingFast.clock.toFixed(3)} s`);
await fakePage.evaluate(() => window.__pond.throwAt(0.3, -1.4, { radius: 0.03 }));
await waitForCap(false);
const flying = await overFrames(MAX_FRAME_RATE);
check(!flying.capped.some(Boolean) && drawsOneIn(flying, 1) && keepsUp(flying), `and at ${MAX_FRAME_RATE} Hz every frame: ${flying.renders} renders in ${flying.ticks} frames`);
await fakePage.evaluate(() => window.__pond.throwAt(-0.3, -1.4, { radius: 0.03 }));
await waitForCap(false);
const flyingNinety = await overFrames(90);
check(!flyingNinety.capped.some(Boolean) && drawsOneIn(flyingNinety, 1) && keepsUp(flyingNinety), `and at 90 Hz every frame too, within the ceiling's slack: ${flyingNinety.renders} renders in ${flyingNinety.ticks} frames`);
await faked.context.close();

// ---- 3. the pixel budget ----------------------------------------------------
console.log('a 2560×1440 window on high');
part('the pixel budget');
const large = await openPage({ width: 2560, height: 1440, query: 'quality=high&paused=1' });
const largeBudget = await checkBuilt(large, '2560×1440');
check(largeBudget.canvas.width * largeBudget.canvas.height <= PIXEL_BUDGET, `the canvas keeps within ${PIXEL_BUDGET / 1e6} M pixels (${largeBudget.canvas.width}×${largeBudget.canvas.height}, ratio ${largeBudget.pixelRatio.toFixed(3)})`);
await large.context.close();

part(null);
if (problems.length) { console.log('  console problems:'); console.log('  ' + problems.slice(0, 10).join('\n  ')); failures++; }
await browser.close();
server.close();
console.log(`${failures ? `${failures} check(s) failed` : 'all quality checks passed'} (${((Date.now() - probeStart) / 60000).toFixed(1)} min)`);
process.exit(failures ? 1 : 0);
