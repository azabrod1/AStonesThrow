// A region of the mirror image redrawn (drawMirror in src/main.js) draws only what reaches into it: a game's sub-frustum
// cull. The splash's region is a small box of the reflection target, so most of the mirror's scenery is outside it and
// would cost a draw for nothing (a shore's boulders, a bird on the far side of the pond).
//
// frustumOfRegion is what the mirror's camera sees through the region: its projection cropped to it, a pixel wider each
// way than the scissor, so a mesh just at the edge is kept. keepMeshesToRegion hides each shown mesh whose bounding
// sphere misses that frustum and showRegionAgain shows them after the draw. The lagoon's palms keep to it their own way
// (src/tropics.js keepToRegion: instanced, a twin for each palm kept).
import * as THREE from 'three';

const crop = new THREE.Matrix4(), viewProjection = new THREE.Matrix4(), sphere = new THREE.Sphere();

/** What `camera` sees through `region` (x, y, width and height, in pixels of a target `width` × `height`), into `frustum`. */
export function frustumOfRegion(camera, region, width, height, frustum = new THREE.Frustum()) {
  const left = 2 * (region.x - 1) / width - 1, right = 2 * (region.x + region.z + 1) / width - 1;
  const bottom = 2 * (region.y - 1) / height - 1, top = 2 * (region.y + region.w + 1) / height - 1;
  crop.set(2 / (right - left), 0, 0, -(right + left) / (right - left), 0, 2 / (top - bottom), 0, -(top + bottom) / (top - bottom), 0, 0, 1, 0, 0, 0, 0, 1);
  return frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(crop, camera.projectionMatrix).multiply(camera.matrixWorldInverse));
}

/** Each shown mesh under `groups` whose bounding sphere does not reach into `frustum` hidden, and added to `hidden`. */
export function keepMeshesToRegion(frustum, groups, hidden) {
  for (const group of groups) {
    group.updateMatrixWorld();   // a bird moved this frame: where it is now, as the render will have it
    group.traverseVisible((mesh) => {
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (mesh.geometry.boundingSphere.radius < 0) return;   // no bounds yet (an empty geometry): left to the renderer
      if (frustum.intersectsSphere(sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld))) return;
      mesh.visible = false;
      hidden.push(mesh);
    });
  }
}

/** The meshes keepMeshesToRegion hid shown again. */
export function showRegionAgain(hidden) {
  for (const mesh of hidden) mesh.visible = true;
  hidden.length = 0;
}
