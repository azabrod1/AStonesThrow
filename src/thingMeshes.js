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
//   - pizza: a disc turned from a profile, made by hand (its outline
//     wobbles, its crust rises unevenly, its top is lumpy), its top painted
//     on a texture (cheese, blisters, sauce, a charred crust: paintPizza;
//     createPizzaGeometry), each one thrown dressed with a recipe's toppings
//     drawn at random (pizzaToppings: pepperoni, mushrooms, olives, peppers,
//     pineapple, ham, basil, mozzarella);
//   - watermelon: an oval, striped dark and pale green, its field spot and
//     its stalk's nub (createWatermelonGeometry);
//   - brick: a box of a brick's proportions, its edges rounded, mottled clay
//     (createBrickGeometry);
//   - pie: a fruit pie in its tin, its rim crimped, each one thrown filled
//     at random (pieFilling: apple under a closed crust, cherry or blueberry
//     under a lattice, open pumpkin; createPieGeometry);
//   - duck: a rubber duck, a smooth union of ellipsoids, yellow, its bill
//     orange (createDuckGeometry);
//   - gem: a brilliant cut (createGemGeometry: a table, a crown of facets,
//     the girdle, a pavilion to the culet), stretched by its `look.stretch`,
//     each facet's colour `look.color` at its own brightness, a diamond's
//     `look.fire` of them in the spectrum's colours;
//   - shard: a piece of broken ice, a slab of its piece's outline, broken,
//     and thickness (createShardGeometry: src/ice.js breaks each one, and
//     src/rock.js hands the builder its `piece`), clear (what lies under it
//     shows through: its `clearShare`), clouded white, its rim rounded and
//     whiter, its broken sides white.
// A new kind of look (a pizza's disc, a feather's vane) is a builder
// registered here; its definition then names it. Every geometry carries a
// colour per vertex and is drawn with the material src/rock.js makes; a kind
// with a texture (the pizza's) has its own program, which src/main.js warmUp
// draws, and every other kind shares the stone's.
import * as THREE from 'three';

/** An sRGB colour (0 to 255) in the linear values vertex colours take. */
export function linear(red, green, blue) { return new THREE.Color().setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace); }

const SUBDIVISIONS = 5;              // a ball's icosphere: 10242 vertices, 4 mm apart on a basketball
// A flat stone, picked for skipping (src/rock.js): its short axis 0.26 to 0.38 of its long one (a river stone's 0.62 to 0.82); its surface noise, of a river stone's.
export const SKIP_STONE = { squash: [0.26, 0.12], surfaceNoise: 0.6 };

const MESHES = new Map();

/**
 * Register a mesh's kind: `build(definition, { flat, piece })` returns its
 * unit-sized geometry (a colour per vertex; for a stone, a list of separate
 * triangles, src/rock.js integrates its shape over them; `flat`, a stone
 * picked for skipping; `piece`, a shard's own outline, which src/rock.js is
 * given and passes on), `color(definition)` the
 * material's colour (drawn when the thing is made, after its geometry),
 * `glow(definition)`, if it has one, the material's emissive colour (null
 * for none), and `texture(definition)`, if it has one, the material's map (its colours
 * times the vertices'; a textured thing's material is its own program,
 * which src/main.js warmUp draws). A `fixed` kind builds the same geometry
 * every time and draws no random numbers: src/rock.js prepareThing builds
 * it, its shape and its buoyancy's columns once for each definition, and
 * every one thrown shares them. `volume(definition)` is its unit-sized volume, where
 * it has one (a fixed kind's is its geometry's; a stone's lumps are drawn
 * at random, so it has none): a thing sized by its mass is as big as its
 * density and that volume make it (src/things.js). `prepare(definition)`
 * fills whatever a kind keeps between throws (a ball's painted spheres),
 * drawing no random numbers, so the first one thrown costs no more than the
 * next (src/rock.js prepareThing). `check(look)` says, as sentences, what is
 * wrong with a definition's `look` for this kind (the fields its builder
 * reads; src/things.js validateThing), none for a good one. A
 * `sharedStream` kind (a stone) draws its lumps from Math.random between
 * its throw's own draws, so its throw keeps drawing from Math.random too
 * (src/rock.js `random`: a seeded stone is the stone it always was); any
 * other thing's throw draws from a stream of its own. `dress(definition,
 * random)`, if a kind has it, makes the parts each one thrown has of its
 * own (a pizza's toppings), drawn from `random`: { geometry, share, name,
 * shared }, the parts' triangles (as its own, a colour per vertex and a uv
 * for a textured kind), their mass as a share of the thing's, what they
 * make it (a recipe's name) and whether the kind keeps those triangles for
 * the next (a pie's fillings); src/rock.js adds them to its copy of the
 * shared mesh (withParts) and their mass to its own. Only a `fixed` kind is
 * dressed; `heaviest` is the most share its dressing adds (src/things.js:
 * whether a thing that floats plain may sink dressed).
 */
export function registerMesh(kind, { build, color, texture = null, glow = null, fixed = false, volume = null, prepare = null, check = null, sharedStream = false, dress = null, heaviest = 0 }) {
  MESHES.set(kind, { build, color, texture, glow, fixed, prepare, check, sharedStream, dress, heaviest, volume: volume ?? (fixed ? (definition) => meshVolume(build(definition, {})) : null) });
}

// What the looks' checks (registerMesh `check`) ask of a field.
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const numbersIn = (value, count, least, most) => Array.isArray(value) && value.length === count && value.every((entry) => finite(entry) && entry >= least && entry <= most);
const STONE_PATTERNS = ['river', 'slate', 'granite', 'basalt', 'pumice'];
const BALL_PAINTS = ['basketball', 'tennis', 'golf', 'bowling', 'plain'];

const VOLUMES = new WeakMap();   // definition → its mesh's unit volume, measured once

/** The unit-sized volume of `definition`'s mesh (registerMesh `volume`), measured once; null for a kind that has none. */
export function unitVolume(definition) {
  const volume = meshKind(definition.look?.mesh)?.volume;
  if (!volume) return null;
  if (!VOLUMES.has(definition)) VOLUMES.set(definition, volume(definition));
  return VOLUMES.get(definition);
}

