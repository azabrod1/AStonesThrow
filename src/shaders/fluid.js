// GLSL for the splash's water in the air: droplets drawn as sphere impostors,
// the passes the crown sheets and jet columns share with them, the composite
// that shades all of it as one water, and the cheap water the mirror image
// shows (src/main.js).
//
// Two targets, at the fluid buffer's resolution (a fraction of the canvas):
//   info    (depth pass, depth-tested: the nearest water wins)
//           r view depth, g what it is, b and a its view normal's x and y
//           (turned to face the viewer; z follows). g is 999 for a crown
//           sheet, 998 + roundness / 2 for a jet column (1 on its cap and
//           bulb, a lens like a sphere, 0 on the tube; a half-float target
//           keeps only 998 or 998.5) and, for a drop, its true on-screen
//           radius in buffer pixels. Every class writes its exact normal:
//           nothing is rebuilt from depth and nothing is blurred.
//   optics  (optics pass, summed: additive in all four channels)
//           r the water a ray crosses (metres), g coverage (the share of the
//           pixel and of the exposure that water covers), b the drops' sun
//           glints (radiance over the sun's irradiance) and a the aeration
//           (the crown's rim bead, torn edges and froth, and a column's
//           bubbly water, src/shaders/sheet.js), the share of its light
//           scattered white, times its share of the pixel, as the coverage is.
//
// Droplets. Sphere impostors stretched along their motion into capsules, as a
// camera's shutter would smear them (half a frame, at most a few
// thousandths of a second: uStreakSeconds, src/splash.js STREAK_CAP). A drop
// narrower than uMinPixelRadius buffer pixels is drawn that wide and covers
// the pixels it is drawn over by its true area's share (and its volume's in
// the thickness), so a fine drop leaves as much light as it should, never a
// widened speck. On a capsule each point counts as covered for the share of
// the exposure the moving disc spends over it. Drops under HAZE_RADIUS
// device pixels (src/splash.js: 0.5, under a pixel wide) write no depth:
// they are mist, only coverage and glints, and never hide the sheet behind
// them. Lens drops (the jet's big ones, iLens) keep their round shape: a long
// streak would read as a pill. A drop just pinched off wobbles (iShape,
// src/splash.js: its length along its motion over its width, volume kept),
// so the quad is drawn that much longer along the axis and narrower across
// it, and the sphere's shading is stretched with it: an ellipsoid near
// enough. uLeastRadius leaves finer drops out (the mirror pass's). The spray (SPRAY_VERTEX, src/spray.js) goes through the
// same passes and fragments: each sprite a drop, or a puff of vWeight like
// drops, drawn as mist (no depth) over a soft disc, puffKernel: their
// coverage and water summed over it, falling off as (1 − ρ²)² from its
// centre (over the capsule of its streak), so a puff has no edge. The disc
// is one its drops cover PUFF_COVER of at its birth, grown since by how far
// they have spread about it (SPRAY_VERTEX's `spread`, src/spray.js says
// how). Its glints are its drops' summed: vGlintShare of them a point, one
// drop's glint as any drop's but at a place of the puff's own (hashed from
// its birth, never its centre, which made every puff a disc with a dot in
// it) swept along its streak, the rest spread over the kernel as the drops
// are; a sprite of a few drops keeps nearly all of it as the point, so the
// mist sparkles, a heavy one spreads nearly all (src/spray.js's share). A
// sprite of one drop is a drop like any other.
//
// Glints. A water sphere of radius r in sunlight of irradiance E sends the
// sun's light towards the viewer from two points, each a tiny image of the
// sun, so its glints are points whatever the drop's size, and on a pixel of
// solid angle Ω at distance d they carry I / (d²·Ω) = E·P·ρ² of radiance,
// ρ the drop's radius in pixels: reflected (order p = 0) where the normal is
// the half vector, with P0 = F(θ)/4 (a mirror sphere scatters evenly); and
// refracted through it (p = 1), deviated by D = 2·(θi − asin(sin θi / n)) from
// the sun's direction, from where the normal is cos θi·V − sin θi·(the sun's
// direction across V), with P1 = (1 − F(θi))²·sin θi·cos θi / (sin D · dD/dθi)
// (θi found by Newton's method, per drop in the vertex shader). Seen across a
// sunlit pond a drop's refracted glint is several times its reflected one,
// which is why a splash sparkles against the sun. Each is spread over a
// GLINT_SPREAD-pixel Gaussian, and along the streak a moving drop draws, with
// its power kept: the composite adds them, so a drop of two pixels is a point
// of light and mist a faint shimmer.
//
// The composite (in device pixels; uFluidScale is the buffer's resolution
// over the canvas's) shades every class as the pond's water is shaded
// (src/shaders/scene.js): Fresnel (F0 = 0.02) between the light it reflects
// and the light it lets through, absorbed over the water crossed by the
// pond's own coefficients (lighting.absorb), plus the sun's glitter with the
// pond's sunGlitter (GLSL_COMMON). The light a reflection or a refraction
// picks up is pondView: the sky cube above the horizon and, below it, the
// pond as a rough mirror of the sky plus the sun's glitter, over the sand
// floor seen through the water (uFloorLight), as the water shader shows it.
//   - Sheet: reflects pondView and lets the scene behind through, shifted by
//     its normal and thickness (a thin film barely bends what is behind it);
//     sunGlitter with WATER_SLOPE_VARIANCE (its unresolved ripple) plus
//     SHEET_ROUGH_VARIANCE times its aeration (a white sheet is a torn,
//     turbulent one: its glitter spreads where a glassy sheet's is a hard
//     patch). Its rim
//     bead and torn edges, and its froth (src/shaders/sheet.js), are
//     aerated: mixed towards the spray's scattering colour by the optics'
//     aeration over their coverage, at most 1. Its holes are the scene's:
//     the depth pass discards them, and the optics write the sheet's share
//     of a pixel, in the aeration as in the coverage, which the alpha
//     applies (so the aeration is divided by it, up to a whole pixel).
//   - Column and drop beads (a drop from one device pixel of radius up, fading
//     in from half a pixel): lenses. A ray through a water sphere at incidence
//     θ leaves turned by 2·(θ − asin(sin θ / 1.33)) towards its centre, in the
//     plane of the ray and the normal; through a tube it keeps its slope along
//     the axis (taken as vertical) and turns only across it, by the same law
//     with the effective index sqrt(1.33² − sin²γ) / cos γ for a ray at γ to
//     the cross-section. So the column shows the pond from well to the side
//     (the sun's glitter on it) and a drop the sky upside down below the pond,
//     a light lower half under a dark top and a dark edge, rather than what is
//     just behind it. The light is pondView, offset so that the
//     straight-through direction gives exactly the scene behind; a column
//     also takes the scene itself where its turned ray points (COLUMN_LENS
//     of a far scene's shift, since the pond behind it is near; for
//     COLUMN_LENS_SCENE of its refracted light, where the frame holds it),
//     so the rings and the shore behind a jet bend and stretch through it
//     as through a glass rod, where the model's light alone left them
//     straight and the column read as frosted. A lens
//     also carries light round inside it (a ray that enters near a drop's or
//     a column's edge meets the far side at a grazing angle and is largely
//     reflected on round the inside before it leaves, the sky and the pond
//     mixed): the refracted light is mixed by COLUMN_INNER (a drop's by
//     DROP_INNER) towards the drop's mean light, so a column's far side is
//     never black (a smooth cylinder shading to pure black read as chrome)
//     and a drop's top is dark, not void. The column
//     adds sunGlitter; a drop's glints come from the optics.
//   - A lens image needs room and stillness: a drop's shows from DETAIL_FROM
//     to DETAIL_FULL device pixels of radius, and only where the drop covers
//     the pixel for most of the exposure, a column's from COLUMN_DETAIL_FROM
//     to COLUMN_DETAIL_FULL. A finer drop or column, or a streak, which
//     averages the image the drop carries past each point, shows the water's
//     mean light instead: the sky's below and the pond's above, about
//     MEAN_SKY of the sky's mean radiance and MEAN_BEHIND of what is behind.
//   - Mist (drops under half a device pixel): that mean light over the
//     pixel's coverage (1 − exp(−coverage)), so a lone fine drop is all but
//     invisible and only a cloud of them a faint veil; its sparkle is its
//     glints.
// Coverage is the alpha: a sheet or column covers its pixels (its edge
// softened by the buffer's filtering), a drop the share it really covers.
// The filtered optics reach a buffer pixel past the depth pass's edge; a
// pixel there is shaded as the nearest water beside it (nearestInfo: the
// eight buffer pixels around it), not as mist, so an edge is its own water
// softened by its coverage, with no pale outline stepping along the buffer's
// grid where the buffer is coarser than the canvas (Medium's and Low's).
// The composite also tone-maps the frame; a pixel with no water in it does
// nothing else.
//
// The mirror pass (src/main.js) draws the crowns, columns and drops through
// the reflected camera as MIRROR_* below, over the dome's mirror image: the
// Fresnel reflection of the sky cube, no refraction (a sheet or a column lets
// the dome behind it show straight through), the sheet's aerated bead and
// froth, through the same holes (SHEET_FROTH), and a
// drop's mean light and glints. Only what stands above the water is drawn.
// A second draw of the same programs writes how far each is from the mirror
// camera into the mirror's alpha (MIRROR_COMMON), so that the water can look
// a near object's reflection up where it is rather than at infinity.
import { GLSL_COMMON, HAZE } from './scene.js';
import { GALE_SURFACE } from './gale.js';
import { SHEET_FROTH } from './sheet.js';
import { COAST } from '../spray.js';

