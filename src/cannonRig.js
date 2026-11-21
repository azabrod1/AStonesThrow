// The water cannon's rig (src/waterCannon.js): the pump on the bank that
// makes its pressure, the hose from it to the nozzle in the hand, and the
// suction hose it draws the pond's water up by. Scenery of the preview's
// (src/main.js buildPreview): shown while the cannon is in hand, left out
// with the preview (?preview=off, so the harness's frames stay as they were
// unless --preview=1).
//
// The pump (PUMP, pumpGeometry) is a portable fire pump of the kind carried
// to a pond, as few parts as make one: its engine under a rounded red
// housing on a grey base (fuel cap, exhaust grille, gauge; at its back the
// control panel and the starter's grip), an aluminium carrying frame of
// two skids and two handles, and at its front the pump's volute, its
// suction inlet facing the water and its delivery outlet on top. Some
// 0.48 m long and 0.42 m high, a real one's size. It stands on the nearest
// land behind the hand (place: a little to the right of the shore view's eye
// and back, walked back until all of its feet are on land: the beach, the
// Koi pond's bank, the pool's deck or the Reflecting Pool's coping, the
// caller's `landAt`), turned to face the hand. It hums while the cannon
// fires (show: a shake of a fraction of a millimetre, by real time, as the
// preview turns: no world state changes).
//
// The hoses (lay) are laid as a hose lies: out of each fitting straight
// for a moment (HOSE.lead), then down in one smooth bend to
// what it rests on, along it, and up the same way into the other fitting.
// It rests on the land, on the ice where there is ice (the caller's
// `floorAt`), and over open water it floats, low (HOSE.afloat: a hose full
// of water weighs little more than the water), so it is one hose from end to
// end; the suction hose's strainer alone goes under (HOSE.sunk). The bend from a fitting reaches as
// far out as it hangs high (HOSE.hang), and the run along the ground is
// smoothed where it goes in, so the whole is one curve, resampled to even
// rings. The delivery hose runs from the nozzle's tail (its own hose stub,
// NOZZLE's back end in src/thingMeshes.js, its radius the stub's) to the
// outlet, rewritten only when the nozzle moves; the suction hose from the
// inlet to its strainer in the water, laid when the place changes. Each is a
// tube of HOSE.segments rings of HOSE.sides, its frames carried along it so
// it never twists.
//
// One program for all of it: the nozzle's (src/main.js passes a material
// maker that gives the nozzle's program, its parameters alike, so nothing
// here compiles a program of its own), each part's colour by vertex.
import * as THREE from 'three';

export const PUMP = {
  place: { right: 0.62, back: 0.42, step: 0.05, most: 3, inland: 0.9 },   // m in the shore view's frame from its eye; walked back by `step`, no more than `most`, to land, then `inland` farther if that is land too
  foot: [0.18, 0.25],         // m: its frame's half width and half length (what must stand on land)
  shake: 0.0004,              // m: its hum while the cannon fires, at full pressure
  hum: [29, 41],              // Hz: the two tones the hum shakes at (an engine at 1800 and 2500 rpm)
  outlet: [0, 0.37, 0.25],    // the delivery coupling's mouth, in the pump's frame (z towards the hand)...
  outletWay: [0, 0.6, 0.8],   // ...and the way it points
  inlet: [0, 0.17, 0.29],     // the suction coupling's mouth...
  inletWay: [0, 0, 1],        // ...and its way
  colours: {
    housing: [0.72, 0.09, 0.06], frame: [0.7, 0.71, 0.72], alloy: [0.58, 0.6, 0.62], brass: [0.74, 0.53, 0.22],
    grille: [0.22, 0.22, 0.23], dial: [0.92, 0.91, 0.86], base: [0.3, 0.31, 0.33], panel: [0.82, 0.82, 0.8],
  },
};
export const HOSE = {
  radius: 0.7,        // in the nozzle's drawn radii (NOZZLE's hose stub: the hose is the stub's own)
  tail: -3.9,         // where the hose takes over from the stub, in its radii along its barrel (inside the stub's end)
  lead: 0.02,         // m: straight out of each fitting before it bends
  bend: [0.33, 0.5],   // a bend's arms, shares of its chord: at a fitting, and where it comes to rest (lay)
  hang: 0.55,         // the bend from a fitting reaches out this many times as far as the fitting is over what the hose rests on...
  reach: 0.08,        // ...and this much more (m)
  span: 0.8,          // m: the most of open water it spans to come down on a walled bank rather than in front of it...
  wall: 0.05,         // ...one this high over the water (m)
  drape: 1.5,         // it rests on the highest of what is within this many of its radii (restingAt)
  afloat: 0.1,        // over open water it floats, its middle this many of its radii under (a filled fire hose is near the water's own weight)...
  sunk: 0.15,         // ...but the suction hose's strainer this far under (m)
  smooth: 6,          // passes smoothing the run along the ground (each a three-point mean)
  segments: 72,
  sides: 12,
  colour: [0.6, 0.08, 0.06],
  suction: { radius: 0.026, colour: [0.16, 0.2, 0.26], out: 0.4, aside: 0.75 },   // the blue-grey suction hose: its strainer this far out from the water's edge, laid this far (rad) aside of the way the pump faces
};