/** The volume a closed geometry of separate triangles (no index) encloses: the sum of the tetrahedra its faces make with the origin. */
export function meshVolume(geometry) {
  const positions = geometry.attributes.position.array;
  let volume = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const bx = positions[index + 3], by = positions[index + 4], bz = positions[index + 5];
    const cx = positions[index + 6], cy = positions[index + 7], cz = positions[index + 8];
    volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

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
// flat bottom, the crust's puffed rim, the top), PIZZA.segments round,
// made by hand: its outline wobbles (PIZZA.outline: a few slow waves and a
// finer ripple), its crust rises unevenly (PIZZA.puff) and its melted top is
// bumpy (PIZZA.bumps). Its top is painted on a texture (paintPizza: cheese
// with browned blisters and a little oil, the sauce showing at the crust, the
// crust golden with char and flour; its toppings are pieces of their own,
// pizzaToppings), mapped from
// above; the crust's outer side and the bottom take the paint's crust edge,
// darker per vertex under it and where it sits in the water. Built as a grid for smooth normals, then
// cut into separate triangles (src/rock.js integrates its shape and finds
// its lowest point over them). A browser paints the texture once and every
// pizza shares it; without a document (the CPU probes) there is none.
const PIZZA = {
  segments: 96, topRings: 22, base: 0.035, top: 0.03, crustFrom: 0.8, crustTop: 0.12,
  outline: [[2, 0.03], [3, 0.025], [5, 0.012], [11, 0.006]],   // the outline's waves: [count round, size]
  puff: 0.35,                                                   // the crust's height varies by up to this share
  bumps: 0.01,                                                  // the top's melted lumps, in R
  texture: 512,
  bottom: 0.8, wet: 0.7,   // the paint's crust edge, darker under it and on its side in the water (wet)
};
const pizzaWave = (seed) => (angle) => PIZZA.outline.reduce((sum, [count, size], index) => sum + size * Math.sin(count * angle + seed[index]), 0);

/** A small seeded random stream (mulberry32), so every pizza's paint is the same. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The pizza's top on a canvas (the header), its disc of radius 0.47 of the
 * texture about its middle, following `edge(angle)`, the outline's wave;
 * outside it white, which the crust's side and the bottom take.
 */
function paintPizza(edge) {
  const size = PIZZA.texture, centre = size / 2, scale = size * 0.47;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const paint = canvas.getContext('2d');
  const random = seeded(7);
  paint.fillStyle = '#fff';
  paint.fillRect(0, 0, size, size);
  const outline = (share) => {
    paint.beginPath();
    for (let step = 0; step <= 180; step++) {
      const angle = (step / 180) * Math.PI * 2, radius = scale * share * (1 + edge(angle));
      paint[step ? 'lineTo' : 'moveTo'](centre + radius * Math.cos(angle), centre + radius * Math.sin(angle));
    }
    paint.closePath();
  };
  const blob = (x, y, radius, inner, outer) => {
    const gradient = paint.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    paint.fillStyle = gradient;
    paint.beginPath();
    paint.arc(x, y, radius, 0, Math.PI * 2);
    paint.fill();
  };
  const inside = (share) => { const angle = random() * Math.PI * 2, along = Math.sqrt(random()) * share; return [centre + scale * along * Math.cos(angle), centre + scale * along * Math.sin(angle)]; };
  // The crust: golden, browner to its edge, charred here and there, a dust of flour.
  outline(1);
  const crust = paint.createRadialGradient(centre, centre, scale * 0.75, centre, centre, scale * 1.05);
  crust.addColorStop(0, '#d9a45a'); crust.addColorStop(0.55, '#c98b3f'); crust.addColorStop(1, '#9c6128');
  paint.fillStyle = crust;
  paint.fill();
  paint.save();
  outline(1);
  paint.clip();
  for (let spot = 0; spot < 60; spot++) {
    const angle = random() * Math.PI * 2, along = scale * (0.84 + 0.17 * random()) * (1 + edge(angle));
    const x = centre + along * Math.cos(angle), y = centre + along * Math.sin(angle);
    if (random() < 0.45) blob(x, y, 3 + 7 * random(), 'rgba(60,32,14,0.75)', 'rgba(60,32,14,0)');
    else blob(x, y, 2 + 4 * random(), 'rgba(250,240,220,0.5)', 'rgba(250,240,220,0)');
  }
  paint.restore();
  // The sauce, to just inside the crust, and the cheese melted over most of it.
  outline(PIZZA.crustFrom + 0.02);
  paint.fillStyle = '#b73a1e';
  paint.fill();
  paint.save();
  outline(PIZZA.crustFrom + 0.02);
  paint.clip();
  for (let melt = 0; melt < 260; melt++) {
    const [x, y] = inside(PIZZA.crustFrom - 0.04);
    blob(x, y, 14 + 26 * random(), 'rgba(248,196,92,0.95)', 'rgba(242,182,80,0)');
  }
  // Browned blisters on the cheese.
  for (let blister = 0; blister < 34; blister++) {
    const [x, y] = inside(PIZZA.crustFrom - 0.02);
    blob(x, y, 5 + 9 * random(), 'rgba(170,92,30,0.8)', 'rgba(214,140,56,0)');
  }
  // A little oil pooled here and there (the toppings are the pizza's own geometry: pizzaToppings).
  for (let pool = 0; pool < 14; pool++) {
    const [x, y] = inside(PIZZA.crustFrom - 0.1);
    blob(x, y, 8 + 10 * random(), 'rgba(214,110,40,0.3)', 'rgba(214,110,40,0)');
  }
  paint.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The pizza's top's texture (the header), painted once; null without a document. */
export function pizzaTexture() {
  if (pizzaTexture.painted === undefined) pizzaTexture.painted = typeof document === 'undefined' ? null : paintPizza(pizzaWave(PIZZA_SEED));
  return pizzaTexture.painted;
}
const PIZZA_SEED = [0.7, 2.1, 4.0, 1.3];   // the outline waves' phases: one pizza's shape, which its texture is painted to

/** A pizza's geometry (the header): unit radius, its outline, crust and top made by hand. */
export function createPizzaGeometry() {
  const edge = pizzaWave(PIZZA_SEED);
  // The profile, (radius, height, on the texture's top) from the bottom's centre out, up round the crust and in over the top.
  const profile = [];
  for (let ring = 0; ring <= 8; ring++) profile.push([(0.96 * ring) / 8, -PIZZA.base, false]);
  for (const [radius, height] of [[0.99, -0.025], [1.0, 0.0], [0.99, 0.045]]) profile.push([radius, height, false]);
  for (const [radius, height] of [[0.96, 0.095], [0.92, PIZZA.crustTop], [0.87, 0.105], [0.83, 0.07], [PIZZA.crustFrom, PIZZA.top + 0.01]]) profile.push([radius, height, true]);
  for (let ring = PIZZA.topRings; ring >= 0; ring--) profile.push([(PIZZA.crustFrom * ring) / PIZZA.topRings, PIZZA.top, true]);
  const columns = PIZZA.segments + 1, rows = profile.length;
  const positions = new Float32Array(columns * rows * 3), colors = new Float32Array(columns * rows * 3), uvs = new Float32Array(columns * rows * 2);
  for (let column = 0; column < columns; column++) {
    const angle = (column / PIZZA.segments) * Math.PI * 2;
    const wobble = 1 + edge(angle);
    // The crust rises unevenly round, more where it was stretched thin.
    const puff = 1 + PIZZA.puff * (0.5 * Math.sin(3 * angle + 1.1) + 0.3 * Math.sin(7 * angle + 2.3) + 0.2 * Math.sin(13 * angle));
    profile.forEach(([radius, height, top], row) => {
      const out = radius * wobble;
      const x = out * Math.cos(angle), z = out * Math.sin(angle);
      let y = height;
      if (height > 0.04) y = PIZZA.top + (height - PIZZA.top) * puff;            // the crust's rise
      else if (top) y += PIZZA.bumps * (valueNoise3(x * 6, 0, z * 6) - 0.5) * (1 - smoothstep(0.7, 0.8, radius));   // melted lumps
      const index = column * rows + row;
      positions.set([x, y, z], index * 3);
      const shade = top ? 1 : height <= -PIZZA.base + 1e-6 ? PIZZA.bottom : height < 0 ? PIZZA.wet : 1;
      colors.set([shade, shade, shade], index * 3);
      // Its top mapped from above onto the texture's disc (radius 0.47 of it); its side and underside onto the paint's crust
      // edge at their angle, so no triangle between them strays over the paint's white margin.
      const edgeX = 0.99 * wobble * Math.cos(angle), edgeZ = 0.99 * wobble * Math.sin(angle);
      uvs.set(top ? [0.5 + 0.47 * x, 0.5 - 0.47 * z] : [0.5 + 0.47 * edgeX, 0.5 - 0.47 * edgeZ], index * 2);
    });
  }
  return turnedMesh({ position: positions, color: colors, uv: uvs }, profile.map(([radius]) => radius), PIZZA.segments);
}

/**
 * A solid turned about its axis (a pizza's, a pie's): its grid of
 * `segments` + 1 columns round (the last over the first) by a row for each
 * of the profile's `radii`, its attributes (`position`, `color`, `uv`, as
 * typed arrays, a column's rows after another's), joined into triangles (none
 * at a row on the axis, radius 0), its normals smooth and the same either side
 * of the seam where it wraps round, then cut into separate triangles.
 */
function turnedMesh(attributes, radii, segments) {
  const rows = radii.length;
  const indices = [];
  for (let column = 0; column < segments; column++) {
    for (let row = 0; row < rows - 1; row++) {
      const here = column * rows + row, above = here + 1, nextAbove = (column + 1) * rows + row + 1, next = (column + 1) * rows + row;
      if (radii[row] > 1e-9) indices.push(here, above, next);
      if (radii[row + 1] > 1e-9) indices.push(above, nextAbove, next);
    }
  }
  const smooth = new THREE.BufferGeometry();
  for (const [name, array] of Object.entries(attributes)) smooth.setAttribute(name, new THREE.BufferAttribute(array, name === 'uv' ? 2 : 3));
  smooth.setIndex(indices);
  smooth.computeVertexNormals();
  // The seam where the grid wraps round: both columns' normals the same.
  const normals = smooth.attributes.normal;
  for (let row = 0; row < rows; row++) {
    const first = row, last = segments * rows + row;
    const nx = normals.getX(first) + normals.getX(last), ny = normals.getY(first) + normals.getY(last), nz = normals.getZ(first) + normals.getZ(last);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.setXYZ(first, nx / length, ny / length, nz / length);
    normals.setXYZ(last, nx / length, ny / length, nz / length);
  }
  const geometry = smooth.toNonIndexed();
  smooth.dispose();
  return geometry;
}

/** One of `choices` drawn from `random`, each as likely as its `weight` (a pizza's recipe, a pie's filling). */
function weightedPick(choices, random) {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let draw = random() * total;
  for (const choice of choices) { draw -= choice.weight; if (draw < 0) return choice; }
  return choices.at(-1);
}

// A pizza's toppings (registerMesh `dress`): each pizza thrown is one of
// TOPPINGS.recipes, drawn at random (by its `weight`), its pieces laid at
// random on its cheese, inside the crust and apart from each other, each
// turned its own way and a little sized and coloured its own. A piece is a
// flat outline in the pizza's own units (its radius 1), stood `thick` high
// from just under the cheese (`sunk`), its top cupped by `cup` (pepperoni
// curls up at its rim), or a ring (`hole`: an olive, a pepper's slice); its
// top's colour shades to `rim` at its edge, its side `side`. A piece weighs
// `share` of the pizza's own mass: a pepperoni slice about 3 g on a 30 cm
// pizza, all the toppings 5 to 14% of it. Their triangles join the drawn
// pizza's own (withParts), so they bend with it; the physics has the shared
// mesh without them, its buoyancy and its lowest point (they are a few
// millimetres thin: src/rock.js physicsPositions). Their uv is the texture's
// white corner, so their colour is their own.
const TOPPINGS = {
  sunk: 0.004, margin: 0.06, tries: 40, white: [0.004, 0.004],
  pieces: {
    pepperoni: { outline: 'round', size: 0.085, thick: 0.012, cup: 0.008, top: [196, 62, 40], rim: [128, 32, 20], side: [150, 40, 26], share: 0.008 },
    mushroom: { outline: 'mushroom', size: 0.075, thick: 0.008, top: [214, 190, 160], rim: [126, 92, 64], side: [168, 140, 110], share: 0.005 },
    olive: { outline: 'round', size: 0.036, hole: 0.45, thick: 0.014, top: [40, 34, 42], rim: [22, 18, 24], side: [30, 26, 32], share: 0.002 },
    pepper: { outline: 'round', size: 0.07, hole: 0.78, arc: 0.6, thick: 0.01, top: [70, 150, 48], rim: [40, 104, 30], side: [56, 128, 40], share: 0.003 },
    pineapple: { outline: 'wedge', size: 0.05, thick: 0.03, top: [246, 212, 86], rim: [226, 178, 52], side: [236, 196, 72], share: 0.008 },
    ham: { outline: 'square', size: 0.075, thick: 0.007, top: [226, 140, 138], rim: [204, 112, 112], side: [214, 126, 124], share: 0.007 },
    basil: { outline: 'leaf', size: 0.06, thick: 0.004, top: [44, 116, 38], rim: [28, 84, 26], side: [36, 96, 30], share: 0.0008 },
    mozzarella: { outline: 'blob', size: 0.1, thick: 0.014, cup: -0.006, top: [248, 242, 226], rim: [236, 220, 186], side: [240, 230, 206], share: 0.02 },
  },
  recipes: [
    { name: 'Margherita', weight: 3, pieces: { mozzarella: 5, basil: 6 } },
    { name: 'Pepperoni', weight: 4, pieces: { pepperoni: 13 } },
    { name: 'Funghi', weight: 2, pieces: { mushroom: 11 } },
    { name: 'Hawaiian', weight: 2, pieces: { ham: 7, pineapple: 10 } },
    { name: 'Vegetariana', weight: 2, pieces: { pepper: 7, olive: 9, mushroom: 5 } },
    { name: 'Diavola', weight: 2, pieces: { pepperoni: 10, olive: 6, pepper: 4 } },
    { name: 'Capricciosa', weight: 2, pieces: { ham: 5, mushroom: 6, olive: 6 } },
  ],
};
const OUTLINE_POINTS = 16;
const scratchColours = [new THREE.Color(), new THREE.Color(), new THREE.Color()];   // a piece's top, rim and side (addPiece)
const scratchOutline = [new Float64Array(2 * (OUTLINE_POINTS + 1)), new Float64Array(2 * (OUTLINE_POINTS + 1))];   // its outer and inner edge, placed
const toppingRoom = { triangles: 0 };   // pizzaToppings' buffers, kept from one pizza to the next
const MOST_PIECES = Math.max(...TOPPINGS.recipes.map((recipe) => Object.values(recipe.pieces).reduce((sum, count) => sum + count, 0)));
// The most weight a recipe's toppings add, its pieces at their largest (pizzaToppings sizes them 0.85 to 1.15).
const HEAVIEST_TOPPINGS = Math.max(...TOPPINGS.recipes.map((recipe) => Object.entries(recipe.pieces).reduce((sum, [kind, count]) => sum + count * TOPPINGS.pieces[kind].share * 1.15 ** 2, 0)));
const PIECE_TRIANGLES = OUTLINE_POINTS * 8 + 4;   // the most one piece has: a ring's, eight for each of its outline's points, and its cut ends

/** A piece's outline (TOPPINGS `outline`), OUTLINE_POINTS points round it counter-clockwise from above, in its size's units, wobbled by `random`. */
function pieceOutline(kind, random) {
  const wobble = Array.from({ length: 3 }, () => random() * Math.PI * 2);
  return Array.from({ length: OUTLINE_POINTS }, (unused, index) => {
    const angle = (index / OUTLINE_POINTS) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
    let radius = 1;
    if (kind === 'square') radius = 1 / Math.max(Math.abs(cos), Math.abs(sin)) * 0.8;
    else if (kind === 'wedge') radius = 0.8 / Math.max(Math.abs(cos), 1.4 * Math.abs(sin));
    else if (kind === 'leaf') radius = 0.42 + 0.58 * Math.abs(cos) ** 0.6;
    else if (kind === 'blob') radius = 1 + 0.12 * Math.sin(3 * angle + wobble[0]) + 0.08 * Math.sin(5 * angle + wobble[1]);
    else if (kind === 'mushroom') radius = sin > -0.2 ? 1 : Math.min(0.42 / Math.max(Math.abs(cos), 1e-3), 1.1 / Math.max(-sin, 1e-3), 1);   // its cap, then its stem below
    if (kind !== 'blob') radius *= 1 + 0.04 * Math.sin(2 * angle + wobble[2]);
    return [radius * cos, radius * sin];
  });
}

/**
 * One piece's triangles into `out` (its positions, normals, colours and uvs,
 * typed arrays filled from `out.count`), at (x, z) on the cheese, turned
 * `turn` about the vertical and `size` across (the header): its top (a fan
 * from its middle, cupped), its sides, and its underside; a ring (`hole`)
 * has an inner side and its top and underside between its edges, an `arc`
 * share of the way round, its cut ends closed.
 */
function addPiece(out, piece, x, z, turn, size, shade, random) {
  const outline = pieceOutline(piece.outline, random);
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const base = PIZZA.top - TOPPINGS.sunk, top = PIZZA.top + piece.thick * size / piece.size;
  // Its colours (linear, made once for its kind), a little lighter or darker for this piece.
  piece.linear ??= { top: linear(...piece.top), rim: linear(...piece.rim), side: linear(...piece.side) };
  const topColour = scratchColours[0].copy(piece.linear.top).multiplyScalar(shade), rimColour = scratchColours[1].copy(piece.linear.rim).multiplyScalar(shade), sideColour = scratchColours[2].copy(piece.linear.side).multiplyScalar(shade);
  const cup = (piece.cup ?? 0) * size / piece.size;
  const ring = piece.hole !== undefined;
  const closed = !ring || (piece.arc ?? 1) >= 1;
  const count = closed ? OUTLINE_POINTS : Math.max(2, Math.round(OUTLINE_POINTS * piece.arc)) + 1;
  // Its outline's points placed on the pizza (x then z for each), its outer edge and a ring's inner one.
  const outer = scratchOutline[0], inner = scratchOutline[1];
  for (let index = 0; index < count; index++) {
    const [across, along] = outline[index % OUTLINE_POINTS];
    outer[2 * index] = x + size * (cos * across - sin * along); outer[2 * index + 1] = z + size * (sin * across + cos * along);
    if (ring) { inner[2 * index] = x + size * piece.hole * (cos * across - sin * along); inner[2 * index + 1] = z + size * piece.hole * (sin * across + cos * along); }
  }
  const { positions, normals, colors, uvs } = out;
  const triangle = (ax, ay, az, bx, by, bz, cx, cy, cz, ca, cb, cc) => {
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length; ny /= length; nz /= length;
    const at = out.count * 9;
    positions[at] = ax; positions[at + 1] = ay; positions[at + 2] = az; positions[at + 3] = bx; positions[at + 4] = by; positions[at + 5] = bz; positions[at + 6] = cx; positions[at + 7] = cy; positions[at + 8] = cz;
    for (let corner = 0; corner < 3; corner++) { normals[at + 3 * corner] = nx; normals[at + 3 * corner + 1] = ny; normals[at + 3 * corner + 2] = nz; }
    colors[at] = ca.r; colors[at + 1] = ca.g; colors[at + 2] = ca.b; colors[at + 3] = cb.r; colors[at + 4] = cb.g; colors[at + 5] = cb.b; colors[at + 6] = cc.r; colors[at + 7] = cc.g; colors[at + 8] = cc.b;
    uvs.fill(TOPPINGS.white[0], out.count * 6, out.count * 6 + 6);
    out.count++;
  };
  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % count;
    const ox = outer[2 * index], oz = outer[2 * index + 1], nx = outer[2 * next], nz = outer[2 * next + 1];
    if (ring) {
      const ix = inner[2 * index], iz = inner[2 * index + 1], jx = inner[2 * next], jz = inner[2 * next + 1];
      triangle(ix, top, iz, nx, top, nz, ox, top, oz, topColour, rimColour, rimColour);
      triangle(ix, top, iz, jx, top, jz, nx, top, nz, topColour, topColour, rimColour);
      triangle(ix, base, iz, ox, base, oz, nx, base, nz, sideColour, sideColour, sideColour);
      triangle(ix, base, iz, nx, base, nz, jx, base, jz, sideColour, sideColour, sideColour);
      triangle(ix, top, iz, ix, base, iz, jx, base, jz, sideColour, sideColour, sideColour);
      triangle(ix, top, iz, jx, base, jz, jx, top, jz, sideColour, sideColour, sideColour);
    } else {
      triangle(x, top - cup, z, nx, top, nz, ox, top, oz, topColour, rimColour, rimColour);
      triangle(x, base, z, ox, base, oz, nx, base, nz, sideColour, sideColour, sideColour);
    }
    triangle(ox, top, oz, nx, top, nz, nx, base, nz, rimColour, rimColour, sideColour);
    triangle(ox, top, oz, nx, base, nz, ox, base, oz, rimColour, sideColour, sideColour);
  }
  if (!closed) {
    // A ring's two cut ends, each facing out of it.
    for (const [index, flip] of [[0, true], [count - 1, false]]) {
      const ox = outer[2 * index], oz = outer[2 * index + 1], ix = inner[2 * index], iz = inner[2 * index + 1];
      if (flip) {
        triangle(ox, base, oz, ix, base, iz, ix, top, iz, sideColour, sideColour, sideColour);
        triangle(ox, base, oz, ix, top, iz, ox, top, oz, sideColour, sideColour, sideColour);
      } else {
        triangle(ox, top, oz, ix, top, iz, ix, base, iz, sideColour, sideColour, sideColour);
        triangle(ox, top, oz, ix, base, iz, ox, base, oz, sideColour, sideColour, sideColour);
      }
    }
  }
}

/**
 * A pizza's toppings (the header): one recipe drawn from `random`, its
 * pieces' triangles (in buffers the next call fills again: copy them first),
 * their mass's share of the pizza's, and the recipe's name.
 */
export function pizzaToppings(random = Math.random) {
  const recipe = weightedPick(TOPPINGS.recipes, random);
  // Room for the most its pieces can have, filled as they are made, then cut to what they took: kept from one pizza to
  // the next (its parts are copied into the pizza's own mesh at once, src/rock.js withParts).
  const most = MOST_PIECES * PIECE_TRIANGLES;   // the largest recipe's, so the room is made once
  if (toppingRoom.triangles < most) Object.assign(toppingRoom, { triangles: most, positions: new Float32Array(most * 9), normals: new Float32Array(most * 9), colors: new Float32Array(most * 9), uvs: new Float32Array(most * 6) });
  const out = { positions: toppingRoom.positions, normals: toppingRoom.normals, colors: toppingRoom.colors, uvs: toppingRoom.uvs, count: 0 };
  const placed = [];
  let share = 0;
  // The biggest pieces first, so the small ones fill between them.
  const pieces = Object.entries(recipe.pieces).sort(([first], [second]) => TOPPINGS.pieces[second].size - TOPPINGS.pieces[first].size);
  for (const [kind, count] of pieces) {
    const piece = TOPPINGS.pieces[kind];
    for (let index = 0; index < count; index++) {
      const size = piece.size * (0.85 + 0.3 * random());
      const reach = PIZZA.crustFrom - TOPPINGS.margin - size;
      // Somewhere on the cheese clear of what is there, or, failing that, wherever it fell last.
      let pieceX = 0, pieceZ = 0;
      for (let attempt = 0; attempt < TOPPINGS.tries; attempt++) {
        const angle = random() * Math.PI * 2, along = Math.sqrt(random()) * reach;
        pieceX = along * Math.cos(angle); pieceZ = along * Math.sin(angle);
        if (placed.every((other) => Math.hypot(other.x - pieceX, other.z - pieceZ) > 0.85 * (other.size + size))) break;
      }
      placed.push({ x: pieceX, z: pieceZ, size });
      addPiece(out, piece, pieceX, pieceZ, random() * Math.PI * 2, size, 0.9 + 0.2 * random(), random);
      share += piece.share * (size / piece.size) ** 2;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(out.positions.subarray(0, out.count * 9), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(out.normals.subarray(0, out.count * 9), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(out.colors.subarray(0, out.count * 9), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(out.uvs.subarray(0, out.count * 6), 2));
  return { geometry, share, name: recipe.name };
}

/** `base` with `parts` added (both of separate triangles, the same attributes): a new geometry; neither is changed. */
export function withParts(base, parts) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(base.attributes)) {
    const extra = parts.attributes[name];
    const array = new Float32Array(attribute.array.length + (extra?.array.length ?? 0));
    array.set(attribute.array);
    if (extra) array.set(extra.array, attribute.array.length);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize));
  }
  return geometry;
}

// A watermelon: an oval (WATERMELON.long along x, its other axes to keep a
// unit ball's volume), dark green with paler green stripes that wander from
// end to end, a yellow field spot where it lay, and a stalk's nub at one end.
// Smooth, then cut into separate triangles (src/rock.js integrates its shape).
const WATERMELON = {
  long: 1.18, stripes: 16, wander: 0.35,
  dark: linear(30, 74, 30), pale: linear(118, 160, 70), field: linear(214, 196, 110), nub: linear(110, 90, 50),
};

/** A watermelon's geometry (the header). */
export function createWatermelonGeometry() {
  const { positions, indices } = icosphere(4);
  const across = 1 / Math.sqrt(WATERMELON.long);   // long·across² = 1: a unit ball's volume
  const colors = new Float32Array(positions.length);
  const color = new THREE.Color();
  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    const x = positions[vertex], y = positions[vertex + 1], z = positions[vertex + 2];
    // Stripes round its long axis, wandering as they run end to end.
    const around = Math.atan2(z, y) + WATERMELON.wander * Math.sin(3 * x + 1.3) + 0.15 * (valueNoise3(x * 3, y * 3, z * 3) - 0.5);
    const stripe = 0.5 + 0.5 * Math.sin(around * WATERMELON.stripes / 2);
    const jagged = smoothstep(0.45, 0.75, stripe + 0.25 * (valueNoise3(x * 14, y * 14, z * 14) - 0.5));
    color.copy(WATERMELON.dark).lerp(WATERMELON.pale, jagged * 0.85);
    // The field spot, on its underside as it grew.
    color.lerp(WATERMELON.field, smoothstep(-0.55, -0.85, y) * smoothstep(0.8, 0.2, Math.abs(x)) * 0.85);
    if (x > 0.96) color.lerp(WATERMELON.nub, smoothstep(0.96, 0.995, x));
    positions[vertex] = x * WATERMELON.long; positions[vertex + 1] = y * across; positions[vertex + 2] = z * across;
    colors[vertex] = color.r; colors[vertex + 1] = color.g; colors[vertex + 2] = color.b;
  }
  const smooth = new THREE.BufferGeometry();
  smooth.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  smooth.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  smooth.setIndex(indices);
  smooth.computeVertexNormals();
  const geometry = smooth.toNonIndexed();
  smooth.dispose();
  return geometry;
}

