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
// the downstroke and sinks on the upstroke, against the wings. A bounding
// songbird shuts its wings between bursts (`fold`, 0 to 1): each wing is
// lowered to its side, swept back along the body and drawn in about its
// shoulder, so it lies folded on the back as a perched bird's does.
// Each kind's numbers are its FLIGHT entry; angles in radians.
import * as THREE from 'three';

export const JOINTS = {
  body: 0, head: 1, tail: 2, rightShoulder: 3, rightElbow: 4, rightWrist: 5, leftShoulder: 6, leftElbow: 7, leftWrist: 8,
  // A standing bird's (poseStanding): each leg's hip, heel and foot, and its neck's chain from the breast up (twelve
  // joints, NECK_SHARES: so few that any two links' bend stayed big enough to show as a kink, so many that each link is
  // all but straight and the neck bends smoothly in any line it is laid in).
  rightHip: 12, rightHeel: 13, rightFoot: 14, leftHip: 15, leftHeel: 16, leftFoot: 17,
  neck: [9, 10, 11, 18, 19, 20, 21, 22, 23, 24, 25, 26],
};
export const JOINT_COUNT = 27;
// Where the neck's joints are along its middle line, a share of the way from the breast to the nape (JOINTS.neck's
// order; src/birdMeshes.js buildStandingModel places them, and the nape is the head's).
export const NECK_SHARES = JOINTS.neck.map((joint, index) => 0.04 + index * 0.08);

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
  // A heron: deep, slow, bowed beats, mostly below the level (its wings arched down in a glide), hardly any flex, its
  // body bobbing against them.
  heron: { amplitude: degrees(38), centre: degrees(-7), down: 0.55, lag: 0.12, handSwing: 0.5, flex: 0.12, pronation: degrees(8), rise: 0.022,
    glide: { dihedral: degrees(-4), hand: degrees(-14), sweep: degrees(4) } },
  // Songbirds: deep, quick beats, the wing drawn right in on the upstroke (a passerine's flex gait), the body bobbing
  // with each. The cardinal's are deeper and quicker still, in bursts between bounds with its wings shut (src/birds.js
  // FLAPPING.bounding; `fold` here).
  blueJay: { amplitude: degrees(48), centre: degrees(8), down: 0.5, lag: 0.08, handSwing: 0.4, flex: 0.7, pronation: degrees(12), rise: 0.03,
    glide: { dihedral: degrees(4), hand: degrees(-4), sweep: degrees(8) } },
  // A gull: moderate beats, the hand drawn in and swept back on each upstroke (its flex gait), gliding with its arm
  // raised a little and its hand drooped, the gull's arched wing.
  herring: { amplitude: degrees(38), centre: degrees(6), down: 0.52, lag: 0.1, handSwing: 0.5, flex: 0.55, pronation: degrees(10), rise: 0.014,
    glide: { dihedral: degrees(6), hand: degrees(-10), sweep: degrees(10) } },
  cardinal: { amplitude: degrees(55), centre: degrees(10), down: 0.5, lag: 0.06, handSwing: 0.35, flex: 0.85, pronation: degrees(12), rise: 0.03,
    glide: { dihedral: degrees(4), hand: degrees(-4), sweep: degrees(8) } },
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
  // Its wings shut in flight (`fold`, 0 to 1: a songbird's bound between bursts of beats) as a standing bird's are
  // (poseStanding): shrunk to the shoulder and swept back, inside the body's picture of its folded wings.
  const fold = THREE.MathUtils.clamp(pose.fold ?? 0, 0, 1);
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
    about(shoulderMatrix, at(shoulder), AXIS_X, raise * angles.shoulder * (1 - fold));
    shoulderMatrix.multiply(about(local, at(shoulder), AXIS_Z, angles.twist * 0.4));
    if (fold > 0) {
      shoulderMatrix.multiply(about(local, at(shoulder), AXIS_Y, side * degrees(70) * fold));
      const shrink = 1 - 0.94 * fold;
      shoulderMatrix.multiply(local.makeTranslation(shoulder.x, shoulder.y, shoulder.z * side).multiply(step.makeScale(shrink, shrink, shrink)).multiply(scratch.matrix.makeTranslation(-shoulder.x, -shoulder.y, -shoulder.z * side)));
    }
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

