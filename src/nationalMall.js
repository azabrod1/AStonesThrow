// The Reflecting Pool's grounds (src/main.js PLACES `mall`): the National
// Mall in Washington, D.C., seen from the west end of the Lincoln Memorial
// Reflecting Pool, looking east down its length to the Washington Monument
// and, beyond it, the Capitol's dome. Scenery, under the pure sky of the
// place's hours (src/sky.js `washington`): every piece of land is drawn
// here, none is the photo's.
//
// The pool is src/pondFloor.js's MALL_POOL: 618 m by 50.6 m inside its
// granite walls, its bed the 2012 rebuild's dark tinted concrete (MALL_BED
// in src/shaders/scene.js, under 60 to 88 cm of water), the eye at its west
// wall. The scene's −z is east, +x south. Its pieces, real in their sizes
// and places (the Monument 1.15 km off, 37 m south of the pool's axis, as
// the real one stands off the Mall's):
//   - the coping (COPING), the 1920s granite that edges the pool, standing
//     MALL_POOL.coping over the water, its stones' joints and its wet
//     waterline drawn per pixel;
//   - the ground (groundGeometry: one mesh of rows and columns that thin
//     out with the distance, leaving the pool open), level with the coping
//     but for the Monument's knoll and Capitol Hill: the sidewalks beside
//     the pool, the lawns, the gravel walk of each allée, the west plaza's
//     granite pavers, the Monument's plaza; per pixel (GROUND_FRAGMENT), in
//     the elms' shade (allée shadows: their crowns' ellipsoids, by the
//     rows' regular spacing, from where the sun's ray through the point
//     meets the crowns' height), the Lincoln Memorial's and the Monument's
//     (src/mallBuildings.js SUN_SHADOW), wet under rain, white under snow;
//   - the buildings (src/mallBuildings.js, two merged meshes, each left
//     out when out of view, and the flags): the coping, the Washington
//     Monument and its ring of flags, the Lincoln Memorial behind the eye
//     and the Capitol, drawn from their drawings, their carving per pixel,
//     in the sun's shadows (a shadow map round the Memorial, drawn again
//     only when the sun moves: update), each faded into the air by its
//     distance (aerial perspective: AIR_DISTANCE, toward the sky's own
//     horizon in that direction); floodlit after sundown (`flood`,
//     setLight), as they are;
//   - the trees (treeSpots): the double allées of American elms that line the
//     pool, and the groves of the parks either side and beyond, out to a
//     wooded horizon. Each tree is one elm's skeleton (elmSkeleton: its
//     leaders, and the lobes of foliage they carry, so the gaps between
//     the clumps show the sky as an elm's do): a trunk and its limbs
//     (trunkGeometry: an elm's vase, its leaders arching out from a fork;
//     the far trees' the bole alone) and a crown of leaf clusters
//     (crownGeometry: cards on the lobes that face the eye, each one of
//     four sprays of leaves painted once into an atlas, leafAtlas, lit as
//     its lobe: its underside and its depth in the crown darker), drawn
//     instanced, one draw a level of detail. A level is chosen once, by the
//     tree's distance from the pond (the eye never goes far from it), each
//     coarser level fewer and larger cards on the same crown. A leaf card is
//     lit as its crown: its normal the crown's outward one bent toward the
//     eye, its shadow the sun's path through its own crown and through its
//     row's (a row's crowns touch: a sun along the allée finds few gaps),
//     its sky light by how deep in the crown it sits, the sun through the
//     leaves when they stand against it; its coverage kept as its mips
//     shrink, so a crown keeps its body far off.
// Each piece is drawn twice, in the main scene and on the mirror's layer
// (its distance in the mirror image's alpha, MIRROR_NEARNESS_SCALE), so the
// pool reflects it, each tree in the mirror a level coarser. The mirror is
// drawn whole when the view changes, and only where a splash's image is
// while one flies; its vertices are what it costs then.
//
// Nothing thrown comes down out of the pool: a throw's aim stays inside the
// solver's patch, ahead of the west wall and 22 m from either side. What reaches a wall in the
// water or the air below its top comes back off it, and what clears it
// lies on the coping (MALL_BASIN, held as the Pool's basin is: src/pool.js
// holdInPool, poolGround).
//
// Built once, seeded (seededRandom), never Math.random: a stage a task
// ahead of being shown (prepare: src/main.js starts it as the place is
// asked for, while its sky downloads), whatever is left when first shown
// (setVisible); till then a speck of each mesh's attributes stands in, so
// the warm-up builds the programs.
import * as THREE from 'three';
import { seededRandom } from './spray.js';
import { MALL_POOL } from './pondFloor.js';
import {
  WEST, EAST, HALF, COPING_TOP, COPING, MONUMENT, KNOLL, LINCOLN, mallGroundAt, MALL_COMMON, SUN_SHADOW,
  STONE_VERTEX, STONE_FRAGMENT, FLAG_VERTEX, FLAG_FRAGMENT, lincolnGeometry, distantGeometry, flagGeometry, createSunShadow,
} from './mallBuildings.js';

export { mallGroundAt };

/** The pool as a walled basin (src/pool.js holdInPool, poolGround): its walls' faces, their top the coping's. */
export const MALL_BASIN = Object.freeze({ minX: -HALF, minZ: EAST, sizeX: 2 * HALF, sizeZ: MALL_POOL.length, deck: COPING_TOP });

// The ground's bands beside the pool, out from the coping's outer edge (m): the sidewalk, a lawn, then each allée's
// elm row (ALLEE.rows, from the pool's side) in lawn, the gravel walk between the rows; the west plaza's pavers from
// the coping back `plaza` (m) and `plazaHalf` either side of the axis.
const BANDS = { walk: 5.5, alleeWalk: [16.5, 21.5], plaza: 34, plazaHalf: 46 };
// The elm allées: two rows each side, `rows` (m) out from the pool's side, a tree every `spacing` along from `from`
// to `to` (z). Their crowns, for the ground's shade, as the reference elm's (ELM).
const ALLEE = { rows: [13, 25], spacing: 11.5, from: -1.5, to: EAST - 4 };
// The reference elm (m): its height, where its crown begins (share of the height), its crown's greatest radius; the
// crown's ellipsoid for shadows (centre height share, half height share).
const ELM = { height: 18, crownFrom: 0.3, radius: 8.2, centre: 0.62, halfHeight: 0.36 };

// ---- the ground --------------------------------------------------------------

const smoothstep = (low, high, value) => { const share = Math.min(Math.max((value - low) / (high - low), 0), 1); return share * share * (3 - 2 * share); };
/** Edges from `inner` out to `outer` (m), the first `first` wide and each `growth` times the last. */
function growingEdges(inner, outer, first, growth) {
  const edges = [inner];
  for (let width = first; edges.at(-1) < outer; width *= growth) edges.push(Math.min(edges.at(-1) + width, outer));
  return edges;
}

/**
 * The ground's mesh (the header): columns in x and rows in z, finest by the
 * pool's walls and the eye, growing with the distance out to GROUND_REACH;
 * the cells over the pool and its coping left out. Its heights and normals
 * are mallGroundAt's.
 */
