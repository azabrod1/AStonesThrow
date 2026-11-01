// Checks whatever is out on Loch Ness (src/lochVisitor.js) on the CPU, with
// no browser: its schedule, its reach and its motion.
//
// - Over two hours of the loch with nothing thrown, it comes up: the first
//   time within SCHEDULE.first of arriving, then every SCHEDULE.between
//   after the last has gone, every form in turn and never one twice running.
// - Out of reach: no point of its body, as posed every frame of every
//   sighting, comes nearer the shore's eye than SCHEDULE.nearest, past
//   where anything thrown can go (src/main.js FARTHEST_AWAY, 30 m).
// - A thing out near its course holds a sighting back; one that comes
//   within SCHEDULE.startle of a sighting under way sends it down at once,
//   and it is all under the water within STARTLED_DIVE and its body's lag.
// - Ice or a gale (the step's `open` false): nothing comes up.
// - It goes alike at any frame rate: the pose at a moment is the same
//   whether the frames before it came at 30, 60 or 144 a second, and the
//   schedule, which the physics steps keep, is the same too.
// - Its frame's work (the pose, the skin and its normals) stays under
//   FRAME_BUDGET milliseconds on this machine.
//
//   node tools/visitor-probe.mjs
import { createHash } from 'node:crypto';
import { LochVisitor, SCHEDULE } from '../src/lochVisitor.js';

const STEP = 1 / 240;          // src/rock.js PHYSICS_STEP
const FARTHEST_AWAY = 30;      // src/main.js: a floater past this from the pond goes
const FRAME_BUDGET = 1.5;      // ms for a frame's pose
const EYE = { x: 0, z: 2.45 };
let failures = 0;
const check = (ok, message) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failures++; };

const makeVisitor = () => {
  const visitor = new LochVisitor({ envTexture: null, waterFog: { extinction: null, color: null }, mirrorLayer: 1 });
  visitor.setPlace(true);
  return visitor;
};

/** Run the loch for `seconds`, frames every `frame` s; `things(time)` lists what is thrown; `open(time)` the water's state. */
function run(seconds, { frame = 1 / 60, things = () => [], open = () => true, onFrame = () => {} } = {}) {
  const visitor = makeVisitor();
  const sightings = [];
  let time = 0, steps = 0;
  while (time < seconds) {
    const end = time + frame;
    while (steps * STEP < end - 1e-12) {
      steps++;
      const before = visitor.sighting;
      visitor.step(steps * STEP, things(steps * STEP), { open: open(steps * STEP), near: false });
      if (visitor.sighting && visitor.sighting !== before) sightings.push({ ...visitor.sighting, at: steps * STEP });
    }
    time = end;
    visitor.showAt(time);
    onFrame(visitor, time);
  }
  return { visitor, sightings };
}

// The schedule, with nothing thrown.
{
  let nearest = Infinity, shownFrames = 0, worstFrame = 0;
  const { sightings } = run(2 * 3600, {
    frame: 1 / 30,
    onFrame(visitor) {
      if (!visitor.above.visible && !visitor.below.visible) return;
      shownFrames++;
      for (const knot of visitor.spine) nearest = Math.min(nearest, Math.hypot(knot.point.x - EYE.x, knot.point.z - EYE.z) - knot.radius);
    },
  });
  check(sightings.length >= 40, `two hours: ${sightings.length} sightings`);
  check(sightings[0].at >= SCHEDULE.first[0] && sightings[0].at <= SCHEDULE.first[1], `the first comes ${sightings[0].at.toFixed(1)} s after arriving`);
  let gapsKept = true, repeats = 0;
  for (let index = 1; index < sightings.length; index++) {
    const previous = sightings[index - 1];
    const gap = sightings[index].at - (previous.sinkStart + previous.sinkSeconds + SCHEDULE.linger);
    if (gap < SCHEDULE.between[0] - STEP || gap > SCHEDULE.between[1] + STEP) gapsKept = false;
    if (sightings[index].form === previous.form) repeats++;
  }
  check(gapsKept, `each comes ${SCHEDULE.between[0]} to ${SCHEDULE.between[1]} s after the last has gone`);
  check(repeats === 0, 'never the same form twice running');
  const forms = new Set(sightings.map((sighting) => sighting.form));
  check(forms.size === 4, `every form comes: ${[...forms].join(', ')}`);
  check(nearest >= SCHEDULE.nearest && nearest > FARTHEST_AWAY, `out of reach: its body never nearer the eye than ${nearest.toFixed(1)} m (in ${shownFrames} frames shown)`);
  // A frame's work, timed over a sighting.
  const visitor = makeVisitor();
  visitor.step(0, [], { open: true, near: false });
  visitor.summon(0, 'neck', { elapsed: 8 });
  let posed = 0;
  const started = performance.now();
  for (let index = 0; index < 600; index++) { visitor.showAt(index / 60); if (visitor.above.visible) posed++; }
  worstFrame = (performance.now() - started) / 600;
  check(posed > 300 && worstFrame < FRAME_BUDGET, `a frame's pose takes ${worstFrame.toFixed(3)} ms (out of the water in ${posed} of 600 frames)`);
}

