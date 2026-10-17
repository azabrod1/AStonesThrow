// Things meeting things on the water: a stone or a ball striking a floater
// (a basketball, a tennis ball, a light bowling ball, pumice: src/rock.js
// `float`), and floaters bumping into each other. src/main.js calls
// collideThings every substep once the things have moved, and
// tools/thing-probe.mjs checks it.
//
// Each thing is a sphere for this (Rock.collisionRadius: a ball's radius, a
// stone's mean semi-axis), where it is drawn (its mesh's position, which
// under a gale is lifted with the waves, so a stone in the air meets a
// floater where it is seen). A pair meets when one of them is a floater
// (afloat, bobbing, or on its way up) and their spheres overlap; things
// that sink pass each other, as stones always have. Overlapping, they are
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
// mass). Momentum is kept and nothing is turned (no friction at the
// contact). A floater whose speed changes by more than COLLIDE.ringFrom
// sends out a ring (its `ripple`, as when it breaks the surface) and throws
// off the water on it where it was struck (a knock: src/splash.js knock,
// drops at COLLIDE.spray of the speed the pair closed at).
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

/**
 * One substep's meetings among `things` (src/rock.js Rocks): each pair that
 * meets is moved apart and, closing, exchanges its impulse, and each is held
 * in by `contain` (a pool's walls; null in the lake), over passes (the header).
 * Returns what the water shows of the knocks: for each floater knocked hard
 * enough, its hardest knock's `ripple` (its ring, src/splash.js ripple) and
 * `knock` (its spray, src/splash.js knock).
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
        normalX: held.normalX, normalY: 0, normalZ: held.normalZ, speed: COLLIDE.spray * held.change, radius: thing.radius,
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
      if (!one.collides || !other.collides || !(one.floater || other.floater)) continue;
      between.copy(other.meshAbove.position).sub(one.meshAbove.position);
      const distance = between.length();
      const reach = one.collisionRadius + other.collisionRadius;
      if (distance >= reach - COLLIDE.settled || distance < 1e-9) continue;
      met = true;
      const normal = between.divideScalar(distance);   // from the first towards the second
      const massOne = one.collisionMass(), massOther = other.collisionMass();
      // Apart, each by its share of the overlap.
      const overlap = reach - distance;
      const shareOne = massOther / (massOne + massOther);
      one.knock(0, 0, 0, -normal.x * overlap * shareOne, -normal.y * overlap * shareOne, -normal.z * overlap * shareOne);
      other.knock(0, 0, 0, normal.x * overlap * (1 - shareOne), normal.y * overlap * (1 - shareOne), normal.z * overlap * (1 - shareOne));
      const closing = -relative.copy(other.velocity).sub(one.velocity).dot(normal);
      if (closing <= 0) continue;
      const bounce = Math.sqrt(one.collisionBounce * other.collisionBounce);
      const impulse = (1 + bounce) * closing / (1 / massOne + 1 / massOther);
      one.knock(-normal.x * impulse / massOne, -normal.y * impulse / massOne, -normal.z * impulse / massOne, 0, 0, 0);
      other.knock(normal.x * impulse / massOther, normal.y * impulse / massOther, normal.z * impulse / massOther, 0, 0, 0);
      // What the water shows of it: each floater knocked hard enough rings and throws off spray where it was struck.
      for (const [thing, mass, side] of [[one, massOne, 1], [other, massOther, -1]]) {
        const change = impulse / mass;
        if (!thing.floater || change < COLLIDE.ringFrom) continue;
        const at = thing.position;
        knocks.push({
          ripple: { ripple: true, x: at.x, z: at.z, radius: thing.radius, speed: change, rising: -side * normal.y > 0, rock: thing },
          knock: {
            x: at.x + side * normal.x * thing.collisionRadius, y: at.y + side * normal.y * thing.collisionRadius, z: at.z + side * normal.z * thing.collisionRadius,
            normalX: side * normal.x, normalY: side * normal.y, normalZ: side * normal.z, speed: COLLIDE.spray * closing, radius: thing.radius,
          },
        });
      }
    }
  }
  return met;
}