// A drop's mean light (the header): this much of the sky's mean radiance and
// of what is behind it.
const MEAN_LIGHT = /* glsl */`
#define MEAN_SKY 0.6
#define MEAN_BEHIND 0.4
`;

// Schlick's Fresnel for water, the pond's constants.
const FRESNEL = /* glsl */`
float waterFresnel(float cosine) { return 0.02 + 0.98 * pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0); }
`;

// What every drop sprite's vertex shader shares: drawDrop places one drop (or,
// for spray, a puff of `weight` like drops) at a point over still water,
// moving at a velocity, and writes the varyings the fragments read.
const DROP_BODY = /* glsl */`
#define WATER_INDEX 1.333
#define MAX_DEVIATION 1.444      // radians (82.8°): no ray leaves a drop deviated more after one passage
#define PUFF_COVER 0.1           // a puff's drops cover this share of the disc it is born as
uniform float uProjScale;        // target pixels per world unit at distance 1
uniform float uMinPixelRadius;   // a drop is drawn at least this wide (target pixels)
uniform float uStreakSeconds;
uniform vec3 uSunDirView;
uniform float uLeastRadius;      // drops smaller than this (metres) are not drawn (the mirror's MIRROR_DROP_RADIUS)
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;           // drawn radius (world)
varying float vPixelRadius;      // true on-screen radius (target pixels); 0 for a puff, which writes no depth
varying float vDrawnPixelRadius;
varying float vAreaShare;        // the true drop's share of the drawn disc's area (one of a puff's drops' share of its disc)
varying float vWeight;           // the drops the sprite stands for (1 but for spray)
varying float vStretch;          // half-length of the capsule in drawn radii (1 = sphere)
varying vec2 vAxis;              // screen-space motion direction (view xy)
varying vec4 vGlintPoints;       // reflected (xy) and refracted (zw) glint, view xy in drawn radii from the centre
varying vec2 vGlintPowers;       // their radiance × pixel area over the sun's irradiance (E·P·ρ² / E), all its drops'
varying float vGlintShare;       // the share of a puff's glints drawn as a point (1 for a drop), the rest spread over its kernel
varying vec2 vPuffSeed;          // a puff's own place for its lumps (puffLumps), 0 for a drop
${FRESNEL}
${GALE_SURFACE}
void cullDrop() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }
void drawDrop(vec3 centreWorld, vec3 velocityWorld, float dropRadius, float lens, float weight, float spread, float shape) {
  // A drop flies over still water (src/splash.js); the gale lifts it with the surface under it.
  vec3 centre = centreWorld;
  if (uGaleMetresPerUnit > 0.0) centre.y += galeLift(centreWorld);
  vec4 viewCentre = viewMatrix * vec4(centre, 1.0);
  float dist = max(-viewCentre.z, 0.05);
  float pixelRadius = dropRadius * uProjScale / dist;
  float drawnPixelRadius = max(pixelRadius, uMinPixelRadius);
  // A puff of spray is drawn as a disc its drops cover PUFF_COVER of at its birth, grown by their spread since (metres).
  if (weight > 1.0) drawnPixelRadius = max(drawnPixelRadius, sqrt(dropRadius * dropRadius * weight / PUFF_COVER + spread * spread) * uProjScale / dist);
  float radius = dropRadius * drawnPixelRadius / max(pixelRadius, 1e-4);
  vec3 viewVelocity = (viewMatrix * vec4(velocityWorld, 0.0)).xyz;
  vec2 motion = viewVelocity.xy * uStreakSeconds;
  float streak = length(motion);
  vec2 axis = streak > 1e-5 ? motion / streak : vec2(1.0, 0.0);
  float stretch = 1.0 + 0.5 * streak / radius;
  // A drop drawn as a lens keeps its shape: a long streak would read as a pill.
  if (lens > 0.5) stretch = min(stretch, 1.25);
  vec2 perpendicular = vec2(-axis.y, axis.x);
  // The wobble: longer along the motion by shape, narrower across by its square root (the volume kept).
  vec2 offset = (axis * position.x * stretch * shape + perpendicular * position.y * inversesqrt(shape)) * radius;

  // The two glints (see the header), on the true sphere inside the drawn disc.
  vec3 toViewer = normalize(-viewCentre.xyz);
  vec3 toSun = uSunDirView;
  float trueShare = pixelRadius / drawnPixelRadius;
  vec3 halfVector = normalize(toSun + toViewer);
  float reflectedPower = waterFresnel(dot(toViewer, halfVector)) * 0.25;
  vec3 sunAcross = toSun - dot(toSun, toViewer) * toViewer;
  float sunAcrossLength = length(sunAcross);
  sunAcross = sunAcrossLength > 1e-4 ? sunAcross / sunAcrossLength : vec3(0.0, 1.0, 0.0);
  float deviation = acos(clamp(dot(-toSun, toViewer), -1.0, 1.0));
  float refractedPower = 0.0;
  vec3 exitNormal = toViewer;
  if (deviation < MAX_DEVIATION) {
    // D(θ) is convex and increasing, so Newton's method from above converges.
    float incidence = min(2.0 * deviation + 0.05, 1.5707);
    for (int step = 0; step < 5; step++) {
      float inside = asin(sin(incidence) / WATER_INDEX);
      float slope = 2.0 * (1.0 - cos(incidence) / (WATER_INDEX * cos(inside)));
      incidence = clamp(incidence - (2.0 * (incidence - inside) - deviation) / slope, 0.0, 1.5707);
    }
    float inside = asin(sin(incidence) / WATER_INDEX);
    float slope = 2.0 * (1.0 - cos(incidence) / (WATER_INDEX * cos(inside)));
    float transmitted = 1.0 - waterFresnel(cos(incidence));
    refractedPower = transmitted * transmitted * sin(incidence) * cos(incidence) / (max(sin(deviation), 1e-3) * slope);
    exitNormal = cos(incidence) * toViewer - sin(incidence) * sunAcross;
  }
  float pixelArea = pixelRadius * pixelRadius;
  vGlintPoints = vec4(halfVector.xy, exitNormal.xy) * trueShare;
  vGlintPowers = vec2(reflectedPower, refractedPower) * pixelArea * weight;

  vGlintShare = 1.0;
  vPuffSeed = vec2(0.0);
  vQuad = position.xy;
  vViewCentre = viewCentre.xyz;
  vRadius = radius;
  vPixelRadius = weight > 1.0 ? 0.0 : pixelRadius;
  vDrawnPixelRadius = drawnPixelRadius;
  vAreaShare = trueShare * trueShare;
  vWeight = weight;
  vStretch = stretch;
  vAxis = axis;
  gl_Position = projectionMatrix * vec4(viewCentre.xyz + vec3(offset, 0.0), 1.0);
}
`;

