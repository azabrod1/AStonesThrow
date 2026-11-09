// The birds drawn (src/birds.js flies them): each bird one skinned mesh, made
// here from its kind's measurements, its skeleton posed on the CPU once a
// frame from its pose, the way a game draws its animals (a skinned mesh, its
// bones set by its own animation code), not a model loaded from a file.
//
// The skeleton (BONES): the body's middle (root, placed and turned in the
// world: heading, pitch, bank), two bones of neck and the head, each wing's
// shoulder, elbow and wrist, and each leg's hip. It is bound in flight's
// pose: the body level, the neck straight out ahead, the wings spread level
// and the legs trailing straight behind. Posed (pose):
//   - the wings beat about the body's long axis (amplitude, a kind's
//     `wing.amplitude`, by `beat`), the hand lagging the arm, and on the
//     upstroke the wrist flexes and the hand sweeps back, as a bird's does so
//     as not to push itself down (Rayner 1988); gliding, each kind's own
//     set (a gull's wings bowed down at the wrist and swept a little, the
//     "M" seen from ahead); folded (`fold`), each wing is swept back along
//     the body, let down and drawn in to a third of its size, so that it
//     lies along the back, as the body's own colours draw the folded wing;
//   - the neck (a heron's): its angles kept from level in the world, so its
//     head stays level as its body tilts: drawn in (neck 0) an S with the
//     head on the shoulders, stretched up (1) tall and nearly straight; the
//     head turns (look) mostly at the head, a little at the neck's base;
//   - the legs (a heron's): from trailing behind (legs 0) to straight down
//     in the world (1), whatever the body's tilt.
//
// What is made (buildKind): a body lofted along its length (each cross
// section an ellipse, the back fuller than the belly, deepest at the breast
// and tapering long to the tail, its outline roughened by a few millimetres:
// `plumage`), the neck and the head lofted the same way, the bill a
// tapering ellipse deep and narrow; the tail a thin fan; each wing an
// airfoil (thick at the root, thin at the tip, cambered) lofted along its
// span over its planform (its leading edge and chord along it), a heron's
// tip parted into fingers (its primaries' slots), a gull's pointed; a
// heron's legs thin tubes with toes, its crest two thin plumes and its
// breast plumes a fringe hanging from the lower neck (plumes). Its colours
// are its vertex colours (linear RGB), each part painted by where on it a
// vertex is: a heron grey above with black flight feathers, white neck
// streaked black down its front, a black crest from the eye back, a yellow
// bill and yellow brown legs; a gull white with a pale grey back and wings,
// black wing tips with white spots (its "mirrors"), a white trailing edge
// and a yellow bill with a red spot.
//
// Its feathers are drawn per pixel (BIRD_FEATHERS, from each vertex's
// `feather` and `featherScale`): rows of overlapping contour feathers, longer
// than wide, over the body, neck and head and as the wing's coverts, each
// lit at its tip and shadowed under the next, its relief bending the normal;
// the flight feathers and the tail's as vanes side by side with their
// shafts, the trailing edge and the tail's end cut into each feather's
// rounded tip, each its own length (discarded), so the outline is feathers
// and not a smooth curve; the plumes cut into strands; a leg's scales. Each
// fades out once finer than a pixel or two. Lit as the things thrown are
// (MeshStandardMaterial: the sun's light and the sky's map), matte as
// feathers are, and the thin vanes let the sun through from behind, as a
// bird's wings glow overhead.
//
// Three meshes a bird, sharing its skeleton and three materials every bird
// shares (so every bird of every kind is the same three programs): `above`
// in the main scene; `mirror` on the mirror's layer, its distance in alpha
// (src/boulders.js sceneryShader), which src/main.js draws again only while
// a bird in its view moves (mirrorBounds); and, for a bird that wades,
// `below` in the under-water pass, clipped to the water and seen through
// it, so its legs show in the water. The materials are kept for the page's
// life (warmUp draws them under the veil), so a change of place builds no
// program. A frame costs a skeleton's bones a bird on the CPU and two or
// three draw calls a bird.
import * as THREE from 'three';
import { BIRD_KINDS } from './birds.js';
import { sceneryShader } from './boulders.js';

const degrees = THREE.MathUtils.degToRad;
const linear = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);   // a colour given in sRGB, kept linear

// Bones, by index (the header).
const ROOT = 0, NECK_BASE = 1, NECK_TOP = 2, HEAD = 3, LEFT_SHOULDER = 4, LEFT_ELBOW = 5, LEFT_WRIST = 6, RIGHT_SHOULDER = 7, RIGHT_ELBOW = 8, RIGHT_WRIST = 9, LEFT_HIP = 10, RIGHT_HIP = 11;
const BONE_COUNT = 12;
// What a vertex's feathers are (its `feather` attribute's first value; BIRD_FEATHERS draws each): smooth (none: the
// bill, the eye), contour feathers (body, neck, head), the tail's, the wing's (coverts and flight feathers), a leg's
// scales, a heron's plumes.
const PART = { smooth: 0, contour: 1, tail: 2, wing: 3, leg: 4, plume: 5 };

/** A smooth bump field, −1 to 1, over metres along and round a part: plumage lying a few millimetres proud here and there. */
function plumage(along, round) {
  return 0.5 * Math.sin(along * 61 + Math.sin(round * 37) * 1.3) * Math.sin(round * 53 + along * 17) + 0.5 * Math.sin(along * 23 - round * 29 + 1.7);
}

