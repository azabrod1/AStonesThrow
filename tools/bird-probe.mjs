// The birds on the CPU (src/birds.js), and checks:
//
//   node tools/bird-probe.mjs
//
// - each place's birds (BIRDS_BY_PLACE): some at every place but the Pool;
//   frozen, none standing on the ice (BIRDS_WHEN_FROZEN: the Koi pond's
//   heron flies over instead, and is checked as every flying bird is)
//   (whose view looks down into the water), none for 'none';
// - ten minutes of every place's flying birds (visit): always low over the
//   water in the home view's sky (out past THROW_REACH from the eye, between
//   1.2 m and the frame's top, but in a thermal's turns), at their kind's
//   speed, banked no more than 50°, never jumping between frames; over
//   thirty seeds (each visit to the page draws its own) none comes much
//   nearer than its group is laid out from, a thermal's circles too; they come
//   and go, every visit beginning and ending out beyond the frame's sides,
//   each on a path of its own; on an upright phone, laid out for its
//   narrower frame (setView), as much in it as a wide screen's; the gulls and the fish eagle glide and flap
//   by turns; the Reflecting Pool's cardinal bounds (its wings shut a
//   moment each cycle) and its jay beats steadily, each coming and going
//   on its own; a flock flies together;
// - the heron stands wading at its spot: its feet on the bed, in the water,
//   a few centimetres to a few tens deep, inside the pond; its spot differs
//   from seed to seed, along the far bank, inside an upright phone's frame;
//   its legs are seen from the eye wherever it stands and walks, the
//   garden's planting (src/koiGarden.js) never in front of them;
// - its ways are smooth: it turns about unhurried, stepping round as it
//   turns, holds still between its moves, and peers into the water a while
//   (its bill pointed down) before it strikes, sometimes to one side, about as
//   often as a real one; it keeps no rhythm (over twenty seeds the gaps
//   between its walks, strikes and wing spreads spread widely), and now and
//   then it opens its wings and holds them open, still, for seconds (never
//   beating them), standing where it was, with the sun up its back to it;
// - a splash across the pond makes it look, not go; a stone coming down
//   near it puts it up before it lands, and it takes off the way it faces
//   (over twenty seeds) and climbs away out of sight
//   without a jump between frames; it comes back after its absence (put off
//   while things are thrown near where it will come down) and lands
//   somewhere new on the far bank, its heading its own, smoothly, flaring
//   (pitched up, its wings up as it touches down, its pitch and neck never
//   jumping), then folding its wings within two seconds; then it stands;
//   with something thrown at its spot as it comes in it goes round again,
//   drawn nowhere but along its way on a display whose frames are not whole
//   physics steps; put back to its start (reset), it sees a throw coming
//   as soon as a heron just shown;
// - after dark the day's birds are gone, and where they live black-crowned
//   night herons come over instead (BIRDS_AT_NIGHT), flown and checked as
//   every flying bird is; none at the others (setConditions);
// - a picture kind that turns has a head-on frame (src/birdSprites.js), so
//   it never flips to its mirror image mid-turn;
// - the population draws no Math.random (its own seeded stream);
// - at any frame rate: stepped at the physics step, as src/main.js steps
//   it, and posed at 60 or 144 frames a second, every pose at the same
//   moment is the same;
// - the cost: a frame's posing under 0.05 ms of the main thread's time
//   (tools/cost-clock.mjs); the one number a seed gives (src/spray.js
//   seededOnce) is its sequence's first;
// - the views (src/birdViews.js), off the GPU, their files read from disk:
//   each keeps meshes only for its own birds and fetches only what the
//   place's hour shows (no models' catalogue where no kind has a model, no
//   night's pictures by day); and the mirror is asked to draw a bird again
//   when it is not as it was last drawn, however often it was posed since.
import * as THREE from 'three';
import { costClock, costSince } from './cost-clock.mjs';
import { BirdPopulation, BIRDS_BY_PLACE, BIRDS_WHEN_FROZEN, BIRDS_AT_NIGHT, BIRD_KINDS, HERON, EYE as LAYOUT_EYE, EYE_HEIGHT } from '../src/birds.js';
import { createBirdViews } from '../src/birdViews.js';
import { seededRandom, seededOnce } from '../src/spray.js';
import { PHYSICS_STEP } from '../src/rock.js';
import { KOI_SHORE, koiShoreRadius, koiShoreDistance, koiFloorDepthAt } from '../src/pondFloor.js';
import { plantingFront } from '../src/koiGarden.js';
import { buildStandingModel } from '../src/birdMeshes.js';
import { poseStanding, FLIGHT, JOINT_COUNT } from '../src/birdRig.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from '../src/places.js';

const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

const EYE = new THREE.Vector3(LAYOUT_EYE.x, EYE_HEIGHT, LAYOUT_EYE.z);   // the home view's eye, as the birds are laid out from it (src/main.js VIEWS.shore)
const THROW_REACH = 9;   // m: farther than anything thrown goes from the eye (it lands in the water's 6 m patch, at most 6.2 m off, its arc a few metres up)
const FRAME_TOP = THREE.MathUtils.degToRad(7.4);   // the home view's frame reaches this far above the horizon (48° high, looking 16.6° down)
const DAY = { solarElevation: 37, sunDirection: new THREE.Vector3(0.6, 0.6, -0.5).normalize() };   // as the page gives them (src/main.js applySky)
const NIGHT = { solarElevation: -28.3 };   // Lakeside Night: lit by a moon high up, the true sun well down
const realRandom = Math.random;
plantingFront(0, 0, 0, 0);   // the garden's catch table built first (its geometries' ids are three's Math.random), as the page has it by the time the heron stands
Math.random = () => { throw new Error('the birds drew Math.random'); };

/** A population of `place` run from 0 to `seconds`, stepped at the physics step and posed every `frame`: each frame's poses. */
function run(place, seconds, frame, { things = () => [], splashes = [], conditions = DAY, frozen = false, view = null, seed = 1 } = {}) {
  const birds = new BirdPopulation({ seed });
  if (view !== null) birds.setView(view);
  birds.setPlace(place, { frozen });
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
    frames.push({ time, birds: birds.report().filter((bird) => bird.night === birds.dark) });   // the hour's birds (the day's, or after dark the night's)
  }
  return { birds, frames };
}

