// The ice: a frozen lake or pool (the Ice setting, src/main.js setIce), a
// sheet over the water that what is thrown comes down on, slides along and,
// struck hard enough, breaks through into the water.
//
// The ice adds one piece of physics, whether it breaks, and borrows the rest:
// on it a thing is on ground (src/rock.js `ground`: it bounces, slides,
// rolls and rests as on the pool's deck, the ice slick: ICE_MATERIAL), things
// on it knock each other along (src/collide.js), and through it a thing goes
// into the water as into open water (src/rock.js breakThrough: the cavity,
// the jet, the foam, the drops), with no crown (src/splash.js: its sheet
// stands on ice). The pieces it breaks into are things (src/things.js
// 'ice-shard'), which float as any plate does. So whatever improves those
// improves the ice.
//
// The sheet. It is ICE_THICKNESS thick (h) and floats with ρi/ρw of it under
// the water, so its top stands h·(1 − ρi/ρw) above the still water (`top`:
// 0.8 mm for thin ice, 3.3 mm for thick). It is rigid: a floating plate
// bends over its characteristic length l_c = (E·h³/(12·(1 − ν²)·ρw·g))^¼
// (0.54 m for 1 cm, 1.5 m for 4 cm), so every wave the splash makes in the
// 6 m patch is stiffened by orders of magnitude, and the solver
// (src/spectralWater.js) runs on under it unchanged, seen only in the holes.
//
// Breaking. A thing coming down on the ice strikes it with a blow
// m·v²/R (its mass, the speed it comes down at, its collision radius: a
// force scale, its momentum over the time its own size takes to pass), less
// for a thing that spreads the blow over a longer touch (ICE.give: a hollow
// ball, a soft thing as far as it has thawed). The ice holds a blow of up to
// ICE.strength·h², times e^(ICE.spread·N(0,1)) from blow to blow (floating
// ice bears a load as h², Gold's P = A·h²; the strength here is set so that
// tools/ice-probe.mjs's table of what breaks what comes out, not measured:
// a dynamic punch through floating ice is local crushing and the plate's
// inertia, which no closed form gives, so it is uncertain by a factor of a
// few), h the ice's where it is struck (thicknessAt: a hole's new skin is
// thinner). Only the speed down counts: a lob breaks through where a hard,
// flat throw skids off. A blow it holds but over ICE.crackShare of what it
// holds stars the ice with cracks (CRACK.star). One it does not hold opens a
// hole: the thing keeps the share `keep` of its speed (the break takes about
// the holding force times the thickness from its energy, at least
// ICE.keepLeast of its speed kept) and goes in (src/rock.js breakThrough).
// Things that do not fit through a hole meet its edge (meet), which holds or
// breaks the same way; ones that do but whose splash would stand on the ice
// open it wider. A hole only opens where the solver's water is (holeBox: in
// the patch less HOLE.edge, beyond which the ice holds; in the pool anywhere
// inside its walls, its edge brought in to HOLE.wall of them, so a blow in a
// corner breaks the ice off the tiles).
//
// Weakened (weakSpots, weakness). Ice cracked through holds less: a star
// cracks it radially, and round a hole it is radially cracked and has a free
// edge, so the wedges between the cracks bear a load as beams fixed at one
// end, not as a plate (radial cracking comes at a half to a third of the
// load that breaks floating ice through). Each star and each hole leaves a
// weak spot: there the ice holds ICE.cracked of what it held whole at the
// spot's middle, back to whole at its reach (the star's arms' mean length;
// the hole's edge and its radials'); spots over each other each take their
// share, to ICE.weakest at the least. So hits the ice held but that cracked
// it, again on the same spot, break it; light things that never crack it
// (a small gem), however many, never do: whole ice bent short of cracking
// is as strong after as before.
//
// Weight (weigh, loadAt). What lies on the ice, or goes along it, bears on
// it: a floating plate spreads a load over about its characteristic length
// l_c, so the weight bearing at a point is each thing's weight times
// e^(−(d/l_c)²), d its distance. Where it is more than the ice holds there
// (its mean, as weakened), the ice gives way under the heaviest thing there,
// which goes in at ICE.falls (a 30 cm rock set down on thin ice; two heavy
// bowling balls side by side). And a blow strikes ice already bearing that
// weight about it: it holds the blow less the load there.
//
// Pieces (pieceUnder, landOnPiece, bearPiece). A piece afloat in a hole is
// ice too: what comes down on it meets its top (the ground's `at` there:
// src/main.js adopts each shard), not the water, and lands, bounces, slides
// and rests on it as on the sheet; its blow drives the piece down, sharing
// its momentum with the piece and the water a plate carries face on. A piece
// carries what lies on it up to the water its freeboard would displace, ρw/ρi
// − 1 of its own mass (pieceCarries: a few grams for a hand-sized piece of
// thin ice, some 70 g for a 30 cm piece of thick): past that it goes under,
// and what was on it goes into the water, past it (src/collide.js). What
// rests on a piece that drifts or bobs from under it goes along again.
// Anything else meets a piece as its sphere against the piece's slab (src/
// collide.js slabOverlap), not a ball round it.
//
// A hole is as wide as the cavity's lip (src/cavity.js): opened at once as a
// round hole's lip would be (roundLipReach), then, once the splash has made
// its cavity, fitted to that cavity's own lip, lopsided and drawn forward as
// it is (fitCavity: Cavity.lipReach, its crest at its widest and HOLE.fall of
// its fall outside), so the hole holds the cavity, its lip and the jet. Its
// edge is broken: a polygon of HOLE.corners corners, each out beyond the lip
// by HOLE.margin and a jag of its own, with a few bites where a piece broke
// away, drawn from the hole's own seeded stream (so a seeded throw breaks
// the same hole every run). How far its edge is from its middle at each
// azimuth is kept (`reaches`, edgeReach), which holds things in it.
//
// Cracks (CRACK; settle, walk, ring, star). A punch through floating ice
// cracks it radially from where it broke, and the harder the blow the more
// radial cracks (CRACK.perDoubling for each doubling over what it held),
// and a fringe of short ones round the crushed edge; rings of crack curve
// round from one radial to the next farther out, so a hard break leaves a
// web. Each runs in short runs with small kinks between (rough at every
// scale), pulled back the way it is going, and forks now and then; it runs
// out from where the blow struck at CRACK.speed, each point at its own time
// (`times`, which src/iceCracks.js draws by); it tapers to a hairline at its tip, and
// stops where the ice ends or where it meets a crack already there, as a
// real crack runs into another and stops (a T: older breaks' cracks bound
// newer ones, and a crazed sheet builds up). A near miss stars the ice
// (star), now and then with a ring round the star. Each crack is a polyline
// with a half-width at each point and a shade (crackLines), drawn by
// src/iceCracks.js; its draws come from its hole's seeded stream, or the
// thing's (a seeded throw cracks alike).
//
// Shards (SHARD, piecesOf). The ice that was in the hole broke into pieces:
// between its radial cracks, and across them where a wedge is wide or long,
// each piece a convex slab of the ice's thickness, and a few chips from the
// crushed middle; as many as float in the hole without crowding it (the
// biggest first, their areas at most SHARD.fill of the hole's), the rest
// slush or pushed under the sheet. They are there from the break on, never
// gone and back: let go the step after it (once the hole is fitted to its
// cavity), each wedge set where it broke, flat in the sheet, cracked free,
// while the cavity is open under it; as the water comes back up through the
// hole it is driven down, its inner edge first, hinged at its outer edge
// (src/rock.js breakAway); each chip starts a little under the water; then
// each floats up as any plate does
// (src/main.js makes each a thing, src/rock.js adrift), held in its hole by
// its own outline (contain) and meeting its neighbours by theirs (src/
// collide.js). A piece whose middle is over older open water (a hole
// widened) is none: it was water.
//
// Flooding (FLOOD). As the cavity closes the water it threw aside comes back
// up through the hole and over the ice round it (flood): a wet patch out to
// FLOOD.reach of the hole's reach at each azimuth, lopsided as the waves
// wobble it, leaning the way the thing went; and each of the splash's drops
// that comes down on the ice wets a spot of it (wetSpot, src/splash.js). The
// film freezes over FLOOD.dry seconds (setTime, every FLOOD.step), leaving
// the ice glazed where it was wet: smooth, its frost gone.
//
// Refreezing (REFREEZE). Once a hole has been left alone REFREEZE.after
// seconds (no thing has gone in by it, and nothing thrown floats in it: src/
// main.js disturbs it), new ice grows over it from its edge inward, closing
// it in REFREEZE.closing seconds (`skin`: its front, how far in from the
// edge the new ice reaches). The new ice is thin (REFREEZE.skin, thickening
// over REFREEZE.thickening seconds from when the front passed), so it holds
// little: a throw at an old hole breaks it again. Where it is, the ground is
// its top (at), things land and slide on it, and the newest hole about a
// point says what is there (holeAt): its open water, or its new ice. A shard
// the front reaches is frozen in (freezeIn): painted into the sheet as ice,
// where it lay, and gone as a thing. (Real ice skins over in minutes to
// hours on a calm, cold night; here a minute or so, for the play of it.)
//
// The mask (update): what the shaders know of the ice, an RGBA8 texture of
// MASK.texels² over the solver's patch (1.2 cm texels), linearly filtered:
// R the signed distance to the nearest hole's edge, negative inside one (ice
// where it is positive), capped at MASK.holeFar either way, as a byte,
// 127.5·(1 + d/far) (ICE_COMMON in src/shaders/scene.js reads it back); G
// spare; B how wet the flood and the drops have left it, 0 where it never
// was, else FLOOD.glaze up to 1 as it is wet (glazed once wet); A the signed
// distance to new ice's front, positive where a hole has skinned over (its
// own and any newer hole's open water left out), as R is. A hole is painted
// into it once, the frame after it opens: as the least of signed distances
// (the holes' union, which also cuts any new ice), its inside by scanline
// and the distance in a band about each edge; the wet and new ice as they
// change. (Cracks are not in it: a texel is 1.2 cm, too coarse for a crack's
// kinks and its width; src/iceCracks.js draws them from crackLines.) Only what changed
// is converted, and only its rows are sent to the GPU (the texture's update
// ranges). Beyond the patch there is ice and no hole. The physics never
// reads the mask: it asks the holes' polygons.
//
// The ground (ground(deck)): src/rock.js's `ground` for everything thrown
// while the ice is on: `at` the ice's top over the water but in a hole's
// open water (the pool's deck round a frozen pool; a frozen lake's beach and
// bank behind its waterline), `materialAt` the ice's own surface over the
// water, `meet` the break (above). `contain` holds a floater that went in by
// a hole, or a shard of it, inside it (src/collide.js, as the pool's walls
// hold things), so it comes up there and never floats under the ice.
// `events` keeps the breaks and cracks for src/main.js's sound (src/sound.js
// ice), `shards` the pieces let go for src/main.js to make.
import * as THREE from 'three';
import { groundHeightAt, shoreDistance } from './pondFloor.js';
import { roundLipReach } from './cavity.js';

const GRAVITY = 9.81;
const WATER_DENSITY = 1000;
const containCorner = new THREE.Vector3();   // contain's, kept between calls

export const ICE = {
  density: 917,          // kg/m³
  modulus: 9e9,          // Pa: freshwater ice's Young's modulus (9 to 10 GPa)
  poisson: 0.33,
  strength: 1.28e6,      // N/m²: it holds a blow of up to this times h² (the header)...
  spread: 0.2,           // ...times e^(spread·N(0,1)) from blow to blow
  crackShare: 0.6,       // a blow it holds but over this share of what it holds stars it with cracks
  give: { shell: 0.15, soft: 0.3 },   // a hollow ball's blow (its touch lasts some ten times a stone's), and a soft thing's, against a rigid thing's of its mass and speed
  keepLeast: 0.4,        // the least share of its speed a thing keeps breaking through
  cracked: 0.55,         // cracked ice (a star, round a hole) holds this share of what it held, at the middle of its cracks...
  weakest: 0.25,         // ...cracked again and again, at least this share
  loadedLeast: 0.05,     // bearing a load near all it holds, it still holds a blow of this share of what it would whole (strike)
  falls: 0.3,            // m/s: a thing the ice gives way under, at rest or going along it, goes in at this
  scatter: 12,           // per metre: the light clear ice scatters back (a shard's milk; ICE_SCATTER in src/shaders/scene.js, its twin, draws the sheet's)
};
// Pieces afloat as ground (pieceUnder): a point within `margin` (m) of a piece's outline is over it; a piece is ground
// only lying within `flattest` (its up's height) of flat, and its top no more than `awash` (m) under the still water; a
// thing resting on one goes along again once the piece's top under it is `settle` (m) from where it rests.
// Struck, a piece is driven down at most `dip` (m/s) and tipped at most `tipMost` (rad/s) (pushPiece); broken (splitPiece),
// along a line within `offLine` of its radius of the blow, two lines over `twoLines` times what it held, its parts
// driven apart at `apart` (least, most; m/s).
const PIECE = { margin: 0.006, flattest: 0.6, awash: 0.002, settle: 0.002, dip: 0.05, tipMost: 2, offLine: 0.15, twoLines: 2.5, apart: [0.03, 0.1] };
const pieceUp = new THREE.Vector3(), pieceLocal = new THREE.Vector3(), pieceTurn = new THREE.Quaternion();

/**
 * The height of a piece's top over (x, z) (pieceUnder), or null if (x, z) is
 * not over it (its outline, as it is turned, PIECE.margin wider) or it lies
 * too steep: its top a plane through its middle lifted half its thickness
 * along its up (either face), met by the vertical through (x, z).
 */
function pieceTopAt(rock, x, z) {
  const up = pieceUp.set(0, 1, 0).applyQuaternion(rock.quaternion);
  if (up.y < 0) up.negate();
  if (up.y < PIECE.flattest) return null;
  const half = (rock.piece.thickness * rock.radius) / 2, position = rock.position;
  const topX = position.x + up.x * half, topY = position.y + up.y * half, topZ = position.z + up.z * half;
  const y = topY - (up.x * (x - topX) + up.z * (z - topZ)) / up.y;
  const local = pieceLocal.set(x - position.x, y - position.y, z - position.z).applyQuaternion(pieceTurn.copy(rock.quaternion).invert());
  const outline = rock.pieceOutline ??= Float64Array.from(rock.piece.corners, (value) => value * rock.radius);
  return insidePolygon(outline, local.x, local.z) || polygonEdgeDistance(outline, local.x, local.z) <= PIECE.margin ? y : null;
}