// Each kind's build: its body (m: from the tail's root to the breast, its half width and half height), neck (where it
// leaves the body, its two lengths and radii), head (its length and radii), bill (its length, depth, width), tail
// (its length and widths), wing (where the shoulder is, the elbow's and the wrist's distances out from it, the tip's,
// its chord at the root, the wrist and towards the tip, its leading edge's sweep, its thickness, a heron's fingers),
// its legs (hip, length, radii, toes) and its colours; how its wings beat and glide.
const KINDS = {
  heron: {
    body: { from: -0.24, to: 0.2, width: 0.086, height: 0.094, keel: 0.012 },
    neck: { base: [0.15, 0.035], lengths: [0.15, 0.17], radius: [0.036, 0.017] },
    head: { length: 0.1, width: 0.025, height: 0.03 },
    bill: { length: 0.135, depth: 0.026, width: 0.016 },
    tail: { length: 0.06, width: [0.07, 0.075], droop: 0.6 },
    wing: { shoulder: [0.06, 0.05, 0.07], elbow: 0.16, wrist: 0.4, tip: 0.81, chord: [0.3, 0.3, 0.2], sweep: [0.12, 0.14, -0.02], thickness: [0.028, 0.006], camber: 0.014, fingers: 6 },
    legs: { hip: [0.0, -0.06, 0.035], length: 0.572, radius: [0.013, 0.0065], feathered: 0.09, toe: 0.08 },
    colors: {
      back: linear(112, 116, 120), flight: linear(44, 46, 50), white: linear(222, 221, 214), pale: linear(176, 177, 176),
      black: linear(22, 22, 25), bill: linear(206, 160, 66), legs: linear(138, 118, 84), under: linear(140, 143, 147),
    },
    flight: { amplitude: degrees(36), hand: degrees(18), lag: 0.7, flex: degrees(28), dihedral: degrees(0), droop: degrees(-8), sweep: degrees(4) },
    feathers: { body: 0.022, neck: 0.011, head: 0.0065, covert: 0.02, flight: 0.034, notch: 0.022, covertEnd: 0.42, tail: 0.018, plume: 0.007 },
    radius: 1.05,   // m: a sphere about its root holding all of it, standing or flying (its mirror image's bounds)
  },
  gull: {
    body: { from: -0.17, to: 0.15, width: 0.06, height: 0.066, keel: 0.01 },
    neck: { base: [0.11, 0.02], lengths: [0.03, 0.03], radius: [0.042, 0.037] },
    head: { length: 0.088, width: 0.036, height: 0.04 },
    bill: { length: 0.055, depth: 0.017, width: 0.01 },
    tail: { length: 0.1, width: [0.06, 0.088], droop: 0 },
    wing: { shoulder: [0.04, 0.03, 0.048], elbow: 0.12, wrist: 0.3, tip: 0.66, chord: [0.17, 0.155, 0.1], sweep: [0.07, 0.09, -0.1], thickness: [0.02, 0.004], camber: 0.01, fingers: 0 },
    legs: null,
    colors: {
      back: linear(168, 178, 188), flight: linear(150, 160, 170), white: linear(240, 240, 236), pale: linear(225, 226, 224),
      black: linear(18, 18, 20), bill: linear(236, 198, 62), red: linear(200, 40, 30), under: linear(232, 233, 232),
    },
    flight: { amplitude: degrees(30), hand: degrees(16), lag: 0.6, flex: degrees(24), dihedral: degrees(7), droop: degrees(-12), sweep: degrees(14) },
    feathers: { body: 0.014, neck: 0.009, head: 0.0055, covert: 0.013, flight: 0.024, notch: 0.007, covertEnd: 0.5, tail: 0.016, plume: 0 },
    radius: 0.8,
  },
};

// The feathers, per pixel (every bird material's fragment shader; the header): from each vertex's `feather` (its part
// and where on it, m) and `featherScale` (the part's feather sizes, m).
//   - Contour feathers (body, neck, head; a wing's coverts): rows of overlapping feathers, their tips pointing back,
//     each tip's outline an arc (the row's line bowed back in each feather's middle); a feather is lit at its tip and
//     shadowed toward its base under the tip of the one ahead, its sides parted by a fine line, its vane streaked by its
//     barbs, each a little lighter or darker than the next; and it stands proud of the one behind (birdRelief: the
//     normal is bent by its slope, as a bump map bends it, so the light catches the tips).
//   - Flight feathers (a wing behind its coverts) and the tail's: vanes side by side, each overlapping the next, its
//     shaft a line along it; the trailing edge cut into each feather's rounded tip (discarded), so the wing's and the
//     tail's outline is feathers, not a smooth curve.
//   - Plumes: a sheet cut into strands, each narrowing to its end and ending at a length of its own.
//   - A leg's bare part: rings of scales.
// Each fades out once a feather is smaller than a couple of pixels (its footprint, fwidth), where it would only shimmer.
const BIRD_FEATHERS = /* glsl */ `
varying vec4 vFeather;
varying vec4 vFeatherScale;
float birdHash(vec2 cell) { return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453); }
// Rows of overlapping feathers in feather units (x toward the head, their tips pointing back, y across): the shade,
// relief (0 to 1) and how fine it is on the screen (1: drawn; 0: finer than a pixel or two).
vec3 birdContour(vec2 point) {
  float rowGuess = floor(point.x);
  float acrossGuess = fract(point.y + 0.5 * mod(rowGuess, 2.0));
  float bowed = point.x + 0.38 * (1.0 - pow(2.0 * acrossGuess - 1.0, 2.0));
  float row = floor(bowed);
  float shifted = point.y + 0.5 * mod(row, 2.0);
  float column = floor(shifted);
  vec2 within = vec2(bowed - row, shifted - column);
  float seed = birdHash(vec2(row, column));
  float shade = 1.03 - 0.11 * smoothstep(0.45, 1.0, within.x);   // lit at its tip, shadowed under the next
  shade *= 1.0 - 0.04 * (1.0 - smoothstep(0.0, 0.08, min(within.y, 1.0 - within.y)));   // the parting between feathers
  shade *= 0.985 + 0.015 * sin(within.y * 41.0 + within.x * 7.0);   // its barbs
  shade *= 0.96 + 0.08 * seed;
  float footprint = max(fwidth(point.x), fwidth(point.y));
  return vec3(shade, 1.0 - within.x, 1.0 - smoothstep(0.22, 0.6, footprint));
}
// Vanes side by side across index (one a feather), each one's tip cut round, notch deep, at ahead m from the trailing
// edge: whether this point is cut away, then the shade, relief and fineness.
vec4 birdVanes(float index, float ahead, float notch) {
  float across = fract(index);
  float seed = birdHash(vec2(floor(index), 3.0));
  // Each tip its own: some longer, some worn, its round leaning a little to one side.
  float lean = 2.0 * across - 1.0 + 0.3 * (seed - 0.5);
  float tipCut = notch * (0.35 + 0.65 * seed) * (1.0 - sqrt(max(1.0 - lean * lean, 0.0)));
  float shade = 1.04 - 0.1 * smoothstep(0.1, 1.0, across);   // each overlaps the next: shadowed toward its edge under it
  shade *= 1.0 - 0.06 * (1.0 - smoothstep(0.0, 0.03, abs(across - 0.2)));   // its shaft
  shade *= 0.985 + 0.015 * sin(across * 63.0 + ahead * 300.0);
  shade *= 0.97 + 0.06 * seed;
  return vec4(ahead < tipCut ? 1.0 : 0.0, shade, 1.0 - across, 1.0 - smoothstep(0.22, 0.6, fwidth(index)));
}
`;

