// The Reflecting Pool's walls and ground (src/places.js PLACES `mall`): the
// Lincoln Memorial Reflecting Pool in Washington, D.C., seen from its west
// wall, looking east down its length to the Washington Monument.
//
// The pool is src/pondFloor.js's MALL_POOL: 618 m by 50.6 m inside its granite
// walls, its bed the 2012 rebuild's concrete coated in a navy polyurea in 2026
// (MALL_BED in src/shaders/scene.js, under 60 to 88 cm of water), the eye at
// its west wall.
// The scene's −z is east, +x south. Everything standing beyond the coping
// is the sky's backdrop (src/sky.js `mall`, matte-painted by
// tools/mall-backdrop.py): the elms, planted from photographs of single elms,
// the Monument and the Lincoln Memorial behind the eye, cut from photographs
// of them.
//
// Here, two meshes of one program (MALL_GROUND_VERTEX and
// MALL_GROUND_FRAGMENT):
//   - the ground (groundGeometry): a plane at the coping's height, with a
//     hole the pool's size, out to OUTER_HALF_SIZE; its cells finest by the
//     walls (GROUND_EDGES) so the coping's joints hold still. Per pixel: the
//     coping's granite, the walks beside the pool, the west plaza's pavers
//     and the lawn, out to the horizon, where the sky's elms stand on it;
//   - the walls' faces (wallGeometry), from WALL_FROM under the still water
//     (below any ripple) to the coping, facing in.
// Each is drawn twice: in the main scene, and on the mirror's layer with its
// distance in alpha (MIRROR_NEARNESS), the walls from the water up, so the
// pool reflects them as near as they are. The water itself stops at the walls
// (src/waterSurface.js setBounds, BOUNDS here).
//
// Nothing thrown comes down out of the pool: a throw's aim stays inside the
// solver's patch, ahead of the west wall and 22 m from either side. What
// reaches a wall in the water or in the air below its top comes back off it,
// and what clears it lies on the coping (MALL_BASIN, held as the Pool's basin
// is: src/pool.js holdInPool, poolGround).
import * as THREE from 'three';
import { MALL_GROUND_VERTEX, MALL_GROUND_FRAGMENT } from './shaders/scene.js';
import { MALL_POOL } from './pondFloor.js';
import { OUTER_HALF_SIZE } from './waterSurface.js';
import { MIRROR_LAYER } from './splash.js';

const HALF = MALL_POOL.halfWidth;
const WEST = MALL_POOL.west;
const EAST = MALL_POOL.west - MALL_POOL.length;
const COPING_TOP = MALL_POOL.coping;
const WALL_FROM = -0.1;   // m: the walls' faces reach this far under the still water

/** The pool inside its walls, as src/pool.js holds things in a basin: its corner, its sides and its walls' top (m). */
export const MALL_BASIN = Object.freeze({ minX: -HALF, minZ: EAST, sizeX: 2 * HALF, sizeZ: MALL_POOL.length, deck: COPING_TOP });
/** The water's rectangle (src/waterSurface.js setBounds): the walls' faces. */
export const MALL_BOUNDS = Object.freeze({ minX: -HALF, minZ: EAST, maxX: HALF, maxZ: WEST });

// The ground's cell edges out from a wall's face (m): the coping, the walk, then growing to the horizon.
const GROUND_EDGES = [0, 0.75, 6.25, 15, 40, 120, 400, 1500, OUTER_HALF_SIZE];

