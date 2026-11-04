// The Reflecting Pool's buildings (src/nationalMall.js draws them with its
// ground and trees): the pool's granite coping, the Washington Monument and
// its ring of flags, the Lincoln Memorial behind the eye and the Capitol
// beyond the Monument, at their real sizes and places (the scene's −z is
// east, +x south; the plaza at the coping's level). And what lights them
// all: the shared light (MALL_COMMON) and the sun's shadows (SUN_SHADOW).
//
// The Lincoln Memorial (LINCOLN, addLincoln) is drawn from its drawings: the
// terrace's granite wall and the two flights up to it, the upper flight
// between its cheek blocks and their tripods, the marble podium and the
// stylobate's three steps; the 36 fluted Doric columns (entasis, drums,
// necking, echinus, abacus) and the two in the entrance; the architrave,
// the frieze (the 36 states' names, a double-wreath medallion between each),
// the cornice (its crown moulding, lions' heads, the palmettes' cresting) and
// the attic set back over the chamber (the 48 states' names over festoons
// hung from eagles); behind the colonnade the chamber's walls, open three
// bays wide in the east, the Ionic columns inside and the seated statue,
// lit from within. The Capitol (CAPITOL, addCapitol): the west terrace and
// its stairs, the central block, its west front's loggia, the corridors and
// the Senate's and the House's wings with their colonnades; the dome on its
// base, the peristyle of 36 columns round the drum, the attic, the ribbed
// shell with its three tiers of windows, the tholos of 12 and the Statue
// of Freedom. The Monument (MONUMENT, addMonument): the shaft, its
// pyramidion, its windows (red lights after dusk), its plaza's kerb, and the
// 50 flags in a ring round it (flagGeometry, FLAG_VERTEX: flying in the
// wind).
//
// What is carved or built finer than its mesh is drawn per pixel
// (STONE_FRAGMENT), each detail faded to its mean as a pixel's footprint
// outgrows it, so nothing shimmers far off: the columns' flutes and drums,
// the frieze's names and wreaths, the attic's festoons, the cornice's
// mouldings, the Capitol's rusticated basement, pilasters, windows and
// balustrades, the dome's ribs and windows. Their light: the sun's, through
// SUN_SHADOW (a shadow map round the Lincoln Memorial, drawn once whenever
// the sun moves: the colonnade's shadows on the chamber's walls, the
// cornice's on the frieze, the stairs' on themselves; the Monument's on the
// ground analytically: monumentShadow), the sky's through what is open over
// a point (the portico's depth, the drum behind the peristyle), the
// ground's light back up, a marble's soft sheen; the floodlights after dusk;
// then the air between (inAir).
//
// Two meshes: what stands behind the eye (lincolnGeometry: the Memorial,
// left out by the camera's frustum when the eye looks east) and what lies
// ahead (distantGeometry: the coping, the Monument, the Capitol).
import * as THREE from 'three';
import { MALL_POOL } from './pondFloor.js';
import { HAZE } from './shaders/scene.js';

export const MIRROR_NEARNESS_SCALE = 4;   // as src/rock.js's: the mirror image's alpha is 1 − this / distance
export const WEST = MALL_POOL.west;
export const EAST = MALL_POOL.west - MALL_POOL.length;
export const HALF = MALL_POOL.halfWidth;
export const COPING_TOP = MALL_POOL.coping;

// The coping: granite blocks `width` (m) across, `stone` long, from `below` (m, under the still water) to the top.
export const COPING = { width: 0.75, stone: 2.3, below: 0.25 };
// The Washington Monument (m): its base's centre (x, z), its shaft's side at the base and at the top of the shaft,
// the shaft's height, the whole height, where the marble's colour changes, the windows' height; on its knoll
// (KNOLL: `height` over the Mall at the top, falling to the Mall's level by `radius`, the plaza flat to `plaza`); its
// flags (FLAGS: how many, the ring's radius, the poles' height, a flag's length and height).
export const MONUMENT = { x: 37, z: 138.5 - 1291, base: 16.8, top: 10.5, shaft: 152.4, height: 169.3, change: 46, windows: 150.2 };
export const KNOLL = { height: 9, plaza: 24, radius: 230 };
const FLAGS = { count: 50, radius: 38, pole: 9.1, length: 2.4, height: 1.5 };
// The Lincoln Memorial (m), from its drawings: its centre's z and the stylobate's top (its x and z half-sides, its
// height over the plaza, the chamber's floor); the stylobate's steps; the columns (how many along x and along z,
// inset from the stylobate's edge, height, radius at the foot and at the neck, flutes, drums); the architrave's,
// the frieze's, the cornice's (and its overhang) and the cresting's heights; the attic (its setback from the frieze,
// height, cap); the chamber's walls (inset from the stylobate's edge, thickness, the entrance's width in bays, the
// ceiling's height over the floor) and inside (the rows of Ionic columns' x, their height and radius); the terrace;
// the flights up to it and from it to the stylobate (half-widths, where they start, their landings), the cheek
// blocks either side of the upper flight.
export const LINCOLN = {
  z: 138.5, halfX: 28.9, halfZ: 18.05, floor: 13.2,
  crepidoma: { steps: 3, rise: 0.42, tread: 0.6 },
  columns: { alongX: 12, alongZ: 8, inset: 1.6, height: 13.4, foot: 1.13, neck: 0.89, flutes: 20, drums: 11 },
  architrave: 1.45, frieze: 1.8, cornice: { height: 0.95, overhang: 1.05 }, cresting: 0.5,
  attic: { setback: 3.1, height: 5.3, cap: 0.75 },
  cella: { inset: 5.4, wall: 1.4, bays: 3, ceiling: 18.3 },
  interior: { rowX: 9.2, height: 15.2, radius: 0.84 },
  terrace: { halfX: 70, from: 84, to: 205, height: 6.6 },
  lowerStair: { halfX: 30, from: 64.8, landing: 4 },
  upperStair: { halfX: 16, landing: 3 },
  cheek: { width: 4.2 },
};
// The Capitol (m): the dome's centre (z), the hill's height there; the base (the west terrace's top) over the hill;
// the dome's and the tholos' heights over the base (BASE + DOME.*); see addCapitol for the plan.
export const CAPITOL = { z: 138.5 - 3560, hill: 24, terrace: 3.5 };

const smoothstep = (low, high, value) => { const share = Math.min(Math.max((value - low) / (high - low), 0), 1); return share * share * (3 - 2 * share); };
/** The ground's height over the still water at (x, z) (m): the coping's level, the Monument's knoll, Capitol Hill. */
export function mallGroundAt(x, z) {
  const fromMonument = Math.hypot(x - MONUMENT.x, z - MONUMENT.z);
  const knoll = KNOLL.height * (1 - smoothstep(KNOLL.plaza, KNOLL.radius, fromMonument));
  const hill = CAPITOL.hill * smoothstep(CAPITOL.z + 900, CAPITOL.z + 250, z) * (1 - smoothstep(350, 900, Math.abs(x)));
  return COPING_TOP + knoll + hill;
}

// The Lincoln Memorial's levels (m over the still water), from LINCOLN.
const LINCOLN_AT = (() => {
  const { z, halfX, halfZ, floor, crepidoma, columns, architrave, frieze, cornice, attic, cella, terrace } = LINCOLN;
  const base = COPING_TOP, stylobate = base + floor;
  const podium = stylobate - crepidoma.steps * crepidoma.rise;
  const capitals = stylobate + columns.height;
  const spanX = halfX - columns.inset, spanZ = halfZ - columns.inset;
  const abacus = columns.neck * 1.44;
  const frontX = spanX + abacus, frontZ = spanZ + abacus;   // the architrave's and the frieze's faces
  return {
    base, stylobate, podium, capitals, spanX, spanZ, abacus, frontX, frontZ,
    terraceTop: base + terrace.height,
    friezeFrom: capitals + architrave, corniceFrom: capitals + architrave + frieze,
    corniceTop: capitals + architrave + frieze + cornice.height,
    atticTop: capitals + architrave + frieze + cornice.height + attic.height,
    atticX: frontX - attic.setback, atticZ: frontZ - attic.setback,
    cellaX: halfX - cella.inset, cellaZ: halfZ - cella.inset,
    bayX: (2 * spanX) / (columns.alongX - 1), bayZ: (2 * spanZ) / (columns.alongZ - 1),
    centre: z,
  };
})();
// The Capitol's base (the west terrace's top) and the dome's levels over it (m).
const CAPITOL_BASE = mallGroundAt(0, CAPITOL.z) + CAPITOL.terrace;
const DOME = { base: 23, peristyle: 28.5, columns: 37.5, attic: 39.2, shell: 46.5, tholos: 64, tholosTop: 71.2, statue: 76.2, top: 82.4 };

// ---- the light every look shares -----------------------------------------------

// What every look shares: the light (the scene's sun and sky, as the lake's land is lit: src/shaders/scene.js
// LAND_FRAGMENT), the ground's light thrown back up (GROUND_ALBEDO), the floodlights after dusk (uFlood), and the
// air between: what lies d metres off fades toward the sky's own horizon in its direction, by 1 − exp(−d/AIR_DISTANCE)
// (a summer day's: the Monument 1.15 km off keeps 82% of itself, the Capitol 3.4 km off 56%), then the weather's haze.
export const MALL_COMMON = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform samplerCube uSkyCube;
uniform float uFlood;
uniform float uSnow;
uniform float uWet;
uniform float uTime;
${HAZE}
varying vec3 vWorld;
#define SKY_LIGHT 1.4
#define GROUND_ALBEDO 0.16
#define AIR_DISTANCE 5800.0
#define SNOW_ALBEDO vec3(0.86, 0.89, 0.93)
// GLSL_COMMON's hash21 (src/shaders/scene.js), not a sine's: it keeps its spread at the Mall's kilometres on any GPU.
float mallHash(vec2 point) {
  vec3 mixed = fract(vec3(point.xyx) * 0.1031);
  mixed += dot(mixed, mixed.yzx + 33.33);
  return fract((mixed.x + mixed.y) * mixed.z);
}
float mallNoise(vec2 point) {
  vec2 cell = floor(point), within = fract(point);
  vec2 eased = within * within * (3.0 - 2.0 * within);
  return mix(mix(mallHash(cell), mallHash(cell + vec2(1.0, 0.0)), eased.x), mix(mallHash(cell + vec2(0.0, 1.0)), mallHash(cell + vec2(1.0, 1.0)), eased.x), eased.y);
}
vec3 daylight(vec3 normal, float sunShade, float skyShade) {
  vec3 sky = uSkyAmbient * SKY_LIGHT;
  return uSunIrradiance * max(dot(normal, uSunDir), 0.0) * sunShade
    + sky * (0.6 + 0.4 * normal.y) * skyShade
    + (uSunIrradiance * max(uSunDir.y, 0.0) + sky) * GROUND_ALBEDO * (0.5 - 0.5 * normal.y) * skyShade;
}
vec3 inAir(vec3 color, vec3 world) {
  vec2 toward = world.xz - cameraPosition.xz;
  toward /= max(length(toward), 1e-3);
  float distance = length(world - cameraPosition);
  vec3 air = textureCubeLodEXT(uSkyCube, normalize(vec3(toward.x, 0.035, toward.y)), 4.0).rgb;
  return withHaze(mix(color, air, 1.0 - exp(-distance / AIR_DISTANCE)), distance);
}
vec4 finish(vec3 color) {
#ifdef MIRRORED
  return vec4(color, 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vWorld - cameraPosition), 0.05));
