// Things meeting things on the water: a stone or a ball striking a floater
// (a basketball, a tennis ball, a light bowling ball, pumice: src/rock.js
// `float`), and floaters bumping into each other; and on the ground (the
// pool's deck, a frozen lake's ice, src/ice.js): a thing sliding or rolling
// into another, or coming down on one, knocks it along. src/main.js calls
// collideThings every substep once the things have moved, and
// tools/thing-probe.mjs and tools/ice-probe.mjs check it.
//
// Each thing is a sphere for this (Rock.collisionRadius: a ball's radius, a
// stone's mean semi-axis), where it is drawn (Rock.centre: its mesh's
// position, which under a gale is lifted with the waves, and a floater's
// riding the water's ripples and rings, src/floaterRide.js, so a stone in
// the air meets a floater where it is seen). Two flat pieces of ice (src/
// things.js `body.meetsAtRim`, src/ice.js's shards) meet rim to rim instead:
// discs in the level, each of its whole radius, the line between them level,
// so pieces afloat side by side neither overlap nor push each other under;
// two that each have their own outline (Rock.piece: a wedge broken out of
// the sheet, lying beside its neighbours as it broke) meet by those outlines
// as they are turned, seen from above (outlineOverlap: the separating axes
// of two convex polygons), apart along the axis they overlap least on. A
// piece and anything else meet as the thing's sphere and the piece's slab
// (slabOverlap: its outline, its thickness, as it is turned), so what comes
// down on a piece meets its top, not a ball round it; what lies on a piece
// lies on it as ground (src/ice.js pieceUnder) and does not meet that
// piece; anything else on the ground (on the sheet at a hole's lip, on
// another piece) meets it by its slab.
// What broke a hole in the ice never meets that hole's pieces: it went down
// between them, their inner edges clear of it (src/ice.js SHARD.clear).
// A pair meets when one of them is a floater
// (afloat, bobbing, or on its way up), or on the ground (going along it or
// at rest on it: Rock.grounded, which a knock sets going again and the
// ground holds up), and their spheres overlap; things that sink pass each
// other, as stones always have. Overlapping, they are
// moved apart along the line between their centres, each by its share of
// the overlap (the lighter the more); closing, they exchange the impulse of
// a collision along that line,
//
//   J = (1 + e)·v_n / (1/m1 + 1/m2),
//
// v_n the speed they close at, e the root of the product of their bounces
// (src/things.js `ground`, each range's middle: a stone on a basketball
// about 0.6, a tennis ball on one 0.8), each mass its own and the water it
// carries (Rock.collisionMass: the added mass of its wetted part, so a
// floating basketball is pushed as something about half again its own
// mass). Momentum is kept. Their surfaces rub as they part (rub: Coulomb's
// friction at the contact, with their spins), so a glancing hit spins both
// and turns their paths a little; it never adds speed or spin. A floater
// whose speed changes by more than COLLIDE.ringFrom
// sends out a ring (its `ripple`, as when it breaks the surface) and throws
// off the water on it where it was struck (a knock: src/splash.js knock,
// drops at COLLIDE.spray of the speed the pair closed at).
//
// A small thing fast enough to pass a floater within one substep (a gem
// thrown hard at a tennis ball: 10 m/s is 4 cm a step) would be missed by
// overlaps at the step's end, or met from its far side. So a pair apart at
// the step's end is swept along the step too (each from where it was,
// Rock.previous, to where it is, in a straight line): if they touched on the
// way, and were closing, they meet as they touched, each put back where it
// was then and given the impulse along the line between them there. The
// rest of the step is lost to them, under a substep. A pair overlapping as
// the step began (things that do not meet, a sinker and a stone, turned into
// ones that do) that passes through each other's middles in it is put back
// as it was and parted along the line between them then.
//
// Knocks pass on: a ball knocked into a second knocks it, and that one a
// third. Over steps this comes of itself (the knocked ball moves on and
// meets the next); within a step, a pair moved apart may be pushed into a
// third, and a row touching end to end must pass an impulse all along it
// (Newton's cradle), so the pairs are gone over again and again, up to
// COLLIDE.passes times, until none overlaps or closes. Walls (`contain`:
// the pool's, src/pool.js holdInPool) are gone over in each pass too, so a
// ball off a wall into another, or knocked into a wall, comes back off it
// within the step, and a floater turned back hard by one rings the water and
// throws off spray as a knock does.
import * as THREE from 'three';

