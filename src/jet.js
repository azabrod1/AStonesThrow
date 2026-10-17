// The Worthington jet: the water fired up the axis when the air cavity behind
// a stone pinches off (src/cavity.js; the splash starts it at the pinch-off).
//
// The hole's walls meet on the axis at the pinch and fire water up it, from
// the floor of the bowl that is left above the neck. The reference
// simulation (tools/basilisk, a 3 cm stone straight in at 6.3 m/s) shows three
// parts: a needle a few millimetres thick that clears the surface within about
// 10 ms at 13 to 16 m/s, shedding drops of 2 to 6 mm; the column's body under
// it, slower; and, as the bowl fills, a broad slow base that the collapse
// builds under the column, 5 cm across at the surface 0.25 s after entry. The
// column is all of it: water launched from a point on the jet's axis, each
// element then flying ballistically under gravity alone (a column is not a
// sheet, so there is no drag), so it is a closed form in launch time tau,
// azimuth and time.
//
// The launch. In the bowl's time unit sqrt(z_p/g) (z_p the pinch depth, the
// collapse's own time scale; src/cavity.js bowlUnit) the material leaves over
// T_end = LAUNCH_END, at
//
//   u(tau) = U·(BASE_SPEED + (1 − BASE_SPEED)·(1 − tau/T_end)^BODY_POWER) + (form.needle·U − U)·exp(−tau/NEEDLE_TIME)
//
// (U the body's speed, which the splash sets from the entry speed), so the
// needle leaves first and fastest and the column stretches as it rises, and
// the base's last material still leaves at BASE_SPEED·U, standing wide on the
// water. Its launch radius r0(tau) is a core growing from NEEDLE_RADIUS·Rj to
// BODY_RADIUS·Rj over BODY_GROWTH of T_end (the needle, then the body) plus
// the base, growing as (tau/T_end)^BASE_POWER to BASE_RADIUS·Rj at T_end times
// a scale chosen so that the jet launches the volume the splash gives it (a
// share of the water that fills the bowl, src/splash.js JET_SHARE): the late,
// slow material is the broad base. Rj is the stone's radius R times
// (R / 3 cm)^JET_RADIUS_POWER (times form.radiusScale): a jet is thinner the
// more singular the cavity's collapse, that is the higher the Froude number
// V²/(g·R) (Gekle & Gordillo 2010 find thinner, faster jets as it grows), and
// at a given entry speed a big stone's is lower, so its jet is fatter than a
// scaled-up copy of a small one's. The launch point is on the jet's axis
// (through where the hole closes, tilted by the lean) at the bowl's floor: it
// starts at the pinch depth and follows the floor up as the bowl fills
// (src/cavity.js bowlFloorAt), at most RISE_SHARE of the launch speed (the
// neck zips up faster than any of it leaves), so the late material leaves near
// the surface; the launch depth and the launched volume are tabulated once
// (LAUNCH_SAMPLES). Elements leave along the lean with a tilt of up to 5° per
// jet plus a lateral wobble of about 1% of u (times form.wobble) along the
// main launch, so the column leans and bends gently. The splash leans it by
// `lean` (back along an oblique stone's path, see JET_LEAN, and towards a
// lopsided hole's bulge, src/splash.js): its launch direction is cos(lean) up
// and sin(lean) across before the tilt. Its elements keep that sideways speed
// while gravity turns them, so a leaning column arcs over like a fountain and
// its drops land well downrange; a whip (form.bend) leans the tip's elements
// more than the base's, by bend·(1/2 − tau/T) of u across (T the main launch,
// below), so a leaning column curves away rather than standing as a rod. With
// a = t − tau,
//
//   position = launch point(tau) + u·direction(tau)·a − ½·g·a²·up
//
// and ∂position/∂tau, the spacing of neighbouring elements, is closed form
// (the launch point's rise included). Volume is conserved: an element carries
// π·r0²·(u − w)·dtau (w the launch point's rise along the axis, the flux at
// least LEAST_FLUX of a still point's) spread over |∂position/∂tau|·dtau of
// column, so the column radius is r0·sqrt((u − w)/|∂position/∂tau|), capped at
// BUNCH_CAP·r0 where elements bunch (a fat foot). The material launched in the
// first MAIN_SHARE of T_end, the needle and the body (T, the main launch),
// breaks into drops; the base falls back. For a 3 cm stone dropped in at
// 6.3 m/s the clean form's needle leaves at 14 m/s and clears the surface
// about 17 ms after the pinch, 131 ms after entry, at 14 m/s (the reference:
// 118 ms, 13 to 16 m/s); 0.25 s after entry the column is about 6 cm across
// at the water, 5 cm across 5 cm up and 3 cm across at mid-height (the
// reference: 6, 4.5 and 3 cm), launched with about 0.6 litres, most of it in
// the base, and its top stands 60 to 70 cm up at 0.4 to 0.5 s (the
// reference's joined top, 75 to 81 cm by 0.33 s and coasting on to 1.39 m at
// 0.67 s, is an upper bound: its needle focused perfectly on its axis and
// never broke).
//
// The column's free end is a cap. At first it is the tip bulb, the material
// of the first bead's share of T (form.beadShares, BULB_SHARE when the form
// gives none) gathered into a ball of form.firstBulb launch radii r0(0) (1.6
// for the default form: a radius of 3 mm on a 3 cm stone's needle, as the
// reference's first tip drops), grown in as it emerges. Once it has cleared the surface it
// pinches off after form.gatherScale capillary times sqrt(ρ·r³/σ) of its own,
// or sooner once the neck just behind it is thinner than form.neckRatio of the
// bulb, or at the latest when it starts to fall: one drop with the bulb's
// radius and velocity (a split tip: two side by side, parting at 0.12 to
// 0.3 m/s), up to form.tipSatellites satellites of SATELLITE_LEAST to
// SATELLITE_MOST of its radius from its neck, a little slower, and one to four
// fine drops (times form.spray). For the reference throw the first leaves
// 135 ms after entry, 3 mm in radius, at 12 m/s (the reference's: 2.4 and
// 3.7 mm from 120 ms on). The next bead's material then gathers into a new bulb (radius from
// its volume) over form.gatherScale capillary times, thinning the neck under
// it, and pinches again, up to form.tipBeads drops while the end still rises;
// a form with no tip beads keeps its bulb on the column until the column
// breaks, when the bulb leaves first, unless its needle is faster than
// NEEDLE_HOLD times the body, which no bulb survives: it pinches one. Then the
// column breaks from the top down, a piece at a time: each piece, the
// material for one drop of 1.9 local column radii (the Rayleigh–Plateau size,
// times form.dropSpread: 0.65 to 1.35, but at most form.dropCap of DROP_MOST·Rj,
// less up to 17% at random), gathers into a bulb at the end and pinches off
// BREAK_PACE capillary times sqrt(ρ·r³/σ) of its local column after the last
// (times form.breakScale and half to one and a half at random, so the rhythm
// is ragged: a needle sheds a drop every few milliseconds, a column a
// centimetre thick one a tenth of a second), with the local velocity, a
// scatter (times form.scatter) and, at form.satellites odds, a small
// satellite, and a ragged column sheds fine spray as it parts (form.spray over
// 1). A ragged form starts that breakup at form.breakAt (s), whatever its tip
// is doing. Volumes are kept, so the drop count follows the column. Before it
// breaks the column grows varicose beads with the drop spacing (radius ±6%
// while it rises fast, ±12% as it slows, up to ±45% just below the front,
// necks where the pieces will part), which catch the sun; form.irregularity
// makes their spacing and size uneven, by two waves of their own along the
// launch.
//
// Forms. CLEAN_FORM is a clean jet; src/splash.js (jetForm) draws each
// throw's form: a clean jet varies its needle, its tip beads (none to four, of
// 3.5 to 9.5% of T each), its first bulb, neck, bead sizes, satellites,
// wobble, irregularity and breakup; a leaning one whips; a stubby one is fat
// and slow, with hardly a needle (radiusScale over 1, few tip beads, slow
// breakup); a ragged one has a small bulb, breaks from the top within a
// quarter of its rise, fast, into drops of very mixed sizes flung wide with
// spray; a split jet is two columns, each with `share` of the water (its radii
// scaled by sqrt(share)); the form of a throw with no jet ('none') is a fat
// column launched at a fifth of the speed with no needle once the bowl has
// nearly filled, a glassy mound a few centimetres high that subsides in small
// drops. Every draw comes from the jet's own random stream (`random`), so a
// seeded throw's jet is the same however the frames fell.
//
// Meanwhile the column's foot is the element now crossing BASE_DEPTH below
// the bowl's floor (or the surface, once the bowl has flattened): the launch
// point while the jet is fed, then climbing the column as the slow base falls
// back. The foot stands on the water: over its last FOOT_ROWS rows the rings
// turn level (no faster than their spacing allows, so they never cut through
// each other), never narrow downward and widen at most FOOT_SLOPE per unit of
// height, and its last ring slides down the column's axis until none of it
// stands above the water. The column is spent once the foot has climbed to
// within half a piece of its end, or what is left has come down onto the
// water (within three of its radii, where a tube bent as tightly as a falling
// stub bends would fold into itself): then a stub still in the air becomes one
// last drop, and the water gets, where the foot element has gone (downrange of
// the collapse point when the column leans), a mound (height 0.22·R times the
// strength: the cube root of the fallen volume against FALLBACK_VOLUME, times
// (R / 3 cm)^FALLBACK_SIZE, which keeps the strength of the rings the pond's
// waves were calibrated with, the earlier jet having fallen back a volume
// growing as R^3.6 where this one's grows as R^2.4) with foam, a patch of foam
// specks in a disc of 1.6·R (FALLBACK_SPECKS times the strength) and a small
// secondary ring's push, which the splash leaves out (columnWater): the stone's
// ring (RING in src/splash.js) is fitted to a reference ring that holds it.
//
// updateGeometry() evaluates a ROWS × COLUMNS ring grid (src/fluidMesh.js)
// once per rendered frame: CAP_ROWS rows of the cap's upper half, then rows
// placed by arc length below the cap's centre, crowded towards it where the
// bulb, neck and beads are, each ring the larger of column and bulb, smoothly
// blended, down to the foot. update() runs every simulation substep and
// checks the tip, while the breakup advances once per rendered frame:
// whenever a frame's worth of simulated time (SplashSystem.frameSeconds) has
// passed, so it moves on every frame at any time scale (a column that has come
// down onto the water falls back at once). SplashSystem draws the mesh with
// the column materials in src/shaders/sheet.js through the droplets'
// screen-space fluid passes, where the composite shades it as a glass lens;
// drops of LENS_DROP_RADIUS and more are flagged to be drawn the same way
// (with their motion streak held short), so the tip drop looks like the bulb
// it was. Below the bowl's floor the column is inside the water, and the
// cavity's walls hide it. In the pool (`walls`, set by SplashSystem) the
// column is held inside its walls (holdWithinWalls in src/fluidMesh.js).
import * as THREE from 'three';
import { createRingGrid, computeGridNormals, holdWithinWalls, markChanged } from './fluidMesh.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;     // the stone size the tuning constants were set for
const ROWS = 48;                   // end cap (row 0, a pole) to foot
const COLUMNS = 24;                // around the axis
const CAP_ROWS = 6;                // rows of the cap's upper half, pole to 75°
const ROW_POWER = 1.6;             // rows below the cap crowd towards it, where the bulb and beads are
const FOOT_ROWS = 5;               // the last rows, the foot, never narrow downward...
const FOOT_SLOPE = 1.5;            // ...nor widen by more than this per unit of height
const ARC_SAMPLES = 40;            // centreline samples for placing rows by arc length
const BASE_DEPTH = 0.004;          // the foot is where the column dips this far under the water (or the bowl's floor)
// The launch (the header), in the bowl's time unit sqrt(z_p/g) and the body's speed U.
const LAUNCH_END = 1.63;           // T_end: the last material leaves this long after the pinch...
const MAIN_SHARE = 0.4;            // ...and what leaves before this share of it (T, the main launch) breaks into drops
const NEEDLE_TIME = 0.026;         // the needle's extra speed decays over this
const NEEDLE = 3.0;                // the needle's first material leaves at this many times U (form.needle)
const BODY_POWER = 1.6;            // the body's speed falls as U·(1 − tau/T_end)^this...
const BASE_SPEED = 0.12;           // ...to this share of U, the base's last material, so the foot stands wide on the water
const NEEDLE_RADIUS = 0.065;       // launch radius in Rj: the needle's...
const BODY_RADIUS = 0.27;          // ...the body's, reached over BODY_GROWTH of T_end...
const BODY_GROWTH = 0.12;
const BASE_RADIUS = 1.67;          // ...and the base's at T_end, growing as (tau/T_end)^BASE_POWER
const BASE_POWER = 0.8;
const RISE_SHARE = 0.6;            // the launch point rises with the bowl's floor at most this share of the launch speed
const LEAST_FLUX = 0.1;            // the flux through a rising launch point is at least this share of a still one's
const LAUNCH_SAMPLES = 96;         // the launch depth and volume are tabulated at these many times, denser early
const DEFAULT_PINCH = 7.5;         // in R: with no bowl given, the jet's time unit is sqrt(this·R/g) and it leaves from the surface
const JET_RADIUS_POWER = 0.25;     // the column's radii in R·(R / 3 cm)^this: fatter at a lower Froude number
const MAX_TILT = THREE.MathUtils.degToRad(5);
const WOBBLE = 0.01;               // lateral launch velocity over launch speed (0.1 of the old drops' scatter)
const BULB_SHARE = 0.015;          // a tip bulb is the material of this fraction of T
const FIRST_BULB = 1.6;            // the first bulb's radius in launch radii at the tip
const NECK_RATIO = 0.45;           // the tip pinches when the neck is this thin against the bulb
const NECK_THINNING = 0.6;         // a gathering bulb thins the neck under it by up to this fraction
const BUNCH_CAP = 1.4;             // the column never fattens beyond this many launch radii
const END_CAP = 1.15;              // a free end rounds into a cap this many column radii wide
const TIP_BEADS = 2;               // tip drops a jet pinches off at most, unless its form says otherwise
const NEEDLE_HOLD = 1.5;           // a needle faster than this many times the body cannot keep its bulb: it pinches at least one
const DROP_RADII = 1.9;            // breakup drops in local column radii (Rayleigh–Plateau)...
const DROP_MOST = 0.3;             // ...at most this many Rj (times form.dropCap)
const RIPPLE_RISING = 0.06;        // varicose amplitude (of the radius) while the jet rises...
const RIPPLE_SLOWING = 0.12;       // ...once it has slowed, and anywhere during the breakup
const RIPPLE_FRONT = 0.33;         // extra amplitude just below the breakup front, decaying over RIPPLE_DEPTH drops
const RIPPLE_DEPTH = 2;
const BREAK_PACE = 1.0;            // a breakup piece pinches off this many capillary times sqrt(ρ·r³/σ) of its column after the last
const FALLBACK_VOLUME = 2.9e-4;    // m³: a fallen volume this big from a 3 cm stone makes a mound and a ring of strength 1...
const FALLBACK_SIZE = 0.43;        // ...times (R / 3 cm)^this, so the rings keep the strength they were calibrated with (the header)
const FALLBACK_SPECKS = 110;       // foam specks where the jet falls back, times the mound's strength
const LENS_DROP_RADIUS = 0.002;    // drops this big are drawn as glass like the column
const WATER_DENSITY = 1000;
const SURFACE_TENSION = 0.072;
const SATELLITE_LEAST = 0.2;       // a satellite is this to SATELLITE_MOST of the drop it follows, in radius
const SATELLITE_MOST = 0.45;
const RIPPLE_WAVES = [3.1, 6.7];   // the beads' irregular spacing and size: two waves over the main launch window, in cycles
const BULB_MOST = 0.32;            // a tip bulb's radius is at most this many stone radii