// The splash's drops in flight, stepped on the CPU (src/splash.js).
export const PARTICLE_VERTEX = /* glsl */`
attribute vec3 iPosition;
attribute float iRadius;
attribute vec3 iVelocity;
attribute float iLens;
attribute float iShape;          // its length along its motion over its width (1 a sphere): the wobble, src/splash.js
${DROP_BODY}
void main() {
  if (iRadius < uLeastRadius) { cullDrop(); return; }
  drawDrop(iPosition, iVelocity, iRadius, iLens, 1.0, 0.0, max(iShape, 0.25));
}
`;

// The spray (src/spray.js): each sprite's flight a closed form of its age,
// written once at its birth. Two phases of linear drag (src/spray.js says
// why): for t1 a fast one of response time τ1 towards (wind x, −g·τ1, wind
// z), then a slow one of τ2 towards (wind x, −g·τ2, wind z) (the wind's
// drift as it was at the sprite's birth), τ2·COAST
// across the water; in each v(t) = v∞ + (v₀ − v∞)·e^(−t/τ) and
// x(t) = x₀ + v∞·t + τ·(v₀ − v∞)·(1 − e^(−t/τ)). It is left out before its
// birth, past its life and once it is under the still water (the gale lifts
// it as drawn). A puff's drops spread about it by their burst's kick under
// the same drag: PUFF_SPREAD of the kick times τ·(1 − e^(−t/τ)) in each
// phase (across the water, the slow phase's COAST·τ2), the fast phase's
// remainder carried into the slow one, at most PUFF_MOST_SPREAD; a sprite
// of a few drops is a sample of them and spreads by the share
// 1 − e^(−(weight − 1) / PUFF_BLUR_DROPS) of that (src/spray.js says why),
// and that share of its glints is spread with them, the rest a point at a
// place of its own within PUFF_GLINT_REACH of its centre (puffHash).
export const SPRAY_VERTEX = /* glsl */`
#define SPRAY_GRAVITY 9.81
#define SPRAY_COAST ${COAST.toFixed(4)}
#define PUFF_SPREAD 0.8          // a puff's drops spread at this share of their burst's kick (two of its spread along an axis)
#define PUFF_MOST_SPREAD 0.02    // m: and no further than this, a bound on the fill a puff costs
#define PUFF_BLUR_DROPS 20.0     // a puff of this many drops spreads with them in full, one of a few hardly at all
#define PUFF_GLINT_REACH 0.8     // a puff's point glint lies within this of its drawn radius from its centre
attribute vec4 aOrigin;          // x, y, z at birth, and the splash time it was born
attribute vec4 aLaunch;          // its velocity then, and how long it may fly
attribute vec4 aDrop;            // radius, the drops it stands for, τ1, t1
attribute vec4 aSlow;            // τ2, the drift the wind gave it at its birth (world x, z, m/s), and its burst's kick (m/s)
uniform float uTime;             // the splash time
${DROP_BODY}
// Two draws of a sprite's own (0 to 1), from where and when it was born.
vec2 puffHash(vec4 origin) {
  vec3 mixed = fract(origin.xyz * vec3(0.1031, 0.1030, 0.0973) + origin.w * 0.0953);
  mixed += dot(mixed, mixed.yzx + 33.33);
  return fract((mixed.xx + mixed.yz) * mixed.zy);
}
void main() {
  float age = uTime - aOrigin.w;
  if (age < 0.0 || age >= aLaunch.w || aDrop.x < uLeastRadius) { cullDrop(); return; }
  float fastTau = aDrop.z;
  float early = min(age, aDrop.w);
  vec3 fastTerminal = vec3(aSlow.y, -SPRAY_GRAVITY * fastTau, aSlow.z);
  float fastDecay = exp(-early / fastTau);
  vec3 launch = aLaunch.xyz - fastTerminal;
  vec3 centre = aOrigin.xyz + fastTerminal * early + fastTau * launch * (1.0 - fastDecay);
  vec3 velocity = fastTerminal + launch * fastDecay;
  // The slow phase from where the fast one left it (nothing yet while age is under t1).
  float late = age - early;
  vec3 slowTau = vec3(SPRAY_COAST, 1.0, SPRAY_COAST) * aSlow.x;
  vec3 slowTerminal = vec3(aSlow.y, -SPRAY_GRAVITY * aSlow.x, aSlow.z);
  vec3 slowDecay = exp(-late / slowTau);
  vec3 rest = velocity - slowTerminal;
  centre += slowTerminal * late + slowTau * rest * (1.0 - slowDecay);
  velocity = slowTerminal + rest * slowDecay;
  if (centre.y < 0.0) { cullDrop(); return; }
  // How far the puff's drops have spread about it (the header).
  float blur = 1.0 - exp(-(aDrop.y - 1.0) / PUFF_BLUR_DROPS);
  float spreadTime = fastTau * (1.0 - fastDecay) + fastDecay * slowTau.x * (1.0 - slowDecay.x);
  float spread = min(PUFF_SPREAD * aSlow.w * blur * spreadTime, PUFF_MOST_SPREAD);
  drawDrop(centre, velocity, aDrop.x, 0.0, aDrop.y, spread, 1.0);
  if (aDrop.y > 1.0) {
    // The puff's point glint, one of its drops' somewhere in it; the rest of its glints go with the spread.
    vec2 draws = puffHash(aOrigin);
    float reach = PUFF_GLINT_REACH * sqrt(draws.x), angle = 6.2831853 * draws.y;
    vec2 place = reach * vec2(cos(angle), sin(angle));
    vGlintPoints += vec4(place, place);
    vGlintShare = 1.0 - blur;
    vPuffSeed = draws;
  }
}
`;

