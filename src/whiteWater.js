// White water: the boil where a stream of water comes down on the pond (the
// water cannon's landing, src/waterCannon.js), which the splash's other
// parts cannot make. Its spray (src/spray.js) is sub-millimetre mist and its
// drops are glass beads; at a jet's foot there is neither, but a heap of
// aerated water, the air the jet drives in coming back up through the water
// it throws, which scatters light as a cloud does: white, in soft lumps that
// heap up at the foot and are gone in a fraction of a second. It is only the
// foot's: what the stream throws on off the water is water in flight, drawn
// as the stream is (the cannon's fan, src/sprayFan.js); puffs flown that far hung and
// swelled, and read as smoke.
//
// A puff is a lump of that heap, written once, at its birth, by its emitter
// (the stream's landing, each physics step, from its own seeded stream), and
// flown in closed form in the vertex shader (WHITE_WATER_VERTEX in
// src/shaders/whiteWater.js, which says how it flies and how it is shaped and
// lit): nothing is stepped, nothing read back, and a seeded throw's puffs are
// the same at any frame rate. The emitter gives its place and velocity on
// still water, its life, its diameter at birth and at death, its drag's
// response time and its seed; the shader lifts it under a gale (galeLift) and
// holds it within the pool's walls (setWalls).
//
// The puffs live in a ring of `capacity` slots allocated once, of which the
// preset uses `ring` (setBudget, QUALITY.whiteWater in src/main.js: a few
// hundred: a stream keeps a few tens alive),
// the oldest slot reused when it is full; only the slots written since the
// last commit are uploaded, and once every puff has gone the next is written
// at slot 0 again, so the draw covers only what is alive. One instanced draw
// a frame in the main scene (premultiplied, writing no depth, over the water
// and its foam, under the splash's water in the air, which the composite lays
// over the scene: the stream's spray shows over it; the stream's own rope, src/streamSheath.js, is drawn after it), none once every
// puff has gone; its program starts compiling under the loading veil with the warm-up's
// burst of the cannon, and is drawn there with the cannon in hand (src/main.js warmUp). The water's mirror leaves them
// out: a heap stands on water it churns, which mirrors nothing clearly. Its
// three.js objects draw their random ids from a stream of their own (IDS), so
// building it moves no seeded Math.random (src/withRandom.js).
import * as THREE from 'three';
import { WHITE_WATER_VERTEX, WHITE_WATER_FRAGMENT } from './shaders/whiteWater.js';
import { seededRandom } from './spray.js';
import { withRandom } from './withRandom.js';

export const WHITE_WATER_CAPACITY = 256;
const STRIDE = 12;            // floats a slot: origin and birth, velocity and life, diameters, τ and seed
const OPACITY = 0.6;          // a lump's core
const FAR = 1e4;              // no walls: these far off
// The random ids (THREE's uuids) of what is built here: a stream of their own (src/withRandom.js), so building it never
// moves Math.random, which the probes seed before they build the splash.
const IDS = 0x3417e;

export class WhiteWater {
  /**
   * @param lighting the scene's lighting (src/main.js): the puffs take the sky's light and the sun's
   * @param ambientWaves src/ambientWaves.js: its uniforms carry the gale's (galeLift)
   */
  constructor({ lighting, ambientWaves, capacity = WHITE_WATER_CAPACITY }) {
    this.capacity = capacity;
    this.ring = capacity;         // slots in use...
    this.budgetRing = capacity;   // ...and the preset's (setBudget), which a smaller ring waits on
    this.next = 0;                // the slot the next puff takes
    this.used = 0;                // slots written since the ring last started over: the draw
    this.lastDeath = -Infinity;   // splash time the last puff goes
    this.dirtyStart = 0;          // the run of slots written since the last commit
    this.dirtyCount = 0;
    this.written = 0;             // puffs written since the last reset (for probes)
    this.data = new Float32Array(capacity * STRIDE);
    withRandom(seededRandom(IDS, capacity), () => this.build(lighting, ambientWaves));
  }