/** Triangles (position, normal, colour) collected from primitives, then made one geometry (Parts.geometry). */
class Parts {
  constructor() { this.positions = []; this.normals = []; this.colours = []; }
  /** A primitive geometry (indexed or not), moved by `matrix`, of one colour. */
  add(geometry, matrix, colour) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.applyMatrix4(matrix);
    const positions = flat.attributes.position.array, normals = flat.attributes.normal.array;
    for (let index = 0; index < positions.length; index++) { this.positions.push(positions[index]); this.normals.push(normals[index]); }
    for (let vertex = 0; vertex < positions.length / 3; vertex++) this.colours.push(...colour);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  box(size, at, colour, turn = null) {
    this.add(new THREE.BoxGeometry(...size), place(at, turn), colour);
  }
  /** A cylinder of `radius` and `length` along `axis` ('x', 'y' or 'z') about `at`, squashed across it by `squash` ([its other two ways]). */
  cylinder(radius, length, at, axis, colour, sides = 16, squash = [1, 1]) {
    const turn = axis === 'x' ? new THREE.Euler(0, 0, Math.PI / 2) : axis === 'z' ? new THREE.Euler(Math.PI / 2, 0, 0) : null;
    const geometry = new THREE.CylinderGeometry(radius, radius, length, sides);
    geometry.scale(squash[0], 1, squash[1]);
    this.add(geometry, place(at, turn), colour);
  }
  /** A tube from `from` to `to` (a frame's bar). */
  bar(from, to, radius, colour) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const matrix = new THREE.Matrix4().compose(start.clone().add(end).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()), new THREE.Vector3(1, 1, 1));
    this.add(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 8, 1, true), matrix, colour);
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}
const place = (at, turn) => new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(turn ?? new THREE.Euler()), new THREE.Vector3(1, 1, 1));

/**
 * A rounded box (w, h, d), its corners and edges of `round` radius: a box's
 * corners pulled in round an inner box, each point its own normal.
 */
function roundedBox(width, height, depth, round, segments = 5) {
  const geometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const inner = [width / 2 - round, height / 2 - round, depth / 2 - round];
  const point = new THREE.Vector3(), core = new THREE.Vector3(), out = new THREE.Vector3();
  for (let vertex = 0; vertex < positions.count; vertex++) {
    point.fromBufferAttribute(positions, vertex);
    core.set(THREE.MathUtils.clamp(point.x, -inner[0], inner[0]), THREE.MathUtils.clamp(point.y, -inner[1], inner[1]), THREE.MathUtils.clamp(point.z, -inner[2], inner[2]));
    out.subVectors(point, core);
    if (out.lengthSq() < 1e-12) out.fromBufferAttribute(normals, vertex);
    out.normalize();
    positions.setXYZ(vertex, core.x + out.x * round, core.y + out.y * round, core.z + out.z * round);
    normals.setXYZ(vertex, out.x, out.y, out.z);
  }
  return geometry;
}

