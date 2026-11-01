// The Polynesian lagoon's scenery (src/main.js PLACES `tropical`, under its
// own pure sky, src/sky.js `lagoon`), drawn from photographs of Polynesian
// and Cook Islands motus (Aitutaki's Tapuaetai, Bora Bora's lagoon): coconut
// palms in a row along the lagoon's beach (src/pondFloor.js LAGOON_SHORE)
// leaning out over the water, a palm forest behind it and on the land
// behind the eye, beach naupaka scrub along the forest's edge, fallen
// coconuts on the sand (placeScenery, PLANTING); motus across the lagoon
// (MOTUS) and a high island beyond (HIGH_ISLAND), in the air's haze
// (AERIAL). Scenery, out of reach: nothing here has a body for the physics.
//
// The palms, as a game draws foliage. A frond is a rachis (a thin tube,
// yellow-green, tapering) bending down under its own weight, and either
// side of it a sheet of leaflets: a strip folded up into a V at the rachis
// and drooping toward its outer edge, textured with the frond atlas and
// alpha-tested, so a hundred leaflets a side cost a few quads. The atlas
// (bakeAtlas, FROND_BAKE: one GPU pass at start-up, as the floor's sand is
// baked) is drawn analytically, each leaflet a tapered blade swept toward
// the frond's tip at its own angle and length, longest a third of the way
// out, a few torn short or browning at the tip, a paler midrib, each its
// own shade of green; a row of older fronds, yellowing; a row of dead ones,
// brown and narrow; and a row of beach naupaka's rosettes (Scaevola, the
// scrub along every motu's beach). Its colours are stored as their square
// roots (8 bits keep the dark greens) and are kept under the transparent
// texels too, so its mipmaps bleed no dark fringe into the leaves.
//
// A palm (palmGeometry): a trunk leaning at its foot and curving back up
// toward the light, as a coconut palm on a beach grows toward the open
// water, swollen at its foot and ringed with the scars of fallen fronds; a
// skirt of old frond bases at its top; a crown of FRONDS fronds round it by
// the golden angle, the youngest up, the oldest hanging and yellowing, a dead
// one or two hanging brown along the trunk; and a bunch of coconuts in the
// crown. Every number comes from its own seeded stream (seededRandom), never
// Math.random. A few variants (PALMS) are built, each at three levels of
// detail (LODS), and every palm is an instance of one of them, turned to
// lean where it stands toward the water and scaled; its level is chosen by
// its distance from the shore view's eye once, when it is placed.
//
// The light on a leaf (LEAF_LIGHT): three.js's standard lighting, its normal
// bent part of the way out from the crown's middle so the crown shades as a
// mass, darker toward its inside (its vertex colour, an occlusion), and the
// sun through the leaf where it lights the far side (a thin leaf passes on
// about a third of it, yellower): the glow of a frond seen against the sun.
//
// The wind (setWind, the Wind control's strength; setTime, world seconds):
// the vertex shader bends each trunk along the wind as a cantilever (LEAN,
// times the square of the height up the trunk, plus a sway at the palm's own
// slow frequency, SWAY, swelled by slow gusts of its own), the crown riding
// the trunk's top, and flutters the fronds (FLUTTER, growing out along each
// frond and its leaflets). The water's mirror image is drawn when the view
// changes (src/main.js), so a palm's image sways only then, as a reed's does.
//
// The forest's shade (CANOPY): the renderer has no shadow map for the
// canopy, so a palm's wood below its crown and the scrub under the trees
// lose most of the sun and some of the sky by how far in they stand.
//
// Meshes (`above`), on two programs (the leaves; the wood, the coconuts, the
// motus' sand and the high island, whose colours are their vertices'):
// every palm variant at each level, two instanced meshes each, the scrub at
// each level, and one instance each of the fallen coconuts, the motus' sand
// and the high island, laid out in the world; in the main scene and on the
// mirror layer. When the camera moves (cull, each frame from src/main.js
// render), each mesh keeps only the instances the camera sees, or sees in
// the water's mirror, packed at the front of its instances: one draw a mesh.
// Built under the loading veil (src/main.js warmUp shows them whatever the
// place).
import * as THREE from 'three';
import { FullscreenPass } from './gpu.js';
import { LAGOON_SHORE, lagoonShoreDistance, landHeight } from './pondFloor.js';
import { seededRandom } from './spray.js';

const SEED = 7173;
const EYE = { x: 0, z: 2.45 };   // the shore view's eye (src/main.js VIEWS.shore)

// ---- The atlas ------------------------------------------------------------

