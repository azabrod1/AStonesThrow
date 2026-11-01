// GLSL for the splash's meshes: the crown sheet (src/crown.js) and the jet
// column (src/jet.js), drawn into the same screen-space fluid targets as the
// droplets (src/shaders/fluid.js, whose header says what each channel holds)
// so the composite shades them and the drops as one water. All passes discard
// fragments hidden by the scene, exactly as the droplets do, and draw both
// faces. Each writes its exact view normal, turned to face the viewer: a
// normal rebuilt from depth would stripe the faceted mesh.
//
// Sheet. A landing drop's crown (aRide = 1) is lifted by the water's height
// under each vertex, splash, ambient waves and rings (src/rings.js)
// together, sampled as the water surface's vertex shader does, so it stands
// on the waves it lands on; a stone's crown rides them along its base row,
// as the cavity's lip it stands on does (src/crown.js). The depth pass
// writes view depth, the sheet's mark (999) and its normal, leaned along
// aRimTangent near the free edge so the bead reflects and glitters like a
// tube. The optics pass adds the water a ray crosses (the sheet thickness
// over the cosine of the view angle, capped) and full coverage for every wall
// the ray passes through, and the wall's aeration: the bead at the rim and
// along the torn edge, whose weight is the length of aRimTangent over
// RIM_LEAN (src/crown.js bends the bead's normal by 1.4 times the weight),
// 1 at the edge, times RIM_AERATION. A stone's crown's fingers (aRod = 1)
// are rods of water, not film: the depth pass marks them as a column's tube
// (998), so the composite shades them as the jet's glass is shaded, their
// normals leaning across them as a rod's do (src/crown.js; the lean adds to
// aRimTangent, so a finger's sides are aerated too, up to 0.86 at its roots).
//
// Froth (SHEET_FROTH; src/crown.js's header says what sets it). A sheet
// thrown up fast is no clean film: it wrinkles, holes open in it as it
// thins, and the faster and bigger the throw the more air it carries and
// the whiter it goes. Each vertex carries its material's place on the sheet
// (aSheet: cos θ and sin θ times the ring's cells, so the ring closes
// without a seam, and its launch time in cells along), which moves and
// stretches with the water, so whatever is drawn in those coordinates is
// carried by the sheet; and aFroth: the share of the light its froth
// scatters (whiteness) and the share of it holes have opened (openness).
// A film ruptures as a real one does: holes nucleate at points and each
// grows as a circle, its rim running back through the film, until the holes
// meet and the film is a web of ligaments between them. So the holes are
// drawn from a field of seeds, one at a hashed place in each cell of
// aSheet times FROTH_HOLE_SCALE (fewer, bigger holes than its cells), each
// seed with a size of its own, FROTH_HOLE_SIZES by the square of a hash (a
// few big holes among many small: holes nucleate at flaws and the first
// grow longest), and holeDistance is the distance to the nearest of the 27
// cells' seeds over that seed's size; a vertex's openness asks for the
// radius the holes have reached: the share of the sheet within r of a seed
// so measured, over 300 000 points on the CPU, is
// 1 − exp(−(r / (0.6715 − 0.0386·u))³) within 0.2% for
// u = cbrt(−ln(1 − open share)), so holeRadius inverts that; where the
// distance is under it, give or take FROTH_RAGGED of the grain (a torn
// edge is ragged), the sheet has a hole. As the openness grows the
// holes widen from the same seeds, so a hole never flickers in and out, and
// what is left between them is the ligaments' web. Each pass takes the
// same holes: the depth pass discards a pixel more hole than sheet, the
// optics pass writes the sheet's share of each pixel (its thickness,
// coverage and aeration times it; the composite divides the aeration by the
// coverage, so the share drawn keeps its whiteness), so a hole's edge is
// antialiased; a hole
// narrower than a pixel or two (the field's footprint in cells, from its
// screen derivatives, over FROTH_FADE) is not drawn but averaged: no pixel
// is discarded and the optics write the open share's mean, so a far sheet
// thins to the right transparency instead of sparkling. Along each hole's
// edge runs its rim, FROTH_RIM cells wide, lumpy (its width times a fine
// noise's 0.5 to 1.5: a rim's own varicose beads), where the Taylor–Culick
// rim has gathered the hole's water and its bubbles: the sheet there is
// thicker by the hole's area over the rim's, r / (2·FROTH_RIM) times
// (gathered, which the optics pass adds to the thickness), and the froth
// densest (FROTH_EDGE_GAIN), so a hole's edge is a bright, dark-cored bead
// and the web between holes a string of them; its mean over the sheet
// (rimMean, the share of the sheet left that lies in the band, measured
// with the radius) is what an unresolved sheet takes. Between the streaks
// the film is nearly clear (FROTH_BASE) on a pebble's sheet and white
// through on a rock's (FROTH_BASE_GAIN times the whiteness cubed: the air
// a sheet takes rises steeply with its Weber number). The froth is also
// patchy at a scale of a few cells (FROTH_PATCH_SCALE, from 0.4 to 1.6
// times its density: the sheet thinner and clearer in places, thicker and
// whiter in others) and grained by a finer noise, each fading
// to its mean as it shrinks below a pixel. The optics pass adds it to
// the bead's aeration; the composite mixes the sheet towards the spray's
// scattering colour by the sum (at most 1). The depth pass also wrinkles the
// normal (the sheet's capillary ripples): a height of WRINKLE_SLOPE (plus
// WRINKLE_FROTH times the whiteness) times the cell's length times a value
// noise at WRINKLE_SCALE of the holes' cells, bumped by the noise's screen
// derivatives (Mikkelsen's surface gradient; the amplitude, itself made of
// derivatives, held constant over the pixel), fading out as the cells shrink
// below a pixel. Fingers (aRod) keep their glass: no holes, no wrinkles,
// half the whiteness; nor does the bead open (its aeration closes the
// holes there). It costs a sheet pixel two to three value noises (eight
// hashes each) per pass.
//
// Column. A closed tube, so the depth pass writes view depth, 998 plus half
// how round the surface is there (aRound: 1 on the end cap and bulb, a lens
// like a sphere; 0 on the tube, a lens only across its axis) and its normal,
// rippled (wrinkledNormal, the sheet's wrinkles' function) by the capillary
// waves a real column always carries, which its mesh does not resolve: a
// value noise over aRipple, the water's own place on the column (its azimuth
// around it and the launch's phase along it, src/jet.js, so the ripples ride
// and stretch with the water; its cells are long around the column and
// short along it, as a column's waves are mostly rings), at a slope of
// COLUMN_RIPPLE_SLOPE, fading out as its cells shrink below a few pixels
// (COLUMN_RIPPLE_FADE: the fluid buffer's pixels are coarse, and a finer
// pattern in its nearest-read normal is stripes). A smooth cylinder shows
// the sky and the pond behind it as hard vertical bands, chrome; rippled,
// the bands waver and break as they do on a real jet. A ray through a cylinder of radius r at offset s crosses
// 2·sqrt(r² − s²) = 2·r·|n·v| of water, as it does through a sphere, so the
// optics pass writes r·|n·v| for each of the two faces it meets, full
// coverage, and half the water's aeration (aAir: the share of the light its
// bubbles scatter, src/jet.js's Air; the two faces add up to it), which the
// composite shades as the sheet's froth, white towards the sun. A column
// narrower than uMinPixelRadius is widened to it along its normals
// (outward), as droplets are, so it never breaks into dashes.
//
// The mirror pass (src/main.js) draws both meshes with these vertex shaders
// and the MIRROR_* fragments of src/shaders/fluid.js.

