// A walled basin: water held inside walls, as src/pool.js holds things in it,
// src/splash.js lands drops round it and src/ice.js covers it. Either a
// square, { minX, minZ, size } (the Pool's: the solver's pool), or a
// rectangle, { minX, minZ, sizeX, sizeZ } (the Reflecting Pool's,
// src/mallPool.js MALL_BASIN), with its walls' top `deck` (m over the still
// water) where it gives one. Whatever reads a basin reads it through these,
// so a square and a rectangle are alike to it.

/** The basin's width across `axis` ('x' or 'z', m). */
export const basinSpan = (basin, axis) => (axis === 'x' ? basin.sizeX : basin.sizeZ) ?? basin.size;

/** Its walls' top (m over the still water): its own `deck`, else `otherwise`. */
export const basinDeck = (basin, otherwise) => basin.deck ?? otherwise;

/** Its walls' faces: { minX, maxX, minZ, maxZ }. */
export const basinBounds = (basin) => ({ minX: basin.minX, maxX: basin.minX + basinSpan(basin, 'x'), minZ: basin.minZ, maxZ: basin.minZ + basinSpan(basin, 'z') });

/** How far inside its walls a world XZ point lies (m: to the nearest wall's face; negative outside them). */
export function basinInside(basin, x, z) {
  const { minX, maxX, minZ, maxZ } = basinBounds(basin);
  return Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
}
