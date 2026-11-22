// What moves in Europa's sky and on its far ice (src/main.js; drawn by
// src/europaSceneryMeshes.js), in the birds' place: nothing flies where
// there is no air, so in place of birds a vent on the far ice erupts now and
// then (`plume`), and a probe crosses the sky (`probe`). Scenery as the
// birds are: nothing thrown meets them, they touch neither the splash nor
// the water. Only at Europa (SCENERY_BY_PLACE), and only with the Effects
// setting's birds on (src/main.js applyBirds).
//
//   - The plume: a crack on the far ice (`vent`) vents a faint jet of vapour
//     and ice grains, lit by the sun. Licence: water vapour is near invisible
//     to an eye, and Europa's plumes are contested (Hubble's detections are
//     near its limits; Europa Clipper is to look for them). NASA's artist's
//     views of the surface show them so.
//   - The probe: Europa Clipper, drawn as NASA/JPL's rendering of it
//     (src/europaSceneryMeshes.js: a picture facing the eye, as wide as its
//     arrays tip to tip, 30.5 m), as NASA's artist's view of Clipper over
//     Europa shows it: high over the ice in front of Jupiter, the cells of
//     its arrays toward a sun behind the eye. Licence again: Clipper's
//     closest passes are some 25 km up at 4.5 km/s, a point of light gone in
//     seconds; here it is `distance` m off, so it is seen whole (about 6°
//     across), and crosses the sky ahead in `crossing` s, from behind the
//     eye's right to behind its left, then is `gap` s out of sight. It fades
//     in and out only far to either side (`fades`, degrees from ahead), out
//     of the level view's frame, swaying slowly in the picture's plane
//     (`roll`, rad either way, over `sway` s).
//
// All of it is closed form in time (showAt), the eruptions laid out from the
// place's seed and each one's number, in order, the last few kept, so a
// seeded game goes alike at any frame rate; nothing of theirs changes in a
// physics step (nothing thrown reaches them). Their randomness is their own
// seeded stream (seededRandom), never Math.random. tools/europa-scenery-probe.mjs
// checks them.
//
// The probe's pose (`probe`, which src/europaSceneryMeshes.js draws): where
// its body is (x, y, z), `roll` (rad, in the picture's plane), `fade` (0 to 1)
// and whether it is `shown`; `pass`, which crossing it is.
import { seededRandom } from './spray.js';

// Where they are laid out from: the level view's eye (src/main.js VIEWS.level, Europa's own view, `defaultView`).
export const SCENERY_EYE = { x: 0, y: 0.16, z: 0.5 };
// Bearings are degrees right of straight ahead (−z) from the eye.
const along = (bearing, distance) => {
  const radians = bearing * Math.PI / 180;
  return { x: SCENERY_EYE.x + Math.sin(radians) * distance, z: SCENERY_EYE.z - Math.cos(radians) * distance };
};

// Each place's (only Europa's).
//   vent: the crack on the far ice the plume comes up from (`bearing` degrees right of ahead, `distance` m out). Jupiter
//     stands 4 to 16° left of ahead (tools/europa-sky.py JUPITER), the sun behind the eye's right: the plume rises right
//     of Jupiter in black sky.
//   eruptions: `gap` [least, most] s between eruptions (the first anywhere from under way already to `gap`'s most:
//     FIRST), each `lasts` s of jet (the plume building `rise` s before it and fading `fall` s after).
//   probe: `distance` m from the eye; its way across the sky `from` and `to` [bearing, elevation] degrees, bowed up by
//     `bow` degrees in its middle (so it passes in front of Jupiter's upper half, 5 to 17° up, about its middle);
//     `crossing` s across, then `gap` s out of sight before the next; faded out beyond `fades` [from, to] degrees of
//     bearing either side; `start` the share of a crossing it is through at time 0 (so the first frame shows it); `roll`
//     rad either way in the picture's plane, over `sway` s.
export const SCENERY_BY_PLACE = {
  europa: {
    vent: { bearing: 21, distance: 64 },
    eruptions: { gap: [7, 22], lasts: [3, 5], rise: 1.2, fall: 3 },
    probe: { distance: 300, from: [100, 4], to: [-100, 4], bow: 10, crossing: 240, gap: 40, fades: [60, 95], start: 0.42, roll: 0.12, sway: 70 },
  },
};

const SCENERY = { kept: 8 };
const FIRST = [-0.4, 1];   // the first eruption at a share of `gap`'s most from the start (under way already if below 0)

