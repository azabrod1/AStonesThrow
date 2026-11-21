// The water cannon's rig (src/waterCannon.js): the pump on the bank that
// makes its pressure, the hose from it to the nozzle in the hand, and the
// suction hose it draws the pond's water up by. Scenery of the preview's
// (src/main.js buildPreview): shown while the cannon is in hand, left out
// with the preview (?preview=off, so the harness's frames stay as they were
// unless --preview=1).
//
// The pump (PUMP, pumpGeometry) is a portable fire pump of the kind carried
// to a pond: a tubular cage on two skids, a small engine at its back (red
// block, finned head, fuel tank, air filter, exhaust), the pump's volute at
// its front with the delivery outlet on top and the suction inlet below.
// Some 0.5 m long and 0.42 m high, a real one's size. It stands on the
// nearest land behind the hand (place: a little to the right of the shore
// view's eye and back, walked back until all four of its feet are on land:
// the beach, the Koi pond's bank, the pool's deck or the Reflecting Pool's
// coping, the caller's `landAt`), turned to face the hand. It hums while the
// cannon fires (show: a shake of a fraction of a millimetre, by real time,
// as the preview turns: no world state changes).
//
// The hose (HOSE) runs from the nozzle's tail (its own hose stub, NOZZLE's
// back end in src/thingMeshes.js) to the outlet: a cubic leaving each end
// along its fitting, sagging between (HOSE.sag of the gap), and kept HOSE
// radius clear of the land and the still water. Rewritten only when the
// nozzle moves (a tube of HOSE.segments rings of HOSE.sides, its frames
// carried along it so it never twists). The suction hose goes from the inlet
// down to the ground and along it to the water's edge and into the water,
// where its strainer lies out of sight (built when the place changes).
//
// One program for all of it: the nozzle's (src/main.js passes a material
// maker that gives the nozzle's program, its parameters alike, so nothing
// here compiles a program of its own), each part's colour by vertex.
import * as THREE from 'three';

