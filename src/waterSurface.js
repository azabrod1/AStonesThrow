// The water surface: an inner patch that follows the simulated height field and
// a flat outer sheet to the horizon, drawn with one shader. The ambient wind
// waves (src/ambientWaves.js) and the rings that cross the pond
// (src/rings.js) ride on both: they displace the inner patch with the
// splash's waves and shade all the water (WATER_VERTEX and WATER_FRAGMENT say
// how). The sheet reaches OUTER_HALF_SIZE metres from the patch's centre,
// so seen from the shore view's eye (1.15 m up) its edge is 0.007° below the
// horizon, and from the high view's (2.4 m) 0.015°, and the water meets the
// sky dome's horizon with no strip of the photo's own ground between them
// (the dome's box reaches 10 km).
//
// Under a gale (src/galeWaves.js, setGale) the gale's waves move both, the
// patch and the sheet alike, and the sheet is cut finer so it can carry
// them (GALE_SHEET_CUTS): the still sheet's few large quads come back when
// it drops. Both read the waves at a point's rest position, so the patch's
// edge and the sheet's start, which overlap, move together.
//
// A stone's cavity (src/cavity.js) is drawn with the same shader and the same
// uniforms: cavityMaterial is its CAVITY_MESH variant, for the cavity's mesh,
// and while any cavity is open setCavities swaps the inner patch to its
// CAVITY_PUSH variant, which dips the patch under each cavity's lip so it
// never shows through the hole. With no cavity open the patch draws with its
// own material, so still water costs exactly what it did. The app's warm-up
// (src/main.js) draws both variants before the first throw, so their programs
// are built by then.
//
// In the pool (setPool, src/pool.js) the inner patch draws only the pool's
// quads and a ring of them under its walls (the patch beyond is the
// solver's mirror images, src/spectralWater.js, and the deck covers it), the
// app hides the outer sheet, and seen from below the surface mirrors the
// basin rather than the lake bed. The pool's mirror image holds its walls and
// deck, near the water, so the water looks every reflection up by its
// distance (WATER_FRAGMENT's nearReflection), not only the splash's.
//
// Seen from under the water (src/main.js's Under view), the same meshes draw
// with WATER_UNDER_FRAGMENT (the sky through Snell's window, the water
// mirrored past it), their back faces, and a cavity with its CAVITY_MESH
// variant: fromBelow(true) swaps the patch's and the sheet's materials, and
// cavityUnderMaterial is the cavities'; fromBelow(false) puts them back. The
// patch keeps no dip under a cavity from below: the hole hangs in front of
// it.
//
// update() hands the shader, each frame, the two images it looks things up
// in: the mirror image (with where the splash lies in it: the shader reads
// distances there, WATER_FRAGMENT) and the under-water pass (with whether a
// stone is under the water: its lookup is then checked against it).
//
// The inner patch's mesh carries only the displacement: the shader takes
// the normal from the height textures per pixel, so the mesh needs no more
// vertices than the displacement's silhouette and the cavity's dip need, and
// fewer than the solver's grid on the lower quality presets
// (setMeshSegments, src/main.js). It keeps only its positions (the shader
// reads no normal or uv). The cavity dips the patch by whole vertices, so
// `cell` (the mesh's spacing) is what src/cavity.js margins by, and the rings
// displace it as smoothed to that spacing (uMeshCell). The sizes the
// shader needs of the solver's grid are the solver's shared gridUniforms, so
// they follow its resize.
import * as THREE from 'three';
import { WATER_VERTEX, WATER_FRAGMENT, WATER_UNDER_FRAGMENT } from './shaders/scene.js';

export const OUTER_HALF_SIZE = 9000;
const OUTER_GROWTH = 1.25;   // each of the outer sheet's square rings this many times the last's half size...
const OUTER_CUTS = 8;        // ...and each of its sides cut into this many quads
// The sheet starts this far inside the patch's edge, under it: the patch's
// edge has hundreds of vertices where the sheet's has OUTER_CUTS, and two
// edges on one line with vertices apart leave pinholes in the raster (a
// dotted line along the patch's sides, the dome's ground showing through:
// dark ones at dusk). The patch's last 2% (patchMask, src/shaders/scene.js: 6 cm)
// lies flat and shades as the sheet does, so where the two overlap they
// draw the same.
const OUTER_OVERLAP = 0.03;  // metres
export const MAX_CAVITIES = 4;   // the inner patch dips under at most this many cavities at once
export const DRY_DISCS = 6;      // at most this many floaters keep the water off their tops at once (setDryDiscs)
// While the gale blows (setGale) the sheet carries its waves, and is cut
// finer: GALE_SHEET_CUTS to a side, each ring 1 + 2/GALE_SHEET_CUTS times
// the last (square quads), so its vertices are 12 cm apart at the patch and
// grow with the distance (1.3 m at 30 m); WATER_VERTEX reads the waves no
// shorter than that spacing (uSheetSpacing), so far off they flatten, and
// the shading carries them on.
const GALE_SHEET_CUTS = 48;

