// Lagoon regression checks: front-facing land, foliage and husks, finite normals,
// camera round-trip instance restoration, and the distant scenery budget.
// The mesh construction and culling are CPU-only; shader appearance is checked
// with shoot.mjs and uniform-probe.mjs on the browser's GPU.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Tropics, PALMS, LODS, palmCullMargin } from '../src/tropics.js';
import { LAND_VERTEX, PALM_FOOT } from '../src/shaders/scene.js';
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
let foliageFaces = 0;
for (const mesh of tropics.above) {
  const geometry = mesh.geometry, { position, normal, palmRing } = geometry.attributes;
  assert([...position.array, ...normal.array].every(Number.isFinite), 'geometry must be finite');
  const foliage = tropics.scrubGeometry.includes(geometry)
    || tropics.palmGeometry.some((levels) => levels.some((shape) => shape.leaves === geometry || shape.wood === geometry));
  for (let index = 0; index < geometry.index.count; index += 3) {
    const vertices = [0, 1, 2].map((offset) => geometry.index.getX(index + offset));
    if (!foliage || vertices.some((vertex) => palmRing.getX(vertex) !== -1)) continue;
    corner.fromBufferAttribute(position, vertices[0]);
    next.fromBufferAttribute(position, vertices[1]).sub(corner);
    last.fromBufferAttribute(position, vertices[2]).sub(corner);
    const face = next.cross(last);
    if (face.lengthSq() < 1e-16) continue;
    supplied.set(0, 0, 0);
    for (const vertex of vertices) supplied.add(new THREE.Vector3().fromBufferAttribute(normal, vertex));
    assert(face.dot(supplied) > 0, `foliage mesh ${tropics.above.indexOf(mesh)} triangle ${index / 3} must face its shading normals`);
    foliageFaces++;
  }
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
assert(foliageFaces > 1000);
console.log(`ok: ${foliageFaces} foliage faces agree with their shading normals`);

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
    const kept = [];
    const whole = mesh.userData.whole;
    for (let instance = 0; instance < spheres.length / 4; instance++) {
      const sphere = new THREE.Sphere(new THREE.Vector3(...spheres.slice(instance * 4, instance * 4 + 3)), spheres[instance * 4 + 3]);
      let seen = frustum.intersectsSphere(sphere);
      sphere.center.y *= -1;
      seen ||= frustum.intersectsSphere(sphere);
      if (!seen) continue;
      const scale = Math.hypot(...matrices.slice(instance * 16, instance * 16 + 3));
      const centre = new THREE.Vector3(...spheres.slice(instance * 4, instance * 4 + 3));
      const mirrored = centre.clone(); mirrored.y *= -1;
      const equivalent = Math.min(centre.distanceTo(camera.position), mirrored.distanceTo(camera.position)) / scale * whole.referenceRadius / whole.radius;
      const level = Math.min(LODS.findLastIndex((lod) => equivalent >= lod.from), whole.levels - 1);
      if (whole.level !== null && level !== whole.level) continue;
      kept.push(instance);
    }
    const distance = (instance) => new THREE.Vector3(...spheres.slice(instance * 4, instance * 4 + 3)).distanceTo(camera.position);
    kept.sort((one, other) => distance(one) - distance(other) || one - other);
    for (const [slot, instance] of kept.entries()) {
      assert.deepEqual(mesh.instanceMatrix.array.slice(slot * 16, slot * 16 + 16), matrices.slice(instance * 16, instance * 16 + 16), `view ${index}: instance matrix restored`);
      assert.deepEqual(mesh.geometry.attributes.palmInstance.array.slice(slot * 4, slot * 4 + 4), numbers.slice(instance * 4, instance * 4 + 4), `view ${index}: instance attributes restored`);
    }
    assert.equal(mesh.count, kept.length);
    triangles += mesh.count * mesh.geometry.index.count / 3;
  }
  if (index === 0) homeTriangles = triangles;
  if (index === 4) assert.equal(triangles, homeTriangles);
}
assert(homeTriangles < 350000, `visible scenery budget: ${homeTriangles}`);
console.log(`ok: five camera views restore every instance; home scenery ${homeTriangles} triangles`);
// Small camera moves that keep the same packed set upload no buffers.
const versions = tropics.above.map((mesh) => [mesh.instanceMatrix.version, mesh.geometry.attributes.palmInstance.version]);
camera.position.x += 1e-5;
camera.updateMatrixWorld();
tropics.cull(camera);
assert.deepEqual(tropics.above.map((mesh) => [mesh.instanceMatrix.version, mesh.geometry.attributes.palmInstance.version]), versions);
console.log('ok: unchanged visible sets do not upload instance buffers');