#else
  return vec4(color, 1.0);
#endif
}
`;

// ---- the sun's shadows -----------------------------------------------------------

// The shadow map round the Lincoln Memorial (SHADOW_BOX, m: x, y and z from and to), SHADOW_SIZE texels square,
// drawn from the sun whenever the sun moves (createSunShadow); a point looks itself up lifted SHADOW_LIFT (m) along
// its normal and compares SHADOW_BIAS nearer, at four points ¾ of a texel apart, each compare the hardware's,
// filtered between its four texels (a sampler2DShadow): an edge smooth over some three texels, at four taps. The Monument's shadow is its own shape's
// (monumentShadow): where the sun's ray from a point passes the shaft, the shaft's square there.
const SHADOW_BOX = { x: [-73, 73], y: [-1, 39], z: [58, 208] };
const SHADOW_SIZE = 1024;
export const SUN_SHADOW = /* glsl */`
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
#define SHADOW_TEXEL ${(1 / SHADOW_SIZE).toFixed(7)}
#define SHADOW_LIFT 0.12
#define SHADOW_BIAS 0.0015
#define MONUMENT_AXIS vec2(${MONUMENT.x.toFixed(2)}, ${MONUMENT.z.toFixed(2)})
#define MONUMENT_FOOT ${mallGroundAt(MONUMENT.x, MONUMENT.z).toFixed(2)}
#define MONUMENT_SHAFT ${MONUMENT.shaft.toFixed(2)}
#define MONUMENT_TALL ${MONUMENT.height.toFixed(2)}
#define MONUMENT_HALVES vec2(${(MONUMENT.base / 2).toFixed(2)}, ${(MONUMENT.top / 2).toFixed(2)})
float sunShadow(vec3 world, vec3 normal) {
  if (uShadowOn < 0.5 || uSunDir.y < 0.0) return 1.0;
  vec3 point = (uShadowMatrix * vec4(world + normal * SHADOW_LIFT, 1.0)).xyz;
  if (point.x <= 0.0 || point.y <= 0.0 || point.x >= 1.0 || point.y >= 1.0 || point.z >= 1.0) return 1.0;
  float depth = point.z - SHADOW_BIAS;
  float lit = texture(uShadowMap, vec3(point.xy + vec2(-0.75, -0.75) * SHADOW_TEXEL, depth))
    + texture(uShadowMap, vec3(point.xy + vec2(0.75, -0.75) * SHADOW_TEXEL, depth))
    + texture(uShadowMap, vec3(point.xy + vec2(-0.75, 0.75) * SHADOW_TEXEL, depth))
    + texture(uShadowMap, vec3(point.xy + vec2(0.75, 0.75) * SHADOW_TEXEL, depth));
  return 0.25 * lit;
}
float monumentShadow(vec3 world) {
  float level = dot(uSunDir.xz, uSunDir.xz);
  if (uSunDir.y < 0.02 || level < 1e-6) return 1.0;
  vec2 offset = world.xz - MONUMENT_AXIS;
  float along = -dot(offset, uSunDir.xz) / level;   // along the ray to where it passes the axis nearest
  if (along <= 0.0) return 1.0;
  vec3 passing = world + uSunDir * along;
  float height = passing.y - MONUMENT_FOOT;
  if (height < 0.0 || height > MONUMENT_TALL) return 1.0;
  float halfSide = height < MONUMENT_SHAFT ? mix(MONUMENT_HALVES.x, MONUMENT_HALVES.y, height / MONUMENT_SHAFT) : MONUMENT_HALVES.y * (MONUMENT_TALL - height) / (MONUMENT_TALL - MONUMENT_SHAFT);
  vec2 miss = abs(passing.xz - MONUMENT_AXIS);
  float soft = 0.004 * along + 0.1;   // the sun's half a degree, spread over the way
  return smoothstep(halfSide - soft, halfSide + soft, max(miss.x, miss.y));
}
`;

/**
 * The shadow map round the Lincoln Memorial (SUN_SHADOW): its uniforms
 * (shared with the stone's and the ground's programs), and draw(renderer,
 * geometry), which draws what casts it (the Memorial's mesh) from the sun
 * when it has moved (stale), into a depth texture. The map is made at its
 * first draw (a place that never shows the Mall never holds it); till then
 * the uniforms hold a few texels' stand-in, drawn by warm under the veil.
 */
export function createSunShadow(lighting) {
  const makeTarget = (size) => {
    const depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depthTexture.minFilter = depthTexture.magFilter = THREE.LinearFilter;
    depthTexture.compareFunction = THREE.LessEqualCompare;
    return new THREE.WebGLRenderTarget(size, size, { format: THREE.RedFormat, depthBuffer: true, depthTexture });
  };
  let target = null;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const scene = new THREE.Scene();
  const caster = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshDepthMaterial({ side: THREE.DoubleSide }));
  caster.frustumCulled = false;
  scene.add(caster);
  const standIn = makeTarget(4);
  const uniforms = {
    uShadowMap: { value: standIn.depthTexture },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 },
  };
  const centre = new THREE.Vector3((SHADOW_BOX.x[0] + SHADOW_BOX.x[1]) / 2, (SHADOW_BOX.y[0] + SHADOW_BOX.y[1]) / 2, (SHADOW_BOX.z[0] + SHADOW_BOX.z[1]) / 2);
  const corner = new THREE.Vector3(), bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const into = (renderer, where) => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(where);
    renderer.clear(false, true, false);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
  };
  let stale = true;
  return {
    uniforms,
    /** The sun has moved: draw it again before it is next used. */
    invalidate() { stale = true; },
    /** Draw `geometry` into the stand-in, whatever the sun, so the programs are built under the veil; then stale again. */
    warm(renderer, geometry) {
      caster.geometry = geometry;
      into(renderer, standIn);
      stale = true;
    },
    /** Draw the shadow map (if stale) from what `geometry` holds; returns whether it drew. */
    draw(renderer, geometry) {
      if (!stale) return false;
      stale = false;
      const sun = lighting.sunDirection;
      if (sun.y <= 0.01) { uniforms.uShadowOn.value = 0; return false; }
      if (!target) {
        target = makeTarget(SHADOW_SIZE);
        uniforms.uShadowMap.value = target.depthTexture;
        standIn.dispose();
      }
      caster.geometry = geometry;
      camera.position.copy(centre).addScaledVector(sun, 600);
      camera.up.set(0, 0, 1);
      if (Math.abs(sun.z) > 0.99) camera.up.set(1, 0, 0);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      // The box's corners seen from the sun: the camera's bounds fitted round them.
      const least = new THREE.Vector3(Infinity, Infinity, Infinity), most = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (const x of SHADOW_BOX.x) for (const y of SHADOW_BOX.y) for (const z of SHADOW_BOX.z) {
        corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        least.min(corner); most.max(corner);
      }
      Object.assign(camera, { left: least.x, right: most.x, bottom: least.y, top: most.y, near: -most.z - 1, far: -least.z + 1 });
      camera.updateProjectionMatrix();
      uniforms.uShadowMatrix.value.copy(bias).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      into(renderer, target);
      uniforms.uShadowOn.value = 1;
      return true;
    },
  };
}

// ---- building the stone ------------------------------------------------------------

// What each stone surface is (the `surface` attribute; STONE_FRAGMENT's looks).
const SURFACE = {
  coping: 0, marble: 1, granite: 2, monument: 3, window: 4, chamber: 5, statue: 6, facade: 7,
  frieze: 8, attic: 9, cornice: 10, dome: 11, roof: 12, bronze: 14, paint: 15,
};
// A surface's `detail` (its second number; the first is an angle round a column's axis): what it is beyond its
// look: a fluted shaft, a plain one, the dome's shell, its attic, its drum, a balustrade.
const DETAIL = { fluted: 1, plain: 2, shell: 3, atticWall: 4, drum: 5, balustrade: 6 };

/** One merged mesh's pieces, each corner with its normal, its `surface`, its `hollow` (0 open to 1 deep in shade) and its `detail` (an angle round a column's axis, and what it is: DETAIL). */
class Parts {
  constructor() { this.positions = []; this.normals = []; this.surfaces = []; this.hollows = []; this.details = []; this.indices = []; }
  /** `geometry` placed by `matrix`, as `surface`, its corners' hollow (a number), detail from `detail(local)` or [0, kind]. */
  add(geometry, matrix, { surface, hollow = 0, detail = null, kind = 0 }) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const positions = geometry.attributes.position, normals = geometry.attributes.normal;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const first = this.positions.length / 3;
    const local = new THREE.Vector3(), point = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let corner = 0; corner < positions.count; corner++) {
      local.fromBufferAttribute(positions, corner);
      point.copy(local).applyMatrix4(matrix);
      normal.fromBufferAttribute(normals, corner).applyMatrix3(normalMatrix).normalize();
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.surfaces.push(surface);
      this.hollows.push(hollow);
      const [angle, what] = detail ? detail(local) : [0, kind];
      this.details.push(angle, what);
    }
    if (geometry.index) for (let index = 0; index < geometry.index.count; index++) this.indices.push(first + geometry.index.getX(index));
    else for (let corner = 0; corner < positions.count; corner++) this.indices.push(first + corner);
    geometry.dispose();
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('surface', new THREE.Float32BufferAttribute(this.surfaces, 1));
    geometry.setAttribute('hollow', new THREE.Float32BufferAttribute(this.hollows, 1));
    geometry.setAttribute('detail', new THREE.Float32BufferAttribute(this.details, 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
/** A box from (x0, y0, z0) to (x1, y1, z1), flat-faced, its bottom left out when it stands on something. */
function addBlock(parts, [x0, y0, z0], [x1, y1, z1], surface, { hollow = 0, bottom = false, kind = 0 } = {}) {
  const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  if (!bottom) {
    // The box's faces are in the order +x, −x, +y, −y, +z, −z, six indices each: drop −y.
    const index = Array.from(geometry.index.array);
    index.splice(18, 6);
    geometry.setIndex(index);
  }
  parts.add(geometry, at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), { surface, hollow, kind });
}
/**
 * A flight of `count` steps, `halfX` either side of x = 0, rising from `y0` at z = `from` to `y1` at z = `to`
 * (toward greater z when from < to, else toward lesser): each step a block running back to the flight's top end.
 */
function addStair(parts, { halfX, from, to, y0, y1, count, centre = 0, surface = SURFACE.granite }) {
  const run = (to - from) / count, rise = (y1 - y0) / count;
  for (let step = 0; step < count; step++) {
    const start = from + step * run;
    addBlock(parts, [centre - halfX, y0 - 0.02, Math.min(start, to)], [centre + halfX, y0 + (step + 1) * rise, Math.max(start, to)], surface);
  }
}
/** A solid of revolution about y: `profile` ([radius, height] pairs, bottom up), `around` sides, at (x, y, z). */
function addLathe(parts, profile, around, [x, y, z], options) {
  parts.add(new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(Math.max(radius, 1e-3), height)), around), at(x, y, z), options);
}
/** A drum: a closed cylinder of `radius`, from `y0` to `y1`, at (x, z), `sides` round (turned by `turn`). */
function addDrum(parts, radius, y0, y1, [x, z], options, sides = 48, turn = 0) {
  const geometry = new THREE.CylinderGeometry(radius, radius, y1 - y0, sides, 1, false, turn);
  parts.add(geometry, at(x, (y0 + y1) / 2, z), options);
}
/** An ellipsoid of `radii` at `centre`, turned by `tilt` about x (rad), for the statues. */
function addEllipsoid(parts, centre, radii, surface, tilt = 0) {
  const matrix = at(...centre).multiply(new THREE.Matrix4().makeRotationX(tilt)).multiply(new THREE.Matrix4().makeScale(...radii));
  parts.add(new THREE.SphereGeometry(1, 14, 10), matrix, { surface });
}
/** A rounded limb from `from` to `to`, `radius` thick, for the statues. */
function addLimb(parts, from, to, radius, surface) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start), length = direction.length();
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  const matrix = new THREE.Matrix4().compose(start.clone().add(end).multiplyScalar(0.5), turn, new THREE.Vector3(1, 1, 1));
  parts.add(new THREE.CapsuleGeometry(radius, Math.max(length - 2 * radius, 0.01), 3, 10), matrix, { surface });
}

/** The coping (COPING): four granite strips round the pool, their inner faces the walls' above the water. */
function addCoping(parts) {
  const outerX = HALF + COPING.width, westOuter = WEST + COPING.width, eastOuter = EAST - COPING.width;
  for (const side of [-1, 1]) {
    const inner = side * HALF, outer = side * outerX;
    addBlock(parts, [Math.min(inner, outer), -COPING.below, eastOuter], [Math.max(inner, outer), COPING_TOP, westOuter], SURFACE.coping);
  }
  addBlock(parts, [-HALF, -COPING.below, WEST], [HALF, COPING_TOP, westOuter], SURFACE.coping);
  addBlock(parts, [-HALF, -COPING.below, eastOuter], [HALF, COPING_TOP, EAST], SURFACE.coping);
}

/**
 * The Washington Monument (MONUMENT): the shaft, a square frustum, and its
 * pyramidion, faces aligned with the compass, on its plaza at the knoll's
 * top; its windows two to a face; the plaza's granite kerb.
 */
function addMonument(parts) {
  const ground = mallGroundAt(MONUMENT.x, MONUMENT.z);
  const half0 = MONUMENT.base / 2, half1 = MONUMENT.top / 2;
  const positions = [], indices = [];
  const corners = (half, height) => [[-half, height, -half], [half, height, -half], [half, height, half], [-half, height, half]];
  const bottom = corners(half0, -1), top = corners(half1, MONUMENT.shaft);
  const apex = [0, MONUMENT.height, 0];
  // Each side its own corners, so its normal is flat.
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4, first = positions.length / 3;
    positions.push(...bottom[side], ...bottom[next], ...top[next], ...top[side]);
    indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
    const tip = positions.length / 3;
    positions.push(...top[side], ...top[next], ...apex);
    indices.push(tip, tip + 2, tip + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  parts.add(flat, at(MONUMENT.x, ground, MONUMENT.z), { surface: SURFACE.monument });
  // The windows: a pair on each face, just proud of it.
  const lean = (half0 - half1) / MONUMENT.shaft;
  const halfAt = half0 - lean * MONUMENT.windows;
  for (let side = 0; side < 4; side++) {
    const turn = new THREE.Matrix4().makeRotationY((side * Math.PI) / 2);
    for (const across of [-1.1, 1.1]) {
      parts.add(new THREE.PlaneGeometry(0.75, 1.1), at(MONUMENT.x, ground + MONUMENT.windows, MONUMENT.z).multiply(turn).multiply(at(across, 0, halfAt + 0.02)), { surface: SURFACE.window });
    }
  }
  // The plaza's low granite kerb round the base.
  parts.add(new THREE.CylinderGeometry(KNOLL.plaza * 0.55, KNOLL.plaza * 0.55, 0.5, 48, 1, true), at(MONUMENT.x, ground + 0.1, MONUMENT.z), { surface: SURFACE.granite });
}

/**
 * A column at (x, y, z): its shaft with entasis (FLUTED: its flutes and drums drawn per pixel), `height` to the top of
 * its abacus, `foot` and `neck` its radii; a Doric capital (echinus and a square abacus) or, `ionic`, a round one.
 */
function addColumn(parts, [x, y, z], { height, foot, neck, surface = SURFACE.marble, fluted = true, ionic = false, around = 24, hollow = 0 }) {
  const shaftHeight = height * (ionic ? 0.94 : 0.93), rings = 8;
  const profile = [];
  for (let ring = 0; ring <= rings; ring++) {
    const share = ring / rings;
    profile.push([foot + (neck - foot) * share + 0.035 * foot * Math.sin(Math.PI * share), shaftHeight * share]);
  }
  const kind = fluted ? DETAIL.fluted : DETAIL.plain;
  parts.add(new THREE.LatheGeometry(profile.map(([radius, up]) => new THREE.Vector2(radius, up)), around), at(x, y, z), { surface, hollow, detail: (local) => [Math.atan2(local.z, local.x), kind] });
  const capital = height - shaftHeight;
  if (ionic) {
    addLathe(parts, [[neck, 0], [neck * 1.15, capital * 0.35], [neck * 1.3, capital * 0.7], [neck * 1.32, capital]], around, [x, y + shaftHeight, z], { surface, hollow });
    addBlock(parts, [x - neck * 1.45, y + height - 0.05, z - neck * 1.45], [x + neck * 1.45, y + height + 0.12, z + neck * 1.45], surface, { hollow, bottom: true });
    return;
  }
  // The necking's three rings, the echinus flaring to the abacus, a square slab.
  addLathe(parts, [[neck, 0], [neck * 1.04, capital * 0.08], [neck * 1.0, capital * 0.14], [neck * 1.06, capital * 0.24], [neck * 1.33, capital * 0.55], [neck * 1.4, capital * 0.62]], around, [x, y + shaftHeight, z], { surface, hollow });
  const abacus = neck * 1.44;
  addBlock(parts, [x - abacus, y + shaftHeight + capital * 0.62, z - abacus], [x + abacus, y + height, z + abacus], surface, { hollow, bottom: true });
}

/** A row of palmettes (the cornice's cresting), `size` tall, every `spacing` along from `start` to `end`, facing `outward`. */
function addPalmettes(parts, start, end, outward, size, spacing) {
  const along = new THREE.Vector3().subVectors(end, start), length = along.length();
  along.normalize();
  const count = Math.floor(length / spacing);
  const positions = [], indices = [];
  for (let index = 0; index < count; index++) {
    const middle = start.clone().addScaledVector(along, (index + 0.5) * (length / count));
    // Five leaves fanned from the foot, the middle one tallest.
    for (let leaf = -2; leaf <= 2; leaf++) {
      const lean = leaf * 0.32, tall = size * (1 - 0.14 * Math.abs(leaf));
      const foot = middle.clone().addScaledVector(along, leaf * 0.03);
      const tip = foot.clone().addScaledVector(along, Math.sin(lean) * tall).add(new THREE.Vector3(0, Math.cos(lean) * tall, 0));
      const sideways = along.clone().multiplyScalar(0.07 * size / 0.5);
      const base = positions.length / 3;
      positions.push(...foot.clone().sub(sideways).toArray(), ...foot.clone().add(sideways).toArray(), ...tip.toArray());
      indices.push(base, base + 1, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const normals = new Float32Array(positions.length);
  for (let corner = 0; corner < positions.length / 3; corner++) normals.set([outward.x, outward.y + 0.3, outward.z], corner * 3);
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  parts.add(geometry, new THREE.Matrix4(), { surface: SURFACE.marble });
}

/**
 * The Lincoln Memorial (LINCOLN), behind the eye across the west plaza (the
 * header): its terrace and flights, the podium and the stylobate's steps,
 * the colonnade and its entablature, the attic, and the chamber within.
 */
function addLincoln(parts) {
  const { z, halfX, halfZ, crepidoma, columns, cornice, attic, cella, interior, terrace, lowerStair, upperStair, cheek } = LINCOLN;
  const level = LINCOLN_AT;
  const { base, stylobate, podium, capitals, spanX, spanZ, frontX, frontZ, terraceTop } = level;
  const front = z - halfZ;   // the stylobate's east edge
  // The terrace: its granite wall, its cap a little proud; the lower flights up to it, a landing between, low walls
  // either side; the top's paving and lawn are the stone's look (STONE_FRAGMENT).
  addBlock(parts, [-terrace.halfX, base - 0.1, terrace.from], [terrace.halfX, terraceTop - 0.4, terrace.to], SURFACE.granite);
  addBlock(parts, [-terrace.halfX - 0.25, terraceTop - 0.4, terrace.from - 0.25], [terrace.halfX + 0.25, terraceTop, terrace.to + 0.25], SURFACE.granite);
  const riser = 0.165, tread = 0.38, half = (terraceTop - base) / 2, steps = Math.round(half / riser);
  const firstTop = lowerStair.from + steps * tread, secondFrom = firstTop + lowerStair.landing;
  addStair(parts, { halfX: lowerStair.halfX, from: lowerStair.from, to: firstTop, y0: base, y1: base + half, count: steps });
  addBlock(parts, [-lowerStair.halfX, base, firstTop], [lowerStair.halfX, base + half, secondFrom], SURFACE.granite);
  addStair(parts, { halfX: lowerStair.halfX, from: secondFrom, to: terrace.from, y0: base + half, y1: terraceTop, count: Math.round((terrace.from - secondFrom) / tread) });
  for (const side of [-1, 1]) {
    const inner = side * lowerStair.halfX, outer = side * (lowerStair.halfX + 1.4);
    addBlock(parts, [Math.min(inner, outer), base, lowerStair.from - 0.4], [Math.max(inner, outer), base + half + 0.9, firstTop], SURFACE.granite);
    addBlock(parts, [Math.min(inner, outer), base, firstTop], [Math.max(inner, outer), terraceTop + 0.9, terrace.from], SURFACE.granite);
  }
  // The upper flight, straight up to the stylobate, a landing half way, between its cheek blocks and their tripods.
  const upperSteps = Math.round((stylobate - terraceTop) / 2 / riser), upperHalf = (stylobate - terraceTop) / 2;
  const upperFrom = front - 2 * upperSteps * 0.36 - upperStair.landing, upperMiddle = upperFrom + upperSteps * 0.36;
  addStair(parts, { halfX: upperStair.halfX, from: upperFrom, to: upperMiddle, y0: terraceTop, y1: terraceTop + upperHalf, count: upperSteps });
  addBlock(parts, [-upperStair.halfX, terraceTop, upperMiddle], [upperStair.halfX, terraceTop + upperHalf, upperMiddle + upperStair.landing], SURFACE.granite);
  addStair(parts, { halfX: upperStair.halfX, from: upperMiddle + upperStair.landing, to: front, y0: terraceTop + upperHalf, y1: stylobate, count: upperSteps, surface: SURFACE.marble });
  const podiumX = halfX + crepidoma.steps * crepidoma.tread, podiumZ = halfZ + crepidoma.steps * crepidoma.tread;
  for (const side of [-1, 1]) {
    const inner = side * upperStair.halfX, outer = side * (upperStair.halfX + cheek.width);
    addBlock(parts, [Math.min(inner, outer), terraceTop, upperFrom - 0.3], [Math.max(inner, outer), stylobate + 0.35, z - podiumZ + 0.1], SURFACE.marble);
    addBlock(parts, [Math.min(inner, outer) - 0.12, stylobate + 0.35, upperFrom - 0.42], [Math.max(inner, outer) + 0.12, stylobate + 0.6, z - podiumZ + 0.1], SURFACE.marble, { bottom: true });
    // The tripod: a plinth, a fluted stem, the brazier's bowl and its rim.
    addLathe(parts, [[1.05, 0], [1.05, 0.35], [0.78, 0.42], [0.5, 0.6], [0.42, 1.7], [0.6, 1.85], [1.25, 2.45], [1.38, 2.62], [1.28, 2.7], [0.2, 2.66]], 20, [side * (upperStair.halfX + cheek.width / 2), stylobate + 0.6, upperFrom + 1.6], { surface: SURFACE.marble });
  }
  // The podium: its walls, a plinth and a cap moulding; the stylobate's three steps.
  addBlock(parts, [-podiumX, terraceTop - 0.1, z - podiumZ], [podiumX, podium, z + podiumZ], SURFACE.marble);
  addBlock(parts, [-podiumX - 0.3, terraceTop, z - podiumZ - 0.3], [podiumX + 0.3, terraceTop + 0.7, z + podiumZ + 0.3], SURFACE.marble);
  addBlock(parts, [-podiumX - 0.18, podium - 0.5, z - podiumZ - 0.18], [podiumX + 0.18, podium - 0.05, z + podiumZ + 0.18], SURFACE.marble);
  for (let step = 0; step < crepidoma.steps; step++) {
    const out = (crepidoma.steps - 1 - step) * crepidoma.tread;
    addBlock(parts, [-halfX - out, podium + step * crepidoma.rise - 0.02, z - halfZ - out], [halfX + out, podium + (step + 1) * crepidoma.rise, z + halfZ + out], SURFACE.marble);
  }
  // The colonnade, inset from the stylobate's edge; its columns' foot in the portico's shade (STONE_FRAGMENT porch).
  const columnAt = [];
  for (let index = 0; index < columns.alongX; index++) {
    const x = -spanX + level.bayX * index;
    columnAt.push([x, z - spanZ], [x, z + spanZ]);
  }
  for (let index = 1; index < columns.alongZ - 1; index++) {
    const along = -spanZ + level.bayZ * index;
    columnAt.push([-spanX, z + along], [spanX, z + along]);
  }
  for (const [x, columnZ] of columnAt) addColumn(parts, [x, stylobate, columnZ], columns);
  // The chamber's walls behind the colonnade, open in the east three bays wide, two columns standing in the opening.
  const { cellaX, cellaZ } = level, wall = cella.wall, ceiling = stylobate + cella.ceiling;
  const opening = (cella.bays / 2) * level.bayX;
  addBlock(parts, [-cellaX, stylobate, z - cellaZ], [-opening, ceiling, z - cellaZ + wall], SURFACE.marble);
  addBlock(parts, [opening, stylobate, z - cellaZ], [cellaX, ceiling, z - cellaZ + wall], SURFACE.marble);
  addBlock(parts, [-opening, capitals, z - cellaZ], [opening, ceiling, z - cellaZ + wall], SURFACE.marble, { bottom: true });
  addBlock(parts, [-cellaX, stylobate, z + cellaZ - wall], [cellaX, ceiling, z + cellaZ], SURFACE.marble);
  for (const side of [-1, 1]) addBlock(parts, [side > 0 ? cellaX - wall : -cellaX, stylobate, z - cellaZ], [side > 0 ? cellaX : -cellaX + wall, ceiling, z + cellaZ], SURFACE.marble);
  for (const x of [-level.bayX / 2, level.bayX / 2]) addColumn(parts, [x, stylobate, z - cellaZ + wall / 2], { ...columns, height: capitals - stylobate });
  // The portico's ceiling, from the chamber's walls out to the architrave, in the shade under the roof.
  addBlock(parts, [-frontX, capitals, z - frontZ], [frontX, capitals + 0.9, z + frontZ], SURFACE.marble, { bottom: true, hollow: 0.55 });
  // Inside, lit from within (SURFACE.chamber): its lining, floor and ceiling; the rows of Ionic columns; the statue.
  const insideX = cellaX - wall, insideZ = cellaZ - wall;
  addBlock(parts, [-insideX, stylobate - 0.03, z - insideZ], [insideX, stylobate + 0.01, z + insideZ], SURFACE.chamber);
  addBlock(parts, [-insideX, ceiling - 0.6, z - insideZ], [insideX, ceiling, z + insideZ], SURFACE.chamber, { bottom: true });
  for (const side of [-1, 1]) {
    addBlock(parts, [side > 0 ? insideX - 0.05 : -insideX, stylobate, z - insideZ], [side > 0 ? insideX : -insideX + 0.05, ceiling, z + insideZ], SURFACE.chamber);
    for (let index = 0; index < 4; index++) addColumn(parts, [side * interior.rowX, stylobate, z - insideZ + 2.6 + index * ((2 * insideZ - 5.2) / 3)], { height: interior.height, foot: interior.radius, neck: interior.radius * 0.86, surface: SURFACE.chamber, ionic: true, around: 16 });
  }
  addBlock(parts, [-insideX, stylobate, z + insideZ - 0.05], [insideX, ceiling, z + insideZ], SURFACE.chamber);
  addBlock(parts, [-opening, stylobate, z - insideZ], [-insideX, ceiling, z - insideZ + 0.05], SURFACE.chamber);
  addBlock(parts, [insideX, stylobate, z - insideZ], [opening, ceiling, z - insideZ + 0.05], SURFACE.chamber);
  addStatue(parts, stylobate, z + insideZ - 6.2);
  // The entablature: the architrave, the frieze, the cornice standing out and its cresting; the attic set back.
  addBlock(parts, [-frontX, capitals, z - frontZ], [frontX, level.friezeFrom, z + frontZ], SURFACE.marble, { bottom: true });
  addBlock(parts, [-frontX + 0.04, level.friezeFrom, z - frontZ + 0.04], [frontX - 0.04, level.corniceFrom, z + frontZ - 0.04], SURFACE.frieze);
  const overhang = cornice.overhang;
  addBlock(parts, [-frontX - overhang, level.corniceFrom, z - frontZ - overhang], [frontX + overhang, level.corniceTop, z + frontZ + overhang], SURFACE.cornice, { bottom: true });
  const edgeX = frontX + overhang - 0.08, edgeZ = frontZ + overhang - 0.08, crest = level.corniceTop - 0.02;
  const corners = [[-edgeX, -edgeZ], [edgeX, -edgeZ], [edgeX, edgeZ], [-edgeX, edgeZ]];
  const outwards = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let side = 0; side < 4; side++) {
    const [x0, z0] = corners[side], [x1, z1] = corners[(side + 1) % 4];
    addPalmettes(parts, new THREE.Vector3(x0, crest, z + z0), new THREE.Vector3(x1, crest, z + z1), new THREE.Vector3(outwards[side][0], 0, outwards[side][1]), LINCOLN.cresting, 0.82);
  }
  addBlock(parts, [-level.atticX, level.corniceTop, z - level.atticZ], [level.atticX, level.atticTop - attic.cap, z + level.atticZ], SURFACE.attic);
  addBlock(parts, [-level.atticX - 0.3, level.atticTop - attic.cap, z - level.atticZ - 0.3], [level.atticX + 0.3, level.atticTop - attic.cap * 0.45, z + level.atticZ + 0.3], SURFACE.cornice, { bottom: true });
  addBlock(parts, [-level.atticX - 0.12, level.atticTop - attic.cap * 0.45, z - level.atticZ - 0.12], [level.atticX + 0.12, level.atticTop, z + level.atticZ + 0.12], SURFACE.marble);
}

/**
 * The seated Lincoln (the chamber's statue), on its pedestal at the floor `floor`, its middle at `middle` (z), facing
 * east: the chair's solid arms and its back hung with a flag, the figure in its frock coat (one draped mass from the
 * shoulders to the lap, the coat's tails down over the seat), his arms along the chair's, his hands over their ends,
 * his legs apart, his feet forward of the seat.
 */
function addStatue(parts, floor, middle) {
  const block = (from, to) => addBlock(parts, [from[0], floor + from[1], middle + from[2]], [to[0], floor + to[1], middle + to[2]], SURFACE.statue);
  const shape = (centre, radii, tilt = 0) => addEllipsoid(parts, [centre[0], floor + centre[1], middle + centre[2]], radii, SURFACE.statue, tilt);
  const limb = (from, to, radius) => addLimb(parts, [from[0], floor + from[1], middle + from[2]], [to[0], floor + to[1], middle + to[2]], radius, SURFACE.statue);
  // The pedestal and its mouldings; the chair: its seat, its arms (solid, their fronts the fasces), its back.
  block([-3.1, 0, -3.3], [3.1, 2.75, 2.7]);
  block([-3.25, 2.75, -3.45], [3.25, 3.0, 2.85]);
  block([-3.25, 0, -3.45], [3.25, 0.35, 2.85]);
  block([-1.75, 3.0, -1.2], [1.75, 4.9, 2.0]);
  for (const side of [-1, 1]) {
    block([side > 0 ? 1.75 : -2.4, 3.0, -1.35], [side > 0 ? 2.4 : -1.75, 6.05, 2.0]);
    limb([side * 2.07, 3.0, -1.3], [side * 2.07, 6.05, -1.3], 0.36);
  }
  block([-2.4, 4.9, 1.4], [2.4, 8.4, 2.2]);
  shape([0, 8.3, 1.8], [2.35, 0.42, 0.45]);
  // The flag draped over the back, falling down its sides.
  shape([0, 7.6, 2.15], [2.25, 1.0, 0.22]);
  // The figure: the coat's mass, the shoulders, the lap and its tails, the legs, the feet, the arms, the hands, the head.
  shape([0, 6.7, 0.9], [0.92, 1.5, 0.58], -0.05);
  shape([0, 6.0, 0.75], [1.0, 0.8, 0.7]);
  shape([0, 7.95, 0.9], [1.22, 0.42, 0.55]);
  block([-0.13, 6.3, 0.25], [0.13, 8.0, 0.4]);   // the coat's opening, its shirt front
  block([-0.5, 3.0, -1.05], [0.5, 5.0, 0.2]);   // the coat falling between the knees
  for (const side of [-1, 1]) {
    limb([side * 0.6, 5.3, 0.55], [side * 0.82, 5.2, -1.3], 0.44);
    limb([side * 0.84, 5.05, -1.38], [side * 0.88, 3.4, -1.5], 0.36);
    shape([side * 0.9, 3.22, -1.78], [0.34, 0.22, 0.6]);
    shape([side * 1.35, 5.0, 0.4], [0.42, 1.1, 0.9]);   // the coat's tail over the seat
    limb([side * 1.3, 7.85, 0.85], [side * 1.78, 6.55, 0.35], 0.36);
    limb([side * 1.82, 6.45, 0.35], [side * 2.05, 6.35, -0.85], 0.32);
    shape([side * 2.07, 6.18, -1.1], [0.3, 0.26, 0.4]);
  }
  limb([0, 8.2, 0.8], [0, 8.6, 0.72], 0.32);
  shape([0, 8.98, 0.62], [0.44, 0.58, 0.5], 0.08);
  shape([0, 8.78, 0.42], [0.38, 0.3, 0.28]);   // the beard
}

/**
 * The Capitol (CAPITOL), 3.4 km off, its west front to the Mall: the west
 * terrace, its walls and stairs; the central block, its west front's
 * loggia of ten columns, the corridors and the wings (the Senate's north,
 * the House's south) with their west colonnades; on the roof the dome: its
 * base, the peristyle of 36 round the drum, the attic, the ribbed shell, the
 * tholos of 12 and the statue (DOME, m over the base).
 */
function addCapitol(parts) {
  const z = CAPITOL.z, base = CAPITOL_BASE, hill = base - CAPITOL.terrace;
  const facade = { surface: SURFACE.facade }, paint = { surface: SURFACE.paint };
  // The west terrace, its walls and its stairs.
  addBlock(parts, [-98, hill - 0.5, z + 26], [98, base, z + 72], SURFACE.granite);
  addStair(parts, { halfX: 14, from: z + 79, to: z + 72, y0: hill, y1: base, count: 20 });
  for (const side of [-1, 1]) addBlock(parts, [side > 0 ? 14 : -98, base, z + 71.4], [side > 0 ? 98 : -14, base + 1.0, z + 72], SURFACE.paint, { kind: DETAIL.balustrade });
  // The central block and its west front; the loggia's columns, its shaded back, its entablature.
  addBlock(parts, [-56, base, z - 27], [56, base + DOME.base, z + 27], SURFACE.facade);
  addBlock(parts, [-33, base, z + 27], [33, base + DOME.base, z + 40], SURFACE.facade);
  addBlock(parts, [-21, base + 6.7, z + 40], [21, base + 19.8, z + 40.05], SURFACE.window, { hollow: 0.7 });
  for (let index = 0; index < 10; index++) addColumn(parts, [-20 + index * (40 / 9), base + 6.7, z + 41.3], { height: 13.1, foot: 0.62, neck: 0.52, surface: SURFACE.paint, fluted: false, around: 10 });
  addBlock(parts, [-21.6, base + 19.8, z + 40], [21.6, base + 21.6, z + 42.2], SURFACE.paint, { bottom: true });
  addBlock(parts, [-21.6, base + 21.6, z + 40], [21.6, base + DOME.base, z + 42.0], SURFACE.paint, { kind: DETAIL.balustrade });
  for (const side of [-1, 1]) {
    // The corridor, and the wing with its colonnade.
    addBlock(parts, [side > 0 ? 56 : -73, base, z - 17], [side > 0 ? 73 : -56, base + 21, z + 19], SURFACE.facade);
    addBlock(parts, [side > 0 ? 73 : -115, base, z - 37], [side > 0 ? 115 : -73, base + DOME.base, z + 33], SURFACE.facade);
    const middle = side * 94;
    addBlock(parts, [middle - 18.5, base + 6.7, z + 33], [middle + 18.5, base + 19.8, z + 33.05], SURFACE.window, { hollow: 0.7 });
    for (let index = 0; index < 10; index++) addColumn(parts, [middle - 18 + index * 4, base + 6.7, z + 34.4], { height: 13.1, foot: 0.62, neck: 0.52, surface: SURFACE.paint, fluted: false, around: 10 });
    addBlock(parts, [middle - 19.2, base + 19.8, z + 33], [middle + 19.2, base + 21.6, z + 35.3], SURFACE.paint, { bottom: true });
  }
  // The dome: its base (an octagon), the peristyle's floor, the drum behind its 36 columns, their entablature and
  // balustrade, the attic, the ribbed shell (DETAIL.shell), the tholos and its 12, its dome, the finial, the statue.
  const middle = [0, z];
  addDrum(parts, 25, base + DOME.base - 0.5, base + DOME.peristyle, middle, { surface: SURFACE.dome, kind: DETAIL.atticWall }, 8, Math.PI / 8);
  addDrum(parts, 22.2, base + DOME.peristyle, base + DOME.peristyle + 1.0, middle, paint);
  addDrum(parts, 18.6, base + DOME.peristyle + 1.0, base + DOME.attic, middle, { surface: SURFACE.dome, kind: DETAIL.drum, hollow: 0.45 });
  for (let index = 0; index < 36; index++) {
    const angle = (index / 36) * Math.PI * 2;
    addColumn(parts, [Math.cos(angle) * 20.6, base + DOME.peristyle + 1.0, z + Math.sin(angle) * 20.6], { height: DOME.columns - DOME.peristyle - 1.0, foot: 0.56, neck: 0.47, surface: SURFACE.paint, fluted: false, around: 8 });
  }
  addDrum(parts, 21.5, base + DOME.columns, base + DOME.attic, middle, paint, 72);
  addDrum(parts, 21.2, base + DOME.attic, base + DOME.attic + 1.1, middle, { surface: SURFACE.paint, kind: DETAIL.balustrade }, 72);
  addDrum(parts, 17.9, base + DOME.attic, base + DOME.shell, middle, { surface: SURFACE.dome, kind: DETAIL.atticWall }, 72);
  const shell = [];
  for (let ring = 0; ring <= 24; ring++) {
    const share = ring / 24;
    shell.push([4.6 + 12.4 * Math.sqrt(Math.max(1 - share ** 2.1, 0)), (DOME.tholos - DOME.shell) * share]);
  }
  addLathe(parts, shell, 72, [0, base + DOME.shell, z], { surface: SURFACE.dome, kind: DETAIL.shell });
  addDrum(parts, 5.1, base + DOME.tholos, base + DOME.tholos + 0.8, middle, { surface: SURFACE.paint, kind: DETAIL.balustrade }, 24);
  addDrum(parts, 3.5, base + DOME.tholos + 0.8, base + DOME.tholosTop, middle, { surface: SURFACE.dome, kind: DETAIL.drum, hollow: 0.4 }, 24);
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2;
    addColumn(parts, [Math.cos(angle) * 4.4, base + DOME.tholos + 0.8, z + Math.sin(angle) * 4.4], { height: DOME.tholosTop - DOME.tholos - 0.8, foot: 0.3, neck: 0.25, surface: SURFACE.paint, fluted: false, around: 6 });
  }
  addDrum(parts, 4.9, base + DOME.tholosTop, base + DOME.tholosTop + 0.8, middle, paint, 24);
  const cap = [];
  for (let ring = 0; ring <= 8; ring++) cap.push([4.5 * Math.cos((ring / 8) * Math.PI / 2), 2.6 * Math.sin((ring / 8) * Math.PI / 2)]);
  addLathe(parts, cap, 24, [0, base + DOME.tholosTop + 0.8, z], { surface: SURFACE.dome });
  addLathe(parts, [[0.9, 0], [0.9, 0.6], [0.55, 0.9], [0.55, 1.5], [1.0, 1.9], [1.05, 2.4], [0.4, 2.8], [0.3, 4.0]], 12, [0, base + DOME.tholosTop + 2.9, z], paint);
  addEllipsoid(parts, [0, base + DOME.statue + 2.4, z], [0.75, 2.4, 0.6], SURFACE.bronze);
  addEllipsoid(parts, [0, base + DOME.statue + 5.0, z], [0.36, 0.5, 0.36], SURFACE.bronze);
  addEllipsoid(parts, [0, base + DOME.statue + 5.65, z + 0.05], [0.18, 0.45, 0.4], SURFACE.bronze);
}

/** What stands behind the eye: the Lincoln Memorial (the header). */
export function lincolnGeometry() {
  const parts = new Parts();
  addLincoln(parts);
  return parts.geometry();
}
/** What lies ahead: the coping, the Monument, the Capitol (the header). */
export function distantGeometry() {
  const parts = new Parts();
  addCoping(parts);
  addMonument(parts);
  addCapitol(parts);
  return parts.geometry();
}

/**
 * The flags round the Monument (FLAGS): each pole, and its flag a sheet
 * FLAG_SEGMENTS long and high (`flag` its corner's place in it, 0 to 1 from
 * the hoist and the top; 0 on a pole), drawn by FLAG_VERTEX and
 * FLAG_FRAGMENT.
 */
const FLAG_SEGMENTS = [10, 4];
export function flagGeometry() {
  const positions = [], normals = [], flags = [], seeds = [], indices = [];
  const ground = mallGroundAt(MONUMENT.x, MONUMENT.z);
  for (let index = 0; index < FLAGS.count; index++) {
    const angle = (index / FLAGS.count) * Math.PI * 2;
    const x = MONUMENT.x + Math.cos(angle) * FLAGS.radius, z = MONUMENT.z + Math.sin(angle) * FLAGS.radius;
    const seed = index / FLAGS.count;
    // The pole: a square tube (it is a pixel wide from the pool).
    const first = positions.length / 3;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (const height of [0, FLAGS.pole]) {
        positions.push(x + dx * 0.06, ground + height, z + dz * 0.06);
        normals.push(dx * Math.SQRT1_2, 0, dz * Math.SQRT1_2);
        flags.push(-1, height / FLAGS.pole);
        seeds.push(seed);
      }
    }
    for (let side = 0; side < 4; side++) {
      const here = first + side * 2, next = first + ((side + 1) % 4) * 2;
      indices.push(here, next, here + 1, next, next + 1, here + 1);
    }
    // The flag: its sheet, from the pole's top; its corners placed by the wind in the vertex shader.
    const sheet = positions.length / 3;
    const [along, down] = FLAG_SEGMENTS;
    for (let row = 0; row <= down; row++) {
      for (let column = 0; column <= along; column++) {
        positions.push(x, ground + FLAGS.pole - 0.1, z);
        normals.push(0, 0, 1);
        flags.push(column / along, row / down);
        seeds.push(seed);
      }
    }
    for (let row = 0; row < down; row++) {
      for (let column = 0; column < along; column++) {
        const corner = sheet + row * (along + 1) + column;
        indices.push(corner, corner + along + 1, corner + 1, corner + 1, corner + along + 1, corner + along + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('flag', new THREE.Float32BufferAttribute(flags, 2));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += FLAGS.length + 1;
  return geometry;
}

// ---- the stone's look ----------------------------------------------------------------

export const STONE_VERTEX = /* glsl */`
attribute float surface;
attribute float hollow;
attribute vec2 detail;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vSurface;
varying float vHollow;
varying vec2 vDetail;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vSurface = surface;
  vHollow = hollow;
  vDetail = detail;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const glsl = (value) => value.toFixed(3);
