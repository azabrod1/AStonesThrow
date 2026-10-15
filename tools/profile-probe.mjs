// Runs the page with ?profile=1 headless (as tools/shoot.mjs loads it) and
// prints the profiler's report (src/profiler.js), to check that the
// profiling steps run through on this build and that the report has its
// shape: the floor of empty frames, the still pond and the splash with each
// of their variants (each with its milliseconds, median and mean, its change
// against the baselines around it and its JS time), and the memory lines. The
// milliseconds it prints are SwiftShader's and mean nothing for a device.
// Saves a screenshot of the readout next to the report, and exits with
// status 1 if the report is missing a line or a number.
//
//   node tools/profile-probe.mjs [--quality=low]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEDULE } from '../src/profiler.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quality = process.argv.find((argument) => argument.startsWith('--quality='))?.slice(10) ?? 'low';
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
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM || (existsSync(containerChromium) ? containerChromium : undefined),
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
await page.goto(`http://localhost:${server.address().port}/index.html?profile=1&quality=${quality}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__pond, undefined, { timeout: 120000 });
console.log('quality', await page.evaluate(() => window.__pond.quality));
await page.waitForFunction(() => /^textures /m.test(document.getElementById('stats').textContent), undefined, { timeout: 3600000 });
const readout = await page.evaluate(() => document.getElementById('stats').textContent);
console.log(readout);
await mkdir(path.join(root, 'shots'), { recursive: true });
await page.screenshot({ path: path.join(root, 'shots', 'profile-readout.png') });

let failures = 0;
const check = (passed, text) => { console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${text}`); if (!passed) failures++; };
const lines = readout.split('\n');
const number = '\\d+\\.\\d';
check(lines[0].startsWith('profile · '), 'the report names the quality and the resolution');
check(new RegExp(`^floor ${number} ms \\(\\d+ fps, empty frames\\)$`).test(lines[1]), `the floor of empty frames comes first (${lines[1]})`);
for (const name of [...new Set(SCHEDULE.filter((step) => step.baseline).map((step) => step.name))]) {
  check(lines.some((line) => new RegExp(`^${name} ${number} ms \\(${number}\\) js ${number}\\+${number} \\d+ calls \\d+k tri$`).test(line)), `the ${name} baseline has its milliseconds (median and mean), JS time, calls and triangles`);
}
for (const step of SCHEDULE.filter((candidate) => !candidate.baseline && !candidate.empty)) {
  check(lines.some((line) => new RegExp(`^ ${step.name} ${number} \\(${number}\\) [+−]${number} js ${number}\\+${number}$`).test(line)), `${step.name}: its milliseconds (median and mean), change and JS time`);
}
check(/^targets \d+\.\d MB: solver \d+\.\d wind \d+\.\d scene \d+\.\d splash \d+\.\d sky \d+\.\d floor \d+\.\d$/m.test(readout), 'the render targets\' memory by owner');
check(/^textures \d+, geometries \d+$/m.test(readout), 'renderer.info.memory');
if (problems.length) { console.log('problems:', problems.slice(0, 5).join('\n')); failures++; }
await browser.close(); server.close();
console.log(failures ? `${failures} check(s) failed` : 'the profile report is complete');
process.exit(failures ? 1 : 0);
