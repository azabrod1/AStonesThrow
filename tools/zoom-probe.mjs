// Browser probe of the zoom (src/main.js, src/viewZoom.js) through the page's
// real event handlers, without drawing frames.
//
// Loads the page headless like tools/shoot.mjs, then: turns the mouse wheel
// over several points and checks that the water point under the pointer stays
// there (in pixels) and the field of view follows 0.9 per notch; zooms back
// out and checks the view returns home; pinches with two synthetic touch
// pointers (spreading and moving) and checks the field of view, that the
// point under the fingers' midpoint follows it and that no stone is thrown;
// taps while zoomed and checks a stone is thrown at the point under the tap;
// presses Escape and checks the view is home again. Prints one line per check
// and exits with status 1 if any fails.
//
//   node tools/zoom-probe.mjs [--w=1280 --h=720]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => { const hit = process.argv.find((candidate) => candidate.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const width = Number(argument('w', 1280));
const height = Number(argument('h', 720));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript' };
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
const context = await browser.newContext({ viewport: { width, height } });
await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
  const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
  try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
});
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(String(error)));
await page.goto(`http://localhost:${server.address().port}/index.html?quality=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__pond, { timeout: 60000 });
await page.evaluate(() => window.__pond.pause());

// In-page helpers: the water point under a client point, and where a world point is on screen.
await page.evaluate(() => {
  const { THREE, camera } = window.__pond;
  const canvas = document.getElementById('pond');
  window.__probe = {
    waterUnder(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? [hit.x, hit.y, hit.z] : null;
    },
    onScreen([x, y, z]) {
      camera.updateMatrixWorld();
      const rect = canvas.getBoundingClientRect();
      const projected = new THREE.Vector3(x, y, z).project(camera);
      return [rect.left + (projected.x + 1) / 2 * rect.width, rect.top + (1 - projected.y) / 2 * rect.height];
    },
    pointer(type, id, clientX, clientY) {
      canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX, clientY, bubbles: true, cancelable: true }));
    },
  };
});

let failures = 0;
const check = (passed, message) => { if (!passed) failures++; console.log(`${passed ? 'ok  ' : 'FAIL'} ${message}`); };
const fov = () => page.evaluate(() => window.__pond.camera.fov);
const homeFov = await fov();

// Wheel in at several points, then back out.
// Whole pixels (wheel events carry them), above the control strip, which takes the wheel itself.
for (const [fractionX, fractionY] of [[0.5, 0.6], [0.15, 0.7], [0.85, 0.45], [0.3, 0.35]]) {
  const clientX = Math.round(width * fractionX), clientY = Math.round(height * fractionY);
  const water = await page.evaluate(([x, y]) => window.__probe.waterUnder(x, y), [clientX, clientY]);
  await page.mouse.move(clientX, clientY);
  for (let notch = 0; notch < 6; notch++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(50);
  const zoomed = await fov();
  const [screenX, screenY] = await page.evaluate((point) => window.__probe.onScreen(point), water);
  const drift = Math.hypot(screenX - clientX, screenY - clientY);
  check(Math.abs(zoomed - homeFov * 0.9 ** 6) < 1e-6 && drift < 0.5, `wheel in 6 notches at (${clientX.toFixed(0)}, ${clientY.toFixed(0)}): fov ${homeFov.toFixed(1)} -> ${zoomed.toFixed(2)}, the water point under the pointer moved ${drift.toFixed(3)} px`);
  for (let notch = 0; notch < 8; notch++) await page.mouse.wheel(0, 100);
  await page.waitForTimeout(50);
  const back = await page.evaluate(() => ({ fov: window.__pond.camera.fov, zoomed: window.__pond.zoomed }));
  check(Math.abs(back.fov - homeFov) < 1e-6 && !back.zoomed, `wheel out 8 notches: fov ${back.fov.toFixed(2)}, home again: ${!back.zoomed}`);
}

// Zoom to the minimum.
await page.mouse.move(width / 2, height / 2);
for (let notch = 0; notch < 40; notch++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(50);
check(Math.abs((await fov()) - 8) < 1e-6, `wheel in 40 notches stops at ${(await fov()).toFixed(2)} degrees`);
await page.keyboard.press('Escape');
check(!(await page.evaluate(() => window.__pond.zoomed)) && Math.abs((await fov()) - homeFov) < 1e-6, `Escape returns home: fov ${(await fov()).toFixed(2)}`);

// Pinch: fingers 120 px apart spread to 300 px while their midpoint moves 40 px right.
const rocksBefore = await page.evaluate(() => window.__pond.rocks.length);
const middleX = width * 0.45, middleY = height * 0.62;
const anchor = await page.evaluate(([x, y]) => window.__probe.waterUnder(x, y), [middleX, middleY]);
await page.evaluate(([x, y]) => { window.__probe.pointer('pointerdown', 1, x - 60, y); window.__probe.pointer('pointerdown', 2, x + 60, y); }, [middleX, middleY]);
for (let step = 1; step <= 10; step++) {
  const spread = 60 + 9 * step, shift = 4 * step;
  await page.evaluate(([x, y, spread, shift]) => { window.__probe.pointer('pointermove', 1, x + shift - spread, y); window.__probe.pointer('pointermove', 2, x + shift + spread, y); }, [middleX, middleY, spread, shift]);
}
const pinched = await fov();
const [pinchX, pinchY] = await page.evaluate((point) => window.__probe.onScreen(point), anchor);
const pinchDrift = Math.hypot(pinchX - (middleX + 40), pinchY - middleY);
// One finger lifts first, then the other: neither may throw.
await page.evaluate(([x, y]) => { window.__probe.pointer('pointerup', 2, x + 190, y); window.__probe.pointer('pointerup', 1, x - 110, y); }, [middleX, middleY]);
const rocksAfterPinch = await page.evaluate(() => window.__pond.rocks.length);
check(Math.abs(pinched - homeFov * 120 / 300) < 1e-6 && pinchDrift < 0.5, `pinch 120 -> 300 px: fov ${homeFov.toFixed(1)} -> ${pinched.toFixed(2)}, the point under the fingers moved ${pinchDrift.toFixed(3)} px from their midpoint`);
check(rocksAfterPinch === rocksBefore, `the pinch threw ${rocksAfterPinch - rocksBefore} stones`);

// A tap while zoomed throws at the water under it.
const tapX = width * 0.55, tapY = height * 0.5;
const tapWater = await page.evaluate(([x, y]) => window.__probe.waterUnder(x, y), [tapX, tapY]);
await page.evaluate(([x, y]) => { window.__probe.pointer('pointerdown', 1, x, y); window.__probe.pointer('pointerup', 1, x + 3, y); }, [tapX, tapY]);
const landing = await page.evaluate(() => {
  const rock = window.__pond.rocks.at(-1);
  // Fly the stone's arc to the water (it has drag, so allow a few centimetres).
  const position = rock.position.clone(), velocity = rock.velocity.clone();
  for (let step = 0; step < 2000 && position.y > 0; step++) { velocity.y -= 9.81 / 1000; position.addScaledVector(velocity, 1 / 1000); }
  return [position.x, position.z, window.__pond.rocks.length];
});
const miss = Math.hypot(landing[0] - tapWater[0], landing[1] - tapWater[2]);
check(landing[2] === rocksAfterPinch + 1 && miss < 0.1, `a tap while zoomed threw a stone, landing ${(miss * 100).toFixed(1)} cm from the water under the tap`);

// The Reset view button follows the zoom.
const buttonHidden = () => page.evaluate(() => document.getElementById('reset-view').hidden);
const hiddenZoomed = await buttonHidden();
await page.evaluate(() => window.__pond.resetView());
const hiddenHome = await buttonHidden();
check(!hiddenZoomed && hiddenHome, `Reset view button shown while zoomed: ${!hiddenZoomed}, hidden at home: ${hiddenHome}`);

if (problems.length) { console.log('page errors:'); console.log(problems.join('\n')); failures++; }
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
