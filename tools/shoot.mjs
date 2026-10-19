// Headless screenshot harness for A Stone’s Throw.
//
// Serves the project folder, routes the CDN Three.js imports to node_modules
// so the page loads offline, drives the simulation through window.__pond in
// deterministic steps, and writes PNG frames.
//
//   node tools/shoot.mjs --label=first --throws=0:-1.4:0.03 --times=0.02,0.08,0.15,0.3,0.6,1.2
//
// --throws: x:z:radius per stone, comma separated. --times: seconds after the
// first impact to capture (frames are named tS_CC.png, or tS_CCCC.png for a
// time that needs four decimals, such as a run of slow-motion frames). The
// flight is stepped a frame at a time (a slow-motion frame under --eval's
// setTimeScale, so a --preimpact a little short of the impact saves time);
// the part of the last step after the impact counts toward the first
// capture, so the times are exact.
// --throws=none throws nothing: the frames are idle water, --times seconds
// after idle.png (which is taken after --preroll seconds). The page starts
// paused (?paused=1), so world time is zero at the start of every run and
// idle water renders identically. --w/--h/--dpr set the viewport. --ui=1
// keeps the UI.
// --crop=x:y:width:height also saves that region of each frame (CSS pixels)
// as tN_NN_crop.png, enlarged --cropscale times with square pixels (default 1).
// --report="js expression" is evaluated in the page after each frame and its
// result printed as JSON (window.__pond is the app). --floats=half renders on
// the half-float path that devices without EXT_color_buffer_float take.
// --sky=name picks the sky's place (a key of SKIES in src/sky.js) and
// --time=hour its hour (the place's anchor otherwise, never the time of day
// last chosen: the harness's browser keeps no storage), --weather=
// clear|light-rain|heavy-rain the weather (WEATHERS in src/main.js; the
// rain waits for its ring's table before the first frame), and
// --water=pool|clear|lake|pond|murky the water (WATER_CLARITIES in src/main.js;
// pool puts the rocks in the pool, src/pool.js).
// --wind=x:z sets the direction the wind blows toward in world XZ, and
// --wind-strength=calm|breeze|windy its strength (the page's own default is
// calm; breeze is the look the pond had before the Wind control).
// --view=shore|level|high stands the camera at one of the View setting's
// choices (VIEWS in src/main.js), and --orbit=azimuth:elevation:distance
// (degrees, degrees, metres; :x:y:z after them moves the pivot) on any orbit
// (src/viewOrbit.js), before --fov and --look turn it; the rocks are still
// thrown from the shore.
// --touch=x0:z0:x1:z1:seconds dips a finger into the water at (x0, z0) at
// the start of the frames (__pond.touchWater), draws it to (x1, z1) at an
// even speed over `seconds`, a step every frame, and lifts it out there; the
// times count from the dip.
// --power=soft|normal|hard throws as the strength buttons do (soft is a
// higher arc, so a steeper entry: about 30° from vertical against 42°).
// --skip throws skips, as the Skip switch does (src/rock.js): the stone
// first touches the water at the throw's x:z (or where a nearly level
// release puts it, src/main.js skipThrow) and skips on from there, and the
// times count from that first touch.
// --trace draws each stone's path as a line (__pond.setTrace).
// --thing=name[:value] throws that (a key of THINGS in src/things.js: a
// kind of stone, golf, tennis, bowling, basketball; ?thing=), at that
// slider value (a bowling ball's pounds, a basketball's size; a stone's
// size is the throw's radius).
// --seed=n seeds Math.random (Park–Miller, from n + i) just before throw i,
// so its stone and its splash are the same every run, and the same as
// tools/variety-probe.mjs's seed n + i at the same aim and power.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const label = arg('label', 'shot');
const outDir = path.join(root, 'shots', label);
const width = Number(arg('w', 1280));
const height = Number(arg('h', 720));
const dpr = Number(arg('dpr', 1));
const throwArgument = arg('throws', '0:-1.4:0.03');
const throws = throwArgument === 'none' ? [] : throwArgument.split(',').map((t) => t.split(':').map(Number));
const times = arg('times', '0.02,0.08,0.15,0.3,0.6,1.2').split(',').map(Number);
const keepUi = arg('ui', '0') === '1';
const quality = arg('quality', 'high');
const preRoll = Number(arg('preroll', '0'));
const debugView = arg('debug', 'none');
const fov = arg('fov', '');
const look = arg('look', '');
const evalAfterThrow = arg('eval', '');
const preImpact = Number(arg('preimpact', '0'));
const crop = arg('crop', '');
const cropScale = Number(arg('cropscale', '1'));
const report = arg('report', '');
const floats = arg('floats', '');
const sky = arg('sky', '');
const skyTime = arg('time', '');
const weather = arg('weather', '');
const waterClarity = arg('water', '');
const wind = arg('wind', '');
const power = arg('power', 'normal');
const skipThrows = process.argv.includes('--skip');
const tracePaths = process.argv.includes('--trace');
const windStrength = arg('wind-strength', '');
const seed = arg('seed', '');
const viewName = arg('view', '');
const touchArgument = arg('touch', '');
const orbitArgument = arg('orbit', '');
const [thingName, thingValue] = arg('thing', '').split(':');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const file = path.join(root, decodeURIComponent(url.pathname));
    const data = await readFile(file);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404); response.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
