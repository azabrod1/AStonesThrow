// The crown: the thin sheet of water a stone throws up as it enters.
//
// The sheet is material launched continuously from a ring around the stone,
// each ring element then flying on its own. Surface tension and air slow a
// real sheet's rim fast (which is why crowns never reach the height their
// launch speed implies), modelled as a velocity decaying as exp(−age/τd) with
// τd = CROWN_DRAG = 0.085 s for a 3 cm stone's crown (0.05 s for a landing
// drop's crown and the fan; see the scaling below) while gravity acts
// undamped. So the whole sheet is a closed form in launch time tau, azimuth
// theta and the crown's age t; with a = t − tau,
//
//   position = launch point + u·direction·τd·(1 − exp(−a/τd)) − ½·g·a²·up
//
// With stone radius R and entry speed V the main launch lasts
// T = max(1.2·R/V, 0.01) s. Over it a stone's crown leaves at CROWN_SPEED, from
// 0.36·V down to 0.26·V, and CROWN_TILT, from 18° to 12° from vertical: a
// tall, nearly upright wall, the rim first, as the reference simulation's
// (tools/basilisk: a 3 cm stone straight in at 6.3 m/s throws a crown 11 to
// 12 cm high at 0.1 s, its rim 8 to 10 cm out, in air ten times lighter than
// real; τd is a little shorter than its fit for real air). After T a tail
// keeps feeding the wall at 0.26·V·exp(−(tau − T)/(0.45·T)) for TAIL_FEED·T,
// so the base stays on the water. The tail leaves the ring at 0.6·h0, so the
// foot stays light. A landing drop's crown launches from 0.55·V to 0.2·V at
// 55° to 25° from vertical, and its tail at 0.2·V, feeding while it lives.
//
// The ring a stone's sheet launches from is the lip of its cavity (`rim`,
// src/cavity.js): each element leaves from where the lip's crest was at its
// launch time, from the mouth's centre then (which an oblique stone drags
// forward as it goes in), at the crest's radius at that azimuth (at least
// RIM_RING_START·R, the contact line's first ejecta) and the crest's height.
// So the sheet stands on the lip, and its base rises and widens with the lip;
// once the mouth starts to close, the base stays where the crest was widest,
// on the lip's outer slope, while the hole closes inside it. The funnel's
// mouth keeps widening long after the main launch (to 3·R and more), and it
// carries the sheet's foot out with it: a stone crown's material stands where
// the lip is now rather than where it left, by a share growing over its launch
// (CARRY: the rim not at all, the tail all of it), and never sinks below the
// lip, so the wall stands on the lip and leans in towards its rim, as the
// reference's does. Its base row rides the surface's waves as the lip does
// (aRide).
// A sheet with no cavity (a landing drop's crown) launches from a ring
// widening from 0.9·R to 1.4·R over T and by 0.2·R per T after it (up to 2·R).
//
// Around the ring the launch speed u varies in two ways. Slowly, by 1 + Σ
// a_k·cos(k·theta + phase_k) over modes k = 5…9 for a 3 cm stone, random a_k
// in [0.025, 0.05] (some crowns lean into three or four petals). And at the
// rim, in fingers: the rim of a decelerating sheet is unstable
// (Rayleigh–Taylor, then Rayleigh–Plateau along its bead) and grows narrow
// ligaments, each ending in a bead that swells and pinches off as a drop,
// between shallow arcs of rim. FINGERS fingers for a 3 cm stone, about evenly
// spaced (each spacing off the mean by up to FINGER_JITTER of it), each
// FINGER_WIDTH of the mean spacing wide either side of its axis at its root:
// the rim's material there (launched within FINGER_ROOT·T of the rim) flies
// faster by L·(1 − |x|^FINGER_SQUARENESS)^FINGER_POWER (x across the finger,
// −1 to 1 root to root; L from 0.6 to 1 times FINGER_LENGTH, finger by
// finger), so a finger grows out of the rim as the sheet flies, a tongue with
// steep sides and a round end whose root merges into the sheet below (its
// columns crowd where its sides turn, FINGER_SPOTS); across an arc between
// two, the rim's material is slower by ARC_SAG·sin(π·s) (s from one root to
// the next), a shallow scallop. The fingers' spacing is the Rayleigh–Taylor
// wavelength of the decelerating rim, ∝ sqrt(σ/(ρ·a)), and the deceleration a
// ∝ u/τd goes as 1/R, so the spacing grows as sqrt(R) while the rim's length
// grows as R: a stone s = R / 3 cm times the size has sqrt(s) times as many
// fingers (24 for a 16 cm stone, 12 for a 4 cm one). The slow modes are
// stretched by sqrt(s) too (every whole number in the stretched span) and
// their amplitudes divided by the square root of how many there are against
// the 3 cm stone's. The grid's columns are laid out by finger, FINGER_SPOTS
// across each finger and ARC_COLUMNS inside each arc, so a finger is resolved,
// round, at any size.
// A landing drop's crown and the forward fan keep a sum of modes for their
// rims (a landing crown's k = 5…9 and 12…18 alike, the fan's FAN_MODES),
// faster elements flying further into a wavy rim whose crests shed the rim's
// drops.
// Beads. A finger's tip gathers a bead: its volume grows as the finger feeds
// it, from BEAD_SEED of the drop it will shed (the rim's own thickening) to
// all of it. The drop is BEAD_RIM times the rim's thickness there then (a
// ligament pinches into drops about that big; within the sheet's drops' range,
// each off by up to BEAD_JITTER): on a 16 cm stone's crown beads of 2.5 to 7
// mm radius, which it sheds, sixty-odd before it tears; on a 3 cm stone's 1 to
// 2.5 mm, a few shed. It is drawn as a droplet at the tip
// (SplashSystem.prepareFrame takes them through beadsInto), so it is the round
// glass bead a drop is, on a finger shaded as a rod of water (aRod,
// src/shaders/sheet.js), its normal leaning across it (FINGER_LEAN). When the
// bead is whole it pinches off, a drop of its size flying on with the tip, and
// the next one starts. The rim's drops are shared among the fingers by length
// and come at a rate ramping up over the sheet's life (the instability grows);
// when the sheet tears every finger lets its bead go as it is.
// An oblique entry multiplies u by 1 + 0.45·forward (forward = cosine to the
// direction of travel times the horizontal fraction of the entry speed), thins
// the back side to match, and carries every element along at 0.22 of the
// horizontal entry velocity. A stone's crown is lopsided as the stone is
// (`lopsided`, chosen per throw by src/splash.js): a spinning stone drags the
// sheet up faster on the side its surface turns upward (Truscott & Techet
// 2009), multiplying u by 1 + spinX·cos θ + spinZ·sin θ (the rim's lift over
// the entry speed, at least 0.5), and a broad face going in first throws the
// sheet faster and lower, a point slower and steeper (speedScale on u,
// tiltShift degrees on the launch angle).
// A surface seal (`seal`, which src/splash.js gives a fast entry's crown):
// the air rushing into the hole behind the stone pulls the sheet in over it.
// A sealing crown has no fingers (a smooth rim of DOME_COLUMNS·sqrt(s)
// columns, the slow modes only) and launches DOME_TILT degrees nearer
// vertical. From DOME_PULL_START of its seal time a pull P (a smoothstep, 1
// at the seal time) draws every element onto a dome (pullIn): a smooth bell
// over the hole from the lip's crest to an apex DOME_HEIGHT·R above the still
// water (the reference's real-air runs close about 4 cm up: a low dome), the
// sheet's rim at the apex, its foot on the lip, buckled by a few folds around
// (Marston et al. 2016 find every sealing crown buckles). Its rim's bead
// merges as it closes. As the rim meets, a thin spike of water shoots up from
// the apex (sealSpray: the reference's seal jet) and breaks into fine drops.
// The dome holds still until the hole below pinches (seal.tear), then bursts
// from the apex down, its sheet flying off out and up (DOME_BURST): the tear.
// Its rim sheds before the pull starts, none while it closes, and the burst
// takes the rest.
//
// Thickness is h0·(r0/r)/(1 + age/td), at least 0.2 mm, with h0 = 1.5 mm and
// the drain time td = CROWN_DRAIN = 0.06 s for a 3 cm stone's crown (0.04 s
// for a landing crown and the fan): the sheet thins as it spreads
// around a widening circle and as it drains. The free edge (the material
// within ~8% of T of the rim, or of the tear front once it tears) is a bead
// three times the unstretched thickness h0/(1 + age/td), since an edge gathers
// what the stretching takes from the sheet; its normals are bent outward like
// a tube's so it catches the sun all along the edge.
//
// A stone's sheet tears once its rim stalls: STALL_SHARE times the age at
// which its first material's rising speed u·cos(tilt)·exp(−a/τd) falls to
// g·a (Newton's method, once), at least BREAK_FLOOR and at most
// BREAK_CEILING (60 and 150 ms, times R / 3 cm from 3 cm up); a landing
// crown's at LANDING_BREAK·T. It tears from the rim down to the water along a
// ragged front, over 0.6·t_break, the raggedness varying smoothly around the
// ring (three lobes and TEAR_MODES at random phases), so the torn edge is a
// curve; on a stone's crown the arcs between the fingers tear first and the
// fingers last, at the slowest pace, as a rim's webs open between its
// ligaments.
// The torn part becomes droplets that carry the local (decayed) sheet
// velocity, each holding the volume of the patch of sheet it came from, so the
// drops come out about the size the sheet's thickness implies, between
// CROWN_DROP_FLOOR and CROWN_DROP_CAP (1 and 5.5 mm) for a 3 cm stone; its
// fingers shed their beads, the fan's and a landing crown's crests drops of
// RIM_DROP_RADIUS and up. For a 3 cm stone dropped straight in at 6.3 m/s
// the sheet stands whole for 90 ms, its rim peaking 11 cm up at 90 ms, 8 cm
// out (the reference: 11 to 12 cm at 0.1 s, 8 to 10 cm out), and is gone by
// 150 ms; thrown at 42° from vertical its forward side stands taller, 13 to
// 19 cm.
//
// How a stone's sheet scales with its radius R, against s = R / 3 cm. Lengths
// go with R and speeds with the entry speed V, as in a Froude-scaled splash:
// the launch ring (0.9 to 1.4·R) and the launch window T ∝ R/V. The sheet's
// thickness goes with R too (h0 = 1.5 mm·s), and since the air and the rim's
// surface tension decelerate a sheet in inverse proportion to its thickness,
// so do its drag time τd = 0.085 s·s and its drain time td = 0.06 s·s, both
// floored at CROWN_SCALE_FLOOR times (τd 21 ms; the fan's at
// SHEET_SCALE_FLOOR). A thick sheet lasts: for
// stones of 3 cm and up the tear's floor and ceiling (60 and 150 ms) scale
// with s as well (smaller stones keep the 60 ms floor, which a 60 Hz frame
// needs). The launch speed does not change with R, so a big stone's rim flies
// nearly ballistic, up to u²/2g, and a small one's is held near u·τd: the rim's
// height grows about as R for small stones and more slowly for big ones. Its
// drops hold the volume of a sheet h0 thick over an area ∝ R² shared among a
// count ∝ s^1.6 (SplashSystem.impact), so their radii, the caps on them
// included, go as s^DROP_SIZE_POWER (s^0.47 by that count). Thrown at about
// 6.3 m/s, 42° from vertical and sealing deep, a 1.5 cm stone's sheet
// reaches about 5 cm up and is gone by 96 ms (sealing at the surface, as it
// nearly always does, it closes into a dome 1 cm high); a 4 cm stone's 11 cm, a 6 cm
// stone's 14 cm (11 cm dropped straight in); a 16 cm stone's sheet is 4 mm
// thick, stands for 160 ms with its rim 25 to 40 cm high, nearly ballistic,
// is gone by 256 ms and tears into drops of 2.5 to 9 mm
// (tools/splash-probe.mjs measures these).
//
// A large drop landing makes a small crown of its own, the classic
// drop-impact crown: the same model with the drop's radius and landing speed
// (`landing`), on a LANDING_ROWS × LANDING_COLUMNS grid with the modes it can
// resolve, and time scales that fit a drop: T = LANDING_LAUNCH·R/V with no
// floor, t_break = LANDING_BREAK·T and no 60 ms floor either. Its launch
// speeds are LANDING_SPEED times a stone's and leave LANDING_TILT degrees
// nearer vertical, so it stands about a drop diameter tall and three across
// when it tears, as a drop's crown does (a stone's is flatter for its size);
// it tears into drops of at most LANDING_DROP_CAP·R, and its mesh rides the
// waves (aRide), since most drops land on water the splash has disturbed. It
// keeps the 3 cm stone's drag and drain times and h0 = 1.5 mm·sqrt(R / 3 cm),
// which is what it was tuned with (a drop's crown is no stone's scaled down). A
// jet's 7 mm drop landing at 2.2 m/s stands whole for 19 ms, its rim then
// 14 mm up and 43 mm across, and is gone by 31 ms.
//
// An oblique entry also throws a forward fan (`fan`, made by the splash when
// more than 0.3 of the entry speed is horizontal), a thin fast sheet ahead
// of the crown: the same model over an open sector, FAN_HALF_ANGLE either
// side of the direction of travel, launched over T = FAN_LAUNCH·R/V with no
// tail from the forward contact line, the cavity's lip on its forward side
// (at least FAN_RING_START·R out; with no cavity, a ring widening from
// FAN_RING_START·R to FAN_RING_END·R), at FAN_SPEED_START to FAN_SPEED_END of
// V, about 0.9·V, and FAN_TILT_START to FAN_TILT_END degrees from vertical,
// so mostly forward. Its strength (0 to 1, growing with the horizontal
// fraction) scales the speeds by 0.75 + 0.25·strength and its thickness,
// FAN_THICKNESS·h0, by 0.5 + 0.5·strength. Across the sector the launch speed
// falls to FAN_EDGE_SPEED and the thickness to nothing at the edges; it has
// no drift and fingers its rim with the modes FAN_MODES. It tears at
// t_break = max(FAN_BREAK·R/V, FAN_MIN_BREAK) (a sheet this thin and fast
// would part within 2·R/V, but then no frame at 60 Hz would ever show it;
// the floor scales with s from 3 cm up, as the crown's does) into fine drops
// of FAN_DROP_FLOOR to FAN_DROP_CAP (times s^DROP_SIZE_POWER), which carry
// its decayed velocity. It scales with the stone as the crown does. For a
// 3 cm stone thrown in at 6.9 m/s, 42° from vertical, its rim is 13 cm ahead
// and 3 cm up when it tears at 20 ms, it is gone by 32 ms, and its spray
// lands about 0.7 m ahead.
//
// updateGeometry() evaluates a ROWS × columns grid (rim to base × around the
// ring, built by src/fluidMesh.js: a stone's crown has FINGER_SPOTS and
// ARC_COLUMNS columns a finger, 150 for a 3 cm stone, 240 for a 16 cm one; a
// landing crown LANDING_COLUMNS; the fan's FAN_ROWS × FAN_COLUMNS across its
// sector, not wrapping) once per rendered frame, row by row: what depends on
// the launch time alone (the lip, the launch's speed, angle and drag) is
// worked out once a row while the sheet is whole. update() runs every
// simulation substep and sheds from the rim, while the tear, the costly part,
// advances once per rendered frame: whenever a frame's worth of simulated
// time (SplashSystem.frameSeconds) has passed, so the front moves on every
// frame at any time scale. The mesh is drawn by SplashSystem with the
// materials in src/shaders/sheet.js, through the droplets' screen-space fluid
// passes.
//
// In the pool (`walls`, set by SplashSystem) the sheet and its beads are held
// inside its walls (holdWithinWalls in src/fluidMesh.js): a sheet that meets
// a wall runs up it instead of passing through onto the deck.
import * as THREE from 'three';
import { createRingGrid, computeGridNormals, holdWithinWalls, markChanged } from './fluidMesh.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;     // the stone size the tuning constants were set for
const ROWS = 24;                   // samples along launch time, rim (row 0) to base
const MAIN_ROWS = 17;              // rows given to the main launch once the tail exists
const LANDING_ROWS = 12;           // a landing drop's crown: a smaller grid...
const LANDING_COLUMNS = 32;
const LANDING_MAIN_ROWS = 8;
const LANDING_LAUNCH = 1.0;        // ...launching over this many R/V...
const LANDING_BREAK = 6;           // ...tearing at this many launch windows...
const LANDING_SPEED = 1.2;         // ...at this many times a stone crown's launch speeds...
const LANDING_TILT = 20;           // ...this many degrees nearer vertical...
const LANDING_DROP_CAP = 0.25;     // ...into drops of at most this many landing drop radii
const ROW_POWER = 1.8;             // crowds main-launch rows towards the rim bead
const MAIN_SHARE = 0.7;            // fraction of the tear front's travel spent on the main launch
const TAIL_DECAY = 0.45;           // tail launch speed decays over this many T
const TEAR_MODES = [7, 11, 17];    // the tear front's raggedness around the ring, besides its three lobes
const CARRY = [0, 1.2];            // a stone crown's material rides the lip out as the mouth widens, by smoothstep over these many T of its launch (the rim not at all)...
const TAIL_FEED = 2.5;             // ...and its tail is fed for this many T after the main launch (later it would leave at nothing)
const CROWN_SPEED = [0.36, 0.26];  // a stone's crown leaves at these shares of V, first to last of the main launch...
const CROWN_TILT = [18, 12];       // ...at these many degrees from vertical...
const CROWN_DRAIN = 0.06;          // ...and thins over this time scale, for a 3 cm stone...
const CROWN_DRAG = 0.085;          // ...its elements' velocity decaying as exp(−age / τd), τd this (the reference simulation's rim, a little less for real air)
const DRAIN_SECONDS = 0.04;        // a landing crown's and the fan's thinning time scale, for a 3 cm stone...
const DRAG_SECONDS = 0.05;         // ...and their elements' τd: both, like a stone crown's, scale...
const SHEET_SCALE_FLOOR = 0.4;     // ...both scaling with R / 3 cm, but at least this many times (τd 20 ms)...
const CROWN_SCALE_FLOOR = 0.25;    // ...and a stone crown's at least this many (τd 25 ms: a pebble's sheet is held back by its surface tension)
const SHEET_THICKNESS = 0.0015;    // h0 of a 3 cm stone's sheet, scaling with R
const BREAK_FLOOR = 0.06;          // a stone's sheet tears when its rim stalls, but stands at least this long (s), so a 60 Hz frame sees it...
const BREAK_CEILING = 0.15;        // ...and at most this, both times R / 3 cm for stones of 3 cm and up
const STALL_SHARE = 1.15;          // it tears this many times the rim's stall after the launch
const DROP_SIZE_POWER = 0.5;       // a stone's sheet sheds and tears into drops scaling as (R / 3 cm)^this
const CROWN_DROP_CAP = 0.0055;     // it tears into drops of at most this...
const CROWN_DROP_FLOOR = 0.001;    // ...and at least this (both times (R / 3 cm)^DROP_SIZE_POWER)
const RIM_DROP_RADIUS = 0.0015;    // the fan's and a landing crown's crests shed drops of this...
const RIM_DROP_SPREAD = 0.0025;    // ...to this much more (the same scaling; a landing crown's as (R / 3 cm)^0.4)
const TAIL_THICKNESS = 0.6;        // tail material leaves the ring at this fraction of h0
const MIN_THICKNESS = 0.0002;
const BEAD_END = 0.08;             // the bead is the material of the first 8% of T
const TEAR_SHARE = 0.6;            // the tear takes this fraction of t_break
const BASE_DEPTH = 0.003;          // launch a little below the surface (or the cavity's lip) so the base meets the water
const RIM_RING_START = 0.9;        // on a cavity, the ring is at least this many R until the lip's crest is wider
const MAIN_MODES = [5, 6, 7, 8, 9];
const FINE_MODES = [12, 13, 14, 15, 16, 17, 18];   // a landing crown's scallops (a stone's crown has fingers)
const MAIN_AMPLITUDE = 0.05;       // deeper turns the scallops into petals
const FINE_AMPLITUDE = 0.05;
const FINGERS = 15;                // a 3 cm stone's crown's fingers, times sqrt(R / 3 cm)...
const FINGER_JITTER = 0.25;        // ...each spacing off the mean by up to this share of it...
const FINGER_WIDTH = 0.035;        // ...each this many mean spacings wide either side of its axis at its root...
const FINGER_LENGTH = 0.15;        // ...its rim's material faster by up to this share (0.6 to 1 times it, finger by finger)...
const FINGER_SQUARENESS = 4;       // ...by (1 − |x|^this)^FINGER_POWER across it: a flat, round end on steep sides...
const FINGER_POWER = 0.75;
const FINGER_ROOT = 0.12;          // ...for the material launched within this many T of the rim
const ARC_SAG = 0.03;              // the rim between two fingers sags by this share of its speed at the arc's middle
const FINGER_SPOTS = [-1, -0.88, -0.55, 0, 0.55, 0.88, 1];   // grid columns across a finger (x, root to root), denser where its sides turn...
const ARC_COLUMNS = 3;             // ...and inside an arc
const FINGER_LEAN = 1.2;           // a finger's normal leans across it by this much at its sides (a rod's)
const BEAD_RIM = 0.95;             // a finger's bead grows to a drop this many times the rim's thickness in radius...
const BEAD_JITTER = 0.15;          // ...give or take this share, drop by drop
const BEAD_SEED = 0.3;             // a bead starts with this share of its drop's volume: the rim's own thickening
const MODES_PER_COLUMN = 1 / 2.5;  // a grid resolves modes up to this many per column
const DOME_COLUMNS = 64;           // a sealing crown's columns around (times sqrt(R / 3 cm)): it has no fingers
const DOME_PULL_START = 0.35;      // the pull starts at this share of the seal time...
const DOME_HEIGHT = 1.4;           // ...and draws the sheet onto a dome whose apex stands this many R above the still water...
const DOME_ROUND = 0.8;            // ...its radius r_foot·cos(πs/2)^this at height y_foot + h·sin(πs/2) (s from its foot to its apex)...
const DOME_FOLDS = [6, 10];        // ...buckled by this many folds around (Marston et al. 2016)...
const DOME_FOLD = 0.05;            // ...of up to this share of its radius, at mid height
const DOME_BURST = 0.25;           // when it bursts its sheet flies off at this times sqrt(g·R)·s, out and up
const DOME_TILT = 12;              // a sealing crown launches this many degrees nearer vertical: a taller wall
const SEAL_SPRAY = 8;              // the closure throws a spike of this many fine drops up from the apex (times sqrt(R / 3 cm))...
const SEAL_SPRAY_SPEED = [0.8, 2.2];   // ...at these speeds, times sqrt(R / 3 cm) (the reference's real-air seal jet)
const FAN_ROWS = 10;               // the forward fan of an oblique entry: rim to base...
const FAN_COLUMNS = 41;            // ...by edge to edge across its sector
const FAN_HALF_ANGLE = THREE.MathUtils.degToRad(60);   // the sector spans this either side of the direction of travel
const FAN_LAUNCH = 1.0;            // launched over this many R/V...
const FAN_BREAK = 1.25;            // ...tearing at this many R/V...
const FAN_MIN_BREAK = 0.02;        // ...or this many seconds (times R / 3 cm from 3 cm up) if longer, so a 60 Hz frame sees it whole
const FAN_RING_START = 0.5;        // launch ring radius in R, first to last material: the forward contact line
const FAN_RING_END = 0.9;
const FAN_SPEED_START = 1.0;       // launch speed in V, first to last (about 0.9·V)...
const FAN_SPEED_END = 0.8;
const FAN_TILT_START = 75;         // ...at this many degrees from vertical, first to last
const FAN_TILT_END = 65;
const FAN_EDGE_SPEED = 0.7;        // launch speed at the sector's edges against straight ahead
const FAN_THICKNESS = 0.5;         // of a stone crown's h0
const FAN_MODES = [20, 22, 24, 26, 28, 30, 32];   // its rim's fingers (around a whole circle: 7 to 11 across the sector)
const FAN_AMPLITUDE = 0.06;
const FAN_DROP_CAP = 0.0008;       // it tears into fine drops of at most this...
const FAN_DROP_FLOOR = 0.0003;     // ...and at least this (both times (R / 3 cm)^DROP_SIZE_POWER)...
const FAN_RIM_DROPS = 0.2;         // ...and its rim sheds drops this fraction of the size a crown's does