// A brick: a box of BRICK's proportions (its half-length 1), its edges
// rounded by BRICK.round, mottled red-orange clay flecked with darker grains
// and pale mortar crumbs; a grid on each face, so the mottling has room.
const BRICK = {
  half: [1, 0.3023, 0.4767],   // 215 × 65 × 102.5 mm, by its half-length
  round: 0.04, cells: 18,
  clay: linear(196, 98, 58), dark: linear(138, 60, 38), light: linear(222, 138, 92), mortar: linear(212, 202, 184),
};

/** A brick's geometry (the header), separate triangles, its normals the rounded box's. */
export function createBrickGeometry() {
  const [halfX, halfY, halfZ] = BRICK.half;
  const inner = [halfX - BRICK.round, halfY - BRICK.round, halfZ - BRICK.round];
  const color = new THREE.Color();
  const positions = [], normals = [], colors = [];
  // A face's corner (each axis in −1..1 across the face) on the rounded box: the point on the inner box, out along its normal by the rounding.
  const onBox = (point) => {
    const box = [point[0] * halfX, point[1] * halfY, point[2] * halfZ];
    const core = box.map((value, axis) => Math.min(Math.max(value, -inner[axis]), inner[axis]));
    const out = box.map((value, axis) => value - core[axis]);
    const length = Math.hypot(...out) || 1;
    const normal = out.map((value) => value / length);
    return { position: core.map((value, axis) => value + normal[axis] * BRICK.round), normal };
  };
  const paint = ([x, y, z]) => {
    const grain = valueNoise3(x * 9, y * 9, z * 9), fleck = valueNoise3(x * 40 + 3, y * 40, z * 40);
    color.copy(BRICK.clay).lerp(BRICK.light, smoothstep(0.55, 0.85, grain) * 0.7).lerp(BRICK.dark, smoothstep(0.45, 0.15, grain) * 0.6);
    if (fleck > 0.86) color.lerp(BRICK.dark, 0.6);
    if (fleck < 0.08) color.lerp(BRICK.mortar, 0.7);
    return [color.r, color.g, color.b];
  };
  // Each of the six faces as a grid of BRICK.cells along its longer side.
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const [first, second] = [0, 1, 2].filter((other) => other !== axis);
    const columns = Math.max(2, Math.round(BRICK.cells * BRICK.half[first])), rows = Math.max(2, Math.round(BRICK.cells * BRICK.half[second]));
    const corner = (column, row) => {
      const point = [0, 0, 0];
      point[axis] = sign;
      point[first] = -1 + (2 * column) / columns;
      point[second] = -1 + (2 * row) / rows;
      return onBox(point);
    };
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const a = corner(column, row), b = corner(column + 1, row), c = corner(column + 1, row + 1), d = corner(column, row + 1);
        // Wound to face out on every side.
        const quad = sign * (axis === 1 ? -1 : 1) > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
        for (const vertex of quad) {
          positions.push(...vertex.position);
          normals.push(...vertex.normal);
          colors.push(...paint(vertex.position));
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// A shard of ice (src/ice.js: a piece of the sheet a thing broke through,
// src/things.js 'ice-shard'): a slab of the sheet's thickness whose outline
// is its piece's (`piece`: its corners about its middle, convex, in unit
// radii in the sheet's plane, its own +y up, and its thickness in unit
// radii), so each one is its own and none is built twice. Its edges are
// broken: each side cut into two to four, each cut point off the side's line
// by up to SHARD_LOOK.jag of its length, the outline then scaled about its
// middle to the piece's own area (its mass and its volume stay ice's). It
// is clear ice, seen through: its `clearShare` (an attribute, 0 to 1) is how
// much of what lies under it shows through (src/rock.js `seenThrough`, a
// look that draws it so; under the water, where ice and water bend light
// all but alike, it is drawn from above only as src/rock.js says), the rest
// its own light: its top and bottom as milky as the sheet's clear ice for
// its thickness (its piece's `milk`) and clouded white by its piece's
// `white` share (the sheet's snow ice and frozen bubbles); a
// band SHARD_LOOK.rim of the way in from its rim whiter and less clear, its
// normals tipped out toward the edge by SHARD_LOOK.round (a broken edge,
// rounded as it melts, catches the light); its broken sides glassy, a
// little frosted, half seen through. With no
// piece (a thing defined or thrown plain, tools/thing-probe.mjs) it is
// SHARD_LOOK.plain's: a broken hexagon.
const SHARD_LOOK = {
  clear: linear(10, 13, 16), white: linear(206, 214, 224), edge: linear(150, 166, 182), side: linear(120, 136, 152),
  rim: 0.06,          // the whiter band round its top, of the way in from its rim
  edgeWhite: 0.6,     // the band's colour over the top's at its edge, for clear ice
  through: 0.92,      // the share of what is under it a clear piece shows (the rest its milk)...
  rimThrough: 0.55,   // ...at its edge...
  sideThrough: 0.5,   // ...and through a side (a fresh break in clear ice is glassy, a little frosted)
  jag: 0.05,          // how far a cut point is off its side's line, at most, of the side's length
  round: 0.6,         // radians the band's normals are tipped out at the edge
  milk: 0.15,         // its clear ice's milk, without a piece's own (src/ice.js: the sheet's, for its thickness)
  plain: { corners: [1, 0, 0.55, 0.78, -0.45, 0.9, -1, 0.05, -0.52, -0.82, 0.48, -0.8], thickness: 0.15, white: 0.2 },
};

/** A polygon's area (of either winding), corners [x0, z0, …]. */
function outlineArea(corners) {
  let twice = 0;
  for (let index = 0, count = corners.length / 2; index < count; index++) {
    const next = (index + 1) % count;
    twice += corners[2 * index] * corners[2 * next + 1] - corners[2 * next] * corners[2 * index + 1];
  }
  return Math.abs(twice) / 2;
}

/** A piece's outline broken along its sides (SHARD_LOOK.jag), at its own area: drawn from a stream seeded by its corners, so the same piece breaks alike. */
function brokenOutline(corners) {
  let state = 0;
  for (const value of corners) state = Math.imul(state ^ Math.round(value * 1e5), 0x9e3779b1) >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let mixed = Math.imul(state ^ (state >>> 15), 1 | state); mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed); return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296; };
  const count = corners.length / 2, broken = [];
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const ax = corners[2 * index], az = corners[2 * index + 1], bx = corners[2 * next], bz = corners[2 * next + 1];
    const length = Math.hypot(bx - ax, bz - az) || 1, acrossX = -(bz - az) / length, acrossZ = (bx - ax) / length;
    const cuts = 2 + Math.floor(3 * random());
    broken.push(ax, az);
    for (let cut = 1; cut < cuts; cut++) {
      const along = (cut + 0.6 * (random() - 0.5)) / cuts, off = SHARD_LOOK.jag * length * (2 * random() - 1);
      broken.push(ax + (bx - ax) * along + acrossX * off, az + (bz - az) * along + acrossZ * off);
    }
  }
  const scale = Math.sqrt(outlineArea(corners) / Math.max(outlineArea(broken), 1e-12));
  return broken.map((value) => value * scale);
}

