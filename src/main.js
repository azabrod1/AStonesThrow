// Stone Pond: throw stones into water and watch the splash.
//
// Frame pipeline:
//   1. advance the stones, droplets and bubbles (CPU), feeding the water;
//   2. step the spectral water surface (GPU) and its foam, unless it sleeps
//      (Low power, below);
//   3. evaluate the ambient wind waves at the frame's time (GPU, once per
//      rendered frame; src/ambientWaves.js), the profiles of the rings that
//      cross the pond (GPU, while any lives; src/rings.js) and the splash's
//      sheets and columns (CPU);
//   4. while a splash lives, draw it into the water's mirror image (below);
//   5. render what is under the surface (floor, submerged stones, bubbles)
//      to a texture with depth, the stones and bubbles where the still
//      surface shows them (src/rock.js);
//   6. render the main scene (sky dome, water surface refracting pass 5 and
//      reflecting the mirror image, the stones' cavities in it
//      (src/cavity.js), foam specks riding the surface, stones above the
//      surface) to an HDR texture with depth;
//   7. draw the splash's water over it and tone-map to the canvas; with no
//      water in the air, only the tone map (src/splash.js).
// All simulation runs in world seconds scaled by the slow-motion factor.
//
// The camera never moves: the planar reflection and the throwing hand assume
// its position. The view zooms by narrowing the field of view (from the home
// 48° landscape or 62° portrait down to 8°) and turning the camera, horizon
// level, so that what is under the pointer stays there (src/viewZoom.js): the
// mouse wheel by 0.9 per notch, a two-finger pinch with the inverse of the
// change in finger spacing, while the fingers' midpoint holds on to what was
// under it. A zoomed view stays inside the home view, so zooming all the way
// out returns to it; Escape and the Reset view button go straight back. The
// mirror image of the sky is re-rendered at the next frame whenever the view
// has changed, and while a splash lives it is drawn over where the splash's
// own mirror image falls, each frame (updateReflection). A tap throws at the
// water under it, brought inside the solver's patch less POND_MARGIN when it
// is beyond (or on the sky): a splash nearer the patch's edge would ring
// across it, since the patch is periodic. While a press aims (or a mouse
// hovers) a ring on the water and a faint arc from the hand show the throw;
// a throw hides them, a mouse's until it moves on, or the arc's end would
// hang in the splash as a hairline.
//
// Quality. Each preset of QUALITY sets the work a frame does: the splash
// solver's grid, the inner water patch's mesh (src/waterSurface.js), the
// resolution of the under-water pass and of the mirror image (underScale of
// the canvas's), the splash's fluid buffers (fluidScale), the cap on device
// pixels per CSS pixel, and the frame rate of a pond where nothing happens;
// never a target's format (QUALITY says why). Whatever the preset, the canvas holds at
// most PIXEL_BUDGET device pixels (the pixel ratio is lowered to fit).
// applyQuality rebuilds whatever the preset changes: the solver (which keeps
// its waves, src/spectralWater.js), the mesh, every target.
// window.__pond.budget reports what is built, with an estimate of the GPU
// memory the render targets hold.
//
// Low power. A pond where nothing happens does as little as it can. The
// solver sleeps (no passes at all) once its last splat or foam stamp is
// SLEEP_SECONDS of simulated time behind and nothing of the splash is left
// (src/spectralWater.js derives the time from its damping); the composite is
// a plain tone map while no water is in the air; and on a preset with an
// idleFrameRate, once nothing has moved, been touched or zoomed for
// IDLE.quietSeconds, frames come at most that often (every other
// requestAnimationFrame on a 60 Hz display), the simulated time still
// advancing by the real time between them.
//
// Starting is asynchronous: the sky is a photographed panorama
// (src/sky.js) that has to load before anything is built, because the sun's
// elevation is the photo's. Before the pond reports ready, under the page's
// loading veil, warmUp throws a stone and draws its flight and splash at a
// few moments, so that every GPU program a throw needs (the stone's, the
// splash's passes, the mirror's, the cavity's, the composite's, the specks')
// is compiled then rather than at the first throw, then clears it all away:
// the pond starts still, at time zero. The settings (the page's panel)
// each have their own localStorage key, and the page's parameters win over
// them: ?sky=<name> picks the panorama (src/sky.js; setSky loads another
// later, in place: the sun follows, and the mirror image is drawn again);
// ?water=clear|pond|murky the water's clarity (WATER_CLARITIES; setClarity);
// ?wind=x,z sets the direction the wind blows toward in world XZ
// (DEFAULT_WIND otherwise); ?windStrength=calm|breeze|windy the wind's
// strength (WIND_STRENGTHS in src/ambientWaves.js; setWind); each otherwise
// the one last chosen on this device, or meadow, pond and calm; ?paused=1
// starts with the clock stopped
// (resume() starts it); ?quality=high|medium|low fixes a preset (QUALITY),
// otherwise the quality calibrates itself from the frame rate (CALIBRATION),
// keeps watching it, and reports each change through onQualityChange.
// ?profile=1 runs the profiling steps of src/profiler.js and reports through
// onProfile.
import * as THREE from 'three';
import { SpectralWater } from './spectralWater.js';
import { AmbientWaves, DEFAULT_WIND, WIND_STRENGTHS } from './ambientWaves.js';
import { Rings } from './rings.js';
import { createEnvironment, SKY_NAMES } from './sky.js';
import { createWaterSurface } from './waterSurface.js';
import { createPondFloor, setPatternMipmaps } from './pondFloor.js';
import { Rock } from './rock.js';
import { SplashSystem, MIRROR_LAYER } from './splash.js';
import { createFloatTarget, FullscreenPass, configureFloatSupport, renderTargetBytes } from './gpu.js';
import { viewFacing, directionAt, placeDirection, clampToFrame, zoomToward, isZoomed } from './viewZoom.js';
import { Profiler } from './profiler.js';

