// Europa's life above the ice on the CPU (src/europaLife.js), and checks:
//
//   node tools/europa-life-probe.mjs
//
// - only Europa has any (every other place, and 'none', has no creature and
//   no plume over ten minutes);
// - ten minutes of Europa's: the plume comes and goes, drifters come out
//   with it (at most LIFE.drifters at once) and hoppers cross; each shown
//   creature stays out past LIFE.reach from the shore's eye, the level view's
//   and the throw's water, over the ice (never under it), and nothing jumps
//   between frames (each flight and crossing followed by its id);
// - in the level view (Europa's own: 48° high, 16:9): every drifter is in
//   its frame most of its flight, under its top; every crossing begins and
//   ends beyond the frame's sides, its leaps' tops under the frame's top;
// - physics under LIFE_GRAVITY (1.315 m/s², or the place's own): a hopper's
//   leaps are parabolas (its height's second difference −g within 1e-6), up
//   for 2·v/g s; a drifter falls free on its way up (−g) and its puffs give
//   back most of what gravity takes, so it sinks slowly (well under free
//   fall's speed); falling 1 m from rest takes √(2/g) = 1.23 s, and a 10 m/s
//   leap rises 38 m and is up 15.2 s (the research notes' figures);
// - closed form in time: the same poses posed frame by frame at 1/30 s, at
//   1/144 s, or only at the moments compared; a seed's alike every run,
//   another seed's not.
// Exits with status 1 if any check fails.
import { EuropaLife, LIFE, LIFE_EYE, LIFE_GRAVITY, EUROPA_GRAVITY, LIFE_BY_PLACE } from '../src/europaLife.js';
import { PLACES } from '../src/places.js';

let failures = 0;
const check = (ok, message) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failures++; };
const MINUTES = 10, FRAME = 1 / 60;
const LEVEL = { halfHeight: 24, halfWidth: Math.atan(Math.tan(24 * Math.PI / 180) * 16 / 9) * 180 / Math.PI, pitch: -1.8 };   // src/main.js frameFov, VIEWS.level
const SHORE_EYE = { x: 0, z: 2.45 };
/** Bearing (degrees right of ahead) and elevation (degrees, about the level view's axis) of a point from the level view's eye. */
const seen = ({ x, y, z }) => {
  const dx = x - LIFE_EYE.x, dz = z - LIFE_EYE.z;
  return { bearing: Math.atan2(dx, -dz) * 180 / Math.PI, elevation: Math.atan2(y - LIFE_EYE.y, Math.hypot(dx, dz)) * 180 / Math.PI - LEVEL.pitch };
};

// Who lives where.
for (const place of [...Object.keys(PLACES), 'none']) {
  if (place === 'europa') continue;
  const life = new EuropaLife({ seed: 1 });
  life.setPlace(place);
  let any = 0;
  for (let time = 0; time < MINUTES * 60; time += 0.5) { life.showAt(time); any += life.report().creatures.length + (life.plume.strength > 0 ? 1 : 0); }
  check(any === 0, `${place}: no life above the ice`);
}
check(Boolean(LIFE_BY_PLACE.europa) && Object.keys(LIFE_BY_PLACE).length === 1, 'only Europa has life above its ice');
check(LIFE_GRAVITY === (PLACES.europa.gravity ?? EUROPA_GRAVITY) && Math.abs(LIFE_GRAVITY - 1.315) < 0.002, `gravity ${LIFE_GRAVITY} m/s² (Europa's)`);

