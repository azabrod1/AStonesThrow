// The Koi pond's garden on the CPU (src/koiGarden.js), and checks:
//
//   node tools/garden-probe.mjs
//
// - nothing thrown comes down on the ground: every aim over the solver's
//   patch, kept inside the pond (keepInPond), lies at least KOI_AIM.margin
//   and the thing's own margin inside the water;
// - the planting catches what comes to it: each kind of thing, sent at the
//   banks from the water's edge (as a skip run on, or a slide off the ice,
//   would bring it) fast or slow, low or bouncing, is caught where the
//   drawn planting begins (plantingFront), never passes into it by more
//   than CAUGHT_WITHIN, and never comes to rest on the lawn behind the
//   waterline under the planting; one sent over it is lost in the garden;
// - a thing held in the hand and dragged into the planting (src/main.js
//   constrainGrab) is kept out of it (keepOutOfGarden), never knocked by it
//   nor lost in the garden (holdInGarden leaves a held thing be);
// - the surface seen from below marches to the Koi pond's bed, not the
//   lake's: every uniform the shore's GLSL twin (LAKE_BED) declares is one
//   the water shares from the floor (BED_UNIFORMS, src/waterSurface.js setBed);
// - the cost: the garden's build and its triangles, the scene's (fine) under
//   300k and the mirror's (coarse, Low's scene's too) under 40% of them, and
//   its shade's bake (bakeShade) under 150 ms the first time and 50 for a
//   new sun; the
//   coarse garden laid out as the fine one (the same shrubs in the same
//   order and tints, each where the fine one's is), so what is drawn on Low
//   and in the mirror stands where the fine garden, which catches, does.
import * as THREE from 'three';
import { Rock } from '../src/rock.js';
import { THINGS, THING_NAMES } from '../src/things.js';
import { setShoreKind, koiFloorDepthAt, koiShoreDistance, koiShoreRadius, KOI_SHORE } from '../src/pondFloor.js';
import { koiGround, holdInGarden, keepInPond, keepOutOfGarden, plantingFront, createKoiGarden, KOI_AIM, GARDEN } from '../src/koiGarden.js';
import { collideThings } from '../src/collide.js';
import { BED_UNIFORMS } from '../src/waterSurface.js';
import { LAKE_BED } from '../src/shaders/scene.js';

const CAUGHT_WITHIN = 0.03;   // m: the most a thing may go into the planting past where it is drawn
const STEP = 1 / 240;
setShoreKind('koi');
const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }
let randomState = 1;
Math.random = () => { randomState = (randomState * 16807) % 2147483647; return (randomState - 1) / 2147483646; };

console.log('aims:');
{
  let least = Infinity;
  for (let column = 0; column <= 80; column++) {
    for (let row = 0; row <= 80; row++) {
      const aim = keepInPond({ x: -3 + 6 * column / 80, z: -4 + 6 * row / 80 }, 0.05);
      least = Math.min(least, koiShoreDistance(aim.x, aim.z));
    }
  }
  check(least >= KOI_AIM.margin + 0.05 - 1e-6, `every aim at least ${(KOI_AIM.margin + 0.05).toFixed(2)} m inside the water (the nearest ${least.toFixed(3)} m)`);
}

