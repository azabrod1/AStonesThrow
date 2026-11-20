// Europa's scenery drawn (src/europaScenery.js poses it; src/main.js):
//   - the probe: a picture of Europa Clipper, NASA/JPL's rendering of it
//     (assets/europa/clipper.webp, made by tools/europa-probe.py from
//     PIA20025, public domain; credited in CREDITS.md and credits.html), as
//     the birds are pictures of real birds (src/birdSprites.js): one quad
//     standing at the probe's place and turned to face the camera (a
//     billboard), its body where the pose puts it, as wide as the craft's
//     arrays tip to tip (30.5 m: assets/europa/clipper.json says its size),
//     turned in its plane by the pose's `roll`. It shows the arrays' cells and
//     the dish from in front, as the eye sees a craft whose arrays face a sun
//     behind it. Its pixels are taken as its colour under the sun, lit as the
//     birds' pictures are (SUN_SHARE of the sun's light, SKY_SHARE of the
//     sky's), and from below by the sunlit ice (no air: no other light, so at
//     night, the sun down, only Jupiter's light and the ice's glow are on it).
//     The picture is fetched the first time Europa's scenery is shown; till
//     it has come the probe is not drawn (a texel stands in for it, so the
//     programs are built under the veil all the same), nor if it fails;
//   - the plume: one quad standing at the vent and turned about its upright
//     to face the eye, a fan of streaks rising in it, ice grains lit by the
//     sun.
// Their light is in the scene's radiance (the birds' way: written as radiance,
// not tone mapped), on the scale of the sun's. Hazed as the birds are
// (BIRD_HAZE), what is additive dimmed by the haze's transmittance instead.
//
// In the mirror (src/main.js's image of what is over the water, on the
// mirror's layer alone) the probe is drawn again, alpha-tested, its distance
// in alpha (as the birds'); the plume is not (too faint to show in a
// reflection). Programs: the probe's above and mirror, and the plume's, all
// built under the veil (warmUp). Draw calls: two for the probe while it is
// shown (it and its mirror image), one for the plume while it is up.
import * as THREE from 'three';
import { BIRD_HAZE, MIRROR_NEARNESS_SCALE, SUN_SHARE, SKY_SHARE, loadBirdTexture, mirrorChanges as mirrorChangesOf } from './birdDrawing.js';
import { loadAsset } from './loadAsset.js';
import { withRandom, parkMiller } from './withRandom.js';
import { SCENERY_EYE } from './europaScenery.js';

