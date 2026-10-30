// Reeds standing in the shallows: the pond's foreground. The home view looks
// from the beach across the water at the sky photo's far shore, so nothing
// near the eye but the water itself was in the frame, and a frame of water
// against a photo reads as a backdrop. Rushes rooted in the shallows at the
// frame's lower corners, and in the turn of the eye to either side, give it
// a middle ground: things with parallax against the sky, mirrored in the
// water, moving a little in the wind.
//
// Where they stand (BEDS): clumps of stems in water from a hand's depth to
// about a metre, as bulrush and the common reed grow (deeper and they
// drown), close inshore on either side of the throw's line, a few singles
// farther along the waterline. The stems are placed by their own hashes
// (placeStems: a Park–Miller sequence from a fixed seed, never
// Math.random, which a seeded throw draws from), each rooted on the lake bed
// (floorDepthAt, src/pondFloor.js), so it stands where the drawn bed is,
// and never in the throw's line in portrait: the phone's home frame is a
// slot 0.8 m wide at its bottom, and the nearest stems stand just outside
// it on the right. Which places have them is the sky's `reeds` (SKIES in
// src/sky.js; src/main.js setReeds): the fresh lakes, not a sea cove, a
// bare rock shore, a salt flat or a frozen alpine reservoir.
//
// Each stem is one instance of a ribbon (REED_SEGMENTS rows, two verts a
// row) the vertex shader bends and turns to face the eye about its own
// axis (so from any side it is a round stem's width, a tapering few
// millimetres), and shades as a cylinder: the normal across the ribbon is
// the circle's, so the sun lights one side and the sky the top, with a
// little light through it from behind (REED_THROUGH, the stem is thin), the
// green of its base browning to the tip and from stem to stem. A share of
// the stems (HEAD_SHARE) carry a cattail's head, the ribbon widened to
// HEAD_RADIUS over the top of the stem below its spike and coloured the
// head's brown; and each stem has leaf blades about it (BLADES_PER_STEM on
// average), the same ribbon rooted by the stem, BLADE_WIDTH wide and flat,
// facing the eye, arching over under their own weight (BLADE_DROOP at the
// tip) and shorter than the stem (BLADE_HEIGHT of it).
// The bend is a cantilever's under the wind's drag, a lean along the wind
// growing as the square of the height up the stem (LEAN_PER_STRENGTH radians
// at the tip per unit of the Wind control's strength, WIND_STRENGTHS in
// src/ambientWaves.js), plus each stem's own lean and a sway at its natural
// frequency (SWAY_HERTZ about, a reed's, each stem's own by its hash),
// SWAY_PER_STRENGTH strong, and the gusts of the ambient field passing over
// its root (gustEnvelope, GLSL_COMMON) swell it. The root never moves, so
// the stem meets its own image at the waterline whatever it does above.
//
// A stem is drawn at least LEAST_PIXELS wide on screen (its radius widened
// to the frame's pixel at its distance, resize): thinner, the ribbon falls
// between the pixels and draws as a row of dots; and one under two pixels
// wide is shaded flat, since the circle's lit and dark sides a pixel apart
// beaded it.
//
// Two meshes draw one stem, as a stone's do (src/rock.js): `above`, in the
// main scene and on the water's mirror layer, clipped to y ≥ 0; `below`, in
// the under-water pass, clipped to y ≤ 0 (the shaders carry three.js's
// clipping chunks, which a ShaderMaterial's planes need: without them the
// under-water pass holds the whole stem, and the water's refraction shows
// its upper half as a dark column), its vertices moved to where the
// flat surface shows them (SEEN_THROUGH_WATER, so the stem bends at the
// waterline as a straw in a glass does and meets its upper half there), lit
// through the water above it (the sun and sky down to its depth, the
// water's absorption) and, seen from under the water, fading into the
// water's colour with the distance (as the floor and the stones do). The
// water's crests, a centimetre or two, hide the top of the under half and
// show the bottom of the upper through the surface's refraction; a gale's
// decimetre leaves a gap at each crest, as it does at a stone's waterline.
// The mirror is drawn when the view changes (src/main.js), so a stem's
// image sways only then: its root, which never moves, is where image and
// stem meet, and the tips' lag is a few centimetres in a breeze.
import * as THREE from 'three';
import { floorDepthAt } from './pondFloor.js';
import { GLSL_COMMON, SEEN_THROUGH_WATER } from './shaders/scene.js';

