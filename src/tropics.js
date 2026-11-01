// The tropical beach's scenery (src/main.js PLACES `tropical`, under the
// cove's sky: granite boulders and a calm sea, as the Seychelles' granite
// beaches are): coconut palms along the beach on either side of the eye,
// leaning out over the lagoon, and out on it a motu, a low islet of coral
// sand with its own palms and a few shrubs, so palms stand in the home
// frame too (the beach's own are beside and behind the shore view's eye,
// in its frame only as reflections in the water, and in view as the eye
// turns, steps back or stands behind the thrower).
//
// Scenery out of reach: the beach's palms stand on land behind the
// waterline (groundHeightAt, src/pondFloor.js) outside the throw's line and
// their crowns metres over any arc; the motu stands MOTU.distance out, past
// where anything thrown can go (a floater past 30 m from the pond goes,
// src/main.js FARTHEST_AWAY). Nothing here has a body for the physics.
//
// A palm (palmParts): its trunk a tube along a curve, leaning at its foot
// and curving back up toward its crown, as a coconut palm on a beach grows
// toward the light over the water; flared at its foot and ringed with the
// scars of fallen fronds (vRing, the metres up it, banded in the fragment
// shader); its crown FRONDS pinnate fronds round the top, the young ones
// up, the old ones arching down, each a rachis bending under its own weight
// with leaflets in pairs along it, folded up into a V and drooping toward
// their tips, longest mid-frond; a dead frond or two hanging brown under
// the crown; and a cluster of coconuts. The motu (motuGeometry): a mound
// of sand on a wobbling outline, dry and pale on top, darker where the
// waves wet it, its slope going on down under the water, where the
// under-water pass draws it as the bed is drawn (the lagoon's turquoise
// over pale sand: a motu's halo of shallows), and shrubs (beach naupaka)
// in lumps under its palms. Every number is drawn from its own seeded
// stream (seededRandom), never Math.random: the same scenery every visit.
//
// The wind (setWind, the Wind control's strength; setTime, world seconds):
// the vertex shader bends each trunk along the wind as a cantilever (the
// crown's lean, LEAN, times the square of the height up the trunk, plus a
// sway at the palm's own slow frequency, SWAY, swelled by slow gusts of
// its own), the crown riding the trunk's top, and flutters the fronds
// (FLUTTER, growing out along each frond and its leaflets). The water's
// mirror image is drawn when the view changes (src/main.js), so a palm's
// image sways only then, as a reed's does.
//
// Meshes: `palms` (every palm and shrub, one mesh and program, in the main
// scene and on the mirror layer), `motuAbove` (clipped to y ≥ 0, main
// scene and mirror) and `motuBelow` (clipped to y ≤ 0, the under-water
// pass, drawn where the still surface shows it, SEEN_THROUGH_WATER, and
// fading into the water seen from under it). Built under the loading veil
// (src/main.js warmUp shows them whatever the place).
import * as THREE from 'three';
import { groundHeightAt } from './pondFloor.js';
import { SEEN_THROUGH_WATER } from './shaders/scene.js';
import { seededRandom } from './spray.js';

const SEED = 7173;
/**
 * The beach's palms: their foot (x, z, on the land), height (m, along the
 * trunk), lean at the foot (degrees from upright) toward (lean x, z; out
 * over the water), and how much it curves back up toward the crown.
 */
