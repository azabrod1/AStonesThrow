// The stone: a sphere with a prescribed motion that drives the water (one-way
// coupling). In the air it falls freely; in the water it feels buoyancy and
// quadratic drag on its submerged part and settles on the floor.
const GRAVITY = 9.81;
const WATER_DENSITY = 1000;
const DRAG_COEFFICIENT = 0.47;

/** Fraction of a sphere of radius R below the plane y = waterLevel, from the spherical cap volume. */
export function submergedFraction(centreY, radius, waterLevel) {
  const depth = Math.min(Math.max(waterLevel - (centreY - radius), 0), 2 * radius);
  return (depth * depth * (3 * radius - depth)) / (4 * radius ** 3);
}

export class Stone {
  constructor({ radius, density = 2500, position, velocity }) {
    this.radius = radius;
    this.density = density;
    this.position = [...position];
    this.velocity = [...velocity];
    this.resting = false;
  }

  get speed() {
    return Math.hypot(...this.velocity);
  }

  clone() {
    const copy = new Stone({ radius: this.radius, density: this.density, position: this.position, velocity: this.velocity });
    copy.resting = this.resting;
    return copy;
  }

  /** Semi-implicit Euler step. waterLevel is the undisturbed surface height, floorY the bottom of the tank. */
  advance(dt, { waterLevel, floorY = 0 }) {
    const volume = (4 / 3) * Math.PI * this.radius ** 3;
    const mass = this.density * volume;
    const area = Math.PI * this.radius ** 2;
    const submerged = submergedFraction(this.position[1], this.radius, waterLevel);
    const speed = this.speed;
    const dragPerSpeed = (0.5 * WATER_DENSITY * DRAG_COEFFICIENT * area * speed * submerged) / mass;
    const buoyancy = (WATER_DENSITY / this.density) * GRAVITY * submerged;
    const acceleration = [
      -dragPerSpeed * this.velocity[0],
      -GRAVITY + buoyancy - dragPerSpeed * this.velocity[1],
      -dragPerSpeed * this.velocity[2],
    ];
    for (let axis = 0; axis < 3; axis++) {
      this.velocity[axis] += acceleration[axis] * dt;
      this.position[axis] += this.velocity[axis] * dt;
    }
    if (this.position[1] - this.radius < floorY) {
      this.position[1] = floorY + this.radius;
      this.velocity[1] = Math.max(this.velocity[1], 0);
      // Sliding friction on the sand: the sideways motion dies within a few hundredths of a second.
      const slide = Math.exp(-dt / 0.05);
      this.velocity[0] *= slide;
      this.velocity[2] *= slide;
      this.resting = this.speed < 0.02;
    }
  }
}
