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
//     there moves it, and the readout and the next stone follow;
//   - the settings button is on the screen, clear of the title, and (on a
//     touch screen) at least 34 points tall; pressed, the panel opens on the
//     screen, its rows that tall too, each row's value whole beside its
//     name; its Water row opens the Water page, whose five pictured choices
//     can each be scrolled onto the screen and fit their names, whose Pool
//     puts the rocks in the pool (the View note follows) and whose Murky sets
//     the pond's clarity, each with the row's value; its Time row opens the
//     Time page, whose slider spans it (44 points tall on a touch screen)
//     and, tapped at its left end, loads the place's first hour, the row and
//     the readout following, while a lone photograph's page hides the slider
//     and says why; its Weather row opens the Weather page, whose four
//     choices fit and whose Heavy rain brings the rain; a press on the water
//     closes it without throwing a stone, and Escape closes it too;
//   - on a touch screen a finger dragged across the water turns the view and
//     throws nothing, and the Reset view button then shows on the screen.
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

  // The settings (src/settingsPanel.js).
  const press = (selector) => (framing.touch ? page.tap(selector) : page.click(selector));
  const boxes = (selector) => page.evaluate((query) => {
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    return [...document.querySelectorAll(query)].filter((element) => element.getClientRects().length > 0).map((element) => {
      const box = element.getBoundingClientRect();
      return { name: element.dataset.value || element.dataset.open || element.id || element.className, left: box.left * scale, right: box.right * scale, top: box.top * scale, bottom: box.bottom * scale, height: box.height * scale };
    });
  }, selector);
  const onScreen = (box) => box.left >= -0.5 && box.top >= -0.5 && box.right <= layout.screenWidth + 0.5 && box.bottom <= layout.screenHeight + 0.5;
  const [menuButton] = await boxes('#menu-button');
  const [title] = await boxes('.title h1');
  const overlaps = (first, second) => first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
  check(onScreen(menuButton) && !overlaps(menuButton, title), `the settings button is on the screen, clear of the title`);
  if (framing.touch) check(menuButton.height >= SMALLEST_BUTTON_HEIGHT - 0.5, `the settings button is at least ${SMALLEST_BUTTON_HEIGHT} points tall (${menuButton.height.toFixed(1)})`);
  await press('#menu-button');
  await page.waitForTimeout(400);
  const [panel] = await boxes('#settings');
  const rows = await boxes('#settings .menu-tier');
  check(!!panel && onScreen(panel) && rows.length === 7, `the settings open on the screen with their seven rows (${rows.length})`);
  if (framing.touch) check(rows.every((row) => row.height >= SMALLEST_BUTTON_HEIGHT - 0.5), `every settings row is at least ${SMALLEST_BUTTON_HEIGHT} points tall (smallest ${Math.min(...rows.map((row) => row.height)).toFixed(1)})`);
  const cutValues = await page.evaluate(() => [...document.querySelectorAll('#settings .menu-tier-value')].filter((value) => value.scrollWidth > value.clientWidth + 0.5).map((value) => value.textContent));
  const hinted = await page.evaluate(() => [...document.querySelectorAll('#settings .menu-tier-name small')].filter((hint) => hint.getClientRects().length > 0).length);
  check(cutValues.length === 0, `every row's value shows whole beside its name${cutValues.length ? ` (cut: ${cutValues.join(', ')})` : ''}; ${hinted} of the rows show their line on what they set`);
  await page.screenshot({ path: path.join(outputFolder, `${framing.name}-settings.png`) });
  await press('#settings .menu-tier[data-open="water"]');
  await page.waitForTimeout(400);
  // Each choice as the panel scrolls it into view: a short screen's panel scrolls.
  const choices = await page.evaluate(() => {
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    const placed = [...document.querySelectorAll('#water [role="radio"]')].map((choice) => {
      choice.scrollIntoView({ block: 'nearest' });
      const box = choice.getBoundingClientRect();
      return { name: choice.dataset.value, left: box.left * scale, right: box.right * scale, top: box.top * scale, bottom: box.bottom * scale, height: box.height * scale };
    });
    document.getElementById('settings').scrollTop = 0;
    return placed;
  });
  const [waterPanel] = await boxes('#settings');
  if (framing.touch) check(choices.length === 5 && choices.every((choice) => choice.height >= SMALLEST_BUTTON_HEIGHT - 0.5), `the Water page's five choices are at least ${SMALLEST_BUTTON_HEIGHT} points tall`);
  check(onScreen(waterPanel) && choices.length === 5 && choices.every(onScreen), `the Water page is on the screen, each of its choices once scrolled to`);
  const clipped = await page.evaluate(() => [...document.querySelectorAll('#water [role="radio"] b')].filter((name) => name.scrollWidth > name.clientWidth).map((name) => name.textContent));
  check(clipped.length === 0, `every Water choice's name fits its card${clipped.length ? ` (not: ${clipped.join(', ')})` : ''}`);
  await press('#water [data-value="pool"]');
  const pooled = await page.evaluate(() => ({ clarity: window.__pond.clarity, row: document.querySelector('.menu-tier[data-open="water"] .menu-tier-value').textContent, viewNote: document.getElementById('view-note').textContent }));
  check(pooled.clarity === 'pool' && pooled.row === 'Pool' && pooled.viewNote.includes('pool'), `Pool puts the rocks in the pool (${pooled.clarity}), the row reads "${pooled.row}", the View note "${pooled.viewNote}"`);
  await press('#water [data-value="murky"]');
  const chosen = await page.evaluate(() => ({ clarity: window.__pond.clarity, row: document.querySelector('.menu-tier[data-open="water"] .menu-tier-value').textContent }));
  check(chosen.clarity === 'murky' && chosen.row === 'Murky', `Murky sets the clarity (${chosen.clarity}) and the row's value ("${chosen.row}")`);
  await page.screenshot({ path: path.join(outputFolder, `${framing.name}-water.png`) });
  await page.evaluate(() => window.__pond.setClarity('lake'));
  // The Time page: Lakeside's hours on a slider; a tap at its left end loads the first.
  await press('.menu-page[data-page="water"] .menu-back');
  await page.waitForTimeout(400);
  await press('#settings .menu-tier[data-open="time"]');
  await page.waitForTimeout(400);
  const [timePanel] = await boxes('#settings');
  const [timeSlider] = await boxes('#time');
  check(!!timeSlider && onScreen(timePanel) && onScreen(timeSlider) && timeSlider.right - timeSlider.left >= 0.8 * (timePanel.right - timePanel.left) && (!framing.touch || timeSlider.height >= 43.5),
    `the Time page is on the screen, its slider ${timeSlider ? `${(timeSlider.right - timeSlider.left).toFixed(0)}×${timeSlider.height.toFixed(0)}` : 'missing'} points across the page`);
  if (timeSlider) {
    const tapX = (timeSlider.left + 4) / layout.scale, tapY = (timeSlider.top + timeSlider.height / 2) / layout.scale;
    if (framing.touch) {
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tapX, y: tapY }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.click(tapX, tapY);
    }
    await page.waitForFunction(() => window.__pond.hour === window.__pond.hours[0].name && !document.querySelector('.menu-tier[data-open="time"] .menu-tier-value').textContent.endsWith('\u2026'), null, { timeout: 60000 }).catch(() => {});
    const hour = await page.evaluate(() => ({ time: window.__pond.hour, first: window.__pond.hours[0], row: document.querySelector('.menu-tier[data-open="time"] .menu-tier-value').textContent, readout: document.getElementById('time-name').textContent }));
    check(hour.time === hour.first.name && hour.row === `${hour.first.label} \u00b7 ${hour.first.clock}` && hour.readout === hour.first.label,
      `a tap at the slider's left end loads ${hour.time} (the first hour, ${hour.first.name}), the row reads "${hour.row}", the readout "${hour.readout}"`);
    await page.screenshot({ path: path.join(outputFolder, `${framing.name}-time.png`) });
  }
  await press('.menu-page[data-page="time"] .menu-back');
  await page.waitForTimeout(400);
  await press('#settings .menu-tier[data-open="sky"]');
  await page.waitForTimeout(400);
  await press('#sky [data-value="meadow"]');
  await page.waitForFunction(() => window.__pond.sky === 'meadow' && document.querySelector('.menu-tier[data-open="time"] .menu-tier-value').textContent === 'Afternoon', null, { timeout: 60000 }).catch(() => {});
  const lone = await page.evaluate(() => ({ hidden: document.getElementById('time').hidden, note: document.getElementById('time-note').textContent, row: document.querySelector('.menu-tier[data-open="time"] .menu-tier-value').textContent }));
  check(lone.hidden && lone.note.includes('single photograph') && lone.row === 'Afternoon', `under the meadow's lone photograph the slider hides, the row reads "${lone.row}" and the note "${lone.note}"`);
  await press('.menu-page[data-page="sky"] .menu-back');   // the list again: the Location page reaches the water's middle on a small phone
  await page.waitForTimeout(400);
  // The Weather page: its choices fit, and Heavy rain brings the rain.
  await press('#settings .menu-tier[data-open="weather"]');
  await page.waitForTimeout(400);
  const weatherChoices = await boxes('#weather [role="radio"]');
  const weatherClipped = await page.evaluate(() => [...document.querySelectorAll('#weather [role="radio"]')].filter((choice) => choice.scrollWidth > choice.clientWidth).map((choice) => choice.textContent));
  check(weatherChoices.length === 4 && weatherChoices.every(onScreen) && weatherClipped.length === 0 && (!framing.touch || weatherChoices.every((choice) => choice.height >= SMALLEST_BUTTON_HEIGHT - 0.5)),
    `the Weather page's four choices are on the screen and fit their labels${weatherClipped.length ? ` (not: ${weatherClipped.join(', ')})` : ''}`);
  await press('#weather [data-value="heavy-rain"]');
  await page.waitForFunction(() => window.__pond.raining, null, { timeout: 60000 }).catch(() => {});
  const rainy = await page.evaluate(() => ({ weather: window.__pond.weather, raining: window.__pond.raining, row: document.querySelector('.menu-tier[data-open="weather"] .menu-tier-value').textContent }));
  check(rainy.weather === 'heavy-rain' && rainy.raining && rainy.row === 'Heavy rain', `Heavy rain brings the rain (${rainy.weather}, falling: ${rainy.raining}), the row reads "${rainy.row}"`);
  await page.screenshot({ path: path.join(outputFolder, `${framing.name}-weather.png`) });
  await press('#weather [data-value="clear"]');
  await press('.menu-page[data-page="weather"] .menu-back');
  await page.waitForTimeout(400);
  const stonesBefore = await page.evaluate(() => window.__pond.rocks.length);
  // Water clear of the open list: beside it, or (on a narrow screen, where it spans the width) under it, above the strip.
  const [openList] = await boxes('#settings');
  const waterX = layout.screenWidth * 0.3;
  const waterPoint = { x: waterX / layout.scale, y: (waterX < openList.left ? layout.screenHeight * 0.55 : (openList.bottom + layout.strip.top) / 2) / layout.scale };
  if (framing.touch) await page.touchscreen.tap(waterPoint.x, waterPoint.y);
  else await page.mouse.click(waterPoint.x, waterPoint.y);
  const afterOutside = await page.evaluate(() => ({ open: !document.getElementById('settings').hidden, stones: window.__pond.rocks.length }));
  check(!afterOutside.open && afterOutside.stones === stonesBefore, `a press on the water closes the settings without throwing (open: ${afterOutside.open}, stones ${stonesBefore} -> ${afterOutside.stones})`);
  if (!framing.touch) {
    await press('#menu-button');
    await page.keyboard.press('Escape');
    check(await page.evaluate(() => document.getElementById('settings').hidden), `Escape closes the settings`);
  } else {
    // A real finger (the browser's touch input, not synthetic pointers) dragged across the water.
    const session = await context.newCDPSession(page);
    const touch = (type, x, y) => session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const azimuthBefore = await page.evaluate(() => window.__pond.orbit.azimuth);
    const rocksBefore = await page.evaluate(() => window.__pond.rocks.length);
    const from = { x: layout.screenWidth * 0.35 / layout.scale, y: layout.screenHeight * 0.5 / layout.scale };
    await touch('touchStart', from.x, from.y);
    for (let step = 1; step <= 6; step++) await touch('touchMove', from.x + 20 * step, from.y);
    await touch('touchEnd', from.x + 120, from.y);
    await session.detach();
    const dragged = await page.evaluate(() => ({ azimuth: window.__pond.orbit.azimuth, rocks: window.__pond.rocks.length }));
    const [resetButton] = await boxes('#reset-view');
    check(dragged.azimuth < azimuthBefore - 1 && dragged.rocks === rocksBefore && !!resetButton && onScreen(resetButton),
      `a finger dragged 120 px across the water turns the view ${(azimuthBefore - dragged.azimuth).toFixed(1)}° and throws ${dragged.rocks - rocksBefore} rocks; Reset view is on the screen`);
    await page.screenshot({ path: path.join(outputFolder, `${framing.name}-turned.png`) });
  }
  if (problems.length) { check(false, `page errors: ${problems.join(' | ')}`); }
  await context.close();
}

console.log(`screens saved in ${path.relative(repository, outputFolder)}/`);
console.log(failures ? `${failures} check(s) failed` : 'all control checks passed');
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
