// The fish drawn (src/fish.js swims them): for each kind in the place's
// water an instanced body, an instanced set of fins and an instanced shadow
// on the bed, all in the under-water pass (src/main.js sceneUnder), so the
// water shows them through its surface as it shows the bed, refracted and
// fading with the water crossed. A kind is three draw calls however many of
// it there are, and every kind shares three programs (FISH_VERTEX and
// FISH_FRAGMENT, the fins' with FIN defined, and the shadow's), its kind's
// look in uniforms.
//
// A kind's body (fishBody) is a unit long, nose at +x: cross-sections from
// the snout to the tail's root, each a rounded oval as deep as the back
// (above the middle) and the belly (below) are there and as wide as the
// flanks, from the kind's `shape` (src/fish.js): its depth and width, where
// it is deepest (`peak`), how pointed its snout (`snout`: a koi's blunt, a
// pike's long), narrowing to a slender tail root. Its fins (fishFins) are
// membranes, each a grid so it can bend: the tail, forked or rounded
// (`fork`) and as tall as `tail`; one or two dorsal fins, a trout's small
// adipose fin, the anal fin, along the body where `shape` puts them and as
// high; and the pectoral and pelvic fins in pairs, set out from the body.
// Each vertex carries `finInfo`: which part it is, and where on it (along
// and around the body, or along a fin's root and out to its edge).
//
// Each fish is its instance's matrix (where it is, its heading and pitch,
// its length) and its `swim`: its tail's phase, how hard it beats, how its
// body bends into a turn and the seed of its markings. The vertex shader
// swims it: a wave runs back along the body, its amplitude growing toward
// the tail (carangiform swimming: the front third barely moves, the tail
// sweeps about a tenth of the body length either side), the tail fin lags
// it a little, a turn bends it into a C and banks it, the paired fins row
// slowly (faster as it hangs still, which is how a fish holds itself) and
// the median fins ripple. Then it is drawn where the still surface shows it
// (SEEN_THROUGH_WATER, as the stones under the water), or, from an eye under
// the water, where it is, fading into the water's colour with the distance.
//
// Its look (FISH_FRAGMENT) is worked out per pixel: its markings
// (fishMarkings, by `uPattern`, FISH_PATTERNS) from where on the body it is
// and its seed, countershaded (dark backed, pale bellied) as wild fish are,
// a perch's bars, a trout's spots, a pike's pale beans, a char's red belly,
// a pupfish male's blue, a koi's variety (Kohaku, Sanke, Showa, Ogon,
// Chagoi, Asagi, Yamabuki, Tancho) and its patches; then its scales, rows of
// overlapping arcs (`scales` along it) whose edges darken and whose faces
// catch the light each a little differently, faded out before they are
// finer than a pixel; its lateral line, its gill cover's edge, its eye (a
// dark pupil in a gold ring, with a glint) and its mouth. It is lit as the
// bed is (the sun refracted into the water and dimmed on its way down, and
// the sky's light, less under its belly), with its wet skin's highlight
// (the refracted sun's, Blinn–Phong) and, on a silvery kind's flanks, the
// light from above mirrored (`sheen`: their scales are mirrors, Denton
// 1970), scale by scale. The fins are thin: drawn see-through over what
// lies behind them (more at their edges), with their rays, and lit from
// either side, the sun glowing through them.
//
// A fish's shadow (FISH_SHADOW_*): sunlight it blocks falls on the bed down-
// sun of it along the refracted sun, as far as tan θt times its height over
// the bed, a soft oval its own length, the softer and fainter the higher it
// swims (the sun's disc and the ripples blur it); the bed's light is
// multiplied by it, its sunlit share only (the sky's light still reaches
// under it). The pool's basin is drawn where the surface shows it, so its
// shadows are too; the lake's bed on the straight line, and its shadows.
import * as THREE from 'three';
import { SEEN_THROUGH_WATER } from './shaders/scene.js';
import { FISH_SPECIES } from './fish.js';

export const FISH_PATTERNS = ['minnow', 'perch', 'pike', 'trout', 'char', 'bass', 'bluegill', 'tilapia', 'pupfish', 'mullet', 'wrasse', 'koi', 'goldfish'];
const RINGS = 30;        // the body's cross-sections, snout to tail root
const AROUND = 20;       // and the points round each
const BODY_END = 0.8;    // the tail's root, as a share of the length from the nose
// The caudal peduncle's end (fishBody): `rings` more sections over `reach` (body lengths) past the tail root, flattening
// to a keel `edge` (body lengths) thick as deep as the tail fin's root, which it reaches into.
const PEDUNCLE = { rings: 3, reach: 0.03, edge: 0.004 };
const PART = { body: 0, tail: 1, dorsal: 2, pectoral: 3, pelvic: 4, anal: 5 };
const SHADOW = { darkest: 0.85, blur: 0.025, spread: 0.25 };   // the shadow's share of the sunlight at most, its blur per metre over the bed (m/m), and how far its strength falls per metre up

/** A share of the greatest depth or width along the body (`along` 0 at the snout to 1 at the tail root): rising as a snout of `power` to `peak`, falling to `root` at the tail. */
function profile(along, peak, power, root) {
  if (along < peak) return Math.pow(Math.sin(0.5 * Math.PI * along / peak), power);
  const fall = (along - peak) / (1 - peak);
  return root + (1 - root) * (1 - fall) * (1 - 0.35 * fall * (1 - fall)) * Math.cos(0.25 * Math.PI * fall);
}
/** The body's half-depth above (back) and below (belly) and half-width at `along`, in body lengths. */
function sectionAt(shape, along) {
  const snout = shape.snout ?? 0.7, peak = shape.peak ?? 0.38;
  return {
    back: 0.5 * shape.depth * profile(along, peak, 0.5 + 0.4 * snout, 0.3),
    belly: 0.5 * shape.depth * 0.85 * profile(along, Math.min(peak + 0.1, 0.6), 0.65 + 0.35 * snout, 0.3),
    side: 0.5 * shape.width * profile(along, peak - 0.08, 0.4 + 0.3 * snout, 0.14),
  };
}

function geometryOf({ positions, normals, infos, indices }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('finInfo', new THREE.Float32BufferAttribute(infos, 4));
  geometry.setIndex(indices);
  return geometry;
}

