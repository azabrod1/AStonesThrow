// The Worthington jet: the water fired up the axis when the air cavity behind
// a stone pinches off (src/cavity.js; the splash starts it at the pinch-off).
//
// Its flight is physics: the column of water is integrated by the slender-jet
// equations (src/slenderJet.js: mass and momentum along the column, with
// surface tension, viscosity and gravity), so how it thins, whether and where
// it beads, how its tip draws back into a bulb, where it pinches, and every
// drop it throws and that drop's size come out of the equations. This module
// feeds it the water as the collapse launches it, hands the drops and the
// water that falls back to the splash, and draws it.
//
// The launch (the inflow). The hole's walls meet on the axis at the pinch and
// fire water up it, from the floor of the bowl that is left above the neck;
// that collapse is not solved here (a two-dimensional flow), so the water it
// launches is given, fitted to the reference simulation (tools/basilisk, a
// 3 cm stone straight in at 6.3 m/s): a needle a few millimetres thick that
// clears the surface within about 10 ms at 13 to 16 m/s, the column's body
// under it, slower, and, as the bowl fills, a broad slow base, 5 cm across at
// the surface 0.25 s after entry. In the bowl's time unit sqrt(z_p/g) (z_p the
// pinch depth, the collapse's own time scale; src/cavity.js bowlUnit) the
// water leaves over T_end = LAUNCH_END, at
//
//   u(tau) = U·(BASE_SPEED + (1 − BASE_SPEED)·(1 − tau/T_end)^BODY_POWER) + (form.needle·U − U)·exp(−tau/NEEDLE_TIME)
//
// (U the body's speed, which the splash sets from the hole's collapse speed
// at its pinch, sqrt(g·z_p): src/splash.js JET_COLLAPSE), so the
// needle leaves first and fastest and the column stretches as it rises. Its
// launch radius r0(tau) is a core growing from NEEDLE_RADIUS·Rj to
// BODY_RADIUS·Rj over BODY_GROWTH of T_end (the needle, then the body) plus
// the base, growing as (tau/T_end)^BASE_POWER to BASE_RADIUS·Rj at T_end times
// a scale chosen so that the two launch the volume the splash gives the jet
// (a share of the water that fills the bowl, src/splash.js JET_SHARE). The
// base is the bowl's water welling up under the column, a broad mound rather
// than a jet (the splash draws it on the water: startBase), so the solver is
// fed the core alone and the base's water is counted straight into what
// falls back (below). Rj is the
// stone's radius R times (R / 3 cm)^JET_RADIUS_POWER (times form.radiusScale):
// a jet is thinner the more singular the cavity's collapse, that is the higher
// the Froude number V²/(g·R) (Gekle & Gordillo 2010 find thinner, faster jets
// as it grows), and at a given entry speed a big stone's is lower; but never
// under JET_RADIUS_LEAST, since a small stone's jet is no thinner than the
// capillary length lets it be: Li & Li (2025) measure columns 3 ± 1 mm
// across from 20 to 40 mm spheres, and Worthington's (1908) 1.5 cm marble
// threw "a tall jet", not a thread (a thread of 0.35 mm, which the scaling
// alone would give it, breaks into mist within a millisecond). The rock's
// launch is that scaling, an extrapolation: the reference simulation is of
// the 3 cm stone only; and a small stone's comes out weak against
// Worthington's rule (his marble's jet from 15 cm rose to the drop height
// or more; this launch sends its column to a third of it and its needle's
// drops to about it: tools/jet-probe.mjs), since the speed shared between
// needle and body was fitted at the reference's Froude number alone. The
// launch point is on the jet's axis (through where
// the hole closes, tilted by the lean) at the bowl's floor: it starts at the
// pinch depth and follows the floor up as the bowl fills (src/cavity.js
// bowlFloorAt), at most RISE_SHARE of the launch speed, the flux through it
// π·r0²·(u − w) (w its rise, the flux at least LEAST_FLUX of a still point's);
// the launch depth and the launched volume are tabulated once
// (LAUNCH_SAMPLES). The water leaves along the lean (`lean`, cos(lean) up and
// sin(lean) across, from src/splash.js: back along an oblique stone's path
// and towards a lopsided hole's bulge), tilted by up to 5° per jet, its
// direction wandering by WOBBLE of its speed times form.wobble (two slow
// waves a side over the first MAIN_SHARE of the launch): an irregular
// collapse throws its water a little sideways, unevenly.
//
// What starts the breakup. A real collapse is never perfectly smooth, and the
// column amplifies whatever unevenness it is launched with (Rayleigh–Plateau):
// the launch radius varies by form.roughness (ROUGHNESS for a clean jet) in
// a sum of waves along the launch (ROUGHNESS_WAVES times the column's most
// unstable wavelength there, 9 launch radii, at phases from the jet's own
// stream). A clean collapse's jet is smooth and breaks mostly from its tip
// (end-pinching); a rough, lopsided one's breaks along its length sooner. How
// much each unevenness grows is the physics': a needle a millimetre or two
// thick beads within milliseconds, a column centimetres thick needs longer
// than its flight.
//
// Forms. src/splash.js (jetForm) draws each throw's collapse: its focus (the
// needle's speed, form.needle: a smooth symmetric collapse focuses a fast
// needle, Gekle & Gordillo 2010; an irregular or oblique one less), its
// thickness (form.radiusScale), speed (the splash's speedScale), lean,
// wobble and roughness. These set only the launch; what the column then does
// is the solver's.
//
// Stepping. The solver steps on its own clock, each step's length from its
// own state (src/slenderJet.js), at most STEP_INFLOW of the needle's time
// plus the launch's age (the inflow's own pace); update() takes whole steps
// up to the splash's time and never cuts one short, so a seeded throw's jet
// is the same however the frames fell. It is a little behind the splash
// (less than a step), so drops are carried on ballistically to the splash's
// time when they are handed over and the mesh is drawn carried on too. Every
// new node leaves the launch point once the segment behind the column is
// EMIT_LENGTH launch radii long (within EMIT_LEAST and EMIT_MOST). Once the
// launch is over the column's foot stands in the pool (the solver's
// `anchored`).
//
// Drops. A piece the solver lets go as a drop (one bead) becomes a droplet of
// its water's radius and momentum (drops of LENS_DROP_RADIUS and more drawn
// as glass, like the column); drops under LEAST_DROP are not worth one and
// their water falls back. A drop bigger than DROP_CEILING (src/crown.js: 4
// mm in radius, the most surface tension holds together in flight; the
// reference throw's are up to 6 mm) does not fly whole: it leaves as drops of
// 2.4 to 4 mm that hold its water (breakLump, src/crown.js), starting within
// it and parting at its capillary speed sqrt(σ/(ρ·r)), at most LUMP_PIECES
// of them, past which the rest of its water is lost (for cost), from a stream
// of its own. A piece that reaches the water leaves as droplets
// node by node, so it lands (and rings) where it reaches it. Every pinch also
// throws spray (src/spray.js, neckSpray): NECK_SPRAY of the water of the
// drop that pinched off times form.spray, in drops of NECK_SPRAY_SIZE of its
// radius, kicked at the neck's capillary speed, from a stream of its own.
//
// Falling back. The column's water that drains back into the pool (the
// solver's `fallen`: what comes down under the bowl's floor or the surface,
// BASE_DEPTH below it) makes, when the column is gone, a mound at the foot
// (height 0.22·R times the strength: the cube root of the fallen volume
// against FALLBACK_VOLUME, times (R / 3 cm)^FALLBACK_SIZE, which keeps the
// strength of the rings the pond's waves were calibrated with) with foam, a
// patch of foam specks in a disc of 1.6·R (FALLBACK_SPECKS times the
// strength) and a small secondary ring's push, which the splash leaves out
// (columnWater): the stone's ring (RING in src/splash.js) is fitted to a
// reference ring that holds it. A column still up after LONGEST seconds lets
// everything go as drops.
//
// updateGeometry() draws the solver's pieces once per rendered frame into one
// ROWS × COLUMNS ring grid (src/fluidMesh.js): a ring per node along each
// piece, around the column's local radius (the mean of the segments either
// side), a bead larger than BEAD_SHOWN of its column as BEAD_RINGS rings of
// its sphere, each free end a hemisphere of CAP_RINGS rings and a pole, the
// pieces joined by rings of no radius (which draw nothing); normals from the
// shapes (a ring's slope, a sphere's latitude); aRound 1 on spheres and caps
// (the composite's lens). A long column with more nodes than rows is drawn
// through every few of them. SplashSystem draws the mesh with the column
// materials in src/shaders/sheet.js through the droplets' screen-space fluid
// passes, where the composite shades it as a glass lens. Below the bowl's
// floor the column is inside the water, and the cavity's walls hide it. In
// the pool (`walls`, set by SplashSystem) the column is held inside its walls
// (holdWithinWalls in src/fluidMesh.js).
import * as THREE from 'three';
import { createRingGrid, holdWithinWalls, markChanged } from './fluidMesh.js';
import { seededRandom, sprayDrops } from './spray.js';
import { SlenderJet, WATER } from './slenderJet.js';
import { DROP_CEILING, breakLump } from './crown.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;     // the stone size the launch was fitted for
const ROWS = 200;                  // rings in the grid
const COLUMNS = 16;                // around the axis
const CAP_RINGS = 4;               // rings over a free end's hemisphere, besides its pole
const BEAD_RINGS = 6;              // rings around a bead's sphere
const BEAD_SHOWN = 0.9;            // a bead wider than this many of its column's radii is drawn as a sphere
const NODES = 1536;                // the solver's capacity
// The launch (the header), in the bowl's time unit sqrt(z_p/g) and the body's speed U.
const LAUNCH_END = 1.63;           // T_end: the last water leaves this long after the pinch
const MAIN_SHARE = 0.4;            // the wobble's waves span this share of it
const NEEDLE_TIME = 0.026;         // the needle's extra speed decays over this
const NEEDLE = 3.0;                // the needle's first water leaves at this many times U (form.needle)
const BODY_POWER = 1.6;            // the body's speed falls as U·(1 − tau/T_end)^this...
const BASE_SPEED = 0.12;           // ...to this share of U, the base's last water
const NEEDLE_RADIUS = 0.065;       // launch radius in Rj: the needle's...
const BODY_RADIUS = 0.27;          // ...the body's, reached over BODY_GROWTH of T_end...
const BODY_GROWTH = 0.12;
const BASE_RADIUS = 1.67;          // ...and the base's at T_end, growing as (tau/T_end)^BASE_POWER
const BASE_POWER = 0.8;
const RISE_SHARE = 0.6;            // the launch point rises with the bowl's floor at most this share of the launch speed
const LEAST_FLUX = 0.1;            // the flux through a rising launch point is at least this share of a still one's
const LAUNCH_SAMPLES = 96;         // the launch depth, volume and roughness phase are tabulated at these many times, denser early
const DEFAULT_PINCH = 7.5;         // in R: with no bowl given, the jet's time unit is sqrt(this·R/g) and it leaves from the surface
const JET_RADIUS_POWER = 0.25;     // the column's radii in R·(R / 3 cm)^this: fatter at a lower Froude number...
const JET_RADIUS_LEAST = 0.009;    // ...and never under this (m): a needle of 0.6 mm, a body of 2.4 mm (the header)
const MAX_TILT = THREE.MathUtils.degToRad(5);
const WOBBLE = 0.01;               // lateral launch velocity over launch speed, times form.wobble
const ROUGHNESS = 0.015;           // the launch radius varies by this share for a clean collapse (form.roughness)...
const ROUGHNESS_WAVES = [0.45, 0.7, 1.0, 1.45, 2.2];   // ...in waves of these many of the column's most unstable wavelength
const UNSTABLE_WAVELENGTH = 9.02;  // Rayleigh–Plateau's most unstable wavelength, in radii
const BASE_DEPTH = 0.004;          // the water the column drains into is this far under the bowl's floor (or the surface)
const SLEEVE_START = 0.3;          // the sleeve starts where the base's launch radius is this share of the core's...
const SLEEVE_TAPER = 0.25;         // ...and widens from the core's radius over this share of what it spans
const SLEEVE_RINGS = 18;           // rings along the sleeve
const BUNCH_CAP = 1.4;             // where the sleeve's water bunches, its radius is at most this many launch radii
const EMIT_LENGTH = 1.2;           // a node leaves the launch point once its segment is this many launch radii long...
const EMIT_LEAST = 0.0004;         // ...and at least this (m)...
const EMIT_MOST = 0.03;            // ...or this long, whatever its radius (m)
const STEP_INFLOW = 0.3;           // a step is at most this share of the needle's time plus the launch's age
const LEAST_DROP = 0.00025;        // m: drops smaller than this are not handed over; their water falls back
const LONGEST = 6;                 // s: a column still up after this lets go of everything
const FALLBACK_VOLUME = 2.9e-4;    // m³: a fallen volume this big from a 3 cm stone makes a mound and a ring of strength 1...
const FALLBACK_SIZE = 0.43;        // ...times (R / 3 cm)^this, so the rings keep the strength they were calibrated with (the header)
const FALLBACK_SPECKS = 35;        // foam specks where the jet falls back, times the mound's strength
const LENS_DROP_RADIUS = 0.002;    // drops this big are drawn as glass like the column
const LUMP_PIECES = 64;            // a drop over DROP_CEILING breaks into at most this many (the header's Drops)
const NECK_SPRAY = 0.03;           // a pinching neck throws this share of its drop's water as spray (times form.spray)...
const NECK_SPRAY_SIZE = 0.12;      // ...in drops of this share of its radius on average...
const NECK_SPRAY_MOST = 0.0004;    // ...at most this (m)