// Quality changes route instances into existing meshes and leave masks alone.
const meshes = tropics.above.slice(), placements = tropics.placed;
const geometry = meshes.map((mesh) => mesh.geometry);
let bakes = 0;
tropics.bakeShadows = () => { bakes++; };
tropics.setCoarse(true);
tropics.cull(camera);
assert.deepEqual(tropics.above, meshes);
assert.deepEqual(tropics.above.map((mesh) => mesh.geometry), geometry);
assert.equal(tropics.placed, placements);
assert.equal(bakes, 0);
const coarseTriangles = meshes.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0);
assert(coarseTriangles < homeTriangles, 'coarse quality must reduce visible geometry');
assert(tropics.above.every((mesh) => mesh.geometry.attributes.position.array.every(Number.isFinite)));
tropics.shown = false;
tropics.setCoarse(false);
assert.equal(tropics.placed, placements);
tropics.shown = true;
console.log(`ok: quality changes reuse geometry, placements and masks; coarse scenery ${coarseTriangles} triangles`);

// Zoom increases detail; all LODs retain the same form and matching curve endpoints.
const distant = { x: 0, y: 8, z: -150, scale: 1, radius: 9, referenceRadius: 9 };
assert.equal(tropics.levelOf(distant, camera), 2);
camera.fov = 12;
assert.equal(tropics.levelOf(distant, camera), 0);
for (const shapes of tropics.palmGeometry) {
  for (const shape of shapes.slice(1)) {
    assert(shape.top.distanceTo(shapes[0].top) < 1e-12);
    for (const frond of shape.fronds) assert.deepEqual(frond, shapes[0].fronds.find((one) => one.index === frond.index));
    assert.deepEqual(shape.coconuts, shapes[0].coconuts.slice(0, shape.coconuts.length));
    assert.equal(shape.deadFronds, shapes[0].deadFronds);
  }
  assert(shapes[2].fronds.every((frond) => shapes[1].fronds.some((one) => one.index === frond.index)));
}
console.log('ok: zoom selects finer LODs; nested fronds, crown endpoints and coconuts keep their form');

// Real crown vertices remain within the culling sphere at peak gale lean
// and flutter, in 32 wind directions and both flutter extremes.
let windVertices = 0;
for (const [variantIndex, shapes] of tropics.palmGeometry.entries()) {
  const height = PALMS[variantIndex].height;
  const sway = 4 * (0.025 + 0.012), margin = palmCullMargin(height);
  for (const { leaves } of shapes) {
    const p = leaves.attributes.position, weights = leaves.attributes.palmSway, bound = leaves.boundingSphere;
    for (let index = 0; index < p.count; index++) {
      for (let direction = 0; direction < 32; direction++) {
        const angle = direction * Math.PI / 16;
        for (const sign of [-1, 1]) {
          const flutter = sign * weights.getY(index) * 4 * 0.06;
          const along = sway * height * weights.getX(index) + 0.4 * flutter;
          const x = p.getX(index) + Math.cos(angle) * along - bound.center.x;
          const y = p.getY(index) - 0.5 * sway * sway * height * weights.getX(index) + flutter - bound.center.y;
          const z = p.getZ(index) + Math.sin(angle) * along - bound.center.z;
          assert(Math.hypot(x, y, z) <= bound.radius + margin + 1e-5, 'peak gale vertex must stay in cull bound');
        }
      }
      windVertices++;
    }
  }
}
console.log(`ok: ${windVertices} crown vertices stay within gale cull margins`);