await mkdir(outDir, { recursive: true });

// PW_CHROMIUM picks a browser; otherwise use the cloud container's preinstalled
// Chromium when it is there, and Playwright's own download everywhere else.
const containerChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROMIUM || (existsSync(containerChromium) ? containerChromium : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
  const url = new URL(route.request().url());
  const rel = url.pathname.replace('/npm/three@0.183.2/', '');
  try {
    const body = await readFile(path.join(root, 'node_modules/three', rel));
    await route.fulfill({ status: 200, contentType: 'text/javascript', body });
  } catch (error) {
    console.error('[shoot] missing CDN file', rel);
    await route.fulfill({ status: 404, body: '' });
  }
});
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });

const url = `http://localhost:${port}/index.html?quality=${quality}&paused=1${keepUi ? '' : '&ui=0'}${floats ? `&floats=${floats}` : ''}${sky ? `&sky=${sky}` : ''}${skyTime ? `&time=${skyTime}` : ''}${weather ? `&weather=${weather}` : ''}${waterClarity ? `&water=${waterClarity}` : ''}${wind ? `&wind=${wind.replace(':', ',')}` : ''}${windStrength ? `&windStrength=${windStrength}` : ''}${thingName ? `&thing=${thingName}` : ''}`;
console.log(`[shoot] ${url} -> ${outDir}`);
await page.goto(url, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => !!window.__pond, { timeout: 60000 });
} catch {
  console.error('[shoot] the pond never became ready');
  console.error(problems.join('\n'));
  await browser.close(); server.close(); process.exit(1);
}
if (weather && weather !== 'clear') await page.waitForFunction(() => window.__pond.raining, null, { timeout: 60000 });
// The loading veil fades out over a moment once the pond is ready; a frame taken meanwhile would catch it.
await page.evaluate(() => document.getElementById('veil')?.remove());
await page.evaluate(() => window.__pond.pause());
await page.evaluate((name) => window.__pond.setDebugView(name), debugView);
if (viewName) await page.evaluate((name) => window.__pond.showView(name, { glide: false }), viewName);
if (orbitArgument) {
  await page.evaluate((text) => {
    const [azimuth, elevation, distance, ...pivot] = text.split(':').map(Number);
    window.__pond.setOrbit({ azimuth, elevation, distance, pivot: pivot.length === 3 ? pivot : undefined });
  }, orbitArgument);
}
if (fov) await page.evaluate((f) => window.__pond.setFov(Number(f)), fov);
if (look) await page.evaluate((l) => { const [x, y, z] = l.split(':').map(Number); window.__pond.lookAt(x, y, z); }, look);
if (thingValue) await page.evaluate((value) => window.__pond.setSize(value), Number(thingValue));
await page.evaluate((seconds) => window.__pond.advance(seconds), preRoll);
await page.screenshot({ path: path.join(outDir, 'idle.png'), timeout: 180000 });
console.log('[shoot] idle.png');