/** Builds one kind's mesh: positions, colours, skin indices and weights, triangles. */
class Builder {
  constructor() {
    this.positions = [];
    this.colors = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.feather = [];
    this.featherScale = [];
    this.indices = [];
  }
  get count() { return this.positions.length / 3; }
  /**
   * A vertex: where it is, its colour, its bones and weights, and its
   * feathers (`feather`: the part, FEATHER_PARTS, and where on it, in metres,
   * as BIRD_FEATHERS reads them; `scale`: the part's feather sizes).
   */
  vertex(point, color, weights, feather = [PART.smooth, 0, 0, 0], scale = [1, 1, 1, 1]) {
    this.positions.push(point[0], point[1], point[2]);
    this.feather.push(...feather);
    this.featherScale.push(...scale);
    this.colors.push(color.r, color.g, color.b);
    // Up to four bones, by weight, normalised.
    const sorted = weights.filter(([, weight]) => weight > 1e-4).sort((first, second) => second[1] - first[1]).slice(0, 4);
    const total = sorted.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    for (let slot = 0; slot < 4; slot++) {
      this.skinIndex.push(sorted[slot] ? sorted[slot][0] : 0);
      this.skinWeight.push(sorted[slot] ? sorted[slot][1] / total : 0);
    }
  }
  /** A grid of `rows` × `columns` vertices from `first` on, joined into quads; `wrap` joins the last column to the first. */
  grid(first, rows, columns, wrap, flip = false) {
    const across = wrap ? columns : columns - 1;
    for (let row = 0; row < rows - 1; row++) {
      for (let column = 0; column < across; column++) {
        const next = (column + 1) % columns;
        const here = first + row * columns + column, beside = first + row * columns + next, below = first + (row + 1) * columns + column, diagonal = first + (row + 1) * columns + next;
        if (flip) this.indices.push(here, beside, below, beside, diagonal, below);
        else this.indices.push(here, below, beside, beside, below, diagonal);
      }
    }
  }
  /**
   * A tube along `path(along)` (along from 0 to 1, `rows` sections), each section an
   * ellipse `section(along)` = [half width, half height, how much fuller the top
   * is than the bottom] across it, `around` points, coloured `color(along,
   * angle)` (angle 0 at the right, π/2 at the top) and weighted `weights(along,
   * point)`, its feathers `part` at `scale` (vertex), laid out in metres
   * along it (`length`) and round it from its seam under it. Its ends are
   * closed by a point each. `rough` (m) roughens its outline a little, as
   * plumage is never a smooth solid.
   */
  tube({ path, section, rows, around, color, weights, up = [0, 1, 0], part = PART.smooth, scale = [1, 1, 1, 1], length = 0, rough = 0 }) {
    const first = this.count;
    const tangent = new THREE.Vector3(), side = new THREE.Vector3(), upward = new THREE.Vector3(), reference = new THREE.Vector3();
    const centres = [];
    for (let row = 0; row < rows; row++) {
      const along = row / (rows - 1);
      const here = path(along), ahead = path(Math.min(along + 1e-3, 1)), behind = path(Math.max(along - 1e-3, 0));
      tangent.set(ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]).normalize();
      reference.set(...up);
      if (Math.abs(tangent.dot(reference)) > 0.9) reference.set(1, 0, 0);
      side.crossVectors(tangent, reference).normalize();
      upward.crossVectors(side, tangent).normalize();
      const [halfWidth, halfHeight, fuller = 0] = section(along);
      centres.push(here);
      // Round from the seam under it (−π/2) and back to it, the seam's vertex twice so its feathers run on unbroken.
      const girth = Math.PI * (halfWidth + halfHeight);
      for (let step = 0; step <= around; step++) {
        const angle = (step / around) * Math.PI * 2 - Math.PI / 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const ruffle = 1 + (rough / Math.max(halfWidth, 1e-3)) * plumage(along * length, angle * girth / (2 * Math.PI));
        const height = halfHeight * sin * (sin > 0 ? 1 + fuller : 1 - fuller) * ruffle;
        const width = halfWidth * cos * ruffle;
        const point = [here[0] + side.x * width + upward.x * height, here[1] + side.y * width + upward.y * height, here[2] + side.z * width + upward.z * height];
        this.vertex(point, color(along, angle), weights(along, point), [part, along * length, (step / around) * girth, length], scale);
      }
    }
    this.grid(first, rows, around + 1, false);
    // The ends, a point each.
    for (const [row, end] of [[0, 0], [rows - 1, 1]]) {
      const centre = this.count;
      this.vertex(centres[row], color(end, -Math.PI / 2), weights(end, centres[row]), [part, end * length, 0, length], scale);
      for (let step = 0; step < around; step++) {
        const here = first + row * (around + 1) + step, next = here + 1;
        if (end === 0) this.indices.push(centre, next, here);
        else this.indices.push(centre, here, next);
      }
    }
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    geometry.setAttribute('feather', new THREE.Float32BufferAttribute(this.feather, 4));
    geometry.setAttribute('featherScale', new THREE.Float32BufferAttribute(this.featherScale, 4));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Hermite smoothstep from edge0 to edge1, either way round (edge0 > edge1 falls from 1 to 0). */
const smooth = (edge0, edge1, value) => { const share = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1); return share * share * (3 - 2 * share); };
const mix = (from, to, share) => from + (to - from) * share;
const blend = (first, second, share) => first.clone().lerp(second, share);

