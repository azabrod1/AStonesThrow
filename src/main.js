// Stone Pond: throw stones into water and watch the splash.
//
// Frame pipeline:
//   1. advance the stones, droplets and bubbles (CPU), feeding the water;
//   2. step the spectral water surface (GPU) and its foam;
//   3. render what is under the surface (floor, submerged stones, bubbles)
//      to a texture with depth;
//   4. render the main scene (sky, shore, water surface refracting pass 3,
//      stones above the surface) to an HDR texture with depth;
//   5. draw the droplets over it and tone-map to the canvas.
// All simulation runs in world seconds scaled by the slow-motion factor.
import * as THREE from 'three';
import { SpectralWater } from './spectralWater.js';
import { createEnvironment } from './sky.js';
import { createWaterSurface } from './waterSurface.js';
import { createPondFloor } from './pondFloor.js';
import { Rock } from './rock.js';
import { SplashSystem } from './splash.js';
import { createFloatTarget, FullscreenPass, configureFloatSupport } from './gpu.js';

const QUALITY = {
  high: { grid: 512, fluidScale: 1.0, maxDpr: 2.0 },
  medium: { grid: 512, fluidScale: 0.5, maxDpr: 1.5 },
  low: { grid: 256, fluidScale: 0.5, maxDpr: 1.0 },
};
const POWER = { soft: 1.3, normal: 1.0, hard: 0.72 };   // flight-time multipliers
const POND_DEPTH = 0.8;
const MAX_ROCKS = 10;

function detectQuality() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse || small ? 'low' : 'high';
}