// Who lives where: some at every place but the Pool (its view looks down into the water, at no sky).
for (const place of Object.keys(PLACES)) {
  const birds = new BirdPopulation();
  birds.setPlace(place);
  const expected = (BIRDS_BY_PLACE[place] ?? []).reduce((sum, group) => sum + group.count, 0);
  const atNight = (BIRDS_AT_NIGHT[place] ?? []).reduce((sum, group) => sum + group.count, 0);
  check((place === 'pool' ? expected === 0 : expected > 0) && birds.birds.length === expected + atNight, `${place}: ${birds.birds.length} birds (${[...new Set(birds.birds.map((bird) => BIRD_KINDS[bird.kind].name))].join(', ')})`);
}
{
  const none = new BirdPopulation(); none.setPlace('none');
  check(none.birds.length === 0, "'none': no birds");
  // Frozen, no bird stands on the ice: the Koi pond's heron flies over instead.
  const frozen = new BirdPopulation(); frozen.setPlace('koi', { frozen: true });
  check(frozen.birds.length > 0 && frozen.birds.every((bird) => bird.habit === 'visit'), `koi, frozen: no heron standing on the ice (${frozen.birds.map((bird) => `${bird.kind} ${bird.habit}s`).join(', ')})`);
  const thawed = new BirdPopulation(); thawed.setPlace('loch', { frozen: true });
  check(thawed.birds.length === BIRDS_BY_PLACE.loch[0].count, 'frozen elsewhere: the same birds');
}

// Every place's flying birds over ten minutes.
const OUT_OF_FRAME = THREE.MathUtils.degToRad(45);   // a wide screen's frame reaches 38° either side of the home view's line
const bearingOf = (bird) => Math.atan2(bird.x - EYE.x, -(bird.z - EYE.z));
const flyingRuns = [...Object.keys(BIRDS_BY_PLACE).map((place) => [place, place, false, false]), ...Object.keys(BIRDS_WHEN_FROZEN).map((place) => [`${place} (frozen)`, place, true, false]),
  ...Object.keys(BIRDS_AT_NIGHT).map((place) => [`${place} (night)`, place, false, true])];
const groupsOf = (where, frozen, night) => (night ? BIRDS_AT_NIGHT : frozen ? BIRDS_WHEN_FROZEN : BIRDS_BY_PLACE)[where];
for (const [label, where, frozen, night] of flyingRuns) {
  const place = label;
  const groups = groupsOf(where, frozen, night);
  if (!groups.some((group) => group.habit === 'visit')) continue;
  const { frames } = run(where, 600, 1 / 60, { frozen, conditions: night ? NIGHT : DAY });
  const cruise = BIRD_KINDS[groups[0].kind].cruise;
  let nearest = Infinity, farthest = 0, lowest = Infinity, highestElevation = -Infinity, fastest = 0, slowest = Infinity, steepestBank = 0, fastestRoll = 0, biggestJump = 0;
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
      if (Math.abs(bearingOf(bird)) < OUT_OF_FRAME) farthest = Math.max(farthest, distance);   // as far as it is seen
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
  // The Koi pond's garden is a photograph on a sphere 35 m round the eye (src/sky.js `garden` backdrop): its birds
  // fly inside it in the frame (out beyond its sides, where visits come and go, nothing is seen), never behind the picture.
  if (where === 'koi') check(farthest < 34, `${place}: they fly inside the garden's backdrop: farthest in the frame ${farthest.toFixed(1)} m from the eye`);
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

// On an upright phone (390×844: the home view's frame 15.5° either side of its line, src/main.js frameFov's 62° high),
// visits are laid out for its narrower frame (BirdPopulation.setView): each still begins and ends out beyond the
// frame's sides, out of reach, banked no more than on a wide screen, and over ten minutes (four seeds) a bird is in
// the frame about as much of the time as in a wide screen's.
const PHONE_FRAME = 15.5, WIDE_FRAME = 38.4;
const inFrameShare = (where, frozen, night, half, view) => {
  let share = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const birds = new BirdPopulation({ seed });
    if (view !== null) birds.setView(view);
    birds.setPlace(where, { frozen }); birds.setConditions(night ? NIGHT : DAY);
    let seen = 0, samples = 0;
    for (let time = 0; time < 600; time += 0.1, samples++) {
      birds.showAt(time);
      if (birds.birds.some((bird) => bird.pose.shown && Math.abs(bearingOf(bird.pose)) < THREE.MathUtils.degToRad(half))) seen++;
    }
    share += seen / samples / 4;
  }
  return share;
};
for (const [label, where, frozen, night] of flyingRuns) {
  const groups = groupsOf(where, frozen, night);
  if (!groups.some((group) => group.habit === 'visit')) continue;
  const { frames } = run(where, 600, 1 / 60, { frozen, view: PHONE_FRAME, conditions: night ? NIGHT : DAY });
  let nearest = Infinity, steepestBank = 0, inside = 0;
  frames.forEach((frame, index) => frame.birds.forEach((bird, which) => {
    const before = index ? frames[index - 1].birds[which] : bird;
    if (bird.shown !== before.shown && Math.abs(bearingOf(bird.shown ? bird : before)) < THREE.MathUtils.degToRad(PHONE_FRAME + 15)) inside++;
    if (!bird.shown) return;
    nearest = Math.min(nearest, Math.hypot(bird.x - EYE.x, bird.z - EYE.z));
    steepestBank = Math.max(steepestBank, Math.abs(bird.bank));
  }));
  const phone = inFrameShare(where, frozen, night, PHONE_FRAME, PHONE_FRAME), wide = inFrameShare(where, frozen, night, WIDE_FRAME, null);
  check(inside === 0 && nearest > THROW_REACH && steepestBank <= THREE.MathUtils.degToRad(35) + 1e-9, `${label}, upright phone: every visit begins and ends beyond the frame's sides (${inside} inside), nearest ${nearest.toFixed(1)} m, banked at most ${THREE.MathUtils.radToDeg(steepestBank).toFixed(1)}°`);
  check(phone > 0.8 * wide && phone < 1.5 * wide, `${label}, upright phone: a bird in its frame ${(phone * 100).toFixed(0)}% of the time, a wide screen's ${(wide * 100).toFixed(0)}%`);
}
{
  // Laid out as it always was for a frame as wide as a 16:9 screen's or wider.
  const wide = new BirdPopulation({ seed: 3 }), wider = new BirdPopulation({ seed: 3 });
  wider.setView(50);
  for (const birds of [wide, wider]) { birds.setPlace('cove'); birds.setConditions(DAY); }
  let same = true;
  for (let time = 0; time < 300; time += 0.5) {
    wide.showAt(time); wider.showAt(time);
    same &&= wide.birds.every((bird, which) => bird.pose.shown === wider.birds[which].pose.shown && bird.pose.x === wider.birds[which].pose.x);
  }
  check(same, 'a frame wider than 16:9 lays visits out as a 16:9 one does');
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

// Where it stands differs from seed to seed (src/birds.js laySpot): along the far bank, all of it inside an upright
// phone's frame (62° high at about 9:19.5, so about 15.5° either side of straight ahead; its body and its walks need a
// few degrees more), side on.
{
  const bearings = [];
  let sideOn = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const birds = new BirdPopulation({ seed });
    birds.setPlace('koi');
    const { spot } = birds.birds[0];
    bearings.push(THREE.MathUtils.radToDeg(Math.atan2(spot.x - EYE.x, -(spot.z - EYE.z))));
    const toEye = Math.atan2(-(EYE.z - spot.z), EYE.x - spot.x);
    if (Math.abs(Math.cos(spot.heading - toEye)) < 0.45) sideOn++;
  }
  const least = Math.min(...bearings), most = Math.max(...bearings);
  check(most - least > 12 && least > -13.5 && most < 12, `it stands somewhere of its own each time: ${least.toFixed(1)}° to ${most.toFixed(1)}° from straight ahead over 20 seeds`);
  check(sideOn === 20, `side on to the eye (${sideOn} of 20)`);
}

