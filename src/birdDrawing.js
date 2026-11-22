// What the two bird views share (src/birdMeshes.js draws the kinds that have
// a model, src/birdSprites.js the rest as pictures; src/birdViews.js gives
// each its birds): where the birds' images are, the light and the weather's
// haze on a bird, a bird's own bounds on a geometry its kind shares, its
// image made a texture, a view's sprites taken from its pool, the kinds whose
// images an hour needs, and which birds the mirror must draw again.
//
// A view's sprite is one bird as it is drawn: its `bird` (src/birds.js: its
// pose is read each frame) and `kind`, whether it is `shown`, and its bounds
// (`centre`, `radius`).
import * as THREE from 'three';
import { loadAsset } from './loadAsset.js';
import { withRandom, parkMiller } from './withRandom.js';
import { HAZE } from './shaders/scene.js';

export const BIRDS_FOLDER = new URL('../assets/birds/', import.meta.url);
// The sun's and the sky's light on a photograph: its pixels are taken as the bird's colour under a bright sky, lit
// by SUN_SHARE of the sun's light and SKY_SHARE of the sky's ambient light (as the fish take it, src/fishMeshes.js).
export const SUN_SHARE = 0.3;
export const SKY_SHARE = 1.0;
export const MIRROR_NEARNESS_SCALE = 4; // src/boulders.js's: the mirror image's alpha is 1 − this / distance

/**
 * The weather's haze on a bird (src/sky.js setWeather; HAZE in src/shaders/scene.js), for both views' `above` and
 * `mirror` (the drawings and the models): faded toward the haze by the light's way from it to the eye. In the
 * mirror that way is only its leg down to the water (the share of the mirrored eye's ray above the water, y = 0,
 * which the mirror's centimetres off it under ice or a gale hardly change): the water hazes what it shows by its own
 * distance (withHaze in the water's shader), the rest of the way. `below` needs none: the water hazes it too.
 * Its uniforms are the sky's own (environment.hazeUniforms), shared, so a change of weather reaches every bird.
 */
export const BIRD_HAZE = /* glsl */ `
${HAZE}
vec3 birdHazed(vec3 radiance, vec3 world) {
  float distance = length(world - cameraPosition);
  #ifdef MIRROR
    distance *= clamp(world.y / max(world.y - cameraPosition.y, 1e-4), 0.0, 1.0);
  #endif
  return withHaze(radiance, distance);
}
`;

/**
 * A geometry drawing `source`'s vertices (its attributes and index, so one GPU buffer each, however many share them)
 * and bounded by `bounds`, a sphere its bird moves each frame: a bird's vertices are placed by its joints or its
 * picture's anchor, its mesh never moved, so three culls each pass's draw by where the bird is (a bird out of the
 * view, the mirror's or the water's, is not drawn). Never disposed: that would let go of `source`'s buffers.
 */
export function boundedGeometry(source, bounds) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.boundingSphere = bounds;
  return geometry;
}

// The textures' own stream: three draws a texture's (and its source's) uuid from Math.random, and a download comes
// whenever the network lets it, perhaps between two seeded throws, which would then draw differently.
const textureRandom = parkMiller(11);

/**
 * A bird's image (a WebP in assets/birds/, its rows as they lie: uv from its top left), fetched and made a mipmapped
 * sRGB texture, filtered `anisotropy` times; made on a stream of its own (textureRandom).
 */
export async function loadBirdTexture(url, { anisotropy = 1 } = {}) {
  const bytes = await loadAsset(url, 'arrayBuffer');
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { imageOrientation: 'none', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const texture = withRandom(textureRandom, () => new THREE.Texture(bitmap));
  texture.flipY = false;   // its rows as they lie (tools/bird-models.py, tools/bird-sprites.py)
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A view's sprites for `birds`, one each from its `pool` (grown by `make` as they are needed, and every one of it
 * hidden by `hide` first): each given its bird and its kind. The pool is kept for the page's life and reused from
 * place to place: disposing a material's last user would delete its program, and the next place's birds would
 * build it mid-session.
 */
export function spritesFor(pool, birds, make, hide) {
  while (pool.length < birds.length) pool.push(make());
  for (const sprite of pool) hide(sprite);
  return birds.map((bird, index) => Object.assign(pool[index], { bird, kind: bird.kind }));
}

/**
 * The kinds of `birds` about at this hour (src/birds.js: the night's birds after dark, the day's by day): those
 * whose images a view fetches as a place is shown. Another's are fetched when one of its birds is first shown, so
 * a day never fetches the night's images.
 */
export function kindsAbout(birds, dark) {
  return new Set(birds.filter((bird) => Boolean(bird.night) === Boolean(dark)).map((bird) => bird.kind));
}

const boundsSphere = new THREE.Sphere(), boundsBox = new THREE.Box3();
/**
 * The bounds (each `centre` and `radius`) of every shown bird of `sprites` that is not as the mirror last drew it
 * and that the mirror's camera sees (`frustum`), joined into `into`: how many (src/main.js draws the mirror image
 * there again). `changed(sprite)` says whether it is posed otherwise than when it was last asked, and takes it as
 * drawn so from now: so this is asked once for each frame drawn, however often the birds were posed since the last
 * (the harness steps many times a frame), and a heron that turned its head and settled between two frames is still
 * drawn again. One shown that was not, the mirror has yet to draw.
 */
export function mirrorChanges(sprites, into, frustum, changed) {
  let moving = 0;
  for (const sprite of sprites) {
    if (!sprite.shown) { sprite.mirrored = false; continue; }
    const moved = changed(sprite) || !sprite.mirrored;
    sprite.mirrored = true;
    if (!moved) continue;
    boundsSphere.set(sprite.centre, sprite.radius);
    if (!frustum.intersectsSphere(boundsSphere)) continue;
    into.union(boundsSphere.getBoundingBox(boundsBox));
    moving++;
  }
  return moving;
}