/**
 * A shard's geometry (the header) for its `piece` ({ corners, thickness,
 * white }), separate triangles wound outward: its top and bottom fanned
 * from its middle to a ring SHARD_LOOK.rim in from its broken rim, and a
 * band from there to its rim, its normals tipped out at the rim; a quad for
 * each side. Its `clearShare` per vertex says how much shows through.
 */
export function createShardGeometry(piece = SHARD_LOOK.plain) {
  const corners = brokenOutline(piece.corners), count = corners.length / 2, half = piece.thickness / 2;
  const positions = [], normals = [], colors = [], clearShares = [];
  // Its white: its snow ice, and its clear ice's milk (the sheet's, for its thickness: src/ice.js).
  const white = piece.white + (1 - piece.white) * (piece.milk ?? SHARD_LOOK.milk);
  const middle = new THREE.Color().copy(SHARD_LOOK.clear).lerp(SHARD_LOOK.white, white).toArray();
  const rim = new THREE.Color().fromArray(middle).lerp(SHARD_LOOK.edge, SHARD_LOOK.edgeWhite * (1 - white)).toArray();
  const side = SHARD_LOOK.side.toArray();
  const middleThrough = SHARD_LOOK.through * (1 - white), rimThrough = SHARD_LOOK.rimThrough * (1 - white);
  const inset = 1 - SHARD_LOOK.rim;
  const tipUp = Math.cos(SHARD_LOOK.round), tipOut = Math.sin(SHARD_LOOK.round);
  // The way round its corners: counter-clockwise seen from above (+y) is (u, w) turning from +w to +u.
  let twice = 0;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    twice += corners[2 * index + 1] * corners[2 * next] - corners[2 * index] * corners[2 * next + 1];
  }
  const order = twice >= 0 ? 1 : -1;
  const push = (point, normal, tint, through) => { positions.push(...point); normals.push(...normal); colors.push(...tint); clearShares.push(through); };
  for (let step = 0; step < count; step++) {
    const index = order > 0 ? step : count - 1 - step, next = order > 0 ? (step + 1) % count : (2 * count - 2 - step) % count;
    const ax = corners[2 * index], az = corners[2 * index + 1], bx = corners[2 * next], bz = corners[2 * next + 1];
    const innerAX = ax * inset, innerAZ = az * inset, innerBX = bx * inset, innerBZ = bz * inset;
    const length = Math.hypot(bx - ax, bz - az) || 1;
    const outX = -(bz - az) / length, outZ = (bx - ax) / length;   // this side's outward normal, level
    // Its top and bottom: a triangle from its middle to the ring, and the band from the ring to this side, its normals
    // tipped out at the rim.
    for (const [y, up] of [[half, 1], [-half, -1]]) {
      const flat = [0, up, 0], tipped = [outX * tipOut, up * tipUp, outZ * tipOut];
      const triangle = (first, second, third) => (up > 0 ? [first, second, third] : [first, third, second]);
      for (const corner of triangle([[0, y, 0], flat, middle, middleThrough], [[innerAX, y, innerAZ], flat, middle, middleThrough], [[innerBX, y, innerBZ], flat, middle, middleThrough])) push(...corner);
      for (const corner of triangle([[innerAX, y, innerAZ], flat, middle, middleThrough], [[ax, y, az], tipped, rim, rimThrough], [[bx, y, bz], tipped, rim, rimThrough])) push(...corner);
      for (const corner of triangle([[innerAX, y, innerAZ], flat, middle, middleThrough], [[bx, y, bz], tipped, rim, rimThrough], [[innerBX, y, innerBZ], flat, middle, middleThrough])) push(...corner);
    }
    // This side, outward (its normal across the side, level).
    const normal = [outX, 0, outZ];
    for (const point of [[ax, half, az], [ax, -half, az], [bx, -half, bz], [ax, half, az], [bx, -half, bz], [bx, half, bz]]) push(point, normal, side, SHARD_LOOK.sideThrough);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('clearShare', new THREE.Float32BufferAttribute(clearShares, 1));
  return geometry;
}

