// Browser probe: a seeded game goes alike at any frame rate. The world steps
// on its own fixed clock (src/main.js simulate: PHYSICS_STEP steps, and at
// each step's end endStep: the ice's pieces made and unmade, the fish's own
// steps, what fades, what a hole's new ice freezes in, what loses its ground,
// what goes too far, the caps); the splash draws what it plays frame by frame
// from its own stream (src/splashRandom.js), never Math.random, so a later
// throw's seed (src/rock.js `random`, drawn from Math.random) is the same
// however many frames came before it.
//
// Each scene below is played twice from the same start: the page's Math.random
// seeded once (Park–Miller, as tools/shoot.mjs seeds it), the place's fish as
// they start (__pond.restartFish), throws at set moments of the world's time,
// then left to a set time. Once in frames of 1/60 s; once in frames of 1/60,
// 1/45, 1/120 and 1/50 s over and over (as tools/jet-probe.mjs steps the jet),
// each run of them cut short to land on the next throw. Nothing is drawn
// (__pond.stepFrames): the floaters' ride is read back from the drawn water a
// frame or two late by design (src/floaterRide.js), so it is left out. At the
// end every thing thrown or kept (its kind, state, place, turn and whether it
// is kept, fading or gone, and when on the world's clock it began to fade),
// every fish (place and heading), the ice's holes and the next draw of
// Math.random must be the same, exactly. The scenes:
//   - lakeside: a stone, a pizza, an apple, a basketball and a skipped stone
//     among the fish, then fourteen tennis balls, more than Low keeps afloat
//     (keepWithinCaps fades the oldest);
//   - thin ice: a bowling ball through it, a stone into its hole, a brick
//     slid over the ice, a pebble onto a shard (the pieces let go, split and
//     frozen in at the steps' ends);
//   - koi: a pizza, a slice of bread and a stone among the koi, who eat;
//   - pool: a basketball, a skipped stone and twenty-two stones in the
//     pool's walls, more than Low keeps at rest, so the oldest fades as one
//     comes to rest past the cap, between throws.
// Prints each scene's comparison and exits with status 1 if any differs.
//
//   node tools/frame-rate-probe.mjs [--scene=koi,pool]   (only these scenes, in this order)
import { launchBrowser } from './browser.mjs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNEVEN = [1 / 60, 1 / 45, 1 / 120, 1 / 50];
const SEED = 4242;

