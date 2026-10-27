// The stones' grain, drawn pixel by pixel: a river stone's speckle, slate's
// layers, granite's mica and quartz, basalt's fine speckle and pumice's pits,
// and the relief each gives the surface. The stone's mesh (src/thingMeshes.js
// createRockGeometry) carries its lumps and a faint mottle in its vertex
// colours; its grain is finer than any mesh and so is worked out here, for
// each pixel, as a noise of the point's position in the stone's own frame (in
// its nominal radii, so a stone's grain is the same whatever its size on
// screen, and seeded by uStoneSeed, so no two stones share it). Each kind
// (STONE_KINDS, a definition's `look.pattern`) has its factor on the colour
// the vertices give (stoneGrain) and its height over the smooth surface
// (stoneHeight, in radii), whose slope across the pixel tilts the lighting's
// normal (stoneRelief: the bump map's arithmetic, with the slope in the
// surface's own metres rather than per pixel, so the relief looks the same
// from any distance until it is finer than a pixel). A grain finer than a
// pixel is faded to its mean (stoneFade), the relief sooner than the colour,
// or the far stone would sparkle as it turned.
//
// src/rock.js patches every thing's material with this (stoneDetail), the
// kind in uStoneKind (0 for anything but a stone, which skips it): the
// programs stay the ones every thing shares, built under the loading veil
// (src/main.js warmUp throws a river stone and floats a pumice).
export const STONE_KINDS = { river: 1, slate: 2, granite: 3, basalt: 4, pumice: 5 };

// The grain, in the stone's radii: a river stone's speckle at SPECKLE cells a
// radius (as its vertices once carried it, aliased) and a finer grain over it.
const SPECKLE = 22;
const GRAIN = 58;

export const STONE_DETAIL_PARS_VERTEX = /* glsl */ `
varying vec3 vStonePoint;`;

export const STONE_DETAIL_VERTEX = /* glsl */ `
  vStonePoint = position;`;