/** A kind's body, a unit long (the header): finInfo (0, along 0 to 1 snout to tail root, round 0 at the back to 1 at the belly, side). */
export function fishBody(shape) {
  const parts = { positions: [], normals: [], infos: [], indices: [] };
  // The snout's tip, then the rings, closer together at either end.
  parts.positions.push(0.5, 0, 0); parts.normals.push(1, 0, 0); parts.infos.push(PART.body, 0, 0.5, 0);
  for (let ring = 1; ring <= RINGS; ring++) {
    const along = 0.5 - 0.5 * Math.cos(Math.PI * ring / RINGS);
    const { back, belly, side } = sectionAt(shape, along);
    const x = 0.5 - along * BODY_END;
    for (let point = 0; point < AROUND; point++) {
      const angle = (point / AROUND) * Math.PI * 2;
      const up = Math.cos(angle), across = Math.sin(angle);
      // A rounded oval, fuller than an ellipse at the flanks.
      const y = (up > 0 ? back : belly) * Math.sign(up) * Math.pow(Math.abs(up), 0.85);
      const z = side * Math.sign(across) * Math.pow(Math.abs(across), 0.8);
      parts.positions.push(x, y, z); parts.normals.push(0, 0, 0);
      parts.infos.push(PART.body, along, Math.acos(Math.max(-1, Math.min(1, up))) / Math.PI, Math.sign(across));
    }
  }
  // The caudal peduncle closed into the tail: past the tail root the body flattens to a thin keel as deep as the tail
  // fin's root (PEDUNCLE), reaching into the fin, so no opening shows between body and tail.
  const end = sectionAt(shape, 1), rootHalf = end.back * 1.1;
  for (let ring = 1; ring <= PEDUNCLE.rings; ring++) {
    const share = ring / PEDUNCLE.rings;
    const x = 0.5 - BODY_END - share * PEDUNCLE.reach;
    const back = THREE.MathUtils.lerp(end.back, rootHalf, share), belly = THREE.MathUtils.lerp(end.belly, rootHalf, share);
    const side = end.side * (1 - share) + PEDUNCLE.edge * share;
    for (let point = 0; point < AROUND; point++) {
      const angle = (point / AROUND) * Math.PI * 2;
      const up = Math.cos(angle), across = Math.sin(angle);
      const y = (up > 0 ? back : belly) * Math.sign(up) * Math.pow(Math.abs(up), 0.85 - 0.5 * share);
      const z = side * Math.sign(across) * Math.pow(Math.abs(across), 0.8);
      parts.positions.push(x, y, z); parts.normals.push(0, 0, 0);
      parts.infos.push(PART.body, 1, Math.acos(Math.max(-1, Math.min(1, up))) / Math.PI, Math.sign(across));
    }
  }
  // Its end sealed to a point on the keel's middle.
  const last = parts.positions.length / 3;
  parts.positions.push(0.5 - BODY_END - PEDUNCLE.reach - 0.002, 0, 0); parts.normals.push(-1, 0, 0); parts.infos.push(PART.body, 1, 0.5, 0);
  const rings = RINGS + PEDUNCLE.rings;
  for (let point = 0; point < AROUND; point++) parts.indices.push(last, 1 + (rings - 1) * AROUND + (point + 1) % AROUND, 1 + (rings - 1) * AROUND + point);
  for (let point = 0; point < AROUND; point++) parts.indices.push(0, 1 + point, 1 + (point + 1) % AROUND);
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let point = 0; point < AROUND; point++) {
      const here = 1 + ring * AROUND + point, next = 1 + ring * AROUND + (point + 1) % AROUND;
      parts.indices.push(here, here + AROUND, next, next, here + AROUND, next + AROUND);
    }
  }
  const geometry = geometryOf(parts);
  geometry.computeVertexNormals();
  geometry.attributes.normal.setXYZ(0, 1, 0, 0);
  return geometry;
}

/** A kind's fins, a unit long fish's (the header): finInfo (part, along its root 0 to 1, out to its edge 0 to 1, side). */
export function fishFins(shape) {
  const parts = { positions: [], normals: [], infos: [], indices: [] };
  // A membrane: a grid over (along, out) of points at(along, out), its normal fixed.
  const membrane = (part, side, columns, rows, at, normal) => {
    const first = parts.positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const along = column / columns, out = row / rows;
        parts.positions.push(...at(along, out)); parts.normals.push(...normal); parts.infos.push(part, along, out, side);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const here = first + row * (columns + 1) + column;
        parts.indices.push(here, here + 1, here + columns + 1, here + 1, here + columns + 2, here + columns + 1);
      }
    }
  };
  const xAt = (along) => 0.5 - along * BODY_END;
  // The tail: its root the body's end, its edge the fork (`fork` > 0) or a round (< 0); `along` is up it, -1 to 1.
  const tailRoot = 0.5 - BODY_END - 0.012, reach = tailRoot + 0.5, spread = shape.tail / 2;   // its root inside the peduncle's keel
  const rootHalf = sectionAt(shape, 1).back * 1.1;
  membrane(PART.tail, 0, 12, 5, (along, out) => {
    const span = 2 * along - 1;
    const length = reach * (1 - (shape.fork ?? 0.2) * Math.pow(1 - Math.abs(span), 1.6) * 0.75);
    const height = THREE.MathUtils.lerp(rootHalf, spread, Math.pow(out, 0.8)) * span;
    return [tailRoot - out * length, height, 0];
  }, [0, 0, 1]);
  // The median fins along the back and the belly: [from, to, height] along the body.
  const median = (part, [from, to, height], down) => {
    membrane(part, 0, 8, 4, (along, out) => {
      const at = THREE.MathUtils.lerp(from, to, along);
      const section = sectionAt(shape, at);
      const root = down ? -section.belly * 0.92 : section.back * 0.92;
      // Its leading rays longest, its top edge arched and rounded off at either end.
      const tall = height * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * along)), 0.55) * (1 - 0.45 * along) * (0.6 + 0.4 * Math.pow(Math.sin(Math.PI * Math.min(along * 2.2, 1) * 0.5), 0.5));
      return [xAt(at) - out * tall * 0.45, root + (down ? -1 : 1) * out * tall, 0];
    }, [0, 0, 1]);
  };
  median(PART.dorsal, shape.dorsal, false);
  if (shape.dorsal2) median(PART.dorsal, shape.dorsal2, false);
  if (shape.adipose) median(PART.dorsal, shape.adipose, false);
  median(PART.anal, shape.anal, true);
  // The paired fins: set out from the body, back and down, tapering.
  const paired = (part, at, length, height, direction) => {
    for (const side of [1, -1]) {
      const section = sectionAt(shape, at);
      const heading = new THREE.Vector3(direction[0], direction[1], direction[2] * side).normalize();
      const chord = new THREE.Vector3(-1, 0, 0);
      const normal = new THREE.Vector3().crossVectors(chord, heading).normalize().multiplyScalar(side);
      membrane(part, side, 4, 4, (along, out) => {
        const rootX = xAt(at) - along * length * 0.35;
        const rootY = height * section.belly, rootZ = side * section.side * (part === PART.pectoral ? 0.85 : 0.35);
        const outward = out * length * (1 - 0.45 * along);
        return [rootX + heading.x * outward, rootY + heading.y * outward, rootZ + heading.z * outward];
      }, normal.toArray());
    }
  };
  paired(PART.pectoral, 0.2, shape.pectoral, -0.35, [-0.75, -0.3, 0.6]);
  paired(PART.pelvic, 0.46, shape.pelvic, -0.85, [-0.8, -0.5, 0.3]);
  return geometryOf(parts);
}

