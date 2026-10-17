// The pool: the Pool water (src/main.js), a tiled basin with a deck round it,
// in place of the lake's bed, beach and open water.
//
// The basin is the solver's pool (src/spectralWater.js setPool): the middle
// quarter of its patch, 3 m square, whose walls reflect the waves. Its floor
// lies POOL.depth under the still water, and its walls rise from it to the
// deck, POOL.deck above the water, all tiled (POOL_TILES in
// src/shaders/scene.js: pale tiles with a band of deep blue ones at the
// waterline). It is three meshes of one material (POOL_VERTEX and
// POOL_FRAGMENT): the whole basin in the under-water pass, which the water
// shows through the surface, drawn where the still surface shows it (the
// floor looks shallower than it is and the tiles break at the waterline, as
// in a real pool), lit through the water with the caustics the ripples focus
// on the floor and the walls and the shadow the sunward wall casts; the
// walls' top, from just under the water to the deck, in the main scene,
// where they stand out of the water; and that top above the water alone on
// the mirror's layer, which the water reflects (the main scene's would put
// the walls' under-water part in the mirror image), its distance in the
// mirror image's alpha (MIRROR_NEARNESS), so the water reflects it as near
// as it is. Each is a grid of
// BASIN_CELL squares, fine enough that straight lines bent by the still
// surface stay smooth.
//
// The yard is the deck's level out to the horizon (DECK_VERTEX and
// DECK_FRAGMENT): square rings about the pool, as the water's outer sheet
// is (src/waterSurface.js), from the pool's edge out to OUTER_HALF_SIZE: a
// stone coping, pavers, then a lawn running into the sky photo's own land.
// It is in the main scene, and a second mesh of it, with its distance, on
// the mirror's layer alone.
//
// The stones and their holes take the pool's floor, POOL.depth, as their
// bed, and its walls hold a stone under the water inside them (holdInPool);
// a skipping stone that meets a wall below its top comes back off it, and
// one skipped out over the deck lands on it as a stone lands on paving
// (DECK, holdSkipping): it bounces low, tumbling, and tumbles to a stop
// within a few metres. The eye keeps over the deck (src/main.js).
import * as THREE from 'three';
import { POOL_VERTEX, POOL_FRAGMENT, DECK_VERTEX, DECK_FRAGMENT } from './shaders/scene.js';
import { squareRingsGeometry, OUTER_HALF_SIZE } from './waterSurface.js';
import { MIRROR_LAYER } from './splash.js';

export const POOL = {
  depth: 1.4,       // m: the floor under the still water
  deck: 0.1,        // m: the deck over it, the walls' top
  tileAlbedo: 0.8,  // the tiles' mean albedo, grout included (POOL_TILES), for what the splash's drops show of the floor
};
const BASIN_CELL = 0.075;      // m: the basin's mesh spacing
const MAIN_WALL_FROM = -0.1;   // m: the walls the main scene draws reach this far under the water, below any trough
const WALL_KEPT = 0.4;         // a skipping stone comes back off a wall with this share of its speed across it
const DECK = {
  bounce: [0.25, 0.45],        // a stone landing on the paving comes off it at this share of the speed it came down at (stone on stone; its lumps strike unevenly)...
  friction: 0.6,               // ...the paving's friction taking this times the push off it from its speed along it (Coulomb)...
  scatter: 0.05,               // ...its path turned by up to this (radians) by the lump that strikes...
  settle: 0.4,                 // m/s: ...until it comes down slower than this; then it tumbles along...
  tumbling: 0.9,               // ...slowing at this times g...
  stopped: 0.05,               // m/s: ...and rests once slower than this
  tumble: 0.5,                 // it turns end over end at this times its speed over its radius (a flat stone skids as it tumbles)...
  tumbleMost: 60,              // ...at most this (rad/s)
};
const GRAVITY = 9.81;

/**
 * A stone under the water (src/rock.js) held inside the pool's walls (the
 * square, water.poolSquare): the wall it meets stops it, and it slides on
 * down. In the air it may cross the deck: the aim keeps its landing in the
 * pool. A skip stone, until it goes in, is held as holdSkipping says
 * (`dt`, the step just taken, for its slide on the deck).
 */
export function holdInPool(rock, square, dt = 1 / 240) {
  if (rock.skip && rock.state !== 'water' && rock.state !== 'rest') { holdSkipping(rock, square, dt); return; }
  // A skip stone goes in moving fast along the water, its centre still above it: the walls hold it from then on.
  if (rock.position.y > 0 && !(rock.skip && rock.state === 'water')) return;
  for (const [axis, low] of [['x', square.minX], ['z', square.minZ]]) {
    const lowest = low + rock.radius, highest = low + square.size - rock.radius;
    if (rock.position[axis] < lowest) { rock.position[axis] = lowest; rock.velocity[axis] = Math.max(rock.velocity[axis], 0); }
    else if (rock.position[axis] > highest) { rock.position[axis] = highest; rock.velocity[axis] = Math.min(rock.velocity[axis], 0); }
  }
}

