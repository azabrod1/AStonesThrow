// The splash: droplets, bubbles, and the passes that draw the droplets as water.
//
// A stone entering water goes through stages with known timing, and the
// droplets are choreographed from them rather than solved for:
//   1. Crown: the contact line throws a little fast, fine spray, then a thin
//      sheet rises from the lip of the stone's cavity (stage 2), biased in the
//      direction of travel (src/crown.js). Its rim thickens into a bead, goes
//      wavy and sheds drops from the crests; after a few tens of milliseconds
//      the sheet tears from the rim down into droplets carrying its local
//      velocity. A thrown stone enters obliquely, θ about 40 to 45° from
//      vertical (30° thrown softly, 70 to 73° and twice as fast thrown hard,
//      src/rock.js throwFlightTime), and once more than FAN_THRESHOLD of the entry speed is
//      horizontal a forward fan comes first: a thin fast sheet over the sector
//      ahead, launched from the lip's forward side, low and mostly forward,
//      tearing into fine spray (CrownSheet with `fan`), at a strength growing
//      to full at FAN_FULL. After a fast entry, or a small stone's, the crown
//      may instead close over the hole as a low dome (a surface seal, chosen
//      below), which the jet from the pinch bursts through from below, or
//      which is drawn down into the hole when the jet is trapped.
//   2. Cavity: the stone opens an air-filled hole behind it (src/cavity.js), a
//      closed form in depth and time drawn as a hole in the water surface, its
//      lip lifted around it and the stone at its bottom; an oblique stone's is
//      sheared along its path, and an irregular, tumbling stone's is lopsided.
//      It pinches off (deep seal) about 2.06·sqrt(R/g) seconds after entry,
//      almost independently of entry speed (Duclaux et al. 2007), about 7.5·R
//      down for the reference throw, 0.57 of the stone's depth then (or sooner
//      and higher: a shallow or a surface seal, by the throw's choice below);
//      the wide bowl above the neck stays open and fills from below, and has
//      flattened into the surface about sqrt(z_p/g) after the pinch (z_p the
//      pinch depth). The ring the stone sends across the pond
//      (stampCavity, RING) is a downward push released just after entry,
//      fitted to a reference simulation's ring; it does not depend on how the
//      cavity is drawn. An oblique entry drags it forward: besides the entry's
//      push, one or two more where the stone is one and two radii down its
//      path (R·tan θ apart, at most PATH_SLOPE_CAP·R), as it gets there and
//      weaker; and each has a pair of heights, raised ahead and lowered
//      behind, by the horizontal fraction, so the ring is stronger ahead than
//      behind. Their foam is the air the hole held: it comes when the bowl has
//      flattened, where the jet's base meets the water (startBase).
//   3. Worthington jet: at the pinch-off a glassy column fires up the axis
//      from the bowl's floor (src/jet.js): a thin needle first and fastest,
//      the body under it, and a broad slow base that the bowl's collapse
//      builds, so it stretches as it rises. Its body leaves at JET_COLLAPSE
//      times the hole's collapse speed at its pinch, sqrt(g·z_p) (0.75 of the
//      reference throw's entry speed; the needle up to three times faster), carrying
//      JET_SHARE of the water that fills the bowl. The column in flight is
//      physics (src/slenderJet.js, the slender-jet equations): where it
//      beads, how its tip draws back and pinches, the drops it throws and
//      their sizes come out of it, and what it drains back into the pool
//      makes a mound (its ring is part of the stone's, above). After an
//      oblique entry it leans back
//      along the stone's path by JET_LEAN·θ (at most JET_LEAN_CAP) and, from a
//      dragged cavity, is slower by JET_OBLIQUE_SLOWING times the horizontal
//      fraction and its needle's extra speed lower by NEEDLE_OBLIQUE times it
//      (a sheared hole focuses less). Each throw's collapse launches its jet
//      its own way (the variety notes above chooseSplash): clean, leaning
//      towards a lopsided hole's bulge, ragged, stubby, or none at all (only
//      a low mound). The pond heaves under the jet as the ring's linear
//      theory says (src/rings.js NEAR_FIELD), less the share of the
//      collapse's water the jet holds aloft (src/jet.js aloftShare), which
//      the splash hands the ring's source every step: a trapped or stubby
//      jet, taking little water up, leaves the whole heave to the pond.
//   4. Bubbles entrained with the stone follow it down its path, in swarms
//      (BUBBLE_SWARM), rise and burst into foam, each leaving a speck.
// Each stage also stamps the height field and the foam map. A stone falling
// straight in makes none of the oblique parts.
//
// Through ice (src/ice.js: the impact's `throughIce`, a thing that broke
// through or went in by a hole too narrow for its splash) the lip is ice: no
// crown or fan stands on it, and the rest is the open water's (the contact's
// spray, the cavity, the jet, the bubbles, the foam). A drop that comes down
// on the ice (setIce), not in a hole, lands there as on the deck: it wets it
// (src/ice.js wetSpot) and, if big, splatters. On a frozen lake (water.iced)
// a ring goes to the solver as a pool's does (launchRing): its waves run out
// of sight under the ice, its near field in the hole as on the lake.
//
// A skip stone's touch (src/rock.js: the stone skims off the water within
// tens of milliseconds) makes none of the stages (skim): it sends out a ring,
// RING's source for a ball of the stone's face radius carrying the push the
// water gave the stone (its push speed), in up to SKIM_PUSHES pushes one σ
// apart along the stretch where the face was wet, which the rings merge into
// one; and throws spray ahead of the stone: a forward fan (src/crown.js
// `fan`, as an oblique entry's) at SKIM_FAN_SPEED of the stone's speed along
// the water, tearing into SKIM_DROPLETS fine drops for a 3 cm face at a
// normal skip's first touch, and a few loose drops thrown wider (SKIM_LOOSE,
// SKIM_SPRAY); and the water its face churned shows white for a moment, a
// small boil (SKIM_CHURN) with no raft after it. When the stone at last goes
// in, its impact is any stone's.
//
// Foam. A pond is fresh water, where a bubble on the surface bursts within a
// second (0.01 to 3 s, against 0.3 to 30 s on sea water: Anguelova & Huq
// 2017, and the constants' note), so a stone leaves no raft. The map keeps
// two kinds (src/spectralWater.js), a boil, big bubbles, dense and popping
// within a second (BOIL_LIFETIME), and a raft, small bubbles lasting
// seconds, which is sea foam and the gale's whitecaps' (src/galeWaves.js);
// a stone stamps only boils. Where the hole closes its air comes up as a
// boil over about the mouth, not at once but over the time the pinched-off
// air takes to rise from the pinch depth (BUBBLE_RISE_SPEED, at most
// FOAM_RISE_CAP: about 0.7 s for a 6 cm stone, 2.5 s for a rock), a
// sub-stamp every FOAM_STAMP_SPACING, each with the boil's whole peak (the
// air comes up at that rate the whole time), so at any moment only the
// bubbles just arrived show; the jet rises from
// a boil of its own, and where it falls back it stamps a fainter one
// (fallBackFoam: src/jet.js meets the water through columnWater, which
// hands its foam to the splash). Each is a patch of three to five sub-stamps
// of unequal radii at random offsets (stampFoamPatch), never one Gaussian,
// drawn from a random sequence of the foam's own (foamRandom), so no two
// boils share a shape and the foam shifts no other draw. Surfacing bubbles
// fizz, a faint boil each, and a landing drop leaves a speck of boil of its
// own. The water shader draws a boil as fresh water's (FOAM_PATTERN in
// src/shaders/scene.js, its last paragraph): the surface holds only one layer
// of bursting bubbles, drawn a few at a time, clear and glinting, and the rest of the boil
// is the cloud of bubbles under it, a milky tint of the water seen through
// the surface, never lace and never packed white froth. So a thrown stone
// leaves little solid white and none for long: a 6 cm stone (R = 3 cm) a
// faint milky ring and a see-through fizz over about its hole's mouth at 0.3
// to 0.8 s, then a few foam specks; a 20 cm rock a milky, soft-edged churn
// about 30 cm across from 0.4 to 1.4 s, patches at 1.7 s and clear water by
// 2.2 (close up from above, --view=high --fov=16; from the bank, where the
// surface mostly mirrors the sky, a faint pale patch). Two surface flows per stone carry it
// (addFoamFlow): the jet's base welling up where the hole closed
// (CLOSURE_FLOW) and the mound spreading where the jet falls back
// (FALLBACK_FLOW), each sweeping the foam out of a disc into a ring and arcs
// over FLOW_DECAY·sqrt(R/g), so a big stone's churn spreads outward as it
// pops; and the wind drifts it all (setWind).
//
// Drops ring the water where they land: one over LANDING_SPLAT_RADIUS
// (1.6 mm) pushes the bump of its landing into the solver, and one of
// DROP_RING.least (1.5 mm) or more on open water leaves the little
// capillary rings the solver's cells are too coarse to hold, drawn instead
// (src/dropRings.js, which the water carries as water.dropRings). A
// large one (LANDING_CROWN_RADIUS
// to DROP_CEILING, 3.5 to 4 mm: the biggest of the jet's and the crown's)
// that has flown at least LANDING_CROWN_FLIGHT and falls at
// LANDING_CROWN_SPEED or more throws a small crown of its own, a CrownSheet
// with the drop's radius and speed (at most MAX_LANDING_CROWNS alive; the
// rest that big kick up a few droplets instead). A drop that big landing at a
// metre a second or more splashes: its Weber number is in the hundreds.
//
// Under a gale (src/galeWaves.js) the water moves, and the splash does not
// know it: every part of it is computed on still water, its surface at 0,
// and moved as it is drawn (galeLift in src/shaders/gale.js), what is in the
// air (sheets, columns, drops) by the height of the water under it, what is
// under the water (the cavity, bubbles) as the column stretches between the
// fixed bed and the moving surface. A drop lands where it meets still
// water's 0, which is where it meets the moving surface as drawn. The stone
// is moved the same way (src/rock.js).
//
// Foam specks (src/foamSpecks.js) are the grain of the foam a splash leaves:
// a patch where the crown's base was once it has gone (its specks surfacing
// over CROWN_SPECK_SPAN·sqrt(R/g) after it, as its foot's air comes up), one
// where the jet falls back (src/jet.js), a few where each drop lands (by its
// size) and one where each bubble surfaces, its own size. A patch is lumps
// with gaps, never an even scatter (spawnPatch there). They ride the surface
// for 0.8 to 3 s, most of them nearer 1: fresh water's bubbles burst within
// a second or two.
//
// How the splash scales with the stone's radius R, against s = R / 3 cm (the
// size the constants were tuned at) and the entry speed V. Wherever the
// physics allows it scales as a Froude-similar splash does, lengths with R,
// times with sqrt(R/g) and speeds with V; the sheets' own scaling is in
// src/crown.js, the jet's in src/jet.js.
//   - The crown's and the fan's droplet counts go as s^DROPLET_COUNT_POWER ·
//     sqrt(V / 6 m/s) and the lumps their sheets tear into as s^0.5
//     (src/crown.js); but no drop is bigger than DROP_CEILING (4 mm in
//     radius, the most surface tension holds together in flight), so from
//     the 3 cm stone up a bigger lump, the jet's too, breaks into several
//     drops (breakLump), out of the spares under the caps: a big stone's
//     crown is denser, not coarser. Past the caps the lumps lose water (a
//     16 cm stone's crown about 40% of it, src/crown.js). The contact spray
//     stays fine (s^0.4). The biggest drops, LANDING_CROWN_RADIUS and up,
//     throw crowns of their own where they land.
//   - The cavity's lengths go with R and its times with sqrt(R/g) (its
//     depths follow the stone, src/cavity.js; its mouth widens more at a
//     higher Froude number): it pinches off 2.06·sqrt(R/g) after entry, when
//     the jet starts, and its bowl has flattened about sqrt(z_p/g) later; the
//     jet's launch window goes as sqrt(z_p/g), its radius as R·s^0.25 (fatter
//     at the lower Froude number of a big stone), its breakup's pace as a
//     capillary time of the column, its speeds follow V (times s^0.15): a big
//     stone's jet is a fat column that mostly falls back as one, not a taller
//     needle.
//   - The ring (RING): its σ goes with R and its release with sqrt(R/g), so
//     its wavelength goes with R; its push follows V, as the old cavity
//     splat's did, so its height goes as V·sqrt(R) (the speed over the
//     frequency of waves of size R). That is an assumption: the fit had one
//     reference throw (R 3 cm at 6.3 m/s, straight in), and with real air
//     that throw seals at the surface, which may change its ring by tens of
//     percent. It is carried across the whole pond by src/rings.js, damped
//     as a real pond damps it, so a big stone's ring crosses it. In a pool
//     (water.pool, src/spectralWater.js) the solver carries it instead, so
//     its walls reflect it, and src/rings.js only the near field it would
//     hide: held until its release, it goes to both in one frame
//     (releasePoolRing), so the two start together.
//   - Foam: the patches' radii go with R, the hole's boil's peak as s (a
//     cavity's air goes as R³ and the mouth it comes up through as R², so
//     the bubbles over it thicken as R) for the whole of its rise, times the
//     cavity splat's strength, at most FOAM_AMOUNT_CAP, and the jet base's
//     boil as sqrt(s): a pebble's boil is mostly the surface's fizz, a 20 cm
//     rock's (s = 3.4) mostly the milky cloud under it (the water shader's
//     division, the foam note); every boil pops over BOIL_LIFETIME whatever
//     the stone, as fresh water's bubbles do; the flows clear discs of
//     CLOSURE_FLOW·R and FALLBACK_FLOW·R; the crown's specks go as s² (the
//     area its base covered); the bubbles as s², in a cloud as wide as the
//     stone.
// The counts are set for a believable splash, hundreds to a few thousand
// drops a stone and most of them millimetres across, none over DROP_CEILING
// (the spray's finer drops, src/spray.js, are sprites of their own): the
// reference throw of a 3 cm stone throws about 380 (185 from the crown, 60
// fine ones from the fan, 15 contact spray, 70 from the jet, 30 from the
// crowns of the 13 drops that throw one where they land and 15 kicked up by
// the rest), half of them over 1.6 mm and at most 250 in the air at once
// (tools/splash-probe.mjs). The caps are for cost: a 16 cm stone (s = 2.67)
// thrown normally (6.3 m/s, 42° from vertical) on High (crownDrops 3500)
// spawns about 4150 drops: 3040 from the crown (2.4 to 4 mm, carrying about
// 445 ml of its sheet's 500), 315 from the fan, 65 contact spray, 90 from
// the jet, 160 from the crowns of the 63 drops that throw one where they
// land and 480 kicked up by the rest; at most about 2800 are alive at once,
// and it leaves about 1350 foam specks (a 30 cm rock about 1450), each gone
// within a second or three. On Medium and Low
// (crownDrops 2000) its crown is held to 1960 drops carrying about 290 ml,
// and at most 1760 to 1900 are alive. Its CPU work on a desktop is under a millisecond a frame on average
// and a few milliseconds in the worst frames, where the crown tears and drops
// land (tools/splash-probe.mjs measures all of this).
//
// Droplets are integrated on the CPU and rendered as screen-space water
// (src/shaders/fluid.js): sphere impostors into an info target (depth, what
// it is, the exact normal) and a summed optics target (thickness, coverage,
// sun glints, aeration), then the composite shades them. The crown sheets and
// jet columns are meshes drawn into the same two targets (src/shaders/
// sheet.js), so sheets, columns and drops are shaded as one water: the
// pond's Fresnel, reflection, refraction with its absorption, and its sun
// glitter, with drops of two device pixels and more as glass beads with their
// two glints and finer ones as a faint mist. Both meshes are evaluated in
// closed form once per rendered frame (prepareFrame); at most MAX_CROWNS
// stone crowns and MAX_JETS jets live at once, and nothing is drawn for them
// when none are alive. The cavities are drawn in the main scene instead
// (cavityGroup), with the water surface's own shader (src/waterSurface.js),
// so prepareScene brings them to the frame's time before that scene is drawn
// and hands the surface the circles it dips from; at most MAX_CAVITIES are
// open at once. The sheets' and columns' costly steps (the crown's tear, the
// jet's breakup) run once per rendered frame, the frame's simulated length
// given by setFrameSeconds before its substeps.
//
// The water mirrors the splash: mirrorObjects() lists what is alive to be
// drawn in the mirror image (the droplets, the crowns, the columns), each
// tagged by mirrorWith with MIRROR_LAYER and the two materials the mirror
// pass swaps in: the cheap water, then the same program writing how far it
// is from the mirror's camera into the mirror's alpha (MIRROR_COMMON in
// src/shaders/fluid.js), which the water shader reads to look a near
// thing's reflection up where it is (src/main.js re-renders the mirror while
// the list is not empty, and only then). A new mesh joins with mirrorWith at
// its creation and a line in prepareFrame, which builds the list; whatever
// is on MIRROR_LAYER in the scenes the mirror draws must be in it, and must
// leave the mirror's alpha alone but for its distance. The cavities are left
// out: a hole lies below the mirror plane, so the water reflects none of it.
// The beads on a crown's fingertips (src/crown.js) are drawn as droplets:
// prepareFrame writes them after the drops in flight, which are the only ones
// stepped, so they ride the fingers until they pinch off as real drops.
//
// In the pool (setGround, src/main.js) the splash meets its walls and deck:
// the sheets, columns and cavities are held inside the walls (`walls`, less
// DECK_DROPS.wallInset: holdWithinWalls in src/fluidMesh.js), so a sheet
// that reaches one runs up it; a drop that hits a wall's side under the deck
// comes off it with DECK_DROPS.wall of its speed across it; one that comes
// down on the deck is gone, wetting it (the ground's onWet, src/pool.js
// wetSpot) and, if big, splattering a few small drops (landOn).
//
// With nothing in the air (no droplet, sheet or column) render() neither
// clears nor reads the fluid targets: it tone-maps the scene alone
// (TONE_MAP_FRAGMENT, the composite's own tone map), so a still pond pays one
// texture read per pixel for the splash. reset() retires everything at once
// (src/main.js throws a stone under the loading veil to compile every
// program, then resets); `inMotion` and `settled` tell the app when it may
// lower its frame rate and when its solver may sleep.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { CrownSheet, DOME_HEIGHT, DROP_CEILING, FROTH_SPEED, FROTH_POWER, breakLump } from './crown.js';
import { JetColumn, CLEAN_FORM } from './jet.js';
import { Cavity, PINCH_TIME, SURFACE_HEAD } from './cavity.js';
import { MAX_CAVITIES } from './waterSurface.js';
import { FoamSpecks } from './foamSpecks.js';
import { SpraySystem, seededRandom, sprayDrops, MIRROR_SPRAY_RADIUS } from './spray.js';
import { RING_SOURCE } from './rings.js';
import { DROP_RING } from './dropRings.js';
import { STONE_DENSITY } from './things.js';
import { PARTICLE_VERTEX, SPRAY_VERTEX, PARTICLE_DEPTH_FRAGMENT, PARTICLE_THICKNESS_FRAGMENT, COMPOSITE_FRAGMENT, MIRROR_SHEET_FRAGMENT, MIRROR_COLUMN_FRAGMENT, MIRROR_DROP_FRAGMENT, NIGHT_VISION } from './shaders/fluid.js';
import { SHEET_VERTEX, SHEET_DEPTH_FRAGMENT, SHEET_THICKNESS_FRAGMENT, COLUMN_VERTEX, COLUMN_DEPTH_FRAGMENT, COLUMN_THICKNESS_FRAGMENT } from './shaders/sheet.js';
import { BUBBLE_VERTEX, BUBBLE_FRAGMENT } from './shaders/scene.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;   // the stone size the tuning constants were set for
const MAX_CROWNS = 5;            // an older crown tears at once when another arrives
const MAX_JETS = 4;              // an older jet breaks into drops at once when another starts
const LANDING_SPLAT_RADIUS = 0.0016;  // drops bigger than this push a splat into the solver where they land...
const LANDING_SPLATS = 40;            // ...at most this many a substep, the biggest
const LANDING_CROWN_RADIUS = 0.0035;   // drops this big throw a crown where they land (and a boil and a kick if not)...
const MAX_LANDING_CROWNS = 6;         // ...while fewer than this many are alive...
const LANDING_CROWN_FLIGHT = 0.05;    // ...if they have flown this long (s)...
const LANDING_CROWN_SPEED = 1.0;      // ...and fall this fast (m/s): not the drops a crown's torn foot drops back
// Lumps (src/jet.js's Drops): a drop bigger than DROP_CEILING flies whole until the air tears it, at a Weber number
// ρ_air·v²·2r/σ of WEBER_CRITICAL (bag breakup, Pilch & Erdman 1987: from about 12), into pieces of 0.6 to 1 times
// LUMP_BREAK.largest of its radius (at most .pieces of them: src/crown.js breakLump), parting at its capillary
// speed; a piece still over the ceiling breaks again when its own Weber number says so. So a lump thrown fast
// bursts into spray at once, and one lobbed slowly flies whole to its apex and breaks as it falls and speeds up:
// a big stone's jet sheds centimetre lumps that come apart in the air.
const AIR_DENSITY = 1.2;
const WATER_SURFACE_TENSION = 0.072;
const WATER_DENSITY_LUMPS = 1000;
const WEBER_CRITICAL = 12;
const LUMP_BREAK = { largest: 0.72, pieces: 8 };
const LANDING_REFERENCE = 0.0086;     // the drop size the landing crown was tuned at (bigger than any drop now: DROP_CEILING)
const LANDING_BREAKUP = 12;           // its crown's breakup droplets (scaling with the drop's area)
const CROWN_SPECKS = 70;              // foam specks where a 3 cm stone's crown stood (scaling with its area)
const CROWN_SPECK_CAP = 450;          // at most (a 16 cm stone's crown wants 500)
const CROWN_SPECK_SPAN = 7;           // they surface over this many sqrt(R/g) after the crown has gone (0.4 s for a 3 cm stone), as its foot's air comes up
const LANDING_KICK_CHANCE = 0.4;      // a big drop landing without a crown kicks up droplets this often...
const LANDING_KICK_MOST = 2;          // ...one to this many
const LANDING_SPECK_FREE = 0.004;     // a landing drop leaves a foam speck per LANDING_SPECK_STEP of radius beyond this...
const LANDING_SPECK_STEP = 0.004;
const LANDING_SPECK_MOST = 2;         // ...at most this many: a bubble or two, whatever its size (a rock's rain of 10 mm drops left thousands)
const PATH_SLOPE_CAP = 1.2;           // the stone's path under water, horizontal over vertical, at most (50°)
const FAN_THRESHOLD = 0.3;            // the forward fan needs this horizontal fraction of the entry speed...
const FAN_FULL = 0.7;                 // ...and is at full strength from this one
const FAN_DROPLETS = 70;              // drops of a 3 cm stone's fan at about 6 m/s and full strength
const CROWN_DROPLETS = 150;           // drops of a 3 cm stone's crown at about 6 m/s (contact spray, rim and tear)
const DROPLET_COUNT_POWER = 1.6;      // the crown's and the fan's drop counts scale as (R / 3 cm)^this
const CROWN_DROPLET_CAP = 3500;       // at most, unless the preset sets fewer (QUALITY's crownDrops, setCrownDropletCap): a 16 cm stone is given about 870, and its lumps over DROP_CEILING want the rest (src/crown.js)
const FAN_DROPLET_CAP = 600;          // at most (the same stone's fan, about 400)
const SPRAY_DROP_RADIUS = 0.0008;     // the contact line's spray: drops of this radius...
const SPRAY_DROP_SPREAD = 0.001;      // ...to this much more, times (R / 3 cm)^0.4
const CONTACT_SPRAY = { water: 0.002, radius: 0.00012, bursts: 24 };   // the contact's first ejecta as spray (src/spray.js): this share of the stone's volume, drops of this mean radius (times (R / 3 cm)^0.3), from this many places round the ring
const BUBBLES = 110;                  // bubbles a 3 cm stone drags down, scaling with R²...
const BUBBLE_CAP = 800;               // ...at most (a 16 cm stone wants 780)...
const BUBBLE_SWARM = 5;               // ...in swarms of one to this many of like size, within BUBBLE_SWARM_SPREAD, drifting as one: they surface as clumps, not an even sprinkle
const BUBBLE_SWARM_SPREAD = 0.01;     // m
// The foam. A pond is fresh water, and a bubble on fresh water bursts within
// a second (0.01 to 3 s against 0.3 to 30 s on sea water, Anguelova & Huq
// 2017: salt holds bubbles apart, which is why the sea rafts and whitecaps
// and a lake does not), so the air the hole held comes up where it closed as
// a boil only, big bubbles that pop as they surface (the map's short-lived
// kind, src/spectralWater.js; its raft kind, small bubbles lasting seconds,
// is sea foam, and a stone stamps none), as a patch of sub-stamps
// (stampFoamPatch). The water shader (FOAM_PATTERN in src/shaders/scene.js)
// lets the surface hold a boil up to a map value of 0.035, one layer of
// bubbles bursting, drawn as foam (the pattern whitens about half the water
// at 0.1), and draws the rest as the cloud of bubbles under it, a milky tint
// of the water seen through the surface: so the amounts say how much air is
// in the top of the water, a pebble's boil mostly fizz and a rock's mostly
// cloud. The hole's air does not come up at once: pinched off at the pinch
// depth it rises as bubbles at BUBBLE_RISE_SPEED, so its boil arrives over
// that rise (0.7 s for a 3 cm stone, FOAM_RISE_CAP for a rock), a sub-stamp
// every FOAM_STAMP_SPACING, each with the whole peak (sustained: the air
// comes up at that rate the whole time, the bubbles over the mouth as thick
// as R), and at any moment only the bubbles just arrived show, each bursting
// over BOIL_LIFETIME: a 3 cm stone's boil is a faint milky ring and fizz
// over about its mouth, a 20 cm rock's a milky churn for about a second.
const BOIL_AMOUNT = 0.046;            // a 3 cm stone's boil: each sub-stamp's peak (0.07 shared over its span until the boil was sustained, the same on average), scaling as R / 3 cm and the cavity splat's strength...
const FOAM_AMOUNT_CAP = 0.8;          // ...at most
const BOIL_LIFETIME = 0.45;           // τ of a boil (s): fresh water's bubbles burst as they come up
const BUBBLE_RISE_SPEED = 0.25;       // m/s: the pinched-off air rises as bubbles of millimetres to centimetres, this fast...
const FOAM_RISE_CAP = 2.5;            // ...so the hole's boil arrives over its pinch depth at that speed, at most this long (s): a big stone's bubbles are bigger and faster
const FOAM_STAMP_SPACING = 0.25;      // a patch spread over a span gets a sub-stamp every this many seconds, the amount shared among them (or each with all of it, sustained)
const FOAM_SPREAD = 0.6;              // a ripple's or a knock's boil comes up over this many sqrt(R/g)
const JET_BASE_BOIL = 0.03;           // the boil where the jet rises, its sub-stamps' peak, scaling as sqrt(R / 3 cm): a grey churn at the centre, never a white disc...
const BASE_FROTH_MOST = 4;            // ...times (V / FROTH_SPEED)^(2·FROTH_POWER), the crown's froth law in the entry speed (src/crown.js), at most this: a hard throw's heave churns white, a pebble's is glass
const BUBBLE_FOAM = 0.015;            // a fizz where a bubble surfaces (a boil, popping as fast)
const LANDING_FOAM = 0.006;           // a landing drop's foam: a boil of this peak times the drop's strength (up to 3), over three of its radii...
const LANDING_FOAM_LIFETIME = 0.3;    // ...of big bubbles, bursting as they surface (s): a rock's crown rains hundreds of drops back in a ring within half a second, and the ring must not whiten
const FALLBACK_BOIL_CAP = 0.05;       // the jet's fall-back stamps its foam as a boil of at most this peak: a plunging column's air comes up as a grey churn under it (a rock's jet asks for ten times this), never lace
const FALLBACK_REACH = 0.5;           // its sub-stamps lie within this many of the fall-back's radius: under the column, not a ring round it
// Surface flows (addFoamFlow in src/spectralWater.js), which sweep the foam
// out of a disc into a ring: the jet's base welling up where the hole closed,
// and the mound where the jet falls back spreading. Their discs in stone
// radii; their strength decays over FLOW_DECAY·sqrt(R/g).
const CLOSURE_FLOW = 1.4;
const FALLBACK_FLOW = 2.0;
const FLOW_DECAY = 2;
const JET_LEAN = 0.4;                                // the jet leans back by this fraction of the entry angle,
const JET_LEAN_CAP = THREE.MathUtils.degToRad(18);   // at most this
const OBLIQUE_IMPULSE = 1.3;          // an oblique entry's cavity splats together carry at most this times a vertical one's
export const JET_COLLAPSE = 3.18;     // the jet's body leaves at this times sqrt(g·z_p), the hole's collapse speed at its pinch depth z_p (src/jet.js; Duclaux et al. 2007: the hydrostatic pressure there drives the collapse): 0.75 of the reference throw's entry speed...
const LIGHT_JET = [0.4, 0.6];         // ...a lighter thing's at this much of it, by sqrt(ρ/ρ_stone) (lightJet)
const JET_OBLIQUE_SLOWING = 0.3;      // ...and from a dragged cavity is slower by this times the horizontal fraction...
const NEEDLE_OBLIQUE = 0.9;           // ...and its needle's extra speed lower by this times it: a sheared hole focuses less
const JET_SHARE = 0.25;               // the jet carries this share of the water that fills the bowl left above the neck
const HEAVE_VERTICAL = Math.cos(THREE.MathUtils.degToRad(42));   // the pond's heave under the jet (src/rings.js NEAR_FIELD) goes with the vertical share of the entry speed against the reference throw's, at most 1: a flat entry drives less water down, while the ring's push goes with the whole speed
export const MOUND_DELAY = 0.8;              // a throw with no jet heaves its mound this many of the bowl's time units after the pinch, the bowl nearly full
// The ring a stone sends across the pond (stampCavity, src/rings.js), fitted
// to the reference simulation's (tools/basilisk/results/rings_linear.md): a
// downward push of RING.speed of the entry speed, of σ = RING.sigma·R less
// one of σ·RING.rim (zero volume), released RING.delay·sqrt(R/g) after entry.
// No height: it starts from flat water. An oblique entry adds a pair of
// heights, raised ahead and lowered behind, of RING.ahead·travel·|v|·
// sqrt(σ/g), so its ring runs stronger ahead.
const RING = { sigma: 2.0, rim: 2.5, delay: 0.9, speed: 0.195, ahead: 0.16 };
// A skip's touch (skim, the header). Its push speed (src/rock.js skimReport)
// is about SKIM_PUSH_SPEED at a normal skip's first touch; the spray's count
// and the boil go as its square root.
const SKIM_PUSH_SPEED = 2;            // m/s
const SKIM_WET_BEHIND = 0.5;          // the face is wet this many of its radii behind the stone's centre
const SKIM_PUSHES = 3;                // the ring's pushes along the wet stretch, one σ apart, at most...
const SKIM_RING_SPAN = 0.04;          // ...released over at most this long (s), so the rings merge them (src/rings.js MERGE)
const SKIM_DROPLETS = 120;            // the fan's drops for a 3 cm face's touch, as (R / 3 cm)^DROPLET_COUNT_POWER...
const SKIM_DROPLET_CAP = 600;         // ...at most
const SKIM_FAN_SPEED = 0.6;           // the fan leaves at about this share of the stone's speed along the water (src/crown.js FAN_SPEED_START)
const SKIM_CHURN = { amount: 0.12, radius: 1.2, lifetime: 0.35 };   // the churned water: a boil's peak, its patch in face radii, τ (s)
const SKIM_LOOSE = 0.25;              // loose drops, of the fan's, thrown wider:
const SKIM_SPRAY = { angle: [30, 80], rise: [10, 35], speed: [0.1, 0.35] };   // degrees off the heading to either side, degrees above level, of the stone's speed along the water
const RIPPLE = { share: 0.6, foam: 0.05 };   // a floater's ripple (ripple): its ring's share of an entry's at its speed, its boil's foam per m/s
// The pool's ground (setGround): sheets and columns are held this far (m) inside its walls; drops come off a wall's
// side with `wall` of their speed across it; on the deck one this big or more splatters up to `splatter` drops,
// and each wets a spot `wetSpread` times its radius, `wetLeast` (m) at least.
const DECK_DROPS = { wallInset: 0.004, wall: 0.3, splatterFrom: 0.0015, splatter: 3, wetSpread: 8, wetLeast: 0.012 };
// A knocked floater's spray (knock): drops per m/s, at most, their spread about the knock's direction, its lift, their radii (m).
const KNOCK = { drops: 14, most: 70, spread: 0.7, lift: 0.4, radius: [0.0006, 0.0018] };
const HAZE_RADIUS = 0.5;             // device pixels: finer drops are mist (src/shaders/fluid.js)
const MIRROR_PAD = 0.05;              // metres around what is mirrored: drawn radii, streaks, a landing crown's ride
const MIRROR_DROP_RADIUS = 0.002;     // finer drops are left out of the mirror: their images there are under a pixel

