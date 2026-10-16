// The sky: a photographed panorama on a dome, and the environment maps
// derived from it.
//
// The sky is an equirectangular HDRI from Poly Haven (CC0) in assets/sky/,
// drawn on a dome (a large box on layer 1, so the mirror pass sees it) at the
// far plane. Its measurements, in assets/sky/<name>.json, come from
// tools/sky-probe.mjs: the sun's direction in the file's frame, its
// irradiance, and the sky's mean radiance; for a place's hours (below) also
// what lights it, the true sun's position and where north is in the file.
// SKIES lists the places (the Sky setting's choices, src/main.js), each with
// its hours (the Time setting's) and how it is turned; the environment loads
// one to start and another whenever load() is called (Switching, below).
//
// Places and hours. Most places are one photograph. Lakeside and Mesas were
// each photographed from one spot through the day (Poly Haven's 2024 series
// by Greg Zaal and Jarod Guest, on the shore of a dammed lake in South Africa
// and on a hill above it 350 m away; Lakeside's afternoon is their 2019
// panorama, from the same rock, its sun at 14:41 local time to 0.1°), so each
// of their hours is a panorama of the same land at another time, and the
// land keeps still while the sun moves (Orientation).
//
// Orientation. The dome samples the panorama by direction as Three.js's
// equirect lookup does (equirectUv: u = atan(z, x)/2π + ½), with the x of the
// direction negated first when the entry is `mirrored` (the photo flipped left
// for right, to put better scenery in front), then turned about the vertical
// by the angle that puts the photo's sun at `sunAzimuth`, the scene's choice.
// The sun's elevation is the photo's; sunDirection is built from the two.
// A place with hours turns its `facing` hour so; every other hour is turned
// by that angle plus the difference of the two files' norths (sky-probe's
// north: from the true sun at the photo's time and place, or from lining the
// skyline up with another hour's), so the land lies where it lay in the
// facing hour and the hour's sun, or where it would be when it is down,
// stands where it stood that day against the land.
//
// The sun's colour. The scene's sun keeps the luminance of sunBalance (src/
// main.js), the irradiance it was balanced with under BALANCE_SKY, and takes
// the colour of the photo's sun relative to that sky's: so under the meadow
// it is sunBalance, and at sunrise as orange against it as the photo's sun is
// against the meadow's (lighting.sunIrradiance, filled in place).
//
// Brightness. The dome is scaled by the ratio of the scene's sun luminance to
// the photo's measured sun irradiance, so the photo's own ratio of sky to sun
// carries over, times
// SKY_EXPOSURE. That constant is π: the scene's diffuse shaders (floor, foam,
// specks) light a white surface facing the sun to sunIrradiance, without the
// Lambertian 1/π, so sunIrradiance is π times a physical irradiance in the
// units of the sky's radiance. Measured without it, the sky at the top of the
// home view came out a tenth as bright as the old Preetham sky and the
// reflected sky in the middle distance a fifth; with it, the ambient radiance
// of a test panorama (Poly Haven's Belfast Farmhouse, not shipped) landed
// within 7% of the hand-tuned constant the scene was balanced with,
// (0.26, 0.34, 0.46); Meadow 2's is 1.4 times that. skyAmbient, the
// cosine-weighted mean sky radiance that the foam, specks, floor and spray
// use, is the measured value on the same scale.
// The sun's light reaches the scene through the directional light and the
// analytic highlights, not through the environment: a sun disc thousands of
// times brighter than the sky would poison every blurred level of the
// prefiltered map and overflow the half-float cube, so the dome's radiance is
// capped at RADIANCE_CAP times the mean sky radiance (scaled down to keep
// its hue). Only a sun low ahead is in the home view's direct sight, where
// the cap leaves the photo's white disc and its starburst; the others' only
// in the mirror image and the cube.
//
// Light by the hour. Poly Haven exposes each panorama to be looked at, as an
// eye adapted to its light would see it: the sunlit hours of a series share
// one exposure (their suns measure within 8% of one another from 20° to 50°
// up, and at sunset, through nine air masses, 0.41 of noon's, as a clear,
// dry sky of 0.12 optical depths per air mass would leave it), and the
// dawn's and the dusk's are brought up to about a day's
// brightness. So a place's `anchor` hour (a sunlit one) takes the brightness
// of a single photograph, above, and every other hour keeps its file's
// brightness against the anchor's, times the light of its hour against the
// anchor's raised to 1 − ADAPTATION: illuminance(), the light on level
// ground under a clear sky with the true sun at the hour's elevation (no
// moon). The eye adapts most of the way, not all: twilight comes out darker
// than the photograph shows it, never black. Where the true sun is down
// (sky-probe's light 'none') the sky is all the light, and the scene's sun
// is dark, low where the true one is. That factor is the environment's
// `level` (1 for a single photograph and an anchor): the deep water's colour
// (src/main.js), a radiance lit by what falls on the water, takes it, and so
// does the cube's ground hemisphere.
//
// Switching. load(place, hour) fetches the photo and its measurements, then
// in one frame swaps the dome's texture and uniforms, fills lighting's sun
// and sky vectors in place, captures the cube and the prefiltered map again
// into the same targets (every material holding them keeps them) and frees
// the old photo. Nothing new is compiled: the dome, the capture's ground and
// the PMREM generator live as long as the environment. Until the photo has
// arrived the old sky stays, whole.
//
// The panorama and a water-coloured hemisphere below the horizon (the photo's
// own ground there would light drops and stones green from below; GROUND,
// times the level) are rendered once into a cube map that the droplets
// reflect, and a prefiltered copy lights the stones.
//
// Memory. The panorama's pixels are dropped from the CPU once they are on the
// GPU (nothing uploads it again). The captures need no depth buffer: the
// ground hemisphere is drawn after the dome, over it. The droplets sample the
// cube at its first and second mip levels (src/shaders/fluid.js), so it stays
// CUBE_SIZE; the stones (roughness 0.92) read only the prefiltered map's
// blurriest levels, so it is made from a capture of PREFILTER_SIZE, a
// sixteenth of the memory of one from the droplets' cube. createEnvironment
// reports its render targets and the panorama's bytes for the memory
// estimate (src/main.js).
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// The orientation was chosen from home-view frames (mirrored: the photo
// flipped left for right; sunAzimuth, degrees right of straight ahead, would
// put the sun elsewhere than the scene's own place for it). Meadow 2 mirrored
// puts tall trees on the left with sky between the crowns; as photographed
// the whole view ahead is a wall of foliage. Lakeside as photographed puts
// its wooded shore on the left, mirrored the view is open water to a low far
// shore. Lago d'Isola mirrored looks down the valley at the snowy peaks, as
// photographed into a wall of pines. The sunrise's sun, 5° up, stands in the
// home view's top right, a dead branch in the water just left of it, either
// way round. The open sky (clouds only) looks alike either way. A place with
// hours keeps Lakeside's afternoon as it was, its sun ahead to the right, so
// its sunrise is behind the eye, over the water on the right (turn round to
// see it), as it was that morning. Each panorama is about 6 MB, fetched only
// when chosen. An hour's `clock` is its local time (sky-probe's taken).
// `anchor` and `facing` (Light by the hour, Orientation) are the first hour
// unless named.
const SKIES = {
  lakeside: {
    anchor: 'afternoon',
    facing: 'afternoon',
    hours: {
      dawn: { file: 'lakeside_dawn', label: 'Dawn', clock: '06:27' },
      sunrise: { file: 'lakeside_sunrise', label: 'Sunrise', clock: '06:58' },
      afternoon: { file: 'lakeside', label: 'Afternoon', clock: '14:41' },
    },
  },
  mesas: {
    anchor: 'afternoon',
    facing: 'sunset',
    hours: {
      dawn: { file: 'qwantani_dawn', label: 'Dawn', clock: '06:28' },
      sunrise: { file: 'qwantani_sunrise', label: 'Sunrise', clock: '06:43' },
      morning: { file: 'qwantani_morning', label: 'Morning', clock: '08:09' },
      'mid-morning': { file: 'qwantani_mid_morning', label: 'Mid-morning', clock: '10:05' },
      noon: { file: 'qwantani_noon', label: 'Noon', clock: '12:18' },
      afternoon: { file: 'qwantani_afternoon', label: 'Afternoon', clock: '14:04' },
      'late-afternoon': { file: 'qwantani_late_afternoon', label: 'Late afternoon', clock: '16:04' },
      sunset: { file: 'qwantani_sunset', label: 'Sunset', clock: '17:09' },
      dusk: { file: 'qwantani_dusk_1', label: 'Dusk', clock: '17:47' },
      twilight: { file: 'qwantani_dusk_2', label: 'Twilight', clock: '18:06' },
    },
  },
  meadow: { mirrored: true, hours: { afternoon: { file: 'meadow_2', label: 'Afternoon' } } },
  alpine: { mirrored: true, hours: { midday: { file: 'lago_disola', label: 'Midday' } } },
  open: { hours: { midday: { file: 'kloofendal_48d_partly_cloudy_puresky', label: 'Midday' } } },
};
export const SKY_NAMES = Object.keys(SKIES);
export const DEFAULT_SKY = 'lakeside';   // an open lake to a far shore, as the Lake water is
/** A place's hours in the order of the day: their names, labels and local times (clock, 'hh:mm', or undefined for a lone photograph). */
export const skyHours = (place) => Object.entries(SKIES[place]?.hours ?? {}).map(([name, { label, clock }]) => ({ name, label, clock }));
/** The hour load() shows for a place asked for at `hour`: that one if the place has it, else its anchor. */
export function resolveHour(place, hour) {
  const known = SKIES[Object.hasOwn(SKIES, place ?? '') ? place : DEFAULT_SKY];
  return Object.hasOwn(known.hours, hour ?? '') ? hour : known.anchor ?? Object.keys(known.hours)[0];
}
const clockMinutes = (clock) => { const [hours, minutes] = clock.split(':').map(Number); return hours * 60 + minutes; };
/** The place's hour whose local time is nearest `clock` ('hh:mm'; round the day), or undefined if it has no clocks or there is no clock. */
export function nearestHour(place, clock) {
  if (!/^\d{2}:\d{2}$/.test(clock ?? '')) return undefined;
  const wanted = clockMinutes(clock);
  const apart = (other) => { const difference = Math.abs(clockMinutes(other) - wanted); return Math.min(difference, 1440 - difference); };
  return skyHours(place).filter((hour) => hour.clock).sort((first, second) => apart(first.clock) - apart(second.clock))[0]?.name;
}
const BALANCE_SKY = 'meadow';    // the sky the scene's sun colour (sunBalance) was chosen under
const SKY_EXPOSURE = Math.PI;   // see Brightness above
const RADIANCE_CAP = 30;       // times the mean sky radiance
const DOME_SIZE = 20000;       // metres, edge of the box
const CUBE_SIZE = 512;         // the droplets' cube, per face
const PREFILTER_SIZE = 128;    // the capture the stones' prefiltered map is made from, per face
const GROUND = [0.10, 0.17, 0.20];   // the cube's ground hemisphere: the pond as the drops see it, under a sunlit sky
const ADAPTATION = 0.75;       // how far the eye adapts to an hour's light (Light by the hour)
const DOWN_SUN_ELEVATION = 1;  // degrees: where the scene's dark sun stands while the true one is down
// The light on level ground under a clear sky (illuminance): the sun's, through
// SUN_DEPTH optical depths per air mass (Kasten and Young's), outside the
// atmosphere SUN_OUTSIDE; the sky's, SKY_LIGHT[0] + SKY_LIGHT[1]·sin(h)^0.6
// (lux), about 14 klx with the sun high and 0.8 klx at sunset; and once the
// sun is down, TWILIGHT, interpolated in the logarithm: the usual values at
// sunset and at the ends of civil, nautical and astronomical twilight. Each
// is good to perhaps a factor of two, and only their ratios to one another
// are used, softened by ADAPTATION.
const SUN_OUTSIDE = 127000;    // lux
const SUN_DEPTH = 0.2;         // a clear sky's optical depth for sunlight, per air mass
const SKY_LIGHT = [800, 15000];   // lux
const TWILIGHT = [[0, 800], [-6, 3.9], [-12, 0.009], [-18, 0.00075]];   // [sun's elevation (degrees), lux]

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/** The light on level ground (lux) under a clear, moonless sky with the true sun at `elevation` degrees. */
export function illuminance(elevation) {
  if (elevation >= 0) {
    const sine = Math.sin(THREE.MathUtils.degToRad(elevation));
    const airMass = 1 / (sine + 0.50572 * (elevation + 6.07995) ** -1.6364);
    return SUN_OUTSIDE * Math.exp(-SUN_DEPTH * airMass) * sine + SKY_LIGHT[0] + SKY_LIGHT[1] * sine ** 0.6;
  }
  for (let index = 1; index < TWILIGHT.length; index++) {
    const [upperElevation, upperLight] = TWILIGHT[index - 1];
    const [lowerElevation, lowerLight] = TWILIGHT[index];
    if (elevation >= lowerElevation) {
      const along = (upperElevation - elevation) / (upperElevation - lowerElevation);
      return upperLight * (lowerLight / upperLight) ** along;
    }
  }
  return TWILIGHT[TWILIGHT.length - 1][1];
}