// The stone's looks (SURFACE, the header): each its albedo, its relief (the normal bent), its share of the sky and of
// the floodlights; what is finer than a pixel faded to its mean (`shown`, by the pixel's footprint).
export const STONE_FRAGMENT = /* glsl */`
${MALL_COMMON}
${SUN_SHADOW}
varying vec3 vNormal;
varying float vSurface;
varying float vHollow;
varying vec2 vDetail;
#define COPING_STONE ${glsl(COPING.stone)}
#define HALF_WIDTH ${glsl(HALF)}
#define MONUMENT_CHANGE ${glsl(MONUMENT.change)}
#define FLUTES ${glsl(LINCOLN.columns.flutes)}
#define LINCOLN_Z ${glsl(LINCOLN.z)}
#define STYLOBATE ${glsl(LINCOLN_AT.stylobate)}
#define CAPITALS ${glsl(LINCOLN_AT.capitals)}
#define DRUM_HEIGHT ${glsl((LINCOLN.columns.height * 0.93) / LINCOLN.columns.drums)}
#define LINCOLN_HALVES vec2(${glsl(LINCOLN.halfX)}, ${glsl(LINCOLN.halfZ)})
#define PORCH_DEPTH ${glsl(LINCOLN.cella.inset)}
#define COLUMN_SPANS vec2(${glsl(LINCOLN_AT.spanX)}, ${glsl(LINCOLN_AT.spanZ)})
#define BAYS vec2(${glsl(LINCOLN_AT.bayX)}, ${glsl(LINCOLN_AT.bayZ)})
#define FRIEZE_FROM ${glsl(LINCOLN_AT.friezeFrom)}
#define FRIEZE_TALL ${glsl(LINCOLN.frieze)}
#define CORNICE_FROM ${glsl(LINCOLN_AT.corniceFrom)}
#define CORNICE_TALL ${glsl(LINCOLN.cornice.height)}
#define ATTIC_FROM ${glsl(LINCOLN_AT.corniceTop)}
#define ATTIC_TALL ${glsl(LINCOLN.attic.height - LINCOLN.attic.cap)}
#define TERRACE_TOP ${glsl(LINCOLN_AT.terraceTop)}
#define PAVED_HALVES vec2(${glsl(LINCOLN.halfX + 12)}, ${glsl(LINCOLN.halfZ + 12)})
#define APPROACH ${glsl(LINCOLN.upperStair.halfX + LINCOLN.cheek.width + 4)}
#define CAPITOL_AT vec2(0.0, ${glsl(CAPITOL.z)})
#define CAPITOL_BASE ${glsl(CAPITOL_BASE)}
#define SHELL_FROM ${glsl(CAPITOL_BASE + DOME.shell)}
#define SHELL_TALL ${glsl(DOME.tholos - DOME.shell)}
#define FLOOD_LIGHT vec3(0.5, 0.47, 0.42)    // the floodlights' irradiance on the stone, in the sun's units
#define CHAMBER_LIGHT vec3(0.2, 0.15, 0.09)  // the chamber's own light by day...
#define CHAMBER_NIGHT vec3(0.5, 0.36, 0.2)   // ...and after dusk
#define MARBLE vec3(0.66, 0.645, 0.61)
#define PAINTED vec3(0.68, 0.675, 0.65)

// A band from low to high in value, its edges soft over width (a pixel's footprint).
float band(float value, float low, float high, float width) { return smoothstep(low - width, low + width, value) - smoothstep(high - width, high + width, value); }
// A face's place along it (m): x on a face looking along z, z on one looking along x; and its outward axis.
float alongFace(vec3 world, vec3 normal) { return abs(normal.z) > abs(normal.x) ? world.x : world.z; }
// Incised letters in a line tall high about middle, spread over [from, to] along the face: a mean of strokes
// (each letter a few: its sides, its bars, by its hash), dark in their grooves; faded to that mean far off.
float letters(float along, float height, float from, float to, float middle, float tall, float footprint) {
  if (along < from || along > to || abs(height - middle) > tall * 0.5) return 0.0;
  float pitch = tall * 0.78;
  float cell = floor((along - from) / pitch), within = fract((along - from) / pitch);
  float up = (height - middle) / tall + 0.5;
  float pick = mallHash(vec2(cell, floor(from * 3.0)));
  float stroke = max(band(within, 0.1, 0.22, 0.02), band(within, 0.62, 0.74, 0.02) * step(0.3, pick));
  stroke = max(stroke, band(up, 0.82, 0.96, 0.03) * step(0.55, fract(pick * 7.3)) * band(within, 0.1, 0.74, 0.02));
  stroke = max(stroke, band(up, 0.04, 0.18, 0.03) * step(0.4, fract(pick * 3.1)) * band(within, 0.1, 0.74, 0.02));
  stroke = max(stroke, band(up, 0.44, 0.56, 0.03) * step(0.6, fract(pick * 5.7)) * band(within, 0.1, 0.62, 0.02));
  stroke *= step(within, 0.8) * step(0.08, fract(cell / 9.0 + 0.11));   // a gap between words
  float shown = 1.0 - smoothstep(0.03, 0.09, footprint);
  return mix(0.28, stroke, shown);
}
// A wreath about centre (m on the face) of radius radius: its leaves' ring, dark in its hollows.
float wreath(vec2 point, vec2 centre, float radius, float footprint) {
  vec2 offset = point - centre;
  float distance = length(offset), angle = atan(offset.y, offset.x);
  float ring = band(distance, radius * 0.62, radius, max(footprint, 0.015)) + 0.6 * band(distance, radius * 0.3, radius * 0.42, max(footprint, 0.015));
  float leaves = 0.5 + 0.5 * sin(angle * 18.0 + distance * 30.0);
  float shown = 1.0 - smoothstep(0.02, 0.08, footprint);
  return ring * mix(0.5, 0.35 + 0.65 * leaves, shown);
}
void main() {
  vec3 normal = normalize(vNormal);
  float footprint = length(fwidth(vWorld));
  int kind = int(vSurface + 0.5);
  int what = int(vDetail.y + 0.5);
  vec3 albedo = MARBLE;
  float skyShade = 1.0 - 0.7 * vHollow, sunShade = 1.0, floodShare = 0.0, sheen = 0.0;
  vec3 glow = vec3(0.0), emitted = vec3(0.0);   // light from within, on the albedo; light given off
  float grain = mallNoise(vWorld.xz * 3.7 + vWorld.y * 2.3) * 0.6 + mallNoise(vWorld.zy * 11.0 + vWorld.x) * 0.4;
  float along = alongFace(vWorld, normal);
  // The Lincoln Memorial's portico: the deeper under the roof and behind the columns, the less sky.
  vec2 fromMiddle = abs(vec2(vWorld.x, vWorld.z - LINCOLN_Z));
  float inset = min(LINCOLN_HALVES.x - fromMiddle.x, LINCOLN_HALVES.y - fromMiddle.y);
  float porch = inset > -0.3 && vWorld.y > STYLOBATE - 0.1 && vWorld.y < CAPITALS + 0.95 ? smoothstep(-0.3, PORCH_DEPTH, inset) : 0.0;
  if (kind == 0) {
    // The coping: its blocks along the wall, their joints; speckled; wet and green at the waterline.
    bool sideWall = abs(vWorld.x) > HALF_WIDTH - 0.01;
    float stoneAlong = sideWall ? vWorld.z : vWorld.x;
    float fromJoint = abs(fract(stoneAlong / COPING_STONE + 0.5) - 0.5) * COPING_STONE;
    float jointWidth = max(0.006, footprint * 0.7);
    float joint = (1.0 - smoothstep(0.0, jointWidth, fromJoint)) * (0.006 / jointWidth);
    float block = mallHash(vec2(floor(stoneAlong / COPING_STONE), sideWall ? sign(vWorld.x) : 3.0));
    albedo = vec3(0.4, 0.385, 0.36) * (0.9 + 0.16 * block) * (0.88 + 0.24 * grain);
    float speck = mallNoise(vWorld.xz * 90.0 + vWorld.y * 60.0);
    albedo *= 1.0 + (1.0 - smoothstep(0.004, 0.015, footprint)) * (0.3 * smoothstep(0.75, 0.9, speck) - 0.3 * smoothstep(0.25, 0.1, speck));
    albedo *= 1.0 - 0.6 * joint;
    float wetLine = (1.0 - smoothstep(0.0, 0.09, vWorld.y)) * (1.0 - step(0.5, normal.y));
    albedo = mix(albedo, albedo * vec3(0.55, 0.6, 0.5), wetLine);
    albedo = mix(albedo, vec3(0.06, 0.075, 0.04), (1.0 - smoothstep(0.0, 0.035, vWorld.y)) * (1.0 - step(0.5, normal.y)) * 0.7);
    albedo *= 1.0 - 0.35 * uWet;
    sheen = 0.2;
  } else if (kind == 1 || kind == 8 || kind == 9 || kind == 10) {
    // The memorial's Colorado marble: white, veined faintly, its blocks' joints; a sheen.
    float vein = smoothstep(0.62, 0.7, mallNoise(vec2(along * 0.9 + vWorld.y * 0.6, vWorld.y * 2.4 - along * 0.3)));
    albedo = MARBLE * (0.93 + 0.1 * grain) * (1.0 - 0.06 * vein);
    float course = abs(fract(vWorld.y / 0.81) - 0.5) * 0.81;
    float courses = (1.0 - smoothstep(0.0, max(0.008, footprint), course)) * (0.008 / max(0.008, footprint));
    sheen = 0.35;
    floodShare = 1.0;
    if (what == 1) {
      // A column: its flutes (the normal bent round the shaft, the arrises lit), its drums' joints, its necking.
      float phase = fract(vDetail.x * FLUTES / 6.2831853);
      float shown = 1.0 - smoothstep(0.03, 0.12, footprint);
      vec3 around = vec3(-sin(vDetail.x), 0.0, cos(vDetail.x));
      float across = 2.0 * phase - 1.0;   // −1 to 1 across a flute, its arrises at the ends
      normal = normalize(normal - around * across * 0.95 * shown);
      float depth = 1.0 - across * across;
      skyShade *= 1.0 - mix(0.18, 0.42 * depth, shown);
      albedo *= 1.0 + 0.12 * shown * smoothstep(0.86, 0.98, abs(across));
      float drum = abs(fract((vWorld.y - STYLOBATE) / DRUM_HEIGHT) - 0.5) * DRUM_HEIGHT;
      albedo *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, max(0.006, footprint), drum)) * (0.006 / max(0.006, footprint));
    } else if (kind == 1) {
      albedo *= 1.0 - 0.2 * courses * step(abs(normal.y), 0.5);
    }
    if (kind == 8) {
      // The frieze: the states' names over the columns, a double wreath between each, carved into the marble.
      bool longSide = abs(normal.z) > abs(normal.x);
      float span = longSide ? COLUMN_SPANS.x : COLUMN_SPANS.y, bay = longSide ? BAYS.x : BAYS.y;
      float offset = longSide ? along : along - LINCOLN_Z;
      float fromColumn = mod(offset + span + 0.5 * bay, bay) - 0.5 * bay;   // 0 over a column
      float middle = FRIEZE_FROM + 0.5 * FRIEZE_TALL;
      float carved = letters(fromColumn, vWorld.y, -1.6, 1.6, middle, 0.5, footprint);
      vec2 onFace = vec2(fromColumn, vWorld.y);
      float rings = max(wreath(onFace, vec2(0.5 * bay - 0.66, middle), 0.6, footprint), wreath(onFace, vec2(-0.5 * bay + 0.66, middle), 0.6, footprint));
      albedo *= 1.0 - 0.45 * carved - 0.4 * rings;
    } else if (kind == 9) {
      // The attic: the 48 states' names along its top, festoons hung beneath from eagles, a fillet under its cap.
      float pitch = 3.35, up = vWorld.y - ATTIC_FROM;
      float place = mod(along + 0.5 * pitch, pitch) - 0.5 * pitch;   // 0 at an eagle
      float carved = letters(place + 0.5 * pitch, up, 0.45, pitch - 0.45, ATTIC_TALL - 1.0, 0.42, footprint);
      float sag = 0.85 * (1.0 - pow(place / (0.5 * pitch), 2.0));
      float swag = band(up, ATTIC_TALL * 0.42 - sag, ATTIC_TALL * 0.42 - sag + 0.34, max(footprint, 0.02));
      float leaves = 0.6 + 0.4 * sin(along * 26.0 + up * 9.0);
      float eagle = smoothstep(0.55, 0.3, length(vec2(place * 0.9, (up - ATTIC_TALL * 0.5) * 1.3))) * (0.6 + 0.4 * step(abs(place), 0.12));
      float wings = smoothstep(0.2, 0.08, abs(up - ATTIC_TALL * 0.53 - abs(place) * 0.35)) * step(abs(place), 0.7);
      float shown = 1.0 - smoothstep(0.03, 0.12, footprint);
      float relief = max(swag * mix(0.6, leaves, shown), max(eagle, wings) * shown);
      normal = normalize(normal + vec3(0.0, 0.5, 0.0) * swag * shown);
      albedo *= 1.0 - 0.4 * carved - 0.28 * relief - 0.08 * band(up, ATTIC_TALL - 0.35, ATTIC_TALL - 0.2, footprint);
    } else if (kind == 10 && normal.y > -0.5 && normal.y < 0.5) {
      // The cornice's face: its crown moulding turned up to the sky, a shadowed fillet, a lion's head every 1.6 m.
      float up = clamp((vWorld.y - CORNICE_FROM) / CORNICE_TALL, 0.0, 1.0);
      normal = normalize(normal + vec3(0.0, 1.0, 0.0) * smoothstep(0.62, 0.95, up) * 0.9);
      albedo *= 1.0 - 0.3 * band(up, 0.55, 0.62, max(0.02, footprint / CORNICE_TALL));
      float head = length(vec2(mod(along, 1.64) - 0.82, (up - 0.75) * CORNICE_TALL) / vec2(0.17, 0.16));
      albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.7, 1.0, head)) * (1.0 - smoothstep(0.04, 0.1, footprint));
    } else if (kind == 10) {
      skyShade *= 0.7;
    }
    // Rain's streaks down the marble from the cornice and the attic's cap; the portico's shade.
    albedo *= 1.0 - 0.06 * smoothstep(0.55, 0.9, mallNoise(vec2(along * 1.7, vWorld.y * 0.12))) * step(abs(normal.y), 0.5);
    skyShade *= 1.0 - 0.62 * porch;
    floodShare *= 1.0 - 0.75 * porch;
  } else if (kind == 2) {
    // Granite terraces and stairs in courses; the terrace's top: the walk round the podium paved, lawn else.
    albedo = vec3(0.48, 0.46, 0.43) * (0.88 + 0.2 * grain);
    float course = abs(fract(vWorld.y / 0.62) - 0.5) * 0.62;
    albedo *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, max(0.01, footprint), course)) * step(abs(normal.y), 0.6) * (0.01 / max(0.01, footprint));
    float joint = abs(fract(along / 1.9 + floor(vWorld.y / 0.62) * 0.5) - 0.5) * 1.9;
    albedo *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, max(0.01, footprint), joint)) * step(abs(normal.y), 0.6) * (0.01 / max(0.01, footprint));
    if (normal.y > 0.9 && abs(vWorld.y - TERRACE_TOP + 0.4) < 0.45 && vWorld.z > LINCOLN_Z - 60.0) {
      bool paved = (fromMiddle.x < PAVED_HALVES.x && fromMiddle.y < PAVED_HALVES.y) || (fromMiddle.x < APPROACH && vWorld.z < LINCOLN_Z);
      float mottle = mallNoise(vWorld.xz * 0.4) * 0.6 + mallNoise(vWorld.xz * 3.0) * 0.4;
      albedo = paved ? vec3(0.45, 0.44, 0.41) * (0.9 + 0.2 * mottle) : vec3(0.068, 0.098, 0.036) * (0.8 + 0.4 * mottle);
    }
    albedo *= 1.0 - 0.3 * uWet;
    floodShare = 0.4;
    sheen = 0.15;
  } else if (kind == 3) {
    // The Monument: whiter below the line, warmer above; its courses (0.6 m) and their joints; its streaks.
    float height = vWorld.y - MONUMENT_FOOT;
    vec3 lower = vec3(0.74, 0.725, 0.7), upper = vec3(0.72, 0.68, 0.62);
    albedo = mix(lower, upper, smoothstep(MONUMENT_CHANGE - 0.4, MONUMENT_CHANGE + 0.4, height));
    float course = abs(fract(height / 0.61) - 0.5) * 0.61;
    float width = max(0.015, footprint);
    albedo *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, width, course)) * (0.015 / width);
    float block = abs(fract(along / 1.6 + floor(height / 0.61) * 0.5) - 0.5) * 1.6;
    albedo *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, width, block)) * (0.015 / width);
    albedo *= 0.95 + 0.07 * mallNoise(vec2(along * 0.8, height * 0.03)) - 0.05 * smoothstep(0.6, 0.9, mallNoise(vec2(along * 2.0, height * 0.12)));
    albedo *= 0.97 + 0.06 * mallHash(floor(vec2(along / 1.6 + floor(height / 0.61) * 0.5, height / 0.61)));
    floodShare = 1.0 - 0.4 * smoothstep(20.0, 165.0, height);
    sheen = 0.3;
  } else if (kind == 4) {
    // A window, or a loggia's shade; at the Monument's top the aircraft's red lights after dusk.
    albedo = vec3(0.03, 0.032, 0.035);
    skyShade = 0.35;
    if (vWorld.y > MONUMENT_FOOT + 100.0) emitted = vec3(0.6, 0.03, 0.015) * uFlood;
  } else if (kind == 5) {
    // The chamber: Indiana limestone, lit from within.
    albedo = vec3(0.58, 0.55, 0.5) * (0.9 + 0.15 * grain);
    sunShade = 0.0;
    skyShade = 0.12;
    glow = mix(CHAMBER_LIGHT, CHAMBER_NIGHT, uFlood) * (0.75 + 0.25 * smoothstep(STYLOBATE, STYLOBATE + 12.0, vWorld.y));
  } else if (kind == 6) {
    // The statue's Georgia marble, under the chamber's lights from above in front.
    albedo = vec3(0.78, 0.76, 0.72) * (0.92 + 0.12 * grain);
    sunShade = 0.0;
    skyShade = 0.25;
    float lit = 0.22 + 0.78 * max(dot(normal, normalize(vec3(0.0, 0.8, -0.6))), 0.0);
    glow = mix(CHAMBER_LIGHT * 2.2, CHAMBER_NIGHT * 2.4, uFlood) * lit;
  } else if (kind == 7) {
    // The Capitol's walls: the rusticated basement and its arched windows, the belt course, pilasters with the
    // two storeys' windows between, the entablature, the balustrade; on top, the roof.
    float up = vWorld.y - CAPITOL_BASE;
    float bay = 3.9, place = mod(along + 0.5 * bay, bay) - 0.5 * bay;   // 0 at a pilaster
    float width = max(footprint, 0.02);
    float shown = 1.0 - smoothstep(0.15, 0.6, footprint);
    albedo = PAINTED * (0.95 + 0.06 * grain);
    float dark = 0.0;
    if (up < 6.2) {
      dark += 0.35 * band(fract(up / 0.75), 0.0, 0.08, width / 0.75);
      float arch = band(abs(place - sign(place + 1e-3) * 0.5 * bay), -1.0, 0.65, width) * band(up, 1.6, 4.0 + 0.6 * sqrt(max(1.0 - pow(abs(abs(place) - 0.5 * bay) / 0.65, 2.0), 0.0)), width);
      dark = max(dark, 0.9 * arch);
    } else if (up < 6.7) {
      normal = normalize(normal + vec3(0.0, 0.6, 0.0) * shown);
    } else if (up < 19.8) {
      float pilaster = band(abs(place), -1.0, 0.45, width);
      float window = band(abs(abs(place) - 0.5 * bay), -1.0, 0.75, width);
      float panes = window * (band(up, 8.0, 11.6, width) + band(up, 14.0, 17.2, width));
      float cap = window * band(up, 11.8, 12.3 + 0.5 * (1.0 - abs(abs(place) - 0.5 * bay) / 0.9), width);
      dark = max(0.9 * panes, 0.25 * cap);
      float room = mallHash(floor(vec2(along / bay, up / 6.0) + 0.5) + floor(vWorld.xz / 400.0));
      emitted = vec3(0.16, 0.11, 0.055) * panes * step(0.55, room) * uFlood * shown;
      dark = max(dark, 0.2 * band(abs(place), 0.4, 0.55, width));
      albedo *= 1.0 + 0.04 * pilaster;
    } else if (up < 21.6) {
      dark = 0.4 * band(up, 20.9, 21.1, width);
    } else {
      float baluster = band(abs(fract(along / 0.38) - 0.5), 0.3, 0.5, width / 0.38);
      dark = 0.55 * baluster * band(up, 21.85, 22.7, width);
    }
    albedo *= 1.0 - mix(0.18, dark, shown);
    if (normal.y > 0.9) albedo = vec3(0.3, 0.3, 0.29) * (0.9 + 0.2 * grain);
    floodShare = 0.8;
  } else if (kind == 11) {
    // The dome's painted iron: the shell's 36 ribs and three tiers of windows; the attic's pilasters and windows;
    // the drum's tall windows behind the peristyle.
    vec2 fromAxis = vWorld.xz - CAPITOL_AT;
    float turn = atan(fromAxis.y, fromAxis.x) / 6.2831853;
    float shown = 1.0 - smoothstep(0.15, 0.6, footprint);
    float width = max(footprint, 0.02);
    albedo = PAINTED * (0.97 + 0.05 * grain);
    float rib = fract(turn * 36.0);
    float dark = 0.0;
    if (what == 3) {
      float up = (vWorld.y - SHELL_FROM) / SHELL_TALL;
      float ridge = 1.0 - smoothstep(0.0, 0.08 + width * 0.05, min(rib, 1.0 - rib));
      vec3 around = normalize(vec3(-fromAxis.y, 0.0, fromAxis.x));
      normal = normalize(normal + around * (rib < 0.5 ? -1.0 : 1.0) * ridge * 0.5 * shown);
      float panel = band(rib, 0.36, 0.64, width * 0.05);
      float windows = panel * (band(up, 0.08, 0.17, width / SHELL_TALL) + band(up, 0.34, 0.41, width / SHELL_TALL) + band(up, 0.6, 0.65, width / SHELL_TALL));
      dark = max(0.85 * windows, 0.12 * (1.0 - ridge));
    } else if (what == 4) {
      float pilaster = fract(turn * 72.0);
      dark = 0.75 * band(pilaster, 0.38, 0.62, width * 0.03) * band(fract((vWorld.y - CAPITOL_BASE) / 7.3), 0.25, 0.7, width / 7.3);
      dark = max(dark, 0.12 * band(pilaster, 0.0, 0.08, width * 0.03));
    } else if (what == 5) {
      dark = 0.85 * band(fract(turn * 36.0 + 0.5), 0.35, 0.65, width * 0.03) * band(fract((vWorld.y - CAPITOL_BASE) / 10.0), 0.2, 0.85, width / 10.0);
    }
    albedo *= 1.0 - mix(0.15, dark, shown);
    floodShare = 1.25;
    sheen = 0.25;
  } else if (kind == 14) {
    albedo = vec3(0.07, 0.065, 0.055);
    sheen = 0.5;
    floodShare = 0.6;
  } else {
    // Painted stone: the Capitol's columns, their entablatures; a balustrade's balusters.
    albedo = PAINTED * (0.95 + 0.06 * grain);
    if (what == 6) {
      float width = max(footprint, 0.02);
      float baluster = band(abs(fract(along / 0.38) - 0.5), 0.3, 0.5, width / 0.38);
      albedo *= 1.0 - mix(0.2, 0.6 * baluster, 1.0 - smoothstep(0.15, 0.5, footprint));
    }
    floodShare = 0.9;
    sheen = 0.2;
  }
  // Snow on what faces up.
  float snow = uSnow * smoothstep(0.6, 0.9, normal.y) * smoothstep(0.2, 0.6, 1.2 * uSnow + 0.3 * mallNoise(vWorld.xz * 0.8) - 0.3);
  albedo = mix(albedo, SNOW_ALBEDO, snow);
  if (kind != 5 && kind != 6) sunShade *= sunShadow(vWorld, normalize(vNormal));
  vec3 color = albedo * (daylight(normal, sunShade, skyShade) + FLOOD_LIGHT * uFlood * floodShare * (0.55 + 0.45 * (1.0 - abs(normal.y)))) + albedo * glow + emitted;
  // The sheen: the sun's soft highlight on polished stone, more when wet.
  vec3 toEye = normalize(cameraPosition - vWorld);
  vec3 halfway = normalize(toEye + uSunDir);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(normal, toEye), 0.0), 5.0);
  color += uSunIrradiance * sunShade * (sheen + 0.6 * uWet) * fresnel * pow(max(dot(normal, halfway), 0.0), 48.0) * 2.0 * step(0.0, dot(normal, uSunDir));
  gl_FragColor = finish(inAir(color, vWorld));
}
`;