// Its rows (ATLAS_ROWS of them, each a sheet of leaflets along u, the frond's length, and across v, a leaflet's): the
// healthy frond, an older one, beach naupaka's rosettes, a dead frond. A sheet fills ATLAS_FILL of its row; the rest
// is a gutter, so the row's mipmaps keep to it.
const ATLAS = { width: 1024, height: 512, rows: 4, fill: 0.92 };
const ROW = { green: 0, old: 1, scrub: 2, dead: 3 };
const FROND_BAKE = /* glsl */`
precision highp float;
varying vec2 vUv;
#define ROWS ${ATLAS.rows.toFixed(1)}
#define FILL ${ATLAS.fill}
#define FROND_LENGTH 4.6      // m: the sheet's u, base to tip
#define LONGEST 1.0           // m: the sheet's v, the longest leaflet
#define LEAFLETS 112.0        // a side
#define BARE 0.1              // the share of the frond's length below its first leaflet (the petiole)
#define PI 3.141592653589793
float hashOf(float seed) { return fract(sin(seed * 78.233 + 11.13) * 43758.5453); }
float hashOf2(vec2 seed) { return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453); }
float noiseOf(vec2 point) {
  vec2 cell = floor(point), within = fract(point);
  vec2 ease = within * within * (3.0 - 2.0 * within);
  return mix(mix(hashOf2(cell), hashOf2(cell + vec2(1.0, 0.0)), ease.x), mix(hashOf2(cell + vec2(0.0, 1.0)), hashOf2(cell + 1.0), ease.x), ease.y);
}
// How long the leaflets are along the frond (s, 0 at the first, 1 at the tip), as a share of the longest.
float envelope(float along) { return 0.25 + 0.75 * sin(PI * clamp(0.2 + 0.8 * along, 0.0, 1.0)); }

// The leaflets of a frond's sheet at a point (metres: along the frond, out from the rachis): their cover, 0 to 1,
// and the colour of the one on top. kind 0 healthy, 1 older, 2 dead.
vec4 frondSheet(vec2 point, float kind, vec2 pixel) {
  float spacing = FROND_LENGTH * (1.0 - BARE) / LEAFLETS;
  vec4 result = vec4(0.0);
  float nearest = 1e3;
  vec3 nearestColor = vec3(0.075, 0.13, 0.03);
  // The leaflet whose blade passes nearest: its base lies back along the rachis by the point's height over the sweep.
  float guess = (point.x - point.y * 0.62 - FROND_LENGTH * BARE) / spacing;
  for (int offset = -3; offset <= 3; offset++) {
    float index = floor(guess) + float(offset);
    if (index < 0.0 || index >= LEAFLETS) continue;
    float seed = index * 1.731 + kind * 57.0;
    float along = index / LEAFLETS;
    if (hashOf(seed + 0.4) < (kind > 1.5 ? 0.14 : 0.035)) continue;              // missing
    float angle = radians(mix(48.0, 62.0, sin(PI * along)) - 10.0 * along * along + (hashOf(seed + 1.1) - 0.5) * 12.0);
    float bladeLength = LONGEST * envelope(along) * (0.86 + 0.24 * hashOf(seed + 2.3));
    bool torn = hashOf(seed + 3.7) < (kind > 0.5 ? 0.16 : 0.07);
    if (torn) bladeLength *= 0.35 + 0.4 * hashOf(seed + 4.1);
    float width = (kind > 1.5 ? 0.017 : 0.034) * pow(envelope(along), 0.3) * (0.85 + 0.3 * hashOf(seed + 5.3));
    vec2 base = vec2(FROND_LENGTH * BARE + (index + 0.3 * (hashOf(seed + 6.7) - 0.5)) * spacing, 0.0);
    vec2 direction = vec2(cos(angle), sin(angle));
    vec2 across = vec2(-direction.y, direction.x);
    // Along the blade (with its tip curved forward a little) and across it.
    vec2 offsetFromBase = point - base;
    float reach = clamp(dot(offsetFromBase, direction), 0.0, bladeLength);
    float share = reach / bladeLength;
    vec2 centre = base + direction * reach + vec2(1.0, -0.4) * 0.06 * bladeLength * share * share;
    vec2 apart = point - centre;
    float sideways = dot(apart, across);
    float halfWidth = 0.5 * width * smoothstep(0.0, 0.05, share) * pow(max(1.0 - pow(share, torn ? 8.0 : 2.2), 0.0), 0.7);
    float blur = 0.7 * length(pixel);
    float cover = (1.0 - smoothstep(halfWidth - blur, halfWidth + blur, abs(sideways))) * step(dot(offsetFromBase, direction), bladeLength + blur);
    // Its colour: its own green, a paler midrib, the far half of the fold a little darker, a browning tip on some.
    vec3 green = mix(vec3(0.07, 0.125, 0.028), vec3(0.10, 0.15, 0.035), hashOf(seed + 7.9));
    if (kind > 0.5 && kind < 1.5) green = mix(green, vec3(0.17, 0.16, 0.045), 0.35 + 0.5 * noiseOf(vec2(along * 9.0, share * 2.0) + seed));
    if (kind > 1.5) green = mix(vec3(0.27, 0.18, 0.085), vec3(0.34, 0.25, 0.13), hashOf(seed + 7.9));
    float rib = 1.0 - smoothstep(0.08, 0.22, abs(sideways) / max(halfWidth, 1e-4));
    vec3 color = green * mix(0.9, 1.08, step(0.0, sideways)) * (0.92 + 0.16 * noiseOf(vec2(share * 14.0, seed)));
    color = mix(color, color * vec3(1.5, 1.45, 1.1) + vec3(0.02, 0.02, 0.0), rib * 0.6);
    float browning = hashOf(seed + 8.3) < (kind > 0.5 ? 0.3 : 0.12) ? smoothstep(0.65 + 0.25 * hashOf(seed + 9.1), 1.0, share) : 0.0;
    color = mix(color, vec3(0.30, 0.22, 0.11), browning);
    if (cover > result.a) { result = vec4(color, cover); }
    float distanceFrom = abs(sideways) - halfWidth;
    if (distanceFrom < nearest) { nearest = distanceFrom; nearestColor = color; }
  }
  // Under the clear texels, the nearest leaflet's colour, so the mipmaps bleed no dark into the leaves.
  return vec4(result.a > 0.0 ? result.rgb : nearestColor, result.a);
}

// Beach naupaka's rosettes (Scaevola taccada): tiles of a rosette each, a dozen glossy spoon-shaped leaves round its
// middle, the later on top, each paler along its midrib and toward its tip.
#define TILES 8.0
#define TILE 0.42             // m a tile's side
vec4 scrubRosette(vec2 tileUv, float tile, vec2 pixel) {
  vec2 point = (tileUv - 0.5) * TILE;
  vec4 result = vec4(0.0);
  vec3 under = vec3(0.07, 0.15, 0.035);
  for (int index = 0; index < 13; index++) {
    float seed = float(index) * 3.17 + tile * 31.0;
    float turn = float(index) * 2.39996 + hashOf(seed) * 0.5;
    float leafLength = (0.12 + 0.07 * hashOf(seed + 1.0)) * (index < 5 ? 0.75 : 1.0);
    float width = leafLength * (0.36 + 0.1 * hashOf(seed + 2.0));
    vec2 direction = vec2(cos(turn), sin(turn));
    vec2 local = vec2(dot(point, direction), dot(point, vec2(-direction.y, direction.x)));
    float share = local.x / leafLength;
    float halfWidth = 0.5 * width * sqrt(clamp(share, 0.0, 1.0)) * pow(clamp(1.0 - share, 0.0, 1.0), 0.3) * 1.35;
    float blur = 0.7 * length(pixel);
    float cover = (1.0 - smoothstep(halfWidth - blur, halfWidth + blur, abs(local.y))) * step(0.0, share) * (1.0 - smoothstep(1.0 - blur / leafLength, 1.0, share));
    vec3 color = mix(vec3(0.075, 0.17, 0.035), vec3(0.13, 0.23, 0.05), hashOf(seed + 3.0)) * (0.8 + 0.3 * share);
    color = mix(color, color * vec3(1.6, 1.4, 1.1), (1.0 - smoothstep(0.05, 0.15, abs(local.y) / max(halfWidth, 1e-4))) * 0.5);
    if (cover > 0.0) result = vec4(mix(result.rgb, color, cover), max(result.a, cover));
  }
  return vec4(result.a > 0.0 ? result.rgb : under, result.a);
}

void main() {
  float row = floor(vUv.y * ROWS);
  float within = fract(vUv.y * ROWS) / FILL;
  vec4 texel;
  if (within > 1.0) {
    texel = vec4(0.08, 0.14, 0.03, 0.0);                     // the gutter
  } else if (row == ${ROW.scrub.toFixed(1)}) {
    float tile = floor(vUv.x * TILES);
    vec2 tileUv = vec2(fract(vUv.x * TILES), within);
    texel = scrubRosette(tileUv, tile, vec2(fwidth(tileUv.x), fwidth(tileUv.y)) * TILE);
  } else {
    vec2 point = vec2(vUv.x * FROND_LENGTH, within * LONGEST);
    float kind = row == ${ROW.old.toFixed(1)} ? 1.0 : row == ${ROW.dead.toFixed(1)} ? 2.0 : 0.0;
    texel = frondSheet(point, kind, vec2(fwidth(point.x), fwidth(point.y)));
  }
  gl_FragColor = vec4(sqrt(texel.rgb), texel.a);
}
`;

/** The frond atlas, baked once (the header): an RGBA8 texture with its mipmaps, colours as their square roots. */
function bakeAtlas(renderer) {
  const target = new THREE.WebGLRenderTarget(ATLAS.width, ATLAS.height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: true,
  });
  target.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const pass = new FullscreenPass(FROND_BAKE, {});
  const previousTarget = renderer.getRenderTarget();
  pass.render(renderer, target);
  renderer.setRenderTarget(previousTarget);
  pass.material.dispose();
  return target;
}

// ---- A palm ---------------------------------------------------------------

/**
 * The palm variants: height along the trunk (m), lean at its foot (degrees
 * from upright, toward local +x), how much it curves back up toward its
 * crown (0 none, 1 upright at the top), and its fronds' count at full detail.
 */
export const PALMS = [
  { height: 9.5, lean: 14, curve: 0.55, fronds: 30 },
  { height: 12.5, lean: 22, curve: 0.65, fronds: 32 },
  { height: 8.0, lean: 50, curve: 0.8, fronds: 28 },    // the leaner, its crown out over the water
  { height: 15.0, lean: 7, curve: 0.35, fronds: 32 },
  { height: 11.0, lean: 31, curve: 0.7, fronds: 30 },
  { height: 17.5, lean: 4, curve: 0.25, fronds: 34 },
];
// The levels of detail: the share of a variant's fronds drawn, segments along a frond, columns across a sheet (2: a
// plane; 3: folded), the rachis's sides (0: none), the trunk's sides and rows, coconuts and their facets; and from how
// far from the shore view's eye (m) a palm is drawn at it.
export const LODS = [
  { from: 0, fronds: 1, segments: 14, columns: 3, rachis: 3, around: 10, rows: 34, nuts: 12, nutFacets: [5, 8] },
  { from: 35, fronds: 0.75, segments: 7, columns: 2, rachis: 0, around: 6, rows: 12, nuts: 3, nutFacets: [3, 4] },
  { from: 110, fronds: 0.5, segments: 3, columns: 2, rachis: 0, around: 4, rows: 4, nuts: 0, nutFacets: [0, 0] },
];
const TRUNK = { foot: 0.22, flare: 0.22, flareHeight: 0.07, top: 0.15, ring: 0.085 };   // radius (m) at the foot above the flare, the flare's, its height (share), at the top; rings' spacing (m)
const FROND = { length: [4.4, 6.0], longest: 1.15, bare: 0.1, fold: [18, -62], droop: [25, 115], leafletDroop: 0.45 };   // m; m; share; degrees at base and tip; degrees young to old; share of a leaflet's length its tip hangs
const COLORS = {
  trunk: [0.32, 0.28, 0.22], trunkTop: [0.27, 0.22, 0.16], fibre: [0.20, 0.13, 0.07], rachis: [0.30, 0.30, 0.10], rachisOld: [0.36, 0.30, 0.12], dead: [0.32, 0.22, 0.11],
  nut: [[0.20, 0.26, 0.06], [0.34, 0.30, 0.07], [0.42, 0.24, 0.07], [0.24, 0.16, 0.08]],   // green, yellow-green, orange, brown
};

/** Accumulates a mesh's vertices: position, normal, colour, uv (leaves) and the wind's weights. */
class Parts {
  constructor() { this.positions = []; this.normals = []; this.colors = []; this.uvs = []; this.sway = []; this.ring = []; this.indices = []; }

