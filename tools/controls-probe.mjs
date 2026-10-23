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
//   - on a phone in portrait (where the title's line is hidden) the first
//     visit's cue shows over the water, clear of the strip, and goes with the
//     first throw; elsewhere it stays hidden;
//   - on a touch screen the stone slider is at least 44 points tall (Apple's
//     smallest comfortable target) and, in portrait, spans most of the
//     screen's width, and every button is at least 34 points tall;
//   - a tap anywhere along the slider puts its thumb there (iOS moves a range
//     input only by its thumb, so the page does this itself), dragging from
//     there moves it, and the readout and the next stone follow;
//   - how to throw is one row: Toss, Lob and Skip set the throw's manner,
//     Soft, Medium and Hard its strength, and the slow-motion clock goes
//     round the time's rates (1×, ¼×, ⅒×) and lights while slow;
//   - the strip's chip opens the dropdown of things (src/thingMenu.js) over
//     the strip and under the settings button, its four groups and twenty
//     pills on the screen (on a phone in portrait without scrolling), each
//     fitting its name and on a touch screen at least 34 points tall, the
//     chosen one checked and focused; a pill tapped is thrown next (the
//     dropdown closed, the focus back on the chip, the strip following, a
//     skip asked for gone back to Toss for a ball), a press on the pond
//     closes it without throwing, the chip pressed again closes it, and on a
//     desktop the arrow keys and Enter choose in it and Escape closes it;
//   - the settings button is on the screen, clear of the title, and (on a
//     touch screen) at least 34 points tall; pressed, the panel opens on the
//     screen, its rows that tall too, each row's value whole beside its
//     name; its What to throw row opens that page, its things in a fold for
//     each group (the chosen thing's open, one at a time: on a phone in
//     portrait the page needs no scrolling), whose twenty pictured choices
//     can each be opened and scrolled onto the screen and fit their names,
//     every card one height, its name and note each one line, whole,
//     its head staying at the panel's top as it scrolls; the dropdown's foot
//     opens the page at once, and each choice, tapped, is shown over the
//     folds to look over (its name, size, mass, Floats or Sinks; the
//     settings stay open) and its Use button closes the settings, the next
//     tap on the water throwing it, and sets what is thrown, the throw
//     button's name (a rock, a ball, a gem), the row's value and the strip's
//     name, slider (its range, or off for a ball of one size) and line
//     ("Size 7 · 620 g") following, the strip still fitting; the latest
//     choices sit at the page's top and one tapped is thrown at once; Skip
//     pressed for a pie stays off and says why, and for a pizza turns on
//     (a pizza skips); its Water row opens the Water page, whose five pictured choices
//     can each be scrolled onto the screen and fit their names, whose Frozen
//     freezes the water thin, the ice's two choices showing under the cards,
//     fitting, Thick making it thick, the row and the note following, and
//     whose Murky thaws it and sets the pond's clarity, each with the row's
//     value; its Time row opens the
//     Time page, whose slider spans it (44 points tall on a touch screen)
//     and, tapped at its left end, loads the place's first hour, the row and
//     the readout following, while a lone photograph's page hides the slider
//     and says why; its Location page's Pool puts the rocks in the pool (the
//     View note follows) and the Water page shows the pool's own water in
//     place of the lake's; its Weather row opens the Weather page, whose four
//     choices fit and whose Heavy rain brings the rain; a press on the water
//     closes it without throwing a stone, and Escape closes it too;
//   - on a touch screen a finger dragged across the water turns the view and
//     throws nothing, and the Reset view button then shows on the screen,
//     clear of the settings button.
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
  // The first visit's cue: on a phone in portrait, over the water and clear of the strip, until the first throw.
  const cueShown = () => page.evaluate(() => {
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    const cue = document.getElementById('cue');
    if (cue.hidden || cue.getClientRects().length === 0) return null;
    const box = cue.getBoundingClientRect();
    return { left: box.left * scale, right: box.right * scale, top: box.top * scale, bottom: box.bottom * scale, text: cue.textContent };
  });
  const cue = await cueShown();
  if (framing.touch && framing.portrait) {
    check(!!cue && cue.left >= 0 && cue.right <= layout.screenWidth && cue.top >= 0 && cue.bottom <= layout.strip.top, `the first visit's cue shows over the water, clear of the strip ("${cue?.text ?? 'hidden'}"${cue ? `, ${Math.round(layout.strip.top - cue.bottom)} points above it` : ''})`);
  } else {
    check(!cue, `the first visit's cue stays hidden, the title's line saying it here`);
  }
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
      check(Math.abs(tapped.value - expected(0.8)) <= initial.step + 1e-9 && tapped.readout.startsWith(`${tapped.value % 1 === 0 ? tapped.value : tapped.value.toFixed(1)} cm · `), `a tap at 80% along the slider sets ${tapped.value} cm (expected about ${expected(0.8)}), the readout says "${tapped.readout}"`);
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

  if (framing.touch && framing.portrait) {
    await page.evaluate(() => window.__pond.throwRandom());
    await page.waitForTimeout(600);
    const gone = { cue: await cueShown(), stored: await page.evaluate(() => localStorage.getItem('stone-pond-thrown')) };
    check(!gone.cue && gone.stored === '1', `the cue goes with the first throw, for good on this device (${gone.cue ? 'still shown' : 'gone'}, stored ${gone.stored})`);
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

  // How to throw: Toss, Lob and Skip set the manner (src/main.js MANNERS), Soft, Medium and Hard the strength (ARC), each on its own.
  const throwState = () => page.evaluate(() => ({ manner: document.querySelector('#manner [aria-pressed="true"]')?.dataset.value, power: document.querySelector('#power [aria-pressed="true"]')?.dataset.value, pondManner: window.__pond.manner, pondPower: window.__pond.power, skipping: window.__pond.skipping }));
  const throwKinds = [];
  for (const [group, value] of [['manner', 'skip'], ['power', 'hard'], ['manner', 'lob'], ['power', 'soft'], ['manner', 'toss'], ['power', 'normal']]) {
    await press(`#${group} [data-value="${value}"]`);
    throwKinds.push(await throwState());
  }
  const expectedKinds = [
    { manner: 'skip', power: 'normal', skipping: true }, { manner: 'skip', power: 'hard', skipping: true }, { manner: 'lob', power: 'hard', skipping: false },
    { manner: 'lob', power: 'soft', skipping: false }, { manner: 'toss', power: 'soft', skipping: false }, { manner: 'toss', power: 'normal', skipping: false },
  ];
  const kindsRight = throwKinds.every((state, index) => state.manner === expectedKinds[index].manner && state.pondManner === state.manner && state.power === expectedKinds[index].power && state.pondPower === state.power && state.skipping === expectedKinds[index].skipping);
  check(kindsRight, `Toss, Lob and Skip set the manner and Soft, Medium and Hard the strength, each keeping the other (${throwKinds.map((state) => `${state.power} ${state.manner}${state.skipping ? ', skipping' : ''}`).join('; ')})`);
  // Slow motion: the clock goes round 1×, ¼×, ⅒× and back, lit while slow.
  const slowSteps = [];
  for (let presses = 0; presses < 3; presses++) {
    await press('#slow');
    slowSteps.push(await page.evaluate(() => ({ scale: window.__pond.timeScale, rate: document.getElementById('slow-rate').textContent, lit: document.getElementById('slow').getAttribute('aria-pressed') })));
  }
  const slowRight = JSON.stringify(slowSteps) === JSON.stringify([{ scale: 0.25, rate: '¼×', lit: 'true' }, { scale: 0.1, rate: '⅒×', lit: 'true' }, { scale: 1, rate: '1×', lit: 'false' }]);
  check(slowRight, `slow motion: the clock's presses run the pond at ${slowSteps.map((step) => `${step.scale} (${step.rate}${step.lit === 'true' ? ', lit' : ''})`).join(', ')}`);

  // The dropdown of things (src/thingMenu.js): Skip asked for first, so choosing a ball shows it going back to Toss.
  await press('#manner [data-value="skip"]');
  await press('#thing-chip');
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => {
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    const toBox = (rect) => ({ left: rect.left * scale, right: rect.right * scale, top: rect.top * scale, bottom: rect.bottom * scale, height: rect.height * scale });
    const card = document.getElementById('thing-menu-card');
    const focused = document.activeElement?.dataset?.value;
    // Each pill as the card scrolls it into view: a short screen's card scrolls.
    const pills = [...card.querySelectorAll('[role="menuitemradio"]')].map((pill) => {
      pill.scrollIntoView({ block: 'nearest' });
      return { name: pill.dataset.value, checked: pill.getAttribute('aria-checked') === 'true', clipped: pill.scrollWidth > pill.clientWidth + 0.5, ...toBox(pill.getBoundingClientRect()) };
    });
    card.scrollTop = 0;
    return {
      open: !document.getElementById('thing-menu').hidden, expanded: document.getElementById('thing-chip').getAttribute('aria-expanded'),
      card: toBox(card.getBoundingClientRect()), scrolls: card.scrollHeight > card.clientHeight + 1, pills, focused,
      groups: [...card.querySelectorAll('.thing-menu-head')].map((head) => head.textContent),
    };
  });
  check(menu.open && menu.expanded === 'true' && onScreen(menu.card) && menu.card.bottom <= layout.strip.top + 0.5 && menu.card.top >= menuButton.bottom - 0.5,
    `the strip's chip opens the dropdown of things over the strip and under the settings button (${menu.open ? `${Math.round(menu.card.right - menu.card.left)}×${Math.round(menu.card.height)} points` : 'not open'})`);
  const checkedPill = menu.pills.find((pill) => pill.checked)?.name;
  check(menu.groups.join(', ') === 'Stones, Balls, Gems, Other' && menu.pills.length === 20 && menu.pills.every(onScreen) && !menu.pills.some((pill) => pill.clipped) && (!framing.touch || menu.pills.every((pill) => pill.height >= SMALLEST_BUTTON_HEIGHT - 0.5)),
    `its ${menu.groups.join(', ')} hold twenty pills (${menu.pills.length}), each on the screen once scrolled to and fitting its name${framing.touch ? `, at least ${SMALLEST_BUTTON_HEIGHT} points tall (smallest ${Math.min(...menu.pills.map((pill) => pill.height)).toFixed(1)})` : ''}${menu.pills.some((pill) => pill.clipped) ? ` (cut: ${menu.pills.filter((pill) => pill.clipped).map((pill) => pill.name).join(', ')})` : ''}`);
  check(checkedPill === 'stone' && menu.focused === 'stone', `the chosen thing's pill is checked (${checkedPill}) and focused (${menu.focused})`);
  if (framing.portrait) check(!menu.scrolls, 'on a phone in portrait the dropdown holds every pill without scrolling');
  await page.screenshot({ path: path.join(outputFolder, `${framing.name}-menu.png`) });
  const rocksBeforePick = await page.evaluate(() => window.__pond.rocks.length);
  await press('#thing-menu [data-value="tennis"]');
  await page.waitForTimeout(150);
  const picked = await page.evaluate(() => ({
    thing: window.__pond.thing, open: !document.getElementById('thing-menu').hidden, expanded: document.getElementById('thing-chip').getAttribute('aria-expanded'),
    focused: document.activeElement?.id, label: document.getElementById('thing-chip-name').textContent, sliderHidden: document.getElementById('stone-size').hidden,
    pressed: document.querySelector('#manner [aria-pressed="true"]')?.dataset.value, skipping: window.__pond.skipping, skipOff: document.querySelector('#manner [data-value="skip"]').getAttribute('aria-disabled'),
  }));
  await press('#pond');
  await page.waitForTimeout(150);
  const pickedThrown = await page.evaluate(() => ({ count: window.__pond.rocks.length, thing: window.__pond.rocks.at(-1)?.thing.key }));
  check(picked.thing === 'tennis' && !picked.open && picked.expanded === 'false' && picked.focused === 'thing-chip' && picked.label === 'Tennis ball' && picked.sliderHidden && pickedThrown.count === rocksBeforePick + 1 && pickedThrown.thing === 'tennis',
    `a pill tapped closes the dropdown (${picked.open ? 'open' : 'closed'}, focus on ${picked.focused}), the strip follows (${picked.label}, slider ${picked.sliderHidden ? 'off' : 'on'}) and the next tap on the water throws it (${pickedThrown.count - rocksBeforePick} thrown, ${pickedThrown.thing})`);
  check(picked.pressed === 'toss' && !picked.skipping && picked.skipOff === 'true', `a skip asked for goes back to Toss for a ball, Skip greyed out (${picked.pressed}${picked.skipping ? ', skipping' : ''}, Skip off: ${picked.skipOff})`);
  // A press on the pond (here above the card) only closes it; the chip pressed again closes it too.
  await press('#thing-chip');
  await page.waitForTimeout(300);
  const [openCard] = await boxes('#thing-menu-card');
  const rocksBeforeOutside = await page.evaluate(() => window.__pond.rocks.length);
  const outsidePoint = { x: layout.screenWidth * 0.3 / layout.scale, y: openCard.top / 2 / layout.scale };
  if (framing.touch) await page.touchscreen.tap(outsidePoint.x, outsidePoint.y);
  else await page.mouse.click(outsidePoint.x, outsidePoint.y);
  await page.waitForTimeout(150);
  const menuAfterOutside = await page.evaluate(() => ({ open: !document.getElementById('thing-menu').hidden, rocks: window.__pond.rocks.length }));
  check(!menuAfterOutside.open && menuAfterOutside.rocks === rocksBeforeOutside, `a press on the pond closes the dropdown without throwing (open: ${menuAfterOutside.open}, stones ${rocksBeforeOutside} -> ${menuAfterOutside.rocks})`);
  await press('#thing-chip');
  await page.waitForTimeout(300);
  const toggledOpen = await page.evaluate(() => !document.getElementById('thing-menu').hidden);
  await press('#thing-chip');
  await page.waitForTimeout(150);
  const toggledShut = await page.evaluate(() => ({ open: !document.getElementById('thing-menu').hidden, expanded: document.getElementById('thing-chip').getAttribute('aria-expanded') }));
  check(toggledOpen && !toggledShut.open && toggledShut.expanded === 'false', `the chip pressed again closes the dropdown (${toggledOpen ? 'opened' : 'did not open'}, then ${toggledShut.open ? 'still open' : 'closed'}, aria-expanded ${toggledShut.expanded})`);
  if (!framing.touch) {
    // The keyboard: the arrow keys move from pill to pill, Enter chooses, Escape closes; the focus comes back to the chip.
    const pillOrder = menu.pills.map((pill) => pill.name);
    await page.focus('#thing-chip');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight');
    const keyedTo = await page.evaluate(() => document.activeElement?.dataset?.value);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const keyedPick = await page.evaluate(() => ({ thing: window.__pond.thing, open: !document.getElementById('thing-menu').hidden, focused: document.activeElement?.id }));
    const expectedNext = pillOrder[pillOrder.indexOf('tennis') + 1];
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const reopened = await page.evaluate(() => !document.getElementById('thing-menu').hidden);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const escaped = await page.evaluate(() => ({ open: !document.getElementById('thing-menu').hidden, focused: document.activeElement?.id }));
    check(keyedTo === expectedNext && keyedPick.thing === expectedNext && !keyedPick.open && keyedPick.focused === 'thing-chip' && reopened && !escaped.open && escaped.focused === 'thing-chip',
      `from the keyboard: Enter on the chip opens it, ArrowRight moves from tennis to ${keyedTo} (expected ${expectedNext}), Enter throws that next (${keyedPick.thing}, ${keyedPick.open ? 'open' : 'closed'}, focus on ${keyedPick.focused}); Escape closes it (${escaped.open ? 'open' : 'closed'}, focus on ${escaped.focused})`);
  }
  // The river stone again, through the dropdown, for the settings' checks.
  await press('#thing-chip');
  await page.waitForTimeout(300);
  await press('#thing-menu [data-value="stone"]');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => window.__pond.thing === 'stone' && document.getElementById('thing-menu').hidden), `the river stone chosen again through the dropdown`);

  await press('#menu-button');
  await page.waitForTimeout(400);
  const [panel] = await boxes('#settings');
  const rows = await boxes('#settings .menu-tier');
  check(!!panel && onScreen(panel) && rows.length === 9, `the settings open on the screen with their nine rows (${rows.length})`);
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
    const placed = [...document.querySelectorAll('#water [role="radio"]:not([hidden])')].map((choice) => {
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
  const clipped = await page.evaluate(() => [...document.querySelectorAll('#water [role="radio"]:not([hidden]) b')].filter((name) => name.scrollWidth > name.clientWidth).map((name) => name.textContent));
  check(clipped.length === 0, `every Water choice's name fits its card${clipped.length ? ` (not: ${clipped.join(', ')})` : ''}`);
  // Frozen (src/ice.js): thin ice, its two choices under the cards, fitting; Thick makes it thick; the row and the note follow.
  const waterRow = () => page.evaluate(() => ({ water: window.__pond.waterChoice, ice: window.__pond.ice, clarity: window.__pond.clarity, row: document.querySelector('.menu-tier[data-open="water"] .menu-tier-value').textContent, note: document.getElementById('ice-note').textContent, iceShown: !document.getElementById('ice-field').hidden }));
  await press('#water [data-value="frozen"]');
  await page.waitForTimeout(200);
  const frozen = await waterRow();
  check(frozen.water === 'frozen' && frozen.ice === 'thin' && frozen.row === 'Frozen \u00b7 Thin' && frozen.note.includes('centimetre') && frozen.iceShown, `Frozen freezes the water thin (${frozen.water}, ${frozen.ice}), the row reads "${frozen.row}", the ice's choice ${frozen.iceShown ? 'shows' : 'is hidden'}, the note "${frozen.note}"`);
  const iceChoices = await page.evaluate(() => {
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    return [...document.querySelectorAll('#ice [role="radio"]')].map((choice) => {
      choice.scrollIntoView({ block: 'nearest' });
      const box = choice.getBoundingClientRect();
      return { left: box.left * scale, right: box.right * scale, top: box.top * scale, bottom: box.bottom * scale, height: box.height * scale, clipped: choice.scrollWidth > choice.clientWidth + 0.5 };
    });
  });
  check(iceChoices.length === 2 && iceChoices.every(onScreen) && iceChoices.every((choice) => !choice.clipped) && (!framing.touch || iceChoices.every((choice) => choice.height >= SMALLEST_BUTTON_HEIGHT - 0.5)),
    `the ice's two choices are on the screen once scrolled to and fit their names`);
  await press('#ice [data-value="thick"]');
  const thick = await waterRow();
  check(thick.ice === 'thick' && thick.row === 'Frozen \u00b7 Thick' && thick.note.includes('Four centimetres'), `Thick makes the ice thick (${thick.ice}), the row reads "${thick.row}", the note "${thick.note}"`);
  await page.screenshot({ path: path.join(outputFolder, `${framing.name}-ice.png`) });
  await press('#ice [data-value="thin"]');
  await press('#water [data-value="murky"]');
  const chosen = await waterRow();
  check(chosen.clarity === 'murky' && chosen.ice === 'none' && chosen.row === 'Murky' && !chosen.iceShown, `Murky thaws the ice (${chosen.ice}), sets the clarity (${chosen.clarity}) and the row's value ("${chosen.row}")`);
  await page.screenshot({ path: path.join(outputFolder, `${framing.name}-water.png`) });
  await page.evaluate(() => window.__pond.setWater('lake'));
  await press('.menu-page[data-page="water"] .menu-back');
  await page.waitForTimeout(400);
  await press('#settings .menu-tier[data-open="water"]');
  await page.waitForTimeout(400);
  // The Object page (src/things.js): its folds and twenty pictured choices; each sets what is thrown, and the strip's slider follows it.
  await press('.menu-page[data-page="water"] .menu-back');
  await page.waitForTimeout(400);
  await press('#settings .menu-tier[data-open="thing"]');
  await page.waitForTimeout(400);
  // Its folds (src/things.js groups): the chosen thing's open alone; with it, a phone in portrait sees the whole page without scrolling.
  const folds = await page.evaluate(() => {
    const panel = document.getElementById('settings');
    return { names: [...document.querySelectorAll('#thing .menu-group')].map((fold) => fold.dataset.group), open: [...document.querySelectorAll('#thing .menu-group[open]')].map((fold) => fold.dataset.group), scrolls: panel.scrollHeight > panel.clientHeight + 1 };
  });
  check(folds.names.length === 4 && folds.open.length === 1 && folds.open[0] === 'Stones', `the Object page folds its things into ${folds.names.join(', ')}, the chosen one's open (${folds.open.join(', ')})`);
  if (framing.portrait) check(!folds.scrolls, 'with one fold open the Object page fits a phone in portrait without scrolling');
  // Each fold opened in turn (the others shut), each of its cards scrolled to.
  const things = await page.evaluate(async () => {
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    const placed = [];
    for (const fold of document.querySelectorAll('#thing .menu-group')) {
      fold.open = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
      const others = [...document.querySelectorAll('#thing .menu-group[open]')].filter((other) => other !== fold).length;
      for (const choice of fold.querySelectorAll('[role="radio"]')) {
        choice.scrollIntoView({ block: 'nearest' });
        const box = choice.getBoundingClientRect();
        // Its name and note each on one line, whole (not cut short: scrollWidth beyond its box).
        const cut = [...choice.querySelectorAll('b, small')].some((line) => line.scrollWidth > line.clientWidth + 0.5);
        placed.push({ name: choice.dataset.value, others, cut, left: box.left * scale, right: box.right * scale, top: box.top * scale, bottom: box.bottom * scale, height: box.height * scale });
      }
    }
    document.getElementById('settings').scrollTop = 0;
    return placed;
  });
  const [thingPanel] = await boxes('#settings');
  check(onScreen(thingPanel) && things.length === 20 && things.every(onScreen) && things.every((choice) => choice.others === 0) && (!framing.touch || things.every((choice) => choice.height >= SMALLEST_BUTTON_HEIGHT - 0.5)), `the Object page is on the screen, each of its twenty choices once its fold is open (the others shut) and it is scrolled to${framing.touch ? `, at least ${SMALLEST_BUTTON_HEIGHT} points tall` : ''}`);
  // Every card one height (review: a note on two lines made its card taller than the rest), each line whole.
  const heights = things.map((choice) => choice.height), cut = things.filter((choice) => choice.cut).map((choice) => choice.name);
  check(Math.max(...heights) - Math.min(...heights) < 0.5 && cut.length === 0, `What to throw's cards are one height (${Math.min(...heights).toFixed(1)} to ${Math.max(...heights).toFixed(1)} points), their names and notes whole${cut.length ? `; cut short: ${cut.join(', ')}` : ''}`);
  // Its head stays at the panel's top, inside its edge, while the page scrolls under it.
  const head = await page.evaluate(() => {
    const panel = document.getElementById('settings');
    panel.scrollTop = panel.scrollHeight;
    const headBox = document.querySelector('.menu-page[data-page="thing"] .menu-head').getBoundingClientRect(), panelBox = panel.getBoundingClientRect();
    const title = document.querySelector('.menu-page[data-page="thing"] .menu-head h3').getBoundingClientRect();
    panel.scrollTop = 0;
    return { headTop: headBox.top - panelBox.top, titleTop: title.top - panelBox.top };
  });
  check(head.headTop >= -0.5 && head.headTop <= 1.5 && head.titleTop >= 8, `the page's head stays at the panel's top as it scrolls, its name ${head.titleTop.toFixed(0)} px inside the edge`);
  const thingsClipped = await page.evaluate(() => [...document.querySelectorAll('#thing [role="radio"] b')].filter((name) => name.scrollWidth > name.clientWidth).map((name) => name.textContent));
  check(thingsClipped.length === 0, `every Object choice's name fits its card${thingsClipped.length ? ` (not: ${thingsClipped.join(', ')})` : ''}`);
  const strip = () => page.evaluate(() => {
    const slider = document.getElementById('stone-size');
    const strip = document.querySelector('.controls');
    return {
      thing: window.__pond.thing, row: document.querySelector('.menu-tier[data-open="thing"] .menu-tier-value').textContent,
      label: document.getElementById('thing-chip-name').textContent, readout: document.getElementById('stone-readout').textContent,
      minimum: Number(slider.min), maximum: Number(slider.max), disabled: slider.disabled, overflows: strip.scrollWidth > strip.clientWidth + 0.5,
      button: document.getElementById('throw').getAttribute('aria-label'),
    };
  });
  for (const [choice, expected] of [
    ['basketball', { button: 'Throw a ball', row: 'Basketball', label: 'Basketball', readout: 'Size 7 · 620 g', minimum: 5, maximum: 7, disabled: false }],
    ['bowling', { row: 'Bowling ball', label: 'Bowling ball', readout: '14 lb · 21.6 cm', minimum: 6, maximum: 16, disabled: false }],
    ['tennis', { row: 'Tennis ball', label: 'Tennis ball', readout: '6.7 cm · 58 g', disabled: true }],
    ['granite', { button: 'Throw a rock', row: 'Granite', label: 'Granite', disabled: false, minimum: 1.5, maximum: 30 }],
    ['diamond', { button: 'Throw a gem', row: 'Diamond', label: 'Diamond', readout: '100 ct · 3 cm', minimum: 5, maximum: 1000, disabled: false }],
    ['pizza', { button: 'Throw a pizza', row: 'Pizza', label: 'Pizza', readout: '30 cm · 380 g', minimum: 1, maximum: 3, disabled: false }],
    ['stone', { row: 'River stone', label: 'Rock', disabled: false, minimum: 1.5, maximum: 30 }],
  ]) {
    // The strip's chip opens What to throw at once, the choice's fold open; a tap on its card chooses it and shows it
    // over the folds (the settings stay open), Use closes them, and the next tap on the water throws it.
    if (await page.evaluate(() => document.getElementById('settings').hidden)) {
      await press('#thing-chip');
      await page.waitForTimeout(300);
      await press('#thing-more');
      await page.waitForTimeout(400);
    }
    const onPage = await page.evaluate(() => !document.querySelector('.menu-page[data-page="thing"]').hidden && document.getElementById('thing-menu').hidden);
    check(onPage, `the dropdown's foot opens What to throw at once (${onPage ? 'its page' : 'not it'})`);
    await page.evaluate((value) => { document.querySelector(`#thing [data-value="${value}"]`).closest('details').open = true; }, choice);
    await page.waitForTimeout(80);
    if (choice === 'bowling') await page.screenshot({ path: path.join(outputFolder, `${framing.name}-throw.png`) });
    await press(`#thing [data-value="${choice}"]`);
    await page.waitForTimeout(100);
    const inspected = await page.evaluate(() => ({ open: !document.getElementById('settings').hidden, name: document.getElementById('inspect-name').textContent, stats: document.getElementById('inspect-stats').textContent, badges: [...document.querySelectorAll('#inspect-badges span')].map((badge) => badge.textContent), use: document.getElementById('thing-use').textContent }));
    check(inspected.open && inspected.name === expected.row && inspected.badges.some((badge) => badge === 'Floats' || badge === 'Sinks') && inspected.use.toLowerCase().includes(expected.row.toLowerCase()),
      `${choice} chosen stays open to look over: ${inspected.name}, ${inspected.stats}, ${inspected.badges.join(', ')}; "${inspected.use}"`);
    if (choice === 'basketball') await page.screenshot({ path: path.join(outputFolder, `${framing.name}-inspect.png`) });
    await press('#thing-use');
    await page.waitForTimeout(100);
    const shown = await strip();
    const wrong = Object.entries(expected).filter(([key, value]) => shown[key] !== value).map(([key]) => `${key} ${JSON.stringify(shown[key])}`);
    check(shown.thing === choice && wrong.length === 0 && !shown.overflows, `${choice} is thrown, its row, the strip's name, slider and readout follow (${shown.label}, ${shown.readout}${shown.disabled ? ', slider off' : `, ${shown.minimum} to ${shown.maximum}`})${wrong.length ? `; wrong: ${wrong.join(', ')}` : ''}${shown.overflows ? '; the strip overflows' : ''}`);
    const thrown = await page.evaluate(() => ({ closed: document.getElementById('settings').hidden, before: window.__pond.rocks.length }));
    await press('#pond');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ count: window.__pond.rocks.length, thing: window.__pond.rocks.at(-1)?.thing.key }));
    check(thrown.closed && after.count === thrown.before + 1 && after.thing === choice, `Use ${choice} closes the settings, and the next tap on the water throws it (${thrown.closed ? 'closed' : 'still open'}; ${after.count - thrown.before} thrown, ${after.thing})`);
  }
  // What was used lately sits at the top of What to throw, a tap each: it throws at once (the settings close).
  await press('#thing-chip');
  await page.waitForTimeout(300);
  await press('#thing-more');
  await page.waitForTimeout(400);
  const quick = await page.evaluate(() => [...document.querySelectorAll('#thing-quick button')].map((button) => button.dataset.value));
  if (quick.includes('pizza')) await press('#thing-quick [data-value="pizza"]');
  await page.waitForTimeout(150);
  const quickPicked = await page.evaluate(() => ({ thing: window.__pond.thing, closed: document.getElementById('settings').hidden }));
  check(quick.length >= 4 && quick.includes('pizza') && quickPicked.thing === 'pizza' && quickPicked.closed, `the latest choices sit at the top (${quick.join(', ')}), and one tapped is thrown at once (${quickPicked.thing}, ${quickPicked.closed ? 'closed' : 'open'})`);
  // What to throw opened from the chip (the dropdown's foot): the chip pressed again closes it (its press is not one outside
  // the panel, src/settingsPanel.js), where the open panel leaves it uncovered; where the panel covers it, its ‹ closes it.
  await press('#thing-chip');
  await page.waitForTimeout(300);
  await press('#thing-more');
  await page.waitForTimeout(400);
  const chipOpen = await page.evaluate(() => {
    const chip = document.getElementById('thing-chip');
    const box = chip.getBoundingClientRect();
    return { opened: !document.getElementById('settings').hidden, uncovered: chip.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)) };
  });
  if (chipOpen.uncovered) {
    await press('#thing-chip');
    await page.waitForTimeout(150);
    const chipClosed = await page.evaluate(() => ({ closed: document.getElementById('settings').hidden, expanded: document.getElementById('thing-chip').getAttribute('aria-expanded') }));
    check(chipOpen.opened && chipClosed.closed && chipClosed.expanded === 'false', `the chip pressed again closes What to throw (${chipOpen.opened ? 'opened' : 'did not open'}, then ${chipClosed.closed ? 'closed' : 'still open'}, aria-expanded ${chipClosed.expanded})`);
  } else {
    console.log('  (the open panel covers the chip here: its ‹ closes it)');
    await page.evaluate(() => document.querySelector('.menu-page[data-page="thing"] .menu-back')?.click());
    await page.waitForTimeout(150);
  }
  // Skip turns on for a pizza (it skips, src/things.js).
  await page.evaluate(() => document.querySelector('#manner [data-value="skip"]').click());
  await page.waitForTimeout(100);
  const pizzaSkips = await page.evaluate(() => ({ skipping: window.__pond.skipping, pressed: document.querySelector('#manner [aria-pressed="true"]')?.dataset.value }));
  check(pizzaSkips.skipping && pizzaSkips.pressed === 'skip', `Skip pressed with a pizza turns on (${pizzaSkips.skipping ? 'on' : 'off'}, ${pizzaSkips.pressed} chosen)`);
  // The pie chosen as a user does, its card and Use (the page's controls follow it; __pond.setThing alone leaves them):
  // it cannot skip, so the manner goes back to Toss, and Skip, pressed, stays off and says why.
  await page.evaluate(() => {
    const card = document.querySelector('#thing [data-value="pie"]');
    card.closest('details').open = true;
    card.click();
    document.getElementById('thing-use').click();
  });
  await page.waitForTimeout(100);
  const pieKind = await page.evaluate(() => ({ skipping: window.__pond.skipping, pressed: document.querySelector('#manner [aria-pressed="true"]')?.dataset.value }));
  await page.evaluate(() => document.querySelector('#manner [data-value="skip"]').click());   // off (aria-disabled), so a tap is the page's to answer
  await page.waitForTimeout(100);
  const skipHint = await page.evaluate(() => ({ skipping: window.__pond.skipping, pressed: document.querySelector('#manner [aria-pressed="true"]')?.dataset.value, shown: !document.getElementById('hint').hidden, text: document.getElementById('hint').textContent }));
  check(!pieKind.skipping && pieKind.pressed === 'toss' && !skipHint.skipping && skipHint.pressed === 'toss' && skipHint.shown && skipHint.text.startsWith('A pie does not skip'),
    `a pie chosen while skipping goes back to Toss (${pieKind.pressed}), and Skip pressed with it stays off and says why ("${skipHint.text}")`);
  // Arrow keys cross from one fold into the next (src/settingsPanel.js radioGroup): the next fold opens, the focus moves into
  // it and the next press carries on from there.
  await press('#menu-button');
  await page.waitForTimeout(400);
  await press('#settings .menu-tier[data-open="thing"]');
  await page.waitForTimeout(400);
  const keyed = [];
  await page.evaluate(() => { const cards = document.querySelectorAll('.menu-group[data-group="Stones"] [role="radio"]'); cards[cards.length - 1].click(); });
  if (await page.evaluate(() => document.getElementById('settings').hidden)) {
    await press('#menu-button');
    await page.waitForTimeout(400);
    await press('#settings .menu-tier[data-open="thing"]');
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => { const cards = document.querySelectorAll('.menu-group[data-group="Stones"] [role="radio"]'); cards[cards.length - 1].focus(); });
  const order = await page.evaluate(() => [...document.querySelectorAll('#thing [role="radio"]')].map((card) => card.dataset.value));
  const start = order.indexOf(await page.evaluate(() => window.__pond.thing));
  for (let pressCount = 0; pressCount < 2; pressCount++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    keyed.push(await page.evaluate(() => ({ thing: window.__pond.thing, focused: document.activeElement?.dataset?.value, open: [...document.querySelectorAll('#thing .menu-group[open]')].map((fold) => fold.dataset.group) })));
  }
  const keyedRight = keyed.every((step, stepIndex) => step.thing === order[start + 1 + stepIndex] && step.focused === step.thing && step.open.length === 1 && step.open[0] === 'Balls');
  check(keyedRight, `ArrowDown from the last stone opens Balls and moves the focus into it, and the next press carries on (${keyed.map((step) => `${step.thing}, focus ${step.focused}, open ${step.open.join('+')}`).join('; ')})`);
  await page.evaluate(() => document.querySelector('#thing [data-value="stone"]').click());   // the river stone again; the click closes the settings
  if (!(await page.evaluate(() => document.getElementById('settings').hidden))) await press('#menu-button');
  await page.waitForTimeout(400);
  // Back to the list for the next pages.
  await press('#menu-button');
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
  const timeButtons = await page.locator('#time-presets button').evaluateAll((buttons) => buttons.map((button) => ({ height: button.getBoundingClientRect().height, fits: button.scrollWidth <= button.clientWidth })));
  check(timeButtons.length === 4 && timeButtons.every((button) => button.height >= 44 && button.fits), 'the four named time buttons fit their labels and have 44 px touch targets');
  await press('#time-presets [data-hour="afternoon"]');
  await page.waitForFunction(() => window.__pond.hour === 'afternoon' && document.getElementById('time-name').textContent === 'Afternoon', null, { timeout: 60000 });
  check(await page.locator('#time-presets [data-hour="afternoon"]').getAttribute('aria-pressed') === 'true' && await page.locator('#time-presets [aria-pressed="true"]').count() === 1, 'a named hour changes the scene, readout and selected button together');
  await press('.menu-page[data-page="time"] .menu-back');
  await page.waitForTimeout(400);
  await press('#settings .menu-tier[data-open="sky"]');
  await page.waitForTimeout(400);
  await press('#sky [data-value="cove"]');
  await page.waitForFunction(() => window.__pond.sky === 'cove' && document.querySelector('.menu-tier[data-open="time"] .menu-tier-value').textContent === 'Morning', null, { timeout: 60000 }).catch(() => {});
  const lone = await page.evaluate(() => ({ hidden: document.getElementById('time').hidden, note: document.getElementById('time-note').textContent, row: document.querySelector('.menu-tier[data-open="time"] .menu-tier-value').textContent }));
  check(lone.hidden && lone.note.includes('single photograph') && lone.row === 'Morning', `under the cove's lone photograph the slider hides, the row reads "${lone.row}" and the note "${lone.note}"`);
  check(await page.locator('#time-presets').isHidden(), 'a single-hour location hides the named time buttons too');
  // The Pool: the rocks in the pool (the View note follows), and the Water page shows its own water in place of the lake's.
  await press('#sky [data-value="pool"]');
  await page.waitForFunction(() => window.__pond.sky === 'pool' && !document.querySelector('.menu-tier[data-open="sky"] .menu-tier-value').textContent.endsWith('\u2026'), null, { timeout: 60000 }).catch(() => {});
  const pooled = await page.evaluate(() => ({
    sky: window.__pond.sky, pooled: window.__pond.pooled, clarity: window.__pond.clarity, row: document.querySelector('.menu-tier[data-open="sky"] .menu-tier-value').textContent,
    water: document.querySelector('.menu-tier[data-open="water"] .menu-tier-value').textContent, viewNote: document.getElementById('view-note').textContent,
    cards: [...document.querySelectorAll('#water [role="radio"]:not([hidden])')].map((card) => card.dataset.value),
  }));
  check(pooled.pooled && pooled.clarity === 'pool' && pooled.row === 'Pool' && pooled.water === 'Pool water' && pooled.viewNote.includes('pool') && pooled.cards.join() === 'open,frozen',
    `Pool puts the rocks in the pool (${pooled.sky}, its water ${pooled.clarity}), the rows read "${pooled.row}" and "${pooled.water}", the View note "${pooled.viewNote}", the Water page offers ${pooled.cards.join(', ')}`);
  await press('#sky [data-value="lakeside"]');
  await page.waitForFunction(() => window.__pond.sky === 'lakeside', null, { timeout: 60000 }).catch(() => {});
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
    // Skip left on for stones moves nothing of a ball's throw (review: a far tap in the pool aimed a basketball 2 m further).
    await page.evaluate(async () => { await window.__pond.setSky('pool'); window.__pond.setThing('basketball'); });
    await page.waitForTimeout(300);
    const tapThrow = async (skip) => {
      await page.evaluate((on) => window.__pond.setSkip(on), skip);
      await page.mouse.click(layout.screenWidth * 0.5 / layout.scale, layout.screenHeight * 0.21 / layout.scale);
      await page.waitForTimeout(50);
      return page.evaluate(() => { const rock = window.__pond.rocks.at(-1); return { thing: rock?.thing.key, velocity: rock ? [rock.velocity.x, rock.velocity.y, rock.velocity.z] : null, skip: Boolean(rock?.skip) }; });
    };
    const skipOff = await tapThrow(false), skipOn = await tapThrow(true);
    const apart = skipOff.velocity && skipOn.velocity ? Math.hypot(...skipOff.velocity.map((value, index) => value - skipOn.velocity[index])) : Infinity;
    check(skipOff.thing === 'basketball' && skipOn.thing === 'basketball' && !skipOn.skip && apart < 0.05, `a basketball tapped at the far pool is thrown alike with Skip off and left on for stones (${apart.toFixed(3)} m/s apart, ${skipOn.skip ? 'skipping' : 'not skipping'})`);
    await page.evaluate(async () => { window.__pond.setSkip(false); await window.__pond.setSky('lakeside'); window.__pond.setThing('stone'); });
    // A thing defined from outside, sized by its diameter, keeps its own size (review: it took the stones' 6 cm).
    const sized = await page.evaluate(() => {
      const pond = window.__pond;
      pond.setSize(6);
      pond.defineThing('probe-foam-ball', {
        name: 'Foam ball', group: 'Test', note: 'Defined by the probe',
        body: { shape: 'sphere', density: 100, size: { by: 'diameter', unit: 'cm', min: 20, max: 80, step: 1, initial: 40 } },
        material: { bounce: [0.5, 0.6], friction: 0.5 }, water: { restingHeight: 0.97 }, look: { mesh: 'ball', paint: 'plain', color: [240, 200, 40] },
      });
      pond.setThing('probe-foam-ball');
      const own = pond.size;
      const thrown = pond.throwAt(0, -1.4).radius;
      const asked = pond.throwAt(0, -1.4, { size: 60 }).radius;
      pond.setSize(500);
      const clamped = pond.size;
      pond.setThing('stone');
      return { own, thrown, asked, clamped, stone: pond.size };
    });
    check(sized.own === 40 && Math.abs(sized.thrown - 0.2) < 1e-9 && Math.abs(sized.asked - 0.3) < 1e-9 && sized.clamped === 80 && sized.stone === 6,
      `a foam ball defined from outside, 20 to 80 cm, is thrown at its own 40 cm (${(200 * sized.thrown).toFixed(1)}), at 60 when asked (${(200 * sized.asked).toFixed(1)}), its slider kept to 80 (${sized.clamped}); the stones keep 6 cm (${sized.stone})`);
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
    check(dragged.azimuth < azimuthBefore - 1 && dragged.rocks === rocksBefore && !!resetButton && onScreen(resetButton) && !overlaps(resetButton, menuButton),
      `a finger dragged 120 px across the water turns the view ${(azimuthBefore - dragged.azimuth).toFixed(1)}° and throws ${dragged.rocks - rocksBefore} rocks; Reset view is on the screen, clear of the settings button`);
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
