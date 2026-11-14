// The birds (src/main.js; drawn by src/birdMeshes.js): who flies over each
// place, and how. They are scenery, as the fish are: nothing thrown meets
// them, they touch neither the splash nor the water's waves, and they never
// come within reach of a throw. A thing thrown near a heron puts it up.
//
// Who lives where (BIRDS_BY_PLACE): a bird of every place (but the Pool), of where its
// photograph was taken (Poly Haven's coordinates), a few done well.
//   - Rocky cove (Cape Town's Atlantic shore): kelp gulls, each coming by
//     now and then to work the water out past the rocks, mostly gliding, a
//     few wingbeats now and then. Loch Ness: herring gulls, so.
//   - The Koi pond (Nagoya), frozen: no heron standing on the ice; one flies
//     over the garden now and then instead (BIRDS_WHEN_FROZEN).
//   - The Koi pond (Nagoya): a grey heron wading in the shallows of the far
//     bank, as herons stand in every garden pond with fish in it (wade),
//     somewhere along it of its own each time (laySpot). It
//     stands still for long spells, its head turning now and then, its neck
//     drawn in or stretched up; it walks a few steps along the bank, turning
//     about as it steps, its head first; it hunts (layHunt): peers down at a
//     fish ahead or to one side, its neck cocked and its bill pointed at it,
//     holds still but for its head's tilts, stabs, and tosses its catch up
//     and swallows it, or stabs again, or gives up; now and then
//     it opens its wings and holds them open a few seconds, still, as herons
//     do to sun or dry themselves (never flapping them), then folds them. What it does in each
//     spell, and when, and how long the spell is, are drawn afresh each time
//     it comes down (spellPlan), so it keeps no rhythm. Each movement settles as a spring
//     does, each part on its own time (sprung). A splash anywhere in the
//     pond makes it stretch up and turn its head and neck to look at it (alert);
//     a thing thrown near it puts it up: it crouches,
//     jumps and flies off the way it faces, low over the garden with deep,
//     slow beats, its neck drawn in and its legs trailing, as herons fly;
//     half a minute to a minute later it glides back in, flares (pitched up,
//     its legs forward, braking with deep beats) and lands somewhere new along
//     the far bank, its wings held up a moment before it folds them.
//   - The Pool: none (its view looks down into the water, at no sky).
//   - Lakeside (Sterkfontein Dam): an African fish eagle, coming over the
//     open water now and then, sometimes circling up in a thermal; Harbour,
//     on the same dam: a string of sacred ibises; Mesas, the hill over it: a
//     pair of Egyptian geese. Highlands (the eastern Free State): a grey heron.
//   - Desert oasis (the Richtersveld): a Verreaux's eagle under the koppies.
//     Swiss Alps (Lago d'Isola): a pair of ravens. Wooded lake (Radków): a
//     pair of mute swans. The Polynesian lagoon: great frigatebirds, hardly
//     ever beating their wings, circling. The Reflecting Pool (Washington,
//     D.C.): a blue jay and a northern cardinal, crossing low between the
//     elms either side of the pool, now and then.
//   - None at night (setConditions: the true sun more than NIGHT_SUN below
//     the horizon, though the moon may light the scene).
//
// How they fly (visit). A flying bird is not always there: it comes into
// the view now and then from beyond one side of the frame, goes about over
// the water and leaves, and is away a while (`gap`) before it comes again;
// when a place is shown its birds may be anywhere in that (FIRST_VISIT),
// and each visit to the page has a seed of its own (src/main.js), so no two
// are alike. Each visit is a path of its own (makeVisit), drawn from the
// bird's seed and the visit's number: over from one side to the other,
// wandering nearer and farther, higher and lower; or in, round in a wide
// turn and back out; or, for a soaring kind, round and round in a thermal,
// rising, and off. The path is a cubic B-spline (splinePath: smooth to its
// curvature) flown at the visit's speed by its length, so the bird's
// heading, climb and bank (into its turn as a glider banks,
// tan(bank) = v²κ/g, eased over a second: ROLL_EASE) all change smoothly,
// and laid out so that its tightest turn needs no more than LAID_BANK at
// its speed (drawn again if it would), as a gull or an eagle turns,
// unhurried. It flaps as its kind does (FLAPPING: in bouts drawn from its
// seed and the time, flapBout, and whenever it climbs but in a thermal; a
// cardinal bounds, `bound`: a burst of beats, then its wings shut as it
// arcs on, its path rising and dipping about the visit's). A flock flies
// its leader's path strung out behind it. All of it is closed form in time
// (visitAt), the visits made in order and the last few kept. A standing
// bird's state (`mode`) is changed only in the physics steps (step,
// startle: src/main.js), and each frame poses every bird at the frame's
// time (showAt), so a seeded game goes alike at any frame rate
// (tools/frame-rate-probe.mjs). Their randomness is their own seeded stream
// (seededRandom), never Math.random, so seeded throws stay as they were.
//
// A pose (`pose`, from which src/birdMeshes.js poses its model): where it
// is (x, y, z: its body's middle, or for a bird standing its feet), its
// heading, pitch and bank (rad), its wingbeat's phase and how hard it beats
// (beat, 0 to 1), how far its wings are folded (fold, 1 folded on its back),
// its neck (neck: 0 drawn in onto its shoulders, 1 stretched up), its head's
// turn (look, rad), its legs (legs: 0 trailing behind, 1 standing), how far
// it is crouched (crouch, 0 to 1) and whether it is seen at all (shown).
import * as THREE from 'three';
import { seededRandom } from './spray.js';
import { KOI_SHORE, koiShoreRadius, koiFloorDepthAt } from './pondFloor.js';
import { STEP_LENGTH } from './birdRig.js';

const GRAVITY = 9.81;
const NIGHT_SUN = 4;   // degrees: the true sun this far below the horizon (not the moon that lights a night), no bird is about
const EYE = { x: 0, z: 2.45 };   // the shore's eye (src/main.js VIEWS.shore): where visits are laid out from

// How a kind flaps (flapBout): its time cut into `window`-second spells, and in `share` of them a bout of `least` to
// `most` seconds of beating from the spell's start, eased in and out over `ease`; and it beats while it climbs,
// `climb` of full beating a m/s of climb. `steady`: it beats all the time (a goose, a swan, a crow going somewhere).
const FLAPPING = {
  gull: { window: 5.5, share: 0.4, least: 1.2, most: 2.6, ease: 0.35, climb: 1.4 },   // glides, a few beats now and then
  soaring: { window: 12, share: 0.18, least: 0.8, most: 1.6, ease: 0.3, climb: 0.5 },   // an eagle: a few beats in a minute
  fishing: { window: 6, share: 0.65, least: 2, most: 4, ease: 0.4, climb: 0.8 },   // a fish eagle low over the water: bouts of slow, shallow beats between glides
  frigate: { window: 20, share: 0.1, least: 0.6, most: 1.0, ease: 0.25, climb: 0.2 },   // hardly ever
  corvid: { window: 3.2, share: 0.75, least: 1.6, most: 2.8, ease: 0.25, climb: 1.4 },   // rows, with short glides
  jay: { window: 2.6, share: 0.85, least: 1.6, most: 2.5, ease: 0.15, climb: 1.2 },   // a blue jay: rows steadily, now and then a short glide
  steady: { steady: true },
  // A small songbird's bounding flight (a cardinal's): a burst of beats (`flap` s), climbing, then its wings shut for
  // a bound (`bound` s), coasting up and over and dropping under gravity, again and again, so its path rises and dips
  // (bounding, in the visit's own time: each visit's lengths drawn from its seed).
  bounding: { bounding: true, flap: [0.3, 0.42], bound: [0.16, 0.26], shut: 0.04 },
};

// The kinds: their size (m: wingspan, bill to tail), their wingbeat (Hz; Pennycuick's: a gull about 3, a heron about
// 2), their speed (m/s), how they flap (FLAPPING) and, for one that stands, how high its body's middle is over its feet
// (m; where it takes off from and lands at).
export const BIRD_KINDS = {
  herring: { name: 'Herring gull', span: 1.4, length: 0.6, beat: 2.9, cruise: 8.5, flapping: 'gull', stand: 0 },
  kelp: { name: 'Kelp gull', span: 1.4, length: 0.6, beat: 2.8, cruise: 8.5, flapping: 'gull', stand: 0 },
  heron: { name: 'Grey heron', span: 1.75, length: 0.95, beat: 2.2, cruise: 10.5, flapping: 'steady', stand: 0.421 },   // stand: its model's hips (src/birdMeshes.js)
  goose: { name: 'Egyptian goose', span: 1.45, length: 0.7, beat: 3.8, cruise: 14, flapping: 'steady', stand: 0.32 },
  ibis: { name: 'African sacred ibis', span: 1.15, length: 0.7, beat: 3.6, cruise: 12, flapping: 'corvid', stand: 0 },
  fishEagle: { name: 'African fish eagle', span: 2.1, length: 0.72, beat: 2.2, cruise: 10, flapping: 'fishing', stand: 0 },
  eagle: { name: "Verreaux's eagle", span: 2.1, length: 0.85, beat: 2.0, cruise: 11, flapping: 'soaring', stand: 0 },
  raven: { name: 'Common raven', span: 1.2, length: 0.62, beat: 3.4, cruise: 10, flapping: 'corvid', stand: 0 },
  swan: { name: 'Mute swan', span: 2.2, length: 1.45, beat: 2.9, cruise: 15, flapping: 'steady', stand: 0 },
  frigate: { name: 'Great frigatebird', span: 2.2, length: 0.95, beat: 1.6, cruise: 9, flapping: 'frigate', stand: 0 },
  // Songbirds: a passerine's quick beats (a jay's about 7 a second, a cardinal's about 11, as birds of their weight beat).
  blueJay: { name: 'Blue jay', span: 0.4, length: 0.28, beat: 7, cruise: 8.5, flapping: 'jay', stand: 0 },
  cardinal: { name: 'Northern cardinal', span: 0.29, length: 0.22, beat: 11, cruise: 7.5, flapping: 'bounding', stand: 0 },
};

// Each place's birds (src/places.js PLACES): how many of which kind and their habit.
//   visit: now and then a bird comes into the view, goes about over the water a while and leaves (visitAt): each
//     visit a fresh path, `gap` [least, most] s apart (the first anywhere from under way already to `gap`'s most: FIRST_VISIT), drawn
//     with `styles`' weights (cross: over from one side to the other, wandering nearer and farther; turn: in from one
//     side, round in a wide turn out over the water and back out the same side; circle: in, round and round over the
//     water, rising as in a thermal, and off; a soaring kind's), between `distance` [near, far] m from the shore's
//     eye and `height` [low, high] m over the water, its turns and circles centred `aim` degrees to the right of the
//     home view's line, give or take `spread`; a crossing's places each up to `wander` m nearer or farther than the
//     one before (by its speed if not given: 14 m at 10 m/s, less faster). `count` birds, each on its own visits, or with `together` one flock
//     on its leader's, each `spacing` m behind the one before and a little to one side, as a small flock strings out.
//   wade: where it stands, drawn afresh each time it comes down (and as the place is shown: laySpot): `angles` (rad
//     about the pond's centre, KOI_SHORE: the far bank, in the home view's frame even on an upright phone) and
//     `offshore` (m out from the waterline); it faces either way across the eye's line of sight, turned up to `toPond`
//     rad toward the water: side on to the home view, so its outline reads. Standing, a bird's ways are its kind's STANDING.
// Each a bird of where its photograph was taken (Poly Haven's places: the header), low enough to be in the home view's
// sky (under FRAME_TOP in tools/bird-probe.mjs, but for a thermal's last turns) and out of a throw's reach.
export const BIRDS_BY_PLACE = {
  cove: [{ kind: 'kelp', habit: 'visit', count: 3, distance: [32, 75], height: [1.5, 4], aim: 0, spread: 14, gap: [10, 45], styles: { cross: 0.6, turn: 0.4 } }],
  loch: [{ kind: 'herring', habit: 'visit', count: 3, distance: [32, 75], height: [1.5, 4], aim: 0, spread: 14, gap: [10, 45], styles: { cross: 0.6, turn: 0.4 } }],
  koi: [{ kind: 'heron', habit: 'wade', count: 1, angles: [4.3, 5.15], offshore: [0.07, 0.15], toPond: 0.3 }],   // in 8 to 20 cm of water: ankle to mid-shin
  lagoon: [{ kind: 'frigate', habit: 'visit', count: 2, distance: [45, 100], height: [3, 6], aim: 0, spread: 14, gap: [8, 40], styles: { cross: 0.3, turn: 0.2, circle: 0.5 } }],
  swiss: [{ kind: 'raven', habit: 'visit', count: 2, together: true, spacing: 3, distance: [35, 80], height: [2, 4.5], aim: 0, spread: 14, gap: [10, 40], styles: { cross: 0.6, turn: 0.4 } }],
  desert: [{ kind: 'eagle', habit: 'visit', count: 1, distance: [55, 110], height: [3.5, 6.5], aim: 0, spread: 12, gap: [10, 40], styles: { cross: 0.35, turn: 0.2, circle: 0.45 } }],
  lakeside: [{ kind: 'fishEagle', habit: 'visit', count: 1, distance: [35, 85], height: [2.5, 5], aim: 14, spread: 12, gap: [8, 30], styles: { cross: 0.35, turn: 0.25, circle: 0.4 } }],
  wooded: [{ kind: 'swan', habit: 'visit', count: 2, together: true, spacing: 4, distance: [35, 70], height: [1.5, 3.5], aim: 0, spread: 14, gap: [12, 45], styles: { cross: 0.8, turn: 0.2 } }],
  harbour: [{ kind: 'ibis', habit: 'visit', count: 5, together: true, spacing: 3.5, distance: [40, 75], height: [2.5, 4.5], aim: 0, spread: 14, gap: [12, 40], styles: { cross: 0.75, turn: 0.25 } }],
  mesas: [{ kind: 'goose', habit: 'visit', count: 2, together: true, spacing: 2.5, distance: [35, 65], height: [1.5, 3], aim: 0, spread: 14, gap: [12, 40], styles: { cross: 0.75, turn: 0.25 } }],
  highlands: [{ kind: 'heron', habit: 'visit', count: 1, distance: [30, 55], height: [1.5, 3], aim: 0, spread: 14, gap: [12, 45], styles: { cross: 0.7, turn: 0.3 } }],
  // The Reflecting Pool (Washington, D.C.): a blue jay and a cardinal, birds of the elms either side of it, each on
  // its own comings and goings and in its own way (nothing thrown goes past the water's 6 m patch, so they may come
  // within 10 m of the eye, where a songbird shows): the jay crossing higher and farther out, at the elms' lower
  // branches; the cardinal dashing low and near, bounding, less often.
  mall: [
    { kind: 'blueJay', habit: 'visit', count: 1, distance: [15, 32], height: [2.4, 4.5], aim: 0, spread: 22, gap: [12, 50], styles: { cross: 1 } },
    { kind: 'cardinal', habit: 'visit', count: 1, distance: [10.5, 19], height: [1.2, 2.5], aim: 0, spread: 12, gap: [25, 75], styles: { cross: 1 } },
  ],
};