const COLLIDE = {
  passes: 8,       // the pairs are gone over at most this often a step, until none overlaps or closes
  settled: 1e-6,   // m: an overlap under this is none
  ringFrom: 0.3,   // m/s: a floater knocked harder than this rings the water and throws off spray
  spray: 0.5,      // the knock's drops leave at up to this share of the speed the pair closed at
};

const between = new THREE.Vector3();
const relative = new THREE.Vector3();
const startBetween = new THREE.Vector3();
const sweep = new THREE.Vector3();

/**
 * One substep's meetings among `things` (src/rock.js Rocks): each pair that
 * meets is moved apart and, closing, exchanges its impulse, and each is held
 * in by `contain` (a pool's walls; null in the lake), over passes (the header).
 * Returns what the water shows of the knocks: for each floater knocked hard
 * enough, its hardest knock's `ripple` (its ring, src/splash.js ripple) and
 * `knock` (its spray, src/splash.js knock; `closing`, the speed it was
 * struck at, for its sound, src/sound.js).
 */
export function collideThings(things, contain = null) {
  const knocks = [];
  for (let pass = 0; pass < COLLIDE.passes; pass++) {
    const met = collidePass(things, knocks);
    const walled = contain ? containPass(things, contain, knocks) : false;
    if (!met && !walled) break;
  }
  // One ring and one spray for each floater a step, its hardest knock's.
  const hardest = new Map();
  for (const knock of knocks) {
    const thing = knock.ripple.rock;
    if (!hardest.has(thing) || knock.ripple.speed > hardest.get(thing).ripple.speed) hardest.set(thing, knock);
  }
  return [...hardest.values()];
}

/** The walls' pass (collideThings): each thing held in by `contain`, a floater turned back hard knocked; whether any wall turned one. */
function containPass(things, contain, knocks) {
  let turned = false;
  for (const thing of things) {
    const held = contain(thing);
    if (!held) continue;
    turned = true;
    if (!thing.floater || held.change < COLLIDE.ringFrom) continue;
    const at = thing.position;
    knocks.push({
      ripple: { ripple: true, x: at.x, z: at.z, radius: thing.radius, speed: held.change, rising: false, rock: thing },
      knock: {
        x: at.x - held.normalX * thing.radius, y: at.y, z: at.z - held.normalZ * thing.radius,
        normalX: held.normalX, normalY: 0, normalZ: held.normalZ, speed: COLLIDE.spray * held.change, radius: thing.radius, closing: held.change,
      },
    });
  }
  return turned;
}