/** Where each bone stands in the bind pose (flight's), in the bird's frame: +x ahead, +y up, +z to its right. */
function bindPoints(build) {
  const { neck, wing, legs } = build;
  const points = new Array(BONE_COUNT).fill(null).map(() => [0, 0, 0]);
  points[NECK_BASE] = [neck.base[0], neck.base[1], 0];
  points[NECK_TOP] = [neck.base[0] + neck.lengths[0], neck.base[1], 0];
  points[HEAD] = [neck.base[0] + neck.lengths[0] + neck.lengths[1], neck.base[1], 0];
  for (const [shoulder, elbow, wrist, side] of [[LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST, -1], [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, 1]]) {
    points[shoulder] = [wing.shoulder[0], wing.shoulder[1], side * wing.shoulder[2]];
    points[elbow] = [wing.shoulder[0], wing.shoulder[1], side * (wing.shoulder[2] + wing.elbow)];
    points[wrist] = [wing.shoulder[0], wing.shoulder[1], side * (wing.shoulder[2] + wing.wrist)];
  }
  if (legs) {
    points[LEFT_HIP] = [legs.hip[0], legs.hip[1], -legs.hip[2]];
    points[RIGHT_HIP] = [legs.hip[0], legs.hip[1], legs.hip[2]];
  }
  return points;
}

/**
 * A fringe of plumes: a sheet curved round an axis (`path(along)`, along
 * from its root to its ends, in the bird's frame), `radius(along)` (m) out
 * from it, over the angles `spread` either side of `facing` (rad round the
 * axis in its cross section: −π/2 below it, π/2 above), its colour paling
 * to `tip`: BIRD_FEATHERS cuts it into strands of `scale[0]` metres, each
 * narrowing to an end of its own.
 */
function plumes(builder, { path, radius, facing, spread, color, tip, scale, weights }) {
  const rows = 12, columns = 13;
  const length = Array.from({ length: rows - 1 }, (unused, row) => {
    const here = path(row / (rows - 1)), next = path((row + 1) / (rows - 1));
    return Math.hypot(next[0] - here[0], next[1] - here[1], next[2] - here[2]);
  }).reduce((sum, piece) => sum + piece, 0);
  const first = builder.count;
  for (let row = 0; row < rows; row++) {
    const along = row / (rows - 1);
    const centre = path(along), out = radius(along);
    for (let column = 0; column < columns; column++) {
      const angle = facing + spread * (2 * column / (columns - 1) - 1);
      const point = [centre[0], centre[1] + out * Math.sin(angle), centre[2] + out * Math.cos(angle)];
      builder.vertex(point, blend(color, tip, along * along), weights(point), [PART.plume, along * length, (column / (columns - 1)) * 2 * spread * radius(0.5), length], scale);
    }
  }
  builder.grid(first, rows, columns, false);
}

