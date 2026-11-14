// Lagoon regression checks: front-facing land, foliage and husks, finite normals,
// camera round-trip instance restoration, and the distant scenery budget.
// The mesh construction and culling are CPU-only; shader appearance is checked
// with shoot.mjs and uniform-probe.mjs on the browser's GPU.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Tropics, PALMS, LODS, MOTUS, NEAR_SHADOW, SHADOW, palmCullMargin, palmGeometry } from '../src/tropics.js';
import { LAND_VERTEX, PALM_FOOT } from '../src/shaders/scene.js';
import { lagoonLandGeometry, setShoreKind } from '../src/pondFloor.js';
import { frustumOfRegion } from '../src/mirrorRegion.js';

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
  regionCrop: new THREE.Matrix4(), regionViewProjection: new THREE.Matrix4(), regionFrustum: new THREE.Frustum(), regionHidden: [], regionShown: [],
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

// Unbuilt, the lagoon is its constructor's one stand-in palm on the near motu, 33° off the home view's line, which
// the warm-up draws to build the leaves' and wood's programs under the veil (src/main.js warmUp). An upright
// phone's shore view is about ±15° wide; cull leaves the stand-in whole, so even that frame draws it.
{
  const unbuilt = Object.assign(Object.create(Tropics.prototype), {
    above: [], group: new THREE.Group(), built: false, coarse: false, shown: false,
    mirrorLayer: 2, woodMaterial: new THREE.MeshStandardMaterial(), leafMaterial: new THREE.MeshStandardMaterial(),
    bakeShadows() {}, bakedSun: new THREE.Vector3(), uniforms: { uSunDir: { value: new THREE.Vector3() } },
    culledFor: new THREE.Matrix4().makeScale(0, 0, 0), culledProjection: new THREE.Matrix4(),
    frustum: new THREE.Frustum(), viewProjection: new THREE.Matrix4(), sphere: new THREE.Sphere(),
  });
  const { leaves, wood, top } = palmGeometry(PALMS[0], LODS[2], 0);
  const bearing = THREE.MathUtils.degToRad(MOTUS[0].bearing);
  const standIn = [{ x: Math.sin(bearing) * MOTUS[0].distance, y: 1.1, z: 2.45 - Math.cos(bearing) * MOTUS[0].distance, yaw: 0, scale: 1, phase: 0 }];
  unbuilt.instances(leaves, unbuilt.leafMaterial, standIn, () => [PALMS[0].height, 0, top.y, 0]);
  unbuilt.instances(wood, unbuilt.woodMaterial, standIn, () => [PALMS[0].height, 0, top.y, 0]);
  unbuilt.setVisible(true, { building: false });   // as the warm-up does
  const portrait = new THREE.PerspectiveCamera(62, 390 / 844, 0.1, 20000);
  portrait.position.set(0, 1.8, 2.45);
  portrait.lookAt(0, 1.8, -100);
  portrait.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(portrait.projectionMatrix, portrait.matrixWorldInverse));
  const [x, y, z, radius] = unbuilt.above[0].userData.whole.spheres;
  assert(!frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(x, y, z), radius)), 'the stand-in must lie outside the portrait frame for this check to mean anything');
  unbuilt.cull(portrait);
  assert(unbuilt.above.length === 2 && unbuilt.above.every((mesh) => mesh.visible && mesh.count === 1), 'unbuilt, the stand-in must stay drawn in any frame, so the warm-up builds its programs');
  // And the shadow bake the constructor makes draws it into both masks, though it stands in neither's box: so the masks'
  // programs are built on it too.
  const drawnInto = [];
  Object.assign(unbuilt, {
    renderer: {
      getRenderTarget: () => null, getClearColor: (color) => color, getClearAlpha: () => 1, setClearColor() {}, clear() {},
      setRenderTarget(target) { if (target) drawnInto.push([]); },
      render(group) { group.traverseVisible((mesh) => { if (mesh.isInstancedMesh && mesh.count > 0) drawnInto.at(-1).push(mesh.material); }); },
    },
    shadowTarget: {}, nearShadowTarget: {}, shadowCamera: new THREE.OrthographicCamera(),
    shadowMaterials: { leaves: new THREE.MeshBasicMaterial(), wood: new THREE.MeshBasicMaterial() },
  });
  Tropics.prototype.bakeShadows.call(unbuilt);
  assert(drawnInto.length === 2 && drawnInto.every((materials) => materials.includes(unbuilt.shadowMaterials.leaves) && materials.includes(unbuilt.shadowMaterials.wood)),
    'unbuilt, a shadow bake must draw the stand-in into both masks, so the warm-up builds their programs');
  console.log('ok: unbuilt, the stand-in palm stays drawn outside an upright phone\'s frame and in both shadow masks, so the warm-up builds its programs');
}

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
// A cull tests each placement once (and its mirror image), however many meshes stand at it (a palm's three levels,
// leaves and wood), and uploads only the filled front of a changed buffer, a level's matrices once for its leaves and wood.
{
  const { palms, scrub, fallen } = tropics.placed;
  const placements = palms.length + scrub.length + fallen.length + 2;   // and the motus' sand and the high island
  const intersectsSphere = tropics.frustum.intersectsSphere;
  let tests = 0;
  tropics.frustum.intersectsSphere = function (sphere) { tests++; return intersectsSphere.call(this, sphere); };
  const before = tropics.above.map((mesh) => mesh.instanceMatrix.version);
  camera.position.x += 0.5;
  camera.updateMatrixWorld();
  tropics.cull(camera);
  delete tropics.frustum.intersectsSphere;
  assert(tests > placements && tests <= 2 * placements, `a cull makes ${tests} sphere tests for ${placements} placements`);
  let uploaded = 0;
  for (const [index, mesh] of tropics.above.entries()) {
    if (mesh.instanceMatrix.version === before[index]) continue;
    uploaded++;
    for (const [attribute, size] of [[mesh.instanceMatrix, 16], [mesh.geometry.attributes.palmInstance, 4]]) {
      assert.deepEqual(attribute.updateRanges.map(({ start, count }) => [start, count]), [[0, mesh.count * size]], `mesh ${index}: only its ${mesh.count} drawn instances are uploaded`);
    }
  }
  assert(uploaded > 0);
  const levelPairs = tropics.palmGeometry.flatMap((levels) => levels.map(({ leaves, wood }) => [leaves, wood].map((geometry) => tropics.above.find((mesh) => mesh.geometry === geometry))));
  assert(levelPairs.every(([leaves, wood]) => leaves.instanceMatrix === wood.instanceMatrix), 'a palm level\'s leaves and wood share one matrix buffer');
  camera.position.x -= 0.5;
  camera.updateMatrixWorld();
  tropics.cull(camera);
  console.log(`ok: a cull makes ${tests} sphere tests for ${placements} placements (${tropics.above.length} meshes) and uploads only what it draws`);
}

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

