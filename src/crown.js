// The crown: the thin sheet of water a stone throws up as it enters.
//
// The sheet is material launched continuously from a ring around the stone,
// each ring element then flying on its own. Surface tension and air slow a
// real sheet's rim fast (which is why crowns never reach the height their
// launch speed implies), modelled as a velocity decaying as exp(−age/τd) with
// τd = 0.05 s for a 3 cm stone (see the scaling below) while gravity acts
// undamped. So the whole sheet is a closed form in launch time tau, azimuth
// theta and the crown's age t; with a = t − tau,
//
//   position = launch point + u·direction·τd·(1 − exp(−a/τd)) − ½·g·a²·up
//
// With stone radius R and entry speed V the main launch lasts
// T = max(1.2·R/V, 0.01) s. Over it the launch speed u falls from 0.55·V to
// 0.2·V and its angle from vertical from 55° to 25°: the first material makes
// the flared rim and later material the steeper wall under it. After T a tail
// keeps feeding the wall at 0.2·V·exp(−(tau − T)/(0.45·T)), so the base stays
// on the water while the sheet lives. The tail leaves the ring at 0.6·h0, so
// the foot stays light.
//
// The ring a stone's sheet launches from is the lip of its cavity (`rim`,
// src/cavity.js): each element leaves from where the lip's crest was at its
// launch time, from the mouth's centre then (which an oblique stone drags
// forward as it goes in), at the crest's radius at that azimuth (at least
// RIM_RING_START·R, the contact line's first ejecta) and the crest's height.
// So the sheet stands on the lip, and its base rises and widens with the lip,
// about 0.9 to 1.6·R; once the mouth starts to close, the base stays where
// the crest was widest, on the lip's outer slope, while the hole closes
// inside it. Its base row rides the surface's waves as the lip does (aRide).
// A sheet with no cavity (a landing drop's crown) launches from a ring
// widening from 0.9·R to 1.4·R over T and by 0.2·R per T after it (up to 2·R).
//
// Around the ring u is modulated by 1 + 0.05·Σ a_k·cos(k·theta + phase_k) over
// modes k = 5…9 and k = 12…18 alike for a 3 cm stone, with random a_k in
// [0.5, 1] (stronger low modes turn some crowns into three or four petals).
// Faster elements fly further, so the rim goes wavy (the Rayleigh–Plateau
// instability of the rim) and grows fine scallops; their crests shed
// droplets until the sheet breaks. The fingers' spacing is the
// Rayleigh–Taylor wavelength of the decelerating rim, ∝ sqrt(σ/(ρ·a)), and
// the deceleration a ∝ u/τd goes as 1/R, so the spacing grows as sqrt(R)
// while the rim's length grows as R: a stone s = R / 3 cm times the size has
// sqrt(s) times as many fingers. The mode numbers are stretched by sqrt(s)
// (every whole number in the stretched span, so a 16 cm stone's crown has
// modes 8…15 and 20…29) and the amplitudes divided by the square root of
// how many there are against the 3 cm stone's, so the rim is as wavy at any
// size, in finer fingers on a bigger stone.
// An oblique entry multiplies u by 1 + 0.45·forward (forward = cosine to the
// direction of travel times the horizontal fraction of the entry speed), thins
// the back side to match, and carries every element along at 0.22 of the
// horizontal entry velocity.
//
// Thickness is h0·(r0/r)/(1 + age/td), at least 0.2 mm, with h0 = 1.5 mm and
// the drain time td = 0.04 s for a 3 cm stone: the sheet thins as it spreads
// around a widening circle and as it drains. The free edge (the material
// within ~8% of T of the rim, or of the tear front once it tears) is a bead
// three times the unstretched thickness h0/(1 + age/td), since an edge gathers
// what the stretching takes from the sheet; its normals are bent outward like
// a tube's so it catches the sun all along the edge.
//
// At t_break = clamp(T + 6·R/V, 0.06 s, 0.15 s) for a 3 cm stone the sheet
// tears, from the rim down to the water along a ragged front, over
// 0.6·t_break. The torn part becomes droplets that carry the local (decayed)
// sheet velocity, each holding the volume of the patch of sheet it came from,
// so the drops come out about the size the sheet's thickness implies, between
// CROWN_DROP_FLOOR and CROWN_DROP_CAP (1 and 5.5 mm) for a 3 cm stone; its
// rim sheds drops of RIM_DROP_RADIUS and up. For a 3 cm stone at about 6 m/s
// the sheet stands whole for 60 ms, its rim peaking near 5 cm (9 cm on the
// forward side of an oblique throw), and is gone by about 100 ms.
//
// How a stone's sheet scales with its radius R, against s = R / 3 cm. Lengths
// go with R and speeds with the entry speed V, as in a Froude-scaled splash:
// the launch ring (0.9 to 1.4·R) and the launch window T ∝ R/V. The sheet's
// thickness goes with R too (h0 = 1.5 mm·s), and since the air and the rim's
// surface tension decelerate a sheet in inverse proportion to its thickness,
// so do its drag time τd = 0.05 s·s and its drain time td = 0.04 s·s, both
// floored at SHEET_SCALE_FLOOR times (τd 20 ms). A thick sheet lasts: for
// stones of 3 cm and up the tear's floor and ceiling (60 and 150 ms) scale
// with s as well, so the sheet stands as long against its own drag and drain
// time at any size (smaller stones keep the 60 ms floor, which a 60 Hz frame
// needs). The launch speed does not change with R, so a big stone's rim flies
// nearly ballistic, up to u²/2g, and a small one's is held near u·τd: the rim's
// height grows about as R for small stones and more slowly for big ones. Its
// drops hold the volume of a sheet h0 thick over an area ∝ R² shared among a
// count ∝ s^1.6 (SplashSystem.impact), so their radii, the caps on them
// included, go as s^DROP_SIZE_POWER (s^0.47 by that count). At about 6.3 m/s,
// 42° from vertical, the reference throw, a 1.5 cm stone's rim reaches about
// 4 cm up and its sheet is gone by 96 ms; a 16 cm stone's sheet is 4 mm
// thick, stands for 160 ms with its rim up to 17 cm high and 70 cm across,
// is gone by 256 ms and tears into drops of 2.5 to 9 mm (tools/splash-probe.mjs
// measures these).
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
// updateGeometry() evaluates a ROWS × COLUMNS grid (rim to base × around the
// ring, built by src/fluidMesh.js; the fan's FAN_ROWS × FAN_COLUMNS across
// its sector, not wrapping) once per rendered frame; update() runs every
// simulation substep and sheds from the rim, while the tear, the costly part,
// advances once per rendered frame: whenever a frame's worth of simulated
// time (SplashSystem.frameSeconds) has passed, so the front moves on every
// frame at any time scale. The mesh is drawn by SplashSystem with the
// materials in src/shaders/sheet.js, through the droplets' screen-space fluid
// passes.
import * as THREE from 'three';
import { createRingGrid, computeGridNormals, markChanged } from './fluidMesh.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;     // the stone size the tuning constants were set for
const ROWS = 24;                   // samples along launch time, rim (row 0) to base
const COLUMNS = 96;                // samples around the ring (resolves the k = 18 mode)
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
const DRAIN_SECONDS = 0.04;        // the sheet's thinning time scale, for a 3 cm stone...
const DRAG_SECONDS = 0.05;         // ...and its elements' velocity decays as exp(−age / τd), τd this...
const SHEET_SCALE_FLOOR = 0.4;     // ...both scaling with R / 3 cm, but at least this many times (τd 20 ms)
const SHEET_THICKNESS = 0.0015;    // h0 of a 3 cm stone's sheet, scaling with R
const BREAK_FLOOR = 0.06;          // a stone's sheet stands at least this long (s), so a 60 Hz frame sees it...
const BREAK_CEILING = 0.15;        // ...and at most this, both times R / 3 cm for stones of 3 cm and up
const DROP_SIZE_POWER = 0.5;       // a stone's sheet sheds and tears into drops scaling as (R / 3 cm)^this
const CROWN_DROP_CAP = 0.0055;     // it tears into drops of at most this...
const CROWN_DROP_FLOOR = 0.001;    // ...and at least this (both times (R / 3 cm)^DROP_SIZE_POWER)
const RIM_DROP_RADIUS = 0.0015;    // its rim sheds drops of this...
const RIM_DROP_SPREAD = 0.0025;    // ...to this much more (the same scaling; a landing crown's as (R / 3 cm)^0.4)
const TAIL_THICKNESS = 0.6;        // tail material leaves the ring at this fraction of h0
const MIN_THICKNESS = 0.0002;
const BEAD_END = 0.08;             // the bead is the material of the first 8% of T
const TEAR_SHARE = 0.6;            // the tear takes this fraction of t_break
const BASE_DEPTH = 0.003;          // launch a little below the surface (or the cavity's lip) so the base meets the water
const RIM_RING_START = 0.9;        // on a cavity, the ring is at least this many R until the lip's crest is wider
const MAIN_MODES = [5, 6, 7, 8, 9];
const FINE_MODES = [12, 13, 14, 15, 16, 17, 18];
const MAIN_AMPLITUDE = 0.05;       // deeper turns the scallops into petals
const FINE_AMPLITUDE = 0.05;
const MODES_PER_COLUMN = 1 / 2.5;  // a grid resolves modes up to this many per column
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
   */
  constructor({ impact, startTime, rimDroplets, breakupDroplets, material, landing = false, fan = false, strength = 1, rim = null }) {
    const { velocity, radius } = impact;
    const speed = Math.max(impact.speed, 1.0);
    this.centreX = impact.x;
    this.centreZ = impact.z;
    this.radius = radius;
    this.sizeFactor = radius / REFERENCE_RADIUS;
    // A stone's sheet is as thick as the stone is big, so it slows, drains and
    // lasts in proportion; a landing drop's crown keeps the 3 cm stone's times.
    const sheetScale = landing ? 1 : Math.max(this.sizeFactor, SHEET_SCALE_FLOOR);
    const lastingScale = Math.max(this.sizeFactor, 1);
    this.dragSeconds = DRAG_SECONDS * sheetScale;
    this.drainSeconds = DRAIN_SECONDS * sheetScale;
    // Sets the launch speeds.
    this.entrySpeed = landing ? LANDING_SPEED * speed : fan ? (0.75 + 0.25 * strength) * speed : speed;
    this.tiltShift = landing ? LANDING_TILT : 0;                  // degrees off the launch angle from vertical
    this.startTime = startTime;
    this.age = 0;
    this.finished = false;
    this.landing = landing;
    this.fan = fan;
    this.rim = rim;
    this.lip = { x: 0, z: 0, mouth: 0, width: 0, height: 0, widest: 0, widestWidth: 0 };
    this.rows = landing ? LANDING_ROWS : fan ? FAN_ROWS : ROWS;
    this.columns = landing ? LANDING_COLUMNS : fan ? FAN_COLUMNS : COLUMNS;
    this.mainRows = landing ? LANDING_MAIN_ROWS : fan ? FAN_ROWS : MAIN_ROWS;

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
      this.breakTime = THREE.MathUtils.clamp(this.launchDuration + 6 * radius / speed, BREAK_FLOOR * lastingScale, BREAK_CEILING * lastingScale);
    }
    this.tearDuration = TEAR_SHARE * this.breakTime;
    this.endTime = this.breakTime + this.tearDuration;
    const thickness = SHEET_THICKNESS * (landing ? Math.sqrt(this.sizeFactor) : this.sizeFactor);
    this.baseThickness = Math.max(thickness, MIN_THICKNESS) * (fan ? FAN_THICKNESS * (0.5 + 0.5 * strength) : 1);

    // Modes count around a whole circle, so a sector's columns resolve as many as a ring of their spacing.
    const resolved = (number) => number <= ((Math.PI * 2) / this.columnWidth) * MODES_PER_COLUMN;
    // A stone's rim has sqrt(s) times a 3 cm stone's fingers (the header); a drop's crown keeps its modes.
    const fingerScale = landing ? 1 : Math.sqrt(this.sizeFactor);
    const randomModes = (referenceNumbers, amplitude) => {
      const step = referenceNumbers[1] - referenceNumbers[0];
      const first = Math.max(2, Math.round(referenceNumbers[0] * fingerScale));
      const last = Math.max(first, Math.round(referenceNumbers.at(-1) * fingerScale));
      const numbers = [];
      for (let number = first; number <= last; number += step) numbers.push(number);
      const share = Math.sqrt(referenceNumbers.length / numbers.length);
      return numbers.filter(resolved).map((number) => ({ number, amplitude: amplitude * share * randomRange(0.5, 1), phase: randomRange(0, Math.PI * 2) }));
    };
    this.modes = fan ? randomModes(FAN_MODES, FAN_AMPLITUDE) : [...randomModes(MAIN_MODES, MAIN_AMPLITUDE), ...randomModes(FINE_MODES, FINE_AMPLITUDE)];

    // Per-column constants, and the tear front (a launch time: everything
    // launched before it has torn) with its own pace so the front is ragged.
    this.columnAngle = new Float64Array(this.columns);
    this.columnCos = new Float64Array(this.columns);
    this.columnSin = new Float64Array(this.columns);
    this.columnSpeedFactor = new Float64Array(this.columns);
    this.columnThicknessFactor = new Float64Array(this.columns);
    this.columnTearPace = new Float64Array(this.columns);
    this.tearFront = new Float64Array(this.columns);
    this.tearClock = Infinity;         // simulated time since the tear last advanced: tear at once
    this.tearTarget = new Float64Array(this.columns);
    this.tearSwept = new Float64Array(this.columns);
    const tearPhase = randomRange(0, Math.PI * 2);
    for (let column = 0; column < this.columns; column++) {
      const angle = this.firstAngle + column * this.columnWidth;
      this.columnAngle[column] = angle;
      this.columnCos[column] = Math.cos(angle);
      this.columnSin[column] = Math.sin(angle);
      this.columnSpeedFactor[column] = this.speedFactor(angle);
      this.columnThicknessFactor[column] = this.thicknessFactor(angle);
      const smoothPart = 0.5 + 0.5 * Math.sin(3 * angle + tearPhase);
      this.columnTearPace[column] = 1 + 0.5 * smoothPart + 0.5 * Math.random();
    }

    // Crests of the modulation shed the rim droplets, the strongest most often
    // (and on the fan, those nearest straight ahead, where the sheet is thickest).
    this.crests = [];
    const samples = 360;
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
    this.rowTaus = new Float64Array(vertexCount);   // launch time behind the free edge
    this.mesh = createRingGrid(this.rows, this.columns, {
      position: [this.positions, 3],
      normal: [this.normals, 3],
      aRimTangent: [this.rimTangents, 3],
      aThickness: [this.thicknesses, 1],
      aRide: [this.rideFlags(vertexCount, landing), 1],   // 1: lifted by the wave height under it
    }, material, { wrap: this.wrap });
    this.dropScale = landing ? 1 : this.sizeFactor ** DROP_SIZE_POWER;
    this.maxDropRadius = landing ? LANDING_DROP_CAP * radius : (fan ? FAN_DROP_CAP : CROWN_DROP_CAP) * this.dropScale;
    this.minDropRadius = fan ? FAN_DROP_FLOOR * this.dropScale : Math.min(CROWN_DROP_FLOOR * this.dropScale, 0.5 * this.maxDropRadius);
    this.geometry = this.mesh.geometry;
    this.state = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, thickness: 0, radialDistance: 0 };
    this.stateOther = { ...this.state };
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

  /** Across the fan's sector: 1 straight ahead, falling to 0 at its edges. */
  fanShape(angle) {
    const offset = Math.abs(Math.atan2(Math.sin(angle - this.heading), Math.cos(angle - this.heading)));
    return Math.cos(Math.min(offset / FAN_HALF_ANGLE, 1) * Math.PI * 0.5);
  }

  speedFactor(angle) {
    if (this.fan) return this.modulation(angle) * (FAN_EDGE_SPEED + (1 - FAN_EDGE_SPEED) * this.fanShape(angle));
    return this.modulation(angle) * (1 + 0.45 * this.forward(angle));
  }

  thicknessFactor(angle) {
    if (this.fan) return Math.sqrt(this.fanShape(angle));
    return 1 - 0.45 * Math.max(-this.forward(angle), 0);
  }

  /** End of the launched material: the base of the sheet (the fan has no tail). */
  feedEnd() { return Math.min(this.age, this.fan ? this.launchDuration : this.endTime); }

  /**
   * State of the element launched at time tau from the azimuth with the given
   * cosine and sine, at the crown's current age: position, velocity and sheet
   * thickness. edgeTau is the launch time at the sheet's free edge there (0
   * for the rim, the tear front once it tears): the bead runs along it.
   */
  evaluate(tau, cosAngle, sinAngle, speedFactor, thicknessFactor, out, edgeTau = 0) {
    const progress = tau / this.launchDuration;
    const main = Math.min(progress, 1);
    let tail, ringRadius, launchSpeed, tilt;
    if (this.fan) {
      tail = 0;
      ringRadius = this.radius * (FAN_RING_START + (FAN_RING_END - FAN_RING_START) * main);
      launchSpeed = this.entrySpeed * (FAN_SPEED_START + (FAN_SPEED_END - FAN_SPEED_START) * main) * speedFactor;
      tilt = THREE.MathUtils.degToRad(FAN_TILT_START + (FAN_TILT_END - FAN_TILT_START) * main);
    } else {
      tail = Math.max(progress - 1, 0);
      ringRadius = this.radius * Math.min(0.9 + 0.5 * main + 0.2 * tail, 2.0);
      launchSpeed = this.entrySpeed * (tail > 0 ? 0.2 * Math.exp(-tail / TAIL_DECAY) : 0.55 - 0.35 * main) * speedFactor;
      tilt = THREE.MathUtils.degToRad(55 - 30 * main - this.tiltShift);
    }
    // On a cavity the material leaves from its lip's crest, where the lip was
    // then (centre, radius at this azimuth, height), once the crest is wider
    // than the ring above starts; once the hole closes it stays where the
    // crest was widest, on the lip's outer slope.
    let centreX = this.centreX, centreZ = this.centreZ, baseHeight = -BASE_DEPTH;
    if (this.rim) {
      const lip = this.rim.lipAt(tau, this.lip);
      const shape = this.rim.shape(cosAngle, sinAngle);
      const crest = lip.mouth * shape + lip.width;
      const held = lip.widest * shape + lip.widestWidth;
      centreX = lip.x;
      centreZ = lip.z;
      ringRadius = Math.max(held, (this.fan ? FAN_RING_START : RIM_RING_START) * this.radius);
      baseHeight += this.rim.lipHeightBeyond(lip, ringRadius - crest);
    }
    const radialSpeed = launchSpeed * Math.sin(tilt);
    const upSpeed = launchSpeed * Math.cos(tilt);
    const age = Math.max(this.age - tau, 0);
    // Drag: velocity v0·exp(−age/τd), so the distance flown is v0·τd·(1 − exp(−age/τd)).
    const decay = Math.exp(-age / this.dragSeconds);
    const flight = this.dragSeconds * (1 - decay);
    const radialDistance = ringRadius + radialSpeed * flight;
    out.x = centreX + cosAngle * radialDistance + this.driftX * flight;
    out.y = baseHeight + upSpeed * flight - 0.5 * GRAVITY * age * age;
    out.z = centreZ + sinAngle * radialDistance + this.driftZ * flight;
    out.vx = (cosAngle * radialSpeed + this.driftX) * decay;
    out.vy = upSpeed * decay - GRAVITY * age;
    out.vz = (sinAngle * radialSpeed + this.driftZ) * decay;
    out.radialDistance = radialDistance;
    // The bead gathers what stretching takes from the sheet, so it keeps three
    // times the unstretched thickness while the sheet behind it thins. The
    // tail leaves the ring thinner, so the foot stays light.
    const launchThickness = 1 - (1 - TAIL_THICKNESS) * smoothstep(0, 0.5, tail);
    const drained = this.baseThickness * thicknessFactor * launchThickness / (1 + age / this.drainSeconds);
    // The fan thins to nothing at its edges.
    const sheetThickness = Math.max(drained * ringRadius / radialDistance, this.fan ? MIN_THICKNESS * thicknessFactor : MIN_THICKNESS);
    const bead = 1 - smoothstep(0.6 * BEAD_END, 1.3 * BEAD_END, (tau - edgeTau) / this.launchDuration);
    out.thickness = sheetThickness + bead * Math.max(3 * drained - sheetThickness, 0);
    return out;
  }

  evaluateAt(tau, angle, out) {
    return this.evaluate(tau, Math.cos(angle), Math.sin(angle), this.speedFactor(angle), this.thicknessFactor(angle), out);
  }

  /** Launch time of a row: rows crowd towards the rim, and the tail gets its own few. */
  rowTau(row, front, end) {
    const split = this.launchDuration;
    if (front < split && end > split) {
      if (row < this.mainRows) return front + (split - front) * (row / this.mainRows) ** ROW_POWER;
      return split + (end - split) * (row - this.mainRows) / (this.rows - 1 - this.mainRows);
    }
    return front + (end - front) * (row / (this.rows - 1)) ** ROW_POWER;
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
    if (this.age < this.breakTime) {
      this.shed(dt, splash);
    } else {
      // The tear is the costly part, so it advances once per rendered frame.
      this.tearClock += dt;
      if (this.tearClock >= splash.frameSeconds * (1 - 1e-6) || this.age >= this.endTime) {
        this.tearClock = 0;
        this.tear(splash, Math.min((this.age - this.breakTime) / this.tearDuration, 1));
      }
    }
    if (this.age >= this.endTime) this.finished = true;
  }

  /** Tear whatever is left into droplets now (when too many crowns are alive). */
  finishNow(splash) {
    this.tear(splash, 1);
    this.finished = true;
  }

  shed(dt, splash) {
    // The instability grows with time, so the shedding rate ramps up linearly;
    // over the sheet's life each crest sheds its share.
    const rate = (2 * this.age) / (this.breakTime * this.breakTime);
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
    const from = this.evaluate(tauFrom, cosAngle, sinAngle, speedFactor, thicknessFactor, this.state);
    const fromX = from.x, fromY = from.y, fromZ = from.z, fromRadius = from.radialDistance;
    const to = this.evaluate(tauTo, cosAngle, sinAngle, speedFactor, thicknessFactor, this.stateOther);
    const length = Math.sqrt((to.x - fromX) ** 2 + (to.y - fromY) ** 2 + (to.z - fromZ) ** 2);
    return length * 0.5 * (fromRadius + to.radialDistance) * this.columnWidth;
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
    const halfWidth = 0.5 * this.columnWidth;
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

  /** Evaluate the grid at the given splash time and upload it. */
  updateGeometry(time) {
    this.age = time - this.startTime;
    const end = this.feedEnd();
    const state = this.state;
    for (let column = 0; column < this.columns; column++) {
      const cosAngle = this.columnCos[column];
      const sinAngle = this.columnSin[column];
      const speedFactor = this.columnSpeedFactor[column];
      const thicknessFactor = this.columnThicknessFactor[column];
      const front = Math.min(this.tearFront[column], end);
      for (let row = 0; row < this.rows; row++) {
        const vertex = row * this.columns + column;
        const tau = this.rowTau(row, front, end);
        this.evaluate(tau, cosAngle, sinAngle, speedFactor, thicknessFactor, state, front);
        this.positions[vertex * 3] = state.x;
        this.positions[vertex * 3 + 1] = state.y;
        this.positions[vertex * 3 + 2] = state.z;
        this.thicknesses[vertex] = state.thickness;
        this.rowTaus[vertex] = tau - front;
      }
    }

    // Normals from the grid; near the rim the bead's normal also leans along
    // the sheet towards the edge, as a tube's does.
    const positions = this.positions;
    computeGridNormals(positions, this.normals, this.rows, this.columns, this.wrap);
    for (let column = 0; column < this.columns; column++) {
      for (let row = 0; row < this.rows; row++) {
        const vertex = row * this.columns + column;
        const before = Math.max(row - 1, 0) * this.columns + column;
        const after = Math.min(row + 1, this.rows - 1) * this.columns + column;
        const alongX = positions[after * 3] - positions[before * 3];
        const alongY = positions[after * 3 + 1] - positions[before * 3 + 1];
        const alongZ = positions[after * 3 + 2] - positions[before * 3 + 2];
        const alongLength = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
        const bend = alongLength > 1e-9 ? 1.4 * (1 - smoothstep(0, BEAD_END, this.rowTaus[vertex] / this.launchDuration)) / alongLength : 0;
        this.rimTangents[vertex * 3] = -alongX * bend;
        this.rimTangents[vertex * 3 + 1] = -alongY * bend;
        this.rimTangents[vertex * 3 + 2] = -alongZ * bend;
      }
    }
    markChanged(this.geometry, ['position', 'normal', 'aRimTangent', 'aThickness']);
  }

  dispose() {
    this.geometry.dispose();
  }
}