/**
 * A jet's form (the header): what makes one Worthington jet unlike another.
 * The splash picks these per throw (src/splash.js); the defaults are a clean
 * jet. `share` is the jet's part of the water (a split jet's columns share it).
 */
export const CLEAN_FORM = Object.freeze({
  tipBeads: TIP_BEADS,       // tip drops pinched off at most (0: the bulb stays on until the column breaks)
  beadShares: null,          // each tip bead's material in shares of T (BULB_SHARE when null)
  firstBulb: FIRST_BULB,     // the first bulb's radius in launch radii at the tip (at most BULB_MOST stone radii)
  gatherScale: 0.4,          // a tip bead gathers over this many capillary times sqrt(ρ·r³/σ)
  neckRatio: NECK_RATIO,     // the first tip pinches when its neck is this thin against the bulb
  needle: NEEDLE,            // the needle's first material leaves at this many times the body's speed
  radiusScale: 1,            // the column's radii
  breakScale: 1,             // the breakup's pace, in BREAK_PACE capillary times a piece
  breakAt: null,             // an age (s) at which the column starts breaking from the top, whatever its tip does (a ragged jet)
  dropSpread: [0.65, 1.35],  // breakup drops in Rayleigh–Plateau sizes (DROP_RADII local radii)...
  dropCap: 0.9,              // ...at most this many DROP_MOST·Rj
  scatter: 1,                // the breakup drops' velocity scatter
  satellites: 0.6,           // the chance of a satellite after each breakup drop
  tipSatellites: 1,          // satellites after each tip drop, at most (0 to this)
  spray: 1,                  // the neck's fine spray at each pinch
  wobble: 1,                 // the column's lateral wobble
  irregularity: 0.25,        // the varicose beads' spacing and size, off by up to this share
  splitTip: false,           // the first tip drop leaves as two drops side by side
  bend: 0,                   // a whip: the tip leaves leaning this share of the launch speed more than the base (towards the lean)
  share: 1,                  // the jet's part of the water
});

