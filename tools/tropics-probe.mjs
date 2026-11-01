// Lagoon regression checks: front-facing land/husks, finite surface normals,
// camera round-trip instance restoration, and the distant scenery budget.
// The mesh construction and culling are CPU-only; shader appearance is checked
// with shoot.mjs and uniform-probe.mjs on the browser's GPU.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Tropics } from '../src/tropics.js';
import { lagoonLandGeometry, setShoreKind } from '../src/pondFloor.js';

setShoreKind('lagoon');
const land = lagoonLandGeometry();
const corner = new THREE.Vector3(), next = new THREE.Vector3(), last = new THREE.Vector3();
let landFaces = 0;
for (let index = 0; index < land.index.count; index += 3) {
  corner.fromBufferAttribute(land.attributes.position, land.index.getX(index));
  next.fromBufferAttribute(land.attributes.position, land.index.getX(index + 1)).sub(corner);
  last.fromBufferAttribute(land.attributes.position, land.index.getX(index + 2)).sub(corner);
  const normal = next.cross(last);
  if (normal.lengthSq() < 1e-16) continue;
  assert(normal.y > 0, 'land must face the eye above it');
  landFaces++;
}
console.log(`ok: ${landFaces} land triangles face up`);
land.dispose();

// Use the real build and cull, with GPU-only bakes replaced for this CPU probe.
const tropics = Object.assign(Object.create(Tropics.prototype), {
  above: [], group: new THREE.Group(), built: true, coarse: false, shown: true,
  mirrorLayer: 2, woodMaterial: new THREE.MeshStandardMaterial(), leafMaterial: new THREE.MeshStandardMaterial(),
  shadowTarget: { setSize() {} }, nearShadowTarget: { setSize() {} }, bakeShadows() {},
  bakedSun: new THREE.Vector3(), uniforms: { uSunDir: { value: new THREE.Vector3() } },
  culledFor: new THREE.Matrix4().makeScale(0, 0, 0), culledProjection: new THREE.Matrix4(),
  frustum: new THREE.Frustum(), viewProjection: new THREE.Matrix4(), sphere: new THREE.Sphere(),
});
const start = performance.now();
tropics.build();
console.log(`scenery built in ${(performance.now() - start).toFixed(1)} ms`);
let huskFaces = 0;
const supplied = new THREE.Vector3();
for (const mesh of tropics.above) {
  const geometry = mesh.geometry, { position, normal, palmRing } = geometry.attributes;
  assert([...position.array, ...normal.array].every(Number.isFinite), 'geometry must be finite');
  for (let index = 0; index < geometry.index.count; index += 3) {
    const vertices = [0, 1, 2].map((offset) => geometry.index.getX(index + offset));
    if (!vertices.every((vertex) => palmRing.getX(vertex) === -2)) continue;
    corner.fromBufferAttribute(position, vertices[0]);
    next.fromBufferAttribute(position, vertices[1]).sub(corner);
    last.fromBufferAttribute(position, vertices[2]).sub(corner);
    const face = next.cross(last);
    if (face.lengthSq() < 1e-16) continue;
    supplied.fromBufferAttribute(normal, vertices[0]);
    assert(face.dot(supplied) > 0, 'husk winding must agree with its outward shading normal');
    huskFaces++;
  }
}
assert(huskFaces > 1000);
console.log(`ok: ${huskFaces} coconut faces have outward, smooth normals`);

const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 20000);
camera.position.set(0, 1.8, 2.45);
let homeTriangles = 0;
for (const [index, direction] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0, -1]].entries()) {
  camera.lookAt(direction[0] * 100, 1.8, direction[1] * 100);
  camera.updateMatrixWorld();
  tropics.cull(camera);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let triangles = 0;
  for (const mesh of tropics.above) {
    const { matrices, numbers, spheres } = mesh.userData.whole;
    let kept = 0;
    for (let instance = 0; instance < spheres.length / 4; instance++) {
      const sphere = new THREE.Sphere(new THREE.Vector3(...spheres.slice(instance * 4, instance * 4 + 3)), spheres[instance * 4 + 3]);
      let seen = frustum.intersectsSphere(sphere);
      sphere.center.y *= -1;
      seen ||= frustum.intersectsSphere(sphere);
      if (!seen) continue;
      assert.deepEqual(mesh.instanceMatrix.array.slice(kept * 16, kept * 16 + 16), matrices.slice(instance * 16, instance * 16 + 16), `view ${index}: instance matrix restored`);
      assert.deepEqual(mesh.geometry.attributes.palmInstance.array.slice(kept * 4, kept * 4 + 4), numbers.slice(instance * 4, instance * 4 + 4), `view ${index}: instance attributes restored`);
      kept++;
    }
    assert.equal(mesh.count, kept);
    triangles += mesh.count * mesh.geometry.index.count / 3;
  }
  if (index === 0) homeTriangles = triangles;
  if (index === 4) assert.equal(triangles, homeTriangles);
}
assert(homeTriangles < 350000, `visible scenery budget: ${homeTriangles}`);
console.log(`ok: five camera views restore every instance; home scenery ${homeTriangles} triangles`);
tropics.setCoarse(true);
assert(tropics.above.every((mesh) => mesh.geometry.attributes.position.array.every(Number.isFinite)));
console.log('ok: Low builds finite geometry');