import { GLSL_COMMON } from './scene.js';
import { GALE_SURFACE } from './gale.js';

// The sheet's froth (the header): its noise, the holes it opens, its
// whiteness and its wrinkles, for the sheet's passes here and the mirror's
// (MIRROR_SHEET_FRAGMENT in src/shaders/fluid.js). Every function takes the
// vertex's aSheet and aFroth as interpolated (vSheet, vFroth) and works out
// its own footprint, so each must be called in uniform control flow (before
// any discard).
export const SHEET_FROTH = /* glsl */`
#define RIM_AERATION 0.55          // how far the rim bead and torn edges whiten
#define FROTH_HOLE_SCALE 0.7       // the holes' seeds' cells per cell of the sheet: fewer, bigger holes
#define FROTH_HOLE_SIZES vec2(0.45, 1.1)   // a seed's size: x + y times the square of its hash
#define FROTH_RADIUS vec2(0.6715, -0.0386)   // the holes' radius for an open share: u·(x + y·u), u = cbrt(−ln(1 − share)) (the header)
#define FROTH_RAGGED 0.2           // a hole's edge wanders by this much of a seed's cell with the grain
#define FROTH_FADE vec2(0.35, 0.9)  // the field's footprint (cells a pixel) over which holes and grain fade to their means
#define FROTH_RIM 0.12             // a hole's rim: the sheet within this many cells (of its seed's size) of its edge...
#define FROTH_RIM_MEAN vec2(0.09, 0.72)  // ...which holds this much of the sheet left (x + y·open share, measured: the header), half of it under the rim's profile
#define FROTH_BASE 0.08            // the froth's density: this much everywhere (a film between its streaks is nearly clear)...
#define FROTH_BASE_GAIN 2.0        // ...plus this times the whiteness cubed (a rock's sheet goes white through, a pebble's stays glass)...
#define FROTH_STREAK 1.3           // ...this much more in its streaks (a quarter of the sheet on average: white water is streaks and lumps, not a frosted pane)...
#define FROTH_EDGE_GAIN 1.2        // ...and this much more along the holes' rims...
#define FROTH_STREAK_SCALE 1.1     // ...the streaks' cells per hole cell around the sheet (a streak is a few mm to a cm wide whatever the stone: wide bands with hard edges read as a flap of card)...
#define FROTH_STREAK_ALONG 0.4     // ...and this share of that along it: drawn out the way the sheet is...
#define FROTH_STREAK_FINE 2.7      // ...ragged by a second noise at this many times the scale, half as strong
#define FROTH_PATCH_SCALE 0.15     // the patches' cells per hole cell...
#define FROTH_PATCH vec2(0.4, 1.6) // ...and the density's range across them
#define FROTH_GRAZE 0.25           // the cosine of the view's angle to the sheet below which the path through it stops growing
#define FROTH_GRAIN_SCALE 3.7      // the grain's cells per hole cell
#define WRINKLE_SCALE 0.6          // the wrinkles' cells per hole cell
#define WRINKLE_SLOPE 0.12         // their slope on a glassy sheet (its folds catch the sky)...
#define WRINKLE_FROTH 0.35         // ...and more by this times the froth's density there (at most 1)
float frothHash(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.zyx + 31.32);
  return fract((point.x + point.y) * point.z);
}
// A cell's seed: where in it (0 to 1 each way) the hole that opens there is centred.
vec3 frothSeed(vec3 cell) {
  vec3 point = fract(cell * vec3(0.1031, 0.1030, 0.0973));
  point += dot(point, point.yxz + 33.33);
  return fract((point.xxy + point.yxx) * point.zyx);
}
// The holes' field: how far the point is (cells) from the nearest seed of the 27 cells about it, over that seed's size.
float holeDistance(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = point - cell;
  float nearest = 16.0;
  for (int dz = -1; dz <= 1; dz++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec3 offset = vec3(float(dx), float(dy), float(dz));
        vec3 seedCell = cell + offset;
        float size = frothHash(seedCell + 7.3);
        size = FROTH_HOLE_SIZES.x + FROTH_HOLE_SIZES.y * size * size;
        nearest = min(nearest, length(offset + frothSeed(seedCell) - local) / size);
      }
    }
  }
  return nearest;
}
// The radius every hole has reached when the sheet is this open (the header's fit).
float holeRadius(float openShare) {
  float u = pow(-log(1.0 - clamp(openShare, 0.0, 0.98)), 1.0 / 3.0);
  return u * (FROTH_RADIUS.x + FROTH_RADIUS.y * u);
}
// The rims' share of the sheet left, under their profile, when the sheet is this open: an unresolved sheet's.
float rimMean(float openShare) {
  return 0.5 * (FROTH_RIM_MEAN.x + FROTH_RIM_MEAN.y * openShare);
}
float frothNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = point - cell;
  vec3 ease = local * local * (3.0 - 2.0 * local);
  float lower = mix(mix(frothHash(cell), frothHash(cell + vec3(1.0, 0.0, 0.0)), ease.x),
                    mix(frothHash(cell + vec3(0.0, 1.0, 0.0)), frothHash(cell + vec3(1.0, 1.0, 0.0)), ease.x), ease.y);
  float upper = mix(mix(frothHash(cell + vec3(0.0, 0.0, 1.0)), frothHash(cell + vec3(1.0, 0.0, 1.0)), ease.x),
                    mix(frothHash(cell + vec3(0.0, 1.0, 1.0)), frothHash(cell + vec3(1.0, 1.0, 1.0)), ease.x), ease.y);
  return mix(lower, upper, ease.z);
}
// The field's footprint: cells across a pixel, the larger of the two screen directions.
float frothFootprint(vec3 sheet) {
  return max(length(dFdx(sheet)), length(dFdy(sheet)));
}
struct SheetFroth {
  float present;     // the sheet's share of the pixel, 0 to 1
  bool hole;         // more hole than sheet, and resolved: the depth pass discards it
  float whiteness;   // the share of the light the froth there scatters, 0 to 1
  float gathered;    // how much thicker the sheet is here with the water its holes' rims gathered (0 off a rim)
};
// facing: the cosine of the view's angle to the sheet. The froth scatters
// along the path through it, so the light it scatters is 1 − exp(−density
// over that cosine): a sheet seen face-on stays clear where one seen edge-on
// goes white.
SheetFroth sheetFroth(vec3 sheet, vec2 froth, float rimAeration, float rod, float facing) {
  SheetFroth result;
  float footprint = frothFootprint(sheet);
  float resolved = 1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint * FROTH_HOLE_SCALE);
  // The grain, a finer noise, and the patches, a coarser one; each averages out as it shrinks below a pixel.
  float grainResolved = 1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint * FROTH_GRAIN_SCALE);
  float grainNoise = frothNoise(sheet * FROTH_GRAIN_SCALE + vec3(3.1, 7.7, 1.3));
  float grain = mix(1.0, 0.6 + 0.8 * grainNoise, grainResolved);
  // No holes open in a finger or the bead.
  float openShare = rod > 0.5 ? 0.0 : froth.y * (1.0 - clamp(rimAeration, 0.0, 1.0));
  float radius = holeRadius(openShare);
  float field = holeDistance(sheet * FROTH_HOLE_SCALE) + FROTH_RAGGED * (grainNoise - 0.5) * grainResolved;
  float past = field - radius;   // cells outside the nearest hole's edge (inside it, negative)
  float edgeWidth = max(fwidth(field), 1e-4);
  float drawn = smoothstep(-edgeWidth, edgeWidth, past);
  result.present = openShare <= 0.0 ? 1.0 : mix(1.0 - openShare, drawn, resolved);
  result.hole = openShare > 0.0 && resolved > 0.5 && drawn < 0.5;
  float patchResolved = 1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint * FROTH_PATCH_SCALE);
  float patchy = mix(1.0, mix(FROTH_PATCH.x, FROTH_PATCH.y, smoothstep(0.3, 0.7, frothNoise(sheet * FROTH_PATCH_SCALE + vec3(23.7, 4.9, 15.2)))), patchResolved);
  // The holes' rims: the band outside each edge, lumpy (the grain sets its width), where the hole's water is gathered.
  float rimWidth = FROTH_RIM * mix(1.0, 0.5 + grainNoise, grainResolved);
  float rim = openShare > 0.0 ? 1.0 - smoothstep(0.0, rimWidth, past) : 0.0;
  float rimShare = mix(rimMean(openShare), rim, resolved);
  result.gathered = rimShare * radius / (2.0 * FROTH_RIM);
  // Densest in streaks and along the rims.
  float streakResolved = 1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint * FROTH_STREAK_SCALE);
  vec3 streakPlace = sheet * vec3(FROTH_STREAK_SCALE, FROTH_STREAK_SCALE, FROTH_STREAK_SCALE * FROTH_STREAK_ALONG);
  float streakNoise = (2.0 * frothNoise(streakPlace + vec3(9.4, 2.2, 6.8)) + frothNoise(streakPlace * FROTH_STREAK_FINE + vec3(5.1, 8.3, 2.9))) / 3.0;
  float streak = mix(0.25, smoothstep(0.4, 0.8, streakNoise), streakResolved);
  float density = froth.x * (FROTH_BASE + FROTH_BASE_GAIN * froth.x * froth.x * froth.x + FROTH_STREAK * streak + FROTH_EDGE_GAIN * rimShare) * grain * patchy * (rod > 0.5 ? 0.5 : 1.0);
  result.whiteness = 1.0 - exp(-density / max(facing, FROTH_GRAZE));
  return result;
}
// The normal (view space, facing the viewer) wrinkled by capillary ripples: a
// value noise over place (a coordinate carried by the water, in the
// ripples' cells) of the given slope (height over the cell's length), fading
// out over fade (cells a pixel, start to end) as the cells shrink towards
// a pixel. The sheet's wrinkles and the column's ripples
// (COLUMN_DEPTH_FRAGMENT) both take it.
vec3 wrinkledNormal(vec3 normal, vec3 viewPosition, vec3 place, float slope, vec2 fade) {
  vec3 sigmaX = dFdx(viewPosition);
  vec3 sigmaY = dFdy(viewPosition);
  float cellsX = length(dFdx(place)), cellsY = length(dFdy(place));
  float footprint = max(cellsX, cellsY);
  // Metres a wrinkle's cell spans, from the same screen steps.
  float cellLength = 0.5 * (length(sigmaX) / max(cellsX, 1e-6) + length(sigmaY) / max(cellsY, 1e-6));
  float faded = 1.0 - smoothstep(fade.x, fade.y, footprint);
  // The amplitude is made of derivatives, so it is held constant over the pixel and only the noise
  // is differentiated: a derivative of a derivative is undefined in GLSL.
  float amplitude = slope * cellLength * faded;
  float wrinkle = frothNoise(place + vec3(41.0, 13.0, 29.0));
  vec3 across = cross(sigmaY, normal);
  vec3 up = cross(normal, sigmaX);
  float determinant = dot(sigmaX, across);
  vec3 gradient = sign(determinant) * amplitude * (dFdx(wrinkle) * across + dFdy(wrinkle) * up);
  vec3 wrinkled = abs(determinant) * normal - gradient;
  return dot(wrinkled, wrinkled) > 0.0 ? normalize(wrinkled) : normal;
}
`;