// The swimming (the header), shared by the body and the fins.
export const FISH_VERTEX = /* glsl */`
attribute vec4 finInfo;     // its part (PART), and where on it
attribute vec4 swim;        // its tail's phase, how hard it beats (0 to 1), its bend into a turn (-1 to 1), its markings' seed
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vInfo;
varying float vSeed;
${SEEN_THROUGH_WATER}
void main() {
  vec3 bodyPoint = position;
  vec3 bodyNormal = normal;
  float part = finInfo.x;
  float along = clamp(0.5 - position.x, 0.0, 1.0);   // 0 at the nose to 1 at the tail's tip
  // The paired fins row, and the median fins ripple, before the body's wave carries them.
  float span = finInfo.z;
  if (part > 2.5 && part < 4.5) {
    float row = (0.25 + 0.2 * (1.0 - swim.y)) * sin(swim.x * 0.45 + finInfo.y * 1.5 + (part > 3.5 ? 1.7 : 0.0)) * span;
    bodyPoint += bodyNormal * row * 0.12 + vec3(-0.02 * row, 0.0, 0.0);
  } else if (part > 1.5) {
    bodyPoint.z += 0.012 * span * sin(swim.x * 1.3 - finInfo.y * 5.0);
  }
  // The wave back along the body, and the C of a turn (the tail fin lags the wave a little toward its edge).
  float amplitude0 = 0.06 + 0.06 * swim.y;
  float envelope = 0.03 + 0.97 * along * along;
  float lag = part > 0.5 && part < 1.5 ? 0.6 * span : 0.0;
  float wave = swim.x - 5.5 * along - lag;
  float sway = amplitude0 * envelope * sin(wave) + swim.z * 0.16 * (along - 0.35) * (along - 0.35);
  float slope = -(amplitude0 * envelope * cos(wave) * -5.5 + amplitude0 * 1.94 * along * sin(wave) + swim.z * 0.32 * (along - 0.35));
  bodyPoint.z += sway;
  bodyNormal = normalize(vec3(bodyNormal.x - slope * bodyNormal.z, bodyNormal.y, bodyNormal.z));
  // Banked into a turn.
  float bank = -0.25 * swim.z;
  bodyPoint.yz = mat2(cos(bank), sin(bank), -sin(bank), cos(bank)) * bodyPoint.yz;
  bodyNormal.yz = mat2(cos(bank), sin(bank), -sin(bank), cos(bank)) * bodyNormal.yz;
  vLocal = position;
  vInfo = finInfo;
  vSeed = swim.w;
  vec4 world = modelMatrix * instanceMatrix * vec4(bodyPoint, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * bodyNormal);
  gl_Position = projectionMatrix * viewMatrix * vec4(seenThroughWater(world.xyz, 0.0), 1.0);
}
`;