/**
 * The outer sheet, in the XZ plane (at `height`): square rings around the
 * inner patch, each OUTER_GROWTH times the last's half size, out to
 * outerHalf, each side of each ring cut into OUTER_CUTS. Small triangles
 * near the patch, not four quads kilometres long: a camera turned to look
 * along the patch's edge (src/main.js) sees the sheet a metre or two away,
 * where a huge triangle's interpolated position is off by enough to move its
 * reflection and draw a seam along the edge. The pool's deck is one too
 * (src/pool.js).
 */
export function squareRingsGeometry(innerHalf, outerHalf, centre, height = 0, { growth = OUTER_GROWTH, cuts = OUTER_CUTS } = {}) {
  const halves = [innerHalf];
  while (halves.at(-1) < outerHalf) halves.push(Math.min(halves.at(-1) * growth, outerHalf));
  const positions = [];
  const cx = centre[0], cz = centre[1];
  // A point of square ring `half` at `along` (0 to 1) of the way round it, counter-clockwise from (−half, −half) seen from above.
  const onRing = (half, along) => {
    const side = Math.min(Math.floor(along * 4), 3), share = along * 4 - side, offset = -half + 2 * half * share;
    const [x, z] = [[offset, -half], [half, offset], [-offset, half], [-half, -offset]][side];
    return [cx + x, height, cz + z];
  };
  for (let ring = 0; ring < halves.length - 1; ring++) {
    for (let cut = 0; cut < 4 * cuts; cut++) {
      const start = cut / (4 * cuts), end = (cut + 1) / (4 * cuts);
      const innerStart = onRing(halves[ring], start), innerEnd = onRing(halves[ring], end);
      const outerStart = onRing(halves[ring + 1], start), outerEnd = onRing(halves[ring + 1], end);
      positions.push(...innerStart, ...innerEnd, ...outerStart, ...innerEnd, ...outerEnd, ...outerStart);   // facing up
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** The inner patch: segments × segments quads over the solver's square, positions only. */
function innerPatchGeometry(water, segments) {
  const geometry = new THREE.PlaneGeometry(water.domainSize, water.domainSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  return geometry;
}

/**
 * The inner patch over a pool's square and a quad round it, at the patch's
 * spacing, placed as the patch is (about the solver's centre).
 */
function poolPatchGeometry(water, segments, square) {
  const cell = water.domainSize / segments;
  const count = Math.min(Math.ceil(square.size / cell) + 2, segments);
  const geometry = new THREE.PlaneGeometry(count * cell, count * cell, count, count);
  geometry.rotateX(-Math.PI / 2);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry.translate(square.minX + square.size / 2 - water.centre[0], 0, square.minZ + square.size / 2 - water.centre[1]);
  return geometry;
}

export function createWaterSurface(water, lighting, ambientWaves, { meshSegments = Math.min(water.size, 512), rings = null, skyCube = null, rain = null, haze = null, gale = null } = {}) {
  const uniforms = {
    uHeight: { value: water.heightTexture },
    uFoam: { value: water.foamTexture },
    uFoamDrift: water.foamUniforms.uFoamDrift,
    uReflection: { value: null },
    uReflectionMatrix: { value: new THREE.Matrix4() },
    uMirrorNear: { value: new THREE.Vector4(1, 1, 0, 0) },   // the splash's image in the mirror (uv), empty when none
    uMirrorSize: { value: new THREE.Vector2(1, 1) },
    uMirrorLevel: { value: 0 },   // the height the mirror image mirrors about (src/main.js); the splash's mirror materials share it
    uUnderColor: { value: null },
    uUnderDepth: { value: null },
    uStonesUnder: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 100 },
    uFocalPx: { value: 1000 },
    uSunDir: { value: lighting.sunDirection },
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uN: water.gridUniforms.uN,
    uCell: water.gridUniforms.uCell,
    uExtinction: { value: lighting.extinction },
    uWaterColor: { value: lighting.waterColor },
    uRoughness: { value: 0.07 },
    uDomainMin: { value: new THREE.Vector2(water.domainMin[0], water.domainMin[1]) },
    uDomainSize: { value: water.domainSize },
    uTexelOffset: water.gridUniforms.uTexelOffset,
    uInner: { value: 1 },
    uMeshCell: { value: water.domainSize / meshSegments },
    uAmbientUnresolved: { value: ambientWaves.unresolvedVariance },
    uGaleUnresolved: { value: gale ? gale.unresolvedVariance : [0] },
    uSheetSpacing: { value: 2 / GALE_SHEET_CUTS },
    uDryDiscs: { value: Array.from({ length: DRY_DISCS }, () => new THREE.Vector3()) },
    uDryCount: { value: 0 },
    ...ambientWaves.uniforms(),
    ...(rings ? rings.uniforms() : {}),
    ...(rain ? rain.uniforms() : { uRainOn: { value: 0 } }),
    ...(haze ?? { uHazeColor: { value: new THREE.Vector3() }, uHazeDensity: { value: 0 } }),
  };
  // Two materials sharing every uniform object but uInner.
  const material = (inner) => new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: inner ? uniforms : { ...uniforms, uInner: { value: 0 } },
    defines: { AMBIENT_LEVELS: ambientWaves.levels, GALE_LEVELS: gale ? gale.levels : 1, DRY_DISCS },
  });
  const innerMaterial = material(true);
  const outerMaterial = material(false);
  // The cavity variants (WATER_VERTEX says what each does).
  const cavityUniforms = {
    uCavityCount: { value: 0 },
    uCavityMouths: { value: Array.from({ length: MAX_CAVITIES }, () => new THREE.Vector4()) },
    uCavityShifts: { value: Array.from({ length: MAX_CAVITIES }, () => new THREE.Vector3()) },
  };
  const innerCavityMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: { ...uniforms, ...cavityUniforms },
    defines: { AMBIENT_LEVELS: ambientWaves.levels, GALE_LEVELS: gale ? gale.levels : 1, CAVITY_PUSH: MAX_CAVITIES, DRY_DISCS },
  });
  const cavityMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms,
    defines: { AMBIENT_LEVELS: ambientWaves.levels, GALE_LEVELS: gale ? gale.levels : 1, CAVITY_MESH: 1, DRY_DISCS },
    side: THREE.DoubleSide,
  });

  // From below (the header): the sky's cube shows through the window, and
  // past it the bed, or a pool's basin (uPool's depth 0 for none).
  const underUniforms = { ...uniforms, uSkyCube: { value: skyCube }, uPool: { value: new THREE.Vector4() }, uDeck: { value: 0 } };
  const underMaterial = (inner) => new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_UNDER_FRAGMENT,
    uniforms: inner ? underUniforms : { ...underUniforms, uInner: { value: 0 } },
    defines: { AMBIENT_LEVELS: ambientWaves.levels, GALE_LEVELS: gale ? gale.levels : 1 },
    side: THREE.BackSide,
  });
  const innerUnderMaterial = underMaterial(true);
  const outerUnderMaterial = underMaterial(false);
  const cavityUnderMaterial = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_UNDER_FRAGMENT,
    uniforms: underUniforms,
    defines: { AMBIENT_LEVELS: ambientWaves.levels, GALE_LEVELS: gale ? gale.levels : 1, CAVITY_MESH: 1 },
    side: THREE.DoubleSide,
  });
  let aboveMaterial = innerMaterial;   // the patch's material from above, while fromBelow has swapped it

  let segments = meshSegments;
  let pool = null;   // the pool's { minX, minZ, size, depth, deck } (setPool)
  let patchGeometry = innerPatchGeometry(water, segments);
  let poolGeometry = null;   // the patch over the pool alone, made when first needed
  const inner = new THREE.Mesh(patchGeometry, innerMaterial);
  inner.position.set(water.centre[0], 0, water.centre[1]);
  inner.frustumCulled = false;

  const stillSheet = squareRingsGeometry(water.domainSize / 2 - OUTER_OVERLAP, OUTER_HALF_SIZE, water.centre);
  let galeSheet = null;   // made when the gale first blows
  const outer = new THREE.Mesh(stillSheet, outerMaterial);
  outer.frustumCulled = false;

  return {
    inner,
    outer,
    uniforms,
    cavityMaterial,
    cavityUnderMaterial,
    /** The bed the surface mirrors from below: the floor's uniforms (src/pondFloor.js), shared. */
    setBed(floorUniforms) {
      for (const name of ['uShore', 'uLand', 'uBank', 'uPattern', 'uAbsorb']) underUniforms[name] = floorUniforms[name];
    },
    /** Draw the patch and the sheet as seen from under the water (true), or from above again (false). */
    fromBelow(below) {
      if (below && inner.material !== innerUnderMaterial) {
        aboveMaterial = inner.material;
        inner.material = innerUnderMaterial;
        outer.material = outerUnderMaterial;
      } else if (!below && inner.material === innerUnderMaterial) {
        inner.material = aboveMaterial;
        outer.material = outerMaterial;
      }
    },
    /** The inner patch's quads per side. */
    get meshSegments() { return segments; },
    /** Its vertex spacing (m): the cavity's dip margins by it. */
    get cell() { return water.domainSize / segments; },
    /** Its triangles, as drawn (the pool's fewer). */
    get triangles() { return inner.geometry.index.count / 3; },
    /** Rebuild the inner patch with this many quads per side. */
    setMeshSegments(count) {
      if (count === segments) return;
      patchGeometry.dispose();
      poolGeometry?.dispose();
      segments = count;
      patchGeometry = innerPatchGeometry(water, count);
      poolGeometry = null;
      uniforms.uMeshCell.value = water.domainSize / count;
      this.setPool(pool);
    },
    /**
     * The pool's square, its depth and its deck's height ({ minX, minZ,
     * size, depth, deck }: src/pool.js), or null for the lake (the header).
     */
    setPool(square) {
      pool = square;
      if (square && !poolGeometry) poolGeometry = poolPatchGeometry(water, segments, square);
      inner.geometry = square ? poolGeometry : patchGeometry;
      underUniforms.uPool.value.set(square?.minX ?? 0, square?.minZ ?? 0, square?.size ?? 0, square?.depth ?? 0);
      underUniforms.uDeck.value = square?.deck ?? 0;
    },
    /** Whether the surface is a pool's (setPool). */
    get pooled() { return pool !== null; },
    /** Whether the gale blows: the sheet that carries its waves, or the still one. */
    setGale(blowing) {
      if (blowing && !galeSheet) galeSheet = squareRingsGeometry(water.domainSize / 2 - OUTER_OVERLAP, OUTER_HALF_SIZE, water.centre, 0, { growth: 1 + 2 / GALE_SHEET_CUTS, cuts: GALE_SHEET_CUTS });
      outer.geometry = blowing ? galeSheet : stillSheet;
    },
    /** The sheet's triangles, as drawn. */
    get sheetTriangles() { return outer.geometry.attributes.position.count / 3; },
    /**
     * The floaters whose rims keep the water off their tops (src/main.js: a
     * pizza afloat, inside its crust): each {x, z, radius}. They ride the
     * water (src/rock.js rideTheWater), so their rims hold it out: seen from
     * above, the water is not drawn inside a disc (WATER_FRAGMENT); at most
     * DRY_DISCS.
     */
    setDryDiscs(discs) {
      const count = Math.min(discs.length, DRY_DISCS);
      uniforms.uDryCount.value = count;
      for (let index = 0; index < count; index++) uniforms.uDryDiscs.value[index].set(discs[index].x, discs[index].z, discs[index].radius ** 2);
    },
    /**
     * The uniforms a floater's materials read the water's height with
     * (src/shaders/scene.js FLOATER_WATER, src/rock.js): the water's own
     * objects, so they follow the solver, the wind and the rings.
     */
    get rideUniforms() { return uniforms; },
    /** The open cavities' pushShape()s (src/cavity.js): the patch dips under them, or draws as still water when there are none. */
    setCavities(shapes) {
      const count = Math.min(shapes.length, MAX_CAVITIES);
      cavityUniforms.uCavityCount.value = count;
      for (let index = 0; index < count; index++) {
        const shape = shapes[index];
        cavityUniforms.uCavityMouths.value[index].set(shape.x, shape.z, shape.radius * shape.radius, 0);
        cavityUniforms.uCavityShifts.value[index].set(shape.shiftX, shape.shiftY, shape.shiftZ);
      }
      inner.material = count > 0 ? innerCavityMaterial : innerMaterial;
    },
    /** mirrorRect: where the splash is drawn in the mirror image (its pixels: x, y, width, height; 0 wide when nowhere). */
    update({ underTarget, reflectionTarget, reflectionMatrix, mirrorRect = null, stonesUnder = false, resolution, camera }) {
      uniforms.uStonesUnder.value = stonesUnder ? 1 : 0;
      uniforms.uReflection.value = reflectionTarget.texture;
      uniforms.uReflectionMatrix.value.copy(reflectionMatrix);
      const width = reflectionTarget.width, height = reflectionTarget.height;
      uniforms.uMirrorSize.value.set(width, height);
      // In a pool the whole mirror image holds near things, its walls and deck (src/pool.js).
      if (pool) uniforms.uMirrorNear.value.set(0, 0, 1, 1);
      else if (mirrorRect && mirrorRect.z > 0) uniforms.uMirrorNear.value.set(mirrorRect.x / width, mirrorRect.y / height, (mirrorRect.x + mirrorRect.z) / width, (mirrorRect.y + mirrorRect.w) / height);
      else uniforms.uMirrorNear.value.set(1, 1, 0, 0);
      uniforms.uUnderColor.value = underTarget.texture;
      uniforms.uUnderDepth.value = underTarget.depthTexture;
      uniforms.uResolution.value.copy(resolution);
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
      uniforms.uFocalPx.value = camera.projectionMatrix.elements[5] * resolution.y * 0.5;
      uniforms.uFoam.value = water.foamTexture;
      uniforms.uHeight.value = water.heightTexture;
    },
  };
}
