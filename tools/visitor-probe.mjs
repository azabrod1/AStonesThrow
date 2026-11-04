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
//   and it is all under the water within STARTLED_DIVE and its body's lag;
//   a neck startled at any point before it is down comes down from where it
//   stands, its head not moved at the moment it is startled.
// - Ice or a gale (the step's `open` false): nothing comes up.
// - It goes alike at any frame rate: the pose at a moment is the same
//   whether the frames before it came at 30, 60 or 144 a second, and the
//   schedule, which the physics steps keep, is the same too.
// - Frame work reuses the geometry, cross-section offsets and typed arrays;
//   its hide is built only on first entering the loch and reused thereafter.
// - Its contacts with the water (the heaps, the foam round them) end where
//   its tube meets the water, never under a head lifted out of it.
//
//   node tools/visitor-probe.mjs
import { createHash } from 'node:crypto';
import { LochVisitor, SCHEDULE } from '../src/lochVisitor.js';
import { VISITOR_RINGS, VISITOR_RING_SLOPE_LEAST } from '../src/shaders/visitor.js';

const STEP = 1 / 240;          // src/rock.js PHYSICS_STEP
const FARTHEST_AWAY = 30;      // src/main.js: a floater past this from the pond goes
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

// Other places pay only for a 1-texel placeholder; all three materials keep
// their compiled map features when the real hide is assigned, once.
{
  const visitor = new LochVisitor({ envTexture: null, waterFog: { extinction: null, color: null }, mirrorLayer: 1 });
  const placeholder = visitor.hideMap;
  const versions = visitor.meshes.map((mesh) => mesh.material.version);
  visitor.setPlace(false);
  check(placeholder.image.width === 1 && visitor.hideMap === placeholder && !visitor.hideReady, 'no hide bake outside the loch');
  visitor.setPlace(true);
  const hide = visitor.hideMap;
  check(hide.image.width === 256 && visitor.meshes.every((mesh, index) => mesh.material.bumpMap === hide && mesh.material.roughnessMap === hide && mesh.material.version === versions[index]), 'first loch visit assigns the hide without changing material programs');
  visitor.setPlace(false);
  visitor.setPlace(true);
  check(visitor.hideMap === hide, 'later loch visits reuse the hide');
}

// Late rings shade a compact circle while keeping every slope that can
// survive the shader cutoff. Sample the unattenuated analytical envelope,
// which bounds the shader's impulse and front filters from above.
for (const form of ['neck', 'back']) {
  const visitor = makeVisitor();
  visitor.step(0, [], { open: true, near: false });
  visitor.summon(0, form);
  const sighting = visitor.sighting;
  // Late in the linger, before its waves ease out (SCHEDULE.fade): its rings at their widest at full height.
  const lingerEnd = sighting.sinkStart + sighting.sinkSeconds + SCHEDULE.linger;
  visitor.showAt(lingerEnd - SCHEDULE.fade - 0.1);
  const reach = visitor.uniforms.uVisitorReach.value;
  const rings = visitor.uniforms.uVisitorRings.value;
  const fullWake = visitor.uniforms.uVisitorWake.value.y, fullRings = rings.map((ring) => ring.w);
  let covered = 0, clipped = 0, oldRadius = 0;
  for (const ring of rings) {
    const centre = Math.hypot(ring.x - reach.x, ring.y - reach.y);
    oldRadius = Math.max(oldRadius, centre + Math.cbrt(ring.w * 9.81 * ring.z ** 2 / (4 * 2e-4)));
    for (let radius = 0.5; radius <= 300; radius += 0.5) {
      const phase = 9.81 * ring.z ** 2 / (4 * radius);
      const slope = ring.w * 9.81 ** 2 * ring.z ** 4 / (16 * radius ** 5);
      if (phase <= 0.8 || slope < VISITOR_RING_SLOPE_LEAST) continue;
      covered++;
      if (centre + radius > reach.z + 1e-6) clipped++;
    }
  }
  check(VISITOR_RINGS === 2 && rings.length === 2 && covered > 0 && clipped === 0 && reach.z < 0.65 * oldRadius,
    `${form} linger: ${reach.z.toFixed(1)} m shade radius (old height bound ${oldRadius.toFixed(1)} m), ${covered} ring samples covered, ${clipped} clipped; two ring slots`);
  // The last frame that draws it at 60 fps: its waves eased out (SCHEDULE.fade). The shader's heights and slopes, and
  // their unresolved variance's root, go as the wake's height, the rings' strengths and the heaps, so under a
  // thousandth of them is under a thousandth of any slope it drew (at most about 0.2): letting it go (uVisitorOn 0)
  // stills nothing that shows.
  visitor.showAt(lingerEnd - 1 / 60);
  const wakeLeft = visitor.uniforms.uVisitorWake.value.y / fullWake;
  const ringsLeft = Math.max(...rings.map((ring, slot) => ring.w / fullRings[slot]));
  const heapLeft = Math.max(...visitor.uniforms.uVisitorContacts.value.map((contact) => contact.w));
  check(fullRings.every((strength) => strength > 0) && wakeLeft < 1e-3 && ringsLeft < 1e-3 && heapLeft < 1e-4,
    `${form} linger's last frame: the wake at ${wakeLeft.toExponential(1)} of its height, the rings at ${ringsLeft.toExponential(1)} of their strength, heaps ${heapLeft.toExponential(1)} m`);
}

