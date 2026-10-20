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
//    compiles no program, and no first throw builds a fixed mesh or slices
//    its waterline (src/rock.js prepareThing did both under the veil; each
//    throw's time on the main thread is printed, not checked: under
//    SwiftShader one throw's varies from 2 to over 60 ms); a basketball
//    resting afloat adds at most FLOATER_FRAME_CALLS draw calls a frame
//    (its mirror image redrawn as the water moves; calls and triangles
//    printed). The world's
//    step is fixed: a basketball thrown alike at 60 frames a second and in
//    frames of 1/162 s is in the same place 2.5 s on. With the page running,
//    the water's height under a floater beside a splash is read back
//    (src/floaterRide.js), and a throw's sounds play and end (src/sound.js;
//    the browser lets audio start without a gesture here). Sixty throws of
//    every kind, the pond then cleared, leave no geometry, texture or
//    program behind. Rain (src/rain.js): each weather in
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
// Each one's first throw makes no mesh and slices no waterline (src/rock.js prepareThing: warmUp made every thing ready;
// a pizza's waterline took a throw 33 to 57 ms). Each is timed too, for the record: the times vary too much here to check.
const preparedBefore = await page.evaluate(() => window.__pond.budget.preparation);
const firstThrows = [];
for (const thing of ['slate', 'granite', 'basalt', 'pumice', 'golf', 'tennis', 'bowling', 'basketball', 'diamond', 'apple', 'pizza', 'frozen-pizza', 'watermelon', 'brick']) {
  const spent = await page.evaluate((name) => {
    window.__pond.pause();
    const started = performance.now();
    window.__pond.throwAt(0, -1.4, { thing: name });
    const elapsed = performance.now() - started;
    window.__pond.advance(3.0);
    return elapsed;
  }, thing);
  firstThrows.push({ thing, spent });
}
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

// A long session (resource lifetime): sixty throws of every kind, the oldest retired as the pond fills, then the pond
// cleared: the GPU's geometries and textures are back where they were, and no program was made.
const session = await page.evaluate(() => {
  const pond = window.__pond, memory = pond.renderer.info.memory;
  pond.pause();
  pond.clear();
  pond.advance(0.5);
  const before = { geometries: memory.geometries, textures: memory.textures, programs: pond.budget.programs };
  const names = ['stone', 'basketball', 'pizza', 'frozen-pizza', 'tennis', 'brick', 'pumice', 'diamond', 'watermelon', 'apple', 'bowling', 'golf'];
  let most = 0;
  for (let throwing = 0; throwing < 60; throwing++) {
    pond.throwAt(-1 + (throwing % 7) * 0.33, -0.8 - (throwing % 5) * 0.4, { thing: names[throwing % names.length] });
    pond.advance(0.4);
    most = Math.max(most, pond.rocks.length);
  }
  pond.clear();
  pond.advance(0.5);
  const after = { geometries: memory.geometries, textures: memory.textures, programs: pond.budget.programs };
  pond.resume();
  return { before, after, most };
});
console.log(`  sixty throws of every kind, at most ${session.most} in the pond at once: geometries ${session.before.geometries} → ${session.after.geometries}, textures ${session.before.textures} → ${session.after.textures}, programs ${session.before.programs} → ${session.after.programs}`);
check(session.after.geometries <= session.before.geometries && session.after.textures <= session.before.textures && session.after.programs === session.before.programs, 'sixty throws and a clear pond leave no geometry, texture or program behind');

await page.evaluate(() => { window.__pond.clear(); window.__pond.resume(); });

// Rain compiles on first selection, then follows presets without new programs.
let programsBeforeRain = await page.evaluate(() => window.__pond.budget.programs);
for (const weather of ['light-rain', 'heavy-rain']) {
  await page.evaluate((name) => window.__pond.setWeather(name), weather);
  await page.waitForFunction(() => window.__pond.raining, null, { timeout: 60000 });
  await page.evaluate(() => window.__pond.advance(0.2));
  const raining = await page.evaluate(() => ({ programs: window.__pond.budget.programs, weather: window.__pond.weather }));
  if (weather === 'light-rain') {
    check(raining.programs > programsBeforeRain, 'rain programs are deferred until rain is first selected');
    programsBeforeRain = raining.programs;
  }
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

// The gale compiles once on first selection; later changes reuse it.
let programsBeforeGale = await page.evaluate(() => window.__pond.budget.programs);
await page.evaluate(() => { window.__pond.setWind('gale'); window.__pond.advance(0.3); });
const galeBudget = await page.evaluate(() => ({ programs: window.__pond.budget.programs, gale: window.__pond.budget.gale }));
check(galeBudget.programs > programsBeforeGale, 'gale programs are deferred until a gale is first selected');
programsBeforeGale = galeBudget.programs;
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
