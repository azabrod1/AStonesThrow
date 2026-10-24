// Picking and carrying an already thrown thing. A press only picks a
// candidate; main.js waits for the hold before begin, so a tap still throws
// and moving early still turns the view. Once held, a plane facing the eye
// through its centre carries it at a constant screen depth, preserving the
// offset from the pointer. End releases from rest, never from mouse speed.
//
// Picking uses the drawn geometry, including its apparent position through
// still water (the CPU twin of SEEN_THROUGH_WATER in shaders/scene.js).
// Carrying in that apparent plane and undoing refraction keeps a submerged
// thing under the pointer too. The GPU's fine ripple distortion and tilt
// are not read back; its latest centre lift is. No picking runs per frame.
// A submerged thing is picked only where it can be seen (seenShare at least
// SEEN_LEAST): one lost in the reflections or the water's colour is not
// there to the eye, and a hold there dips a finger in instead.
import * as THREE from 'three';

const WATER_INDEX = 1.333;
export const GRAB_HOLD_MS = 250;
// The least share of a submerged thing's light reaching the eye for it to be picked: on the lake from the home view a
// stone on the bed shows faintly at 0.2 and is lost in the reflections by 0.13.
const SEEN_LEAST = 0.15;

/** Where the level surface shows a point (SEEN_THROUGH_WATER's five steps). */
export function apparentPoint(world, eye, level, result = new THREE.Vector3()) {
  result.copy(world);
  const depth = level - world.y, height = eye.y - level;
  const alongX = world.x - eye.x, alongZ = world.z - eye.z;
  const reach = Math.hypot(alongX, alongZ);
  if (depth <= 0 || height <= 0 || reach < 1e-5) return result;
  let crossing = reach * height / (height + depth);
  for (let step = 0; step < 5; step++) {
    const above = Math.hypot(crossing, height), rest = reach - crossing, below = Math.hypot(rest, depth);
    const residual = crossing / above - WATER_INDEX * rest / below;
    const slope = height ** 2 / above ** 3 + WATER_INDEX * depth ** 2 / below ** 3;
    crossing = THREE.MathUtils.clamp(crossing - residual / slope, 0, reach);
  }
  const scale = crossing * (height + depth) / (height * reach);
  return result.set(eye.x + alongX * scale, world.y, eye.z + alongZ * scale);
}

/** Undo the apparent position with Snell's law, at the same world height. */
export function physicalPoint(seen, eye, level, result = new THREE.Vector3()) {
  result.copy(seen);
  const depth = level - seen.y, height = eye.y - level;
  const alongX = seen.x - eye.x, alongZ = seen.z - eye.z, reach = Math.hypot(alongX, alongZ);
  if (depth <= 0 || height <= 0 || reach < 1e-5) return result;
  const crossing = reach * height / (height + depth);
  const sine = crossing / Math.hypot(crossing, height) / WATER_INDEX;
  const underwater = depth * sine / Math.sqrt(1 - sine * sine);
  const scale = (crossing + underwater) / reach;
  return result.set(eye.x + alongX * scale, seen.y, eye.z + alongZ * scale);
}

/**
 * The share of the light from `seen` (where the still surface at `level`
 * shows a point) that reaches `eye`: 1 above the water; under it, what the
 * surface lets through (fluid.js waterFresnel) dimmed by `extinction` (per
 * metre; its mean, as the ice's shader takes it) along the refracted path, or
 * along the whole sight line from an eye under the water.
 */
export function seenShare(seen, eye, level, extinction) {
  const dimming = (extinction.x + extinction.y + extinction.z) / 3;
  if (eye.y < level) return Math.exp(-dimming * eye.distanceTo(seen));
  if (seen.y >= level) return 1;
  const crossing = new THREE.Vector3().lerpVectors(eye, seen, (eye.y - level) / (eye.y - seen.y));
  const cosine = (eye.y - level) / Math.max(eye.distanceTo(crossing), 1e-9);
  const fresnel = 0.02 + 0.98 * (1 - cosine) ** 5;
  return (1 - fresnel) * Math.exp(-dimming * crossing.distanceTo(physicalPoint(seen, eye, level)));
}

export class ObjectGrab {
  /** `extinction` is the water's (src/main.js lighting.extinction), read at each pick. */
  constructor(camera, canvas, extinction) {
    this.camera = camera;
    this.canvas = canvas;
    this.extinction = extinction;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.proxy = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    this.box = new THREE.Box3();
    this.plane = new THREE.Plane();
    this.offset = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.rock = null;
  }

