// The cavity: the air-filled hole a stone opens in the water, a closed form in
// depth and time, and the mesh that draws it as a hole in the surface.
//
// The stone. Under water src/rock.js moves the stone with sinkStep (below):
// quadratic drag (deceleration STONE_DRAG·v²/R, C_d = DRAG_COEFFICIENT), a
// sideways lift across its path (C_L·LIFT·v²/R, the lift coefficient and its
// direction from the stone's shape and spin, the spin's part fading as the
// tumble does) and gravity. While its hole is open the stone's back is in the
// hole's air, at the atmosphere's pressure, so the water's hydrostatic head
// presses on its front too, C_h·ρ·g·h·πR² (C_h = HEAD_COEFFICIENT, h the
// centre's depth: deceleration STONE_HEAD·g·h/R), and nothing buoys it; once
// the hole has pinched off the air it carries takes the water's pressure, and
// over OPEN_FADE·sqrt(R/g) the head gives way to buoyancy. A thing of another
// density than a river stone's (src/things.js) is moved with its own
// constants (underWater): the drag's, the head's and the lift's go as ρw/ρs,
// buoyancy too, and each acceleration is divided by the thing's inertia,
// its mass and the water it carries with it (ADDED_MASS, C_a, of the water
// it displaces), against the reference stone's: the fit below holds that
// stone's own added mass (a fifth of its mass), so its constants are the
// fit's and its path is as it was, while a basketball, which carries six
// times its own mass of water, is slowed and buoyed about a sixth as hard as
// its density alone would say. A thing lighter than water rises once its
// hole has pinched off (src/rock.js floats it once it nears the surface);
// the hole's slices reach only as deep as it went (buildSlices). The reference
// simulation (tools/basilisk: a 3 cm stone straight in at 6.3 m/s) fits
// F = C_d·½ρU²πR² + C_h·ρgh·πR² with C_d 0.46 and C_h 0.6; below 20 cm the
// head slows the stone as much as the drag does. The cavity integrates the
// same step once, at the impact, from where the impact found the stone and
// with the simulation's substep, into a table of its path: depth, place and
// speed every substep. So the hole follows the stone's actual depth, speed
// and curve.
//
// The walls (the Rayleigh–Besant picture: Duclaux et al. 2007, Aristoff &
// Bush 2009, Truscott et al. 2014). Each horizontal slice of water at depth z
// is pushed outward when the stone's centre passes it, at t_s(z); it opens,
// stands and closes again under the hydrostatic pressure. With its lifetime T
// and s = (t − t_s(z))/T,
//
//   a(z, t) = R·sqrt(1 + B·s − (1 + B)·s^k),   0 ≤ s ≤ 1, k = OPENING,
//
// R at s = 0 (the stone's equator), 0 at s = 1: it opens fast, stands near its
// widest and closes as a square root, which makes a neck. Its widest, at
// s* = (B/(k·(1 + B)))^(1/(k − 1)), is set through B (read off a table, made
// once) to a funnel's: DEEP_WIDEST·R at 0.8 of the pinch depth z_p and below,
// widening towards the surface by an excess that falls as 1 − FUNNEL_TOP·sqrt(ζ)
// (ζ = z/z_p, times 1 − smoothstep over FUNNEL_FOOT), up to MOUTH_WIDEST·R at
// the surface for the reference throw, the excess going as
// (F/WIDTH_FROUDE)^WIDTH_POWER with the Froude number F = V²/(g·R) (times the
// seal's `mouth`). The mouth of the reference throw is 3.1·R wide by the
// pinch-off and 3.6·R at 0.2 s, the reference simulation's 3.1 and 3.8. The
// lifetime follows the slice's push and the pressure: T ∝ V(z)/(z + z0), with
// z0 = SURFACE_HEAD·R and V(z) the stone's speed there, so a slice closes at
// t_c(z) = t_s(z) + C·V(z)/(z + z0). Shallow slices live longest, deep ones
// were opened late, so the earliest closure, the pinch-off (deep seal), is in
// between: C is set so that it comes PINCH_TIME·sqrt(R/g) after the splash's
// start (Duclaux et al.: 2.06; the reference simulation 1.99 after first
// contact, a substep later), nearly independent of the entry speed, and z0
// sets where it falls: 7.5·R down for the reference throw, as in the
// reference, the stone then 13·R down. It is at least SHALLOWEST·R down. A
// stone come to rest on the floor pushes no water aside, so the speed a slice
// is pushed with is at least SLOWEST_PUSH of the entry speed.
//
// After the pinch-off the hole above the neck is a bowl that stays open and
// fills from below (the reference: 10 cm deep at 130 ms, 5 cm at 165 ms). Its
// floor rises as D = z_p·(S·e^(−τ/τb) + (1 − S)·e^(−τ/τn)) (BOWL_SHARE,
// BOWL_DECAY, NECK_DECAY; τ in the bowl's time unit sqrt(z_p/g) since the
// pinch, times the seal's `bowl`): the neck zips up at once, the bowl over it
// fills more slowly. Each slice above the pinch closes as the floor passes it
// (at BOWL_LAST at the latest), and from FLATTEN[0] to FLATTEN[1] of the
// bowl's unit what is left flattens into the surface: then the hole is gone
// (closeTime), and its foam comes up (src/splash.js). bowlFloorAt gives the
// floor as it is drawn, which the Worthington jet leaves from (src/jet.js,
// which the splash starts at the pinch, at closurePoint()), and bowlVolume the
// water that fills the bowl, a share of which the jet carries. After the pinch
// the funnel also turns onto the jet's axis and its centre moves to the
// closure over RECENTRE·sqrt(R/g); below the pinch the bubble that rides down
// with the stone is no longer drawn.
//
// Seals (`seal`, chosen per throw by the splash). The deep seal above is the
// default (pinch PINCH_TIME, head SURFACE_HEAD, `bowl` and `mouth` 1); the
// splash varies each a little from throw to throw. A shallow seal (a slow or
// flat entry, Aristoff & Bush 2009) pinches sooner and, with a larger head z0,
// which evens out the slices' lifetimes, nearer the surface, and its short
// bowl fills faster. A surface seal (a fast entry, whose crown domes over the
// hole, src/crown.js) cuts the hole off from the air: its mouth stops widening
// early (a small `mouth`), and the stone, still sinking, lowers its pressure,
// so it pinches sooner too.
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
// (Froude number V²/(g·R) 136), its centre reaches the water at 9 ms, the lip
// is highest, 0.28·R, at 65 ms, and the mouth widest, 3.6·R, at 190 ms;
// sealing deep, the hole pinches off at about 115 ms some 5.7·R down (the
// sheared hole's vertical reach is shorter than a straight one's), the stone
// then 10·R down, and the bowl has flattened into the surface by about
// 240 ms. A 4 cm stone's (radius 2 cm) pinches at about 98 ms 6.8·R down and
// has flattened by 230 ms; a 16 cm stone's pinches at about 190 ms 3.3·R down
// (the stone, slowed harder, 8·R down) and has flattened by 370 ms. Each
// throw's stone and seal move these by several per cent
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
// built in src/waterSurface.js), so it is shaded as the same water. Its
// normals are the grid's, but where rings have shrunk to a point (the
// floor's centre; once the hole has pinched, the closing point and the
// cap's rings with it) they face as the first open ring around does, so the
// floor of a bowl flattening into the surface shades as the flat water it
// is becoming, and the hole fades out rather than vanishing in the frame it
// is gone. aCavity carries per vertex how far it rides the surface (1 on
// the lip, which sits on the splash's height field and the wind's waves
// like the surface it joins; 0 down the wall below RIDE_DEPTH·R), how open
// to the sky it is (1 / (1 + (depth / (OCCLUSION_DEPTH·mouth))²): the
// occlusion that darkens the hole towards its bottom) and how steeply a ray
// must climb to leave through the mouth (half the depth over the mouth's
// radius; on the lip's inner face, any upward ray, while a downward one
// meets the hole).
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
// floor at the stone does. In the pool (`walls`, set by SplashSystem) the
// hole is held inside its walls (holdWithinWalls in src/fluidMesh.js), so it
// never shows through the tiles.
import { createRingGrid, computeGridNormals, holdWithinWalls, markChanged } from './fluidMesh.js';

