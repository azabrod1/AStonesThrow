// Published startup and delayed-asset regressions. Build with npm run site first.
// No CDN mocks: the deployed runtime must be entirely same-origin.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_site');
const prefix = '/AStonesThrow/';
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(prefix)) throw new Error('outside site');
    const relative = pathname.slice(prefix.length) || 'index.html';
    const body = await readFile(path.join(root, relative));
    response.setHeader('content-type', relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: process.env.PW_HARDWARE ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
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
  const sky = hold(page, '**/assets/sky/lago_disola_2k.hdr');
  await sky.installed;
  await page.evaluate(() => { window.pendingSky = window.__pond.setSky('alpine'); });
  await sky.arrived;
  assert.equal(await page.evaluate(() => window.__pond.sky), 'lakeside');
  await page.evaluate(() => { window.latestSky = window.__pond.setSky('meadow'); });
  sky.release();
  await page.evaluate(() => Promise.all([window.pendingSky, window.latestSky]));
  assert.equal(await page.evaluate(() => window.__pond.sky), 'meadow');
  assert.equal(await page.evaluate(() => window.__pond.rocks.length), 1);
  assert.deepEqual(errors, []);
  console.log('PASS: same-origin startup, first throw, delayed weather cancellation and rapid sky changes');
  await page.context().close();

  const saved = await pageFor();
  await saved.addInitScript(() => {
    localStorage.setItem('stone-pond-weather', 'storm');
    localStorage.setItem('stone-pond-thing', 'pizza');
  });
  const savedRain = hold(saved, '**/assets/rain/*.bin');
  const savedSky = hold(saved, '**/assets/sky/lakeside_2k.hdr');
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

  for (const asset of ['vendor/three/build/three.module.min.js', 'assets/sky/lakeside_2k.hdr']) {
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

  for (const asset of ['vendor/three/build/three.module.min.js', 'assets/sky/lakeside_2k.hdr', 'assets/rain/ring_profile.bin']) {
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
