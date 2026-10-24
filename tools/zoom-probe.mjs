// Browser probe of the zoom and the orbit (src/main.js, src/viewZoom.js,
// src/viewOrbit.js) through the page's real event handlers, without drawing
// frames (a glide is brought to its end with __pond.settleView()).
//
// Loads the page headless like tools/shoot.mjs, then: turns the mouse wheel
// over several points and checks that the water point under the pointer stays
// there (in pixels) and the field of view follows 0.9 per notch; zooms back
// out and checks the view returns home; pinches with two synthetic touch
// pointers (spreading and moving) and checks the field of view, that the
// point under the fingers' midpoint follows it and that no stone is thrown;
// taps while zoomed and checks a stone is thrown at the point under the tap;
// presses Escape and checks the view is home again. Then the orbit: a
// one-finger drag turns the eye about the pivot (the pivot staying at the
// view's centre, the distance kept, the turn ORBIT_TURN per canvas height)
// and throws nothing, nor does a mouse drag, while a mouse click does; a drag
// up stops with the eye just above the water; a drag that starts zoomed
// keeps what the view's centre shows there; under the water a drag keeps the
// eye between the surface and the bed; the View setting's choices and Reset
// view glide to their orbits, and the page's View row and Reset view button
// follow. Then a press held still dips a finger into the water under it,
// a drag then moves the finger and not the view, and letting go lifts it
// without throwing; a mouse held does the same. Last, the pool
// (src/pool.js): its views stand where they should (on the deck, over its
// water, under it inside its walls), a drag under its water keeps the eye
// UNDER_GAP inside its walls as well as clear of its floor and surface (and
// out again as far as before once turned back from a wall), a
// glide into its water and out goes over the water and never through the
// deck, and a tap on the deck throws inside the walls. Prints one line per
// check and exits with status 1 if any fails.
//
//   node tools/zoom-probe.mjs [--w=1280 --h=720]
import { launchBrowser } from './browser.mjs';
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
// The GPU if there is one, else SwiftShader (tools/browser.mjs).
const browser = await launchBrowser();
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
await page.evaluate(() => window.__pond.settleView());
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
await page.evaluate(() => { window.__pond.resetView(); window.__pond.settleView(); });
const hiddenHome = await buttonHidden();
check(!hiddenZoomed && hiddenHome, `Reset view button shown while zoomed: ${!hiddenZoomed}, hidden at home: ${hiddenHome}`);

// ---- the orbit ----
const orbit = () => page.evaluate(() => window.__pond.orbit);
const rockCount = () => page.evaluate(() => window.__pond.rocks.length);
const pivotOffCentre = () => page.evaluate(() => {
  const { orbit: { pivot } } = window.__pond;
  const [x, y] = window.__probe.onScreen(pivot);
  const rect = document.getElementById('pond').getBoundingClientRect();
  return Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
});
const drag = async (fromX, fromY, toX, toY, steps = 8) => {
  await page.evaluate(([x, y]) => window.__probe.pointer('pointerdown', 1, x, y), [fromX, fromY]);
  for (let step = 1; step <= steps; step++) {
    await page.evaluate(([x, y]) => window.__probe.pointer('pointermove', 1, x, y), [fromX + (toX - fromX) * step / steps, fromY + (toY - fromY) * step / steps]);
  }
  await page.evaluate(([x, y]) => window.__probe.pointer('pointerup', 1, x, y), [toX, toY]);
};
const turnPerPixel = 180 / height;   // ORBIT_TURN (π) per canvas height, in degrees

const shore = await orbit();
let before = await rockCount();
await drag(width * 0.4, height * 0.55, width * 0.4 + 200, height * 0.55);
let turned = await orbit();
check(Math.abs(turned.azimuth - (shore.azimuth - 200 * turnPerPixel)) < 1e-6 && Math.abs(turned.elevation - shore.elevation) < 1e-6,
  `a drag 200 px right walks the eye ${(shore.azimuth - turned.azimuth).toFixed(2)}° left about the pivot (${(200 * turnPerPixel).toFixed(2)}° expected), its height kept`);
check(Math.abs(turned.distance - shore.distance) < 1e-9 && turned.pivot.every((value, index) => Math.abs(value - shore.pivot[index]) < 1e-9) && (await pivotOffCentre()) < 0.5,
  `the drag keeps the pivot (${turned.pivot.map((value) => value.toFixed(2)).join(', ')}) at the view's centre and the eye ${turned.distance.toFixed(3)} m from it`);
