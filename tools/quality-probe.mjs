// Browser probe of the automatic quality (CALIBRATION in src/main.js) through
// the page's own frame loop, which runs unpaused here. Loads the page headless
// like tools/shoot.mjs at phone size and
// ?quality=auto, waits for the idle measurement, throws a stone, waits for the
// splash measurement, and prints what happened: the frame rate the page
// reports, the preset after each phase, and whether the readout and the
// quality buttons followed. Under SwiftShader the frame rate is far below the
// thresholds, so the preset must end on low; on a real GPU it may stay high,
// and then the probe only checks consistency. Exits with status 1 on a failure.
//
//   node tools/quality-probe.mjs
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });   // 1×: the logic is the same and SwiftShader is slow
await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
  const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
  try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
});
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });

let failures = 0;
const check = (passed, text) => { console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${text}`); if (!passed) failures++; };
const pageState = () => page.evaluate(() => ({
  quality: window.__pond.quality,
  readout: document.getElementById('stats').textContent,
  pressed: [...document.querySelectorAll('#quality button')].filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.dataset.value),
  droplets: window.__pond.splash.count,
}));

await page.goto(`http://localhost:${server.address().port}/index.html?quality=auto`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__pond, undefined, { timeout: 120000 });
const atStart = await pageState();
check(atStart.quality === 'high', `starts on high (got ${atStart.quality})`);

// The idle measurement: 30 warm-up frames and 60 measured. Wait for the readout to show a preset and the frames to pass.
const idleStart = Date.now();
await page.waitForFunction(() => /fps/.test(document.getElementById('stats').textContent), undefined, { timeout: 300000 });
await page.waitForFunction(() => window.__pond.quality !== 'high', undefined, { timeout: 600000 }).catch(() => {});
const afterIdle = await pageState();
const idleFps = Number(/(\d+) fps/.exec(afterIdle.readout)?.[1]);
console.log(`  idle: ${afterIdle.readout} after ${((Date.now() - idleStart) / 1000).toFixed(0)} s`);
if (idleFps < 30) check(afterIdle.quality === 'low', `idle below 30 fps steps down to low (got ${afterIdle.quality})`);
else if (idleFps < 50) check(afterIdle.quality === 'medium', `idle below 50 fps steps down to medium (got ${afterIdle.quality})`);
else check(afterIdle.quality === 'high', `idle at ${idleFps} fps stays high (got ${afterIdle.quality})`);
check(afterIdle.pressed.length === 1 && afterIdle.pressed[0] === afterIdle.quality, `the quality buttons show ${afterIdle.quality} (pressed: ${afterIdle.pressed.join(',') || 'none'})`);
check(afterIdle.readout.endsWith(afterIdle.quality), `the readout names the preset (${afterIdle.readout})`);

// The splash measurement: throw, wait for the splash to be measured or to end.
await page.evaluate(() => window.__pond.throwAt(0, -1.4, { radius: 0.03 }));
await page.waitForFunction(() => window.__pond.splash.count > 0, undefined, { timeout: 300000 });
const splashStart = Date.now();
await page.waitForFunction(() => window.__pond.splash.count === 0, undefined, { timeout: 900000 }).catch(() => {});
const afterSplash = await pageState();
console.log(`  splash: ${afterSplash.readout} after ${((Date.now() - splashStart) / 1000).toFixed(0)} s of splash`);
check(QUALITY_ORDER_INDEX(afterSplash.quality) >= QUALITY_ORDER_INDEX(afterIdle.quality), `the splash never steps the quality up (${afterIdle.quality} -> ${afterSplash.quality})`);
check(afterSplash.pressed.length === 1 && afterSplash.pressed[0] === afterSplash.quality, `the quality buttons show ${afterSplash.quality}`);

// A button press fixes the preset: no further automatic change.
await page.evaluate(() => window.__pond.setQuality('medium'));
const afterPress = await pageState();
check(afterPress.quality === 'medium', `setQuality('medium') applies (got ${afterPress.quality})`);

function QUALITY_ORDER_INDEX(name) { return ['high', 'medium', 'low'].indexOf(name); }
if (problems.length) { console.log('  console problems:'); console.log('  ' + problems.slice(0, 10).join('\n  ')); }
await browser.close();
server.close();
console.log(failures ? `${failures} check(s) failed` : 'all quality checks passed');
process.exit(failures ? 1 : 0);
