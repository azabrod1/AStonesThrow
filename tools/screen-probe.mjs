// Browser probe of the pond out to the screen's edges and of full screen
// (src/screen.js).
//
// No desktop browser has an iPhone's status bar, nor Safari's way of
// colouring it, so what shows under the clock can only be seen on a phone.
// This checks what a browser can: the page as Safari 26 on an iPhone lays it
// out (its user agent, a 393 × 852 screen whose status bar and address bar
// leave a 393 × 747 viewport, touch, 3× pixels):
//   - the canvas lies in the page 64 CSS pixels taller than the viewport
//     (html.bleed), the page scrolled to its foot: its top 64 pixels above
//     the viewport's (under the clock), its foot at the viewport's;
//   - the pond measured the canvas as it lies (its camera's aspect, its
//     drawing buffer's), and a tap on the water throws at the water under
//     the finger;
//   - the strip and the settings button stay where they were, fixed;
//   - whatever scrolls the page (a tap on the status bar scrolls to the top)
//     is undone within a few frames, and the loading veil is out of the page;
//   - turned on its side the canvas is fixed again, the page unscrolled, and
//     upright it lies under the clock again;
//   - Full screen (the settings' page, which this browser has the API for)
//     puts the page in full screen, the canvas fixed over the whole screen,
//     the row saying On; Off brings it back under the clock;
// then the same phone without the Fullscreen API, as Safari on an iPhone has
// none for a page: the Full screen page hides On and Off and names the Home
// Screen's way, the row saying so, whole; the phone opened from the Home Screen
// (navigator.standalone): the canvas fixed, no bleed, the page saying it has
// the whole screen; Chrome on the same iPhone (CriOS, which draws bars of its
// own): no bleed; a phone with a home button (375 × 667): a bleed of 24; and
// a desktop window: no bleed, F going in and out of full screen, and
// ?bleed=40 laying the canvas 40 pixels under the top there too.
// It saves each framing's screen to shots/screen-probe/ and exits with
// status 1 if a check fails.
//
//   node tools/screen-probe.mjs
import { launchBrowser, patience } from './browser.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputFolder = path.join(repository, 'shots', 'screen-probe');
const SAFARI_26_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const CHROME_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1';
const IPHONE = { viewport: { width: 393, height: 747 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI_26_IPHONE };
const IPHONE_ON_ITS_SIDE = { width: 852, height: 342 };
const HOME_BUTTON_IPHONE = { ...IPHONE, viewport: { width: 375, height: 603 }, screen: { width: 375, height: 667 }, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1280, height: 720 } };
const ISLAND_BLEED = 64, HOME_BUTTON_BLEED = 24, ASKED_BLEED = 40;   // CSS px (src/screen.js BLEED)

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const file = path.join(repository, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
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
await mkdir(outputFolder, { recursive: true });

let failures = 0;
const check = (passed, message) => { if (!passed) failures++; console.log(`${passed ? '  ok  ' : '  FAIL'} ${message}`); };
const near = (value, wanted, tolerance = 0.5) => Math.abs(value - wanted) <= tolerance;

/** A page of the pond in a context made from `options`, `before` run in it ahead of the page's own scripts; resolves once the pond is up. */
async function openPond(options, query = '', before = null) {
  const context = await browser.newContext(options);
  await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
    const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
    try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(repository, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (before) await context.addInitScript(before);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  await page.goto(`http://localhost:${server.address().port}/index.html?quality=low&paused=1${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__pond, undefined, { timeout: patience(180000) });
  await page.evaluate(() => window.__pond.advance(0.05));
  await page.waitForFunction(() => document.getElementById('veil').hidden, undefined, { timeout: patience(10000) }).catch(() => {});
  return { context, page, problems };
}

/** Where the canvas lies and what the pond made of it. */
const layout = (page) => page.evaluate(() => {
  const canvas = document.getElementById('pond');
  const box = canvas.getBoundingClientRect();
  const camera = window.__pond.camera;
  return {
    bleeding: document.documentElement.classList.contains('bleed'),
    bleed: getComputedStyle(document.documentElement).getPropertyValue('--bleed').trim(),
    position: getComputedStyle(canvas).position,
    top: box.top, bottom: box.bottom, height: box.height, width: box.width,
    innerHeight: window.innerHeight, innerWidth: window.innerWidth, scrollY: window.scrollY,
    aspect: camera.aspect, bufferAspect: canvas.width / canvas.height,
    veilGone: document.getElementById('veil').hidden,
  };
});

/** Lies `bleed` CSS pixels under the viewport's top, its foot at the viewport's foot, and the pond measured it so. */
function checkUnderTop(where, bleed, framing) {
  const lies = framing.bleeding && framing.position === 'absolute' && near(framing.top, -bleed) && near(framing.bottom, framing.innerHeight) && near(framing.scrollY, bleed);
  check(lies, `${where}: the canvas lies ${(-framing.top).toFixed(1)} px above the viewport's top (${bleed} asked, ${framing.bleed || 'no --bleed'}), its foot at ${framing.bottom.toFixed(1)} of ${framing.innerHeight}, the page scrolled ${framing.scrollY}`);
  check(near(framing.aspect, framing.width / framing.height, 1e-3) && near(framing.bufferAspect, framing.width / framing.height, 0.01),
    `${where}: the pond framed the canvas as it lies: aspect ${framing.aspect.toFixed(4)} (the canvas's ${(framing.width / framing.height).toFixed(4)}, its drawing buffer's ${framing.bufferAspect.toFixed(4)})`);
}

/** Fixed over the viewport, unscrolled, no bleed. */
function checkFixed(where, framing) {
  check(!framing.bleeding && framing.position === 'fixed' && near(framing.top, 0) && near(framing.bottom, framing.innerHeight) && framing.scrollY === 0,
    `${where}: the canvas is fixed over the viewport (${framing.position}, ${framing.top.toFixed(1)} to ${framing.bottom.toFixed(1)} of ${framing.innerHeight}), the page unscrolled (${framing.scrollY})`);
  check(near(framing.aspect, framing.width / framing.height, 1e-3), `${where}: the pond framed it: aspect ${framing.aspect.toFixed(4)} (the canvas's ${(framing.width / framing.height).toFixed(4)})`);
}

/**
 * Wait (a while, on SwiftShader) until the page is in full screen, or out of
 * it, and the Full screen row says so (it follows the change's event, a frame
 * after the state); the checks after say which it came to.
 */
const fullScreenIs = (page, on) => page.waitForFunction((wanted) => (document.fullscreenElement !== null) === wanted
  && document.querySelector('.menu-tier[data-open="screen"] .menu-tier-value').textContent === (wanted ? 'On' : 'Off'), on, { timeout: patience(5000) }).catch(() => {});

/** Open the settings onto the Full screen page; returns what it shows. */
async function screenPage(page) {
  if (await page.evaluate(() => document.getElementById('settings').hidden)) await page.click('#menu-button');
  await page.click('.menu-tier[data-open="screen"]');
  await page.waitForTimeout(400);   // the page slides in over 220 ms
  return page.evaluate(() => ({
    value: document.querySelector('.menu-tier[data-open="screen"] .menu-tier-value').textContent,
    valueCut: (({ scrollWidth, clientWidth }) => scrollWidth > clientWidth + 0.5)(document.querySelector('.menu-tier[data-open="screen"] .menu-tier-value')),
    choicesShown: !document.getElementById('screen').hidden,
    checked: document.querySelector('#screen [aria-checked="true"]')?.dataset.value ?? null,
    note: document.getElementById('screen-note').textContent,
  }));
}

/** The settings closed again (Escape closes them: src/settingsPanel.js). */
async function closeSettings(page) {
  if (!(await page.evaluate(() => document.getElementById('settings').hidden))) await page.keyboard.press('Escape');
}

// ---- Safari 26 on an iPhone, upright --------------------------------------
console.log(`Safari 26 on an iPhone: a ${IPHONE.viewport.width} × ${IPHONE.viewport.height} viewport on a ${IPHONE.screen.width} × ${IPHONE.screen.height} screen, at ${IPHONE.deviceScaleFactor}×`);
{
  const { context, page, problems } = await openPond(IPHONE);
  await page.screenshot({ path: path.join(outputFolder, 'iphone.png') });
  const upright = await layout(page);
  checkUnderTop('upright', ISLAND_BLEED, upright);
  check(upright.veilGone, 'the loading veil is out of the page once faded');

  const fixedParts = await page.evaluate(() => {
    const strip = document.querySelector('.controls').getBoundingClientRect();
    const button = document.getElementById('menu-button').getBoundingClientRect();
    return { stripBottom: strip.bottom, buttonTop: button.top, stripPosition: getComputedStyle(document.querySelector('.controls')).position };
  });
  check(fixedParts.stripPosition === 'fixed' && near(fixedParts.stripBottom, upright.innerHeight) && fixedParts.buttonTop >= 0,
    `the strip stays fixed on the viewport's foot (${fixedParts.stripBottom.toFixed(1)}) and the settings button inside it (${fixedParts.buttonTop.toFixed(1)} from its top)`);

  // A tap on the water throws at the water under the finger (the probe's own ray through the canvas as it lies, as tools/zoom-probe.mjs's).
  const tapX = upright.innerWidth * 0.55, tapY = upright.innerHeight * 0.42;
  const tapped = await page.evaluate(([clientX, clientY]) => {
    const { THREE, camera } = window.__pond;
    const canvas = document.getElementById('pond');
    const box = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1), camera);
    const water = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), water)) return null;
    const before = window.__pond.rocks.length;
    const pointer = (type, x) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY, bubbles: true, cancelable: true }));
    pointer('pointerdown', clientX);
    pointer('pointerup', clientX + 2);
    if (window.__pond.rocks.length !== before + 1) return { water: [water.x, water.z], thrown: false };
    const rock = window.__pond.rocks.at(-1);
    // Fly the stone's arc to the water (it has drag, so allow a few centimetres).
    const position = rock.position.clone(), velocity = rock.velocity.clone();
    for (let step = 0; step < 4000 && position.y > 0; step++) { velocity.y -= 9.81 / 1000; position.addScaledVector(velocity, 1 / 1000); }
    return { water: [water.x, water.z], landing: [position.x, position.z], thrown: true };
  }, [tapX, tapY]);
  const miss = tapped?.thrown ? Math.hypot(tapped.landing[0] - tapped.water[0], tapped.landing[1] - tapped.water[1]) : Infinity;
  check(tapped?.thrown && miss < 0.1, `a tap on the water throws at the water under the finger: ${tapped?.thrown ? `${(miss * 100).toFixed(1)} cm from it` : 'nothing thrown'}`);

  // A tap on the status bar scrolls the page to its top: it goes back to its foot.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const scrolledBack = await layout(page);
  check(near(scrolledBack.scrollY, ISLAND_BLEED) && near(scrolledBack.top, -ISLAND_BLEED), `scrolled to the top by something else, the page goes back to its foot (scrolled ${scrolledBack.scrollY})`);

  // On its side: no status bar, so the canvas is fixed; upright again, under the clock again.
  await page.setViewportSize(IPHONE_ON_ITS_SIDE);
  await page.waitForTimeout(300);
  checkFixed('on its side', await layout(page));
  await page.screenshot({ path: path.join(outputFolder, 'iphone-on-its-side.png') });
  await page.setViewportSize(IPHONE.viewport);
  await page.waitForTimeout(300);
  checkUnderTop('upright again', ISLAND_BLEED, await layout(page));

  // Full screen, through the settings (this browser has the API the iPhone lacks).
  const offered = await screenPage(page);
  check(offered.value === 'Off' && offered.choicesShown && offered.checked === 'off', `the Full screen page offers On and Off, Off checked, the row saying ${offered.value}`);
  await page.click('#screen [data-value="on"]');
  await fullScreenIs(page, true);
  const inFullScreen = await page.evaluate(() => ({
    element: document.fullscreenElement === document.documentElement,
    value: document.querySelector('.menu-tier[data-open="screen"] .menu-tier-value').textContent,
    checked: document.querySelector('#screen [aria-checked="true"]')?.dataset.value ?? null,
  }));
  check(inFullScreen.element && inFullScreen.value === 'On' && inFullScreen.checked === 'on', `On puts the page in full screen (${inFullScreen.element}), the row saying ${inFullScreen.value}`);
  checkFixed('in full screen', await layout(page));
  await page.click('#screen [data-value="off"]');
  await fullScreenIs(page, false);
  const outOfFullScreen = await page.evaluate(() => ({ element: document.fullscreenElement, value: document.querySelector('.menu-tier[data-open="screen"] .menu-tier-value').textContent }));
  check(outOfFullScreen.element === null && outOfFullScreen.value === 'Off', `Off brings it out of full screen, the row saying ${outOfFullScreen.value}`);
  await closeSettings(page);
  await page.waitForTimeout(300);
  checkUnderTop('out of full screen', ISLAND_BLEED, await layout(page));
  check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join('; ')}` : ''}`);
  await context.close();
}