check((await rockCount()) === before, `the drag threw ${(await rockCount()) - before} rocks`);
check(!(await buttonHidden()) && (await page.evaluate(() => window.__pond.viewName)) === null, 'turned: Reset view shown, no View choice named');
await drag(width * 0.5, height * 0.4, width * 0.5, height * 0.4 + 60);
const raised = await orbit();
check(Math.abs(raised.elevation - (turned.elevation + 60 * turnPerPixel)) < 1e-6, `a drag 60 px down raises the eye ${(raised.elevation - turned.elevation).toFixed(2)}° (${(60 * turnPerPixel).toFixed(2)}° expected)`);
await drag(width * 0.5, height * 0.7, width * 0.5, height * 0.05, 12);
const lowest = await page.evaluate(() => window.__pond.camera.position.y);
check(Math.abs(lowest - 0.1) < 1e-6, `a long drag up stops with the eye ${(lowest * 100).toFixed(1)} cm above the water (10 cm the least)`);

// A mouse drag turns and throws nothing; a click throws.
before = await rockCount();
const elevationBefore = (await orbit()).elevation;
await page.mouse.move(width * 0.5, height * 0.5);
await page.mouse.down();
await page.mouse.move(width * 0.5, height * 0.5 + 40, { steps: 4 });
await page.mouse.up();
check((await rockCount()) === before && (await orbit()).elevation > elevationBefore + 1, `a mouse drag 40 px down raised the eye ${((await orbit()).elevation - elevationBefore).toFixed(2)}° and threw ${(await rockCount()) - before} rocks`);
await page.mouse.click(width * 0.5, height * 0.6);
check((await rockCount()) === before + 1, 'a mouse click threw a rock');

