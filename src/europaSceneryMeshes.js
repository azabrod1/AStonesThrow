// Europa's scenery drawn (src/europaScenery.js poses it; src/main.js), each
// a procedural model lit in its own shader:
//   - the probe: a spacecraft after Europa Clipper as NASA and JPL describe
//     it (PROBE, metres, as built): a body, its propulsion module a cylinder
//     in crinkled silver-gold insulating blanket with the avionics vault on
//     top, a 3 m high-gain dish, two solar-array wings of five panels each
//     (each wing 14.2 by 4.1 m, 30.5 m tip to tip), the radar's long high-
//     frequency antennas (17.6 m) along the wings' top edges and its short
//     very-high-frequency ones under them, and the 8.5 m magnetometer boom.
//     Its arrays face the sun (+z of its model turned to the sun), and about
//     that line it is turned so its wings lie halfway between level and
//     across the level view's way to it (src/europaScenery.js SCENERY_EYE:
//     near broadside, not end on), then
//     rolled by the pose's `roll`: their cells dark blue under
//     glass with a hard glint where the sun's mirror image falls, their backs
//     pale. Lit by the sun, and from below by the sunlit ice (no air: no
//     other light, so its shade is the ice's blue, as the ice's own shade is:
//     src/shaders/scene.js ICE_CRUST_FILL);
//   - the plume: one quad standing at the vent and turned about its upright
//     to face the eye, a fan of streaks rising in it, ice grains lit by the
//     sun.
// Their light is in the scene's radiance (the birds' way: written as radiance,
// not tone mapped), on the scale of the sun's. Hazed as the birds are
// (BIRD_HAZE), what is additive dimmed by the haze's transmittance instead.
//
// In the mirror (src/main.js's image of what is over the water, on the
// mirror's layer alone) the probe is drawn again, opaque, its distance in
// alpha (as the birds'); the plume is not (too faint to show in a
// reflection). Programs: the probe's above and mirror, and the plume's, all
// built under the veil (warmUp). Draw calls: two for the probe while it is
// shown (it and its mirror image), one for the plume while it is up.
import * as THREE from 'three';
import { BIRD_HAZE, MIRROR_NEARNESS_SCALE, mirrorChanges as mirrorChangesOf } from './birdDrawing.js';
import { withRandom, parkMiller } from './withRandom.js';
import { SCENERY_EYE } from './europaScenery.js';

const GLOW = { plume: 0.16 };   // the plume's radiance at full strength, times sunlit white ice's
const PLUME = { height: 26, base: 1.2, top: 11 };   // m: how high the plume is drawn, and how wide at its foot and top
// The probe, metres (NASA, JPL: Europa Clipper's arrays 30.5 m tip to tip, each wing about 14.2 by 4.1 m; its dish 3 m;
// its magnetometer boom 8.5 m; its radar's high-frequency antennas 17.6 m, its very-high-frequency ones 2.76 m).
const PROBE = {
  body: { radius: 1.25, height: 3.2 }, vault: [2.0, 1.0, 2.0], dish: { radius: 1.5, depth: 0.35 },
  wing: { from: 1.25, yoke: 0.7, panels: 5, panel: [2.65, 4.1, 0.06], gap: 0.05 },
  radar: { long: 17.6, short: 2.76 }, boom: 8.5,
  albedo: { blanket: [0.78, 0.66, 0.42], cells: [0.025, 0.04, 0.11], back: [0.55, 0.56, 0.58], dish: [0.86, 0.86, 0.84], boom: [0.7, 0.7, 0.7], vault: [0.22, 0.23, 0.25] },
  iceAlbedo: 0.75,   // what of the sun the ice under it sends up (its frost's)
};
const PART = { blanket: 0, cells: 1, back: 2, dish: 3, boom: 4, vault: 5 };

const COMMON = /* glsl */ `
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uSunDirection;
uniform float uGlowScale;
uniform float uFade;
uniform float uTime;
${BIRD_HAZE}
float hazeTransmittance(vec3 world) {
  return uHazeDensity > 0.0 ? exp(-uHazeDensity * length(world - cameraPosition)) : 1.0;
}
`;

