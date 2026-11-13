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
//     side the same picture), so side on it is the photograph; a crested
//     kind's head (`crown`: the skull's top under the crest) is that ring
//     from its throat to its crown, and its crest above it a fin CREST_FIN
//     thick, so from in front it is a crest, not a cone as wide as the head;
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
import { JOINTS, JOINT_COUNT, NECK_SHARES, FLIGHT, poseJoints, poseStanding } from './birdRig.js';
import { SEEN_THROUGH_WATER } from './shaders/scene.js';

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
const CREST_FIN = 0.0035;         // m: half a crest's thickness at its root (it thins to a third of that at its tip)
// A kind's body's width against its depth along it (0 the tail's tip, 1 the bill's): flat at the tail, round at the
// breast, narrower at the head.
const WIDTH = [[0, 0.25], [0.22, 0.35], [0.35, 0.85], [0.6, 0.95], [0.75, 0.8], [0.86, 0.72], [1, 0.5]];
// Where on the body the wing's shoulder is (a share from the tail's tip), and how high (a share of the body's depth
// above its middle); the elbow and wrist, a share of the way out from the shoulder to the tip; the neck's and the
// tail's root, along the body.
const SKELETON = { shoulder: 0.6, shoulderHeight: 0.3, elbow: 0.3, wrist: 0.55, neck: 0.78, tail: 0.3 };

const BELOW_PULL = 0.25;   // m under the water a point is drawn nearer the eye, so the bed's depth there never hides it (src/birdSprites.js's)