const randomRange = (low, high) => low + Math.random() * (high - low);
const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

/**
 * A stone's crown's fingers (the header): about evenly spaced around the
 * ring from a random start, each with its axis, its root's half-width and
 * its length (the extra launch speed of the rim's material at its axis).
 */
function layFingers(fingerScale) {
  const count = Math.max(5, Math.round(FINGERS * fingerScale * randomRange(0.9, 1.1)));
  const spacings = Array.from({ length: count }, () => 1 + randomRange(-FINGER_JITTER, FINGER_JITTER));
  const total = spacings.reduce((sum, value) => sum + value, 0);
  const meanSpacing = (Math.PI * 2) / count;
  let angle = randomRange(0, Math.PI * 2);
  return spacings.map((spacing, index) => {
    const finger = { angle, halfWidth: FINGER_WIDTH * meanSpacing * randomRange(0.85, 1.15), length: FINGER_LENGTH * randomRange(0.6, 1), column: index * (FINGER_SPOTS.length + ARC_COLUMNS) + (FINGER_SPOTS.length - 1) / 2 };
    angle += (spacing / total) * Math.PI * 2;
    return finger;
  });
}

/** The grid's columns by finger: at FINGER_SPOTS across each, root to root, ARC_COLUMNS inside each arc; each column's share of the ring and where it is across its finger. */
function layColumns(fingers, angles, widths, across) {
  let column = 0;
  fingers.forEach((finger, index) => {
    const next = fingers[(index + 1) % fingers.length];
    const nextAngle = next.angle + (index + 1 < fingers.length ? 0 : Math.PI * 2);
    for (const spot of FINGER_SPOTS) {
      across[column] = spot;
      angles[column++] = finger.angle + finger.halfWidth * spot;
    }
    const arcStart = finger.angle + finger.halfWidth, arcEnd = nextAngle - next.halfWidth;
    for (let spot = 1; spot <= ARC_COLUMNS; spot++) angles[column++] = arcStart + ((arcEnd - arcStart) * spot) / (ARC_COLUMNS + 1);
  });
  const count = angles.length;
  for (let index = 0; index < count; index++) {
    const before = index > 0 ? angles[index - 1] : angles[count - 1] - Math.PI * 2;
    const after = index + 1 < count ? angles[index + 1] : angles[0] + Math.PI * 2;
    widths[index] = 0.5 * (after - before);
  }
}