console.log('\nthe planting catches:');
{
  const started = performance.now();
  // Under a sun like the garden's (19° up), so its shade is baked as the page bakes it.
  const lighting = { sunDirection: new THREE.Vector3(-0.6, 0.333, -0.73).normalize(), sunIrradiance: new THREE.Vector3(1, 1, 1), skyAmbient: new THREE.Vector3(1, 1, 1) };
  const garden = createKoiGarden({ envTexture: null, mirrorLayer: 2, lighting });
  garden.setVisible(true);
  const built = performance.now() - started;
  // The scene's garden (fine) and the mirror's (coarse: src/koiGarden.js COARSE), the meshes by look, main then mirror.
  const fine = garden.meshes.filter((mesh, index) => index % 2 === 0), coarse = garden.meshes.filter((mesh, index) => index % 2 === 1);
  const trianglesOf = (meshes) => meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
  const fineTriangles = trianglesOf(fine), coarseTriangles = trianglesOf(coarse);
  console.log(`  built in ${built.toFixed(0)} ms (its shade baked in ${garden.shadeMilliseconds.toFixed(0)} of them): the scene's ${(fineTriangles / 1000).toFixed(0)}k triangles, the mirror's (and Low's scene) ${(coarseTriangles / 1000).toFixed(0)}k`);
  const firstShade = garden.shadeMilliseconds;
  lighting.sunDirection.set(-0.5, 0.4, -0.77).normalize();
  garden.setLight();   // a new sun: its shadows baked again, its occlusion kept
  check(firstShade < 150 && garden.shadeMilliseconds < 50, `its shade baked in under 150 ms the first time (${firstShade.toFixed(0)} ms), a new sun's in under 50 (${garden.shadeMilliseconds.toFixed(0)} ms)`);
  check(fineTriangles < 300000, `the scene's under 300k triangles (${(fineTriangles / 1000).toFixed(0)}k)`);
  check(coarseTriangles < 0.4 * fineTriangles, `the coarse garden under 40% of the fine's triangles (${(100 * coarseTriangles / fineTriangles).toFixed(0)}%)`);
  // The coarse garden is the fine one's shrubs more coarsely made, from the same draws (src/koiGarden.js COARSE): the same
  // shrubs in the same order, each its tint (drawn as it is planted) and its box about where the fine one's is (a coarser
  // sphere reaches a little less far).
  const shrubs = (mesh) => {
    const tints = mesh.geometry.attributes.tint, positions = mesh.geometry.attributes.position, runs = [];
    for (let corner = 0; corner < tints.count; corner++) {
      const tint = tints.getX(corner);
      if (runs.at(-1)?.tint !== tint) runs.push({ tint, box: new THREE.Box3() });
      runs.at(-1).box.expandByPoint(new THREE.Vector3(positions.getX(corner), positions.getY(corner), positions.getZ(corner)));
    }
    return runs;
  };
  const fineShrubs = shrubs(fine[1]), coarseShrubs = shrubs(coarse[1]);
  const sameTints = fineShrubs.length === coarseShrubs.length && fineShrubs.every((shrub, index) => shrub.tint === coarseShrubs[index].tint);
  const moved = sameTints ? Math.max(...fineShrubs.map((shrub, index) => {
    const size = shrub.box.getSize(new THREE.Vector3()).length();
    return shrub.box.getCenter(new THREE.Vector3()).distanceTo(coarseShrubs[index].box.getCenter(new THREE.Vector3())) / size;
  })) : Infinity;
  console.log(`  the coarse garden: ${coarseShrubs.length} shrubs against ${fineShrubs.length}, each its box's middle at most ${(100 * moved).toFixed(1)}% of its size from the fine one's`);
  check(sameTints && moved < 0.05, `the coarse garden is laid out as the fine one: the same shrubs, tints and order, each within 5% of its size (${(100 * moved).toFixed(1)}%)`);
  let sent = 0, deepest = -Infinity, restingOnLawn = 0, lost = 0, worst = null;
  const inSector = (angle) => { const into = (((angle - GARDEN.from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return into > 0.05 && into < (((GARDEN.to - GARDEN.from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - 0.05; };
  for (const name of THING_NAMES) {
    const thing = THINGS[name];
    if (thing.hidden) continue;
    const measured = thing.byDiameter ? { radius: 0.03, mass: thing.measure(6).mass } : thing.measure(thing.slider?.initial);
    for (let angle = -3.1; angle < 3.1; angle += 0.37) {
      if (!inSector(angle)) continue;
      for (const [speed, rise] of [[2, 0], [6, 0], [10, 1.5], [14, 3]]) {
        const reach = koiShoreRadius(angle) - measured.radius - 0.02;
        const x = KOI_SHORE.centre[0] + Math.cos(angle) * reach, z = KOI_SHORE.centre[1] + Math.sin(angle) * reach;
        const rock = new Rock({ radius: measured.radius, position: new THREE.Vector3(x, measured.radius + 0.02, z), velocity: new THREE.Vector3(Math.cos(angle) * speed, rise, Math.sin(angle) * speed), envTexture: null, thing: name, mass: measured.mass });
        rock.ground = koiGround;
        sent++;
        for (let time = 0; time < 12; time += STEP) {
          rock.update(STEP, koiFloorDepthAt);
          collideThings([rock], holdInGarden);
          if (rock.lostInGarden) { lost++; break; }
          const front = plantingFront(rock.position.x, rock.position.y, rock.position.z, rock.collisionRadius);
          const past = -koiShoreDistance(rock.position.x, rock.position.z) + rock.collisionRadius - front;
          if (past > deepest) { deepest = past; worst = `${name} at ${speed} m/s toward θ ${angle.toFixed(2)}`; }
          if (rock.state === 'rest') break;
        }
        if (rock.state === 'rest' && rock.onGround && koiShoreDistance(rock.position.x, rock.position.z) < -0.15) restingOnLawn++;
      }
    }
  }
  check(deepest <= CAUGHT_WITHIN, `${sent} things sent at the banks: none goes into the planting past where it is drawn by more than ${CAUGHT_WITHIN * 100} cm (the deepest ${(deepest * 100).toFixed(1)} cm, ${worst})`);
  check(restingOnLawn === 0, `none comes to rest on the ground under the planting (${restingOnLawn})`);
  console.log(`  ${lost} of ${sent} sent over the planting are lost in the garden`);
}

console.log('\nthe bed seen from below:');
{
  const declared = [...LAKE_BED.matchAll(/^uniform \w+ (\w+);/gm)].map((match) => match[1]);
  const missing = declared.filter((name) => !BED_UNIFORMS.includes(name));
  check(declared.includes('uKoiPond') && missing.length === 0, `the water seen from below shares every uniform of the shore's twin (${declared.join(', ')})${missing.length ? `; not ${missing.join(', ')}` : ''}`);
}

console.log('\nheld in the hand:');
{
  // Dragged from the water 1.5 m into the planting at each angle of the banks, the hand's point kept out of it as
  // src/main.js constrainGrab keeps it, the planting's pass run on it each step as on everything.
  let dragged = 0, deepest = -Infinity, knocked = 0, lost = 0;
  const span = (((GARDEN.to - GARDEN.from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  for (let share = 0.05; share < 1; share += 0.1) {
    const angle = GARDEN.from + share * span;
    const rock = new Rock({ radius: 0.03, position: new THREE.Vector3(), velocity: new THREE.Vector3(), envTexture: null, thing: 'stone' });
    rock.ground = koiGround;
    rock.hold();
    dragged++;
    for (let out = koiShoreRadius(angle) - 0.3; out < koiShoreRadius(angle) + 1.5; out += 0.01) {
      const point = new THREE.Vector3(KOI_SHORE.centre[0] + Math.cos(angle) * out, 0.15, KOI_SHORE.centre[1] + Math.sin(angle) * out);
      keepOutOfGarden(point, rock.collisionRadius);
      rock.moveHeld(point);
      collideThings([rock], holdInGarden);
      if (rock.lostInGarden) lost++;
      if (rock.velocity.lengthSq() > 0) knocked++;
      const front = plantingFront(rock.position.x, rock.position.y, rock.position.z, rock.collisionRadius);
      deepest = Math.max(deepest, -koiShoreDistance(rock.position.x, rock.position.z) + rock.collisionRadius - front);
    }
    rock.release();
    collideThings([rock], holdInGarden);
    if (rock.lostInGarden) lost++;
  }
  check(lost === 0 && knocked === 0 && deepest <= 1e-6, `${dragged} stones held and dragged into the planting: kept out of it (at most ${(100 * Math.max(deepest, 0)).toFixed(2)} cm in), knocked ${knocked} times, lost ${lost}, let go there`);
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