/** The clumps: centre (x, z), spread (m, a disc), stems, heights (m, min and max above the water). */
export const BEDS = [
  { x: -0.8, z: 1.25, spread: 0.45, count: 80, heights: [0.6, 1.25] },    // left of the throw's line, nearest: the frame's lower left corner, away from the sun's image on the right
  { x: -2.4, z: 2.0, spread: 0.5, count: 60, heights: [0.5, 1.0] },        // and along the waterline from it
  { x: 2.1, z: 1.75, spread: 0.5, count: 70, heights: [0.55, 1.1] },       // right, farther off: the frame's right edge
  { x: 2.95, z: 1.25, spread: 0.3, count: 25, heights: [0.5, 0.95] },
];
export const REED_SEGMENTS = 8;
const REED_SEED = 4751;
/** The share of stems with a cattail's head, and the blades rooted by each stem on average. */
const HEAD_SHARE = 0.12;
const BLADES_PER_STEM = 1.6;
/** A blade's height as a share of its stem's, and its arch at the tip (radians). */
const BLADE_HEIGHT = [0.7, 0.95];
const BLADE_DROOP = [0.1, 0.3];
/** The instance kinds. */
const KIND_STEM = 0;
const KIND_HEAD = 1;
const KIND_BLADE = 2;
/** The deepest water a stem is rooted in (m): deeper, and the placement tries again nearer the clump's centre. */
const DEEPEST_ROOT = 1.1;
/** A stem's own lean, radians at the tip, up to this. */
const OWN_LEAN = 0.12;

