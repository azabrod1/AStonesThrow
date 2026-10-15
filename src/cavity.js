// The cavity: the air-filled hole a stone opens in the water, a closed form in
// depth and time, and the mesh that draws it as a hole in the surface.
//
// The stone. Under water src/rock.js slows the stone by quadratic drag
// (deceleration STONE_DRAG·v²/R) and sinks it under buoyancy-reduced gravity;
// the cavity integrates the same model once, at the impact, from where the
// impact found the stone and with the simulation's substep, as the stone is
// integrated, into a table of its path: depth, place and speed every substep.
// So the hole follows the stone's actual depth and speed.
//
// The walls (the Rayleigh–Besant picture: Duclaux et al. 2007, Aristoff &
// Bush 2009, Truscott et al. 2014). Each horizontal slice of water at depth z
// is pushed outward when the stone's centre passes it, at t_s(z); it opens,
// stops and closes again under the hydrostatic pressure ρ·g·z. A slice
// thrown out at speed u and decelerated by a pressure growing with depth has
// a² = R² + 2·R·u·τ − (g·z/L)·τ² (τ = t − t_s(z)), the square-root closing that
// makes a cavity neck; written with its lifetime T and s = τ/T,
//
//   a(z, t) = R·sqrt((1 − s)·(1 + (1 + B)·s)),   0 ≤ s ≤ 1,
//
// R at s = 0 (the stone's equator), 0 at s = 1. B sets the widest radius,
// a_max = R·(2 + B)/(2·sqrt(1 + B)), reached at s = B/(2·(1 + B)); it is chosen
// so that a_max(z) = R·(1 + WIDEN·(1 − z/z_p)), widest near the surface and
// R·(1 + DEEP_WIDEN) at the pinch depth z_p and below. The lifetime follows the
// slice's push and the pressure: T ∝ V(z)/(z + SURFACE_HEAD·R), V(z) the stone's
// speed there, so a slice closes at t_c(z) = t_s(z) + C·V(z)/(z + z0). Shallow
// slices live longest, deep ones were opened late, so the earliest closure,
// the pinch-off (deep seal), is in between: C is set so that it comes
// PINCH_TIME·sqrt(R/g) after entry (Duclaux et al.: about 2.1, nearly
// independent of the entry speed), and where it falls follows from the
// stone's path: a half to two thirds of the stone's depth at that moment (a
// sphere at constant speed pinches at half; a stone slowing down, nearer
// itself). A stone come to rest on the floor pushes no water aside, so the
// speed a slice is pushed with is at least SLOWEST_PUSH of the entry speed.
// Above the pinch the cavity then collapses inward from the
// neck up (the closures above z_p are compressed in time so that the surface
// closes CLOSE_TIME·sqrt(R/g) after the pinch, at the closure time), and the
// surface closes to a mound from which the Worthington jet rises (the splash
// starts the jet there, at the mouth's centre). Below the pinch the bubble
// that rides down with the stone is no longer drawn.
//
// An oblique entry: every slice is centred where the stone's centre was when
// it passed, so the hole is sheared along the stone's path, and is elongated
// along the direction of travel by ELONGATION times the horizontal fraction
// of the entry speed. As the upper cavity collapses its axis turns towards
// the jet's (`lean`, the jet's lean back along the path, see JET_LEAN in
// src/splash.js), so the jet comes up the axis of the funnel it closes from.
//
// The rim. Around the mouth (the slice at the surface; before the stone's
// centre reaches the water, the contact line of a sphere sinking to its
// equator) the water stands in a lip LIP_HEIGHT times the mouth radius high
// and LIP_WIDTH times it wide, falling over LIP_FALL·R outside, which rises,
// widens and falls back with the mouth. Its crest is where the crown sheet and
// the forward fan launch (lipAt, read by src/crown.js), so they stand on it
// and follow it. For a 3 cm stone thrown in at 6.3 m/s, 42° from vertical
// (Froude number V²/(g·R) 136), its centre reaches the water at 9 ms; the
// mouth is widest, 1.45·R, at 64 ms, the lip 0.17·R high; the hole pinches
// off at 116 ms 6.2·R down, the stone then 10·R down, and the surface closes
// at 138 ms. A 4 cm stone's (radius 2 cm) pinches at 95 ms 7.5·R down and
// closes at 113 ms; a 16 cm stone's at 190 ms 4.2·R down (the stone, slowed
// harder, 7.4·R down) and 226 ms (tools/cavity-probe.mjs prints these).
//
// The mesh: a ring grid (src/fluidMesh.js) of COLUMNS around and, from the
// axis outward, CAP_ROWS of a flat floor at the bottom (the stone's centre,
// which sits on it and shows through it, or the closing point once it has
// pinched), WALL_ROWS up the wall (TOP_SHARE of them in the top TOP_SPAN·R,
// the part the camera sees), then the lip's inner face, its outer fall and a
// flat apron out to where the surface takes over. It is built in world
// coordinates once per rendered frame (updateGeometry) and drawn in the main
// scene with the water shader's CAVITY_MESH variant (src/shaders/scene.js,
// built in src/waterSurface.js), so it is shaded as the same water. aCavity
// carries per vertex how far it rides the surface (1 on the lip, which sits
// on the splash's height field and the wind's waves like the surface it
// joins; 0 down the wall below RIDE_DEPTH·R), how open to the sky it is
// (1 / (1 + (depth / (OCCLUSION_DEPTH·mouth))²): the occlusion that darkens
// the hole towards its bottom) and how steeply a ray must climb to leave
// through the mouth (half the depth over the mouth's radius; on the lip's
// inner face, any upward ray, while a downward one meets the hole).
//
// The surface patch must not show through the hole: pushShape() gives the
// water shader a circle around the mouth and a shift. Every vertex of the
// patch inside the circle moves down by the shift, to WELL_CLEARANCE·R below
// the hole's floor, and along the hole's axis as it goes (the line from the
// mouth's centre to the floor's), keeping its place across the circle. The
// patch then dips under the lip in a sheared well, and the circle is wide
// enough (the widest ring of the wall at its depth around that line, plus
// PUSH_MARGIN of the water's cells, more than the diagonal of one) that the
// well holds the whole cavity, so it hides behind the walls; the lip's apron
// reaches COVER_MARGIN cells past the circle to cover where it dips. The hole
// is drawn no deeper than DRAWN_DEPTH·R: the camera looks in at 15 to 25°
// from the horizon and sees no more than one or two radii down, and the
// floor drawn there shows what is below it (the stone) through it, as the
// floor at the stone does.
import { createRingGrid, computeGridNormals, markChanged } from './fluidMesh.js';

