// The water cannon's rig (src/waterCannon.js): the pump on the bank that
// makes its pressure and the suction hose it draws the pond's water up by. Scenery of the preview's
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
// The suction hose (lay) is laid as a hose lies: a beam, clamped in the
// inlet's coupling and pinned at its strainer under the water, bent by its
// weight against its stiffness (HOSE.load, q/EI), resting on the land, on
// the ice where there is ice (the caller's `floorAt`), and over open water
// floating on it (HOSE.afloat) until it goes down to the strainer
// (HOSE.dive). It starts as a rough path (out of the inlet, straight to the
// strainer over what it rests on) cut into HOSE.spacing pieces and is
// relaxed to rest: each free point in turn goes where its bending and its
// weight are least, then back onto what it rests on. A beam has no corners,
// even where it leaves a support, so it rises off the ground in one curve
// into the coupling and goes down into the water the same way; the rings
// follow a smooth curve through the points. Laid when the place changes,
// never a frame (some milliseconds): a tube of HOSE.segments rings of
// HOSE.sides, its frames carried along it so it never twists. The nozzle's
// own stub of hose is all of the delivery hose there is to see. Its end
// wears a strainer (strainerGeometry), seen where the water is clear.
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
  radius: 0.026,      // m
  spacing: 0.05,      // m: the pieces it is relaxed in, the first the coupling's own way
  load: 250,          // m⁻³: its weight over its bending stiffness, q/EI: lying on the ground and lifted by h at a clamped end it
                      // leaves the ground (72 h EI / q)^(1/4) from there (some 45 cm for the inlet's 14 cm)
  passes: 1500,       // relaxing passes
  drape: 1.5,         // it rests on the highest of what is within this many of its radii (restingAt)
  afloat: -1,         // over open water it floats on it, its middle this many of its radii under (-1: on the surface; a filled hose
                      // floats lower, but the water's surface would pare it to a sliver where it leaves the bank, so it is drawn on it)
  sunk: 0.15,         // m: its strainer this far under the water...
  dive: 0.45,         // ...going down to it over the last this much of it (m)
  out: 0.9,           // m: the strainer this far out from the water's edge...
  aside: 0.75,        // ...the hose laid this far (rad) aside of the way the pump faces, to whichever side reaches the water sooner
  segments: 96,
  sides: 12,
  colour: [0.16, 0.2, 0.26],   // blue-grey
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

