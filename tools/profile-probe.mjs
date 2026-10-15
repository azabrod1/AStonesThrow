// Runs the page with ?profile=1 headless (as tools/shoot.mjs loads it) and
// prints the profiler's report (src/profiler.js), to check the profiling
// steps run through on this build. The milliseconds it prints are
// SwiftShader's and mean nothing for a device; the report's shape is what is
// checked. Saves a screenshot of the readout next to the report.
//
//   node tools/profile-probe.mjs
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const file = path.join(root, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    const data = await readFile(file);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  } catch { response.writeHead(404); response.end('not found'); }
});
await new Promise((resolve) => server.listen(0, resolve));
const containerChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: existsSync(containerChromium) ? containerChromium : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
  const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
  try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
});
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
await page.goto(`http://localhost:${server.address().port}/index.html?profile=1&quality=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__pond, undefined, { timeout: 120000 });
console.log('quality', await page.evaluate(() => window.__pond.quality));
await page.waitForFunction(() => document.getElementById('stats').textContent.includes('during a splash'), undefined, { timeout: 1200000 });
console.log(await page.evaluate(() => document.getElementById('stats').textContent));
await page.screenshot({ path: path.join(root, 'shots', 'profile-readout.png') });
if (problems.length) console.log('problems:', problems.slice(0, 5).join('\n'));
await browser.close(); server.close();
