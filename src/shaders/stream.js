// GLSL for a stream's white rope (src/streamSheath.js): the water cannon's
// stream in the air.
//
// A stream from a nozzle under pressure is glass for a few diameters at
// most (src/waterCannon.js ROUGH, which works out where and how thick);
// its turbulence roughens its surface and throws a sheath of drops off it,
// and what the eye sees is a white rope: opaque along its middle, soft at
// its limb, streaked the way it flows, widening and thinning until it is a
// shower.
//
// The mesh is a tube of the sheath's radius, but it is shaded as what a ray
// meets going through a cloud of drops round the stream's axis, thickest at
// the axis: each vertex carries the rope's axis there (aAxis) and the optical
// depth of a ray through its middle, square to it (aFlow.y). A ray at the
// angle whose cosine is c from the surface's normal, measured across the axis
// (c is 1 down the middle of the tube as seen, 0 on its limb), passes the
// axis at sqrt(1 − c²) of the radius, and through a cloud whose density
// falls as a Gaussian of STREAM_CORE of the radius it meets
// exp(−(1 − c²) / STREAM_CORE²) of the middle's depth (less the limb's, so
// the tube's edge is nothing at all), over the sine of the ray's angle to
// the axis (a ray along the rope goes through more of it).
// So the rope has no edge: it is opaque where the depth is several and thins
// to nothing at the limb, and a rope that has spread (the same water in a
// wider sheath, a smaller depth) is seen through. Only the near face is
// drawn, so each ray is counted once.
//
// Its streaks (STREAM_STREAK). Nothing on a stream at tens of metres a second
// is seen still: what shows is what an exposure smears, striations as long as
// the water flies in STREAM cells of aFlow.x, which is when the water there
// left the nozzle, in exposures (src/streamSheath.js EXPOSURE), so the
// streaks ride with the water. Two octaves of value noise in (the place
// round the axis, the time of leaving), the place round as aAround's cosine
// and sine so the tube has no seam, the cells along repeating every
// STREAM_PERIOD (the CPU takes whole periods off aFlow.x, so a float keeps
// its precision however long the nozzle is held). The coarse octave is the
// rope's lumps: it swings the cloud's radius (STREAM_LUMP), so the limb is
// never a straight edge. The fine one is its strands: it swings the depth
// (by e^±STREAM_STREAK, more towards the limb, where the strands are all
// there is of it) and shades it (STREAM_SHADE: a strand is a ridge, its
// hollow in shade).
// Where the stream has broken up (aFlow.z, 0 to 1) the noise opens holes in
// it, up to STREAM_OPEN of it, so it ends as a rope of clumps and drops.
//
// The fan of spray thrown off the water where the stream lands
// (src/sprayFan.js) is the same program on a sheet (aForm.x 0): not a cloud
// round an axis but a thin layer of drops, thinning to nothing towards its
// sides (aAround.x is its place across, in the streaks' cells), and the
// ray's way through it longer the more it is seen edge on. And it is spray,
// not rope (aForm.y): not a body with a rough skin but drops in flight, seen
// as their trails, so its depth is all in hairs (STREAM_HAIR: fine across
// the fan, long along it, the noise sharpened so there is nothing between
// them, finer ones taking over as the fan widens) and it is a fan of fine
// streaks the scene shows through.
//
// Lit as the foam and the white water are (WHITE_ALBEDO and WHITE_SKY_LIGHT
// in src/shaders/whiteWater.js), so the stream and what it throws up are one
// white: the sun by half-Lambert on the rope's own normal (light goes round a
// scattering body's limb) and through its thin parts seen against the sun,
// the sky less on its underside. Premultiplied, no depth written.
import { GALE_SURFACE } from './gale.js';