const REED_VERTEX = /* glsl */`
uniform float uWindStrength;        // the Wind control's (WIND_STRENGTHS); the ambient field's own uniforms (the wind's direction, the gusts' clock) come with GLSL_COMMON
uniform float uPixelsHigh;          // the frame's height in pixels: a stem is drawn at least a pixel wide (the header)
uniform float uTime;
uniform float uSeenThroughWater;    // 1 for the half under the water: drawn where the surface shows it
${GLSL_COMMON}
${SEEN_THROUGH_WATER}
#include <clipping_planes_pars_vertex>
attribute vec3 instanceRoot;        // where the stem is rooted, on the bed
attribute vec4 instanceShape;       // height above the water (m), its own lean's direction (radians), its own lean (radians at the tip), its sway's phase
attribute float instanceTint;       // 0 to 1: the greenest stem to the brownest
attribute float instanceKind;       // 0 a stem, 1 a stem with a head, 2 a blade
varying vec3 vWorld;
varying vec3 vSide;                 // the ribbon's across direction, unit
varying vec3 vUp;                   // the stem's direction at this point, unit
varying float vAcross;              // −1 to 1 across the ribbon
varying float vAlong;               // 0 at the root, 1 at the tip
varying float vTint;
varying float vKind;
varying float vPixels;              // the ribbon's width on screen in pixels: under two, it is shaded flat
#define LEAN_PER_STRENGTH 0.08      // radians at the tip per unit of wind strength
#define SWAY_PER_STRENGTH 0.035     // radians at the tip per unit of wind strength
#define SWAY_HERTZ 1.3
#define STEM_RADIUS 0.006           // metres at the water
#define TIP_RADIUS 0.0015
#define HEAD_RADIUS 0.009           // a cattail's head, over HEAD_FROM to HEAD_TO of the stem
#define HEAD_FROM 0.78
#define HEAD_TO 0.9
#define BLADE_WIDTH 0.02            // metres, at its widest
#define LEAST_PIXELS 1.0            // a stem's least width on screen
void main() {
  float along = position.y;           // 0 at the root, 1 at the tip
  float across = position.x;          // −1 to 1
  vec3 root = instanceRoot;
  float height = instanceShape.x - root.y;   // from the root to the tip
  vec3 tip = vec3(0.0, height, 0.0);
  // The lean: its own, the wind's and the sway, all as the square of the height up the stem (a cantilever's shape).
  vec2 ownLean = vec2(cos(instanceShape.y), sin(instanceShape.y)) * instanceShape.z;
  float gust = 0.5 + 0.5 * gustEnvelope(root.xz, uGustTime);
  float sway = sin(uTime * 2.0 * PI * SWAY_HERTZ * (0.8 + 0.4 * fract(instanceShape.w * 7.31)) + instanceShape.w) * SWAY_PER_STRENGTH * uWindStrength * gust;
  vec2 lean = ownLean + uWindDirection * (LEAN_PER_STRENGTH * uWindStrength * gust + sway);
  float bend = along * along;
  vec3 offset = vec3(lean.x, 0.0, lean.y) * bend * height;
  vec3 centre = root + tip * along + offset;
  centre.y -= 0.5 * dot(lean, lean) * bend * height;   // a bent stem's tip comes down a little
  vec3 direction = normalize(tip + vec3(lean.x, 0.0, lean.y) * 2.0 * along * height);
  vec3 toEye = cameraPosition - centre;
  vec3 side = normalize(cross(direction, toEye));
  float radius = mix(STEM_RADIUS, TIP_RADIUS, along);
  if (instanceKind > 1.5) radius = BLADE_WIDTH * 0.5 * sin(PI * min(along * 1.25, 1.0)) * (1.0 - 0.5 * along);   // a blade: widest low down, a point at the tip
  else if (instanceKind > 0.5) radius = max(radius, HEAD_RADIUS * smoothstep(HEAD_FROM - 0.015, HEAD_FROM, along) * (1.0 - smoothstep(HEAD_TO, HEAD_TO + 0.01, along)));
  // Never under a pixel wide on screen: a stem thinner than one is drawn as a row of dots.
  float pixel = -(viewMatrix * vec4(centre, 1.0)).z * 2.0 / (projectionMatrix[1][1] * uPixelsHigh);
  vPixels = 2.0 * radius / pixel;
  radius = max(radius, 0.5 * LEAST_PIXELS * pixel);
  vec3 world = centre + side * across * radius;
  vWorld = world;
  vSide = side;
  vUp = direction;
  vAcross = across;
  vAlong = along;
  vTint = instanceTint;
  vKind = instanceKind;
  vec3 shown = mix(world, seenThroughWater(world, 0.0), uSeenThroughWater);   // at the same height: the clip keeps its half
  vec4 mvPosition = viewMatrix * vec4(shown, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
`;