/** One pass over the pairs (collideThings), its knocks added to `knocks`; whether any pair met. */
function collidePass(things, knocks) {
  let met = false;
  for (let first = 0; first < things.length; first++) {
    for (let second = first + 1; second < things.length; second++) {
      const one = things[first], other = things[second];
      if (!one.collides || !other.collides || !(one.floater || other.floater || one.grounded || other.grounded)) continue;
      // What broke a hole went down between its pieces (src/ice.js SHARD.clear), what broke a piece afloat between its
      // parts (splitPiece), and what pushed a piece under went down past it (landOnPiece, dunkPieces): it never meets them.
      if ((one.piece && (one.iceHole?.by === other || one.brokenBy === other || other.dunked === one)) || (other.piece && (other.iceHole?.by === one || other.brokenBy === one || one.dunked === other))) continue;
      // Two flat pieces of ice (the header) meet rim to rim: the line between them level, their whole radii.
      const rims = Boolean(one.thing.body.meetsAtRim && other.thing.body.meetsAtRim);
      between.copy(other.centre).sub(one.centre);
      if (rims) between.y = 0;
      const distance = between.length();
      const reach = radiusOf(one, rims) + radiusOf(other, rims);
      if (distance < 1e-9) continue;
      let normal, overlap = 0, backOne = 0, backOther = 0;
      if (rims && one.piece && other.piece) {
        // Two pieces of ice by their own outlines (the header): within their discs, overlapping as polygons, or not met.
        if (distance >= reach) continue;
        const outlines = outlineOverlap(one, other);
        if (!outlines || outlines.depth < COLLIDE.settled) continue;
        normal = between.set(outlines.normalX, 0, outlines.normalZ);
        overlap = outlines.depth;
      } else if (Boolean(one.piece) !== Boolean(other.piece)) {
        // A piece of ice and anything else: the thing's sphere against the piece's slab, as it is turned (the header).
        const piece = one.piece ? one : other, thing = piece === one ? other : one;
        if (thing.centre.distanceTo(piece.centre) >= piece.radius + thing.collisionRadius) continue;
        // On the ground on this piece, it lies on it as on the ice (src/ice.js pieceUnder): the ground holds it, not a
        // meeting. On the sheet at a hole's lip, or on another piece, it meets it by its slab.
        if (thing.grounded && thing.ground?.pieceUnder?.(thing.position.x, thing.position.z)?.rock === piece) continue;
        const slab = slabOverlap(piece, thing);
        if (!slab || slab.depth < COLLIDE.settled) continue;
        // From the first towards the second: slabOverlap's normal points from the piece to the thing.
        normal = between.copy(slab.normal);
        if (piece !== one) normal.negate();
        overlap = slab.depth;
      } else if (distance < reach - COLLIDE.settled) {
        // Overlapping already as the step began, and passed through each other's middles in it: they meet as they were
        // then, put back there (the line between them now points the wrong way).
        drawnAtStart(one, other, rims);
        if (startBetween.dot(between) < 0 && startBetween.lengthSq() > 1e-18 && startBetween.lengthSq() < reach * reach) {
          for (const thing of [one, other]) thing.knock(0, 0, 0, thing.previous.x - thing.position.x, thing.previous.y - thing.position.y, thing.previous.z - thing.position.z);
          const apart = startBetween.length();
          normal = between.copy(startBetween).divideScalar(apart);
          overlap = Math.max(reach - apart, 0);
        } else {
          normal = between.divideScalar(distance);   // from the first towards the second
          overlap = reach - distance;
        }
      } else {
        // Apart at the step's end: did they touch on the way (the header)?
        const touched = touchedAt(one, other, reach, rims);
        if (touched === null) continue;
        normal = between.copy(startBetween).addScaledVector(sweep, touched).divideScalar(reach);
        if (-relative.copy(other.velocity).sub(one.velocity).dot(normal) <= 0) continue;
        backOne = backOther = 1 - touched;
      }
      met = true;
      const massOne = one.collisionMass(), massOther = other.collisionMass();
      if (overlap > 0) {
        // Apart, each by its share of the overlap.
        const shareOne = massOther / (massOne + massOther);
        one.knock(0, 0, 0, -normal.x * overlap * shareOne, -normal.y * overlap * shareOne, -normal.z * overlap * shareOne);
        other.knock(0, 0, 0, normal.x * overlap * (1 - shareOne), normal.y * overlap * (1 - shareOne), normal.z * overlap * (1 - shareOne));
      } else {
        // Back to where they touched.
        for (const [thing, back] of [[one, backOne], [other, backOther]]) {
          thing.knock(0, 0, 0, (thing.previous.x - thing.position.x) * back, (thing.previous.y - thing.position.y) * back, (thing.previous.z - thing.position.z) * back);
        }
      }
      const closing = -relative.copy(other.velocity).sub(one.velocity).dot(normal);
      if (closing <= 0) continue;
      const bounce = Math.sqrt(one.collisionBounce * other.collisionBounce);
      const impulse = (1 + bounce) * closing / (1 / massOne + 1 / massOther);
      one.knock(-normal.x * impulse / massOne, -normal.y * impulse / massOne, -normal.z * impulse / massOne, 0, 0, 0);
      other.knock(normal.x * impulse / massOther, normal.y * impulse / massOther, normal.z * impulse / massOther, 0, 0, 0);
      rub(one, other, normal, impulse, massOne, massOther, rims);
      // What the water shows of it: each floater knocked hard enough rings and throws off spray where it was struck.
      for (const [thing, mass, side] of [[one, massOne, 1], [other, massOther, -1]]) {
        const change = impulse / mass;
        if (!thing.floater || change < COLLIDE.ringFrom) continue;
        const at = thing.position;
        knocks.push({
          ripple: { ripple: true, x: at.x, z: at.z, radius: thing.radius, speed: change, rising: -side * normal.y > 0, rock: thing },
          knock: {
            x: at.x + side * normal.x * thing.collisionRadius, y: at.y + side * normal.y * thing.collisionRadius, z: at.z + side * normal.z * thing.collisionRadius,
            normalX: side * normal.x, normalY: side * normal.y, normalZ: side * normal.z, speed: COLLIDE.spray * closing, radius: thing.radius, closing,
          },
        });
      }
    }
  }
  return met;
}