// Quality presets. The splash lives in a few dozen pixels, so the fluid
// buffer's resolution is what it is made of: a drop narrower than a buffer
// pixel is widened to one, so at half resolution on a 1× canvas every fleck
// of spray became a 4-pixel square.
//   grid          the splash solver's cells per side (6 m): 512 resolves 2.3 cm
//                 ripples, 256 4.7 cm ones;
//   meshSegments  the inner water patch's quads per side (it only carries the
//                 displacement; the shading's normals come from the textures);
//   underScale    the under-water pass's and the mirror image's resolution, of
//                 the canvas's (both are seen through ripples);
//   fluidScale    the splash's fluid buffers', of the canvas's;
//   idleFrameRate the frame rate of a pond where nothing happens (0: every frame);
//   maxDpr        the cap on device pixels per CSS pixel;
//   rings         the stones' rings drawn at once (src/rings.js): a newer one
//                 makes the faintest fade out. Each costs every water pixel
//                 its waves cover a lookup, and a pass a frame.
// Every target keeps its format on every preset, so a program drawn under the
// loading veil (warmUp) meets no new pipeline state after a change of preset;
// and every mesh takes 16-bit indices (at most 254 segments: Three.js keeps
// the index 65535 for primitive restart).
export const QUALITY = {
  high: { grid: 512, meshSegments: 254, underScale: 1.0, fluidScale: 1.0, idleFrameRate: 0, maxDpr: 2.0, rings: 10 },
  medium: { grid: 256, meshSegments: 160, underScale: 0.5, fluidScale: 0.5, idleFrameRate: 30, maxDpr: 2.0, rings: 8 },
  low: { grid: 256, meshSegments: 128, underScale: 0.5, fluidScale: 0.5, idleFrameRate: 30, maxDpr: 1.5, rings: 6 },
};
export const PIXEL_BUDGET = 2.6e6;   // device pixels in the canvas, on every preset
const QUALITY_ORDER = ['high', 'medium', 'low'];
// Automatic quality starts every device on high and steps down from what it
// measures, never from what the device looks like: the frame rate of the idle
// pond after warm-up, then of the first splash (the fluid passes run only
// while drops are in the air, so the idle rate overestimates). From the idle
// measurement on it keeps watching: a frame rate below sustainedMinimumFps
// over sustainedSeconds of frames drawn one per requestAnimationFrame steps
// down once more. It never steps up.
const CALIBRATION = {
  warmUpFrames: 30,          // the first mip chains and caches
  windowFrames: 60,          // frames averaged for one measurement
  fewestFrames: 20,          // a splash that ends sooner is measured on what it gave
  idleMinimumFps: 50,        // idle below this: one step down; below splashMinimumFps: two
  splashMinimumFps: 30,      // the first splash below this: one step down
  sustainedMinimumFps: 25,   // later, this or less...
  sustainedSeconds: 3,       // ...over this long: one step down
  settleSeconds: 2,          // nothing is judged this long after a change of preset
  stallSeconds: 0.5,         // a longer interval is a stall (a hidden tab, a rebuild), not a frame rate
};
const IDLE = {
  quietSeconds: 1,           // nothing moving, touched or zoomed for this long...
  tolerance: 0.004,          // ...and frames come at the preset's idleFrameRate, this many seconds early at most
};
const POWER = { soft: 1.3, normal: 1.0, hard: 0.72 };   // flight-time multipliers
const POND_DEPTH = 0.8;
const POND_MARGIN = 0.4;      // metres inside the solver's patch that a tap's throw keeps to
const MAX_ROCKS = 10;
const MIN_FOV = 8;            // degrees: the narrowest zoom
const WHEEL_STEP = 0.9;       // field of view factor per wheel notch
const HOME_TARGET = [0, 0.12, -1.0];
const SUN_AZIMUTH = Math.atan2(0.42, 0.78);   // radians right of straight ahead (−Z), about 28°
const DEBUG_MODES = { under: 0, height: 1, foam: 2, env: 3, face: 4, ambient: 5 };   // setDebugView names
const DEFAULT_WIND_STRENGTH = 'calm';
const WIND_STORAGE_KEY = 'stone-pond-wind';   // the Wind setting's last choice on this device
const WATER_STORAGE_KEY = 'stone-pond-water'; // the Water setting's
const SKY_STORAGE_KEY = 'stone-pond-sky';     // the Sky setting's
const SUN_BALANCE = [3.0, 2.85, 2.55];        // the sun's irradiance under the meadow sky; another sky's has its photo's colour (src/sky.js)
// The water's clarity (the Water setting): its extinction, per metre, and
// the radiance of water too deep to see through (lighting below;
// WATER_FRAGMENT in src/shaders/scene.js). Pond, the default, is about as
// clear as a clean pond's: the sand shows near the bank and is gone about
// 9 m out, so a ring's light on the sand fades out by where a stone lands.
// Clear is a spring's, the pond as it was before (absorption alone, 0.36
// per metre in green, and the same colour): the sand shows far out, with
// each ring's light rings on it. Murky is a lake after rain: the sand shows
// only at the bank.
const WATER_CLARITIES = {
  clear: { extinction: [1.0, 0.4, 0.4], color: [0.010, 0.046, 0.040] },
  pond: { extinction: [2.0, 1.45, 1.65], color: [0.015, 0.074, 0.041] },
  murky: { extinction: [3.0, 2.4, 2.7], color: [0.022, 0.082, 0.040] },
};
const DEFAULT_WATER = 'pond';
// The warm-up's throw (the reference stone, aimed as the profiler's) and the
// moments after its impact it draws: the crown, the fan, the cavity, spray
// and the mirror; the jet column; the specks and the drops' landing crowns.
const WARM_UP = { x: 0, z: -1.4, radius: 0.03, moments: [0.02, 0.16, 0.4] };

