// GLSL for the pond: water surface with the foam's bubble pattern
// (FOAM_PATTERN), pond floor with caustics, bubbles, the foam specks that
// ride the surface after a splash (src/foamSpecks.js), and where the still
// surface shows what is under it (SEEN_THROUGH_WATER). All scene passes
// render linear HDR radiance; the composite pass tone-maps.
//
// GLSL_COMMON also carries the ambient wind waves (src/ambientWaves.js) and
// their gust envelope, and the rings that cross the whole pond
// (src/rings.js), for every shader that rides or shades the surface; the
// uniforms it declares come from AmbientWaves.uniforms() and Rings.uniforms()
// and stay inactive in shaders that never call the functions using them.
import { MAX_RINGS, PROFILE_TEXELS, PROFILE_MAPPING, RING_TEXTURE_UNITS } from '../rings.js';

export const GLSL_COMMON = /* glsl */`
#define PI 3.141592653589793

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Soft mask that is 1 over the simulated patch and fades to 0 at its rim, so the
// periodic patch meets the flat water outside it without a seam.
float patchMask(vec2 domainUv) {
  vec2 d = abs(domainUv - 0.5) * 2.0;
  float edge = max(d.x, d.y);
  return 1.0 - smoothstep(0.78, 0.98, edge);
}

// Ambient wind waves: a periodic tile of ripples (src/ambientWaves.js) laid
// over all the water and multiplied by the gust envelope. Its texture holds
// height, ∂h/∂x, ∂h/∂z and ∇²h (r, g, b, a) in units of
// uAmbientMetresPerUnit, mipmapped and repeat-wrapped.
uniform sampler2D uAmbientHeight;
uniform float uAmbientTileSize;      // metres per side of the tile
uniform float uAmbientTexels;        // texels per side
uniform float uAmbientMetresPerUnit;
uniform vec2 uWindDirection;         // world XZ the wind blows toward, unit length
uniform float uGustTime;             // world seconds

// Gusts: cat's paws. Patches of ripple about GUST_SCALE metres across drift
// downwind at GUST_DRIFT m/s over calmer water, which keeps GUST_CALM of the
// ripple so it is never glass. Two octaves of value noise, turned off the
// world axes so the noise lattice never lines up with the view; the finer one
// drifts half as fast again, so the patches change shape as they travel. The
// smoothstep from GUST_EDGE_LOW to GUST_EDGE_HIGH makes them patches rather
// than a gentle swell of ripple. The splash's own ripples are not modulated.
#define GUST_SCALE 3.0
#define GUST_DRIFT 1.5
#define GUST_CALM 0.25
#define GUST_EDGE_LOW 0.42
#define GUST_EDGE_HIGH 0.62
float gustEnvelope(vec2 worldXZ, float time) {
  vec2 coarse = mat2(0.8, 0.6, -0.6, 0.8) * (worldXZ - uWindDirection * GUST_DRIFT * time) / GUST_SCALE;
  vec2 fine = mat2(0.6, -0.8, 0.8, 0.6) * (worldXZ - uWindDirection * 1.5 * GUST_DRIFT * time) / (0.45 * GUST_SCALE) + 13.7;
  float field = 0.65 * valueNoise(coarse) + 0.35 * valueNoise(fine);
  return mix(GUST_CALM, 1.0, smoothstep(GUST_EDGE_LOW, GUST_EDGE_HIGH, field));
}

// Height of the ambient waves at full gust, metres. In a vertex shader the
// lookup is at the base level; in a fragment shader at the pixel's mip level.
float ambientHeightAtFullGust(vec2 worldXZ) {
  return texture2D(uAmbientHeight, worldXZ / uAmbientTileSize).r * uAmbientMetresPerUnit;
}

float ambientHeight(vec2 worldXZ) {
  return ambientHeightAtFullGust(worldXZ) * gustEnvelope(worldXZ, uGustTime);
}

// Slope (dh/dx, dh/dz) at full gust, exact (from the spectrum), read at the
// pixel's mip level so far ripples average to flat. The water shader
// multiplies it by the gust envelope it also needs for its roughness.
vec2 ambientSlopeAtFullGust(vec2 worldXZ) {
  return texture2D(uAmbientHeight, worldXZ / uAmbientTileSize).gb * uAmbientMetresPerUnit;
}

// Laplacian of the height (1/m), exact, at the pixel's mip level. The sun's
// disc blurs a caustic on the floor 0.8 m down by under a centimetre, less
// than a texel, so it needs no blur of its own.
float ambientLaplacian(vec2 worldXZ) {
  return texture2D(uAmbientHeight, worldXZ / uAmbientTileSize).a * uAmbientMetresPerUnit * gustEnvelope(worldXZ, uGustTime);
}

// Rings (src/rings.js): each live ring's radial profile is a layer of
// uRingProfiles, holding (∂η0/∂r, ∂η1/∂r, η1, η0) in RING_METRES_PER_UNIT: the
// ring is η0(r) + η1(r)·cos θ, r from its centre and θ from its direction
// (the throw's; η1 is 0 for a ring with none). A radius r lies at
// u = (√(a² + 4(1 + a)r/R) − a)/2 along the layer (R the ring's reach, a
// RING_PROFILE_MAPPING), texel i at u = i/(N − 1), so the centre and the
// reach are texel centres. A ring has nothing inside its inner radius (the
// water it has left) or beyond its outer one (where it has not yet come, or
// past its reach), so a lookup there skips it: a ring costs a pixel only
// where its waves are. The layers are mipmapped, so each lookup averages
// the ring over the pixel's footprint along the radius: a fragment shader
// passes its derivatives, a vertex shader the spacing it needs. The caller
// branches on uRingCount, so with no ring alive none of this runs. Per ring
// and pixel inside its annulus: one fetch (two for the floor's Laplacian)
// and about 35 operations.
#define MAX_RINGS ${MAX_RINGS}
#define RING_PROFILE_TEXELS ${PROFILE_TEXELS.toFixed(1)}
#define RING_PROFILE_MAPPING ${PROFILE_MAPPING.toFixed(4)}
#define RING_METRES_PER_UNIT ${(1 / RING_TEXTURE_UNITS).toFixed(4)}
#define RING_CAUSTIC_STEP 0.02     // metres either side over which the floor's Laplacian differences the slope
uniform int uRingCount;
uniform vec4 uRingPlaces[MAX_RINGS];   // centre x, z; the direction θ is measured from, x, z
uniform vec4 uRingShapes[MAX_RINGS];   // reach R (m), outer radius (m, at most R), layer, inner radius (m)
uniform highp sampler2DArray uRingProfiles;

// Where radius r lies along a ring's profile as a texture coordinate, and its
// rate of change with r: u, then (u·(N − 1) + ½)/N.
vec2 ringCoordinate(float radius, vec4 shape) {
  float position = 0.5 * (sqrt(RING_PROFILE_MAPPING * RING_PROFILE_MAPPING + 4.0 * (1.0 + RING_PROFILE_MAPPING) * radius / shape.x) - RING_PROFILE_MAPPING);
  float rate = (1.0 + RING_PROFILE_MAPPING) / (shape.x * (2.0 * position + RING_PROFILE_MAPPING));
  return vec2(position, rate) * ((RING_PROFILE_TEXELS - 1.0) / RING_PROFILE_TEXELS) + vec2(0.5 / RING_PROFILE_TEXELS, 0.0);
}

// The rings' height (m), each read at the mip level whose texels are about
// spacing metres along its radius (a vertex shader has no derivatives).
float ringHeight(vec2 worldXZ, float spacing) {
  float height = 0.0;
  for (int index = 0; index < MAX_RINGS; index++) {
    if (index >= uRingCount) break;
    vec4 place = uRingPlaces[index];
    vec4 shape = uRingShapes[index];
    vec2 offset = worldXZ - place.xy;
    float radius = length(offset);
    if (radius >= shape.y || radius < shape.w) continue;
    vec2 coordinate = ringCoordinate(radius, shape);
    float level = log2(max(spacing * coordinate.y * RING_PROFILE_TEXELS, 1.0));
    vec4 profile = textureLod(uRingProfiles, vec3(coordinate.x, 0.5, shape.z), level);
    height += profile.w + profile.z * dot(offset, place.zw) / max(radius, 1e-6);
  }
  return height * RING_METRES_PER_UNIT;
}

// The rings' slope (∂η/∂x, ∂η/∂z), each averaged over the pixel's footprint
// along its radius (acrossX, acrossY: dFdx and dFdy of the world XZ). With
// r̂ outward, cos θ = r̂·e and sin θ = r̂·e⊥ (e⊥ = e turned a right angle):
//     ∇(η0 + η1 cos θ) = (∂η0/∂r + ∂η1/∂r cos θ) r̂ − (η1/r) sin θ θ̂,   θ̂ = −sin θ e + cos θ e⊥.
vec2 ringSlope(vec2 worldXZ, vec2 acrossX, vec2 acrossY) {
  vec2 slope = vec2(0.0);
  for (int index = 0; index < MAX_RINGS; index++) {
    if (index >= uRingCount) break;
    vec4 place = uRingPlaces[index];
    vec4 shape = uRingShapes[index];
    vec2 offset = worldXZ - place.xy;
    float radius = length(offset);
    if (radius >= shape.y || radius < shape.w) continue;
    vec2 outward = offset / max(radius, 1e-6);
    vec2 coordinate = ringCoordinate(radius, shape);
    vec4 profile = textureGrad(uRingProfiles, vec3(coordinate.x, 0.5, shape.z),
      vec2(coordinate.y * dot(outward, acrossX), 0.0), vec2(coordinate.y * dot(outward, acrossY), 0.0));
    vec2 sideways = vec2(-place.w, place.z);
    float along = dot(outward, place.zw);
    float side = dot(outward, sideways);
    slope += (profile.x + profile.y * along) * outward - profile.z / max(radius, 0.002) * side * (along * sideways - side * place.zw);
  }
  return slope * RING_METRES_PER_UNIT;
}

// The rings' Laplacian (1/m), for the floor's caustics: ∂²η0/∂r² + (∂η0/∂r)/r,
// and (∂²η1/∂r² + (∂η1/∂r)/r − η1/r²)·cos θ, the second derivative differenced
// over twice RING_CAUSTIC_STEP. Each lookup is averaged over the footprint.
float ringLaplacian(vec2 worldXZ, vec2 acrossX, vec2 acrossY) {
  float laplacian = 0.0;
  for (int index = 0; index < MAX_RINGS; index++) {
    if (index >= uRingCount) break;
    vec4 place = uRingPlaces[index];
    vec4 shape = uRingShapes[index];
    vec2 offset = worldXZ - place.xy;
    float radius = length(offset);
    if (radius - RING_CAUSTIC_STEP >= shape.y || radius + RING_CAUSTIC_STEP < shape.w) continue;
    vec2 outward = offset / max(radius, 1e-6);
    float inner = max(radius - RING_CAUSTIC_STEP, 0.0);
    float middle = inner + RING_CAUSTIC_STEP;
    vec2 innerCoordinate = ringCoordinate(inner, shape);
    vec2 outerCoordinate = ringCoordinate(inner + 2.0 * RING_CAUSTIC_STEP, shape);
    float rate = ringCoordinate(middle, shape).y;
    vec2 gradientX = vec2(rate * max(abs(dot(outward, acrossX)), RING_CAUSTIC_STEP), 0.0);
    vec2 gradientY = vec2(rate * dot(outward, acrossY), 0.0);
    vec4 innerProfile = textureGrad(uRingProfiles, vec3(innerCoordinate.x, 0.5, shape.z), gradientX, gradientY);
    vec4 outerProfile = textureGrad(uRingProfiles, vec3(outerCoordinate.x, 0.5, shape.z), gradientX, gradientY);
    vec4 mean = 0.5 * (innerProfile + outerProfile);
    vec2 bend = (outerProfile.xy - innerProfile.xy) / (2.0 * RING_CAUSTIC_STEP);
    float zeroth = bend.x + mean.x / middle;
    float first = bend.y + mean.y / middle - mean.z / (middle * middle);
    laplacian += zeroth + first * dot(outward, place.zw);
  }
  return laplacian * RING_METRES_PER_UNIT;
}

// Sun glitter (F0 = 0.02): the sun reflected by a surface whose normal is n
// and whose slopes finer than n resolves are Gaussian with total variance
// slopeVariance (both axes): the Beckmann distribution, with its Smith
// shadowing (Walter et al.'s rational fit). Gaussian tails, not GGX's long
// ones: water's slopes are close to Gaussian, and at grazing angles a GGX tail
// paints a bright smear toward the horizon where no slope reaches the sun.
// Returns outgoing radiance for a sun of the given irradiance.
float beckmannShadowing(float cosine, float slopeVariance) {
  float cotangentOverWidth = cosine / sqrt(slopeVariance * max(1.0 - cosine * cosine, 1e-6));
  if (cotangentOverWidth >= 1.6) return 1.0;
  return (3.535 * cotangentOverWidth + 2.181 * cotangentOverWidth * cotangentOverWidth)
    / (1.0 + 2.276 * cotangentOverWidth + 2.577 * cotangentOverWidth * cotangentOverWidth);
}

vec3 sunGlitter(vec3 normal, vec3 toViewer, vec3 toSun, vec3 sunIrradiance, float slopeVariance) {
  vec3 halfVector = normalize(toSun + toViewer);
  float nDotH = max(dot(normal, halfVector), 1e-3);
  float nDotV = max(dot(normal, toViewer), 1e-3);
  float nDotL = max(dot(normal, toSun), 0.0);
  float vDotH = max(dot(toViewer, halfVector), 0.0);
  float cosineSquared = nDotH * nDotH;
  float tangentSquared = (1.0 - cosineSquared) / cosineSquared;
  float distribution = exp(-tangentSquared / slopeVariance) / (PI * slopeVariance * cosineSquared * cosineSquared);
  float fresnel = 0.02 + 0.98 * pow(1.0 - vDotH, 5.0);
  float shadowing = beckmannShadowing(nDotV, slopeVariance) * beckmannShadowing(max(nDotL, 1e-3), slopeVariance);
  return sunIrradiance * distribution * shadowing * fresnel / max(4.0 * nDotV * nDotL, 1e-3) * nDotL;
}
`;