/** A kind's mesh in the bind pose (the header). */
function buildKind(name) {
  const build = KINDS[name];
  const { body, neck, head, bill, tail, wing, legs, colors } = build;
  const builder = new Builder();
  const heron = name === 'heron';
  const bodyLength = body.to - body.from;
  const sizes = build.feathers;
  const contour = (size, longer) => ({ part: PART.contour, scale: [size, longer, 0, 0] });

  // The body: deepest ahead of its middle, at the breast, tapering long to the tail as the folded wings run back over it,
  // a keel under it; its colours the folded wings' along its sides and back; its outline roughened a little.
  builder.tube({
    rows: 34, around: 28, ...contour(sizes.body, 2.2), length: bodyLength, rough: 0.0025,
    path: (along) => [body.from + bodyLength * along, body.keel * Math.sin(Math.PI * along) - 0.01 * along, 0],
    section: (along) => {
      const shape = Math.sin(Math.PI * (0.03 + 0.94 * along ** 1.35)) ** 0.6 * (0.85 + 0.15 * along);
      return [body.width * shape, body.height * shape, -0.12];
    },
    color: (along, angle) => {
      const up = Math.sin(angle), out = Math.abs(Math.cos(angle));
      if (heron) {
        // Grey back and folded wings, the primaries' black along the lower edge of the folded wing toward the tail, a
        // black patch at the bend of the wing at the breast's sides; pale grey flanks; white breast below the neck.
        let color = blend(colors.pale, colors.back, smooth(-0.35, 0.15, up));
        const primaries = smooth(0.55, 0.15, along) * smooth(-0.25, -0.05, up) * smooth(0.25, 0.05, up) * out;
        color = blend(color, colors.flight, primaries * 0.9);
        const shoulder = smooth(0.6, 0.72, along) * smooth(0.9, 0.8, along) * smooth(-0.3, 0.0, up) * smooth(0.5, 0.2, up) * out;
        color = blend(color, colors.black, shoulder);
        return blend(color, colors.white, smooth(0.78, 0.95, along) * smooth(0.2, -0.3, up));
      }
      // A gull: white, its back (and folded wing, never seen) grey.
      return blend(colors.white, colors.back, smooth(0.25, 0.6, up) * smooth(0.05, 0.25, along) * smooth(0.95, 0.8, along));
    },
    weights: (along, point) => {
      const neckShare = smooth(neck.base[0] - 0.05, neck.base[0] + 0.02, point[0]);
      return [[ROOT, 1 - neckShare], [NECK_BASE, neckShare]];
    },
  });

  // The neck: from its base inside the breast out to the head, its weights passing from bone to bone along it (all of it
  // on the neck's bones, so none is left behind in the breast as the neck turns up).
  const neckFrom = neck.base[0], neckTo = neck.base[0] + neck.lengths[0] + neck.lengths[1] + 0.01;
  const topAt = neck.base[0] + neck.lengths[0], headAt = neck.base[0] + neck.lengths[0] + neck.lengths[1];
  builder.tube({
    rows: heron ? 26 : 8, around: 14, ...contour(sizes.neck, 1.8), length: neckTo - neckFrom, rough: heron ? 0.0012 : 0.002,
    path: (along) => [mix(neckFrom, neckTo, along), neck.base[1], 0],
    section: (along) => { const radius = mix(neck.radius[0], neck.radius[1], Math.min(along * 2.2, 1) ** 0.7); return [radius * 0.92, radius, 0]; },
    color: (along, angle) => {
      if (!heron) return colors.white;
      // White, grey at the back of the neck, a line of black streaks down its front (angle −π/2 is its front in the bind
      // pose, the neck pointing ahead: its underside becomes its front as it stands).
      const front = Math.max(0, -Math.sin(angle)), back = Math.max(0, Math.sin(angle));
      let color = blend(colors.white, colors.pale, back * 0.8);
      const streak = front ** 8 * (0.5 + 0.5 * Math.sign(Math.sin(along * 60))) * smooth(0.1, 0.3, along) * smooth(0.95, 0.7, along);
      return blend(color, colors.black, streak * 0.85);
    },
    weights: (along, point) => {
      const x = point[0];
      const top = smooth(topAt - 0.03, topAt + 0.03, x), atHead = smooth(headAt - 0.025, headAt + 0.01, x);
      return [[NECK_BASE, 1 - top], [NECK_TOP, top * (1 - atHead)], [HEAD, atHead]];
    },
  });

  // The head: an ellipsoid from just behind the head bone, the crown a little flat; a heron's black stripe from the eye
  // back into its crest; its eye a dark spot.
  const headFrom = headAt - head.length * 0.35;
  builder.tube({
    rows: 14, around: 16, ...contour(sizes.head, 1.4), length: head.length,
    path: (along) => [headFrom + head.length * along, neck.base[1] + 0.004 * Math.sin(Math.PI * along), 0],
    section: (along) => { const shape = Math.sin(Math.PI * (0.05 + 0.9 * along)) ** 0.6; return [head.width * shape, head.height * shape, -0.1]; },
    color: (along, angle) => {
      const up = Math.sin(angle), side = Math.abs(Math.cos(angle));
      const eye = Math.exp(-(((along - 0.68) / 0.06) ** 2) - (((up - 0.25) / 0.18) ** 2)) * side;
      if (heron) {
        const stripe = smooth(0.1, 0.45, up) * smooth(0.82, 0.6, along) * smooth(0.0, 0.25, along);
        const color = blend(colors.white, colors.black, stripe);
        return blend(color, colors.black, smooth(0.5, 0.8, eye));
      }
      return blend(colors.white, colors.black, smooth(0.55, 0.85, eye));
    },
    weights: () => [[HEAD, 1]],
  });
  if (heron) {
    // The crest: two thin black plumes from the back of the head, trailing down behind it.
    for (const sideOffset of [-0.004, 0.004]) {
      builder.tube({
        rows: 8, around: 6,
        path: (along) => [headFrom + 0.02 - 0.11 * along, neck.base[1] + head.height * 0.55 - 0.012 * along * along, sideOffset],
        section: (along) => [0.0035 * (1 - 0.7 * along), 0.0045 * (1 - 0.7 * along), 0],
        color: () => colors.black,
        weights: () => [[HEAD, 1]],
      });
    }
    // The breast plumes: long, loose, pale feathers hanging from the lower neck over the breast, a fringe of strands
    // round the neck's front (below it in the bind pose), from a third of the way up it down past its base, flaring.
    plumes(builder, {
      path: (along) => [mix(neck.base[0] + 0.13, neck.base[0] - 0.07, along), neck.base[1] - 0.012 * along, 0],
      radius: (along) => neck.radius[0] * 1.05 + 0.003 + 0.085 * along * along, facing: -Math.PI / 2, spread: 1.15,
      color: colors.white, tip: colors.pale, scale: [sizes.plume, 0, 0, 0],
      weights: (point) => { const base = smooth(neck.base[0] - 0.03, neck.base[0] + 0.02, point[0]); return [[ROOT, 1 - base], [NECK_BASE, base]]; },
    });
  }
  // The bill: deep and narrow, tapering to a point, a gull's hooked and red spotted near the tip.
  const billFrom = headFrom + head.length * 0.82;
  builder.tube({
    rows: 12, around: 10,
    path: (along) => [billFrom + bill.length * along, neck.base[1] - head.height * 0.12 - (heron ? 0.004 * along : 0.006 * along * along * along), 0],
    section: (along) => { const taper = (1 - along) ** (heron ? 0.9 : 0.6); return [bill.width * 0.5 * taper + 0.0008, bill.depth * 0.5 * taper * (heron ? 1 : 1 + 0.35 * Math.exp(-(((along - 0.75) / 0.12) ** 2))) + 0.0008, 0]; },
    color: (along, angle) => (!heron && along > 0.62 && along < 0.86 && Math.sin(angle) < -0.2 ? colors.red : colors.bill),
    weights: () => [[HEAD, 1]],
  });

  // The tail: a thin fan behind the body.
  builder.tube({
    rows: 10, around: 16, part: PART.tail, scale: [0, sizes.tail, sizes.tail * 0.8, 0], length: tail.length,
    path: (along) => [body.from + 0.03 - tail.length * along, 0.006 - tail.droop * tail.length * along, 0],
    section: (along) => [mix(tail.width[0], tail.width[1], along) * 0.5 * (along > 0.92 ? 0.6 : 1), 0.012 * (1 - 0.6 * along), 0],
    color: () => (heron ? colors.back : colors.white),
    weights: () => [[ROOT, 1]],
  });

  // The wings: an airfoil lofted along the span over the planform.
  for (const [side, shoulderBone, elbowBone, wristBone] of [[-1, LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST], [1, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]]) {
    const spans = 44, around = 14;
    const first = builder.count;
    const rootZ = wing.shoulder[2] - 0.02;
    const span = wing.tip - (rootZ - wing.shoulder[2]);
    for (let row = 0; row < spans; row++) {
      const share = row / (spans - 1);
      const out = rootZ + span * share - wing.shoulder[2];   // m out from the shoulder
      const atWrist = THREE.MathUtils.clamp(out / wing.wrist, 0, 1), onHand = THREE.MathUtils.clamp((out - wing.wrist) / (wing.tip - wing.wrist), 0, 1);
      // The planform: the chord and the leading edge, the hand's rounding to its tip.
      let chord = out <= wing.wrist ? mix(wing.chord[0], wing.chord[1], atWrist) : mix(wing.chord[1], wing.chord[2], onHand);
      chord *= heron ? Math.sqrt(Math.max(1 - onHand ** 6, 0)) : Math.max(1 - onHand ** 1.6, 0) ** 0.8;
      let leading = out <= wing.wrist ? mix(wing.sweep[0], wing.sweep[1], atWrist) : mix(wing.sweep[1], wing.sweep[2], onHand ** 1.4);
      if (wing.fingers && onHand > 0.45) {
        // The primaries' slots: the trailing edge cut back between fingers toward the tip.
        const finger = onHand * wing.fingers * 1.4;
        const slot = (0.5 + 0.5 * Math.cos(2 * Math.PI * finger)) ** 4 * smooth(0.45, 0.65, onHand);
        chord *= 1 - 0.55 * slot;
        leading -= 0.01 * slot;
      }
      chord = Math.max(chord, 0.004);
      const thickness = mix(wing.thickness[0], wing.thickness[1], share);
      for (let step = 0; step < around; step++) {
        // Round the airfoil: the top from the leading edge to the trailing edge, then the bottom back (cosine spacing).
        const angle = (step / around) * Math.PI * 2;
        const along = 0.5 - 0.5 * Math.cos(angle);   // 0 at the leading edge, 1 at the trailing edge
        const top = angle < Math.PI;
        const profile = 2.6 * Math.sqrt(Math.max(along, 0)) * (1 - along) * 0.5;   // a thin airfoil's half thickness, its most a third back
        const camber = wing.camber * 4 * along * (1 - along) * (1 - 0.6 * share);
        const point = [wing.shoulder[0] + leading - chord * along, wing.shoulder[1] + camber + (top ? 1 : -1) * thickness * profile, side * (wing.shoulder[2] + out)];
        // Colours: above, the coverts' grey before the flight feathers; below, the underwing.
        const feathers = along > (heron ? 0.42 : 0.5) || onHand > (heron ? 0.15 : 0.9);
        let color;
        if (heron) {
          color = top ? (feathers ? colors.flight : colors.back) : (feathers ? blend(colors.under, colors.flight, 0.55) : colors.under);
          if (top && out < wing.wrist && along < 0.12 && atWrist > 0.4) color = colors.white;   // the leading edge's white at the wrist
        } else {
          const tipBlack = onHand > 0.55;
          const mirrorSpot = onHand > 0.86 && onHand < 0.94 && along > 0.25 && along < 0.75;
          const trailing = along > 0.86 && onHand < 0.5;
          if (tipBlack) color = mirrorSpot || onHand > 0.985 ? colors.white : colors.black;
          else color = top ? (trailing ? colors.white : colors.back) : colors.under;
        }
        // Weights: the body at the root, then the shoulder, the elbow and the wrist, blended over a few centimetres.
        const rootShare = smooth(-0.02, 0.03, out), elbowShare = smooth(wing.elbow - 0.03, wing.elbow + 0.03, out), wristShare = smooth(wing.wrist - 0.04, wing.wrist + 0.03, out);
        builder.vertex(point, color, [[ROOT, 1 - rootShare], [shoulderBone, rootShare * (1 - elbowShare)], [elbowBone, elbowShare * (1 - wristShare)], [wristBone, wristShare]],
          [PART.wing, out, along, chord], [sizes.covert, sizes.flight, sizes.notch, sizes.covertEnd]);
      }
    }
    builder.grid(first, spans, around, true, side > 0);
  }

  // A heron's legs: from the hip, trailing behind in the bind pose, feathered grey at the top, with three toes ahead
  // and one behind (pointing down in the bind pose: ahead once the leg stands).
  if (legs) {
    for (const [side, hipBone] of [[-1, LEFT_HIP], [1, RIGHT_HIP]]) {
      const hip = [legs.hip[0], legs.hip[1], side * legs.hip[2]];
      builder.tube({
        rows: 16, around: 8,
        path: (along) => [hip[0] - legs.length * along, hip[1], hip[2]],
        section: (along) => { const radius = mix(legs.radius[0], legs.radius[1], Math.min(along * 1.8, 1)) * (Math.abs(along - 0.45) < 0.03 ? 1.25 : 1); return [radius, radius, 0]; },
        color: (along) => (along < legs.feathered / legs.length ? colors.pale : colors.legs),
        weights: () => [[hipBone, 1]],
        part: PART.leg, scale: [0.006, 0, 0, legs.feathered], length: legs.length,
      });
      const foot = [hip[0] - legs.length + 0.004, hip[1], hip[2]];
      for (const [spread, length] of [[-0.45, 1], [0, 1.1], [0.45, 1], [Math.PI, 0.55]]) {
        // Ahead (-y in the bind pose), spread to the sides; the hind toe behind (+y).
        const dirY = -Math.cos(spread), dirZ = Math.sin(spread) * (spread === Math.PI ? 0 : 1);
        builder.tube({
          rows: 5, around: 6,
          path: (along) => [foot[0] - 0.006 * along, foot[1] + dirY * legs.toe * length * along, foot[2] + dirZ * legs.toe * length * along],
          section: (along) => [0.0045 * (1 - 0.6 * along), 0.0035 * (1 - 0.6 * along), 0],
          color: () => colors.legs,
          weights: () => [[hipBone, 1]],
          up: [1, 0, 0],
        });
      }
    }
  }
  return builder.geometry();
}

