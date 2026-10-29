// The shadows what lies on the ice casts in the sun (IceShadow). Each of the
// things the ice shades (src/ice.js shade: its slots, ICE_SHADOW.slots of
// them) has a tile of a depth atlas: an orthographic view down the sun's rays
// fitted to the thing's bounding sphere, its mesh drawn into it as it is
// drawn (a brick's shadow is square, a stone's has its lumps). A tile is
// drawn again only when its thing has moved, turned or bent, or the sun has
// moved: a thing at rest costs no draw a frame. The ice's shader (ICE_THINGS
// in src/shaders/scene.js) and the things' own (ICE_SHADOW_RECEIVER, on what
// of each is drawn above the water: src/rock.js) look a point up in each tile
// whose shade may reach it (ICE_SHADOW_LOOKUP): lit where the tile holds
// nothing there, or what it holds lies beyond the point, the edge filtered
// over the sun's own width at the distance (its penumbra) or the pixel's
// footprint, whichever is wider. A thing is never shadowed by its own tile
// (its own side away from the sun is its lighting's). Depth is packed into
// RGBA8 by the atlas's own material (ICE_SHADOW_PACK), which every device
// renders to, its tiles cleared to 1, which nothing drawn reaches (each
// tile's depth spans twice its thing's reach, its middle at half).
//
// The uniforms (ICE_SHADOW_UNIFORMS) are one set, shared: src/ice.js shade
// fills which slot holds what (its bound, the box round them all, how many),
// IceShadow the tiles, and every material that looks them up holds the same
// objects (the water's, through the ice's uniforms; each thing's). They are
// in the water's fragment shader, whose uniform vectors WebGL 2 promises only
// 224 of: a tile is its matrix's three rows alone (an orthographic view's
// matrix is affine), its corner in the atlas its slot's and its half-width
// and depth taken from the rows' lengths (iceShadowLit).
import * as THREE from 'three';

// The atlas: `slots` tiles of `tile` texels square, `columns` across; each tile reaches `margin` of its thing's bounding
// sphere wider than it (the filter's room), and the bias (m) a point must lie beyond what a tile holds to be in its shade.
export const ICE_SHADOW = { slots: 8, columns: 4, tile: 256, margin: 0.15, bias: 0.0015 };
const ROWS = ICE_SHADOW.slots / ICE_SHADOW.columns;

export const ICE_SHADOW_UNIFORMS = {
  uIceShadowAtlas: { value: null },
  // World to each tile's own [0, 1]² and its depth, 0 to 1 over twice its thing's reach: its matrix's rows, three a
  // slot (the fourth is always 0, 0, 0, 1); all 0 when it holds nothing.
  uIceShadowRows: { value: Array.from({ length: 3 * ICE_SHADOW.slots }, () => new THREE.Vector4()) },
  // src/ice.js shade's: each slot's circle its shade lies in (x, z, radius² or −1 for none, the sky's reach: m), the box
  // round them all (least x, z; most x, z), and how many slots are in use.
  uIceThingBounds: { value: Array.from({ length: ICE_SHADOW.slots }, () => new THREE.Vector4(0, 0, -1, 0)) },
  uIceShadeBox: { value: new THREE.Vector4() },
  uIceThingCount: { value: 0 },
};

// Depth packed into RGBA8 and back (its own pair, so it never depends on three's packing).
export const ICE_SHADOW_PACK = /* glsl */`
vec4 iceShadowPack(float depth) {
  vec4 packed = fract(depth * vec4(1.0, 255.0, 65025.0, 16581375.0));
  return packed - packed.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
}
float iceShadowUnpack(vec4 packed) {
  return dot(packed, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}
`;