const GRAVITY = 9.81;
// The stone under water, as src/rock.js moves it (tools/cavity-probe.mjs checks the two agree).
const WATER_DENSITY = 1000;
const ROCK_DENSITY = 2600;
const STONE_DRAG = (3 / 8) * (WATER_DENSITY / ROCK_DENSITY) * 0.5;   // the drag deceleration is this·v²/R
const SINKING_GRAVITY = GRAVITY * (1 - WATER_DENSITY / ROCK_DENSITY);
const RESTING_HEIGHT = 0.75;       // the stone rests with its centre this many radii above the floor
const ENTRY_HEIGHT = 0.7;          // the stone's centre at first contact, in radii above the water, when the impact does not say
const PATH_STEP = 1 / 240;         // s: the app's substep at 60 frames a second, when the impact does not give one
const PATH_SECONDS = 1.5;
// The walls.
const SLICE_STEP = 1 / 6;          // slices this many radii apart
const PINCH_TIME = 2.1;            // the deep seal, in sqrt(R/g) after entry...
const CLOSE_TIME = 0.4;            // ...and the surface closes this many sqrt(R/g) later
const SURFACE_HEAD = 0.5;          // z0, in R: the pressure head that closes the slices at the surface
const SLOWEST_PUSH = 0.2;          // a slice is pushed open at least as hard as by this share of the entry speed
const WIDEN = 0.45;                // a slice at the surface opens to R·(1 + WIDEN)...
const DEEP_WIDEN = 0.05;           // ...one at the pinch depth or below to R·(1 + DEEP_WIDEN)
const ELONGATION = 0.35;           // an oblique hole is this much longer along the throw, times the horizontal fraction
// The rim.
const LIP_HEIGHT = 0.12;           // in mouth radii...
const LIP_SETTLE = 0.6;            // ...settling by this fraction from when the mouth is widest (1·sqrt(R/g)) to the pinch
const LIP_WIDTH = 0.1;             // in mouth radii: from the mouth to the crest
const LIP_FALL = 1.0;              // in R: from the crest down to the surface
const RIDE_DEPTH = 0.4;            // in R: the wall stops riding the surface's waves this far down
// The mesh.
const COLUMNS = 64;
const CAP_ROWS = 3;
const WALL_ROWS = 22;
const LIP_INNER_ROWS = 5;
const LIP_FALL_ROWS = 6;
const LIP_APRON_ROWS = 3;
const ROWS = CAP_ROWS + WALL_ROWS + LIP_INNER_ROWS + LIP_FALL_ROWS + LIP_APRON_ROWS;
const TOP_SPAN = 2.5;              // in R: the top of the wall, which the camera sees...
const TOP_SHARE = 0.6;             // ...gets this share of the wall's rows
const TOP_POWER = 1.3;             // crowded towards the surface
const DARKEST_MOUTH = 0.15;        // in R: the narrowest mouth the occlusion and escape take
const FACING_HOLE = 0.002;         // the least climb to escape the wall and the lip's inner face hand the shader (any ray going up)
const OCCLUSION_DEPTH = 0.5;       // in mouth radii: the depth at which the hole sees half the sky it sees at its mouth
// Hiding the surface patch.
const PUSH_MARGIN = 2;             // water cells beyond the hole that the patch dips from
const COVER_MARGIN = 2.5;          // water cells beyond that which the lip's apron covers
const WELL_CLEARANCE = 0.2;        // in R: the patch dips this far below the hole's floor
const DRAWN_DEPTH = 4;             // in R: the hole is drawn no deeper