// Execute the shader's declared cell range on the real encoded foot grid,
// comparing against a brute-force nearest-foot search across cell boundaries.
{
  const lookup = LAND_VERTEX.split('float palmFoot(')[1].split('float palmBankRise(')[0];
  const low = Number(lookup.match(/for \(int column = (-?\d+)/)[1]);
  const high = Number(lookup.match(/column <= (-?\d+)/)[1]);
  const shift = lookup.includes('floor(cellPoint - 0.5)') ? -0.5 : 0;
  const { texture, box, cells } = tropics.feet, data = texture.image.data;
  const feet = [];
  for (let row = 0; row < cells[1]; row++) for (let column = 0; column < cells[0]; column++) {
    const at = (row * cells[0] + column) * 4;
    if (data[at + 3] < 128) continue;
    feet.push({ x: box[0] + (column + data[at] / 255) / box[2], z: box[1] + (row + data[at + 1] / 255) / box[2], radius: data[at + 2] / 255 * PALM_FOOT.widest });
  }
  let samples = 0;
  for (const foot of feet.slice(0, 80)) for (const offset of [-1.4, -1.26, -1.1, 0, 1.1, 1.26, 1.4]) {
    const x = foot.x + offset, z = foot.z + 0.17;
    const reference = Math.min(...feet.map((one) => Math.hypot(x - one.x, z - one.z) - one.radius));
    if (reference >= PALM_FOOT.reach) continue;
    const baseX = Math.floor((x - box[0]) * box[2] + shift), baseZ = Math.floor((z - box[1]) * box[2] + shift);
    let nearest = Infinity;
    for (let dx = low; dx <= high; dx++) for (let dz = low; dz <= high; dz++) {
      const column = baseX + dx, row = baseZ + dz;
      if (column < 0 || row < 0 || column >= cells[0] || row >= cells[1]) continue;
      const at = (row * cells[0] + column) * 4;
      if (data[at + 3] < 128) continue;
      const px = box[0] + (column + data[at] / 255) / box[2], pz = box[1] + (row + data[at + 1] / 255) / box[2];
      nearest = Math.min(nearest, Math.hypot(x - px, z - pz) - data[at + 2] / 255 * PALM_FOOT.widest);
    }
    assert(Math.abs(nearest - reference) < 1e-9, 'foot influence must remain continuous across grid cells');
    samples++;
  }
  assert(samples > 100);
  console.log(`ok: ${samples} foot-grid boundary samples match a full nearest-foot search`);
}

// Image decoding receives typed JPEG bytes, even when fetch has no MIME type.
{
  const fetch = globalThis.fetch, decode = globalThis.createImageBitmap;
  const types = [];
  globalThis.fetch = async () => new Response(new Uint8Array([255, 216, 255, 217]));
  globalThis.createImageBitmap = async (blob) => { types.push(blob.type); assert.equal(blob.size, 4); return { width: 1, height: 1 }; };
  try {
    let invalidations = 0;
    const receiver = { renderer: { capabilities: { getMaxAnisotropy: () => 4 } }, uniforms: { uBarkScan: { value: null }, uBarkScanOn: { value: 0 } }, onSurfacesChanged: () => { invalidations++; } };
    await Tropics.prototype.loadSurfaces.call(receiver);
    assert.deepEqual(types, ['image/jpeg', 'image/jpeg']);
    assert.equal(receiver.uniforms.uBarkScanOn.value, 1);
    assert.equal(invalidations, 2, 'each loaded scan must invalidate the cached reflection');
  } finally { globalThis.fetch = fetch; globalThis.createImageBitmap = decode; }
  console.log('ok: both scans pass explicit JPEG MIME types to image decoding');
}
