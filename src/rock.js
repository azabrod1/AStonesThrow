// A thrown stone: faceted procedural geometry and a small rigid-body model.
//
// In the air it follows a ballistic arc with a little drag and tumbles. The
// moment its lowest point (of the tumbling mesh, not of a sphere) touches the
// surface it reports the impact (position, speed, direction, radius) so the
// splash can be built from it: the splash starts at first contact, not once
// the stone is partly under, which for a 16 cm stone at 5 m/s down would be
// several milliseconds late. Under water a quadratic drag stops it within a
// few radii and buoyancy-reduced gravity sinks it to the floor, where it
// settles into the sand.
import * as THREE from 'three';

const WATER_DENSITY = 1000;
const ROCK_DENSITY = 2600;
const GRAVITY = 9.81;
const rockRotation = new THREE.Matrix4();

function hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let result = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const weight = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    result += weight * hash3(ix + dx, iy + dy, iz + dz);
  }
  return result;
}

/** Faceted stone of unit nominal radius, flattened like a river stone. Scale by the real radius. */
export function createRockGeometry(seed = Math.random() * 1000) {
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const positions = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const squash = new THREE.Vector3(1.0, 0.62 + 0.2 * Math.random(), 0.8 + 0.2 * Math.random());
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    const direction = vertex.clone().normalize();
    const coarse = valueNoise3(direction.x * 1.6 + seed, direction.y * 1.6, direction.z * 1.6) - 0.5;
    const fine = valueNoise3(direction.x * 4.5 + seed, direction.y * 4.5 + 3.1, direction.z * 4.5) - 0.5;
    const radius = 1 + 0.42 * coarse + 0.14 * fine;
    vertex.copy(direction).multiplyScalar(radius).multiply(squash);
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  // Per-face colour variation: facets catch light differently on real stone.
  const colors = new Float32Array(positions.count * 3);
  for (let face = 0; face < positions.count / 3; face++) {
    const tint = 0.82 + 0.36 * Math.random();
    const warm = 0.96 + 0.08 * Math.random();
    for (let corner = 0; corner < 3; corner++) {
      const i = (face * 3 + corner) * 3;
      colors[i] = tint * warm; colors[i + 1] = tint; colors[i + 2] = tint * (2 - warm);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class Rock {
  /**
   * @param radius nominal radius in metres
   * @param envTexture environment map for lighting
   */
  constructor({ radius, position, velocity, envTexture }) {
    this.radius = radius;
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.state = 'air';
    this.age = 0;
    this.restTime = 0;
    this.quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this.spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.spinRate = 6 + Math.random() * 10;
    this.geometry = createRockGeometry();
    this.geometry.computeBoundingSphere();
    this.reach = this.geometry.boundingSphere.center.length() + this.geometry.boundingSphere.radius;   // furthest any point gets from the centre, in radii
    const baseColor = new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.08 + Math.random() * 0.1, 0.3 + Math.random() * 0.14);
    const makeMaterial = (clipNormalY) => new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
      envMap: envTexture,
      envMapIntensity: 0.9,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, clipNormalY, 0), 0)],
    });
    this.meshAbove = new THREE.Mesh(this.geometry, makeMaterial(1));
    this.meshBelow = new THREE.Mesh(this.geometry, makeMaterial(-1));
    this.meshBelow.material.envMapIntensity = 0.35;
    for (const mesh of [this.meshAbove, this.meshBelow]) {
      mesh.scale.setScalar(radius);
      mesh.frustumCulled = false;
    }
    this.syncMeshes();
  }

  get mass() { return ROCK_DENSITY * (4 / 3) * Math.PI * this.radius ** 3; }

  /** Height of the stone's lowest point below its centre (negative, metres), as it is turned now. */
  lowestOffset() {
    const positions = this.geometry.attributes.position.array;
    // The world height of a mesh point is the rotation's second row dotted with it.
    const rotation = rockRotation.makeRotationFromQuaternion(this.quaternion).elements;
    const rowX = rotation[1], rowY = rotation[5], rowZ = rotation[9];
    let lowest = 0;
    for (let index = 0; index < positions.length; index += 3) {
      lowest = Math.min(lowest, rowX * positions[index] + rowY * positions[index + 1] + rowZ * positions[index + 2]);
    }
    return lowest * this.radius;
  }

  syncMeshes() {
    for (const mesh of [this.meshAbove, this.meshBelow]) {
      mesh.position.copy(this.position);
      mesh.quaternion.copy(this.quaternion);
    }
  }

  /**
   * Advance by dt seconds. Returns an impact description the first time the
   * stone touches the water, otherwise null.
   */
  update(dt, pondDepth) {
    this.age += dt;
    let impact = null;
    if (this.state === 'air') {
      const speed = this.velocity.length();
      // Air drag on a stone: tiny but keeps long throws honest.
      const dragAcceleration = 0.5 * 1.2 * 0.47 * Math.PI * this.radius ** 2 * speed / this.mass;
      this.velocity.addScaledVector(this.velocity, -dragAcceleration * dt);
      this.velocity.y -= GRAVITY * dt;
      this.position.addScaledVector(this.velocity, dt);
      // Only near the water is the mesh worth walking for its lowest point.
      const touching = this.position.y <= this.reach * this.radius && this.position.y + this.lowestOffset() <= 0;
      if (touching && this.velocity.y < 0) {
        this.state = 'water';
        impact = {
          x: this.position.x,
          z: this.position.z,
          speed: this.velocity.length(),
          velocity: this.velocity.clone(),
          radius: this.radius,
        };
      }
    } else if (this.state === 'water') {
      const speed = this.velocity.length();
      // Quadratic drag with Cd ≈ 0.5, plus buoyancy-reduced gravity.
      const dragAcceleration = (3 / 8) * (WATER_DENSITY / ROCK_DENSITY) * 0.5 / this.radius * speed;
      this.velocity.addScaledVector(this.velocity, -Math.min(dragAcceleration * dt, 0.9));
      this.velocity.y -= GRAVITY * (1 - WATER_DENSITY / ROCK_DENSITY) * dt;
      this.position.addScaledVector(this.velocity, dt);
      this.spinRate *= Math.exp(-3.0 * dt);
      if (this.position.y - this.radius * 0.75 <= -pondDepth) {
        this.position.y = -pondDepth + this.radius * 0.75;
        this.velocity.set(0, 0, 0);
        this.state = 'rest';
      }
    } else {
      this.restTime += dt;
    }
    if (this.state !== 'rest') {
      const spin = new THREE.Quaternion().setFromAxisAngle(this.spinAxis, this.spinRate * dt);
      this.quaternion.premultiply(spin);
    }
    this.syncMeshes();
    return impact;
  }

  dispose() {
    this.geometry.dispose();
    this.meshAbove.material.dispose();
    this.meshBelow.material.dispose();
  }
}