// Its legs are seen (src/birds.js CLEAR): over 40 seeds and four stays each, at its spot and all along where it may walk,
// the lines from the eye (the home view's) to its feet, shins and heels, either foot, run clear of the garden's planting
// by 3 cm (src/koiGarden.js plantingFront: where the drawn garden begins behind the waterline, height by height).
{
  const [centreX, centreZ] = KOI_SHORE.centre;
  const inPlanting = (x, y, z) => {
    const toEyeX = EYE.x - x, toEyeY = EYE.y - y, toEyeZ = EYE.z - z, flat = Math.hypot(toEyeX, toEyeZ);
    for (let along = 0; along <= 1.5; along += 0.01) {
      const pointX = x + toEyeX / flat * along, pointY = y + toEyeY / flat * along, pointZ = z + toEyeZ / flat * along;
      const angle = Math.atan2(pointZ - centreZ, pointX - centreX);
      const inland = Math.hypot(pointX - centreX, pointZ - centreZ) - koiShoreRadius(angle);
      if (inland < -0.4) return false;   // out over the water, toward the eye
      if (inland > plantingFront(pointX, pointY, pointZ, 0.005) - 0.03) return true;
    }
    return false;
  };
  const legsSeen = (angle, offshore) => {
    const radius = koiShoreRadius(angle) - offshore;
    const at = (turned) => [centreX + Math.cos(turned) * radius, centreZ + Math.sin(turned) * radius];
    const [x, z] = at(angle), [aheadX, aheadZ] = at(angle + 0.01 / radius);
    const alongX = (aheadX - x) / 0.01, alongZ = (aheadZ - z) / 0.01;
    return [-0.07, 0, 0.07].every((side) => [0.03, 0.12, 0.22].every((height) => !inPlanting(x + alongX * side, height, z + alongZ * side)));
  };
  let spots = 0, hidden = 0, walksHidden = 0, reach = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const birds = new BirdPopulation({ seed });
    birds.setPlace('koi');
    const heron = birds.birds[0];
    for (let stay = 0; stay < 4; stay++) {
      birds.laySpot(heron, stay);
      const { spot } = heron;
      spots++;
      reach += spot.reach[1] - spot.reach[0];
      if (!legsSeen(spot.angle, spot.offshore)) hidden++;
      const steps = Math.round((spot.reach[1] - spot.reach[0]) / 0.01);
      for (let step = 0; step <= steps; step++) {
        const offset = spot.reach[0] + (spot.reach[1] - spot.reach[0]) * step / Math.max(steps, 1);
        if (!legsSeen(spot.angle + offset / spot.radius, spot.offshore)) { walksHidden++; break; }
      }
    }
  }
  check(hidden === 0 && walksHidden === 0, `its legs are seen where it stands (hidden at ${hidden} of ${spots} spots) and walks (${walksHidden})`);
  check(reach / spots > 0.3, `room to walk, ${(reach / spots).toFixed(2)} m on average`);
}

// The heron's ways, smooth (src/birds.js sprung): it turns about unhurried, stepping round as it turns (never spinning
// on its feet), holds still between its moves, and peers into the water a while before it strikes.
{
  const { frames } = run('koi', 600, 1 / 60);   // long enough for several hunts, to one side as well as ahead
  let fastestTurn = 0, spun = 0, still = 0, longestPeer = 0, peering = 0, struck = 0, widestAim = 0;
  for (let index = 1; index < frames.length; index++) {
    const heron = heronAt(frames[index]), before = heronAt(frames[index - 1]);
    const rate = Math.abs(Math.atan2(Math.sin(heron.heading - before.heading), Math.cos(heron.heading - before.heading))) * 60;
    fastestTurn = Math.max(fastestTurn, rate);
    if (rate > 0.6 && heron.walking < 0.15) spun++;
    if (['heading', 'look', 'neck', 'strike', 'crouch', 'aim', 'bill', 'x', 'z'].every((key) => heron[key] === before[key])) still++;
    // Peering: its bill pointed down at the water, its neck not yet thrown (src/birds.js layHunt); a stab from it
    // passes the strike's line's 0.8 in a frame or two.
    if (heron.bill < -0.4 && heron.strike < 0.5) peering++;
    else if (heron.strike > 0.8 && before.strike <= 0.8) { longestPeer = Math.max(longestPeer, peering); peering = 0; struck++; widestAim = Math.max(widestAim, Math.abs(heron.aim)); }
    else if (heron.strike < 0.5 && heron.bill > -0.2) peering = 0;   // (as it stabs, its bill comes level a frame before its neck is out)
  }
  check(fastestTurn < 3.2, `it turns about unhurried: at most ${fastestTurn.toFixed(2)} rad/s`);
  check(spun === 0, `it steps round as it turns (${spun} frames turning on still feet)`);
  check(still / frames.length > 0.4, `it holds still between its moves (${(100 * still / frames.length).toFixed(0)}% of frames)`);
  check(struck > 0 && longestPeer / 60 > 0.6, `it peers into the water a while before it strikes (${(longestPeer / 60).toFixed(1)} s)`);
  check(widestAim > 0.1, `it strikes to one side as well as ahead (up to ${widestAim.toFixed(2)} rad)`);
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

// How often it hunts (src/birds.js HERON `strike`): about as often as adult grey herons fishing in July (0.61 attacks
// and 0.37 captures a minute, Gwiazda et al. 2017), over ten seeds of ten minutes.
{
  let stabs = 0, catches = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const birds = new BirdPopulation({ seed });
    birds.setPlace('koi');
    birds.setConditions(DAY);
    let before = null;
    for (let time = 0; time <= 600; time += 1 / 20) {
      birds.showAt(time);
      const heron = { ...birds.birds[0].pose };
      if (before && heron.strike > 0.8 && before.strike <= 0.8) stabs++;
      if (before && heron.prey > 0.5 && before.prey <= 0.5) catches++;
      before = heron;
    }
  }
  const perMinute = (count) => count / 100;
  check(perMinute(stabs) > 0.45 && perMinute(stabs) < 0.8 && perMinute(catches) > 0.25 && perMinute(catches) < 0.5, `it strikes ${perMinute(stabs).toFixed(2)} times a minute and catches ${perMinute(catches).toFixed(2)} fish, as adult grey herons do`);
}

