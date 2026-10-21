// Snow over the pond: the flakes falling through a box about the eye. The
// overcast and the haze that come with it are the sky's (src/sky.js
// setWeather); the snow lying on the beach, the bank and the pool's deck is
// their shaders' (uSnow: LAND_FRAGMENT and DECK_FRAGMENT in
// src/shaders/scene.js); a frozen thing's thaw and a wet thing's drying in
// the cold air are src/rock.js's (setAir). The Weather setting (src/main.js
// WEATHERS) sets them all.
//
// The water. A snowflake meets the water at its terminal speed, about a
// metre a second, and weighs a few milligrams at most: it melts where it
// lands and leaves no ring one could see (a raindrop of 2 mm comes down at
// 6.5 m/s with some fifty times the momentum, src/rain.js). So snow draws
// nothing on the water and the water's own waves go on as they were.
//
// The flakes (FLAKE_VERTEX in src/shaders/snow.js; flakeAt is its twin
// here, for tools/snow-probe.mjs). Each is a point in a box of SNOW[].box
// metres about the eye, falling at `fall` (m/s, 0.8 to 1.2 times it, flake
// by flake: snow's terminal speeds, dendrites to wet aggregates, are near 1
// m/s whatever their size), carried at the wind's speed, which a flake takes
// at once (its drag far outweighs it), swinging on an ellipse of `sway`
// metres once every `swayPeriods` seconds (the flutter of a falling flake),
// and tossed by the wind's gusts, GUST_SHARE of its speed: a blizzard's
// flakes swirl. Each is drawn as the capsule it sweeps in STREAK_SECONDS,
// so a light snow's flakes in calm air are round and a blizzard's streak
// sideways, each keeping its light (its opacity the share of its capsule
// it covers); a flake under STREAK_MIN_PIXELS across is drawn that wide and
// fainter, so far flakes thin into the haze rather than flicker. `sizes` is
// the smallest and largest flake across (m): light snow's single crystals
// and small clumps, heavy snow's aggregates. `flakes` fill the box; the
// haze (the weather's visibility) carries the snow on beyond it.
//
// Cost while it snows: one draw of `flakes` instanced quads, their vertex
// shader a few dozen operations and, under a gale, one lookup of its waves;
// no pass, no target, nothing on the CPU but a few uniforms. With no snow
// nothing is drawn.
import * as THREE from 'three';
import { FLAKE_VERTEX, FLAKE_FRAGMENT } from './shaders/snow.js';

export const SNOW = {
  light: { flakes: 16000, box: [16, 8, 16], fall: 0.9, sizes: [0.004, 0.012], sway: 0.05, swayPeriods: [1.2, 2.6], opacity: 0.9 },
  heavy: { flakes: 40000, box: [16, 8, 16], fall: 1.1, sizes: [0.006, 0.022], sway: 0.08, swayPeriods: [1.0, 2.2], opacity: 0.9 },
  blizzard: { flakes: 60000, box: [12, 6, 12], fall: 1.0, sizes: [0.004, 0.016], sway: 0.04, swayPeriods: [0.8, 1.6], opacity: 1 },
};
export const STREAK_SECONDS = 1 / 120;  // a quarter of the rain's persistence (src/rain.js): the eye follows a flake falling a metre a second
export const STREAK_MIN_PIXELS = 1.2;
export const GUST_SHARE = 0.3;          // the gusts' speed against the wind's
const GUST_PERIOD = 2.4;                // seconds: FLAKE_MOTION's
const TAU = 2 * Math.PI;

/**
 * Flake `index`'s two attributes (aFlake, aSway), each four numbers in
 * [0, 1) from one seeded stream: the same flakes every run.
 */
export function flakeAttributes(count) {
  const flakes = new Float32Array(count * 4);
  const sways = new Float32Array(count * 4);
  let state = 20261021;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  for (let index = 0; index < count * 4; index++) { flakes[index] = random(); sways[index] = random(); }
  return { flakes, sways };
}

/**
 * Where a flake is and how it moves at `time` (FLAKE_MOTION's twin):
 * `flake` and `sway` its attributes, `snow` an entry of SNOW, `drift` the
 * wind's [x, z] (m/s). Unwrapped: the shader wraps the place into the box.
 */
export function flakeAt(flake, sway, time, snow, drift) {
  const gustSpeed = GUST_SHARE * Math.hypot(drift[0], drift[1]);
  const speed = 0.8 + 0.4 * flake[3];
  const swayRate = TAU / (snow.swayPeriods[0] + (snow.swayPeriods[1] - snow.swayPeriods[0]) * sway[2]);
  const swingX = swayRate * time + TAU * sway[0], swingZ = swayRate * time + TAU * sway[1];
  const gustRate = TAU / GUST_PERIOD * (0.7 + 0.6 * sway[3]);
  const gust = gustRate * time + TAU * 7 * sway[3];
  const steady = [drift[0], -snow.fall * speed, drift[1]];
  const start = [flake[0] * snow.box[0], flake[2] * snow.box[1], flake[1] * snow.box[2]];
  const place = [
    start[0] + steady[0] * time + snow.sway * Math.sin(swingX) + (gustSpeed / gustRate) * Math.sin(gust),
    start[1] + steady[1] * time + (gustSpeed / gustRate) * 0.4 * Math.sin(1.7 * gust + 1),
    start[2] + steady[2] * time + snow.sway * Math.cos(swingZ) + (gustSpeed / gustRate) * Math.cos(1.3 * gust + 2),
  ];
  const velocity = [
    steady[0] + snow.sway * swayRate * Math.cos(swingX) + gustSpeed * Math.cos(gust),
    steady[1] + gustSpeed * 0.68 * Math.cos(1.7 * gust + 1),
    steady[2] - snow.sway * swayRate * Math.sin(swingZ) - gustSpeed * 1.3 * Math.sin(1.3 * gust + 2),
  ];
  return { place, velocity };
}

