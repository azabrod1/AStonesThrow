// The Reflecting Pool on the CPU (PLACES `mall`: src/mallPool.js, its
// shore MALL_POOL in src/pondFloor.js), and checks:
//
//   node tools/mall-probe.mjs
//
// - the bed's GLSL twin (LAKE_BED in src/shaders/scene.js) is laid out as
//   MALL_POOL: its MALL_* numbers are MALL_POOL's, and the water seen from
//   below shares every uniform it declares (BED_UNIFORMS); the walls that
//   hold things (MALL_BASIN) and the water (MALL_BOUNDS) stand at its walls;
// - the walls hold: each kind of thing, sent at the west wall, a side wall
//   and their corner from 5 cm inside (its own reach toward the wall,
//   lowestAlong; slow or fast, low or bouncing) or lobbed over it from a
//   metre inside, with the coping as its
//   ground (src/pool.js poolGround) and the walls holding it as src/main.js
//   does (holdInPool on MALL_BASIN), never reaches into the granite (past a
//   wall's face by more than INTO_STONE while its lowest point is under the
//   coping's top) and never ends outside the water under the coping's top;
// - the meshes: the ground leaves the pool open (no triangle over the
//   water) and reaches the horizon; draws and triangles, in the scene and
//   the mirror, under TRIANGLE_BOUND; the bed's mesh (src/pondFloor.js
//   mallBedGeometry) reaches the east wall and steps at every wall: no
//   triangle with corners either side of one is wider across it than
//   WALL_WIDEST, so the walls stand from the bed to the coping.
import * as THREE from 'three';
import { Rock } from '../src/rock.js';
import { THINGS, THING_NAMES } from '../src/things.js';
import { setShoreKind, floorDepthAt, shoreDistance, mallBedGeometry, MALL_POOL } from '../src/pondFloor.js';
import { holdInPool, poolGround } from '../src/pool.js';
import { createMallPool, MALL_BASIN, MALL_BOUNDS } from '../src/mallPool.js';
import { OUTER_HALF_SIZE } from '../src/waterSurface.js';
import { collideThings } from '../src/collide.js';
import { BED_UNIFORMS } from '../src/waterSurface.js';
import { LAKE_BED } from '../src/shaders/scene.js';

const INTO_STONE = 0.01;           // m: the most a thing may lie inside a wall's face below the coping's top
const TRIANGLE_BOUND = 2000;       // the ground's and the walls' triangles, the scene's and the mirror's
const WALL_WIDEST = 0.01;          // m: the most a bed triangle across a wall may span across it
const STEP = 1 / 240;
setShoreKind('mall');
const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }
let randomState = 1;
Math.random = () => { randomState = (randomState * 16807) % 2147483647; return (randomState - 1) / 2147483646; };

console.log('the bed\'s twin:');
{
  const defined = (name) => Number(LAKE_BED.match(new RegExp(`#define MALL_${name} ([\\d.]+)`))?.[1]);
  const pairs = { HALF_WIDTH: MALL_POOL.halfWidth, WEST: MALL_POOL.west, LENGTH: MALL_POOL.length, COPING: MALL_POOL.coping, EDGE: MALL_POOL.edge, DEEP: MALL_POOL.deep };
  const differing = Object.entries(pairs).filter(([name, value]) => defined(name) !== value).map(([name, value]) => `MALL_${name} ${defined(name)} against ${value}`);
  check(differing.length === 0, `LAKE_BED's Reflecting Pool is MALL_POOL's${differing.length ? `: ${differing.join(', ')}` : ''}`);
  const declared = [...LAKE_BED.matchAll(/^uniform \w+ (\w+);/gm)].map((match) => match[1]);
  const missing = declared.filter((name) => !BED_UNIFORMS.includes(name));
  check(missing.length === 0, `the water seen from below shares every uniform of the shore's twin${missing.length ? `; not ${missing.join(', ')}` : ''}`);
  check(MALL_BASIN.minX === -MALL_POOL.halfWidth && MALL_BASIN.minZ + MALL_BASIN.sizeZ === MALL_POOL.west && MALL_BASIN.deck === MALL_POOL.coping, 'the walls that hold things (MALL_BASIN) stand where the bed meets the coping');
  check(MALL_BOUNDS.minX === MALL_BASIN.minX && MALL_BOUNDS.maxX === MALL_BASIN.minX + MALL_BASIN.sizeX && MALL_BOUNDS.minZ === MALL_BASIN.minZ && MALL_BOUNDS.maxZ === MALL_BASIN.minZ + MALL_BASIN.sizeZ, 'the water stops at the same walls (MALL_BOUNDS)');
  console.log(`  the bed ${floorDepthAt(MALL_POOL.halfWidth - 0.01, 0).toFixed(2)} m deep at the walls, ${floorDepthAt(0, 0).toFixed(2)} m on the axis; the coping ${(-floorDepthAt(0, MALL_POOL.west + 0.5)).toFixed(2)} m up`);
}

