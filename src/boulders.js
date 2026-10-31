// Boulders at the water's edge: granite stones standing half out of the
// water in the shallows of a place with a rocky shore (BOULDERS by its sky's
// name: the sea cove, whose photo is granite boulders to the water). They
// are the cove's foreground as the reeds (src/reeds.js) are a fresh lake's,
// but kept out of the way: along the waterline on either side of the throw's
// line, outside the home frame, in view as the eye turns, one mostly under
// the water. Scenery, with one piece of physics: a thing thrown into one
// comes back off it (contain, run with the things' meetings, src/collide.js,
// as the pool's walls are), so nothing passes through a stone.
//
// Each is a granite stone's own mesh (createRockGeometry with the granite
// look of src/things.js, so it has a thrown granite's lumps, grain and
// flecks, src/shaders/stone.js; the grain is reckoned in a stone's radii,
// so here it is scaled by the boulder's radius over a thrown stone's,
// GRAIN_STONE, and its flecks stay granite's few millimetres), in a weathered
// grey of its own (GREY, the photo's rocks' rather than a fresh-broken
// granite's pink), scaled to its radius and set into the bed
// (floorDepthAt) half a radius deep. Its shape and colour draw from a stream
// of its own (seededRandom), never Math.random, so it is the same every
// visit; it is built at start-up, before any seeded throw, so it shifts no
// throw's draws. Three meshes draw it, as a stone's do (src/rock.js):
// `above`, in the main scene, clipped to y ≥ 0; `below`, in the under-water
// pass, clipped to y ≤ 0, drawn where the still surface shows it
// (SEEN_THROUGH_WATER) and fading into the water seen from under it; and its
// mirror image on the water's mirror layer, its distance in alpha
// (MIRROR_NEARNESS_SCALE), so the water reflects it as it reflects a
// floater. Each is three.js's standard material with the stone's grain
// (stoneDetail): three programs of their own, built under the loading veil
// (src/main.js warmUp shows them whatever the place). Under a gale they
// stand as they are and the waves wash over them, as a shore's boulders do.
import * as THREE from 'three';
import { createRockGeometry } from './thingMeshes.js';
import { THINGS } from './things.js';
import { floorDepthAt } from './pondFloor.js';
import { stoneDetail, stoneUniforms } from './shaders/stone.js';
import { SEEN_THROUGH_WATER } from './shaders/scene.js';
import { seededRandom } from './spray.js';
import { withRandom } from './withRandom.js';

/** Each sky's boulders: where (x, z), the stone's radius (m) and its own seed. */
export const BOULDERS = {
  cove: [
    { x: -2.2, z: 1.9, radius: 0.45, seed: 11 },    // left of the throw's line, by the shore
    { x: -1.6, z: 2.35, radius: 0.3, seed: 12 },    // and nearer the eye, smaller
    { x: -2.8, z: 1.3, radius: 0.5, seed: 13 },     // farther out: mostly under the water
    { x: 2.4, z: 1.6, radius: 0.55, seed: 14 },     // right, the largest
    { x: 3.0, z: 2.2, radius: 0.35, seed: 15 },
  ],
};
const SIT = 0.5;                     // a boulder's centre stands this many radii above the bed
const GRAIN_STONE = 0.06;            // m: the thrown stone's radius the granite grain is drawn for (src/shaders/stone.js)
const GREY = { hue: [0.08, 0.04], saturation: [0.03, 0.04], lightness: [0.36, 0.08] };   // weathered granite: HSL, least and spread
const COLLISION_RADIUS = 0.85;       // its sphere for things meeting it, in radii (a granite's lumps lie within)
const BOUNCE_WATER = 0.6;            // a thing's bounce off it, wet, as a share of its own (src/pool.js WALL_WATER's idea)
const REFLECTION_BELOW = 0.35;       // the environment's share on the part under the water (as a stone's, src/rock.js)
const MIRROR_NEARNESS_SCALE = 4;     // the mirror image's alpha is 1 − this / distance (MIRROR_COMMON in src/shaders/scene.js)

/**
 * What scenery drawn three ways (the boulders; whatever is out on Loch Ness,
 * src/lochVisitor.js) patches into three.js's standard shader by `side`:
 * `below`, drawn where the still surface shows it (SEEN_THROUGH_WATER) and,
 * seen from under the water, fading into it (`waterFog`: its extinction and
 * colour); `mirror`, its distance in alpha, as the water's mirror lookups
 * read it; `above`, nothing. Call it last in onBeforeCompile.
 */
export function sceneryShader(shader, side, waterFog) {
  if (side === 'below') {
    shader.uniforms.uFogExtinction = { value: waterFog.extinction };
    shader.uniforms.uFogColor = { value: waterFog.color };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SEEN_THROUGH_WATER}`)
      .replace('#include <project_vertex>', `vec4 sceneryWorld = modelMatrix * vec4(transformed, 1.0);
  vec4 mvPosition = viewMatrix * vec4(seenThroughWater(sceneryWorld.xyz, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFogExtinction;\nuniform vec3 uFogColor;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));`);
  }
  if (side === 'mirror') {
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.a = 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05);`);
  }
}

