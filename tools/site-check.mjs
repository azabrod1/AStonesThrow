// Loads the published site (_site/, from npm run site) the way GitHub Pages
// serves it, under the project path /AStonesThrow/, and checks that the pond
// starts, that rain falls once asked for (its files load only then) and that
// every request the page makes succeeds. Catches a file
// missing from SITE_FILES (tools/build-site.mjs) and a root-absolute path,
// which works on localhost and 404s on Pages.
//
//   npm run site && node tools/site-check.mjs
//
// Three.js and the fonts are routed to node_modules and to nothing, as in
// tools/shoot.mjs, so the check runs offline; the CDN itself is not tested.
import { chromium } from 'playwright';
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

const containerChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROMIUM || (existsSync(containerChromium) ? containerChromium : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await context.route('https://cdn.jsdelivr.net/npm/three@*/**', async (route) => {
  const relative = new URL(route.request().url()).pathname.replace(/^\/npm\/three@[^/]+\//, '');
  try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); }
  catch { await route.fulfill({ status: 404, body: '' }); }
});
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

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
try { await page.waitForFunction(() => !!window.__pond, { timeout: 120000 }); } catch { started = false; }
let rained = false;
if (started) {
  await page.evaluate(() => window.__pond.setWeather('heavy-rain'));
  try { await page.waitForFunction(() => window.__pond.raining, null, { timeout: 60000 }); rained = true; } catch { rained = false; }
}
const veilMessage = await page.evaluate(() => document.querySelector('.veil .error')?.textContent ?? null);
await browser.close();
server.close();

console.log(`[site-check] ${loaded.length} requests under ${PAGES_PATH}: ${[...new Set(loaded.map((url) => url.split('/').slice(0, 3).join('/')))].join(', ')}`);
if (veilMessage) failures.push(`the veil shows: ${veilMessage}`);
if (!started) failures.push('the pond never started');
else if (!rained) failures.push('the rain never fell');
if (failures.length) { console.error('[site-check] FAIL'); for (const failure of failures) console.error(`  ${failure}`); process.exit(1); }
console.log('[site-check] ok: the pond starts, the rain falls and every request succeeds');
