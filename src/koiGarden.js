// The Koi pond's stones (src/main.js PLACES `koi`): a few weathered granite
// boulders set as a Japanese garden sets them (ishigumi): a main group of
// three where the far left shore juts out, the tallest standing back and two
// lower ones leaning toward it, their feet in the water; a pair on the far
// right; a low, flat viewing stone at the near left; and one rock breaking
// the water as an island. Few, of different sizes, unevenly spaced, never a
// ring of stones round the edge (a garden's "necklace", which looks made).
// Where each stands is on the pond's shore (src/pondFloor.js KOI_SHORE), so
// they follow its outline.
//
// A boulder (addBoulder) is a sphere displaced by noise at a few scales, wider
// than it is tall and flattened on top as weathered granite is, its corners
// rounded. Its look is per pixel (STONE_LOOK, onBeforeCompile on the standard
// material, as the things thrown are lit): the grey-beige of granite with
// its grains (dark mica and pale feldspar specks, finer than a centimetre),
// its crevices darker (the noise's hollows, from the vertex), patches of pale
// lichen on its upper faces, darker (a little glossier) where the water wets its
// foot, and olive algae under the water; the grains also roughen its normal,
// so it never looks like plastic. It reflects little of the sky.
//
// They are one merged mesh in three materials, as a stone thrown is
// (src/rock.js): the part above the water in the main scene; the part under
// it in the under-water pass, drawn where the still surface shows it
// (SEEN_THROUGH_WATER) or, from under the water, fading into it; and above
// the water again on the mirror's layer, its distance in the mirror image's
// alpha, so the water reflects it. Nothing here touches the physics (a stone
// is scenery). Built once, seeded (seededRandom), never Math.random.
import * as THREE from 'three';
import { SEEN_THROUGH_WATER } from './shaders/scene.js';
import { seededRandom } from './spray.js';
import { KOI_SHORE, koiShoreRadius, koiFloorDepthAt } from './pondFloor.js';

const MIRROR_NEARNESS_SCALE = 4;   // as src/rock.js's: the mirror image's alpha is 1 − this / distance
// Each stone: where on the shore (θ about the pond's centre), how far out from the waterline (m, + into the water),
// its radius (m), its height over its radius, its top over the water (m) and its turn.
const STONES = [
  { angle: -2.35, out: -0.25, radius: 0.62, squash: 0.95, top: 0.78, turn: 0.4 },    // the main group: the tall one...
  { angle: -2.12, out: 0.12, radius: 0.42, squash: 0.62, top: 0.32, turn: 1.9 },     // ...a lower one leaning in...
  { angle: -2.62, out: 0.05, radius: 0.34, squash: 0.55, top: 0.2, turn: 2.8 },      // ...and a small one at its foot
  { angle: -0.78, out: -0.15, radius: 0.48, squash: 0.7, top: 0.42, turn: 0.9 },     // the far right pair
  { angle: -0.5, out: -0.3, radius: 0.3, squash: 0.55, top: 0.24, turn: 2.2 },
  { angle: 2.35, out: -0.05, radius: 0.46, squash: 0.32, top: 0.18, turn: 0.3 },     // the flat viewing stone
  { island: [1.7, -2.6], radius: 0.32, squash: 0.75, top: 0.2, turn: 1.1 },          // the island rock
];
const UP = new THREE.Vector3(0, 1, 0);
const STONE_DETAIL = { least: 14, perMetre: 14 };   // the icosahedron's subdivisions (each face cut into its square): a big stone's finer
const GROUND_ALBEDO = new THREE.Vector3(0.12, 0.13, 0.08);   // moss and earth, greenish

/** A smooth value noise in three dimensions, 0 to 1. */
function noise3(x, y, z, seed) {
  const hash = (a, b, c) => { const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed * 19.19) * 43758.5453; return value - Math.floor(value); };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ease = (t) => t * t * (3 - 2 * t);
  const ux = ease(x - ix), uy = ease(y - iy), uz = ease(z - iz);
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), ux), lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), ux), uy),
    lerp(lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), ux), lerp(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), ux), uy),
    uz);
}