// With the sun up, it turns its back to the sun before it spreads its wings (src/birds.js HERON `spread`), on the spot,
// stepping round, and holds still facing that way while they are open; the same at 60 and 144 frames a second.
{
  const { sunDirection } = DAY, away = Math.atan2(sunDirection.z, -sunDirection.x);
  let held = 0, widest = 0, turnedOpen = 0, moved = 0, differs = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const poses = [60, 144].map((rate) => {
      const birds = new BirdPopulation({ seed });
      birds.setPlace('koi');
      birds.setConditions({ ...DAY, sunDirection });
      const list = [];
      for (let frame = 0; frame <= 300 * rate; frame++) {
        const time = frame / rate;
        birds.showAt(time);
        if (frame % (rate / 4) === 0 || (rate === 144 && frame % 36 === 0)) list.push({ time, ...birds.birds[0].pose });
      }
      return list;
    });
    const [at60, at144] = poses;
    at60.forEach((heron, index) => {
      const other = at144.find((pose) => Math.abs(pose.time - heron.time) < 1e-9);
      if (other && (Math.abs(other.heading - heron.heading) > 1e-9 || other.spread !== heron.spread)) differs++;
      const before = at60[index - 1];
      if (heron.spread < 0.8) return;
      held++;
      widest = Math.max(widest, Math.abs(Math.atan2(Math.sin(heron.heading - away), Math.cos(heron.heading - away))));
      if (before?.spread >= 0.8 && Math.abs(heron.heading - before.heading) > 0.02) turnedOpen++;
      if (before?.spread >= 0.8 && (heron.x !== before.x || heron.z !== before.z)) moved++;
    });
  }
  check(held > 50 && widest < HERON.spread.aside + 0.1, `with the sun up, it spreads its wings with its back to the sun: within ${THREE.MathUtils.radToDeg(widest).toFixed(0)}° of facing away from it (${held} quarter seconds open)`);
  check(turnedOpen === 0 && moved === 0, `it turns before it opens them, and holds still while they are open (${turnedOpen} turning, ${moved} moving)`);
  check(differs === 0, `turning to the sun, the same at 60 and 144 frames a second (${differs} poses differ)`);
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
  check(back && back - gone.time >= 20, `it stays away a while (${back ? (back - gone.time).toFixed(0) : '?'} s)`);
  probe.laySpot(probe.birds[0], 1);
  const next = probe.birds[0].spot;   // where it comes down after its first flight (src/birds.js laySpot)
  check(Math.hypot(next.x - spot.x, next.z - spot.z) > 0.3, `somewhere new (${Math.hypot(next.x - spot.x, next.z - spot.z).toFixed(1)} m from where it stood)`);
  // Its feet come down on its spot, reaching ahead of its hips (pose.feetAhead along its heading).
  const feetX = landed ? landed.pose.x + Math.cos(landed.pose.heading) * landed.pose.feetAhead : NaN, feetZ = landed ? landed.pose.z - Math.sin(landed.pose.heading) * landed.pose.feetAhead : NaN;
  check(landed && Math.hypot(feetX - next.x, feetZ - next.z) < 1e-3 && Math.abs(landed.pose.heading - next.heading) < 0.05, `it comes down where it was going, facing as it meant to (${(Math.hypot(feetX - next.x, feetZ - next.z) * 100).toFixed(2)} cm off)`);
  check(thrown.frames.at(-1).birds[0].mode === 'stand', 'and stands again');
  // Its landing (src/birds.js `land`): a flare, pitched well up; down, its wings up still, then folded; its pitch and
  // neck carried over from the flare, never jumping.
  const landing = thrown.frames.filter((frame) => frame.time >= back && frame.time <= landed.time + 3).map(heronAt);
  const flarePitch = Math.max(...landing.filter((pose) => pose.mode === 'land').map((pose) => pose.pitch));
  const down = landing.findIndex((pose) => pose.mode === 'stand');
  const pitchJump = Math.abs(landing[down].pitch - landing[down - 1].pitch), neckJump = Math.abs(landing[down].neck - landing[down - 1].neck);
  const foldedAt = landing.slice(down).findIndex((pose) => pose.fold > 0.999);
  check(flarePitch > 0.6, `it flares as it lands, pitched up ${THREE.MathUtils.radToDeg(flarePitch).toFixed(0)}°`);
  check(landing[down].fold < 0.05 && landing[down].beat > 0.95, 'its wings still up as it touches down');
  check(pitchJump < 0.05 && neckJump < 0.05, `its pitch and neck carry over from the flare (${pitchJump.toFixed(3)} rad, ${neckJump.toFixed(3)} of its neck in the frame it touches down)`);
  check(foldedAt > 0 && foldedAt / 60 < 2, `then it folds them (in ${(foldedAt / 60).toFixed(2)} s)`);

  // Things keep being thrown near where it will come down while it is away: it stays away until they stop.
  const nearNext = (thing) => ({ ...thing, position: thing.position.clone().add(new THREE.Vector3(next.x - spot.x, 0, next.z - spot.z)) });
  const pelted = (time) => (time > 20 && time < 115 && (time % 4) < 1 ? stone(landAt + (time % 4) - 0.6).map(nearNext) : stone(time));
  const busy = run('koi', 140, 1 / 60, { things: pelted, splashes: [{ time: landAt, x: landX, z: landZ }] });
  const busyBack = busy.frames.find((frame) => frame.time > 20 && heronAt(frame).mode === 'land');
  check(!busyBack || busyBack.time > 115, `it is not back while things are thrown near its spot (back at ${busyBack ? busyBack.time.toFixed(0) : 'not yet'} s)`);
}