export const FISH_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uAbsorb;
uniform vec3 uFogExtinction;
uniform vec3 uFogColor;
uniform float uPattern;     // FISH_PATTERNS' index
uniform float uBodyDepth;   // its body's depth, a share of its length
uniform float uScales;      // its scales along it
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vInfo;
varying float vSeed;
#define WATER_INDEX 1.333
#define SKY_LIGHT 1.4
float fishHash(vec2 point) {
  vec3 mixed = fract(vec3(point.xyx) * 0.1031);
  mixed += dot(mixed, mixed.yzx + 33.33);
  return fract((mixed.x + mixed.y) * mixed.z);
}
float fishNoise(vec2 point) {
  vec2 cell = floor(point), within = fract(point);
  vec2 eased = within * within * (3.0 - 2.0 * within);
  return mix(mix(fishHash(cell), fishHash(cell + vec2(1.0, 0.0)), eased.x), mix(fishHash(cell + vec2(0.0, 1.0)), fishHash(cell + vec2(1.0, 1.0)), eased.x), eased.y);
}
// Round spots on a jittered grid (cells across, the spot's share of a cell): 1 in a spot, 0 between.
float fishSpots(vec2 point, float size, float seed) {
  vec2 cell = floor(point);
  vec2 centre = cell + 0.25 + 0.5 * vec2(fishHash(cell + seed), fishHash(cell + seed + 17.0));
  float keep = step(0.35, fishHash(cell + seed + 41.0));
  float blur = max(fwidth(point.x), fwidth(point.y));
  return keep * (1.0 - smoothstep(size * 0.7 - blur, size + blur, length(point - centre)));
}
// Its markings on the body (the header): along (nose 0 to tail 1), height (belly -1 to back 1), around (0 the back
// to pi the belly); and how much its flank mirrors the light from above.
vec3 fishMarkings(float along, float height, float around, out float sheen) {
  float back = smoothstep(-0.35, 0.65, height);
  vec2 flank = vec2(along * 18.0, height * 3.0);
  int kind = int(uPattern + 0.5);
  vec3 color;
  sheen = 0.15;
  if (kind == 0) {          // minnow: olive back, silver flank, a dark stripe along it
    color = mix(vec3(0.72, 0.70, 0.62), vec3(0.20, 0.22, 0.12), back);
    color = mix(color, vec3(0.10, 0.10, 0.07), (1.0 - smoothstep(0.06, 0.18, abs(height - 0.05))) * smoothstep(0.15, 0.3, along) * (0.6 + 0.4 * fishNoise(flank)));
    sheen = 0.55;
  } else if (kind == 1) {   // perch: green-gold, dark bars
    color = mix(vec3(0.66, 0.62, 0.48), mix(vec3(0.42, 0.40, 0.18), vec3(0.14, 0.16, 0.08), smoothstep(0.3, 0.9, height)), smoothstep(-0.6, 0.0, height));
    float bar = smoothstep(0.0, 0.9, sin(along * 40.0 + 1.0 + 1.2 * fishNoise(flank * 0.5 + vSeed * 7.0) + 0.8 * height)) * smoothstep(0.12, 0.2, along) * (1.0 - smoothstep(0.68, 0.78, along)) * smoothstep(-0.5, 0.4, height);
    color = mix(color, vec3(0.08, 0.09, 0.05), 0.6 * bar);
  } else if (kind == 2) {   // pike: olive, rows of pale beans, a yellowish belly
    color = mix(vec3(0.62, 0.60, 0.42), mix(vec3(0.28, 0.34, 0.12), vec3(0.10, 0.14, 0.05), smoothstep(0.4, 1.0, height)), smoothstep(-0.7, -0.1, height));
    color = mix(color, vec3(0.58, 0.58, 0.34), 0.8 * fishSpots(vec2(along * 26.0, height * 5.0 + along * 3.0), 0.32, 3.0) * smoothstep(-0.6, -0.1, height) * (1.0 - smoothstep(0.5, 0.8, height)));
  } else if (kind == 3) {   // brown trout: golden, black spots above, a few red ones
    color = mix(vec3(0.78, 0.70, 0.50), mix(vec3(0.56, 0.42, 0.18), vec3(0.22, 0.18, 0.08), smoothstep(0.3, 1.0, height)), smoothstep(-0.7, -0.1, height));
    color = mix(color, vec3(0.05, 0.04, 0.03), fishSpots(vec2(along * 22.0, height * 5.0), 0.22, 7.0) * smoothstep(-0.3, 0.2, height));
    float red = fishSpots(vec2(along * 14.0, height * 3.0 + 0.5), 0.2, 19.0) * (1.0 - smoothstep(0.1, 0.5, abs(height + 0.05)));
    color = mix(color, vec3(0.70, 0.12, 0.05), red);
    sheen = 0.25;
  } else if (kind == 4) {   // Arctic char: dark back with pale spots, an orange-red belly
    color = mix(vec3(0.72, 0.26, 0.08), mix(vec3(0.24, 0.26, 0.20), vec3(0.10, 0.13, 0.11), smoothstep(0.2, 0.9, height)), smoothstep(-0.65, -0.15, height));
    color = mix(color, vec3(0.75, 0.68, 0.55), 0.7 * fishSpots(vec2(along * 20.0, height * 4.0), 0.22, 11.0) * smoothstep(-0.2, 0.2, height));
  } else if (kind == 5) {   // largemouth bass: green, a dark blotched band along the flank, white belly
    color = mix(vec3(0.76, 0.76, 0.66), mix(vec3(0.38, 0.42, 0.20), vec3(0.14, 0.19, 0.08), smoothstep(0.35, 1.0, height)), smoothstep(-0.55, -0.05, height));
    color = mix(color, vec3(0.08, 0.10, 0.05), 0.8 * (1.0 - smoothstep(0.1, 0.28, abs(height - 0.02 + 0.15 * fishNoise(flank * 0.4)))) * smoothstep(0.1, 0.2, along));
  } else if (kind == 6) {   // bluegill: olive, faint bars, an orange breast, the dark ear flap
    color = mix(vec3(0.62, 0.46, 0.14), mix(vec3(0.24, 0.30, 0.22), vec3(0.11, 0.15, 0.12), smoothstep(0.3, 1.0, height)), smoothstep(-0.55, -0.1, height) * smoothstep(0.2, 0.42, along) + smoothstep(-0.2, 0.3, height) * (1.0 - smoothstep(0.2, 0.42, along)));
    color = mix(color, color * 0.55, smoothstep(0.4, 0.9, sin(along * 34.0)) * smoothstep(0.15, 0.3, along) * (1.0 - smoothstep(0.7, 0.8, along)));
    color = mix(color, vec3(0.03, 0.04, 0.06), 1.0 - smoothstep(0.03, 0.045, length(vec2(along - 0.25, (height - 0.2) * uBodyDepth * 0.5))));
    sheen = 0.25;
  } else if (kind == 7) {   // tilapia: grey-olive, faint bars, a bluish sheen
    color = mix(vec3(0.62, 0.62, 0.56), mix(vec3(0.32, 0.34, 0.30), vec3(0.16, 0.18, 0.16), smoothstep(0.3, 1.0, height)), smoothstep(-0.6, -0.1, height));
    color = mix(color, color * 0.7, smoothstep(0.5, 0.95, sin(along * 32.0)) * smoothstep(0.15, 0.25, along) * (1.0 - smoothstep(0.7, 0.8, along)));
    sheen = 0.3;
  } else if (kind == 8) {   // pupfish: a male blue with a black band at its tail, a female brown with bars
    if (vSeed < 0.5) {
      color = mix(vec3(0.42, 0.55, 0.78), vec3(0.10, 0.22, 0.62), back);
      sheen = 0.45;
    } else {
      color = mix(vec3(0.62, 0.56, 0.42), vec3(0.30, 0.25, 0.15), back);
      color = mix(color, color * 0.55, smoothstep(0.5, 0.9, sin(along * 40.0)) * smoothstep(0.2, 0.3, along));
    }
  } else if (kind == 9) {   // grey mullet: blue-grey back, silver with thin dark stripes, white belly
    color = mix(vec3(0.80, 0.80, 0.78), mix(vec3(0.52, 0.55, 0.56), vec3(0.16, 0.20, 0.24), smoothstep(0.2, 0.9, height)), smoothstep(-0.6, -0.1, height));
    color = mix(color, color * 0.6, smoothstep(0.75, 0.95, sin(height * 22.0)) * smoothstep(-0.3, 0.1, height) * (1.0 - smoothstep(0.3, 1.2, fwidth(height * 22.0))));
    sheen = 0.65;
  } else if (kind == 10) {  // ballan wrasse: mottled green and brown, pale specks
    color = mix(vec3(0.30, 0.34, 0.14), vec3(0.42, 0.24, 0.12), fishNoise(flank * 0.6 + vSeed * 9.0));
    color *= mix(0.7, 1.0, 1.0 - back * 0.5);
    color = mix(color, vec3(0.72, 0.70, 0.55), 0.6 * fishSpots(vec2(along * 30.0, height * 6.0), 0.18, 23.0));
  } else if (kind == 11) {  // koi: its variety from its seed (the header), patches its own
    sheen = 0.06;   // matte skin, but the metallic Ogon's and Yamabuki's
    float variety = floor(vSeed * 8.0);
    vec2 patchPoint = vec2(along * 3.6, around * 1.1) + vSeed * vec2(37.0, 11.0);
    float patchNoise = fishNoise(patchPoint) * 0.7 + fishNoise(patchPoint * 2.3) * 0.3;
    float patchBlur = fwidth(patchNoise) + 0.01;
    float patches = smoothstep(0.45 - patchBlur, 0.45 + patchBlur, patchNoise) * (1.0 - smoothstep(1.7, 2.1, around));
    float smallNoise = fishNoise(patchPoint * 2.6 + 5.0);
    float small = smoothstep(0.66 - fwidth(smallNoise) - 0.01, 0.66 + fwidth(smallNoise) + 0.01, smallNoise) * (1.0 - smoothstep(1.4, 1.9, around));
    vec3 white = vec3(0.82, 0.80, 0.74), red = vec3(0.72, 0.17, 0.05), black = vec3(0.03, 0.03, 0.035);
    if (variety < 1.0) color = mix(white, red, patches);                                    // Kohaku
    else if (variety < 2.0) color = mix(mix(white, red, patches), black, small * 0.95);      // Sanke
    else if (variety < 3.0) color = mix(mix(black, red, patches), white, smoothstep(0.55, 0.65, fishNoise(patchPoint * 1.7 + 3.0)) * (1.0 - patches));   // Showa
    else if (variety < 4.0) { color = vec3(0.86, 0.62, 0.16); sheen = 0.8; }                  // Ogon
    else if (variety < 5.0) color = vec3(0.36, 0.25, 0.13) * (0.85 + 0.3 * fishNoise(flank * 1.4));   // Chagoi
    else if (variety < 6.0) color = mix(vec3(0.40, 0.50, 0.60), vec3(0.72, 0.28, 0.10), smoothstep(1.4, 2.0, around) * smoothstep(0.16, 0.3, along));   // Asagi (its net is its scales')
    else if (variety < 7.0) { color = vec3(0.88, 0.74, 0.22); sheen = 0.7; }                // Yamabuki
    else color = mix(white, red, 1.0 - smoothstep(0.045, 0.06, length(vec2(along - 0.12, around * 0.07))));   // Tancho
  } else {                  // goldfish: orange-gold, some with white
    color = mix(vec3(0.92, 0.42, 0.06), vec3(0.88, 0.86, 0.80), step(0.7, vSeed) * smoothstep(0.45, 0.6, fishNoise(vec2(along * 4.0, around * 1.3) + vSeed * 20.0)));
    sheen = 0.45;
  }
  // Countershaded: a wild fish's back darker still, so from above it melts into the deep (bred koi and goldfish not);
  // and a wild fish's colours are muted, each fish a little its own.
  if (kind < 11) {
    color *= mix(1.0, 0.55, smoothstep(0.2, 0.9, height));
    color = mix(vec3(dot(color, vec3(0.3, 0.59, 0.11))), color, 0.72) * (0.9 + 0.2 * vSeed);
  }
  // Mottled a little over the body, as skin and its mucus are.
  color *= 0.9 + 0.2 * fishNoise(vec2(along * 9.0, around * 3.0) + vSeed * 31.0);
  return color;
}
// A fin's colour at its root and its edge, by kind (FIN_PART: tail 1, dorsal 2, pectoral 3, pelvic 4, anal 5).
vec3 finColor(float part, float edge) {
  int kind = int(uPattern + 0.5);
  bool lower = part > 2.5;   // the paired and the anal fins
  if (kind == 0) return vec3(0.45, 0.42, 0.32);
  if (kind == 1) return lower || part < 1.5 ? vec3(0.70, 0.24, 0.06) : vec3(0.22, 0.24, 0.16);
  if (kind == 2) return vec3(0.42, 0.34, 0.16);
  if (kind == 3) return vec3(0.46, 0.38, 0.22);
  if (kind == 4) return lower ? mix(vec3(0.70, 0.26, 0.08), vec3(0.9), step(0.75, vInfo.y)) : vec3(0.22, 0.24, 0.20);
  if (kind == 5) return vec3(0.30, 0.34, 0.20);
  if (kind == 6) return vec3(0.26, 0.30, 0.26);
  if (kind == 7) return vec3(0.40, 0.40, 0.42);
  if (kind == 8) return vSeed < 0.5 ? mix(vec3(0.30, 0.42, 0.75), vec3(0.03), step(0.7, edge) * step(part, 1.5)) : vec3(0.48, 0.44, 0.34);
  if (kind == 9) return vec3(0.45, 0.48, 0.50);
  if (kind == 10) return vec3(0.36, 0.30, 0.14);
  if (kind == 11) {
    float variety = floor(vSeed * 8.0);
    vec3 base = variety > 2.5 && variety < 3.5 ? vec3(0.86, 0.62, 0.16) : variety > 5.5 && variety < 6.5 ? vec3(0.88, 0.74, 0.22) : variety > 3.5 && variety < 4.5 ? vec3(0.36, 0.25, 0.13) : vec3(0.88, 0.86, 0.82);
    // A Showa's pectorals black at their roots.
    if (variety > 1.5 && variety < 2.5 && part > 2.5 && part < 3.5) base = mix(vec3(0.02), base, smoothstep(0.2, 0.5, edge));
    return base;
  }
  return vec3(0.95, 0.55, 0.20);
}
void main() {
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 toEye = normalize(cameraPosition - vWorld);
  float sheen = 0.0;
  vec3 albedo;
  float alpha = 1.0;
  float specular = 0.25;
#ifdef FIN
  // A fin: its rays out from its root, the membrane between thin and clear, its edge clearest (the header).
  float part = vInfo.x, edge = vInfo.z;
  float rays = (part > 0.5 && part < 1.5 ? 18.0 : 10.0) * vInfo.y;
  float rayBlur = fwidth(rays) * 1.5 + 0.02;
  float ray = 1.0 - smoothstep(0.08 - rayBlur, 0.22 + rayBlur, abs(fract(rays) - 0.5));
  ray *= 1.0 - smoothstep(0.4, 1.0, rayBlur);
  albedo = finColor(part, edge) * mix(1.0, 0.7, ray);
  alpha = mix(0.75, 0.3, smoothstep(0.35, 1.0, edge)) + 0.2 * ray;
  // Seen edge on it shows as a line of its own colour, not of what is behind it.
  alpha = min(alpha * mix(1.0, 2.2, pow(1.0 - abs(dot(normalize(vNormal), toEye)), 3.0)), 0.95);
  // Its frayed edge.
  alpha *= 1.0 - smoothstep(0.92, 1.0, edge + 0.05 * fishNoise(vec2(vInfo.y * 30.0, vSeed * 50.0)));
  specular = 0.1;
#else
  float along = vInfo.y * 0.8;   // nose 0 to the tail's root 0.8, as the markings take it
  float around = vInfo.z * 3.14159265;
  float height = cos(around);
  albedo = fishMarkings(along, height, around, sheen);
  // The scales: overlapping discs in staggered columns, each over the one behind it (the header), so each shows as a
  // crescent with its rear edge dark; each face its own tilt.
  vec2 scalePoint = vec2(vInfo.y * uScales, vInfo.z * uScales * uBodyDepth * 1.4);
  float scaleBlur = max(fwidth(scalePoint.x), fwidth(scalePoint.y));
  vec2 scaleId = vec2(0.0);
  float scaleDistance = 1.0;
  for (int column = 1; column >= -1; column--) {
    float x = floor(scalePoint.x) + float(column);
    float row = floor(scalePoint.y - 0.5 * mod(x, 2.0) + 0.5);
    vec2 centre = vec2(x + 0.5, row + 0.5 * mod(x, 2.0));
    float apart = length((scalePoint - centre) * vec2(0.85, 1.0));
    if (apart < 0.78) { scaleDistance = apart / 0.78; scaleId = vec2(x, row); }
  }
  float scaleShown = (1.0 - smoothstep(0.25, 0.6, scaleBlur)) * smoothstep(0.08, 0.16, vInfo.y) * (1.0 - smoothstep(0.92, 0.99, vInfo.y));
  float rim = smoothstep(0.78 - scaleBlur, 0.95, scaleDistance);
  float tilt = fishHash(scaleId + vSeed * 13.0);
  albedo *= 1.0 - scaleShown * (0.14 * rim + 0.08 * (tilt - 0.5) - 0.04 * (1.0 - scaleDistance));
  // An Asagi's net: its scales' edges pale.
  if (int(uPattern + 0.5) == 11 && floor(vSeed * 8.0) == 5.0) albedo = mix(albedo, vec3(0.72, 0.78, 0.82), 0.45 * rim * smoothstep(0.0, 0.3, 1.0 - scaleBlur) * (1.0 - smoothstep(1.2, 1.7, around)));
  sheen *= mix(1.0, 0.4 + 1.2 * tilt, scaleShown);
  // The lateral line, along the flank from the gill cover to the tail.
  float lineHeight = 0.12 + 0.18 * (1.0 - vInfo.y);
  float lineBlur = fwidth(height) * 1.2 + 0.005;
  albedo *= 1.0 - 0.12 * (1.0 - smoothstep(0.01 - lineBlur, 0.025 + lineBlur, abs(height - lineHeight))) * smoothstep(0.22, 0.28, vInfo.y) * (1.0 - smoothstep(0.9, 1.0, vInfo.y));
  // The gill cover's edge, a curve behind the head; the head ahead of it unscaled.
  float gill = vInfo.y - 0.2 - 0.03 * height * height;
  float gillBlur = fwidth(gill) * 1.2 + 0.002;
  albedo *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.015 + gillBlur, abs(gill))) * (1.0 - smoothstep(0.45, 0.7, abs(height)));
  // The mouth: a dark line at the snout, a little under the middle.
  albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.012, 0.025, vInfo.y)) * (1.0 - smoothstep(0.02, 0.05 + fwidth(height), abs(height + 0.15)));
  // The eye: a gold ring round a dark pupil, high on the head, with a glint.
  vec2 eyeAt = vec2((0.5 - vLocal.x) - 0.08, vLocal.y - 0.1 * uBodyDepth);
  float eyeSize = 0.018 + 0.03 * max(0.22 - uBodyDepth, 0.0);
  float eye = length(eyeAt);
  float eyeBlur = fwidth(eye) + 1e-4;
  float iris = 1.0 - smoothstep(eyeSize - eyeBlur, eyeSize + eyeBlur, eye);
  float pupil = 1.0 - smoothstep(eyeSize * 0.62 - eyeBlur, eyeSize * 0.62 + eyeBlur, eye);
  albedo = mix(albedo, mix(vec3(0.22, 0.17, 0.08), vec3(0.4, 0.33, 0.16), smoothstep(0.6, 1.0, eye / eyeSize)), iris);
  albedo = mix(albedo, vec3(0.008), pupil);
  specular = mix(0.25, 2.5, iris);
