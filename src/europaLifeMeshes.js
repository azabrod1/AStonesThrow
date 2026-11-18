// Europa's life drawn (src/europaLife.js poses it; src/main.js): no
// photograph exists of an alien, so each kind is a procedural model, built
// here from a few primitives and lit and lit up in its own shader:
//   - a plume drifter: a bell (a lathe about its axis, a metre across), a
//     bladder glowing in its crown, eight comb rows down its sides (lights
//     running down them, as a comb jelly's cilia catch light) and five
//     filaments under it. Its light is blue-green (GLOW_COLOUR: about 480 nm),
//     brightest at the bell's rim seen edge on (a thin, clear membrane: the
//     light of what is in it adds up along the eye's way through), drawn
//     additively, as light is. Its pose squeezes the bell (`pulse`); in free
//     fall nothing pulls its filaments, so they float loose and spread, and a
//     puff's thrust swings them down under it (`sag`), as anything slung
//     under a rocket hangs while it burns;
//   - an ice hopper: a body 0.7 m long, a head, six legs and a spring fork
//     tucked under its tail (a springtail's furcula), dark and frosted
//     (sunlit as the scene is), a band of light-spots down its back and two
//     at its head, glowing blue-green; crouched, its legs fold under it;
//     aloft, its fork is let go;
//   - the plume: one quad standing at the vent and turned about its upright
//     to face the eye, a faint fan of streaks rising in it.
// Their light is in the scene's radiance (the birds' way: written as radiance,
// not tone mapped), on the scale of the sun's: GLOW of what sunlit ice gives
// back, so it reads against the black sky and the ice by any light Europa's
// sky is exposed for. Hazed as the birds are (BIRD_HAZE), what is additive
// dimmed by the haze's transmittance instead.
//
// In the mirror (src/main.js's image of what is over the water, on the
// mirror's layer alone) the drifters and hoppers are drawn again, opaque,
// their distance in alpha (as the birds'); the plume is not (too faint to
// show in a reflection). Each creature is one mesh a pass, its own uniforms,
// its kind's program shared: the program of each pass built under the veil
// (warmUp). Draw calls: one a creature shown, two with its mirror image,
// one for the plume while it is up.
import * as THREE from 'three';
import { BIRD_HAZE, MIRROR_NEARNESS_SCALE, mirrorChanges as mirrorChangesOf } from './birdDrawing.js';
import { LIFE, LIFE_KINDS } from './europaLife.js';
import { withRandom, parkMiller } from './withRandom.js';

// Their light: linear sRGB of about 480 nm (blue, a little green), and how bright: GLOW times the radiance sunlit white
// ice gives back (the sun's irradiance over π), at a creature's glow of 1 (a flash takes it to 2.6 or more).
const GLOW_COLOUR = [0.03, 0.42, 0.95];
const GLOW = { drifter: 1.8, hopper: 1.6, plume: 0.1 };
const PLUME = { height: 26, base: 1.2, top: 11 };   // m: how high the plume is drawn, and how wide at its foot and top

const COMMON = /* glsl */ `
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uSunDirection;
uniform float uGlowScale;   // the radiance of a glow of 1 (src/europaLifeMeshes.js GLOW, on the sun's scale)
uniform float uGlow;
uniform float uFade;
uniform float uTime;
const vec3 GLOW_COLOUR = vec3(${GLOW_COLOUR.map((value) => value.toFixed(3)).join(', ')});
${BIRD_HAZE}
float hazeTransmittance(vec3 world) {
  return uHazeDensity > 0.0 ? exp(-uHazeDensity * length(world - cameraPosition)) : 1.0;
}
`;

