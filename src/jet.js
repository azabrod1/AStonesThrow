// The Worthington jet: the column of water fired up when the air cavity
// behind a stone pinches off and the hole above the neck closes.
//
// The column is water launched upward from the point where the cavity's
// mouth closed (src/cavity.js; the splash starts it then), each element
// then flying ballistically under gravity alone (a column is not a sheet, so
// there is no drag). Over the main window T = 0.08·sqrt(R / 3 cm) s an
// element launched at time tau leaves at u = tipSpeed·(1 − 0.68·tau/T): the
// tip is first and fastest, so the column stretches as it rises. A tail of
// another T then feeds the base, its speed falling linearly to rest, so the
// foot stays on the water until the slow material falls back (without it the
// last element, at a third of the tip speed, would lift the base 6 cm off the
// water). Elements leave straight up with a tilt of up to 5° per jet plus a
// lateral wobble of about 1% of u (times form.wobble) along the launch
// window, so the column leans and bends gently. The splash leans it by
// `lean` (back along an oblique stone's path, see JET_LEAN, and towards a
// lopsided hole's bulge, src/splash.js): its launch direction is cos(lean)
// up and sin(lean) across before the tilt. Its elements keep that sideways
// speed while gravity turns them, so a leaning column arcs over like a
// fountain and its drops land well downrange; a whip (form.bend) leans the
// tip's elements more than the base's, by bend·(1/2 − tau/T) of u across,
// so a leaning column curves away rather than standing as a rod. With
// a = t − tau,
//
//   position = launch point + u·direction(tau)·a − ½·g·a²·up
//
// and ∂position/∂tau, the spacing of neighbouring elements, is closed form.
// Elements leave from a radius r0 = Rj·(0.18 + 0.32·tau/T) (0.5·Rj in the
// tail), so the column is a cone, widest at the water. Rj is the stone's
// radius R times (R / 3 cm)^JET_RADIUS_POWER (times form.radiusScale): a jet
// is thinner the more singular the cavity's collapse, that is the higher the
// Froude number V²/(g·R) (Gekle & Gordillo 2010 find thinner, faster jets as
// it grows), and at a given entry speed a big stone's is lower, so its jet is
// fatter than a scaled-up copy of a small one's (a 16 cm stone's 1.28 times,
// a 1.5 cm stone's 0.71 times). Volume is conserved: an element carries
// π·r0²·u·dtau spread over |∂position/∂tau|·dtau of column, so the column
// radius is r0·sqrt(u / |∂position/∂tau|), capped at 1.4·r0 where elements
// bunch (in the slow tail, a fat foot).
//
// The column's free end is a cap. At first it is the tip bulb, the material
// of the first bead's share of T (form.beadShares, BULB_SHARE = 6% when the
// form gives none) gathered into a ball of form.firstBulb launch radii r0(0)
// (1.6 for the default form, at most BULB_MOST·R), grown in as it emerges.
// The tip pinches off once the neck just behind the bulb is thinner than
// form.neckRatio of the bulb (0.45), or at the latest when the bulb starts to
// fall: one drop with the bulb's radius and velocity (a split tip: two side
// by side, parting at 0.12 to 0.3 m/s), up to form.tipSatellites satellites
// of SATELLITE_LEAST to SATELLITE_MOST of its radius from its neck, a little
// slower, and one to four fine drops (times form.spray). The next bead's
// material then gathers into a new bulb (radius from its volume) over
// form.gatherScale capillary times sqrt(ρ·r³/σ), thinning the neck under it,
// and pinches again, up to form.tipBeads drops while the end still rises; a
// form with no tip beads keeps its bulb on the column until the column
// breaks, when the bulb leaves first. The first tip drop is the largest drop
// of the splash. Then the column breaks from the top down: a front sweeps the
// launch times from the end to T in BREAK_SECONDS·(R / 3 cm)^1.5 (times
// form.breakScale), at least BREAK_FLOOR (the Rayleigh–Plateau time of a
// column, sqrt(ρ·r³/σ), with its radius r ∝ R; a 16 cm stone's column takes
// half a second, so most of it falls back whole), and each piece it reaches,
// the material for one drop of 1.9 local column radii (the Rayleigh–Plateau
// size, times form.dropSpread: 0.65 to 1.35, but at most form.dropCap of the
// first tip drop, less up to 17% at random, which binds for most of them),
// gathers into a bulb at the end and pinches off with the local velocity, a
// scatter (times form.scatter) and, at form.satellites odds, a small
// satellite, and a ragged column sheds fine spray as it parts (form.spray
// over 1); each piece is held back by up to its whole share so the rhythm is
// ragged. A ragged form starts that breakup at form.breakAt (s), whatever its
// tip is doing. Volumes are kept, so the drop count follows the column: for
// a 3 cm stone at about 6 m/s the default form makes two tip drops of 8.6 and
// 7.6 mm, then some twenty of 6.5 to 7.5 mm and satellites of 2 to 3 mm,
// holding 40% of the water; the rest falls back. Before it breaks the column
// grows varicose beads with the drop spacing (radius ±6% while it rises fast,
// ±12% as it slows, up to ±45% just below the front, necks where the pieces
// will part), which catch the sun; form.irregularity makes their spacing and
// size uneven, by two waves of their own along the launch window.
//
// Forms. CLEAN_FORM is a clean jet; src/splash.js (jetForm) draws each
// throw's form: a clean jet varies its tip beads (none to four, of 3.5 to
// 9.5% of T each), its first bulb, neck, bead sizes, satellites, wobble,
// irregularity and breakup; a leaning one whips; a stubby one is fat and
// slow (radiusScale over 1, few tip beads, slow breakup); a ragged one has a
// small bulb, breaks from the top within a quarter of its rise, fast, into
// drops of very mixed sizes flung wide with spray; a split jet is two
// columns, each with `share` of the water (its radii scaled by sqrt(share));
// the form of a throw with no jet ('none') is a fat column launched at a
// fifth of the speed, a glassy mound a few centimetres high that subsides in
// small drops. Every draw comes from the jet's own random stream (`random`), so a seeded
// throw's jet is the same however the frames fell.
//
// Meanwhile the column's foot is the element now crossing BASE_DEPTH below
// the surface: the launch point while the jet is fed, then climbing the
// column as the slow material falls back. When the front reaches the foot the
// column is gone: a stub still in the air becomes one last drop, and the
// water gets, where the foot element has gone (downrange of the collapse
// point when the column leans), a mound (height about 0.22·R, scaled by the
// cube root of the fallen volume) with foam, a patch of foam specks in a disc
// of 1.6·R (FALLBACK_SPECKS times the same cube root, about 140 for a 3 cm
// stone) and a small secondary ring. For a 3 cm stone dropped in at about
// 6 m/s the default form's jet starts when the cavity closes, 138 ms after
// entry; 0.16 s later it is 40 cm tall, 23 mm across at the water, 14 mm at
// mid-height and 10 mm under its 17 mm bulb; the tip drops leave about 240
// and 320 ms after it starts and the column is gone about 400 ms after it
// starts (tools/jet-probe.mjs).
//
// updateGeometry() evaluates a ROWS × COLUMNS ring grid (src/fluidMesh.js)
// once per rendered frame: CAP_ROWS rows of the cap's upper half, then rows
// placed by arc length below the cap's centre, crowded towards it where the
// bulb, neck and beads are, each ring the larger of column and bulb, smoothly
// blended, down to the foot. update() runs every simulation substep and
// checks the tip, while the breakup advances once per rendered frame:
// whenever a frame's worth of simulated time (SplashSystem.frameSeconds) has
// passed, so it moves on every frame at any time scale. SplashSystem draws
// the mesh with the column materials in src/shaders/sheet.js through the
// droplets' screen-space fluid passes, where the composite shades it as a
// glass lens; drops of LENS_DROP_RADIUS and more are flagged to be drawn the
// same way (with their motion streak held short), so the tip drop looks like
// the bulb it was.
import * as THREE from 'three';
import { createRingGrid, computeGridNormals, markChanged } from './fluidMesh.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;     // the stone size the tuning constants were set for
const ROWS = 48;                   // end cap (row 0, a pole) to foot
const COLUMNS = 24;                // around the axis
const CAP_ROWS = 6;                // rows of the cap's upper half, pole to 75°
const ROW_POWER = 1.6;             // rows below the cap crowd towards it, where the bulb and beads are
const ARC_SAMPLES = 40;            // centreline samples for placing rows by arc length
const BASE_DEPTH = 0.004;          // launch a little below the surface so the foot meets the water
const SPEED_FALL = 0.68;           // the launch speed falls by this fraction over T
const TAIL_SHARE = 1.0;            // after T a tail of this many T feeds the base, slowing to rest
const TIP_RADIUS = 0.18;           // launch radius at the start, in stone radii...
const BASE_RADIUS = 0.5;           // ...growing to this at T (0.18 + 0.32·tau/T)...
const TAIL_RADIUS = 0.5;           // ...and held there through the tail
const JET_RADIUS_POWER = 0.25;     // the column's radii in R·(R / 3 cm)^this: fatter at a lower Froude number
const MAX_TILT = THREE.MathUtils.degToRad(5);
const WOBBLE = 0.01;               // lateral launch velocity over launch speed (0.1 of the old drops' scatter)
const BULB_SHARE = 0.06;           // a tip bulb is the material of this fraction of T
const FIRST_BULB = 1.6;            // the first bulb's radius in launch radii at the tip
const NECK_RATIO = 0.45;           // the tip pinches when the neck is this thin against the bulb
const NECK_THINNING = 0.6;         // a gathering bulb thins the neck under it by up to this fraction
const BUNCH_CAP = 1.4;             // the column never fattens beyond this many launch radii
const END_CAP = 1.15;              // a free end rounds into a cap this many column radii wide
const TIP_BEADS = 2;               // tip drops a jet pinches off at most, unless its form says otherwise
const DROP_RADII = 1.9;            // breakup drops in local column radii (Rayleigh–Plateau)
const RIPPLE_RISING = 0.06;        // varicose amplitude (of the radius) while the jet rises...
const RIPPLE_SLOWING = 0.12;       // ...once it has slowed, and anywhere during the breakup
const RIPPLE_FRONT = 0.33;         // extra amplitude just below the breakup front, decaying over RIPPLE_DEPTH drops
const RIPPLE_DEPTH = 2;
const BREAK_SECONDS = 0.12;        // the front sweeps to the base in this long (× (R / 3 cm)^1.5, a capillary time)...
const BREAK_FLOOR = 0.05;          // ...or at least this
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
  gatherScale: 1,            // a later tip bead gathers over this many capillary times sqrt(ρ·r³/σ)
  neckRatio: NECK_RATIO,     // the first tip pinches when its neck is this thin against the bulb
  radiusScale: 1,            // the column's radii
  breakScale: 1,             // the breakup front's sweep time
  breakAt: null,             // an age (s) at which the column starts breaking from the top, whatever its tip does (a ragged jet)
  dropSpread: [0.65, 1.35],  // breakup drops in Rayleigh–Plateau sizes (DROP_RADII local radii)...
  dropCap: 0.9,              // ...at most this many first bulbs
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

