// Published startup and delayed-asset regressions. Build with npm run site first.
// No CDN mocks: the deployed runtime must be entirely same-origin.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from './browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_site');
const prefix = '/AStonesThrow/';
const served = new Map();   // requests by path, all pages together
const servedCount = (asset) => served.get(`${prefix}${asset}`) ?? 0;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    served.set(pathname, (served.get(pathname) ?? 0) + 1);
    if (!pathname.startsWith(prefix)) throw new Error('outside site');
    const relative = pathname.slice(prefix.length) || 'index.html';
    const body = await readFile(path.join(root, relative));
    response.setHeader('content-type', relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
// The GPU if there is one, else SwiftShader (tools/browser.mjs).
const browser = await launchBrowser();
async function pageFor(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  return context.newPage();
}
async function open(page, query = '') {
  await page.goto(`${origin}${prefix}?quality=low&paused=1${query}`, { waitUntil: 'domcontentloaded' });
}
async function ready(page) {
  await page.waitForFunction(() => window.__pond && document.querySelector('#veil').classList.contains('gone'), null, { timeout: 120000 });
}
function hold(page, pattern) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const arrived = page.waitForRequest(pattern, { timeout: 120000 });
  const installed = page.route(pattern, async (route) => { await gate; await route.continue().catch(() => {}); });
  return { release, arrived, installed };
}
try {
  const page = await pageFor({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await ready(page);
  assert.equal(await page.title(), 'A Stone’s Throw');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('/assets/rain/'))), false);
  // The first sky is asked for from the page's head (index.html), before any module has run, and its load takes the
  // requests over (src/loadAsset.js): on a first visit the default place's files, each fetched once.
  const firstVisitSky = ['assets/sky/lakeside_2k.jpg', 'assets/sky/lakeside.json', 'assets/sky/meadow_2.json'];
  assert.deepEqual(firstVisitSky.map(servedCount), [1, 1, 1], 'each of the first sky\'s files fetched once');
  assert.deepEqual(await page.evaluate(() => ({ early: window.__earlyAssets?.size, remembered: JSON.parse(localStorage.getItem('stone-pond-sky-assets')).map((href) => new URL(href).pathname) })),
    { early: 0, remembered: firstVisitSky.map((asset) => `${prefix}${asset}`) }, 'the head\'s first-visit files are the ones the default sky loads');
  const first = await page.evaluate(() => {
    const pond = window.__pond;
    const target = pond.renderer.getRenderTarget();
    return { frames: pond.framesRendered, rocks: pond.rocks.length, target: target === null, programs: pond.budget.programs };
  });
  assert(first.target && first.frames > 0 && first.rocks === 0);
  // A real UI throw immediately after startup must survive later asset work.
  await page.locator('#throw').click();
  assert.equal(await page.evaluate(() => window.__pond.rocks.length), 1);
  const rain = hold(page, '**/assets/rain/*.bin');
  await rain.installed;
  await page.evaluate(() => { window.pendingRain = window.__pond.setWeather('heavy-rain'); });
  await rain.arrived;
  await page.evaluate(() => window.__pond.setWeather('clear'));
  rain.release();
  await page.evaluate(() => window.pendingRain);
  assert.deepEqual(await page.evaluate(() => ({ weather: window.__pond.weather, raining: window.__pond.raining, rocks: window.__pond.rocks.length })), { weather: 'clear', raining: false, rocks: 1 });
  const sky = hold(page, '**/assets/sky/lago_disola_4k.jpg');
  await sky.installed;
  await page.evaluate(() => { window.pendingSky = window.__pond.setSky('swiss'); });
  await sky.arrived;
  assert.equal(await page.evaluate(() => window.__pond.sky), 'lakeside');
  await page.evaluate(() => { window.latestSky = window.__pond.setSky('cove'); });
  // A slow obsolete location must not hold the latest one in a queue.
  await page.waitForFunction(() => window.__pond.sky === 'cove', null, { timeout: 60000 });
  sky.release();
  await page.evaluate(() => Promise.all([window.pendingSky, window.latestSky]));
  assert.equal(await page.evaluate(() => window.__pond.sky), 'cove');
  assert.equal(await page.evaluate(() => window.__pond.rocks.length), 1);
  assert.equal(await page.evaluate(() => window.__pond.waterChoice), 'lake'); // cancelled Swiss must not freeze the water
  assert.equal(await page.evaluate(() => localStorage.getItem('stone-pond-sky')), 'cove');
  await page.evaluate(() => window.__pond.setSky('lakeside'));
  const hour = hold(page, '**/assets/sky/lakeside_night_2k.jpg');
  await hour.installed;
  await page.evaluate(() => { window.pendingHour = window.__pond.setHour('night'); });
  await hour.arrived;
  await page.evaluate(() => window.__pond.setHour('afternoon'));
  hour.release();
  await page.evaluate(() => window.pendingHour);
  assert.equal(await page.evaluate(() => window.__pond.hour), 'afternoon');
  assert.equal(await page.evaluate(() => window.localStorage.getItem('stone-pond-time')), '14:41');
  const uiHour = hold(page, '**/assets/sky/lakeside_night_2k.jpg');
  await uiHour.installed;
  await page.evaluate(() => {
    const setHour = window.__pond.setHour;
    window.uiHourLoads = [];
    window.__pond.setHour = (...args) => {
      const pending = setHour(...args);
      window.uiHourLoads.push(pending);
      return pending;
    };
  });
  await page.locator('#menu-button').click();
  await page.locator('.menu-tier[data-open="time"]').click();
  await uiHour.arrived; // the Time page prefetches the neighbouring night
  // Well under loadAsset's 30 s inactivity timeout, which would abort the held download anyway.
  const abandonedPrefetch = page.waitForEvent('requestfailed', (request) => request.url().endsWith('/lakeside_night_2k.jpg'), { timeout: 15000 });
  await page.locator('#time-presets [data-hour="night"]').click();
  await page.locator('#time-presets [data-hour="afternoon"]').click();
  await abandonedPrefetch; // the night load took the prefetch over, so superseding it stops that download too
  uiHour.release();
  await page.evaluate(() => Promise.all(window.uiHourLoads));
  assert.equal(await page.evaluate(() => window.__pond.hour), 'afternoon');
  assert.equal(await page.locator('#time-name').textContent(), 'Afternoon');
  assert.equal(await page.locator('#time-presets [aria-pressed="true"]').getAttribute('data-hour'), 'afternoon');
  assert.deepEqual(errors, []);
  console.log('PASS: same-origin startup, first throw, delayed weather cancellation, latest sky bypasses a stalled download and returning to the shown hour cancels a pending one');
  // The next visit asks first for the sky shown last (src/main.js SKY_ASSETS_STORAGE_KEY), here the Rocky cove's, once.
  await page.evaluate(() => window.__pond.setSky('cove'));
  const coveBefore = servedCount('assets/sky/secluded_beach_2k.jpg');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  assert.equal(await page.evaluate(() => window.__pond.sky), 'cove');
  assert.equal(servedCount('assets/sky/secluded_beach_2k.jpg') - coveBefore, 1);
  assert.equal(await page.evaluate(() => window.__earlyAssets?.size), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: the first sky is fetched from the page\'s head, the default on a first visit, the last one shown after');
  await page.context().close();

  const swiss = await pageFor({ width: 1280, height: 720 });
  const swissErrors = [];
  swiss.on('pageerror', (error) => swissErrors.push(error.message));
  await open(swiss, '&sky=swiss');
  await ready(swiss);
  const swissState = () => swiss.evaluate(() => ({ place: window.__pond.sky, water: window.__pond.waterChoice, ice: window.__pond.ice, pooled: window.__pond.pooled }));
  assert.deepEqual(await swissState(), { place: 'swiss', water: 'frozen', ice: 'thin', pooled: false });
  assert.equal(await swiss.locator('#sky [data-value="swiss"]').count(), 1);
  assert.equal(await swiss.evaluate(() => window.__pond.viewName), 'level');
  assert.equal(await swiss.locator('#sky [data-value="meadow"], #sky [data-value="open"], #sky [data-value="alpine"]').count(), 0);
  assert.equal(await swiss.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/lago_disola_4k.jpg'))), true);
  if (process.env.SWISS_SCREENSHOT) await swiss.screenshot({ path: process.env.SWISS_SCREENSHOT });
  await swiss.evaluate(async () => {
    window.__pond.setWater('clear');
    await window.__pond.setHour('midday');
  });
  assert.equal((await swissState()).water, 'clear'); // changing the hour must not reapply the place preset
  await swiss.reload();
  await ready(swiss);
  assert.equal((await swissState()).water, 'clear'); // a deliberate thaw survives reload
  await swiss.evaluate(async () => {
    await window.__pond.setSky('cove');
    await window.__pond.setSky('swiss');
  });
  assert.equal((await swissState()).water, 'frozen'); // entering Swiss applies its preset
  await open(swiss, '&sky=swiss&water=lake&view=high');
  await ready(swiss);
  assert.equal((await swissState()).water, 'lake'); // explicit water wins over the preset and saved Frozen
  assert.equal(await swiss.evaluate(() => window.__pond.viewName), 'high');
  await swiss.evaluate(async () => {
    await window.__pond.setSky('cove');
    await window.__pond.setSky('swiss');
  });
  assert.equal(await swiss.evaluate(() => window.__pond.viewName), 'high'); // keep the user's custom view on entry
  await open(swiss, '&sky=alpine&ice=none');
  await ready(swiss);
  assert.deepEqual(await swissState(), { place: 'swiss', water: 'lake', ice: 'none', pooled: false });
  await swiss.evaluate(async () => {
    await window.__pond.setSky('pool');
    await window.__pond.setHour('sunrise', { place: 'pool' });
  });
  assert.deepEqual(await swiss.evaluate(() => ({ place: window.__pond.sky, hour: window.__pond.hour, pooled: window.__pond.pooled })), { place: 'pool', hour: 'sunrise', pooled: true });
  for (const retired of ['meadow', 'open']) {
    await swiss.evaluate((place) => window.__pond.setSky(place), retired);
    assert.equal((await swissState()).place, 'lakeside');
  }
  assert.deepEqual(swissErrors, []);
  console.log('PASS: Swiss Alps loads 4K with Frozen, remembers a thaw, respects explicit water/ice, retires old locations, and Pool keeps its geometry when its hour changes');
  await swiss.context().close();

  const saved = await pageFor();
  await saved.addInitScript(() => {
    localStorage.setItem('stone-pond-weather', 'storm');
    localStorage.setItem('stone-pond-thing', 'pizza');
  });
  const savedRain = hold(saved, '**/assets/rain/*.bin');
  const savedSky = hold(saved, '**/assets/sky/lakeside_2k.jpg');
  await savedRain.installed;
  await savedSky.installed;
  await open(saved);
  await Promise.all([savedRain.arrived, savedSky.arrived]);
  // Rain must already be downloading while the sky is still blocked.
  savedSky.release();
  assert.equal(await saved.evaluate(() => Boolean(window.__pond)), false);
  await saved.keyboard.press('Space');
  assert.equal(await saved.locator('#veil').getAttribute('class'), 'veil');
  savedRain.release();
  await ready(saved);
  assert.deepEqual(await saved.evaluate(() => ({ thing: window.__pond.thing, weather: window.__pond.weather, wind: window.__pond.wind, raining: window.__pond.raining, rocks: window.__pond.rocks.length })), { thing: 'pizza', weather: 'storm', wind: 'gale', raining: true, rocks: 0 });
  if (process.env.STARTUP_SCREENSHOT) {
    await saved.waitForTimeout(700);
    await saved.screenshot({ path: process.env.STARTUP_SCREENSHOT });
  }
  console.log('PASS: saved storm/pizza waits for rain, blocks early input and reveals a clean scene');
  await saved.context().close();

  // Settings saved before the Pool was a place and the ice a water (src/main.js migrateStoredSettings): the Water
  // setting's Pool opens the Pool place, the Ice setting's thick ice Frozen water that thick, saved so from then on.
  const older = await pageFor();
  await older.addInitScript(() => {
    if (sessionStorage.getItem('migrated')) return;
    sessionStorage.setItem('migrated', '1');
    localStorage.setItem('stone-pond-water', 'pool');
    localStorage.setItem('stone-pond-ice', 'thick');
  });
  await open(older);
  await ready(older);
  const carried = () => older.evaluate(() => ({
    place: window.__pond.sky, pooled: window.__pond.pooled, water: window.__pond.waterChoice, ice: window.__pond.ice,
    saved: [localStorage.getItem('stone-pond-sky'), localStorage.getItem('stone-pond-water'), localStorage.getItem('stone-pond-frozen'), localStorage.getItem('stone-pond-ice')],
    row: document.querySelector('.menu-tier[data-open="water"] .menu-tier-value').textContent,
  }));
  const expected = { place: 'pool', pooled: true, water: 'frozen', ice: 'thick', saved: ['pool', 'frozen', 'thick', null], row: 'Frozen · Thick' };
  assert.deepEqual(await carried(), expected);
  await older.reload();
  await ready(older);
  assert.deepEqual(await carried(), expected);
  console.log('PASS: the old Pool water and Ice settings open the Pool place, frozen thick, and stay so');
  // Frozen at the start, the warm-up breaks the ice under the veil (src/main.js warmUp), so the first break a person
  // makes (a big rock through thick ice: on thick ice the warm-up's stone would skid) builds no program, nor does a
  // throw into open water after (the warm-up threw into open water first).
  const firstBreak = await older.evaluate(() => {
    const pond = window.__pond, programs = () => pond.renderer.info.programs.length;
    const before = programs();
    pond.setThing('granite');
    pond.setSize(29.5);
    pond.throwAt(0, -1.4, { power: 'normal' });
    pond.advance(1.6);
    const broken = { programs: programs(), holes: pond.iceSheet.holes.length };
    pond.setThing('stone');
    pond.setWater('lake');
    pond.throwAt(0.3, -1.6, { radius: 0.03, power: 'normal' });
    pond.advance(0.5);
    return { before, broken, openWater: programs() };
  });
  assert.ok(firstBreak.broken.holes > 0, 'the big rock did not break the thick ice');
  assert.deepEqual([firstBreak.broken.programs, firstBreak.openWater], [firstBreak.before, firstBreak.before], `programs built after the start: ${JSON.stringify(firstBreak)}`);
  console.log(`PASS: started frozen thick, the first break and a throw into open water after build no program (${firstBreak.before})`);
  await older.context().close();

  const retriedRain = await pageFor();
  await open(retriedRain);
  await ready(retriedRain);
  await retriedRain.route('**/assets/rain/*.bin', (route) => route.abort(), { times: 1 });
  const retryErrors = [];
  retriedRain.on('pageerror', (error) => retryErrors.push(error.message));
  await retriedRain.locator('#menu-button').click();
  await retriedRain.locator('[data-open="weather"]').click();
  await retriedRain.locator('#weather [data-value="heavy-rain"]').click();
  await retriedRain.locator('#weather-note button').waitFor();
  assert.match(await retriedRain.locator('#weather-note').textContent(), /could not be loaded/);
  assert.equal(await retriedRain.evaluate(() => window.__pond.raining), false);
  if (process.env.RAIN_ERROR_SCREENSHOT) {
    await retriedRain.waitForTimeout(700);   // finish the startup veil's fade
    await retriedRain.screenshot({ path: process.env.RAIN_ERROR_SCREENSHOT });
  }
  await retriedRain.locator('#weather-note button').click();
  await retriedRain.waitForFunction(() => window.__pond.raining);
  assert.equal(await retriedRain.locator('#weather-note button').count(), 0);
  assert.deepEqual(retryErrors, []);
  console.log('PASS: a failed rain download shows an error and the UI Retry restores rain');
  await retriedRain.context().close();

  const staleRain = await pageFor();
  await open(staleRain);
  await ready(staleRain);
  const staleErrors = [];
  staleRain.on('pageerror', (error) => staleErrors.push(error.message));
  let failRain;
  const failGate = new Promise((resolve) => { failRain = resolve; });
  await staleRain.route('**/assets/rain/*.bin', async (route) => { await failGate; await route.abort(); });
  await staleRain.locator('#menu-button').click();
  await staleRain.locator('[data-open="weather"]').click();
  const requested = staleRain.waitForRequest('**/assets/rain/*.bin');
  await staleRain.locator('#weather [data-value="heavy-rain"]').click();
  await requested;
  await staleRain.locator('#weather [data-value="clear"]').click();
  const clearNote = await staleRain.locator('#weather-note').textContent();
  const failedRequest = staleRain.waitForEvent('requestfailed', (request) => request.url().endsWith('.bin'));
  failRain();
  await failedRequest;
  // Drain the fetch rejection and UI promise handlers after the network event.
  await staleRain.waitForTimeout(100);
  assert.equal(await staleRain.locator('#weather-note').textContent(), clearNote);
  assert.equal(await staleRain.locator('#weather-note button').count(), 0);
  assert.equal(await staleRain.evaluate(() => window.__pond.raining), false);
  assert.deepEqual(staleErrors, []);
  console.log('PASS: a superseded rain failure cannot overwrite the current weather UI');
  await staleRain.context().close();

  const failedStartupRain = await pageFor();
  await failedStartupRain.addInitScript(() => {
    if (localStorage.getItem('stone-pond-weather') === null) localStorage.setItem('stone-pond-weather', 'storm');
  });
  await failedStartupRain.route('**/assets/rain/*.bin', (route) => route.abort());
  await open(failedStartupRain);
  await failedStartupRain.locator('#veil .error').waitFor({ timeout: 120000 });
  assert.match(await failedStartupRain.locator('#veil .error').textContent(), /rain could not be loaded/);
  assert.equal(await failedStartupRain.evaluate(() => Boolean(window.__pond)), false);
  await failedStartupRain.getByRole('button', { name: 'Retry', exact: true }).click();
  await failedStartupRain.locator('#veil .error').waitFor({ timeout: 120000 });
  await failedStartupRain.keyboard.press('Space');
  assert.equal(await failedStartupRain.evaluate(() => Boolean(window.__pond)), false);
  if (process.env.RAIN_STARTUP_ERROR_SCREENSHOT) await failedStartupRain.screenshot({ path: process.env.RAIN_STARTUP_ERROR_SCREENSHOT });
  await failedStartupRain.getByRole('button', { name: 'Continue without rain', exact: true }).click();
  await ready(failedStartupRain);
  assert.deepEqual(await failedStartupRain.evaluate(() => ({ weather: window.__pond.weather, raining: window.__pond.raining, rocks: window.__pond.rocks.length, saved: localStorage.getItem('stone-pond-weather'), drawn: window.__pond.framesRendered > 0 && window.__pond.renderer.getRenderTarget() === null })), { weather: 'clear', raining: false, rocks: 0, saved: 'clear', drawn: true });
  await failedStartupRain.locator('#throw').click();
  assert.equal(await failedStartupRain.evaluate(() => window.__pond.rocks.length), 1);
  // The failed asset is still unavailable, but the saved fallback now opens.
  await failedStartupRain.reload({ waitUntil: 'domcontentloaded' });
  await ready(failedStartupRain);
  assert.equal(await failedStartupRain.evaluate(() => window.__pond.weather), 'clear');
  await failedStartupRain.unroute('**/assets/rain/*.bin');
  await failedStartupRain.evaluate(() => window.__pond.setWeather('storm'));
  assert.equal(await failedStartupRain.evaluate(() => window.__pond.raining), true);
  console.log('PASS: saved rain failure offers an escape, renders before input, remembers Clear and permits rain retry');
  await failedStartupRain.context().close();

  for (const asset of ['vendor/three/build/three.module.min.js', 'assets/sky/lakeside_2k.jpg']) {
    const failed = await pageFor();
    await failed.route(`**/${asset}`, (route) => route.abort());
    await open(failed);
    await failed.locator('#veil .error').waitFor();
    assert.equal(await failed.locator('#veil button').textContent(), 'Retry');
    assert.equal(await failed.evaluate(() => Boolean(window.__pond)), false);
    await failed.unroute(`**/${asset}`);
    await failed.locator('#veil button').click();
    await ready(failed);
    console.log(`PASS: failed ${asset} shows Retry and recovers on retry`);
    await failed.context().close();
  }

  for (const asset of ['vendor/three/build/three.module.min.js', 'assets/sky/lakeside_2k.jpg', 'assets/rain/ring_profile.bin']) {
    const delayed = await pageFor();
    const moduleCase = asset.startsWith('vendor/');
    if (moduleCase) {
      await delayed.route((url) => url.pathname === prefix, async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const body = source.replace("reject(new Error('Module load timed out')), 30000)", "reject(new Error('Module load timed out')), 250)");
        assert.notEqual(body, source, 'the module deadline must be instrumented');
        await route.fulfill({ response, body });
      });
    } else {
      // Instrument only the selected asset, leaving the module watchdog and
      // every other asset's deadline intact. No production test switches.
      await delayed.route('**/src/loadAsset.js', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const body = source.replace('  const controller =', `  if (new URL(url).pathname.endsWith(${JSON.stringify('/' + asset)})) timeout = 250;\n  const controller =`);
        assert.notEqual(body, source, 'the selected asset deadline must be instrumented');
        await route.fulfill({ response, body });
      });
      // Deliberately exceed the old globally shortened module deadline.
      await delayed.route('**/src/main.js', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });
    }
    const pending = hold(delayed, `**/${asset}`);
    await pending.installed;
    await open(delayed, asset.includes('/rain/') ? '&weather=storm' : '');
    await pending.arrived;
    await delayed.locator('#veil .error').waitFor({ timeout: 120000 });
    const expectedError = moduleCase ? /download its files/ : asset.includes('/rain/') ? /rain could not be loaded/ : /sky could not be loaded/;
    assert.match(await delayed.locator('#veil .error').textContent(), expectedError);
    pending.release();
    await delayed.waitForTimeout(500);
    assert.equal(await delayed.evaluate(() => Boolean(window.__pond)), false);
    assert.equal(await delayed.locator('#veil').getAttribute('class'), 'veil');
    if (asset.includes('/rain/')) {
      await delayed.getByRole('button', { name: 'Continue without rain', exact: true }).click();
      await ready(delayed);
      assert.equal(await delayed.evaluate(() => window.__pond.raining), false);
    }
    console.log(`PASS: late ${asset} cannot start or reveal a timed-out pond`);
    await delayed.context().close();
  }
} finally {
  await browser.close();
  server.close();
}
