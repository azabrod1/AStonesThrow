// GLSL for the pond: water surface with the foam's bubble pattern
// (FOAM_PATTERN: froth thinning into translucent bubble films), pond floor
// with caustics (CAUSTICS), the pool's tiled basin and deck (POOL_FRAGMENT,
// DECK_FRAGMENT), bubbles, the foam specks
// that ride the surface after a splash (src/foamSpecks.js), and where the
// still surface shows what is under it (SEEN_THROUGH_WATER). All scene
// passes render linear HDR radiance; the composite pass tone-maps.
//
// GLSL_COMMON also carries the ambient wind waves (src/ambientWaves.js) and
// their gust envelope, and the rings that cross the whole pond
// (src/rings.js), for every shader that rides or shades the surface; the
// uniforms it declares come from AmbientWaves.uniforms() and Rings.uniforms()
// and stay inactive in shaders that never call the functions using them.
import { MAX_RINGS, PROFILE_TEXELS, PROFILE_MAPPING, RING_TEXTURE_UNITS } from '../rings.js';
import { RAIN_RIPPLES, DROP_RING_SLOPES } from './rain.js';
import { GALE_SURFACE } from './gale.js';

// The weather's haze (rain's, snow's, a fog's; src/sky.js setWeather): what lies d metres off fades
// toward uHazeColor, the overcast's horizon, by 1 − exp(−uHazeDensity·d)
// (uHazeDensity 3/visibility: a dark object at the visibility keeps 5% of its
// contrast). The dome fades the same way, to the distance its land stands
// at. With no rain the density is 0 and the colour passes untouched.
export const HAZE = /* glsl */`
uniform vec3 uHazeColor;
uniform float uHazeDensity;
vec3 withHaze(vec3 color, float distance) {
  return uHazeDensity > 0.0 ? mix(color, uHazeColor, 1.0 - exp(-uHazeDensity * distance)) : color;
}
`;

// Snow lying on the ground (uSnow, the weather's cover, 0 to 1: src/main.js
// WEATHERS, src/snow.js), for the beach's, the deck's and the ice's shaders
// (GLSL_COMMON holds it, after ICE_COMMON; on the ice, iceSurface). Thin, it
// lies in patches, the ground showing between them; whole, it covers all.
// The patches are value noise, a few metres and a metre across: they mean
// nothing but that a first snow lies unevenly. Fresh snow is white, a little
// blue (its ice takes some red), shaded a little by its drifts (snowShade),
// and lit as the ground under it is.
export const SNOW_COVER = /* glsl */`
uniform float uSnow;
#define SNOW_ALBEDO vec3(0.86, 0.89, 0.93)
float snowCover(vec2 point) {
  if (uSnow <= 0.0) return 0.0;
  float patches = 0.6 * valueNoise(point * 0.7) + 0.4 * valueNoise(point * 2.9 + 3.0);
  return smoothstep(patches - 0.12, patches + 0.12, 1.25 * uSnow - 0.1);
}
// On the ice, smooth, the wind packs it into drifts with crisp edges: the same patches, a finer noise in their edges,
// as sharp as the pixel's footprint (m) lets them be.
float snowOnIce(vec2 point, float footprint) {
  if (uSnow <= 0.0) return 0.0;
  float patches = 0.6 * valueNoise(point * 0.7) + 0.4 * valueNoise(point * 2.9 + 3.0) + 0.12 * (valueNoise(point * 14.0 + 11.0) - 0.5);
  float edge = max(0.025, 2.0 * footprint);
  return smoothstep(patches - edge, patches + edge, 1.25 * uSnow - 0.1);
}
vec3 snowShade(vec2 point) {
  return SNOW_ALBEDO * (0.88 + 0.08 * valueNoise(point * 1.9 + 7.0) + 0.04 * valueNoise(point * 11.0));
}
`;

// The ice (src/ice.js) as the water's own shaders draw it: a frozen lake is
// its water's surface frozen, so the water's shaders draw the ice where its
// mask (src/ice.js: R the signed distance to the nearest hole's edge, a byte
// over ±uIceFar; B how wet, and whether ever wet; A the signed distance to a
// hole's new ice's front) says there is ice, the sheet's or new ice over a
// hole (iceMaskAt's `solid`), and the water in its holes' open water,
// blending the two over the pixel at the edge. WATER_VERTEX holds the patch
// flat under the ice; WATER_FRAGMENT shades it (iceSurface);
// WATER_UNDER_FRAGMENT draws its underside. With the ice off (uIceOn 0) none
// of it runs. Its cracks are drawn over it (src/iceCracks.js,
// ICE_CRACK_VERTEX and ICE_CRACK_FRAGMENT), which take ICE_UNIFORMS too.
//
// What it looks like (iceLook). Every part of it is crisp, with detail down
// to a pixel near the eye (each fades to its mean only where it is finer
// than a pixel): soft value-noise mottles read as a texture magnified, the
// picture blurred. A lake's or a pool's ice is mostly clear ("black ice":
// the water under it shows through and it mirrors the sky as still water
// does), and these tell it from water:
//   - snow ice (ICE_WHITE: the share of the sheet it covers, growing with
//     the thickness): white patches with ragged edges (an fbm thresholded,
//     its octaves down to the pixel), thin at their edges and thick inside,
//     streaked along the wind that blew the snow (ICE_SNOW_STREAK: puffed
//     out round, on a mirror they would pass for clouds reflected);
//     round a frozen pool it drifts against the walls, and the ice frozen to
//     the tiles is a white rim (ICE_RIM);
//   - frost specks (ICE_SPECK) and frozen bubbles (ICE_BUBBLE): white dots a
//     few millimetres across in clusters, the frost's on top and whiter, the
//     bubbles' half seen through the ice;
//   - cloudy ice (ICE_CLOUDY): round the snow ice, where it froze from the
//     slush the snow made, milky through and through, as ragged and as
//     streaked;
//   - its veil: even clear ice scatters a little light back along the ray's
//     path through it (ICE_SCATTER per metre, over the thickness over the
//     refracted ray's cosine), so it greys looking along it, and more as it
//     thickens;
//   - frost roughens the mirror where the snow and the cloudy ice are
//     (ICE_FROST, the rms slope of its unresolved roughness), and the sun's
//     sheen on it breaks into the glints of its crystals (ICE_GLINT); the
//     bare black ice between is a mirror, the sun a small hard glint in it
//     (a sheen spread evenly over the ice reads as a blur). It is flat:
//     frozen, it has no ripples.
//
// Wet (the flood round a hole and the splash's drops, src/ice.js; the rain's
// film), the ice is darker, its white ice greyed, and smooth: a mirror. Once
// wet it stays glazed (its film froze), its frost gone (ICE_GLAZED). New ice
// over a hole is clear and glazed, none of the sheet's snow ice, crystals,
// specks or bubbles, and the old hole's edge in it a faint seam (ice frozen
// to ice shows little of the face between): the edge is a fracture face
// (fractureFace), wet, only where open water laps it: seen down through
// clear ice its face shows as a white band on its near side, as wide as the
// sheet's thickness seen along the refracted ray, fading with depth.
export const ICE_UNIFORMS = /* glsl */`
uniform sampler2D uIceMask;
uniform vec3 uIceArea;         // the mask's corner (x, z) and side (m)
uniform float uIceOn;          // 1 while there is ice
uniform float uIceTop;         // its top over the still water (m)
uniform float uIceThickness;   // m
uniform float uIceFar;         // the cap of the mask's distances (m)
uniform float uIceGlaze;       // the mask's B where it was once wet and is dry (src/ice.js FLOOD.glaze)
uniform float uIceWet;         // how wet the rain has made it (src/main.js WEATHERS)
uniform vec4 uIcePool;         // a frozen pool's corner (x, z) and side (m), w 1; w 0 over a lake
#define ICE_INDEX 1.31
#define ICE_CRACK_JAG 0.0005           // m: a crack's own roughness, finer than its points (ICE_CRACK_FRAGMENT)
`;

export const ICE_COMMON = /* glsl */`
${ICE_UNIFORMS}
#define ICE_WHITE vec2(0.05, 0.3)      // the share of the sheet under snow ice, thin (new, mostly clear) and thick
#define ICE_WHITE_ALBEDO 0.62
#define ICE_GLINT 0.003                // m: a frost crystal's facet, glinting in the sun (iceLook)
#define ICE_SNOW_STREAK 3.0            // snow ice's patches this many times longer along the wind than across it
#define ICE_CLOUDY 0.18                // the share of light cloudy ice scatters back, where it is (iceLook)...
#define ICE_CLOUDY_BAND 0.07           // ...round the snow ice, this far under its threshold in the snow's field
#define ICE_SCATTER 12.0               // per metre of the refracted ray's path: the light clear ice scatters back (its veil; src/ice.js ICE.scatter, its twin, a shard's)
#define ICE_FROST vec2(0.012, 0.1)     // the frost's rms slope, where the ice is bare (black ice, a mirror) and where frosted...
#define ICE_GLAZED 0.015               // ...and wet, glazed or new ice's
#define ICE_SPECK 0.007                // m: a cell of frost specks, found where the ice is frosted
#define ICE_BUBBLE 0.012               // m: a cell of frozen bubbles...
#define ICE_BUBBLE_CLUSTERS 0.12       // ...found in clusters over this share of the sheet
#define ICE_RIM 0.03                   // m: the white rim round a frozen pool's walls, about, and its drifts reach ten times that
#define ICE_WET_EDGE 0.04              // metres round a hole the ice is wet
#define ICE_SKY_LIGHT 1.4
#define ICE_FROST_LEVELS 320.0         // the sky cube's texels a radian, about (CUBE_SIZE in src/sky.js, 512, over π/2)...
#define ICE_FROST_COARSEST 4.5         // ...blurred no further than this level (coarser, its faces' seams show)...
#define ICE_FROST_SKY 2.5              // ...and no brighter than this times the sky's mean (iceSurface: the sun is the sheen's)
#define ICE_UNDER_GLOW 0.35            // the light white ice lets through to its underside, against what falls on its top
#define ICE_SNOW_GLOW 0.4              // and under snow on it, against that

// The mask at a world point (the header). Beyond it, dry ice with no hole.
struct IceMask {
  float hole;    // m to the nearest hole's edge, negative in one (its open water or its new ice)
  float wet;     // how wet the flood and the drops have left it, 0 to 1
  float glaze;   // whether it was ever wet, 0 to 1: its frost frozen smooth
  float skin;    // m to a hole's new ice's front, positive where it has skinned over
  float solid;   // m to open water's edge, ice (the sheet's or new) where positive
};
IceMask iceMaskAt(vec2 worldXZ) {
  vec2 uv = (worldXZ - uIceArea.xy) / uIceArea.z;
  vec4 texel = any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))) ? vec4(1.0, 1.0, 0.0, 0.0) : texture2D(uIceMask, uv);
  IceMask mask;
  mask.hole = (texel.r * 255.0 - 127.5) / 127.5 * uIceFar;
  mask.glaze = smoothstep(0.0, uIceGlaze, texel.b);
  mask.wet = clamp((texel.b - uIceGlaze) / (1.0 - uIceGlaze), 0.0, 1.0);
  mask.skin = (texel.a * 255.0 - 127.5) / 127.5 * uIceFar;
  mask.solid = max(mask.hole, mask.skin);
  return mask;
}

// How much of a pixel footprint metres across at a point the mask says is
// holeDistance from open water's edge (its solid) is ice: the edge
// antialiased. At the mask's cap no edge is near, however wide the pixel (far
// off, where a hole is finer than a pixel, it is ice).
float iceCover(float holeDistance, float footprint) {
  if (holeDistance >= 0.95 * uIceFar) return 1.0;
  return smoothstep(-0.5 * footprint, 0.5 * footprint, holeDistance);
}

// A line's share of a pixel footprint metres across, at fromLine metres off
// its middle, halfWidth metres each side of it (a box filter: a line finer
// than the pixel is fainter, never gone or doubled).
float iceLine(float fromLine, float halfWidth, float footprint) {
  float pixel = max(footprint, 1e-6);
  return max(min(halfWidth - fromLine, 0.5 * pixel) - max(-halfWidth - fromLine, -0.5 * pixel), 0.0) / pixel;
}

// An fbm of value noise from frequency (per metre) up, seven octaves, each
// finer than a few pixels evened to its mean: x its value (about 0.5 ± 0.15),
// y how fast it changes (per metre, about), to antialias a threshold of it.
vec2 iceFbm(vec2 worldXZ, float frequency, float footprint) {
  float sum = 0.0, change = 0.0, amplitude = 0.5;
  for (int octave = 0; octave < 7; octave++) {
    float seen = 1.0 - smoothstep(0.12, 0.45, footprint * frequency);
    if (seen <= 0.0) { sum += amplitude; break; }   // this octave and the finer ones, their mean: amplitude·2·0.5
    sum += amplitude * mix(0.5, valueNoise(worldXZ * frequency + float(octave) * 17.31), seen);
    change += amplitude * frequency * seen;
    frequency *= 2.07;
    amplitude *= 0.5;
  }
  return vec2(sum / 0.9921875, 1.5 * change);
}

struct IceLook {
  float white;           // the share of snow ice and frost specks (the light scattered back)
  float slopeVariance;   // the frost's unresolved slope, for the mirror's blur and the sun's sheen
  float glints;          // the sun's sheen on it broken into its crystals' glints: 1 on the mean
  float bubbles;         // the share of the pixel frozen bubbles whiten
};

IceLook iceLook(vec2 worldXZ, float footprint) {
  IceLook look;
  float thickShare = smoothstep(0.01, 0.04, uIceThickness);
  // Round a frozen pool: how far its nearest wall is (outside its walls, far: a shard's own look, pieceWhite).
  float fromWall = 1e3;
  if (uIcePool.w > 0.5) {
    vec2 inside = min(worldXZ - uIcePool.xy, uIcePool.xy + uIcePool.z - worldXZ);
    fromWall = min(inside.x, inside.y) < 0.0 ? 1e3 : min(inside.x, inside.y);
  }
  // Snow ice: an fbm thresholded at the share, its edge ragged to the pixel, thin there and thick inside, laid out in
  // streaks along the wind that blew it (ICE_SNOW_STREAK); drifted against a pool's walls.
  vec2 snow = iceFbm(mat2(0.8, -0.6, 0.6, 0.8) * worldXZ * vec2(1.0, ICE_SNOW_STREAK), 0.7, footprint * ICE_SNOW_STREAK);
  float drift = 0.07 * (1.0 - smoothstep(0.0, 8.0 * ICE_RIM, fromWall));
  float threshold = mix(0.69, 0.56, thickShare) - drift;
  float soft = 0.004 + 0.5 * snow.y * footprint;
  float covered = smoothstep(threshold - soft, threshold + soft, snow.x);
  float white = covered * (0.35 + 0.55 * smoothstep(threshold, threshold + 0.1, snow.x));
  // The rim: ice frozen to the tiles, white with the air it trapped, its inner edge ragged.
  if (fromWall < 2.0 * ICE_RIM) {
    float rimWidth = ICE_RIM * (0.5 + 0.9 * valueNoise(worldXZ * 23.0));
    white = max(white, 0.85 * (1.0 - smoothstep(rimWidth - 0.5 * footprint, rimWidth + 0.5 * footprint, fromWall)));
  }
  // Cloudy ice (ICE_CLOUDY): round the snow, where it froze from the slush the snow made, milky through and through,
  // its edge as ragged as the snow's (the same field, ICE_CLOUDY_BAND under the snow's threshold).
  float cloudy = smoothstep(threshold - ICE_CLOUDY_BAND - soft, threshold - ICE_CLOUDY_BAND + soft, snow.x) * (1.0 - covered);
  float streaks = mix(0.5 + 0.5 * valueNoise(vec2(worldXZ.x * 9.0, worldXZ.y * 2.5) + 61.0), 0.75, smoothstep(0.01, 0.05, footprint));
  white = max(white, ICE_CLOUDY * cloudy * streaks);
  // Frosted where the snow lies and over the cloudy ice (rough, frost specks in it, the sun's sheen on it glinting),
  // its edges theirs: the bare black ice between is a mirror.
  float frosted = max(covered, cloudy);
  if (frosted > 0.0) {
    vec2 speckCell = floor(worldXZ / ICE_SPECK);
    float speckSeed = hash21(speckCell + 3.3);
    vec2 speckCentre = (speckCell + 0.2 + 0.6 * vec2(hash21(speckCell + 9.1), hash21(speckCell + 57.0))) * ICE_SPECK;
    float speckRadius = mix(0.0005, 0.0016, hash21(speckCell + 23.0));
    float speckOdds = 0.25 * frosted * smoothstep(0.35, 0.75, valueNoise(worldXZ * 6.0 + 2.0));
    float speck = step(1.0 - speckOdds, speckSeed) * (1.0 - smoothstep(speckRadius - 0.5 * footprint, speckRadius + 0.5 * footprint, distance(worldXZ, speckCentre)));
    float speckMean = speckOdds * PI * 0.0011 * 0.0011 / (ICE_SPECK * ICE_SPECK);
    white = max(white, 0.7 * mix(speck, speckMean, smoothstep(0.0007, 0.003, footprint)));
  }
  look.white = white;
  float frost = mix(mix(ICE_FROST.x, ICE_FROST.y, frosted), ICE_FROST.x, uIceWet);   // a film of rain glazes it
  look.slopeVariance = frost * frost;
  // The sheen on frost is its crystals' facets glinting, a few of them, brightly (ICE_GLINT cells, mean 1; under a
  // pixel, their mean): a sheen even over a patch reads as a blur.
  float facet = hash21(floor(worldXZ / ICE_GLINT) + 91.0);
  look.glints = mix(1.0, mix(1.0, 13.0 * pow(facet, 12.0), frosted), 1.0 - smoothstep(0.5 * ICE_GLINT, 2.0 * ICE_GLINT, footprint));
  // Frozen bubbles: clusters of them (ICE_BUBBLE_CLUSTERS of the sheet, by
  // a noise), in each cell of a cluster a dot of 0.7 to 2.5 mm radius at
  // odds growing to its middle, half seen through the ice; under a pixel,
  // their mean.
  vec2 cell = floor(worldXZ / ICE_BUBBLE);
  float seed = hash21(cell);
  float cluster = smoothstep(1.0 - ICE_BUBBLE_CLUSTERS, 1.0 - 0.3 * ICE_BUBBLE_CLUSTERS, valueNoise(worldXZ * 3.1 + 5.0) * 0.7 + valueNoise(worldXZ * 9.0 + 2.0) * 0.3);
  float present = step(1.0 - 0.55 * cluster, seed);
  vec2 centre = (cell + 0.2 + 0.6 * vec2(hash21(cell + 17.0), hash21(cell + 41.0))) * ICE_BUBBLE;
  float radius = mix(0.0007, 0.0025, hash21(cell + 73.0));
  float bubble = present * (1.0 - smoothstep(radius - 0.5 * footprint, radius + 0.5 * footprint, distance(worldXZ, centre)));
  float mean = 0.55 * cluster * PI * 0.0016 * 0.0016 / (ICE_BUBBLE * ICE_BUBBLE);
  look.bubbles = 0.55 * mix(bubble, mean, smoothstep(0.0015, 0.006, footprint)) * (1.0 - look.white);
  return look;
}

// A fracture face (a hole's broken edge) seen down through clear ice, at a
// point along metres from its line on the side the view looks across it to
// (positive where the face lies under the point), for a view whose
// horizontal share across the line is across and whose zenith's sine is
// sine: lit as white where the refracted ray meets the face, fading with
// depth. The face reaches the sheet's thickness down.
float fractureFace(float along, float across, float sine, float footprint) {
  float sineInside = clamp(sine / ICE_INDEX, 0.0, 0.99);
  float tangent = sineInside / sqrt(1.0 - sineInside * sineInside);
  float width = uIceThickness * tangent * abs(across) + 1e-4;
  // From its line, where it is brightest, fading out down the face (no hard far edge: the mask's distance there runs
  // round the edge's turns), and as a band narrower than the pixel.
  float depthShare = clamp(along / width, 0.0, 1.0);
  float fade = (1.0 - depthShare) * (1.0 - depthShare);
  return smoothstep(-0.5 * footprint, 0.5 * footprint, along) * fade * min(width / max(footprint, 1e-5), 1.0);
}
`;

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

// Value noise and its gradient (the foam's clumps, the beach's relief).
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

${GALE_SURFACE}
// How much of the sideways move a rest position takes (above).
float galeSideways(vec2 restXZ) {
  return smoothstep(GALE_SIDEWAYS_FROM, GALE_SIDEWAYS_TO, length(restXZ - uGaleCentre));
}

// Where the gale moves the still surface's point at restXZ: (Dx, h, Dz) in
// metres, read at mip level lod (a vertex reads the waves no shorter than
// its mesh can draw).
vec3 galeMove(vec2 restXZ, float lod) {
  vec4 field = textureLod(uGaleDisplacement, galeUv(restXZ), lod) * uGaleMetresPerUnit;
  float sideways = galeSideways(restXZ);
  return vec3(field.y * sideways, field.x, field.z * sideways);
}

