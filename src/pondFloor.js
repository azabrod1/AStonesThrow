// The sandy lake bed, lit by sunlight focused through the rippling surface:
// the caustics come from the curvature of the splash's height field, of the
// ambient wind waves (src/ambientWaves.js) and of the rings (src/rings.js), so
// they drift with the ripples and a ring throws a ring of light on the sand.
//
// The bed (SHORE, floorDepthAt) deepens away from the shore, as a lake's
// does: the waterline runs just behind the shore view's eye, bending gently
// back on either side, and out from it the bed is 0.7 m deep under the
// bottom of the shore view, 1.7 m where the reference throw lands, 3.5 m far
// out. Its mesh is rings about the bank under the shore view's eye, sunk to
// it in the vertex shader, and every point of it is lit through its own
// depth of water: the sun down to it, the caustics' focusing and where on it
// they fall. So the sand is bright in the shallows and fades with depth, and
// a ring's light on the sand, under 1.7 m of water where the rocks land, is
// too dim and too far through the water to show, as in a real lake. The
// rocks and their holes come to rest on it (src/cavity.js sinkStep takes
// floorDepthAt). The waves take the solver's depth (0.8 m, src/main.js):
// under 2 m long, they run within 1% of their speed over 1.7 m.
//
// Behind the waterline the bed rises out of the water as a beach
// (createShore): a mesh of its own in the main scene and in the water's
// mirror image, the same sand lit by the sun and the sky, darker where it
// is wet just above the water. Farther off it gives way to the sky photo's
// own ground in its direction (LAND_FRAGMENT), so where the beach ends the
// photo carries on, and the camera, which turns about the pond (src/
// main.js), sees a shore behind it rather than water to the horizon.
//
// The caustics (FLOOR_FRAGMENT in src/shaders/scene.js). A floor point is lit
// by the sun refracted into the water, focused by the curvature of the
// surface it crossed: the Laplacian of all three heights, times the bed's depth there,
// times how far the refracted light moves on the floor per metre of depth and
// unit of slope (Snell's law: 1 − cos θi/(n·cos θt) for a slope across the
// sun's plane, sec²θt times that along it; their mean, 0.76 for this scene's
// sun 27° up, 0.25 for one overhead). For small slopes the irradiance is
// 1/(1 + that); where the rays come to a focus on the floor it peaks, as
// sharp as the sun's disc and the pixel allow, and past the focus it is the
// crossed rays' 1/|…|, so a ring's crests draw thin bright lines and its
// troughs darker bands; it is eased into 0.65 to 1.6 times the sun's own, so
// a steep ring never blows the sand out, nor draws on it a second set of
// rings as strong as the surface's own. Where on the floor: the floor is
// drawn on the straight line from the eye (the under-water pass, src/
// main.js), but the eye sees it through the still surface, nearer, so each
// pixel takes its caustics at the floor point it really shows, lit through
// the surface tan θt per metre of depth up-sun of it. A ring's caustic then
// lies tan θt times the depth down-sun of it on the sand (0.9 times it under
// the meadow's sun, 27° up) and shows on screen where the water's refraction
// puts it; before, the sun's shift taken as 0.75·tan θi
// and the floor's caustic on the straight line put it 240 pixels from there
// (1080p home view, the reference throw; each error about half of that).
//
// The floor's pattern (sand and pebbles: FLOOR_PATTERN in
// src/shaders/scene.js, six value noises) never changes, so the floor shader
// does not compute it: one GPU pass of the same code bakes it at start-up into
// an RGBA8 texture, and per pixel the floor fetches it and adds what moves,
// the caustics, and the light. The camera goes anywhere above the water
// (src/main.js), so the texture is laid out on the world: a tile
// PATTERN_TILE (2 m) on a side, its noises wrapping with it, repeated over
// the whole bed, PATTERN_TEXELS (1024) texels a side, so a texel is 2 mm,
// about a pixel on the bed at the bottom of the home view. The bed far off
// and seen at a slant takes the texture's mip chain, with anisotropic
// filtering (up to PATTERN_ANISOTROPY), so it neither shimmers as the ripples
// move it nor blurs along the view. The floor looks the tile up twice, the
// second time turned 37° and shifted, and takes one or the other in patches
// a few metres across, so the repeat does not show; the silt's broad drifts
// over it are the floor shader's own (FLOOR_FRAGMENT). The texture holds 4
// MiB, with its mip chain 5.3.
//
// The bake is one pass over the tile. Its program is freed after it; the
// texture lives as long as the floor's material (disposing the material
// frees it).
//
// The solver's grid sizes are its shared gridUniforms, so they follow a change
// of quality (src/main.js), and its height texture keeps its object through
// one: the floor, its material and the baked pattern are never rebuilt.
import * as THREE from 'three';
import { FLOOR_VERTEX, FLOOR_FRAGMENT, FLOOR_BAKE_FRAGMENT, LAND_VERTEX, LAND_FRAGMENT } from './shaders/scene.js';
import { FullscreenPass } from './gpu.js';