// The foam's bubble pattern, for WATER_FRAGMENT. The foam map
// (src/spectralWater.js) is smooth and coarse (1.2 cm texels on high, 2.3 cm
// on low); what makes foam look like foam is finer than that, so it is
// computed here, in world XZ (it stays put as the water moves) less how far
// the wind has drifted the foam (uFoamDrift, src/spectralWater.js), so the
// pattern rides with the map rather than the map sliding over it, from three
// layers of cellular noise, each a jittered grid with one feature per cell
// and a 3×3 cell search:
//   lace    FOAM_LACE_CELL cells, the edges of a power diagram (cells of
//           unequal size), each edge its own thickness, warped by value
//           noise so they curve, sinking smoothly into each cell: the
//           filaments around the holes that a thinning raft opens;
//   coarse  FOAM_COARSE_CELL cells, a bubble 3 to 7 mm across in each;
//   fine    FOAM_FINE_CELL cells, a bubble 1.7 to 3.3 mm across in each,
//           packed so they nearly touch.
// The bubbles of the two finer layers make one field, the signed distance
// to the nearest bubble's edge (positive inside, their union), in units of
// FOAM_BUBBLE_SCALE. The pattern is FOAM_LACE_WEIGHT·lace +
// FOAM_BUBBLE_WEIGHT·bubbles, and the map sets a density added to it,
// FOAM_LOG_SCALE·ln(foam / FOAM_MID), lumped by two value noises: FOAM_RAGGED
// at about 14 cm, so a raft's edge is ragged rather than a Gaussian's circle,
// and FOAM_CLUMP at about 3 cm, so the lace breaks into filaments of uneven
// width, fragments and clumps rather than an even net. Both are strong enough
// to show from 4 m on a phone, where a pixel is 3 by 10 mm and the bubbles
// have faded: there a map of 0.4, a fresh boil, covers about 87% (lumps and
// holes break the rest), 1 about 98%, 0.1, a raft, about 45%, 0.02 about 6%
// (tools/foam-probe.mjs measured them). A pixel is foam where
// pattern + density > 0: where the map is strong that is everywhere, a solid
// raft; as it weakens the holes in the lace open from their middles, then
// the filaments thin to strings of bubbles, then only the largest bubbles on
// them are left. The map decays at the same rate everywhere, so a raft thins
// from its weak edge inward, which is how foam pops; ln makes that steady in
// time.
//
// Antialiasing. The threshold's edge is one pixel wide at any distance: its
// width is the change of the pattern across the pixel, from the pattern's
// exact gradient (each layer is a distance, so its gradient is the unit
// vector from its winning feature; the noises' gradients are exact too)
// dotted with the pixel's world footprint (dFdx and dFdy of the world
// position, taken before the branch below, where derivatives are still
// defined). A layer whose cells shrink toward a pixel fades out, between
// FOAM_FADE_START and FOAM_FADE_END cells per pixel of footprint (the
// geometric mean of the footprint's two sides: at the home view's grazing
// angle a pixel is 3.5 times longer than wide), toward its median (the
// bubbles, once the coarse ones fade too, toward their union's), and is then
// not computed at all. FOAM_FADED_EDGE of its spread (measured, half the
// 10–90% range) widens the threshold's edge instead: with all of it the cover
// would be the expected share of the layer above the threshold, but a hole
// filling with unresolved bubbles would be a soft grey; with half, holes stay
// crisp and the cover stays within a few per cent of a supersampled render.
// Far foam reads as an even white of the right strength rather than as
// noise, and does not shimmer as the water moves under it.
// tools/foam-probe.mjs checks the medians, the spreads, the cover and the
// shimmer against supersampling, with these very constants.
//
// Cost, per pixel where the map exceeds FOAM_PRESENT (all other pixels skip
// it in one branch, and pay three derivatives; the drift is one subtraction,
// and the footprint takes a square root fewer than it did): each layer still resolved
// costs nine cell visits of about 50 operations (a hash of three outputs, a
// distance, the running best two), about 470; the lace's warp and the two
// lumps of the density add three value noises, about 230; the threshold,
// the shading and a glint about 100. At the home view, landscape or phone,
// only the lace is resolved where a throw usually lands: about 800
// operations per foam pixel, against about 300 and ten texture fetches for
// the rest of the water shader. A 12° close-up adds the coarse bubbles,
// about 1350; a throw a metre or two from the camera resolves all three,
// about 1800.
export const FOAM_PATTERN = /* glsl */`
#define FOAM_FINE_CELL 0.003               // metres
#define FOAM_FINE_RADII vec2(0.28, 0.55)   // bubble radius range, cells
#define FOAM_COARSE_CELL 0.008
#define FOAM_COARSE_RADII vec2(0.2, 0.45)
#define FOAM_LACE_CELL 0.03
#define FOAM_LACE_RADII vec2(0.0, 0.35)    // the power diagram's weights: cells of unequal size
#define FOAM_LACE_THICKNESS 0.45           // the lace is +1 on an edge and -1 this many cells from it...
#define FOAM_LACE_THINNING 0.7             // ...less up to this fraction, edge by edge
#define FOAM_LACE_DEPTH 3.5                // inside a cell the lace sinks smoothly toward -this
#define FOAM_LACE_WARP 1.0                 // cells, peak to peak
#define FOAM_LACE_WARP_FREQUENCY 30.0      // per metre
#define FOAM_BUBBLE_SCALE 0.0012           // metres inside a bubble's edge that make +1
#define FOAM_BUBBLE_CLAMP 2.0
#define FOAM_LACE_WEIGHT 0.4
#define FOAM_BUBBLE_WEIGHT 0.6
#define FOAM_MID 0.1                       // map value where the density is 0
#define FOAM_LOG_SCALE 0.857               // about 87% cover at 0.4, half at 0.1, nothing below about 0.01
#define FOAM_RAGGED 1.8                    // value noise lumps about 14 cm across: a raft's outline
#define FOAM_RAGGED_FREQUENCY 7.0          // per metre
#define FOAM_CLUMP 2.8                     // value noise lumps about 3 cm across, which break the lace
#define FOAM_CLUMP_FREQUENCY 35.0          // into filaments of uneven width, fragments and clumps (per metre)
#define FOAM_FADE_START 0.18               // footprint over cell size
#define FOAM_FADE_END 0.45
// Medians and spreads of the layers, measured over a large area: what a
// fading layer tends to, and the width it hands to the threshold.
#define FOAM_LACE_MEDIAN -0.61
#define FOAM_LACE_SPREAD 1.49
#define FOAM_FINE_MEDIAN 0.03
#define FOAM_FINE_SPREAD 0.6
#define FOAM_UNION_MEDIAN 0.26
#define FOAM_UNION_SPREAD 0.74
#define FOAM_CLUMP_SPREAD 0.29             // of the clump noise less 0.5, whose median is 0
#define FOAM_FADED_EDGE 0.5                // the share of a faded layer's spread that widens the edge
// Below this map value no pattern can reach the threshold.
#define FOAM_PRESENT (FOAM_MID * exp(-(FOAM_LACE_WEIGHT + FOAM_BUBBLE_WEIGHT * FOAM_BUBBLE_CLAMP + 0.5 * (FOAM_RAGGED + FOAM_CLUMP)) / FOAM_LOG_SCALE))
// Shading of a resolved bubble: its dome darkens to FOAM_RIM_SHADE at its
// edge, the crease where two bubbles meet to FOAM_CREASE_SHADE, the packed
// gaps between bubbles are FOAM_GAP_SHADE; FOAM_FADED_SHADE is the mean.
#define FOAM_RIM_SHADE 0.74
#define FOAM_CREASE_SHADE 0.82
#define FOAM_GAP_SHADE 0.86
#define FOAM_FADED_SHADE 0.93
#define FOAM_ALBEDO vec3(0.9, 0.92, 0.93)
#define FOAM_SKY_LIGHT 1.5                 // the sky lights foam from inside too, not only its top
#define FOAM_GLINT 2.0                     // a bubble's film has two faces
#define FOAM_GLINT_VARIANCE 0.02           // slope variance of the film's sheen
#define FOAM_THIN_OPACITY 0.65             // foam just over the threshold is a single layer of bubbles,
#define FOAM_OPAQUE 1.5                    // translucent; this far over it, opaque

vec3 foamHash(vec2 cell) {
  vec3 mixed = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973));
  mixed += dot(mixed, mixed.yxz + 33.33);
  return fract((mixed.xxy + mixed.yzz) * mixed.zyx);
}

// Value noise (GLSL_COMMON's) and its gradient.
float valueNoiseWithGradient(vec2 position, out vec2 gradient) {
  vec2 corner = floor(position);
  vec2 within = position - corner;
  vec2 ease = within * within * (3.0 - 2.0 * within);
  float lowerLeft = hash21(corner);
  float lowerRight = hash21(corner + vec2(1.0, 0.0));
  float upperLeft = hash21(corner + vec2(0.0, 1.0));
  float upperRight = hash21(corner + vec2(1.0, 1.0));
  float twist = lowerLeft - lowerRight - upperLeft + upperRight;
  gradient = 6.0 * within * (1.0 - within) * vec2(lowerRight - lowerLeft + twist * ease.y, upperLeft - lowerLeft + twist * ease.x);
  return lowerLeft + (lowerRight - lowerLeft) * ease.x + (upperLeft - lowerLeft) * ease.y + twist * ease.x * ease.y;
}

// Two independent value noises, x and y, and their Jacobian: column j
// holds the change of both along position j.
vec2 valueNoisePair(vec2 position, out mat2 jacobian) {
  vec2 corner = floor(position);
  vec2 within = position - corner;
  vec2 ease = within * within * (3.0 - 2.0 * within);
  vec2 easeSlope = 6.0 * within * (1.0 - within);
  vec2 lowerLeft = foamHash(corner).xy;
  vec2 lowerRight = foamHash(corner + vec2(1.0, 0.0)).xy;
  vec2 upperLeft = foamHash(corner + vec2(0.0, 1.0)).xy;
  vec2 upperRight = foamHash(corner + vec2(1.0, 1.0)).xy;
  vec2 twist = lowerLeft - lowerRight - upperLeft + upperRight;
  jacobian = mat2((lowerRight - lowerLeft + twist * ease.y) * easeSlope.x, (upperLeft - lowerLeft + twist * ease.x) * easeSlope.y);
  return lowerLeft + (lowerRight - lowerLeft) * ease.x + (upperLeft - lowerLeft) * ease.y + twist * ease.x * ease.y;
}

// One feature per cell, jittered by up to jitter/2 of a cell from its centre,
// with a radius drawn from radii. For the best two features, by radius minus
// distance (cell units; positive inside that feature's disc): the value and
// the offset of the point from the feature; the winner's radius; and the sum
// of the two features' random keys, which names the edge between them.
struct FoamCells {
  float best;
  float runnerUp;
  vec2 bestOffset;
  vec2 runnerUpOffset;
  float bestRadius;
  float edgeKey;
};

FoamCells foamCells(vec2 position, vec2 radii, float jitter, vec2 seed) {
  vec2 cell = floor(position);
  vec2 within = position - cell;
  FoamCells result = FoamCells(-10.0, -10.0, vec2(1.0, 0.0), vec2(1.0, 0.0), 1.0, 0.0);
  float bestKey = 0.0;
  float runnerUpKey = 0.0;
  for (int row = -1; row <= 1; row++) {
    for (int column = -1; column <= 1; column++) {
      vec2 neighbour = vec2(float(column), float(row));
      vec3 random = foamHash(cell + neighbour + seed);
      vec2 offset = within - neighbour - 0.5 - jitter * (random.xy - 0.5);
      float radius = mix(radii.x, radii.y, random.z);
      float inside = radius - length(offset);
      if (inside > result.best) {
        result.runnerUp = result.best;
        result.runnerUpOffset = result.bestOffset;
        runnerUpKey = bestKey;
        result.best = inside;
        result.bestOffset = offset;
        result.bestRadius = radius;
        bestKey = random.z;
      } else if (inside > result.runnerUp) {
        result.runnerUp = inside;
        result.runnerUpOffset = offset;
        runnerUpKey = random.z;
      }
    }
  }
  result.edgeKey = bestKey + runnerUpKey;
  return result;
}

struct FoamLook {
  float cover;        // the share of the pixel that is foam
  float opacity;      // of that foam: thin foam lets the water show through
  float shade;        // brightness of the foam there, about 0.75 to 1
  vec3 domeNormal;    // the normal of the bubble under the pixel, for its glint
  float glint;        // how much of that glint to show (0 once bubbles are unresolved)
  float glintVariance;   // the glint's slope variance, widened by the dome's turn across the pixel
};

// position: world XZ; acrossX, acrossY: its change across one pixel; foam:
// the map's value, above FOAM_PRESENT; foamChange: its change across a pixel;
// surfaceNormal: the water's, which tilts the bubbles with it.
FoamLook foamLook(vec2 position, vec2 acrossX, vec2 acrossY, float foam, vec2 foamChange, vec3 surfaceNormal) {
  float footprint = sqrt(sqrt(dot(acrossX, acrossX) * dot(acrossY, acrossY)));
  float fineFade = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint / FOAM_FINE_CELL);
  float coarseFade = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint / FOAM_COARSE_CELL);
  float laceFade = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint / FOAM_LACE_CELL);
  vec2 gradient = vec2(0.0);   // of the pattern, per metre

  // The lace: 1 on an edge, falling with the distance from it.
  float lace = FOAM_LACE_MEDIAN;
  if (laceFade < 1.0) {
    mat2 warpJacobian;
    vec2 warp = FOAM_LACE_WARP * (valueNoisePair(position * FOAM_LACE_WARP_FREQUENCY, warpJacobian) - 0.5);
    FoamCells cells = foamCells(position / FOAM_LACE_CELL + warp, FOAM_LACE_RADII, 0.9, vec2(3.0, 5.1));
    float thickness = FOAM_LACE_THICKNESS * (1.0 - FOAM_LACE_THINNING * fract(cells.edgeKey * 7.13));
    float raw = 1.0 - 2.0 * (cells.best - cells.runnerUp) / thickness;
    // Its gradient in the warped cell coordinates, then in metres through the warp.
    vec2 cellGradient = -2.0 / thickness * (cells.runnerUpOffset / max(length(cells.runnerUpOffset), 1e-4) - cells.bestOffset / max(length(cells.bestOffset), 1e-4));
    vec2 laceGradient = cellGradient / FOAM_LACE_CELL + FOAM_LACE_WARP * FOAM_LACE_WARP_FREQUENCY * (cellGradient * warpJacobian);
    // Below 0 it sinks toward -FOAM_LACE_DEPTH, never flat, so a hole opens
    // from its deepest point outward with a crisp edge.
    float sink = exp(min(raw, 0.0) / FOAM_LACE_DEPTH);
    lace = mix(raw > 0.0 ? raw : FOAM_LACE_DEPTH * (sink - 1.0), FOAM_LACE_MEDIAN, laceFade);
    gradient += FOAM_LACE_WEIGHT * (1.0 - laceFade) * sink * laceGradient;
  }

  // The bubbles: the union of the two layers' discs.
  FoamCells fine = FoamCells(-10.0, -10.0, vec2(1.0, 0.0), vec2(1.0, 0.0), 1.0, 0.0);
  float fineBubble = FOAM_FINE_MEDIAN;
  vec2 fineGradient = vec2(0.0);
  if (fineFade < 1.0) {
    fine = foamCells(position / FOAM_FINE_CELL, FOAM_FINE_RADII, 0.7, vec2(11.0, 18.7));
    fineBubble = mix(fine.best * FOAM_FINE_CELL / FOAM_BUBBLE_SCALE, FOAM_FINE_MEDIAN, fineFade);
    fineGradient = -fine.bestOffset / max(length(fine.bestOffset), 1e-4) * (1.0 - fineFade) / FOAM_BUBBLE_SCALE;
  }
  FoamCells coarse = fine;
  float coarseBubble = -FOAM_BUBBLE_CLAMP;
  vec2 coarseGradient = vec2(0.0);
  if (coarseFade < 1.0) {
    coarse = foamCells(position / FOAM_COARSE_CELL, FOAM_COARSE_RADII, 0.7, vec2(23.0, 39.1));
    coarseBubble = coarse.best * FOAM_COARSE_CELL / FOAM_BUBBLE_SCALE;
    coarseGradient = -coarse.bestOffset / max(length(coarse.bestOffset), 1e-4) / FOAM_BUBBLE_SCALE;
  }
  bool coarseWins = coarseBubble > fineBubble;
  float bubble = clamp(coarseWins ? coarseBubble : fineBubble, -FOAM_BUBBLE_CLAMP, FOAM_BUBBLE_CLAMP);
  gradient += FOAM_BUBBLE_WEIGHT * (1.0 - coarseFade) * step(abs(bubble), FOAM_BUBBLE_CLAMP - 1e-3) * (coarseWins ? coarseGradient : fineGradient);
  // Once the coarse bubbles fade too, the union tends to its own median.
  bubble = mix(bubble, FOAM_UNION_MEDIAN, coarseFade);

  // The density: the map's, lumped at two scales. The clumps fade like a layer.
  float clumpFade = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint * FOAM_CLUMP_FREQUENCY);
  float clump = 0.0;
  if (clumpFade < 1.0) {
    vec2 clumpSlope;
    clump = (valueNoiseWithGradient(position * FOAM_CLUMP_FREQUENCY + 57.3, clumpSlope) - 0.5) * (1.0 - clumpFade);
    gradient += FOAM_CLUMP * FOAM_CLUMP_FREQUENCY * (1.0 - clumpFade) * clumpSlope;
  }
  float density = FOAM_LOG_SCALE * log(foam / FOAM_MID) + FOAM_RAGGED * (valueNoise(position * FOAM_RAGGED_FREQUENCY + 31.7) - 0.5) + FOAM_CLUMP * clump;
  float value = FOAM_LACE_WEIGHT * lace + FOAM_BUBBLE_WEIGHT * bubble + density;
  float changeAcrossPixel = abs(dot(gradient, acrossX)) + abs(dot(gradient, acrossY)) + FOAM_LOG_SCALE * (abs(foamChange.x) + abs(foamChange.y)) / foam;
  float spreadOfFaded = FOAM_LACE_WEIGHT * FOAM_LACE_SPREAD * laceFade
    + FOAM_BUBBLE_WEIGHT * (FOAM_FINE_SPREAD * fineFade * (1.0 - coarseFade) + FOAM_UNION_SPREAD * coarseFade)
    + FOAM_CLUMP * FOAM_CLUMP_SPREAD * clumpFade;
  float width = 0.5 * changeAcrossPixel + FOAM_FADED_EDGE * spreadOfFaded + 1e-3;

  FoamLook look;
  look.cover = smoothstep(-width, width, value);
  look.opacity = mix(FOAM_THIN_OPACITY, 1.0, smoothstep(0.0, FOAM_OPAQUE, value));
  // Shading from the bubble that won the union, as resolved as its layer is.
  FoamCells winner = fine;
  float winnerFade = fineFade;
  if (coarseWins) { winner = coarse; winnerFade = coarseFade; }
  float radial = min(length(winner.bestOffset) / winner.bestRadius, 1.0);
  float domeHeight = sqrt(1.0 - radial * radial);
  float crease = smoothstep(0.0, 0.12, winner.best - winner.runnerUp);
  float insideBubble = step(0.0, winner.best);
  float resolvedShade = mix(FOAM_GAP_SHADE, mix(FOAM_RIM_SHADE, 1.0, smoothstep(0.0, 0.6, domeHeight)) * mix(FOAM_CREASE_SHADE, 1.0, crease), insideBubble);
  look.shade = mix(resolvedShade, FOAM_FADED_SHADE, winnerFade);
  look.domeNormal = normalize(vec3(winner.bestOffset.x / winner.bestRadius, 0.0, winner.bestOffset.y / winner.bestRadius) + surfaceNormal * (domeHeight + 0.05));
  look.glint = insideBubble * (1.0 - winnerFade);
  // Across one pixel the dome's normal turns by about the footprint over the
  // bubble's radius: a glint smaller than a pixel spreads into a faint sheen
  // of the same total light rather than a dot that flickers.
  float turnAcrossPixel = footprint / (winner.bestRadius * (coarseWins ? FOAM_COARSE_CELL : FOAM_FINE_CELL));
  look.glintVariance = FOAM_GLINT_VARIANCE + turnAcrossPixel * turnAcrossPixel;
  return look;
}
`;

