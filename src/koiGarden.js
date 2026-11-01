// The Koi pond's garden (src/main.js PLACES `koi`): the planted banks of a
// Japanese stroll garden round the pond, under the garden's own panorama
// (src/sky.js `garden`, Nagoya Castle's Ninomaru garden), whose trees stand
// above them. Scenery, out of reach of anything thrown.
//
// The far and side banks (GARDEN.from round through the far side to
// GARDEN.to) are planted to the water, as the gardens are (Kenroku-en,
// Portland's, Rakusui-en): rounded clipped shrubs (karikomi: azalea, box,
// pieris) in rows rising away from the water, the back ones above the eye,
// so the garden closes round the pond and the photograph's trees rise
// behind it; among them a Kasuga stone lantern (addLantern) with moss on its
// roof.
//
// Nothing thrown comes down on the ground: a throw's aim is kept well inside
// the pond's water (keepInPond). What is drawn is what catches: a thing come
// to the planting (skipped on to the bank, slid off the ice) is caught where it meets
// it, as a shrub catches a ball, losing its speed into it, and drops at its
// foot (holdInGarden); a thing held in the hand is kept out of it
// (keepOutOfGarden). Where it meets it is the drawn garden's own: its
// nearest corner along each direction from the pond at each height
// (catchTable). One that comes down behind the front shrubs is lost in the
// garden (`lostInGarden`: src/main.js lets it fade). The ground in front, on
// the near bank, is soft lawn (koiGround): a thing bounces lower and rolls
// shorter on it than on paving.
//
// The looks are per pixel on the standard material (as the things thrown
// are lit): granite (STONE_LOOK) with its grains, crevices, lichen and moss;
// clipped foliage (FOLIAGE_LOOK) of small leaves, deeper in its hollows, new
// growth paler (pieris's red) on top. Each look is one merged mesh drawn
// twice: in the main scene, and on the mirror's layer, its distance in the
// mirror image's alpha, so the water reflects it. The mirror's is the same
// garden more coarsely made (COARSE: its shrubs' spheres, from the same
// draws), the water's ripples breaking its image anyway, and so is the
// scene's on a preset that asks (setCoarse: Low); what catches is the fine
// garden's, whatever is drawn (on Low it is let go once its catch table is
// made). Built once, the first time it is shown or
// met (builtGarden), seeded (seededRandom), never Math.random.
import * as THREE from 'three';
import { seededRandom } from './spray.js';
import { KOI_SHORE, koiShoreRadius, koiShoreDistance, koiFloorDepthAt } from './pondFloor.js';

const MIRROR_NEARNESS_SCALE = 4;   // as src/rock.js's: the mirror image's alpha is 1 − this / distance
const COARSE = 0.5;   // the coarse garden's shrubs (the header) as finely made as this of the fine's: about a third of its triangles
const UP = new THREE.Vector3(0, 1, 0);
const GROUND_ALBEDO = new THREE.Vector3(0.1, 0.13, 0.06);   // the lawn's, for the light it throws back up
// The planted banks (the header): the sector of θ about the pond's centre they take, from `from` round through π (the
// left bank, the far one) to `to` (the right). A thing caught there keeps `kept` of its speed into the planting and
// `along` of its speed along it; one `lost` (m) behind where the planting begins is lost in the garden.
export const GARDEN = { from: 2.45, to: 0.6, kept: 0.1, along: 0.5, lost: 0.3 };
// The lawn (koiGround's material, src/rock.js `ground`): a thing bounces off it at `give` of its bounce on paving, and
// rolls on it against at least `rollingLeast` (mown grass's resistance to a ball).
const LAWN = Object.freeze({ kind: 'grass', give: 0.65, rollingLeast: 0.12 });
// The catch table (catchTable): `bins` directions round the pond's centre, `bands` heights of `band` (m) from the
// water up, each the least distance (m) from the waterline of any corner of the drawn garden there.
const CATCH = { bins: 1440, band: 0.1, bands: 30 };
const TURN = Math.PI * 2;
const SPAN = (((GARDEN.to - GARDEN.from) % TURN) + TURN) % TURN;
/** How far inside the planted sector θ is (rad; negative outside it). */
function sectorDepth(angle) {
  const into = (((angle - GARDEN.from) % TURN) + TURN) % TURN;
  return into < SPAN ? Math.min(into, SPAN - into) : -Math.min(into - SPAN, TURN - into);
}
/** The garden's ground's height at (x, z) (the land's). */
const groundAt = (x, z) => Math.max(-koiFloorDepthAt(x, z), 0);

/**
 * The Koi pond's ground for the things thrown (src/rock.js `ground`): the
 * land behind the waterline, null over the water; soft lawn (LAWN).
 */
export const koiGround = {
  at(x, z) {
    const depth = koiFloorDepthAt(x, z);
    return depth < 0 ? -depth : null;
  },
  materialAt: (x, z) => (koiShoreDistance(x, z) < 0 ? LAWN : null),
};

// Where a throw may be aimed in the Koi pond (keepInPond): at least `margin` (m) inside its water.
export const KOI_AIM = { margin: 0.6 };
/**
 * A throw's aim (x, z; changed in place) brought inside the Koi pond's
 * water, at least KOI_AIM.margin and `margin` (m: the thing's) from its
 * shore, toward its middle: so nothing thrown comes down on the ground.
 */
export function keepInPond(point, margin = 0) {
  const keep = KOI_AIM.margin + margin;
  const apartX = point.x - KOI_SHORE.centre[0], apartZ = point.z - KOI_SHORE.centre[1];
  const out = Math.hypot(apartX, apartZ), angle = Math.atan2(apartZ, apartX);
  const most = Math.max(koiShoreRadius(angle) - keep, 0);
  if (out > most) {
    point.x = KOI_SHORE.centre[0] + Math.cos(angle) * most;
    point.z = KOI_SHORE.centre[1] + Math.sin(angle) * most;
  }
  return point;
}