// Capsule distance in radius units for a quad point; also the sphere-local xy.
const CAPSULE = /* glsl */`
vec3 capsule(vec2 quad, float stretch) {
  float along = quad.x * stretch;
  float dx = max(abs(along) - (stretch - 1.0), 0.0) * sign(along);
  return vec3(dx, quad.y, dx * dx + quad.y * quad.y);
}
`;

// The share of the exposure a moving disc of unit radius, its centre sweeping
// from −travel to +travel along the axis, spends over the point (along, across).
const EXPOSURE = /* glsl */`
float exposureShare(float along, float across, float travel) {
  if (travel < 1e-3) return 1.0;
  float chord = sqrt(max(1.0 - across * across, 0.0));
  float overlap = max(min(along + chord, travel) - max(along - chord, -travel), 0.0);
  return min(overlap / (2.0 * travel), 1.0);
}
`;

// A puff's drops over its disc (the header): (1 − ρ²)² of the squared
// distance from its centre in drawn radii, over the capsule of its streak,
// normalised to one over it (π/3 over the disc, 16/15 per unit of travel
// over the streak), so that the puff's coverage, water and glints, each the
// kernel times the drops' sum, add up to the drops'. A puff of many drops
// is no even disc but lumps: its drops came off a torn patch of sheet in
// clumps, so the kernel is modulated by a value noise of PUFF_LUMPS cells
// across its radius (puffLumps, at a place of the sprite's own, vPuffSeed),
// from 1 − PUFF_LUMP to 1 + PUFF_LUMP times, by the share the puff has
// spread (a sprite of a few drops is one bead and takes none); the noise
// averages one, so a puff keeps its drops' sum over its lumps.
const PUFF = /* glsl */`
#define PUFF_LUMPS 1.6           // the lumps' cells across a puff's drawn radius
#define PUFF_LUMP 0.85           // and how far the kernel swings between them
float puffKernel(float squaredDistance, float travel) {
  float fall = 1.0 - squaredDistance;
  return fall * fall / (PI / 3.0 + (16.0 / 15.0) * travel);
}
float puffLumpHash(vec2 point) {
  vec3 mixed = fract(vec3(point.xyx) * 0.1031);
  mixed += dot(mixed, mixed.yzx + 33.33);
  return fract((mixed.x + mixed.y) * mixed.z);
}
float puffLumps(vec2 fragmentRadii, vec2 seed, float share) {
  vec2 point = fragmentRadii * PUFF_LUMPS + seed * 64.0;
  vec2 cell = floor(point);
  vec2 local = point - cell;
  vec2 ease = local * local * (3.0 - 2.0 * local);
  float noise = mix(mix(puffLumpHash(cell), puffLumpHash(cell + vec2(1.0, 0.0)), ease.x),
                    mix(puffLumpHash(cell + vec2(0.0, 1.0)), puffLumpHash(cell + vec2(1.0, 1.0)), ease.x), ease.y);
  return 1.0 + PUFF_LUMP * share * (2.0 * noise - 1.0);
}
`;

// A glint's footprint: a Gaussian of GLINT_SPREAD pixels around the segment
// its point sweeps, normalised to unit integral in pixels.
const GLINT_FOOTPRINT = /* glsl */`
#define GLINT_SPREAD 0.7
float glintFootprint(vec2 fragmentRadii, vec2 glintRadii, vec2 axis, float travel, float pixelsPerRadius) {
  vec2 perpendicular = vec2(-axis.y, axis.x);
  vec2 offset = fragmentRadii - vec2(dot(glintRadii, axis), dot(glintRadii, perpendicular));
  vec2 gap = vec2(max(abs(offset.x) - travel, 0.0), offset.y) * pixelsPerRadius;
  float sweep = 2.0 * travel * pixelsPerRadius;
  return exp(-dot(gap, gap) / (2.0 * GLINT_SPREAD * GLINT_SPREAD))
    / (2.0 * PI * GLINT_SPREAD * GLINT_SPREAD + 2.5066 * GLINT_SPREAD * sweep);
}
`;

export const PARTICLE_DEPTH_FRAGMENT = /* glsl */`
uniform mat4 projectionMatrix;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform float uHazeRadius;       // target pixels: finer drops are mist and write no depth
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;
varying float vPixelRadius;
varying float vStretch;
varying vec2 vAxis;
${CAPSULE}
void main() {
  if (vPixelRadius < uHazeRadius) discard;
  vec3 c = capsule(vQuad, vStretch);
  if (c.z > 1.0) discard;
  float zOffset = sqrt(1.0 - c.z);
  vec2 perpendicular = vec2(-vAxis.y, vAxis.x);
  vec2 localXy = vAxis * c.x + perpendicular * c.y;
  vec3 viewPos = vViewCentre + vec3(localXy, zOffset) * vRadius;
  vec4 clip = projectionMatrix * vec4(viewPos, 1.0);
  float depth = (clip.z / clip.w) * 0.5 + 0.5;
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (depth > sceneDepth) discard;
  gl_FragDepth = depth;
  gl_FragColor = vec4(-viewPos.z, min(vPixelRadius, 900.0), localXy);
}
`;

