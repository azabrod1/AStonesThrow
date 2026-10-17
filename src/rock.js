// A thrown stone: procedural geometry (lumpy, worn smooth, speckled:
// createRockGeometry) and a small rigid-body model.
//
// In the air it follows a ballistic arc with a little drag and tumbles, at
// SPIN_LEAST to SPIN_MOST rad/s about a random axis (most stones turn
// slowly, a few fast). The moment its lowest point (of the tumbling mesh, not
// of a sphere) touches the surface it reports the impact (position, its
// centre's height, speed, direction, radius, and the stone's own properties
// below) so the splash can be built from it (the cavity follows the stone
// down from there): the splash starts at first contact, not once the stone is
// partly under, which for a 16 cm stone at 5 m/s down would be several
// milliseconds late. Under water a quadratic drag and, while its hole is open,
// the water's head on its front (the reference simulation's fit, C_d 0.46 and
// C_h 0.6) stop it within a few radii, a sideways lift curves its path a
// little, and once the hole has pinched off buoyancy-reduced gravity sinks it
// to the lake bed, where it settles into the sand (sinkStep in src/cavity.js,
// which traces the cavity along the same path; the splash tells the stone
// when its hole pinches off, setCavityTimes).
//
// Under a gale (src/galeWaves.js) the water moves up and down. The stone
// meets it at the height of the waves under it (update's surfaceAt, the
// CPU's sum of the gale's waves), and from then on it moves as the splash
// does, on still water, its surface at 0: its position is in that frame,
// and it is drawn lifted as the gale lifts the splash (galeLift in
// src/shaders/scene.js): by the surface's height while above the still
// level, and under it by h·(1 + y/bed), the water column stretching between
// the fixed bed and the moving surface, so a stone on the bed stays put. Its
// two halves are cut at the water's height over it, and the half under the
// water is seen through a level surface there.
//
// The stone's properties at impact (`shape`, `contact`, `spin`, `lift` in the
// report), which make one splash unlike the next (src/splash.js), and `seed`,
// drawn when the stone is thrown, which seeds the splash's own random stream
// (so a seeded throw splashes alike however its flight was stepped):
//   - shape, once per stone (stoneShape): the solid's second moments,
//     integrated exactly over the faceted mesh as signed tetrahedra from the
//     origin, about its centroid; their eigenvectors are the principal axes,
//     long, middle and short, and an ellipsoid with the same moments has
//     semi-axes a ≥ b ≥ c = sqrt(5·λ) (λ the moments per unit volume), in
//     nominal radii. Elongation is 1 − b/a and flatness 1 − c/b (Zingg's
//     ratios, 0 for a ball; the river-stone squash makes flatness 0.1 to 0.4),
//     and irregularity the rms departure of the mesh's vertices from that
//     ellipsoid along their direction from the centroid (about 0.05 to 0.08:
//     the lumps the noise raises).
//   - contact: which part hits first, from the angle between the contact
//     normal (at the lowest point the surface faces straight down) and the
//     principal axes: the axis nearest the vertical says it, the short one a
//     flat face (`face`), the middle one the rim between the faces (`edge`),
//     the long one an end (`point`). Also the angles themselves (faceAngle:
//     the short axis from the vertical; pointAngle: the long one), and
//     bluntness, how flat the stone is where it touches: the footprint on the
//     water of the faces within BLUNT_BAND·R of the lowest point (each by the
//     share of its corners inside), against a ball's cap that deep (1 for a
//     ball, more for a broad face, less for a point or a ridge).
//   - spin: the tumble's rate (rad/s) and axis, the spin ratio ω·R/V (the
//     stone's surface speed over the entry speed: 0.02 to 0.15 for a 6 cm
//     stone thrown normally), the share of the spin about the entry direction
//     (alongEntry, the cosine between the two: a spin about the path rifles
//     the cavity, one across it makes the splash lopsided, Truscott & Techet
//     2009) and the stone's orientation then (a quaternion), from which the
//     cavity works out how the stone was turned as it passed each depth.
//   - lift: the sideways push the water gives the stone as it goes in, as a
//     lift coefficient C_L times a unit direction across the entry velocity
//     (two vectors: the shape's, kept, and the spin's, which fades with the
//     tumble), at most LIFT_CAP. A tilted flattened stone is a plate at an
//     angle of attack α: the water's pressure on its face pushes it along the
//     face's normal, sideways by FLAT_LIFT·(flatness + elongation/2)·sin 2α;
//     its lumps add a little in a random direction (IRREGULAR_LIFT times the
//     irregularity); a spinning one is pushed along ω × v (the Magnus
//     direction, which Truscott & Techet find for spheres entering water) by
//     SPIN_LIFT·ω·R/V. sinkStep applies C_L·(3/8)·(ρw/ρs)·v²/R across the path
//     (the drag's form with C_L for C_d), so a stone with C_L 0.2 bends its
//     path by about 10° over its first six radii.
//
// Skipping (a Skip throw, src/main.js skipThrow). The thrower picks a flat
// stone (createRockGeometry's `flat`: the short axis squashed to
// SKIP_STONE.squash of the long one, its surface noise SKIP_STONE.surfaceNoise
// of a river stone's) and lets it go low and fast (launchSkip, at the
// velocity skipLaunch finds for the tapped point), its face nose-up by
// SKIP_TILT along the throw (about the "magic angle" of Clanet, Hersen &
// Bocquet 2004) and never to either side, spinning at SKIP_SPIN about its
// short axis, which holds the face's tilt in flight (a gyroscope: the spin
// is about the face's normal, so the tumble keeps the normal where it is).
// When it touches the water the contact
// is worked out at once to its end (skim, on the CPU, in steps of SKIM.step),
// much as Bocquet (2003) and Clanet et al. model it: the face is a disc of
// the stone's area (radius R·sqrt(a·b)), its wetted part the segment the
// water cuts off it as the stone sinks d below where it touched (a chord
// d/sin α deep, α the face's tilt from level), and the water pushes it along
// the face's normal by ½·ρ·SKIM.pressure·|v|²·(wetted area) while the face
// moves into it, times sin(α + λ·(θ − α))/sin α (λ = SKIM.fade, θ the angle
// the water meets the face at: α plus the angle the stone comes down at,
// less the angle it climbs at), and drags it along the face by
// ½·ρ·SKIM.friction·|v|²·(wetted area), the water it throws aside. Bocquet's
// push (λ = 0, with little drag) gives back nearly all the speed it took:
// every hop came out as tall as the last for its length, 15 and 10 cm high
// on a normal throw's second and third, and they looked bouncy, hanging in
// the air; with all of sin θ (λ = 1) each hop came out flatter than the last
// until the stone seemed to hover. With λ = 0.3 and the drag, every touch
// takes off about as much of the speed along the water as of the speed up
// from it, so each hop is an arc of much the same shape as the last at about
// six tenths its size, the touches coming quicker and quicker (a normal
// throw: 2.7 m long and 16 cm high, then 1.6 m and 9 cm, 0.9 m and 5 cm,
// 0.6 m and 3 cm). Gravity acts on the stone's own mass
// (trueMass, from its volume: a thin stone is light for its face). The
// contact ends one of two ways:
//   - a skip: the stone rises back out (d ≤ 0, moving up) at SKIM.leastExit
//     or more above level. It follows the contact's path (kept every
//     SKIM.sample, played back in the `skim` state), then flies on; the
//     touch is reported (`skim: true`, skimReport) so the splash draws its
//     ring and spray (src/splash.js skim). Each skip leaves the spin
//     SKIP_SPIN_KEPT of what it was and pitches the face by a random
//     SKIP_WOBBLE.degrees·(SKIP_WOBBLE.reference/ω) about the level axis
//     across its path: the slower it spins, the more it wobbles. Nothing
//     leans the face to either side: its normal, along which the water
//     pushes, stays in the vertical plane the stone was thrown in, and the
//     drag is along its path, so the stone stays in that plane (only a
//     pool's wall turns it).
//   - it goes in: its face goes wholly under (the chord reaches across it),
//     the contact lasts SKIM.longest, the stone slows below SKIM.slowest
//     along the water, its face is pitched nose-up by less than
//     SKIM.leastPitch (the leading edge catches), it would leave flatter
//     than SKIM.leastExit (it would only glide on), or in a pool it would
//     run into a wall (`skip.inside`, which src/main.js gives it; a touch
//     beyond a wall is left to the wall, src/pool.js). Then the touch is the
//     stone's impact, as for any throw (`water`, the splash built from it),
//     but for its lift under water, whose push across the throw's plane is
//     left out (its fast spin would curve it off to one side).
// The model has Clanet et al.'s magic angle: thrown normally (10 m/s, 30 cm
// up) the first hop is longest with the face at about 15° and the stone
// skips most often from 15° to 20° (five times), less either side (three at
// 10° and at 30°), and below about 7° it digs in at its first touch.
// tools/skip-probe.mjs prints what it does.
//
// The stone is two meshes: the part above the water in the main scene, the
// part below in the under-water pass (src/main.js), which the water shader
// shows through the surface. Below the water it is drawn where it is seen
// through the still surface (SEEN_THROUGH_WATER, src/shaders/scene.js), not
// on the straight line from the camera, once the water has closed over it:
// while its cavity is open (src/cavity.js) it is in air, seen through the
// hole, and drawn where it is; from the pinch-off, over NECK_CLOSE·sqrt(R/g)
// as the neck closes over it, it moves over to where the water shows it. The
// pinch-off is its cavity's (setCavityTimes, which the splash calls with the
// report's `rock`), PINCH_TIME·sqrt(R/g) after the impact until then. Seen
// from an eye under the water (src/main.js's Under view) it is drawn where it
// is, faded into the water's colour (waterFog) with the distance.
import * as THREE from 'three';
import { SEEN_THROUGH_WATER } from './shaders/scene.js';
import { PINCH_TIME, NECK_CLOSE, SPIN_DECAY, sinkStep } from './cavity.js';

