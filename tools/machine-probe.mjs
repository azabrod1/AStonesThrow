// The throwing machine on the CPU (src/throwMachine.js), and checks:
//
//   node tools/machine-probe.mjs
//
// - the loaded thing sits at the hand's point whatever the aim, so a throw
//   leaves from where it always did: placed by show, its middle is the point
//   to within a micrometre, for every heading and pitch, and is at rest
//   there once a reload is over;
// - the rail turns about the point and clears its own mount: for things from
//   a gem to the TV, pitches over MACHINE.pitch and headings round the
//   launch, no corner of the head or its sled comes inside the turntable,
//   the mast or the fork's post (bar the pin joint), or a leg, or under the
//   ground, with the hand at its lowest over the ground (the Koi pond's bank:
//   HAND_OVER_BANK; a skip's at SKIP_OVER_BANK), up to the steepest it may
//   pitch there (steepestFor), which for a stone is a hard lob's near the hand;
// - the reload (CYCLE): the sled at the muzzle as the throw leaves, at the
//   breech while the next thing comes out of the magazine (hidden before),
//   and back at the muzzle with it at the end;
// - it builds nothing from Math.random once made (three draws a geometry's id
//   from it, and a seeded throw after would draw otherwise): loading,
//   standing and showing run with Math.random made to throw.
import * as THREE from 'three';
import { ThrowMachine, MACHINE, CYCLE, fitFor } from '../src/throwMachine.js';
import { parkMiller, withRandom } from '../src/withRandom.js';

const HAND_OVER_BANK = 0.636;    // m: the hand's point over the Koi pond's bank, the lowest over land of any place (src/main.js handPosition)
const SKIP_OVER_BANK = 0.25;     // m: a skip's let-down hand (src/rock.js SKIP_THROW.handHeight, 0.3) over that bank
const SKIPPERS = ['gem', 'stone', 'tv'];   // the loads that stand for what skips (a stone, a pizza, an iPhone: flat), at a skip's pitches (src/rock.js SKIP_THROW.elevation)
const CLEAR = 0.004;             // m: the least gap counted as clear
const PIN = 0.036;               // m: what lies this near the pin's axis is its joint (the bosses), not the rail
const LOADS = {
  gem: { lowest: 0.008, highest: 0.012, across: 0.015 },
  stone: { lowest: 0.0225, highest: 0.0212, across: 0.0318 },
  bowling: { lowest: 0.108, highest: 0.108, across: 0.108 },
  tall: { lowest: 0.15, highest: 0.15, across: 0.1 },
  tv: { lowest: 0.009, highest: 0.009, across: 0.27 },
};
const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

const scene = new THREE.Scene();
const material = () => new THREE.MeshStandardMaterial({ vertexColors: true });
const point = new THREE.Vector3(0.3, 0.686, 2.015);
let groundY = point.y - HAND_OVER_BANK;
const groundAt = () => groundY;
// Built under a stream of its own, as src/main.js builds it (ensureMachine); then nothing after may draw Math.random.
const random = parkMiller(13);
const machine = withRandom(random, () => new ThrowMachine({ scene, material, groundAt, under: new THREE.Scene(), underMaterial: material, random }));
const shown = new THREE.Object3D();
const randomOf = Math.random;
Math.random = () => { throw new Error('Math.random drawn'); };
let drewRandom = false;
try {
  machine.load(LOADS.stone);
  machine.standAt(point, false, true);
  machine.aim(new THREE.Vector3(0, 1, -1));
  machine.show(true, shown, 1);
} catch (error) { drewRandom = /Math.random/.test(error.message); if (!drewRandom) throw error; }
Math.random = randomOf;
check(!drewRandom, 'loading, standing and showing draw nothing from Math.random');

const loaded = new THREE.Object3D();
const world = new THREE.Vector3();

/** The head's and sled's corners in the world, as shown now. */
function cornersOf() {
  const corners = [];
  for (const mesh of [machine.head, machine.sled]) {
    mesh.updateMatrixWorld(true);
    const positions = mesh.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) corners.push(world.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).clone());
  }
  return corners;
}
/** The distance from `at` to the segment from `from` to `to`. */
function toSegment(at, from, to) {
  const along = to.clone().sub(from), share = THREE.MathUtils.clamp(at.clone().sub(from).dot(along) / along.lengthSq(), 0, 1);
  return at.distanceTo(from.clone().addScaledVector(along, share));
}
/** The legs as src/throwMachine.js standGeometry lays them, for the turntable `depth` under the point. */
function legsOf(depth) {
  const { stand } = MACHINE, top = point.y - depth - 0.038;
  const collar = groundY + THREE.MathUtils.clamp(0.45 * (top - groundY), 0.05, 0.4);
  return [0, 1, 2].map((leg) => {
    const angle = Math.PI / 2 + (leg * 2 * Math.PI) / 3;
    return [new THREE.Vector3(point.x + Math.cos(angle) * stand.mast * 1.4, collar, point.z + Math.sin(angle) * stand.mast * 1.4),
      new THREE.Vector3(point.x + Math.cos(angle) * stand.splay, groundY + 0.012, point.z + Math.sin(angle) * stand.splay)];
  });
}