// A place's birds while its water is frozen (setPlace's `frozen`), where they differ: a wading bird has no water to
// wade in, so the Koi pond's heron does not stand on the ice; it comes over now and then as a visitor, low over the
// garden and inside its backdrop (src/sky.js `garden`: 35 m from the eye), as herons go looking for open water;
// crossing only, and straight on (a wide turn at a heron's speed is 60 m or more across, far behind the garden's
// picture, and its wanderings would turn it hard at this range).
export const BIRDS_WHEN_FROZEN = {
  koi: [{ kind: 'heron', habit: 'visit', count: 1, distance: [16, 26], height: [2.2, 3.4], aim: 0, spread: 18, gap: [6, 26], wander: 3, styles: { cross: 1 } }],
};

const BANK_MOST = THREE.MathUtils.degToRad(35);   // no bird is drawn banked more (a visit is laid out within LAID_BANK)
// A visit is laid out so that nowhere on it does the bird need more bank than this for its speed (a gliding bird's
// unhurried turns, 10 to 30°): one whose path bends tighter anywhere, where its wanderings or its way into or out of a
// turn meet, is drawn again (LAYOUT_TRIES at most, the gentlest kept).
const LAID_BANK = THREE.MathUtils.degToRad(28);
const LAYOUT_TRIES = 16;
// A bird rolls into and out of a turn over a moment, not at once: its bank is the turn's average over this long either
// side of where it is (five samples), which also keeps the roll's rate down where the path's bend changes fast.
const ROLL_EASE = 0.5;

// A heron's ways (the header). Every movement is a spring's (sprung: each part settling on its own time, as a muscle
// brings a limb where it is sent), so its parts overlap rather than moving together and stopping at once.
//   idle: its head turned now and then (`looks`, rad either side), its spells `lookEvery` s apart, each starting up to
//     `jitter` s late, a quick turn settling in about `lookSettle` s; its neck set to one of `necks` on spells of its
//     own (`neckEvery` s), slower (`neckSettle`); a share `still` of spells changing nothing.
//   alert: a splash within `alert` m (out of reach of a flush): it stretches up and turns its head and neck to look at
//     it (as far round as `most` rad from where its body faces, so it looks over its shoulder at one behind it) for
//     `hold` s, quick to react (`settle`); another splash while it looks keeps it up, its gaze going over to the new
//     one (`refocus` s to settle), never snapping back first.
//   flush: a thing thrown coming down within `radius` m of it (and under `height` m), or a splash within `splash` m,
//     puts it up; it crouches `crouch` s, then flies off over `flight` s along a curve `far` m away and `climb` m up,
//     beating hard over the first `hard` s (a share `quicker` faster at first, easing to its kind's beat over about
//     `quickFor` s), then steadily (`cruise`, its beat's depth), its legs swinging back over `legsUp` s and its neck
//     drawn in and its trunk slimmed (src/birdRig.js pose.tuck, pose.slim) over `neckIn`.
//   away: `absent` s (drawn) before it comes back, put off `retry` s while a thing has been thrown near its spot in the
//     last `quiet` s.
//   land: it comes back in over `glide` s from `from` m out and `high` m up, still beating for its first `flapping` s,
//     then gliding on bowed wings, its legs coming down and forward, and flaring over the last `flare` s as herons do
//     in every photograph of one landing: its body pitched up toward upright (`flarePitch` rad), its legs swung
//     forward, its neck out of its tuck and reaching toward where it will land (`reachOut` of a strike's line), its
//     head tipped down to watch the spot (`lookDown` rad), braking with its wings raised high and beating forward
//     (src/birdRig.js pose.brake; `braking` beats a second, timed so its wings are up as its feet touch); its feet
//     reach for the bed `ahead` m before its hips, its body coming down to `touchPitch` and its neck drawn back as
//     they touch. Down, its body is carried on over its feet (`carry` s), its legs give (`absorb`, a crouch, springing
//     back), its body settles forward (`settle` s, a little past level and back), its neck eases into its standing
//     ways (`neckSettle`), and it holds its wings up a moment (`hold` s) before folding them over `fold` s.
const HERON = {
  idle: { lookEvery: 4.6, jitter: 3.4, lookSettle: 0.45, looks: 0.9, neckEvery: 11, neckSettle: 1.8, necks: [0.12, 0.3, 0.55, 0.85], still: 0.4 },
  alert: { alert: 9, hold: 4.5, settle: 0.6, most: 2.3, refocus: 0.5 },
  flush: { radius: 2.6, height: 3, splash: 3.2, crouch: 0.28, flight: 5.5, far: 38, climb: 13, hard: 1.8, legsUp: 1.0, neckIn: 1.1, quicker: 0.35, quickFor: 1.4, cruise: 0.9 },
  away: { absent: [25, 55], retry: 12, quiet: 8 },
  land: { glide: 6.5, from: 34, high: 11, flapping: 2.4, flare: 1.6, flarePitch: 1.05, touchPitch: 0.45, braking: 1.9, reachOut: 0.35, lookDown: 0.35, ahead: 0.16, carry: 0.5, absorb: 0.45, settle: 0.7, neckSettle: 1.2, hold: 0.45, fold: 1.0 },
  tilt: 0,   // its body standing, nose up from level (its model stands as photographed)
  // spells: its standing cut into spells from when it began to stand, each `length` s long (drawn), or longer if what
  //   it does in it needs more; each spell's plan (spellPlan) is drawn from its seed, its stay (how many times it has
  //   come down) and the spell's number, so no two stays go alike and none repeats on a beat.
  spells: { length: [6, 20], rest: [1.5, 5] },
  // walk: in a `share` of its spells (none in the first: it has just come down) it walks `distance` m (drawn) along
  //   the bank (its waterline, in the same depth: onBank), kept within `reach` of its own spot, at `speed` (a stalking
  //   heron's slow walk: under 60 steps a minute, here about 50; adult grey herons fishing average 6 to 9 a minute,
  //   mostly standing), setting off `start` s into the spell (drawn). It looks the way it will go (its head first),
  //   turns to it stepping round (`turnSettle` s, `turnStep` m of stepping a radian turned), sets off once mostly
  //   turned (`setOff` s after it began to turn), its neck eased to `neck` as it goes (`carry` s to settle, and back
  //   once it stops) and, as it stops, turns to face the water a little (`facePond` rad from the bank), facing so
  //   until it walks again.
  walk: { share: 0.5, distance: [0.12, 0.6], reach: [-0.4, 0.5], speed: 0.11, start: [0.3, 3], turnSettle: 2.2, setOff: 1.5, turnStep: 0.12, facePond: 0.5, neck: 0.5, carry: 1.4 },
  // strike: in a `share` of its spells (`afterWalk` of those it walks in), `at` s (drawn) into it or after its walk, it
  //   hunts a fish it has seen (layHunt: every part of it drawn, so no two go alike), as herons do in the photographs and
  //   films of them:
  //   - it peers down at it (`stalk` s to settle, drawn): its neck swung round toward it (up to `aim` rad either side of
  //     its heading), drawn in to `neck` (drawn: cocked low, or peering from higher), its bill pointed down at it
  //     (`bill`, rad), its body lowered (`crouch`) and leaning in a little (`lean`, a share of the strike's line);
  //   - it holds still `freeze` s (drawn), but for its head: tilted now and then (`tilts`: how many, how far in rad,
  //     each settling in `tiltSettle` s), as a heron cocks its head to judge the fish's depth;
  //   - it stabs (`stab` s to settle, drawn: herons strike in a tenth of a second or so), its neck thrown out to `reach`
  //     (drawn) of the strike's line, but no deeper than its bill's tip reaches `depth` m under the water (its bill and
  //     head in to its eyes) or `clear` m over the bed (src/birdRig.js pose.floor), holds its bill in the water `hold` s
  //     (drawn) and brings it up with a little spring (`back`);
  //   - caught (but for a share `miss`: an adult grey heron catches about one fish in two strikes): it comes up with
  //     a small fish held across its bill (src/birdRig.js posePrey), wriggling (`wriggle`: rad, dying away over s), its
  //     head up and its bill tipped up (`catchNeck`, `catchBill`), the fish tossed to turn it head first (`tosses`,
  //     drawn: each a jerk of `toss` rad; with none it works it round in its bill), then swallowed (`swallow` s, down
  //     its throat) in `gulps` (drawn: jerks of its neck); missed, it often stabs again (a share `again`, `againAfter`
  //     s later, drawn; that one may catch);
  //   - and, a share `shake` of the times, shakes the water off its bill (`shakes` quick turns of its head either way).
  //   A share `giveUp` of its peers come to nothing: it straightens up again without striking. Adult grey herons fishing
  //   strike about once in two to four minutes; it hunts more often than that (about one a minute), so it is seen to.
  strike: { share: 0.4, afterWalk: 0.3, at: [0.6, 6], stalk: [1.0, 2.2], aim: 0.5, neck: [0.12, 0.5], bill: [-0.55, -0.85], crouch: [0.2, 0.4], lean: 0.12,
    freeze: [0.6, 3], tilts: [0, 3], tilt: 0.14, tiltSettle: 0.3, stab: [0.09, 0.15], reach: [0.82, 1.04], depth: 0.12, clear: 0.02, hold: [0.18, 0.45], back: 0.55,
    miss: 0.5, again: 0.5, againAfter: [0.45, 1.1], catchNeck: 0.85, catchBill: 0.45, tosses: [0, 2], toss: 0.35, gulps: [2, 4], swallow: 0.35, wriggle: [0.4, 1.8], shake: 0.5, shakes: 4, giveUp: 0.25 },
  // spread: in a `share` of its spells (a share `afterLanding` of the first after it comes down: drying off), `at` s
  //   (drawn) after what else it does, it opens its wings and holds them open, as herons sun and dry themselves (the
  //   spread-wing or "delta" posture: src/birdRig.js SPREAD), not flapping: it opens them (`open` s to settle, a little
  //   past and back), holds them still `hold` s (drawn), hunched (its neck drawn in to `neck`, leaning forward `lean`
  //   rad), its head still turning now and then; in a long hold (over `shuffleAfter` s) it lets them sag a little and
  //   spreads them again once (`shuffle`: by how much, and the spring's settle); then folds them (`close` s to settle).
  spread: { share: 0.04, afterLanding: 0.3, at: [0.5, 4], open: 0.6, hold: [3, 8], close: 0.8, neck: 0.3, lean: 0.12, shuffleAfter: 5, shuffle: [0.15, 0.3] },
};
const STANDING = { heron: HERON };
const STANDING_HABITS = new Set(['wade']);