// A fruit pie in its tin: a solid turned about its axis from a profile
// (PIE.profile: the tin's floor and its flared, fluted wall, its flange, the
// crust's crimped rim and the domed top crust), PIE.segments round, its
// rim crimped PIE.crimps times round. Its unit radius is the rim's. Coloured
// per vertex: the tin's dull aluminium, the crust golden, browner at its
// edges and where it rose. Each pie thrown is one of PIE.fillings drawn at
// random (registerMesh `dress`, pieFilling): apple under a closed crust
// with steam vents, cherry or blueberry under a lattice, or an open pumpkin
// custard; its filling and lattice are parts laid over the top crust (each
// filling's made once, every pie of it sharing them; the shared solid's
// buoyancy is the pie's), and the filling's
// weight over an apple pie's is its `share`. Smooth, then cut into separate
// triangles.
const PIE = {
  segments: 96, crimps: 26,
  // (radius, height, part) from the floor's middle out, up the tin, over the rim and in over the top.
  profile: [
    [0, -0.22, 'tin'], [0.4, -0.22, 'tin'], [0.78, -0.22, 'tin'], [0.81, -0.21, 'tin'], [0.88, -0.05, 'tin'], [0.94, 0.07, 'tin'], [1.0, 0.085, 'tin'],
    [1.0, 0.1, 'rim'], [0.98, 0.15, 'rim'], [0.92, 0.18, 'rim'], [0.85, 0.16, 'rim'], [0.82, 0.13, 'crust'],
    [0.7, 0.15, 'crust'], [0.55, 0.18, 'crust'], [0.4, 0.2, 'crust'], [0.2, 0.215, 'crust'], [0, 0.22, 'crust'],
  ],
  crimp: 0.025,   // the rim's fluting, in R
  flute: 0.012,   // the tin wall's
  tin: linear(176, 178, 184), tinDark: linear(120, 122, 128), crust: linear(214, 152, 78), brown: linear(150, 88, 36), pale: linear(232, 190, 120),
  fillings: [
    { name: 'Apple', weight: 3, top: 'closed', share: 0, colour: [214, 170, 92], dark: [170, 120, 50] },
    { name: 'Cherry', weight: 2, top: 'lattice', share: 0.22, colour: [150, 18, 34], dark: [86, 8, 20] },
    { name: 'Blueberry', weight: 2, top: 'lattice', share: 0.2, colour: [62, 40, 96], dark: [28, 18, 52] },
    { name: 'Pumpkin', weight: 2, top: 'open', share: 0.1, colour: [204, 112, 40], dark: [168, 82, 26] },
  ],
  lattice: { strips: 5, width: 0.11, thick: 0.03, lift: 0.01, reach: 0.86 },
  vents: { count: 5, length: 0.16, width: 0.025, from: 0.22 },
};

