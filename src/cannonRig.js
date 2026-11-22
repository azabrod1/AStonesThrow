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
// caller's `landAt`; where no land within PUMP.place.most holds them all,
// there is no rig at all), turned to face the hand. It hums while the cannon
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
// last HOSE.suction.dive free to go under (on frozen water, unless a hole is
// there, the strainer lies on the ice instead). It goes to the water off to
// one side of the pump (HOSE.suction.aside), whichever reaches it sooner, or,
// where neither does (the Pool, its basin off both ways from the pump on its
// deck), the nearest way round the pump that does (HOSE.search); the
// strainer goes HOSE.suction.out into the water, or midway across water
// narrower than twice that, so it is never on the land. Each is cut into HOSE.spacing
// pieces and solved exactly at rest (lay): the bending is a band matrix, so
// its sideways way is one solve, and its height is found with the points
// that touch what holds it up held there, letting go each the ground would
// have to pull down and putting back any that went under it, till none is
// left (an active set). A beam has no corners, even where it leaves a
// support, so each hose rises off the ground in one curve into its
// coupling; a delivery hose bends no tighter than some 10 cm, the suction
// hose some 17. Its heights are what lies under the way it is solved to
// go sideways, not under the straight line between its ends. Under a gale
// (show) what floats is drawn lifted by the waves, as the splash and the
// stones are: each ring on open water by its share (lift: whole at its
// float, none HOSE.rides above it), the strainer with it, the waves summed
// at every HOSE.ridesEvery rings. The rings follow a smooth curve through the points. The
// suction hose is laid when the place changes; the delivery hose when the
// nozzle has moved, which costs well under a millisecond and makes no
// garbage (each hose keeps its working buffers and its curve), and nothing
// while it is still. Each is a tube of HOSE.segments rings of HOSE.sides, its
// frames carried along it so it never twists; the suction hose's end wears
// a strainer (strainerGeometry), seen where the water is clear.
//
// Nothing of it is black: red, blue, brass and grey. One program for all of
// it: the nozzle's (src/main.js passes a material
// maker that gives the nozzle's program, its parameters alike, so nothing
// here compiles a program of its own), each part's colour by vertex. What can
// reach under the water (the suction hose, the strainer, the stand's legs)
// has a twin in the under-water pass (`under`, sharing its geometry, of the
// material src/main.js gives for it: clipped to under the still surface and
// drawn where the surface shows it, as a boulder's under-water part is), the
// pass the water refracts, so seen from above what is under the surface is
// not cut off at the waterline; each twin is drawn only while its bounds
// reach under the water; the meshes themselves are not drawn from below
// (src/main.js hiddenFromBelow). Every mesh is culled by each pass's view.
//
// Three draws every geometry's id from Math.random: what the rig makes as it
// is placed (the stand) or as the nozzle's scale changes (the yoke) draws from
// its own stream (`random`, src/withRandom.js), never the page's, so a seeded
// throw after it draws what it always drew.
import * as THREE from 'three';
import { withRandom } from './withRandom.js';

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
  rides: 0.1,         // m: under a gale a ring rides the waves wholly afloat, less the higher it lies over its float, none this high
  ridesEvery: 4,      // the waves' height is summed at every this many rings afloat, the rest between them (the CPU's sum is dear)
  // Each hose's `load` is its weight over its bending stiffness, q/EI (m⁻³): lying on the ground and lifted by h at a
  // clamped end it leaves the ground (72 h EI / q)^(1/4) from there (the suction hose some 45 cm from its inlet, 14 cm
  // up; the delivery hose, charged and stiffer, a metre from the nozzle in the hand).
  // The suction hose: blue, its strainer `sunk` under the water, going down to it over its last `dive`, `out` from
  // the water's edge, laid `aside` (rad) of the way the pump faces, to whichever side reaches the water sooner.
  suction: { radius: 0.026, load: 250, colour: [0.12, 0.36, 0.7], sunk: 0.15, dive: 0.45, out: 0.9, aside: 0.75 },
  // Where neither way aside finds the water: this many headings round the pump, each walked up to `reach` (m) of land.
  search: { headings: 24, reach: 6 },
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
  const { colours: colour } = PUMP;
  const parts = new Parts();
  const [halfWidth, halfLength] = PUMP.foot, tube = 0.013;
  // The carrying frame: a skid each side, and a handle arched over each end.
  for (const side of [-1, 1]) parts.bar([side * halfWidth, tube, -halfLength], [side * halfWidth, tube, halfLength - 0.04], tube, colour.frame);
  for (const z of [-halfLength + 0.02, 0.15]) {
    for (const side of [-1, 1]) parts.bar([side * halfWidth, tube, z], [side * (halfWidth - 0.03), 0.42, z], tube, colour.frame);
    parts.bar([-(halfWidth - 0.03), 0.42, z], [halfWidth - 0.03, 0.42, z], tube, colour.frame);
  }
  // The housing over the engine, rounded, its fuel cap, the exhaust's grille on its side, the gauge at its front.
  parts.add(roundedBox(0.31, 0.06, 0.38, 0.015, 3), place([0, 0.075, -0.04], null), colour.base);   // the engine's base under it
  parts.add(roundedBox(0.3, 0.24, 0.36, 0.05), place([0, 0.225, -0.04], null), colour.housing);
  // Its back: the control panel, the recoil starter's grip on it, the stop switch.
  parts.add(roundedBox(0.2, 0.12, 0.012, 0.004, 2), place([0, 0.22, -0.224], null), colour.panel);
  parts.add(roundedBox(0.075, 0.018, 0.022, 0.008, 2), place([0.03, 0.2, -0.238], null), colour.blue);
  parts.cylinder(0.011, 0.016, [-0.06, 0.245, -0.233], 'z', colour.housing, 12);
  parts.cylinder(0.028, 0.03, [0.07, 0.35, -0.1], 'y', colour.blue, 16);
  parts.add(roundedBox(0.012, 0.11, 0.17, 0.005, 2), place([0.15, 0.23, -0.08], null), colour.grille);
  parts.cylinder(0.03, 0.012, [-0.08, 0.28, 0.14], 'z', colour.frame, 20);
  parts.cylinder(0.025, 0.004, [-0.08, 0.28, 0.147], 'z', colour.dial, 20);
  // The pump: its volute at the front, the suction coupling on its eye, the delivery pipe up to its coupling.
  parts.cylinder(0.095, 0.08, [0, 0.17, 0.18], 'z', colour.alloy, 28);
  parts.cylinder(0.042, 0.06, [0, 0.17, PUMP.inlet[2] - 0.03], 'z', colour.brass, 20);
  // The delivery coupling's mouth is the outlet itself, where the hose is clamped (lay). The delivery pipe rises out of
  // the volute's top and bends round into the coupling's back (a quadratic curve whose ends point up and along it).
  const outletWay = new THREE.Vector3(...PUMP.outletWay).normalize(), couplingLength = 0.045;
  const along = (distance) => new THREE.Vector3(...PUMP.outlet).addScaledVector(outletWay, distance);
  const couplingBack = along(-couplingLength), pipeFoot = new THREE.Vector3(0, 0.22, 0.15);
  const bendCorner = couplingBack.clone().addScaledVector(outletWay, -(couplingBack.z - pipeFoot.z) / outletWay.z);
  const pipeEnd = couplingBack.clone().addScaledVector(outletWay, 0.01);   // a little into the coupling, so no seam shows
  parts.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(pipeFoot, bendCorner.setX(0), pipeEnd), 24, 0.024, 20), new THREE.Matrix4(), colour.alloy);
  const onOutlet = (radius, length, middle) => parts.add(new THREE.CylinderGeometry(radius, radius, length, 24), new THREE.Matrix4().compose(along(middle),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), outletWay), new THREE.Vector3(1, 1, 1)), colour.brass);
  onOutlet(0.033, couplingLength, -couplingLength / 2);   // the coupling
  onOutlet(0.037, 0.008, -couplingLength + 0.004);        // its collar on the pipe
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
      const here = ring * (sides + 1) + side, next = here + sides + 1;
      index.push(here, here + 1, next, here + 1, next + 1, next);   // wound to face out (the ring goes round as T × N does)
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
const TUBE_FRAME = { tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), last: new THREE.Vector3() };
function tubeAlong(geometry, points, radius, sides) {
  const positions = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
  const rings = points.length / 3;
  const { tangent, normal, binormal, last } = TUBE_FRAME;
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
    this.points = new Float64Array((HOSE.segments + 1) * 3);   // as drawn (lift)
    this.still = new Float64Array((HOSE.segments + 1) * 3);    // as laid, on still water
    this.afloat = new Float32Array(HOSE.segments + 1);         // each ring's share of the gale's lift (findAfloat)
    this.floats = false;
    this.lifted = false;
    // What laying it works in, kept from one lay to the next (grown when a longer hose wants more), so that laying the
    // delivery hose each frame the nozzle moves makes no garbage for a phone to collect.
    this.capacity = 0;
    this.curve = new THREE.CatmullRomCurve3([], false, 'centripetal');
    this.curve.cacheArcLengths = new Float64Array(this.curve.arcLengthDivisions + 1);
    this.pool = [];   // the curve's points, each a Vector3 kept for good
    this.ring = new THREE.Vector3();
    this.previous = new THREE.Vector3();
    this.out = new THREE.Vector3();
    this.into = new THREE.Vector3();
  }

  /** Its working buffers, at least `count` points long. */
  room(count) {
    if (count <= this.capacity) return;
    const capacity = Math.max(count, Math.ceil(this.capacity * 1.5), 16);
    this.capacity = capacity;
    this.xs = new Float64Array(capacity); this.ys = new Float64Array(capacity); this.zs = new Float64Array(capacity);
    this.lowest = new Float64Array(capacity);
    this.fixed = new Uint8Array(capacity); this.touching = new Uint8Array(capacity);
    this.stiffness = new Float64Array(capacity * 5);
    this.free = new Int32Array(capacity); this.rowOf = new Int32Array(capacity);
    this.matrix = new Float64Array(capacity * 5); this.right = new Float64Array(capacity);
    while (this.pool.length < capacity) this.pool.push(new THREE.Vector3());
  }

  /**
   * Lay it (the header) from `start` out along `startWay` to `end`, into it
   * along the way `endWay` points out of it (clamped) or, with none, pinned
   * there, its last `dive` (m) free to go under what holds the rest up, and
   * draw it.
   */
  lay(start, startWay, end, endWay, { dive = 0, restingAt }) {
    const out = this.out.copy(start).addScaledVector(startWay, HOSE.spacing);
    const into = endWay ? this.into.copy(end).addScaledVector(endWay, HOSE.spacing) : end;
    const between = Math.max(Math.ceil(out.distanceTo(into) / HOSE.spacing), 3);
    const spacing = out.distanceTo(into) / between;
    const count = between + 2 + (endWay ? 1 : 0), last = count - 1;
    this.room(count);
    const { xs, ys, zs, lowest, fixed, touching, stiffness, free, rowOf, matrix, right } = this;
    fixed.fill(0, 0, count);
    // Its ends, held; between them, a straight way over the ground to find what it rests on along it.
    const hold = (at, point) => { xs[at] = point.x; ys[at] = point.y; zs[at] = point.z; fixed[at] = 1; };
    hold(0, start); hold(1, out); hold(last, end); if (endWay) hold(last - 1, into);
    const diving = dive > 0 ? Math.round(dive / spacing) : -1;
    // Its bending: the sum of its squared second differences, as a band matrix (the beam's stiffness, K).
    stiffness.fill(0, 0, count * 5);
    for (let middle = 1; middle < last; middle++) {
      for (let oneStep = -1; oneStep <= 1; oneStep++) {
        const one = middle + oneStep, oneWeight = oneStep === 0 ? -2 : 1;
        for (let otherStep = -1; otherStep <= 1; otherStep++) stiffness[one * 5 + otherStep - oneStep + 2] += oneWeight * (otherStep === 0 ? -2 : 1);
      }
    }
    // Its weight on each point, against its stiffness: K is Dᵀ·D, the beam's energy (EI / 2h³)·yᵀKy + q·h·Σy, so K·y = −(q/EI)·h⁴.
    const weight = this.load * spacing ** 4;
    // Least bending (and, upward, least height) with the held points held: K_free · free = −K_held · held (− weight).
    // (The free points' rows: those within two points of each other are within two rows, so the band holds.)
    const solve = (values, load, held) => {
      let size = 0;
      for (let at = 0; at < count; at++) if (!held[at]) { rowOf[at] = size; free[size++] = at; }
      matrix.fill(0, 0, size * 5);
      for (let row = 0; row < size; row++) {
        const at = free[row];
        right[row] = -load;
        for (let other = Math.max(at - 2, 0); other <= Math.min(at + 2, last); other++) {
          const entry = stiffness[at * 5 + other - at + 2];
          if (held[other]) right[row] -= entry * values[other];
          else matrix[row * 5 + rowOf[other] - row + 2] = entry;
        }
      }
      solveBand(matrix, right, size);
      for (let row = 0; row < size; row++) values[free[row]] = right[row];
    };
    solve(xs, 0, fixed);
    solve(zs, 0, fixed);
    // What it rests on, under the way it goes sideways (which bows off the straight line between its ends).
    for (let at = 0; at < count; at++) lowest[at] = fixed[at] ? -Infinity : at >= last - diving ? -Infinity : restingAt(xs[at], zs[at], this.radius);
    // Its height: on what holds it up where it touches (an active set): touching everywhere it can at first, then
    // the point the ground pulls on hardest let go, and any that went under it put back on it, till neither is left.
    touching.set(fixed.subarray(0, count));
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
    // (three's getSpacedPoints, on the one curve and its own arc-length table filled in place, as getLengths would.)
    const points = this.points, curve = this.curve, ring = this.ring, previous = this.previous, lengths = curve.cacheArcLengths;
    curve.points.length = count;
    for (let at = 0; at < count; at++) curve.points[at] = this.pool[at].set(xs[at], ys[at], zs[at]);
    const divisions = lengths.length - 1;
    let sum = 0;
    lengths[0] = 0;
    curve.getPoint(0, previous);
    for (let step = 1; step <= divisions; step++) {
      curve.getPoint(step / divisions, ring);
      sum += ring.distanceTo(previous);
      lengths[step] = sum;
      previous.copy(ring);
    }
    curve.needsUpdate = false;
    for (let at = 0; at <= HOSE.segments; at++) {
      curve.getPointAt(at / HOSE.segments, ring);
      points[at * 3] = ring.x; points[at * 3 + 1] = ring.y; points[at * 3 + 2] = ring.z;
    }
    this.still.set(points);
    this.lifted = false;
    tubeAlong(this.mesh.geometry, points, this.radius, HOSE.sides);
  }

  /**
   * How much of the gale's lift each ring takes (lift), where `floorAt`
   * (x, z) is null (open water): wholly at its float or under it, less the
   * higher over it, none HOSE.rides over it; none over land or ice.
   */
  findAfloat(floorAt) {
    const float = -HOSE.afloat * this.radius;
    let any = false;
    for (let ring = 0; ring <= HOSE.segments; ring++) {
      const height = this.still[ring * 3 + 1];
      const share = floorAt(this.still[ring * 3], this.still[ring * 3 + 2]) === null ? THREE.MathUtils.clamp(1 - (height - float) / HOSE.rides, 0, 1) : 0;
      this.afloat[ring] = share;
      any ||= share > 0;
    }
    this.floats = any;
  }

  /**
   * Under a gale, its rings afloat lifted by the water's height `surfaceAt`
   * (x, z) as drawn (the splash and the stones are, src/shaders/gale.js
   * galeLift), or put back on still water with none (surfaceAt null).
   * Returns the lift at its last ring (the suction hose's strainer).
   */
  lift(surfaceAt) {
    if (!this.floats || (!surfaceAt && !this.lifted)) return 0;
    const points = this.points, still = this.still, every = HOSE.ridesEvery, last = HOSE.segments;
    let end = 0;
    if (surfaceAt) {
      // Summed at every `every` rings (and the last), straight between: the rings afloat ride it, each by its share.
      let before = 0, beforeSummed = this.afloat[0] > 0, beforeHeight = beforeSummed ? surfaceAt(still[0], still[2]) : 0;
      for (let after = Math.min(every, last); ; after = Math.min(after + every, last)) {
        let needed = false;
        for (let ring = before; ring <= after && !needed; ring++) needed = this.afloat[ring] > 0;
        // Its start summed too where the last stretch had no need of it, so the rings afloat ride the water there, not 0.
        if (needed && !beforeSummed) beforeHeight = surfaceAt(still[before * 3], still[before * 3 + 2]);
        const afterHeight = needed ? surfaceAt(still[after * 3], still[after * 3 + 2]) : 0;
        for (let ring = before + 1; ring <= after; ring++) {
          const height = beforeHeight + ((afterHeight - beforeHeight) * (ring - before)) / (after - before);
          points[ring * 3 + 1] = still[ring * 3 + 1] + this.afloat[ring] * height;
        }
        if (after === last) { end = afterHeight * this.afloat[last]; break; }
        before = after; beforeHeight = afterHeight; beforeSummed = needed;
      }
      points[1] = still[1] + this.afloat[0] * (this.afloat[0] > 0 ? surfaceAt(still[0], still[2]) : 0);
    } else points.set(still);
    this.lifted = Boolean(surfaceAt);
    tubeAlong(this.mesh.geometry, points, this.radius, HOSE.sides);
    return end;
  }
}