// The loaded thing at the point, every aim; and the rail clear of its mount and the ground.
const [least, most] = MACHINE.pitch;
let worstPlaced = 0;
const steepestOf = {};
for (const [name, extents] of Object.entries(LOADS)) {
  for (const skip of SKIPPERS.includes(name) ? [false, true] : [false]) {
    groundY = point.y - (skip ? SKIP_OVER_BANK : HAND_OVER_BANK);
    const hand = skip ? point.clone().setY(groundY + SKIP_OVER_BANK) : point;
    machine.load(extents);
    machine.standAt(hand, skip, true);
    const depth = machine.standing.depth, fit = machine.fit;
    const post = fit.plate + 0.034;
    const legs = legsOf(depth).map(([from, to]) => [from.clone().setY(from.y - point.y + hand.y), to]);
    const problems = new Set();
    const steepest = THREE.MathUtils.radToDeg(machine.steepest);
    const pitches = skip ? [-3, 0, 3, 6] : [...Array.from({ length: Math.floor((steepest - least) / 5) + 1 }, (unused, step) => least + 5 * step), steepest];
    steepestOf[name] ??= steepest;
    for (const pitch of pitches) {
      for (let heading = 45; heading <= 135; heading += 15) {
        const radians = THREE.MathUtils.degToRad(heading), up = THREE.MathUtils.degToRad(pitch);
        machine.aim(new THREE.Vector3(Math.cos(up) * Math.cos(radians), Math.sin(up), -Math.cos(up) * Math.sin(radians)));
        for (const since of [Infinity, (CYCLE.feed[0] + CYCLE.feed[1]) / 2]) {
          machine.firedAt = since === Infinity ? -Infinity : 0;
          machine.show(true, loaded, since === Infinity ? 1 : since);
          if (since === Infinity) worstPlaced = Math.max(worstPlaced, loaded.position.distanceTo(hand));
          const turn = machine.heading;
          const postTop = new THREE.Vector3(0, 0, -post).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(hand);
          const postFoot = postTop.clone().setY(hand.y - depth);
          const pinFrom = new THREE.Vector3(0, 0, -fit.plate + 0.01).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(hand);
          for (const corner of cornersOf()) {
            const level = Math.hypot(corner.x - hand.x, corner.z - hand.z);
            if (corner.y < hand.y - depth + 0.005 && level < 0.068 + CLEAR) problems.add(`turntable or mast at pitch ${pitch}`);
            // (Bar the pin joint: what lies within PIN of the pin's axis, the head's boss against the fork's.)
            if (toSegment(corner, pinFrom, postTop) > PIN && toSegment(corner, postTop, postFoot) < 0.016 + CLEAR) problems.add(`the post at pitch ${pitch}`);
            if (corner.y < groundY + CLEAR) problems.add(`the ground at pitch ${pitch}`);
            for (const [from, to] of legs) if (toSegment(corner, from, to) < MACHINE.stand.leg + CLEAR) problems.add(`a leg at pitch ${pitch}`);
          }
        }
      }
    }
    check(problems.size === 0, `${name}${skip ? ' skipped' : ''}: the rail clears its mount, legs and the ground at pitches ${pitches[0]}° to ${pitches.at(-1)}° (turntable ${depth.toFixed(2)} m under the hand)${problems.size ? `: meets ${[...problems].slice(0, 4).join(', ')}` : ''}`);
  }
}
check(steepestOf.gem >= 75 && steepestOf.stone >= 75 && steepestOf.bowling >= 50, `the rail pitches as steep as a hard lob near the hand for a stone (75°), and a bowling ball at least 50°, at the lowest bank: ${Object.entries(steepestOf).map(([name, degrees]) => `${name} ${degrees.toFixed(1)}°`).join(', ')}`);
check(worstPlaced < 1e-6, `the loaded thing sits at the hand's point for every aim (worst ${(worstPlaced * 1e6).toFixed(3)} µm off)`);

// The reload.
groundY = point.y - HAND_OVER_BANK;
machine.load(LOADS.stone);
machine.standAt(point, false, true);
machine.aim(new THREE.Vector3(0, 1, -1));
const fit = fitFor(LOADS.stone);
machine.fired(10);
const sledAlong = () => machine.sled.position.clone().sub(machine.head.position).dot(machine.forward);
machine.show(true, loaded, 10);
const atThrow = sledAlong();
machine.show(true, loaded, 10 + CYCLE.feed[0] - 1e-4);
const hiddenBefore = !loaded.visible, atBreech = sledAlong();
machine.show(true, loaded, 10 + (CYCLE.feed[0] + CYCLE.feed[1]) / 2);
const outOfMagazine = loaded.visible;
machine.show(true, loaded, 10 + CYCLE.load[1] + 0.01);
const backAt = sledAlong(), placedAfter = loaded.position.distanceTo(point);
check(Math.abs(atThrow) < 1e-9, `the sled is at the muzzle as the throw leaves (${atThrow.toFixed(4)} m)`);
check(hiddenBefore && Math.abs(atBreech - fit.breech) < 1e-4, `the sled at the breech (${atBreech.toFixed(3)} m) and the next thing unseen in the magazine before it comes out`);
check(outOfMagazine, 'the next thing seen as it comes out of the magazine');
check(Math.abs(backAt) < 1e-9 && placedAfter < 1e-6 && loaded.visible, `back at the muzzle with it at the end (${(placedAfter * 1e6).toFixed(3)} µm from the point)`);
check(!machine.reloading(10 + CYCLE.load[1] + 0.01) && machine.reloading(10 + 0.1), 'reloading for the cycle and not after it');

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