export const PARTICLE_THICKNESS_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vRadius;
varying float vDrawnPixelRadius;
varying float vAreaShare;
varying float vWeight;
varying float vStretch;
varying vec2 vAxis;
varying vec4 vGlintPoints;
varying vec2 vGlintPowers;
varying float vGlintShare;
varying vec2 vPuffSeed;
${CAPSULE}
${EXPOSURE}
${PUFF}
${GLINT_FOOTPRINT}
void main() {
  vec3 c = capsule(vQuad, vStretch);
  if (c.z > 1.0) discard;
  float sceneDepth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r;
  if (gl_FragCoord.z > sceneDepth) discard;
  float travel = vStretch - 1.0;
  vec2 fragment = vec2(vQuad.x * vStretch, vQuad.y);
  float thickness, coverage;
  float glint = vGlintShare * (vGlintPowers.x * glintFootprint(fragment, vGlintPoints.xy, vAxis, travel, vDrawnPixelRadius)
    + vGlintPowers.y * glintFootprint(fragment, vGlintPoints.zw, vAxis, travel, vDrawnPixelRadius));
  if (vWeight > 1.0) {
    // A puff: its drops' area and water over its disc by the kernel, in lumps, and the rest of their glints (the header).
    float kernel = puffKernel(c.z, travel) * puffLumps(fragment, vPuffSeed, 1.0 - vGlintShare);
    coverage = PI * vAreaShare * vWeight * kernel;
    thickness = (4.0 / 3.0) * PI * vAreaShare * sqrt(vAreaShare) * vWeight * vRadius * kernel;
    glint += (1.0 - vGlintShare) * (vGlintPowers.x + vGlintPowers.y) * kernel / (vDrawnPixelRadius * vDrawnPixelRadius);
  } else {
    // The true drop's volume, spread over the drawn disc and the streak.
    thickness = 2.0 * sqrt(1.0 - c.z) * vRadius * vAreaShare * sqrt(vAreaShare) / vStretch;
    coverage = exposureShare(fragment.x, fragment.y, travel) * vAreaShare;
  }
  gl_FragColor = vec4(thickness, coverage, glint, 0.0);
}
`;

// Night vision, just before the tone map (COMPOSITE_FRAGMENT, and the
// composite's own tone map in src/splash.js). By moonlight the eye's rods
// see, which take no colour and are most sensitive to blue-green: uNight
// (lighting.night, src/sky.js: 0 by day, 1 where rods see most) mixes the
// colour towards the rods' luminance, the scotopic luminance from CIE XYZ
// that Jensen et al. use (A Physically-Based Night Sky Model, 2001),
// V = Y (1.33 (1 + (Y + Z) / X) − 1.68), divided by its value for white
// (D65, 2.573: brightness is the hour's light, src/sky.js; this changes
// only the colour, and a blue sky comes out twice as bright against white
// as it does to cones). A picture of what rods alone see is a grey
// photograph, so the night is drawn as a film draws one: the rods' image
// keeps NIGHT_COLOUR of the cones' colour (the mesopic eye still sees some
// under a moon), is tinted a moonlit blue, NIGHT_TINT at unit luminance
// (chromaticity (0.256, 0.257), all but Jensen's night blue at (0.25,
// 0.25), which as the only colour washed whole skies to one blue), and goes
// to white where it is bright (NIGHT_WHITE, its exposed luminance), so the
// moon's glitter and the splash's glints are silver on blue water. By day
// the colour passes untouched.
export const NIGHT_VISION = /* glsl */`
uniform float uNight;
#define NIGHT_TINT vec3(0.75, 0.99, 1.85)
#define NIGHT_COLOUR 0.4
#define NIGHT_WHITE vec2(0.5, 3.0)
#define RODS_WHITE 2.573
vec3 nightVision(vec3 color) {
  if (uNight <= 0.0) return color;
  float x = dot(color, vec3(0.4124, 0.3576, 0.1805));
  float y = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float z = dot(color, vec3(0.0193, 0.1192, 0.9505));
  float rods = max(y * (1.33 * (1.0 + (y + z) / max(x, 1e-9)) - 1.68), 0.0) / RODS_WHITE;
  vec3 cones = min(color / max(y, 1e-9), vec3(8.0));   // the colour at unit luminance
  vec3 tint = mix(NIGHT_TINT, vec3(1.0), smoothstep(NIGHT_WHITE.x, NIGHT_WHITE.y, rods * uExposure / 0.6));
  return mix(color, rods * tint * mix(vec3(1.0), cones, NIGHT_COLOUR), uNight);
}
`;

export const COMPOSITE_FRAGMENT = /* glsl */`
uniform sampler2D uScene;
uniform sampler2D uFluidInfo;  // the depth pass: view depth, class, view normal xy (nearest)
uniform sampler2D uOptics;     // the optics pass: thickness, coverage, glint, aeration (filtered)
uniform samplerCube uEnvCube;
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;
uniform vec3 uSunDirView;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uAbsorb;
uniform vec3 uExtinction;       // per metre: absorption plus scattering (lighting.extinction)
uniform vec3 uFloorLight;       // the sunlit sand floor's radiance, under the water (src/splash.js)
uniform vec3 uWaterColor;       // the radiance of water too deep to see through (lighting.waterColor)
uniform float uPondDepth;
uniform float uExposure;
uniform sampler2D uGlare;       // the scene's glare (src/glare.js), at the frame's uv
uniform float uGlareShare;      // and the share of the scene it stands in for
uniform float uRefract;
uniform float uFluidScale;      // fluid-buffer pixels per device pixel (the buffer's resolution scale)
uniform float uProjScale;       // fluid-buffer pixels per world unit at distance 1
uniform vec2 uFluidTexel;       // one fluid-buffer pixel, in uv
varying vec2 vUv;
${GLSL_COMMON}
${FRESNEL}
${NIGHT_VISION}
${HAZE}
#define WATER_SLOPE_VARIANCE 0.006   // the sheet's and the column's unresolved ripple, for their glitter...
#define SHEET_ROUGH_VARIANCE 0.05    // ...plus this times their aeration (white water is rough water)
#define COLUMN_INNER 0.35            // the share of a column's refracted light that is its mean light, carried round inside it (the header)
#define DROP_INNER 0.1               // and a drop's (less: a drop's dark top is what makes it a glass bead)
#define COLUMN_LENS 0.45             // a column's lens image: the scene behind, shifted by the ray's turn through it by this share of a far scene's shift...
#define COLUMN_LENS_SCENE 0.7        // ...making this share of its refracted light (the rest the pond's model light)...
#define COLUMN_LENS_WIDTH vec2(40.0, 120.0)   // ...on a column up to this many device pixels in radius, none from the second
#define GLITTER_CAP 40.0
${MEAN_LIGHT}
#define BEAD_FROM 0.5                // device-pixel radius at which a drop starts to be a glass bead...
#define BEAD_FULL 1.0                // ...and is one (two pixels wide)
#define DETAIL_FROM 1.0              // device-pixel radius from which a bead shows its lens image...
#define DETAIL_FULL 2.5              // ...in full, where it stands still (a streak averages it)
#define COLUMN_DETAIL_FROM 1.0       // and a column's, across its radius in device pixels
#define COLUMN_DETAIL_FULL 3.0

