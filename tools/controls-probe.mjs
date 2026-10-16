// Browser probe of the page's controls as phones show them.
//
// tools/shoot.mjs and the other probes emulate a desktop browser, which lays
// the page out at the window's size and ignores the viewport meta tag; a
// phone's browser does not: without the tag it lays the page out 980 pixels
// wide and shrinks it to fit, so every control comes out at less than half
// its size. This probe emulates a phone's browser (isMobile, touch, the
// device's pixel ratio) at a large phone's portrait and landscape and a small
// phone's portrait and landscape, plus a desktop window, and for each checks:
//   - the page is laid out at the device's width (the viewport tag works);
//   - every control lies inside the screen, the strip does not overflow and
//     it covers at most 30% of the screen's height;
//   - on a touch screen the stone slider is at least 44 points tall (Apple's
//     smallest comfortable target) and, in portrait, spans most of the
//     screen's width, and every button is at least 34 points tall;
//   - a tap anywhere along the slider puts its thumb there (iOS moves a range
//     input only by its thumb, so the page does this itself), dragging from
//     there moves it, and the readout and the next stone follow.
// Sizes are reported in points on the screen (CSS pixels times the page's
// zoom), so a shrunken page fails them. It saves each framing's screen to
// shots/controls-probe/<label>/ and exits with status 1 if a check fails.
//
//   node tools/controls-probe.mjs [--root=path] [--label=name]
//
// --root serves another checkout (a git archive of an earlier commit, say);
// the screenshots and the checks then describe that version.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => { const hit = process.argv.find((candidate) => candidate.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const root = path.resolve(argument('root', repository));
const label = argument('label', 'current');
const outputFolder = path.join(repository, 'shots', 'controls-probe', label);

const FRAMINGS = [
  { name: 'phone', width: 430, height: 932, pixelRatio: 3, touch: true, portrait: true },        // a large iPhone in portrait
  { name: 'small-phone', width: 375, height: 667, pixelRatio: 2, touch: true, portrait: true },  // an iPhone SE
  { name: 'phone-landscape', width: 932, height: 430, pixelRatio: 3, touch: true, portrait: false },
  { name: 'small-phone-landscape', width: 667, height: 375, pixelRatio: 2, touch: true, portrait: false },
  { name: 'desktop', width: 1280, height: 720, pixelRatio: 1, touch: false, portrait: false },
];
const SMALLEST_SLIDER_HEIGHT = 44;     // points
const SMALLEST_BUTTON_HEIGHT = 34;     // points
const PORTRAIT_SLIDER_SHARE = 0.55;    // of the screen's width
const LARGEST_STRIP_SHARE = 0.3;       // of the screen's height: the pond is the point

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.hdr': 'application/octet-stream' };
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
await mkdir(outputFolder, { recursive: true });

let failures = 0;
const check = (passed, message) => { if (!passed) failures++; console.log(`${passed ? '  ok  ' : '  FAIL'} ${message}`); };

