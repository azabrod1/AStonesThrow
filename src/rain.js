// Rain on the pond: the rings the drops leave on the water, the streaks they
// cut as they fall, and the flecks they throw up where they land. The
// overcast and the haze that come with them are the sky's (src/sky.js,
// setWeather); the Weather setting (src/main.js) sets both.
//
// The rings. tools/rain-probe.mjs works out the ring a raindrop leaves, the
// linear capillary-gravity waves that run out from the crater it opens (a
// train of crests closing up on the slowest waves, 1.7 cm long, 0.23 m/s),
// and writes it as a table of height and radial slope over radius and time
// (assets/rain/ring.json and ring_profile.bin), fetched the first time it
// rains, or alongside the sky when rainy weather is remembered, or at the
// first impact for the drop rings (src/dropRings.js, which share it: it is
// uploaded with its mip chain, tableMipmaps, for their lookups). Downloads
// time out after 30 seconds without progress and may be retried; intensity
// changes during a download still use the latest selection. Each frame one pass
// (RAIN_TILE_FRAGMENT in src/shaders/rain.js)
// draws the rings of the drops of the moment into a tile of TILE_SIZE
// metres, TEXELS per side (RGBA16F: height in millimetres, ∂h/∂x, ∂h/∂z;
// linear, mipmapped, repeat-wrapped). The drops come from a schedule with
// no state (RAIN_DROPS): the tile is cut into cells, each holding a few
// slots that each land a drop every period at a new place in the cell and
// with a new size, all hashed from the clock, so the harness renders the
// same rain every run and the flecks find the very drops the tile draws. A
// drop's ring is the table's scaled to its size f as a capillary ring
// scales, f·η(r/f, t/f^1.5), drawn out to one cell and over its life.
//
// The water reads the tile twice (RAIN_RIPPLES), the second time turned and
// shifted, so its drops land at two unrelated places and its repeat does not
// show; each reading carries half the rain. Its slopes add to the water's,
// read at the pixel's mip level so far rings average out, and what they
// lose is roughness: by Campbell's theorem drops landing at random at a rate
// λ give the water a slope variance of λ ∫∫ |∇η|² dA dt, whose spectrum
// (slopePower, the probe's, for this rain's ring life and sizes) spread over
// the tile's lattice gives what each mip level loses, as the wind's ripples'
// is found (mipAxisFactor, src/ambientWaves.js).
//
// The streaks (STREAK_VERTEX): drops of the same schedule, each falling at
// about its terminal speed, slanted by the wind, to the very place its ring
// opens and its fleck rises, drawn as the streak it cuts in STREAK_SECONDS
// of real time (so of world time that times the slow motion's scale,
// setTimeScale: in slow motion a streak shortens, as the splash's drops do).
// Each tile whose drops can fall within STREAK_REACH of the eye (round the
// eye, swept downwind as far as a drop drifts in its fall: streakTiles), in
// each reading, gives a few of its drops a streak (layOutStreaks), laid out
// again when the rain or the wind changes: the drops of its class, the tiles
// taking turns so a drop's twins in the tiles round it, falling in step,
// are 3 to 5 m apart (streakLayout). A slot's streak is
// its next drop, so it starts as high as the drop falls in the slot's period
// (about 7.5 m in light rain, 9.6 m in heavy) and there are as many streaks
// to a cubic metre as the rain's streakDensity. The flecks (FLECK_VERTEX): a
// point at each drop near where the eye looks, rising and falling once over
// FLECK_LIFE seconds, the crown and jet a drop throws up, too small to be
// more than a fleck of white at a few metres. Both stand on a gale's waves
// (src/galeWaves.js).
//
// RAIN: per intensity, the rate of the drops that leave a ring one can see
// (per m² per second), the cell (metres, dividing TILE_SIZE) and its slots
// (enough that a slot's ring has gone before it lands its next drop), the
// drops' sizes against the probe's reference drop (2 mm across), the rings'
// life, the fall (m/s), the streaks per cubic metre of air and their
// opacity, and the flecks' opacity.
// Light rain's drops are smaller and slower and its rings live longer
// (fewer drops cross them); heavy rain's land every few centimetres, each
// ring broken up within half a second.
//
// Cost while it rains: the tile pass (9 cells, a few slots each, one table
// lookup per drop per texel), two lookups per water pixel, the streaks'
// quads (7,800 in still air's light rain to 21,600 in its heavy rain, up to
// 39,000 in a gale's, most of them out of reach and dropped by the vertex
// shader before it looks up a wave) and the flecks' points; with no rain,
// none of it runs.
import * as THREE from 'three';
import { loadAsset } from './loadAsset.js';
import { FullscreenPass, createFloatTarget } from './gpu.js';
import { mipAxisFactor } from './ambientWaves.js';
import { RAIN_TILE_FRAGMENT, RAIN_MAX_SLOTS, STREAK_VERTEX, STREAK_FRAGMENT, FLECK_VERTEX, FLECK_FRAGMENT } from './shaders/rain.js';

