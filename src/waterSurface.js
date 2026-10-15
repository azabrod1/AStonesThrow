// The water surface: an inner patch that follows the simulated height field and
// a flat outer sheet to the horizon, drawn with one shader. The ambient wind
// waves (src/ambientWaves.js) ride on both: they displace the inner patch with
// the splash's waves and shade all the water (WATER_VERTEX and WATER_FRAGMENT
// say how). The sheet reaches OUTER_HALF_SIZE metres from the patch's centre,
// so seen from the camera (1.15 m up) its edge is 0.02° below the horizon and
// the water meets the sky dome's horizon with no strip of the photo's own
// ground between them.
//
// A stone's cavity (src/cavity.js) is drawn with the same shader and the same
// uniforms: cavityMaterial is its CAVITY_MESH variant, for the cavity's mesh,
// and while any cavity is open setCavities swaps the inner patch to its
// CAVITY_PUSH variant, which dips the patch under each cavity's lip so it
// never shows through the hole. With no cavity open the patch draws with its
// own material, so still water costs exactly what it did. precompile builds
// both variants' programs ahead of the first throw.
import * as THREE from 'three';
import { WATER_VERTEX, WATER_FRAGMENT } from './shaders/scene.js';

const OUTER_HALF_SIZE = 3000;
export const MAX_CAVITIES = 4;   // the inner patch dips under at most this many cavities at once

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
  // The cavity variants (WATER_VERTEX says what each does).
  const cavityUniforms = {
    uCavityCount: { value: 0 },
    uCavityMouths: { value: Array.from({ length: MAX_CAVITIES }, () => new THREE.Vector4()) },
    uCavityShifts: { value: Array.from({ length: MAX_CAVITIES }, () => new THREE.Vector3()) },
  };
  const innerCavityMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: { ...uniforms, ...cavityUniforms },
    defines: { AMBIENT_LEVELS: ambientWaves.levels, CAVITY_PUSH: MAX_CAVITIES },
  });
  const cavityMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms,
    defines: { AMBIENT_LEVELS: ambientWaves.levels, CAVITY_MESH: 1 },
    side: THREE.DoubleSide,
  });

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
    cavityMaterial,
    /** The open cavities' pushShape()s (src/cavity.js): the patch dips under them, or draws as still water when there are none. */
    setCavities(shapes) {
      const count = Math.min(shapes.length, MAX_CAVITIES);
      cavityUniforms.uCavityCount.value = count;
      for (let index = 0; index < count; index++) {
        const shape = shapes[index];
        cavityUniforms.uCavityMouths.value[index].set(shape.x, shape.z, shape.radius * shape.radius, 0);
        cavityUniforms.uCavityShifts.value[index].set(shape.shiftX, shape.shiftY, shape.shiftZ);
      }
      inner.material = count > 0 ? innerCavityMaterial : innerMaterial;
    },
    /**
     * Build the cavity variants' programs now, as the main pass will use them
     * (into `target`, lit as `scene` is: both are part of a program's key), so
     * the first throw does not wait for them.
     */
    precompile(renderer, camera, target, scene) {
      const variants = new THREE.Scene();
      variants.add(new THREE.Mesh(innerGeometry, innerCavityMaterial), new THREE.Mesh(new THREE.BufferGeometry(), cavityMaterial));
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.compile(variants, camera, scene);
      renderer.setRenderTarget(previous);
    },
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
