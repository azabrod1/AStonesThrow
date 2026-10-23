// GLSL for rain (src/rain.js): the drops' schedule (RAIN_DROPS), the pass
// that draws their rings into the rain's tile (RAIN_TILE_FRAGMENT), the
// water's lookup of that tile (RAIN_RIPPLES), the falling streaks
// (STREAK_VERTEX, STREAK_FRAGMENT) and the flecks a drop throws up where it
// lands (FLECK_VERTEX, FLECK_FRAGMENT). src/rain.js says what each is. The
// rings a splash's drops leave (DROP_RING_SLOPES) read the same table;
// src/dropRings.js says what they are.
import { GALE_SURFACE } from './gale.js';
import { MAX_DROP_RINGS } from '../dropRings.js';

// The schedule. The tile is cut into uRainCells² cells of uRainCell metres;
// each cell holds uRainSlots drops at once, and each slot lands a drop every
// uRainPeriod seconds, from its own offset in time, at a new place in its
// cell and with a new size each time: a hash of the cell (wrapped, so the
// tile repeats), the slot and the cycle. Nothing is stored: the tile's pass,
// the flecks and the streaks evaluate the same drops from the clock.
export const RAIN_MAX_SLOTS = 6;   // the most drops a cell holds at once (src/rain.js's schedules keep under it)

export const RAIN_DROPS = /* glsl */`
uniform float uRainTime;        // world seconds
uniform float uRainCell;        // metres: one cell of the schedule
uniform float uRainCells;       // cells per side of the tile
uniform float uRainSlots;       // drops a cell holds at once
uniform float uRainPeriod;      // seconds between one slot's drops
uniform vec2 uRainSizes;        // the drops' sizes, against tools/rain-probe.mjs's reference drop
// Dave Hoskins' hash without sine: three numbers in [0, 1) from three.
vec3 rainHash(vec3 point) {
  point = fract(point * vec3(0.1031, 0.1030, 0.0973));
  point += dot(point, point.yxz + 33.33);
  return fract((point.xxy + point.yxx) * point.zyx);
}
struct RainDrop {
  vec2 place;    // in its cell, 0 to 1 on each axis
  float size;    // against the reference drop
  float age;     // seconds since it landed (less than 0 before it lands)
};
// A drop of a slot of a cell (an integer cell, any tile's): "later" drops on
// from the one it holds now (0 that one; 1 the one it lands next, in -age seconds).
RainDrop rainDropAt(vec2 cell, float slot, float later) {
  vec2 wrapped = mod(cell, uRainCells);
  float offset = rainHash(vec3(wrapped, slot + 0.5)).x * uRainPeriod;
  float cycle = floor((uRainTime + offset) / uRainPeriod) + later;
  vec3 random = rainHash(vec3(wrapped + 17.31 * slot, cycle + 0.5));
  RainDrop drop;
  drop.place = random.xy;
  drop.size = mix(uRainSizes.x, uRainSizes.y, random.z);
  drop.age = uRainTime + offset - cycle * uRainPeriod;
  return drop;
}
// The drop a slot of a cell holds now.
RainDrop rainDrop(vec2 cell, float slot) { return rainDropAt(cell, slot, 0.0); }
`;

// Where a tile's drop lands on the water (world XZ), the tile read as
// RAIN_RIPPLES reads it: `inTile` its place in the reading's tiles, the
// second reading turned back and shifted back.
export const RAIN_WORLD = /* glsl */`
#define RAIN_TURN_BACK mat2(0.8, -0.6, 0.6, 0.8)
#define RAIN_SHIFT vec2(0.37, 0.71)
vec2 rainWorld(vec2 inTile, int reading, float tileSize) {
  return (reading == 0 ? inTile : RAIN_TURN_BACK * (inTile - RAIN_SHIFT)) * tileSize;
}
`;