export const RAIN = {
  light: { rate: 60, cell: 0.2, sizes: [0.6, 1.2], life: 0.8, fall: 4.5, dropDiameter: 0.0015, streakDensity: 1.25, streakOpacity: 0.45, fleckOpacity: 0.5 },
  heavy: { rate: 600, cell: 0.125, sizes: [1.0, 1.8], life: 0.45, fall: 7.5, dropDiameter: 0.003, streakDensity: 3, streakOpacity: 0.45, fleckOpacity: 0.7 },
};
const TILE_SIZE = 1;                 // metres
const READINGS = 2;                  // the water reads the tile twice (RAIN_RIPPLES)
const RAIN_LEVELS = 10;              // the water shader's table of unresolved variance (RAIN_RIPPLES)
const STREAK_REACH = 10 * Math.sqrt(4 / Math.PI);   // metres about the eye the streaks fade out by: a circle as big as a 20 m square, faded from 0.6 of it
const STREAK_SPEEDS = [0.85, 1.15];  // the smallest drop's fall and the biggest's, times the rain's
const STREAK_SECONDS = 1 / 30;       // real seconds: the eye's persistence
const STREAK_MIN_PIXELS = 1.2;
const FLECK_REPEATS = 4;             // tiles each way from the one the eye looks at
const FLECK_LIFE = 0.12;             // seconds, for the reference drop
const FLECK_SIZE = 0.004;            // metres across, for the reference drop
const FLECK_HEIGHT = 0.012;          // metres the jet rises, for the reference drop
const FLECK_MIN_PIXELS = 1.5;

/**
 * The slope power of one drop's ring per unit wavenumber (m²·s·m, so that
 * rate × ∫ dk is the slope variance |∇h|²), for a ring living `life`
 * seconds and fading out over its last `fadeShare` of it, at `wavenumber`:
 * 2π k³ H(k)² ∫ cos²(ωt) e^(−4νk²t) fade(t)² dt (tools/rain-probe.mjs).
 */
function slopePower(ring, life, wavenumber) {
  const { gravity, surfaceTensionOverDensity, viscosity } = ring.physics;
  const { depth, width } = ring.crater;
  const frequency = Math.sqrt(gravity * wavenumber + surfaceTensionOverDensity * wavenumber ** 3);
  const crater = -depth * width * width * Math.exp(-0.5 * (wavenumber * width) ** 2);
  const steps = 400;
  let integral = 0;
  for (let step = 0; step <= steps; step++) {
    const time = (step / steps) * life;
    const fraction = Math.min(Math.max((life - time) / (ring.fadeShare * life), 0), 1);
    const fade = fraction * fraction * (3 - 2 * fraction);
    integral += (step === 0 || step === steps ? 0.5 : 1) * (life / steps) * Math.cos(frequency * time) ** 2 * Math.exp(-4 * viscosity * wavenumber * wavenumber * time) * fade * fade;
  }
  return 2 * Math.PI * wavenumber ** 3 * crater * crater * integral;
}

/** How one slot of a cell is laid out for a rain: the slots per cell and the period between a slot's drops. */
export function rainSchedule({ rate, cell, sizes, life }) {
  const perCell = (rate / READINGS) * cell * cell;              // drops per second in one cell of one reading
  const longestRing = life * Math.max(...sizes) ** 1.5;          // a slot's ring must be gone before its next drop
  const slots = Math.max(1, Math.ceil(perCell * longestRing));
  if (slots > RAIN_MAX_SLOTS) throw new Error(`a rain of ${rate} per m² per second needs ${slots} drops a cell, over RAIN_MAX_SLOTS (${RAIN_MAX_SLOTS}): make its cells smaller`);
  return { slots, period: slots / perCell, cells: Math.round(TILE_SIZE / cell) };
}