export const STONE_DETAIL_PARS_FRAGMENT = /* glsl */ `
uniform int uStoneKind;
uniform float uStoneSeed;
varying vec3 vStonePoint;

// A lattice point's random number (pcg3d: the cell's integers mixed, whole, so a far stone's grain is as good as a near one's).
float stoneHash(vec3 cell) {
  uvec3 bits = uvec3(ivec3(cell) + 4096);
  bits = bits * 1664525u + 1013904223u;
  bits.x += bits.y * bits.z; bits.y += bits.z * bits.x; bits.z += bits.x * bits.y;
  bits ^= bits >> 16u;
  bits.x += bits.y * bits.z; bits.y += bits.z * bits.x; bits.z += bits.x * bits.y;
  return float(bits.x) * (1.0 / 4294967296.0);
}

// Value noise over the lattice, 0 to 1, about 0.5.
float stoneNoise(vec3 p) {
  vec3 cell = floor(p), f = fract(p);
  vec3 s = f * f * (3.0 - 2.0 * f);
  float x00 = mix(stoneHash(cell), stoneHash(cell + vec3(1.0, 0.0, 0.0)), s.x);
  float x10 = mix(stoneHash(cell + vec3(0.0, 1.0, 0.0)), stoneHash(cell + vec3(1.0, 1.0, 0.0)), s.x);
  float x01 = mix(stoneHash(cell + vec3(0.0, 0.0, 1.0)), stoneHash(cell + vec3(1.0, 0.0, 1.0)), s.x);
  float x11 = mix(stoneHash(cell + vec3(0.0, 1.0, 1.0)), stoneHash(cell + vec3(1.0, 1.0, 1.0)), s.x);
  return mix(mix(x00, x10, s.y), mix(x01, x11, s.y), s.z);
}

// How much of a noise of \`cells\` a radius survives at a pixel \`footprint\` radii across: all of it while a cell is
// over two pixels, none once a cell is under a pixel (its mean is drawn instead).
float stoneFade(float cells, float footprint, float sooner) {
  return 1.0 - smoothstep(0.4 / sooner, 1.4 / sooner, cells * footprint);
}

// A noise of \`cells\` a radius at \`p\`, faded toward its mean as the pixel's footprint asks.
float stoneGrainNoise(vec3 p, float cells, vec3 offset, float footprint, float sooner) {
  return mix(0.5, stoneNoise(p * cells + offset), stoneFade(cells, footprint, sooner));
}

// The kind's pattern at \`p\` (the stone's frame, radii): the factor its colour takes (rgb) and its relief's height (w, radii).
vec4 stonePattern(vec3 p, float footprint, float sooner) {
  vec3 seed = vec3(uStoneSeed, 0.0, 5.3);
  if (uStoneKind == ${STONE_KINDS.river}) {
    // Worn smooth: a speckle of darker and lighter grains, a finer grain over it, a faint drift in its colour, and
    // next to no relief: its shading is its lumps'.
    float speckle = stoneGrainNoise(p, ${SPECKLE.toFixed(1)}, seed, footprint, sooner) - 0.5;
    float grain = stoneGrainNoise(p, ${GRAIN.toFixed(1)}, seed * 0.7 + vec3(0.0, 9.1, 2.2), footprint, sooner) - 0.5;
    float drift = stoneGrainNoise(p, 5.0, seed + vec3(3.7, 1.9, 0.0), footprint, sooner) - 0.5;
    return vec4(vec3(1.0 + 0.3 * speckle + 0.14 * grain + 0.12 * drift), 0.004 * speckle + 0.0015 * grain);
  }
  if (uStoneKind == ${STONE_KINDS.slate}) {
    // Layers across its thickness (its short axis, y), a little wavy, stepped where one lies over the next, and a fine grain.
    float wave = 4.0 * stoneGrainNoise(p, 3.0, seed + 1.0, footprint, sooner);
    float layer = sin(p.y * 45.0 + wave);
    float grain = stoneGrainNoise(p, 25.0, seed + 2.0, footprint, sooner) - 0.5;
    float layerFade = stoneFade(45.0 / 6.2832, footprint, sooner);
    return vec4(vec3(0.88 + 0.2 * layer * layerFade + 0.1 * grain), 0.006 * layer * layerFade + 0.002 * grain);
  }
  if (uStoneKind == ${STONE_KINDS.granite}) {
    // Black mica and white quartz in a pinkish feldspar; the mica's flakes lie a little under the feldspar, the quartz a little proud.
    float mica = smoothstep(0.66, 0.72, stoneGrainNoise(p, 18.0, seed + 3.0, footprint, sooner));
    float quartz = smoothstep(0.68, 0.74, stoneGrainNoise(p, 15.0, seed + 7.0, footprint, sooner));
    float grain = stoneGrainNoise(p, 40.0, seed + 11.0, footprint, sooner) - 0.5;
    vec3 factor = mix(mix(vec3(1.0 + 0.1 * grain), vec3(1.21, 1.24, 1.24), 0.7 * quartz), vec3(0.24, 0.225, 0.23), 0.85 * mica);
    return vec4(factor, 0.004 * quartz - 0.006 * mica + 0.002 * grain);
  }
  if (uStoneKind == ${STONE_KINDS.basalt}) {
    // Dark and fine-grained, pitted with small vesicles.
    float speckle = stoneGrainNoise(p, 30.0, seed + 4.0, footprint, sooner) - 0.5;
    float pits = smoothstep(0.7, 0.8, stoneGrainNoise(p, 24.0, seed + 8.0, footprint, sooner));
    return vec4(vec3(1.0 + 0.3 * speckle - 0.25 * pits), 0.002 * speckle - 0.012 * pits);
  }
  // Pumice: pale, full of pits (the bubbles), large and small, dark in their hollows.
  float pit = min(smoothstep(0.6, 0.7, stoneGrainNoise(p, 14.0, seed + 5.0, footprint, sooner)) + 0.6 * smoothstep(0.62, 0.72, stoneGrainNoise(p, 32.0, seed + 6.0, footprint, sooner)), 1.0);
  float grain = stoneGrainNoise(p, 50.0, seed + 12.0, footprint, sooner) - 0.5;
  return vec4(vec3(1.0 - 0.45 * pit + 0.08 * grain), -0.03 * pit + 0.002 * grain);
}

// The pixel's footprint on the stone, in its radii.
float stoneFootprint(vec3 p) { return max(length(dFdx(p)), length(dFdy(p))); }

// The lighting's normal tilted by the relief's slope across the pixel: \`heightChange\` the height's change over the
// pixel's steps in x and y, in the surface's own units, like \`surfacePosition\` (the bump map's arithmetic, its
// tangents left their true length so the slope is a slope, not a change per pixel).
vec3 stoneRelief(vec3 surfacePosition, vec3 surfaceNormal, vec2 heightChange, float faceDirection) {
  vec3 sigmaX = dFdx(surfacePosition), sigmaY = dFdy(surfacePosition);
  vec3 r1 = cross(sigmaY, surfaceNormal), r2 = cross(surfaceNormal, sigmaX);
  float det = dot(sigmaX, r1) * faceDirection;
  vec3 gradient = sign(det) * (heightChange.x * r1 + heightChange.y * r2);
  return normalize(abs(det) * surfaceNormal - gradient);
}`;