if (tracePaths) await page.evaluate(() => window.__pond.setTrace(true));
for (const [index, [x, z, radius]] of throws.entries()) {
  await page.evaluate(([x, z, radius, power, seed, skip]) => {
    if (seed !== null) {
      let state = seed;
      Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
    }
    window.__pond.throwAt(x, z, { radius, power, skip });
  }, [x, z, radius, power, seed === '' ? null : Number(seed) + index, skipThrows]);
}
if (evalAfterThrow) await page.evaluate(evalAfterThrow);
let flight = 0;
if (throws.length > 0 && preImpact > 0) {
  await page.evaluate((seconds) => window.__pond.advance(seconds), preImpact);
  flight += preImpact;
  await page.screenshot({ path: path.join(outDir, 'flight.png'), timeout: 180000 });
  console.log('[shoot] flight.png');
}
// One app frame per step, at the page's time scale, so that in slow motion the
// first frame after the impact is at most one slow frame (1/600 s at 0.1) late.
const flightStep = await page.evaluate(() => Math.max(window.__pond.timeScale ?? 1, 0.01) / 60);
while (throws.length > 0 && !(await page.evaluate(() => window.__pond.hasImpacted())) && flight < 3) {
  await page.evaluate((seconds) => window.__pond.advance(seconds), flightStep);
  flight += flightStep;
}
// The flight steps overshoot the impact: by the age of the first stone's crown.
const overshoot = await page.evaluate(() => {
  const splash = window.__pond.splash;
  const starts = splash.crowns.filter((crown) => !crown.landing).map((crown) => crown.startTime);
  return starts.length ? splash.time - Math.min(...starts) : 0;
});
if (throws.length > 0) console.log(`[shoot] impact after ${flight.toFixed(2)} s of flight (${(overshoot * 1000).toFixed(1)} ms ago)`);
let elapsed = overshoot;
if (touchArgument) {
  await page.evaluate((text) => {
    const [x0, z0, x1, z1, seconds] = text.split(':').map(Number);
    window.__touchPath = { x0, z0, x1, z1, seconds, clock: 0 };
    window.__pond.touchWater(x0, z0);
  }, touchArgument);
}
for (const t of times) {
  // A one-pixel read-back waits for the GPU to finish the steps just queued:
  // under SwiftShader seconds of solver steps can outlast the screenshot's timeout.
  await page.evaluate((seconds) => {
    const path = window.__touchPath;
    // The finger's place before each frame: along its path at an even speed, lifted at the end.
    const moveFinger = path && ((sinceCall) => {
      const share = Math.min((path.clock + sinceCall) / path.seconds, 1);
      if (window.__pond.touching) {
        window.__pond.dragTouch(path.x0 + (path.x1 - path.x0) * share, path.z0 + (path.z1 - path.z0) * share);
        if (share >= 1) window.__pond.liftTouch();
      }
    });
    window.__pond.advance(seconds, moveFinger);
    if (path) path.clock += seconds;
    const gl = window.__pond.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }, Math.max(t - elapsed, 0));
  elapsed = Math.max(t, elapsed);
  const decimals = Math.abs(Number(t.toFixed(2)) - t) < 1e-9 ? 2 : 4;
  const name = `t${t.toFixed(decimals).replace('.', '_')}.png`;
  await page.screenshot({ path: path.join(outDir, name), timeout: 180000 });
  console.log(`[shoot] ${name}`);
  if (report) console.log(`[shoot] report: ${JSON.stringify(await page.evaluate(report))}`);
  if (crop) {
    const [x, y, cropWidth, cropHeight] = crop.split(':').map(Number);
    const cropName = name.replace('.png', '_crop.png');
    const pixels = await page.screenshot({ clip: { x, y, width: cropWidth, height: cropHeight }, timeout: 180000 });
    const enlarged = cropScale === 1 ? pixels : Buffer.from((await page.evaluate(async ([base64, scale]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    }, [pixels.toString('base64'), cropScale])).split(',')[1], 'base64');
    await writeFile(path.join(outDir, cropName), enlarged);
    console.log(`[shoot] ${cropName}`);
  }
}
if (problems.length) { console.log('[shoot] console problems:'); console.log(problems.slice(0, 20).join('\n')); }
await browser.close();
server.close();
