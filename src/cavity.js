// The cavity: the air-filled hole a stone opens in the water, a closed form in
// depth and time, and the mesh that draws it as a hole in the surface.
//
// The stone. Under water src/rock.js moves the stone with sinkStep (below):
// quadratic drag (deceleration STONE_DRAG·v²/R), a sideways lift across its
// path (C_L·LIFT·v²/R, the lift coefficient and its direction from the stone's
// shape and spin, the spin's part fading as the tumble does) and
// buoyancy-reduced gravity. The cavity integrates the same step once, at the
// impact, from where the impact found the stone and with the simulation's
// substep, into a table of its path: depth, place and speed every substep. So
// the hole follows the stone's actual depth, speed and curve.
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
// starts the jet there, at closurePoint()). Below the pinch the bubble
// that rides down with the stone is no longer drawn.
//
// Seals (`seal`, chosen per throw by the splash). The deep seal above is the
// default (pinch PINCH_TIME, closure CLOSE_TIME later, head SURFACE_HEAD,
// mouth WIDEN); the splash varies each a little from throw to throw. A shallow
// seal (a slow or flat entry, Aristoff & Bush 2009) pinches sooner and, with a
// larger head z0, which evens out the slices' lifetimes, nearer the surface,
// and its short funnel closes faster. A surface seal (a fast entry, whose crown
// domes over the hole, src/crown.js) cuts the hole off from the air: the
// stone, still sinking, lowers its pressure, so it pinches sooner too.
//
// An oblique entry: every slice is centred where the stone's centre was when
// it passed, so the hole is sheared along the stone's path (and bent where
// the lift curves it), and is elongated along the direction of travel by
// ELONGATION times the horizontal fraction of the entry speed.
//
// A stone is no ball, and the hole it opens shows it (`asymmetry`, from the
// splash). Each slice opens to the stone's outline as the stone was turned
// when it passed: the shadow on the water of the ellipsoid with the stone's
// moments (src/rock.js), turned by its tumble (about the spin axis, by
// ∫ω dt with ω fading as exp(−SPIN_DECAY·t)), whose half-width at azimuth φ
// is h(φ) = sqrt(A + B·cos 2φ + C·sin 2φ); the wall keeps `ellipse` of that
// outline's departure from round (the water it throws out evens the rest), so
// an elongated stone's hole is oval and, as it tumbles down, the oval turns
// with depth. Its lumps make the wall lopsided and lobed: 1 + lopsided·cos(φ −
// ψ1) + lobes·cos 3(φ − ψ3), both phases turning with the stone's turn about
// the vertical (a spin about the path rifles the hole). The radius at depth z,
// time t and azimuth φ is a(z, t)·S(z, φ), S held between MODULATION_LEAST
// and MODULATION_MOST. A lopsided hole closes off-centre: its walls meet
// towards the side it bulged to, `closure` (in R, along ψ1) from the mouth's
// centre, and the jet rises there. As the upper cavity collapses its axis
// turns towards the jet's lean (setLean: the jet's top's direction times the
// tangent of its lean, back along the path after an oblique entry, see
// JET_LEAN in src/splash.js, and towards a lopsided collapse's bulge), so the
// jet comes up the axis of the funnel it closes from.
//
// The rim. Around the mouth (the slice at the surface; before the stone's
// centre reaches the water, the contact line of a sphere sinking to its
// equator) the water stands in a lip LIP_HEIGHT times the mouth radius high
// and LIP_WIDTH times it wide, falling over LIP_FALL·R outside, which rises,
// widens and falls back with the mouth; around the mouth it follows the
// mouth's outline, S(0, φ) (shape()). Its crest is where the crown sheet and
// the forward fan launch (lipAt, read by src/crown.js), so they stand on it
// and follow it. For a 3 cm stone thrown in at 6.3 m/s, 42° from vertical
// (Froude number V²/(g·R) 136), its centre reaches the water at 9 ms; the
// mouth is widest, 1.45·R, at 64 ms, the lip 0.17·R high; sealing deep, the
// hole pinches off at about 116 ms some 6·R down, the stone then 9 to 10·R
// down, and the surface closes at about 140 ms. A 4 cm stone's (radius 2 cm)
// pinches at about 99 ms 7.3·R down and closes at about 120 ms; a 16 cm
// stone's at about 185 ms 3.7·R down (the stone, slowed harder, 6.3·R down)
// and 225 ms. Each throw's stone and seal move these by several per cent
// (tools/cavity-probe.mjs prints them).
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
// enough (the widest ring of the wall at its depth around that line, at its
// widest azimuth, plus PUSH_MARGIN of the water's cells, more than the
// diagonal of one) that the
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
export const SPIN_DECAY = 3;       // the stone's tumble fades as exp(−SPIN_DECAY·t) under water (src/rock.js)
const LIFT = (3 / 8) * (WATER_DENSITY / ROCK_DENSITY);   // a lift coefficient C_L pushes the stone sideways at C_L·LIFT·v²/R
const ENTRY_HEIGHT = 0.7;          // the stone's centre at first contact, in radii above the water, when the impact does not say
const PATH_STEP = 1 / 240;         // s: the app's substep at 60 frames a second, when the impact does not give one
const PATH_SECONDS = 1.5;
// The walls.
const SLICE_STEP = 1 / 6;          // slices this many radii apart
export const PINCH_TIME = 2.1;     // the deep seal, in sqrt(R/g) after entry...
export const CLOSE_TIME = 0.4;     // ...and the surface closes this many sqrt(R/g) later (src/rock.js reads both)
const SURFACE_HEAD = 0.5;          // z0, in R: the pressure head that closes the slices at the surface
const SLOWEST_PUSH = 0.2;          // a slice is pushed open at least as hard as by this share of the entry speed
const WIDEN = 0.45;                // a slice at the surface opens to R·(1 + WIDEN)...
const DEEP_WIDEN = 0.05;           // ...one at the pinch depth or below to R·(1 + DEEP_WIDEN)
const ELONGATION = 0.35;           // an oblique hole is this much longer along the throw, times the horizontal fraction
const MODULATION_LEAST = 0.55;     // the wall's radius around the axis, against the round hole's, at least...
const MODULATION_MOST = 1.7;       // ...and at most
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