/**
 * The fraction of the step (0 to 1) at which `one` and `other`, each moved in
 * a straight line from where it was (Rock.previous) to where it is, first
 * came within `reach` of each other, or null if they never did, or touched
 * already as the step began (in the level alone, for `rims`). Leaves the line
 * between them as the step began in startBetween and its change over the step
 * in sweep.
 */
function touchedAt(one, other, reach, rims) {
  drawnAtStart(one, other, rims);
  sweep.copy(between).sub(startBetween);
  const a = sweep.lengthSq();
  const c = startBetween.lengthSq() - reach * reach;
  if (a < 1e-12 || c <= 0) return null;
  const b = 2 * startBetween.dot(sweep);
  const discriminant = b * b - 4 * a * c;
  if (b >= 0 || discriminant < 0) return null;
  const touched = (-b - Math.sqrt(discriminant)) / (2 * a);
  return touched <= 1 ? touched : null;
}

const slipping = new THREE.Vector3();
const spinOne = new THREE.Vector3();
const spinOther = new THREE.Vector3();
const leverOne = new THREE.Vector3();
const leverOther = new THREE.Vector3();
const push = new THREE.Vector3();

/**
 * The friction where `one` and `other` touch, as they part (the header):
 * their surfaces slipping across each other at the contact (each one's
 * velocity and its spin's, ω × r, r from its centre to the contact along
 * `normal`), the impulse along the contact that stops the slip, or
 * μ·`impulse` if that is less (Coulomb's; μ the root of the product of
 * their frictions, src/things.js `material`), each turned by it about its
 * centre (Rock.collisionInertia), so a glancing hit spins both and a
 * spinning ball throws the other off sideways. It takes off speed and spin
 * and never adds them.
 */
