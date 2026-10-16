// The sky: a photographed panorama on a dome, and the environment maps
// derived from it.
//
// The sky is an equirectangular HDRI from Poly Haven (CC0) in assets/sky/,
// drawn on a dome (a large box on layer 1, so the mirror pass sees it) at the
// far plane. Its measurements, in assets/sky/<name>.json, come from
// tools/sky-probe.mjs: the sun's direction in the file's frame, its
// irradiance, and the sky's mean radiance. SKIES lists the panoramas (the
// Sky setting's choices, src/main.js) and how each is turned; the
// environment loads one to start and another whenever load() is called
// (Switching, below).
//
// Orientation. The dome samples the panorama by direction as Three.js's
// equirect lookup does (equirectUv: u = atan(z, x)/2π + ½), with the x of the
// direction negated first when the entry is `mirrored` (the photo flipped left
// for right, to put better scenery in front), then turned about the vertical
// by the angle that puts the photo's sun at `sunAzimuth`, the scene's choice.
// The sun's elevation is the photo's; sunDirection is built from the two.
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
// its hue). Only the sunrise's sun is in the home view's direct sight, where
// the cap leaves the photo's white disc and its starburst; the others' only
// in the mirror image and the cube.
//
// Switching. load(name) fetches the photo and its measurements, then in one
// frame swaps the dome's texture and uniforms, fills lighting's sun and sky
// vectors in place, captures the cube and the prefiltered map again into the
// same targets (every material holding them keeps them) and frees the old
// photo. Nothing new is compiled: the dome, the capture's ground and the
// PMREM generator live as long as the environment. Until the photo has
// arrived the old sky stays, whole.
//
// The panorama and a water-coloured hemisphere below the horizon (the photo's
// own ground there would light drops and stones green from below) are
// rendered once into a cube map that the droplets reflect, and a prefiltered
// copy lights the stones.
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
// way round. The open sky (clouds only) looks alike either way. Each
// panorama is about 6 MB, fetched only when chosen.
const SKIES = {
  meadow: { file: 'meadow_2', mirrored: true },
  lakeside: { file: 'lakeside', mirrored: false },
  sunrise: { file: 'lakeside_sunrise', mirrored: false },
  alpine: { file: 'lago_disola', mirrored: true },
  open: { file: 'kloofendal_48d_partly_cloudy_puresky', mirrored: false },
};
export const SKY_NAMES = Object.keys(SKIES);
export const DEFAULT_SKY = 'meadow';
const BALANCE_SKY = 'meadow';    // the sky the scene's sun colour (sunBalance) was chosen under
const SKY_EXPOSURE = Math.PI;   // see Brightness above
const RADIANCE_CAP = 30;       // times the mean sky radiance
const DOME_SIZE = 20000;       // metres, edge of the box
const CUBE_SIZE = 512;         // the droplets' cube, per face
const PREFILTER_SIZE = 128;    // the capture the stones' prefiltered map is made from, per face

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

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
 * @param options.name a key of SKIES (others fall back to DEFAULT_SKY)
 * @param options.sunAzimuth radians from straight ahead (−Z) toward the right (+X), unless the sky sets its own
 * @param options.sunBalance the scene's sun irradiance under BALANCE_SKY (RGB Vector3)
 * @param options.lighting its sunDirection, sunIrradiance and skyAmbient (Vector3s) are filled in place by every load
 * @returns {Promise<{ sky, cubeTexture, envTexture, name, targets, panoramaBytes, load }>}
 */
export async function createEnvironment(renderer, { name, sunAzimuth, sunBalance, lighting }) {
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
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.10, 0.17, 0.20), side: THREE.BackSide }),
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
  const balance = await fetchMeasurement(SKIES[BALANCE_SKY].file);
  const balanceLuminance = luminance(sunBalance.toArray());

  const environment = { sky, cubeTexture: cubeTarget.texture, envTexture: null, name: null, targets: [], panoramaBytes: 0, load };

  /** Load a sky (a key of SKIES; others fall back to DEFAULT_SKY) and make it the scene's, all at once when it has arrived. */
  async function load(requested) {
    const skyName = Object.hasOwn(SKIES, requested ?? '') ? requested : DEFAULT_SKY;
    const { file, mirrored } = SKIES[skyName];
    const [measurement, panorama] = await Promise.all([
      fetchMeasurement(file),
      new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync(new URL(`../assets/sky/${file}_2k.hdr`, import.meta.url).href),
    ]);
    panorama.wrapS = THREE.RepeatWrapping;   // the azimuth wraps; no seam at u = 0
    const panoramaBytes = panorama.image.data.byteLength;
    panorama.onUpdate = () => { panorama.image.data = null; };   // on the GPU now: free the CPU copy

    const azimuth = SKIES[skyName].sunAzimuth === undefined ? sunAzimuth : THREE.MathUtils.degToRad(SKIES[skyName].sunAzimuth);
    const elevation = THREE.MathUtils.degToRad(measurement.sun.elevation);
    const sunDirection = lighting.sunDirection.set(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), -Math.cos(elevation) * Math.cos(azimuth));
    const sunColour = new THREE.Vector3().fromArray(measurement.sunIrradiance).divide(new THREE.Vector3().fromArray(balance.sunIrradiance)).multiply(sunBalance);
    lighting.sunIrradiance.copy(sunColour.multiplyScalar(balanceLuminance / luminance(sunColour.toArray())));
    const mirror = mirrored ? -1 : 1;
    const [fileSunX, , fileSunZ] = measurement.sun.direction;
    const scale = (balanceLuminance / luminance(measurement.sunIrradiance)) * SKY_EXPOSURE;
    lighting.skyAmbient.fromArray(measurement.skyRadiance).multiplyScalar(scale);

    const previous = domeUniforms.uPanorama.value;
    domeUniforms.uPanorama.value = panorama;
    domeUniforms.uMirror.value = mirror;
    domeUniforms.uRotation.value = Math.atan2(fileSunZ, fileSunX) - Math.atan2(sunDirection.z, sunDirection.x * mirror);
    domeUniforms.uScale.value = scale;
    domeUniforms.uRadianceCap.value = RADIANCE_CAP * luminance(lighting.skyAmbient.toArray());

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    for (const cubeCamera of cubeCameras) cubeCamera.update(renderer, captureScene);
    renderer.autoClear = previousAutoClear;
    envTarget = pmrem.fromCubemap(prefilterSource.texture, envTarget);
    previous?.dispose();

    Object.assign(environment, { envTexture: envTarget.texture, name: skyName, targets: [cubeTarget, prefilterSource, envTarget], panoramaBytes });
    return skyName;
  }

  await load(name);
  return environment;
}
