// The water surface: an inner patch that follows the simulated height field and
// a flat outer sheet to the horizon, drawn with one shader. The ambient wind
// waves (src/ambientWaves.js) ride on both: they displace the inner patch with
// the splash's waves and shade all the water (WATER_VERTEX and WATER_FRAGMENT
// say how). The sheet reaches OUTER_HALF_SIZE metres from the patch's centre,
// so seen from the camera (1.15 m up) its edge is 0.02° below the horizon and
// the water meets the sky dome's horizon with no strip of the photo's own
// ground between them.
import * as THREE from 'three';
import { WATER_VERTEX, WATER_FRAGMENT } from './shaders/scene.js';

const OUTER_HALF_SIZE = 3000;

function outerSheetGeometry(innerHalf, outerHalf, centre) {
  // Four quads around the inner square, in the XZ plane.
  const positions = [];
  const push = (x0, z0, x1, z1) => {
    positions.push(x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1);
  };
  const cx = centre[0], cz = centre[1];
  push(cx - outerHalf, cz - outerHalf, cx + outerHalf, cz - innerHalf);   // far strip
  push(cx - outerHalf, cz + innerHalf, cx + outerHalf, cz + outerHalf);   // near strip
  push(cx - outerHalf, cz - innerHalf, cx - innerHalf, cz + innerHalf);   // left strip
  push(cx + innerHalf, cz - innerHalf, cx + outerHalf, cz + innerHalf);   // right strip
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function createWaterSurface(water, lighting, ambientWaves) {
  const uniforms = {
    uHeight: { value: water.heightTexture },
    uFoam: { value: water.foamTexture },
    uReflection: { value: null },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uUnderColor: { value: null },
    uUnderDepth: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 100 },
    uFocalPx: { value: 1000 },
    uSunDir: { value: lighting.sunDirection },
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uN: { value: water.size },
    uCell: { value: water.cell },
    uAbsorb: { value: lighting.absorb },
    uWaterColor: { value: lighting.waterColor },
    uScatterLength: { value: 2.2 },
    uRoughness: { value: 0.07 },
    uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
    uDomainSize: { value: water.domainSize },
    uTexelOffset: { value: water.uvOffset },
    uInner: { value: 1 },
    uAmbientUnresolved: { value: ambientWaves.unresolvedVariance },
    ...ambientWaves.uniforms(),
  };
  // Two materials sharing every uniform object but uInner.
  const material = (inner) => new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: inner ? uniforms : { ...uniforms, uInner: { value: 0 } },
    defines: { AMBIENT_LEVELS: ambientWaves.levels },
  });
  const innerMaterial = material(true);
  const outerMaterial = material(false);

  const innerSegments = Math.min(water.size, 512);
  const innerGeometry = new THREE.PlaneGeometry(water.domainSize, water.domainSize, innerSegments, innerSegments);
  innerGeometry.rotateX(-Math.PI / 2);
  const inner = new THREE.Mesh(innerGeometry, innerMaterial);
  inner.position.set(water.centre[0], 0, water.centre[1]);
  inner.frustumCulled = false;

  const outer = new THREE.Mesh(outerSheetGeometry(water.domainSize / 2, OUTER_HALF_SIZE, water.centre), outerMaterial);
  outer.frustumCulled = false;

  return {
    inner,
    outer,
    uniforms,
    update({ underTarget, reflectionTarget, reflectionMatrix, resolution, camera }) {
      uniforms.uReflection.value = reflectionTarget.texture;
      uniforms.uReflectionMatrix.value.copy(reflectionMatrix);
      uniforms.uUnderColor.value = underTarget.texture;
      uniforms.uUnderDepth.value = underTarget.depthTexture;
      uniforms.uResolution.value.copy(resolution);
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
      uniforms.uFocalPx.value = camera.projectionMatrix.elements[5] * resolution.y * 0.5;
      uniforms.uFoam.value = water.foamTexture;
      uniforms.uHeight.value = water.heightTexture;
    },
  };
}