vec3 viewPosition(vec2 uv, float depth) {
  vec4 farPoint = uInverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  farPoint.xyz /= farPoint.w;
  return farPoint.xyz * (depth / -farPoint.z);
}

vec3 aces(vec3 color) {
  const mat3 inputMatrix = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outputMatrix = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = inputMatrix * color;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(outputMatrix * (a / b), 0.0, 1.0);
}

// Light arriving along a world direction at a point a little above the pond:
// the sky (the photographed panorama, far shore and all) above the horizon;
// below it the pond, a rough mirror of it with the sun's glitter (effective
// roughness GLITTER_ROUGHNESS, wider than the water shader's own because its
// waves spread the glitter too), and the light from under its surface as the
// water shader makes it: the sand floor seen through the water along the ray
// (depth over the sine of its elevation), fading by the water's extinction
// into the water's own colour. So a steep look into the pond shows the sand
// under it, a grazing one the sky's reflection over dark green water.
// body is the share left for light from under the surface (1 − Fresnel).
#define GLITTER_ROUGHNESS 0.4
vec3 pondView(vec3 direction, vec3 sunWorld, out float body) {
  if (direction.y >= 0.0) { body = 0.0; return textureCubeLodEXT(uEnvCube, direction, 1.0).rgb; }
  float cosine = -direction.y;
  float fresnel = waterFresnel(cosine);
  body = 1.0 - fresnel;
  float path = uPondDepth / max(cosine, 0.02);
  vec3 under = mix(uWaterColor, uFloorLight, exp(-uExtinction * path));
  vec3 sky = textureCubeLodEXT(uEnvCube, vec3(direction.x, max(cosine, 0.04), direction.z), 2.0).rgb;
  vec3 halfVector = normalize(sunWorld - direction);
  float alpha = GLITTER_ROUGHNESS * GLITTER_ROUGHNESS;
  float alphaSquared = alpha * alpha;
  float denominator = halfVector.y * halfVector.y * (alphaSquared - 1.0) + 1.0;
  float distribution = alphaSquared / (PI * denominator * denominator);
  float glitterFresnel = waterFresnel(dot(-direction, halfVector));
  vec3 glitter = uSunIrradiance * distribution * glitterFresnel * 0.25 / max(cosine, 0.05);
  return fresnel * sky + body * under + min(glitter, vec3(GLITTER_CAP));
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

// The nearest water the depth pass wrote in the eight buffer pixels around a pixel it wrote none in (the header).
vec4 nearestInfo(vec2 uv) {
  vec4 nearest = vec4(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec4 candidate = texture2D(uFluidInfo, uv + vec2(float(dx), float(dy)) * uFluidTexel);
      if (candidate.r > 0.0 && (nearest.r <= 0.0 || candidate.r < nearest.r)) nearest = candidate;
    }
  }
  return nearest;
}