/** Perlin's smootherstep from edge0 to edge1 (edge0 below edge1). */
const smoother = (edge0, edge1, value) => { const share = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1); return share * share * share * (share * (share * 6 - 15) + 10); };
/** A number in [0, 1) from a seed and an integer: the same every time it is asked. */
const hashed = (seed, index, salt = 0) => seededRandom(seed, index, salt)();
const between = ([least, most], share) => least + (most - least) * share;
/** The angle from `from` to `to`, the short way round (rad). */
const turnBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * A spring's step response `elapsed` s after its target stepped from 0 to 1: a system that settles in about `settle` s
 * (to within 2%), critically damped, or with `damping` under 1 a little over and back, as a limb sent somewhere by a
 * muscle gets there: under way at once but gently, slowing as it arrives. Of `order` 3 (critically damped, three
 * poles), it starts gentler still, as a heavy body does (a heron's whole body turning). Exactly 1 once it has all but
 * settled (SETTLED: within 0.05% of the step), so a still bird is still to the last bit and its mirror image is not
 * drawn again.
 */
function springStep(elapsed, settle, damping = 1, order = 2) {
  if (elapsed <= 0) return 0;
  const phase = SPRING_RATE[order] / settle * elapsed;
  if (phase > SETTLED[order]) return 1;
  if (order === 3) return 1 - (1 + phase + phase * phase / 2) * Math.exp(-phase);
  if (damping >= 1) return 1 - (1 + phase) * Math.exp(-phase);
  const root = Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * phase) * (Math.cos(root * phase) + (damping / root) * Math.sin(root * phase));
}
const SPRING_RATE = { 2: 5.83, 3: 7.52 };   // ωt where a critically damped step response of each order is within 2% of the step
const SETTLED = { 2: 10, 3: 12.5 };         // ωt past which it is taken as there (within 0.05%)
/** The time (s) after its step a springStep of `settle` and `order` is exactly 1. */
const settledAfter = (settle, order = 2) => SETTLED[order] / SPRING_RATE[order] * settle;

/** A springStep of order 3's rate (a share a second). */
function springRate(elapsed, settle) {
  if (elapsed <= 0) return 0;
  const omega = SPRING_RATE[3] / settle, phase = omega * elapsed;
  return phase > SETTLED[3] ? 0 : omega * phase * phase / 2 * Math.exp(-phase);
}

/**
 * A value driven by a spring at `time` (closed form, so the same at any frame rate): `from`, then sent to each target
 * of `steps` ([time, target, settle, damping, order], in time's order) at its time, each step's response (springStep) added to
 * the last's.
 */
function sprung(time, from, steps) {
  let value = from, before = from;
  for (const [at, target, settle, damping = 1, order = 2] of steps) { value += (target - before) * springStep(time - at, settle, damping, order); before = target; }
  return value;
}

/** A pose, at rest. */
function freshPose() {
  return { x: 0, y: 0, z: 0, heading: 0, pitch: 0, bank: 0, phase: 0, beat: 0, fold: 0, neck: 0, look: 0, aim: 0, bill: 0, legs: 0, plant: 0, feetAhead: 0, brake: 0, crouch: 0, prey: 0, shown: false };
}

/**
 * A heron's hunt (HERON's `strike`), beginning `at` s into its spell, every part of it drawn from `random` (its spell's
 * stream): its springs' steps for each part of its pose, in s from when it begins (sprung), and when all of them have
 * settled. `neck` is the neck it peers with; `holding` how far its neck is up holding a catch, and `gulps` the jerks
 * added to its neck as it swallows; `look` its head's tilts and shakes, added to its look.
 */
function layHunt(ways, at, random) {
  const draw = (range) => between(range, random());
  const count = (range) => Math.round(between([range[0] - 0.49, range[1] + 0.49], random()));
  const stalk = draw(ways.stalk), freeze = draw(ways.freeze);
  const side = (random() * 2 - 1) * ways.aim;
  const peerBill = draw(ways.bill), peerCrouch = draw(ways.crouch);
  const hunt = { at, neck: draw(ways.neck), engaged: [], thrown: [], crouch: [], aim: [], bill: [], look: [], holding: [], gulps: [], preyTurn: [], preyIn: [], caught: null, settled: 0 };
  // Peering: down at it, swung round toward it, lowered, leaning in a little.
  const still = 0.9 * stalk;   // when it has all but settled into its peer
  hunt.engaged.push([0, 1, stalk]);
  hunt.aim.push([0, side, 0.8 * stalk]);
  hunt.bill.push([0.15 * stalk, peerBill, 0.8 * stalk]);
  hunt.crouch.push([0, peerCrouch, stalk]);
  hunt.thrown.push([0, ways.lean, stalk]);
  // Its head tilted now and then as it waits, each a quick little turn, held, then the next; level again to strike.
  const tilts = count(ways.tilts);
  for (let tilt = 0; tilt < tilts; tilt++) hunt.look.push([still + freeze * (tilt + 0.2 + 0.6 * random()) / (tilts + 0.3), (random() * 2 - 1) * ways.tilt, ways.tiltSettle, 0.8]);
  const stabAt = still + freeze;
  hunt.look.push([stabAt - 0.12, 0, 0.12]);
  let end = stabAt;
  if (random() < ways.giveUp) {
    // Nothing comes of it: it straightens up again.
    hunt.thrown.push([stabAt, 0, stalk]);
    hunt.bill.push([stabAt, 0, stalk]);
    hunt.crouch.push([stabAt, 0, stalk]);
    hunt.aim.push([stabAt, 0, stalk]);
    end = stabAt + 0.3;
  } else {
    // A stab, its bill in the water a moment, and up; missed, perhaps another a moment later (which may catch).
    let caught = false;
    for (let stabAtNow = stabAt, stab = 0; stab < 2; stab++) {
      const quick = draw(ways.stab), reach = draw(ways.reach), hold = draw(ways.hold);
      const upAt = stabAtNow + quick + hold;
      caught = random() >= ways.miss;
      const again = !caught && stab === 0 && random() < ways.again;
      hunt.thrown.push([stabAtNow, reach, quick], [upAt, again ? 0.3 : 0, ways.back, 0.8]);
      hunt.bill.push([stabAtNow, 0, quick], [upAt, again ? peerBill * 0.8 : 0, ways.back]);   // the strike's line points it
      hunt.crouch.push([stabAtNow, peerCrouch + 0.1, quick], [upAt, again ? peerCrouch : 0, 2 * ways.back]);
      end = upAt;
      if (!again) break;
      stabAtNow = upAt + draw(ways.againAfter);
    }
    hunt.aim.push([end, 0, 1.2]);
    if (caught) {
      // Up out of the water with the fish across its bill (src/birdRig.js posePrey), its head up and bill tipped up
      // once its neck is mostly out of the strike; the fish tossed and caught again to turn it head first (or worked
      // round in its bill), then swallowed, its neck jerking as it goes down.
      hunt.caught = { from: end };
      hunt.holding.push([end + 0.2, 1, 0.6]);
      hunt.bill.push([end + 0.2, ways.catchBill, 0.5]);
      let after = end + 0.8;
      const tosses = count(ways.tosses);
      for (let toss = 0; toss < tosses; toss++) {
        after += 0.25 + 0.3 * random();
        hunt.bill.push([after, ways.catchBill + ways.toss, 0.1], [after + 0.11, ways.catchBill, 0.16]);
        if (toss === tosses - 1) hunt.preyTurn.push([after + 0.06, 1, 0.14]);   // in the air a moment, caught head first
        after += 0.2;
      }
      if (!tosses) { hunt.preyTurn.push([after, 1, 0.6]); after += 0.5; }
      const gulps = count(ways.gulps);
      after += 0.3;
      hunt.preyIn.push([after, 1, ways.swallow]);
      for (let gulp = 0; gulp < gulps; gulp++) { hunt.gulps.push([after, 0.08, 0.1], [after + 0.14, 0, 0.12]); after += 0.32 + 0.12 * random(); }
      hunt.bill.push([after, 0, 0.6]);
      hunt.holding.push([after + 0.1, 0, 1.0]);
      end = after + 0.4;
    }
    if (random() < ways.shake) {
      // Shaking the water off its bill: quick turns of its head either way, dying away.
      const shakeAt = end + 0.2;
      for (let shake = 0; shake < ways.shakes; shake++) hunt.look.push([shakeAt + shake * 0.075, (shake % 2 ? -1 : 1) * 0.28 * (1 - shake / ways.shakes), 0.07, 0.9]);
      hunt.look.push([shakeAt + ways.shakes * 0.075, 0, 0.12]);
      end = shakeAt + ways.shakes * 0.075 + 0.2;
    }
  }
  hunt.engaged.push([end, 0, stalk]);
  // When every part has settled (each spring exactly at rest after settledAfter), from its last step.
  for (const steps of [hunt.engaged, hunt.thrown, hunt.crouch, hunt.aim, hunt.bill, hunt.look, hunt.holding, hunt.gulps, hunt.preyTurn, hunt.preyIn]) {
    for (const [stepAt, , settle] of steps) hunt.settled = Math.max(hunt.settled, stepAt + settledAfter(settle));
  }
  return hunt;
}

// Seeing a thing coming (wary): every physics step a standing heron follows each moving thing's course `ahead` s on
// (course: falling as thrown, skipping on off the water as a stone thrown flat does, or in and slowing; on the water or
// the ground, sliding on as it goes), every `every` s, and goes as soon as it would come within `reach` m (and the
// thing's radius) of where it stands, below `tall` m over its feet, sooner than `lead` s from now: crouching no longer
// than leaves it `clear` s to be off before the thing arrives (`quickest` s at least), and off the way that keeps it
// farthest from the thing's course. Coming in to land, it goes round again (goAround) if anything is coming within
// `aside` m of where it would come down. So nothing thrown ever comes through it, however fast and flat, or skipped.
const WARY = { ahead: 1.6, every: 1 / 60, reach: 1.0, tall: 1.4, lead: 1.2, clear: 0.8, quickest: 0.05, aside: 2.5, still: 0.02 };
const COURSE_SAMPLES = Math.ceil(WARY.ahead / WARY.every) + 1;
const courseScratch = new Float32Array(COURSE_SAMPLES * 3);

/**
 * A thing's course from now (WARY), into `out` (x, y, z every WARY.every s): how many samples, or 0 if it is still. In
 * the air it falls (gravity, no drag: a little ahead of the real thing, which is the safe side); meeting the water
 * flat and fast it skips on (a share of its fall turned back up, a little speed lost), else goes in and all but stops.
 */
function course(thing, out) {
  const { position, velocity } = thing;
  let x = position.x, y = position.y, z = position.z, vx = velocity.x, vy = velocity.y, vz = velocity.z;
  if (Math.hypot(vx, vy, vz) < WARY.still) return 0;
  let flying = thing.state === 'air';
  const step = WARY.every;
  for (let index = 0; index < COURSE_SAMPLES; index++) {
    out[index * 3] = x; out[index * 3 + 1] = y; out[index * 3 + 2] = z;
    if (flying) {
      vy -= GRAVITY * step;
      x += vx * step; y += vy * step; z += vz * step;
      if (y <= 0 && vy < 0) {
        const level = Math.hypot(vx, vz);
        if (level > 3 && -vy < 0.6 * level) { vy = -0.55 * vy; vx *= 0.85; vz *= 0.85; }
        else { flying = false; vx *= 0.3; vz *= 0.3; }
        y = 0;
      }
    } else {
      const slowing = thing.state === 'water' ? Math.exp(-2 * step) : 1;
      vx *= slowing; vz *= slowing;
      x += vx * step; y += vy * (thing.state === 'water' ? step : 0); z += vz * step;
    }
  }
  return COURSE_SAMPLES;
}

/** When (s from now) a course (course: `samples` of `points`) first comes within `reach` m of (x, z), between `bottom` and `top` m up; Infinity if never. */
function arrivalOf(points, samples, x, z, bottom, top, reach) {
  for (let index = 0; index < samples; index++) {
    const y = points[index * 3 + 1];
    if (y > top || y < bottom - 0.5) continue;
    if (Math.hypot(points[index * 3] - x, points[index * 3 + 2] - z) < reach) return index * WARY.every;
  }
  return Infinity;
}

