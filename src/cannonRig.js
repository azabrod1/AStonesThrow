// The water cannon's rig (src/waterCannon.js): the pump on the bank that
// makes its pressure, the hose from it to the nozzle in the hand, the
// suction hose it draws the pond's water up by, and the stand that holds the
// nozzle (STAND: a portable monitor's tripod under the hand, its feet on the
// ground or the bed, its yoke turned with the nozzle's heading and holding
// a clamp band round the nozzle on pins at its middle, so the nozzle and its
// hose are held up, never in the air). Scenery of the preview's
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
// Its two hoses (Hose) are laid as hoses lie: each a beam bent by its own
// weight against its stiffness (each hose's `load`, q/EI), clamped where it
// leaves a coupling so it goes on along it, resting on the land, on the ice
// where there is ice (the caller's `floorAt`), and over open water floating
// on it (HOSE.afloat). The delivery hose (red) runs from the nozzle's own
// stub of hose (NOZZLE's back end in src/thingMeshes.js, as round as it), a
// clamped end, to the pump's outlet, another; the suction hose (blue-grey)
// from the inlet, clamped, to its strainer under the water, pinned, its
// last HOSE.suction.dive free to go under. Each is cut into HOSE.spacing
// pieces and solved exactly at rest (lay): the bending is a band matrix, so
// its sideways way is one solve, and its height is found with the points
// that touch what holds it up held there, letting go each the ground would
// have to pull down and putting back any that went under it, till none is
// left (an active set). A beam has no corners, even where it leaves a
// support, so each hose rises off the ground in one curve into its
// coupling; a delivery hose bends no tighter than some 10 cm, the suction
// hose some 17. The rings follow a smooth curve through the points. The
// suction hose is laid when the place changes; the delivery hose when the
// nozzle has moved, which costs well under a millisecond, and nothing while
// it is still. Each is a tube of HOSE.segments rings of HOSE.sides, its
// frames carried along it so it never twists; the suction hose's end wears
// a strainer (strainerGeometry), seen where the water is clear.
//
// Nothing of it is black: red, blue, brass and grey. One program for all of
// it: the nozzle's (src/main.js passes a material
// maker that gives the nozzle's program, its parameters alike, so nothing
// here compiles a program of its own), each part's colour by vertex.
import * as THREE from 'three';

export const PUMP = {
  place: { right: 0.62, back: 0.42, step: 0.05, most: 3, inland: 1.5 },   // m in the shore view's frame from its eye; walked back by `step`, no more than `most`, to land, then `inland` farther if that is land too
  foot: [0.18, 0.25],         // m: its frame's half width and half length (what must stand on land)
  shake: 0.0004,              // m: its hum while the cannon fires, at full pressure
  hum: [29, 41],              // Hz: the two tones the hum shakes at (an engine at 1800 and 2500 rpm)
  outlet: [0, 0.37, 0.25],    // the delivery coupling's mouth, in the pump's frame (z towards the hand)...
  outletWay: [0, 0.12, 0.99], // ...and the way it points
  inlet: [0, 0.17, 0.29],     // the suction coupling's mouth...
  inletWay: [0, 0, 1],        // ...and its way
  colours: {
    housing: [0.72, 0.09, 0.06], frame: [0.7, 0.71, 0.72], alloy: [0.58, 0.6, 0.62], brass: [0.74, 0.53, 0.22],
    grille: [0.46, 0.47, 0.5], dial: [0.92, 0.91, 0.86], base: [0.56, 0.58, 0.62], panel: [0.82, 0.82, 0.8], blue: [0.1, 0.3, 0.62],
  },
};
export const HOSE = {
  spacing: 0.05,      // m: about the pieces a hose is solved in, the first at each clamped end its coupling's own way
  drape: 1.5,         // it rests on the highest of what is within this many of its radii (restOf)
  afloat: -1,         // over open water it floats on it, its middle this many of its radii under (-1: on the surface; a filled hose
                      // floats lower, but the water's surface would pare it to a sliver where it leaves the bank, so it is drawn on it)
  segments: 96,
  sides: 12,
  // Each hose's `load` is its weight over its bending stiffness, q/EI (m⁻³): lying on the ground and lifted by h at a
  // clamped end it leaves the ground (72 h EI / q)^(1/4) from there (the suction hose some 45 cm from its inlet, 14 cm
  // up; the delivery hose, charged and stiffer, a metre from the nozzle in the hand).
  // The suction hose: blue, its strainer `sunk` under the water, going down to it over its last `dive`, `out` from
  // the water's edge, laid `aside` (rad) of the way the pump faces, to whichever side reaches the water sooner.
  suction: { radius: 0.026, load: 250, colour: [0.12, 0.36, 0.7], sunk: 0.15, dive: 0.45, out: 0.9, aside: 0.75 },
  // The delivery hose: red, as round as the nozzle's stub (NOZZLE's, in the nozzle's drawn radii), from where it takes
  // over from the stub (`tail`, its radii along the barrel) to the outlet.
  delivery: { radius: 0.7, load: 130, tail: -3.9, colour: [0.8, 0.12, 0.08] },
};