// What of the sun reaches a point past the thing in a slot's tile (the header), and past all but one's. Defined once in
// a program however often it is included (a floater's takes it with the water's, FLOATER_WATER, and as a receiver).
export const ICE_SHADOW_LOOKUP = /* glsl */`
#ifndef ICE_SHADOW_LOOKUP
#define ICE_SHADOW_LOOKUP
#define ICE_SHADOW_SLOTS ${ICE_SHADOW.slots}
#define ICE_SHADOW_TILE vec2(${(1 / ICE_SHADOW.columns).toFixed(6)}, ${(1 / ROWS).toFixed(6)})
#define ICE_SHADOW_TEXEL ${(1 / ICE_SHADOW.tile).toFixed(8)}
#define ICE_SHADOW_BIAS ${ICE_SHADOW.bias}
#define ICE_SHADOW_SUN_SPREAD 0.0093   // the sun's width (rad): its shadow's penumbra over the distance past what casts it
uniform sampler2D uIceShadowAtlas;
uniform vec4 uIceShadowRows[3 * ICE_SHADOW_SLOTS];
uniform vec4 uIceThingBounds[ICE_SHADOW_SLOTS];
uniform vec4 uIceShadeBox;
uniform float uIceThingCount;
${ICE_SHADOW_PACK}
// Eight taps on a disc (a Poisson set), its radius 1.
const vec2 ICE_SHADOW_TAPS[8] = vec2[8](vec2(-0.613, 0.354), vec2(0.171, 0.798), vec2(0.776, 0.271), vec2(0.484, -0.596),
  vec2(-0.239, -0.664), vec2(-0.902, -0.247), vec2(-0.077, 0.112), vec2(0.396, 0.003));
// Of the sun at \`point\` past slot's thing: 1 lit, 0 in its shadow; \`least\` (m) the least width its edge is filtered over.
float iceShadowLit(int slot, vec3 point, float least) {
  vec4 across = uIceShadowRows[3 * slot], up = uIceShadowRows[3 * slot + 1], deep = uIceShadowRows[3 * slot + 2];
  // Its half-width (m) and its depth's span (m): the rows' lengths are 1/2 and 1 over them (IceShadow drawTile).
  float halfWidth = 0.5 / max(length(across.xyz), 1e-6), span = 1.0 / max(length(deep.xyz), 1e-6);
  if (dot(across.xyz, across.xyz) <= 0.0) return 1.0;
  vec4 world = vec4(point, 1.0);
  vec3 at = vec3(dot(across, world), dot(up, world), dot(deep, world));
  if (any(lessThan(at.xy, vec2(0.0))) || any(greaterThan(at.xy, vec2(1.0)))) return 1.0;
  // Its penumbra: the sun's width over the distance past the thing's middle (at half the tile's depth).
  float spread = max(ICE_SHADOW_SUN_SPREAD * max(at.z - 0.5, 0.0) * span, least);
  float radius = clamp(spread / (2.0 * halfWidth), 1.5 * ICE_SHADOW_TEXEL, 0.25);
  float bias = ICE_SHADOW_BIAS / span, lit = 0.0;
  vec2 corner = vec2(mod(float(slot), ${ICE_SHADOW.columns}.0), floor(float(slot) / ${ICE_SHADOW.columns}.0)) * ICE_SHADOW_TILE;
  for (int tap = 0; tap < 8; tap++) {
    vec2 uv = clamp(at.xy + radius * ICE_SHADOW_TAPS[tap], vec2(0.5 * ICE_SHADOW_TEXEL), vec2(1.0 - 0.5 * ICE_SHADOW_TEXEL));
    float depth = iceShadowUnpack(texture2D(uIceShadowAtlas, corner + uv * ICE_SHADOW_TILE));
    lit += depth >= 0.9999 || at.z <= depth + bias ? 1.0 : 0.0;
  }
  return lit / 8.0;
}
// Of the sun at \`point\` past every slot's thing but \`self\`'s (−1: none), each looked up only within its bound.
float iceShadowLitPast(vec3 point, float self, float least) {
  if (uIceThingCount < 0.5 || any(lessThan(point.xz, uIceShadeBox.xy)) || any(greaterThan(point.xz, uIceShadeBox.zw))) return 1.0;
  float lit = 1.0;
  for (int slot = 0; slot < ICE_SHADOW_SLOTS; slot++) {
    if (float(slot) >= uIceThingCount) break;
    vec4 bound = uIceThingBounds[slot];
    vec2 fromBound = point.xz - bound.xy;
    if (float(slot) == self || bound.z < 0.0 || dot(fromBound, fromBound) > bound.z) continue;
    lit *= iceShadowLit(slot, point, least);
  }
  return lit;
}
#endif
`;

