// A FLIP water solver on the GPU: particles carry the water, a staggered grid
// makes it incompressible each substep. The kernels are in shaders/flip.wgsl.js
// and that file documents the method; this class owns the buffers and
// pipelines and records one substep per call.
//
// Units are metres and seconds. The grid starts at the origin and spans
// cellCount × cellSize on each axis; the top is open, so particles can leave
// through it and come back. A moving sphere (the stone) is the only solid
// besides the walls and floor.
//
// All substeps of a frame are recorded into one compute pass. Each takes its
// parameters from its own 256-byte slot of the uniform buffer, chosen with a
// dynamic offset, because queue.writeBuffer runs before the command buffer and
// a single slot would hand every substep the last values.
import { FLIP_COMPUTE } from './shaders/flip.wgsl.js';

const UNIFORM_SLOT_BYTES = 256;
const UNIFORM_BYTES = 96;
const MAX_SUBSTEPS = 64;
const PARTICLE_WORKGROUP_SIZE = 64;

export class FlipSolver {
  constructor(device, { cellSize, cellCount, maxParticles }) {
    this.device = device;
    this.cellSize = cellSize;
    this.cellCount = cellCount;
    this.maxParticles = maxParticles;
    this.particleCount = 0;

    const [countX, countY, countZ] = cellCount;
    const nodeTotal = (countX + 1) * (countY + 1) * (countZ + 1);
    const cellTotal = countX * countY * countZ;
    this.cellTotal = cellTotal;

    const storage = (bytes, extraUsage = 0) => device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | extraUsage });
    this.positionBuffer = storage(maxParticles * 16, GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
    this.velocityBuffer = storage(maxParticles * 16, GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
    this.accumulatorBuffer = storage(nodeTotal * 32);
    this.gridVelocityBuffer = storage(nodeTotal * 16, GPUBufferUsage.COPY_SRC);
    this.gridVelocityBeforeBuffer = storage(nodeTotal * 16);
    this.cellBuffer = storage(cellTotal * 8, GPUBufferUsage.COPY_SRC);
    this.pressureBuffer = storage(cellTotal * 4, GPUBufferUsage.COPY_DST);
    this.statsBuffer = storage(16, GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
    this.statsReadback = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.uniformBuffer = device.createBuffer({ size: UNIFORM_SLOT_BYTES * MAX_SUBSTEPS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uniformStaging = new ArrayBuffer(UNIFORM_BYTES);

    const module = device.createShaderModule({ code: FLIP_COMPUTE });
    const entries = [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } }];
    for (let binding = 1; binding <= 8; binding++) {
      entries.push({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } });
    }
    const bindGroupLayout = device.createBindGroupLayout({ entries });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const gridPipeline = (entryPoint) => device.createComputePipeline({ layout, compute: { module, entryPoint } });
    const particlePipeline = (entryPoint) => device.createComputePipeline({
      layout, compute: { module, entryPoint, constants: { PARTICLE_WORKGROUP_SIZE } },
    });
    this.pipelines = {
      clearGrid: gridPipeline('clearGrid'),
      transferToGrid: particlePipeline('transferToGrid'),
      markCells: particlePipeline('markCells'),
      normalizeGrid: gridPipeline('normalizeGrid'),
      mirrorPhantomFacesBoth: gridPipeline('mirrorPhantomFacesBoth'),
      mirrorPhantomFacesNow: gridPipeline('mirrorPhantomFacesNow'),
      addGravity: gridPipeline('addGravity'),
      enforceBoundary: gridPipeline('enforceBoundary'),
      computeDivergence: gridPipeline('computeDivergence'),
      pressureRed: gridPipeline('pressureRed'),
      pressureBlack: gridPipeline('pressureBlack'),
      applyPressure: gridPipeline('applyPressure'),
      computeResidual: gridPipeline('computeResidual'),
      gridToParticle: particlePipeline('gridToParticle'),
      advect: particlePipeline('advect'),
    };
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer, offset: 0, size: UNIFORM_BYTES } },
        { binding: 1, resource: { buffer: this.positionBuffer } },
        { binding: 2, resource: { buffer: this.velocityBuffer } },
        { binding: 3, resource: { buffer: this.accumulatorBuffer } },
        { binding: 4, resource: { buffer: this.gridVelocityBuffer } },
        { binding: 5, resource: { buffer: this.gridVelocityBeforeBuffer } },
        { binding: 6, resource: { buffer: this.cellBuffer } },
        { binding: 7, resource: { buffer: this.pressureBuffer } },
        { binding: 8, resource: { buffer: this.statsBuffer } },
      ],
    });

    this.nodeWorkgroups = [Math.ceil((countX + 1) / 8), Math.ceil((countY + 1) / 4), Math.ceil((countZ + 1) / 4)];
    this.cellWorkgroups = [Math.ceil(countX / 8), Math.ceil(countY / 4), Math.ceil(countZ / 4)];
  }

  get extent() {
    return this.cellCount.map((count) => count * this.cellSize);
  }

  /** Fill the box with still water up to waterDepth, particlesPerAxis³ jittered particles per cell. */
  seedWater({ waterDepth, particlesPerAxis = 2, random = Math.random }) {
    const [countX, countY, countZ] = this.cellCount;
    const waterCells = Math.min(countY, Math.round(waterDepth / this.cellSize));
    const spacing = this.cellSize / particlesPerAxis;
    const positions = [];
    for (let cellZ = 0; cellZ < countZ; cellZ++) {
      for (let cellY = 0; cellY < waterCells; cellY++) {
        for (let cellX = 0; cellX < countX; cellX++) {
          for (let subZ = 0; subZ < particlesPerAxis; subZ++) {
            for (let subY = 0; subY < particlesPerAxis; subY++) {
              for (let subX = 0; subX < particlesPerAxis; subX++) {
                if (positions.length / 4 >= this.maxParticles) break;
                positions.push(
                  (cellX * particlesPerAxis + subX + 0.5 + (random() - 0.5) * 0.6) * spacing,
                  (cellY * particlesPerAxis + subY + 0.5 + (random() - 0.5) * 0.6) * spacing,
                  (cellZ * particlesPerAxis + subZ + 0.5 + (random() - 0.5) * 0.6) * spacing,
                  1);
              }
            }
          }
        }
      }
    }
    this.particleCount = positions.length / 4;
    this.particlesPerCell = particlesPerAxis ** 3;
    this.device.queue.writeBuffer(this.positionBuffer, 0, new Float32Array(positions));
    this.device.queue.writeBuffer(this.velocityBuffer, 0, new Float32Array(this.particleCount * 4));
    this.device.queue.writeBuffer(this.pressureBuffer, 0, new Float32Array(this.cellTotal));
    return this.particleCount;
  }

  /** Zero the per-frame statistics; call once per frame before encoding substeps. */
  resetStats() {
    this.device.queue.writeBuffer(this.statsBuffer, 0, new Uint32Array(4));
    this.substepsThisFrame = 0;
  }

  /**
   * Record one substep. `slot` is the substep index within the frame.
   * stone: { centre, centreNext, velocity, radius, active }.
   */
  encodeSubstep(pass, slot, { dt, gravity = 9.81, picBlend, stone, pressureIterations, densityStrength, overRelaxation = 1, measureResidual = false, splashLevel = 1e9 }) {
    if (slot >= MAX_SUBSTEPS) throw new Error(`more than ${MAX_SUBSTEPS} substeps in one frame`);
    this.substepsThisFrame = (this.substepsThisFrame ?? 0) + 1;
    const floats = new Float32Array(this.uniformStaging);
    const uints = new Uint32Array(this.uniformStaging);
    uints.set(this.cellCount, 0);
    uints[3] = this.particleCount;
    floats[4] = this.cellSize;
    floats[5] = dt;
    floats[6] = gravity;
    floats[7] = picBlend;
    floats.set(stone.centre, 8);
    floats[11] = stone.radius;
    floats.set(stone.velocity, 12);
    floats[15] = stone.active ? 1 : 0;
    floats.set(stone.centreNext, 16);
    floats[19] = densityStrength;
    floats[20] = this.particlesPerCell;
    floats[21] = measureResidual ? 1 : 0;
    floats[22] = overRelaxation;
    floats[23] = splashLevel;
    this.device.queue.writeBuffer(this.uniformBuffer, slot * UNIFORM_SLOT_BYTES, this.uniformStaging);

    const particleWorkgroups = Math.ceil(this.particleCount / PARTICLE_WORKGROUP_SIZE);
    const pipelines = this.pipelines;
    const nodes = () => pass.dispatchWorkgroups(...this.nodeWorkgroups);
    const cells = () => pass.dispatchWorkgroups(...this.cellWorkgroups);
    const particles = () => pass.dispatchWorkgroups(particleWorkgroups);

    pass.setBindGroup(0, this.bindGroup, [slot * UNIFORM_SLOT_BYTES]);
    pass.setPipeline(pipelines.clearGrid); nodes();
    pass.setPipeline(pipelines.transferToGrid); particles();
    pass.setPipeline(pipelines.markCells); particles();
    pass.setPipeline(pipelines.normalizeGrid); nodes();
    pass.setPipeline(pipelines.mirrorPhantomFacesBoth); nodes();
    pass.setPipeline(pipelines.addGravity); nodes();
    pass.setPipeline(pipelines.enforceBoundary); nodes();
    pass.setPipeline(pipelines.computeDivergence); cells();
    for (let iteration = 0; iteration < pressureIterations; iteration++) {
      pass.setPipeline(pipelines.pressureRed); cells();
      pass.setPipeline(pipelines.pressureBlack); cells();
    }
    pass.setPipeline(pipelines.applyPressure); nodes();
    pass.setPipeline(pipelines.enforceBoundary); nodes();
    pass.setPipeline(pipelines.mirrorPhantomFacesNow); nodes();
    if (measureResidual) { pass.setPipeline(pipelines.computeResidual); cells(); }
    pass.setPipeline(pipelines.gridToParticle); particles();
    pass.setPipeline(pipelines.advect); particles();
  }

  /** Copy the statistics out; call after the compute pass of the frame has ended. */
  encodeStatsCopy(encoder) {
    encoder.copyBufferToBuffer(this.statsBuffer, 0, this.statsReadback, 0, 16);
  }

  /** Resolve after the frame's commands ran: { maxSpeed, meanSpeed, residual } with residual in 1/s. */
  async readStats() {
    await this.statsReadback.mapAsync(GPUMapMode.READ);
    const bytes = this.statsReadback.getMappedRange().slice(0);
    this.statsReadback.unmap();
    const floats = new Float32Array(bytes);
    const uints = new Uint32Array(bytes);
    const substepsSeen = Math.max(this.substepsThisFrame, 1);
    return {
      maxSpeed: Math.sqrt(floats[0]),
      residual: floats[1],
      meanSpeed: uints[2] / 100 / Math.max(this.particleCount, 1) / substepsSeen,
      aboveSurface: uints[3] / substepsSeen,
    };
  }

  /** Debug: copy the grid velocities (vec4 per node) and cell markers back to the CPU. */
  async readGrid() {
    const [countX, countY, countZ] = this.cellCount;
    const nodeBytes = (countX + 1) * (countY + 1) * (countZ + 1) * 16;
    const cellBytes = this.cellTotal * 8;
    const staging = this.device.createBuffer({ size: nodeBytes + cellBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.gridVelocityBuffer, 0, staging, 0, nodeBytes);
    encoder.copyBufferToBuffer(this.cellBuffer, 0, staging, nodeBytes, cellBytes);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const bytes = staging.getMappedRange().slice(0);
    staging.unmap();
    staging.destroy();
    return {
      velocities: new Float32Array(bytes, 0, nodeBytes / 4),
      markers: new Uint32Array(bytes, nodeBytes, this.cellTotal * 2),
      cellCount: this.cellCount,
    };
  }

  /** Debug: copy all particle positions and velocities back to the CPU. */
  async readParticles() {
    const bytes = this.particleCount * 16;
    const staging = this.device.createBuffer({ size: bytes * 2, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.positionBuffer, 0, staging, 0, bytes);
    encoder.copyBufferToBuffer(this.velocityBuffer, 0, staging, bytes, bytes);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    return { positions: data.subarray(0, this.particleCount * 4), velocities: data.subarray(this.particleCount * 4) };
  }
}
