// Shoots one kind's bird model alone (tools/bird-viewer.html): its wingbeat's
// phases down the rows, seen side on, from below, from in front and below,
// and from above across them, into shots/birds/<kind>[-label].png.
//
//   node tools/bird-look.mjs fishEagle [--beat=1] [--rows=4] [--distance=3] [--label=name]
//   node tools/bird-look.mjs cardinal --sides='6,0.2,0;4,0.5,4' --fold=1   (eye directions of its own; wings folded, a bound)
//   node tools/bird-look.mjs heron --poses=standing   (a standing kind's ways down the rows: tools/bird-viewer.html)
//   node tools/bird-look.mjs heron --poses=standing --distance=1 --focus=0.3,1.0,0 --look=0.8   (its neck close up, head turned)
//
// The page's console errors are printed. The Three.js modules are served from
// node_modules (as tools/shoot.mjs serves them), the rest from the repository.
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, patience } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => (process.argv.find((value) => value.startsWith(`--${name}=`)) ?? `=${fallback}`).split('=')[1];
const kind = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'fishEagle';
const beat = argument('beat', '1'), rows = argument('rows', '4'), label = argument('label', ''), distance = argument('distance', '3'), poses = argument('poses', ''), sides = argument('sides', ''), fold = argument('fold', ''), focus = argument('focus', ''), look = argument('look', '');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const file = path.join(root, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(root)) throw new Error('outside');
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, resolve));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: poses === 'standing' ? 2400 : 960 } });
await page.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
  const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
  try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
});
page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') console.log('[page]', message.text()); });
page.on('pageerror', (error) => console.log('[page error]', String(error)));
await page.goto(`http://localhost:${server.address().port}/tools/bird-viewer.html?kind=${kind}&beat=${beat}&rows=${rows}&distance=${distance}${poses ? `&poses=${poses}` : ''}${sides ? `&sides=${encodeURIComponent(sides)}` : ''}${fold ? `&fold=${fold}` : ''}${focus ? `&focus=${focus}` : ''}${look ? `&look=${look}` : ''}`);
await page.waitForFunction(() => window.ready, null, { timeout: patience(60000) });
await page.evaluate(() => window.ready);
const folder = path.join(root, 'shots', 'birds');
await mkdir(folder, { recursive: true });
const file = path.join(folder, `${kind}${label ? `-${label}` : ''}.png`);
await page.locator('#view').screenshot({ path: file });
console.log(file);
await browser.close();
server.close();
