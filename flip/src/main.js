// FLIP splash experiment: a stone drops into a tank of simulated water.
//
// This page tests whether a particle fluid solver at the resolution a browser
// can afford makes a better splash than the scripted one in the main pond.
// Each frame: the stone advances on the CPU, the solver runs as many substeps
// as the fastest water needs, and the particles are drawn as a screen-space
// fluid. window.__flip drives it from the console and the headless harness:
//   __flip.ready            resolves when the page can simulate
//   __flip.rebuild(options) new tank: { cellSize, waterDepth, seed }
//   __flip.throwStone({ radius, speed, angleDegrees, x, z })
//   __flip.advance(seconds) simulate without drawing (await it)
//   __flip.capture()        draw one frame (await it)
//   __flip.stats()          { substeps, frameMs, residual, maxSpeed, particles, cells }
import { FlipSolver } from './flipSolver.js';
import { Stone } from './stone.js';
import { FluidRenderer } from './fluidRenderer.js';
import { Camera } from './camera.js';
import { createPresenter } from './presenter.js';

const TANK = { width: 0.40, height: 0.55, depth: 0.40, waterDepth: 0.30 };
const QUALITY = { coarse: 0.016, medium: 0.012, fine: 0.010, finest: 0.008 };
const MAX_SUBSTEPS_PER_FRAME = 48;
const FRAME_SECONDS = 1 / 60;