// The water. The inner patch is displaced by the splash height, the ambient
// height and the rings' height together, all faded out by patchMask at the
// patch's rim, so its edge meets the flat outer sheet (the ambient height
// there, a few millimetres 4 m and more from the camera, and a ring's, a
// millimetre or less by the time it gets there, are far below a pixel; the
// sheet is four quads, which could not carry a ring anyway). Shading takes
// the slope of all three everywhere: the splash's inside the patch, the
// ambient's and the rings' over all the water, outer sheet included.
//
// Two variants of the same source, chosen by a #define, serve the cavity a
// stone opens (src/cavity.js); without either, the shaders compile to what
// they always were.
//   CAVITY_PUSH (the inner patch while a cavity is open, set to the most
//     cavities there can be): every vertex inside a cavity's circle moves by
//     that cavity's shift, down below the hole's floor and along its axis, so
//     the patch dips under the cavity's lip in a well that holds the cavity
//     and never shows through the hole (src/cavity.js says how the circle
//     and the shift are chosen). The moved vertices get no mask, so the
//     hidden well never computes foam.
//   CAVITY_MESH (the cavity's own mesh): positions and normals come from the
//     mesh, built in world coordinates. aCavity.x, how far the vertex rides
//     the surface, scales the splash's and the wind's height and slope, so
//     the lip sits on the waves like the surface it joins and the wall below
//     it does not; aCavity.y is how open the point is to the sky, aCavity.z
//     how steeply a ray must climb to leave the hole through its mouth.
export const WATER_VERTEX = /* glsl */`
uniform sampler2D uHeight;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uInner;
uniform float uMeshCell;       // the inner patch's vertex spacing (m): the rings are read that smooth
#ifdef CAVITY_PUSH
uniform int uCavityCount;
uniform vec4 uCavityMouths[CAVITY_PUSH];   // centre x and z, the circle's radius squared
uniform vec3 uCavityShifts[CAVITY_PUSH];   // the move: along x, the new height, along z
#endif
#ifdef CAVITY_MESH
attribute vec3 aCavity;
varying vec3 vNormalWorld;
varying vec3 vCavity;
#endif
varying vec3 vWorld;
varying vec2 vDomainUv;
varying float vMask;
varying float vViewZ;
${GLSL_COMMON}
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 domainUv = (world.xz - uDomainMin) / uDomainSize + uTexelOffset;
  float mask = uInner > 0.5 ? patchMask(domainUv) : 0.0;
#ifdef CAVITY_MESH
  mask *= aCavity.x;
  vNormalWorld = normal;
  vCavity = aCavity;
#endif
  float height = uInner > 0.5 ? texture2D(uHeight, domainUv).r + ambientHeight(world.xz) : 0.0;
  if (uInner > 0.5 && uRingCount > 0) height += ringHeight(world.xz, uMeshCell);
  world.y += height * mask;
#ifdef CAVITY_PUSH
  for (int index = 0; index < CAVITY_PUSH; index++) {
    if (index >= uCavityCount) break;
    vec2 fromMouth = world.xz - uCavityMouths[index].xy;
    if (dot(fromMouth, fromMouth) < uCavityMouths[index].z) {
      world = vec3(world.x + uCavityShifts[index].x, uCavityShifts[index].y, world.z + uCavityShifts[index].z);
      mask = 0.0;
    }
  }
#endif
  vWorld = world;
  vDomainUv = domainUv;
  vMask = mask;
  vec4 viewPosition = viewMatrix * vec4(world, 1.0);
  vViewZ = viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const WATER_FRAGMENT = /* glsl */`