for (const framing of FRAMINGS) {
  console.log(`${framing.name}: ${framing.width}×${framing.height} at ${framing.pixelRatio}×${framing.touch ? ', touch' : ''}`);
  const context = await browser.newContext({
    viewport: { width: framing.width, height: framing.height },
    deviceScaleFactor: framing.pixelRatio,
    isMobile: framing.touch,
    hasTouch: framing.touch,
  });
  await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
    const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
    try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(repository, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  await page.goto(`http://localhost:${server.address().port}/index.html?quality=low&paused=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__pond, undefined, { timeout: 180000 });
  await page.evaluate(() => window.__pond.advance(0.05));
  await page.waitForTimeout(900);   // the veil fades over 0.6 s
  await page.screenshot({ path: path.join(outputFolder, `${framing.name}.png`) });

  const layout = await page.evaluate(() => {
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    const screenBox = (element) => { const box = element.getBoundingClientRect(); return { left: box.left * scale, right: box.right * scale, top: box.top * scale, bottom: box.bottom * scale, width: box.width * scale, height: box.height * scale }; };
    const strip = document.querySelector('.controls');
    const slider = document.getElementById('stone-size');
    const parts = [...strip.querySelectorAll('button:not([hidden]), input, .readout, label, .name')];
    return {
      layoutWidth: window.innerWidth,
      scale,
      screenWidth: window.innerWidth * scale,
      screenHeight: window.innerHeight * scale,
      strip: screenBox(strip),
      stripOverflows: strip.scrollWidth > strip.clientWidth + 0.5,
      slider: screenBox(slider),
      parts: parts.map((part) => ({ name: part.id || part.dataset?.value || part.textContent.trim().slice(0, 14), tag: part.tagName, ...screenBox(part) })),
    };
  });
  const sliderText = `${layout.slider.width.toFixed(0)}×${layout.slider.height.toFixed(0)} points`;
  console.log(`  layout ${layout.layoutWidth} CSS pixels wide at zoom ${layout.scale.toFixed(3)}; slider ${sliderText}; the strip covers ${(layout.strip.height / layout.screenHeight * 100).toFixed(1)}% of the screen's height`);
  if (framing.touch) check(layout.layoutWidth === framing.width, `the page is laid out at the device's width (${layout.layoutWidth} CSS pixels for a ${framing.width}-point screen)`);
  const outside = layout.parts.filter((part) => part.left < -0.5 || part.top < -0.5 || part.right > layout.screenWidth + 0.5 || part.bottom > layout.screenHeight + 0.5);
  check(outside.length === 0 && !layout.stripOverflows, `every control is on the screen${outside.length ? ` (off it: ${outside.map((part) => part.name).join(', ')})` : ''}${layout.stripOverflows ? ' (the strip overflows)' : ''}`);
  check(layout.strip.height <= LARGEST_STRIP_SHARE * layout.screenHeight, `the control strip covers at most ${Math.round(LARGEST_STRIP_SHARE * 100)}% of the screen's height (${(layout.strip.height / layout.screenHeight * 100).toFixed(1)}%)`);
  if (framing.touch) {
    check(layout.slider.height >= SMALLEST_SLIDER_HEIGHT - 0.5, `the stone slider is at least ${SMALLEST_SLIDER_HEIGHT} points tall (${layout.slider.height.toFixed(1)})`);
    if (framing.portrait) check(layout.slider.width >= PORTRAIT_SLIDER_SHARE * layout.screenWidth, `the stone slider spans at least ${Math.round(PORTRAIT_SLIDER_SHARE * 100)}% of the screen's width (${(layout.slider.width / layout.screenWidth * 100).toFixed(0)}%)`);
    const buttons = layout.parts.filter((part) => part.tag === 'BUTTON');
    const smallest = buttons.reduce((least, button) => (button.height < least.height ? button : least), buttons[0]);
    check(smallest.height >= SMALLEST_BUTTON_HEIGHT - 0.5, `every button is at least ${SMALLEST_BUTTON_HEIGHT} points tall (smallest: ${smallest.name}, ${smallest.height.toFixed(1)})`);

    if (layout.layoutWidth === framing.width) {
      // Touches through the browser's own input, as a finger's would arrive.
      const session = await context.newCDPSession(page);
      const touch = (type, x, y) => session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const sliderState = () => page.evaluate(() => {
        const slider = document.getElementById('stone-size');
        const thumb = parseFloat(getComputedStyle(slider).getPropertyValue('--thumb')) || 0;
        return { value: Number(slider.value), minimum: Number(slider.min), maximum: Number(slider.max), step: Number(slider.step), readout: document.getElementById('stone-readout').textContent, thumb };
      });
      const initial = await sliderState();
      const pointAt = (fraction) => {
        const travel = layout.slider.width - initial.thumb;
        return [layout.slider.left + initial.thumb / 2 + fraction * travel, layout.slider.top + layout.slider.height / 2];
      };
      const expected = (fraction) => initial.minimum + Math.round(fraction * (initial.maximum - initial.minimum) / initial.step) * initial.step;
      const [tapX, tapY] = pointAt(0.8);
      await touch('touchStart', tapX, tapY);
      await touch('touchEnd', tapX, tapY);
      const tapped = await sliderState();
      check(Math.abs(tapped.value - expected(0.8)) <= initial.step + 1e-9 && tapped.readout === `${tapped.value % 1 === 0 ? tapped.value : tapped.value.toFixed(1)} cm`, `a tap at 80% along the slider sets ${tapped.value} cm (expected about ${expected(0.8)}), the readout says "${tapped.readout}"`);
      const radius = await page.evaluate(() => { window.__pond.throwRandom(); return window.__pond.rocks.at(-1).radius; });
      check(Math.abs(radius - tapped.value / 200) < 1e-9, `the next stone is ${(radius * 200).toFixed(1)} cm across`);
      const [startX, startY] = pointAt(0.2);
      await touch('touchStart', startX, startY);
      for (const fraction of [0.3, 0.45, 0.6]) { const [x, y] = pointAt(fraction); await touch('touchMove', x, y); }
      const [endX, endY] = pointAt(0.6);
      await touch('touchEnd', endX, endY);
      const dragged = await sliderState();
      check(Math.abs(dragged.value - expected(0.6)) <= initial.step + 1e-9, `a drag from 20% to 60% along the slider ends at ${dragged.value} cm (expected about ${expected(0.6)})`);
      await session.detach();
    } else {
      console.log('  (the tap and drag checks need the page laid out at the device\'s width; skipped)');
    }
  }
  if (problems.length) { check(false, `page errors: ${problems.join(' | ')}`); }
  await context.close();
}

console.log(`screens saved in ${path.relative(repository, outputFolder)}/`);
console.log(failures ? `${failures} check(s) failed` : 'all control checks passed');
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