const GRAVITY = 9.81;
// The stone under water, as src/rock.js moves it (tools/cavity-probe.mjs checks the two agree).
const WATER_DENSITY = 1000;
const ROCK_DENSITY = 2600;
const DENSITY_RATIO = WATER_DENSITY / ROCK_DENSITY;
const DRAG_COEFFICIENT = 0.46;     // C_d: the reference simulation's fit while the hole is open (tools/basilisk)...
const HEAD_COEFFICIENT = 0.6;      // ...and C_h, the head on the stone's front while its back is in the hole's air
const STONE_DRAG = (3 / 8) * DENSITY_RATIO * DRAG_COEFFICIENT;   // the drag deceleration is this·v²/R
const STONE_HEAD = (3 / 4) * DENSITY_RATIO * HEAD_COEFFICIENT;   // the head's is this·g·h/R, h the centre's depth
const OPEN_FADE = 0.1;             // in sqrt(R/g): after the pinch-off the head gives way to buoyancy over this long
const RESTING_HEIGHT = 0.75;       // the stone rests with its centre this many radii above the floor
export const SPIN_DECAY = 3;       // the stone's tumble fades as exp(−SPIN_DECAY·t) under water (src/rock.js)
const LIFT = (3 / 8) * (WATER_DENSITY / ROCK_DENSITY);   // a lift coefficient C_L pushes the stone sideways at C_L·LIFT·v²/R
const ADDED_MASS = 0.5;            // C_a: a body carries this share of the water it displaces with it (a sphere's)
// The reference stone's constants (underWater), the fit's as they were.
const STONE_UNDER_WATER = Object.freeze({ density: ROCK_DENSITY, ratio: DENSITY_RATIO, inertia: 1, drag: STONE_DRAG, head: STONE_HEAD, lift: LIFT, restingHeight: RESTING_HEIGHT });
const ENTRY_HEIGHT = 0.7;          // the stone's centre at first contact, in radii above the water, when the impact does not say
const PATH_STEP = 1 / 240;         // s: the app's substep at 60 frames a second, when the impact does not give one
const PATH_SECONDS = 1.5;
// The walls.
const SLICE_STEP = 1 / 6;          // slices this many radii apart
export const PINCH_TIME = 2.06;    // the deep seal's pinch-off, in sqrt(R/g) on the splash's clock (src/rock.js reads it)...
export const NECK_CLOSE = 0.4;     // ...and the water has closed over the stone this many sqrt(R/g) later (src/rock.js)
export const SURFACE_HEAD = 5.25;         // z0, in R: the head in the slices' lifetimes T ∝ V/(z + z0), which sets where the pinch falls
const SLOWEST_PUSH = 0.2;          // a slice is pushed open at least as hard as by this share of the entry speed
const SHALLOWEST = 1;              // in R: the pinch is at least this deep
const OPENING = 4;                 // k in a² = R²·(1 + B·s − (1 + B)·s^k): a slice opens fast, stands, then closes
const MOUTH_WIDEST = 3.6;          // a slice at the surface opens to this many R...
const DEEP_WIDEST = 1.37;          // ...one at 0.8 of the pinch depth or below to this many...
const FUNNEL_TOP = 0.88;           // ...the excess falling as 1 − FUNNEL_TOP·sqrt(ζ) (ζ the depth over the pinch depth)...
const FUNNEL_FOOT = [0.35, 0.8];   // ...times 1 − smoothstep over this span of ζ...
const WIDTH_FROUDE = 135;          // ...for the reference throw's Froude number V²/(g·R); the mouth's excess over
const WIDTH_POWER = 0.25;          //    the deep width goes as (F / WIDTH_FROUDE)^WIDTH_POWER
const BOWL_SHARE = 0.82;           // after the pinch the bowl's floor rises as D = z_p·(S·e^(−τ/τb) + (1 − S)·e^(−τ/τn)),
const BOWL_DECAY = 0.284;          //   S this, τb BOWL_DECAY and τn NECK_DECAY, τ in sqrt(z_p/g) since the pinch: the neck
const NECK_DECAY = 0.01;           //   zips up at once, the bowl above it fills more slowly...
const BOWL_LAST = 1.5;             // ...a slice above the floor's reach closes at this τ at the latest...
const FLATTEN = [0.5, 1.0];        // ...and from the first τ to the second the bowl flattens into the surface, and is gone
const RECENTRE = 0.3;              // in sqrt(R/g): after the pinch the funnel turns onto the jet's axis over this long
const BOWL_STEP = 1 / 12;          // in R: the bowl's volume is summed over slabs this thick
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
const CLOSED_RING = 1e-6;          // in R: a ring narrower is a point (the floor's centre, the closing point), facing as the next open ring does
// Hiding the surface patch.
const PUSH_MARGIN = 2;             // water cells beyond the hole that the patch dips from
const COVER_MARGIN = 2.5;          // water cells beyond that which the lip's apron covers
const WELL_CLEARANCE = 0.2;        // in R: the patch dips this far below the hole's floor
const DRAWN_DEPTH = 4;             // in R: the hole is drawn no deeper

