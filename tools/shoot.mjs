// Headless screenshot harness for Stone Pond.
//
// Serves the project folder, routes the CDN Three.js imports to node_modules
// so the page loads offline, drives the simulation through window.__pond in
// deterministic steps, and writes PNG frames.
//
//   node tools/shoot.mjs --label=first --throws=0:-1.4:0.03 --times=0.02,0.08,0.15,0.3,0.6,1.2
//
// --throws: x:z:radius per stone, comma separated. --times: seconds after the
// first impact to capture. --w/--h/--dpr set the viewport. --ui=1 keeps the UI.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
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
const throws = arg('throws', '0:-1.4:0.03').split(',').map((t) => t.split(':').map(Number));
const times = arg('times', '0.02,0.08,0.15,0.3,0.6,1.2').split(',').map(Number);
const keepUi = arg('ui', '0') === '1';
const quality = arg('quality', 'high');
const preRoll = Number(arg('preroll', '0'));
const debugView = arg('debug', 'none');
const fov = arg('fov', '');
const look = arg('look', '');
const evalAfterThrow = arg('eval', '');
const preImpact = Number(arg('preimpact', '0'));

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

const url = `http://localhost:${port}/index.html?quality=${quality}${keepUi ? '' : '&ui=0'}`;
console.log(`[shoot] ${url} -> ${outDir}`);
await page.goto(url, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => !!window.__pond, { timeout: 60000 });
} catch {
  console.error('[shoot] the pond never became ready');
  console.error(problems.join('\n'));
  await browser.close(); server.close(); process.exit(1);
}
await page.evaluate(() => window.__pond.pause());
await page.evaluate((name) => window.__pond.setDebugView(name), debugView);
if (fov) await page.evaluate((f) => window.__pond.setFov(Number(f)), fov);
if (look) await page.evaluate((l) => { const [x, y, z] = l.split(':').map(Number); window.__pond.lookAt(x, y, z); }, look);
await page.evaluate((seconds) => window.__pond.advance(seconds), preRoll);
await page.screenshot({ path: path.join(outDir, 'idle.png') });
console.log('[shoot] idle.png');

for (const [x, z, radius] of throws) await page.evaluate(([x, z, radius]) => window.__pond.throwAt(x, z, { radius }), [x, z, radius]);
if (evalAfterThrow) await page.evaluate(evalAfterThrow);
let flight = 0;
if (preImpact > 0) {
  await page.evaluate((seconds) => window.__pond.advance(seconds), preImpact);
  flight += preImpact;
  await page.screenshot({ path: path.join(outDir, 'flight.png'), timeout: 180000 });
  console.log('[shoot] flight.png');
}
while (!(await page.evaluate(() => window.__pond.hasImpacted())) && flight < 3) {
  await page.evaluate(() => window.__pond.advance(1 / 60));
  flight += 1 / 60;
}
console.log(`[shoot] impact after ${flight.toFixed(2)} s of flight`);
let elapsed = 0;
for (const t of times) {
  await page.evaluate((seconds) => window.__pond.advance(seconds), Math.max(t - elapsed, 0));
  elapsed = Math.max(t, elapsed);
  const name = `t${t.toFixed(2).replace('.', '_')}.png`;
  await page.screenshot({ path: path.join(outDir, name), timeout: 180000 });
  console.log(`[shoot] ${name}`);
}
if (problems.length) { console.log('[shoot] console problems:'); console.log(problems.slice(0, 20).join('\n')); }
await browser.close();
server.close();
