// The throwing machine (the Effects setting's Throwing machine, src/main.js): a rail
// launcher that stands where the hand is, so a throw leaves from something
// rather than from the air. It is scenery of the preview's, as the water
// cannon's rig is (src/cannonRig.js): nothing of the throw changes. The thing
// leaves from the hand's point (src/main.js handPosition, a skip's let down)
// with the velocity a hand would give it; the machine is drawn so that the
// thing about to be thrown sits on its sled at that point, its rail along
// that velocity, and after a throw it reloads by real time, drawn only.
//
// The mount. The hand's point never moves, whatever the aim, so the machine
// turns about it: its rail pitches on a pin whose axis runs through the
// loaded thing's middle, carried on a post beside it (the fork), and the
// fork turns about the vertical through it on a turntable `depth` under it
// (MACHINE.depth: deep enough that the rail's back end, swung down for a lob,
// passes behind the turntable and the mast; shallower for a skip, the hand
// let down to 0.3 m), on a telescoping mast and a tripod whose feet stand on
// whatever is under the hand (the caller's `groundAt`: the beach, the Koi
// pond's bank, the pool's deck, the ice, or the bed under the shallows: at
// the lake and the Reflecting Pool the hand is over the water, and the
// tripod wades, as the water cannon's stand does).
//
// The head (headGeometry), in its own frame: x along the launch, y the rail's
// up, z across it, its origin the loaded thing's middle at the muzzle. An
// extruded aluminium channel, the sled riding in it on a rodless pneumatic
// cylinder along its right side (the sled's carriage on the cylinder), an
// air receiver under that, a valve block and its hose at the breech, the
// pitch plate and its sector gear on the left (the pin's side), rubber
// buffers at the muzzle; and over the breech a closed magazine, a box the
// next things wait in, out of sight, so a reload comes out of it and not
// out of the air. Its size is the thing's (fitFor): the cradle as far under
// the thing's middle as its lowest point, the magazine as wide as it is
// across and tall enough for a few, the rail long enough for the sled to run
// from under the magazine to the muzzle (MACHINE.rail).
//
// The reload (CYCLE), after each throw, by real time: the sled is at the
// muzzle as the thing leaves (it is let go at the hand's point, at once:
// the stroke is done), the head kicks back a centimetre and settles, the
// sled runs back to the breech, the next thing is pushed down out of the
// magazine onto it, and the sled carries it up to the muzzle. About 0.6 s,
// as long as the preview used to be gone; a throw before it ends fires at
// once, as a throw always could (the cycle starts again). Nothing of the
// world changes: it is drawn, as the preview turns, from the time since the
// throw (show).
//
// Nothing of it is black: aluminium, grey paint, orange, blue and steel. One
// program for all of it, the nozzle's (src/main.js gives the material maker,
// as for the cannon's rig): the head, its sled, the fork and the stand are
// four meshes coloured by vertex; the stand has a twin in the under-water
// pass (`under`) for its legs in the shallows. Three draws each geometry's id
// from Math.random: whatever is built after the start is built with the
// machine's own stream (`random`), so a seeded throw draws what it always drew.
import * as THREE from 'three';
import { Parts, roundedBox } from './cannonRig.js';
import { withRandom } from './withRandom.js';