export class JetColumn {
  /**
   * @param x,z the collapse point
   * @param radius the stone's radius
   * @param tipSpeed launch speed of the first material
   * @param startTime splash time of the pinch-off
   * @param budget droplets the jet may spawn in all (tip drops and breakup drops are never refused)
   * @param material the material the mesh starts with (the splash swaps it per pass)
   * @param lean how far the column leans from vertical (radians), towards the unit direction (leanX, leanZ)
   * @param form the jet's form (CLEAN_FORM's fields, the header)
   * @param random the jet's own random stream (0 to 1), so a seeded throw's jet comes out the same
   */
  constructor({ x, z, radius, tipSpeed, startTime, budget, material, lean = 0, leanX = 0, leanZ = 0, form = null, random = Math.random }) {
    this.form = { ...CLEAN_FORM, ...form };
    this.random = random;
    this.centreX = x;
    this.centreZ = z;
    this.radius = radius;
    this.sizeFactor = radius / REFERENCE_RADIUS;
    this.columnRadius = radius * this.sizeFactor ** JET_RADIUS_POWER * this.form.radiusScale * Math.sqrt(this.form.share);   // Rj in the header
    this.tipSpeed = tipSpeed;
    this.startTime = startTime;
    this.age = 0;
    this.finished = false;
    this.budget = budget;
    this.launchDuration = 0.08 * Math.sqrt(this.sizeFactor);
    this.tailDuration = TAIL_SHARE * this.launchDuration;
    this.launchEnd = this.launchDuration + this.tailDuration;
    this.breakDuration = Math.max(BREAK_SECONDS * this.sizeFactor ** 1.5, BREAK_FLOOR) * this.form.breakScale;

    // Launch direction per unit speed: up by cos(lean), across by sin(lean),
    // plus the jet's own small tilt (and the wobble, in evaluate).
    this.upShare = Math.cos(lean);
    this.leanX = Math.sin(lean) * leanX;
    this.leanZ = Math.sin(lean) * leanZ;
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

    // The end of the column: launch time of its first material, and the bulb
    // gathering there (the material of `span` launch seconds, which becomes a
    // drop of radius `bulbRadius`).
    this.phase = 'tip';                // 'tip', then 'breakup'
    this.tipDrops = 0;
    this.endTau = 0;
    this.span = this.beadShare(0) * this.launchDuration;
    this.firstBulbRadius = Math.min(this.form.firstBulb * this.launchRadius(0), BULB_MOST * radius);
    this.maxDropRadius = this.form.dropCap * this.firstBulbRadius;
    this.bulbRadius = this.firstBulbRadius;
    this.gatherStart = 0;
    this.gatherTime = 0;
    this.hold = 0;                     // extra front travel before the current piece pinches off
    this.frontStartTau = 0;
    this.frontStartAge = 0;
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
    // The beads' irregularity: two waves along the launch time, of their own phases.
    this.rippleWaves = RIPPLE_WAVES.map((cycles) => ({ frequency: (Math.PI * 2 * cycles * this.range(0.8, 1.25)) / this.launchDuration, phase: this.range(0, Math.PI * 2) }));
    this.state = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, axisX: 0, axisY: 1, axisZ: 0, spacing: 0, radius: 0 };
    this.end = { tau: 0, radius: 0, gather: 0, neckGather: 0 };
  }

  /** A draw from the jet's stream between two values. */
  range(low, high) { return low + this.random() * (high - low); }

  // ---- the model --------------------------------------------------------

  launchSpeed(tau) {
    const launchDuration = this.launchDuration;
    if (tau <= launchDuration) return this.tipSpeed * (1 - (SPEED_FALL * tau) / launchDuration);
    return this.tipSpeed * (1 - SPEED_FALL) * Math.max(1 - (tau - launchDuration) / this.tailDuration, 0);
  }

  /** d launchSpeed / d tau. */
  launchSpeedSlope(tau) {
    if (tau <= this.launchDuration) return (-this.tipSpeed * SPEED_FALL) / this.launchDuration;
    return (-this.tipSpeed * (1 - SPEED_FALL)) / this.tailDuration;
  }

  launchRadius(tau) {
    if (tau > this.launchDuration) return TAIL_RADIUS * this.columnRadius;
    return this.columnRadius * (TIP_RADIUS + (BASE_RADIUS - TIP_RADIUS) * (tau / this.launchDuration));
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

  /** Volume launched per second at launch time tau. */
  volumeRate(tau) { const launchRadius = this.launchRadius(tau); return Math.PI * launchRadius * launchRadius * this.launchSpeed(tau); }

  /** Volume launched between two launch times (Simpson's rule, exact for these cubics, split at T). */
  volume(tauFrom, tauTo) {
    tauFrom = Math.max(tauFrom, 0);
    tauTo = Math.min(tauTo, this.launchEnd);
    if (tauTo <= tauFrom) return 0;
    const split = this.launchDuration;
    if (tauFrom < split && tauTo > split) return this.volume(tauFrom, split) + this.volume(split, tauTo);
    return ((tauTo - tauFrom) / 6) * (this.volumeRate(tauFrom) + 4 * this.volumeRate(0.5 * (tauFrom + tauTo)) + this.volumeRate(tauTo));
  }

  /** Height of the element launched at tau, now. */
  heightAt(tau) {
    const age = Math.max(this.age - tau, 0);
    return -BASE_DEPTH + this.launchSpeed(tau) * this.upShare * age - 0.5 * GRAVITY * age * age;
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
    out.x = this.centreX + speed * lateralX * age;
    out.y = -BASE_DEPTH + speed * this.upShare * age - 0.5 * GRAVITY * age * age;
    out.z = this.centreZ + speed * lateralZ * age;
    out.vx = speed * lateralX;
    out.vy = speed * this.upShare - GRAVITY * age;
    out.vz = speed * lateralZ;
    // ∂position/∂tau = (d launch velocity / d tau)·a − launch velocity + g·a·up.
    const alongX = (speedSlope * lateralX + speed * slopeX) * age - speed * lateralX;
    const alongY = (speedSlope * age - speed) * this.upShare + GRAVITY * age;
    const alongZ = (speedSlope * lateralZ + speed * slopeZ) * age - speed * lateralZ;
    const spacing = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
    out.spacing = spacing;
    if (spacing > 1e-9) { out.axisX = -alongX / spacing; out.axisY = -alongY / spacing; out.axisZ = -alongZ / spacing; } else { out.axisX = 0; out.axisY = 1; out.axisZ = 0; }
    const launchRadius = this.launchRadius(tau);
    out.radius = spacing > 1e-9 ? Math.min(launchRadius * Math.sqrt(speed / spacing), BUNCH_CAP * launchRadius) : BUNCH_CAP * launchRadius;
    return out;
  }

  /** Launch time of the material now at the foot: the column's base. */
  footTau() {
    const limit = Math.min(this.age, this.launchEnd);
    if (this.heightAt(limit) >= -BASE_DEPTH - 1e-7) return limit;
    let low = Math.min(this.endTau, limit);
    let high = limit;
    if (this.heightAt(low) < -BASE_DEPTH) return low;
    for (let step = 0; step < 24; step++) {
      const middle = 0.5 * (low + high);
      if (this.heightAt(middle) >= -BASE_DEPTH) low = middle; else high = middle;
    }
    return low;
  }

  /** Launch time the breakup front has reached by now. */
  frontTarget() {
    const progress = Math.max(this.age - this.frontStartAge, 0) / this.breakDuration;
    return this.frontStartTau + (this.launchDuration - this.frontStartTau) * progress;
  }

  /** Launch seconds of column that make one Rayleigh–Plateau drop where the column has the given local radius (irregular by the form). */
  rippleSpan(tau, localRadius) {
    const dropRadius = Math.min(DROP_RADII * localRadius, this.maxDropRadius);
    return (((4 / 3) * Math.PI * dropRadius ** 3) / Math.max(this.volumeRate(tau), 1e-12)) * (1 + this.form.irregularity * this.rippleNoise(tau));
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
    const progress = this.phase === 'tip' ? (this.age - this.gatherStart) / this.gatherTime : (this.frontTarget() - this.endTau) / (this.span + this.hold);
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
      // The breakup is the costly part, so it advances once per rendered frame.
      this.breakClock += dt;
      if (this.breakClock >= splash.frameSeconds * (1 - 1e-6)) {
        this.breakClock = 0;
        this.advanceBreakup(splash, water, false);
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
      const neck = this.evaluate(this.endTau + this.span, state).radius;
      // With no tip beads the bulb rides the column up and leaves first when it breaks.
      if (this.form.tipBeads === 0) { if (falling) this.startBreakup(true); }
      else if (neck < this.form.neckRatio * this.firstBulbRadius || falling) this.pinchTip(splash);
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
    if (this.tipDrops < this.form.tipBeads && this.endTau + nextSpan < this.footTau()) {
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
    this.frontStartTau = this.endTau;
    this.frontStartAge = this.age;
    this.breakClock = 0;
    if (bulbFirst) {
      // The first bulb as it is drawn (endShape), grown in as it emerged.
      this.bulbRadius = this.firstBulbRadius * Math.cbrt(Math.min(this.age / Math.max(this.span, 1e-9), 1));
      this.hold = 0;
      this.frontStartTau = this.endTau + this.span;
      return;
    }
    this.choosePiece();
  }

  /**
   * The material for the next breakup drop: 1.9 local column radii times the
   * form's spread (0.65 to 1.35 for a clean jet), at most form.dropCap of the
   * first bulb (less 17% at random), held for up to its whole share of the
   * front's travel so the drops come off in an irregular rhythm.
   */
  choosePiece() {
    const local = this.evaluate(this.endTau, this.state).radius;
    const [least, most] = this.form.dropSpread;
    const dropRadius = Math.min(DROP_RADII * local * this.range(least, most), this.maxDropRadius * this.range(0.83, 1));
    const dropVolume = (4 / 3) * Math.PI * dropRadius ** 3;
    let span = dropVolume / this.volumeRate(this.endTau);
    span *= dropVolume / Math.max(this.volume(this.endTau, this.endTau + span), 1e-12);
    this.span = Math.min(span, this.launchEnd - this.endTau);
    this.bulbRadius = sphereRadius(this.volume(this.endTau, this.endTau + this.span));
    this.hold = this.range(0, 1) * this.span;
  }

  /**
   * Pinch off every piece the front has passed (all of them when `everything`),
   * then, once the front meets the foot, let the rest fall back.
   */
  advanceBreakup(splash, water, everything) {
    const state = this.state;
    const foot = this.footTau();
    const target = everything ? Infinity : this.frontTarget();
    while (this.span > 0 && this.endTau + this.span <= foot && target >= this.endTau + this.span + this.hold) {
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
      this.choosePiece();
    }
    if (everything || target >= foot || foot - this.endTau < 0.35 * this.span) this.fallBack(splash, water, foot);
  }

  /** The column is gone: a stub still in the air becomes one last drop, the rest makes a mound and a ring at the base. */
  fallBack(splash, water, foot) {
    const state = this.state;
    let fallen = this.volume(foot, this.launchEnd);
    const stub = this.volume(this.endTau, foot);
    if (stub > 0) {
      this.evaluate(0.5 * (this.endTau + foot), state);
      if (state.y > 2 * this.launchRadius(foot)) this.spawn(splash, state.x, state.y, state.z, state.vx, state.vy, state.vz, sphereRadius(stub), true);
      else fallen += stub;
    }
    const strength = Math.cbrt(fallen / 2.5e-5);   // 1 for about 25 ml, a 3 cm stone's whole jet
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
      this.writeRing(CAP_ROWS + index, state.x, state.y, state.z, state.axisX, state.axisY, state.axisZ, ringRadius, ringRadius + (capRadius - ringRadius) * bulbShare, bulbShare);
    }

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