export class CrownSheet {
  /**
   * @param impact {x, z, speed, velocity, radius} from Rock.update
   * @param startTime splash time of the impact
   * @param rimDroplets droplets the rim sheds before breakup
   * @param breakupDroplets droplets the sheet becomes when it tears
   * @param material the material the mesh starts with (the splash swaps it per pass)
   * @param landing the crown of a drop landing rather than of a stone
   * @param fan the forward fan of an oblique entry rather than the crown
   * @param strength the fan's, 0 to 1, growing with the horizontal fraction of the entry speed
   * @param rim the stone's cavity (src/cavity.js), whose lip the sheet launches from, or null
   * @param lopsided a stone's crown's departure from round (the header): {spinX, spinZ} the spin's lift of the
   *   rim (its share of the entry speed at the azimuth's cosine and sine), speedScale, tiltShift (degrees)
   * @param seal a surface seal (the header), or null: {time, tear}, the crown's ages (s) when its rim closes
   *   over the hole and when the dome bursts
   */
  constructor({ impact, startTime, rimDroplets, breakupDroplets, material, landing = false, fan = false, strength = 1, rim = null, lopsided = null, seal = null }) {
    const { velocity, radius } = impact;
    const speed = Math.max(impact.speed, 1.0);
    this.centreX = impact.x;
    this.centreZ = impact.z;
    this.radius = radius;
    this.sizeFactor = radius / REFERENCE_RADIUS;
    // A stone's sheet is as thick as the stone is big, so it slows, drains and
    // lasts in proportion; a landing drop's crown keeps the 3 cm stone's times.
    const stoneCrown = !landing && !fan;
    const sheetScale = landing ? 1 : Math.max(this.sizeFactor, stoneCrown ? CROWN_SCALE_FLOOR : SHEET_SCALE_FLOOR);
    const lastingScale = Math.max(this.sizeFactor, 1);
    this.dragSeconds = (stoneCrown ? CROWN_DRAG : DRAG_SECONDS) * sheetScale;
    this.drainSeconds = (stoneCrown ? CROWN_DRAIN : DRAIN_SECONDS) * sheetScale;
    // Sets the launch speeds.
    this.lopsided = { spinX: 0, spinZ: 0, speedScale: 1, tiltShift: 0, ...lopsided };
    this.entrySpeed = (landing ? LANDING_SPEED * speed : fan ? (0.75 + 0.25 * strength) * speed : speed) * this.lopsided.speedScale;
    this.tiltShift = landing ? LANDING_TILT : this.lopsided.tiltShift + (seal && !fan ? DOME_TILT : 0);   // degrees off the launch angle from vertical
    this.startTime = startTime;
    this.walls = null;   // the pool's walls, inset (src/splash.js setGround), or none
    this.age = 0;
    this.finished = false;
    this.landing = landing;
    this.fan = fan;
    this.rim = rim;
    this.lip = { x: 0, z: 0, mouth: 0, width: 0, height: 0, widest: 0, widestWidth: 0 };
    this.lipNow = { x: 0, z: 0, mouth: 0, width: 0, height: 0, widest: 0, widestWidth: 0, age: -1 };   // the lip at the crown's age (carried)
    this.launch = { tau: NaN, age: NaN };   // launchAt's cache
    // A stone's rim has sqrt(s) times a 3 cm stone's fingers (the header); a
    // drop's crown keeps its modes; a sealing crown's rim closes smooth.
    const fingerScale = landing ? 1 : Math.sqrt(this.sizeFactor);
    // A dome stands on its cavity's lip: a sheet with no cavity never seals.
    this.seal = !landing && !fan && seal && rim ? { time: seal.time, start: DOME_PULL_START * seal.time, tear: Math.max(seal.tear, seal.time) } : null;
    this.fingered = !landing && !fan && !this.seal;
    this.fingers = this.fingered ? layFingers(fingerScale) : [];
    this.rows = landing ? LANDING_ROWS : fan ? FAN_ROWS : ROWS;
    this.columns = landing ? LANDING_COLUMNS : fan ? FAN_COLUMNS : this.seal ? Math.round(DOME_COLUMNS * fingerScale) : this.fingers.length * (FINGER_SPOTS.length + ARC_COLUMNS);
    this.mainRows = landing ? LANDING_MAIN_ROWS : fan ? FAN_ROWS : MAIN_ROWS;
    // rowTau's crowding towards the rim, worked out once.
    this.mainRowShares = Float64Array.from({ length: this.rows }, (_, row) => (row / this.mainRows) ** ROW_POWER);
    this.rowShares = Float64Array.from({ length: this.rows }, (_, row) => (row / (this.rows - 1)) ** ROW_POWER);

    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const horizontalFraction = Math.min(horizontalSpeed / speed, 1);
    this.forwardX = horizontalSpeed > 1e-4 ? (velocity.x / horizontalSpeed) * horizontalFraction : 0;
    this.forwardZ = horizontalSpeed > 1e-4 ? (velocity.z / horizontalSpeed) * horizontalFraction : 0;
    this.driftX = fan ? 0 : 0.22 * velocity.x;
    this.driftZ = fan ? 0 : 0.22 * velocity.z;
    // Columns go around the whole ring, or across the fan's open sector centred on the direction of travel.
    this.wrap = !fan;
    this.heading = Math.atan2(velocity.z, velocity.x);
    this.firstAngle = fan ? this.heading - FAN_HALF_ANGLE : 0;
    this.columnWidth = fan ? (2 * FAN_HALF_ANGLE) / (this.columns - 1) : (Math.PI * 2) / this.columns;

    if (landing) {
      this.launchDuration = LANDING_LAUNCH * radius / speed;
      this.breakTime = LANDING_BREAK * this.launchDuration;
    } else if (fan) {
      this.launchDuration = FAN_LAUNCH * radius / speed;
      this.breakTime = Math.max(FAN_BREAK * radius / speed, FAN_MIN_BREAK * lastingScale);
    } else {
      this.launchDuration = Math.max(1.2 * radius / speed, 0.01);
      // It tears when its rim stalls: when u·cos(tilt)·exp(−a/τd) = g·a for the rim's launch (Newton's method).
      const rising = this.entrySpeed * CROWN_SPEED[0] * Math.cos(THREE.MathUtils.degToRad(CROWN_TILT[0] - this.tiltShift));
      let stall = Math.min(rising / GRAVITY, this.dragSeconds);
      for (let iteration = 0; iteration < 12; iteration++) {
        const decay = rising * Math.exp(-stall / this.dragSeconds);
        stall -= (decay - GRAVITY * stall) / (-decay / this.dragSeconds - GRAVITY);
      }
      this.breakTime = THREE.MathUtils.clamp(STALL_SHARE * stall, BREAK_FLOOR * lastingScale, BREAK_CEILING * lastingScale);
      // A dome stands until the hole under it pinches, then bursts from the top.
      if (this.seal) this.breakTime = this.seal.tear;
    }
    this.tearDuration = TEAR_SHARE * this.breakTime;
    this.endTime = this.breakTime + this.tearDuration;
    const thickness = SHEET_THICKNESS * (landing ? Math.sqrt(this.sizeFactor) : this.sizeFactor);
    this.baseThickness = Math.max(thickness, MIN_THICKNESS) * (fan ? FAN_THICKNESS * (0.5 + 0.5 * strength) : 1);

    // Modes count around a whole circle, so a sector's columns resolve as many as a ring of their spacing.
    const resolved = (number) => number <= ((Math.PI * 2) / this.columnWidth) * MODES_PER_COLUMN;
    const randomModes = (referenceNumbers, amplitude) => {
      const step = referenceNumbers[1] - referenceNumbers[0];
      const first = Math.max(2, Math.round(referenceNumbers[0] * fingerScale));
      const last = Math.max(first, Math.round(referenceNumbers.at(-1) * fingerScale));
      const numbers = [];
      for (let number = first; number <= last; number += step) numbers.push(number);
      const share = Math.sqrt(referenceNumbers.length / numbers.length);
      return numbers.filter(resolved).map((number) => ({ number, amplitude: amplitude * share * randomRange(0.5, 1), phase: randomRange(0, Math.PI * 2) }));
    };
    this.modes = fan ? randomModes(FAN_MODES, FAN_AMPLITUDE)
      : this.fingered || this.seal ? randomModes(MAIN_MODES, MAIN_AMPLITUDE)
        : [...randomModes(MAIN_MODES, MAIN_AMPLITUDE), ...randomModes(FINE_MODES, FINE_AMPLITUDE)];

    // Per-column constants, and the tear front (a launch time: everything
    // launched before it has torn) with its own pace so the front is ragged.
    // A stone's crown lays its columns out by finger (the header); the others
    // evenly.
    this.columnAngle = new Float64Array(this.columns);
    this.columnWidths = new Float64Array(this.columns);
    this.columnCos = new Float64Array(this.columns);
    this.columnSin = new Float64Array(this.columns);
    this.columnSpeedFactor = new Float64Array(this.columns);
    this.columnThicknessFactor = new Float64Array(this.columns);
    this.columnFingerFactor = new Float64Array(this.columns);
    this.columnAcross = new Float64Array(this.columns);   // x across a finger (FINGER_SPOTS), 0 on an arc
    this.columnTearPace = new Float64Array(this.columns);
    this.tearFront = new Float64Array(this.columns);
    this.tearClock = Infinity;         // simulated time since the tear last advanced: tear at once
    this.tearTarget = new Float64Array(this.columns);
    this.tearSwept = new Float64Array(this.columns);
    if (this.fingered) layColumns(this.fingers, this.columnAngle, this.columnWidths, this.columnAcross);
    else for (let column = 0; column < this.columns; column++) {
      this.columnAngle[column] = this.firstAngle + column * this.columnWidth;
      this.columnWidths[column] = this.columnWidth;
    }
    const tearPhase = randomRange(0, Math.PI * 2);
    // The front's raggedness varies smoothly around the ring (TEAR_MODES at random phases),
    // so neighbouring columns tear alike and the torn edge is a curve, not a saw.
    const tearModes = TEAR_MODES.map((mode) => ({ mode, phase: randomRange(0, Math.PI * 2), amplitude: randomRange(0.5, 1) }));
    const tearSpan = tearModes.reduce((sum, wave) => sum + wave.amplitude, 0);
    const place = this.place = { factor: 0, fingerness: 0 };
    for (let column = 0; column < this.columns; column++) {
      const angle = this.columnAngle[column];
      this.columnCos[column] = Math.cos(angle);
      this.columnSin[column] = Math.sin(angle);
      this.columnSpeedFactor[column] = this.speedFactor(angle);
      this.columnThicknessFactor[column] = this.thicknessFactor(angle);
      const smoothPart = 0.5 + 0.5 * Math.sin(3 * angle + tearPhase);
      const finePart = 0.5 + 0.5 * tearModes.reduce((sum, wave) => sum + wave.amplitude * Math.sin(wave.mode * angle + wave.phase), 0) / tearSpan;
      // Faster than 1 a column tears before the end; a finger's axis tears at 1, the slowest.
      const ragged = 0.5 * smoothPart + 0.5 * finePart;
      if (this.fingered) {
        this.fingerAt(angle, place);
        this.columnFingerFactor[column] = place.factor;
        this.columnTearPace[column] = 1 + ragged * (1 - place.fingerness);
      } else {
        this.columnTearPace[column] = 1 + ragged;
      }
    }

    // The cavity's mouth outline at each column (it never changes; evaluate needs it at every vertex).
    this.columnRimShape = rim ? Float64Array.from(this.columnCos, (cosAngle, column) => rim.shape(cosAngle, this.columnSin[column])) : null;

    // A stone's crown sheds its rim's drops from its fingers' beads, shared
    // out by the fingers' lengths; the others' crests of the modulation shed
    // them, the strongest most often (and on the fan, those nearest straight
    // ahead, where the sheet is thickest).
    this.dropScale = landing ? 1 : this.sizeFactor ** DROP_SIZE_POWER;
    const totalLength = this.fingers.reduce((sum, finger) => sum + finger.length, 0) || 1;
    for (const finger of this.fingers) {
      finger.share = (finger.length / totalLength) * rimDroplets;
      finger.carry = 0;
      finger.jitter = randomRange(1 - BEAD_JITTER, 1 + BEAD_JITTER);
      finger.bead = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, radius: 0 };
    }
    this.beadsGone = false;
    this.crests = [];
    const samples = this.fingered ? 0 : 360;
    const sampleStep = this.wrap ? (Math.PI * 2) / samples : (2 * FAN_HALF_ANGLE) / (samples - 1);
    const modulation = new Float64Array(samples);
    for (let index = 0; index < samples; index++) modulation[index] = this.modulation(this.firstAngle + index * sampleStep);
    for (let index = 0; index < samples; index++) {
      if (!this.wrap && (index === 0 || index === samples - 1)) continue;
      const value = modulation[index];
      const before = modulation[(index + samples - 1) % samples];
      const after = modulation[(index + 1) % samples];
      const angle = this.firstAngle + index * sampleStep;
      if (value > before && value >= after && value > 1.02) this.crests.push({ angle, weight: (value - 1) * (fan ? this.thicknessFactor(angle) : 1), carry: 0 });
    }
    const totalWeight = this.crests.reduce((sum, crest) => sum + crest.weight, 0) || 1;
    for (const crest of this.crests) crest.share = (crest.weight / totalWeight) * rimDroplets;
    this.breakupRemaining = breakupDroplets;   // still to come from the tear
    this.tearCarry = 0;                        // fraction of a droplet owed
    this.pieceAreas = new Float64Array(this.rows);