/**
 * The ring's table (two channels over width radii and height times) and its
 * mip chain down to 1×1, each level's texel the mean of the texels it
 * covers in the one above.
 */
export function tableMipmaps(table, width, height) {
  const levels = [{ data: table, width, height }];
  while (width > 1 || height > 1) {
    const above = levels[levels.length - 1];
    const nextWidth = Math.max(1, width >> 1), nextHeight = Math.max(1, height >> 1);
    const data = new Float32Array(nextWidth * nextHeight * 2);
    for (let row = 0; row < nextHeight; row++) {
      const rowFrom = Math.floor(row * height / nextHeight), rowTo = Math.floor((row + 1) * height / nextHeight);
      for (let column = 0; column < nextWidth; column++) {
        const columnFrom = Math.floor(column * width / nextWidth), columnTo = Math.floor((column + 1) * width / nextWidth);
        for (let channel = 0; channel < 2; channel++) {
          let sum = 0;
          for (let sourceRow = rowFrom; sourceRow < rowTo; sourceRow++) {
            for (let sourceColumn = columnFrom; sourceColumn < columnTo; sourceColumn++) sum += above.data[(sourceRow * width + sourceColumn) * 2 + channel];
          }
          data[(row * nextWidth + column) * 2 + channel] = sum / ((rowTo - rowFrom) * (columnTo - columnFrom));
        }
      }
    }
    levels.push({ data, width: nextWidth, height: nextHeight });
    width = nextWidth;
    height = nextHeight;
  }
  return levels;
}

/**
 * How a rain's streaks are laid out for its schedule (the header): a tile's
 * drops; the streaks each tile gives in each reading (picks: the streak
 * density times the height a slot's drop falls from, over one tile and
 * shared by the readings); and the classes the tiles take turns in, each
 * class picks of the tile's drops, a tile's class (tileX + step·tileZ) mod
 * classes with the step that keeps a class's tiles farthest apart (5.1 m
 * for heavy rain's 27 classes, 3.2 m for light rain's 10, near a hexagonal
 * lattice's best).
 */
export function streakLayout(rain, { cells, slots, period }) {
  const drops = cells * cells * slots;
  const picks = Math.min(drops, Math.max(1, Math.round(rain.streakDensity * rain.fall * period * TILE_SIZE * TILE_SIZE / READINGS)));
  const classes = Math.floor(drops / picks);
  const nearestTwin = (step) => {
    let nearest = Infinity;
    for (let alongZ = -classes; alongZ <= classes; alongZ++) {
      for (let alongX = -classes; alongX <= classes; alongX++) {
        if ((alongX || alongZ) && (((alongX + step * alongZ) % classes) + classes) % classes === 0) nearest = Math.min(nearest, Math.hypot(alongX, alongZ));
      }
    }
    return nearest;
  };
  let step = 1;
  for (let candidate = 2; candidate < classes; candidate++) if (nearestTwin(candidate) > nearestTwin(step)) step = candidate;
  return { drops, picks, classes, step, twinDistance: classes > 1 ? nearestTwin(step) : TILE_SIZE };
}

/**
 * The tiles whose drops can fall within STREAK_REACH of the eye, for each
 * reading: offsets from the eye's tile, { x: [first, last], z: [first, last] }.
 * A drop lands downwind of where it falls past the eye, by the wind (`wind`,
 * world XZ, m/s) times the time it has left, at most the period at the
 * biggest drop's speed: the reach, swept that far downwind (in the second
 * reading's coordinates, RAIN_TURN times the world's), and a tile more each
 * way, so none comes or goes in sight as the eye crosses a tile's edge.
 */
export function streakTiles(wind, period) {
  const drift = [wind.x * period * STREAK_SPEEDS[1], wind.y * period * STREAK_SPEEDS[1]];
  const readings = [drift, [0.8 * drift[0] - 0.6 * drift[1], 0.6 * drift[0] + 0.8 * drift[1]]];
  const span = (along) => [Math.floor((Math.min(0, along) - STREAK_REACH) / TILE_SIZE) - 1, Math.ceil((Math.max(0, along) + STREAK_REACH) / TILE_SIZE) + 1];
  return readings.map(([alongX, alongZ]) => ({ x: span(alongX), z: span(alongZ) }));
}

/** The streaks' quads for a rain under a wind (streakLayout, streakTiles). */
export function streakCount(rain, schedule, wind) {
  const { picks } = streakLayout(rain, schedule);
  return streakTiles(wind, schedule.period).reduce((sum, { x, z }) => sum + picks * (x[1] - x[0] + 1) * (z[1] - z[0] + 1), 0);
}