// ---- The same phone without the Fullscreen API, as Safari on an iPhone has ----
console.log('Safari 26 on an iPhone, without the Fullscreen API for a page');
{
  const { context, page, problems } = await openPond(IPHONE, '', () => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true });
  });
  const shown = await screenPage(page);
  check(!shown.choicesShown && shown.value === 'Home Screen' && /Add to Home Screen/.test(shown.note),
    `the Full screen page hides On and Off and names the Home Screen's way (the row: ${shown.value}; "${shown.note.slice(0, 60)}…")`);
  check(!shown.valueCut, `the row's value, ${shown.value}, shows whole beside its name`);
  await page.screenshot({ path: path.join(outputFolder, 'iphone-full-screen-page.png') });
  await closeSettings(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('f');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.fullscreenElement === null), 'F does nothing there');
  checkUnderTop('still', ISLAND_BLEED, await layout(page));
  check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join('; ')}` : ''}`);
  await context.close();
}

// ---- Opened from the Home Screen -------------------------------------------
console.log('the iPhone, opened from the Home Screen');
{
  const { context, page, problems } = await openPond(IPHONE, '', () => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  });
  checkFixed('from the Home Screen', await layout(page));
  const shown = await screenPage(page);
  check(!shown.choicesShown && shown.value === 'On' && /Home Screen/.test(shown.note), `the Full screen page says it has the whole screen (the row: ${shown.value})`);
  check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join('; ')}` : ''}`);
  await context.close();
}

