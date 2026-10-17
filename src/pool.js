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
// bed, and its walls hold a stone under the water, or afloat, inside them
// (holdInPool): a wall turns it back. Anything in the air that meets a
// wall's side below its top, coming from inside (a skipping stone, a
// floater bobbed clear), comes back off it (holdAirborne). The deck is ground to
// whatever comes down on it (poolGround: src/rock.js bounces it, and
// tumbles or rolls it along, as on paving), and the walls, less a skip
// stone's radius, bound where it may touch the water (poolInside). The eye
// keeps over the deck (src/main.js).
//
// The splash's drops that land on the deck wet it (wetSpot, from
// src/splash.js setGround): a map of how wet, WET_MAP, over the pool and
// round it, which the drops soak, the more the wetter, and which dries a
// little every WET_MAP.step, its thin edges first; the deck's shader
// darkens the stone and the grass by it.
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
// The deck's wetness map (wetSpot): it reaches WET_MAP.reach (m) past the walls in cells of WET_MAP.cell (m); a
// drop adds up to `soak` of full wetness, which dries away over `dry` seconds (thin edges first), and the map
// is dried and uploaded every `step` seconds.
const WET_MAP = { reach: 1.5, cell: 0.015, soak: 0.55, dry: 40, step: 0.25 };
const MAIN_WALL_FROM = -0.1;   // m: the walls the main scene draws reach this far under the water, below any trough
const WALL_KEPT = 0.4;         // a skipping stone comes back off a wall with this share of its speed across it
const WALL_WATER = 0.8;        // a thing in the water comes back off a wall at its own bounce times this (holdInPool)

/**
 * A thing under the water or afloat (src/rock.js) held inside the pool's
 * walls (the square, water.poolSquare): the wall it meets turns it back, at
 * its own bounce (Rock.collisionBounce) times WALL_WATER (the water between
 * it and the tiles takes some), and it carries on along the wall; under the
 * water its path (sinkStep's body) with it (Rock.knock). In the air the
 * walls' sides turn it back if it comes at them from inside, below their
 * top (holdAirborne); above it, it crosses onto the deck, which is ground
 * (poolGround). A skipping stone follows its contact's path; it goes in
 * moving fast along the water, its centre still above it, and the walls
 * hold it from then on, as they hold a skipped pumice once it floats.
 * Returns how hard it
 * was turned back (its change of speed, m/s, and the wall's normal, into the
 * pool), or null: src/main.js runs it with the things' meetings
 * (src/collide.js), so a ball off a wall into another passes the knock on in
 * the same step, and a floater turned back hard rings the water.
 */
export function holdInPool(rock, square) {
  // In the air (any thing: a thrown one, a floater bobbed clear, a skip between touches) the walls' sides turn it back.
  if (rock.state === 'air') { holdAirborne(rock, square); return null; }
  if (rock.skip && rock.state === 'skim') return null;
  const afloat = rock.state === 'float' || rock.afloat;
  if (rock.position.y > 0 && !afloat && !(rock.skip && rock.state === 'water')) return null;
  if (rock.state === 'air' || rock.state === 'ground' || (rock.state === 'rest' && !afloat)) return null;
  let held = null;
  for (const [axis, low] of [['x', square.minX], ['z', square.minZ]]) {
    const lowest = low + rock.radius, highest = low + square.size - rock.radius;
    const side = rock.position[axis] < lowest ? 1 : rock.position[axis] > highest ? -1 : 0;   // the wall's normal, into the pool
    if (side === 0) continue;
    const into = -side * rock.velocity[axis];   // its speed into the wall
    const change = into > 0 ? (1 + rock.collisionBounce * WALL_WATER) * into : 0;
    const moved = (side > 0 ? lowest : highest) - rock.position[axis];
    const velocity = [0, 0, 0], offset = [0, 0, 0];
    velocity[axis === 'x' ? 0 : 2] = side * change;
    offset[axis === 'x' ? 0 : 2] = moved;
    rock.knock(...velocity, ...offset);
    if (!held || change > held.change) held = { change, normalX: axis === 'x' ? side : 0, normalZ: axis === 'z' ? side : 0 };
  }
  return held;
}

/**
 * A thing in the air (a skip stone between touches, a floater bobbed clear,
 * a thing knocked up off the water; a skip stone skimming follows its
 * contact's path, and on the deck src/rock.js moves things): its centre past
 * a wall less its radius, its bottom lower than the wall's top, having been
 * inside the step before, it has met the wall's side, and comes back off it,
 * a skip stone with WALL_KEPT of its speed across it, anything else at its
 * own bounce (Rock.collisionBounce). One that clears the wall's top passes
 * over it, onto the deck. (A throw's first flight starts over the deck,
 * never inside.)
 */
