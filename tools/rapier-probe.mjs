// A bounded comparison of src/collide.js with a mature rigid-body engine,
// Rapier (WASM, @dimforge/rapier3d-compat, a dev dependency only: the page
// does not load it), on the contacts things make here, as the review of
// the throwable things asked: whether to keep the handwritten solver for
// things meeting things (the water, the splash, floating and flight stay
// ours either way: Rapier has no water).
//
// For each case the same bodies (masses, radii, bounce, friction; no water
// and no gravity, so only the contact differs) meet in both, in one 1/240 s
// step cut into 1 to 4 substeps:
//   - a 5 ct diamond at 14 m/s through a tennis ball (the review's miss):
//     ours sweeps each pair (touchedAt); Rapier with and without its CCD;
//   - a tennis ball glancing off a basketball at 55°: the spin each leaves
//     with (friction at the contact, src/collide.js rub);
//   - a 16 lb bowling ball into a tennis ball head on: the speeds after.
// Then each one's cost: twelve balls jostling in a 3 m box for 2 s, the
// microseconds a step of contacts takes (ours: collideThings over the
// pairs; Rapier: world.step, its broad phase, solver and integration).
// And Rapier's weight: the bytes of its bundle, gzipped, against three.js's.
// It prints the table and its verdict; it checks nothing (exit 0).
//
//   node tools/rapier-probe.mjs
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { collideThings } from '../src/collide.js';

await RAPIER.init();
const STEP = 1 / 240;

/** A stand-in for src/rock.js's Rock, as src/collide.js reads one: a ball, out of the water. */
function ourBall({ radius, mass, bounce, friction, shell = false, position, velocity }) {
  const ball = {
    radius, mass, collisionRadius: radius, collides: true, floater: true, state: 'air',
    thing: { material: { friction } },
    position: position.clone(), previous: position.clone(), velocity: velocity.clone(), centre: position.clone(), meshAbove: { position: position.clone() },
    spinAxis: new THREE.Vector3(0, 1, 0), spinRate: 0,
    collisionMass() { return mass; },
    get collisionBounce() { return bounce; },
    get collisionInertia() { return (shell ? 2 / 3 : 2 / 5) * mass * radius * radius; },
    knock(dvx, dvy, dvz, dx, dy, dz) {
      this.velocity.x += dvx; this.velocity.y += dvy; this.velocity.z += dvz;
      this.position.x += dx; this.position.y += dy; this.position.z += dz;
      this.centre.copy(this.position); this.meshAbove.position.copy(this.position);
    },
    spinBy(change) {
      const angular = this.spinAxis.clone().multiplyScalar(this.spinRate).add(change);
      this.spinRate = angular.length();
      if (this.spinRate > 1e-12) this.spinAxis.copy(angular).divideScalar(this.spinRate);
    },
    move(dt) {
      this.previous.copy(this.position);
      this.position.addScaledVector(this.velocity, dt);
      this.centre.copy(this.position); this.meshAbove.position.copy(this.position);
    },
  };
  return ball;
}

/** The same in Rapier: a dynamic ball with its restitution and friction (combined as ours: the root of the product, by average and multiply rules nearest it). */
function rapierBall(world, { radius, mass, bounce, friction, shell = false, position, velocity, continuous = true }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setLinvel(velocity.x, velocity.y, velocity.z).setCcdEnabled(continuous));
  const inertia = (shell ? 2 / 3 : 2 / 5) * mass * radius * radius;
  world.createCollider(RAPIER.ColliderDesc.ball(radius).setMassProperties(mass, { x: 0, y: 0, z: 0 }, { x: inertia, y: inertia, z: inertia }, { x: 0, y: 0, z: 0, w: 1 })
    .setRestitution(bounce).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
    .setFriction(friction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply), body);
  return body;
}

const BALLS = {
  diamond: { radius: 0.0148, mass: 0.001, bounce: 0.425, friction: 0.4 },
  tennis: { radius: 0.0335, mass: 0.058, bounce: 0.745, friction: 0.6, shell: true },
  basketball: { radius: 0.1195, mass: 0.62, bounce: 0.85, friction: 0.6, shell: true },
  bowling: { radius: 0.108, mass: 7.26, bounce: 0.2, friction: 0.3 },
};
// Rapier multiplies restitutions where ours takes the root of their product: each given the root of its own, so the pair's is the same.
const forRapier = (ball) => ({ ...ball, bounce: Math.sqrt(ball.bounce), friction: Math.sqrt(ball.friction) });

/** One case in both: `a` and `b` from where they start, a 1/240 s step in `parts`; what each leaves with. */
function meet(a, b, parts, { continuous = true } = {}) {
  const ours = [ourBall(a), ourBall(b)];
  for (let part = 0; part < parts; part++) {
    for (const ball of ours) ball.move(STEP / parts);
    collideThings(ours);
  }
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = STEP / parts;
  const bodies = [rapierBall(world, { ...forRapier(a), continuous }), rapierBall(world, { ...forRapier(b), continuous })];
  for (let part = 0; part < parts; part++) world.step();
  const theirs = bodies.map((body) => ({ velocity: new THREE.Vector3().copy(body.linvel()), spin: new THREE.Vector3().copy(body.angvel()).length() }));
  world.free();
  return { ours: ours.map((ball) => ({ velocity: ball.velocity.clone(), spin: ball.spinRate })), theirs };
}

const format = (vector) => `(${vector.toArray().map((value) => value.toFixed(2)).join(', ')})`;
console.log('src/collide.js against Rapier ' + RAPIER.version() + ', no water, no gravity, one 1/240 s step cut into 1 to 4:\n');