const smoothstep = (edgeLow, edgeHigh, value) => {
  const clamped = Math.min(Math.max((value - edgeLow) / (edgeHigh - edgeLow), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

/** Where a slice of growth B is widest, as a share of its life: s* = (B / (k·(1 + B)))^(1/(k − 1)). */
function widestShare(growth) {
  return (growth / (OPENING * (1 + growth))) ** (1 / (OPENING - 1));
}

/** a²/R² of a slice of growth B at a share s of its life (the header's law). */
function openingSquared(growth, share) {
  return 1 + growth * share - (1 + growth) * share ** OPENING;
}

// A slice's widest radius grows with B (by the envelope theorem its square
// grows at s* − s*^k > 0), so B for a given widest is read off a table of the
// widest at GROWTH_SAMPLES values of B spaced evenly in log B, made once.
const GROWTH_LEAST = 1e-4, GROWTH_MOST = 1e3, GROWTH_SAMPLES = 360;
let growthWidest = null;

/** The growth B that makes a slice open to `widest` (in R) at its widest (from the table, interpolated in log B). */
function growthFor(widest) {
  if (widest <= 1) return 0;
  if (!growthWidest) {
    growthWidest = new Float64Array(GROWTH_SAMPLES);
    for (let index = 0; index < GROWTH_SAMPLES; index++) {
      const growth = GROWTH_LEAST * (GROWTH_MOST / GROWTH_LEAST) ** (index / (GROWTH_SAMPLES - 1));
      growthWidest[index] = Math.sqrt(openingSquared(growth, widestShare(growth)));
    }
  }
  if (widest <= growthWidest[0]) return GROWTH_LEAST * (widest - 1) / (growthWidest[0] - 1);
  let low = 0, high = GROWTH_SAMPLES - 1;
  if (widest >= growthWidest[high]) return GROWTH_MOST;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (growthWidest[middle] < widest) low = middle; else high = middle;
  }
  const blend = (widest - growthWidest[low]) / (growthWidest[high] - growthWidest[low]);
  return GROWTH_LEAST * (GROWTH_MOST / GROWTH_LEAST) ** ((low + blend) / (GROWTH_SAMPLES - 1));
}

/**
 * The constants sinkStep moves a body of `density` (kg/m³) with (the
 * header): ρw/ρs, its inertia against the reference stone's, the drag's, the
 * head's and the lift's coefficients over R, and the height in radii its
 * centre rests at over the floor. The reference stone's are the fit's.
 */
export function underWater(density = ROCK_DENSITY, restingHeight = RESTING_HEIGHT) {
  if (density === ROCK_DENSITY && restingHeight === RESTING_HEIGHT) return STONE_UNDER_WATER;
  const ratio = WATER_DENSITY / density;
  const inertia = (1 + ADDED_MASS * DENSITY_RATIO) / (1 + ADDED_MASS * ratio);
  return {
    density, ratio, inertia, restingHeight,
    drag: (3 / 8) * ratio * DRAG_COEFFICIENT * inertia,
    head: (3 / 4) * ratio * HEAD_COEFFICIENT * inertia,
    lift: (3 / 8) * ratio * inertia,
  };
}

/**
 * One substep of the stone under water (src/rock.js moves it with this, and
 * the cavity traces its path with it): `body` holds its centre (x, y, z), its
 * velocity, the time since the impact, the shape's lift coefficient vector and
 * the spin's (liftX.., spinLiftX..: C_L times a unit direction across the
 * path), when its hole pinches off (openUntil, on the body's clock; never
 * when it is undefined), whether it rests on the floor, which it sets, and
 * `water`, its constants (underWater; the reference stone's if absent).
 * While the hole is open the stone's back is in air at the atmosphere's
 * pressure, so the water's pressure on its front pushes back on it, the head
 * C_h·ρ·g·h·πR², and there is no buoyancy; once the hole has pinched off the
 * air it carries down takes the water's pressure and the stone sinks under
 * buoyancy-reduced gravity (the header).
 */
export function sinkStep(body, radius, step, floorDepth) {
  if (body.resting) return body;
  const water = body.water ?? STONE_UNDER_WATER;
  const floor = typeof floorDepth === 'function' ? floorDepth(body.x, body.z) : floorDepth;
  let velocityX = body.vx, velocityY = body.vy, velocityZ = body.vz;
  const speedSquared = velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ;
  const speed = Math.sqrt(speedSquared);
  const drag = Math.min((water.drag / radius) * speed * step, 0.9);
  velocityX -= velocityX * drag; velocityY -= velocityY * drag; velocityZ -= velocityZ * drag;
  // The head on its front, against its motion, while its hole is open.
  const open = body.openUntil === undefined ? 0
    : Math.min(Math.max(1 - (body.time + step - body.openUntil) / (OPEN_FADE * Math.sqrt(radius / GRAVITY)), 0), 1);
  if (open > 0 && speed > 1e-6) {
    const head = Math.min((water.head * GRAVITY * Math.max(-body.y, 0) / radius) * open * step / speed, 0.9);
    velocityX -= body.vx * head; velocityY -= body.vy * head; velocityZ -= body.vz * head;
  }
  // The lift, kept across the path as the path turns; the spin's fades with the tumble.
  const spinShare = Math.exp(-SPIN_DECAY * (body.time + step));
  let liftX = body.liftX + body.spinLiftX * spinShare;
  let liftY = body.liftY + body.spinLiftY * spinShare;
  let liftZ = body.liftZ + body.spinLiftZ * spinShare;
  if (speedSquared > 1e-12 && (liftX !== 0 || liftY !== 0 || liftZ !== 0)) {
    const along = (liftX * body.vx + liftY * body.vy + liftZ * body.vz) / speedSquared;
    liftX -= along * body.vx; liftY -= along * body.vy; liftZ -= along * body.vz;
    const push = Math.min((water.lift / radius) * speed * step, 0.9) * speed;
    velocityX += liftX * push; velocityY += liftY * push; velocityZ += liftZ * push;
  }
  velocityY -= GRAVITY * (1 - water.ratio * (1 - open)) * water.inertia * step;
  body.x += velocityX * step; body.y += velocityY * step; body.z += velocityZ * step;
  body.vx = velocityX; body.vy = velocityY; body.vz = velocityZ;
  body.time += step;
  if (body.y - water.restingHeight * radius <= -floor) {
    body.y = -floor + water.restingHeight * radius;
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
   * @param impact {x, z, height, speed, velocity, radius, shape, spin, lift, underWater} from Rock.update (height: of the stone's
   *   centre; underWater: its constants, underWater's, the reference stone's if absent)
   * @param startTime splash time of the impact
   * @param material the mesh's material (the water shader's CAVITY_MESH variant), or null for none
   * @param cell the water grid's cell size (m): the surface patch dips under the lip by whole cells
   * @param floorDepth the pond's depth (m), where the stone comes to rest, or a function of world (x, z) giving it (the lake bed)
   * @param lean the jet's lean back along the path (radians): the collapsing funnel turns to it (or setLean)
   * @param drawn false when the impact is outside the simulated patch: the hole is not drawn
   * @param step the simulation's substep (s), which the stone is integrated with
   * @param seal {kind, pinch, bowl, head, mouth}: the seal (the header): the pinch-off in sqrt(R/g), the bowl's
   *   life and the mouth's excess width as shares of a deep seal's, the head in R
   * @param asymmetry {ellipse, lopsided, lopsidedAngle, lobes, lobesAngle, closure}: the wall's departure from round (the header)
   */
  constructor({ impact, startTime, material = null, cell = 6 / 512, floorDepth = 0.8, lean = 0, drawn = true, step = PATH_STEP, seal = null, asymmetry = null }) {
    const { velocity, radius } = impact;
    this.radius = radius;
    this.startTime = startTime;
    this.walls = null;   // the pool's walls, inset (src/splash.js setGround), or none
    this.age = 0;
    this.cell = cell;
    this.drawn = drawn;
    this.finished = false;
    this.timeUnit = Math.sqrt(radius / GRAVITY);
    this.seal = { kind: 'deep', pinch: PINCH_TIME, bowl: 1, head: SURFACE_HEAD, mouth: 1, ...seal };
    this.pinchTime = this.seal.pinch * this.timeUnit;
    const speed = Math.max(impact.speed, 1.0);
    this.froude = (speed * speed) / (GRAVITY * radius);
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

    this.tracePath(impact.x, impact.height ?? ENTRY_HEIGHT * radius, impact.z, velocity, floorDepth, step, impact.lift, impact.underWater);
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
  tracePath(x, height, z, velocity, floorDepth, step, lift = null, water = undefined) {
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
    // The body's clock starts where the impact found the stone, a step after the splash's start.
    const body = {
      x, y: height, z, vx: velocity.x, vy: velocity.y, vz: velocity.z, time: 0, resting: false, openUntil: this.pinchTime - step, water,
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
    // As deep as the stone went by then: a thing lighter than water turns back up (the header).
    const until = Math.min(2 * this.pinchTime + 0.05, PATH_SECONDS);
    let deepest = this.stoneAt(until).depth;
    for (let index = 0; index < this.pathCount && (index + 1) * this.pathStep <= until; index++) deepest = Math.max(deepest, this.pathDepth[index]);
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
    // A hole pinches at least SHALLOWEST·R down (a shallow seal's head would put it at the surface).
    const pinchSlice = Math.min(Math.max(earliest(scale).slice, Math.round(SHALLOWEST / SLICE_STEP)), count - 1);
    this.pinchSlice = pinchSlice;
    this.pinchDepth = pinchSlice * step;

    // Above the pinch the bowl closes from the neck up (the header): each
    // slice closes when the bowl's floor rises past it, those its floor
    // never reaches at BOWL_LAST. Below, the slices keep their own closures.
    // The bowl's times are in sqrt(z_p/g), its duration scaled by the seal's.
    this.bowlUnit = Math.sqrt(Math.max(this.pinchDepth, radius) / GRAVITY) * this.seal.bowl;
    // The walls narrow from the mouth's width to the deep width down the funnel.
    const mouthWidest = DEEP_WIDEST + (MOUTH_WIDEST - DEEP_WIDEST) * (this.froude / WIDTH_FROUDE) ** WIDTH_POWER * this.seal.mouth;
    for (let slice = 0; slice < count; slice++) {
      const depth = slice * step;
      let closing = this.sliceTime[slice] + scale * lifeShape[slice];
      if (slice <= pinchSlice) closing = this.pinchTime + (pinchSlice > 0 ? this.bowlRise(depth / this.pinchDepth) * this.bowlUnit : 0);
      this.sliceClose[slice] = closing;
      this.sliceLife[slice] = Math.max(closing - this.sliceTime[slice], 1e-4);
      const share = depth / Math.max(this.pinchDepth, 1e-9);
      const funnel = depth < this.pinchDepth ? Math.max(1 - FUNNEL_TOP * Math.sqrt(share), 0) * (1 - smoothstep(FUNNEL_FOOT[0], FUNNEL_FOOT[1], share)) : 0;
      this.sliceGrowth[slice] = growthFor(DEEP_WIDEST + (mouthWidest - DEEP_WIDEST) * funnel);
    }
    // The bowl is gone, flattened into the surface, at FLATTEN[1].
    this.closeTime = pinchSlice > 0 ? this.pinchTime + FLATTEN[1] * this.bowlUnit : this.pinchTime;
    this.widestTime = this.surfaceTime + widestShare(this.sliceGrowth[0]) * this.sliceLife[0];
    // The bowl above the neck at the pinch: the water that fills it feeds the jet (src/jet.js).
    this.bowlVolume = 0;
    for (let depth = 0.5 * BOWL_STEP * radius; depth < this.pinchDepth; depth += BOWL_STEP * radius) {
      this.bowlVolume += Math.PI * this.radiusAt(depth, this.pinchTime) ** 2 * BOWL_STEP * radius;
    }
  }

  /** The bowl's floor as a share of the pinch depth at τ (in its units) since the pinch, before it flattens (the header's D/z_p). */
  bowlShare(since) {
    return BOWL_SHARE * Math.exp(-since / BOWL_DECAY) + (1 - BOWL_SHARE) * Math.exp(-since / NECK_DECAY);
  }

  /** The time (τ since the pinch) the bowl's floor takes to rise to `share` of the pinch depth, at most BOWL_LAST (a bisection, at the impact). */
  bowlRise(share) {
    if (share >= 1) return 0;
    if (this.bowlShare(BOWL_LAST) >= share) return BOWL_LAST;
    let low = 0, high = BOWL_LAST;
    for (let iteration = 0; iteration < 40; iteration++) {
      const middle = 0.5 * (low + high);
      if (this.bowlShare(middle) > share) low = middle; else high = middle;
    }
    return 0.5 * (low + high);
  }

  /** How much of its depth the bowl keeps as it flattens into the surface (1 until FLATTEN[0], 0 at FLATTEN[1]), at a time after the impact. */
  flattenShare(time) {
    if (this.pinchSlice <= 0 || time <= this.pinchTime) return 1;
    return 1 - smoothstep(FLATTEN[0], FLATTEN[1], (time - this.pinchTime) / this.bowlUnit);
  }

  /**
   * The bowl's floor as it is drawn, at a time after the impact: its depth
   * (positive down, flattened) and how fast it rises (m/s). Before the
   * pinch, the pinch depth, rising at nothing; once the bowl is gone, the
   * surface.
   */
  bowlFloorAt(time, out = {}) {
    const since = Math.max(time - this.pinchTime, 0) / this.bowlUnit;
    if (this.pinchSlice <= 0 || since >= FLATTEN[1]) { out.depth = 0; out.rise = 0; return out; }
    const share = this.bowlShare(since);
    const slope = -(BOWL_SHARE / BOWL_DECAY) * Math.exp(-since / BOWL_DECAY) - ((1 - BOWL_SHARE) / NECK_DECAY) * Math.exp(-since / NECK_DECAY);
    const span = FLATTEN[1] - FLATTEN[0];
    const along = Math.min(Math.max((since - FLATTEN[0]) / span, 0), 1);
    const flatten = 1 - along * along * (3 - 2 * along);
    const flattenSlope = -6 * along * (1 - along) / span;
    out.depth = this.pinchDepth * share * flatten;
    out.rise = time > this.pinchTime ? -(this.pinchDepth * (slope * flatten + share * flattenSlope)) / this.bowlUnit : 0;
    return out;
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
    return this.radius * Math.sqrt(Math.max(openingSquared(growth, progress), 0));
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

  /** How far the bowl has turned onto the jet's axis and its centre moved to the closure: 0 until the pinch, 1 RECENTRE·sqrt(R/g) later. */
  collapseShare(time) {
    return time >= this.pinchTime && this.pinchSlice > 0 ? smoothstep(this.pinchTime, Math.min(this.pinchTime + RECENTRE * this.timeUnit, this.closeTime), time) : 0;
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
    out.height = LIP_HEIGHT * mouth * (1 - LIP_SETTLE * smoothstep(this.timeUnit, this.pinchTime, time)) * this.flattenShare(time);
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
      // The bowl's floor (bowlFloorAt), before it flattens: the depth of the highest closed slice.
      bottom = this.pinchDepth * this.bowlShare((age - this.pinchTime) / this.bowlUnit);
      bottomRadius = 0;
    } else {
      bottom = Math.max(this.stoneAt(age, this.stone).depth, 0);
      bottomRadius = bottom > 0 ? radius : mouth;
    }
    // As the bowl flattens into the surface (flattenShare), every depth is drawn that much shallower.
    const flatten = this.flattenShare(age);
    this.holeDepth = bottom * flatten;
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
        centre.x += (mouthX - this.leanX * depth * flatten - centre.x) * collapse;
        centre.z += (mouthZ - this.leanZ * depth * flatten - centre.z) * collapse;
      }
      this.rowX[row] = centre.x;
      this.rowZ[row] = centre.z;
      this.rowY[row] = -depth * flatten;
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
    const drawnBottom = bottom * flatten;
    const shearX = drawnBottom > 1e-6 ? (this.rowX[CAP_ROWS] - mouthX) / drawnBottom : 0;
    const shearZ = drawnBottom > 1e-6 ? (this.rowZ[CAP_ROWS] - mouthZ) / drawnBottom : 0;
    const wellDepth = drawnBottom + WELL_CLEARANCE * radius;
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

    holdWithinWalls(this.positions, this.walls);   // in the pool, flat against a wall it meets (src/splash.js)
    computeGridNormals(this.positions, this.normals, ROWS, COLUMNS);
    // The floor's centre is a pole, and once the hole has pinched so are its
    // bottom ring (the closing point) and the cap's rings: each faces as the
    // first open ring around them does. The grid's own rule for a pole
    // (src/fluidMesh.js) would face the closing point along the floor, out
    // towards that ring, and shade the floor from the centre out to it (most
    // of a big stone's bowl) as a steep cone however flat the bowl has
    // become: the hole would show, dark, until the frame it is gone.
    let openRow = 1;
    while (openRow < CAP_ROWS + WALL_ROWS - 1 && this.rowRadius[openRow] < CLOSED_RING * radius) openRow++;
    let sumX = 0, sumY = 0, sumZ = 0;
    for (let column = 0; column < COLUMNS; column++) {
      const vertex = openRow * COLUMNS + column;
      sumX += this.normals[vertex * 3]; sumY += this.normals[vertex * 3 + 1]; sumZ += this.normals[vertex * 3 + 2];
    }
    const sumLength = Math.hypot(sumX, sumY, sumZ) || 1;
    for (let vertex = 0; vertex < openRow * COLUMNS; vertex++) {
      this.normals[vertex * 3] = sumX / sumLength;
      this.normals[vertex * 3 + 1] = sumY / sumLength;
      this.normals[vertex * 3 + 2] = sumZ / sumLength;
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
