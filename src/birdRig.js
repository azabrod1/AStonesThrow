// A flying bird's skeleton posed (src/birdMeshes.js skins its model with
// it): from a pose (src/birds.js: where it is, its heading, climb and bank,
// its wingbeat's phase and how hard it beats), each joint's matrix, model
// space to world.
//
// The joints (JOINTS): the body, the head, the tail, and each wing's
// shoulder, elbow and wrist. A model's vertex is skinned to one joint or
// blended between two (src/birdMeshes.js).
//
// The wingbeat (flapAngles) is a bird's, not a hinge's: the phase runs
// through a downstroke (`down` of the cycle) and an upstroke, the shoulder's
// elevation a cosine over each (still at the top and the bottom, so the
// stroke never jerks); the hand follows the arm a little late (`lag`: the
// wave runs out along the wing); on the upstroke the wing is drawn in, the
// elbow flexed and the hand swept back and up (`flex`: the "flex gait" of
// gulls and pigeons, little in a heron, none in an eagle's shallow beats),
// and on the downstroke it is spread and twisted nose down a little at the
// hand (pronation, which gives the thrust). How hard it beats (`beat`, 0 to
// 1) eases between that and its glide (`glide`: its dihedral at the shoulder
// and the hand's droop or lift: an eagle's shallow V, a frigatebird's
// crooked M, a gull's arched hand), so a bird going from a glide into
// flapping does so smoothly whatever the phase. The body rises a little on
// the downstroke and sinks on the upstroke, against the wings.
// Each kind's numbers are its FLIGHT entry; angles in radians.
import * as THREE from 'three';

export const JOINTS = { body: 0, head: 1, tail: 2, rightShoulder: 3, rightElbow: 4, rightWrist: 5, leftShoulder: 6, leftElbow: 7, leftWrist: 8 };
export const JOINT_COUNT = 9;

const degrees = THREE.MathUtils.degToRad;

/**
 * Each kind's flight: its wingbeat's `amplitude` (the shoulder's swing either side of its middle), where that middle
 * is (`centre`, up from level), the downstroke's share of the cycle, the hand's lag (a share of the cycle) and how
 * much it adds to the swing, the upstroke's `flex` (0 to 1), the downstroke's pronation at the hand, the body's rise
 * (m per m of span) and its glide: the shoulder's dihedral, the hand's angle from the arm, the hand swept back.
 */
export const FLIGHT = {
  fishEagle: { amplitude: degrees(32), centre: degrees(6), down: 0.52, lag: 0.1, handSwing: 0.45, flex: 0.25, pronation: degrees(10), rise: 0.012,
    glide: { dihedral: degrees(7), hand: degrees(-3), sweep: degrees(6) } },
};

const scratch = { matrix: new THREE.Matrix4(), rotation: new THREE.Matrix4(), quaternion: new THREE.Quaternion(), euler: new THREE.Euler(), vector: new THREE.Vector3() };

/** The shoulder's, elbow's and wrist's angles at a phase (0 to 2π) and beat (0 to 1): see the header. */
export function flapAngles(flight, phase, beat) {
  const cycle = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  const stroke = (at) => {
    const wrapped = (at % 1 + 1) % 1;
    const along = wrapped < flight.down ? wrapped / flight.down : 1 + (wrapped - flight.down) / (1 - flight.down);   // 0 to 1 down, 1 to 2 up
    return { height: Math.cos(Math.PI * along), along };
  };
  const now = stroke(cycle), late = stroke(cycle - flight.lag);
  const upstroke = now.along > 1 ? Math.sin(Math.PI * (now.along - 1)) ** 2 : 0;
  const downstroke = now.along <= 1 ? Math.sin(Math.PI * now.along) : 0;
  const { glide } = flight;
  const flapping = {
    shoulder: flight.centre + flight.amplitude * now.height,
    hand: flight.amplitude * flight.handSwing * (late.height - now.height) + degrees(8) * upstroke * flight.flex,
    elbowSweep: degrees(25) * flight.flex * upstroke,
    handSweep: degrees(12) + degrees(55) * flight.flex * upstroke,
    twist: -flight.pronation * downstroke,
    rise: now.height,
  };
  const share = THREE.MathUtils.clamp(beat, 0, 1);
  const mix = (gliding, flapped) => gliding + (flapped - gliding) * share;
  return {
    shoulder: mix(glide.dihedral, flapping.shoulder),
    hand: mix(glide.hand, flapping.hand),
    elbowSweep: mix(0, flapping.elbowSweep),
    handSweep: mix(glide.sweep, flapping.handSweep),
    twist: mix(0, flapping.twist),
    rise: share * flapping.rise,
  };
}