const POND_DEPTH = 0.8;               // when the water does not say (the CPU probes' stand-in)
const SAND_ALBEDO = 0.33;             // the floor's mean sand colour (FLOOR_FRAGMENT in src/shaders/scene.js)

// The composite's tone map (COMPOSITE_FRAGMENT in src/shaders/fluid.js) for a
// frame with no water in the air: the same operations as its pixels with
// none, so such a frame comes out exactly as the composite made it.
const TONE_MAP_FRAGMENT = /* glsl */`
uniform sampler2D uScene;
uniform float uExposure;
varying vec2 vUv;
${NIGHT_VISION}
vec3 aces(vec3 color) {
  const mat3 inputMatrix = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outputMatrix = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = inputMatrix * color;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(outputMatrix * (a / b), 0.0, 1.0);
}
vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
void main() {
  vec3 color = texture2D(uScene, vUv).rgb;
  color = aces(nightVision(color) * uExposure / 0.6);
  gl_FragColor = vec4(linearToSrgb(color), 1.0);
}
`;

/**
 * The sand floor's radiance under the water, lit as FLOOR_FRAGMENT lights it
 * (the sun through the water above it, and the sky), without its caustics:
 * what the composite sees of the pond's bottom through a drop. A pool's
 * tiles (setBed) are brighter.
 */
