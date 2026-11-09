// The birds on the CPU (src/birds.js), and checks:
//
//   node tools/bird-probe.mjs
//
// - each place's birds (BIRDS_BY_PLACE): three gulls at the Rocky cove, a
//   heron at the Koi pond, none anywhere else or for 'none';
// - two minutes of the gulls: always low over the sea in the home view's sky
//   (out past THROW_REACH from the eye, between 1.2 m and the frame's top),
//   at a gull's speed, banked no more than 50°, never jumping between
//   frames;
// - the heron stands wading at its spot: its feet on the bed, in the water,
//   a few centimetres to a few tens deep, inside the pond;
// - a splash across the pond makes it look, not go; a stone coming down
//   near it puts it up before it lands, and it climbs away out of sight
//   without a jump between frames; it comes back after its absence (put off
//   while things are thrown near its spot) and lands where it stood, its
//   heading its own, smoothly; then it stands;
// - after dark there are none (setConditions);
// - the population draws no Math.random (its own seeded stream);
// - at any frame rate: stepped at the physics step, as src/main.js steps
//   it, and posed at 60 or 144 frames a second, every pose at the same
//   moment is the same;
// - the cost: a frame's posing under 0.05 ms of the main thread's time
//   (tools/cost-clock.mjs).
import * as THREE from 'three';
import { costClock, costSince } from './cost-clock.mjs';
import { BirdPopulation, BIRDS_BY_PLACE, BIRD_KINDS } from '../src/birds.js';
import { koiShoreDistance, koiFloorDepthAt } from '../src/pondFloor.js';
import { PLACES } from '../src/places.js';

const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

const PHYSICS_STEP = 1 / 240;   // src/main.js's
const EYE = new THREE.Vector3(0, 1.15, 2.45);   // the home view's eye (src/main.js VIEWS.shore)
const THROW_REACH = 15;   // m: farther than any throw goes from the hand
const FRAME_TOP = THREE.MathUtils.degToRad(7.4);   // the home view's frame reaches this far above the horizon (48° high, looking 16.6° down)
const DAY = { sunDirection: new THREE.Vector3(0.3, 0.6, -0.7).normalize() };
const NIGHT = { sunDirection: new THREE.Vector3(0.3, -0.2, -0.9).normalize() };
const realRandom = Math.random;
Math.random = () => { throw new Error('the birds drew Math.random'); };

/** A population of `place` run from 0 to `seconds`, stepped at the physics step and posed every `frame`: each frame's poses. */
function run(place, seconds, frame, { things = () => [], splashes = [], conditions = DAY } = {}) {
  const birds = new BirdPopulation({ seed: 1 });
  birds.setPlace(place);
  birds.setConditions(conditions);
  const frames = [];
  let stepsTime = 0;
  let splashIndex = 0;
  for (let time = 0; time <= seconds + 1e-9; time += frame) {
    while (stepsTime < time - 1e-12) {
      while (splashIndex < splashes.length && splashes[splashIndex].time <= stepsTime) { birds.startle(stepsTime, splashes[splashIndex].x, splashes[splashIndex].z); splashIndex++; }
      stepsTime += PHYSICS_STEP;
      birds.step(stepsTime, things(stepsTime));
    }
    birds.showAt(time);
    frames.push({ time, birds: birds.report() });
  }
  return { birds, frames };
}

// Who lives where.
for (const place of Object.keys(PLACES)) {
  const birds = new BirdPopulation();
  birds.setPlace(place);
  const expected = (BIRDS_BY_PLACE[place] ?? []).reduce((sum, group) => sum + group.count, 0);
  if (expected === 0) check(birds.birds.length === 0, `${place}: no birds`);
}
{
  const cove = new BirdPopulation(); cove.setPlace('cove');
  check(cove.birds.length === 3 && cove.birds.every((bird) => bird.kind === 'gull'), 'the Rocky cove: three gulls');
  const koi = new BirdPopulation(); koi.setPlace('koi');
  check(koi.birds.length === 1 && koi.birds[0].kind === 'heron', 'the Koi pond: a heron');
  const none = new BirdPopulation(); none.setPlace('none');
  check(none.birds.length === 0, "'none': no birds");
}