console.log('\nthe walls hold:');
{
  const ground = poolGround(MALL_BASIN);
  const contain = (rock) => holdInPool(rock, MALL_BASIN);
  const top = MALL_BASIN.deck;
  // Each start just inside the water, aimed square at the wall (or into the corner).
  const west = new THREE.Vector3(0, 0, -1), south = new THREE.Vector3(-1, 0, 0);   // lowestAlong these: a thing's reach toward the west wall, the south one
  const reachInto = (rock) => Math.max(rock.position.z - rock.lowestAlong(west) - MALL_POOL.west, rock.position.x - rock.lowestAlong(south) - MALL_POOL.halfWidth);
  const walls = [
    { name: 'the west wall', toward: [0, 1] },
    { name: 'a side wall', toward: [1, 0] },
    { name: 'the corner', toward: [Math.SQRT1_2, Math.SQRT1_2] },
  ];
  let sent = 0, deepest = -Infinity, worst = null, restingUnder = 0, over = 0;
  for (const name of THING_NAMES) {
    const thing = THINGS[name];
    if (thing.hidden) continue;
    const measured = thing.byDiameter ? { radius: 0.03, mass: thing.measure(6).mass } : thing.measure(thing.slider?.initial);
    for (const wall of walls) {
      // From 5 cm inside, along the water or up at it; and from a metre inside, lobbed over it onto the coping.
      for (const [speed, rise, inside] of [[1, 0, 0.05], [4, 0, 0.05], [8, 1.5, 0.05], [12, 3, 0.05], [3, 4, 1], [5, 5, 1]]) {
        const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 0, -1.5), velocity: new THREE.Vector3(wall.toward[0] * speed, rise, wall.toward[1] * speed), envTexture: null, thing: name, mass: measured.mass });
        const [x, z] = [wall.toward[0] ? MALL_POOL.halfWidth + rock.lowestAlong(south) - inside : 0, wall.toward[1] ? MALL_POOL.west + rock.lowestAlong(west) - inside : -1.5];
        rock.position.set(x, 0.02 - rock.lowestOffset(), z);
        rock.previous.copy(rock.position);
        rock.ground = ground;
        sent++;
        let cleared = false;   // it has been past a wall's face with its lowest point over the coping's top: over the wall, on the ground
        for (let time = 0; time < 10; time += STEP) {
          rock.update(STEP, floorDepthAt);
          collideThings([rock], contain);
          // How far it reaches into the stone: past a wall's face, while its lowest point is under the coping's top,
          // not having come over it (coming down on the coping or the walk, it is the ground's: src/rock.js).
          const lowest = rock.position.y + rock.lowestOffset(), past = reachInto(rock);
          if (past > 0 && lowest >= top - 0.005) cleared = true;
          const into = lowest < top - 0.005 && !cleared ? past : -Infinity;
          if (into > deepest) { deepest = into; worst = `${name} at ${speed} m/s at ${wall.name}`; }
          if (rock.state === 'rest') break;
        }
        if (shoreDistance(rock.position.x, rock.position.z) < 0) {
          over++;
          if (rock.position.y + rock.lowestOffset() < top - 0.01) restingUnder++;
        }
      }
    }
  }
  check(deepest <= INTO_STONE, `${sent} things sent at the walls: none goes into the granite by more than ${INTO_STONE * 100} cm (the deepest ${(Math.max(deepest, 0) * 100).toFixed(2)} cm, ${worst})`);
  check(over > 0 && restingUnder === 0, `of the ${over} that went over a wall, none ends under the coping's top (${restingUnder})`);
}