    // The grid mesh.
    const vertexCount = this.rows * this.columns;
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.rimTangents = new Float32Array(vertexCount * 3);
    this.thicknesses = new Float32Array(vertexCount);
    this.rods = new Float32Array(vertexCount);       // 1 on a finger: shaded as a rod of water, not as the sheet's film
    this.rowTaus = new Float64Array(vertexCount);   // launch time behind the free edge
    this.mesh = createRingGrid(this.rows, this.columns, {
      position: [this.positions, 3],
      normal: [this.normals, 3],
      aRimTangent: [this.rimTangents, 3],
      aThickness: [this.thicknesses, 1],
      aRod: [this.rods, 1],
      aRide: [this.rideFlags(vertexCount, landing), 1],   // 1: lifted by the wave height under it
    }, material, { wrap: this.wrap });
    this.maxDropRadius = landing ? LANDING_DROP_CAP * radius : (fan ? FAN_DROP_CAP : CROWN_DROP_CAP) * this.dropScale;
    this.minDropRadius = fan ? FAN_DROP_FLOOR * this.dropScale : Math.min(CROWN_DROP_FLOOR * this.dropScale, 0.5 * this.maxDropRadius);
    this.geometry = this.mesh.geometry;
    this.state = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, thickness: 0, radialDistance: 0 };
    this.stateOther = { ...this.state };
    // A sealing crown's dome: its folds (DOME_FOLDS, at a random phase) and whether the closure has thrown its spike.
    this.domeFolds = Math.round(randomRange(DOME_FOLDS[0], DOME_FOLDS[1]));
    this.domeFoldPhase = randomRange(0, Math.PI * 2);
    this.sealSprayed = false;
  }

  /** A landing crown rides the waves; a stone's sheet on a cavity's lip rides them at its base, as the lip does. */
  rideFlags(vertexCount, landing) {
    const flags = new Float32Array(vertexCount).fill(landing ? 1 : 0);
    if (this.rim) flags.fill(1, (this.rows - 1) * this.columns);
    return flags;
  }

  // ---- the model --------------------------------------------------------

  modulation(angle) {
    let sum = 0;
    for (const mode of this.modes) sum += mode.amplitude * Math.cos(mode.number * angle + mode.phase);
    return 1 + sum;
  }

  forward(angle) { return Math.cos(angle) * this.forwardX + Math.sin(angle) * this.forwardZ; }

  /**
   * A stone's crown's rim at an azimuth (the header): into `out`, `factor`,
   * the share its rim's material flies faster (a finger's (1 − |x|^squareness)^power
   * times its length, or an arc's sag, negative), and `fingerness`, 1 − x²
   * on a finger and 0 on an arc.
   */
  fingerAt(angle, out) {
    out.factor = 0;
    out.fingerness = 0;
    const fingers = this.fingers;
    if (fingers.length === 0) return out;
    const turn = Math.PI * 2;
    const start = fingers[0].angle - fingers[0].halfWidth;
    const unwrapped = start + ((((angle - start) % turn) + turn) % turn);
    for (let index = 0; index < fingers.length; index++) {
      const finger = fingers[index];
      const next = fingers[(index + 1) % fingers.length];
      const nextAngle = next.angle + (index + 1 < fingers.length ? 0 : turn);
      if (unwrapped >= nextAngle - next.halfWidth && index + 1 < fingers.length) continue;
      const across = (unwrapped - finger.angle) / finger.halfWidth;
      if (across <= 1) {
        out.factor = finger.length * Math.max(1 - Math.abs(across) ** FINGER_SQUARENESS, 0) ** FINGER_POWER;
        out.fingerness = Math.max(1 - across * across, 0);
      } else {
        const arcStart = finger.angle + finger.halfWidth;
        out.factor = -ARC_SAG * Math.sin((Math.PI * (unwrapped - arcStart)) / Math.max(nextAngle - next.halfWidth - arcStart, 1e-9));
      }
      return out;
    }
    return out;
  }


  /** Across the fan's sector: 1 straight ahead, falling to 0 at its edges. */
  fanShape(angle) {
    const offset = Math.abs(Math.atan2(Math.sin(angle - this.heading), Math.cos(angle - this.heading)));
    return Math.cos(Math.min(offset / FAN_HALF_ANGLE, 1) * Math.PI * 0.5);
  }

  speedFactor(angle) {
    if (this.fan) return this.modulation(angle) * (FAN_EDGE_SPEED + (1 - FAN_EDGE_SPEED) * this.fanShape(angle));
    // A spinning stone's surface drags water up on the side it turns upward (Truscott & Techet 2009).
    const spin = 1 + Math.max(Math.cos(angle) * this.lopsided.spinX + Math.sin(angle) * this.lopsided.spinZ, -0.5);
    return this.modulation(angle) * (1 + 0.45 * this.forward(angle)) * spin;
  }

  thicknessFactor(angle) {
    if (this.fan) return Math.sqrt(this.fanShape(angle));
    return 1 - 0.45 * Math.max(-this.forward(angle), 0);
  }

  /** End of the launched material: the base of the sheet (the fan has no tail). */
  feedEnd() { return Math.min(this.age, this.fan ? this.launchDuration : this.landing || !this.rim ? this.endTime : (1 + TAIL_FEED) * this.launchDuration); }

  /**
   * What the state of an element launched at time tau owes to that time
   * alone, now: its ring's radius, launch speed (before the azimuth's
   * factors) and angle, the lip it left from (src/cavity.js), the drag's
   * decay and the flight, the fall, the drained thickness's divisor, the
   * finger's share. Kept while tau and the age stay, so a row of the grid
   * works it out once.
   */
  launchAt(tau) {
    const launch = this.launch;
    if (launch.tau === tau && launch.age === this.age) return launch;
    launch.tau = tau;
    launch.age = this.age;
    const progress = tau / this.launchDuration;
    const main = Math.min(progress, 1);
    let tail, ringRadius, launchSpeed, tilt;
    if (this.fan) {
      tail = 0;
      ringRadius = this.radius * (FAN_RING_START + (FAN_RING_END - FAN_RING_START) * main);
      launchSpeed = this.entrySpeed * (FAN_SPEED_START + (FAN_SPEED_END - FAN_SPEED_START) * main);
      tilt = THREE.MathUtils.degToRad(FAN_TILT_START + (FAN_TILT_END - FAN_TILT_START) * main);
    } else if (this.landing) {
      tail = Math.max(progress - 1, 0);
      ringRadius = this.radius * Math.min(0.9 + 0.5 * main + 0.2 * tail, 2.0);
      launchSpeed = this.entrySpeed * (tail > 0 ? 0.2 * Math.exp(-tail / TAIL_DECAY) : 0.55 - 0.35 * main);
      tilt = THREE.MathUtils.degToRad(55 - 30 * main - this.tiltShift);
    } else {
      // A stone's crown: a tall, nearly upright wall (the header).
      tail = Math.max(progress - 1, 0);
      ringRadius = this.radius * Math.min(0.9 + 0.5 * main + 0.2 * tail, 2.0);
      launchSpeed = this.entrySpeed * (tail > 0 ? CROWN_SPEED[1] * Math.exp(-tail / TAIL_DECAY) : CROWN_SPEED[0] + (CROWN_SPEED[1] - CROWN_SPEED[0]) * main);
      tilt = THREE.MathUtils.degToRad(CROWN_TILT[0] + (CROWN_TILT[1] - CROWN_TILT[0]) * main - this.tiltShift);
    }
    launch.tail = tail;
    launch.ringRadius = ringRadius;
    launch.launchSpeed = launchSpeed;
    launch.sinTilt = Math.sin(tilt);
    launch.cosTilt = Math.cos(tilt);
    if (this.rim) this.rim.lipAt(tau, this.lip);
    const age = Math.max(this.age - tau, 0);
    // Drag: velocity v0·exp(−age/τd), so the distance flown is v0·τd·(1 − exp(−age/τd)).
    launch.decay = Math.exp(-age / this.dragSeconds);
    launch.flight = this.dragSeconds * (1 - launch.decay);
    launch.fall = 0.5 * GRAVITY * age * age;
    launch.fallSpeed = GRAVITY * age;
    // The tail leaves the ring thinner, so the foot stays light.
    launch.launchThickness = 1 - (1 - TAIL_THICKNESS) * smoothstep(0, 0.5, tail);
    launch.drainDivisor = 1 + age / this.drainSeconds;
    // A finger is its rim's material (the header).
    launch.fingerShare = this.fingered ? 1 - smoothstep(0, FINGER_ROOT, progress) : 0;
    // A stone crown's foot, the late material still low by the lip, rides the lip out as the mouth widens (evaluate).
    launch.carry = this.rim && !this.fan && !this.landing ? smoothstep(CARRY[0], CARRY[1], progress) : 0;
    return launch;
  }

  /** How far a sealing crown has closed now (its pull, 0 to 1; 0 for any other sheet). */
  sealedShare() {
    if (!this.seal) return 0;
    const share = Math.min(Math.max((this.age - this.seal.start) / Math.max(this.seal.time - this.seal.start, 1e-4), 0), 1);
    return share * share * (3 - 2 * share);
  }

  /** How fast the pull grows now (per second). */
  sealRate() {
    const span = Math.max(this.seal.time - this.seal.start, 1e-4);
    const share = (this.age - this.seal.start) / span;
    return share > 0 && share < 1 ? (6 * share * (1 - share)) / span : 0;
  }

  /** Where launch time tau lies from the sheet's foot (0) to its rim (1), the main launch taking MAIN_SHARE of the way from the rim (sheetTau's inverse). */
  sheetHeight(tau, end) {
    const split = this.launchDuration;
    if (end <= split) return 1 - tau / Math.max(end, 1e-9);
    if (tau <= split) return 1 - (MAIN_SHARE * tau) / split;
    return (1 - MAIN_SHARE) * (1 - (tau - split) / Math.max(end - split, 1e-9));
  }

  /**
   * State of the element launched at time tau from the azimuth with the given
   * cosine and sine, at the crown's current age: position, velocity and sheet
   * thickness. edgeTau is the launch time at the sheet's free edge there (0
   * for the rim, the tear front once it tears): the bead runs along it.
   * fingerFactor is fingerAt's factor there (0 on a drop's crown or the fan).
   * `free`: as the sheet would be with no seal pulling it in. rimShape is the
   * cavity's mouth outline at this azimuth (columnRimShape), or worked out.
   */
  evaluate(tau, cosAngle, sinAngle, speedFactor, thicknessFactor, out, edgeTau = 0, fingerFactor = 0, free = false, rimShape = undefined) {
    const launch = this.launchAt(tau);
    let ringRadius = launch.ringRadius;
    const launchSpeed = launch.launchSpeed * speedFactor * (1 + fingerFactor * launch.fingerShare);
    // On a cavity the material leaves from its lip's crest, where the lip was
    // then (centre, radius at this azimuth, height), once the crest is wider
    // than the ring above starts; once the hole closes it stays where the
    // crest was widest, on the lip's outer slope.
    let centreX = this.centreX, centreZ = this.centreZ, baseHeight = -BASE_DEPTH;
    if (this.rim) {
      const lip = this.lip;
      const shape = rimShape ?? this.rim.shape(cosAngle, sinAngle);
      const crest = lip.mouth * shape + lip.width;
      const held = lip.widest * shape + lip.widestWidth;
      centreX = lip.x;
      centreZ = lip.z;
      ringRadius = Math.max(held, (this.fan ? FAN_RING_START : RIM_RING_START) * this.radius);
      baseHeight += this.rim.lipHeightBeyond(lip, ringRadius - crest);
      if (launch.carry > 0) {
        // The foot is carried out with the lip as the mouth widens under it: it stands where the lip is now.
        const now = this.lipNow;
        if (now.age !== this.age) { this.rim.lipAt(this.age, now); now.age = this.age; }
        const ringNow = Math.max(now.widest * shape + now.widestWidth, RIM_RING_START * this.radius);
        const heightNow = -BASE_DEPTH + this.rim.lipHeightBeyond(now, ringNow - (now.mouth * shape + now.width));
        const carry = launch.carry;
        centreX += (now.x - centreX) * carry;
        centreZ += (now.z - centreZ) * carry;
        ringRadius += (ringNow - ringRadius) * carry;
        baseHeight += (heightNow - baseHeight) * carry;
      }
    }
    const radialSpeed = launchSpeed * launch.sinTilt;
    const upSpeed = launchSpeed * launch.cosTilt;
    const decay = launch.decay;
    const flight = launch.flight;
    // Carried material goes where the lip goes, not where it was flung or dragged.
    const flown = flight * (1 - launch.carry);
    const radialDistance = ringRadius + radialSpeed * flown;
    out.x = centreX + cosAngle * radialDistance + this.driftX * flown;
    out.y = baseHeight + upSpeed * flight - launch.fall;
    out.z = centreZ + sinAngle * radialDistance + this.driftZ * flown;
    out.vx = (cosAngle * radialSpeed + this.driftX) * decay;
    out.vy = upSpeed * decay - launch.fallSpeed;
    out.vz = (sinAngle * radialSpeed + this.driftZ) * decay;
    out.radialDistance = radialDistance;
    // The foot never sinks below the lip it stands on: the water there holds it up.
    if (launch.carry > 0 && out.y < baseHeight) { out.y = baseHeight; out.vy = Math.max(out.vy, 0); }
    if (this.seal && !free && this.age > this.seal.start) this.pullIn(out, tau, cosAngle, sinAngle, rimShape);
    // The bead gathers what stretching takes from the sheet, so it keeps three
    // times the unstretched thickness while the sheet behind it thins.
    const drained = this.baseThickness * thicknessFactor * launch.launchThickness / launch.drainDivisor;
    // The fan thins to nothing at its edges.
    const sheetThickness = Math.max(drained * ringRadius / radialDistance, this.fan ? MIN_THICKNESS * thicknessFactor : MIN_THICKNESS);
    // A sealing crown's rim merges as it closes: no free edge, no bead, until the dome bursts.
    const merged = this.seal && edgeTau === 0 ? this.sealedShare() : 0;
    const bead = (1 - smoothstep(0.6 * BEAD_END, 1.3 * BEAD_END, (tau - edgeTau) / this.launchDuration)) * (1 - merged);
    out.thickness = sheetThickness + bead * Math.max(3 * drained - sheetThickness, 0);
    return out;
  }

  /**
   * A surface seal's pull on a free element `out` (evaluate's, launched at
   * tau from the azimuth with the given cosine and sine): it is drawn by the
   * pull P (sealedShare) onto the dome (the header), a surface of revolution
   * about the lip's centre from the lip's crest (its foot, the carried tail's
   * ring) to an apex DOME_HEIGHT·R above the still water, the sheet's rim at
   * the apex and its foot at the foot: at s from foot to rim (sheetHeight),
   * radius r_foot·cos(πs/2)^DOME_ROUND·(1 + DOME_FOLD·sin(πs)·sin(kφ + ψ)) and
   * height y_foot + (apex − y_foot)·sin(πs/2). So the dome is a smooth bell
   * whatever the free sheet's waves and an oblique throw's lopsidedness, with
   * k buckling folds. While it stands it holds still; once it bursts (the
   * tear) its sheet flies off at DOME_BURST·sqrt(g·R)·s, out and up.
   */
  pullIn(out, tau, cosAngle, sinAngle, rimShape) {
    const pull = this.sealedShare();
    const now = this.lipNow;
    if (now.age !== this.age) { this.rim.lipAt(this.age, now); now.age = this.age; }
    const shape = rimShape ?? this.rim.shape(cosAngle, sinAngle);
    const footRadius = Math.max(now.widest * shape + now.widestWidth, RIM_RING_START * this.radius);
    const footHeight = -BASE_DEPTH + this.rim.lipHeightBeyond(now, footRadius - (now.mouth * shape + now.width));
    const along = this.sheetHeight(tau, Math.max(this.feedEnd(), 1e-6));
    const angle = Math.atan2(sinAngle, cosAngle);
    const fold = 1 + DOME_FOLD * Math.sin(Math.PI * along) * Math.sin(this.domeFolds * angle + this.domeFoldPhase);
    const radius = footRadius * Math.cos(0.5 * Math.PI * along) ** DOME_ROUND * fold;
    const height = footHeight + (DOME_HEIGHT * this.radius - footHeight) * Math.sin(0.5 * Math.PI * along);
    const domeX = now.x + cosAngle * radius, domeZ = now.z + sinAngle * radius;
    // At rest on the dome, or flying off it once it bursts.
    const burst = this.age >= this.breakTime ? DOME_BURST * Math.sqrt(GRAVITY * this.radius) * along : 0;
    const rate = this.sealRate();
    out.vx += pull * (cosAngle * burst - out.vx) + rate * (domeX - out.x);
    out.vy += pull * (burst - out.vy) + rate * (height - out.y);
    out.vz += pull * (sinAngle * burst - out.vz) + rate * (domeZ - out.z);
    out.x += pull * (domeX - out.x);
    out.y += pull * (height - out.y);
    out.z += pull * (domeZ - out.z);
  }

  evaluateAt(tau, angle, out) {
    const fingerFactor = this.fingered ? this.fingerAt(angle, this.place).factor : 0;
    return this.evaluate(tau, Math.cos(angle), Math.sin(angle), this.speedFactor(angle), this.thicknessFactor(angle), out, 0, fingerFactor);
  }

  /** Launch time of a row: rows crowd towards the rim, and the tail gets its own few. */
  rowTau(row, front, end) {
    const split = this.launchDuration;
    if (front < split && end > split) {
      if (row < this.mainRows) return front + (split - front) * this.mainRowShares[row];
      return split + (end - split) * (row - this.mainRows) / (this.rows - 1 - this.mainRows);
    }
    return front + (end - front) * this.rowShares[row];
  }

  /** Launch time a fraction of the way from rim to base, the main launch taking MAIN_SHARE of the way. */
  sheetTau(fraction, end) {
    const split = this.launchDuration;
    if (end <= split) return fraction * end;
    if (fraction <= MAIN_SHARE) return split * fraction / MAIN_SHARE;
    return split + (end - split) * (fraction - MAIN_SHARE) / (1 - MAIN_SHARE);
  }

  // ---- per substep --------------------------------------------------------

  /** Advance to the given splash time: shed from the rim, or tear once it is time. */
  update(time, dt, splash) {
    this.age = time - this.startTime;
    if (this.seal && !this.sealSprayed && this.age >= this.seal.time) this.sealSpray(splash);
    if (this.age < this.breakTime) {
      this.shed(dt, splash);
    } else {
      if (!this.beadsGone) this.releaseBeads(splash);
      // The tear is the costly part, so it advances once per rendered frame.
      this.tearClock += dt;
      if (this.tearClock >= splash.frameSeconds * (1 - 1e-6) || this.age >= this.endTime) {
        this.tearClock = 0;
        this.tear(splash, Math.min((this.age - this.breakTime) / this.tearDuration, 1));
      }
    }
    if (this.age >= this.endTime) this.finished = true;
  }

  /**
   * The dome has closed: where the rim met, a thin spike of water shoots up
   * from the apex (the reference simulation's real-air seal) and breaks into
   * SEAL_SPRAY fine drops.
   */
  sealSpray(splash) {
    this.sealSprayed = true;
    const lip = this.lipNow;
    if (lip.age !== this.age) { this.rim.lipAt(this.age, lip); lip.age = this.age; }
    const scale = Math.sqrt(this.sizeFactor);
    const count = Math.max(Math.round(SEAL_SPRAY * scale), 3);
    for (let drop = 0; drop < count; drop++) {
      const speed = randomRange(SEAL_SPRAY_SPEED[0], SEAL_SPRAY_SPEED[1]) * scale;
      const angle = randomRange(0, Math.PI * 2);
      const lean = randomRange(0, 0.12) * speed;
      splash.spawnDroplet(lip.x + randomRange(-0.1, 0.1) * this.radius, DOME_HEIGHT * this.radius, lip.z + randomRange(-0.1, 0.1) * this.radius,
        Math.cos(angle) * lean, speed, Math.sin(angle) * lean, (0.0005 + 0.0009 * Math.random()) * this.sizeFactor ** 0.4);
    }
  }

  /** Tear whatever is left into droplets now (when too many crowns are alive). */
  finishNow(splash) {
    if (!this.beadsGone) this.releaseBeads(splash);
    this.tear(splash, 1);
    this.finished = true;
  }

  /**
   * Where a finger's bead is now, into finger.bead: on the finger's tip, its
   * centre 0.6 of its radius beyond it, moving with the tip; its radius
   * `share` of the radius of the drop it grows to (the cube root of its share
   * by volume), which is the rim's thickness there now times BEAD_RIM (a
   * ligament pinches into drops about that big), times the finger's own
   * jitter, within the sheet's drops' range.
   */
  placeBead(finger, share) {
    const column = finger.column;
    const state = this.evaluate(0, this.columnCos[column], this.columnSin[column], this.columnSpeedFactor[column], this.columnThicknessFactor[column], this.state, 0, this.columnFingerFactor[column], false, this.columnRimShape?.[column]);
    const tipX = state.x, tipY = state.y, tipZ = state.z;
    const radius = share * THREE.MathUtils.clamp(BEAD_RIM * state.thickness * finger.jitter, this.minDropRadius, this.maxDropRadius);
    const bead = finger.bead;
    bead.vx = state.vx; bead.vy = state.vy; bead.vz = state.vz;
    const below = this.evaluate(BEAD_END * this.launchDuration, this.columnCos[column], this.columnSin[column], this.columnSpeedFactor[column], this.columnThicknessFactor[column], this.stateOther, 0, this.columnFingerFactor[column], false, this.columnRimShape?.[column]);
    const alongX = tipX - below.x, alongY = tipY - below.y, alongZ = tipZ - below.z;
    const along = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
    const reach = along > 1e-9 ? (0.6 * radius) / along : 0;
    bead.x = tipX + alongX * reach;
    bead.y = tipY + alongY * reach;
    bead.z = tipZ + alongZ * reach;
    if (this.walls) {
      bead.x = Math.min(Math.max(bead.x, this.walls.minX), this.walls.maxX);
      bead.z = Math.min(Math.max(bead.z, this.walls.minZ), this.walls.maxZ);
    }
    bead.radius = radius;
    return bead;
  }

  /** A finger's bead pinches off, grown to `share` of its drop's radius: a drop of its size flying on from the tip. */
  letBeadGo(finger, share, splash) {
    const bead = this.placeBead(finger, share);
    finger.jitter = randomRange(1 - BEAD_JITTER, 1 + BEAD_JITTER);
    const speed = Math.sqrt(bead.vx * bead.vx + bead.vy * bead.vy + bead.vz * bead.vz);
    const boost = randomRange(1.0, 1.08);
    const scatter = 0.05 * speed;
    splash.spawnDroplet(
      bead.x, bead.y, bead.z,
      bead.vx * boost + randomRange(-scatter, scatter),
      bead.vy * boost + randomRange(-scatter, scatter),
      bead.vz * boost + randomRange(-scatter, scatter),
      bead.radius,
    );
  }

  /** How far a finger's bead has grown towards its drop, in radius: from BEAD_SEED of its volume. */
  beadShare(finger) {
    return Math.cbrt(BEAD_SEED + (1 - BEAD_SEED) * Math.min(finger.carry, 1));
  }

  /** The sheet tears: every finger lets its bead go as it is. */
  releaseBeads(splash) {
    this.beadsGone = true;
    for (const finger of this.fingers) {
      this.letBeadGo(finger, this.beadShare(finger), splash);
      finger.carry = 0;
      finger.bead.radius = 0;
    }
  }

  /**
   * Write the beads on the fingers' tips (placed by updateGeometry) as
   * droplets into the splash's instance arrays from `index` on, for drawing
   * only (SplashSystem.prepareFrame); returns how many.
   */
  beadsInto(splash, index) {
    if (this.beadsGone) return 0;
    let written = 0;
    for (const finger of this.fingers) {
      const bead = finger.bead;
      if (bead.radius <= 0) continue;
      const slot = index + written;
      if (slot >= splash.capacity) break;
      splash.positions[slot * 3] = bead.x; splash.positions[slot * 3 + 1] = bead.y; splash.positions[slot * 3 + 2] = bead.z;
      splash.velocities[slot * 3] = bead.vx; splash.velocities[slot * 3 + 1] = bead.vy; splash.velocities[slot * 3 + 2] = bead.vz;
      splash.radii[slot] = bead.radius;
      splash.ages[slot] = 0;
      splash.lenses[slot] = 1;
      written++;
    }
    return written;
  }

  shed(dt, splash) {
    // The instability grows with time, so the shedding rate ramps up linearly;
    // over the sheet's life each finger (or crest) sheds its share. A sealing
    // crown's rim sheds before the pull starts and not while it closes.
    const shedding = this.seal ? this.seal.start : this.breakTime;
    if (this.age > shedding) return;
    const rate = (2 * this.age) / (shedding * shedding);
    if (this.fingered) {
      for (const finger of this.fingers) {
        finger.carry += finger.share * rate * dt;
        while (finger.carry >= 1) {
          finger.carry -= 1;
          this.letBeadGo(finger, 1, splash);
        }
      }
      return;
    }
    const state = this.state;
    for (const crest of this.crests) {
      crest.carry += crest.share * rate * dt;
      while (crest.carry >= 1) {
        crest.carry -= 1;
        const angle = crest.angle + randomRange(-0.03, 0.03);
        this.evaluateAt(this.launchDuration * BEAD_END * 0.3, angle, state);
        const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy + state.vz * state.vz);
        const boost = randomRange(1.0, 1.08);
        const scatter = 0.05 * speed;
        splash.spawnDroplet(
          state.x, state.y, state.z,
          state.vx * boost + randomRange(-scatter, scatter),
          state.vy * boost + randomRange(-scatter, scatter),
          state.vz * boost + randomRange(-scatter, scatter),
          (RIM_DROP_RADIUS + RIM_DROP_SPREAD * Math.random() ** 1.5) * (this.landing ? this.sizeFactor ** 0.4 : this.dropScale) * (this.fan ? FAN_RIM_DROPS : 1),
        );
      }
    }
  }

  /**
   * Move the tear front to the given progress (0 to 1). The strips it sweeps
   * get the droplets still owed in proportion to their share of the untorn
   * area, so the sheet keeps spreading while it tears yet the last step leaves
   * exactly the budget spent.
   */
  tear(splash, progress) {
    const end = this.feedEnd();
    let sweptArea = 0;
    let untornArea = 0;
    for (let column = 0; column < this.columns; column++) {
      const fraction = Math.min(progress * this.columnTearPace[column], 1);
      const target = Math.max(Math.min(this.sheetTau(fraction, end), end), this.tearFront[column]);
      this.tearTarget[column] = target;
      const swept = this.columnArea(column, this.tearFront[column], target);
      this.tearSwept[column] = swept;
      sweptArea += swept;
      untornArea += swept + this.columnArea(column, target, end);
    }
    if (sweptArea <= 0) return;
    const droplets = this.breakupRemaining * Math.min(sweptArea / untornArea, 1);
    this.breakupRemaining -= droplets;
    const density = droplets / sweptArea;
    for (let column = 0; column < this.columns; column++) {
      if (this.tearTarget[column] <= this.tearFront[column]) continue;
      this.spawnFromStrip(column, this.tearFront[column], this.tearTarget[column], end, this.tearSwept[column] * density, density, splash);
      this.tearFront[column] = this.tearTarget[column];
    }
  }

  /** Area of one column's sheet between two launch times: one chord either side of T (only ratios matter). */
  columnArea(column, tauFrom, tauTo) {
    if (tauTo <= tauFrom) return 0;
    const split = this.launchDuration;
    if (tauFrom < split && tauTo > split) return this.stripArea(column, tauFrom, split) + this.stripArea(column, split, tauTo);
    return this.stripArea(column, tauFrom, tauTo);
  }

  stripArea(column, tauFrom, tauTo) {
    const cosAngle = this.columnCos[column];
    const sinAngle = this.columnSin[column];
    const speedFactor = this.columnSpeedFactor[column];
    const thicknessFactor = this.columnThicknessFactor[column];
    const fingerFactor = this.columnFingerFactor[column];
    const rimShape = this.columnRimShape?.[column];
    const from = this.evaluate(tauFrom, cosAngle, sinAngle, speedFactor, thicknessFactor, this.state, 0, fingerFactor, false, rimShape);
    const fromX = from.x, fromY = from.y, fromZ = from.z, fromRadius = from.radialDistance;
    const to = this.evaluate(tauTo, cosAngle, sinAngle, speedFactor, thicknessFactor, this.stateOther, 0, fingerFactor, false, rimShape);
    const length = Math.sqrt((to.x - fromX) ** 2 + (to.y - fromY) ** 2 + (to.z - fromZ) ** 2);
    return length * 0.5 * (fromRadius + to.radialDistance) * this.columnWidths[column];
  }

  /**
   * Turn the strip of one column between two launch times into the given
   * number of droplets (fractions carry over), spread over it by area.
   */
  spawnFromStrip(column, tauFrom, tauTo, end, droplets, density, splash) {
    const pieces = Math.min(Math.max(1, Math.ceil(((tauTo - tauFrom) / Math.max(end, 1e-6)) * this.rows)), this.rows);
    const pieceAreas = this.pieceAreas;
    let totalArea = 0;
    for (let piece = 0; piece < pieces; piece++) {
      pieceAreas[piece] = this.stripArea(column, tauFrom + ((tauTo - tauFrom) * piece) / pieces, tauFrom + ((tauTo - tauFrom) * (piece + 1)) / pieces);
      totalArea += pieceAreas[piece];
    }
    if (totalArea <= 0) return;
    const halfWidth = 0.5 * this.columnWidths[column];
    const state = this.state;
    for (let piece = 0; piece < pieces; piece++) {
      const pieceFrom = tauFrom + ((tauTo - tauFrom) * piece) / pieces;
      const pieceTo = tauFrom + ((tauTo - tauFrom) * (piece + 1)) / pieces;
      this.tearCarry += droplets * pieceAreas[piece] / totalArea;
      while (this.tearCarry >= 1) {
        this.tearCarry -= 1;
        const angle = this.columnAngle[column] + randomRange(-halfWidth, halfWidth);
        this.evaluateAt(randomRange(pieceFrom, pieceTo), angle, state);
        // Each drop holds the volume of the patch of sheet it came from.
        const volumeRadius = Math.cbrt((3 * state.thickness) / (4 * Math.PI * density));
        const radius = THREE.MathUtils.clamp(volumeRadius * randomRange(0.7, 1.25), this.minDropRadius, this.maxDropRadius);
        const scatter = 0.04 * Math.sqrt(state.vx * state.vx + state.vy * state.vy + state.vz * state.vz) + 0.05;
        splash.spawnDroplet(
          state.x, state.y, state.z,
          state.vx + randomRange(-scatter, scatter),
          state.vy + randomRange(-scatter, scatter),
          state.vz + randomRange(-scatter, scatter),
          radius,
        );
      }
    }
  }

  // ---- per rendered frame -------------------------------------------------

  /** Evaluate the grid at the given splash time and upload it; place the fingers' beads. */
  updateGeometry(time) {
    this.age = time - this.startTime;
    const end = this.feedEnd();
    const state = this.state;
    // Row by row: until the sheet tears a row shares its launch time, which launchAt then works out once.
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const vertex = row * this.columns + column;
        const front = Math.min(this.tearFront[column], end);
        const tau = this.rowTau(row, front, end);
        this.evaluate(tau, this.columnCos[column], this.columnSin[column], this.columnSpeedFactor[column], this.columnThicknessFactor[column], state, front, this.columnFingerFactor[column], false, this.columnRimShape?.[column]);
        this.positions[vertex * 3] = state.x;
        this.positions[vertex * 3 + 1] = state.y;
        this.positions[vertex * 3 + 2] = state.z;
        this.thicknesses[vertex] = state.thickness;
        this.rowTaus[vertex] = tau - front;
      }
    }
    holdWithinWalls(this.positions, this.walls);
    if (!this.beadsGone) for (const finger of this.fingers) this.placeBead(finger, this.beadShare(finger));

    // Normals from the grid; near the rim the bead's normal also leans along
    // the sheet towards the edge, as a tube's does, and across a finger
    // towards its sides (FINGER_LEAN at its roots), as a rod's does.
    const positions = this.positions;
    const columns = this.columns;
    const sealed = this.sealedShare();
    computeGridNormals(positions, this.normals, this.rows, columns, this.wrap);
    for (let column = 0; column < columns; column++) {
      const across = this.columnAcross[column];
      const front = Math.min(this.tearFront[column], end);
      const previous = (column + columns - 1) % columns, next = (column + 1) % columns;
      for (let row = 0; row < this.rows; row++) {
        const vertex = row * columns + column;
        const before = Math.max(row - 1, 0) * columns + column;
        const after = Math.min(row + 1, this.rows - 1) * columns + column;
        const alongX = positions[after * 3] - positions[before * 3];
        const alongY = positions[after * 3 + 1] - positions[before * 3 + 1];
        const alongZ = positions[after * 3 + 2] - positions[before * 3 + 2];
        const alongLength = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
        const merged = this.seal && front === 0 ? sealed : 0;
        const bend = alongLength > 1e-9 ? 1.4 * (1 - smoothstep(0, BEAD_END, this.rowTaus[vertex] / this.launchDuration)) * (1 - merged) / alongLength : 0;
        let leanX = 0, leanY = 0, leanZ = 0;
        const share = across === 0 ? 0 : 1 - smoothstep(0, FINGER_ROOT, (this.rowTaus[vertex] + front) / this.launchDuration);
        if (share > 0) {
          const aroundX = positions[(row * columns + next) * 3] - positions[(row * columns + previous) * 3];
          const aroundY = positions[(row * columns + next) * 3 + 1] - positions[(row * columns + previous) * 3 + 1];
          const aroundZ = positions[(row * columns + next) * 3 + 2] - positions[(row * columns + previous) * 3 + 2];
          const aroundLength = Math.sqrt(aroundX * aroundX + aroundY * aroundY + aroundZ * aroundZ);
          const lean = aroundLength > 1e-9 ? (FINGER_LEAN * across * share) / aroundLength : 0;
          leanX = aroundX * lean; leanY = aroundY * lean; leanZ = aroundZ * lean;
        }
        this.rimTangents[vertex * 3] = -alongX * bend + leanX;
        this.rimTangents[vertex * 3 + 1] = -alongY * bend + leanY;
        this.rimTangents[vertex * 3 + 2] = -alongZ * bend + leanZ;
        this.rods[vertex] = share > 0.5 && Math.abs(across) < 1 ? 1 : 0;
      }
    }
    markChanged(this.geometry, ['position', 'normal', 'aRimTangent', 'aThickness', 'aRod']);
  }

  dispose() {
    this.geometry.dispose();
  }
}