const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

/** The growth B that makes a slice open to a_max (in R): a_max² = (2 + B)² / (4·(1 + B)). */
function growthFor(widest) {
  const excess = Math.max(widest * widest - 1, 0);
  return 2 * excess + 2 * Math.sqrt(excess * excess + excess);
}

export class Cavity {
  /**
   * @param impact {x, z, height, speed, velocity, radius} from Rock.update (height: of the stone's centre)
   * @param startTime splash time of the impact
   * @param material the mesh's material (the water shader's CAVITY_MESH variant), or null for none
   * @param cell the water grid's cell size (m): the surface patch dips under the lip by whole cells
   * @param floorDepth the pond's depth (m), where the stone comes to rest
   * @param lean the jet's lean back along the path (radians): the collapsing funnel turns to it
   * @param drawn false when the impact is outside the simulated patch: the hole is not drawn
   * @param step the simulation's substep (s), which the stone is integrated with
   */
  constructor({ impact, startTime, material = null, cell = 6 / 512, floorDepth = 0.8, lean = 0, drawn = true, step = PATH_STEP }) {
    const { velocity, radius } = impact;
    this.radius = radius;
    this.startTime = startTime;
    this.age = 0;
    this.cell = cell;
    this.drawn = drawn;
    this.finished = false;
    this.timeUnit = Math.sqrt(radius / GRAVITY);
    this.pinchTime = PINCH_TIME * this.timeUnit;
    const speed = Math.max(impact.speed, 1.0);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const horizontalFraction = Math.min(horizontalSpeed / speed, 1);
    this.headingX = horizontalSpeed > 1e-4 ? velocity.x / horizontalSpeed : 1;
    this.headingZ = horizontalSpeed > 1e-4 ? velocity.z / horizontalSpeed : 0;
    this.elongation = ELONGATION * horizontalFraction;
    this.leanSlope = Math.tan(lean);
    this.stone = { depth: 0, x: 0, z: 0, speed: 0 };

    this.tracePath(impact.x, impact.height ?? ENTRY_HEIGHT * radius, impact.z, velocity, floorDepth, step);
    this.buildSlices();

    // Per-column directions and the oblique hole's stretch along the throw.
    this.columnCos = new Float64Array(COLUMNS);
    this.columnSin = new Float64Array(COLUMNS);
    this.columnShape = new Float64Array(COLUMNS);
    for (let column = 0; column < COLUMNS; column++) {
      const angle = (column / COLUMNS) * Math.PI * 2;
      this.columnCos[column] = Math.cos(angle);
      this.columnSin[column] = Math.sin(angle);
      this.columnShape[column] = this.shape(this.columnCos[column], this.columnSin[column]);
    }
    this.widestShape = 1 + this.elongation;

    const vertexCount = ROWS * COLUMNS;
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.shading = new Float32Array(vertexCount * 3);   // ride, openness, escape (aCavity)
    this.rowX = new Float64Array(ROWS);
    this.rowZ = new Float64Array(ROWS);
    this.rowY = new Float64Array(ROWS);
    this.rowRadius = new Float64Array(ROWS);
    this.mesh = drawn ? createRingGrid(ROWS, COLUMNS, {
      position: [this.positions, 3],
      normal: [this.normals, 3],
      aCavity: [this.shading, 3],
    }, material ?? undefined) : null;
    this.geometry = this.mesh?.geometry ?? null;
    this.push = { x: impact.x, z: impact.z, radius: 0, shiftX: 0, shiftY: -1, shiftZ: 0 };
    this.lip = { x: 0, z: 0, mouth: 0, width: 0, height: 0, widest: 0, widestWidth: 0 };
    this.holeDepth = 0;   // the hole's depth at the last updateGeometry, below the drawn floor if deeper
  }