// The nozzle's stand (standGeometry, yokeGeometry, clampGeometry): a portable monitor's tripod under the hand. Its post
// rises from three splayed legs to a swivel; on it a yoke turns with the nozzle's heading and holds a clamp band round the
// nozzle at its middle (its origin, which the aim turns it about) on two pins across it, so the nozzle pitches in the yoke.
export const STAND = {
  pins: 1.18,         // the pins' ends, in the nozzle's drawn radii from its axis (the band round it is `band`)...
  band: [0.9, 0.17],  // ...the band's radius and half width, in its radii
  yoke: 0.1,          // m: the yoke's arms reach this far down from the pins to its crossbar...
  swivel: 0.06,       // ...and the swivel under it this far, onto the post
  splay: 0.34,        // m: the legs' feet this far out from the post...
  knee: 0.3,          // ...from a collar this far below the pins
  tube: [0.012, 0.016, 0.01],   // m: the yoke's, the post's and the legs' tubes' radii
  colours: { yoke: [0.78, 0.11, 0.07], post: [0.7, 0.71, 0.72], feet: [0.1, 0.3, 0.62] },
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
  parts.add(roundedBox(0.075, 0.018, 0.022, 0.008, 2), place([0.03, 0.2, -0.238], null), c.blue);
  parts.cylinder(0.011, 0.016, [-0.06, 0.245, -0.233], 'z', c.housing, 12);
  parts.cylinder(0.028, 0.03, [0.07, 0.35, -0.1], 'y', c.blue, 16);
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
  parts.cylinder(HOSE.suction.radius * 1.25, 0.03, [0, 0.015, 0], 'y', brass, 16);
  parts.cylinder(HOSE.suction.radius * 1.7, 0.1, [0, 0.08, 0], 'y', grille, 16);
  for (let band = 0; band < 4; band++) parts.cylinder(HOSE.suction.radius * 1.75, 0.006, [0, 0.042 + band * 0.025, 0], 'y', brass, 16);
  return parts.geometry();
}

/** The clamp band round the nozzle and its two pins, in the nozzle's own units (drawn with its transform): its axis z, its pins along x. */
function clampGeometry() {
  const parts = new Parts(), [radius, half] = STAND.band, red = STAND.colours.yoke;
  parts.cylinder(radius, 2 * half, [0, 0, 0], 'z', red, 32);
  for (const side of [-1, 1]) parts.cylinder(0.14, STAND.pins - radius + 0.04, [side * (radius + STAND.pins) / 2, 0, 0], 'x', red, 12);
  return parts.geometry();
}

/** The yoke (the header), in metres about the pins' axis, turned with the nozzle's heading (+z), for pins `reach` (m) out either side. */
function yokeGeometry(reach) {
  const parts = new Parts(), { yoke: down, swivel } = STAND, tube = STAND.tube[0], red = STAND.colours.yoke;
  const arm = reach + tube;
  for (const side of [-1, 1]) {
    parts.cylinder(tube * 1.6, 0.02, [side * arm, 0, 0], 'x', red, 12);   // the boss each pin turns in
    parts.bar([side * arm, 0, 0], [side * arm, -down, 0], tube, red);
  }
  parts.bar([-arm, -down, 0], [arm, -down, 0], tube, red);
  parts.cylinder(STAND.tube[1] * 1.5, swivel, [0, -down - swivel / 2, 0], 'y', STAND.colours.post, 16);
  return parts.geometry();
}

/**
 * The tripod (the header) in the world: its post from `top` (a Vector3, the swivel's foot) down past its collar, and
 * three legs out from the collar to feet on `groundAt`, the gap between two of them facing `away` (unit, level: the
 * way the hose goes, so it drops between them).
 */