/**
 * How a flake is drawn (FLAKE_VERTEX's): `diameter` (m), `speed` (m/s
 * across the line of sight) at `depth` (m) for a camera of `focal` pixels
 * per unit tan: its capsule's width and length (m) and the share of it the
 * flake covers.
 */
export function flakeDrawn(diameter, speed, depth, focal) {
  const width = Math.max(diameter, STREAK_MIN_PIXELS * depth / focal);
  const swept = speed * STREAK_SECONDS;
  return { width, length: swept + width, covered: (diameter * diameter) / (width * (swept + width)) };
}

export class Snow {
  /**
   * @param lighting the scene's lighting (src/main.js): the flakes take the sky's light and the sun's
   * @param options.gale the gale's uniforms (src/galeWaves.js): the flakes are cut at its waves
   * @param options.haze the haze's uniforms (src/sky.js): far flakes fade into it
   */
  constructor(lighting, { gale = {}, haze = {} } = {}) {
    this.intensity = null;
    this.wind = new THREE.Vector2();
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 2, 1, 3]);
    const largest = Math.max(...Object.values(SNOW).map((snow) => snow.flakes));
    const { flakes, sways } = flakeAttributes(largest);
    quad.setAttribute('aFlake', new THREE.InstancedBufferAttribute(flakes, 4));
    quad.setAttribute('aSway', new THREE.InstancedBufferAttribute(sways, 4));
    quad.instanceCount = 0;
    const light = SNOW.light;
    this.flakes = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: FLAKE_VERTEX,
      fragmentShader: FLAKE_FRAGMENT,
      uniforms: {
        uSnowTime: { value: 0 },
        uBox: { value: new THREE.Vector3(...light.box) },
        uDrift: { value: new THREE.Vector3() },
        uFall: { value: light.fall },
        uSway: { value: light.sway },
        uSwayPeriods: { value: new THREE.Vector2(...light.swayPeriods) },
        uGust: { value: 0 },
        uSizes: { value: new THREE.Vector2(...light.sizes) },
        uStreakSeconds: { value: STREAK_SECONDS },
        uFocalPx: { value: 1000 },
        uMinPixels: { value: STREAK_MIN_PIXELS },
        uOpacity: { value: light.opacity },
        uHazeDensity: haze.uHazeDensity ?? { value: 0 },
        uSkyAmbient: { value: lighting.skyAmbient },
        uSunIrradiance: { value: lighting.sunIrradiance },
        uSunDir: { value: lighting.sunDirection },
        ...gale,   // the gale's uniforms (src/galeWaves.js): the flakes are cut at its waves
      },
      side: THREE.DoubleSide,   // a capsule's winding turns with its sweep against the eye
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.flakes.frustumCulled = false;
    this.flakes.visible = false;
  }

  /** Whether it is snowing. */
  get on() { return this.flakes.visible; }

  /** The flakes drawn while it snows (0 with none). */
  get count() { return this.on ? this.flakes.geometry.instanceCount : 0; }

  /** The wind the flakes drift with: its direction (world XZ, unit) and speed (m/s); its gusts toss them. */
  setWind(direction, speed) {
    this.wind.set(direction[0], direction[1]).normalize().multiplyScalar(speed);
    const uniforms = this.flakes.material.uniforms;
    uniforms.uDrift.value.set(this.wind.x, 0, this.wind.y);
    uniforms.uGust.value = GUST_SHARE * speed;
  }

  /** Snow by intensity (a key of SNOW), or none (null). At once: nothing is fetched. */
  setIntensity(name) {
    this.intensity = Object.hasOwn(SNOW, name ?? '') ? name : null;
    if (!this.intensity) { this.show(false); return; }
    const snow = SNOW[this.intensity];
    const uniforms = this.flakes.material.uniforms;
    uniforms.uBox.value.set(...snow.box);
    uniforms.uFall.value = snow.fall;
    uniforms.uSway.value = snow.sway;
    uniforms.uSwayPeriods.value.set(...snow.swayPeriods);
    uniforms.uSizes.value.set(...snow.sizes);
    uniforms.uOpacity.value = snow.opacity;
    this.flakes.geometry.instanceCount = snow.flakes;
    this.show(true);
  }

  show(snowing) { this.flakes.visible = snowing; }

  /** The flakes at world time `time` (seconds), for the camera, whose render target is `resolution` pixels. */
  update(time, camera, resolution) {
    const uniforms = this.flakes.material.uniforms;
    uniforms.uSnowTime.value = time;
    if (this.on) uniforms.uFocalPx.value = camera.projectionMatrix.elements[5] * resolution.y * 0.5;
  }
}