  // ---- the stone's path ---------------------------------------------------

  /**
   * Integrate the stone under water from the impact, as src/rock.js does and
   * with the same step, into a table. The impact reports the stone where it
   * is at the end of the substep it touched in, one step after the splash's
   * start, so sample n is the stone at n + 1 steps.
   */
  tracePath(x, height, z, velocity, floorDepth, step) {
    const radius = this.radius;
    const steps = Math.ceil(PATH_SECONDS / step) + 1;
    this.pathStep = step;
    this.entryHeight = height;
    this.entrySinking = Math.max(-velocity.y, 0.1);
    this.pathDepth = new Float64Array(steps);
    this.pathX = new Float64Array(steps);
    this.pathZ = new Float64Array(steps);
    this.pathSpeed = new Float64Array(steps);
    this.entryVelocityX = velocity.x;
    this.entryVelocityZ = velocity.z;
    let positionX = x, positionZ = z;
    let velocityX = velocity.x, velocityY = velocity.y, velocityZ = velocity.z;
    let resting = false;
    for (let index = 0; index < steps; index++) {
      if (index > 0 && !resting) {
        const speed = Math.hypot(velocityX, velocityY, velocityZ);
        const drag = Math.min((STONE_DRAG / radius) * speed * step, 0.9);
        velocityX -= velocityX * drag; velocityY -= velocityY * drag; velocityZ -= velocityZ * drag;
        velocityY -= SINKING_GRAVITY * step;
        positionX += velocityX * step; height += velocityY * step; positionZ += velocityZ * step;
        if (height - RESTING_HEIGHT * radius <= -floorDepth) {
          height = -floorDepth + RESTING_HEIGHT * radius;
          velocityX = velocityY = velocityZ = 0;
          resting = true;
        }
      }
      this.pathDepth[index] = -height;
      this.pathX[index] = positionX;
      this.pathZ[index] = positionZ;
      this.pathSpeed[index] = Math.hypot(velocityX, velocityY, velocityZ);
    }
    this.pathCount = steps;
  }

  /** The stone's centre at a time after the impact: depth (positive down), x, z, speed. Before the first sample it moves at its entry velocity. */
  stoneAt(time, out = this.stone) {
    const position = time / this.pathStep - 1;
    if (position < 0) {
      const before = position * this.pathStep;
      out.depth = this.pathDepth[0] - this.entrySinking * before;
      out.x = this.pathX[0] + this.entryVelocityX * before;
      out.z = this.pathZ[0] + this.entryVelocityZ * before;
      out.speed = this.pathSpeed[0];
      return out;
    }
    const clamped = Math.min(position, this.pathCount - 1.000001);
    const index = Math.floor(clamped);
    const blend = clamped - index;
    out.depth = this.pathDepth[index] + (this.pathDepth[index + 1] - this.pathDepth[index]) * blend;
    out.x = this.pathX[index] + (this.pathX[index + 1] - this.pathX[index]) * blend;
    out.z = this.pathZ[index] + (this.pathZ[index + 1] - this.pathZ[index]) * blend;
    out.speed = this.pathSpeed[index] + (this.pathSpeed[index + 1] - this.pathSpeed[index]) * blend;
    return out;
  }

  // ---- the slices ---------------------------------------------------------