/**
 * A skip stone off the water after its first touch (its throw's flight in
 * crosses the deck freely, and while it skims it follows its contact's
 * path): its centre within a radius of a wall, lower than the wall's top, it
 * comes back off it with WALL_KEPT of its speed across it, if it was inside
 * the step before; else it has come down on the deck, which is paving, not
 * water. There it bounces off at DECK.bounce of the speed it came down at,
 * the friction taking DECK.friction times the push off the paving from its
 * speed along it and the lump that strikes turning its path by up to
 * DECK.scatter, and tumbles end over end (its spin turned about the level
 * axis across its path, at DECK.tumble of its speed over its radius), until
 * it comes down slower than DECK.settle; then it tumbles along on the
 * paving (`skip.onDeck`), its ellipsoid on it (ellipsoidDepth: the lumpy
 * mesh would lift it off the paving as it turns), slowing at DECK.tumbling·g
 * every step, and rests once slower than DECK.stopped.
 */
function holdSkipping(rock, square, dt) {
  if (rock.state !== 'air' || rock.skip.skips === 0) return;
  const outside = (point, axis, low) => point[axis] < low + rock.radius || point[axis] > low + square.size - rock.radius;
  const beyond = (point) => outside(point, 'x', square.minX) || outside(point, 'z', square.minZ);
  if (rock.skip.onDeck) { tumbleAlong(rock, dt); return; }
  if (!beyond(rock.position)) return;
  const lowest = rock.position.y - rock.ellipsoidDepth();
  if (lowest > POOL.deck) return;
  if (!beyond(rock.previous)) {
    for (const [axis, low] of [['x', square.minX], ['z', square.minZ]]) {
      if (!outside(rock.position, axis, low)) continue;
      rock.position[axis] = THREE.MathUtils.clamp(rock.position[axis], low + rock.radius, low + square.size - rock.radius);
      rock.velocity[axis] *= -WALL_KEPT;
    }
    return;
  }
  // On the paving: out of it, then a bounce, or it settles to tumble along.
  rock.position.y += POOL.deck - lowest;
  if (rock.velocity.y >= -DECK.settle) { rock.skip.onDeck = true; tumbleAlong(rock, dt); return; }
  const fall = -rock.velocity.y;
  const bounce = DECK.bounce[0] + (DECK.bounce[1] - DECK.bounce[0]) * Math.random();
  rock.velocity.y = bounce * fall;
  const along = Math.hypot(rock.velocity.x, rock.velocity.z);
  const kept = along > 1e-9 ? Math.max(along - DECK.friction * (1 + bounce) * fall, 0) / along : 0;
  const turn = DECK.scatter * (2 * Math.random() - 1);
  const x = rock.velocity.x * kept, z = rock.velocity.z * kept;
  rock.velocity.x = x * Math.cos(turn) - z * Math.sin(turn);
  rock.velocity.z = x * Math.sin(turn) + z * Math.cos(turn);
  tumbleEndOverEnd(rock);
  rock.syncMeshes();
}

/** Its spin about the level axis across its path, at DECK.tumble of its speed over its radius (at most DECK.tumbleMost). */
function tumbleEndOverEnd(rock) {
  const along = Math.hypot(rock.velocity.x, rock.velocity.z);
  if (along < 1e-6) return;
  rock.spinAxis.set(rock.velocity.z / along, 0, -rock.velocity.x / along);
  rock.spinRate = Math.min(DECK.tumble * along / rock.radius, DECK.tumbleMost);
}

/** Tumbling along the paving (holdSkipping): on it, slowing at DECK.tumbling·g, at rest once slower than DECK.stopped. */
function tumbleAlong(rock, dt) {
  rock.velocity.y = 0;
  rock.position.y = POOL.deck + rock.ellipsoidDepth();
  const along = Math.hypot(rock.velocity.x, rock.velocity.z);
  const slowed = Math.max(along - DECK.tumbling * GRAVITY * dt, 0);
  if (slowed < DECK.stopped) { rock.restOn(POOL.deck); return; }
  rock.velocity.x *= slowed / along;
  rock.velocity.z *= slowed / along;
  tumbleEndOverEnd(rock);
  rock.syncMeshes();
}

/**
 * A grid of quads from `origin` (an array of three) `across` and `down`
 * (each an array of three, the sides' full length), cut into squares of
 * about BASIN_CELL, facing across × down, appended to `parts`.
 */