#include <packing>
uniform sampler2D uHeight;
uniform sampler2D uFoam;
uniform vec2 uFoamDrift;          // how far the wind has carried the foam (m): its pattern drifts with the map
uniform sampler2D uReflection;    // the sky dome seen through a mirrored camera; alpha: nearness (MIRROR_COMMON, src/shaders/fluid.js)
uniform mat4 uReflectionMatrix;   // world -> reflection texture coordinates
uniform vec4 uMirrorNear;         // the splash's image in the mirror, uv corners (x0, y0, x1, y1); empty (x0 > x1) when none
uniform vec2 uMirrorSize;         // the mirror image's pixels
uniform sampler2D uUnderColor;
uniform sampler2D uUnderDepth;
uniform float uStonesUnder;       // 1 while a stone is under the water (src/main.js), else 0
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uFocalPx;        // pixels per unit tan(angle)
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform float uN;
uniform float uCell;
uniform vec3 uExtinction;      // per metre: absorption plus scattering (lighting.extinction)
uniform vec3 uWaterColor;      // the radiance of water too deep to see through (lighting.waterColor)
uniform float uRoughness;        // sub-grid roughness: a slope spread of uRoughness² (rms, both axes)
uniform float uAmbientUnresolved[AMBIENT_LEVELS];   // slope variance each mip level of the ambient waves loses
varying vec3 vWorld;
varying vec2 vDomainUv;
varying float vMask;
varying float vViewZ;
#ifdef CAVITY_MESH
#define CAVITY_DARKEST 0.1          // the hole's light where it sees no sky, against the open water's
varying vec3 vNormalWorld;
varying vec3 vCavity;       // rides the surface, open to the sky, climb to escape (WATER_VERTEX)
#endif
${GLSL_COMMON}
${FOAM_PATTERN}

