// The vapour over open water boiling in vacuum (src/boiling.js: Europa's
// lead, a new hole while it is open, or all the water thawed). Vapour itself
// is clear, but in vacuum it expands as it leaves and cools, and condenses
// into grains of frost (as Enceladus's plumes do), which the sun lights: a
// faint, glittering haze, thickest at the water and thinning as it rises and
// spreads, its grains streaming up.
//
// One quad a patch of open water (at most VAPOUR.slots: the holes not yet
// skinned over, the lead first; thawed, one over the whole patch), standing
// over its middle and turned about its upright to face the eye, as wide as
// the water across the eye's way to it and VAPOUR.height high, drawn added to
// what is behind it (it is light). Its light is VAPOUR.glow times sunlit
// white ice's, the grains' glints on top. Posed once a frame (update), from
// the ice's holes as the physics steps left them; nothing of it changes the
// world. Under the water it is not seen (src/main.js hiddenFromBelow). Its
// one program is built under the veil (warmUp).
import * as THREE from 'three';
import { AIR_DENSITY } from './air.js';

const VAPOUR = { slots: 6, height: 0.9, glow: 0.2, glints: 4, grain: 0.004 };   // m high; its haze and glints against sunlit white ice; a grain cell's size (m)

const VAPOUR_VERTEX = /* glsl */ `
uniform vec3 uFoot;      // the water's middle
uniform float uWidth;    // m: as wide as the water across the eye's way
varying vec2 vPlace;
varying vec3 vWorld;
varying float vSeen;   // 1 seen from the side, 0 from overhead (a standing quad seen from above is a line)
void main() {
  // position.x from −1 to 1 across, position.y from 0 to 1 up: widening a little as it rises (it spreads into the vacuum).
  vec3 toEye = cameraPosition - uFoot;
  vec3 across = normalize(vec3(-toEye.z, 0.0, toEye.x) + vec3(1e-6, 0.0, 0.0));
  float width = uWidth * (0.5 + 0.35 * position.y);
  vec3 world = uFoot + across * position.x * width + vec3(0.0, position.y * ${VAPOUR.height.toFixed(2)}, 0.0);
  vPlace = position.xy;
  vWorld = world;
  vSeen = 1.0 - smoothstep(0.25, 0.6, abs(normalize(cameraPosition - world).y));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;
const VAPOUR_FRAGMENT = /* glsl */ `
uniform vec3 uSunIrradiance;
uniform vec3 uSunDirection;
uniform float uStrength;   // 0 to 1: how much of it there is
uniform float uTime;
uniform float uWidth;
varying vec2 vPlace;
varying vec3 vWorld;
varying float vSeen;
float hash(vec2 cell) { return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 point) {
  vec2 cell = floor(point), within = fract(point);
  vec2 eased = within * within * (3.0 - 2.0 * within);
  return mix(mix(hash(cell), hash(cell + vec2(1, 0)), eased.x), mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), eased.x), eased.y);
}
void main() {
  float across = vPlace.x, up = vPlace.y;
  // Thickest at the water, thinning as it rises and spreads; soft at its sides; streaming up in wisps.
  float body = (1.0 - smoothstep(0.55, 1.0, abs(across))) * exp(-3.2 * up) * smoothstep(0.0, 0.2, up);
  float wisps = 0.45 + 0.55 * noise(vec2(across * 7.0, up * 3.0 - uTime * 0.8)) * noise(vec2(across * 2.5 + 3.1, up * 1.4 - uTime * 0.35));
  // The grains' glints: here and there a grain catches the sun, each for a moment.
  // A grain's cell is VAPOUR.grain across in the world, so the glints are points however near the eye; each lit a moment.
  vec2 metres = vec2(across * uWidth, (up - uTime * 0.5) * ${VAPOUR.height.toFixed(2)});
  vec2 grain = floor(metres / ${VAPOUR.grain.toFixed(4)});
  vec2 within = fract(metres / ${VAPOUR.grain.toFixed(4)}) - 0.5;
  float glint = step(0.997, hash(grain + floor(uTime * 8.0))) * (1.0 - smoothstep(0.1, 0.3, length(within))) * exp(-2.5 * up);
  float sunUp = smoothstep(-0.02, 0.2, uSunDirection.y);
  vec3 sunlit = uSunIrradiance * sunUp / 3.14159;
  vec3 colour = sunlit * (${VAPOUR.glow.toFixed(3)} * body * wisps * vec3(0.9, 0.95, 1.0) + ${VAPOUR.glints.toFixed(2)} * glint * body);
  gl_FragColor = vec4(colour * uStrength * vSeen, 1.0);
}
`;

/**
 * The vapour (the header): `group` to add to the main scene; update(ice, water, time) poses it a frame; warmUp() draws
 * one quad in front of the camera so its program is built under the veil.
 */
export function createBoilingVapour(lighting) {
  const group = new THREE.Group();
  group.name = 'boiling-vapour';
  const shared = { uSunIrradiance: { value: lighting.sunIrradiance }, uSunDirection: { value: lighting.sunDirection }, uTime: { value: 0 } };
  const geometry = new THREE.PlaneGeometry(2, 1, 1, 1).translate(0, 0.5, 0);
  const slots = Array.from({ length: VAPOUR.slots }, () => {
    const uniforms = { ...shared, uFoot: { value: new THREE.Vector3() }, uWidth: { value: 1 }, uStrength: { value: 1 } };
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms, vertexShader: VAPOUR_VERTEX, fragmentShader: VAPOUR_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    mesh.frustumCulled = false;   // placed in its shader
    mesh.visible = false;
    group.add(mesh);
    return { mesh, uniforms };
  });

  /** Each patch of open water's vapour, as the ice and the physics left it. */
  function update(ice, water, time) {
    shared.uTime.value = time;
    let used = 0;
    const place = (x, z, width, strength) => {
      if (used >= slots.length) return;
      const { mesh, uniforms } = slots[used++];
      mesh.visible = true;
      uniforms.uFoot.value.set(x, 0, z);
      uniforms.uWidth.value = width;
      uniforms.uStrength.value = strength;
    };
    if (AIR_DENSITY === 0) {
      if (!ice.on) {
        const [minX, minZ] = water.domainMin, size = water.domainSize;
        place(minX + size / 2, minZ + size / 2, size, 1);
      } else {
        // The lead first, then the newest holes; a hole skinning over steams less as its open water shrinks.
        const open = ice.holes.filter((hole) => !hole.skin?.closed).sort((first, second) => Number(Boolean(second.lead)) - Number(Boolean(first.lead)) || second.openedAt - first.openedAt);
        for (const hole of open) {
          const left = hole.skin ? Math.max(1 - hole.skin.front / Math.max(hole.skin.deepest, 1e-6), 0) : 1;
          place(hole.x, hole.z, hole.outer + hole.inner, left);
        }
      }
    }
    for (let index = used; index < slots.length; index++) slots[index].mesh.visible = false;
  }

  function warmUp() {
    const { mesh, uniforms } = slots[0];
    const was = mesh.visible;
    mesh.visible = true;
    uniforms.uFoot.value.set(0, 0, -1.4);
    return { done() { mesh.visible = was; } };
  }

  return { group, update, warmUp, get drawCalls() { return slots.filter((slot) => slot.mesh.visible).length; } };
}
