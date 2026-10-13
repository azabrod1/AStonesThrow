// Headless frames of the FLIP experiment (flip/index.html).
//
// WebGPU cannot present to a canvas in the cloud container, so the page is
// opened in readback mode: it renders into a texture, reads the pixels back
// and paints them on a 2D canvas, which a normal screenshot captures. The
// simulation runs on SwiftShader, so a frame can take seconds and timings mean
// nothing; the pictures are what this is for.
//
//   node tools/flip-shoot.mjs --label=first --quality=coarse --radius=0.02 --speed=4 --times=0.02,0.05,0.1,0.2,0.4
//
// --times: seconds after impact to capture. --quality: coarse|medium|fine|finest.
// --radius (m), --speed (m/s), --angle (degrees), --iterations, --cfl, --sor,
// --density pass straight to the page; --ui=1 keeps the overlay.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const label = arg('label', 'flip');
const outDir = path.join(root, 'shots', label);
const width = Number(arg('w', 1280));
const height = Number(arg('h', 720));
const times = arg('times', '0.02,0.05,0.1,0.2,0.4').split(',').map(Number);
const keepUi = arg('ui', '0') === '1';
const pageParams = new URLSearchParams({ readback: '1', harness: '1', ui: keepUi ? '1' : '0', quality: arg('quality', 'coarse') });
for (const [flag, key] of [['debug', 'debug'], ['view', 'view'], ['slice', 'slice'], ['iterations', 'pressureIterations'], ['cfl', 'cfl'], ['sor', 'overRelaxation'], ['density', 'densityStrength'], ['seed', 'seed']]) {
  const value = arg(flag, '');
  if (value !== '') pageParams.set(key, value);
}
const throwOptions = { radius: Number(arg('radius', 0.02)), speed: Number(arg('speed', 4)), angleDegrees: Number(arg('angle', 0)) };

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.join(root, pathname);
    if (!file.startsWith(root)) throw new Error('outside root');
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
await mkdir(outDir, { recursive: true });

const containerChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROMIUM || (existsSync(containerChromium) ? containerChromium : undefined),
  args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height } });
const problems = [];
page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) problems.push(message.text()); });
page.on('pageerror', (error) => problems.push(String(error)));

const started = Date.now();
await page.goto(`http://localhost:${port}/flip/?${pageParams}`);
await page.waitForFunction(() => window.__flip !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.__flip.ready);
const initial = await page.evaluate(() => window.__flip.stats());
console.log(`[flip] ${initial.particles} particles, ${initial.cells} cells, page up after ${((Date.now() - started) / 1000).toFixed(1)} s`);

const shoot = async (name) => {
  const stats = await page.evaluate(async () => { await window.__flip.capture(); return window.__flip.stats(); });
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`[flip] ${name}.png  t=${stats.simulatedTime.toFixed(3)} substeps=${stats.substeps} maxSpeed=${stats.maxSpeed.toFixed(2)} aboveSurface=${Math.round(stats.aboveSurface)} residual=${stats.residual.toExponential(2)}`);
};

await shoot('idle');
await page.evaluate((options) => window.__flip.throwStone(options), throwOptions);
let simulated = 0;
for (const time of times) {
  const frameStart = Date.now();
  await page.evaluate((seconds) => window.__flip.advance(seconds), time - simulated);
  simulated = time;
  console.log(`[flip] advanced to ${time.toFixed(3)} s in ${((Date.now() - frameStart) / 1000).toFixed(1)} s wall`);
  await shoot(`t${time.toFixed(3).replace('.', '_')}`);
}

if (problems.length) {
  console.log('[flip] console problems:');
  for (const problem of problems.slice(0, 20)) console.log(problem);
}
await browser.close();
server.close();