function standGeometry(top, away, groundAt) {
  const parts = new Parts(), [, postTube, legTube] = STAND.tube, { post, feet } = STAND.colours;
  const collar = top.clone().setY(top.y - (STAND.knee - STAND.yoke - STAND.swivel));
  const facing = Math.atan2(away.z, away.x);
  for (const turn of [Math.PI / 3, Math.PI, -Math.PI / 3]) {
    const angle = facing + turn;
    const footX = collar.x + Math.cos(angle) * STAND.splay, footZ = collar.z + Math.sin(angle) * STAND.splay;
    const foot = new THREE.Vector3(footX, groundAt(footX, footZ) + 0.012, footZ);
    parts.bar(collar.toArray(), foot.toArray(), legTube, post);
    parts.cylinder(0.022, 0.024, foot.toArray(), 'y', feet, 12);
  }
  parts.bar(top.toArray(), [collar.x, collar.y - 0.05, collar.z], postTube, post);
  parts.cylinder(postTube * 1.8, 0.04, collar.toArray(), 'y', STAND.colours.yoke, 16);
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
      index.push(a, a + 1, b, a + 1, b + 1, b);   // wound to face out (the ring goes round as T × N does)
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

/**
 * Solve `matrix` · solution = `right`, in place, for a band matrix of
 * `size` rows stored five to a row (its diagonals from two left of the
 * main one to two right: a beam's bending, symmetric and positive, so no
 * pivoting is wanted).
 */
function solveBand(matrix, right, size) {
  const at = (row, column) => row * 5 + column - row + 2;
  for (let pivot = 0; pivot < size; pivot++) {
    for (let row = pivot + 1; row <= Math.min(pivot + 2, size - 1); row++) {
      const factor = matrix[at(row, pivot)] / matrix[at(pivot, pivot)];
      for (let column = pivot; column <= Math.min(pivot + 2, size - 1); column++) matrix[at(row, column)] -= factor * matrix[at(pivot, column)];
      right[row] -= factor * right[pivot];
    }
  }
  for (let row = size - 1; row >= 0; row--) {
    let sum = right[row];
    for (let column = row + 1; column <= Math.min(row + 2, size - 1); column++) sum -= matrix[at(row, column)] * right[column];
    right[row] = sum / matrix[at(row, row)];
  }
}

/**
 * A hose laid as a beam (the header): its points, clamped at its start
 * (the first two, along its coupling) and clamped (the last two) or pinned
 * (the last) at its end, at rest under its weight on what `restingAt` says
 * it rests on, and drawn as a tube along a smooth curve through them.
 */
class Hose {
  constructor(mesh, radius, load) {
    this.mesh = mesh;
    this.radius = radius;
    this.load = load;   // its weight over its bending stiffness, q/EI (m⁻³)
    this.points = new Float64Array((HOSE.segments + 1) * 3);
  }

  /**
   * Lay it (the header) from `start` out along `startWay` to `end`, into it
   * along the way `endWay` points out of it (clamped) or, with none, pinned
   * there, its last `dive` (m) free to go under what holds the rest up, and
   * draw it.
   */
  lay(start, startWay, end, endWay, { dive = 0, restingAt }) {
    const out = start.clone().addScaledVector(startWay, HOSE.spacing);
    const into = endWay ? end.clone().addScaledVector(endWay, HOSE.spacing) : end;
    const between = Math.max(Math.ceil(out.distanceTo(into) / HOSE.spacing), 3);
    const spacing = out.distanceTo(into) / between;
    const count = between + 2 + (endWay ? 1 : 0), last = count - 1;
    const xs = new Float64Array(count), ys = new Float64Array(count), zs = new Float64Array(count), lowest = new Float64Array(count);
    const fixed = new Uint8Array(count);
    // Its ends, held; between them, a straight way over the ground to find what it rests on along it.
    const hold = (at, point) => { xs[at] = point.x; ys[at] = point.y; zs[at] = point.z; fixed[at] = 1; };
    hold(0, start); hold(1, out); hold(last, end); if (endWay) hold(last - 1, into);
    const diving = dive > 0 ? Math.round(dive / spacing) : -1;
    for (let at = 0; at < count; at++) {
      const share = THREE.MathUtils.clamp((at - 1) / between, 0, 1);
      lowest[at] = at >= last - diving ? -Infinity : restingAt(out.x + (into.x - out.x) * share, out.z + (into.z - out.z) * share, this.radius);
    }
    // Its bending: the sum of its squared second differences, as a band matrix (the beam's stiffness, K).
    const stiffness = new Float64Array(count * 5);
    for (let middle = 1; middle < last; middle++) {
      for (const [one, oneWeight] of [[middle - 1, 1], [middle, -2], [middle + 1, 1]]) {
        for (const [other, otherWeight] of [[middle - 1, 1], [middle, -2], [middle + 1, 1]]) stiffness[one * 5 + other - one + 2] += oneWeight * otherWeight;
      }
    }
    const weight = 0.5 * this.load * spacing ** 4;   // its weight on each point, against its stiffness
    // Least bending (and, upward, least height) with the held points held: K_free · free = −K_held · held (− weight).
    const solve = (values, load, held) => {
      const free = [];
      for (let at = 0; at < count; at++) if (!held[at]) free.push(at);
      const size = free.length, matrix = new Float64Array(size * 5), right = new Float64Array(size);
      for (let row = 0; row < size; row++) {
        const at = free[row];
        right[row] = -load;
        for (let other = Math.max(at - 2, 0); other <= Math.min(at + 2, last); other++) {
          const entry = stiffness[at * 5 + other - at + 2];
          if (held[other]) right[row] -= entry * values[other];
          else matrix[row * 5 + free.indexOf(other, Math.max(row - 2, 0)) - row + 2] = entry;
        }
      }
      solveBand(matrix, right, size);
      free.forEach((at, row) => { values[at] = right[row]; });
    };
    solve(xs, 0, fixed);
    solve(zs, 0, fixed);
    // Its height: on what holds it up where it touches (an active set): touching everywhere it can at first, then
    // the point the ground pulls on hardest let go, and any that went under it put back on it, till neither is left.
    const touching = Uint8Array.from(fixed);
    for (let at = 0; at < count; at++) if (!fixed[at] && lowest[at] > -Infinity) { touching[at] = 1; ys[at] = lowest[at]; }
    for (let round = 0; round < 4 * count; round++) {
      solve(ys, weight, touching);
      let under = false;
      for (let at = 0; at < count; at++) if (!touching[at] && ys[at] < lowest[at] - 1e-9) { touching[at] = 1; ys[at] = lowest[at]; under = true; }
      if (under) continue;
      // What the ground does at each point it holds: K·y + weight; below nothing it pulls the hose down, so it lets go.
      let pulled = -1e-12, letGo = -1;
      for (let at = 0; at < count; at++) {
        if (fixed[at] || !touching[at]) continue;
        let force = weight;
        for (let other = Math.max(at - 2, 0); other <= Math.min(at + 2, last); other++) force += stiffness[at * 5 + other - at + 2] * ys[other];
        if (force < pulled) { pulled = force; letGo = at; }
      }
      if (letGo < 0) break;
      touching[letGo] = 0;
    }
    // Even rings along a smooth curve through its points.
    const points = this.points;
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: count }, (unused, at) => new THREE.Vector3(xs[at], ys[at], zs[at])), false, 'centripetal');
    curve.getSpacedPoints(HOSE.segments).forEach((point, ring) => { points[ring * 3] = point.x; points[ring * 3 + 1] = point.y; points[ring * 3 + 2] = point.z; });
    tubeAlong(this.mesh.geometry, points, this.radius, HOSE.sides);
  }
}