/**
 * A jet's form (the header): how the collapse launches its water. The splash
 * picks these per throw (src/splash.js); the defaults are a clean collapse.
 */
export const CLEAN_FORM = Object.freeze({
  needle: NEEDLE,            // the needle's first water leaves at this many times the body's speed
  radiusScale: 1,            // the column's launch radii
  roughness: ROUGHNESS,      // how unevenly it is launched (the radius's share)
  wobble: 1,                 // how far its direction wanders
  spray: 1,                  // the necks' fine spray at each pinch
});

const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};
const sphereRadius = (volume) => Math.cbrt((3 * Math.max(volume, 0)) / (4 * Math.PI));
const NO_BOWL = (age, out) => { out.depth = 0; out.rise = 0; return out; };

export class JetColumn {
  /**
   * @param x,z where the hole closes: the jet's axis meets the surface there
   * @param radius the stone's radius
   * @param speed the body's launch speed U (the needle's first water leaves at form.needle times it)
   * @param startTime splash time of the pinch-off
   * @param material the material the mesh starts with (the splash swaps it per pass)
   * @param lean how far the column leans from vertical (radians), towards the unit direction (leanX, leanZ)
   * @param form the jet's form (CLEAN_FORM's fields, the header)
   * @param random the jet's own random stream (0 to 1), so a seeded throw's jet comes out the same
   * @param floor (age, out) → out {depth, rise}: the bowl's floor (src/cavity.js bowlFloorAt) at an age of the jet
   * @param bowlUnit the bowl's time unit (s): sqrt(z_p/g) (src/cavity.js bowlUnit)
   * @param volume the water it launches (m³; the base's radius is scaled to it), or null for the base's own
   */
  constructor({ x, z, radius, speed, startTime, material, lean = 0, leanX = 0, leanZ = 0, form = null, random = Math.random, floor = null, bowlUnit = null, volume = null }) {
    this.form = { ...CLEAN_FORM, ...form };
    this.random = random;
    this.sprayRandom = seededRandom(x, z, startTime, radius);   // the spray's own stream (src/spray.js)
    this.lumpRandom = seededRandom(x, z, startTime, radius, 4);   // the broken lumps' own (breakUp)
    this.lump = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };     // scratch for breakUp
    this.centreX = x;
    this.centreZ = z;
    this.radius = radius;
    this.sizeFactor = radius / REFERENCE_RADIUS;
    this.columnRadius = Math.max(radius * this.sizeFactor ** JET_RADIUS_POWER, JET_RADIUS_LEAST) * this.form.radiusScale;   // Rj in the header
    this.bodySpeed = speed;
    this.tipSpeed = speed * Math.max(this.form.needle, 1);   // the needle's first water, the fastest
    this.startTime = startTime;
    this.walls = null;   // the pool's walls, inset (src/splash.js setGround), or none
    this.age = 0;
    this.finished = false;
    this.floor = floor ?? NO_BOWL;
    const unit = bowlUnit ?? Math.sqrt((DEFAULT_PINCH * radius) / GRAVITY);
    this.launchEnd = LAUNCH_END * unit;
    this.needleTime = NEEDLE_TIME * unit;