const GROUND_REACH = 12000;
// Around the Monument's knoll the rows and columns are KNOLL_CELL (m) apart, so its rise is smooth.
const KNOLL_CELL = 15;
function groundGeometry() {
  const edgeX = HALF + COPING.width;
  const sortedUnique = (values) => [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((first, second) => first - second);
  const outX = growingEdges(edgeX, GROUND_REACH, 0.6, 1.2);
  const knollSpan = (centre) => Array.from({ length: Math.ceil((2 * KNOLL.radius) / KNOLL_CELL) + 1 }, (unused, index) => centre - KNOLL.radius + index * KNOLL_CELL);
  const xs = sortedUnique([...outX.map((x) => -x), ...growingEdges(-edgeX, edgeX, 4, 1), ...outX, ...knollSpan(MONUMENT.x)]);
  const westEdge = WEST + COPING.width, eastEdge = EAST - COPING.width;
  const behind = growingEdges(westEdge, GROUND_REACH, 0.4, 1.15);
  const along = growingEdges(0, westEdge - eastEdge, 0.5, 1.1).map((back) => westEdge - back);
  const beyond = growingEdges(-eastEdge, GROUND_REACH, 2, 1.12).map((out) => -out);
  const zs = sortedUnique([...beyond, ...along, ...behind, ...knollSpan(MONUMENT.z)]);
  const positions = [], normals = [], indices = [];
  const step = 0.5;
  for (const z of zs) {
    for (const x of xs) {
      const height = mallGroundAt(x, z);
      positions.push(x, height, z);
      const normal = new THREE.Vector3(height - mallGroundAt(x + step, z), step, height - mallGroundAt(x, z + step)).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  const overPool = (x, z) => Math.abs(x) < edgeX - 1e-6 && z > eastEdge + 1e-6 && z < westEdge - 1e-6;
  for (let row = 0; row < zs.length - 1; row++) {
    for (let column = 0; column < xs.length - 1; column++) {
      if (overPool((xs[column] + xs[column + 1]) / 2, (zs[row] + zs[row + 1]) / 2)) continue;
      const corner = row * xs.length + column, next = corner + xs.length;
      indices.push(corner, next, corner + 1, corner + 1, next, next + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

// ---- the trees -----------------------------------------------------------------

// The leaf atlas (leafAtlas): ATLAS.cells × ATLAS.cells sprays, each `cell` texels square. A spray is a round clump
// of twigs from near the cell's middle, each with a twiglet or two, an elm's leaves alternate along them (ovate and
// toothed, `leaf` texels long, set at `angle` (rad) to the twig), smaller toward the tips.
const ATLAS = { cells: 2, cell: 256, twigs: [9, 13], leaf: [11, 17], angle: 0.8 };
/**
 * The leaf atlas (ATLAS): RGBA bytes, R each leaf's brightness (its tilt
 * to the light, 0 to 1 about 0.5), G its own hue (paler and yellower
 * toward 1), B 1 on a twig, A its coverage. Painted texel by texel (an
 * ovate's distance, antialiased over a texel), its uncovered texels keeping
 * the leaves' mean, so the mips do not darken toward the edges.
 */
function leafAtlas(random) {
  const side = ATLAS.cells * ATLAS.cell;
  const data = new Uint8Array(side * side * 4);
  const rgba = new Float32Array(side * side * 4);
  for (let index = 0; index < rgba.length; index += 4) { rgba[index] = 0.5; rgba[index + 1] = 0.45; }
  const paint = (centreX, centreY, length, width, angle, brightness, hue, twig) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const reach = length * 0.55 + 1;
    for (let y = Math.floor(centreY - reach); y <= Math.ceil(centreY + reach); y++) {
      for (let x = Math.floor(centreX - reach); x <= Math.ceil(centreX + reach); x++) {
        if (x < 0 || y < 0 || x >= side || y >= side) continue;
        const dx = x + 0.5 - centreX, dy = y + 0.5 - centreY;
        const along = (dx * cos + dy * sin) / (length / 2), across = (-dx * sin + dy * cos) / (width / 2);
        let distance;
        if (twig) distance = Math.max(Math.abs(across) - 1, Math.abs(along) - 1) * (width / 2);
        else {
          // An ovate: widest a third of the way from its base, pointed at the tip.
          const taper = along > -0.3 ? 1 - ((along + 0.3) / 1.3) ** 1.6 : 1 - ((along + 0.3) / 0.7) ** 2;
          const teeth = 0.07 * Math.abs(Math.sin(along * 9));   // the elm's doubly toothed margin
          distance = (Math.abs(across) - Math.max(taper, 0) * (1 - teeth)) * (width / 2);
          if (Math.abs(along) > 1) distance = Math.max(distance, (Math.abs(along) - 1) * (length / 2));
        }
        const cover = Math.min(Math.max(0.5 - distance, 0), 1);
        if (cover <= 0) continue;
        const index = (y * side + x) * 4;
        const shade = twig ? 0.25 : brightness * (0.85 + 0.3 * Math.max(0, 1 - Math.abs(across)));   // the midrib's light ridge
        rgba[index] += (shade - rgba[index]) * cover;
        rgba[index + 1] += (hue - rgba[index + 1]) * cover;
        rgba[index + 2] += ((twig ? 1 : 0) - rgba[index + 2]) * cover;
        rgba[index + 3] += (1 - rgba[index + 3]) * cover;
      }
    }
  };
  for (let cellY = 0; cellY < ATLAS.cells; cellY++) {
    for (let cellX = 0; cellX < ATLAS.cells; cellX++) {
      const originX = cellX * ATLAS.cell, originY = cellY * ATLAS.cell, size = ATLAS.cell;
      const twigs = ATLAS.twigs[0] + Math.floor(random() * (ATLAS.twigs[1] - ATLAS.twigs[0] + 1));
      for (let twig = 0; twig < twigs; twig++) {
        // From near the middle, outward, bending a little; its own light (the spray's tilt to the sun).
        let x = originX + size * (0.5 + (random() - 0.5) * 0.2), y = originY + size * (0.5 + (random() - 0.5) * 0.2);
        let heading = (twig / twigs) * Math.PI * 2 + (random() - 0.5) * 0.7;
        const bend = (random() - 0.5) * 0.5, spray = 0.65 + 0.5 * random(), hue = random();
        const length = size * (0.26 + 0.17 * random());
        // The twig, and a twiglet off it a third and two thirds along, each leafed.
        const grow = (fromX, fromY, startHeading, twigLength, width, twiglets) => {
          let atX = fromX, atY = fromY, towards = startHeading, side = random() < 0.5 ? 1 : -1;
          const step = 3.2;
          for (let travelled = 0; travelled < twigLength; travelled += step) {
            const share = travelled / twigLength;
            paint(atX, atY, step + 1, width * (1 - 0.5 * share), towards, 0, 0, true);
            // A leaf at most steps, alternate sides, smaller toward the tip, none at the twig's root.
            if (share > 0.06 && random() < 0.86) {
              const leafLength = (ATLAS.leaf[0] + (ATLAS.leaf[1] - ATLAS.leaf[0]) * random()) * (1 - 0.3 * share);
              const leafAngle = towards + side * (ATLAS.angle + (random() - 0.5) * 0.5);
              const out = leafLength * 0.48;
              paint(atX + Math.cos(leafAngle) * out, atY + Math.sin(leafAngle) * out, leafLength, leafLength * (0.5 + 0.1 * random()), leafAngle,
                Math.min(Math.max(spray * (0.75 + 0.5 * random()), 0), 1) * 0.6, Math.min(Math.max(hue * 0.6 + random() * 0.4, 0), 1), false);
              side = -side;
            }
            if (twiglets && [0.33, 0.66].some((at) => Math.abs(share - at) < 0.5 * step / twigLength)) {
              grow(atX, atY, towards + (random() < 0.5 ? -1 : 1) * (0.6 + 0.3 * random()), twigLength * (0.35 + 0.15 * random()), width * 0.7, false);
            }
            atX += Math.cos(towards) * step;
            atY += Math.sin(towards) * step;
            towards += bend * step / twigLength * 2;
          }
        };
        grow(x, y, heading, length, 1.3, true);
      }
    }
  }
  for (let index = 0; index < data.length; index++) data[index] = Math.round(Math.min(Math.max(rgba[index], 0), 1) * 255);
  const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** The reference elm's crown's radius (m) at `share` of its height up the crown (0 its bottom, 1 its top): a vase, widest high, rounded over. */
const crownRadius = (share) => ELM.radius * (0.2 + 0.8 * Math.sin(Math.PI * Math.min(Math.max(share, 0), 1) ** 0.8) ** 0.6);
const SHADE_HEIGHTS = [8.5, 13.5];   // m: the two heights the allées' shade takes the crowns at (GROUND_FRAGMENT alleeShade)

// The crown's levels of detail (crownGeometry): how many cards, and each card's side (m) on the reference elm (the
// farthest level's cards a lobe's own size, one or two a lobe).
const CROWN_LEVELS = [{ cards: 440, size: 2.1 }, { cards: 150, size: 3.5 }, { cards: 44, size: 0 }];
// The reference elm's lobes (elmSkeleton): the clumps of foliage its crown is made of, each a sphere `radius` (m)
// across from LOBE.radius: three along each leader, riding a little over it, the last drooping past its tip; a
// dome between the leaders' tops, and one on top.
const LOBE = { along: [0.5, 0.78, 1.02], rise: [1.6, 2.2, 1.2], radius: [2.3, 3.3], dome: { out: 3.9, height: 15.4 }, top: 16.4 };
/**
 * The reference elm's skeleton (seeded): its leaders (TRUNK: each a heading,
 * its lean at the fork and the tip, its length), and its crown's lobes
 * (LOBE: centre and radius), kept inside the crown's envelope (crownRadius),
 * so the trunk's limbs and the crown's clumps are one tree's.
 */
function elmSkeleton(random) {
  const between = ([least, most]) => least + (most - least) * random();
  const count = TRUNK.leaders[0] + Math.floor(random() * (TRUNK.leaders[1] - TRUNK.leaders[0] + 1));
  const leaders = Array.from({ length: count }, (unused, leader) => ({
    heading: (leader / count) * Math.PI * 2 + (random() - 0.5) * 0.8, lean: between(TRUNK.lean), tipLean: between(TRUNK.tipLean), length: between(TRUNK.length),
  }));
  const crownBottom = ELM.height * ELM.crownFrom, crownTall = ELM.height - crownBottom;
  const lobes = [];
  const place = (centre, radius) => {
    // Inside the envelope: the lobe's outer side no farther out than the crown's radius at its height.
    const share = (centre.y - crownBottom) / crownTall;
    const out = Math.hypot(centre.x, centre.z), most = Math.max(crownRadius(share) * 1.04 - radius * 0.75, 0.3);
    if (out > most) { centre.x *= most / out; centre.z *= most / out; }
    centre.y = Math.min(centre.y, ELM.height - radius * 0.7);
    lobes.push({ centre, radius });
  };
  for (const leader of leaders) {
    LOBE.along.forEach((share, index) => {
      const point = leaderPoint(leader, Math.min(share, 1));
      if (share > 1) point.add(new THREE.Vector3(Math.cos(leader.heading), -0.6, Math.sin(leader.heading)).multiplyScalar((share - 1) * leader.length));
      point.y += LOBE.rise[index];
      place(point, between(LOBE.radius) * (index === 0 ? 0.85 : 1));
    });
  }
  for (const leader of leaders) {
    const heading = leader.heading + Math.PI / count + (random() - 0.5) * 0.3;
    place(new THREE.Vector3(Math.cos(heading) * LOBE.dome.out, LOBE.dome.height + (random() - 0.5) * 1.2, Math.sin(heading) * LOBE.dome.out), between(LOBE.radius));
  }
  place(new THREE.Vector3((random() - 0.5) * 1.5, LOBE.top, (random() - 0.5) * 1.5), LOBE.radius[1]);
  return { leaders, lobes };
}
/** Where a leader (elmSkeleton) is `share` of the way along it (m, on the reference elm), with `rings` steps. */
function leaderPoint({ heading, lean, tipLean, length }, share, rings = 12) {
  const point = new THREE.Vector3(0, TRUNK.fork - 0.4, 0);
  const steps = Math.round(share * rings);
  for (let ring = 0; ring < steps; ring++) {
    const tilt = lean + (tipLean - lean) * (ring / rings) ** 2;
    point.add(new THREE.Vector3(Math.sin(tilt) * Math.cos(heading), Math.cos(tilt), Math.sin(tilt) * Math.sin(heading)).multiplyScalar(length / rings));
  }
  return point;
}
/**
 * A crown of leaf cards (the header) for the reference elm (`skeleton`):
 * card centres on and just inside its lobes, spread by each lobe's area,
 * fewer on a lobe's side toward the trunk (hidden); each with its corner,
 * size, roll, depth (its lobe's underside and inside, and the lobe's own
 * depth in the crown: the less sky), tint, its normal (its lobe's outward
 * one, a little the crown's) and its atlas cell. The farthest level's
 * cards are the lobes themselves.
 */
function crownGeometry(level, skeleton, random) {
  const { cards, size } = CROWN_LEVELS[level];
  const centres = [], shapes = [], outwards = [], corners = [], cells = [];
  const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const { lobes } = skeleton;
  const area = lobes.reduce((sum, lobe) => sum + lobe.radius ** 2, 0);
  const crownCentre = new THREE.Vector3(0, ELM.height * ELM.centre, 0);
  const radii = new THREE.Vector3(ELM.radius, ELM.height * ELM.halfHeight, ELM.radius);
  const direction = new THREE.Vector3(), fromAxis = new THREE.Vector3(), crownNormal = new THREE.Vector3(), point = new THREE.Vector3();
  for (let made = 0, guard = 0; made < cards && guard < cards * 60; guard++) {
    // A lobe by its area, a point on it.
    let pick = random() * area, lobe = lobes[0];
    for (const candidate of lobes) { pick -= candidate.radius ** 2; if (pick <= 0) { lobe = candidate; break; } }
    const up = 2 * random() - 1, around = random() * Math.PI * 2;
    direction.set(Math.sqrt(1 - up * up) * Math.cos(around), up, Math.sqrt(1 - up * up) * Math.sin(around));
    fromAxis.set(lobe.centre.x, 0, lobe.centre.z).normalize();
    if (direction.dot(fromAxis) < -0.35 && direction.y < 0.4 && random() < 0.75) continue;   // its side toward the trunk, mostly hidden
    const far = size === 0;
    const inside = far ? 0.45 : 0.28 * random() ** 1.5 + level * 0.05;
    point.copy(lobe.centre).addScaledVector(direction, lobe.radius * (1 - inside));
    // How deep the lobe sits in the whole crown (its centre's distance inside the crown's ellipsoid), its underside.
    crownNormal.subVectors(point, crownCentre).divide(radii);
    const lobeDepth = Math.min(Math.max(1 - crownNormal.length(), 0), 1);
    crownNormal.divide(radii).normalize();
    const underside = Math.max(-direction.y, 0);
    const depth = Math.min(1, 0.45 * inside / 0.28 + 0.35 * underside + 0.8 * lobeDepth);
    const normal = direction.clone().multiplyScalar(0.72).addScaledVector(crownNormal, 0.28).normalize();
    const cardSize = far ? lobe.radius * (1.55 + 0.3 * random()) : size * (0.8 + 0.4 * random());
    const roll = random() * Math.PI * 2, tint = random(), cell = Math.floor(random() * ATLAS.cells * ATLAS.cells);
    for (const [cornerX, cornerY] of corner) {
      centres.push(point.x, point.y, point.z);
      shapes.push(cardSize, roll, depth, tint);
      outwards.push(normal.x, normal.y, normal.z);
      corners.push(cornerX, cornerY);
      cells.push(cell);
    }
    made++;
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(centres, 3));
  geometry.setAttribute('shape', new THREE.Float32BufferAttribute(shapes, 4));
  geometry.setAttribute('outward', new THREE.Float32BufferAttribute(outwards, 3));
  geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute('cell', new THREE.Float32BufferAttribute(cells, 1));
  const indices = [];
  for (let card = 0; card < centres.length / 12; card++) indices.push(card * 4, card * 4 + 1, card * 4 + 2, card * 4, card * 4 + 2, card * 4 + 3);
  geometry.setIndex(indices);
  return geometry;
}

// The trunk and limbs (trunkGeometry), on the reference elm (m): the trunk up to its fork, its radius at the root
// flare, the foot and the fork; the leaders, how many, their lean from upright at the fork and at their tip, their
// length and radius at the fork and the tip; the limbs off each, where along and how long (shares). TRUNK_LEVELS:
// the near trees' (limbed, 7 sides round), the middle's (the leaders alone, 5 sides, 3 rings each) and the far
// trees' (past LEVEL_REACH[1], under 2 pixels wide: the bole alone, square, up into the crown, BOLE_TOP).
const TRUNK = {
  fork: 4.2, flare: 0.75, foot: 0.46, forkRadius: 0.36,
  leaders: [4, 6], lean: [0.32, 0.55], tipLean: [0.85, 1.15], length: [8.5, 11], leaderRadius: 0.28, tipRadius: 0.07,
  limbs: [0.45, 0.7], limbLength: 0.42,
};
const TRUNK_LEVELS = [{ sides: 7, rings: 9, limbs: true }, { sides: 5, rings: 3 }, { sides: 4, boleOnly: true }];
const BOLE_TOP = 6.5;
/** A tapering tube along `path` (points) with radii `radii`, `sides` round, into `parts` arrays; its `along` the height share for the bark. */
function addTube(target, path, radii, sides) {
  const first = target.positions.length / 3;
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3(), point = new THREE.Vector3();
  let reference = new THREE.Vector3(1, 0, 0);
  for (let ring = 0; ring < path.length; ring++) {
    tangent.subVectors(path[Math.min(ring + 1, path.length - 1)], path[Math.max(ring - 1, 0)]).normalize();
    binormal.crossVectors(tangent, reference).normalize();
    if (binormal.lengthSq() < 1e-6) binormal.set(0, 0, 1);
    normal.crossVectors(binormal, tangent).normalize();
    reference = normal.clone();
    for (let side = 0; side <= sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const out = new THREE.Vector3().addScaledVector(normal, Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
      point.copy(path[ring]).addScaledVector(out, radii[ring]);
      target.positions.push(point.x, point.y, point.z);
      target.normals.push(out.x, out.y, out.z);
      target.barks.push(side / sides, path[ring].y);
    }
  }
  for (let ring = 0; ring < path.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const here = first + ring * (sides + 1) + side, above = here + sides + 1;
      target.indices.push(here, here + 1, above, here + 1, above + 1, above);
    }
  }
}
/** The reference elm's trunk and limbs (TRUNK, its leaders the skeleton's: elmSkeleton) at its level of TRUNK_LEVELS; seeded (`random`). */
function trunkGeometry(level, skeleton, random) {
  const target = { positions: [], normals: [], barks: [], indices: [] };
  const { sides, rings, limbs: fine, boleOnly } = TRUNK_LEVELS[level];
  const trunkPath = [], trunkRadii = [];
  if (boleOnly) {
    addTube(target, [new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, BOLE_TOP, 0)], [TRUNK.foot * 1.1, TRUNK.leaderRadius], sides);
    return tubeGeometry(target);
  }
  for (let ring = 0; ring <= 6; ring++) {
    const share = ring / 6;
    trunkPath.push(new THREE.Vector3(0.05 * Math.sin(share * 3), TRUNK.fork * share - 0.3 * (ring === 0 ? 1 : 0), 0.04 * Math.cos(share * 2)));
    trunkRadii.push(TRUNK.foot + (TRUNK.forkRadius - TRUNK.foot) * share + (TRUNK.flare - TRUNK.foot) * Math.max(0, 1 - share * 5) ** 2);
  }
  addTube(target, trunkPath, trunkRadii, sides);
  for (const { heading, lean, tipLean, length } of skeleton.leaders) {
    const path = [], radii = [];
    const point = new THREE.Vector3(0, TRUNK.fork - 0.4, 0);
    for (let ring = 0; ring <= rings; ring++) {
      const share = ring / rings;
      path.push(point.clone());
      radii.push(TRUNK.leaderRadius + (TRUNK.tipRadius - TRUNK.leaderRadius) * share);
      const tilt = lean + (tipLean - lean) * share * share;
      point.add(new THREE.Vector3(Math.sin(tilt) * Math.cos(heading), Math.cos(tilt), Math.sin(tilt) * Math.sin(heading)).multiplyScalar(length / rings));
      // A limb or two off it, out and up.
      if (fine && ring > 0 && ring < rings && TRUNK.limbs.some((at) => Math.abs(share - at) < 0.5 / rings)) {
        const limbHeading = heading + (random() < 0.5 ? -1 : 1) * (0.5 + 0.4 * random());
        const limbPath = [], limbRadii = [];
        const limbPoint = path.at(-1).clone();
        for (let step = 0; step <= 4; step++) {
          limbPath.push(limbPoint.clone());
          limbRadii.push(radii.at(-1) * 0.55 * (1 - 0.7 * step / 4));
          const limbTilt = tilt + 0.25 + 0.15 * step;
          limbPoint.add(new THREE.Vector3(Math.sin(limbTilt) * Math.cos(limbHeading), Math.cos(limbTilt), Math.sin(limbTilt) * Math.sin(limbHeading)).multiplyScalar(length * TRUNK.limbLength / 4));
        }
        addTube(target, limbPath, limbRadii, Math.max(sides - 2, 4));
      }
    }
    addTube(target, path, radii, sides);
  }
  return tubeGeometry(target);
}
/** The tubes of `target` (addTube) as one geometry, for instancing. */
function tubeGeometry(target) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normals, 3));
  geometry.setAttribute('bark', new THREE.Float32BufferAttribute(target.barks, 2));
  geometry.setIndex(target.indices);
  return geometry;
}

// Where the trees stand (treeSpots), each { x, z, turn, tall, wide, tint, seed, row }: `tall` and `wide` scale the
// reference elm, `row` marks an allée's. The allées (ALLEE); the groves beside the Lincoln Memorial (GROVES.lincoln, clear of its terrace);
// the parks either side of the allées (GROVES.parks: Constitution Gardens north, West Potomac Park south); the
// groves by the pool's east end and round the Monument (clear of its knoll's top); and a ring of woods out to the
// horizon (GROVES.ring), clear of the Mall's axis to the Capitol. Each grove's trees are `apart` (m) at least.
// East of the Monument's grounds the Mall itself is open lawn MALL_LAWN.half (m) either side of the axis.
const GROVES = {
  lincoln: [{ x: [62, 190], z: [-6, 250], apart: 16 }, { x: [-190, -62], z: [-6, 250], apart: 16 }, { x: [-200, 200], z: [215, 330], apart: 18 }],
  parks: [{ x: [64, 430], z: [-660, -4], apart: 21 }, { x: [-430, -64], z: [-660, -4], apart: 21 }],
  east: [{ x: [30, 160], z: [-840, -630], apart: 17 }, { x: [-160, -30], z: [-840, -630], apart: 17 }, { x: [140, 480], z: [-1500, -850], apart: 24 }, { x: [-480, -100], z: [-1500, -850], apart: 24 }, { x: [-300, 360], z: [-1750, -1380], apart: 26 }],
  ring: { from: 850, to: 3200, count: 520, axis: 140 },
};
const MONUMENT_CLEAR = 95;   // m: no tree on the Monument's knoll this near its base
const MALL_LAWN = { from: MONUMENT.z - 180, half: 110 };
function treeSpots(random) {
  const spots = [];
  const between = (least, most) => least + (most - least) * random();
  const tree = (x, z, { tall = between(0.85, 1.08), wide = between(0.88, 1.1), row = false } = {}) => spots.push({ x, z, turn: random() * Math.PI * 2, tall, wide, tint: random(), seed: random() * 1000, row });
  for (const side of [-1, 1]) {
    for (const row of ALLEE.rows) {
      for (let z = ALLEE.from; z >= ALLEE.to; z -= ALLEE.spacing) {
        // Now and then a younger replacement, smaller.
        const young = random() < 0.08;
        tree(side * (HALF + row + (random() - 0.5) * 0.5), z + (random() - 0.5) * 0.6, young ? { tall: between(0.55, 0.72), wide: between(0.55, 0.75), row: true } : { row: true });
      }
    }
  }
  const clearOf = (x, z) => Math.hypot(x - MONUMENT.x, z - MONUMENT.z) > MONUMENT_CLEAR
    && !(z < MALL_LAWN.from && Math.abs(x) < MALL_LAWN.half)
    && !(Math.abs(x) < LINCOLN.terrace.halfX + 4 && z > LINCOLN.lowerStair.from - 30 && z < LINCOLN.terrace.to + 4);
  const grove = ({ x: [x0, x1], z: [z0, z1], apart }, kind) => {
    const placed = [];
    const tries = Math.round(((x1 - x0) * (z1 - z0)) / (apart * apart) * 2.2);
    for (let attempt = 0; attempt < tries; attempt++) {
      const x = between(x0, x1), z = between(z0, z1);
      if (!clearOf(x, z) || placed.some(([otherX, otherZ]) => Math.hypot(x - otherX, z - otherZ) < apart)) continue;
      placed.push([x, z]);
      tree(x, z, kind === 'park' ? { tall: between(0.75, 1.15), wide: between(0.75, 1.15) } : undefined);
    }
  };
  for (const area of GROVES.lincoln) grove(area);
  for (const area of GROVES.parks) grove(area, 'park');
  for (const area of GROVES.east) grove(area, 'park');
  // The ring: clumps of woods, larger than single trees (they stand for several), off the axis east.
  for (let made = 0, guard = 0; made < GROVES.ring.count && guard < GROVES.ring.count * 8; guard++) {
    const angle = random() * Math.PI * 2, distance = GROVES.ring.from + (GROVES.ring.to - GROVES.ring.from) * random() ** 0.7;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
    if (z < -900 && Math.abs(x) < GROVES.ring.axis + (-z - 900) * 0.02) continue;
    if (!clearOf(x, z)) continue;
    tree(x, z, { tall: between(0.8, 1.2), wide: between(1.3, 2.2) });
    made++;
  }
  return spots;
}
// A tree's level of detail by its distance from the pond (m): the first nearer than LEVEL_REACH[0], the second than
// LEVEL_REACH[1], the third beyond.
const LEVEL_REACH = [140, 430];

// ---- the looks -------------------------------------------------------------------

const GROUND_VERTEX = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
// The ground's looks by where a point lies (BANDS): the sidewalk's pale concrete in its slabs, the allées' gravel,
// the west plaza's and the Monument's granite pavers, mown lawn elsewhere, fading far off into the land's own dull
// green; under the allées' crowns their shade (alleeShade), dappled.
const GROUND_FRAGMENT = /* glsl */`
${MALL_COMMON}
${SUN_SHADOW}
varying vec3 vNormal;
#define HALF_WIDTH ${HALF.toFixed(2)}
#define COPING_OUT ${(HALF + COPING.width).toFixed(2)}
#define WEST_OUT ${(WEST + COPING.width).toFixed(2)}
#define EAST_OUT ${(EAST - COPING.width).toFixed(2)}
#define WALK ${BANDS.walk.toFixed(2)}
#define ALLEE_WALK vec2(${BANDS.alleeWalk[0].toFixed(2)}, ${BANDS.alleeWalk[1].toFixed(2)})
#define PLAZA ${BANDS.plaza.toFixed(2)}
#define PLAZA_HALF ${BANDS.plazaHalf.toFixed(2)}
#define ROWS vec2(${ALLEE.rows[0].toFixed(2)}, ${ALLEE.rows[1].toFixed(2)})
#define SPACING ${ALLEE.spacing.toFixed(2)}
#define ALLEE_FROM ${ALLEE.from.toFixed(2)}
#define ALLEE_TO ${ALLEE.to.toFixed(2)}
#define MONUMENT_AT vec2(${MONUMENT.x.toFixed(2)}, ${MONUMENT.z.toFixed(2)})
#define MONUMENT_PLAZA ${KNOLL.plaza.toFixed(2)}
#define LAWN vec3(0.068, 0.098, 0.036)
// The elms' crowns at two heights over the ground (m, SHADE_HEIGHTS) and their radii there (crownRadius), for their shade.
#define CROWN_HEIGHTS vec2(${SHADE_HEIGHTS[0].toFixed(2)}, ${SHADE_HEIGHTS[1].toFixed(2)})
#define CROWN_RADII vec2(${SHADE_HEIGHTS.map((height) => crownRadius((height - ELM.height * ELM.crownFrom) / (ELM.height * (1 - ELM.crownFrom))).toFixed(2)).join(', ')})
/** The allées' shade at a ground point: where the sun's ray from it meets each crown height, the nearest elm's crown there, dappled. */
float alleeShade(vec3 point) {
  if (uSunDir.y < 0.03) return 1.0;
  float shade = 1.0;
  for (int layer = 0; layer < 2; layer++) {
    float height = layer == 0 ? CROWN_HEIGHTS.x : CROWN_HEIGHTS.y;
    vec3 crossing = point + uSunDir * (height / uSunDir.y);
    if (crossing.z > ALLEE_FROM + 9.0 || crossing.z < ALLEE_TO - 9.0) continue;
    float outward = abs(crossing.x) - HALF_WIDTH;
    float row = outward < 0.5 * (ROWS.x + ROWS.y) ? ROWS.x : ROWS.y;
    float index = clamp(floor((ALLEE_FROM - crossing.z) / SPACING + 0.5), 0.0, floor((ALLEE_FROM - ALLEE_TO) / SPACING));
    vec2 apart = vec2(outward - row, crossing.z - (ALLEE_FROM - index * SPACING));
    float radius = layer == 0 ? CROWN_RADII.x : CROWN_RADII.y;
    float dapple = mallNoise(crossing.xz * 0.9 + float(layer) * 7.0) * 0.6 + mallNoise(crossing.xz * 2.7) * 0.4;
    float inside = 1.0 - smoothstep(0.6, 1.0, length(apart) / radius + 0.35 * (dapple - 0.5));
    shade = min(shade, 1.0 - 0.88 * inside * smoothstep(0.25, 0.55, dapple + 0.3 * inside));
  }
  return shade;
}
void main() {
  vec3 normal = normalize(vNormal);
  float footprint = length(fwidth(vWorld));
  vec2 point = vWorld.xz;
  float outward = abs(point.x) - COPING_OUT;
  bool beside = point.y < WEST_OUT + PLAZA && point.y > EAST_OUT;
  float mottle = mallNoise(point * 0.13) * 0.5 + mallNoise(point * 0.9) * 0.3 + mallNoise(point * 4.3) * 0.2;
  vec3 albedo = LAWN * (0.8 + 0.4 * mottle);
  // The lawn's mowing, in stripes along the Mall, faded far off.
  albedo *= 1.0 + 0.05 * sign(sin(point.x * 1.05)) * (1.0 - smoothstep(0.3, 1.5, footprint));
  float paved = 0.0;
  if (beside && outward > 0.0 && outward < WALK) {
    // The sidewalk: pale concrete, slabs across it every 3 m.
    albedo = vec3(0.43, 0.41, 0.375) * (0.9 + 0.2 * mottle);
    float joint = abs(fract(point.y / 3.0) - 0.5) * 3.0;
    albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, max(0.012, footprint), joint)) * (0.012 / max(0.012, footprint));
    paved = 1.0;
  } else if (beside && outward > ALLEE_WALK.x && outward < ALLEE_WALK.y) {
    // The allée's walk: crushed stone, a warm tan.
    albedo = vec3(0.4, 0.35, 0.27) * (0.85 + 0.3 * mottle);
    paved = 0.8;
  }
  if (point.y > WEST_OUT - 0.01 && point.y < WEST_OUT + PLAZA && abs(point.x) < PLAZA_HALF) {
    // The west plaza: granite pavers.
    vec2 setts = abs(fract(point / vec2(1.2, 0.6) + 0.5) - 0.5) * vec2(1.2, 0.6);
    float joint = 1.0 - smoothstep(0.0, max(0.01, footprint), min(setts.x, setts.y));
    albedo = vec3(0.44, 0.43, 0.405) * (0.88 + 0.24 * mallHash(floor(point / vec2(1.2, 0.6)))) * (0.92 + 0.16 * mottle) * (1.0 - 0.3 * joint * (0.01 / max(0.01, footprint)));
    paved = 1.0;
  }
  float fromMonument = length(point - MONUMENT_AT);
  if (fromMonument < MONUMENT_PLAZA) { albedo = vec3(0.46, 0.45, 0.43) * (0.9 + 0.2 * mottle); paved = 1.0; }
  // Far off, the land's own dull green.
  float distance = length(vWorld - cameraPosition);
  albedo = mix(albedo, vec3(0.055, 0.068, 0.04) * (0.85 + 0.3 * mottle), smoothstep(900.0, 3000.0, distance));
  // Wet under rain: paving darkens most.
  albedo *= 1.0 - uWet * mix(0.15, 0.42, paved);
  // Under the allées' crowns: less of the sky, and their shade.
  float nearRow = min(abs(outward + COPING_OUT - HALF_WIDTH - ROWS.x), abs(outward + COPING_OUT - HALF_WIDTH - ROWS.y));
  float under = beside ? 1.0 - smoothstep(3.0, 8.5, nearRow) : 0.0;
  float shade = alleeShade(vWorld) * sunShadow(vWorld, normal) * monumentShadow(vWorld);
  float snow = uSnow * smoothstep(0.2, 0.6, 1.25 * uSnow + 0.35 * mallNoise(point * 0.6) - 0.25 - 0.25 * under);
  albedo = mix(albedo, SNOW_ALBEDO * (0.92 + 0.08 * mottle), snow);
  vec3 color = albedo * daylight(normal, shade, 1.0 - 0.45 * under);
  // Wet paving shows the sky a little.
  color += uSkyAmbient * 0.12 * uWet * paved;
  gl_FragColor = finish(inAir(color, vWorld));
}
`;

// The trees' shared vertex work: the reference elm scaled (`form`: tall, wide), turned and stood at its spot, and
// how much sun reaches a point of it through its crown (an ellipsoid, ELM) and, for an allée's elm (`row`), through
// its row's crowns (a cylinder along the row): exp(−LEAF_DENSITY · the path).
const TREE_COMMON = /* glsl */`
attribute vec4 spot;   // x, ground height, z, its turn about y (rad)
attribute vec4 form;   // its height's and its crown's scale on the reference elm's, its tint, its seed
attribute float row;   // 1 for an allée's elm
uniform vec3 uSunDir;
#define CROWN_CENTRE ${(ELM.height * ELM.centre).toFixed(2)}
#define CROWN_HALF ${(ELM.height * ELM.halfHeight).toFixed(2)}
#define CROWN_RADIUS ${ELM.radius.toFixed(2)}
#define LEAF_DENSITY 0.33
vec3 treeTurn(vec3 local) {
  float turnCos = cos(spot.w), turnSin = sin(spot.w);
  return vec3(turnCos * local.x + turnSin * local.z, local.y, -turnSin * local.x + turnCos * local.z);
}
vec3 treeScale() { return vec3(form.y, form.x, form.y); }
float sunThrough(vec3 world) {
  vec3 radii = vec3(CROWN_RADIUS * form.y, CROWN_HALF * form.x, CROWN_RADIUS * form.y);
  vec3 from = (world - (spot.xyz + vec3(0.0, CROWN_CENTRE * form.x, 0.0))) / radii, toward = uSunDir / radii;
  // Where the ray from the point toward the sun leaves the unit sphere (in the crown's scaled space): the quadratic's
  // far root; its terms the ray's square, half its linear term, and how far outside the surface the point lies.
  float square = dot(toward, toward), linear = dot(from, toward), outside = dot(from, from) - 1.0;
  float reach = linear * linear - square * outside;
  float own = reach > 0.0 ? max((-linear + sqrt(reach)) / square, 0.0) : 0.0;
  // The row: the same section, along z for ever.
  float rowSquare = dot(toward.xy, toward.xy), rowLinear = dot(from.xy, toward.xy), rowOutside = dot(from.xy, from.xy) - 1.0;
  float rowReach = rowLinear * rowLinear - rowSquare * rowOutside;
  float along = rowReach > 0.0 && rowSquare > 1e-6 ? max((-rowLinear + sqrt(rowReach)) / rowSquare, 0.0) : 0.0;
  float path = mix(own, max(own, along), 0.7 * row);
  return exp(-LEAF_DENSITY * min(path, 40.0));
}
`;
const CANOPY_VERTEX = /* glsl */`
${TREE_COMMON}
attribute vec4 shape;     // the card's size (m), roll (rad), depth in the crown (0 to 1), tint
attribute vec3 outward;   // the crown's outward normal there
attribute vec2 corner;
attribute float cell;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vTexels;
varying float vSun;
varying float vDepth;
varying vec2 vTint;
#define ATLAS_CELLS ${ATLAS.cells.toFixed(1)}
#define ATLAS_CELL ${ATLAS.cell.toFixed(1)}
void main() {
  // Each tree's cards moved a little about the reference crown's, by its seed, so no two crowns are alike.
  float seed = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719)) + form.w) * 43758.5453);
  vec3 local = position + (vec3(seed, fract(seed * 91.37), fract(seed * 47.13)) - 0.5) * shape.x * 0.8;
  vec3 world = spot.xyz + treeTurn(local * treeScale());
  vWorld = world;
  vNormal = normalize(treeTurn(outward / treeScale()));
  vSun = sunThrough(world);
  vDepth = shape.z;
  vTint = vec2(form.z, shape.w);
  // The card faces the eye, turned by its roll.
  vec4 view = viewMatrix * vec4(world, 1.0);
  float size = 0.5 * shape.x * mix(form.x, form.y, 0.5);
  float rollCos = cos(shape.y), rollSin = sin(shape.y);
  view.xy += vec2(rollCos * corner.x - rollSin * corner.y, rollSin * corner.x + rollCos * corner.y) * size;
  gl_Position = projectionMatrix * view;
  vec2 within = corner * 0.5 + 0.5;
  vTexels = within * ATLAS_CELL;
  vUv = (vec2(mod(cell, ATLAS_CELLS), floor(cell / ATLAS_CELLS)) + mix(vec2(0.02), vec2(0.98), within)) / ATLAS_CELLS;
}
`;
// A leaf card (the header): its leaves' coverage kept as the mips shrink (MIP_COVERAGE a level), its normal the
// crown's bent toward the eye and shaken by each leaf's tilt, lit through the crown (vSun), wrapped round as leaves
// scatter, the sun shining through them when they stand against it (THROUGH), the sky by its depth in the crown, and
// a waxy sheen at a glance.
const CANOPY_FRAGMENT = /* glsl */`
${MALL_COMMON}
uniform sampler2D uLeaves;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vTexels;
varying float vSun;
varying float vDepth;
varying vec2 vTint;
#define MIP_COVERAGE 0.28
#define ELM_GREEN vec3(0.046, 0.08, 0.026)
#define ELM_PALE vec3(0.085, 0.112, 0.036)
#define THROUGH vec3(0.75, 0.95, 0.3)
#define TWIG vec3(0.09, 0.075, 0.06)
void main() {
  vec4 leaf = texture2D(uLeaves, vUv);
  float level = max(0.5 * log2(max(dot(dFdx(vTexels), dFdx(vTexels)), dot(dFdy(vTexels), dFdy(vTexels)))), 0.0);
  if (leaf.a * (1.0 + MIP_COVERAGE * level) < 0.5) discard;
  vec3 toEye = normalize(cameraPosition - vWorld);
  vec3 normal = normalize(vNormal + 0.5 * toEye + vec3(0.0, 1.1 * (leaf.r - 0.5), 0.0));
  float wrap = clamp((dot(normal, uSunDir) + 0.4) / 1.4, 0.0, 1.0);
  float through = pow(max(dot(-toEye, uSunDir), 0.0), 5.0) * (1.0 - 0.5 * vDepth);
  vec3 green = mix(ELM_GREEN, ELM_PALE, clamp(0.65 * leaf.g + 0.35 * vTint.y, 0.0, 1.0)) * (0.78 + 0.44 * vTint.x) * (0.68 + 0.64 * leaf.r);
  vec3 albedo = mix(green, TWIG, step(0.5, leaf.b));
  float open = 1.0 - 0.62 * vDepth;
  vec3 sky = uSkyAmbient * SKY_LIGHT;
  vec3 light = uSunIrradiance * vSun * (0.95 * wrap + through * THROUGH / max(albedo.g * 12.0, 0.3))
    + sky * (0.5 + 0.5 * normal.y) * open
    + (uSunIrradiance * max(uSunDir.y, 0.0) + sky) * GROUND_ALBEDO * (0.4 - 0.4 * normal.y);
  vec3 color = albedo * light;
  color += sky * 0.035 * pow(1.0 - max(dot(normal, toEye), 0.0), 3.0) * open;
  gl_FragColor = finish(inAir(color, vWorld));
}
`;
const TRUNK_VERTEX = /* glsl */`
${TREE_COMMON}
attribute vec2 bark;   // round the limb (0 to 1), and its height (m)
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vBark;
varying float vSun;
varying float vInside;
void main() {
  vec3 world = spot.xyz + treeTurn(position * treeScale());
  vWorld = world;
  vNormal = normalize(treeTurn(normal / treeScale()));
  vSun = sunThrough(world);
  vInside = smoothstep(CROWN_CENTRE - CROWN_HALF - 2.0, CROWN_CENTRE, position.y);
  vBark = vec2(bark.x, bark.y + form.w);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;
// An elm's bark: grey-brown, in deep interlacing ridges (vBark: round and up), darker inside the crown.
const TRUNK_FRAGMENT = /* glsl */`
${MALL_COMMON}
varying vec3 vNormal;
varying vec2 vBark;
varying float vSun;
varying float vInside;
void main() {
  vec3 normal = normalize(vNormal);
  float footprint = length(fwidth(vWorld));
  float ridges = mallNoise(vec2(vBark.x * 14.0, vBark.y * 2.2)) * 0.65 + mallNoise(vec2(vBark.x * 34.0, vBark.y * 6.0)) * 0.35;
  float shown = 1.0 - smoothstep(0.02, 0.08, footprint);
  vec3 albedo = vec3(0.13, 0.12, 0.105) * (1.0 - shown * 0.45 * smoothstep(0.45, 0.25, ridges)) * (0.9 + 0.2 * mallNoise(vBark * vec2(3.0, 0.3)));
  vec3 color = albedo * daylight(normal, vSun, 0.55 - 0.3 * vInside);
  gl_FragColor = finish(inAir(color, vWorld));
}
`;

/** A geometry with the attributes of `names` ({ name: itemSize }), one degenerate triangle far below: a speck standing in for a mesh not built yet. */
function speck(names, instanced = null) {
  const geometry = instanced ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -500, 0, 0.001, -500, 0, 0, -500, 0.001], 3));
  for (const [name, size] of Object.entries(names)) geometry.setAttribute(name, new THREE.Float32BufferAttribute(new Array(3 * size).fill(0), size));
  if (instanced) {
    for (const [name, size] of Object.entries(instanced)) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(size), size));
    geometry.instanceCount = 1;
  }
  return geometry;
}
const TREE_INSTANCED = { spot: 4, form: 4, row: 1 };

/** A geometry of `geometry`'s own (not its instances') attributes and index, sharing their buffers: the same tree for other instances. */
function sharing(geometry) {
  const shared = new THREE.InstancedBufferGeometry();
  shared.setIndex(geometry.index);
  for (const [name, attribute] of Object.entries(geometry.attributes)) if (!attribute.isInstancedBufferAttribute) shared.setAttribute(name, attribute);
  return shared;
}
/** The trees' instance attributes (TREE_INSTANCED) for `spots`, nearest the pond first (so their crowns hide the far ones' cards early). */
function setTrees(geometry, spots) {
  const ordered = spots.slice().sort((first, second) => Math.hypot(first.x, first.z) - Math.hypot(second.x, second.z));
  const spot = new Float32Array(ordered.length * 4), form = new Float32Array(ordered.length * 4), row = new Float32Array(ordered.length);
  ordered.forEach((tree, index) => {
    spot.set([tree.x, mallGroundAt(tree.x, tree.z) - 0.05, tree.z, tree.turn], index * 4);
    form.set([tree.tall, tree.wide, tree.tint, tree.seed], index * 4);
    row[index] = tree.row ? 1 : 0;
  });
  geometry.setAttribute('spot', new THREE.InstancedBufferAttribute(spot, 4));
  geometry.setAttribute('form', new THREE.InstancedBufferAttribute(form, 4));
  geometry.setAttribute('row', new THREE.InstancedBufferAttribute(row, 1));
  geometry.instanceCount = ordered.length;
  return geometry;
}

/**
 * The Reflecting Pool's grounds (the header): `meshes` for the main scene
 * (each look's, and its twin on `mirrorLayer`); setVisible shows them,
 * building them the first time; setLight follows the hour's light (the
 * floodlights after dusk). They take the scene's lighting by its objects,
 * the sky's cube (refilled in place by a new sky) and the weather's haze,
 * snow and wetness, so nothing here follows a change of hour or weather but
 * the floodlights.
 */
export function createNationalMall({ lighting, environment, mirrorLayer, snow = { value: 0 }, wet = { value: 0 } }) {
  const flood = { value: 0 };
  const leaves = { value: null };
  const sunShadow = createSunShadow(lighting);
  const time = { value: 0 };
  const windFlag = { value: new THREE.Vector3(1, 0, 0.3) };
  const shared = {
    ...sunShadow.uniforms,
    uTime: time,
    uSunDir: { value: lighting.sunDirection },
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uSkyCube: { value: environment.cubeTexture },
    uFlood: flood,
    uSnow: snow,
    uWet: wet,
    ...environment.hazeUniforms,
  };
  const LOOKS = {
    stone: { vertex: STONE_VERTEX, fragment: STONE_FRAGMENT, speck: () => speck({ normal: 3, surface: 1, hollow: 1, detail: 2 }), levels: 2 },
    flags: { vertex: FLAG_VERTEX, fragment: FLAG_FRAGMENT, speck: () => speck({ normal: 3, flag: 2, seed: 1 }) },
    ground: { vertex: GROUND_VERTEX, fragment: GROUND_FRAGMENT, speck: () => speck({ normal: 3 }) },
    canopy: { vertex: CANOPY_VERTEX, fragment: CANOPY_FRAGMENT, speck: () => speck({ shape: 4, outward: 3, corner: 2, cell: 1 }, TREE_INSTANCED), levels: CROWN_LEVELS.length },
    trunk: { vertex: TRUNK_VERTEX, fragment: TRUNK_FRAGMENT, speck: () => speck({ normal: 3, bark: 2 }, TREE_INSTANCED), levels: TRUNK_LEVELS.length },
  };
  const material = (look, mirrored) => {
    const made = new THREE.ShaderMaterial({
      vertexShader: LOOKS[look].vertex,
      fragmentShader: LOOKS[look].fragment,
      uniforms: { ...shared, ...(look === 'canopy' ? { uLeaves: leaves } : {}), ...(look === 'flags' ? { uWindFlag: windFlag } : {}) },
      defines: mirrored ? { MIRRORED: 1 } : {},
    });
    return made;
  };
  const meshes = [];
  const byLook = {};
  for (const look of Object.keys(LOOKS)) {
    const pair = [material(look, false), material(look, true)];
    byLook[look] = Array.from({ length: LOOKS[look].levels ?? 1 }, () => pair.map((made, mirrored) => {
      const mesh = new THREE.Mesh(LOOKS[look].speck(), made);
      mesh.frustumCulled = false;
      if (mirrored) mesh.layers.set(mirrorLayer);
      mesh.visible = false;
      meshes.push(mesh);
      return mesh;
    }));
  }
  // Every mesh built (the header), from one seeded stream, in stages: prepare runs one a task (while the place's
  // sky downloads), setVisible any left.
  const random = seededRandom(1922, 5);
  const give = (look, level, geometry, inMirror = geometry) => {
    const [main, mirrored] = byLook[look][level];
    main.geometry.dispose();
    mirrored.geometry.dispose();
    main.geometry = geometry;
    mirrored.geometry = inMirror;
  };
  const trees = {};
  const STAGES = [
    () => { leaves.value = leafAtlas(random); },
    () => {
      // The Lincoln Memorial apart from what lies ahead, each left out when out of the frustum (the eye looking east
      // draws no Memorial; looking back, no Capitol); the flags apart, waving.
      give('stone', 0, lincolnGeometry());
      give('stone', 1, distantGeometry());
      give('flags', 0, flagGeometry());
      for (const look of ['stone', 'flags']) for (const pair of byLook[look]) for (const mesh of pair) mesh.frustumCulled = true;
      sunShadow.invalidate();
    },
    () => give('ground', 0, groundGeometry()),
    () => {
      const spots = treeSpots(random);
      const reach = (tree) => Math.hypot(tree.x, tree.z);
      trees.byLevel = [spots.filter((tree) => reach(tree) < LEVEL_REACH[0]), spots.filter((tree) => reach(tree) >= LEVEL_REACH[0] && reach(tree) < LEVEL_REACH[1]), spots.filter((tree) => reach(tree) >= LEVEL_REACH[1])];
      trees.skeleton = elmSkeleton(random);
      trees.crowns = trees.byLevel.map((unused, level) => crownGeometry(level, trees.skeleton, random));
    },
    () => {
      // The mirror draws each tree a level coarser (the farthest as they are): its image is rippled and drawn
      // smaller, and a splash's mirror image is drawn every frame it flies, every tree's vertices with it.
      const { byLevel, crowns } = trees;
      const trunks = byLevel.map((unused, level) => trunkGeometry(level, trees.skeleton, random));
      const coarser = (level) => Math.min(level + 1, byLevel.length - 1);
      byLevel.forEach((spots, level) => {
        give('canopy', level, setTrees(crowns[level], spots), coarser(level) === level ? crowns[level] : setTrees(sharing(crowns[coarser(level)]), spots));
        give('trunk', level, setTrees(trunks[level], spots), coarser(level) === level ? trunks[level] : setTrees(sharing(trunks[coarser(level)]), spots));
      });
    },
  ];
  let stagesDone = 0, preparing = null;
  const build = () => { while (stagesDone < STAGES.length) STAGES[stagesDone++](); };
  return {
    meshes,
    /** Show the grounds, or hide them; `building` false shows the specks alone (the warm-up builds their programs). */
    setVisible(visible, { building = true } = {}) {
      if (visible && building) build();
      for (const mesh of meshes) mesh.visible = visible;
    },
    /** Build the grounds a stage a task (STAGES), ahead of showing them; resolves once built. */
    prepare() {
      preparing ??= new Promise((resolve) => {
        const next = () => {
          if (stagesDone >= STAGES.length) { resolve(); return; }
          STAGES[stagesDone++]();
          setTimeout(next, 0);
        };
        setTimeout(next, 0);
      });
      return preparing;
    },
    /** The light of the hour: the floodlights come on as the sun's share of the light on level ground fades (dusk). */
    setLight() {
      const sunLight = (0.2126 * lighting.sunIrradiance.x + 0.7152 * lighting.sunIrradiance.y + 0.0722 * lighting.sunIrradiance.z) * Math.max(lighting.sunDirection.y, 0);
      const skyLight = Math.PI * (0.2126 * lighting.skyAmbient.x + 0.7152 * lighting.skyAmbient.y + 0.0722 * lighting.skyAmbient.z);
      flood.value = 1 - smoothstep(0.08, 0.7, sunLight / Math.max(skyLight, 1e-6));
      sunShadow.invalidate();
    },
    /**
     * Each frame drawn, before the scene: the flags' clock (`seconds`, the
     * simulation's), and the sun's shadow map drawn again if the sun has
     * moved since (a draw of the Memorial's mesh, counted in the frame's).
     */
    update(renderer, seconds) {
      time.value = seconds;
      const [lincoln] = byLook.stone[0];
      if (lincoln.visible && stagesDone >= STAGES.length) sunShadow.draw(renderer, lincoln.geometry);
    },
    /** Under the loading veil: draw the shadow map once from a speck, so its program is built (src/main.js warmUp). */
    warmShadow(renderer) { sunShadow.warm(renderer, byLook.stone[0][0].geometry); },
    /** The wind the flags fly in: its direction over the ground ([x, z]) and its strength (WIND_STRENGTHS). */
    setWind([x, z], strength) {
      const length = Math.hypot(x, z) || 1;
      windFlag.value.set(x / length, z / length, Math.min(0.25 + 0.4 * strength, 1));
    },
    /** For the tools: how many trees and cards each level draws. */
    get counts() {
      return byLook.canopy.map(([mesh]) => ({ trees: mesh.geometry.instanceCount, cards: (mesh.geometry.index?.count ?? 0) / 6 }));
    },
  };
}
