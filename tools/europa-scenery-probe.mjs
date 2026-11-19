// Europa's scenery on the CPU (src/europaScenery.js), and checks:
//
//   node tools/europa-scenery-probe.mjs
//
// - only Europa has any (every other place, and 'none', has no plume and no
//   probe over ten minutes);
// - ten minutes of Europa's: the plume comes and goes; the probe crosses the
//   sky again and again, `distance` m from the level view's eye, high over
//   the ice (20 m and more) and far out of a throw's reach, never jumping between frames
//   within a pass;
// - in the level view (Europa's own: 48° high, 16:9): within the first
//   minute the probe passes in front of Jupiter (tools/europa-sky.py JUPITER:
//   10° left of ahead, 11° up, 6.1° across its equator's half), and it is
//   whole in the frame for at least half its crossing; it fades only outside
//   the frame's sides;
// - closed form in time: the same poses posed frame by frame at 1/30 s, at
//   1/144 s, or only at the moments compared; a seed's alike every run.
// Exits with status 1 if any check fails.
import { EuropaScenery, SCENERY_EYE, SCENERY_BY_PLACE } from '../src/europaScenery.js';
import { PLACES } from '../src/places.js';

let failures = 0;
const check = (ok, message) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`); if (!ok) failures++; };
const MINUTES = 10, FRAME = 1 / 60;
const LEVEL = { halfHeight: 24, halfWidth: Math.atan(Math.tan(24 * Math.PI / 180) * 16 / 9) * 180 / Math.PI, pitch: -1.8 };   // src/main.js frameFov, VIEWS.level
const JUPITER = { bearing: -10, elevation: 11, radius: 6.1 };
const PROBE_HALF_SPAN = 15.25;   // m: src/europaSceneryMeshes.js PROBE, its arrays 30.5 m tip to tip
/** Bearing (degrees right of ahead) and elevation (degrees, about the level view's axis) of a point from the level view's eye. */
const seen = ({ x, y, z }) => {
  const dx = x - SCENERY_EYE.x, dz = z - SCENERY_EYE.z;
  return { bearing: Math.atan2(dx, -dz) * 180 / Math.PI, elevation: Math.atan2(y - SCENERY_EYE.y, Math.hypot(dx, dz)) * 180 / Math.PI - LEVEL.pitch, distance: Math.hypot(dx, y - SCENERY_EYE.y, dz) };
};

// Who has any.
for (const place of [...Object.keys(PLACES), 'none']) {
  if (place === 'europa') continue;
  const scenery = new EuropaScenery({ seed: 1 });
  scenery.setPlace(place);
  let any = 0;
  for (let time = 0; time < MINUTES * 60; time += 0.5) { scenery.showAt(time); any += (scenery.probe.shown ? 1 : 0) + (scenery.plume.strength > 0 ? 1 : 0); }
  check(any === 0, `${place}: no plume, no probe`);
}
check(Boolean(SCENERY_BY_PLACE.europa) && Object.keys(SCENERY_BY_PLACE).length === 1, 'only Europa has this scenery');

// Ten minutes of Europa's, frame by frame.
{
  const ways = SCENERY_BY_PLACE.europa.probe;
  const scenery = new EuropaScenery({ seed: 1 });
  scenery.setPlace('europa');
  let plumeTime = 0, plumes = 0, plumeWas = 0, shownTime = 0, lowest = Infinity, wrongDistance = 0, jumps = 0, fadedInFrame = 0;
  let firstInFront = Infinity, inFrame = 0;
  const passes = new Set();
  let last = null;
  for (let frame = 0; frame * FRAME < MINUTES * 60; frame++) {
    const time = frame * FRAME;
    scenery.showAt(time);
    const { plume, probe } = scenery;
    if (plume.strength > 0) plumeTime += FRAME;
    if (plume.strength > 0 && plumeWas === 0) plumes++;
    plumeWas = plume.strength;
    if (!probe.shown) { last = null; continue; }
    shownTime += FRAME;
    passes.add(probe.pass);
    lowest = Math.min(lowest, probe.y);
    const at = seen(probe);
    if (Math.abs(at.distance - ways.distance) > 0.01) wrongDistance++;
    if (last && last.pass === probe.pass && Math.hypot(probe.x - last.x, probe.y - last.y, probe.z - last.z) > 1) jumps++;
    last = { ...probe };
    const half = Math.atan(PROBE_HALF_SPAN / at.distance) * 180 / Math.PI;
    const whole = Math.abs(at.bearing) + half < LEVEL.halfWidth && Math.abs(at.elevation) + half < LEVEL.halfHeight;
    if (whole) inFrame += FRAME;
    if (Math.abs(at.bearing) < LEVEL.halfWidth && probe.fade < 1) fadedInFrame++;
    const fromJupiter = Math.hypot(at.bearing - JUPITER.bearing, at.elevation + LEVEL.pitch - JUPITER.elevation);
    if (fromJupiter < JUPITER.radius * 0.8) firstInFront = Math.min(firstInFront, time);
  }
  check(plumes >= 15 && plumeTime > 60, `the plume erupts ${plumes} times in ${MINUTES} minutes, up ${plumeTime.toFixed(0)} s`);
  check(passes.size >= 2, `the probe crosses ${passes.size} times in ${MINUTES} minutes (a crossing ${ways.crossing} s, ${ways.gap} s between)`);
  check(lowest > 20, `the probe stays high over the ice (lowest ${lowest.toFixed(1)} m), far out of any throw's reach`);
  check(wrongDistance === 0, `the probe keeps ${ways.distance} m from the level view's eye`);
  check(jumps === 0, 'the probe never jumps between frames within a crossing');
  check(firstInFront < 60, `it passes in front of Jupiter within the first minute (at ${firstInFront.toFixed(1)} s)`);
  check(inFrame > 0.4 * shownTime, `whole in the level view's frame ${(100 * inFrame / shownTime).toFixed(0)}% of the time it is shown`);
  check(fadedInFrame === 0, 'it fades only outside the level view\'s frame');
}

// Closed form: posed at any frame rate, or only at the moments compared, alike; and a seed's alike every run.
{
  const poses = (fps, seed = 1) => {
    const scenery = new EuropaScenery({ seed });
    scenery.setPlace('europa');
    const out = [];
    for (let frame = 0; frame <= 300 * fps; frame++) {
      scenery.showAt(frame / fps);
      if (frame % (5 * fps) === 0) out.push(JSON.stringify(scenery.report()));
    }
    return out;
  };
  const sparse = (() => { const scenery = new EuropaScenery({ seed: 1 }); scenery.setPlace('europa'); const out = []; for (let time = 0; time <= 300; time += 5) { scenery.showAt(time); out.push(JSON.stringify(scenery.report())); } return out; })();
  const rounded = (list) => list.map((entry) => entry.replace(/(\d+\.\d{6})\d+/g, '$1'));
  check(rounded(poses(30)).join() === rounded(sparse).join() && rounded(poses(144)).join() === rounded(sparse).join(), 'the same at 30 fps, at 144 fps and posed only when compared');
  check(poses(30).join() === poses(30).join(), 'a seed\'s alike every run');
  check(poses(30, 2).join() !== poses(30, 1).join(), 'another seed\'s eruptions are its own');
}

console.log(failures ? `\neuropa-scenery-probe: ${failures} check(s) failed` : '\neuropa-scenery-probe: all checks pass');
process.exit(failures ? 1 : 0);