// After color_fragment (diffuseColor is the material's colour times the vertex's): the grain's factor on it.
export const STONE_DETAIL_COLOR = /* glsl */ `
  if (uStoneKind > 0) diffuseColor.rgb *= stonePattern(vStonePoint, stoneFootprint(vStonePoint), 1.0).rgb;`;

// After normal_fragment_maps (\`normal\` is the lighting's, in view space): the relief's tilt. The height is in the
// stone's radii; the view's metres a radius are the pixel's step in view space over its step in the stone's frame.
export const STONE_DETAIL_NORMAL = /* glsl */ `
  if (uStoneKind > 0) {
    vec3 stoneStepX = dFdx(vStonePoint), stoneStepY = dFdy(vStonePoint);
    float stoneFoot = max(length(stoneStepX), length(stoneStepY));
    float stoneHeightHere = stonePattern(vStonePoint, stoneFoot, 2.5).w;
    vec2 stoneHeightChange = vec2(stonePattern(vStonePoint + stoneStepX, stoneFoot, 2.5).w, stonePattern(vStonePoint + stoneStepY, stoneFoot, 2.5).w) - stoneHeightHere;
    float stoneMetresARadius = length(dFdx(vViewPosition)) / max(length(stoneStepX), 1e-7);
    normal = stoneRelief(-vViewPosition, normal, stoneHeightChange * stoneMetresARadius, faceDirection);
  }`;

/**
 * Patch a thing's material program (src/rock.js, in its onBeforeCompile) with the stones' grain: `uniforms` the
 * thing's { kind, seed } uniform objects (stoneUniforms).
 */
export function stoneDetail(shader, uniforms) {
  shader.uniforms.uStoneKind = uniforms.kind;
  shader.uniforms.uStoneSeed = uniforms.seed;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>${STONE_DETAIL_PARS_VERTEX}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${STONE_DETAIL_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>${STONE_DETAIL_PARS_FRAGMENT}`)
    .replace('#include <color_fragment>', `#include <color_fragment>${STONE_DETAIL_COLOR}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${STONE_DETAIL_NORMAL}`);
}

/** A thing's grain uniforms: a stone's kind and seed (its geometry's `userData.stone`, src/thingMeshes.js), or none. */
export function stoneUniforms(stone) {
  return { kind: { value: stone ? STONE_KINDS[stone.pattern] ?? 0 : 0 }, seed: { value: stone?.seed ?? 0 } };
}