export const BEACH_PALMS = [
  { x: -3.6, z: 3.7, height: 7.5, lean: 34, toward: [0.4, -1], curve: 0.65 },
  { x: -5.2, z: 4.6, height: 9.5, lean: 14, toward: [0.2, -1], curve: 0.4 },
  { x: -2.4, z: 6.8, height: 8.5, lean: 9, toward: [0.5, -1], curve: 0.3 },
  { x: 3.9, z: 3.5, height: 8, lean: 30, toward: [-0.35, -1], curve: 0.6 },
  { x: 5.8, z: 5.2, height: 10, lean: 12, toward: [-0.1, -1], curve: 0.35 },
  { x: 1.6, z: 7.6, height: 9, lean: 7, toward: [0, -1], curve: 0.2 },
];
/** The motu: its middle (bearing, degrees right of the home view's line, and distance from the eye, m), its half-lengths, turn and height (m), and its palms (each offset from its middle in its own frame, m). */
export const MOTU = {
  // Far enough out that its palms' crowns stand inside the home frame (its top edge 6° over the level, the
  // tallest crown 5°), near enough to be an islet rather than a smudge.
  bearing: -16, distance: 105, half: [17, 7], turn: 12, height: 1.0,
  palms: [
    { at: [-9.5, 0.8], height: 8.5, lean: 14, curve: 0.4 },
    { at: [-6.5, -1.5], height: 10, lean: 7, curve: 0.2 },
    { at: [-3.2, 1.2], height: 9, lean: 10, curve: 0.3 },
    { at: [-0.6, -0.8], height: 10.5, lean: 5, curve: 0.2 },
    { at: [2.2, 0.9], height: 8, lean: 20, curve: 0.5 },
    { at: [4.8, -1.0], height: 9.5, lean: 9, curve: 0.3 },
    { at: [7.6, 0.4], height: 8.5, lean: 16, curve: 0.45 },
    { at: [10.5, -0.5], height: 7.5, lean: 28, curve: 0.6 },
  ],
  shrubs: 14,
};
const EYE = { x: 0, z: 2.45 };   // the shore view's eye (src/main.js VIEWS.shore)
const FRONDS = 18;
const TRUNK = { around: 9, rows: 40, foot: 0.2, flare: 0.13, top: 0.13 };   // its tube; radius at the foot, the flare's addition, at the top (m)
const LEAFLETS = { near: 26, far: 14 };   // pairs along a frond: the beach's palms, the motu's (105 m off, a leaflet under a pixel)
const FROND_LENGTH = [3.4, 4.8]; // m
const COLORS = {
  trunk: [0.30, 0.25, 0.19], trunkTop: [0.24, 0.24, 0.14],
  frond: [0.07, 0.17, 0.035], frondOld: [0.17, 0.17, 0.05], dead: [0.30, 0.22, 0.10],
  coconut: [0.16, 0.18, 0.05], ripe: [0.30, 0.20, 0.08],
  shrub: [0.08, 0.2, 0.06],
  dry: [0.86, 0.82, 0.70], wet: [0.55, 0.50, 0.40], under: [0.82, 0.80, 0.70],
};
// The sway (setWind, the vertex shader): the crown's lean along the wind per unit of the Wind control's strength
// (rad), its sway (rad) and frequency (Hz, each palm its own about it), the fronds' flutter (m at a leaflet's tip
// per unit strength) and its frequency (Hz).
const LEAN = 0.025;
const SWAY = 0.012;
const SWAY_HERTZ = 0.25;
const FLUTTER = 0.05;
const FLUTTER_HERTZ = 1.6;

/** Accumulates triangles with their colours and sway weights. */
class Parts {
  constructor() {
    this.positions = []; this.normals = []; this.colors = []; this.sway = []; this.palm = []; this.ring = []; this.indices = [];
  }