  ray(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(2 * (clientX - rect.left) / rect.width - 1, 1 - 2 * (clientY - rect.top) / rect.height);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray;
  }

  pick(rocks, clientX, clientY, touch = false) {
    // Exact geometry first; touch gets only eight CSS pixels of forgiveness.
    const offsets = touch ? [[0, 0], [-8, 0], [8, 0], [0, -8], [0, 8]] : [[0, 0]];
    const rays = offsets.map(([offsetX, offsetY]) => this.ray(clientX + offsetX, clientY + offsetY).clone());
    const hits = offsets.map(() => null);
    const world = new THREE.Vector3(), seen = new THREE.Vector3(), eye = this.camera.position;
    for (const rock of rocks) {
      if (rock.state === 'held' || rock.fading !== undefined) continue;
      const mesh = rock.meshAbove;
      const lift = rock.rideHeight * (rock.rideShare?.value ?? 0);
      // Only a thing whose box a ray meets pays for its vertices (thousands each): its bounding cube's corners, edges'
      // and faces' middles as the water shows them, with half its reach to spare for the bending between.
      const reach = rock.reach * rock.radius;
      this.box.makeEmpty();
      for (const alongX of [-1, 0, 1]) for (const alongY of [-1, 0, 1]) for (const alongZ of [-1, 0, 1]) {
        world.set(alongX, alongY, alongZ).multiplyScalar(reach).add(mesh.position);
        world.y += lift;
        this.box.expandByPoint(world.lerp(apparentPoint(world, eye, rock.drawn.surface, seen), rock.seenThroughWater.value));
      }
      this.box.expandByScalar(reach / 2);
      if (!rays.some((ray) => ray.intersectsBox(this.box))) continue;
      mesh.updateMatrixWorld(true);
      const source = rock.geometry.getAttribute('position');
      let positions = this.proxy.geometry.getAttribute('position');
      if (positions?.count !== source.count) {
        positions = new THREE.Float32BufferAttribute(new Float32Array(source.count * 3), 3);
        this.proxy.geometry.setAttribute('position', positions);
      }
      for (let index = 0; index < source.count; index++) {
        world.fromBufferAttribute(source, index).applyMatrix4(mesh.matrixWorld);
        world.y += lift;
        apparentPoint(world, eye, rock.drawn.surface, seen);
        world.lerp(seen, rock.seenThroughWater.value);
        positions.setXYZ(index, world.x, world.y, world.z);
      }
      this.proxy.geometry.setIndex(rock.geometry.index);
      this.proxy.geometry.computeBoundingSphere();
      for (let index = 0; index < rays.length; index++) {
        this.raycaster.ray.copy(rays[index]);
        const hit = this.raycaster.intersectObject(this.proxy, false)[0];
        if (!hit || (eye.y < 0 && hit.point.y > rock.drawn.surface)) continue;
        if (seenShare(hit.point, eye, rock.drawn.surface, this.extinction) < SEEN_LEAST) continue;
        if (!hits[index] || hit.distance < hits[index].distance) hits[index] = { rock, distance: hit.distance };
      }
    }
    return hits.find(Boolean)?.rock ?? null;
  }

  begin(rock, clientX, clientY) {
    rock.hold();
    this.rock = rock;
    const seen = apparentPoint(rock.position, this.camera.position, rock.drawn.surface);
    this.plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), seen);
    const hit = this.ray(clientX, clientY).intersectPlane(this.plane, this.point);
    this.offset.copy(seen).sub(hit ?? seen);
  }

  move(clientX, clientY, constrain, surfaceAt, depthAt) {
    if (!this.rock || !this.ray(clientX, clientY).intersectPlane(this.plane, this.point)) return;
    this.point.add(this.offset);
    // The surface varies slowly under a gale; use its height where the
    // object stood for refraction, then sample the destination for drawing.
    physicalPoint(this.point, this.camera.position, surfaceAt(this.rock.position.x, this.rock.position.z), this.point);
    constrain(this.point, this.rock);
    this.rock.moveHeld(this.point, surfaceAt(this.point.x, this.point.z), depthAt(this.point.x, this.point.z));
  }

  end(surfaceAt, depthAt) {
    if (!this.rock) return;
    const rock = this.rock;
    this.rock = null;
    rock.release(surfaceAt(rock.position.x, rock.position.z), depthAt(rock.position.x, rock.position.z));
  }
}