/**
 * Where the drawn garden begins, behind the waterline (m), for a ball of
 * `radius` at (x, y, z): the least of the catch table's over the directions
 * and heights the ball spans; Infinity where nothing is drawn.
 */
export function plantingFront(x, y, z, radius) {
  const table = catchTable();
  const apartX = x - KOI_SHORE.centre[0], apartZ = z - KOI_SHORE.centre[1];
  const out = Math.max(Math.hypot(apartX, apartZ), 0.5);
  const angle = Math.atan2(apartZ, apartX);
  const binOf = (theta) => ((Math.floor(((theta / TURN) % 1 + 1) % 1 * CATCH.bins)) + CATCH.bins) % CATCH.bins;
  const spread = Math.ceil((radius / out) / (TURN / CATCH.bins)) + 1;
  const lowest = Math.max(Math.floor((y - radius) / CATCH.band), 0), highest = Math.min(Math.floor((y + radius) / CATCH.band), CATCH.bands - 1);
  let front = Infinity;
  const middle = binOf(angle);
  for (let bin = middle - spread; bin <= middle + spread; bin++) {
    const row = ((bin % CATCH.bins) + CATCH.bins) % CATCH.bins * CATCH.bands;
    for (let band = lowest; band <= highest; band++) front = Math.min(front, table[row + band]);
  }
  return front;
}

/**
 * A thing come to the planting (the header; src/main.js containThings, as
 * the pool's walls hold things, src/pool.js holdInPool): its nearest point
 * at the drawn garden's nearest (plantingFront), it is put back there, its
 * speed into the planting all but taken (GARDEN.kept) and half its speed
 * along it, so it drops at the planting's foot; come down well behind where
 * the planting begins, it is lost in the garden (`lostInGarden`). Returns
 * how hard it was turned back ({ change, normalX, normalZ }) or null. A
 * thing held in the hand is left to it (keepOutOfGarden).
 */
export function holdInGarden(rock) {
  // Held, the hand keeps it out of the planting (keepOutOfGarden), as the pool's walls leave a held thing to it.
  if (rock.state === 'held') return null;
  const { x, y, z } = rock.position;
  const apartX = x - KOI_SHORE.centre[0], apartZ = z - KOI_SHORE.centre[1];
  const out = Math.hypot(apartX, apartZ), angle = Math.atan2(apartZ, apartX);
  const radius = rock.collisionRadius;
  if (sectorDepth(angle) * out < -radius - 0.5) return null;   // nowhere near the banks
  const inland = out - koiShoreRadius(angle);
  const front = plantingFront(x, y, z, radius);
  const into = inland + radius - front;
  if (!(into > 0)) return null;
  if (into > radius + GARDEN.lost) { rock.lostInGarden = true; return null; }
  // Back out toward the pond, along its direction from the pond's centre.
  const normalX = -apartX / out, normalZ = -apartZ / out;
  const toward = -(rock.velocity.x * normalX + rock.velocity.z * normalZ);
  const change = toward > 0 ? (1 + GARDEN.kept) * toward : 0;
  const alongX = rock.velocity.x + Math.max(toward, 0) * normalX, alongZ = rock.velocity.z + Math.max(toward, 0) * normalZ;
  rock.knock(normalX * change - alongX * (1 - GARDEN.along), 0, normalZ * change - alongZ * (1 - GARDEN.along), normalX * into, 0, normalZ * into);
  return { change, normalX, normalZ };
}

/**
 * Where a thing held in the hand may be (src/main.js constrainGrab): its
 * sphere of `radius` at `point` brought back toward the pond, along its
 * direction from the pond's centre, to where the drawn planting begins
 * (plantingFront), so it is never carried into the shrubs, nor let go
 * there to be lost (holdInGarden). `point` changed in place. Brought back,
 * its sphere spans more of the catch table's directions (the nearer the
 * pond's centre, the wider its angle), whose front may be nearer still: it
 * is brought back again until it is clear. Its direction never changes, so
 * the directions it spans only grow and the front only comes nearer: each
 * pass ends clear or spanning more, and they are few.
 */
export function keepOutOfGarden(point, radius) {
  const apartX = point.x - KOI_SHORE.centre[0], apartZ = point.z - KOI_SHORE.centre[1];
  let out = Math.hypot(apartX, apartZ);
  const angle = Math.atan2(apartZ, apartX);
  if (out < 1e-9 || sectorDepth(angle) * out < -radius - 0.5) return point;   // nowhere near the banks
  const awayX = apartX / out, awayZ = apartZ / out, shore = koiShoreRadius(angle);
  for (let pass = 0; pass < CATCH.bins; pass++) {
    const into = out - shore + radius - plantingFront(point.x, point.y, point.z, radius);
    if (!(into > 0)) break;
    out -= into;
    point.x -= awayX * into;
    point.z -= awayZ * into;
  }
  return point;
}

// ---- the scenery's shapes -------------------------------------------------

/** A smooth value noise in three dimensions, 0 to 1. */
function noise3(x, y, z, seed) {
  const hash = (column, row, layer) => { const value = Math.sin(column * 127.1 + row * 311.7 + layer * 74.7 + seed * 19.19) * 43758.5453; return value - Math.floor(value); };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ease = (share) => share * share * (3 - 2 * share);
  const ux = ease(x - ix), uy = ease(y - iy), uz = ease(z - iz);
  const mix = (from, to, share) => from + (to - from) * share;
  return mix(
    mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), ux), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), ux), uy),
    mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), ux), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), ux), uy),
    uz);
}

/**
 * One look's merged mesh (the header): pieces added with their own
 * normals, each corner's `hollow` (0 open to 1 deep in a crevice, or inside
 * the lantern's fire box) and `tint` (a piece's own variety, 0 to 1).
 */