export const MACHINE = {
  // The rail: at least `least` long, else as long as two magazines' half widths and `travel` (the sled's run from
  // under the magazine to the muzzle); its channel's inner half width, walls' height, web's thickness and sheet; how far
  // past the loaded thing's middle it ends at the muzzle.
  rail: { least: 0.4, travel: 0.22, half: 0.046, wall: 0.05, web: 0.012, sheet: 0.008, muzzle: 0.075 },
  sled: { length: 0.11, height: 0.032, width: 0.084 },
  // The turntable this far under the hand's point: for a toss or a lob, and for a skip (the hand let down); at least
  // `clear` over the ground, and at least `under` below the loaded thing's lowest point.
  depth: { throw: 0.62, skip: 0.22, clear: 0.14, under: 0.12 },
  stand: { splay: 0.36, mast: 0.024, inner: 0.019, leg: 0.014, foot: 0.022 },
  pitch: [-20, 80],   // degrees: the rail's travel, and no steeper than keeps all of it above the turntable (steepestFor)
  above: 0.035,       // m: the least the rail keeps over the turntable's top
  // The magazine: as wide as the thing across plus `gap`, as tall as `stack` of it (at least `least`, at most the
  // thing's height and `most` more).
  magazine: { gap: 0.012, stack: 2.4, least: 0.16, most: 0.12, sheet: 0.004 },
  colours: {
    alloy: [0.6, 0.58, 0.55], paint: [0.33, 0.32, 0.3], orange: [0.9, 0.36, 0.06], steel: [0.52, 0.51, 0.49],
    blue: [0.1, 0.32, 0.66], rubber: [0.4, 0.39, 0.37], receiver: [0.66, 0.64, 0.6], brass: [0.7, 0.5, 0.2],
  },
};
// The reload after a throw, in seconds of real time from it: the head's kick back (along the rail, m) and its settling;
// the sled back to the breech, the next thing pushed out of the magazine onto it, and the sled up to the muzzle.
export const CYCLE = { kick: 0.012, rise: 0.02, settle: 0.07, back: [0.04, 0.24], feed: [0.24, 0.36], load: [0.38, 0.62] };

const smooth = (from, to, time) => { const share = THREE.MathUtils.clamp((time - from) / (to - from), 0, 1); return share * share * (3 - 2 * share); };

/**
 * The machine's measures for a loaded thing of `extents` ({ lowest, highest, across }: m from its middle, in its own
 * frame as it lies on the sled: down to its lowest point, up to its highest, and out to its farthest across).
 */
export function fitFor({ lowest, highest, across }) {
  const { rail, magazine: box } = MACHINE;
  const half = across + box.gap;                    // the magazine's inner half width, both ways
  const tall = lowest + highest;
  const height = Math.max(box.least, Math.min(box.stack * tall, tall + box.most));
  const length = Math.max(rail.least, 2 * half + rail.travel);
  return {
    lowest: Math.max(lowest, 0.004), highest, across, half, height, length,
    breech: -length + half + box.gap,               // the loaded thing's middle along the rail with the sled at the breech
    plate: Math.max(0.066, across + 0.016),         // the pitch plate, this far to the left of the middle
  };
}