/** The ground's mesh (the header): a grid of rows and columns at the walls and out, its cells over the pool left out. */
function groundGeometry() {
  const xs = [...GROUND_EDGES.slice(1).reverse().map((out) => -HALF - out), -HALF, HALF, ...GROUND_EDGES.slice(1).map((out) => HALF + out)];
  const zs = [...GROUND_EDGES.slice(1).reverse().map((out) => EAST - out), EAST, WEST, ...GROUND_EDGES.slice(1).map((out) => WEST + out)];
  const positions = [], normals = [], indices = [];
  for (const z of zs) {
    for (const x of xs) {
      positions.push(x, COPING_TOP, z);
      normals.push(0, 1, 0);
    }
  }
  for (let row = 0; row < zs.length - 1; row++) {
    for (let column = 0; column < xs.length - 1; column++) {
      const middleX = (xs[column] + xs[column + 1]) / 2, middleZ = (zs[row] + zs[row + 1]) / 2;
      if (Math.abs(middleX) < HALF && middleZ > EAST && middleZ < WEST) continue;   // over the pool
      const corner = row * xs.length + column, next = corner + xs.length;
      indices.push(corner, next, corner + 1, corner + 1, next, next + 1);   // facing up
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** The walls' faces from `bottom` to the coping, facing into the pool: the long sides in stretches of `stretch` (m). */
function wallGeometry(bottom, stretch = 20) {
  const positions = [], normals = [], indices = [];
  const addWall = (from, to, normal) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const pieces = Math.max(1, Math.round(length / stretch));
    const first = positions.length / 3;
    for (let piece = 0; piece <= pieces; piece++) {
      const share = piece / pieces;
      const x = from[0] + (to[0] - from[0]) * share, z = from[1] + (to[1] - from[1]) * share;
      positions.push(x, COPING_TOP, z, x, bottom, z);
      normals.push(...normal, ...normal);
    }
    for (let piece = 0; piece < pieces; piece++) {
      const top = first + 2 * piece;
      indices.push(top, top + 1, top + 2, top + 2, top + 1, top + 3);
    }
  };
  addWall([-HALF, WEST], [-HALF, EAST], [1, 0, 0]);
  addWall([HALF, EAST], [HALF, WEST], [-1, 0, 0]);
  addWall([HALF, WEST], [-HALF, WEST], [0, 0, -1]);
  addWall([-HALF, EAST], [HALF, EAST], [0, 0, 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The Reflecting Pool's meshes (the header), hidden until setVisible: the ground and the walls in the main scene, and
 * their mirror images on the mirror's layer only. Their uniforms share the lighting's objects, so they follow a change
 * of sky or weather; `wet` and `snow` are the weather's, shared uniform objects.
 */
export function createMallPool(lighting, { haze = null, wet = { value: 0 }, snow = { value: 0 } } = {}) {
  const material = new THREE.ShaderMaterial({
    vertexShader: MALL_GROUND_VERTEX,
    fragmentShader: MALL_GROUND_FRAGMENT,
    uniforms: {
      uSunDir: { value: lighting.sunDirection },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uWet: wet,
      uSnow: snow,
      ...(haze ?? { uHazeColor: { value: new THREE.Vector3() }, uHazeDensity: { value: 0 } }),
    },
    side: THREE.DoubleSide,   // the mirror's camera sees them turned over
  });
  // The mirror's: the same uniforms, with the distance in alpha (the header).
  const mirrorMaterial = new THREE.ShaderMaterial({
    vertexShader: material.vertexShader,
    fragmentShader: material.fragmentShader,
    uniforms: material.uniforms,
    defines: { MIRROR_NEARNESS: 1 },
    side: THREE.DoubleSide,
  });
  const mesh = (geometry, chosen, mirrored) => {
    const made = new THREE.Mesh(geometry, chosen);
    made.frustumCulled = false;
    made.visible = false;
    if (mirrored) made.layers.set(MIRROR_LAYER);
    return made;
  };
  const ground = groundGeometry();
  const meshes = [
    mesh(ground, material, false),
    mesh(wallGeometry(WALL_FROM), material, false),
    mesh(ground, mirrorMaterial, true),
    mesh(wallGeometry(0), mirrorMaterial, true),
  ];
  return {
    meshes,
    /** Show the meshes, or hide them. */
    setVisible(visible) {
      for (const object of meshes) object.visible = visible;
    },
  };
}
