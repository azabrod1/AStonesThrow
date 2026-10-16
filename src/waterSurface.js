// The water surface: an inner patch that follows the simulated height field and
// a flat outer sheet to the horizon, drawn with one shader. The ambient wind
// waves (src/ambientWaves.js) and the rings that cross the pond
// (src/rings.js) ride on both: they displace the inner patch with the
// splash's waves and shade all the water (WATER_VERTEX and WATER_FRAGMENT say
// how). The sheet reaches OUTER_HALF_SIZE metres from the patch's centre,
// so seen from the camera (1.15 m up) its edge is 0.02° below the horizon and
// the water meets the sky dome's horizon with no strip of the photo's own
// ground between them.
//
// A stone's cavity (src/cavity.js) is drawn with the same shader and the same
// uniforms: cavityMaterial is its CAVITY_MESH variant, for the cavity's mesh,
// and while any cavity is open setCavities swaps the inner patch to its
// CAVITY_PUSH variant, which dips the patch under each cavity's lip so it
// never shows through the hole. With no cavity open the patch draws with its
// own material, so still water costs exactly what it did. The app's warm-up
// (src/main.js) draws both variants before the first throw, so their programs
// are built by then.
//
// update() hands the shader, each frame, the two images it looks things up
// in: the mirror image (with where the splash lies in it: the shader reads
// distances there, WATER_FRAGMENT) and the under-water pass (with whether a
// stone is under the water: its lookup is then checked against it).
//
// The inner patch's mesh carries only the displacement: the shader takes
// the normal from the height textures per pixel, so the mesh needs no more
// vertices than the displacement's silhouette and the cavity's dip need, and
// fewer than the solver's grid on the lower quality presets
// (setMeshSegments, src/main.js). It keeps only its positions (the shader
// reads no normal or uv). The cavity dips the patch by whole vertices, so
// `cell` (the mesh's spacing) is what src/cavity.js margins by, and the rings
// displace it as smoothed to that spacing (uMeshCell). The sizes the
// shader needs of the solver's grid are the solver's shared gridUniforms, so
// they follow its resize.
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

/** The inner patch: segments × segments quads over the solver's square, positions only. */
function innerPatchGeometry(water, segments) {
  const geometry = new THREE.PlaneGeometry(water.domainSize, water.domainSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  return geometry;
}

export function createWaterSurface(water, lighting, ambientWaves, { meshSegments = Math.min(water.size, 512), rings = null } = {}) {
  const uniforms = {
    uHeight: { value: water.heightTexture },
    uFoam: { value: water.foamTexture },
    uFoamDrift: water.foamUniforms.uFoamDrift,
    uReflection: { value: null },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uMirrorNear: { value: new THREE.Vector4(1, 1, 0, 0) },   // the splash's image in the mirror (uv), empty when none
    uMirrorSize: { value: new THREE.Vector2(1, 1) },
    uUnderColor: { value: null },
    uUnderDepth: { value: null },
    uStonesUnder: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 100 },
    uFocalPx: { value: 1000 },
    uSunDir: { value: lighting.sunDirection },
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uN: water.gridUniforms.uN,
    uCell: water.gridUniforms.uCell,
    uAbsorb: { value: lighting.absorb },
    uWaterColor: { value: lighting.waterColor },
    uScatterLength: { value: 2.2 },
    uRoughness: { value: 0.07 },
    uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
    uDomainSize: { value: water.domainSize },
    uTexelOffset: water.gridUniforms.uTexelOffset,
    uInner: { value: 1 },
    uMeshCell: { value: water.domainSize / meshSegments },
    uAmbientUnresolved: { value: ambientWaves.unresolvedVariance },
    ...ambientWaves.uniforms(),
    ...(rings ? rings.uniforms() : {}),
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

  let segments = meshSegments;
  const inner = new THREE.Mesh(innerPatchGeometry(water, segments), innerMaterial);
  inner.position.set(water.centre[0], 0, water.centre[1]);
  inner.frustumCulled = false;

  const outer = new THREE.Mesh(outerSheetGeometry(water.domainSize / 2, OUTER_HALF_SIZE, water.centre), outerMaterial);
  outer.frustumCulled = false;

  return {
    inner,
    outer,
    uniforms,
    cavityMaterial,
    /** The inner patch's quads per side. */
    get meshSegments() { return segments; },
    /** Its vertex spacing (m): the cavity's dip margins by it. */
    get cell() { return water.domainSize / segments; },
    /** Its triangles. */
    get triangles() { return 2 * segments * segments; },
    /** Rebuild the inner patch with this many quads per side. */
    setMeshSegments(count) {
      if (count === segments) return;
      inner.geometry.dispose();
      inner.geometry = innerPatchGeometry(water, count);
      segments = count;
      uniforms.uMeshCell.value = water.domainSize / count;
    },
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
    /** mirrorRect: where the splash is drawn in the mirror image (its pixels: x, y, width, height; 0 wide when nowhere). */
    update({ underTarget, reflectionTarget, reflectionMatrix, mirrorRect = null, stonesUnder = false, resolution, camera }) {
      uniforms.uStonesUnder.value = stonesUnder ? 1 : 0;
      uniforms.uReflection.value = reflectionTarget.texture;
      uniforms.uReflectionMatrix.value.copy(reflectionMatrix);
      const width = reflectionTarget.width, height = reflectionTarget.height;
      uniforms.uMirrorSize.value.set(width, height);
      if (mirrorRect && mirrorRect.z > 0) uniforms.uMirrorNear.value.set(mirrorRect.x / width, mirrorRect.y / height, (mirrorRect.x + mirrorRect.z) / width, (mirrorRect.y + mirrorRect.w) / height);
      else uniforms.uMirrorNear.value.set(1, 1, 0, 0);
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
