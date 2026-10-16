// The sandy pond floor, lit by sunlight focused through the rippling surface:
// the caustics come from the curvature of the splash's height field, of the
// ambient wind waves (src/ambientWaves.js) and of the rings (src/rings.js), so
// they drift with the ripples and a ring throws a ring of light on the sand.
//
// The floor's pattern (sand, pebbles and silt: FLOOR_PATTERN in
// src/shaders/scene.js, seven value noises) never changes, so the floor shader
// does not compute it: one GPU pass of the same code bakes it at start-up into
// an RGBA8 texture (8 MiB), and per pixel the floor fetches it and adds what
// moves, the caustics, and the light.
//
// The pattern shows through the water out to about 25 m ahead (past that,
// absorption leaves it under half a level of the final 8-bit pixel) and as
// wide as the view; a square of world XZ covering that with as many texels
// would have texels of about 3 cm, several pixels each on the near floor. But
// the camera never moves (src/main.js), it only turns and zooms, so the
// texture is laid out in perspective from its eye (eye, the camera's
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
      uPondDepth: { value: water.depth },
      uAbsorb: { value: lighting.absorb },
      uPattern: { value: pattern.texture },
      ...layout,
      ...ambientWaves.uniforms(),
      ...(rings ? rings.uniforms() : {}),
    },
  });
  material.addEventListener('dispose', () => pattern.dispose());
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -water.depth;
  mesh.frustumCulled = false;
  return mesh;
}