/** A rotation about an axis through a point (model space), into `out`. */
function about(out, point, axis, angle) {
  scratch.quaternion.setFromAxisAngle(axis, angle);
  out.makeTranslation(point.x, point.y, point.z);
  out.multiply(scratch.rotation.makeRotationFromQuaternion(scratch.quaternion));
  return out.multiply(scratch.matrix.makeTranslation(-point.x, -point.y, -point.z));
}

const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
const local = new THREE.Matrix4(), step = new THREE.Matrix4(), world = new THREE.Matrix4();
const shoulderMatrix = new THREE.Matrix4(), shoulderWorld = new THREE.Matrix4(), elbowMatrix = new THREE.Matrix4(), elbowWorld = new THREE.Matrix4(), wristMatrix = new THREE.Matrix4();
const jointPoint = new THREE.Vector3();

/**
 * The joints' matrices (a Float32Array of JOINT_COUNT × 16, into `out`) for a model (its `joints`: the shoulder,
 * elbow and wrist of the right wing, the neck and the tail's root, model space, src/birdMeshes.js) posed as `pose`
 * (src/birds.js) with its kind's `flight`.
 */
export function poseJoints(out, model, flight, pose) {
  const angles = flapAngles(flight, pose.phase ?? 0, pose.beat ?? 0);
  // The body: placed, headed (about up, 0 along +x, turning toward −z), climbing (nose up) and banked (right wing down
  // for a right turn: pose.bank > 0), and risen against the wings.
  scratch.euler.set(pose.bank ?? 0, pose.heading ?? 0, pose.pitch ?? 0, 'YZX');
  world.makeRotationFromEuler(scratch.euler);
  world.setPosition(pose.x, pose.y + angles.rise * flight.rise * model.span, pose.z);
  world.toArray(out, JOINTS.body * 16);
  // The head: turned to look (about up at the neck).
  about(local, model.joints.neck, AXIS_Y, (pose.look ?? 0) * 0.5);
  step.multiplyMatrices(world, local).toArray(out, JOINTS.head * 16);
  // The tail: spread follows the beat a little; tilted down as it climbs (it steers).
  about(local, model.joints.tail, AXIS_Z, -(pose.pitch ?? 0) * 0.4);
  step.multiplyMatrices(world, local).toArray(out, JOINTS.tail * 16);
  for (const side of [1, -1]) {
    const { shoulder, elbow, wrist } = model.joints;
    const at = (point) => jointPoint.set(point.x, point.y, point.z * side);
    // Shoulder: raised (about the body's axis: up for either wing), swept, twisted about the span.
    const raise = side > 0 ? -1 : 1;   // a rotation about +x lowers the right wing (+z)
    about(shoulderMatrix, at(shoulder), AXIS_X, raise * angles.shoulder);
    shoulderMatrix.multiply(about(local, at(shoulder), AXIS_Z, angles.twist * 0.4));
    shoulderWorld.multiplyMatrices(world, shoulderMatrix);
    shoulderWorld.toArray(out, (side > 0 ? JOINTS.rightShoulder : JOINTS.leftShoulder) * 16);
    // Elbow: swept forward on the upstroke (the forearm comes in).
    about(elbowMatrix, at(elbow), AXIS_Y, side * angles.elbowSweep);
    elbowWorld.multiplyMatrices(shoulderWorld, elbowMatrix);
    elbowWorld.toArray(out, (side > 0 ? JOINTS.rightElbow : JOINTS.leftElbow) * 16);
    // Wrist: the hand bent up or down from the arm, swept back, twisted (pronation).
    about(wristMatrix, at(wrist), AXIS_X, raise * angles.hand);
    wristMatrix.multiply(about(local, at(wrist), AXIS_Y, -side * angles.handSweep));
    wristMatrix.multiply(about(local, at(wrist), AXIS_Z, angles.twist));
    step.multiplyMatrices(elbowWorld, wristMatrix).toArray(out, (side > 0 ? JOINTS.rightWrist : JOINTS.leftWrist) * 16);
  }
  return out;
}