function floorLight(lighting, depth, albedo = SAND_ALBEDO) {
  const sunHeight = Math.max(lighting.sunDirection.y, 0.2);
  const light = new THREE.Vector3();
  for (const channel of ['x', 'y', 'z']) {
    const absorb = lighting.absorb[channel];
    light[channel] = albedo * (lighting.sunIrradiance[channel] * Math.exp(-absorb * depth / sunHeight) * Math.max(lighting.sunDirection.y, 0)
      + lighting.skyAmbient[channel] * Math.exp(-absorb * depth) * 1.4);
  }
  return light;
}

/**
 * The depth the splash's water sees the pond's floor at, through a drop or
 * in a reflection of the pond (one for the whole splash): the lake bed's under
 * the middle of the solver's patch (src/pondFloor.js), or the pond's own.
 */
function floorViewDepth(water) {
  if (water.floorDepthAt && water.centre) return water.floorDepthAt(water.centre[0], water.centre[1]);
  return water.depth ?? POND_DEPTH;
}

/** The layer the mirror camera draws (src/main.js): the sky dome and whatever mirrorWith tags. */
export const MIRROR_LAYER = 1;

/**
 * Draw `object` in the water's mirror image with `materials.colour` in place
 * of its own, then `materials.distance` (its distance, src/main.js);
 * `bounds(box)`, if given, grows a world box around what it draws (otherwise
 * its geometry's bounding box is used).
 */
export function mirrorWith(object, materials, bounds = null) {
  object.layers.enable(MIRROR_LAYER);
  object.userData.mirrorMaterial = materials.colour;
  object.userData.mirrorDistanceMaterial = materials.distance;
  if (bounds) object.userData.mirrorBounds = bounds;
  return object;
}

const randomRange = (lo, hi) => lo + Math.random() * (hi - lo);

/**
 * A random sequence of the foam's own, seeded by `values` (a place and a
 * time): the foam's shapes are drawn from it rather than from Math.random, so
 * they shift no other draw of the splash (a seeded throw splashes the same
 * whatever its foam), yet no two rafts share a shape. Murmur3's finaliser over
 * the values' bits, then mulberry32 (seededRandom, src/spray.js).
 */
const foamRandom = seededRandom;
const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

// ---- variety: how this throw's splash goes ------------------------------
//
// No two stones go in alike, and the splash follows the stone (src/rock.js
// reports its shape, what touched first and its spin) and the throw (size R,
// entry speed V, angle from vertical), plus chance from a random stream of the
// throw's own (foamRandom, seeded by the stone: a seeded throw splashes the
// same however its flight was stepped, and the choices shift no other draw;
// each jet column draws from a stream of its own too). chooseSplash picks:
//   - the seal (Aristoff & Bush 2009, Truscott, Epps & Belden 2014). Deep: the
//     hole pinches deep down about 2.06·sqrt(R/g) after entry (Duclaux et al.
//     2007; the reference simulation 1.99), varied by a few per cent. Surface:
//     the crown is pulled shut over the hole by the air rushing in behind the
//     stone before the deep pinch. For a vertical smooth sphere that happens
//     when the Froude number F = V²/(g·R) passes (ρ/ρa)²/6400 = 108 at the
//     atmosphere's density (Birkhoff & Isaacs 1951, Aristoff & Bush 2009
//     figure 19), so a fast or small stone seals at the surface and a big one
//     needs more speed: 2.8 m/s for a 1.5 cm stone, 5.6 m/s for 6 cm, 9.2 m/s
//     for 16 cm. Worthington (1908) saw the boundary himself: his roughened
//     1.5 cm marble dropped 15 cm (F = 40) threw "a tall jet... to a height
//     which may be even greater than that from which the sphere fell", from
//     60 cm (F = 160) its crown closed into a bubble, and from 140 cm
//     (F = 370) there was "no rebounding jet projected high into the air";
//     Truscott & Techet's (2009) 5.7 cm billiard balls at 5.4 to 6 m/s
//     (F = 125, the reference throw's speed) dome over. What pulls the crown
//     in is the air's flow into the hole (Gilbarg & Anderson 1948; Eshraghi,
//     Jung & Vlachos 2020 find the seal set by the air's inflow speed, the
//     cavity's growth over its mouth's area, against the entry speed, the
//     seal coming past 0.146 of it). An oblique entry's sheared hole has a
//     mouth 1/cos θ wider for the same growth, so the air comes in at cos θ
//     the speed: the throw seals by F·cos²θ (θ from vertical), later or not
//     at all the more oblique the entry. (That factor is this model's own
//     reading of Eshraghi's criterion; no measurement of oblique stones was
//     found.) A rough, irregular stone's crown is lopsided, fingers and tears (Marston et
//     al. 2016 find even a smooth sphere's sealing crown buckles), which delays
//     or prevents the seal: the boundary rises by SEAL_IRREGULAR times the
//     asymmetry (below), and a broad face going in first throws a fuller crown
//     (1 + 0.12 per unit of bluntness over a ball's). The chance is a logistic
//     in ln(F·cos²θ / boundary), SEAL_SPREAD wide. For the default 6 cm stone
//     thrown normally (6.3 m/s, 42° from vertical) about one in ten seals at
//     the surface, a third thrown softly (30°) and a few thrown hard (56°);
//     nearly every pebble; a third of 4 cm stones; no 16 cm stone. The dome
//     closes SEAL_TIME·R/(V·cos θ) after entry (Marston et al. 2012: 11.5·R/V
//     for small smooth spheres; the reference simulation's real-air runs 5 to
//     7.6·R/V), up to half as late again near the boundary (Eshraghi, Jung &
//     Vlachos 2020 find the seal's time grows there: their fit diverges at
//     the critical inflow). What follows a seal is measured too. The hole
//     still pinches deep under the dome and launches its jet (Truscott &
//     Techet 2009: dome, then pinch-off, then "the jet in the upper cavity
//     bursts up through the free surface with significant velocity, pulling
//     the upper cavity almost inside-out"): the jet reaches the dome and
//     bursts it, flinging its water up and out at DOME_BURST_SHARE of the
//     needle's speed. But a dome that closed early has time to be drawn down
//     into the hole by the sealed cavity's falling pressure before the jet
//     arrives (Worthington's 140 cm marble: "the air-tube is closed over and
//     forms a downward jet which shoots down the middle of the air-tube",
//     then "the heap above the surface grows steadily" and seethes): the jet
//     is trapped and only heaves a mound. The three observations set the
//     boundary at the seal's share of the pinch time (TRAP_SHARE, a logistic
//     TRAP_SPREAD wide): Techet's ball sealed at 0.68 of it and burst,
//     Worthington's marble from 60 cm at 0.54 and "sometimes" burst, from
//     140 cm at 0.30 and was trapped. Shallow: a flat
//     face going in first (a belly flop opens a wide, shallow hole) or a slow
//     entry pinches sooner and higher.
//   - the asymmetry (0 to 1): how far from round the hole opens and collapses,
//     from the stone's outline where it goes in ((flatness + elongation/2)·
//     |sin 2·faceAngle|: a flat stone tilted, not flat on or edge on, hits
//     lopsided), its lumps (irregularity), its spin across the path (ω·R/V
//     times the share across: Truscott & Techet 2009) and chance. It sets how
//     lopsided the hole is (`hole`, src/cavity.js: an oval following the
//     stone's own outline, a bulge, lobes and an off-centre closure) and how
//     far the jet leans towards the bulge.
//   - the jet's form: how the collapse launches it (jetForm), drawn with
//     weights. The collapse is not solved here, only the column it throws
//     (src/slenderJet.js), so the forms set the launch alone: its focus, the
//     needle's speed (a clean, fast needle needs a symmetric, singular
//     collapse, Gekle & Gordillo 2010, which an irregular stone breaks), its
//     thickness, speed, lean, wobble and how unevenly it leaves (the seed the
//     column's own instability grows). Leaning (a lopsided collapse throws
//     the column towards the bulge, BULGE_LEAN plus LEANING_EXTRA) grows with
//     the asymmetry; ragged (an uneven, turbulent collapse, launched rough,
//     so the column comes apart along its length) with the asymmetry, faster
//     for a fast entry, and with an oblique one; stubby (short and fat: the
//     collapse focuses less) with the stone's size (its lower Froude number)
//     and a blunt entry; ragged with the size too, since a rock's collapse
//     is irregular (the clean jets of the sweep of big stones, src/jet.js's
//     Sizes, are axisymmetric: the cleanest possible, an upper bound), so a
//     30 cm rock's jet is clean about one throw in six; a clean jet takes
//     the rest, less the more lopsided the collapse (its needle needs the
//     walls to meet at a point, so past asymmetry 0.6 its odds fall, to
//     none at 1: a brick, whose hole is as lopsided as they come, never
//     throws one, where it threw one in five). After a surface seal
//     that the jet bursts through, the same forms; a trapped jet is none (no
//     jet clears the water: once the bowl has nearly filled, MOUND_DELAY, a
//     low mound heaves up, seething with the dome's air, and subsides);
//     after a shallow seal mostly a stubby one. For the default 6 cm stone thrown normally four jets in ten
//     are clean, a fifth to a quarter ragged, one in six leans, one in eight
//     is stubby and a few never rise (tools/variety-probe.mjs).
// Every jet also leans back along an oblique stone's path (JET_LEAN) and
// sideways where the lift bent the funnel (PATH_LEAN), at most JET_LEAN_MOST.
const SEAL_FROUDE = 108;              // the surface seal's boundary for a vertical smooth sphere: (ρ/ρa)²/6400 (Birkhoff & Isaacs 1951)...
const SEAL_IRREGULAR = 0.5;           // ...raised by this times the throw's asymmetry...
const SEAL_SPREAD = 0.25;             // ...its chance a logistic in ln(F·cos²θ / boundary) of this width
const SEAL_TIME = 10;                 // the dome closes this many R/(V·cos θ) after entry, far from the boundary (Marston et al. 2012: 11.5 R/V; Truscott & Techet 2009's billiard ball 1.1 to 1.3 sqrt(R/g), with the factor below)...
const TRAP_SHARE = 0.54;              // a dome that closed earlier than this share of the pinch time is drawn down before the jet reaches it (the variety notes)...
const TRAP_SPREAD = 0.06;             // ...the chance a logistic in that share, of this width
const DOME_BURST_SHARE = 0.3;         // the jet bursting through the dome flings its apex's water at this share of the needle's speed
const TRAPPED_BOIL = 2;               // a trapped jet's heaving mound seethes: its base's boil times this
const BULGE_LEAN = [4, 14];           // degrees a jet leans towards a lopsided hole's bulge, at asymmetry 0 and 1...
const LEANING_EXTRA = [8, 16];        // ...and a leaning jet's more
const JET_LEAN_MOST = THREE.MathUtils.degToRad(30);   // a jet leans at most this far from vertical
const PATH_LEAN = 0.6;                // the jet leans by this share of the angle the lift bent the funnel

/**
 * The throw's own choices (above): the seal, the hole's asymmetry, the
 * crown's lopsidedness and the jet's form; `fixed` {seal, regime} fixes the
 * seal's kind (with its nominal timing) and the jet's form, for a probe.
 */
export function chooseSplash(info, random, fixed = null) {
  const range = (low, high) => low + random() * (high - low);
  const pick = (weights) => {
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    let draw = random() * total;
    for (const [name, weight] of Object.entries(weights)) { draw -= weight; if (draw <= 0) return name; }
    return Object.keys(weights).at(-1);
  };
  const { radius, velocity } = info;
  const speed = Math.max(info.speed, 1.0);
  const sizeFactor = radius / REFERENCE_RADIUS;
  const horizontalFraction = Math.min(Math.hypot(velocity.x, velocity.z) / speed, 1);
  const shape = info.shape ?? { elongation: 0, flatness: 0, irregularity: 0.04 };
  const contact = info.contact ?? { kind: 'point', faceAngle: 45, pointAngle: 45, bluntness: 1 };
  const spin = info.spin ?? { ratio: 0, alongEntry: 1, axis: { x: 0, y: 1, z: 0 } };
  const across = Math.sqrt(Math.max(1 - spin.alongEntry * spin.alongEntry, 0));

  const tilt = Math.abs(Math.sin(2 * THREE.MathUtils.degToRad(contact.faceAngle)));
  const asymmetry = fixed ? 0 : THREE.MathUtils.clamp(
    1.4 * (shape.flatness + 0.5 * shape.elongation) * tilt + 2.5 * Math.max(shape.irregularity - 0.04, 0) + 2.5 * spin.ratio * across + 0.35 * (random() - 0.5), 0, 1);

  // The seal: the surface seal's chance and its dome's time (above), from the
  // entry's Froude number through the oblique mouth against the boundary.
  const blunt = THREE.MathUtils.clamp(contact.bluntness - 1, -0.6, 1.5);
  const verticalShare = Math.sqrt(Math.max(1 - horizontalFraction * horizontalFraction, 0.01));
  const sealFroude = ((speed * verticalShare) ** 2 / (GRAVITY * radius)) * (1 + 0.12 * blunt);
  const boundary = SEAL_FROUDE * (1 + SEAL_IRREGULAR * asymmetry);
  const surfaceChance = 1 / (1 + Math.exp(-Math.log(sealFroude / boundary) / SEAL_SPREAD));
  const shallowChance = 0.06 + 0.3 * smoothstep(0.6, 1.6, blunt) * (contact.kind === 'face' ? 1 : 0.4) + 0.4 * smoothstep(5.5, 3.5, speed);
  const sealDraw = random();
  const trapDraw = random();
  const sealKind = fixed?.seal ?? (sealDraw < surfaceChance ? 'surface' : sealDraw < surfaceChance + (1 - surfaceChance) * shallowChance ? 'shallow' : 'deep');
  const nominal = Boolean(fixed?.seal);
  const vary = (low, high) => (nominal ? 1 : range(low, high));
  let seal;
  if (sealKind === 'deep') seal = { kind: 'deep', pinch: PINCH_TIME * vary(0.95, 1.06), bowl: vary(0.85, 1.2), mouth: vary(0.9, 1.1) };
  else if (sealKind === 'shallow') seal = { kind: 'shallow', pinch: range(1.35, 1.65), bowl: range(0.6, 0.8), head: SURFACE_HEAD * range(2, 2.8), mouth: range(1.0, 1.15) };
  else {
    // The dome closes later near the boundary, always before the hole pinches.
    const pinch = nominal ? 1.8 : range(1.7, 1.9);
    const nearness = Math.min(boundary / sealFroude, 1);
    const dome = (SEAL_TIME / Math.sqrt(sealFroude)) * (1 + 0.5 * nearness * nearness) * vary(0.9, 1.1);
    // The dome cuts the hole off from the air, so its mouth stops widening early: the dome spans it.
    seal = { kind: 'surface', pinch, bowl: vary(0.8, 1.0), mouth: vary(0.25, 0.4), dome: THREE.MathUtils.clamp(dome, 0.35, 0.85 * pinch) };
  }
  // A dome that closed early is drawn down before the jet reaches it (the notes above): the jet is trapped.
  const trappedChance = sealKind === 'surface' ? 1 / (1 + Math.exp(-(TRAP_SHARE - seal.dome / seal.pinch) / TRAP_SPREAD)) : 0;
  const trapped = sealKind === 'surface' && (fixed ? trappedChance >= 0.5 : trapDraw < trappedChance);

  // The hole's departure from round, towards the side its lumps bulge it to.
  const liftAcross = info.lift ? Math.hypot(info.lift.shape.x, info.lift.shape.z) : 0;
  const lopsidedAngle = liftAcross > 0.02 ? Math.atan2(info.lift.shape.z, info.lift.shape.x) + range(-0.5, 0.5) : range(0, Math.PI * 2);
  const lopsided = 0.03 + 0.12 * asymmetry;
  const hole = {
    ellipse: 0.55, lopsided, lopsidedAngle, lobes: 0.03 + 0.6 * Math.max(shape.irregularity - 0.03, 0), lobesAngle: range(0, Math.PI * 2),
    closure: 0.8 * lopsided,
  };

  // The crown: the spin drags water up on the side its surface rises (its
  // vertical speed there over the entry speed, ω × r at the waterline), a
  // broad face throws it lower and wider, a point taller and narrower.
  const spinLift = 2.5 * spin.ratio;
  const crown = fixed ? { spinX: 0, spinZ: 0, speedScale: 1, tiltShift: 0 } : {
    spinX: spinLift * spin.axis.z, spinZ: -spinLift * spin.axis.x,
    speedScale: contact.kind === 'face' ? range(1.0, 1.08) : contact.kind === 'point' ? range(0.94, 1.02) : range(0.97, 1.04),
    tiltShift: contact.kind === 'face' ? -range(4, 10) : contact.kind === 'point' ? range(2, 6) : 0,
  };

  // The jet's form.
  const fast = smoothstep(5.5, 8, speed);
  const big = smoothstep(1.4, 2.7, sizeFactor);
  const oblique = smoothstep(0.55, 0.85, horizontalFraction);
  const focused = 1 - smoothstep(0.6, 1.0, asymmetry);   // a clean jet's odds: a lopsided collapse does not focus one
  const weights = trapped ? { none: 1 }
    : sealKind === 'shallow' ? { stubby: 1.0, clean: 0.35 * focused, ragged: 0.25, leaning: 0.2 * asymmetry, none: 0.06 }
      : {
        clean: (0.65 - 0.45 * big) * focused,
        leaning: 0.05 + 0.55 * asymmetry,
        ragged: 0.1 + 0.3 * asymmetry * (0.5 + fast) + 0.15 * oblique + 0.35 * big,
        stubby: 0.12 + 0.4 * big + 0.25 * smoothstep(0.5, 1.5, blunt),
      };
  const regime = fixed?.regime ?? pick(weights);
  return { seal, trapped, trappedChance, asymmetry, hole, crown, regime, range, random, sizeFactor, surfaceChance, nominal: Boolean(fixed?.regime) };
}