/** A boulder into `parts` (the header): positions, normals, and its crevices' shade (0 open to 1 deep) as `hollow`. */
function addBoulder(parts, { centre, radius, squash, turn, seed, random }) {
  const sphere = new THREE.IcosahedronGeometry(1, Math.round(STONE_DETAIL.least + STONE_DETAIL.perMetre * radius));
  // Its faces: planes it is worn back to, mostly round its sides, a softened cut each (granite splits along planes).
  const cuts = Array.from({ length: 6 }, () => {
    const across = random() * Math.PI * 2, rise = (random() - 0.35) * 1.1;
    return { normal: new THREE.Vector3(Math.cos(across) * Math.cos(rise), Math.sin(rise), Math.sin(across) * Math.cos(rise)), at: 0.75 + 0.2 * random() };
  });
  const directions = sphere.attributes.position;
  const shape = (direction) => {
    const broad = noise3(direction.x * 1.1, direction.y * 1.1, direction.z * 1.1, seed) - 0.5;
    const middle = noise3(direction.x * 2.6, direction.y * 2.6, direction.z * 2.6, seed + 3) - 0.5;
    const fine = noise3(direction.x * 7, direction.y * 7, direction.z * 7, seed + 7) - 0.5;
    return 0.5 * broad + 0.22 * middle + 0.06 * fine;
  };
  const surface = (direction, out) => {
    const bump = shape(direction);
    out.copy(direction).multiplyScalar(1 + 0.45 * bump);
    for (const cut of cuts) {
      const past = out.dot(cut.normal) - cut.at;
      if (past > -0.2) out.addScaledVector(cut.normal, -0.8 * (past > 0.2 ? past : (past + 0.2) * (past + 0.2) / 0.8));   // worn back toward the face, its edge rounded over a fifth of it
    }
    // Weathered flat on top: what rises past 0.55 of its height is pressed down, its edge rounded.
    if (out.y > 0.3) out.y -= 0.45 * (out.y - 0.3) * THREE.MathUtils.smoothstep(out.y, 0.3, 1.1);   // worn flatter on top, smoothly
    out.y *= squash;
    out.applyAxisAngle(UP, turn);
    return out.multiplyScalar(radius).add(centre);
  };
  const direction = new THREE.Vector3(), point = new THREE.Vector3();
  // The icosahedron's corners are each repeated by every face that meets there: each is worked out once, and the
  // faces index it.
  const first = parts.positions.length / 3;
  const seen = new Map();
  for (let vertex = 0; vertex < directions.count; vertex++) {
    direction.fromBufferAttribute(directions, vertex).normalize();
    const key = `${Math.round(direction.x * 1e5)},${Math.round(direction.y * 1e5)},${Math.round(direction.z * 1e5)}`;
    if (seen.has(key)) { parts.indices.push(seen.get(key)); continue; }
    const index = first + seen.size;
    seen.set(key, index);
    parts.indices.push(index);
    surface(direction, point);
    parts.positions.push(point.x, point.y, point.z);
    parts.hollows.push(THREE.MathUtils.clamp(-shape(direction) * 1.6, 0, 1));
    parts.tints.push(seed % 1);
  }
  sphere.dispose();
}

/** Where each stone stands: its middle (x, z) and the centre of its sphere, its top `top` over the water, its foot sunk well below into the bank or the bed. */
function stonePlace(stone) {
  let x, z;
  if (stone.island) [x, z] = stone.island;
  else {
    const reach = koiShoreRadius(stone.angle) + stone.out;
    x = KOI_SHORE.centre[0] + Math.cos(stone.angle) * reach;
    z = KOI_SHORE.centre[1] + Math.sin(stone.angle) * reach;
  }
  return new THREE.Vector3(x, stone.top - stone.radius * stone.squash * 0.66, z);
}