/** The head (the header) for `fit`, and its sled (its origin under the loaded thing's middle). */
function headGeometry(fit) {
  const { colours: colour, rail, sled } = MACHINE;
  const head = new Parts(), carriage = new Parts();
  const cradle = -fit.lowest, webTop = cradle - sled.height - 0.002, webMid = webTop - rail.web / 2;
  const back = -fit.length, front = rail.muzzle, middle = (back + front) / 2, long = front - back;
  // The channel: a web, two walls and their lips, an extrusion's.
  head.add(roundedBox(long, rail.web, 2 * rail.half + 2 * rail.sheet, 0.003, 2), place([middle, webMid, 0]), colour.alloy);
  for (const side of [-1, 1]) {
    head.add(roundedBox(long, rail.wall, rail.sheet, 0.0025, 2), place([middle, webTop + rail.wall / 2, side * (rail.half + rail.sheet / 2)]), colour.alloy);
    head.add(roundedBox(long, rail.sheet, 0.018, 0.002, 2), place([middle, webTop + rail.wall, side * (rail.half - 0.004)]), colour.alloy);
  }
  // The rodless cylinder along the right, its end caps; the sled's carriage rides it.
  const cylinderZ = rail.half + rail.sheet + 0.026, cylinderY = webTop + 0.022;
  head.cylinder(0.021, long - 0.05, [middle - 0.005, cylinderY, cylinderZ], 'x', colour.alloy, 28);
  for (const end of [back + 0.03, front - 0.04]) head.add(roundedBox(0.03, 0.058, 0.058, 0.004, 2), place([end, cylinderY, cylinderZ]), colour.paint);
  // The air receiver beside it (under it, a lob would swing it into the turntable), two straps round it and their
  // brackets to the cylinder's caps' level; the valve block and its solenoid at the breech, and the hose up to it.
  const receiverRadius = 0.038, receiverZ = cylinderZ + 0.021 + receiverRadius + 0.006, receiverY = cylinderY - 0.006;
  const receiverFrom = back + 0.06, receiverTo = Math.min(-0.16, back + 0.36);
  head.cylinder(receiverRadius, receiverTo - receiverFrom, [(receiverFrom + receiverTo) / 2, receiverY, receiverZ], 'x', colour.receiver, 32);
  for (const end of [receiverFrom, receiverTo]) {
    const dome = new THREE.SphereGeometry(receiverRadius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.5, 1);
    head.add(dome, place([end, receiverY, receiverZ], new THREE.Euler(0, 0, end === receiverFrom ? Math.PI / 2 : -Math.PI / 2)), colour.receiver);
  }
  for (const at of [receiverFrom + 0.05, receiverTo - 0.05]) {
    head.cylinder(receiverRadius + 0.003, 0.016, [at, receiverY, receiverZ], 'x', colour.orange, 32);
    head.box([0.016, 0.014, receiverZ - cylinderZ], [at, receiverY - receiverRadius + 0.012, (receiverZ + cylinderZ) / 2], colour.paint);
  }
  head.cylinder(0.008, 0.03, [receiverTo + 0.03, receiverY, receiverZ], 'x', colour.brass, 12);   // its drain cock
  head.add(roundedBox(0.05, 0.05, 0.05, 0.004, 2), place([back + 0.06, cylinderY + 0.045, cylinderZ]), colour.paint);
  head.cylinder(0.014, 0.04, [back + 0.06, cylinderY + 0.09, cylinderZ], 'y', colour.orange, 16);
  const hose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(receiverFrom - 0.012, receiverY, receiverZ), new THREE.Vector3(receiverFrom - 0.035, receiverY + 0.03, receiverZ),
    new THREE.Vector3(back + 0.045, cylinderY + 0.05, receiverZ - 0.02), new THREE.Vector3(back + 0.06, cylinderY + 0.045, cylinderZ + 0.025),
  ]);
  head.add(new THREE.TubeGeometry(hose, 24, 0.0065, 8), new THREE.Matrix4(), colour.blue);
  // The rubber buffers the sled stops on, at the muzzle.
  for (const side of [-1, 1]) head.cylinder(0.011, 0.02, [front - 0.012, webTop + 0.026, side * 0.028], 'x', colour.rubber, 14);
  // The pitch plate on the left, up to the pin, a crossbar under the channel to it, and the sector gear on it.
  const plateBottom = webTop - rail.web - 0.03;
  head.add(roundedBox(0.12, 0.035 - plateBottom, 0.01, 0.003, 2), place([0, (0.035 + plateBottom) / 2, -fit.plate]), colour.paint);
  head.add(roundedBox(0.1, 0.022, fit.plate - rail.half, 0.004, 2), place([0, plateBottom + 0.011, -(fit.plate + rail.half) / 2]), colour.paint);
  head.cylinder(0.072, 0.008, [0, 0, -fit.plate - 0.009], 'z', colour.steel, 40);
  head.cylinder(0.022, 0.026, [0, 0, -fit.plate - 0.013], 'z', colour.paint, 24);
  // The magazine over the breech: four sheets, a lid, its corner posts down to the walls' lips. Its mouth is its open
  // bottom, over the sled at the breech, so what waits in it is never seen.
  const { half, height, breech } = fit, sheet = MACHINE.magazine.sheet;
  const mouth = fit.highest + MACHINE.magazine.gap, middleY = mouth + height / 2;
  for (const side of [-1, 1]) {
    head.box([2 * half + 2 * sheet, height, sheet], [breech, middleY, side * (half + sheet / 2)], colour.paint);
    head.box([sheet, height, 2 * half], [breech + side * (half + sheet / 2), middleY, 0], colour.paint);
  }
  head.add(roundedBox(2 * half + 0.03, 0.014, 2 * half + 0.03, 0.004, 2), place([breech, mouth + height + 0.007, 0]), colour.orange);
  head.cylinder(0.012, 0.03, [breech, mouth + height + 0.028, 0], 'y', colour.paint, 16);   // its follower's knob
  const lip = webTop + rail.wall + rail.sheet / 2;
  for (const along of [-1, 1]) for (const side of [-1, 1]) {
    head.bar([breech + along * half, mouth, side * half], [breech + along * half, lip, side * rail.half], 0.005, colour.steel);
  }
  // The sled: its body, a V cradle and a pusher face, its carriage round the cylinder and the arm to it.
  const body = cradle - sled.height / 2;
  carriage.add(roundedBox(sled.length, sled.height, sled.width, 0.005, 2), place([0, body, 0]), colour.orange);
  for (const side of [-1, 1]) carriage.box([sled.length * 0.85, 0.005, 0.042], [0, cradle + 0.006, side * 0.022], colour.rubber, new THREE.Euler(side * 0.45, 0, 0));
  carriage.add(roundedBox(0.012, Math.min(0.05, fit.lowest + 0.02), 0.07, 0.003, 2), place([-sled.length / 2 + 0.006, cradle + Math.min(0.025, fit.lowest / 2 + 0.01), 0]), colour.orange);
  carriage.add(roundedBox(0.09, 0.052, 0.052, 0.006, 2), place([0, cylinderY, cylinderZ]), colour.orange);
  carriage.box([0.05, 0.012, cylinderZ - sled.width / 2], [0, Math.max(body, cylinderY + 0.02), (cylinderZ + sled.width / 2) / 2], colour.paint);
  return { head: head.geometry(), sled: carriage.geometry() };
}