// It takes off the way it faces (src/birds.js flush): over twenty seeds, its first second in the air goes along its heading.
{
  let backward = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const birds = new BirdPopulation({ seed });
    birds.setPlace('koi');
    birds.setConditions(DAY);
    const heron = birds.birds[0], { spot } = heron;
    birds.flush(heron, 5, spot.x + 0.5, spot.z + 0.5);
    birds.showAt(6.3);
    if ((heron.pose.x - spot.x) * Math.cos(spot.heading) - (heron.pose.z - spot.z) * Math.sin(spot.heading) <= 0) backward++;
  }
  check(backward === 0, `it takes off the way it faces (${backward} of 20 the other way)`);
}

// Nothing thrown ever comes through it (src/birds.js WARY): tosses, lobs and hard throws at it and round it, and
// stones skipped at it, each at a moment of its own (walking, hunting, standing), and things thrown where it is coming
// down as it lands. Each thing flies on physics of its own here (a little air drag; skipping off the water a little
// livelier than the heron reckons, then sinking and slowing), and wherever it passes within reach, every vertex of the
// drawn heron (src/birdMeshes.js, skinned as the shader skins it) is kept clear of it.
{
  const entry = JSON.parse(readFileSync(new URL('../assets/birds/models.json', import.meta.url))).heron;
  Math.random = realRandom;   // three.js's geometry ids, not the birds'
  const model = buildStandingModel(entry);
  Math.random = () => { throw new Error('the birds drew Math.random'); };
  const { position, joints, jointBlend, part } = model.geometry.attributes;
  const out = new Float32Array(JOINT_COUNT * 16), first = new THREE.Vector3(), second = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const vertices = [];
  for (let index = 0; index < position.count; index += 2) if (part.getX(index) < 2.5) vertices.push(index);   // its fish is scaled to nothing until caught
  /** The least distance (m) from the drawn heron (posed as `pose`) to the segment from `from` to `to`. */
  const clearance = (pose, from, to) => {
    poseStanding(out, model, FLIGHT.heron, pose);
    let least = Infinity;
    const segment = new THREE.Line3(from, to), closest = new THREE.Vector3();
    for (const index of vertices) {
      first.fromBufferAttribute(position, index).applyMatrix4(matrix.fromArray(out, joints.getX(index) * 16));
      second.fromBufferAttribute(position, index).applyMatrix4(matrix.fromArray(out, joints.getY(index) * 16));
      first.lerp(second, jointBlend.getX(index));
      segment.closestPointToPoint(first, true, closest);
      least = Math.min(least, closest.distanceTo(first));
    }
    return least;
  };
  const GRAVITY = 9.81, STEP = 1 / 240, hand = new THREE.Vector3(0.25, 0.95, 2.2);
  /** A thing let go at `at` from `from` with `velocity`, its radius `radius`, flown on (this probe's own physics). */
  const fly = (thing, step) => {
    const { position: where, velocity } = thing;
    if (thing.state === 'air') {
      velocity.multiplyScalar(1 - 0.01 * velocity.length() * step);
      velocity.y -= GRAVITY * step;
      where.addScaledVector(velocity, step);
      if (where.y <= 0 && velocity.y < 0) {
        const level = Math.hypot(velocity.x, velocity.z);
        if (level > 3 && -velocity.y < 0.7 * level) { velocity.y = -0.62 * velocity.y; velocity.x *= 0.9; velocity.z *= 0.9; where.y = 0; }
        else { thing.state = 'water'; velocity.x *= 0.35; velocity.z *= 0.35; velocity.y = -0.6; }
      }
    } else if (thing.state === 'water') {
      velocity.x *= Math.exp(-3 * step); velocity.z *= Math.exp(-3 * step);
      where.addScaledVector(velocity, step);
      const bed = -koiFloorDepthAt(where.x, where.z);
      if (where.y < bed + thing.radius) { where.y = bed + thing.radius; velocity.set(0, 0, 0); thing.state = 'rest'; }
    }
  };
  const tossTime = (distance, power, manner) => {
    const normal = THREE.MathUtils.clamp(0.42 + 0.11 * distance, 0.5, 1.0);
    if (manner === 'lob') return { soft: 1.3, normal: 1.5, hard: 1.7 }[power];
    if (power === 'soft') return normal * 1.3;
    return power === 'hard' ? 0.72 * normal * 0.85 : normal;   // a hard throw: fast and flat (a little faster than src/rock.js's, the harder case)
  };
  let trials = 0, hits = 0, worst = Infinity, worstLabel = '';
  const trial = (seed, at, launch, label, landing = false) => {
    const birds = new BirdPopulation({ seed });
    birds.setPlace('koi'); birds.setConditions(DAY);
    const heron = birds.birds[0];
    let time = 0;
    if (landing) { birds.flush(heron, 0.5, heron.spot.x + 0.5, heron.spot.z + 0.5); }
    while (time < at) { time += STEP; birds.step(time, []); }
    const thing = launch(birds, heron, time);
    const before = new THREE.Vector3();
    trials++;
    let least = Infinity;
    for (let index = 0; index < 4 / STEP && thing.state !== 'rest'; index++) {
      before.copy(thing.position);
      fly(thing, STEP);
      time += STEP;
      birds.step(time, thing.state === 'rest' ? [] : [thing]);
      birds.showAt(time);
      const pose = heron.pose;
      if (!pose.shown) continue;
      const centreY = pose.flying ? pose.y : pose.y + 0.6;
      const apart = new THREE.Line3(before, thing.position).closestPointToPoint(new THREE.Vector3(pose.x, centreY, pose.z), true, new THREE.Vector3()).distanceTo(new THREE.Vector3(pose.x, centreY, pose.z));
      if (apart > 1.7 + thing.radius) continue;
      least = Math.min(least, clearance(pose, before, thing.position) - thing.radius);
    }
    if (least <= 0.02) hits++;
    if (least < worst) { worst = least; worstLabel = label; }
  };
  // At it and round it, from the hand: tosses, lobs, hard throws.
  for (let seed = 1; seed <= 6; seed++) {
    for (const [manner, power] of [['toss', 'soft'], ['toss', 'normal'], ['toss', 'hard'], ['lob', 'normal'], ['lob', 'hard']]) {
      for (const [aside, radius] of [[0, 0.03], [0.4, 0.05], [0.9, 0.12], [1.6, 0.04]]) {
        const at = 4 + ((seed * 7.3 + aside * 11 + radius * 50) % 40);
        trial(seed, at, (birds, heron, time) => {
          const place = birds.standingPlace(heron, time, {});
          const turn = seed * 2.1 + aside * 3;
          const target = new THREE.Vector3(place.x + Math.cos(turn) * aside, -koiFloorDepthAt(place.x, place.z) * 0, place.z + Math.sin(turn) * aside);
          const flight = tossTime(hand.distanceTo(target), power, manner);
          const velocity = target.clone().sub(hand).divideScalar(flight); velocity.y += 0.5 * GRAVITY * flight;
          return { state: 'air', position: hand.clone(), velocity, radius };
        }, `${manner} ${power} ${aside} m off, seed ${seed}`);
      }
    }
  }
  // Skipped at it: let go nearly level a little over the water, touching down a few metres short of it.
  for (let seed = 1; seed <= 6; seed++) {
    for (const speed of [7, 10, 13]) {
      for (const [short, aside] of [[1.5, 0], [3, 0.2], [4.5, -0.3]]) {
        const at = 4 + ((seed * 5.1 + speed + short * 3) % 40);
        trial(seed, at, (birds, heron, time) => {
          const place = birds.standingPlace(heron, time, {});
          const from = new THREE.Vector3(0.25, 0.3, 2.2), toward = new THREE.Vector3(place.x + aside, 0, place.z).sub(from).setY(0).normalize();
          const touch = new THREE.Vector3(place.x + aside, 0, place.z).addScaledVector(toward, -short);
          const level = Math.hypot(touch.x - from.x, touch.z - from.z), flight = level / speed;
          const velocity = new THREE.Vector3(toward.x * speed, (-from.y + 0.5 * GRAVITY * flight * flight) / flight, toward.z * speed);
          return { state: 'air', position: from, velocity, radius: 0.03 };
        }, `skip ${speed} m/s, touching ${short} m short, seed ${seed}`);
      }
    }
  }
  // Thrown where it is coming down, as it comes in to land: it goes round again.
  for (let seed = 1; seed <= 6; seed++) {
    const probe = new BirdPopulation({ seed }); probe.setPlace('koi'); probe.setConditions(DAY);
    probe.flush(probe.birds[0], 0.5, probe.birds[0].spot.x + 0.5, probe.birds[0].spot.z + 0.5);
    const landStart = probe.birds[0].returnAt, glide = 6.5;
    for (const ahead of [0.6, 1.5, 3]) {
      trial(seed, landStart + glide - ahead, (birds, heron) => {
        const target = new THREE.Vector3(heron.spot.x + 0.3, 0, heron.spot.z - 0.2);
        const flight = tossTime(hand.distanceTo(target), 'normal', 'toss');
        const velocity = target.clone().sub(hand).divideScalar(flight); velocity.y += 0.5 * GRAVITY * flight;
        return { state: 'air', position: hand.clone(), velocity, radius: 0.05 };
      }, `thrown ${ahead} s before it lands, seed ${seed}`, true);
    }
  }
  check(hits === 0, `nothing thrown comes through it: ${hits} of ${trials} throws at it touch it (the nearest ${(worst * 100).toFixed(1)} cm clear: ${worstLabel})`);
}