const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};
const smoothMax = (first, second, softness) => 0.5 * (first + second + Math.sqrt((first - second) ** 2 + softness * softness));
const sphereRadius = (volume) => Math.cbrt((3 * volume) / (4 * Math.PI));
const NO_BOWL = (age, out) => { out.depth = 0; out.rise = 0; return out; };

export class JetColumn {
  /**
   * @param x,z where the hole closes: the jet's axis meets the surface there
   * @param radius the stone's radius
   * @param speed the body's launch speed U (the needle's first material leaves at form.needle times it)
   * @param startTime splash time of the pinch-off
   * @param budget droplets the jet may spawn in all (tip drops and breakup drops are never refused)
   * @param material the material the mesh starts with (the splash swaps it per pass)
   * @param lean how far the column leans from vertical (radians), towards the unit direction (leanX, leanZ)
   * @param form the jet's form (CLEAN_FORM's fields, the header)
   * @param random the jet's own random stream (0 to 1), so a seeded throw's jet comes out the same
   * @param floor (age, out) → out {depth, rise}: the bowl's floor (src/cavity.js bowlFloorAt) at an age of the jet
   * @param bowlUnit the bowl's time unit (s): sqrt(z_p/g) (src/cavity.js bowlUnit)
   * @param volume the water it launches (m³; the base's radius is scaled to it), or null for the base's own
   */
  constructor({ x, z, radius, speed, startTime, budget, material, lean = 0, leanX = 0, leanZ = 0, form = null, random = Math.random, floor = null, bowlUnit = null, volume = null }) {
    this.form = { ...CLEAN_FORM, ...form };
    this.random = random;
    this.centreX = x;
    this.centreZ = z;
    this.radius = radius;
    this.sizeFactor = radius / REFERENCE_RADIUS;
    this.columnRadius = radius * this.sizeFactor ** JET_RADIUS_POWER * this.form.radiusScale * Math.sqrt(this.form.share);   // Rj in the header
    this.bodySpeed = speed;
    this.tipSpeed = speed * Math.max(this.form.needle, 1);   // the needle's first material, the fastest
    this.tipBeads = this.form.tipBeads === 0 && this.form.needle > NEEDLE_HOLD ? 1 : this.form.tipBeads;
    this.startTime = startTime;
    this.walls = null;   // the pool's walls, inset (src/splash.js setGround), or none
    this.age = 0;
    this.finished = false;
    this.budget = budget;
    this.floor = floor ?? NO_BOWL;
    const unit = bowlUnit ?? Math.sqrt((DEFAULT_PINCH * radius) / GRAVITY);
    this.launchEnd = LAUNCH_END * unit;
    this.launchDuration = MAIN_SHARE * this.launchEnd;   // T, the main launch: what breaks into drops
    this.needleTime = NEEDLE_TIME * unit;

    // Launch direction per unit speed: up by cos(lean), across by sin(lean),
    // plus the jet's own small tilt (and the wobble, in evaluate).
    this.upShare = Math.cos(lean);
    this.leanX = Math.sin(lean) * leanX;
    this.leanZ = Math.sin(lean) * leanZ;
    // The axis below the closure, per metre of depth (the launch point is on it).
    this.axisSlopeX = Math.tan(lean) * leanX;
    this.axisSlopeZ = Math.tan(lean) * leanZ;
    const tilt = this.range(0, MAX_TILT);
    const heading = this.range(0, Math.PI * 2);
    this.tiltX = this.leanX + Math.tan(tilt) * Math.cos(heading);
    this.tiltZ = this.leanZ + Math.tan(tilt) * Math.sin(heading);
    // The whip (form.bend): across by bend·(1/2 − tau/T) of the launch speed,
    // towards the lean, or a heading of its own for an upright jet.
    const bendHeading = lean > 1e-6 ? Math.atan2(leanZ, leanX) : this.range(0, Math.PI * 2);
    this.bendX = this.form.bend * Math.cos(bendHeading);
    this.bendZ = this.form.bend * Math.sin(bendHeading);
    // Lateral wobble along the launch window: two slow modes per axis.
    const mode = (amplitude, cycles) => ({
      amplitude: WOBBLE * this.form.wobble * amplitude * this.range(0.6, 1) * (this.random() < 0.5 ? -1 : 1),
      frequency: (Math.PI * 2 * cycles * this.range(0.8, 1.25)) / this.launchDuration,
      phase: this.range(0, Math.PI * 2),
    });
    this.wobbleX = [mode(0.8, 0.7), mode(0.5, 1.6)];
    this.wobbleZ = [mode(0.8, 0.7), mode(0.5, 1.6)];
    this.baseScale = 1;
    this.buildLaunch(volume);

    // The end of the column: launch time of its first material, and the bulb
    // gathering there (the material of `span` launch seconds, which becomes a
    // drop of radius `bulbRadius`).
    this.phase = 'tip';                // 'tip', then 'breakup'
    this.tipDrops = 0;
    this.endTau = 0;
    this.span = this.beadShare(0) * this.launchDuration;
    this.firstBulbRadius = Math.min(this.form.firstBulb * this.launchRadius(0), BULB_MOST * radius);
    this.maxDropRadius = this.form.dropCap * DROP_MOST * this.columnRadius;
    this.bulbRadius = this.firstBulbRadius;
    this.gatherStart = 0;
    this.gatherTime = 0;
    this.emerged = null;               // the age at which the first bulb cleared the surface
    this.pieceStart = 0;               // the age at which the current breakup piece started to gather...
    this.nextPinch = 0;                // ...and the age at which it pinches off
    this.breakClock = 0;               // simulated time since the breakup last advanced
    this.dropsSpawned = 0;

    this.positions = new Float32Array(ROWS * COLUMNS * 3);
    this.normals = new Float32Array(ROWS * COLUMNS * 3);
    this.radii = new Float32Array(ROWS * COLUMNS);
    this.roundness = new Float32Array(ROWS * COLUMNS);
    this.mesh = createRingGrid(ROWS, COLUMNS, {
      position: [this.positions, 3],
      normal: [this.normals, 3],
      aRadius: [this.radii, 1],
      aRound: [this.roundness, 1],
    }, material);
    this.geometry = this.mesh.geometry;
    this.columnCos = new Float64Array(COLUMNS);
    this.columnSin = new Float64Array(COLUMNS);
    for (let column = 0; column < COLUMNS; column++) {
      this.columnCos[column] = Math.cos((column / COLUMNS) * Math.PI * 2);
      this.columnSin[column] = Math.sin((column / COLUMNS) * Math.PI * 2);
    }
    this.arcTaus = new Float64Array(ARC_SAMPLES);
    this.arcLengths = new Float64Array(ARC_SAMPLES);
    this.arcPhases = new Float64Array(ARC_SAMPLES);
    const rowArray = () => new Float64Array(ROWS - CAP_ROWS);
    this.rows = { x: rowArray(), y: rowArray(), z: rowArray(), axisX: rowArray(), axisY: rowArray(), axisZ: rowArray(), radius: rowArray(), water: rowArray(), round: rowArray() };   // the rows below the cap, before they are written
    // The beads' irregularity: two waves along the launch time, of their own phases.
    this.rippleWaves = RIPPLE_WAVES.map((cycles) => ({ frequency: (Math.PI * 2 * cycles * this.range(0.8, 1.25)) / this.launchDuration, phase: this.range(0, Math.PI * 2) }));
    this.state = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, axisX: 0, axisY: 1, axisZ: 0, spacing: 0, radius: 0 };
    this.end = { tau: 0, radius: 0, gather: 0, neckGather: 0 };
    this.bowl = { depth: 0, rise: 0 };
  }

  /** A draw from the jet's stream between two values. */
  range(low, high) { return low + this.random() * (high - low); }

  // ---- the model --------------------------------------------------------

  /**
   * Tabulate the launch (the header): at LAUNCH_SAMPLES + 1 launch times,
   * crowded towards the start (tau = T_end·(i/n)²), the launch point's depth
   * below the surface (rising with the bowl's floor, at most RISE_SHARE of the
   * launch speed) and the volume launched so far. Given a volume, the base's
   * radius is scaled so that the jet launches just that: the volume is a
   * quadratic in the scale k, A + 2·B·k + C·k² over the needle's and body's
   * radius and the base's.
   */
  buildLaunch(target) {
    const samples = LAUNCH_SAMPLES;
    this.launchTaus = new Float64Array(samples + 1);
    this.launchDepths = new Float64Array(samples + 1);
    this.launchVolumes = new Float64Array(samples + 1);
    const cores = new Float64Array(samples + 1), crosses = new Float64Array(samples + 1), bases = new Float64Array(samples + 1);
    const bowl = { depth: 0, rise: 0 };
    let depth = this.floor(0, bowl).depth;
    let core = 0, cross = 0, base = 0;
    this.launchDepths[0] = depth;
    for (let index = 1; index <= samples; index++) {
      const tau = this.launchEnd * (index / samples) ** 2;
      const previous = this.launchTaus[index - 1];
      const step = tau - previous;
      const middle = 0.5 * (previous + tau);
      const speed = this.launchSpeed(middle);
      const floorDepth = this.floor(tau, bowl).depth;
      const rose = Math.min(Math.max(depth - floorDepth, 0), RISE_SHARE * speed * this.upShare * step);
      depth = Math.max(depth - rose, Math.min(floorDepth, depth));
      // The flux through the launch point, which rises along the axis at rose/(step·cos lean).
      const flux = Math.PI * Math.max(speed - rose / (step * this.upShare), LEAST_FLUX * speed) * step;
      const coreRadius = this.coreRadius(middle), baseRadius = this.baseRadius(middle);
      core += coreRadius * coreRadius * flux;
      cross += coreRadius * baseRadius * flux;
      base += baseRadius * baseRadius * flux;
      this.launchTaus[index] = tau;
      this.launchDepths[index] = depth;
      cores[index] = core; crosses[index] = cross; bases[index] = base;
    }
    if (target !== null && base > 0) {
      const excess = core - target;
      this.baseScale = excess >= 0 ? 0 : (-cross + Math.sqrt(cross * cross - base * excess)) / base;
    }
    const scale = this.baseScale;
    for (let index = 0; index <= samples; index++) this.launchVolumes[index] = cores[index] + 2 * scale * crosses[index] + scale * scale * bases[index];
  }

  /** The launch table's interval holding tau and the blend across it, into `out` {index, blend}. */
  launchSample(tau, out) {
    const position = Math.sqrt(Math.min(Math.max(tau, 0), this.launchEnd) / this.launchEnd) * LAUNCH_SAMPLES;
    const index = Math.min(Math.floor(position), LAUNCH_SAMPLES - 1);
    const span = this.launchTaus[index + 1] - this.launchTaus[index];
    out.index = index;
    out.blend = span > 0 ? Math.min(Math.max((tau - this.launchTaus[index]) / span, 0), 1) : 0;
    return out;
  }

  /** The launch point's depth below the surface (along the axis's height) for the material launched at tau. */
  launchDepth(tau) {
    const sample = this.launchSample(tau, this.sample ??= {});
    return this.launchDepths[sample.index] + (this.launchDepths[sample.index + 1] - this.launchDepths[sample.index]) * sample.blend;
  }

  /** How fast the launch point rises (m/s, vertically) at tau. */
  launchRise(tau) {
    if (tau >= this.launchEnd) return 0;
    const sample = this.launchSample(tau, this.sample ??= {});
    const span = this.launchTaus[sample.index + 1] - this.launchTaus[sample.index];
    return span > 0 ? (this.launchDepths[sample.index] - this.launchDepths[sample.index + 1]) / span : 0;
  }

  launchSpeed(tau) {
    if (tau >= this.launchEnd) return BASE_SPEED * this.bodySpeed;
    const body = this.bodySpeed * (BASE_SPEED + (1 - BASE_SPEED) * Math.max(1 - tau / this.launchEnd, 0) ** BODY_POWER);
    return body + (this.tipSpeed - this.bodySpeed) * Math.exp(-tau / this.needleTime);
  }

  /** d launchSpeed / d tau. */
  launchSpeedSlope(tau) {
    if (tau >= this.launchEnd) return 0;
    return (-this.bodySpeed * (1 - BASE_SPEED) * BODY_POWER / this.launchEnd) * Math.max(1 - tau / this.launchEnd, 0) ** (BODY_POWER - 1)
      - ((this.tipSpeed - this.bodySpeed) / this.needleTime) * Math.exp(-tau / this.needleTime);
  }

  launchRadius(tau) { return this.coreRadius(tau) + this.baseScale * this.baseRadius(tau); }

  /** The needle's and the body's part of the launch radius (the header). */
  coreRadius(tau) {
    const share = Math.min(Math.max(tau / this.launchEnd, 0), 1);
    return this.columnRadius * (NEEDLE_RADIUS + (BODY_RADIUS - NEEDLE_RADIUS) * (1 - Math.exp(-share / BODY_GROWTH)));
  }

  /** The base's part of the launch radius, before its scale (the header). */
  baseRadius(tau) {
    const share = Math.min(Math.max(tau / this.launchEnd, 0), 1);
    return this.columnRadius * (BASE_RADIUS - BODY_RADIUS) * share ** BASE_POWER;
  }

  /** The material of the index-th tip bead, in shares of T. */
  beadShare(index) { return this.form.beadShares?.[index] ?? BULB_SHARE; }

  /** The beads' irregularity at launch time tau, −1 to 1: `second` takes the other quadrature, for their sizes. */
  rippleNoise(tau, second = false) {
    const [first, other] = this.rippleWaves;
    return second
      ? 0.6 * Math.cos(first.frequency * tau + first.phase) + 0.4 * Math.cos(other.frequency * tau + other.phase)
      : 0.6 * Math.sin(first.frequency * tau + first.phase) + 0.4 * Math.sin(other.frequency * tau + other.phase);
  }

  /** Volume launched per second at launch time tau (through the rising launch point). */
  volumeRate(tau) {
    const launchRadius = this.launchRadius(tau);
    const speed = this.launchSpeed(tau);
    return Math.PI * launchRadius * launchRadius * Math.max(speed - this.launchRise(tau) / this.upShare, LEAST_FLUX * speed);
  }

  /** Volume launched between two launch times (from the table). */
  volume(tauFrom, tauTo) {
    tauFrom = Math.max(tauFrom, 0);
    tauTo = Math.min(tauTo, this.launchEnd);
    if (tauTo <= tauFrom) return 0;
    return this.launchedBy(tauTo) - this.launchedBy(tauFrom);
  }

  /** Volume launched by launch time tau. */
  launchedBy(tau) {
    const sample = this.launchSample(tau, this.sample ??= {});
    return this.launchVolumes[sample.index] + (this.launchVolumes[sample.index + 1] - this.launchVolumes[sample.index]) * sample.blend;
  }

  /** Height of the element launched at tau, now. */
  heightAt(tau) {
    const age = Math.max(this.age - tau, 0);
    return -this.launchDepth(tau) + this.launchSpeed(tau) * this.upShare * age - 0.5 * GRAVITY * age * age;
  }

  /**
   * State of the element launched at tau, now: position, velocity, the unit
   * axis of the column there (pointing to the end), the spacing
   * |∂position/∂tau| and the column radius.
   */
  evaluate(tau, out) {
    tau = Math.min(Math.max(tau, 0), this.launchEnd);
    const speed = this.launchSpeed(tau);
    const speedSlope = this.launchSpeedSlope(tau);
    const age = Math.max(this.age - tau, 0);
    let lateralX = this.tiltX, slopeX = 0, lateralZ = this.tiltZ, slopeZ = 0;
    if (this.bendX !== 0 || this.bendZ !== 0) {
      const main = tau < this.launchDuration;
      const along = main ? 0.5 - tau / this.launchDuration : -0.5;
      const alongSlope = main ? -1 / this.launchDuration : 0;
      lateralX += this.bendX * along; slopeX += this.bendX * alongSlope;
      lateralZ += this.bendZ * along; slopeZ += this.bendZ * alongSlope;
    }
    for (const mode of this.wobbleX) {
      const angle = mode.frequency * tau + mode.phase;
      lateralX += mode.amplitude * Math.sin(angle);
      slopeX += mode.amplitude * mode.frequency * Math.cos(angle);
    }
    for (const mode of this.wobbleZ) {
      const angle = mode.frequency * tau + mode.phase;
      lateralZ += mode.amplitude * Math.sin(angle);
      slopeZ += mode.amplitude * mode.frequency * Math.cos(angle);
    }
    // The launch point: on the axis, launchDepth below the surface, rising at `rise`.
    const depth = this.launchDepth(tau);
    const rise = this.launchRise(tau);
    out.x = this.centreX - this.axisSlopeX * depth + speed * lateralX * age;
    out.y = -depth + speed * this.upShare * age - 0.5 * GRAVITY * age * age;
    out.z = this.centreZ - this.axisSlopeZ * depth + speed * lateralZ * age;
    out.vx = speed * lateralX;
    out.vy = speed * this.upShare - GRAVITY * age;
    out.vz = speed * lateralZ;
    // ∂position/∂tau = the launch point's motion + (d launch velocity / d tau)·a − launch velocity + g·a·up.
    const alongX = this.axisSlopeX * rise + (speedSlope * lateralX + speed * slopeX) * age - speed * lateralX;
    const alongY = rise + (speedSlope * age - speed) * this.upShare + GRAVITY * age;
    const alongZ = this.axisSlopeZ * rise + (speedSlope * lateralZ + speed * slopeZ) * age - speed * lateralZ;
    const spacing = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
    out.spacing = spacing;
    if (spacing > 1e-9) { out.axisX = -alongX / spacing; out.axisY = -alongY / spacing; out.axisZ = -alongZ / spacing; } else { out.axisX = 0; out.axisY = 1; out.axisZ = 0; }
    const launchRadius = this.launchRadius(tau);
    const flux = Math.max(speed - rise / this.upShare, LEAST_FLUX * speed);
    out.radius = spacing > 1e-9 ? Math.min(launchRadius * Math.sqrt(flux / spacing), BUNCH_CAP * launchRadius) : BUNCH_CAP * launchRadius;
    return out;
  }

  /** Launch time of the material now at the foot: the column's base, where it dips under the bowl's floor or the surface. */
  footTau() {
    const threshold = -this.floor(this.age, this.bowl).depth - BASE_DEPTH;
    const limit = Math.min(this.age, this.launchEnd);
    if (this.heightAt(limit) >= threshold - 1e-7) return limit;
    let low = Math.min(this.endTau, limit);
    let high = limit;
    if (this.heightAt(low) < threshold) return low;
    for (let step = 0; step < 24; step++) {
      const middle = 0.5 * (low + high);
      if (this.heightAt(middle) >= threshold) low = middle; else high = middle;
    }
    return low;
  }

  /** Launch seconds of column that make one Rayleigh–Plateau drop where the column has the given local radius (irregular by the form). */
  rippleSpan(tau, localRadius) {
    const dropRadius = Math.min(DROP_RADII * Math.max(localRadius, 1e-4), this.maxDropRadius);
    return Math.max((((4 / 3) * Math.PI * dropRadius ** 3) / Math.max(this.volumeRate(tau), 1e-12)) * (1 + this.form.irregularity * this.rippleNoise(tau)), 1e-6);
  }

  /** Varicose amplitude at launch time tau: growing as the jet slows, strongest just below the breakup front, bead by bead irregular. */
  rippleAmplitude(tau) {
    const irregular = 1 + this.form.irregularity * this.rippleNoise(tau, true);
    if (this.phase === 'tip') return (RIPPLE_RISING + (RIPPLE_SLOWING - RIPPLE_RISING) * smoothstep(2 * this.launchDuration, 3.5 * this.launchDuration, this.age)) * irregular;
    const below = Math.max(tau - (this.endTau + this.span), 0) / Math.max(this.span, 1e-9);
    return (RIPPLE_SLOWING + RIPPLE_FRONT * Math.exp(-below / RIPPLE_DEPTH)) * irregular;
  }

  /** The column's free end now: the launch time its cap is centred on, the cap's radius, and how far its bulb has gathered. */
  endShape(foot, out) {
    if (this.phase === 'tip' && this.tipDrops === 0) {
      out.radius = this.firstBulbRadius * Math.cbrt(Math.min(this.age / this.span, 1));
      out.tau = Math.min(this.endTau + 0.5 * this.span, foot);
      out.gather = 1;
      out.neckGather = 0;   // the first neck is the column's own, thinned by stretching
      return out;
    }
    const progress = this.phase === 'tip' ? (this.age - this.gatherStart) / this.gatherTime : (this.age - this.pieceStart) / Math.max(this.nextPinch - this.pieceStart, 1e-6);
    const gather = this.span > 0 ? Math.min(Math.max(progress, 0), 1) : 1;
    const eased = smoothstep(0, 1, gather);
    const endRadius = END_CAP * this.evaluate(this.endTau, this.state).radius;
    out.radius = endRadius + (this.bulbRadius - endRadius) * eased;
    out.tau = Math.min(this.endTau + 0.5 * this.span * eased, foot);
    out.gather = gather;
    out.neckGather = eased;
    return out;
  }

  // ---- per substep --------------------------------------------------------

  /** Advance to the given splash time: pinch the tip, or break up from the top. */
  update(time, dt, splash, water) {
    this.age = time - this.startTime;
    if (this.finished) return;
    if (this.phase === 'tip') {
      this.updateTip(splash);
    } else {
      // The breakup is the costly part, so it advances once per rendered frame;
      // a column that has come down onto the water falls back at once.
      this.breakClock += dt;
      if (this.breakClock >= splash.frameSeconds * (1 - 1e-6)) {
        this.breakClock = 0;
        this.advanceBreakup(splash, water, false);
      } else if (this.heightAt(this.endTau) < this.radius - this.floor(this.age, this.bowl).depth) {
        const foot = this.footTau();
        if (this.spent(foot)) this.fallBack(splash, water, foot);
      }
    }
  }

  /** Break whatever is left into drops now (when too many jets are alive). */
  finishNow(splash, water) {
    if (this.finished) return;
    if (this.phase === 'tip') {
      this.pinchTip(splash);
      if (this.phase === 'tip') this.startBreakup();
    }
    this.advanceBreakup(splash, water, true);
  }

  updateTip(splash) {
    const state = this.state;
    const end = this.endShape(this.footTau(), this.end);
    const falling = this.evaluate(end.tau, state).vy <= 0;
    // A ragged jet's top comes apart early, whatever its tip does.
    if (this.form.breakAt !== null && this.age >= this.form.breakAt) {
      this.startBreakup(this.tipDrops === 0);
      return;
    }
    if (this.tipDrops === 0) {
      if (this.age < this.span) return;
      // The needle's bulb pinches once it has cleared the surface and had a
      // capillary time (times form.gatherScale) to gather, or sooner if its
      // neck is thin enough, or when it starts to fall.
      if (this.emerged === null && this.evaluate(end.tau, state).y > 0) this.emerged = this.age;
      const ripe = this.emerged !== null && this.age - this.emerged >= this.form.gatherScale * Math.sqrt((WATER_DENSITY * this.firstBulbRadius ** 3) / SURFACE_TENSION);
      const neck = this.evaluate(this.endTau + this.span, state).radius;
      // With no tip beads the bulb rides the column up and leaves first when it breaks.
      if (this.tipBeads === 0) { if (falling) this.startBreakup(true); }
      else if (ripe || (this.emerged !== null && neck < this.form.neckRatio * this.firstBulbRadius) || falling) this.pinchTip(splash);
    } else if (end.gather >= 1) {
      this.pinchTip(splash);
    } else if (falling) {
      this.startBreakup();
    }
  }

  /**
   * The bulb at the end leaves as a drop (or, a split tip, as two side by
   * side), with up to form.tipSatellites satellites from its neck and a few
   * fine drops.
   */
  pinchTip(splash) {
    const state = this.state;
    this.evaluate(this.endTau + 0.5 * this.span, state);
    if (this.form.splitTip && this.tipDrops === 0) {
      // Two drops of half the bulb each, parting across the column.
      const half = this.bulbRadius * Math.cbrt(0.5);
      const angle = this.range(0, Math.PI * 2);
      const parting = this.range(0.12, 0.3) * Math.sqrt(this.sizeFactor);
      for (const side of [-1, 1]) {
        const acrossX = Math.cos(angle) * side, acrossZ = Math.sin(angle) * side;
        this.spawn(splash, state.x + acrossX * half, state.y, state.z + acrossZ * half,
          state.vx + acrossX * parting, state.vy * this.range(0.92, 1), state.vz + acrossZ * parting, half, true);
      }
    } else {
      this.spawn(splash, state.x, state.y, state.z, state.vx, state.vy, state.vz, this.bulbRadius, true);
    }
    // Satellites from the neck, a little slower than the drop they follow.
    const satellites = Math.floor(this.random() * (this.form.tipSatellites + 1));
    for (let satellite = 0; satellite < satellites; satellite++) {
      this.evaluate(this.endTau + this.span * this.range(0.75, 1.05), state);
      const slower = this.range(0.9, 0.98);
      this.spawn(splash, state.x, state.y, state.z, state.vx * slower, state.vy * slower, state.vz * slower,
        this.bulbRadius * this.range(SATELLITE_LEAST, SATELLITE_MOST), true);
    }
    this.evaluate(this.endTau + this.span, state);
    const sprayCount = Math.round((1 + Math.floor(this.random() * 4)) * this.form.spray);
    for (let drop = 0; drop < sprayCount; drop++) {
      const kick = this.range(0.25, 0.8);
      const angle = this.range(0, Math.PI * 2);
      const rise = this.range(-0.3, 0.6);
      this.spawn(splash, state.x, state.y, state.z,
        state.vx + kick * Math.cos(angle), state.vy + kick * rise, state.vz + kick * Math.sin(angle),
        (0.0006 + 0.0009 * this.random()) * this.sizeFactor ** 0.4, false);
    }
    this.endTau += this.span;
    this.tipDrops++;
    const nextSpan = this.beadShare(this.tipDrops) * this.launchDuration;
    if (this.tipDrops < this.tipBeads && this.endTau + nextSpan < this.footTau()) {
      this.span = nextSpan;
      this.bulbRadius = Math.min(sphereRadius(this.volume(this.endTau, this.endTau + this.span)), BULB_MOST * this.radius);
      this.gatherStart = this.age;
      this.gatherTime = this.form.gatherScale * Math.sqrt((WATER_DENSITY * this.bulbRadius ** 3) / SURFACE_TENSION);
    } else {
      this.startBreakup();
    }
  }

  /** The column starts breaking from the top; `bulbFirst`: the bulb still on it leaves first, at once. */
  startBreakup(bulbFirst = false) {
    this.phase = 'breakup';
    this.breakClock = 0;
    if (bulbFirst) {
      // The first bulb as it is drawn (endShape), grown in as it emerged, leaves at once.
      this.bulbRadius = this.firstBulbRadius * Math.cbrt(Math.min(this.age / Math.max(this.span, 1e-9), 1));
      this.pieceStart = this.nextPinch = this.age;
      return;
    }
    this.choosePiece();
  }

  /**
   * The material for the next breakup drop: 1.9 local column radii times the
   * form's spread (0.65 to 1.35 for a clean jet), at most form.dropCap of
   * DROP_MOST·Rj (less 17% at random). It gathers at the end and pinches off
   * BREAK_PACE capillary times of the local column (times form.breakScale,
   * and half to one and a half at random, so the drops come off in an
   * irregular rhythm) after the last: a needle sheds a drop every few
   * milliseconds, a column a centimetre thick one a tenth of a second.
   */
  choosePiece(start = this.age) {
    const local = this.evaluate(this.endTau, this.state).radius;
    const [least, most] = this.form.dropSpread;
    const dropRadius = Math.min(DROP_RADII * local * this.range(least, most), this.maxDropRadius * this.range(0.83, 1));
    const dropVolume = (4 / 3) * Math.PI * dropRadius ** 3;
    let span = dropVolume / Math.max(this.volumeRate(this.endTau), 1e-12);
    span *= dropVolume / Math.max(this.volume(this.endTau, this.endTau + span), 1e-12);
    this.span = Math.min(span, this.launchEnd - this.endTau);
    this.bulbRadius = sphereRadius(this.volume(this.endTau, this.endTau + this.span));
    this.pieceStart = start;
    this.nextPinch = start + BREAK_PACE * this.form.breakScale * Math.sqrt((WATER_DENSITY * local ** 3) / SURFACE_TENSION) * this.range(0.5, 1.5);
  }

  /**
   * Pinch off the piece at the end once its time has come (every piece of
   * the main launch when `everything`), then, once the base has fallen back
   * to the end, let the rest fall back.
   */
  advanceBreakup(splash, water, everything) {
    const state = this.state;
    const foot = this.footTau();
    while (this.span > 0 && this.endTau + this.span <= Math.min(foot, this.launchDuration) && (everything || this.age >= this.nextPinch)) {
      this.evaluate(this.endTau + 0.5 * this.span, state);
      const scatter = (0.03 * Math.sqrt(state.vx * state.vx + state.vy * state.vy + state.vz * state.vz) + 0.04) * this.form.scatter;
      this.spawn(splash, state.x, state.y, state.z,
        state.vx + this.range(-scatter, scatter), state.vy + this.range(-scatter, scatter), state.vz + this.range(-scatter, scatter),
        this.bulbRadius, true);
      if (this.random() < this.form.satellites) {
        this.evaluate(this.endTau + this.span, state);
        this.spawn(splash, state.x, state.y, state.z,
          state.vx + this.range(-scatter, scatter), state.vy + this.range(-scatter, scatter), state.vz + this.range(-scatter, scatter),
          this.bulbRadius * this.range(SATELLITE_LEAST, SATELLITE_MOST), false);
      }
      // A ragged column throws fine spray as it comes apart.
      for (let drop = Math.floor(this.random() * (this.form.spray - 1) * 2); drop > 0; drop--) {
        const kick = this.range(0.2, 0.7) * Math.sqrt(this.sizeFactor);
        const angle = this.range(0, Math.PI * 2);
        this.spawn(splash, state.x, state.y, state.z,
          state.vx + kick * Math.cos(angle), state.vy + kick * this.range(-0.4, 0.8), state.vz + kick * Math.sin(angle),
          (0.0006 + 0.0012 * this.random()) * this.sizeFactor ** 0.4, false);
      }
      this.endTau += this.span;
      // The next piece's time runs from this one's pinch, so a fast-breaking needle sheds several a frame.
      this.choosePiece(Math.min(this.nextPinch, this.age));
    }
    if (everything || this.spent(foot)) this.fallBack(splash, water, foot);
  }

  /**
   * Whether the column is spent, once its end has started to fall (a slow
   * column still rising out of the water is not): the base has fallen back to
   * within half a piece of its end, or what is left, from its end to the
   * foot, has come down onto the water (within three of its radii of it,
   * where a tube bent as tightly as a falling stub bends would fold into
   * itself).
   */
  spent(foot) {
    if (this.evaluate(this.endTau, this.state).vy > 0) return false;
    if (foot - this.endTau < 0.5 * this.span) return true;
    const middle = 0.5 * (this.endTau + foot);
    const above = -this.floor(this.age, this.bowl).depth + 3 * this.evaluate(middle, this.state).radius;
    return this.heightAt(this.endTau) < above && this.heightAt(middle) < above;
  }

  /** The column is gone: a stub still in the air becomes one last drop, the rest makes a mound and a ring at the base. */
  fallBack(splash, water, foot) {
    const state = this.state;
    let fallen = this.volume(foot, this.launchEnd);
    const stub = this.volume(this.endTau, foot);
    if (stub > 0) {
      this.evaluate(0.5 * (this.endTau + foot), state);
      if (state.y > 2 * this.launchRadius(foot)) this.spawn(splash, state.x, state.y, state.z, state.vx, state.vy, state.vz, Math.min(sphereRadius(stub), this.maxDropRadius / this.form.dropCap), true);
      else fallen += stub;
    }
    const strength = Math.cbrt(fallen / FALLBACK_VOLUME) * this.sizeFactor ** FALLBACK_SIZE;
    const radius = this.radius;
    // A leaning column falls back downrange, where its foot has gone.
    this.evaluate(foot, state);
    const fallX = state.x, fallZ = state.z;
    water.addSplat({ x: fallX, z: fallZ, radius: radius * 0.9, height: 0.22 * radius * strength });
    water.addSplat({ x: fallX, z: fallZ, radius: radius * 1.5, velocity: -0.18 * strength, rim: 1.8 });
    water.addFoam({ x: fallX, z: fallZ, radius: radius * 1.3, amount: 0.3 * strength });
    splash.spawnFoamSpecks(fallX, fallZ, 0, radius * 1.6, Math.round(FALLBACK_SPECKS * strength), 0.025);
    this.finished = true;
  }

  /** Tip and breakup drops are essential (never refused); drops of 2 mm and more are drawn as glass, like the column. */
  spawn(splash, x, y, z, vx, vy, vz, radius, essential) {
    if (!essential && this.dropsSpawned >= this.budget) return;
    this.dropsSpawned++;
    splash.spawnDroplet(x, y, z, vx, vy, vz, radius, radius >= LENS_DROP_RADIUS);
  }

  // ---- per rendered frame -------------------------------------------------

  /** Evaluate the grid at the given splash time and upload it. */
  updateGeometry(time) {
    this.age = time - this.startTime;
    const state = this.state;
    const foot = Math.max(this.footTau(), this.endTau);
    const end = this.endShape(foot, this.end);
    const capRadius = end.radius;
    const capTau = end.tau;

    // The cap's upper half, pole first.
    this.evaluate(capTau, state);
    const capX = state.x, capY = state.y, capZ = state.z;
    const capAxisX = state.axisX, capAxisY = state.axisY, capAxisZ = state.axisZ;
    for (let row = 0; row < CAP_ROWS; row++) {
      const polar = (row / CAP_ROWS) * Math.PI * 0.5;
      const lift = capRadius * Math.cos(polar);
      this.writeRing(row, capX + capAxisX * lift, capY + capAxisY * lift, capZ + capAxisZ * lift, capAxisX, capAxisY, capAxisZ, capRadius * Math.sin(polar), capRadius, 1);
    }

    // Arc length and varicose phase down the centreline from the cap's centre
    // to the foot. The phase advances by 2π per drop's worth of column and is
    // π (a neck) where the gathering bulb's material ends, so the beads stand
    // where the next drops will.
    const arcTaus = this.arcTaus;
    const arcLengths = this.arcLengths;
    const arcPhases = this.arcPhases;
    const neckEnd = this.endTau + this.span;
    let previousX = capX, previousY = capY, previousZ = capZ;
    let length = 0;
    let phase = 0;
    let neckPhase = null;
    for (let sample = 0; sample < ARC_SAMPLES; sample++) {
      const tau = capTau + ((foot - capTau) * sample) / (ARC_SAMPLES - 1);
      this.evaluate(tau, state);
      length += Math.sqrt((state.x - previousX) ** 2 + (state.y - previousY) ** 2 + (state.z - previousZ) ** 2);
      if (sample > 0) {
        const step = tau - arcTaus[sample - 1];
        phase += (Math.PI * 2 * step) / this.rippleSpan(tau - 0.5 * step, state.radius);
        if (neckPhase === null && tau >= neckEnd) neckPhase = phase - ((Math.PI * 2) * (tau - neckEnd)) / this.rippleSpan(tau, state.radius);
      }
      arcTaus[sample] = tau;
      arcLengths[sample] = length;
      arcPhases[sample] = phase;
      previousX = state.x; previousY = state.y; previousZ = state.z;
    }
    const phaseShift = Math.PI - (neckPhase ?? 0);

    // Rows below the cap's centre, crowded towards it: the bulb's underside,
    // the neck and the beads need them, the smooth lower column does not.
    const belowRows = ROWS - CAP_ROWS;
    const rows = this.rows;
    let sample = 0;
    for (let index = 0; index < belowRows; index++) {
      const distance = length * (index / (belowRows - 1)) ** ROW_POWER;
      while (sample < ARC_SAMPLES - 2 && arcLengths[sample + 1] < distance) sample++;
      const segment = arcLengths[sample + 1] - arcLengths[sample];
      const blend = segment > 1e-12 ? Math.min(Math.max((distance - arcLengths[sample]) / segment, 0), 1) : 0;
      const tau = arcTaus[sample] + (arcTaus[sample + 1] - arcTaus[sample]) * blend;
      const ripplePhase = arcPhases[sample] + (arcPhases[sample + 1] - arcPhases[sample]) * blend + phaseShift;
      this.evaluate(tau, state);
      // Varicose beads, and a gathering bulb draws the column under it into a neck.
      const neckWeight = end.neckGather * (1 - smoothstep(neckEnd, neckEnd + 0.5 * this.span, tau));
      const columnRadius = state.radius * (1 + this.rippleAmplitude(tau) * Math.cos(ripplePhase)) * (1 - NECK_THINNING * neckWeight);
      const bulbRadius = Math.sqrt(Math.max(capRadius * capRadius - distance * distance, 0));
      const ringRadius = smoothMax(columnRadius, bulbRadius, 0.3 * columnRadius);
      // Water seen through the ring: the bulb's where the bulb is the surface.
      const bulbShare = smoothstep(-0.2, 0.2, (bulbRadius - columnRadius) / Math.max(capRadius, 1e-6));
      rows.x[index] = state.x; rows.y[index] = state.y; rows.z[index] = state.z;
      rows.axisX[index] = state.axisX; rows.axisY[index] = state.axisY; rows.axisZ[index] = state.axisZ;
      rows.radius[index] = ringRadius;
      rows.water[index] = ringRadius + (capRadius - ringRadius) * bulbShare;
      rows.round[index] = bulbShare;
    }
    // The foot stands on the water. While the column still stands its last
    // FOOT_ROWS rows turn level, as water piled on water stands (each ring
    // turning from the one above by no more than their spacing allows, so the
    // rings never cut through each other), never narrow downward (the base's
    // last, slowest material is thinner than what it carries) and never widen
    // faster than FOOT_SLOPE per unit of height. The last ring then slides
    // down the column's axis until no part of it stands above the water, so
    // once the launch is over and the base has risen off the water a skirt
    // still carries it down to the water.
    const water = -this.floor(this.age, this.bowl).depth - BASE_DEPTH;
    const last = belowRows - 1;
    if (length > 2 * rows.radius[last]) {
      for (let index = belowRows - FOOT_ROWS; index < belowRows; index++) {
        const level = (index - (belowRows - FOOT_ROWS) + 1) / FOOT_ROWS;
        let axisX = rows.axisX[index] * (1 - level), axisY = rows.axisY[index] * (1 - level) + level, axisZ = rows.axisZ[index] * (1 - level);
        let axisLength = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ) || 1;
        axisX /= axisLength; axisY /= axisLength; axisZ /= axisLength;
        const aboveX = rows.axisX[index - 1], aboveY = rows.axisY[index - 1], aboveZ = rows.axisZ[index - 1];
        const turn = Math.acos(Math.min(Math.max(axisX * aboveX + axisY * aboveY + axisZ * aboveZ, -1), 1));
        const spacing = Math.sqrt((rows.x[index] - rows.x[index - 1]) ** 2 + (rows.y[index] - rows.y[index - 1]) ** 2 + (rows.z[index] - rows.z[index - 1]) ** 2);
        const allowed = Math.atan2(0.5 * spacing, Math.max(rows.radius[index], rows.radius[index - 1]));
        if (turn > allowed) {
          const share = allowed / turn;
          axisX = aboveX + (axisX - aboveX) * share; axisY = aboveY + (axisY - aboveY) * share; axisZ = aboveZ + (axisZ - aboveZ) * share;
          axisLength = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ) || 1;
          axisX /= axisLength; axisY /= axisLength; axisZ /= axisLength;
        }
        rows.axisX[index] = axisX; rows.axisY[index] = axisY; rows.axisZ[index] = axisZ;
        const drop = Math.abs(rows.y[index - 1] - rows.y[index]);
        rows.radius[index] = Math.min(Math.max(rows.radius[index], rows.radius[index - 1]), rows.radius[index - 1] + FOOT_SLOPE * drop);
        rows.water[index] = Math.min(Math.max(rows.water[index], rows.water[index - 1]), rows.water[index - 1] + FOOT_SLOPE * drop);
      }
    }
    const tilt = Math.sqrt(Math.max(1 - rows.axisY[last] * rows.axisY[last], 0));
    const sunk = water - rows.radius[last] * tilt;
    const slide = Math.max(rows.y[last] - sunk, 0) / Math.max(rows.axisY[last], 0.5);
    rows.x[last] -= rows.axisX[last] * slide;
    rows.z[last] -= rows.axisZ[last] * slide;
    rows.y[last] = Math.min(rows.y[last], sunk);
    for (let index = 0; index < belowRows; index++) {
      this.writeRing(CAP_ROWS + index, rows.x[index], rows.y[index], rows.z[index], rows.axisX[index], rows.axisY[index], rows.axisZ[index], rows.radius[index], rows.water[index], rows.round[index]);
    }

    holdWithinWalls(this.positions, this.walls);
    computeGridNormals(this.positions, this.normals, ROWS, COLUMNS);
    markChanged(this.geometry, ['position', 'normal', 'aRadius', 'aRound']);
  }

  /**
   * One ring of the grid around the given centre and axis. `waterRadius` is
   * the radius the thickness pass sees through, `round` 1 where the surface is
   * the bulb's sphere and 0 where it is the tube (the composite's lens).
   */
  writeRing(row, centreX, centreY, centreZ, axisX, axisY, axisZ, ringRadius, waterRadius, round) {
    // A frame across the axis, from world x (the axis is never far from vertical).
    const along = axisX;
    let firstX = 1 - along * axisX, firstY = -along * axisY, firstZ = -along * axisZ;
    const firstLength = Math.sqrt(firstX * firstX + firstY * firstY + firstZ * firstZ) || 1;
    firstX /= firstLength; firstY /= firstLength; firstZ /= firstLength;
    // second = first × axis, so the rings wind with outward grid normals.
    const secondX = firstY * axisZ - firstZ * axisY;
    const secondY = firstZ * axisX - firstX * axisZ;
    const secondZ = firstX * axisY - firstY * axisX;
    for (let column = 0; column < COLUMNS; column++) {
      const vertex = row * COLUMNS + column;
      const cosAngle = this.columnCos[column] * ringRadius;
      const sinAngle = this.columnSin[column] * ringRadius;
      this.positions[vertex * 3] = centreX + firstX * cosAngle + secondX * sinAngle;
      this.positions[vertex * 3 + 1] = centreY + firstY * cosAngle + secondY * sinAngle;
      this.positions[vertex * 3 + 2] = centreZ + firstZ * cosAngle + secondZ * sinAngle;
      this.radii[vertex] = waterRadius;
      this.roundness[vertex] = round;
    }
  }

  dispose() {
    this.geometry.dispose();
  }
}
