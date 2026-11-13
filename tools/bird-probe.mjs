// The birds on the CPU (src/birds.js), and checks:
//
//   node tools/bird-probe.mjs
//
// - each place's birds (BIRDS_BY_PLACE): some at every place but the Pool
//   (whose view looks down into the water), none for 'none';
// - ten minutes of every place's flying birds (visit): always low over the
//   water in the home view's sky (out past THROW_REACH from the eye, between
//   1.2 m and the frame's top, but in a thermal's turns), at their kind's
//   speed, banked no more than 50°, never jumping between frames; they come
//   and go, every visit beginning and ending out beyond the frame's sides,
//   each on a path of its own; the gulls and the fish eagle glide and flap
//   by turns; the Reflecting Pool's cardinal bounds (its wings shut a
//   moment each cycle) and its jay beats steadily, each coming and going
//   on its own; a flock flies together;
// - the heron stands wading at its spot: its feet on the bed, in the water,
//   a few centimetres to a few tens deep, inside the pond;
// - its ways are smooth: it turns about unhurried, stepping round as it
//   turns, holds still between its moves, and peers into the water a while
//   before it strikes; it keeps no rhythm (over twenty seeds the gaps
//   between its walks, strikes and wing spreads spread widely), and now and
//   then it opens its wings and holds them open, still, for seconds (never
//   beating them), standing where it was;
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
const THROW_REACH = 9;   // m: farther than anything thrown goes from the eye (it lands in the water's 6 m patch, at most 6.2 m off, its arc a few metres up)
const FRAME_TOP = THREE.MathUtils.degToRad(7.4);   // the home view's frame reaches this far above the horizon (48° high, looking 16.6° down)
const DAY = { solarElevation: 37 };
const NIGHT = { solarElevation: -28.3 };   // Lakeside Night: lit by a moon high up, the true sun well down
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

// Who lives where: some at every place but the Pool (its view looks down into the water, at no sky).
for (const place of Object.keys(PLACES)) {
  const birds = new BirdPopulation();
  birds.setPlace(place);
  const expected = (BIRDS_BY_PLACE[place] ?? []).reduce((sum, group) => sum + group.count, 0);
  check((place === 'pool' ? expected === 0 : expected > 0) && birds.birds.length === expected, `${place}: ${birds.birds.length} birds (${[...new Set(birds.birds.map((bird) => BIRD_KINDS[bird.kind].name))].join(', ')})`);
}
{
  const none = new BirdPopulation(); none.setPlace('none');
  check(none.birds.length === 0, "'none': no birds");
}