class Parts {
  constructor() { this.positions = []; this.normals = []; this.hollows = []; this.tints = []; this.indices = []; }
  /** `geometry` (its own normals, else they are worked out) placed by `matrix`; its corners' hollow from `hollow(point, normal)` or its own attribute. */
  add(geometry, matrix, { tint = 0, hollow = null } = {}) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const positions = geometry.attributes.position, normals = geometry.attributes.normal, own = geometry.attributes.hollow;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const first = this.positions.length / 3;
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let corner = 0; corner < positions.count; corner++) {
      point.fromBufferAttribute(positions, corner).applyMatrix4(matrix);
      normal.fromBufferAttribute(normals, corner).applyMatrix3(normalMatrix).normalize();
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.hollows.push(hollow ? hollow(point, normal) : own ? own.getX(corner) : 0);
      this.tints.push(tint);
    }
    if (geometry.index) for (let index = 0; index < geometry.index.count; index++) this.indices.push(first + geometry.index.getX(index));
    else for (let corner = 0; corner < positions.count; corner++) this.indices.push(first + corner);
    geometry.dispose();
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('hollow', new THREE.Float32BufferAttribute(this.hollows, 1));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute(this.tints, 1));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/**
 * A unit sphere's corners, each once (an icosahedron's are repeated by every
 * face that meets there), moved by `surface(direction, out)`, with each
 * one's hollow from `hollow(direction)`; its normals from its faces.
 */