/** A point on the cubic Bézier through four [x, y, z] points at u (into `out`). */
function bezier(points, along, out) {
  const left = 1 - along;
  const weights = [left * left * left, 3 * left * left * along, 3 * left * along * along, along * along * along];
  out.x = out.y = out.z = 0;
  for (let index = 0; index < 4; index++) {
    out.x += weights[index] * points[index][0];
    out.y += weights[index] * points[index][1];
    out.z += weights[index] * points[index][2];
  }
  return out;
}

const EYE_HEIGHT = 1.15;   // the shore's eye's height (src/main.js VIEWS.shore)
// When a place is shown, its birds are somewhere in their comings and goings, not all arriving: the first visit
// starts between this share of its gap's most before the place was shown (so under way already) and the gap's most
// after.
const FIRST_VISIT = [-0.3, 1];
const OUT = 64;   // degrees either side of the home view's line: out of a wide screen's frame (38° either side at 16:9), where visits begin and end
const CEILING = THREE.MathUtils.degToRad(6);   // a visit's points are kept this far above the eye's level, under the frame's top (7.4°)
const SPAN_SAMPLES = 16;   // a spline's span sampled this many times for its length table

/**
 * The radius (m) of the control points' circle for a turn at `speed` (m/s) banked `bank` degrees: v²/(g·tan(bank)),
 * widened by what the spline cuts off a circle drawn by eight points a turn (its curve runs 0.9 of their radius).
 */
const turnRadius = (speed, bank) => speed * speed / (GRAVITY * Math.tan(THREE.MathUtils.degToRad(bank))) / 0.9;

/**
 * A uniform cubic B-spline through (near) `points` ([x, y, z]), its ends pinned to the first and last (a phantom point
 * mirrored beyond each, so it starts at the first heading for the second), with a table of its length along it:
 * { controls, spans, parameters, lengths, length }.
 */
function splinePath(points) {
  const first = points[0], second = points[1], last = points[points.length - 1], before = points[points.length - 2];
  const controls = [first.map((value, axis) => 2 * value - second[axis]), ...points, last.map((value, axis) => 2 * value - before[axis])];
  const spans = controls.length - 3;
  const parameters = new Float64Array(spans * SPAN_SAMPLES + 1), lengths = new Float64Array(spans * SPAN_SAMPLES + 1);
  const previous = new THREE.Vector3(), current = new THREE.Vector3();
  const path = { controls, spans, parameters, lengths, length: 0 };
  splineAt(path, 0, previous);
  for (let index = 1; index < parameters.length; index++) {
    parameters[index] = index / SPAN_SAMPLES;
    splineAt(path, parameters[index], current);
    lengths[index] = lengths[index - 1] + current.distanceTo(previous);
    previous.copy(current);
  }
  path.length = lengths[lengths.length - 1];
  return path;
}

/** A B-spline's point at parameter `parameter` (0 to spans) into `out`, and its first and second derivatives if given. */
function splineAt(path, parameter, out, first, second) {
  const span = Math.min(Math.floor(parameter), path.spans - 1), local = parameter - span, rest = 1 - local;
  const squared = local * local, cubed = squared * local;
  const weights = [rest * rest * rest / 6, (3 * cubed - 6 * squared + 4) / 6, (-3 * cubed + 3 * squared + 3 * local + 1) / 6, cubed / 6];
  const slopes = [-rest * rest / 2, (3 * squared - 4 * local) / 2, (-3 * squared + 2 * local + 1) / 2, squared / 2];
  const bends = [rest, 3 * local - 2, -3 * local + 1, local];
  out.set(0, 0, 0); first?.set(0, 0, 0); second?.set(0, 0, 0);
  for (let index = 0; index < 4; index++) {
    const [x, y, z] = path.controls[span + index];
    out.x += weights[index] * x; out.y += weights[index] * y; out.z += weights[index] * z;
    if (first) { first.x += slopes[index] * x; first.y += slopes[index] * y; first.z += slopes[index] * z; }
    if (second) { second.x += bends[index] * x; second.y += bends[index] * y; second.z += bends[index] * z; }
  }
  return out;
}

const scratchSample = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), bend: new THREE.Vector3(), turn: 0 };
const scratchRoll = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), bend: new THREE.Vector3(), turn: 0 };   // the bank's average's samples, and a path's tightest turn's
const scratchStep = { x: 0, y: 0, z: 0, heading: 0, lead: 0, walked: 0, walking: 0, striding: 0, stride: 0, spell: 0, walks: false, plan: null, into: 0 };
const scratchPlace = { x: 0, y: 0, z: 0, heading: 0, lead: 0, walked: 0, walking: 0, striding: 0, stride: 0, spell: 0, walks: false, plan: null, into: 0 };

/**
 * Where a path is `along` m along it (into `out`): its point, its direction (velocity: its derivative there) and its
 * heading's turn a metre (`turn`, rad/m, positive turning left: toward −z from +x), from the spline itself, not its
 * table, so they are as smooth as it is.
 */
function sampleAt(path, along, out) {
  const { lengths, parameters } = path;
  let low = 0, high = lengths.length - 1;
  while (high - low > 1) { const mid = (low + high) >> 1; if (lengths[mid] <= along) low = mid; else high = mid; }
  const share = (along - lengths[low]) / Math.max(lengths[high] - lengths[low], 1e-9);
  const parameter = parameters[low] + (parameters[high] - parameters[low]) * THREE.MathUtils.clamp(share, 0, 1);
  splineAt(path, parameter, out.position, out.velocity, out.bend);
  const { velocity, bend } = out;
  const level = velocity.x * velocity.x + velocity.z * velocity.z;
  // The heading atan2(−z', x') turns by (z'·x'' − x'·z'')/(x'² + z'²) a unit of the parameter; a metre is |v| of one.
  out.turn = (velocity.z * bend.x - velocity.x * bend.z) / Math.max(level * velocity.length(), 1e-9);
  return out;
}

/** The most a path's heading turns a metre anywhere along it (rad/m, either way): its tightest turn. */
function tightestTurn(path) {
  const { position, velocity, bend } = scratchRoll;
  let most = 0;
  for (let parameter = 0; parameter <= path.spans; parameter += 1 / SPAN_SAMPLES) {
    splineAt(path, parameter, position, velocity, bend);
    const level = velocity.x * velocity.x + velocity.z * velocity.z;
    most = Math.max(most, Math.abs(velocity.z * bend.x - velocity.x * bend.z) / Math.max(level * velocity.length(), 1e-9));
  }
  return most;
}

/**
 * The birds of the place shown (setPlace), stepped with the world
 * (step, startle) and posed at a frame's time (showAt). `birds` lists them:
 * each its kind, its habit and its pose.
 */