// The gulls over two minutes.
{
  const { frames } = run('cove', 120, 1 / 60);
  let nearest = Infinity, lowest = Infinity, highestElevation = -Infinity, fastest = 0, slowest = Infinity, steepestBank = 0, biggestJump = 0;
  for (let index = 1; index < frames.length; index++) {
    frames[index].birds.forEach((gull, which) => {
      const before = frames[index - 1].birds[which];
      const distance = Math.hypot(gull.x - EYE.x, gull.z - EYE.z);
      nearest = Math.min(nearest, distance);
      lowest = Math.min(lowest, gull.y);
      highestElevation = Math.max(highestElevation, Math.atan2(gull.y - EYE.y, distance));
      const speed = Math.hypot(gull.x - before.x, gull.y - before.y, gull.z - before.z) * 60;
      fastest = Math.max(fastest, speed); slowest = Math.min(slowest, speed);
      steepestBank = Math.max(steepestBank, Math.abs(gull.bank));
      biggestJump = Math.max(biggestJump, Math.abs(Math.atan2(Math.sin(gull.heading - before.heading), Math.cos(gull.heading - before.heading))));
    });
  }
  const cruise = BIRD_KINDS.gull.cruise;
  check(nearest > THROW_REACH, `the gulls keep out of reach: nearest ${nearest.toFixed(1)} m from the eye`);
  check(lowest > 1.2, `the gulls stay over the water: lowest ${lowest.toFixed(2)} m`);
  check(highestElevation < FRAME_TOP, `the gulls stay in the home view's sky: highest ${THREE.MathUtils.radToDeg(highestElevation).toFixed(1)}° above the eye's level`);
  check(slowest > 0.4 * cruise && fastest < 2.2 * cruise, `the gulls fly at a gull's speed: ${slowest.toFixed(1)} to ${fastest.toFixed(1)} m/s`);
  check(steepestBank <= THREE.MathUtils.degToRad(50) + 1e-9, `banked at most 50°: ${THREE.MathUtils.radToDeg(steepestBank).toFixed(1)}°`);
  check(biggestJump < 0.05, `no gull's heading jumps between frames: ${biggestJump.toFixed(3)} rad at most`);
  const flapping = frames.filter((frame) => frame.birds.some((gull) => gull.beat > 0.5)).length / frames.length;
  check(flapping > 0.1 && flapping < 0.9, `the gulls glide and flap by turns: some beating in ${(flapping * 100).toFixed(0)}% of frames`);
}

// The heron at rest.
const heronAt = (frame) => frame.birds[0];
{
  const { frames } = run('koi', 30, 1 / 60);
  const first = heronAt(frames[0]);
  const depth = koiFloorDepthAt(first.spot.x, first.spot.z);
  check(first.mode === 'stand' && first.fold === 1, 'the heron starts standing, its wings folded');
  check(koiShoreDistance(first.spot.x, first.spot.z) > 0 && depth > 0.03 && depth < 0.35, `it wades: ${(depth * 100).toFixed(0)} cm deep, ${koiShoreDistance(first.spot.x, first.spot.z).toFixed(2)} m out from the waterline`);
  check(Math.abs(first.y + depth) < 1e-9, 'its feet are on the bed');
  check(frames.every((frame) => heronAt(frame).mode === 'stand' && heronAt(frame).shown), 'left alone, it stays');
  const looks = new Set(frames.map((frame) => heronAt(frame).look.toFixed(2)));
  check(looks.size > 3, `it turns its head now and then (${looks.size} looks)`);
  check(frames.filter((frame) => heronAt(frame).still).length > frames.length * 0.5, 'and holds still most of the time (its mirror image is not drawn again then)');
}

