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
//   its costs as shares of the garden's whole first build in the same run
//   (SHARE_OF_BUILD: what is measured is the same work's time on the same
//   machine at the same moment, so another probe crowding the cores slows
//   both alike, where a budget in milliseconds fails): its shade's first
//   bake (the occlusion too), a new sun's (the least over three suns); built
//   ahead in steps (prepareSome, as src/main.js does while the Koi pond's
//   sky downloads), a separate copy of the module, the same garden to the
//   last corner, its longest step, and showing it then (its shadows alone);
//   the build itself is held by its triangles; on Low, shown before it
//   was built ahead, building ahead stops (the fine garden it let go is
//   not built again); the
//   coarse garden laid out as the fine one (the same shrubs in the same
//   order and tints, each where the fine one's is), so what is drawn on Low
//   and in the mirror stands where the fine garden, which catches, does.
import * as THREE from 'three';
import { Rock } from '../src/rock.js';
import { THINGS, THING_NAMES } from '../src/things.js';
import { setShoreKind, koiFloorDepthAt, koiShoreDistance, koiShoreRadius, KOI_SHORE, gardenShadeUniforms } from '../src/pondFloor.js';
import { koiGround, holdInGarden, keepInPond, keepOutOfGarden, plantingFront, createKoiGarden, KOI_AIM, GARDEN } from '../src/koiGarden.js';
import { collideThings } from '../src/collide.js';
import { BED_UNIFORMS } from '../src/waterSurface.js';
import { LAKE_BED } from '../src/shaders/scene.js';