// Weak spots (weaken): a star's within `merge` of an earlier star's reach is that spot cracked again; at most `most` in
// all (weakness walks them for each thing on the ice each step), the oldest star's going first, else the oldest hole's.
export const WEAK = { merge: 0.5, most: 64 };
// The Ice setting's choices (src/main.js): the sheet's thickness, metres. Everything here takes metres.
export const ICE_THICKNESS = { none: 0, thin: 0.01, thick: 0.04 };
// The ice's own surface (src/rock.js `ground` material): slick. A stone on it slides, slowing at `tumbling`·g; between
// its hops it turns end over end at `tumble` (of its speed over its radius). A thing that scrapes (a toy slide) keeps
// its own friction on it (src/rock.js groundFriction, groundSlowing).
export const ICE_MATERIAL = Object.freeze({ kind: 'ice', friction: 0.1, rolling: 0.01, tumbling: 0.12, tumble: 0.15 });
// A hole (the header): corners round it; the lip's fall it takes in (Cavity.lipReach's `fall`); each corner out beyond
// the lip by `margin` and a jag from 0 to `jag` of the lip's reach, besides the slow waves `waves` (amplitude, each of
// modes 2 to 5); `bites` (least, most) where a piece broke away, each `bite` (least, most) deeper over `biteSpan`
// corners; at least `least` collision radii wide; kept `edge` (m) inside the solver's patch or the pool's walls; at
// most `most` open at once (past them the ice holds: a lake so broken has done its work), and `kept` in all, new ice
// over the oldest let go past it (it holds then as the sheet does); its edge's reach kept at `reaches` azimuths.
// A thing going in by a hole narrower than its splash's lip opens it wider if faster than `widensFrom` (m/s).
const HOLE = { corners: 36, fall: 0.5, margin: 0.06, jag: 0.16, waves: 0.04, bites: [1, 3], bite: [0.12, 0.35], biteSpan: [2, 4], least: 1.3, edge: 0.15, wall: 0.004, most: 64, kept: 160, reaches: 72, widensFrom: 2 };
// Cracks (walk, settle, star; the header). A crack runs straight for a `run` (least, most; m), then kinks by `kink`
// (radians, σ), pulled `pull` of the way back toward where it is going; its points `step` (m) apart, each off the run's
// line by `wobble` (m, σ: the break's roughness, finer still in src/iceCracks.js). Short runs and small kinks, so it is
// rough at every scale its points resolve (long runs between sharp kinks read as a polygon's edges). It forks at `fork`
// odds a run, the branch `forkAngle` (least, most; radians) to one side and `forkReach` (least, most) of what is left
// of its reach long, both arms `forkNarrows` as wide. Its half-width is `width` (least, most; m) where it starts,
// narrowing by `narrowing` of itself along its reach and to `hairline` (m) over the last `taper` of it, each run
// `widthWander` (σ) wider or narrower; its shade (how open, so how white) `shade` (least, most). A hole's: `radials`
// (least, most) from its corners, `perDoubling` more for each doubling of the blow over what the ice held, at most
// `most`; each `reach` (least, most) times l_c long, at most `longest` (m), and at `runaway` odds one `runawayReach`
// (least, most) times l_c, wider. Round its edge, where the ice was crushed, `fringe` (least, most; and `perDoubling`
// more for each doubling, at most `fringeMost`) short cracks `fringeReach` (least, most) of l_c long, `fringeWidth` as
// wide. At `ring` odds (again at `secondRing`, farther out) ring cracks join radials that reach `ringRadius` (least,
// most) of the hole's mean reach, from each to the next at `chord` odds, curving round the hole (walk's `about`:
// steered back to the ring by `ringHold` of its share off it). A blow the ice held stars it with `star` (least, most)
// cracks `starReach` (least, most) of l_c long, `starWidth` as wide, and at `bullseye` odds a ring of chords round
// them. Segments are kept in a grid of `cell` (m) squares, so a new one finds the cracks it meets; past `mostSegments`
// of them no crack runs on (the sheet is crazed enough; src/iceCracks.js draws as many). Each runs out at `speed` (m/s)
// from where it starts, when the crack it starts from reached there: a crack in ice runs at hundreds of metres a
// second, at once to the eye, but run out over a few frames the break is seen to spread from the blow, one event, its
// rings following its radials (each point's time, `times`; src/iceCracks.js draws it as far as it has run).
const CRACK = {
  run: [0.008, 0.045], kink: 0.15, pull: 0.22, step: 0.01, wobble: 0.0006, fork: 0.13, forkAngle: [0.3, 0.75], forkReach: [0.25, 0.65], forkNarrows: 0.75,
  width: [0.0005, 0.0013], narrowing: 0.45, hairline: 0.00012, taper: 0.3, widthWander: 0.22, shade: [0.45, 1],
  radials: [3, 6], perDoubling: 1.6, most: 12, reach: [0.35, 1.5], longest: 3, runaway: 0.3, runawayReach: [2, 4],
  fringe: [6, 12], fringeMost: 18, fringeReach: [0.06, 0.22], fringeWidth: 0.7,
  ring: 0.55, secondRing: 0.3, ringRadius: [1.5, 2.6], chord: 0.75, ringHold: 2,
  star: [3, 6], starReach: [0.12, 0.45], starWidth: 0.6, bullseye: 0.3, cell: 0.05, mostSegments: 24000, speed: 8,
};
// Shards (the header, piecesOf): let go the step after the break; each wedge between two radial cracks reaches from
// `inner` to `outer` (least, most) of the hole's reach along its corners (a slice narrowing to the blow; each corner of
// its outer edge in by up to `ragged` of that), broken across at `across` (least, most) of the way out, each end
// `slant` more or less, where it is deeper than `deep` of the reach, and in two along the edge where it spans more than
// `widest` (radians); each piece shrunk about its middle to `gap` (least, most) of itself (the water between, what was
// crushed); `chips` (least, most) from the crushed middle, `chip` (least, most) of the reach across; none smaller than
// `least` (m across) or `slab` times the ice's thickness (a slab, not a lump), none from ice thinner than `thinnest`
// (m: a new skin breaks to slush), at most `most`, their own areas at most `fill` of the hole's (they lie beside each
// other as they broke, meeting by their outlines: src/collide.js). A wedge stays where it broke, flat in the sheet,
// cracked free, while the thing's cavity is open under it; as the water comes back up through the hole (floodAt) it is
// driven down: its inner edge at `push` (least, most) of the speed the thing came down at, at most `pushMost` (m/s),
// its middle at half that, and it tips about the hole's tangent, inner edge down, at a quarter of that over its radius
// (at most `tipMost` rad/s): about half the turn of a hinge at its outer edge (v/2R), so its outer edge dips a little
// too, and it dips and mostly comes back rather than going over (now and then one does); its inner edge never inside
// `clear` of the thing's radius from where it broke (the thing went down through there); and jostled, it turns about
// the vertical at `turn` (least, most; rad/s) either way. A chip, crushed and pushed under, starts inside the hole's
// edge, its highest point `depth` (least, most) of its radius under the water, tilted by `tilt` (least, most; degrees).
// Each drifts at `drift` (least, most; m/s) out from the hole's middle, turned to either side by up to `aside`
// (radians). A piece is white ice at `whiteOdds` times the sheet's share of white ice, `whiteShare` (least, most)
// white, else clear. The flood waits for the cavity to close (fitCavity), `leastDelay` (s) at the least.
const SHARD = {
  push: [0.008, 0.016], pushMost: 0.08, tipMost: 1.5, clear: 1, turn: [0.3, 1.2],
  leastDelay: 0.12, inner: [0.1, 0.28], outer: [0.93, 0.99], ragged: 0.05, across: [0.42, 0.72], slant: 0.1, deep: 0.5, widest: 0.85, gap: [0.88, 0.96],
  chips: [2, 5], chip: [0.12, 0.22], least: 0.02, thinnest: 0.002, most: 12, fill: 0.62, depth: [0.05, 0.3], tilt: [5, 25], drift: [0.01, 0.08], aside: 0.7,
  whiteOdds: 0.8, whiteShare: [0.3, 0.6], slab: 1.5,
};
// Flooding (the header): the patch reaches `reach` (least, most) of the hole's reach, waved by `wobble`, leaning `lean`
// of the hole's mean reach the way the thing went, its edge feathered over `feather` of that; a drop wets a spot by up
// to `soak`; the film freezes away over `dry` seconds, the map dried every `step` seconds; wetted once, the ice is
// glazed, which the mask's B keeps as `glaze` (the header). Its edge is worked out at `bins` azimuths.
const FLOOD = { reach: [1.35, 1.8], wobble: 0.18, lean: 0.4, feather: 0.3, soak: 0.5, dry: 75, step: 0.5, glaze: 0.2, bins: 180 };
// Refreezing (the header): a hole left alone `after` seconds skins over from its edge, closing in `closing` seconds; the
// new ice is `skin` thick (m) once `thickening` seconds have passed since its front did, thinner before; the new ice is
// painted every `step` seconds as it grows, `seam` (m) over the old edge (so no line of water shows along it); its field
// is worked out `texels` a step over the `prepare` seconds before it begins (prepareSkin).
const REFREEZE = { after: 40, closing: 30, skin: 0.004, thickening: 60, step: 0.25, seam: 0.01, texels: 600, prepare: 2 };
// The mask (the header): texels a side over the solver's patch, and the caps of its distances (m); past `ranges` rows
// to send since the last upload, the whole of it is sent.
const MASK = { texels: 512, holeFar: 0.06, ranges: 256 };

/** A seeded random stream (mulberry32), as src/rock.js's. */
function seededStream(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A wedge's spin as it is let go (piecesOf): `tip` (rad/s) about the hole's tangent, inner edge down, and `turn` about the vertical. */
function wedgeSpin(radialX, radialZ, tip, turn) {
  const axis = new THREE.Vector3(-radialZ * tip, turn, radialX * tip);
  const rate = axis.length();
  return { axis: rate > 0 ? axis.divideScalar(rate) : axis.set(0, 1, 0), rate };
}

/**
 * The way a ring crack goes on from (x, z) (walk's `about`): along the ring
 * `about` ({ x, z, radius, turn }), turned back toward it by CRACK.ringHold of
 * its share off it (at most 0.6 rad).
 */
function ringAim(about, x, z) {
  const azimuth = Math.atan2(z - about.z, x - about.x);
  const off = (Math.hypot(x - about.x, z - about.z) - about.radius) / about.radius;
  return azimuth + about.turn * (Math.PI / 2 + Math.min(Math.max(CRACK.ringHold * off, -0.6), 0.6));
}

/** A standard normal draw (Box–Muller). */
function gaussian(random) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}
const between = (random, [least, most]) => least + (most - least) * random();

/** The characteristic length of floating ice `thickness` thick (m; the header). */
export function iceLength(thickness) {
  return ((ICE.modulus * thickness ** 3) / (12 * (1 - ICE.poisson ** 2) * WATER_DENSITY * GRAVITY)) ** 0.25;
}

/** The distance from (x, z) to the segment from (ax, az) to (bx, bz), and how far along it the nearest point lies (0 to 1, unclamped). */
function segmentDistance(x, z, ax, az, bx, bz, out) {
  const alongX = bx - ax, alongZ = bz - az;
  const lengthSquared = alongX * alongX + alongZ * alongZ;
  const along = lengthSquared > 0 ? ((x - ax) * alongX + (z - az) * alongZ) / lengthSquared : 0;
  const share = Math.min(Math.max(along, 0), 1);
  out.distance = Math.hypot(x - ax - alongX * share, z - az - alongZ * share);
  out.along = along;
  out.side = alongX * (z - az) - alongZ * (x - ax);   // its sign: which side of the segment's line (x, z) is on
  return out;
}
const nearest = { distance: 0, along: 0, side: 0 };
// The polygon helpers below are src/rock.js's too (restFaces' outlines).
export { convexHull, insidePolygon, polygonEdgeDistance };

/** Whether (x, z) is inside a closed polygon of corners [x0, z0, x1, z1, …] (crossing number). */
function insidePolygon(corners, x, z) {
  let inside = false;
  const count = corners.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const ax = corners[2 * index], az = corners[2 * index + 1], bx = corners[2 * previous], bz = corners[2 * previous + 1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** The distance from (x, z) to a closed polygon's edge (m). */
function polygonEdgeDistance(corners, x, z) {
  let least = Infinity;
  const count = corners.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    least = Math.min(least, segmentDistance(x, z, corners[2 * previous], corners[2 * previous + 1], corners[2 * index], corners[2 * index + 1], nearest).distance);
  }
  return least;
}

/** A polygon's area (m², of either winding) and middle (its area's centroid), of corners [x0, z0, …]. */
function polygonMiddle(corners) {
  let twice = 0, x = 0, z = 0;
  const count = corners.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const ax = corners[2 * previous], az = corners[2 * previous + 1], bx = corners[2 * index], bz = corners[2 * index + 1];
    const cross = ax * bz - bx * az;
    twice += cross;
    x += (ax + bx) * cross;
    z += (az + bz) * cross;
  }
  return Math.abs(twice) < 1e-12 ? { area: 0, x: corners[0], z: corners[1] } : { area: Math.abs(twice) / 2, x: x / (3 * twice), z: z / (3 * twice) };
}

/**
 * A convex polygon (corners [x0, z0, …]) cut by the line through (x, z) at
 * `angle` (radians from +x toward +z): its parts either side, each convex
 * (one, the polygon itself, if the line misses it).
 */
function splitConvex(corners, x, z, angle) {
  const directionX = Math.cos(angle), directionZ = Math.sin(angle);
  const side = (index) => (corners[index] - x) * directionZ - (corners[index + 1] - z) * directionX;
  const left = [], right = [];
  const count = corners.length / 2;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const here = side(2 * index), there = side(2 * next);
    (here >= 0 ? left : right).push(corners[2 * index], corners[2 * index + 1]);
    if ((here >= 0) !== (there >= 0)) {
      const share = here / (here - there);
      const crossX = corners[2 * index] + (corners[2 * next] - corners[2 * index]) * share;
      const crossZ = corners[2 * index + 1] + (corners[2 * next + 1] - corners[2 * index + 1]) * share;
      left.push(crossX, crossZ);
      right.push(crossX, crossZ);
    }
  }
  return [left, right].filter((part) => part.length >= 6);
}

/** The convex hull of points [x0, z0, …] (Andrew's monotone chain), as corners [x0, z0, …] counter-clockwise. */
function convexHull(points) {
  const sorted = [];
  for (let index = 0; index < points.length; index += 2) sorted.push([points[index], points[index + 1]]);
  sorted.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const cross = (origin, first, second) => (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0]);
  const lower = [], upper = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].flat();
}

/** A mask byte for a distance `distance` (m) capped at `far` (the header). */
const toByte = (distance, far) => Math.round(127.5 + (Math.min(Math.max(distance, -far), far) * 127.5) / far);