console.log('\nthe meshes:');
{
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(1, 1, 1), skyAmbient: new THREE.Vector3(0.2, 0.2, 0.2) };
  const environment = { cubeTexture: null };
  const started = performance.now();
  const mall = createMallPool(lighting, environment);
  const built = performance.now() - started;
  const scene = mall.meshes.filter((mesh) => mesh.layers.mask === 1), mirror = mall.meshes.filter((mesh) => mesh.layers.mask !== 1);
  const trianglesOf = (meshes) => meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
  console.log(`  built in ${built.toFixed(1)} ms: ${scene.length} draws in the scene, ${trianglesOf(scene)} triangles; ${mirror.length} in the mirror, ${trianglesOf(mirror)}`);
  check(trianglesOf(scene) + trianglesOf(mirror) < TRIANGLE_BOUND, `under ${TRIANGLE_BOUND} triangles in all`);
  // The ground: no triangle's middle over the water, and its corners out to the horizon.
  const ground = scene[0].geometry, position = ground.attributes.position, index = ground.index.array;
  let overWater = 0, farthest = 0;
  for (let corner = 0; corner < index.length; corner += 3) {
    let x = 0, z = 0;
    for (let at = 0; at < 3; at++) { x += position.getX(index[corner + at]) / 3; z += position.getZ(index[corner + at]) / 3; farthest = Math.max(farthest, Math.abs(position.getX(index[corner + at])), Math.abs(position.getZ(index[corner + at]))); }
    if (shoreDistance(x, z) > 0) overWater++;
  }
  check(overWater === 0, `the ground leaves the pool open (${overWater} triangles over the water)`);
  check(farthest >= OUTER_HALF_SIZE, `and reaches the horizon (${farthest} m)`);
  // The bed: to the east wall, and a step at every wall rather than a ramp.
  const bed = mallBedGeometry(), corners = bed.attributes.position, bedIndex = bed.index.array;
  const east = MALL_POOL.west - MALL_POOL.length;
  let widest = 0, eastmost = Infinity;
  for (let corner = 0; corner < bedIndex.length; corner += 3) {
    const points = [0, 1, 2].map((at) => [corners.getX(bedIndex[corner + at]), corners.getZ(bedIndex[corner + at])]);
    for (const point of points) eastmost = Math.min(eastmost, point[1]);
    // A triangle with corners both in the water and outside it (shoreDistance: the signed distance to the nearest
    // wall): how far apart they are across the walls.
    const distances = points.map(([x, z]) => shoreDistance(x, z));
    if (distances.some((distance) => distance < 0) && distances.some((distance) => distance >= 0)) widest = Math.max(widest, Math.max(...distances) - Math.min(...distances));
  }
  console.log(`  the bed: ${corners.count} vertices, ${bedIndex.length / 3} triangles`);
  check(eastmost <= east, `the bed reaches the east wall (${eastmost.toFixed(1)} m, the wall at ${east.toFixed(1)} m)`);
  check(widest <= WALL_WIDEST, `the bed steps at the walls (its triangles across a wall at most ${(widest * 1000).toFixed(1)} mm wide)`);
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