// The things' own (src/rock.js): what of the sun reaches each pixel of what is drawn above the water past the others,
// its direct light (the sun's, the scene's one direct light) scaled by it; its world point from its view point.
export const ICE_SHADOW_RECEIVER = {
  uniforms: /* glsl */`
uniform float uIceShadowSelf;   // its own slot (src/ice.js shade), or −1
${ICE_SHADOW_LOOKUP}`,
  before: /* glsl */`
vec3 directDiffuseBefore = reflectedLight.directDiffuse, directSpecularBefore = reflectedLight.directSpecular;`,
  after: /* glsl */`
{
  float sunPast = iceShadowLitPast(-vViewPosition * mat3(viewMatrix) + cameraPosition, uIceShadowSelf, 0.001);
  reflectedLight.directDiffuse = directDiffuseBefore + (reflectedLight.directDiffuse - directDiffuseBefore) * sunPast;
  reflectedLight.directSpecular = directSpecularBefore + (reflectedLight.directSpecular - directSpecularBefore) * sunPast;
}`,
};

/** A built-in material's shader (onBeforeCompile's) made to take the others' shadows on the ice (the header), `self` its own slot's uniform. */
export function receiveIceShadows(shader, self) {
  Object.assign(shader.uniforms, ICE_SHADOW_UNIFORMS, { uIceShadowSelf: self });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${ICE_SHADOW_RECEIVER.uniforms}`)
    .replace('#include <lights_fragment_begin>', `${ICE_SHADOW_RECEIVER.before}\n#include <lights_fragment_begin>\n${ICE_SHADOW_RECEIVER.after}`);
}