  /** The quad's instances, the material and the mesh (the constructor's, under its own ids). */
  build(lighting, ambientWaves) {
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE).setUsage(THREE.DynamicDrawUsage);
    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('aOrigin', new THREE.InterleavedBufferAttribute(this.buffer, 4, 0));
    geometry.setAttribute('aLaunch', new THREE.InterleavedBufferAttribute(this.buffer, 4, 4));
    geometry.setAttribute('aShape', new THREE.InterleavedBufferAttribute(this.buffer, 4, 8));
    geometry.instanceCount = 0;
    this.geometry = geometry;
    const gale = Object.fromEntries(Object.entries(ambientWaves.uniforms()).filter(([name]) => name.startsWith('uGale')));
    this.material = new THREE.ShaderMaterial({
      vertexShader: WHITE_WATER_VERTEX,
      fragmentShader: WHITE_WATER_FRAGMENT,
      uniforms: {
        ...gale,
        uTime: { value: 0 },
        uWalls: { value: new THREE.Vector4(-FAR, FAR, -FAR, FAR) },
        uOpacity: { value: OPACITY },
        uSunDir: { value: lighting.sunDirection },
        uSunIrradiance: { value: lighting.sunIrradiance },
        uSkyAmbient: { value: lighting.skyAmbient },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** The preset's ring (QUALITY.whiteWater): at once if larger, else once every puff in the air has gone. */
  setBudget(ring) {
    this.budgetRing = Math.max(1, Math.min(ring, this.capacity));
    if (this.budgetRing >= this.ring) this.ring = this.budgetRing;
    else if (!this.mesh.visible) this.startOver();
  }

  /** The pool's walls ({ minX, maxX, minZ, maxZ }), or null on the lake: the puffs are held within them. */
  setWalls(walls) {
    this.material.uniforms.uWalls.value.set(walls?.minX ?? -FAR, walls?.maxX ?? FAR, walls?.minZ ?? -FAR, walls?.maxZ ?? FAR);
  }

  /** Nothing alive: the ring starts over at slot 0, at the preset's size. */
  startOver() {
    this.ring = this.budgetRing;
    this.next = 0;
    this.used = 0;
    this.dirtyStart = 0;
    this.dirtyCount = 0;
    this.geometry.instanceCount = 0;
  }

  /**
   * One puff (the header), born at splash time `time` at (x, y, z) on still
   * water, moving at (vx, vy, vz), living `life` seconds, `size` across at
   * birth and `swell` across at its death, its drag's response time `tau`,
   * its shape's `seed` (0 to 1).
   */
  puff({ x, y = 0, z, vx, vy, vz, size, swell, tau, life, time, seed }) {
    if (!(life > 0) || !(size > 0)) return;
    if (time >= this.lastDeath && (this.used > 0 || this.ring !== this.budgetRing)) this.startOver();
    const slot = this.next;
    if (this.dirtyCount === 0) this.dirtyStart = slot;
    this.dirtyCount = Math.min(this.dirtyCount + 1, this.ring);
    this.next = (slot + 1) % this.ring;
    this.used = Math.max(this.used, slot + 1);
    const base = slot * STRIDE, data = this.data;
    data[base] = x; data[base + 1] = y; data[base + 2] = z; data[base + 3] = time;
    data[base + 4] = vx; data[base + 5] = vy; data[base + 6] = vz; data[base + 7] = life;
    data[base + 8] = size; data[base + 9] = swell; data[base + 10] = Math.max(tau, 1e-3); data[base + 11] = seed;
    this.lastDeath = Math.max(this.lastDeath, time + life);
    this.written++;
  }

  /** Whether a puff was alive at the last commit. */
  get alive() { return this.mesh.visible; }

  /** Every puff gone at once (the splash's reset). */
  reset() {
    this.lastDeath = -Infinity;
    this.written = 0;
    this.startOver();
    this.mesh.visible = false;
  }

  /** Once per simulation step: the clock, visibility, and the upload of the puffs written since the last. */
  commit(time) {
    this.material.uniforms.uTime.value = time;
    this.mesh.visible = time < this.lastDeath;
    if (this.dirtyCount === 0) return;
    const buffer = this.buffer;
    const start = this.dirtyStart, end = start + this.dirtyCount;
    if (this.dirtyCount >= this.ring) buffer.addUpdateRange(0, this.ring * STRIDE);
    else if (end <= this.ring) buffer.addUpdateRange(start * STRIDE, this.dirtyCount * STRIDE);
    else {
      buffer.addUpdateRange(start * STRIDE, (this.ring - start) * STRIDE);
      buffer.addUpdateRange(0, (end - this.ring) * STRIDE);
    }
    buffer.needsUpdate = true;
    this.geometry.instanceCount = this.used;
    this.dirtyCount = 0;
  }
}