export class IceSheet {
  /**
   * The ice over the solver's patch (`domainMin`, `domainSize`: src/
   * spectralWater.js's), off (no thickness) until setThickness.
   */
  constructor({ domainMin, domainSize, texels = MASK.texels }) {
    this.domainMin = [domainMin[0], domainMin[1]];
    this.domainSize = domainSize;
    this.texels = texels;
    this.cell = domainSize / texels;
    this.thickness = 0;
    this.time = 0;               // the world's clock (setTime): when a hole opened, its shards are let go, it skins over
    this.pool = null;            // the pool's square ({ minX, minZ, size }) when the water is the pool's, else the lake (setPool)
    this.deck = null;            // the pool's deck as ground (src/pool.js poolGround), round a frozen pool
    this.holes = [];             // oldest first
    this.opened = 0;             // how many holes have opened (src/main.js looks over what rests on the ice when it changes)
    this.crackLines = [];        // every crack since the ice was made whole (walk), oldest first, for src/iceCracks.js to draw
    this.crackEpoch = 0;         // counts the times it was made whole: src/iceCracks.js starts again when it changes
    this.crackCount = 0;         // cracks walked (their ids)
    this.crackSegments = [];     // every crack's segments, [ax, az, bx, bz, id, …], and a grid of them (CRACK.cell: crackMet)
    this.crackGrid = new Map();
    this.weakSpots = [];         // where cracks have weakened it (a star, round a hole): { x, z, reach, share } (weakness)
    this.pieces = new Set();     // its pieces afloat as things (src/main.js adopts them): ground in their holes (pieceUnder)
    this.onIce = [];             // what is on it, and its weight (weigh), each step
    this.weakened = 0;           // a count of the weak spots' changes (weaken, clear): weigh's last answer stands while it is the same
    this.held = { entries: [], weakened: -1, opened: -1, open: -1 };   // what weigh last found the ice held, and the ice as it was
    this.onPieces = new Map();   // each piece afloat and what lies on it, each step (weigh: bearPiece)
    this.events = [];            // breaks and cracks since src/main.js last took them (its sound)
    this.shards = [];            // pieces let go since src/main.js last took them (piecesOf; it makes each a thing)
    this.streams = new WeakMap();   // each thing's own stream of the ice's draws, seeded from its splash's seed
    // The mask (the header): bytes for the GPU (fillMask), and R, G and B as floats here, to paint unions into and dry.
    this.holeField = new Float32Array(texels * texels).fill(MASK.holeFar);
    this.wetField = new Float32Array(texels * texels);
    this.wetBox = null;          // [first column, last, first row, last] holding every texel still wet, or null
    this.wetDue = 0;             // seconds of drying not yet done (FLOOD.step)
    this.maskData = new Uint8Array(texels * texels * 4);
    this.changed = [];           // rectangles of texels painted since the mask was last filled (fillMask)...
    this.sent = [];              // ...and of bytes written as they are (A, a drying B), to be sent with them (update)
    this.rowFirst = new Int32Array(texels).fill(texels);   // update's: each row's first and last texel to send
    this.rowLast = new Int32Array(texels).fill(-1);
    this.fillMask();
    this.texture = new THREE.DataTexture(this.maskData, texels, texels, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    // The shaders' (src/shaders/scene.js ICE_MASK): shared objects, which setThickness and update fill.
    this.uniforms = {
      uIceMask: { value: this.texture },
      uIceArea: { value: new THREE.Vector3(this.domainMin[0], this.domainMin[1], domainSize) },
      uIceOn: { value: 0 },
      uIceTop: { value: 0 },
      uIceThickness: { value: 0 },
      uIceFar: { value: MASK.holeFar },   // the cap a hole's distance's bytes span (fillMask)
      uIcePool: { value: new THREE.Vector4() },   // the pool's square (corner x, z, side) and 1 over a frozen pool, else 0 (setPool)
      uIceGlaze: { value: FLOOD.glaze },   // B's least once wet (fillMask)
      uIceWet: { value: 0 },   // how wet the rain has made it: src/main.js shares the weather's object
      uSnow: { value: 0 },     // the snow lying on it (SNOW_COVER in src/shaders/scene.js): src/main.js shares the weather's object
    };
    this.dirty = false;
    // The ground (src/rock.js `ground`): the ice, over the deck round a frozen pool.
    this.groundObject = {
      // In a hole, a piece afloat there is ground too (pieceUnder): its top.
      // `asker`, the thing asking (src/rock.js): a piece is no ground under itself.
      at: (x, z, asker = null) => this.at(x, z) ?? (this.pieces.size ? this.pieceUnder(x, z, asker)?.top ?? null : null),
      materialAt: (x, z) => (this.overWater(x, z) ? ICE_MATERIAL : null),
      meet: (rock, height) => this.meet(rock, height),
      // The piece afloat a thing on the ground at (x, z) lies on, as `at` finds it: none over the sheet (src/collide.js: it
      // does not meet that one).
      pieceUnder: (x, z, asker = null) => (this.pieces.size && this.at(x, z) === null ? this.pieceUnder(x, z, asker) : null),
    };
  }

  /** Whether there is ice. */
  get on() { return this.thickness > 0; }

  /** The ice's top over the still water (m: the header). */
  get top() { return this.thickness * (1 - ICE.density / WATER_DENSITY); }

  /** Its characteristic length (m: the header). */
  get length() { return iceLength(this.thickness); }

  /** The ice `metres` thick (0: none), whole again: every hole and crack gone. */
  setThickness(metres) {
    this.thickness = Math.max(metres, 0);
    this.uniforms.uIceOn.value = this.on ? 1 : 0;
    this.uniforms.uIceTop.value = this.top;
    this.uniforms.uIceThickness.value = this.thickness;
    this.clear();
  }

  /** The water it covers: the pool's square and its deck (`deck`, src/pool.js poolGround), or the lake (null). */
  setPool(square, deck = null) {
    this.pool = square ?? null;
    this.deck = square ? deck : null;
    if (square) this.uniforms.uIcePool.value.set(square.minX, square.minZ, square.size, 1);
    else this.uniforms.uIcePool.value.set(0, 0, 0, 0);
    this.clear();
  }

  /** Whole again: no hole, no crack, dry. */
  clear() {
    this.holes.length = 0;
    this.crackLines.length = 0;
    this.crackSegments.length = 0;
    this.crackGrid.clear();
    this.crackEpoch++;
    this.weakSpots.length = 0;
    this.weakened++;
    this.pieces.clear();
    this.events.length = 0;
    this.shards.length = 0;
    this.holeField.fill(MASK.holeFar);
    this.wetField.fill(0);
    this.wetBox = null;
    this.wetDue = 0;
    this.maskData.fill(0);
    this.fillMask();
    this.changed.length = 0;
    this.sent.length = 0;
    this.texture.clearUpdateRanges();   // all of it sent
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  /** The ground for src/rock.js (the header). */
  get ground() { return this.groundObject; }

  /** Whether (x, z) lies over the water the ice covers: the lake out from its waterline, or inside the pool's walls. */
  overWater(x, z) {
    const pool = this.pool;
    if (pool) return x > pool.minX && x < pool.minX + pool.size && z > pool.minZ && z < pool.minZ + pool.size;
    return shoreDistance(x, z) > 0;
  }

  /** The holes not yet skinned over. */
  get openHoles() { return this.holes.filter((hole) => !hole.skin?.closed).length; }

  /** Where a hole may be (the header): the solver's patch less HOLE.edge, or the pool inside its walls less HOLE.wall. */
  get holeBox() {
    const box = this.pool ?? { minX: this.domainMin[0], minZ: this.domainMin[1], size: this.domainSize };
    const gap = this.pool ? HOLE.wall : HOLE.edge;
    return { minX: box.minX + gap, minZ: box.minZ + gap, maxX: box.minX + box.size - gap, maxZ: box.minZ + box.size - gap };
  }

  /** Whether a hole may open at (x, z): over the solver's water, inside holeBox (its edge is brought inside it, shapeHole). */
  mayOpen(x, z) {
    const box = this.holeBox;
    return this.openHoles < HOLE.most && x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ && this.overWater(x, z);
  }

  /** The newest hole whose outline holds (x, z), or null: it says what is there, its open water or its new ice (the header). */
  holeAbout(x, z) {
    for (let index = this.holes.length - 1; index >= 0; index--) {
      const hole = this.holes[index];
      if (Math.hypot(x - hole.x, z - hole.z) <= hole.outer && insidePolygon(hole.corners, x, z)) return hole;
    }
    return null;
  }

  /** Whether a hole's new ice covers (x, z), inside it (the header: its front reaches that far in from its edge). */
  skinAt(hole, x, z) {
    return Boolean(hole.skin) && (hole.skin.closed || polygonEdgeDistance(hole.corners, x, z) <= hole.skin.front);
  }

  /** The hole whose open water (x, z) is in, or null: the ice, or a hole's new ice. */
  holeAt(x, z) {
    const hole = this.holeAbout(x, z);
    return hole && !this.skinAt(hole, x, z) ? hole : null;
  }

  /**
   * How far (x, z), in a hole's open water, is from the ice (m: the farthest
   * from the edge of any hole it is in, less its new ice; the holes' union is
   * at least that open), or 0.
   */
  clearance(x, z) {
    let clear = 0;
    for (const hole of this.holes) {
      if (hole.skin?.closed || Math.hypot(x - hole.x, z - hole.z) > hole.outer || !insidePolygon(hole.corners, x, z)) continue;
      clear = Math.max(clear, polygonEdgeDistance(hole.corners, x, z) - (hole.skin?.front ?? 0));
    }
    return clear;
  }

  /** How thick the ice is at (x, z) (m): the sheet's; a hole's new ice's (REFREEZE: thinner where its front passed later), or a shard's frozen into it; 0 in open water. */
  thicknessAt(x, z) {
    const hole = this.holeAbout(x, z);
    if (!hole) return this.thickness;
    if (!this.skinAt(hole, x, z)) return 0;
    for (const piece of hole.frozen) if (Math.hypot(x - piece.x, z - piece.z) <= piece.radius && insidePolygon(piece.corners, x, z)) return piece.thickness;
    const skin = hole.skin;
    const passed = skin.start + (REFREEZE.closing * polygonEdgeDistance(hole.corners, x, z)) / Math.max(skin.deepest, 1e-6);
    return REFREEZE.skin * Math.min(Math.max((this.time - passed) / REFREEZE.thickening, 0.05), 1);
  }

  /** The ground's height at (x, z) (src/rock.js `ground`): the ice's top over the water but in a hole's open water; the deck round a pool, the land behind a lake's waterline. */
  at(x, z) {
    if (!this.on) return this.deck ? this.deck.at(x, z) : null;
    if (this.pool) {
      if (!this.overWater(x, z)) return this.deck ? this.deck.at(x, z) : null;
    } else if (shoreDistance(x, z) <= 0) {
      return Math.max(groundHeightAt(x, z), this.top);
    }
    const hole = this.holeAbout(x, z);
    if (!hole) return this.top;
    return this.skinAt(hole, x, z) ? this.thicknessAt(x, z) * (1 - ICE.density / WATER_DENSITY) : null;
  }

  /** The ice's draws for a thing: a stream of its own, seeded from its splash's seed, so a seeded throw breaks alike however it is stepped. */
  streamFor(rock) {
    if (!this.streams.has(rock)) this.streams.set(rock, seededStream((rock.splashSeed ?? 0) ^ 0x1ce5eed));
    return this.streams.get(rock);
  }

  /**
   * The blow a thing strikes coming down at its speed now (N: the header),
   * over its collision radius, or a plate's face's (it comes down flat).
   */
  blow(rock) {
    const down = Math.max(-rock.velocity.y, 0);
    const thing = rock.thing;
    const give = thing.hollow ? ICE.give.shell : thing.body.soft ? 1 - (1 - ICE.give.soft) * (rock.thawed ?? 1) : 1;
    return (give * rock.mass * down * down) / (rock.plate ? rock.faceRadius : rock.collisionRadius);
  }

  /** What ice `thickness` thick holds this time (N: the header), drawn from `random`, at (x, z) if given (cracked there, less: weakness). */
  holds(random, thickness = this.thickness, x = null, z = null) {
    return ICE.strength * thickness ** 2 * Math.exp(ICE.spread * gaussian(random)) * (x === null ? 1 : this.weakness(x, z));
  }

  /**
   * A weak spot (the header: Weakened; { x, z, reach, share, hole: the hole
   * it is round, or null }): a star's whose middle is inside an earlier
   * star's WEAK.merge of its reach is that one cracked again (its share
   * taken by the new one's, to ICE.weakest; its reach the greater), so the
   * spots are as many as the places cracked, not the blows; past WEAK.most
   * the oldest star's goes, else the oldest hole's (a hole's goes with its
   * hole too: openHole).
   */
  weaken(spot) {
    this.weakened++;
    if (!spot.hole) {
      const again = this.weakSpots.find((other) => !other.hole && Math.hypot(other.x - spot.x, other.z - spot.z) < WEAK.merge * other.reach);
      if (again) {
        again.share = Math.max(again.share * spot.share, ICE.weakest);
        again.reach = Math.max(again.reach, spot.reach);
        return;
      }
    }
    this.weakSpots.push(spot);
    if (this.weakSpots.length > WEAK.most) {
      const oldest = this.weakSpots.findIndex((other) => !other.hole);
      this.weakSpots.splice(oldest >= 0 ? oldest : 0, 1);
    }
  }

  /**
   * The share of what it would hold whole that the ice holds at (x, z) (the
   * header: Weakened): each weak spot whose reach it is in takes it down
   * toward ICE.cracked at its middle (back to whole at its reach), spots
   * over each other each taking their share, to ICE.weakest at the least.
   */
  weakness(x, z) {
    let share = 1;
    for (const spot of this.weakSpots) {
      const distance = Math.hypot(x - spot.x, z - spot.z);
      if (distance < spot.reach) share *= 1 - (1 - spot.share) * (1 - distance / spot.reach);
    }
    return Math.max(share, ICE.weakest);
  }

  /**
   * The weight bearing on the ice at (x, z) (N; the header: Weight): of each
   * thing on it (weigh's `onIce`) but `except`, its weight times
   * e^(−(d/l_c)²), d its distance and l_c the ice's characteristic length
   * there: a floating plate spreads a load over about l_c.
   */
  loadAt(x, z, except = null, thickness = this.thicknessAt(x, z)) {
    const length = iceLength(thickness);
    let load = 0;
    for (const { rock, weight } of this.onIce) {
      if (rock === except) continue;
      const share = Math.hypot(rock.position.x - x, rock.position.z - z) / length;
      if (share < 3) load += weight * Math.exp(-share * share);
    }
    return load;
  }

  /**
   * What is on the ice this step (src/main.js, before the things move; the
   * header: Weight): each thing at rest on it or going along it, over the
   * water and in no hole, and its weight; then, if the weight bearing
   * somewhere is more than the ice holds there (its mean, cracked as it is),
   * it gives way under the heaviest thing there, which goes in as through a
   * broken hole at ICE.falls (src/rock.js `fallsThrough`). One break a step.
   * It held last step and nothing on it has moved, come or gone, and the ice
   * under it is as it was (no hole opened or closed, no spot weakened, no
   * new ice thicker under a thing): it holds still, unweighed (`held`), so
   * things at rest on the ice cost a step next to nothing.
   */
  weigh(things) {
    this.onIce.length = 0;
    this.onPieces.clear();
    if (!this.on) return;
    for (const rock of things) {
      if (!rock.grounded || rock.fallsThrough) continue;
      const x = rock.position.x, z = rock.position.z;
      if (!this.overWater(x, z)) continue;
      if (this.holeAt(x, z)) { this.bearPiece(rock); continue; }
      this.onIce.push({ rock, weight: rock.mass * GRAVITY });
    }
    this.dunkPieces();
    const held = this.held, open = this.openHoles;
    let same = held.weakened === this.weakened && held.opened === this.opened && held.open === open && held.entries.length === this.onIce.length;
    for (let index = 0; index < this.onIce.length; index++) {
      const entry = this.onIce[index], x = entry.rock.position.x, z = entry.rock.position.z;
      entry.x = x;
      entry.z = z;
      entry.thickness = this.thicknessAt(x, z);
      const before = held.entries[index];
      if (same && !(before.rock === entry.rock && before.x === x && before.z === z && before.weight === entry.weight && before.thickness === entry.thickness)) same = false;
    }
    if (same) return;
    let heaviest = null;
    for (const entry of this.onIce) {
      const { x, z, thickness } = entry;
      const load = entry.weight + this.loadAt(x, z, entry.rock, thickness);
      const holds = ICE.strength * thickness ** 2 * this.weakness(x, z);
      if (load > holds && this.mayOpen(x, z) && (!heaviest || entry.weight > heaviest.entry.weight)) heaviest = { entry, load, holds, thickness };
    }
    if (!heaviest) {
      Object.assign(held, { entries: this.onIce.slice(), weakened: this.weakened, opened: this.opened, open });
      return;
    }
    const { entry: { rock }, load, holds, thickness } = heaviest;
    const x = rock.position.x, z = rock.position.z;
    rock.velocity.set(rock.velocity.x, -ICE.falls, rock.velocity.z);
    const hole = this.openHole(rock, x, z, thickness, load / holds);
    this.events.push({ kind: 'break', x, z, strength: load / holds, radius: rock.radius, thickness });
    rock.fallsThrough = { hole, broke: true, keep: 1, open: false };
  }

  // ---- its pieces afloat as ground (the header: Pieces) ----------------------

  /** A piece let go (src/main.js addShard: a shard made a thing) is ground in its hole from now (pieceUnder) until forget. */
  adopt(rock) { if (rock.piece) this.pieces.add(rock); }

  /** A piece gone (faded, retired, frozen in): no longer ground. */
  forget(rock) { this.pieces.delete(rock); }

  /**
   * The piece afloat whose top is over (x, z), or within PIECE.margin of its
   * outline (a pebble does not fall into the crack between two), and that
   * top's height there ({ rock, top }), or null: a piece lying flat enough
   * (either face up, PIECE.flattest) and not awash (its top no lower than
   * PIECE.awash under the still water). Never `asker` itself (a piece is no
   * ground under itself), nor a piece held (src/main.js grab).
   */
  pieceUnder(x, z, asker = null) {
    for (const rock of this.pieces) {
      if (rock.fading !== undefined || rock === asker || rock.state === 'held') continue;
      const reach = rock.radius + PIECE.margin;
      if (Math.abs(x - rock.position.x) > reach || Math.abs(z - rock.position.z) > reach) continue;
      const top = pieceTopAt(rock, x, z);
      if (top !== null && top > -PIECE.awash) return { rock, top };
    }
    return null;
  }

  /**
   * What a piece afloat carries before it goes under (kg): the water its
   * freeboard would displace, ρw/ρi − 1 of its own mass (a 7 cm piece of
   * thin ice a few grams, a 20 cm piece of thick ice some 80).
   */
  pieceCarries(piece) {
    return piece.mass * (WATER_DENSITY / ICE.density - 1);
  }

  /**
   * A thing coming down on a piece afloat (meet; the header: Pieces). Its
   * blow (blow: as on the sheet) over what the piece's own ice holds breaks
   * it (splitPiece), and the thing goes on into the water through it, as
   * through the sheet (`{ hole, broke, keep }`: no crown stands on ice).
   * Else it drives the piece down where it struck (pushPiece: its momentum
   * shared with the piece and the water a plate carries face on), and if it,
   * with what already lies on the piece, is more than the piece carries, the
   * piece goes under there and the thing goes into the water past it; else it
   * lands on the piece's top (`{ ground }`).
   */
  landOnPiece(rock, { rock: piece, top }) {
    const x = rock.position.x, z = rock.position.z;
    const hole = this.holeAt(x, z) ?? piece.iceHole;
    const random = this.streamFor(rock);
    const thickness = piece.piece.thickness * piece.radius;
    const blow = this.blow(rock), holds = this.holds(random, thickness);
    if (blow >= holds && this.splitPiece(piece, x, z, blow / holds, random, rock)) {
      const speed = rock.velocity.length(), energy = 0.5 * rock.mass * speed * speed;
      const keep = Math.sqrt(Math.max(1 - (holds * thickness) / Math.max(energy, 1e-9), ICE.keepLeast ** 2));
      this.events.push({ kind: 'break', x, z, strength: blow / holds, radius: rock.radius, thickness });
      return { hole, broke: true, keep, open: false };
    }
    const down = Math.max(-rock.velocity.y, 0);
    const carried = piece.mass + (piece.plate ? piece.plateAddedMass(1) : 0);
    this.pushPiece(piece, x, z, (rock.mass * down) / (rock.mass + carried));
    const lying = this.onPieces.get(piece)?.mass ?? 0;
    if (rock.mass + lying > this.pieceCarries(piece)) {
      rock.dunked = piece;   // it pushed the piece under and goes down past it: they do not meet (src/collide.js)
      return { hole, broke: false, keep: 1, open: false };
    }
    return { ground: top };
  }

  /**
   * A piece afloat driven down at (x, z) at `speed` (m/s; landOnPiece,
   * dunkPieces): at most PIECE.dip (the water under a plate stops it within
   * a centimetre or two; past its freeboard little lifts it back, so more
   * would sink it from sight), and tipped, the side struck going down, at
   * that speed over a quarter of its radius for each radius off its middle
   * it was struck, at most PIECE.tipMost.
   */
  pushPiece(piece, x, z, speed) {
    const push = Math.min(speed, PIECE.dip);
    if (push <= 0) return;
    piece.knock(0, -push, 0, 0, 0, 0);
    const offX = x - piece.position.x, offZ = z - piece.position.z, off = Math.hypot(offX, offZ);
    if (off < 1e-4) return;
    // About up × the way to where it was struck: that side goes down.
    const rate = Math.min((push * off) / (0.25 * piece.radius * piece.radius), PIECE.tipMost);
    const angular = pieceUp.copy(piece.spinAxis).multiplyScalar(piece.spinRate).add(pieceLocal.set(offZ / off, 0, -offX / off).multiplyScalar(rate));
    piece.spinRate = angular.length();
    if (piece.spinRate > 1e-9) piece.spinAxis.copy(angular).divideScalar(piece.spinRate);
  }

  /**
   * A piece afloat broken by a blow at (x, z) `share` times what it held
   * (landOnPiece): split along a line through near where it was struck (two
   * lines, across each other, if the blow was over PIECE.twoLines times what
   * it held), each part a piece of its own (a shard let go: `shards`, which
   * src/main.js makes things) where it was, as the piece lay, set there while
   * the thing's cavity is open under it (fitCavity), then moving as the piece
   * moved and driven apart from the blow, its edge at the blow first down
   * (wedgeSpin); a part smaller than a shard may be (SHARD.least) is crushed
   * to slush; `by`, what broke it, goes down between them, meeting them
   * only once they are adrift and apart (src/collide.js passesBy). The piece
   * goes (`brokenUp`: src/main.js retires it). Returns
   * whether it broke (a piece too small to split is only pushed).
   */
  splitPiece(piece, x, z, share, random, by = null) {
    const thickness = piece.piece.thickness * piece.radius;
    if (2 * piece.radius < 2 * Math.max(SHARD.least, SHARD.slab * thickness)) return false;
    // Its outline as it lies, seen from above (world x and z).
    const corners = piece.piece.corners, outline = [];
    for (let index = 0; index < corners.length; index += 2) {
      pieceLocal.set(corners[index] * piece.radius, 0, corners[index + 1] * piece.radius).applyQuaternion(piece.quaternion);
      outline.push(piece.position.x + pieceLocal.x, piece.position.z + pieceLocal.z);
    }
    const nearX = x + PIECE.offLine * piece.radius * (2 * random() - 1), nearZ = z + PIECE.offLine * piece.radius * (2 * random() - 1);
    const first = Math.PI * random();
    let parts = splitConvex(outline, nearX, nearZ, first);
    if (share > PIECE.twoLines) parts = parts.flatMap((part) => splitConvex(part, nearX, nearZ, first + Math.PI / 2 + 0.6 * (random() - 0.5)));
    const least = Math.max(SHARD.least, SHARD.slab * thickness);
    const made = [];
    for (const part of parts) {
      const { x: middleX, z: middleZ, area } = polygonMiddle(part);
      const partCorners = new Float64Array(part.length);
      let radius = 0;
      for (let index = 0; index < part.length; index += 2) {
        partCorners[index] = part[index] - middleX;
        partCorners[index + 1] = part[index + 1] - middleZ;
        radius = Math.max(radius, Math.hypot(partCorners[index], partCorners[index + 1]));
      }
      if (2 * radius < least || area <= 0) continue;
      // Driven apart from the blow, its edge at it going down first.
      let awayX = middleX - x, awayZ = middleZ - z;
      const away = Math.hypot(awayX, awayZ) || 1;
      awayX /= away; awayZ /= away;
      const apart = between(random, PIECE.apart);
      made.push({
        corners: partCorners, x: middleX, z: middleZ, radius, area, wedge: true, thickness, hole: piece.iceHole,
        mass: ICE.density * area * thickness, white: piece.piece.white,
        shape: { corners: partCorners.map((value) => value / radius), thickness: thickness / radius, white: piece.piece.white, milk: piece.piece.milk },
        start: {
          position: new THREE.Vector3(middleX, piece.position.y, middleZ),
          velocity: new THREE.Vector3(piece.velocity.x + awayX * apart, piece.velocity.y - PIECE.dip, piece.velocity.z + awayZ * apart),
          quaternion: new THREE.Quaternion(),
          spin: wedgeSpin(awayX, awayZ, Math.min(PIECE.dip / (2 * radius), PIECE.tipMost), 0),
          setFor: 0,
          by,
        },
      });
    }
    if (made.length < 2) return false;
    this.shards.push(...made);
    this.pieces.delete(piece);
    piece.brokenUp = true;
    return true;
  }

  /**
   * A thing on the ground in a hole (weigh): on a piece, its weight on it
   * (onPieces), and if the piece has drifted or bobbed from under it (its
   * top PIECE.settle from where it rests, or gone), it goes along the ground
   * again (src/rock.js loseGround: on the piece's top, or into the water).
   */
  bearPiece(rock) {
    const under = this.pieceUnder(rock.position.x, rock.position.z, rock);
    if (rock.state === 'rest' && (!under || Math.abs(under.top - rock.groundHeight) > PIECE.settle)) rock.loseGround();
    if (!under) return;
    const lying = this.onPieces.get(under.rock) ?? { mass: 0, things: [] };
    lying.mass += rock.mass;
    lying.things.push(rock);
    this.onPieces.set(under.rock, lying);
  }

  /** Each piece carrying more than it can (weigh: onPieces, pieceCarries) goes under, and what lies on it goes into the water at ICE.falls. */
  dunkPieces() {
    for (const [piece, { mass, things }] of this.onPieces) {
      if (mass <= this.pieceCarries(piece)) continue;
      const middleX = things.reduce((sum, rock) => sum + rock.mass * rock.position.x, 0) / mass;
      const middleZ = things.reduce((sum, rock) => sum + rock.mass * rock.position.z, 0) / mass;
      this.pushPiece(piece, middleX, middleZ, (ICE.falls * mass) / (mass + piece.mass));
      for (const rock of things) {
        rock.velocity.y = -ICE.falls;
        rock.dunked = piece;
        rock.fallsThrough = { hole: this.holeAt(rock.position.x, rock.position.z) ?? piece.iceHole, broke: false, keep: 1, open: true };
      }
    }
  }

  /**
   * A thing coming down on the ground (`height`) or onto the water (null)
   * (src/rock.js `ground` meet; the header): `{ ground: height }` if the ice
   * holds it (it lands on it, even over a hole too small for it: then moved
   * off the hole onto the ice), `{ hole, broke, keep, open }` if it goes into
   * the water by a hole (broke: the ice gave way, or opened wider for its
   * splash; keep: the share of its speed it keeps; open: whether the water
   * about it is open enough for its whole splash, a crown standing on it),
   * or null: no ice here.
   */
  meet(rock, height) {
    if (!this.on) return null;
    const x = rock.position.x, z = rock.position.z;
    if (!this.overWater(x, z)) return null;
    // Down on a piece afloat in a hole (the ground there: pieceUnder), not on the sheet.
    if (height !== null && this.pieces.size && this.holeAt(x, z)) {
      const under = this.pieceUnder(x, z, rock);
      if (under) return this.landOnPiece(rock, under);
    }
    if (height !== null) return this.strike(rock);
    const hole = this.holeAt(x, z);
    // At the water in a hole where a piece lies (come over it from a crack between pieces, or from the open water): it
    // meets the piece, not the water.
    if (hole && this.pieces.size) {
      const under = this.pieceUnder(x, z, rock);
      if (under) return this.landOnPiece(rock, under);
    }
    // Onto the water over the ice (it came over a hole's edge in the air): it strikes the ice there.
    if (!hole) return this.strike(rock) ?? { ground: this.at(x, z) ?? this.top };
    // Too wide for the hole: it strikes the hole's edge, which holds (it lands on the ice beside the hole) or breaks: the
    // ice the hole broke, or its new ice's youngest, at its front.
    if (hole.inner - (hole.skin?.front ?? 0) < rock.collisionRadius) {
      const struck = this.strike(rock, hole.skin ? REFREEZE.skin * 0.05 : hole.thickness);
      if (struck) return struck;
      this.moveOffHole(rock, hole);
      return { ground: this.at(rock.position.x, rock.position.z) ?? this.top };
    }
    // It fits through, and stirs the hole's water: it is left alone again from now (REFREEZE). Its splash would stand on
    // the ice if the hole is narrower than its lip: a fast one opens the hole wider (the water it throws aside breaks the
    // edge); a slow one (sliding in off the edge) goes in without its crown.
    this.disturb(hole);
    const speed = rock.velocity.length(), horizontal = Math.hypot(rock.velocity.x, rock.velocity.z);
    const room = roundLipReach(rock.radius, speed, horizontal / Math.max(speed, 1e-6), 0, HOLE.fall);
    if (this.clearance(x, z) >= room) return { hole, broke: false, keep: 1, open: true };
    if (speed < HOLE.widensFrom || !this.mayOpen(x, z)) return { hole, broke: false, keep: 1, open: false };
    return { hole: this.openHole(rock, x, z, hole.thickness), broke: true, keep: 1, open: false };
  }

  /** A thing over a hole too small for it, its edge holding: moved out, away from the hole's middle, until its middle is over the ice. */
  moveOffHole(rock, hole) {
    let awayX = rock.position.x - hole.x, awayZ = rock.position.z - hole.z;
    const away = Math.hypot(awayX, awayZ);
    if (away < 1e-6) { awayX = 1; awayZ = 0; } else { awayX /= away; awayZ /= away; }
    let distance = Math.max(away, 0);
    while (this.holeAt(hole.x + awayX * distance, hole.z + awayZ * distance) && distance < hole.outer + 1) distance += 0.005;
    rock.position.x = hole.x + awayX * (distance + 0.002);
    rock.position.z = hole.z + awayZ * (distance + 0.002);
  }

  /**
   * A thing striking the ice (meet; the header), `thickness` thick (where it
   * is, else): null if the ice holds (a near miss stars it with cracks), else
   * the hole it opens, broke, and the share of its speed it keeps.
   */
  strike(rock, thickness = this.thicknessAt(rock.position.x, rock.position.z)) {
    const random = this.streamFor(rock);
    const blow = this.blow(rock);
    const x = rock.position.x, z = rock.position.z;
    // What it holds there, cracked as it is (weakness), less what already bears on it there (loadAt: the header's Weight),
    // and at least ICE.loadedLeast of what it would whole: very weak there, never nothing (a blow over nothing would be
    // a break of endless strength, its cracks without number).
    const holds = Math.max(this.holds(random, thickness, x, z) - this.loadAt(x, z, rock, thickness), ICE.loadedLeast * ICE.strength * thickness ** 2);
    const speed = rock.velocity.length();
    this.lastStrike = { blow, holds, x, z };   // for tools/ice-probe.mjs
    if (blow < holds || !this.mayOpen(x, z)) {
      if (blow > ICE.crackShare * holds) this.star(x, z, random, blow / holds, thickness);
      return null;
    }
    const energy = 0.5 * rock.mass * speed * speed;
    const work = holds * thickness;
    const keep = Math.sqrt(Math.max(1 - work / Math.max(energy, 1e-9), ICE.keepLeast ** 2));
    const hole = this.openHole(rock, x, z, thickness, blow / holds);
    this.events.push({ kind: 'break', x, z, strength: blow / holds, radius: rock.radius, thickness });
    return { hole, broke: true, keep, open: false };
  }

  /**
   * A hole opened at (x, z) by a thing going in there (strike, meet), in ice
   * `thickness` thick, by a blow `strength` times what the ice held (its
   * cracks: settle): as wide as a round hole's lip for its speed and its
   * direction (roundLipReach), until fitCavity fits it to its cavity's.
   */
  openHole(rock, x, z, thickness, strength = 1) {
    const random = this.streamFor(rock);
    const speed = rock.velocity.length(), horizontal = Math.hypot(rock.velocity.x, rock.velocity.z);
    const fraction = Math.min(horizontal / Math.max(speed, 1e-6), 1);
    const headingX = horizontal > 1e-4 ? rock.velocity.x / horizontal : 1, headingZ = horizontal > 1e-4 ? rock.velocity.z / horizontal : 0;
    const corners = HOLE.corners;
    const hole = {
      x, z, radius: rock.radius, least: HOLE.least * rock.collisionRadius, thickness, strength,
      seed: Math.floor(random() * 4294967296), corners: new Float64Array(2 * corners), inner: 0, outer: 0, reaches: new Float64Array(HOLE.reaches),
      heading: { x: headingX, z: headingZ, lean: fraction },   // which way the thing went along the ice (the flood leans so)
      settled: false, painted: false, cracks: [], crackCorners: [],
      // Its pieces are let go at the next step (setTime: the hole fitted to its cavity by then), its flood once the cavity closes.
      openedAt: this.time, quiet: this.time, releaseAt: this.time, released: false, floodAt: this.time + SHARD.leastDelay, flooded: false,
      down: Math.max(-rock.velocity.y, 0),   // the speed it came down at (m/s): what drives its pieces under
      by: rock,                              // what broke it: it went down between its pieces, and meets them only once the hole floods (src/collide.js)
      skin: null, field: null, frozen: [], box: null,
    };
    // Each corner's azimuth, a little off even, from the hole's own stream.
    const shapeRandom = seededStream(hole.seed);
    hole.angles = Float64Array.from({ length: corners }, (unused, index) => (2 * Math.PI * (index + 0.35 * (shapeRandom() - 0.5))) / corners);
    hole.cosines = hole.angles.map(Math.cos);
    hole.sines = hole.angles.map(Math.sin);
    const reaches = hole.cosines.map((cosine, index) => roundLipReach(rock.radius, speed, fraction, cosine * headingX + hole.sines[index] * headingZ, HOLE.fall));
    this.shapeHole(hole, reaches);
    // Past HOLE.kept, the oldest skinned over is let go (its new ice holds as the sheet does from then).
    if (this.holes.length >= HOLE.kept) {
      const oldest = this.holes.findIndex((candidate) => candidate.skin?.closed);
      if (oldest >= 0) {
        // Its weak spot goes with it: it holds as the sheet does from then.
        const [gone] = this.holes.splice(oldest, 1);
        this.weakSpots = this.weakSpots.filter((spot) => spot.hole !== gone);
        this.weakened++;
      }
    }
    this.holes.push(hole);
    this.opened++;
    this.dirty = true;
    return hole;
  }

  /**
   * Fit a hole to the cavity the thing that broke it opened (src/cavity.js,
   * src/main.js after the splash's impact): each corner out beyond the
   * cavity's lip (Cavity.lipReach) as openHole put it beyond a round one's;
   * the water comes up through it once the cavity has closed (SHARD.leastDelay
   * at the least: flood). The parts of a piece afloat that `rock` broke
   * (splitPiece; still to be made, in `shards`) stay set where they broke
   * until that cavity closes, as a hole's wedges do (src/rock.js breakAway).
   */
  fitCavity(hole, cavity, rock = null) {
    if (!cavity) return;
    if (rock) for (const part of this.shards) if (part.start.by === rock) part.start.setFor = Math.max(cavity.closeTime ?? 0, SHARD.leastDelay);
    if (!hole || hole.settled) return;
    const reaches = cavity.lipReach(hole.x, hole.z, hole.cosines, hole.sines, new Float64Array(hole.cosines.length), HOLE.fall);
    this.shapeHole(hole, reaches);
    hole.floodAt = hole.openedAt + Math.max(cavity.closeTime ?? 0, SHARD.leastDelay);
  }

  /**
   * A hole's corners from the lip's reach along each corner's azimuth
   * (`reaches`, m): each beyond it by HOLE.margin, the slow waves and its own
   * jag, deeper where a piece broke away (the header), at least `least` out,
   * and inside where a hole may be (holeBox); then its inner and outer
   * radius about its middle, and its edge's reach at HOLE.reaches azimuths.
   */
  shapeHole(hole, reaches) {
    const random = seededStream(hole.seed ^ 0x5eed);
    const count = hole.angles.length;
    const waves = [2, 3, 4, 5].map((mode) => ({ mode, amplitude: HOLE.waves * random(), phase: 2 * Math.PI * random() }));
    const bites = new Float64Array(count);
    const biteCount = Math.round(between(random, HOLE.bites));
    for (let bite = 0; bite < biteCount; bite++) {
      const centre = Math.floor(random() * count), span = between(random, HOLE.biteSpan), depth = between(random, HOLE.bite);
      for (let offset = -Math.ceil(span); offset <= Math.ceil(span); offset++) {
        const share = Math.max(1 - Math.abs(offset) / span, 0);
        const corner = (centre + offset + count) % count;
        bites[corner] = Math.max(bites[corner], depth * share);
      }
    }
    const box = this.holeBox;
    const low = [box.minX, box.minZ], high = [box.maxX, box.maxZ];
    let outer = 0;
    for (let index = 0; index < count; index++) {
      const angle = hole.angles[index];
      const slow = waves.reduce((sum, wave) => sum + wave.amplitude * (1 + Math.cos(wave.mode * angle + wave.phase)) / 2, 0);
      const out = Math.max(reaches[index] * (1 + HOLE.margin + slow + HOLE.jag * random() + bites[index]), hole.least);
      const x = Math.min(Math.max(hole.x + hole.cosines[index] * out, low[0]), high[0]);
      const z = Math.min(Math.max(hole.z + hole.sines[index] * out, low[1]), high[1]);
      hole.corners[2 * index] = x;
      hole.corners[2 * index + 1] = z;
      outer = Math.max(outer, Math.hypot(x - hole.x, z - hole.z));
    }
    hole.outer = outer;
    hole.inner = polygonEdgeDistance(hole.corners, hole.x, hole.z);
    // The edge's reach about its middle at even azimuths: the nearest of its sides a ray from the middle crosses.
    const corners = hole.corners;
    for (let sample = 0; sample < HOLE.reaches; sample++) {
      const angle = (2 * Math.PI * sample) / HOLE.reaches, rayX = Math.cos(angle), rayZ = Math.sin(angle);
      let reach = Infinity;
      for (let index = 0, previous = count - 1; index < count; previous = index++) {
        const ax = corners[2 * previous] - hole.x, az = corners[2 * previous + 1] - hole.z;
        const sideX = corners[2 * index] - corners[2 * previous], sideZ = corners[2 * index + 1] - corners[2 * previous + 1];
        const across = rayX * sideZ - rayZ * sideX;
        if (Math.abs(across) < 1e-12) continue;
        const along = (ax * sideZ - az * sideX) / across, share = (ax * rayZ - az * rayX) / across;
        if (along > 0 && share >= 0 && share <= 1) reach = Math.min(reach, along);
      }
      hole.reaches[sample] = Number.isFinite(reach) ? reach : hole.inner;
    }
  }

  /** How far a hole's edge is from its middle along the azimuth `angle` (radians from +x toward +z; m): its `reaches`, between samples. */
  edgeReach(hole, angle) {
    const position = (((angle / (2 * Math.PI)) % 1) + 1) % 1 * HOLE.reaches;
    const index = Math.floor(position) % HOLE.reaches, share = position - Math.floor(position);
    return hole.reaches[index] + (hole.reaches[(index + 1) % HOLE.reaches] - hole.reaches[index]) * share;
  }

  /** A blow the ice held stars it (strike): CRACK.star cracks from where it struck, `share` of what it holds the blow's, in ice `thickness` thick, at CRACK.bullseye odds ringed. */
  star(x, z, random, share, thickness = this.thickness) {
    const count = Math.round(between(random, CRACK.star));
    const length = iceLength(thickness);
    const start = 2 * Math.PI * random();
    const arms = [];
    for (let index = 0; index < count; index++) {
      const heading = start + (2 * Math.PI * (index + 0.4 * (random() - 0.5))) / count;
      const reach = between(random, CRACK.starReach) * length * Math.min(share, 1);
      const crack = this.walk(x, z, heading, reach, random, { width: between(random, CRACK.width) * CRACK.starWidth, forks: false });
      if (crack) arms.push({ crack, angle: heading });
    }
    if (arms.length >= 3 && random() < CRACK.bullseye) {
      const shortest = Math.min(...arms.map(({ crack }) => crack.length));
      this.ring(x, z, arms, shortest * between(random, [0.45, 0.75]), random, CRACK.starWidth);
    }
    // Cracked through, it holds less there (weakness), out to its arms' mean length.
    if (arms.length > 0) this.weaken({ x, z, reach: arms.reduce((sum, { crack }) => sum + crack.length, 0) / arms.length, share: ICE.cracked, hole: null });
    this.events.push({ kind: 'crack', x, z, strength: share, thickness });
    this.dirty = true;
  }

  /** Whether a crack may run on at (x, z): over the ice (inside the pool's walls, off the shore, in the patch), and in no hole. */
  crackMayRun(x, z) {
    const box = this.pool ?? { minX: this.domainMin[0], minZ: this.domainMin[1], size: this.domainSize };
    return x > box.minX && x < box.minX + box.size && z > box.minZ && z < box.minZ + box.size && this.overWater(x, z) && !this.holeAbout(x, z);
  }

  /** A crack's segment into the grid (CRACK.cell), so the cracks after it find it (crackMet). */
  addCrackSegment(ax, az, bx, bz, id) {
    const index = this.crackSegments.length;
    this.crackSegments.push(ax, az, bx, bz, id);
    const cell = CRACK.cell;
    for (let column = Math.floor(Math.min(ax, bx) / cell); column <= Math.floor(Math.max(ax, bx) / cell); column++) {
      for (let row = Math.floor(Math.min(az, bz) / cell); row <= Math.floor(Math.max(az, bz) / cell); row++) {
        const key = (column + 4096) * 8192 + row + 4096;
        const list = this.crackGrid.get(key);
        if (list) list.push(index); else this.crackGrid.set(key, [index]);
      }
    }
  }

  /**
   * Where the segment from (ax, az) to (bx, bz) first meets a crack already
   * there, not crack `id` nor its `parent` (a branch starts on it), past its
   * own first tenth of a millimetre: { x, z }, or null.
   */
  crackMet(ax, az, bx, bz, id, parent) {
    const cell = CRACK.cell, segments = this.crackSegments;
    const alongX = bx - ax, alongZ = bz - az;
    const length = Math.hypot(alongX, alongZ);
    if (length < 1e-9) return null;
    let first = Infinity;
    for (let column = Math.floor(Math.min(ax, bx) / cell); column <= Math.floor(Math.max(ax, bx) / cell); column++) {
      for (let row = Math.floor(Math.min(az, bz) / cell); row <= Math.floor(Math.max(az, bz) / cell); row++) {
        const list = this.crackGrid.get((column + 4096) * 8192 + row + 4096);
        if (!list) continue;
        for (const index of list) {
          const owner = segments[index + 4];
          if (owner === id || owner === parent) continue;
          const cx = segments[index], cz = segments[index + 1], acrossX = segments[index + 2] - cx, acrossZ = segments[index + 3] - cz;
          const denominator = alongX * acrossZ - alongZ * acrossX;
          if (Math.abs(denominator) < 1e-14) continue;
          const share = ((cx - ax) * acrossZ - (cz - az) * acrossX) / denominator;
          const other = ((cx - ax) * alongZ - (cz - az) * alongX) / denominator;
          if (share * length > 1e-4 && share <= 1 && other >= 0 && other <= 1) first = Math.min(first, share);
        }
      }
    }
    return Number.isFinite(first) ? { x: ax + alongX * first, z: az + alongZ * first } : null;
  }

  /**
   * A crack from (x, z) setting out along `heading` (radians from +x toward
   * +z), at most `reach` (m) long (CRACK: straight runs and kinks, toward
   * `target` ({ x, z }) if given, round the ring `about` ({ x, z, radius,
   * turn: +1 the way the azimuth grows, −1 the other }) if given, else the
   * way it set out), `width` its
   * half-width at the start (m), `shade` how open; forking if `forks`. It
   * stops where the ice ends (crackMayRun: on the wall, the shore, a hole's
   * edge, within a few tenths of a millimetre) or on a crack it meets
   * (crackMet), and past CRACK.mostSegments in all. It sets out at `time`
   * (s, the ice's clock; now if not given) and runs at CRACK.speed. Returns
   * it ({ points: [x0, z0, …], widths (each point's half-width, m), times
   * (when the crack reached each point, s), shade, id, length (m) },
   * also in crackLines, for src/iceCracks.js), or null if it could not set
   * out; its branches go to crackLines and to `into` if given.
   */
  walk(x, z, heading, reach, random, { width, shade = between(random, CRACK.shade), forks = true, target = null, about = null, parent = -1, into = null, time = this.time }) {
    const crack = { points: [x, z], widths: [], times: [time], shade, id: this.crackCount++, length: 0 };
    const setOut = heading;
    let lineX = x, lineZ = z, travelled = 0, runLeft = between(random, CRACK.run), runLength = runLeft;
    let widthFrom = 1, widthTo = Math.min(Math.max(1 + CRACK.widthWander * gaussian(random), 0.55), 1.5), narrowed = 1;
    const halfWidth = (along) => {
      const run = widthFrom + (widthTo - widthFrom) * (1 - runLeft / Math.max(runLength, 1e-9));
      const base = width * narrowed * run * (1 - (CRACK.narrowing * along) / reach);
      const tip = Math.min(Math.max((reach - along) / (CRACK.taper * reach), 0), 1);
      return CRACK.hairline + Math.max(base - CRACK.hairline, 0) * tip ** 0.7;
    };
    crack.widths.push(halfWidth(0));
    while (travelled < reach - 1e-9 && this.crackSegments.length < 5 * CRACK.mostSegments) {
      const step = Math.min(CRACK.step, reach - travelled, runLeft);
      const wobble = CRACK.wobble * gaussian(random);
      const nextLineX = lineX + Math.cos(heading) * step, nextLineZ = lineZ + Math.sin(heading) * step;
      let pointX = nextLineX - Math.sin(heading) * wobble, pointZ = nextLineZ + Math.cos(heading) * wobble;
      const points = crack.points, lastX = points[points.length - 2], lastZ = points[points.length - 1];
      let stop = false, share = 1;
      if (!this.crackMayRun(pointX, pointZ)) {
        // To where the ice ends, by halving.
        let inside = 0, outside = 1;
        for (let halving = 0; halving < 7; halving++) {
          const middle = (inside + outside) / 2;
          if (this.crackMayRun(lastX + (pointX - lastX) * middle, lastZ + (pointZ - lastZ) * middle)) inside = middle; else outside = middle;
        }
        share = inside;
        pointX = lastX + (pointX - lastX) * inside;
        pointZ = lastZ + (pointZ - lastZ) * inside;
        stop = true;
      }
      const met = this.crackMet(lastX, lastZ, pointX, pointZ, crack.id, parent);
      if (met) {
        share *= Math.hypot(met.x - lastX, met.z - lastZ) / Math.max(Math.hypot(pointX - lastX, pointZ - lastZ), 1e-12);
        pointX = met.x;
        pointZ = met.z;
        stop = true;
      }
      travelled += step * share;
      if (Math.hypot(pointX - lastX, pointZ - lastZ) > 2e-4) {
        points.push(pointX, pointZ);
        crack.widths.push(halfWidth(travelled));
        crack.times.push(time + travelled / CRACK.speed);
        this.addCrackSegment(lastX, lastZ, pointX, pointZ, crack.id);
      }
      if (stop) break;
      lineX = nextLineX;
      lineZ = nextLineZ;
      runLeft -= step;
      if (runLeft > 1e-9) continue;
      // A kink, pulled back toward where it is going; the next run a little wider or narrower.
      const aim = about ? ringAim(about, lineX, lineZ) : target ? Math.atan2(target.z - lineZ, target.x - lineX) : setOut;
      heading += CRACK.kink * gaussian(random) + CRACK.pull * Math.atan2(Math.sin(aim - heading), Math.cos(aim - heading));
      runLeft = runLength = between(random, CRACK.run);
      widthFrom = widthTo;
      widthTo = Math.min(Math.max(1 + CRACK.widthWander * gaussian(random), 0.55), 1.5);
      if (forks && random() < CRACK.fork && reach - travelled > 0.04) {
        // A fork: a branch to one side, the crack bending a little to the other, both narrower.
        const side = random() < 0.5 ? -1 : 1, turn = between(random, CRACK.forkAngle);
        const branch = this.walk(points[points.length - 2], points[points.length - 1], heading + side * turn, (reach - travelled) * between(random, CRACK.forkReach), random,
          { width: width * narrowed * (1 - (CRACK.narrowing * travelled) / reach) * CRACK.forkNarrows, shade: shade * 0.9, forks: false, parent: crack.id, into, time: time + travelled / CRACK.speed });
        if (branch && into) into.push(branch);
        heading -= side * 0.3 * turn;
        narrowed *= CRACK.forkNarrows;
      }
    }
    if (crack.points.length < 4) return null;
    crack.length = travelled;
    this.crackLines.push(crack);
    return crack;
  }

  /**
   * Ring crack `radius` (m) about (x, z) (the header): from each of `arms`
   * ({ crack, angle }: radial cracks and the way they set out) that reaches
   * it, round to the next that does, at CRACK.chord odds each, curving with
   * the ring (walk's `about`) until it runs into that one; `widthShare` as
   * wide as a crack; into `into` if given.
   */
  ring(x, z, arms, radius, random, widthShare, into = null) {
    const reaching = [];
    for (const { crack, angle } of arms) {
      const points = crack.points;
      for (let index = 2; index < points.length; index += 2) {
        if (Math.hypot(points[index] - x, points[index + 1] - z) < radius * (1 + 0.08 * gaussian(random))) continue;
        reaching.push({ crack, angle: ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), x: points[index], z: points[index + 1], time: crack.times[index / 2] });
        break;
      }
    }
    reaching.sort((first, second) => first.angle - second.angle);
    if (reaching.length < 2) return;
    for (let index = 0; index < reaching.length; index++) {
      const from = reaching[index], to = reaching[(index + 1) % reaching.length];
      const gap = ((to.angle - from.angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      if (gap > 2.2 || gap < 0.15 || random() > CRACK.chord) continue;
      // Round the way the radials' azimuths grow (atan2's: from +x toward +z), its own radius the ring's where it starts.
      const about = { x, z, radius: Math.hypot(from.x - x, from.z - z), turn: 1 };
      const heading = ringAim(about, from.x, from.z);
      const chord = this.walk(from.x, from.z, heading, about.radius * gap * 1.4, random, { width: between(random, CRACK.width) * widthShare, forks: false, about, parent: from.crack.id, time: from.time });
      if (chord && into) into.push(chord);
    }
  }

  /**
   * A hole's cracks (the header), once its shape is final: radial ones from
   * its corners, more for a harder blow, at CRACK.runaway odds one running
   * far; and at CRACK.ring odds a ring of chords joining them, and another
   * farther out at CRACK.secondRing odds.
   */
  settle(hole) {
    if (hole.settled) return;
    hole.settled = true;
    const random = seededStream(hole.seed ^ 0xc4ac);
    const length = iceLength(hole.thickness);
    const doublings = Math.max(Math.log2(Math.max(hole.strength, 1)), 0);
    const count = Math.min(Math.round(between(random, CRACK.radials) + CRACK.perDoubling * doublings), CRACK.most);
    const corners = hole.angles.length;
    const start = random() * corners;
    const runaway = random() < CRACK.runaway ? Math.floor(random() * count) : -1;
    const radials = [];
    for (let index = 0; index < count; index++) {
      const corner = Math.floor(start + (corners * (index + 0.85 * (random() - 0.5))) / count) % corners;
      const x = hole.corners[2 * corner], z = hole.corners[2 * corner + 1];
      const heading = Math.atan2(z - hole.z, x - hole.x) + 0.3 * (random() - 0.5);
      const far = index === runaway;
      const reach = Math.min(between(random, far ? CRACK.runawayReach : CRACK.reach) * length, CRACK.longest);
      hole.crackCorners.push(corner);
      // It ran out from the blow, through the ice that broke, reaching the hole's edge this long after.
      const time = hole.openedAt + Math.hypot(x - hole.x, z - hole.z) / CRACK.speed;
      const crack = this.walk(x, z, heading, reach, random, { width: between(random, CRACK.width) * (far ? 1.25 : 1), into: hole.cracks, time });
      if (!crack) continue;
      hole.cracks.push(crack);
      radials.push({ crack, angle: heading });
    }
    // The crushed edge's fringe: short cracks from its corners, not a radial's (no wedge of shards, no ring, ends at one).
    const fringe = Math.min(Math.round(between(random, CRACK.fringe) + CRACK.perDoubling * doublings), CRACK.fringeMost);
    for (let index = 0; index < fringe; index++) {
      const corner = Math.floor(random() * corners);
      const x = hole.corners[2 * corner], z = hole.corners[2 * corner + 1];
      const heading = Math.atan2(z - hole.z, x - hole.x) + 0.9 * (random() - 0.5);
      const time = hole.openedAt + Math.hypot(x - hole.x, z - hole.z) / CRACK.speed;
      const crack = this.walk(x, z, heading, between(random, CRACK.fringeReach) * length, random, { width: between(random, CRACK.width) * CRACK.fringeWidth, forks: false, time });
      if (crack) hole.cracks.push(crack);
    }
    // The ice round it cracked radially, and a free edge: it holds less there (weakness), out past its radials' mean length.
    if (radials.length > 0) this.weaken({ x: hole.x, z: hole.z, reach: hole.outer + radials.reduce((sum, { crack }) => sum + crack.length, 0) / radials.length, share: ICE.cracked, hole });
    if (radials.length >= 3 && random() < CRACK.ring) {
      const radius = between(random, CRACK.ringRadius) * (hole.inner + hole.outer) / 2;
      this.ring(hole.x, hole.z, radials, radius, random, 0.8, hole.cracks);
      if (random() < CRACK.secondRing) this.ring(hole.x, hole.z, radials, radius * between(random, [1.5, 2.2]), random, 0.65, hole.cracks);
    }
    this.dirty = true;
  }

  // ---- shards (the header: SHARD) ------------------------------------------

  /**
   * The pieces a hole's ice broke into (the header), from its own stream, its
   * cracks drawn (settle): each { corners (its outline about its middle, m,
   * the world's x and z, counter-clockwise), x, z (its middle), radius (its
   * farthest corner), area (m²), thickness, mass (kg), white (its share of
   * white ice) } and how it starts under the water ({ position, velocity,
   * quaternion }, set for the time from `time` to the flood); the biggest
   * first.
   */
  piecesOf(hole, time = this.time) {
    if (hole.thickness < SHARD.thinnest) return [];
    this.settle(hole);
    const random = seededStream(hole.seed ^ 0x5a4d);
    const count = hole.angles.length;
    const pointAt = (corner, share) => {
      const index = ((corner % count) + count) % count;
      return [hole.x + (hole.corners[2 * index] - hole.x) * share, hole.z + (hole.corners[2 * index + 1] - hole.z) * share];
    };
    // A wedge's inner edge is clear of the thing that went down through its middle (SHARD.clear of its radius).
    const innerAt = (corner) => {
      const index = ((corner % count) + count) % count;
      const reach = Math.hypot(hole.corners[2 * index] - hole.x, hole.corners[2 * index + 1] - hole.z);
      return Math.min(Math.max(between(random, SHARD.inner), SHARD.clear * hole.radius / Math.max(reach, 1e-6)), 0.7);
    };
    const angleOf = (corner) => hole.angles[((corner % count) + count) % count] + 2 * Math.PI * Math.floor(corner / count);
    // The wedges between its radial cracks (corner ranges round its edge, `to` past `from`), a wide one in two.
    let starts = [...new Set(hole.crackCorners)].sort((first, second) => first - second);
    if (starts.length < 2) starts = [0, count / 4, count / 2, (3 * count) / 4].map(Math.round);
    const wedges = [];
    const cut = (from, to) => {
      if (angleOf(to) - angleOf(from) > SHARD.widest && to - from >= 4) {
        const middle = from + Math.round((to - from) * between(random, [0.4, 0.6]));
        cut(from, middle);
        cut(middle, to);
      } else wedges.push([from, to]);
    };
    starts.forEach((from, index) => {
      const next = starts[(index + 1) % starts.length];
      cut(from, next > from ? next : next + count);
    });
    // Each wedge from its inner edge to near the hole's, broken across where it is deep; a few chips from the middle.
    const outlines = [];
    for (const [from, to] of wedges) {
      const outer = between(random, SHARD.outer), innerFrom = innerAt(from), innerTo = innerAt(to);
      const across = outer - (innerFrom + innerTo) / 2 > SHARD.deep ? between(random, SHARD.across) : null;
      // Broken off the sheet raggedly: each corner of its outer edge at its own share of the hole's reach.
      const rim = [];
      for (let corner = from; corner <= to; corner++) rim.push(...pointAt(corner, outer * (1 - SHARD.ragged * random())));
      if (across === null) outlines.push({ points: [...rim, ...pointAt(to, innerTo), ...pointAt(from, innerFrom)], wedge: true });
      else {
        // Across at a slant: each end at its own share.
        const acrossFrom = Math.max(across + SHARD.slant * (2 * random() - 1), innerFrom + 0.12), acrossTo = Math.max(across + SHARD.slant * (2 * random() - 1), innerTo + 0.12);
        outlines.push({ points: [...rim, ...pointAt(to, acrossTo), ...pointAt(from, acrossFrom)], wedge: true });
        outlines.push({ points: [...pointAt(from, acrossFrom), ...pointAt(to, acrossTo), ...pointAt(to, innerTo), ...pointAt(from, innerFrom)], wedge: true });
      }
    }
    const meanReach = (hole.inner + hole.outer) / 2;
    const chips = Math.round(between(random, SHARD.chips));
    for (let chip = 0; chip < chips; chip++) {
      const angle = 2 * Math.PI * random(), out = between(random, SHARD.inner) * this.edgeReach(hole, angle) * between(random, [0.2, 0.8]);
      const size = between(random, SHARD.chip) * meanReach / 2;
      const middleX = hole.x + Math.cos(angle) * out, middleZ = hole.z + Math.sin(angle) * out;
      const sides = 3 + Math.floor(3 * random()), turn = 2 * Math.PI * random();
      const points = [];
      for (let side = 0; side < sides; side++) {
        const at = turn + (2 * Math.PI * (side + 0.6 * (random() - 0.5))) / sides, reach = size * between(random, [0.6, 1]);
        points.push(middleX + Math.cos(at) * reach, middleZ + Math.sin(at) * reach);
      }
      outlines.push({ points, wedge: false });
    }
    // Each its hull, shrunk about its middle; then as many as float in it, the biggest first.
    const pieces = [];
    for (const { points: outline, wedge } of outlines) {
      const hull = convexHull(outline);
      const { x, z } = polygonMiddle(hull);
      const corners = new Float64Array(hull.length);
      const gap = between(random, SHARD.gap);
      let radius = 0;
      for (let index = 0; index < hull.length; index += 2) {
        corners[index] = (hull[index] - x) * gap;
        corners[index + 1] = (hull[index + 1] - z) * gap;
        radius = Math.max(radius, Math.hypot(corners[index], corners[index + 1]));
      }
      const area = polygonMiddle(corners).area;
      if (2 * radius < Math.max(SHARD.least, SHARD.slab * hole.thickness) || area <= 0) continue;
      // Over older open water (a hole widened) it was water.
      if (this.holes.some((older) => older !== hole && this.holes.indexOf(older) < this.holes.indexOf(hole) && Math.hypot(x - older.x, z - older.z) <= older.outer && insidePolygon(older.corners, x, z) && !this.skinAt(older, x, z))) continue;
      pieces.push({ corners, x, z, radius, area, wedge });
    }
    pieces.sort((first, second) => second.area - first.area);
    const room = SHARD.fill * polygonMiddle(hole.corners).area;
    const kept = [];
    let filled = 0;
    for (const piece of pieces) {
      if (kept.length >= SHARD.most) break;
      if (filled + piece.area > room) continue;
      filled += piece.area;
      kept.push(piece);
    }
    // How each starts (SHARD): a wedge where it broke, driven down, its inner edge first; a chip under the water; each
    // drifting out; white as the sheet is, about.
    const thickShare = Math.min(Math.max((hole.thickness - 0.01) / 0.03, 0), 1);
    for (const piece of kept) {
      const outX = piece.x - hole.x, outZ = piece.z - hole.z;
      const out = Math.hypot(outX, outZ) || 1;
      const radialX = outX / out, radialZ = outZ / out;
      // Inside the hole's edge as it is held there (contain).
      const room = Math.max(this.edgeReach(hole, Math.atan2(radialZ, radialX)) - piece.radius - 0.002, 0);
      if (!piece.wedge && out > room) { piece.x = hole.x + radialX * room; piece.z = hole.z + radialZ * room; }
      const tilt = piece.wedge ? 0 : THREE.MathUtils.degToRad(between(random, SHARD.tilt));
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-radialZ, 0, radialX), tilt)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(radialX, 0, radialZ), piece.wedge ? 0 : 0.3 * (random() - 0.5)));
      const drift = between(random, SHARD.drift), aside = SHARD.aside * (2 * random() - 1);
      const driftX = radialX * Math.cos(aside) - radialZ * Math.sin(aside), driftZ = radialX * Math.sin(aside) + radialZ * Math.cos(aside);
      piece.thickness = hole.thickness;
      piece.mass = ICE.density * piece.area * hole.thickness;
      // Some pieces are of the sheet's white ice, the rest clear (src/shaders/scene.js ICE_WHITE: more white in thick ice).
      piece.white = random() < SHARD.whiteOdds * (0.12 + 0.28 * thickShare) ? between(random, SHARD.whiteShare) : between(random, [0, 0.1]);
      // Its outline for its mesh (src/thingMeshes.js createShardGeometry): in its own radii, its own +y up; and how milky
      // its clear ice is, as the sheet's (ICE.scatter, src/shaders/scene.js ICE_SCATTER's twin), seen a little aslant.
      const milk = 1 - Math.exp(-ICE.scatter * hole.thickness / 0.8);
      piece.shape = { corners: piece.corners.map((value) => value / piece.radius), thickness: hole.thickness / piece.radius, white: piece.white, milk };
      // A wedge: set in the sheet where it broke, its middle where the sheet's is (it floats there), until the water comes
      // back up through the hole (floodAt); then its inner edge driven down at `inner`, turning about the tangent at its
      // outer edge, its middle going down at half that.
      const inner = Math.min(between(random, SHARD.push) * hole.down, SHARD.pushMost);
      piece.start = piece.wedge ? {
        position: new THREE.Vector3(piece.x, hole.thickness * (0.5 - ICE.density / WATER_DENSITY), piece.z),
        setFor: Math.max(hole.floodAt - time, 0),
        velocity: new THREE.Vector3(driftX * drift, -0.5 * inner, driftZ * drift),
        quaternion,
        // Tipping about the tangent and, jostled, turning about the vertical either way (SHARD.turn), as one spin.
        spin: wedgeSpin(radialX, radialZ, Math.min(inner / (4 * piece.radius), SHARD.tipMost), (random() < 0.5 ? -1 : 1) * between(random, SHARD.turn)),
      } : {
        // Its highest point (its raised rim, tilted) under the water by `depth` of its radius: it comes up, never appears out of it.
        position: new THREE.Vector3(piece.x, -(hole.thickness / 2 + Math.sin(tilt) * piece.radius + between(random, SHARD.depth) * piece.radius), piece.z),
        velocity: new THREE.Vector3(driftX * drift, 0, driftZ * drift),
        quaternion,
        spin: null,
      };
      piece.hole = hole;
    }
    return kept;
  }

  /**
   * A floater that went into the water by a hole (src/rock.js iceHole), or
   * a shard of it, held inside it (src/collide.js `contain`, as src/pool.js
   * holdInPool holds a thing in the pool): its middle no farther from the
   * hole's than its edge's reach that way (edgeReach), less its new ice's
   * front and its own radius as it meets things (a plate's whole radius,
   * flat; a shard, each corner of its own outline inside the edge), its
   * speed outward turned
   * back at its own bounce (the water between takes some). Returns how hard
   * it was turned back ({ change, normalX, normalZ }, the normal into the
   * hole), or null.
   */
  contain(rock) {
    const hole = rock.iceHole;
    if (!this.on || !hole || !rock.floats || !(rock.state === 'water' || rock.state === 'float' || rock.afloat)) return null;
    const awayX = rock.position.x - hole.x, awayZ = rock.position.z - hole.z;
    const away = Math.hypot(awayX, awayZ);
    if (away < 1e-9) return null;
    const front = hole.skin?.front ?? 0;
    // How far past the edge it is: a shard by its own outline's corners as it is turned, each against the edge at its
    // own azimuth (a wedge broken from the hole's rim lies right up to it, which its disc would not); anything else by
    // its middle, its reach in from the edge (a plate lies flat: its rim must not go under the ice).
    let over;
    if (rock.piece) {
      over = -Infinity;
      const corners = rock.piece.corners, corner = containCorner;
      for (let index = 0; index < corners.length; index += 2) {
        corner.set(corners[index] * rock.radius, 0, corners[index + 1] * rock.radius).applyQuaternion(rock.quaternion);
        const cornerX = awayX + corner.x, cornerZ = awayZ + corner.z;
        over = Math.max(over, Math.hypot(cornerX, cornerZ) - Math.max(this.edgeReach(hole, Math.atan2(cornerZ, cornerX)) - front, 0));
      }
    } else {
      const reach = rock.plate ? rock.radius : rock.collisionRadius;
      over = away - Math.max(this.edgeReach(hole, Math.atan2(awayZ, awayX)) - front - reach, 0);
    }
    // A hundredth of a millimetre's slack: one held at the edge, then come to rest there, lies at its room give or take
    // the rounding, and knocked each step for that it would never rest.
    if (over <= 1e-5) return null;
    const normalX = -awayX / away, normalZ = -awayZ / away;
    const outward = -(rock.velocity.x * normalX + rock.velocity.z * normalZ);
    const change = outward > 0 ? (1 + rock.collisionBounce * 0.8) * outward : 0;
    rock.knock(normalX * change, 0, normalZ * change, normalX * over, 0, normalZ * over);
    return { change, normalX, normalZ };
  }

  // ---- the world's clock: shards let go, the flood, new ice (the header) ---

  /** A hole stirred (a thing went in by it, or floats in it: src/main.js): it is left alone from now (REFREEZE.after). */
  disturb(hole) {
    if (hole && !hole.skin) hole.quiet = this.time;
  }

  /**
   * Each hole opened before `time` (s) lets its shards go (into `shards`):
   * src/main.js asks at each step's end with the next step's time, and makes
   * them things with the parts of any piece split in that step, so neither a
   * hole nor a split piece is ever drawn empty; setTime asks again at that
   * time, and nothing more goes.
   */
  letGo(time) {
    if (!this.on) return;
    for (const hole of this.holes) {
      if (hole.released || !(time > hole.releaseAt)) continue;
      hole.released = true;
      this.shards.push(...this.piecesOf(hole, time));
    }
  }

  /**
   * The world's clock at `time` (s; src/main.js, each step): each hole opened
   * the step before lets its shards go (into `shards`), and each whose cavity
   * has closed floods the ice round it; the wet freezes away (FLOOD.step);
   * holes left alone skin over, their new ice growing in (REFREEZE.step).
   */
  setTime(time) {
    const passed = Math.max(time - this.time, 0);
    this.time = time;
    if (!this.on) return;
    this.letGo(time);
    for (const hole of this.holes) {
      if (!hole.flooded && time >= hole.floodAt) {
        hole.flooded = true;
        // What broke it is down past its pieces now (its cavity closed): it meets them again (src/collide.js), come back
        // up afloat, and the hole no longer keeps it.
        hole.by = null;
        this.flood(hole);
      }
      // Its field worked out a few rows a step in the seconds before (prepareSkin), then its new ice begins.
      if (!hole.skin && hole.flooded && time - hole.quiet >= REFREEZE.after - REFREEZE.prepare && !hole.field?.ready) this.prepareSkin(hole, REFREEZE.texels);
      if (!hole.skin && hole.field?.ready && time - hole.quiet >= REFREEZE.after) this.startSkin(hole);
      if (hole.skin && !hole.skin.closed && time - hole.skin.painted >= REFREEZE.step) this.growSkin(hole);
    }
    if (this.wetBox) {
      this.wetDue += passed;
      if (this.wetDue >= FLOOD.step) { this.dry(this.wetDue / FLOOD.dry); this.wetDue = 0; }
    }
  }

  /**
   * The water come up through a hole and over the ice round it (the header:
   * FLOOD), from the hole's own stream: wet out to FLOOD.reach of its edge's
   * reach, waved, leaning the way the thing went, feathered.
   */
  flood(hole) {
    const random = seededStream(hole.seed ^ 0xf100d);
    const reach = between(random, FLOOD.reach);
    const waves = [1, 2, 3, 5, 8, 13].map((mode) => ({ mode, amplitude: (FLOOD.wobble * random()) / Math.sqrt(mode), phase: 2 * Math.PI * random() }));
    const meanReach = (hole.inner + hole.outer) / 2;
    const lean = FLOOD.lean * hole.heading.lean * meanReach, feather = FLOOD.feather * meanReach;
    // Its edge at even azimuths (FLOOD.bins), and the least and most of it: inside the least less the feather it is
    // all wet, past the most dry, and only between is each texel's azimuth worth finding.
    const edges = new Float64Array(FLOOD.bins);
    let least = Infinity, most = 0;
    for (let bin = 0; bin < FLOOD.bins; bin++) {
      const angle = (2 * Math.PI * bin) / FLOOD.bins;
      const waved = waves.reduce((sum, wave) => sum + wave.amplitude * Math.cos(wave.mode * angle + wave.phase), 0);
      const ahead = Math.max(Math.cos(angle) * hole.heading.x + Math.sin(angle) * hole.heading.z, 0);
      edges[bin] = this.edgeReach(hole, angle) * reach * (1 + waved) + lean * ahead;
      least = Math.min(least, edges[bin]);
      most = Math.max(most, edges[bin]);
    }
    const [firstColumn, lastColumn] = this.texelRange(hole.x - most, hole.x + most, 0);
    const [firstRow, lastRow] = this.texelRange(hole.z - most, hole.z + most, 1);
    if (lastColumn < firstColumn || lastRow < firstRow) return;
    const allWet = Math.max(least - feather, 0) ** 2, mostSquared = most * most;
    for (let row = firstRow; row <= lastRow; row++) {
      const offsetZ = this.domainMin[1] + (row + 0.5) * this.cell - hole.z;
      for (let column = firstColumn; column <= lastColumn; column++) {
        const offsetX = this.domainMin[0] + (column + 0.5) * this.cell - hole.x;
        const squared = offsetX * offsetX + offsetZ * offsetZ;
        if (squared >= mostSquared) continue;
        let amount = 1;
        if (squared > allWet) {
          const position = (((Math.atan2(offsetZ, offsetX) / (2 * Math.PI)) % 1) + 1) % 1 * FLOOD.bins;
          const bin = Math.floor(position) % FLOOD.bins, share = position - Math.floor(position);
          const edge = edges[bin] + (edges[(bin + 1) % FLOOD.bins] - edges[bin]) * share;
          amount = 1 - THREE.MathUtils.smoothstep(Math.sqrt(squared), edge - feather, edge);
        }
        const texel = row * this.texels + column;
        if (amount > this.wetField[texel]) this.wetField[texel] = amount;
      }
    }
    this.markWet([firstColumn, lastColumn, firstRow, lastRow]);
  }

  /** A drop come down on the ice at (x, z), wetting a spot `radius` (m) across (src/splash.js): more drops, wetter. */
  wetSpot(x, z, radius) {
    if (!this.on) return;
    const [firstColumn, lastColumn] = this.texelRange(x - radius, x + radius, 0);
    const [firstRow, lastRow] = this.texelRange(z - radius, z + radius, 1);
    if (lastColumn < firstColumn || lastRow < firstRow) return;
    for (let row = firstRow; row <= lastRow; row++) {
      const offsetZ = this.domainMin[1] + (row + 0.5) * this.cell - z;
      for (let column = firstColumn; column <= lastColumn; column++) {
        const share = 1 - Math.hypot(this.domainMin[0] + (column + 0.5) * this.cell - x, offsetZ) / radius;
        if (share <= 0) continue;
        const texel = row * this.texels + column;
        this.wetField[texel] = Math.min(this.wetField[texel] + FLOOD.soak * share, 1);
      }
    }
    this.markWet([firstColumn, lastColumn, firstRow, lastRow]);
  }

  /** Texels wetted in `rectangle`: to be filled (update), and within the box the drying walks. */
  markWet(rectangle) {
    this.changed.push(rectangle);
    const box = this.wetBox;
    this.wetBox = box ? [Math.min(box[0], rectangle[0]), Math.max(box[1], rectangle[1]), Math.min(box[2], rectangle[2]), Math.max(box[3], rectangle[3])] : [...rectangle];
    this.dirty = true;
  }

  /** The wet frozen away by `share` of full wetness over the wet box (FLOOD.dry), which shrinks to what is still wet. */
  dry(share) {
    const [firstColumn, lastColumn, firstRow, lastRow] = this.wetBox;
    const glaze = 255 * FLOOD.glaze, wetScale = 255 - glaze;
    let box = null;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const texel = row * this.texels + column;
        if (this.wetField[texel] <= 0) continue;
        const wet = Math.max(this.wetField[texel] - share, 0);
        this.wetField[texel] = wet;
        this.maskData[4 * texel + 2] = Math.round(glaze + wet * wetScale);   // B alone (fillMask's)
        if (wet <= 0) continue;
        if (box) { box[0] = Math.min(box[0], column); box[1] = Math.max(box[1], column); box[2] = Math.min(box[2], row); box[3] = Math.max(box[3], row); } else box = [column, column, row, row];
      }
    }
    this.sent.push(this.wetBox);
    this.wetBox = box;
    this.dirty = true;
  }

  /**
   * A hole's field for its new ice (the header: REFREEZE), `texels` more of it
   * a call (it is dear: each texel's distance to each side), so it is ready by
   * the time its new ice begins: how far in from its edge each texel about it
   * is (`depth`: exact inside, capped outside), the deepest, and where newer
   * holes cut it (`clip`, their signed distances, outside them positive), so
   * its new ice grows over its own open water only.
   */
  prepareSkin(hole, texels) {
    const far = MASK.holeFar;
    if (!hole.field) {
      const [firstColumn, lastColumn] = this.texelRange(hole.x - hole.outer - far, hole.x + hole.outer + far, 0);
      const [firstRow, lastRow] = this.texelRange(hole.z - hole.outer - far, hole.z + hole.outer + far, 1);
      const width = Math.max(lastColumn - firstColumn + 1, 0), height = Math.max(lastRow - firstRow + 1, 0);
      hole.field = { firstColumn, lastColumn, firstRow, lastRow, width, depth: new Float32Array(width * height).fill(-far), clip: null, row: firstRow, deepest: this.cell, ready: false };
      for (const newer of this.holes.slice(this.holes.indexOf(hole) + 1)) if (newer.box) this.clipField(hole, newer);
    }
    const field = hole.field, corners = hole.corners, count = corners.length / 2;
    const crossings = [];
    let done = 0;
    while (field.row <= field.lastRow && done < texels) {
      const row = field.row++;
      const z = this.domainMin[1] + (row + 0.5) * this.cell;
      // Its insides along the row, by scanline.
      crossings.length = 0;
      for (let index = 0, previous = count - 1; index < count; previous = index++) {
        const az = corners[2 * previous + 1], bz = corners[2 * index + 1];
        if ((az > z) !== (bz > z)) crossings.push(corners[2 * previous] + ((z - az) * (corners[2 * index] - corners[2 * previous])) / (bz - az));
      }
      crossings.sort((first, second) => first - second);
      for (let column = field.firstColumn; column <= field.lastColumn; column++) {
        const x = this.domainMin[0] + (column + 0.5) * this.cell;
        if (Math.hypot(x - hole.x, z - hole.z) > hole.outer + far) continue;
        let inside = false;
        for (const crossing of crossings) if (crossing < x) inside = !inside;
        const distance = polygonEdgeDistance(corners, x, z);
        done++;
        field.depth[(row - field.firstRow) * field.width + column - field.firstColumn] = inside ? distance : Math.max(-distance, -far);
        if (inside) field.deepest = Math.max(field.deepest, distance);
      }
    }
    field.ready = field.row > field.lastRow;
  }

  /** A hole begins to skin over (the header: REFREEZE), its field ready (prepareSkin). */
  startSkin(hole) {
    hole.skin = { start: this.time, front: 0, deepest: hole.field.deepest, painted: -Infinity, closed: false };
  }

  /** A newer hole's signed distance (outside it positive) into an older one's field's clip, where their boxes meet. */
  clipField(hole, newer) {
    const field = hole.field;
    if (!field || !newer.box) return;
    const firstColumn = Math.max(field.firstColumn, newer.box[0]), lastColumn = Math.min(field.lastColumn, newer.box[1]);
    const firstRow = Math.max(field.firstRow, newer.box[2]), lastRow = Math.min(field.lastRow, newer.box[3]);
    if (lastColumn < firstColumn || lastRow < firstRow) return;
    field.clip ??= new Float32Array(field.depth.length).fill(MASK.holeFar);
    for (let row = firstRow; row <= lastRow; row++) {
      const z = this.domainMin[1] + (row + 0.5) * this.cell;
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x = this.domainMin[0] + (column + 0.5) * this.cell;
        const distance = Math.min(polygonEdgeDistance(newer.corners, x, z), MASK.holeFar);
        const signed = insidePolygon(newer.corners, x, z) ? -distance : distance;
        const local = (row - field.firstRow) * field.width + column - field.firstColumn;
        if (signed < field.clip[local]) field.clip[local] = signed;
      }
    }
  }

  /**
   * A hole's new ice grown to now (REFREEZE): its front `closing` seconds from
   * its edge to its deepest, painted into A as the most of what is there and
   * its own (the front's distance, within its hole, clipped by newer holes),
   * so it only grows; closed, its field is let go.
   */
  growSkin(hole) {
    const skin = hole.skin, field = hole.field;
    skin.front = Math.min((this.time - skin.start) / REFREEZE.closing, 1) * skin.deepest;
    skin.painted = this.time;
    const far = MASK.holeFar;
    for (let row = field.firstRow; row <= field.lastRow; row++) {
      for (let column = field.firstColumn; column <= field.lastColumn; column++) {
        const local = (row - field.firstRow) * field.width + column - field.firstColumn;
        const depth = field.depth[local];
        if (depth <= -far) continue;
        const reached = Math.min(skin.front - depth, depth + REFREEZE.seam, field.clip ? field.clip[local] : far);
        const byte = toByte(reached, far), at = 4 * (row * this.texels + column) + 3;
        if (byte > this.maskData[at]) this.maskData[at] = byte;
      }
    }
    this.sent.push([field.firstColumn, field.lastColumn, field.firstRow, field.lastRow]);
    this.dirty = true;
    if (skin.front >= skin.deepest) { skin.closed = true; hole.field = null; }
  }

  /**
   * Whether a hole's new ice has reached a shard in it (src/main.js then
   * freezes it in): its front as far in as the shard's rim, or the hole closed.
   */
  reaches(rock) {
    const hole = rock.iceHole;
    if (!hole?.skin) return false;
    return hole.skin.closed || polygonEdgeDistance(hole.corners, rock.position.x, rock.position.z) - rock.radius <= hole.skin.front;
  }

  /**
   * A shard frozen into its hole's new ice (src/main.js, which then lets it
   * go as a thing): its outline as it lies, painted into R as the sheet's ice
   * (the most of what is there and its own signed distance, inside it
   * positive), and kept as ice its own thickness (thicknessAt).
   */
  freezeIn(rock) {
    const piece = rock.piece, hole = rock.iceHole;
    if (!piece || !hole) return;
    this.pieces.delete(rock);
    const count = piece.corners.length / 2;
    const corners = new Float64Array(2 * count);
    const corner = new THREE.Vector3();
    for (let index = 0; index < count; index++) {
      corner.set(piece.corners[2 * index] * rock.radius, 0, piece.corners[2 * index + 1] * rock.radius).applyQuaternion(rock.quaternion);
      corners[2 * index] = rock.position.x + corner.x;
      corners[2 * index + 1] = rock.position.z + corner.z;
    }
    const far = MASK.holeFar;
    const [firstColumn, lastColumn] = this.texelRange(rock.position.x - rock.radius - far, rock.position.x + rock.radius + far, 0);
    const [firstRow, lastRow] = this.texelRange(rock.position.z - rock.radius - far, rock.position.z + rock.radius + far, 1);
    for (let row = firstRow; row <= lastRow; row++) {
      const z = this.domainMin[1] + (row + 0.5) * this.cell;
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x = this.domainMin[0] + (column + 0.5) * this.cell;
        const distance = Math.min(polygonEdgeDistance(corners, x, z), far);
        const signed = insidePolygon(corners, x, z) ? distance : -distance;
        const texel = row * this.texels + column;
        if (signed > this.holeField[texel]) this.holeField[texel] = signed;
      }
    }
    if (lastColumn >= firstColumn && lastRow >= firstRow) this.changed.push([firstColumn, lastColumn, firstRow, lastRow]);
    hole.frozen.push({ corners, x: rock.position.x, z: rock.position.z, radius: rock.radius, thickness: piece.thickness * rock.radius });
    this.dirty = true;
  }

  // ---- the mask (the header) -----------------------------------------------

  /**
   * Paint what has opened or cracked since, and send what changed (once a
   * frame, src/main.js): holes' shapes are final by then (fitCavity). Returns
   * whether the mask changed.
   */
  update() {
    if (!this.dirty) return false;
    this.dirty = false;
    for (const hole of this.holes) {
      if (hole.painted) continue;
      this.settle(hole);
      this.paintHole(hole);
      hole.painted = true;
    }
    this.fillMask(this.changed);
    // Only the rows painted go to the GPU (the header), each from the first texel painted in it to the last, unless so
    // many rows that all of it is cheaper; rows already waiting to go are kept.
    const texture = this.texture, rowFirst = this.rowFirst, rowLast = this.rowLast;
    for (const [firstColumn, lastColumn, firstRow, lastRow] of [...this.changed, ...this.sent]) {
      for (let row = firstRow; row <= lastRow; row++) {
        rowFirst[row] = Math.min(rowFirst[row], firstColumn);
        rowLast[row] = Math.max(rowLast[row], lastColumn);
      }
    }
    let rows = 0;
    for (let row = 0; row < this.texels; row++) if (rowLast[row] >= 0) rows++;
    if (rows + texture.updateRanges.length > MASK.ranges) texture.clearUpdateRanges();
    else for (let row = 0; row < this.texels; row++) if (rowLast[row] >= 0) texture.addUpdateRange(4 * (row * this.texels + rowFirst[row]), 4 * (rowLast[row] - rowFirst[row] + 1));
    rowFirst.fill(this.texels);
    rowLast.fill(-1);
    this.changed.length = 0;
    this.sent.length = 0;
    texture.needsUpdate = true;
    return true;
  }

  /** The texel range [first, last] along an axis covering [low, high] (m). */
  texelRange(low, high, axis) {
    const origin = this.domainMin[axis];
    return [Math.max(Math.floor((low - origin) / this.cell - 0.5), 0), Math.min(Math.ceil((high - origin) / this.cell - 0.5), this.texels - 1)];
  }

  /**
   * A hole into R: the signed distance to its edge, the least of it and what
   * was there (the holes' union), and into A the same, which cuts whatever
   * new ice is there (and older holes' new ice to come: clipField). Its
   * texels' insides by scanline, each texel's middle against the edges a row
   * crosses; the distance only in a band MASK.holeFar about each edge
   * (deeper inside it is −holeFar).
   */
  paintHole(hole) {
    const far = MASK.holeFar;
    const [firstColumn, lastColumn] = this.texelRange(hole.x - hole.outer - far, hole.x + hole.outer + far, 0);
    const [firstRow, lastRow] = this.texelRange(hole.z - hole.outer - far, hole.z + hole.outer + far, 1);
    const width = lastColumn - firstColumn + 1, height = lastRow - firstRow + 1;
    if (width <= 0 || height <= 0) return;
    const distance = new Float32Array(width * height).fill(far);
    const inside = new Uint8Array(width * height);
    const corners = hole.corners, count = corners.length / 2;
    const columnX = (column) => this.domainMin[0] + (column + 0.5) * this.cell;
    const rowZ = (row) => this.domainMin[1] + (row + 0.5) * this.cell;
    // Inside, by scanline.
    const crossings = [];
    for (let row = 0; row < height; row++) {
      const z = rowZ(firstRow + row);
      crossings.length = 0;
      for (let index = 0, previous = count - 1; index < count; previous = index++) {
        const az = corners[2 * previous + 1], bz = corners[2 * index + 1];
        if ((az > z) === (bz > z)) continue;
        const ax = corners[2 * previous], bx = corners[2 * index];
        crossings.push(ax + ((z - az) * (bx - ax)) / (bz - az));
      }
      crossings.sort((first, second) => first - second);
      for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
        const from = Math.max(Math.ceil((crossings[pair] - this.domainMin[0]) / this.cell - 0.5), firstColumn);
        const to = Math.min(Math.floor((crossings[pair + 1] - this.domainMin[0]) / this.cell - 0.5), lastColumn);
        for (let column = from; column <= to; column++) inside[row * width + column - firstColumn] = 1;
      }
    }
    // The distance, in a band about each edge.
    for (let index = 0, previous = count - 1; index < count; previous = index++) {
      const ax = corners[2 * previous], az = corners[2 * previous + 1], bx = corners[2 * index], bz = corners[2 * index + 1];
      const [fromColumn, toColumn] = this.texelRange(Math.min(ax, bx) - far, Math.max(ax, bx) + far, 0);
      const [fromRow, toRow] = this.texelRange(Math.min(az, bz) - far, Math.max(az, bz) + far, 1);
      for (let row = Math.max(fromRow, firstRow); row <= Math.min(toRow, lastRow); row++) {
        const z = rowZ(row);
        for (let column = Math.max(fromColumn, firstColumn); column <= Math.min(toColumn, lastColumn); column++) {
          const local = (row - firstRow) * width + column - firstColumn;
          const reach = segmentDistance(columnX(column), z, ax, az, bx, bz, nearest).distance;
          if (reach < distance[local]) distance[local] = reach;
        }
      }
    }
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const local = row * width + column;
        const signed = inside[local] ? -distance[local] : distance[local];
        const texel = (firstRow + row) * this.texels + firstColumn + column;
        if (signed < this.holeField[texel]) this.holeField[texel] = signed;
        const byte = toByte(signed, far);
        if (byte < this.maskData[4 * texel + 3]) this.maskData[4 * texel + 3] = byte;
      }
    }
    hole.box = [firstColumn, lastColumn, firstRow, lastRow];
    // Older holes skinning over: their new ice is cut where this one opened.
    for (const older of this.holes) {
      if (older === hole) break;
      if (older.field) this.clipField(older, hole);
    }
    this.changed.push(hole.box);
  }

  /**
   * The fields into the texture's bytes over the rectangles of texels painted
   * since (`changed`), or all of it: each distance d as 127.5·(1 + d/far),
   * far its cap (a byte's step is 0.5 mm of a hole's edge, 0.16 mm of a
   * crack's: finer than a pixel ever sees); B 0 where it was never wet, else
   * FLOOD.glaze up to 1 by how wet (the header). A is painted as it is
   * (paintHole, growSkin).
   */
  fillMask(rectangles = [[0, this.texels - 1, 0, this.texels - 1]]) {
    const holeScale = 127.5 / MASK.holeFar;
    const glaze = 255 * FLOOD.glaze, wetScale = 255 - glaze;
    for (const [firstColumn, lastColumn, firstRow, lastRow] of rectangles) {
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          const texel = row * this.texels + column;
          this.maskData[4 * texel] = Math.round(127.5 + this.holeField[texel] * holeScale);
          this.maskData[4 * texel + 1] = 255;   // spare
          const wet = this.wetField[texel];
          if (wet > 0 || this.maskData[4 * texel + 2] > 0) this.maskData[4 * texel + 2] = Math.round(glaze + wet * wetScale);
        }
      }
    }
  }

  /** What src/main.js's budget reports. */
  get budget() {
    return {
      thickness: this.thickness, holes: this.holes.length, open: this.openHoles, skinning: this.holes.filter((hole) => hole.skin && !hole.skin.closed).length,
      wet: this.wetBox ? (this.wetBox[1] - this.wetBox[0] + 1) * (this.wetBox[3] - this.wetBox[2] + 1) : 0, maskBytes: this.maskData.byteLength,
    };
  }
}