// Every place's flying birds over ten minutes.
const OUT_OF_FRAME = THREE.MathUtils.degToRad(45);   // a wide screen's frame reaches 38° either side of the home view's line
const bearingOf = (bird) => Math.atan2(bird.x - EYE.x, -(bird.z - EYE.z));
for (const place of Object.keys(BIRDS_BY_PLACE)) {
  const groups = BIRDS_BY_PLACE[place];
  if (!groups.some((group) => group.habit === 'visit')) continue;
  const { frames } = run(place, 600, 1 / 60);
  const cruise = BIRD_KINDS[groups[0].kind].cruise;
  let nearest = Infinity, lowest = Infinity, highestElevation = -Infinity, fastest = 0, slowest = Infinity, steepestBank = 0, fastestRoll = 0, biggestJump = 0;
  let visits = 0, inside = 0, styles = new Set(), entries = [];
  for (let index = 1; index < frames.length; index++) {
    frames[index].birds.forEach((bird, which) => {
      const before = frames[index - 1].birds[which];
      // A visit's first and last frames: out beyond the frame's side.
      if (bird.shown !== before.shown) {
        const edge = bird.shown ? bird : before;
        if (Math.abs(bearingOf(edge)) < OUT_OF_FRAME) inside++;
        if (bird.shown) { visits++; styles.add(bird.style); entries.push(edge); }
      }
      if (!bird.shown) return;
      const distance = Math.hypot(bird.x - EYE.x, bird.z - EYE.z);
      nearest = Math.min(nearest, distance);
      lowest = Math.min(lowest, bird.y);
      if (bird.style !== 'circle') highestElevation = Math.max(highestElevation, Math.atan2(bird.y - EYE.y, distance));
      steepestBank = Math.max(steepestBank, Math.abs(bird.bank));
      if (!before.shown) return;
      const speed = Math.hypot(bird.x - before.x, bird.y - before.y, bird.z - before.z) * 60;
      fastest = Math.max(fastest, speed); slowest = Math.min(slowest, speed);
      fastestRoll = Math.max(fastestRoll, Math.abs(bird.bank - before.bank) * 60);
      biggestJump = Math.max(biggestJump, Math.abs(Math.atan2(Math.sin(bird.heading - before.heading), Math.cos(bird.heading - before.heading))));
    });
  }
  const seen = frames.filter((frame) => frame.birds.some((bird) => bird.shown)).length / frames.length;
  check(nearest > THROW_REACH, `${place}: its birds keep out of reach: nearest ${nearest.toFixed(1)} m from the eye`);
  check(lowest > 1.2, `${place}: they stay over the water: lowest ${lowest.toFixed(2)} m`);
  check(highestElevation < FRAME_TOP, `${place}: they stay in the home view's sky (but in a thermal): highest ${THREE.MathUtils.radToDeg(highestElevation).toFixed(1)}° above the eye's level`);
  check(slowest > 0.4 * cruise && fastest < 2.2 * cruise, `${place}: they fly at their speed: ${slowest.toFixed(1)} to ${fastest.toFixed(1)} m/s (cruising ${cruise})`);
  // Gliding turns, unhurried: a visit laid out within 28° of bank for its speed (a flock's outer birds a little more)
  // and rolled into over a second, never flicked over.
  check(steepestBank <= THREE.MathUtils.degToRad(35) + 1e-9, `${place}: banked at most 35°: ${THREE.MathUtils.radToDeg(steepestBank).toFixed(1)}°`);
  check(fastestRoll < THREE.MathUtils.degToRad(40), `${place}: they roll into a turn slowly: at most ${THREE.MathUtils.radToDeg(fastestRoll).toFixed(0)}°/s`);
  check(biggestJump < 0.05, `${place}: no bird's heading jumps between frames: ${biggestJump.toFixed(3)} rad at most`);
  check(visits >= 8 && seen > 0.2 && seen < 0.9, `${place}: they come and go: ${visits} visits in ten minutes, one in view ${(seen * 100).toFixed(0)}% of the time`);
  check(inside === 0, `${place}: every visit begins and ends out of the frame, beyond its sides (${inside} inside)`);
  // Each visit its own path: no two come in at the same place, and more than one way of going about where its birds
  // have more than one (the songbirds only cross, tree row to tree row).
  const sameEntry = entries.some((entry, index) => entries.slice(index + 1).some((other) => Math.hypot(entry.x - other.x, entry.y - other.y, entry.z - other.z) < 0.5 && Math.abs(Math.sin(entry.heading - other.heading)) < 0.05));
  const ways = new Set(groups.flatMap((group) => Object.keys(group.styles ?? {}))).size;
  check(!sameEntry && styles.size >= Math.min(2, ways), `${place}: every visit a path of its own (${[...styles].join(', ')})`);
  if (groups.some((group) => ['kelp', 'herring', 'fishEagle'].includes(group.kind))) {
    const shown = frames.filter((frame) => frame.birds.some((bird) => bird.shown));
    const flapping = shown.filter((frame) => frame.birds.some((bird) => bird.shown && bird.beat > 0.5)).length / shown.length;
    check(flapping > 0.1 && flapping < 0.9, `${place}: they glide and flap by turns: beating in ${(flapping * 100).toFixed(0)}% of the frames they are seen in`);
  }
  if (place === 'mall') {
    // The songbirds' flight: the cardinal bounds (wings shut for a moment, its path rising and dipping a few
    // centimetres each cycle about the visit's), the jay beats steadily, a glide only now and then.
    const seenOf = (kind) => frames.flatMap((frame) => frame.birds.filter((bird) => bird.kind === kind && bird.shown));
    const cardinal = seenOf('cardinal'), jay = seenOf('blueJay');
    const shut = cardinal.filter((bird) => bird.fold > 0.99).length / cardinal.length;
    let dips = 0;
    for (let index = 1; index < frames.length - 1; index++) {
      const [before, bird, after] = [frames[index - 1], frames[index], frames[index + 1]].map((frame) => frame.birds.find((one) => one.kind === 'cardinal'));
      if (before.shown && bird.shown && after.shown && bird.fold === 0 && before.fold > 0 && bird.pitch < 0) dips++;
    }
    const beating = jay.filter((bird) => bird.beat > 0.5).length / jay.length;
    check(shut > 0.15 && shut < 0.6 && dips > 20 && cardinal.every((bird) => bird.fold === 0 || bird.beat === 1 - bird.fold), `the cardinal bounds: wings shut in ${(shut * 100).toFixed(0)}% of its frames, ${dips} bounds come down into a flap`);
    check(beating > 0.6 && jay.every((bird) => !bird.fold), `the jay beats steadily: in ${(beating * 100).toFixed(0)}% of its frames, never shut`);
    // Each on its own comings and goings: over many seeds, both in view about as often as two birds coming and going
    // by chance would be (the product of how often each is), neither following nor avoiding the other.
    let jayShown = 0, cardinalShown = 0, both = 0, samples = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const birds = new BirdPopulation({ seed }); birds.setPlace(place); birds.setConditions(DAY);
      const [jayBird, cardinalBird] = ['blueJay', 'cardinal'].map((kind) => birds.birds.find((bird) => bird.kind === kind));
      for (let time = 0; time < 600; time += 0.25) {
        birds.showAt(time);
        samples++;
        jayShown += jayBird.pose.shown; cardinalShown += cardinalBird.pose.shown; both += jayBird.pose.shown && cardinalBird.pose.shown;
      }
    }
    const together = (both / samples) / ((jayShown / samples) * (cardinalShown / samples));
    check(together > 0.6 && together < 1.5, `the jay and the cardinal come and go each on its own: both in view ${(together * 100).toFixed(0)}% as often as by chance`);
  }
  if (groups.some((group) => group.together)) {
    // Together: while the first and the last of the flock are both in view, they are a few spacings apart.
    const last = frames[0].birds.length - 1;
    const widest = frames.reduce((most, frame) => (frame.birds[0].shown && frame.birds[last].shown ? Math.max(most, Math.hypot(frame.birds[0].x - frame.birds[last].x, frame.birds[0].z - frame.birds[last].z)) : most), 0);
    check(widest < 25, `${place}: its flock flies together: the last at most ${widest.toFixed(1)} m from the first`);
  }
}