// The slope variance of the ambient ripples that this pixel's lookup no
// longer shows and the base level does, at full gust: interpolated by mip
// level, the level computed as the GPU picks it (isotropic, from the larger
// screen derivative). Magnified, nearer the camera, it is zero.
float ambientUnresolvedVariance(vec2 worldXZ) {
  vec2 texelPosition = worldXZ / uAmbientTileSize * uAmbientTexels;
  vec2 acrossX = dFdx(texelPosition);
  vec2 acrossY = dFdy(texelPosition);
  float level = clamp(0.5 * log2(max(max(dot(acrossX, acrossX), dot(acrossY, acrossY)), 1e-8)), 0.0, float(AMBIENT_LEVELS - 1) - 0.001);
  int lower = int(level);
  return mix(uAmbientUnresolved[lower], uAmbientUnresolved[lower + 1], level - float(lower));
}

// The refraction's lookup, landing on what is less than this share of the
// pixel's own water deep (a stone over the floor), is moved back (main).
#define STONE_OVERSHOOT 0.75

// The mirror image holds the splash (uMirrorNear not empty): what is near
// in it has its nearness to the mirror camera in alpha (1 − scale/distance;
// 1 for the sky). A near object's reflection must move with the ripples by
// d/(L + d) of what the sky's does (d its distance from the surface, L the
// mirror camera's): its point at d along the rippled ray is looked up, not
// the ray's direction. The object comes from the flat mirror's texel there
// (its centre, nearest, so the distance is one object's and not a blend
// with the sky's): the sky the ray reaches past it, or what the flat mirror
// shows there, if nothing is near. Where the flat mirror shows sky but the
// rippled direction lands on a near object, the ray cannot have hit it from
// here (it would have been found nearer the flat texel) and the sky behind
// it is not in the image: the flat texel's sky stands in. Only pixels whose
// flat or rippled lookup falls in the splash's rectangle take this; two
// fetches each.
#define MIRROR_NEARNESS_SCALE 4.0     // MIRROR_COMMON's
#define MIRROR_FARTHEST 1e-3          // nearness under this (beyond a kilometre): the sky
vec3 nearReflection(vec2 rippleUv, vec3 ray) {
  vec2 rippleLookup = clamp(rippleUv, vec2(0.002), vec2(0.998));
  vec4 flatCoord = uReflectionMatrix * vec4(vWorld, 1.0);
  vec2 flatUv = flatCoord.xy / max(flatCoord.w, 1e-4);
  bool flatNear = all(greaterThanEqual(flatUv, uMirrorNear.xy)) && all(lessThanEqual(flatUv, uMirrorNear.zw));
  bool rippleNear = all(greaterThanEqual(rippleUv, uMirrorNear.xy)) && all(lessThanEqual(rippleUv, uMirrorNear.zw));
  if (!flatNear && !rippleNear) return texture2D(uReflection, rippleLookup).rgb;
  vec2 flatTexel = clamp((floor(flatUv * uMirrorSize) + 0.5) / uMirrorSize, vec2(0.002), vec2(0.998));
  vec3 mirrorEye = vec3(cameraPosition.x, -cameraPosition.y, cameraPosition.z);
  float surfaceDistance = distance(vWorld, mirrorEye);
  if (flatNear) {
    vec4 atFlat = texture2D(uReflection, flatTexel);
    float nearness = (1.0 - atFlat.a) / MIRROR_NEARNESS_SCALE;
    if (nearness > MIRROR_FARTHEST) {
      float along = max(1.0 / nearness - surfaceDistance, 0.0);
      vec4 nearCoord = uReflectionMatrix * vec4(vWorld + ray * along, 1.0);
      return texture2D(uReflection, clamp(nearCoord.xy / max(nearCoord.w, 1e-4), vec2(0.002), vec2(0.998))).rgb;
    }
    vec4 atRipple = texture2D(uReflection, rippleLookup);
    return (1.0 - atRipple.a) * surfaceDistance > 0.5 * MIRROR_NEARNESS_SCALE ? atFlat.rgb : atRipple.rgb;
  }
  vec4 atRipple = texture2D(uReflection, rippleLookup);
  if ((1.0 - atRipple.a) * surfaceDistance <= 0.5 * MIRROR_NEARNESS_SCALE) return atRipple.rgb;
  return texture2D(uReflection, flatTexel).rgb;
}