function holdAirborne(rock, square) {
  const outside = (point, axis, low) => point[axis] < low + rock.radius || point[axis] > low + square.size - rock.radius;
  const beyond = (point) => outside(point, 'x', square.minX) || outside(point, 'z', square.minZ);
  if (!beyond(rock.position) || beyond(rock.previous) || rock.position.y - rock.ellipsoidDepth() > POOL.deck) return;
  for (const [axis, low] of [['x', square.minX], ['z', square.minZ]]) {
    if (!outside(rock.position, axis, low)) continue;
    rock.position[axis] = THREE.MathUtils.clamp(rock.position[axis], low + rock.radius, low + square.size - rock.radius);
    rock.velocity[axis] *= -(rock.skip ? WALL_KEPT : rock.collisionBounce);
  }
}

/** The ground round the pool (src/rock.js groundAt): the deck's height outside the walls, null over the water inside them. */
export function poolGround(square) {
  return (x, z) => (x >= square.minX && x <= square.minX + square.size && z >= square.minZ && z <= square.minZ + square.size ? null : POOL.deck);
}

/** Whether (x, z) lies inside the pool's walls less `margin` (a skip stone's radius: where it may touch the water; the aim's margin). */
export function poolInside(square, margin) {
  return (x, z) => x >= square.minX + margin && x <= square.minX + square.size - margin && z >= square.minZ + margin && z <= square.minZ + square.size - margin;
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
  // Where the splash's drops came down on the deck (wetSpot): a map over the pool and WET_MAP.reach round it.
  const wetSpan = pool.size + 2 * WET_MAP.reach;
  const wetSide = Math.round(wetSpan / WET_MAP.cell);
  const wetness = new Float32Array(wetSide * wetSide);
  const wetBytes = new Uint8Array(wetSide * wetSide);
  const wetMap = new THREE.DataTexture(wetBytes, wetSide, wetSide, THREE.RedFormat, THREE.UnsignedByteType);
  wetMap.magFilter = wetMap.minFilter = THREE.LinearFilter;
  wetMap.needsUpdate = true;
  const wetArea = { value: new THREE.Vector3(pool.minX - WET_MAP.reach, pool.minZ - WET_MAP.reach, wetSpan) };
  let wetAny = false, wetClock = null, wetDue = 0;
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
      uWetMap: { value: wetMap },
      uWetArea: wetArea,
      ...(haze ?? { uHazeColor: { value: new THREE.Vector3() }, uHazeDensity: { value: 0 } }),
    },
  });
  // The mirror's: the same uniforms, with the distance in alpha (the header).
  const inMirror = (material) => new THREE.ShaderMaterial({
    vertexShader: material.vertexShader,
    fragmentShader: material.fragmentShader,
    uniforms: material.uniforms,
    defines: { ...material.defines, MIRROR_NEARNESS: 1 },
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
    /** A drop landed on the deck at (x, z), wetting a spot `radius` (m) across (src/splash.js setGround): more drops, wetter. */
    wetSpot(x, z, radius) {
      const first = (value) => Math.max(Math.floor(value), 0), last = (value) => Math.min(Math.ceil(value), wetSide - 1);
      const column = (x - wetArea.value.x) / WET_MAP.cell - 0.5, row = (z - wetArea.value.y) / WET_MAP.cell - 0.5;
      const reach = radius / WET_MAP.cell + 1;
      for (let at = first(row - reach); at <= last(row + reach); at++) {
        for (let across = first(column - reach); across <= last(column + reach); across++) {
          const share = 1 - THREE.MathUtils.smoothstep(Math.hypot(across - column, at - row) * WET_MAP.cell, 0.5 * radius, radius);
          if (share <= 0) continue;
          const cell = at * wetSide + across;
          wetness[cell] = Math.min(wetness[cell] + WET_MAP.soak * share, 1);
          wetBytes[cell] = Math.round(wetness[cell] * 255);
          wetAny = wetMap.needsUpdate = true;
        }
      }
    },
    /** The simulation's time (s): every WET_MAP.step the deck dries a little, and what changed is uploaded. */
    setTime(time) {
      if (wetClock === null || time < wetClock) wetClock = time;
      wetDue += time - wetClock;
      wetClock = time;
      if (wetDue < WET_MAP.step || !wetAny) { if (!wetAny) wetDue = 0; return; }
      const drying = wetDue / WET_MAP.dry;
      wetDue = 0;
      wetAny = false;
      for (let cell = 0; cell < wetness.length; cell++) {
        if (wetness[cell] <= 0) continue;
        wetness[cell] = Math.max(wetness[cell] - drying, 0);
        wetBytes[cell] = Math.round(wetness[cell] * 255);
        if (wetness[cell] > 0) wetAny = true;
      }
      wetMap.needsUpdate = true;
    },
    /** Dry the deck at once (a new pond). */
    dry() {
      wetness.fill(0);
      wetBytes.fill(0);
      wetAny = false;
      wetMap.needsUpdate = true;
    },
    /** Show the pool's meshes, or hide them. */
    setVisible(visible) {
      for (const object of [basin, walls, mirrorWalls, yard, mirrorYard]) object.visible = visible;
    },
  };
}