export class CannonRig {
  /**
   * @param scene the main scene
   * @param material (roughness, metalness, reflection) → a material of the nozzle's program (the header)
   * @param landAt (x, z) → the land's height there (m over the still water), or null over the water
   * @param floorAt (x, z) → what a hose rests on there (the land's height, the ice's top), or null over open water
   * @param groundAt (x, z) → the ground's height there, or the bed's under the water (the stand's feet)
   */
  constructor({ scene, material, landAt, floorAt = landAt, groundAt = (x, z) => landAt(x, z) ?? 0 }) {
    this.landAt = landAt;
    this.floorAt = floorAt;
    this.groundAt = groundAt;
    this.pump = new THREE.Mesh(pumpGeometry(), material(0.42, 0.25, 0.8));
    const rubber = material(0.55, 0, 0.6);
    this.suction = new Hose(new THREE.Mesh(tubeGeometry(HOSE.segments, HOSE.sides, HOSE.suction.colour), rubber), HOSE.suction.radius, HOSE.suction.load);
    this.delivery = new Hose(new THREE.Mesh(tubeGeometry(HOSE.segments, HOSE.sides, HOSE.delivery.colour), rubber), 0, HOSE.delivery.load);
    this.strainer = new THREE.Mesh(strainerGeometry(), this.pump.material);   // on the suction hose's end
    this.stand = new THREE.Mesh(new THREE.BufferGeometry(), this.pump.material);    // its tripod (place)
    this.yoke = new THREE.Mesh(new THREE.BufferGeometry(), this.pump.material);     // its yoke, turned with the nozzle (show)
    this.clamp = new THREE.Mesh(clampGeometry(), this.pump.material);               // the band round the nozzle, with it
    this.yokeReach = 0;
    this.meshes = [this.pump, this.suction.mesh, this.delivery.mesh, this.strainer, this.stand, this.yoke, this.clamp];
    for (const mesh of this.meshes) { mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); }
    this.scene = scene;
    this.nozzleAt = new THREE.Matrix4();   // the nozzle as the delivery hose was last laid to it
    this.restingAt = (x, z, radius) => this.restOf(x, z, radius);
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
    const { aside, out, sunk, dive } = HOSE.suction;
    for (const side of [-1, 1]) {
      const turn = this.facing + side * aside;
      const way = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
      const edge = this.footing.clone().addScaledVector(way, PUMP.foot[1]);
      let walked = 0;
      for (; walked < most && this.landAt(edge.x, edge.z) !== null; walked += step) edge.addScaledVector(way, step);
      if (walked < nearest) { nearest = walked; strainer = edge.addScaledVector(way, out); }
    }
    const suction = this.suction;
    suction.lay(this.pumpPoint(PUMP.inlet), this.pumpWay(PUMP.inletWay), strainer.setY(-sunk), null, { dive, restingAt: this.restingAt });
    // The strainer on its end, along the way it comes.
    const points = suction.points, last = HOSE.segments * 3, before = last - 3;
    const way = new THREE.Vector3(points[last] - points[before], points[last + 1] - points[before + 1], points[last + 2] - points[before + 2]).normalize();
    this.strainer.position.set(points[last], points[last + 1], points[last + 2]);
    this.strainer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), way);
    this.nozzleAt.elements[0] = NaN;   // the delivery hose laid to the nozzle again (show)
    // The stand under the hand, its legs parted where the hose goes down towards the pump.
    const towardPump = new THREE.Vector3(this.footing.x - hand.x, 0, this.footing.z - hand.z).normalize();
    this.stand.geometry.dispose();
    this.stand.geometry = standGeometry(hand.clone().setY(hand.y - STAND.yoke - STAND.swivel), towardPump, this.groundAt);
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

  /** Where the middle of a hose of `radius` lies at (x, z): on what it rests on, or afloat on open water (the header). */
  restOf(x, z, radius) {
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
   * Once a frame: shown with the `nozzle` mesh (the preview, or null for
   * none), the pump humming by `strength` (the cannon's pressure share while
   * firing) at the real time `seconds`, and the delivery hose laid to the
   * nozzle again when the nozzle has moved (no work at all while it is still).
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
    nozzle.updateMatrix();
    if (nozzle.matrix.equals(this.nozzleAt)) return;
    this.nozzleAt.copy(nozzle.matrix);
    const scale = nozzle.scale.x;
    const barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(nozzle.quaternion);
    // The clamp goes with the nozzle; the yoke turns with its heading, as wide as its pins.
    this.clamp.position.copy(nozzle.position); this.clamp.quaternion.copy(nozzle.quaternion); this.clamp.scale.copy(nozzle.scale);
    if (Math.abs(this.yokeReach - STAND.pins * scale) > 1e-6) { this.yokeReach = STAND.pins * scale; this.yoke.geometry.dispose(); this.yoke.geometry = yokeGeometry(this.yokeReach); }
    this.yoke.position.copy(nozzle.position);
    this.yoke.rotation.set(0, Math.atan2(barrel.x, barrel.z), 0);
    const tail = nozzle.position.clone().addScaledVector(barrel, HOSE.delivery.tail * scale);
    this.delivery.radius = HOSE.delivery.radius * scale;
    this.delivery.lay(tail, barrel.negate(), this.pumpPoint(PUMP.outlet), this.pumpWay(PUMP.outletWay), { restingAt: this.restingAt });
  }

  /** Hidden (the preview is gone, or another thing is in hand). */
  hide() { for (const mesh of this.meshes) mesh.visible = false; }

  dispose() {
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
}