/** Draws the feathers (BIRD_FEATHERS) into a bird material's shaders. */
function featherShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 feather;\nattribute vec4 featherScale;\nvarying vec4 vFeather;\nvarying vec4 vFeatherScale;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFeather = feather;\n  vFeatherScale = featherScale;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${BIRD_FEATHERS}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  float birdRelief = 0.0;   // m: how far the feathers stand proud here (the normal, below)
  {
    float part = floor(vFeather.x + 0.5);
    if (part == ${PART.contour}.0) {
      // Longer than they are wide, as body feathers lie (featherScale.y: how much longer).
      vec3 feathered = birdContour(vFeather.yz / (vFeatherScale.x * vec2(vFeatherScale.y, 1.0)));
      diffuseColor.rgb *= mix(1.0, feathered.x, feathered.z);
      birdRelief = feathered.y * vFeatherScale.x * 0.07 * feathered.z;
    } else if (part == ${PART.wing}.0) {
      float span = vFeather.y, chordShare = vFeather.z, chord = vFeather.w;
      vec4 vanes = birdVanes(span / vFeatherScale.y, (1.0 - chordShare) * chord, vFeatherScale.z);
      if (vanes.x > 0.5) discard;
      if (chordShare > vFeatherScale.w) {
        diffuseColor.rgb *= mix(1.0, vanes.y, vanes.w);
        birdRelief = vanes.z * vFeatherScale.y * 0.08 * vanes.w;
      } else {
        // The coverts: rows of small feathers from the leading edge back, their tips toward the trailing edge.
        vec3 feathered = birdContour(vec2((1.0 - chordShare) * chord / 1.4, span) / vFeatherScale.x);
        diffuseColor.rgb *= mix(1.0, feathered.x, 0.6 * feathered.z);
        birdRelief = feathered.y * vFeatherScale.x * 0.07 * feathered.z;
      }
    } else if (part == ${PART.tail}.0) {
      vec4 vanes = birdVanes(vFeather.z / vFeatherScale.y, vFeather.w - vFeather.y, vFeatherScale.z);
      if (vanes.x > 0.5) discard;
      diffuseColor.rgb *= mix(1.0, vanes.y, vanes.w);
      birdRelief = vanes.z * vFeatherScale.y * 0.08 * vanes.w;
    } else if (part == ${PART.plume}.0) {
      // Strands: each its own length, narrowing to its end, a little lighter or darker than the next.
      float strand = vFeather.z / vFeatherScale.x;
      float seed = birdHash(vec2(floor(strand), 7.0));
      float reach = vFeather.y / (vFeather.w * (0.55 + 0.45 * seed));
      if (reach > 1.0 || abs(fract(strand) - 0.5) > 0.5 - 0.4 * smoothstep(0.6, 1.0, reach)) discard;
      diffuseColor.rgb *= 0.9 + 0.14 * seed;
      birdRelief = (0.5 - abs(fract(strand) - 0.5)) * vFeatherScale.x * 0.3;
    } else if (part == ${PART.leg}.0 && vFeather.y > vFeatherScale.w) {
      float ring = fract(vFeather.y / vFeatherScale.x);
      diffuseColor.rgb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.12, ring)) * (1.0 - smoothstep(0.2, 0.6, fwidth(vFeather.y / vFeatherScale.x)));
    }
  }`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  #if NUM_DIR_LIGHTS > 0
  {
    // Light through the feathers: a wing's, the tail's and the plumes' vanes are thin, and glow when the sun is behind
    // them, as a bird's wings do overhead; the body's plumage lets a little through at its edges.
    float part = floor(vFeather.x + 0.5);
    float thin = part == ${PART.wing}.0 || part == ${PART.tail}.0 || part == ${PART.plume}.0 ? 0.45 : part == ${PART.contour}.0 ? 0.08 : 0.0;
    float behind = max(0.0, -dot(normal, directionalLights[0].direction));
    reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * behind * thin * RECIPROCAL_PI;
  }
  #endif`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // The feathers' relief bends the normal by its slope on the screen (as three's bump map does, Mikkelsen 2010).
    vec3 sigmaX = dFdx(-vViewPosition), sigmaY = dFdy(-vViewPosition);
    vec3 crossY = cross(sigmaY, normal), crossX = cross(normal, sigmaX);
    float determinant = dot(sigmaX, crossY);
    vec3 gradient = sign(determinant) * (dFdx(birdRelief) * crossY + dFdy(birdRelief) * crossX);
    normal = normalize(abs(determinant) * normal - gradient);
  }`);
}

const turnY = new THREE.Quaternion();
const turnX = new THREE.Quaternion();
const turnZ = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();

/**
 * The birds' meshes: `above` and `mirror` for the main scene (the mirror's
 * on `mirrorLayer` alone), `below` for the under-water pass. show(population)
 * makes a rig for each bird, update(population) poses them, mirrorBounds
 * tells src/main.js where a moving bird's mirror image is.
 */
export function createBirdView({ envTexture, waterFog, mirrorLayer }) {
  const above = new THREE.Group(), below = new THREE.Group(), mirror = new THREE.Group();
  const geometries = new Map();   // a kind's mesh, built when first shown and kept
  const materials = {};
  for (const side of ['above', 'below', 'mirror']) {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      envMap: envTexture,
      envMapIntensity: side === 'below' ? 0.3 : 0.8,
      side: THREE.DoubleSide,
      ...(side === 'below' ? { clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)] } : {}),
    });
    material.onBeforeCompile = (shader) => {
      sceneryShader(shader, side, waterFog);   // below: seen through the water; mirror: its distance in alpha
      featherShader(shader);
    };
    material.customProgramCacheKey = () => `bird-${side}`;
    materials[side] = material;
  }
  let rigs = [];
  const identity = new THREE.Matrix4();

  /** A rig for a bird of `kind`: its bones (bound in flight's pose) and its meshes. */
  function makeRig(kind) {
    if (!geometries.has(kind)) geometries.set(kind, buildKind(kind));
    const build = KINDS[kind];
    const points = bindPoints(build);
    const bones = points.map(() => new THREE.Bone());
    const parents = [null, ROOT, NECK_BASE, NECK_TOP, ROOT, LEFT_SHOULDER, LEFT_ELBOW, ROOT, RIGHT_SHOULDER, RIGHT_ELBOW, ROOT, ROOT];
    for (let index = 0; index < BONE_COUNT; index++) {
      const parent = parents[index];
      const at = points[index], from = parent === null ? [0, 0, 0] : points[parent];
      bones[index].position.set(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
      if (parent !== null) bones[parent].add(bones[index]);
    }
    bones[ROOT].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    const meshes = {};
    for (const side of ['above', 'mirror', ...(build.legs ? ['below'] : [])]) {
      const mesh = new THREE.SkinnedMesh(geometries.get(kind), materials[side]);
      mesh.bind(skeleton, identity);
      mesh.frustumCulled = false;
      if (side === 'mirror') mesh.layers.set(mirrorLayer);
      ({ above, below, mirror })[side].add(mesh);
      meshes[side] = mesh;
    }
    return { kind, build, bones, skeleton, meshes, centre: new THREE.Vector3(), shown: false, still: false };
  }

  function removeRig(rig) {
    for (const [side, mesh] of Object.entries(rig.meshes)) ({ above, below, mirror })[side].remove(mesh);
    rig.skeleton.dispose();
  }

  /** The birds of a place (src/birds.js setPlace): a rig each; the kinds' meshes and the materials are kept. */
  function show(population) {
    for (const rig of rigs) removeRig(rig);
    rigs = population.birds.map((bird) => makeRig(bird.kind));
    update(population);
  }

  /** Each rig posed from its bird's pose (src/birds.js showAt). */
  function update(population) {
    population.birds.forEach((bird, index) => { if (rigs[index]) pose(rigs[index], bird.pose); });
  }

  function pose(rig, at) {
    const { bones, build } = rig;
    for (const mesh of Object.values(rig.meshes)) mesh.visible = at.shown;
    rig.shown = at.shown;
    rig.still = Boolean(at.still);
    if (!at.shown) return;
    const root = bones[ROOT];
    const kind = BIRD_KINDS[rig.kind];
    // Its middle: where it flies, or standing over its feet by its legs (src/birds.js BIRD_KINDS `stand`), lower as it crouches.
    const standing = at.flying === false;
    root.position.set(at.x, standing ? at.y + kind.stand - 0.1 * at.crouch : at.y, at.z);
    euler.set(at.bank, at.heading, at.pitch, 'YZX');
    root.quaternion.setFromEuler(euler);
    // The wings (the header).
    const flight = build.flight;
    const stroke = Math.sin(at.phase), rising = Math.max(0, Math.cos(at.phase));
    const handStroke = Math.sin(at.phase - flight.lag);
    const fold = at.fold;
    for (const [side, shoulder, elbow, wrist] of [[1, LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST], [-1, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]]) {
      // Up is +x for the left wing (out along −z), −x for the right.
      const lift = (flight.dihedral * (1 - at.beat) + at.beat * flight.amplitude * stroke) * (1 - fold) - fold * degrees(40);
      const sweep = (flight.sweep * 0.3 * (1 - at.beat) + at.beat * flight.flex * 0.35 * rising) * (1 - fold) + fold * degrees(80);
      turnY.setFromAxisAngle(Y_AXIS, side * sweep);
      turnX.setFromAxisAngle(X_AXIS, side * lift);
      bones[shoulder].quaternion.copy(turnY).multiply(turnX);
      bones[shoulder].scale.setScalar(1 - 0.95 * fold);
      bones[elbow].quaternion.setFromAxisAngle(Y_AXIS, side * (at.beat * flight.flex * 0.4 * rising) * (1 - fold));
      const handLift = (flight.droop * (1 - at.beat) + at.beat * flight.hand * handStroke) * (1 - fold);
      const handSweep = (flight.sweep * (1 - at.beat) + at.beat * flight.flex * rising) * (1 - fold) + fold * degrees(20);
      turnY.setFromAxisAngle(Y_AXIS, side * handSweep);
      turnX.setFromAxisAngle(X_AXIS, side * handLift);
      bones[wrist].quaternion.copy(turnY).multiply(turnX);
    }
    // The neck and head (the header): a heron's angles from level in the world, less its body's pitch.
    if (rig.kind === 'heron') {
      const baseWorld = mix(degrees(95), degrees(80), at.neck), topWorld = mix(degrees(-40), degrees(75), at.neck), headWorld = mix(degrees(0), degrees(-8), at.neck);
      setPitchYaw(bones[NECK_BASE], baseWorld - at.pitch, at.look * 0.3);
      setPitchYaw(bones[NECK_TOP], topWorld - baseWorld, 0);
      setPitchYaw(bones[HEAD], headWorld - topWorld, at.look * 0.7);
      // Its legs: from trailing, a little down, to straight down in the world.
      // Standing, one leg a little ahead of the other, so both show from the side.
      const legAngle = mix(degrees(10), degrees(90) - at.pitch, at.legs);
      bones[LEFT_HIP].quaternion.setFromAxisAngle(Z_AXIS, legAngle + degrees(5) * at.legs);
      bones[RIGHT_HIP].quaternion.setFromAxisAngle(Z_AXIS, legAngle - degrees(4) * at.legs);
    } else {
      setPitchYaw(bones[NECK_BASE], 0, 0);
      setPitchYaw(bones[NECK_TOP], 0, 0);
      setPitchYaw(bones[HEAD], -0.5 * at.pitch, at.look);
    }
    for (let index = 1; index < BONE_COUNT; index++) if (index !== LEFT_SHOULDER && index !== RIGHT_SHOULDER) bones[index].scale.setScalar(1);
    root.updateMatrixWorld(true);
    rig.centre.copy(root.position);
  }

  function setPitchYaw(bone, pitch, yaw) {
    turnY.setFromAxisAngle(Y_AXIS, yaw);
    turnZ.setFromAxisAngle(Z_AXIS, pitch);
    bone.quaternion.copy(turnY).multiply(turnZ);
  }

  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  /**
   * The bounds of every shown bird that moves (its pose changing: in flight
   * always, a heron standing only while it turns its head or stirs) and that
   * the mirror's camera sees (`frustum`), joined into `into`: how many.
   */
  function mirrorBounds(into, frustum) {
    let moving = 0;
    for (const rig of rigs) {
      if (!rig.shown || rig.still) continue;
      sphere.set(rig.centre, rig.build.radius);
      if (!frustum.intersectsSphere(sphere)) continue;
      into.union(sphere.getBoundingBox(box));
      moving++;
    }
    return moving;
  }

  /** The sky's map (src/sky.js fills it in place once a sky has loaded; a new object comes with a new place). */
  function setEnvironment(texture) {
    for (const material of Object.values(materials)) {
      if (material.envMap === texture) continue;
      material.envMap = texture;
      material.needsUpdate = true;
    }
  }

  /** Under the veil (src/main.js warmUp): a heron standing in the water, in all three passes, so its programs are built; done() takes it away. */
  function warmUp() {
    const rig = makeRig('heron');
    pose(rig, { x: 0, y: -0.2, z: -1.4, heading: 0, pitch: 0.3, bank: 0, phase: 0, beat: 0, fold: 1, neck: 0.5, look: 0, legs: 1, crouch: 0, shown: true, flying: false });
    return { done() { removeRig(rig); } };
  }

  return {
    above, below, mirror,
    show, update, mirrorBounds, setEnvironment, warmUp,
    get drawCalls() { return rigs.reduce((sum, rig) => sum + (rig.shown ? Object.keys(rig.meshes).length : 0), 0); },
    get count() { return rigs.filter((rig) => rig.shown).length; },
  };
}