// A redraw of a region of the mirror image (src/main.js drawMirror: a splash's image, or a floater's, each frame it
// moves) draws, of the instances cull keeps, only those whose spheres reach into what the mirror camera sees through
// the region, in cull's order: nothing inside the scissor changes, and the vertex work is a fraction of a whole redraw.
{
  camera.lookAt(0, 1.8, -100);
  camera.updateMatrixWorld();
  tropics.cull(camera);
  const mirror = camera.clone();
  mirror.position.y = -camera.position.y;
  mirror.up.set(0, -1, 0);
  mirror.lookAt(0, -1.8, -100);
  mirror.updateMatrixWorld();
  const [width, height] = [960, 540];
  const region = new THREE.Vector4(300, 60, 220, 150);   // a splash's size, low and left of the middle (the camera is upside down: above the horizon)
  const drawn = () => tropics.group.children.filter((mesh) => mesh.visible && mesh.count > 0 && mesh.layers.isEnabled(2));
  const triangles = (meshes) => meshes.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0);
  const whole = drawn(), wholeTriangles = triangles(whole);
  tropics.keepToRegion(frustumOfRegion(mirror, region, width, height));
  const kept = drawn();
  // Whether a sphere is seen through the region: a ray from the mirror camera through one of the region's pixels (every
  // fourth each way, and its edges) meets it.
  const rays = [];
  const columns = [...Array(Math.floor(region.z / 4) + 1).keys()].map((step) => region.x + 4 * step).concat(region.x + region.z);
  const rows = [...Array(Math.floor(region.w / 4) + 1).keys()].map((step) => region.y + 4 * step).concat(region.y + region.w);
  for (const x of columns) for (const y of rows) rays.push(new THREE.Vector3(2 * x / width - 1, 2 * y / height - 1, 0.5).unproject(mirror).sub(mirror.position).normalize());
  const sphere = new THREE.Sphere(), toCentre = new THREE.Vector3();
  const reaches = (center, radius) => {
    toCentre.subVectors(center, mirror.position);
    return rays.some((ray) => {
      const along = toCentre.dot(ray);
      return along > 0 && toCentre.lengthSq() - along * along <= radius * radius;
    });
  };
  let leftOut = 0;
  for (const mesh of whole) {
    const { kept: indices, spheres } = mesh.userData.whole;
    const drawnHere = kept.includes(mesh) ? indices
      : kept.filter((twin) => twin.geometry.index === mesh.geometry.index && twin.material === mesh.material && !tropics.above.includes(twin)).flatMap((twin) => twin.userData.whole.kept);
    for (const index of indices) {
      sphere.center.fromArray(spheres, index * 4);
      sphere.radius = spheres[index * 4 + 3];
      if (drawnHere.includes(index)) continue;
      assert(!reaches(sphere.center, sphere.radius), 'an instance left out of the region\'s redraw must lie outside it');
      leftOut++;
    }
    assert.deepEqual(drawnHere, indices.filter((index) => drawnHere.includes(index)), 'the region keeps cull\'s order');
  }
  for (const twin of kept.filter((mesh) => !tropics.above.includes(mesh))) {
    for (const [slot, index] of twin.userData.whole.kept.entries()) {
      assert.deepEqual(twin.instanceMatrix.array.slice(slot * 16, slot * 16 + 16), tropics.above.find((mesh) => mesh.geometry.index === twin.geometry.index).userData.whole.matrices.slice(index * 16, index * 16 + 16), 'a twin draws its mesh\'s instances');
    }
    assert(!twin.layers.isEnabled(0), 'a twin is drawn in the mirror only');
  }
  assert(leftOut > 0 && kept.some((mesh) => !tropics.above.includes(mesh)), 'the region leaves some instances out and draws some meshes in part');
  const keptTriangles = triangles(kept);
  tropics.endRegion();
  assert.deepEqual(drawn(), whole, 'endRegion puts every mesh back as cull left it');
  assert(tropics.group.children.every((mesh) => tropics.above.includes(mesh) || !mesh.visible), 'and hides the twins');
  assert(keptTriangles < 0.3 * wholeTriangles, `a splash's region redraws ${keptTriangles} of the scenery's ${wholeTriangles} triangles`);
  console.log(`ok: a splash's region of the mirror redraws ${keptTriangles} of the scenery's ${wholeTriangles} triangles, every instance it leaves out outside it`);
}

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