  /** A vertex; sway is (the share of the crown's lean it takes, its flutter); ring its height up the trunk (−1 off it). */
  vertex(point, normal, color, uv, sway, ring = -1) {
    this.positions.push(point.x, point.y, point.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.colors.push(color[0], color[1], color[2]);
    this.uvs.push(uv[0], uv[1]);
    this.sway.push(sway[0], sway[1]);
    this.ring.push(ring);
    return this.positions.length / 3 - 1;
  }

  /** Quads over a grid of `rows` × `columns` vertices numbered from `first`, row by row. */
  grid(first, rows, columns, wrap = false) {
    const across = wrap ? columns : columns - 1;
    for (let row = 0; row < rows - 1; row++) {
      for (let column = 0; column < across; column++) {
        const here = first + row * columns + column, next = first + row * columns + (column + 1) % columns;
        this.indices.push(here, next, here + columns, next, next + columns, here + columns);
      }
    }
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('palmSway', new THREE.Float32BufferAttribute(this.sway, 2));
    geometry.setAttribute('palmRing', new THREE.Float32BufferAttribute(this.ring, 1));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const mixColor = (one, other, share) => one.map((value, index) => value + (other[index] - value) * share);
const shade = (color, factor) => color.map((value) => value * factor);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A palm variant at a level of detail (the header): its leaves and its wood
 * (trunk, frond bases, rachises, coconuts) as two geometries, in its own
 * frame (foot at the origin, leaning toward +x), drawn from `stream`.
 */
function palmGeometry(variant, lod, stream) {
  const leaves = new Parts(), wood = new Parts();
  const { height, lean, curve } = variant;
  // The trunk's axis: marched up, its angle from upright easing from `lean` at the foot by `curve` toward the top,
  // with a little wander of its own.
  const rows = lod.rows, axis = [], tangents = [];
  const wander = stream() * 10;
  const point = new THREE.Vector3();
  for (let row = 0; row <= rows; row++) {
    const share = row / rows;
    const angle = THREE.MathUtils.degToRad(lean) * (1 - curve * share * share) + 0.035 * Math.sin(share * 7 + wander);
    const tangent = new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0.04 * Math.sin(share * 5 + wander * 1.3)).normalize();
    axis.push(point.clone());
    tangents.push(tangent);
    point.addScaledVector(tangent, height / rows);
  }
  const top = axis[rows].clone();
  const topTangent = tangents[rows];
  const swayAt = (y) => [Math.min(Math.max(y / top.y, 0), 1) ** 2, 0];
  // The trunk: a tube, flared at its foot, its colour paler and greyer below (weathered), browner under the crown.
  const firstTrunk = wood.positions.length / 3;
  for (let row = 0; row <= rows; row++) {
    const share = row / rows;
    const flareShare = Math.max(1 - share / TRUNK.flareHeight, 0);
    const radius = TRUNK.foot + (TRUNK.top - TRUNK.foot) * share ** 0.7 + TRUNK.flare * flareShare ** 2;
    const tangent = tangents[row];
    const across = new THREE.Vector3(0, 0, 1).addScaledVector(tangent, -tangent.z).normalize();
    const over = new THREE.Vector3().crossVectors(tangent, across).normalize();
    const color = mixColor(COLORS.trunk, COLORS.trunkTop, share ** 3);
    for (let around = 0; around < lod.around; around++) {
      const turn = (around / lod.around) * Math.PI * 2;
      const normal = across.clone().multiplyScalar(Math.cos(turn)).addScaledVector(over, Math.sin(turn));
      const at = axis[row].clone().addScaledVector(normal, radius);
      if (row === 0) at.y -= 0.15;   // sunk into the sand
      wood.vertex(at, normal, shade(color, 0.92 + 0.16 * stream()), [0, 0], swayAt(at.y), share * height);
    }
  }
  wood.grid(firstTrunk, rows + 1, lod.around, true);
  // The skirt of old frond bases at the top: a short flared sleeve of fibre.
  if (lod.around >= 6) {
    const firstSkirt = wood.positions.length / 3;
    for (let ring = 0; ring <= 3; ring++) {
      const share = ring / 3;
      const centre = top.clone().addScaledVector(topTangent, -0.7 + 0.75 * share);
      const radius = TRUNK.top + 0.06 + 0.16 * share ** 1.5;
      for (let around = 0; around < lod.around; around++) {
        const turn = (around / lod.around) * Math.PI * 2;
        const normal = new THREE.Vector3(Math.cos(turn), 0.25 * share, Math.sin(turn)).normalize();
        wood.vertex(centre.clone().add(new THREE.Vector3(Math.cos(turn) * radius, 0, Math.sin(turn) * radius)), normal, shade(COLORS.fibre, 0.7 + 0.5 * stream()), [0, 0], swayAt(centre.y));
      }
    }
    wood.grid(firstSkirt, 4, lod.around, true);
  }
  // The crown: fronds round the top by the golden angle, the youngest up, the oldest hanging.
  const fronds = Math.max(Math.round(variant.fronds * lod.fronds), 6);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phase = stream() * Math.PI * 2;
  for (let index = 0; index < fronds; index++) {
    const age = index / (fronds - 1);   // 0 the youngest
    const azimuth = index * golden + phase + (stream() - 0.5) * 0.3;
    const rise = THREE.MathUtils.degToRad(68 - 100 * age ** 0.85 + (stream() - 0.5) * 14);
    const length = (FROND.length[0] + (FROND.length[1] - FROND.length[0]) * Math.sin(Math.PI * Math.min(0.25 + 0.9 * age, 1)) ** 0.7) * (0.9 + 0.2 * stream());
    const droop = THREE.MathUtils.degToRad(FROND.droop[0] + (FROND.droop[1] - FROND.droop[0]) * age ** 1.2) * (0.85 + 0.3 * stream());
    const row = age > 0.82 && stream() < 0.6 ? ROW.old : ROW.green;
    frond(leaves, wood, lod, { top, topTangent, azimuth, rise, length, droop, row, age }, stream, swayAt);
  }
  // A dead frond or two, hanging brown along the trunk.
  if (lod.fronds === 1) {
    for (let index = 0; index < 1 + Math.floor(stream() * 2); index++) {
      frond(leaves, wood, lod, { top: top.clone().addScaledVector(topTangent, -0.35), topTangent, azimuth: stream() * Math.PI * 2, rise: THREE.MathUtils.degToRad(-62 - 12 * stream()), length: 3.0 + 0.8 * stream(), droop: 0.35, row: ROW.dead, age: 1 }, stream, swayAt);
    }
  }
  // The coconuts: a bunch under the crown, each an egg with the husk's three faint ridges.
  for (let index = 0; index < lod.nuts; index++) {
    const angle = stream() * Math.PI * 2, out = 0.2 + 0.18 * stream();
    const centre = top.clone().addScaledVector(topTangent, -0.25 - 0.35 * stream()).add(new THREE.Vector3(Math.cos(angle) * out, 0, Math.sin(angle) * out));
    const color = COLORS.nut[Math.floor(stream() * (stream() < 0.7 ? 2 : 4))];
    coconut(wood, centre, 0.13 + 0.03 * stream(), new THREE.Vector3(Math.cos(angle), -1.2, Math.sin(angle)).normalize(), shade(color, 0.85 + 0.3 * stream()), lod.nutFacets, swayAt(centre.y), stream);
  }
  return { leaves: leaves.geometry(), wood: wood.geometry(), top };
}

/**
 * A frond from the crown's top: its rachis rising at `rise` toward
 * `azimuth`, bending down by `droop` over its `length`, and its two sheets of
 * leaflets (the atlas's `row`) folded up into a V at the rachis, the fold
 * opening and turning down toward the tip, each leaflet's tip hanging.
 */
function frond(leaves, wood, lod, { top, topTangent, azimuth, rise, length, droop, row, age }, stream, swayAt) {
  const steps = lod.segments;
  const outward = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
  const base = top.clone().addScaledVector(outward, 0.12).addScaledVector(topTangent, -0.15 * age);
  const rachis = [], tangents = [];
  const point = base.clone();
  for (let step = 0; step <= steps; step++) {
    const share = step / steps;
    const angle = rise - droop * share ** 1.5;
    const tangent = outward.clone().multiplyScalar(Math.cos(angle)).addScaledVector(UP, Math.sin(angle));
    rachis.push(point.clone());
    tangents.push(tangent);
    point.addScaledVector(tangent, length / steps);
  }
  const sideways = new THREE.Vector3(-outward.z, 0, outward.x);
  const twist = (stream() - 0.5) * 0.5;   // the frond rolls a little about its rachis toward its tip
  const shadeInside = 0.55 + 0.45 * (1 - age * 0.5);
  const rachisColor = mixColor(COLORS.rachis, row === ROW.dead ? COLORS.dead : COLORS.rachisOld, row === ROW.green ? age * 0.4 : 1);
  // The rachis: a thin tube (lod.rachis sides; two crossed ribbons at 2), tapering.
  if (lod.rachis > 0) {
    const first = wood.positions.length / 3;
    const sides = lod.rachis === 2 ? 4 : lod.rachis;
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const tangent = tangents[step];
      const normalUp = new THREE.Vector3().crossVectors(sideways, tangent).normalize();
      const radius = 0.045 * (1 - 0.8 * share);
      for (let side = 0; side < sides; side++) {
        const turn = (side / sides) * Math.PI * 2;
        const normal = sideways.clone().multiplyScalar(Math.cos(turn)).addScaledVector(normalUp, Math.sin(turn));
        wood.vertex(rachis[step].clone().addScaledVector(normal, radius), normal, shade(rachisColor, 0.75 + 0.35 * share), [0, 0], [swayAt(rachis[step].y)[0], share * 0.6]);
      }
    }
    wood.grid(first, steps + 1, sides, true);
  }
  // The two sheets of leaflets.
  const columns = lod.columns === 3 ? [0, 0.42, 1] : [0, 1];
  const leafletLength = FROND.longest * (row === ROW.dead ? 0.7 : 1) * (0.85 + 0.15 * Math.min(length / FROND.length[1], 1));
  for (const side of [-1, 1]) {
    const first = leaves.positions.length / 3;
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const tangent = tangents[step];
      const normalUp = new THREE.Vector3().crossVectors(sideways, tangent).normalize();
      const roll = twist * share;
      const across = sideways.clone().multiplyScalar(side * Math.cos(roll)).addScaledVector(normalUp, Math.sin(roll) * side);
      const frondUp = new THREE.Vector3().crossVectors(tangent, across).multiplyScalar(side).normalize();
      const fold = THREE.MathUtils.degToRad(row === ROW.dead ? -70 : FROND.fold[0] + (FROND.fold[1] - FROND.fold[0]) * share ** 1.2 - 20 * age);
      const outwardAcross = across.clone().multiplyScalar(Math.cos(fold)).addScaledVector(frondUp, Math.sin(fold));
      // Below its first leaflets the frond is bare (the atlas is clear there); the sheet's width follows the leaflets.
      for (const column of columns) {
        const reach = leafletLength * column;
        const at = rachis[step].clone().addScaledVector(outwardAcross, reach).addScaledVector(frondUp, -FROND.leafletDroop * leafletLength * column * column * (0.6 + share));
        const normal = new THREE.Vector3().crossVectors(tangent, outwardAcross).multiplyScalar(side).normalize();
        if (normal.y < 0) normal.negate();
        const tint = shadeInside * (0.7 + 0.3 * column) * (0.75 + 0.25 * share);
        leaves.vertex(at, normal, [tint, tint, tint], [share, (row + column * ATLAS.fill) / ATLAS.rows], [swayAt(at.y)[0], share * 0.6 + column * 0.4]);
      }
    }
    leaves.grid(first, steps + 1, columns.length);
  }
}

