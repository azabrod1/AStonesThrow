// GLSL for the splash's meshes: the crown sheet (src/crown.js) and the jet
// column (src/jet.js), drawn into the same screen-space fluid targets as the
// droplets (src/shaders/fluid.js) so the blur and the composite treat them and
// the drops as one body of water. All passes discard fragments hidden by the
// scene, exactly as the droplets do, and draw both faces.
//
// Sheet. A landing drop's crown (aRide = 1) is lifted by the water's height
// under each vertex, sampled as the water surface's vertex shader does, so it
// stands on the waves it lands on; a stone's crown starts on still water and
// keeps its own base. The depth pass writes what the droplet depth pass writes: view
// depth, an on-screen radius of 999 pixels (so the composite shades a thin
// film, never spray) and a sun glint. The glint uses the grid normal turned to
// face the viewer, leaned along aRimTangent near the rim so the bead catches
// the sun like a tube. The thickness pass adds the water a ray crosses: the
// sheet thickness over the cosine of the view angle (capped), for every wall
// the ray passes through.
//
// Column. A closed tube, so the depth pass writes view depth, a marker of 998
// (a glassy solid column: the blur leaves it sharp and the composite shades it
// as a lens, with no film scattering), the sun glint from its normal, and in
// alpha, packed by NORMAL_PACKING (src/shaders/fluid.js), its smooth view
// normal turned to face the viewer and how round the surface is there (aRound:
// 1 on the end cap and bulb, a lens like a sphere; 0 on the tube, a lens only
// across its axis). Normals rebuilt from depth would stripe the faceted mesh,
// and a half-float depth is too coarse for them at all. A ray through a cylinder of radius r at offset s crosses
// 2·sqrt(r² − s²) = 2·r·|n·v| of water, as it does through a sphere, so the
// thickness pass writes r·|n·v| for each of the two faces it meets. A column
// narrower than uMinPixelRadius is widened to it along its normals (outward),
// as droplets are, so it never breaks into dashes.

import { NORMAL_PACKING } from './fluid.js';
import { GLSL_COMMON } from './scene.js';

export const SHEET_VERTEX = /* glsl */`
attribute float aThickness;
attribute vec3 aRimTangent;
attribute float aRide;
uniform sampler2D uHeight;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewRimTangent;
varying float vThickness;
${GLSL_COMMON}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (aRide > 0.5) {
    vec2 domainUv = (world.xz - uDomainMin) / uDomainSize + uTexelOffset;
    world.y += texture2D(uHeight, domainUv).r * patchMask(domainUv);
  }
  vec4 viewPosition = viewMatrix * world;
  vViewPosition = viewPosition.xyz;
  vViewNormal = normalMatrix * normal;
  vViewRimTangent = normalMatrix * aRimTangent;
  vThickness = aThickness;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const SHEET_DEPTH_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform vec3 uSunDirView;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewRimTangent;
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
  normal = normalize(normal + vViewRimTangent);
  vec3 halfVector = normalize(uSunDirView + toViewer);
  float glint = pow(max(dot(normal, halfVector), 0.0), 90.0);
  gl_FragColor = vec4(-vViewPosition.z, 999.0, glint, 1.0);
}
`;

export const SHEET_THICKNESS_FRAGMENT = /* glsl */`
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vThickness;
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
  gl_FragColor = vec4(vThickness / max(facing, 0.33), 0.0, 0.0, 1.0);
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
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
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
uniform vec3 uSunDirView;
uniform float uFullFloatInfo;    // 1 when this target is full float (NORMAL_PACKING)
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vRound;
${NORMAL_PACKING}
void main() {
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
  vec3 halfVector = normalize(uSunDirView + toViewer);
  float glint = pow(max(dot(normal, halfVector), 0.0), 90.0);
  gl_FragColor = vec4(-vViewPosition.z, 998.0, glint, packNormal(normal, vRound, uFullFloatInfo));
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
  gl_FragColor = vec4(vRadius * facing, 0.0, 0.0, 1.0);
}
`;
