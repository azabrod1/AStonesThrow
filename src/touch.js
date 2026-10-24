// A finger in the water: press and hold on the water (src/main.js) and a
// finger dips in there; drag, and it trails through the water, leaving a
// wake; let go, and it lifts out.
//
// It disturbs the solver's patch (src/spectralWater.js) with Gaussian splats,
// the same way the splash's drops do. Dipping in pushes a dimple FINGER.dip
// deep into the water, which rings out; lifting out lets a smaller bump of
// FINGER.lift back up. Moving, the finger pushes the water ahead of it up
// and leaves a trough behind it, a raised splat FINGER.radius ahead of it
// and a lowered one at it every FINGER.spacing of its path, each
// FINGER.push times its speed high (capped at FINGER.fastest): a moving
// pressure, from which the solver's own dispersion (capillary waves ahead,
// gravity waves trailing in a V) makes the wake. A finger held still makes
// no waves, as in a real pond. The finger follows the pointer: advance(dt),
// once per simulated frame, takes it from where it was to where it is
// wanted along a straight path, at most FINGER.mostSplats splat pairs a
// frame (a jump farther than that is spread over them, each as strong as
// the speed allows). Splats off the solver's patch (or out of the pool) are
// refused, so the caller keeps the finger FINGER.margin inside it.
// A thing carried through the surface (src/main.js, a held thing's wake) is
// a finger of its own `radius`, its dimple, bump and push scaled with it;
// picked up where it already was in the water, it enters without a dimple.
//
// Pure bookkeeping with no Three.js, so tools can drive it in Node.
export const FINGER = {
  radius: 0.07,       // m: a hand in the water (a fingertip's ripples are too fine to see from the shore, and die in a second)
  dip: 0.012,         // m: the dimple it pushes in, entering
  lift: 0.004,        // m: the bump the water lets back, leaving
  push: 0.008,        // m per m/s of speed: the water raised ahead and lowered behind
  fastest: 1.5,       // m/s: the speed the push stops growing at
  spacing: 0.05,      // m of path between splat pairs
  mostSplats: 12,     // splat pairs a frame at most
  margin: 0.2,        // m: kept inside the solver's patch
};

export class FingerInWater {
  constructor(water, radius = FINGER.radius) {
    this.water = water;
    this.radius = radius;
    this.scale = radius / FINGER.radius;   // the dimple, bump and push grow with the size
    this.position = null;   // { x, z } while in the water
    this.target = null;
    this.travelled = 0;     // path since the last splat pair, m
  }

  get inWater() { return this.position !== null; }

  /** Dip in at (x, z); quietly (no dimple) for one already in the water. */
  dip(x, z, quietly = false) {
    this.position = { x, z };
    this.target = { x, z };
    this.travelled = 0;
    if (!quietly) this.water.addSplat({ x, z, radius: 1.3 * this.radius, height: -FINGER.dip * this.scale });
  }

  /** Where the finger is wanted next (it gets there at the next advance). */
  moveTo(x, z) {
    if (this.inWater) this.target = { x, z };
  }

  /** Move along to the target over `seconds` of simulated time, leaving the wake. */
  advance(seconds) {
    if (!this.inWater || seconds <= 0) return;
    const fromX = this.position.x, fromZ = this.position.z;
    const alongX = this.target.x - fromX, alongZ = this.target.z - fromZ;
    const distance = Math.hypot(alongX, alongZ);
    if (distance < 1e-6) return;
    const speed = Math.min(distance / seconds, FINGER.fastest);
    const directionX = alongX / distance, directionZ = alongZ / distance;
    const pairs = Math.min(Math.floor((this.travelled + distance) / FINGER.spacing), FINGER.mostSplats);
    const height = FINGER.push * this.scale * speed;
    for (let pair = 1; pair <= pairs; pair++) {
      const share = pair / pairs;
      const x = fromX + alongX * share, z = fromZ + alongZ * share;
      this.water.addSplat({ x: x + directionX * this.radius, z: z + directionZ * this.radius, radius: this.radius, height, rim: 1 });
      this.water.addSplat({ x, z, radius: this.radius, height: -height, rim: 1 });
    }
    this.travelled = pairs > 0 ? 0 : this.travelled + distance;
    this.position = { ...this.target };
  }

  /** Lift out where it is. */
  lift() {
    if (!this.inWater) return;
    this.water.addSplat({ x: this.position.x, z: this.position.z, radius: 1.3 * this.radius, height: FINGER.lift * this.scale });
    this.position = null;
    this.target = null;
  }
}
