// The meshes things are drawn with (src/things.js `look.mesh`; src/rock.js
// builds each thrown thing's from here), each a builder registered by kind
// (registerMesh) that makes a unit-sized geometry for a definition and the
// material's colour for it. The kinds:
//   - stone: the procedural stone (createRockGeometry), lumpy, worn smooth,
//     in its kind's squash, lumps and colouring (`look.pattern`: the river
//     stone's, which is the stone there always was, slate, granite, basalt,
//     pumice; stoneBase), flat for a skip (SKIP_STONE); its grain and relief
//     are drawn pixel by pixel (src/shaders/stone.js), and the physics walks
//     a coarser mesh of the same surface (its geometry's `userData.physics`);
//   - ball: an icosphere of SUBDIVISIONS painted per vertex
//     (createBallGeometry, `look.paint`: a basketball's seams, a tennis
//     ball's, a golf ball's dimples, a bowling ball's swirl and finger holes,
//     or plain in `look.color`), pressed in where it is grooved, dimpled or
//     drilled, with coarser meshes of it (its `userData.detail`) to draw
//     when it is small on the screen;
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
//   - tv and iphone: closed rectangular slabs with rounded corners, their
//     screens on +y; vertex colours draw the bezel, glass, phone wallpaper,
//     camera lenses and TV vents (createDeviceGeometry). Both share the
//     stone's material program and cache their geometry between throws;
//   - pie: a fruit pie in its tin, its rim crimped, each one thrown filled
//     at random (pieFilling: apple under a closed crust, cherry or blueberry
//     under a lattice, open pumpkin; createPieGeometry);
//   - duck: a rubber duck, a smooth union of ellipsoids, yellow, its bill
//     orange (createDuckGeometry);
//   - banana: a ridged tube swept along a curved spine, yellow with sugar
//     spots, its stem and blossom end dark, scaled to a unit ball's volume
//     (createBananaGeometry);
//   - bread: a slice of a sandwich loaf, a slab of its outline with its rim
//     rounded (slabMesh), pale pitted crumb inside golden crust
//     (createBreadGeometry);
//   - cake: a frosted birthday cake turned from a profile, piped borders,
//     sprinkles, each one thrown with one to six candles drawn at random
//     (createCakeGeometry, cakeCandles);
//   - snowball: a lumpy ball pressed flat where the palms packed it, white,
//     bluish in its hollows (createSnowballGeometry);
//   - slide: a toddler's moulded slide, its side panels, steps, platform,
//     chute and rails each a slab of their own (createSlideGeometry).
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
const COARSEST_BALL = 2;             // a ball's coarsest mesh (createBallGeometry `detail`): 162 vertices, 320 triangles
// A flat stone, picked for skipping (src/rock.js): its short axis 0.26 to 0.38 of its long one (a river stone's 0.62 to 0.82); its surface noise, of a river stone's.
export const SKIP_STONE = { squash: [0.26, 0.12], surfaceNoise: 0.6 };

const MESHES = new Map();

/**
 * Register a mesh's kind: `build(definition, { flat, piece })` returns its
 * unit-sized geometry (a colour per vertex, a list of separate triangles
 * unless its `userData.physics` holds one: src/rock.js integrates the
 * thing's shape over them, walks them for its lowest point and cuts them
 * into its buoyancy's columns, while the geometry itself is only drawn, as a
 * stone's finer mesh is; `userData.stone`, a stone's grain's kind and seed,
 * src/shaders/stone.js; `userData.detail`, coarser meshes of it, which
 * src/rock.js showDetail draws when it is small on the screen, kept with the
 * kind and never disposed: { coarser: [{ geometry, spacing }], coarsest
 * first, spacing } (`spacing`, the most its corners lie apart, in radii);
 * `flat`, a stone picked for skipping; `piece`, a
 * shard's own outline, which src/rock.js is given and passes on), `color(definition)` the
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
 * whether a thing that floats plain may sink dressed). `length(definition)`,
 * for a kind whose nominal radius is not half its length (a banana's is its
 * ball's of like volume), is its length in its unit radii, which src/things.js
 * shows as its size (unitLength); without one it is two (a diameter).
 */
export function registerMesh(kind, { build, color, texture = null, glow = null, fixed = false, volume = null, prepare = null, check = null, sharedStream = false, dress = null, heaviest = 0, length = null }) {
  MESHES.set(kind, { build, color, texture, glow, fixed, prepare, check, sharedStream, dress, heaviest, length, volume: volume ?? (fixed ? (definition) => meshVolume(build(definition, {})) : null) });
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

const LENGTHS = new WeakMap();   // definition → its mesh's unit length, measured once

/** The length of `definition`'s mesh in its unit radii (registerMesh `length`), measured once; 2 for a kind that has none. */
export function unitLength(definition) {
  const length = meshKind(definition.look?.mesh)?.length;
  if (!length) return 2;
  if (!LENGTHS.has(definition)) LENGTHS.set(definition, length(definition));
  return LENGTHS.get(definition);
}

/** The volume a closed geometry of separate triangles (no index) encloses: the sum of the tetrahedra its faces make with the origin. */
export function meshVolume(geometry) {
  const positions = cornersOf(geometry);
  let volume = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const bx = positions[index + 3], by = positions[index + 4], bz = positions[index + 5];
    const cx = positions[index + 6], cy = positions[index + 7], cz = positions[index + 8];
    volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

/** The corners of `mesh`'s separate triangles: a geometry's position attribute's array, or a position attribute's own (a stone's physics mesh, its geometry's `userData.physics`). */
export function cornersOf(mesh) { return (mesh.isBufferAttribute ? mesh : mesh.attributes.position).array; }

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

/** valueNoise3 with its gradient, into `gradient` (a Vector3): the same sum, each lattice value weighted by the slope of its weights too. */
function valueNoise3WithGradient(x, y, z, gradient) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const slopeX = 6 * fx * (1 - fx), slopeY = 6 * fy * (1 - fy), slopeZ = 6 * fz * (1 - fz);
  let result = 0, gradientX = 0, gradientY = 0, gradientZ = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const weightX = dx ? sx : 1 - sx, weightY = dy ? sy : 1 - sy, weightZ = dz ? sz : 1 - sz;
    const value = hash3(ix + dx, iy + dy, iz + dz);
    result += weightX * weightY * weightZ * value;
    gradientX += (dx ? slopeX : -slopeX) * weightY * weightZ * value;
    gradientY += weightX * (dy ? slopeY : -slopeY) * weightZ * value;
    gradientZ += weightX * weightY * (dz ? slopeZ : -slopeZ) * value;
  }
  gradient.set(gradientX, gradientY, gradientZ);
  return result;
}

// The icosahedron: twelve corners on the unit sphere and twenty faces, facing out (icosphere, stoneLattice).
const GOLDEN = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON = {
  corners: [
    [-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0],
    [0, -1, GOLDEN], [0, 1, GOLDEN], [0, -1, -GOLDEN], [0, 1, -GOLDEN],
    [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1],
  ].map(([x, y, z]) => { const length = Math.hypot(x, y, z); return [x / length, y / length, z / length]; }),
  faces: [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ],
};

// A stone's meshes, as segments to an icosahedron edge: the physics' (THREE.IcosahedronGeometry's detail 3: 320
// separate triangles, as the stone always had) and the drawn one's (STONE_LATTICE.fine: 2880 triangles on 1442 shared
// corners, each of the physics' faces cut into (fine/coarse)², so the physics' corners are among them).
const STONE_LATTICE = { coarse: 4, fine: 12 };
let stoneLatticeMade = null;

/**
 * The drawn stone's lattice, made once: every icosahedron face cut STONE_LATTICE.fine to an edge, each point projected
 * on the unit sphere (`directions`, one for each corner, shared along the edges and at the icosahedron's corners),
 * its `triangles` (corner indices, facing out), and for each corner the faint tint it takes from the physics' faces
 * round it (`blends`: three of the physics mesh's corners, `tintCorners`, with their weights, the corner's place in
 * the coarse face it lies in; each of those corners averages the tints of the coarse faces round it, `faces`, the
 * faces numbered in the order their tints are drawn), so the tints the faceted stone drew for its faces become one
 * smooth mottle over the finer mesh.
 */
