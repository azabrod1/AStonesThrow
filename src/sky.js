// The sky: a photographed panorama on a dome, and the environment maps
// derived from it.
//
// The sky is an equirectangular HDRI from Poly Haven (CC0) in assets/sky/,
// drawn on a dome (a large box on layer 1, so the mirror pass sees it) at the
// far plane. Its measurements, in assets/sky/<name>.json, come from
// tools/sky-probe.mjs: the sun's direction in the file's frame, its
// irradiance, and the sky's mean radiance. SKIES lists the panoramas and how
// each is turned; ?sky=<name> on the page picks one, DEFAULT_SKY otherwise.
//
// Orientation. The dome samples the panorama by direction as Three.js's
// equirect lookup does (equirectUv: u = atan(z, x)/2π + ½), with the x of the
// direction negated first when the entry is `mirrored` (the photo flipped left
// for right, to put better scenery in front), then turned about the vertical
// by the angle that puts the photo's sun at `sunAzimuth`, the scene's choice.
// The sun's elevation is the photo's; sunDirection is built from the two.
//
// Brightness. The scene's sun irradiance is fixed (lighting.sunIrradiance);
// the dome is scaled by the ratio of its luminance to the photo's measured
// sun irradiance, so the photo's own ratio of sky to sun carries over, times
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
// its hue). The sun is never in the home view's direct sight, so the cap
// only touches the mirror image and the cube.
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

// The orientation was chosen from home-view frames. Meadow 2 mirrored puts
// tall trees on the left with sky between the crowns; as photographed the
// whole view ahead is a wall of foliage. Each entry costs about 6 MB, so one
// panorama ships; ?sky=<name> is for comparing candidates before choosing.
const SKIES = {
  meadow_2: { mirrored: true },
};
const DEFAULT_SKY = 'meadow_2';
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

/**
 * Load the sky and build the environment maps.
 * @param renderer the WebGLRenderer
 * @param options.name a key of SKIES (others fall back to DEFAULT_SKY)
 * @param options.sunAzimuth radians from straight ahead (−Z) toward the right (+X)
 * @param options.sunIrradiance the scene's sun irradiance (RGB Vector3) the dome is scaled to
 * @returns {Promise<{ sky, cubeTexture, envTexture, sunDirection, skyAmbient, name, targets, panoramaBytes }>}
 */
export async function createEnvironment(renderer, { name, sunAzimuth, sunIrradiance }) {
  const skyName = SKIES[name] ? name : DEFAULT_SKY;
  const { mirrored } = SKIES[skyName];
  const [measurement, panorama] = await Promise.all([
    fetch(new URL(`../assets/sky/${skyName}.json`, import.meta.url)).then((response) => {
      if (!response.ok) throw new Error(`sky measurements: HTTP ${response.status}`);
      return response.json();
    }),
    new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync(new URL(`../assets/sky/${skyName}_2k.hdr`, import.meta.url).href),
  ]);
  panorama.wrapS = THREE.RepeatWrapping;   // the azimuth wraps; no seam at u = 0
  const panoramaBytes = panorama.image.data.byteLength;
  panorama.onUpdate = () => { panorama.image.data = null; };   // on the GPU now: free the CPU copy

  const elevation = THREE.MathUtils.degToRad(measurement.sun.elevation);
  const sunDirection = new THREE.Vector3(Math.cos(elevation) * Math.sin(sunAzimuth), Math.sin(elevation), -Math.cos(elevation) * Math.cos(sunAzimuth));
  const mirror = mirrored ? -1 : 1;
  const [fileSunX, , fileSunZ] = measurement.sun.direction;
  const rotation = Math.atan2(fileSunZ, fileSunX) - Math.atan2(sunDirection.z, sunDirection.x * mirror);
  const scale = (luminance(sunIrradiance.toArray()) / luminance(measurement.sunIrradiance)) * SKY_EXPOSURE;
  const skyAmbient = new THREE.Vector3().fromArray(measurement.skyRadiance).multiplyScalar(scale);

  const sky = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: {
        uPanorama: { value: panorama },
        uMirror: { value: mirror },
        uRotation: { value: rotation },
        uScale: { value: scale },
        uRadianceCap: { value: RADIANCE_CAP * luminance(skyAmbient.toArray()) },
      },
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.scale.setScalar(DOME_SIZE);
  sky.frustumCulled = false;
  sky.renderOrder = 1;   // after the opaque scene, so the depth test skips it under the water

  // Under the horizon the photo shows its own ground; for the cube, cover it
  // with a dark water-coloured hemisphere, as the pond would look from the drops.
  // Drawn after the dome (which is at the far plane), so no depth buffer is needed.
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.10, 0.17, 0.20), side: THREE.BackSide }),
  );
  ground.position.y = 0.3;
  ground.renderOrder = 2;

  const captureScene = new THREE.Scene();
  captureScene.add(sky, ground);
  const capture = (size, mipmaps) => {
    const target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: mipmaps, minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    const cubeCamera = new THREE.CubeCamera(0.5, 50000, target);
    cubeCamera.position.set(0, 1.15, 0);
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    cubeCamera.update(renderer, captureScene);
    renderer.autoClear = previousAutoClear;
    return target;
  };
  const cubeTarget = capture(CUBE_SIZE, true);
  const prefilterSource = capture(PREFILTER_SIZE, false);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromCubemap(prefilterSource.texture);
  pmrem.dispose();
  prefilterSource.dispose();
  captureScene.remove(sky, ground);
  ground.geometry.dispose();
  ground.material.dispose();

  return { sky, cubeTexture: cubeTarget.texture, envTexture: envTarget.texture, sunDirection, skyAmbient, name: skyName, targets: [cubeTarget, envTarget], panoramaBytes };
}