const GLOW = { plume: 0.16 };   // the plume's radiance at full strength, times sunlit white ice's
const PLUME = { height: 26, base: 1.2, top: 11 };   // m: how high the plume is drawn, and how wide at its foot and top
// The probe's picture (tools/europa-probe.py writes both), and the ice under it: what of the sun its frost sends up.
const PROBE = { folder: new URL('../assets/europa/', import.meta.url), catalogue: 'clipper.json', iceAlbedo: 0.75 };

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
uniform vec2 uSize;      // the picture's size (m)
uniform vec2 uBody;      // where the body is in it (shares of its size, from its top left)
uniform float uRoll;     // turned in the picture's plane (rad, anticlockwise)
varying vec2 vPicture;
varying vec3 vViewPosition;
varying vec3 vWorld;
void main() {
  // The quad's corner (position.xy from 0 to 1, y up) about the body, in metres, turned, in the camera's plane.
  vPicture = vec2(position.x, 1.0 - position.y);
  vec2 corner = (position.xy - vec2(uBody.x, 1.0 - uBody.y)) * uSize;
  float cosine = cos(uRoll), sine = sin(uRoll);
  corner = vec2(cosine * corner.x - sine * corner.y, sine * corner.x + cosine * corner.y);
  #ifdef MIRROR
    corner = -corner;   // the mirror's camera is upside down (src/main.js placeMirrorCamera), so its picture is turned round
  #endif
  vec3 middle = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 cameraRight = vec3(1.0, 0.0, 0.0) * mat3(viewMatrix);
  vec3 cameraUp = vec3(0.0, 1.0, 0.0) * mat3(viewMatrix);
  vec3 world = middle + cameraRight * corner.x + cameraUp * corner.y;
  vWorld = world;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;
const PROBE_FRAGMENT = /* glsl */ `
${COMMON}
uniform sampler2D uPicture;
varying vec2 vPicture;
varying vec3 vViewPosition;
varying vec3 vWorld;
void main() {
  vec4 picture = texture2D(uPicture, vPicture);   // linear: the picture is sRGB, decoded as it is sampled
  vec3 sun = normalize(uSunDirection);
  float sunUp = smoothstep(-0.02, 0.2, sun.y);
  // The sun's light and the sky's, as on a bird's picture, and the sunlit ice's from below, blue off the ice.
  vec3 iceLight = uSunIrradiance * max(sun.y, 0.0) * ${(PROBE.iceAlbedo / Math.PI).toFixed(3)} * vec3(0.84, 0.92, 1.0) * 0.5;
  vec3 light = uSunIrradiance * ${SUN_SHARE.toFixed(2)} * sunUp + uSkyAmbient * ${SKY_SHARE.toFixed(2)} + iceLight;
  vec3 radiance = picture.rgb * light;
  // Fading, it grows clearer, never darker: a dark picture would show black against Jupiter or the ice.
  float alpha = picture.a * uFade;
  #ifdef MIRROR
    if (alpha < 0.5 || vWorld.y < 0.0) discard;
    gl_FragColor = vec4(birdHazed(radiance, vWorld), 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05));
  #else
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(birdHazed(radiance, vWorld), alpha);
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
const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);   // corners from (0, 0) to (1, 1)

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
  // The probe: one quad a pass, its program each pass's, its picture a texel till it has come (load).
  const standIn = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  standIn.needsUpdate = true;
  const probeUniforms = { ...shared, uGlowScale: { value: 0 }, uFade: { value: 1 }, uPicture: { value: standIn }, uSize: { value: new THREE.Vector2(1, 1) }, uBody: { value: new THREE.Vector2(0.5, 0.5) }, uRoll: { value: 0 } };
  const probeMaterial = (pass) => new THREE.ShaderMaterial({
    uniforms: probeUniforms, vertexShader: PROBE_VERTEX, fragmentShader: PROBE_FRAGMENT,
    defines: pass === 'mirror' ? { MIRROR: '' } : {}, transparent: pass !== 'mirror', depthWrite: pass === 'mirror', side: THREE.DoubleSide, toneMapped: false,
  });
  // Bounded by a sphere about the body, in the mesh's own frame (its centre the mesh's place: three moves it with the mesh), to its picture's
  // farthest corner once it has come, so a pass that does not see it does not draw it.
  const probeBounds = new THREE.Sphere(new THREE.Vector3(), 30);
  const probeQuad = new THREE.BufferGeometry();
  probeQuad.setIndex(quad.index);
  for (const [name, attribute] of Object.entries(quad.attributes)) probeQuad.setAttribute(name, attribute);
  probeQuad.boundingSphere = probeBounds;
  const probeAbove = new THREE.Mesh(probeQuad, probeMaterial('above'));
  const probeMirror = new THREE.Mesh(probeQuad, probeMaterial('mirror'));
  probeMirror.layers.set(mirrorLayer);
  for (const mesh of [probeAbove, probeMirror]) mesh.visible = false;
  above.add(probeAbove);
  mirror.add(probeMirror);
  const probeSprite = { meshes: [probeAbove, probeMirror], centre: new THREE.Vector3(), radius: probeBounds.radius, shown: false, mirrored: false };
  let picture = null;   // its loading: resolves once it has come or failed (`ready`)
  let pictured = false;   // whether it has come
  /** The picture and its size, fetched once (tools/europa-probe.py's); the probe is drawn once they have come. */
  function load() {
    picture ??= (async () => {
      try {
        const entry = await loadAsset(new URL(PROBE.catalogue, PROBE.folder));
        const texture = await loadBirdTexture(new URL(entry.file, PROBE.folder), { anisotropy: 4 });
        probeUniforms.uPicture.value = texture;
        probeUniforms.uSize.value.set(...entry.metres);
        probeUniforms.uBody.value.set(...entry.body);
        const [width, height] = entry.metres, [bodyX, bodyY] = entry.body;
        probeSprite.radius = probeBounds.radius = Math.hypot(Math.max(bodyX, 1 - bodyX) * width, Math.max(bodyY, 1 - bodyY) * height);
        pictured = true;
        update();
      } catch (error) {
        console.warn('[europa] the probe\'s picture failed to load; it is not shown', error);
      }
    })();
    return picture;
  }
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
    if (scenery.probe.shown || scenery.place === 'europa') load();
    update();
  }

  function update() {
    if (!scenery) return;
    const iceRadiance = luminance(lighting.sunIrradiance) / Math.PI;   // sunlit white ice's
    shared.uTime.value = scenery.plume.time;
    const probe = scenery.probe;
    probeSprite.shown = probe.shown && pictured;
    for (const mesh of probeSprite.meshes) {
      mesh.visible = probeSprite.shown;
      mesh.position.set(probe.x, probe.y, probe.z);
    }
    probeSprite.centre.set(probe.x, probe.y, probe.z);
    probeUniforms.uFade.value = probe.fade;
    probeUniforms.uRoll.value = probe.roll;
    const plume = scenery.plume;
    plumeMesh.visible = plume.strength > 0.002;
    plumeUniforms.uStrength.value = plume.strength;
    plumeUniforms.uGlowScale.value = GLOW.plume * iceRadiance;
    plumeUniforms.uFoot.value.set(plume.x, 0, plume.z);
  }

  const mirrorChanges = (into, frustum) => mirrorChangesOf([probeSprite], into, frustum, () => true);   // it moves every frame it is shown

  function warmUp() {
    const was = [probeAbove.visible, probeMirror.visible, probeAbove.position.clone(), plumeMesh.visible];
    for (const mesh of probeSprite.meshes) { mesh.visible = true; mesh.position.set(0, 0.3, -40); mesh.frustumCulled = false; }   // its picture or the texel, the same programs
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
    /** Resolves once the probe's picture has come (or failed), or at once if it was never asked for. */
    get ready() { return picture ?? Promise.resolve(); },
    get drawCalls() { return (probeSprite.shown ? 2 : 0) + (plumeMesh.visible ? 1 : 0); },
  };
}
