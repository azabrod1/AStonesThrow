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

// The spray the gale tears off its breaking crests (src/galeWaves.js,
// GaleSpray): drops on a jittered grid of the gale's tile, uSprayCell apart,
// GALE_SPRAY_SLOTS to a cell, each leaving the water on a cycle of its own
// (its life, SPRAY_LIFE times 0.7 to 1.3) from its place on it as a wisp
// of drops (the ribbon's third coordinate: which of them), each blown
// downwind at its own speed and falling as it goes, drawn as the streak it
// cuts in
// SPRAY_STREAK_SECONDS (the eye's persistence, as the rain's streaks are: a
// ribbon facing the eye, at least uMinPixels wide, its opacity cut by the
// width it really covers). Nothing is stored: a drop shows only where a
// crest broke within its age, which the whitecaps' boil remembers (it is
// laid where a crest breaks, GALE_BOIL deep, and pops over uBoilLifetime):
// the boil now, put back by its decay over the drop's age, is how hard the
// crest was breaking when the drop left it. The block of cells is laid about
// the eye's focus in whole cells (uSprayOrigin, the cell index of its
// corner), and each cell's draw is its index wrapped to the tile, so the
// spray repeats with the gale's tile and a drop is the same wherever the
// block stands.
export const GALE_SPRAY_VERTEX = /* glsl */`
${GALE_SURFACE}
#define GALE_BOIL 0.6               // GALE_FOAM_FRAGMENT's
#define SPRAY_LIFE 0.45             // seconds
#define SPRAY_RISE 0.9              // m/s up
#define SPRAY_SPEED 3.5             // m/s downwind
#define SPRAY_DIAMETER 0.004        // metres: a drop
#define SPRAY_STREAK_SECONDS 0.03   // the eye's persistence
#define SPRAY_FROM 0.04             // of a crest breaking in full, where spray starts...
#define SPRAY_FULL 0.3              // ...and is at its thickest
attribute vec3 aSpray;          // per drop: its cell (x, z) in the block, its slot
uniform vec2 uSprayOrigin;      // the cell index of the block's corner
uniform float uSprayCell;       // metres
uniform float uSprayCellsPerTile;
uniform float uTime;            // world seconds
uniform vec2 uWind;             // world XZ the wind blows toward, unit length
uniform float uBoilLifetime;    // seconds
uniform float uFocalPx;         // render-target pixels per unit tan
uniform float uMinPixels;
uniform float uOpacity;
varying float vAlpha;
varying float vAcross;
vec3 sprayHash(vec3 point) {
  vec3 mixed = fract(point * vec3(0.1031, 0.1030, 0.0973));
  mixed += dot(mixed, mixed.yxz + 33.33);
  return fract((mixed.xxy + mixed.yzz) * mixed.zyx);
}
void main() {
  vec2 cell = uSprayOrigin + aSpray.xy;
  vec3 random = sprayHash(vec3(mod(cell, uSprayCellsPerTile), aSpray.z + 1.0));
  vec3 another = sprayHash(random * 91.7 + 3.1 + position.z * 17.3);   // this drop of the wisp's own
  vec2 rest = (cell + random.xy) * uSprayCell;
  float life = SPRAY_LIFE * (0.7 + 0.6 * random.y);
  float age = mod(uTime + random.z * 37.0, life);
  vec2 foam = textureLod(uGaleFoam, rest / uGaleTileSize + 0.5 / uGaleFoamTexels, 0.0).rg;
  float breaking = max(foam.r - foam.g, 0.0) * exp(age / uBoilLifetime) / GALE_BOIL;
  float strength = smoothstep(SPRAY_FROM, SPRAY_FULL, breaking);
  vAcross = position.x;
  if (uGaleMetresPerUnit <= 0.0 || strength <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  vec2 drift = uWind * SPRAY_SPEED * (0.6 + 0.8 * another.y) + (another.zx - 0.5) * 1.5;
  float rise = SPRAY_RISE * (0.4 + another.z);
  vec3 head = vec3(rest.x + drift.x * age, galeHeight(rest) + rise * age - 4.9 * age * age, rest.y + drift.y * age);
  vec3 velocity = vec3(drift.x, rise - 9.81 * age, drift.y);
  vec3 tail = head - velocity * min(SPRAY_STREAK_SECONDS, age);
  vec3 viewHead = (viewMatrix * vec4(head, 1.0)).xyz;
  vec3 viewTail = (viewMatrix * vec4(tail, 1.0)).xyz;
  vec3 point = mix(viewHead, viewTail, position.y);
  float depth = max(-point.z, 1e-3);
  vec3 across = cross(viewTail - viewHead, point);
  float acrossLength = length(across);
  across = acrossLength > 1e-9 ? across / acrossLength : vec3(1.0, 0.0, 0.0);
  float diameter = SPRAY_DIAMETER * (0.5 + another.x);
  float width = max(diameter, uMinPixels * depth / uFocalPx);
  point += across * position.x * 0.5 * width;
  vAlpha = -point.z > 0.05 ? uOpacity * strength * (1.0 - age / life) * (diameter / width) : 0.0;
  gl_Position = projectionMatrix * vec4(point, 1.0);
}
`;

// The spray's streaks: white, lit as the rain's are by the light round them.
export const GALE_SPRAY_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform vec3 uSunDir;
varying float vAlpha;
varying float vAcross;
#define SPRAY_SKY 1.5
#define SPRAY_SUN 0.12
void main() {
  if (vAlpha <= 0.0) discard;
  float alpha = vAlpha * (1.0 - smoothstep(0.2, 1.0, abs(vAcross)));
  vec3 light = uSkyAmbient * SPRAY_SKY + uSunIrradiance * max(uSunDir.y, 0.0) * SPRAY_SUN;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;
