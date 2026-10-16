// The water surface: an inner patch that follows the simulated height field and
// a flat outer sheet to the horizon, drawn with one shader. The ambient wind
// waves (src/ambientWaves.js) and the rings that cross the pond
// (src/rings.js) ride on both: they displace the inner patch with the
// splash's waves and shade all the water (WATER_VERTEX and WATER_FRAGMENT say
// how). The sheet reaches OUTER_HALF_SIZE metres from the patch's centre,
// so seen from the shore view's eye (1.15 m up) its edge is 0.007° below the
// horizon, and from the high view's (2.4 m) 0.015°, and the water meets the
// sky dome's horizon with no strip of the photo's own ground between them
// (the dome's box reaches 10 km).
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
// Seen from under the water (src/main.js's Under view), the same meshes draw
// with WATER_UNDER_FRAGMENT (the sky through Snell's window, the water
// mirrored past it), their back faces, and a cavity with its CAVITY_MESH
// variant: fromBelow(true) swaps the patch's and the sheet's materials, and
// cavityUnderMaterial is the cavities'; fromBelow(false) puts them back. The
// patch keeps no dip under a cavity from below: the hole hangs in front of
// it.
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
import { WATER_VERTEX, WATER_FRAGMENT, WATER_UNDER_FRAGMENT } from './shaders/scene.js';

const OUTER_HALF_SIZE = 9000;
const OUTER_GROWTH = 1.25;   // each of the outer sheet's square rings this many times the last's half size...
const OUTER_CUTS = 8;        // ...and each of its sides cut into this many quads
export const MAX_CAVITIES = 4;   // the inner patch dips under at most this many cavities at once

/**
 * The outer sheet, in the XZ plane: square rings around the inner patch,
 * each OUTER_GROWTH times the last's half size, out to outerHalf, each side
 * of each ring cut into OUTER_CUTS. Small triangles near the patch, not four
 * quads kilometres long: a camera turned to look along the patch's edge
 * (src/main.js) sees the sheet a metre or two away, where a huge
 * triangle's interpolated position is off by enough to move its reflection
 * and draw a seam along the edge.
 */
function outerSheetGeometry(innerHalf, outerHalf, centre) {
  const halves = [innerHalf];
  while (halves.at(-1) < outerHalf) halves.push(Math.min(halves.at(-1) * OUTER_GROWTH, outerHalf));
  const positions = [];
  const cx = centre[0], cz = centre[1];
  // A point of square ring `half` at `along` (0 to 1) of the way round it, counter-clockwise from (−half, −half) seen from above.
  const onRing = (half, along) => {
    const side = Math.min(Math.floor(along * 4), 3), share = along * 4 - side, offset = -half + 2 * half * share;
    const [x, z] = [[offset, -half], [half, offset], [-offset, half], [-half, -offset]][side];
    return [cx + x, 0, cz + z];
  };
  for (let ring = 0; ring < halves.length - 1; ring++) {
    for (let cut = 0; cut < 4 * OUTER_CUTS; cut++) {
      const start = cut / (4 * OUTER_CUTS), end = (cut + 1) / (4 * OUTER_CUTS);
      const innerStart = onRing(halves[ring], start), innerEnd = onRing(halves[ring], end);
      const outerStart = onRing(halves[ring + 1], start), outerEnd = onRing(halves[ring + 1], end);
      positions.push(...innerStart, ...innerEnd, ...outerStart, ...innerEnd, ...outerEnd, ...outerStart);   // facing up
    }
  }
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

export function createWaterSurface(water, lighting, ambientWaves, { meshSegments = Math.min(water.size, 512), rings = null, skyCube = null } = {}) {
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
    uExtinction: { value: lighting.extinction },
    uWaterColor: { value: lighting.waterColor },
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

  // From below (the header): the sky's cube shows through the window.
  const underUniforms = { ...uniforms, uSkyCube: { value: skyCube } };
  const underMaterial = (inner) => new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_UNDER_FRAGMENT,
    uniforms: inner ? underUniforms : { ...underUniforms, uInner: { value: 0 } },
    defines: { AMBIENT_LEVELS: ambientWaves.levels },
    side: THREE.BackSide,
  });
  const innerUnderMaterial = underMaterial(true);
  const outerUnderMaterial = underMaterial(false);
  const cavityUnderMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_UNDER_FRAGMENT,
    uniforms: underUniforms,
    defines: { AMBIENT_LEVELS: ambientWaves.levels, CAVITY_MESH: 1 },
    side: THREE.DoubleSide,
  });
  let aboveMaterial = innerMaterial;   // the patch's material from above, while fromBelow has swapped it

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
    cavityUnderMaterial,
    /** The bed the surface mirrors from below: the floor's uniforms (src/pondFloor.js), shared. */
    setBed(floorUniforms) {
      for (const name of ['uShore', 'uLand', 'uBank', 'uPattern', 'uAbsorb']) underUniforms[name] = floorUniforms[name];
    },
    /** Draw the patch and the sheet as seen from under the water (true), or from above again (false). */
    fromBelow(below) {
      if (below && inner.material !== innerUnderMaterial) {
        aboveMaterial = inner.material;
        inner.material = innerUnderMaterial;
        outer.material = outerUnderMaterial;
      } else if (!below && inner.material === innerUnderMaterial) {
        inner.material = aboveMaterial;
        outer.material = outerMaterial;
      }
    },
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