// The tile: each texel sums the rings of the drops in its own cell and the
// eight round it (a ring is drawn out to one cell, uRainCell, fading over
// its last uEdgeShare), each drop's ring the reference ring scaled to its
// size f as a capillary ring scales, f·η(r/f, t/f^1.5), fading out over the
// last uFadeShare of its life (uLife, in the reference ring's seconds). It
// writes the height (millimetres) and the slope (∂h/∂x, ∂h/∂z): the slope
// is the table's radial slope along the drop's radius, which the scaling
// leaves as it is.
export const RAIN_TILE_FRAGMENT = /* glsl */`
${RAIN_DROPS}
uniform sampler2D uProfile;     // the reference ring: (height in mm, radial slope) over radius and time
uniform vec2 uProfileTexels;    // its texels: radii, times
uniform float uProfileRadius;   // metres the table spans
uniform float uProfileTime;     // seconds it spans
uniform float uEdgeShare;
uniform float uLife;
uniform float uFadeShare;
uniform float uTileSize;        // metres
varying vec2 vUv;
#define RAIN_MAX_SLOTS ${RAIN_MAX_SLOTS}
void main() {
  vec2 position = vUv * uTileSize;
  vec2 cell = floor(position / uRainCell);
  vec3 field = vec3(0.0);
  for (int row = -1; row <= 1; row++) {
    for (int column = -1; column <= 1; column++) {
      vec2 neighbour = cell + vec2(float(column), float(row));
      for (int slot = 0; slot < RAIN_MAX_SLOTS; slot++) {
        if (float(slot) >= uRainSlots) break;
        RainDrop drop = rainDrop(neighbour, float(slot));
        vec2 away = position - (neighbour + drop.place) * uRainCell;
        float distance = length(away);
        float radius = distance / drop.size;             // the reference ring's metres
        float time = drop.age / pow(drop.size, 1.5);     // and seconds
        if (distance >= uRainCell || radius >= uProfileRadius || time >= uLife) continue;
        vec2 lookup = (vec2(radius / uProfileRadius, time / uProfileTime) * (uProfileTexels - 1.0) + 0.5) / uProfileTexels;
        vec2 ring = textureLod(uProfile, lookup, 0.0).rg;   // the base level: the table has a mip chain for the drop rings
        float fade = (1.0 - smoothstep(uLife * (1.0 - uFadeShare), uLife, time)) * (1.0 - smoothstep(uRainCell * (1.0 - uEdgeShare), uRainCell, distance));
        field.x += fade * drop.size * ring.x;
        field.yz += fade * ring.y * away / max(distance, 1e-6);
      }
    }
  }
  gl_FragColor = vec4(field, 0.0);
}
`;

// The water's lookup. The tile is read twice, the second time turned
// RAIN_TURN and shifted RAIN_SHIFT tiles, so one tile's drops land at two
// unrelated places and its repeat does not show (each reading is half the
// rain, src/rain.js). Read at the pixel's mip level, so far rings average
// out; what they lose is roughness, uRainUnresolved by mip level, as the
// wind's ripples' is (ambientUnresolvedVariance in src/shaders/scene.js).
// The caller branches on uRainOn, so with no rain none of this runs.
export const RAIN_RIPPLES = /* glsl */`
#define RAIN_LEVELS 10
uniform sampler2D uRain;          // the tile: height (mm), ∂h/∂x, ∂h/∂z (src/rain.js)
uniform float uRainOn;            // 1 while it rains, else 0
uniform float uRainTileSize;      // metres
uniform float uRainTexels;        // per side
uniform float uRainUnresolved[RAIN_LEVELS];
#define RAIN_TURN mat2(0.8, 0.6, -0.6, 0.8)
#define RAIN_TURN_BACK mat2(0.8, -0.6, 0.6, 0.8)
#define RAIN_SHIFT vec2(0.37, 0.71)
vec2 rainSlope(vec2 worldXZ) {
  vec2 first = worldXZ / uRainTileSize;
  vec2 second = RAIN_TURN * first + RAIN_SHIFT;
  return texture2D(uRain, first).gb + RAIN_TURN_BACK * texture2D(uRain, second).gb;
}
float rainUnresolvedVariance(vec2 worldXZ) {
  vec2 texelPosition = worldXZ / uRainTileSize * uRainTexels;
  vec2 acrossX = dFdx(texelPosition);
  vec2 acrossY = dFdy(texelPosition);
  float level = clamp(0.5 * log2(max(max(dot(acrossX, acrossX), dot(acrossY, acrossY)), 1e-8)), 0.0, float(RAIN_LEVELS - 1) - 0.001);
  int lower = int(level);
  return mix(uRainUnresolved[lower], uRainUnresolved[lower + 1], level - float(lower));
}
`;