export const PUMP = {
  place: { right: 0.62, back: 0.42, step: 0.05, most: 3, inland: 0.35 },   // m in the shore view's frame from its eye; walked back by `step`, no more than `most`, to land, then `inland` farther if that is land too
  foot: [0.2, 0.27],          // m: its skids' half width and half length (what must stand on land)
  shake: 0.0004,              // m: its hum while the cannon fires, at full pressure
  hum: [29, 41],              // Hz: the two tones the hum shakes at (an engine at 1800 and 2500 rpm)
  outlet: [0, 0.39, 0.13],    // the delivery coupling's mouth, in the pump's frame (z towards the hand)...
  outletWay: [0, 0.55, 0.83], // ...and the way it points
  inlet: [0, 0.1, 0.27],      // the suction coupling's mouth...
  inletWay: [0, -0.2, 0.98],  // ...and its way
  colours: {
    frame: [0.07, 0.07, 0.075], red: [0.62, 0.05, 0.04], fins: [0.16, 0.16, 0.17], alloy: [0.62, 0.64, 0.66], steel: [0.3, 0.3, 0.31],
    brass: [0.72, 0.5, 0.2], black: [0.025, 0.025, 0.028], dial: [0.9, 0.9, 0.86], tank: [0.66, 0.06, 0.04],
  },
};
export const HOSE = {
  radius: 0.7,        // in the nozzle's drawn radii (NOZZLE's hose stub: the hose is the stub's own)
  tail: -3.95,        // where the stub ends, in its radii along its barrel
  sag: 0.22,          // the hose sags this share of the gap between its ends
  leave: 0.35,        // and leaves each end along its fitting for this share of it
  segments: 48,
  sides: 10,
  colour: [0.56, 0.07, 0.055],
  suction: { radius: 0.026, colour: [0.11, 0.115, 0.12], under: 0.18, out: 0.35 },   // the black suction hose: its strainer this far under the water and out from its edge
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

/** The pump's body (the header), in metres, its feet at y 0, the hand's way +z: built once. */
function pumpGeometry() {
  const { colours: c } = PUMP;
  const parts = new Parts();
  // The cage: two skids, four posts, a top frame and a cross bar over the engine.
  const [halfWidth, halfLength] = PUMP.foot, top = 0.42, bar = 0.011;
  for (const side of [-1, 1]) {
    parts.box([0.035, 0.025, 2 * halfLength], [side * halfWidth, 0.0125, 0], c.frame);
    parts.bar([side * halfWidth, 0.02, -halfLength + 0.03], [side * halfWidth, top, -halfLength + 0.06], bar, c.frame);
    parts.bar([side * halfWidth, 0.02, halfLength - 0.03], [side * halfWidth, top, halfLength - 0.06], bar, c.frame);
    parts.bar([side * halfWidth, top, -halfLength + 0.06], [side * halfWidth, top, halfLength - 0.06], bar, c.frame);
  }
  for (const z of [-halfLength + 0.06, halfLength - 0.06, -0.04]) parts.bar([-halfWidth, top, z], [halfWidth, top, z], bar, c.frame);
  parts.box([2 * halfWidth, 0.012, 0.05], [0, 0.03, -0.05], c.frame);   // the engine's bed
  // The engine: its block, the finned head slanted up behind, the crankcase cover, the air filter and the exhaust.
  parts.box([0.2, 0.15, 0.2], [-0.02, 0.115, -0.08], c.red);
  for (let fin = 0; fin < 6; fin++) parts.box([0.13, 0.008, 0.13], [-0.06, 0.2 + fin * 0.014, -0.1], c.fins, new THREE.Euler(0, 0, 0.35));
  parts.cylinder(0.075, 0.03, [0.095, 0.11, -0.08], 'x', c.red, 20);           // the recoil starter's cover...
  parts.box([0.012, 0.012, 0.05], [0.115, 0.15, -0.08], c.black);               // ...its pull handle
  parts.cylinder(0.05, 0.06, [-0.14, 0.24, -0.02], 'x', c.black, 16);           // the air filter
  parts.cylinder(0.035, 0.15, [0.12, 0.25, -0.15], 'z', c.steel, 12);           // the exhaust
  parts.cylinder(0.045, 0.13, [0.125, 0.255, -0.15], 'z', c.fins, 12, [1, 0.6]); // its heat shield, flattened over it
  // The fuel tank over it all on two brackets, rounded, its cap.
  for (const z of [-0.17, -0.03]) parts.box([0.2, 0.06, 0.012], [0, 0.29, z], c.frame);
  parts.cylinder(0.1, 0.27, [0, 0.355, -0.1], 'x', c.tank, 24, [0.55, 1]);
  parts.cylinder(0.022, 0.02, [0.07, 0.41, -0.13], 'y', c.black, 12);
  // The pump: its volute, the delivery pipe up and forward to its coupling, the gauge, the suction coupling below.
  parts.cylinder(0.085, 0.11, [0, 0.14, 0.12], 'x', c.alloy, 24);
  parts.cylinder(0.05, 0.05, [0.075, 0.14, 0.12], 'x', c.alloy, 20);
  parts.bar([0, 0.2, 0.12], [PUMP.outlet[0], PUMP.outlet[1] - 0.03, PUMP.outlet[2] - 0.02], 0.026, c.alloy);
  parts.add(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 20), new THREE.Matrix4().compose(new THREE.Vector3(PUMP.outlet[0], PUMP.outlet[1] - 0.012, PUMP.outlet[2] - 0.008),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...PUMP.outletWay).normalize()), new THREE.Vector3(1, 1, 1)), c.brass);
  parts.cylinder(0.032, 0.012, [-0.07, 0.27, 0.15], 'z', c.black, 20);          // the gauge's bezel...
  parts.cylinder(0.026, 0.004, [-0.07, 0.27, 0.1585], 'z', c.dial, 20);         // ...and its dial
  parts.bar([-0.035, 0.25, 0.13], [-0.07, 0.27, 0.145], 0.006, c.brass);
  parts.bar([0, 0.1, 0.18], [PUMP.inlet[0], PUMP.inlet[1], PUMP.inlet[2] - 0.03], 0.034, c.alloy);
  parts.add(new THREE.CylinderGeometry(0.042, 0.042, 0.045, 20), new THREE.Matrix4().compose(new THREE.Vector3(PUMP.inlet[0], PUMP.inlet[1], PUMP.inlet[2] - 0.015),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...PUMP.inletWay).normalize()), new THREE.Vector3(1, 1, 1)), c.brass);
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
   */
  constructor({ scene, material, landAt }) {
    this.landAt = landAt;
    this.pump = new THREE.Mesh(pumpGeometry(), material(0.55, 0.35, 0.9));
    this.hose = new THREE.Mesh(tubeGeometry(HOSE.segments, HOSE.sides, HOSE.colour), material(0.5, 0, 0.7));
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
   * changes (the land does).
   */
  place(frame, hand) {
    const { right, back, step, most } = PUMP.place;
    const spot = new THREE.Vector3(), forward = new THREE.Vector3();
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
    const inlet = this.pumpPoint(PUMP.inlet), way = this.pumpWay(PUMP.inletWay);
    forward.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    const edge = this.footing.clone();
    for (let walked = 0; walked < most && this.landAt(edge.x, edge.z) !== null; walked += step) edge.addScaledVector(forward, step);
    const strainer = edge.clone().addScaledVector(forward, HOSE.suction.out).setY(-HOSE.suction.under);
    const ground = this.footing.clone().addScaledVector(forward, PUMP.foot[1] + 0.12);
    ground.y = (this.landAt(ground.x, ground.z) ?? 0) + HOSE.suction.radius;
    const brink = edge.clone().setY(HOSE.suction.radius + Math.max(this.landAt(edge.x - forward.x * step, edge.z - forward.z * step) ?? 0, 0));
    const path = [inlet, inlet.clone().addScaledVector(way, 0.06), ground, brink, strainer];
    const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    const point = new THREE.Vector3();
    for (let ring = 0; ring <= HOSE.segments; ring++) {
      curve.getPointAt(ring / HOSE.segments, point);
      this.points[ring * 3] = point.x; this.points[ring * 3 + 1] = point.y; this.points[ring * 3 + 2] = point.z;
    }
    tubeAlong(this.suction.geometry, this.points, HOSE.suction.radius, HOSE.sides);
    this.placed = true;
    this.drawn.elements[0] = NaN;   // the hose to be drawn again
  }

  /** The land's height under all four of the pump's feet at (x, z) turned by `facing` (the highest), or null if any is over the water. */
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
    this.drawHose(nozzle);
  }

  /** The hose from the nozzle's tail to the pump's outlet (the header). */
  drawHose(nozzle) {
    const scale = nozzle.scale.x;
    const barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(nozzle.quaternion);
    const start = nozzle.position.clone().addScaledVector(barrel, HOSE.tail * scale);
    const end = this.pumpPoint(PUMP.outlet), outward = this.pumpWay(PUMP.outletWay);
    const gap = start.distanceTo(end);
    const first = start.clone().addScaledVector(barrel, -HOSE.leave * gap);
    const second = end.clone().addScaledVector(outward, HOSE.leave * gap);
    // The sag: its weight pulls the control points down, the far one (by the pump, where the hose hangs) more; the near one
    // little, so the hose leaves the stub straight before it bends down (the stub is stiff, the hose's first span with it).
    first.y -= 0.4 * HOSE.sag * gap; second.y -= 1.6 * HOSE.sag * gap;
    const radius = HOSE.radius * scale, point = new THREE.Vector3();
    for (let ring = 0; ring <= HOSE.segments; ring++) {
      cubicAt(start, first, second, end, ring / HOSE.segments, point);
      // Never through the land or the water: it lies on them.
      const floor = Math.max(this.landAt(point.x, point.z) ?? 0, 0) + radius;
      this.points[ring * 3] = point.x; this.points[ring * 3 + 1] = Math.max(point.y, floor); this.points[ring * 3 + 2] = point.z;
    }
    tubeAlong(this.hose.geometry, this.points, radius, HOSE.sides);
  }

  /** Hidden (the preview is gone, or another thing is in hand). */
  hide() { for (const mesh of [this.pump, this.hose, this.suction]) mesh.visible = false; }

  dispose() {
    for (const mesh of [this.pump, this.hose, this.suction]) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.pump.material.dispose(); this.hose.material.dispose();
  }
}