function addGrid(parts, origin, across, down, normal) {
  const columns = Math.max(1, Math.round(Math.hypot(...across) / BASIN_CELL));
  const rows = Math.max(1, Math.round(Math.hypot(...down) / BASIN_CELL));
  const first = parts.positions.length / 3;
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      for (let axis = 0; axis < 3; axis++) parts.positions.push(origin[axis] + across[axis] * column / columns + down[axis] * row / rows);
      parts.normals.push(...normal);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const corner = first + row * (columns + 1) + column, below = corner + columns + 1;
      parts.indices.push(corner, corner + 1, below, corner + 1, below + 1, below);
    }
  }
}

/** The basin's walls from `bottom` to `top` (m), facing into the pool, and its floor at `bottom` if `withFloor`. */
function basinGeometry(pool, bottom, top, withFloor) {
  const parts = { positions: [], normals: [], indices: [] };
  const low = [pool.minX, pool.minZ], high = [pool.minX + pool.size, pool.minZ + pool.size], side = pool.size, height = top - bottom;
  const down = [0, -height, 0];
  addGrid(parts, [low[0], top, low[1]], [0, 0, side], down, [1, 0, 0]);
  addGrid(parts, [high[0], top, high[1]], [0, 0, -side], down, [-1, 0, 0]);
  addGrid(parts, [high[0], top, low[1]], [-side, 0, 0], down, [0, 0, 1]);
  addGrid(parts, [low[0], top, high[1]], [side, 0, 0], down, [0, 0, -1]);
  if (withFloor) addGrid(parts, [low[0], bottom, low[1]], [0, 0, side], [side, 0, 0], [0, 1, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(parts.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(parts.normals, 3));
  geometry.setIndex(parts.indices);
  return geometry;
}

/**
 * The pool's meshes for the solver's pool (water.pool, set by setPool): the
 * basin (the under-water pass), the walls and the yard (the main scene),
 * and the walls' and the yard's mirror images (the main scene, on the
 * mirror's layer only). The caller adds them to its
 * scenes and shows them while the water is the pool's. Their uniforms share
 * the lighting's objects, the solver's grid sizes and the sky's cube, so
 * they follow a change of sky, water or quality.
 */
export function createPool(water, lighting, ambientWaves, environment, { rings = null, haze = null, wet = { value: 0 } } = {}) {
  const pool = water.poolSquare;
  const poolUniform = { value: new THREE.Vector4(pool.minX, pool.minZ, pool.size, POOL.depth) };
  const basinMaterial = new THREE.ShaderMaterial({
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT,
    uniforms: {
      uHeight: { value: water.heightTexture },
      uSunDir: { value: lighting.sunDirection },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uAbsorb: { value: lighting.absorb },
      uExtinction: { value: lighting.extinction },
      uWaterColor: { value: lighting.waterColor },
      uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
      uDomainSize: { value: water.domainSize },
      uTexelOffset: water.gridUniforms.uTexelOffset,
      uN: water.gridUniforms.uN,
      uCell: water.gridUniforms.uCell,
      uPool: poolUniform,
      uDeck: { value: POOL.deck },
      ...ambientWaves.uniforms(),
      ...(rings ? rings.uniforms() : {}),
    },
  });
  const deckMaterial = new THREE.ShaderMaterial({
    vertexShader: DECK_VERTEX,
    fragmentShader: DECK_FRAGMENT,
    uniforms: {
      uSunDir: { value: lighting.sunDirection },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uSkyCube: { value: environment.cubeTexture },
      uPool: poolUniform,
      uWet: wet,
      ...(haze ?? { uHazeColor: { value: new THREE.Vector3() }, uHazeDensity: { value: 0 } }),
    },
  });
  // The mirror's: the same uniforms, with the distance in alpha (the header).
  const inMirror = (material) => new THREE.ShaderMaterial({
    vertexShader: material.vertexShader,
    fragmentShader: material.fragmentShader,
    uniforms: material.uniforms,
    defines: { MIRROR_NEARNESS: 1 },
  });
  const mesh = (geometry, material) => {
    const made = new THREE.Mesh(geometry, material);
    made.frustumCulled = false;
    return made;
  };
  const basin = mesh(basinGeometry(pool, -POOL.depth, POOL.deck, true), basinMaterial);
  const walls = mesh(basinGeometry(pool, MAIN_WALL_FROM, POOL.deck, false), basinMaterial);
  const mirrorWalls = mesh(basinGeometry(pool, 0, POOL.deck, false), inMirror(basinMaterial));
  mirrorWalls.layers.set(MIRROR_LAYER);
  const yard = mesh(squareRingsGeometry(pool.size / 2, OUTER_HALF_SIZE, water.centre, POOL.deck), deckMaterial);
  const mirrorYard = mesh(yard.geometry, inMirror(deckMaterial));
  mirrorYard.layers.set(MIRROR_LAYER);
  return {
    square: pool,
    basin,
    walls,
    mirrorWalls,
    yard,
    mirrorYard,
    /** Show the pool's meshes, or hide them. */
    setVisible(visible) {
      for (const object of [basin, walls, mirrorWalls, yard, mirrorYard]) object.visible = visible;
    },
  };
}
