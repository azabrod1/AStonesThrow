// The birds drawn (src/birds.js flies them): photographs of real birds, cut
// out of their sky or water (tools/bird-sprites.py makes them, from Wikimedia
// Commons photographs under CC BY and CC0: assets/birds/birds.json credits
// each, and the Birds setting's note shows the credits), each frame a flat
// picture standing in the world and turned to face the camera, as a game
// draws a far bird or tree (a billboard, or impostor). Seen at a distance (the
// gulls out over the sea, the heron across the pond) a photograph is the
// real bird; what it cannot do is turn, so the birds are flown to be seen
// side on (src/birds.js: the heron flushes along the bank and lands in along
// it) and only a few frames are needed:
//   - a gull: gliding, its wings raised (it flaps by turns between the two
//     while it beats), and coming at the eye or going from it (head on, its
//     bank turning the picture);
//   - the heron: standing in the water (its photograph cut at the waterline),
//     and flying: its wings up, level and down by its wingbeat, and with its
//     legs let down as it takes off and lands; tilted by its climb.
// Each frame faces left in the atlas; one flying (or standing) to the right
// on the screen is drawn mirrored (frameFor).
//
// Lit as the scene is: the photograph's colours are its own light's, so its
// pixels are taken as the bird's colour under a bright sky, and lit by the
// sky's sun and ambient light (src/main.js `lighting`: dim at dusk, grey
// under cloud), written as radiance like the rest of the scene. Its edge is
// blended into what lies behind (the atlas's colour runs on under its clear
// pixels, so its edge never darkens). Two meshes a bird, each one quad and
// one draw call: `above` in the main scene, and `mirror` on the mirror's
// layer, alpha-tested, its distance in alpha (as src/boulders.js
// sceneryShader writes it), which src/main.js draws again only while a bird
// in its view moves (mirrorBounds). `below` is kept empty: nothing of a bird
// is under the water. Every bird is the same two programs, built under the
// veil (warmUp) with a texel standing in for the atlas, which is fetched
// once a place with birds is first shown and swapped in when it comes (no
// program changes); a failed fetch leaves the birds unshown.
import * as THREE from 'three';
import { loadAsset } from './loadAsset.js';

const ATLAS_URL = new URL('../assets/birds/birds.webp', import.meta.url);
const FRAMES_URL = new URL('../assets/birds/birds.json', import.meta.url);
// How wide a moving bird's mirror image is taken to be round its middle (m), for mirrorBounds.
const RADIUS = { heron: 1.0, gull: 0.8 };
// A gull flying this nearly along the eye's line (the cosine) is drawn head on.
const HEAD_ON = 0.8;
// The heron's wingbeat: a share of its stroke (sin of the phase) beyond this is wings up (or down); within, level.
const STROKE_FRAMES = 0.35;
// Its legs let down past this (src/birds.js pose `legs`, 0 trailing to 1 standing) while it flies: taking off or landing.
const LEGS_DOWN = 0.3;
// How much of the sun's light falls on a bird's side as the eye sees it (a flat picture has no normal of its own), and
// the sky's ambient light's share (as the fish take it, src/fishMeshes.js).
const SUN_SHARE = 0.3;
const SKY_SHARE = 1.0;
const MIRROR_NEARNESS_SCALE = 4;   // src/boulders.js's: the mirror image's alpha is 1 − this / distance

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

