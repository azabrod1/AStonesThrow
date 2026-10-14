// GLSL for the crown sheet (src/crown.js), drawn into the same screen-space
// fluid targets as the droplets (src/shaders/fluid.js) so the blur and the
// composite treat sheet and drops as one body of water.
//
// The depth pass writes what the droplet depth pass writes: view depth, an
// on-screen radius of 999 pixels (so the composite shades a surface, never
// spray) and a sun glint. The glint uses the grid normal turned to face the
// viewer, leaned along aRimTangent near the rim so the bead catches the sun
// like a tube. The thickness pass adds the water a ray crosses: the sheet
// thickness over the cosine of the view angle (capped), for every wall the ray
// passes through. Both passes discard fragments hidden by the scene, exactly as
// the droplets do, and draw both faces.

export const SHEET_VERTEX = /* glsl */`
attribute float aThickness;
attribute vec3 aRimTangent;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewRimTangent;
varying float vThickness;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
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