// The diamond through the tennis ball.
const tennisAt = new THREE.Vector3(0, 0, 0);
const diamondFrom = new THREE.Vector3(-0.03, 0.03, 0);   // a little into it already (0.042 m apart, 0.048 reach): the hardest start
for (const continuous of [true, false]) {
  const rows = [1, 2, 3, 4].map((parts) => {
    const result = meet({ ...BALLS.diamond, position: diamondFrom, velocity: new THREE.Vector3(10, -10, 0) }, { ...BALLS.tennis, position: tennisAt, velocity: new THREE.Vector3() }, parts, { continuous });
    const struck = (side) => side[1].velocity.length() > 0.05;
    return `${parts}: ours ${struck(result.ours) ? 'struck' : 'missed'}, Rapier ${struck(result.theirs) ? 'struck' : 'missed'} (the tennis ball off at ${result.ours[1].velocity.length().toFixed(2)} and ${result.theirs[1].velocity.length().toFixed(2)} m/s)`;
  });
  console.log(`a 5 ct diamond at 14 m/s through a tennis ball, Rapier's CCD ${continuous ? 'on' : 'off'}:\n  ${rows.join('\n  ')}`);
}

// A glancing hit.
{
  const reach = BALLS.tennis.radius + BALLS.basketball.radius;
  const angle = THREE.MathUtils.degToRad(55);
  const from = new THREE.Vector3(-0.999 * reach * Math.sin(angle), 0.999 * reach * Math.cos(angle), 0);
  const result = meet({ ...BALLS.tennis, position: from, velocity: new THREE.Vector3(4, -1, 0) }, { ...BALLS.basketball, position: new THREE.Vector3(), velocity: new THREE.Vector3() }, 1);
  console.log(`\na tennis ball glancing off a basketball at 55°, 4.1 m/s:\n  ours:   tennis ball ${format(result.ours[0].velocity)} m/s spinning ${result.ours[0].spin.toFixed(1)} rad/s, basketball ${format(result.ours[1].velocity)} spinning ${result.ours[1].spin.toFixed(2)}\n  Rapier: tennis ball ${format(result.theirs[0].velocity)} m/s spinning ${result.theirs[0].spin.toFixed(1)} rad/s, basketball ${format(result.theirs[1].velocity)} spinning ${result.theirs[1].spin.toFixed(2)}`);
}

// Head on, masses far apart.
{
  const reach = BALLS.tennis.radius + BALLS.bowling.radius;
  const result = meet({ ...BALLS.bowling, position: new THREE.Vector3(-0.999 * reach, 0, 0), velocity: new THREE.Vector3(6, 0, 0) }, { ...BALLS.tennis, position: new THREE.Vector3(), velocity: new THREE.Vector3() }, 1);
  console.log(`\na 16 lb bowling ball head on into a tennis ball at 6 m/s:\n  ours:   bowling ball ${format(result.ours[0].velocity)}, tennis ball ${format(result.ours[1].velocity)} m/s\n  Rapier: bowling ball ${format(result.theirs[0].velocity)}, tennis ball ${format(result.theirs[1].velocity)} m/s`);
}

// The cost: twelve balls jostling in a box.
{
  const count = 12, steps = 480;
  let state = 3;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  const starts = Array.from({ length: count }, (unused, index) => ({ ...BALLS.basketball, position: new THREE.Vector3((index % 4) * 0.5 - 0.75, 0, Math.floor(index / 4) * 0.5 - 0.5), velocity: new THREE.Vector3(random() * 2 - 1, 0, random() * 2 - 1) }));
  const walls = (ball) => {
    for (const axis of ['x', 'z']) {
      if (Math.abs(ball.position[axis]) > 1.5 - ball.radius && ball.position[axis] * ball.velocity[axis] > 0) { ball.velocity[axis] *= -1; return { change: 0, normalX: 0, normalZ: 0 }; }
    }
    return null;
  };
  const ours = starts.map(ourBall);
  let started = performance.now();
  for (let step = 0; step < steps; step++) { for (const ball of ours) ball.move(STEP); collideThings(ours, walls); }
  const oursMicroseconds = (1000 * (performance.now() - started)) / steps;
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = STEP;
  for (const start of starts) rapierBall(world, forRapier(start));
  const box = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const [x, z, halfX, halfZ] of [[1.6, 0, 0.1, 1.7], [-1.6, 0, 0.1, 1.7], [0, 1.6, 1.7, 0.1], [0, -1.6, 1.7, 0.1]]) world.createCollider(RAPIER.ColliderDesc.cuboid(halfX, 0.5, halfZ).setTranslation(x, 0, z), box);
  for (let step = 0; step < 60; step++) world.step();   // its first steps, warmed up
  started = performance.now();
  for (let step = 0; step < steps; step++) world.step();
  const rapierMicroseconds = (1000 * (performance.now() - started)) / steps;
  world.free();
  console.log(`\ntwelve basketballs jostling in a 3 m box, a step of contacts: ours ${oursMicroseconds.toFixed(1)} µs, Rapier's world.step ${rapierMicroseconds.toFixed(1)} µs`);
}

// The weight.
{
  const require = createRequire(import.meta.url);
  const rapierPath = require.resolve('@dimforge/rapier3d-compat').replace(/rapier\.[cm]?js$/, 'rapier.mjs');
  const threePath = require.resolve('three').replace(/three\.cjs$/, 'three.module.js');
  const gzipped = (file) => gzipSync(readFileSync(file)).length;
  const rapierBytes = gzipped(rapierPath);
  const threeBytes = gzipped(threePath) + gzipped(threePath.replace('three.module.js', 'three.core.js'));
  console.log(`\nthe page's download: Rapier ${(rapierBytes / 1e6).toFixed(2)} MB gzipped (its WASM inline), three.js ${(threeBytes / 1e6).toFixed(2)} MB`);
}