/** A coconut: an egg of `radius` pointing along `axis`, its husk's three ridges, in `facets` (rings, around). */
function coconut(parts, centre, radius, axis, color, [rings, around], sway, stream) {
  if (rings === 0) return;
  const side = new THREE.Vector3().crossVectors(axis, UP).normalize();
  if (side.lengthSq() < 0.5) side.set(1, 0, 0);
  const over = new THREE.Vector3().crossVectors(axis, side).normalize();
  const first = parts.positions.length / 3;
  for (let ring = 0; ring <= rings; ring++) {
    const polar = (ring / rings) * Math.PI;
    for (let column = 0; column < around; column++) {
      const turn = (column / around) * Math.PI * 2;
      const ridge = 1 + 0.06 * Math.cos(3 * turn);
      const along = Math.cos(polar) * 1.25 * (polar < Math.PI / 2 ? 1 : 0.85);
      const normal = axis.clone().multiplyScalar(Math.cos(polar)).addScaledVector(side, Math.sin(polar) * Math.cos(turn)).addScaledVector(over, Math.sin(polar) * Math.sin(turn)).normalize();
      const at = centre.clone().addScaledVector(axis, along * radius).addScaledVector(side, Math.sin(polar) * Math.cos(turn) * radius * ridge).addScaledVector(over, Math.sin(polar) * Math.sin(turn) * radius * ridge);
      parts.vertex(at, normal, shade(color, 0.9 + 0.2 * stream()), [0, 0], sway);
    }
  }
  parts.grid(first, rings + 1, around, true);
}

// ---- The light and the wind ----------------------------------------------

// The sway (setWind, the vertex shader): the crown's lean along the wind per unit of the Wind control's strength
// (rad), its sway (rad) and frequency (Hz, each palm its own about it), the fronds' flutter (m at a leaflet's tip per
// unit strength) and its frequency (Hz).
const LEAN = 0.025;
const SWAY = 0.012;
const SWAY_HERTZ = 0.25;
const FLUTTER = 0.06;
const FLUTTER_HERTZ = 1.6;
// A leaf's light (the header): the share of its normal bent out from the crown's middle, the share of the sun on its
// far side it lets through, and that light's tint against the leaf's own colour.
const LEAF_LIGHT = { crown: 0.35, through: 0.35, tint: [1.25, 1.35, 0.55] };
// The white sand's light from below (GROUND_BOUNCE: the sand's albedo), on the trunks and under the fronds: the
// beach's own glow in the photographs, which the sky's map, water-coloured below the horizon, does not give.
const GROUND_BOUNCE = 0.7;
const SKY_LIGHT = 1.4;   // the sky's light on level ground per unit of its mean radiance, as LAND_FRAGMENT's

const PALM_VERTEX = /* glsl */`
uniform float uPalmTime;
uniform float uPalmWind;
uniform vec2 uPalmWindDirection;
attribute vec2 palmSway;       // the share of the crown's lean this point takes (the square of its height up the trunk), its flutter
attribute float palmRing;      // m up the trunk (its rings), −1 off it
attribute vec4 palmInstance;   // its palm's height (m, along the trunk, as built), phase, crown's height (m), and how deep in the forest's shade it stands (0 to 1)
varying float vPalmRing;
varying float vPalmShade;
varying vec3 vPalmLocal;
`;
const PALM_MOVE = /* glsl */`
  {
    // The wind in the palm's own frame (its instance turns it and scales it).
    vec3 windLocal = normalize((vec4(uPalmWindDirection.x, 0.0, uPalmWindDirection.y, 0.0) * instanceMatrix).xyz + vec3(1e-5));
    float palmPhase = palmInstance.y;
    float gust = 0.75 + 0.25 * sin(uPalmTime * 0.31 + palmPhase) * sin(uPalmTime * 0.17 + palmPhase * 1.7);
    float sway = uPalmWind * gust * (${LEAN.toFixed(4)} + ${SWAY.toFixed(4)} * sin(6.2831853 * ${SWAY_HERTZ.toFixed(3)} * (0.85 + 0.3 * fract(palmPhase * 0.37)) * uPalmTime + palmPhase));
    vec3 lean = windLocal * sway * palmInstance.x * palmSway.x;
    lean.y -= 0.5 * sway * sway * palmInstance.x * palmSway.x;
    float flutter = palmSway.y * uPalmWind * gust * ${FLUTTER.toFixed(3)} * sin(6.2831853 * ${FLUTTER_HERTZ.toFixed(2)} * uPalmTime + dot(position, vec3(2.3, 1.1, 1.7)) + palmPhase);
    transformed += lean + vec3(0.4 * flutter * windLocal.x, flutter, 0.4 * flutter * windLocal.z);
    vPalmRing = palmRing;
    vPalmLocal = position;
    // In the forest's shade (CANOPY): a palm's wood below its crown (its trunk by its rings, the rest by its height
    // under the crown's), all of a mound of scrub (a palm's leaves are given none).
    #ifdef PALM_LEAVES
      vPalmShade = palmInstance.w;
    #else
      vPalmShade = palmInstance.w * (1.0 - smoothstep(0.55, 0.95, palmRing >= 0.0 ? palmRing / palmInstance.x : position.y / max(palmInstance.z, 0.1)));
    #endif
  }
`;

// ---- The scrub, the motus and the high island ------------------------------