  /**
   * Slices every SLICE_STEP·R from the surface down to where the stone is well
   * after the pinch: when the stone's centre passed each, its speed and place
   * then, and from those each slice's lifetime and growth (the header).
   */
  buildSlices() {
    const radius = this.radius;
    const step = SLICE_STEP * radius;
    this.sliceStep = step;
    const deepest = this.stoneAt(Math.min(2 * this.pinchTime + 0.05, PATH_SECONDS)).depth;
    const count = Math.max(Math.floor(Math.max(deepest, step) / step) + 1, 3);
    this.sliceCount = count;
    this.sliceTime = new Float64Array(count);
    this.sliceSpeed = new Float64Array(count);
    this.sliceX = new Float64Array(count);
    this.sliceZ = new Float64Array(count);
    this.sliceClose = new Float64Array(count);
    this.sliceLife = new Float64Array(count);
    this.sliceGrowth = new Float64Array(count);
    let index = 0;
    const centre = { depth: 0, x: 0, z: 0, speed: 0 };
    for (let slice = 0; slice < count; slice++) {
      const depth = slice * step;
      if (depth < this.pathDepth[0]) {
        // Above where the impact found the stone: it passed there at its entry velocity.
        this.sliceTime[slice] = Math.max(this.pathStep + (depth - this.pathDepth[0]) / this.entrySinking, 0);
        this.stoneAt(this.sliceTime[slice], centre);
        this.sliceSpeed[slice] = centre.speed;
        this.sliceX[slice] = centre.x;
        this.sliceZ[slice] = centre.z;
        continue;
      }
      while (index < this.pathCount - 2 && this.pathDepth[index + 1] < depth) index++;
      const span = this.pathDepth[index + 1] - this.pathDepth[index];
      const blend = span > 1e-12 ? Math.min(Math.max((depth - this.pathDepth[index]) / span, 0), 1) : 0;
      this.sliceTime[slice] = (index + 1 + blend) * this.pathStep;
      this.sliceSpeed[slice] = this.pathSpeed[index] + (this.pathSpeed[index + 1] - this.pathSpeed[index]) * blend;
      this.sliceX[slice] = this.pathX[index] + (this.pathX[index + 1] - this.pathX[index]) * blend;
      this.sliceZ[slice] = this.pathZ[index] + (this.pathZ[index + 1] - this.pathZ[index]) * blend;
    }
    this.surfaceTime = this.sliceTime[0];

    // C: the earliest closure t_s(z) + C·V(z)/(z + z0) comes at the pinch time.
    const head = SURFACE_HEAD * radius;
    const lifeShape = new Float64Array(count);
    // A stone that has come to rest on the floor pushes no water aside: its slices' speed is floored.
    const slowest = SLOWEST_PUSH * this.sliceSpeed[0];
    for (let slice = 0; slice < count; slice++) lifeShape[slice] = Math.max(this.sliceSpeed[slice], slowest) / (slice * step + head);
    const earliest = (scale) => {
      let best = Infinity, bestSlice = 0;
      for (let slice = 0; slice < count; slice++) {
        const closing = this.sliceTime[slice] + scale * lifeShape[slice];
        if (closing < best) { best = closing; bestSlice = slice; }
      }
      return { time: best, slice: bestSlice };
    };
    let low = 0, high = 1e-3;
    while (earliest(high).time < this.pinchTime && high < 1e3) high *= 2;
    for (let iteration = 0; iteration < 50; iteration++) {
      const middle = 0.5 * (low + high);
      if (earliest(middle).time < this.pinchTime) low = middle; else high = middle;
    }
    const scale = 0.5 * (low + high);
    const pinchSlice = earliest(scale).slice;
    this.pinchSlice = pinchSlice;
    this.pinchDepth = pinchSlice * step;

    // Above the pinch the closures are compressed in time so that the surface
    // closes CLOSE_TIME·sqrt(R/g) after it; below, they keep their own.
    const surfaceClosing = this.sliceTime[0] + scale * lifeShape[0];
    const compression = surfaceClosing - this.pinchTime > 1e-9 ? (CLOSE_TIME * this.timeUnit) / (surfaceClosing - this.pinchTime) : 1;
    for (let slice = 0; slice < count; slice++) {
      const closing = this.sliceTime[slice] + scale * lifeShape[slice];
      this.sliceClose[slice] = slice <= pinchSlice ? this.pinchTime + (closing - this.pinchTime) * compression : closing;
      this.sliceLife[slice] = Math.max(this.sliceClose[slice] - this.sliceTime[slice], 1e-4);
      const widen = slice * step < this.pinchDepth ? DEEP_WIDEN + (WIDEN - DEEP_WIDEN) * (1 - (slice * step) / this.pinchDepth) : DEEP_WIDEN;
      this.sliceGrowth[slice] = growthFor(1 + widen);
    }
    this.closeTime = pinchSlice > 0 ? this.sliceClose[0] : this.pinchTime;
    // The surface slice is widest at s = B/(2·(1 + B)) of its life.
    this.widestTime = this.surfaceTime + (this.sliceGrowth[0] / (2 * (1 + this.sliceGrowth[0]))) * this.sliceLife[0];
  }

  /** The wall's radius at a depth (positive down) and a time after the impact, before any stretch along the throw. */
  radiusAt(depth, time) {
    const position = Math.min(Math.max(depth / this.sliceStep, 0), this.sliceCount - 1.000001);
    const slice = Math.floor(position);
    const blend = position - slice;
    const start = this.sliceTime[slice] + (this.sliceTime[slice + 1] - this.sliceTime[slice]) * blend;
    const life = this.sliceLife[slice] + (this.sliceLife[slice + 1] - this.sliceLife[slice]) * blend;
    const growth = this.sliceGrowth[slice] + (this.sliceGrowth[slice + 1] - this.sliceGrowth[slice]) * blend;
    const progress = (time - start) / life;
    if (progress <= 0) return this.radius;
    if (progress >= 1) return 0;
    return this.radius * Math.sqrt((1 - progress) * (1 + (1 + growth) * progress));
  }