// The drop rings (src/dropRings.js): the slope (∂h/∂x, ∂h/∂z) of each live
// ring, the table's radial slope at r/f and its age (already in the table's
// seconds) along its radius, times its weight, fading over the last
// uDropRingEdgeShare of the radius it is drawn to. The lookup is averaged
// over the pixel's footprint along the radius (acrossX, acrossY: dFdx and
// dFdy of the world XZ), as ringSlope's is (src/shaders/scene.js), at the
// table's mip level that footprint asks for. A pixel outside the box that
// holds every ring's disc (uDropRingBounds) costs four comparisons, one
// inside it a distance test per ring, one inside a ring's disc a fetch and
// some 25 operations more. The caller branches on uDropRingCount.
export const DROP_RING_SLOPES = /* glsl */`
#define MAX_DROP_RINGS ${MAX_DROP_RINGS}
uniform int uDropRingCount;
uniform vec4 uDropRingBounds;                   // the box that holds every ring's disc: least x, z; most x, z (m)
uniform vec4 uDropRingPlaces[MAX_DROP_RINGS];   // centre x, z (m); the radius it is drawn to (m); its size f
uniform vec2 uDropRingTimes[MAX_DROP_RINGS];    // its age in the table's seconds; its weight (its fall's scale times its fade)
uniform sampler2D uDropRingProfile;   // the rain's table (src/rain.js): (height in mm, radial slope) over radius and time, mipmapped
uniform vec2 uDropRingTexels;         // its texels: radii, times
uniform float uDropRingTableRadius;   // metres it spans
uniform float uDropRingTableTime;     // seconds it spans
uniform float uDropRingEdgeShare;
vec2 dropRingSlope(vec2 worldXZ, vec2 acrossX, vec2 acrossY) {
  vec2 slope = vec2(0.0);
  if (any(lessThan(worldXZ, uDropRingBounds.xy)) || any(greaterThan(worldXZ, uDropRingBounds.zw))) return slope;
  for (int index = 0; index < MAX_DROP_RINGS; index++) {
    if (index >= uDropRingCount) break;
    vec4 place = uDropRingPlaces[index];
    vec2 offset = worldXZ - place.xy;
    float distanceSquared = dot(offset, offset);
    if (distanceSquared >= place.z * place.z) continue;
    float distance = sqrt(distanceSquared);
    vec2 outward = offset / max(distance, 1e-6);
    vec2 timing = uDropRingTimes[index];
    float rate = (uDropRingTexels.x - 1.0) / (uDropRingTexels.x * uDropRingTableRadius * place.w);   // texture u per metre
    vec2 lookup = vec2(distance * rate + 0.5 / uDropRingTexels.x, (timing.x / uDropRingTableTime * (uDropRingTexels.y - 1.0) + 0.5) / uDropRingTexels.y);
    float radial = textureGrad(uDropRingProfile, lookup, vec2(rate * dot(outward, acrossX), 0.0), vec2(rate * dot(outward, acrossY), 0.0)).g;
    float edge = 1.0 - smoothstep(place.z * (1.0 - uDropRingEdgeShare), place.z, distance);
    slope += timing.y * edge * radial * outward;
  }
  return slope;
}
`;