const ROCK_DENSITY = 2600;
const GRAVITY = 9.81;
const SPIN_LEAST = 5;              // rad/s: the tumble in flight, from this...
const SPIN_MOST = 30;              // ...to this, most stones slow (the draw is skewed by SPIN_SKEW)
const SPIN_SKEW = 1.5;
const BLUNT_BAND = 0.1;            // in R: the band above the lowest point whose vertices measure bluntness
const FLAT_LIFT = 0.5;             // the lift of a tilted flattened stone, times (flatness + elongation/2)·sin 2α...
const IRREGULAR_LIFT = 0.8;        // ...of its lumps, times its irregularity, in a random direction...
const SPIN_LIFT = 0.6;             // ...and of its spin, times ω·R/V along ω × v
const LIFT_CAP = 0.35;             // at most this C_L in all
const CREST_REACH = 0.6;           // m: under a gale, no crest reaches higher than this above the still water
// Skipping (the header).
const WATER_DENSITY = 1000;
export const SKIM = {
  pressure: 2.0,      // C: the push along the face's normal, ½·ρ·C·|v|²·(wetted area) (the header)...
  friction: 0.3,      // ...C_f, the drag along the face...
  fade: 0.3,          // ...and λ, how the push follows the angle the water meets the face at: sin(α + λ·(θ − α)) / sin α (the header)
  step: 5e-5,         // s: the contact's integration step...
  sample: 5e-4,       // ...and its path kept this often, for playback
  longest: 0.25,      // s: a contact this long has stopped skimming: the stone goes in...
  slowest: 0.5,       // m/s: ...as does one this slow along the water...
  leastPitch: 2,      // degrees: ...one whose face is pitched nose-up less than this (its leading edge catches)...
  leastExit: 6,       // degrees: ...and one that would leave flatter than this (it would only glide on: a hop under 1/40 as high as it is long)
  leastTilt: 3,       // degrees: the wetted chord is d/sin α with α at least this
};
const SKIP_STONE = { squash: [0.26, 0.12], surfaceNoise: 0.6 };   // a flat stone's short axis: 0.26 to 0.38 of its long one (a river stone's 0.62 to 0.82); its surface noise, of a river stone's
const SKIP_TILT = { mean: 20, spread: 6, least: 4, most: 40 };   // degrees: the face nose-up along the throw (a normal draw, clamped)
const SKIP_SPIN = { least: 60, most: 110 };                 // rad/s about the short axis (10 to 17 turns a second)
const SKIP_WOBBLE = { degrees: 3, reference: 80 };          // each skip pitches the face by about this (σ), times reference/ω
const SKIP_SPIN_KEPT = 0.85;                                // of the spin left after each skip
const rockRotation = new THREE.Matrix4();