// The stones as the things thrown meet them (koiGround, holdOffStones): each an ellipsoid a little inside the drawn
// stone (its lumps go out and in about it), as wide as SOLID.across of its radius and as high as its top.
const SOLID = { across: 0.92 };
export const KOI_STONES = STONES.map((stone) => {
  const centre = stonePlace(stone);
  return { x: centre.x, z: centre.z, middle: centre.y, across: SOLID.across * stone.radius, up: stone.top - centre.y };
});
/** The stone's surface over (x, z), or null off it: its ellipsoid's top there. */
function stoneTopAt(stone, x, z) {
  const share = Math.hypot(x - stone.x, z - stone.z) / stone.across;
  return share < 1 ? stone.middle + stone.up * Math.sqrt(1 - share * share) : null;
}
/**
 * The Koi pond's ground for the things thrown (src/rock.js `ground`): its
 * `at(x, z)` the top of a stone there (above the water), else the garden's
 * ground where the shore is dry, else null over the water; so a thing lands
 * on a stone, bounces off it and rests on it, or on the grass.
 */
export const koiGround = {
  at(x, z) {
    let top = null;
    for (const stone of KOI_STONES) {
      const height = stoneTopAt(stone, x, z);
      if (height !== null && height > 0 && (top === null || height > top)) top = height;
    }
    if (top !== null) return top;
    const depth = koiFloorDepthAt(x, z);
    return depth < 0 ? -depth : null;
  },
};
/**
 * A thing against a stone's side (src/main.js containThings, as the pool's
 * walls hold things, src/pool.js holdInPool): in the water, afloat, sinking
 * or at rest, or in the air below the stone's top, a thing whose centre is
 * nearer a stone's axis than the stone's width at its height plus its own
 * radius is pushed back out and its speed into the stone turned back at its
 * own bounce. Returns how hard it was turned back ({ change, normalX,
 * normalZ }) or null. A thing on the stone's top is the ground's (koiGround).
 */
export function holdOffStones(rock) {
  if (rock.state === 'ground' || (rock.state === 'rest' && rock.onGround)) return null;
  let held = null;
  for (const stone of KOI_STONES) {
    const above = (rock.position.y - stone.middle) / stone.up;
    if (above >= 1 || above <= -1.6) continue;
    const width = stone.across * Math.sqrt(Math.max(1 - Math.min(above, 1) ** 2, 0.15));
    const apartX = rock.position.x - stone.x, apartZ = rock.position.z - stone.z;
    const apart = Math.hypot(apartX, apartZ);
    const reach = width + rock.radius;
    if (apart >= reach) continue;
    // Over the stone's top (coming down onto it) the ground takes it.
    if (rock.state === 'air' && rock.position.y - rock.radius > stone.middle + stone.up * 0.6) continue;
    const normalX = apart > 1e-6 ? apartX / apart : 1, normalZ = apart > 1e-6 ? apartZ / apart : 0;
    const into = -(rock.velocity.x * normalX + rock.velocity.z * normalZ);
    const change = into > 0 ? (1 + rock.collisionBounce) * into : 0;
    const push = reach - apart;
    rock.knock(normalX * change, 0, normalZ * change, normalX * push, 0, normalZ * push);
    if (!held || change > held.change) held = { change, normalX, normalZ };
  }
  return held;
}

function stonesGeometry(random) {
  const parts = { positions: [], hollows: [], tints: [], indices: [] };
  for (const stone of STONES) {
    const centre = stonePlace(stone);
    addBoulder(parts, { centre, radius: stone.radius, squash: stone.squash, turn: stone.turn, seed: 10 + random() * 90, random });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(parts.positions, 3));
  geometry.setAttribute('hollow', new THREE.Float32BufferAttribute(parts.hollows, 1));
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(parts.tints, 1));
  geometry.setIndex(parts.indices);
  geometry.computeVertexNormals();   // from its faces, smooth over the shared corners (the header)
  return geometry;
}