/** The pump's body (the header), in metres, its feet at y 0, the hand's way +z: built once. */
function pumpGeometry() {
  const { colours: c } = PUMP;
  const parts = new Parts();
  const [halfWidth, halfLength] = PUMP.foot, tube = 0.013;
  // The carrying frame: a skid each side, and a handle arched over each end.
  for (const side of [-1, 1]) parts.bar([side * halfWidth, tube, -halfLength], [side * halfWidth, tube, halfLength - 0.04], tube, c.frame);
  for (const z of [-halfLength + 0.02, 0.15]) {
    for (const side of [-1, 1]) parts.bar([side * halfWidth, tube, z], [side * (halfWidth - 0.03), 0.42, z], tube, c.frame);
    parts.bar([-(halfWidth - 0.03), 0.42, z], [halfWidth - 0.03, 0.42, z], tube, c.frame);
  }
  // The housing over the engine, rounded, its fuel cap, the exhaust's grille on its side, the gauge at its front.
  parts.add(roundedBox(0.31, 0.06, 0.38, 0.015, 3), place([0, 0.075, -0.04], null), c.base);   // the engine's base under it
  parts.add(roundedBox(0.3, 0.24, 0.36, 0.05), place([0, 0.225, -0.04], null), c.housing);
  // Its back: the control panel, the recoil starter's grip on it, the stop switch.
  parts.add(roundedBox(0.2, 0.12, 0.012, 0.004, 2), place([0, 0.22, -0.224], null), c.panel);
  parts.add(roundedBox(0.075, 0.018, 0.022, 0.008, 2), place([0.03, 0.2, -0.238], null), c.grille);
  parts.cylinder(0.011, 0.016, [-0.06, 0.245, -0.233], 'z', c.housing, 12);
  parts.cylinder(0.028, 0.03, [0.07, 0.35, -0.1], 'y', c.grille, 16);
  parts.add(roundedBox(0.012, 0.11, 0.17, 0.005, 2), place([0.15, 0.23, -0.08], null), c.grille);
  parts.cylinder(0.03, 0.012, [-0.08, 0.28, 0.14], 'z', c.frame, 20);
  parts.cylinder(0.025, 0.004, [-0.08, 0.28, 0.147], 'z', c.dial, 20);
  // The pump: its volute at the front, the suction coupling on its eye, the delivery pipe up to its coupling.
  parts.cylinder(0.095, 0.08, [0, 0.17, 0.18], 'z', c.alloy, 28);
  parts.cylinder(0.042, 0.06, [0, 0.17, PUMP.inlet[2] - 0.03], 'z', c.brass, 20);
  parts.bar([0, 0.24, 0.19], [PUMP.outlet[0], PUMP.outlet[1] - 0.02, PUMP.outlet[2] - 0.015], 0.024, c.alloy);
  parts.add(new THREE.CylinderGeometry(0.033, 0.033, 0.045, 20), new THREE.Matrix4().compose(new THREE.Vector3(PUMP.outlet[0], PUMP.outlet[1] - 0.013, PUMP.outlet[2] - 0.018),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...PUMP.outletWay).normalize()), new THREE.Vector3(1, 1, 1)), c.brass);
  return parts.geometry();
}