/** The fork (the header) in its own frame, turned with the heading: its pin's post `post` (m) left of the middle, down to the turntable `depth` under it. */
function forkGeometry(fit, depth) {
  const { colours: colour } = MACHINE, parts = new Parts();
  const post = fit.plate + 0.034;
  parts.cylinder(0.008, post - fit.plate, [0, 0, -(post + fit.plate) / 2], 'z', colour.steel, 12);   // the pin
  parts.cylinder(0.026, 0.03, [0, 0, -post], 'z', colour.paint, 24);                                 // its boss
  parts.cylinder(0.016, depth, [0, -depth / 2, -post], 'y', colour.paint, 20);                       // the post
  parts.add(roundedBox(0.05, 0.07, 0.045, 0.006, 2), place([0, -0.08, -post - 0.004]), colour.orange); // the pitch drive's worm box
  parts.add(roundedBox(0.05, 0.032, post + 0.03, 0.005, 2), place([0, -depth, -post / 2 + 0.005]), colour.paint);
  parts.cylinder(0.06, 0.03, [0, -depth - 0.016, 0], 'y', colour.paint, 40);                         // the turntable
  parts.cylinder(0.062, 0.008, [0, -depth - 0.034, 0], 'y', colour.orange, 40);
  parts.add(roundedBox(0.055, 0.05, 0.05, 0.006, 2), place([0.03, -depth - 0.03, 0.065]), colour.orange);   // its slew motor
  return parts.geometry();
}