/**
 * The boulders of every sky that has them, shown by `show(sky)`: `above`
 * and `mirror` for the main scene (the mirror's meshes are on `mirrorLayer`
 * alone), `below` for the under-water pass. setEnvironment gives them a new
 * sky's map; contain turns a thing back off them (src/collide.js `contain`).
 */
export class Boulders {
  constructor({ envTexture, waterFog, mirrorLayer }) {
    this.above = new THREE.Group();
    this.below = new THREE.Group();
    this.mirror = new THREE.Group();
    this.materials = [];
    this.stones = [];   // { sky, x, y, z, radius, meshes }
    this.shown = null;
    const look = THINGS.granite.look;
    for (const [sky, placed] of Object.entries(BOULDERS)) {
      for (const { x, z, radius, seed } of placed) {
        const geometry = this.build(seed, look);
        const stone = stoneUniforms(geometry.userData.stone);
        const stream = seededRandom(seed, 2);
        const color = new THREE.Color().setHSL(GREY.hue[0] + stream() * GREY.hue[1], GREY.saturation[0] + stream() * GREY.saturation[1], GREY.lightness[0] + stream() * GREY.lightness[1]);
        const turn = stream() * Math.PI * 2, tilt = (stream() - 0.5) * 0.5;
        const y = -floorDepthAt(x, z) + SIT * radius;
        const meshes = [];
        for (const side of ['above', 'below', 'mirror']) {
          const material = this.material(side, { color, look, envTexture, waterFog, stone, grain: radius / GRAIN_STONE });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(x, y, z);
          mesh.scale.setScalar(radius);
          mesh.rotation.set(tilt, turn, 0);
          mesh.frustumCulled = false;
          mesh.visible = false;
          if (side === 'mirror') mesh.layers.set(mirrorLayer);
          this[side].add(mesh);
          this.materials.push(material);
          meshes.push(mesh);
        }
        this.stones.push({ sky, x, y, z, radius, meshes });
      }
    }
  }

  /** A granite's mesh from its own stream: createRockGeometry's draws come from it while it builds, never Math.random. */
  build(seed, look) {
    return withRandom(seededRandom(seed, 1), () => createRockGeometry(seed, { look }));
  }

  material(side, { color, look, envTexture, waterFog, stone, grain }) {
    const made = new THREE.MeshStandardMaterial({
      color,
      vertexColors: true,
      roughness: look.roughness,
      metalness: 0,
      envMap: envTexture,
      envMapIntensity: side === 'below' ? REFLECTION_BELOW : look.reflection ?? 0.9,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, side === 'below' ? -1 : 1, 0), 0)],
    });
    made.onBeforeCompile = (shader) => {
      stoneDetail(shader, stone);
      // The grain at granite's own scale: a uniform, so every boulder shares the side's one program.
      shader.uniforms.uBoulderGrain = { value: grain };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uBoulderGrain;')
        .replace('vStonePoint = position;', 'vStonePoint = position * uBoulderGrain;');
      sceneryShader(shader, side, waterFog);   // below: seen through the water; mirror: its distance in alpha
    };
    made.customProgramCacheKey = () => `boulder-${side}`;
    return made;
  }

  /** Show the boulders of `sky` (a key of BOULDERS; null or another sky shows none); 'all' shows every one (the warm-up). */
  show(sky) {
    this.shown = sky;
    for (const stone of this.stones) for (const mesh of stone.meshes) mesh.visible = sky === 'all' || stone.sky === sky;
  }

  /** The sky's map (src/sky.js fills it in place once a sky has loaded; a new object comes with a new place). */
  setEnvironment(texture) {
    for (const material of this.materials) {
      if (material.envMap === texture) continue;
      material.envMap = texture;
      material.needsUpdate = true;
    }
  }

  /**
   * A thing in one of the shown boulders is moved out of it and comes back
   * off it (src/collide.js `contain`): how hard it was turned back (its
   * change of speed, m/s, and the stone's normal, level), or null.
   */
  contain(thing) {
    if (this.shown === null || thing.state === 'held') return null;
    let held = null;
    const at = thing.centre ?? thing.position;
    for (const stone of this.stones) {
      if (stone.sky !== this.shown) continue;
      const reach = stone.radius * COLLISION_RADIUS + thing.collisionRadius;
      const dx = at.x - stone.x, dy = at.y - stone.y, dz = at.z - stone.z;
      const apart = Math.hypot(dx, dy, dz);
      if (apart >= reach || apart < 1e-6) continue;
      const normalX = dx / apart, normalY = dy / apart, normalZ = dz / apart;
      const into = -(thing.velocity.x * normalX + thing.velocity.y * normalY + thing.velocity.z * normalZ);   // its speed into the stone
      const change = into > 0 ? (1 + thing.collisionBounce * BOUNCE_WATER) * into : 0;
      const moved = reach - apart;
      thing.knock(normalX * change, normalY * change, normalZ * change, normalX * moved, normalY * moved, normalZ * moved);
      const level = Math.hypot(normalX, normalZ) || 1;
      if (!held || change > held.change) held = { change, normalX: normalX / level, normalZ: normalZ / level };
    }
    return held;
  }
}
