// A region of the mirror image redrawn (drawMirror in src/main.js) draws only what reaches into it: a game's sub-frustum
// cull. The splash's region is a small box of the reflection target, so most of the mirror's scenery is outside it and
// would cost a draw for nothing (a shore's boulders, a bird on the far side of the pond).
//
// frustumOfRegion is what the mirror's camera sees through the region: its projection cropped to it, a pixel wider each
// way than the scissor, so a mesh just at the edge is kept. keepMeshesToRegion hides each shown mesh whose bounding
// sphere misses that frustum and showRegionAgain shows them after the draw. The lagoon's palms keep to it their own way
// (src/tropics.js keepToRegion: instanced, a twin for each palm kept).
//
// refreshMipsInRegion remakes the target's mip levels over the region alone. three.js would remake the whole chain
// after the region's render (generateMipmap), reading and writing every texel of the target each frame a bird moves
// in it, where only the region changed: instead each level is made from the one above it over the region's
// footprint (a pixel wider each way, so a level's texels that take in any changed one are remade), by a blit at
// exactly half size with linear filtering, which samples the corner shared by each 2 × 2 block: their mean, a box
// filter, as generateMipmap's. (An odd-sized level's last row or column, which a driver may fold three texels into,
// is left as the whole chain last made it; that differs by a fraction of a texel's colour, at most.)
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

let readBuffer = null, drawBuffer = null, buffersOf = null;
/** `target`'s mip levels below its first remade over `region` (x, y, width and height, in pixels of level 0), from level 0. */
export function refreshMipsInRegion(renderer, target, region) {
  const gl = renderer.getContext(), state = renderer.state;
  if (buffersOf !== gl) { readBuffer = gl.createFramebuffer(); drawBuffer = gl.createFramebuffer(); buffersOf = gl; }
  const texture = renderer.properties.get(target.texture).__webglTexture;
  if (!texture) return;
  renderer.setRenderTarget(null);   // three's own framebuffer, viewport and scissor (off) state, settled before the blits
  state.setScissorTest(false);
  state.bindFramebuffer(gl.READ_FRAMEBUFFER, readBuffer);
  state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawBuffer);
  let width = target.width, height = target.height;
  let x0 = region.x, y0 = region.y, x1 = region.x + region.z, y1 = region.y + region.w;
  const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
  for (let level = 1; level < levels; level++) {
    const levelWidth = Math.max(1, width >> 1), levelHeight = Math.max(1, height >> 1);
    // This level's texels whose 2 × 2 block above takes in the changed region, a texel more each way.
    x0 = Math.max(0, Math.floor(x0 / 2) - 1); y0 = Math.max(0, Math.floor(y0 / 2) - 1);
    x1 = Math.min(levelWidth, Math.ceil(x1 / 2) + 1); y1 = Math.min(levelHeight, Math.ceil(y1 / 2) + 1);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, level - 1);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, level);
    // A level 1 texel across (a dimension already 1 texel) is made from as many as the level above has.
    const fromX1 = width === 1 ? 1 : 2 * x1, fromY1 = height === 1 ? 1 : 2 * y1;
    gl.blitFramebuffer(width === 1 ? 0 : 2 * x0, height === 1 ? 0 : 2 * y0, fromX1, fromY1, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    width = levelWidth; height = levelHeight;
  }
  gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
  state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}