/** The mast and tripod (the header) in the world, from `top` (the turntable's underside) to feet on `groundAt`. */
function standGeometry(top, groundAt) {
  const { colours: colour, stand } = MACHINE, parts = new Parts();
  const ground = groundAt(top.x, top.z);
  const collar = ground + THREE.MathUtils.clamp(0.45 * (top.y - ground), 0.05, 0.4);
  const sleeveTop = collar + 0.55 * (top.y - collar);
  parts.cylinder(stand.mast, sleeveTop - collar + 0.04, [top.x, (sleeveTop + collar) / 2 - 0.02, top.z], 'y', colour.paint, 24);
  parts.cylinder(stand.inner, top.y - sleeveTop + 0.02, [top.x, (top.y + sleeveTop) / 2, top.z], 'y', colour.steel, 24);
  parts.cylinder(stand.mast * 1.45, 0.035, [top.x, sleeveTop - 0.01, top.z], 'y', colour.paint, 24);   // the clamp collar and its knob
  parts.bar([top.x, sleeveTop - 0.01, top.z + stand.mast * 1.4], [top.x, sleeveTop - 0.01, top.z + stand.mast * 1.4 + 0.045], 0.005, colour.steel);
  parts.cylinder(0.009, 0.04, [top.x, sleeveTop - 0.01, top.z + stand.mast * 1.4 + 0.045], 'x', colour.orange, 12);
  parts.cylinder(stand.mast * 1.5, 0.05, [top.x, collar, top.z], 'y', colour.paint, 24);
  // Three legs, one back towards the shore (+z) and two forward, each with a brace to the sleeve.
  for (let leg = 0; leg < 3; leg++) {
    const angle = Math.PI / 2 + (leg * 2 * Math.PI) / 3;
    const footX = top.x + Math.cos(angle) * stand.splay, footZ = top.z + Math.sin(angle) * stand.splay;
    const footY = groundAt(footX, footZ) + 0.012;
    const hip = [top.x + Math.cos(angle) * stand.mast * 1.4, collar, top.z + Math.sin(angle) * stand.mast * 1.4];
    parts.bar(hip, [footX, footY, footZ], stand.leg, colour.paint);
    parts.cylinder(stand.foot, 0.024, [footX, footY, footZ], 'y', colour.rubber, 16);
  }
  return parts.geometry();
}

/**
 * The steepest pitch (rad) at which nothing of the head and its sled (`profile`: their corners' x and y in the head's
 * frame, the sled's at both ends of its run) comes lower than `deepest` under the pivot: within MACHINE.pitch.
 */
function steepestFor(profile, deepest) {
  const [least, most] = MACHINE.pitch.map((degrees) => THREE.MathUtils.degToRad(degrees));
  const step = THREE.MathUtils.degToRad(0.5);
  let steepest = least;
  for (let pitch = Math.max(0, least); pitch <= most + 1e-9; pitch += step) {
    const sin = Math.sin(pitch), cos = Math.cos(pitch);
    let lowest = 0;
    for (let index = 0; index < profile.length; index += 2) lowest = Math.min(lowest, profile[index] * sin + profile[index + 1] * cos);
    if (-lowest > deepest) break;
    steepest = pitch;
  }
  return steepest;
}

const place = (at, turn = null) => new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(turn ?? new THREE.Euler()), new THREE.Vector3(1, 1, 1));

export class ThrowMachine {
  /**
   * @param scene the main scene
   * @param material (roughness, metalness, reflection) → a material of the nozzle's program (src/main.js rigMaterial)
   * @param groundAt (x, z) → the ground's height there: the land, the ice's top, or the bed under open water
   * @param under the under-water pass's scene and `underMaterial` its material maker: the stand's twin there
   * @param random the stream Math.random stands for while the machine builds geometry (the header)
   */
  constructor({ scene, material, groundAt, under = null, underMaterial = null, random = Math.random }) {
    this.scene = scene;
    this.groundAt = groundAt;
    this.random = random;
    const made = material(0.45, 0.12, 0.55);
    this.head = new THREE.Mesh(new THREE.BufferGeometry(), made);
    this.sled = new THREE.Mesh(new THREE.BufferGeometry(), made);
    this.fork = new THREE.Mesh(new THREE.BufferGeometry(), made);
    this.stand = new THREE.Mesh(new THREE.BufferGeometry(), made);
    this.meshes = [this.head, this.sled, this.fork, this.stand];
    for (const mesh of this.meshes) { mesh.visible = false; scene.add(mesh); }
    this.under = under && underMaterial ? under : null;
    this.twin = null;
    if (this.under) {
      this.twin = new THREE.Mesh(this.stand.geometry, underMaterial(0.45, 0.12, 0.3));
      this.twin.visible = false;
      this.under.add(this.twin);
    }
    this.fit = null;                 // fitFor's, for the thing loaded now (load)
    this.built = { lowest: NaN, highest: NaN, across: NaN };
    this.standing = { x: NaN, y: NaN, z: NaN, depth: NaN, plate: NaN };
    this.heading = 0;                // rad about the vertical: the rail's x along (cos, 0, -sin)
    this.pitch = 0;
    this.steepest = THREE.MathUtils.degToRad(MACHINE.pitch[1]);   // the steepest the rail may pitch here (standAt)
    this.profile = new Float32Array(0);
    this.firedAt = -Infinity;        // the last throw's real time (s): the reload runs from it
    this.point = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.turn = new THREE.Quaternion();
    this.local = new THREE.Vector3();
    this.lowest = new THREE.Vector3();
    this.warming = false;
  }

