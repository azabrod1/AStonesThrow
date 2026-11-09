// The birds drawn (src/birds.js flies them): photographs of real birds, cut
// out of their sky or water (tools/bird-sprites.py makes them, from Wikimedia
// Commons photographs under CC BY and CC0: assets/birds/birds.json credits
// each, and the Birds setting's note shows the credits), each frame a flat
// picture standing in the world and turned to face the camera, as a game
// draws a far bird or tree (a billboard, or impostor). Seen at a distance (the
// gulls out over the sea, the heron across the pond) a photograph is the
// real bird; what it cannot do is turn, so the birds are flown to be seen
// side on (src/birds.js: across the eye's view) and only a few frames are
// needed, each a role (frameFor), named `<kind>-<role>` in the frames:
//   - glide: wings spread, still (a soaring bird's from below, as it is seen);
//   - up, mid, down: its wingbeat, chosen by the stroke's phase while it beats
//     (a kind without mid or down glides there);
//   - front: coming at the eye or going from it (head on, its bank turning
//     the picture), for a kind that has one;
//   - land: its legs let down, taking off or landing (the heron);
//   - stand: standing in the water (the heron's photograph is cut at the
//     waterline) or on the ground (the geese's at their soles); rest, its
//     head tucked in (a goose on the Pool's lawn, src/birds.js `postures`).
// Tilted by its climb. Each frame faces left in its image; one flying (or
// standing) to the right on the screen is drawn mirrored.
//
// Lit as the scene is: the photograph's colours are its own light's, so its
// pixels are taken as the bird's colour under a bright sky, and lit by the
// sky's sun and ambient light (src/main.js `lighting`: dim at dusk, grey
// under cloud), written as radiance like the rest of the scene. Its edge is
// blended into what lies behind (the image's colour runs on under its clear
// pixels, so its edge never darkens). Two meshes a bird, each one quad and
// one draw call: `above` in the main scene, and `mirror` on the mirror's
// layer, alpha-tested, its distance in alpha (as src/boulders.js
// sceneryShader writes it), which src/main.js draws again only while a bird
// in its view moves (mirrorBounds). `below` is kept empty: nothing of a bird
// is under the water. A bird standing on dry ground (the Pool's geese) has a
// third: its shadow, a soft dark oval flat on the ground under it, along its
// body and a little away from the sun (a blob shadow, as games seat a far
// figure on the ground: a picture casts no shadow of its own), darker in
// sunlight, never gone (what lies under a bird is shaded by it whatever the
// sky). Every bird is the same three programs, built under the veil (warmUp)
// with a texel standing in for its picture. Each kind's
// pictures are one image (assets/birds/<kind>.webp, 30 to 400 KB), fetched
// the first time a place with that kind is shown and set as its birds'
// texture when it comes (a uniform: no program changes); a failed fetch
// leaves that kind unshown.
import * as THREE from 'three';
import { loadAsset } from './loadAsset.js';

const FOLDER = new URL('../assets/birds/', import.meta.url);
const FRAMES_URL = new URL('birds.json', FOLDER);
// A bird flying this nearly along the eye's line (the cosine) is drawn head on, if its kind has a front frame.
const HEAD_ON = 0.8;
// Beating harder than this (src/birds.js pose `beat`, 0 to 1), a bird shows its wingbeat; less, it glides.
const BEATING = 0.3;
// A share of the stroke (sin of the phase) beyond this is wings up (or down); within, level.
const STROKE_FRAMES = 0.35;
// Its legs let down past this (src/birds.js pose `legs`, 0 trailing to 1 standing) while it flies: taking off or landing.
const LEGS_DOWN = 0.3;
// A role a kind has no frame for falls back to the first of these it has.
const FALLBACKS = { glide: ['mid', 'down', 'up'], mid: ['glide', 'down', 'up'], down: ['mid', 'glide', 'up'], up: ['glide', 'mid', 'down'], front: [], land: ['mid', 'glide', 'down', 'up'], stand: [], rest: ['stand'] };
// How much of the sun's light falls on a bird's side as the eye sees it (a flat picture has no normal of its own), and
// the sky's ambient light's share (as the fish take it, src/fishMeshes.js).
const SUN_SHARE = 0.3;
const SKY_SHARE = 1.0;
const MIRROR_NEARNESS_SCALE = 4;   // src/boulders.js's: the mirror image's alpha is 1 − this / distance
// A standing bird's shadow: how dark its middle is in shade, and how much darker in the sun; its size against the
// picture's (along the body, across it); and how far it is cast away from the sun, a share of the picture's height
// over the sun's slope (no farther than at 20° up).
const SHADOW_CONTACT = 0.25;
const SHADOW_SUN = 0.35;
const SHADOW_SIZE = [0.95, 0.5];
const SHADOW_CAST = 0.12;

