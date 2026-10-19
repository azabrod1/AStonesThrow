// Ring grids: the meshes the splash draws through its screen-space fluid
// passes, the crown sheet (src/crown.js) and the jet column (src/jet.js).
//
// A grid is `rows` rings of `columns` vertices each, closed around every ring;
// vertex (row, column) is at index row · columns + column. With `wrap: false`
// the rings stay open (a sector, such as the crown's forward fan): the last
// column does not join the first, and normals there take one-sided
// differences. Its attributes are typed arrays the owner rewrites once per
// rendered frame, then flags with markChanged. Normals come from central
// differences across and along the grid; where a ring collapses to a point (a
// pole) the normal points away from the next ring instead. The orientation of
// a normal (in or out) depends on which way the owner winds its rings.
import * as THREE from 'three';

/**
 * @param rows rings in the grid
 * @param columns vertices around each ring
 * @param attributes {name: [typedArray, itemSize]}, including 'position'
 * @param material the material the mesh starts with
 * @param wrap false for open rings (a sector), whose last column is an edge
 */
export function createRingGrid(rows, columns, attributes, material, { wrap = true } = {}) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, [array, itemSize]] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize).setUsage(THREE.DynamicDrawUsage));
  }
  const indices = [];
  const spans = wrap ? columns : columns - 1;
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < spans; column++) {
      const next = (column + 1) % columns;
      const corner = row * columns + column;
      const cornerNext = row * columns + next;
      const below = (row + 1) * columns + column;
      const belowNext = (row + 1) * columns + next;
      indices.push(corner, below, cornerNext, cornerNext, below, belowNext);
    }
  }
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Flatten a grid against walls: every vertex outside the box {minX, maxX,
 * minZ, maxZ} (the pool's, src/pool.js) is moved onto its nearest face, so a
 * sheet that meets a wall runs up it instead of passing through. No box, no change.
 */
export function holdWithinWalls(positions, walls) {
  if (!walls) return;
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = Math.min(Math.max(positions[index], walls.minX), walls.maxX);
    positions[index + 2] = Math.min(Math.max(positions[index + 2], walls.minZ), walls.maxZ);
  }
}

export function markChanged(geometry, names) {
  for (const name of names) geometry.attributes[name].needsUpdate = true;
}

/** Unit normals from central differences around each ring (one-sided at an open ring's ends) and along the grid. */
export function computeGridNormals(positions, normals, rows, columns, wrap = true) {
  for (let column = 0; column < columns; column++) {
    const previous = wrap ? (column + columns - 1) % columns : Math.max(column - 1, 0);
    const next = wrap ? (column + 1) % columns : Math.min(column + 1, columns - 1);
    for (let row = 0; row < rows; row++) {
      const vertex = row * columns + column;
      const before = Math.max(row - 1, 0) * columns + column;
      const after = Math.min(row + 1, rows - 1) * columns + column;
      const aroundX = positions[(row * columns + next) * 3] - positions[(row * columns + previous) * 3];
      const aroundY = positions[(row * columns + next) * 3 + 1] - positions[(row * columns + previous) * 3 + 1];
      const aroundZ = positions[(row * columns + next) * 3 + 2] - positions[(row * columns + previous) * 3 + 2];
      const alongX = positions[after * 3] - positions[before * 3];
      const alongY = positions[after * 3 + 1] - positions[before * 3 + 1];
      const alongZ = positions[after * 3 + 2] - positions[before * 3 + 2];
      let normalX = aroundY * alongZ - aroundZ * alongY;
      let normalY = aroundZ * alongX - aroundX * alongZ;
      let normalZ = aroundX * alongY - aroundY * alongX;
      let normalLength = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);
      const aroundLength = Math.sqrt(aroundX * aroundX + aroundY * aroundY + aroundZ * aroundZ);
      const alongLength = Math.sqrt(alongX * alongX + alongY * alongY + alongZ * alongZ);
      if (aroundLength < 1e-9 && alongLength > 1e-12) {
        // A pole: the surface there faces away from the rest of the grid.
        const away = row === 0 ? -1 : 1;
        normalX = away * alongX; normalY = away * alongY; normalZ = away * alongZ;
        normalLength = alongLength;
      }
      if (normalLength > 1e-12) { normalX /= normalLength; normalY /= normalLength; normalZ /= normalLength; } else { normalX = 0; normalY = 1; normalZ = 0; }
      normals[vertex * 3] = normalX;
      normals[vertex * 3 + 1] = normalY;
      normals[vertex * 3 + 2] = normalZ;
    }
  }
}
