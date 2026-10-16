// The sandy lake bed, lit by sunlight focused through the rippling surface:
// the caustics come from the curvature of the splash's height field, of the
// ambient wind waves (src/ambientWaves.js) and of the rings (src/rings.js), so
// they drift with the ripples and a ring throws a ring of light on the sand.
//
// The bed (LAKE_BED, floorDepthAt) deepens away from the bank the camera
// stands on, as a lake's does: 0.7 m under the bottom of the home view,
// 1.7 m where the reference throw lands, 3.5 m far out. Its mesh is rings
// about the bank, sunk to it in the vertex shader, and every point of it is
// lit through its own depth of water: the sun down to it, the caustics'
// focusing and where on it they fall. So the sand is bright in the shallows
// and fades with depth, and a ring's light on the sand, under 1.7 m of water
// where the rocks land, is too dim and too far through the water to show,
// as in a real lake. The rocks and their holes come to rest on it (src/
// cavity.js sinkStep takes floorDepthAt). The waves take the solver's depth
// (0.8 m, src/main.js): under 2 m long, they run within 1% of their speed
// over 1.7 m.
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
// The floor's pattern (sand, pebbles and silt: FLOOR_PATTERN in
// src/shaders/scene.js, seven value noises) never changes, so the floor shader
// does not compute it: one GPU pass of the same code bakes it at start-up into
// an RGBA8 texture (8 MiB), and per pixel the floor fetches it and adds what
// moves, the caustics, and the light.
//
// The pattern shows through the water out to about 9 m ahead (past that, the
// water, lighting.extinction, leaves it under half a level of the final 8-bit
// pixel) and as wide as the view; a square of world XZ covering that with as
// many texels would have texels of about 1.5 cm, five pixels each on the near
// floor. But the camera never moves (src/main.js), it only turns and zooms,
// so the texture is laid out in perspective from its eye (eye, the camera's
// position): a column is a fixed ratio of sideways offset to distance ahead of
// the eye, from −PATTERN_SPREAD to +PATTERN_SPREAD (51° either side, the
// bottom corners of a 21:9 view), and a row a fixed ratio of PATTERN_NEAREST
// to that distance, from the horizon to PATTERN_NEAREST metres ahead (just
// nearer than the bottom of the phone's view). Its texels lie on the floor as
// the screen's pixels do: across the view 1.2 mm per metre of distance, along
// it 0.56 mm per metre squared (2.8 by 2.9 mm at 2.3 m, the bottom of the home
// view; 8 by 24 mm at 6.5 m; 1.8 by 13 cm at 15 m). That is about a texel per
// pixel at the home view and 1.3 to 1.6 pixels per texel at the phone's, which
// look as the per-pixel noise did; at the narrowest zoom (8°) it is about five,
// and the finest sand grain softens. Past its edges (views turned away from
// the home frame through the API) it repeats mirrored.
//
// The bake is one pass of PATTERN_SIZE texels through the noise the floor
// shader used to run for every pixel of every frame. Its program is freed
// after it; the texture lives as long as the floor's material (disposing the
// material frees it).
//
// Drawn at the canvas's resolution the pattern is at most 1.4 times
// minified, so the floor samples its base level alone. The lower quality
// presets draw the under-water pass at half resolution (underScale in
// src/main.js), twice as minified, and there it shimmers as the ripples move
// it: the bake also builds the mip chain (a third more memory), and
// setPatternMipmaps has the floor sample it while the pass is smaller than
// the canvas.
//
// The solver's grid sizes are its shared gridUniforms, so they follow a change
// of quality (src/main.js), and its height texture keeps its object through
// one: the floor, its material and the baked pattern are never rebuilt.
import * as THREE from 'three';
import { FLOOR_VERTEX, FLOOR_FRAGMENT, FLOOR_BAKE_FRAGMENT } from './shaders/scene.js';
import { FullscreenPass } from './gpu.js';

