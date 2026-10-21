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
// A two-octave value noise in aSheet, n, has its open share P(n < q)
// within 1.6% of smoothstep(FROTH_OPEN_LOW, FROTH_OPEN_HIGH, q) (measured on
// the CPU), so the shader inverts that to find the threshold q a vertex's
// openness asks for: where n < q the sheet has a hole. Each pass takes the
// same holes: the depth pass discards a pixel more hole than sheet, the
// optics pass writes the sheet's share of each pixel (its thickness,
// coverage and aeration times it; the composite divides the aeration by the
// coverage, so the share drawn keeps its whiteness), so a hole's edge is
// antialiased; a hole
// narrower than a pixel or two (the noise's footprint in cells, from its
// screen derivatives, over FROTH_FADE) is not drawn but averaged: no pixel
// is discarded and the optics write the open share's mean, so a far sheet
// thins to the right transparency instead of sparkling. The whiteness is
// brightest along the holes' edges (where a Taylor–Culick rim gathers the
// sheet's water and its bubbles) and grained by a finer noise, both fading
// to their means as they shrink below a pixel. The optics pass adds it to
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
// like a sphere; 0 on the tube, a lens only across its axis) and its smooth
// normal. A ray through a cylinder of radius r at offset s crosses
// 2·sqrt(r² − s²) = 2·r·|n·v| of water, as it does through a sphere, so the
// optics pass writes r·|n·v| for each of the two faces it meets, and full
// coverage. A column narrower than uMinPixelRadius is widened to it along its
// normals (outward), as droplets are, so it never breaks into dashes.
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
#define FROTH_OPEN_LOW 0.205       // the holes' noise: P(n < q) ≈ smoothstep(low, high, q)
#define FROTH_OPEN_HIGH 0.795
#define FROTH_FADE vec2(0.35, 0.9)  // the noise's footprint (cells a pixel) over which holes and grain fade to their means
#define FROTH_EDGE 0.08            // the holes' edges whiten over this much of the noise past the threshold
#define FROTH_EDGE_MEAN 0.62       // the edge's whitening, averaged over the sheet
#define FROTH_BASE 0.3             // the froth's density: this much everywhere...
#define FROTH_STREAK 1.2           // ...this much more in its streaks (half the sheet on average)...
#define FROTH_EDGE_GAIN 0.8        // ...and this much more along the holes' edges...
#define FROTH_STREAK_SCALE 0.45    // ...the streaks' cells per hole cell around the sheet...
#define FROTH_STREAK_ALONG 0.25    // ...and this share of that along it: drawn out the way the sheet is
#define FROTH_GRAZE 0.25           // the cosine of the view's angle to the sheet below which the path through it stops growing
#define FROTH_GRAIN_SCALE 3.7      // the grain's cells per hole cell
#define WRINKLE_SCALE 0.6          // the wrinkles' cells per hole cell
#define WRINKLE_SLOPE 0.08         // their slope on a glassy sheet...
#define WRINKLE_FROTH 0.35         // ...and more by this times the froth's density there (at most 1)
float frothHash(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.zyx + 31.32);
  return fract((point.x + point.y) * point.z);
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
float frothField(vec3 point) {
  return 0.65 * frothNoise(point) + 0.35 * frothNoise(2.13 * point + vec3(17.1, 5.3, 11.7));
}
// The noise's footprint: cells across a pixel, the larger of the two screen directions.
float frothFootprint(vec3 sheet) {
  return max(length(dFdx(sheet)), length(dFdy(sheet)));
}
// The threshold the open share asks for (the inverse of smoothstep(low, high, q)).
float frothThreshold(float openShare) {
  float share = clamp(openShare, 0.0, 0.999);
  return FROTH_OPEN_LOW + (FROTH_OPEN_HIGH - FROTH_OPEN_LOW) * (0.5 - sin(asin(1.0 - 2.0 * share) / 3.0));
}
struct SheetFroth {
  float present;     // the sheet's share of the pixel, 0 to 1
  bool hole;         // more hole than sheet, and resolved: the depth pass discards it
  float whiteness;   // the share of the light the froth there scatters, 0 to 1
};
// facing: the cosine of the view's angle to the sheet. The froth scatters
// along the path through it, so the light it scatters is 1 − exp(−density
// over that cosine): a sheet seen face-on stays clear where one seen edge-on
// goes white.
SheetFroth sheetFroth(vec3 sheet, vec2 froth, float rimAeration, float rod, float facing) {
  SheetFroth result;
  float footprint = frothFootprint(sheet);
  float resolved = 1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint);
  // No holes open in a finger or the bead.
  float openShare = rod > 0.5 ? 0.0 : froth.y * (1.0 - clamp(rimAeration, 0.0, 1.0));
  float field = frothField(sheet);
  float past = field - frothThreshold(openShare);
  float edgeWidth = max(fwidth(field), 1e-4);
  float drawn = smoothstep(-edgeWidth, edgeWidth, past);
  result.present = openShare <= 0.0 ? 1.0 : mix(1.0 - openShare, drawn, resolved);
  result.hole = openShare > 0.0 && resolved > 0.5 && drawn < 0.5;
  // Densest in streaks and along the holes' edges, grained by a finer noise;
  // each averages out as it shrinks below a pixel.
  float edge = openShare > 0.0 ? 1.0 - smoothstep(0.0, FROTH_EDGE, past) : 0.0;
  float edgeShare = mix(FROTH_EDGE_MEAN * openShare, edge, resolved);
  float streakResolved = 1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint * FROTH_STREAK_SCALE);
  vec3 streakPlace = sheet * vec3(FROTH_STREAK_SCALE, FROTH_STREAK_SCALE, FROTH_STREAK_SCALE * FROTH_STREAK_ALONG);
  float streak = mix(0.5, smoothstep(0.3, 0.7, frothNoise(streakPlace + vec3(9.4, 2.2, 6.8))), streakResolved);
  float grainResolved = 1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint * FROTH_GRAIN_SCALE);
  float grain = mix(1.0, 0.6 + 0.8 * frothNoise(sheet * FROTH_GRAIN_SCALE + vec3(3.1, 7.7, 1.3)), grainResolved);
  float density = froth.x * (FROTH_BASE + FROTH_STREAK * streak + FROTH_EDGE_GAIN * edgeShare) * grain * (rod > 0.5 ? 0.5 : 1.0);
  result.whiteness = 1.0 - exp(-density / max(facing, FROTH_GRAZE));
  return result;
}
// The normal (view space, facing the viewer) wrinkled by the sheet's capillary ripples.
vec3 wrinkledNormal(vec3 normal, vec3 viewPosition, vec3 sheet, float violence, float rod) {
  vec3 sigmaX = dFdx(viewPosition);
  vec3 sigmaY = dFdy(viewPosition);
  vec3 wrinkleSheet = sheet * WRINKLE_SCALE;
  float cellsX = length(dFdx(wrinkleSheet)), cellsY = length(dFdy(wrinkleSheet));
  float footprint = max(cellsX, cellsY);
  // Metres a wrinkle's cell spans, from the same screen steps.
  float cellLength = 0.5 * (length(sigmaX) / max(cellsX, 1e-6) + length(sigmaY) / max(cellsY, 1e-6));
  float fade = (1.0 - smoothstep(FROTH_FADE.x, FROTH_FADE.y, footprint)) * (rod > 0.5 ? 0.0 : 1.0);
  // The amplitude is made of derivatives, so it is held constant over the pixel and only the noise
  // is differentiated: a derivative of a derivative is undefined in GLSL.
  float amplitude = (WRINKLE_SLOPE + WRINKLE_FROTH * min(violence, 1.0)) * cellLength * fade;
  float wrinkle = frothNoise(wrinkleSheet + vec3(41.0, 13.0, 29.0));
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
  normal = wrinkledNormal(normal, vViewPosition, vSheet, vFroth.x, vRod);
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
  gl_FragColor = froth.present * vec4(vThickness / max(facing, 0.33), 1.0, 0.0, aeration);
}
`;

export const COLUMN_VERTEX = /* glsl */`
attribute float aRadius;
attribute float aRound;
uniform float uProjScale;        // pixels per world unit at distance 1
uniform float uMinPixelRadius;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vRadius;
varying float vRound;
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
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const COLUMN_DEPTH_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vRound;
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
  gl_FragColor = vec4(-vViewPosition.z, 998.0 + 0.5 * clamp(vRound, 0.0, 1.0), normal.xy);
}
`;

export const COLUMN_THICKNESS_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vRadius;
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
  gl_FragColor = vec4(vRadius * facing, 1.0, 0.0, 0.0);
}
`;
