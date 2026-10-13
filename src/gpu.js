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
const capabilities = { fullFloat: true, floatLinear: true };

export function configureFloatSupport(renderer) {
  capabilities.fullFloat = renderer.extensions.has('EXT_color_buffer_float');
  capabilities.floatLinear = renderer.extensions.has('OES_texture_float_linear');
  return capabilities;
}

export function createFloatTarget(width, height, { format = THREE.RGBAFormat, type = THREE.FloatType, filter = THREE.NearestFilter, depth = false, depthTexture = false, wrap = THREE.ClampToEdgeWrapping } = {}) {
  if (type === THREE.FloatType && !capabilities.fullFloat) type = THREE.HalfFloatType;
  if (type === THREE.FloatType && filter === THREE.LinearFilter && !capabilities.floatLinear) filter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(width, height, {
    format,
    type,
    minFilter: filter,
    magFilter: filter,
    wrapS: wrap,
    wrapT: wrap,
    depthBuffer: depth,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  if (depthTexture) {
    target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  }
  return target;
}