// ---- the flags --------------------------------------------------------------------------

// A flag flies from its pole's top downwind (uWindFlag: the wind's direction over the ground, and its strength 0 to
// 1), its sheet waving along it in travelling folds, fluttering more toward the fly; a pole stands still.
export const FLAG_VERTEX = /* glsl */`
attribute vec2 flag;    // along the flag from the hoist (−1 on a pole), and down it from the top
attribute float seed;
uniform float uTime;
uniform vec3 uWindFlag;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vFlag;
#define FLAG_SIZE vec2(${FLAGS.length.toFixed(2)}, ${FLAGS.height.toFixed(2)})
void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 facing = normal;
  if (flag.x >= 0.0) {
    vec2 downwind = normalize(uWindFlag.xy + vec2(1e-4, 0.0));
    vec2 across = vec2(-downwind.y, downwind.x);
    float strength = clamp(uWindFlag.z, 0.15, 1.0);
    float phase = flag.x * 7.0 - uTime * (4.0 + 4.0 * strength) + seed * 40.0;
    float fold = sin(phase) * (0.06 + 0.22 * flag.x) * (0.5 + 0.5 * strength);
    float droop = (1.0 - strength) * flag.x * flag.x * 0.9;
    world.xz += downwind * flag.x * FLAG_SIZE.x * (1.0 - 0.25 * (1.0 - strength)) + across * fold;
    world.y -= flag.y * FLAG_SIZE.y + droop;
    float slope = cos(phase) * 7.0 * (0.06 + 0.22 * flag.x) * (0.5 + 0.5 * strength) / FLAG_SIZE.x;
    facing = normalize(vec3(across.x - downwind.x * slope, 0.0, across.y - downwind.y * slope));
  }
  vWorld = world;
  vNormal = facing;
  vFlag = flag;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;
// The flag's stars and stripes (13 stripes, the canton seven deep with its stars), both faces lit; the pole's
// aluminium.
export const FLAG_FRAGMENT = /* glsl */`
${MALL_COMMON}
varying vec3 vNormal;
varying vec2 vFlag;
#define OLD_GLORY_RED vec3(0.42, 0.04, 0.07)
#define OLD_GLORY_BLUE vec3(0.04, 0.05, 0.16)
#define CLOTH_WHITE vec3(0.78, 0.77, 0.74)
void main() {
  vec3 normal = normalize(vNormal);
  vec3 toEye = normalize(cameraPosition - vWorld);
  vec3 albedo = vec3(0.55, 0.56, 0.58);
  float through = 0.0;
  if (vFlag.x >= 0.0) {
    if (dot(normal, toEye) < 0.0) normal = -normal;
    float stripe = floor(vFlag.y * 13.0);
    albedo = mod(stripe, 2.0) < 0.5 ? OLD_GLORY_RED : CLOTH_WHITE;
    if (vFlag.x < 0.4 && vFlag.y < 7.0 / 13.0) {
      vec2 star = fract(vec2(vFlag.x * 15.0, vFlag.y * 16.7)) - 0.5;
      albedo = mix(OLD_GLORY_BLUE, CLOTH_WHITE, (1.0 - smoothstep(0.18, 0.3, length(star))) * 0.8);
    }
    through = 0.35;
  }
  vec3 light = daylight(normal, 1.0, 1.0) + uSunIrradiance * through * max(dot(-normal, uSunDir), 0.0);
  vec3 color = albedo * (light + vec3(0.5, 0.47, 0.42) * uFlood * 0.6);
  gl_FragColor = finish(inAir(color, vWorld));
}
`;