const CAUGHT_WITHIN = 0.03;   // m: the most a thing may go into the planting past where it is drawn
const STEP = 1 / 240;
setShoreKind('koi');
const failures = [];
// Each cost's most, as a share of the garden's whole first build (the header). On an M1, alone or with the cores
// crowded: the first bake 8 to 9%, a new sun's 1 to 1.5%, the longest step ahead 1.2 to 1.3%, showing it built 4%.
const SHARE_OF_BUILD = { firstShade: 0.15, newSun: 0.04, step: 0.03, shown: 0.08 };
const share = (milliseconds, of) => `${milliseconds.toFixed(1)} ms, ${(100 * milliseconds / of).toFixed(1)}% of the build`;
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
  let skyIsOwn = true;   // whether the sky in is the garden's own (src/main.js ownSky)
  const garden = createKoiGarden({ envTexture: null, mirrorLayer: 2, lighting, ownSky: () => skyIsOwn });
  garden.setVisible(true);
  const built = performance.now() - started;
  // The scene's garden (fine) and the mirror's (coarse: src/koiGarden.js COARSE), the meshes by look, main then mirror.
  const fine = garden.meshes.filter((mesh, index) => index % 2 === 0), coarse = garden.meshes.filter((mesh, index) => index % 2 === 1);
  const trianglesOf = (meshes) => meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
  const fineTriangles = trianglesOf(fine), coarseTriangles = trianglesOf(coarse);
  console.log(`  built in ${built.toFixed(0)} ms (its shade baked in ${garden.shadeMilliseconds.toFixed(0)} of them): the scene's ${(fineTriangles / 1000).toFixed(0)}k triangles, the mirror's (and Low's scene) ${(coarseTriangles / 1000).toFixed(0)}k`);
  const firstShade = garden.shadeMilliseconds;
  let newSun = Infinity;
  for (const sun of [[-0.55, 0.37, -0.75], [-0.45, 0.42, -0.79], [-0.5, 0.4, -0.77]]) {
    lighting.sunDirection.set(...sun).normalize();
    garden.setLight();   // a new sun: its shadows baked again, its occlusion kept
    newSun = Math.min(newSun, garden.shadeMilliseconds);
  }
  check(firstShade < SHARE_OF_BUILD.firstShade * built, `its shade's first bake under ${100 * SHARE_OF_BUILD.firstShade}% of the build (${share(firstShade, built)})`);
  check(newSun < SHARE_OF_BUILD.newSun * built, `a new sun's under ${100 * SHARE_OF_BUILD.newSun}% (${share(newSun, built)}, the least of three)`);
  const shadeTexture = gardenShadeUniforms.uGardenShade.value;
  const bakedVersion = shadeTexture.version;
  garden.setVisible(false);
  lighting.sunDirection.set(-0.3, 0.5, -0.8).normalize();
  garden.setLight();
  check(shadeTexture.version === bakedVersion, 'a hidden garden does not rebake or upload shade for another sun');
  garden.setVisible(true);
  check(shadeTexture.version === bakedVersion + 1 && gardenShadeUniforms.uGardenShadeSun.value.equals(lighting.sunDirection),
    'showing the garden refreshes shade for the current sun');
  garden.setVisible(true);
  garden.setLight();
  check(shadeTexture.version === bakedVersion + 1, 'an unchanged visible sun reuses the shade bake');
  // Leaving: the next place's sky (its sun) comes in while the garden is still shown (src/main.js applySky before
  // setKoiPond); coming back, the garden's own sky and sun again.
  const ownSun = lighting.sunDirection.clone();
  skyIsOwn = false;
  lighting.sunDirection.set(0.2, 0.6, -0.77).normalize();
  garden.setLight();
  check(shadeTexture.version === bakedVersion + 1, 'another place\'s sky, come in while the garden is shown, bakes no shade');
  skyIsOwn = true;
  lighting.sunDirection.copy(ownSun);
  garden.setLight();
  garden.setVisible(true);
  check(shadeTexture.version === bakedVersion + 1, 'back under its own sky and sun, the shade it holds is kept');
  {
    // Built ahead (prepareSome), in a copy of the module of its own (nothing built yet), a step at a time.
    const ahead = await import('../src/koiGarden.js?ahead');
    const aheadGarden = ahead.createKoiGarden({ envTexture: null, mirrorLayer: 2, lighting, ownSky: () => true });
    let steps = 0, longest = 0, total = 0;
    for (let done = false; !done; steps++) {
      const started = performance.now();
      done = aheadGarden.prepareSome(0);
      const spent = performance.now() - started;
      longest = Math.max(longest, spent);
      total += spent;
    }
    const shownAt = performance.now();
    aheadGarden.setVisible(true);
    const shown = performance.now() - shownAt;
    console.log(`  built ahead in ${steps} steps, ${total.toFixed(0)} ms in all, the longest ${longest.toFixed(1)} ms; shown then in ${shown.toFixed(1)} ms`);
    const same = aheadGarden.meshes.every((mesh, index) => {
      const mine = mesh.geometry.attributes.position.array, theirs = garden.meshes[index].geometry.attributes.position.array;
      return mine.length === theirs.length && mine.every((value, at) => value === theirs[at]);
    });
    check(same, 'built ahead in steps, it is the same garden as one built at once, to the last corner');
    check(longest < SHARE_OF_BUILD.step * built, `no step of building it ahead over ${100 * SHARE_OF_BUILD.step}% of the build (the longest ${share(longest, built)})`);
    check(shown < SHARE_OF_BUILD.shown * built, `built ahead, it is shown in under ${100 * SHARE_OF_BUILD.shown}% of the build (${share(shown, built)})`);
  }
  {
    // On Low (setCoarse), its sky come before the build ahead is done (as on a phone): showing it builds what is left
    // and lets the fine garden go once the catch table is made; src/main.js's slices go on asking while the place's
    // request stands, and must not build the fine garden again (to be kept, never drawn).
    const low = await import('../src/koiGarden.js?low');
    const lowGarden = low.createKoiGarden({ envTexture: null, mirrorLayer: 2, lighting, ownSky: () => true });
    lowGarden.setCoarse(true);
    for (let step = 0; step < 20; step++) lowGarden.prepareSome(0);
    lowGarden.setVisible(true);
    const after = performance.now();
    const doneAtOnce = lowGarden.prepareSome(0);
    const spent = performance.now() - after;
    check(doneAtOnce, `on Low, shown before it was built ahead, building ahead stops at once (${spent.toFixed(1)} ms), so the fine garden it let go is not built again`);
  }
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
  check(declared.includes('uShoreKind') && missing.length === 0, `the water seen from below shares every uniform of the shore's twin (${declared.join(', ')})${missing.length ? `; not ${missing.join(', ')}` : ''}`);
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