  /** A vertex: where, its normal, colour, sway (x: share of the crown's lean it takes; y: flutter), its palm's (height, phase), its ring (m up the trunk, −1 none). */
  vertex(point, normal, color, sway, palm, ring = -1) {
    this.positions.push(point.x, point.y, point.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.colors.push(...color);
    this.sway.push(...sway);
    this.palm.push(...palm);
    this.ring.push(ring);
    return this.positions.length / 3 - 1;
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('palmSway', new THREE.Float32BufferAttribute(this.sway, 2));
    geometry.setAttribute('palmShape', new THREE.Float32BufferAttribute(this.palm, 2));
    geometry.setAttribute('palmRing', new THREE.Float32BufferAttribute(this.ring, 1));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const mixColor = (one, other, share) => one.map((value, index) => value + (other[index] - value) * share);
const shade = (color, factor) => color.map((value) => value * factor);

/**
 * A palm into `parts`: rooted at `foot` (a Vector3 on the ground), `height`
 * along its trunk, leaning `lean` degrees at its foot toward `toward` (x, z),
 * curving back up by `curve`, drawn from `stream`.
 */
function palmParts(parts, { foot, height, lean, toward, curve, leaflets = LEAFLETS.near }, stream) {
  const phase = stream() * 100;
  const palm = [height, phase];
  const heading = new THREE.Vector2(toward[0], toward[1]).normalize();
  // The trunk's axis: marched up, its angle from upright easing from `lean` at the foot by `curve` toward the top.
  const axis = [], tangents = [];
  const point = foot.clone();
  const step = height / TRUNK.rows;
  for (let row = 0; row <= TRUNK.rows; row++) {
    const share = row / TRUNK.rows;
    const angle = THREE.MathUtils.degToRad(lean) * (1 - curve * share * share) + 0.03 * Math.sin(share * 9 + phase);
    const tangent = new THREE.Vector3(heading.x * Math.sin(angle), Math.cos(angle), heading.y * Math.sin(angle));
    axis.push(point.clone());
    tangents.push(tangent);
    point.addScaledVector(tangent, step);
  }
  const top = axis[TRUNK.rows];
  // The trunk's tube.
  const side = new THREE.Vector3(-heading.y, 0, heading.x);
  const first = parts.positions.length / 3;
  for (let row = 0; row <= TRUNK.rows; row++) {
    const share = row / TRUNK.rows;
    const radius = TRUNK.foot + (TRUNK.top - TRUNK.foot) * share + TRUNK.flare * (1 - share) ** 8;
    const tangent = tangents[row];
    const across = side.clone().addScaledVector(tangent, -side.dot(tangent)).normalize();
    const over = new THREE.Vector3().crossVectors(across, tangent).normalize();
    const color = mixColor(COLORS.trunk, COLORS.trunkTop, share * share);
    for (let around = 0; around < TRUNK.around; around++) {
      const turn = (around / TRUNK.around) * Math.PI * 2;
      const normal = across.clone().multiplyScalar(Math.cos(turn)).addScaledVector(over, Math.sin(turn));
      parts.vertex(axis[row].clone().addScaledVector(normal, radius), normal, shade(color, 0.85 + 0.3 * stream()), [share * share, 0], palm, share * height);
    }
  }
  for (let row = 0; row < TRUNK.rows; row++) {
    for (let around = 0; around < TRUNK.around; around++) {
      const here = first + row * TRUNK.around + around, next = first + row * TRUNK.around + (around + 1) % TRUNK.around;
      parts.indices.push(here, next, here + TRUNK.around, next, next + TRUNK.around, here + TRUNK.around);
    }
  }
  // The crown: fronds round the top, the youngest up, the oldest arching down; a dead one or two hanging.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < FRONDS; index++) {
    const age = index / (FRONDS - 1);   // 0 the youngest
    const azimuth = index * golden + phase + (stream() - 0.5) * 0.4;
    const rise = THREE.MathUtils.degToRad(55 - 85 * age + (stream() - 0.5) * 14);
    frondParts(parts, { base: top, azimuth, rise, length: FROND_LENGTH[0] + (FROND_LENGTH[1] - FROND_LENGTH[0]) * (0.5 + 0.5 * Math.sin(Math.PI * age)) * (0.85 + 0.3 * stream()), droop: 0.9 + 1.3 * age, color: mixColor(COLORS.frond, COLORS.frondOld, age ** 2 * (0.6 + 0.4 * stream())), palm, dead: false, leaflets }, stream);
  }
  for (let index = 0; index < 1 + Math.floor(stream() * 2); index++) {
    frondParts(parts, { base: top.clone().addScaledVector(tangents[TRUNK.rows], -0.25), azimuth: stream() * Math.PI * 2, rise: THREE.MathUtils.degToRad(-72 - 10 * stream()), length: 2.4 + 0.8 * stream(), droop: 0.2, color: COLORS.dead, palm, dead: true, leaflets }, stream);
  }
  // Coconuts, clustered under the crown.
  for (let index = 0; index < 5 + Math.floor(stream() * 5); index++) {
    const angle = stream() * Math.PI * 2, out = 0.14 + 0.12 * stream();
    const centre = top.clone().add(new THREE.Vector3(Math.cos(angle) * out, -0.18 - 0.22 * stream(), Math.sin(angle) * out));
    sphereParts(parts, centre, 0.1 + 0.03 * stream(), mixColor(COLORS.coconut, COLORS.ripe, stream()), [1, 0], palm);
  }
}

/** A frond from `base`: its rachis rising at `rise` toward `azimuth`, bending down by `droop` over its `length`; leaflets in pairs along it. */
function frondParts(parts, { base, azimuth, rise, length, droop, color, palm, dead, leaflets }, stream) {
  const steps = 12;
  const outward = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
  const up = new THREE.Vector3(0, 1, 0);
  const rachis = [], directions = [];
  const point = base.clone();
  for (let step = 0; step <= steps; step++) {
    const share = step / steps;
    const angle = rise - droop * share ** 1.5;
    const direction = outward.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
    rachis.push(point.clone());
    directions.push(direction);
    point.addScaledVector(direction, length / steps);
  }
  const along = (share) => {
    const at = Math.min(share * steps, steps - 1e-6), index = Math.floor(at), part = at - index;
    return { point: rachis[index].clone().lerp(rachis[index + 1], part), direction: directions[index].clone().lerp(directions[index + 1], part).normalize() };
  };
  // The rachis: a narrow strip, facing up.
  const sideways = new THREE.Vector3(-outward.z, 0, outward.x);
  const rachisColor = shade(color, 1.3);
  const first = parts.positions.length / 3;
  for (let step = 0; step <= steps; step++) {
    const share = step / steps, width = 0.035 * (1 - 0.8 * share);
    const normal = new THREE.Vector3().crossVectors(directions[step], sideways).normalize();
    if (normal.y < 0) normal.negate();
    for (const sign of [-1, 1]) parts.vertex(rachis[step].clone().addScaledVector(sideways, sign * width), normal, rachisColor, [1, share * 0.5], palm);
  }
  for (let step = 0; step < steps; step++) {
    const here = first + step * 2;
    parts.indices.push(here, here + 1, here + 2, here + 1, here + 3, here + 2);
  }
  // Leaflets: folded up into a V from the rachis, swept a little toward its tip, drooping toward their own tips.
  for (let pair = 0; pair < leaflets; pair++) {
    const share = 0.12 + 0.86 * (pair + 0.5 * stream()) / leaflets;
    const { point: root, direction: tangent } = along(share);
    const across = new THREE.Vector3().crossVectors(up, tangent);
    if (across.lengthSq() < 1e-6) across.copy(sideways);
    across.normalize();
    const over = new THREE.Vector3().crossVectors(tangent, across).normalize();   // the rachis's up
    const leafLength = (dead ? 0.6 : 1.15) * Math.sin(Math.PI * Math.min(share * 1.05, 1)) ** 0.6 * (0.85 + 0.3 * stream());
    const ragged = !dead && stream() < 0.08;   // now and then one torn short
    for (const sign of [-1, 1]) {
      const fold = dead ? -0.9 : 0.3 + 0.1 * stream();
      let direction = across.clone().multiplyScalar(sign * Math.cos(fold)).addScaledVector(over, Math.sin(fold)).addScaledVector(tangent, 0.35).normalize();
      const segments = leaflets === LEAFLETS.near ? 3 : 2, reach = leafLength * (ragged ? 0.5 : 1) / segments;
      const tint = shade(color, 0.85 + 0.3 * stream());
      let tip = root.clone();
      const indices = [];
      for (let segment = 0; segment <= segments; segment++) {
        const width = 0.042 * (1 - segment / (segments + 0.6));
        const normal = new THREE.Vector3().crossVectors(tangent, direction).normalize();
        if (normal.y < 0) normal.negate();
        const flutter = share * 0.6 + (segment / segments) * 0.4;
        indices.push(parts.vertex(tip.clone().addScaledVector(tangent, width), normal, tint, [1, flutter], palm), parts.vertex(tip.clone().addScaledVector(tangent, -width), normal, tint, [1, flutter], palm));
        tip.addScaledVector(direction, reach);
        direction = direction.clone().addScaledVector(up, -(dead ? 0.9 : 0.75) * 2 / segments).normalize();   // drooping toward its tip
      }
      for (let segment = 0; segment < segments; segment++) {
        const [rootLeft, rootRight, nextLeft, nextRight] = indices.slice(segment * 2, segment * 2 + 4);
        parts.indices.push(rootLeft, nextLeft, rootRight, rootRight, nextLeft, nextRight);
      }
    }
  }
}

/** A small lumpy sphere (a coconut, a shrub's lump). */
function sphereParts(parts, centre, radius, color, sway, palm, squash = 1, stream = null) {
  const rows = 6, around = 8;
  const first = parts.positions.length / 3;
  for (let row = 0; row <= rows; row++) {
    const polar = (row / rows) * Math.PI;
    for (let column = 0; column < around; column++) {
      const turn = (column / around) * Math.PI * 2;
      const normal = new THREE.Vector3(Math.sin(polar) * Math.cos(turn), Math.cos(polar), Math.sin(polar) * Math.sin(turn));
      const bump = stream ? 0.85 + 0.3 * stream() : 1;
      const point = centre.clone().add(new THREE.Vector3(normal.x * radius * bump, normal.y * radius * squash * bump, normal.z * radius * bump));
      parts.vertex(point, normal, color, sway, palm);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < around; column++) {
      const here = first + row * around + column, next = first + row * around + (column + 1) % around;
      parts.indices.push(here, next, here + around, next, next + around, here + around);
    }
  }
}

/** Where the motu's middle is (x, z) and its frame (cos, sin of its turn). */
function motuFrame() {
  const bearing = THREE.MathUtils.degToRad(MOTU.bearing);
  const turn = THREE.MathUtils.degToRad(MOTU.turn);
  return { x: EYE.x + Math.sin(bearing) * MOTU.distance, z: EYE.z - Math.cos(bearing) * MOTU.distance, cos: Math.cos(turn), sin: Math.sin(turn) };
}

/** The motu's outline's reach from its middle at angle `angle` (its own frame), as a share of its half-lengths: wobbling. */
function motuReach(angle) {
  return 1 + 0.12 * Math.sin(3 * angle + 0.7) + 0.07 * Math.sin(5 * angle + 2.1) + 0.05 * Math.sin(8 * angle + 4.0);
}

/** The motu's height over the still water at `share` of its reach out from its middle: a low mound, then its slope on down under the water. */
function motuHeight(share) {
  if (share <= 1) return MOTU.height * (1 - share ** 2.2) ** 0.5 - 0.04 * share;
  return -0.04 - 1.8 * Math.min(share - 1, 1) ** 1.3;
}

/** The motu's sand, a polar grid out to twice its reach (the part under the water its shallows), coloured dry, wet and under. */
function motuGeometry(stream) {
  const rings = 34, around = 72;
  const frame = motuFrame();
  const positions = [], colors = [], indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const share = 2 * (ring / rings) ** 1.2;
    for (let column = 0; column < around; column++) {
      const angle = (column / around) * Math.PI * 2;
      const reach = motuReach(angle) * share;
      const localX = Math.cos(angle) * MOTU.half[0] * reach, localZ = Math.sin(angle) * MOTU.half[1] * reach;
      const height = motuHeight(share) + (share < 1 ? 0.04 * Math.sin(localX * 0.9 + 1.3) * Math.sin(localZ * 1.3) : 0);
      positions.push(frame.x + localX * frame.cos - localZ * frame.sin, height, frame.z + localX * frame.sin + localZ * frame.cos);
      const wet = THREE.MathUtils.smoothstep(height, 0.18, 0.02);
      const color = height < 0 ? COLORS.under : mixColor(COLORS.dry, COLORS.wet, wet);
      colors.push(...shade(color, 0.94 + 0.12 * stream()));
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let column = 0; column < around; column++) {
      const here = ring * around + column, next = ring * around + (column + 1) % around;
      indices.push(here, next, here + around, next, next + around, here + around);   // wound to face up
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Where on the motu (its own frame's offset `at`) the ground is: a Vector3 on its sand. */
function onMotu(at) {
  const frame = motuFrame();
  const angle = Math.atan2(at[1] / MOTU.half[1], at[0] / MOTU.half[0]);
  const share = Math.hypot(at[0] / MOTU.half[0], at[1] / MOTU.half[1]) / motuReach(angle);
  return new THREE.Vector3(frame.x + at[0] * frame.cos - at[1] * frame.sin, motuHeight(share) - 0.05, frame.z + at[0] * frame.sin + at[1] * frame.cos);
}

const PALM_VERTEX = /* glsl */`
uniform float uPalmTime;
uniform float uPalmWind;
uniform vec2 uPalmWindDirection;
attribute vec2 palmSway;     // the share of the crown's lean this point takes (the square of its height up the trunk), its flutter
attribute vec2 palmShape;    // its palm's height (m) and phase
attribute float palmRing;    // m up the trunk (its rings), −1 off it
varying float vPalmRing;
`;
const PALM_MOVE = /* glsl */`
  {
    float palmPhase = palmShape.y;
    float gust = 0.75 + 0.25 * sin(uPalmTime * 0.31 + palmPhase) * sin(uPalmTime * 0.17 + palmPhase * 1.7);
    float sway = uPalmWind * gust * (${LEAN.toFixed(4)} + ${SWAY.toFixed(4)} * sin(6.2831853 * ${SWAY_HERTZ.toFixed(3)} * (0.85 + 0.3 * fract(palmPhase * 0.37)) * uPalmTime + palmPhase));
    vec3 lean = vec3(uPalmWindDirection.x, 0.0, uPalmWindDirection.y) * sway * palmShape.x * palmSway.x;
    lean.y -= 0.5 * sway * sway * palmShape.x * palmSway.x;
    float flutter = palmSway.y * uPalmWind * gust * ${FLUTTER.toFixed(3)} * sin(6.2831853 * ${FLUTTER_HERTZ.toFixed(2)} * uPalmTime + dot(position.xz, vec2(2.3, 1.7)) + palmPhase);
    transformed += lean + vec3(0.4 * flutter * uPalmWindDirection.x, flutter, 0.4 * flutter * uPalmWindDirection.y);
    vPalmRing = palmRing;
  }
`;

export class Tropics {
  constructor({ envTexture, waterFog, mirrorLayer }) {
    const stream = seededRandom(SEED, 1);
    const parts = new Parts();
    for (const placed of BEACH_PALMS) {
      const foot = new THREE.Vector3(placed.x, groundHeightAt(placed.x, placed.z) - 0.05, placed.z);
      palmParts(parts, { ...placed, foot }, stream);
    }
    const frame = motuFrame();
    for (const placed of MOTU.palms) {
      // Leaning out from the motu's middle, toward the open water each stands nearest.
      const away = [placed.at[0] * frame.cos - placed.at[1] * frame.sin, placed.at[0] * frame.sin + placed.at[1] * frame.cos];
      const toward = Math.hypot(...away) > 0.5 ? away : [stream() - 0.5, stream() - 0.5];
      palmParts(parts, { foot: onMotu(placed.at), height: placed.height, lean: placed.lean, toward, curve: placed.curve, leaflets: LEAFLETS.far }, stream);
    }
    for (let index = 0; index < MOTU.shrubs; index++) {
      const at = [(stream() * 2 - 1) * MOTU.half[0] * 0.75, (stream() * 2 - 1) * MOTU.half[1] * 0.45];
      const ground = onMotu(at);
      for (let lump = 0; lump < 3; lump++) {
        const centre = ground.clone().add(new THREE.Vector3((stream() - 0.5) * 1.4, 0.35 + 0.2 * stream(), (stream() - 0.5) * 1.4));
        sphereParts(parts, centre, 0.7 + 0.6 * stream(), shade(COLORS.shrub, 0.75 + 0.5 * stream()), [0, 0.15], [1, stream() * 100], 0.55, stream);
      }
    }
    this.uniforms = { uPalmTime: { value: 0 }, uPalmWind: { value: 0.3 }, uPalmWindDirection: { value: new THREE.Vector2(0.45, -0.9).normalize() } };
    this.palms = new THREE.Mesh(parts.geometry(), this.palmMaterial(envTexture));
    this.palms.layers.enable(mirrorLayer);
    const motu = motuGeometry(stream);
    this.motuAbove = new THREE.Mesh(motu, this.motuMaterial('above', { envTexture, waterFog }));
    this.motuAbove.layers.enable(mirrorLayer);
    this.motuBelow = new THREE.Mesh(motu, this.motuMaterial('below', { envTexture, waterFog }));
    this.above = [this.palms, this.motuAbove];
    this.meshes = [this.palms, this.motuAbove, this.motuBelow];
    for (const mesh of this.meshes) { mesh.frustumCulled = false; mesh.visible = false; }
  }

  palmMaterial(envTexture) {
    const made = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, envMap: envTexture, envMapIntensity: 0.6, side: THREE.DoubleSide });
    made.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PALM_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PALM_MOVE}`);
      // The trunk's rings: the scars of fallen fronds, every RING_SPACING up it, darker grooves between paler bands.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vPalmRing;')
        .replace('#include <color_fragment>', `#include <color_fragment>
  if (vPalmRing >= 0.0) {
    float ringPhase = vPalmRing / 0.085;
    float ringBlur = fwidth(ringPhase) + 0.05;
    float groove = 1.0 - smoothstep(0.08, 0.2 + ringBlur, abs(fract(ringPhase) - 0.5) * 2.0 - 0.6);
    diffuseColor.rgb *= mix(1.0, 0.6, groove * (1.0 - smoothstep(0.4, 1.2, ringBlur)));
  }`);
    };
    made.customProgramCacheKey = () => 'tropics-palm';
    return made;
  }

  motuMaterial(side, { envTexture, waterFog }) {
    const made = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, envMap: envTexture, envMapIntensity: 0.5,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, side === 'below' ? -1 : 1, 0), 0)],
    });
    if (side === 'below') {
      made.onBeforeCompile = (shader) => {
        // Drawn where the still surface shows it, and seen from under the water fading into it (as a boulder is).
        shader.uniforms.uFogExtinction = { value: waterFog.extinction };
        shader.uniforms.uFogColor = { value: waterFog.color };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${SEEN_THROUGH_WATER}`)
          .replace('#include <project_vertex>', `vec4 motuWorld = modelMatrix * vec4(transformed, 1.0);
  vec4 mvPosition = viewMatrix * vec4(seenThroughWater(motuWorld.xyz, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uFogExtinction;\nuniform vec3 uFogColor;')
          .replace('#include <fog_fragment>', `#include <fog_fragment>
  if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));`);
      };
    }
    made.customProgramCacheKey = () => `tropics-motu-${side}`;
    return made;
  }

  /** Shown at the tropical beach (and in the warm-up), hidden elsewhere. */
  setVisible(visible) { for (const mesh of this.meshes) mesh.visible = visible; }

  /** The Wind control's strength (WIND_STRENGTHS in src/ambientWaves.js) and the direction it blows toward (x, z). */
  setWind(strength, direction) {
    this.uniforms.uPalmWind.value = strength;
    if (direction) this.uniforms.uPalmWindDirection.value.set(direction[0], direction[1]).normalize();
  }

  /** The world time (s), for the sway. */
  setTime(time) { this.uniforms.uPalmTime.value = time; }

  /** The sky's map (src/sky.js fills it in place; a new object comes with a new place). */
  setEnvironment(texture) {
    for (const mesh of this.meshes) {
      if (mesh.material.envMap === texture) continue;
      mesh.material.envMap = texture;
      mesh.material.needsUpdate = true;
    }
  }
}