const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);   // corners from (0, 0) to (1, 1)
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
  const atlas = { texture: standIn, frames: null, loading: null };
  const shared = {
    uAtlas: { value: standIn },
    uSunIrradiance: { value: lighting.sunIrradiance },   // filled in place by the sky (src/sky.js)
    uSkyAmbient: { value: lighting.skyAmbient },
    uSunDirection: { value: lighting.sunDirection },
  };
  // The meshes, kept for the page's life and reused from place to place (disposing a material's last user would
  // delete its program, and the next place's birds would build it mid-session).
  const pool = [];
  let sprites = [];

  /** The atlas and its frames, fetched once; the birds stay unshown until both have come. */
  function load() {
    atlas.loading ??= (async () => {
      try {
        const [frames, bytes] = await Promise.all([loadAsset(FRAMES_URL), loadAsset(ATLAS_URL, 'arrayBuffer')]);
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { imageOrientation: 'none', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const texture = new THREE.Texture(bitmap);
        texture.flipY = false;   // its rows as they lie: uv from its top left (tools/bird-sprites.py)
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        atlas.texture = texture;
        atlas.frames = frames.frames;
        shared.uAtlas.value = texture;
        onLoaded();
      } catch (error) {
        console.warn('[birds] pictures failed to load; no birds shown', error);
      }
    })();
    return atlas.loading;
  }

  function material(mirrored) {
    // Every bird's materials the same two programs (their source the same), each its own frame's uniforms.
    const uniforms = {
      ...shared,
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
    mirrorMaterial.uniforms = { ...mirrorMaterial.uniforms, ...pick(aboveMesh.material.uniforms, ['uRect', 'uSize', 'uAnchor', 'uFlip', 'uRoll']) };   // one frame, both passes
    const mirrorMesh = new THREE.Mesh(quad, mirrorMaterial);
    mirrorMesh.layers.set(mirrorLayer);
    for (const mesh of [aboveMesh, mirrorMesh]) { mesh.frustumCulled = false; mesh.visible = false; }
    above.add(aboveMesh);
    mirror.add(mirrorMesh);
    return { kind: null, meshes: [aboveMesh, mirrorMesh], uniforms: aboveMesh.material.uniforms, centre: new THREE.Vector3(), shown: false, still: false };
  }

  function hide(sprite) {
    sprite.shown = false;
    for (const mesh of sprite.meshes) mesh.visible = false;
  }

  /** The birds of a place (src/birds.js setPlace): a pair of meshes each, from the pool; the atlas fetched if it has not been. */
  function show(population, camera) {
    while (pool.length < population.birds.length) pool.push(makeSprite());
    for (const sprite of pool) hide(sprite);
    sprites = population.birds.map((bird, index) => Object.assign(pool[index], { kind: bird.kind }));
    if (sprites.length) load();
    update(population, camera);
  }

  /** Each bird's frame chosen and placed from its pose (src/birds.js showAt) as `camera` sees it. */
  function update(population, camera) {
    population.birds.forEach((bird, index) => { if (sprites[index]) place(sprites[index], bird.pose, camera); });
  }

  function place(sprite, at, camera) {
    const ready = Boolean(atlas.frames) && at.shown;
    sprite.shown = ready;
    sprite.still = Boolean(at.still);
    for (const mesh of sprite.meshes) mesh.visible = ready;
    if (!ready || !camera) return;
    // Its middle where it flies; standing, its picture's foot at the water's surface (its photograph is cut there).
    const standing = at.flying === false;
    sprite.centre.set(at.x, standing ? 0 : at.y, at.z);
    for (const mesh of sprite.meshes) mesh.position.copy(sprite.centre);
    const { name, flip, roll } = frameFor(sprite.kind, at, sprite.centre, camera);
    const frame = atlas.frames[name];
    const uniforms = sprite.uniforms;
    uniforms.uRect.value.fromArray(frame.uv);
    uniforms.uSize.value.fromArray(frame.metres);
    uniforms.uAnchor.value.fromArray(frame.anchor);
    uniforms.uFlip.value = flip;
    uniforms.uRoll.value = roll;
  }

  /**
   * Which frame a bird shows, as the camera sees it (the header): its name,
   * whether it is mirrored (−1: it goes to the right on the screen, and
   * every frame faces left) and how far it is turned in the picture's plane.
   */
  function frameFor(kind, at, centre, camera) {
    forward.set(Math.cos(at.heading), 0, -Math.sin(at.heading));   // src/birds.js: heading about up, 0 along +x
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    toBird.copy(centre).sub(camera.position).normalize();
    const flip = forward.dot(cameraRight) > 0 ? -1 : 1;
    if (kind === 'gull') {
      const along = forward.dot(toBird);
      if (Math.abs(along) > HEAD_ON) return { name: 'gull-front', flip: 1, roll: at.bank * Math.sign(along) };
      const name = at.beat > 0.5 && Math.sin(at.phase) > 0 ? 'gull-up' : 'gull-glide';
      return { name, flip, roll: -flip * at.pitch };
    }
    if (at.flying === false) return { name: 'heron-stand', flip, roll: 0 };
    let name = 'heron-mid';
    if (at.legs > LEGS_DOWN) name = 'heron-land';
    else if (at.beat > 0.3) {
      const stroke = Math.sin(at.phase);
      name = stroke > STROKE_FRAMES ? 'heron-up' : stroke < -STROKE_FRAMES ? 'heron-down' : 'heron-mid';
    }
    return { name, flip, roll: -flip * at.pitch * 0.6 };
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
      sphere.set(sprite.centre, RADIUS[sprite.kind]);
      if (!frustum.intersectsSphere(sphere)) continue;
      into.union(sphere.getBoundingBox(box));
      moving++;
    }
    return moving;
  }

  /** Under the veil (src/main.js warmUp): a bird's pair of meshes drawn in front of the camera, so both programs are built; done() takes them away. */
  function warmUp() {
    if (!pool.length) pool.push(makeSprite());
    const sprite = pool[0];
    for (const mesh of sprite.meshes) { mesh.position.set(0, 0.3, -1.4); mesh.visible = true; }
    sprite.uniforms.uSize.value.set(0.4, 0.4);
    return { done() { if (!sprites.includes(sprite)) hide(sprite); } };
  }

  return {
    above, below, mirror,
    show, update, mirrorBounds, warmUp, load,
    get drawCalls() { return sprites.reduce((sum, sprite) => sum + (sprite.shown ? sprite.meshes.length : 0), 0); },
    get count() { return sprites.filter((sprite) => sprite.shown).length; },
  };
}

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}
