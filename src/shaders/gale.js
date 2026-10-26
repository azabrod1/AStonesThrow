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
uniform sampler2D uGaleFoam;           // the whitecaps' foam map: (foam, raft), as the solver's, and the breaking's clocks (src/galeWaves.js)
uniform float uGaleFoamTexels;
#define GALE_SIDEWAYS_FROM 4.5
#define GALE_SIDEWAYS_TO 12.0

vec2 galeUv(vec2 restXZ) {
  return restXZ / uGaleTileSize + 0.5 / uGaleTexels;
}

// How much of the sideways move a rest position takes (above).
float galeSideways(vec2 restXZ) {
  return smoothstep(GALE_SIDEWAYS_FROM, GALE_SIDEWAYS_TO, length(restXZ - uGaleCentre));
}

// The surface's height at restXZ, at the base level (near the stones, where
// nothing moves sideways, the height at that point of the water).
float galeHeight(vec2 restXZ) {
  return textureLod(uGaleDisplacement, galeUv(restXZ), 0.0).r * uGaleMetresPerUnit;
}

// The drawn surface's height over world XZ (not a rest position): the rest
// point the gale moves there, found in one step back along its sideways
// move (the spray rides on it, GALE_SPRAY_VERTEX).
float galeHeightUnder(vec2 worldXZ) {
  vec4 field = textureLod(uGaleDisplacement, galeUv(worldXZ), 0.0) * uGaleMetresPerUnit;
  return galeHeight(worldXZ - field.yz * galeSideways(worldXZ));
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

// The spray the gale tears off its breaking crests (src/galeWaves.js): not
// drops but spindrift, a mist of spume tenths of a millimetre across, too
// many and too fine to see one by one, which takes the air's speed within a
// few hundredths of a second and is blown off the crests as a white veil
// (Beaufort 8: "edges of crests begin to break into spindrift"). It is
// drawn as puffs of that mist, each a soft, wispy sheet facing the eye,
// stretched along the wind.
//
// Emitters stand on a grid of the gale's tile, uSprayCell apart, SPRAY_SLOTS
// (src/galeWaves.js) to a cell; each sheds uPuffs puffs in turn (the quad's third coordinate:
// which of them), one every 1/uPuffs of its life (SPRAY_LIFE times 0.7 to
// 1.3), and each time a puff leaves (its flight) it draws afresh where in
// the cell it leaves from and how it flies. It leaves only if the crest
// there was breaking then: the foam map's clocks (GALE_FOAM_FRAGMENT in
// src/shaders/spectral.js), the seconds since the point began to break and
// since it stopped, hold the puff's age between them (give or take
// SPRAY_BEGIN_LEEWAY and SPRAY_END_LEEWAY), so a puff is seen only from a
// crest seen breaking, from its leaving, and never pops in half flown; how
// thick it is goes with how hard the crest broke, which the whitecaps' boil,
// put back by its decay over the puff's age, says.
//
// A puff leaves at the crest's speed (uCrestSpeed, the peak wave's) and
// takes the air's near the water (uAirSpeed, 0.8 to 1.2 times it) over
// SPRAY_EASE; it drifts a little across the wind, rises to SPRAY_LIFT over
// the water under it (the drawn surface's, moved sideways as the water is:
// galeHeightUnder) and rides over the waves at that height, grows by
// SPRAY_GROWTH and is drawn out along the wind by the shear SPRAY_SHEAR, and
// thins as it spreads, dissolving into wisps (uSprayNoise, a tileable fBm,
// stretched along the wind) as it ages. It is lit as a cloud of drops is:
// the sky's light and the sun's, which a mist throws forward, so spray
// against the sun glows (a Henyey–Greenstein lobe). It fades where it dips
// into the water (SPRAY_SOFT over the surface, per pixel), near the eye
// (one passing the lens would fill the screen) and toward the edge of the
// block of cells, which is laid about the eye's focus in whole cells
// (uSprayOrigin, its corner's cell index; uSprayFocus, the focus, and
// uSprayReach, how far from it emitters show); each cell's draw is its index
// wrapped to the tile, so the spray repeats with the gale's tile and a puff
// is the same wherever the block stands. Nothing is stored and nothing is
// blurred: a puff is where it is now, at any time scale.
export const GALE_SPRAY_VERTEX = /* glsl */`
${GALE_SURFACE}
#define GALE_BOIL 0.6               // GALE_FOAM_FRAGMENT's
#define SPRAY_LIFE 0.7              // seconds
#define SPRAY_FROM 0.25             // of a crest breaking in full, where spray starts...
#define SPRAY_FULL 0.65             // ...and is at its thickest
#define SPRAY_BEGIN_LEEWAY 0.03     // s: a puff may leave this long before the break is counted...
#define SPRAY_END_LEEWAY 0.12       // ...and this long after it stops
#define SPRAY_EASE 0.1              // s: the puff takes the air's speed
#define SPRAY_ACROSS 0.8            // m/s: the most it drifts across the wind
#define SPRAY_LIFT_LEAST 0.03       // m over the water at its leaving...
#define SPRAY_LIFT 0.12             // ...rising at most this much more...
#define SPRAY_LIFT_TIME 0.3         // ...over about this long (s)
#define SPRAY_RADIUS 0.05           // m at its leaving
#define SPRAY_GROWTH 0.3            // m/s
#define SPRAY_FLAT 0.6              // its thickness over its radius
#define SPRAY_SHEAR 1.2             // m/s it is drawn out along the wind
#define SPRAY_FLIGHTS 251.0         // a puff's draws repeat after this many flights
attribute vec3 aSpray;          // per slot: its cell (x, z) in the block, its slot
uniform vec2 uSprayOrigin;      // the cell index of the block's corner
uniform vec2 uSprayFocus;       // world XZ the block is laid about
uniform float uSprayReach;      // metres from it (each way) emitters show
uniform float uSprayCell;       // metres
uniform float uSprayCellsPerTile;
uniform float uPuffs;           // puffs a slot sheds in turn
uniform float uTime;            // world seconds
uniform vec2 uWind;             // world XZ the wind blows toward, unit length
uniform float uAirSpeed;        // m/s near the water
uniform float uCrestSpeed;      // m/s: the crests'
uniform float uBoilLifetime;    // seconds
uniform float uOpacity;
varying float vAlpha;
varying vec2 vShape;            // across and along the puff, −1 to 1
varying vec2 vNoise;            // where its wisps are read
varying float vAge;             // of its life
varying vec3 vWorld;
vec3 sprayHash(vec3 point) {
  vec3 mixed = fract(point * vec3(0.1031, 0.1030, 0.0973));
  mixed += dot(mixed, mixed.yxz + 33.33);
  return fract((mixed.xxy + mixed.yzz) * mixed.zyx);
}
void main() {
  vShape = position.xy;
  vec2 cell = uSprayOrigin + aSpray.xy;
  vec3 random = sprayHash(vec3(mod(cell, uSprayCellsPerTile), aSpray.z + 1.0));
  float life = SPRAY_LIFE * (0.7 + 0.6 * random.y);
  float clock = uTime + random.z * 37.0 + position.z * life / uPuffs;   // each puff of the slot a share of a life behind the one before
  float age = mod(clock, life);
  float flight = mod(floor(clock / life), SPRAY_FLIGHTS);
  vec3 another = sprayHash(random * 91.7 + 3.1 + position.z * 17.3 + flight * 0.618);   // this flight's own
  vec3 place = sprayHash(another * 47.3 + 11.9);
  vec2 rest = (cell + place.xy) * uSprayCell;
  // Whether the crest there was breaking at the puff's leaving, and how hard.
  vec2 foam = textureLod(uGaleFoam, rest / uGaleTileSize + 0.5 / uGaleFoamTexels, 0.0).rg;
  ivec2 texel = ivec2(mod(floor(rest / uGaleTileSize * uGaleFoamTexels + 0.5), uGaleFoamTexels));
  vec2 clocks = texelFetch(uGaleFoam, texel, 0).ba;   // since it began to break, since it stopped
  bool breakingThen = age <= clocks.x + SPRAY_BEGIN_LEEWAY && age >= clocks.y - SPRAY_END_LEEWAY;
  float breaking = min(max(foam.r - foam.g, 0.0) * exp(age / uBoilLifetime) / GALE_BOIL, 1.0);
  float strength = breakingThen ? smoothstep(SPRAY_FROM, SPRAY_FULL, breaking) : 0.0;
  vec2 fromFocus = abs(rest - uSprayFocus) / uSprayReach;
  strength *= 1.0 - smoothstep(0.7, 1.0, max(fromFocus.x, fromFocus.y));
  if (uGaleMetresPerUnit <= 0.0 || strength <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vNoise = vec2(0.0); vAge = 0.0; vWorld = vec3(0.0); return; }
  // Its flight: off the crest at the crest's speed, into the air's.
  float air = uAirSpeed * (0.8 + 0.4 * another.y);
  float along = air * age + (uCrestSpeed - air) * SPRAY_EASE * (1.0 - exp(-age / SPRAY_EASE));
  vec2 xz = rest + uWind * along + vec2(-uWind.y, uWind.x) * (2.0 * another.z - 1.0) * SPRAY_ACROSS * age;
  float lift = SPRAY_LIFT_LEAST + SPRAY_LIFT * (0.4 + 0.6 * another.x) * (1.0 - exp(-age / SPRAY_LIFT_TIME));
  vec3 centre = vec3(xz.x, galeHeightUnder(xz) + lift, xz.y);
  // A sheet facing the eye, its length along the wind as the eye sees it: seen end on, a puff is as long as it is thick.
  vec3 middle = (viewMatrix * vec4(centre, 1.0)).xyz;
  vec3 toward = middle / max(length(middle), 1e-6);
  vec3 windView = (viewMatrix * vec4(uWind.x, 0.0, uWind.y, 0.0)).xyz;
  vec3 alongView = windView - dot(windView, toward) * toward;
  float sideOn = length(alongView);
  vec3 alongAxis = sideOn > 1e-4 ? alongView / sideOn : normalize(cross(toward, vec3(1.0, 0.0, 0.0)));
  vec3 acrossAxis = cross(alongAxis, toward);
  float radius = SPRAY_RADIUS + SPRAY_GROWTH * age;
  float acrossHalf = SPRAY_FLAT * radius;
  float alongHalf = mix(acrossHalf, radius + 0.5 * SPRAY_SHEAR * (0.6 + 0.8 * another.y) * age, sideOn);
  vec3 point = middle + alongAxis * position.y * alongHalf + acrossAxis * position.x * acrossHalf;
  vWorld = (vec4(point, 1.0) * viewMatrix).xyz + cameraPosition;   // the view's inverse rotation, then its place
  float near = smoothstep(0.5, 1.5, -middle.z);
  float fadeIn = smoothstep(0.0, 0.08, age);
  float fadeOut = 1.0 - smoothstep(0.45, 1.0, age / life);
  vAlpha = uOpacity * strength * near * fadeIn * fadeOut * sqrt(SPRAY_RADIUS / radius);
  vAge = age / life;
  vNoise = another.xy * 7.0 + vec2(0.2 * position.y - 0.15 * vAge, 0.3 * position.x);   // its wisps drawn out along it
  gl_Position = projectionMatrix * vec4(point, 1.0);
}
`;

// The mist's light: a cloud of drops lit by the sky all round and by the
// sun, thrown forward (Henyey–Greenstein, SPRAY_FORWARD), taken as 1 when lit
// from the side and at most SPRAY_GLOW toward the sun, faded into the
// weather's haze (HAZE in src/shaders/scene.js, put before it); its wisps a
// tileable fBm (uSprayNoise) that the puff's age eats away; cut softly where
// it dips into the water.
export const GALE_SPRAY_FRAGMENT = /* glsl */`
${GALE_SURFACE}
uniform sampler2D uSprayNoise;
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform vec3 uSunDir;
varying float vAlpha;
varying vec2 vShape;
varying vec2 vNoise;
varying float vAge;
varying vec3 vWorld;
#define SPRAY_SKY 1.35              // the foam's sky light, times its albedo (src/shaders/scene.js)
#define SPRAY_SUN 0.6
#define SPRAY_FORWARD 0.5           // the lobe's asymmetry, g
#define SPRAY_GLOW 4.0
#define SPRAY_SOFT 0.05             // m over the water it fades in
float henyeyGreenstein(float cosine, float asymmetry) {
  float squared = asymmetry * asymmetry;
  return (1.0 - squared) / pow(1.0 + squared - 2.0 * asymmetry * cosine, 1.5);
}
void main() {
  if (vAlpha <= 0.0) discard;
  float radial = dot(vShape, vShape);
  if (radial >= 1.0) discard;
  float envelope = (1.0 - radial) * (1.0 - radial);
  float wisps = 0.65 * texture2D(uSprayNoise, vNoise).r + 0.35 * texture2D(uSprayNoise, vNoise * 2.3 + 0.37).r;
  float cut = mix(0.3, 0.62, vAge);
  float alpha = vAlpha * envelope * smoothstep(cut, cut + 0.3, wisps);
  if (alpha < 0.002) discard;
  alpha *= smoothstep(0.0, SPRAY_SOFT, vWorld.y - galeHeightUnder(vWorld.xz));
  if (alpha < 0.002) discard;
  vec3 toEye = vWorld - cameraPosition;
  float distance = length(toEye);
  float phase = min(henyeyGreenstein(dot(toEye / distance, uSunDir), SPRAY_FORWARD) / henyeyGreenstein(0.0, SPRAY_FORWARD), SPRAY_GLOW);
  vec3 light = uSkyAmbient * SPRAY_SKY + uSunIrradiance * SPRAY_SUN * phase * smoothstep(-0.02, 0.06, uSunDir.y);
  gl_FragColor = vec4(withHaze(light, distance) * alpha, alpha);
}
`;