const REED_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uExtinction;           // the water's, per metre (lighting.extinction)
uniform vec3 uWaterColor;           // the water's own radiance, for an eye under it
varying vec3 vWorld;
varying vec3 vSide;
varying vec3 vUp;
varying float vAcross;
varying float vAlong;
varying float vTint;
varying float vKind;
varying float vPixels;
#include <clipping_planes_pars_fragment>
#define SKY_LIGHT 1.4               // the sky's light, as on the beach
#define REED_THROUGH 0.35           // light through the stem from behind, as a share of the sun's on its face
#define REED_GREEN vec3(0.09, 0.19, 0.06)
#define REED_BROWN vec3(0.3, 0.24, 0.1)
#define HEAD_BROWN vec3(0.1, 0.06, 0.035)
#define TIP_BROWN 0.6               // how far the tip browns
#define HEAD_FROM 0.78
#define HEAD_TO 0.9
void main() {
  #include <clipping_planes_fragment>
  vec3 toEye = normalize(cameraPosition - vWorld);
  // The cylinder's normal at this point of its face: across the ribbon the circle's, toward the eye in the middle;
  // a blade's is its flat face's, toward the eye, tilted a little across.
  // A stem under two pixels wide is shaded flat: the circle's light and dark sides, a pixel apart, beaded it.
  float sine = clamp(vAcross, -1.0, 1.0) * (vKind > 1.5 ? 0.35 : 1.0) * smoothstep(1.0, 2.5, vPixels);
  vec3 facing = normalize(toEye - vUp * dot(toEye, vUp));
  vec3 normal = normalize(vSide * sine + facing * sqrt(max(1.0 - sine * sine, 0.0)));
  vec3 albedo = mix(REED_GREEN, REED_BROWN, clamp(vTint * 0.6 + TIP_BROWN * smoothstep(0.6, 1.0, vAlong), 0.0, 1.0));
  if (vKind > 0.5 && vKind < 1.5) albedo = mix(albedo, HEAD_BROWN, smoothstep(HEAD_FROM - 0.02, HEAD_FROM, vAlong) * (1.0 - smoothstep(HEAD_TO, HEAD_TO + 0.02, vAlong)));
  float sunFace = max(dot(normal, uSunDir), 0.0);
  float sunBack = max(-dot(normal, uSunDir), 0.0) * REED_THROUGH;
  vec3 light = uSunIrradiance * (sunFace + sunBack) + uSkyAmbient * SKY_LIGHT * (0.6 + 0.4 * normal.y);
  float depth = max(-vWorld.y, 0.0);
  light *= exp(-uExtinction * depth * 1.5);   // under the water: the light down to it, and some of its way back up
  vec3 color = albedo * light;
  if (cameraPosition.y < 0.0) color = mix(uWaterColor, color, exp(-uExtinction * length(cameraPosition - vWorld)));
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Park–Miller's sequence from a seed: the same stems every visit. */
function sequence(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}

/**
 * The instance data for the beds: { roots, shapes, tints, kinds, count }
 * (Float32Arrays of 3, 4, 1 and 1 an instance: stems and their blades).
 * Each stem is rooted on the bed under a point of its clump's disc, tried
 * again nearer the centre while the water there is deeper than
 * DEEPEST_ROOT or the point is on land; its blades root a few centimetres
 * from it.
 */
export function placeStems(beds = BEDS, seed = REED_SEED) {
  const random = sequence(seed);
  const roots = []; const shapes = []; const tints = []; const kinds = [];
  const place = (x, y, z, height, leanDirection, lean, kind, tint) => {
    roots.push(x, y, z);
    shapes.push(height, leanDirection, lean, random() * 2 * Math.PI);
    tints.push(tint);
    kinds.push(kind);
  };
  for (const bed of beds) {
    for (let stem = 0; stem < bed.count; stem++) {
      let x = bed.x; let z = bed.z; let depth = floorDepthAt(x, z);
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = random() * 2 * Math.PI;
        const reach = bed.spread * Math.sqrt(random()) * (1 - attempt / 8);
        x = bed.x + Math.cos(angle) * reach;
        z = bed.z + Math.sin(angle) * reach;
        depth = floorDepthAt(x, z);
        if (depth > 0.05 && depth <= DEEPEST_ROOT) break;
      }
      const height = bed.heights[0] + (bed.heights[1] - bed.heights[0]) * random();
      const tint = random();
      place(x, -depth, z, height, random() * 2 * Math.PI, OWN_LEAN * random() * random(), random() < HEAD_SHARE ? KIND_HEAD : KIND_STEM, tint);
      const blades = Math.floor(BLADES_PER_STEM) + (random() < BLADES_PER_STEM % 1 ? 1 : 0);
      for (let blade = 0; blade < blades; blade++) {
        const angle = random() * 2 * Math.PI;
        const bladeX = x + Math.cos(angle) * 0.03; const bladeZ = z + Math.sin(angle) * 0.03;
        const bladeHeight = height * (BLADE_HEIGHT[0] + (BLADE_HEIGHT[1] - BLADE_HEIGHT[0]) * random());   // above the water, as the stem's
        place(bladeX, -floorDepthAt(bladeX, bladeZ), bladeZ, bladeHeight, angle, BLADE_DROOP[0] + (BLADE_DROOP[1] - BLADE_DROOP[0]) * random(), KIND_BLADE, tint * 0.7);
      }
    }
  }
  return { roots: new Float32Array(roots), shapes: new Float32Array(shapes), tints: new Float32Array(tints), kinds: new Float32Array(kinds), count: kinds.length };
}

