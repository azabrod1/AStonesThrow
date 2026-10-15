// The crown: the thin sheet of water a stone throws up as it enters.
//
// The sheet is material launched continuously from a ring around the stone,
// each ring element then flying on its own. Surface tension and air slow a
// real sheet's rim fast (which is why crowns never reach the height their
// launch speed implies), modelled as a velocity decaying as exp(−age/τd) with
// τd = 0.05 s while gravity acts undamped. So the whole sheet is a closed form
// in launch time tau, azimuth theta and the crown's age t; with a = t − tau,
//
//   position = launch point + u·direction·τd·(1 − exp(−a/τd)) − ½·g·a²·up
//
// With stone radius R and entry speed V the main launch lasts
// T = max(1.2·R/V, 0.01) s. Over it the ring widens from 0.9·R to 1.4·R, the
// launch speed u falls from 0.55·V to 0.2·V and its angle from vertical from
// 55° to 25°: the first material makes the flared rim and later material the
// steeper wall under it. After T a tail keeps feeding the wall at
// 0.2·V·exp(−(tau − T)/(0.45·T)) from a ring still widening by 0.2·R per T (up
// to 2·R), so the base stays on the water while the sheet lives. The tail
// leaves the ring at 0.6·h0, so the foot stays light.
//
// Around the ring u is modulated by 1 + 0.08·Σ a_k·cos(k·theta + phase_k) over
// modes k = 5…9, plus k = 12…18 at half the amplitude, with random a_k in
// [0.5, 1]. Faster elements fly further, so the rim goes wavy (the
// Rayleigh–Plateau instability of the rim) and grows scallops; their crests
// shed droplets until the sheet breaks. An oblique entry multiplies u by
// 1 + 0.45·forward (forward = cosine to the direction of travel times the
// horizontal fraction of the entry speed), thins the back side to match, and
// carries every element along at 0.22 of the horizontal entry velocity.
//
// Thickness is h0·(r0/r)/(1 + age/0.04 s), at least 0.2 mm, with
// h0 = 1.5 mm·sqrt(R / 3 cm): the sheet thins as it spreads around a widening
// circle and as it drains. The free edge (the material within ~8% of T of the
// rim, or of the tear front once it tears) is a bead three times the
// unstretched thickness h0/(1 + age/0.04 s), since an edge gathers what the
// stretching takes from the sheet; its normals are bent outward like a tube's
// so it catches the sun all along the edge.
//
// At t_break = clamp(T + 6·R/V, 0.06, 0.15) s the sheet tears, from the rim
// down to the water along a ragged front, over 0.6·t_break. The torn part
// becomes droplets that carry the local (decayed) sheet velocity, each holding
// the volume of the patch of sheet it came from, so the drops come out about
// the size the sheet's thickness implies. For a 3 cm stone at about 6 m/s the
// sheet stands whole for 60 ms, its rim peaking near 5 cm (9 cm on the forward
// side of an oblique throw), and is gone by about 100 ms.
//
// updateGeometry() evaluates a ROWS × COLUMNS grid (rim to base × around the
// ring, built by src/fluidMesh.js) once per rendered frame; update() runs every
// simulation substep and sheds from the rim, while the tear, the costly part,
// advances at most every TEAR_INTERVAL of simulated time. The mesh is drawn by
// SplashSystem with the materials in src/shaders/sheet.js, through the
// droplets' screen-space fluid passes.
import * as THREE from 'three';
import { createRingGrid, computeGridNormals, markChanged } from './fluidMesh.js';