/**
 * A thing lighter than a river stone (src/things.js; its `density` in the
 * impact) throws a slower jet: it stops sooner, so less of its push is left
 * when the hole closes, the jet's speed scaled by LIGHT_JET[0] +
 * LIGHT_JET[1]·sqrt(ρ/ρ_stone) (a basketball's about half a stone's; its
 * shallower hole, src/cavity.js, gives it less water too).
 */
function lightJet(density = STONE_DENSITY) {
  return density < STONE_DENSITY ? LIGHT_JET[0] + LIGHT_JET[1] * Math.sqrt(density / STONE_DENSITY) : 1;
}

/**
 * A jet's form for its regime (src/jet.js, CLEAN_FORM): how the collapse
 * launches its water (its focus, thickness, unevenness and wobble), its
 * launch speed's scale and its own lean towards the hole's bulge (degrees),
 * from the throw's stream. What the column then does is src/slenderJet.js's.
 * A collapse is the less even the more lopsided the stone's hole (the
 * roughness grows with the asymmetry).
 */
function jetForm(regime, choice) {
  const { range, asymmetry } = choice;
  const bulgeLean = BULGE_LEAN[0] + (BULGE_LEAN[1] - BULGE_LEAN[0]) * asymmetry;
  const sealed = choice.seal.kind === 'surface';
  const rough = (low, high) => range(low, high) * (1 + 2 * asymmetry);
  switch (regime) {
    case 'leaning':
      // A lopsided collapse throws the column towards the bulge, focusing it less.
      return {
        form: { ...CLEAN_FORM, needle: range(1.8, 2.6), radiusScale: range(0.9, 1.15), roughness: rough(0.012, 0.025), wobble: range(1, 2), air: 1.1 },
        speedScale: range(0.75, 0.95), lean: bulgeLean + range(LEANING_EXTRA[0], LEANING_EXTRA[1]),
      };
    case 'ragged':
      // An uneven, turbulent collapse: the column is launched rough, so it comes apart along its length.
      return {
        form: { ...CLEAN_FORM, needle: range(1.5, 2.5), radiusScale: range(0.9, 1.3), roughness: rough(0.03, 0.06), wobble: range(2, 3.5), spray: range(2.5, 4) },
        speedScale: sealed ? range(0.55, 0.8) : range(0.75, 1.0), lean: bulgeLean * range(0.8, 1.4),
        air: range(1.1, 1.4),
      };
    case 'stubby':
      // A collapse that focuses little: fat and slow, with hardly a needle.
      return {
        form: { ...CLEAN_FORM, needle: range(1.0, 1.4), radiusScale: 1 + range(0.3, 0.6) / Math.sqrt(Math.max(choice.sizeFactor, 1)), roughness: rough(0.01, 0.02), wobble: 0.8, air: 1.2 },
        speedScale: sealed ? range(0.45, 0.6) : range(0.55, 0.75), lean: bulgeLean * range(0.5, 1),
      };
    case 'none':
      // No jet clears the water: the collapse under the dome only heaves a
      // low, broad mound (a few centimetres for the default stone).
      return {
        form: { ...CLEAN_FORM, needle: 1, radiusScale: range(1.2, 1.4), roughness: 0.01, wobble: 0.5, air: 1.3 },
        speedScale: range(0.15, 0.22), lean: bulgeLean * range(0.3, 1),
      };
    default:
      // A probe's fixed clean jet (chooseSplash's `fixed`) is the nominal one.
      if (choice.nominal) return { form: { ...CLEAN_FORM }, speedScale: 1, lean: 0 };
      return {
        form: { ...CLEAN_FORM, needle: range(2.5, 3.3), radiusScale: range(0.85, 1.15), roughness: rough(0.008, 0.02), wobble: range(0.7, 1.6) },
        speedScale: range(0.85, 1.12), lean: bulgeLean * range(0.3, 1),
      };
  }
}