    // Launch direction per unit speed: up by cos(lean), across by sin(lean),
    // plus the jet's own small tilt and the wobble (launchDirection).
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
    // The wobble: two slow waves a side over the main launch.
    const span = MAIN_SHARE * this.launchEnd;
    const mode = (amplitude, cycles) => ({
      amplitude: WOBBLE * this.form.wobble * amplitude * this.range(0.6, 1) * (this.random() < 0.5 ? -1 : 1),
      frequency: (Math.PI * 2 * cycles * this.range(0.8, 1.25)) / span,
      phase: this.range(0, Math.PI * 2),
    });
    this.wobbleX = [mode(0.8, 0.7), mode(0.5, 1.6)];
    this.wobbleZ = [mode(0.8, 0.7), mode(0.5, 1.6)];
    // The launch's unevenness: waves along its unstable phase (the header).
    const weights = ROUGHNESS_WAVES.map(() => this.range(0.4, 1));
    const norm = Math.sqrt(weights.reduce((sum, weight) => sum + 0.5 * weight * weight, 0)) || 1;
    this.roughWaves = ROUGHNESS_WAVES.map((multiple, index) => ({ multiple: multiple * this.range(0.85, 1.18), weight: weights[index] / norm, phase: this.range(0, Math.PI * 2) }));
    this.baseScale = 1;
    this.buildLaunch(volume);
    // Where the sleeve starts: the first water whose base is SLEEVE_START of its core.
    this.sleeveTop = this.launchEnd;
    if (this.baseScale > 0) {
      for (let sample = 0; sample <= 200; sample++) {
        const tau = this.launchEnd * (sample / 200) ** 2;
        if (this.baseScale * this.baseRadius(tau) >= SLEEVE_START * this.coreRadius(tau)) { this.sleeveTop = tau; break; }
      }
    }