function stoneLattice() {
  if (stoneLatticeMade) return stoneLatticeMade;
  const { coarse, fine } = STONE_LATTICE;
  const ratio = fine / coarse;
  const keyOf = (pairs) => pairs.filter(([, weight]) => weight > 0).sort((first, second) => first[0] - second[0]).map(([corner, weight]) => `${corner}:${weight}`).join(',');
  const cornerIndex = new Map(), directions = [], blends = [];
  const tintCornerIndex = new Map(), tintCorners = [];
  const triangles = [];
  let coarseFace = 0;
  const direction = new THREE.Vector3();
  for (let face = 0; face < ICOSAHEDRON.faces.length; face += 3) {
    const ids = ICOSAHEDRON.faces.slice(face, face + 3);
    const tintCornerAt = (coarseI, coarseJ) => {
      const key = keyOf([[ids[0], coarseI * ratio], [ids[1], coarseJ * ratio], [ids[2], fine - (coarseI + coarseJ) * ratio]]);
      if (!tintCornerIndex.has(key)) { tintCornerIndex.set(key, tintCorners.length); tintCorners.push({ faces: [] }); }
      return tintCornerIndex.get(key);
    };
    // The coarse faces of this one, numbered as the physics mesh's tints are drawn (up, then down, column by column).
    for (let coarseI = 0; coarseI < coarse; coarseI++) for (let coarseJ = 0; coarseJ < coarse - coarseI; coarseJ++) {
      tintCorners[tintCornerAt(coarseI, coarseJ)].faces.push(coarseFace); tintCorners[tintCornerAt(coarseI + 1, coarseJ)].faces.push(coarseFace); tintCorners[tintCornerAt(coarseI, coarseJ + 1)].faces.push(coarseFace);
      coarseFace++;
      if (coarseI + coarseJ <= coarse - 2) {
        tintCorners[tintCornerAt(coarseI + 1, coarseJ)].faces.push(coarseFace); tintCorners[tintCornerAt(coarseI + 1, coarseJ + 1)].faces.push(coarseFace); tintCorners[tintCornerAt(coarseI, coarseJ + 1)].faces.push(coarseFace);
        coarseFace++;
      }
    }
    const cornerAt = (fineI, fineJ) => {
      const fineK = fine - fineI - fineJ;
      const key = keyOf([[ids[0], fineI], [ids[1], fineJ], [ids[2], fineK]]);
      if (cornerIndex.has(key)) return cornerIndex.get(key);
      direction.set(0, 0, 0);
      for (const [id, weight] of [[ids[0], fineI], [ids[1], fineJ], [ids[2], fineK]]) {
        const [x, y, z] = ICOSAHEDRON.corners[id];
        direction.x += weight * x; direction.y += weight * y; direction.z += weight * z;
      }
      direction.normalize();
      // The coarse face it lies in and its place there: the coarse lattice's (u, v), the face's corner at or under
      // it, and whether it lies in that corner's upward face (its near half) or the downward one beyond.
      const u = fineI / ratio, v = fineJ / ratio;
      const coarseI = Math.min(Math.floor(u), coarse - 1), coarseJ = Math.min(Math.floor(v), coarse - 1 - coarseI);
      const alongU = u - coarseI, alongV = v - coarseJ;
      const blend = alongU + alongV <= 1 + 1e-9
        ? [[tintCornerAt(coarseI, coarseJ), 1 - alongU - alongV], [tintCornerAt(coarseI + 1, coarseJ), alongU], [tintCornerAt(coarseI, coarseJ + 1), alongV]]
        : [[tintCornerAt(coarseI + 1, coarseJ), 1 - alongV], [tintCornerAt(coarseI + 1, coarseJ + 1), alongU + alongV - 1], [tintCornerAt(coarseI, coarseJ + 1), 1 - alongU]];
      const index = directions.length / 3;
      cornerIndex.set(key, index);
      directions.push(direction.x, direction.y, direction.z);
      blends.push(blend);
      return index;
    };
    for (let fineI = 0; fineI < fine; fineI++) for (let fineJ = 0; fineJ < fine - fineI; fineJ++) {
      triangles.push(cornerAt(fineI, fineJ), cornerAt(fineI + 1, fineJ), cornerAt(fineI, fineJ + 1));
      if (fineI + fineJ <= fine - 2) triangles.push(cornerAt(fineI + 1, fineJ), cornerAt(fineI + 1, fineJ + 1), cornerAt(fineI, fineJ + 1));
    }
  }
  stoneLatticeMade = { directions: new Float64Array(directions), triangles, blends, tintCorners };
  return stoneLatticeMade;
}

/**
 * Stone of unit nominal radius, flattened like a river stone: a sphere
 * pushed out and in by two noises (its lumps), squashed. Scale by the real
 * radius. Two meshes of that one surface: the physics' (the geometry's
 * `userData.physics`, a position attribute: src/rock.js physicsPositions),
 * the 320 separate triangles the stone always had, its shape and contact
 * integrated over them and its lowest point walked over them, so a seeded
 * throw goes as it went;
 * and the geometry itself, which is only drawn, the same surface cut nine
 * times finer (stoneLattice), with its normals the smooth surface's own (its
 * slope from the noises' gradients: surfacePointAndNormal), so it reads as
 * worn stone rather than facets however close it is seen. Its
 * colour is a faint mottle for each face of the physics mesh, blended smooth
 * (stoneLattice's blends) over a base for its kind (stoneBase); its speckle
 * or pattern and its relief are the fragment shader's (src/shaders/stone.js,
 * the kind and `seed` in `userData.stone`). The random draws (the squash,
 * then two for each face of the physics mesh, its faint tint) are the ones
 * the faceted stone made, so a seeded throw keeps its stone and its splash
 * (tools/variety-probe.mjs). A `flat` stone, picked for skipping (the
 * header), takes the same draws, squashed to SKIP_STONE.squash and its
 * surface noise SKIP_STONE.surfaceNoise as high. Another kind of stone (its
 * definition's `look`, src/things.js) takes the same draws, its squash from
 * its own ranges ([y least, y spread, z least, z spread], unless flat) and
 * its lumps `lumps` as high.
 */
export function createRockGeometry(seed = Math.random() * 1000, { flat = false, look = null } = {}) {
  // The one geometry made (its id is drawn from Math.random, as the faceted stone's was): its faces the physics mesh's
  // until the drawn mesh takes its place in it.
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const coarseCorners = geometry.attributes.position;
  const river = !look || look.pattern === 'river';
  const [flatLeast, flatSpread] = SKIP_STONE.squash;
  const squash = flat || river ? new THREE.Vector3(1.0, flat ? flatLeast + flatSpread * Math.random() : 0.62 + 0.2 * Math.random(), 0.8 + 0.2 * Math.random())
    : new THREE.Vector3(1.0, look.squash[0] + look.squash[1] * Math.random(), look.squash[2] + look.squash[3] * Math.random());
  const lumps = flat ? SKIP_STONE.surfaceNoise : river ? 1 : look.lumps;
  const surfacePoint = (direction, out) => {
    const coarse = valueNoise3(direction.x * 1.6 + seed, direction.y * 1.6, direction.z * 1.6) - 0.5;
    const fine = valueNoise3(direction.x * 4.5 + seed, direction.y * 4.5 + 3.1, direction.z * 4.5) - 0.5;
    const radialScale = flat ? 1 + SKIP_STONE.surfaceNoise * (0.42 * coarse + 0.14 * fine)
      : river ? 1 + 0.42 * coarse + 0.14 * fine : 1 + look.lumps * (0.42 * coarse + 0.14 * fine);
    return out.copy(direction).multiplyScalar(radialScale).multiply(squash);
  };
  // The surface and its normal at `direction` (the drawn mesh): the same point, and the slope of its radial scale over
  // the sphere (the noises' gradients, the lumps' share of each), from which the surface's tangents along two
  // directions across the sphere are t·scale + d·(slope·t), squashed, and the normal is across them, facing out.
  const coarseSlope = new THREE.Vector3(), fineSlope = new THREE.Vector3(), slope = new THREE.Vector3();
  const tangent = new THREE.Vector3(), bitangent = new THREE.Vector3(), alongTangent = new THREE.Vector3(), alongBitangent = new THREE.Vector3();
  const surfacePointAndNormal = (direction, outPoint, outNormal) => {
    const coarse = valueNoise3WithGradient(direction.x * 1.6 + seed, direction.y * 1.6, direction.z * 1.6, coarseSlope) - 0.5;
    const fine = valueNoise3WithGradient(direction.x * 4.5 + seed, direction.y * 4.5 + 3.1, direction.z * 4.5, fineSlope) - 0.5;
    const radialScale = 1 + lumps * (0.42 * coarse + 0.14 * fine);
    slope.copy(coarseSlope).multiplyScalar(lumps * 0.42 * 1.6).addScaledVector(fineSlope, lumps * 0.14 * 4.5);
    outPoint.copy(direction).multiplyScalar(radialScale).multiply(squash);
    tangent.set(-direction.z, 0, direction.x);
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
    tangent.normalize();
    bitangent.crossVectors(direction, tangent);
    alongTangent.copy(tangent).multiplyScalar(radialScale).addScaledVector(direction, slope.dot(tangent)).multiply(squash);
    alongBitangent.copy(bitangent).multiplyScalar(radialScale).addScaledVector(direction, slope.dot(bitangent)).multiply(squash);
    outNormal.crossVectors(alongBitangent, alongTangent).normalize();
    if (outNormal.dot(direction) < 0) outNormal.negate();
  };
  // The faces' faint tints, drawn as they always were (two for each of the physics mesh's faces, in its order).
  const faceCount = coarseCorners.count / 3;
  const faceTints = new Float64Array(faceCount), faceWarmths = new Float64Array(faceCount);
  for (let face = 0; face < faceCount; face++) {
    faceTints[face] = 0.82 + 0.36 * Math.random();
    faceWarmths[face] = 0.96 + 0.08 * Math.random();
  }
  const direction = new THREE.Vector3(), point = new THREE.Vector3();
  // The physics mesh: the surface at its corners, exactly the arithmetic it always was.
  const physics = new THREE.BufferAttribute(new Float32Array(coarseCorners.count * 3), 3);
  for (let corner = 0; corner < coarseCorners.count; corner++) {
    direction.fromBufferAttribute(coarseCorners, corner).normalize();
    surfacePoint(direction, point);
    physics.setXYZ(corner, point.x, point.y, point.z);
  }
  // The drawn mesh: the surface at the lattice's corners, its normals, and the tints blended over it.
  const lattice = stoneLattice();
  const cornerCount = lattice.directions.length / 3;
  const tintAtCorner = new Float64Array(lattice.tintCorners.length), warmthAtCorner = new Float64Array(lattice.tintCorners.length);
  lattice.tintCorners.forEach(({ faces }, index) => {
    for (const face of faces) { tintAtCorner[index] += faceTints[face] / faces.length; warmthAtCorner[index] += faceWarmths[face] / faces.length; }
  });
  const positions = new Float32Array(cornerCount * 3), normals = new Float32Array(cornerCount * 3), colors = new Float32Array(cornerCount * 3);
  const tinted = new THREE.Color(), normal = new THREE.Vector3();
  for (let corner = 0; corner < cornerCount; corner++) {
    direction.fromArray(lattice.directions, corner * 3);
    surfacePointAndNormal(direction, point, normal);
    positions[corner * 3] = point.x; positions[corner * 3 + 1] = point.y; positions[corner * 3 + 2] = point.z;
    normals[corner * 3] = normal.x; normals[corner * 3 + 1] = normal.y; normals[corner * 3 + 2] = normal.z;
    let faceTint = 0, faceWarm = 0;
    for (const [tintCorner, weight] of lattice.blends[corner]) { faceTint += weight * tintAtCorner[tintCorner]; faceWarm += weight * warmthAtCorner[tintCorner]; }
    if (river) {
      // The faint tint over the speckle's mean (the speckle itself is the shader's), warmed a little.
      const tint = 0.75 + 0.25 * faceTint;
      const warm = 0.75 + 0.25 * faceWarm;
      colors[corner * 3] = tint * (0.25 + warm); colors[corner * 3 + 1] = tint; colors[corner * 3 + 2] = tint * (1.75 - warm);
    } else {
      stoneBase(look.pattern, faceTint, tinted);
      colors[corner * 3] = tinted.r; colors[corner * 3 + 1] = tinted.g; colors[corner * 3 + 2] = tinted.b;
    }
  }
  geometry.deleteAttribute('uv');
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(lattice.triangles);
  geometry.userData.physics = physics;
  geometry.userData.stone = { pattern: river ? 'river' : look.pattern, seed };
  return geometry;
}