// The heron at rest.
const heronAt = (frame) => frame.birds[0];
{
  const { frames } = run('koi', 60, 1 / 60);
  const first = heronAt(frames[0]);
  const depth = koiFloorDepthAt(first.spot.x, first.spot.z);
  check(first.mode === 'stand' && first.fold === 1, 'the heron starts standing, its wings folded');
  check(koiShoreDistance(first.spot.x, first.spot.z) > 0 && depth > 0.03 && depth < 0.35, `it wades: ${(depth * 100).toFixed(0)} cm deep, ${koiShoreDistance(first.spot.x, first.spot.z).toFixed(2)} m out from the waterline`);
  check(Math.abs(first.y + depth) < 1e-9, 'its feet are on the bed');
  check(frames.every((frame) => heronAt(frame).mode === 'stand' && heronAt(frame).shown), 'left alone, it stays');
  const looks = new Set(frames.map((frame) => heronAt(frame).look.toFixed(2)));
  check(looks.size > 3, `it turns its head now and then (${looks.size} looks)`);
  // Where it stands changes only while it walks (src/birds.js standingPlace; it turns on the spot before and after),
  // so between walks its mirror image is not drawn again for where it is.
  const moved = frames.slice(1).filter((frame, index) => { const heron = heronAt(frame), before = heronAt(frames[index]);
    return heron.x !== before.x || heron.z !== before.z; });
  check(moved.length > 0 && moved.every((frame) => heronAt(frame).walking > 0), `it walks now and then, and moves only as it walks (${moved.length} frames)`);
}

// The heron's ways, smooth (src/birds.js sprung): it turns about unhurried, stepping round as it turns (never spinning
// on its feet), holds still between its moves, and peers into the water a while before it strikes.
{
  const { frames } = run('koi', 120, 1 / 60);
  let fastestTurn = 0, spun = 0, still = 0, longestPeer = 0, peering = 0, struck = 0;
  for (let index = 1; index < frames.length; index++) {
    const heron = heronAt(frames[index]), before = heronAt(frames[index - 1]);
    const rate = Math.abs(Math.atan2(Math.sin(heron.heading - before.heading), Math.cos(heron.heading - before.heading))) * 60;
    fastestTurn = Math.max(fastestTurn, rate);
    if (rate > 0.6 && heron.walking < 0.15) spun++;
    if (['heading', 'look', 'neck', 'strike', 'crouch', 'x', 'z'].every((key) => heron[key] === before[key])) still++;
    // Peering: its strike part way (src/birds.js: 0.3); a stab from it passes through more in a frame or two.
    if (heron.strike > 0.2 && heron.strike < 0.5) peering++;
    else if (heron.strike > 0.9 && before.strike <= 0.9) { longestPeer = Math.max(longestPeer, peering); peering = 0; struck++; }
    else if (heron.strike < 0.2) peering = 0;
  }
  check(fastestTurn < 3.2, `it turns about unhurried: at most ${fastestTurn.toFixed(2)} rad/s`);
  check(spun === 0, `it steps round as it turns (${spun} frames turning on still feet)`);
  check(still / frames.length > 0.4, `it holds still between its moves (${(100 * still / frames.length).toFixed(0)}% of frames)`);
  check(struck > 0 && longestPeer / 60 > 0.6, `it peers into the water a while before it strikes (${(longestPeer / 60).toFixed(1)} s)`);
}