/** A standard normal draw (Box–Muller, from Math.random). */
function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** The area of the segment a chord `depth` in from its edge cuts off a disc of `radius`. */
function discSegment(radius, depth) {
  const inside = Math.min(Math.max(depth, 0), 2 * radius);
  const offset = radius - inside;
  return radius * radius * Math.acos(offset / radius) - offset * Math.sqrt(Math.max(radius * radius - offset * offset, 0));
}

/**
 * The velocity a skip throw leaves `from` with at `speed` to come down on the
 * water (y = 0) at `to`: the lower of the two arcs, in a vacuum (the air's
 * drag on a stone is tiny); beyond the farthest it can reach, that arc.
 */
export function skipLaunch(from, to, speed) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const height = from.y - to.y;
  const reach = (elevation) => {
    const along = speed * Math.cos(elevation), up = speed * Math.sin(elevation);
    return (along * (up + Math.sqrt(up * up + 2 * GRAVITY * Math.max(height, 0)))) / GRAVITY;
  };
  // The reach grows with the elevation up to the farthest arc's (under 45° from above the water), found first.
  let low = 0, high = Math.PI / 4;
  for (let step = 0; step < 50; step++) {
    const third = (high - low) / 3;
    if (reach(low + third) < reach(high - third)) low += third; else high -= third;
  }
  const farthest = 0.5 * (low + high);
  low = -Math.PI / 3; high = farthest;
  for (let step = 0; step < 50; step++) {
    const middle = 0.5 * (low + high);
    if (reach(middle) < distance) low = middle; else high = middle;
  }
  const elevation = 0.5 * (low + high);
  const headingX = (to.x - from.x) / Math.max(distance, 1e-9), headingZ = (to.z - from.z) / Math.max(distance, 1e-9);
  const along = speed * Math.cos(elevation);
  return new THREE.Vector3(headingX * along, speed * Math.sin(elevation), headingZ * along);
}

function hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let result = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const weight = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    result += weight * hash3(ix + dx, iy + dy, iz + dz);
  }
  return result;
}

/**
 * Stone of unit nominal radius, flattened like a river stone: a sphere
 * pushed out and in by two noises (its lumps), squashed. Scale by the real
 * radius. The mesh is a list of separate triangles (the stone's shape and
 * contact are integrated over them) with its normals the smooth surface's,
 * found from the same function a little to either side of each vertex, so
 * it reads as worn stone rather than facets even at 30 cm; its colour is a
 * fine speckle over a faint tint for each face. The random draws (the squash,
 * then two for each face's tint) are the ones the faceted stone made, so a
 * seeded throw keeps its stone and its splash (tools/variety-probe.mjs).
 * A `flat` stone, picked for skipping (the header), takes the same draws,
 * squashed to SKIP_STONE.squash and its surface noise SKIP_STONE.surfaceNoise as high.
 */