// The lake bed: the depth (m) grows with the distance d from BANK, the point
// on the bank under the camera's home spot, as deep·tanh((shallow +
// slope·d)/deep): 0.7 m at the bottom of the home view, 1.7 m where the
// reference throw lands, 2.4 m at the far edge of the solver's patch, and
// levelling off at 3.5 m. The rocks and their holes rest on it (src/
// cavity.js sinkStep); LAKE_BED in src/shaders/scene.js is its GLSL twin,
// which sinks the floor's mesh and lights it.
export const LAKE_BED = { bankX: 0, bankZ: 2.45, shallow: 0.12, slope: 0.45, deep: 3.5 };
/** The lake bed's depth (m, positive) under a world XZ point. */
export function floorDepthAt(x, z) {
  const distance = Math.hypot(x - LAKE_BED.bankX, z - LAKE_BED.bankZ);
  return LAKE_BED.deep * Math.tanh((LAKE_BED.shallow + LAKE_BED.slope * distance) / LAKE_BED.deep);
}
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
  const positions = [LAKE_BED.bankX, 0, LAKE_BED.bankZ];
  for (let ring = 1; ring < radii.length; ring++) {
    for (let spoke = 0; spoke < BED_SEGMENTS; spoke++) {
      const angle = (spoke / BED_SEGMENTS) * Math.PI * 2;
      positions.push(LAKE_BED.bankX + radii[ring] * Math.cos(angle), 0, LAKE_BED.bankZ + radii[ring] * Math.sin(angle));
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

const PATTERN_SIZE = [2048, 1024];   // texels: across the view, along it
const PATTERN_NEAREST = 1.75;        // metres ahead of the eye, the texture's last row
const PATTERN_SPREAD = 1.25;         // the texture's half width, as sideways offset over distance ahead

function bakePattern(renderer, layout) {
  const target = new THREE.WebGLRenderTarget(PATTERN_SIZE[0], PATTERN_SIZE[1], {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,   // so the chain is allocated and built after the bake
    magFilter: THREE.LinearFilter,
    wrapS: THREE.MirroredRepeatWrapping,
    wrapT: THREE.MirroredRepeatWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: true,
  });
  const pass = new FullscreenPass(FLOOR_BAKE_FRAGMENT, layout);
  const previousTarget = renderer.getRenderTarget();
  pass.render(renderer, target);
  renderer.setRenderTarget(previousTarget);
  pass.material.dispose();
  return target;
}

/**
 * Sample the baked pattern's mip chain (true) or its base level alone (the
 * header). Three.js sets a render target's filter once, when it allocates
 * it, so this sets the texture's on the GPU directly.
 */
export function setPatternMipmaps(floor, renderer, mipmapped) {
  const texture = floor.material.uniforms.uPattern.value;
  const filter = mipmapped ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  if (texture.userData.minFilterSet === filter) return;
  texture.userData.minFilterSet = filter;
  const gl = renderer.getContext();
  renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(texture).__webglTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
}

export function createPondFloor(water, lighting, ambientWaves, { renderer, eye, rings = null }) {
  const layout = {
    uPatternEye: { value: new THREE.Vector2(eye.x, eye.z) },
    uPatternNearest: { value: PATTERN_NEAREST },
    uPatternSpread: { value: PATTERN_SPREAD },
  };
  const pattern = bakePattern(renderer, layout);
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
      uLakeBed: { value: new THREE.Vector4(LAKE_BED.bankX, LAKE_BED.bankZ, LAKE_BED.shallow, LAKE_BED.slope) },
      uLakeDeep: { value: LAKE_BED.deep },
      uAbsorb: { value: lighting.absorb },
      uPattern: { value: pattern.texture },
      ...layout,
      ...ambientWaves.uniforms(),
      ...(rings ? rings.uniforms() : {}),
    },
  });
  material.addEventListener('dispose', () => pattern.dispose());
  const mesh = new THREE.Mesh(bedGeometry(), material);
  mesh.frustumCulled = false;
  return mesh;
}