/** The tile (integer XZ) a world point (XZ) lies in, for each reading as RAIN_RIPPLES reads the tile, set into the two vectors given. */
function readingTiles(point, [first, second]) {
  first.set(Math.floor(point[0] / TILE_SIZE), Math.floor(point[1] / TILE_SIZE));
  // The second reading's tile coordinates: RAIN_TURN times the world's, shifted (src/shaders/rain.js).
  second.set(Math.floor((0.8 * point[0] - 0.6 * point[1]) / TILE_SIZE + 0.37), Math.floor((0.6 * point[0] + 0.8 * point[1]) / TILE_SIZE + 0.71));
}

/** Download without GPU work, so a remembered rain can load alongside the sky. */
export async function loadRainData() {
  const folder = new URL('../assets/rain/', import.meta.url);
  const ring = await loadAsset(new URL('ring.json', folder));
  const table = new Float32Array(await loadAsset(new URL(ring.profile, folder), 'arrayBuffer'));
  return { ring, table };
}

export class Rain {
  /**
   * @param renderer THREE.WebGLRenderer
   * @param lighting the scene's lighting (src/main.js): the streaks and flecks take the sky's light and the sun's
   * @param options.download optional early download, settled as { data } or { error }
   * @param options.texels the tile's texels per side (a power of two up to 2^(RAIN_LEVELS − 1))
   */
  constructor(renderer, lighting, { texels = 512, gale = {}, download = null } = {}) {
    this.renderer = renderer;
    this.intensity = null;
    this.falling = null;          // the rain whose streaks are laid out, and its schedule (layOutStreaks)
    this.ring = null;             // ring.json, once fetched
    this.loading = null;
    this.download = download;
    this.unresolvedVariance = new Array(RAIN_LEVELS).fill(0);   // the water's uniform holds this array: filled in place
    // A placeholder table until the real one has come: the programs compile
    // against it when rain is selected for the warm-up.
    this.profileTexture = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGFormat, THREE.HalfFloatType);
    this.profileTexture.needsUpdate = true;
    this.tileTarget = null;
    this.texels = 0;
    this.scheduleUniforms = {
      uRainTime: { value: 0 },
      uRainCell: { value: RAIN.light.cell },
      uRainCells: { value: Math.round(TILE_SIZE / RAIN.light.cell) },
      uRainSlots: { value: 1 },
      uRainPeriod: { value: 1 },
      uRainSizes: { value: new THREE.Vector2(1, 1) },
    };
    this.tilePass = new FullscreenPass(RAIN_TILE_FRAGMENT, {
      ...this.scheduleUniforms,
      uProfile: { value: this.profileTexture },
      uProfileTexels: { value: new THREE.Vector2(1, 1) },
      uProfileRadius: { value: 0.3 },
      uProfileTime: { value: 0.8 },
      uEdgeShare: { value: 0.15 },
      uLife: { value: 0.8 },
      uFadeShare: { value: 0.3 },
      uTileSize: { value: TILE_SIZE },
    });
    this.sharedUniforms = {
      uRain: { value: null },
      uRainOn: { value: 0 },
      uRainTileSize: { value: TILE_SIZE },
      uRainTexels: { value: texels },
      uRainUnresolved: { value: this.unresolvedVariance },
    };
    this.setTexels(texels);