export class BirdPopulation {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.place = 'none';
    this.birds = [];
    this.dark = false;
    this.disturbed = -Infinity;   // when a thing was last thrown near a heron's spot (its kind's STANDING away.quiet)
  }

  /** The birds of `place` (none for a place without, or 'none'), each as it starts; its frozen water's (BIRDS_WHEN_FROZEN) when `frozen`. */
  setPlace(place, { frozen = false } = {}) {
    this.place = place;
    this.frozen = frozen;
    const stream = seededRandom(this.seed, 977);
    this.birds = [];
    for (const group of (frozen && BIRDS_WHEN_FROZEN[place]) || BIRDS_BY_PLACE[place] || []) {
      let groupSeed = null, visitor = null;
      for (let index = 0; index < group.count; index++) {
        const bird = { kind: group.kind, habit: group.habit, group, index, pose: freshPose(), seed: Math.floor(stream() * 2 ** 31) };
        groupSeed ??= bird.seed;
        bird.groupSeed = groupSeed;   // a group's shared draws (when it comes back, from which side): its first bird's seed
        if (group.habit === 'visit') {
          // Each on its own visits, or a flock all on its leader's (rank: its place behind the leader).
          if (!group.together || !visitor) visitor = this.layVisitor(group, bird.seed);
          Object.assign(bird, { visitor, rank: group.together ? index : 0, phaseOffset: stream() * Math.PI * 2, flapOffset: stream() * (FLAPPING[BIRD_KINDS[group.kind].flapping].window ?? 1) });
        }
        this.birds.push(bird);
      }
    }
    this.reset(0);
  }

  /** A visiting bird's (or flock's) visits (visitAt): its seed, its group, the kind's speed; its visits made as asked for. */
  layVisitor(group, seed) {
    return { seed, group, cruise: BIRD_KINDS[group.kind].cruise, since: 0, visits: [], lagMost: group.together ? (group.count - 1) * group.spacing : 0 };
  }

  /**
   * A standing bird's spot for its stay `stay` (how many times it has come down): where its feet are (a heron's on the
   * bed, src/birdSprites.js drawing what of it is under the water there) and which way it faces, drawn from its seed
   * and the stay (its group's `angles`, `offshore`, `toPond`), so it is somewhere new each time it comes back, and
   * each visit to the page finds it somewhere of its own.
   */
  laySpot(bird, stay) {
    const { group } = bird;
    const random = seededRandom(bird.seed, stay, 53);
    const angle = between(group.angles, random());
    const offshore = between(group.offshore, random());
    const radius = koiShoreRadius(angle) - offshore;
    const x = KOI_SHORE.centre[0] + Math.cos(angle) * radius;
    const z = KOI_SHORE.centre[1] + Math.sin(angle) * radius;
    // Across the eye's line of sight, one way or the other; turned a little toward the water (the pond's centre).
    const across = Math.atan2(-(z - EYE.z), x - EYE.x) + (random() < 0.5 ? 1 : -1) * Math.PI / 2;
    const inward = Math.atan2(-(KOI_SHORE.centre[1] - z), KOI_SHORE.centre[0] - x);
    // `angle`, `radius` and `offshore` lay its walks along the waterline (onBank), as far out from it as it came down.
    bird.spot = { x, y: -koiFloorDepthAt(x, z), z, heading: across + Math.sign(turnBetween(across, inward)) * random() * group.toPond, angle, radius, offshore };
  }

  /** Every bird as it starts at `time`: one that stands, standing at its spot; a visitor's visits from now. */
  reset(time) {
    this.disturbed = -Infinity;
    for (const bird of this.birds) {
      if (bird.visitor) { bird.visitor.since = time; bird.visitor.visits.length = 0; }
      if (!STANDING_HABITS.has(bird.habit)) continue;
      bird.mode = 'stand';
      bird.since = time;
      bird.standSince = time;   // its walks' spells from now (src/birds.js standingPlace)
      bird.stay = 0;
      this.laySpot(bird, 0);
      bird.foldSince = -Infinity;   // standing a while already: down long since, its wings folded
      bird.alerts = [];   // its alert's springs (src/birds.js standing): up and looking, then back to its ways
      bird.gazes = [];    // where it looks while alerted: [time, the splash's direction from it (rad, unwrapped), settle]
      bird.returnAt = Infinity;
      bird.flight = null;
    }
  }

  /** Whether the birds are out: none while it is dark (the true sun's elevation in degrees, src/sky.js lighting.solarElevation). */
  setConditions({ solarElevation }) {
    this.dark = solarElevation < -NIGHT_SUN;
  }

  /**
   * One physics step's end at `time` (src/main.js simulate): a bird that
   * stands sees what is coming down near it and goes (flush), and comes back
   * when its absence is over and nothing has been thrown near its spot for a
   * while.
   * `things` are the things thrown (src/rock.js: state, position, velocity).
   */
  step(time, things) {
    for (const bird of this.birds) {
      if (!STANDING_HABITS.has(bird.habit)) continue;
      const ways = STANDING[bird.kind];
      // Where it stands now (it may have walked), or where it is coming down.
      const here = bird.mode === 'stand' ? this.standingPlace(bird, time, scratchStep) : bird.spot;
      for (const thing of things) {
        if (thing.state === 'air' && thing.velocity.y < 0 && thing.position.y <= here.y + ways.flush.height) {
          const near = Math.hypot(thing.position.x - here.x, thing.position.z - here.z);
          if (near < ways.flush.radius * 1.6) this.disturbed = time;
          if (bird.mode === 'stand' && near < ways.flush.radius) this.flush(bird, time, thing.position.x, thing.position.z);
        }
        if (bird.mode !== 'stand' && bird.mode !== 'land') continue;
        // Coming its way (WARY): off at once, or round again.
        const reach = (bird.mode === 'land' ? WARY.aside : WARY.reach) + (thing.radius ?? 0.05);
        const level = Math.hypot(thing.velocity.x, thing.velocity.z);
        if (Math.hypot(thing.position.x - here.x, thing.position.z - here.z) - reach > level * WARY.ahead + 0.5 * GRAVITY) continue;   // cannot get there in time
        const samples = course(thing, courseScratch);
        const arrival = arrivalOf(courseScratch, samples, here.x, here.z, here.y, here.y + WARY.tall, reach);
        if (arrival >= (bird.mode === 'land' ? WARY.ahead : WARY.lead)) continue;
        this.disturbed = time;
        if (bird.mode === 'stand') this.flush(bird, time, thing.position.x, thing.position.z, { arrival, samples });
        else this.goAround(bird, time);
      }
      if (bird.mode === 'flee' && time >= bird.since + (bird.crouchFor ?? ways.flush.crouch) + ways.flush.flight) {
        bird.mode = 'away';
        bird.since = time;
        this.laySpot(bird, bird.stay + 1);   // where it will come down next, out of sight now
      }
      if (bird.mode === 'away' && time >= bird.returnAt) {
        if (time - this.disturbed < ways.away.quiet) bird.returnAt = time + ways.away.retry;
        else this.land(bird, time);
      }
      if (bird.mode === 'land' && time >= bird.since + ways.land.glide) {
        bird.mode = 'stand';
        bird.stay = (bird.stay ?? 0) + 1;   // its spells drawn afresh (spellPlan)
        bird.since = time;
        bird.standSince = time;
        bird.foldSince = time;
        bird.alerts = [];
        bird.gazes = [];
      }
    }
  }

  /** A splash at (x, z) (src/main.js, at its step): a standing bird near enough goes; one in sight of it stretches up and looks. */
  startle(time, x, z) {
    for (const bird of this.birds) {
      if (!STANDING_HABITS.has(bird.habit)) continue;
      const ways = STANDING[bird.kind];
      const here = bird.mode === 'stand' ? this.standingPlace(bird, time, scratchStep) : bird.spot;
      const near = Math.hypot(x - here.x, z - here.z);
      if (near < ways.flush.radius * 1.6) this.disturbed = time;
      if (bird.mode !== 'stand') continue;
      if (near < ways.flush.splash) this.flush(bird, time, x, z);
      else if (near < ways.alert.alert) this.alert(bird, time, x, z);
    }
  }

  /**
   * A standing bird alerted at `time` by a splash at (x, z) (its kind's `alert`): up and looking at it for `hold` s.
   * Alerted already, it stays up `hold` s from now and its gaze goes over to the new splash from where it is, so
   * neither its neck nor its head jumps.
   */
  alert(bird, time, x, z) {
    const { hold, settle, refocus } = STANDING[bird.kind].alert;
    const place = this.standingPlace(bird, time, scratchPlace);
    const toward = Math.atan2(-(z - place.z), x - place.x);   // as headings go (src/birdRig.js)
    const looking = bird.alerts.length > 0 && sprung(time, 0, bird.alerts) > 0;
    const last = bird.alerts[bird.alerts.length - 1];
    if (looking && time < last[0]) last[0] = time + hold;   // still up: kept up longer
    else {
      if (!looking) bird.alerts.length = 0;   // its earlier alerts over (each spring settled exactly)
      bird.alerts.push([time, 1, settle], [time + hold, 0, 2 * settle]);
    }
    if (!looking) { bird.gazes = [[time, toward, 0]]; return; }
    // Its gaze from where it is now to the new splash, the short way round; the gazes it has settled on dropped.
    while (bird.gazes.length > 1 && time >= bird.gazes[1][0] + settledAfter(bird.gazes[1][2])) bird.gazes.shift();
    const before = bird.gazes[bird.gazes.length - 1][1];
    bird.gazes.push([time, before + turnBetween(before, toward), refocus]);
  }

  /**
   * Put a standing bird up at `time`: off across the eye's view the way it
   * faces (as a heron springs off forward; facing the eye or away from it,
   * the side away from (x, z)), and a little away from the eye, low over the
   * garden; across, so it is seen side on. A thing coming at it (`threat`:
   * when it would arrive, and its course in courseScratch) hurries it: its
   * crouch no longer than leaves it WARY.clear s to be off, and off the other
   * way if that keeps it farther from the thing's course. The rest of its
   * group, standing, go with it.
   */
  flush(bird, time, x, z, threat = null) {
    const spot = { ...this.standingPlace(bird, time, scratchPlace) };   // where it stands now (it may have walked)
    const ways = STANDING[bird.kind];
    const fromEyeX = spot.x - EYE.x, fromEyeZ = spot.z - EYE.z, fromEye = Math.hypot(fromEyeX, fromEyeZ);
    const fromThingX = spot.x - x, fromThingZ = spot.z - z;
    let acrossX = -fromEyeZ / fromEye, acrossZ = fromEyeX / fromEye;
    const facing = acrossX * Math.cos(spot.heading) - acrossZ * Math.sin(spot.heading);   // its heading's share across the view
    const thingSide = acrossX * fromThingX + acrossZ * fromThingZ;
    const flip = Math.abs(facing) > 0.3 ? facing < 0 : thingSide < 0 || (thingSide === 0 && hashed(bird.seed, Math.floor(time * 10), 4) < 0.5);
    if (flip) { acrossX = -acrossX; acrossZ = -acrossZ; }
    const crouch = threat ? THREE.MathUtils.clamp(threat.arrival - WARY.clear, WARY.quickest, ways.flush.crouch) : ways.flush.crouch;
    const away = (sign) => {
      let awayX = sign * acrossX + 0.45 * fromEyeX / fromEye, awayZ = sign * acrossZ + 0.45 * fromEyeZ / fromEye;
      const length = Math.hypot(awayX, awayZ);
      return [awayX / length, awayZ / length];
    };
    let [awayX, awayZ] = away(1);
    if (threat) {
      // The way that keeps it farther from the thing's course (its nearest pass, where the thing is low enough to meet it).
      const [otherX, otherZ] = away(-1);
      if (this.passing(bird, spot, threat, crouch, otherX, otherZ) > this.passing(bird, spot, threat, crouch, awayX, awayZ)) { awayX = otherX; awayZ = otherZ; }
    }
    const { far, climb } = ways.flush;
    // From its feet, a short hop up and forward, then out and up along `away`.
    const start = [spot.x, spot.y + BIRD_KINDS[bird.kind].stand, spot.z];
    bird.flight = {
      points: [start, [spot.x + awayX * 2.2, spot.y + 2.2, spot.z + awayZ * 2.2], [spot.x + awayX * far * 0.6, spot.y + climb * 0.55, spot.z + awayZ * far * 0.6], [spot.x + awayX * far, spot.y + climb, spot.z + awayZ * far]],
    };
    bird.mode = 'flee';
    bird.since = time;
    bird.crouchFor = crouch;
    bird.aloft = null;
    bird.fleeHeading = spot.heading;   // it turns from where it faced as it springs off
    bird.returnAt = time + crouch + ways.flush.flight + between(ways.away.absent, hashed(bird.groupSeed, Math.floor(time * 10), 3));
    for (const other of this.birds) if (other.group === bird.group && other.mode === 'stand') this.flush(other, time, x, z, threat);
  }

  /**
   * How near (m, across) a thing's course (`threat`: its samples in courseScratch) comes to a bird put up from `spot`
   * that crouches `crouch` s and goes off along (awayX, awayZ): where it would be then, by a getaway's first second
   * (a metre and a half out, then on), taken against each of the course's samples low enough to meet it.
   */
  passing(bird, spot, threat, crouch, awayX, awayZ) {
    let nearest = Infinity;
    for (let index = 0; index < threat.samples; index++) {
      const y = courseScratch[index * 3 + 1];
      if (y > spot.y + WARY.tall + 1) continue;
      const out = 1.5 * Math.max(0, index * WARY.every - crouch);
      nearest = Math.min(nearest, Math.hypot(courseScratch[index * 3] - (spot.x + awayX * out), courseScratch[index * 3 + 2] - (spot.z + awayZ * out)));
    }
    return nearest;
  }

  /**
   * A bird coming in to land at `time` goes round again (something thrown is coming down near where it would land):
   * on from where it is, as fast as it is going, climbing away across the eye's view the way it is heading and off
   * over the garden; it eases from its landing's pose into its flight's (poseStanding's `aloft`), and stays away.
   */
  goAround(bird, time) {
    const ways = STANDING[bird.kind];
    this.poseStanding(bird, time);
    const from = { ...bird.pose };
    const next = time + 0.02;
    this.poseStanding(bird, next);
    const velocityX = (bird.pose.x - from.x) / 0.02, velocityY = (bird.pose.y - from.y) / 0.02, velocityZ = (bird.pose.z - from.z) / 0.02;
    const { flight, far, climb } = ways.flush;
    const headingX = Math.cos(from.heading), headingZ = -Math.sin(from.heading);
    const fromEyeX = from.x - EYE.x, fromEyeZ = from.z - EYE.z, fromEye = Math.hypot(fromEyeX, fromEyeZ);
    let awayX = headingX + 0.45 * fromEyeX / fromEye, awayZ = headingZ + 0.45 * fromEyeZ / fromEye;
    const length = Math.hypot(awayX, awayZ);
    awayX /= length; awayZ /= length;
    // Its curve's first leg its velocity now (a Bézier's start is three times its first leg over its time), then away and up.
    const start = [from.x, from.y, from.z];
    bird.flight = {
      points: [start, [from.x + velocityX * flight / 3, Math.max(from.y + velocityY * flight / 3, from.y + 1), from.z + velocityZ * flight / 3],
        [from.x + awayX * far * 0.6, bird.spot.y + climb * 0.55, from.z + awayZ * far * 0.6], [from.x + awayX * far, bird.spot.y + climb, from.z + awayZ * far]],
    };
    bird.mode = 'flee';
    bird.since = time;
    bird.crouchFor = 0;
    bird.aloft = from;
    bird.fleeHeading = from.heading;
    bird.returnAt = time + flight + between(ways.away.absent, hashed(bird.groupSeed, Math.floor(time * 10), 3));
  }

  /** Bring a standing bird back at `time`: a glide in from one side (its group's), to its spot (new this time: laySpot), ending along its heading. */
  land(bird, time) {
    const { spot } = bird;
    const side = hashed(bird.groupSeed, Math.floor(time * 10), 5) < 0.5 ? 1 : -1;
    const { from, high, ahead } = STANDING[bird.kind].land;
    // Out behind it along the bank, a little off to one side (so it crosses the eye's view, side on); in along its
    // heading for the last few metres, coming down.
    const headingX = Math.cos(spot.heading), headingZ = -Math.sin(spot.heading);
    const outX = -headingX * 0.9 + side * headingZ * 0.35, outZ = -headingZ * 0.9 - side * headingX * 0.35;
    const length = Math.hypot(outX, outZ);
    const stand = BIRD_KINDS[bird.kind].stand;
    const start = [spot.x + (outX / length) * from, spot.y + stand + high, spot.z + (outZ / length) * from - from * 0.15];
    bird.flight = {
      points: [start, [spot.x + (outX / length) * from * 0.6, spot.y + stand + high * 0.7, spot.z + (outZ / length) * from * 0.6 - from * 0.1], [spot.x - headingX * 3.2, spot.y + stand + 0.7, spot.z - headingZ * 3.2],
        [spot.x - headingX * ahead, spot.y + stand, spot.z - headingZ * ahead]],   // its hips; its feet reach on to the spot
    };
    bird.mode = 'land';
    bird.since = time;
  }

  /** Every bird posed at `time` (src/main.js, once a frame): its pose. */
  showAt(time) {
    for (const bird of this.birds) {
      if (bird.habit === 'visit') this.poseVisit(bird, time);
      else this.poseStanding(bird, time);
      if (this.dark) bird.pose.shown = false;
    }
  }

  /**
   * A visitor's visit `index` from `start` (s from when the place was shown): its path (a cubic B-spline through
   * control points drawn from its seed and the index, in the view's terms: bearing right of the home view's line,
   * distance from the eye, height over the water; see BIRDS_BY_PLACE), its speed, its length, and how long it lasts.
   * Its ends are out of the frame to either side, so the bird flies in and out of view; between them every turn is
   * smooth (the spline is C2, so its curvature and with it the bird's bank never jump).
   */
  makeVisit(visitor, index, start) {
    let gentlest = null;
    for (let attempt = 0; attempt < LAYOUT_TRIES; attempt++) {
      const visit = this.layVisit(visitor, index, start, attempt);
      if (!gentlest || visit.bankMost < gentlest.bankMost) gentlest = visit;
      if (visit.bankMost <= LAID_BANK) break;
    }
    return gentlest;
  }

  /** One way to lay out visit `index` (makeVisit), drawn from its seed, its index and the attempt. */
  layVisit(visitor, index, start, attempt) {
    const { group } = visitor;
    const random = seededRandom(visitor.seed, index, 31, attempt);
    const range = (pair) => between(pair, random());
    const signed = (most) => (random() * 2 - 1) * most;
    const styles = Object.entries(group.styles);
    let pick = random() * styles.reduce((sum, [, weight]) => sum + weight, 0), style = styles[0][0];
    for (const [name, weight] of styles) { if (pick < weight) { style = name; break; } pick -= weight; }
    const side = random() < 0.5 ? 1 : -1;   // in from the right (1) or the left
    const speed = visitor.cruise * (0.85 + 0.3 * random());
    const [near, far] = group.distance;
    // A point by bearing (degrees right of the home view's line), distance and height; kept under the frame's top
    // (CEILING, but for a thermal's last turns: `free`) and out of reach.
    const points = [];
    // A bounding bird's arcs rise over its path (src/birds.js bound): its path kept that much lower.
    const flapping = FLAPPING[BIRD_KINDS[group.kind].flapping];
    const rise = flapping.bounding ? GRAVITY * flapping.bound[1] ** 2 / 8 + 0.1 : 0;
    const at = (bearing, distance, height, free = false) => {
      const radians = THREE.MathUtils.degToRad(bearing);
      const clampedDistance = Math.max(distance, near * 0.9);
      const ceiling = free ? Infinity : EYE_HEIGHT + clampedDistance * Math.tan(CEILING) - rise;
      points.push([EYE.x + Math.sin(radians) * clampedDistance, Math.min(height, ceiling), EYE.z - Math.cos(radians) * clampedDistance]);
    };
    const middle = () => group.aim + signed(group.spread);
    at(side * (OUT + random() * 8), range(group.distance), range(group.height));
    if (style === 'cross') {
      // Over, by two to three places strung across the view, each nearer or farther, higher or lower.
      // Each a step nearer or farther than the one before, smaller the faster it flies (a turn's radius goes as the
      // square of its speed).
      const stops = 2 + Math.floor(random() * 2), wander = group.wander ?? 14 * Math.min(1, (10 / speed) ** 2);
      let distance = range(group.distance);
      for (let stop = 1; stop <= stops; stop++) {
        const share = stop / (stops + 1);
        distance = THREE.MathUtils.clamp(distance + signed(wander), near, far);
        at(side * (OUT - 2 * OUT * share) * 0.75 + group.aim * (1 - Math.abs(2 * share - 1)) + signed(6), distance, range(group.height));
      }
      at(-side * (OUT + random() * 8), range(group.distance), range(group.height));
    } else if (style === 'turn') {
      // In, out over the water and round (half a circle the far way, as wide as its speed asks at a bank of 12° to
      // 22°), and back out the side it came in, nearer or farther than it came.
      const apex = THREE.MathUtils.degToRad(middle());
      const radius = turnRadius(speed, 12 + random() * 10);
      const inner = between([near, (near + far) / 2], random());
      const aheadX = Math.sin(apex), aheadZ = -Math.cos(apex), rightX = Math.cos(apex), rightZ = Math.sin(apex);
      const centreX = EYE.x + aheadX * (inner + radius), centreZ = EYE.z + aheadZ * (inner + radius);
      at(side * 32 + signed(6), inner + random() * 10, range(group.height));
      const low = range(group.height), high = range(group.height);
      for (let step = 0; step <= 4; step++) {
        // From the circle's near point, round by its far side (away from where it came in), to its far point.
        const angle = Math.PI * step / 4;
        const towardEye = Math.cos(angle), awaySide = Math.sin(angle);
        points.push([centreX - aheadX * radius * towardEye - side * rightX * radius * awaySide, low + (high - low) * step / 4, centreZ - aheadZ * radius * towardEye - side * rightZ * radius * awaySide]);
      }
      // Out along the circle's far side's line (no nearer than its middle, so it never doubles back).
      const outward = inner + radius * (1 + random());
      at(side * 34 + signed(4), outward, range(group.height));
      at(side * (OUT + random() * 8), outward + signed(10), range(group.height));
    } else {
      // Circling: in to a thermal, round it one and a half to three times (eight points a turn), drifting with the
      // wind and rising a few metres a turn, then off to either side, high.
      const centreBearing = middle(), centreDistance = between([near + 15, far - 5], random());
      const radius = turnRadius(speed * 0.85, 15 + random() * 10), turns = 1.5 + random() * 1.5, way = random() < 0.5 ? 1 : -1;
      const radians = THREE.MathUtils.degToRad(centreBearing);
      const centre = [EYE.x + Math.sin(radians) * centreDistance, EYE.z - Math.cos(radians) * centreDistance];
      const drift = [signed(6), signed(4)];
      const base = range(group.height), climb = 1.5 + random() * 2;
      // Into the circle along the way it came (its first point where the circle's tangent runs from where it came
      // in toward the middle), round, and out where the tangent runs toward the side it leaves by.
      const approach = Math.atan2(centre[1] - points[0][2], centre[0] - points[0][0]);
      const from = approach - way * Math.PI / 2;
      const exit = random() < 0.5 ? side : -side;
      let count = Math.round(turns * 8);
      // The tangent at a step's angle is (−sin, cos)·way; across the view is about ±x.
      while (-Math.sin(from + way * count * Math.PI / 4) * way * exit < 0.7) count++;
      for (let step = 0; step <= count; step++) {
        const share = step / 8;
        const angle = from + way * share * Math.PI * 2;
        const height = base + climb * share;
        points.push([centre[0] + drift[0] * share + Math.cos(angle) * radius, height, centre[1] + drift[1] * share + Math.sin(angle) * radius]);
      }
      const last = points[points.length - 1];
      at(exit * 35, Math.hypot(last[0] - EYE.x, last[2] - EYE.z), last[1] + 1, true);
      at(exit * (OUT + random() * 8), range(group.distance), last[1] + 2, true);
    }
    const path = splinePath(points);
    const flown = style === 'circle' ? speed * 0.85 : speed;   // slower round a thermal
    const bankMost = Math.atan(flown * flown * tightestTurn(path) / GRAVITY);
    return { index, style, start, speed: flown, path, length: path.length, duration: path.length / flown, thermal: style === 'circle', bankMost };
  }

  /**
   * The visit of `visitor` under way at `local` (s from when the place was shown) for a bird `lag` m behind its
   * leader, or null between visits. Visits are made in order (each `gap` after the one before has left, its whole
   * flock with it) and the few lately made are kept: the same at any frame rate, as each is drawn from its index.
   */
  visitAt(visitor, local, lag) {
    if (local < 0) return null;
    const { visits, group } = visitor;
    // Made from the first again only when there are none, or time has gone back before the earliest kept (a
    // visit's own index then: waiting for the first is not that).
    if (!visits.length || (visits[0].index > 0 && local < visits[0].start)) {
      visits.length = 0;
      visits.push(this.makeVisit(visitor, 0, between(FIRST_VISIT, hashed(visitor.seed, 0, 32)) * group.gap[1]));
    }
    for (let last = visits[visits.length - 1]; last.start + last.duration + visitor.lagMost / last.speed <= local; last = visits[visits.length - 1]) {
      const gap = between(group.gap, hashed(visitor.seed, last.index + 1, 32));
      visits.push(this.makeVisit(visitor, last.index + 1, last.start + last.duration + visitor.lagMost / last.speed + gap));
      if (visits.length > 4) visits.shift();
    }
    for (const visit of visits) {
      const along = (local - visit.start) * visit.speed - lag;
      if (along >= 0 && along <= visit.length) return { visit, along };
    }
    return null;
  }

  poseVisit(bird, time) {
    const { pose, visitor } = bird;
    const kind = BIRD_KINDS[bird.kind];
    const lag = bird.rank * (visitor.group.spacing ?? 0);
    const found = this.visitAt(visitor, time - visitor.since, lag);
    pose.phase = 2 * Math.PI * kind.beat * time + bird.phaseOffset;
    pose.fold = 0;
    pose.neck = 0;
    pose.legs = 0;
    pose.crouch = 0;
    pose.flying = true;
    pose.shown = Boolean(found);
    bird.style = found?.visit.style ?? null;
    if (!found) {
      // Between visits, nowhere in particular, but the same at any frame rate (its last frame's place would not be).
      pose.x = EYE.x; pose.y = 0; pose.z = EYE.z; pose.heading = 0; pose.pitch = 0; pose.bank = 0; pose.beat = 0; pose.look = 0;
      return;
    }
    const { visit, along } = found;
    const sample = sampleAt(visit.path, along, scratchSample);
    const { velocity } = sample;
    const level = Math.hypot(velocity.x, velocity.z);
    pose.x = sample.position.x; pose.y = sample.position.y; pose.z = sample.position.z;
    if (bird.rank) {
      // Strung out to one side and the other of the leader's line, a little higher or lower, bobbing.
      const aside = (bird.rank % 2 ? 1 : -1) * Math.ceil(bird.rank / 2) * visitor.group.spacing * 0.45;
      pose.x += (-velocity.z / level) * aside;
      pose.z += (velocity.x / level) * aside;
      pose.y += 0.25 * Math.sin(bird.rank * 2.1) + 0.12 * Math.sin(time * 0.9 + bird.rank);
    }
    pose.heading = Math.atan2(-velocity.z, velocity.x);
    pose.pitch = Math.atan2(velocity.y, level) * 0.6;
    // Banked into its turn as a glider is: tan(bank) = v²·(the heading's turn a metre)/g, a right turn (its heading
    // falling) banking right.
    // Its turn averaged over ROLL_EASE s either side.
    let turn = 0;
    for (let offset = -2; offset <= 2; offset++) turn += sampleAt(visit.path, THREE.MathUtils.clamp(along + offset * ROLL_EASE * visit.speed / 2, 0, visit.length), scratchRoll).turn / 5;
    pose.bank = THREE.MathUtils.clamp(-Math.atan(visit.speed * visit.speed * turn / GRAVITY), -BANK_MOST, BANK_MOST);
    const flapping = FLAPPING[kind.flapping];
    // Beating as its kind does, and to climb (not in a thermal: the air lifts it).
    const climbRate = visit.speed * velocity.y / Math.max(Math.hypot(level, velocity.y), 1e-9);
    if (flapping.bounding) this.bound(bird, visit, time - visitor.since - visit.start, flapping);
    else pose.beat = flapping.steady ? 1 : Math.min(1, this.flapBout(bird, time, flapping) + (visit.thermal ? 0 : Math.max(climbRate, 0) * flapping.climb));
    pose.look = 0.25 * Math.sin(time * 0.37 + bird.seed);   // it looks about as it goes, a little
  }

  /** How hard a bird beats at `time` from its bouts alone (its kind's FLAPPING), 0 to 1. */
  /**
   * A bounding songbird `into` s into its visit (FLAPPING.bounding): beating or bounding with its wings shut (pose
   * beat and fold), and how far its path rises and dips about the visit's (pose.y, and pitch with it). Each cycle is
   * a bound, a ballistic arc (up at v0 = g·bound/2 and down again), then the burst that brings it back up (decelerating
   * its fall at 2·v0/flap and climbing again): smooth in height and climb, its middle on the visit's path.
   */
  bound(bird, visit, into, { flap, bound, shut }) {
    const { pose } = bird;
    const flapping = between(flap, hashed(bird.seed, visit.index, 5)), bounding = between(bound, hashed(bird.seed, visit.index, 6));
    const cycle = flapping + bounding;
    const at = ((into % cycle) + cycle) % cycle;
    const upward = GRAVITY * bounding / 2, lift = 2 * upward / flapping;
    // The arc's middle over a cycle (the bound's g·b²/12 a second of it, the burst's −v0·f/6), so the path's is its.
    const middle = (bounding * GRAVITY * bounding * bounding / 12 - flapping * upward * flapping / 6) / cycle;
    let height, climb;
    if (at < bounding) {
      height = upward * at - GRAVITY * at * at / 2;
      climb = upward - GRAVITY * at;
      pose.fold = smoother(0, shut, at) * (1 - smoother(bounding - shut, bounding, at));
    } else {
      const since = at - bounding;
      height = -upward * since + lift * since * since / 2;
      climb = -upward + lift * since;
      pose.fold = 0;
    }
    pose.beat = 1 - pose.fold;
    pose.y += height - middle;
    pose.pitch += Math.atan2(climb, visit.speed) * 0.6;
  }

  flapBout(bird, time, flapping) {
    const { window, share, least, most, ease } = flapping;
    const shifted = time + bird.flapOffset;
    const spell = Math.floor(shifted / window);
    if (hashed(bird.seed, spell, 1) >= share) return 0;
    const length = between([least, most], hashed(bird.seed, spell, 2));
    const into = shifted - spell * window;
    return smoother(0, ease, into) * (1 - smoother(length - ease, length, into));
  }

  poseStanding(bird, time) {
    const { pose, spot } = bird;
    const kind = BIRD_KINDS[bird.kind];
    const ways = STANDING[bird.kind];
    const since = time - bird.since;
    pose.shown = bird.mode !== 'away';
    pose.phase = 2 * Math.PI * kind.beat * time;
    pose.crouch = 0;
    pose.spread = 0;   // held open only standing (src/birdRig.js SPREAD)
    if (bird.mode === 'stand') {
      this.standing(bird, time);
      return;
    }
    if (bird.mode === 'flee') {
      const { flight, hard, legsUp, neckIn } = ways.flush;
      const crouch = bird.crouchFor ?? ways.flush.crouch;
      if (since < crouch) {
        // It crouches, its neck drawn in, its wings starting to open.
        this.standing(bird, bird.since);
        const share = smoother(0, crouch, since);
        pose.crouch = share;
        pose.neck *= 1 - 0.7 * share;
        pose.fold = Math.min(pose.fold, 1 - 0.5 * share);   // from folded, or from held open
        pose.spread *= 1 - share;
        return;
      }
      const flying = since - crouch;
      const share = Math.min(flying / flight, 1);
      // Off from a standstill, faster and faster; going round again, on as fast as it was going (goAround).
      const along = bird.aloft ? share : share ** 1.25;
      this.flyAlong(bird, along, Math.min(along + 0.01, 1), along > 0.99);
      pose.heading = bird.fleeHeading + turnBetween(bird.fleeHeading, pose.heading) * smoother(0, 0.45, flying);
      // Off the bed: its feet leave the water as it springs, so its middle starts where its standing middle was.
      pose.beat = 1 - (1 - ways.flush.cruise) * smoother(hard, hard + 2, flying);
      // Its wingbeat's phase: quicker at first, easing to its kind's (the integral of that rate, so it never jumps).
      const { quicker, quickFor } = ways.flush;
      pose.phase = 2 * Math.PI * kind.beat * (flying + quicker * quickFor * (1 - Math.exp(-flying / quickFor)));
      pose.crouch = 1 - smoother(0, 0.2, flying);   // springing up out of its crouch
      pose.walking = 0;
      pose.strike = pose.aim = pose.bill = pose.prey = pose.brake = pose.feetAhead = 0;
      pose.fold = 0.5 * (1 - smoother(0, 0.25, flying));
      pose.legs = 1 - smoother(0.15, legsUp, flying);
      pose.plant = 1 - smoother(0, 0.2, flying);   // its feet leaving the bed as it springs
      pose.neck = 0.3 * (1 - smoother(0, neckIn, flying));
      pose.tuck = pose.slim = smoother(0, neckIn, flying);
      pose.look = 0;
      if (bird.aloft) {
        // Going round again: from its landing's pose into its flight's, its wingbeat going on from where it was.
        const from = bird.aloft, easing = smoother(0, 0.8, flying);
        pose.fold = 0;
        pose.crouch = 0;
        for (const key of ['pitch', 'legs', 'plant', 'neck', 'tuck', 'slim', 'bill', 'strike', 'brake', 'feetAhead']) pose[key] = from[key] + (pose[key] - from[key]) * easing;
        pose.beat = Math.max(pose.beat, from.beat);
        pose.phase = from.phase + 2 * Math.PI * kind.beat * flying;
      }
      // Out of sight over the garden: gone the moment it is far enough (the Koi pond's land ends at 35 m: src/sky.js backdrop).
      if (share >= 1) pose.shown = false;
      return;
    }
    if (bird.mode === 'land') {
      const { glide, flare, flarePitch, touchPitch, braking, reachOut, lookDown, ahead } = ways.land;
      const share = Math.min(since / glide, 1);
      // Slowing all the way in.
      const along = 1 - (1 - share) ** 1.5;
      this.flyAlong(bird, along, Math.min(along + 0.01, 1), false);
      const toLand = glide - since;
      const flaring = 1 - smoother(0, flare, toLand);
      // Beating in, then gliding on bowed wings, then the flare: body pitched up, braking with deep beats (their phase
      // counted back from touchdown, so its wings are up as it lands), legs down and forward.
      const coming = 1 - smoother(ways.land.flapping - 0.8, ways.land.flapping + 0.8, since);
      pose.beat = Math.max(coming, flaring);
      if (flaring > 0) pose.phase = -2 * Math.PI * braking * toLand;
      const pitchUp = flarePitch * (1 - smoother(0.35, flare, toLand)) - (flarePitch - touchPitch) * (1 - smoother(0, 0.35, toLand));
      pose.pitch = pose.pitch * (1 - flaring) + pitchUp;   // its path's descent no longer tips it once it flares
      pose.legs = 1 - smoother(flare * 0.6, flare + 1.2, toLand);
      // Its legs swung forward with its body as it pitches up, but held down under it most of the way (its feet
      // reaching for the bed ahead of it, not out level), and all the way down to the bed as it comes in.
      pose.plant = 0.85 * flaring + 0.15 * (1 - smoother(0, 0.4, toLand));
      pose.feetAhead = ahead;
      pose.brake = flaring;
      pose.neck = 0.35 * flaring;
      pose.tuck = 1 - flaring;
      pose.slim = 1 - flaring;
      pose.strike = reachOut * flaring * smoother(0.1, 0.55, toLand);   // reaching toward the spot, drawn back as it touches
      pose.bill = -0.6 * pitchUp - lookDown * flaring;   // its head tipped down to the spot, whatever its body's pitch
      pose.fold = 0;
      pose.look = 0;
      pose.walking = 0;
      pose.aim = pose.prey = 0;
      return;
    }
    // Away: unseen.
    pose.x = spot.x; pose.y = spot.y; pose.z = spot.z;
  }

  /** A heron in flight `along` its flight's curve (0 to 1): its body's middle there, heading and pitch along it. */
  flyAlong(bird, along, ahead, last) {
    const { pose } = bird;
    const here = bezier(bird.flight.points, along, { x: 0, y: 0, z: 0 });
    const next = bezier(bird.flight.points, last ? along : ahead, { x: 0, y: 0, z: 0 });
    const behind = last ? bezier(bird.flight.points, along - 0.01, { x: 0, y: 0, z: 0 }) : here;
    const dx = next.x - behind.x, dy = next.y - behind.y, dz = next.z - behind.z;
    pose.x = here.x; pose.y = here.y; pose.z = here.z;
    if (Math.hypot(dx, dz) > 1e-6) pose.heading = Math.atan2(-dz, dx);
    pose.pitch = 0.5 * Math.atan2(dy, Math.hypot(dx, dz));
    pose.bank = 0;
    // `y` is its body's middle in flight; standing, its feet: the meshes put the body over the feet by its legs.
    pose.flying = true;
  }

  /**
   * A standing bird's plan for spell `index` of its stay (HERON's `spells`): when it starts (s from when it began to
   * stand), how long it is, whether and where it walks (`from`, `to`: m along the bank from its spot), when, and which
   * way it faces as the spell begins (`facing`) and ends (`faced`), when its strike begins and how it goes, and when
   * it spreads its wings. Each is drawn from its seed, its stay and the spell's number, laid out one after the other so
   * nothing overlaps, and kept (bird.plans) as the spells come: the same at any frame rate.
   */
  spellPlan(bird, index) {
    const stay = bird.stay ?? 0;
    if (!bird.plans || bird.plans.stay !== stay) bird.plans = { stay, list: [] };
    const { list } = bird.plans;
    while (list.length <= index) list.push(this.layPlan(bird, list.length, list[list.length - 1], stay));
    return list[index];
  }

  /** The plan of spell `index` (spellPlan), after `before` (the spell before's, none for the first). */
  layPlan(bird, index, before, stay) {
    const ways = STANDING[bird.kind];
    const { walk, strike, spread, spells } = ways;
    const random = seededRandom(bird.seed, stay, index, 31);
    const plan = { start: before ? before.start + before.length : 0, length: 0, walks: false, from: before ? before.to : 0, to: 0, walkAt: 0,
      facing: before ? before.faced : bird.spot.heading, faced: 0, hunt: null, spreadAt: null, spreadHold: 0 };
    plan.to = plan.from;
    plan.faced = plan.facing;
    // When it is next free to do something (s into the spell): just down, once its wings are folded.
    let free = index === 0 && stay > 0 ? ways.land.hold + ways.land.fold + 0.3 : 0.5;
    if (index > 0 && random() < walk.share) {
      const distance = between(walk.distance, random());
      const [least, most] = walk.reach;
      let way = random() < (most - plan.from) / (most - least) ? 1 : -1;   // more likely toward the more room
      let to = THREE.MathUtils.clamp(plan.from + way * distance, least, most);
      if (Math.abs(to - plan.from) < walk.distance[0]) { way = -way; to = THREE.MathUtils.clamp(plan.from + way * distance, least, most); }
      if (Math.abs(to - plan.from) >= walk.distance[0]) {
        plan.walks = true;
        plan.to = to;
        plan.walkAt = between(walk.start, random());
        plan.faced = this.facingFor(bird.spot, plan.from, to);
        const duration = Math.abs(to - plan.from) / walk.speed;
        free = plan.walkAt + walk.setOff + duration - 0.5 + settledAfter(walk.turnSettle, 3) + 0.4;   // its last turn settled
      }
    }
    if (random() < (plan.walks ? strike.afterWalk : strike.share)) {
      plan.hunt = layHunt(strike, free + between(strike.at, random()), random);
      free = plan.hunt.at + plan.hunt.settled + 0.3;
    }
    if (random() < (index === 0 && stay > 0 ? spread.afterLanding : spread.share)) {
      plan.spreadAt = free + between(spread.at, random());
      plan.spreadHold = between(spread.hold, random());
      free = plan.spreadAt + spread.open + plan.spreadHold + settledAfter(spread.close) + 0.3;
    }
    plan.length = Math.max(between(spells.length, random()), free + between(spells.rest, random()));
    return plan;
  }

  /** The spell of a standing bird's stay `since` s after it began to stand: its plan and number. */
  spellAt(bird, since) {
    this.spellPlan(bird, 0);
    // From the spell last asked for (bird.plans.last), as time mostly goes on; from the first if it went back.
    let index = bird.plans.last ?? 0;
    if (since < bird.plans.list[index].start) index = 0;
    let plan = this.spellPlan(bird, index);
    while (since >= plan.start + plan.length) plan = this.spellPlan(bird, ++index);
    bird.plans.last = index;
    return { plan, index };
  }

  /**
   * Where a standing bird is at `time` and which way it faces: at its spot, or walking along the bank as its spell's
   * plan says (spellPlan), or where it walked to, from when it began to stand (bird.standSince). Its turns are springs
   * (sprung), stepped round (`stride` counts its turning's steps with its walk's, so its feet move as it turns), its
   * head turning first (`lead`, the way its head faces); `walking` is how much it is stepping.
   */
  standingPlace(bird, time, out) {
    const { spot } = bird;
    const walk = STANDING[bird.kind].walk;
    out.x = spot.x; out.z = spot.z; out.heading = spot.heading; out.lead = spot.heading; out.walked = 0; out.walking = 0; out.striding = 0; out.stride = 0;
    out.spell = 0; out.walks = false; out.plan = null; out.into = 0;
    if (!walk) { out.y = spot.y; return out; }
    const since = Math.max(0, time - bird.standSince);
    const { plan, index } = this.spellAt(bird, since);
    const into = since - plan.start;
    const { from, to, facing } = plan;
    const { alongX, alongZ } = this.bank(spot, from, to);
    const distance = Math.abs(to - from), way = Math.sign(to - from);
    let offset = from;
    out.spell = index;
    out.plan = plan;
    out.into = into;
    out.walks = plan.walks;
    out.heading = out.lead = facing;
    if (plan.walks) {
      const duration = distance / walk.speed;
      // It turns to go (the short way round), sets off once mostly turned, and as it stops turns to face the water.
      const walkHeading = facing + turnBetween(facing, Math.atan2(-alongZ * way, alongX * way));
      const faced = walkHeading + turnBetween(walkHeading, plan.faced);
      const turnAt = plan.walkAt, goAt = turnAt + walk.setOff, faceAt = goAt + duration - 0.5;
      const settle = walk.turnSettle;
      out.heading = sprung(into, facing, [[turnAt, walkHeading, settle, 1, 3], [faceAt, faced, settle, 1, 3]]);
      out.lead = sprung(into, facing, [[turnAt - 0.4, walkHeading, settle * 0.3], [faceAt - 0.4, faced, settle * 0.3]]);
      const firstTurn = Math.abs(walkHeading - facing), lastTurn = Math.abs(faced - walkHeading);
      const turned = firstTurn * springStep(into - turnAt, settle, 1, 3) + lastTurn * springStep(into - faceAt, settle, 1, 3);
      const turning = firstTurn * springRate(into - turnAt, settle) + lastTurn * springRate(into - faceAt, settle);   // rad/s
      const going = into - goAt;
      const ease = 0.6 / duration;   // a share of the walk spent getting going and stopping
      const share = THREE.MathUtils.clamp(going / duration, 0, 1);
      // Distance along: constant speed with its ends eased (a smootherstep blended in over `ease`).
      const eased = share < ease ? share * share / (2 * ease * (1 - ease)) : share > 1 - ease ? 1 - (1 - share) * (1 - share) / (2 * ease * (1 - ease)) : (share - ease / 2) / (1 - ease);
      out.walked = eased * distance;
      offset = from + way * out.walked;
      const moving = smoother(-0.25, 0.25, going) * (1 - smoother(duration - 0.25, duration + 0.25, going));
      // Stepping round as it turns, as much as it is turning (its turn starts gently, so its steps do too).
      out.walking = Math.max(moving, 0.7 * Math.min(1, turning * turning));
      // Its bearing as it goes (its neck and head), eased into from as it begins to turn and out of once it stops.
      out.striding = sprung(into, 0, [[turnAt, 1, walk.carry], [goAt + duration, 0, walk.carry]]);
      out.stride = (out.walked + walk.turnStep * turned) / (2 * STEP_LENGTH);
    }
    this.onBank(spot, offset, out);
    out.y = -koiFloorDepthAt(out.x, out.z);
    return out;
  }

  /**
   * The point `offset` m along the bank from a standing bird's spot (into `out`): along the waterline, as far out from it
   * as the spot (spot.offshore), so it wades in the same depth wherever it walks; the bank's shelf is steep (src/
   * pondFloor.js KOI_SHORE.shelf), and a straight line along it would take it out into deep water.
   */
  onBank(spot, offset, out) {
    if (spot.angle === undefined) { out.x = spot.x; out.z = spot.z; return out; }
    const angle = spot.angle + offset / spot.radius;
    const radius = koiShoreRadius(angle) - spot.offshore;
    out.x = KOI_SHORE.centre[0] + Math.cos(angle) * radius;
    out.z = KOI_SHORE.centre[1] + Math.sin(angle) * radius;
    return out;
  }

  /**
   * Along the bank at a standing bird's spot, the way that runs to the eye's right (increasing offset): the line from
   * `from` to `to` m along it (onBank), or the waterline's own direction at `from` if they are the same place.
   */
  bank(spot, from = 0, to = from) {
    const start = this.onBank(spot, from, { x: 0, z: 0 });
    const end = this.onBank(spot, to === from ? from + 0.05 : to, { x: 0, z: 0 });
    const sign = to < from ? -1 : 1;
    const alongX = (end.x - start.x) * sign, alongZ = (end.z - start.z) * sign, length = Math.hypot(alongX, alongZ);
    return { alongX: alongX / length, alongZ: alongZ / length };
  }

  /** How a standing bird faces once it has walked from `from` to `to` (m along the bank): that way, turned a little to the water. */
  facingFor(spot, from, to) {
    const way = Math.sign(to - from);
    const { alongX, alongZ } = this.bank(spot, from, to);
    const walkHeading = Math.atan2(-alongZ * way, alongX * way);
    const inward = Math.atan2(-(KOI_SHORE.centre[1] - spot.z), KOI_SHORE.centre[0] - spot.x);
    return walkHeading + Math.sign(turnBetween(walkHeading, inward)) * STANDING.heron.walk.facePond;
  }

  /**
   * One of a standing bird's idle ways at `time` (its head's turn, its neck): on spells of `every` s, each starting up
   * to `jitter` s late (never on the beat), a spring to the spell's target (`targetOf` its number, a share `still` of
   * spells keeping the one before's), settling in `settle` s.
   */
  idleWay(bird, time, every, settle, damping, salt, targetOf) {
    const { jitter, still } = STANDING[bird.kind].idle;
    const spell = Math.floor(time / every);
    const kept = (index) => {
      let at = index;
      for (let back = 0; back < 4 && hashed(bird.seed, at, salt) < still; back++) at--;
      return targetOf(at);
    };
    const steps = [];
    for (let index = spell - 2; index <= spell; index++) steps.push([index * every + hashed(bird.seed, index, salt + 20) * jitter, kept(index), settle, damping]);
    return sprung(time, kept(spell - 3), steps);
  }

  /** A bird standing (or crouching to go, frozen at `time`): its place, its wings folding as it lands, its idle ways. */
  standing(bird, time) {
    const { pose } = bird;
    const ways = STANDING[bird.kind];
    const { idle } = ways;
    const place = this.standingPlace(bird, time, scratchPlace);
    pose.x = place.x; pose.y = place.y; pose.z = place.z;
    pose.heading = place.heading;
    pose.bank = 0;
    pose.flying = false;
    pose.legs = 1;
    pose.plant = 1;   // its feet on the bed, its body turning over them (src/birdRig.js)
    pose.tuck = pose.slim = 0;   // its neck and trunk as it stands (src/birdRig.js)
    // Just down (its kind's `land`): its wings held up a moment, where the flare's last beat left them (src/birdRig.js
    // flapAngles: phase 0, beat 1, the top of the stroke), then folded; its body settling forward over its feet from
    // the flare's last pitch, a little past level and back; its legs giving and springing back; its neck easing
    // from the flare's into its ways.
    const land = ways.land, landed = time - bird.foldSince;
    pose.fold = smoother(land.hold, land.hold + land.fold, landed);
    pose.beat = pose.brake = 1 - pose.fold;   // held as its last braking beat left them (src/birdRig.js BRAKE)
    pose.phase = 0;
    // Its body carried on over its feet, which stay where they came down `ahead` of its hips.
    const behind = landed < settledAfter(land.carry) ? land.ahead * (1 - springStep(landed, land.carry)) : 0;
    pose.x -= Math.cos(pose.heading) * behind; pose.z += Math.sin(pose.heading) * behind;
    pose.feetAhead = behind;
    let landingPitch = 0, absorbing = 0, lookingDown = 0;
    const touching = landed < settledAfter(land.neckSettle);
    // Stepping: its stride's phase from how far it has gone and turned (two steps a stride), so its feet never slide.
    pose.walking = place.walking;
    pose.stride = place.stride;
    // Its head turned now and then (quick, a little over and back), its neck set on spells of its own (slower).
    let look = this.idleWay(bird, time, idle.lookEvery, idle.lookSettle, 0.75, 7, (at) => (hashed(bird.seed, at, 8) * 2 - 1) * idle.looks);
    let neck = this.idleWay(bird, time, idle.neckEvery, idle.neckSettle, 1, 17, (at) => idle.necks[Math.floor(hashed(bird.seed, at, 9) * idle.necks.length)]);
    if (touching) {
      landingPitch = land.touchPitch * (1 - springStep(landed, land.settle, 0.6));
      absorbing = sprung(landed, 0, [[0, land.absorb, 0.15], [0.15, 0, 0.8]]);
      neck = 0.35 + (neck - 0.35) * springStep(landed, land.neckSettle);   // the flare's (poseStanding's `land`)
      lookingDown = land.lookDown * (1 - springStep(landed, land.neckSettle));
    }
    // Stepping, it looks where it goes (its head turned ahead of its body), its neck at its ease.
    look = look * (1 - place.striding) + 1.2 * Math.tanh(turnBetween(place.heading, place.lead) / 1.2);   // as far round as it can look, softly
    neck += (ways.walk.neck - neck) * place.striding;
    // A hunt, when its spell's plan says (its kind's `strike`, layHunt): it peers down at a fish, holds still but for
    // its head, stabs, and swallows its catch or stabs again; or gives up. Each part a spring of its own.
    let thrown = 0, crouch = 0, aim = 0, bill = 0, prey = 0, preyTurn = 0, preyIn = 0, preyWriggle = 0;
    const plan = place.plan, hunt = plan?.hunt;
    const into = hunt ? place.into - hunt.at : -1;
    if (into > 0 && into < hunt.settled) {
      const engaged = sprung(into, 0, hunt.engaged);
      thrown = sprung(into, 0, hunt.thrown);
      crouch = sprung(into, 0, hunt.crouch);
      aim = sprung(into, 0, hunt.aim);
      bill = sprung(into, 0, hunt.bill);
      look = look * (1 - engaged) + sprung(into, 0, hunt.look);
      neck += (hunt.neck - neck) * engaged;
      neck += (ways.strike.catchNeck - neck) * sprung(into, 0, hunt.holding);
      neck += sprung(into, 0, hunt.gulps);
      // Its catch, held from when its bill leaves the water till it has gone down (src/birdRig.js posePrey), wriggling
      // (two beats, dying away as the fish tires).
      const held = hunt.caught ? into - hunt.caught.from : -1;
      if (held >= 0) {
        preyIn = sprung(into, 0, hunt.preyIn);
        prey = preyIn < 0.97 ? 1 : 0;
        preyTurn = sprung(into, 0, hunt.preyTurn);
        const [most, tiring] = ways.strike.wriggle, left = most * Math.exp(-held / tiring) * (1 - preyIn);
        preyWriggle = left * (0.75 * Math.sin(2 * Math.PI * 4.2 * held) + 0.25 * Math.sin(2 * Math.PI * 7.3 * held + 1));
      }
    }
    // Its wings opened and held open, when its spell's plan says (its kind's `spread`): opened with a little spring,
    // held still (sagging and spread again once in a long hold), folded again; hunched and leaning a little meanwhile.
    let spread = 0;
    const spreading = ways.spread;
    if (spreading && plan && plan.spreadAt !== null) {
      const into = place.into - plan.spreadAt, holdEnds = spreading.open + plan.spreadHold;
      const steps = [[0, 1, spreading.open, 0.7]];
      if (plan.spreadHold > spreading.shuffleAfter) {
        const [sag, settle] = spreading.shuffle, at = spreading.open + plan.spreadHold * 0.55;
        steps.push([at, 1 - sag, settle], [at + settle, 1, settle, 0.8]);
      }
      steps.push([holdEnds, 0, spreading.close]);
      spread = sprung(into, 0, steps);
      const hunched = THREE.MathUtils.clamp(spread, 0, 1);
      look *= 1 - 0.5 * hunched;
      neck += (spreading.neck - neck) * hunched;
    }
    // A splash in sight: up and looking, quick to react, for a while, then back to its ways; its gaze turned from
    // where its body faces now (it may have walked since), no further round than it can look.
    const alerted = bird.alerts.length ? sprung(time, 0, bird.alerts) : 0;
    if (alerted > 0) {
      const gaze = sprung(time, bird.gazes[0][1], bird.gazes.slice(1));
      const toward = THREE.MathUtils.clamp(turnBetween(place.heading, gaze), -ways.alert.most, ways.alert.most);
      look += (toward - look) * alerted;
    }
    neck += (1 - neck) * alerted;
    thrown *= 1 - alerted;
    aim *= 1 - alerted;
    bill *= 1 - alerted;
    spread *= 1 - alerted;   // alarmed, it folds them
    pose.fold *= THREE.MathUtils.clamp(1 - spread, 0, 1);
    pose.spread = spread;
    pose.prey = prey; pose.preyTurn = preyTurn; pose.preyIn = preyIn; pose.preyWriggle = preyWriggle;
    pose.strike = thrown;
    pose.floor = Math.max(place.y + ways.strike.clear, -ways.strike.depth);   // as deep as its stab goes (src/birdRig.js)
    pose.aim = aim;
    pose.bill = bill - 0.6 * landingPitch - lookingDown;   // its head kept level as its body settles, still looking down a moment (the flare's)
    pose.crouch = crouch * (1 - alerted) + absorbing;
    pose.pitch = ways.tilt + landingPitch - 0.3 * thrown - (spreading ? spreading.lean * THREE.MathUtils.clamp(spread, 0, 1) : 0);   // tipped forward into its strike, and a little as it holds its wings open
    pose.look = look;
    pose.neck = neck;
  }

  /** What tools and probes read: each bird's kind, mode and pose. */
  report() {
    return this.birds.map((bird) => ({ kind: bird.kind, habit: bird.habit, mode: bird.mode ?? (bird.pose.shown ? 'visiting' : 'away'), style: bird.style ?? null, since: bird.since ?? null, returnAt: bird.returnAt ?? null, ...bird.pose, spot: bird.spot ? { ...bird.spot } : null }));
  }
}