    // The column: a first segment of the water launched over a quarter of
    // the needle's time, already in flight, then the inflow.
    this.solver = new SlenderJet({ capacity: NODES, gravity: GRAVITY, water: WATER, random: seededRandom(x, z, startTime, radius, 3) });
    this.solver.fallen = this.baseWater;   // the sleeve's water falls back (the header)
    this.solverTime = 0;
    this.launching = true;
    this.fallenHandled = 0;
    this.dropCount = 0;          // drops handed over (for the probes)
    this.largestDrop = 0;
    this.highest = 0;            // the highest any of its water has been (m)
    this.firstDrop = null;       // {age, radius, speed} of the first drop handed over
    const seed = 0.25 * this.needleTime;
    const point = this.launchPoint(0, {}), direction = this.launchDirection(0, {});
    const start = this.launchSpeed(0);
    this.solver.push(point.x + direction.x * start * seed, point.y + direction.y * start * seed, point.z + direction.z * start * seed, direction.x * start, direction.y * start - GRAVITY * seed, direction.z * start);
    this.placeInflow(seed);
    this.solver.volume[0] = this.volume(0, seed);
    this.solver.inflow = true;
    this.solverTime = seed;

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
    // The drawn nodes, carried on to the frame's time, and the rings they make.
    this.drawX = new Float64Array(NODES); this.drawY = new Float64Array(NODES); this.drawZ = new Float64Array(NODES);
    this.ring = { count: 0, centre: new Float64Array(ROWS * 3), axis: new Float64Array(ROWS * 3), radius: new Float64Array(ROWS), water: new Float64Array(ROWS), round: new Float64Array(ROWS), along: new Float64Array(ROWS * 2) };
    this.frame = { firstX: 1, firstY: 0, firstZ: 0 };
    this.bowl = { depth: 0, rise: 0 };
  }

  /** A draw from the jet's stream between two values. */
  range(low, high) { return low + this.random() * (high - low); }

  // ---- the launch ----------------------------------------------------------

  /**
   * Tabulate the launch (the header): at LAUNCH_SAMPLES + 1 launch times,
   * crowded towards the start (tau = T_end·(i/n)²), the launch point's depth
   * below the surface (rising with the bowl's floor, at most RISE_SHARE of the
   * launch speed), the volume launched so far and the unstable phase (2π per
   * most unstable wavelength of column launched). Given a volume, the base's
   * radius is scaled so that the jet launches just that: the volume is a
   * quadratic in the scale k, A + 2·B·k + C·k² over the needle's and body's
   * radius and the base's.
   */
  buildLaunch(target) {
    const samples = LAUNCH_SAMPLES;
    this.launchTaus = new Float64Array(samples + 1);
    this.launchDepths = new Float64Array(samples + 1);
    this.launchVolumes = new Float64Array(samples + 1);
    this.launchPhases = new Float64Array(samples + 1);
    const cores = new Float64Array(samples + 1), crosses = new Float64Array(samples + 1), bases = new Float64Array(samples + 1);
    const lengths = new Float64Array(samples + 1);
    const bowl = { depth: 0, rise: 0 };
    let depth = this.floor(0, bowl).depth;
    let core = 0, cross = 0, base = 0, launched = 0;
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
      const through = Math.max(speed - rose / (step * this.upShare), LEAST_FLUX * speed) * step;
      const flux = Math.PI * through;
      const coreRadius = this.coreRadius(middle), baseRadius = this.baseRadius(middle);
      core += coreRadius * coreRadius * flux;
      cross += coreRadius * baseRadius * flux;
      base += baseRadius * baseRadius * flux;
      launched += through;
      this.launchTaus[index] = tau;
      this.launchDepths[index] = depth;
      cores[index] = core; crosses[index] = cross; bases[index] = base;
      lengths[index] = launched;
    }
    if (target !== null && base > 0) {
      const excess = core - target;
      this.baseScale = excess >= 0 ? 0 : (-cross + Math.sqrt(cross * cross - base * excess)) / base;
    }
    // The solver takes the core; the base's water flies as the sleeve (the header) and falls back.
    const scale = this.baseScale;
    this.baseWater = 2 * scale * cross + scale * scale * base;
    for (let index = 0; index <= samples; index++) this.launchVolumes[index] = cores[index];
    // The unstable phase: column launched over its most unstable wavelength, 2π each.
    let phase = 0;
    for (let index = 1; index <= samples; index++) {
      const middle = 0.5 * (this.launchTaus[index - 1] + this.launchTaus[index]);
      phase += (Math.PI * 2 * (lengths[index] - lengths[index - 1])) / (UNSTABLE_WAVELENGTH * Math.max(this.launchRadius(middle, false), 1e-5));
      this.launchPhases[index] = phase;
    }
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

  tabulated(table, tau) {
    const sample = this.launchSample(tau, this.sample ??= {});
    return table[sample.index] + (table[sample.index + 1] - table[sample.index]) * sample.blend;
  }

  /** The launch point's depth below the surface (along the axis's height) for the water launched at tau. */
  launchDepth(tau) { return this.tabulated(this.launchDepths, tau); }

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

  /** The launch radius at tau; `rough`: with the launch's unevenness (the header). */
  launchRadius(tau, rough = true) {
    const smooth = this.coreRadius(tau);
    if (!rough || this.form.roughness <= 0) return smooth;
    const phase = this.tabulated(this.launchPhases, tau);
    let wave = 0;
    for (const component of this.roughWaves) wave += component.weight * Math.sin(phase / component.multiple + component.phase);
    return smooth * (1 + this.form.roughness * wave);
  }

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

  /** Volume launched between two launch times: the table's, with the unevenness of the radius at the middle. */
  volume(tauFrom, tauTo) {
    tauFrom = Math.max(tauFrom, 0);
    tauTo = Math.min(tauTo, this.launchEnd);
    if (tauTo <= tauFrom) return 0;
    const middle = 0.5 * (tauFrom + tauTo);
    const unevenness = this.launchRadius(middle) / Math.max(this.launchRadius(middle, false), 1e-9);
    return (this.tabulated(this.launchVolumes, tauTo) - this.tabulated(this.launchVolumes, tauFrom)) * unevenness * unevenness;
  }

  /** The launch point at tau, into `out` {x, y, z}. */
  launchPoint(tau, out) {
    const depth = this.launchDepth(tau);
    out.x = this.centreX - this.axisSlopeX * depth;
    out.y = -depth;
    out.z = this.centreZ - this.axisSlopeZ * depth;
    return out;
  }

  /** The launch direction per unit speed at tau (the lean, tilt and wobble), into `out` {x, y, z}. */
  launchDirection(tau, out) {
    let lateralX = this.tiltX, lateralZ = this.tiltZ;
    for (const mode of this.wobbleX) lateralX += mode.amplitude * Math.sin(mode.frequency * tau + mode.phase);
    for (const mode of this.wobbleZ) lateralZ += mode.amplitude * Math.sin(mode.frequency * tau + mode.phase);
    out.x = lateralX;
    out.y = this.upShare;
    out.z = lateralZ;
    return out;
  }

  /** d launchSpeed / d tau. */
  launchSpeedSlope(tau) {
    if (tau >= this.launchEnd) return 0;
    return (-this.bodySpeed * (1 - BASE_SPEED) * BODY_POWER / this.launchEnd) * Math.max(1 - tau / this.launchEnd, 0) ** (BODY_POWER - 1)
      - ((this.tipSpeed - this.bodySpeed) / this.needleTime) * Math.exp(-tau / this.needleTime);
  }

  /** The height of the water launched at tau, flown ballistically to now (the sleeve). */
  heightAt(tau) {
    const age = Math.max(this.age - tau, 0);
    return -this.launchDepth(tau) + this.launchSpeed(tau) * this.upShare * age - 0.5 * GRAVITY * age * age;
  }

  /**
   * The sleeve (the header): the water launched at tau, flown ballistically
   * to now, into `out` {x, y, z, axisX, axisY, axisZ, radius, core}: its
   * place, the column's axis there (pointing up it), the radius the whole
   * launch makes there (core and base, r0·sqrt((u − w)/|∂position/∂tau|),
   * the flux spread over the spacing of its neighbours) and the core's alone.
   */
  sleeveAt(tau, out) {
    tau = Math.min(Math.max(tau, 0), this.launchEnd);
    const speed = this.launchSpeed(tau), speedSlope = this.launchSpeedSlope(tau);
    const age = Math.max(this.age - tau, 0);
    let lateralX = this.tiltX, slopeX = 0, lateralZ = this.tiltZ, slopeZ = 0;
    for (const mode of this.wobbleX) { const angle = mode.frequency * tau + mode.phase; lateralX += mode.amplitude * Math.sin(angle); slopeX += mode.amplitude * mode.frequency * Math.cos(angle); }
    for (const mode of this.wobbleZ) { const angle = mode.frequency * tau + mode.phase; lateralZ += mode.amplitude * Math.sin(angle); slopeZ += mode.amplitude * mode.frequency * Math.cos(angle); }
    const depth = this.launchDepth(tau), rise = this.launchRise(tau);
    out.x = this.centreX - this.axisSlopeX * depth + speed * lateralX * age;
    out.y = -depth + speed * this.upShare * age - 0.5 * GRAVITY * age * age;
    out.z = this.centreZ - this.axisSlopeZ * depth + speed * lateralZ * age;
    // ∂position/∂tau: the launch point's motion + (d launch velocity / d tau)·a − launch velocity + g·a·up.
    const alongX = this.axisSlopeX * rise + (speedSlope * lateralX + speed * slopeX) * age - speed * lateralX;
    const alongY = rise + (speedSlope * age - speed) * this.upShare + GRAVITY * age;
    const alongZ = this.axisSlopeZ * rise + (speedSlope * lateralZ + speed * slopeZ) * age - speed * lateralZ;
    const spacing = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
    if (spacing > 1e-9) { out.axisX = -alongX / spacing; out.axisY = -alongY / spacing; out.axisZ = -alongZ / spacing; } else { out.axisX = 0; out.axisY = 1; out.axisZ = 0; }
    const flux = Math.max(speed - rise / this.upShare, LEAST_FLUX * speed);
    const stretch = spacing > 1e-9 ? Math.min(Math.sqrt(flux / spacing), BUNCH_CAP) : BUNCH_CAP;
    const core = this.coreRadius(tau);
    out.radius = (core + this.baseScale * this.baseRadius(tau)) * stretch;
    out.core = core * stretch;
    return out;
  }

  /** The launch time of the sleeve's water now at the water it stands in (the bowl's floor, or the surface). */
  sleeveFoot() {
    const level = -this.floor(this.age, this.bowl).depth - BASE_DEPTH;
    const limit = Math.min(this.age, this.launchEnd);
    if (this.heightAt(limit) >= level) return limit;
    let low = this.sleeveTop, high = limit;
    if (this.heightAt(low) < level) return low;
    for (let step = 0; step < 24; step++) {
      const middle = 0.5 * (low + high);
      if (this.heightAt(middle) >= level) low = middle; else high = middle;
    }
    return low;
  }

  /** Hold the solver's last node at the launch point for tau, moving with the water launched there; its radius for the solver. */
  placeInflow(tau) {
    const solver = this.solver;
    const point = this.launchPoint(tau, this.pointScratch ??= {});
    const direction = this.launchDirection(tau, this.directionScratch ??= {});
    const speed = this.launchSpeed(tau);
    const node = solver.count - 1;
    if (node < 0 || solver.chainEnd[node] !== 1 || !solver.inflow) {
      solver.push(point.x, point.y, point.z, direction.x * speed, direction.y * speed, direction.z * speed);
    } else {
      solver.positionX[node] = point.x; solver.positionY[node] = point.y; solver.positionZ[node] = point.z;
      solver.velocityX[node] = direction.x * speed; solver.velocityY[node] = direction.y * speed; solver.velocityZ[node] = direction.z * speed;
    }
    solver.inflowRadius = this.launchRadius(tau);
  }

  // ---- per substep ---------------------------------------------------------

  /** Advance to the given splash time: the solver's whole steps up to it, the drops it lets go and the water it drains. */
  update(time, dt, splash, water) {
    this.age = time - this.startTime;
    if (this.finished) return;
    const solver = this.solver;
    for (;;) {
      if (solver.count === 0 && !this.launching) break;
      if (!solver.fresh) solver.measure();
      let step = solver.stableStep();
      if (this.launching) step = Math.min(step, STEP_INFLOW * (this.needleTime + this.solverTime));
      if (this.solverTime + step > this.age) break;
      const from = this.solverTime;
      const to = from + step;
      solver.advance(step, this.launching ? this.volume(from, to) : 0);
      this.solverTime = to;
      if (this.launching) {
        this.placeInflow(to);
        // A node leaves the launch point once the segment behind the column is long enough.
        const node = solver.count - 1;
        if (node > 0 && !solver.chainEnd[node - 1]) {
          const length = Math.hypot(solver.positionX[node] - solver.positionX[node - 1], solver.positionY[node] - solver.positionY[node - 1], solver.positionZ[node] - solver.positionZ[node - 1]);
          if (length > Math.min(Math.max(EMIT_LENGTH * solver.inflowRadius, EMIT_LEAST), EMIT_MOST)) {
            solver.push(solver.positionX[node], solver.positionY[node], solver.positionZ[node], solver.velocityX[node], solver.velocityY[node], solver.velocityZ[node]);
          }
        }
        if (to >= this.launchEnd) { this.launching = false; solver.inflow = false; solver.anchored = true; }
      }
      solver.waterLevel = -this.floor(to, this.bowl).depth - BASE_DEPTH;
      solver.landingLevel = Math.min(0, solver.waterLevel + BASE_DEPTH);
      solver.refine(this.startTime + to);
      this.handOver(splash);
      if (to > LONGEST) { solver.releaseAll(this.startTime + to); this.handOver(splash); this.launching = false; }
    }
    if (!this.launching && solver.count === 0) this.fallBack(splash, water);
  }

  /** Break whatever is left into drops now (when too many jets are alive). */
  finishNow(splash, water) {
    if (this.finished) return;
    this.solver.releaseAll(this.startTime + this.solverTime);
    this.handOver(splash);
    this.launching = false;
    this.fallBack(splash, water);
  }

  /** The solver's events: drops to the splash, carried on to its time; spray at every pinch. */
  handOver(splash) {
    const events = this.solver.events;
    for (const event of events) {
      if (event.kind === 'pinch') { this.neckSpray(splash, event, event.radius); continue; }
      this.highest = Math.max(this.highest, event.y + event.radius);
      if (event.radius < LEAST_DROP) { this.solver.fallen += event.volume; continue; }
      const carried = Math.max(splash.time - event.time, 0);
      const x = event.x + event.vx * carried, y = event.y + event.vy * carried - 0.5 * GRAVITY * carried * carried, z = event.z + event.vz * carried;
      if (event.radius > DROP_CEILING) this.breakUp(splash, x, y, z, event.vx, event.vy - GRAVITY * carried, event.vz, event.radius);
      else splash.spawnDroplet(x, y, z, event.vx, event.vy - GRAVITY * carried, event.vz, event.radius, event.radius >= LENS_DROP_RADIUS);
      this.dropCount++;
      this.largestDrop = Math.max(this.largestDrop, event.radius);
      if (!event.landing && this.firstDrop === null) this.firstDrop = { age: event.time - this.startTime, radius: event.radius, speed: Math.hypot(event.vx, event.vy, event.vz), height: event.y };
    }
    events.length = 0;
  }

  /** A drop too big to fly whole (over DROP_CEILING) leaves as several (the header's Drops). */
  breakUp(splash, x, y, z, vx, vy, vz, radius) {
    const lump = this.lump;
    lump.x = x; lump.y = y; lump.z = z; lump.vx = vx; lump.vy = vy; lump.vz = vz;
    breakLump(lump, radius, DROP_CEILING, LUMP_PIECES, radius, Math.sqrt(WATER.surfaceTension / (WATER.density * radius)), this.lumpRandom,
      (pieceX, pieceY, pieceZ, pieceVX, pieceVY, pieceVZ, piece) => splash.spawnDroplet(pieceX, pieceY, pieceZ, pieceVX, pieceVY, pieceVZ, piece, piece >= LENS_DROP_RADIUS));
  }

  /** The column is gone: the water it drained makes a mound, a ring and foam at its foot. */
  fallBack(splash, water) {
    if (this.finished) return;
    this.finished = true;
    const fallen = this.solver.fallen;
    if (fallen <= 0) return;
    const strength = Math.cbrt(fallen / FALLBACK_VOLUME) * this.sizeFactor ** FALLBACK_SIZE;
    const radius = this.radius;
    // A leaning column falls back downrange, where its foot went.
    const point = this.launchPoint(this.launchEnd, {});
    const direction = this.launchDirection(this.launchEnd, {});
    const drift = this.launchSpeed(this.launchEnd) * 2 * this.launchSpeed(this.launchEnd) * this.upShare / GRAVITY;
    const fallX = point.x + direction.x * drift, fallZ = point.z + direction.z * drift;
    water.addSplat({ x: fallX, z: fallZ, radius: radius * 0.9, height: 0.22 * radius * strength });
    water.addSplat({ x: fallX, z: fallZ, radius: radius * 1.5, velocity: -0.18 * strength, rim: 1.8 });
    water.addFoam({ x: fallX, z: fallZ, radius: radius * 1.3, amount: 0.3 * strength });
    splash.spawnFoamSpecks(fallX, fallZ, 0, radius * 1.6, Math.round(FALLBACK_SPECKS * strength), 0.025);
  }

  /**
   * The fine spray a neck throws as a drop of `radius` pinches off at `state`
   * (src/spray.js): NECK_SPRAY of its water times form.spray, in drops of
   * NECK_SPRAY_SIZE of its radius on average (at most NECK_SPRAY_MOST),
   * kicked at the neck's capillary speed.
   */
  neckSpray(splash, state, radius) {
    if (!splash.spray || radius <= 0) return;
    const size = Math.min(NECK_SPRAY_SIZE * radius, NECK_SPRAY_MOST);
    splash.spray.burst({
      x: state.x, y: state.y, z: state.z, vx: state.vx, vy: state.vy, vz: state.vz,
      drops: sprayDrops(NECK_SPRAY * this.form.spray * (4 / 3) * Math.PI * radius ** 3, size), radius: size,
      kick: Math.sqrt(WATER.surfaceTension / (WATER.density * size)), spread: radius, time: splash.time, random: this.sprayRandom, sizeFactor: this.sizeFactor,
    });
  }

  /** The highest point of the column's water now (m), for the probes. */
  topHeight() {
    const solver = this.solver;
    let top = -Infinity;
    for (let node = 0; node < solver.count; node++) top = Math.max(top, solver.positionY[node] + solver.beadRadius(node));
    return top;
  }

  // ---- per rendered frame ------------------------------------------------

  /** Draw the solver's pieces as they are now, carried on to the splash's time (the header). */
  updateGeometry(time) {
    this.age = time - this.startTime;
    const solver = this.solver;
    const count = solver.count;
    if (!solver.fresh) solver.measure();
    const carried = Math.max(this.age - this.solverTime, 0);
    const fall = 0.5 * GRAVITY * carried * carried;
    for (let node = 0; node < count; node++) {
      const held = solver.held(node);
      this.drawX[node] = solver.positionX[node] + (held ? 0 : solver.velocityX[node] * carried);
      this.drawY[node] = solver.positionY[node] + (held ? 0 : solver.velocityY[node] * carried - fall);
      this.drawZ[node] = solver.positionZ[node] + (held ? 0 : solver.velocityZ[node] * carried);
      if (!held) this.highest = Math.max(this.highest, this.drawY[node]);
    }
    const ring = this.ring;
    ring.count = 0;
    // Tube rings in all: past the rows, the long pieces are drawn through every few nodes.
    let needed = 0, chainStart = 0;
    while (chainStart < count) {
      let chainLast = chainStart;
      while (chainLast < count - 1 && !solver.chainEnd[chainLast]) chainLast++;
      needed += 2 * (CAP_RINGS + 1);
      for (let node = chainStart; node <= chainLast; node++) needed += this.beadShown(node, chainStart, chainLast) ? BEAD_RINGS : 1;
      chainStart = chainLast + 1;
    }
    const stride = Math.max(1, Math.ceil(needed / (ROWS - SLEEVE_RINGS - 4)));
    chainStart = 0;
    while (chainStart < count && ring.count < ROWS - SLEEVE_RINGS - 4) {
      let chainLast = chainStart;
      while (chainLast < count - 1 && !solver.chainEnd[chainLast]) chainLast++;
      this.drawChain(chainStart, chainLast, stride);
      chainStart = chainLast + 1;
    }
    this.drawSleeve();
    // The unused rows: rings of no radius on the last point drawn.
    const lastRing = Math.max(ring.count - 1, 0);
    const restX = ring.count > 0 ? ring.centre[lastRing * 3] : this.centreX, restY = ring.count > 0 ? ring.centre[lastRing * 3 + 1] : -1, restZ = ring.count > 0 ? ring.centre[lastRing * 3 + 2] : this.centreZ;
    for (let row = 0; row < ROWS; row++) {
      if (row < ring.count) this.writeRing(row);
      else this.writePoint(row, restX, restY, restZ);
    }
    this.mesh.visible = ring.count > 0;
    holdWithinWalls(this.positions, this.walls);
    markChanged(this.geometry, ['position', 'normal', 'aRadius', 'aRound']);
  }

  /** The column's radius at a node: the mean of its segments' either side (the drawing). */
  tubeRadius(node, first, last) {
    const solver = this.solver;
    const before = node > first ? solver.segmentRadius[node - 1] : 0;
    const after = node < last ? solver.segmentRadius[node] : 0;
    return node > first && node < last ? 0.5 * (before + after) : Math.max(before, after);
  }

  beadShown(node, first, last) {
    const bead = this.solver.beadRadius(node);
    return bead > 0 && bead > BEAD_SHOWN * this.tubeRadius(node, first, last);
  }

  /** The rings of one piece from its first node to its last: a cap, a ring per node (a sphere per bead), a cap. */
  drawChain(first, last, stride) {
    const solver = this.solver;
    const axis = this.axisScratch ??= { x: 0, y: 1, z: 0 };
    const nodeAxis = (node) => {
      const before = Math.max(node - 1, first), after = Math.min(node + 1, last);
      let alongX = this.drawX[after] - this.drawX[before], alongY = this.drawY[after] - this.drawY[before], alongZ = this.drawZ[after] - this.drawZ[before];
      const length = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
      if (length < 1e-9) { alongX = 0; alongY = -1; alongZ = 0; } else { alongX /= length; alongY /= length; alongZ /= length; }
      // The chain runs from its top (first) down to its foot: the axis points along it.
      axis.x = alongX; axis.y = alongY; axis.z = alongZ;
      return axis;
    };
    // Its top: a hemisphere over the first node (or its bead's upper half).
    const topRadius = Math.max(this.tubeRadius(first, first, last), solver.beadRadius(first));
    nodeAxis(first);
    const topX = this.drawX[first], topY = this.drawY[first], topZ = this.drawZ[first];
    const topAxisX = axis.x, topAxisY = axis.y, topAxisZ = axis.z;
    if (!this.beadShown(first, first, last)) {
      for (let ring = 0; ring <= CAP_RINGS; ring++) {
        const polar = (ring / (CAP_RINGS + 1)) * Math.PI * 0.5;
        this.addRing(topX - topAxisX * topRadius * Math.cos(polar), topY - topAxisY * topRadius * Math.cos(polar), topZ - topAxisZ * topRadius * Math.cos(polar),
          topAxisX, topAxisY, topAxisZ, topRadius * Math.sin(polar), topRadius, 1, -Math.cos(polar), Math.sin(polar));
      }
    } else {
      this.addRing(topX - topAxisX * topRadius, topY - topAxisY * topRadius, topZ - topAxisZ * topRadius, topAxisX, topAxisY, topAxisZ, 0, topRadius, 1, -1, 0);
    }
    for (let node = first; node <= last; node++) {
      const shown = this.beadShown(node, first, last);
      if (!shown && node !== first && node !== last && (node - first) % stride !== 0) continue;
      nodeAxis(node);
      const centreX = this.drawX[node], centreY = this.drawY[node], centreZ = this.drawZ[node];
      if (shown) {
        // A sphere, merging into the column above and below.
        const bead = solver.beadRadius(node);
        const above = node > first ? solver.segmentRadius[node - 1] : 0;
        const below = node < last ? solver.segmentRadius[node] : 0;
        for (let ring = 0; ring < BEAD_RINGS; ring++) {
          const polar = ((ring + 0.5) / BEAD_RINGS) * Math.PI;
          const side = polar < Math.PI * 0.5 ? above : below;
          const sphere = bead * Math.sin(polar);
          const radius = Math.max(sphere, side);
          const onSphere = sphere >= side;
          this.addRing(centreX - axis.x * bead * Math.cos(polar), centreY - axis.y * bead * Math.cos(polar), centreZ - axis.z * bead * Math.cos(polar),
            axis.x, axis.y, axis.z, radius, onSphere ? bead : radius, onSphere ? 1 : 0, onSphere ? -Math.cos(polar) : 0, onSphere ? Math.sin(polar) : 1);
        }
        continue;
      }
      const radius = this.tubeRadius(node, first, last);
      // The slope of the surface along the axis, from the segments either side.
      const before = node > first ? solver.segmentRadius[node - 1] : radius;
      const after = node < last ? solver.segmentRadius[node] : radius;
      const spanLength = (node > first ? solver.segmentLength[node - 1] : 0) + (node < last ? solver.segmentLength[node] : 0);
      const slope = spanLength > 1e-9 ? (2 * (after - before)) / spanLength : 0;
      const tilt = 1 / Math.sqrt(1 + slope * slope);
      this.addRing(centreX, centreY, centreZ, axis.x, axis.y, axis.z, radius, radius, 0, -slope * tilt, tilt);
    }
    // Its foot: a hemisphere under the last node (or its bead's lower pole).
    const footRadius = Math.max(this.tubeRadius(last, first, last), solver.beadRadius(last));
    nodeAxis(last);
    const footX = this.drawX[last], footY = this.drawY[last], footZ = this.drawZ[last];
    if (!this.beadShown(last, first, last)) {
      for (let ring = CAP_RINGS; ring >= 0; ring--) {
        const polar = (ring / (CAP_RINGS + 1)) * Math.PI * 0.5;
        this.addRing(footX + axis.x * footRadius * Math.cos(polar), footY + axis.y * footRadius * Math.cos(polar), footZ + axis.z * footRadius * Math.cos(polar),
          axis.x, axis.y, axis.z, footRadius * Math.sin(polar), footRadius, 1, Math.cos(polar), Math.sin(polar));
      }
    } else {
      this.addRing(footX + axis.x * footRadius, footY + axis.y * footRadius, footZ + axis.z * footRadius, axis.x, axis.y, axis.z, 0, footRadius, 1, 1, 0);
    }
  }

  /**
   * The sleeve's rings (the header): from a pole at its top, where it has
   * the core's radius and is hidden in the solver's column, widening to the
   * whole launch's radius over SLEEVE_TAPER of its span, down to the water
   * it stands in, closed under it. The axis runs down it, as a piece's does.
   */
  drawSleeve() {
    if (this.baseScale <= 0 || this.age <= this.sleeveTop) return;
    const top = this.sleeveTop, foot = this.sleeveFoot();
    if (foot <= top + 1e-6) return;
    const state = this.sleeveState ??= {};
    const samples = this.sleeveSamples ??= Array.from({ length: SLEEVE_RINGS }, () => ({ x: 0, y: 0, z: 0, axisX: 0, axisY: 0, axisZ: 0, radius: 0, along: 0 }));
    let along = 0;
    for (let index = 0; index < SLEEVE_RINGS; index++) {
      const share = index / (SLEEVE_RINGS - 1);
      const tau = top + (foot - top) * share;
      this.sleeveAt(tau, state);
      const sample = samples[index];
      if (index > 0) along += Math.hypot(state.x - samples[index - 1].x, state.y - samples[index - 1].y, state.z - samples[index - 1].z);
      sample.x = state.x; sample.y = state.y; sample.z = state.z;
      sample.axisX = -state.axisX; sample.axisY = -state.axisY; sample.axisZ = -state.axisZ;
      const widen = smoothstep(0, SLEEVE_TAPER, share);
      sample.radius = state.core + (state.radius - state.core) * widen;
      sample.along = along;
    }
    const first = samples[0], last = samples[SLEEVE_RINGS - 1];
    this.addRing(first.x - first.axisX * first.radius, first.y - first.axisY * first.radius, first.z - first.axisZ * first.radius, first.axisX, first.axisY, first.axisZ, 0, first.radius, 1, -1, 0);
    for (let index = 0; index < SLEEVE_RINGS; index++) {
      const sample = samples[index];
      const before = samples[Math.max(index - 1, 0)], after = samples[Math.min(index + 1, SLEEVE_RINGS - 1)];
      const span = after.along - before.along;
      const slope = span > 1e-9 ? (after.radius - before.radius) / span : 0;
      const tilt = 1 / Math.sqrt(1 + slope * slope);
      this.addRing(sample.x, sample.y, sample.z, sample.axisX, sample.axisY, sample.axisZ, sample.radius, sample.radius, 0, -slope * tilt, tilt);
    }
    this.addRing(last.x + last.axisX * last.radius, last.y + last.axisY * last.radius, last.z + last.axisZ * last.radius, last.axisX, last.axisY, last.axisZ, 0, last.radius, 1, 1, 0);
  }

  /** Queue a ring: centre, unit axis, radius, the water's radius behind it, roundness, and its normal's parts along the axis and outward. */
  addRing(centreX, centreY, centreZ, axisX, axisY, axisZ, radius, waterRadius, round, normalAlong, normalOut) {
    const ring = this.ring;
    if (ring.count >= ROWS) return;
    const index = ring.count++;
    ring.centre[index * 3] = centreX; ring.centre[index * 3 + 1] = centreY; ring.centre[index * 3 + 2] = centreZ;
    ring.axis[index * 3] = axisX; ring.axis[index * 3 + 1] = axisY; ring.axis[index * 3 + 2] = axisZ;
    ring.radius[index] = radius;
    ring.water[index] = waterRadius;
    ring.round[index] = round;
    ring.along[index * 2] = normalAlong;
    ring.along[index * 2 + 1] = normalOut;
  }

  /**
   * Write a queued ring into the grid, its vertices around its axis in a
   * frame carried along the piece (the previous ring's, turned onto this
   * axis), so the tube does not twist; its normals from its shape.
   */
  writeRing(row) {
    const ring = this.ring;
    const axisX = ring.axis[row * 3], axisY = ring.axis[row * 3 + 1], axisZ = ring.axis[row * 3 + 2];
    const frame = this.frame;
    let firstX = frame.firstX, firstY = frame.firstY, firstZ = frame.firstZ;
    if (row === 0 || ring.radius[row - 1] === 0 && ring.radius[row] === 0) { firstX = Math.abs(axisX) < 0.9 ? 1 : 0; firstY = 0; firstZ = Math.abs(axisX) < 0.9 ? 0 : 1; }
    // Turn the carried vector onto this ring's plane.
    const along = firstX * axisX + firstY * axisY + firstZ * axisZ;
    firstX -= along * axisX; firstY -= along * axisY; firstZ -= along * axisZ;
    let firstLength = Math.sqrt(firstX * firstX + firstY * firstY + firstZ * firstZ);
    if (firstLength < 1e-6) {
      firstX = Math.abs(axisX) < 0.9 ? 1 - axisX * axisX : -axisY * axisX;
      firstY = Math.abs(axisX) < 0.9 ? -axisX * axisY : 1 - axisY * axisY;
      firstZ = Math.abs(axisX) < 0.9 ? -axisX * axisZ : -axisY * axisZ;
      firstLength = Math.sqrt(firstX * firstX + firstY * firstY + firstZ * firstZ) || 1;
    }
    firstX /= firstLength; firstY /= firstLength; firstZ /= firstLength;
    frame.firstX = firstX; frame.firstY = firstY; frame.firstZ = firstZ;
    // second = first × axis, so the rings wind with outward grid normals.
    const secondX = firstY * axisZ - firstZ * axisY;
    const secondY = firstZ * axisX - firstX * axisZ;
    const secondZ = firstX * axisY - firstY * axisX;
    const centreX = ring.centre[row * 3], centreY = ring.centre[row * 3 + 1], centreZ = ring.centre[row * 3 + 2];
    const radius = ring.radius[row];
    const normalAlong = ring.along[row * 2], normalOut = ring.along[row * 2 + 1];
    for (let column = 0; column < COLUMNS; column++) {
      const vertex = row * COLUMNS + column;
      const cosAngle = this.columnCos[column], sinAngle = this.columnSin[column];
      const outX = firstX * cosAngle + secondX * sinAngle, outY = firstY * cosAngle + secondY * sinAngle, outZ = firstZ * cosAngle + secondZ * sinAngle;
      this.positions[vertex * 3] = centreX + outX * radius;
      this.positions[vertex * 3 + 1] = centreY + outY * radius;
      this.positions[vertex * 3 + 2] = centreZ + outZ * radius;
      this.normals[vertex * 3] = outX * normalOut + axisX * normalAlong;
      this.normals[vertex * 3 + 1] = outY * normalOut + axisY * normalAlong;
      this.normals[vertex * 3 + 2] = outZ * normalOut + axisZ * normalAlong;
      this.radii[vertex] = ring.water[row];
      this.roundness[vertex] = ring.round[row];
    }
  }

  /** A row with nothing to draw: every vertex on one point. */
  writePoint(row, x, y, z) {
    for (let column = 0; column < COLUMNS; column++) {
      const vertex = row * COLUMNS + column;
      this.positions[vertex * 3] = x; this.positions[vertex * 3 + 1] = y; this.positions[vertex * 3 + 2] = z;
      this.normals[vertex * 3] = 0; this.normals[vertex * 3 + 1] = 1; this.normals[vertex * 3 + 2] = 0;
      this.radii[vertex] = 0;
      this.roundness[vertex] = 0;
    }
  }

  dispose() {
    this.geometry.dispose();
  }
}
