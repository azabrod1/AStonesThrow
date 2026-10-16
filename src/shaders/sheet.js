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
// 1 at the edge. A stone's crown's fingers (aRod = 1) are rods of water, not
// film: the depth pass marks them as a column's tube (998), so the composite
// shades them as the jet's glass is shaded, their normals leaning across
// them as a rod's do (src/crown.js; the lean adds to aRimTangent, so a
// finger's sides are aerated too, up to 0.86 at its roots).
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

export const SHEET_VERTEX = /* glsl */`
#define RIM_LEAN 1.4             // the rim tangent's length at the free edge (src/crown.js's bend)
#define SHEET_RING_SPACING 0.01  // metres: the rings' height under a riding vertex, read this smooth (the water surface's own)
attribute float aThickness;
attribute vec3 aRimTangent;
attribute float aRide;
attribute float aRod;
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
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const SHEET_DEPTH_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewRimTangent;
varying float vRod;
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
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
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
  gl_FragColor = vec4(vThickness / max(facing, 0.33), 1.0, 0.0, vAeration);
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