    // The streaks: a quad per pick of each tile near the eye, in each reading, instanced (layOutStreaks).
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 2, 1, 3]);
    const stillAir = { x: 0, y: 0 };
    const largestStreaks = Math.max(...Object.values(RAIN).map((rain) => streakCount(rain, rainSchedule(rain), stillAir)));
    quad.setAttribute('aStreak', new THREE.InstancedBufferAttribute(new Float32Array(largestStreaks * 4), 4));   // grown for a wind that needs more (layOutStreaks)
    quad.instanceCount = 0;
    this.lightUniforms = {
      uSkyAmbient: { value: lighting.skyAmbient },
      uSunIrradiance: { value: lighting.sunIrradiance },
      uSunDir: { value: lighting.sunDirection },
    };
    this.streaks = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: STREAK_VERTEX,
      fragmentShader: STREAK_FRAGMENT,
      uniforms: {
        ...this.scheduleUniforms,
        uEyeTile: { value: [new THREE.Vector2(), new THREE.Vector2()] },
        uTileSize: { value: TILE_SIZE },
        uPickClasses: { value: 1 },
        uClassStep: { value: 1 },
        uReach: { value: STREAK_REACH },
        uFall: { value: new THREE.Vector3(0, -RAIN.light.fall, 0) },
        uSpeeds: { value: new THREE.Vector2(...STREAK_SPEEDS) },
        uStreakSeconds: { value: STREAK_SECONDS },
        uFocalPx: { value: 1000 },
        uDropDiameter: { value: RAIN.light.dropDiameter },
        uMinPixels: { value: STREAK_MIN_PIXELS },
        uOpacity: { value: RAIN.light.streakOpacity },
        ...this.lightUniforms,
        ...gale,   // the gale's uniforms (src/galeWaves.js): the streaks land on its waves
      },
      side: THREE.DoubleSide,   // a ribbon's winding turns with its streak against the eye
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;

    // The flecks: a point per slot of each cell of each tile near the focus, for each reading.
    const span = 2 * FLECK_REPEATS + 1;
    const largestCells = Math.max(...Object.values(RAIN).map((rain) => rainSchedule(rain).cells ** 2 * rainSchedule(rain).slots));
    const fleckCount = largestCells * span * span * READINGS;
    const points = new THREE.BufferGeometry();
    points.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(fleckCount * 3), 3));
    points.setAttribute('aSchedule', new THREE.Float32BufferAttribute(new Float32Array(fleckCount * 3), 3));
    points.setAttribute('aRepeat', new THREE.Float32BufferAttribute(new Float32Array(fleckCount * 3), 3));
    points.setDrawRange(0, 0);
    this.fleckGeometry = points;
    this.flecks = new THREE.Points(points, new THREE.ShaderMaterial({
      vertexShader: FLECK_VERTEX,
      fragmentShader: FLECK_FRAGMENT,
      uniforms: {
        ...this.scheduleUniforms,
        uFocusTile: { value: [new THREE.Vector2(), new THREE.Vector2()] },
        uTileSize: { value: TILE_SIZE },
        uProjScale: { value: 1000 },
        uMinPixels: { value: FLECK_MIN_PIXELS },
        uFleckLife: { value: FLECK_LIFE },
        uFleckSize: { value: FLECK_SIZE },
        uFleckHeight: { value: FLECK_HEIGHT },
        uOpacity: { value: RAIN.light.fleckOpacity },
        ...this.lightUniforms,
        ...gale,   // the gale's uniforms (src/galeWaves.js): the flecks stand on its waves
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.flecks.frustumCulled = false;
    this.flecks.visible = false;
    this.wind = new THREE.Vector2();
  }

  /** Uniforms for every material that reads the rain's tile (RAIN_RIPPLES): shared objects. */
  uniforms() { return this.sharedUniforms; }

  /** Whether it is raining (an intensity set and its ring fetched). */
  get on() { return this.sharedUniforms.uRainOn.value > 0; }

  /** The tile's texels per side (the quality presets', src/main.js); its target is made again at that size. */
  setTexels(texels) {
    if (texels === this.texels) return;
    this.tileTarget?.dispose();
    this.texels = texels;
    this.tileTarget = createFloatTarget(texels, texels, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, wrap: THREE.RepeatWrapping, mipmaps: true });
    this.sharedUniforms.uRain.value = this.tileTarget.texture;
    this.sharedUniforms.uRainTexels.value = texels;
    if (this.intensity && this.ring) this.measureRoughness();
  }

  /** The wind the streaks slant with: its direction (world XZ, unit) and speed (m/s). */
  setWind(direction, speed) {
    this.wind.set(direction[0], direction[1]).normalize().multiplyScalar(speed);
    this.updateFall();
    if (this.falling) this.layOutStreaks(this.falling.rain, this.falling.schedule);   // the tiles swept downwind change with it
  }

  /** The slow motion's scale (world seconds a real one): the streaks are cut over the world time the eye's persistence spans. */
  setTimeScale(scale) { this.streaks.material.uniforms.uStreakSeconds.value = STREAK_SECONDS * scale; }

  updateFall() {
    const fall = this.intensity ? RAIN[this.intensity].fall : RAIN.light.fall;
    this.streaks.material.uniforms.uFall.value.set(this.wind.x, -fall, this.wind.y);
  }

  /** Fetch the ring's table once, with a timeout; failed requests may be retried. */
  load() {
    this.loading ??= (async () => {
      const download = this.download;
      this.download = null;   // consume once; a failed preload must not poison a retry
      const result = download ? await download : { data: await loadRainData() };
      if (result.error) throw result.error;
      const { ring, table } = result.data;
      // With its mip chain, for the drop rings' lookups (src/dropRings.js); the tile reads its base level.
      const levels = tableMipmaps(table, ring.radii, ring.times).map(({ data, width, height }) => {
        const halves = new Uint16Array(data.length);
        for (let index = 0; index < data.length; index++) halves[index] = THREE.DataUtils.toHalfFloat(data[index]);
        return { data: halves, width, height };
      });
      const texture = new THREE.DataTexture(levels[0].data, ring.radii, ring.times, THREE.RGFormat, THREE.HalfFloatType);
      texture.mipmaps = levels;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      const uniforms = this.tilePass.material.uniforms;
      uniforms.uProfile.value = texture;
      uniforms.uProfileTexels.value.set(ring.radii, ring.times);
      uniforms.uProfileRadius.value = ring.radius;
      uniforms.uProfileTime.value = ring.time;
      uniforms.uEdgeShare.value = ring.edgeShare;
      uniforms.uFadeShare.value = ring.fadeShare;
      this.profileTexture.dispose();
      this.profileTexture = texture;
      this.ring = ring;
    })().catch((error) => { this.loading = null; throw error; });
    return this.loading;
  }

  /**
   * Rain by intensity (a key of RAIN), or none (null). The first rain waits
   * for its ring's table; resolves once it falls.
   */
  async setIntensity(name) {
    const intensity = Object.hasOwn(RAIN, name ?? '') ? name : null;
    this.intensity = intensity;
    if (!intensity) { this.falling = null; this.show(false); return; }
    await this.load();
    if (this.intensity !== intensity) return;   // another was asked for meanwhile
    const rain = RAIN[intensity];
    const schedule = rainSchedule(rain);
    this.falling = { rain, schedule };   // the rain laid out, for a change of wind
    this.scheduleUniforms.uRainCell.value = rain.cell;
    this.scheduleUniforms.uRainCells.value = schedule.cells;
    this.scheduleUniforms.uRainSlots.value = schedule.slots;
    this.scheduleUniforms.uRainPeriod.value = schedule.period;
    this.scheduleUniforms.uRainSizes.value.set(rain.sizes[0], rain.sizes[1]);
    this.tilePass.material.uniforms.uLife.value = rain.life;
    const streakUniforms = this.streaks.material.uniforms;
    streakUniforms.uDropDiameter.value = rain.dropDiameter;
    streakUniforms.uOpacity.value = rain.streakOpacity;
    this.layOutStreaks(rain, schedule);
    this.flecks.material.uniforms.uOpacity.value = rain.fleckOpacity;
    this.layOutFlecks(schedule);
    this.updateFall();
    this.measureRoughness();
    this.show(true);
  }

  show(raining) {
    this.sharedUniforms.uRainOn.value = raining ? 1 : 0;
    this.streaks.visible = this.flecks.visible = raining;
  }

  /** The streaks' quads: each pick of each tile whose drops can fall near the eye, for each reading (streakLayout, streakTiles). */
  layOutStreaks(rain, schedule) {
    const { picks, classes, step } = streakLayout(rain, schedule);
    const count = streakCount(rain, schedule, this.wind);
    const geometry = this.streaks.geometry;
    let streak = geometry.getAttribute('aStreak');
    if (streak.count < count) {
      // A bigger buffer: three.js keeps a geometry's buffers, and the most instances it draws, until it is disposed.
      geometry.dispose();
      streak = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
      geometry.setAttribute('aStreak', streak);
    }
    let index = 0;
    streakTiles(this.wind, schedule.period).forEach(({ x, z }, reading) => {
      for (let tileZ = z[0]; tileZ <= z[1]; tileZ++) {
        for (let tileX = x[0]; tileX <= x[1]; tileX++) {
          for (let pick = 0; pick < picks; pick++) streak.setXYZW(index++, tileX, tileZ, reading, pick);
        }
      }
    });
    streak.needsUpdate = true;
    geometry.instanceCount = count;
    this.streaks.material.uniforms.uPickClasses.value = classes;
    this.streaks.material.uniforms.uClassStep.value = step;
  }

  /** The flecks' points: each slot of each cell of each tile within FLECK_REPEATS of the focus's, for each reading. */
  layOutFlecks({ cells, slots }) {
    const schedule = this.fleckGeometry.getAttribute('aSchedule');
    const repeat = this.fleckGeometry.getAttribute('aRepeat');
    let index = 0;
    for (let reading = 0; reading < READINGS; reading++) {
      for (let tileZ = -FLECK_REPEATS; tileZ <= FLECK_REPEATS; tileZ++) {
        for (let tileX = -FLECK_REPEATS; tileX <= FLECK_REPEATS; tileX++) {
          for (let cellZ = 0; cellZ < cells; cellZ++) {
            for (let cellX = 0; cellX < cells; cellX++) {
              for (let slot = 0; slot < slots; slot++) {
                schedule.setXYZ(index, cellX, cellZ, slot);
                repeat.setXYZ(index, tileX, tileZ, reading);
                index++;
              }
            }
          }
        }
      }
    }
    schedule.needsUpdate = repeat.needsUpdate = true;
    this.fleckGeometry.setDrawRange(0, index);
  }

  /**
   * What each mip level of the tile loses of the rain's slope variance
   * (the header), into unresolvedVariance in place.
   */
  measureRoughness() {
    const rain = RAIN[this.intensity];
    const [smallest, largest] = rain.sizes;
    // A ring of size f carries f^3.5 of the reference's ∫∫|∇η|² (area f², time f^1.5): its mean over the sizes.
    const sizeWeight = (largest ** 4.5 - smallest ** 4.5) / (4.5 * Math.max(largest - smallest, 1e-9));
    const texels = this.texels;
    const levels = Math.log2(texels) + 1;
    const factors = Array.from({ length: levels }, (unused, level) => mipAxisFactor(texels, TILE_SIZE, level));
    const step = 2 * Math.PI / TILE_SIZE;
    const powerCache = new Map();
    const powerAt = (wavenumber) => {
      const key = Math.round(wavenumber / step);
      if (!powerCache.has(key)) powerCache.set(key, slopePower(this.ring, rain.life, wavenumber));
      return powerCache.get(key);
    };
    const kept = new Float64Array(levels);
    for (let row = 0; row < texels; row++) {
      const latticeZ = row <= texels / 2 ? row : row - texels;
      for (let column = 0; column < texels; column++) {
        const latticeX = column <= texels / 2 ? column : column - texels;
        if (latticeX === 0 && latticeZ === 0) continue;
        const wavenumber = step * Math.hypot(latticeX, latticeZ);
        // The radial power per unit k spread over the ring of lattice points at that k: per lattice cell, P(k)/(2πk) · step².
        const share = powerAt(wavenumber) / (2 * Math.PI * wavenumber) * step * step;
        for (let level = 0; level < levels; level++) kept[level] += share * factors[level][column] * factors[level][row];
      }
    }
    const scale = rain.rate * sizeWeight;
    for (let level = 0; level < RAIN_LEVELS; level++) this.unresolvedVariance[level] = Math.max(kept[0] - kept[Math.min(level, levels - 1)], 0) * scale;
  }

  /**
   * Draw the tile at world time `time` (seconds), and place the streaks and
   * flecks for the camera, whose render target is `resolution` pixels and
   * which looks at the water about `focus` (world XZ).
   */
  update(time, camera, resolution, focus) {
    this.scheduleUniforms.uRainTime.value = time;
    if (!this.on) return;
    const previousTarget = this.renderer.getRenderTarget();
    this.tilePass.render(this.renderer, this.tileTarget);
    this.renderer.setRenderTarget(previousTarget);
    const focal = camera.projectionMatrix.elements[5] * resolution.y * 0.5;
    const streakUniforms = this.streaks.material.uniforms;
    streakUniforms.uFocalPx.value = focal;
    readingTiles([camera.position.x, camera.position.z], streakUniforms.uEyeTile.value);
    const fleckUniforms = this.flecks.material.uniforms;
    fleckUniforms.uProjScale.value = focal;
    readingTiles(focus, fleckUniforms.uFocusTile.value);
  }

  /** Draw the tile and the streaks and flecks once with a heavy rain's settings, so their programs are built (the warm-up, src/main.js). */
  warmUpTargets() {
    const previousTarget = this.renderer.getRenderTarget();
    this.tilePass.render(this.renderer, this.tileTarget);
    this.renderer.setRenderTarget(previousTarget);
  }
}