// The shore: the waterline runs along z = SHORE.z + x²/(2·SHORE.bend), 27 cm
// behind the shore view's eye (at z = 2.45, src/main.js) and bending back on
// either side. Out from it, by s (shoreDistance: the waterline's z there less
// the point's, nearly the distance from it), the bed is deep·tanh(slope·s/
// deep) deep: 0.12 m under the shore view's eye, 0.7 m at the bottom of its
// view, 1.7 m where the reference throw lands, 2.4 m at the far edge of the
// solver's patch, and levelling off at 3.5 m. Behind it, d = −s inland, the
// land: a sand beach rising as beachTop·tanh(beach·d/beachTop) (8 cm a metre
// at the water, levelling off 0.4 m up), and a grassy bank that adds
// bank·smoothstep(bankFrom, bankTo, d), 1.3 m more from 3 to 8 m inland,
// then level ground: so from an eye under 1.7 m the land behind the bank is
// hidden and the photo's own far land shows above it. The rocks and their
// holes rest on the bed (src/cavity.js sinkStep); LAKE_BED in
// src/shaders/scene.js is its GLSL twin, which sinks the floor's mesh and
// raises the land's.
export const SHORE = { z: 2.72, bend: 60, slope: 0.45, deep: 3.5, beach: 0.08, beachTop: 0.4, bank: 1.3, bankFrom: 3, bankTo: 8 };
/** How far out into the lake a world XZ point lies from the waterline (m; negative on the beach). */
export function shoreDistance(x, z) {
  return SHORE.z + (x * x) / (2 * SHORE.bend) - z;
}
const smoothstep = (low, high, value) => { const share = Math.min(Math.max((value - low) / (high - low), 0), 1); return share * share * (3 - 2 * share); };
/** The land's height (m) d metres inland of the waterline. */
export function landHeight(inland) {
  return SHORE.beachTop * Math.tanh(SHORE.beach * inland / SHORE.beachTop) + SHORE.bank * smoothstep(SHORE.bankFrom, SHORE.bankTo, inland);
}
/** The lake bed's depth (m) under a world XZ point: positive in the lake, negative (the land's height) on land. */
export function floorDepthAt(x, z) {
  const offshore = shoreDistance(x, z);
  return offshore >= 0 ? SHORE.deep * Math.tanh(SHORE.slope * offshore / SHORE.deep) : -landHeight(-offshore);
}
/** The ground's height above the still water at a world XZ point: the beach's, or 0 over the lake. */
export function groundHeightAt(x, z) {
  return Math.max(-floorDepthAt(x, z), 0);
}
/** The uniforms LAKE_BED (src/shaders/scene.js) reads. */
function shoreUniforms() {
  return {
    uShore: { value: new THREE.Vector4(SHORE.z, SHORE.bend, SHORE.slope, SHORE.deep) },
    uLand: { value: new THREE.Vector4(SHORE.beach, SHORE.beachTop, SHORE.bank, 0) },
    uBank: { value: new THREE.Vector2(SHORE.bankFrom, SHORE.bankTo) },
  };
}
const BANK = [0, 2.45];                                         // under the shore view's eye: the bed's mesh centres here
const BED_RINGS = { first: 0.05, growth: 1.08, last: 300 };   // the mesh's rings about the bank, metres
const BED_SEGMENTS = 96;                                        // and its spokes

/**
 * The lake bed's mesh: rings about the bank, from BED_RINGS.first out to
 * BED_RINGS.last, each BED_RINGS.growth times the last, so cells are
 * centimetres where the bed is shallow and steep and tens of metres where it
 * is flat; flat (y = 0) here, the floor's vertex shader sinks each vertex to
 * the bed (floorDepthAt).
 */
