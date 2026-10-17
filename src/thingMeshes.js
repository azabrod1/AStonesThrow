// The meshes things are drawn with (src/things.js `look.mesh`; src/rock.js
// builds each thrown thing's from here), each a builder registered by kind
// (registerMesh) that makes a unit-sized geometry for a definition and the
// material's colour for it. The kinds:
//   - stone: the procedural stone (createRockGeometry), lumpy, worn smooth,
//     speckled, in its kind's squash, lumps and colouring (`look.pattern`:
//     the river stone's, which is the stone there always was, slate,
//     granite, basalt, pumice; stoneColor), flat for a skip (SKIP_STONE);
//   - ball: an icosphere of SUBDIVISIONS painted per vertex
//     (createBallGeometry, `look.paint`: a basketball's seams, a tennis
//     ball's, a golf ball's dimples, a bowling ball's swirl and finger holes,
//     or plain in `look.color`), pressed in where it is grooved, dimpled or
//     drilled;
//   - apple: its sphere drawn in at the stalk and the calyx, red streaked
//     over yellow-green, and its stalk (createAppleGeometry);
//   - pizza: a disc turned from a profile, its crust, cheese, sauce and
//     pepperoni painted per vertex (createPizzaGeometry);
//   - gem: a brilliant cut (createGemGeometry: a table, a crown of facets,
//     the girdle, a pavilion to the culet), stretched by its `look.stretch`,
//     each facet's colour `look.color` at its own brightness, a diamond's
//     `look.fire` of them in the spectrum's colours.
// A new kind of look (a pizza's disc, a feather's vane) is a builder
// registered here; its definition then names it. Every geometry carries a
// colour per vertex and is drawn with the one material src/rock.js makes,
// so no kind compiles a program of its own (src/main.js warmUp).
import * as THREE from 'three';

/** An sRGB colour (0 to 255) in the linear values vertex colours take. */
export function linear(red, green, blue) { return new THREE.Color().setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace); }

const SUBDIVISIONS = 5;              // a ball's icosphere: 10242 vertices, 4 mm apart on a basketball
// A flat stone, picked for skipping (src/rock.js): its short axis 0.26 to 0.38 of its long one (a river stone's 0.62 to 0.82); its surface noise, of a river stone's.
export const SKIP_STONE = { squash: [0.26, 0.12], surfaceNoise: 0.6 };

const MESHES = new Map();

/**
 * Register a mesh's kind: `build(definition, { flat })` returns its unit-sized
 * geometry (a colour per vertex; for a stone, a list of separate triangles,
 * src/rock.js integrates its shape over them), `color(definition)` the
 * material's colour (drawn when the thing is made, after its geometry).
 */
export function registerMesh(kind, { build, color }) { MESHES.set(kind, { build, color }); }

/** The registered builder of a kind of mesh, or undefined. */
export function meshKind(kind) { return MESHES.get(kind); }