  /** The thing loaded now: its `extents` (fitFor's), the head and sled built again only when they change. */
  load(extents) {
    const built = this.built;
    if (Math.abs(extents.lowest - built.lowest) < 1e-6 && Math.abs(extents.highest - built.highest) < 1e-6 && Math.abs(extents.across - built.across) < 1e-6) return;
    Object.assign(built, extents);
    this.fit = fitFor(extents);
    const { head, sled } = withRandom(this.random, () => headGeometry(this.fit));
    this.head.geometry.dispose(); this.head.geometry = head;
    this.sled.geometry.dispose(); this.sled.geometry = sled;
    this.standing.plate = NaN;   // the fork as wide as the new plate, and the steepest pitch found again (standAt)
    // Its corners' x and y in the head's frame, the sled's at both ends of its run: how steep it may pitch (steepestFor).
    const headCorners = head.attributes.position, sledCorners = sled.attributes.position;
    this.profile = new Float32Array(2 * (headCorners.count + 2 * sledCorners.count));
    let at = 0;
    for (let index = 0; index < headCorners.count; index++) { this.profile[at++] = headCorners.getX(index); this.profile[at++] = headCorners.getY(index); }
    for (const along of [0, this.fit.breech]) for (let index = 0; index < sledCorners.count; index++) { this.profile[at++] = sledCorners.getX(index) + along; this.profile[at++] = sledCorners.getY(index); }
  }

  /** The turntable's depth under `point` for a skip or not: its MACHINE.depth, kept `clear` over the ground and under the cradle. */
  depthAt(point, skip) {
    const { depth } = MACHINE;
    const room = point.y - this.groundAt(point.x, point.z) - depth.clear;
    return Math.max(this.fit.lowest + depth.under, Math.min(skip ? depth.skip : depth.throw, room));
  }

  /**
   * Set up at the hand's `point` (a Vector3) for a skip or not: the fork and the stand built again when the point, the
   * depth or the plate changed, or `again` (the ground under it changed: another place, the ice).
   */
  standAt(point, skip, again = false) {
    const depth = this.depthAt(point, skip), standing = this.standing;
    this.point.copy(point);
    if (!again && Math.abs(point.x - standing.x) < 5e-5 && Math.abs(point.y - standing.y) < 5e-5 && Math.abs(point.z - standing.z) < 5e-5
      && Math.abs(depth - standing.depth) < 1e-6 && standing.plate === this.fit.plate) return;
    Object.assign(standing, { x: point.x, y: point.y, z: point.z, depth, plate: this.fit.plate });
    this.steepest = steepestFor(this.profile, depth - MACHINE.above);
    withRandom(this.random, () => {
      this.fork.geometry.dispose(); this.fork.geometry = forkGeometry(this.fit, depth);
      this.stand.geometry.dispose(); this.stand.geometry = standGeometry(new THREE.Vector3(point.x, point.y - depth - 0.038, point.z), this.groundAt);
    });
    if (this.twin) this.twin.geometry = this.stand.geometry;
  }