export class SplashSystem {
  constructor({ capacity = 16000, bubbleCapacity = 3000, environment, lighting, water, ambientWaves, surface = null }) {
    this.capacity = capacity;
    this.crownDropletCap = CROWN_DROPLET_CAP;   // the preset's (setCrownDropletCap)
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.radii = new Float32Array(capacity);
    this.ages = new Float32Array(capacity);
    this.lenses = new Float32Array(capacity);   // 1 for drops drawn as glass lenses like the jet column

    this.bubbleCapacity = bubbleCapacity;
    this.bubbleCount = 0;
    this.bubblePositions = new Float32Array(bubbleCapacity * 3);
    this.bubbleVelocities = new Float32Array(bubbleCapacity * 3);
    this.bubbleSizes = new Float32Array(bubbleCapacity);
    this.bubblePhases = new Float32Array(bubbleCapacity);

    this.jets = [];      // scheduled Worthington jets
    this.columns = [];   // live jet columns
    this.crowns = [];    // live crown sheets
    this.plumes = [];    // scheduled bubble plumes
    this.wakes = [];     // scheduled cavity splats of an oblique entry
    this.poolRings = []; // a pool's ring sources, held until their release (stampCavity)
    this.foamStamps = [];   // scheduled foam: a cavity's, when it closes
    this.bases = [];        // scheduled: a jet's base meeting the water, when the hole's bowl has flattened
    this.cavities = [];  // open cavities (src/cavity.js), drawn in the main scene from cavityGroup
    this.ground = null;  // the pool's walls and deck (setGround), or none
    this.ice = null;     // the ice over the water (setIce, src/ice.js), or none
    this.wetIce = null;  // its wetting where a drop lands on it (setIce)
    this.walls = null;   // the box the sheets and columns are held in (setGround)
    this.cavityGroup = new THREE.Group();
    this.surface = surface;
    this.sceneTime = -1;  // splash time the cavities were last brought to
    this.time = 0;
    this.frameSeconds = 1 / 60;   // simulated length of the frame being stepped
    this.frameEnd = 0;            // the splash time it ends at, when the solver takes this frame's splats (setFrameSeconds)
    this.substep = 1 / 240;       // and of its substeps, which the stones are stepped with (each update's, or setStoneStep's)
    this.stoneStep = null;        // the step the stones are stepped with, when it is not the splash's own (setStoneStep)
    this.lighting = lighting;
    this.bedAlbedo = SAND_ALBEDO;   // the bed's (setBed)
    this.foamSpecks = new FoamSpecks({ water, lighting, ambientWaves });
    // The foam drifts down the wind the ripples blow with (the CPU probes' stand-ins have neither).
    if (ambientWaves.windDirection) water.setWind?.(ambientWaves.windDirection);

    // Droplet instances.
    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute('position', quad.getAttribute('position'));
    this.instancePositions = new THREE.InstancedBufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.instanceRadii = new THREE.InstancedBufferAttribute(this.radii, 1).setUsage(THREE.DynamicDrawUsage);
    this.instanceVelocities = new THREE.InstancedBufferAttribute(this.velocities, 3).setUsage(THREE.DynamicDrawUsage);
    this.instanceLenses = new THREE.InstancedBufferAttribute(this.lenses, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iPosition', this.instancePositions);
    geometry.setAttribute('iRadius', this.instanceRadii);
    geometry.setAttribute('iVelocity', this.instanceVelocities);
    geometry.setAttribute('iLens', this.instanceLenses);
    geometry.instanceCount = 0;
    this.particleGeometry = geometry;

    // The gale lifts everything the splash draws with the surface under it
    // (galeLift, src/shaders/scene.js); its uniforms are among the ripples'.
    const galeUniforms = () => Object.fromEntries(Object.entries(ambientWaves.uniforms()).filter(([name]) => name.startsWith('uGale')));
    const particleUniforms = () => ({
      ...galeUniforms(),
      uProjScale: { value: 1000 },
      uMinPixelRadius: { value: 1.0 },
      uHazeRadius: { value: 0.5 },
      uStreakSeconds: { value: 0 },
      uSunDirView: { value: new THREE.Vector3() },
      uLeastRadius: { value: 0 },
      uSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    });
    this.streakSeconds = 0;
    // The optics pass sums all four channels (src/shaders/fluid.js).
    const summed = { depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };
    this.depthMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_DEPTH_FRAGMENT, uniforms: particleUniforms(), depthTest: true, depthWrite: true });
    this.thicknessMaterial = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_THICKNESS_FRAGMENT, uniforms: particleUniforms(), ...summed });
    this.particleMesh = new THREE.Mesh(geometry, this.depthMaterial);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.visible = false;
    this.particleScene = new THREE.Scene();
    this.particleScene.add(this.particleMesh);
    // The spray (src/spray.js): the same passes, its flight a closed form of its clock.
    this.spray = new SpraySystem();
    this.spray.setMaterials(
      new THREE.ShaderMaterial({ vertexShader: SPRAY_VERTEX, fragmentShader: PARTICLE_DEPTH_FRAGMENT, uniforms: { ...particleUniforms(), ...this.spray.uniforms }, depthTest: true, depthWrite: true }),
      new THREE.ShaderMaterial({ vertexShader: SPRAY_VERTEX, fragmentShader: PARTICLE_THICKNESS_FRAGMENT, uniforms: { ...particleUniforms(), ...this.spray.uniforms }, ...summed }),
    );
    this.particleScene.add(this.spray.mesh);

    // Crown sheets: every crown's mesh shares these and swaps them per pass.
    const sheetUniforms = () => ({
      uSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
    });
    // A landing crown rides the waves: the sheet's vertex shader samples the
    // splash's height field, the ambient waves (src/ambientWaves.js) and the
    // rings (src/rings.js, the cavity's dip under a stone's crown's foot).
    const rideUniforms = () => ({
      uHeight: { value: water.heightTexture },
      uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
      uDomainSize: { value: water.domainSize },
      uTexelOffset: water.gridUniforms?.uTexelOffset ?? { value: water.uvOffset },   // shared: it follows the solver's grid
      ...ambientWaves.uniforms(),
      ...(water.rings ? water.rings.uniforms() : {}),
    });
    this.sheetDepthMaterial = new THREE.ShaderMaterial({ vertexShader: SHEET_VERTEX, fragmentShader: SHEET_DEPTH_FRAGMENT, uniforms: { ...sheetUniforms(), ...rideUniforms() }, depthTest: true, depthWrite: true, side: THREE.DoubleSide });
    this.sheetThicknessMaterial = new THREE.ShaderMaterial({ vertexShader: SHEET_VERTEX, fragmentShader: SHEET_THICKNESS_FRAGMENT, uniforms: { ...sheetUniforms(), ...rideUniforms() }, ...summed, side: THREE.DoubleSide });
    // Jet columns, likewise.
    const columnUniforms = () => ({ ...sheetUniforms(), ...galeUniforms(), uProjScale: { value: 1000 }, uMinPixelRadius: { value: 1.0 } });
    this.columnDepthMaterial = new THREE.ShaderMaterial({ vertexShader: COLUMN_VERTEX, fragmentShader: COLUMN_DEPTH_FRAGMENT, uniforms: columnUniforms(), depthTest: true, depthWrite: true, side: THREE.DoubleSide });
    this.columnThicknessMaterial = new THREE.ShaderMaterial({ vertexShader: COLUMN_VERTEX, fragmentShader: COLUMN_THICKNESS_FRAGMENT, uniforms: columnUniforms(), ...summed, side: THREE.DoubleSide });
    this.sunDirView = new THREE.Vector3();

    // The mirror image's cheap water (src/shaders/fluid.js, MIRROR_*), drawn
    // over the dome's mirror image: premultiplied, the dome showing through,
    // the alpha left as the dome wrote it. Then each again as its distance
    // (MIRROR_COMMON): the same program (uMirrorDistance 1) with a blend that
    // leaves the colour and keeps the least alpha, the nearest.
    const mirrorBlend = { transparent: true, depthTest: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
    const distanceBlend = { transparent: true, depthTest: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.MinEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };
    const mirrorPair = (parameters) => {
      const colour = new THREE.ShaderMaterial({ ...parameters, uniforms: { ...parameters.uniforms, uMirrorDistance: { value: 0 }, uMirrorLevel: surface?.uniforms.uMirrorLevel ?? { value: 0 } }, ...mirrorBlend });
      const distance = new THREE.ShaderMaterial({ ...parameters, uniforms: { ...colour.uniforms, uMirrorDistance: { value: 1 } }, ...distanceBlend });
      return { colour, distance };
    };
    this.sheetMirror = mirrorPair({
      vertexShader: SHEET_VERTEX, fragmentShader: MIRROR_SHEET_FRAGMENT,
      uniforms: { ...rideUniforms(), uEnvCube: { value: environment.cubeTexture }, uSkyAmbient: { value: lighting.skyAmbient } },
      side: THREE.DoubleSide,
    });
    this.columnMirror = mirrorPair({
      vertexShader: COLUMN_VERTEX, fragmentShader: MIRROR_COLUMN_FRAGMENT,
      uniforms: { ...galeUniforms(), uProjScale: { value: 1000 }, uMinPixelRadius: { value: 1.0 }, uEnvCube: { value: environment.cubeTexture } },
      side: THREE.DoubleSide,
    });
    this.dropMirror = mirrorPair({
      vertexShader: PARTICLE_VERTEX, fragmentShader: MIRROR_DROP_FRAGMENT,
      uniforms: { ...particleUniforms(), uLeastRadius: { value: MIRROR_DROP_RADIUS }, uEnvCube: { value: environment.cubeTexture }, uSkyAmbient: { value: lighting.skyAmbient }, uSunIrradiance: { value: lighting.sunIrradiance } },
    });
    mirrorWith(this.particleMesh, this.dropMirror, (box) => this.dropletBounds(box));
    this.sprayMirror = mirrorPair({
      vertexShader: SPRAY_VERTEX, fragmentShader: MIRROR_DROP_FRAGMENT,
      uniforms: { ...particleUniforms(), ...this.spray.uniforms, uLeastRadius: { value: MIRROR_SPRAY_RADIUS }, uEnvCube: { value: environment.cubeTexture }, uSkyAmbient: { value: lighting.skyAmbient }, uSunIrradiance: { value: lighting.sunIrradiance } },
    });
    mirrorWith(this.spray.mesh, this.sprayMirror, (box) => this.spray.mirrorBounds(box));
    this.mirrorList = [];
    this.dropletBox = new THREE.Box3();
    this.dropletMin = new THREE.Vector3();
    this.dropletMax = new THREE.Vector3();

    this.compositePass = new FullscreenPass(COMPOSITE_FRAGMENT, {
      uScene: { value: null },
      uFluidInfo: { value: null },
      uOptics: { value: null },
      uEnvCube: { value: environment.cubeTexture },
      uInverseProjection: { value: new THREE.Matrix4() },
      uCameraWorld: { value: new THREE.Matrix4() },
      uSunDirView: { value: new THREE.Vector3() },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uAbsorb: { value: lighting.absorb },
      uExtinction: { value: lighting.extinction ?? new THREE.Vector3() },
      uFloorLight: { value: floorLight(lighting, floorViewDepth(water)) },
      uWaterColor: { value: lighting.waterColor ?? new THREE.Vector3() },
      uPondDepth: { value: floorViewDepth(water) },
      uExposure: { value: lighting.exposure },
      uNight: { value: 0 },
      uRefract: { value: 1.4 },
      uFluidScale: { value: 1.0 },
      uProjScale: { value: 1000 },
      ...(environment.hazeUniforms ?? { uHazeColor: { value: new THREE.Vector3() }, uHazeDensity: { value: 0 } }),   // the weather's haze (src/sky.js)
    });
    this.toneMapPass = new FullscreenPass(TONE_MAP_FRAGMENT, { uScene: { value: null }, uExposure: { value: lighting.exposure }, uNight: { value: 0 } });

    // Bubbles.
    const bubbleGeometry = new THREE.BufferGeometry();
    this.bubblePositionAttribute = new THREE.BufferAttribute(this.bubblePositions, 3).setUsage(THREE.DynamicDrawUsage);
    this.bubbleSizeAttribute = new THREE.BufferAttribute(this.bubbleSizes, 1).setUsage(THREE.DynamicDrawUsage);
    bubbleGeometry.setAttribute('position', this.bubblePositionAttribute);
    bubbleGeometry.setAttribute('aSize', this.bubbleSizeAttribute);
    bubbleGeometry.setDrawRange(0, 0);
    this.bubbleMaterial = new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERTEX,
      fragmentShader: BUBBLE_FRAGMENT,
      uniforms: { ...galeUniforms(), uProjScale: { value: 1000 }, uTint: { value: new THREE.Color(0.18, 0.30, 0.34) }, uExtinction: { value: lighting.extinction } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.bubblePoints = new THREE.Points(bubbleGeometry, this.bubbleMaterial);
    this.bubblePoints.frustumCulled = false;

    this.fluidScale = 0.5;
    this.targets = null;
  }

  /** Something in the air or in the water is moving: droplets, spray, sheets, columns, an open cavity, bubbles, or a stage still to come. */
  get inMotion() {
    return this.count > 0 || this.spray.alive || this.crowns.length > 0 || this.columns.length > 0 || this.cavities.length > 0 || this.bubbleCount > 0
      || this.jets.length > 0 || this.plumes.length > 0 || this.wakes.length > 0 || this.poolRings.length > 0 || this.foamStamps.length > 0 || this.bases.length > 0;
  }

  /** Nothing of the splash is left, foam specks included. */
  get settled() { return !this.inMotion && !this.foamSpecks.alive; }

  /**
   * Retire everything at once: droplets, spray, sheets, columns, cavities, bubbles,
   * foam specks, the stages still to come and the mirror list, the fluid
   * targets cleared (with `renderer`), and the splash clock back to zero.
   */
  reset(renderer = null) {
    this.count = 0;
    this.bubbleCount = 0;
    for (const crown of this.crowns) { this.particleScene.remove(crown.mesh); crown.dispose(); }
    this.crowns = [];
    for (const column of [...this.columns]) this.retireColumn(column);
    for (const cavity of [...this.cavities]) this.retireCavity(cavity);
    this.jets = [];
    this.plumes = [];
    this.wakes = [];
    this.poolRings = [];
    this.foamStamps = [];
    this.bases = [];
    this.mirrorList.length = 0;
    this.particleMesh.visible = false;
    this.particleMesh.layers.disable(MIRROR_LAYER);
    this.particleGeometry.instanceCount = 0;
    this.bubblePoints.geometry.setDrawRange(0, 0);
    this.foamSpecks.reset();
    this.spray.reset();
    this.spray.mesh.layers.disable(MIRROR_LAYER);
    this.time = 0;
    this.sceneTime = -1;
    this.surface?.setCavities([]);
    if (renderer && this.targets) {
      const previous = renderer.getRenderTarget();
      renderer.setClearColor(0x000000, 0);
      for (const target of Object.values(this.targets)) {
        renderer.setRenderTarget(target);
        renderer.clear(true, true, false);
      }
      renderer.setRenderTarget(previous);
    }
  }

  // ---- choreography ----------------------------------------------------

  /**
   * Build the splash for a stone that has just touched the water. Returns
   * its cavity (src/cavity.js), which a hole in the ice is fitted to
   * (src/ice.js fitCavity).
   */
  impact(info, water) {
    const { x, z, speed, velocity, radius } = info;
    const sizeFactor = radius / REFERENCE_RADIUS;
    const entrySpeed = Math.max(speed, 1.0);
    const horizontal = new THREE.Vector2(velocity.x, velocity.z);
    const horizontalFraction = Math.min(horizontal.length() / entrySpeed, 1);
    if (horizontal.lengthSq() > 1e-6) horizontal.normalize();
    const entryAngle = Math.asin(horizontalFraction);   // from vertical
    const jetLean = Math.min(JET_LEAN * entryAngle, JET_LEAN_CAP);
    // How this throw goes (the variety notes above chooseSplash), on its own
    // random stream, seeded by the stone (a stone the impact does not name draws a seed).
    // A probe may fix the seal and the jet's form (info.fixed: {seal, regime},
    // tools/basilisk/app-numbers.mjs: the reference simulation's deep seal and a clean jet).
    const seed = info.seed ?? Math.floor(Math.random() * 4294967296);
    const choice = chooseSplash(info, foamRandom(seed, radius), info.fixed);

    // The hole the stone opens: the crown and the fan launch from its rim and
    // the jet rises where it closes, leaning back along an oblique path,
    // sideways where the lift bent the funnel and towards a lopsided hole's
    // bulge.
    const cavity = this.startCavity(info, water, jetLean, choice);
    info.rock?.setCavityTimes(cavity.pinchTime);
    // The jet's body leaves at JET_COLLAPSE times the hole's collapse speed at its pinch (src/jet.js; the needle
    // faster), slower from a dragged cavity, and an oblique entry's sheared hole focuses its needle less.
    const baseBodySpeed = JET_COLLAPSE * Math.sqrt(GRAVITY * cavity.pinchDepth) * (1 - JET_OBLIQUE_SLOWING * horizontalFraction) * lightJet(info.density);
    const focus = 1 - NEEDLE_OBLIQUE * horizontalFraction;
    const shape = jetForm(choice.regime, choice);
    const bodySpeed = baseBodySpeed * shape.speedScale;
    const unfocused = (form) => ({ ...form, needle: 1 + (form.needle - 1) * focus });
    const lean = this.jetLean(cavity, horizontal, horizontalFraction, jetLean, shape.lean, choice.hole.lopsidedAngle);
    cavity.setLean(lean.x, lean.z);
    // What this throw chose, for the probes (tools/variety-probe.mjs) and the shoot harness's reports.
    this.lastChoice = { ...choice, form: shape.form, speedScale: shape.speedScale, lean };

    // 1. Crown. The droplet total is split between fine spray from the contact
    // line now, drops shed by the sheet's rim, and the sheet's breakup.
    const crownCount = Math.round(THREE.MathUtils.clamp(CROWN_DROPLETS * sizeFactor ** DROPLET_COUNT_POWER * Math.sqrt(entrySpeed / 6), 50, this.crownDropletCap));
    const sprayCount = Math.round(0.1 * crownCount);
    const rimCount = Math.round(0.1 * crownCount);
    for (let drop = 0; drop < sprayCount; drop++) {
      const angle = Math.random() * Math.PI * 2;
      const dirX = Math.cos(angle), dirZ = Math.sin(angle);
      const forward = (dirX * horizontal.x + dirZ * horizontal.y) * horizontalFraction;
      if (Math.random() < 0.45 * Math.max(-forward, 0)) continue;
      const ringRadius = radius * randomRange(0.9, 1.1);
      const tilt = THREE.MathUtils.degToRad(randomRange(50, 75));
      const dropSpeed = entrySpeed * randomRange(0.4, 0.9) * (1 + 0.45 * forward);
      const up = Math.cos(tilt) * dropSpeed;
      const out = Math.sin(tilt) * dropSpeed;
      this.spawnDroplet(
        x + dirX * ringRadius, 0.003, z + dirZ * ringRadius,
        dirX * out + velocity.x * 0.22, up, dirZ * out + velocity.z * 0.22,
        (SPRAY_DROP_RADIUS + SPRAY_DROP_SPREAD * Math.random()) * sizeFactor ** 0.4,
      );
    }
    this.contactSpray(x, z, radius, entrySpeed, velocity, horizontal, horizontalFraction, sizeFactor);
    const stoneCrowns = this.crowns.filter((candidate) => !candidate.landing && !candidate.fan);
    if (stoneCrowns.length >= MAX_CROWNS) {
      const oldest = stoneCrowns[0];
      oldest.finishNow(this);
      this.retireCrown(oldest);
    }
    // A surface seal: the crown domes over the hole, its rim closing about
    // sqrt(R/g) after entry; the jet from the pinch bursts it when its needle
    // reaches the dome's apex, or a trapped jet's dome is drawn down into the
    // hole by the pinch (the variety notes); its smooth rim sheds a third of
    // the drops, the burst the rest (a sunk dome none).
    // Through the ice (src/ice.js; info.throughIce, src/rock.js breakThrough) the lip is ice: no sheet stands on it,
    // neither the crown nor the fan; the contact's spray flies, and the rest of the splash is the open water's.
    const sealed = choice.seal.kind === 'surface';
    const timeUnit = Math.sqrt(radius / GRAVITY);
    const rimShed = sealed ? Math.round(rimCount / 3) : rimCount;
    const needleSpeed = bodySpeed * unfocused(shape.form).needle;
    const burstTime = cavity.pinchTime + (cavity.pinchDepth + DOME_HEIGHT * radius) / Math.max(needleSpeed, 0.5);
    if (!info.throughIce) {
      const crown = new CrownSheet({
        impact: info, startTime: this.time, rimDroplets: sealed && choice.trapped ? 0 : rimShed,
        breakupDroplets: sealed && choice.trapped ? 0 : crownCount - sprayCount - rimShed, spareDroplets: sealed && choice.trapped ? 0 : this.crownDropletCap - crownCount,
        material: this.sheetDepthMaterial, rim: cavity, lopsided: choice.crown,
        seal: sealed ? { time: choice.seal.dome * timeUnit, tear: choice.trapped ? cavity.pinchTime : burstTime, sink: choice.trapped, burstSpeed: DOME_BURST_SHARE * needleSpeed } : null,
      });
      this.crowns.push(crown);
      this.particleScene.add(crown.mesh);
    }

    // The forward fan of an oblique entry: a thin, fast, low sheet ahead of
    // the crown, at a strength growing with the horizontal fraction.
    const fanStrength = info.throughIce ? 0 : THREE.MathUtils.clamp((horizontalFraction - FAN_THRESHOLD) / (FAN_FULL - FAN_THRESHOLD), 0, 1);
    if (fanStrength > 0) {
      const fanCount = Math.round(THREE.MathUtils.clamp(FAN_DROPLETS * sizeFactor ** DROPLET_COUNT_POWER * Math.sqrt(entrySpeed / 6), 15, FAN_DROPLET_CAP) * fanStrength);
      const fan = new CrownSheet({
        impact: info, startTime: this.time, rimDroplets: Math.round(0.15 * fanCount), breakupDroplets: Math.round(0.85 * fanCount),
        spareDroplets: FAN_DROPLET_CAP - fanCount, material: this.sheetDepthMaterial, fan: true, strength: fanStrength, rim: cavity,
      });
      this.crowns.push(fan);
      this.particleScene.add(fan.mesh);
    }

    // Cavity: a depression plus a downward push that launches the first ring.
    // An oblique entry drags it forward: up to two more, where the stone is
    // one and two radii down its path (k·R·tan θ ahead, θ the entry angle
    // from vertical), as it gets there, each weaker, stretch the depression
    // and its foam; and each runs forward by the horizontal fraction, so the
    // ring is stronger ahead.
    const travelX = horizontal.x * horizontalFraction;
    const travelZ = horizontal.y * horizontalFraction;
    // The wake splats share the impulse with the entry splat, so an oblique
    // entry rings at most OBLIQUE_IMPULSE times as hard as a vertical one.
    const pathSlope = Math.min(Math.tan(entryAngle), PATH_SLOPE_CAP);
    const wakeStep = radius * pathSlope;
    const sinkSpeed = Math.max(entrySpeed * Math.cos(entryAngle), 1.0);
    const wakeStrengths = [smoothstep(0.05, 0.25, horizontalFraction) * 0.8, smoothstep(0.3, 0.5, horizontalFraction) * 0.6];
    const impulseScale = Math.min(OBLIQUE_IMPULSE / (1 + wakeStrengths[0] + wakeStrengths[1]), 1);
    // Their foam is the air the hole held, which surfaces where it closes: from the bowl's collapse on, over the
    // time the pinched-off air takes to rise from the pinch depth (the constants' note).
    const foamTime = this.time + cavity.closeTime;
    const foamSpan = Math.min(cavity.pinchDepth / BUBBLE_RISE_SPEED, FOAM_RISE_CAP);
    // The ring's source, once made, is handed to the jet: the pond's heave under the jet is the ring's less the
    // share the jet holds aloft (src/rings.js NEAR_FIELD.jet, src/jet.js aloftShare), published each step (update).
    const ring = { source: null, heave: Math.min(Math.sqrt(Math.max(1 - horizontalFraction * horizontalFraction, 0)) / HEAVE_VERTICAL, 1) };
    this.stampCavity({ x, z, radius, speed: entrySpeed, strength: impulseScale, travelX, travelZ, foamTime, foamSpan, ring }, water);
    wakeStrengths.forEach((strength, index) => {
      const step = index + 1;
      if (strength > 0) {
        this.wakes.push({
          x: x + horizontal.x * wakeStep * step, z: z + horizontal.y * wakeStep * step, start: this.time + (step * radius) / sinkSpeed,
          radius, speed: entrySpeed, strength: strength * impulseScale, travelX, travelZ, foamTime, foamSpan,
        });
      }
    });

    // 2 and 3. Pinch-off, the collapse of the hole above it, then the jet from
    // where the hole closed, in the form the throw chose (chooseSplash), which
    // after an oblique entry leans back along the stone's path and, from a
    // dragged cavity, rises slower.
    const closure = cavity.closurePoint({});
    // When the bowl has flattened the jet's base meets the water there (startBase).
    this.bases.push({ time: this.time + cavity.closeTime, x: closure.x, z: closure.z, radius, speed: entrySpeed, boil: choice.trapped ? TRAPPED_BOIL : 1 });
    const leanAngle = Math.atan(Math.hypot(lean.x, lean.z));
    const leanLength = Math.hypot(lean.x, lean.z) || 1;
    // A throw with no jet ('none') only heaves a mound, once the bowl has nearly filled.
    const jetStart = cavity.pinchTime + (choice.regime === 'none' ? MOUND_DELAY * cavity.bowlUnit : 0);
    const jet = {
      x: closure.x, z: closure.z, radius, start: this.time + jetStart, bodySpeed,
      floor: (age, out) => cavity.bowlFloorAt(jetStart + age, out), bowlUnit: cavity.bowlUnit,
      // The jet carries JET_SHARE of the water that fills the bowl, more for a fatter form, less for a slower one.
      volume: JET_SHARE * cavity.bowlVolume * shape.form.radiusScale ** 2 * shape.speedScale,
      lean: leanAngle, leanX: lean.x / leanLength, leanZ: lean.z / leanLength, form: unfocused(shape.form), regime: choice.regime,
      random: foamRandom(seed, radius, 1),
      ring,
    };
    this.jets.push(jet);

    // 4. Bubbles follow the stone down its path, in a cloud as wide as the stone.
    this.plumes.push({
      x, z, start: this.time, duration: 0.3,
      total: Math.round(THREE.MathUtils.clamp(BUBBLES * sizeFactor ** 2, 30, BUBBLE_CAP)),
      spawned: 0, depth: Math.min(0.55, radius * 7), spread: sizeFactor,
      driftX: horizontal.x * pathSlope, driftZ: horizontal.y * pathSlope,
    });
    return cavity;
  }

  /**
   * The contact line's first ejecta as spray (src/spray.js): CONTACT_SPRAY's
   * share of the stone's volume, in fine drops, from places round the
   * contact ring, low and fast, thinner behind an oblique stone and faster
   * ahead of it, as the contact drops go (impact). Its stream is its own.
   */
  contactSpray(x, z, radius, entrySpeed, velocity, horizontal, horizontalFraction, sizeFactor) {
    const random = seededRandom(x, z, this.time, radius);
    const range = (low, high) => low + random() * (high - low);
    const water = (CONTACT_SPRAY.water * (4 / 3) * Math.PI * radius ** 3) / CONTACT_SPRAY.bursts;
    const meanRadius = CONTACT_SPRAY.radius * sizeFactor ** 0.3;
    for (let burst = 0; burst < CONTACT_SPRAY.bursts; burst++) {
      const angle = ((burst + random()) / CONTACT_SPRAY.bursts) * Math.PI * 2;
      const dirX = Math.cos(angle), dirZ = Math.sin(angle);
      const forward = (dirX * horizontal.x + dirZ * horizontal.y) * horizontalFraction;
      const tilt = THREE.MathUtils.degToRad(range(55, 80));
      const speed = entrySpeed * range(0.5, 1.3) * (1 + 0.45 * forward);
      this.spray.burst({
        x: x + dirX * radius, y: 0.003, z: z + dirZ * radius,
        vx: dirX * Math.sin(tilt) * speed + velocity.x * 0.22, vy: Math.cos(tilt) * speed, vz: dirZ * Math.sin(tilt) * speed + velocity.z * 0.22,
        drops: sprayDrops(water * (1 - 0.45 * Math.max(-forward, 0)), meanRadius), radius: meanRadius,
        kick: 0.15 * speed, spread: 0.2 * radius, time: this.time, random, sizeFactor,
      });
    }
  }

  /**
   * A skip stone's touch (src/rock.js skim; the header): the ring its push
   * sends out, the spray thrown ahead of it and the water it churned, white
   * for a moment.
   */
  skim(info, water) {
    const { x, z, exitX, exitZ, velocity, radius, pushSpeed, duration } = info;
    const sizeFactor = radius / REFERENCE_RADIUS;
    const along = Math.hypot(velocity.x, velocity.z);
    const headingX = velocity.x / Math.max(along, 1e-9), headingZ = velocity.z / Math.max(along, 1e-9);
    const horizontalFraction = Math.min(along / Math.max(velocity.length(), 1e-9), 1);
    const strength = Math.sqrt(Math.max(pushSpeed, 0) / SKIM_PUSH_SPEED);
    // The ring: an entry's (RING) for a ball of the face's radius carrying the
    // push, from where the face was wet (behind the stone's centre), in pushes
    // one σ apart along its path on the water, released together enough to
    // make one ring (src/rings.js merges them).
    const sigma = RING.sigma * radius;
    const startX = x - headingX * SKIM_WET_BEHIND * radius, startZ = z - headingZ * SKIM_WET_BEHIND * radius;
    const endX = exitX - headingX * SKIM_WET_BEHIND * radius, endZ = exitZ - headingZ * SKIM_WET_BEHIND * radius;
    const length = Math.hypot(endX - startX, endZ - startZ);
    const pushes = THREE.MathUtils.clamp(Math.round(length / sigma) + 1, 1, SKIM_PUSHES);
    for (let push = 0; push < pushes; push++) {
      const share = pushes === 1 ? 0.5 : push / (pushes - 1);
      this.launchRing({
        x: startX + (endX - startX) * share, z: startZ + (endZ - startZ) * share, sigma, velocity: -RING.speed * pushSpeed / pushes,
        travelX: headingX * horizontalFraction, travelZ: headingZ * horizontalFraction, time: this.time + share * Math.min(duration, SKIM_RING_SPAN),
      }, water);
    }
    // The spray: the water the face pushes aside leaves as a thin sheet over
    // the sector ahead, low and fast, tearing into fine drops (a forward fan,
    // as an oblique entry throws: src/crown.js `fan`), at SKIM_FAN_SPEED of
    // the stone's speed along the water, and a few loose drops thrown wider.
    const count = Math.round(THREE.MathUtils.clamp(SKIM_DROPLETS * sizeFactor ** DROPLET_COUNT_POWER * strength, 6, SKIM_DROPLET_CAP));
    const fan = new CrownSheet({
      impact: { x: startX, z: startZ, speed: SKIM_FAN_SPEED * along, velocity, radius },
      startTime: this.time, rimDroplets: Math.round(0.15 * count), breakupDroplets: Math.round(0.85 * count),
      spareDroplets: SKIM_DROPLET_CAP - count, material: this.sheetDepthMaterial, fan: true, strength: Math.min(strength, 1),
    });
    this.crowns.push(fan);
    this.particleScene.add(fan.mesh);
    const loose = Math.round(SKIM_LOOSE * count);
    for (let drop = 0; drop < loose; drop++) {
      const side = drop % 2 === 0 ? 1 : -1;
      const off = side * THREE.MathUtils.degToRad(randomRange(SKIM_SPRAY.angle[0], SKIM_SPRAY.angle[1]));
      const directionX = headingX * Math.cos(off) - headingZ * Math.sin(off);
      const directionZ = headingX * Math.sin(off) + headingZ * Math.cos(off);
      const rise = THREE.MathUtils.degToRad(randomRange(SKIM_SPRAY.rise[0], SKIM_SPRAY.rise[1]));
      const dropSpeed = along * randomRange(SKIM_SPRAY.speed[0], SKIM_SPRAY.speed[1]);
      const aside = side * radius * randomRange(0.4, 1.0);
      this.spawnDroplet(
        startX - headingZ * aside, 0.003, startZ + headingX * aside,
        directionX * Math.cos(rise) * dropSpeed, Math.sin(rise) * dropSpeed, directionZ * Math.cos(rise) * dropSpeed,
        (SPRAY_DROP_RADIUS + SPRAY_DROP_SPREAD * Math.random()) * sizeFactor ** 0.4,
      );
    }
    // The water the face churned: a small boil, white for a moment (on the solver's patch only, where the foam is).
    const middleX = 0.5 * (startX + endX), middleZ = 0.5 * (startZ + endZ);
    this.stampFoamPatch(water, foamRandom(middleX, middleZ, this.time), {
      x: middleX, z: middleZ, radius: SKIM_CHURN.radius * radius, amount: Math.min(SKIM_CHURN.amount * strength, FOAM_AMOUNT_CAP),
      reach: 0.6, radii: [0.4, 0.8], lifetime: SKIM_CHURN.lifetime, boil: true, source: 'skim',
    });
  }

  /**
   * A pool's ring source at its release (stampCavity): its push and pair to
   * the solver, whose walls reflect the ring, and to src/rings.js as a
   * near-field ring, released when the solver takes them: at the end of this
   * frame (setFrameSeconds), so the near field it hides is the solver's own.
   */
  releasePoolRing({ x, z, sigma, velocity, pairHeight, directionX, directionZ, ring = null }, water) {
    const strength = RING_SOURCE.strength;
    water.addSplat({ x, z, radius: sigma, velocity: velocity * strength, rim: RING.rim });
    if (pairHeight !== 0) {
      water.addSplat({ x: x + directionX * 0.8 * sigma, z: z + directionZ * 0.8 * sigma, radius: 0.8 * sigma, height: pairHeight * strength, rim: 1 });
      water.addSplat({ x: x - directionX * 0.8 * sigma, z: z - directionZ * 0.8 * sigma, radius: 0.8 * sigma, height: -pairHeight * strength, rim: 1 });
    }
    const source = water.rings.add({
      x, z, radius: sigma, velocity, rim: RING.rim, nearOnly: true,
      pair: pairHeight !== 0 ? { height: pairHeight, radius: 0.8 * sigma, offset: 0.8 * sigma, directionX, directionZ } : null,
    }, Math.max(this.frameEnd, this.time));
    if (ring && typeof source === 'object') { ring.source = source; source.heave = ring.heave ?? 1; }   // the jet's heave reads it (update; a stand-in's add may answer true)
  }

  /**
   * The ring a stone's entry launches (RING), at `strength` of a vertical
   * entry's, with its foam. (travelX, travelZ), a direction times a share
   * from 0 to 1, sets the pair of heights that makes that share of the ring
   * run that way: raised ahead and lowered behind, a quarter period out of
   * step with the push, so the waves ahead grow and those behind shrink
   * (src/rings.js). The ring goes to the analytic rings when the water
   * carries them (water.rings: the push and its pair as one ring source,
   * across the whole pond); in a pool (water.pool) it is held until its
   * release and goes to both (releasePoolRing); else to the solver (the CPU
   * probes' stand-in), at once, which cannot hold a splat back. The foam
   * comes from foamTime (the cavity's closure), or now.
   */
  stampCavity({ x, z, radius, speed, strength, travelX = 0, travelZ = 0, foamTime = this.time, foamSpan, ring = null }, water) {
    this.launchRing({ x, z, sigma: RING.sigma * radius, velocity: -RING.speed * speed * strength, travelX, travelZ, time: this.time + RING.delay * Math.sqrt(radius / GRAVITY), ring }, water);
    // The foam comes up where the hole closed, from foamTime over foamSpan
    // (the bubbles' rise from the pinch depth; a wake's is its cavity's): a
    // boil over about the mouth, within about one and a half stone radii of
    // the centre (the flows then carry it outward), each sub-stamp with the
    // whole peak for as long as the air comes up (sustained), and nothing
    // after it (fresh water: the constants' note).
    const sizeFactor = radius / REFERENCE_RADIUS;
    const random = foamRandom(x, z, foamTime);
    const span = foamSpan ?? FOAM_SPREAD * Math.sqrt(radius / GRAVITY);
    this.stampFoamPatch(water, random, { x, z, radius: 1.1 * radius, amount: Math.min(BOIL_AMOUNT * sizeFactor * strength, FOAM_AMOUNT_CAP), reach: 0.8, radii: [0.3, 0.6], lifetime: BOIL_LIFETIME, boil: true, time: foamTime, span, sustained: true, source: 'closure' });
  }

  /**
   * A ring source (stampCavity's, a skip's, a floater's ripple's), released
   * at `time`: a push of `velocity` over σ = `sigma` less one of σ·RING.rim,
   * and the pair of heights that makes the share (travelX, travelZ) of it
   * run that way. To the analytic rings, held for the pool
   * (releasePoolRing), or to the solver at once (stampCavity's header).
   */
  launchRing({ x, z, sigma, velocity, travelX = 0, travelZ = 0, time, ring = null }, water) {
    const travel = Math.hypot(travelX, travelZ);
    const pairHeight = RING.ahead * travel * Math.abs(velocity) * Math.sqrt(sigma / GRAVITY);
    const directionX = travel > 0 ? travelX / travel : 1, directionZ = travel > 0 ? travelZ / travel : 0;
    // A frozen lake's (water.iced, src/ice.js) as a pool's: its hole is too small for the analytic ring to read across,
    // and its waves run under the ice, so the solver carries it (out of sight but in the holes).
    if (water.rings && (water.pool || water.iced)) {
      this.poolRings.push({ time, x, z, sigma, velocity, pairHeight: travel > 0 ? pairHeight : 0, directionX, directionZ, ring });
    } else if (water.rings) {
      const source = water.rings.add({
        x, z, radius: sigma, velocity, rim: RING.rim,
        pair: travel > 0 ? { height: pairHeight, radius: 0.8 * sigma, offset: 0.8 * sigma, directionX, directionZ } : null,
      }, time);
      if (ring && typeof source === 'object') { ring.source = source; source.heave = ring.heave ?? 1; }   // the jet's heave reads it (update; a stand-in's add may answer true)
    } else {
      water.addSplat({ x, z, radius: sigma, velocity, rim: RING.rim });
      if (travel > 0) {
        water.addSplat({ x: x + directionX * 0.8 * sigma, z: z + directionZ * 0.8 * sigma, radius: 0.8 * sigma, height: pairHeight, rim: 1 });
        water.addSplat({ x: x - directionX * 0.8 * sigma, z: z - directionZ * 0.8 * sigma, radius: 0.8 * sigma, height: -pairHeight, rim: 1 });
      }
    }
  }

  /**
   * A floater breaking the surface (src/rock.js `ripple`): coming up through
   * it, or back down onto it after bobbing clear, at `speed`. Its ring is an
   * entry's (RING's source) for a ball of its radius at RIPPLE.share of that
   * speed, pushing up as it rises and down as it comes down, and the water
   * it sheds whitens a little round it (a boil of RIPPLE.foam).
   */
  ripple(info, water) {
    const { x, z, radius, speed, rising } = info;
    const sign = rising ? 1 : -1;
    this.launchRing({ x, z, sigma: RING.sigma * radius, velocity: sign * RING.speed * RIPPLE.share * speed, time: this.time }, water);
    const random = foamRandom(x, z, this.time);
    this.stampFoamPatch(water, random, {
      x, z, radius: 1.2 * radius, amount: Math.min(RIPPLE.foam * speed, FOAM_AMOUNT_CAP), reach: 1.0, radii: [0.3, 0.6],
      lifetime: BOIL_LIFETIME, boil: true, time: this.time, span: FOAM_SPREAD * Math.sqrt(radius / GRAVITY), source: 'ripple',
    });
  }

  /**
   * A floater struck by another thing (src/collide.js): the water on it
   * thrown off where it was struck (x, y, z, on still water), out along
   * `normal` (away from it) and spread by KNOCK.spread, a little upward, at
   * up to `speed`; KNOCK.drops per m/s, more for a bigger ball (as the
   * square root of its radius), at most KNOCK.most.
   */
  knock({ x, y, z, normalX, normalY, normalZ, speed, radius }) {
    const count = Math.round(Math.min(KNOCK.drops * speed * Math.sqrt(radius / REFERENCE_RADIUS), KNOCK.most));
    for (let drop = 0; drop < count; drop++) {
      let directionX = normalX + KNOCK.spread * (2 * Math.random() - 1);
      let directionY = normalY + KNOCK.spread * (2 * Math.random() - 1) + KNOCK.lift;
      let directionZ = normalZ + KNOCK.spread * (2 * Math.random() - 1);
      const length = Math.hypot(directionX, directionY, directionZ) || 1;
      const dropSpeed = speed * randomRange(0.3, 1);
      directionX *= dropSpeed / length; directionY *= dropSpeed / length; directionZ *= dropSpeed / length;
      this.spawnDroplet(x, Math.max(y, 0.002), z, directionX, directionY, directionZ, randomRange(KNOCK.radius[0], KNOCK.radius[1]));
    }
  }

  /**
   * The stone's cavity (src/cavity.js), keeping at most MAX_CAVITIES open (the
   * most the surface dips under; an older one closes at once). It
   * is drawn only where the surface patch is simulated: outside it the water
   * is a flat sheet with no hole to show.
   */
  startCavity(info, water, lean, choice = null) {
    if (this.cavities.length >= MAX_CAVITIES) this.retireCavity(this.cavities[0]);
    const domainMin = water.domainMin ?? [-Infinity, -Infinity];
    const domainSize = water.domainSize ?? Infinity;
    const inside = (value, low) => Math.abs((value - low) / domainSize - 0.5) * 2 < 0.75;
    const cavity = new Cavity({
      impact: info, startTime: this.time, material: this.surface?.cavityMaterial ?? null,
      // The surface dips by whole vertices of its mesh, which may be coarser than the solver's grid (src/waterSurface.js).
      cell: Math.max(water.cell ?? 0, this.surface?.cell ?? 0) || undefined, floorDepth: water.floorDepthAt ?? water.depth, lean, step: this.substep,
      drawn: inside(info.x, domainMin[0]) && inside(info.z, domainMin[1]),
      seal: choice?.seal ?? null, asymmetry: choice?.hole ?? null,
    });
    this.cavities.push(cavity);
    if (cavity.mesh) this.cavityGroup.add(cavity.mesh);
    return cavity;
  }

  /**
   * The jet's lean as a vector (its top's horizontal direction times the
   * tangent of its angle from vertical): back along an oblique stone's path
   * by `obliqueLean` (radians), sideways by PATH_LEAN of the angle the lift
   * bent the funnel (from the mouth to where the hole pinched, across the
   * throw), and `asymmetricLean` degrees towards the hole's bulge; at most
   * JET_LEAN_MOST.
   */
  jetLean(cavity, heading, horizontalFraction, obliqueLean, asymmetricLean, bulgeAngle) {
    let leanX = -heading.x * Math.tan(obliqueLean), leanZ = -heading.y * Math.tan(obliqueLean);
    const mouth = cavity.closurePoint({});
    const pinch = cavity.sliceCentre(cavity.pinchDepth, {});
    let offsetX = pinch.x - (mouth.x - cavity.closureX), offsetZ = pinch.z - (mouth.z - cavity.closureZ);
    if (horizontalFraction > 0.05) {
      const along = offsetX * heading.x + offsetZ * heading.y;
      offsetX -= along * heading.x; offsetZ -= along * heading.y;
    }
    const offset = Math.hypot(offsetX, offsetZ);
    if (offset > 1e-6 && cavity.pinchDepth > 1e-6) {
      const bent = Math.tan(PATH_LEAN * Math.atan(offset / cavity.pinchDepth));
      leanX -= (offsetX / offset) * bent; leanZ -= (offsetZ / offset) * bent;
    }
    const towards = Math.tan(THREE.MathUtils.degToRad(asymmetricLean));
    leanX += Math.cos(bulgeAngle) * towards; leanZ += Math.sin(bulgeAngle) * towards;
    const length = Math.hypot(leanX, leanZ);
    const most = Math.tan(JET_LEAN_MOST);
    if (length > most) { leanX *= most / length; leanZ *= most / length; }
    return { x: leanX, z: leanZ };
  }

  retireCavity(cavity) {
    if (cavity.mesh) this.cavityGroup.remove(cavity.mesh);
    cavity.dispose();
    this.cavities.splice(this.cavities.indexOf(cavity), 1);
  }

  /** A big drop has landed: a crown of its own, its droplet count following the drop's area. */
  startLandingCrown(hit) {
    const breakup = Math.round(THREE.MathUtils.clamp(LANDING_BREAKUP * (hit.radius / LANDING_REFERENCE) ** 2, 3, 12));
    const crown = new CrownSheet({
      impact: { x: hit.x, z: hit.z, speed: hit.speed, velocity: { x: hit.velocityX, y: -hit.fallSpeed, z: hit.velocityZ }, radius: hit.radius },
      startTime: this.time, rimDroplets: Math.round(0.25 * breakup), breakupDroplets: breakup,
      material: this.sheetDepthMaterial, landing: true,
    });
    this.crowns.push(crown);
    this.particleScene.add(crown.mesh);
  }

  /**
   * A crown has gone. A stone's leaves foam specks where its base stood, 0.9
   * to 2.2 stone radii from its centre, surfacing over CROWN_SPECK_SPAN.
   */
  retireCrown(crown) {
    if (!crown.landing && !crown.fan) {
      const radius = crown.radius;
      const count = Math.round(THREE.MathUtils.clamp(CROWN_SPECKS * crown.sizeFactor ** 2, 40, CROWN_SPECK_CAP));
      this.spawnFoamSpecks(crown.centreX, crown.centreZ, 0.9 * radius, 2.2 * radius, count, 0.03, CROWN_SPECK_SPAN * Math.sqrt(radius / GRAVITY));
    }
    this.particleScene.remove(crown.mesh);
    crown.dispose();
    this.crowns.splice(this.crowns.indexOf(crown), 1);
  }

  /**
   * The cavity has closed: fire the column from the mound where it closed, in
   * a boil, keeping at most MAX_JETS. Every throw fires one, if only the low mound of the form
   * 'none': the warm-up's throw (src/main.js) must draw the column's
   * programs, whatever form it draws.
   */
  startJet(jet, water) {
    if (this.columns.length >= MAX_JETS) {
      const oldest = this.columns[0];
      oldest.finishNow(this, this.columnWater(oldest, water));
      this.retireColumn(oldest);
    }
    const column = new JetColumn({
      x: jet.x, z: jet.z, radius: jet.radius, speed: jet.bodySpeed, bowlUnit: jet.bowlUnit, volume: jet.volume,
      startTime: jet.start, material: this.columnDepthMaterial,
      lean: jet.lean, leanX: jet.leanX, leanZ: jet.leanZ, form: jet.form, random: jet.random, floor: jet.floor,
    });
    column.ringSource = jet.ring ?? null;   // its ring's source (a holder: the source once made): the heave under the jet is the ring's less the jet's share (update)
    this.columns.push(column);
    this.particleScene.add(column.mesh);
  }

  /**
   * The bowl has flattened into the surface: where the jet rose, its base
   * meets the water in a boil (a trapped jet's seething with the dome's
   * air, `boil` times it; frothier the faster the entry, by the crown's
   * froth law, up to BASE_FROTH_MOST) and wells up, sweeping the foam out
   * from under it. The heave itself is the pond's: the ring's near field,
   * less the share the jet holds aloft (src/rings.js NEAR_FIELD).
   */
  startBase(base, water) {
    const froth = Math.min((base.speed / FROTH_SPEED) ** (2 * FROTH_POWER), BASE_FROTH_MOST);
    this.stampFoamPatch(water, foamRandom(base.x, base.z, base.time), { x: base.x, z: base.z, radius: base.radius, amount: Math.min(JET_BASE_BOIL * (base.boil ?? 1) * froth * Math.sqrt(base.radius / REFERENCE_RADIUS), FOAM_AMOUNT_CAP), reach: 1.0, radii: [0.3, 0.6], lifetime: BOIL_LIFETIME, boil: true, source: 'base' });
    water.addFoamFlow?.({ x: base.x, z: base.z, radius: CLOSURE_FLOW * base.radius, decay: FLOW_DECAY * Math.sqrt(base.radius / GRAVITY) });
  }

  retireColumn(column) {
    if (column.ringSource?.source) column.ringSource.source.aloft = 0;   // its water is back in the pond (fallBack)
    this.particleScene.remove(column.mesh);
    column.dispose();
    this.columns.splice(this.columns.indexOf(column), 1);
  }

  /**
   * The water as a column meets it: src/jet.js touches the water only when
   * the column falls back, with the mound's splats and its foam, which
   * fallBackFoam stamps the splash's way. The mound's height splat passes
   * straight through to the solver; its secondary ring (the splat with a
   * velocity) goes nowhere: the stone's ring (stampCavity) is fitted to the
   * reference simulation's whole ring, which the jet's fall-back is part of,
   * so the ring does not hang on the jet the throw drew.
   */
  columnWater(column, water) {
    const addSplat = (splat) => (splat.velocity ? false : water.addSplat(splat));
    return { addSplat, addFoam: (foam) => this.fallBackFoam(column, foam, water) };
  }

  /**
   * Where a column falls back (its `foam`: the place, the mound's reach and
   * how much it fell): a boil as a patch, and the mound spreading, a flow
   * that sweeps it and whatever floats there outward into a ring.
   */
  fallBackFoam(column, foam, water) {
    const random = foamRandom(foam.x, foam.z, this.time);
    this.stampFoamPatch(water, random, { x: foam.x, z: foam.z, radius: foam.radius, amount: Math.min(foam.amount, FALLBACK_BOIL_CAP), reach: FALLBACK_REACH, radii: [0.3, 0.6], lifetime: BOIL_LIFETIME, boil: true, source: 'fallBack' });
    water.addFoamFlow?.({ x: foam.x, z: foam.z, radius: FALLBACK_FLOW * column.radius, decay: FLOW_DECAY * Math.sqrt(column.radius / GRAVITY) });
  }

  /**
   * Foam as a patch rather than one round Gaussian: three to five sub-stamps
   * of radius times radii[0] to radii[1], at random offsets up to
   * reach·radius from (x, z), peaks of 0.4 to 1 times `amount`, drawn from
   * `random`; a boil or a raft of the given lifetime. They come at `time`
   * (now if it has passed), the later ones spread over `span` seconds after:
   * a long span gets one more sub-stamp per FOAM_STAMP_SPACING, the amount
   * shared among them all, so the foam arrives as the air does; or, if
   * `sustained`, each with the whole of it, as air that comes up at that
   * rate for the whole span.
   */
  stampFoamPatch(water, random, { x, z, radius, amount, reach, radii, lifetime, boil = false, time = this.time, span = 0, sustained = false, source }) {
    const pieces = 3 + Math.floor(random() * 3);
    const count = pieces + Math.floor(span / FOAM_STAMP_SPACING);
    const share = sustained ? 1 : pieces / count;
    for (let piece = 0; piece < count; piece++) {
      const angle = random() * Math.PI * 2;
      const distance = reach * radius * Math.sqrt(random());
      // `source` names the stamper for the probes' accounting (tools/splash-probe.mjs); the water ignores it.
      const foam = {
        x: x + Math.cos(angle) * distance, z: z + Math.sin(angle) * distance,
        radius: radius * (radii[0] + (radii[1] - radii[0]) * random()), amount: amount * share * (0.4 + 0.6 * random()), lifetime, boil, source,
      };
      const at = time + span * piece / (count - 1);
      if (at > this.time) this.foamStamps.push({ time: at, foam }); else water.addFoam(foam);
    }
  }

  /**
   * `count` foam specks in rafts over the ring between two radii around (x,
   * z), drifting outward at up to `driftSpeed` m/s, surfacing over `span`
   * seconds from now (src/foamSpecks.js spawnPatch).
   */
  spawnFoamSpecks(x, z, innerRadius, outerRadius, count, driftSpeed, span = 0) {
    this.foamSpecks.spawnPatch(x, z, innerRadius, outerRadius, count, this.time, driftSpeed, span);
  }

  /**
   * `lens`: draw the drop as glass like the jet column it came from
   * (unblurred, refracting). `lump`: it may be bigger than DROP_CEILING (the
   * jet's lumps, which the air tears in flight: Lumps above); otherwise no
   * drop is, the sheets break bigger lumps up themselves (src/crown.js
   * breakLump), and this clips whatever else would be.
   */
  spawnDroplet(x, y, z, vx, vy, vz, radius, lens = false, lump = false) {
    if (this.count >= this.capacity) return;
    if (radius > DROP_CEILING && !lump) radius = DROP_CEILING;
    const i = this.count++;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx; this.velocities[i * 3 + 1] = vy; this.velocities[i * 3 + 2] = vz;
    this.radii[i] = radius;
    this.ages[i] = 0;
    this.lenses[i] = lens ? 1 : 0;
  }

  removeDroplet(i) {
    const last = --this.count;
    if (i !== last) {
      for (let c = 0; c < 3; c++) {
        this.positions[i * 3 + c] = this.positions[last * 3 + c];
        this.velocities[i * 3 + c] = this.velocities[last * 3 + c];
      }
      this.radii[i] = this.radii[last];
      this.ages[i] = this.ages[last];
      this.lenses[i] = this.lenses[last];
    }
  }

  spawnBubble(x, y, z, vx, vy, vz, size) {
    if (this.bubbleCount >= this.bubbleCapacity) return;
    const i = this.bubbleCount++;
    this.bubblePositions[i * 3] = x; this.bubblePositions[i * 3 + 1] = y; this.bubblePositions[i * 3 + 2] = z;
    this.bubbleVelocities[i * 3] = vx; this.bubbleVelocities[i * 3 + 1] = vy; this.bubbleVelocities[i * 3 + 2] = vz;
    this.bubbleSizes[i] = size;
    this.bubblePhases[i] = Math.random() * Math.PI * 2;
  }

  removeBubble(i) {
    const last = --this.bubbleCount;
    if (i !== last) {
      for (let c = 0; c < 3; c++) {
        this.bubblePositions[i * 3 + c] = this.bubblePositions[last * 3 + c];
        this.bubbleVelocities[i * 3 + c] = this.bubbleVelocities[last * 3 + c];
      }
      this.bubbleSizes[i] = this.bubbleSizes[last];
      this.bubblePhases[i] = this.bubblePhases[last];
    }
  }

  /**
   * The step the stones are stepped with (src/main.js: PHYSICS_STEP), which
   * a cavity traces its stone's path in, when the splash's own steps are not
   * it (src/main.js brings the splash to each of the stones' steps in pieces).
   */
  setStoneStep(seconds) { this.stoneStep = seconds; }

  /** Advance droplets and bubbles by dt seconds, feeding the water surface. */
  update(dt, water) {
    this.time += dt;
    this.substep = this.stoneStep ?? dt;

    // Scheduled jets start their columns, and an oblique entry's cavity
    // reaches on as the stone moves along.
    for (const jet of this.jets) if (this.time >= jet.start) this.startJet(jet, water);
    this.jets = this.jets.filter((jet) => this.time < jet.start);
    for (const wake of this.wakes) if (this.time >= wake.start) this.stampCavity(wake, water);
    this.wakes = this.wakes.filter((wake) => this.time < wake.start);
    for (const ring of this.poolRings) if (this.time >= ring.time) this.releasePoolRing(ring, water);
    this.poolRings = this.poolRings.filter((ring) => this.time < ring.time);
    for (const stamp of this.foamStamps) if (this.time >= stamp.time) water.addFoam(stamp.foam);
    this.foamStamps = this.foamStamps.filter((stamp) => this.time < stamp.time);
    for (const base of this.bases) if (this.time >= base.time) this.startBase(base, water);
    this.bases = this.bases.filter((base) => this.time < base.time);
    for (const cavity of this.cavities) cavity.update(this.time);
    for (const cavity of this.cavities.filter((candidate) => candidate.finished)) this.retireCavity(cavity);

    // Bubble plumes, in swarms (BUBBLE_SWARM): a swarm's bubbles are of like
    // size and share a drift, so they rise together and surface as a clump.
    for (const plume of this.plumes) {
      const phase = Math.min((this.time - plume.start) / plume.duration, 1);
      const shouldHave = Math.round(plume.total * phase);
      while (plume.spawned < shouldHave) {
        const depth = plume.depth * (0.1 + 0.9 * Math.random()) * phase;
        const angle = Math.random() * Math.PI * 2;
        const offset = Math.random() * 0.05 * (0.3 + depth) * plume.spread;
        const swarmX = plume.x + Math.cos(angle) * offset + plume.driftX * depth, swarmZ = plume.z + Math.sin(angle) * offset + plume.driftZ * depth;
        const swarmSize = 0.0006 + 0.0022 * Math.random() ** 2;
        const driftX = randomRange(-0.05, 0.05), driftZ = randomRange(-0.05, 0.05);
        const swarm = Math.min(shouldHave - plume.spawned, 1 + Math.floor(Math.random() * BUBBLE_SWARM));
        for (let member = 0; member < swarm; member++) {
          const scatterAngle = Math.random() * Math.PI * 2, scatter = BUBBLE_SWARM_SPREAD * Math.sqrt(Math.random());
          this.spawnBubble(
            swarmX + Math.cos(scatterAngle) * scatter, -depth - BUBBLE_SWARM_SPREAD * (Math.random() - 0.5), swarmZ + Math.sin(scatterAngle) * scatter,
            driftX + randomRange(-0.01, 0.01), randomRange(0.10, 0.32), driftZ + randomRange(-0.01, 0.01),
            swarmSize * randomRange(0.75, 1.25),
          );
          plume.spawned++;
        }
      }
    }
    this.plumes = this.plumes.filter((plume) => plume.spawned < plume.total);

    // Droplets.
    const landings = [];
    for (let i = this.count - 1; i >= 0; i--) {
      const p = i * 3;
      let vx = this.velocities[p], vy = this.velocities[p + 1], vz = this.velocities[p + 2];
      const radius = this.radii[i];
      const speed = Math.hypot(vx, vy, vz);
      if (radius > DROP_CEILING && (AIR_DENSITY * speed * speed * 2 * radius) / WATER_SURFACE_TENSION >= WEBER_CRITICAL) {
        // The air tears the lump (Lumps above): its pieces fly on from where it is, on its own stream.
        const lump = this.lumpScratch ??= { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        lump.x = this.positions[p]; lump.y = this.positions[p + 1]; lump.z = this.positions[p + 2]; lump.vx = vx; lump.vy = vy; lump.vz = vz;
        this.removeDroplet(i);
        breakLump(lump, radius, LUMP_BREAK.largest * radius, LUMP_BREAK.pieces, radius, Math.sqrt(WATER_SURFACE_TENSION / (WATER_DENSITY_LUMPS * radius)), seededRandom(lump.x, lump.z, this.time, radius),
          (pieceX, pieceY, pieceZ, pieceVX, pieceVY, pieceVZ, piece) => this.spawnDroplet(pieceX, pieceY, pieceZ, pieceVX, pieceVY, pieceVZ, piece, true, piece > DROP_CEILING));
        continue;
      }
      const drag = Math.min(0.00027 / radius * speed * dt, 0.5);
      vx -= vx * drag; vy -= vy * drag; vz -= vz * drag;
      vy -= GRAVITY * dt;
      let x = this.positions[p] + vx * dt;
      const y = this.positions[p + 1] + vy * dt;
      let z = this.positions[p + 2] + vz * dt;
      this.ages[i] += dt;
      // The pool's walls and deck (setGround): off a wall's side back into the pool, or down on the deck. Which is told by
      // its height where it crossed the wall's line, not where it ended: one that crossed above the deck went over the
      // coping, even if it ends the step below it, and one rising past the deck's top in the step crossed below it.
      if (this.ground) {
        const { square, deck } = this.ground;
        const maxX = square.minX + square.size, maxZ = square.minZ + square.size;
        const inside = (pointX, pointZ) => pointX > square.minX && pointX < maxX && pointZ > square.minZ && pointZ < maxZ;
        const previousX = this.positions[p], previousY = this.positions[p + 1], previousZ = this.positions[p + 2];
        const was = inside(previousX, previousZ);
        if (!inside(x, z)) {
          let crossing = 1;   // the fraction of the step at which it first crossed a wall's line
          if (was) {
            if (x <= square.minX) crossing = Math.min(crossing, (square.minX - previousX) / (x - previousX));
            if (x >= maxX) crossing = Math.min(crossing, (maxX - previousX) / (x - previousX));
            if (z <= square.minZ) crossing = Math.min(crossing, (square.minZ - previousZ) / (z - previousZ));
            if (z >= maxZ) crossing = Math.min(crossing, (maxZ - previousZ) / (z - previousZ));
          }
          if (was && previousY + (y - previousY) * crossing < deck) {
            // Its side, below its top: back off it, the axis it crossed turned and slowed.
            if (x <= square.minX || x >= maxX) { vx *= -DECK_DROPS.wall; x = THREE.MathUtils.clamp(x, square.minX + 1e-4, maxX - 1e-4); }
            if (z <= square.minZ || z >= maxZ) { vz *= -DECK_DROPS.wall; z = THREE.MathUtils.clamp(z, square.minZ + 1e-4, maxZ - 1e-4); }
          } else if (y <= deck) {
            // Down on the deck, over the coping or from above it (or begun inside the paving, where nothing shows): it
            // lands, and wets it.
            if (vy < 0 && (was || previousY >= deck)) this.landOn(deck, this.ground.onWet, x, z, radius, vx, vy, vz);
            this.removeDroplet(i);
            continue;
          }
        }
      }
      // Down on the ice (setIce): it lands there, out of the water, as on the deck: it wets it; it rings nothing and leaves no foam.
      if (this.ice && vy < 0 && y <= this.ice.top && this.ice.overWater(x, z) && !this.ice.holeAt(x, z)) {
        this.landOn(this.ice.top, this.wetIce, x, z, radius, vx, vy, vz);
        this.removeDroplet(i);
        continue;
      }
      if ((y <= 0 && vy < 0) || this.ages[i] > 6) {
        if (y <= 0 && radius > Math.min(LANDING_SPLAT_RADIUS, DROP_RING.least)) landings.push({ x, z, radius, fallSpeed: -vy, speed: Math.sqrt(vx * vx + vy * vy + vz * vz), velocityX: vx, velocityZ: vz, flight: this.ages[i] });
        this.removeDroplet(i);
        continue;
      }
      this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
      this.velocities[p] = vx; this.velocities[p + 1] = vy; this.velocities[p + 2] = vz;
    }

    // Falling drops ring the surface again: the biggest first, each its
    // capillary rings (src/dropRings.js, on open water only: not the beach).
    // One bigger than LANDING_SPLAT_RADIUS also pushes its bump into the
    // solver (at most LANDING_SPLATS a step); a big one throws a crown of its
    // own, or failing that a few secondary droplets, and each leaves a few
    // foam specks by its size.
    landings.sort((a, b) => b.radius - a.radius);
    if (water.dropRings) for (const hit of landings) if (!(water.floorDepthAt?.(hit.x, hit.z) <= 0)) water.dropRings.add(hit, this.time);
    let landingCrowns = 0;
    if (landings.length > 0) for (const crown of this.crowns) if (crown.landing) landingCrowns++;
    for (let n = 0; n < landings.length && n < LANDING_SPLATS && landings[n].radius > LANDING_SPLAT_RADIUS; n++) {
      const hit = landings[n];
      const strength = Math.min(hit.radius / 0.005, 2) * Math.min(hit.fallSpeed / 4, 1.5);
      water.addSplat({ x: hit.x, z: hit.z, radius: Math.max(hit.radius * 3, 0.015), velocity: -0.22 * strength, rim: 1.6 });
      const crowned = hit.radius >= LANDING_CROWN_RADIUS && landingCrowns < MAX_LANDING_CROWNS && hit.flight >= LANDING_CROWN_FLIGHT && hit.fallSpeed >= LANDING_CROWN_SPEED;
      if (crowned) {
        this.startLandingCrown(hit);
        landingCrowns++;
      }
      if (hit.radius >= LANDING_CROWN_RADIUS) {
        water.addFoam({ x: hit.x, z: hit.z, radius: hit.radius * 3, amount: LANDING_FOAM * strength, lifetime: LANDING_FOAM_LIFETIME, boil: true, source: 'landing' });
        const sprayCount = crowned ? 0 : Math.random() < LANDING_KICK_CHANCE ? 1 + Math.floor(Math.random() * LANDING_KICK_MOST) : 0;
        for (let s = 0; s < sprayCount; s++) {
          const angle = Math.random() * Math.PI * 2;
          const out = randomRange(0.2, 0.9) * Math.min(hit.fallSpeed / 3, 1.5);
          this.spawnDroplet(hit.x, 0.003, hit.z, Math.cos(angle) * out, randomRange(0.5, 1.8) * Math.min(hit.fallSpeed / 3, 1.5), Math.sin(angle) * out, Math.min(hit.radius * randomRange(0.3, 0.5), DROP_CEILING));
        }
      }
      const specks = Math.min(Math.floor((hit.radius - LANDING_SPECK_FREE) / LANDING_SPECK_STEP + Math.random()), LANDING_SPECK_MOST);
      if (specks > 0) this.spawnFoamSpecks(hit.x, hit.z, 0, 2 * hit.radius, specks, 0.02);
    }

    // Crown sheets shed from the rim and tear; their droplets are placed where
    // the sheet is now, so they are not integrated until the next substep.
    for (const crown of this.crowns) crown.update(this.time, dt, this);
    for (const crown of this.crowns.filter((candidate) => candidate.finished)) this.retireCrown(crown);

    // Jet columns pinch off their tips, break up and fall back, the same way.
    for (const column of this.columns) column.update(this.time, dt, this, this.columnWater(column, water));
    for (const column of this.columns.filter((candidate) => candidate.finished)) this.retireColumn(column);
    // Each ring's source learns the share of its jet's water aloft: the heave under the jet is the ring's less
    // NEAR_FIELD.jet times it (src/rings.js); two jets on one source (stones thrown together) hand it the larger.
    for (const column of this.columns) if (column.ringSource?.source) column.ringSource.source.aloft = 0;
    for (const column of this.columns) if (column.ringSource?.source) column.ringSource.source.aloft = Math.max(column.ringSource.source.aloft, column.aloftShare(this.time - column.startTime));

    // Bubbles rise, wobble and burst at the surface.
    for (let i = this.bubbleCount - 1; i >= 0; i--) {
      const p = i * 3;
      const size = this.bubbleSizes[i];
      const rise = THREE.MathUtils.clamp(size * 90, 0.08, 0.32);
      this.bubbleVelocities[p + 1] += (rise - this.bubbleVelocities[p + 1]) * Math.min(dt * 3, 1);
      const wobble = Math.sin(this.time * 9 + this.bubblePhases[i]) * 0.03;
      const x = this.bubblePositions[p] + (this.bubbleVelocities[p] + wobble) * dt;
      const y = this.bubblePositions[p + 1] + this.bubbleVelocities[p + 1] * dt;
      const z = this.bubblePositions[p + 2] + (this.bubbleVelocities[p + 2] - wobble) * dt;
      if (y >= -0.002) {
        if (Math.random() < 0.3) water.addFoam({ x, z, radius: 0.012, amount: BUBBLE_FOAM, lifetime: BOIL_LIFETIME, boil: true, source: 'bubble' });
        // A surfacing bubble floats for a while as a speck its own size (1.2 to 5.6 mm across).
        this.foamSpecks.spawn(x, z, randomRange(-0.004, 0.004), randomRange(-0.004, 0.004), this.time, 2 * size);
        this.removeBubble(i);
        continue;
      }
      this.bubblePositions[p] = x; this.bubblePositions[p + 1] = y; this.bubblePositions[p + 2] = z;
    }

    this.instancePositions.needsUpdate = true;
    this.instanceRadii.needsUpdate = true;
    this.instanceVelocities.needsUpdate = true;
    this.instanceLenses.needsUpdate = true;
    this.particleGeometry.instanceCount = this.count;
    this.bubblePositionAttribute.needsUpdate = true;
    this.bubbleSizeAttribute.needsUpdate = true;
    this.bubblePoints.geometry.setDrawRange(0, this.bubbleCount);
    this.foamSpecks.commit(this.time);
    this.spray.commit(this.time);
  }

  // ---- rendering --------------------------------------------------------

  /**
   * The most drops a stone's crown may throw (the preset's crownDrops, at
   * most CROWN_DROPLET_CAP): a big stone's sheet, broken into drops of
   * DROP_CEILING and under, loses whatever water it has no drops left for.
   * Takes effect from the next throw.
   */
  setCrownDropletCap(count) {
    this.crownDropletCap = Math.min(Math.max(Math.round(count), 50), CROWN_DROPLET_CAP);
  }

  /**
   * The fluid targets for a canvas of width × height device pixels at
   * fluidScale of its resolution. The info target is half float (src/shaders/
   * fluid.js says what that keeps of it: a column's roundness only as 0 or 1,
   * which changes a few pixels where the jet's bulb meets its column).
   */
  resize(width, height, fluidScale) {
    this.fluidScale = fluidScale;
    const w = Math.max(2, Math.round(width * fluidScale));
    const h = Math.max(2, Math.round(height * fluidScale));
    if (this.targets) Object.values(this.targets).forEach((t) => t.dispose());
    this.targets = {
      info: createFloatTarget(w, h, { type: THREE.HalfFloatType, depth: true }),
      optics: createFloatTarget(w, h, { type: THREE.HalfFloatType, filter: THREE.LinearFilter }),
    };
    this.fluidSize = new THREE.Vector2(w, h);
  }

  /**
   * Bring the cavities to the current time and hand the surface the circles
   * its patch dips from: once per rendered frame, before the main scene is
   * drawn (main.js calls it; prepareFrame does if it has not been).
   */
  prepareScene() {
    if (this.sceneTime === this.time) return;
    this.sceneTime = this.time;
    const shapes = [];
    for (const cavity of this.cavities) {
      cavity.walls = this.walls;
      cavity.updateGeometry(this.time);
      const shape = cavity.pushShape();
      if (shape) shapes.push(shape);
    }
    this.surface?.setCavities(shapes);
  }

  /**
   * Bring the cavities, crown sheets and jet columns to the current time and
   * list what the mirror draws: once per rendered frame, before the mirror
   * pass, not per substep.
   */
  prepareFrame() {
    this.prepareScene();
    // In the pool the sheets and columns run up its walls (holdWithinWalls).
    for (const crown of this.crowns) { crown.walls = this.walls; crown.updateGeometry(this.time); }
    for (const column of this.columns) { column.walls = this.walls; column.updateGeometry(this.time); }
    // The beads on the crowns' fingertips (src/crown.js) are drawn as droplets
    // after the ones in flight, which are not stepped past `count`.
    let beads = 0;
    for (const crown of this.crowns) beads += crown.beadsInto(this, this.count + beads);
    if (beads > 0) {
      this.instancePositions.needsUpdate = true;
      this.instanceRadii.needsUpdate = true;
      this.instanceVelocities.needsUpdate = true;
      this.instanceLenses.needsUpdate = true;
    }
    const drawn = this.count + beads;
    this.particleGeometry.instanceCount = drawn;
    this.particleMesh.visible = drawn > 0;
    const list = this.mirrorList;
    list.length = 0;
    // The droplets join only while one is big enough to see in the mirror; off
    // the mirror layer otherwise, since the mirror pass draws what is on it.
    let mirroredDrops = false;
    for (let index = 0; index < drawn && !mirroredDrops; index++) mirroredDrops = this.radii[index] >= MIRROR_DROP_RADIUS;
    if (mirroredDrops) {
      this.particleMesh.layers.enable(MIRROR_LAYER);
      list.push(this.particleMesh);
    } else {
      this.particleMesh.layers.disable(MIRROR_LAYER);
    }
    if (this.spray.alive && this.spray.mirrored(this.time)) {
      this.spray.mesh.layers.enable(MIRROR_LAYER);
      list.push(this.spray.mesh);
    } else {
      this.spray.mesh.layers.disable(MIRROR_LAYER);
    }
    for (const crown of this.crowns) list.push(mirrorWith(crown.mesh, this.sheetMirror));
    for (const column of this.columns) list.push(mirrorWith(column.mesh, this.columnMirror));
  }

  /** What is alive to be mirrored this frame (after prepareFrame): objects tagged by mirrorWith. Empty when the splash is over. */
  mirrorObjects() { return this.mirrorList; }

  /** Grow `box` around the droplets in the air that the mirror draws (their centres). */
  dropletBounds(box) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const positions = this.positions;
    for (let index = 0; index < this.count * 3; index += 3) {
      if (this.radii[index / 3] < MIRROR_DROP_RADIUS) continue;
      const x = positions[index], y = positions[index + 1], z = positions[index + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (minX <= maxX) box.union(this.dropletBox.set(this.dropletMin.set(minX, minY, minZ), this.dropletMax.set(maxX, maxY, maxZ)));
  }

  /** The world box around everything mirrorObjects() draws, padded by MIRROR_PAD. */
  mirrorBounds(box) {
    box.makeEmpty();
    for (const object of this.mirrorList) {
      if (object.userData.mirrorBounds) { object.userData.mirrorBounds(box); continue; }
      object.geometry.computeBoundingBox();
      box.union(this.dropletBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
    }
    if (!box.isEmpty()) box.expandByScalar(MIRROR_PAD);
    return box;
  }

  /** The mirror pass's view (its camera and the height of its target in pixels), before it draws mirrorObjects(). */
  setMirrorView(mirrorCamera, height) {
    const projScale = mirrorCamera.projectionMatrix.elements[5] * height * 0.5;
    // The distance materials share these uniform objects.
    for (const drop of [this.dropMirror.colour.uniforms, this.sprayMirror.colour.uniforms]) {
      drop.uProjScale.value = projScale;
      drop.uStreakSeconds.value = this.streakSeconds;
      drop.uSunDirView.value.copy(this.lighting.sunDirection).transformDirection(mirrorCamera.matrixWorldInverse);
    }
    this.columnMirror.colour.uniforms.uProjScale.value = projScale;
  }

  setPassMaterials(particleMaterial, sheetMaterial, columnMaterial, sprayMaterial) {
    this.particleMesh.material = particleMaterial;
    this.spray.mesh.material = sprayMaterial;
    for (const crown of this.crowns) crown.mesh.material = sheetMaterial;
    for (const column of this.columns) column.mesh.material = columnMaterial;
  }

  /** The scene tone-mapped to the canvas (or target), with no water in the air. */
  toneMap(renderer, sceneTarget, output = null) {
    this.toneMapPass.material.uniforms.uScene.value = sceneTarget.texture;
    this.toneMapPass.material.uniforms.uExposure.value = this.lighting.exposure;
    this.toneMapPass.material.uniforms.uNight.value = this.lighting.night ?? 0;
    this.toneMapPass.render(renderer, output);
  }

  /** Draw droplets, spray, crown sheets and jet columns over the finished scene and present the frame to the canvas (or target). After prepareFrame. */
  render(renderer, camera, sceneTarget, output = null) {
    if (this.count === 0 && !this.spray.alive && this.crowns.length === 0 && this.columns.length === 0) {
      // Nothing in the air: no fluid pass, no clear, no read of their targets.
      this.toneMap(renderer, sceneTarget, output);
      return;
    }
    const { info, optics } = this.targets;
    const projScale = camera.projectionMatrix.elements[5] * this.fluidSize.y * 0.5;
    this.sunDirView.copy(this.lighting.sunDirection).transformDirection(camera.matrixWorldInverse);
    const spray = this.spray;
    for (const material of [this.depthMaterial, this.thicknessMaterial, spray.depthMaterial, spray.thicknessMaterial]) {
      material.uniforms.uProjScale.value = projScale;
      material.uniforms.uStreakSeconds.value = this.streakSeconds;
      material.uniforms.uSunDirView.value.copy(this.sunDirView);
      material.uniforms.uHazeRadius.value = HAZE_RADIUS * this.fluidScale;
    }
    for (const material of [this.columnDepthMaterial, this.columnThicknessMaterial]) material.uniforms.uProjScale.value = projScale;
    for (const material of [this.depthMaterial, this.thicknessMaterial, spray.depthMaterial, spray.thicknessMaterial, this.sheetDepthMaterial, this.sheetThicknessMaterial, this.columnDepthMaterial, this.columnThicknessMaterial]) {
      material.uniforms.uSceneDepth.value = sceneTarget.depthTexture;
      material.uniforms.uResolution.value.copy(this.fluidSize);
    }
    renderer.setClearColor(0x000000, 0);
    this.setPassMaterials(this.depthMaterial, this.sheetDepthMaterial, this.columnDepthMaterial, spray.depthMaterial);
    renderer.setRenderTarget(info);
    renderer.clear(true, true, false);
    renderer.render(this.particleScene, camera);

    this.setPassMaterials(this.thicknessMaterial, this.sheetThicknessMaterial, this.columnThicknessMaterial, spray.thicknessMaterial);
    renderer.setRenderTarget(optics);
    renderer.clear(true, false, false);
    renderer.render(this.particleScene, camera);

    const composite = this.compositePass.material.uniforms;
    composite.uScene.value = sceneTarget.texture;
    composite.uFluidInfo.value = info.texture;
    composite.uOptics.value = optics.texture;
    composite.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    composite.uCameraWorld.value.copy(camera.matrixWorld);
    composite.uSunDirView.value.copy(this.sunDirView);
    composite.uExposure.value = this.lighting.exposure;
    composite.uNight.value = this.lighting.night ?? 0;
    composite.uFluidScale.value = this.fluidScale;
    composite.uProjScale.value = projScale;
    this.compositePass.render(renderer, output);
  }

  /**
   * The simulated length of the frame about to be stepped, given before its
   * substeps: the crown's tear and the jet's breakup advance once per frame,
   * and the motion streaks follow it (shutter ≈ half a frame).
   */
  setFrameSeconds(seconds) {
    this.frameSeconds = seconds;
    this.frameEnd = this.time + seconds;
    this.streakSeconds = seconds * 0.5;
  }

  /** After the sky changes the sun (src/sky.js): the sand's light that the splash's water sees the pond's floor by. */
  updateLighting() {
    const uniforms = this.compositePass.material.uniforms;
    uniforms.uFloorLight.value.copy(floorLight(this.lighting, uniforms.uPondDepth.value, this.bedAlbedo));
  }

  /**
   * A drop come down on ground `height` high (the pool's deck, setGround;
   * the ice, setIce): wet where it fell (`onWet(x, z, radius)`), and a big
   * one splattering a few small drops back up off it.
   */
  landOn(height, onWet, x, z, radius, vx, vy, vz) {
    onWet?.(x, z, Math.max(radius * DECK_DROPS.wetSpread, DECK_DROPS.wetLeast));
    if (radius < DECK_DROPS.splatterFrom) return;
    const count = 1 + Math.floor(Math.random() * DECK_DROPS.splatter);
    const fall = -vy;
    for (let drop = 0; drop < count; drop++) {
      const angle = Math.random() * Math.PI * 2, out = randomRange(0.15, 0.5) * fall;
      this.spawnDroplet(x, height + 0.002, z, 0.3 * vx + Math.cos(angle) * out, randomRange(0.15, 0.4) * fall, 0.3 * vz + Math.sin(angle) * out, Math.min(radius * randomRange(0.25, 0.45), DROP_CEILING));
    }
  }

  /**
   * The ice over the water (src/ice.js IceSheet, while it is on; else null):
   * a drop that comes down on it, not in a hole, lands there as on the deck,
   * wetting it (src/ice.js wetSpot) and, if big, splattering.
   */
  setIce(sheet) {
    this.ice = sheet?.on ? sheet : null;
    this.wetIce = this.ice ? (x, z, radius) => this.ice.wetSpot(x, z, radius) : null;
  }

  /**
   * The ground round the water the drops can meet (null: none, the lake):
   * a pool's `square` and its `deck`'s height (src/pool.js). A drop that
   * meets a wall's side below its top comes back off it (DECK_DROPS.wall of
   * its speed across it) into the pool; one that comes down on the deck lands
   * there, a big one splattering (DECK_DROPS.splatter), and `onWet(x, z,
   * radius)` marks the paving wet where it fell.
   */
  setGround(ground) {
    this.ground = ground;
    const square = ground?.square;
    const inset = DECK_DROPS.wallInset;
    this.walls = square ? { minX: square.minX + inset, maxX: square.minX + square.size - inset, minZ: square.minZ + inset, maxZ: square.minZ + square.size - inset } : null;
  }

  /** The bed the splash's water sees through its drops: its depth (m) and albedo (the lake's sand by default; a pool's tiles, src/main.js). */
  setBed({ depth, albedo = SAND_ALBEDO }) {
    this.bedAlbedo = albedo;
    this.compositePass.material.uniforms.uPondDepth.value = depth;
    this.updateLighting();
  }

  /**
   * After the camera's projection changes: the bubbles' and foam specks'
   * sizes on screen. height: the main pass's in device pixels; underHeight:
   * the under-water pass's, which draws the bubbles.
   */
  updateViewUniforms(camera, height, pixelRatio, underHeight = height) {
    this.bubbleMaterial.uniforms.uProjScale.value = camera.projectionMatrix.elements[5] * underHeight * 0.5;
    this.foamSpecks.setView(camera, height, pixelRatio);
  }
}