// ——— The drifter ———
// aPart: 0 the bell, 1 a filament, 2 the bladder. aShare: down the bell (0 its crown, 1 its rim) or along a filament
// (0 its root, 1 its tip). aAround: the angle about its axis.
const DRIFTER_VERTEX = /* glsl */ `
${COMMON}
uniform float uPulse;
uniform float uSag;
uniform float uSlump;
attribute float aPart;
attribute float aShare;
attribute float aAround;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vViewPosition;
varying float vPart;
varying float vShare;
varying float vAround;
void main() {
  vec3 local = position;
  vec3 bent = normal;
  // A puff: the bell squeezed in toward its axis, most at its rim, and a little taller.
  float squeeze = 1.0 - 0.24 * uPulse * (0.35 + 0.65 * (aPart > 1.5 ? 0.3 : aPart > 0.5 ? 1.0 : aShare));
  if (aPart < 1.5) local.xz *= squeeze;
  local.y *= 1.0 + 0.08 * uPulse;
  if (aPart > 0.5 && aPart < 1.5) {
    // A filament below its root: floating loose and spread out in free fall, drifting slowly; swung down by thrust.
    float below = aShare;
    vec2 outward = vec2(cos(aAround), sin(aAround));
    float drift = sin(uTime * 0.6 + aAround * 2.3 + below * 2.5) * 0.2 * below;
    vec2 loose = outward * (0.6 * below) + vec2(-outward.y, outward.x) * drift;
    local.xz += mix(loose, outward * 0.03 * below, uSag);
    local.y += mix(0.65, 0.0, uSag) * below * 0.6;
  }
  // Down on the ice: the bell slumps.
  local.y *= 1.0 - 0.45 * uSlump;
  local.xz *= 1.0 + 0.2 * uSlump;
  vec4 world = modelMatrix * vec4(local, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * bent);
  vec4 mvPosition = viewMatrix * world;
  vViewPosition = -mvPosition.xyz;
  vPart = aPart;
  vShare = aShare;
  vAround = aAround;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const DRIFTER_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vViewPosition;
varying float vPart;
varying float vShare;
varying float vAround;
void main() {
  vec3 toEye = normalize(cameraPosition - vWorld);
  float edgeOn = 1.0 - abs(dot(normalize(vNormal), toEye));
  float light;
  if (vPart < 0.5) {
    // The bell: a faint membrane, bright edge on, its eight comb rows with lights running down them.
    float row = pow(max(cos(vAround * 8.0), 0.0), 24.0);
    float running = 0.45 + 0.55 * sin(vShare * 18.0 - uTime * 5.0 + vAround * 3.0);
    light = 0.12 + 0.75 * edgeOn * edgeOn * edgeOn + row * (0.5 + 0.9 * running) * smoothstep(0.05, 0.25, vShare);
    light += 0.5 * smoothstep(0.8, 1.0, vShare);   // its rim
  } else if (vPart < 1.5) {
    light = 0.4 * (1.0 - vShare) + 0.1;   // a filament, dimming to its tip
  } else {
    light = 1.6;   // the bladder
  }
  // The sun on its membrane, a little (it is nearly clear).
  float sunUp = smoothstep(-0.02, 0.2, uSunDirection.y);
  vec3 sunlit = uSunIrradiance * 0.012 * sunUp * (0.3 + edgeOn);
  vec3 radiance = (GLOW_COLOUR * light * uGlow * uGlowScale + sunlit) * uFade;
  #ifdef MIRROR
    if (vWorld.y < 0.0 || light * uGlow * uFade < 0.35) discard;
    gl_FragColor = vec4(birdHazed(radiance, vWorld), 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05));
  #else
    gl_FragColor = vec4(radiance * hazeTransmittance(vWorld), 1.0);   // added to what is behind it
  #endif
}
`;