// Something thrown near its course.
{
  // A thing parked 20 m out on the home line: a sighting may still come, but never with it within SCHEDULE.clear of its course.
  const parked = [{ position: { x: 0, z: -40 } }];
  const { sightings } = run(1800, { frame: 1 / 30, things: () => parked });
  const clear = sightings.every((sighting) => {
    const visitor = makeVisitor();
    return !visitor.thingNear(sighting, null, parked, SCHEDULE.clear);
  });
  check(clear, `a thing out on the water: none of ${sightings.length} sightings came within ${SCHEDULE.clear} m of it`);
  // A thing that turns up beside one under way: it goes down at once.
  const visitor = makeVisitor();
  visitor.step(0, [], { open: true, near: false });
  visitor.summon(0, 'humps', { elapsed: 6 });
  const head = visitor.report(0);
  const startledAt = 0.5;
  let time = 0, under = null;
  for (; time < 10; time += STEP) {
    visitor.step(time, time >= startledAt ? [{ position: { x: head.x, z: head.z } }] : [], { open: true, near: false });
    visitor.showAt(time);
    const highest = Math.max(...visitor.spine.map((knot) => knot.point.y + knot.radius * knot.flat));
    if (time > startledAt && highest < 0 && under === null) under = time;
  }
  check(visitor.sighting.startled, 'a thing beside it startles it');
  check(under !== null && under - startledAt < 2.4 + 0.12 * visitor.sighting.length + 0.5, `and it is all under ${under === null ? 'never' : `${(under - startledAt).toFixed(2)} s`} after`);
}

// Ice or a gale: nothing comes up.
{
  const { sightings } = run(900, { frame: 1 / 30, open: () => false });
  check(sightings.length === 0, 'under ice or a gale, nothing comes up in 15 minutes');
}

// Alike at any frame rate.
{
  const poses = {};
  for (const fps of [30, 60, 144]) {
    const record = [];
    const moments = [40, 52.5, 61, 75, 200, 333.3];
    const { sightings } = run(400, {
      frame: 1 / fps,
      onFrame(visitor, time) {
        for (const moment of moments) {
          if (Math.abs(time - moment) < 0.5 / fps && !record.some((entry) => entry.moment === moment)) {
            visitor.showAt(moment);
            record.push({ moment, pose: visitor.spine.map((knot) => [knot.point.x, knot.point.y, knot.point.z].map((value) => value.toFixed(6)).join()).join(';'), skin: visitor.above.visible || visitor.below.visible ? createHash('sha256').update(Buffer.from(visitor.geometry.attributes.position.array.buffer)).update(Buffer.from(visitor.geometry.attributes.normal.array.buffer)).digest('hex') : null, report: JSON.stringify(visitor.report(moment)) });
          }
        }
      },
    });
    poses[fps] = { record: JSON.stringify(record), sightings: JSON.stringify(sightings.map((sighting) => [sighting.form, sighting.at, sighting.startX, sighting.startZ])) };
  }
  check(poses[30].sightings === poses[60].sightings && poses[60].sightings === poses[144].sightings, 'the same sightings at 30, 60 and 144 frames a second');
  check(poses[30].record === poses[60].record && poses[60].record === poses[144].record, 'and the same spine, skin and normals at the same moments');
}

console.log(failures === 0 ? 'visitor-probe: all passed' : `visitor-probe: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
