// The sandy pond floor, lit by sunlight focused through the rippling surface:
// the caustics come from the curvature of the splash's height field and of the
// ambient wind waves (src/ambientWaves.js), so they drift with the ripples.
import * as THREE from 'three';
import { FLOOR_VERTEX, FLOOR_FRAGMENT } from './shaders/scene.js';

export function createPondFloor(water, lighting, ambientWaves) {
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
      uTexelOffset: { value: water.uvOffset },
      uN: { value: water.size },
      uCell: { value: water.cell },
      uPondDepth: { value: water.depth },
      uAbsorb: { value: lighting.absorb },
      ...ambientWaves.uniforms(),
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -water.depth;
  mesh.frustumCulled = false;
  return mesh;
}