// Ten minutes of Europa's, frame by frame.
{
  const life = new EuropaLife({ seed: 1 });
  life.setPlace('europa');
  const last = new Map();   // id → { x, y, z, time, climb }
  let nearest = Infinity, under = 0, jumps = 0, mostDrifters = 0, plumeTime = 0, plumes = 0, plumeWas = 0;
  const drifterFrames = new Map(), crossings = new Map();
  let hopperAccelerationError = 0, drifterRiseError = 0, fastestSink = 0;
  const history = new Map();   // id → last three heights (for second differences)
  for (let frame = 0; frame * FRAME < MINUTES * 60; frame++) {
    const time = frame * FRAME;
    life.showAt(time);
    const { creatures, plume } = life.report();
    if (plume.strength > 0) plumeTime += FRAME;
    if (plume.strength > 0 && plumeWas === 0) plumes++;
    plumeWas = plume.strength;
    mostDrifters = Math.max(mostDrifters, creatures.filter((creature) => creature.kind === 'drifter').length);
    for (const creature of creatures) {
      const key = `${creature.kind}:${creature.id}`;
      for (const eye of [SHORE_EYE, LIFE_EYE, { x: 0, z: 0 }]) nearest = Math.min(nearest, Math.hypot(creature.x - eye.x, creature.z - eye.z));
      if (creature.y < 0) under++;
      const before = last.get(key);
      if (before && before.time === time - FRAME && Math.hypot(creature.x - before.x, creature.y - before.y, creature.z - before.z) > 12 * FRAME) jumps++;
      last.set(key, { x: creature.x, y: creature.y, z: creature.z, time });
      const view = seen(creature);
      if (creature.kind === 'drifter') {
        const counts = drifterFrames.get(key) ?? { all: 0, inFrame: 0, top: -90 };
        counts.all++;
        if (Math.abs(view.bearing) < LEVEL.halfWidth && view.elevation < LEVEL.halfHeight) counts.inFrame++;
        counts.top = Math.max(counts.top, view.elevation);
        drifterFrames.set(key, counts);
      } else {
        const crossing = crossings.get(key) ?? { first: view.bearing, last: view.bearing, top: -90 };
        crossing.last = view.bearing;
        crossing.top = Math.max(crossing.top, view.elevation);
        crossings.set(key, crossing);
      }
      // Second differences of height: a hopper aloft (all three frames off the ice) falls at g exactly; a drifter on
      // its way up before its first puff (its fork as thrown: climbing and no glow flash) too.
      const heights = history.get(key) ?? [];
      heights.push({ y: creature.y, time, aloft: creature.y > 0.001, glow: creature.glow, pulse: creature.pulse });
      if (heights.length > 3) heights.shift();
      history.set(key, heights);
      if (heights.length === 3 && heights.every((sample) => sample.aloft) && heights[2].time - heights[0].time < 2.5 * FRAME) {
        const acceleration = (heights[2].y - 2 * heights[1].y + heights[0].y) / (FRAME * FRAME);
        if (creature.kind === 'hopper') hopperAccelerationError = Math.max(hopperAccelerationError, Math.abs(acceleration + LIFE_GRAVITY));
        else {
          const sink = -(heights[2].y - heights[0].y) / (2 * FRAME);
          fastestSink = Math.max(fastestSink, sink);
          if (heights[2].y > heights[1].y && heights[1].y > heights[0].y && heights.every((sample) => sample.glow === 1 && sample.pulse === 0)) drifterRiseError = Math.max(drifterRiseError, Math.abs(acceleration + LIFE_GRAVITY));
        }
      }
    }
  }
  check(nearest > LIFE.reach, `nearest any comes to an eye or the throw's water: ${nearest.toFixed(1)} m (over ${LIFE.reach})`);
  check(under === 0, 'never under the ice');
  check(jumps === 0, `no jumps between frames (${jumps})`);
  check(plumes >= 15 && plumeTime > 60 && plumeTime < 0.5 * MINUTES * 60, `the plume: ${plumes} eruptions in ${MINUTES} min, up ${plumeTime.toFixed(0)} s of them`);
  check(mostDrifters >= 2 && life.dropped === 0, `drifters at once: up to ${mostDrifters} (meshes for ${LIFE.drifters}, ${life.dropped} left unshown)`);
  const drifts = [...drifterFrames.values()];
  const inFrame = drifts.filter((counts) => counts.inFrame / counts.all > 0.8).length;
  for (const [key, counts] of drifterFrames) if (counts.inFrame / counts.all <= 0.8) console.log(`     ${key}: in frame ${(100 * counts.inFrame / counts.all).toFixed(0)}% of ${counts.all} frames`);
  check(drifts.length >= 15 && inFrame === drifts.length, `${drifts.length} drifters thrown out, ${inFrame} in the level view's frame most of their flight`);
  const highest = Math.max(...drifts.map((counts) => counts.top));
  check(highest < LEVEL.halfHeight - 2 && highest > 8, `drifters' highest ${highest.toFixed(1)}° (the frame's top ${LEVEL.halfHeight}°)`);
  const all = [...crossings.values()];
  const across = all.filter((crossing) => Math.abs(crossing.first) > LEVEL.halfWidth && Math.abs(crossing.last) > LEVEL.halfWidth && Math.sign(crossing.first) !== Math.sign(crossing.last)).length;
  // A crossing under way at the start (FIRST) may begin inside: its first sample is where it was then.
  check(all.length >= 8 && across >= all.length - 1, `${all.length} hopper crossings, ${across} from beyond one side of the frame to beyond the other`);
  check(Math.max(...all.map((crossing) => crossing.top)) < LEVEL.halfHeight - 4, `hoppers' highest ${Math.max(...all.map((crossing) => crossing.top)).toFixed(1)}°`);
  check(hopperAccelerationError < 1e-6, `a hopper aloft falls at g = ${LIFE_GRAVITY} m/s² (off by ${hopperAccelerationError.toExponential(1)})`);
  check(drifterRiseError < 1e-6, `a drifter thrown up rises in free fall (off by ${drifterRiseError.toExponential(1)})`);
  check(fastestSink < 0.4 * Math.sqrt(2 * LIFE_GRAVITY * 16), `a drifter sinks at ${fastestSink.toFixed(2)} m/s at most, braked by its puffs (free fall from 16 m lands at ${Math.sqrt(2 * LIFE_GRAVITY * 16).toFixed(1)})`);
}

