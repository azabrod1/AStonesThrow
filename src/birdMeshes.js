// The birds drawn as models (src/birds.js flies them, src/birdRig.js poses
// their skeletons): each kind a 3D model shaped and painted from photographs
// of the real bird (tools/bird-models.py writes its pictures and shape,
// assets/birds/<kind>-model.webp and models.json; the photographs are credited
// there and under the Birds setting), so its wings beat and it turns, banks
// and glides as a bird does, seen from any side. The kinds with a model are
// MODELLED_KINDS (each with its flight, src/birdRig.js FLIGHT); src/main.js
// draws the rest as pictures (src/birdSprites.js) until each has one. A
// model is drawn in flight only, for now.
//
// A kind's model (buildModel), metres, its bill along +x, up +y, its right
// wing out along +z:
//   - the body: lofted from its side-on outline (models.json `body`: the
//     outline's top and bottom at stations from the tail's tip to the bill's),
//     each station a ring as deep as the outline there and `WIDTH`'s share of
//     that wide (rounder at the breast, narrower at the head, flat at the
//     tail), painted from the side-on photograph projected across it (each
//     side the same picture), so side on it is the photograph;
//   - the wings: each a sheet over the flattened wing's outline (`wing`: its
//     leading and trailing edges along the span), painted from below with the
//     photograph's underwing and from above with its upper side (gl_FrontFacing
//     says which is seen), cut to the photo's outline in alpha (the primaries'
//     slots, the trailing edge's feathers) and cambered a little; out from the
//     body, skinned to the shoulder, then the elbow, then the wrist (blended
//     across each joint), so the rig (src/birdRig.js) beats and folds them;
//   - the tail: a fan under the body's tail, spread a little wider than the
//     body, painted with the tail's colour, skinned to the tail joint.
// Each vertex carries its joints (`joints`: two, `jointBlend` the second's
// share) and its part (`part`: body, wing, tail), and its place on its
// part's picture (uv, 0 to 1 over the part's rect); the parts' rects in the
// kind's image are uniforms (uRects).
//
// Lit as the scene is (src/main.js `lighting`): the photograph's colours
// taken as the bird's under a bright sky, times the sky's light (more on what
// faces up) and the sun's on what faces it (a wing's sheet lit from either
// side, the sun glowing a little through it), written as radiance. Three
// meshes a bird, one draw each: `above` in the main scene, `mirror` on the
// mirror's layer (its distance in alpha, as src/boulders.js writes it),
// which src/main.js draws again only while a bird in its view moves
// (mirrorBounds), and `below`, kept empty for a flying bird.
// Every bird of a kind shares its geometry and its image; each bird its own
// joints (uJoints). Every kind is the same three programs (above, mirror,
// below), built under the veil (warmUp) with a texel standing in for the
// image. A kind's image is fetched the first time a place with that kind is
// shown; a failed fetch leaves that kind unshown.
import * as THREE from 'three';
import { loadAsset } from './loadAsset.js';
import { JOINTS, JOINT_COUNT, FLIGHT, poseJoints } from './birdRig.js';

const FOLDER = new URL('../assets/birds/', import.meta.url);
/** The kinds drawn as models (each with its flight, src/birdRig.js, and its model in models.json); src/main.js draws the rest as pictures. */
export const MODELLED_KINDS = new Set(Object.keys(FLIGHT));
const MODELS_URL = new URL('models.json', FOLDER);
const PART = { body: 0, wing: 1, tail: 2 };
const RING = 16;                 // a body station's ring of vertices
const WING_COLUMNS = 24;         // a wing's stations along the span
const WING_ROWS = 6;             // and across the chord
const CAMBER = 0.04;             // a wing's arch, a share of its chord
const BLEND = 0.05;              // m either side of a wing joint over which the skin blends
const SUN_SHARE = 0.3;            // the sun's and the sky's light on the photograph, as the photo sprites took them
const SKY_SHARE = 1.0;
const SHADE_SIDE = 0.72;          // the body modelled: its side away from the sun, and toward it
const SHADE_SUN = 1.12;
const MIRROR_NEARNESS_SCALE = 4; // src/boulders.js's
// A kind's body's width against its depth along it (0 the tail's tip, 1 the bill's): flat at the tail, round at the
// breast, narrower at the head.
const WIDTH = [[0, 0.25], [0.22, 0.35], [0.35, 0.85], [0.6, 0.95], [0.75, 0.8], [0.86, 0.72], [1, 0.5]];
// Where on the body the wing's shoulder is (a share from the tail's tip), and how high (a share of the body's depth
// above its middle); the elbow and wrist, a share of the way out from the shoulder to the tip; the neck's and the
// tail's root, along the body.
const SKELETON = { shoulder: 0.6, shoulderHeight: 0.3, elbow: 0.3, wrist: 0.55, neck: 0.78, tail: 0.3 };