// The granite's look (the header), in world space: its grains, its crevices, lichen, the wet and the algae.
const STONE_COMMON = /* glsl */`
varying vec3 vStoneWorld;
varying float vHollow;
varying float vTint;
float stoneHash(vec3 point) {
  point = fract(point * 0.3183099 + 0.1);
  point *= 17.0;
  return fract(point.x * point.y * point.z * (point.x + point.y + point.z));
}
float stoneNoise(vec3 point) {
  vec3 cell = floor(point), within = fract(point);
  vec3 eased = within * within * (3.0 - 2.0 * within);
  return mix(mix(mix(stoneHash(cell), stoneHash(cell + vec3(1, 0, 0)), eased.x), mix(stoneHash(cell + vec3(0, 1, 0)), stoneHash(cell + vec3(1, 1, 0)), eased.x), eased.y),
             mix(mix(stoneHash(cell + vec3(0, 0, 1)), stoneHash(cell + vec3(1, 0, 1)), eased.x), mix(stoneHash(cell + vec3(0, 1, 1)), stoneHash(cell + vec3(1, 1, 1)), eased.x), eased.y), eased.z);
}
`;
const STONE_LOOK = /* glsl */`
  {
    vec3 at = vStoneWorld;
    float footprint = length(fwidth(at));
    // Granite: grey with a little warmth, each stone its own, mottled at hand's breadth.
    vec3 granite = mix(vec3(0.42, 0.40, 0.36), vec3(0.36, 0.34, 0.31), vTint) * (0.7 + 0.45 * stoneNoise(at * 1.4)) * (0.85 + 0.3 * stoneNoise(at * 6.3));
    // Weathering: darker streaks down its sides where rain runs, warmer stains.
    granite *= 1.0 - 0.25 * smoothstep(0.55, 0.8, stoneNoise(vec3(at.x * 9.0, at.y * 1.2, at.z * 9.0))) * (1.0 - smoothstep(0.5, 0.9, vNormalWorld.y));
    granite = mix(granite, granite * vec3(1.12, 1.0, 0.82), smoothstep(0.6, 0.8, stoneNoise(at * 2.2 + 5.0)));
    // Its grains, faded out where a pixel covers several: dark mica and pale feldspar.
    float grainShown = 1.0 - smoothstep(0.004, 0.012, footprint);
    float grain = stoneNoise(at * 140.0);
    granite *= 1.0 + grainShown * (smoothstep(0.74, 0.82, grain) * 0.12 - smoothstep(0.22, 0.14, grain) * 0.18);
    // Its crevices and hollows, darker.
    granite *= 1.0 - 0.3 * vHollow;
    // Pale lichen on its upper faces, in patches.
    float upper = smoothstep(0.35, 0.8, vNormalWorld.y) * smoothstep(0.08, 0.2, at.y);
    float lichen = smoothstep(0.5, 0.62, stoneNoise(at * 4.3 + 7.0) * 0.8 + stoneNoise(at * 17.0) * 0.2) * max(upper, 0.35);
    granite = mix(granite, mix(vec3(0.46, 0.46, 0.42), vec3(0.38, 0.4, 0.29), stoneNoise(at * 11.0)), 0.35 * lichen);
    // Wet at its foot, a little above the water; olive with algae under it.
    float wet = 1.0 - smoothstep(0.0, 0.06 + 0.03 * stoneNoise(at * 9.0), at.y);
    granite *= 1.0 - 0.4 * wet;
    float algae = 1.0 - smoothstep(-0.12, -0.01, at.y);
    granite = mix(granite, vec3(0.11, 0.12, 0.06), 0.65 * algae);
    diffuseColor.rgb = granite;
    roughnessFactor = mix(roughnessFactor, 0.8, wet * (1.0 - algae));   // a little glossier wet, never a mirror
  }
`;

/**
 * The stones (the header): `above` (main scene), `below` (the under-water
 * pass), `mirror` (the main scene, on `mirrorLayer`); setVisible shows them,
 * setEnvironment gives them the sky's light. `waterFog` is the water's
 * colour and extinction, for an eye under the water.
 */