// A hopper's leaps: up for 2·v/g; the notes' figures.
{
  const life = new EuropaLife({ seed: 3 });
  life.setPlace('europa');
  const crossing = life.layCrossing(0, 0, 0);
  const bad = crossing.leaps.filter((leap) => Math.abs(leap.aloft - 2 * leap.up / LIFE_GRAVITY) > 1e-9).length;
  check(bad === 0, `each leap up 2·v/g: ${crossing.leaps.map((leap) => `${leap.up.toFixed(1)} m/s ${leap.aloft.toFixed(1)} s`).join(', ')}`);
  const fall = Math.sqrt(2 / LIFE_GRAVITY), rise = 10 ** 2 / (2 * LIFE_GRAVITY), aloft = 20 / LIFE_GRAVITY;
  check(Math.abs(fall - 1.233) < 0.005 && Math.abs(rise - 38.0) < 0.1 && Math.abs(aloft - 15.21) < 0.02, `1 m falls in ${fall.toFixed(2)} s; a 10 m/s leap rises ${rise.toFixed(1)} m, up ${aloft.toFixed(1)} s`);
}

// Closed form in time, and seeded.
{
  const sample = (seed, frame, moments) => {
    const life = new EuropaLife({ seed });
    life.setPlace('europa');
    life.reset(5);
    const poses = [];
    let next = 0;
    for (let time = 5; next < moments.length; time = Math.min(time + frame, moments[next])) {
      life.showAt(time);
      if (time === moments[next]) { poses.push(JSON.stringify(life.report())); next++; }
    }
    return poses;
  };
  const moments = [5, 17.3, 64.01, 133.37, 251.9, 412.25];
  const coarse = sample(1, 1 / 30, moments), fine = sample(1, 1 / 144, moments), jumped = sample(1, 1000, moments);
  check(coarse.every((pose, index) => pose === fine[index] && pose === jumped[index]), 'the same poses at 1/30 s, 1/144 s, or only at the moments compared');
  const again = sample(1, 1000, moments), other = sample(2, 1000, moments);
  check(again.every((pose, index) => pose === coarse[index]) && other.some((pose, index) => pose !== coarse[index]), 'a seed\'s alike every run, another seed\'s not');
}

if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log('all ok');