void main() {
  vec3 scene = mix(texture2D(uScene, vUv).rgb, texture2D(uGlare, vUv).rgb, uGlareShare);
  vec4 info = texture2D(uFluidInfo, vUv);
  vec4 optics = texture2D(uOptics, vUv);
  vec3 color = scene;
  if (optics.g > 0.0 || optics.b > 0.0) {
    if (info.r <= 0.0) info = nearestInfo(vUv);
    float thickness = optics.r;
    float coverage = optics.g;
    vec3 sunWorld = normalize((uCameraWorld * vec4(uSunDirView, 0.0)).xyz);
    // A drop's mean light, all a fine drop or a streak shows: see the header.
    vec3 meanLight = MEAN_SKY * uSkyAmbient + MEAN_BEHIND * scene;
    vec3 fluid = meanLight;
    float alpha = 1.0 - exp(-coverage);
    if (info.r > 0.0) {
      float sheet = step(998.75, info.g);
      float column = step(997.75, info.g) - sheet;
      float roundness = column > 0.5 ? clamp((info.g - 998.0) * 2.0, 0.0, 1.0) : 1.0;
      vec3 normal = vec3(info.b, info.a, sqrt(max(1.0 - info.b * info.b - info.a * info.a, 0.0)));
      vec3 position = viewPosition(vUv, info.r);
      vec3 toViewer = normalize(-position);
      float fresnel = waterFresnel(dot(normal, toViewer));
      vec3 worldNormal = normalize((uCameraWorld * vec4(normal, 0.0)).xyz);
      vec3 worldToViewer = normalize((uCameraWorld * vec4(toViewer, 0.0)).xyz);
      vec3 absorbed = exp(-uAbsorb * thickness);
      float bodyReflected;
      vec3 reflected = pondView(reflect(-worldToViewer, worldNormal), sunWorld, bodyReflected);
      vec3 refracted;
      if (sheet > 0.5) {
        // A thin film: what is behind, barely shifted.
        vec2 refractUv = clamp(vUv + normal.xy * uRefract * min(thickness, 0.06), vec2(0.001), vec2(0.999));
        refracted = texture2D(uScene, refractUv).rgb * absorbed;
      } else {
        // A lens, a tube or a sphere: see the header.
        vec3 eye = -toViewer;
        // Sphere: turn within the plane of the ray and the normal.
        float cosIncidence = clamp(dot(normal, toViewer), 0.0, 1.0);
        float sinIncidence = sqrt(1.0 - cosIncidence * cosIncidence);
        float deviation = 2.0 * (asin(sinIncidence) - asin(sinIncidence / 1.333));
        vec3 outward = normal - cosIncidence * toViewer;
        float outwardLength = length(outward);
        vec3 sphereExit = outwardLength > 1e-4 ? eye * cos(deviation) - (outward / outwardLength) * sin(deviation) : eye;
        vec3 exitView = sphereExit;
        if (column > 0.5) {
          // Tube: keep the slope along the (vertical) axis, turn across it.
          vec3 axis = vec3(uCameraWorld[0].y, uCameraWorld[1].y, uCameraWorld[2].y);
          float along = dot(eye, axis);
          vec3 across = eye - along * axis;
          float acrossLength = max(length(across), 1e-4);
          vec3 acrossUnit = across / acrossLength;
          vec3 normalAcross = normal - dot(normal, axis) * axis;
          normalAcross /= max(length(normalAcross), 1e-4);
          float cosAcross = clamp(-dot(acrossUnit, normalAcross), 0.0, 1.0);
          float sinAcross = sqrt(1.0 - cosAcross * cosAcross);
          float index = sqrt(1.777 - along * along) / acrossLength;
          float turn = 2.0 * (asin(sinAcross) - asin(sinAcross / index));
          vec3 sideways = normalAcross + cosAcross * acrossUnit;
          float sidewaysLength = length(sideways);
          vec3 tubeExit = sidewaysLength > 1e-4 ? (acrossUnit * cos(turn) - (sideways / sidewaysLength) * sin(turn)) * acrossLength + along * axis : eye;
          exitView = normalize(mix(tubeExit, sphereExit, roundness));
        }
        float bodyEye, bodyExit;
        vec3 eyeLight = pondView(-worldToViewer, sunWorld, bodyEye);
        vec3 exitLight = pondView(normalize((uCameraWorld * vec4(exitView, 0.0)).xyz), sunWorld, bodyExit);
        vec3 under = scene - eyeLight;
        float carry = bodyEye > 0.01 ? 1.0 / bodyEye : 0.0;
        refracted = max(exitLight + under * bodyExit * carry, 0.0) * absorbed;
        reflected = max(reflected + under * bodyReflected * carry, 0.0);
        if (column > 0.5) {
          // The column's lens image (the header): the scene where the turned ray points, as far as the frame holds
          // it; not where the surface flares from the axis (the foot's trumpet, whose turn the tube's law does not
          // give) nor on a column wider on screen than COLUMN_LENS_WIDTH (whose background is the lip and the foam
          // close behind it, which a far scene's shift smears into panels).
          vec2 lensUv = vUv + (exitView.xy / max(-exitView.z, 0.05) - eye.xy / max(-eye.z, 0.05)) * uProjScale * uFluidTexel * COLUMN_LENS;
          float held = step(0.0, lensUv.x) * step(lensUv.x, 1.0) * step(0.0, lensUv.y) * step(lensUv.y, 1.0);
          vec3 axisView = vec3(uCameraWorld[0].y, uCameraWorld[1].y, uCameraWorld[2].y);
          float tube = 1.0 - smoothstep(0.3, 0.7, abs(dot(normal, axisView)));
          float widthPixels = 0.5 * thickness / max(normal.z, 0.3) * uProjScale / info.r / uFluidScale;
          float narrow = 1.0 - smoothstep(COLUMN_LENS_WIDTH.x, COLUMN_LENS_WIDTH.y, widthPixels);
          vec3 lensScene = texture2D(uScene, clamp(lensUv, vec2(0.001), vec2(0.999))).rgb;
          refracted = mix(refracted, lensScene * absorbed, COLUMN_LENS_SCENE * held * tube * narrow);
        }
        // The light carried round inside the lens (the header).
        refracted = mix(refracted, meanLight, mix(DROP_INNER, COLUMN_INNER, column));
      }
      vec3 surface = mix(refracted, reflected, fresnel);
      // The rim bead, torn edges and froth, and a column's bubbly water, are aerated: a white scattering, brightest towards the sun.
      float forward = pow(clamp(0.5 - 0.5 * dot(toViewer, uSunDirView), 0.0, 1.0), 6.0);
      vec3 scattering = vec3(0.85, 0.88, 0.90) * (uSkyAmbient * 1.2 + uSunIrradiance * (0.08 + 0.7 * forward));
      // Where holes or the sheet's edge cover part of a pixel, the optics carry that share in the
      // aeration as in the coverage, and the alpha applies it: divide it out of the aeration.
      float aeration = optics.a / max(min(coverage, 1.0), 1e-3);
      // The sheet and the column glitter as the pond does, rougher where they are white; a drop's glints are in the optics.
      if (sheet + column > 0.5) surface += min(sunGlitter(worldNormal, worldToViewer, sunWorld, uSunIrradiance, WATER_SLOPE_VARIANCE + SHEET_ROUGH_VARIANCE * clamp(aeration, 0.0, 1.0)), vec3(GLITTER_CAP));
      // A column's white water is a body, not a film, and so is a sheet gone white: lit by the sky and shaded by the sun on its side.
      vec3 columnScattering = scattering * (0.55 + 0.45 * clamp(dot(worldNormal, sunWorld), 0.0, 1.0));
      surface = mix(surface, mix(scattering, columnScattering, clamp(column + sheet * aeration, 0.0, 1.0)), (sheet + column) * clamp(aeration, 0.0, 1.0));
      float drop = 1.0 - sheet - column;
      // On-screen radius in device pixels: a drop's from the depth pass, a column's from the water across it.
      float deviceRadius = mix(info.g, 0.5 * thickness / max(normal.z, 0.3) * uProjScale / info.r, column) / uFluidScale;
      float detail = sheet + column * smoothstep(COLUMN_DETAIL_FROM, COLUMN_DETAIL_FULL, deviceRadius)
        + drop * smoothstep(DETAIL_FROM, DETAIL_FULL, deviceRadius) * smoothstep(0.3, 0.9, coverage);
      fluid = mix(meanLight, surface, detail);
      // In haze (src/sky.js) the water in the air fades by its distance, as the scene behind it does; a fine drop's
      // mean light is the haze's already, the scene's and the sky's.
      fluid = withHaze(fluid, length(position));
      float glass = max(sheet + column, drop * smoothstep(BEAD_FROM, BEAD_FULL, deviceRadius));
      alpha = mix(alpha, min(coverage, 1.0), glass);
    }
    color = mix(scene, fluid, alpha) + uSunIrradiance * optics.b;
  }
  color = aces(nightVision(color) * uExposure / 0.6);
  gl_FragColor = vec4(linearToSrgb(color), 1.0);
}
`;

// ---- the mirror image: cheap water seen from below the pond (src/main.js) ----

// World position and directions from view space, for any camera (the mirror's
// included). The mirror pass draws each kind twice: its colour, then
// (uMirrorDistance 1, the same program with another blend) its distance.
// The distance draw writes nothing where the fragment covers less than
// MIRROR_NEAR_COVERAGE of its pixel (a thin sheet's face: the reflected ray
// goes on through it to the sky, so the water reflects that sky there, by
// direction), and elsewhere its nearness to the mirror camera,
// 1 − MIRROR_NEARNESS_SCALE / distance, into alpha, leaving the colour as it
// is; the blend keeps the least, the nearest. The dome and the clear leave
// alpha at 1, as far as it gets. The water shader reads it back
// (WATER_FRAGMENT in src/shaders/scene.js, which says why). Half floats keep
// a distance of 2 to 8 m to 1 to 8 mm this way.
const MIRROR_COMMON = /* glsl */`
#define MIRROR_NEAR_COVERAGE 0.1
#define MIRROR_NEARNESS_SCALE 4.0
uniform samplerCube uEnvCube;
uniform float uMirrorDistance;
uniform float uMirrorLevel;    // the mirror's plane: the water's height under the splash (0 but under a gale, src/main.js)
${FRESNEL}
vec3 worldFromView(vec3 viewVector) { return viewVector * mat3(viewMatrix); }
vec4 mirrorNearness(float coverage, vec3 viewPoint) {
  if (coverage < MIRROR_NEAR_COVERAGE) discard;
  return vec4(0.0, 0.0, 0.0, 1.0 - MIRROR_NEARNESS_SCALE / max(length(viewPoint), 0.05));
}
`;

// A sheet: the sky's Fresnel reflection, and its aerated bead's and froth's
// scattering, through its holes (SHEET_FROTH).
export const MIRROR_SHEET_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying vec3 vViewRimTangent;
varying float vAeration;
varying float vRod;
varying vec3 vSheet;
varying vec2 vFroth;
${MIRROR_COMMON}
${SHEET_FROTH}
void main() {
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
  SheetFroth froth = sheetFroth(vSheet, vFroth, vAeration, vRod, dot(normal, toViewer));
  if ((worldFromView(vViewPosition) + cameraPosition).y < uMirrorLevel || froth.hole) discard;
  normal = normalize(normal + vViewRimTangent);
  float fresnel = waterFresnel(dot(normal, toViewer));
  float aerated = min(RIM_AERATION * vAeration + froth.whiteness, 1.0) * (1.0 - fresnel) * froth.present;
  fresnel *= froth.present;
  if (uMirrorDistance > 0.5) { gl_FragColor = mirrorNearness(fresnel + aerated, vViewPosition); return; }
  vec3 reflected = textureCubeLodEXT(uEnvCube, worldFromView(reflect(-toViewer, normal)), 1.0).rgb;
  gl_FragColor = vec4(fresnel * reflected + aerated * uSkyAmbient * 1.2, fresnel + aerated);
}
`;