// ——— The probe ———
const PROBE_VERTEX = /* glsl */ `
attribute float aPart;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorld;
varying vec3 vViewPosition;
varying float vPart;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vLocal = position;
  vLocalNormal = normal;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * world;
  vViewPosition = -mvPosition.xyz;
  vPart = aPart;
  gl_Position = projectionMatrix * mvPosition;
}
`;
const vector = (values) => `vec3(${values.map((value) => value.toFixed(3)).join(', ')})`;
const PROBE_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorld;
varying vec3 vViewPosition;
varying float vPart;
float crinkle(vec3 point) { return fract(sin(dot(floor(point * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 toEye = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSunDirection);
  float part = vPart;
  vec3 albedo = ${vector(PROBE.albedo.boom)};
  float shine = 0.0, sharpness = 40.0;
  if (part < 0.5) {
    // Its blanket: crinkled foil, each crinkle turning the light its own way.
    float facet = crinkle(vLocal);
    albedo = ${vector(PROBE.albedo.blanket)} * (0.75 + 0.5 * facet);
    normal = normalize(normal + 0.25 * (vec3(crinkle(vLocal + 3.1), crinkle(vLocal + 7.7), crinkle(vLocal + 1.3)) - 0.5));
    shine = 0.5; sharpness = 25.0;
  } else if (part < 2.5) {
    if (vLocalNormal.z > 0.5) {
      // Its cells, under glass: a grid of them, their seams lighter; where a cell is under a few pixels, their mean.
      vec2 cellAt = vLocal.xy / vec2(0.66, 0.51);
      vec2 cell = fract(cellAt);
      float seam = 1.0 - smoothstep(0.0, 0.06, min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y)));
      float resolved = 1.0 - smoothstep(0.15, 0.4, max(fwidth(cellAt.x), fwidth(cellAt.y)));
      albedo = mix(${vector(PROBE.albedo.cells)}, vec3(0.35), 0.5 * mix(0.2, seam, resolved));
      shine = 6.0; sharpness = 400.0;
    } else {
      albedo = ${vector(PROBE.albedo.back)};
    }
  } else if (part < 3.5) {
    albedo = ${vector(PROBE.albedo.dish)};
    shine = 0.2;
  } else if (part > 4.5) {
    albedo = ${vector(PROBE.albedo.vault)};
    shine = 0.3;
  }
  float sunUp = smoothstep(-0.02, 0.2, sun.y);
  vec3 direct = uSunIrradiance * max(dot(normal, sun), 0.0) * sunUp;
  // From below, the sunlit ice: a dome of it under the probe, so what faces down takes most of it. Blue off the ice.
  vec3 iceLight = uSunIrradiance * max(sun.y, 0.0) * ${PROBE.iceAlbedo.toFixed(2)} * vec3(0.84, 0.92, 1.0) * (0.5 - 0.5 * normal.y);
  vec3 radiance = albedo * (direct + iceLight + uSkyAmbient) / 3.14159;
  // The sun's glint (Blinn's), sharp on the glass, soft on the foil.
  vec3 halfway = normalize(sun + toEye);
  radiance += uSunIrradiance * sunUp * shine * pow(max(dot(normal, halfway), 0.0), sharpness) * (sharpness + 2.0) / 25.13 * step(0.0, dot(normal, sun)) * 0.04;
  radiance *= uFade;
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
  vec3 colour = mix(vec3(0.82, 0.9, 1.0), vec3(0.45, 0.7, 1.0), 0.35 * (1.0 - up));   // ice grains in the sun, bluer near its foot
  gl_FragColor = vec4(colour * light * uGlowScale * hazeTransmittance(vWorld), 1.0);
}
`;

/** Several geometries' triangles as one, each vertex given its geometry's `part`. */
function joined(pieces) {
  const positions = [], normals = [], parts = [];
  for (const { geometry, part } of pieces) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = flat.attributes.position, normal = flat.attributes.normal;
    for (let vertex = 0; vertex < position.count; vertex++) {
      positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      parts.push(part);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  return geometry;
}

/** A thin box from `from` to `to` (Vector3s), `thick` across. */
function strut(from, to, thick) {
  const length = from.distanceTo(to);
  const box = new THREE.BoxGeometry(thick, length, thick).translate(0, length / 2, 0);
  box.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
  return box.translate(from.x, from.y, from.z);
}

/** The probe (PROBE): its body about the origin, upright along y, its wings along ±x, its arrays' cells and dish facing +z. */
function probeGeometry() {
  const { body, vault, dish, wing, radar } = PROBE;
  const pieces = [];
  pieces.push({ geometry: new THREE.CylinderGeometry(body.radius, body.radius, body.height, 24, 4), part: PART.blanket });
  pieces.push({ geometry: new THREE.CylinderGeometry(0.35, 0.7, 0.6, 16, 1, true).translate(0, -body.height / 2 - 0.3, 0), part: PART.vault });   // its engine's nozzle
  pieces.push({ geometry: new THREE.BoxGeometry(...vault).translate(0, body.height / 2 + vault[1] / 2, 0), part: PART.vault });
  // The dish: a paraboloid opening toward +z, on the body's face toward the sun.
  const profile = [];
  for (let ring = 0; ring <= 10; ring++) { const radius = Math.max(dish.radius * ring / 10, 1e-3); profile.push(new THREE.Vector2(radius, dish.depth * (ring / 10) ** 2)); }
  pieces.push({ geometry: new THREE.LatheGeometry(profile, 32).rotateX(Math.PI / 2).translate(0, 0.9, body.radius + 0.25), part: PART.dish });
  pieces.push({ geometry: strut(new THREE.Vector3(0, 0.9, body.radius + 0.25), new THREE.Vector3(0, 0.9, body.radius + 1.3), 0.05), part: PART.boom });   // its feed
  for (const side of [-1, 1]) {
    pieces.push({ geometry: strut(new THREE.Vector3(side * wing.from, 0, 0), new THREE.Vector3(side * (wing.from + wing.yoke), 0, 0), 0.18), part: PART.boom });
    const [length, height, thick] = wing.panel;
    let at = wing.from + wing.yoke;
    for (let panel = 0; panel < wing.panels; panel++) {
      pieces.push({ geometry: new THREE.BoxGeometry(length, height, thick).translate(side * (at + length / 2), 0, 0), part: PART.cells });
      at += length + wing.gap;
    }
    const middle = side * (wing.from + wing.yoke + (at - wing.from - wing.yoke) / 2);
    // The radar: a long antenna along the wing's top edge, and two short ones under it.
    pieces.push({ geometry: strut(new THREE.Vector3(middle - radar.long / 2, height / 2 + 0.25, 0), new THREE.Vector3(middle + radar.long / 2, height / 2 + 0.25, 0), 0.07), part: PART.boom });
    for (const offset of [-3.5, 3.5]) pieces.push({ geometry: new THREE.BoxGeometry(radar.short, 0.35, 0.03).translate(middle + offset, -height / 2 - 0.35, -0.05), part: PART.back });
  }
  // The magnetometer boom, down and away from the dish.
  pieces.push({ geometry: strut(new THREE.Vector3(0, -body.height / 2 + 0.3, -body.radius), new THREE.Vector3(0, -body.height / 2 + 0.3 - PROBE.boom * 0.6, -body.radius - PROBE.boom * 0.8), 0.08), part: PART.boom });
  const geometry = joined(pieces);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Europa's scenery as drawn: `above` (the main scene), `mirror` (on `mirrorLayer` alone). show(scenery) gives
 * src/europaScenery.js's EuropaScenery its meshes; update() poses them, each frame; mirrorChanges(into, frustum) is asked
 * once a frame drawn (src/birdDrawing.js); warmUp() draws each in front of the camera so their programs are built under
 * the veil.
 */
export function createEuropaSceneryView(options) {
  // Made on a stream of its own: three draws each object's uuid from Math.random, and these are made at every place.
  return withRandom(parkMiller(5), () => makeView(options));
}

const luminance = (vector) => 0.2126 * vector.x + 0.7152 * vector.y + 0.0722 * vector.z;
const toSun = new THREE.Vector3(), across = new THREE.Vector3(), upward = new THREE.Vector3(), seen = new THREE.Vector3(), basis = new THREE.Matrix4(), rolled = new THREE.Quaternion();

function makeView({ lighting, haze, mirrorLayer }) {
  const above = new THREE.Group(), mirror = new THREE.Group();
  above.name = 'europa-scenery';
  const shared = {
    uSunIrradiance: { value: lighting.sunIrradiance },
    uSkyAmbient: { value: lighting.skyAmbient },
    uSunDirection: { value: lighting.sunDirection },
    uTime: { value: 0 },
    ...haze,
  };
  // The probe: one mesh a pass, its program each pass's.
  const probeUniforms = { ...shared, uGlowScale: { value: 0 }, uFade: { value: 1 } };
  const probeGeometryMade = probeGeometry();
  const probeMaterial = (pass) => new THREE.ShaderMaterial({
    uniforms: probeUniforms, vertexShader: PROBE_VERTEX, fragmentShader: PROBE_FRAGMENT,
    defines: pass === 'mirror' ? { MIRROR: '' } : {}, side: THREE.DoubleSide, toneMapped: false,
  });
  const probeAbove = new THREE.Mesh(probeGeometryMade, probeMaterial('above'));
  const probeMirror = new THREE.Mesh(probeGeometryMade, probeMaterial('mirror'));
  probeMirror.layers.set(mirrorLayer);
  for (const mesh of [probeAbove, probeMirror]) mesh.visible = false;
  above.add(probeAbove);
  mirror.add(probeMirror);
  const probeSprite = { meshes: [probeAbove, probeMirror], centre: new THREE.Vector3(), radius: probeGeometryMade.boundingSphere.radius, shown: false, mirrored: false };
  // The plume: one quad, its strength and foot its own.
  const plumeUniforms = { ...shared, uGlowScale: { value: 0 }, uFade: { value: 1 }, uStrength: { value: 0 }, uFoot: { value: new THREE.Vector3() } };
  const plumeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1, 1, 1).translate(0, 0.5, 0), new THREE.ShaderMaterial({
    uniforms: plumeUniforms, vertexShader: PLUME_VERTEX, fragmentShader: PLUME_FRAGMENT,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  plumeMesh.frustumCulled = false;   // placed in its shader
  plumeMesh.visible = false;
  above.add(plumeMesh);

  let scenery = null;
  function show(given) {
    scenery = given;
    update();
  }

  /** The probe turned so its arrays face the sun, its wings across the level view's way to it, rolled `roll` about the sun's line. */
  function orient(mesh, roll) {
    toSun.copy(lighting.sunDirection).normalize();
    seen.set(mesh.position.x - SCENERY_EYE.x, mesh.position.y - SCENERY_EYE.y, mesh.position.z - SCENERY_EYE.z).normalize();
    // Broadside to the eye, eased halfway to level (both across the sun's line, so their mean is too): as NASA's view has it.
    across.crossVectors(toSun, seen).normalize();
    upward.set(0, 1, 0).cross(toSun).normalize();
    if (across.dot(upward) < 0) across.negate();
    across.add(upward);
    if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
    across.normalize();
    upward.crossVectors(toSun, across);
    basis.makeBasis(across, upward, toSun);
    mesh.quaternion.setFromRotationMatrix(basis).premultiply(rolled.setFromAxisAngle(toSun, roll));
  }

  function update() {
    if (!scenery) return;
    const iceRadiance = luminance(lighting.sunIrradiance) / Math.PI;   // sunlit white ice's
    shared.uTime.value = scenery.plume.time;
    const probe = scenery.probe;
    probeSprite.shown = probe.shown;
    for (const mesh of probeSprite.meshes) {
      mesh.visible = probe.shown;
      if (!probe.shown) continue;
      mesh.position.set(probe.x, probe.y, probe.z);
      orient(mesh, probe.roll);
    }
    probeSprite.centre.set(probe.x, probe.y, probe.z);
    probeUniforms.uFade.value = probe.fade;
    const plume = scenery.plume;
    plumeMesh.visible = plume.strength > 0.002;
    plumeUniforms.uStrength.value = plume.strength;
    plumeUniforms.uGlowScale.value = GLOW.plume * iceRadiance;
    plumeUniforms.uFoot.value.set(plume.x, 0, plume.z);
  }

  const mirrorChanges = (into, frustum) => mirrorChangesOf([probeSprite], into, frustum, () => true);   // it moves every frame it is shown

  function warmUp() {
    const was = [probeAbove.visible, probeMirror.visible, probeAbove.position.clone(), plumeMesh.visible];
    for (const mesh of probeSprite.meshes) { mesh.visible = true; mesh.position.set(0, 0.3, -40); mesh.frustumCulled = false; }
    plumeMesh.visible = true;
    return {
      done() {
        for (const mesh of probeSprite.meshes) { mesh.position.copy(was[2]); mesh.frustumCulled = true; }
        probeAbove.visible = was[0];
        probeMirror.visible = was[1];
        plumeMesh.visible = was[3];
      },
    };
  }

  return {
    above, mirror,
    show, update, mirrorChanges, warmUp,
    get drawCalls() { return (probeSprite.shown ? 2 : 0) + (plumeMesh.visible ? 1 : 0); },
  };
}
