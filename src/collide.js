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
// the air meets a floater where it is seen). A pair meets when one of them is a floater
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
      between.copy(other.centre).sub(one.centre);
      const distance = between.length();
      const reach = one.collisionRadius + other.collisionRadius;
      if (distance < 1e-9) continue;
      let normal, overlap = 0, backOne = 0, backOther = 0;
      if (distance < reach - COLLIDE.settled) {
        // Overlapping already as the step began, and passed through each other's middles in it: they meet as they were
        // then, put back there (the line between them now points the wrong way).
        drawnAtStart(one, other);
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
        const touched = touchedAt(one, other, reach);
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
      rub(one, other, normal, impulse, massOne, massOther);
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
 * already as the step began. Leaves the line between them as the step began
 * in startBetween and its change over the step in sweep.
 */
function touchedAt(one, other, reach) {
  drawnAtStart(one, other);
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
function rub(one, other, normal, impulse, massOne, massOther) {
  // Each from its centre to the one point they touch at, between them in the share of their radii.
  const distance = push.copy(other.centre).sub(one.centre).dot(normal);
  const radiusOne = one.collisionRadius * distance / (one.collisionRadius + other.collisionRadius);
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

/** The line from `one` to `other` as they were drawn as the step began (into startBetween): where each was, lifted as it is now (under a gale, src/rock.js syncMeshes). */
function drawnAtStart(one, other) {
  startBetween.copy(other.previous).sub(one.previous).add(other.centre).sub(other.position).sub(one.centre).add(one.position);
}