const VERTEX = /* glsl */ `
uniform mat4 uJoints[${JOINT_COUNT}];
attribute vec2 joints;        // the two joints it is skinned to
attribute float jointBlend;   // the second's share
attribute float part;
varying vec2 vUv;
varying float vPart;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vViewPosition;
void main() {
  mat4 first = uJoints[int(joints.x)], second = uJoints[int(joints.y)];
  vec4 world = mix(first * vec4(position, 1.0), second * vec4(position, 1.0), jointBlend);
  vNormal = normalize(mix(mat3(first) * normal, mat3(second) * normal, jointBlend));
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  vViewPosition = -mvPosition.xyz;
  vUv = uv;
  vPart = part;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec4 uRects[4];       // body, underwing, upper wing, tail: x, y, width, height (uv, from its top left)
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying float vPart;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vViewPosition;
void main() {
  vec3 normal = normalize(vNormal);
  bool wing = vPart > 0.5 && vPart < 1.5;
  vec4 rect = uRects[0];
  if (wing) {
    // Its upper side's picture from above, its underwing's from below; the normal the side seen.
    rect = gl_FrontFacing ? uRects[2] : uRects[1];
    if (!gl_FrontFacing) normal = -normal;
  } else if (vPart > 1.5) {
    rect = uRects[3];
    if (!gl_FrontFacing) normal = -normal;
  }
  vec4 picture = texture2D(uAtlas, rect.xy + vUv * rect.zw);
  if (picture.a < 0.5) discard;
  // The photograph has its own light and shade (an underwing photographed from below is in shadow): lit as a whole
  // by the sky and the sun as the scene is, and only modelled a little by which way it faces the sun.
  float sunUp = smoothstep(-0.02, 0.2, uSunDirection.y);
  vec3 light = uSkyAmbient * ${SKY_SHARE.toFixed(2)} + uSunIrradiance * ${SUN_SHARE.toFixed(2)} * sunUp;
  float facing = dot(normal, uSunDirection);
  float shade = wing ? 0.92 + 0.12 * abs(facing) : mix(${SHADE_SIDE.toFixed(2)}, ${SHADE_SUN.toFixed(2)}, 0.5 + 0.5 * facing);
  light *= mix(1.0, shade, sunUp);
  vec3 radiance = picture.rgb * light;
  #ifdef MIRROR
    gl_FragColor = vec4(radiance, 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05));
  #else
    if (vWorld.y < 0.0) discard;
    gl_FragColor = vec4(radiance, 1.0);
  #endif
}
`;

/** Linear interpolation through [at, value] pairs. */
function through(pairs, at) {
  for (let index = 1; index < pairs.length; index++) {
    const [a, va] = pairs[index - 1], [b, vb] = pairs[index];
    if (at <= b) return va + (vb - va) * THREE.MathUtils.clamp((at - a) / (b - a), 0, 1);
  }
  return pairs[pairs.length - 1][1];
}

/** A value along a station list (its `stations` and one of its arrays) at `at`, interpolated. */
function sample(stations, values, at) {
  if (at <= stations[0]) return values[0];
  for (let index = 1; index < stations.length; index++) {
    if (at <= stations[index]) {
      const share = (at - stations[index - 1]) / (stations[index] - stations[index - 1]);
      return values[index - 1] + (values[index] - values[index - 1]) * share;
    }
  }
  return values[values.length - 1];
}