// A shadow bake draws into each mask only the instances whose shadow can fall in its box: none left out has a point
// whose shadow lands in it (every fourth vertex, unswayed, carried along the sun as SHADOW_VERTEX carries it), and
// the near mask's pass is a small part of what every caster would be. Every mesh is whole again after.
{
  const passes = [];
  const sun = new THREE.Vector3(-0.9, 0.17, 0.4).normalize();   // a low sun: the longest shadows
  Object.assign(tropics, {
    renderer: {
      getRenderTarget: () => null, getClearColor: (color) => color, getClearAlpha: () => 1, setClearColor() {}, clear() {},
      setRenderTarget(target) { if (target) passes.push({ box: target.box, drawn: new Map() }); },
      render(group) { group.traverseVisible((mesh) => { if (mesh.isInstancedMesh) passes.at(-1).drawn.set(mesh, mesh.instanceMatrix.array.slice(0, mesh.count * 16)); }); },
    },
    shadowTarget: { box: SHADOW.box }, nearShadowTarget: { box: NEAR_SHADOW.box },
    shadowMaterials: { leaves: new THREE.MeshBasicMaterial(), wood: new THREE.MeshBasicMaterial() }, shadowCamera: new THREE.OrthographicCamera(),
  });
  tropics.uniforms.uSunDir.value.copy(sun);
  Tropics.prototype.bakeShadows.call(tropics);
  assert.equal(passes.length, 2);
  const casters = tropics.above.filter((mesh) => mesh.userData.whole.casts);
  const every = casters.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0);
  const point = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const triangles = [];
  for (const { box: [minX, minZ, sizeX, sizeZ], drawn } of passes) {
    let passTriangles = 0;
    for (const mesh of casters) {
      const { whole } = mesh.userData, packedMatrices = drawn.get(mesh) ?? new Float32Array(0), count = packedMatrices.length / 16;
      passTriangles += count * mesh.geometry.index.count / 3;
      const where = (matrices, index) => `${matrices[index * 16 + 12]},${matrices[index * 16 + 13]},${matrices[index * 16 + 14]}`;
      const packedAt = new Set(Array.from({ length: count }, (unused, slot) => where(packedMatrices, slot)));
      const packed = new Set([...Array(whole.numbers.length / 4).keys()].filter((index) => packedAt.has(where(whole.matrices, index))));
      assert.equal(packed.size, count, 'each instance drawn into a mask once');
      const position = mesh.geometry.attributes.position;
      for (let index = 0; index < whole.numbers.length / 4; index++) {
        if (packed.has(index)) continue;
        matrix.fromArray(whole.matrices, index * 16);
        for (let vertex = 0; vertex < position.count; vertex += 4) {
          point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
          const x = point.x - sun.x * point.y / Math.max(sun.y, 0.05), z = point.z - sun.z * point.y / Math.max(sun.y, 0.05);
          assert(!(x >= minX && x <= minX + sizeX && z >= minZ && z <= minZ + sizeZ), 'an instance whose shadow falls in a mask must be drawn into it');
        }
      }
    }
    triangles.push(passTriangles);
  }
  assert(triangles[0] < every && triangles[1] < 0.15 * every, `a bake draws ${triangles.join(' and ')} of the casters' ${every} triangles into its masks`);
  assert(tropics.above.every((mesh) => mesh.visible && mesh.count === mesh.userData.whole.numbers.length / 4
    && mesh.instanceMatrix.array.every((value, at) => value === mesh.userData.whole.matrices[at])), 'after a bake every mesh holds every instance');
  console.log(`ok: a bake under a low sun draws ${triangles[0]} and ${triangles[1]} of the casters' ${every} triangles into the beach's and the near mask, and no shadow that falls in either is left out`);
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