// The schedule, with nothing thrown.
{
  let nearest = Infinity, shownFrames = 0;
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
  // Frame work is bounded by a fixed mesh and reuses its buffers; no wall-clock assertion in the parallel suite.
  const visitor = makeVisitor();
  visitor.step(0, [], { open: true, near: false });
  visitor.summon(0, 'neck', { elapsed: 8 });
  let posed = 0;
  visitor.showAt(0);   // prepare this sighting's cached cross sections
  const geometry = visitor.geometry;
  const positions = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
  const offsets = visitor.skinOffsets;
  const originalOffsets = offsets.slice();
  for (let index = 0; index < 600; index++) { visitor.showAt(index / 60); if (visitor.above.visible) posed++; }
  check(posed > 300 && positions.length / 3 <= 5000 && geometry === visitor.geometry
    && positions === geometry.attributes.position.array && normals === geometry.attributes.normal.array
    && offsets === visitor.skinOffsets && offsets.every((value, index) => value === originalOffsets[index]),
    `600 frames reuse a fixed ${positions.length / 3}-vertex mesh, normal buffers and cached cross sections (${posed} frames above water)`);
}

// Something thrown near its course.
{
  // A thing parked about 42 m from the eye on the home line (near the sightings' band): a sighting may still come, but never with it within SCHEDULE.clear of its course.
  const parked = [{ position: { x: 0, z: -40 } }];
  const { sightings } = run(1800, { frame: 1 / 30, things: () => parked });
  const clear = sightings.every((sighting) => {
    const visitor = makeVisitor();
    return !visitor.thingNear(sighting, null, parked, SCHEDULE.clear);
  });
  check(sightings.length > 0 && clear, `a thing out on the water: none of ${sightings.length} sightings came within ${SCHEDULE.clear} m of it`);
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

// A neck startled before it is down comes down from where it stands, never at once: startled while it lifts, holds or
// is already lowering, its head is where it was at that moment (posed before and after the step that startles it),
// and it is all under as soon as a startled back would be.
{
  let largestJump = 0, slowest = 0, startles = 0;
  for (const fromLowering of [-4, -0.5, 0.1, 0.3, 0.5, 0.9, 1.4]) {   // s from when its neck starts down
    const visitor = makeVisitor();
    visitor.step(0, [], { open: true, near: false });
    visitor.summon(0, 'neck');
    const sighting = visitor.sighting;
    const at = sighting.lowerFrom + fromLowering;
    if (at >= sighting.sinkStart) continue;
    visitor.showAt(at);
    const before = visitor.spine[0].point.y;
    const head = visitor.report(at);
    visitor.step(at, [{ position: { x: head.x, z: head.z } }], { open: true, near: false });
    visitor.showAt(at);
    if (!sighting.startled) continue;
    startles++;
    largestJump = Math.max(largestJump, Math.abs(visitor.spine[0].point.y - before));
    let under = null;
    for (let time = at; time < at + 8 && under === null; time += 1 / 60) {
      visitor.showAt(time);
      if (Math.max(...visitor.spine.map((knot) => knot.point.y + knot.radius * knot.flat)) < 0) under = time - at;
    }
    slowest = Math.max(slowest, under ?? Infinity);
  }
  check(startles === 7 && largestJump < 1e-3, `a neck startled at ${startles} moments before it is down: its head moves ${(largestJump * 1000).toFixed(2)} mm at the moment it is startled`);
  check(slowest < 2.4 + 0.12 * 7.5 + 0.5, `and it is all under within ${slowest.toFixed(2)} s`);
}

// Where it meets the water: each contact (the water heaped and drawn down, the foam round it) runs from where its tube
// meets the water at the front to where it does at the back, never under a head lifted out of it: every end of every
// contact, in every frame of a few sightings of each form, is within a few centimetres of a knot whose tube is at the
// waterline (its bottom under the water, its top within 2 cm of it or out).
{
  const worst = {};
  for (const form of ['humps', 'neck', 'back']) {
    worst[form] = 0;
    for (let run = 0; run < 3; run++) {
      const visitor = makeVisitor();
      visitor.sightings = run * 3;   // a different summoned sighting each time
      visitor.step(0, [], { open: true, near: false });
      visitor.summon(0, form);
      const sighting = visitor.sighting;
      for (let time = 0; time < sighting.sinkStart + sighting.sinkSeconds; time += 1 / 15) {
        visitor.showAt(time);
        const meeting = visitor.spine.filter((knot) => knot.point.y - knot.radius * knot.flat < 0 && knot.point.y + knot.radius * knot.flat > -0.02);
        const spans = visitor.uniforms.uVisitorSpans.value.toArray();
        visitor.uniforms.uVisitorContacts.value.forEach((contact, slot) => {
          if (contact.w <= 0) return;
          for (const end of [1, -1]) {
            const x = contact.x + end * spans[slot] * sighting.headingX, z = contact.y + end * spans[slot] * sighting.headingZ;
            worst[form] = Math.max(worst[form], Math.min(...meeting.map((knot) => Math.hypot(knot.point.x - x, knot.point.z - z))));
          }
        });
      }
    }
  }
  check(Object.values(worst).every((distance) => distance < 0.15), `its contacts end where it meets the water: at most ${Object.entries(worst).map(([form, distance]) => `${form} ${(distance * 100).toFixed(1)} cm`).join(', ')} from a knot at the waterline`);
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
