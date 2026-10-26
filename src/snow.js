// Snow over the pond: the flakes falling through a box about the eye. The
// overcast and the haze that come with it are the sky's (src/sky.js
// setWeather); the snow lying on the beach, the bank, the pool's deck and
// the ice is their shaders' (uSnow: SNOW_COVER in src/shaders/scene.js, for
// LAND_FRAGMENT, DECK_FRAGMENT and the water's iceSurface); a frozen thing's thaw and a wet thing's drying in
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
// here, for tools/snow-probe.mjs). Each is a point in one of two boxes
// about the eye: the near, SNOW[].box metres (lowered to reach the water
// when the eye is high), or the far (FAR: the near box's size times its
// `span`, standing on the water, with `flakes` times as many flakes spread
// through its far larger volume, so thinner a cubic metre),
// falling at `fall` (m/s, 0.8 to 1.2 times it, flake by flake, in
// SPEED_STEPS steps: snow's terminal speeds, dendrites to wet aggregates, are near 1
// m/s whatever their size), carried at the wind's speed, which a flake takes
// at once (its drag far outweighs it), swinging on an ellipse of `sway`
// metres once every `swayPeriods` seconds (the flutter of a falling flake),
// and tossed by the wind's gusts, GUST_SHARE of its speed: a blizzard's
// flakes swirl. Each is drawn as the capsule it sweeps in STREAK_SECONDS
// of real time (that times the slow motion's scale of world time,
// setTimeScale),
// so a light snow's flakes in calm air are round and a blizzard's streak
// sideways, each keeping its light (its opacity the share of its capsule
// it covers); a flake under STREAK_MIN_PIXELS across is drawn that wide and
// fainter, so far flakes thin into the haze rather than flicker. `sizes` is
// the smallest and largest flake across (m): light snow's single crystals
// and small clumps, heavy snow's aggregates up to 5 cm (the big soft flakes
// of a snow day near freezing, crystals stuck together as they fall; one in
// eight is over 4 cm, FLAKE_VERTEX's squared mix). `flakes` fill the near
// box. A blizzard's hide about what its haze does: its flakes alone, each
// hiding what is behind its own area, let one see about 160 m (the haze's
// 150 m; tools/snow-probe.mjs prints it); heavy snow's big flakes hide more
// than its haze (100 m against 400), as the near snow of a big snow day
// does. Fewer read as a moderate fall. Real heavy snow has some thousand
// flakes a cubic metre, most too small to draw. The near ones make a fall
// look heavy, so a deeper box with as many flakes looks thinner, not
// thicker. What a flake costs is its vertices, whatever its size (only the
// few nearest cover many pixels), so thickness comes cheapest from bigger
// flakes: a blizzard's real snow is fine (the gale breaks the crystals),
// but its drawn flakes, each standing for many of them, run to 25 mm,
// 120,000 of them looking thicker than 180,000 of 16 mm at most.
//
// The far box is what makes the fall deep. Snow fills the air to the far
// bank, and what tells the eye so is the far snow: flakes a pixel or two
// across sinking slowly (a flake's speed across the eye is its fall over its
// distance, so one 20 m off creeps at an eighth of one 2.5 m off), the far
// water and the bank seen through their grain, and, as the eye orbits, the
// near flakes sliding across them. Within the near box alone no flake is
// farther than its faces (8 m for heavy snow, the pond's far edge), and the
// snow reads as a slab in front of the scene, the haze beyond it a plain
// fog. The far box carries the flakes on to its faces, FAR.span times
// farther, at FAR.flakes times the near count: few a cubic metre, since
// what the eye sees of a shell of snow grows as the square of its distance
// (a flake at 20 m stands in the view for sixty-four at 2.5 m), and most of
// them resolved (at 20 m a 1080-row phone's pixel is 8 mm, heavy snow's
// flakes 8 to 50). Beyond the far box the haze (the weather's visibility)
// carries the snow on. The two boxes hand over across the near box's faces,
// where its flakes fade out and the far ones in. The
// shader never multiplies the clock, which runs on as long as the page is
// open: update() wraps the wind's carry and the fall into each box, and the
// clock to CYCLE, in doubles (Precision, src/shaders/snow.js). The carry is
// summed frame by frame (the wind's speed times the frame's seconds), so a
// change of wind turns the flakes rather than moving them all at once; the
// gusts grow or calm over GUST_EASE seconds, for the same reason.
//
// The quality presets (src/main.js QUALITY `snowShare`) draw that share of
// the flakes: the snow thins on a weaker device, its look the same.
//
// Cost while it snows: one draw of `flakes` near and FAR.flakes times as
// many far (times the preset's share) instanced quads, their vertex shader a
// few dozen operations and, under a gale, one lookup of its waves; the far
// flakes a pixel or two each; no pass, no target, nothing on the CPU but a
// few uniforms. With no snow nothing is drawn.
import * as THREE from 'three';
import { FLAKE_VERTEX, FLAKE_FRAGMENT, SPEED_STEPS, SPEED_SHARE, CYCLE } from './shaders/snow.js';