function rub(one, other, normal, impulse, massOne, massOther, rims) {
  // Each from its centre to the one point they touch at, between them in the share of their radii.
  const distance = push.copy(other.centre).sub(one.centre).dot(normal);
  const radiusOne = radiusOf(one, rims) * distance / (radiusOf(one, rims) + radiusOf(other, rims));
  const radiusOther = distance - radiusOne;
  leverOne.copy(normal).multiplyScalar(radiusOne);
  leverOther.copy(normal).multiplyScalar(-radiusOther);
  spinOne.copy(one.spinAxis).multiplyScalar(one.spinRate);
  spinOther.copy(other.spinAxis).multiplyScalar(other.spinRate);
  // The second's surface against the first's, at the contact.
  slipping.copy(other.velocity).add(push.crossVectors(spinOther, leverOther)).sub(one.velocity).sub(push.crossVectors(spinOne, leverOne));
  slipping.addScaledVector(normal, -slipping.dot(normal));
  const slip = slipping.length();
  if (slip < 1e-6) return;
  const inertiaOne = one.collisionInertia, inertiaOther = other.collisionInertia;
  // The impulse that would stop the slip: for spheres, 1/m₁ + 1/m₂ + R₁²/I₁ + R₂²/I₂ of it per m/s.
  const stopping = slip / (1 / massOne + 1 / massOther + radiusOne * radiusOne / inertiaOne + radiusOther * radiusOther / inertiaOther);
  const friction = Math.min(Math.sqrt(one.thing.material.friction * other.thing.material.friction) * impulse, stopping);
  // Along the slip on the first, against it on the second.
  push.copy(slipping).multiplyScalar(friction / slip);
  const turnOne = spinOne.crossVectors(leverOne, push).divideScalar(inertiaOne);
  one.knock(push.x / massOne, push.y / massOne, push.z / massOne, 0, 0, 0);
  one.spinBy(turnOne);
  push.negate();
  const turnOther = spinOther.crossVectors(leverOther, push).divideScalar(inertiaOther);
  other.knock(push.x / massOther, push.y / massOther, push.z / massOther, 0, 0, 0);
  other.spinBy(turnOther);
}

/** The line from `one` to `other` as they were drawn as the step began (into startBetween): where each was, lifted as it is now (under a gale, src/rock.js syncMeshes); level for `rims`. */
function drawnAtStart(one, other, rims = false) {
  startBetween.copy(other.previous).sub(one.previous).add(other.centre).sub(other.position).sub(one.centre).add(one.position);
  if (rims) startBetween.y = 0;
}

/** A thing's radius as it meets another (the header): its whole radius rim to rim, else its sphere's (Rock.collisionRadius). */
function radiusOf(thing, rims) { return rims ? thing.radius : thing.collisionRadius; }

const slabLocal = new THREE.Vector3(), slabNearest = new THREE.Vector3(), slabTurn = new THREE.Quaternion();
const slabResult = { normal: new THREE.Vector3(), depth: 0 };

/**
 * How `thing`'s sphere (its collisionRadius about its centre) overlaps a
 * shard's slab (`piece`: its outline, convex, and its thickness, as it is
 * turned): null if apart, else the normal from the slab to the sphere (unit,
 * world) and the depth (m). Its middle outside the slab: from the slab's
 * nearest point; inside: out through the face or the side it is nearest.
 */
export function slabOverlap(piece, thing) {
  const corners = piece.piece.corners, radius = piece.radius, half = (piece.piece.thickness * radius) / 2;
  const inverse = slabTurn.copy(piece.quaternion).invert();
  const local = slabLocal.copy(thing.centre).sub(piece.centre).applyQuaternion(inverse);
  // The nearest point of its outline to the middle's (x, z), and whether the middle is inside it.
  let inside = true, nearestX = local.x, nearestZ = local.z, edgeDistance = Infinity, edgeNormalX = 0, edgeNormalZ = 0;
  let twice = 0;
  const count = corners.length / 2;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    twice += corners[2 * index] * corners[2 * next + 1] - corners[2 * next] * corners[2 * index + 1];
  }
  const winding = twice >= 0 ? 1 : -1;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const ax = corners[2 * index] * radius, az = corners[2 * index + 1] * radius;
    const bx = corners[2 * next] * radius, bz = corners[2 * next + 1] * radius;
    const alongX = bx - ax, alongZ = bz - az, length = Math.hypot(alongX, alongZ) || 1;
    // Outward across this side: for a counter-clockwise outline (x toward z), to its right.
    const outX = (winding * alongZ) / length, outZ = (-winding * alongX) / length;
    const out = (local.x - ax) * outX + (local.z - az) * outZ;
    if (out > 0) inside = false;
    const share = Math.min(Math.max(((local.x - ax) * alongX + (local.z - az) * alongZ) / (length * length), 0), 1);
    const pointX = ax + alongX * share, pointZ = az + alongZ * share;
    const distance = Math.hypot(local.x - pointX, local.z - pointZ);
    if (distance < edgeDistance) { edgeDistance = distance; nearestX = pointX; nearestZ = pointZ; edgeNormalX = outX; edgeNormalZ = outZ; }
  }
  const sphere = thing.collisionRadius;
  if (inside) { nearestX = local.x; nearestZ = local.z; }
  const nearestY = Math.min(Math.max(local.y, -half), half);
  if (!inside || Math.abs(local.y) > half) {
    slabNearest.set(local.x - nearestX, local.y - nearestY, local.z - nearestZ);
    const distance = slabNearest.length();
    if (distance >= sphere || distance < 1e-12) return null;
    slabResult.normal.copy(slabNearest).divideScalar(distance).applyQuaternion(piece.quaternion);
    slabResult.depth = sphere - distance;
    return slabResult;
  }
  // Its middle inside the slab: out the nearer of its faces and its nearest side.
  const toFace = half - Math.abs(local.y);
  if (toFace <= edgeDistance) {
    slabResult.normal.set(0, Math.sign(local.y) || 1, 0).applyQuaternion(piece.quaternion);
    slabResult.depth = toFace + sphere;
  } else {
    slabResult.normal.set(edgeNormalX, 0, edgeNormalZ).applyQuaternion(piece.quaternion);
    slabResult.depth = edgeDistance + sphere;
  }
  return slabResult;
}

