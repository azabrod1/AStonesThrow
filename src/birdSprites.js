// The birds drawn as pictures (src/birds.js flies them; a kind with a model
// is drawn by src/birdMeshes.js instead): photographs of real birds, cut out
// of their sky (tools/bird-sprites.py makes them, from Wikimedia Commons
// photographs: assets/birds/birds.json credits each, and tools/bird-credits.mjs
// lists them in CREDITS.md and credits.html), each frame a flat picture
// standing in the world and turned to face the camera, as a game draws a far
// bird or tree (a billboard, or impostor). Seen at a distance (the gulls out
// over the sea, the ibises over the dam) a photograph is the real bird; what
// it cannot do is turn, so the birds are flown to be seen side on
// (src/birds.js: across the eye's view) and only a few frames are needed,
// each a role (weigh), named `<kind>-<role>` in the frames:
//   - glide: wings spread, still (a soaring bird's from below, as it is seen);
//     in a flock, every other bird (by its place in it: src/birds.js `rank`)
//     glides with its wings held lower, its down frame, so a flock gliding
//     together is not one picture over and over;
//   - up, mid, down: its wingbeat, chosen by the stroke's phase while it beats
//     (a kind without mid or down glides there);
//   - front: coming at the eye or going from it (head on, its bank turning
//     the picture), for a kind that has one.
// Tilted by its climb. Each frame faces left in its image; one flying to the
// right of the eye's line to it is drawn mirrored, so a bird that turns
// through that line (a kind that turns has a front frame) changes sides
// while it is head on. A few frames would step: as a game's flipbook does,
// a bird shows two at once, the one it is leaving fading into the one it is
// coming to (BLEND), over a short part of the stroke and of each change
// between gliding, beating and head on (`weigh`), both in one quad that
// covers the two. Pictures only fly: a bird that stands (the heron) is a
// model.
//
// Lit as the scene is: the photograph's colours are its own light's, so its
// pixels are taken as the bird's colour under a bright sky, and lit by the
// sky's sun and ambient light (src/main.js `lighting`: dim at dusk, grey
// under cloud), written as radiance like the rest of the scene, and faded
// into the weather's haze as it is (BIRD_HAZE, src/birdMeshes.js). Its edge is
// blended into what lies behind (the image's colour runs on under its clear
// pixels, so its edge never darkens). Two meshes a bird, each one quad and
// one draw call: `above` in the main scene, and `mirror` on the mirror's
// layer, alpha-tested, its distance in alpha (as src/boulders.js
// sceneryShader writes it), which src/main.js draws again only while a bird
// in its view changes (mirrorBounds: its frame or its place not last
// frame's); both drop what is under the still surface (y < 0). Every bird is
// the same two programs, built under the veil (warmUp) with a texel standing
// in for its picture. Each kind's pictures are one image
// (assets/birds/<kind>.webp, 25 to 125 KB), fetched the first time a place
// and hour with that kind is shown (a night kind not by day) and set as its birds' texture when it comes (a
// uniform: no program changes); a failed fetch leaves that kind unshown.
import * as THREE from 'three';
import { loadAsset } from './loadAsset.js';
import { boundedGeometry, loadBirdTexture, mirrorBoundsOf, BIRD_HAZE, SUN_SHARE, SKY_SHARE, MIRROR_NEARNESS_SCALE } from './birdMeshes.js';

const FOLDER = new URL('../assets/birds/', import.meta.url);
const FRAMES_URL = new URL('birds.json', FOLDER);
// A bird flying this nearly along the eye's line (the cosine) is drawn head on, if its kind has a front frame.
const HEAD_ON = 0.8;
// Beating harder than this (src/birds.js pose `beat`, 0 to 1), a bird shows its wingbeat; less, it glides.
const BEATING = 0.3;
// A share of the stroke (sin of the phase) beyond this is wings up (or down); within, level.
const STROKE_FRAMES = 0.35;
// How wide each fade between two frames is: a share of the stroke, of the beat, and of the head-on cosine either side of
// where the frame changes.
const BLEND = { stroke: 0.2, beat: 0.1, front: 0.015 };
// A role a kind has no frame for falls back to the first of these it has.
const FALLBACKS = { glide: ['mid', 'down', 'up'], mid: ['glide', 'down', 'up'], down: ['mid', 'glide', 'up'], up: ['glide', 'mid', 'down'], front: [] };
// A flat picture has no normal of its own: SUN_SHARE of the sun's light falls on its side as the eye sees it, and
// SKY_SHARE of the sky's ambient light (src/birdMeshes.js, as the fish take it, src/fishMeshes.js).