// After dark: none.
{
  const { frames } = run('cove', 5, 1 / 60, { conditions: NIGHT });
  check(frames.every((frame) => frame.birds.every((bird) => !bird.shown)), 'after dark, no birds are about at the cove');
  // Where night herons live, after dark they come over and the day's birds are gone; by day, the other way round.
  for (const place of Object.keys(BIRDS_AT_NIGHT)) {
    const seen = (conditions) => {
      const birds = new BirdPopulation({ seed: 1 });
      birds.setPlace(place); birds.setConditions(conditions);
      const kinds = new Set();
      for (let time = 0; time < 600; time += 0.5) { birds.showAt(time); for (const bird of birds.birds) if (bird.pose.shown) kinds.add(bird.kind); }
      return [...kinds];
    };
    const byNight = seen(NIGHT), byDay = seen(DAY);
    check(byNight.length === 1 && byNight[0] === 'nightHeron' && byDay.length > 0 && !byDay.includes('nightHeron'), `${place}: after dark night herons come over (${byNight.join(', ')}), by day the day's birds (${byDay.join(', ')})`);
  }
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

// On any visit to the page (each draws a seed of its own, src/main.js): thirty seeds of every place's flying birds, by
// day and after dark, and none comes much nearer the eye than its group is laid out from. A path cuts a little inside
// the points it is laid through; a thermal, its circles and its way in and out, is kept out as the rest is (src/birds.js
// layVisit: Lakeside's fish eagle once wheeled 12 m from the eye, its group laid out from 35).
{
  for (const [table, conditions, when] of [[BIRDS_BY_PLACE, DAY, ''], [BIRDS_AT_NIGHT, NIGHT, ' (night)']]) {
    for (const [place, groups] of Object.entries(table)) {
      if (!groups.some((group) => group.habit === 'visit')) continue;
      const near = Math.min(...groups.map((group) => group.distance[0]));
      let nearest = Infinity, nearestSeed = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const birds = new BirdPopulation({ seed }); birds.setPlace(place); birds.setConditions(conditions);
        for (let time = 0; time < 600; time += 0.2) {
          birds.showAt(time);
          for (const { pose } of birds.birds) {
            if (!pose.shown) continue;
            const distance = Math.hypot(pose.x - EYE.x, pose.z - EYE.z);
            if (distance < nearest) { nearest = distance; nearestSeed = seed; }
          }
        }
      }
      check(nearest > 0.75 * near, `${place}${when}: over thirty seeds its birds keep their distance: nearest ${nearest.toFixed(1)} m from the eye (seed ${nearestSeed}; laid out from ${near} m)`);
    }
  }
}