// ——— The hopper ———
// aPart: 0 its body, 1 its head, 2 a leg, 3 its fork. aShare: down a leg (0 its hip, 1 its foot), along its fork.
const HOPPER_VERTEX = /* glsl */ `
${COMMON}
uniform float uCrouch;
uniform float uFork;
attribute float aPart;
attribute float aShare;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vViewPosition;
varying float vPart;
void main() {
  vec3 local = position;
  vec3 bent = normal;
  float lowered = 0.05 * uCrouch;
  if (aPart < 1.5) local.y -= lowered;
  else if (aPart < 2.5) { local.y -= lowered * (1.0 - aShare); local.xz *= 1.0 + 0.25 * uCrouch * aShare; }   // its feet stay, its knees spread
  else {
    // Its fork: tucked forward under it (0), or let go, swung down and back (1) about its root at the tail.
    vec3 root = vec3(-0.12, 0.06 - lowered, 0.0);
    float angle = mix(0.15, -1.1, uFork);
    vec3 offset = local - vec3(-0.12, 0.06, 0.0);
    float c = cos(angle), s = sin(angle);
    local = root + vec3(c * offset.x - s * offset.y, s * offset.x + c * offset.y, offset.z);
    bent = vec3(c * normal.x - s * normal.y, s * normal.x + c * normal.y, normal.z);
  }
  vLocal = position;
  vec4 world = modelMatrix * vec4(local, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * bent);
  vec4 mvPosition = viewMatrix * world;
  vViewPosition = -mvPosition.xyz;
  vPart = aPart;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const HOPPER_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vViewPosition;
varying float vPart;
void main() {
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal;
  // Dark, a little blue, frosted: lit by the sun and the sky as the scene is.
  vec3 albedo = vPart < 1.5 ? vec3(0.16, 0.17, 0.2) : vec3(0.1, 0.1, 0.12);
  float sunUp = smoothstep(-0.02, 0.2, uSunDirection.y);
  vec3 lit = albedo * (uSunIrradiance * max(dot(normal, uSunDirection), 0.0) * sunUp / 3.14159 + uSkyAmbient);
  // Its light: a band of spots down its back, two at its head (its eyespots, forward of it).
  float spots = 0.0;
  if (vPart < 0.5) spots = smoothstep(0.55, 0.85, normal.y * 0.5 + 0.5) * smoothstep(0.35, 0.9, 0.5 + 0.5 * cos(vLocal.x * 70.0)) * 1.4;
  else if (vPart < 1.5) spots = smoothstep(0.8, 0.95, abs(normalize(vLocal - vec3(0.17, 0.11, 0.0)).z)) * 1.6;
  vec3 radiance = lit + GLOW_COLOUR * spots * uGlow * uGlowScale;
  #ifdef MIRROR
    if (vWorld.y < 0.0) discard;
    gl_FragColor = vec4(birdHazed(radiance, vWorld), 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05));
  #else
    gl_FragColor = vec4(birdHazed(radiance, vWorld), 1.0);
  #endif
}
`;