  /** The rail along `way` (a Vector3, the launch's velocity): its heading and pitch, within MACHINE.pitch and no steeper than `steepest`. */
  aim(way) {
    const level = Math.hypot(way.x, way.z);
    if (level > 1e-6) this.heading = Math.atan2(-way.z, way.x);
    this.pitch = THREE.MathUtils.clamp(Math.atan2(way.y, level), THREE.MathUtils.degToRad(MACHINE.pitch[0]), this.steepest);
  }

  /** A throw has left at the real time `seconds`: the reload (CYCLE) runs from it. */
  fired(seconds) { this.firedAt = seconds; }

  /** Whether a reload is under way at the real time `seconds`. */
  reloading(seconds) { return seconds - this.firedAt < CYCLE.load[1]; }

  /**
   * Once a frame at the real time `seconds`: the machine posed (aim, standAt, load first), and `loaded` (the preview's
   * mesh, its scale its own) placed on the sled or in the magazine's mouth as the reload has it, hidden while it waits in
   * the magazine. `shown` false hides it all.
   */
  show(shown, loaded, seconds) {
    for (const mesh of this.meshes) mesh.visible = shown || this.warming;
    if (this.twin) this.twin.visible = this.warming || (shown && this.reachesUnder());
    if (!shown || !this.fit) return;
    const since = seconds - this.firedAt;
    const { back, feed, load, kick, rise, settle } = CYCLE;
    const fit = this.fit;
    // The sled along the rail (its middle under the loaded thing's) and the thing on it or coming out of the magazine.
    let along = 0, up = 0, visible = true;
    if (since < load[1]) {
      along = fit.breech * (smooth(back[0], back[1], since) - smooth(load[0], load[1], since));
      if (since < feed[0]) visible = false;
      else if (since < feed[1]) {
        const out = smooth(feed[0], feed[1], since);
        up = (1 - out) * (fit.highest + MACHINE.magazine.gap + fit.lowest + 0.004);
      }
    }
    const recoil = since < 0 || since >= load[1] ? 0 : kick * (since < rise ? since / rise : Math.exp(-(since - rise) / settle));
    this.turn.setFromEuler(new THREE.Euler(0, this.heading, this.pitch, 'YXZ'));
    this.forward.set(1, 0, 0).applyQuaternion(this.turn);
    const headAt = this.local.copy(this.point).addScaledVector(this.forward, -recoil);
    this.head.position.copy(headAt);
    this.head.quaternion.copy(this.turn);
    this.sled.position.copy(headAt).addScaledVector(this.forward, along);
    this.sled.quaternion.copy(this.turn);
    this.fork.position.copy(this.point);
    this.fork.rotation.set(0, this.heading, 0);
    this.stand.position.set(0, 0, 0);
    if (loaded) {
      loaded.visible = visible;
      loaded.quaternion.copy(this.turn);
      loaded.position.set(along, up, 0).applyQuaternion(this.turn).add(headAt);
    }
    if (this.twin) { this.twin.position.copy(this.stand.position); this.twin.quaternion.copy(this.stand.quaternion); }
  }

  /** Whether the stand's legs reach under the still surface (its twin is drawn only then). */
  reachesUnder() {
    const sphere = this.stand.geometry.boundingSphere;
    return Boolean(sphere) && sphere.center.y - sphere.radius < 0;
  }

  /** For the warm-up (src/main.js warmUp): everything shown, the twin too, while `on`, so their programs are built. */
  warmUp(on) {
    this.warming = on;
    for (const mesh of [...this.meshes, ...(this.twin ? [this.twin] : [])]) { mesh.visible = on; mesh.frustumCulled = !on; }
  }

  hide() { this.show(false, null, 0); }

  dispose() {
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.head.material.dispose();
    if (this.twin) { this.under.remove(this.twin); this.twin.material.dispose(); }
  }
}