// A splash across the pond: it looks. A stone coming down near it: it goes, and later comes back.
{
  const probe = new BirdPopulation(); probe.setPlace('koi');
  const spot = probe.birds[0].spot;
  const { frames } = run('koi', 20, 1 / 60, { splashes: [{ time: 5, x: 0, z: 0 }] });
  const before = heronAt(frames[4 * 60]), after = heronAt(frames[6 * 60]);
  check(after.mode === 'stand' && after.neck > 0.95 && after.neck > before.neck - 1e-9, `a splash 5 m off makes it stretch up and look (neck ${after.neck.toFixed(2)}), not go`);

  // A stone thrown to land a metre from it, coming down at 6 m/s from 2 m up over the last third of a second.
  const landAt = 10, landX = spot.x + 0.7, landZ = spot.z + 0.7;
  const stone = (time) => {
    const left = landAt - time;
    if (left < 0 || left > 1.2) return [];
    return [{ state: 'air', position: new THREE.Vector3(landX + left * 1.5, 0.05 + left * (6 - 4.9 * left), landZ + left * 1.5), velocity: new THREE.Vector3(-1.5, -6 + 9.8 * left, -1.5) }];
  };
  const thrown = run('koi', 140, 1 / 60, { things: stone, splashes: [{ time: landAt, x: landX, z: landZ }] });
  const flushed = thrown.frames.find((frame) => heronAt(frame).mode === 'flee');
  check(flushed && flushed.time < landAt, `a stone coming down near it puts it up before it lands (at ${flushed?.time.toFixed(2)} s, it lands at ${landAt} s)`);
  let biggestJump = 0, gone = null, back = null, landed = null;
  for (let index = 1; index < thrown.frames.length; index++) {
    const here = heronAt(thrown.frames[index]), before = heronAt(thrown.frames[index - 1]);
    if (here.shown && before.shown && here.flying === before.flying) biggestJump = Math.max(biggestJump, Math.hypot(here.x - before.x, here.y - before.y, here.z - before.z));
    if (!gone && here.mode === 'away') gone = { time: thrown.frames[index].time, from: before };
    if (gone && !back && here.mode === 'land') back = thrown.frames[index].time;
    if (back && !landed && here.mode === 'stand') landed = { time: thrown.frames[index].time, pose: here };
  }
  check(biggestJump < 0.2, `it never jumps between frames in the air (${(biggestJump * 100).toFixed(1)} cm at most)`);
  check(gone && Math.hypot(gone.from.x - EYE.x, gone.from.z - EYE.z) > 30 && gone.from.y > 8, `it climbs away out of sight: last seen ${gone ? Math.hypot(gone.from.x - EYE.x, gone.from.z - EYE.z).toFixed(0) : '?'} m off, ${gone?.from.y.toFixed(1)} m up`);
  check(back && back - gone.time >= 40, `it stays away a while (${back ? (back - gone.time).toFixed(0) : '?'} s)`);
  check(landed && Math.hypot(landed.pose.x - spot.x, landed.pose.z - spot.z) < 1e-6 && Math.abs(landed.pose.heading - spot.heading) < 0.05, 'it comes back to where it stood, facing as it did');
  check(thrown.frames.at(-1).birds[0].mode === 'stand', 'and stands again');

  // Things keep being thrown near its spot while it is away: it stays away until they stop.
  const pelted = (time) => (time > 20 && time < 115 && (time % 4) < 1 ? stone(landAt + (time % 4) - 0.6).map((thing) => ({ ...thing })) : stone(time));
  const busy = run('koi', 140, 1 / 60, { things: pelted, splashes: [{ time: landAt, x: landX, z: landZ }] });
  const busyBack = busy.frames.find((frame) => frame.time > 20 && heronAt(frame).mode === 'land');
  check(!busyBack || busyBack.time > 115, `it is not back while things are thrown near its spot (back at ${busyBack ? busyBack.time.toFixed(0) : 'not yet'} s)`);
}

// After dark: none.
{
  const { frames } = run('cove', 5, 1 / 60, { conditions: NIGHT });
  check(frames.every((frame) => frame.birds.every((bird) => !bird.shown)), 'after dark, no birds are about');
}

// At any frame rate: the same poses at the same moments.
{
  const slow = run('koi', 60, 1 / 60, { things: () => [], splashes: [{ time: 3, x: -1.2, z: -4.3 }] });
  const fast = run('koi', 60, 1 / 144, { things: () => [], splashes: [{ time: 3, x: -1.2, z: -4.3 }] });
  const gullsSlow = run('cove', 30, 1 / 60), gullsFast = run('cove', 30, 1 / 144);
  let worst = 0;
  for (const [one, other] of [[slow, fast], [gullsSlow, gullsFast]]) {
    for (const frame of one.frames) {
      if (Math.abs(frame.time - Math.round(frame.time)) > 1e-9) continue;
      const match = other.frames.find((candidate) => Math.abs(candidate.time - frame.time) < 1e-6);
      if (!match) continue;
      frame.birds.forEach((bird, index) => { worst = Math.max(worst, Math.hypot(bird.x - match.birds[index].x, bird.y - match.birds[index].y, bird.z - match.birds[index].z), Math.abs(bird.neck - match.birds[index].neck)); });
    }
  }
  check(worst < 1e-6, `posed at 60 and 144 frames a second, every bird is where it was at each whole second (${worst.toExponential(1)})`);
}

// The cost of a frame's posing.
{
  for (const place of ['cove', 'koi']) {
    const birds = new BirdPopulation(); birds.setPlace(place); birds.setConditions(DAY);
    const frames = 3000;
    const started = costClock();
    for (let frame = 0; frame < frames; frame++) { birds.step(frame / 60, []); birds.showAt(frame / 60); }
    const milliseconds = costSince(started) / frames;
    check(milliseconds < 0.05, `${place}: a frame's posing under 0.05 ms (${milliseconds.toFixed(4)})`);
  }
}

Math.random = realRandom;
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