// Two frames, A and B (B's share uShare): each its place in the atlas (x, y, width, height: uv, from its top left), its
// size (m), its anchor (the point of it at the bird's place: a share of it, x from its left, y from its bottom) and
// whether it is mirrored (1 as it is, facing left; −1 mirrored).
const FRAMES = /* glsl */ `
uniform vec4 uRectA, uRectB;
uniform vec2 uSizeA, uSizeB;
uniform vec2 uAnchorA, uAnchorB;
uniform float uFlipA, uFlipB;
`;

const VERTEX = /* glsl */ `
${FRAMES}
uniform vec4 uBox;       // the two frames' box about the anchor (m, mirrored as drawn): left, bottom, right, top
uniform float uRoll;     // turned in the picture's plane (rad, anticlockwise)
varying vec2 vCorner;
varying vec3 vViewPosition;
varying vec3 vWorld;
void main() {
  // The quad's corner (position.xy from 0 to 1) in the box about the anchor, in metres, turned, in the camera's plane.
  vec2 corner = mix(uBox.xy, uBox.zw, position.xy);
  vCorner = corner;
  float cosine = cos(uRoll), sine = sin(uRoll);
  corner = vec2(cosine * corner.x - sine * corner.y, sine * corner.x + cosine * corner.y);
  #ifdef MIRROR
    corner = -corner;   // the mirror's camera is upside down (src/main.js placeMirrorCamera: its up reflected), so its picture is turned round
  #endif
  vec3 middle = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 cameraRight = vec3(1.0, 0.0, 0.0) * mat3(viewMatrix);   // the camera's plane in the world
  vec3 cameraUp = vec3(0.0, 1.0, 0.0) * mat3(viewMatrix);
  vec3 world = middle + cameraRight * corner.x + cameraUp * corner.y;
  vWorld = world;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT = /* glsl */ `