export const SNOW = {
  light: { flakes: 16000, box: [16, 8, 16], fall: 0.9, sizes: [0.004, 0.012], sway: 0.05, swayPeriods: [1.2, 2.6], opacity: 0.9 },
  heavy: { flakes: 120000, box: [16, 8, 16], fall: 1.1, sizes: [0.008, 0.05], sway: 0.08, swayPeriods: [1.0, 2.2], opacity: 0.9 },
  blizzard: { flakes: 120000, box: [12, 6, 12], fall: 1.0, sizes: [0.005, 0.025], sway: 0.04, swayPeriods: [0.8, 1.6], opacity: 1 },
};
// The far box: the near box's size times `span` (its floor FAR_FLOOR under the water, FLAKE_VERTEX), holding
// `flakes` times the near count (a tenth of the near density, in 13.5 times the volume); its flakes are
// interleaved with the near ones at that ratio, so any share of the instances draws both (farFlags).
export const FAR = { span: [3, 1.5, 3], flakes: 4 / 3 };
/** The far box of `snow` (an entry of SNOW), metres. */
export const farBox = (snow) => snow.box.map((side, axis) => side * FAR.span[axis]);
/** The instances drawn for `snow` (an entry of SNOW): its near flakes and the far ones. */
export const instancesOf = (snow) => Math.round(snow.flakes * (1 + FAR.flakes));
export const STREAK_SECONDS = 1 / 120;  // real seconds: a quarter of the rain's persistence (src/rain.js): the eye follows a flake falling a metre a second
export const STREAK_MIN_PIXELS = 1.2;
export const GUST_SHARE = 0.3;          // the gusts' speed against the wind's
const GUST_PERIOD = 2.4;                // seconds: FLAKE_MOTION's
const GUST_EASE = 1.5;                  // seconds the gusts take to follow a change of wind (their reach is uGust over their rate)
const TAU = 2 * Math.PI;
const wrap = (value, span) => value - span * Math.floor(value / span);
/** A rate of about 2π/period, a whole number of turns in CYCLE (FLAKE_MOTION's cycleRate). */
const cycleRate = (period) => TAU / CYCLE * Math.max(Math.round(CYCLE / period), 1);
/** A flake's speed step (0 to SPEED_STEPS) from its size attribute, and its speed against the fall. */
export function flakeSpeed(sizeAttribute) {
  const step = Math.min(Math.floor(sizeAttribute * (SPEED_STEPS + 1)), SPEED_STEPS);
  return { step, speed: 0.8 + SPEED_SHARE * step };
}

/**
 * Instance `index`'s two attributes (aFlake, aSway), each four numbers in
 * [0, 1) from one seeded stream: the same flakes every run. The stream
 * is Park–Miller's (state × 16807 mod 2³¹ − 1), its product split in
 * 32-bit halves (Carta's), the same numbers in 0.6 of the time of a
 * floating-point modulo: built at startup, a blizzard's are 2.2 million.
 * `fars` is its third (aFar): 1 for a far flake, interleaved so that the
 * first n instances, whatever n, hold near and far ones at FAR.flakes.
 */
export function flakeAttributes(count) {
  const flakes = new Float32Array(count * 4);
  const sways = new Float32Array(count * 4);
  const fars = farFlags(count);
  let state = 20261021;
  const random = () => {
    let low = 16807 * (state & 0xffff);
    const high = 16807 * (state >>> 16);
    low += ((high & 0x7fff) << 16) + (high >>> 15);
    state = low > 0x7fffffff ? low - 0x7fffffff : low;
    return (state - 1) / 2147483646;
  };
  for (let index = 0; index < count * 4; index++) { flakes[index] = random(); sways[index] = random(); }
  return { flakes, sways, fars };
}

/** Which of `count` instances are far flakes: 1 where the running share of far ones (FAR.flakes of the near) steps up. */
export function farFlags(count) {
  const flags = new Float32Array(count);
  const farShare = FAR.flakes / (1 + FAR.flakes);
  for (let index = 0; index < count; index++) flags[index] = Math.floor((index + 1) * farShare) > Math.floor(index * farShare) ? 1 : 0;
  return flags;
}

/**
 * Where a flake is and how it moves at `time` (FLAKE_MOTION's twin):
 * `flake` and `sway` its attributes, `snow` an entry of SNOW, `drift` the
 * wind's [x, z] (m/s), `far` whether it is a far flake (its start in the far
 * box). Unwrapped: the shader wraps the place into the box.
 */
