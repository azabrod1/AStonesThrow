// The Reflecting Pool on the CPU (PLACES `mall`: src/nationalMall.js, its
// shore MALL_POOL in src/pondFloor.js), and checks:
//
//   node tools/mall-probe.mjs
//
// - the bed's GLSL twin (LAKE_BED in src/shaders/scene.js) is laid out as
//   MALL_POOL: its MALL_* numbers are MALL_POOL's, and the water seen from
//   below shares every uniform it declares (BED_UNIFORMS);
// - the walls hold: each kind of thing, sent at the west wall, a side wall
//   and their corner from 5 cm inside (its own reach toward the wall,
//   lowestAlong; slow or fast, low or bouncing), with the coping as its
//   ground (src/pool.js poolGround) and the walls holding it as src/main.js
//   does (holdInPool on MALL_BASIN), never reaches into the granite (past a
//   wall's face by more than INTO_STONE while its lowest point is under the
//   coping's top) and never ends outside the water under the coping's top;
// - the cost: the grounds' build (the leaves' atlas and every mesh, from
//   one seeded stream), their triangles in the scene, under TRIANGLE_BOUND,
//   and in the mirror (each tree a level coarser), under MIRROR_SHARE of
//   the scene's (it is drawn again, every vertex, each frame a splash's
//   image is), and the trees and cards each level draws; built twice, and
//   a stage a task (prepare), the same.
import * as THREE from 'three';
import { Rock } from '../src/rock.js';
import { THINGS, THING_NAMES } from '../src/things.js';
import { setShoreKind, floorDepthAt, shoreDistance, MALL_POOL } from '../src/pondFloor.js';
import { holdInPool, poolGround } from '../src/pool.js';
import { createNationalMall, MALL_BASIN } from '../src/nationalMall.js';
import { collideThings } from '../src/collide.js';
import { BED_UNIFORMS } from '../src/waterSurface.js';
import { LAKE_BED } from '../src/shaders/scene.js';

const INTO_STONE = 0.01;           // m: the most a thing may lie inside a wall's face below the coping's top
const TRIANGLE_BOUND = 700000;     // the grounds' triangles in the scene
const MIRROR_SHARE = 0.55;         // and the mirror's, at most this share of them
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
      for (const [speed, rise] of [[1, 0], [4, 0], [8, 1.5], [12, 3]]) {
        const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(0, 0, -1.5), velocity: new THREE.Vector3(wall.toward[0] * speed, rise, wall.toward[1] * speed), envTexture: null, thing: name, mass: measured.mass });
        const [x, z] = [wall.toward[0] ? MALL_POOL.halfWidth + rock.lowestAlong(south) - 0.05 : 0, wall.toward[1] ? MALL_POOL.west + rock.lowestAlong(west) - 0.05 : -1.5];
        rock.position.set(x, 0.02 - rock.lowestOffset(), z);
        rock.previous.copy(rock.position);
        rock.ground = ground;
        sent++;
        for (let time = 0; time < 10; time += STEP) {
          rock.update(STEP, floorDepthAt);
          collideThings([rock], contain);
          // How far it reaches into the stone: past a wall's face, while its lowest point is under the coping's top.
          const into = rock.position.y + rock.lowestOffset() < top - 0.005 ? reachInto(rock) : -Infinity;
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
  check(restingUnder === 0, `none ends outside the water under the coping's top (${restingUnder} of the ${over} sent over the wall)`);
}

console.log('\nthe cost:');
{
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(1, 1, 1), skyAmbient: new THREE.Vector3(0.2, 0.2, 0.2) };
  const environment = { cubeTexture: null, hazeUniforms: {} };
  const make = () => {
    const mall = createNationalMall({ lighting, environment, mirrorLayer: 2 });
    const started = performance.now();
    mall.setVisible(true);
    return { mall, built: performance.now() - started };
  };
  const { mall, built } = make();
  const scene = mall.meshes.filter((mesh) => mesh.layers.mask === 1), mirror = mall.meshes.filter((mesh) => mesh.layers.mask !== 1);
  const trianglesOf = (meshes) => meshes.reduce((sum, mesh) => sum + (mesh.geometry.index.count / 3) * (mesh.geometry.isInstancedBufferGeometry ? mesh.geometry.instanceCount : 1), 0);
  const triangles = trianglesOf(scene), mirrored = trianglesOf(mirror);
  console.log(`  built in ${built.toFixed(0)} ms: ${scene.length} draws in the scene, ${(triangles / 1000).toFixed(0)}k triangles; as many in the mirror, ${(mirrored / 1000).toFixed(0)}k`);
  for (const [level, { trees, cards }] of mall.counts.entries()) console.log(`  crowns' level ${level}: ${trees} trees of ${cards} cards`);
  check(triangles < TRIANGLE_BOUND, `the grounds under ${TRIANGLE_BOUND / 1000}k triangles (${(triangles / 1000).toFixed(0)}k)`);
  check(mirrored < MIRROR_SHARE * triangles, `the mirror's under ${Math.round(100 * MIRROR_SHARE)}% of them (${(100 * mirrored / triangles).toFixed(0)}%)`);
  check(built < 1500, `built in under 1.5 s (${built.toFixed(0)} ms)`);
  const sameAs = (other) => mall.meshes.every((mesh, index) => {
    const one = mesh.geometry.attributes.position.array, theirs = other.meshes[index].geometry.attributes.position.array;
    return one.length === theirs.length && one.every((value, at) => value === theirs[at]);
  });
  check(sameAs(make().mall), 'built twice, the same (one seeded stream)');
  const staged = createNationalMall({ lighting, environment, mirrorLayer: 2 });
  await staged.prepare();
  check(sameAs(staged), 'built a stage a task (prepare), the same');
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
