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
//    preset in it keeps the pool's mesh. Every kind of thing (src/things.js)
//    thrown, the floaters followed until they float in the mirror image,
//    compiles no program. Rain (src/rain.js): each weather in
//    turn, with a throw in the downpour and a change of preset, compiles no
//    program (the warm-up drew the rain's), and the tile takes the preset's
//    size; clear again, nothing of the rain runs. The gale (src/galeWaves.js)
//    and the storm: the gale compiles no program (the warm-up drew its passes
//    and its spray, and the water's shaders branch on it), draws the finer
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
//    seconds; and on medium a pond where nothing happens draws every other
//    requestAnimationFrame at 60 a second, its simulated time still keeping
//    up with the clock.
// 3. A 2560×1440 window on high: the canvas keeps within PIXEL_BUDGET.
//
//   node tools/quality-probe.mjs
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALITY, PIXEL_BUDGET } from '../src/main.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
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

// The pool, and back to the lake.
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
await checkBuilt(phone, 'in the pool, high -> medium');
await page.evaluate(() => { window.__pond.setQuality('high'); window.__pond.setClarity('lake'); window.__pond.advance(0.1); });
const backOnLake = await page.evaluate(() => window.__pond.budget.programs);
check(backOnLake === programsBeforePool, `back on the lake, still no new program (${backOnLake})`);
await checkBuilt(phone, 'back on the lake');

// Every kind of thing (src/things.js), thrown and followed until the floaters float in the mirror image, compiles no program.
const programsBeforeThings = await page.evaluate(() => window.__pond.budget.programs);
const namesBeforeThings = await programNames(page);
for (const thing of ['slate', 'granite', 'basalt', 'pumice', 'golf', 'tennis', 'bowling', 'basketball', 'diamond', 'apple', 'pizza', 'watermelon', 'brick']) {
  await page.evaluate((name) => { window.__pond.pause(); window.__pond.throwAt(0, -1.4, { thing: name }); window.__pond.advance(3.0); }, thing);
}
const programsAfterThings = await page.evaluate(() => window.__pond.budget.programs);
const thingsCompiled = (await programNames(page)).filter((name) => !namesBeforeThings.includes(name));
check(programsAfterThings === programsBeforeThings, `every kind of thing thrown, and a floater in the mirror image, compiles no program (${programsBeforeThings} before, ${programsAfterThings} after${thingsCompiled.length ? `; new: ${thingsCompiled.join(', ')}` : ''})`);

// The weather: rain compiles nothing, follows the preset's tile size, and goes when it clears.
const programsBeforeRain = await page.evaluate(() => window.__pond.budget.programs);
for (const weather of ['light-rain', 'heavy-rain']) {
  await page.evaluate((name) => window.__pond.setWeather(name), weather);
  await page.waitForFunction(() => window.__pond.raining, null, { timeout: 60000 });
  await page.evaluate(() => window.__pond.advance(0.2));
  const raining = await page.evaluate(() => ({ programs: window.__pond.budget.programs, weather: window.__pond.weather }));
  check(raining.programs === programsBeforeRain && raining.weather === weather, `${weather} compiles no program (${raining.programs})`);
}
await page.evaluate(() => { window.__pond.throwAt(0, -1.4, { radius: 0.03 }); window.__pond.advance(0.6); window.__pond.setQuality('medium'); window.__pond.advance(0.1); });
const rainMedium = await page.evaluate(() => ({ programs: window.__pond.budget.programs, rain: window.__pond.budget.rain }));
check(rainMedium.programs === programsBeforeRain && rainMedium.rain.falling && rainMedium.rain.texels === 256, `a throw into the downpour and a change to medium compile no program (${rainMedium.programs}); the rain's tile is ${rainMedium.rain.texels}² on medium`);
await page.evaluate(() => window.__pond.setQuality('high'));
await page.evaluate(() => window.__pond.setWeather('clear'));
const cleared = await page.evaluate(() => ({ raining: window.__pond.raining, programs: window.__pond.budget.programs }));
check(!cleared.raining && cleared.programs === programsBeforeRain, `clear again: no rain falls, and no program was compiled (${cleared.programs})`);
await checkBuilt(phone, 'after the rain');

// The gale and the storm: nothing compiles, the gale's sheet, none in the pool.
const programsBeforeGale = await page.evaluate(() => window.__pond.budget.programs);
await page.evaluate(() => { window.__pond.setWind('gale'); window.__pond.advance(0.3); });
const galeBudget = await page.evaluate(() => ({ programs: window.__pond.budget.programs, gale: window.__pond.budget.gale }));
check(galeBudget.programs === programsBeforeGale && galeBudget.gale.blowing && galeBudget.gale.sheetTriangles > 50000, `the gale compiles no program (${galeBudget.programs}) and draws its finer sheet (${galeBudget.gale.sheetTriangles} triangles)`);
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

// pause, resume, pause, resume in one tick: one frame loop, so at most one render per requestAnimationFrame (high is never capped).
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
// A pond where nothing happens on medium: frames at 30 a second on a 60 Hz clock.
await fakePage.evaluate(() => { window.__fakeStep = 1000 / 60; });
await fakePage.waitForFunction(() => window.__pond.budget.frameCapped, undefined, { timeout: 900000 }).catch(() => {});
const capped = await fakePage.evaluate(() => new Promise((resolve) => {
  const pond = window.__pond;
  const start = { renders: pond.framesRendered, ticks: window.__ticks, time: pond.time, clock: performance.now() };
  const wait = () => {
    if (window.__ticks - start.ticks < 40) { requestAnimationFrame(wait); return; }
    resolve({ renders: pond.framesRendered - start.renders, ticks: window.__ticks - start.ticks, simulated: pond.time - start.time, clock: (performance.now() - start.clock) / 1000 });
  };
  requestAnimationFrame(wait);
}));
check(capped.renders >= 0.4 * capped.ticks && capped.renders <= 0.6 * capped.ticks + 1, `a still pond on medium draws every other frame: ${capped.renders} renders in ${capped.ticks} frames`);
check(Math.abs(capped.simulated - capped.clock) <= 2.5 / 60, `and its simulated time keeps up: ${capped.simulated.toFixed(3)} s simulated in ${capped.clock.toFixed(3)} s`);
await faked.context.close();

// ---- 3. the pixel budget ----------------------------------------------------
console.log('a 2560×1440 window on high');
const large = await openPage({ width: 2560, height: 1440, query: 'quality=high&paused=1' });
const largeBudget = await checkBuilt(large, '2560×1440');
check(largeBudget.canvas.width * largeBudget.canvas.height <= PIXEL_BUDGET, `the canvas keeps within ${PIXEL_BUDGET / 1e6} M pixels (${largeBudget.canvas.width}×${largeBudget.canvas.height}, ratio ${largeBudget.pixelRatio.toFixed(3)})`);
await large.context.close();

if (problems.length) { console.log('  console problems:'); console.log('  ' + problems.slice(0, 10).join('\n  ')); failures++; }
await browser.close();
server.close();
console.log(failures ? `${failures} check(s) failed` : 'all quality checks passed');
process.exit(failures ? 1 : 0);