// ——— The plume ———
const PLUME_VERTEX = /* glsl */ `
uniform vec3 uFoot;
varying vec2 vPlace;
varying vec3 vWorld;
void main() {
  // position.x from −1 to 1 across, position.y from 0 to 1 up: a fan, narrow at its foot, turned about its upright to the eye.
  vec3 toEye = cameraPosition - uFoot;
  vec3 across = normalize(vec3(-toEye.z, 0.0, toEye.x));
  float width = mix(${PLUME.base.toFixed(2)}, ${PLUME.top.toFixed(2)}, pow(position.y, 0.8));
  vec3 world = uFoot + across * position.x * width * 0.5 + vec3(0.0, position.y * ${PLUME.height.toFixed(1)}, 0.0);
  vPlace = position.xy;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;
const PLUME_FRAGMENT = /* glsl */ `
${COMMON}
uniform float uStrength;
varying vec2 vPlace;
varying vec3 vWorld;
float hash(vec2 cell) { return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 point) {
  vec2 cell = floor(point), within = fract(point);
  vec2 eased = within * within * (3.0 - 2.0 * within);
  return mix(mix(hash(cell), hash(cell + vec2(1, 0)), eased.x), mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), eased.x), eased.y);
}
void main() {
  float across = vPlace.x, up = vPlace.y;
  // Its streaks: grains thrown up in straight lines that spread (no air to stir them), rising through it.
  float streaks = 0.35 + 0.65 * noise(vec2(across * 9.0, up * 2.5 - uTime * 0.9));
  float core = exp(-across * across * 5.0);
  float height = (1.0 - up) * smoothstep(0.0, 0.04, up);
  float light = core * streaks * pow(height, 1.4) * uStrength;
  vec3 colour = mix(vec3(0.75, 0.85, 1.0), GLOW_COLOUR, 0.35 * (1.0 - up));   // ice grains in the sun, bluer near its foot
  gl_FragColor = vec4(colour * light * uGlowScale * hazeTransmittance(vWorld), 1.0);
}
`;

/** Several geometries' triangles as one, each vertex given `part`, its `share` and `around` (attributes per geometry). */
function joined(pieces) {
  const positions = [], normals = [], parts = [], shares = [], arounds = [];
  for (const { geometry, part, share = () => 0, around = () => 0 } of pieces) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = flat.attributes.position, normal = flat.attributes.normal;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      positions.push(x, y, z);
      normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      parts.push(part);
      shares.push(share(x, y, z, vertex));
      arounds.push(around(x, y, z, vertex));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setAttribute('aShare', new THREE.Float32BufferAttribute(shares, 1));
  geometry.setAttribute('aAround', new THREE.Float32BufferAttribute(arounds, 1));
  return geometry;
}

/** The drifter: its bell about its middle (y from −height/2 at its rim to height/2 at its crown), its filaments under it. */
function drifterGeometry() {
  const { span, height } = LIFE_KINDS.drifter;
  const radius = span / 2;
  // The bell's profile, crown to rim: a dome flaring a little at its rim.
  const profile = [];
  const rows = 14;
  for (let row = 0; row <= rows; row++) {
    const share = row / rows;
    const angle = share * Math.PI * 0.55;
    profile.push(new THREE.Vector2(Math.max(radius * Math.sin(angle) * (1 + 0.12 * share * share), 1e-3), height / 2 - height * (1 - Math.cos(angle)) / (1 - Math.cos(Math.PI * 0.55))));
  }
  const bell = new THREE.LatheGeometry(profile, 32);
  const shareDown = (x, y) => (height / 2 - y) / height;
  const aroundOf = (x, y, z) => Math.atan2(z, x);
  const pieces = [{ geometry: bell, part: 0, share: shareDown, around: aroundOf }];
  // The bladder, glowing in its crown.
  pieces.push({ geometry: new THREE.SphereGeometry(radius * 0.38, 12, 8).scale(1, 0.8, 1).translate(0, height * 0.12, 0), part: 2 });
  // Five filaments from the rim, each a thin strip turned to show its width either way (two crossed strips).
  const length = 1.3;
  const rim = profile[profile.length - 1];
  for (let filament = 0; filament < 5; filament++) {
    const angle = (filament + 0.3) / 5 * Math.PI * 2;
    for (const turn of [0, Math.PI / 2]) {
      const strip = new THREE.PlaneGeometry(0.03, length, 1, 8).translate(0, -length / 2, 0).rotateY(angle + turn).translate(Math.cos(angle) * rim.x * 0.85, rim.y, Math.sin(angle) * rim.x * 0.85);
      pieces.push({ geometry: strip, part: 1, share: (x, y) => (rim.y - y) / length, around: () => angle });
    }
  }
  const geometry = joined(pieces);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.35, 0), 1.6);   // its filaments wherever they float
  return geometry;
}

/** The hopper, as modelled (drawn HOPPER_SCALE times as big): its feet at y = 0, facing +x, its body's middle 0.09 up. */
function hopperGeometry() {
  const pieces = [];
  pieces.push({ geometry: new THREE.SphereGeometry(1, 16, 10).scale(0.15, 0.065, 0.075).translate(-0.01, 0.1, 0), part: 0 });
  pieces.push({ geometry: new THREE.SphereGeometry(0.055, 12, 8).scale(1.1, 0.9, 1).translate(0.17, 0.11, 0), part: 1 });
  // Six legs: from its sides down and out to its feet, each a thin box from hip to foot.
  for (const side of [-1, 1]) {
    for (const [hipX, footX] of [[0.08, 0.15], [0.0, 0.02], [-0.07, -0.12]]) {
      const hip = new THREE.Vector3(hipX, 0.085, side * 0.05), foot = new THREE.Vector3(footX, 0.0, side * 0.13);
      const legLength = hip.distanceTo(foot);
      const leg = new THREE.BoxGeometry(0.014, legLength, 0.014).translate(0, -legLength / 2, 0);
      leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), foot.clone().sub(hip).normalize())).translate(hip.x, hip.y, hip.z);
      pieces.push({ geometry: leg, part: 2, share: (x, y) => 1 - y / 0.085 });
    }
  }
  // Its fork: two prongs from under its tail, lying forward under its belly at rest.
  for (const side of [-1, 1]) pieces.push({ geometry: new THREE.BoxGeometry(0.16, 0.01, 0.012).translate(-0.12 + 0.08, 0.06, side * 0.015), part: 3 });
  const geometry = joined(pieces);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.08, 0), 0.32);
  return geometry;
}

const luminance = (vector) => 0.2126 * vector.x + 0.7152 * vector.y + 0.0722 * vector.z;
const upright = new THREE.Vector3(0, 1, 0), sideways = new THREE.Vector3(), turn = new THREE.Quaternion(), lean = new THREE.Quaternion(), spun = new THREE.Quaternion();
const HOPPER_SCALE = LIFE_KINDS.hopper.length / 0.34;   // its model is 0.34 long
const HOPPER_MIDDLE = new THREE.Vector3(0, 0.09 * HOPPER_SCALE, 0), turnedMiddle = new THREE.Vector3();

/**
 * Europa's life as drawn: `above` (the main scene), `mirror` (on `mirrorLayer` alone). show(life) gives src/europaLife.js's
 * EuropaLife its meshes; update() poses them, each frame; mirrorChanges(into, frustum) is asked once a frame drawn
 * (src/birdDrawing.js); warmUp() draws one of each in front of the camera so their programs are built under the veil.
 */
export function createEuropaLifeView(options) {
  // Made on a stream of its own: three draws each object's uuid from Math.random, and these are made at every place.
  return withRandom(parkMiller(5), () => makeView(options));
}

function makeView({ lighting, haze, mirrorLayer }) {
  const above = new THREE.Group(), mirror = new THREE.Group();
  above.name = 'europa-life';
  const geometries = { drifter: drifterGeometry(), hopper: hopperGeometry() };
  const shaders = { drifter: [DRIFTER_VERTEX, DRIFTER_FRAGMENT], hopper: [HOPPER_VERTEX, HOPPER_FRAGMENT] };
  const shared = {
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uSunDirection: { value: lighting.sunDirection },
    uTime: { value: 0 },
    ...haze,
  };
  function material(kind, pass, uniforms) {
    const [vertexShader, fragmentShader] = shaders[kind];
    const additive = kind === 'drifter' && pass === 'above';
    return new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      defines: pass === 'mirror' ? { MIRROR: '' } : {},
      transparent: additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }
  function makeSprite(kind) {
    const uniforms = { ...shared, uGlowScale: { value: 0 }, uGlow: { value: 1 }, uFade: { value: 1 }, uPulse: { value: 0 }, uSag: { value: 0 }, uSlump: { value: 0 }, uCrouch: { value: 0 }, uFork: { value: 0 } };
    const aboveMesh = new THREE.Mesh(geometries[kind], material(kind, 'above', uniforms));
    const mirrorMesh = new THREE.Mesh(geometries[kind], material(kind, 'mirror', uniforms));
    mirrorMesh.layers.set(mirrorLayer);
    for (const mesh of [aboveMesh, mirrorMesh]) { mesh.visible = false; if (kind === 'hopper') mesh.scale.setScalar(HOPPER_SCALE); }
    above.add(aboveMesh);
    mirror.add(mirrorMesh);
    return { kind, creature: null, meshes: [aboveMesh, mirrorMesh], uniforms, centre: new THREE.Vector3(), radius: geometries[kind].boundingSphere.radius * (kind === 'hopper' ? HOPPER_SCALE : 1), shown: false, mirrored: false };
  }
  // The plume: one quad, its strength and foot its own.
  const plumeUniforms = { ...shared, uGlowScale: { value: 0 }, uGlow: { value: 1 }, uFade: { value: 1 }, uStrength: { value: 0 }, uFoot: { value: new THREE.Vector3() } };
  const plumeGeometry = new THREE.PlaneGeometry(2, 1, 1, 1).translate(0, 0.5, 0);
  const plumeMesh = new THREE.Mesh(plumeGeometry, new THREE.ShaderMaterial({
    uniforms: plumeUniforms, vertexShader: PLUME_VERTEX, fragmentShader: PLUME_FRAGMENT,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  plumeMesh.frustumCulled = false;   // placed in its shader
  plumeMesh.visible = false;
  above.add(plumeMesh);

  // Every creature's meshes, made now and kept for the page's life (disposing a material's last user deletes its program).
  const sprites = [...Array.from({ length: LIFE.drifters }, () => makeSprite('drifter')), ...Array.from({ length: LIFE.hoppers }, () => makeSprite('hopper'))];
  let life = null;
  function show(population) {
    life = population;
    const creatures = [...population.drifters, ...population.hoppers];
    sprites.forEach((sprite, index) => { sprite.creature = creatures[index]; });
    update();
  }

  function update() {
    if (!life) return;
    const iceRadiance = luminance(lighting.sunIrradiance) / Math.PI;   // sunlit white ice's
    shared.uTime.value = life.plume.time;
    for (const sprite of sprites) {
      const at = sprite.creature.pose;
      sprite.shown = at.shown;
      for (const mesh of sprite.meshes) mesh.visible = at.shown;
      if (!at.shown) continue;
      const { uniforms } = sprite;
      uniforms.uGlowScale.value = GLOW[sprite.kind] * iceRadiance;
      uniforms.uGlow.value = at.glow;
      uniforms.uFade.value = at.fade;
      uniforms.uPulse.value = at.pulse;
      uniforms.uSag.value = at.sag;
      uniforms.uSlump.value = sprite.kind === 'drifter' ? at.crouch : 0;
      uniforms.uCrouch.value = at.crouch;
      uniforms.uFork.value = at.y > 0.02 ? 1 : 0;
      sprite.centre.set(at.x, at.y, at.z);
      // Turned to its heading; a drifter leaning along its way and turning slowly about its axis, a hopper somersaulting about its middle.
      turn.setFromAxisAngle(upright, at.heading);
      for (const mesh of sprite.meshes) {
        mesh.position.copy(sprite.centre);
        if (sprite.kind === 'drifter') {
          sideways.set(Math.sin(at.heading), 0, Math.cos(at.heading));   // across its way (its heading's +x turned about up is (cos, 0, −sin))
          lean.setFromAxisAngle(sideways, -at.tilt);
          mesh.quaternion.copy(lean).multiply(spun.setFromAxisAngle(upright, at.spin));
        } else {
          mesh.quaternion.copy(turn).multiply(lean.setFromAxisAngle(sideways.set(0, 0, 1), at.spin));
          // About its body's middle, not its feet.
          if (at.spin !== 0) mesh.position.add(HOPPER_MIDDLE).sub(turnedMiddle.copy(HOPPER_MIDDLE).applyQuaternion(mesh.quaternion));
        }
      }
    }
    const plume = life.plume;
    plumeMesh.visible = plume.strength > 0.002;
    plumeUniforms.uStrength.value = plume.strength;
    plumeUniforms.uGlowScale.value = GLOW.plume * iceRadiance;
    plumeUniforms.uFoot.value.set(plume.x, 0, plume.z);
  }

  const mirrorChanges = (into, frustum) => mirrorChangesOf(sprites, into, frustum, () => true);   // whatever is up moves, or glows otherwise, every frame

  function warmUp() {
    const shown = [sprites[0], sprites[sprites.length - 1]];
    const was = [...sprites.map((sprite) => sprite.meshes.map((mesh) => [mesh.visible, mesh.position.clone()])), [plumeMesh.visible]];
    for (const sprite of shown) for (const mesh of sprite.meshes) { mesh.visible = true; mesh.position.set(0, 0.3, -1.4); mesh.frustumCulled = false; }
    plumeMesh.visible = true;
    return {
      done() {
        sprites.forEach((sprite, index) => sprite.meshes.forEach((mesh, which) => { mesh.visible = was[index][which][0]; mesh.position.copy(was[index][which][1]); mesh.frustumCulled = true; }));
        plumeMesh.visible = was[was.length - 1][0];
      },
    };
  }

  return {
    above, mirror,
    show, update, mirrorChanges, warmUp,
    get drawCalls() { return sprites.reduce((sum, sprite) => sum + (sprite.shown ? sprite.meshes.length : 0), 0) + (plumeMesh.visible ? 1 : 0); },
  };
}