${FRAMES}
uniform float uShare;
uniform sampler2D uAtlas;
uniform vec3 uSunIrradiance;
uniform vec3 uSkyAmbient;
uniform vec3 uSunDirection;
${BIRD_HAZE}
varying vec2 vCorner;
varying vec3 vViewPosition;
varying vec3 vWorld;
// A frame's picture at this point of the quad (clear outside it): linear (the atlas is sRGB, decoded as it is sampled).
vec4 framePicture(vec4 rect, vec2 size, vec2 anchor, float flip) {
  vec2 inFrame = vec2(vCorner.x * flip, vCorner.y) / size + anchor;
  vec2 clamped = clamp(inFrame, 0.0, 1.0);
  vec4 picture = texture2D(uAtlas, rect.xy + vec2(clamped.x, 1.0 - clamped.y) * rect.zw);
  return inFrame == clamped ? picture : vec4(picture.rgb, 0.0);
}
void main() {
  vec4 first = framePicture(uRectA, uSizeA, uAnchorA, uFlipA), second = framePicture(uRectB, uSizeB, uAnchorB, uFlipB);
  float alphaA = first.a * (1.0 - uShare), alphaB = second.a * uShare;
  vec4 picture = vec4((first.rgb * alphaA + second.rgb * alphaB) / max(alphaA + alphaB, 1e-4), alphaA + alphaB);
  vec3 light = uSunIrradiance * ${SUN_SHARE.toFixed(2)} * smoothstep(-0.02, 0.2, uSunDirection.y) + uSkyAmbient * ${SKY_SHARE.toFixed(2)};
  if (vWorld.y < 0.0) discard;   // under the still surface
  vec3 radiance = picture.rgb * light;
  #ifdef MIRROR
    if (picture.a < 0.5) discard;
    gl_FragColor = vec4(birdHazed(radiance, vWorld), 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05));
  #else
    if (picture.a < 0.02) discard;
    gl_FragColor = vec4(birdHazed(radiance, vWorld), picture.a);
  #endif
}
`;

const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);   // corners from (0, 0) to (1, 1)
const forward = new THREE.Vector3();
const toBird = new THREE.Vector3();

/**
 * The birds' pictures: `above` and `mirror` for the main scene (the
 * mirror's on `mirrorLayer` alone), and `below`, empty (nothing of a flying
 * picture is under the water; src/birdMeshes.js's `below` has the heron's
 * legs). show(population) makes the meshes for each bird, update(population,
 * camera) chooses each one's frame and places it, mirrorBounds tells
 * src/main.js where a moving bird's mirror image is; onLoaded is called once
 * the pictures have come. A kind that `modelled` says is drawn as a model
 * (src/birdMeshes.js) is left to it: never fetched or shown here.
 */
export function createBirdView({ lighting, haze, mirrorLayer, onLoaded = () => {}, modelled = () => false }) {
  const above = new THREE.Group(), below = new THREE.Group(), mirror = new THREE.Group();
  const standIn = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  standIn.needsUpdate = true;
  const catalogue = { frames: null, atlases: null, loading: null };
  const textures = new Map();   // kind → its pictures' texture, once come (null while fetching, or if it failed)
  const shared = {
    uSunIrradiance: { value: lighting.sunIrradiance },   // filled in place by the sky (src/sky.js)
    uSkyAmbient: { value: lighting.skyAmbient },
    uSunDirection: { value: lighting.sunDirection },
    ...haze,   // the sky's haze uniforms themselves (BIRD_HAZE in src/birdMeshes.js)
  };
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
    if (textures.has(kind) || modelled(kind)) return;
    textures.set(kind, null);
    try {
      await loadCatalogue();
      if (!catalogue.atlases?.[kind]) return;
      const texture = await loadBirdTexture(new URL(catalogue.atlases[kind].file, FOLDER), { anisotropy: 4 });
      textures.set(kind, texture);
      for (const sprite of sprites) if (sprite.kind === kind) sprite.uniforms.uAtlas.value = texture;
      onLoaded();
    } catch (error) {
      console.warn(`[birds] the ${kind}'s pictures failed to load; it is not shown`, error);
    }
  }

  /** A bird's material for one pass: 'above' (the main scene) or 'mirror'. */
  function material(pass) {
    // Every bird's materials the same two programs (their source the same), each its own frame's uniforms.
    const mirrored = pass === 'mirror';
    const uniforms = {
      ...shared,
      uAtlas: { value: standIn },
      ...frameUniforms(),
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
    // Its quad bounded by a sphere about its anchor (place: to its picture's farthest corner), so a bird out of a pass's view is not drawn.
    const bounds = new THREE.Sphere(new THREE.Vector3(), -1);
    const bounded = boundedGeometry(quad, bounds);
    const aboveMesh = new THREE.Mesh(bounded, material('above'));
    const mirrorMaterial = material('mirror');
    mirrorMaterial.uniforms = { ...mirrorMaterial.uniforms, ...pick(aboveMesh.material.uniforms, ['uAtlas', ...Object.keys(frameUniforms())]) };   // one picture, both passes
    const mirrorMesh = new THREE.Mesh(bounded, mirrorMaterial);
    mirrorMesh.layers.set(mirrorLayer);
    for (const mesh of [aboveMesh, mirrorMesh]) mesh.visible = false;
    above.add(aboveMesh);
    mirror.add(mirrorMesh);
    return { kind: null, meshes: [aboveMesh, mirrorMesh], uniforms: aboveMesh.material.uniforms, centre: new THREE.Vector3(), radius: 1, bounds, shown: false, still: false, drawn: { frameA: null, frameB: null, flipA: 0, flipB: 0, share: 0, roll: 0, x: 0, y: 0, z: 0 } };
  }

  function hide(sprite) {
    sprite.shown = false;
    sprite.drawn.frameA = null;
    for (const mesh of sprite.meshes) mesh.visible = false;
  }

  /** The birds of a place (src/birds.js setPlace): a pair of meshes each, from the pool; each kind's pictures fetched if they have not been. */
  function show(population, camera) {
    while (pool.length < population.birds.length) pool.push(makeSprite());
    for (const sprite of pool) hide(sprite);
    sprites = population.birds.map((bird, index) => Object.assign(pool[index], { kind: bird.kind, rank: bird.rank ?? 0 }));
    for (const sprite of sprites) sprite.uniforms.uAtlas.value = textures.get(sprite.kind) ?? standIn;
    // The kinds about at this hour (src/birds.js: the night's birds after dark, the day's by day); another's when
    // one of its birds is first shown (place), so a day never fetches the night's pictures.
    for (const kind of new Set(population.birds.filter((bird) => Boolean(bird.night) === Boolean(population.dark)).map((bird) => bird.kind))) load(kind);
    update(population, camera);
  }

  /** Each bird's frame chosen and placed from its pose (src/birds.js showAt) as `camera` sees it. */
  function update(population, camera) {
    population.birds.forEach((bird, index) => { if (sprites[index]) place(sprites[index], bird.pose, camera); });
  }

  function place(sprite, at, camera) {
    if (at.shown && !textures.has(sprite.kind)) load(sprite.kind);
    const ready = !modelled(sprite.kind) && Boolean(textures.get(sprite.kind)) && Boolean(catalogue.frames) && at.shown && at.flying !== false;
    sprite.shown = ready;
    sprite.still = false;
    for (const mesh of sprite.meshes) mesh.visible = ready;
    if (!ready) sprite.drawn.frameA = null;   // shown again, it is a change
    if (!ready || !camera) return;
    sprite.centre.set(at.x, at.y, at.z);
    for (const mesh of sprite.meshes) mesh.position.copy(sprite.centre);
    const { roleA, flipA, roleB, flipB, share, roll } = weigh(sprite.kind, at, sprite.centre, camera, sprite.rank);
    const frameA = catalogue.frames[`${sprite.kind}-${roleA}`], frameB = catalogue.frames[`${sprite.kind}-${roleB}`];
    // Still when what is drawn is last frame's: its pictures and their shares, which way they face and turn, and where (mirrorBounds).
    const { drawn } = sprite;
    const { x, y, z } = sprite.centre;
    sprite.still = drawn.frameA === frameA && drawn.frameB === frameB && drawn.flipA === flipA && drawn.flipB === flipB && drawn.share === share
      && drawn.roll === roll && drawn.x === x && drawn.y === y && drawn.z === z;
    Object.assign(drawn, { frameA, frameB, flipA, flipB, share, roll, x, y, z });
    const uniforms = sprite.uniforms;
    // The quad: the box about the anchor of the frames it shows (B's only while it has a share), as each is mirrored.
    const box = uniforms.uBox.value.set(Infinity, Infinity, -Infinity, -Infinity);
    for (const [frame, flip, shown] of [[frameA, flipA, share < 1], [frameB, flipB, share > 0]]) {
      if (!shown) continue;
      const [width, height] = frame.metres, [anchorX, anchorY] = frame.anchor;
      const left = -anchorX * width * flip, right = (1 - anchorX) * width * flip;
      box.set(Math.min(box.x, left, right), Math.min(box.y, -anchorY * height), Math.max(box.z, left, right), Math.max(box.w, (1 - anchorY) * height));
    }
    // Its bounds about its anchor (src/main.js redraws the mirror image there): to the box's farthest corner.
    sprite.radius = Math.hypot(Math.max(-box.x, box.z), Math.max(-box.y, box.w));
    sprite.bounds.radius = sprite.radius;   // about its mesh's place, its anchor
    uniforms.uRectA.value.fromArray(frameA.uv);
    uniforms.uSizeA.value.fromArray(frameA.metres);
    uniforms.uAnchorA.value.fromArray(frameA.anchor);
    uniforms.uFlipA.value = flipA;
    uniforms.uRectB.value.fromArray(frameB.uv);
    uniforms.uSizeB.value.fromArray(frameB.metres);
    uniforms.uAnchorB.value.fromArray(frameB.anchor);
    uniforms.uFlipB.value = flipB;
    uniforms.uShare.value = share;
    uniforms.uRoll.value = roll;
  }

  /** The role a kind shows for `wanted`: the first of its fallbacks it has a frame for (FALLBACKS), or null. */
  function roleOf(kind, wanted) {
    for (const role of [wanted, ...FALLBACKS[wanted]]) if (catalogue.frames[`${kind}-${role}`]) return role;
    return null;
  }

  const weights = new Map();   // role and mirroring → its share, filled by weigh
  const chosen = { roleA: null, flipA: 1, roleB: null, flipB: 1, share: 0, roll: 0 };
  function add(kind, wanted, flip, weight) {
    const role = roleOf(kind, wanted);
    if (!role || weight <= 0) return;
    const key = role + flip;   // the same frame by two roles' fallbacks is one picture
    const entry = weights.get(key);
    if (entry) entry.weight += weight;
    else weights.set(key, { role, flip, weight });
  }

  /**
   * The frames a bird shows, as the camera sees it (the header): up to two
   * roles (B's share of the picture `share`), whether each is mirrored (−1:
   * the bird goes to the right of the eye's line to it, and every frame
   * faces left) and how far the picture is turned in its plane.
   */
  function weigh(kind, at, centre, camera, rank = 0) {
    forward.set(Math.cos(at.heading), 0, -Math.sin(at.heading));   // src/birds.js: heading about up, 0 along +x
    toBird.copy(centre).sub(camera.position).setY(0).normalize();
    const flip = forward.z * toBird.x - forward.x * toBird.z > 0 ? -1 : 1;   // its heading on the eye's right of its line to it (the right of a line along −z is +x)
    const along = forward.dot(toBird);
    const headOn = roleOf(kind, 'front') ? THREE.MathUtils.smoothstep(Math.abs(along), HEAD_ON - BLEND.front, HEAD_ON + BLEND.front) : 0;
    const resting = rank % 2 === 1 && roleOf(kind, 'glide') === 'glide' && roleOf(kind, 'down') === 'down' ? 'down' : 'glide';   // every other bird of a flock: its wings held lower (the header)
    const beating = THREE.MathUtils.smoothstep(at.beat, BEATING - BLEND.beat, BEATING + BLEND.beat);
    const stroke = Math.sin(at.phase);
    const struck = THREE.MathUtils.smoothstep(Math.abs(stroke), STROKE_FRAMES - BLEND.stroke, STROKE_FRAMES + BLEND.stroke);
    weights.clear();
    const side = 1 - headOn;
    add(kind, resting, flip, side * (1 - beating));
    add(kind, 'mid', flip, side * beating * (1 - struck));
    add(kind, stroke > 0 ? 'up' : 'down', flip, side * beating * struck);
    add(kind, 'front', 1, headOn);
    let first = null, second = null;
    for (const entry of weights.values()) {
      if (!first || entry.weight > first.weight) [first, second] = [entry, first];
      else if (!second || entry.weight > second.weight) second = entry;
    }
    second ??= first;
    const total = first.weight + (second === first ? 0 : second.weight);
    chosen.roleA = first.role; chosen.flipA = first.flip;
    chosen.roleB = second.role; chosen.flipB = second.flip;
    chosen.share = second === first ? 0 : second.weight / total;
    chosen.roll = (1 - headOn) * -flip * at.pitch * 0.6 + headOn * at.bank * Math.sign(along);
    return chosen;
  }

  /**
   * The bounds of every shown bird whose picture changes (in flight, every frame it moves) and that the mirror's
   * camera sees (`frustum`), joined into `into`: how many.
   */
  const mirrorBounds = (into, frustum) => mirrorBoundsOf(sprites, into, frustum);

  /** Under the veil (src/main.js warmUp): a bird's meshes drawn in front of the camera, so both programs are built; done() takes them away. */
  function warmUp() {
    if (!pool.length) pool.push(makeSprite());
    const sprite = pool[0];
    for (const mesh of sprite.meshes) { mesh.position.set(0, 0.3, -1.4); mesh.visible = true; }
    sprite.uniforms.uBox.value.set(-0.2, -0.2, 0.2, 0.2);
    sprite.uniforms.uSizeA.value.set(0.4, 0.4);
    sprite.uniforms.uSizeB.value.set(0.4, 0.4);
    sprite.bounds.radius = 0.6;   // in view, so its programs are built
    return { done() { if (!sprites.includes(sprite)) hide(sprite); } };
  }

  return {
    above, below, mirror,
    show, update, mirrorBounds, warmUp,
    get drawCalls() { return sprites.reduce((sum, sprite) => sum + (sprite.shown ? sprite.meshes.length : 0), 0); },
  };
}

/** A bird's own uniforms: its two frames, their shares and box, and its turn (FRAMES, VERTEX). */
function frameUniforms() {
  const frame = () => ({ rect: new THREE.Vector4(0, 0, 1, 1), size: new THREE.Vector2(1, 1), anchor: new THREE.Vector2(0.5, 0.5) });
  const [a, b] = [frame(), frame()];
  return {
    uRectA: { value: a.rect }, uSizeA: { value: a.size }, uAnchorA: { value: a.anchor }, uFlipA: { value: 1 },
    uRectB: { value: b.rect }, uSizeB: { value: b.size }, uAnchorB: { value: b.anchor }, uFlipB: { value: 1 },
    uShare: { value: 0 },
    uBox: { value: new THREE.Vector4(-0.5, -0.5, 0.5, 0.5) },
    uRoll: { value: 0 },
  };
}

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}
