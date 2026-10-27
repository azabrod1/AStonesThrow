// The gale's surface (src/galeWaves.js) for the shaders: its uniforms, where
// a lookup lands on its tile, the surface's height, and how far it lifts what
// the splash computes on still water (galeLift). GLSL_COMMON
// (src/shaders/scene.js) includes it, and the shaders that do without that
// (the splash's drops, sheets and columns, the rain's flecks) include it
// alone.
export const GALE_SURFACE = /* glsl */`
// The gale's waves (src/galeWaves.js): a periodic tile laid over all the
// water, moving it, up and down by h and sideways by D, where the gale blows
// (uGaleMetresPerUnit 0 otherwise, and callers branch on it). Every lookup is
// at a point's rest position, where it would be on still water: the water's
// other waves (the solver's, the ripples, the rings, the rain) ride on it as
// laid on the still surface. Near the stones (within GALE_SIDEWAYS_FROM of
// the patch's centre, which holds the patch's corners) the water moves only
// up and down, so a splash there needs only the height under it (the CPU's,
// GaleSurface); the sideways move, which sharpens the crests, grows in
// beyond, by GALE_SIDEWAYS_TO. Texel n holds the field at x = n·cell, so
// lookups are offset half a texel to land on it.
uniform sampler2D uGaleDisplacement;   // h, Dx, Dz, ∂Dx/∂z
uniform sampler2D uGaleDerivatives;    // ∂h/∂x, ∂h/∂z, ∂Dx/∂x, ∂Dz/∂z
uniform float uGaleTileSize;           // metres per side of the tile
uniform float uGaleTexels;             // texels per side
uniform float uGaleMetresPerUnit;      // the gale's strength over the textures' units; 0 with no gale
uniform vec2 uGaleCentre;              // the patch's centre, world XZ
uniform float uGaleBed;                // the bed's depth under the patch's centre (galeLift)
uniform sampler2D uGaleFoam;           // the whitecaps' foam map: (foam, raft), as the solver's (src/galeWaves.js)
uniform float uGaleFoamTexels;
#define GALE_SIDEWAYS_FROM 4.5
#define GALE_SIDEWAYS_TO 12.0

vec2 galeUv(vec2 restXZ) {
  return restXZ / uGaleTileSize + 0.5 / uGaleTexels;
}

// The surface's height at restXZ, at the base level (near the stones, where
// nothing moves sideways, the height at that point of the water).
float galeHeight(vec2 restXZ) {
  return textureLod(uGaleDisplacement, galeUv(restXZ), 0.0).r * uGaleMetresPerUnit;
}

// How far the gale lifts a point given as it would be on still water (the
// surface at 0): one in the air, a splash's sheet, column or drop, by the
// surface's height under it; one under the water, a cavity's wall or a
// bubble, as the water column between the fixed bed (uGaleBed deep) and the
// moving surface stretches, by h·(1 + y/bed), so the bed stays put. The
// splash computes everything on still water and the gale moves it as it
// draws it (src/splash.js).
float galeLift(vec3 stillPoint) {
  float height = galeHeight(stillPoint.xz);
  return stillPoint.y >= 0.0 ? height : height * max(1.0 + stillPoint.y / uGaleBed, 0.0);
}
`;

