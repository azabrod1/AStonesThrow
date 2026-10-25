// Browser probe: the hand takes a thing in any state it is in, and lets it go
// anywhere, clean (src/rock.js setState: leaving a state lets go of what only
// that state keeps; hold, release). Through the page's own hold, carry and
// let go (__pond.holdThing, carryHeld, letGo: src/objectGrab.js begin, move,
// end, with src/main.js constrainGrab as a drag has it), seeded throws are
// caught in each state and checked:
//   - as it is taken: held, and none of another state's left over: no slide
//     (`sliding`), no settling onto a face (`settling`), no skip's contact,
//     no fall through the ice to come (`fallsThrough`), not on the ground or
//     afloat, not fading;
//   - held for HOLD_SECONDS while the world steps: still held, never fading
//     or lost (in the Koi pond's planting too);
//   - let go, then left for SETTLE_SECONDS: kept (not faded or lost), its
//     place a number, never under the bed (its lowest point at least
//     BED_SLACK into it, as far as a stone settles into the sand).
// The states: in the air, skimming (a skip's touch), going in (under the
// water, sinking), at rest on the lake's bed, afloat and at rest afloat
// (a pizza), sliding on thick ice and settling on it (a brick taken as it
// tips and let fall still: nothing thrown settles there), a piece of ice set
// in the sheet it broke from and one afloat (thin ice), in the pool, and in
// the Koi pond's planting. Each is let go over a surface of its own: the
// water, the ice, a hole in it, the pool's deck, the garden's bank. Prints
// one line a check and exits with status 1 if any fails.
//
//   node tools/grab-probe.mjs
import { launchBrowser } from './browser.mjs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOLD_SECONDS = 2;
const SETTLE_SECONDS = 5;
const BED_SLACK = 0.012;   // m: a stone thrown settles 6 to 7 mm into the lake's sand (src/cavity.js sinkStep)

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
const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
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

// Each catch: where (the place and its water), what is thrown and how, the state it is caught in (stepped in frames of
// 1/240 s until it is in it, `when` picking among such things), and where it is let go.
const CATCHES = [
  { name: 'a stone in the air', place: 'lakeside', ice: 'none', thing: 'stone', aim: [0, -1.4], state: 'air', after: 0.15, letGo: [0.3, 0.3, -1.6] },
  { name: 'a stone skimming', place: 'lakeside', ice: 'none', thing: 'stone', manner: 'skip', aim: [0, -1.6], state: 'skim', letGo: [-0.4, 0.2, -1.4] },
  { name: 'a stone going in', place: 'lakeside', ice: 'none', thing: 'stone', aim: [0, -1.4], state: 'water', letGo: [0.2, -0.1, -1.2] },
  { name: 'a stone at rest on the bed', place: 'lakeside', ice: 'none', thing: 'stone', aim: [0.2, -1.2], state: 'rest', letGo: [0.4, 0.3, -1.0] },
  { name: 'a pizza afloat', place: 'lakeside', ice: 'none', thing: 'pizza', aim: [0, -1.5], state: 'float', letGo: [-0.3, 0.2, -1.8] },
  { name: 'a pizza at rest afloat', place: 'lakeside', ice: 'none', thing: 'pizza', aim: [0.3, -1.5], state: 'rest', letGo: [0.1, -0.2, -1.6] },
  { name: 'a brick sliding on thick ice', place: 'lakeside', ice: 'thick', thing: 'brick', aim: [0, -1.4], state: 'ground', sliding: true, letGo: [0.4, 0.4, -1.2] },
  // Nothing thrown settles on the ice (it tips onto its face as it slides): one let fall still and tipped does.
  { name: 'a brick settling on thick ice', place: 'lakeside', ice: 'thick', thing: 'brick', aim: [0.3, -1.5], dropFrom: { state: 'ground', sliding: true, to: [0.3, 0.1, -1.3] }, state: 'rest', settling: true, letGo: [-0.3, 0.3, -1.4] },
  { name: 'a piece of thin ice set in the sheet', place: 'lakeside', ice: 'thin', thing: 'bowling', aim: [0, -1.5], state: 'set', piece: true, letGo: 'hole' },
  { name: 'a piece of thin ice afloat', place: 'lakeside', ice: 'thin', thing: 'bowling', aim: [0.2, -1.4], state: 'float', piece: true, letGo: 'hole' },
  { name: 'a stone on the pool\'s floor', place: 'pool', ice: 'none', thing: 'stone', aim: [0, -1.2], state: 'rest', letGo: 'deck' },
  { name: 'a ball in the Koi pond, carried into the planting', place: 'koi', ice: 'none', thing: 'tennis', aim: [0.2, -1.2], state: 'float', letGo: 'planting' },
];