/** A kind's model from its models.json entry (the header): its geometry, and its joints' places (model space). */
export function buildModel(entry) {
  const positions = [], normals = [], uvs = [], joints = [], blends = [], parts = [], indices = [];
  const { body, wing } = entry;
  const [left, bottom, right, top] = body.rect;
  const length = right - left;
  const middleAt = (x) => (sample(body.stations, body.top, x) + sample(body.stations, body.bottom, x)) / 2;
  const depthAt = (x) => (sample(body.stations, body.top, x) - sample(body.stations, body.bottom, x)) / 2;
  const add = (position, normal, uv, joint, part) => {
    positions.push(...position); normals.push(...normal); uvs.push(...uv);
    joints.push(joint[0], joint[1]); blends.push(joint[2]); parts.push(part);
    return positions.length / 3 - 1;
  };
  const neckX = left + SKELETON.neck * length, tailX = left + SKELETON.tail * length;

  // The body: rings along it, a ring's vertex at angle θ round (0 up the right side... the side's picture both ways).
  const stations = 40;
  for (let station = 0; station <= stations; station++) {
    const share = station / stations;
    const x = left + share * length;
    const middle = middleAt(x), depth = Math.max(depthAt(x), 0.002), width = depth * through(WIDTH, share);
    // The head turns with the neck joint (blended over the neck), the tail end with the tail's.
    const headShare = THREE.MathUtils.smoothstep(x, neckX - 0.04, neckX + 0.04);
    const tailShare = 1 - THREE.MathUtils.smoothstep(x, tailX - 0.05, tailX + 0.05);
    const joint = headShare > 0 ? [JOINTS.body, JOINTS.head, headShare] : [JOINTS.body, JOINTS.tail, tailShare];
    for (let around = 0; around <= RING; around++) {
      const angle = (around / RING) * Math.PI * 2;
      const y = middle + depth * Math.cos(angle), z = width * Math.sin(angle);
      const normal = new THREE.Vector3(0, Math.cos(angle) / depth, Math.sin(angle) / width).normalize();
      // The side's picture across it, a little in from its edge on the top and the belly (the outline's edge pixels
      // are the photo's background and what hung below it).
      const pictureY = middle + depth * 0.86 * Math.cos(angle);
      add([x, y, z], normal.toArray(), [share, (top - pictureY) / (top - bottom)], joint, PART.body);
    }
  }
  for (let station = 0; station < stations; station++) {
    for (let around = 0; around < RING; around++) {
      const a = station * (RING + 1) + around, b = a + RING + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  // The skeleton's places.
  const shoulderX = left + SKELETON.shoulder * length;
  const shoulderY = middleAt(shoulderX) + depthAt(shoulderX) * SKELETON.shoulderHeight;
  const root = wing.stations[0], tip = wing.tip;
  const elbowS = root + (tip - root) * SKELETON.elbow, wristS = root + (tip - root) * SKELETON.wrist;
  const modelJoints = {
    shoulder: { x: shoulderX, y: shoulderY, z: root * 0.7 },
    elbow: { x: shoulderX, y: shoulderY, z: elbowS },
    wrist: { x: shoulderX, y: shoulderY, z: wristS },
    neck: { x: neckX, y: middleAt(neckX), z: 0 },
    tail: { x: tailX, y: middleAt(tailX), z: 0 },
  };

  // The wings: a sheet over the flattened outline, the right one out along +z and the left mirrored.
  const [, chordBack, semispan, chordFront] = wing.rect;
  const known = wing.stations.map((s, index) => [s, wing.lead[index], wing.trail[index]]).filter(([, lead]) => lead !== null);
  const spanStations = known.map(([s]) => s), leads = known.map(([, lead]) => lead), trails = known.map(([, , trail]) => trail);
  for (const side of [1, -1]) {
    const first = positions.length / 3;
    for (let column = 0; column <= WING_COLUMNS; column++) {
      const s = root + (tip - root) * (column / WING_COLUMNS);
      const lead = sample(spanStations, leads, s), trail = sample(spanStations, trails, s);
      // Skinned to the shoulder, the elbow or the wrist, blended over BLEND either side of each.
      let joint;
      const shoulderJoint = side > 0 ? JOINTS.rightShoulder : JOINTS.leftShoulder;
      const elbowJoint = shoulderJoint + 1, wristJoint = shoulderJoint + 2;
      if (s < elbowS) joint = [shoulderJoint, elbowJoint, THREE.MathUtils.smoothstep(s, elbowS - BLEND, elbowS + BLEND)];
      else if (s < wristS) {
        const toWrist = THREE.MathUtils.smoothstep(s, wristS - BLEND, wristS + BLEND);
        joint = toWrist > 0 ? [elbowJoint, wristJoint, toWrist] : [shoulderJoint, elbowJoint, THREE.MathUtils.smoothstep(s, elbowS - BLEND, elbowS + BLEND)];
      } else joint = [elbowJoint, wristJoint, THREE.MathUtils.smoothstep(s, wristS - BLEND, wristS + BLEND)];
      // Beyond the body's root the sheet meets the body at the shoulder: its root pulled in to the body's side.
      const z = column === 0 ? root * 0.55 : s;
      for (let row = 0; row <= WING_ROWS; row++) {
        const share = row / WING_ROWS;
        // The picture's rect: wider than the outline (alpha cuts it); sample a little past each edge so its feathers
        // reach the sheet's edge.
        const chord = (lead + 0.02) + ((trail - 0.03) - (lead + 0.02)) * share;
        const arch = CAMBER * (lead - trail) * Math.sin(Math.PI * share);
        const position = [shoulderX + chord, shoulderY + arch, z * side];
        const uv = [s / semispan, (chordFront - chord) / (chordFront - chordBack)];
        add(position, [0, 1, 0], uv, joint, PART.wing);
      }
    }
    for (let column = 0; column < WING_COLUMNS; column++) {
      for (let row = 0; row < WING_ROWS; row++) {
        const a = first + column * (WING_ROWS + 1) + row, b = a + WING_ROWS + 1;
        // Front faces up (the upper side's picture), whichever wing.
        if (side > 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  // The tail: a fan from its root to its tip, under the body's tail, a little wider than the body there.
  const tailFirst = positions.length / 3;
  const fanColumns = 6, fanRows = 4;
  const tipX = left, rootX = tailX + 0.04;
  const spread = Math.max(depthAt(left + 0.15 * length) * 2.4, 0.04);
  for (let column = 0; column <= fanColumns; column++) {
    const across = column / fanColumns * 2 - 1;
    for (let row = 0; row <= fanRows; row++) {
      const share = row / fanRows;   // 0 at the root, 1 at the tip
      const x = rootX + (tipX - rootX) * share;
      const halfWidth = spread * (0.35 + 0.65 * share);
      const y = middleAt(x) - depthAt(x) * 0.3;
      add([x, y, across * halfWidth], [0, 1, 0], [(across + 1) / 2, share], [JOINTS.tail, JOINTS.tail, 0], PART.tail);
    }
  }
  for (let column = 0; column < fanColumns; column++) {
    for (let row = 0; row < fanRows; row++) {
      const a = tailFirst + column * (fanRows + 1) + row, b = a + fanRows + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);   // front faces up
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('joints', new THREE.Float32BufferAttribute(joints, 2));
  geometry.setAttribute('jointBlend', new THREE.Float32BufferAttribute(blends, 1));
  geometry.setAttribute('part', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  return { geometry, joints: modelJoints, span: entry.span, length, radius: Math.max(entry.span, length) * 0.6 };
}

/**
 * The birds' models: `above` and `mirror` for the main scene (the mirror's
 * on `mirrorLayer` alone), `below` for the under-water pass. show(population)
 * gives each bird its meshes, update(population, camera) poses them,
 * mirrorBounds tells src/main.js where a moving bird's mirror image is;
 * onLoaded is called when a kind's image has come.
 */
export function createBirdView({ lighting, mirrorLayer, onLoaded = () => {} }) {
  const above = new THREE.Group(), below = new THREE.Group(), mirror = new THREE.Group();
  const standIn = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  standIn.needsUpdate = true;
  const catalogue = { models: null, loading: null };
  const kinds = new Map();   // kind → { model, texture } once come (null while fetching or if it failed)
  const shared = {
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uSunDirection: { value: lighting.sunDirection },
  };
  const pool = [];
  let sprites = [];

  function loadCatalogue() {
    catalogue.loading ??= loadAsset(MODELS_URL).then((data) => { catalogue.models = data; }, (error) => {
      console.warn('[birds] the models failed to load; no birds shown', error);
    });
    return catalogue.loading;
  }

  async function load(kind) {
    if (kinds.has(kind)) return;
    kinds.set(kind, null);
    try {
      await loadCatalogue();
      const entry = catalogue.models?.[kind];
      if (!entry) return;
      const bytes = await loadAsset(new URL(entry.atlas, FOLDER), 'arrayBuffer');
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { imageOrientation: 'none', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      const model = buildModel(entry);
      const rects = ['body', 'under', 'upper', 'tail'].map((name) => new THREE.Vector4(...entry.uv[name]));
      kinds.set(kind, { model, texture, rects });
      for (const sprite of sprites) if (sprite.kind === kind) dress(sprite);
      onLoaded();
    } catch (error) {
      console.warn(`[birds] the ${kind}'s model failed to load; it is not shown`, error);
    }
  }

  function material(pass, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: pass === 'mirror' ? { MIRROR: '' } : {},
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }

  function makeSprite() {
    const uniforms = {
      ...shared,
      uAtlas: { value: standIn },
      uRects: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 1)) },
      uJoints: { value: Array.from({ length: JOINT_COUNT }, () => new THREE.Matrix4()) },
    };
    const placeholder = new THREE.BufferGeometry();
    const aboveMesh = new THREE.Mesh(placeholder, material('above', uniforms));
    const mirrorMesh = new THREE.Mesh(placeholder, material('mirror', uniforms));
    mirrorMesh.layers.set(mirrorLayer);
    for (const mesh of [aboveMesh, mirrorMesh]) { mesh.frustumCulled = false; mesh.visible = false; }
    above.add(aboveMesh);
    mirror.add(mirrorMesh);
    return { kind: null, meshes: [aboveMesh, mirrorMesh], uniforms, centre: new THREE.Vector3(), radius: 1, shown: false, still: false, jointArray: new Float32Array(JOINT_COUNT * 16) };
  }

  /** A sprite's meshes given its kind's model and image, once come. */
  function dress(sprite) {
    const loaded = kinds.get(sprite.kind);
    if (!loaded) return;
    for (const mesh of sprite.meshes) mesh.geometry = loaded.model.geometry;
    sprite.uniforms.uAtlas.value = loaded.texture;
    loaded.rects.forEach((rect, index) => sprite.uniforms.uRects.value[index].copy(rect));
  }

  function hide(sprite) {
    sprite.shown = false;
    for (const mesh of sprite.meshes) mesh.visible = false;
  }

  function show(population, camera) {
    while (pool.length < population.birds.length) pool.push(makeSprite());
    for (const sprite of pool) hide(sprite);
    sprites = population.birds.map((bird, index) => Object.assign(pool[index], { kind: bird.kind }));
    for (const sprite of sprites) dress(sprite);
    for (const kind of new Set(sprites.map((sprite) => sprite.kind))) load(kind);
    update(population, camera);
  }

  function update(population, camera) {
    population.birds.forEach((bird, index) => { if (sprites[index]) place(sprites[index], bird.pose); });
  }

  function place(sprite, at) {
    const loaded = kinds.get(sprite.kind);
    const flight = FLIGHT[sprite.kind];
    const ready = Boolean(loaded) && Boolean(flight) && at.shown && at.flying !== false;
    sprite.shown = ready;
    sprite.still = false;
    for (const mesh of sprite.meshes) mesh.visible = ready;
    if (!ready) return;
    poseJoints(sprite.jointArray, loaded.model, flight, at);
    sprite.uniforms.uJoints.value.forEach((matrix, index) => matrix.fromArray(sprite.jointArray, index * 16));
    sprite.centre.set(at.x, at.y, at.z);
    sprite.radius = loaded.model.radius;
  }

  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  /** The bounds of every shown bird that moves and that the mirror's camera sees (`frustum`), joined into `into`: how many. */
  function mirrorBounds(into, frustum) {
    let moving = 0;
    for (const sprite of sprites) {
      if (!sprite.shown || sprite.still) continue;
      sphere.set(sprite.centre, sprite.radius);
      if (!frustum.intersectsSphere(sphere)) continue;
      into.union(sphere.getBoundingBox(box));
      moving++;
    }
    return moving;
  }

  /** Under the veil (src/main.js warmUp): a bird's meshes drawn in front of the camera, so its programs are built. */
  function warmUp() {
    if (!pool.length) pool.push(makeSprite());
    const sprite = pool[0];
    const geometry = new THREE.PlaneGeometry(0.3, 0.3);
    geometry.setAttribute('joints', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    geometry.setAttribute('jointBlend', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count), 1));
    geometry.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count), 1));
    const was = sprite.meshes.map((mesh) => mesh.geometry);
    for (const mesh of sprite.meshes) { mesh.geometry = geometry; mesh.visible = true; }
    sprite.uniforms.uJoints.value.forEach((matrix) => matrix.makeTranslation(0, 0.3, -1.4));
    return { done() { sprite.meshes.forEach((mesh, index) => { mesh.geometry = was[index]; }); geometry.dispose(); if (!sprites.includes(sprite)) hide(sprite); } };
  }

  return {
    above, below, mirror,
    show, update, mirrorBounds, warmUp,
    get drawCalls() { return sprites.reduce((sum, sprite) => sum + (sprite.shown ? sprite.meshes.length : 0), 0); },
    get count() { return sprites.filter((sprite) => sprite.shown).length; },
  };
}