export const SHEET_VERTEX = /* glsl */`
#define RIM_LEAN 1.4             // the rim tangent's length at the free edge (src/crown.js's bend)
#define SHEET_RING_SPACING 0.01  // metres: the rings' height under a riding vertex, read this smooth (the water surface's own)
attribute float aThickness;
attribute vec3 aRimTangent;
attribute float aRide;
attribute float aRod;
attribute vec3 aSheet;
attribute vec2 aFroth;
uniform sampler2D uHeight;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewRimTangent;
varying float vThickness;
varying float vAeration;
varying float vRod;
varying vec3 vSheet;
varying vec2 vFroth;
${GLSL_COMMON}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (aRide > 0.5) {
    vec2 domainUv = (world.xz - uDomainMin) / uDomainSize + uTexelOffset;
    float surface = texture2D(uHeight, domainUv).r + ambientHeight(world.xz);
    if (uRingCount > 0) surface += ringHeight(world.xz, SHEET_RING_SPACING);
    world.y += surface * patchMask(domainUv);
  }
  // The sheet stands on still water (src/crown.js); the gale lifts it with the surface under it.
  if (uGaleMetresPerUnit > 0.0) world.y += galeLift((modelMatrix * vec4(position, 1.0)).xyz);
  vec4 viewPosition = viewMatrix * world;
  vViewPosition = viewPosition.xyz;
  vViewNormal = normalMatrix * normal;
  vViewRimTangent = normalMatrix * aRimTangent;
  vThickness = aThickness;
  vAeration = clamp(length(aRimTangent) / RIM_LEAN, 0.0, 1.0);
  vRod = aRod;
  vSheet = aSheet;
  vFroth = aFroth;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const SHEET_DEPTH_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewRimTangent;
varying float vAeration;
varying float vRod;
varying vec3 vSheet;
varying vec2 vFroth;
${SHEET_FROTH}
void main() {
  // The froth's derivatives first, while every pixel of the quad still runs.
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
  SheetFroth froth = sheetFroth(vSheet, vFroth, vAeration, vRod, dot(normal, toViewer));
  normal = wrinkledNormal(normal, vViewPosition, vSheet * WRINKLE_SCALE, vRod > 0.5 ? 0.0 : WRINKLE_SLOPE + WRINKLE_FROTH * min(vFroth.x, 1.0), FROTH_FADE);
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth || froth.hole) discard;
  normal = normalize(normal + vViewRimTangent);
  gl_FragColor = vec4(-vViewPosition.z, vRod > 0.5 ? 998.0 : 999.0, normal.xy);
}
`;