export function flakeAt(flake, sway, time, snow, drift, far = false) {
  const box = far ? farBox(snow) : snow.box;
  const gustSpeed = GUST_SHARE * Math.hypot(drift[0], drift[1]);
  const { speed } = flakeSpeed(flake[3]);
  const cycleTime = wrap(time, CYCLE);   // the swings and gusts repeat in CYCLE: the same as the clock's own
  const swayRate = cycleRate(snow.swayPeriods[0] + (snow.swayPeriods[1] - snow.swayPeriods[0]) * sway[2]);
  const swingX = swayRate * cycleTime + TAU * sway[0], swingZ = swayRate * cycleTime + TAU * sway[1];
  const gustPeriod = GUST_PERIOD / (0.7 + 0.6 * sway[3]);
  const gustRate = [cycleRate(gustPeriod), cycleRate(gustPeriod / 1.7), cycleRate(gustPeriod / 1.3)];
  const gust = gustRate.map((rate, axis) => rate * cycleTime + axis + TAU * 7 * sway[3]);
  const gustReach = [gustSpeed / gustRate[0], 0.4 * gustSpeed / gustRate[0], gustSpeed / gustRate[0]];
  const steady = [drift[0], -snow.fall * speed, drift[1]];
  const start = [flake[0] * box[0], flake[2] * box[1], flake[1] * box[2]];
  const place = [
    start[0] + steady[0] * time + snow.sway * Math.sin(swingX) + gustReach[0] * Math.sin(gust[0]),
    start[1] + steady[1] * time + gustReach[1] * Math.sin(gust[1]),
    start[2] + steady[2] * time + snow.sway * Math.cos(swingZ) + gustReach[2] * Math.cos(gust[2]),
  ];
  const velocity = [
    steady[0] + snow.sway * swayRate * Math.cos(swingX) + gustReach[0] * gustRate[0] * Math.cos(gust[0]),
    steady[1] + gustReach[1] * gustRate[1] * Math.cos(gust[1]),
    steady[2] - snow.sway * swayRate * Math.sin(swingZ) - gustReach[2] * gustRate[2] * Math.sin(gust[2]),
  ];
  return { place, velocity };
}

/**
 * The uniforms that carry the clock (Precision, src/shaders/snow.js), for
 * `snow` (an entry of SNOW) at `time` (s) in the wind `drift` ([x, z], m/s):
 * worked out in doubles, each wrapped into the near box (`drift`, `fall`),
 * the far box (`farDrift`, `farFall`) or the cycle.
 */
export function clockOffsets(time, snow, drift) {
  const offsets = (box) => ({
    drift: [wrap(drift[0] * time, box[0]), wrap(drift[1] * time, box[2])],
    fall: [wrap(0.8 * snow.fall * time, box[1]), wrap(SPEED_SHARE * snow.fall * time, box[1])],
  });
  const near = offsets(snow.box), far = offsets(farBox(snow));
  return { cycleTime: wrap(time, CYCLE), drift: near.drift, fall: near.fall, farDrift: far.drift, farFall: far.fall };
}

/**
 * How a flake is drawn (FLAKE_VERTEX's): `diameter` (m), `speed` (m/s
 * across the line of sight) at `depth` (m) for a camera of `focal` pixels
 * per unit tan, in slow motion of `timeScale`: its capsule's width and
 * length (m) and the share of it the flake covers.
 */