export function createKoiGarden({ envTexture, waterFog, mirrorLayer, lighting }) {
  // The stones are built the first time they are shown (about a third of a second's work), never at start-up
  // elsewhere; till then a speck of the same attributes stands in, so the warm-up builds their programs.
  const placeholder = new THREE.BufferGeometry();
  placeholder.setAttribute('position', new THREE.Float32BufferAttribute([0, -50, 0, 0.001, -50, 0, 0, -50, 0.001], 3));
  placeholder.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  placeholder.setAttribute('hollow', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  placeholder.setAttribute('tint', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  let geometry = placeholder;
  // The ground's light thrown back up: the sun's and the sky's on moss and earth of about GROUND_ALBEDO (setLight).
  const bounce = { value: new THREE.Vector3() };
  const fogExtinction = { value: waterFog.extinction }, fogColor = { value: waterFog.color };
  const material = (side) => {
    const made = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.95, metalness: 0, envMap: envTexture, envMapIntensity: side === 'below' ? 0.3 : 0.6,   // the sky's light (less than a thrown stone takes: the garden's ground bounces some, below)
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, side === 'below' ? -1 : 1, 0), 0)],
    });
    made.onBeforeCompile = (shader) => {
      shader.uniforms.uBounce = bounce;
      shader.uniforms.uFogExtinction = fogExtinction;
      shader.uniforms.uFogColor = fogColor;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float hollow;\nattribute float tint;\nvarying vec3 vStoneWorld;\nvarying float vHollow;\nvarying float vTint;\nvarying vec3 vNormalWorld;\n${side === 'below' ? SEEN_THROUGH_WATER : ''}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  vStoneWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNormalWorld = normalize(mat3(modelMatrix) * objectNormal);
  vHollow = hollow;
  vTint = tint;
  ${side === 'below' ? 'mvPosition = viewMatrix * vec4(seenThroughWater(vStoneWorld, 0.0), 1.0);\n  gl_Position = projectionMatrix * mvPosition;' : ''}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${STONE_COMMON}\nvarying vec3 vNormalWorld;\nuniform vec3 uBounce;\nuniform vec3 uFogExtinction;\nuniform vec3 uFogColor;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${STONE_LOOK}`)
        // The light the garden's ground throws back up onto its lower faces (the sky alone would leave them blue).
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uBounce * (0.6 - 0.4 * vNormalWorld.y);`)
        // The grains roughen its normal too (a bump from the same noise), so it is stone, not plastic.
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float shown = 1.0 - smoothstep(0.004, 0.012, length(fwidth(vStoneWorld)));
    vec3 grainSlope = vec3(stoneNoise(vStoneWorld * 60.0 + vec3(1.7, 0.0, 0.0)), stoneNoise(vStoneWorld * 60.0 + vec3(0.0, 2.3, 0.0)), stoneNoise(vStoneWorld * 60.0 + vec3(0.0, 0.0, 3.1))) - 0.5;
    normal = normalize(normal + shown * 0.35 * (grainSlope - normal * dot(grainSlope, normal)));
  }`)
        .replace('#include <fog_fragment>', `#include <fog_fragment>
  ${side === 'below' ? 'if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));' : ''}`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  ${side === 'mirror' ? `gl_FragColor.a = 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05);` : ''}`);
    };
    made.customProgramCacheKey = () => `koi-stone-${side}`;
    return made;
  };
  const above = new THREE.Mesh(geometry, material('above'));
  const below = new THREE.Mesh(geometry, material('below'));
  const mirror = new THREE.Mesh(geometry, material('mirror'));
  mirror.layers.set(mirrorLayer);
  for (const mesh of [above, below, mirror]) mesh.frustumCulled = false;
  return {
    above, below, mirror,
    /** The sky's light for the stone (src/sky.js fills its map in place once a sky has loaded). */
    setEnvironment(texture) {
      for (const mesh of [above, below, mirror]) {
        if (mesh.material.envMap === texture) continue;
        mesh.material.envMap = texture;
        mesh.material.needsUpdate = true;
      }
    },
    /** The ground's bounce from the light now (the sky's sun and ambient, src/main.js lighting). */
    setLight() {
      const sunUp = Math.max(lighting.sunDirection.y, 0);
      bounce.value.copy(lighting.sunIrradiance).multiplyScalar(sunUp).addScaledVector(lighting.skyAmbient, 1.4).multiply(GROUND_ALBEDO);
    },
    /** Show the stones, or hide them; `building` false shows the placeholder alone (the warm-up). */
    setVisible(visible, { building = true } = {}) {
      if (visible && building && geometry === placeholder) {
        geometry = stonesGeometry(seededRandom(7, 2));
        for (const mesh of [above, below, mirror]) mesh.geometry = geometry;
      }
      for (const mesh of [above, below, mirror]) mesh.visible = visible;
    },
  };
}
