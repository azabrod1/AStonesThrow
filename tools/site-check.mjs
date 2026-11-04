// Loads the published site (_site/, from npm run site) the way GitHub Pages
// serves it, under the project path /AStonesThrow/, and checks that the pond
// starts, that rain falls once asked for (its files load only then), that the
// Polynesian lagoon's scanned bark and sand come once it is shown (src/
// tropics.js loadSurfaces), refresh the cached reflections, that a tour of the places gives each its water (and the
// splash the lagoon's brighter bed), and that every request the page makes succeeds. Catches a file
// missing from SITE_FILES (tools/build-site.mjs) and a root-absolute path,
// which works on localhost and 404s on Pages.
//
//   npm run site && node tools/site-check.mjs
//   node tools/site-check.mjs --webkit   # actual WebKit, emulated iPhone layout; not physical-device evidence
//
// The Three.js CDN is blocked to require the published local runtime; fonts
// are stubbed so the check runs offline.
import { launchBrowser, launchWebKit, patience } from './browser.mjs';
import { devices } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES_PATH = '/AStonesThrow/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDirectory = path.join(root, '_site');
if (!existsSync(path.join(siteDirectory, 'index.html'))) { console.error('[site-check] no _site/index.html: run npm run site first'); process.exit(1); }

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  try {
    if (!pathname.startsWith(PAGES_PATH)) throw new Error('outside the Pages path');
    const relative = pathname.slice(PAGES_PATH.length) || 'index.html';
    const file = path.join(siteDirectory, relative);
    if (!file.startsWith(siteDirectory)) throw new Error('outside the site');
    const data = await readFile(file);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

// WebKit covers Safari's decoder and mobile layout. Device emulation does
// not measure a phone's GPU or establish behavior on physical iOS hardware.
const useWebKit = process.argv.includes('--webkit');
const browser = useWebKit ? await launchWebKit() : await launchBrowser();
const context = await browser.newContext(useWebKit
  ? { ...devices['iPhone 13'], deviceScaleFactor: 1 }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
console.log(`[site-check] ${useWebKit ? 'WebKit, emulated iPhone layout' : 'Chromium'}`);
// Published runtime dependencies must work without the CDN.
await context.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

// Keep both scans pending until a lagoon frame has cached the analytic surfaces.
const scans = new Map();
for (const name of ['bark', 'sand']) {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  scans.set(name, release);
  await context.route(`**/assets/tropics/${name}.jpg`, async (route) => { await pending; await route.continue(); });
}
const page = await context.newPage();
const failures = [];
const loaded = [];
page.on('response', (response) => {
  const url = response.url();
  if (!url.startsWith(`http://localhost:${port}`)) return;
  loaded.push(url.slice(`http://localhost:${port}`.length));
  if (response.status() >= 400) failures.push(`${response.status()} ${url}`);
});
page.on('requestfailed', (request) => failures.push(`failed ${request.url()}`));
page.on('pageerror', (error) => failures.push(`page error: ${error}`));

await page.goto(`http://localhost:${port}${PAGES_PATH}`, { waitUntil: 'domcontentloaded' });
let started = true;
try { await page.waitForFunction(() => !!window.__pond, null, { timeout: patience(120000) }); } catch { started = false; }   // (the function's argument, then the options)
let rained = false, scanned = false;
if (started) {
  await page.evaluate(() => window.__pond.setWeather('heavy-rain'));
  try { await page.waitForFunction(() => window.__pond.raining, null, { timeout: patience(60000) }); rained = true; } catch { rained = false; }
  await page.evaluate(async () => {
    window.__pond.pause();
    await window.__pond.setWeather('clear');
    await window.__pond.setSky('tropical');
  });   // old bookmarks resolve to the canonical lagoon
  try {
    await page.waitForFunction(() => window.__pond.sky === 'lagoon', null, { timeout: patience(60000) });
    await page.evaluate(async () => {
      const pond = window.__pond;
      await pond.horizonReady;
      pond.advance(0);
      // Count real reflection draws, including their clipping plane, rather
      // than inferring freshness from a material flag or callback alone.
      const render = pond.renderer.render;
      window.__scanMirrorDraws = 0;
      pond.renderer.render = function(scene, camera) {
        if (scene === pond.sceneMain && camera !== pond.camera && this.clippingPlanes.length > 0) window.__scanMirrorDraws++;
        return render.call(this, scene, camera);
      };
      window.__restoreScanRender = () => { pond.renderer.render = render; };
      pond.advance(0);
      if (window.__scanMirrorDraws !== 0) throw new Error('still lagoon should reuse its cached reflection');
    });
    for (const name of ['bark', 'sand']) {
      scans.get(name)();
      await page.waitForFunction((name) => name === 'bark'
        ? window.__pond.tropics.uniforms.uBarkScanOn.value === 1
        : window.__pond.sceneMain.children.some((object) => object.material?.uniforms?.uSandScanOn?.value === 1), name, { timeout: patience(60000) });
      await page.evaluate((name) => {
        const before = window.__scanMirrorDraws;
        window.__pond.advance(0);
        if (window.__scanMirrorDraws !== before + 1) throw new Error(`${name} scan did not refresh the cached reflection`);
        window.__pond.advance(0);
        if (window.__scanMirrorDraws !== before + 1) throw new Error('reflection should be cached again after the refresh');
      }, name);
    }
    await page.evaluate(() => { window.__restoreScanRender(); return window.__pond.tropics.surfacesReady; });
    scanned = await page.evaluate(async () => {
      const pond = window.__pond, scenery = pond.tropics;
      const meshes = scenery.above.slice(), geometry = meshes.map((mesh) => mesh.geometry), placed = scenery.placed;
      pond.setQuality('low');
      pond.setQuality('high');
      const cached = scenery.placed === placed && scenery.above.every((mesh, index) => mesh === meshes[index] && mesh.geometry === geometry[index]);
      const expected = { koi: 'koi', lagoon: 'lagoon', pool: 'pool', loch: 'peat', lakeside: 'lake' };
      let switched = true;
      const bedAlbedo = {};   // what the splash's drops see of each place's bed (src/main.js bedOfPlace)
      await pond.horizonReady;
      for (const [place, water] of Object.entries(expected)) {
        await pond.setSky(place);
        await pond.horizonReady;
        switched &&= pond.sky === place && pond.clarity === water;
        bedAlbedo[place] = pond.splash.bedAlbedo;
      }
      // The lagoon's coral sand is brighter than the lake's, as its look tints the bed (1.35 to 1.6 times in each channel).
      const coralBed = bedAlbedo.lagoon / bedAlbedo.lakeside >= 1.35 && bedAlbedo.lagoon / bedAlbedo.lakeside <= 1.6;
      pond.setIce('thin');
      pond.throwAt(0, -1.4, { radius: 0.15 });
      pond.advance(3);
      const hole = pond.iceSheet.holes[0], shards = pond.rocks.filter((rock) => rock.piece);
      const pieces = pond.iceSheet.pieces.size;
      await pond.setSky('highlands');
      await pond.horizonReady;
      const keptIce = !!hole && shards.length > 0 && pieces > 0 && pond.iceSheet.holes.includes(hole)
        && pond.iceSheet.pieces.size === pieces && shards.every((rock) => pond.rocks.includes(rock));
      if (!cached) throw new Error('quality changes rebuilt lagoon geometry or placements');
      if (!switched) throw new Error('place tour selected the wrong water');
      if (!coralBed) throw new Error(`the splash sees the lagoon's bed as ${bedAlbedo.lagoon} against the lake's ${bedAlbedo.lakeside}`);
      if (!keptIce) throw new Error('lake location switch lost ice holes or registered shards');
      pond.setIce('none');
      await pond.setSky('swiss');
      await pond.horizonReady;
      if (pond.ice === 'none' || pond.rocks.length > 0) throw new Error('Swiss entry failed to apply its frozen-water preset cleanly');
      const sandOn = pond.sceneMain.children.some((object) => object.material?.uniforms?.uSandScanOn?.value === 1);
      return scenery.uniforms.uBarkScanOn.value === 1 && sandOn;
    });
  } catch (error) { scanned = false; failures.push(`lagoon/place regression: ${error.message}`); }
}
for (const release of scans.values()) release();
const veilMessage = await page.evaluate(() => document.querySelector('.veil .error')?.textContent ?? null);
await browser.close();
server.close();

console.log(`[site-check] ${loaded.length} requests under ${PAGES_PATH}: ${[...new Set(loaded.map((url) => url.split('/').slice(0, 3).join('/')))].join(', ')}`);
if (veilMessage) failures.push(`the veil shows: ${veilMessage}`);
if (!started) failures.push('the pond never started');
else if (!rained) failures.push('the rain never fell');
else if (!scanned) failures.push('the lagoon\'s scanned surfaces never came');
if (failures.length) { console.error('[site-check] FAIL'); for (const failure of failures) console.error(`  ${failure}`); process.exit(1); }
console.log('[site-check] ok: the pond starts, the rain falls, the lagoon\'s scans come and every request succeeds');