export function startPond({ canvas, quality = 'auto', onReady, onError, onStats }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (error) {
    onError?.('WebGL 2 is not available in this browser.');
    throw error;
  }
  // ?floats=half takes the half-float path that devices without
  // EXT_color_buffer_float get, to test it on any machine.
  const forceHalfFloat = new URLSearchParams(window.location.search).get('floats') === 'half';
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

  // Lighting shared by every shader. Values are linear radiance in arbitrary
  // units chosen so that a sunlit pond tone-maps well at the given exposure.
  const sunDirection = new THREE.Vector3(0.42, Math.sin(THREE.MathUtils.degToRad(30)), -0.78).normalize();
  const lighting = {
    sunDirection,
    sunIrradiance: new THREE.Vector3(3.0, 2.85, 2.55),
    skyAmbient: new THREE.Vector3(0.26, 0.34, 0.46),
    absorb: new THREE.Vector3(0.95, 0.36, 0.34),
    waterColor: new THREE.Vector3(0.010, 0.046, 0.040),
    exposure: 0.55,
  };

  const environment = createEnvironment(renderer, sunDirection);

  let qualityName = quality === 'auto' ? detectQuality() : quality;
  let settings = QUALITY[qualityName];

  const water = new SpectralWater(renderer, { size: settings.grid, domainSize: 6, centre: [0, -1.0], depth: POND_DEPTH });
  const surface = createWaterSurface(water, lighting, environment);
  const floor = createPondFloor(water, lighting);
  const splash = new SplashSystem({ environment, lighting });

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 60000);
  camera.position.set(0, 1.15, 2.45);
  camera.lookAt(0, 0.12, -1.0);

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.95, 0.86), 3.0);
  sun.position.copy(sunDirection).multiplyScalar(50);
  // Below the surface the sun has crossed the water column: attenuate it.
  const sunUnder = sun.clone();
  const sunPath = POND_DEPTH / sunDirection.y;
  sunUnder.color.multiply(new THREE.Color(Math.exp(-lighting.absorb.x * sunPath), Math.exp(-lighting.absorb.y * sunPath), Math.exp(-lighting.absorb.z * sunPath)));

  const sceneUnder = new THREE.Scene();
  sceneUnder.add(floor, splash.bubblePoints, sunUnder);
  const sceneMain = new THREE.Scene();
  sceneMain.add(environment.sky, environment.shore, surface.inner, surface.outer, sun);
  // Layer 1 holds what the water mirrors: the sky and the far shore.
  environment.sky.layers.enable(1);
  environment.shore.layers.enable(1);
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

  // Debug views for development: show the under-water pass or the height field.
  let debugView = 'none';
  const debugPass = new FullscreenPass(`
    uniform sampler2D uTexture; uniform samplerCube uCube; uniform float uMode; varying vec2 vUv;
    void main() {
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
  let fovOverride = null;
  let underTarget = null;
  let mainTarget = null;
  let reflectionTarget = null;

  // The camera never moves, so the mirror image of the sky and shore is
  // rendered once per resize through a camera reflected in the water plane
  // (the same construction as Three.js's Reflector), then sampled by the
  // water shader through this matrix.
  const mirrorCamera = new THREE.PerspectiveCamera();
  mirrorCamera.layers.set(1);
  const reflectionMatrix = new THREE.Matrix4();
  const reflectionClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0);
  function renderReflection() {
    camera.updateMatrixWorld();
    const normal = new THREE.Vector3(0, 1, 0);
    const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rotation = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const view = cameraPosition.clone().negate().reflect(normal).negate();
    const lookAt = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).add(cameraPosition);
    const target = lookAt.clone().negate().reflect(normal).negate();
    mirrorCamera.position.copy(view);
    mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    mirrorCamera.lookAt(target);
    mirrorCamera.near = camera.near;
    mirrorCamera.far = camera.far;
    mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    reflectionMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    reflectionMatrix.multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
    renderer.clippingPlanes = [reflectionClip];
    renderer.setRenderTarget(reflectionTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(sceneMain, mirrorCamera);
    renderer.clippingPlanes = [];
    renderer.setRenderTarget(null);
  }
  const resolution = new THREE.Vector2();
  let dpr = 1;

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, settings.maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    resolution.set(Math.round(width * dpr), Math.round(height * dpr));
    camera.aspect = width / height;
    camera.fov = fovOverride ?? (width >= height ? 48 : 62);
    camera.updateProjectionMatrix();
    underTarget?.dispose();
    mainTarget?.dispose();
    reflectionTarget?.dispose();
    underTarget = createFloatTarget(resolution.x, resolution.y, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true, depthTexture: true });
    mainTarget = createFloatTarget(resolution.x, resolution.y, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true, depthTexture: true });
    reflectionTarget = createFloatTarget(resolution.x, resolution.y, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true });
    renderReflection();
    splash.resize(resolution.x, resolution.y, settings.fluidScale);
    splash.updateBubbleUniforms(camera, resolution.y);
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
    return rock;
  }

  function retireRock(rock) {
    sceneMain.remove(rock.meshAbove);
    sceneUnder.remove(rock.meshBelow);
    rock.dispose();
    rocks.splice(rocks.indexOf(rock), 1);
  }

  function throwRandom() {
    const x = THREE.MathUtils.randFloatSpread(1.8);
    const z = -0.3 - Math.random() * 2.2;
    return throwAt(x, z);
  }

  // Pointer aiming: pick the water plane under the pointer.
  const raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  function aimPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(waterPlane, hit)) return null;
    if (hit.z > 2.2 || hit.distanceTo(camera.position) > 12) return null;
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

  let pressStart = null;
  canvas.addEventListener('pointerdown', (event) => {
    pressStart = { x: event.clientX, y: event.clientY };
    showAim(aimPoint(event.clientX, event.clientY));
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || pressStart) showAim(aimPoint(event.clientX, event.clientY));
  });
  canvas.addEventListener('pointerup', (event) => {
    const moved = pressStart ? Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) : 99;
    pressStart = null;
    const hit = aimPoint(event.clientX, event.clientY);
    if (hit && moved < 14) throwAt(hit.x, hit.z);
    if (event.pointerType !== 'mouse') showAim(null);
  });
  canvas.addEventListener('pointerleave', () => { pressStart = null; showAim(null); });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat && event.target === document.body) { event.preventDefault(); throwRandom(); }
  });

  // ---- simulation and rendering ----------------------------------------
  function simulate(dt) {
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
    splash.setFrameSeconds(dt);
    water.step(dt);
  }

  function render() {
    camera.updateMatrixWorld();
    surface.update({ underTarget, reflectionTarget, reflectionMatrix, resolution, camera, time: simulationTime });
    floor.material.uniforms.uHeight.value = water.heightTexture;

    renderer.setRenderTarget(underTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(sceneUnder, camera);

    renderer.setRenderTarget(mainTarget);
    renderer.clear(true, true, false);
    renderer.render(sceneMain, camera);

    if (debugView === 'under' || debugView === 'height' || debugView === 'foam' || debugView === 'env' || debugView === 'face') {
      debugPass.material.uniforms.uTexture.value = debugView === 'under' ? underTarget.texture : debugView === 'height' ? water.heightTexture : water.foamTexture;
      debugPass.material.uniforms.uMode.value = debugView === 'under' ? 0 : debugView === 'height' ? 1 : debugView === 'foam' ? 2 : debugView === 'env' ? 3 : 4;
      debugPass.render(renderer, null);
      return;
    }
    splash.render(renderer, camera, mainTarget, null);
  }

  let running = true;
  let lastFrame = performance.now();
  let fpsAverage = 60;
  let frames = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (dtReal > 0) {
      fpsAverage += (1 / dtReal - fpsAverage) * 0.05;
      if ((++frames & 15) === 0) onStats?.({ fps: fpsAverage, droplets: splash.count, quality: qualityName });
    }
    simulate(dtReal * timeScale);
    render();
  }
  requestAnimationFrame(frame);
  onReady?.();

  const api = {
    throwAt,
    throwRandom,
    setStoneRadius(radius) { stoneRadius = radius; },
    setPower(name) { if (POWER[name]) power = name; },
    setTimeScale(scale) { timeScale = scale; },
    setQuality(name) {
      const next = name === 'auto' ? detectQuality() : name;
      if (!QUALITY[next]) return;
      qualityName = next;
      settings = QUALITY[next];
      resize();
    },
    pause() { running = false; },
    resume() { if (!running) { running = true; lastFrame = performance.now(); requestAnimationFrame(frame); } },
    /** Deterministic stepping for screenshots: simulate in 1/60 s chunks, then draw once. */
    advance(seconds) {
      const chunk = 1 / 60;
      let remaining = seconds;
      while (remaining > 1e-6) { const dt = Math.min(chunk, remaining); simulate(dt); remaining -= dt; }
      render();
    },
    hasImpacted() { return rocks.some((rock) => rock.state !== 'air'); },
    setDebugView(name) { debugView = name; },
    setFov(degrees) { fovOverride = degrees; camera.fov = degrees; camera.updateProjectionMatrix(); renderReflection(); },
    lookAt(x, y, z) { camera.lookAt(x, y, z); camera.updateMatrixWorld(); renderReflection(); },
    get time() { return simulationTime; },
    get rocks() { return rocks; },
    get quality() { return qualityName; },
    camera,
    lighting,
    water,
    splash,
    sceneUnder,
    sceneMain,
    THREE,
  };
  return api;
}