// A column: the sky's Fresnel reflection. A tube bends light only across its
// axis, so from below it shows the sky behind it, which the dome already is.
// All of it is near for the distance draw, faces included: what a reflected
// ray sees through a glass rod is the rod's image of the sky, which moves
// with the rod, not with the sky far behind it.
export const MIRROR_COLUMN_FRAGMENT = /* glsl */`
varying vec3 vViewPosition;
varying vec3 vViewNormal;
${MIRROR_COMMON}
void main() {
  if ((worldFromView(vViewPosition) + cameraPosition).y < uMirrorLevel) discard;
  vec3 toViewer = normalize(-vViewPosition);
  vec3 normal = normalize(vViewNormal);
  if (dot(normal, toViewer) < 0.0) normal = -normal;
  float fresnel = waterFresnel(dot(normal, toViewer));
  if (uMirrorDistance > 0.5) { gl_FragColor = mirrorNearness(1.0, vViewPosition); return; }
  vec3 reflected = textureCubeLodEXT(uEnvCube, worldFromView(reflect(-toViewer, normal)), 1.0).rgb;
  gl_FragColor = vec4(fresnel * reflected, fresnel);
}
`;

// A drop: the sky's Fresnel reflection on its sphere and, through it, its
// mean light (MEAN_SKY of the sky's mean radiance over the rest of what is
// behind, as in the composite), over the share of the pixel it covers, and
// its glints.
export const MIRROR_DROP_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
${MEAN_LIGHT}
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
varying vec2 vQuad;
varying vec3 vViewCentre;
varying float vDrawnPixelRadius;
varying float vAreaShare;
varying float vWeight;
varying float vStretch;
varying vec2 vAxis;
varying vec4 vGlintPoints;
varying vec2 vGlintPowers;
varying float vGlintShare;
varying vec2 vPuffSeed;
${MIRROR_COMMON}
${CAPSULE}
${EXPOSURE}
${PUFF}
${GLINT_FOOTPRINT}
void main() {
  if ((worldFromView(vViewCentre) + cameraPosition).y < uMirrorLevel) discard;
  vec3 c = capsule(vQuad, vStretch);
  if (c.z > 1.0) discard;
  vec2 perpendicular = vec2(-vAxis.y, vAxis.x);
  vec3 normal = vec3(vAxis * c.x + perpendicular * c.y, sqrt(1.0 - c.z));
  float fresnel = waterFresnel(normal.z);
  float travel = vStretch - 1.0;
  vec2 fragment = vec2(vQuad.x * vStretch, vQuad.y);
  float coverage;
  float glint = vGlintShare * (vGlintPowers.x * glintFootprint(fragment, vGlintPoints.xy, vAxis, travel, vDrawnPixelRadius)
    + vGlintPowers.y * glintFootprint(fragment, vGlintPoints.zw, vAxis, travel, vDrawnPixelRadius));
  if (vWeight > 1.0) {
    // A puff: its drops' coverage over its disc by the kernel, in lumps, and the rest of their glints (the header).
    float kernel = puffKernel(c.z, travel) * puffLumps(fragment, vPuffSeed, 1.0 - vGlintShare);
    coverage = PI * vAreaShare * vWeight * kernel;
    glint += (1.0 - vGlintShare) * (vGlintPowers.x + vGlintPowers.y) * kernel / (vDrawnPixelRadius * vDrawnPixelRadius);
  } else {
    coverage = exposureShare(fragment.x, fragment.y, travel) * vAreaShare;
  }
  float body = MEAN_SKY * (1.0 - fresnel);
  if (uMirrorDistance > 0.5) { gl_FragColor = mirrorNearness(coverage * (fresnel + body), vViewCentre); return; }
  vec3 reflected = textureCubeLodEXT(uEnvCube, worldFromView(reflect(vec3(0.0, 0.0, -1.0), normal)), 1.0).rgb;
  gl_FragColor = vec4(coverage * (fresnel * reflected + body * uSkyAmbient) + uSunIrradiance * glint, coverage * (fresnel + body));
}
`;