// Beach naupaka (Scaevola taccada), the scrub along every motu's beach: a mound of the atlas's rosettes, cards facing
// out from its middle over a squashed dome, `radius` and `height` (m) as built (instances scale them); at each level of
// detail `cards` of them, larger as they are fewer.
const SCRUB = { radius: 1.3, height: 1.1, cards: [70, 26, 10], card: [0.62, 1.0, 1.6] };
/** A naupaka mound at a level of detail (0 to 2): leaf cards over a dome, as leaves for the leaf program. */
function scrubGeometry(level, stream) {
  const leaves = new Parts();
  const cards = SCRUB.cards[level], size = SCRUB.card[level];
  for (let index = 0; index < cards; index++) {
    // Spread over the dome by the golden angle, a few low round its foot.
    const share = (index + 0.5) / cards;
    const polar = Math.acos(1 - share * 1.05) * (0.95 + 0.1 * stream());
    const turn = index * 2.39996 + stream() * 0.4;
    const out = new THREE.Vector3(Math.sin(polar) * Math.cos(turn), Math.cos(polar), Math.sin(polar) * Math.sin(turn));
    const centre = new THREE.Vector3(out.x * SCRUB.radius, Math.max(out.y, 0.05) * SCRUB.height, out.z * SCRUB.radius).multiplyScalar(0.85 + 0.2 * stream());
    // The card faces out, turned about its normal at random.
    const normal = out.clone().add(new THREE.Vector3(stream() - 0.5, stream() - 0.5, stream() - 0.5).multiplyScalar(0.6)).normalize();
    const side = new THREE.Vector3().crossVectors(normal, UP);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const over = new THREE.Vector3().crossVectors(side, normal).normalize();
    const spin = stream() * Math.PI * 2;
    const right = side.clone().multiplyScalar(Math.cos(spin)).addScaledVector(over, Math.sin(spin)).multiplyScalar(size * 0.5);
    const up = over.clone().multiplyScalar(Math.cos(spin)).addScaledVector(side, -Math.sin(spin)).multiplyScalar(size * 0.5);
    const tile = Math.floor(stream() * 8);
    const tint = 0.6 + 0.4 * Math.min(centre.y / SCRUB.height + 0.3, 1);   // darker toward its foot and inside
    const first = leaves.positions.length / 3;
    for (const [across, along] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const at = centre.clone().addScaledVector(right, across).addScaledVector(up, along);
      leaves.vertex(at, normal, [tint, tint, tint], [(tile + 0.5 + 0.5 * across) / 8, (ROW.scrub + (0.5 + 0.5 * along) * ATLAS.fill) / ATLAS.rows], [0, 0.25 * Math.max(at.y, 0) / SCRUB.height]);
    }
    leaves.indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
  }
  return leaves.geometry();
}

// Fallen coconuts on the sand under the beach's palms: how many, and how far from a palm's foot (m).
const FALLEN = { count: 46, reach: [0.6, 3.5] };
/** The fallen coconuts, lying on their sides, as wood: one geometry laid out in the world (each nut its own colour). */
function fallenGeometry(fallen, stream) {
  const wood = new Parts();
  for (const nut of fallen) {
    const axis = new THREE.Vector3(Math.cos(nut.yaw), 0.15 * (stream() - 0.5), Math.sin(nut.yaw)).normalize();
    coconut(wood, new THREE.Vector3(nut.x, nut.y + 0.11 * nut.scale, nut.z), 0.13 * nut.scale, axis, nut.color, [6, 10], [0, 0], stream);
  }
  return wood.geometry();
}

// The motus across the lagoon, low islets of coral sand under palm forest (as in the photographs, a dark green line on
// the horizon with palms' crowns standing out of it): each its middle's bearing (degrees right of straight ahead) and
// distance from the eye (m), half-lengths (m) and turn (degrees), and how thick its forest is (palms per 100 m²).
// The near one stands within a few hundred metres, its palms resolved; the far reef's chain runs along the horizon.
export const MOTUS = [
  { bearing: -33, distance: 520, half: [120, 38], turn: 8, palms: 0.9 },
  { bearing: -58, distance: 1500, half: [420, 60], turn: -28, palms: 0.35 },
  { bearing: -14, distance: 1750, half: [300, 55], turn: 4, palms: 0.35 },
  { bearing: 2, distance: 2300, half: [160, 45], turn: 15, palms: 0.35 },
];
const MOTU_SAND = { height: 1.2, rings: 10, around: 48, color: [0.78, 0.75, 0.66] };
const motuMiddle = (motu) => {
  const bearing = THREE.MathUtils.degToRad(motu.bearing);
  return { x: EYE.x + Math.sin(bearing) * motu.distance, z: EYE.z - Math.cos(bearing) * motu.distance, turn: THREE.MathUtils.degToRad(motu.turn) };
};
/** A motu's outline's reach at angle θ in its own frame, as a share of its half-lengths: wobbling. */
const motuReach = (angle, seed) => 1 + 0.1 * Math.sin(3 * angle + seed) + 0.06 * Math.sin(5 * angle + 2 * seed) + 0.04 * Math.sin(9 * angle + 3 * seed);
/** Whether (x, z) lies on a motu, `inset` metres inside its sand. */
function onMotu(motu, x, z, inset, seed) {
  const middle = motuMiddle(motu);
  const dx = x - middle.x, dz = z - middle.z;
  const localX = dx * Math.cos(middle.turn) + dz * Math.sin(middle.turn), localZ = -dx * Math.sin(middle.turn) + dz * Math.cos(middle.turn);
  const angle = Math.atan2(localZ / motu.half[1], localX / motu.half[0]);
  const reach = Math.hypot(localX / motu.half[0], localZ / motu.half[1]);
  return reach * Math.max(motu.half[0], motu.half[1]) < motuReach(angle, seed) * Math.max(motu.half[0], motu.half[1]) - inset;
}
/** The motus' sand: a low mound on each one's wobbling outline, as wood (vertex colours), one geometry. */
function motuSandGeometry() {
  const wood = new Parts();
  for (const [index, motu] of MOTUS.entries()) {
    const middle = motuMiddle(motu);
    const first = wood.positions.length / 3;
    for (let ring = 0; ring <= MOTU_SAND.rings; ring++) {
      const share = 1.08 * ring / MOTU_SAND.rings;   // from its middle out to just under the water at its rim
      for (let spoke = 0; spoke < MOTU_SAND.around; spoke++) {
        const angle = (spoke / MOTU_SAND.around) * Math.PI * 2;
        const reach = motuReach(angle, index * 1.7) * share;
        const localX = Math.cos(angle) * motu.half[0] * reach, localZ = Math.sin(angle) * motu.half[1] * reach;
        const height = MOTU_SAND.height * (1 - Math.min(share, 1) ** 6) - (share > 1 ? 0.4 : 0);
        const at = new THREE.Vector3(middle.x + localX * Math.cos(middle.turn) - localZ * Math.sin(middle.turn), height, middle.z + localX * Math.sin(middle.turn) + localZ * Math.cos(middle.turn));
        wood.vertex(at, UP, MOTU_SAND.color, [0, 0], [0, 0]);
      }
    }
    wood.grid(first, MOTU_SAND.rings + 1, MOTU_SAND.around, true);
  }
  return wood.geometry();
}

// The high island across the lagoon, its volcanic peaks under forest, as Bora Bora's Otemanu and Pahia stand over
// their lagoon: its middle's bearing and distance (m), its radius (m), and its peaks (offset from its middle in m,
// x right and z away; height and spread in m). Seen 7 km off through the air's haze (AERIAL).
export const HIGH_ISLAND = {
  bearing: -24, distance: 7200, radius: 2600, rings: 40, around: 120,
  peaks: [
    { at: [-300, 200], height: 640, spread: 520, sharp: 1.6 },    // the plug, steep-sided
    { at: [350, -150], height: 560, spread: 600, sharp: 1.4 },
    { at: [-900, 500], height: 320, spread: 900, sharp: 1.1 },
    { at: [1100, 300], height: 260, spread: 800, sharp: 1.0 },
    { at: [0, 0], height: 180, spread: 2000, sharp: 0.9 },        // the island's broad shoulders
  ],
  forest: [0.035, 0.085, 0.03], rock: [0.11, 0.10, 0.085], shore: [0.55, 0.53, 0.46],
};
/** The high island's height (m) at an offset from its middle (m): its peaks, ridged, falling to the shore at its rim. */
function islandHeight(offsetX, offsetZ) {
  let height = 0;
  for (const peak of HIGH_ISLAND.peaks) {
    const apart = Math.hypot(offsetX - peak.at[0], offsetZ - peak.at[1]) / peak.spread;
    height = Math.max(height, peak.height * Math.exp(-(apart ** peak.sharp)));
  }
  const angle = Math.atan2(offsetZ, offsetX), out = Math.hypot(offsetX, offsetZ) / HIGH_ISLAND.radius;
  const ridges = 0.82 + 0.18 * Math.abs(Math.sin(angle * 7 + 1.3 * Math.sin(angle * 3))) + 0.06 * Math.sin(angle * 23 + out * 9);
  return height * ridges * (1 - THREE.MathUtils.smoothstep(out, 0.7, 1.0)) - 4 * THREE.MathUtils.smoothstep(out, 0.95, 1.05);
}
/**
 * The high island: a grid of rings about its middle, forested, its steepest
 * faces bare rock (by the grid's own normals), a pale shore at its foot, as
 * wood.
 */