for (const caught of CATCHES) {
  await page.evaluate(async ({ place, ice }) => {
    const pond = window.__pond;
    if (pond.sky !== place) await pond.setSky(place);
    pond.setIce(ice);
  }, caught);
  const result = await page.evaluate(({ caught, hold, settle }) => {
    const pond = window.__pond;
    pond.clear();
    const random = Math.random;
    let state = 99;
    Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
    try {
      const thrown = pond.throwAt(caught.aim[0], caught.aim[1], { thing: caught.thing, ...(caught.manner ? { manner: caught.manner } : {}) });
      const wanted = (rock) => rock.state === caught.state && (!caught.piece || rock.piece) && (!caught.sliding || rock.sliding) && (!caught.settling || rock.settling);
      let target = null, time = 0;
      if (caught.dropFrom) {
        // Taken as it is then (tipped part way, sliding) and let fall from where it is carried to.
        const { state: from, sliding, to } = caught.dropFrom;
        for (; time < 20 && !(thrown.state === from && (!sliding || thrown.sliding)); time += 1 / 240) pond.stepFrames([1 / 240]);
        pond.holdThing(thrown);
        for (let step = 1; step <= 10; step++) pond.carryHeld(...to);
        pond.letGo();
      }
      for (; time < 20 && !target; time += 1 / 240) {
        pond.stepFrames([1 / 240]);
        if (time < (caught.after ?? 0)) continue;
        target = caught.piece ? pond.rocks.find(wanted) : wanted(thrown) ? thrown : null;
      }
      if (!target) return { caught: false, time, stateNow: thrown.state };
      const before = { state: target.state, sliding: Boolean(target.sliding), settling: Boolean(target.settling) };
      pond.holdThing(target);
      const taken = {
        held: pond.grabbed === target && target.state === 'held',
        leftOver: ['sliding', 'settling', 'fallsThrough'].filter((field) => target[field]).concat(target.skip?.contact ? ['skip contact'] : [], target.onGround ? ['onGround'] : [], target.afloat ? ['afloat'] : [], target.fading !== undefined ? ['fading'] : []),
      };
      // Where it is let go: a point given, or over a hole in the ice, the pool's deck, or deep in the Koi pond's planting.
      let to = caught.letGo;
      if (to === 'hole') { const hole = pond.iceSheet.holes[0]; to = [hole.x + 0.02, 0.1, hole.z]; }
      else if (to === 'deck') to = [pond.poolSquare.minX - 0.25, 0.3, pond.poolSquare.minZ + 0.5 * pond.poolSquare.size];
      else if (to === 'planting') to = [0, 0.3, -1.2 - 4.6];
      const steps = Math.round(hold * 60);
      for (let step = 1; step <= steps; step++) {
        const share = step / steps;
        pond.carryHeld(target.position.x + (to[0] - target.position.x) * share, target.position.y + (to[1] - target.position.y) * share, target.position.z + (to[2] - target.position.z) * share);
        pond.stepFrames([1 / 60]);
      }
      const whileHeld = { held: pond.grabbed === target && target.state === 'held', kept: pond.rocks.includes(target), fading: target.fading !== undefined, lost: Boolean(target.lostInGarden) };
      const heldAt = target.position.toArray();
      pond.letGo();
      const afterLetGo = target.state;
      pond.stepFrames(Array(Math.round(settle * 60)).fill(1 / 60));
      const { x, y, z } = target.position;
      const lowest = y + target.lowestOffset();
      const bed = -pond.bedDepthAt(x, z);
      return {
        caught: true, time, before, taken, whileHeld, heldAt, afterLetGo,
        after: { state: target.state, kept: pond.rocks.includes(target), fading: target.fading !== undefined, finite: [x, y, z].every(Number.isFinite), lowest, bed, x, y, z },
      };
    } finally {
      Math.random = random;
    }
  }, { caught, hold: HOLD_SECONDS, settle: SETTLE_SECONDS });
  console.log(`${caught.name}:`);
  if (!result.caught) { check(false, `caught ${caught.state} (never in it in 20 s; ${result.stateNow} at the end)`); continue; }
  const { before, taken, whileHeld, after } = result;
  check(taken.held && taken.leftOver.length === 0, `taken ${before.state}${before.sliding ? ' (sliding)' : ''}${before.settling ? ' (settling)' : ''} at ${result.time.toFixed(2)} s: held, with nothing of it left over${taken.leftOver.length ? ` (${taken.leftOver.join(', ')})` : ''}`);
  check(whileHeld.held && whileHeld.kept && !whileHeld.fading && !whileHeld.lost, `held ${HOLD_SECONDS} s while carried to (${result.heldAt.map((value) => value.toFixed(2)).join(', ')}): still held, never fading or lost${whileHeld.lost ? ' (lost in the garden)' : ''}${whileHeld.fading ? ' (fading)' : ''}`);
  check(after.kept && !after.fading && after.finite && after.lowest >= after.bed - BED_SLACK,
    `let go (${result.afterLetGo}), ${SETTLE_SECONDS} s on: kept, ${after.state} at (${after.x.toFixed(2)}, ${after.y.toFixed(3)}, ${after.z.toFixed(2)}), its lowest ${(1000 * (after.lowest - after.bed)).toFixed(1)} mm over the bed${after.fading ? ', fading' : ''}${after.kept ? '' : ', gone'}`);
}
check(problems.length === 0, `no page errors${problems.length ? `: ${problems.slice(0, 3).join(' | ')}` : ''}`);

await browser.close();
server.close();
if (failures.length) {
  console.log(`\ngrab-probe: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\ngrab-probe: all checks pass');