// The streaks: each a drop of the schedule, falling to where its ring opens
// and its fleck rises. A streak is one pick (aStreak.w) of one tile near the
// eye (aStreak.xy: its offset from uEyeTile, the tile the eye stands over;
// aStreak.z: the reading, 0 or 1, as RAIN_RIPPLES reads the tile). A drop
// is the same in every tile, falling in step, so the tiles take turns: each
// is of one of uPickClasses classes (laid as tileX + uClassStep·tileZ, which
// keeps a class's tiles 3 to 5 m apart, src/rain.js streakLayout), and its
// picks are its class's drops, so no drop falls in step with its twin a
// metre or two away. The streak is its slot's next drop,
// as high over where that lands as it falls in the time left, slanted by
// the wind (uFall), a bigger drop a little faster (uSpeeds); under a gale it lands on
// the waves (galeHeight, as the flecks stand on them). It is drawn as the
// streak it cuts in uStreakSeconds (the eye's persistence): a ribbon in view
// space from where it is to where it was, turned across the line of sight,
// as wide as the drop or uMinPixels, whichever is wider, its opacity the
// share of that width the drop covers. They fade near the eye and toward
// uReach from it (the tiles reach a tile past it, and as far downwind as a
// drop drifts in its fall, so none comes or goes in sight as the eye crosses
// a tile's edge, src/rain.js streakTiles), and are cut where they land. A
// drop is a lens: it shows the light round it, so a streak takes the sky's
// light.
export const STREAK_VERTEX = /* glsl */`
${RAIN_DROPS}
${RAIN_WORLD}
${GALE_SURFACE}
attribute vec4 aStreak;         // its tile's offset from uEyeTile (x, z), the reading (0 or 1), its pick
uniform vec2 uEyeTile[2];       // the tile the eye stands over, for each reading
uniform float uTileSize;        // metres
uniform float uPickClasses;     // the classes the tiles take turns in
uniform float uClassStep;       // a tile's class: (tileX + uClassStep·tileZ) mod uPickClasses
uniform float uReach;           // metres from the eye the streaks fade out by
uniform vec3 uFall;             // m/s: the fall (down, and along the wind)
uniform vec2 uSpeeds;           // the smallest drop's and the biggest's, times uFall
uniform float uStreakSeconds;
uniform float uFocalPx;         // render-target pixels per unit tan
uniform float uDropDiameter;    // metres
uniform float uMinPixels;
uniform float uOpacity;
varying float vAlpha;
varying float vAcross;
varying float vHeight;
void main() {
  int reading = int(aStreak.z + 0.5);
  vec2 tile = uEyeTile[reading] + aStreak.xy;
  float which = mod(tile.x + uClassStep * tile.y, uPickClasses) + uPickClasses * aStreak.w;   // which of the tile's drops
  float slot = mod(which, uRainSlots);
  float cellIndex = floor(which / uRainSlots);
  vec2 cell = vec2(mod(cellIndex, uRainCells), floor(cellIndex / uRainCells));
  RainDrop drop = rainDropAt(cell, slot, 1.0);   // the drop it lands next, in -drop.age seconds
  vec2 landingXZ = rainWorld(tile + (cell + drop.place) / uRainCells, reading, uTileSize);
  float sizeShare = (drop.size - uRainSizes.x) / max(uRainSizes.y - uRainSizes.x, 1e-6);
  vec3 fall = uFall * mix(uSpeeds.x, uSpeeds.y, sizeShare);
  // Out of reach (most of the tiles' corners): nothing drawn, and no wave looked up.
  float edge = 1.0 - smoothstep(0.6, 1.0, length(landingXZ + fall.xz * drop.age - cameraPosition.xz) / uReach);
  if (edge <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vAcross = 0.0; vHeight = -1.0; return; }
  float ground = uGaleMetresPerUnit > 0.0 ? galeHeight(landingXZ) : 0.0;
  vec3 head = vec3(landingXZ.x, ground, landingXZ.y) + fall * drop.age;
  vec3 tail = head - fall * uStreakSeconds;
  vec3 viewHead = (viewMatrix * vec4(head, 1.0)).xyz;
  vec3 viewTail = (viewMatrix * vec4(tail, 1.0)).xyz;
  vec3 point = mix(viewHead, viewTail, position.y);
  float depth = max(-point.z, 1e-3);
  vec3 across = cross(viewTail - viewHead, point);
  float acrossLength = length(across);
  across = acrossLength > 1e-9 ? across / acrossLength : vec3(1.0, 0.0, 0.0);
  float diameter = uDropDiameter * mix(0.7, 1.3, sizeShare);
  float width = max(diameter, uMinPixels * depth / uFocalPx);
  point += across * position.x * 0.5 * width;
  float near = smoothstep(0.4, 1.5, depth);
  vAlpha = -point.z > 0.05 ? uOpacity * (diameter / width) * near * edge : 0.0;
  vAcross = position.x;
  vHeight = mix(head.y, tail.y, position.y) - ground;   // above where it lands: cut below
  gl_Position = projectionMatrix * vec4(point, 1.0);
}
`;

