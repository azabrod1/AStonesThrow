// Small helpers for render-to-texture passes.
import * as THREE from 'three';
import { FULLSCREEN_VERTEX } from './shaders/spectral.js';

const quadGeometry = new THREE.PlaneGeometry(2, 2);
const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** A full-screen fragment program with its own uniforms. */
export class FullscreenPass {
  constructor(fragmentShader, uniforms, options = {}) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      ...options,
    });
    this.mesh = new THREE.Mesh(quadGeometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, passCamera);
  }
}

// Browsers without EXT_color_buffer_float fall back to half floats everywhere;
// the solver loses precision but keeps running. Without OES_texture_float_linear
// full-float textures cannot be filtered, so they are sampled nearest.
// forceHalfFloat takes the half-float path on any device, to test it (the page
// sets it with ?floats=half).
const capabilities = { fullFloat: true, floatLinear: true };

export function configureFloatSupport(renderer, { forceHalfFloat = false } = {}) {
  capabilities.fullFloat = renderer.extensions.has('EXT_color_buffer_float') && !forceHalfFloat;
  capabilities.floatLinear = renderer.extensions.has('OES_texture_float_linear');
  return capabilities;
}

// mipmaps: true gives a linearly filtered target with a mip chain that Three.js
// regenerates after every render into it (power-of-two sizes only).
export function createFloatTarget(width, height, { format = THREE.RGBAFormat, type = THREE.FloatType, filter = THREE.NearestFilter, depth = false, depthTexture = false, wrap = THREE.ClampToEdgeWrapping, mipmaps = false } = {}) {
  if (type === THREE.FloatType && !capabilities.fullFloat) type = THREE.HalfFloatType;
  if (type === THREE.FloatType && filter === THREE.LinearFilter && !capabilities.floatLinear) filter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(width, height, {
    format,
    type,
    minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : filter,
    magFilter: mipmaps ? THREE.LinearFilter : filter,
    wrapS: wrap,
    wrapT: wrap,
    depthBuffer: depth,
    stencilBuffer: false,
    generateMipmaps: mipmaps,
  });
  if (depthTexture) {
    target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  }
  return target;
}

const CHANNELS = { [THREE.RGBAFormat]: 4, [THREE.RGFormat]: 2, [THREE.RedFormat]: 1 };
const TYPE_BYTES = { [THREE.FloatType]: 4, [THREE.HalfFloatType]: 2, [THREE.UnsignedByteType]: 1 };

/**
 * The bytes a render target holds on the GPU, as allocated: its colour
 * texture (with its mip chain, six faces for a cube) and its depth buffer or
 * depth texture (4 bytes a pixel).
 */
export function renderTargetBytes(target) {
  const texture = target.texture;
  const faces = target.isWebGLCubeRenderTarget ? 6 : 1;
  const mipmapped = texture.generateMipmaps && texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter;
  const colour = target.width * target.height * (CHANNELS[texture.format] ?? 4) * (TYPE_BYTES[texture.type] ?? 4) * faces * (mipmapped ? 4 / 3 : 1);
  const depth = target.depthBuffer || target.depthTexture ? target.width * target.height * 4 * faces : 0;
  return Math.round(colour + depth);
}