export function createRockGeometry(seed = Math.random() * 1000, { flat = false } = {}) {
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const positions = geometry.attributes.position;
  const [flatLeast, flatSpread] = SKIP_STONE.squash;
  const squash = new THREE.Vector3(1.0, flat ? flatLeast + flatSpread * Math.random() : 0.62 + 0.2 * Math.random(), 0.8 + 0.2 * Math.random());
  const surfacePoint = (direction, out) => {
    const coarse = valueNoise3(direction.x * 1.6 + seed, direction.y * 1.6, direction.z * 1.6) - 0.5;
    const fine = valueNoise3(direction.x * 4.5 + seed, direction.y * 4.5 + 3.1, direction.z * 4.5) - 0.5;
    const radialScale = flat ? 1 + SKIP_STONE.surfaceNoise * (0.42 * coarse + 0.14 * fine) : 1 + 0.42 * coarse + 0.14 * fine;
    return out.copy(direction).multiplyScalar(radialScale).multiply(squash);
  };
  const normals = new Float32Array(positions.count * 3);
  const colors = new Float32Array(positions.count * 3);
  const direction = new THREE.Vector3(), tangent = new THREE.Vector3(), bitangent = new THREE.Vector3();
  const point = new THREE.Vector3(), aside = new THREE.Vector3(), alongTangent = new THREE.Vector3(), alongBitangent = new THREE.Vector3();
  const step = 0.01;
  for (let face = 0; face < positions.count / 3; face++) {
    const faceTint = 0.82 + 0.36 * Math.random();
    const faceWarm = 0.96 + 0.08 * Math.random();
    for (let corner = 0; corner < 3; corner++) {
      const vertex = face * 3 + corner;
      direction.fromBufferAttribute(positions, vertex).normalize();
      surfacePoint(direction, point);
      tangent.set(-direction.z, 0, direction.x);
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
      tangent.normalize();
      bitangent.crossVectors(direction, tangent);
      surfacePoint(aside.copy(direction).addScaledVector(tangent, step).normalize(), alongTangent).sub(point);
      surfacePoint(aside.copy(direction).addScaledVector(bitangent, step).normalize(), alongBitangent).sub(point);
      const normal = aside.crossVectors(alongBitangent, alongTangent).normalize();
      if (normal.dot(direction) < 0) normal.negate();
      positions.setXYZ(vertex, point.x, point.y, point.z);
      normals[vertex * 3] = normal.x; normals[vertex * 3 + 1] = normal.y; normals[vertex * 3 + 2] = normal.z;
      // A fine speckle of darker and lighter grains over the face's faint tint.
      const speckle = 0.78 + 0.42 * valueNoise3(direction.x * 22 + seed, direction.y * 22, direction.z * 22 + 5.3);
      const tint = 0.75 * speckle + 0.25 * faceTint;
      const warm = 0.75 + 0.25 * faceWarm;
      colors[vertex * 3] = tint * (0.25 + warm); colors[vertex * 3 + 1] = tint; colors[vertex * 3 + 2] = tint * (1.75 - warm);
    }
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Eigenvalues and unit eigenvectors of a symmetric 3×3 matrix (row-major
 * array of 9), by Jacobi rotations; sorted from the largest eigenvalue down.
 */
function symmetricEigen(matrix) {
  const values = matrix.slice();
  const vectors = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 16; sweep++) {
    const offDiagonal = Math.abs(values[1]) + Math.abs(values[2]) + Math.abs(values[5]);
    if (offDiagonal < 1e-14) break;
    for (const [first, second] of [[0, 1], [0, 2], [1, 2]]) {
      const pivot = values[first * 3 + second];
      if (Math.abs(pivot) < 1e-16) continue;
      const theta = (values[second * 3 + second] - values[first * 3 + first]) / (2 * pivot);
      const tangent = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cosine = 1 / Math.sqrt(tangent * tangent + 1);
      const sine = tangent * cosine;
      // values ← Jᵀ·values·J and vectors ← vectors·J for the rotation J in the (first, second) plane.
      for (let index = 0; index < 3; index++) {
        const atFirst = values[index * 3 + first], atSecond = values[index * 3 + second];
        values[index * 3 + first] = cosine * atFirst - sine * atSecond;
        values[index * 3 + second] = sine * atFirst + cosine * atSecond;
      }
      for (let index = 0; index < 3; index++) {
        const atFirst = values[first * 3 + index], atSecond = values[second * 3 + index];
        values[first * 3 + index] = cosine * atFirst - sine * atSecond;
        values[second * 3 + index] = sine * atFirst + cosine * atSecond;
      }
      for (let index = 0; index < 3; index++) {
        const atFirst = vectors[index * 3 + first], atSecond = vectors[index * 3 + second];
        vectors[index * 3 + first] = cosine * atFirst - sine * atSecond;
        vectors[index * 3 + second] = sine * atFirst + cosine * atSecond;
      }
    }
  }
  const pairs = [0, 1, 2].map((index) => ({ value: values[index * 4], vector: new THREE.Vector3(vectors[index], vectors[3 + index], vectors[6 + index]).normalize() }));
  return pairs.sort((first, second) => second.value - first.value);
}

/**
 * The stone's shape (the header), in its own frame and in nominal radii: the
 * centroid, the principal axes long to short with the semi-axes a ≥ b ≥ c of
 * the ellipsoid with the same second moments, elongation 1 − b/a, flatness
 * 1 − c/b and irregularity, the rms departure of the vertices from that
 * ellipsoid.
 */
export function stoneShape(geometry) {
  const positions = geometry.attributes.position.array;
  let volume = 0;
  let centroidX = 0, centroidY = 0, centroidZ = 0;
  const moments = new Float64Array(9);   // ∫ x·xᵀ dV about the origin
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const bx = positions[index + 3], by = positions[index + 4], bz = positions[index + 5];
    const cx = positions[index + 6], cy = positions[index + 7], cz = positions[index + 8];
    // A tetrahedron from the origin to the face: signed volume a·(b × c)/6.
    const tetrahedron = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    volume += tetrahedron;
    const sumX = ax + bx + cx, sumY = ay + by + cy, sumZ = az + bz + cz;
    centroidX += tetrahedron * sumX / 4; centroidY += tetrahedron * sumY / 4; centroidZ += tetrahedron * sumZ / 4;
    // Its second moment with one corner at the origin: V/20·(Σ p·pᵀ + (Σ p)(Σ p)ᵀ).
    const corners = [ax, ay, az, bx, by, bz, cx, cy, cz];
    const sums = [sumX, sumY, sumZ];
    for (let row = 0; row < 3; row++) {
      for (let column = row; column < 3; column++) {
        let sum = sums[row] * sums[column];
        for (let corner = 0; corner < 3; corner++) sum += corners[corner * 3 + row] * corners[corner * 3 + column];
        moments[row * 3 + column] += (tetrahedron / 20) * sum;
      }
    }
  }
  centroidX /= volume; centroidY /= volume; centroidZ /= volume;
  const centroid = [centroidX, centroidY, centroidZ];
  const central = new Array(9);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const upper = row <= column ? moments[row * 3 + column] : moments[column * 3 + row];
      central[row * 3 + column] = upper / volume - centroid[row] * centroid[column];
    }
  }
  const [long, middle, short] = symmetricEigen(central);
  const semiAxes = [long, middle, short].map((pair) => Math.sqrt(5 * Math.max(pair.value, 1e-9)));
  const axes = [long.vector, middle.vector, short.vector];
  // Irregularity: each vertex's distance from the centroid against the ellipsoid's radius in its direction.
  let sumSquares = 0;
  const count = positions.length / 3;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] - centroidX, y = positions[index + 1] - centroidY, z = positions[index + 2] - centroidZ;
    const distance = Math.hypot(x, y, z);
    if (distance < 1e-9) continue;
    let inverseSquare = 0;
    for (let axis = 0; axis < 3; axis++) {
      const along = (x * axes[axis].x + y * axes[axis].y + z * axes[axis].z) / distance;
      inverseSquare += (along * along) / (semiAxes[axis] * semiAxes[axis]);
    }
    const departure = distance * Math.sqrt(inverseSquare) - 1;
    sumSquares += departure * departure;
  }
  return {
    volume, centroid: new THREE.Vector3(centroidX, centroidY, centroidZ), axes, semiAxes,
    elongation: 1 - semiAxes[1] / semiAxes[0],
    flatness: 1 - semiAxes[2] / semiAxes[1],
    irregularity: Math.sqrt(sumSquares / count),
  };
}