function islandGeometry() {
  const wood = new Parts();
  const bearing = THREE.MathUtils.degToRad(HIGH_ISLAND.bearing);
  const middleX = EYE.x + Math.sin(bearing) * HIGH_ISLAND.distance, middleZ = EYE.z - Math.cos(bearing) * HIGH_ISLAND.distance;
  const toward = new THREE.Vector2(Math.sin(bearing), -Math.cos(bearing)), right = new THREE.Vector2(-toward.y, toward.x);
  const shades = [];
  for (let ring = 0; ring <= HIGH_ISLAND.rings; ring++) {
    const radius = HIGH_ISLAND.radius * 1.06 * (1 - ring / HIGH_ISLAND.rings) ** 0.8;
    for (let spoke = 0; spoke < HIGH_ISLAND.around; spoke++) {
      const angle = (spoke / HIGH_ISLAND.around) * Math.PI * 2;
      const localX = Math.cos(angle) * radius, localZ = Math.sin(angle) * radius;   // x right, z away from the eye
      const height = islandHeight(localX, localZ);
      const worldX = middleX + right.x * localX + toward.x * localZ, worldZ = middleZ + right.y * localX + toward.y * localZ;
      wood.vertex(new THREE.Vector3(worldX, height, worldZ), UP, [0, 0, 0], [0, 0], [0, 0]);
      shades.push({ height, mottle: 0.85 + 0.3 * Math.sin(localX * 0.013 + 1.7 * Math.sin(localZ * 0.011)) ** 2 });
    }
  }
  // Rings from the rim inward, wound to face up: the offsets' (x right, z away) turn to the world's is a mirror image.
  wood.grid(0, HIGH_ISLAND.rings + 1, HIGH_ISLAND.around, true);
  const geometry = wood.geometry();
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal, colors = geometry.attributes.color;
  for (const [index, { height, mottle }] of shades.entries()) {
    const steep = THREE.MathUtils.smoothstep(1 - normals.getY(index), 0.35, 0.6);
    const shore = 1 - THREE.MathUtils.smoothstep(height, 2, 12);
    colors.setXYZ(index, ...shade(mixColor(mixColor(HIGH_ISLAND.forest, HIGH_ISLAND.rock, steep), HIGH_ISLAND.shore, shore), mottle));
  }
  return geometry;
}

// The air's haze over the lagoon (AERIAL, in both programs): what stands d metres off takes 1 − exp(−d/AERIAL) of the
// sky's own colour at the horizon behind it (the sky's map, a little above the horizon that way): the far motus a
// tenth, the high island two fifths, as a South Pacific day's haze shows them in the photographs.
const AERIAL = 15000;

// The forest's shade (vPalmShade, by how far in a palm or a mound stands, `from` to `deep` metres from the waterline):
// the share of the sun and of the sky it loses below the crowns. Standing for the shadows of a canopy the renderer has
// no shadow map for: a trunk's foot in the forest is dim, its crown in the sun.
const CANOPY = { sun: 0.8, sky: 0.55, from: 12, deep: 30 };
// How much a leaf's alpha grows per mip level (the atlas's own: 0.25 a level, as Golus's article finds for foliage).
const ALPHA_MIP = 0.25;
// How far (m, as built) the wind may lean a palm out of its bounding sphere (cull).
const CULL_MARGIN = 2;

// ---- The scenery -----------------------------------------------------------

/** Where the lagoon's beach is at `along` metres out from its origin: the waterline there and the way inland (unit, x and z). */
function beachFrame(along) {
  const heading = THREE.MathUtils.degToRad(LAGOON_SHORE.bearing);
  const outX = Math.sin(heading), outZ = -Math.cos(heading);    // along the beach
  const towardX = -Math.cos(heading), towardZ = -Math.sin(heading);   // toward the lagoon
  const [wander, wavelength] = LAGOON_SHORE.wander;
  const bend = Math.max(along, 0) ** 2 / (2 * LAGOON_SHORE.bow) + wander * Math.sin(along / wavelength + 1.0) * Math.min(Math.max(along / 40, 0), 1);
  return { x: LAGOON_SHORE.origin[0] + outX * along + towardX * bend, z: LAGOON_SHORE.origin[1] + outZ * along + towardZ * bend, inlandX: -towardX, inlandZ: -towardZ };
}

// The beach's planting (placeScenery): its first row of palms `row` metres in from the waterline (least, spread),
// leaning out over the water; the scrub's front `scrub` metres in, and on behind it to `deep`; the forest's palms, one
// to `forest` square metres, from `forestFrom` metres in; none within `clear` metres of the shore view's eye, so the
// home view's near shore stays open sand.
const PLANTING = { row: [2.5, 6], rowSpacing: [7, 9], scrub: 13, deep: 55, scrubSpacing: 3.6, forestFrom: 10, forest: 85, clear: 9, extent: [-160, 280, -430, 120] };
/** How far inland of the lagoon's waterline (x, z) lies (m; negative in the water). */
const inlandAt = (x, z) => -lagoonShoreDistance(x, z);
/** The land's height (m) at (x, z): the lagoon's beach and bank (src/pondFloor.js landHeight). */
const groundAt = (x, z) => Math.max(landHeight(Math.max(inlandAt(x, z), 0)), 0);

/**
 * Where everything stands (the header): the palms (each its variant, foot,
 * the way it leans: yaw, the angle of its local +x in world XZ, scale and
 * phase), the scrub's mounds and the fallen coconuts.
 */
function placeScenery(stream) {
  const palms = [], scrub = [], fallen = [];
  const shadeAt = (x, z) => THREE.MathUtils.smoothstep(inlandAt(x, z), CANOPY.from, CANOPY.deep);
  const palm = (x, z, variant, toward, scale) => palms.push({ x, z, y: groundAt(x, z) - 0.02, variant, yaw: Math.atan2(toward[1], toward[0]), scale, phase: stream() * 100, shade: shadeAt(x, z) });
  const nearEye = (x, z) => Math.hypot(x - EYE.x, z - EYE.z) < PLANTING.clear;
  // Along the lagoon's beach: a row a few metres in from the waterline, leaning out over the water.
  for (let along = 6; along < LAGOON_SHORE.end - 10; along += PLANTING.rowSpacing[0] + PLANTING.rowSpacing[1] * stream()) {
    const frame = beachFrame(along);
    const inland = PLANTING.row[0] + PLANTING.row[1] * stream();
    const x = frame.x + frame.inlandX * inland, z = frame.z + frame.inlandZ * inland;
    const spread = (stream() - 0.5) * 0.9;
    const toward = [-frame.inlandX * Math.cos(spread) + frame.inlandZ * Math.sin(spread), -frame.inlandZ * Math.cos(spread) - frame.inlandX * Math.sin(spread)];
    // The second and fourth lean far out over the water, their crowns low over it (the photographs' leaning palm).
    const leaner = palms.length === 2 || palms.length === 4;
    palm(x, z, leaner ? 2 : Math.floor(stream() * PALMS.length), toward, 0.85 + 0.35 * stream());
  }
  // Behind the eye, along the lake's beach: a few, leaning out toward the water.
  for (let x = -60; x < 4; x += 7 + 8 * stream()) {
    const z = SHORE_Z + x * x / 120 + PLANTING.row[0] + PLANTING.row[1] * stream();
    if (nearEye(x, z)) continue;
    palm(x, z, Math.floor(stream() * PALMS.length), [(stream() - 0.5) * 0.8, -1], 0.85 + 0.35 * stream());
  }
  // The forest and the scrub over the land: a jittered grid, kept where the land is far enough in.
  const [minX, maxX, minZ, maxZ] = PLANTING.extent;
  const forestCell = Math.sqrt(PLANTING.forest);
  for (let x = minX; x < maxX; x += forestCell) {
    for (let z = minZ; z < maxZ; z += forestCell) {
      const atX = x + forestCell * stream(), atZ = z + forestCell * stream();
      const inland = inlandAt(atX, atZ);
      if (inland < PLANTING.forestFrom || inland > PLANTING.deep + 30 || nearEye(atX, atZ)) continue;
      palm(atX, atZ, [0, 1, 3, 5, 3, 5][Math.floor(stream() * 6)], [stream() - 0.5, stream() - 0.5], 0.9 + 0.4 * stream());
    }
  }
  for (let x = minX; x < maxX; x += PLANTING.scrubSpacing) {
    for (let z = minZ; z < maxZ; z += PLANTING.scrubSpacing) {
      const atX = x + PLANTING.scrubSpacing * stream(), atZ = z + PLANTING.scrubSpacing * stream();
      const inland = inlandAt(atX, atZ);
      if (inland < PLANTING.scrub - 1.5 * stream() || inland > PLANTING.deep || nearEye(atX, atZ)) continue;
      // Thicker toward its front, where the sun reaches it; taller behind.
      if (stream() > 0.85 - 0.4 * THREE.MathUtils.smoothstep(inland, PLANTING.scrub + 4, PLANTING.deep)) continue;
      const scale = 0.8 + 0.7 * stream() + 0.8 * THREE.MathUtils.smoothstep(inland, PLANTING.scrub, PLANTING.scrub + 12);
      scrub.push({ x: atX, z: atZ, y: groundAt(atX, atZ) - 0.15, yaw: stream() * Math.PI * 2, scale, phase: stream() * 100, shade: 0.7 * shadeAt(atX, atZ) });
    }
  }
  // Fallen coconuts round the feet of the beach's palms.
  const beachPalms = palms.filter((placed) => inlandAt(placed.x, placed.z) < PLANTING.forestFrom);
  for (let index = 0; index < FALLEN.count && beachPalms.length > 0; index++) {
    const under = beachPalms[Math.floor(stream() * beachPalms.length)];
    const angle = stream() * Math.PI * 2, reach = FALLEN.reach[0] + (FALLEN.reach[1] - FALLEN.reach[0]) * stream();
    const x = under.x + Math.cos(angle) * reach, z = under.z + Math.sin(angle) * reach;
    if (inlandAt(x, z) < 1.5) continue;
    fallen.push({ x, z, y: groundAt(x, z) - 0.03, yaw: stream() * Math.PI * 2, scale: 0.9 + 0.25 * stream(), phase: 0, color: COLORS.nut[Math.floor(stream() * 4)] });
  }
  // The motus' forests: palms over each, a few metres in from its sand's edge, and scrub along its shore.
  for (const [index, motu] of MOTUS.entries()) {
    const middle = motuMiddle(motu);
    const cell = Math.sqrt(100 / motu.palms);
    const span = Math.max(...motu.half) * 1.2;
    for (let along = -span; along < span; along += cell) {
      for (let across = -span; across < span; across += cell) {
        const localX = along + cell * stream(), localZ = across + cell * stream();
        const x = middle.x + localX * Math.cos(middle.turn) - localZ * Math.sin(middle.turn), z = middle.z + localX * Math.sin(middle.turn) + localZ * Math.cos(middle.turn);
        if (!onMotu(motu, x, z, 6, index * 1.7)) continue;
        palms.push({ x, z, y: MOTU_SAND.height - 0.1, variant: [0, 1, 3, 4, 5][Math.floor(stream() * 5)], yaw: stream() * Math.PI * 2, scale: 0.9 + 0.5 * stream(), phase: stream() * 100, shade: 0.6 });
        if (stream() < 0.8) scrub.push({ x: x + 3 * (stream() - 0.5), z: z + 3 * (stream() - 0.5), y: MOTU_SAND.height - 0.3, yaw: stream() * Math.PI * 2, scale: 2.2 + 1.6 * stream(), phase: stream() * 100, shade: 0.3 });
      }
    }
  }
  return { palms, scrub, fallen };
}
const SHORE_Z = 2.72;   // the lake's waterline under the eye (src/pondFloor.js SHORE.z)