const GRAVITY = 9.81;
const REFERENCE_RADIUS = 0.03;     // the stone size the tuning constants were set for
const ROWS = 24;                   // samples along launch time, rim (row 0) to base
const COLUMNS = 96;                // samples around the ring (resolves the k = 18 mode)
const MAIN_ROWS = 17;              // rows given to the main launch once the tail exists
const ROW_POWER = 1.8;             // crowds main-launch rows towards the rim bead
const MAIN_SHARE = 0.7;            // fraction of the tear front's travel spent on the main launch
const TAIL_DECAY = 0.45;           // tail launch speed decays over this many T
const DRAIN_SECONDS = 0.04;        // the sheet's thinning time scale
const DRAG_SECONDS = 0.05;         // elements' velocity decays as exp(−age / DRAG_SECONDS)
const TAIL_THICKNESS = 0.6;        // tail material leaves the ring at this fraction of h0
const TEAR_INTERVAL = 1 / 90;      // the tear advances at most this often (simulated seconds)
const MIN_THICKNESS = 0.0002;
const BEAD_END = 0.08;             // the bead is the material of the first 8% of T
const TEAR_SHARE = 0.6;            // the tear takes this fraction of t_break
const BASE_DEPTH = 0.003;          // launch a little below the surface so the base meets the water
const MAIN_MODES = [5, 6, 7, 8, 9];
const FINE_MODES = [12, 13, 14, 15, 16, 17, 18];
const MAIN_AMPLITUDE = 0.08;       // deeper turns the scallops into petals
const FINE_AMPLITUDE = 0.04;

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
   */
  constructor({ impact, startTime, rimDroplets, breakupDroplets, material }) {
    const { velocity, radius } = impact;
    const speed = Math.max(impact.speed, 1.0);
    this.centreX = impact.x;
    this.centreZ = impact.z;
    this.radius = radius;
    this.sizeFactor = radius / REFERENCE_RADIUS;
    this.entrySpeed = speed;
    this.startTime = startTime;
    this.age = 0;
    this.finished = false;

    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const horizontalFraction = Math.min(horizontalSpeed / speed, 1);
    this.forwardX = horizontalSpeed > 1e-4 ? (velocity.x / horizontalSpeed) * horizontalFraction : 0;
    this.forwardZ = horizontalSpeed > 1e-4 ? (velocity.z / horizontalSpeed) * horizontalFraction : 0;
    this.driftX = 0.22 * velocity.x;
    this.driftZ = 0.22 * velocity.z;

    this.launchDuration = Math.max(1.2 * radius / speed, 0.01);
    this.breakTime = THREE.MathUtils.clamp(this.launchDuration + 6 * radius / speed, 0.06, 0.15);
    this.tearDuration = TEAR_SHARE * this.breakTime;
    this.endTime = this.breakTime + this.tearDuration;
    this.baseThickness = Math.max(0.0015 * Math.sqrt(this.sizeFactor), MIN_THICKNESS);

    this.modes = [
      ...MAIN_MODES.map((number) => ({ number, amplitude: MAIN_AMPLITUDE * randomRange(0.5, 1), phase: randomRange(0, Math.PI * 2) })),
      ...FINE_MODES.map((number) => ({ number, amplitude: FINE_AMPLITUDE * randomRange(0.5, 1), phase: randomRange(0, Math.PI * 2) })),
    ];

    // Per-column constants, and the tear front (a launch time: everything
    // launched before it has torn) with its own pace so the front is ragged.
    this.columnAngle = new Float64Array(COLUMNS);
    this.columnCos = new Float64Array(COLUMNS);
    this.columnSin = new Float64Array(COLUMNS);
    this.columnSpeedFactor = new Float64Array(COLUMNS);
    this.columnThicknessFactor = new Float64Array(COLUMNS);
    this.columnTearPace = new Float64Array(COLUMNS);
    this.tearFront = new Float64Array(COLUMNS);
    this.tearClock = TEAR_INTERVAL;    // simulated time since the tear last advanced
    this.tearTarget = new Float64Array(COLUMNS);
    this.tearSwept = new Float64Array(COLUMNS);
    const tearPhase = randomRange(0, Math.PI * 2);
    for (let column = 0; column < COLUMNS; column++) {
      const angle = (column / COLUMNS) * Math.PI * 2;
      this.columnAngle[column] = angle;
      this.columnCos[column] = Math.cos(angle);
      this.columnSin[column] = Math.sin(angle);
      this.columnSpeedFactor[column] = this.speedFactor(angle);
      this.columnThicknessFactor[column] = this.thicknessFactor(angle);
      const smoothPart = 0.5 + 0.5 * Math.sin(3 * angle + tearPhase);
      this.columnTearPace[column] = 1 + 0.5 * smoothPart + 0.5 * Math.random();
    }

    // Crests of the modulation shed the rim droplets, the strongest most often.
    this.crests = [];
    const samples = 360;
    const modulation = new Float64Array(samples);
    for (let index = 0; index < samples; index++) modulation[index] = this.modulation((index / samples) * Math.PI * 2);
    for (let index = 0; index < samples; index++) {
      const value = modulation[index];
      const before = modulation[(index + samples - 1) % samples];
      const after = modulation[(index + 1) % samples];
      if (value > before && value >= after && value > 1.02) this.crests.push({ angle: (index / samples) * Math.PI * 2, weight: value - 1, carry: 0 });
    }
    const totalWeight = this.crests.reduce((sum, crest) => sum + crest.weight, 0) || 1;
    for (const crest of this.crests) crest.share = (crest.weight / totalWeight) * rimDroplets;
    this.breakupRemaining = breakupDroplets;   // still to come from the tear
    this.tearCarry = 0;                        // fraction of a droplet owed
    this.pieceAreas = new Float64Array(ROWS);

    // The grid mesh.
    const vertexCount = ROWS * COLUMNS;
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.rimTangents = new Float32Array(vertexCount * 3);
    this.thicknesses = new Float32Array(vertexCount);
    this.rowTaus = new Float64Array(vertexCount);   // launch time behind the free edge
    this.mesh = createRingGrid(ROWS, COLUMNS, {
      position: [this.positions, 3],
      normal: [this.normals, 3],
      aRimTangent: [this.rimTangents, 3],
      aThickness: [this.thicknesses, 1],
    }, material);
    this.geometry = this.mesh.geometry;
    this.state = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, thickness: 0, radialDistance: 0 };
    this.stateOther = { ...this.state };
  }

  // ---- the model --------------------------------------------------------

  modulation(angle) {
    let sum = 0;
    for (const mode of this.modes) sum += mode.amplitude * Math.cos(mode.number * angle + mode.phase);
    return 1 + sum;
  }

  forward(angle) { return Math.cos(angle) * this.forwardX + Math.sin(angle) * this.forwardZ; }

  speedFactor(angle) { return this.modulation(angle) * (1 + 0.45 * this.forward(angle)); }

  thicknessFactor(angle) { return 1 - 0.45 * Math.max(-this.forward(angle), 0); }

  /** End of the launched material: the base of the sheet. */
  feedEnd() { return Math.min(this.age, this.endTime); }

  /**
   * State of the element launched at time tau from the azimuth with the given
   * cosine and sine, at the crown's current age: position, velocity and sheet
   * thickness. edgeTau is the launch time at the sheet's free edge there (0
   * for the rim, the tear front once it tears): the bead runs along it.
   */
  evaluate(tau, cosAngle, sinAngle, speedFactor, thicknessFactor, out, edgeTau = 0) {
    const progress = tau / this.launchDuration;
    const main = Math.min(progress, 1);
    const tail = Math.max(progress - 1, 0);
    const ringRadius = this.radius * Math.min(0.9 + 0.5 * main + 0.2 * tail, 2.0);
    const launchSpeed = this.entrySpeed * (tail > 0 ? 0.2 * Math.exp(-tail / TAIL_DECAY) : 0.55 - 0.35 * main) * speedFactor;
    const tilt = THREE.MathUtils.degToRad(55 - 30 * main);
    const radialSpeed = launchSpeed * Math.sin(tilt);
    const upSpeed = launchSpeed * Math.cos(tilt);
    const age = Math.max(this.age - tau, 0);
    // Drag: velocity v0·exp(−age/τd), so the distance flown is v0·τd·(1 − exp(−age/τd)).
    const decay = Math.exp(-age / DRAG_SECONDS);
    const flight = DRAG_SECONDS * (1 - decay);
    const radialDistance = ringRadius + radialSpeed * flight;
    out.x = this.centreX + cosAngle * radialDistance + this.driftX * flight;
    out.y = -BASE_DEPTH + upSpeed * flight - 0.5 * GRAVITY * age * age;
    out.z = this.centreZ + sinAngle * radialDistance + this.driftZ * flight;
    out.vx = (cosAngle * radialSpeed + this.driftX) * decay;
    out.vy = upSpeed * decay - GRAVITY * age;
    out.vz = (sinAngle * radialSpeed + this.driftZ) * decay;
    out.radialDistance = radialDistance;
    // The bead gathers what stretching takes from the sheet, so it keeps three
    // times the unstretched thickness while the sheet behind it thins. The
    // tail leaves the ring thinner, so the foot stays light.
    const launchThickness = 1 - (1 - TAIL_THICKNESS) * smoothstep(0, 0.5, tail);
    const drained = this.baseThickness * thicknessFactor * launchThickness / (1 + age / DRAIN_SECONDS);
    const sheetThickness = Math.max(drained * ringRadius / radialDistance, MIN_THICKNESS);
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
      if (row < MAIN_ROWS) return front + (split - front) * (row / MAIN_ROWS) ** ROW_POWER;
      return split + (end - split) * (row - MAIN_ROWS) / (ROWS - 1 - MAIN_ROWS);
    }
    return front + (end - front) * (row / (ROWS - 1)) ** ROW_POWER;
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
      // The tear is the costly part, so it advances at most every TEAR_INTERVAL.
      this.tearClock += dt;
      if (this.tearClock >= TEAR_INTERVAL || this.age >= this.endTime) {
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
          (0.001 + 0.002 * Math.random() ** 1.5) * this.sizeFactor ** 0.4,
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
    for (let column = 0; column < COLUMNS; column++) {
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
    for (let column = 0; column < COLUMNS; column++) {
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
    return length * 0.5 * (fromRadius + to.radialDistance) * (Math.PI * 2 / COLUMNS);
  }

  /**
   * Turn the strip of one column between two launch times into the given
   * number of droplets (fractions carry over), spread over it by area.
   */
  spawnFromStrip(column, tauFrom, tauTo, end, droplets, density, splash) {
    const pieces = Math.min(Math.max(1, Math.ceil(((tauTo - tauFrom) / Math.max(end, 1e-6)) * ROWS)), ROWS);
    const pieceAreas = this.pieceAreas;
    let totalArea = 0;
    for (let piece = 0; piece < pieces; piece++) {
      pieceAreas[piece] = this.stripArea(column, tauFrom + ((tauTo - tauFrom) * piece) / pieces, tauFrom + ((tauTo - tauFrom) * (piece + 1)) / pieces);
      totalArea += pieceAreas[piece];
    }
    if (totalArea <= 0) return;
    const halfWidth = Math.PI / COLUMNS;
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
        const radius = THREE.MathUtils.clamp(volumeRadius * randomRange(0.7, 1.25), 0.0006, 0.0045 * this.sizeFactor ** 0.4);
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
    for (let column = 0; column < COLUMNS; column++) {
      const cosAngle = this.columnCos[column];
      const sinAngle = this.columnSin[column];
      const speedFactor = this.columnSpeedFactor[column];
      const thicknessFactor = this.columnThicknessFactor[column];
      const front = Math.min(this.tearFront[column], end);
      for (let row = 0; row < ROWS; row++) {
        const vertex = row * COLUMNS + column;
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
    computeGridNormals(positions, this.normals, ROWS, COLUMNS);
    for (let column = 0; column < COLUMNS; column++) {
      for (let row = 0; row < ROWS; row++) {
        const vertex = row * COLUMNS + column;
        const before = Math.max(row - 1, 0) * COLUMNS + column;
        const after = Math.min(row + 1, ROWS - 1) * COLUMNS + column;
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