void main() {
  float texelStep = 1.0 / uN;
  float hl = texture2D(uHeight, vDomainUv - vec2(texelStep, 0.0)).r;
  float hr = texture2D(uHeight, vDomainUv + vec2(texelStep, 0.0)).r;
  float hd = texture2D(uHeight, vDomainUv - vec2(0.0, texelStep)).r;
  float hu = texture2D(uHeight, vDomainUv + vec2(0.0, texelStep)).r;
  vec3 toCamera = cameraPosition - vWorld;
  float viewDist = length(toCamera);
  // The pixel's footprint on the water (world XZ per pixel step), for the
  // rings' and the foam's lookups; taken here, in uniform control flow.
  vec2 acrossX = dFdx(vWorld.xz);
  vec2 acrossY = dFdy(vWorld.xz);
  // The splash's slope inside its patch plus the ambient ripples everywhere,
  // which the mipmaps flatten where they are finer than a pixel. What they
  // flatten becomes roughness, so the glitter keeps its brightness with
  // distance. The rings' slopes (src/rings.js) add, averaged over the
  // pixel's footprint; what that averages away is left out of the roughness
  // (a ring is a few thousandths steep where it is finer than a pixel, under
  // the ripples' own unresolved slope).
  float gust = gustEnvelope(vWorld.xz, uGustTime);
  float subGridSpread = uRoughness * uRoughness;
#ifdef CAVITY_MESH
  // The mesh's normal, tilted by the surface's slopes where the mesh rides
  // the surface (its own normal is the lip's shape on still water). The
  // refraction's shift is the surface's alone: it is tuned for ripples, and
  // the lip's own tilt, many times steeper, would throw the lookup far
  // across the under-pass; down the wall, seen nearly face on, there is none.
  float ride = vCavity.x;
  vec2 surfaceSlope = vec2(hr - hl, hu - hd) / (2.0 * uCell) * vMask + ambientSlopeAtFullGust(vWorld.xz) * gust * ride;
  if (uRingCount > 0) surfaceSlope += ringSlope(vWorld.xz, acrossX, acrossY) * ride;
  float slopeVariance = subGridSpread * subGridSpread + ambientUnresolvedVariance(vWorld.xz) * gust * gust * ride;
  vec3 meshNormal = normalize(vNormalWorld);
  vec3 n = normalize(meshNormal + vec3(-surfaceSlope.x, 0.0, -surfaceSlope.y) * max(meshNormal.y, 0.0));
  float level = smoothstep(0.6, 0.9, meshNormal.y);   // 1 where the mesh lies as the surface does
  vec2 slope = surfaceSlope;
#else
  vec2 slope = vec2(hr - hl, hu - hd) / (2.0 * uCell) * vMask + ambientSlopeAtFullGust(vWorld.xz) * gust;
  if (uRingCount > 0) slope += ringSlope(vWorld.xz, acrossX, acrossY);
  float slopeVariance = subGridSpread * subGridSpread + ambientUnresolvedVariance(vWorld.xz) * gust * gust;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
#endif
  vec3 v = toCamera / viewDist;
  float nDotV = max(dot(n, v), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - nDotV, 5.0);

  // Refraction: shift the screen lookup by the surface slope, scaled by how much
  // water lies behind this point and by distance (a slope moves the image more
  // when the floor is far below the surface and the camera is close).
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float surfaceDistZ = -vViewZ;
  float rawDepth = texture2D(uUnderDepth, screenUv).r;
  // Nothing under the surface (past the floor's edge): as deep as the far plane,
  // which is past the far edge of the water.
  float underDistZ = rawDepth >= 1.0 ? uFar : -perspectiveDepthToViewZ(rawDepth, uNear, uFar);
  float pathZ = max(underDistZ - surfaceDistZ, 0.0);
  float path = pathZ * viewDist / surfaceDistZ;
  vec2 refractShift = slope * 0.25 * min(path, 3.0) * uFocalPx / max(viewDist, 0.3) / uResolution;
  vec2 refractUv = clamp(screenUv + refractShift, vec2(0.002), vec2(0.998));
  float rawDepth2 = texture2D(uUnderDepth, refractUv).r;
  float underDistZ2 = rawDepth2 >= 1.0 ? uFar : -perspectiveDepthToViewZ(rawDepth2, uNear, uFar);
  float path2 = max(underDistZ2 - surfaceDistZ, 0.0) * viewDist / surfaceDistZ;
  if (path2 < 0.02) { refractUv = screenUv; path2 = path; }
  // A stone over the floor (the under-water pass draws it where the still
  // surface shows it, src/rock.js): the shift above is for the water under
  // this pixel, down to the floor, and where it lands on the stone, much
  // shallower, the ray the slope bends has reached the stone's depth after
  // only path2/path of that: the lookup moves back by that share and takes
  // what is there (one more fetch, only where a lookup lands on a stone), so
  // the floor's large shifts no longer smear the stone.
  if (uStonesUnder > 0.5 && rawDepth < 1.0 && path2 < STONE_OVERSHOOT * path) {
    refractUv = clamp(screenUv + refractShift * (min(path2, 3.0) / min(path, 3.0)), vec2(0.002), vec2(0.998));
    float rawDepth3 = texture2D(uUnderDepth, refractUv).r;
    path2 = rawDepth3 >= 1.0 ? path : max(max(-perspectiveDepthToViewZ(rawDepth3, uNear, uFar) - surfaceDistZ, 0.0) * viewDist / surfaceDistZ, 0.02);
  }
  // What the under-water pass shows here, seen through path2 of water: its
  // light dims by the water's extinction, absorbed or scattered out of the
  // ray, and the light the water scatters into the ray makes up the rest, so
  // the longer the path the more it is the water's own colour, and water
  // with nothing under it in view keeps that colour whatever the path.
  // path2 runs on the straight line to what the pass drew there (the bed is
  // drawn on it), longer than the refracted ray the farther out it looks:
  // with the bed's own deepening (src/pondFloor.js) the sand fades out with
  // distance a little sooner than through flat water of that depth.
  vec3 underColor = texture2D(uUnderColor, refractUv).rgb;
  vec3 refracted = mix(uWaterColor, underColor, exp(-uExtinction * path2));

  // Reflection of the sky and the far shore (the dome's photograph): a planar
  // mirror image, rendered at screen resolution, of a dome at infinity, so the
  // direction the surface reflects the view ray into is looked up through the
  // mirror camera (w = 0: a direction). A ripple tilting toward or away from
  // the camera moves the image up or down by twice its tilt; one tilting
  // sideways turns it far less at grazing angles, so reflections stretch into
  // vertical streaks, as they do on a lake. A ray turned below the horizon
  // would meet the next ripple; it takes the horizon's colour. While the
  // mirror holds the splash, near things are looked up where they are
  // (nearReflection).
  vec3 reflectedRay = reflect(-v, n);
#ifdef CAVITY_MESH
  // Inside the hole (and on the lip's inner face) a reflected ray leaves
  // through the mouth only if it climbs steeply enough; otherwise it meets the
  // wall across, which looks like the water seen through this one. Elsewhere
  // on the lip (vCavity.z = 0) it is the open surface's.
  float climb = reflectedRay.y / max(length(reflectedRay.xz), 1e-3);
  float escapes = vCavity.z > 1e-4 ? smoothstep(0.7, 1.3, climb / vCavity.z) : 1.0;
#endif
  reflectedRay.y = max(reflectedRay.y, 0.001);
  vec4 reflectCoord = uReflectionMatrix * vec4(reflectedRay, 0.0);
  vec2 reflectUv = reflectCoord.xy / max(reflectCoord.w, 1e-4);
  vec3 reflected;
  if (uMirrorNear.x > uMirrorNear.z) reflected = texture2D(uReflection, clamp(reflectUv, vec2(0.002), vec2(0.998))).rgb;
  else reflected = nearReflection(reflectUv, reflectedRay);

#ifdef CAVITY_MESH
  reflected = mix(refracted, reflected, escapes);
  vec3 color = mix(refracted, reflected, fresnel);
  // The hole shades itself: the sky it sees narrows with depth (vCavity.y),
  // a wall sees half of it at most ((1 + n.y) / 2 of the sky, cosine
  // weighted), and the sun reaches only the part of the wall it shines into.
  color *= mix(CAVITY_DARKEST, 1.0, vCavity.y * (0.5 + 0.5 * meshNormal.y));
  float sunClimb = uSunDir.y / max(length(uSunDir.xz), 1e-3);
  float sunlit = vCavity.z > 1e-4 ? smoothstep(0.7, 1.3, sunClimb / vCavity.z) : 1.0;
  color += sunlit * min(sunGlitter(n, v, uSunDir, uSunIrradiance, slopeVariance), vec3(400.0));
#else
  vec3 color = mix(refracted, reflected, fresnel);
  color += min(sunGlitter(n, v, uSunDir, uSunIrradiance, slopeVariance), vec3(400.0));
#endif

  // Foam (FOAM_PATTERN): where it covers, it replaces the water's surface,
  // reflection and glitter included, except that thin foam, just over the
  // threshold, lets some of the water show through. It is a diffuse white,
  // lit by the sun on the rippled surface and by the sky, its bubbles shaded
  // and glinting while they are resolved; its pattern drifts with the map
  // (uFoamDrift). The map's change is taken here, in uniform control flow
  // (the footprint, acrossX and acrossY, at the top); the pattern only where
  // there is foam.
  float foam = texture2D(uFoam, vDomainUv).r * vMask;
#ifdef CAVITY_MESH
  foam *= level;   // the pattern lies on the water's plane: none down the walls
#endif
  vec2 foamChange = vec2(dFdx(foam), dFdy(foam));
  if (foam > FOAM_PRESENT) {
    FoamLook look = foamLook(vWorld.xz - uFoamDrift, acrossX, acrossY, foam, foamChange, n);
    vec3 light = uSunIrradiance * max(dot(n, uSunDir), 0.0) + uSkyAmbient * FOAM_SKY_LIGHT;
    vec3 foamColor = FOAM_ALBEDO * look.shade * light;
    if (look.glint > 0.0) foamColor += look.glint * FOAM_GLINT * min(sunGlitter(look.domeNormal, v, uSunDir, uSunIrradiance, look.glintVariance), vec3(40.0));
    color = mix(color, foamColor, look.cover * look.opacity);
  }

  gl_FragColor = vec4(min(color, vec3(1000.0)), 1.0);
}
`;

// The floor's pattern: sand of mixed grain, pebbles in patches and silt
// darkening it in broad drifts, as an albedo at a world XZ point. Seven value
// noises, so it is not evaluated per pixel: src/pondFloor.js bakes it once at
// start-up (FLOOR_BAKE_FRAGMENT) into a texture that FLOOR_FRAGMENT fetches.
export const FLOOR_PATTERN = /* glsl */`
vec3 floorPattern(vec2 p) {
  float grain = valueNoise(p * 38.0) * 0.45 + valueNoise(p * 130.0) * 0.25 + valueNoise(p * 7.0) * 0.5;
  vec3 sand = mix(vec3(0.26, 0.22, 0.15), vec3(0.42, 0.37, 0.27), grain);
  float pebble = smoothstep(0.62, 0.74, valueNoise(p * 6.5 + 7.3) * 0.7 + valueNoise(p * 21.0) * 0.3);
  vec3 pebbleColor = vec3(0.27, 0.26, 0.24) * (0.6 + 0.8 * valueNoise(p * 70.0));
  sand = mix(sand, pebbleColor, pebble * 0.8);
  float silt = valueNoise(p * 0.9 + 3.0);
  return sand * (0.75 + 0.45 * silt);
}
`;

// The lake bed's depth at a world XZ point, as floorDepthAt in
// src/pondFloor.js computes it (LAKE_BED there): deeper the farther from the
// bank, levelling off at uLakeBed.w.
export const LAKE_BED = /* glsl */`
uniform vec4 uLakeBed;   // the bank's x and z, the depth there and its growth per metre
uniform float uLakeDeep; // the depth it levels off at
float floorDepthAt(vec2 point) {
  float distance = length(point - uLakeBed.xy);
  return uLakeDeep * tanh((uLakeBed.z + uLakeBed.w * distance) / uLakeDeep);
}
`;

// The baked pattern's layout (src/pondFloor.js says why): in perspective from
// the camera's eye, which never moves. A texel's u is 0.5 plus its sideways
// offset from the eye over twice uPatternSpread times its distance ahead of
// the eye, its v uPatternNearest over that distance; uPatternEye is the eye's
// world (x, z). The texture holds albedo over PATTERN_RANGE, which is above
// the pattern's largest (0.54), so its 8 bits span the pattern's range.
const FLOOR_PATTERN_LAYOUT = /* glsl */`
uniform vec2 uPatternEye;
uniform float uPatternNearest;
uniform float uPatternSpread;
#define PATTERN_RANGE 0.55
`;

// One pass over the pattern texture: each texel holds the pattern at the
// floor point its layout gives it.
export const FLOOR_BAKE_FRAGMENT = /* glsl */`
${FLOOR_PATTERN_LAYOUT}
varying vec2 vUv;
${GLSL_COMMON}
${FLOOR_PATTERN}
void main() {
  float ahead = uPatternNearest / vUv.y;
  vec2 world = vec2(uPatternEye.x + (2.0 * vUv.x - 1.0) * uPatternSpread * ahead, uPatternEye.y - ahead);
  gl_FragColor = vec4(floorPattern(world) / PATTERN_RANGE, 1.0);
}
`;

// What the floor's pixels need that is the same everywhere, or affine in the
// world position, is worked out here, for the floor's four vertices: the light
// reaching the floor (the same everywhere, so flat), how far up-sun of a floor
// point its sunlight crossed the surface (the sun refracted into the water,
// tan θt per metre of depth, sin θt = sin θi / n: flat), the floor point's
// world XZ and the pattern's coordinates, projective (u·w, v·w, w) with w the
// distance ahead of the eye. The last two are affine in the world position,
// so they interpolate exactly.
export const FLOOR_VERTEX = /* glsl */`
#define WATER_INDEX 1.333
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uAbsorb;
${LAKE_BED}
${FLOOR_PATTERN_LAYOUT}
varying vec2 vFloorPoint;
varying float vDepth;
varying vec3 vPatternCoord;
flat varying vec2 vUpSun;
flat varying float vFocusing;
varying vec3 vSunlight;
varying vec3 vSkylight;
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  float depth = floorDepthAt(world.xz);
  world.y = -depth;
  vDepth = depth;
  vFloorPoint = world.xz;
  float sunSine = length(uSunDir.xz);
  float refractedSine = sunSine / WATER_INDEX;
  float refractedCosine = sqrt(1.0 - refractedSine * refractedSine);
  vUpSun = uSunDir.xz / max(sunSine, 1e-5) * refractedSine / refractedCosine;
  // How far the refracted sunlight moves on the floor per metre of depth and
  // unit of surface slope (Snell's law): 1 − cos θi/(n cos θt) for a slope
  // across the sun's plane, sec²θt times that along it; the Laplacian takes
  // their mean (0.25 for a sun overhead, 0.76 for this scene's at 27°).
  float deflection = 1.0 - max(uSunDir.y, 0.0) / (WATER_INDEX * refractedCosine);
  vFocusing = deflection * 0.5 * (1.0 + 1.0 / (refractedCosine * refractedCosine));
  float ahead = uPatternEye.y - world.z;
  vPatternCoord = vec3(0.5 * ahead + (world.x - uPatternEye.x) * 0.5 / uPatternSpread, uPatternNearest, ahead);
  // The sun after crossing the water down to this point of the bed (the
  // caustics then focus it) and the sky's light, per unit of the baked pattern.
  float sunPath = depth / max(uSunDir.y, 0.2);
  vSunlight = uSunIrradiance * exp(-uAbsorb * sunPath) * max(uSunDir.y, 0.0) * PATTERN_RANGE;
  vSkylight = uSkyAmbient * exp(-uAbsorb * depth) * 1.4 * PATTERN_RANGE;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const FLOOR_FRAGMENT = /* glsl */`
uniform sampler2D uHeight;
uniform sampler2D uPattern;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uN;
uniform float uCell;
varying vec2 vFloorPoint;
varying float vDepth;
varying vec3 vPatternCoord;
flat varying vec2 vUpSun;
flat varying float vFocusing;
varying vec3 vSunlight;
varying vec3 vSkylight;
${GLSL_COMMON}
#define WATER_INDEX 1.333
#define CAUSTIC_BLUR 0.35          // the irradiance's peak where rays focus on the floor: about 1/this
#define CAUSTIC_BRIGHTEST 1.6      // the sunlight on the sand is eased into this many times its own...
#define CAUSTIC_DARKEST 0.65       // ...and this

void main() {
  // Sand with pebbles and silt (FLOOR_PATTERN), baked.
  vec3 sand = texture2DProj(uPattern, vPatternCoord).rgb;

  // Caustics: where the surfaces above focus the sun, on the floor point this
  // pixel really shows. The floor is drawn on the straight line from the eye
  // (src/pondFloor.js), but the eye sees it through the still surface: the
  // straight line enters the water a distance entry from the eye, and the ray
  // refracted there meets the floor nearer the eye, at seenPoint. The sunlight
  // reaching that point crossed the surface up-sun of it (vUpSun per metre of
  // depth), at surfacePoint, so a ring's caustic shows where the water's
  // refraction puts it. Its irradiance scales with the inverse area dilation
  // of the refracted rays, which for small slopes is 1 + vFocusing · depth ·
  // ∇²h (src/pondFloor.js).
  vec2 fromEye = vFloorPoint - cameraPosition.xz;
  float reach = max(length(fromEye), 1e-5);
  float entry = reach * cameraPosition.y / (cameraPosition.y + vDepth);
  float sineWater = entry / (length(vec2(entry, cameraPosition.y)) * WATER_INDEX);
  vec2 seenPoint = cameraPosition.xz + fromEye * ((entry + vDepth * sineWater * inversesqrt(1.0 - sineWater * sineWater)) / reach);
  vec2 surfacePoint = seenPoint + vUpSun * vDepth;
  vec2 uv = (surfacePoint - uDomainMin) / uDomainSize + uTexelOffset;
  float mask = patchMask(uv);
  // Sampled three texels apart: the sun's width and the water blur fine
  // detail. Outside the splash's patch (mask 0) there is nothing to sample.
  float laplacian = 0.0;
  if (mask > 0.0) {
    float texelStep = 3.0 / uN;
    float hc = texture2DLodEXT(uHeight, uv, 0.0).r;
    float hl = texture2DLodEXT(uHeight, uv - vec2(texelStep, 0.0), 0.0).r;
    float hr = texture2DLodEXT(uHeight, uv + vec2(texelStep, 0.0), 0.0).r;
    float hd = texture2DLodEXT(uHeight, uv - vec2(0.0, texelStep), 0.0).r;
    float hu = texture2DLodEXT(uHeight, uv + vec2(0.0, texelStep), 0.0).r;
    laplacian = (hl + hr + hu + hd - 4.0 * hc) / (9.0 * uCell * uCell);
  }
  // The ambient ripples add their own: a web of caustics drifting with them;
  // and the rings theirs (src/rings.js), each averaged over the floor pixel's
  // footprint where its sunlight crossed the surface, so a ring throws a
  // ring of light on the sand.
  vec2 surfaceAcrossX = dFdx(surfacePoint);
  vec2 surfaceAcrossY = dFdy(surfacePoint);
  float curvature = laplacian * mask + ambientLaplacian(surfacePoint);
  if (uRingCount > 0) curvature += ringLaplacian(surfacePoint, surfaceAcrossX, surfaceAcrossY);
  // The irradiance: 1/focus for small slopes; where the rays come to a focus
  // on the floor (focus near 0) a bright line, its peak set by the sun's
  // disc and the pixel's footprint (CAUSTIC_BLUR), past it the crossed rays'
  // 1/|focus|; eased into [CAUSTIC_DARKEST, CAUSTIC_BRIGHTEST] so a steep ring
  // never blows the sand out.
  float focus = 1.0 + vFocusing * vDepth * curvature;
  float irradiance = sqrt(1.0 + CAUSTIC_BLUR * CAUSTIC_BLUR) * inversesqrt(focus * focus + CAUSTIC_BLUR * CAUSTIC_BLUR);
  float caustic = irradiance > 1.0
    ? 1.0 + (CAUSTIC_BRIGHTEST - 1.0) * tanh((irradiance - 1.0) / (CAUSTIC_BRIGHTEST - 1.0))
    : 1.0 - (1.0 - CAUSTIC_DARKEST) * tanh((1.0 - irradiance) / (1.0 - CAUSTIC_DARKEST));

  gl_FragColor = vec4(sand * (vSunlight * caustic + vSkylight), 1.0);
}
`;

