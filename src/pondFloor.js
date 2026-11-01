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
// is wet just above the water, with the relief, debris and tufts a shore
// shows between its grains and its slope (LAND_FRAGMENT). Farther off it
// gives way to the sky photo's own ground in its direction, so where the
// beach ends the photo carries on, and the camera, which turns about the
// pond (src/main.js), sees a shore behind it rather than water to the
// horizon.
//
// The caustics (FLOOR_FRAGMENT and CAUSTICS, which the pool's basin shares,
// in src/shaders/scene.js). A floor point is lit
// by the sun refracted into the water, focused by the curvature of the
// surface it crossed: the Laplacian of all three heights, times the bed's depth there,
// times how far the refracted light moves on the floor per metre of depth and
// unit of slope (Snell's law: 1 − cos θi/(n·cos θt) for a slope across the
// sun's plane, sec²θt times that along it; their mean, 0.76 for this scene's
// sun 27° up, 0.25 for one overhead). For small slopes the irradiance is
// 1/(1 + that); where the rays come to a focus on the floor it peaks, as
// sharp as the sun's disc and the pixel allow, and past the focus it is the
// crossed rays' 1/|…|, so a ring's crests draw thin bright lines and its
// troughs darker bands; it is eased into 0.45 to 2.6 times the sun's own, so
// a steep ring never blows the sand out, while the ripples' web and a ring's
// rings of light stand out crisply on the shallow sand, as through a clear
// pool. Where on the floor: the floor is
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
// Coral sand uses less grain and silt contrast (SHORE_LOOKS.coral.detail),
// shared by the beach, the bed and the view from below through uBedDetail.
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
// The Koi pond's shore (setShoreKind('koi'; src/main.js PLACES `koi`), in place of the lake's: a closed, asymmetric
// outline about KOI_SHORE.centre, as a Japanese garden's pond is (its lobes, a bay, a broad point), its radius at the
// angle θ from the centre base + Σ amplitude·cos(k·θ + phase) (KOI_SHORE.lobes): 9 m across, 7 m from the near shore,
// 60 cm in front of the shore view's eye, to the far one. Out from it (s, koiShoreDistance) the bed drops
// steeply under a stone edge to a shelf 35 cm down, then to 1.35 m, as a koi pond's does; but along the pebble beach
// (KOI_SHORE.beach, a span of angles: the suhama of a Japanese garden) it shelves gently. Behind it the ground rises
// over a low lip (higher at the stone edge than at the beach) and mounds gently away from the water. LAKE_BED in
// src/shaders/scene.js is its GLSL twin (KOI_LOBES): change both.
export const KOI_SHORE = {
  centre: [0, -1.2], base: 4.0,
  lobes: [[0.55, 2, -0.5], [0.4, 3, 0.7 - Math.PI / 2], [0.2, 5, 1.9]],   // [amplitude (m), k, phase]
  beach: [0.15, 1.05],   // rad: the pebble beach's span of θ, on the right of the far half
  shelf: 0.35, deep: 1.35, lip: 0.08, beachLip: 0.08, mound: 0.3,
};
// The Polynesian lagoon's shore (setShoreKind('lagoon'); src/main.js PLACES `tropical`): the lake's waterline behind the
// eye joined to a beach of white sand that runs out along the right of the home view toward the horizon, as a motu's
// lagoon beach does in the photographs it is drawn from (Aitutaki's Tapuaetai, Bora Bora's motus). The beach's
// waterline leaves LAGOON_SHORE.origin (5 m to the right of the throw's line, so the solver's patch is open water and a
// stone lands as deep as in the lake) heading `bearing` degrees right of straight ahead, bowing gently left over
// `bow` (m: its radius of curve), wandering `wander` (m, its wavelength in m) along its length, and ends in a point
// `end` metres out, rounded over `point` (m); it is a motu, `width` metres across to its ocean side, which no eye
// on the lagoon sees past its palms. The two are joined by a smooth minimum over `join` (m), so the bed under
// the throw is the lake's to a millimetre. Out from either waterline the bed and the land are the lake's (SHORE's
// slope and depth, landHeight). LAKE_BED in src/shaders/scene.js is its GLSL twin (LAGOON_*): change both.
export const LAGOON_SHORE = { origin: [5.2, 0], bearing: 22, bow: 900, wander: [1.4, 37], end: 430, point: 25, width: 160, join: 1.0 };
let shoreKind = 'lake';
// Each place's shore (its sky's `shore`, src/sky.js; setShoreLook): the
// ground's dry colour (`sand`, an albedo; Lakeside's is LAND_FRAGMENT's
// DRY_SAND; `grey` how far the sand tile's own yellow is taken out first,
// 0 to 1; the bed under the water takes the same, uBedTint in FLOOR_SAND),
// and how much of the beach's debris and growth it has
// (LAND_FRAGMENT's uShoreLook and uShoreMore): `pebbles` the share of cells
// with one near the water, `pebbleSize` times their radii, `tufts` times
// the bank's tufts, `wrack` the wrack line and its sticks, `grass` times
// how far inland the grass begins, `cracks` a dried flat's plates. The
// looks are told apart by what a shore is made of: Lakeside's sand, a
// reservoir's red earth, a wooded lake's turf to the water, a loch's dark
// peaty gravel, a sea cove's granite shingle, a desert's bare gravel, a
// salt flat's pale crust, an alpine lake's grey scree.
export const SHORE_LOOKS = {
  sand:    { sand: [0.68, 0.6, 0.5],    grey: 0,    pebbles: 0.3,  pebbleSize: 1,   tufts: 1,    wrack: 1,   grass: 1,    cracks: 0 },
  earth:   { sand: [0.52, 0.38, 0.27],  grey: 0.2,  pebbles: 0.45, pebbleSize: 1.2, tufts: 1,    wrack: 0.4, grass: 0.8,  cracks: 0 },
  turf:    { sand: [0.5, 0.45, 0.33],   grey: 0.3,  pebbles: 0.25, pebbleSize: 1,   tufts: 1.2,  wrack: 0.2, grass: 0.35, cracks: 0 },
  peat:    { sand: [0.36, 0.3, 0.22],   grey: 0.4,  pebbles: 0.8,  pebbleSize: 1.6, tufts: 0.7,  wrack: 0.3, grass: 0.6,  cracks: 0 },
  shingle: { sand: [0.52, 0.52, 0.5],   grey: 0.9,  pebbles: 0.9,  pebbleSize: 2.2, tufts: 0.3,  wrack: 0.6, grass: 1.2,  cracks: 0 },
  gravel:  { sand: [0.6, 0.54, 0.44],   grey: 0.45, pebbles: 0.6,  pebbleSize: 1.5, tufts: 0.15, wrack: 0,   grass: 1.5,  cracks: 0 },
  salt:    { sand: [0.84, 0.83, 0.8],   grey: 0.85, pebbles: 0.05, pebbleSize: 1,   tufts: 0.05, wrack: 0,   grass: 2,    cracks: 1 },
  scree:   { sand: [0.46, 0.46, 0.46],  grey: 0.95, pebbles: 0.95, pebbleSize: 2.2, tufts: 0.1,  wrack: 0,   grass: 1.5,  cracks: 0 },
  coral:   { detail: [0.5, 0.22], sand: [0.92, 0.89, 0.80],  grey: 0.15, pebbles: 0.12, pebbleSize: 0.8, tufts: 0.35, wrack: 0.35, grass: 0.9,  cracks: 0 },   // the Polynesian lagoon's: white coral sand, bits of shell, a wrack line of seaweed
};
const DRY_SAND = SHORE_LOOKS.sand.sand;   // LAND_FRAGMENT's: the tint is against it
const bedDetailUniform = { value: new THREE.Vector2(1, 1) };   // grain and silt contrast; cleaner coral sand at the lagoon
const bedTintUniform = { value: new THREE.Vector4(1, 1, 1, 0) };   // FLOOR_SAND's uBedTint: the tint, and the grey share in w
const shoreLookUniform = { value: new THREE.Vector4(0.3, 1, 1, 1) };   // LAND_FRAGMENT's uShoreLook...
const shoreMoreUniform = { value: new THREE.Vector2(1, 0) };          // ...and uShoreMore
/** The shore look in force (SHORE_LOOKS by name; 'sand' for one not there): the bed's tint and the beach's uniforms. */
export function setShoreLook(name) {
  const look = SHORE_LOOKS[name] ?? SHORE_LOOKS.sand;
  bedDetailUniform.value.fromArray(look.detail ?? [1, 1]);
  bedTintUniform.value.set(look.sand[0] / DRY_SAND[0], look.sand[1] / DRY_SAND[1], look.sand[2] / DRY_SAND[2], look.grey);
  shoreLookUniform.value.set(look.pebbles, look.pebbleSize, look.tufts, look.wrack);
  shoreMoreUniform.value.set(look.grass, look.cracks);
}
const SHORE_KINDS = { lake: 0, koi: 1, lagoon: 2 };   // LAKE_BED's uShoreKind (SHORE_LAKE, SHORE_KOI, SHORE_LAGOON)
const shoreKindUniform = { value: 0 };
/** The shore in force: 'lake' (the lake's, SHORE), 'koi' (the Koi pond's, KOI_SHORE) or 'lagoon' (the Polynesian lagoon's, LAGOON_SHORE); every function here and LAKE_BED follow it. */
export function setShoreKind(kind) {
  shoreKind = Object.hasOwn(SHORE_KINDS, kind) ? kind : 'lake';
  shoreKindUniform.value = SHORE_KINDS[shoreKind];
}
export const getShoreKind = () => shoreKind;
/** The Koi pond's outline's radius (m) at the angle θ about its centre. */
export function koiShoreRadius(angle) {
  return KOI_SHORE.lobes.reduce((radius, [amplitude, lobeCount, phase]) => radius + amplitude * Math.cos(lobeCount * angle + phase), KOI_SHORE.base);
}
/** How much of the pebble beach's shelving the shore at θ takes, 0 to 1. */
function koiBeach(angle) {
  const [from, to] = KOI_SHORE.beach;
  return smoothstep(from, from + 0.25, angle) * (1 - smoothstep(to - 0.25, to, angle));
}
/** How far into the Koi pond a world XZ point lies from its waterline (m; negative on its ground). */
export function koiShoreDistance(x, z) {
  const dx = x - KOI_SHORE.centre[0], dz = z - KOI_SHORE.centre[1];
  return koiShoreRadius(Math.atan2(dz, dx)) - Math.hypot(dx, dz);
}
const smoothstep = (low, high, value) => { const share = Math.min(Math.max((value - low) / (high - low), 0), 1); return share * share * (3 - 2 * share); };
/** The smooth minimum of two values over `width` (polynomial: within width of each other it eases below both). */
const smoothMin = (first, second, width) => { const ease = Math.max(width - Math.abs(first - second), 0) / width; return Math.min(first, second) - ease * ease * width * 0.25; };
const LAGOON_HEADING = THREE.MathUtils.degToRad(LAGOON_SHORE.bearing);
/** How far (m) the lagoon's waterline bends toward the lagoon `along` metres out along its beach (LAGOON_SHORE's bow and wander). */
export function lagoonBend(along) {
  const [wander, wavelength] = LAGOON_SHORE.wander;
  return Math.max(along, 0) ** 2 / (2 * LAGOON_SHORE.bow) + wander * Math.sin(along / wavelength + 1.0) * smoothstep(0, 40, along);
}
/** How far out into the lagoon a world XZ point lies from the Polynesian lagoon's own beach (LAGOON_SHORE; m, negative on it). */
export function lagoonBeachDistance(x, z) {
  const fromX = x - LAGOON_SHORE.origin[0], fromZ = z - LAGOON_SHORE.origin[1];
  const along = fromX * Math.sin(LAGOON_HEADING) - fromZ * Math.cos(LAGOON_HEADING);   // out along the beach
  const across = -fromX * Math.cos(LAGOON_HEADING) - fromZ * Math.sin(LAGOON_HEADING);    // toward the lagoon, across it
  const lagoonSide = -smoothMin(-(across - lagoonBend(along)), -(along - LAGOON_SHORE.end), LAGOON_SHORE.point);
  return -smoothMin(-lagoonSide, across + LAGOON_SHORE.width, LAGOON_SHORE.point);
}
/** How far out into the lagoon a world XZ point lies from the Polynesian lagoon's waterline (m; negative on its land), whatever shore is in force. */
export function lagoonShoreDistance(x, z) {
  return smoothMin(SHORE.z + (x * x) / (2 * SHORE.bend) - z, lagoonBeachDistance(x, z), LAGOON_SHORE.join);
}
/** How far out into the lake a world XZ point lies from the waterline (m; negative on the beach); the Koi pond's or the lagoon's in its place. */
export function shoreDistance(x, z) {
  if (shoreKind === 'koi') return koiShoreDistance(x, z);
  return shoreKind === 'lagoon' ? lagoonShoreDistance(x, z) : SHORE.z + (x * x) / (2 * SHORE.bend) - z;
}
/** The land's height (m) d metres inland of the waterline. */
export function landHeight(inland) {
  return SHORE.beachTop * Math.tanh(SHORE.beach * inland / SHORE.beachTop) + SHORE.bank * smoothstep(SHORE.bankFrom, SHORE.bankTo, inland);
}
/** The Koi pond's bed's depth (m) under a world XZ point: positive in the water, negative (the ground's height) on land. */
export function koiFloorDepthAt(x, z) {
  const offshore = koiShoreDistance(x, z);
  {
    const beach = koiBeach(Math.atan2(z - KOI_SHORE.centre[1], x - KOI_SHORE.centre[0]));
    if (offshore >= 0) {
      const edged = KOI_SHORE.shelf * smoothstep(0, 0.25, offshore) + (KOI_SHORE.deep - KOI_SHORE.shelf) * smoothstep(0.6, 2.0, offshore);
      return edged + (KOI_SHORE.deep * smoothstep(0, 2.6, offshore) - edged) * beach;
    }
    const inland = -offshore;
    const lip = KOI_SHORE.lip + (KOI_SHORE.beachLip - KOI_SHORE.lip) * beach;
    return -(lip * Math.tanh(inland / (0.3 + 0.5 * beach)) + KOI_SHORE.mound * smoothstep(2, 7, inland));
  }
}
/** The lake bed's depth (m) under a world XZ point: positive in the lake, negative (the land's height) on land; the Koi pond's in its place. */
export function floorDepthAt(x, z) {
  if (shoreKind === 'koi') return koiFloorDepthAt(x, z);
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
    uShoreKind: shoreKindUniform,
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

// The palms' shadows (PALM_SHADOW in src/shaders/scene.js), shared by the floor's and every land's material: src/
// tropics.js bakes the beach and foreground detail masks and turns them on at the Polynesian lagoon.
export const PALM_SHADOW = { uPalmShadowNear: { value: null }, uPalmShadowNearBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uPalmShadow: { value: null }, uPalmShadowBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uPalmShadowOn: { value: 0 } };

export function createPondFloor(water, lighting, ambientWaves, { renderer, rings = null, ice = null }) {
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
      uBedDetail: bedDetailUniform,
      uBedTint: bedTintUniform,   // the place's ground against Lakeside's sand (setShoreLook)
      ...PALM_SHADOW,
      ...ambientWaves.uniforms(),
      ...(rings ? rings.uniforms() : {}),
      ...(ice ? ice.uniforms : {}),   // under the ice the surface focuses nothing (surfaceCurvature)
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
 * (src/sky.js, refilled in place by a new sky); `snow` is the weather's
 * snow cover, a uniform's shared object. With `koi`, the Koi pond's ground
 * all round its outline (koiLandGeometry) in place of the lake's beach.
 */
// The Koi pond's ground (createShore's `koi`): rings about the pond's outline (KOI_SHORE), from under its water's edge
// out to the horizon, KOI_LAND.around to a ring, each ring KOI_LAND.growth farther out than the last.
const KOI_LAND = { around: 240, wet: [-0.5, -0.25, -0.1, 0], first: 0.03, growth: 1.2, far: 6000 };
function koiLandGeometry() {
  const rows = [...KOI_LAND.wet];
  for (let step = KOI_LAND.first; rows.at(-1) < KOI_LAND.far; step *= KOI_LAND.growth) rows.push(rows.at(-1) + step);
  const positions = [];
  for (const out of rows) {
    for (let spoke = 0; spoke < KOI_LAND.around; spoke++) {
      const angle = (spoke / KOI_LAND.around) * Math.PI * 2;
      const radius = koiShoreRadius(angle) + out;
      positions.push(KOI_SHORE.centre[0] + Math.cos(angle) * radius, 0, KOI_SHORE.centre[1] + Math.sin(angle) * radius);
    }
  }
  const indices = [];
  for (let row = 0; row < rows.length - 1; row++) {
    for (let spoke = 0; spoke < KOI_LAND.around; spoke++) {
      const here = row * KOI_LAND.around + spoke, next = row * KOI_LAND.around + (spoke + 1) % KOI_LAND.around;
      indices.push(here, next, here + KOI_LAND.around, next, next + KOI_LAND.around, here + KOI_LAND.around);   // facing up
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// The Polynesian lagoon's ground (createShore's `lagoon`): rings about the bank under the shore view's eye, as the bed's
// are, LAGOON_LAND.spokes round, each LAGOON_LAND.growth times farther out than the last to LAGOON_LAND.far, kept where
// a corner stands on the land or within LAGOON_LAND.wet of it in the water (the strip under the water's edge, which the
// water covers): the lake's beach behind the eye and the lagoon's own beach out to its point, one mesh, so no two meet
// in a seam. Laid out by the lagoon's shore (lagoonShoreDistance), whatever is in force.
const LAGOON_LAND = { spokes: 480, first: 0.25, growth: 1.06, far: 6000, wet: 1.0 };
export function lagoonLandGeometry() {
  const radii = [0];
  for (let radius = LAGOON_LAND.first; radii.at(-1) < LAGOON_LAND.far; radius *= LAGOON_LAND.growth) radii.push(Math.min(radius, LAGOON_LAND.far));
  const positions = [], kept = [];
  for (const radius of radii) {
    for (let spoke = 0; spoke < LAGOON_LAND.spokes; spoke++) {
      const angle = (spoke / LAGOON_LAND.spokes) * Math.PI * 2;
      const x = BANK[0] + radius * Math.cos(angle), z = BANK[1] + radius * Math.sin(angle);
      positions.push(x, 0, z);
      kept.push(lagoonShoreDistance(x, z) < LAGOON_LAND.wet);
    }
  }
  const indices = [];
  for (let ring = 0; ring < radii.length - 1; ring++) {
    for (let spoke = 0; spoke < LAGOON_LAND.spokes; spoke++) {
      const next = (spoke + 1) % LAGOON_LAND.spokes;
      const inner = ring * LAGOON_LAND.spokes, outer = inner + LAGOON_LAND.spokes;
      const corners = [inner + spoke, inner + next, outer + spoke, outer + next];
      if (!corners.some((corner) => kept[corner])) continue;
      indices.push(inner + spoke, inner + next, outer + spoke, inner + next, outer + next, outer + spoke);   // facing up
    }
  }
  // Only the corners used, renumbered.
  const used = new Int32Array(kept.length).fill(-1);
  const compact = [];
  const remapped = indices.map((corner) => {
    if (used[corner] < 0) { used[corner] = compact.length / 3; compact.push(positions[corner * 3], 0, positions[corner * 3 + 2]); }
    return used[corner];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(compact, 3));
  geometry.setIndex(remapped);
  return geometry;
}

export function createShore(floor, lighting, environment, { snow = { value: 0 }, koi = false, lagoon = false } = {}) {
  const material = new THREE.ShaderMaterial({
    vertexShader: LAND_VERTEX,
    fragmentShader: LAND_FRAGMENT,
    uniforms: {
      ...shoreUniforms(),
      uPattern: floor.material.uniforms.uPattern,
      uBedDetail: bedDetailUniform,
      uBedTint: bedTintUniform,       // the place's shore look (setShoreLook)...
      uShoreLook: shoreLookUniform,
      uShoreMore: shoreMoreUniform,
      uSunDir: { value: lighting.sunDirection },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uSkyCube: { value: environment.cubeTexture },
      uLandCube: environment.landCube,     // the land before the haze, for the grass (src/sky.js)
      uLandLevel: environment.landLevel,
      ...environment.hazeUniforms,
      uSnow: snow,   // the snow lying on it, 0 to 1 (src/main.js WEATHERS)
      ...PALM_SHADOW,
    },
  });
  // The lagoon's land is built the first time it is shown (src/main.js showScenery: lagoonLandGeometry); its program is
  // the lake's shore's, so nothing is left to build on the device then.
  const mesh = new THREE.Mesh(koi ? koiLandGeometry() : lagoon ? new THREE.BufferGeometry() : landGeometry(), material);
  mesh.frustumCulled = false;
  return mesh;
}