#endif
  // The light at its depth (the header): the refracted sun, dimmed on its way down, and the sky's.
  float depth = max(-vWorld.y, 0.0);
  float sunSine = length(uSunDir.xz);
  vec2 toSun = uSunDir.xz / max(sunSine, 1e-5);
  float refractedSine = sunSine / WATER_INDEX;
  float refractedCosine = sqrt(1.0 - refractedSine * refractedSine);
  vec3 refractedSun = vec3(toSun.x * refractedSine, refractedCosine, toSun.y * refractedSine);
  vec3 sunDown = uSunIrradiance * max(uSunDir.y, 0.0) * exp(-uAbsorb * depth / refractedCosine);
  vec3 skyDown = uSkyAmbient * exp(-uAbsorb * depth) * SKY_LIGHT;
  float facing = max(dot(normal, refractedSun), 0.0) / refractedCosine;
#ifdef FIN
  facing = (0.45 + 0.55 * abs(dot(normal, refractedSun))) / refractedCosine;   // a membrane, lit through from either side
#endif
  float under = 0.35 + 0.65 * smoothstep(-1.0, 0.6, normal.y);   // less of the sky reaches under its belly
  vec3 light = sunDown * facing + skyDown * (0.4 + 0.6 * under) * (0.55 + 0.45 * normal.y);