const between = ([least, most], share) => least + (most - least) * share;
const smoothstep = (edge0, edge1, value) => { const share = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1); return share * share * (3 - 2 * share); };

/**
 * A place's scenery: `plume` ({ x, z, strength 0 to 1, time }) and `probe` (its pose: the header). setPlace(place)
 * lays out a place's (none but Europa's), reset(time) starts them at `time`, showAt(time) poses them.
 */
export class EuropaScenery {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.plume = { x: 0, z: 0, strength: 0, time: 0 };
    this.probe = { x: 0, y: 0, z: 0, roll: 0, fade: 0, shown: false, pass: 0 };
    this.setPlace('none');
  }

  /** The scenery of `place` (SCENERY_BY_PLACE; 'none', or a place without, has none). */
  setPlace(place) {
    this.place = place;
    this.layout = SCENERY_BY_PLACE[place] ?? null;
    if (this.layout) Object.assign(this.plume, along(this.layout.vent.bearing, this.layout.vent.distance));
    this.reset(0);
  }

  /** Every eruption and pass begins afresh from `time`. */
  reset(time) {
    this.origin = time;
    this.eruptions = [];
    this.hide();
  }

  hide() {
    this.plume.strength = 0;
    Object.assign(this.probe, { x: 0, y: 0, z: 0, shown: false, fade: 0 });
  }

  /** Eruption `index`, starting at `start` s (local). */
  layEruption(index, start) {
    const ways = this.layout.eruptions;
    const random = seededRandom(this.seed, index, 71);
    const lasts = between(ways.lasts, random());
    return { index, start, lasts, end: start + lasts + ways.fall, next: start + lasts + between(ways.gap, random()) };
  }

  /** The eruptions (laid in order, the last SCENERY.kept kept) that may be under way at `local`. */
  eruptionsAt(local) {
    const list = this.eruptions;
    const ways = this.layout.eruptions;
    if (!list.length) list.push(this.layEruption(0, between(FIRST, seededRandom(this.seed, 0, 79)()) * ways.gap[1]));
    while (list[list.length - 1].start - ways.rise <= local) {
      list.push(this.layEruption(list[list.length - 1].index + 1, list[list.length - 1].next));
      if (list.length > SCENERY.kept) list.shift();
    }
    return list;
  }

  /** The plume and the probe at `time` (s, the frame's: closed form). */
  showAt(time) {
    this.hide();
    if (!this.layout) return;
    const local = time - this.origin;
    this.plume.time = time;
    const ways = this.layout.eruptions;
    // The plume: the strongest eruption under way, built over `rise` s, held, and fading over `fall` s.
    for (const eruption of this.eruptionsAt(local)) {
      const since = local - eruption.start;
      const strength = since < 0 ? Math.max(0, 1 + since / ways.rise) ** 2 : since < eruption.lasts ? 1 : Math.max(0, 1 - (since - eruption.lasts) / ways.fall) ** 2;
      this.plume.strength = Math.max(this.plume.strength, strength);
    }
    this.poseProbe(local);
  }

  /** The probe at `local` s: where it is on its pass. */
  poseProbe(local) {
    const ways = this.layout.probe;
    const period = ways.crossing + ways.gap;
    const into = local + ways.start * ways.crossing;
    const pass = Math.floor(into / period);
    const flown = into - pass * period;
    const probe = this.probe;
    probe.pass = pass;
    probe.roll = ways.roll * Math.sin(2 * Math.PI * local / ways.sway);
    if (flown > ways.crossing) return;   // between passes
    const share = flown / ways.crossing;
    const bearing = ways.from[0] + (ways.to[0] - ways.from[0]) * share;
    const elevation = (ways.from[1] + (ways.to[1] - ways.from[1]) * share + ways.bow * Math.sin(Math.PI * share)) * Math.PI / 180;
    const level = along(bearing, ways.distance * Math.cos(elevation));
    probe.x = level.x;
    probe.z = level.z;
    probe.y = SCENERY_EYE.y + ways.distance * Math.sin(elevation);
    probe.fade = 1 - smoothstep(ways.fades[0], ways.fades[1], Math.abs(bearing));
    probe.shown = probe.fade > 0;
  }

  /** What tools read (src/main.js __pond.europaScenery): the plume and the probe. */
  report() {
    return { place: this.place, plume: { ...this.plume }, probe: { ...this.probe } };
  }
}