/** What lights a panorama (sky-probe's light; a lone photograph's sun). */
const lightOf = (measurement) => measurement.light ?? 'sun';
/** The true sun's elevation at a panorama's hour (degrees). */
const hourElevation = (measurement) => measurement.solar?.elevation ?? measurement.sun.elevation;

const DOME_VERTEX = /* glsl */`
varying vec3 vDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vDirection = worldPosition.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  gl_Position.z = gl_Position.w;   // on the far plane: everything else is in front
}
`;

const DOME_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D uPanorama;
uniform float uMirror;         // 1, or -1 to flip the photo left for right
uniform float uRotation;       // radians added to the azimuth before the lookup
uniform float uScale;
uniform float uRadianceCap;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  float azimuth = atan(direction.z, direction.x * uMirror) + uRotation;
  vec2 panoramaUv = vec2(azimuth / (2.0 * PI) + 0.5, asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5);
  vec3 radiance = texture2D(uPanorama, panoramaUv).rgb * uScale;
  float brightest = max(radiance.r, max(radiance.g, radiance.b));
  radiance *= min(1.0, uRadianceCap / max(brightest, 1e-6));
  gl_FragColor = vec4(radiance, 1.0);
}
`;

const fetchMeasurement = (file) => fetch(new URL(`../assets/sky/${file}.json`, import.meta.url)).then((response) => {
  if (!response.ok) throw new Error(`sky measurements: HTTP ${response.status}`);
  return response.json();
});

/**
 * Build the environment and load its first sky.
 * @param renderer the WebGLRenderer
 * @param options.name a key of SKIES (others fall back to DEFAULT_SKY), and options.hour one of its hours (others fall back to its anchor)
 * @param options.sunAzimuth radians from straight ahead (−Z) toward the right (+X), unless the sky sets its own
 * @param options.sunBalance the scene's sun irradiance under BALANCE_SKY (RGB Vector3)
 * @param options.lighting its sunDirection, sunIrradiance and skyAmbient (Vector3s) are filled in place by every load
 * @returns {Promise<{ sky, cubeTexture, envTexture, name, hour, level, targets, panoramaBytes, load }>}
 */
export async function createEnvironment(renderer, { name, hour, sunAzimuth, sunBalance, lighting }) {
  const sky = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: {
        uPanorama: { value: null },
        uMirror: { value: 1 },
        uRotation: { value: 0 },
        uScale: { value: 1 },
        uRadianceCap: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.scale.setScalar(DOME_SIZE);
  sky.frustumCulled = false;
  sky.renderOrder = 1;   // after the opaque scene, so the depth test skips it under the water
  const domeUniforms = sky.material.uniforms;

  // Under the horizon the photo shows its own ground; for the cube, cover it
  // with a dark water-coloured hemisphere, as the pond would look from the drops.
  // Drawn after the dome (which is at the far plane), so no depth buffer is needed.
  // The capture draws its own mesh of the dome's geometry and material: the
  // dome itself belongs to the scene.
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(...GROUND), side: THREE.BackSide }),
  );
  ground.position.y = 0.3;
  ground.renderOrder = 2;
  const captureDome = new THREE.Mesh(sky.geometry, sky.material);
  captureDome.scale.setScalar(DOME_SIZE);
  captureDome.frustumCulled = false;
  captureDome.renderOrder = 1;
  const captureScene = new THREE.Scene();
  captureScene.add(captureDome, ground);
  const cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const prefilterSource = new THREE.WebGLCubeRenderTarget(PREFILTER_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const cubeCameras = [cubeTarget, prefilterSource].map((target) => {
    const cubeCamera = new THREE.CubeCamera(0.5, 50000, target);
    cubeCamera.position.set(0, 1.15, 0);
    return cubeCamera;
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  // Each measurement is fetched once: a place's hours all read its anchor's and its facing hour's.
  const measurements = new Map();
  const measurementOf = (file) => {
    if (!measurements.has(file)) measurements.set(file, fetchMeasurement(file).catch((error) => { measurements.delete(file); throw error; }));
    return measurements.get(file);
  };
  const balance = await measurementOf(SKIES[BALANCE_SKY].hours.afternoon.file);
  const balanceLuminance = luminance(sunBalance.toArray());

  const environment = { sky, cubeTexture: cubeTarget.texture, envTexture: null, name: null, hour: null, level: 1, targets: [], panoramaBytes: 0, load };

  /**
   * Load a sky (a key of SKIES; others fall back to DEFAULT_SKY) at one of
   * its hours (others fall back to its anchor) and make it the scene's, all
   * at once when it has arrived.
   */
  async function load(requestedPlace, requestedHour) {
    const skyName = Object.hasOwn(SKIES, requestedPlace ?? '') ? requestedPlace : DEFAULT_SKY;
    const place = SKIES[skyName];
    const firstHour = Object.keys(place.hours)[0];
    const anchorFile = place.hours[place.anchor ?? firstHour].file;
    const facingFile = place.hours[place.facing ?? firstHour].file;
    const hourName = resolveHour(skyName, requestedHour);
    const { file } = place.hours[hourName];
    const [measurement, anchor, facing, panorama] = await Promise.all([
      measurementOf(file),
      measurementOf(anchorFile),
      measurementOf(facingFile),
      new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync(new URL(`../assets/sky/${file}_2k.hdr`, import.meta.url).href),
    ]);
    panorama.wrapS = THREE.RepeatWrapping;   // the azimuth wraps; no seam at u = 0
    const panoramaBytes = panorama.image.data.byteLength;
    panorama.onUpdate = () => { panorama.image.data = null; };   // on the GPU now: free the CPU copy

    // The turn: the facing hour's sun at the scene's azimuth, every other
    // hour by the same turn and its north's difference (Orientation).
    const mirror = place.mirrored ? -1 : 1;
    const azimuth = place.sunAzimuth === undefined ? sunAzimuth : THREE.MathUtils.degToRad(place.sunAzimuth);
    const facingElevation = THREE.MathUtils.degToRad(facing.sun.elevation);
    const facingSun = new THREE.Vector3(Math.cos(facingElevation) * Math.sin(azimuth), Math.sin(facingElevation), -Math.cos(facingElevation) * Math.cos(azimuth));
    const [facingSunX, , facingSunZ] = facing.sun.direction;
    const facingRotation = Math.atan2(facingSunZ, facingSunX) - Math.atan2(facingSun.z, facingSun.x * mirror);
    const rotation = file === facingFile ? facingRotation : facingRotation + THREE.MathUtils.degToRad(measurement.north - facing.north);
    // The sun: the photo's, or where the true one is when it is down, at
    // DOWN_SUN_ELEVATION; the file's direction turned into the scene's.
    const sunlit = lightOf(measurement) === 'sun';
    if (file === facingFile) lighting.sunDirection.copy(facingSun);
    else {
      const fileAzimuth = sunlit ? Math.atan2(measurement.sun.direction[2], measurement.sun.direction[0]) : THREE.MathUtils.degToRad(measurement.north + measurement.solar.azimuth) - Math.PI;
      const elevation = THREE.MathUtils.degToRad(sunlit ? measurement.sun.elevation : Math.max(measurement.solar.elevation, DOWN_SUN_ELEVATION));
      const sceneAzimuth = fileAzimuth - rotation;
      lighting.sunDirection.set(mirror * Math.cos(sceneAzimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(sceneAzimuth) * Math.cos(elevation));
    }

    // The brightness: the anchor's as a single photograph's, the hour's
    // light against the anchor's (Light by the hour).
    const anchorScale = (balanceLuminance / luminance(anchor.sunIrradiance)) * SKY_EXPOSURE;
    const level = file === anchorFile ? 1 : (illuminance(hourElevation(measurement)) / illuminance(hourElevation(anchor))) ** (1 - ADAPTATION);
    const scale = anchorScale * level;
    if (sunlit) {
      const sunColour = new THREE.Vector3().fromArray(measurement.sunIrradiance).divide(new THREE.Vector3().fromArray(balance.sunIrradiance)).multiply(sunBalance);
      const sunLuminance = balanceLuminance * (scale / anchorScale) * (luminance(measurement.sunIrradiance) / luminance(anchor.sunIrradiance));
      lighting.sunIrradiance.copy(sunColour.multiplyScalar(sunLuminance / luminance(sunColour.toArray())));
    } else {
      lighting.sunIrradiance.set(0, 0, 0);
    }
    lighting.skyAmbient.fromArray(measurement.skyRadiance).multiplyScalar(scale);
    ground.material.color.setRGB(GROUND[0] * level, GROUND[1] * level, GROUND[2] * level);

    const previous = domeUniforms.uPanorama.value;
    domeUniforms.uPanorama.value = panorama;
    domeUniforms.uMirror.value = mirror;
    domeUniforms.uRotation.value = rotation;
    domeUniforms.uScale.value = scale;
    domeUniforms.uRadianceCap.value = RADIANCE_CAP * luminance(lighting.skyAmbient.toArray());

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    for (const cubeCamera of cubeCameras) cubeCamera.update(renderer, captureScene);
    renderer.autoClear = previousAutoClear;
    envTarget = pmrem.fromCubemap(prefilterSource.texture, envTarget);
    previous?.dispose();

    Object.assign(environment, { envTexture: envTarget.texture, name: skyName, hour: hourName, level, targets: [cubeTarget, prefilterSource, envTarget], panoramaBytes });
    return skyName;
  }

  await load(name, hour);
  return environment;
}