// Where a point under the water is seen through the still surface (y = 0),
// for what the under-water pass draws (submerged stones, src/rock.js, and
// bubbles). The camera's ray to it bends where it enters the water (Snell's
// law, index SEEN_WATER_INDEX): the surface point it enters at is found by
// Newton's method from the straight line's (five steps leave under 1e-4 of
// the depth, anywhere in view), and the point is moved along the camera's ray
// through that surface point, keeping its depth. Drawn there, it is where the
// water shader looks it up (along the camera's ray at that surface point),
// so it is seen where it is seen through flat water, rather than on the
// straight line, which from the home view puts a stone 10 cm down three
// times too far toward the camera (0.31 m in front of the point above it
// instead of 0.10 m) and one on the floor twice; and the water it is looked
// through (the camera's ray from the surface down to its depth) is as long as
// a floor point's at that depth along the same ray, so a stone on the floor
// is absorbed as the floor around it is. The floor itself is still drawn on
// the straight line. A point above the water stays where it is.
export const SEEN_THROUGH_WATER = /* glsl */`
#define SEEN_WATER_INDEX 1.333
vec3 seenThroughWater(vec3 world) {
  float depth = -world.y;
  vec2 fromEye = world.xz - cameraPosition.xz;
  float reach = length(fromEye);
  float height = cameraPosition.y;
  if (depth <= 0.0 || reach < 1e-5 || height <= 0.0) return world;
  float crossing = reach * height / (height + depth);
  for (int step = 0; step < 5; step++) {
    float above = sqrt(crossing * crossing + height * height);
    float rest = reach - crossing;
    float below = sqrt(rest * rest + depth * depth);
    float residual = crossing / above - SEEN_WATER_INDEX * rest / below;
    float slope = height * height / (above * above * above) + SEEN_WATER_INDEX * depth * depth / (below * below * below);
    crossing = clamp(crossing - residual / slope, 0.0, reach);
  }
  vec2 seen = cameraPosition.xz + fromEye * (crossing * (height + depth) / (height * reach));
  return vec3(seen.x, world.y, seen.y);
}
`;

