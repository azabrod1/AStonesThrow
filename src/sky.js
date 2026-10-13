// Sky, far shore and the environment maps derived from them.
//
// The sky is the Preetham model from Three.js. A ring of dark wooded hills
// sits on the horizon so that the water has something to reflect at grazing
// angles. Both are rendered once into a cube map that the water and the
// droplets reflect, and a prefiltered copy lights the stones.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

function hills() {
  const segments = 360;
  const radius = 140;
  const positions = [];
  const colors = [];
  const dark = new THREE.Color(0.030, 0.052, 0.040);
  const lit = new THREE.Color(0.075, 0.115, 0.070);
  const haze = new THREE.Color(0.42, 0.52, 0.62);
  const noise = (t, scale, seed) => {
    const x = t * scale + seed;
    const i = Math.floor(x), f = x - i;
    const a = Math.sin(i * 12.9898 + 78.233) * 43758.5453, b = Math.sin((i + 1) * 12.9898 + 78.233) * 43758.5453;
    const ha = a - Math.floor(a), hb = b - Math.floor(b);
    return ha + (hb - ha) * f * f * (3 - 2 * f);
  };
  const heightAt = (i) => {
    const t = i / segments;
    return 5.0 + 7.0 * noise(t, 7, 3) + 3.0 * noise(t, 23, 11) + 1.2 * noise(t, 90, 5);
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const h0 = heightAt(i), h1 = heightAt(i + 1);
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const shade0 = dark.clone().lerp(lit, noise(i / segments, 40, 7)).lerp(haze, 0.42);
    const shade1 = dark.clone().lerp(lit, noise((i + 1) / segments, 40, 7)).lerp(haze, 0.42);
    const base0 = shade0.clone().lerp(haze, 0.35);
    const base1 = shade1.clone().lerp(haze, 0.35);
    positions.push(x0, -2, z0, x1, -2, z1, x1, h1, z1, x0, -2, z0, x1, h1, z1, x0, h0, z0);
    colors.push(...base0.toArray(), ...base1.toArray(), ...shade1.toArray(), ...base0.toArray(), ...shade1.toArray(), ...shade0.toArray());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  return mesh;
}

export function createEnvironment(renderer, sunDirection) {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  // The stock sun disc is tens of thousands of times brighter than the sky,
  // which overflows half-float textures and poisons the prefiltered
  // environment. The sun's light comes from the directional light and the
  // analytic highlight in the water shaders, so keep only a modest disc here.
  sky.material.fragmentShader = sky.material.fragmentShader.replace('( vSunE * 19000.0 * Fex ) * sundisk', '( vSunE * 2.5 * Fex ) * sundisk');
  sky.material.needsUpdate = true;
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 3.2;
  uniforms.rayleigh.value = 1.6;
  uniforms.mieCoefficient.value = 0.006;
  uniforms.mieDirectionalG.value = 0.86;
  uniforms.sunPosition.value.copy(sunDirection);

  const shore = hills();
  // The sky model is undefined below the horizon (it can produce NaN there), and
  // one NaN texel poisons every blurred level of the prefiltered environment.
  // A dark water-coloured hemisphere under the camera covers that half entirely.
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.10, 0.17, 0.20), side: THREE.BackSide }),
  );
  ground.position.y = 0.3;

  const captureScene = new THREE.Scene();
  captureScene.add(sky, shore, ground);
  const cubeTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const cubeCamera = new THREE.CubeCamera(0.5, 50000, cubeTarget);
  cubeCamera.position.set(0, 1.15, 0);
  // Each face needs a cleared depth buffer, whatever the renderer's setting.
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = true;
  cubeCamera.update(renderer, captureScene);
  renderer.autoClear = previousAutoClear;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromCubemap(cubeTarget.texture).texture;
  pmrem.dispose();
  captureScene.remove(sky, shore, ground);

  return { sky, shore, cubeTexture: cubeTarget.texture, envTexture };
}