// The moved surface's normal at restXZ, as a slope (−n.x/n.y, −n.z/n.y),
// read at the pixel's mip level: the tangents of the moved surface,
// (1 + ∂Dx/∂x, ∂h/∂x, ∂Dz/∂x) and (∂Dx/∂z, ∂h/∂z, 1 + ∂Dz/∂z), crossed, the
// sideways parts scaled as the move is. And the Jacobian of the whole move,
// whether drawn sideways or not: under 1 where the water crowds toward a
// crest, toward 0 where the crest breaks.
vec2 galeSlope(vec2 restXZ, out float jacobian) {
  vec2 uv = galeUv(restXZ);
  vec4 derivatives = texture2D(uGaleDerivatives, uv) * uGaleMetresPerUnit;
  float crossTerm = texture2D(uGaleDisplacement, uv).a * uGaleMetresPerUnit;
  jacobian = (1.0 + derivatives.z) * (1.0 + derivatives.w) - crossTerm * crossTerm;
  float sideways = galeSideways(restXZ);
  vec3 alongX = vec3(1.0 + sideways * derivatives.z, derivatives.x, sideways * crossTerm);
  vec3 alongZ = vec3(sideways * crossTerm, derivatives.y, 1.0 + sideways * derivatives.w);
  vec3 normal = cross(alongZ, alongX);
  return -normal.xz / max(normal.y, 0.05);
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
// and about 35 operations. The rings come oldest first; the floor's
// Laplacian takes only the youngest uCausticRings of them (CAUSTIC_RINGS
// live ones, and those leaving the caustics, src/rings.js), each times its
// share in uRingCaustics.
#define MAX_RINGS ${MAX_RINGS}
#define RING_CAUSTIC_VECTORS ${Math.ceil(MAX_RINGS / 4)}
#define RING_PROFILE_TEXELS ${PROFILE_TEXELS.toFixed(1)}
#define RING_PROFILE_MAPPING ${PROFILE_MAPPING.toFixed(4)}
#define RING_METRES_PER_UNIT ${(1 / RING_TEXTURE_UNITS).toFixed(4)}
#define RING_CAUSTIC_STEP 0.02     // metres either side over which the floor's Laplacian differences the slope
uniform int uRingCount;
uniform vec4 uRingPlaces[MAX_RINGS];   // centre x, z; the direction θ is measured from, x, z
uniform vec4 uRingShapes[MAX_RINGS];   // reach R (m), outer radius (m, at most R), layer, inner radius (m)
uniform highp sampler2DArray uRingProfiles;
uniform int uCausticRings;                          // the floor's caustics take the youngest this many rings...
uniform vec4 uRingCaustics[RING_CAUSTIC_VECTORS];   // ...each by its share: ring i's is component i % 4 of vector i / 4

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
// Only the youngest uCausticRings rings, each times its share (src/rings.js).
float ringLaplacian(vec2 worldXZ, vec2 acrossX, vec2 acrossY) {
  float laplacian = 0.0;
  for (int rank = 0; rank < MAX_RINGS; rank++) {
    int index = uRingCount - 1 - rank;   // rank 0 the youngest: the rings come oldest first
    if (rank >= uCausticRings || index < 0) break;
    float share = uRingCaustics[index / 4][index % 4];
    if (share <= 0.0) continue;
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
    laplacian += share * (zeroth + first * dot(outward, place.zw));
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
${ICE_COMMON}
${SNOW_COVER}
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
//           filaments around the holes that a thinning raft opens. A
//           raft's only: a boil, bubbles bursting as they surface (all a
//           splash leaves on fresh water, src/splash.js), takes the lace
//           as an unresolved layer, its median, as the map's boil share
//           passes FOAM_LACE_BOIL_FROM to FOAM_LACE_BOIL_TO, so it is
//           bubbles alone and covers about the same;
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
// The coarse bubbles also carry clear film centres and scattering rims;
// the fine bubbles between them stay milky. Dense, freshly churned foam
// hides the films, then the map's separate boil/raft mixture exposes them
// as it drains. This reuses the coarse cell search, with no new texture,
// clock or noise layer. Unresolved films tend to their measured mean opacity.
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
// brightness and shimmer against supersampling, with these very constants.
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
// about 1800. The wet films add about 25 scalar operations and no cell
// visits or texture fetches (the raft amount is in the same RGBA sample).
//
// A splash's boil on fresh water. A stone leaves only a boil (src/splash.js):
// big bubbles which, with no salt to hold them apart, merge and burst as they
// reach the surface and never raft. Most of a real boil's white is not on
// the surface but in the cloud of bubbles just under it, which makes the
// water milky, pale and translucent; on the surface only one layer of
// bubbles bursts at a time. So WATER_FRAGMENT draws the splash's own boil
// (uFoam's; the gale's whitecaps, a breaking wave's packed froth, are this
// pattern's, white on any water) in two layers, never as this pattern.
// The surface holds a soft minimum of it and FOAM_BOIL_HOLD (FRESH_BOIL):
// bubbles bursting (freshBubbles), in FOAM_BUBBLE_CELL cells, one in each at
// most, at a random place and size within it, alive in a random share of the
// cells, up to FOAM_BUBBLE_MOST at the hold, each swelling as it surfaces,
// bursting after FOAM_BUBBLE_LIFE and followed by the next elsewhere in its
// cell: a clear cap that glints, with a white rim, so the boil fizzes,
// crisp and changing, and shows no grid. The rest, the cloud, tints the
// water seen through the surface before the sky's reflection and the sun's
// glitter go over it (freshBoilCloud), so from the bank, where the surface
// mostly mirrors, little of it shows. It is a Kubelka–Munk layer, sending back
// cloud / (cloud + FOAM_CLOUD_HALF) of what a deep cloud does, whose colour is
// R∞ = 1 + a − sqrt(a² + 2a), a the water's absorption (uAbsorb) over
// FOAM_CLOUD_SCATTER, a few per cent of air in millimetre bubbles: on the lake
// 0.66, 0.82, 0.85, the water's own blue-green, paled. It is lit as the foam
// is, a deep one FOAM_CLOUD_LIGHT as bright as white foam (tuned by frames:
// the light leaving the water through its surface spreads over a wider cone,
// and only some of it comes back off the surface's underside), and churned:
// three octaves of value noise, sliding FOAM_CHURN_SPEED each its own way,
// vary the light it sends back by up to FOAM_CHURN either way (a dense
// cloud's brightest lumps held at a deep cloud's, so its mean dims a
// little), and by FOAM_CHURN_EDGE more where it thins, so a big boil heaves
// in lumps and its edge breaks up rather than glowing as a blurred ring. A
// pebble's boil, under the hold, is nearly all surface, a fizz; a big
// stone's is mostly cloud, fizzing over it. tools/foam-probe.mjs checks the
// hold, the bubbles' cover and fade, the deep cloud's colour on every Water
// setting and the churn's spread. Cost: the map is read once, as before, only
// earlier; the hold is a square root and an inverse square root a pixel;
// where the surface holds a boil, the bubbles visit one cell, about 100
// operations (the film's mean over a pixel three square roots of them, its
// meniscus two smoothsteps); where there is a cloud, three value noises and its colour,
// about 80.
// A splash's boil on fresh water (FOAM_PATTERN's last paragraph): the share
// the surface holds, a soft minimum of the boil and FOAM_BOIL_HOLD,
// boil·(1 + (boil/hold)⁴)^(−1/4): all of a faint boil, at most the hold. The
// water (WATER_FRAGMENT) and the specks (SPECK_VERTEX) both take it.
// tools/foam-probe.mjs twins it (surfaceShare): change both.
export const FRESH_BOIL = /* glsl */`
#define FOAM_BOIL_HOLD 0.035               // the most of a splash's boil the surface holds, one layer of bubbles bursting
float freshBoilSurface(float boil) {
  float squared = boil * boil / (FOAM_BOIL_HOLD * FOAM_BOIL_HOLD);
  return boil * inversesqrt(sqrt(1.0 + squared * squared));
}
`;

// A bubble floating on the surface, seen from above, as the water's bubbles
// bursting over a boil (freshBubbles, FOAM_PATTERN) and the foam specks
// (SPECK_FRAGMENT) both draw it, so the two kinds match side by side: a
// nearly clear cap, the water showing through it (FOAM_BUBBLE_CAP_WHITE),
// with a thin bright rim where its film turns edge on. The film's white is
// the sky's Fresnel reflection off it, which climbs toward grazing
// incidence: it rises as g(r) = (1 − cosθ)², cosθ = sqrt(1 − r²) the cap's
// normal toward the viewer (r in radii), from the cap's to
// FOAM_BUBBLE_EDGE_WHITE at the limb, where the film mirrors the sky whole.
// A film's own two-face Fresnel falls faster, nearer (1 − cosθ)⁴ (0.11 at
// 60° where the square gives 0.28), but at that power the rim of a bubble
// 10 to 20 pixels across came out too faint to read in frames; the square
// was tuned by them. Three quarters of its white lies in the outer 15% of
// the radius, under a pixel until a bubble is some 13 pixels across, so a
// pixel takes the profile's mean over the span of radii it covers
// (bubbleFilm), by area, in closed form: over u = r²,
// ∫(1 − sqrt(1 − u))² du = 2u − u²/2 + (4/3)(1 − u)^1.5 (bubbleFilmArea).
// The rim never thins below a pixel and keeps its light, spread over it,
// and the span's share on the disc rounds off the limb. Over the whole cap
// the white averages FOAM_BUBBLE_FILM_MEAN: g's mean is ∫₀¹ g(r)·2r dr,
// which with c = cosθ (r dr = −c dc) is ∫₀¹ (1 − c)²·2c dc = 1/6 (for
// (1 − c)^p, 2/((p + 1)(p + 2)); the radius⁴ this replaced averaged 1/3).
// Pixels whose spans are centred on them, each a mean by area, keep that
// mean: summed over a bubble, every bit of its film is counted once
// whatever the pixel's size, so a field of them drawn at a footprint
// whitens on average as one point-sampled does, while the bubbles are
// wider than a pixel; one smaller loses some (the pixels by its centre
// average it over a span wider than it): where freshBubbles starts to fade
// them, 2% of the field's white (tools/foam-probe.mjs).
// Just inside the rim a faint shadow (bubbleMeniscus: FOAM_BUBBLE_MENISCUS
// of the light behind, at most), where the meniscus at the bubble's base
// bends the light away: the dark line beside the bright one is what makes
// an edge look like glass, though over dark water it hardly shows.
// The sun's glint is its mirror image on the cap: sunGlitter's lobe on the
// cap's normal, with FOAM_BUBBLE_GLINT_VARIANCE (a smooth film's slopes,
// spread by a couple of degrees as it wobbles; the raft's packed froth,
// FOAM_GLINT_VARIANCE, is ten times rougher) widened by the cap's turn
// across a pixel, so the glint is never smaller than a pixel and does not
// flicker as the bubble moves. FOAM_BUBBLE_GLINT is the film's two faces
// times π: the white beside the glint is drawn as the sun's irradiance with
// no Lambertian 1/π (src/sky.js), against which a mirror's highlight under
// the same sun is π times sunGlitter's lobe. So the glint is a soft spot on
// a bubble under some 8 pixels across, a distinct bright point from about
// 12, and on a bright one nearly white from about 25 (tuned by frames at
// the high view, the sun to the side).
export const SURFACE_BUBBLE = /* glsl */`
#define FOAM_BUBBLE_EDGE_WHITE 1.0         // a bubble's edge, its film seen edge on, mirroring the sky whole...
#define FOAM_BUBBLE_CAP_WHITE 0.04         // ...whitening as (1 − cosθ)² from this at its top: the water shows through its cap
#define FOAM_BUBBLE_FILM_MEAN (FOAM_BUBBLE_CAP_WHITE + (FOAM_BUBBLE_EDGE_WHITE - FOAM_BUBBLE_CAP_WHITE) / 6.0)   // its white's mean over the cap
#define FOAM_BUBBLE_MENISCUS 0.15          // the meniscus's shadow just inside the rim, as a share of the light behind...
#define FOAM_BUBBLE_MENISCUS_WIDTH 0.08    // ...over about this (radii), or a pixel if wider
#define FOAM_BUBBLE_GLINT 6.2831853        // 2π: the film's two faces, times π against the white beside it
#define FOAM_BUBBLE_GLINT_VARIANCE 0.002   // a smooth film's slope variance (2.6° rms)
// ∫(1 − cosθ)² du over the area u = r² from the centre, cosθ = sqrt(1 − u); nothing past the limb.
float bubbleFilmArea(float area) {
  area = min(area, 1.0);
  float rest = 1.0 - area;
  return 2.0 * area - 0.5 * area * area + (4.0 / 3.0) * rest * sqrt(rest);
}
// Over the radii from inner to outer (in radii, inner < outer), by area: x
// the share of them on the cap, y the film's mean white there.
vec2 bubbleFilm(float inner, float outer) {
  float innerArea = inner * inner, outerArea = outer * outer;
  float span = outerArea - innerArea;
  float onCap = (min(outerArea, 1.0) - min(innerArea, 1.0)) / span;
  float rim = (bubbleFilmArea(outerArea) - bubbleFilmArea(innerArea)) / span;
  return vec2(onCap, FOAM_BUBBLE_CAP_WHITE * onCap + (FOAM_BUBBLE_EDGE_WHITE - FOAM_BUBBLE_CAP_WHITE) * rim);
}
// The meniscus's shadow at a radius (radii), a pixel being so many radii: a
// band just inside the rim, the share of the light behind it takes.
float bubbleMeniscus(float radius, float pixel) {
  float band = max(FOAM_BUBBLE_MENISCUS_WIDTH, pixel);
  return FOAM_BUBBLE_MENISCUS * smoothstep(1.0 - 3.0 * band, 1.0 - 1.8 * band, radius) * (1.0 - smoothstep(1.0 - 1.8 * band, 1.0 - band, radius));
}
`;

export const FOAM_PATTERN = /* glsl */`
${SURFACE_BUBBLE}
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
#define FOAM_RAGGED 2.2                    // value noise lumps about 14 cm across, and a finer octave turned off its lattice (raggedNoise): a raft's outline
#define FOAM_RAGGED_FREQUENCY 7.0          // per metre
#define FOAM_RAGGED_FINE 2.3               // the finer octave's frequency over the coarser's...
#define FOAM_RAGGED_FINE_WEIGHT 0.35       // ...and its weight (the coarser's is the rest)
#define FOAM_STREAK_STRETCH 3.0            // under a gale a raft's lumps are drawn out along the wind this much...
#define FOAM_CREST_STRETCH 2.0             // ...and a whitecap's along its crest, across the wind, this much
#define FOAM_CLUMP 3.6                     // value noise lumps about 3 cm across, which break the lace
#define FOAM_CLUMP_FREQUENCY 35.0          // into filaments of uneven width, fragments and clumps (per metre)
#define FOAM_CLUMP_FINE 2.1                // the finer octave's frequency over the coarser's...
#define FOAM_CLUMP_FINE_WEIGHT 0.4         // ...and its weight
#define FOAM_LACE_READY 0.7                // a cell's hole sinks from its edge 1 ± this times as fast as the mean, by the cell's key
#define FOAM_FADE_START 0.18               // footprint over cell size
#define FOAM_FADE_END 0.45
#define FOAM_LACE_BOIL_FROM 0.5            // the lace goes as the map's boil share rises from this...
#define FOAM_LACE_BOIL_TO 0.8              // ...to this: a boil is bubbles, a raft lace
// Medians and spreads of the layers, measured over a large area: what a
// fading layer tends to, and the width it hands to the threshold.
#define FOAM_LACE_MEDIAN -0.52
#define FOAM_LACE_SPREAD 1.49
#define FOAM_FINE_MEDIAN 0.03
#define FOAM_FINE_SPREAD 0.6
#define FOAM_UNION_MEDIAN 0.26
#define FOAM_UNION_SPREAD 0.74
#define FOAM_CLUMP_SPREAD 0.29             // of one octave of value noise less 0.5, whose median is 0 (the clumps' and the ragged outline's)
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
#define FOAM_FILM_CENTRE 0.12              // a single wet bubble transmits most of the water beneath it
#define FOAM_FILM_MEAN 0.8                // measured by tools/foam-probe.mjs
#define FOAM_FILM_PACKED 0.9               // above this map density, multiple layers hide the clear films
#define FOAM_CLOUD_HALF 0.07               // the cloud's map value that sends back half what a deep cloud does (Kubelka–Munk)
#define GALE_CLOUD_SHARE 0.5               // the share of a whitecap's boil that is a cloud under the surface (WATER_FRAGMENT)
#define FOAM_CLOUD_SCATTER 5.0             // per metre: the cloud's Kubelka–Munk scattering, against the water's absorption
#define FOAM_CLOUD_LIGHT 0.38              // a deep cloud's light out through the surface, against white foam's under the same light
#define FOAM_CHURN 0.8                     // the light the cloud sends back varies by up to this share either way (never past a deep cloud's)...
#define FOAM_CHURN_EDGE 1.2                // ...and by up to this much more where it thins, so its edge breaks into lumps, over lumps...
#define FOAM_CHURN_FREQUENCY 10.0          // ...of this (per metre, about 10 cm across), 2.7 and 7 times it...
#define FOAM_CHURN_SPEED 0.05              // ...each sliding this fast (m/s) its own way, so the lumps change as they cross
#define FOAM_BUBBLE_CELL 0.012             // metres: the surface's bubbles over a boil, one in a cell at most...
#define FOAM_BUBBLE_RADII vec2(0.06, 0.4)  // ...of this radius (cells, 1.4 to 10 mm across; most small), wholly inside it...
#define FOAM_BUBBLE_MOST 0.48              // ...in this share of the cells where the surface holds all it can, as its square...
#define FOAM_BUBBLE_LIFE 0.45              // ...each surfacing and bursting within this (s), the next somewhere else in its cell
#define FOAM_BUBBLE_RISE 0.12              // the share of its life a bubble takes to swell to its size

// tools/foam-probe.mjs twins the cloud's colour and churn and the surface's
// bubbles (cloudColour, churnAt, freshBubbles): change both.
// The water seen through the surface, refracted, with the rest of a boil, a
// cloud of bubbles just under it, lit by light (the foam's): a Kubelka–Munk
// layer, sending back cloud / (cloud + FOAM_CLOUD_HALF) of what a deep one
// does, whose colour is the water's absorption against the cloud's scattering.
vec3 freshBoilCloud(vec3 refracted, float cloud, vec3 light, vec3 absorb, vec2 position, float time) {
  vec2 slide = FOAM_CHURN_SPEED * time * vec2(0.8, 0.6);
  // Three octaves of value noise, about 0.5 ± 0.13, stretched to fill 0 to 1.
  float churn = smoothstep(0.32, 0.68, 0.55 * valueNoise((position + slide) * FOAM_CHURN_FREQUENCY + 71.3)
    + 0.3 * valueNoise((position - slide.yx) * 2.7 * FOAM_CHURN_FREQUENCY + 13.1)
    + 0.15 * valueNoise((position + slide.yx) * 7.0 * FOAM_CHURN_FREQUENCY + 5.7));
  float share = cloud / (cloud + FOAM_CLOUD_HALF);
  float sentBack = clamp(share * (1.0 + (FOAM_CHURN + FOAM_CHURN_EDGE * (1.0 - share)) * (2.0 * churn - 1.0)), 0.0, 1.0);
  vec3 ratio = absorb / FOAM_CLOUD_SCATTER;
  vec3 deep = 1.0 + ratio - sqrt(ratio * ratio + 2.0 * ratio);
  return mix(refracted, FOAM_CLOUD_LIGHT * deep * light, sentBack);
}

vec3 foamHash(vec2 cell) {
  vec3 mixed = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973));
  mixed += dot(mixed, mixed.yxz + 33.33);
  return fract((mixed.xxy + mixed.yzz) * mixed.zyx);
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
  float bestKey;      // the winning feature's own random key, 0 to 1 (the lace's readiness to open)
};

FoamCells foamCells(vec2 position, vec2 radii, float jitter, vec2 seed) {
  vec2 cell = floor(position);
  vec2 within = position - cell;
  FoamCells result = FoamCells(-10.0, -10.0, vec2(1.0, 0.0), vec2(1.0, 0.0), 1.0, 0.0, 0.0);
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
        result.bestKey = fract((random.x + random.y) * 7.31);
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
// surfaceNormal: the water's, which tilts the bubbles with it; boilFraction:
// the short-lived population's share of the map (0 for a settled raft).
// The ragged outline's noise, about 0 ± FOAM_CLUMP_SPREAD: two octaves of
// value noise, the finer FOAM_RAGGED_FINE times the coarser's frequency and
// turned 37° off its lattice, so a raft's lumps are not the squares, aligned
// with the world, that one lattice makes; each octave fades to its mean where
// its lumps are finer than a pixel (fades.x the coarser's, fades.y the
// finer's). Under a gale the outline is drawn out: a whitecap's along its
// crest, across the wind (FOAM_CREST_STRETCH), and the raft it leaves along
// the wind (FOAM_STREAK_STRETCH), as the wind's shear draws foam into
// streaks; the two blend by the map's boil share. tools/foam-probe.mjs
// twins it with no gale: change both.
float raggedNoise(vec2 position, float boilFraction, vec2 fades) {
  if (uGaleMetresPerUnit > 0.0) {
    vec2 acrossWind = vec2(-uWindDirection.y, uWindDirection.x);
    float along = dot(position, uWindDirection) / mix(FOAM_STREAK_STRETCH, 1.0, boilFraction);
    float across = dot(position, acrossWind) / mix(1.0, FOAM_CREST_STRETCH, boilFraction);
    position = uWindDirection * along + acrossWind * across;
  }
  float coarse = valueNoise(position * FOAM_RAGGED_FREQUENCY + 31.7) - 0.5;
  float fine = valueNoise(mat2(0.8, 0.6, -0.6, 0.8) * position * (FOAM_RAGGED_FINE * FOAM_RAGGED_FREQUENCY) + 11.9) - 0.5;
  return (1.0 - FOAM_RAGGED_FINE_WEIGHT) * coarse * (1.0 - fades.x) + FOAM_RAGGED_FINE_WEIGHT * fine * (1.0 - fades.y);
}

FoamLook foamLook(vec2 position, vec2 acrossX, vec2 acrossY, float foam, vec2 foamChange, vec3 surfaceNormal, float boilFraction) {
  float footprint = sqrt(sqrt(dot(acrossX, acrossX) * dot(acrossY, acrossY)));
  float fineFade = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint / FOAM_FINE_CELL);
  float coarseFade = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint / FOAM_COARSE_CELL);
  // A boil is bubbles bursting as they surface, never a lace: where the map is
  // mostly boil the lace layer is taken as unresolved (its median, and its
  // spread widening the edge), so the cover stays and the filaments go. Only a
  // raft, sea foam (the gale's whitecaps), thins into lace.
  float laceFade = max(smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint / FOAM_LACE_CELL), smoothstep(FOAM_LACE_BOIL_FROM, FOAM_LACE_BOIL_TO, boilFraction));
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
    // from its deepest point outward with a crisp edge; how fast it sinks
    // from the edge is each cell's own (ready, 1 ± FOAM_LACE_READY by the
    // cell's key): bubbles pop at random, so one cell's hole opens early and
    // grows wide while its neighbours stay shut, and the holes come in many
    // sizes rather than one to a cell, a lattice of them.
    float ready = mix(1.0 - FOAM_LACE_READY, 1.0 + FOAM_LACE_READY, cells.bestKey);
    float sink = exp(min(raw, 0.0) * ready / FOAM_LACE_DEPTH);
    lace = mix(raw > 0.0 ? raw : FOAM_LACE_DEPTH * (sink - 1.0), FOAM_LACE_MEDIAN, laceFade);
    gradient += FOAM_LACE_WEIGHT * (1.0 - laceFade) * sink * (raw > 0.0 ? 1.0 : ready) * laceGradient;
  }

  // The bubbles: the union of the two layers' discs.
  FoamCells fine = FoamCells(-10.0, -10.0, vec2(1.0, 0.0), vec2(1.0, 0.0), 1.0, 0.0, 0.0);
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

  // The density: the map's, lumped at two scales. The clumps are two octaves
  // of value noise, the finer FOAM_CLUMP_FINE times the frequency and turned
  // 37° off the coarser's lattice (as the ragged outline's are), so they are
  // not that lattice's squares; each fades like a layer, at its own size.
  vec2 clumpFades = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint * FOAM_CLUMP_FREQUENCY * vec2(1.0, FOAM_CLUMP_FINE));
  float clump = 0.0;
  if (clumpFades.x < 1.0) {
    vec2 clumpSlope;
    clump = (valueNoiseWithGradient(position * FOAM_CLUMP_FREQUENCY + 57.3, clumpSlope) - 0.5) * (1.0 - clumpFades.x) * (1.0 - FOAM_CLUMP_FINE_WEIGHT);
    gradient += FOAM_CLUMP * FOAM_CLUMP_FREQUENCY * (1.0 - clumpFades.x) * (1.0 - FOAM_CLUMP_FINE_WEIGHT) * clumpSlope;
    if (clumpFades.y < 1.0) {
      mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
      vec2 fineSlope;
      clump += (valueNoiseWithGradient(turn * position * (FOAM_CLUMP_FINE * FOAM_CLUMP_FREQUENCY) + 23.7, fineSlope) - 0.5) * (1.0 - clumpFades.y) * FOAM_CLUMP_FINE_WEIGHT;
      gradient += FOAM_CLUMP * FOAM_CLUMP_FREQUENCY * FOAM_CLUMP_FINE * (1.0 - clumpFades.y) * FOAM_CLUMP_FINE_WEIGHT * (fineSlope * turn);
    }
  }
  // The ragged outline fades too, where its lumps are finer than a pixel
  // (far whitecaps, src/galeWaves.js; a splash's foam is never that far).
  vec2 raggedFades = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint * FOAM_RAGGED_FREQUENCY * vec2(1.0, FOAM_RAGGED_FINE));
  float ragged = raggedFades.x < 1.0 ? raggedNoise(position, boilFraction, raggedFades) : 0.0;
  float density = FOAM_LOG_SCALE * log(foam / FOAM_MID) + FOAM_RAGGED * ragged + FOAM_CLUMP * clump;
  float value = FOAM_LACE_WEIGHT * lace + FOAM_BUBBLE_WEIGHT * bubble + density;
  float changeAcrossPixel = abs(dot(gradient, acrossX)) + abs(dot(gradient, acrossY)) + FOAM_LOG_SCALE * (abs(foamChange.x) + abs(foamChange.y)) / foam;
  float spreadOfFaded = FOAM_LACE_WEIGHT * FOAM_LACE_SPREAD * laceFade
    + FOAM_BUBBLE_WEIGHT * (FOAM_FINE_SPREAD * fineFade * (1.0 - coarseFade) + FOAM_UNION_SPREAD * coarseFade)
    + FOAM_CLUMP * FOAM_CLUMP_SPREAD * ((1.0 - FOAM_CLUMP_FINE_WEIGHT) * clumpFades.x + FOAM_CLUMP_FINE_WEIGHT * clumpFades.y)
    + FOAM_RAGGED * FOAM_CLUMP_SPREAD * ((1.0 - FOAM_RAGGED_FINE_WEIGHT) * raggedFades.x + FOAM_RAGGED_FINE_WEIGHT * raggedFades.y);
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

  // The coarse bubbles that define the raft also define its wet films. A
  // single layer transmits water through their centres and scatters at their
  // rims; a dense boil hides those centres with multiple layers. The map's
  // two populations already decay independently, so this material drains
  // naturally without a new clock, moving noise or another cell search.
  float wetness = (1.0 - smoothstep(0.25, FOAM_FILM_PACKED, foam)) * mix(1.0, 0.75, boilFraction);
  float filmWidth = max(footprint / (FOAM_COARSE_CELL * coarse.bestRadius), 0.04);
  float filmRadius = length(coarse.bestOffset) / coarse.bestRadius;
  float centre = 1.0 - smoothstep(0.65 - filmWidth, 0.98 + filmWidth, filmRadius);
  float film = 1.0 - (1.0 - FOAM_FILM_CENTRE) * centre;
  film = mix(film, FOAM_FILM_MEAN, coarseFade);
  look.opacity *= mix(1.0, film, wetness);
  return look;
}

struct FreshBubbles {
  float white;          // the share of the pixel the bubbles whiten
  float shadow;         // the share of the light behind it the meniscus takes
  float glint;          // how much of a cap's glint to show (0 once they are unresolved)
  vec3 domeNormal;      // the cap's normal under the pixel, for its glint
  float glintVariance;
};

// The bubbles bursting on the surface over a boil (the header's last
// paragraph): in each FOAM_BUBBLE_CELL cell, at random, one bubble alive
// over each FOAM_BUBBLE_LIFE in the share filled²·FOAM_BUBBLE_MOST (a thin
// boil's few, a full one's many), swelling as it surfaces and gone at once
// when it bursts, the next at a new place and size, most of them small;
// drawn as SURFACE_BUBBLE says, a clear cap with a thin bright rim, each
// pixel the film's mean over the radii within half a pixel of it (its own
// footprint along the radius), a meniscus's faint shadow and the sun's
// glint. Only the cell under the pixel is visited, as no bubble leaves its
// cell. Whether its bubble lives is decided by the boil at the bubble's
// centre, filled carried there along filledSlope, its change per metre:
// decided under each pixel, a bubble across a boil's changing edge was cut
// along the line where the boil crossed its draw, a half moon or a chipped
// disc (tools/foam-probe.mjs samples an even boil, where the two agree).
// Where cells shrink toward a pixel (FOAM_FADE_START to FOAM_FADE_END
// cells per pixel) the bubbles fade into their mean white, which the spans
// keep (SURFACE_BUBBLE); the shadow, under 0.2% of the light in the mean,
// fades out with them. FOAM_BUBBLE_MOST is as many more bubbles as the
// thinner rim leaves the cap clearer (a cap's mean white fell from
// cap + (edge − cap)/3 = 0.277 to cap + (edge − cap)/6 = 0.2, the edge
// already as white as a film gets), so the boil whitens as it did from afar
// and fizzes with more, clearer bubbles close to. filled: the surface's
// share of the boil over FOAM_BOIL_HOLD; time: world seconds.
FreshBubbles freshBubbles(vec2 position, vec2 acrossX, vec2 acrossY, float filled, vec2 filledSlope, vec3 surfaceNormal, float time) {
  FreshBubbles bubbles = FreshBubbles(0.0, 0.0, 0.0, surfaceNormal, FOAM_BUBBLE_GLINT_VARIANCE);
  float footprint = sqrt(sqrt(dot(acrossX, acrossX) * dot(acrossY, acrossY)));
  float fade = smoothstep(FOAM_FADE_START, FOAM_FADE_END, footprint / FOAM_BUBBLE_CELL);
  float alive = FOAM_BUBBLE_MOST * clamp(filled * filled, 0.0, 1.0);
  // The mean: alive · the mean bubble's area in its cell · its mean white. Its radius is mix(radii, u²), u uniform,
  // so its mean square is a² + 2a(b − a)/3 + (b − a)²/5; the white averages FOAM_BUBBLE_FILM_MEAN over the cap (SURFACE_BUBBLE).
  vec2 radii = FOAM_BUBBLE_RADII;
  float span = radii.y - radii.x;
  float meanWhite = alive * PI * (radii.x * radii.x + 2.0 * radii.x * span / 3.0 + span * span / 5.0)
    * FOAM_BUBBLE_FILM_MEAN * (1.0 - 0.5 * FOAM_BUBBLE_RISE);
  if (fade < 1.0) {
    vec2 inCells = position / FOAM_BUBBLE_CELL;
    vec2 cell = floor(inCells);
    float clock = time / FOAM_BUBBLE_LIFE + foamHash(cell + vec2(41.0, 7.0)).x;
    float generation = floor(clock);
    float age = clock - generation;
    vec3 shape = foamHash(cell + generation * vec2(17.0, 31.0));
    vec3 place = foamHash(cell + generation * vec2(29.0, 13.0) + vec2(5.0, 61.0));
    float radius = mix(radii.x, radii.y, shape.y * shape.y) * smoothstep(0.0, FOAM_BUBBLE_RISE, age);
    vec2 centre = mix(vec2(radii.y), vec2(1.0 - radii.y), place.xy);
    vec2 offset = inCells - cell - centre;
    float radial = length(offset) / max(radius, 1e-4);
    float edge = footprint / FOAM_BUBBLE_CELL / max(radius, 1e-3);   // a pixel, in radii
    // A pixel along the radius here, in radii: the pixel's own footprint that way, longer where the view foreshortens the water.
    vec2 outward = offset / max(length(offset), 1e-6);
    float radialPixel = max(length(vec2(dot(outward, acrossX), dot(outward, acrossY))) / (FOAM_BUBBLE_CELL * max(radius, 1e-3)), 1e-3);
    float filledThere = max(filled + dot(filledSlope, (cell + centre - inCells) * FOAM_BUBBLE_CELL), 0.0);
    float lives = step(shape.z, FOAM_BUBBLE_MOST * min(filledThere * filledThere, 1.0));
    vec2 film = bubbleFilm(max(radial - 0.5 * radialPixel, 0.0), radial + 0.5 * radialPixel) * lives;   // x: the share on the cap; y: its white
    bubbles.white = mix(film.y, meanWhite, fade);
    bubbles.shadow = bubbleMeniscus(radial, radialPixel) * lives * (1.0 - fade);
    float domeHeight = sqrt(max(1.0 - radial * radial, 0.0));
    bubbles.domeNormal = normalize(vec3(offset.x, 0.0, offset.y) / max(radius, 1e-4) + surfaceNormal * (domeHeight + 0.05));
    bubbles.glint = film.x * (1.0 - fade);
    float turnAcrossPixel = edge;
    bubbles.glintVariance = FOAM_BUBBLE_GLINT_VARIANCE + turnAcrossPixel * turnAcrossPixel;
  } else {
    bubbles.white = meanWhite;
  }
  return bubbles;
}
`;

// The water. The inner patch is displaced by the splash height, the ambient
// height and the rings' height together, all faded out by patchMask at the
// patch's rim, so its edge meets the flat outer sheet (the ambient height
// there, a few millimetres 4 m and more from the camera, and a ring's, a
// millimetre or less by the time it gets there, are far below a pixel; the
// sheet is four quads, which could not carry a ring anyway). Shading takes
// the slope of all three everywhere: the splash's inside the patch, the
// ambient's and the rings' over all the water, outer sheet included. Under a
// gale (src/galeWaves.js) both the patch and the sheet then move by its
// waves, unmasked, read at the point's rest position (vRest, where every
// other field is laid) and as smooth as the mesh is coarse; the shading
// takes its moved surface's normal, its roughness and its whitecaps.
//
// Two variants of the same source, chosen by a #define, serve the cavity a
// stone opens (src/cavity.js); without either, the shaders compile to what
// they always were.
//   CAVITY_PUSH (the inner patch while a cavity is open, set to the most
//     cavities there can be): every vertex inside a cavity's circle moves by
//     that cavity's shift, down below the hole's floor and along its axis, so
//     the patch dips under the cavity's lip in a well that holds the cavity
//     and never shows through the hole (src/cavity.js says how the circle
//     and the shift are chosen). A moved vertex keeps the surface's height
//     where it came from (the splash's, the wind's and the rings'), as the
//     mesh over it rides the same height, so the well goes down with the
//     dish when a ring's trough forms under the hole; under the ice the
//     height is already nothing. The moved vertices get no mask, so the
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
uniform float uSheetSpacing;   // the outer sheet's vertex spacing per metre out from the patch's centre (src/waterSurface.js)
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
varying vec2 vRest;            // where the point lies on still water (the gale moves it from there)
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
  // Under the ice (ICE_COMMON) the surface lies still, the sheet's top its freeboard over the water (things rest on it
  // there, src/ice.js top): the sheet is rigid.
  float icedHere = uIceOn > 0.5 ? smoothstep(0.0, 0.02, iceMaskAt(world.xz).solid) : 0.0;
  height *= 1.0 - icedHere;
  world.y += height * mask + uIceTop * icedHere;
  vRest = world.xz;
#ifdef CAVITY_MESH
  // The cavity is built on still water (src/cavity.js); the gale lifts it with the column.
  if (uGaleMetresPerUnit > 0.0) world.y += galeLift((modelMatrix * vec4(position, 1.0)).xyz);
#else
  // The gale moves the water (the cavity's mesh is lifted whole, src/cavity.js),
  // read as smooth as the mesh is coarse: the patch at the base level, the
  // sheet's vertices, sparser the farther out, at the level of their spacing.
  if (uGaleMetresPerUnit > 0.0) {
    vec2 fromCentre = abs(world.xz - uGaleCentre);
    float spacing = uInner > 0.5 ? uMeshCell : uSheetSpacing * max(fromCentre.x, fromCentre.y);
    world += galeMove(world.xz, max(log2(spacing * uGaleTexels / uGaleTileSize) + 0.5, 0.0));
  }
#endif
#ifdef CAVITY_PUSH
  for (int index = 0; index < CAVITY_PUSH; index++) {
    if (index >= uCavityCount) break;
    vec2 fromMouth = world.xz - uCavityMouths[index].xy;
    if (dot(fromMouth, fromMouth) < uCavityMouths[index].z) {
      vec3 still = vec3(world.x + uCavityShifts[index].x, uCavityShifts[index].y, world.z + uCavityShifts[index].z);
      world = vec3(still.x, still.y + height * mask + (uGaleMetresPerUnit > 0.0 ? galeLift(still) : 0.0), still.z);
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

// The pool (src/pool.js): a tiled basin, its walls rising out of the water to
// the deck, and the deck round it. POOL_TILES is the tiles' albedo at a point
// of the basin with its normal: square tiles of POOL_TILE with grout of
// POOL_GROUT between them, laid from the pool's corner on the floor and from
// the deck down on the walls, whose top BAND_ROWS rows, at the waterline, are
// a deep blue; each tile a few percent lighter or darker than the next.
// Antialiased: the grout's share of each pixel's footprint is the box
// filter's exact integral over it (a grid's lines, Quilez's
// "filterable procedurals"), the footprint from the screen derivatives of the
// world position (smooth across the basin's corners) along the face's tile
// axes, so far off the grout greys the tiles evenly rather than shimmering,
// and the tiles' own variation fades out once a tile is under a pixel or so.
const POOL_TILES = /* glsl */`
uniform vec4 uPool;     // the pool's corner (x, z), its side and its depth (m)
uniform float uDeck;    // m: the deck's level above the still water, the walls' top
#define POOL_TILE 0.125
#define POOL_GROUT 0.005
#define BAND_ROWS 2.0
#define TILE_COLOR vec3(0.74, 0.86, 0.88)
#define GROUT_COLOR vec3(0.42, 0.45, 0.45)
#define BAND_COLOR vec3(0.09, 0.27, 0.56)
#define TILE_VARIATION 0.06
// The share of a footprint (a box about cell, width wide, in tiles) that no
// grout line covers: the lines are POOL_GROUT/POOL_TILE of a tile wide, at
// each tile's low edge.
float tileCover(vec2 cell, vec2 width) {
  float lines = POOL_TILE / POOL_GROUT;
  vec2 high = cell + 0.5 * width;
  vec2 low = cell - 0.5 * width;
  vec2 covered = (floor(high) + min(fract(high) * lines, 1.0) - floor(low) - min(fract(low) * lines, 1.0)) / (lines * width);
  return (1.0 - covered.x) * (1.0 - covered.y);
}
// A face's tile axes at a point (in tiles): across the floor from the
// pool's corner; along a wall from its corner, and down from the deck. And
// a world step's length along them.
vec2 tileCell(vec3 point, vec3 normal) {
  if (abs(normal.y) > 0.5) return (point.xz - uPool.xy) / POOL_TILE;
  if (abs(normal.x) > 0.5) return vec2(point.z - uPool.y, uDeck - point.y) / POOL_TILE;
  return vec2(point.x - uPool.x, uDeck - point.y) / POOL_TILE;
}
vec2 tileStep(vec3 step, vec3 normal) {
  if (abs(normal.y) > 0.5) return step.xz / POOL_TILE;
  if (abs(normal.x) > 0.5) return vec2(step.z, -step.y) / POOL_TILE;
  return vec2(step.x, -step.y) / POOL_TILE;
}
// The tiles' albedo over a footprint width tiles wide (no derivatives: the
// mirror under the surface, WATER_UNDER_FRAGMENT, marches to it).
vec3 poolTileColor(vec3 point, vec3 normal, vec2 width) {
  vec2 cell = tileCell(point, normal);
  bool wall = abs(normal.y) < 0.5;
  vec3 tile = wall && cell.y < BAND_ROWS ? BAND_COLOR : TILE_COLOR;
  float variation = (hash21(floor(cell) + (wall ? normal.xz * 37.0 : vec2(0.0))) - 0.5) * 2.0 * TILE_VARIATION;
  tile *= 1.0 + variation * (1.0 - smoothstep(0.4, 1.2, max(width.x, width.y)));
  return mix(GROUT_COLOR, tile, tileCover(cell, width));
}
// The tiles' albedo over this pixel's footprint (from the screen derivatives
// of the true point, smooth across the basin's corners).
vec3 poolTiles(vec3 point, vec3 normal) {
  vec2 width = max(abs(tileStep(dFdx(point), normal)), abs(tileStep(dFdy(point), normal))) + 1e-3;
  return poolTileColor(point, normal, width);
}
// The way along a ray from a point in the pool to its basin, and the face
// it meets there: the floor, or the first wall in its way.
float toBasin(vec3 origin, vec3 ray, out vec3 normal) {
  vec2 low = uPool.xy;
  vec2 high = uPool.xy + uPool.z;
  float along = (-uPool.w - origin.y) / min(ray.y, -1e-5);
  normal = vec3(0.0, 1.0, 0.0);
  float wall = ray.x > 1e-5 ? (high.x - origin.x) / ray.x : ray.x < -1e-5 ? (low.x - origin.x) / ray.x : 1e4;
  if (wall < along) { along = wall; normal = vec3(-sign(ray.x), 0.0, 0.0); }
  wall = ray.z > 1e-5 ? (high.y - origin.z) / ray.z : ray.z < -1e-5 ? (low.y - origin.z) / ray.z : 1e4;
  if (wall < along) { along = wall; normal = vec3(0.0, 0.0, -sign(ray.z)); }
  return max(along, 0.0);
}
`;

export const WATER_FRAGMENT = /* glsl */`
#include <packing>
uniform sampler2D uHeight;
uniform sampler2D uFoam;
uniform vec2 uFoamDrift;          // how far the wind has carried the foam (m): its pattern drifts with the map
uniform sampler2D uReflection;    // the sky dome seen through a mirrored camera; alpha: nearness (MIRROR_COMMON, src/shaders/fluid.js)
uniform samplerCube uSkyCube;     // the sky as the droplets reflect it (src/sky.js), mipmapped: the ice's frosted mirror
uniform mat4 uReflectionMatrix;   // world -> reflection texture coordinates
uniform vec4 uMirrorNear;         // the splash's image in the mirror, uv corners (x0, y0, x1, y1); empty (x0 > x1) when none
uniform vec2 uMirrorSize;         // the mirror image's pixels
uniform float uMirrorLevel;       // the height it mirrors about: the water's under the splash (0 but under a gale, src/main.js)
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
uniform vec3 uAbsorb;          // per metre: absorption alone (lighting.absorb), which tints a boil's cloud
uniform float uRoughness;        // sub-grid roughness: a slope spread of uRoughness² (rms, both axes)
uniform float uAmbientUnresolved[AMBIENT_LEVELS];   // slope variance each mip level of the ambient waves loses
uniform float uGaleUnresolved[GALE_LEVELS];         // and of the gale's (src/galeWaves.js)
// A floater's dry disc (src/waterSurface.js setDryDiscs: inside a pizza's crust): centre x and z, its radius squared.
// It rides the water (src/rock.js rideTheWater), so its rim always holds the water out: seen from above, the water is
// not drawn inside it, and the floater's own top shows.
uniform vec3 uDryDiscs[DRY_DISCS];
uniform int uDryCount;
varying vec3 vWorld;
varying vec2 vDomainUv;
varying float vMask;
varying float vViewZ;
varying vec2 vRest;            // where the point lies on still water (WATER_VERTEX)
#ifdef CAVITY_MESH
#define CAVITY_DARKEST 0.1          // the hole's light where it sees no sky, against the open water's
varying vec3 vNormalWorld;
varying vec3 vCavity;       // rides the surface, open to the sky, climb to escape (WATER_VERTEX)
#endif
${GLSL_COMMON}
${POOL_TILES}
${FRESH_BOIL}
${FOAM_PATTERN}
${RAIN_RIPPLES}
${DROP_RING_SLOPES}
${HAZE}

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

// The wind's streaks under a gale: the whitecaps' raft (src/galeWaves.js)
// gathered into windrows, lines along the wind GALE_STREAK_SPACING apart
// across it, up to GALE_STREAK_WIDTH of that wide (narrowing and widening
// along it), wavering over GALE_STREAK_WAVER along it and broken into
// lengths, as Langmuir cells sweep the foam the
// whitecaps leave. Returned is the raft's gain there: GALE_STREAK_GAIN on a
// line, GALE_STREAK_LEFT between them. A line finer than the pixel (its
// footprint across the wind, from acrossX and acrossY) fades to its mean.
#define GALE_STREAK_SPACING 0.9
#define GALE_STREAK_WIDTH 0.1
#define GALE_STREAK_WAVER 7.0
#define GALE_STREAK_GAIN 2.0
#define GALE_STREAK_LEFT 0.6
float galeStreaks(vec2 restXZ, vec2 acrossX, vec2 acrossY) {
  vec2 across = vec2(-uWindDirection.y, uWindDirection.x);
  float along = dot(restXZ, uWindDirection);
  float coordinate = dot(restXZ, across) / GALE_STREAK_SPACING;
  coordinate += 2.5 * (valueNoise(vec2(along / GALE_STREAK_WAVER, coordinate * 0.25)) - 0.5);
  float pixel = (abs(dot(acrossX, across)) + abs(dot(acrossY, across))) / GALE_STREAK_SPACING;
  float fromLine = abs(fract(coordinate) - 0.5);
  float width = GALE_STREAK_WIDTH * (0.3 + 0.7 * valueNoise(vec2(floor(coordinate) * 3.71 + 9.2, along / 1.3)));
  float line = 1.0 - smoothstep(0.5 * width - 0.5 * pixel, 0.5 * width + 0.5 * pixel, fromLine);
  line = mix(line, width, smoothstep(width, 1.0, pixel));
  float lengths = smoothstep(0.5, 0.8, valueNoise(vec2(floor(coordinate) * 7.13, along / 1.5)));
  return mix(GALE_STREAK_LEFT, GALE_STREAK_GAIN, line * lengths);
}

// The same for the gale's waves, at the rest position its lookups are at.
float galeUnresolvedVariance(vec2 restXZ) {
  vec2 texelPosition = restXZ / uGaleTileSize * uGaleTexels;
  vec2 acrossX = dFdx(texelPosition);
  vec2 acrossY = dFdy(texelPosition);
  float level = clamp(0.5 * log2(max(max(dot(acrossX, acrossX), dot(acrossY, acrossY)), 1e-8)), 0.0, float(GALE_LEVELS - 1) - 0.001);
  int lower = int(level);
  return mix(uGaleUnresolved[lower], uGaleUnresolved[lower + 1], level - float(lower));
}

// The whitecaps' map (uGaleFoam, src/galeWaves.js) at a rest position,
// reconstructed with a cubic B-spline: its texels are 12.5 cm, and the
// pattern's threshold cut through a bilinear sample is a polygon with a
// corner at every texel, which showed as a grid of squares in every whitecap
// from a few metres. The spline is smooth across texels, at a little blur
// the map's own smoothness hides; four bilinear fetches, the usual pairing
// of the spline's weights, where one was.
vec2 galeFoamAt(vec2 restXZ) {
  vec2 texel = restXZ / uGaleTileSize * uGaleFoamTexels;   // integer at a texel's centre
  vec2 base = floor(texel);
  vec2 f = texel - base;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = base - 1.0 + w1 / g0, h1 = base + 1.0 + w3 / g1;
  float scale = 1.0 / uGaleFoamTexels;
  vec2 uv00 = (vec2(h0.x, h0.y) + 0.5) * scale, uv10 = (vec2(h1.x, h0.y) + 0.5) * scale;
  vec2 uv01 = (vec2(h0.x, h1.y) + 0.5) * scale, uv11 = (vec2(h1.x, h1.y) + 0.5) * scale;
  return (texture2D(uGaleFoam, uv00).rg * g0.x + texture2D(uGaleFoam, uv10).rg * g1.x) * g0.y
    + (texture2D(uGaleFoam, uv01).rg * g0.x + texture2D(uGaleFoam, uv11).rg * g1.x) * g1.y;
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
  vec3 mirrorEye = vec3(cameraPosition.x, 2.0 * uMirrorLevel - cameraPosition.y, cameraPosition.z);
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

// The pool's tiles' fine detail, which the under-water pass, drawn coarser
// than the screen (src/main.js QUALITY's underScale), smoothed away. The
// pass draws the basin where the still surface shows it (SEEN_THROUGH_WATER:
// each point moved along the surface to where the ray it is seen by crosses
// it), so at a point of the surface it shows the tiles where the eye's ray,
// bent into the water there, meets the basin (basinSeen), and its depth is
// that point's height on the straight ray. The detail is the tiles' pattern
// there over this pixel's footprint (from the bent rays of the points a
// pixel either way, acrossX and acrossY the surface's), against the same
// over the pass's texel there (its pixel magnified and bilinearly filtered,
// about 1.4 of them), as a factor on what the pass shows: the grout keeps
// the screen's sharpness and the pass its light, caustics and shadows. 1
// where the pass is at the screen's resolution, in a lake, or where
// something under the water stands in front of the basin (the pass's depth
// there is not the basin's).
vec3 basinSeen(vec3 surfacePoint, out vec3 normal) {
  vec3 ray = normalize(surfacePoint - cameraPosition);
  vec3 bent = refract(ray, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
  return surfacePoint + bent * toBasin(surfacePoint, bent, normal);
}
vec3 poolDetail(vec3 point, vec2 acrossX, vec2 acrossY, float underDistZ, float surfaceDistZ) {
  if (uPool.w <= 0.0) return vec3(1.0);
  vec2 underScale = vec2(textureSize(uUnderColor, 0)) / uResolution;
  float coarse = 1.0 / max(min(underScale.x, underScale.y), 1e-3);
  if (coarse < 1.05) return vec3(1.0);
  vec3 normal, besideNormal;
  vec3 hit = basinSeen(point, normal);
  vec3 ray = point - cameraPosition;
  float toSurface = max(length(ray), 1e-5);
  float straight = (point.y - hit.y) / max(-ray.y / toSurface, 1e-4);
  float expected = surfaceDistZ * (toSurface + straight) / toSurface;
  if (abs(underDistZ - expected) > 0.03 * expected) return vec3(1.0);
  vec2 stepX = tileStep(basinSeen(point + vec3(acrossX.x, 0.0, acrossX.y), besideNormal) - hit, normal);
  vec2 stepY = tileStep(basinSeen(point + vec3(acrossY.x, 0.0, acrossY.y), besideNormal) - hit, normal);
  vec2 width = max(abs(stepX), abs(stepY)) + 1e-3;
  return poolTileColor(hit, normal, width) / max(poolTileColor(hit, normal, width * coarse * 1.4), vec3(0.02));
}

// The ice's surface at this pixel (ICE_COMMON; mask iceMaskAt's here,
// footprint the pixel's on the water), before the haze: the mirror (the
// still mirror's texel, blurred toward the sky's cube by the frost), with
// ice's Fresnel; under it the clear ice's view of the water as still water
// shows it (the under-water pass, unbent), veiled by the light the ice
// scatters back along the ray (ICE_SCATTER), or the light its snow ice,
// frost specks, bubbles and crystals' boundaries scatter (iceLook); the
// sun's sheen on the frost; the hole's broken edge, its fracture face seen
// through the clear ice (fractureFace), and the wet round a hole; new ice
// over a hole clear and glazed, its old edge a seam (ICE_COMMON's header).
// Snow lies on it as on the ground (SNOW_COVER), but where it is new or wet.
// Its cracks are drawn over it (src/iceCracks.js). In the pool the tiles
// under it keep their detail (poolDetail; acrossX and acrossY the pixel's
// footprint on the surface, taken where the derivatives are good).
vec3 iceSurface(IceMask mask, float footprint, vec2 acrossX, vec2 acrossY) {
  IceLook look = iceLook(vWorld.xz, footprint);
  vec3 toCamera = cameraPosition - vWorld;
  float viewDist = length(toCamera);
  vec3 v = toCamera / viewDist;
  vec3 n = vec3(0.0, 1.0, 0.0);
  // New ice over a hole (src/ice.js REFREEZE): clear, none of the sheet's snow ice, crystals, specks or bubbles.
  float newIce = smoothstep(-0.5 * footprint, 0.5 * footprint, mask.skin) * (1.0 - smoothstep(-0.5 * footprint, 0.5 * footprint, mask.hole));
  look.white *= 1.0 - newIce;
  look.bubbles *= 1.0 - newIce;
  // The hole's edge (ICE_COMMON): the mask's gradient says which way it runs. Lapped by its open water, it is a fracture
  // face seen through the ice; skinned over beside it, a seam.
  float face = 0.0, seam = 0.0, lapped = 1.0;
  if (mask.hole < 0.95 * uIceFar) {
    float offset = 0.006;
    vec2 edgeGradient = vec2(iceMaskAt(vWorld.xz + vec2(offset, 0.0)).hole - mask.hole, iceMaskAt(vWorld.xz + vec2(0.0, offset)).hole - mask.hole) / offset;
    if (dot(edgeGradient, edgeGradient) > 1e-6) {
      vec2 travel = normalize(vWorld.xz - cameraPosition.xz + 1e-6);   // the way the eye's ray goes, level
      vec2 outward = normalize(edgeGradient);
      // Just inside the hole beside it: skinned over there, the edge is a seam in the ice.
      float covered = smoothstep(-0.003, 0.003, iceMaskAt(vWorld.xz - outward * (max(mask.hole, 0.0) + 0.008)).skin);
      lapped = 1.0 - covered;
      float across = dot(travel, outward);
      if (across < 0.0) face = fractureFace(mask.hole, across, length(v.xz), footprint) * lapped;
      seam = covered * iceLine(mask.hole, 0.0007, footprint);
    }
  }
  // Wet: the rain's film, the flood and the drops (the mask's), and where open water laps a hole's edge (its edge
  // ragged). Wet, glazed (once wet) or new, it is smooth (ICE_GLAZED).
  float edgeWet = (1.0 - smoothstep(0.0, ICE_WET_EDGE, mask.hole + 0.015 * (valueNoise(vWorld.xz * 40.0) - 0.5))) * 0.8 * lapped;
  float wet = max(max(uIceWet, mask.wet), edgeWet);
  float slopeVariance = mix(look.slopeVariance, ICE_GLAZED * ICE_GLAZED, max(max(wet, mask.glaze), newIce));
  float nDotV = max(dot(n, v), 0.0);
  float fresnel = 0.018 + 0.982 * pow(1.0 - nDotV, 5.0);
  vec3 reflectedRay = reflect(-v, n);
  reflectedRay.y = max(reflectedRay.y, 0.001);
  vec4 reflectCoord = uReflectionMatrix * vec4(reflectedRay, 0.0);
  vec4 stillRayCoord = uReflectionMatrix * vec4(-v.x, v.y, -v.z, 0.0);
  vec4 stillPointCoord = uReflectionMatrix * vec4(vWorld.x, uMirrorLevel, vWorld.z, 1.0);
  vec2 reflectUv = stillPointCoord.xy / max(stillPointCoord.w, 1e-4) + reflectCoord.xy / max(reflectCoord.w, 1e-4) - stillRayCoord.xy / max(stillRayCoord.w, 1e-4);
  vec3 reflected = uMirrorNear.x > uMirrorNear.z ? texture2D(uReflection, clamp(reflectUv, vec2(0.002), vec2(0.998))).rgb : nearReflection(reflectUv, reflectedRay);
  // Frost spreads the reflected ray over about twice its rms slope: past a little frost the mirror is the sky's cube
  // (the dome, which the mirror image holds but for what is near) blurred by its mip levels that wide (ICE_FROST_LEVELS
  // a radian).
  float spread = 2.0 * sqrt(slopeVariance);
  vec3 frosted = textureCubeLodEXT(uSkyCube, reflectedRay, clamp(log2(max(spread * ICE_FROST_LEVELS, 1.0)), 0.0, ICE_FROST_COARSEST)).rgb;
  // The cube holds the sun's disc (capped, src/sky.js), which the frost would spread into a broad soft blob: the sun's
  // light on the frost is its sheen (sunGlitter, below), so the frosted sky is held to ICE_FROST_SKY of its mean.
  float frostedLuminance = dot(frosted, vec3(0.2126, 0.7152, 0.0722)), skyLuminance = dot(uSkyAmbient, vec3(0.2126, 0.7152, 0.0722));
  frosted *= min(1.0, ICE_FROST_SKY * skyLuminance / max(frostedLuminance, 1e-6));
  reflected = mix(reflected, frosted, smoothstep(0.05, 0.15, spread));
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float surfaceDistZ = -vViewZ;
  float rawDepth = texture2D(uUnderDepth, screenUv).r;
  float underDistZ = rawDepth >= 1.0 ? uFar : -perspectiveDepthToViewZ(rawDepth, uNear, uFar);
  float path = max(underDistZ - surfaceDistZ, 0.0) * viewDist / max(surfaceDistZ, 1e-4);
  vec3 under = mix(uWaterColor, texture2D(uUnderColor, screenUv).rgb * poolDetail(vWorld, acrossX, acrossY, underDistZ, surfaceDistZ), exp(-uExtinction * path));
  vec3 light = uSunIrradiance * max(dot(n, uSunDir), 0.0) + uSkyAmbient * ICE_SKY_LIGHT;
  vec3 scattered = ICE_WHITE_ALBEDO * light * mix(1.0, 0.6, wet);
  // Its veil (ICE_COMMON's header): the share of the light the clear ice scatters back along the refracted ray's path
  // through it, a new skin's (src/ice.js REFREEZE.skin) a few millimetres.
  float sineInside = clamp(length(v.xz) / ICE_INDEX, 0.0, 0.99);
  float through = mix(uIceThickness, min(uIceThickness, 0.004), newIce) / sqrt(1.0 - sineInside * sineInside);
  float veil = (1.0 - exp(-ICE_SCATTER * through)) * (1.0 - 0.6 * wet);
  float white = clamp(look.white + look.bubbles + veil, 0.0, 1.0);
  float clear = 1.0 - look.white;
  vec3 body = mix(under, scattered, white);
  // A fracture face in clear ice turns the light back as a mirror would: it shows white, as the sky's light it sends up.
  body = mix(body, scattered * 1.15, face * clear);
  vec3 color = mix(body, reflected, fresnel * mix(1.0 - 0.6 * look.white, 1.0, wet));
  color += min(sunGlitter(n, v, uSunDir, uSunIrradiance, slopeVariance + 1e-5) * mix(look.glints, 1.0, max(wet, newIce)), vec3(400.0)) * mix(1.0 - 0.5 * look.white, 1.0, wet);
  // An old edge in new ice: a faint dark seam.
  color = mix(color, under * 0.7, 0.5 * seam);
  // Snow lying on it (SNOW_COVER), as on the ground: none on new ice, none where it is wet (the flood's, a drop's).
  float snow = snowOnIce(vWorld.xz, footprint) * (1.0 - newIce) * (1.0 - wet);
  if (snow > 0.0) color = mix(color, snowShade(vWorld.xz) * light, snow);
  return color;
}

void main() {
  if (cameraPosition.y > vWorld.y) {
    for (int index = 0; index < DRY_DISCS; index++) {
      if (index >= uDryCount) break;
      vec2 fromCentre = vWorld.xz - uDryDiscs[index].xy;
      if (dot(fromCentre, fromCentre) < uDryDiscs[index].z) discard;
    }
  }
  // The ice (ICE_COMMON): where its mask says ice, the surface is the ice's (iceSurface), blended with the water's over
  // the pixel at a hole's edge. A cavity's lip stands on no ice: what of it reaches over the ice, above the water, is gone.
  vec2 surfaceAcrossX = dFdx(vWorld.xz), surfaceAcrossY = dFdy(vWorld.xz);
  float iceFootprint = max(length(surfaceAcrossX), length(surfaceAcrossY));
  float iced = 0.0;
  IceMask iceAt;
#ifdef CAVITY_MESH
  if (uIceOn > 0.5 && vWorld.y > -0.002 && iceMaskAt(vWorld.xz).solid > 0.0) discard;
#else
  if (uIceOn > 0.5) {
    iceAt = iceMaskAt(vWorld.xz);
    iced = iceCover(iceAt.solid, iceFootprint);
    if (iced > 0.999) {
      gl_FragColor = vec4(min(withHaze(iceSurface(iceAt, iceFootprint, surfaceAcrossX, surfaceAcrossY), length(cameraPosition - vWorld)), vec3(1000.0)), 1.0);
      return;
    }
  }
#endif
  float texelStep = 1.0 / uN;
  float hl = texture2D(uHeight, vDomainUv - vec2(texelStep, 0.0)).r;
  float hr = texture2D(uHeight, vDomainUv + vec2(texelStep, 0.0)).r;
  float hd = texture2D(uHeight, vDomainUv - vec2(0.0, texelStep)).r;
  float hu = texture2D(uHeight, vDomainUv + vec2(0.0, texelStep)).r;
  vec3 toCamera = cameraPosition - vWorld;
  float viewDist = length(toCamera);
  // The splash's foam, and its boil divided (FOAM_PATTERN): what the surface
  // holds, drawn by the pattern below, and the cloud under it.
  vec2 splashFoam = texture2D(uFoam, vDomainUv).rg * vMask;
  float splashBoil = max(splashFoam.r - splashFoam.g, 0.0);
  float boilSurface = freshBoilSurface(splashBoil);
  float boilCloud = splashBoil - boilSurface;
  // The gale's whitecaps (src/galeWaves.js), over all the water, read at the
  // point's rest position: the boil is the whitecap's whitewater, part of it
  // a cloud of bubbles driven under the surface (GALE_CLOUD_SHARE, drawn as
  // a splash's boil's cloud is: the milky halo round a whitecap, soft where
  // the froth's edge is crisp), the rest packed froth on the surface, with
  // the raft it leaves (foamKinds, below).
  vec2 whitecaps = vec2(0.0);
  if (uGaleMetresPerUnit > 0.0) {
    whitecaps = galeFoamAt(vRest);
    boilCloud += GALE_CLOUD_SHARE * max(whitecaps.r - whitecaps.g, 0.0);
  }
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
  // the ripples' own unresolved slope). So do the drop rings' (src/
  // dropRings.js: the little rings a splash's drops leave where they land).
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
  if (uRainOn > 0.5) {
    surfaceSlope += rainSlope(vWorld.xz) * ride;
    slopeVariance += rainUnresolvedVariance(vWorld.xz) * ride;
  }
  if (uDropRingCount > 0) surfaceSlope += dropRingSlope(vWorld.xz, acrossX, acrossY) * ride;
  float galeJacobian = 1.0;
  if (uGaleMetresPerUnit > 0.0) {
    surfaceSlope += galeSlope(vRest, galeJacobian) * ride;
    slopeVariance += galeUnresolvedVariance(vRest) * ride;
  }
  vec3 meshNormal = normalize(vNormalWorld);
  vec3 n = normalize(meshNormal + vec3(-surfaceSlope.x, 0.0, -surfaceSlope.y) * max(meshNormal.y, 0.0));
  float level = smoothstep(0.6, 0.9, meshNormal.y);   // 1 where the mesh lies as the surface does
  vec2 slope = surfaceSlope;
#else
  vec2 slope = vec2(hr - hl, hu - hd) / (2.0 * uCell) * vMask + ambientSlopeAtFullGust(vWorld.xz) * gust;
  if (uRingCount > 0) slope += ringSlope(vWorld.xz, acrossX, acrossY);
  float slopeVariance = subGridSpread * subGridSpread + ambientUnresolvedVariance(vWorld.xz) * gust * gust;
  if (uRainOn > 0.5) {
    slope += rainSlope(vWorld.xz);
    slopeVariance += rainUnresolvedVariance(vWorld.xz);
  }
  if (uDropRingCount > 0) slope += dropRingSlope(vWorld.xz, acrossX, acrossY);
  float galeJacobian = 1.0;
  if (uGaleMetresPerUnit > 0.0) {
    slope += galeSlope(vRest, galeJacobian);
    slopeVariance += galeUnresolvedVariance(vRest);
  }
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
#endif
#ifdef CAVITY_MESH
  // The boil lies on and under the water's plane, as the foam does (below): none down the walls.
  boilSurface *= level;
  boilCloud *= level;
#endif
  // How the boil the surface holds changes over the water (per metre), from
  // its change across the pixel, taken here in uniform control flow:
  // freshBubbles decides each bubble by the boil at its centre.
  vec2 boilChange = vec2(dFdx(boilSurface), dFdy(boilSurface));
  float footprintArea = acrossX.x * acrossY.y - acrossX.y * acrossY.x;
  vec2 boilSlope = vec2(acrossY.y * boilChange.x - acrossX.y * boilChange.y, acrossX.x * boilChange.y - acrossY.x * boilChange.x)
    / (abs(footprintArea) > 1e-12 ? footprintArea : 1e-12);
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
#ifndef CAVITY_MESH
  // Still pool water keeps its tiles' detail as the ice does (poolDetail), while the lookup moves under a pixel.
  float shiftPixels = length(refractShift * uResolution);
  if (uPool.w > 0.0 && shiftPixels < 1.0) underColor *= mix(poolDetail(vWorld, acrossX, acrossY, underDistZ, surfaceDistZ), vec3(1.0), smoothstep(0.3, 1.0, shiftPixels));
#endif
  vec3 refracted = mix(uWaterColor, underColor, exp(-uExtinction * path2));
  // A splash's boil whitens the water under the surface with its cloud (freshBoilCloud), lit as the foam is.
  vec3 foamLight = uSunIrradiance * max(dot(n, uSunDir), 0.0) + uSkyAmbient * FOAM_SKY_LIGHT;
  if (boilCloud > 0.0) refracted = freshBoilCloud(refracted, boilCloud, foamLight, uAbsorb, vWorld.xz - uFoamDrift, uGustTime);

  // Reflection of the sky and the far shore (the dome's photograph) and the
  // beach: a planar mirror image, rendered at screen resolution. The still
  // mirror's own texel for this point (its place on the still plane through
  // the mirror camera) is right for anything, near or at infinity; the
  // ripples move the lookup from there by what they turn the reflected ray
  // by, as for a dome at infinity (the direction, w = 0, through the mirror
  // camera). A ripple tilting toward or away from the camera moves the image
  // up or down by twice its tilt; one tilting sideways turns it far less at
  // grazing angles, so reflections stretch into vertical streaks, as they do
  // on a lake. A ray turned below the horizon would meet the next ripple; it
  // takes the horizon's colour. While the mirror holds the splash, near
  // things are looked up where they are (nearReflection).
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
  vec4 stillRayCoord = uReflectionMatrix * vec4(-v.x, v.y, -v.z, 0.0);
  vec4 stillPointCoord = uReflectionMatrix * vec4(vWorld.x, uMirrorLevel, vWorld.z, 1.0);
  vec2 reflectUv = stillPointCoord.xy / max(stillPointCoord.w, 1e-4) + reflectCoord.xy / max(reflectCoord.w, 1e-4) - stillRayCoord.xy / max(stillRayCoord.w, 1e-4);
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
  // A splash's boil is not drawn as foam: its cloud is in refracted, its surface's bubbles below.
  vec2 foamKinds = splashFoam - vec2(splashBoil, 0.0);
  // The gale's whitecaps and the foam they leave, over all the water, the
  // raft gathered into the wind's streaks: sea foam's, churned by breaking,
  // packed and white whatever the water.
  if (uGaleMetresPerUnit > 0.0) {
    float raft = whitecaps.g * galeStreaks(vRest, acrossX, acrossY);
    foamKinds += vec2(max(whitecaps.r - whitecaps.g, 0.0) + raft, raft);
  }
  float foam = foamKinds.r;
#ifdef CAVITY_MESH
  foam *= level;   // the pattern lies on the water's plane: none down the walls
#endif
  vec2 foamChange = vec2(dFdx(foam), dFdy(foam));
  if (foam > FOAM_PRESENT) {
    float boilFraction = clamp(1.0 - foamKinds.g / max(foamKinds.r, 1e-5), 0.0, 1.0);
    FoamLook look = foamLook(vWorld.xz - uFoamDrift, acrossX, acrossY, foam, foamChange, n, boilFraction);
    vec3 foamColor = FOAM_ALBEDO * look.shade * foamLight;
    if (look.glint > 0.0) foamColor += look.glint * FOAM_GLINT * min(sunGlitter(look.domeNormal, v, uSunDir, uSunIrradiance, look.glintVariance), vec3(40.0));
    color = mix(color, foamColor, look.cover * look.opacity);
  }
  // The bubbles bursting on the surface over a splash's boil (freshBubbles), lit as the foam is, their caps glinting.
  if (boilSurface > FOAM_PRESENT) {
    FreshBubbles bubbles = freshBubbles(vWorld.xz - uFoamDrift, acrossX, acrossY, boilSurface / FOAM_BOIL_HOLD, boilSlope / FOAM_BOIL_HOLD, n, uGustTime);
    color = mix(color * (1.0 - bubbles.shadow), FOAM_ALBEDO * foamLight, bubbles.white);
    if (bubbles.glint > 0.0) color += bubbles.glint * FOAM_BUBBLE_GLINT * min(sunGlitter(bubbles.domeNormal, v, uSunDir, uSunIrradiance, bubbles.glintVariance), vec3(40.0));
  }

  if (iced > 0.0) color = mix(color, iceSurface(iceAt, iceFootprint, surfaceAcrossX, surfaceAcrossY), iced);
  color = withHaze(color, viewDist);
  gl_FragColor = vec4(min(color, vec3(1000.0)), 1.0);
}
`;

// The floor's pattern (src/pondFloor.js): sand of mixed grain and pebbles in
// patches, as an albedo at a world XZ point, over a square tile PATTERN_TILE
// metres on a side that repeats. Six value noises whose lattices wrap with
// the tile (tiledNoise: each frequency, per metre, is a whole number of
// cells across it), so the tile meets itself without a seam; so they are not
// evaluated per pixel: src/pondFloor.js bakes the tile once at start-up
// (FLOOR_BAKE_FRAGMENT) into a texture that FLOOR_FRAGMENT fetches. The silt
// that darkens the sand in broad drifts is the floor's own (FLOOR_FRAGMENT),
// with no period.
const FLOOR_PATTERN_TILE = /* glsl */`
#define PATTERN_TILE 2.0       // metres: the side of the baked tile
#define PATTERN_RANGE 0.43     // the tile holds albedo over this, above the pattern's largest (0.42), so its 8 bits span the pattern
`;
export const FLOOR_PATTERN = /* glsl */`
float tiledNoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(mod(i, period));
  float b = hash21(mod(i + vec2(1.0, 0.0), period));
  float c = hash21(mod(i + vec2(0.0, 1.0), period));
  float d = hash21(mod(i + vec2(1.0, 1.0), period));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float tiledNoise(vec2 p, float frequency, vec2 offset) { return tiledNoise(p * frequency + offset, frequency * PATTERN_TILE); }
vec3 floorPattern(vec2 p) {
  float grain = tiledNoise(p, 38.0, vec2(0.0)) * 0.45 + tiledNoise(p, 130.0, vec2(0.0)) * 0.25 + tiledNoise(p, 7.0, vec2(0.0)) * 0.5;
  vec3 sand = mix(vec3(0.26, 0.22, 0.15), vec3(0.42, 0.37, 0.27), grain);
  float pebble = smoothstep(0.62, 0.74, tiledNoise(p, 6.5, vec2(7.3)) * 0.7 + tiledNoise(p, 21.0, vec2(0.0)) * 0.3);
  vec3 pebbleColor = vec3(0.27, 0.26, 0.24) * (0.6 + 0.8 * tiledNoise(p, 70.0, vec2(0.0)));
  return mix(sand, pebbleColor, pebble * 0.8);
}
`;

// The lake bed's depth at a world XZ point, as floorDepthAt in
// src/pondFloor.js computes it (SHORE there): deeper the farther out from the
// waterline, levelling off; behind it negative, the land's height.
export const LAKE_BED = /* glsl */`
uniform vec4 uShore;   // the waterline's z, its bend (m), the bed's slope out from it and the depth it levels off at
uniform vec4 uLand;    // the beach's slope up from the water and the height it levels off at, the bank's height
uniform vec2 uBank;    // how far inland the bank starts and ends (m)
uniform float uKoiPond;   // 1: the Koi pond's shore in place of the lake's (below)
float koiShoreRadius(float angle);
float koiAngle(vec2 point);
float shoreDistance(vec2 point) {
  if (uKoiPond > 0.5) return koiShoreRadius(koiAngle(point)) - length(point - vec2(0.0, -1.2));
  return uShore.x + point.x * point.x / (2.0 * uShore.y) - point.y;
}
float landHeight(float inland) {
  return uLand.y * tanh(uLand.x * inland / uLand.y) + uLand.z * smoothstep(uBank.x, uBank.y, inland);
}
// The Koi pond's shore (uKoiPond 1): KOI_SHORE in src/pondFloor.js, its twin.
#define KOI_CENTRE vec2(0.0, -1.2)
#define KOI_BASE 4.0
#define KOI_BEACH vec2(0.15, 1.05)
#define KOI_SHELF 0.35
#define KOI_DEEP 1.35
#define KOI_LIP 0.08
#define KOI_BEACH_LIP 0.08
#define KOI_MOUND 0.3
float koiAngle(vec2 point) {
  vec2 offset = point - KOI_CENTRE;
  return atan(offset.y, offset.x);
}
float koiShoreRadius(float angle) {
  return KOI_BASE + 0.55 * cos(2.0 * angle - 0.5) + 0.4 * cos(3.0 * angle + 0.7 - 1.5707963) + 0.2 * cos(5.0 * angle + 1.9);
}
float koiBeach(float angle) {
  return smoothstep(KOI_BEACH.x, KOI_BEACH.x + 0.25, angle) * (1.0 - smoothstep(KOI_BEACH.y - 0.25, KOI_BEACH.y, angle));
}
float floorDepthAt(vec2 point) {
  float offshore = shoreDistance(point);
  if (uKoiPond > 0.5) {
    float beach = koiBeach(koiAngle(point));
    if (offshore >= 0.0) {
      float edged = KOI_SHELF * smoothstep(0.0, 0.25, offshore) + (KOI_DEEP - KOI_SHELF) * smoothstep(0.6, 2.0, offshore);
      return mix(edged, KOI_DEEP * smoothstep(0.0, 2.6, offshore), beach);
    }
    float inland = -offshore;
    return -(mix(KOI_LIP, KOI_BEACH_LIP, beach) * tanh(inland / (0.3 + 0.5 * beach)) + KOI_MOUND * smoothstep(2.0, 7.0, inland));
  }
  return offshore >= 0.0 ? uShore.w * tanh(uShore.z * offshore / uShore.w) : -landHeight(-offshore);
}
`;

// The sand at a world XZ point, over PATTERN_RANGE (the bed's and the
// beach's): the baked tile (FLOOR_PATTERN) looked up twice, the second time
// turned and shifted, patches of a few metres taking one lookup or the
// other, so the tile's repeat does not show; then the silt's broad drifts;
// in the place's own colour (uBedTint: the tile's sand greyed by its w and
// tinted by its rgb, the shore look's ground against Lakeside's sand:
// SHORE_LOOKS in src/pondFloor.js).
const FLOOR_SAND = /* glsl */`
uniform sampler2D uPattern;
uniform vec4 uBedTint;
#define PATTERN_TURN mat2(0.8, 0.6, -0.6, 0.8)   // the second lookup's tiles, turned 37° off the first's...
#define PATTERN_SHIFT vec2(0.37, 0.71)           // ...and shifted, in tiles
#define PATTERN_PATCHES 0.6                      // per metre: the noise choosing between the two lookups
#define SILT_FREQUENCY 0.9                       // per metre: the silt's drifts
vec3 floorSand(vec2 point) {
  vec2 tilePoint = point / PATTERN_TILE;
  vec3 straight = texture2D(uPattern, tilePoint).rgb;
  vec3 turned = texture2D(uPattern, PATTERN_TURN * tilePoint + PATTERN_SHIFT).rgb;
  float lookup = smoothstep(0.42, 0.58, valueNoise(point * PATTERN_PATCHES + 17.0));
  float silt = valueNoise(point * SILT_FREQUENCY + 3.0);
  vec3 sand = mix(straight, turned, lookup);
  sand = mix(sand, vec3(dot(sand, vec3(0.2126, 0.7152, 0.0722))), uBedTint.w) * uBedTint.rgb;
  return sand * (0.75 + 0.45 * silt);
}
`;

// The sunlight the rippled surface focuses onto a point under the water (the
// lake bed's caustics, FLOOR_FRAGMENT, and the pool's, POOL_FRAGMENT), with
// the solver's uniforms (uHeight, uDomainMin, uDomainSize, uTexelOffset, uN,
// uCell) declared before it. surfaceCurvature is the Laplacian of all three
// heights where the point's sunlight crossed the surface: the solver's,
// sampled three texels apart (the sun's width and the water blur fine
// detail; outside the splash's patch, mask 0, there is nothing to sample);
// the ambient ripples', a web of caustics drifting with them; and the
// rings' (src/rings.js), each averaged over the pixel's footprint where its
// sunlight crossed the surface, so a ring throws a ring of light; under the
// ice (ICE_COMMON) none of them, the frozen surface flat, but where the
// sunlight crossed a hole's water. Called in
// uniform control flow (it takes the crossing's screen derivatives).
// causticLight is the irradiance against the sun's own for a focus of
// 1 + focusing · depth · curvature (src/pondFloor.js): 1/focus for small
// slopes; where the rays come to a focus (focus near 0) a bright line, its
// peak set by the sun's disc and the pixel's footprint (CAUSTIC_BLUR), past
// it the crossed rays' 1/|focus|; eased into [CAUSTIC_DARKEST,
// CAUSTIC_BRIGHTEST] so a steep ring never blows the sand out.
const CAUSTICS = /* glsl */`
#define CAUSTIC_BLUR 0.2           // the irradiance's peak where rays focus on the floor: about 1/this
#define CAUSTIC_BRIGHTEST 2.6      // the sunlight on the sand is eased into this many times its own...
#define CAUSTIC_DARKEST 0.45       // ...and this
float surfaceCurvature(vec2 surfacePoint) {
  vec2 uv = (surfacePoint - uDomainMin) / uDomainSize + uTexelOffset;
  float mask = patchMask(uv);
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
  vec2 surfaceAcrossX = dFdx(surfacePoint);
  vec2 surfaceAcrossY = dFdy(surfacePoint);
  float curvature = laplacian * mask + ambientLaplacian(surfacePoint);
  if (uRingCount > 0) curvature += ringLaplacian(surfacePoint, surfaceAcrossX, surfaceAcrossY);
  // Under the ice (ICE_COMMON) the surface is flat: it focuses nothing; only a hole's water does.
  if (uIceOn > 0.5) curvature *= 1.0 - smoothstep(0.0, 0.02, iceMaskAt(surfacePoint).solid);
  return curvature;
}
float causticLight(float focus) {
  float irradiance = sqrt(1.0 + CAUSTIC_BLUR * CAUSTIC_BLUR) * inversesqrt(focus * focus + CAUSTIC_BLUR * CAUSTIC_BLUR);
  return irradiance > 1.0
    ? 1.0 + (CAUSTIC_BRIGHTEST - 1.0) * tanh((irradiance - 1.0) / (CAUSTIC_BRIGHTEST - 1.0))
    : 1.0 - (1.0 - CAUSTIC_DARKEST) * tanh((1.0 - irradiance) / (1.0 - CAUSTIC_DARKEST));
}
`;


// Seen from an eye under the water (the Under view, src/main.js): the water
// between a point and the eye dims its light by the extinction and fills in
// the water's own, as from above (WATER_FRAGMENT), but the water's own light
// is underwaterGlow: the deep colour seen from above (uWaterColor) times
// UNDER_GLOW_DOWN looking down, into the dark depths, to UNDER_GLOW_UP
// looking up, toward the lit water under the surface. That is the mean of
// what the sunlit water scatters toward the eye; on it lie the sun's shafts
// (underwaterShafts): the ripples focus the sunlight they let through into
// sheets and threads that run down through the water along the sun's
// refracted direction, as on the bed (FLOOR_FRAGMENT), so the light the water
// scatters toward the eye is brighter in them and dimmer between. Along the
// ray, at SHAFT_STEPS points out to SHAFT_REACH, the sunlight there is
// focused by the wind ripples' curvature where it crossed the surface (at a
// fixed mip level, so the loop needs no derivatives), its excess over the
// mean sunlight dimmed by the water on its way down and on to the eye, and
// scattered toward the eye by a forward-peaked phase function
// (Henyey–Greenstein, SHAFT_FORWARD): bright looking toward the sun, faint
// away from it. Under the ice (ICE_COMMON) the sunlight is not focused, and
// there are shafts only under its holes.
export const UNDER_FOG = /* glsl */`
uniform vec3 uExtinction;
uniform vec3 uWaterColor;
#define UNDER_GLOW_DOWN 0.9
#define UNDER_GLOW_UP 5.0
#define SHAFT_STEPS 12
#define SHAFT_REACH 8.0        // metres along the ray
#define SHAFT_LEVEL 0.0        // the ripples' mip level the shafts are read at
#define SHAFT_BLUR 0.35        // as CAUSTIC_BLUR on the floor
#define SHAFT_SCATTER 0.5      // the share of the extinction that is scattering (about half, in clear lake water)
#define SHAFT_FORWARD 0.75     // the phase function's g
vec3 underwaterGlow(vec3 direction) {
  return uWaterColor * mix(UNDER_GLOW_DOWN, UNDER_GLOW_UP, smoothstep(-0.5, 0.9, direction.y));
}
vec3 underwaterShafts(vec3 origin, vec3 direction, float distance) {
  float sunSine = length(uSunDir.xz);
  float refractedSine = sunSine / 1.333;
  float refractedCosine = sqrt(1.0 - refractedSine * refractedSine);
  vec3 toSun = vec3(uSunDir.xz / max(sunSine, 1e-5) * refractedSine, refractedCosine).xzy;
  float focusing = (1.0 - max(uSunDir.y, 0.0) / (1.333 * refractedCosine)) * 0.5 * (1.0 + 1.0 / (refractedCosine * refractedCosine));
  float reach = min(distance, SHAFT_REACH);
  float stepLength = reach / float(SHAFT_STEPS);
  vec3 sum = vec3(0.0);
  for (int index = 0; index < SHAFT_STEPS; index++) {
    float along = (float(index) + 0.5) * stepLength;
    vec3 point = origin + direction * along;
    float depth = max(-point.y, 0.0);
    vec2 crossing = point.xz + toSun.xz / toSun.y * depth;
    float curvature = texture2DLodEXT(uAmbientHeight, crossing / uAmbientTileSize, SHAFT_LEVEL).a * uAmbientMetresPerUnit * gustEnvelope(crossing, uGustTime);
    if (uIceOn > 0.5) curvature *= 1.0 - smoothstep(0.0, 0.02, iceMaskAt(crossing).solid);   // under the ice, flat: no shafts

    float focus = 1.0 + focusing * depth * curvature;
    float irradiance = sqrt(1.0 + SHAFT_BLUR * SHAFT_BLUR) * inversesqrt(focus * focus + SHAFT_BLUR * SHAFT_BLUR);
    sum += (min(irradiance, 3.0) - 1.0) * exp(-uExtinction * (along + depth / refractedCosine));
  }
  float cosine = dot(direction, toSun);
  float phase = (1.0 - SHAFT_FORWARD * SHAFT_FORWARD) / pow(1.0 + SHAFT_FORWARD * SHAFT_FORWARD - 2.0 * SHAFT_FORWARD * cosine, 1.5) / (4.0 * 3.14159265);
  return uSunIrradiance * SHAFT_SCATTER * uExtinction * phase * sum * stepLength;
}
vec3 throughWater(vec3 color, vec3 point) {
  vec3 ray = point - cameraPosition;
  float distance = max(length(ray), 1e-4);
  vec3 direction = ray / distance;
  return mix(underwaterGlow(direction), color, exp(-uExtinction * distance)) + underwaterShafts(cameraPosition, direction, distance);
}
`;

// Behind everything seen from under the water (the first thing drawn in the
// Under view, src/main.js): the water's own light along each pixel's ray,
// with the sun's shafts out to their reach (UNDER_FOG), so where nothing
// stands in the way the water carries on with no edge.
export const UNDER_BACKGROUND_FRAGMENT = /* glsl */`
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
varying vec2 vUv;
${GLSL_COMMON}
${UNDER_FOG}
void main() {
  vec4 view = uInverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 direction = normalize((uCameraWorld * vec4(view.xyz / view.w, 0.0)).xyz);
  gl_FragColor = vec4(underwaterGlow(direction) + underwaterShafts(uEye, direction, SHAFT_REACH), 1.0);
}
`;

// The water surface (and a stone's cavity, CAVITY_MESH) seen from under the
// water, with WATER_VERTEX. The eye's ray reaches the surface from below and
// leaves into the air only within the critical angle of its normal (48.6°
// for water: Snell's law, refract), so the sky shows in a bright window
// overhead, squeezed toward its edge, and the ripples, rings and splash
// bend it; there the sky comes from the cube the droplets reflect
// (uSkyCube), with the sun's disc, and the water's Fresnel reflection of
// what lies below. Past the critical angle the surface is a mirror (total
// internal reflection) of what lies under it: the bed where the reflected
// ray meets it (marched in BED_STEPS out to BED_REACH, then halved twice),
// its sand lit as FLOOR_FRAGMENT lights it (without the caustics) and seen
// through the water on the way, or the water's own light (underwaterGlow)
// where it meets none. In a pool (uPool's depth not zero, src/pool.js) the
// ray meets the basin, found exactly: its floor or the first wall in its
// way, tiled (POOL_TILES) and averaged over a footprint that grows with the
// way to it. Foam floating on it shows lit from above. A cavity's
// normal points into its air as the surface's does, so a hole is shaded the
// same way: a wall mostly mirrors (silvery where it turns the ray up toward
// the bright water under the surface), and where the ray passes into its
// air it sees the sky down the mouth, dimmer the deeper the hole. Then the
// water between it and the eye (UNDER_FOG).
export const WATER_UNDER_FRAGMENT = /* glsl */`
uniform sampler2D uHeight;
uniform sampler2D uFoam;
uniform samplerCube uSkyCube;
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform float uN;
uniform float uCell;
uniform vec3 uAbsorb;
varying vec3 vWorld;
varying vec2 vDomainUv;
varying float vMask;
varying float vViewZ;
varying vec2 vRest;            // where the point lies on still water (WATER_VERTEX)
#ifdef CAVITY_MESH
varying vec3 vNormalWorld;
varying vec3 vCavity;       // rides the surface, open to the sky, climb to escape (WATER_VERTEX)
#endif
${GLSL_COMMON}
${UNDER_FOG}
${LAKE_BED}
${FLOOR_PATTERN_TILE}
${FLOOR_SAND}
${RAIN_RIPPLES}
${DROP_RING_SLOPES}
${POOL_TILES}
#define BED_STEPS 16
#define BED_REACH 6.0        // metres along the mirrored ray
#define WATER_INDEX 1.333
#define SUN_DISC 3000.0      // the sun through the window: a lobe this sharp...
#define SUN_DISC_GAIN 6.0    // ...this bright against the sun's irradiance
#define FOAM_SEEN 0.6        // floating foam's light seen from below, against the sun's and sky's on it
#define TILE_BLUR 0.004      // the pool's tiles' footprint per metre of the way to them (radians), over...
#define TILE_BLUR_LEAST 0.01 // ...this much (m)
void main() {
  float texelStep = 1.0 / uN;
  float hl = texture2D(uHeight, vDomainUv - vec2(texelStep, 0.0)).r;
  float hr = texture2D(uHeight, vDomainUv + vec2(texelStep, 0.0)).r;
  float hd = texture2D(uHeight, vDomainUv - vec2(0.0, texelStep)).r;
  float hu = texture2D(uHeight, vDomainUv + vec2(0.0, texelStep)).r;
  vec2 acrossX = dFdx(vWorld.xz);
  vec2 acrossY = dFdy(vWorld.xz);
  float gust = gustEnvelope(vWorld.xz, uGustTime);
  vec2 slope = vec2(hr - hl, hu - hd) / (2.0 * uCell) * vMask + ambientSlopeAtFullGust(vWorld.xz) * gust;
  if (uRingCount > 0) slope += ringSlope(vWorld.xz, acrossX, acrossY);
  if (uRainOn > 0.5) slope += rainSlope(vWorld.xz);
  if (uDropRingCount > 0) slope += dropRingSlope(vWorld.xz, acrossX, acrossY);
  if (uGaleMetresPerUnit > 0.0) {
    float galeJacobian;
    slope += galeSlope(vRest, galeJacobian);
  }
  // Under the ice (ICE_COMMON) the surface is still: its window shows the sky unrippled (its underside below).
  float iceFootprint = max(length(acrossX), length(acrossY));
  float iced = 0.0;
  IceMask iceAt;
#ifndef CAVITY_MESH
  if (uIceOn > 0.5) {
    iceAt = iceMaskAt(vWorld.xz);
    iced = iceCover(iceAt.solid, iceFootprint);
    slope *= 1.0 - iced;
  }
#endif
#ifdef CAVITY_MESH
  vec3 n = normalize(vNormalWorld);
#else
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
#endif
  vec3 ray = vWorld - cameraPosition;
  ray /= max(length(ray), 1e-4);
  // The normal against the ray, for refract and reflect (from the water's side).
  vec3 against = dot(ray, n) > 0.0 ? -n : n;
  vec3 mirrored = reflect(ray, against);
  vec3 color = underwaterGlow(mirrored);
  if (mirrored.y < -0.01 && uPool.w > 0.0) {
    vec3 normal;
    float along = toBasin(vWorld, mirrored, normal);
    vec3 bed = vWorld + mirrored * along;
    float depth = max(-bed.y, 0.0);
    vec3 light = uSunIrradiance * exp(-uAbsorb * depth / max(uSunDir.y, 0.2)) * max(uSunDir.y, 0.0) + uSkyAmbient * exp(-uAbsorb * depth) * 1.4;
    light *= 0.75 + 0.25 * normal.y;   // a wall sees half the sky, and the sun aslant
    vec3 tiles = poolTileColor(bed, normal, vec2(TILE_BLUR_LEAST + TILE_BLUR * along) / POOL_TILE);
    color = mix(color, tiles * light, exp(-uExtinction * along));
  } else if (mirrored.y < -0.01) {
    // The bed the mirrored ray meets: the first step under it, then two halvings.
    float stepLength = BED_REACH / float(BED_STEPS);
    float along = 0.0;
    bool met = false;
    for (int index = 1; index <= BED_STEPS; index++) {
      along = float(index) * stepLength;
      vec3 point = vWorld + mirrored * along;
      if (-point.y >= floorDepthAt(point.xz)) { met = true; break; }
    }
    if (met) {
      for (int halving = 0; halving < 2; halving++) {
        stepLength *= 0.5;
        vec3 point = vWorld + mirrored * (along - stepLength);
        if (-point.y >= floorDepthAt(point.xz)) along -= stepLength;
      }
      vec3 bed = vWorld + mirrored * along;
      float depth = max(-bed.y, 0.0);
      vec3 light = uSunIrradiance * exp(-uAbsorb * depth / max(uSunDir.y, 0.2)) * max(uSunDir.y, 0.0) + uSkyAmbient * exp(-uAbsorb * depth) * 1.4;
      color = mix(color, floorSand(bed.xz) * PATTERN_RANGE * light, exp(-uExtinction * along));
    }
  }
  vec3 outward = refract(ray, against, WATER_INDEX);
  if (dot(outward, outward) > 0.5) {
    float fresnel = 0.02 + 0.98 * pow(1.0 - abs(dot(outward, n)), 5.0);
    vec3 sky = textureCube(uSkyCube, outward).rgb + uSunIrradiance * SUN_DISC_GAIN * pow(max(dot(outward, uSunDir), 0.0), SUN_DISC);
#ifdef CAVITY_MESH
    sky *= mix(0.15, 1.0, vCavity.y);
#endif
    color = mix(sky, color, fresnel);
  }
  float foam = texture2D(uFoam, vDomainUv).r * vMask * (1.0 - iced);
  color = mix(color, (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient) * FOAM_SEEN, smoothstep(0.05, 0.6, foam) * 0.8);
  // The ice's underside: clear ice lets the window's sky through as still water does; snow ice, frost and bubbles glow
  // with the light they scatter down through the sheet; in a hole's new ice (clear: no snow ice) its old edge shows, a
  // faint seam. Its cracks are drawn over it, dark (src/iceCracks.js).
  if (iced > 0.0) {
    IceLook look = iceLook(vWorld.xz, iceFootprint);
    float newIce = smoothstep(-0.5 * iceFootprint, 0.5 * iceFootprint, iceAt.skin) * (1.0 - smoothstep(-0.5 * iceFootprint, 0.5 * iceFootprint, iceAt.hole));
    float white = clamp(look.white + look.bubbles, 0.0, 1.0) * (1.0 - newIce);
    float seam = smoothstep(0.0, 0.004, iceAt.skin) * iceLine(iceAt.hole, 0.0007, iceFootprint);
    vec3 glow = (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient) * ICE_UNDER_GLOW;
    vec3 ceiling = mix(color, glow, 0.85 * white) * (1.0 - 0.3 * seam);
    // Snow on it (SNOW_COVER, iceSurface) shuts the window: only the light it lets through glows.
    float snow = snowOnIce(vWorld.xz, iceFootprint) * (1.0 - newIce) * (1.0 - max(uIceWet, iceAt.wet));
    ceiling = mix(ceiling, glow * ICE_SNOW_GLOW, snow);
    color = mix(color, ceiling, iced);
  }
  gl_FragColor = vec4(min(throughWater(color, vWorld), vec3(1000.0)), 1.0);
}
`;

// The ice's cracks (src/iceCracks.js): each a ribbon along its points on the
// sheet's top (from under the water, just under it), as wide as the crack's
// line, the fracture face beside it as seen through the ice and a pixel and
// a half more, so the fragment shader antialiases it. aLine is the point
// (x, z) and the normal there (the miter of its two segments); aShape the
// side (−1, +1), the line's half-width there (m), the miter's stretch and
// the crack's shade. The face (a crack's plane, down through the sheet) is
// seen on the side the eye is on, as wide as the sheet's thickness along
// the refracted ray, times the view's share across the crack (as a hole's
// edge: fractureFace in ICE_COMMON). A pixel's width across the line comes
// from where the line and a millimetre off it land on the screen.
export const ICE_CRACK_VERTEX = /* glsl */`
${ICE_UNIFORMS}
attribute vec4 aLine;
attribute vec4 aShape;
attribute float aTime;
uniform vec2 uResolution;
varying float vTime;        // s: when the crack reached here (src/iceCracks.js)
varying vec2 vWorldXZ;
varying float vAcross;      // m off the line, by its side
varying float vHalfWidth;   // m
varying float vShade;
varying float vFace;        // m: the face's width as seen, on the eye's side
varying float vNearSide;    // the eye's side (−1, +1)
varying float vBelow;       // 1 seen from under the water
void main() {
  vec2 point = aLine.xy, normal = aLine.zw;
  float below = cameraPosition.y < uIceTop ? 1.0 : 0.0;
  vec3 centre = vec3(point.x, uIceTop + (below > 0.5 ? -0.0006 : 0.0004), point.y);
  vec3 toCamera = cameraPosition - centre;
  float level = length(toCamera.xz);
  float sineInside = clamp(level / max(length(toCamera), 1e-6) / ICE_INDEX, 0.0, 0.99);
  float facing = level > 1e-6 ? dot(normal, toCamera.xz / level) : 0.0;
  vNearSide = facing >= 0.0 ? 1.0 : -1.0;
  vFace = below > 0.5 ? 0.0 : uIceThickness * sineInside / sqrt(1.0 - sineInside * sineInside) * abs(facing);
  vec4 clipCentre = projectionMatrix * viewMatrix * vec4(centre, 1.0);
  vec4 clipOff = projectionMatrix * viewMatrix * vec4(centre + vec3(normal.x, 0.0, normal.y) * 0.001, 1.0);
  float pixels = length((clipOff.xy / max(clipOff.w, 1e-4) - clipCentre.xy / max(clipCentre.w, 1e-4)) * 0.5 * uResolution);
  float pixel = min(0.001 / max(pixels, 1e-4), 0.02);
  float side = aShape.x;
  float extent = aShape.y + ICE_CRACK_JAG + 1.5 * pixel + (side * vNearSide > 0.0 ? vFace : 0.0);
  vec3 world = centre + vec3(normal.x, 0.0, normal.y) * side * extent * aShape.z;
  vAcross = side * extent;
  vHalfWidth = aShape.y;
  vShade = aShape.w;
  vTime = aTime;
  vBelow = below;
  vWorldXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

// A crack's colour and cover at a pixel (ICE_CRACK_VERTEX): its line, a box
// filter of its width over the pixel, roughened finer than its points
// (ICE_CRACK_JAG, near the eye); its face on the eye's side, from the line,
// fading down it. Over clear ice both show white, the light the broken
// faces send back; over snow ice the line is dark (water seeps up it) and
// the face unseen; wet, both fainter. None over a hole's water or its new
// ice (the mask). From under the water a crack is a dark line across the
// light the sheet lets down, dimmed by the water between. None yet where the
// crack has not run to (src/ice.js `times`, by uIceClock), its running tip
// fading in over CRACK_TIP.
export const ICE_CRACK_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uExtinction;
uniform float uIceClock;
varying float vTime;
varying vec2 vWorldXZ;
varying float vAcross;
varying float vHalfWidth;
varying float vShade;
varying float vFace;
varying float vNearSide;
varying float vBelow;
${GLSL_COMMON}
${HAZE}
#define CRACK_SNOWED 0.85   // the share of a crack the snow on the ice hides
#define CRACK_TIP 0.004     // s: a crack's running tip fades in over this (a few millimetres behind it)
void main() {
  // Its footprint before any discard: a 2×2 block part discarded leaves derivatives undefined on some GPUs.
  float footprint = max(fwidth(vAcross), 1e-6);
  // Not reached yet (src/ice.js times): it runs out from where it started.
  if (vTime > uIceClock) discard;
  IceMask mask = iceMaskAt(vWorldXZ);
  if (mask.hole < 0.0) discard;
  float jag = ICE_CRACK_JAG * (valueNoise(vWorldXZ * 330.0) + 0.6 * valueNoise(vWorldXZ * 910.0 + 5.0) - 0.8) * (1.0 - smoothstep(0.0008, 0.003, footprint));
  float across = vAcross + jag;
  float line = iceLine(across, vHalfWidth, footprint) * clamp((uIceClock - vTime) / CRACK_TIP, 0.0, 1.0);
  if (vBelow > 0.5) {
    float seen = exp(-dot(uExtinction, vec3(1.0 / 3.0)) * distance(cameraPosition, vec3(vWorldXZ.x, uIceTop, vWorldXZ.y)));
    gl_FragColor = vec4(vec3(0.0), 0.5 * line * vShade * seen);
    return;
  }
  float onNear = across * vNearSide - vHalfWidth;
  float depthShare = clamp(onNear / max(vFace, 1e-6), 0.0, 1.0);
  float face = vFace > 1e-5 ? smoothstep(-0.5 * footprint, 0.5 * footprint, onNear) * (1.0 - depthShare) * (1.0 - depthShare) * min(vFace / footprint, 1.0) : 0.0;
  IceLook look = iceLook(vWorldXZ, footprint);
  float wet = max(uIceWet, mask.wet);
  vec3 scattered = ICE_WHITE_ALBEDO * (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * ICE_SKY_LIGHT) * mix(1.0, 0.6, wet);
  float along = 0.6 + 0.4 * valueNoise(vWorldXZ * 22.0);   // brighter and dimmer along it, as it opened more or less
  float lineCover = line * vShade * along * mix(1.0, 0.5, wet);
  float faceCover = face * vShade * 0.7 * (1.0 - look.white) * mix(1.0, 0.5, wet) * (1.0 - lineCover);
  vec3 lineColor = mix(scattered * 1.35, scattered * 0.2, look.white);
  // Snow lying on the ice (SNOW_COVER) hides its cracks but for a faint line where the snow parted.
  float cover = (lineCover + faceCover) * (1.0 - CRACK_SNOWED * snowOnIce(vWorldXZ, footprint) * (1.0 - wet));
  if (cover < 1e-4) discard;
  vec3 crackColor = (lineColor * lineCover + scattered * 1.1 * faceCover) / (lineCover + faceCover);
  gl_FragColor = vec4(min(withHaze(crackColor, distance(cameraPosition, vec3(vWorldXZ.x, uIceTop, vWorldXZ.y))), vec3(1000.0)), cover);
}
`;

// One pass over the pattern's tile: texel (u, v) holds the pattern at the
// floor point PATTERN_TILE · (u, v), and the floor at world point p fetches
// it at p / PATTERN_TILE, the texture repeating.
export const FLOOR_BAKE_FRAGMENT = /* glsl */`
${FLOOR_PATTERN_TILE}
varying vec2 vUv;
${GLSL_COMMON}
${FLOOR_PATTERN}
void main() {
  gl_FragColor = vec4(floorPattern(vUv * PATTERN_TILE) / PATTERN_RANGE, 1.0);
}
`;

// What the floor's pixels need that is the same everywhere, or smooth over
// the bed, is worked out here, per vertex of the bed's mesh: how far up-sun
// of a floor point its sunlight crossed the surface (the sun refracted into
// the water, tan θt per metre of depth, sin θt = sin θi / n: flat), the
// floor point's world XZ (affine in the world position, so it interpolates
// exactly), its depth, and the sun's and the sky's light reaching it through
// that depth.
export const FLOOR_VERTEX = /* glsl */`
#define WATER_INDEX 1.333
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uAbsorb;
${LAKE_BED}
${FLOOR_PATTERN_TILE}
varying vec2 vFloorPoint;
varying float vDepth;
flat varying vec2 vUpSun;
flat varying float vFocusing;
varying vec3 vSunlight;
varying vec3 vSkylight;
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  // Behind the waterline the bed is the beach, above the water (the main
  // scene draws it: createShore in src/pondFloor.js); here it is lit as the
  // water's edge.
  float bedDepth = floorDepthAt(world.xz);
  world.y = -bedDepth;
  float depth = max(bedDepth, 0.0);
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
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uN;
uniform float uCell;
varying vec2 vFloorPoint;
varying float vDepth;
flat varying vec2 vUpSun;
flat varying float vFocusing;
varying vec3 vSunlight;
varying vec3 vSkylight;
${GLSL_COMMON}
${FLOOR_PATTERN_TILE}
${UNDER_FOG}
#define WATER_INDEX 1.333
${CAUSTICS}
${FLOOR_SAND}

uniform float uKoiPond;   // 1: the Koi pond's bed (below)
#define KOI_BED vec3(0.46, 0.45, 0.38)   // the Koi pond's bed against the lake's sand: grey gravel, silt and a film of algae
void main() {
  // Sand with pebbles and silt (FLOOR_SAND); the Koi pond's, darker gravel under silt and algae, in drifts.
  vec3 sand = floorSand(vFloorPoint);
  if (uKoiPond > 0.5) sand *= KOI_BED * (0.7 + 0.5 * valueNoise(vFloorPoint * 0.7 + 11.0));

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
  // From an eye under the water the floor is seen where it is.
  if (cameraPosition.y < 0.0) seenPoint = vFloorPoint;
  vec2 surfacePoint = seenPoint + vUpSun * vDepth;
  float caustic = causticLight(1.0 + vFocusing * vDepth * surfaceCurvature(surfacePoint));

  vec3 color = sand * (vSunlight * caustic + vSkylight);
  if (cameraPosition.y < 0.0) color = throughWater(color, vec3(vFloorPoint.x, -vDepth, vFloorPoint.y));
  gl_FragColor = vec4(color, 1.0);
}
`;

// The land the sky photo shows at the horizon toward a horizontal direction
// (photoLand), for the ground near the pond, which takes its colour, and
// beyond LAND_NEAR, where the ground runs into it: the sky's cube map (the
// one the droplets reflect, src/sky.js), a little above the horizon, at
// LAND_LEVEL of its mip chain and averaged either side, so the photo's
// detail does not streak toward the eye. (Under the horizon a photo shows
// whatever stood at the photographer's feet, often water.) Or from another
// cube, at another level: the beach's grass reads the land as it is before
// the haze (src/sky.js landCube), since it stands too near to be lost in it.
const PHOTO_LAND = /* glsl */`
uniform samplerCube uSkyCube;   // the sky, as the droplets reflect it (src/sky.js)
#define LAND_NEAR 8.0        // metres away: the land becomes the photo's from here...
#define LAND_FAR 60.0        // ...to here
#define LAND_HEIGHTS vec2(0.018, 0.04)  // the photo's land is read this high above the horizon (direction's y)...
#define LAND_SPAN 0.05                  // ...and this far to either side (direction's sideways share)...
#define LAND_LEVEL 3.0                  // ...at this level of the cube's mip chain (512 a face: 1.4° a texel)
vec3 photoLand(samplerCube cube, float level, vec2 toward) {
  vec2 across = normalize(toward);
  vec2 side = vec2(-across.y, across.x) * LAND_SPAN;
  vec3 sum = vec3(0.0);
  for (int tap = -1; tap <= 1; tap++) {
    vec2 turned = normalize(across + side * float(tap));
    sum += textureCubeLodEXT(cube, vec3(turned.x, LAND_HEIGHTS.x, turned.y), level).rgb;
    sum += textureCubeLodEXT(cube, vec3(turned.x, LAND_HEIGHTS.y, turned.y), level).rgb;
  }
  return sum / 6.0;
}
`;

// The beach behind the waterline (createShore in src/pondFloor.js): the
// lake bed's surface where it stands out of the water (LAKE_BED), and a
// strip of it under the water's edge, which the water covers. Its normal
// comes from the height a little to either side.
export const LAND_VERTEX = /* glsl */`
${LAKE_BED}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vInland;     // metres behind the waterline
#define NORMAL_STEP 0.05   // metres
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vInland = -shoreDistance(world.xz);
  float height = -floorDepthAt(world.xz);
  float aheadX = -floorDepthAt(world.xz + vec2(NORMAL_STEP, 0.0));
  float aheadZ = -floorDepthAt(world.xz + vec2(0.0, NORMAL_STEP));
  vNormal = normalize(vec3(height - aheadX, NORMAL_STEP, height - aheadZ));
  world.y = height;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

// The land: the beach's sand (FLOOR_SAND, as the bed's) in the sun and the
// sky's light (as the bed's, without the water, DRY_SAND of it), darker where
// it is wet, up to WET_HEIGHT above the water; from GRASS_FROM to GRASS_TO
// inland (times the look's `grass`, below) it turns to the bank's grass: the
// land the sky photo shows, under the same light, mottled. From
// LAND_NEAR to LAND_FAR away all of it becomes the colour of the land the
// sky photo shows at the horizon that way (photoLand: the sky's cube map, a
// little above the horizon, at LAND_LEVEL of its mip chain and averaged
// either side, so the photo's detail does not streak toward the eye; under
// the horizon a photo shows whatever stood at the photographer's feet, often
// water), mottled and shaded by the bank's slope against level ground, and
// never brighter than ground of GRASS_ALBEDO_MOST (where the photo shows sky
// at the horizon, under cloud a white one). From LAND_NEAR to
// LAND_FAR away all of it becomes that colour, so the land runs into the
// photo's own. Seen in the mirror the directions are the mirror camera's,
// so its reflection does too. Under snow (SNOW_COVER) the sand and the grass
// lie under it, but for the wet sand by the water, where it melts (up to
// SNOW_MELT_HEIGHT), and the far land takes SNOW_FAR of it: the photo's
// trees and far water stand out of any snow. In haze (HAZE: rain's, snow's,
// a fog's) the grass takes the land before the haze (photoLand), and the
// beach fades by its distance, as the water does, but for the far land, the
// photo's own, hazed as the dome is.
//
// What a beach shows between its grains and its slope. The sand's tile is
// 2 mm a texel, and the silt's drifts a metre across, so from a few metres
// off the beach was a smooth wash with soft blots on it: nothing between
// 2 mm and a metre, where a real shore keeps most of what the eye reads.
// Three layers of that scale, each evaluated once a pixel from the world
// position and faded out where a pixel's footprint on the ground (fwidth)
// nears its cell (layerWeight), so none shimmers far off or in the mirror.
// How much of each a place's shore has is its look's (SHORE_LOOKS in
// src/pondFloor.js, uShoreLook and uShoreMore: the pebbles' share near the
// water and their size, the tufts' share, the wrack line's strength, how
// soon the grass comes, and the cracks of a dried flat), so a sea cove is
// shingle, a desert shore bare gravel, a salt flat cracked and empty:
// - Relief. Low hummocks (RELIEF_FREQUENCIES, RELIEF_HEIGHTS: 6 cm over
//   1.8 m, 1.4 cm over half a metre, value noise with its gradient) tilt
//   the normal the sun lights, so the beach has form, strongest under a low
//   sun. The relief shades only: the mesh's height is the bed's (LAKE_BED),
//   where the rocks come to rest.
// - Debris. The last high water's wrack line (WRACK_INLAND, wandering along
//   the shore by WRACK_WANDER), a darker band with sticks and weed along it
//   (STICK_CELL cells, each holding one with STICK_SHARE's chance at the
//   line, less either side), and pebbles and shells (PEBBLE_CELL cells,
//   PEBBLE_SHORE of them within PEBBLE_REACH of the waterline, where the
//   water sorts them out, PEBBLE_INLAND beyond), in the sand's colour,
//   darker or greyer. Each is one thing in its cell, placed, sized and
//   coloured by the cell's hashes, kept inside the cell so one lookup finds
//   it, antialiased over the pixel's footprint.
// - Tufts. The grass comes in as clumps before it is a sward: TUFT_CELL
//   cells hold one each, anywhere in the cell (the four cells about a point
//   are looked up, so no grid shows), with a chance rising from GRASS_FROM
//   to TUFT_SHARE at GRASS_TO and gathered into patches by TUFT_PATCHES,
//   ragged-edged, the ground's colour tinted TUFT_TINT, TUFT_LIT on the
//   side toward the sun and TUFT_SIDE darker away from it, so they stand up
//   from the ground rather than lie on it. The sward between them is the
//   ground's colour mottled over a metre and grained at SWARD_GRAIN, blades
//   and clumps, each octave faded where the pixel outgrows it.
export const LAND_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform samplerCube uLandCube;   // the land before the haze, for the grass (src/sky.js landCube)...
uniform float uLandLevel;        // ...at this level of its mip chain
uniform vec4 uShoreLook;         // the place's shore (SHORE_LOOKS): the pebbles' share near the water, their size (times PEBBLE_RADII), the tufts' share (times TUFT_SHARE), the wrack's strength
uniform vec2 uShoreMore;         // ...and how far inland the grass comes (times GRASS_FROM and GRASS_TO), the cracks of a dried flat (0 to 1)
varying vec3 vWorld;
varying vec3 vNormal;
varying float vInland;
${GLSL_COMMON}
${FLOOR_PATTERN_TILE}
${FLOOR_SAND}
${PHOTO_LAND}
${HAZE}
${LAKE_BED}
#define SKY_LIGHT 1.4        // the sky's light on the sand, as the bed's
// The Koi pond's ground (uKoiPond): at the water a band of river stones, wide along its pebble beach (koiBeach) and
// narrow under its stone edge, dark where wet; then a garden's moss, mottled, with the bare earth showing through;
// from KOI_MOSS_TO inland the bank's grass as the lake's.
#define KOI_STONES vec2(0.25, 1.3)        // metres inland the stones reach: under the edge, along the beach
#define KOI_STONE_TINT vec3(0.62, 0.6, 0.56)
#define KOI_MOSS vec3(0.075, 0.105, 0.04)
#define KOI_EARTH vec3(0.12, 0.1, 0.075)
#define KOI_MOSS_TO vec2(3.0, 5.0)
#define KOI_LAWN vec3(0.07, 0.115, 0.04)  // the garden's lawn beyond the moss
#define KOI_SHADE 0.3                    // the garden's ground behind its planting, under its trees, against its lawn
#define KOI_COBBLE 0.16                   // m: a cobble's cell at the stone edge
// The cobbles set along the edge: the nearest jittered point and the next (as the pool's, in cells of KOI_COBBLE), so
// each is its own rounded stone with dark gaps: (its distance from its middle in cells, its hash, the gap's distance).
vec3 koiCobble(vec2 point) {
  vec2 cell = floor(point);
  float nearest = 8.0, next = 8.0, which = 0.0;
  for (int row = -1; row <= 1; row++) {
    for (int column = -1; column <= 1; column++) {
      vec2 other = cell + vec2(float(column), float(row));
      vec2 centre = other + 0.15 + 0.7 * vec2(hash21(other), hash21(other + 19.7));
      float apart = length(point - centre);
      if (apart < nearest) { next = nearest; nearest = apart; which = hash21(other + 3.1); }
      else if (apart < next) next = apart;
    }
  }
  return vec3(nearest, which, 0.5 * (next - nearest));
}
#define DRY_SAND vec3(0.68, 0.6, 0.5)   // the beach's dry sand, against the bed's: darker and warmer, as the photos' banks are
#define WET_HEIGHT 0.12      // metres above the water the sand is wet to...
#define WET_SHADE 0.6        // ...and as dark as this at the water
#define GRASS_FROM 2.5       // metres inland: the sand turns to grass from here...
#define GRASS_TO 4.5         // ...to here
#define SNOW_MELT_HEIGHT 0.04  // metres above the water the snow melts on the wet sand to (half a metre up the beach)
#define SNOW_FAR 0.5         // the far land's share under the snow
#define GRASS_ALBEDO_MOST 0.3  // the brightest the bank's grass is drawn, as an albedo (fresh grass about 0.25)
#define LUMINANCE vec3(0.2126, 0.7152, 0.0722)
#define RELIEF_FREQUENCIES vec2(0.55, 1.9)   // per metre: the hummocks and the bumps on them...
#define RELIEF_HEIGHTS vec2(0.06, 0.014)     // ...metres high
#define WRACK_INLAND 0.55    // metres inland: the wrack line...
#define WRACK_WANDER 0.3     // ...wandering this far either way...
#define WRACK_WAVELENGTH 0.3 // ...per metre along the shore
#define WRACK_WIDTH 0.12     // metres: its dark band's half width...
#define WRACK_SHADE 0.82     // ...and how dark
#define PEBBLE_CELL 0.1      // metres: a cell with one pebble or shell at most
#define PEBBLE_RADII vec2(0.006, 0.022)   // metres
#define PEBBLE_SHORE 0.3     // the share of cells with one within PEBBLE_REACH of the waterline (Lakeside's; a look's uShoreLook.x)...
#define PEBBLE_INLAND 0.05   // ...and beyond (its share of the shore's)
#define CRACK_CELL 0.22      // metres: a dried flat's plates (koiCobble's cells)...
#define CRACK_WIDTH 0.035    // ...and their cracks' width, in cells
#define CRACK_SHADE 0.7      // how dark a crack is
#define PEBBLE_SHADE 0.5     // a pebble's rim toward the sun is this much brighter than the rim away from it: a dome
#define PEBBLE_REACH 1.0     // metres
#define STICK_CELL 0.5       // metres: a cell with one stick or strand of weed at most
#define STICK_SHARE 0.35     // the share of cells with one at the wrack line...
#define STICK_SPREAD 0.6     // ...falling off over this many metres either side
#define STICK_LENGTH vec2(0.08, 0.2)   // metres, whole
#define STICK_WIDTH 0.012    // metres, whole
#define TUFT_CELL 0.45       // metres: a cell with one tuft at most
#define TUFT_RADII vec2(0.06, 0.16)    // metres
#define TUFT_SHARE 0.8       // the share of cells with one at GRASS_TO and beyond, in the thickest patches...
#define TUFT_PATCHES 0.35    // ...per metre: the noise that gathers them into patches
#define TUFT_TINT vec3(0.92, 1.0, 0.78)    // a tuft against the ground: a little greener
#define TUFT_SIDE 0.5        // how much darker a tuft's side away from the sun is than the side toward it (TUFT_LIT)
#define TUFT_LIT 1.0
#define SWARD_GRAIN vec2(6.0, 24.0)   // per metre: the sward's blades and clumps, two octaves of noise over the ground's mottle...
#define SWARD_CONTRAST vec2(0.4, 0.3) // ...each this deep, peak to peak
#define LAYER_FADE vec2(0.3, 0.9)   // a layer fades out as the pixel's footprint grows from this share of its cell to this

// How much of a layer of cells of 'cell' metres shows at a pixel whose footprint on the ground is 'footprint' metres.
float layerWeight(float cell, float footprint) { return 1.0 - smoothstep(LAYER_FADE.x, LAYER_FADE.y, footprint / cell); }

// The bed's normal tilted by the relief's slope.
vec3 reliefNormal(vec2 point, float footprint) {
  vec2 gradient, slope = vec2(0.0);
  valueNoiseWithGradient(point * RELIEF_FREQUENCIES.x + 31.0, gradient);
  slope += gradient * (2.0 * RELIEF_HEIGHTS.x * RELIEF_FREQUENCIES.x) * (1.0 - smoothstep(0.15, 0.4, footprint * RELIEF_FREQUENCIES.x));
  valueNoiseWithGradient(point * RELIEF_FREQUENCIES.y + 67.0, gradient);
  slope += gradient * (2.0 * RELIEF_HEIGHTS.y * RELIEF_FREQUENCIES.y) * (1.0 - smoothstep(0.15, 0.4, footprint * RELIEF_FREQUENCIES.y));
  return normalize(vec3(vNormal.x - slope.x, vNormal.y, vNormal.z - slope.y));
}

// The cell of a point in cells of 'cell' metres, its chance (one hash) and tone (another); the point's offset from the cell's centre.
vec2 cellOf(vec2 point, float cell, out float chance, out float tone, out vec2 fromCentre) {
  vec2 index = floor(point / cell);
  chance = hash21(index + 0.37);
  tone = hash21(index + 5.11);
  fromCentre = point - (index + 0.5) * cell;
  return index;
}

// A pebble in the cell of the point: its cover, 0 to 1, antialiased over 'edge' metres; tone its colour's; dome how
// its rounded top is lit, 0 at the rim away from the sun to 1 at the rim toward it (the look's larger pebbles are
// kept inside their cells: a look's size up to half the cell over the largest).
float pebble(vec2 point, float share, float edge, out float tone, out float dome) {
  float chance; vec2 fromCentre;
  vec2 index = cellOf(point, PEBBLE_CELL, chance, tone, fromCentre);
  dome = 0.5;
  if (chance >= share) return 0.0;
  float size = hash21(index + 9.1);
  float radius = mix(PEBBLE_RADII.x, PEBBLE_RADII.y, size * size) * min(uShoreLook.y, 0.5 * PEBBLE_CELL / PEBBLE_RADII.y);
  vec2 offset = (vec2(hash21(index + 1.3), hash21(index + 2.7)) - 0.5) * max(PEBBLE_CELL - 2.0 * radius, 0.0);
  vec2 fromPebble = fromCentre - offset;
  dome = 0.5 + 0.5 * dot(fromPebble, normalize(uSunDir.xz + vec2(1e-4, 0.0))) / max(radius, 1e-4);
  return 1.0 - smoothstep(radius - edge, radius + edge, length(fromPebble));
}

// A stick in the cell of the point: a thin ellipse turned by the cell's hash.
float stick(vec2 point, float share, float edge, out float tone) {
  float chance; vec2 fromCentre;
  vec2 index = cellOf(point, STICK_CELL, chance, tone, fromCentre);
  if (chance >= share) return 0.0;
  vec2 offset = (vec2(hash21(index + 1.3), hash21(index + 2.7)) - 0.5) * (0.4 * STICK_CELL);
  float turn = hash21(index + 3.9) * PI;
  vec2 local = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * (fromCentre - offset);
  float halfLength = 0.5 * mix(STICK_LENGTH.x, STICK_LENGTH.y, hash21(index + 6.2));
  float halfWidth = 0.5 * STICK_WIDTH;
  float reach = length(vec2(local.x / halfLength, local.y / halfWidth));
  return 1.0 - smoothstep(1.0 - edge / halfWidth, 1.0 + edge / halfWidth, reach);
}

// The tuft nearest the point among the four cells about it: its cover, its tone, and the point's offset from its centre.
float tuft(vec2 point, float share, float edge, out float tone, out vec2 fromTuft) {
  vec2 base = floor(point / TUFT_CELL - 0.5);
  float ragged = 0.75 + 0.5 * valueNoise(point * 16.0 + 3.0);   // the clumps' uneven edges
  float cover = 0.0;
  tone = 0.5;
  fromTuft = vec2(0.0);
  for (int column = 0; column <= 1; column++) {
    for (int row = 0; row <= 1; row++) {
      vec2 index = base + vec2(float(column), float(row));
      if (hash21(index + 0.37) >= share) continue;
      vec2 offset = point - (index + vec2(hash21(index + 1.3), hash21(index + 2.7))) * TUFT_CELL;
      float radius = mix(TUFT_RADII.x, TUFT_RADII.y, hash21(index + 7.7)) * ragged;
      float here = 1.0 - smoothstep(radius - edge, radius + edge, length(offset));
      if (here > cover) { cover = here; tone = hash21(index + 5.11); fromTuft = offset; }
    }
  }
  return cover;
}

void main() {
  float footprint = max(fwidth(vWorld.x), fwidth(vWorld.z)) + 1e-4;   // metres the pixel covers on the ground
  vec3 normal = reliefNormal(vWorld.xz, footprint);
  vec3 light = uSunIrradiance * max(dot(normal, uSunDir), 0.0) + uSkyAmbient * SKY_LIGHT;
  vec3 sand = floorSand(vWorld.xz) * PATTERN_RANGE * DRY_SAND * mix(WET_SHADE, 1.0, smoothstep(0.0, WET_HEIGHT, vWorld.y));
  float grassFrom = GRASS_FROM * uShoreMore.x, grassTo = GRASS_TO * uShoreMore.x;
  if (uKoiPond > 0.5) {
    float beach = koiBeach(koiAngle(vWorld.xz));
    vec3 pebbles = floorSand(vWorld.xz * 0.7) * PATTERN_RANGE * KOI_STONE_TINT;
    // The stone edge: cobbles, each its own grey or brown, rounded (darker to its rim), moss and earth between them.
    vec3 cobble = koiCobble(vWorld.xz / KOI_COBBLE);
    float cobbleBlur = length(fwidth(vWorld.xz)) / KOI_COBBLE + 1e-3;
    vec3 cobbleColor = mix(vec3(0.36, 0.35, 0.33), vec3(0.4, 0.35, 0.28), cobble.y) * (0.75 + 0.5 * hash21(vec2(cobble.y * 91.0, 3.0))) * mix(0.6, 1.0, smoothstep(0.75, 0.2, cobble.x));
    cobbleColor = mix(KOI_EARTH * 0.8 + KOI_MOSS * 0.5, cobbleColor, smoothstep(0.03 - cobbleBlur, 0.08 + cobbleBlur, cobble.z));
    cobbleColor = mix(cobbleColor, vec3(0.3, 0.29, 0.27), smoothstep(0.3, 0.8, cobbleBlur));
    vec3 stones = mix(cobbleColor, pebbles, beach) * mix(WET_SHADE, 1.0, smoothstep(0.0, 0.05, vWorld.y));
    float mossy = 0.7 + 0.6 * valueNoise(vWorld.xz * 2.7) ;
    vec3 ground = mix(KOI_EARTH, KOI_MOSS * mossy * (0.85 + 0.3 * valueNoise(vWorld.xz * 19.0)), smoothstep(0.3, 0.55, valueNoise(vWorld.xz * 1.3 + 4.0) * 0.5 + 0.35 + 0.15 * smoothstep(0.4, 2.0, vInland)));
    // The edge's stones come and go along it: stretches of cobbles, and between them the moss runs down to the water.
    float stretch = smoothstep(0.35, 0.6, valueNoise(vec2(koiAngle(vWorld.xz) * 2.2, 3.0)));
    float stoneReach = mix(KOI_STONES.x * stretch, KOI_STONES.y, beach) * (0.75 + 0.5 * valueNoise(vWorld.xz * 3.3));
    sand = mix(stones, ground, smoothstep(stoneReach - 0.08, stoneReach + 0.08, vInland));
    grassFrom = KOI_MOSS_TO.x; grassTo = KOI_MOSS_TO.y;
  }
  float grass = smoothstep(grassFrom, grassTo, vInland);

  // Debris on the lake's beach: the wrack line, its sticks, the pebbles (the Koi pond's edge has its own cobbles).
  vec3 albedo = sand;
  float tone = 0.5;
  if (uKoiPond < 0.5) {
    float wrackLine = WRACK_INLAND + WRACK_WANDER * (2.0 * valueNoise(vec2(vWorld.x * WRACK_WAVELENGTH, 0.5) + 11.0) - 1.0);
    float wrack = (1.0 - smoothstep(0.0, WRACK_WIDTH, abs(vInland - wrackLine))) * uShoreLook.w;
    albedo = sand * mix(1.0, WRACK_SHADE, wrack * (1.0 - grass));
    // A dried flat's plates (CRACK_CELL), their cracks dark, faded out where a pixel outgrows them.
    if (uShoreMore.y > 0.0) {
      float gap = koiCobble(vWorld.xz / CRACK_CELL).z;
      float crackBlur = footprint / CRACK_CELL;
      float cracks = (1.0 - smoothstep(CRACK_WIDTH - crackBlur, CRACK_WIDTH + crackBlur, gap)) * layerWeight(CRACK_CELL, footprint) * uShoreMore.y * (1.0 - grass);
      albedo *= mix(1.0, CRACK_SHADE, cracks);
    }
    float pebbleShare = uShoreLook.x * mix(PEBBLE_INLAND / PEBBLE_SHORE, 1.0, 1.0 - smoothstep(0.0, PEBBLE_REACH, vInland)) * (1.0 - grass);
    float dome;
    float pebbles = pebble(vWorld.xz, pebbleShare, footprint, tone, dome) * layerWeight(PEBBLE_CELL, footprint);
    albedo = mix(albedo, mix(sand * 0.4, vec3(dot(sand, vec3(0.333))) * 1.15, tone) * mix(1.0 - 0.5 * PEBBLE_SHADE, 1.0 + 0.5 * PEBBLE_SHADE, dome), pebbles);   // dark to pale grey, domed
    float stickShare = STICK_SHARE * uShoreLook.w * (1.0 - smoothstep(0.0, STICK_SPREAD, abs(vInland - wrackLine))) * (1.0 - grass);
    float sticks = stick(vWorld.xz, stickShare, footprint, tone) * layerWeight(STICK_CELL, footprint);
    albedo = mix(albedo, sand * vec3(0.5, 0.4, 0.3) * mix(0.6, 1.3, tone), sticks);   // dark brown
  }
  vec3 color = albedo * light;

  // The bank: the photo's own land for its colour, shaded by the slope, mottled and grained, with its tufts.
  vec3 toLand = vWorld - cameraPosition;
  // Round the Koi pond the garden's lawn runs on farther before the photo's land takes over (the photo's own lake shore
  // lies where the lake's beach would end).
  float far = uKoiPond > 0.5 ? smoothstep(4.0 * LAND_NEAR, 2.0 * LAND_FAR, length(toLand)) : smoothstep(LAND_NEAR, LAND_FAR, length(toLand));
  float tuftShare = uKoiPond > 0.5 ? 0.0 : TUFT_SHARE * uShoreLook.z * smoothstep(grassFrom - 0.6, grassTo, vInland);
  if (grass > 0.0 || far > 0.0 || tuftShare > 0.0) {
    vec3 land = photoLand(uSkyCube, LAND_LEVEL, toLand.xz);
    float level = max(uSunDir.y, 0.0) + SKY_LIGHT * 0.25;
    float slopeShade = (max(dot(normal, uSunDir), 0.0) + SKY_LIGHT * 0.25 * normal.y) / level;
    // Where the photo shows sky at the horizon, the grass would take the sky's light (a cloud's, white): no brighter
    // than ground of GRASS_ALBEDO_MOST in the light on it.
    float lightOn = dot(uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * SKY_LIGHT, LUMINANCE);
    vec3 nearLand = photoLand(uLandCube, uLandLevel, toLand.xz);
    float grassLevel = max(dot(nearLand, LUMINANCE), 1e-6);
    vec3 grassLand = nearLand * min(1.0, GRASS_ALBEDO_MOST * lightOn / grassLevel);
    // Round the Koi pond, a garden's lawn of its own (the photo's land there is the lake's far shore).
    // Behind its planting the ground lies in its trees' shade (src/koiGarden.js): dark, as the photo's is.
    if (uKoiPond > 0.5) grassLand = KOI_LAWN * (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * SKY_LIGHT) * (0.85 + 0.3 * valueNoise(vWorld.xz * 0.6 + 2.0)) * mix(1.0, KOI_SHADE, smoothstep(1.5, 3.5, vInland));
    // The sward: the ground's colour mottled over a metre and grained finer, each grain faded out where the pixel outgrows it.
    float near = 1.0 - far;
    float mottle = 1.0 + (0.6 * valueNoise(vWorld.xz * 2.3 + 5.0) - 0.3) * near;
    float grain = 1.0 + (SWARD_CONTRAST.x * (valueNoise(vWorld.xz * SWARD_GRAIN.x + 41.0) - 0.5) * layerWeight(1.0 / SWARD_GRAIN.x, footprint)
                       + SWARD_CONTRAST.y * (valueNoise(vWorld.xz * SWARD_GRAIN.y + 83.0) - 0.5) * layerWeight(1.0 / SWARD_GRAIN.y, footprint)) * near;
    vec3 ground = grassLand * slopeShade;
    color = mix(color, ground * mottle * grain, grass);
    vec2 fromTuft;
    float patches = smoothstep(0.3, 0.7, valueNoise(vWorld.xz * TUFT_PATCHES + 23.0));
    float tufts = tuft(vWorld.xz, tuftShare * mix(0.25, 1.0, patches), footprint, tone, fromTuft) * layerWeight(TUFT_CELL, footprint) * near;
    if (tufts > 0.0) {
      vec2 sunward = uSunDir.xz + vec2(1e-4, 0.0);
      float side = 0.5 + 0.5 * dot(normalize(fromTuft + vec2(1e-5)), normalize(sunward));   // 1 on the side the sun lights
      vec3 tuftColor = ground * TUFT_TINT * mix(0.8, 1.15, tone) * mix(1.0 - TUFT_SIDE, TUFT_LIT, side);
      color = mix(color, tuftColor, tufts);
    }
    if (uSnow > 0.0) land = mix(land, SNOW_ALBEDO * (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * SKY_LIGHT), SNOW_FAR * uSnow);
    color = mix(color, land, far);
  }
  float snow = snowCover(vWorld.xz) * smoothstep(0.5 * SNOW_MELT_HEIGHT, SNOW_MELT_HEIGHT, vWorld.y) * (1.0 - far);
  if (snow > 0.0) color = mix(color, snowShade(vWorld.xz) * (uSunIrradiance * max(dot(normal, uSunDir), 0.0) + uSkyAmbient * SKY_LIGHT), snow);
  // The haze by its distance (HAZE), but on the far land, which is the photo's, hazed already.
  if (uHazeDensity > 0.0) color = mix(color, uHazeColor, (1.0 - exp(-uHazeDensity * length(toLand))) * (1.0 - far));
  gl_FragColor = vec4(color, 1.0);
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
// the straight line. A point above the water stays where it is. Under a
// gale (src/galeWaves.js) the surface it is seen through is the level one at
// the height of the water above it, `level`.
// The water's height at a point (m over the still water, the gale's waves
// aside: those lift a floater as a whole, src/rock.js syncMeshes), as
// WATER_VERTEX moves the surface there: the solver's ripples, the wind's and
// the rings, faded out at the patch's edge. A floater's materials (src/rock.js)
// ride on it and meet it at its own height, pixel by pixel.
export const FLOATER_WATER = /* glsl */`
${GLSL_COMMON}
uniform sampler2D uHeight;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uMeshCell;
float floaterWaterHeight(vec2 worldXZ) {
  vec2 domainUv = (worldXZ - uDomainMin) / uDomainSize + uTexelOffset;
  float height = texture2D(uHeight, domainUv).r + ambientHeight(worldXZ);
  if (uRingCount > 0) height += ringHeight(worldXZ, uMeshCell);
  return height * patchMask(domainUv);
}
`;

export const SEEN_THROUGH_WATER = /* glsl */`
#define SEEN_WATER_INDEX 1.333
vec3 seenThroughWater(vec3 world, float level) {
  float depth = level - world.y;
  vec2 fromEye = world.xz - cameraPosition.xz;
  float reach = length(fromEye);
  float height = cameraPosition.y - level;
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

export const PIECE_LOOK = /* glsl */`
// The sheet's own look on a piece of it (ICE_COMMON iceLook: its snow ice, frost specks, bubbles and crystals' lines),
// at a point on the piece (onPiece, m from its middle, so it goes where the piece goes), PIECE_LOOK_SCALE times finer
// (a piece a hand across would lie inside one of the sheet's patches, all one white), over a footprint: the share of
// white it adds, which hides that much of what shows through.
#define PIECE_LOOK_SCALE 2.5
float pieceWhite(vec2 onPiece, float footprint) {
  IceLook look = iceLook(onPiece * PIECE_LOOK_SCALE + 41.0, footprint * PIECE_LOOK_SCALE);
  return clamp(look.white + look.bubbles, 0.0, 1.0);
}
`;

// What a clear floater (src/rock.js `seenThrough`: a shard of ice) shows
// through its top, in the main pass from above the water: the under-water
// pass at its pixel (the pool's tiles or the bed, its own body under the
// water left out of it), dimmed along the way down through the water as
// WATER_FRAGMENT dims what its surface shows, times its `clearShare` and
// the share its face does not mirror (Schlick's Fresnel for its normal),
// with what its milk scatters back lit as the sheet's (clearScatter);
// none from under the water, and none once it is a few centimetres clear of
// the water (`height`, its point's: in the air, on the deck), where that
// pass shows what is far behind it. viewPosition and normal are the
// standard material's (view space).
export const SEEN_UNDER_CLEAR = /* glsl */`
${PIECE_LOOK}
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform sampler2D uUnderColor;
uniform sampler2D uUnderDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform vec3 uExtinction;
uniform vec3 uWaterColor;
vec3 seenUnderClear(vec3 viewPosition, vec3 normal, float clearShare, float height) {
  if (cameraPosition.y < 0.0 || clearShare <= 0.0) return vec3(0.0);
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float surfaceDistZ = max(viewPosition.z, 1e-4);
  float rawDepth = texture2D(uUnderDepth, screenUv).r;
  float underDistZ = rawDepth >= 1.0 ? uFar : -(uNear * uFar) / ((uFar - uNear) * rawDepth - uFar);
  float path = max(underDistZ - surfaceDistZ, 0.0) * length(viewPosition) / surfaceDistZ;
  vec3 underneath = mix(uWaterColor, texture2D(uUnderColor, screenUv).rgb, exp(-uExtinction * path));
  float facing = abs(dot(normalize(viewPosition), normal));
  float mirrored = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  return underneath * clearShare * (1.0 - mirrored) * (1.0 - smoothstep(0.02, 0.08, height));
}
// The light its milk and white ice scatter back (albedo, its colour): as the sheet's white ice is lit
// (WATER_FRAGMENT iceSurface), by the scene's sun and sky, not the material's lights.
vec3 clearScatter(vec3 albedo) {
  return albedo * (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * 1.4);
}
`;

// A clear floater's sides seen from inside, down through its top (src/rock.js
// `seenThrough`, its part under the water from above): the light in the ice
// turned back off them (all but totally: past the critical angle, ice to
// water near enough to it), so as bright as white ice lit by the sun and
// the sky (CLEAR_SIDE_LIGHT of it), fading down the face (`depth`, the
// point's height against the water's, negative: CLEAR_SIDE_FADE metres),
// and over what lies behind by CLEAR_SIDE_COVER; its top under a film of
// water its own light, its white ice and bubbles too (PIECE_LOOK), over what
// lies under it by CLEAR_FILM_COVER where clear and CLEAR_FILM_WHITE where
// white, fading with the water over it (CLEAR_FILM_FADE): a piece pushed
// awash stays in sight, one deep under is all but gone.
export const CLEAR_SIDES_INSIDE = /* glsl */`
${PIECE_LOOK}
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
#define CLEAR_SIDE_LIGHT 0.45
#define CLEAR_SIDE_FADE 0.08
#define CLEAR_SIDE_COVER 0.85     // how much of what is behind a side's inner face it hides
#define CLEAR_FILM_COVER 0.35     // and its top, under a film of water, its own light over what is under it, where clear...
#define CLEAR_FILM_WHITE 0.85     // ...and where its white ice and bubbles are (PIECE_LOOK)...
#define CLEAR_FILM_FADE 0.04      // ...fading with the water over it, by e over this (m): awash it is plainly there
vec3 clearSideInside(float depth) {
  return (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * 1.4) * CLEAR_SIDE_LIGHT * exp(depth / CLEAR_SIDE_FADE);
}
vec3 clearFilm(vec3 albedo) {
  return albedo * (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * 1.4);
}
`;

export const BUBBLE_VERTEX = /* glsl */`
attribute float aSize;
uniform float uProjScale;
uniform vec3 uExtinction;
varying float vFade;
${SEEN_THROUGH_WATER}
${GALE_SURFACE}
void main() {
  // A bubble rises through still water (src/splash.js); the gale lifts it with the column.
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  if (uGaleMetresPerUnit > 0.0) world.y += galeLift(world);
  vec4 viewPosition = viewMatrix * vec4(seenThroughWater(world, uGaleMetresPerUnit > 0.0 ? galeHeight(world.xz) : 0.0), 1.0);
  float dist = max(-viewPosition.z, 0.05);
  gl_PointSize = max(aSize * 2.0 * uProjScale / dist, 1.5);
  vFade = clamp(aSize * 2.0 * uProjScale / dist / 1.5, 0.3, 1.0);
  // Seen from under the water, a bubble fades into it with distance (the green channel's extinction).
  if (cameraPosition.y < 0.0) vFade *= exp(-uExtinction.g * dist);
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
// A speck smaller than uMinPixelSize is drawn at about that size (three
// quarters to one and a quarter of it, by its phase, so a field of
// unresolved specks is not a field of identical dots), soft, with its
// opacity cut by the projected area it really covers: a
// hard dot of a pixel or two would flicker as it moves across pixels, and far
// specks should read as a faint grain where they gather, not as bright dots.
// Only a speck resolved over a few pixels is drawn as a bubble, with a clear
// centre and a bright rim (SPECK_FRAGMENT); one widened to the minimum is a
// soft blob, whatever it is drawn at.
// Each disc projects onto the mean water plane, becoming an ellipse at a
// grazing angle; an unresolved short axis widens to 1.5 pixels with the
// matching loss of opacity. Wave displacement still supplies its height.
// Inside a raft the water shader's bubble pattern is the grain, so a speck
// fades out where the foam the surface shows is between SPECK_RAFT_LOW and
// SPECK_RAFT_HIGH: specks are the bits that drift out of the raft. Of a
// splash's boil the surface shows only what it holds (FRESH_BOIL), under
// SPECK_RAFT_LOW: a speck rides over a boil's cloud. Each speck has a shine
// of its own (aShine, src/foamSpecks.js: most faint, a few bright), a share
// of uOpacity, so no two in a patch are alike.
export const SPECK_VERTEX = /* glsl */`
#define SPECK_DRIFT_SECONDS 1.6
#define SPECK_WANDER 0.0012
#define SPECK_LIFT 0.0015
#define SPECK_FADE 0.35
#define SPECK_RAFT_LOW 0.05
#define SPECK_RAFT_HIGH 0.2
#define SPECK_RING_SPACING 0.01   // metres: the rings' height under a speck, read this smooth
attribute vec2 aDrift;       // initial outward drift, m/s
attribute vec4 aTiming;      // birth (splash seconds), life (s), diameter (m), random phase
attribute float aShine;      // its own brightness, a share of uOpacity (src/foamSpecks.js)
uniform sampler2D uHeight;
uniform sampler2D uFoam;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uTime;
uniform vec2 uFoamVelocity;  // the surface's drift downwind (m/s), which carries the raft too
uniform float uProjScale;    // render-target pixels per world unit at distance 1
uniform float uMinPixelSize;
uniform vec3 uSunDir;
varying float vAlpha;
varying float vPixelSize;    // the speck's true size on screen (pixels), whatever it is drawn at
varying float vDrawn;        // and the size it is drawn at
varying vec2 vSurfaceAxis;
varying float vSurfaceAspect;
varying vec3 vToViewer;      // in the sprite's frame (x right, y down, z toward the viewer): to the viewer...
varying vec3 vToSun;         // ...to the sun...
varying vec3 vHalfVector;    // ...and between them, where the dome's normal glints
${GLSL_COMMON}
${FRESH_BOIL}
void main() {
  float age = uTime - aTiming.x;
  float life = aTiming.y;
  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; vPixelSize = 0.0; vDrawn = 1.0; vSurfaceAxis = vec2(0.0, 1.0); vSurfaceAspect = 1.0;
    vToViewer = vec3(0.0, 0.0, 1.0); vToSun = vToViewer; vHalfVector = vToViewer;
    return;
  }
  float phase = aTiming.w;
  vec2 place = position.xz + aDrift * SPECK_DRIFT_SECONDS * (1.0 - exp(-age / SPECK_DRIFT_SECONDS)) + uFoamVelocity * age;
  place += SPECK_WANDER * vec2(sin(age * 1.3 + phase) + 0.5 * sin(age * 3.1 + 2.0 * phase), cos(age * 1.1 + 1.7 * phase) + 0.5 * sin(age * 2.7 + 3.0 * phase));
  vec2 domainUv = (place - uDomainMin) / uDomainSize + uTexelOffset;
  float mask = patchMask(domainUv);
  float surface = texture2D(uHeight, domainUv).r + ambientHeight(place);
  if (uRingCount > 0) surface += ringHeight(place, SPECK_RING_SPACING);
  float height = surface * mask;
  if (uGaleMetresPerUnit > 0.0) height += galeHeight(place);
  // The foam the surface shows: the raft, and of a splash's boil only what the surface holds (FRESH_BOIL).
  vec2 foamKinds = texture2D(uFoam, domainUv).rg * mask;
  float outsideRaft = 1.0 - smoothstep(SPECK_RAFT_LOW, SPECK_RAFT_HIGH, foamKinds.g + freshBoilSurface(max(foamKinds.r - foamKinds.g, 0.0)));
  vec4 viewPosition = viewMatrix * vec4(place.x, height + SPECK_LIFT, place.y, 1.0);
  float fadeOut = 1.0 - smoothstep(life - SPECK_FADE, life, age);
  float fade = smoothstep(0.0, 0.1, age) * fadeOut * outsideRaft;
  float pixelSize = aTiming.z * (0.6 + 0.4 * fadeOut) * uProjScale / max(-viewPosition.z, 0.05);
  float least = uMinPixelSize * (0.75 + 0.5 * fract(phase * 2.3183));
  float drawn = max(pixelSize, least);
  gl_PointSize = drawn;
  vPixelSize = pixelSize;
  vDrawn = drawn;
  // The dome's lighting, in the sprite's frame: view x is right, view y is up where gl_PointCoord's y is down.
  vec3 toViewer = normalize(-viewPosition.xyz);
  vec3 toSun = normalize(mat3(viewMatrix) * uSunDir);
  vec3 halfVector = normalize(toViewer + toSun);
  vToViewer = vec3(toViewer.x, -toViewer.y, toViewer.z);
  vToSun = vec3(toSun.x, -toSun.y, toSun.z);
  vHalfVector = vec3(halfVector.x, -halfVector.y, halfVector.z);
  // A floating bubble sits in the water plane, not in the screen plane.
  // Keep its projected short axis at least 1.5 pixels and conserve its area
  // in alpha. This also removes the constant-bright snow at a distance.
  vec3 viewNormal = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
  vSurfaceAxis = vec2(viewNormal.x, -viewNormal.y);
  vSurfaceAxis /= max(length(vSurfaceAxis), 1e-5);
  float surfaceAspect = abs(dot(normalize(-viewPosition.xyz), viewNormal));
  vSurfaceAspect = max(surfaceAspect, min(1.0, 1.5 / drawn));
  vAlpha = aShine * fade * (pixelSize * pixelSize) / (drawn * drawn) * surfaceAspect / vSurfaceAspect;
  gl_Position = projectionMatrix * viewPosition;
}
`;

// A speck is lit like the foam map in WATER_FRAGMENT (white under the sun and
// sky, on a level surface), dimmed by uBrightness. Unresolved (its true size,
// vPixelSize, under SPECK_DOME_FROM pixels, whatever minimum it is widened
// to) it is a soft grain. Resolved (from SPECK_DOME_TO) it is a floating
// bubble's cap seen from above, drawn as SURFACE_BUBBLE says, as the water
// draws its bursting bubbles (freshBubbles), so the two match side by side:
// nearly clear, with a thin bright rim where its film turns edge on, each
// pixel the film's mean over the radii from its centre out by a pixel
// (wider across the squash, where the disc is foreshortened), the span's
// share on the disc rounding off the limb a pixel soft; a meniscus's faint
// shadow just inside the rim, as cover without light; and the sun's glint,
// where the dome's normal is the half vector between the viewer and the
// sun, never smaller than a pixel. The glint is added as light, not as
// cover, and scaled by the speck's fade and its shine: a film's reflectance
// follows its thickness (thin-film interference), from nearly nothing to
// four times a single face's, which FOAM_BUBBLE_GLINT's two faces average.
// Never a flat ring with a hole.
export const SPECK_FRAGMENT = /* glsl */`
#define SPECK_PI 3.141592653589793
#define SPECK_DOME_FROM 3.5           // pixels of true size from which a speck starts to be drawn as a dome...
#define SPECK_DOME_TO 5.0             // ...and is one
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform float uOpacity;
uniform float uBrightness;
varying float vAlpha;
varying float vPixelSize;
varying float vDrawn;
varying vec2 vSurfaceAxis;
varying float vSurfaceAspect;
varying vec3 vToViewer;
varying vec3 vToSun;
varying vec3 vHalfVector;
${SURFACE_BUBBLE}
void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  offset += vSurfaceAxis * dot(offset, vSurfaceAxis) * (1.0 / vSurfaceAspect - 1.0);
  float radiusSquared = dot(offset, offset);
  if (radiusSquared > 1.0) discard;
  float radius = sqrt(radiusSquared);
  float pixel = 2.0 / max(vDrawn, 1.0);   // a pixel, in radii
  // A pixel along the radius here: 1/vSurfaceAspect wider along the squash.
  float acrossSquash = radius > 1e-4 ? dot(offset, vSurfaceAxis) / radius : 0.0;
  float radialPixel = pixel * sqrt(1.0 + (1.0 / (vSurfaceAspect * vSurfaceAspect) - 1.0) * acrossSquash * acrossSquash);
  float dome = smoothstep(SPECK_DOME_FROM, SPECK_DOME_TO, vPixelSize * vSurfaceAspect);
  float grain = exp(-3.0 * radiusSquared);
  // The film over the radii from here out by a pixel: x its share on the disc (the limb), y its white.
  vec2 film = bubbleFilm(radius, radius + radialPixel);
  float limb = film.x;
  float shape = mix(grain, film.y, dome);
  vec3 light = uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * 1.5;
  vec3 color = vec3(0.94, 0.96, 0.97) * light * uBrightness;
  float alpha = vAlpha * shape * uOpacity;
  float shadow = vAlpha * bubbleMeniscus(radius, radialPixel) * dome;
  // The sun's glint on the dome.
  vec3 normal = vec3(offset, sqrt(max(1.0 - radiusSquared, 0.0)));
  float nDotH = max(dot(normal, vHalfVector), 1e-3);
  float nDotV = max(dot(normal, vToViewer), 1e-3);
  float variance = FOAM_BUBBLE_GLINT_VARIANCE + pixel * pixel;
  float cosineSquared = nDotH * nDotH;
  float distribution = exp(-(1.0 - cosineSquared) / (cosineSquared * variance)) / (SPECK_PI * variance * cosineSquared * cosineSquared);
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(vToViewer, vHalfVector), 0.0), 5.0);
  vec3 glint = uSunIrradiance * distribution * fresnel / (4.0 * nDotV) * FOAM_BUBBLE_GLINT * step(0.0, dot(normal, vToSun)) * limb * dome * vAlpha;
  gl_FragColor = vec4(color * alpha + min(glint, vec3(40.0)), alpha + shadow);
}
`;

// Drawn into the water's mirror image (src/pool.js's mirror meshes, with
// MIRROR_NEARNESS defined), a point writes its nearness to the mirror camera
// into alpha, as the splash's do (MIRROR_COMMON in src/shaders/fluid.js), so
// the water looks its reflection up where it is (WATER_FRAGMENT's
// nearReflection): the walls and the deck are centimetres from the water,
// and a ripple moves their image far less than the sky's.
const MIRROR_NEARNESS_OUTPUT = /* glsl */`
#define MIRROR_NEARNESS_SCALE 4.0   // MIRROR_COMMON's
float mirrorNearness(vec3 point) {
  return 1.0 - MIRROR_NEARNESS_SCALE / max(distance(point, cameraPosition), 0.05);
}
`;

// The basin (createPool's basin and walls): where the still surface shows it
// from above (SEEN_THROUGH_WATER: the floor looks shallower than it is, and
// a wall's tiles break at the waterline, as in a real pool), where it is
// from below or above the water. The fragment shader works at the true
// point (vWorld).
export const POOL_VERTEX = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormal;
${SEEN_THROUGH_WATER}
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorld = world;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(seenThroughWater(world, 0.0), 1.0);
}
`;

// The basin's light. Under the water, a point is lit as the lake bed is
// (FLOOR_FRAGMENT): the sun refracted into the water and dimmed by the
// water's absorption on its way down (along the refracted ray), focused into
// caustics by the surface's curvature where its light crossed it
// (CAUSTICS, with the floor's focusing), and on a wall turned by the angle
// it meets it at; plus the sky's light, half as much on a wall, which sees
// half the sky. The sunlight reaches a point only if it crossed the water
// inside the pool and cleared the deck: the crossing must be more than the
// deck's own shadow (uDeck times the sun's run per metre of rise) in from
// the pool's edge toward the sun, so the sunward wall shades the floor
// under it, and a wall facing away from the sun has only the sky. The
// shadow's edge is soft over a centimetre or two, as the sun's disc and the
// ripples blur it. The corners, where the floor meets a wall or two walls
// meet, are a little darker (CORNER_SHADE, over CORNER_REACH): less of the
// sky reaches into them. Above the water a wall is lit by the sun and the
// sky directly. Seen from under the water, all of it fades into the water
// on the way to the eye (UNDER_FOG).
export const POOL_FRAGMENT = /* glsl */`
uniform sampler2D uHeight;
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uAbsorb;
uniform vec2 uDomainMin;
uniform float uDomainSize;
uniform float uTexelOffset;
uniform float uN;
uniform float uCell;
varying vec3 vWorld;
varying vec3 vNormal;
${GLSL_COMMON}
${UNDER_FOG}
${CAUSTICS}
${POOL_TILES}
${MIRROR_NEARNESS_OUTPUT}
#define WATER_INDEX 1.333
#define SKY_LIGHT 1.4          // the sky's light, as on the lake bed
#define CORNER_SHADE 0.35
#define CORNER_REACH 0.15      // metres
// How much sunlight reaches a point whose light crossed the surface at
// surfacePoint (the header): how far the light ran over the pool from its
// edge, toward the sun, against the deck's shadow on the water.
float sunlitFrom(vec2 surfacePoint, vec2 toSun, float depth) {
  vec2 lower = uPool.xy;
  vec2 upper = uPool.xy + uPool.z;
  float runX = toSun.x > 1e-4 ? (upper.x - surfacePoint.x) / toSun.x : toSun.x < -1e-4 ? (lower.x - surfacePoint.x) / toSun.x : 1e4;
  float runZ = toSun.y > 1e-4 ? (upper.y - surfacePoint.y) / toSun.y : toSun.y < -1e-4 ? (lower.y - surfacePoint.y) / toSun.y : 1e4;
  float shadow = uDeck * length(uSunDir.xz) / max(uSunDir.y, 1e-3);
  float soft = 0.01 + 0.01 * depth;
  return smoothstep(-soft, soft, min(runX, runZ) - shadow);
}
float cornerLight(vec3 point, vec3 normal) {
  vec2 lower = uPool.xy;
  vec2 upper = uPool.xy + uPool.z;
  vec2 fromSides = min(point.xz - lower, upper - point.xz);
  float nearest;
  if (normal.y > 0.5) nearest = min(fromSides.x, fromSides.y);
  else nearest = min(point.y + uPool.w, abs(normal.x) > 0.5 ? fromSides.y : fromSides.x);
  return 1.0 - CORNER_SHADE * exp(-max(nearest, 0.0) / CORNER_REACH);
}
void main() {
  vec3 normal = normalize(vNormal);
  float depth = max(-vWorld.y, 0.0);
  vec3 albedo = poolTiles(vWorld, normal);
  // The sun refracted into the water: up-sun of a point by tan θt per metre
  // of depth its light crossed the surface.
  float sunSine = length(uSunDir.xz);
  vec2 toSun = uSunDir.xz / max(sunSine, 1e-5);
  float refractedSine = sunSine / WATER_INDEX;
  float refractedCosine = sqrt(1.0 - refractedSine * refractedSine);
  vec3 refractedSun = vec3(toSun.x * refractedSine, refractedCosine, toSun.y * refractedSine);
  vec2 surfacePoint = vWorld.xz + toSun * (refractedSine / refractedCosine) * depth;
  float curvature = surfaceCurvature(surfacePoint);
  vec3 light;
  if (depth > 0.0) {
    float deflection = 1.0 - max(uSunDir.y, 0.0) / (WATER_INDEX * refractedCosine);
    float focusing = deflection * 0.5 * (1.0 + 1.0 / (refractedCosine * refractedCosine));
    float caustic = causticLight(1.0 + focusing * depth * curvature);
    float facing = max(dot(normal, refractedSun), 0.0) / refractedCosine;
    vec3 sun = uSunIrradiance * max(uSunDir.y, 0.0) * exp(-uAbsorb * depth / refractedCosine) * facing * sunlitFrom(surfacePoint, toSun, depth) * caustic;
    vec3 sky = uSkyAmbient * exp(-uAbsorb * depth) * SKY_LIGHT * (0.5 + 0.5 * normal.y);
    light = sun + sky;
  } else {
    light = uSunIrradiance * max(dot(normal, uSunDir), 0.0) + uSkyAmbient * SKY_LIGHT * (0.5 + 0.5 * normal.y);
  }
  vec3 color = albedo * light * cornerLight(vWorld, normal);
  if (cameraPosition.y < 0.0) color = throughWater(color, vWorld);
#ifdef MIRROR_NEARNESS
  gl_FragColor = vec4(color, mirrorNearness(vWorld));
#else
  gl_FragColor = vec4(color, 1.0);
#endif
}
`;

// The deck round the pool (createPool's yard): a plane at the deck's level
// out to the horizon, with a hole the pool's size. Out from the pool's edge,
// a band of pale stone (COPING_WIDTH), its edge rounded down into the pool
// (darker over COPING_ROUND); then square pavers (PAVER, laid from the
// coping's outer edge, with joints of PAVER_JOINT, antialiased as the
// tiles' grout is), out to DECK_WIDTH; then a mottled lawn; and from
// LAND_NEAR to LAND_FAR away all of it becomes the land the sky photo shows
// at the horizon that way (PHOTO_LAND, as the beach's does), so the ground
// runs into the photo's own. (Near by, that colour is the photo's far,
// hazy shore, often its water: the beach's bank takes it, a lawn may not.)
// Lit by the sun and the sky, as the beach is. Under snow (SNOW_COVER) the
// deck and the lawn lie under it but where the splash's drops came down,
// which melt it: there the paving shows, wet.
export const DECK_VERTEX = /* glsl */`
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

export const DECK_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec4 uPool;     // the pool's corner (x, z), its side and its depth (m)
uniform float uWet;     // how wet the rain has made it, 0 to 1 (src/main.js)
// Where the splash's drops came down on it (src/pool.js wetSpot): how wet, 0 to 1, over the square
// from (x, y) on the ground, z (m) across; it dries from its thin edges in.
uniform sampler2D uWetMap;
uniform vec3 uWetArea;
varying vec3 vWorld;
${GLSL_COMMON}
${PHOTO_LAND}
${MIRROR_NEARNESS_OUTPUT}
${HAZE}
#define WET_STONE 0.62      // wet stone's albedo against dry (water in its pores)
#define WET_GRASS 0.85
#define SKY_LIGHT 1.4
#define COPING_WIDTH 0.3
#define COPING_ROUND 0.03
#define COPING_COLOR vec3(0.44, 0.38, 0.29)
#define PAVER 0.6
#define PAVER_JOINT 0.008
#define PAVER_COLOR vec3(0.31, 0.26, 0.19)
#define JOINT_COLOR vec3(0.13, 0.115, 0.09)
#define DECK_WIDTH 2.4
#define GRASS_COLOR vec3(0.075, 0.12, 0.035)
float paverCover(vec2 cell, vec2 width) {
  float lines = PAVER / PAVER_JOINT;
  vec2 high = cell + 0.5 * width;
  vec2 low = cell - 0.5 * width;
  vec2 covered = (floor(high) + min(fract(high) * lines, 1.0) - floor(low) - min(fract(low) * lines, 1.0)) / (lines * width);
  return (1.0 - covered.x) * (1.0 - covered.y);
}
void main() {
  vec2 centre = uPool.xy + 0.5 * uPool.z;
  vec2 offset = vWorld.xz - centre;
  float outside = max(abs(offset.x), abs(offset.y)) - 0.5 * uPool.z;
  vec2 point = vWorld.xz;
  vec2 cell = (point - (uPool.xy - COPING_WIDTH)) / PAVER;
  vec2 width = max(abs(dFdx(point)), abs(dFdy(point))) / PAVER + 1e-3;
  float grain = valueNoise(point * 9.0) * 0.6 + valueNoise(point * 31.0) * 0.4;
  vec3 coping = COPING_COLOR * (0.92 + 0.12 * grain) * mix(0.72, 1.0, smoothstep(0.0, COPING_ROUND, outside));
  vec3 paver = PAVER_COLOR * (0.9 + 0.14 * grain) * (1.0 + (hash21(floor(cell)) - 0.5) * 0.12 * (1.0 - smoothstep(0.4, 1.2, max(width.x, width.y))));
  paver = mix(JOINT_COLOR, paver, paverCover(cell, width));
  // Wet where the splash's drops came down: a soaked patch is dark to its edge, which the stone's grain roughens.
  vec2 wetAt = (point - uWetArea.xy) / uWetArea.z;
  float soaked = all(greaterThan(wetAt, vec2(0.0))) && all(lessThan(wetAt, vec2(1.0))) ? texture2D(uWetMap, wetAt).r : 0.0;
  float splashed = smoothstep(0.03, 0.18, soaked + 0.08 * (grain - 0.5)) * (0.75 + 0.25 * smoothstep(0.2, 0.8, soaked));
  float wet = max(uWet, splashed);
  vec3 albedo = (outside < COPING_WIDTH ? coping : paver) * mix(1.0, WET_STONE, wet);
  float lawn = smoothstep(COPING_WIDTH + DECK_WIDTH, COPING_WIDTH + DECK_WIDTH + 0.08, outside);
  vec3 grass = GRASS_COLOR * (1.0 + 0.6 * valueNoise(point * 2.3 + 5.0) - 0.3) * (0.8 + 0.4 * valueNoise(point * 13.0)) * mix(1.0, WET_GRASS, wet);
  vec3 ground = mix(albedo, grass, lawn);
  float snow = snowCover(point) * (1.0 - splashed);
  if (snow > 0.0) ground = mix(ground, snowShade(point), snow);
  vec3 color = ground * (uSunIrradiance * max(uSunDir.y, 0.0) + uSkyAmbient * SKY_LIGHT);
  vec3 toGround = vWorld - cameraPosition;
  float far = smoothstep(LAND_NEAR, LAND_FAR, length(toGround));
  if (far > 0.0) color = mix(color, photoLand(uSkyCube, LAND_LEVEL, toGround.xz), far);
  color = withHaze(color, length(toGround));
#ifdef MIRROR_NEARNESS
  gl_FragColor = vec4(color, mirrorNearness(vWorld));
#else
  gl_FragColor = vec4(color, 1.0);
#endif
}
`;