const PIE_CRUST = PIE.profile.filter(([, , part]) => part === 'crust');   // the top crust's rows, from its rim in (pieTop)

/** The height (in R) of the pie's top crust at `radius` from its middle: the profile's, between its rows. */
function pieTop(radius) {
  const rows = PIE_CRUST;
  for (let index = 0; index + 1 < rows.length; index++) {
    const [outer, outerHeight] = rows[index], [inner, innerHeight] = rows[index + 1];
    if (radius <= outer && radius >= inner) return innerHeight + (outerHeight - innerHeight) * (radius - inner) / Math.max(outer - inner, 1e-9);
  }
  return rows[0][1];
}

/** A pie's solid (the header): its tin and crust, a colour per vertex. */
export function createPieGeometry() {
  const profile = PIE.profile, rows = profile.length, columns = PIE.segments + 1;
  const positions = new Float32Array(columns * rows * 3), colors = new Float32Array(columns * rows * 3);
  const color = new THREE.Color();
  for (let column = 0; column < columns; column++) {
    const angle = (column / PIE.segments) * Math.PI * 2;
    const crimp = Math.cos(PIE.crimps * angle), flute = Math.cos(3 * PIE.crimps * angle);
    profile.forEach(([radius, height, part], row) => {
      let out = radius, y = height;
      if (part === 'rim') { out += PIE.crimp * crimp * Math.min(radius - 0.8, 0.15) / 0.15; y += 0.5 * PIE.crimp * crimp; }
      if (part === 'tin' && height > -0.21 && radius < 1) out += PIE.flute * flute;
      const x = out * Math.cos(angle), z = out * Math.sin(angle);
      positions.set([x, y, z], (column * rows + row) * 3);
      if (part === 'tin') color.copy(PIE.tin).lerp(PIE.tinDark, 0.35 * (0.5 + 0.5 * flute) + (height <= -0.22 ? 0.3 : 0));
      else {
        // Golden, browner on the crimps' crests and the rim's top, paler in the dome's hollows.
        const browned = part === 'rim' ? 0.35 + 0.4 * Math.max(crimp, 0) : 0.25 * valueNoise3(x * 5, 0, z * 5) + 0.25 * smoothstep(0.5, 0.82, radius);
        color.copy(PIE.crust).lerp(PIE.pale, 0.3 * (1 - browned)).lerp(PIE.brown, browned);
      }
      colors.set([color.r, color.g, color.b], (column * rows + row) * 3);
    });
  }
  return turnedMesh({ position: positions, color: colors }, profile.map(([radius]) => radius), PIE.segments);
}

const PIE_FILLINGS = new Map();   // each filling's parts, made once (pieFilling)

/**
 * A pie's filling (the header), drawn from `random`: its parts, their
 * weight's share over an apple pie's and the filling's name. Each filling's
 * parts are made once (the first pie made makes them all) and every pie
 * filled with it shares them (`shared`: src/rock.js copies them into its own
 * mesh and leaves them be).
 */
export function pieFilling(random = Math.random) {
  if (PIE_FILLINGS.size === 0) PIE.fillings.forEach((filling, index) => PIE_FILLINGS.set(filling.name, fillingParts(filling, seeded(11 + index))));
  const filling = weightedPick(PIE.fillings, random);
  return { geometry: PIE_FILLINGS.get(filling.name), share: filling.share, name: filling.name, shared: true };
}

/**
 * One filling's parts (pieFilling), lumped and its vents turned by `random`:
 * a filling's surface over the top crust, inside the rim, lumpy with fruit,
 * under a lattice of crust strips; or the closed crust's steam vents.
 */