// ---- the balls ------------------------------------------------------------

/**
 * An icosphere of unit radius, indexed: each of the icosahedron's faces cut into four `subdivisions` times, the
 * midpoints shared. Each cut keeps the corners it was given, in their places, and adds its midpoints after them, so the
 * first 10·4^k + 2 vertices are the sphere cut k times, whose faces are `levels[k]`.
 */
function icosphere(subdivisions) {
  const positions = ICOSAHEDRON.corners.flat();
  let faces = ICOSAHEDRON.faces.slice();
  const levels = [faces];
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
    levels.push(faces);
  }
  return { positions: new Float32Array(positions), indices: faces, levels };
}

/** The most any two corners of `faces` lie apart (`positions` on the unit sphere), in radii. */
function longestEdge(positions, faces) {
  let longest = 0;
  for (let face = 0; face < faces.length; face += 3) {
    for (let side = 0; side < 3; side++) {
      const from = faces[face + side] * 3, to = faces[face + (side + 1) % 3] * 3;
      longest = Math.max(longest, Math.hypot(positions[from] - positions[to], positions[from + 1] - positions[to + 1], positions[from + 2] - positions[to + 2]));
    }
  }
  return longest;
}

/**
 * A ball's coarser meshes (createBallGeometry's `detail`), from its icosphere cut `levels` times (`unit`, its corners
 * on the unit sphere, and `levels`, each cut's faces) and how far in it is pressed and its colour at each corner of the
 * finest (`pressed`, `colors`). A coarser mesh's corners are the finer one's that the cut kept, so each takes the
 * finer's paint about it, as a mipmap does a texture's: its own and its neighbours' in the finer mesh (the midpoints of
 * its edges) at half its weight each, the paint over the patch it stands for rather than at a point of it, so a seam
 * narrower than the coarser mesh's faces fades rather than flickering in and out as the ball turns. Coarsest first.
 */