const DEPTH_VERTEX = /* glsl */`
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DEPTH_FRAGMENT = /* glsl */`
${ICE_SHADOW_PACK}
void main() {
  gl_FragColor = iceShadowPack(gl_FragCoord.z);
}`;
const NDC_TO_TILE = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class IceShadow {
  constructor() {
    const width = ICE_SHADOW.tile * ICE_SHADOW.columns, height = ICE_SHADOW.tile * ROWS;
    this.target = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true, stencilBuffer: false });
    this.target.texture.name = 'iceShadow';
    ICE_SHADOW_UNIFORMS.uIceShadowAtlas.value = this.target.texture;
    this.material = new THREE.ShaderMaterial({ vertexShader: DEPTH_VERTEX, fragmentShader: DEPTH_FRAGMENT, side: THREE.DoubleSide });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // One stand-in per slot, drawn with the thing's own geometry where the thing is drawn.
    this.proxies = Array.from({ length: ICE_SHADOW.slots }, () => {
      const proxy = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
      proxy.matrixAutoUpdate = false;
      proxy.frustumCulled = false;
      proxy.visible = false;
      this.scene.add(proxy);
      return proxy;
    });
    // What each tile was last drawn for: its thing, where it was drawn (its matrix), its geometry's version, the sun.
    this.drawn = Array.from({ length: ICE_SHADOW.slots }, () => ({ thing: null, matrix: new THREE.Matrix4(), version: -1, sun: new THREE.Vector3() }));
    this.draws = 0;   // tiles drawn, all told (tools and the probes)
    this.centre = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.warmRows = Array.from({ length: 3 * ICE_SHADOW.slots }, () => new THREE.Vector4());
    this.clearColor = new THREE.Color();
  }

  /**
   * The tiles to this frame (src/main.js render, after src/ice.js shade):
   * `slots` its things (or null), `toSun` the sun's direction, or null when
   * it casts no shadow (down, or behind cloud: src/ice.js shade `sunLit`),
   * every tile then empty. A tile is drawn again only for a new thing, or one
   * moved, turned or bent, or a sun moved.
   */
  update(renderer, slots, toSun) {
    const rows = ICE_SHADOW_UNIFORMS.uIceShadowRows.value;
    let restore = null;
    for (let slot = 0; slot < ICE_SHADOW.slots; slot++) {
      const thing = slots[slot], drawn = this.drawn[slot];
      if (!thing || !toSun) {
        for (let row = 3 * slot; row < 3 * slot + 3; row++) rows[row].set(0, 0, 0, 0);
        drawn.thing = null;
        continue;
      }
      const mesh = thing.meshAbove;
      mesh.updateMatrixWorld();
      const version = mesh.geometry.attributes.position.version;
      if (drawn.thing === thing && drawn.version === version && drawn.sun.equals(toSun) && drawn.matrix.equals(mesh.matrixWorld)) continue;
      restore ??= this.saveState(renderer);
      this.drawTile(renderer, slot, mesh, toSun, rows);
      drawn.thing = thing;
      drawn.version = version;
      drawn.sun.copy(toSun);
      drawn.matrix.copy(mesh.matrixWorld);
    }
    if (restore) this.restoreState(renderer, restore);
  }

  /** The atlas's program built (src/main.js warmUp, under the veil): a tile drawn for `mesh`, then let go. */
  warmUp(renderer, mesh) {
    const restore = this.saveState(renderer);
    mesh.updateMatrixWorld();
    this.drawTile(renderer, 0, mesh, new THREE.Vector3(0.3, 0.8, 0.2).normalize(), this.warmRows);
    this.restoreState(renderer, restore);
    this.drawn[0].thing = null;
  }

  /** Slot's tile drawn for `mesh` with the sun along `toSun`: its camera fitted to the mesh's bounding sphere, its matrix's rows into `rows`' slot's. */
  drawTile(renderer, slot, mesh, toSun, rows) {
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const centre = this.centre.copy(geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
    const reach = geometry.boundingSphere.radius * mesh.matrixWorld.getMaxScaleOnAxis() * (1 + ICE_SHADOW.margin);
    const camera = this.camera;
    camera.left = camera.bottom = -reach;
    camera.right = camera.top = reach;
    camera.near = 0;
    camera.far = 4 * reach;
    camera.position.copy(centre).addScaledVector(toSun, 2 * reach);   // its middle at half the depth
    camera.up.set(0, 1, 0);
    if (Math.abs(toSun.y) > 0.99) camera.up.set(1, 0, 0);
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const matrix = this.matrix.multiplyMatrices(NDC_TO_TILE, camera.projectionMatrix).multiply(camera.matrixWorldInverse), elements = matrix.elements;
    for (let row = 0; row < 3; row++) rows[3 * slot + row].set(elements[row], elements[4 + row], elements[8 + row], elements[12 + row]);
    const column = slot % ICE_SHADOW.columns, row = Math.floor(slot / ICE_SHADOW.columns);
    // Only this slot's stand-in, its tile alone cleared to 1 (nothing there) and drawn.
    this.proxies.forEach((proxy, index) => { proxy.visible = index === slot; });
    const proxy = this.proxies[slot];
    proxy.geometry = geometry;
    proxy.matrix.copy(mesh.matrixWorld);   // its world matrix as the scene (its parent, unmoved) works it out from this
    proxy.matrixWorld.copy(mesh.matrixWorld);
    const size = ICE_SHADOW.tile;
    this.target.viewport.set(column * size, row * size, size, size);
    this.target.scissor.set(column * size, row * size, size, size);
    this.target.scissorTest = true;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, true, false);
    renderer.autoClear = false;   // cleared once, above (restoreState puts it back)
    renderer.render(this.scene, camera);
    proxy.visible = false;
    this.draws++;
  }

  /** Its atlas's bytes on the GPU: RGBA8 and a 32-bit depth buffer, a texel each. */
  get bytes() { return this.target.width * this.target.height * 8; }

  saveState(renderer) {
    return { target: renderer.getRenderTarget(), color: renderer.getClearColor(this.clearColor).clone(), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, clipping: renderer.clippingPlanes };
  }

  restoreState(renderer, state) {
    this.target.scissorTest = false;
    renderer.setRenderTarget(state.target);
    renderer.setClearColor(state.color, state.alpha);
    renderer.autoClear = state.autoClear;
    renderer.clippingPlanes = state.clipping;
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