#ifdef FIN
  light += skyDown * 0.25;
#endif
  vec3 color = albedo * light;
  // Its wet skin's highlight, the refracted sun's.
  vec3 halfway = normalize(refractedSun + toEye);
  color += sunDown * specular * 0.08 * pow(max(dot(normal, halfway), 0.0), 60.0) * 22.0 / 8.0;
  // A silvery flank mirrors the light from above toward the eye (the header).
  vec3 mirrored = reflect(-toEye, normal);
  float upward = smoothstep(-0.1, 0.8, mirrored.y);
  float flankFacing = 1.0 - smoothstep(0.35, 0.85, abs(normal.y));
  color += sheen * upward * flankFacing * (skyDown * 0.6 + sunDown * pow(max(dot(mirrored, refractedSun), 0.0), 24.0) * 1.5);
#ifndef FIN
  // At its outline its skin mirrors the water about it, and the light in the water dims toward it (a body, not a cut-out).
  float grazing = pow(1.0 - max(dot(normal, toEye), 0.0), 3.0);
  color = mix(color, uFogColor * mix(0.9, 3.0, smoothstep(-0.5, 0.9, mirrored.y)), 0.55 * grazing);
#endif
  if (cameraPosition.y < 0.0) color = mix(uFogColor, color, exp(-uFogExtinction * distance(vWorld, cameraPosition)));
  gl_FragColor = vec4(color, alpha);
}
`;

// The shadow (the header): a quad on the bed per fish, its oval drawn soft, multiplying the bed's light.
export const FISH_SHADOW_VERTEX = /* glsl */`
attribute vec4 shadowInfo;   // its height over the bed (m), the fish's length (m), its body's depth (of its length), 0
uniform float uSeenThrough;  // 1: the bed is drawn where the surface shows it (the pool's), 0 on the straight line (the lake's)
varying vec2 vQuad;
varying vec4 vShadow;
varying vec3 vWorld;
${SEEN_THROUGH_WATER}
void main() {
  vQuad = position.xz;
  vShadow = shadowInfo;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec3 drawn = uSeenThrough > 0.5 ? seenThroughWater(world.xyz, 0.0) : world.xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(drawn, 1.0);
}
`;

export const FISH_SHADOW_FRAGMENT = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uAbsorb;
varying vec2 vQuad;
varying vec4 vShadow;
varying vec3 vWorld;
void main() {
  // The quad is the oval's box with its blur round it, -1 to 1 each way.
  float height = vShadow.x, fishLength = vShadow.y;
  float blur = ${SHADOW.blur.toFixed(3)} * height + 0.004;
  vec2 halfSize = vec2(0.5 * fishLength, 0.5 * fishLength * vShadow.z * 0.7);
  vec2 point = vQuad * (halfSize + 2.0 * blur);
  // A tapered oval: wider toward its head (+x), thin to its tail.
  float taper = mix(0.55, 1.1, smoothstep(-1.0, 0.6, point.x / halfSize.x));
  float inside = length(point / vec2(halfSize.x, halfSize.y * taper));
  float shade = 1.0 - smoothstep(1.0 - blur / halfSize.y * 0.8, 1.0 + blur / halfSize.y * 1.6, inside);
  // Its sunlit share of the bed's light, there: only that is blocked.
  float depth = max(-vWorld.y, 0.0);
  float refractedCosine = sqrt(1.0 - dot(uSunDir.xz, uSunDir.xz) / (1.333 * 1.333));
  vec3 sun = uSunIrradiance * max(uSunDir.y, 0.0) * exp(-uAbsorb * depth / refractedCosine);
  vec3 sky = uSkyAmbient * exp(-uAbsorb * depth) * 1.4;
  float sunShare = dot(sun, vec3(0.3, 0.6, 0.1)) / max(dot(sun + sky, vec3(0.3, 0.6, 0.1)), 1e-5);
  float strength = ${SHADOW.darkest.toFixed(2)} * sunShare * exp(-${SHADOW.spread.toFixed(2)} * height) * min(1.0, 1.5 * halfSize.y / (halfSize.y + blur));
  gl_FragColor = vec4(vec3(1.0 - strength * shade), 1.0);
}
`;