function ballDetail(unit, levels, pressed, colors) {
  // How far apart each cut's corners lie: the sphere's, whatever its paint, so worked out once.
  ballSpacings ??= levels.map((faces) => longestEdge(unit, faces));
  const coarser = [];
  for (let level = levels.length - 2; level >= COARSEST_BALL; level--) {
    const count = 10 * 4 ** level + 2;
    const sums = new Float64Array(count * 4), weights = new Float64Array(count);
    for (let corner = 0; corner < count; corner++) {
      sums[corner * 4] = pressed[corner];
      for (let channel = 0; channel < 3; channel++) sums[corner * 4 + 1 + channel] = colors[corner * 3 + channel];
      weights[corner] = 1;
    }
    // Each edge of the finer mesh lies in two of its faces: each neighbour is met twice, a quarter each time.
    const faces = levels[level + 1];
    const takeFrom = (corner, neighbour) => {
      sums[corner * 4] += 0.25 * pressed[neighbour];
      for (let channel = 0; channel < 3; channel++) sums[corner * 4 + 1 + channel] += 0.25 * colors[neighbour * 3 + channel];
      weights[corner] += 0.25;
    };
    for (let face = 0; face < faces.length; face += 3) {
      for (let side = 0; side < 3; side++) {
        const from = faces[face + side], to = faces[face + (side + 1) % 3];
        if (from < count) takeFrom(from, to);
        if (to < count) takeFrom(to, from);
      }
    }
    pressed = new Float32Array(count);
    colors = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    for (let corner = 0; corner < count; corner++) {
      pressed[corner] = sums[corner * 4] / weights[corner];
      for (let axis = 0; axis < 3; axis++) {
        colors[corner * 3 + axis] = sums[corner * 4 + 1 + axis] / weights[corner];
        positions[corner * 3 + axis] = unit[corner * 3 + axis] * (1 - pressed[corner]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(levels[level]);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    coarser.unshift({ geometry, spacing: ballSpacings[level] });
  }
  return { coarser, spacing: ballSpacings[levels.length - 1] };
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
let ballSphere = null;   // a ball's icosphere, unpainted, once: its corners only read, each paint pressing a copy of them
let ballSpacings = null; // how far apart the corners of each cut of a ball's icosphere lie, once (ballDetail)

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
    ballSphere ??= icosphere(SUBDIVISIONS);
    const { positions: unit, indices, levels } = ballSphere;
    const positions = unit.slice();
    const colors = new Float32Array(positions.length);
    const pressedAt = new Float32Array(positions.length / 3);
    const color = new THREE.Color();
    const shells = paint === 'bowling' ? BOWLING.shells[shellIndex] : paint === 'plain' ? [linear(...plain)] : null;
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      const x = positions[vertex], y = positions[vertex + 1], z = positions[vertex + 2];
      const pressed = pressedAt[vertex / 3] = paintBall(paint, x, y, z, color, shells);
      positions[vertex] = x * (1 - pressed); positions[vertex + 1] = y * (1 - pressed); positions[vertex + 2] = z * (1 - pressed);
      colors[vertex] = color.r; colors[vertex + 1] = color.g; colors[vertex + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Its coarser meshes, shared by every one thrown (a clone shares its userData): only its own is disposed with it.
    geometry.userData.detail = ballDetail(unit, levels, pressedAt, colors);
    ballCache.set(key, geometry);
  }
  return ballCache.get(key).clone();
}

// ---- the stones' looks ----------------------------------------------------

/**
 * A stone's base colour at a corner (createRockGeometry) for a kind other
 * than the river stone's: `tint` the corner's faint tint (about 1), into
 * `out` as linear values about 1 (the material's colour multiplies them, and
 * the kind's pattern, src/shaders/stone.js, pixel by pixel). Warmed as a
 * river stone's speckle is, or the sky's light leaves it blue.
 */
function stoneBase(kind, tint, out) {
  if (kind === 'granite') out.setRGB(1.0, 0.96, 0.94).multiplyScalar(0.85 + 0.15 * tint);   // a pinkish feldspar: the shader lays its mica and quartz in it
  else if (kind === 'pumice') out.setScalar(0.92 + 0.1 * tint);
  else out.setScalar(0.9 + 0.1 * tint);   // slate, basalt
  return out.multiply(STONE_WARMTH[kind]);
}
// Each kind's warmth: its vertex colours' red, green and blue against grey (a river stone's is about 1.25, 1, 0.75).
const STONE_WARMTH = { slate: new THREE.Color(1.05, 1, 0.92), granite: new THREE.Color(1.25, 1, 0.8), basalt: new THREE.Color(1.1, 1, 0.9), pumice: new THREE.Color(1.25, 1.05, 0.72) };

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
// wider above its middle, with pale lenticels, and its stalk. No two alike
// (createAppleGeometry draws each its own): its variety's colours (APPLE
// varieties: red, green, yellow, or red over green), how much of it is
// flushed and streaked, a little taller or squatter, lopsided, its
// shoulders lobed (as a Red Delicious's are), its dimple deeper or
// shallower and its stalk its own length and lean.
const APPLE = {
  varieties: [
    { weight: 3, ground: linear(178, 170, 62), blush: linear(205, 60, 40), red: linear(168, 22, 28), flushed: [0.55, 0.95] },   // red, Gala-like
    { weight: 2, ground: linear(150, 178, 70), blush: linear(170, 160, 60), red: linear(120, 150, 50), flushed: [0, 0.15] },    // green, Granny Smith-like
    { weight: 1, ground: linear(214, 190, 80), blush: linear(222, 150, 70), red: linear(200, 110, 50), flushed: [0.05, 0.3] },  // yellow, Golden-like, a little blushed
    { weight: 2, ground: linear(160, 168, 64), blush: linear(196, 70, 44), red: linear(150, 26, 30), flushed: [0.25, 0.6] },    // red over green, half flushed
  ],
  stalk: linear(92, 62, 34), lenticel: linear(230, 210, 150),
  stalkDimple: [0.14, 0.26], dimpleWidth: [0.32, 0.44], calyxDimple: [0.12, 0.4], shoulder: [0.02, 0.08],
  tall: [0.9, 1.06], lopsided: 0.05, lobes: [0, 0.035], stalkLength: [0.22, 0.4], stalkRadius: 0.035,
};

const APPLE_SPHERE = { sphere: null };   // the unit icosphere every apple starts from, made once
/** An apple's geometry, of unit radius (the header), indexed, its normals the surface's; its own, from `random`. */
export function createAppleGeometry(random = Math.random) {
  const between = ([least, most]) => least + (most - least) * random();
  let draw = random() * APPLE.varieties.reduce((sum, { weight }) => sum + weight, 0);
  const variety = APPLE.varieties.find(({ weight }) => (draw -= weight) < 0) ?? APPLE.varieties[0];
  const flushed = between(variety.flushed), seed = random() * 50;
  const tall = between(APPLE.tall), shoulder = between(APPLE.shoulder), lobes = between(APPLE.lobes), lobeTurn = random() * Math.PI * 2;
  const leanAngle = random() * Math.PI * 2, lopsided = APPLE.lopsided * random();
  const dimple = between(APPLE.stalkDimple), dimpleWidth = between(APPLE.dimpleWidth);
  // The unit sphere is made once (APPLE_SPHERE); each apple its own copy of it, in typed arrays, the stalk's corners
  // after its own.
  APPLE_SPHERE.sphere ??= icosphere(4);
  const sphere = APPLE_SPHERE.sphere, sphereCount = sphere.positions.length;
  const positions = new Float32Array(sphereCount + 12 * 3), colors = new Float32Array(sphereCount + 12 * 3);
  positions.set(sphere.positions);
  const indices = new Uint32Array(sphere.indices.length + 6 * 6);
  indices.set(sphere.indices);
  const color = new THREE.Color();
  for (let vertex = 0; vertex < sphereCount; vertex += 3) {
    const x = positions[vertex], y = positions[vertex + 1], z = positions[vertex + 2];
    const fromTop = Math.acos(Math.min(Math.max(y, -1), 1)), fromBottom = Math.PI - fromTop, around = Math.atan2(z, x);
    let scale = (1 - dimple * Math.exp(-((fromTop / dimpleWidth) ** 2)) - APPLE.calyxDimple[0] * Math.exp(-((fromBottom / APPLE.calyxDimple[1]) ** 2))) * (1 + shoulder * y);
    scale *= 1 + lobes * Math.cos(5 * around + lobeTurn) * Math.max(y, 0) + lopsided * Math.cos(around - leanAngle);   // lobed shoulders, one side fuller
    positions[vertex] = x * scale; positions[vertex + 1] = y * scale * tall; positions[vertex + 2] = z * scale;
    // Its flush streaked down from the stalk over its ground colour, less toward the calyx.
    const streak = valueNoise3(around * 5 + seed, y * 1.5, 0.5);
    const red = smoothstep(-0.7, 0.3, y + 1.4 * (flushed - 0.6)) * smoothstep(0.25, 0.6, streak + flushed - 0.35);
    color.copy(variety.ground).lerp(variety.blush, smoothstep(0, 1, red + 0.2 * flushed)).lerp(variety.red, red);
    if (valueNoise3(x * 40 + seed, y * 40, z * 40) > 0.94) color.lerp(APPLE.lenticel, 0.3);
    colors[vertex] = color.r; colors[vertex + 1] = color.g; colors[vertex + 2] = color.b;
  }
  // The stalk: a thin tapered hexagonal prism from the dimple's floor, leaning its own way.
  const base = (1 - dimple - 0.02) * tall, length = between(APPLE.stalkLength), lean = 0.06 + 0.08 * random();
  const first = sphereCount / 3;
  for (let ring = 0; ring < 2; ring++) {
    const height = base + ring * length, radius = APPLE.stalkRadius * (1 - 0.4 * ring);
    for (let side = 0; side < 6; side++) {
      const angle = (side / 6) * Math.PI * 2, at = 3 * (first + ring * 6 + side);
      positions[at] = lean * ring * Math.cos(leanAngle) + radius * Math.cos(angle);
      positions[at + 1] = height;
      positions[at + 2] = lean * ring * Math.sin(leanAngle) + radius * Math.sin(angle);
      colors[at] = APPLE.stalk.r; colors[at + 1] = APPLE.stalk.g; colors[at + 2] = APPLE.stalk.b;
    }
  }
  for (let side = 0, at = sphere.indices.length; side < 6; side++, at += 6) {
    const next = (side + 1) % 6;
    indices.set([first + side, first + 6 + side, first + next, first + next, first + 6 + side, first + 6 + next], at);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  // How much it veers as it rolls on its side (src/things.js apple's `curve`, tuned on the middle shoulder): by its own.
  geometry.userData.curveScale = shoulder / ((APPLE.shoulder[0] + APPLE.shoulder[1]) / 2);
  return geometry;
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

/** `geometry` (separate triangles) made to face out: wound the other way, its normals turned, if its volume came out negative (meshVolume). */
function facingOut(geometry) {
  if (meshVolume(geometry) >= 0) return geometry;
  for (const attribute of Object.values(geometry.attributes)) {
    const array = attribute.array, size = attribute.itemSize;
    for (let first = 0; first < array.length; first += 3 * size) {
      for (let component = 0; component < size; component++) {
        const second = first + size + component, third = first + 2 * size + component;
        const kept = array[second];
        array[second] = array[third];
        array[third] = kept;
      }
    }
  }
  const normals = geometry.attributes.normal?.array ?? [];
  for (let index = 0; index < normals.length; index++) normals[index] = -normals[index];
  return geometry;
}

/** The volume a closed geometry of separate triangles encloses and its volume's middle ([x, y, z]): its faces' tetrahedra with the origin. */
function volumeCentroid(geometry) {
  const positions = geometry.attributes.position.array;
  let volume = 0;
  const centroid = [0, 0, 0];
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const bx = positions[index + 3], by = positions[index + 4], bz = positions[index + 5];
    const cx = positions[index + 6], cy = positions[index + 7], cz = positions[index + 8];
    const tetrahedron = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    volume += tetrahedron;
    centroid[0] += tetrahedron * (ax + bx + cx) / 4; centroid[1] += tetrahedron * (ay + by + cy) / 4; centroid[2] += tetrahedron * (az + bz + cz) / 4;
  }
  return { volume, centroid: centroid.map((sum) => sum / volume) };
}

/**
 * `geometry` (separate triangles) moved so that its volume's middle is its
 * origin and scaled to a unit ball's volume, 4π/3: a thing's nominal radius
 * is then its ball's of like volume (a banana's: src/things.js).
 */
function asUnitBall(geometry) {
  const { volume, centroid } = volumeCentroid(geometry);
  const scale = Math.cbrt(((4 / 3) * Math.PI) / volume);
  const positions = geometry.attributes.position.array;
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) positions[index + axis] = (positions[index + axis] - centroid[axis]) * scale;
  }
  return geometry;
}

/** The longest side of a geometry's bounding box, in its own units (registerMesh `length`). */
function longestSide(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

/** Separate-triangle geometries joined into one (their attributes alike: position, normal, colour). */
function joined(geometries) {
  const geometry = new THREE.BufferGeometry();
  for (const name of Object.keys(geometries[0].attributes)) {
    const arrays = geometries.map((part) => part.attributes[name].array);
    const array = new Float32Array(arrays.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of arrays) { array.set(part, at); at += part.length; }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, geometries[0].attributes[name].itemSize));
  }
  return geometry;
}

/**
 * A slab (a slice of bread, a toy slide's parts): `outline`, [a, b] points
 * round it either way, star-shaped about its origin, stood `thickness`
 * across a third axis c, its rim rounded by `round` of its half-thickness
 * (in `edge` steps each side), each face `rings` rings in to its middle.
 * `place(a, b, c)` puts each point where it goes ([x, y, z]: a slice as it
 * is, a slide's chute bent along its slope) and `paint(a, b, c, inset)`
 * colours it (a THREE.Color; `inset`, how far in from the rim the point is
 * along its ray from the middle). Smooth (turnedMesh, the outline's points
 * its columns and the profile round its rim its rows), separate triangles,
 * facing out.
 */
function slabMesh({ outline, thickness, round = 0.5, rings = 8, edge = 4, place, paint }) {
  const half = thickness / 2, corner = round * half;
  // The profile from one face's middle out, round the rim and in over the other: a face's rows by their share of the
  // way to where the rounding starts, the rim's by their inset and height.
  const rows = [];
  for (let ring = 0; ring < rings; ring++) rows.push({ share: ring / rings, across: -half });
  for (let step = 0; step <= edge; step++) {
    const angle = (Math.PI / 2) * (step / edge - 1);
    rows.push({ inset: corner * (1 - Math.cos(angle)), across: corner - half + corner * Math.sin(angle) });
  }
  for (let step = corner < half ? 0 : 1; step <= edge; step++) {
    const angle = (Math.PI / 2) * (step / edge);
    rows.push({ inset: corner * (1 - Math.cos(angle)), across: half - corner + corner * Math.sin(angle) });
  }
  for (let ring = rings - 1; ring >= 0; ring--) rows.push({ share: ring / rings, across: half });
  const columns = outline.length + 1, count = columns * rows.length;
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  for (let column = 0; column < columns; column++) {
    const [outA, outB] = outline[column % outline.length];
    const reach = Math.hypot(outA, outB);
    rows.forEach((row, index) => {
      const along = row.share !== undefined ? row.share * (1 - corner / reach) : 1 - row.inset / reach;
      const a = outA * along, b = outB * along;
      const at = (column * rows.length + index) * 3;
      positions.set(place(a, b, row.across), at);
      const color = paint(a, b, row.across, reach * (1 - along));
      colors[at] = color.r; colors[at + 1] = color.g; colors[at + 2] = color.b;
    });
  }
  return facingOut(turnedMesh({ position: positions, color: colors }, rows.map((row) => (row.share === 0 ? 0 : 1)), outline.length));
}

/** A closed outline ([a, b] points) resampled to `count` points evenly along its length. */
function evenly(points, count) {
  const lengths = [0];
  for (let index = 1; index <= points.length; index++) {
    const [a, b] = points[index - 1], [c, d] = points[index % points.length];
    lengths.push(lengths[index - 1] + Math.hypot(c - a, d - b));
  }
  const total = lengths.at(-1), even = [];
  let segment = 0;
  for (let step = 0; step < count; step++) {
    const distance = (total * step) / count;
    while (lengths[segment + 1] < distance) segment++;
    const share = (distance - lengths[segment]) / Math.max(lengths[segment + 1] - lengths[segment], 1e-12);
    const [a, b] = points[segment], [c, d] = points[(segment + 1) % points.length];
    even.push([a + (c - a) * share, b + (d - b) * share]);
  }
  return even;
}

/** A closed outline moved so that its area's middle is its origin (outlineArea's, of its points [a, b]). */
function aboutItsMiddle(points) {
  let twice = 0, middleA = 0, middleB = 0;
  points.forEach(([a, b], index) => {
    const [c, d] = points[(index + 1) % points.length];
    const cross = a * d - c * b;
    twice += cross;
    middleA += (a + c) * cross;
    middleB += (b + d) * cross;
  });
  middleA /= 3 * twice; middleB /= 3 * twice;
  return points.map(([a, b]) => [a - middleA, b - middleB]);
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

// A banana: a tube swept along a spine that curves BANANA.bend radians over
// its length, both ends up as it lies, its girth swelling from its blunt
// blossom end (sin^BANANA.swell) and narrowing at its neck into its stem,
// whose cut end flares a little; five low ridges run along it (BANANA.ridge
// of its girth). Ripe: yellow, greener towards its stem, flecked with brown
// sugar spots, faintly darker along its ridges, its blossom end and its
// stem's cut end dark. Made in centimetres, then set about its volume's
// middle and scaled to a unit ball's volume (asUnitBall): its nominal radius
// is its ball's of like volume (src/things.js), its length bananaLength()
// of those radii. Smooth, then cut into separate triangles.
const BANANA = {
  length: 20, girth: 1.9, bend: 1.2,   // cm along its spine, stem and all; its radius at its thickest; radians its spine turns
  swell: 0.4, neck: 0.92,              // its girth goes as sin(π·s/neck)^swell, s its share of the way from its tip...
  stem: 0.55, cut: 0.95, flare: 0.15,  // ...its stem's radius (cm) taking over at its neck, flaring by `flare` from `cut` on
  ridges: 5, ridge: 0.05,
  rows: 100, around: 40,
  yellow: linear(252, 216, 58), green: linear(170, 184, 60), stalk: linear(116, 122, 52), end: linear(56, 40, 24),
  spot: linear(112, 70, 28), ridgeLine: linear(170, 130, 40),
};

/** A banana's geometry (the header): its unit ball's volume, about its middle; made once, cloned. */
export function createBananaGeometry() {
  if (!ballCache.has('banana')) {
    const { length, girth, bend, swell, neck, stem, cut, flare, ridges, ridge, rows, around } = BANANA;
    const curve = length / bend;
    // Its rows from its stem's cut end (its middle, then its rim) to its blossom end's tip, finer near the tip.
    const shares = [1];
    for (let row = 0; row <= rows; row++) shares.push(1 - row / rows);
    shares.splice(-1, 0, 0.006, 0.002);
    const radiusAt = (share) => {
      const body = share < neck ? girth * Math.sin((Math.PI * share) / neck) ** swell : 0;
      const stalk = share > 0.75 ? stem * (1 + flare * smoothstep(cut, 1, share)) : 0;
      return (body ** 6 + stalk ** 6) ** (1 / 6);   // a soft maximum: its neck's narrowing into its stem
    };
    const columns = around + 1, count = columns * shares.length;
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let column = 0; column < columns; column++) {
      const angle = (2 * Math.PI * column) / around, cos = Math.cos(angle), sin = Math.sin(angle);
      shares.forEach((share, index) => {
        // Its spine's point, and its normal towards the curve's centre (its binormal is z).
        const turn = bend * (share - 0.5);
        const spineX = curve * Math.sin(turn), spineY = curve * (1 - Math.cos(turn)), normalX = -Math.sin(turn), normalY = Math.cos(turn);
        const ridged = 1 + ridge * Math.cos(ridges * angle) * smoothstep(0.02, 0.15, share) * smoothstep(0.92, 0.8, share);
        const radius = index === 0 ? 0 : radiusAt(share) * ridged;
        const x = spineX + radius * cos * normalX, y = spineY + radius * cos * normalY, z = radius * sin;
        const at = (column * shares.length + index) * 3;
        positions[at] = x; positions[at + 1] = y; positions[at + 2] = z;
        // Yellow, greener to its stem, its stem green-brown; spots and ridge lines on its body; its ends dark.
        const body = smoothstep(0.03, 0.08, share) * smoothstep(0.9, 0.84, share);
        color.copy(BANANA.yellow).lerp(BANANA.green, 0.7 * smoothstep(0.7, 0.9, share)).lerp(BANANA.stalk, smoothstep(0.86, 0.93, share));
        color.lerp(BANANA.ridgeLine, 0.35 * Math.max(Math.cos(ridges * angle), 0) ** 16 * body);
        color.lerp(BANANA.spot, 0.85 * smoothstep(0.8, 0.87, valueNoise3(x * 1.7, y * 1.7, z * 1.7)) * body);
        color.lerp(BANANA.end, Math.max(smoothstep(0.035, 0.01, share), index === 0 || share > 0.995 ? 1 : 0));
        colors[at] = color.r; colors[at + 1] = color.g; colors[at + 2] = color.b;
      });
    }
    const radii = shares.map((share, index) => (index === 0 || share === 0 ? 0 : 1));
    ballCache.set('banana', asUnitBall(facingOut(turnedMesh({ position: positions, color: colors }, radii, around))));
  }
  return ballCache.get('banana').clone();
}

/** A banana's length, end to end, in its nominal radii (registerMesh `length`). */
function bananaLength() {
  return longestSide(createBananaGeometry());
}

// A slice of bread from a sandwich loaf, BREAD.thickness thick: its outline
// a square foot with rounded corners, straight sides and the loaf's domed
// crown, overhanging them a little (breadOutline), its rim rounded
// (slabMesh); its crumb pale, pitted with darker pores, its crust golden
// brown round its rim and over a band of its faces. Its nominal radius is
// its definition's (src/things.js: half its diameter, the outline's
// farthest reach from its middle), its faces across its own y.
const BREAD = {
  thickness: 1.3, crust: 0.35, round: 0.5,   // cm; the crust's band in from the rim; the rim's rounding, of its half-thickness
  points: 96, rings: 12,
  crumb: linear(250, 238, 204), pore: linear(226, 206, 160), crustLight: linear(200, 136, 64), crustDark: linear(132, 76, 30),
};

/** A slice's outline (the header), in centimetres about its area's middle, counter-clockwise. */
function breadOutline() {
  const right = [];
  for (let step = 0; step <= 8; step++) { const angle = -Math.PI / 2 + (Math.PI / 2) * (step / 8); right.push([4.6 + Math.cos(angle), -5 + Math.sin(angle)]); }
  right.push([5.63, -2.5], [5.66, 0], [5.6, 2.0], [5.78, 2.5], [6.05, 2.85], [6.1, 3.15], [5.98, 3.45]);
  for (let step = 1; step <= 16; step++) { const angle = (Math.PI / 2) * (step / 16); right.push([5.98 * Math.cos(angle), 3.45 + 2.95 * Math.sin(angle)]); }
  const left = right.slice(0, -1).reverse().map(([a, b]) => [-a, b]);
  return aboutItsMiddle(evenly([[0, -6], ...right, ...left], BREAD.points));
}

/** A slice of bread's geometry (the header) for its definition (its nominal radius, half its `diameter`). */
export function createBreadGeometry(definition) {
  const scale = 0.01 / (definition.body.size.diameter / 2);   // centimetres to its nominal radii
  const outline = breadOutline().map(([a, b]) => [a * scale, b * scale]);
  const crust = BREAD.crust * scale, color = new THREE.Color();
  return slabMesh({
    outline, thickness: BREAD.thickness * scale, round: BREAD.round, rings: BREAD.rings,
    place: (a, b, c) => [a, c, b],
    paint: (a, b, c, inset) => {
      // Its crumb, pitted with pores; its crust darker to the rim.
      const pores = valueNoise3(a / scale * 2.2, b / scale * 2.2, c > 0 ? 3.5 : 7.5);
      color.copy(BREAD.crumb).lerp(BREAD.pore, 0.6 * smoothstep(0.62, 0.8, pores));
      return color.lerp(BREAD.crustLight, smoothstep(1.4 * crust, 0.9 * crust, inset)).lerp(BREAD.crustDark, smoothstep(0.6 * crust, 0, inset));
    },
  });
}

/** A slice's longest side, crust to crust (its height), in its nominal radii (registerMesh `length`): its outline's, unbuilt. */
function breadLength(definition) {
  const outline = breadOutline(), along = (axis) => Math.max(...outline.map((point) => point[axis])) - Math.min(...outline.map((point) => point[axis]));
  return (0.01 * Math.max(along(0), along(1))) / (definition.body.size.diameter / 2);
}

/**
 * A point of a box of half-sizes `half` whose edges are rounded by `round`
 * (a radius for each axis; 0 leaves that axis's edges square: a device's
 * outline is rounded, its thin edge is not), from the plain box's point on
 * its face across `axis` (each coordinate −1 to 1 of its half-size, `axis`'s
 * ±1). Within the rounding the face's square is laid onto the rounding's
 * sphere, or circle, by the cube-to-sphere map, which never folds a grid,
 * as pushing its points out along the radius does where the rounding spans
 * several of its cells. Its position and normal (the face's own across an
 * axis left square).
 */
function onRoundedBox(point, axis, half, round) {
  // The inner box's point, and how far out of it the point is, in the rounding's radii (a cube's −1..1).
  const core = point.map((value, index) => Math.min(Math.max(value * half[index], round[index] - half[index]), half[index] - round[index]));
  const out = point.map((value, index) => (round[index] > 0 ? (value * half[index] - core[index]) / round[index] : 0));
  const squares = out.map((value) => value * value);
  const mapped = out.map((value, index) => {
    const first = squares[(index + 1) % 3], second = squares[(index + 2) % 3];
    return value * Math.sqrt(Math.max(1 - first / 2 - second / 2 + first * second / 3, 0));
  });
  const position = core.map((value, index) => value + round[index] * mapped[index]);
  if (round[axis] === 0) return { position, normal: [0, 1, 2].map((index) => (index === axis ? Math.sign(point[axis]) : 0)) };
  const normal = mapped.map((value, index) => (round[index] > 0 ? value / round[index] : 0));
  const length = Math.hypot(...normal);
  return { position, normal: normal.map((value) => value / length) };
}

// A brick: a box of BRICK's proportions (its half-length 1), its edges
// rounded by BRICK.round, mottled red-orange clay flecked with darker grains
// and pale mortar crumbs; a grid on each face, so the mottling has room.
const BRICK = {
  half: [1, 0.3023, 0.4767],   // 215 × 65 × 102.5 mm, by its half-length
  round: 0.04, cells: 18,
  clay: linear(196, 98, 58), dark: linear(138, 60, 38), light: linear(222, 138, 92), mortar: linear(212, 202, 184),
};

/** A brick's geometry (the header), separate triangles, its normals the rounded box's (onRoundedBox). */
export function createBrickGeometry() {
  const color = new THREE.Color();
  const positions = [], normals = [], colors = [];
  const round = [BRICK.round, BRICK.round, BRICK.round];
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
      return onRoundedBox(point, axis, BRICK.half, round);
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

// A TV and an iPhone: each a slab of its own half-sizes (`half`, its length
// two unit radii), its outline's corners rounded by `corner` and its thin
// edge square (onRoundedBox), its screen on +y. It is one closed hull, so
// what is drawn is what the water displaces, and its details are vertex
// colours, so it shares the stone's program. Its screen side and its back
// are each a grid of their own whose lines fall on their details' edges
// (deviceLines): a cell inside a detail with edges (the bezel, a TV's vents,
// a phone's camera island and home indicator) is painted whole, so the
// edges are sharp however few the cells; one that shades (a phone's
// wallpaper, a TV's sheen, a lens) is painted corner by corner, on lines
// DEVICE_SPACING apart (LENS_SPACING about the lenses). The rim joins the
// screen side's edge to the back's however each is cut, so the hull has no
// gaps.
const DEVICES = {
  tv: { half: [1, 1.8 / 54, 32 / 54], corner: 0.035 },
  iphone: { half: [7.2 / 15, 0.8 / 15, 1], corner: 0.12 },
};
const DEVICE_CUTS = 4;          // segments across each rounded corner's part of a side: its quarter circle in twice this
const DEVICE_SPACING = 0.1;     // unit radii between the lines where a side shades
const LENS_SPACING = 0.015;     // ...and about a phone's lenses
// A phone's lenses on its back (unit radii; its top is −z, so seen from behind with its top up, +x is on the left: the
// lenses top left, as an iPhone's are), each a ring, its dark surround and its glass, out to these radii.
const LENSES = { at: [[0.27, -0.75], [0.27, -0.48], [-0.01, -0.615]], rings: [0.115, 0.088, 0.055] };
// A TV's vents: slots across its back every `every` unit radii, `width` wide, within `reach` of its half-sizes.
const VENTS = { every: Math.PI / 100, width: 2 * Math.asin(0.45) / 100, reach: [0.7, 0.6] };
const DEVICE_COLORS = {
  bezel: linear(18, 21, 27), edge: linear(143, 157, 178), back: linear(65, 85, 115),
  glass: linear(23, 43, 64), reflection: linear(92, 128, 150),
  blue: linear(40, 111, 219), violet: linear(128, 66, 190), coral: linear(245, 143, 126),
  lens: linear(27, 66, 99), silver: linear(220, 229, 238),
};

/**
 * A device side's lines across one axis (the header), in −1..1 of its
 * half-size `half`: DEVICE_CUTS across each end's rounding (`corner`), one
 * about every `spacing` between (none for a side that does not shade there),
 * and its details' `edges`.
 */
function deviceLines(half, corner, spacing, edges = []) {
  const inner = 1 - corner / half;
  const lines = [...edges];
  for (let cut = 0; cut <= DEVICE_CUTS; cut++) lines.push(inner + (1 - inner) * cut / DEVICE_CUTS, -inner - (1 - inner) * cut / DEVICE_CUTS);
  const between = Number.isFinite(spacing) ? Math.max(1, Math.round((2 * inner * half) / spacing)) : 1;
  for (let step = 1; step < between; step++) lines.push(-inner + (2 * inner * step) / between);
  lines.sort((first, second) => first - second);
  return lines.filter((line, index) => index === 0 || line - lines[index - 1] > 1e-9);
}

/** A TV or iPhone (the header), separate triangles with the screen facing +y. */
export function createDeviceGeometry(kind) {
  const { half, corner } = DEVICES[kind];
  const round = [corner, 0, corner];
  const color = new THREE.Color();
  const paint = (shade) => [shade.r, shade.g, shade.b];
  let sides;
  if (kind === 'iphone') {
    // Its lenses' square, painted corner by corner, a line beyond their rings all round (so no corner of the long cells
    // past it takes a ring's colour).
    const lensLines = (axis) => {
      const reach = LENSES.at.map((lens) => lens[axis === 0 ? 0 : 1]), margin = LENSES.rings[0] + LENS_SPACING;
      const from = Math.min(...reach) - margin, to = Math.max(...reach) + margin;
      const count = Math.ceil((to - from) / LENS_SPACING);
      return Array.from({ length: count + 1 }, (_, step) => (from + ((to - from) * step) / count) / half[axis]);
    };
    sides = [{
      // The glass to 0.88 and 0.93 of its half-sizes; the camera island at its top, the home indicator at its foot.
      across: deviceLines(half[0], corner, DEVICE_SPACING, [-0.88, 0.88, -0.32, 0.32, -0.35, 0.35]),
      along: deviceLines(half[2], corner, DEVICE_SPACING, [-0.93, 0.93, -0.855, -0.765, 0.836, 0.864]),
      cell: (across, along) => {
        if (Math.abs(across) > 0.88 || Math.abs(along) > 0.93) return DEVICE_COLORS.bezel;
        if (Math.abs(across) < 0.32 && Math.abs(along + 0.81) < 0.045) return DEVICE_COLORS.bezel;
        if (Math.abs(across) < 0.35 && Math.abs(along - 0.85) < 0.014) return DEVICE_COLORS.silver;
        return null;
      },
      // Its wallpaper: blue to violet down it, a wave of coral over its foot.
      shade: (across, along) => {
        color.copy(DEVICE_COLORS.blue).lerp(DEVICE_COLORS.violet, (along + 1) / 2);
        return color.lerp(DEVICE_COLORS.coral, smoothstep(-0.35, 0.9, along - 0.45 * Math.sin(across * 3)));
      },
    }, {
      across: deviceLines(half[0], corner, Infinity, lensLines(0)),
      along: deviceLines(half[2], corner, Infinity, lensLines(2)),
      cell: () => null,
      shade: (across, along) => {
        color.copy(DEVICE_COLORS.back);
        for (const [lensX, lensZ] of LENSES.at) {
          const distance = Math.hypot(across * half[0] - lensX, along * half[2] - lensZ);
          if (distance < LENSES.rings[0]) color.copy(DEVICE_COLORS.edge);
          if (distance < LENSES.rings[1]) color.copy(DEVICE_COLORS.bezel);
          if (distance < LENSES.rings[2]) color.copy(DEVICE_COLORS.lens);
        }
        return color;
      },
    }];
  } else {
    // The vents' slots, each one's two edges.
    const slots = [];
    for (let middle = 0; middle + VENTS.width / 2 < VENTS.reach[0]; middle += VENTS.every) {
      for (const at of middle === 0 ? [0] : [middle, -middle]) slots.push(at - VENTS.width / 2, at + VENTS.width / 2);
    }
    const vent = (across) => Math.abs(across) < VENTS.reach[0] && Math.abs(across - VENTS.every * Math.round(across / VENTS.every)) < VENTS.width / 2;
    sides = [{
      // The glass to 0.95 and 0.88 of its half-sizes, a sheen across it.
      across: deviceLines(half[0], corner, DEVICE_SPACING, [-0.95, 0.95]),
      along: deviceLines(half[2], corner, DEVICE_SPACING, [-0.88, 0.88]),
      cell: (across, along) => (Math.abs(across) > 0.95 || Math.abs(along) > 0.88 ? DEVICE_COLORS.bezel : null),
      shade: (across, along) => color.copy(DEVICE_COLORS.glass).lerp(DEVICE_COLORS.reflection, 0.32 * smoothstep(-1, 1, across - along)),
    }, {
      across: deviceLines(half[0], corner, Infinity, slots.map((edge) => edge / half[0])),
      along: deviceLines(half[2], corner, Infinity, [-VENTS.reach[1], VENTS.reach[1]]),
      cell: (across, along) => (vent(across * half[0]) && Math.abs(along) < VENTS.reach[1] ? DEVICE_COLORS.glass : DEVICE_COLORS.bezel),
      shade: () => DEVICE_COLORS.bezel,
    }];
  }
  const positions = [], normals = [], colors = [];
  const first = new THREE.Vector3(), second = new THREE.Vector3(), facing = new THREE.Vector3();
  // A triangle of three points ({ position, normal, color }), wound to face the way their normals do.
  const emit = (a, b, c) => {
    first.fromArray(b.position).sub(facing.fromArray(a.position));
    second.fromArray(c.position).sub(facing);
    facing.set(0, 0, 0);
    for (const point of [a, b, c]) facing.x += point.normal[0], facing.y += point.normal[1], facing.z += point.normal[2];
    for (const point of first.cross(second).dot(facing) >= 0 ? [a, b, c] : [a, c, b]) {
      positions.push(...point.position);
      normals.push(...point.normal);
      colors.push(...point.color);
    }
  };
  // The screen side (+y) and the back (−y): each cell its two triangles.
  sides.forEach(({ across, along, cell, shade }, index) => {
    const sign = index === 0 ? 1 : -1;
    for (let column = 0; column + 1 < across.length; column++) {
      for (let row = 0; row + 1 < along.length; row++) {
        const whole = cell((across[column] + across[column + 1]) / 2, (along[row] + along[row + 1]) / 2);
        const corners = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]].map(([x, z]) => ({
          ...onRoundedBox([across[x], sign, along[z]], 1, half, round), color: paint(whole ?? shade(across[x], along[z])),
        }));
        emit(corners[0], corners[1], corners[2]);
        emit(corners[0], corners[2], corners[3]);
      }
    }
  });
  // The rim, each of its four sides from the screen side's edge to the back's, through their own points: each next
  // triangle takes the nearer next point of either edge, so the two need not be cut alike.
  const rim = paint(kind === 'iphone' ? DEVICE_COLORS.edge : DEVICE_COLORS.bezel);
  for (const [axis, sign] of [[0, 1], [0, -1], [2, 1], [2, -1]]) {
    const edge = (lines, height) => lines.map((line) => {
      const point = [0, height, 0];
      point[axis] = sign;
      point[2 - axis] = line;
      return { ...onRoundedBox(point, axis, half, round), color: rim, line };
    });
    const top = edge(axis === 0 ? sides[0].along : sides[0].across, 1), bottom = edge(axis === 0 ? sides[1].along : sides[1].across, -1);
    let upper = 0, lower = 0;
    while (upper + 1 < top.length || lower + 1 < bottom.length) {
      if (lower + 1 >= bottom.length || (upper + 1 < top.length && top[upper + 1].line <= bottom[lower + 1].line)) emit(top[upper], top[++upper], bottom[lower]);
      else emit(top[upper], bottom[++lower], bottom[lower - 1]);
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

// A birthday cake: two layers of sponge under buttercream, a solid turned
// about its axis from a profile (CAKE.profile, in centimetres: its bare
// baked underside, a border of piped shells round its foot, its frosted
// side, a border round its top's edge and its flat top), CAKE.segments
// round, each border fluted into CAKE.shells shells. Its unit radius is its
// borders' reach. Coloured per vertex: the frosting white, faintly streaked
// by the spatula, the borders pink, its underside baked brown, rainbow
// sprinkles over its top (one vertex each, by a hash of its place in the
// grid, so every cake's are the same). Each cake
// thrown has its own candles, one to six drawn at random (registerMesh
// `dress`, cakeCandles: thin striped candles on its top, each count's made
// once), drawn but not weighed or floated: a few grams, a few millimetres
// thin. Smooth, then cut into separate triangles.
const CAKE = {
  segments: 96, topRings: 18, shells: 24, reach: 11,
  // (radius, height in cm, part, how far out it is fluted: 0 to 1) from its underside's middle out, up and in over its top.
  profile: [
    [0, -5.2, 'base', 0], [3, -5.2, 'base', 0], [6, -5.2, 'base', 0], [9, -5.2, 'base', 0], [10.2, -5.2, 'base', 0],
    [10.45, -5.15, 'border', 0.3], [10.8, -4.95, 'border', 0.8], [11, -4.6, 'border', 1], [10.9, -4.25, 'border', 0.8], [10.65, -4.0, 'border', 0.3],
    [10.6, -3.5, 'side', 0], [10.6, 0, 'side', 0], [10.6, 3.6, 'side', 0],
    [10.75, 4.0, 'border', 0.3], [10.95, 4.45, 'border', 0.8], [10.85, 5.0, 'border', 1], [10.5, 5.4, 'border', 1], [10.0, 5.55, 'border', 0.8], [9.5, 5.35, 'border', 0.4], [9.2, 5.0, 'border', 0],
  ],
  flute: [0.3, 0.25],   // cm: a shell's swell out and up at its crest
  frosting: linear(250, 246, 238), streak: linear(232, 226, 218), border: linear(244, 150, 186), groove: linear(214, 104, 148), base: linear(192, 132, 64),
  sprinkles: [[232, 52, 60], [250, 196, 40], [70, 186, 90], [60, 130, 230], [170, 90, 210], [250, 130, 40]].map((rgb) => linear(...rgb)),
  sprinkled: { top: 0.09 },
  candles: { weights: [2, 3, 3, 2, 2, 1], radius: 0.024, height: 0.5, ring: 0.5, segments: 10, rows: 12, sunk: 0.02, wick: [0.006, 0.05],
    stripes: [[[246, 140, 180], [255, 250, 245]], [[110, 170, 240], [255, 250, 245]], [[250, 210, 80], [255, 250, 245]]] },
};

/** A cake's solid (the header): its sponge, frosting and borders, a colour per vertex. */
export function createCakeGeometry() {
  const scale = 1 / CAKE.reach;
  const top = CAKE.profile.at(-1)[1];
  const profile = [...CAKE.profile];
  for (let ring = CAKE.topRings - 1; ring >= 0; ring--) profile.push([(CAKE.profile.at(-1)[0] * ring) / CAKE.topRings, top, 'top', 0]);
  const rows = profile.length, columns = CAKE.segments + 1;
  const positions = new Float32Array(columns * rows * 3), colors = new Float32Array(columns * rows * 3);
  const color = new THREE.Color();
  for (let column = 0; column < columns; column++) {
    const angle = (column / CAKE.segments) * Math.PI * 2;
    // Each shell swells to its crest and narrows to the next: a teardrop's run round the border.
    const shell = Math.abs(Math.sin((CAKE.shells * angle) / 2)) ** 0.7;
    profile.forEach(([radius, height, part, fluted], row) => {
      const out = radius + CAKE.flute[0] * fluted * shell, up = height + (height > 0 ? CAKE.flute[1] : -CAKE.flute[1] * 0.5) * fluted * shell;
      const x = out * Math.cos(angle), z = out * Math.sin(angle);
      positions.set([x * scale, up * scale, z * scale], (column * rows + row) * 3);
      if (part === 'base') color.copy(CAKE.base);
      else if (part === 'border') color.copy(CAKE.border).lerp(CAKE.groove, 0.5 * (1 - shell) * fluted);
      else color.copy(CAKE.frosting).lerp(CAKE.streak, 0.6 * smoothstep(0.55, 0.8, valueNoise3(angle * 9, height * 0.4, 1.5)));
      // A sprinkle on this vertex, or not: the same for every cake (a hash of its place), none on the seam's twin column.
      const sprinkled = CAKE.sprinkled[part] ?? 0;
      const cell = column % CAKE.segments;
      if (sprinkled > 0 && radius > 0 && hash3(cell * 1.31, row * 2.77, 0.5) < sprinkled) color.copy(CAKE.sprinkles[Math.floor(hash3(cell * 3.7, row * 1.9, 2.5) * CAKE.sprinkles.length)]);
      colors.set([color.r, color.g, color.b], (column * rows + row) * 3);
    });
  }
  return turnedMesh({ position: positions, color: colors }, profile.map(([radius]) => radius), CAKE.segments);
}

const CAKE_CANDLES = new Map();   // each count's candles, made once (cakeCandles)

/**
 * A cake's candles (the header), one to six drawn from `random` by
 * CAKE.candles.weights: their triangles (every count's made by the first
 * cake, and shared), their weight no share of the cake's, and their count.
 */
export function cakeCandles(random = Math.random) {
  const { weights } = CAKE.candles;
  if (CAKE_CANDLES.size === 0) weights.forEach((weight, index) => CAKE_CANDLES.set(index + 1, candleParts(index + 1)));
  const count = weightedPick(weights.map((weight, index) => ({ weight, count: index + 1 })), random).count;
  return { geometry: CAKE_CANDLES.get(count), share: 0, name: `${count} candle${count === 1 ? '' : 's'}`, shared: true };
}

/** `count` candles on a cake's top (one in its middle, more round a ring), each a striped cylinder and its wick. */
function candleParts(count) {
  const { radius, height, ring, segments, rows, sunk, wick, stripes } = CAKE.candles;
  const top = CAKE.profile.at(-1)[1] / CAKE.reach;
  const color = new THREE.Color();
  const candles = [];
  for (let index = 0; index < count; index++) {
    const turn = (2 * Math.PI * index) / count + 0.4;
    const centreX = count === 1 ? 0 : ring * Math.cos(turn), centreZ = count === 1 ? 0 : ring * Math.sin(turn);
    const [stripe, ground] = stripes[index % stripes.length].map((rgb) => linear(...rgb));
    // Its profile: its foot (sunk into the frosting), its side, its shoulder in to its wick and the wick's tip.
    const profile = [[0, top - sunk, 'wax'], [radius, top - sunk, 'wax']];
    for (let row = 1; row <= rows; row++) profile.push([radius, top - sunk + ((height + sunk) * row) / rows, 'wax']);
    profile.push([wick[0], top + height, 'wick'], [wick[0], top + height + wick[1], 'wick'], [0, top + height + wick[1], 'wick']);
    const columns = segments + 1, rowCount = profile.length;
    const positions = new Float32Array(columns * rowCount * 3), colors = new Float32Array(columns * rowCount * 3);
    for (let column = 0; column < columns; column++) {
      const angle = (column / segments) * Math.PI * 2;
      profile.forEach(([out, y, part], row) => {
        positions.set([centreX + out * Math.cos(angle), y, centreZ + out * Math.sin(angle)], (column * rowCount + row) * 3);
        // A spiral stripe round its wax; its wick dark.
        if (part === 'wick') color.setRGB(0.02, 0.02, 0.02);
        else color.copy(ground).lerp(stripe, smoothstep(-0.2, 0.2, Math.sin(angle + ((y - top) / height) * 14)));
        colors.set([color.r, color.g, color.b], (column * rowCount + row) * 3);
      });
    }
    candles.push(turnedMesh({ position: positions, color: colors }, profile.map(([out]) => out), segments));
  }
  const geometry = joined(candles);
  for (const candle of candles) candle.dispose();
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

// A snowball, packed by hand: a ball (its body is one: src/things.js) made
// lumpy by two noises (SNOWBALL.lumps: [frequency, height]) and pressed
// flat where the palms packed it (SNOWBALL.palms, each a plane
// SNOWBALL.pressed out from its middle). White, bluish grey in its hollows,
// glinting here and there. Indexed, its normals the surface's.
const SNOWBALL = {
  detail: 4, lumps: [[2.3, 0.07], [7, 0.025]], pressed: 0.95,
  palms: [[0.2, 0.9, 0.3], [-0.6, -0.5, 0.6], [0.8, -0.3, -0.5], [-0.3, 0.2, -0.9], [0.5, -0.9, 0.2]],
  snow: linear(246, 248, 252), shade: linear(196, 208, 230), glint: linear(255, 255, 255),
};

/** A snowball's geometry (the header), of unit radius about its middle; made once, cloned. */
export function createSnowballGeometry() {
  if (!ballCache.has('snowball')) {
    const { positions, indices } = icosphere(SNOWBALL.detail);
    const palms = SNOWBALL.palms.map((palm) => new THREE.Vector3(...palm).normalize());
    const colors = new Float32Array(positions.length);
    const color = new THREE.Color();
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      const x = positions[vertex], y = positions[vertex + 1], z = positions[vertex + 2];
      const lumps = SNOWBALL.lumps.map(([frequency, height]) => height * (valueNoise3(x * frequency + 5, y * frequency, z * frequency) - 0.5) * 2);
      let radius = 1 + lumps[0] + lumps[1];
      const hollow = smoothstep(0, -0.07, lumps[0] + lumps[1]);   // its lumps' troughs, before any palm pressed it
      // Pressed flat: no further out than any palm's plane along its direction.
      for (const palm of palms) { const facing = x * palm.x + y * palm.y + z * palm.z; if (facing > 0.2) radius = Math.min(radius, SNOWBALL.pressed / facing); }
      positions[vertex] = x * radius; positions[vertex + 1] = y * radius; positions[vertex + 2] = z * radius;
      // Its hollows shaded bluish, a glint where a grain catches the light.
      color.copy(SNOWBALL.snow).lerp(SNOWBALL.shade, 0.45 * hollow + 0.15 * smoothstep(0.5, 0.2, valueNoise3(x * 12, y * 12, z * 12)));
      if (valueNoise3(x * 30 + 9, y * 30, z * 30) > 0.86) color.lerp(SNOWBALL.glint, 0.8);
      colors[vertex] = color.r; colors[vertex + 1] = color.g; colors[vertex + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    ballCache.set('snowball', geometry);
  }
  return ballCache.get('snowball').clone();
}

// A toddler's slide, moulded plastic with hollow walls SLIDE.wall thick, in
// metres as it stands (x along it, from its ladder to the chute's foot; y up;
// z across): two side panels, its handles their tops, with two steps and a
// platform between them, and its chute, a bed with a rail along each side,
// running from the platform down a curve (a cubic from SLIDE.chute.slope
// below level at its top to level at its foot) to the ground. Each part is a
// closed slab (slabMesh), its edges rounded, and they meet without
// overlapping, so the water's columns through it pair (src/rock.js
// buoyancyColumns). Its chute and rails yellow, its sides red, its steps
// blue, each mottled a little as moulded plastic is. Built standing, then
// set about its volume's middle. Its nominal radius is
// its definition's (src/things.js: its hull's ball of like volume, so its
// splash is a thing's that displaces as much), its length slideLength() of
// those radii.
const SLIDE = {
  wall: 0.04, round: 0.6, gap: 0.002,   // m: its walls' thickness, their edges' rounding (of half of it), the room between its parts
  half: 0.23,                            // m: its half-width
  foot: [-0.495, -0.218], handle: { centre: [-0.32, 0.6], radius: 0.1 },   // its side panels' foot along the ground (x), and their handles' arc
  steps: [{ x: [-0.468, -0.35], y: 0.19 }, { x: [-0.446, -0.33], y: 0.37 }, { x: [-0.42, -0.216], y: 0.53 }],   // its steps, the last its platform (their middles' height)
  // Its chute's bed, its middle from its top to its foot (its underside on the ground there), leaving its top `slope`
  // degrees below level, the cubic's handles `reach` (m) long; its rails' height, thickness and place across it.
  chute: { from: [-0.206, 0.53], to: [0.495, 0.02], slope: 25, reach: [0.3, 0.22], rail: [0.07, 0.04, 0.21] },
  chuteColour: linear(255, 210, 28), sideColour: linear(228, 50, 38), stepColour: linear(36, 120, 226),
};

/** A toy slide's geometry (the header) for its definition (its nominal radius, half its `diameter`). */
export function createSlideGeometry(definition) {
  const scale = 1 / (definition.body.size.diameter / 2);   // metres to its nominal radii
  const { wall, round, gap } = SLIDE;
  const color = new THREE.Color();
  const mottled = (base) => (a, b, c) => color.copy(base).multiplyScalar(0.94 + 0.12 * valueNoise3(a * 30, b * 30, c * 30 + 4));
  const rounded = (halfA, halfB, corner, steps = 6) => {
    // A rounded rectangle's outline, counter-clockwise.
    const points = [];
    for (const [signA, signB, from] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]]) {
      for (let step = 0; step <= steps; step++) {
        const angle = from + (Math.PI / 2) * (step / steps);
        points.push([signA * (halfA - corner) + corner * Math.cos(angle), signB * (halfB - corner) + corner * Math.sin(angle)]);
      }
    }
    return evenly(points, Math.max(24, Math.round((halfA + halfB) / 0.012)));
  };
  const parts = [];
  // The side panels: a foot along the ground, a back edge up to the handle's arc over the top, and the ladder's edge
  // down from it; each about its own middle, so that it is star-shaped about it (slabMesh), and put back.
  const [footFront, footBack] = SLIDE.foot, { centre, radius } = SLIDE.handle;
  const panel = [[footFront, 0], [footBack, 0], [footBack, centre[1] - 0.05]];
  for (let step = 0; step <= 16; step++) { const angle = (Math.PI * step) / 16; panel.push([centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle)]); }
  const even = evenly(panel, 90), centred = aboutItsMiddle(even);
  const offset = [even[0][0] - centred[0][0], even[0][1] - centred[0][1]];
  for (const side of [-1, 1]) {
    const across = side * (SLIDE.half - wall / 2);
    parts.push(slabMesh({ outline: centred, thickness: wall, round, rings: 6, place: (a, b, c) => [(a + offset[0]) * scale, (b + offset[1]) * scale, (across + c) * scale], paint: mottled(SLIDE.sideColour) }));
  }
  // The steps and the platform, between the panels.
  const between = SLIDE.half - wall - gap;
  for (const { x: [from, to], y } of SLIDE.steps) {
    const middle = (from + to) / 2;
    parts.push(slabMesh({ outline: rounded((to - from) / 2, between, 0.02), thickness: wall, round, rings: 4, place: (a, b, c) => [(middle + a) * scale, (y + c) * scale, b * scale], paint: mottled(SLIDE.stepColour) }));
  }
  // The chute: its bed's middle along a cubic, from the platform down to the ground, measured along its length.
  const { from, to, slope, reach: [leaving, arriving], rail } = SLIDE.chute;
  const down = THREE.MathUtils.degToRad(slope);
  const controls = [from, [from[0] + leaving * Math.cos(down), from[1] - leaving * Math.sin(down)], [to[0] - arriving, to[1]], to];
  const bezier = (t) => [0, 1].map((axis) => (1 - t) ** 3 * controls[0][axis] + 3 * (1 - t) ** 2 * t * controls[1][axis] + 3 * (1 - t) * t * t * controls[2][axis] + t ** 3 * controls[3][axis]);
  const table = [{ t: 0, along: 0, point: bezier(0) }];
  for (let step = 1; step <= 200; step++) {
    const t = step / 200, point = bezier(t), last = table.at(-1);
    table.push({ t, along: last.along + Math.hypot(point[0] - last.point[0], point[1] - last.point[1]), point });
  }
  const length = table.at(-1).along;
  // The bed's middle at `along` (m from its top) and its normal there, up out of the bed.
  const frame = (along) => {
    const at = Math.min(Math.max(along, 0), length);
    let index = 1;
    while (index < table.length - 1 && table[index].along < at) index++;
    const before = table[index - 1], after = table[index], share = (at - before.along) / Math.max(after.along - before.along, 1e-12);
    const x = before.point[0] + (after.point[0] - before.point[0]) * share, y = before.point[1] + (after.point[1] - before.point[1]) * share;
    const tangentX = after.point[0] - before.point[0], tangentY = after.point[1] - before.point[1], tangentLength = Math.hypot(tangentX, tangentY);
    return { x, y, normalX: -tangentY / tangentLength, normalY: tangentX / tangentLength };
  };
  const bent = (along, up, across) => { const { x, y, normalX, normalY } = frame(along + length / 2); return [(x + up * normalX) * scale, (y + up * normalY) * scale, across * scale]; };
  parts.push(slabMesh({ outline: rounded(length / 2, SLIDE.half, 0.04, 8), thickness: wall, round, rings: 10, place: (a, b, c) => bent(a, c, b), paint: mottled(SLIDE.chuteColour) }));
  const [railHeight, railThickness, railAt] = rail;
  for (const side of [-1, 1]) {
    parts.push(slabMesh({
      outline: rounded(length / 2 - 0.01, railHeight / 2, 0.025), thickness: railThickness, round, rings: 4,
      place: (a, b, c) => bent(a, wall / 2 + railHeight / 2 + b, side * railAt + c), paint: mottled(SLIDE.chuteColour),
    }));
  }
  // About its volume's middle: it turns about its own, not its foot's.
  const geometry = joined(parts);
  for (const part of parts) part.dispose();
  const { centroid } = volumeCentroid(geometry);
  return geometry.translate(-centroid[0], -centroid[1], -centroid[2]);
}

/** A slide's length, from its ladder's foot to its chute's, in its nominal radii (registerMesh `length`): unbuilt. */
function slideLength(definition) {
  return (SLIDE.chute.to[0] - SLIDE.foot[0]) / (definition.body.size.diameter / 2);
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
// Each apple its own (createAppleGeometry: drawn from Math.random, as a ball's paint is), sized by the middle one's volume.
registerMesh('apple', { build: () => createAppleGeometry(), color: () => new THREE.Color(1, 1, 1), volume: () => meshVolume(createAppleGeometry(() => 0.5).toNonIndexed()) });
registerMesh('watermelon', { build: () => createWatermelonGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
registerMesh('brick', { build: () => createBrickGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
for (const kind of ['tv', 'iphone']) {
  registerMesh(kind, { build: () => createDeviceGeometry(kind), color: () => new THREE.Color(1, 1, 1), fixed: true });
}
registerMesh('pie', {
  build: () => createPieGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true,
  dress: (definition, random) => pieFilling(random), heaviest: Math.max(...PIE.fillings.map((filling) => filling.share)),
});
registerMesh('duck', { build: () => createDuckGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
registerMesh('banana', { build: () => createBananaGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true, length: () => bananaLength() });
registerMesh('bread', { build: (definition) => createBreadGeometry(definition), color: () => new THREE.Color(1, 1, 1), fixed: true, length: (definition) => breadLength(definition) });
registerMesh('cake', {
  build: () => facingOut(createCakeGeometry()), color: () => new THREE.Color(1, 1, 1), fixed: true,
  dress: (definition, random) => cakeCandles(random),
});
registerMesh('snowball', { build: () => createSnowballGeometry(), color: () => new THREE.Color(1, 1, 1), fixed: true });
registerMesh('slide', { build: (definition) => createSlideGeometry(definition), color: () => new THREE.Color(1, 1, 1), fixed: true, length: (definition) => slideLength(definition) });
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