// Spindrift (src/spindrift.js): the spray a gale blows off its breaking
// crests, points flown in this shader. Each point is one slot of one cell
// of a lattice of SPINDRIFT_CELL metres round the focus (aCell: the cell's
// offset from the focus's, and the slot); the slot throws every
// SPINDRIFT_PERIOD seconds at its own phase, from the cell's source, a
// place in it drawn afresh every SPINDRIFT_SOURCE_SECONDS (hashed from the
// cell, the slot and the clock, so the harness renders the same spray every
// run), if a whitecap is there: the boil of the foam map (uGaleFoam, the
// foam less its raft), read where the crest that broke at the throw is now
// (it rides downwind at uCrestSpeed), fades the throw in from
// SPINDRIFT_BOIL_FROM to SPINDRIFT_BOIL_TO; nearly every point is dropped
// here. The first SPINDRIFT_SPECK_SLOTS slots of a cell throw specks, the
// drops themselves, SPINDRIFT_SPECK across and bright, the rest puffs of
// mist, faint, growing from SPINDRIFT_SIZE_FROM to SPINDRIFT_SIZE_TO across
// as their drops spread; a cell's throws share a source, so they string out
// along the wind into the streaks spindrift blows in. A throw starts on the
// surface and is blown downwind at SPINDRIFT_SPEED (the wind near the crest
// takes a fine drop's speed within a few tenths of a second), spread up to
// SPINDRIFT_SPREAD of that across the wind, rising at up to SPINDRIFT_RISE
// and coming down at SPINDRIFT_FALL, less than free fall, as the air holds
// its drops near their terminal speed; it thins as it flies. Size and
// brightness are as the rain's flecks' (FLECK_VERTEX in src/shaders/rain.js):
// at least uMinPixels across, the opacity cut by the area really covered.
export const SPINDRIFT_VERTEX = /* glsl */`
${GALE_SURFACE}
attribute vec3 aCell;        // the cell's offset from the focus's (x, z), the slot
uniform vec2 uFocusCell;     // the cell the focus lies in (whole numbers)
uniform float uCellSize;     // metres
uniform float uTime;         // world seconds
uniform vec2 uWind;          // the direction the wind blows toward, unit length
uniform float uCrestSpeed;   // m/s a breaking crest's whitewater travels downwind
uniform float uProjScale;    // render-target pixels per world unit at distance 1
uniform float uMinPixels;
uniform float uOpacity;
uniform float uSpeckSlots;   // the slots of a cell that throw specks; the rest throw puffs
varying float vAlpha;
#define SPINDRIFT_PERIOD 0.7
#define SPINDRIFT_SOURCE_SECONDS 1.5
#define SPINDRIFT_LIFE 0.6
#define SPINDRIFT_SPEED 3.5
#define SPINDRIFT_SPREAD 0.25
#define SPINDRIFT_RISE 1.5
#define SPINDRIFT_FALL 6.0
#define SPINDRIFT_SPECK 0.03
#define SPINDRIFT_SIZE_FROM 0.12
#define SPINDRIFT_SIZE_TO 0.35
#define SPINDRIFT_PUFF_OPACITY 0.3
#define SPINDRIFT_BOIL_FROM 0.05
#define SPINDRIFT_BOIL_TO 0.2

vec3 spindriftHash(vec3 seed) {
  vec3 mixed = fract(seed * vec3(0.1031, 0.1030, 0.0973));
  mixed += dot(mixed, mixed.yxz + 33.33);
  return fract((mixed.xxy + mixed.yzz) * mixed.zyx);
}

void main() {
  vec2 cell = uFocusCell + aCell.xy;
  float slot = aCell.z;
  vec3 phase = spindriftHash(vec3(cell, slot + 0.5));
  float cycle = floor((uTime - SPINDRIFT_PERIOD * phase.x) / SPINDRIFT_PERIOD);
  float age = uTime - SPINDRIFT_PERIOD * (cycle + phase.x);
  float sourceCycle = floor((uTime - age) / SPINDRIFT_SOURCE_SECONDS);
  vec3 place = spindriftHash(vec3(cell + 17.0, sourceCycle + 0.5));
  vec3 throw = spindriftHash(vec3(cell + 29.0, slot + 0.5 + 7.0 * cycle));
  vec2 rest = (cell + place.xy) * uCellSize;
  vec2 crestNow = rest + uWind * uCrestSpeed * age;   // where the crest that broke here at the throw is now
  vec2 foam = textureLod(uGaleFoam, crestNow / uGaleTileSize + 0.5 / uGaleFoamTexels, 0.0).rg;
  float strength = smoothstep(SPINDRIFT_BOIL_FROM, SPINDRIFT_BOIL_TO, max(foam.r - foam.g, 0.0));
  if (age >= SPINDRIFT_LIFE || strength <= 0.0 || uGaleMetresPerUnit <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
  float along = age / SPINDRIFT_LIFE;
  vec2 acrossWind = vec2(-uWind.y, uWind.x);
  vec2 blown = rest + (uWind + acrossWind * SPINDRIFT_SPREAD * (throw.x - 0.5) * 2.0) * SPINDRIFT_SPEED * age;
  float height = galeHeight(crestNow) + SPINDRIFT_RISE * (0.4 + 0.6 * throw.y) * age - 0.5 * SPINDRIFT_FALL * age * age;
  vec4 viewPosition = viewMatrix * vec4(blown.x, height, blown.y, 1.0);
  bool speck = slot < uSpeckSlots;
  float size = speck ? SPINDRIFT_SPECK : mix(SPINDRIFT_SIZE_FROM, SPINDRIFT_SIZE_TO, along) * (0.7 + 0.6 * throw.z);
  float pixels = size * uProjScale / max(-viewPosition.z, 1e-3);
  float drawn = max(pixels, uMinPixels);
  gl_PointSize = drawn;
  float fade = speck ? 1.0 - along : SPINDRIFT_PUFF_OPACITY * (1.0 - along) * (1.0 - along);
  vAlpha = uOpacity * strength * fade * min(pixels * pixels / (drawn * drawn), 1.0);
  gl_Position = projectionMatrix * viewPosition;
}
`;

// A puff: a soft disc of mist, lit by the sky and a little by the sun, as the rain's flecks are.
export const SPINDRIFT_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform vec3 uSunDir;
varying float vAlpha;
#define SPINDRIFT_SKY 1.6
#define SPINDRIFT_SUN 0.15
void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float shape = exp(-2.5 * dot(offset, offset)) - exp(-2.5);
  float alpha = vAlpha * max(shape, 0.0);
  if (alpha < 0.002) discard;
  vec3 light = uSkyAmbient * SPINDRIFT_SKY + uSunIrradiance * max(uSunDir.y, 0.0) * SPINDRIFT_SUN;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;