export class CannonRig {
  /**
   * @param scene the main scene
   * @param material (roughness, metalness, reflection) → a material of the nozzle's program (the header)
   * @param landAt (x, z) → the land's height there (m over the still water), or null over the water
   * @param floorAt (x, z) → what a hose rests on there (the land's height, the ice's top), or null over open water
   * @param groundAt (x, z) → the ground's height there, or the bed's under the water (the stand's feet)
   * @param surfaceAt () → under a gale, (x, z) → the water's height there (its CPU sum), else null: what lifts what floats
   * @param under the under-water pass's scene, and `underMaterial` its material maker (as `material`'s): what of the rig
   *   can be under the water is drawn there too (the header), or nothing if either is missing
   * @param random the stream Math.random stands for while the rig makes geometry after it is built (the header)
   */
  constructor({ scene, material, landAt, floorAt = landAt, groundAt = (x, z) => landAt(x, z) ?? 0, surfaceAt = () => null, under = null, underMaterial = null, random = Math.random }) {
    this.random = random;
    this.landAt = landAt;
    this.surfaceAt = surfaceAt;
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
    // Culled by each pass's view (each geometry's sphere: the hoses' made again whenever they are laid or lifted, tubeAlong).
    for (const mesh of this.meshes) { mesh.visible = false; scene.add(mesh); }
    this.scene = scene;
    // Twins in the under-water pass of what can reach under the water (the suction hose, its strainer, the stand's legs),
    // sharing their geometry: the water refracts that pass, so without them what is under the surface would be cut off
    // at the waterline seen from above. Each is drawn only when its bounds reach under the still surface (showBelow).
    this.under = under && underMaterial ? under : null;
    this.below = [];
    if (this.under) {
      const rubberBelow = underMaterial(0.55, 0, 0.35), metalBelow = underMaterial(0.42, 0.25, 0.35);
      for (const [mesh, made] of [[this.suction.mesh, rubberBelow], [this.strainer, metalBelow], [this.stand, metalBelow]]) {
        const twin = new THREE.Mesh(mesh.geometry, made);
        twin.visible = false;
        this.under.add(twin);
        this.below.push({ mesh, twin });
      }
    }
    this.lowest = new THREE.Vector3();
    this.warming = false;   // the warm-up's (warmUp): the twins shown, whatever else hides them
    this.nozzleAt = new THREE.Matrix4();   // the nozzle as the delivery hose was last laid to it
    this.restingAt = (x, z, radius) => this.restOf(x, z, radius);
    // What laying the delivery hose again works in (show), kept so a sweep of the nozzle makes no garbage.
    this.relay = { barrel: new THREE.Vector3(), tail: new THREE.Vector3(), outlet: new THREE.Vector3(), outletWay: new THREE.Vector3() };
    this.deliveryLay = { restingAt: this.restingAt };
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
    // No land behind the hand wide enough for all its feet within `most`: no rig at all here (show draws none), rather
    // than a pump standing on the water.
    if (height === null) { this.placed = false; this.hide(); return; }
    const farther = this.footingAt(spot.x + away.x, spot.z + away.z, this.facing);
    if (farther !== null) { spot.add(away); height = farther; this.facing = Math.atan2(hand.x - spot.x, hand.z - spot.z); }
    this.footing.set(spot.x, height, spot.z);
    this.pump.position.copy(this.footing);
    this.pump.rotation.set(0, this.facing, 0);
    this.pump.updateMatrix();
    // The suction hose: out of the inlet, down to the ground, along it to the water and down to its strainer. It goes off
    // aside (HOSE.aside), to whichever side reaches the water sooner; where neither does within `most` (the Pool's deck,
    // its basin off both ways), straight for the nearest water round about (HOSE.search). The strainer always goes into
    // water, then: only with none within reach does it lie on the land, ahead of the pump.
    const { aside, sunk, dive } = HOSE.suction;
    let found = null;
    for (const side of [-1, 1]) {
      const along = this.waterAlong(this.facing + side * aside, most);
      if (along && (!found || along.walked < found.walked)) found = along;
    }
    if (!found) {
      for (let heading = 0; heading < HOSE.search.headings; heading++) {
        const along = this.waterAlong(this.facing + (2 * Math.PI * heading) / HOSE.search.headings, HOSE.search.reach);
        if (along && (!found || along.walked < found.walked)) found = along;
      }
    }
    const strainer = found ? found.strainer : this.footing.clone().add(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(PUMP.foot[1] + most));
    // Under ice (floorAt there, not a hole) the strainer lies on the sheet rather than going through it.
    const frozen = this.floorAt(strainer.x, strainer.z);
    const suction = this.suction;
    suction.lay(this.pumpPoint(PUMP.inlet), this.pumpWay(PUMP.inletWay), strainer.setY(frozen === null ? -sunk : frozen + HOSE.suction.radius * 1.7), null,
      { dive: frozen === null ? dive : 0, restingAt: this.restingAt });
    // The strainer on its end, along the way it comes.
    const points = suction.still, last = HOSE.segments * 3, before = last - 3;
    const way = new THREE.Vector3(points[last] - points[before], points[last + 1] - points[before + 1], points[last + 2] - points[before + 2]).normalize();
    this.strainerAt = new THREE.Vector3(points[last], points[last + 1], points[last + 2]);
    this.strainer.position.copy(this.strainerAt);
    this.strainer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), way);
    suction.findAfloat(this.floorAt);
    this.nozzleAt.elements[0] = NaN;   // the delivery hose laid to the nozzle again (show)
    // The stand under the hand, its legs parted where the hose goes down towards the pump.
    const towardPump = new THREE.Vector3(this.footing.x - hand.x, 0, this.footing.z - hand.z).normalize();
    this.stand.geometry.dispose();
    this.stand.geometry = withRandom(this.random, () => standGeometry(hand.clone().setY(hand.y - STAND.yoke - STAND.swivel), towardPump, this.groundAt));
    for (const { mesh, twin } of this.below) twin.geometry = mesh.geometry;
    this.placed = true;
  }

  /**
   * Where the suction hose finds the water going `turn` (rad about the vertical, as `facing`) from the pump's front,
   * over no more than `reach` of land: { walked, the land it crossed (m); strainer, HOSE.suction.out on into the
   * water, or midway across where the water is narrower than twice that }; null if it finds none.
   */
  waterAlong(turn, reach) {
    const { step } = PUMP.place, { out } = HOSE.suction;
    const wayX = Math.sin(turn), wayZ = Math.cos(turn);
    const edge = this.footing.clone().add(new THREE.Vector3(wayX, 0, wayZ).multiplyScalar(PUMP.foot[1]));
    let walked = 0;
    for (; this.landAt(edge.x, edge.z) !== null; walked += step) {
      if (walked >= reach) return null;
      edge.x += wayX * step; edge.z += wayZ * step;
    }
    let across = 0;
    while (across < 2 * out && this.landAt(edge.x + wayX * (across + step), edge.z + wayZ * (across + step)) === null) across += step;
    const into = across >= 2 * out ? out : across / 2;
    return { walked, strainer: edge.set(edge.x + wayX * into, 0, edge.z + wayZ * into) };
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
  pumpPoint(local, target = new THREE.Vector3()) { return target.set(...local).applyMatrix4(this.pump.matrix); }
  /** A way in the pump's frame in the world. */
  pumpWay(local, target = new THREE.Vector3()) { return target.set(...local).normalize().applyQuaternion(this.pump.quaternion); }

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
    if (!visible) { this.showBelow(false); return; }
    const shake = PUMP.shake * strength;
    this.pump.position.set(
      this.footing.x + shake * Math.sin(2 * Math.PI * PUMP.hum[0] * seconds),
      this.footing.y + shake * Math.sin(2 * Math.PI * PUMP.hum[1] * seconds + 1),
      this.footing.z + shake * Math.sin(2 * Math.PI * PUMP.hum[0] * seconds + 2));
    // Under a gale what floats rides the waves as drawn (src/shaders/gale.js galeLift): the suction hose and its strainer,
    // and the delivery hose wherever it lies on open water. Drawn only; nothing of the world changes.
    const surfaceAt = this.surfaceAt();
    const sunk = this.suction.lift(surfaceAt);
    this.strainer.position.set(this.strainerAt.x, this.strainerAt.y + sunk, this.strainerAt.z);
    this.showBelow(true);
    nozzle.updateMatrix();
    if (nozzle.matrix.equals(this.nozzleAt)) { this.delivery.lift(surfaceAt); return; }
    this.nozzleAt.copy(nozzle.matrix);
    const scale = nozzle.scale.x;
    const { barrel, tail, outlet, outletWay } = this.relay;
    barrel.set(0, 0, 1).applyQuaternion(nozzle.quaternion);
    // The clamp goes with the nozzle; the yoke turns with its heading, as wide as its pins.
    this.clamp.position.copy(nozzle.position); this.clamp.quaternion.copy(nozzle.quaternion); this.clamp.scale.copy(nozzle.scale);
    if (Math.abs(this.yokeReach - STAND.pins * scale) > 1e-6) { this.yokeReach = STAND.pins * scale; this.yoke.geometry.dispose(); this.yoke.geometry = withRandom(this.random, () => yokeGeometry(this.yokeReach)); }
    this.yoke.position.copy(nozzle.position);
    this.yoke.rotation.set(0, Math.atan2(barrel.x, barrel.z), 0);
    tail.copy(nozzle.position).addScaledVector(barrel, HOSE.delivery.tail * scale);
    this.delivery.radius = HOSE.delivery.radius * scale;
    this.delivery.lay(tail, barrel.negate(), this.pumpPoint(PUMP.outlet, outlet), this.pumpWay(PUMP.outletWay, outletWay), this.deliveryLay);
    this.delivery.findAfloat(this.floorAt);
    this.delivery.lift(surfaceAt);
  }

  /**
   * The under-water twins (the constructor's) where their meshes are, each shown with `shown` only if its bounds reach
   * under the still surface (a hose on the land or the ice, or a stand on the deck, draws nothing there).
   */
  showBelow(shown) {
    if (this.warming) return;
    const lowest = this.lowest;
    for (const { mesh, twin } of this.below) {
      twin.position.copy(mesh.position); twin.quaternion.copy(mesh.quaternion); twin.scale.copy(mesh.scale);
      const sphere = mesh.geometry.boundingSphere ?? (mesh.geometry.attributes.position ? (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere) : null);
      if (!shown || !sphere || sphere.radius < 0) { twin.visible = false; continue; }
      twin.updateMatrix();
      lowest.copy(sphere.center).applyMatrix4(twin.matrix);
      twin.visible = lowest.y - sphere.radius * twin.scale.x < 0;
    }
  }

  /**
   * For the warm-up (src/main.js warmUp): its under-water twins shown whatever they hold, so their program is built,
   * and kept shown while `on` (the preview's frame hides the rig when something else is in hand); then hidden. Only
   * those with normals: the stand's is empty until the rig is first placed, and three would build it a flat-shaded twin.
   */
  warmUp(on) {
    this.warming = on;
    for (const { twin } of this.below) twin.visible = on && Boolean(twin.geometry.attributes.normal);
  }

  /** Hidden (the preview is gone, or another thing is in hand). */
  hide() { for (const mesh of this.meshes) mesh.visible = false; this.showBelow(false); }

  dispose() {
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const { twin } of this.below) this.under.remove(twin);
    for (const made of new Set(this.below.map(({ twin }) => twin.material))) made.dispose();
  }
}