export const STREAM_VERTEX = /* glsl */`
${GALE_SURFACE}
attribute vec3 aAxis;      // the rope's way there (unit)
attribute vec2 aAround;    // the vertex's place round it: the cosine and sine of its angle
attribute vec3 aFlow;      // when its water left the nozzle (exposures, less whole periods), the depth through its middle, how far it has broken up
attribute vec2 aForm;      // what it is (1 the rope's ring; below 0 the fan's sheet, less how many times the streaks across it), and how far it is spray (0 the rope, 1 spray, to 2 as its hairs go finer)
uniform vec3 uSunDir;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewAxis;
varying vec3 vViewSide;
varying vec3 vViewLift;
varying vec2 vAround;
varying vec3 vFlow;
varying vec2 vForm;
varying vec3 vSunView;
varying vec3 vUpView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // The stream flies over still water (src/waterCannon.js); the gale lifts it with the surface under it, as the column is.
  if (uGaleMetresPerUnit > 0.0) world.y += galeLift(world.xyz);
  vec4 viewPosition = viewMatrix * world;
  vViewPosition = viewPosition.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  vViewAxis = normalize(normalMatrix * aAxis);
  // The ring's own axes (src/streamSheath.js ring): level and square to the stream, and square to both.
  vec3 side = vec3(aAxis.z, 0.0, -aAxis.x);
  float level = length(side);
  side = level > 1e-6 ? side / level : vec3(1.0, 0.0, 0.0);
  vViewSide = normalMatrix * side;
  vViewLift = normalMatrix * cross(side, aAxis);
  vForm = aForm;
  vAround = aAround;
  vFlow = aFlow;
  vSunView = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
  vUpView = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const STREAM_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewAxis;
varying vec3 vViewSide;
varying vec3 vViewLift;
varying vec2 vAround;
varying vec3 vFlow;
varying vec2 vForm;
varying vec3 vSunView;
varying vec3 vUpView;
#define STREAM_ALBEDO vec3(0.9, 0.92, 0.93)   // WHITE_ALBEDO (src/shaders/whiteWater.js)
#define STREAM_SKY_LIGHT 1.5                  // WHITE_SKY_LIGHT
#define STREAM_CORE 0.47       // the cloud's Gaussian radius, as a share of the tube's
#define STREAM_END_ON vec2(0.08, 0.3)   // the sines of a ray's angle to the axis between which the rope fades out, seen end on
#define STREAM_ALONG_LEAST 0.45// the sine of a ray's angle to the axis below which its way through stops growing
#define STREAM_ROUND 1.5       // the streaks' cells round the rope: the circle's radius in them (some seven round it)
#define STREAM_FINE vec3(3.1, 3.1, 2.0)   // the finer octave's cells per coarse cell (a whole number along, so it repeats too)
#define STREAM_PERIOD 256.0    // the coarse cells along repeat every so many (src/streamSheath.js PERIOD)
#define STREAM_LUMP 0.45        // the coarse streaks swing the cloud's radius by this share
#define STREAM_STREAK 2.2      // the streaks swing the depth by e^± this
#define STREAM_SHADE 0.4       // and darken their hollows by this share
#define STREAM_OPEN 0.72       // the share of the noise holes take where the stream has wholly broken up...
#define STREAM_OPEN_SOFT 0.1   // ...their edges this wide in it
#define STREAM_HAIR vec3(8.0, 8.0, 3.0)   // the spray's hairs: their cells across the fan, to its place in the streaks' cells, and along (in the coarse cells, a whole share of the period)
#define STREAM_HAIR_FINER 2.6  // the finer hairs' cells across it, to the hairs'
#define STREAM_SHEET_ACROSS 4.0  // the fan's half-width in the streaks' cells (src/sprayFan.js FAN_GRID.across)
#define STREAM_SHEET_LEAST 0.55  // the cosine of a ray's angle to the sheet's normal below which its way through stops growing
#define STREAM_HAIR_SHARP 2.5  // the hairs' noise to this power: thin bright streaks with nothing between
#define STREAM_THROUGH 0.6     // the sun's light through its thin parts, seen against it

float streamHash(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.zyx + 31.32);
  return fract((point.x + point.y) * point.z);
}
// Value noise whose cells along z repeat every \`period\`.
float streamNoise(vec3 point, float period) {
  vec3 cell = floor(point), within = fract(point);
  within = within * within * (3.0 - 2.0 * within);
  float near = mod(cell.z, period), far = mod(cell.z + 1.0, period);
  vec4 nearCorners = vec4(streamHash(vec3(cell.xy, near)), streamHash(vec3(cell.xy + vec2(1.0, 0.0), near)),
                          streamHash(vec3(cell.xy + vec2(0.0, 1.0), near)), streamHash(vec3(cell.xy + vec2(1.0, 1.0), near)));
  vec4 farCorners = vec4(streamHash(vec3(cell.xy, far)), streamHash(vec3(cell.xy + vec2(1.0, 0.0), far)),
                         streamHash(vec3(cell.xy + vec2(0.0, 1.0), far)), streamHash(vec3(cell.xy + vec2(1.0, 1.0), far)));
  vec4 corners = mix(nearCorners, farCorners, within.z);
  return mix(mix(corners.x, corners.y, within.x), mix(corners.z, corners.w, within.x), within.y);
}

void main() {
  vec3 toEye = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (vFlow.y <= 0.0) discard;
  // Where the ray crosses (fringe: 0 down the middle, 1 at the edge) and how long its way through is (through).
  float fringe, through;
  if (vForm.x > 0.5) {
    // The rope (the header): the ray's place across it is c, 1 down its middle and 0 on its limb, worked out in the
    // ring's own axes. Seen nearly along itself a tube is no cloud (every part of its skin is edge on): it fades out.
    vec3 axis = normalize(vViewAxis);
    float alongAxis = dot(toEye, axis);
    float acrossAxis = sqrt(max(1.0 - alongAxis * alongAxis, 0.0));
    vec2 ray = vec2(dot(toEye, normalize(vViewSide)), dot(toEye, normalize(vViewLift)));
    float middle = dot(normalize(vAround), ray / max(length(ray), 1e-4));
    if (middle <= 0.0) discard;   // the far face: each ray is counted once, at the near one
    fringe = 1.0 - middle * middle;
    through = smoothstep(STREAM_END_ON.x, STREAM_END_ON.y, acrossAxis) / max(acrossAxis, STREAM_ALONG_LEAST);
  } else {
    // The fan (the header): a sheet, thinning to nothing towards its sides, the ray's way through it longer the more
    // it is seen edge on; it has two faces, and is lit on the one seen.
    float across = abs(vAround.x) / STREAM_SHEET_ACROSS;
    fringe = across * across * across;
    float square = dot(normal, toEye);
    if (square < 0.0) normal = -normal;
    through = 1.0 / max(abs(square), STREAM_SHEET_LEAST);
  }
  // The streaks, riding with the water: the coarse ones are the rope's lumps (its width), the fine its strands. A
  // fan has as many across it as its size asks (−aForm.x), so a deck gun's has streaks no wider than a weak jet's.
  vec2 lateral = vForm.x > 0.5 ? vAround : vec2(vAround.x * -vForm.x, vAround.y);
  vec3 place = vec3(lateral * STREAM_ROUND, vFlow.x);
  float lump = streamNoise(place, STREAM_PERIOD);
  float strand = streamNoise(place * STREAM_FINE + 19.0, STREAM_PERIOD * STREAM_FINE.z);
  float streak = 0.6 * lump + 0.4 * strand;
  float core = STREAM_CORE * (1.0 + STREAM_LUMP * (2.0 * lump - 1.0));
  float limb = exp(-1.0 / (core * core));
  float cloud = through * (exp(-fringe / (core * core)) - limb) / (1.0 - limb);
  // Spray is hairs: drops' trails, far finer across it than the rope's strands and far longer. As the fan widens its
  // hairs would widen with it: finer ones take over (vForm.y from 1 to 2). The rope has none.
  float spray = min(vForm.y, 1.0), finer = clamp(vForm.y - 1.0, 0.0, 1.0);
  float hair = 0.5;
  if (spray > 0.0) hair = streamNoise(vec3(lateral, vFlow.x) * STREAM_HAIR + 7.0, STREAM_PERIOD * STREAM_HAIR.z);
  if (finer > 0.0) hair = mix(hair, streamNoise(vec3(lateral * STREAM_HAIR_FINER, vFlow.x) * STREAM_HAIR + 31.0, STREAM_PERIOD * STREAM_HAIR.z), finer);
  streak = mix(streak, 0.5 * lump + 0.5 * hair, spray);
  float open = vFlow.z * STREAM_OPEN;
  float whole = smoothstep(open - STREAM_OPEN_SOFT, open + STREAM_OPEN_SOFT, streak + (1.0 - vFlow.z) * STREAM_OPEN_SOFT);
  // The strands show where the rope is thin: towards its limb they are all there is of it.
  float roped = exp(STREAM_STREAK * (2.0 * strand - 1.0) * (0.35 + fringe));
  float sprayed = (STREAM_HAIR_SHARP + 1.0) * pow(hair, STREAM_HAIR_SHARP) * (0.4 + 1.2 * lump) * (0.4 + 1.2 * strand);
  float depth = vFlow.y * cloud * mix(roped, sprayed, spray) * whole;
  float alpha = 1.0 - exp(-depth);
  if (alpha < 0.003) discard;
  float facing = 0.5 + 0.5 * dot(normal, vSunView);
  float sun = facing * facing + STREAM_THROUGH * exp(-depth) * max(-vSunView.z, 0.0);
  float sky = 0.75 + 0.25 * dot(normal, vUpView);
  float hollow = 1.0 - STREAM_SHADE * (1.0 - smoothstep(0.25, 0.7, strand));
  vec3 light = STREAM_ALBEDO * (uSunIrradiance * sun + uSkyAmbient * STREAM_SKY_LIGHT * sky) * hollow;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;