// ---- Chrome on the iPhone, and an iPhone with a home button ------------------
console.log('Chrome on the iPhone (bars of its own)');
{
  const { context, page } = await openPond({ ...IPHONE, userAgent: CHROME_IPHONE });
  checkFixed('Chrome on an iPhone', await layout(page));
  await context.close();
}
console.log(`Safari 26 on an iPhone with a home button: ${HOME_BUTTON_IPHONE.viewport.width} × ${HOME_BUTTON_IPHONE.viewport.height} on ${HOME_BUTTON_IPHONE.screen.width} × ${HOME_BUTTON_IPHONE.screen.height}`);
{
  const { context, page } = await openPond(HOME_BUTTON_IPHONE);
  checkUnderTop('a home button\'s status bar', HOME_BUTTON_BLEED, await layout(page));
  await context.close();
}

// ---- A desktop window -------------------------------------------------------
console.log(`a desktop window: ${DESKTOP.viewport.width} × ${DESKTOP.viewport.height}`);
{
  const { context, page, problems } = await openPond(DESKTOP);
  checkFixed('a desktop window', await layout(page));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('f');
  await fullScreenIs(page, true);
  const pressed = await page.evaluate(() => ({ element: document.fullscreenElement === document.documentElement, value: document.querySelector('.menu-tier[data-open="screen"] .menu-tier-value').textContent }));
  await page.keyboard.press('f');
  await fullScreenIs(page, false);
  const pressedAgain = await page.evaluate(() => document.fullscreenElement === null);
  check(pressed.element && pressed.value === 'On' && pressedAgain, `F goes into full screen (the row: ${pressed.value}) and out again (${pressedAgain})`);
  check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join('; ')}` : ''}`);
  await context.close();
}
console.log(`a desktop window, ?bleed=${ASKED_BLEED}`);
{
  const { context, page } = await openPond(DESKTOP, `&bleed=${ASKED_BLEED}`);
  checkUnderTop('asked for', ASKED_BLEED, await layout(page));
  await page.screenshot({ path: path.join(outputFolder, 'desktop-bleed.png') });
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