// Coming in to land with something thrown down at its spot, the heron goes round again (src/birds.js goAround), and is
// drawn nowhere but along its way. A frame is posed at its own time, up to a physics step before the step in which it
// turned away: on a display whose frames are not whole steps it was once drawn for a frame as standing at its spot,
// then flying again 17 m off.
{
  let wentRound = 0, longestStep = 0;
  for (let trial = 0; trial < 12; trial++) {
    const birds = new BirdPopulation({ seed: 1 + (trial % 3) }); birds.setPlace('koi'); birds.setConditions(DAY);
    const heron = birds.birds[0], frame = 1 / 60 + trial * 1e-4;
    let stepsTime = 0, time = 0, landingSince = null, thing = null, went = null, before = null;
    while (time < 180 && (went === null || time < went + 1)) {
      time += frame;
      while (stepsTime < time) {
        const stepBefore = stepsTime;
        stepsTime += PHYSICS_STEP;
        if (stepBefore < 0.5 && stepsTime >= 0.5) birds.startle(stepsTime, heron.spot.x + 0.3, heron.spot.z);   // put up, to come back
        if (heron.mode === 'land') landingSince ??= stepsTime;
        // Two seconds or more into its glide, a stone let fall from over its spot.
        if (landingSince !== null && !thing && stepsTime - landingSince >= 2 + trial * 0.2) thing = { state: 'air', radius: 0.03, position: { x: heron.spot.x, y: heron.spot.y + 2.5, z: heron.spot.z }, velocity: { x: 0, y: -2, z: 0 } };
        if (thing) { thing.velocity.y -= 9.81 * PHYSICS_STEP; thing.position.y += thing.velocity.y * PHYSICS_STEP; }
        birds.step(stepsTime, thing && thing.position.y > heron.spot.y ? [thing] : []);
        if (thing && went === null && heron.mode === 'flee') went = stepsTime;
      }
      birds.showAt(time);
      const { x, y, z } = heron.pose;
      if (thing && before && heron.pose.shown) longestStep = Math.max(longestStep, Math.hypot(x - before.x, y - before.y, z - before.z));
      before = { x, y, z };
    }
    if (went !== null) wentRound++;
  }
  check(wentRound === 12 && longestStep < 0.5, `coming in to land with a stone falling at its spot, it goes round again (${wentRound} of 12), no frame of it more than ${longestStep.toFixed(2)} m from the last`);
}

// Put back to its start (reset: src/main.js clearPond, the clock back at 0), it keeps nothing of the earlier clock: a
// stone thrown flat at it is seen coming as soon as by a heron just shown (its look-ahead was once put off until the
// clock passed where it had been).
{
  const flatThrow = (birds) => {
    const heron = birds.birds[0];
    const toX = heron.spot.x - EYE.x, toZ = heron.spot.z - EYE.z, range = Math.hypot(toX, toZ);
    const thing = { state: 'air', radius: 0.03, position: { x: EYE.x, y: 1, z: EYE.z }, velocity: { x: toX / range * 14, y: 1.2, z: toZ / range * 14 } };
    for (let stepsTime = PHYSICS_STEP; stepsTime < 2; stepsTime += PHYSICS_STEP) {
      thing.velocity.y -= 9.81 * PHYSICS_STEP;
      thing.position.x += thing.velocity.x * PHYSICS_STEP; thing.position.y += thing.velocity.y * PHYSICS_STEP; thing.position.z += thing.velocity.z * PHYSICS_STEP;
      birds.step(stepsTime, [thing]);
      if (heron.mode === 'flee') return stepsTime;
    }
    return Infinity;
  };
  const fresh = new BirdPopulation(); fresh.setPlace('koi'); fresh.setConditions(DAY);
  const played = new BirdPopulation(); played.setPlace('koi'); played.setConditions(DAY);
  const lying = { state: 'rest', radius: 0.03, position: { x: 0, y: -0.5, z: 1.5 }, velocity: { x: 0, y: 0, z: 0 } };
  for (let time = PHYSICS_STEP; time < 30; time += PHYSICS_STEP) played.step(time, [lying]);
  played.reset(0);
  const freshWent = flatThrow(fresh), playedWent = flatThrow(played);
  check(Number.isFinite(freshWent) && playedWent === freshWent, `put back to its start after half a minute of play, the heron sees a flat throw coming as a fresh one does (it goes after ${playedWent.toFixed(3)} s; fresh, ${freshWent.toFixed(3)})`);
}