export class Rock {
  /**
   * @param radius nominal radius in metres
   * @param envTexture environment map for lighting
   * @param skip a flat stone for a skip throw (the header), let go by launchSkip
   */
  constructor({ radius, position, velocity, envTexture, waterFog = null, skip = false }) {
    this.radius = radius;
    this.position = position.clone();
    this.previous = position.clone();   // where it was a step ago (src/pool.js holds a skipping stone in)
    this.velocity = velocity.clone();
    this.state = 'air';
    // A skip stone's state; `inside(x, z)`, given in a pool (src/main.js), says where its walls let it touch and skim.
    this.skip = skip ? { normal: new THREE.Vector3(0, 1, 0), skips: 0, contact: null, inside: null } : null;
    this.age = 0;
    this.restTime = 0;
    this.quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this.spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.spinRate = SPIN_LEAST + (SPIN_MOST - SPIN_LEAST) * Math.random() ** SPIN_SKEW;
    this.geometry = createRockGeometry(undefined, { flat: skip });
    this.geometry.computeBoundingSphere();
    this.reach = this.geometry.boundingSphere.center.length() + this.geometry.boundingSphere.radius;   // furthest any point gets from the centre, in radii
    this.shape = stoneShape(this.geometry);
    this.liftHeading = Math.random() * Math.PI * 2;   // the direction its lumps push it (the header)
    this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, time: 0, liftX: 0, liftY: 0, liftZ: 0, spinLiftX: 0, spinLiftY: 0, spinLiftZ: 0, resting: false, openUntil: undefined };
    this.impactStep = 0;
    const baseColor = new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.08 + Math.random() * 0.1, 0.3 + Math.random() * 0.14);
    // The seed of its splash's own random stream (src/splash.js), drawn now so
    // that a seeded throw splashes alike however its flight is stepped.
    this.splashSeed = Math.floor(Math.random() * 4294967296);
    const makeMaterial = (clipNormalY) => new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
      envMap: envTexture,
      envMapIntensity: 0.9,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, clipNormalY, 0), 0)],   // at the water's height under the stone (syncMeshes)
    });
    this.meshAbove = new THREE.Mesh(this.geometry, makeMaterial(1));
    this.meshBelow = new THREE.Mesh(this.geometry, makeMaterial(-1));
    this.meshBelow.material.envMapIntensity = 0.35;
    // Under the water: where the surface shows it (the header), by this much.
    const seenThroughWater = this.seenThroughWater = { value: 0 };
    const waterLevel = this.waterLevel = { value: 0 };   // the surface's height above the stone, under a gale
    this.sinceImpact = -1;
    this.cavityTimes = null;   // its cavity's pinch-off (s after the impact), once the splash says
    // Seen from an eye under the water, it fades into the water's colour with
    // the distance through it (as the floor does, UNDER_FOG in src/shaders/scene.js,
    // with the water's light looking level).
    const fogExtinction = { value: waterFog?.extinction ?? new THREE.Vector3() };
    const fogColor = { value: waterFog?.color ?? new THREE.Vector3() };
    this.meshBelow.material.onBeforeCompile = (shader) => {
      shader.uniforms.uSeenThroughWater = seenThroughWater;
      shader.uniforms.uWaterLevel = waterLevel;
      shader.uniforms.uFogExtinction = fogExtinction;
      shader.uniforms.uFogColor = fogColor;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uSeenThroughWater;\nuniform float uWaterLevel;\n${SEEN_THROUGH_WATER}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  vec3 trueWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  mvPosition = viewMatrix * vec4(mix(trueWorld, seenThroughWater(trueWorld, uWaterLevel), uSeenThroughWater), 1.0);
  gl_Position = projectionMatrix * mvPosition;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFogExtinction;\nuniform vec3 uFogColor;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
  if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));`);
    };
    this.meshBelow.material.customProgramCacheKey = () => 'seen-through-water';
    for (const mesh of [this.meshAbove, this.meshBelow]) {
      mesh.scale.setScalar(radius);
      mesh.frustumCulled = false;
    }
    this.syncMeshes();
  }

  get mass() { return ROCK_DENSITY * (4 / 3) * Math.PI * this.radius ** 3; }

  /** The stone's own mass (kg), from its volume (the skim's; `mass`, the nominal ball's, is the air drag's). */
  get trueMass() { return ROCK_DENSITY * this.shape.volume * this.radius ** 3; }

  /** The radius (m) of the disc with the area of its face: the ellipsoid's two long semi-axes' mean (the header). */
  get faceRadius() { return this.radius * Math.sqrt(this.shape.semiAxes[0] * this.shape.semiAxes[1]); }

  /**
   * Let a skip stone go at `velocity` (the header): its face tilted nose-up
   * along the throw by SKIP_TILT, never to either side, its long axis
   * anywhere in the face, spinning at SKIP_SPIN about its short axis.
   */
  launchSkip(velocity) {
    this.velocity.copy(velocity);
    const heading = new THREE.Vector3(velocity.x, 0, velocity.z).normalize();
    const side = new THREE.Vector3(-heading.z, 0, heading.x);
    const tilt = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(SKIP_TILT.mean + SKIP_TILT.spread * gaussian(), SKIP_TILT.least, SKIP_TILT.most));
    // The face's normal leans back against the throw (nose up), in the throw's vertical plane.
    const normal = new THREE.Vector3(0, Math.cos(tilt), 0).addScaledVector(heading, -Math.sin(tilt)).normalize();
    // The stone's frame (long, middle, short) onto the world's (a level-ish direction in the face, the one across, the normal).
    const [long, , short] = this.shape.axes;
    const middle = new THREE.Vector3().crossVectors(short, long).normalize();
    const turn = Math.random() * Math.PI * 2;
    const inFace = new THREE.Vector3().crossVectors(normal, side).normalize().applyAxisAngle(normal, turn);
    const across = new THREE.Vector3().crossVectors(normal, inFace);
    const world = new THREE.Matrix4().makeBasis(inFace, across, normal);
    const local = new THREE.Matrix4().makeBasis(long, middle, short).transpose();
    this.quaternion.setFromRotationMatrix(world.multiply(local));
    this.skip.normal.copy(normal);
    this.spinAxis.copy(normal);
    this.spinRate = SKIP_SPIN.least + (SKIP_SPIN.most - SKIP_SPIN.least) * Math.random();
    this.syncMeshes();
  }

  /**
   * The contact of a skip stone that has just touched the water, worked out
   * to its end (the header): whether it skips, how long it lasts, its path
   * (every SKIM.sample: time, position, velocity) and how it leaves. Under a
   * gale the water is taken as level at `surface`, its height where the
   * stone touched, for the few hundredths of a second the contact lasts.
   */
  skim(surface = 0) {
    const normal = this.skip.normal;
    const mass = this.trueMass;
    const face = this.faceRadius;
    const tilt = Math.acos(Math.min(Math.abs(normal.y), 1));
    const chordPerDepth = 1 / Math.sin(Math.max(tilt, THREE.MathUtils.degToRad(SKIM.leastTilt)));
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(-(normal.x * this.velocity.x + normal.z * this.velocity.z) / Math.max(horizontal, 1e-9), -1, 1));
    let x = this.position.x, y = this.position.y, z = this.position.z;
    let vx = this.velocity.x, vy = this.velocity.y, vz = this.velocity.z;
    const top = y;
    const samples = [0, x, y, z, vx, vy, vz];
    let time = 0, nextSample = SKIM.sample;
    let skips = pitch >= THREE.MathUtils.degToRad(SKIM.leastPitch);
    while (skips) {
      const chord = (top - y) * chordPerDepth;
      if (chord >= 2 * face || time >= SKIM.longest || Math.hypot(vx, vz) < SKIM.slowest) { skips = false; break; }
      if (this.skip.inside && !this.skip.inside(x, z)) { skips = false; break; }
      const dynamic = 0.5 * WATER_DENSITY * (vx * vx + vy * vy + vz * vz) * discSegment(face, chord) / mass;
      const intoFace = vx * normal.x + vy * normal.y + vz * normal.z;
      let ax = 0, ay = -GRAVITY, az = 0;
      if (intoFace < 0) {
        // The push fades as the stone climbs towards its tilt (the header): sin(α + λ·(θ − α)) of it over sin α.
        const meets = Math.asin(Math.min(-intoFace / Math.sqrt(vx * vx + vy * vy + vz * vz), 1));
        const push = SKIM.pressure * dynamic * Math.max(Math.sin(tilt + SKIM.fade * (meets - tilt)), 0) / Math.sin(Math.max(tilt, 1e-3));
        ax += push * normal.x; ay += push * normal.y; az += push * normal.z;
      }
      const tangentX = vx - intoFace * normal.x, tangentY = vy - intoFace * normal.y, tangentZ = vz - intoFace * normal.z;
      const tangent = Math.hypot(tangentX, tangentY, tangentZ);
      if (tangent > 1e-9) { const drag = SKIM.friction * dynamic / tangent; ax -= drag * tangentX; ay -= drag * tangentY; az -= drag * tangentZ; }
      vx += ax * SKIM.step; vy += ay * SKIM.step; vz += az * SKIM.step;
      x += vx * SKIM.step; y += vy * SKIM.step; z += vz * SKIM.step;
      time += SKIM.step;
      if (time >= nextSample) { samples.push(time, x, y, z, vx, vy, vz); nextSample += SKIM.sample; }
      if (y >= top && vy > 0) break;
    }
    // Out of the water too flat, it only glides on and digs in: it goes in at its touch instead.
    if (skips && Math.atan2(vy, Math.hypot(vx, vz)) < THREE.MathUtils.degToRad(SKIM.leastExit)) skips = false;
    if (samples[samples.length - 7] < time) samples.push(time, x, y, z, vx, vy, vz);
    return {
      skips, duration: time, samples: Float32Array.from(samples), age: 0, surface,
      exitPosition: new THREE.Vector3(x, y, z), exitVelocity: new THREE.Vector3(vx, vy, vz),
    };
  }

  /** Where the contact's path has the stone at `age` (s since it touched), into `position` and `velocity`. */
  skimAt(contact, age, position, velocity) {
    const samples = contact.samples;
    const count = samples.length / 7;
    // Samples come every SKIM.sample, but for the last.
    let index = THREE.MathUtils.clamp(Math.floor(age / SKIM.sample) - 1, 0, count - 2);
    while (index < count - 2 && samples[(index + 1) * 7] < age) index++;
    while (index > 0 && samples[index * 7] > age) index--;
    const from = index * 7, to = from + 7;
    const share = THREE.MathUtils.clamp((age - samples[from]) / Math.max(samples[to] - samples[from], 1e-9), 0, 1);
    const lerp = (offset) => samples[from + offset] + (samples[to + offset] - samples[from + offset]) * share;
    position.set(lerp(1), lerp(2), lerp(3));
    velocity.set(lerp(4), lerp(5), lerp(6));
  }

  /** Off the water after a skip (the header): its spin slower, its face pitched by a wobble. */
  afterSkip() {
    this.skip.skips++;
    this.spinRate *= SKIP_SPIN_KEPT;
    // About the level axis across its path: the tilt changes, not the lean to either side, so the path stays straight.
    const along = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    const axis = new THREE.Vector3(-this.velocity.z / along, 0, this.velocity.x / along);
    const angle = THREE.MathUtils.degToRad(SKIP_WOBBLE.degrees * gaussian()) * (SKIP_WOBBLE.reference / Math.max(this.spinRate, 1));
    const wobble = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.skip.normal.applyQuaternion(wobble);
    this.quaternion.premultiply(wobble);
    this.spinAxis.copy(this.skip.normal);
  }

  /**
   * How far the stone's ellipsoid (its shape's) reaches below its origin (m),
   * as it is turned now: a smooth stand-in for lowestOffset's walk over the
   * lumpy mesh, cheap enough for every step (src/pool.js: a stone tumbling
   * along the deck).
   */
  ellipsoidDepth() {
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    let sum = 0;
    this.shape.axes.forEach((axis, index) => { sum += (this.shape.semiAxes[index] * (rowX * axis.x + rowY * axis.y + rowZ * axis.z)) ** 2; });
    const centroid = this.shape.centroid;
    return this.radius * (Math.sqrt(sum) - (rowX * centroid.x + rowY * centroid.y + rowZ * centroid.z));
  }

  /** Come to rest where it is, its lowest point at `height` (src/pool.js: a stone skipped out onto the deck). */
  restOn(height) {
    this.position.y = height - this.lowestOffset();
    this.velocity.set(0, 0, 0);
    this.state = 'rest';
    this.syncMeshes();
  }

  /** Height of the stone's lowest point below its centre (negative, metres), as it is turned now. */
  lowestOffset() {
    const positions = this.geometry.attributes.position.array;
    // The world height of a mesh point is the rotation's second row dotted with it.
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    let lowest = 0;
    for (let index = 0; index < positions.length; index += 3) {
      lowest = Math.min(lowest, rowX * positions[index] + rowY * positions[index + 1] + rowZ * positions[index + 2]);
    }
    return lowest * this.radius;
  }

  /**
   * Which part of the stone touches first, as it is turned now (the header):
   * the kind, the short and long axes' angles from the vertical (degrees) and
   * the bluntness there.
   */
  contact() {
    const positions = this.geometry.attributes.position.array;
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    // The world's down in the stone's frame is minus the rotation's second row.
    const down = new THREE.Vector3(-rowX, -rowY, -rowZ);
    const alignment = this.shape.axes.map((axis) => Math.abs(axis.dot(down)));
    const nearest = alignment.indexOf(Math.max(...alignment));
    let lowest = Infinity;
    for (let index = 0; index < positions.length; index += 3) lowest = Math.min(lowest, rowX * positions[index] + rowY * positions[index + 1] + rowZ * positions[index + 2]);
    // The faces within BLUNT_BAND of the lowest point, by the share of their
    // corners inside it, projected on the water: the footprint of the part
    // that goes in first.
    const acrossX = [rotation[0], rotation[4], rotation[8]], acrossZ = [rotation[2], rotation[6], rotation[10]];
    let footprint = 0;
    for (let index = 0; index < positions.length; index += 9) {
      let inside = 0;
      const projected = [];
      for (let corner = 0; corner < 3; corner++) {
        const offset = index + corner * 3;
        const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
        if (rowX * x + rowY * y + rowZ * z <= lowest + BLUNT_BAND) inside++;
        projected.push(acrossX[0] * x + acrossX[1] * y + acrossX[2] * z, acrossZ[0] * x + acrossZ[1] * y + acrossZ[2] * z);
      }
      if (inside === 0) continue;
      const area = 0.5 * Math.abs((projected[2] - projected[0]) * (projected[5] - projected[1]) - (projected[4] - projected[0]) * (projected[3] - projected[1]));
      footprint += area * inside / 3;
    }
    // A ball's cap BLUNT_BAND deep covers π·(2·BLUNT_BAND − BLUNT_BAND²) of the water.
    return {
      kind: ['point', 'edge', 'face'][nearest],
      faceAngle: THREE.MathUtils.radToDeg(Math.acos(Math.min(alignment[2], 1))),
      pointAngle: THREE.MathUtils.radToDeg(Math.acos(Math.min(alignment[0], 1))),
      bluntness: footprint / (Math.PI * (2 * BLUNT_BAND - BLUNT_BAND * BLUNT_BAND)),
    };
  }

  /**
   * The sideways push the water gives the stone (the header): the shape's
   * lift and the spin's, each C_L times a unit direction across the entry
   * velocity, together at most LIFT_CAP.
   */
  liftAt(velocity) {
    const speed = Math.max(velocity.length(), 1e-6);
    const along = velocity.clone().divideScalar(speed);
    const across = (vector) => vector.addScaledVector(along, -vector.dot(along));
    // A tilted flattened stone: its face's normal, turned to face the oncoming water, pushes it along itself.
    const normal = this.shape.axes[2].clone().applyQuaternion(this.quaternion);
    if (normal.dot(along) > 0) normal.negate();
    const attack = Math.asin(Math.min(Math.abs(normal.dot(along)), 1));   // the face from the direction of travel
    const shapeLift = across(normal.clone());
    if (shapeLift.lengthSq() > 1e-12) shapeLift.normalize().multiplyScalar(FLAT_LIFT * (this.shape.flatness + 0.5 * this.shape.elongation) * Math.abs(Math.sin(2 * attack)));
    else shapeLift.set(0, 0, 0);
    // Its lumps, in a direction of its own.
    const lumps = across(new THREE.Vector3(Math.cos(this.liftHeading), 0.3 * Math.sin(3 * this.liftHeading), Math.sin(this.liftHeading)));
    if (lumps.lengthSq() > 1e-12) shapeLift.addScaledVector(lumps.normalize(), IRREGULAR_LIFT * this.shape.irregularity);
    // The spin: along ω × v.
    const magnus = this.spinAxis.clone().cross(along);
    const spinLift = magnus.lengthSq() > 1e-12 ? magnus.normalize().multiplyScalar(SPIN_LIFT * this.spinRate * this.radius / speed) : magnus.set(0, 0, 0);
    const total = shapeLift.clone().add(spinLift).length();
    if (total > LIFT_CAP) { shapeLift.multiplyScalar(LIFT_CAP / total); spinLift.multiplyScalar(LIFT_CAP / total); }
    return { shape: shapeLift, spin: spinLift };
  }

  /**
   * The splash's cavity for this stone pinches off this many seconds after the
   * impact (on the splash's clock, which starts a substep before the stone's
   * own under water): its head acts until then (sinkStep), and it is seen
   * through the water from then on.
   */
  setCavityTimes(pinchTime) {
    this.cavityTimes = { pinchTime };
    this.body.openUntil = pinchTime - this.impactStep;
  }

  /**
   * The meshes where the stone is drawn: in the air where it is; in the water
   * lifted as the gale lifts the splash (the header), its halves cut at the
   * water's height `surface` over it.
   */
  syncMeshes(surface = 0, bedDepth = 1) {
    let lift = 0;
    // On still water (in it or on its bed) it rides the gale's lift; in the air and skimming it is where it is.
    const stillWater = this.state === 'water' || this.state === 'rest';
    if (stillWater && surface !== 0) lift = this.position.y >= 0 ? surface : surface * Math.max(1 + this.position.y / bedDepth, 0);
    for (const mesh of [this.meshAbove, this.meshBelow]) {
      mesh.position.set(this.position.x, this.position.y + lift, this.position.z);
      mesh.quaternion.copy(this.quaternion);
    }
    this.meshAbove.material.clippingPlanes[0].constant = -surface;   // keeps y ≥ surface
    this.meshBelow.material.clippingPlanes[0].constant = surface;    // keeps y ≤ surface
    this.waterLevel.value = surface;
  }

  /**
   * Into the water from where the stone is, at its velocity: its path under
   * water starts (sinkStep) and the impact the splash is built from is
   * returned. `dt` is the step it touched in, `surface` the water's height
   * there (under a gale; the header).
   */
  goIn(dt, surface = 0) {
    this.state = 'water';
    // From here on it moves on still water, as the splash does (the header).
    this.position.y -= surface;
    const speed = this.velocity.length();
    const lift = this.liftAt(this.velocity);
    if (this.skip) {
      // A skip stone stays in the vertical plane it was thrown in (the header): its lift's push across it is left out.
      const along = Math.hypot(this.velocity.x, this.velocity.z) || 1;
      const acrossX = -this.velocity.z / along, acrossZ = this.velocity.x / along;
      for (const push of [lift.shape, lift.spin]) {
        const sideways = push.x * acrossX + push.z * acrossZ;
        push.x -= sideways * acrossX;
        push.z -= sideways * acrossZ;
      }
    }
    // Its hole is open, and its head acts, until the pinch-off: PINCH_TIME·sqrt(R/g) until the splash says (setCavityTimes).
    this.impactStep = dt;
    Object.assign(this.body, {
      x: this.position.x, y: this.position.y, z: this.position.z, vx: this.velocity.x, vy: this.velocity.y, vz: this.velocity.z, time: 0,
      liftX: lift.shape.x, liftY: lift.shape.y, liftZ: lift.shape.z, spinLiftX: lift.spin.x, spinLiftY: lift.spin.y, spinLiftZ: lift.spin.z, resting: false,
      openUntil: PINCH_TIME * Math.sqrt(this.radius / GRAVITY) - dt,
    });
    return {
      x: this.position.x,
      z: this.position.z,
      height: this.position.y,   // of the centre, above the water
      speed,
      velocity: this.velocity.clone(),
      radius: this.radius,
      shape: this.shape,
      contact: this.contact(),
      spin: {
        rate: this.spinRate,
        axis: this.spinAxis.clone(),
        ratio: (this.spinRate * this.radius) / Math.max(speed, 1e-6),
        alongEntry: this.spinAxis.dot(this.velocity) / Math.max(speed, 1e-6),
        orientation: this.quaternion.clone(),
      },
      lift: { shape: lift.shape, spin: lift.spin },
      seed: this.splashSeed,
      rock: this,
    };
  }

  /**
   * A skip's touch, for the splash (src/splash.js skim): where the stone
   * touched and left (its centre over the water), its velocity in and out,
   * how long the contact lasted, the face's radius, the stone's mass, the
   * upward push the water gave it (N·s, gravity's share over the contact
   * included), the speed a ball of the face's radius would carry that push
   * at (pushSpeed: an entry's ring is fitted for a ball, src/splash.js RING)
   * and how many skips came before.
   */
  skimReport(contact) {
    const mass = this.trueMass;
    const face = this.faceRadius;
    const push = mass * (contact.exitVelocity.y - this.velocity.y + GRAVITY * contact.duration);
    return {
      skim: true,
      x: this.position.x, z: this.position.z, exitX: contact.exitPosition.x, exitZ: contact.exitPosition.z,
      velocity: this.velocity.clone(), exitVelocity: contact.exitVelocity.clone(), duration: contact.duration,
      radius: face, mass, push, pushSpeed: push / (ROCK_DENSITY * (4 / 3) * Math.PI * face ** 3),
      skips: this.skip.skips, rock: this,
    };
  }

  /**
   * Advance by dt seconds. Returns an impact description the first time the
   * stone goes into the water, a skip's touch (skimReport) each time a skip
   * stone skips off it, otherwise null. surfaceAt(x, z), under a gale, is
   * the water's height there (m); null for still water.
   */
  update(dt, pondDepth, surfaceAt = null) {
    let surface = 0;
    this.age += dt;
    this.previous.copy(this.position);
    let impact = null;
    if (this.state === 'air') {
      const speed = this.velocity.length();
      // Air drag on a stone: tiny but keeps long throws honest.
      const dragAcceleration = 0.5 * 1.2 * 0.47 * Math.PI * this.radius ** 2 * speed / this.mass;
      this.velocity.addScaledVector(this.velocity, -dragAcceleration * dt);
      this.velocity.y -= GRAVITY * dt;
      this.position.addScaledVector(this.velocity, dt);
      // Only near the water is the mesh worth walking for its lowest point.
      if (surfaceAt && this.position.y <= this.reach * this.radius + CREST_REACH) surface = surfaceAt(this.position.x, this.position.z);
      const touching = this.position.y - surface <= this.reach * this.radius && this.position.y + this.lowestOffset() <= surface;
      // A skip stone's contact is worked out at once: if it skips, the stone follows it (`skim`) and the touch is reported.
      // In a pool, a touch beyond a wall is the wall's (src/pool.js turns the stone back off it).
      const walled = this.skip?.inside && !this.skip.inside(this.position.x, this.position.z);
      const contact = touching && this.velocity.y < 0 && this.skip && !walled ? this.skim(surface) : null;
      if (contact?.skips) {
        this.state = 'skim';
        this.skip.contact = contact;
        impact = this.skimReport(contact);
      } else if (touching && this.velocity.y < 0 && !walled) {
        impact = this.goIn(dt, surface);
      }
    } else if (this.state === 'skim') {
      // Along the contact's path, then off the water again.
      const contact = this.skip.contact;
      surface = contact.surface;
      contact.age += dt;
      if (contact.age < contact.duration) this.skimAt(contact, contact.age, this.position, this.velocity);
      else {
        this.position.copy(contact.exitPosition);
        this.velocity.copy(contact.exitVelocity);
        this.state = 'air';
        this.skip.contact = null;
        this.afterSkip();
      }
    } else if (this.state === 'water') {
      // Drag, the sideways lift and buoyancy-reduced gravity (src/cavity.js, whose stone path is the same).
      const body = this.body;
      sinkStep(body, this.radius, dt, pondDepth);
      this.position.set(body.x, body.y, body.z);
      if (surfaceAt) surface = surfaceAt(body.x, body.z);
      this.velocity.set(body.vx, body.vy, body.vz);
      this.spinRate *= Math.exp(-SPIN_DECAY * dt);
      if (body.resting) this.state = 'rest';
    } else {
      this.restTime += dt;
    }
    if (this.state !== 'rest') {
      const spin = new THREE.Quaternion().setFromAxisAngle(this.spinAxis, this.spinRate * dt);
      this.quaternion.premultiply(spin);
    }
    // In its cavity's air until the pinch-off, under water once the surface has closed.
    if (impact) this.sinceImpact = 0;
    else if (this.sinceImpact >= 0) this.sinceImpact += dt;
    if (this.sinceImpact >= 0) {
      const timeUnit = Math.sqrt(this.radius / GRAVITY);
      const pinchTime = this.cavityTimes?.pinchTime ?? PINCH_TIME * timeUnit;
      const progress = THREE.MathUtils.clamp((this.sinceImpact - pinchTime) / (NECK_CLOSE * timeUnit), 0, 1);
      this.seenThroughWater.value = progress * progress * (3 - 2 * progress);
    }
    // The bed's depth (a number, or a function of x and z, as sinkStep takes it) only matters to a lifted stone.
    const bedDepth = surface === 0 || this.state === 'air' ? 1 : typeof pondDepth === 'function' ? pondDepth(this.position.x, this.position.z) : pondDepth;
    this.syncMeshes(surface, bedDepth);
    return impact;
  }

  dispose() {
    this.geometry.dispose();
    this.meshAbove.material.dispose();
    this.meshBelow.material.dispose();
  }
}