export class Tropics {
  constructor({ renderer, envTexture, mirrorLayer, lighting }) {
    this.atlas = bakeAtlas(renderer);
    this.uniforms = {
      uPalmTime: { value: 0 }, uPalmWind: { value: 0.3 }, uPalmWindDirection: { value: new THREE.Vector2(0.45, -0.9).normalize() },
      uSunDir: { value: lighting.sunDirection }, uSunIrradiance: { value: lighting.sunIrradiance }, uSkyAmbient: { value: lighting.skyAmbient },
    };
    this.leafMaterial = this.material('leaves', envTexture);
    this.woodMaterial = this.material('wood', envTexture);
    this.mirrorLayer = mirrorLayer;
    this.group = new THREE.Group();   // in the main scene (src/main.js)
    this.group.visible = false;
    this.above = [];
    this.built = false;
    this.shown = false;
    this.culledFor = new THREE.Matrix4().makeScale(0, 0, 0);
    this.culledProjection = new THREE.Matrix4();
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.sphere = new THREE.Sphere();
    // Until it is built, one far palm on the near motu stands for all of it: the warm-up compiles both programs on it.
    const { leaves, wood, top } = palmGeometry(PALMS[0], LODS[2], seededRandom(SEED, 10));
    const middle = motuMiddle(MOTUS[0]);
    const standIn = [{ x: middle.x, y: MOTU_SAND.height - 0.1, z: middle.z, yaw: 0, scale: 1, phase: 0 }];
    this.instances(leaves, this.leafMaterial, standIn, () => [PALMS[0].height, 0, top.y, 0]);
    this.instances(wood, this.woodMaterial, standIn, () => [PALMS[0].height, 0, top.y, 0]);
  }

  /** Builds the whole of it (src/main.js shows it): what stands where, every mesh, the stand-in let go. */
  build() {
    for (const mesh of this.above) {
      mesh.geometry.dispose();
      mesh.dispose();
      this.group.remove(mesh);
    }
    this.above = [];
    this.built = true;
    const { palms, scrub, fallen } = placeScenery(seededRandom(SEED, 1));
    this.placed = { palms, scrub, fallen };   // for the probes
    // The palms: every variant at each level, its instances those placed at that level.
    for (const [variantIndex, variant] of PALMS.entries()) {
      for (const [level, lod] of LODS.entries()) {
        const here = palms.filter((placed) => placed.variant === variantIndex && levelOf(placed) === level);
        if (here.length === 0) continue;
        const { leaves, wood, top } = palmGeometry(variant, lod, seededRandom(SEED, 10 + variantIndex));
        this.instances(leaves, this.leafMaterial, here, (placed) => [variant.height, placed.phase, top.y, 0]);
        this.instances(wood, this.woodMaterial, here, (placed) => [variant.height, placed.phase, top.y, placed.shade]);
      }
    }
    // The scrub, at its levels, as the palms are.
    for (const level of [0, 1, 2]) {
      const here = scrub.filter((placed) => levelOf(placed) === level);
      if (here.length > 0) this.instances(scrubGeometry(level, seededRandom(SEED, 30 + level)), this.leafMaterial, here, (placed) => [SCRUB.height, placed.phase, SCRUB.height * 0.4, placed.shade]);
    }
    // The fallen coconuts, the motus' sand and the high island: one instance each of geometry laid out in the world.
    const still = [{ x: 0, y: 0, z: 0, yaw: 0, scale: 1, phase: 0 }];
    if (fallen.length > 0) this.instances(fallenGeometry(fallen, seededRandom(SEED, 40)), this.woodMaterial, still, () => [1, 0, 0, 0]);
    this.instances(motuSandGeometry(), this.woodMaterial, still, () => [1, 0, 0, 0]);
    this.instances(islandGeometry(), this.woodMaterial, still, () => [1, 0, 0, 0]);
  }