export const SHEET_THICKNESS_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vThickness;
varying float vAeration;
varying float vRod;
varying vec3 vSheet;
varying vec2 vFroth;
${SHEET_FROTH}
void main() {
  float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
  SheetFroth froth = sheetFroth(vSheet, vFroth, vAeration, vRod, facing);
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth || froth.hole) discard;
  float aeration = RIM_AERATION * vAeration + froth.whiteness;
  gl_FragColor = froth.present * vec4(vThickness * (1.0 + froth.gathered) / max(facing, 0.33), 1.0, 0.0, aeration);
}
`;

export const COLUMN_VERTEX = /* glsl */`
attribute float aRadius;
attribute float aRound;
attribute float aAir;
attribute vec3 aRipple;          // the water's place on the column, in the ripples' cells (src/jet.js)
uniform float uProjScale;        // pixels per world unit at distance 1
uniform float uMinPixelRadius;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vRadius;
varying float vRound;
varying float vAir;
varying vec3 vRipple;
${GALE_SURFACE}
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  // The column stands on still water (src/jet.js); the gale lifts it with the surface under it.
  if (uGaleMetresPerUnit > 0.0) {
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.y += galeLift(world.xyz);
    viewPosition = viewMatrix * world;
  }
  vec3 viewNormal = normalize(normalMatrix * normal);
  float minRadius = uMinPixelRadius * max(-viewPosition.z, 0.05) / uProjScale;
  viewPosition.xyz += viewNormal * max(minRadius - aRadius, 0.0);
  vViewPosition = viewPosition.xyz;
  vViewNormal = viewNormal;
  vRadius = aRadius;
  vRound = aRound;
  vAir = aAir;
  vRipple = aRipple;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const COLUMN_DEPTH_FRAGMENT = /* glsl */`
#define COLUMN_RIPPLE_SLOPE 0.1    // the column's capillary ripples' slope (the header)...
#define COLUMN_RIPPLE_FADE vec2(0.1, 0.25)   // ...fading out as their cells shrink from ten pixels to four (the buffer's pixels are coarse)
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vRound;
varying vec3 vRipple;
${SHEET_FROTH}
void main() {
  // The ripples' derivatives first, while every pixel of the quad still runs.
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
  // The ripples fade towards the silhouette, where they drew its edge as dashes.
  normal = wrinkledNormal(normal, vViewPosition, vRipple, COLUMN_RIPPLE_SLOPE * smoothstep(0.1, 0.5, dot(normal, toViewer)), COLUMN_RIPPLE_FADE);
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  gl_FragColor = vec4(-vViewPosition.z, 998.0 + 0.5 * clamp(vRound, 0.0, 1.0), normal.xy);
}
`;

export const COLUMN_THICKNESS_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vRadius;
varying float vAir;
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
  // Its aeration, half from each of the ray's two faces (the composite divides by the coverage, at most 1).
  gl_FragColor = vec4(vRadius * facing, 1.0, 0.0, 0.5 * vAir);
}
`;