/**
 * One substep of the stone under water (src/rock.js moves it with this, and
 * the cavity traces its path with it): `body` holds its centre (x, y, z), its
 * velocity, the time since the impact, the shape's lift coefficient vector and
 * the spin's (liftX.., spinLiftX..: C_L times a unit direction across the
 * path), and whether it rests on the floor, which it sets.
 */
export function sinkStep(body, radius, step, floorDepth) {
  if (body.resting) return body;
  let velocityX = body.vx, velocityY = body.vy, velocityZ = body.vz;
  const speedSquared = velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ;
  const speed = Math.sqrt(speedSquared);
  const drag = Math.min((STONE_DRAG / radius) * speed * step, 0.9);
  velocityX -= velocityX * drag; velocityY -= velocityY * drag; velocityZ -= velocityZ * drag;
  // The lift, kept across the path as the path turns; the spin's fades with the tumble.
  const spinShare = Math.exp(-SPIN_DECAY * (body.time + step));
  let liftX = body.liftX + body.spinLiftX * spinShare;
  let liftY = body.liftY + body.spinLiftY * spinShare;
  let liftZ = body.liftZ + body.spinLiftZ * spinShare;
  if (speedSquared > 1e-12 && (liftX !== 0 || liftY !== 0 || liftZ !== 0)) {
    const along = (liftX * body.vx + liftY * body.vy + liftZ * body.vz) / speedSquared;
    liftX -= along * body.vx; liftY -= along * body.vy; liftZ -= along * body.vz;
    const push = Math.min((LIFT / radius) * speed * step, 0.9) * speed;
    velocityX += liftX * push; velocityY += liftY * push; velocityZ += liftZ * push;
  }
  velocityY -= SINKING_GRAVITY * step;
  body.x += velocityX * step; body.y += velocityY * step; body.z += velocityZ * step;
  body.vx = velocityX; body.vy = velocityY; body.vz = velocityZ;
  body.time += step;
  if (body.y - RESTING_HEIGHT * radius <= -floorDepth) {
    body.y = -floorDepth + RESTING_HEIGHT * radius;
    body.vx = body.vy = body.vz = 0;
    body.resting = true;
  }
  return body;
}