const VERTEX = /* glsl */ `
uniform vec4 uRect;      // the frame in the atlas: x, y, width, height (uv, from its top left)
uniform vec2 uSize;      // the frame's size (m)
uniform vec2 uAnchor;    // the point of it at the bird's place (a share of it: x from its left, y from its bottom)
uniform float uFlip;     // 1 as it is (facing left), -1 mirrored
uniform float uRoll;     // turned in the picture's plane (rad, anticlockwise)
varying vec2 vUv;
varying vec3 vViewPosition;
void main() {
  // The quad's corner (position.xy from 0 to 1) about the anchor, in metres, mirrored and turned, in the camera's plane.
  vec2 corner = (position.xy - uAnchor) * uSize;
  corner.x *= uFlip;
  float cosine = cos(uRoll), sine = sin(uRoll);
  corner = vec2(cosine * corner.x - sine * corner.y, sine * corner.x + cosine * corner.y);
  #ifdef MIRROR
    corner = -corner;   // the mirror's camera is upside down (src/main.js placeMirrorCamera: its up reflected), so its picture is turned round
  #endif
  vec4 middle = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 mvPosition = middle + vec4(corner, 0.0, 0.0);
  vViewPosition = -mvPosition.xyz;
  vUv = uRect.xy + vec2(position.x, 1.0 - position.y) * uRect.zw;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec3 vViewPosition;
void main() {
  vec4 picture = texture2D(uAtlas, vUv);   // linear (the atlas is sRGB, decoded as it is sampled)
  vec3 light = uSunIrradiance * ${SUN_SHARE.toFixed(2)} * smoothstep(-0.02, 0.2, uSunDirection.y) + uSkyAmbient * ${SKY_SHARE.toFixed(2)};
  vec3 radiance = picture.rgb * light;
  #ifdef MIRROR
    if (picture.a < 0.5) discard;
    gl_FragColor = vec4(radiance, 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05));
  #else
    if (picture.a < 0.02) discard;
    gl_FragColor = vec4(radiance, picture.a);
  #endif
}
`;

