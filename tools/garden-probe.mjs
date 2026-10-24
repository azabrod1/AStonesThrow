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
// - the cost: the garden's build and its triangles.
import * as THREE from 'three';
import { Rock } from '../src/rock.js';
import { THINGS, THING_NAMES } from '../src/things.js';
import { setShoreKind, koiFloorDepthAt, koiShoreDistance, koiShoreRadius, KOI_SHORE } from '../src/pondFloor.js';
import { koiGround, holdInGarden, keepInPond, plantingFront, createKoiGarden, KOI_AIM, GARDEN } from '../src/koiGarden.js';
import { collideThings } from '../src/collide.js';

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
  const garden = createKoiGarden({ envTexture: null, mirrorLayer: 2, lighting: {} });
  garden.setVisible(true);
  const built = performance.now() - started;
  const triangles = garden.meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0) / 2;
  console.log(`  built in ${built.toFixed(0)} ms, ${(triangles / 1000).toFixed(0)}k triangles (drawn twice: the scene and the mirror)`);
  check(triangles < 300000, `under 300k triangles (${(triangles / 1000).toFixed(0)}k)`);
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

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