/** The suction hose's strainer, in metres, from the hose's end along +y: a brass coupling, then a grey perforated drum, capped. */
function strainerGeometry() {
  const parts = new Parts(), { brass, grille } = PUMP.colours;
  parts.cylinder(HOSE.radius * 1.25, 0.03, [0, 0.015, 0], 'y', brass, 16);
  parts.cylinder(HOSE.radius * 1.7, 0.1, [0, 0.08, 0], 'y', grille, 16);
  for (let band = 0; band < 4; band++) parts.cylinder(HOSE.radius * 1.75, 0.006, [0, 0.042 + band * 0.025, 0], 'y', brass, 16);
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
    this.suction = new THREE.Mesh(tubeGeometry(HOSE.segments, HOSE.sides, HOSE.colour), material(0.55, 0, 0.6));
    this.strainer = new THREE.Mesh(strainerGeometry(), this.pump.material);   // on the hose's end (lay)
    this.meshes = [this.pump, this.suction, this.strainer];
    for (const mesh of this.meshes) { mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); }
    this.scene = scene;
    this.points = new Float64Array((HOSE.segments + 1) * 3);
    this.footing = new THREE.Vector3();   // where the pump stands (place)
    this.facing = 0;                      // its turn about the vertical
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
    // The suction hose: out of the inlet, down to the ground, along it to the water and down to its strainer. It goes off
    // aside (HOSE.aside), to whichever side reaches the water sooner.
    let strainer = null, nearest = Infinity;
    for (const side of [-1, 1]) {
      const turn = this.facing + side * HOSE.aside;
      const way = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
      const edge = this.footing.clone().addScaledVector(way, PUMP.foot[1]);
      let walked = 0;
      for (; walked < most && this.landAt(edge.x, edge.z) !== null; walked += step) edge.addScaledVector(way, step);
      if (walked < nearest) { nearest = walked; strainer = edge.addScaledVector(way, HOSE.out); }
    }
    this.lay(this.pumpPoint(PUMP.inlet), this.pumpWay(PUMP.inletWay), strainer.setY(-HOSE.sunk));
    this.placed = true;
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

  /** Where the hose's middle lies at (x, z): on what it rests on, or afloat on open water (the header). */
  restingAt(x, z) {
    // The highest of what lies under it and just round it, so it drapes over a wall's edge rather than through it.
    let highest = null;
    const near = HOSE.drape * HOSE.radius;
    for (const [dx, dz] of [[0, 0], [near, 0], [-near, 0], [0, near], [0, -near]]) {
      const floor = this.floorAt(x + dx, z + dz);
      if (floor !== null && (highest === null || floor > highest)) highest = floor;
    }
    return highest === null ? -HOSE.afloat * HOSE.radius : highest + HOSE.radius;
  }

  /**
   * Lay the suction hose (the header) from the inlet's mouth `start`, out
   * along `startWay`, to its strainer at `end` under the water: a rough path
   * relaxed to rest, then cut into even rings.
   */
  lay(start, startWay, end) {
    const spacing = HOSE.spacing;
    // The rough path: out of the coupling, then straight to the strainer, over what it rests on.
    const out = start.clone().addScaledVector(startWay, spacing);
    const count = 2 + Math.max(Math.ceil(out.distanceTo(end) / spacing), 3);
    const xs = new Float64Array(count), ys = new Float64Array(count), zs = new Float64Array(count), lowest = new Float64Array(count);
    xs[0] = start.x; ys[0] = start.y; zs[0] = start.z;
    for (let at = 1; at < count; at++) {
      const share = (at - 1) / (count - 2);
      xs[at] = out.x + (end.x - out.x) * share; zs[at] = out.z + (end.z - out.z) * share;
      ys[at] = at === 1 ? out.y : at === count - 1 ? end.y : this.restingAt(xs[at], zs[at]);
    }
    // What holds each point up: what it rests on, but along its last HOSE.dive nothing (it goes down to the strainer).
    const diving = Math.round(HOSE.dive / spacing);
    for (let at = 0; at < count; at++) lowest[at] = at >= count - 1 - diving ? -Infinity : this.restingAt(xs[at], zs[at]);
    // Relaxed to rest as a beam (the header): each free point in turn moved to where its bending (the squared second
    // differences that touch it) and its weight are least, then lifted back onto what it rests on. The first two points
    // are the coupling's (clamped: it leaves along it), the last the strainer's (pinned: any way it comes).
    const load = 0.5 * HOSE.load * spacing ** 4;
    const relax = (values, at, weight) => {
      let pulled = weight, squares = 0;
      for (let middle = at - 1; middle <= at + 1; middle++) {
        if (middle < 1 || middle > count - 2) continue;
        const own = middle === at ? -2 : 1;
        // The second difference at `middle` without this point's own part.
        const rest = values[middle - 1] - 2 * values[middle] + values[middle + 1] - own * values[at];
        pulled += own * rest; squares += own * own;
      }
      return -pulled / squares;
    };
    for (let pass = 0; pass < HOSE.passes; pass++) {
      for (let at = 2; at < count - 1; at++) {
        xs[at] = relax(xs, at, 0);
        zs[at] = relax(zs, at, 0);
        ys[at] = Math.max(relax(ys, at, load), lowest[at]);
      }
    }
    // Even rings along it, along a smooth curve through its points.
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: count }, (unused, at) => new THREE.Vector3(xs[at], ys[at], zs[at])), false, 'centripetal');
    curve.getSpacedPoints(HOSE.segments).forEach((point, ring) => { this.points[ring * 3] = point.x; this.points[ring * 3 + 1] = point.y; this.points[ring * 3 + 2] = point.z; });
    tubeAlong(this.suction.geometry, this.points, HOSE.radius, HOSE.sides);
    // The strainer on its end, along the way it comes.
    const last = HOSE.segments * 3, before = last - 3;
    const way = new THREE.Vector3(this.points[last] - this.points[before], this.points[last + 1] - this.points[before + 1], this.points[last + 2] - this.points[before + 2]).normalize();
    this.strainer.position.set(this.points[last], this.points[last + 1], this.points[last + 2]);
    this.strainer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), way);
  }

  /**
   * Once a frame: shown with the `nozzle` mesh (the preview, or null for
   * none), the pump humming by `strength` (the cannon's pressure share while
   * firing) at the real time `seconds`.
   */
  show(nozzle, strength, seconds) {
    const visible = Boolean(nozzle?.visible) && this.placed;
    for (const mesh of this.meshes) mesh.visible = visible;
    if (!visible) return;
    const shake = PUMP.shake * strength;
    this.pump.position.set(
      this.footing.x + shake * Math.sin(2 * Math.PI * PUMP.hum[0] * seconds),
      this.footing.y + shake * Math.sin(2 * Math.PI * PUMP.hum[1] * seconds + 1),
      this.footing.z + shake * Math.sin(2 * Math.PI * PUMP.hum[0] * seconds + 2));
  }

  /** Hidden (the preview is gone, or another thing is in hand). */
  hide() { for (const mesh of this.meshes) mesh.visible = false; }

  dispose() {
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
}