  /**
   * An instanced mesh of `geometry` for each of `placed` (x, y, z, yaw,
   * scale), its palm's numbers from `numbers`. All of them are kept
   * (`whole`: each one's matrix, numbers and bounding sphere), and those in
   * view are packed at the front of its instances by `cull`.
   */
  instances(geometry, material, placed, numbers) {
    const mesh = new THREE.InstancedMesh(geometry, material, placed.length);
    const whole = { matrices: new Float32Array(placed.length * 16), numbers: new Float32Array(placed.length * 4), spheres: new Float32Array(placed.length * 4) };
    const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), scale = new THREE.Vector3(), at = new THREE.Vector3(), sphere = new THREE.Sphere();
    for (const [index, one] of placed.entries()) {
      turn.setFromAxisAngle(UP, -one.yaw);
      scale.setScalar(one.scale);
      at.set(one.x, one.y, one.z);
      matrix.compose(at, turn, scale).toArray(whole.matrices, index * 16);
      whole.numbers.set(numbers(one), index * 4);
      sphere.copy(geometry.boundingSphere).applyMatrix4(matrix);
      whole.spheres.set([sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius + CULL_MARGIN * one.scale], index * 4);
    }
    mesh.instanceMatrix.array.set(whole.matrices);
    geometry.setAttribute('palmInstance', new THREE.InstancedBufferAttribute(whole.numbers.slice(), 4));
    mesh.userData.whole = whole;
    mesh.layers.enable(this.mirrorLayer);
    mesh.frustumCulled = false;   // culled one by one (cull)
    this.above.push(mesh);
    this.group.add(mesh);
  }

  /**
   * Keeps of each mesh's instances only those `camera` sees, or sees in the
   * water's mirror (each one's sphere turned over about the water), packed at
   * the front: one draw a mesh, as many instances as are in view. Done again
   * only when the camera has moved, as the mirror image is.
   */
  cull(camera) {
    if (!this.shown) return;
    if (this.culledFor.equals(camera.matrixWorld) && this.culledProjection.equals(camera.projectionMatrix)) return;
    this.culledFor.copy(camera.matrixWorld);
    this.culledProjection.copy(camera.projectionMatrix);
    const frustum = this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sphere = this.sphere;
    for (const mesh of this.above) {
      const { matrices, numbers, spheres } = mesh.userData.whole;
      const packedMatrices = mesh.instanceMatrix.array, numbersAttribute = mesh.geometry.attributes.palmInstance, packedNumbers = numbersAttribute.array;
      let kept = 0;
      for (let index = 0; index < spheres.length / 4; index++) {
        sphere.center.set(spheres[index * 4], spheres[index * 4 + 1], spheres[index * 4 + 2]);
        sphere.radius = spheres[index * 4 + 3];
        let seen = frustum.intersectsSphere(sphere);
        if (!seen) { sphere.center.y = -sphere.center.y; seen = frustum.intersectsSphere(sphere); }
        if (!seen) continue;
        if (kept !== index) {
          packedMatrices.set(matrices.subarray(index * 16, index * 16 + 16), kept * 16);
          packedNumbers.set(numbers.subarray(index * 4, index * 4 + 4), kept * 4);
        }
        kept++;
      }
      mesh.count = kept;
      mesh.visible = kept > 0;
      mesh.instanceMatrix.needsUpdate = true;
      numbersAttribute.needsUpdate = true;
    }
  }

  material(kind, envTexture) {
    const leaves = kind === 'leaves';
    const made = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: leaves ? 0.72 : 0.88, metalness: 0, envMap: envTexture, envMapIntensity: leaves ? 0.45 : 0.8,
      side: leaves ? THREE.DoubleSide : THREE.FrontSide, map: leaves ? this.atlas.texture : null, alphaTest: leaves ? 0.5 : 0,
    });
    if (leaves) made.defines = { PALM_LEAVES: '' };
    made.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PALM_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PALM_MOVE}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  vPalmWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
      if (leaves) {
        // The leaf's normal bent out from the crown's middle (palmInstance.z up the palm's axis, about), so the crown
        // shades as a mass.
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  {
    vec3 fromCrown = normalize(position - vec3(0.0, palmInstance.z, 0.0) * 0.98 + vec3(0.0, 0.6, 0.0));
    objectNormal = normalize(mix(objectNormal, fromCrown, ${LEAF_LIGHT.crown.toFixed(2)}));
  }`);
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vPalmRing;
varying float vPalmShade;
varying vec3 vPalmLocal;
varying vec3 vPalmWorld;
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;`)
        // The sand's light from below (GROUND_BOUNCE): its radiance as the land's shader draws it (albedo times its light).
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    vec3 sandLight = ${GROUND_BOUNCE.toFixed(2)} * (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * ${SKY_LIGHT.toFixed(2)});
    float below = 0.5 - 0.5 * inverseTransformDirection(normal, viewMatrix).y;
    reflectedLight.indirectDiffuse += BRDF_Lambert(diffuseColor.rgb) * sandLight * below * smoothstep(400.0, 150.0, length(vPalmWorld - cameraPosition));   // three.js's Lambert carries the 1/π the land's light leaves out; the far land stands over water
  }`)
        // The forest's shade (CANOPY): the sun kept off by the crowns over it, and most of the sky.
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  reflectedLight.directDiffuse *= 1.0 - ${CANOPY.sun.toFixed(2)} * vPalmShade;
  reflectedLight.directSpecular *= 1.0 - ${CANOPY.sun.toFixed(2)} * vPalmShade;
  reflectedLight.indirectDiffuse *= 1.0 - ${CANOPY.sky.toFixed(2)} * vPalmShade;`)
        // The air's haze (AERIAL): the sky's colour at the horizon behind, by the distance.
        .replace('#include <fog_fragment>', `#include <fog_fragment>
  #ifdef ENVMAP_TYPE_CUBE_UV
  {
    vec3 toPoint = vPalmWorld - cameraPosition;
    float distanceTo = length(toPoint);
    vec3 horizon = normalize(vec3(toPoint.x, 0.03 * length(toPoint.xz), toPoint.z));
    vec3 hazeColor = textureCubeUV(envMap, envMapRotation * horizon, 0.25).rgb;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, 1.0 - exp(-distanceTo / ${AERIAL.toFixed(1)}));
  }
  #endif`);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPalmWorld;');
      if (leaves) {
        // The atlas holds its colours' square roots (bakeAtlas).
        shader.fragmentShader = shader.fragmentShader
          // Its alpha scaled up by the mip level the leaf is drawn from (Ben Golus's mip-scaled alpha test): the mips'
          // averaged alpha falls under the test's half as leaflets blur into the gaps, and a far crown would thin away.
          .replace('#include <map_fragment>', `vec4 atlasTexel = texture2D(map, vMapUv);
  vec2 atlasTexels = vMapUv * vec2(${ATLAS.width.toFixed(1)}, ${ATLAS.height.toFixed(1)});
  float atlasMip = max(0.5 * log2(max(dot(dFdx(atlasTexels), dFdx(atlasTexels)), dot(dFdy(atlasTexels), dFdy(atlasTexels)))), 0.0);
  diffuseColor *= vec4(atlasTexel.rgb * atlasTexel.rgb, atlasTexel.a * (1.0 + ${ALPHA_MIP.toFixed(2)} * atlasMip));`)
          // The sun through the leaf where it lights the far side.
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  #if NUM_DIR_LIGHTS > 0
    float palmThrough = max(dot(-normal, directionalLights[0].direction), 0.0);
    reflectedLight.directDiffuse += palmThrough * ${LEAF_LIGHT.through.toFixed(2)} * directionalLights[0].color * diffuseColor.rgb * vec3(${LEAF_LIGHT.tint.map((value) => value.toFixed(2)).join(', ')});
  #endif`);
      } else {
        // The trunk's rings, the scars of fallen fronds about every TRUNK.ring up it: a narrow dark groove between
        // broad paler bands, unevenly spaced and a little tilted, as a year's growth leaves them; and its bark's fine
        // vertical fissures.
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (vPalmRing >= 0.0) {
    float trunkAngle = atan(vPalmLocal.z, vPalmLocal.x);
    float ringPhase = vPalmRing / ${TRUNK.ring.toFixed(3)} + 0.35 * sin(vPalmRing * 0.9) + 0.12 * sin(trunkAngle + vPalmRing * 0.7);
    float ringBlur = fwidth(ringPhase) + 0.05;
    float fromGroove = min(fract(ringPhase), 1.0 - fract(ringPhase));
    float groove = 1.0 - smoothstep(0.05, 0.14 + ringBlur, fromGroove);
    diffuseColor.rgb *= mix(1.0, 0.58, groove * (1.0 - smoothstep(0.4, 1.2, ringBlur)));
    float fissure = sin(trunkAngle * 23.0 + sin(vPalmRing * 3.1) * 1.5);
    diffuseColor.rgb *= 1.0 - 0.12 * smoothstep(0.6, 1.0, fissure) * (1.0 - smoothstep(0.3, 1.0, fwidth(fissure)));
  }`);
      }
    };
    made.customProgramCacheKey = () => `tropics-${kind}`;
    return made;
  }

  /**
   * Shown at the Polynesian lagoon, hidden elsewhere; built the first time
   * it is shown (as a game streams a level in), but for the warm-up's
   * (`building` false), which shows the stand-in.
   */
  setVisible(visible, { building = true } = {}) {
    if (visible && building && !this.built) this.build();
    this.shown = visible;
    this.group.visible = visible;
    for (const mesh of this.above) {
      mesh.visible = visible;
      mesh.count = mesh.userData.whole.numbers.length / 4;   // every instance, till the next cull
    }
    if (visible) this.culledFor.makeScale(0, 0, 0);   // culled again at the next frame
  }

  /** The Wind control's strength (WIND_STRENGTHS in src/ambientWaves.js) and the direction it blows toward (x, z). */
  setWind(strength, direction) {
    this.uniforms.uPalmWind.value = strength;
    if (direction) this.uniforms.uPalmWindDirection.value.set(direction[0], direction[1]).normalize();
  }

  /** The world time (s), for the sway. */
  setTime(time) { this.uniforms.uPalmTime.value = time; }

  /** The sky's map (src/sky.js fills it in place; a new object comes with a new place). */
  setEnvironment(texture) {
    for (const material of [this.leafMaterial, this.woodMaterial]) {
      if (material.envMap === texture) continue;
      material.envMap = texture;
      material.needsUpdate = true;
    }
  }
}

/** A palm's or a mound's level of detail: by its distance from the shore view's eye. */
function levelOf(placed) {
  const distance = Math.hypot(placed.x - EYE.x, placed.z - EYE.z);
  return LODS.findLastIndex((lod) => distance >= lod.from);
}