function bedGeometry() {
  const radii = [0];
  for (let radius = BED_RINGS.first; radii.at(-1) < BED_RINGS.last; radius *= BED_RINGS.growth) radii.push(Math.min(radius, BED_RINGS.last));
  const positions = [BANK[0], 0, BANK[1]];
  for (let ring = 1; ring < radii.length; ring++) {
    for (let spoke = 0; spoke < BED_SEGMENTS; spoke++) {
      const angle = (spoke / BED_SEGMENTS) * Math.PI * 2;
      positions.push(BANK[0] + radii[ring] * Math.cos(angle), 0, BANK[1] + radii[ring] * Math.sin(angle));
    }
  }
  const indices = [];
  for (let spoke = 0; spoke < BED_SEGMENTS; spoke++) indices.push(0, 1 + ((spoke + 1) % BED_SEGMENTS), 1 + spoke);
  for (let ring = 1; ring < radii.length - 1; ring++) {
    const inner = 1 + (ring - 1) * BED_SEGMENTS, outer = inner + BED_SEGMENTS;
    for (let spoke = 0; spoke < BED_SEGMENTS; spoke++) {
      const next = (spoke + 1) % BED_SEGMENTS;
      indices.push(inner + spoke, inner + next, outer + spoke, inner + next, outer + next, outer + spoke);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

const PATTERN_TEXELS = 1024;   // the tile's side (PATTERN_TILE, 2 m, in src/shaders/scene.js)
const PATTERN_ANISOTROPY = 8;  // at most, where the device has anisotropic filtering

function bakePattern(renderer) {
  const target = new THREE.WebGLRenderTarget(PATTERN_TEXELS, PATTERN_TEXELS, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,   // so the chain is allocated and built after the bake
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: true,
  });
  // Set before the target is allocated, which is when Three.js applies it.
  target.texture.anisotropy = Math.min(PATTERN_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  const pass = new FullscreenPass(FLOOR_BAKE_FRAGMENT, {});
  const previousTarget = renderer.getRenderTarget();
  pass.render(renderer, target);
  renderer.setRenderTarget(previousTarget);
  pass.material.dispose();
  return target;
}

export function createPondFloor(water, lighting, ambientWaves, { renderer, rings = null }) {
  const pattern = bakePattern(renderer);
  const material = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT,
    uniforms: {
      uHeight: { value: water.heightTexture },
      uSunDir: { value: lighting.sunDirection },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
      uDomainSize: { value: water.domainSize },
      uTexelOffset: water.gridUniforms.uTexelOffset,
      uN: water.gridUniforms.uN,
      uCell: water.gridUniforms.uCell,
      ...shoreUniforms(),
      uAbsorb: { value: lighting.absorb },
      uExtinction: { value: lighting.extinction },
      uWaterColor: { value: lighting.waterColor },
      uPattern: { value: pattern.texture },
      ...ambientWaves.uniforms(),
      ...(rings ? rings.uniforms() : {}),
    },
  });
  material.addEventListener('dispose', () => pattern.dispose());
  const mesh = new THREE.Mesh(bedGeometry(), material);
  mesh.frustumCulled = false;
  return mesh;
}

// The beach's mesh (createShore): columns along the waterline, x from
// −LAND.wide to +LAND.wide, each LAND.growth times wider than the last from
// LAND.first at the middle; rows back from it, from LAND.wet into the water
// (under its edge, which covers it) to LAND.deep behind, as fine near the
// water. Each vertex stands its row's distance behind the waterline at its
// column; LAND_VERTEX raises it to the beach.
const LAND = { first: 0.25, growth: 1.15, wide: 1500, wet: [-0.8, -0.4, -0.15], deep: 9000 };

function landGeometry() {
  const half = [0];
  for (let width = LAND.first; half.at(-1) < LAND.wide; width *= LAND.growth) half.push(half.at(-1) + width);
  const columns = [...half.slice(1).reverse().map((x) => -x), ...half];
  const rows = [...LAND.wet, 0];
  for (let depth = LAND.first; rows.at(-1) < LAND.deep; depth *= LAND.growth) rows.push(rows.at(-1) + depth);
  const positions = [];
  for (const behind of rows) {
    for (const x of columns) positions.push(x, 0, SHORE.z + (x * x) / (2 * SHORE.bend) + behind);
  }
  const indices = [];
  for (let row = 0; row < rows.length - 1; row++) {
    for (let column = 0; column < columns.length - 1; column++) {
      const near = row * columns.length + column, far = near + columns.length;
      indices.push(near, far, near + 1, near + 1, far, far + 1);   // facing up
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The beach (the header): its own mesh in the main scene, which the caller
 * also puts on the mirror's layer, lit as the bed and fading into the sky's
 * photo far off. It shares the floor's baked sand and the sky's cube map
 * (src/sky.js, refilled in place by a new sky).
 */
export function createShore(floor, lighting, environment) {
  const material = new THREE.ShaderMaterial({
    vertexShader: LAND_VERTEX,
    fragmentShader: LAND_FRAGMENT,
    uniforms: {
      ...shoreUniforms(),
      uPattern: floor.material.uniforms.uPattern,
      uSunDir: { value: lighting.sunDirection },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uSkyCube: { value: environment.cubeTexture },
    },
  });
  const mesh = new THREE.Mesh(landGeometry(), material);
  mesh.frustumCulled = false;
  return mesh;
}