const matrix = new THREE.Matrix4();
const forward = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3(), scale = new THREE.Vector3();

/**
 * The fish drawn (the header): `group`, for the under-water scene, holds the
 * meshes of each kind in the population (show rebuilds them for a new
 * water's), and update puts every fish where it is swimming and its shadow
 * on the bed. `bedDepthAt(x, z)` is the bed's depth; `seenThrough()` whether
 * the bed is drawn where the surface shows it (the pool's basin).
 */
export function createFishView(lighting, { bedDepthAt = () => 1, seenThrough = () => false } = {}) {
  const group = new THREE.Group();
  const lights = {
    uSunDir: { value: lighting.sunDirection },
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uAbsorb: { value: lighting.absorb },
  };
  const fog = { uFogExtinction: { value: lighting.extinction }, uFogColor: { value: lighting.waterColor } };
  const seenUniform = { value: 0 };
  const kindUniforms = (species) => ({ uPattern: { value: FISH_PATTERNS.indexOf(species.pattern) }, uBodyDepth: { value: species.shape.depth }, uScales: { value: species.shape.scales ?? 60 } });
  const bodyMaterial = (species) => new THREE.ShaderMaterial({
    vertexShader: FISH_VERTEX, fragmentShader: FISH_FRAGMENT,
    uniforms: { ...lights, ...fog, ...kindUniforms(species) },
  });
  const finMaterial = (species) => new THREE.ShaderMaterial({
    vertexShader: FISH_VERTEX, fragmentShader: FISH_FRAGMENT, defines: { FIN: 1 },
    // They write depth: from under the water the surface is drawn after them, and would cover what wrote none.
    side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthWrite: true,
    uniforms: { ...lights, ...fog, ...kindUniforms(species) },
  });
  const shadowMaterial = () => new THREE.ShaderMaterial({
    vertexShader: FISH_SHADOW_VERTEX, fragmentShader: FISH_SHADOW_FRAGMENT,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: { ...lights, uSeenThrough: seenUniform },
  });
  const shadowQuad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  let kinds = [];   // [{ body, fins, shadow, fish }]
  const shapes = new Map();
  const shapesFor = (species) => {
    if (!shapes.has(species)) shapes.set(species, { body: fishBody(species.shape), fins: fishFins(species.shape) });
    return shapes.get(species);
  };
  // A kind's meshes: its instances its fish, the body's and the fins' each with its own matrices and swim (written alike).
  function build(species, fish) {
    const shape = shapesFor(species);
    const instanced = () => new THREE.InstancedBufferAttribute(new Float32Array(fish.length * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const swim = instanced(), finSwim = instanced();
    const shadowInfo = instanced();
    const instance = (geometry, material, attributes) => {
      const own = new THREE.BufferGeometry();   // the shared shape's attributes, and this mesh's instanced ones
      for (const [name, attribute] of Object.entries(geometry.attributes)) own.setAttribute(name, attribute);
      own.setIndex(geometry.index);
      for (const [name, attribute] of Object.entries(attributes)) own.setAttribute(name, attribute);
      const mesh = new THREE.InstancedMesh(own, material, fish.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      return mesh;
    };
    const body = instance(shape.body, bodyMaterial(species), { swim });
    const fins = instance(shape.fins, finMaterial(species), { swim: finSwim });
    fins.renderOrder = 2;
    const shadow = instance(shadowQuad, shadowMaterial(), { shadowInfo });
    shadow.renderOrder = 1;
    group.add(body, fins, shadow);
    return { body, fins, shadow, fish, swim, finSwim, shadowInfo };
  }
  // A new water's fish: the new meshes made before the old go, and the warm-up's materials kept (warmUp), so the programs stay.
  function show(population) {
    const old = kinds;
    kinds = [];
    const byKind = new Map();
    for (const fish of population.fish) {
      if (!byKind.has(fish.species)) byKind.set(fish.species, []);
      byKind.get(fish.species).push(fish);
    }
    for (const [species, fish] of byKind) kinds.push(build(species, fish));
    for (const made of old) remove(made, true);
    update();
  }
  function remove(made, disposeMaterials) {
    for (const mesh of [made.body, made.fins, made.shadow]) {
      group.remove(mesh);
      mesh.geometry.dispose();
      if (disposeMaterials) mesh.material.dispose();
    }
  }
  /** Each fish where it is now: its matrix (place, heading, pitch, length), its swim, and its shadow on the bed. */
  function update() {
    seenUniform.value = seenThrough() ? 1 : 0;
    const sun = lighting.sunDirection;
    const sunSine = Math.hypot(sun.x, sun.z);
    const refractedSine = sunSine / 1.333;
    const run = refractedSine / Math.sqrt(1 - refractedSine * refractedSine);   // tan θt: down-sun per metre down
    const toSunX = sunSine > 1e-5 ? sun.x / sunSine : 0, toSunZ = sunSine > 1e-5 ? sun.z / sunSine : 0;
    for (const { body, fins, shadow, fish, swim, finSwim, shadowInfo } of kinds) {
      fish.forEach((one, index) => {
        const cosPitch = Math.cos(one.pitch), sinPitch = Math.sin(one.pitch);
        forward.set(Math.cos(one.heading) * cosPitch, sinPitch, Math.sin(one.heading) * cosPitch);
        up.set(-Math.cos(one.heading) * sinPitch, cosPitch, -Math.sin(one.heading) * sinPitch);
        side.crossVectors(forward, up);
        matrix.makeBasis(forward, up, side).scale(scale.setScalar(one.length));
        matrix.setPosition(one.x, one.y, one.z);
        body.setMatrixAt(index, matrix);
        fins.setMatrixAt(index, matrix);
        swim.setXYZW(index, one.phase, one.beat, one.bend, one.seed);
        finSwim.setXYZW(index, one.phase, one.beat, one.bend, one.seed);
        // Its shadow: down-sun of it on the bed by tan θt times its height over it (two steps to meet a sloping bed).
        let height = Math.max(bedDepthAt(one.x, one.z) + one.y, 0);
        let x = one.x - toSunX * run * height, z = one.z - toSunZ * run * height;
        height = Math.max(bedDepthAt(x, z) + one.y, 0);
        x = one.x - toSunX * run * height; z = one.z - toSunZ * run * height;
        const bed = -bedDepthAt(x, z);
        const reach = 0.5 * one.length + 2 * (SHADOW.blur * height + 0.004);
        forward.set(Math.cos(one.heading), 0, Math.sin(one.heading));
        up.set(0, 1, 0);
        side.crossVectors(forward, up);
        matrix.makeBasis(forward, up, side).scale(scale.set(reach, 1, 0.5 * one.length * one.species.shape.depth * 0.7 + 2 * (SHADOW.blur * height + 0.004)));
        matrix.setPosition(x, bed + 0.002, z);
        shadow.setMatrixAt(index, matrix);
        shadowInfo.setXYZW(index, height, one.length, one.species.shape.depth, 0);
      });
      body.instanceMatrix.needsUpdate = true;
      fins.instanceMatrix.needsUpdate = true;
      shadow.instanceMatrix.needsUpdate = true;
      swim.needsUpdate = true;
      finSwim.needsUpdate = true;
      shadowInfo.needsUpdate = true;
      shadow.visible = sun.y > 0;
    }
  }
  /**
   * One fish, for the warm-up to draw (the three programs every kind shares), then gone: done(). Its materials are
   * never disposed, so the programs outlive any water without fish (the Pool's).
   */
  function warmUp() {
    const kept = kinds;
    const species = FISH_SPECIES.koi;
    const one = { species, length: 0.4, x: 0, y: -0.5, z: -1.4, heading: 0, pitch: 0, phase: 0, beat: 0, bend: 0, seed: 0.5 };
    const made = build(species, [one]);
    kinds = [made];
    update();
    return {
      done() {
        remove(made, false);
        kinds = kept;
      },
    };
  }
  return {
    group,
    show,
    update,
    warmUp,
    get drawCalls() { return kinds.length * 3; },
    get count() { return kinds.reduce((sum, { fish }) => sum + fish.length, 0); },
  };
}
