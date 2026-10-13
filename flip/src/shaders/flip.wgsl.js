// WGSL compute kernels for the FLIP solver (flip/src/flipSolver.js).
//
// Adapted from the 3D FLIP in jeantimex/fluid (MIT, see flip/NOTICE.md), with
// these changes for a stone splash:
//   - metres and seconds, cubic cells, pressure stored as P/rho (m²/s²) so a
//     warm start survives a change of time step;
//   - cell types AIR, FLUID and SOLID, with the walls and a moving sphere (the
//     stone) treated as solids in the pressure equation (Neumann), the open
//     top treated as air (Dirichlet);
//   - particle-to-grid uses the correct staggered stencil per component, so
//     every particle's weights sum to one on each face grid;
//   - particles may leave the grid through the open top and fly ballistically
//     until they fall back in;
//   - red-black Gauss-Seidel with over-relaxation, no per-frame pressure reset;
//   - a max-speed reduction for the CFL time step and an optional residual.
//
// Grid layout. Cells are nx × ny × nz, cell (i, j, k) spans [i h, (i+1) h) on
// each axis. Velocity nodes are (nx+1) × (ny+1) × (nz+1); node (i, j, k) holds
// Vx on the face at x = i h (centre (i, j+½, k+½)), Vy on the face y = j h
// (centre (i+½, j, k+½)), Vz on the face z = k h (centre (i+½, j+½, k)), and
// the particle-count weight of cell (i, j, k) at its centre in .w.