/** Small seeded generator so a run can be repeated exactly. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const params = new URLSearchParams(location.search);
  const readback = params.get('readback') === '1';
  const status = document.getElementById('status');
  if (!navigator.gpu) {
    status.textContent = 'This page needs WebGPU (Chrome, Edge, or Safari 26).';
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    status.textContent = 'No WebGPU adapter found.';
    return;
  }
  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (event) => {
    console.error('WebGPU error:', event.error.message);
    status.textContent = `WebGPU error: ${event.error.message}`;
  });

  const canvas = document.getElementById('tank');
  const presenter = createPresenter(device, canvas, { readback });
  const renderer = new FluidRenderer(device, { outputFormat: presenter.format });
  // ?view=side looks along the surface from low down, to see heights; ?view=top looks down.
  const cameras = {
    default: { target: [TANK.width / 2, TANK.waterDepth + 0.06, TANK.depth / 2], distance: 1.05, elevationDegrees: 18, azimuthDegrees: 22, fovDegrees: 40 },
    side: { target: [TANK.width / 2, TANK.waterDepth + 0.08, TANK.depth / 2], distance: 1.2, elevationDegrees: 6, azimuthDegrees: 0, fovDegrees: 32 },
    top: { target: [TANK.width / 2, TANK.waterDepth, TANK.depth / 2], distance: 0.9, elevationDegrees: 70, azimuthDegrees: 10, fovDegrees: 40 },
  };
  const camera = new Camera(cameras[params.get('view')] ?? cameras.default);
  // ?debug=depth|thickness|scene shows one of the renderer's intermediate textures;
  // ?debug=particles draws the raw particles coloured by height.
  const debugView = { depth: 1, thickness: 2, scene: 3, particles: 3 }[params.get('debug')] ?? 0;
  const rawParticles = params.get('debug') === 'particles';

  const settings = {
    cellSize: QUALITY[params.get('quality')] ?? QUALITY.fine,
    stoneRadius: 0.02,
    speed: 4,
    angleDegrees: 0,
    timeScale: 1,
    pressureIterations: 50,
    overRelaxation: 1.4,
    picBlendPerFrame: 0.03,
    cfl: 1.0,
    densityStrength: 0.3,
    gravity: 9.81,
    paused: false,
    seed: 1,
  };
  for (const key of ['stoneRadius', 'speed', 'angleDegrees', 'timeScale', 'pressureIterations', 'overRelaxation', 'cfl', 'densityStrength', 'seed', 'gravity', 'picBlendPerFrame']) {
    if (params.has(key)) settings[key] = Number(params.get(key));
  }
  // ?slice=1 with the particle view keeps only a one-cell slab through the impact: a cross-section.
  const sliceHalfWidth = params.get('slice') === '1' ? settings.cellSize * 0.5 : 1e9;

  let solver = null;
  let stone = null;
  let particleGroup = null;
  let lastMaxSpeed = 0;
  let simulatedTime = 0;
  const stats = { substeps: 0, frameMs: 0, residual: 0, maxSpeed: 0, meanSpeed: 0, aboveSurface: 0, particles: 0, cells: 0 };

  function rebuild(options = {}) {
    Object.assign(settings, options);
    const cellCount = [TANK.width, TANK.height, TANK.depth].map((size) => Math.round(size / settings.cellSize));
    const waterCells = Math.round(TANK.waterDepth / settings.cellSize);
    const maxParticles = cellCount[0] * waterCells * cellCount[2] * 8;
    solver = new FlipSolver(device, { cellSize: settings.cellSize, cellCount, maxParticles });
    solver.seedWater({ waterDepth: TANK.waterDepth, random: mulberry32(settings.seed) });
    particleGroup = renderer.particleBindGroup(solver.positionBuffer);
    stone = null;
    lastMaxSpeed = 0;
    simulatedTime = 0;
    stats.particles = solver.particleCount;
    stats.cells = cellCount.join(' × ');
  }

  function throwStone(options = {}) {
    const radius = options.radius ?? settings.stoneRadius;
    const speed = options.speed ?? settings.speed;
    const angle = ((options.angleDegrees ?? settings.angleDegrees) * Math.PI) / 180;
    const x = options.x ?? TANK.width / 2;
    const z = options.z ?? TANK.depth / 2;
    // Start with the stone's bottom touching the still surface: t = 0 is the impact.
    stone = new Stone({
      radius,
      position: [x, TANK.waterDepth + radius, z],
      velocity: [speed * Math.sin(angle), -speed * Math.cos(angle), 0],
    });
    simulatedTime = 0;
  }

  /** Simulate `seconds` of tank time in as many substeps as the water's speed demands. */
  async function simulate(seconds) {
    const extent = solver.extent;
    const stoneSpeed = stone ? stone.speed : 0;
    const fastest = Math.max(lastMaxSpeed * 1.25, stoneSpeed, 0.5);
    const cflStep = (settings.cfl * settings.cellSize) / fastest;
    const substeps = Math.min(Math.max(Math.ceil(seconds / Math.min(cflStep, 1 / 120)), 1), MAX_SUBSTEPS_PER_FRAME);
    const dt = seconds / substeps;
    const picBlend = 1 - (1 - settings.picBlendPerFrame) ** (dt / FRAME_SECONDS);

    solver.resetStats();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    for (let substep = 0; substep < substeps; substep++) {
      const before = stone ? stone.clone() : null;
      if (stone) stone.advance(dt, { waterLevel: TANK.waterDepth });
      const active = stone && before.position[1] - before.radius < extent[1];
      solver.encodeSubstep(pass, substep, {
        dt,
        gravity: settings.gravity,
        picBlend,
        pressureIterations: settings.pressureIterations,
        overRelaxation: settings.overRelaxation,
        densityStrength: settings.densityStrength,
        measureResidual: substep === substeps - 1,
        splashLevel: TANK.waterDepth + settings.cellSize,
        stone: {
          centre: before ? before.position : [0, 0, 0],
          centreNext: stone ? stone.position : [0, 0, 0],
          velocity: before ? before.velocity : [0, 0, 0],
          radius: stone ? stone.radius : 0,
          active,
        },
      });
    }
    pass.end();
    solver.encodeStatsCopy(encoder);
    device.queue.submit([encoder.finish()]);
    const result = await solver.readStats();
    lastMaxSpeed = result.maxSpeed;
    simulatedTime += seconds;
    stats.substeps = substeps;
    stats.residual = result.residual;
    stats.maxSpeed = result.maxSpeed;
    stats.meanSpeed = result.meanSpeed;
    stats.aboveSurface = result.aboveSurface;
  }

  function fitCanvas() {
    const scale = readback ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(2, Math.floor(canvas.clientWidth * scale));
    const height = Math.max(2, Math.floor(canvas.clientHeight * scale));
    if (width !== renderer.width || height !== renderer.height) {
      presenter.resize(width, height);
      renderer.resize(width, height);
    }
  }

  async function draw() {
    fitCanvas();
    const spacing = settings.cellSize / 2;
    const uniformOptions = (blurDirection) => ({
      camera,
      particleRadius: spacing * 0.8,
      sunDirection: normalized([-0.45, 0.72, 0.5]),
      blurRadius: spacing * 3,
      stone,
      boxSize: [TANK.width, TANK.height, TANK.depth],
      waterLevel: TANK.waterDepth,
      thicknessScale: 0.7,
      blurDirection,
      debugView,
      sliceZ: TANK.depth / 2,
      sliceHalfWidth,
    });
    renderer.render({
      targetView: presenter.targetView(),
      particleGroup,
      particleCount: solver.particleCount,
      writeUniformsFor: (blurDirection) => renderer.writeUniforms(uniformOptions(blurDirection)),
      beforeLastSubmit: (encoder) => presenter.encodeCopy(encoder),
      rawParticles,
    });
    await presenter.present();
  }

  function normalized(vector) {
    const length = Math.hypot(...vector);
    return vector.map((component) => component / length);
  }

  // --- interface ---------------------------------------------------------
  const bind = (id, handler) => document.getElementById(id)?.addEventListener('input', (event) => handler(event.target));
  bind('quality', (input) => rebuild({ cellSize: QUALITY[input.value] }));
  bind('radius', (input) => { settings.stoneRadius = Number(input.value) / 1000; });
  bind('speed', (input) => { settings.speed = Number(input.value); });
  bind('timeScale', (input) => { settings.timeScale = Number(input.value); });
  document.getElementById('throw')?.addEventListener('click', () => throwStone());
  document.getElementById('reset')?.addEventListener('click', () => rebuild());
  document.getElementById('pause')?.addEventListener('click', (event) => {
    settings.paused = !settings.paused;
    event.target.textContent = settings.paused ? 'Resume' : 'Pause';
  });
  canvas.addEventListener('pointerdown', () => { if (!stone || stone.resting) throwStone(); });
  window.addEventListener('keydown', (event) => { if (event.code === 'Space') { event.preventDefault(); throwStone(); } });
  const qualitySelect = document.getElementById('quality');
  if (qualitySelect) qualitySelect.value = Object.entries(QUALITY).find(([, size]) => size === settings.cellSize)?.[0] ?? 'fine';

  rebuild();

  const harness = params.get('harness') === '1';
  let running = false;
  let lastFrameTime = performance.now();
  async function frame() {
    if (running) return;
    running = true;
    const now = performance.now();
    const elapsed = Math.min((now - lastFrameTime) / 1000, 1 / 30);
    lastFrameTime = now;
    if (!settings.paused) {
      const started = performance.now();
      await simulate(elapsed * settings.timeScale);
      stats.frameMs = performance.now() - started;
    }
    await draw();
    status.textContent = `${stats.particles.toLocaleString()} particles, ${stats.cells} cells, ${stats.substeps} substeps, ${stats.frameMs.toFixed(1)} ms simulate, residual ${stats.residual.toExponential(1)} /s, t = ${simulatedTime.toFixed(2)} s`;
    running = false;
    if (!harness) requestAnimationFrame(frame);
  }

  // Draws and simulations share the readback buffers, so they are queued one after another.
  let queue = Promise.resolve();
  const serialized = (task) => (...args) => {
    const result = queue.then(() => task(...args));
    queue = result.catch(() => {});
    return result;
  };

  window.__flip = {
    ready: queue,
    settings,
    rebuild,
    throwStone,
    advance: serialized(async (seconds) => {
      let remaining = seconds;
      while (remaining > 1e-9) {
        const step = Math.min(FRAME_SECONDS, remaining);
        await simulate(step);
        remaining -= step;
      }
    }),
    capture: serialized(() => draw()),
    stats: () => ({ ...stats, simulatedTime }),
    readParticles: () => solver.readParticles(),
    readGrid: () => solver.readGrid(),
    get stone() { return stone; },
  };

  if (harness) {
    window.__flip.ready = serialized(async () => {
      await draw();
      status.textContent = 'harness mode';
    })();
  } else {
    requestAnimationFrame(frame);
  }
}

main().catch((error) => {
  console.error(error);
  document.getElementById('status').textContent = `Failed: ${error.message}`;
});