const outlineCorner = new THREE.Vector3();
const outlineOne = [], outlineOther = [];

/** A shard's outline (Rock.piece: its corners about its middle, in radii) as it is turned, seen from above: [x, z, …] in m, into `into`. */
function worldOutline(thing, into) {
  const corners = thing.piece.corners, centre = thing.centre;
  into.length = 0;
  for (let index = 0; index < corners.length; index += 2) {
    outlineCorner.set(corners[index] * thing.radius, 0, corners[index + 1] * thing.radius).applyQuaternion(thing.quaternion);
    into.push(centre.x + outlineCorner.x, centre.z + outlineCorner.z);
  }
  return into;
}

/**
 * How two shards' outlines (worldOutline: convex) overlap, seen from above:
 * null if some axis separates them, else the axis they overlap least along
 * ({ normalX, normalZ }, unit, from `one` towards `other`) and by how much
 * (`depth`, m). The separating axis theorem, over both polygons' edges.
 */
export function outlineOverlap(one, other) {
  const first = worldOutline(one, outlineOne), second = worldOutline(other, outlineOther);
  let depth = Infinity, normalX = 0, normalZ = 0;
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 2) {
      const next = (index + 2) % polygon.length;
      let axisX = -(polygon[next + 1] - polygon[index + 1]), axisZ = polygon[next] - polygon[index];
      const length = Math.hypot(axisX, axisZ);
      if (length < 1e-12) continue;
      axisX /= length; axisZ /= length;
      let lowOne = Infinity, highOne = -Infinity, lowOther = Infinity, highOther = -Infinity;
      for (let corner = 0; corner < first.length; corner += 2) {
        const along = first[corner] * axisX + first[corner + 1] * axisZ;
        lowOne = Math.min(lowOne, along); highOne = Math.max(highOne, along);
      }
      for (let corner = 0; corner < second.length; corner += 2) {
        const along = second[corner] * axisX + second[corner + 1] * axisZ;
        lowOther = Math.min(lowOther, along); highOther = Math.max(highOther, along);
      }
      const overlap = Math.min(highOne, highOther) - Math.max(lowOne, lowOther);
      if (overlap <= 0) return null;
      if (overlap < depth) { depth = overlap; normalX = axisX; normalZ = axisZ; }
    }
  }
  // From the first towards the second.
  if ((other.centre.x - one.centre.x) * normalX + (other.centre.z - one.centre.z) * normalZ < 0) { normalX = -normalX; normalZ = -normalZ; }
  return { normalX, normalZ, depth };
}