export const FLIP_COMPUTE = /* wgsl */`
struct Uniforms {
  cellCount: vec3<u32>,
  particleCount: u32,
  cellSize: f32,
  dt: f32,
  gravity: f32,
  picBlend: f32,
  stoneCentre: vec3<f32>,
  stoneRadius: f32,
  stoneVelocity: vec3<f32>,
  stoneActive: f32,
  stoneCentreNext: vec3<f32>,
  densityStrength: f32,
  particlesPerCell: f32,
  measureResidual: f32,
  overRelaxation: f32,
  splashLevel: f32,
};

const AIR: u32 = 0u;
const FLUID: u32 = 1u;
const SOLID: u32 = 2u;

// Fixed-point scale for the atomic accumulators: 1e-5 m/s resolution, and
// room for several hundred particles' worth of 10 m/s on one node.
const SCALE: f32 = 100000.0;

override PARTICLE_WORKGROUP_SIZE: u32 = 64;

struct AtomicNode {
  momentumX: atomic<i32>, momentumY: atomic<i32>, momentumZ: atomic<i32>,
  weightX: atomic<i32>, weightY: atomic<i32>, weightZ: atomic<i32>,
  weightCentre: atomic<i32>, padding: i32,
};

struct CellInfo { marker: u32, divergence: f32 };

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> accumulators: array<AtomicNode>;
@group(0) @binding(4) var<storage, read_write> gridVelocity: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> gridVelocityBefore: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> cells: array<CellInfo>;
@group(0) @binding(7) var<storage, read_write> pressure: array<f32>;
// stats[0]: max particle speed squared this frame, stats[1]: max residual,
// both float bit patterns (non-negative floats order like their bits);
// stats[2]: sum of particle speeds in units of 1 cm/s, for the mean;
// stats[3]: number of particles above splashLevel (the undisturbed surface).
@group(0) @binding(8) var<storage, read_write> stats: array<atomic<u32>>;

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

fn nodeIndex(x: u32, y: u32, z: u32) -> u32 {
  let count = uniforms.cellCount;
  let cx = min(x, count.x);
  let cy = min(y, count.y);
  let cz = min(z, count.z);
  return cx + cy * (count.x + 1u) + cz * (count.x + 1u) * (count.y + 1u);
}

fn cellIndex(x: u32, y: u32, z: u32) -> u32 {
  let count = uniforms.cellCount;
  let cx = min(x, count.x - 1u);
  let cy = min(y, count.y - 1u);
  let cz = min(z, count.z - 1u);
  return cx + cy * count.x + cz * count.x * count.y;
}

fn insideDomain(x: i32, y: i32, z: i32) -> bool {
  let count = vec3<i32>(uniforms.cellCount);
  return x >= 0 && y >= 0 && z >= 0 && x < count.x && y < count.y && z < count.z;
}

// Cell type with the surroundings folded in: walls and floor are solid, the
// space above the grid is air.
fn cellTypeAt(x: i32, y: i32, z: i32) -> u32 {
  let count = vec3<i32>(uniforms.cellCount);
  if (x < 0 || z < 0 || y < 0 || x >= count.x || z >= count.z) { return SOLID; }
  if (y >= count.y) { return AIR; }
  return cells[cellIndex(u32(x), u32(y), u32(z))].marker;
}

fn pressureAt(x: i32, y: i32, z: i32) -> f32 {
  if (!insideDomain(x, y, z)) { return 0.0; }
  let cell = cellIndex(u32(x), u32(y), u32(z));
  if (cells[cell].marker != FLUID) { return 0.0; }
  return pressure[cell];
}

// ---------------------------------------------------------------------------
// Transfers between particles and the staggered grid
// ---------------------------------------------------------------------------

// Offsets of each component's sample points from the node corner, in cells.
const OFFSET_X = vec3<f32>(0.0, 0.5, 0.5);
const OFFSET_Y = vec3<f32>(0.5, 0.0, 0.5);
const OFFSET_Z = vec3<f32>(0.5, 0.5, 0.0);
const OFFSET_CENTRE = vec3<f32>(0.5, 0.5, 0.5);

// Splat one scalar onto the 2×2×2 nodes of one face grid with trilinear
// weights. The stencil is taken around the shifted position so that it is the
// true neighbourhood of the particle on that grid; the weights sum to one.
fn splat(gridPosition: vec3<f32>, offset: vec3<f32>, component: u32, value: f32) {
  let shifted = gridPosition - offset;
  let base = vec3<i32>(floor(shifted));
  let fraction = shifted - vec3<f32>(base);
  let count = vec3<i32>(uniforms.cellCount);
  for (var stepX = 0; stepX <= 1; stepX++) {
    for (var stepY = 0; stepY <= 1; stepY++) {
      for (var stepZ = 0; stepZ <= 1; stepZ++) {
        let nodeX = base.x + stepX;
        let nodeY = base.y + stepY;
        let nodeZ = base.z + stepZ;
        if (nodeX < 0 || nodeY < 0 || nodeZ < 0 || nodeX > count.x || nodeY > count.y || nodeZ > count.z) { continue; }
        let weight = select(1.0 - fraction.x, fraction.x, stepX == 1)
                   * select(1.0 - fraction.y, fraction.y, stepY == 1)
                   * select(1.0 - fraction.z, fraction.z, stepZ == 1);
        let node = nodeIndex(u32(nodeX), u32(nodeY), u32(nodeZ));
        let weightFixed = i32(round(weight * SCALE));
        let valueFixed = i32(round(value * weight * SCALE));
        switch (component) {
          case 0u: {
            atomicAdd(&accumulators[node].weightX, weightFixed);
            atomicAdd(&accumulators[node].momentumX, valueFixed);
          }
          case 1u: {
            atomicAdd(&accumulators[node].weightY, weightFixed);
            atomicAdd(&accumulators[node].momentumY, valueFixed);
          }
          case 2u: {
            atomicAdd(&accumulators[node].weightZ, weightFixed);
            atomicAdd(&accumulators[node].momentumZ, valueFixed);
          }
          default: {
            atomicAdd(&accumulators[node].weightCentre, weightFixed);
          }
        }
      }
    }
  }
}

// Trilinear sample of one velocity component from the current grid, or from
// the snapshot taken before forces and projection when 'before' is set.
fn sampleComponent(gridPosition: vec3<f32>, offset: vec3<f32>, component: u32, before: bool) -> f32 {
  let shifted = gridPosition - offset;
  let base = vec3<i32>(floor(shifted));
  let fraction = shifted - vec3<f32>(base);
  let count = vec3<i32>(uniforms.cellCount);
  var value = 0.0;
  for (var stepX = 0; stepX <= 1; stepX++) {
    for (var stepY = 0; stepY <= 1; stepY++) {
      for (var stepZ = 0; stepZ <= 1; stepZ++) {
        let weight = select(1.0 - fraction.x, fraction.x, stepX == 1)
                   * select(1.0 - fraction.y, fraction.y, stepY == 1)
                   * select(1.0 - fraction.z, fraction.z, stepZ == 1);
        let nodeX = u32(clamp(base.x + stepX, 0, count.x));
        let nodeY = u32(clamp(base.y + stepY, 0, count.y));
        let nodeZ = u32(clamp(base.z + stepZ, 0, count.z));
        let node = nodeIndex(nodeX, nodeY, nodeZ);
        if (before) {
          value += gridVelocityBefore[node][component] * weight;
        } else {
          value += gridVelocity[node][component] * weight;
        }
      }
    }
  }
  return value;
}

fn sampleVelocity(gridPosition: vec3<f32>, before: bool) -> vec3<f32> {
  return vec3<f32>(
    sampleComponent(gridPosition, OFFSET_X, 0u, before),
    sampleComponent(gridPosition, OFFSET_Y, 1u, before),
    sampleComponent(gridPosition, OFFSET_Z, 2u, before));
}

fn aboveGrid(gridPosition: vec3<f32>) -> bool {
  return gridPosition.y >= f32(uniforms.cellCount.y);
}

// ---------------------------------------------------------------------------
// Step 1: clear the grid and classify cells as air or solid
// ---------------------------------------------------------------------------

@compute @workgroup_size(8, 4, 4)
fn clearGrid(@builtin(global_invocation_id) id: vec3<u32>) {
  let count = uniforms.cellCount;
  if (id.x <= count.x && id.y <= count.y && id.z <= count.z) {
    let node = nodeIndex(id.x, id.y, id.z);
    atomicStore(&accumulators[node].momentumX, 0);
    atomicStore(&accumulators[node].momentumY, 0);
    atomicStore(&accumulators[node].momentumZ, 0);
    atomicStore(&accumulators[node].weightX, 0);
    atomicStore(&accumulators[node].weightY, 0);
    atomicStore(&accumulators[node].weightZ, 0);
    atomicStore(&accumulators[node].weightCentre, 0);
    gridVelocity[node] = vec4<f32>(0.0);
    gridVelocityBefore[node] = vec4<f32>(0.0);
  }
  if (id.x < count.x && id.y < count.y && id.z < count.z) {
    let cell = cellIndex(id.x, id.y, id.z);
    var marker = AIR;
    if (uniforms.stoneActive > 0.5) {
      let centre = (vec3<f32>(id) + 0.5) * uniforms.cellSize;
      if (distance(centre, uniforms.stoneCentre) < uniforms.stoneRadius) { marker = SOLID; }
    }
    cells[cell] = CellInfo(marker, 0.0);
  }
}

// ---------------------------------------------------------------------------
// Step 2: particle to grid
// ---------------------------------------------------------------------------

@compute @workgroup_size(PARTICLE_WORKGROUP_SIZE)
fn transferToGrid(@builtin(global_invocation_id) id: vec3<u32>) {
  let particle = id.x;
  if (particle >= uniforms.particleCount) { return; }
  let position = positions[particle].xyz;
  let velocity = velocities[particle].xyz;
  atomicMax(&stats[0], bitcast<u32>(dot(velocity, velocity)));
  atomicAdd(&stats[2], u32(length(velocity) * 100.0));
  if (position.y > uniforms.splashLevel) { atomicAdd(&stats[3], 1u); }
  let gridPosition = position / uniforms.cellSize;
  if (aboveGrid(gridPosition)) { return; }
  splat(gridPosition, OFFSET_X, 0u, velocity.x);
  splat(gridPosition, OFFSET_Y, 1u, velocity.y);
  splat(gridPosition, OFFSET_Z, 2u, velocity.z);
  splat(gridPosition, OFFSET_CENTRE, 3u, 0.0);
}

// ---------------------------------------------------------------------------
// Step 3: mark the cells that hold particles as fluid
// ---------------------------------------------------------------------------

@compute @workgroup_size(PARTICLE_WORKGROUP_SIZE)
fn markCells(@builtin(global_invocation_id) id: vec3<u32>) {
  let particle = id.x;
  if (particle >= uniforms.particleCount) { return; }
  let gridPosition = positions[particle].xyz / uniforms.cellSize;
  if (aboveGrid(gridPosition)) { return; }
  let count = vec3<i32>(uniforms.cellCount);
  let cellCoord = clamp(vec3<i32>(floor(gridPosition)), vec3<i32>(0), count - 1);
  let cell = cellIndex(u32(cellCoord.x), u32(cellCoord.y), u32(cellCoord.z));
  // Solid wins; several particles writing FLUID to one cell is harmless.
  if (cells[cell].marker != SOLID) { cells[cell].marker = FLUID; }
}

// ---------------------------------------------------------------------------
// Step 4: turn the weighted sums into velocities and keep a snapshot
// ---------------------------------------------------------------------------

@compute @workgroup_size(8, 4, 4)
fn normalizeGrid(@builtin(global_invocation_id) id: vec3<u32>) {
  let count = uniforms.cellCount;
  if (id.x > count.x || id.y > count.y || id.z > count.z) { return; }
  let node = nodeIndex(id.x, id.y, id.z);
  let weightX = f32(atomicLoad(&accumulators[node].weightX)) / SCALE;
  let weightY = f32(atomicLoad(&accumulators[node].weightY)) / SCALE;
  let weightZ = f32(atomicLoad(&accumulators[node].weightZ)) / SCALE;
  let density = f32(atomicLoad(&accumulators[node].weightCentre)) / SCALE;
  var velocity = vec3<f32>(0.0);
  if (weightX > 0.0) { velocity.x = f32(atomicLoad(&accumulators[node].momentumX)) / SCALE / weightX; }
  if (weightY > 0.0) { velocity.y = f32(atomicLoad(&accumulators[node].momentumY)) / SCALE / weightY; }
  if (weightZ > 0.0) { velocity.z = f32(atomicLoad(&accumulators[node].momentumZ)) / SCALE / weightZ; }
  let packed = vec4<f32>(velocity, density);
  gridVelocity[node] = packed;
  gridVelocityBefore[node] = packed;
}

// ---------------------------------------------------------------------------
// Phantom faces. The node array has one extra layer per axis, so tangential
// components exist on faces that lie outside the domain: Vx on the rows y = ny
// and z = nz, and so on. Particles in the last cell next to a wall splat onto
// and sample from them, so they must hold sensible values. Free-slip walls want
// a zero gradient, so each phantom face copies the nearest interior face. Run
// after the transfer (on both grids, so the FLIP delta stays consistent) and
// again after projection.
// ---------------------------------------------------------------------------

fn mirrorPhantomFaces(id: vec3<u32>, bothGrids: bool) {
  let count = uniforms.cellCount;
  if (id.x > count.x || id.y > count.y || id.z > count.z) { return; }
  let phantomX = id.y == count.y || id.z == count.z;
  let phantomY = id.x == count.x || id.z == count.z;
  let phantomZ = id.x == count.x || id.y == count.y;
  if (!(phantomX || phantomY || phantomZ)) { return; }
  let node = nodeIndex(id.x, id.y, id.z);
  var velocity = gridVelocity[node];
  var before = gridVelocityBefore[node];
  if (phantomX) {
    let source = nodeIndex(id.x, min(id.y, count.y - 1u), min(id.z, count.z - 1u));
    velocity.x = gridVelocity[source].x;
    before.x = gridVelocityBefore[source].x;
  }
  if (phantomY) {
    let source = nodeIndex(min(id.x, count.x - 1u), id.y, min(id.z, count.z - 1u));
    velocity.y = gridVelocity[source].y;
    before.y = gridVelocityBefore[source].y;
  }
  if (phantomZ) {
    let source = nodeIndex(min(id.x, count.x - 1u), min(id.y, count.y - 1u), id.z);
    velocity.z = gridVelocity[source].z;
    before.z = gridVelocityBefore[source].z;
  }
  gridVelocity[node] = velocity;
  if (bothGrids) { gridVelocityBefore[node] = before; }
}

@compute @workgroup_size(8, 4, 4)
fn mirrorPhantomFacesBoth(@builtin(global_invocation_id) id: vec3<u32>) { mirrorPhantomFaces(id, true); }

@compute @workgroup_size(8, 4, 4)
fn mirrorPhantomFacesNow(@builtin(global_invocation_id) id: vec3<u32>) { mirrorPhantomFaces(id, false); }

// ---------------------------------------------------------------------------
// Step 5: gravity
// ---------------------------------------------------------------------------

@compute @workgroup_size(8, 4, 4)
fn addGravity(@builtin(global_invocation_id) id: vec3<u32>) {
  let count = uniforms.cellCount;
  if (id.x > count.x || id.y > count.y || id.z > count.z) { return; }
  let node = nodeIndex(id.x, id.y, id.z);
  gridVelocity[node].y -= uniforms.gravity * uniforms.dt;
}

// ---------------------------------------------------------------------------
// Steps 6 and 10: solid boundaries. A face touching a solid cell takes the
// solid's normal velocity: zero for the walls and floor, the stone's velocity
// for the stone. The top is open.
// ---------------------------------------------------------------------------

fn solidFaceVelocity(typeA: u32, insideA: bool, typeB: u32, insideB: bool, component: u32) -> f32 {
  let stoneFace = (typeA == SOLID && insideA) || (typeB == SOLID && insideB);
  return select(0.0, uniforms.stoneVelocity[component], stoneFace);
}

@compute @workgroup_size(8, 4, 4)
fn enforceBoundary(@builtin(global_invocation_id) id: vec3<u32>) {
  let count = uniforms.cellCount;
  if (id.x > count.x || id.y > count.y || id.z > count.z) { return; }
  let node = nodeIndex(id.x, id.y, id.z);
  let x = i32(id.x);
  let y = i32(id.y);
  let z = i32(id.z);
  var velocity = gridVelocity[node];
  if (id.y < count.y && id.z < count.z) {
    let typeA = cellTypeAt(x - 1, y, z);
    let typeB = cellTypeAt(x, y, z);
    if (typeA == SOLID || typeB == SOLID) {
      velocity.x = solidFaceVelocity(typeA, insideDomain(x - 1, y, z), typeB, insideDomain(x, y, z), 0u);
    }
  }
  if (id.x < count.x && id.z < count.z) {
    let typeA = cellTypeAt(x, y - 1, z);
    let typeB = cellTypeAt(x, y, z);
    if (typeA == SOLID || typeB == SOLID) {
      velocity.y = solidFaceVelocity(typeA, insideDomain(x, y - 1, z), typeB, insideDomain(x, y, z), 1u);
    }
  }
  if (id.x < count.x && id.y < count.y) {
    let typeA = cellTypeAt(x, y, z - 1);
    let typeB = cellTypeAt(x, y, z);
    if (typeA == SOLID || typeB == SOLID) {
      velocity.z = solidFaceVelocity(typeA, insideDomain(x, y, z - 1), typeB, insideDomain(x, y, z), 2u);
    }
  }
  gridVelocity[node] = velocity;
}

// ---------------------------------------------------------------------------
// Step 7: the right-hand side of the pressure equation
//
// With p = P/rho the projection is v' = v - dt grad p, and div v' = 0 gives
// lap p = div v / dt. Cells holding more than their share of particles are
// asked to expand a little instead, which keeps the particles from piling up.
// ---------------------------------------------------------------------------

@compute @workgroup_size(8, 4, 4)
fn computeDivergence(@builtin(global_invocation_id) id: vec3<u32>) {
  let count = uniforms.cellCount;
  if (id.x >= count.x || id.y >= count.y || id.z >= count.z) { return; }
  let cell = cellIndex(id.x, id.y, id.z);
  if (cells[cell].marker != FLUID) {
    cells[cell].divergence = 0.0;
    pressure[cell] = 0.0;
    return;
  }
  let here = gridVelocity[nodeIndex(id.x, id.y, id.z)];
  let right = gridVelocity[nodeIndex(id.x + 1u, id.y, id.z)].x;
  let top = gridVelocity[nodeIndex(id.x, id.y + 1u, id.z)].y;
  let front = gridVelocity[nodeIndex(id.x, id.y, id.z + 1u)].z;
  var divergence = (right - here.x + top - here.y + front - here.z) / uniforms.cellSize;
  let overDensity = max(here.w / uniforms.particlesPerCell - 1.0, 0.0);
  divergence -= uniforms.densityStrength * overDensity / uniforms.dt;
  cells[cell].divergence = divergence / uniforms.dt;
}

// ---------------------------------------------------------------------------
// Step 8: red-black Gauss-Seidel sweeps with over-relaxation
//
// For each fluid cell, sum over its six neighbours: solid ones drop out of the
// equation, air ones count with zero pressure, fluid ones bring their pressure.
// ---------------------------------------------------------------------------

// Returns (diagonal contribution, neighbour pressure contribution).
fn neighbourTerm(x: i32, y: i32, z: i32) -> vec2<f32> {
  let cellType = cellTypeAt(x, y, z);
  if (cellType == SOLID) { return vec2<f32>(0.0); }
  if (cellType == AIR) { return vec2<f32>(1.0, 0.0); }
  return vec2<f32>(1.0, pressure[cellIndex(u32(x), u32(y), u32(z))]);
}

fn gaussSeidelSweep(id: vec3<u32>, parity: u32) {
  let count = uniforms.cellCount;
  if (id.x >= count.x || id.y >= count.y || id.z >= count.z) { return; }
  if ((id.x + id.y + id.z) % 2u != parity) { return; }
  let cell = cellIndex(id.x, id.y, id.z);
  let info = cells[cell];
  if (info.marker != FLUID) { return; }
  let x = i32(id.x);
  let y = i32(id.y);
  let z = i32(id.z);
  let terms = neighbourTerm(x - 1, y, z) + neighbourTerm(x + 1, y, z)
            + neighbourTerm(x, y - 1, z) + neighbourTerm(x, y + 1, z)
            + neighbourTerm(x, y, z - 1) + neighbourTerm(x, y, z + 1);
  if (terms.x == 0.0) {
    pressure[cell] = 0.0;
    return;
  }
  let cellArea = uniforms.cellSize * uniforms.cellSize;
  let relaxed = (terms.y - info.divergence * cellArea) / terms.x;
  pressure[cell] = mix(pressure[cell], relaxed, uniforms.overRelaxation);
}

@compute @workgroup_size(8, 4, 4)
fn pressureRed(@builtin(global_invocation_id) id: vec3<u32>) { gaussSeidelSweep(id, 0u); }

@compute @workgroup_size(8, 4, 4)
fn pressureBlack(@builtin(global_invocation_id) id: vec3<u32>) { gaussSeidelSweep(id, 1u); }

// ---------------------------------------------------------------------------
// Step 9: subtract the pressure gradient on faces that touch fluid
// ---------------------------------------------------------------------------

@compute @workgroup_size(8, 4, 4)
fn applyPressure(@builtin(global_invocation_id) id: vec3<u32>) {
  let count = uniforms.cellCount;
  if (id.x > count.x || id.y > count.y || id.z > count.z) { return; }
  let node = nodeIndex(id.x, id.y, id.z);
  let x = i32(id.x);
  let y = i32(id.y);
  let z = i32(id.z);
  let scale = uniforms.dt / uniforms.cellSize;
  var velocity = gridVelocity[node];
  if (id.y < count.y && id.z < count.z) {
    let typeA = cellTypeAt(x - 1, y, z);
    let typeB = cellTypeAt(x, y, z);
    if (typeA != SOLID && typeB != SOLID && (typeA == FLUID || typeB == FLUID)) {
      velocity.x -= scale * (pressureAt(x, y, z) - pressureAt(x - 1, y, z));
    }
  }
  if (id.x < count.x && id.z < count.z) {
    let typeA = cellTypeAt(x, y - 1, z);
    let typeB = cellTypeAt(x, y, z);
    if (typeA != SOLID && typeB != SOLID && (typeA == FLUID || typeB == FLUID)) {
      velocity.y -= scale * (pressureAt(x, y, z) - pressureAt(x, y - 1, z));
    }
  }
  if (id.x < count.x && id.y < count.y) {
    let typeA = cellTypeAt(x, y, z - 1);
    let typeB = cellTypeAt(x, y, z);
    if (typeA != SOLID && typeB != SOLID && (typeA == FLUID || typeB == FLUID)) {
      velocity.z -= scale * (pressureAt(x, y, z) - pressureAt(x, y, z - 1));
    }
  }
  gridVelocity[node] = velocity;
}

// ---------------------------------------------------------------------------
// Diagnostics: how far the pressure equation is from solved, as the largest
// mismatch between lap p and its right-hand side, scaled by dt so it reads as
// a divergence in 1/s. Cells asked to expand are measured against that target.
// ---------------------------------------------------------------------------

@compute @workgroup_size(8, 4, 4)
fn computeResidual(@builtin(global_invocation_id) id: vec3<u32>) {
  let count = uniforms.cellCount;
  if (id.x >= count.x || id.y >= count.y || id.z >= count.z) { return; }
  let cell = cellIndex(id.x, id.y, id.z);
  let info = cells[cell];
  if (info.marker != FLUID) { return; }
  let x = i32(id.x);
  let y = i32(id.y);
  let z = i32(id.z);
  let terms = neighbourTerm(x - 1, y, z) + neighbourTerm(x + 1, y, z)
            + neighbourTerm(x, y - 1, z) + neighbourTerm(x, y + 1, z)
            + neighbourTerm(x, y, z - 1) + neighbourTerm(x, y, z + 1);
  let cellArea = uniforms.cellSize * uniforms.cellSize;
  let laplacian = (terms.y - terms.x * pressure[cell]) / cellArea;
  let mismatch = abs(laplacian - info.divergence) * uniforms.dt;
  atomicMax(&stats[1], bitcast<u32>(mismatch));
}

// ---------------------------------------------------------------------------
// Step 11: grid to particle. FLIP keeps the particle's own velocity and adds
// what the grid did; a little PIC keeps it stable. Above the grid, ballistic.
// ---------------------------------------------------------------------------

@compute @workgroup_size(PARTICLE_WORKGROUP_SIZE)
fn gridToParticle(@builtin(global_invocation_id) id: vec3<u32>) {
  let particle = id.x;
  if (particle >= uniforms.particleCount) { return; }
  let gridPosition = positions[particle].xyz / uniforms.cellSize;
  var velocity = velocities[particle].xyz;
  if (aboveGrid(gridPosition)) {
    velocity.y -= uniforms.gravity * uniforms.dt;
  } else {
    let gridNow = sampleVelocity(gridPosition, false);
    let gridBefore = sampleVelocity(gridPosition, true);
    let flipVelocity = velocity + (gridNow - gridBefore);
    velocity = mix(flipVelocity, gridNow, uniforms.picBlend);
  }
  velocities[particle] = vec4<f32>(velocity, 0.0);
}

// ---------------------------------------------------------------------------
// Step 12: move the particles (midpoint rule through the grid field), then
// keep them out of the walls, the floor and the stone.
// ---------------------------------------------------------------------------

@compute @workgroup_size(PARTICLE_WORKGROUP_SIZE)
fn advect(@builtin(global_invocation_id) id: vec3<u32>) {
  let particle = id.x;
  if (particle >= uniforms.particleCount) { return; }
  var position = positions[particle].xyz;
  var velocity = velocities[particle].xyz;
  let cellSize = uniforms.cellSize;
  let dt = uniforms.dt;
  let gridPosition = position / cellSize;
  if (aboveGrid(gridPosition)) {
    position += velocity * dt;
  } else {
    let firstVelocity = sampleVelocity(gridPosition, false);
    let midpoint = position + firstVelocity * (0.5 * dt);
    let midVelocity = sampleVelocity(midpoint / cellSize, false);
    position += midVelocity * dt;
  }

  let margin = 0.05 * cellSize;
  let extent = vec3<f32>(uniforms.cellCount) * cellSize;
  if (position.x < margin) { position.x = margin; velocity.x = max(velocity.x, 0.0); }
  if (position.x > extent.x - margin) { position.x = extent.x - margin; velocity.x = min(velocity.x, 0.0); }
  if (position.z < margin) { position.z = margin; velocity.z = max(velocity.z, 0.0); }
  if (position.z > extent.z - margin) { position.z = extent.z - margin; velocity.z = min(velocity.z, 0.0); }
  if (position.y < margin) { position.y = margin; velocity.y = max(velocity.y, 0.0); }

  if (uniforms.stoneActive > 0.5) {
    let toParticle = position - uniforms.stoneCentreNext;
    let separation = length(toParticle);
    let pushRadius = uniforms.stoneRadius + 0.1 * cellSize;
    if (separation < pushRadius) {
      let normal = toParticle / max(separation, 1e-6);
      position = uniforms.stoneCentreNext + normal * pushRadius;
      let normalSpeed = dot(velocity, normal);
      let stoneNormalSpeed = dot(uniforms.stoneVelocity, normal);
      if (normalSpeed < stoneNormalSpeed) { velocity += (stoneNormalSpeed - normalSpeed) * normal; }
    }
  }

  positions[particle] = vec4<f32>(position, 1.0);
  velocities[particle] = vec4<f32>(velocity, 0.0);
}
`;