function ribbonGeometry(stems) {
  const geometry = new THREE.InstancedBufferGeometry();
  const rows = REED_SEGMENTS + 1;
  const positions = new Float32Array(rows * 2 * 3);
  const indices = [];
  for (let row = 0; row < rows; row++) {
    const along = row / REED_SEGMENTS;
    positions.set([-1, along, 0, 1, along, 0], row * 6);
    if (row < REED_SEGMENTS) {
      const base = row * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('instanceRoot', new THREE.InstancedBufferAttribute(stems.roots, 3));
  geometry.setAttribute('instanceShape', new THREE.InstancedBufferAttribute(stems.shapes, 4));
  geometry.setAttribute('instanceTint', new THREE.InstancedBufferAttribute(stems.tints, 1));
  geometry.setAttribute('instanceKind', new THREE.InstancedBufferAttribute(stems.kinds, 1));
  geometry.instanceCount = stems.count;
  return geometry;
}

/**
 * The reed beds: `above` for the main scene (put it on the mirror layer too),
 * `below` for the under-water pass. setWind takes the Wind control's
 * strength, update the world time (s).
 */
export class Reeds {
  constructor({ lighting, ambientWaves, mirrorLayer = null, beds = BEDS }) {
    this.stems = placeStems(beds);
    this.geometry = ribbonGeometry(this.stems);
    this.uniforms = {
      uWindStrength: { value: 1 },
      uTime: { value: 0 },
      uPixelsHigh: { value: 1000 },
      uSunDir: { value: lighting.sunDirection },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSkyAmbient: { value: lighting.skyAmbient },
      uExtinction: { value: lighting.extinction },
      uWaterColor: { value: lighting.waterColor },
    };
    const material = (clipNormalY) => new THREE.ShaderMaterial({
      vertexShader: REED_VERTEX,
      fragmentShader: REED_FRAGMENT,
      uniforms: { ...this.uniforms, ...ambientWaves.uniforms(), uSeenThroughWater: { value: clipNormalY < 0 ? 1 : 0 } },
      side: THREE.DoubleSide,
      clipping: true,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, clipNormalY, 0), 0)],
    });
    this.above = new THREE.Mesh(this.geometry, material(1));
    this.below = new THREE.Mesh(this.geometry, material(-1));
    for (const mesh of [this.above, this.below]) mesh.frustumCulled = false;
    if (mirrorLayer !== null) this.above.layers.enable(mirrorLayer);
  }

  /** The Wind control's strength (WIND_STRENGTHS in src/ambientWaves.js). */
  setWind(strength) { this.uniforms.uWindStrength.value = strength; }

  /** The world time (s), for the sway. */
  update(time) { this.uniforms.uTime.value = time; }

  /** The frame's height in device pixels, for the least width a stem is drawn at. */
  resize(pixelsHigh) { this.uniforms.uPixelsHigh.value = pixelsHigh; }

  set visible(shown) { this.above.visible = this.below.visible = shown; }
  get visible() { return this.above.visible; }

  dispose() {
    this.geometry.dispose();
    this.above.material.dispose();
    this.below.material.dispose();
  }
}