// ---- the stones ------------------------------------------------------------

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
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
 * squashed to SKIP_STONE.squash and its surface noise SKIP_STONE.surfaceNoise
 * as high. Another kind of stone (its definition's `look`, src/things.js) takes the same
 * draws, its squash from its own ranges ([y least, y spread, z least, z
 * spread], unless flat), its lumps `lumps` as high, and its colour
 * stoneColor's.
 */
export function createRockGeometry(seed = Math.random() * 1000, { flat = false, look = null } = {}) {
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const positions = geometry.attributes.position;
  const river = !look || look.pattern === 'river';
  const [flatLeast, flatSpread] = SKIP_STONE.squash;
  const squash = flat || river ? new THREE.Vector3(1.0, flat ? flatLeast + flatSpread * Math.random() : 0.62 + 0.2 * Math.random(), 0.8 + 0.2 * Math.random())
    : new THREE.Vector3(1.0, look.squash[0] + look.squash[1] * Math.random(), look.squash[2] + look.squash[3] * Math.random());
  const surfacePoint = (direction, out) => {
    const coarse = valueNoise3(direction.x * 1.6 + seed, direction.y * 1.6, direction.z * 1.6) - 0.5;
    const fine = valueNoise3(direction.x * 4.5 + seed, direction.y * 4.5 + 3.1, direction.z * 4.5) - 0.5;
    const radialScale = flat ? 1 + SKIP_STONE.surfaceNoise * (0.42 * coarse + 0.14 * fine)
      : river ? 1 + 0.42 * coarse + 0.14 * fine : 1 + look.lumps * (0.42 * coarse + 0.14 * fine);
    return out.copy(direction).multiplyScalar(radialScale).multiply(squash);
  };
  const tinted = new THREE.Color();
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
      if (!river) {
        stoneColor(look.pattern, direction, point, seed, faceTint, tinted);
        colors[vertex * 3] = tinted.r; colors[vertex * 3 + 1] = tinted.g; colors[vertex * 3 + 2] = tinted.b;
        continue;
      }
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


// ---- the balls ------------------------------------------------------------

/** An icosphere of unit radius, indexed: each of the icosahedron's faces cut into four `subdivisions` times, the midpoints shared. */
function icosphere(subdivisions) {
  const golden = (1 + Math.sqrt(5)) / 2;
  const corners = [
    [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
    [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
    [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1],
  ];
  const positions = [];
  for (const [x, y, z] of corners) { const length = Math.hypot(x, y, z); positions.push(x / length, y / length, z / length); }
  let faces = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  for (let level = 0; level < subdivisions; level++) {
    const midpoints = new Map();
    const midpoint = (first, second) => {
      const key = first < second ? first * 65536 + second : second * 65536 + first;
      let index = midpoints.get(key);
      if (index === undefined) {
        const x = positions[first * 3] + positions[second * 3], y = positions[first * 3 + 1] + positions[second * 3 + 1], z = positions[first * 3 + 2] + positions[second * 3 + 2];
        const length = Math.hypot(x, y, z);
        index = positions.length / 3;
        positions.push(x / length, y / length, z / length);
        midpoints.set(key, index);
      }
      return index;
    };
    const next = [];
    for (let face = 0; face < faces.length; face += 3) {
      const [first, second, third] = [faces[face], faces[face + 1], faces[face + 2]];
      const one = midpoint(first, second), two = midpoint(second, third), three = midpoint(third, first);
      next.push(first, one, three, second, two, one, third, three, two, one, two, three);
    }
    faces = next;
  }
  return { positions: new Float32Array(positions), indices: faces };
}

const smoothstep = (edge0, edge1, value) => { const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1); return t * t * (3 - 2 * t); };

// A basketball's seams: its two great circles (x = 0 and y = 0) and the two
// curved ones round the ends of its x axis, |x| = 0.75 − 0.35·y², each
// SEAM.width (radians) wide and SEAM.depth (in R) deep.
const BASKETBALL = { orange: linear(196, 88, 40), seam: linear(28, 22, 20), width: 0.024, depth: 0.012 };
// A tennis ball's seam, the curve (a·cos t + b·cos 3t, a·sin t − b·sin 3t, 2·sqrt(a·b)·sin 2t) with a + b = 1, on the sphere.
const TENNIS = { felt: linear(214, 236, 66), seam: linear(236, 236, 226), lobe: 0.28, width: 0.05, depth: 0.012, samples: 720 };
// A golf ball's dimples about the vertices of a sixfold icosphere (362), each DIMPLE.radius (radians) across its half and DIMPLE.depth deep.
const GOLF = { white: linear(242, 242, 236), radius: 0.075, depth: 0.012, shade: 0.9 };
// A bowling ball's three holes (thumb and two fingers, radians across and in R deep) and its swirled shells, one pair of colours drawn per ball.
const BOWLING = {
  holes: [{ direction: [0.12, 0.99, 0], radius: 0.09 }, { direction: [-0.12, 0.99, 0], radius: 0.09 }, { direction: [0, 0.62, -0.78], radius: 0.105 }],
  holeDepth: 0.3, inside: linear(12, 12, 14),
  shells: [[linear(20, 40, 140), linear(110, 170, 235)], [linear(150, 20, 30), linear(25, 18, 20)], [linear(80, 30, 120), linear(220, 120, 200)], [linear(22, 22, 26), linear(120, 120, 130)], [linear(20, 100, 80), linear(120, 210, 190)]],
};

let tennisSeam = null;   // the seam's points, once
let golfDimples = null;  // the dimples' centres, once

/** Paint one vertex of a ball (unit direction x, y, z): how far in (in R) it is pressed, and its colour into `color`. */
function paintBall(paint, x, y, z, color, shells) {
  if (paint === 'plain') {
    // One colour (a user's ball, say), a little mottled.
    color.copy(shells[0]).multiplyScalar(0.94 + 0.08 * valueNoise3(x * 12, y * 12, z * 12));
    return 0;
  }
  if (paint === 'basketball') {
    const curved = Math.abs(Math.abs(x) - (0.75 - 0.35 * y * y)) / Math.sqrt(1 + (0.7 * y) ** 2);
    const seam = Math.min(Math.abs(x), Math.abs(y), curved);
    const inSeam = 1 - smoothstep(0.6 * BASKETBALL.width, BASKETBALL.width, seam);
    const pebble = 0.93 + 0.1 * valueNoise3(x * 60, y * 60, z * 60);
    color.copy(BASKETBALL.orange).multiplyScalar(pebble).lerp(BASKETBALL.seam, inSeam);
    return BASKETBALL.depth * inSeam;
  }
  if (paint === 'tennis') {
    let nearest = Infinity;
    for (let index = 0; index < tennisSeam.length; index += 3) {
      const dot = x * tennisSeam[index] + y * tennisSeam[index + 1] + z * tennisSeam[index + 2];
      nearest = Math.min(nearest, 1 - dot);
    }
    const angle = Math.sqrt(2 * Math.max(nearest, 0));
    const inSeam = 1 - smoothstep(0.6 * TENNIS.width, TENNIS.width, angle);
    const fuzz = 0.9 + 0.14 * valueNoise3(x * 40, y * 40, z * 40);
    color.copy(TENNIS.felt).multiplyScalar(fuzz).lerp(TENNIS.seam, inSeam);
    return TENNIS.depth * inSeam;
  }
  if (paint === 'golf') {
    let nearest = -1;
    for (let index = 0; index < golfDimples.length; index += 3) nearest = Math.max(nearest, x * golfDimples[index] + y * golfDimples[index + 1] + z * golfDimples[index + 2]);
    const angle = Math.acos(Math.min(nearest, 1));
    const inside = Math.max(1 - (angle / GOLF.radius) ** 2, 0);
    color.copy(GOLF.white).multiplyScalar(1 - (1 - GOLF.shade) * inside);
    return GOLF.depth * inside;
  }
  // The bowling ball: a swirl of its two colours, and its holes.
  const warp = valueNoise3(x * 1.7 + 3, y * 1.7, z * 1.7) * 2.5;
  const swirl = smoothstep(0.38, 0.62, valueNoise3(x * 2.2 + warp, y * 2.2 - warp, z * 2.2 + 1.3));
  color.copy(shells[0]).lerp(shells[1], swirl);
  for (const hole of BOWLING.holes) {
    const [hx, hy, hz] = hole.direction;
    const length = Math.hypot(hx, hy, hz);
    const angle = Math.acos(Math.min((x * hx + y * hy + z * hz) / length, 1));
    if (angle < hole.radius) {
      const inside = smoothstep(hole.radius, 0.8 * hole.radius, angle);
      color.lerp(BOWLING.inside, inside);
      return BOWLING.holeDepth * inside;
    }
  }
  return 0;
}

const ballCache = new Map();   // paint (and shell) → the painted sphere's attributes

/**
 * A ball's geometry (`definition.look.paint`: basketball, tennis, golf,
 * bowling, or plain in `look.color`), of unit radius (the caller scales it): the icosphere
 * pressed in where it is grooved, dimpled or drilled, its normals the
 * surface's, its colours painted per vertex (the header). A bowling ball
 * draws its pair of colours from `random`. Built once per kind (and pair),
 * then copied.
 */
export function createBallGeometry(definition, random = Math.random) {
  const { paint, color: plain = null } = definition.look;
  const shellIndex = paint === 'bowling' ? Math.floor(random() * BOWLING.shells.length) : 0;
  const key = `${paint}:${shellIndex}:${plain ?? ''}`;
  if (!ballCache.has(key)) {
    if (paint === 'tennis' && !tennisSeam) {
      const a = 1 - TENNIS.lobe, b = TENNIS.lobe, lift = 2 * Math.sqrt(a * b);
      tennisSeam = new Float32Array(TENNIS.samples * 3);
      for (let sample = 0; sample < TENNIS.samples; sample++) {
        const t = (sample / TENNIS.samples) * Math.PI * 2;
        tennisSeam.set([a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), lift * Math.sin(2 * t)], sample * 3);
      }
    }
    if (paint === 'golf' && !golfDimples) {
      // The sixfold icosphere's vertices: each face's points i·a + j·b + k·c over 6, normalized, kept once.
      const { positions, indices } = icosphere(0);
      const points = new Map();
      for (let face = 0; face < indices.length; face += 3) {
        const corner = (index) => [positions[indices[face + index] * 3], positions[indices[face + index] * 3 + 1], positions[indices[face + index] * 3 + 2]];
        const [first, second, third] = [corner(0), corner(1), corner(2)];
        for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6 - i; j++) {
          const k = 6 - i - j;
          const point = [0, 1, 2].map((axis) => i * first[axis] + j * second[axis] + k * third[axis]);
          const length = Math.hypot(...point);
          const unit = point.map((value) => value / length);
          points.set(unit.map((value) => value.toFixed(4)).join(','), unit);
        }
      }
      golfDimples = new Float32Array([...points.values()].flat());
    }
    const { positions, indices } = icosphere(SUBDIVISIONS);
    const colors = new Float32Array(positions.length);
    const color = new THREE.Color();
    const shells = paint === 'bowling' ? BOWLING.shells[shellIndex] : paint === 'plain' ? [linear(...plain)] : null;
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      const x = positions[vertex], y = positions[vertex + 1], z = positions[vertex + 2];
      const pressed = paintBall(paint, x, y, z, color, shells);
      positions[vertex] = x * (1 - pressed); positions[vertex + 1] = y * (1 - pressed); positions[vertex + 2] = z * (1 - pressed);
      colors[vertex] = color.r; colors[vertex + 1] = color.g; colors[vertex + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    ballCache.set(key, geometry);
  }
  return ballCache.get(key).clone();
}

// ---- the stones' looks ----------------------------------------------------

/**
 * A stone's colour at a vertex (createRockGeometry, src/rock.js) for a kind
 * other than the river stone's: `direction` the unit direction from its
 * centre, `point` the vertex (squashed), `seed` its noise's, `tint` the face's
 * faint tint (about 1), into `out` as linear values about 1 (the material's
 * colour multiplies them).
 */
export function stoneColor(kind, direction, point, seed, tint, out) {
  stonePattern(kind, direction, point, seed, tint, out);
  // Warmed as a river stone's speckle is (src/rock.js), or the sky's light leaves it blue.
  return out.multiply(STONE_WARMTH[kind]);
}
// Each kind's warmth: its vertex colours' red, green and blue against grey (a river stone's is about 1.25, 1, 0.75).
const STONE_WARMTH = { slate: new THREE.Color(1.05, 1, 0.92), granite: new THREE.Color(1.25, 1, 0.8), basalt: new THREE.Color(1.1, 1, 0.9), pumice: new THREE.Color(1.25, 1.05, 0.72) };

function stonePattern(kind, direction, point, seed, tint, out) {
  const grain = (scale, offset) => valueNoise3(direction.x * scale + seed + offset, direction.y * scale + offset, direction.z * scale + 2 * offset);
  if (kind === 'slate') {
    // Layers across its thickness (the short axis, y), a little wavy, and a faint grain.
    const layers = 0.88 + 0.2 * Math.sin(point.y * 45 + 4 * grain(3, 1)) + 0.1 * (grain(25, 2) - 0.5);
    return out.setScalar(layers * (0.9 + 0.1 * tint));
  }
  if (kind === 'granite') {
    // Black mica and white quartz in a pinkish feldspar.
    const mica = smoothstep(0.66, 0.72, grain(18, 3));
    const quartz = smoothstep(0.68, 0.74, grain(15, 7));
    out.setRGB(1.0, 0.96, 0.94).multiplyScalar(0.85 + 0.15 * tint);
    out.lerp(new THREE.Color(1.12, 1.1, 1.08), 0.7 * quartz);
    return out.lerp(new THREE.Color(0.22, 0.2, 0.2), 0.85 * mica);
  }
  if (kind === 'basalt') {
    const speckle = 0.85 + 0.3 * grain(30, 4);
    return out.setScalar(speckle * (0.9 + 0.1 * tint));
  }
  // Pumice: pale, its pits (the bubbles) dark.
  const pit = smoothstep(0.6, 0.7, grain(14, 5)) + 0.6 * smoothstep(0.62, 0.72, grain(32, 6));
  return out.setScalar((0.92 + 0.1 * tint) * (1 - 0.45 * Math.min(pit, 1)));
}

// ---- the gems --------------------------------------------------------------

// A brilliant of unit girdle radius: GEM.facets round, its table GEM.table
// across at GEM.crown up, its culet GEM.pavilion down.
const GEM = { facets: 8, table: 0.55, crown: 0.38, pavilion: 0.9, girdle: 1.08 };
const FIRE = [linear(255, 120, 90), linear(255, 220, 110), linear(120, 255, 170), linear(120, 170, 255), linear(220, 130, 255)];

/**
 * A gem's geometry (the header), separate triangles flat-shaded so each
 * facet catches the light on its own, stretched along z by its cut's
 * `stretch`; each facet's colour the gem's at a brightness drawn from
 * `random` over its cut's `contrast` (light coming back out of the stone:
 * a diamond's from near black to bright), a diamond's a share
 * (`fire`) of them in the spectrum's colours.
 */
export function createGemGeometry(definition, random = Math.random) {
  const { stretch = 1, fire = 0, contrast = [0.5, 1.0] } = definition.look;
  const color = linear(...definition.look.color);
  const ring = (radius, height) => Array.from({ length: GEM.facets }, (unused, index) => {
    const angle = (index / GEM.facets) * Math.PI * 2;
    return [radius * Math.cos(angle) * GEM.girdle, height, radius * Math.sin(angle) * GEM.girdle * stretch];
  });
  const table = ring(GEM.table, GEM.crown), girdle = ring(1, 0), centre = [0, GEM.crown, 0], culet = [0, -GEM.pavilion, 0];
  const triangles = [];
  for (let index = 0; index < GEM.facets; index++) {
    const next = (index + 1) % GEM.facets;
    triangles.push([centre, table[next], table[index]]);
    triangles.push([table[index], table[next], girdle[index]], [table[next], girdle[next], girdle[index]]);
    triangles.push([girdle[index], girdle[next], culet]);
  }
  const positions = new Float32Array(triangles.length * 9), colors = new Float32Array(triangles.length * 9);
  const facet = new THREE.Color();
  triangles.forEach((corners, face) => {
    const spark = contrast[0] + contrast[1] * random();
    facet.copy(random() < fire ? FIRE[Math.floor(random() * FIRE.length)] : color).multiplyScalar(spark);
    corners.forEach((corner, cornerIndex) => {
      positions.set(corner, face * 9 + cornerIndex * 3);
      colors.set([facet.r, facet.g, facet.b], face * 9 + cornerIndex * 3);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ---- the food --------------------------------------------------------------

// An apple: a sphere drawn in at its stalk's dimple and its calyx's, a little
// wider above its middle, red over yellow-green in streaks, with pale
// lenticels, and its stalk.
const APPLE = {
  red: linear(168, 22, 28), blush: linear(205, 60, 40), green: linear(178, 170, 62), stalk: linear(92, 62, 34), lenticel: linear(230, 210, 150),
  stalkDimple: [0.2, 0.38], calyxDimple: [0.12, 0.4], shoulder: 0.05, stalkLength: 0.32, stalkRadius: 0.035,
};

/** An apple's geometry, of unit radius (the header), indexed, its normals the surface's. */
export function createAppleGeometry() {
  if (!ballCache.has('apple')) {
    const { positions, indices } = icosphere(4);
    const colors = new Float32Array(positions.length);
    const color = new THREE.Color();
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      const x = positions[vertex], y = positions[vertex + 1], z = positions[vertex + 2];
      const fromTop = Math.acos(Math.min(Math.max(y, -1), 1)), fromBottom = Math.PI - fromTop;
      const scale = (1 - APPLE.stalkDimple[0] * Math.exp(-((fromTop / APPLE.stalkDimple[1]) ** 2)) - APPLE.calyxDimple[0] * Math.exp(-((fromBottom / APPLE.calyxDimple[1]) ** 2))) * (1 + APPLE.shoulder * y);
      positions[vertex] = x * scale; positions[vertex + 1] = y * scale; positions[vertex + 2] = z * scale;
      // Red streaked down from the stalk over a yellow-green ground, greener near the calyx.
      const streak = valueNoise3(Math.atan2(z, x) * 5, y * 1.5, 0.5);
      const red = smoothstep(-0.7, 0.3, y) * smoothstep(0.25, 0.6, streak + 0.25);
      color.copy(APPLE.green).lerp(APPLE.blush, smoothstep(0, 1, red + 0.2)).lerp(APPLE.red, red);
      if (valueNoise3(x * 40, y * 40, z * 40) > 0.94) color.lerp(APPLE.lenticel, 0.3);
      colors[vertex] = color.r; colors[vertex + 1] = color.g; colors[vertex + 2] = color.b;
    }
    // The stalk: a thin tapered hexagonal prism from the dimple's floor, leaning a little.
    const allPositions = [...positions], allColors = [...colors], allIndices = [...indices];
    const base = 1 - APPLE.stalkDimple[0] - 0.02;
    const first = allPositions.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const height = base + ring * APPLE.stalkLength, radius = APPLE.stalkRadius * (1 - 0.4 * ring), lean = 0.08 * ring;
      for (let side = 0; side < 6; side++) {
        const angle = (side / 6) * Math.PI * 2;
        allPositions.push(lean + radius * Math.cos(angle), height, radius * Math.sin(angle));
        allColors.push(APPLE.stalk.r, APPLE.stalk.g, APPLE.stalk.b);
      }
    }
    for (let side = 0; side < 6; side++) {
      const next = (side + 1) % 6;
      allIndices.push(first + side, first + 6 + side, first + next, first + next, first + 6 + side, first + 6 + next);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3));
    geometry.setIndex(allIndices);
    geometry.computeVertexNormals();
    ballCache.set('apple', geometry);
  }
  return ballCache.get('apple').clone();
}

// A pizza: a disc of unit radius turned about its axis from a profile (its
// flat bottom, the crust's rim, the top), PIZZA.segments round and in rings
// across, so its toppings can be painted per vertex: a golden crust,
// cheese with the sauce showing through, and PIZZA.pepperoni slices. A list
// of separate triangles (src/rock.js integrates its shape and finds its
// lowest point over them).
const PIZZA = {
  segments: 64, rings: 24, base: 0.035, top: 0.025, crustFrom: 0.85, crustTop: 0.075, pepperoni: 9, slice: 0.11,
  bottom: linear(200, 150, 92), crust: linear(196, 128, 58), crustDark: linear(150, 88, 38), cheese: linear(244, 206, 118), sauce: linear(196, 64, 32), salami: linear(120, 22, 18),
};

/** A pizza's geometry (the header), its pepperoni placed by `random`. */
export function createPizzaGeometry(random = Math.random) {
  // The profile, (radius, height) pairs from the bottom's centre out, up round the crust and in over the top.
  const profile = [];
  for (let ring = 0; ring <= PIZZA.rings; ring++) profile.push([(0.97 * ring) / PIZZA.rings, -PIZZA.base]);
  profile.push([1.0, -0.01], [0.97, PIZZA.crustTop * 0.8], [0.92, PIZZA.crustTop], [PIZZA.crustFrom + 0.02, PIZZA.top + 0.02]);
  for (let ring = PIZZA.rings; ring >= 0; ring--) profile.push([(PIZZA.crustFrom * ring) / PIZZA.rings, PIZZA.top]);
  const slices = Array.from({ length: PIZZA.pepperoni }, (unused, index) => {
    const along = Math.sqrt((index + random()) / PIZZA.pepperoni) * (PIZZA.crustFrom - PIZZA.slice - 0.03);
    const angle = index * 2.4 + random();
    return [along * Math.cos(angle), along * Math.sin(angle)];
  });
  const color = new THREE.Color();
  const colorAt = (x, y, z, out) => {
    const radius = Math.hypot(x, z);
    if (y < -PIZZA.base + 1e-6) return out.copy(PIZZA.bottom).multiplyScalar(0.9 + 0.15 * valueNoise3(x * 9, 0, z * 9));
    if (radius > PIZZA.crustFrom + 0.01 || y > PIZZA.top + 0.01) return out.copy(PIZZA.crust).lerp(PIZZA.crustDark, smoothstep(0.4, 0.8, valueNoise3(x * 7, y * 7, z * 7)));
    if (slices.some(([sliceX, sliceZ]) => Math.hypot(x - sliceX, z - sliceZ) < PIZZA.slice)) return out.copy(PIZZA.salami).multiplyScalar(0.85 + 0.25 * valueNoise3(x * 30, 1, z * 30));
    return out.copy(PIZZA.cheese).lerp(PIZZA.sauce, smoothstep(0.7, 0.8, valueNoise3(x * 6, 2, z * 6)) * 0.7);
  };
  const point = (pair, angle) => [pair[0] * Math.cos(angle), pair[1], pair[0] * Math.sin(angle)];
  const triangles = [];
  for (let segment = 0; segment < PIZZA.segments; segment++) {
    const angle = (segment / PIZZA.segments) * Math.PI * 2, next = ((segment + 1) / PIZZA.segments) * Math.PI * 2;
    for (let index = 0; index < profile.length - 1; index++) {
      const a = point(profile[index], angle), b = point(profile[index + 1], angle), c = point(profile[index + 1], next), d = point(profile[index], next);
      // Facing out: the profile runs out along the bottom, up the rim and in over the top.
      if (profile[index][0] > 1e-9) triangles.push([a, b, d]);
      if (profile[index + 1][0] > 1e-9) triangles.push([b, c, d]);
    }
  }
  const positions = new Float32Array(triangles.length * 9), colors = new Float32Array(triangles.length * 9);
  triangles.forEach((corners, face) => corners.forEach((corner, cornerIndex) => {
    positions.set(corner, face * 9 + cornerIndex * 3);
    colorAt(...corner, color);
    colors.set([color.r, color.g, color.b], face * 9 + cornerIndex * 3);
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ---- the kinds -------------------------------------------------------------

registerMesh('stone', {
  build: (definition, { flat = false } = {}) => createRockGeometry(undefined, { flat, look: definition.look }),
  // Its tint over its speckle: the river stone's as it always was (its draws too), another kind's from its look's ranges.
  color: (definition) => {
    const look = definition.look;
    if (look.pattern === 'river') return new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.08 + Math.random() * 0.1, 0.3 + Math.random() * 0.14);
    return new THREE.Color().setHSL(look.hue[0] + Math.random() * look.hue[1], look.saturation[0] + Math.random() * look.saturation[1], look.lightness[0] + Math.random() * look.lightness[1]);
  },
});
registerMesh('ball', { build: (definition) => createBallGeometry(definition), color: () => new THREE.Color(1, 1, 1) });
registerMesh('apple', { build: () => createAppleGeometry(), color: () => new THREE.Color(1, 1, 1) });
registerMesh('pizza', { build: () => createPizzaGeometry(), color: () => new THREE.Color(1, 1, 1) });
registerMesh('gem', { build: (definition) => createGemGeometry(definition), color: () => new THREE.Color(1, 1, 1) });