export const STREAK_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform vec3 uSunDir;
varying float vAlpha;
varying float vAcross;
varying float vHeight;
#define STREAK_SKY 1.3      // a drop shows the light round it: about the sky's
#define STREAK_SUN 0.04     // and a little of the sun's, through it
void main() {
  if (vHeight < 0.0 || vAlpha <= 0.0) discard;
  float alpha = vAlpha * (1.0 - smoothstep(0.2, 1.0, abs(vAcross)));
  vec3 light = uSkyAmbient * STREAK_SKY + uSunIrradiance * max(uSunDir.y, 0.0) * STREAK_SUN;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;

// The flecks: where a drop lands it throws up a crown and a jet a few times
// its own size, white with the bubbles in them, for FLECK_LIFE seconds. Each
// point is one slot of one cell of one tile near where the eye looks
// (aSchedule: the cell, the slot; aRepeat: the tile's offset from
// uFocusTile, and which reading, 0 or 1, as RAIN_RIPPLES reads the tile), so
// its drop is the very drop whose ring the tile draws. It rises and falls
// once (a jet's arc) and fades, at least uMinPixels across and its opacity
// cut by the area it really covers, as the foam specks are.
export const FLECK_VERTEX = /* glsl */`
${RAIN_DROPS}
${RAIN_WORLD}
${GALE_SURFACE}
attribute vec3 aSchedule;       // the cell (x, z) in the tile, the slot
attribute vec3 aRepeat;         // the tile's offset from the focus's tile (x, z), the reading (0 or 1)
uniform vec2 uFocusTile[2];     // the tile the focus lies in, for each reading
uniform float uTileSize;
uniform float uProjScale;       // render-target pixels per world unit at distance 1
uniform float uMinPixels;
uniform float uFleckLife;       // seconds
uniform float uFleckSize;       // metres across, for the reference drop
uniform float uFleckHeight;     // metres the jet rises, for the reference drop
uniform float uOpacity;
varying float vAlpha;
void main() {
  RainDrop drop = rainDrop(aSchedule.xy, aSchedule.z);
  float life = uFleckLife * drop.size;
  if (drop.age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
  int reading = int(aRepeat.z + 0.5);
  vec2 tile = uFocusTile[reading] + aRepeat.xy;
  vec2 inTile = (tile + (aSchedule.xy + drop.place) / uRainCells);   // in tiles
  vec2 world = rainWorld(inTile, reading, uTileSize);
  float along = drop.age / life;
  float height = uFleckHeight * drop.size * 4.0 * along * (1.0 - along);
  if (uGaleMetresPerUnit > 0.0) height += galeHeight(world);   // on the gale's waves
  vec4 viewPosition = viewMatrix * vec4(world.x, height, world.y, 1.0);
  float pixels = uFleckSize * drop.size * uProjScale / max(-viewPosition.z, 1e-3);
  float drawn = max(pixels, uMinPixels);
  gl_PointSize = drawn;
  vAlpha = uOpacity * (1.0 - along) * min(pixels * pixels / (drawn * drawn), 1.0);
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const FLECK_FRAGMENT = /* glsl */`
uniform vec3 uSkyAmbient;
uniform vec3 uSunIrradiance;
uniform vec3 uSunDir;
varying float vAlpha;
#define FLECK_SKY 1.6
#define FLECK_SUN 0.15
void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float shape = exp(-3.0 * dot(offset, offset));
  float alpha = vAlpha * shape;
  if (alpha < 0.002) discard;
  vec3 light = uSkyAmbient * FLECK_SKY + uSunIrradiance * max(uSunDir.y, 0.0) * FLECK_SUN;
  gl_FragColor = vec4(light * alpha, alpha);
}
`;