// ---- a standing bird (the heron) -----------------------------------------------------------------------------------
//
// Its model (src/birdMeshes.js buildStandingModel) is its photograph's pose: neck in a loose S, legs straight down, wings
// folded (its side picture shows them). poseStanding moves it from there:
//   - the body placed at its hips: standing, its feet's height (pose.y) and its legs' (lower as it crouches); flying, pose.y;
//   - the trunk: slimmed in flight (pose.slim), its breast plumes laid flat;
//   - the neck: each link's direction in the side's plane eased between drawn in onto the shoulders (neck 0; tucked tighter in
//     flight, pose.tuck), the
//     photograph's (NECK_PHOTO) and stretched up (1) (NECK_POSES); a strike (pose.strike, 0 to 1) throws it forward and
//     down in one line, the bill to the water before its feet; turned to look (pose.look), the head and the upper neck
//     sharing the turn (LOOK_SHARES);
//   - the legs: standing, each foot set where it should be (planted, or swung forward a step: pose.stride, pose.walking)
//     and the hip and heel solved to reach it (two bones in the side's plane, the heel bending back as a heron's does);
//     flying, swung back to trail straight behind (pose.legs 0), the toes curled;
//   - the wings: folded away into the body (pose.fold 1: shrunk to the shoulder and swept back, inside the trunk's
//     picture of its folded wings), spread and beating as FLIGHT's wingbeat (src/birdRig.js flapAngles) as they open.
const NECK_PHOTO = 0.55;
// The neck's directions in the side's plane (degrees from forward, up positive), at six places along it from the
// breast up to the nape (NECK_POSE_AT, shares of the way), and the head's (nape to bill): drawn in (an S folded down
// onto the shoulders, as a heron rests and flies), stretched up, and striking (one line forward and down, the bill
// pointing down at the water). Each link of the chain (NECK_SHARES) takes the direction at its middle, read off the
// line through them (linear in angle, so the neck's curvature changes only gradually: the S has no corners).
const NECK_POSE_AT = [0.14, 0.3, 0.46, 0.62, 0.775, 0.925];
const NECK_POSES = {
  drawnIn: [58, 40, -8, -14, 70, 135, 0],
  // Drawn in as it flies (pose.tuck): folded right back, the head laid on the shoulders, bill level, the neck's lower
  // loop hanging below it as the heron's keel-like bulge, as in every photograph of one flying.
  flying: [28, -22, -58, 0, 78, 140, 2],
  stretched: [72, 80, 88, 90, 86, 80, -4],
  strike: [-34, -38, -42, -46, -50, -53, -70],
};
/** A pose's directions (degrees) for each link of the chain, then the head's. */
function linkDirections(table) {
  const ends = [...NECK_SHARES, 1];
  const links = NECK_SHARES.map((share, index) => {
    const middle = (share + ends[index + 1]) / 2;
    if (middle <= NECK_POSE_AT[0]) return table[0];
    const after = NECK_POSE_AT.findIndex((at) => at >= middle);
    if (after < 0) return table[NECK_POSE_AT.length - 1];
    const before = after - 1;
    return table[before] + (table[after] - table[before]) * (middle - NECK_POSE_AT[before]) / (NECK_POSE_AT[after] - NECK_POSE_AT[before]);
  });
  return [...links, table[NECK_POSE_AT.length]];
}
const NECK_LINKS = Object.fromEntries(Object.entries(NECK_POSES).map(([name, table]) => [name, linkDirections(table)]));
// Its look (pose.look) shared along the chain, as a bird turns its head: the head turning most, the upper neck
// swivelling under it (its links from LOOK_FROM of the way up, more toward the top), the lower neck not at all. Each
// share turns its link about the body's up, so the neck's S keeps upright and swings round to where it looks.
const LOOK_HEAD = 0.5, LOOK_FROM = 0.5;
const LOOK_SHARES = (() => {
  const weights = NECK_SHARES.map((share) => Math.max(share - LOOK_FROM, 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return [...weights.map((weight) => (1 - LOOK_HEAD) * weight / total), LOOK_HEAD];
})();
const lookAxis = new THREE.Vector3();
const FLIGHT_TRUNK = { depth: 0.28, width: 0.12 };   // shares the trunk's depth and width are slimmed by in flight
const CROUCH_DROP = 0.09;      // m the hips sink in a full crouch
const TRAIL = degrees(-100);   // the hip's swing back, legs trailing in flight
const TRAIL_SLIM = degrees(-4);   // and further back as its trunk is slimmed (pose.slim), its thighs drawn up into its belly
const STEP_LIFT = 0.07;        // m a walking foot is lifted at the middle of its swing
export const STEP_LENGTH = 0.13;   // m a foot moves a step (two steps a stride), src/birds.js walks it so

const legScratch = { solved: new THREE.Vector2(), heel: new THREE.Vector2() };
const bodyWorld = new THREE.Matrix4();

/** The angle of a 2D vector (x, y), from +x toward +y. */
const angleOf = (x, y) => Math.atan2(y, x);

/**
 * Two bones from `hip` reaching `target` (model x, y): tibia `upper` long, tarsus `lower`; the heel behind the line from
 * hip to target. Returns the tibia's and the tarsus's angles (angleOf).
 */
function solveLeg(hip, target, upper, lower) {
  let reachX = target.x - hip.x, reachY = target.y - hip.y;
  let reach = Math.hypot(reachX, reachY);
  const most = (upper + lower) * 0.999;
  if (reach > most) { reachX *= most / reach; reachY *= most / reach; reach = most; }
  const toTarget = angleOf(reachX, reachY);
  const atHip = Math.acos(THREE.MathUtils.clamp((upper * upper + reach * reach - lower * lower) / (2 * upper * reach), -1, 1));
  // The heel behind: for a leg reaching down (toTarget about −π/2), the tibia turned clockwise... toward −x.
  const tibia = toTarget - atHip;
  const heelX = hip.x + Math.cos(tibia) * upper, heelY = hip.y + Math.sin(tibia) * upper;
  return { tibia, tarsus: angleOf(target.x - heelX, target.y - heelY) };
}

/**
 * The joints' matrices (into `out`) for a standing kind's model (src/birdMeshes.js buildStandingModel: its `skeleton`)
 * posed as `pose` (src/birds.js), with its kind's `flight` for its wingbeat.
 */
export function poseStanding(out, model, flight, pose) {
  const { skeleton } = model;
  const flying = pose.flying !== false;
  const legsDown = THREE.MathUtils.clamp(pose.legs ?? (flying ? 0 : 1), 0, 1);
  const crouch = pose.crouch ?? 0;
  const angles = flapAngles(flight, pose.phase ?? 0, pose.beat ?? 0);
  // The body: at its hips.
  const hipsY = (flying ? pose.y : pose.y + skeleton.hipsHeight) - CROUCH_DROP * crouch + (flying ? angles.rise * flight.rise * model.span * (1 - (pose.fold ?? 0)) : 0);
  scratch.euler.set(pose.bank ?? 0, pose.heading ?? 0, pose.pitch ?? 0, 'YZX');
  bodyWorld.makeRotationFromEuler(scratch.euler);
  bodyWorld.setPosition(pose.x, hipsY, pose.z);
  // In flight its trunk slimmed (pose.slim, 0 to 1; flying, 1 unless given): the photograph's is a standing heron's,
  // its breast plumes hanging loose, which aloft are laid flat; its back kept where it is (the wings' roots) and its
  // belly drawn up to it, a little narrower too (FLIGHT_TRUNK).
  const slim = THREE.MathUtils.clamp(pose.slim ?? (flying ? 1 : 0), 0, 1);
  if (slim > 0) {
    const backY = skeleton.wing.shoulder.y;
    local.makeTranslation(0, backY, 0).scale(scratch.vector.set(1, 1 - FLIGHT_TRUNK.depth * slim, 1 - FLIGHT_TRUNK.width * slim)).multiply(world.makeTranslation(0, -backY, 0));
    step.multiplyMatrices(bodyWorld, local);
    step.toArray(out, JOINTS.body * 16);
    step.toArray(out, JOINTS.tail * 16);
  } else {
    bodyWorld.toArray(out, JOINTS.body * 16);
    bodyWorld.toArray(out, JOINTS.tail * 16);
  }
  // The neck's chain: each link's direction (the photograph's, or toward a pose's), bent at its joint by what turns its
  // rest direction to that, less what the links before it turned already.
  const neck = THREE.MathUtils.clamp(pose.neck ?? NECK_PHOTO, 0, 1);
  const tuck = THREE.MathUtils.clamp(pose.tuck ?? (flying ? 1 : 0), 0, 1);
  const strike = THREE.MathUtils.clamp(pose.strike ?? 0, 0, 1);
  const chain = [...JOINTS.neck, JOINTS.head];
  const look = (pose.look ?? 0) * (1 - strike);
  step.copy(bodyWorld);
  let turned = 0;
  chain.forEach((joint, index) => {
    const rest = skeleton.neckRest[index];
    const drawnIn = degrees(NECK_LINKS.drawnIn[index] + (NECK_LINKS.flying[index] - NECK_LINKS.drawnIn[index]) * tuck);
    let direction = neck < NECK_PHOTO ? drawnIn + (rest - drawnIn) * (neck / NECK_PHOTO)
      : rest + (degrees(NECK_LINKS.stretched[index]) - rest) * ((neck - NECK_PHOTO) / (1 - NECK_PHOTO));
    direction += (degrees(NECK_LINKS.strike[index]) - direction) * strike;
    const bend = direction - rest - turned;
    turned += bend;
    const point = skeleton.neck[index];
    about(local, jointPoint.set(point.x, point.y, 0), AXIS_Z, bend);
    // Its share of the look, about the body's up: the chain has turned this link `turned` about the side's normal
    // (the bends before it and its own), so the body's up is, in the link's own frame, up turned back by as much.
    if (look !== 0 && LOOK_SHARES[index] > 0) local.multiply(about(world, jointPoint, lookAxis.set(Math.sin(turned), Math.cos(turned), 0), look * LOOK_SHARES[index]));
    step.multiply(local);
    step.toArray(out, joint * 16);
  });
  // The legs.
  skeleton.legs.forEach((leg, index) => {
    const [hipJoint, heelJoint, footJoint] = index === 0 ? [JOINTS.rightHip, JOINTS.rightHeel, JOINTS.rightFoot] : [JOINTS.leftHip, JOINTS.leftHeel, JOINTS.leftFoot];
    // Where its foot should be (model space): planted where it stood, the hips sunk over it; walking, a step forward or
    // back of it (the stance foot sliding back under the body as it goes on, the other swung forward and lifted).
    const walking = pose.walking ?? 0;
    const cycle = (((pose.stride ?? 0) + index * 0.5) % 1 + 1) % 1;
    let footX = leg.foot.x, footY = leg.foot.y + CROUCH_DROP * crouch;
    if (walking > 0) {
      const half = STEP_LENGTH / 2;
      if (cycle < 0.5) footX += walking * (half - cycle * 2 * STEP_LENGTH);
      else {
        const swing = (cycle - 0.5) * 2;
        const eased = swing * swing * (3 - 2 * swing);
        footX += walking * (-half + eased * STEP_LENGTH);
        footY += walking * STEP_LIFT * Math.sin(Math.PI * swing);
      }
    }
    const solved = solveLeg(leg.hip, { x: footX, y: footY }, leg.upper, leg.lower);
    // Trailing: the whole leg swung back from its rest, straight.
    const trailTibia = leg.restTibia + TRAIL + TRAIL_SLIM * slim, trailTarsus = trailTibia;
    const tibia = trailTibia + (solved.tibia - trailTibia) * legsDown;
    const tarsus = trailTarsus + (solved.tarsus - trailTarsus) * legsDown;
    const hipTurn = tibia - leg.restTibia, heelTurn = tarsus - leg.restTarsus - hipTurn;
    about(local, jointPoint.set(leg.hip.x, leg.hip.y, leg.z), AXIS_Z, hipTurn);
    shoulderWorld.multiplyMatrices(bodyWorld, local).toArray(out, hipJoint * 16);
    about(local, jointPoint.set(leg.heel.x, leg.heel.y, leg.z), AXIS_Z, heelTurn);
    elbowWorld.multiplyMatrices(shoulderWorld, local).toArray(out, heelJoint * 16);
    // The toes level with the body standing; curled back along the tarsus trailing.
    const toes = -(hipTurn + heelTurn) * legsDown + degrees(-60) * (1 - legsDown);
    about(local, jointPoint.set(leg.foot.x, leg.foot.y, leg.z), AXIS_Z, toes);
    step.multiplyMatrices(elbowWorld, local).toArray(out, footJoint * 16);
  });
  // The wings: folded (shrunk to the shoulder and swept back) as `fold`, and beating as they open.
  const fold = THREE.MathUtils.clamp(pose.fold ?? 0, 0, 1);
  const { shoulder, elbow, wrist } = skeleton.wing;
  for (const side of [1, -1]) {
    const raise = side > 0 ? -1 : 1;
    const shoulderPoint = new THREE.Vector3(shoulder.x, shoulder.y, shoulder.z * side);
    about(shoulderMatrix, shoulderPoint, AXIS_X, raise * angles.shoulder * (1 - fold));
    shoulderMatrix.multiply(about(local, shoulderPoint, AXIS_Y, side * degrees(70) * fold));
    const shrink = 1 - 0.94 * fold;
    shoulderMatrix.multiply(local.makeTranslation(shoulderPoint.x, shoulderPoint.y, shoulderPoint.z).scale(scratch.vector.set(shrink, shrink, shrink)).multiply(world.makeTranslation(-shoulderPoint.x, -shoulderPoint.y, -shoulderPoint.z)));
    shoulderMatrix.multiply(about(local, shoulderPoint, AXIS_Z, angles.twist * 0.4));
    shoulderWorld.multiplyMatrices(bodyWorld, shoulderMatrix).toArray(out, (side > 0 ? JOINTS.rightShoulder : JOINTS.leftShoulder) * 16);
    about(elbowMatrix, jointPoint.set(elbow.x, elbow.y, elbow.z * side), AXIS_Y, side * angles.elbowSweep);
    elbowWorld.multiplyMatrices(shoulderWorld, elbowMatrix).toArray(out, (side > 0 ? JOINTS.rightElbow : JOINTS.leftElbow) * 16);
    about(wristMatrix, jointPoint.set(wrist.x, wrist.y, wrist.z * side), AXIS_X, raise * angles.hand);
    wristMatrix.multiply(about(local, jointPoint, AXIS_Y, -side * angles.handSweep));
    wristMatrix.multiply(about(local, jointPoint, AXIS_Z, angles.twist));
    step.multiplyMatrices(elbowWorld, wristMatrix).toArray(out, (side > 0 ? JOINTS.rightWrist : JOINTS.leftWrist) * 16);
  }
  return out;
}
