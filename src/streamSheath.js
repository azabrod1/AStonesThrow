// A stream's white rope: the water cannon's stream in the air
// (src/waterCannon.js works out how wide and how thick it is along its way,
// and writes it here once a frame; src/shaders/stream.js shades it,
// and says what is seen and why).
//
// One ring grid of SHEATH.rings rings, built once and rewritten each frame
// the stream flies: begin, a ring for each place along the stream (its
// centre, its way, the sheath's radius there, when its water left the
// nozzle, the optical depth through its middle and how far it has broken
// up), finish. A ring of no depth is not drawn, so a stream in several
// pieces (a squirt and the next one, both in the air) is one grid with rings
// of no depth at each piece's ends, and so are the rows left over. Each
// ring's first column is level and square to the stream, so the streaks,
// which lie round it by aAround, do not twist. The fan of spray it throws
// off the water where it lands is a sheet of its own on the same material
// (src/sprayFan.js).
//
// Drawn in the main scene after the white water (src/main.js), premultiplied,
// writing no depth: under the splash's water in the air, which the composite
// lays over the scene, so the stream's mist shows over it. The water's
// mirror leaves it out, as it does the white water. Its program starts compiling under the loading veil with the warm-up's burst
// of the cannon, and is drawn there with the cannon in hand (src/main.js warmUp). Lifted under a gale by its shader
// (galeLift), held within the pool's walls here. Its three.js objects draw
// their random ids from a stream of their own (IDS), so building it moves no
// seeded Math.random (src/withRandom.js).
import * as THREE from 'three';
import { createRingGrid, holdWithinWalls, markChanged } from './fluidMesh.js';
import { STREAM_VERTEX, STREAM_FRAGMENT } from './shaders/stream.js';
import { seededRandom } from './spray.js';
import { withRandom } from './withRandom.js';

export const SHEATH = {
  rings: 144,
  columns: 10,
  exposure: 0.012,  // s: a streak is as long as the water flies in this (the cells along, src/shaders/stream.js)
  period: 256,      // the cells along repeat every so many (STREAM_PERIOD)
};
const IDS = 0x57ea3;   // its random ids' own stream (the header)

export class StreamSheath {
  /**
   * @param lighting the scene's lighting (src/main.js): the rope takes the sky's light and the sun's
   * @param ambientWaves src/ambientWaves.js: its uniforms carry the gale's (galeLift)
   */
  constructor({ lighting, ambientWaves }) {
    const vertices = SHEATH.rings * SHEATH.columns;
    this.positions = new Float32Array(vertices * 3);
    this.normals = new Float32Array(vertices * 3);
    this.axes = new Float32Array(vertices * 3);
    this.around = new Float32Array(vertices * 2);
    this.flow = new Float32Array(vertices * 3);
    this.form = new Float32Array(vertices * 2);
    this.columnCos = new Float64Array(SHEATH.columns);
    this.columnSin = new Float64Array(SHEATH.columns);
    for (let column = 0; column < SHEATH.columns; column++) {
      this.columnCos[column] = Math.cos((column / SHEATH.columns) * Math.PI * 2);
      this.columnSin[column] = Math.sin((column / SHEATH.columns) * Math.PI * 2);
      for (let row = 0; row < SHEATH.rings; row++) {
        this.around[(row * SHEATH.columns + column) * 2] = this.columnCos[column];
        this.around[(row * SHEATH.columns + column) * 2 + 1] = this.columnSin[column];
      }
    }
    this.row = 0;             // the next ring to write
    this.base = 0;            // whole periods of cells taken off each ring's time (begin)
    this.last = { x: 0, y: 0, z: 0 };    // the last ring's centre (the rows left over go there)
    withRandom(seededRandom(IDS, vertices), () => this.build(lighting, ambientWaves));
  }