export async function startPond({ canvas, quality = 'auto', onReady, onError, onStats, onViewChange, onQualityChange, onProfile }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (error) {
    onError?.('WebGL 2 is not available in this browser.');
    throw error;
  }
  // ?floats=half takes the half-float path that devices without
  // EXT_color_buffer_float get, to test it on any machine.
  const pageParameters = new URLSearchParams(window.location.search);
  const forceHalfFloat = pageParameters.get('floats') === 'half';
  configureFloatSupport(renderer, { forceHalfFloat });
  // EXT_color_buffer_float also makes half floats renderable, so either will do.
  const renderableFloats = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  if (!renderer.capabilities.isWebGL2 || !renderableFloats) {
    onError?.('This browser cannot render to floating-point textures, which the water needs.');
    throw new Error('floating-point render targets missing');
  }
  renderer.localClippingEnabled = true;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  // A frame is many render() calls: render() resets the counts once per frame, so they are the frame's.
  renderer.info.autoReset = false;

  // Lighting shared by every shader. Values are linear radiance in arbitrary
  // units chosen so that a sunlit pond tone-maps well at the given exposure.
  // The sun's direction and the sky's ambient radiance come from the sky
  // panorama; shaders hold these vectors by reference, so they are filled in
  // place, never replaced; so is the sun's irradiance, which the sky sets
  // too (src/sky.js). The water (WATER_FRAGMENT in src/shaders/scene.js says
  // how): absorb, per metre, dims the light going down to the floor and
  // through the splash's thin water; extinction, per metre, absorption plus
  // scattering, dims the floor seen through the water, which fades into
  // waterColor, the radiance of water too deep to see through. The Water
  // setting sets those two (WATER_CLARITIES).
  const lighting = {
    sunDirection: new THREE.Vector3(),
    sunIrradiance: new THREE.Vector3(),
    skyAmbient: new THREE.Vector3(),
    absorb: new THREE.Vector3(0.95, 0.36, 0.34),
    extinction: new THREE.Vector3(),
    waterColor: new THREE.Vector3(),
    exposure: 0.55,
  };
  const storedChoice = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };

  let environment;
  try {
    environment = await createEnvironment(renderer, { name: pageParameters.get('sky') ?? storedChoice(SKY_STORAGE_KEY), sunAzimuth: SUN_AZIMUTH, sunBalance: new THREE.Vector3(...SUN_BALANCE), lighting });
  } catch (error) {
    onError?.('The sky could not be loaded. Check the connection and reload the page.');
    throw error;
  }
  const sunDirection = lighting.sunDirection;

  const profiling = pageParameters.get('profile') === '1';
  let automaticQuality = !profiling && (quality === 'auto' || !QUALITY[quality]);
  let qualityName = automaticQuality ? 'high' : QUALITY[quality] ? quality : 'medium';
  let settings = QUALITY[qualityName];
  // Parts of the frame the profiler switches off (src/profiler.js); all on otherwise.
  const skip = { floor: false, surface: false, solver: false, ambient: false, fluid: false, mirror: false, cavity: false, halfDensity: false, sleep: false };

  const water = new SpectralWater(renderer, { size: settings.grid, domainSize: 6, centre: [0, -1.0], depth: POND_DEPTH });
  const windParameter = pageParameters.get('wind')?.split(',').map(Number);
  const windDirection = windParameter?.length === 2 && windParameter.every(Number.isFinite) && Math.hypot(...windParameter) > 0 ? windParameter : DEFAULT_WIND;
  const ambientWaves = new AmbientWaves(renderer, { windDirection, depth: POND_DEPTH });
  // The rings that cross the whole pond: the splash hands them its ring
  // sources through the solver it is given (water.rings), and the surface,
  // the floor and the foam specks draw them.
  const rings = new Rings(renderer, { depth: POND_DEPTH });
  rings.setLiveLimit(settings.rings);
  water.rings = rings;
  const surface = createWaterSurface(water, lighting, ambientWaves, { meshSegments: settings.meshSegments, rings });
  const splash = new SplashSystem({ environment, lighting, water, ambientWaves, surface });
  // The wind's strength: the page's ?windStrength, else the last choice here, else calm.
  const storedWind = storedChoice(WIND_STORAGE_KEY);
  const requestedWind = pageParameters.get('windStrength');
  let windName = Object.hasOwn(WIND_STRENGTHS, requestedWind ?? '') ? requestedWind : Object.hasOwn(WIND_STRENGTHS, storedWind ?? '') ? storedWind : DEFAULT_WIND_STRENGTH;
  function applyWind(name) {
    windName = name;
    ambientWaves.setStrength(WIND_STRENGTHS[name]);
    water.setWindStrength(WIND_STRENGTHS[name]);
  }
  applyWind(windName);
  // The water's clarity: the page's ?water, else the last choice here, else pond.
  const storedWater = storedChoice(WATER_STORAGE_KEY);
  const requestedWater = pageParameters.get('water');
  let waterName = Object.hasOwn(WATER_CLARITIES, requestedWater ?? '') ? requestedWater : Object.hasOwn(WATER_CLARITIES, storedWater ?? '') ? storedWater : DEFAULT_WATER;
  function applyWater(name) {
    waterName = name;
    lighting.extinction.fromArray(WATER_CLARITIES[name].extinction);
    lighting.waterColor.fromArray(WATER_CLARITIES[name].color);
  }
  applyWater(waterName);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 60000);
  camera.position.set(0, 1.15, 2.45);
  // The floor's pattern is baked once, laid out in perspective from the camera's eye (src/pondFloor.js).
  const floor = createPondFloor(water, lighting, ambientWaves, { renderer, eye: camera.position, rings });
  const floorPattern = floor.material.uniforms.uPattern.value;   // RGBA8, with its mip chain
  const floorPatternBytes = Math.round(floorPattern.image.width * floorPattern.image.height * 4 * (floorPattern.generateMipmaps ? 4 / 3 : 1));
  // The view: home is the framing the page opens with; view is the current one.
  const home = { ...viewFacing(HOME_TARGET[0] - camera.position.x, HOME_TARGET[1] - camera.position.y, HOME_TARGET[2] - camera.position.z), fov: 48 };
  const view = { ...home };

  // The sun's lights for the stones: its irradiance above the water, and
  // below it what crosses the water column (absorbed over the path the
  // floor's sunlight takes, FLOOR_VERTEX). The sky sets both (applySky).
  const sun = new THREE.DirectionalLight(new THREE.Color(), 1.0);
  const sunUnder = new THREE.DirectionalLight(new THREE.Color(), 1.0);
  function applySunLights() {
    sun.position.copy(sunDirection).multiplyScalar(50);
    sun.color.setRGB(lighting.sunIrradiance.x, lighting.sunIrradiance.y, lighting.sunIrradiance.z);
    sunUnder.position.copy(sun.position);
    const sunPath = POND_DEPTH / Math.max(sunDirection.y, 0.2);
    sunUnder.color.copy(sun.color).multiply(new THREE.Color(Math.exp(-lighting.absorb.x * sunPath), Math.exp(-lighting.absorb.y * sunPath), Math.exp(-lighting.absorb.z * sunPath)));
  }
  applySunLights();

  const sceneUnder = new THREE.Scene();
  sceneUnder.add(floor, splash.bubblePoints, sunUnder);
  const sceneMain = new THREE.Scene();
  sceneMain.add(environment.sky, surface.inner, surface.outer, splash.cavityGroup, splash.foamSpecks.points, sun);
  // MIRROR_LAYER holds what the water mirrors: the sky dome, far shore
  // included, and while a splash lives its crowns, columns and drops. The
  // cavities are not on it: a hole lies below the mirror plane, so the water
  // reflects none of it (its lip stands a centimetre at most above the water).
  environment.sky.layers.enable(MIRROR_LAYER);
  sceneMain.environment = environment.envTexture;
  sceneUnder.environment = environment.envTexture;

  // Aim marker: a ring on the water and a faint arc from the hand.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.004;
  marker.visible = false;
  const arcPoints = new Float32Array(25 * 3);
  const arcGeometry = new THREE.BufferGeometry();
  arcGeometry.setAttribute('position', new THREE.BufferAttribute(arcPoints, 3).setUsage(THREE.DynamicDrawUsage));
  const arc = new THREE.Line(arcGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  arc.visible = false;
  arc.frustumCulled = false;
  sceneMain.add(marker, arc);

  // Debug views for development: show the under-water pass, the height
  // field, the foam, the environment cube or the ambient waves' height tile.
  let debugView = 'none';
  const debugPass = new FullscreenPass(`
    uniform sampler2D uTexture; uniform samplerCube uCube; uniform float uMode; varying vec2 vUv;
    void main() {
      if (uMode > 4.5) { gl_FragColor = vec4(vec3(clamp(0.5 + texture2D(uTexture, vUv).r * 0.1, 0.0, 1.0)), 1.0); return; }   // ambient: millimetres
      if (uMode > 3.5) {
        // One cube face (-Z), base mip level, horizon band magnified 4x vertically.
        vec3 dir = vec3((vUv.x - 0.5) * 2.0, (vUv.y - 0.5) * 0.5, -1.0);
        gl_FragColor = vec4(pow(clamp(textureCubeLodEXT(uCube, dir, 0.0).rgb * 0.8, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return;
      }
      if (uMode > 2.5) {
        float lon = (vUv.x - 0.5) * 6.2831853; float lat = (vUv.y - 0.5) * 3.1415926;
        vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
        gl_FragColor = vec4(pow(clamp(textureCube(uCube, dir).rgb * 0.8, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return;
      }
      vec4 t = texture2D(uTexture, vUv);
      if (uMode < 0.5) { gl_FragColor = vec4(pow(clamp(t.rgb * 0.8, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return; }
      if (uMode < 1.5) { float h = t.r * 40.0; gl_FragColor = vec4(0.5 + h, 0.5 + h, 0.5 + h * 0.5 + abs(t.g) * 2.0, 1.0); return; }
      gl_FragColor = vec4(vec3(t.r), 1.0);
    }`, { uTexture: { value: null }, uCube: { value: environment.cubeTexture }, uMode: { value: 0 } });
  let underTarget = null;
  let mainTarget = null;
  let reflectionTarget = null;

  // The camera never moves, so the mirror image of the sky is rendered whole
  // only when the view changes (a resize or a zoom), through a camera
  // reflected in the water plane (the same construction as Three.js's
  // Reflector), then sampled by the water shader through this matrix. While a
  // splash lives, what it lists in mirrorObjects() (its crowns, columns and
  // drops, each with the cheap water material mirrorWith gave it) is drawn
  // into the mirror every frame over the sky: only inside the rectangle its
  // image covers there, joined with the last frame's so that the sky paints
  // over where it was. Each is drawn twice, its colour and then its distance
  // from the mirror camera into the target's alpha (MIRROR_COMMON in
  // src/shaders/fluid.js); the dome and the clear leave alpha at 1, which
  // says "as far as the sky". The water shader looks near objects up by that
  // distance inside the rectangle the splash's image covers (splashRect,
  // handed to the surface each frame). With nothing alive the cached mirror
  // stays untouched: no pass at all. The mirror image has underScale of the
  // canvas's resolution; the rectangle is in its own pixels.
  const mirrorCamera = new THREE.PerspectiveCamera();
  mirrorCamera.layers.set(MIRROR_LAYER);
  const reflectionMatrix = new THREE.Matrix4();
  const reflectionClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0);
  const mirrorNormal = new THREE.Vector3(0, 1, 0);
  const mirrorEye = new THREE.Vector3();
  const mirrorTarget = new THREE.Vector3();
  const mirrorRotation = new THREE.Matrix4();
  const mirrorBox = new THREE.Box3();
  const mirrorCorner = new THREE.Vector3();
  const splashRect = new THREE.Vector4();     // this frame's splash image in the reflection target (x, y, width, height; 0 wide: none)
  const mirroredRect = new THREE.Vector4();   // the last frame's
  const mirrorRegion = new THREE.Vector4();
  const nothingMirrored = [];
  let viewChanged = true;      // the mirror image is stale

  function placeMirrorCamera() {
    camera.updateMatrixWorld();
    mirrorEye.setFromMatrixPosition(camera.matrixWorld);
    mirrorRotation.extractRotation(camera.matrixWorld);
    mirrorTarget.set(0, 0, -1).applyMatrix4(mirrorRotation).add(mirrorEye).negate().reflect(mirrorNormal).negate();
    mirrorCamera.position.copy(mirrorEye).negate().reflect(mirrorNormal).negate();
    mirrorCamera.up.set(0, 1, 0).applyMatrix4(mirrorRotation).reflect(mirrorNormal);
    mirrorCamera.lookAt(mirrorTarget);
    mirrorCamera.near = camera.near;
    mirrorCamera.far = camera.far;
    mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    reflectionMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    reflectionMatrix.multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
  }

  /** The mirror image, over `region` of the target (or all of it), with the splash's `objects` in it. */
  function drawMirror(region, objects) {
    if (region) {
      reflectionTarget.scissor.copy(region);
      reflectionTarget.scissorTest = true;
    }
    for (const object of objects) {
      object.userData.passMaterial = object.material;
      object.material = object.userData.mirrorMaterial;
    }
    if (objects.length > 0) splash.setMirrorView(mirrorCamera, reflectionTarget.height);
    renderer.clippingPlanes = [reflectionClip];
    renderer.setRenderTarget(reflectionTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(sceneMain, mirrorCamera);
    if (objects.length > 0) {
      renderer.render(splash.particleScene, mirrorCamera);
      for (const object of objects) object.material = object.userData.mirrorDistanceMaterial;
      renderer.render(splash.particleScene, mirrorCamera);
    }
    renderer.clippingPlanes = [];
    for (const object of objects) object.material = object.userData.passMaterial;
    reflectionTarget.scissorTest = false;
    renderer.setRenderTarget(null);
  }

  /** Where the splash's mirror image falls in the reflection target, into splashRect (0 wide when nowhere). */
  function measureSplashImage(objects) {
    splashRect.set(0, 0, 0, 0);
    if (objects.length === 0) return;
    splash.mirrorBounds(mirrorBox);
    if (mirrorBox.isEmpty() || mirrorBox.max.y <= 0) return;   // only what stands above the water is mirrored
    mirrorBox.min.y = Math.max(mirrorBox.min.y, 0);
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (let corner = 0; corner < 8; corner++) {
      mirrorCorner.set(corner & 1 ? mirrorBox.max.x : mirrorBox.min.x, corner & 2 ? mirrorBox.max.y : mirrorBox.min.y, corner & 4 ? mirrorBox.max.z : mirrorBox.min.z);
      mirrorCorner.applyMatrix4(mirrorCamera.matrixWorldInverse);
      if (mirrorCorner.z > -mirrorCamera.near) { left = -1; right = 1; bottom = -1; top = 1; break; }   // reaches behind the camera: all of it
      mirrorCorner.applyMatrix4(mirrorCamera.projectionMatrix);
      left = Math.min(left, mirrorCorner.x); right = Math.max(right, mirrorCorner.x);
      bottom = Math.min(bottom, mirrorCorner.y); top = Math.max(top, mirrorCorner.y);
    }
    const width = reflectionTarget.width;
    const height = reflectionTarget.height;
    const x0 = THREE.MathUtils.clamp(Math.floor((left * 0.5 + 0.5) * width) - 2, 0, width);
    const x1 = THREE.MathUtils.clamp(Math.ceil((right * 0.5 + 0.5) * width) + 2, 0, width);
    const y0 = THREE.MathUtils.clamp(Math.floor((bottom * 0.5 + 0.5) * height) - 2, 0, height);
    const y1 = THREE.MathUtils.clamp(Math.ceil((top * 0.5 + 0.5) * height) + 2, 0, height);
    if (x1 > x0 && y1 > y0) splashRect.set(x0, y0, x1 - x0, y1 - y0);
  }

  function updateReflection() {
    const objects = skip.fluid || skip.mirror ? nothingMirrored : splash.mirrorObjects();
    if (viewChanged) {
      placeMirrorCamera();
      drawMirror(null, objects);
      viewChanged = false;
      measureSplashImage(objects);
      mirroredRect.copy(splashRect);
      return;
    }
    if (objects.length === 0 && mirroredRect.z === 0) return;   // still water: the cached mirror stands
    measureSplashImage(objects);
    if (splashRect.z === 0) mirrorRegion.copy(mirroredRect);
    else if (mirroredRect.z === 0) mirrorRegion.copy(splashRect);
    else {
      const x0 = Math.min(splashRect.x, mirroredRect.x);
      const y0 = Math.min(splashRect.y, mirroredRect.y);
      mirrorRegion.set(x0, y0, Math.max(splashRect.x + splashRect.z, mirroredRect.x + mirroredRect.z) - x0, Math.max(splashRect.y + splashRect.w, mirroredRect.y + mirroredRect.w) - y0);
    }
    if (mirrorRegion.z > 0) drawMirror(mirrorRegion, objects);
    mirroredRect.copy(splashRect);
  }
  const resolution = new THREE.Vector2();
  let dpr = 1;

  // ---- the view ----------------------------------------------------------
  const viewEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  let viewFromApi = false;     // set by setFov / lookAt, which may leave the home frame
  let reportedZoom = false;
  let lastActivity = 0;        // performance.now() of the last input, view change or motion (IDLE)

  // The sky (setSky): a load replaces the dome and the environment maps and
  // fills lighting's sun and sky in place (src/sky.js); then what holds the
  // sun by value follows, and the mirror image is drawn again.
  let skyRequest = environment.name;     // the sky last asked for
  let skyLoading = Promise.resolve();    // the loads queued so far
  function applySky() {
    applySunLights();
    splash.updateLighting();
    viewChanged = true;
    lastActivity = performance.now();
  }

  /** Point the camera as `view` says; the mirror image follows at the next frame. */
  function applyView() {
    camera.fov = view.fov;
    camera.quaternion.setFromEuler(viewEuler.set(view.pitch, view.yaw, 0, 'YXZ'));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // The rings retire once this view's pixels can no longer show them
    // (src/rings.js), the nearest water being the home view's.
    const homeBelow = -home.pitch + THREE.MathUtils.degToRad(home.fov) / 2;
    rings.setCamera({
      x: camera.position.x, z: camera.position.z, height: camera.position.y,
      pixelsPerRadian: 0.5 * resolution.y / Math.tan(THREE.MathUtils.degToRad(view.fov) / 2),
      nearest: camera.position.y / Math.tan(Math.min(homeBelow, 1.5)),
    });
    splash.updateViewUniforms(camera, resolution.y, dpr, underTarget.height);
    viewChanged = true;
    lastActivity = performance.now();
    const zoomed = isZoomed(view, home);
    if (zoomed !== reportedZoom) { reportedZoom = zoomed; onViewChange?.({ zoomed }); }
  }

  function setView(next, fromApi = false) {
    view.yaw = next.yaw;
    view.pitch = next.pitch;
    view.fov = next.fov;
    viewFromApi = fromApi;
    applyView();
  }

  function resetView() { setView(home); }

  function toDeviceCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: -((clientY - rect.top) / rect.height) * 2 + 1 };
  }

  /** Zoom to a field of view, keeping what is under the client point there (zooming out also heads home). */
  function zoomAt(clientX, clientY, fov) {
    const point = toDeviceCoordinates(clientX, clientY);
    const target = THREE.MathUtils.clamp(fov, MIN_FOV, home.fov);
    let next = zoomToward(view, home, camera.aspect, point.x, point.y, target);
    if (fov > view.fov) next = clampToFrame(next, home, camera.aspect);
    if (isZoomed(next, view)) setView(next);   // otherwise nothing moved: at a limit
  }

  /** Width and height of `fraction` of the canvas's resolution, at least one pixel. */
  const scaledSize = (fraction) => [Math.max(1, Math.round(resolution.x * fraction)), Math.max(1, Math.round(resolution.y * fraction))];

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    // The preset's cap and the pixel budget, whichever is lower.
    dpr = Math.min(window.devicePixelRatio || 1, settings.maxDpr, Math.sqrt(PIXEL_BUDGET / (width * height))) * (skip.halfDensity ? 0.5 : 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(resolution);
    const zoomed = isZoomed(view, home);
    camera.aspect = width / height;
    home.fov = width >= height ? 48 : 62;
    // A view set through the API stays as it is; the user's zoom stays inside the new home frame.
    if (!zoomed) Object.assign(view, home);
    else if (!viewFromApi) Object.assign(view, clampToFrame({ ...view, fov: Math.min(view.fov, home.fov) }, home, camera.aspect));
    underTarget?.dispose();
    mainTarget?.dispose();
    reflectionTarget?.dispose();
    const [underWidth, underHeight] = scaledSize(settings.underScale);
    underTarget = createFloatTarget(underWidth, underHeight, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true, depthTexture: true });
    mainTarget = createFloatTarget(resolution.x, resolution.y, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true, depthTexture: true });
    reflectionTarget = createFloatTarget(underWidth, underHeight, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true });
    splash.resize(resolution.x, resolution.y, settings.fluidScale);
    // A smaller under-water pass sees the floor's pattern more minified: its mip chain then (src/pondFloor.js).
    setPatternMipmaps(floor, renderer, underWidth < resolution.x);
    applyView();
  }
  resize();
  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);

  // ---- stones and throwing ---------------------------------------------
  const rocks = [];
  let stoneRadius = 0.03;
  let power = 'normal';
  let timeScale = 1;
  let simulationTime = 0;

  function handPosition() {
    return new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);
  }

  function throwVelocity(hand, target, powerName = power) {
    const distance = hand.distanceTo(target);
    const flightTime = THREE.MathUtils.clamp(0.42 + 0.11 * distance, 0.5, 1.0) * POWER[powerName];
    const velocity = target.clone().sub(hand).divideScalar(flightTime);
    velocity.y += 0.5 * 9.81 * flightTime;
    return { velocity, flightTime };
  }

  function throwAt(x, z, options = {}) {
    const radius = options.radius ?? stoneRadius;
    const hand = handPosition();
    const target = new THREE.Vector3(x, 0, z);
    const { velocity } = throwVelocity(hand, target, options.power ?? power);
    const rock = new Rock({ radius, position: hand, velocity, envTexture: environment.envTexture });
    rocks.push(rock);
    sceneMain.add(rock.meshAbove);
    sceneUnder.add(rock.meshBelow);
    while (rocks.length > MAX_ROCKS) retireRock(rocks[0]);
    lastActivity = performance.now();
    return rock;
  }

  /** Take a stone out of the scenes; keepMaterials frees only its geometry (warmUp keeps a stone's materials, so their program stays compiled). */
  function retireRock(rock, { keepMaterials = false } = {}) {
    sceneMain.remove(rock.meshAbove);
    sceneUnder.remove(rock.meshBelow);
    if (keepMaterials) rock.geometry.dispose();
    else rock.dispose();
    rocks.splice(rocks.indexOf(rock), 1);
  }

  function throwRandom() {
    const x = THREE.MathUtils.randFloatSpread(1.8);
    const z = -0.3 - Math.random() * 2.2;
    return throwAt(x, z);
  }

  // Pointer aiming: pick the water plane under the pointer, kept inside the
  // solver's patch less POND_MARGIN. A pointer on the sky aims as far as the
  // patch reaches in its direction.
  const raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const throwRegion = {
    minX: water.domainMin[0] + POND_MARGIN, maxX: water.domainMin[0] + water.domainSize - POND_MARGIN,
    minZ: water.domainMin[1] + POND_MARGIN, maxZ: water.domainMin[1] + water.domainSize - POND_MARGIN,
  };
  function aimPoint(clientX, clientY) {
    const point = toDeviceCoordinates(clientX, clientY);
    pointer.set(point.x, point.y);
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(waterPlane, hit)) {
      const horizontal = Math.hypot(raycaster.ray.direction.x, raycaster.ray.direction.z);
      if (horizontal < 1e-6) return null;
      hit.set(camera.position.x + (raycaster.ray.direction.x / horizontal) * 100, 0, camera.position.z + (raycaster.ray.direction.z / horizontal) * 100);
    }
    hit.x = THREE.MathUtils.clamp(hit.x, throwRegion.minX, throwRegion.maxX);
    hit.z = THREE.MathUtils.clamp(hit.z, throwRegion.minZ, throwRegion.maxZ);
    return hit;
  }

  function showAim(hit) {
    if (!hit) { marker.visible = false; arc.visible = false; return; }
    marker.visible = true;
    marker.position.set(hit.x, 0.004, hit.z);
    const hand = handPosition();
    const { velocity, flightTime } = throwVelocity(hand, hit);
    for (let i = 0; i < 25; i++) {
      const t = flightTime * i / 24;
      arcPoints[i * 3] = hand.x + velocity.x * t;
      arcPoints[i * 3 + 1] = hand.y + velocity.y * t - 0.5 * 9.81 * t * t;
      arcPoints[i * 3 + 2] = hand.z + velocity.z * t;
    }
    arcGeometry.attributes.position.needsUpdate = true;
    arc.visible = true;
  }

  // A press that lifts where it went down throws. A second finger turns the
  // gesture into a pinch, which never throws, even when one finger lifts first.
  const activePointers = new Map();   // pointerId -> { x, y } in client pixels
  let pressStart = null;              // { id, x, y } of the press that may throw
  let pinch = null;                   // { distance, fov, direction } when the pinch began
  let thrownFrom = null;              // { x, y }: a mouse threw here; its aim stays hidden until it moves on (its arc would hang in the splash)

  function pinchSpan() {
    const [first, second] = activePointers.values();
    return { x: 0.5 * (first.x + second.x), y: 0.5 * (first.y + second.y), distance: Math.max(Math.hypot(first.x - second.x, first.y - second.y), 1) };
  }

  function startPinch() {
    const span = pinchSpan();
    const point = toDeviceCoordinates(span.x, span.y);
    pinch = { distance: span.distance, fov: view.fov, direction: directionAt(view, camera.aspect, point.x, point.y) };
  }

  function movePinch() {
    const span = pinchSpan();
    const point = toDeviceCoordinates(span.x, span.y);
    const fov = THREE.MathUtils.clamp((pinch.fov * pinch.distance) / span.distance, MIN_FOV, home.fov);
    const placed = placeDirection(pinch.direction, point.x, point.y, fov, camera.aspect);
    setView(clampToFrame({ yaw: placed.yaw, pitch: placed.pitch, fov }, home, camera.aspect));
  }

  function releasePointer(event) {
    activePointers.delete(event.pointerId);
    if (pinch && activePointers.size < 2) pinch = null;
    if (pressStart?.id === event.pointerId) pressStart = null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    lastActivity = performance.now();
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { canvas.setPointerCapture(event.pointerId); } catch { /* a synthetic or already released pointer */ }
    if (activePointers.size === 1) {
      pressStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      showAim(aimPoint(event.clientX, event.clientY));
    } else if (activePointers.size === 2) {
      pressStart = null;
      showAim(null);
      startPinch();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    lastActivity = performance.now();
    const tracked = activePointers.get(event.pointerId);
    if (tracked) { tracked.x = event.clientX; tracked.y = event.clientY; }
    if (pinch) { if (tracked) movePinch(); return; }
    if (thrownFrom && Math.hypot(event.clientX - thrownFrom.x, event.clientY - thrownFrom.y) < 14) return;
    thrownFrom = null;
    if (event.pointerType === 'mouse' || pressStart) showAim(aimPoint(event.clientX, event.clientY));
  });
  canvas.addEventListener('pointerup', (event) => {
    lastActivity = performance.now();
    const press = pressStart?.id === event.pointerId ? pressStart : null;
    releasePointer(event);
    if (press) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      const hit = aimPoint(event.clientX, event.clientY);
      if (hit && moved < 14) { throwAt(hit.x, hit.z); if (event.pointerType === 'mouse') thrownFrom = { x: event.clientX, y: event.clientY }; }
    }
    if (event.pointerType !== 'mouse' || thrownFrom) showAim(null);
  });
  canvas.addEventListener('pointercancel', (event) => { releasePointer(event); showAim(null); });
  canvas.addEventListener('pointerleave', (event) => { if (!activePointers.has(event.pointerId)) showAim(null); });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    // Notches: a mouse wheel sends about 100 pixels or 3 lines each. A trackpad
    // pinch arrives as ctrl + wheel in small steps, scaled to feel like the page zoom.
    let notches = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaMode === 2 ? event.deltaY : event.deltaY / 100;
    if (event.ctrlKey) notches *= 10;
    notches = THREE.MathUtils.clamp(notches, -4, 4);
    zoomAt(event.clientX, event.clientY, view.fov * WHEEL_STEP ** -notches);
  }, { passive: false });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat && event.target === document.body) { event.preventDefault(); throwRandom(); }
    if (event.key === 'Escape' && isZoomed(view, home)) resetView();
  });

  // ---- simulation and rendering ----------------------------------------
  function simulate(dt) {
    // The tear and breakup fronts advance once per frame, so the splash needs the frame's length first.
    splash.setFrameSeconds(dt);
    const substep = 1 / 240;
    const steps = Math.min(Math.max(1, Math.ceil(dt / substep)), 12);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const rock of rocks) {
        const impact = rock.update(h, POND_DEPTH);
        if (impact) splash.impact(impact, water);
      }
      splash.update(h, water);
      simulationTime += h;
    }
    for (const rock of [...rocks]) if (rock.restTime > 40) retireRock(rock);
    if (!skip.solver) {
      // The solver sleeps once its waves and foam have faded and nothing of the splash is left (the header);
      // the profiler's 'solver kept awake' step keeps it stepping.
      if (skip.sleep) water.wake();
      else if (!water.asleep && water.settled && splash.settled) water.sleep();
      water.step(dt);
    }
  }

  let framesRendered = 0;
  function render() {
    renderer.info.reset();
    framesRendered++;
    camera.updateMatrixWorld();
    if (!skip.ambient) ambientWaves.update(simulationTime);
    rings.update(simulationTime);
    // The splash's sheets and columns to this frame, for the mirror and the droplet passes.
    if (!skip.fluid) splash.prepareFrame();
    updateReflection();
    surface.update({ underTarget, reflectionTarget, reflectionMatrix, mirrorRect: splashRect, stonesUnder: rocks.some((rock) => rock.state !== 'air'), resolution, camera, time: simulationTime });
    splash.prepareScene();   // the stones' cavities, and the patch dipping under them
    if (skip.cavity) surface.setCavities([]);
    surface.inner.visible = surface.outer.visible = !skip.surface;
    splash.cavityGroup.visible = !skip.surface && !skip.cavity;

    renderer.setRenderTarget(underTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    if (!skip.floor) renderer.render(sceneUnder, camera);

    renderer.setRenderTarget(mainTarget);
    renderer.clear(true, true, false);
    renderer.render(sceneMain, camera);

    if (Object.hasOwn(DEBUG_MODES, debugView)) {
      const debugTextures = { under: underTarget.texture, height: water.heightTexture, ambient: ambientWaves.heightTexture };
      debugPass.material.uniforms.uTexture.value = debugTextures[debugView] ?? water.foamTexture;
      debugPass.material.uniforms.uMode.value = DEBUG_MODES[debugView];
      debugPass.render(renderer, null);
      return;
    }
    // The profiler's plain tone map in place of the droplet passes, or the splash over the scene.
    if (skip.fluid) splash.toneMap(renderer, mainTarget, null);
    else splash.render(renderer, camera, mainTarget, null);
  }

  // ?paused=1 starts with the clock stopped, so the harness's frames start
  // from world time zero whatever the page's start-up took.
  let running = pageParameters.get('paused') !== '1';
  let frameRequest = 0;        // the pending requestAnimationFrame, 0 when none: never two loops
  let lastFrame = performance.now();
  let fpsAverage = 60;
  let frames = 0;

  // ---- what is built, and its memory -------------------------------------
  const sizeOf = (target) => ({ width: target.width, height: target.height });
  /** The bytes the render targets hold, by owner (renderTargetBytes in src/gpu.js), and the sky's textures. */
  function memoryEstimate() {
    const sum = (targets) => targets.reduce((total, target) => total + renderTargetBytes(target), 0);
    const parts = {
      solver: sum([water.stateA, water.stateB, water.fftA, water.fftB, water.heightTarget, water.foamA, water.foamB]),
      wind: sum([ambientWaves.spectrumTarget, ambientWaves.fftA, ambientWaves.fftB, ambientWaves.heightTarget]),
      rings: rings.bytes,
      scene: sum([underTarget, mainTarget, reflectionTarget]),
      splash: sum(Object.values(splash.targets)),
      sky: sum(environment.targets) + environment.panoramaBytes,
      floor: floorPatternBytes,
    };
    return { ...parts, total: Object.values(parts).reduce((total, bytes) => total + bytes, 0) };
  }
  function budget() {
    return {
      quality: qualityName,
      grid: water.size,
      meshSegments: surface.meshSegments,
      meshTriangles: surface.triangles,
      pixelRatio: dpr,
      canvas: { width: resolution.x, height: resolution.y },
      targets: { main: sizeOf(mainTarget), under: sizeOf(underTarget), reflection: sizeOf(reflectionTarget), fluid: sizeOf(splash.targets.info), solver: sizeOf(water.heightTarget) },
      targetBytes: memoryEstimate(),
      memory: { ...renderer.info.memory },
      programs: renderer.info.programs?.length ?? 0,
      solverAsleep: water.asleep,
      rings: { live: rings.live, fading: rings.fading, limit: rings.liveLimit, passes: rings.passesRun, fetches: rings.fetchesRun },
      wind: windName,
      clarity: waterName,
      sky: environment.name,
      frameCapped,
      calibration: automaticQuality ? calibration.phase : 'fixed',
      warmUp: { ...warmUpReport },
    };
  }

  function applyQuality(name) {
    qualityName = name;
    settings = QUALITY[name];
    rings.setLiveLimit(settings.rings);
    water.resize(settings.grid);
    surface.setMeshSegments(settings.meshSegments);
    resize();
    monitor.settle = CALIBRATION.settleSeconds;
    onQualityChange?.(name);
  }

  // The calibration (CALIBRATION above): 'idle' measures the still pond,
  // 'splash' the first splash, then it is done. Only when the quality is automatic.
  const calibration = { phase: 'idle', frames: 0, seconds: 0 };
  function stepDown(steps) {
    const index = Math.min(QUALITY_ORDER.indexOf(qualityName) + steps, QUALITY_ORDER.length - 1);
    if (QUALITY_ORDER[index] !== qualityName) applyQuality(QUALITY_ORDER[index]);
  }
  function calibrate(dtReal) {
    if (!automaticQuality || calibration.phase === 'done') return;
    if (calibration.phase === 'awaitingSplash') {
      if (splash.count === 0) return;
      Object.assign(calibration, { phase: 'splash', frames: 0, seconds: 0 });
    }
    const splashOver = calibration.phase === 'splash' && splash.count === 0;
    if (!splashOver) {
      calibration.frames++;
      // The first splash frames upload its buffers; the idle warm-up covers the rest.
      const warmUp = calibration.phase === 'idle' ? CALIBRATION.warmUpFrames : 5;
      if (calibration.frames <= warmUp) return;
      calibration.seconds += dtReal;
      if (calibration.frames - warmUp < CALIBRATION.windowFrames) return;
    } else if (calibration.frames - 5 < CALIBRATION.fewestFrames) {
      Object.assign(calibration, { phase: 'awaitingSplash', frames: 0, seconds: 0 });   // too short to judge: the next splash
      return;
    }
    const measuredFrames = calibration.frames - (calibration.phase === 'idle' ? CALIBRATION.warmUpFrames : 5);
    const fps = measuredFrames / Math.max(calibration.seconds, 1e-3);
    if (calibration.phase === 'idle') {
      if (fps < CALIBRATION.splashMinimumFps) stepDown(2);
      else if (fps < CALIBRATION.idleMinimumFps) stepDown(1);
      Object.assign(calibration, { phase: 'awaitingSplash', frames: 0, seconds: 0 });
    } else {
      if (fps < CALIBRATION.splashMinimumFps) stepDown(1);
      calibration.phase = 'done';
    }
  }

  // After the idle measurement the frame rate stays watched (CALIBRATION):
  // windows of sustainedSeconds of frames drawn one per requestAnimationFrame;
  // a capped frame or a stall starts the window again.
  const monitor = { seconds: 0, frames: 0, settle: 0 };
  function watchFrameRate(interval, everyFrame) {
    if (!automaticQuality || calibration.phase === 'idle' || calibration.phase === 'splash') return;
    if (!everyFrame || interval > CALIBRATION.stallSeconds) { monitor.seconds = 0; monitor.frames = 0; return; }
    if (monitor.settle > 0) { monitor.settle -= interval; return; }
    monitor.seconds += interval;
    monitor.frames++;
    if (monitor.seconds < CALIBRATION.sustainedSeconds) return;
    if (monitor.frames / monitor.seconds < CALIBRATION.sustainedMinimumFps) stepDown(1);
    monitor.seconds = 0;
    monitor.frames = 0;
  }

  // ---- the frame loop ------------------------------------------------------
  /** Whether frames are coming at the preset's idleFrameRate: nothing moving, touched or zoomed for IDLE.quietSeconds. */
  let frameCapped = false;
  function capFrames(now) {
    frameCapped = settings.idleFrameRate > 0 && (!profiler || profiler.done) && activePointers.size === 0 && now - lastActivity > 1000 * IDLE.quietSeconds;
    return frameCapped;
  }
  let profiler = null;

  function frame(now) {
    frameRequest = 0;
    if (!running) return;
    frameRequest = requestAnimationFrame(frame);
    const interval = (now - lastFrame) / 1000;   // real seconds since the last frame drawn, unclamped
    if (profiler?.emptyFrames) {
      // The profiler's floor: a frame that neither simulates nor draws.
      lastFrame = now;
      profiler.frame({ interval, simulateMilliseconds: 0, renderMilliseconds: 0, calls: 0, triangles: 0 });
      return;
    }
    const capped = capFrames(now);
    if (capped && interval < 1 / settings.idleFrameRate - IDLE.tolerance) return;   // this one is skipped; the next draws both intervals
    lastFrame = now;
    const dtReal = Math.min(interval, 0.1);
    if (dtReal > 0) {
      fpsAverage += (1 / dtReal - fpsAverage) * 0.05;
      if ((++frames & 15) === 0) onStats?.({ fps: fpsAverage, droplets: splash.count, quality: qualityName });
      calibrate(dtReal);
      watchFrameRate(interval, !capped);
    }
    const simulateStart = performance.now();
    simulate((profiler?.fixedSeconds ?? dtReal) * timeScale);
    const renderStart = performance.now();
    render();
    const renderEnd = performance.now();
    if (splash.inMotion || rocks.some((rock) => rock.state !== 'rest')) lastActivity = now;
    profiler?.frame({ interval, simulateMilliseconds: renderStart - simulateStart, renderMilliseconds: renderEnd - renderStart, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  }

  /** The pond back to still water at time zero: no stones, no splash, the solver cleared and asleep. */
  function clearPond() {
    for (const rock of [...rocks]) retireRock(rock);
    water.clear();
    splash.reset(renderer);
    rings.reset();
    simulationTime = 0;
    viewChanged = true;   // the mirror image is drawn whole again, without the splash
    mirroredRect.set(0, 0, 0, 0);
    splashRect.set(0, 0, 0, 0);
  }

  // ---- warm-up: every program a throw needs, compiled under the veil -----
  // Three.js deletes a program once no material uses it. The splash's
  // materials live as long as the page; a stone's die with it, so the warm-up
  // stone's two materials are kept (programKeepers) and every later stone,
  // made the same way, finds their program.
  const warmUpReport = { programs: 0, milliseconds: 0 };
  const programKeepers = [];
  function warmUp() {
    const started = performance.now();
    const programsBefore = renderer.info.programs?.length ?? 0;
    marker.visible = arc.visible = true;   // the aim marker's programs too
    const stone = throwAt(WARM_UP.x, WARM_UP.z, { radius: WARM_UP.radius, power: 'normal' });
    render();
    marker.visible = arc.visible = false;
    for (let step = 0; step < 180 && !rocks.some((rock) => rock.state !== 'air'); step++) simulate(1 / 60);
    let elapsed = 0;
    for (const moment of WARM_UP.moments) {
      while (elapsed < moment - 1e-6) { const dt = Math.min(1 / 60, moment - elapsed); simulate(dt); elapsed += dt; }
      render();
    }
    programKeepers.push(stone.meshAbove.material, stone.meshBelow.material);
    retireRock(stone, { keepMaterials: true });
    clearPond();
    warmUpReport.programs = (renderer.info.programs?.length ?? 0) - programsBefore;
    warmUpReport.milliseconds = performance.now() - started;
  }
  warmUp();

  profiler = profiling ? new Profiler({
    applySkips(flags) {
      const wasHalfDensity = skip.halfDensity;
      for (const key of Object.keys(skip)) skip[key] = Boolean(flags[key]);
      if (skip.halfDensity !== wasHalfDensity) resize();
    },
    throwStone: () => throwAt(0, -1.4, { radius: 0.03, power: 'normal' }),
    hasImpacted: () => rocks.some((rock) => rock.state !== 'air'),
    clearPond,
    describe: () => `${qualityName}, ${resolution.x}×${resolution.y} at ${dpr.toFixed(2)}×, grid ${water.size}, mesh ${surface.meshSegments}`,
    memory: () => ({ ...memoryEstimate(), textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }),
    onReport: (lines) => onProfile?.(lines),
  }) : null;

  lastFrame = performance.now();
  if (running) frameRequest = requestAnimationFrame(frame);
  onReady?.();

  const api = {
    throwAt,
    throwRandom,
    setStoneRadius(radius) { stoneRadius = radius; },
    setPower(name) { if (POWER[name]) power = name; },
    /** The wind's strength by name (WIND_STRENGTHS: calm, breeze, windy), remembered on this device. */
    setWind(name) {
      if (!Object.hasOwn(WIND_STRENGTHS, name)) return;
      applyWind(name);
      try { window.localStorage.setItem(WIND_STORAGE_KEY, name); } catch { /* storage refused: the choice lasts this visit */ }
    },
    get wind() { return windName; },
    /** The water's clarity by name (WATER_CLARITIES: clear, pond, murky), remembered on this device. */
    setClarity(name) {
      if (!Object.hasOwn(WATER_CLARITIES, name)) return;
      applyWater(name);
      lastActivity = performance.now();
      try { window.localStorage.setItem(WATER_STORAGE_KEY, name); } catch { /* storage refused: the choice lasts this visit */ }
    },
    get clarity() { return waterName; },
    /**
     * The sky by name (a key of SKIES in src/sky.js), remembered on this
     * device. Its photo loads first and the old sky stays until it has
     * arrived; then the sky, the sun and everything they light change in one
     * frame. Resolves to the sky then shown (the old one if the photo could
     * not be fetched). Choices made while one loads queue behind it, and only
     * the last is loaded.
     */
    setSky(name) {
      if (!SKY_NAMES.includes(name)) return Promise.resolve(environment.name);
      skyRequest = name;
      try { window.localStorage.setItem(SKY_STORAGE_KEY, name); } catch { /* storage refused: the choice lasts this visit */ }
      skyLoading = skyLoading.then(async () => {
        if (skyRequest !== name || environment.name === name) return;
        await environment.load(name);
        applySky();
      }).catch((error) => console.error(error));
      return skyLoading.then(() => environment.name);
    },
    get sky() { return environment.name; },
    setTimeScale(scale) { timeScale = scale; },
    /** A preset by name, which ends the automatic calibration; 'auto' starts it again from high. */
    setQuality(name) {
      automaticQuality = name === 'auto';
      if (automaticQuality) Object.assign(calibration, { phase: 'idle', frames: 0, seconds: 0 });
      else if (!QUALITY[name]) return;
      applyQuality(automaticQuality ? 'high' : name);
    },
    pause() {
      running = false;
      if (frameRequest) cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    },
    resume() {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      if (!frameRequest) frameRequest = requestAnimationFrame(frame);
    },
    /**
     * Deterministic stepping for screenshots: simulate `seconds` of world time
     * in the frames the app would draw, 1/60 s of real time each (so a time
     * scale of 0.1 makes frames of 1/600 s), then draw once.
     */
    advance(seconds) {
      const chunk = Math.max(timeScale, 0.01) / 60;
      let remaining = seconds;
      while (remaining > 1e-6) { const dt = Math.min(chunk, remaining); simulate(dt); remaining -= dt; }
      render();
    },
    hasImpacted() { return rocks.some((rock) => rock.state !== 'air'); },
    setDebugView(name) { debugView = name; },
    /** Set the field of view (degrees), keeping the look direction; unlike the user's zoom it may leave the home frame. */
    setFov(degrees) { setView({ yaw: view.yaw, pitch: view.pitch, fov: degrees }, true); },
    /** Turn the camera to look at a world point, horizon level. */
    lookAt(x, y, z) { setView({ ...viewFacing(x - camera.position.x, y - camera.position.y, z - camera.position.z), fov: view.fov }, true); },
    /** Back to the home view the page opens with. */
    resetView,
    get zoomed() { return isZoomed(view, home); },
    get time() { return simulationTime; },
    get timeScale() { return timeScale; },
    get rocks() { return rocks; },
    get quality() { return qualityName; },
    /** Whether the quality is chosen automatically (setQuality('auto'), and the page's start unless ?quality= fixes it). */
    get automaticQuality() { return automaticQuality; },
    /**
     * What the preset built (read-only): the solver's grid, the patch's mesh,
     * the pixel ratio, every target's size, the render targets' bytes by owner
     * (an estimate from their formats), renderer.info.memory, the programs
     * compiled, whether the solver sleeps and the frame rate is capped, and
     * the warm-up's programs and milliseconds.
     */
    get budget() { return budget(); },
    /** Frames drawn so far (render() calls), for the probes. */
    get framesRendered() { return framesRendered; },
    /** Where the splash was drawn into the mirror image at the last frame, in its target's pixels (0 wide: nowhere), and the target's size. */
    get mirrorRegion() { return { x: splashRect.x, y: splashRect.y, width: splashRect.z, height: splashRect.w, targetWidth: reflectionTarget.width, targetHeight: reflectionTarget.height }; },
    renderer,
    camera,
    lighting,
    water,
    ambientWaves,
    rings,
    splash,
    surface,
    sceneUnder,
    sceneMain,
    THREE,
  };
  return api;
}
