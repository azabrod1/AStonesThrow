// Prints a vertical slice of the FLIP grid through the impact: cell types and
// the vertical face velocity, a short time after a stone enters. For checking
// that the stone drives the water the way it should.
//   node tools/flip-grid-probe.mjs [quality] [radius] [speed] [time]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [quality = 'coarse', radius = '0.04', speed = '5', time = '0.01'] = process.argv.slice(2);
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
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('console', (message) => { if (message.type() === 'error') console.log('console:', message.text()); });
await page.goto(`http://localhost:${server.address().port}/flip/?readback=1&harness=1&ui=0&quality=${quality}&densityStrength=0`);
await page.waitForFunction(() => window.__flip !== undefined);
await page.evaluate(() => window.__flip.ready);
const report = await page.evaluate(async ([radius, speed, time]) => {
  window.__flip.throwStone({ radius, speed });
  await window.__flip.advance(time);
  const { velocities, markers, cellCount } = await window.__flip.readGrid();
  const [countX, countY, countZ] = cellCount;
  const sliceZ = Math.floor(countZ / 2);
  const nodeIndex = (x, y, z) => x + y * (countX + 1) + z * (countX + 1) * (countY + 1);
  const cellIndex = (x, y, z) => x + y * countX + z * countX * countY;
  const lines = [];
  const stone = window.__flip.stone;
  lines.push(`stone centre ${stone.position.map((v) => (v / window.__flip.settings.cellSize).toFixed(2)).join(', ')} cells, velocity ${stone.velocity.map((v) => v.toFixed(2)).join(', ')}, t=${window.__flip.stats().simulatedTime.toFixed(4)}`);
  // Cavity size: air cells below the still water level, and fluid cells above it.
  const waterCells = Math.round(0.30 / window.__flip.settings.cellSize);
  let cavityCells = 0;
  let raisedCells = 0;
  for (let z = 0; z < countZ; z++) for (let y = 0; y < countY; y++) for (let x = 0; x < countX; x++) {
    const marker = markers[cellIndex(x, y, z) * 2];
    if (y < waterCells && marker === 0) cavityCells++;
    if (y >= waterCells && marker === 1) raisedCells++;
  }
  lines.push(`${cavityCells} air cells below the still level (cavity), ${raisedCells} fluid cells above it`);
  lines.push('cell types (A air, ~ fluid, # solid) and Vy on the face below each cell, m/s, slice z=' + sliceZ);
  for (let y = countY - 1; y >= Math.max(0, countY - 24); y--) {
    let types = '';
    let speeds = '';
    for (let x = 0; x < countX; x++) {
      const marker = markers[cellIndex(x, y, sliceZ) * 2];
      types += marker === 2 ? '#' : marker === 1 ? '~' : 'A';
      const vy = velocities[nodeIndex(x, y, sliceZ) * 4 + 1];
      speeds += (vy >= 0 ? '+' : '-') + Math.min(99, Math.round(Math.abs(vy) * 10)).toString().padStart(2, '0') + ' ';
    }
    lines.push(`y=${String(y).padStart(2)} ${types}   ${speeds}`);
  }
  return lines;
}, [Number(radius), Number(speed), Number(time)]);
for (const line of report) console.log(line);
await browser.close();
server.close();