// The one number a seed gives without a sequence made for it (src/spray.js seededOnce, asked for every frame) is the
// first of the sequence that seed makes.
{
  const random = seededRandom(7);
  let differ = 0;
  for (let index = 0; index < 2000; index++) {
    const seed = Math.floor(random() * 2 ** 31), at = Math.floor(random() * 1e6) - 5e5, salt = Math.floor(random() * 40);
    if (seededOnce(seed, at, salt) !== seededRandom(seed, at, salt)()) differ++;
  }
  check(differ === 0, `seededOnce is seededRandom's first number (${differ} of 2000 differ)`);
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

// A picture faces one way, mirrored for the other, so a picture kind that turns or circles needs a head-on frame
// (src/birdSprites.js weigh) to change sides behind, or it flips to its mirror image mid-turn.
{
  const modelled = JSON.parse(readFileSync(new URL('../assets/birds/models.json', import.meta.url)));
  const { frames } = JSON.parse(readFileSync(new URL('../assets/birds/birds.json', import.meta.url)));
  for (const [place, groups] of Object.entries(BIRDS_BY_PLACE)) {
    for (const group of groups) {
      if (modelled[group.kind] || !(group.styles?.turn || group.styles?.circle)) continue;
      check(Boolean(frames[`${group.kind}-front`]), `${place}: the ${group.kind} turns, and has a head-on picture to turn behind`);
    }
  }
}

Math.random = realRandom;

// The views (src/birdViews.js), off the GPU: what they fetch read from disk and counted, an image a stand-in. Each view
// keeps meshes only for its own birds and fetches only what the place's hour shows; and the mirror is asked to draw a
// bird again when it is not as it was last drawn, however often it was posed since (src/birdDrawing.js mirrorChanges).
{
  const fetched = [];
  const realFetch = globalThis.fetch, realBitmap = globalThis.createImageBitmap;
  globalThis.fetch = async (url) => { const file = fileURLToPath(String(url)); fetched.push(path.basename(file)); return new Response(readFileSync(file)); };
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1 });
  /** Until nothing more has been fetched for a while (the views fetch as their catalogues come). */
  const settled = async () => {
    for (let quiet = 0, count = fetched.length; quiet < 5; quiet = fetched.length === count ? quiet + 1 : 0, count = fetched.length) await new Promise((resolve) => setTimeout(resolve, 10));
  };
  const lighting = { sunIrradiance: new THREE.Vector3(3, 2.9, 2.7), skyAmbient: new THREE.Vector3(0.7, 0.8, 0.9), sunDirection: DAY.sunDirection, extinction: new THREE.Vector3(0.4, 0.2, 0.15), waterColor: new THREE.Vector3(0.02, 0.05, 0.06) };
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 600);
  camera.position.copy(EYE); camera.lookAt(0, 0, -3); camera.updateMatrixWorld();
  const shownAt = async (place, conditions) => {
    fetched.length = 0;
    const birds = new BirdPopulation(); birds.setPlace(place); birds.setConditions(conditions); birds.showAt(0);
    const views = createBirdViews({ lighting, haze: {}, mirrorLayer: 2, onLoaded: () => {} });
    views.show(birds, camera);
    await settled();
    views.update(camera);
    return { birds, views, files: [...fetched].sort() };
  };
  const [modelMeshes, pictureMeshes] = [0, 1].map((view) => (views) => views.above.children[view].children.length);

  const cove = await shownAt('cove', DAY);
  check(cove.files.join() === 'birds.json,kelp.webp' && modelMeshes(cove.views) === 0 && pictureMeshes(cove.views) === 3, `the cove's gulls are pictures: ${pictureMeshes(cove.views)} of them and ${modelMeshes(cove.views)} models kept, no models' catalogue fetched (${cove.files.join(', ')})`);
  const harbour = await shownAt('harbour', DAY);
  check(harbour.files.join() === 'birds.json,ibis.webp' && pictureMeshes(harbour.views) === 6, `the harbour by day fetches its ibises' pictures, not the night heron's (${harbour.files.join(', ')})`);
  const lakeside = await shownAt('lakeside', DAY);
  check(lakeside.files.join() === 'fishEagle-model.webp,models.json' && modelMeshes(lakeside.views) === 1 && pictureMeshes(lakeside.views) === 1, `Lakeside by day fetches its fish eagle's model alone (${lakeside.files.join(', ')}): a model's meshes for it, a picture's for the night heron`);
  const lakesideNight = await shownAt('lakeside', NIGHT);
  check(lakesideNight.files.join() === 'birds.json,nightHeron.webp', `Lakeside after dark fetches its night heron's pictures, not the fish eagle's model (${lakesideNight.files.join(', ')})`);
  // The hour turned (src/main.js applySky): the day's kinds fetched then.
  fetched.length = 0;
  lakesideNight.birds.setConditions(DAY); lakesideNight.birds.showAt(0); lakesideNight.views.show(lakesideNight.birds, camera);
  await settled();
  check([...fetched].sort().join() === 'fishEagle-model.webp,models.json', `and its fish eagle's model once the day comes (${[...fetched].sort().join(', ')})`);

  // The Koi pond's heron: drawn in the main scene, the mirror and the water (three draws), and in the mirror again
  // only when it is not as it was last drawn there.
  const koi = await shownAt('koi', DAY);
  const everything = { intersectsSphere: () => true }, nothing = { intersectsSphere: () => false }, box = new THREE.Box3();
  const heron = koi.birds.birds[0];
  const first = koi.views.mirrorChanges(box.makeEmpty(), everything), drawnAt = box.clone(), again = koi.views.mirrorChanges(box.makeEmpty(), everything);
  check(koi.views.drawCalls === 3 && first === 1 && again === 0 && drawnAt.containsPoint(new THREE.Vector3(heron.pose.x, 0.5, heron.pose.z)) && box.isEmpty(),
    `the heron, shown, is drawn in the mirror once (${first}), about where it stands, and standing still not again (${again}); ${koi.views.drawCalls} draws`);
  // It turns its head or sets its neck and holds still again, posed many times between two frames drawn (the harness
  // steps so: a frame was once compared with the last pose, and its reflection kept the old one).
  const posed = () => { const { pose } = heron; return [pose.x, pose.z, pose.heading, pose.pitch, pose.look, pose.neck, pose.fold, pose.strike, pose.spread, pose.walking, pose.stride, pose.bill, pose.aim, pose.crouch].join(); };
  const start = posed();
  let time = 0, last = start, still = 0;
  while (time < 120 && !(last !== start && still >= 3)) {
    time += 1 / 60;
    koi.birds.step(time, []); koi.birds.showAt(time); koi.views.update(camera);
    const now = posed();
    still = now === last ? still + 1 : 0;
    last = now;
  }
  const moved = koi.views.mirrorChanges(box.makeEmpty(), everything), after = koi.views.mirrorChanges(box.makeEmpty(), everything);
  check(last !== start && moved === 1 && after === 0, `moved and still again by ${time.toFixed(1)} s, posed ${Math.round(time * 60)} times since the mirror drew it: drawn again once (${moved}), then not (${after})`);
  // Out of the mirror's view it is not drawn there, and is taken as drawn as it is.
  while (posed() === last) { time += 1 / 60; koi.birds.step(time, []); koi.birds.showAt(time); koi.views.update(camera); }
  const unseen = koi.views.mirrorChanges(box.makeEmpty(), nothing);
  check(unseen === 0 && box.isEmpty(), `moving where the mirror's camera does not see it, it is not drawn there (${unseen})`);
  globalThis.fetch = realFetch; globalThis.createImageBitmap = realBitmap;
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