function fillingParts(filling, random) {
  const positions = [], normals = [], colors = [];
  const colour = linear(...filling.colour), dark = linear(...filling.dark);
  // A triangle of its corners, counter-clockwise seen from outside, each with its colour.
  const triangle = (first, second, third, firstTint, secondTint, thirdTint) => {
    const alongX = second[0] - first[0], alongY = second[1] - first[1], alongZ = second[2] - first[2], acrossX = third[0] - first[0], acrossY = third[1] - first[1], acrossZ = third[2] - first[2];
    let nx = alongY * acrossZ - alongZ * acrossY, ny = alongZ * acrossX - alongX * acrossZ, nz = alongX * acrossY - alongY * acrossX;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length; ny /= length; nz /= length;
    positions.push(first[0], first[1], first[2], second[0], second[1], second[2], third[0], third[1], third[2]);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    colors.push(firstTint.r, firstTint.g, firstTint.b, secondTint.r, secondTint.g, secondTint.b, thirdTint.r, thirdTint.g, thirdTint.b);
  };
  const seed = random() * 100;
  if (filling.top !== 'closed') {
    // The filling's surface: rings round its middle out to the rim's inside, a little over the crust, lumpy with fruit.
    const rings = 8, round = 40, reach = 0.83, over = 0.012;
    // Each of its grid's points, and its colour, once.
    const points = [], shades = [];
    for (let ring = 0; ring <= rings; ring++) {
      for (let step = 0; step <= round; step++) {
        const radius = reach * ring / rings, angle = (step / round) * Math.PI * 2;
        const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
        const fruit = valueNoise3(x * 9 + seed, 1, z * 9);
        const lump = filling.top === 'open' ? 0.006 * fruit : 0.025 * fruit;
        points.push([x, pieTop(radius) + over + lump, z]);
        // Its fruit dark where it is heaped (the same noise as its lumps); a custard browner to its edge.
        shades.push(colour.clone().lerp(dark, filling.top === 'open' ? 0.3 * smoothstep(0.6, 0.83, radius) : smoothstep(0.35, 0.75, fruit)));
      }
    }
    const at = (ring, step) => ring * (round + 1) + step;
    for (let ring = 0; ring < rings; ring++) {
      for (let step = 0; step < round; step++) {
        const here = at(ring, step), out = at(ring + 1, step), outNext = at(ring + 1, step + 1), next = at(ring, step + 1);
        if (ring > 0) triangle(points[here], points[next], points[outNext], shades[here], shades[next], shades[outNext]);
        triangle(points[here], points[outNext], points[out], shades[here], shades[outNext], shades[out]);
      }
    }
  }
  if (filling.top === 'lattice') {
    // Crust strips over it, two ways across, each following the top's dome, its ends at the rim.
    const { strips, width, thick, lift, reach } = PIE.lattice;
    for (const across of [false, true]) {
      for (let strip = 0; strip < strips; strip++) {
        const offset = reach * ((strip + 0.5) / strips * 2 - 1) * 0.86;
        const half = Math.sqrt(Math.max(reach * reach - offset * offset, 0));
        const steps = 12;
        // Its corners along it, each step's once: its top and its underside, either edge (woven over the strips the other
        // way where they cross), and its crust's colour there, browner to its ends.
        const corners = [], tints = [];
        for (let step = 0; step <= steps; step++) {
          const along = step / steps, lengthwise = -half + 2 * half * along;
          const row = [];
          for (const side of [-1, 1]) {
            const sideways = offset + side * width / 2;
            const x = across ? sideways : lengthwise, z = across ? lengthwise : sideways;
            const bottom = pieTop(Math.min(Math.sqrt(x * x + z * z), 0.82)) + lift + (across ? 0 : thick * 0.6) + 0.02;
            row.push([x, bottom + thick, z], [x, bottom, z]);
          }
          corners.push(row);
          tints.push(new THREE.Color().copy(PIE.crust).lerp(PIE.brown, 0.15 + 0.35 * Math.abs(along - 0.5)).lerp(PIE.pale, 0.2 * valueNoise3(along * 6 + strip, seed, 0)));
        }
        for (let step = 0; step < steps; step++) {
          const [leftTop, leftBottom, rightTop, rightBottom] = corners[step], [nextLeftTop, nextLeftBottom, nextRightTop, nextRightBottom] = corners[step + 1];
          const near = tints[step], far = tints[step + 1];
          // Its top, facing up whichever way it runs, and its two sides, facing out.
          if (across) { triangle(leftTop, rightTop, nextRightTop, near, near, far); triangle(leftTop, nextRightTop, nextLeftTop, near, far, far); }
          else { triangle(leftTop, nextLeftTop, nextRightTop, near, far, far); triangle(leftTop, nextRightTop, rightTop, near, far, near); }
          for (const [top, bottom, nextTop, nextBottom, outward] of [[leftTop, leftBottom, nextLeftTop, nextLeftBottom, false], [rightTop, rightBottom, nextRightTop, nextRightBottom, true]]) {
            if (outward !== across) { triangle(top, nextTop, nextBottom, near, far, far); triangle(top, nextBottom, bottom, near, far, near); }
            else { triangle(top, nextBottom, nextTop, near, far, far); triangle(top, bottom, nextBottom, near, near, far); }
          }
        }
      }
    }
  }
  if (filling.top === 'closed') {
    // Steam vents slit in the crust round its middle, the filling showing dark in them.
    const { count, length, width, from } = PIE.vents;
    for (let vent = 0; vent < count; vent++) {
      const angle = (vent / count) * Math.PI * 2 + random() * 0.3;
      const along = [Math.cos(angle), Math.sin(angle)], across = [-along[1], along[0]];
      const corner = (distance, side) => {
        const x = along[0] * distance + across[0] * side * width / 2, z = along[1] * distance + across[1] * side * width / 2;
        return [x, pieTop(Math.hypot(x, z)) + 0.004, z];
      };
      const nearLeft = corner(from, -1), farLeft = corner(from + length, -1), farRight = corner(from + length, 1), nearRight = corner(from, 1), middle = corner(from + length / 2, 0);
      triangle(nearLeft, middle, farLeft, dark, colour, dark);
      triangle(farLeft, middle, farRight, dark, colour, dark);
      triangle(farRight, middle, nearRight, dark, colour, dark);
      triangle(nearRight, middle, nearLeft, dark, colour, dark);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// ---- the toys ----------------------------------------------------------------

// A rubber duck: a smooth union of ellipsoids (DUCK.parts: its body, flat
// underneath, its tail turned up behind, its head over its breast and its flat
// bill), the surface found along each ray of an icosphere cast from DUCK.cast
// (the outermost crossing, so the mesh never folds), scaled so that it is 2
// long from its tail's tip to its bill's (its nominal radius is half its
// length). Painted per vertex: yellow, a little warmer on its wings, its bill
// orange, black eyes with a glint. Smooth, then cut into separate triangles
// (src/rock.js integrates its shape over them).
const DUCK = {
  detail: 4, march: 0.04,   // the icosphere's subdivisions, and the step out along each ray before it is bisected
  cast: [0.12, 0.3, 0],     // where the rays start, between its body and head
  blend: 0.16,              // the smooth union's reach (the neck, the tail's root)
  base: -0.42,              // its flat underside
  parts: {
    body: { centre: [0, 0, 0], radii: [0.95, 0.6, 0.7] },
    tail: { centre: [-0.78, 0.2, 0], radii: [0.32, 0.18, 0.24], tilt: 0.6 },
    head: { centre: [0.5, 0.8, 0], radii: [0.42, 0.4, 0.38] },
    bill: { centre: [0.93, 0.7, 0], radii: [0.3, 0.075, 0.18], tilt: -0.15 },
  },
  eye: { height: 0.92, forward: 0.68, aside: 0.27, radius: 0.075 },
  yellow: linear(250, 205, 30), wing: linear(236, 170, 20), orange: linear(242, 110, 20), black: linear(16, 14, 12), glint: linear(255, 255, 250),
};

/** An ellipsoid's signed distance, roughly (its radii's least times how far out of it in its own units), turned by `tilt` about z. */
function ellipsoidDistance(x, y, z, { centre, radii, tilt = 0 }) {
  let dx = x - centre[0], dy = y - centre[1];
  const dz = z - centre[2];
  if (tilt) { const cos = Math.cos(tilt), sin = Math.sin(tilt), turned = cos * dx + sin * dy; dy = -sin * dx + cos * dy; dx = turned; }
  const ux = dx / radii[0], uy = dy / radii[1], uz = dz / radii[2];
  return (Math.sqrt(ux * ux + uy * uy + uz * uz) - 1) * (radii[0] < radii[1] ? (radii[0] < radii[2] ? radii[0] : radii[2]) : radii[1] < radii[2] ? radii[1] : radii[2]);
}

/** A smooth union of two distances (a polynomial smooth minimum of reach `blend`). */
function smoothUnion(first, second, blend) {
  const share = Math.min(Math.max(0.5 + 0.5 * (second - first) / blend, 0), 1);
  return second + (first - second) * share - blend * share * (1 - share);
}

/** The duck's signed distance at (x, y, z), before it is scaled (the header). */
function duckDistance(x, y, z) {
  const { parts } = DUCK;
  let body = smoothUnion(ellipsoidDistance(x, y, z, parts.body), ellipsoidDistance(x, y, z, parts.tail), DUCK.blend);
  body = Math.max(body, DUCK.base - y);   // flat underneath
  const head = smoothUnion(ellipsoidDistance(x, y, z, parts.head), ellipsoidDistance(x, y, z, parts.bill), 0.05);
  return smoothUnion(body, head, DUCK.blend);
}

/** A rubber duck's geometry (the header): 2 long, painted per vertex. */
export function createDuckGeometry() {
  if (!ballCache.has('duck')) {
    const { positions, indices } = icosphere(DUCK.detail);
    const [castX, castY, castZ] = DUCK.cast;
    // Its length, tail tip to bill tip, measured along the rays first: the scale that makes it 2.
    const surface = new Float64Array(positions.length / 3);
    for (let vertex = 0; vertex < surface.length; vertex++) {
      const dx = positions[vertex * 3], dy = positions[vertex * 3 + 1], dz = positions[vertex * 3 + 2];
      const at = (distance) => duckDistance(castX + dx * distance, castY + dy * distance, castZ + dz * distance);
      // Out from the cast in steps, to the last step still inside, then bisected to the surface.
      let inside = 0;
      for (let distance = DUCK.march; distance <= 2; distance += DUCK.march) if (at(distance) < 0) inside = distance;
      let low = inside, high = inside + DUCK.march;
      for (let iteration = 0; iteration < 16; iteration++) { const middle = 0.5 * (low + high); if (at(middle) < 0) low = middle; else high = middle; }
      surface[vertex] = 0.5 * (low + high);
    }
    let least = Infinity, most = -Infinity;
    for (let vertex = 0; vertex < surface.length; vertex++) {
      const x = castX + positions[vertex * 3] * surface[vertex];
      least = Math.min(least, x); most = Math.max(most, x);
    }
    const scale = 2 / (most - least), middleX = 0.5 * (least + most);
    const colors = new Float32Array(positions.length);
    const color = new THREE.Color();
    const { eye, parts } = DUCK;
    for (let vertex = 0; vertex < surface.length; vertex++) {
      const x = castX + positions[vertex * 3] * surface[vertex], y = castY + positions[vertex * 3 + 1] * surface[vertex], z = castZ + positions[vertex * 3 + 2] * surface[vertex];
      // The bill on the bill itself, where it is nearer than the head; the wings a warmer patch on each side of the body.
      const onBill = ellipsoidDistance(x, y, z, parts.bill);
      const bill = smoothstep(0.04, 0.01, onBill) * smoothstep(0.02, -0.02, onBill - ellipsoidDistance(x, y, z, parts.head));
      const wing = smoothstep(0.5, 0.62, Math.abs(z)) * smoothstep(0.45, 0.1, Math.abs(y - 0.1)) * smoothstep(0.7, 0.2, Math.abs(x + 0.15));
      color.copy(DUCK.yellow).lerp(DUCK.wing, 0.6 * wing).lerp(DUCK.orange, bill);
      // Its eyes, one each side of its head, a glint in each a little forward and up.
      const eyeDistance = Math.hypot(x - eye.forward, y - eye.height, Math.abs(z) - eye.aside);
      color.lerp(DUCK.black, smoothstep(eye.radius, 0.8 * eye.radius, eyeDistance));
      color.lerp(DUCK.glint, smoothstep(0.3 * eye.radius, 0.2 * eye.radius, Math.hypot(x - eye.forward - 0.025, y - eye.height - 0.025, Math.abs(z) - eye.aside)));
      positions[vertex * 3] = (x - middleX) * scale; positions[vertex * 3 + 1] = y * scale; positions[vertex * 3 + 2] = z * scale;
      colors[vertex * 3] = color.r; colors[vertex * 3 + 1] = color.g; colors[vertex * 3 + 2] = color.b;
    }
    const smooth = new THREE.BufferGeometry();
    smooth.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    smooth.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    smooth.setIndex(indices);
    smooth.computeVertexNormals();
    ballCache.set('duck', smooth.toNonIndexed());
    smooth.dispose();
  }
  return ballCache.get('duck').clone();
}

// ---- the kinds -------------------------------------------------------------

registerMesh('stone', {
  // Its lumps and tint are drawn from Math.random between its throw's own draws, as they always were (src/rock.js `random`).
  sharedStream: true,
  // The river stone's look is its own; another kind's squash, lumps and colouring are its look's ranges.
  check: (look) => {
    if (!STONE_PATTERNS.includes(look.pattern)) return [`look.pattern must be one of ${STONE_PATTERNS.join(', ')}`];
    if (look.pattern === 'river') return [];
    const problems = [];
    if (!numbersIn(look.squash, 4, 0, 2)) problems.push('look.squash must be four numbers from 0 to 2 (height least, spread; depth least, spread)');
    if (!(finite(look.lumps) && look.lumps >= 0 && look.lumps <= 3)) problems.push('look.lumps must be a number from 0 to 3');
    for (const field of ['hue', 'saturation', 'lightness']) if (!numbersIn(look[field], 2, 0, 1)) problems.push(`look.${field} must be two numbers from 0 to 1 (least, spread)`);
    return problems;
  },
  build: (definition, { flat = false } = {}) => createRockGeometry(undefined, { flat, look: definition.look }),
  // Its tint over its speckle: the river stone's as it always was (its draws too), another kind's from its look's ranges.
  color: (definition) => {
    const look = definition.look;
    if (look.pattern === 'river') return new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.08 + Math.random() * 0.1, 0.3 + Math.random() * 0.14);
    return new THREE.Color().setHSL(look.hue[0] + Math.random() * look.hue[1], look.saturation[0] + Math.random() * look.saturation[1], look.lightness[0] + Math.random() * look.lightness[1]);
  },
});
registerMesh('ball', {
  build: (definition) => createBallGeometry(definition), color: () => new THREE.Color(1, 1, 1),
  check: (look) => [
    ...(BALL_PAINTS.includes(look.paint) ? [] : [`look.paint must be one of ${BALL_PAINTS.join(', ')}`]),
    ...(look.paint !== 'plain' || numbersIn(look.color, 3, 0, 255) ? [] : ['a plain ball needs look.color, three numbers from 0 to 255']),
  ],
  // Each of its paints (a bowling ball's every pair of colours), painted now.
  prepare: (definition) => {
    const paints = definition.look.paint === 'bowling' ? BOWLING.shells.length : 1;
    for (let index = 0; index < paints; index++) createBallGeometry(definition, () => (index + 0.5) / paints).dispose();
  },
});
registerMesh('apple', { build: () => createAppleGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
registerMesh('watermelon', { build: () => createWatermelonGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
registerMesh('brick', { build: () => createBrickGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
registerMesh('pie', {
  build: () => createPieGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true,
  dress: (definition, random) => pieFilling(random), heaviest: Math.max(...PIE.fillings.map((filling) => filling.share)),
});
registerMesh('duck', { build: () => createDuckGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
// Each shard its own piece's (src/ice.js), so none is fixed; it draws no random numbers. Its volume is the plain one's.
registerMesh('shard', {
  build: (definition, { piece } = {}) => createShardGeometry(piece), color: () => new THREE.Color(1, 1, 1),
  volume: () => meshVolume(createShardGeometry()),
});
// Its material's colour: white, or its look's `tint` over its paint; `frost` (0 to 1) lays a pale bloom over it all,
// the material's emissive colour (a frozen pizza's: a uniform, so no program of its own).
registerMesh('pizza', {
  build: () => createPizzaGeometry(), texture: () => pizzaTexture(), fixed: true, dress: (definition, random) => pizzaToppings(random), heaviest: HEAVIEST_TOPPINGS,
  color: (definition) => (definition.look.tint ? new THREE.Color(...definition.look.tint.map((channel) => channel / 255)) : new THREE.Color(1, 1, 1)),
  glow: (definition) => (definition.look.frost ? new THREE.Color(0.62, 0.7, 0.8).multiplyScalar(definition.look.frost) : null),
  check: (look) => [
    ...(look.tint === undefined || numbersIn(look.tint, 3, 0, 255) ? [] : ['look.tint must be three numbers from 0 to 255']),
    ...(look.frost === undefined || (finite(look.frost) && look.frost >= 0 && look.frost <= 1) ? [] : ['look.frost must be a number from 0 to 1']),
  ],
});
// A gem's facets are lit at random, its cut never: its volume is any one's (its colours drawn from a still stream).
registerMesh('gem', {
  build: (definition) => createGemGeometry(definition), color: () => new THREE.Color(1, 1, 1), volume: (definition) => meshVolume(createGemGeometry(definition, () => 0.5)),
  check: (look) => [
    ...(numbersIn(look.color, 3, 0, 255) ? [] : ['look.color must be three numbers from 0 to 255']),
    ...(look.stretch === undefined || (finite(look.stretch) && look.stretch >= 0.5 && look.stretch <= 3) ? [] : ['look.stretch must be a number from 0.5 to 3']),
    ...(look.fire === undefined || (finite(look.fire) && look.fire >= 0 && look.fire <= 1) ? [] : ['look.fire must be a number from 0 to 1']),
    ...(look.contrast === undefined || numbersIn(look.contrast, 2, 0, 4) ? [] : ['look.contrast must be two numbers from 0 to 4']),
  ],
});