/** A unit quaternion {x, y, z, w} applied to a vector (x, y, z), into `out`. */
function rotate(quaternion, x, y, z, out) {
  const { x: qx, y: qy, z: qz, w: qw } = quaternion;
  // t = 2·(q × v); v' = v + w·t + q × t
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty);
  out[1] = y + qw * ty + (qz * tx - qx * tz);
  out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** The product of two quaternions, first ⊗ second (turn by second, then by first). */
function multiply(first, second) {
  return {
    x: first.w * second.x + first.x * second.w + first.y * second.z - first.z * second.y,
    y: first.w * second.y - first.x * second.z + first.y * second.w + first.z * second.x,
    z: first.w * second.z + first.x * second.y - first.y * second.x + first.z * second.w,
    w: first.w * second.w - first.x * second.x - first.y * second.y - first.z * second.z,
  };
}

export class Cavity {
  /**
   * @param impact {x, z, height, speed, velocity, radius, shape, spin, lift} from Rock.update (height: of the stone's centre)
   * @param startTime splash time of the impact
   * @param material the mesh's material (the water shader's CAVITY_MESH variant), or null for none
   * @param cell the water grid's cell size (m): the surface patch dips under the lip by whole cells
   * @param floorDepth the pond's depth (m), where the stone comes to rest
   * @param lean the jet's lean back along the path (radians): the collapsing funnel turns to it (or setLean)
   * @param drawn false when the impact is outside the simulated patch: the hole is not drawn
   * @param step the simulation's substep (s), which the stone is integrated with
   * @param seal {kind, pinch, close, head, widen}: the seal (the header), times in sqrt(R/g), the head in R
   * @param asymmetry {ellipse, lopsided, lopsidedAngle, lobes, lobesAngle, closure}: the wall's departure from round (the header)
   */
  constructor({ impact, startTime, material = null, cell = 6 / 512, floorDepth = 0.8, lean = 0, drawn = true, step = PATH_STEP, seal = null, asymmetry = null }) {
    const { velocity, radius } = impact;
    this.radius = radius;
    this.startTime = startTime;
    this.age = 0;
    this.cell = cell;
    this.drawn = drawn;
    this.finished = false;
    this.timeUnit = Math.sqrt(radius / GRAVITY);
    this.seal = { kind: 'deep', pinch: PINCH_TIME, close: CLOSE_TIME, head: SURFACE_HEAD, widen: WIDEN, ...seal };
    this.pinchTime = this.seal.pinch * this.timeUnit;
    const speed = Math.max(impact.speed, 1.0);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const horizontalFraction = Math.min(horizontalSpeed / speed, 1);
    this.headingX = horizontalSpeed > 1e-4 ? velocity.x / horizontalSpeed : 1;
    this.headingZ = horizontalSpeed > 1e-4 ? velocity.z / horizontalSpeed : 0;
    this.elongation = ELONGATION * horizontalFraction;
    // The jet's lean as a vector: its top's direction times the tangent of its lean (setLean).
    this.leanX = -this.headingX * Math.tan(lean);
    this.leanZ = -this.headingZ * Math.tan(lean);
    this.stone = { depth: 0, x: 0, z: 0, speed: 0 };
    this.asymmetry = { ellipse: 0, lopsided: 0, lopsidedAngle: 0, lobes: 0, lobesAngle: 0, closure: 0, ...asymmetry };
    // The closure, off the mouth's centre towards the bulge.
    this.closureX = this.asymmetry.closure * radius * Math.cos(this.asymmetry.lopsidedAngle);
    this.closureZ = this.asymmetry.closure * radius * Math.sin(this.asymmetry.lopsidedAngle);

    this.tracePath(impact.x, impact.height ?? ENTRY_HEIGHT * radius, impact.z, velocity, floorDepth, step, impact.lift);
    this.buildSlices();
    this.buildSections(impact);

    // Scratch for the outline: a section's terms (sectionAt), each wall row's
    // outline per column and its widest (updateGeometry).
    this.section = {};
    this.outlines = new Float64Array((CAP_ROWS + WALL_ROWS) * COLUMNS);
    this.rowWidest = new Float64Array(CAP_ROWS + WALL_ROWS);

    // Per-column directions (and of their doubles and triples, for the
    // outline's harmonics), and the mouth's outline.
    this.columnCos = new Float64Array(COLUMNS);
    this.columnSin = new Float64Array(COLUMNS);
    this.columnHarmonics = new Float64Array(COLUMNS * 4);   // cos 2φ, sin 2φ, cos 3φ, sin 3φ
    this.columnShape = new Float64Array(COLUMNS);
    let widest = 0;
    for (let column = 0; column < COLUMNS; column++) {
      const angle = (column / COLUMNS) * Math.PI * 2;
      this.columnCos[column] = Math.cos(angle);
      this.columnSin[column] = Math.sin(angle);
      this.columnHarmonics[column * 4] = Math.cos(2 * angle);
      this.columnHarmonics[column * 4 + 1] = Math.sin(2 * angle);
      this.columnHarmonics[column * 4 + 2] = Math.cos(3 * angle);
      this.columnHarmonics[column * 4 + 3] = Math.sin(3 * angle);
      this.columnShape[column] = this.shape(this.columnCos[column], this.columnSin[column]);
      widest = Math.max(widest, this.columnShape[column]);
    }
    // The mouth at its widest azimuth (between columns too: a little over the columns' widest).
    this.widestShape = Math.max(widest * 1.01, 1 + this.elongation);

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
   * Integrate the stone under water from the impact, with src/rock.js's step
   * (sinkStep) and substep, into a table. The impact reports the stone where it
   * is at the end of the substep it touched in, one step after the splash's
   * start, so sample n is the stone at n + 1 steps.
   */
  tracePath(x, height, z, velocity, floorDepth, step, lift = null) {
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
    const body = {
      x, y: height, z, vx: velocity.x, vy: velocity.y, vz: velocity.z, time: 0, resting: false,
      liftX: lift?.shape.x ?? 0, liftY: lift?.shape.y ?? 0, liftZ: lift?.shape.z ?? 0,
      spinLiftX: lift?.spin.x ?? 0, spinLiftY: lift?.spin.y ?? 0, spinLiftZ: lift?.spin.z ?? 0,
    };
    for (let index = 0; index < steps; index++) {
      if (index > 0) sinkStep(body, radius, step, floorDepth);
      this.pathDepth[index] = -body.y;
      this.pathX[index] = body.x;
      this.pathZ[index] = body.z;
      this.pathSpeed[index] = Math.hypot(body.vx, body.vy, body.vz);
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
    const head = this.seal.head * radius;
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
    const compression = surfaceClosing - this.pinchTime > 1e-9 ? (this.seal.close * this.timeUnit) / (surfaceClosing - this.pinchTime) : 1;
    for (let slice = 0; slice < count; slice++) {
      const closing = this.sliceTime[slice] + scale * lifeShape[slice];
      this.sliceClose[slice] = slice <= pinchSlice ? this.pinchTime + (closing - this.pinchTime) * compression : closing;
      this.sliceLife[slice] = Math.max(this.sliceClose[slice] - this.sliceTime[slice], 1e-4);
      const widen = slice * step < this.pinchDepth ? DEEP_WIDEN + (this.seal.widen - DEEP_WIDEN) * (1 - (slice * step) / this.pinchDepth) : DEEP_WIDEN;
      this.sliceGrowth[slice] = growthFor(1 + widen);
    }
    this.closeTime = pinchSlice > 0 ? this.sliceClose[0] : this.pinchTime;
    // The surface slice is widest at s = B/(2·(1 + B)) of its life.
    this.widestTime = this.surfaceTime + (this.sliceGrowth[0] / (2 * (1 + this.sliceGrowth[0]))) * this.sliceLife[0];
  }

  /**
   * The stone's outline as it passed each slice (the header): the
   * coefficients B/A and C/A of the squared half-width of its ellipsoid's
   * shadow, A + B·cos 2φ + C·sin 2φ, and its turn about the vertical by then,
   * which turns the lumps. A stone the impact says nothing of is round.
   */
  buildSections(impact) {
    const count = this.sliceCount;
    this.sectionCos2 = new Float64Array(count);
    this.sectionSin2 = new Float64Array(count);
    this.sectionTurn = new Float64Array(count);
    const { shape, spin } = impact;
    if (!shape || !spin) return;
    const turned = [0, 0, 0];
    for (let slice = 0; slice < count; slice++) {
      // Turned about the spin axis by ∫ω dt, ω fading as exp(−SPIN_DECAY·t).
      const angle = (spin.rate * (1 - Math.exp(-SPIN_DECAY * this.sliceTime[slice]))) / SPIN_DECAY;
      const sine = Math.sin(0.5 * angle);
      const orientation = multiply({ x: spin.axis.x * sine, y: spin.axis.y * sine, z: spin.axis.z * sine, w: Math.cos(0.5 * angle) }, spin.orientation);
      let xx = 0, zz = 0, xz = 0;
      for (let axis = 0; axis < 3; axis++) {
        rotate(orientation, shape.axes[axis].x, shape.axes[axis].y, shape.axes[axis].z, turned);
        const squared = shape.semiAxes[axis] * shape.semiAxes[axis];
        xx += squared * turned[0] * turned[0];
        zz += squared * turned[2] * turned[2];
        xz += squared * turned[0] * turned[2];
      }
      const mean = 0.5 * (xx + zz);
      this.sectionCos2[slice] = (0.5 * (xx - zz)) / mean;
      this.sectionSin2[slice] = xz / mean;
      this.sectionTurn[slice] = angle * spin.axis.y;
    }
  }

  /**
   * The outline's terms at a depth (positive down), into `out`: the
   * ellipse's B/A and C/A and its mean half-width's divisor, and the lumps'
   * cos and sin of their phases (ψ1 and 3·ψ3, turned with the stone).
   */
  sectionAt(depth, out) {
    const position = Math.min(Math.max(depth / this.sliceStep, 0), this.sliceCount - 1.000001);
    const slice = Math.floor(position);
    const blend = position - slice;
    const cos2 = this.sectionCos2[slice] + (this.sectionCos2[slice + 1] - this.sectionCos2[slice]) * blend;
    const sin2 = this.sectionSin2[slice] + (this.sectionSin2[slice + 1] - this.sectionSin2[slice]) * blend;
    const turn = this.sectionTurn[slice] + (this.sectionTurn[slice + 1] - this.sectionTurn[slice]) * blend;
    out.cos2 = cos2;
    out.sin2 = sin2;
    // The mean of sqrt(1 + e·cos x) over x is about 1 − e²/16.
    out.mean = 1 - (cos2 * cos2 + sin2 * sin2) / 16;
    const lopsidedPhase = this.asymmetry.lopsidedAngle + turn;
    const lobesPhase = 3 * (this.asymmetry.lobesAngle + turn);
    out.lopsidedCos = Math.cos(lopsidedPhase); out.lopsidedSin = Math.sin(lopsidedPhase);
    out.lobesCos = Math.cos(lobesPhase); out.lobesSin = Math.sin(lobesPhase);
    return out;
  }

  /** S at an azimuth (cos, sin, cos 2φ, sin 2φ, cos 3φ, sin 3φ) for the terms of sectionAt, with the oblique stretch. */
  outlineFactor(section, cosAngle, sinAngle, cos2, sin2, cos3, sin3) {
    const { ellipse, lopsided, lobes } = this.asymmetry;
    const halfWidth = Math.sqrt(Math.max(1 + section.cos2 * cos2 + section.sin2 * sin2, 0.05)) / section.mean;
    const lumps = 1 + lopsided * (cosAngle * section.lopsidedCos + sinAngle * section.lopsidedSin) + lobes * (cos3 * section.lobesCos + sin3 * section.lobesSin);
    const along = cosAngle * this.headingX + sinAngle * this.headingZ;
    const factor = (1 + this.elongation * along * along) * (1 + ellipse * (halfWidth - 1)) * lumps;
    return Math.min(Math.max(factor, MODULATION_LEAST), MODULATION_MOST);
  }

  /** S over a row's columns at a depth, into `out` (one value per column); returns the widest. */
  rowOutline(depth, out, offset = 0) {
    const section = this.sectionAt(depth, this.section);
    let widest = 0;
    for (let column = 0; column < COLUMNS; column++) {
      const harmonics = column * 4;
      const factor = this.outlineFactor(section, this.columnCos[column], this.columnSin[column],
        this.columnHarmonics[harmonics], this.columnHarmonics[harmonics + 1], this.columnHarmonics[harmonics + 2], this.columnHarmonics[harmonics + 3]);
      out[offset + column] = factor;
      widest = Math.max(widest, factor);
    }
    return widest;
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

  /** The mouth's outline at an azimuth (its cosine and sine): S(0, φ) of the header, the stretch along the throw included. */
  shape(cosAngle, sinAngle) {
    // The section at the surface never changes: worked out once (the crown asks at every vertex).
    const section = this.mouthSection ??= this.sectionAt(0, {});
    const cos2 = cosAngle * cosAngle - sinAngle * sinAngle, sin2 = 2 * sinAngle * cosAngle;
    const cos3 = cosAngle * (4 * cosAngle * cosAngle - 3), sin3 = sinAngle * (3 - 4 * sinAngle * sinAngle);
    return this.outlineFactor(section, cosAngle, sinAngle, cos2, sin2, cos3, sin3);
  }

  /** How far the upper cavity has collapsed towards its closure: 0 until the pinch, 1 when the surface closes. */
  collapseShare(time) {
    return time >= this.pinchTime && this.pinchSlice > 0 ? smoothstep(this.pinchTime, this.closeTime, time) : 0;
  }

  /** Where the hole closes, the jet's foot (the header): the mouth's centre, moved towards the bulge. */
  closurePoint(out = {}) {
    this.stoneAt(this.surfaceTime, this.stone);
    out.x = this.stone.x + this.closureX;
    out.z = this.stone.z + this.closureZ;
    return out;
  }

  /** The jet's lean: its top's horizontal direction times the tangent of its lean from vertical. The collapsing funnel turns to it. */
  setLean(leanX, leanZ) {
    this.leanX = leanX;
    this.leanZ = leanZ;
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
    const collapse = this.collapseShare(time);
    out.x = this.stone.x + this.closureX * collapse;
    out.z = this.stone.z + this.closureZ * collapse;
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
    // As the upper cavity collapses its axis turns towards the jet's, from the
    // mouth's centre, which moves to the closure as it closes (lipAt).
    const collapse = this.collapseShare(age);
    const centre = { x: 0, z: 0 };
    const outlines = this.outlines;
    const rowWidest = this.rowWidest;

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
        centre.x += (mouthX - this.leanX * depth - centre.x) * collapse;
        centre.z += (mouthZ - this.leanZ * depth - centre.z) * collapse;
      }
      this.rowX[row] = centre.x;
      this.rowZ[row] = centre.z;
      this.rowY[row] = -depth;
      this.rowRadius[row] = rowRadius;
      // The mouth row follows the mouth's outline exactly (the lip's rows join it).
      if (depth <= 0) { outlines.set(this.columnShape, row * COLUMNS); rowWidest[row] = this.widestShape; }
      else rowWidest[row] = this.rowOutline(depth, outlines, row * COLUMNS) * 1.01;
    }
    // The floor: a disc inside the bottom ring, with its outline.
    for (let row = 0; row < CAP_ROWS; row++) {
      this.rowX[row] = this.rowX[CAP_ROWS];
      this.rowZ[row] = this.rowZ[CAP_ROWS];
      this.rowY[row] = this.rowY[CAP_ROWS];
      this.rowRadius[row] = this.rowRadius[CAP_ROWS] * (row / CAP_ROWS);
      outlines.copyWithin(row * COLUMNS, CAP_ROWS * COLUMNS, (CAP_ROWS + 1) * COLUMNS);
      rowWidest[row] = rowWidest[CAP_ROWS];
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
      pushRadius = Math.max(pushRadius, this.rowRadius[row] * rowWidest[row] + offset);
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
          distance = this.rowRadius[rowIndex] * outlines[vertex];
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