export const BUBBLE_VERTEX = /* glsl */`
attribute float aSize;
uniform float uProjScale;
varying float vFade;
${SEEN_THROUGH_WATER}
void main() {
  vec4 viewPosition = viewMatrix * vec4(seenThroughWater((modelMatrix * vec4(position, 1.0)).xyz), 1.0);
  float dist = max(-viewPosition.z, 0.05);
  gl_PointSize = max(aSize * 2.0 * uProjScale / dist, 1.5);
  vFade = clamp(aSize * 2.0 * uProjScale / dist / 1.5, 0.3, 1.0);
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const BUBBLE_FRAGMENT = /* glsl */`
uniform vec3 uTint;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float rim = smoothstep(0.35, 1.0, r2);
  vec2 hp = c - vec2(-0.35, -0.35);
  float highlight = exp(-dot(hp, hp) * 14.0);
  vec3 color = mix(uTint, vec3(1.0), rim * 0.55 + highlight * 0.8);
  float alpha = (0.25 + 0.6 * rim + highlight * 0.5) * vFade;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

// Foam specks: points riding the water surface. Each speck's whole life is a
// closed form of the splash time, so the CPU writes a speck once, when it is
// born: it drifts outward from where it was born at a speed decaying over
// SPECK_DRIFT_SECONDS, drifts downwind with the surface water as the raft does
// (uFoamVelocity, src/spectralWater.js), wanders a little, and sits on the
// waves at the height the water surface's own vertex shader gives that point,
// splash, ambient waves and rings together (plus SPECK_LIFT, so the
// triangulated surface never covers it). It fades in over a tenth of a second and out
// over its last SPECK_FADE seconds, shrinking as it goes.
// A speck smaller than uMinPixelSize is drawn at that size, soft, with its
// opacity cut by the area it really covers (down to SPECK_MIN_COVERAGE): a
// hard dot of a pixel or two would flicker as it moves across pixels, and far
// specks should read as a faint grain where they gather, not as bright dots.
// Inside a raft the water shader's bubble pattern is the grain, so a speck
// fades out where the foam map under it is between SPECK_RAFT_LOW and
// SPECK_RAFT_HIGH: specks are the bits that drift out of the raft.
export const SPECK_VERTEX = /* glsl */`
#define SPECK_DRIFT_SECONDS 1.6
#define SPECK_WANDER 0.0012
#define SPECK_LIFT 0.0015
#define SPECK_FADE 0.35
#define SPECK_MIN_COVERAGE 0.12
#define SPECK_RAFT_LOW 0.05
#define SPECK_RAFT_HIGH 0.2
#define SPECK_RING_SPACING 0.01   // metres: the rings' height under a speck, read this smooth
attribute vec2 aDrift;       // initial outward drift, m/s
attribute vec4 aTiming;      // birth (splash seconds), life (s), diameter (m), random phase
uniform sampler2D uHeight;
uniform sampler2D uFoam;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uTime;
uniform vec2 uFoamVelocity;  // the surface's drift downwind (m/s), which carries the raft too
uniform float uProjScale;    // render-target pixels per world unit at distance 1
uniform float uMinPixelSize;
varying float vAlpha;
varying float vPixelSize;
${GLSL_COMMON}
void main() {
  float age = uTime - aTiming.x;
  float life = aTiming.y;
  if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; vPixelSize = 0.0; return; }
  float phase = aTiming.w;
  vec2 place = position.xz + aDrift * SPECK_DRIFT_SECONDS * (1.0 - exp(-age / SPECK_DRIFT_SECONDS)) + uFoamVelocity * age;
  place += SPECK_WANDER * vec2(sin(age * 1.3 + phase) + 0.5 * sin(age * 3.1 + 2.0 * phase), cos(age * 1.1 + 1.7 * phase) + 0.5 * sin(age * 2.7 + 3.0 * phase));
  vec2 domainUv = (place - uDomainMin) / uDomainSize + uTexelOffset;
  float mask = patchMask(domainUv);
  float surface = texture2D(uHeight, domainUv).r + ambientHeight(place);
  if (uRingCount > 0) surface += ringHeight(place, SPECK_RING_SPACING);
  float height = surface * mask;
  float outsideRaft = 1.0 - smoothstep(SPECK_RAFT_LOW, SPECK_RAFT_HIGH, texture2D(uFoam, domainUv).r * mask);
  vec4 viewPosition = viewMatrix * vec4(place.x, height + SPECK_LIFT, place.y, 1.0);
  float fadeOut = 1.0 - smoothstep(life - SPECK_FADE, life, age);
  float fade = smoothstep(0.0, 0.1, age) * fadeOut * outsideRaft;
  float pixelSize = aTiming.z * (0.6 + 0.4 * fadeOut) * uProjScale / max(-viewPosition.z, 0.05);
  float drawn = max(pixelSize, uMinPixelSize);
  gl_PointSize = drawn;
  vPixelSize = drawn;
  vAlpha = fade * max((pixelSize * pixelSize) / (drawn * drawn), SPECK_MIN_COVERAGE);
  gl_Position = projectionMatrix * viewPosition;
}
`;

// A speck is lit like the foam map in WATER_FRAGMENT (white under the sun and
// sky, on a level surface), dimmed by uBrightness. Drawn over five pixels or more it is a
// translucent disc a little brighter at its rim, which is how a small surface
// bubble looks; smaller, a soft blob.
export const SPECK_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform float uOpacity;
uniform float uBrightness;
varying float vAlpha;
varying float vPixelSize;
void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float radiusSquared = dot(offset, offset);
  if (radiusSquared > 1.0) discard;
  float bubble = (0.7 + 0.3 * smoothstep(0.3, 0.8, radiusSquared)) * (1.0 - smoothstep(0.75, 1.0, radiusSquared));
  float blob = exp(-3.0 * radiusSquared);
  float shape = mix(blob, bubble, smoothstep(3.5, 5.0, vPixelSize));
  vec3 light = uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * 1.5;
  vec3 color = vec3(0.94, 0.96, 0.97) * light * uBrightness;
  float alpha = vAlpha * shape * uOpacity;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;