// No rhythm: what the heron does in each spell, and when, is drawn afresh (src/birds.js spellPlan), so the gaps
// between the starts of its walks, strikes and wing spreads spread widely; and now and then it opens its wings and
// holds them open, still, for seconds, never beating them, while it stands where it was.
{
  const gaps = [];
  let spreads = 0, spreadMoved = 0, beating = 0, openSince = null;
  const holds = [];
  for (let seed = 1; seed <= 20; seed++) {
    const birds = new BirdPopulation({ seed });
    birds.setPlace('koi');
    birds.setConditions(DAY);
    let last = null, before = null;
    for (let time = 0; time <= 300; time += 1 / 20) {
      birds.showAt(time);
      const heron = { ...birds.birds[0].pose };
      if (before) {
        const began = (heron.walking > 0.1 && before.walking <= 0.1) || (heron.strike > 0.1 && before.strike <= 0.1) || (heron.fold < 0.9 && before.fold >= 0.9);
        if (began) { if (last !== null) gaps.push(time - last); last = time; }
        if (heron.fold < 0.9 && before.fold >= 0.9) spreads++;
        if (heron.fold < 0.9 && (heron.x !== before.x || heron.z !== before.z)) spreadMoved++;
        if (heron.flying === false && heron.beat > 0) beating++;
        // Held open: how long it stays near fully open.
        if (heron.spread > 0.8 && openSince === null) openSince = time;
        if (heron.spread <= 0.8 && openSince !== null) { holds.push(time - openSince); openSince = null; }
      }
      before = heron;
    }
    openSince = null;
  }
  gaps.sort((a, b) => a - b);
  const tenth = gaps[Math.floor(gaps.length / 10)], ninetieth = gaps[Math.floor(gaps.length * 0.9)];
  check(gaps.length > 100 && ninetieth > 2.2 * tenth, `it keeps no rhythm: its acts ${tenth.toFixed(1)} to ${ninetieth.toFixed(1)} s apart (a tenth to nine tenths, ${gaps.length} gaps)`);
  check(spreads >= 10 && spreads < 100, `it opens its wings now and then (${spreads} times in 20 × 5 min)`);
  check(spreadMoved === 0, `standing where it was as it holds them open (${spreadMoved} frames moving)`);
  check(beating === 0, `never beating them as it stands (${beating} frames beating)`);
  holds.sort((a, b) => a - b);
  check(holds.length > 0 && holds[0] > 2 && holds[holds.length - 1] < 12, `holding them open for seconds: ${holds[0]?.toFixed(1)} to ${holds[holds.length - 1]?.toFixed(1)} s`);
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
  const flockSlow = run('harbour', 30, 1 / 60), flockFast = run('harbour', 30, 1 / 144);
  let worst = 0;
  for (const [one, other] of [[slow, fast], [gullsSlow, gullsFast], [flockSlow, flockFast]]) {
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
  for (const place of Object.keys(BIRDS_BY_PLACE)) {
    const birds = new BirdPopulation(); birds.setPlace(place); birds.setConditions(DAY);
    const frames = 3000;
    // Each visit is made once (its path laid out, src/birds.js makeVisit), not again every frame while it is awaited.
    let made = 0;
    const makeVisit = birds.makeVisit.bind(birds);
    birds.makeVisit = (...values) => { made++; return makeVisit(...values); };
    const started = costClock();
    for (let frame = 0; frame < frames; frame++) { birds.step(frame / 60, []); birds.showAt(frame / 60); }
    const milliseconds = costSince(started) / frames;
    check(milliseconds < 0.05, `${place}: a frame's posing under 0.05 ms (${milliseconds.toFixed(4)})`);
    const visitors = new Set(birds.birds.map((bird) => bird.visitor).filter(Boolean)).size;
    if (visitors) check(made <= visitors * 6, `${place}: each visit is laid out once: ${made} made in ${frames / 60} s by ${visitors} visiting`);
  }
}

Math.random = realRandom;
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
