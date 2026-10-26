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
