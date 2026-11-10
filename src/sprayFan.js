// The fan of spray a stream throws off the water where it lands (the water
// cannon's rooster tail: src/waterCannon.js works out where each part of it
// is and how thick, and writes it here once a frame; src/shaders/stream.js
// shades it, as the stream's rope but a sheet).
//
// One open grid of FAN_GRID.rows by FAN_GRID.columns, built once and
// rewritten each frame the fan flies: a row is the water thrown at one
// moment, its columns that water's place across the fan, so a column is a
// line of water thrown the same way and the sheet is all of it in the air.
// begin, a vertex for each (row, column), finish. A vertex of no depth is
// not drawn, so a fan in several pieces is one grid with rows of no depth at
// each piece's ends, and so are the rows left over. The normals are worked
// out from the grid as written (src/fluidMesh.js computeGridNormals): the
// shader wants them for the sun and for how long a ray's way through the
// sheet is.
//
// It is the stream's material (src/streamSheath.js: one program for both),
// drawn in the main scene after it, premultiplied, writing no depth, lifted
// under a gale by the shader and held within the pool's walls here. Its
// three.js objects draw their random ids from a stream of their own (IDS).
import { createRingGrid, computeGridNormals, holdWithinWalls, markChanged } from './fluidMesh.js';
import { SHEATH } from './streamSheath.js';
import { seededRandom } from './spray.js';
import { withRandom } from './withRandom.js';

export const FAN_GRID = {
  rows: 72,
  columns: 41,
  across: 4,   // a column's place across the fan (−1 to 1) times this is its place in the streaks' cells (STREAM_SHEET_ACROSS in src/shaders/stream.js)
};
const IDS = 0x5fa41;   // its random ids' own stream (the header)

export class SprayFan {
  /** @param material the stream's rope's (src/streamSheath.js `material`): the fan is drawn by the same program */
  constructor({ material }) {
    const { rows, columns } = FAN_GRID;
    const vertices = rows * columns;
    this.positions = new Float32Array(vertices * 3);
    this.normals = new Float32Array(vertices * 3);
    this.axes = new Float32Array(vertices * 3);
    this.around = new Float32Array(vertices * 2);
    this.flow = new Float32Array(vertices * 3);
    this.form = new Float32Array(vertices * 2);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        // Its place across the fan, in the streaks' cells; the second is only an offset into the noise.
        this.around[(row * columns + column) * 2] = (-1 + (2 * column) / (columns - 1)) * FAN_GRID.across;
        this.around[(row * columns + column) * 2 + 1] = 0.37;
      }
    }
    this.rows = 0;   // rows written this frame
    this.base = 0;   // whole periods of cells taken off each vertex's time (begin)
    this.mesh = withRandom(seededRandom(IDS, vertices), () => createRingGrid(rows, columns, {
      position: [this.positions, 3],
      normal: [this.normals, 3],
      aAxis: [this.axes, 3],
      aAround: [this.around, 2],
      aFlow: [this.flow, 3],
      aForm: [this.form, 2],
    }, material, { wrap: false }));
    this.mesh.visible = false;
    this.geometry = this.mesh.geometry;
  }

  /** Start this frame's rows; `newest` is when the fan's newest water left the nozzle (s). */
  begin(newest) {
    this.rows = 0;
    this.base = SHEATH.period * Math.floor(newest / SHEATH.exposure / SHEATH.period);
  }

  /** Rows still unwritten this frame. */
  get room() { return FAN_GRID.rows - this.rows; }

  /** The next row to write (its vertices by `vertex`): its index, or −1 with no room left. */
  row() {
    return this.rows < FAN_GRID.rows ? this.rows++ : -1;
  }

  /**
   * A vertex of row `row` (from `row()`), column `column`: at (x, y, z), its
   * water going along (axisX, axisY, axisZ), let out of the nozzle at
   * `emitted` (s), `depth` the optical depth through the sheet there, seen
   * square on (0: not drawn), `broken` how far it has broken up (0 to 1),
   * `spray` how fine its streaks are (src/shaders/stream.js aForm.y),
   * `slower` its speed as a share of the stream's (its streaks are as long in
   * the air as the stream's) and `grain` how many times the streaks across
   * it (a bigger fan has more, no wider).
   */
  vertex(row, column, x, y, z, axisX, axisY, axisZ, emitted, depth, broken, spray, slower, grain) {
    const vertex = row * FAN_GRID.columns + column;
    this.positions[vertex * 3] = x; this.positions[vertex * 3 + 1] = y; this.positions[vertex * 3 + 2] = z;
    this.axes[vertex * 3] = axisX; this.axes[vertex * 3 + 1] = axisY; this.axes[vertex * 3 + 2] = axisZ;
    this.flow[vertex * 3] = (emitted / SHEATH.exposure - this.base) * slower; this.flow[vertex * 3 + 1] = depth; this.flow[vertex * 3 + 2] = broken;
    this.form[vertex * 2] = -grain; this.form[vertex * 2 + 1] = spray;   // below 0: a sheet (the rope's rings are 1)
  }

  /** The frame's rows are written: the rows left over lie on the last one, undrawn; `walls` the pool's, or null. */
  finish(walls) {
    const { rows, columns } = FAN_GRID;
    if (this.rows === 0) { this.mesh.visible = false; return; }
    const last = (this.rows - 1) * columns;
    for (let row = this.rows; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const vertex = row * columns + column, from = last + column;
        this.positions[vertex * 3] = this.positions[from * 3]; this.positions[vertex * 3 + 1] = this.positions[from * 3 + 1]; this.positions[vertex * 3 + 2] = this.positions[from * 3 + 2];
        this.axes[vertex * 3] = 1; this.axes[vertex * 3 + 1] = 0; this.axes[vertex * 3 + 2] = 0;
        this.flow[vertex * 3] = 0; this.flow[vertex * 3 + 1] = 0; this.flow[vertex * 3 + 2] = 0;
        this.form[vertex * 2] = this.form[from * 2]; this.form[vertex * 2 + 1] = 0;
      }
    }
    holdWithinWalls(this.positions, walls);
    computeGridNormals(this.positions, this.normals, rows, columns, false);
    markChanged(this.geometry, ['position', 'normal', 'aAxis', 'aFlow', 'aForm']);
    this.mesh.visible = this.rows > 1;
  }

  /** Nothing of the fan in the air. */
  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.geometry.dispose();
  }
}