// The shadow: darkening what is drawn under it (its colour times 1 − alpha), most at its middle.
const SHADOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SHADOW_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirection;
varying vec2 vUv;
void main() {
  vec2 across = vUv * 2.0 - 1.0;
  float shade = (1.0 - smoothstep(0.15, 1.0, dot(across, across))) * (${SHADOW_CONTACT.toFixed(2)} + ${SHADOW_SUN.toFixed(2)} * smoothstep(0.05, 0.3, uSunDirection.y));
  gl_FragColor = vec4(0.0, 0.0, 0.0, shade);
}
`;

const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);   // corners from (0, 0) to (1, 1)
const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);   // the shadow's: lying on the ground, 1 m square about its middle
const forward = new THREE.Vector3();
const toBird = new THREE.Vector3();
const cameraRight = new THREE.Vector3();

/**
 * The birds' pictures: `above` and `mirror` for the main scene (the
 * mirror's on `mirrorLayer` alone), `below` empty. show(population) makes a
 * pair of meshes for each bird, update(population, camera) chooses each
 * one's frame and places it, mirrorBounds tells src/main.js where a moving
 * bird's mirror image is; onLoaded is called once the pictures have come.
 */
export function createBirdView({ lighting, mirrorLayer, onLoaded = () => {} }) {
  const above = new THREE.Group(), below = new THREE.Group(), mirror = new THREE.Group();
  const standIn = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  standIn.needsUpdate = true;
  const catalogue = { frames: null, atlases: null, loading: null };
  const textures = new Map();   // kind → its pictures' texture, once come (null while fetching, or if it failed)
  const shared = {
    uSunIrradiance: { value: lighting.sunIrradiance },   // filled in place by the sky (src/sky.js)
    uSkyAmbient: { value: lighting.skyAmbient },
    uSunDirection: { value: lighting.sunDirection },
  };
  const shadowMaterial = new THREE.ShaderMaterial({
    uniforms: { uSunDirection: shared.uSunDirection },
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
  // The meshes, kept for the page's life and reused from place to place (disposing a material's last user would
  // delete its program, and the next place's birds would build it mid-session).
  const pool = [];
  let sprites = [];

  /** The frames' catalogue, fetched once (null if it failed). */
  function loadCatalogue() {
    catalogue.loading ??= loadAsset(FRAMES_URL).then((data) => { catalogue.frames = data.frames; catalogue.atlases = data.atlases; }, (error) => {
      console.warn('[birds] the pictures\' catalogue failed to load; no birds shown', error);
    });
    return catalogue.loading;
  }

  /** A kind's pictures, fetched the first time it is shown; its birds stay unshown until they have come. */
  async function load(kind) {
    if (textures.has(kind)) return;
    textures.set(kind, null);
    try {
      await loadCatalogue();
      if (!catalogue.atlases?.[kind]) return;
      const bytes = await loadAsset(new URL(catalogue.atlases[kind].file, FOLDER), 'arrayBuffer');
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { imageOrientation: 'none', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;   // its rows as they lie: uv from its top left (tools/bird-sprites.py)
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      textures.set(kind, texture);
      for (const sprite of sprites) if (sprite.kind === kind) sprite.uniforms.uAtlas.value = texture;
      onLoaded();
    } catch (error) {
      console.warn(`[birds] the ${kind}'s pictures failed to load; it is not shown`, error);
    }
  }

  function material(mirrored) {
    // Every bird's materials the same two programs (their source the same), each its own frame's uniforms.
    const uniforms = {
      ...shared,
      uAtlas: { value: standIn },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uAnchor: { value: new THREE.Vector2(0.5, 0.5) },
      uFlip: { value: 1 },
      uRoll: { value: 0 },
    };
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: mirrored ? { MIRROR: '' } : {},
      transparent: !mirrored,
      depthWrite: mirrored,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }

  function makeSprite() {
    const aboveMesh = new THREE.Mesh(quad, material(false));
    const mirrorMaterial = material(true);
    mirrorMaterial.uniforms = { ...mirrorMaterial.uniforms, ...pick(aboveMesh.material.uniforms, ['uAtlas', 'uRect', 'uSize', 'uAnchor', 'uFlip', 'uRoll']) };   // one frame, both passes
    const mirrorMesh = new THREE.Mesh(quad, mirrorMaterial);
    mirrorMesh.layers.set(mirrorLayer);
    const shadow = new THREE.Mesh(flat, shadowMaterial);
    for (const mesh of [aboveMesh, mirrorMesh, shadow]) { mesh.frustumCulled = false; mesh.visible = false; }
    above.add(aboveMesh, shadow);
    mirror.add(mirrorMesh);
    return { kind: null, meshes: [aboveMesh, mirrorMesh], shadow, uniforms: aboveMesh.material.uniforms, centre: new THREE.Vector3(), radius: 1, shown: false, still: false };
  }

  function hide(sprite) {
    sprite.shown = false;
    for (const mesh of sprite.meshes) mesh.visible = false;
    sprite.shadow.visible = false;
  }

  /** The birds of a place (src/birds.js setPlace): a pair of meshes each, from the pool; each kind's pictures fetched if they have not been. */
  function show(population, camera) {
    while (pool.length < population.birds.length) pool.push(makeSprite());
    for (const sprite of pool) hide(sprite);
    sprites = population.birds.map((bird, index) => Object.assign(pool[index], { kind: bird.kind }));
    for (const sprite of sprites) sprite.uniforms.uAtlas.value = textures.get(sprite.kind) ?? standIn;
    for (const kind of new Set(sprites.map((sprite) => sprite.kind))) load(kind);
    update(population, camera);
  }

  /** Each bird's frame chosen and placed from its pose (src/birds.js showAt) as `camera` sees it. */
  function update(population, camera) {
    population.birds.forEach((bird, index) => { if (sprites[index]) place(sprites[index], bird.pose, camera); });
  }

  function place(sprite, at, camera) {
    const ready = Boolean(textures.get(sprite.kind)) && Boolean(catalogue.frames) && at.shown;
    sprite.shown = ready;
    sprite.still = Boolean(at.still);
    for (const mesh of sprite.meshes) mesh.visible = ready;
    sprite.shadow.visible = false;
    if (!ready || !camera) return;
    // Its middle where it flies; standing, its picture's foot at its spot's surface (src/birds.js laySpot: the water's
    // for the heron, whose photograph is cut there; the ground's for one on dry land).
    const standing = at.flying === false;
    sprite.centre.set(at.x, standing ? at.surface : at.y, at.z);
    for (const mesh of sprite.meshes) mesh.position.copy(sprite.centre);
    const { role, flip, roll } = frameFor(sprite.kind, at, sprite.centre, camera);
    const frame = catalogue.frames[`${sprite.kind}-${role}`];
    const uniforms = sprite.uniforms;
    sprite.radius = 0.5 * Math.max(frame.metres[0], frame.metres[1]);
    uniforms.uRect.value.fromArray(frame.uv);
    uniforms.uSize.value.fromArray(frame.metres);
    uniforms.uAnchor.value.fromArray(frame.anchor);
    uniforms.uFlip.value = flip;
    uniforms.uRoll.value = roll;
    // On dry ground, its shadow under it (the heron's water takes none).
    if (standing && at.surface > 0) {
      const { sunDirection } = lighting;
      const cast = SHADOW_CAST * frame.metres[1] / Math.max(sunDirection.y, 0.35);
      const lit = sunDirection.y > 0 ? 1 : 0;
      sprite.shadow.position.set(at.x - sunDirection.x * cast * lit, at.surface + 0.005, at.z - sunDirection.z * cast * lit);
      sprite.shadow.rotation.y = at.heading;
      sprite.shadow.scale.set(frame.metres[0] * SHADOW_SIZE[0], 1, frame.metres[0] * SHADOW_SIZE[1]);
      sprite.shadow.visible = true;
    }
  }

  /** The role a kind shows for `wanted`: the first of its fallbacks it has a frame for (FALLBACKS), or null. */
  function roleOf(kind, wanted) {
    for (const role of [wanted, ...FALLBACKS[wanted]]) if (catalogue.frames[`${kind}-${role}`]) return role;
    return null;
  }

  /**
   * Which frame a bird shows, as the camera sees it (the header): its role,
   * whether it is mirrored (−1: it goes to the right on the screen, and
   * every frame faces left) and how far it is turned in the picture's plane.
   */
  function frameFor(kind, at, centre, camera) {
    forward.set(Math.cos(at.heading), 0, -Math.sin(at.heading));   // src/birds.js: heading about up, 0 along +x
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    toBird.copy(centre).sub(camera.position).normalize();
    const flip = forward.dot(cameraRight) > 0 ? -1 : 1;
    if (at.flying === false) return { role: roleOf(kind, at.posture ?? 'stand'), flip, roll: 0 };
    const along = forward.dot(toBird);
    if (Math.abs(along) > HEAD_ON && roleOf(kind, 'front')) return { role: 'front', flip: 1, roll: at.bank * Math.sign(along) };
    let wanted = 'glide';
    if (at.legs > LEGS_DOWN) wanted = 'land';
    else if (at.beat > BEATING) {
      const stroke = Math.sin(at.phase);
      wanted = stroke > STROKE_FRAMES ? 'up' : stroke < -STROKE_FRAMES ? 'down' : 'mid';
    }
    return { role: roleOf(kind, wanted), flip, roll: -flip * at.pitch * 0.6 };
  }

  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  /**
   * The bounds of every shown bird that moves (in flight always, the heron
   * standing only while it stirs) and that the mirror's camera sees
   * (`frustum`), joined into `into`: how many.
   */
  function mirrorBounds(into, frustum) {
    let moving = 0;
    for (const sprite of sprites) {
      if (!sprite.shown || sprite.still) continue;
      sphere.set(sprite.centre, sprite.radius);
      if (!frustum.intersectsSphere(sphere)) continue;
      into.union(sphere.getBoundingBox(box));
      moving++;
    }
    return moving;
  }

  /** Under the veil (src/main.js warmUp): a bird's meshes drawn in front of the camera, so all three programs are built; done() takes them away. */
  function warmUp() {
    if (!pool.length) pool.push(makeSprite());
    const sprite = pool[0];
    for (const mesh of [...sprite.meshes, sprite.shadow]) { mesh.position.set(0, 0.3, -1.4); mesh.visible = true; }
    sprite.uniforms.uSize.value.set(0.4, 0.4);
    return { done() { if (!sprites.includes(sprite)) hide(sprite); } };
  }

  return {
    above, below, mirror,
    show, update, mirrorBounds, warmUp,
    get drawCalls() { return sprites.reduce((sum, sprite) => sum + (sprite.shown ? sprite.meshes.length : 0) + (sprite.shadow.visible ? 1 : 0), 0); },
    get count() { return sprites.filter((sprite) => sprite.shown).length; },
  };
}

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}