  /** The grid, the material and the mesh (the constructor's, under its own ids). */
  build(lighting, ambientWaves) {
    const gale = Object.fromEntries(Object.entries(ambientWaves.uniforms()).filter(([name]) => name.startsWith('uGale')));
    this.material = new THREE.ShaderMaterial({
      vertexShader: STREAM_VERTEX,
      fragmentShader: STREAM_FRAGMENT,
      uniforms: {
        ...gale,
        uSunDir: { value: lighting.sunDirection },
        uSunIrradiance: { value: lighting.sunIrradiance },
        uSkyAmbient: { value: lighting.skyAmbient },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,   // the shader keeps the face towards the eye, whichever way the rings wind
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = createRingGrid(SHEATH.rings, SHEATH.columns, {
      position: [this.positions, 3],
      normal: [this.normals, 3],
      aAxis: [this.axes, 3],
      aAround: [this.around, 2],
      aFlow: [this.flow, 3],
      aForm: [this.form, 2],
    }, this.material);
    this.mesh.visible = false;
    this.geometry = this.mesh.geometry;
  }

  /** Start this frame's rings; `newest` is when the stream's newest water left the nozzle (s). */
  begin(newest) {
    this.row = 0;
    this.base = SHEATH.period * Math.floor(newest / SHEATH.exposure / SHEATH.period);
  }

  /** Rings still unwritten this frame. */
  get room() { return SHEATH.rings - this.row; }

  /**
   * The next ring (the header): centred at (x, y, z), the stream going along
   * the unit `axis` there, `radius` the sheath's, its water let out at
   * `emitted` (s), `depth` the optical depth through its middle (0: not
   * drawn) and `broken` how far it has broken up (0 to 1).
   */
  ring(x, y, z, axis, radius, emitted, depth, broken) {
    if (this.row >= SHEATH.rings) return;
    const row = this.row++;
    const columns = SHEATH.columns;
    // The ring's own axes: level and square to the stream, and square to both (a stream going straight up or down has no level side of its own).
    let sideX = axis.z, sideZ = -axis.x;
    const level = Math.hypot(sideX, sideZ);
    if (level > 1e-6) { sideX /= level; sideZ /= level; } else { sideX = 1; sideZ = 0; }
    const liftX = -sideZ * axis.y, liftY = sideZ * axis.x - sideX * axis.z, liftZ = sideX * axis.y;
    const cells = emitted / SHEATH.exposure - this.base;
    for (let column = 0; column < columns; column++) {
      const vertex = row * columns + column;
      const cosAngle = this.columnCos[column], sinAngle = this.columnSin[column];
      this.positions[vertex * 3] = x + sideX * cosAngle * radius + liftX * sinAngle * radius;
      this.positions[vertex * 3 + 1] = y + liftY * sinAngle * radius;
      this.positions[vertex * 3 + 2] = z + sideZ * cosAngle * radius + liftZ * sinAngle * radius;
      this.normals[vertex * 3] = sideX * cosAngle + liftX * sinAngle;
      this.normals[vertex * 3 + 1] = liftY * sinAngle;
      this.normals[vertex * 3 + 2] = sideZ * cosAngle + liftZ * sinAngle;
      this.axes[vertex * 3] = axis.x; this.axes[vertex * 3 + 1] = axis.y; this.axes[vertex * 3 + 2] = axis.z;
      this.flow[vertex * 3] = cells; this.flow[vertex * 3 + 1] = depth; this.flow[vertex * 3 + 2] = broken;
      this.form[vertex * 2] = 1; this.form[vertex * 2 + 1] = 0;   // a ring of the rope (the fan's sheet is 0: src/sprayFan.js)
    }
    this.last.x = x; this.last.y = y; this.last.z = z;
  }

  /** The frame's rings are written: the rows left over go to the last ring's centre, undrawn; `walls` the pool's, or null. */
  finish(walls) {
    const columns = SHEATH.columns;
    for (let row = this.row; row < SHEATH.rings; row++) {
      for (let column = 0; column < columns; column++) {
        const vertex = row * columns + column;
        this.positions[vertex * 3] = this.last.x; this.positions[vertex * 3 + 1] = this.last.y; this.positions[vertex * 3 + 2] = this.last.z;
        this.normals[vertex * 3] = 0; this.normals[vertex * 3 + 1] = 1; this.normals[vertex * 3 + 2] = 0;
        this.axes[vertex * 3] = 1; this.axes[vertex * 3 + 1] = 0; this.axes[vertex * 3 + 2] = 0;
        this.flow[vertex * 3] = 0; this.flow[vertex * 3 + 1] = 0; this.flow[vertex * 3 + 2] = 0;
        this.form[vertex * 2] = 1; this.form[vertex * 2 + 1] = 0;
      }
    }
    holdWithinWalls(this.positions, walls);
    markChanged(this.geometry, ['position', 'normal', 'aAxis', 'aFlow', 'aForm']);
    this.mesh.visible = this.row > 1;
  }

  /** Nothing of the stream in the air. */
  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