function displacedSphere(detail, surface, hollow) {
  const sphere = new THREE.IcosahedronGeometry(1, detail);
  const directions = sphere.attributes.position;
  const positions = [], hollows = [], indices = [];
  const seen = new Map();
  const direction = new THREE.Vector3(), point = new THREE.Vector3();
  for (let corner = 0; corner < directions.count; corner++) {
    direction.fromBufferAttribute(directions, corner).normalize();
    const key = `${Math.round(direction.x * 1e5)},${Math.round(direction.y * 1e5)},${Math.round(direction.z * 1e5)}`;
    if (seen.has(key)) { indices.push(seen.get(key)); continue; }
    seen.set(key, seen.size);
    indices.push(seen.size - 1);
    surface(direction, point);
    positions.push(point.x, point.y, point.z);
    hollows.push(hollow(direction));
  }
  sphere.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('hollow', new THREE.Float32BufferAttribute(hollows, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A clipped shrub (karikomi): a sphere of radii (along, up, deep) about its
 * middle, as finely made as `fineness` (a back row's less: mostly hidden),
 * flattened beneath, its outline waving gently where the shears
 * left it, over sprigs a few centimetres proud; its underside and its
 * hollows its hollow.
 */
function shrub({ along, up, deep, seed, fineness = 1 }) {
  const detail = Math.max(Math.round(Math.min(5 + 8 * Math.max(along, deep, up * 0.7), 13) * fineness), 1);
  const wave = (direction) => noise3(direction.x * 1.7 + 5, direction.y * 1.7, direction.z * 1.7, seed) - 0.5;
  // Its leaf masses: lumps a hand or two across, by its size (a big shrub's no bigger than a small one's).
  const lumpsAcross = 5 * Math.max(along, up, deep);
  const lumps = (direction) => noise3(direction.x * lumpsAcross, direction.y * lumpsAcross, direction.z * lumpsAcross, seed + 9) - 0.5;
  return displacedSphere(detail, (direction, out) => {
    const sprigs = noise3(direction.x * 13, direction.y * 13, direction.z * 13, seed + 5) - 0.5;
    out.copy(direction).multiplyScalar(1 + 0.16 * wave(direction));
    if (out.y < -0.2) out.y = -0.2 + (out.y + 0.2) * 0.5;   // flattened beneath, where it meets the ground
    out.x *= along; out.y *= up; out.z *= deep;
    out.addScaledVector(direction, 0.07 * lumps(direction) + 0.03 * sprigs);
    return out;
  }, (direction) => THREE.MathUtils.clamp(0.3 - 0.7 * direction.y - 1.2 * wave(direction) - 2 * lumps(direction), 0, 1));
}

// ---- the Kasuga lantern ----------------------------------------------------

// Its parts, base to finial (m, across its corners): the hexagonal base with its lotus top, the round post with its
// collar, the platform, the fire box with its two windows, the roof with its upturned corners (warabide), and the
// jewel on its lotus cushion.
const LANTERN = {
  base: { across: 0.27, height: 0.16 },
  post: { radius: 0.085, height: 0.7 },
  platform: { across: 0.24, height: 0.12, under: 0.12 },
  box: { across: 0.16, height: 0.27, post: 0.035, panel: 0.022, window: [0.11, 0.13] },
  roof: { across: 0.38, rise: 0.15, thick: 0.035, curl: 0.045 },
  jewel: { radius: 0.065, height: 0.16 },
};

/** A hexagonal prism (flat faces): across its corners `bottom` and `top` (m), `height` tall, from y 0. */
function hexPrism(bottom, top, height) {
  const geometry = new THREE.CylinderGeometry(top, bottom, height, 6, 1).toNonIndexed();
  geometry.translate(0, height / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** A turned profile ([radius, height] pairs, bottom up) round `around` times, smooth. */
function turned(profile, around = 24) {
  return new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), around);
}

/**
 * The lantern's roof (the header): a hexagon `across` its corners, rising
 * `rise` to its middle in a concave sweep, its corners turned up `curl` at
 * their tips, `thick` at its eaves, flat beneath.
 */
function lanternRoof({ across, rise, thick, curl }) {
  const rings = 14, around = 72;
  const positions = [], indices = [];
  const edgeAt = (angle) => {
    const sector = Math.PI / 3, local = ((angle % sector) + sector) % sector - sector / 2;   // from its side's middle
    return { radius: across * Math.cos(Math.PI / 6) / Math.cos(local), corner: Math.abs(local) / (sector / 2) };
  };
  // Its top: rings from the eaves (0) to the middle (rings).
  for (let ring = 0; ring <= rings; ring++) {
    const share = ring / rings;
    for (let step = 0; step < around; step++) {
      const angle = (step / around) * Math.PI * 2;
      const { radius, corner } = edgeAt(angle);
      const out = (1 - share) * radius;
      const lift = curl * Math.pow(1 - share, 4) * Math.pow(corner, 3);
      positions.push(Math.cos(angle) * out, thick + rise * Math.pow(share, 1.7) + lift, Math.sin(angle) * out);
    }
  }
  // Its eaves' edge and its underside.
  const eaves = positions.length / 3;
  for (let step = 0; step < around; step++) {
    const angle = (step / around) * Math.PI * 2;
    const { radius, corner } = edgeAt(angle);
    positions.push(Math.cos(angle) * radius, curl * Math.pow(corner, 3) * 0.7, Math.sin(angle) * radius);
  }
  const middle = positions.length / 3;
  positions.push(0, 0, 0);
  for (let ring = 0; ring < rings; ring++) {
    for (let step = 0; step < around; step++) {
      const next = (step + 1) % around;
      const here = ring * around + step, onward = ring * around + next, above = (ring + 1) * around + step, aboveOnward = (ring + 1) * around + next;
      indices.push(here, above, onward, onward, above, aboveOnward);
    }
  }
  for (let step = 0; step < around; step++) {
    const next = (step + 1) % around;
    indices.push(eaves + step, step, eaves + next, eaves + next, step, next);
    indices.push(eaves + step, eaves + next, middle);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A box `width` × `height` × `depth` with its bottom's middle at the origin. */
function block(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

/**
 * A lantern's fire box into `parts`, from `height` up in its own frame
 * (`at(height, extra)`): a post at each corner, a panel on each side, the
 * front and back ones open in a window; its inside faces (toward `middle`)
 * and floor dark.
 */
function addFireBox(parts, { at, height, box, middle, tint }) {
  const inside = (point, normal) => ((point.x - middle.x) * normal.x + (point.z - middle.z) * normal.z < 0 ? 1 : 0);
  for (let side = 0; side < 6; side++) {
    const cornerAngle = (side / 6) * Math.PI * 2 + Math.PI / 6;
    parts.add(block(box.post, box.height, box.post), at(height, new THREE.Matrix4().makeRotationY(-cornerAngle).multiply(new THREE.Matrix4().makeTranslation(box.across - box.post * 0.6, 0, 0)).multiply(new THREE.Matrix4().makeRotationY(cornerAngle))), { tint });
    const faceAngle = cornerAngle + Math.PI / 6, faceOut = box.across * Math.cos(Math.PI / 6) - box.panel * 0.55, faceWidth = box.across - box.post * 0.6;
    const face = new THREE.Matrix4().makeRotationY(-faceAngle).multiply(new THREE.Matrix4().makeTranslation(faceOut, 0, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    if (side !== 5 && side !== 2) parts.add(block(faceWidth, box.height, box.panel), at(height, face), { tint, hollow: inside });
    else {
      const [wide, high] = box.window, sill = (box.height - high) / 2, jamb = (faceWidth - wide) / 2;
      parts.add(block(faceWidth, sill, box.panel), at(height, face), { tint, hollow: inside });
      parts.add(block(faceWidth, sill, box.panel), at(height + sill + high, face), { tint, hollow: inside });
      for (const sideways of [-1, 1]) parts.add(block(jamb, high, box.panel), at(height + sill, face.clone().multiply(new THREE.Matrix4().makeTranslation(sideways * (wide + jamb) / 2, 0, 0))), { tint, hollow: inside });
    }
  }
  parts.add(hexPrism(box.across * 0.95, box.across * 0.95, 0.015), at(height), { tint, hollow: () => 1 });   // its floor
}

/** The Kasuga lantern (the header) into `parts`, standing on the ground at (x, z), turned `turn` (rad) about y, its windows toward its +x. */
function addLantern(parts, { x, z, turn, tint }) {
  const { base, post, platform, box, roof, jewel } = LANTERN;
  const place = new THREE.Matrix4().makeRotationY(turn).setPosition(x, groundAt(x, z) - 0.03, z);
  const at = (height, extra = new THREE.Matrix4()) => place.clone().multiply(new THREE.Matrix4().makeTranslation(0, height, 0)).multiply(extra);
  // The prisms' faces are at 0°, ±60° and 180° about y (a flat face toward +x, as the windows'), their corners at 30°
  // and every 60° on, as the fire box's posts and the roof's corners (its own turned 30°).
  const roofTurn = new THREE.Matrix4().makeRotationY(Math.PI / 6);
  let height = 0;
  // The base: a hexagonal footing, a lotus top turned on it.
  parts.add(hexPrism(base.across, base.across * 0.94, base.height * 0.55), at(height), { tint });
  height += base.height * 0.55;
  parts.add(turned([[base.across * 0.86, 0], [base.across * 0.84, 0.02], [base.across * 0.7, 0.05], [base.across * 0.45, 0.07], [post.radius * 1.25, base.height * 0.45], [0, base.height * 0.45]], 36), at(height), { tint });
  height += base.height * 0.45;
  // The post, its collar a little over halfway up.
  const collarAt = post.height * 0.62;
  parts.add(turned([[post.radius, 0], [post.radius * 0.96, collarAt - 0.03], [post.radius * 1.18, collarAt - 0.015], [post.radius * 1.18, collarAt + 0.015], [post.radius * 0.95, collarAt + 0.03], [post.radius * 0.9, post.height], [0, post.height]], 32), at(height), { tint });
  height += post.height;
  // The platform: a hexagon flaring out from under it.
  parts.add(hexPrism(platform.under * 0.85, platform.across, platform.height * 0.6), at(height), { tint });
  parts.add(hexPrism(platform.across, platform.across * 0.97, platform.height * 0.4), at(height + platform.height * 0.6), { tint });
  height += platform.height;
  addFireBox(parts, { at, height, box, middle: new THREE.Vector3(x, 0, z), tint });
  height += box.height;
  // The roof, then the lotus cushion and the jewel.
  parts.add(lanternRoof(roof), at(height - 0.005, roofTurn), { tint });
  height += roof.thick + roof.rise - 0.01;
  parts.add(turned([[0.05, 0], [0.055, 0.015], [0.07, 0.035], [0.045, 0.05], [0, 0.05]], 24), at(height), { tint });
  height += 0.045;
  parts.add(turned([[0.02, 0], [jewel.radius * 0.8, 0.02], [jewel.radius, 0.06], [jewel.radius * 0.85, 0.1], [jewel.radius * 0.35, 0.14], [0.006, jewel.height], [0, jewel.height]], 24), at(height), { tint });
}

// ---- the layout -------------------------------------------------------------

/** The point θ about the pond's centre, `inland` (m) behind its waterline. */
function behindShore(angle, inland) {
  const reach = koiShoreRadius(angle) + inland;
  return { x: KOI_SHORE.centre[0] + Math.cos(angle) * reach, z: KOI_SHORE.centre[1] + Math.sin(angle) * reach };
}
/** The turn about y (rad) that faces a model's +x from (x, z) toward the pond's centre. */
const facingPond = (x, z) => -Math.atan2(KOI_SHORE.centre[1] - z, KOI_SHORE.centre[0] - x);

/** Where the planting begins behind the waterline at θ (m): the front shrubs' fronts, at the water's edge. */
const plantingFrom = (angle) => 0.04 + 0.03 * Math.sin(3.1 * angle + 1);
// The shrubs' rows, from the water back (the header): each as finely made as `fineness`, `behind` (m, least and most) the planting's beginning,
// spaced `spacing` (m) along the bank give or take, each `along`, `up` and `deep` (m, least and most: radii), a share
// `skip` of them left out (a gap the row behind fills).
const ROWS = [
  { fineness: 1, behind: [0, 0], spacing: 0.8, along: [0.36, 0.62], up: [0.3, 0.6], deep: [0.3, 0.42], skip: 0 },
  { fineness: 0.85, behind: [0.5, 0.8], spacing: 1.2, along: [0.5, 0.9], up: [0.6, 1.0], deep: [0.45, 0.6], skip: 0.12 },
  { fineness: 0.6, behind: [1.4, 1.8], spacing: 1.15, along: [0.75, 1.2], up: [1.2, 1.7], deep: [0.6, 0.8], skip: 0 },
  { fineness: 0.4, behind: [2.6, 3.2], spacing: 1.3, along: [1.2, 1.7], up: [2.4, 3.1], deep: [0.8, 1.1], skip: 0 },
];
// Each shrub's own shape, besides its row's: a share of them clipped low and broad (`broad`: its height times
// `flatter`, its length times `longer`), as karikomi are, among the rounded ones.
const SHAPES = { broad: 0.3, flatter: 0.6, longer: 1.35 };
// Each shrub's form (gardenGeometry `plant`), as karikomi are clipped: a single mound, a cloud of merged lobes, a broad
// base with a crown or two on it, or a wave of low lobes along the bank; `weight` how often.
const FORMS = [{ name: 'round', weight: 2 }, { name: 'cloud', weight: 4 }, { name: 'tiered', weight: 2 }, { name: 'wave', weight: 2 }];
const BACK_FORMS = [{ name: 'round', weight: 3 }, { name: 'tiered', weight: 2 }];
// The banks' ends run back from the pond this far (m), shrubs every `spacing`.
const ENDS = { back: 3.2, spacing: 0.75 };
// The lantern: θ, how far behind the planting's beginning, and how low the shrubs before it keep (m, their `up`).
const LANTERN_AT = { angle: -1.2, behind: 0.62, clear: 0.75, below: 0.3 };
function gardenGeometry(random, detail = 1) {
  const stone = new Parts(), foliage = new Parts();
  const between = ([least, most]) => least + (most - least) * random();
  const lantern = behindShore(LANTERN_AT.angle, plantingFrom(LANTERN_AT.angle) + LANTERN_AT.behind);
  const nearLantern = (x, z) => Math.hypot(x - lantern.x, z - lantern.z);
  // A shrub (FORMS): its lobes, each a clipped cushion (shrub) in the shrub's own frame (x along the bank, z away from
  // it, y up), merged into one mass of its kind's green (FOLIAGE_LOOK: tint), each sunk a quarter into the ground or
  // set on the lobe below it.
  const plant = (x, z, facing, along, up, deep, fineness = 1, forms = FORMS) => {
    const tint = random();
    const turn = new THREE.Matrix4().makeRotationY(facing);
    const lobe = (offsetX, offsetZ, lobeAlong, lobeUp, lobeDeep, lift = 0) => {
      const offset = new THREE.Vector3(offsetX, 0, offsetZ).applyMatrix4(turn);
      const atX = x + offset.x, atZ = z + offset.z;
      const sizeShare = Math.max(lobeAlong / along, lobeUp / up, 0.5);
      foliage.add(shrub({ along: lobeAlong, up: lobeUp, deep: lobeDeep, seed: 10 + random() * 90, fineness: detail * fineness * (0.45 + 0.55 * sizeShare) }),
        new THREE.Matrix4().makeRotationY(facing + (random() - 0.5) * 0.6).setPosition(atX, groundAt(atX, atZ) - lobeUp * 0.22 + lift, atZ), { tint });
    };
    let draw = random() * forms.reduce((sum, form) => sum + form.weight, 0);
    const form = forms.find((one) => (draw -= one.weight) < 0)?.name ?? 'round';
    if (form === 'round') lobe(0, 0, along, up, deep);
    else if (form === 'cloud') {
      // A mass of several, the middle one largest, the others round it at their own heights.
      lobe(0, 0, along * 0.78, up * 0.85, deep * 0.85);
      const count = 3 + Math.floor(random() * 3);
      for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2 + random() * 0.8, share = 0.45 + 0.25 * random();
        lobe(Math.cos(angle) * along * 0.55, Math.sin(angle) * deep * 0.4, along * share, up * share * (0.75 + 0.5 * random()), deep * share, up * 0.12 * random());
      }
    } else if (form === 'tiered') {
      // A broad low base, a smaller crown or two set on it.
      lobe(0, 0, along * 1.1, up * 0.55, deep * 1.05);
      const crowns = 1 + Math.floor(random() * 2);
      for (let index = 0; index < crowns; index++) {
        const share = 0.45 + 0.2 * random();
        lobe((random() - 0.5) * along * 0.6, (random() - 0.5) * deep * 0.3, along * share, up * share, deep * share, up * 0.42);
      }
    } else {
      // A wave: low lobes in a row along the bank, rising and falling.
      const count = 3 + Math.floor(random() * 2);
      for (let index = 0; index < count; index++) {
        const share = 0.42 + 0.12 * random();
        lobe((index - (count - 1) / 2) * along * 0.48, (random() - 0.5) * deep * 0.25, along * share, up * (0.55 + 0.4 * random()), deep * (0.75 + 0.2 * random()));
      }
    }
  };
  for (const row of ROWS) {
    for (let angle = GARDEN.from, guard = 0; sectorDepth(angle) >= -1e-9 && guard < 400; guard++) {
      let along = between(row.along), up = between(row.up);
      const deep = between(row.deep);
      if (random() < SHAPES.broad) { up *= SHAPES.flatter; along *= SHAPES.longer; }
      const { x, z } = behindShore(angle, plantingFrom(angle) + between(row.behind) + deep);
      angle += row.spacing * (0.8 + 0.4 * random()) / (koiShoreRadius(angle) + plantingFrom(angle) + 1);
      if (random() < row.skip) continue;
      const fromLantern = nearLantern(x, z);
      if (row !== ROWS[0] && fromLantern < LANTERN_AT.clear) continue;
      if (row === ROWS[0] && fromLantern < LANTERN_AT.clear * 1.2) up = Math.min(up, LANTERN_AT.below);
      plant(x, z, facingPond(x, z) + Math.PI / 2, along, up, deep, row.fineness, row.behind[0] > 1 ? BACK_FORMS : FORMS);   // the rows behind, mostly hidden, simpler
    }
  }
  // The ends, running back from the pond.
  for (const [end, inward] of [[GARDEN.from, 1], [GARDEN.to, -1]]) {
    for (let back = 0; back < ENDS.back; back += ENDS.spacing) {
      const deep = between(ROWS[0].deep), up = between([0.5, 0.95]);
      const angle = end + inward * deep / (koiShoreRadius(end) + plantingFrom(end) + back);
      const { x, z } = behindShore(angle, plantingFrom(end) + back + between(ROWS[0].along));
      plant(x, z, facingPond(x, z), between(ROWS[0].along), up, deep);
    }
  }
  // The lantern, its windows toward the pond.
  addLantern(stone, { x: lantern.x, z: lantern.z, turn: facingPond(lantern.x, lantern.z), tint: 0.75 });
  return { stone: stone.geometry(), foliage: foliage.geometry() };
}

const built = {};
/** The garden's geometries, by look, fine or coarse (COARSE), each built once from the same draws (the header). */
function builtGarden(detail = 1) {
  built[detail] ??= gardenGeometry(seededRandom(7, 3), detail);
  return built[detail];
}
/** The fine garden let go once the catch table is made from it, where nothing draws it (Low: setCoarse); built again if asked for. */
function letGoOfFine() {
  if (!table || !built[1]) return;
  for (const geometry of Object.values(built[1])) geometry.dispose();
  delete built[1];
}
let table = null;
/**
 * The catch table (CATCH; the header): for each direction about the pond's
 * centre and each height over the water, the least distance behind the
 * waterline of any corner of the drawn garden there (Infinity: nothing).
 */
function catchTable() {
  if (table) return table;
  table = new Float32Array(CATCH.bins * CATCH.bands).fill(Infinity);
  for (const geometry of Object.values(builtGarden())) {
    const positions = geometry.attributes.position;
    for (let corner = 0; corner < positions.count; corner++) {
      const x = positions.getX(corner), y = positions.getY(corner), z = positions.getZ(corner);
      const band = Math.floor(y / CATCH.band);
      if (band < 0 || band >= CATCH.bands) continue;
      const apartX = x - KOI_SHORE.centre[0], apartZ = z - KOI_SHORE.centre[1];
      const angle = Math.atan2(apartZ, apartX);
      const bin = Math.floor(((angle / TURN) % 1 + 1) % 1 * CATCH.bins) % CATCH.bins;
      const inland = Math.hypot(apartX, apartZ) - koiShoreRadius(angle);
      const at = bin * CATCH.bands + band;
      if (inland < table[at]) table[at] = inland;
    }
  }
  return table;
}

// ---- the looks -------------------------------------------------------------

const LOOK_COMMON = /* glsl */`
varying vec3 vGardenWorld;
varying vec3 vNormalWorld;
varying float vHollow;
varying float vTint;
float gardenHash(vec3 point) {
  point = fract(point * 0.3183099 + 0.1);
  point *= 17.0;
  return fract(point.x * point.y * point.z * (point.x + point.y + point.z));
}
float gardenNoise(vec3 point) {
  vec3 cell = floor(point), within = fract(point);
  vec3 eased = within * within * (3.0 - 2.0 * within);
  return mix(mix(mix(gardenHash(cell), gardenHash(cell + vec3(1, 0, 0)), eased.x), mix(gardenHash(cell + vec3(0, 1, 0)), gardenHash(cell + vec3(1, 1, 0)), eased.x), eased.y),
             mix(mix(gardenHash(cell + vec3(0, 0, 1)), gardenHash(cell + vec3(1, 0, 1)), eased.x), mix(gardenHash(cell + vec3(0, 1, 1)), gardenHash(cell + vec3(1, 1, 1)), eased.x), eased.y), eased.z);
}
`;
// Granite (the header): the lantern's (tint 0.75: carved, fine-grained, mossy).
const STONE_LOOK = /* glsl */`
  {
    vec3 at = vGardenWorld;
    float footprint = length(fwidth(at));
    float carved = step(0.6, vTint);
    vec3 granite = mix(vec3(0.2, 0.195, 0.18), vec3(0.165, 0.16, 0.15), fract(vTint * 2.0)) * (0.72 + 0.4 * gardenNoise(at * 1.4)) * (0.86 + 0.28 * gardenNoise(at * 6.3));
    // The lantern's stone, long out in the weather: darker, its grey greened.
    granite = mix(granite, granite * vec3(0.8, 0.84, 0.76), carved);
    // Weathering: darker streaks down its sides where rain runs, warmer stains.
    granite *= 1.0 - 0.25 * smoothstep(0.55, 0.8, gardenNoise(vec3(at.x * 9.0, at.y * 1.2, at.z * 9.0))) * (1.0 - smoothstep(0.5, 0.9, vNormalWorld.y));
    granite = mix(granite, granite * vec3(1.12, 1.0, 0.82), smoothstep(0.6, 0.8, gardenNoise(at * 2.2 + 5.0)));
    // Its grains, faded out where a pixel covers several: dark mica and pale feldspar.
    float grainShown = 1.0 - smoothstep(0.004, 0.012, footprint);
    float grain = gardenNoise(at * 140.0);
    granite *= 1.0 + grainShown * (smoothstep(0.74, 0.82, grain) * 0.12 - smoothstep(0.22, 0.14, grain) * 0.18) * (1.0 - 0.5 * carved);
    // Its crevices darker; inside the lantern's fire box, dark.
    granite *= 1.0 - mix(0.3, 0.85, carved) * vHollow;
    // Pale lichen on its upper faces, in patches; moss on the lantern's roof and platform.
    float upper = smoothstep(0.35, 0.8, vNormalWorld.y);
    float lichen = smoothstep(0.5, 0.62, gardenNoise(at * 4.3 + 7.0) * 0.8 + gardenNoise(at * 17.0) * 0.2) * max(upper, 0.35);
    granite = mix(granite, mix(vec3(0.46, 0.46, 0.42), vec3(0.38, 0.4, 0.29), gardenNoise(at * 11.0)) * mix(1.0, 0.7, carved), mix(0.35, 0.5, carved) * lichen);
    float mossy = smoothstep(0.45, 0.7, gardenNoise(at * 7.0 + 3.0) * 0.7 + gardenNoise(at * 31.0) * 0.3);
    granite = mix(granite, vec3(0.08, 0.12, 0.035) * (0.8 + 0.4 * gardenNoise(at * 60.0)), mossy * max(upper, 0.25) * mix(0.6, 0.85, carved));
    diffuseColor.rgb = granite;
  }
`;
const STONE_NORMAL = /* glsl */`
  {
    float shown = 1.0 - smoothstep(0.004, 0.012, length(fwidth(vGardenWorld)));
    vec3 grainSlope = vec3(gardenNoise(vGardenWorld * 60.0 + vec3(1.7, 0.0, 0.0)), gardenNoise(vGardenWorld * 60.0 + vec3(0.0, 2.3, 0.0)), gardenNoise(vGardenWorld * 60.0 + vec3(0.0, 0.0, 3.1))) - 0.5;
    normal = normalize(normal + shown * 0.3 * (grainSlope - normal * dot(grainSlope, normal)));
  }
`;
// Clipped foliage (the header): each shrub its kind's green by its tint (azalea's dark, box's yellower, pieris's with
// red new growth), its small leaves in clumps, deeper in its hollows, its new growth paler on top.
const FOLIAGE_LOOK = /* glsl */`
  {
    vec3 at = vGardenWorld;
    float footprint = length(fwidth(at));
    float leafShown = 1.0 - smoothstep(0.006, 0.02, footprint);
    float clumpShown = 1.0 - smoothstep(0.015, 0.05, footprint);
    float leaves = gardenNoise(at * 75.0), clumps = gardenNoise(at * 32.0), patches = gardenNoise(at * 2.3);
    vec3 green = vTint < 0.5 ? vec3(0.06, 0.13, 0.03) : vTint < 0.85 ? vec3(0.1, 0.17, 0.035) : vec3(0.075, 0.13, 0.035);
    green *= (0.85 + 0.3 * fract(vTint * 7.3)) * (0.9 + 0.2 * patches);
    // Leaf clusters: light on their crowns, shadow between them; single leaves finer still.
    green *= mix(1.0, 0.72 + 0.56 * clumps, clumpShown);
    green *= 1.0 + leafShown * 0.5 * (leaves - 0.5);
    float top = smoothstep(0.2, 0.85, vNormalWorld.y) * smoothstep(0.4, 0.7, gardenNoise(at * 19.0));
    vec3 growth = vTint >= 0.85 ? vec3(0.17, 0.07, 0.035) : vec3(0.13, 0.18, 0.05);
    green = mix(green, growth, 0.45 * top);
    green *= 1.0 - 0.5 * vHollow;
    diffuseColor.rgb = green;
    roughnessFactor = mix(0.55, 0.85, clumps);   // leaves' faces catch the sky now and then
  }
`;
// Leaves catch the light every way: the normal shaken per leaf, faded out where a pixel covers several.
const FOLIAGE_NORMAL = /* glsl */`
  {
    float footprint = length(fwidth(vGardenWorld));
    float leafShown = 1.0 - smoothstep(0.006, 0.02, footprint), clumpShown = 1.0 - smoothstep(0.015, 0.05, footprint);
    vec3 clump = vec3(gardenNoise(vGardenWorld * 32.0 + vec3(4.1, 0.0, 0.0)), gardenNoise(vGardenWorld * 32.0 + vec3(0.0, 5.3, 0.0)), gardenNoise(vGardenWorld * 32.0 + vec3(0.0, 0.0, 6.7))) - 0.5;
    vec3 leaf = vec3(gardenNoise(vGardenWorld * 70.0 + vec3(1.7, 0.0, 0.0)), gardenNoise(vGardenWorld * 70.0 + vec3(0.0, 2.3, 0.0)), gardenNoise(vGardenWorld * 70.0 + vec3(0.0, 0.0, 3.1))) - 0.5;
    vec3 shake = clumpShown * 0.6 * clump + leafShown * 0.8 * leaf;
    normal = normalize(normal + (shake - normal * dot(shake, normal)));
  }
`;
const LOOKS = {
  stone: { look: STONE_LOOK, normal: STONE_NORMAL, roughness: 0.92, reflection: 0.6 },
  foliage: { look: FOLIAGE_LOOK, normal: FOLIAGE_NORMAL, roughness: 0.75, reflection: 0.45 },
};

/**
 * The garden (the header): `meshes` (each look's, in the main scene and on
 * `mirrorLayer`); setVisible shows it, setEnvironment gives it the sky's
 * light, setLight the lawn's bounce for the light now.
 */
export function createKoiGarden({ envTexture, mirrorLayer, lighting }) {
  // Built the first time it is shown (setVisible), never at start-up elsewhere; till then a speck of the same
  // attributes stands in, so the warm-up builds its programs.
  const speck = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -50, 0, 0.001, -50, 0, 0, -50, 0.001], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geometry.setAttribute('hollow', new THREE.Float32BufferAttribute([0, 0, 0], 1));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute([0, 0, 0], 1));
    return geometry;
  };
  let shown = false, coarse = false;
  // The lawn's light thrown back up: the sun's and the sky's (setLight).
  const bounce = { value: new THREE.Vector3() };
  const material = (lookName, mirrored) => {
    const { look, normal, roughness, reflection } = LOOKS[lookName];
    const made = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0, envMap: envTexture, envMapIntensity: reflection });
    made.onBeforeCompile = (shader) => {
      shader.uniforms.uBounce = bounce;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float hollow;\nattribute float tint;\nvarying vec3 vGardenWorld;\nvarying vec3 vNormalWorld;\nvarying float vHollow;\nvarying float vTint;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  vGardenWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNormalWorld = normalize(mat3(modelMatrix) * objectNormal);
  vHollow = hollow;
  vTint = tint;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${LOOK_COMMON}\nuniform vec3 uBounce;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${look}`)
        // The light the lawn throws back up onto its lower faces (the sky alone would leave them blue).
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uBounce * (0.6 - 0.4 * vNormalWorld.y) * (1.0 - 0.6 * vHollow);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${normal}`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  ${mirrored ? `gl_FragColor.a = 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05);` : ''}`);
    };
    made.customProgramCacheKey = () => `koi-garden-${lookName}-${mirrored ? 'mirror' : 'main'}`;
    return made;
  };
  const meshes = [], byLook = {};
  for (const lookName of Object.keys(LOOKS)) {
    byLook[lookName] = [false, true].map((mirrored) => {
      const mesh = new THREE.Mesh(speck(), material(lookName, mirrored));
      mesh.frustumCulled = false;
      if (mirrored) mesh.layers.set(mirrorLayer);
      meshes.push(mesh);
      return mesh;
    });
  }
  return {
    meshes,
    /** The sky's light for the garden (src/sky.js fills its map in place once a sky has loaded). */
    setEnvironment(texture) {
      for (const mesh of meshes) {
        if (mesh.material.envMap === texture) continue;
        mesh.material.envMap = texture;
        mesh.material.needsUpdate = true;
      }
    },
    /** The lawn's bounce from the light now (the sky's sun and ambient, src/main.js lighting). */
    setLight() {
      const sunUp = Math.max(lighting.sunDirection.y, 0);
      bounce.value.copy(lighting.sunIrradiance).multiplyScalar(sunUp).addScaledVector(lighting.skyAmbient, 1.4).multiply(GROUND_ALBEDO);
    },
    /** Show the garden, or hide it; `building` false shows the specks alone (the warm-up). */
    setVisible(visible, { building = true } = {}) {
      if (visible && building && !shown) {
        shown = true;
        for (const [lookName, [main, mirrored]] of Object.entries(byLook)) {
          main.geometry.dispose();   // the specks
          mirrored.geometry.dispose();
          mirrored.geometry = builtGarden(COARSE)[lookName];
        }
        catchTable();
        this.setCoarse(coarse);
      }
      for (const mesh of meshes) mesh.visible = visible;
    },
    /**
     * The scene's garden coarse as the mirror's (a preset's `sceneryCoarse`:
     * Low), or fine; built when it is first shown. Coarse, the fine garden is
     * let go once its catch table is made (letGoOfFine); fine again, it is
     * built again (a change from Low the person makes; the automatic quality
     * only steps down).
     */
    setCoarse(asCoarse) {
      coarse = asCoarse;
      if (!shown) return;
      for (const [lookName, [main]] of Object.entries(byLook)) main.geometry = builtGarden(coarse ? COARSE : 1)[lookName];
      if (coarse) letGoOfFine();
    },
  };
}
