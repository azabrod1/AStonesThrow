// Pressure-solver probe for the FLIP experiment: how the remaining divergence
// falls with iterations and over-relaxation on still water, and the time per
// frame.  node tools/flip-probe.mjs [quality]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const data = await readFile(path.join(root, pathname));
    response.writeHead(200, { 'content-type': mime[path.extname(pathname)] || 'application/octet-stream' });
    response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
const quality = process.argv[2] || 'coarse';
await page.goto(`http://localhost:${server.address().port}/flip/?readback=1&harness=1&ui=0&quality=${quality}`);
await page.waitForFunction(() => window.__flip !== undefined);
await page.evaluate(() => window.__flip.ready);
for (const [iterations, sor] of [[50, 1.4]]) {
  const result = await page.evaluate(async ([iterations, sor]) => {
    window.__flip.rebuild({ pressureIterations: iterations, overRelaxation: sor });
    const started = performance.now();
    await window.__flip.advance(1 / 60);   // still water: residual is the hydrostatic error
    const first = window.__flip.stats().residual;
    await window.__flip.advance(5 / 60);   // warm start builds up
    const later = window.__flip.stats().residual;
    return { first, later, ms: (performance.now() - started) / 6, substeps: window.__flip.stats().substeps };
  }, [iterations, sor]);
  console.log(`iterations=${iterations} sor=${sor}: residual first frame ${result.first.toExponential(2)} /s, after 6 frames ${result.later.toExponential(2)} /s, ${result.ms.toFixed(0)} ms per frame (${result.substeps} substeps)`);
}
// Still water for a second under different settings: the surface should stay
// flat and the water nearly still, so the max particle speed shows what stirs it.
const variants = [
  ['baseline', {}],
  ['no density correction', { densityStrength: 0 }],
  ['100 iterations', { pressureIterations: 100 }],
];
for (const [name, options] of variants) {
  const report = await page.evaluate(async (options) => {
    window.__flip.rebuild({ pressureIterations: 50, overRelaxation: 1.4, densityStrength: 0.3, picBlendPerFrame: 0.03, gravity: 9.81, ...options });
    const lines = [];
    for (let frame = 0; frame < 60; frame++) {
      await window.__flip.advance(1 / 60);
      if (frame % 10 === 9) {
        const stats = window.__flip.stats();
        lines.push(`t=${stats.simulatedTime.toFixed(2)} max ${stats.maxSpeed.toFixed(3)} mean ${stats.meanSpeed.toFixed(4)} m/s`);
      }
    }
    // Where are the fast particles? Report speed by layer of cells and the five fastest.
    const { positions, velocities } = await window.__flip.readParticles();
    const cellSize = window.__flip.settings.cellSize;
    const layers = new Map();
    const fastest = [];
    for (let index = 0; index < positions.length / 4; index++) {
      const speed = Math.hypot(velocities[index * 4], velocities[index * 4 + 1], velocities[index * 4 + 2]);
      const layer = Math.floor(positions[index * 4 + 1] / cellSize);
      const entry = layers.get(layer) ?? { count: 0, sum: 0, max: 0 };
      entry.count++; entry.sum += speed; entry.max = Math.max(entry.max, speed);
      layers.set(layer, entry);
      if (speed > 0.3) fastest.push({ speed: speed.toFixed(2), x: (positions[index * 4] / cellSize).toFixed(2), y: (positions[index * 4 + 1] / cellSize).toFixed(2), z: (positions[index * 4 + 2] / cellSize).toFixed(2), vx: velocities[index * 4].toFixed(2), vy: velocities[index * 4 + 1].toFixed(2), vz: velocities[index * 4 + 2].toFixed(2) });
    }
    fastest.sort((a, b) => b.speed - a.speed);
    const layerLines = [...layers.entries()].sort((a, b) => a[0] - b[0]).map(([layer, entry]) => `${layer}: n=${entry.count} mean=${(entry.sum / entry.count).toFixed(3)} max=${entry.max.toFixed(2)}`);
    return { lines, layerLines, fastCount: fastest.length, fastest: fastest.slice(0, 6) };
  }, options);
  console.log(`rest test, ${name}:`);
  for (const line of report.lines) console.log('  ' + line);
  console.log('  by cell layer (y): ' + report.layerLines.join(' | '));
  console.log(`  ${report.fastCount} particles above 0.3 m/s; fastest: ${JSON.stringify(report.fastest)}`);
}
await browser.close(); server.close();