  /** The centre of the slice at a depth: where the stone's centre crossed it. */
  sliceCentre(depth, out) {
    const position = Math.min(Math.max(depth / this.sliceStep, 0), this.sliceCount - 1.000001);
    const slice = Math.floor(position);
    const blend = position - slice;
    out.x = this.sliceX[slice] + (this.sliceX[slice + 1] - this.sliceX[slice]) * blend;
    out.z = this.sliceZ[slice] + (this.sliceZ[slice + 1] - this.sliceZ[slice]) * blend;
    return out;
  }

  /** After the pinch, the depth of the highest closed slice (the funnel's bottom); 0 once the surface has closed. */
  closedDepth(time) {
    if (time >= this.closeTime) return 0;
    for (let slice = this.pinchSlice - 1; slice >= 0; slice--) {
      if (this.sliceClose[slice] > time) {
        const later = this.sliceClose[slice], earlier = this.sliceClose[slice + 1];
        const blend = later - earlier > 1e-12 ? (later - time) / (later - earlier) : 0;
        return (slice + Math.min(Math.max(blend, 0), 1)) * this.sliceStep;
      }
    }
    return 0;
  }

  /** The mouth's radius: the contact line of a sphere sinking to its equator, then the slice at the surface. */
  mouthAt(time) {
    if (time < this.surfaceTime) {
      const immersion = Math.min(Math.max(1 + this.stoneAt(time, this.stone).depth / Math.max(this.entryHeight, 1e-6), 0), 1);
      return this.radius * Math.sqrt(1 - (1 - immersion) * (1 - immersion));
    }
    return this.radiusAt(0, time);
  }

  /** The stretch of the hole along the throw at an azimuth (its cosine and sine). */
  shape(cosAngle, sinAngle) {
    const along = cosAngle * this.headingX + sinAngle * this.headingZ;
    return 1 + this.elongation * along * along;
  }

  /**
   * The rim at a time after the impact: its centre (the mouth's), the mouth's
   * radius (times shape() at an azimuth), how far out the crest is from it,
   * the crest's height, and the widest the mouth has been with its crest's
   * width then. The crown and fan launch from the crest.
   */
  lipAt(time, out = this.lip) {
    const mouth = this.mouthAt(time);
    this.stoneAt(Math.min(time, this.surfaceTime), this.stone);
    out.x = this.stone.x;
    out.z = this.stone.z;
    out.mouth = mouth;
    out.width = LIP_WIDTH * mouth;
    out.height = LIP_HEIGHT * mouth * (1 - LIP_SETTLE * smoothstep(this.timeUnit, this.pinchTime, time));
    // The widest the mouth has been: a sheet launched from the lip stays there
    // while the hole closes inside it.
    out.widest = time > this.widestTime ? this.mouthAt(this.widestTime) : mouth;
    out.widestWidth = LIP_WIDTH * out.widest;
    return out;
  }

  /** The lip's height (on still water) `beyond` metres outside its crest, of a lip from lipAt. */
  lipHeightBeyond(lip, beyond) {
    if (beyond <= 0) return lip.height;
    const along = Math.min(beyond / (LIP_FALL * this.radius), 1);
    return lip.height * (1 - along) * (1 - along) * (1 + 2 * along);
  }

  // ---- per rendered frame -------------------------------------------------

  /** Advance to the given splash time; finished once the surface has closed. */
  update(time) {
    this.age = time - this.startTime;
    if (this.age >= this.closeTime) this.finished = true;
  }