export function flakeDrawn(diameter, speed, depth, focal, timeScale = 1) {
  const width = Math.max(diameter, STREAK_MIN_PIXELS * depth / focal);
  const swept = speed * STREAK_SECONDS * timeScale;
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
    this.share = 1;   // of the flakes drawn (the quality preset's, setShare)
    this.wind = new THREE.Vector2();
    this.gust = 0;          // m/s: the gusts' speed now, easing toward GUST_SHARE of the wind's
    this.clock = null;      // s: the time of the last update, from which the carry is summed (null: none yet)
    this.carry = { drift: [0, 0], fall: [0, 0], farDrift: [0, 0], farFall: [0, 0] };   // m: clockOffsets', summed frame by frame
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 2, 1, 3]);
    const largest = Math.max(...Object.values(SNOW).map(instancesOf));
    const { flakes, sways, fars } = flakeAttributes(largest);
    quad.setAttribute('aFlake', new THREE.InstancedBufferAttribute(flakes, 4));
    quad.setAttribute('aSway', new THREE.InstancedBufferAttribute(sways, 4));
    quad.setAttribute('aFar', new THREE.InstancedBufferAttribute(fars, 1));
    quad.instanceCount = 0;
    const light = SNOW.light;
    this.flakes = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: FLAKE_VERTEX,
      fragmentShader: FLAKE_FRAGMENT,
      uniforms: {
        uCycleTime: { value: 0 },
        uDriftOffset: { value: new THREE.Vector3() },
        uFallOffsets: { value: new THREE.Vector2() },
        uFarDriftOffset: { value: new THREE.Vector3() },
        uFarFallOffsets: { value: new THREE.Vector2() },
        uBox: { value: new THREE.Vector3(...light.box) },
        uFarBox: { value: new THREE.Vector3(...farBox(light)) },
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

  /** The flakes drawn while it snows, near and far (0 with none). */
  get count() { return this.on ? this.flakes.geometry.instanceCount : 0; }

  /** The share of each snow's flakes drawn (the quality preset's `snowShare`, src/main.js). */
  setShare(share) {
    this.share = share;
    if (this.intensity) this.flakes.geometry.instanceCount = Math.round(instancesOf(SNOW[this.intensity]) * share);
  }

  /** The wind the flakes drift with: its direction (world XZ, unit) and speed (m/s); its gusts toss them. */
  setWind(direction, speed) {
    this.wind.set(direction[0], direction[1]).normalize().multiplyScalar(speed);
    const uniforms = this.flakes.material.uniforms;
    uniforms.uDrift.value.set(this.wind.x, 0, this.wind.y);
    if (!this.on) this.easeGust(Infinity);   // no flakes to see it change: at once
  }

  /** The slow motion's scale (world seconds a real one): a flake sweeps its capsule over the world time the eye's persistence spans (flakeDrawn's timeScale). */
  setTimeScale(scale) { this.flakes.material.uniforms.uStreakSeconds.value = STREAK_SECONDS * scale; }

  /** The gusts' speed `seconds` closer to GUST_SHARE of the wind's (GUST_EASE). */
  easeGust(seconds) {
    const target = GUST_SHARE * this.wind.length();
    this.gust += (target - this.gust) * (1 - Math.exp(-Math.max(seconds, 0) / GUST_EASE));
    this.flakes.material.uniforms.uGust.value = this.gust;
  }

  /** Snow by intensity (a key of SNOW), or none (null). At once: nothing is fetched. */
  setIntensity(name) {
    this.intensity = Object.hasOwn(SNOW, name ?? '') ? name : null;
    if (!this.intensity) { this.show(false); return; }
    if (!this.on) { this.clock = null; this.easeGust(Infinity); }   // a new fall: its carry from the clock, its gusts the wind's
    const snow = SNOW[this.intensity];
    const uniforms = this.flakes.material.uniforms;
    uniforms.uBox.value.set(...snow.box);
    uniforms.uFarBox.value.set(...farBox(snow));
    uniforms.uFall.value = snow.fall;
    uniforms.uSway.value = snow.sway;
    uniforms.uSwayPeriods.value.set(...snow.swayPeriods);
    uniforms.uSizes.value.set(...snow.sizes);
    uniforms.uOpacity.value = snow.opacity;
    this.flakes.geometry.instanceCount = Math.round(instancesOf(snow) * this.share);
    this.show(true);
  }

  show(snowing) { this.flakes.visible = snowing; }

  /** The flakes at world time `time` (seconds), for the camera, whose render target is `resolution` pixels. */
  update(time, camera, resolution) {
    if (!this.on || !this.intensity) return;   // the warm-up draws it with none chosen: nothing to move
    const uniforms = this.flakes.material.uniforms;
    const snow = SNOW[this.intensity];
    if (this.clock === null) {
      this.carry = clockOffsets(time, snow, [this.wind.x, this.wind.y]);
    } else {
      // Summed (the header): wrapped into each box as it is now, which a new intensity changes.
      const seconds = time - this.clock;
      const sum = (carried, fall, box) => {
        carried[0] = wrap(carried[0] + this.wind.x * seconds, box[0]);
        carried[1] = wrap(carried[1] + this.wind.y * seconds, box[2]);
        fall[0] = wrap(fall[0] + 0.8 * snow.fall * seconds, box[1]);
        fall[1] = wrap(fall[1] + SPEED_SHARE * snow.fall * seconds, box[1]);
      };
      sum(this.carry.drift, this.carry.fall, snow.box);
      sum(this.carry.farDrift, this.carry.farFall, farBox(snow));
      if (seconds !== 0) this.easeGust(seconds);
    }
    this.clock = time;
    uniforms.uCycleTime.value = wrap(time, CYCLE);
    uniforms.uDriftOffset.value.set(this.carry.drift[0], 0, this.carry.drift[1]);
    uniforms.uFallOffsets.value.set(this.carry.fall[0], this.carry.fall[1]);
    uniforms.uFarDriftOffset.value.set(this.carry.farDrift[0], 0, this.carry.farDrift[1]);
    uniforms.uFarFallOffsets.value.set(this.carry.farFall[0], this.carry.farFall[1]);
    uniforms.uFocalPx.value = camera.projectionMatrix.elements[5] * resolution.y * 0.5;
  }
}