// A drag that starts zoomed turns round what the view looks at: at its first step, the centre still shows the same point.
await page.evaluate(() => { window.__pond.resetView(); window.__pond.settleView(); });
await page.mouse.move(width * 0.7, height * 0.55);
for (let notch = 0; notch < 8; notch++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(50);
const centreWater = await page.evaluate(([x, y]) => window.__probe.waterUnder(x, y), [width / 2, height / 2]);
await page.evaluate(([x, y]) => { window.__probe.pointer('pointerdown', 1, x, y); window.__probe.pointer('pointermove', 1, x + 14, y); }, [width * 0.5, height * 0.5]);
const repivoted = await page.evaluate(() => window.__pond.orbit);
const [centreX, centreY] = await page.evaluate((point) => window.__probe.onScreen(point), centreWater);
const pivotGap = Math.hypot(repivoted.pivot[0] - centreWater[0], repivoted.pivot[1] - centreWater[1], repivoted.pivot[2] - centreWater[2]);
check(pivotGap < 1e-6, `a drag that starts zoomed moves the pivot onto the water at the view's centre (${(pivotGap * 1000).toFixed(3)} mm off)`);
await page.evaluate(([x, y]) => { window.__probe.pointer('pointermove', 1, x + 120, y); window.__probe.pointer('pointerup', 1, x + 120, y); }, [width * 0.5, height * 0.5]);
const [afterX, afterY] = await page.evaluate((point) => window.__probe.onScreen(point), centreWater);
check(Math.hypot(afterX - width / 2, afterY - height / 2) < 0.5 && (await page.evaluate(() => window.__pond.zoomed)),
  `and turns round it, still zoomed: that point ${Math.hypot(afterX - width / 2, afterY - height / 2).toFixed(3)} px from the centre after the turn (${Math.hypot(centreX - width / 2, centreY - height / 2).toFixed(3)} px at its first step)`);

// Under the water a drag keeps the eye under it: clear of the surface and of the bed.
await page.evaluate(() => { window.__pond.showView('under'); window.__pond.settleView(); });
await drag(width * 0.5, height * 0.2, width * 0.5, height * 0.95, 12);
const underTop = await page.evaluate(() => window.__pond.camera.position.y);
await drag(width * 0.5, height * 0.95, width * 0.5, height * 0.05, 12);
const underBottom = await page.evaluate(() => { const { x, y, z } = window.__pond.camera.position; return { y, bed: -window.__pond.water.floorDepthAt(x, z) }; });
check(Math.abs(underTop + 0.15) < 1e-6 && Math.abs(underBottom.y - (underBottom.bed + 0.15)) < 2e-3,
  `under the water a drag down stops the eye ${(-underTop * 100).toFixed(1)} cm under the surface, a drag up ${((underBottom.y - underBottom.bed) * 100).toFixed(1)} cm over the bed (15 cm each)`);

// The View setting's choices glide to their orbits, and the page follows.
for (const name of ['high', 'level', 'under', 'shore']) {
  await page.evaluate((view) => { window.__pond.showView(view); window.__pond.settleView(); }, name);
  const state = await page.evaluate(() => ({ name: window.__pond.viewName, zoomed: window.__pond.zoomed, row: document.querySelector('.menu-tier[data-open="view"] .menu-tier-value').textContent, checked: document.querySelector('#view [aria-checked="true"]')?.dataset.value }));
  const eyeHeight = await page.evaluate(() => window.__pond.camera.position.y);
  check(state.name === name && !state.zoomed && state.checked === name && (await pivotOffCentre()) < 0.5 && (name === 'under') === (eyeHeight < 0),
    `View ${name}: the eye at ${eyeHeight.toFixed(2)} m, unzoomed, facing the pivot; the View row reads ${state.row}`);
}
check(await buttonHidden(), 'back at the shore view: Reset view hidden');

// Press and hold: a finger in the water (src/touch.js).
before = await rockCount();
const orbitBeforeTouch = await orbit();
const holdX = width * 0.5, holdY = height * 0.62;
const heldWater = await page.evaluate(([x, y]) => window.__probe.waterUnder(x, y), [holdX, holdY]);
await page.evaluate(([x, y]) => window.__probe.pointer('pointerdown', 1, x, y), [holdX, holdY]);
await page.waitForTimeout(450);
const dipped = await page.evaluate(() => ({ touching: window.__pond.touching, finger: window.__pond.fingerPosition }));
check(dipped.touching && Math.hypot(dipped.finger.x - heldWater[0], dipped.finger.z - heldWater[2]) < 1e-6,
  `a press held 0.45 s dips a finger in the water under it (${dipped.finger ? `${dipped.finger.x.toFixed(2)}, ${dipped.finger.z.toFixed(2)}` : 'none'})`);
for (let step = 1; step <= 8; step++) await page.evaluate(([x, y]) => window.__probe.pointer('pointermove', 1, x, y), [holdX + 20 * step, holdY]);
await page.evaluate(() => window.__pond.advance(1 / 60));
const draggedTo = await page.evaluate(([x, y]) => window.__probe.waterUnder(x, y), [holdX + 160, holdY]);
const fingerAfter = await page.evaluate(() => window.__pond.fingerPosition);
const orbitAfterTouch = await orbit();
check(Math.hypot(fingerAfter.x - draggedTo[0], fingerAfter.z - draggedTo[2]) < 1e-6 && Math.abs(orbitAfterTouch.azimuth - orbitBeforeTouch.azimuth) < 1e-9,
  'dragging moves the finger to the water under the pointer and leaves the view where it was');
await page.evaluate(([x, y]) => window.__probe.pointer('pointerup', 1, x, y), [holdX + 160, holdY]);
check(!(await page.evaluate(() => window.__pond.touching)) && (await rockCount()) === before, `letting go lifts the finger out and throws ${(await rockCount()) - before} rocks`);
await page.mouse.move(width * 0.4, height * 0.6);
await page.mouse.down();
await page.waitForTimeout(450);
const mouseTouching = await page.evaluate(() => window.__pond.touching);
await page.mouse.up();
check(mouseTouching && !(await page.evaluate(() => window.__pond.touching)) && (await rockCount()) === before, 'a mouse held still dips the finger too, and lifts it on release without throwing');

// The pool.
await page.evaluate(async () => { await window.__pond.setSky('pool'); window.__pond.resetView(); window.__pond.settleView(); });
const square = await page.evaluate(() => window.__pond.water.poolSquare);
const insideBy = ({ x, z }) => Math.min(x - square.minX, square.minX + square.size - x, z - square.minZ, square.minZ + square.size - z);
const deck = 0.1;   // POOL.deck (src/pool.js)
for (const name of ['shore', 'high', 'level', 'under']) {
  await page.evaluate((view) => { window.__pond.showView(view); window.__pond.settleView(); }, name);
  const eye = await page.evaluate(() => ({ ...window.__pond.camera.position }));
  const state = await page.evaluate(() => ({ name: window.__pond.viewName, zoomed: window.__pond.zoomed }));
  const placed = name === 'under' ? eye.y < -0.15 + 1e-6 && insideBy(eye) >= 0.15 - 1e-6
    : name === 'level' ? insideBy(eye) > 0 && Math.abs(eye.y - 0.16) < 1e-6
      : eye.y > deck + 0.1;
  check(state.name === name && !state.zoomed && placed && (await pivotOffCentre()) < 0.5,
    `in the pool, View ${name}: the eye at (${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)}), ${name === 'under' ? `${(insideBy(eye) * 100).toFixed(0)} cm inside the walls` : name === 'level' ? 'over the water inside the walls' : 'over the deck'}`);
}
await page.evaluate(() => { window.__pond.showView('under'); window.__pond.settleView(); });
// Each drag's every step: the eye swings round the pivot, toward each wall in turn.
let nearestWall = Infinity, highestEye = -Infinity, lowestEye = Infinity, samples = 0;
for (const [fromX, fromY, toX, toY] of [[0.1, 0.5, 0.95, 0.5], [0.95, 0.5, 0.05, 0.6], [0.5, 0.1, 0.5, 0.95], [0.2, 0.9, 0.8, 0.1], [0.9, 0.3, 0.1, 0.4], [0.5, 0.95, 0.5, 0.05]]) {
  await page.evaluate(([x, y]) => window.__probe.pointer('pointerdown', 1, x, y), [width * fromX, height * fromY]);
  for (let step = 1; step <= 24; step++) {
    const eye = await page.evaluate(([x, y]) => { window.__probe.pointer('pointermove', 1, x, y); return { ...window.__pond.camera.position }; }, [width * (fromX + (toX - fromX) * step / 24), height * (fromY + (toY - fromY) * step / 24)]);
    nearestWall = Math.min(nearestWall, insideBy(eye));
    highestEye = Math.max(highestEye, eye.y);
    lowestEye = Math.min(lowestEye, eye.y);
    samples++;
  }
  await page.evaluate(([x, y]) => window.__probe.pointer('pointerup', 1, x, y), [width * toX, height * toY]);
}
check(Math.abs(nearestWall - 0.15) < 1e-6 && highestEye <= -0.15 + 1e-6 && lowestEye >= -1.4 + 0.15 - 2e-3,
  `under the pool's water six long drags (${samples} steps) keep the eye ${(nearestWall * 100).toFixed(1)} cm inside its walls at the least, ${(-highestEye * 100).toFixed(1)} cm under the surface and ${((lowestEye + 1.4) * 100).toFixed(1)} cm over the floor (15 cm each)`);
// Swung toward a side wall the eye comes in nearer the pivot; swung back, out again as far as it was.
await page.evaluate(() => { window.__pond.showView('under'); window.__pond.settleView(); });
const underDistance = (await orbit()).distance;
await drag(width * 0.5, height * 0.5, width * 0.5 + height * 0.45, height * 0.5, 12);
const swung = await orbit();
await drag(width * 0.5 + height * 0.45, height * 0.5, width * 0.5, height * 0.5, 12);
const swungBack = await orbit();
check(swung.distance < underDistance - 0.01 && Math.abs(swungBack.distance - underDistance) < 1e-9,
  `turned 81° toward a side wall the eye comes in from ${underDistance.toFixed(2)} m to ${swung.distance.toFixed(2)} m from the pivot, and turned back stands ${swungBack.distance.toFixed(2)} m out again`);
for (const [from, to] of [['shore', 'under'], ['under', 'shore'], ['high', 'under'], ['under', 'high']]) {
  await page.evaluate((view) => { window.__pond.showView(view, { glide: false }); }, from);
  const path = await page.evaluate((view) => window.__pond.glidePath(view, 200), to);
  const throughDeck = path.filter((eye) => eye.y < deck + 0.1 - 1e-9 && insideBy(eye) < -1e-9);
  check(throughDeck.length === 0, `in the pool a glide from ${from} to ${to} goes over the water: ${throughDeck.length} of ${path.length} steps below the deck's top outside the walls`);
}
await page.evaluate(() => { window.__pond.showView('shore', { glide: false }); });
before = await rockCount();
const deckX = width * 0.5, deckY = height * 0.08;
await page.evaluate(([x, y]) => { window.__probe.pointer('pointerdown', 1, x, y); window.__probe.pointer('pointerup', 1, x, y); }, [deckX, deckY]);
const deckThrow = await page.evaluate(() => {
  const rock = window.__pond.rocks.at(-1);
  const position = rock.position.clone(), velocity = rock.velocity.clone();
  for (let step = 0; step < 2000 && position.y > 0; step++) { velocity.y -= 9.81 / 1000; position.addScaledVector(velocity, 1 / 1000); }
  return { x: position.x, z: position.z, count: window.__pond.rocks.length };
});
check(deckThrow.count === before + 1 && insideBy(deckThrow) > 0.2, `a tap on the deck beyond the pool throws inside its walls, landing ${(insideBy(deckThrow) * 100).toFixed(0)} cm in from the nearest`);
await page.evaluate(async () => await window.__pond.setSky('lakeside'));

if (problems.length) { console.log('page errors:'); console.log(problems.join('\n')); failures++; }
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