/** A tube's mesh of `segments` rings of `sides` (its triangles indexed once), its rings written by `tubeAlong`. */
function tubeGeometry(segments, sides, colour) {
  const rings = segments + 1, count = rings * (sides + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const colours = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex++) colours.set(colour, vertex * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const index = [];
  for (let ring = 0; ring < segments; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * (sides + 1) + side, b = a + sides + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geometry.setIndex(index);
  return geometry;
}

/**
 * The tube `geometry` (tubeGeometry) along the `points` (a Float64Array of
 * x, y, z), `radius` round: each ring square to the way there, its frame
 * carried from the last (parallel transport), so it never twists.
 */
function tubeAlong(geometry, points, radius, sides) {
  const positions = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
  const rings = points.length / 3;
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3(), last = new THREE.Vector3();
  for (let ring = 0; ring < rings; ring++) {
    const before = Math.max(ring - 1, 0) * 3, after = Math.min(ring + 1, rings - 1) * 3;
    tangent.set(points[after] - points[before], points[after + 1] - points[before + 1], points[after + 2] - points[before + 2]).normalize();
    if (ring === 0) normal.set(0, 1, 0).addScaledVector(tangent, -tangent.y);
    else normal.copy(last).addScaledVector(tangent, -last.dot(tangent));
    if (normal.lengthSq() < 1e-10) normal.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
    normal.normalize();
    last.copy(normal);
    binormal.crossVectors(tangent, normal);
    for (let side = 0; side <= sides; side++) {
      const angle = (side / sides) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
      const at = (ring * (sides + 1) + side) * 3;
      const nx = normal.x * cos + binormal.x * sin, ny = normal.y * cos + binormal.y * sin, nz = normal.z * cos + binormal.z * sin;
      normals[at] = nx; normals[at + 1] = ny; normals[at + 2] = nz;
      positions[at] = points[ring * 3] + nx * radius; positions[at + 1] = points[ring * 3 + 1] + ny * radius; positions[at + 2] = points[ring * 3 + 2] + nz * radius;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  geometry.computeBoundingSphere();
}

/** A point of the cubic from a to d by b and c, at t, into `out`. */
function cubicAt(a, b, c, d, t, out) {
  const s = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, s * s * s).addScaledVector(b, 3 * s * s * t).addScaledVector(c, 3 * s * t * t).addScaledVector(d, t * t * t);
}

export class CannonRig {
  /**
   * @param scene the main scene
   * @param material (roughness, metalness, reflection) → a material of the nozzle's program (the header)
   * @param landAt (x, z) → the land's height there (m over the still water), or null over the water
   * @param floorAt (x, z) → what a hose rests on there (the land's height, the ice's top), or null over open water
   */
  constructor({ scene, material, landAt, floorAt = landAt }) {
    this.landAt = landAt;
    this.floorAt = floorAt;
    this.pump = new THREE.Mesh(pumpGeometry(), material(0.42, 0.25, 0.8));
    this.hose = new THREE.Mesh(tubeGeometry(HOSE.segments, HOSE.sides, HOSE.colour), material(0.55, 0, 0.6));
    this.suction = new THREE.Mesh(tubeGeometry(HOSE.segments, HOSE.sides, HOSE.suction.colour), this.hose.material);
    for (const mesh of [this.pump, this.hose, this.suction]) { mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); }
    this.scene = scene;
    this.points = new Float64Array((HOSE.segments + 1) * 3);
    this.footing = new THREE.Vector3();   // where the pump stands (place)
    this.facing = 0;                      // its turn about the vertical
    this.drawn = new THREE.Matrix4();     // the nozzle as the hose was last drawn to it
    this.placed = false;
  }

  /**
   * The pump set down for the hand at `hand` (a Vector3), from the shore
   * view's eye `frame` (a Matrix4): the header's walk back to land, turned to
   * face the hand, and its suction hose laid to the water. When the place
   * changes (the land does), or the water freezes or thaws.
   */
  place(frame, hand) {
    const { right, back, step, most } = PUMP.place;
    const spot = new THREE.Vector3();
    let height = null;
    for (let walked = 0; walked <= most && height === null; walked += step) {
      spot.set(right, 0, back + walked).applyMatrix4(frame);
      this.facing = Math.atan2(hand.x - spot.x, hand.z - spot.z);
      height = this.footingAt(spot.x, spot.z, this.facing);
    }
    // A little farther up the bank, where there is bank: room for the suction hose to lie on it.
    const away = new THREE.Vector3(0, 0, PUMP.place.inland).transformDirection(frame).setY(0).normalize().multiplyScalar(PUMP.place.inland);
    const farther = height === null ? null : this.footingAt(spot.x + away.x, spot.z + away.z, this.facing);
    if (farther !== null) { spot.add(away); height = farther; this.facing = Math.atan2(hand.x - spot.x, hand.z - spot.z); }
    this.footing.set(spot.x, height ?? 0, spot.z);
    this.pump.position.copy(this.footing);
    this.pump.rotation.set(0, this.facing, 0);
    this.pump.updateMatrix();
    // The suction hose: out of the inlet, down to the ground, along it to where the water starts and into it.
    // It goes off aside (HOSE.suction.aside), so it lies clear of the delivery hose, which runs straight at the hand:
    // to whichever side reaches the water sooner.
    let strainer = null, nearest = Infinity;
    for (const side of [-1, 1]) {
      const turn = this.facing + side * HOSE.suction.aside;
      const way = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
      const edge = this.footing.clone().addScaledVector(way, PUMP.foot[1]);
      let walked = 0;
      for (; walked < most && this.landAt(edge.x, edge.z) !== null; walked += step) edge.addScaledVector(way, step);
      if (walked < nearest) { nearest = walked; strainer = edge.addScaledVector(way, HOSE.suction.out); }
    }
    this.lay(this.suction.geometry, this.pumpPoint(PUMP.inlet), this.pumpWay(PUMP.inletWay), strainer, null, HOSE.suction.radius);
    this.placed = true;
    this.drawn.elements[0] = NaN;   // the hose to be drawn again
  }

  /** The land's height under all of the pump's feet at (x, z) turned by `facing` (the highest), or null if any is over the water. */
  footingAt(x, z, facing) {
    const [halfWidth, halfLength] = PUMP.foot, cos = Math.cos(facing), sin = Math.sin(facing);
    let highest = -Infinity;
    for (const [across, along] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const height = this.landAt(x + cos * across * halfWidth + sin * along * halfLength, z - sin * across * halfWidth + cos * along * halfLength);
      if (height === null) return null;
      highest = Math.max(highest, height);
    }
    return highest;
  }

  /** A point of the pump's frame (PUMP's) in the world. */
  pumpPoint(local) { return new THREE.Vector3(...local).applyMatrix4(this.pump.matrix); }
  /** A way in the pump's frame in the world. */
  pumpWay(local) { return new THREE.Vector3(...local).normalize().applyQuaternion(this.pump.quaternion); }

  /** Where the middle of a hose of `radius` lies at (x, z): on what it rests on, or afloat in open water (the header). */
  restingAt(x, z, radius) {
    // The highest of what lies under it and just round it, so it drapes over a wall's edge rather than through it.
    let highest = null;
    const near = HOSE.drape * radius;
    for (const [dx, dz] of [[0, 0], [near, 0], [-near, 0], [0, near], [0, -near]]) {
      const floor = this.floorAt(x + dx, z + dz);
      if (floor !== null && (highest === null || floor > highest)) highest = floor;
    }
    return highest === null ? -HOSE.afloat * radius : highest + radius;
  }

  /**
   * Lay a hose of `radius` into `geometry` (the header): from `start` out
   * along `startWay`, down to rest, along, and up into `end` along the way
   * `endWay` points out of it; with no `endWay` it ends lying at `end`.
   */
  lay(geometry, start, startWay, end, endWay, radius) {
    const path = [];
    const push = (point) => path.push(point.clone());
    const out = start.clone().addScaledVector(startWay, HOSE.lead);
    const into = endWay ? end.clone().addScaledVector(endWay, HOSE.lead) : end.clone().setY(this.floorAt(end.x, end.z) === null ? -HOSE.sunk : this.restingAt(end.x, end.z, radius));
    const along = new THREE.Vector3(into.x - out.x, 0, into.z - out.z);
    if (along.lengthSq() < 1e-8) along.set(startWay.x, 0, startWay.z);
    along.normalize();
    // How far out each bend reaches: as far as its fitting hangs over where the hose comes to rest.
    const bendReach = (from) => HOSE.hang * Math.max(from.y - this.restingAt(from.x, from.z, radius), 0) + HOSE.reach;
    const outReach = bendReach(out), intoReach = endWay ? bendReach(into) : 0;
    const gap = (into.x - out.x) * along.x + (into.z - out.z) * along.z;
    // Too near to rest between them (a short span): one bend from fitting to fitting.
    const down = gap > outReach + intoReach + 0.02 ? out.clone().addScaledVector(along, outReach) : null;
    const up = down ? into.clone().addScaledVector(along, -intoReach) : null;
    const point = new THREE.Vector3();
    // A bend: a cubic leaving `from` along `fromWay` and coming into `to` along `toWay`, its arms shares of its chord,
    // short at a fitting (HOSE.bend[0]: the hose turns down soon after it, as its weight pulls) and long where it comes to
    // rest (HOSE.bend[1]: it lies down gently).
    const bend = (from, fromWay, to, toWay, fromArm, toArm) => {
      const chord = from.distanceTo(to);
      const first = from.clone().addScaledVector(fromWay, fromArm * chord), second = to.clone().addScaledVector(toWay, -toArm * chord);
      for (let step = 1; step <= 24; step++) push(cubicAt(from, first, second, to, step / 24, point));
    };
    push(start);
    push(out);
    if (!down) {
      bend(out, startWay, into, endWay ? endWay.clone().negate() : along, HOSE.bend[0], endWay ? HOSE.bend[0] : HOSE.bend[1]);
    } else {
      down.y = this.restingAt(down.x, down.z, radius);
      // Come down in open water just short of a walled bank (the Reflecting Pool's coping over its water), it would climb the
      // wall: it comes down on the bank instead, spanning the water (HOSE.span at most).
      if (this.floorAt(down.x, down.z) === null) {
        const probe = down.clone();
        for (let walked = 0; walked < HOSE.span && probe.distanceTo(up) > 0.05; walked += 0.02) {
          probe.addScaledVector(along, 0.02);
          const floor = this.floorAt(probe.x, probe.z);
          if (floor === null) continue;
          if (floor > HOSE.wall) { down.copy(probe).addScaledVector(along, HOSE.drape * radius); down.y = this.restingAt(down.x, down.z, radius); }
          break;
        }
      }
      if (endWay) up.y = this.restingAt(up.x, up.z, radius);
      bend(out, startWay, down, along, HOSE.bend[0], HOSE.bend[1]);
      // Along what it rests on, smoothed where it goes from land or ice to the water's bed.
      const run = Math.max(Math.ceil(down.distanceTo(up) / 0.02), 1), first = path.length;
      for (let step = 1; step <= run; step++) {
        point.lerpVectors(down, up, step / run);
        point.y = this.restingAt(point.x, point.z, radius);
        push(point);
      }
      for (let pass = 0; pass < HOSE.smooth; pass++) {
        for (let at = first; at < path.length - 1; at++) path[at].y = (path[at - 1].y + path[at].y + path[at + 1].y) / 3;
      }
      for (let at = first; at < path.length; at++) {
        const floor = this.floorAt(path[at].x, path[at].z);
        if (floor !== null) path[at].y = Math.max(path[at].y, this.restingAt(path[at].x, path[at].z, radius));
      }
      if (endWay) bend(up, along, into, endWay.clone().negate(), HOSE.bend[1], HOSE.bend[0]);
    }
    if (endWay) push(end);
    // Nowhere through the land or the ice.
    for (const at of path) { const floor = this.floorAt(at.x, at.z); if (floor !== null) at.y = Math.max(at.y, floor + radius); }
    // Even rings along it.
    const lengths = [0];
    for (let at = 1; at < path.length; at++) lengths.push(lengths[at - 1] + path[at].distanceTo(path[at - 1]));
    const total = lengths[lengths.length - 1];
    let segment = 1;
    for (let ring = 0; ring <= HOSE.segments; ring++) {
      const wanted = (total * ring) / HOSE.segments;
      while (segment < path.length - 1 && lengths[segment] < wanted) segment++;
      const share = (wanted - lengths[segment - 1]) / Math.max(lengths[segment] - lengths[segment - 1], 1e-9);
      point.lerpVectors(path[segment - 1], path[segment], THREE.MathUtils.clamp(share, 0, 1));
      this.points[ring * 3] = point.x; this.points[ring * 3 + 1] = point.y; this.points[ring * 3 + 2] = point.z;
    }
    tubeAlong(geometry, this.points, radius, HOSE.sides);
  }

  /**
   * Once a frame: shown with the `nozzle` mesh (the preview, or null for
   * none), the hose drawn to its tail if it moved, and the pump humming by
   * `strength` (the cannon's pressure share while firing) at the real time
   * `seconds`.
   */
  show(nozzle, strength, seconds) {
    const visible = Boolean(nozzle?.visible) && this.placed;
    for (const mesh of [this.pump, this.hose, this.suction]) mesh.visible = visible;
    if (!visible) return;
    const shake = PUMP.shake * strength;
    this.pump.position.set(
      this.footing.x + shake * Math.sin(2 * Math.PI * PUMP.hum[0] * seconds),
      this.footing.y + shake * Math.sin(2 * Math.PI * PUMP.hum[1] * seconds + 1),
      this.footing.z + shake * Math.sin(2 * Math.PI * PUMP.hum[0] * seconds + 2));
    nozzle.updateMatrix();
    if (nozzle.matrix.equals(this.drawn)) return;
    this.drawn.copy(nozzle.matrix);
    const scale = nozzle.scale.x;
    const barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(nozzle.quaternion);
    const tail = nozzle.position.clone().addScaledVector(barrel, HOSE.tail * scale);
    this.lay(this.hose.geometry, tail, barrel.negate(), this.pumpPoint(PUMP.outlet), this.pumpWay(PUMP.outletWay), HOSE.radius * scale);
  }

  /** Hidden (the preview is gone, or another thing is in hand). */
  hide() { for (const mesh of [this.pump, this.hose, this.suction]) mesh.visible = false; }

  dispose() {
    for (const mesh of [this.pump, this.hose, this.suction]) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.pump.material.dispose(); this.hose.material.dispose();
  }
}