const SCENES = [
  {
    name: 'lakeside', place: 'lakeside', ice: 'none', until: 16,
    throws: [
      { at: 0, x: 0, z: -1.4, thing: 'stone' },
      { at: 0.8, x: 0.5, z: -1.6, thing: 'pizza' },
      { at: 1.6, x: -0.4, z: -1.2, thing: 'apple' },
      { at: 2.4, x: 0.2, z: -2.0, thing: 'basketball' },
      { at: 3.2, x: -0.6, z: -2.2, thing: 'stone', manner: 'skip' },
      ...Array.from({ length: 14 }, (unused, index) => ({ at: 4 + 0.35 * index, x: -0.9 + 0.13 * index, z: -1.0 - 0.09 * index, thing: 'tennis' })),
    ],
  },
  {
    name: 'thin ice', place: 'lakeside', ice: 'thin', until: 12,
    throws: [
      { at: 0, x: 0, z: -1.5, thing: 'bowling' },
      { at: 2.0, x: 0.05, z: -1.5, thing: 'stone' },
      { at: 3.0, x: 0.7, z: -1.1, thing: 'brick' },
      { at: 4.0, x: -0.1, z: -1.45, thing: 'stone', size: 0.02 },
    ],
  },
  {
    name: 'koi', place: 'koi', ice: 'none', until: 24,
    throws: [
      { at: 0, x: 0.3, z: -1.2, thing: 'pizza' },
      { at: 0.6, x: -0.5, z: -1.5, thing: 'bread' },
      { at: 1.5, x: 0.1, z: -0.8, thing: 'stone' },
    ],
  },
  {
    name: 'pool', place: 'pool', ice: 'none', until: 14,
    throws: [
      { at: 0, x: -0.3, z: -1.4, thing: 'basketball' },
      { at: 0.5, x: 0.2, z: -1.3, thing: 'stone', manner: 'skip' },
      // More than Low keeps at rest (20): the one that comes to rest past it, between throws, fades the oldest.
      ...Array.from({ length: 22 }, (unused, index) => ({ at: 1 + 0.25 * index, x: -0.5 + 0.045 * index, z: -0.9 - 0.035 * index, thing: 'stone' })),
    ],
  },
];

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
const context = await browser.newContext({ viewport: { width: 480, height: 320 } });
await context.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
  const relative = new URL(route.request().url()).pathname.replace('/npm/three@0.183.2/', '');
  try { await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path.join(root, 'node_modules/three', relative)) }); } catch { await route.fulfill({ status: 404, body: '' }); }
});
await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(String(error)));
await page.goto(`http://localhost:${server.address().port}/index.html?quality=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__pond, { timeout: 120000 });
await page.evaluate(() => window.__pond.pause());

const failures = [];
const check = (ok, message) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failures.push(message); };

/** One scene played in frames cycling through `pattern` (s), from the same start: what it ends as. */
async function play(scene, pattern) {
  await page.evaluate(async ({ place, ice }) => {
    const pond = window.__pond;
    if (pond.sky !== place) await pond.setSky(place);
    pond.setIce(ice);
  }, scene);
  return page.evaluate(({ scene, pattern, seed }) => {
    const pond = window.__pond;
    pond.clear();
    pond.restartFish();
    const random = Math.random;
    let state = seed;
    Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
    let now = 0, frame = 0;
    const thrown = [];
    // Frames of the pattern up to `time`, the last cut short to land on it.
    const playTo = (time) => {
      const frames = [];
      while (now < time - 1e-9) {
        const seconds = Math.min(pattern[frame++ % pattern.length], time - now);
        frames.push(seconds);
        now += seconds;
      }
      pond.stepFrames(frames);
    };
    try {
      for (const { at, x, z, thing, manner, size } of scene.throws) {
        playTo(at);
        thrown.push(pond.throwAt(x, z, { thing, ...(manner ? { manner } : {}), ...(size ? { radius: size } : {}) }));
      }
      playTo(scene.until);
      // Every thing thrown, gone or not (one that faded is frozen where it was when it began to: the step it began
      // shows), then what else is kept (the ice's shards).
      const things = [...new Set([...thrown, ...pond.rocks])].map((rock) => [rock.thing.name, rock.state, pond.rocks.includes(rock) ? (rock.fading !== undefined ? 'fading' : 'kept') : 'gone', rock.fadedAt ?? -1, ...rock.position.toArray(), ...rock.quaternion.toArray()]);
      const fish = pond.fish.fish.map((one) => [one.x, one.y, one.z, one.heading]);
      return { things, fish, holes: pond.iceSheet.holes.length, next: Math.random(), frames: frame };
    } finally {
      Math.random = random;
    }
  }, { scene, pattern, seed: SEED });
}

/** How two ends of a scene differ: the most any number of theirs is apart, and what does not match at all. */
function compare(steady, uneven) {
  let most = 0, where = '';
  const unlike = [];
  const numbers = (one, other, what) => {
    if (one.length !== other.length) { unlike.push(`${what}: ${one.length} against ${other.length}`); return; }
    one.forEach((row, index) => row.forEach((value, column) => {
      const twin = other[index][column];
      if (typeof value !== 'number') { if (value !== twin) unlike.push(`${what} ${index}: ${value} against ${twin}`); return; }
      if (Math.abs(value - twin) > most) { most = Math.abs(value - twin); where = `${what} ${index} (${row.filter((entry) => typeof entry !== 'number').join(', ') || 'fish'})`; }
    }));
  };
  numbers(steady.things, uneven.things, 'things');
  numbers(steady.fish, uneven.fish, 'fish');
  if (steady.holes !== uneven.holes) unlike.push(`holes: ${steady.holes} against ${uneven.holes}`);
  if (steady.next !== uneven.next) unlike.push(`the next Math.random: ${steady.next} against ${uneven.next}`);
  return { most, where, unlike };
}

const only = process.argv.find((argument) => argument.startsWith('--scene='))?.slice('--scene='.length);
for (const scene of only ? only.split(',').map((name) => SCENES.find((candidate) => candidate.name === name)) : SCENES) {
  const started = Date.now();
  const steady = await play(scene, [1 / 60]);
  const uneven = await play(scene, UNEVEN);
  const { most, where, unlike } = compare(steady, uneven);
  const count = (kind) => steady.things.filter((thing) => thing[2] === kind).length;
  console.log(`${scene.name}: ${scene.throws.length} throws, ${scene.until} s; ${count('kept')} things kept, ${count('fading')} fading, ${count('gone')} gone; ${steady.fish.length} fish, ${steady.holes} holes; ${steady.frames} frames against ${uneven.frames} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  check(unlike.length === 0 && most === 0, `${scene.name} ends the same in frames of 1/60 s and of ${UNEVEN.map((seconds) => `1/${Math.round(1 / seconds)}`).join(', ')} s (most apart ${most.toExponential(1)}${most ? `, ${where}` : ''}${unlike.length ? `; ${unlike.slice(0, 4).join('; ')}` : ''})`);
}
check(problems.length === 0, `no page errors${problems.length ? `: ${problems.slice(0, 3).join(' | ')}` : ''}`);

await browser.close();
server.close();
if (failures.length) {
  console.log(`\nframe-rate-probe: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nframe-rate-probe: all checks pass');