  /** Evaluate the mesh at the given splash time and upload it, with the circle the surface dips from. */
  updateGeometry(time) {
    this.age = time - this.startTime;
    if (!this.drawn) return;
    const age = this.age;
    const radius = this.radius;
    const lip = this.lipAt(age);
    const mouth = lip.mouth;
    const mouthX = lip.x, mouthZ = lip.z;

    // The bottom: the stone's centre before the pinch, the funnel's closed point after.
    const pinched = age >= this.pinchTime && this.pinchSlice > 0;
    let bottom, bottomRadius;
    if (pinched) {
      bottom = this.closedDepth(age);
      bottomRadius = 0;
    } else {
      bottom = Math.max(this.stoneAt(age, this.stone).depth, 0);
      bottomRadius = bottom > 0 ? radius : mouth;
    }
    this.holeDepth = bottom;
    let truncated = false;
    if (bottom > DRAWN_DEPTH * radius) {
      bottom = DRAWN_DEPTH * radius;
      bottomRadius = this.radiusAt(bottom, age);
      truncated = true;
    }
    // As the upper cavity collapses its axis turns towards the jet's.
    const collapse = pinched ? smoothstep(this.pinchTime, this.closeTime, age) : 0;
    const centre = { x: 0, z: 0 };

    // Wall rows, bottom ring first (row CAP_ROWS) to the mouth (the last wall row).
    const topSpan = TOP_SPAN * radius;
    for (let wallRow = 0; wallRow < WALL_ROWS; wallRow++) {
      const fraction = 1 - wallRow / (WALL_ROWS - 1);   // 1 at the bottom, 0 at the mouth
      let depth;
      if (bottom <= topSpan) depth = bottom * fraction ** TOP_POWER;
      else if (fraction <= TOP_SHARE) depth = topSpan * (fraction / TOP_SHARE) ** TOP_POWER;
      else depth = topSpan + (bottom - topSpan) * (fraction - TOP_SHARE) / (1 - TOP_SHARE);
      const row = CAP_ROWS + wallRow;
      let rowRadius;
      if (bottom <= 0) rowRadius = mouth;
      else if (wallRow === 0) rowRadius = bottomRadius;
      else rowRadius = depth <= 0 ? mouth : this.radiusAt(depth, age);
      this.sliceCentre(depth, centre);
      if (bottom <= 0 || depth <= 0) { centre.x = mouthX; centre.z = mouthZ; }
      if (!pinched && !truncated && wallRow === 0) { centre.x = this.stone.x; centre.z = this.stone.z; }
      if (collapse > 0) {
        centre.x += (mouthX + this.headingX * this.leanSlope * depth - centre.x) * collapse;
        centre.z += (mouthZ + this.headingZ * this.leanSlope * depth - centre.z) * collapse;
      }
      this.rowX[row] = centre.x;
      this.rowZ[row] = centre.z;
      this.rowY[row] = -depth;
      this.rowRadius[row] = rowRadius;
    }
    // The floor: a disc inside the bottom ring.
    for (let row = 0; row < CAP_ROWS; row++) {
      this.rowX[row] = this.rowX[CAP_ROWS];
      this.rowZ[row] = this.rowZ[CAP_ROWS];
      this.rowY[row] = this.rowY[CAP_ROWS];
      this.rowRadius[row] = this.rowRadius[CAP_ROWS] * (row / CAP_ROWS);
    }

    // The circle the surface patch dips from: wide enough that the sheared
    // well it dips into holds every ring of the wall, and the lip's inner face.
    const shearX = bottom > 1e-6 ? (this.rowX[CAP_ROWS] - mouthX) / bottom : 0;
    const shearZ = bottom > 1e-6 ? (this.rowZ[CAP_ROWS] - mouthZ) / bottom : 0;
    const wellDepth = bottom + WELL_CLEARANCE * radius;
    const crest = mouth + lip.width;
    let pushRadius = mouth * this.widestShape + lip.width;
    for (let row = CAP_ROWS; row < CAP_ROWS + WALL_ROWS; row++) {
      const depth = -this.rowY[row];
      const offset = Math.hypot(this.rowX[row] - (mouthX + shearX * depth), this.rowZ[row] - (mouthZ + shearZ * depth));
      pushRadius = Math.max(pushRadius, this.rowRadius[row] * this.widestShape + offset);
    }
    pushRadius += PUSH_MARGIN * this.cell;
    const fall = LIP_FALL * radius;
    const apron = Math.max(pushRadius + COVER_MARGIN * this.cell, crest * this.widestShape + fall + 0.3 * radius);
    this.push.x = mouthX;
    this.push.z = mouthZ;
    this.push.radius = mouth > 0 ? pushRadius : 0;
    this.push.shiftX = shearX * wellDepth;
    this.push.shiftY = -wellDepth;
    this.push.shiftZ = shearZ * wellDepth;

    // The lip: its inner face up to the crest, the fall outside it, the apron.
    let row = CAP_ROWS + WALL_ROWS;
    for (let step = 1; step <= LIP_INNER_ROWS; step++, row++) {
      const angle = (step / LIP_INNER_ROWS) * Math.PI * 0.5;
      this.setLipRow(row, mouthX, mouthZ, lip.width * (1 - Math.cos(angle)), lip.height * Math.sin(angle));
    }
    for (let step = 1; step <= LIP_FALL_ROWS; step++, row++) {
      const along = step / LIP_FALL_ROWS;
      this.setLipRow(row, mouthX, mouthZ, lip.width + fall * along, lip.height * (1 - along) * (1 - along) * (1 + 2 * along));
    }
    for (let step = 1; step <= LIP_APRON_ROWS; step++, row++) {
      // The apron is round (the dip's circle), so its rows hold absolute radii.
      const along = step / LIP_APRON_ROWS;
      this.setLipRow(row, mouthX, mouthZ, along, 0);   // its "radius" is the blend, per column below, from the fall's end to the apron's edge
    }

    // Vertices.
    const darkestMouth = Math.max(mouth, DARKEST_MOUTH * radius);
    const rideDepth = RIDE_DEPTH * radius;
    const apronStart = CAP_ROWS + WALL_ROWS + LIP_INNER_ROWS + LIP_FALL_ROWS;
    const fallStart = CAP_ROWS + WALL_ROWS + LIP_INNER_ROWS;
    for (let rowIndex = 0; rowIndex < ROWS; rowIndex++) {
      const rowY = this.rowY[rowIndex];
      const depth = Math.max(-rowY, 0);
      const ride = 1 - smoothstep(0, rideDepth, depth);
      const relativeDepth = depth / darkestMouth;
      const occluded = relativeDepth / OCCLUSION_DEPTH;
      const openness = 1 / (1 + occluded * occluded);
      // The wall and the lip's inner face look into the hole: a ray they turn
      // downward meets the hole, never the open water (at least FACING_HOLE).
      const escape = rowIndex < fallStart ? Math.max(0.5 * relativeDepth, FACING_HOLE) : 0;
      for (let column = 0; column < COLUMNS; column++) {
        const vertex = rowIndex * COLUMNS + column;
        const cosAngle = this.columnCos[column], sinAngle = this.columnSin[column];
        let distance;
        if (rowIndex >= apronStart) {
          const fallEnd = crest * this.columnShape[column] + fall;
          distance = fallEnd + (apron - fallEnd) * this.rowRadius[rowIndex];
        } else if (rowIndex >= CAP_ROWS + WALL_ROWS) {
          distance = mouth * this.columnShape[column] + this.rowRadius[rowIndex];
        } else {
          distance = this.rowRadius[rowIndex] * this.columnShape[column];
        }
        this.positions[vertex * 3] = this.rowX[rowIndex] + cosAngle * distance;
        this.positions[vertex * 3 + 1] = rowY;
        this.positions[vertex * 3 + 2] = this.rowZ[rowIndex] + sinAngle * distance;
        this.shading[vertex * 3] = ride;
        this.shading[vertex * 3 + 1] = openness;
        this.shading[vertex * 3 + 2] = escape;
      }
    }

    computeGridNormals(this.positions, this.normals, ROWS, COLUMNS);
    // The floor's centre is a pole: it faces as the ring around it does.
    let sumX = 0, sumY = 0, sumZ = 0;
    for (let column = 0; column < COLUMNS; column++) {
      const vertex = COLUMNS + column;
      sumX += this.normals[vertex * 3]; sumY += this.normals[vertex * 3 + 1]; sumZ += this.normals[vertex * 3 + 2];
    }
    const sumLength = Math.hypot(sumX, sumY, sumZ) || 1;
    for (let column = 0; column < COLUMNS; column++) {
      this.normals[column * 3] = sumX / sumLength;
      this.normals[column * 3 + 1] = sumY / sumLength;
      this.normals[column * 3 + 2] = sumZ / sumLength;
    }
    markChanged(this.geometry, ['position', 'normal', 'aCavity']);
  }

  /** A row of the lip around the mouth's centre: `out` beyond the mouth (which is stretched along the throw), at a height. */
  setLipRow(row, centreX, centreZ, out, height) {
    this.rowX[row] = centreX;
    this.rowZ[row] = centreZ;
    this.rowY[row] = height;
    this.rowRadius[row] = out;
  }

  /** The circle the surface dips from and how far its vertices move (down and along the hole), for the water shader; null when there is no hole. */
  pushShape() {
    return this.drawn && this.push.radius > 0 ? this.push : null;
  }

  dispose() {
    this.geometry?.dispose();
  }
}

/** The mesh's layout, for tools/cavity-probe.mjs: rows from the floor's centre outward, and columns around. */
export const CAVITY_LAYOUT = { rows: ROWS, columns: COLUMNS, firstWallRow: CAP_ROWS, mouthRow: CAP_ROWS + WALL_ROWS - 1, apronRow: ROWS - LIP_APRON_ROWS };