const VERTEX = /* glsl */ `
uniform mat4 uJoints[${JOINT_COUNT}];
#ifdef BELOW
${SEEN_THROUGH_WATER}
#endif
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
  #ifdef BELOW
    // Where the still surface shows it from the eye (a straw in a glass), a little nearer along its ray.
    vec4 mvPosition = viewMatrix * vec4(seenThroughWater(world.xyz, 0.0), 1.0);
    mvPosition.xyz *= max(1.0 - ${BELOW_PULL.toFixed(2)} / length(mvPosition.xyz), 0.5);
  #else
    vec4 mvPosition = viewMatrix * world;
  #endif
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
uniform vec3 uExtinction;   // the water's, per metre (lighting.extinction)
uniform vec3 uWaterColor;   // the water's own radiance, for an eye under it
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
  // The wings' and the tail's outlines are their pictures' alpha; the body's is its shape (its picture is solid over it).
  if (vPart > 0.5 && picture.a < 0.5) discard;
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
  #elif defined(BELOW)
    if (vWorld.y > 0.0) discard;
    radiance *= exp(-uExtinction * (-vWorld.y) * 1.5);   // the light down to it, and some of its way back up (as src/reeds.js)
    if (cameraPosition.y < 0.0) radiance = mix(uWaterColor, radiance, exp(-uExtinction * length(cameraPosition - vWorld)));
    gl_FragColor = vec4(radiance, 1.0);
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

/**
 * A kind's two wings (the header: a sheet over the flattened outline, the right one out along +z and the left
 * mirrored), from a shoulder at (shoulderX, shoulderY), added through `add` (and their triangles to `indices`): the
 * shoulder's, elbow's and wrist's places (the right wing's, model space).
 */
/**
 * A crested body's normals (buildModel): the rings' first `stations` + 1, each RING + 1 round, are no longer
 * ellipses, so each vertex's normal is taken from its neighbours along the body and round its ring, turned to the
 * side the ellipse's normal faced.
 */
function crestNormals(positions, normals, stations) {
  const at = (station, around) => {
    const index = (THREE.MathUtils.clamp(station, 0, stations) * (RING + 1) + ((around + RING) % RING)) * 3;
    return new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2]);
  };
  const along = new THREE.Vector3(), round = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let station = 0; station <= stations; station++) {
    for (let around = 0; around <= RING; around++) {
      along.subVectors(at(station + 1, around), at(station - 1, around));
      round.subVectors(at(station, around + 1), at(station, around - 1));
      normal.crossVectors(along, round);
      const index = (station * (RING + 1) + around) * 3;
      if (normal.lengthSq() < 1e-14) continue;
      normal.normalize();
      if (normal.x * normals[index] + normal.y * normals[index + 1] + normal.z * normals[index + 2] < 0) normal.negate();
      normals[index] = normal.x; normals[index + 1] = normal.y; normals[index + 2] = normal.z;
    }
  }
}

function addWings(wing, shoulderX, shoulderY, add, indices) {
  const root = wing.stations[0], tip = wing.tip;
  const elbowS = root + (tip - root) * SKELETON.elbow, wristS = root + (tip - root) * SKELETON.wrist;
  // The wings: a sheet over the flattened outline, the right one out along +z and the left mirrored.
  const [, chordBack, semispan, chordFront] = wing.rect;
  const known = wing.stations.map((s, index) => [s, wing.lead[index], wing.trail[index]]).filter(([, lead]) => lead !== null);
  const spanStations = known.map(([s]) => s), leads = known.map(([, lead]) => lead), trails = known.map(([, , trail]) => trail);
  for (const side of [1, -1]) {
    const first = add.count();
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

  return {
    shoulder: { x: shoulderX, y: shoulderY, z: root * 0.7 },
    elbow: { x: shoulderX, y: shoulderY, z: elbowS },
    wrist: { x: shoulderX, y: shoulderY, z: wristS },
  };
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
  add.count = () => positions.length / 3;
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
    // Under a crest, the ring's width is the head's (an ellipse from the throat to the crown), and above the crown
    // the crest's fin.
    const crownY = body.crown ? Math.min(sample(body.stations, body.crown, x), middle + depth) : middle + depth;
    const skullMiddle = (crownY + middle - depth) / 2, skullDepth = Math.max((crownY - (middle - depth)) / 2, 0.002);
    const skullWidth = skullDepth * through(WIDTH, share);
    const crestHeight = middle + depth - crownY;
    for (let around = 0; around <= RING; around++) {
      const angle = (around / RING) * Math.PI * 2;
      const y = middle + depth * Math.cos(angle);
      let z = width * Math.sin(angle);
      if (crestHeight > 1e-4) {
        const inSkull = THREE.MathUtils.clamp((y - skullMiddle) / skullDepth, -1, 1);
        const skull = skullWidth * Math.sqrt(1 - inSkull * inSkull);
        const fin = y > crownY - CREST_FIN ? CREST_FIN * (1 - (2 / 3) * THREE.MathUtils.clamp((y - crownY) / crestHeight, 0, 1)) : 0;
        z = Math.sign(Math.sin(angle)) * Math.max(skull, fin);
      }
      const normal = new THREE.Vector3(0, Math.cos(angle) / depth, Math.sin(angle) / width).normalize();   // the crest's: crestNormals
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
  if (body.crown) crestNormals(positions, normals, stations);

  // The skeleton's places.
  const shoulderX = left + SKELETON.shoulder * length;
  const shoulderY = middleAt(shoulderX) + depthAt(shoulderX) * SKELETON.shoulderHeight;
  const wingSkeleton = addWings(wing, shoulderX, shoulderY, add, indices);
  const modelJoints = {
    ...wingSkeleton,
    neck: { x: neckX, y: middleAt(neckX), z: 0 },
    tail: { x: tailX, y: middleAt(tailX), z: 0 },
  };

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

// A standing kind's trunk's width against its depth along it (0 the tail's tip, 1 the breast).
const STANDING_WIDTH = [[0, 0.2], [0.15, 0.42], [0.4, 0.58], [0.7, 0.62], [0.9, 0.56], [1, 0.45]];
const NECK_RING = 16;
// The neck's middle line and thickness, read off the photograph's outline point by point, each point averaged with up
// to this many either side (symmetrically, so the line keeps its ends; up to the nape: the head is its own), so the
// tube has no zigzag or lumps the picture's pixels put in (its rings each square to a line that turns smoothly).
const NECK_SMOOTHING = 3;
const LEG_RING = 6;
const LEG_SPREAD = 0.045;   // m either side of the middle a leg stands
const TOE_SPLAY = 0.45;     // rad a front toe turns out from the middle one

/**
 * A standing kind's model from its models.json entry (tools/bird-models.py side_part): metres from its hips, its bill
 * along +x, up +y, its right side +z. Every part of it but the wings is painted from its side picture, projected across
 * it (side on, the photograph): the trunk lofted from its outline; the neck and head a tube along the neck's middle
 * line, as thick as the photo's neck there; each leg a thin tube along the photo's leg, hip to heel to foot, and its toes
 * spread on the ground; the wings as a flying kind's (buildModel), folded away by the rig when it stands.
 */
export function buildStandingModel(entry) {
  const positions = [], normals = [], uvs = [], joints = [], blends = [], parts = [], indices = [];
  const { side, wing } = entry;
  const [left, bottom, right, top] = side.rect;
  const pictureUv = (x, y) => [(x - left) / (right - left), (top - y) / (top - bottom)];
  const add = (position, normal, uv, joint, part = PART.body) => {
    positions.push(...position); normals.push(...normal); uvs.push(...uv);
    joints.push(joint[0], joint[1]); blends.push(joint[2]); parts.push(part);
    return positions.length / 3 - 1;
  };
  add.count = () => positions.length / 3;
  // The trunk.
  const { trunk } = side;
  const trunkLeft = trunk.stations[0], trunkRight = trunk.stations[trunk.stations.length - 1];
  {
    const first = positions.length / 3, stations = 36;
    for (let station = 0; station <= stations; station++) {
      const share = station / stations;
      const x = trunkLeft + share * (trunkRight - trunkLeft);
      const topY = sample(trunk.stations, trunk.top, x), bottomY = sample(trunk.stations, trunk.bottom, x);
      const middle = (topY + bottomY) / 2, depth = Math.max((topY - bottomY) / 2, 0.002), width = depth * through(STANDING_WIDTH, share);
      for (let around = 0; around <= RING; around++) {
        const angle = (around / RING) * Math.PI * 2;
        const normal = new THREE.Vector3(0, Math.cos(angle) / depth, Math.sin(angle) / width).normalize();
        add([x, middle + depth * Math.cos(angle), width * Math.sin(angle)], normal.toArray(), pictureUv(x, middle + depth * 0.9 * Math.cos(angle)), [JOINTS.body, JOINTS.body, 0]);
      }
    }
    for (let station = 0; station < stations; station++) {
      for (let around = 0; around < RING; around++) {
        const a = first + station * (RING + 1) + around, b = a + RING + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  // The neck and head: rings along the middle line, each skinned between the chain's joints either side of it.
  const firstPastNape = side.neck.findIndex((point) => point[3] > 0.5);
  const neck = side.neck.map((point, index, points) => {
    const reach = Math.min(NECK_SMOOTHING, index, firstPastNape - index);
    if (reach <= 0) return point;
    const sum = [0, 0, 0];
    for (let near = index - reach; near <= index + reach; near++) for (let axis = 0; axis < 3; axis++) sum[axis] += points[near][axis];
    return [...sum.map((total) => total / (2 * reach + 1)), point[3]];
  });   // [x, y, half-thickness, past the nape]
  const lengths = [0];
  for (let index = 1; index < neck.length; index++) lengths.push(lengths[index - 1] + Math.hypot(neck[index][0] - neck[index - 1][0], neck[index][1] - neck[index - 1][1]));
  const napeIndex = neck.findIndex((point) => point[3] > 0.5);
  const napeAlong = lengths[napeIndex], total = lengths[lengths.length - 1];
  const chainAlong = [...NECK_SHARES.map((share) => share * napeAlong), napeAlong];
  const chainJoints = [JOINTS.body, ...JOINTS.neck, JOINTS.head];
  const chainPoint = (along) => {
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < along) index++;
    const share = (along - lengths[index - 1]) / Math.max(lengths[index] - lengths[index - 1], 1e-9);
    return { x: neck[index - 1][0] + (neck[index][0] - neck[index - 1][0]) * share, y: neck[index - 1][1] + (neck[index][1] - neck[index - 1][1]) * share };
  };
  {
    const first = positions.length / 3;
    neck.forEach(([x, y, thickness], index) => {
      const before = neck[Math.max(index - 1, 0)], after = neck[Math.min(index + 1, neck.length - 1)];
      const directionX = after[0] - before[0], directionY = after[1] - before[1], directionLength = Math.hypot(directionX, directionY);
      const normalX = -directionY / directionLength, normalY = directionX / directionLength;
      const along = lengths[index];
      // Thinner across than up and down: the neck a little, the head more, the bill most (to its tip).
      const pastNape = Math.max(0, (along - napeAlong) / (total - napeAlong));
      const across = along < napeAlong ? 0.85 : 0.72 - 0.3 * pastNape;
      // Its joints: the chain's two either side of it, blended over the middle third between them.
      let link = 0;
      while (link < chainAlong.length - 1 && along > chainAlong[link]) link++;
      let joint;
      if (along >= napeAlong) joint = [JOINTS.head, JOINTS.head, 0];
      else {
        const from = link === 0 ? 0 : chainAlong[link - 1], to = chainAlong[link];
        const share = THREE.MathUtils.smoothstep((along - from) / Math.max(to - from, 1e-9), 0, 1);
        joint = [chainJoints[link], chainJoints[link + 1], share];
      }
      // At the bill's tip the ring closes to a point.
      const radius = index === neck.length - 1 ? 0.0005 : thickness;
      for (let around = 0; around <= NECK_RING; around++) {
        const angle = (around / NECK_RING) * Math.PI * 2;
        const up = Math.cos(angle), out = Math.sin(angle);
        const position = [x + normalX * radius * up, y + normalY * radius * up, radius * across * out];
        const normal = new THREE.Vector3(normalX * up, normalY * up, out / across).normalize();
        add(position, normal.toArray(), pictureUv(x + normalX * radius * up * 0.85, y + normalY * radius * up * 0.85), joint);
      }
    });
    for (let ring = 0; ring < neck.length - 1; ring++) {
      for (let around = 0; around < NECK_RING; around++) {
        const a = first + ring * (NECK_RING + 1) + around, b = a + NECK_RING + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  // A thin tube along points ([x, y, z], radius each, joint each), painted from the picture under its middle line.
  const limb = (points, part = PART.body) => {
    const first = positions.length / 3;
    points.forEach(({ at, radius, joint }, index) => {
      const before = points[Math.max(index - 1, 0)].at, after = points[Math.min(index + 1, points.length - 1)].at;
      const direction = new THREE.Vector3(after[0] - before[0], after[1] - before[1], after[2] - before[2]).normalize();
      const sideways = Math.abs(direction.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const normalA = new THREE.Vector3().crossVectors(direction, sideways).normalize(), normalB = new THREE.Vector3().crossVectors(direction, normalA);
      for (let around = 0; around <= LEG_RING; around++) {
        const angle = (around / LEG_RING) * Math.PI * 2;
        const normal = normalA.clone().multiplyScalar(Math.cos(angle)).addScaledVector(normalB, Math.sin(angle));
        add([at[0] + normal.x * radius, at[1] + normal.y * radius, at[2] + normal.z * radius], normal.toArray(), points[index].uv ?? pictureUv(at[0], at[1]), joint, part);
      }
    });
    for (let ring = 0; ring < points.length - 1; ring++) {
      for (let around = 0; around < LEG_RING; around++) {
        const a = first + ring * (LEG_RING + 1) + around, b = a + LEG_RING + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  };
  const legs = side.legs.map((leg, index) => {
    const z = index === 0 ? LEG_SPREAD : -LEG_SPREAD;
    const [hipJoint, heelJoint, footJoint] = index === 0 ? [JOINTS.rightHip, JOINTS.rightHeel, JOINTS.rightFoot] : [JOINTS.leftHip, JOINTS.leftHeel, JOINTS.leftFoot];
    const hip = { x: leg.hip[0], y: leg.hip[1] }, heel = { x: leg.heel[0], y: leg.heel[1] }, foot = { x: leg.foot[0], y: leg.foot[1] };
    // Along the photo's leg (its middle line, tools/bird-models.py): the tibia to the heel, then the tarsus, blended at
    // the heel; as thick as the photo's leg (its feathered top thicker), a little thinner for the tube's round.
    // Painted from its column of the legs' colours (the fourth picture), a band a point.
    const heelIndex = (leg.line.length - 1) / 2;
    const legUv = (step) => [(index + 0.5) / side.legs.length, (step + 0.5) / leg.line.length];
    limb(leg.line.map(([x, y, half], step) => ({
      at: [x, y, z], radius: Math.min(half * 0.85, 0.014), uv: legUv(step),
      joint: step < heelIndex ? [hipJoint, hipJoint, 0] : step === heelIndex ? [hipJoint, heelJoint, 0.5] : [heelJoint, heelJoint, 0],
    })), PART.tail);
    // The toes, from the foot: the photo's front toe straight ahead and one either side of it, and the hind toe.
    const [frontTip, , hindTip] = leg.toes;
    const frontX = frontTip[0] - foot.x, frontY = frontTip[1] - foot.y;
    for (const turn of [-TOE_SPLAY, 0, TOE_SPLAY]) {
      const tip = [foot.x + frontX * Math.cos(turn), foot.y + frontY, z + frontX * Math.sin(turn)];
      limb([{ at: [foot.x, foot.y, z], radius: 0.004, uv: legUv(leg.line.length - 1), joint: [footJoint, footJoint, 0] }, { at: tip, radius: 0.0015, uv: legUv(leg.line.length - 1), joint: [footJoint, footJoint, 0] }], PART.tail);
    }
    limb([{ at: [foot.x, foot.y, z], radius: 0.0035, uv: legUv(leg.line.length - 1), joint: [footJoint, footJoint, 0] }, { at: [hindTip[0], hindTip[1], z], radius: 0.0015, uv: legUv(leg.line.length - 1), joint: [footJoint, footJoint, 0] }], PART.tail);
    return {
      hip, heel, foot, z,
      upper: Math.hypot(heel.x - hip.x, heel.y - hip.y), lower: Math.hypot(foot.x - heel.x, foot.y - heel.y),
      restTibia: Math.atan2(heel.y - hip.y, heel.x - hip.x), restTarsus: Math.atan2(foot.y - heel.y, foot.x - heel.x),
    };
  });
  // The wings: as a flying kind's, from the shoulder at the top of the trunk a little behind its front.
  const shoulderX = trunkRight - 0.32 * (trunkRight - trunkLeft);
  const shoulderY = sample(trunk.stations, trunk.top, shoulderX) - 0.03;
  const wingSkeleton = addWings(wing, shoulderX, shoulderY, add, indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('joints', new THREE.Float32BufferAttribute(joints, 2));
  geometry.setAttribute('jointBlend', new THREE.Float32BufferAttribute(blends, 1));
  geometry.setAttribute('part', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  const hipsHeight = -Math.min(...side.legs.map((leg) => leg.foot[1]));
  // The neck's joints, and each link's direction as photographed (the last the head's: the nape to the bill's tip).
  const neckJoints = chainAlong.map(chainPoint);
  const billTip = neck[neck.length - 1];
  const neckRest = neckJoints.map((joint, index) => {
    const next = index < neckJoints.length - 1 ? neckJoints[index + 1] : { x: billTip[0], y: billTip[1] };
    return Math.atan2(next.y - joint.y, next.x - joint.x);
  });
  return {
    geometry, standing: true, span: entry.span, length: trunkRight - trunkLeft, radius: Math.max(entry.span, 1) * 0.6,
    skeleton: { hipsHeight, neck: neckJoints, neckRest, legs, wing: wingSkeleton },
  };
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
    uExtinction: { value: lighting.extinction },
    uWaterColor: { value: lighting.waterColor },
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
      const model = entry.standing ? buildStandingModel(entry) : buildModel(entry);
      // A standing kind's fourth picture is its legs' colours (a column a leg, buildStandingModel), where a flying kind's is its tail's.
      const rects = (entry.standing ? ['side', 'under', 'upper', 'legs'] : ['body', 'under', 'upper', 'tail']).map((name) => new THREE.Vector4(...entry.uv[name]));
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
      defines: pass === 'mirror' ? { MIRROR: '' } : pass === 'below' ? { BELOW: '' } : {},
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
    const belowMesh = new THREE.Mesh(placeholder, material('below', uniforms));
    mirrorMesh.layers.set(mirrorLayer);
    for (const mesh of [aboveMesh, mirrorMesh, belowMesh]) { mesh.frustumCulled = false; mesh.visible = false; }
    above.add(aboveMesh);
    mirror.add(mirrorMesh);
    below.add(belowMesh);
    return { kind: null, meshes: [aboveMesh, mirrorMesh], under: belowMesh, uniforms, centre: new THREE.Vector3(), radius: 1, shown: false, still: false, jointArray: new Float32Array(JOINT_COUNT * 16), drawnJoints: new Float32Array(JOINT_COUNT * 16) };
  }

  /** A sprite's meshes given its kind's model and image, once come. */
  function dress(sprite) {
    const loaded = kinds.get(sprite.kind);
    if (!loaded) return;
    for (const mesh of [...sprite.meshes, sprite.under]) mesh.geometry = loaded.model.geometry;
    sprite.uniforms.uAtlas.value = loaded.texture;
    loaded.rects.forEach((rect, index) => sprite.uniforms.uRects.value[index].copy(rect));
  }

  function hide(sprite) {
    sprite.shown = false;
    for (const mesh of sprite.meshes) mesh.visible = false;
    sprite.under.visible = false;
  }

  function show(population, camera, iceAt) {
    while (pool.length < population.birds.length) pool.push(makeSprite());
    for (const sprite of pool) hide(sprite);
    sprites = population.birds.map((bird, index) => Object.assign(pool[index], { kind: bird.kind }));
    for (const sprite of sprites) dress(sprite);
    for (const kind of new Set(sprites.map((sprite) => sprite.kind))) load(kind);
    update(population, camera, iceAt);
  }

  /** Each bird posed (src/birds.js showAt); `iceAt(x, z)` the ice's top there, or null where there is open water. */
  function update(population, camera, iceAt = () => null) {
    population.birds.forEach((bird, index) => { if (sprites[index]) place(sprites[index], bird.pose, iceAt); });
  }

  const standingPose = {};
  function place(sprite, at, iceAt) {
    const loaded = kinds.get(sprite.kind);
    const flight = FLIGHT[sprite.kind];
    const standing = at.flying === false;
    const ready = Boolean(loaded) && Boolean(flight) && at.shown && (!standing || loaded.model.standing);
    const wasShown = sprite.shown;
    sprite.shown = ready;
    for (const mesh of sprite.meshes) mesh.visible = ready;
    sprite.under.visible = false;
    if (!ready) return;
    if (loaded.model.standing) {
      // Standing in the water its feet are on the bed (src/birds.js laySpot); on a frozen pond, on the ice over them
      // (none stands on one now: src/birds.js BIRDS_WHEN_FROZEN).
      const ice = standing && at.y < 0 ? iceAt(at.x, at.z) : null;
      const pose = ice === null ? at : Object.assign(standingPose, at, { y: ice });
      poseStanding(sprite.jointArray, loaded.model, flight, pose);
      // What of it is under the water (its legs, wading; its bill, striking) drawn in the under-water pass.
      sprite.under.visible = ice === null && (standing ? at.y < 0 : at.y < 1.2);
      sprite.centre.set(at.x, pose.y + (standing ? loaded.model.skeleton.hipsHeight : 0), at.z);
    } else {
      poseJoints(sprite.jointArray, loaded.model, flight, at);
      sprite.centre.set(at.x, at.y, at.z);
    }
    // Still when it is posed as it was drawn last (a heron standing quite still): its mirror image is not drawn again.
    sprite.still = wasShown && sprite.jointArray.every((value, index) => value === sprite.drawnJoints[index]);
    sprite.drawnJoints.set(sprite.jointArray);
    sprite.uniforms.uJoints.value.forEach((matrix, index) => matrix.fromArray(sprite.jointArray, index * 16));
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
    const meshes = [...sprite.meshes, sprite.under];
    const was = meshes.map((mesh) => mesh.geometry);
    for (const mesh of meshes) { mesh.geometry = geometry; mesh.visible = true; }
    sprite.uniforms.uJoints.value.forEach((matrix) => matrix.makeTranslation(0, 0.3, -1.4));
    return { done() { meshes.forEach((mesh, index) => { mesh.geometry = was[index]; }); geometry.dispose(); if (!sprites.includes(sprite)) hide(sprite); } };
  }

  return {
    above, below, mirror,
    show, update, mirrorBounds, warmUp,
    get drawCalls() { return sprites.reduce((sum, sprite) => sum + (sprite.shown ? sprite.meshes.length : 0) + (sprite.under.visible ? 1 : 0), 0); },
    get count() { return sprites.filter((sprite) => sprite.shown).length; },
  };
}
