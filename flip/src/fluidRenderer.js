// Draws the FLIP experiment with raw WebGPU: a ray-cast backdrop with the
// stone, then the particles as a screen-space fluid (depth, blur, thickness,
// composite). The shaders are in shaders/render.wgsl.js, which lists the
// passes. Textures are recreated on resize.
import { SCENE_SHADER, PARTICLE_SHADER, BLUR_SHADER, COMPOSITE_SHADER } from './shaders/render.wgsl.js';

const UNIFORM_BYTES = 304;

export class FluidRenderer {
  constructor(device, { outputFormat }) {
    this.device = device;
    this.outputFormat = outputFormat;
    this.uniformBuffer = device.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uniformData = new ArrayBuffer(UNIFORM_BYTES);
    this.width = 0;
    this.height = 0;

    const uniformLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.uniformBindGroup = device.createBindGroup({ layout: uniformLayout, entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }] });

    const particleLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    this.particleLayout = particleLayout;
    const depthTextureLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }],
    });
    this.depthTextureLayout = depthTextureLayout;
    const compositeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this.compositeLayout = compositeLayout;
    this.linearSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    const sceneModule = device.createShaderModule({ code: SCENE_SHADER });
    const particleModule = device.createShaderModule({ code: PARTICLE_SHADER });
    const blurModule = device.createShaderModule({ code: BLUR_SHADER });
    const compositeModule = device.createShaderModule({ code: COMPOSITE_SHADER });
    const fullscreen = (module) => ({ module, entryPoint: 'fullscreenVertex' });

    this.scenePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout] }),
      vertex: fullscreen(sceneModule),
      fragment: { module: sceneModule, entryPoint: 'sceneFragment', targets: [{ format: 'rgba16float' }, { format: 'r32float' }] },
      primitive: { topology: 'triangle-list' },
    });
    const particlePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformLayout, particleLayout] });
    this.particleDepthPipeline = device.createRenderPipeline({
      layout: particlePipelineLayout,
      vertex: { module: particleModule, entryPoint: 'particleVertex' },
      fragment: { module: particleModule, entryPoint: 'particleDepthFragment', targets: [{ format: 'r32float' }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.particleColourPipeline = device.createRenderPipeline({
      layout: particlePipelineLayout,
      vertex: { module: particleModule, entryPoint: 'particleVertex' },
      fragment: { module: particleModule, entryPoint: 'particleColourFragment', targets: [{ format: outputFormat }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.thicknessPipeline = device.createRenderPipeline({
      layout: particlePipelineLayout,
      vertex: { module: particleModule, entryPoint: 'particleVertex' },
      fragment: {
        module: particleModule, entryPoint: 'thicknessFragment',
        targets: [{ format: 'r16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.blurPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout, depthTextureLayout] }),
      vertex: fullscreen(blurModule),
      fragment: { module: blurModule, entryPoint: 'blurFragment', targets: [{ format: 'r32float' }] },
      primitive: { topology: 'triangle-list' },
    });
    this.compositePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [uniformLayout, compositeLayout] }),
      vertex: fullscreen(compositeModule),
      fragment: { module: compositeModule, entryPoint: 'compositeFragment', targets: [{ format: outputFormat }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const make = (format, label) => this.device.createTexture({
      label, size: [width, height], format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    for (const texture of this.textures ? Object.values(this.textures) : []) texture.destroy();
    this.textures = {
      sceneColour: make('rgba16float', 'scene colour'),
      sceneDepth: make('r32float', 'scene depth'),
      particleDepth: make('r32float', 'particle depth'),
      blurA: make('r32float', 'blur a'),
      blurB: make('r32float', 'blur b'),
      thickness: make('r16float', 'thickness'),
      zBuffer: make('depth24plus', 'z buffer'),
    };
    const views = {};
    for (const [name, texture] of Object.entries(this.textures)) views[name] = texture.createView();
    this.views = views;
    const depthGroup = (view) => this.device.createBindGroup({ layout: this.depthTextureLayout, entries: [{ binding: 0, resource: view }] });
    this.blurGroupFromParticles = depthGroup(views.particleDepth);
    this.blurGroupFromA = depthGroup(views.blurA);
    this.compositeGroup = this.device.createBindGroup({
      layout: this.compositeLayout,
      entries: [
        { binding: 0, resource: views.sceneColour },
        { binding: 1, resource: views.sceneDepth },
        { binding: 2, resource: views.blurB },
        { binding: 3, resource: views.thickness },
        { binding: 4, resource: this.linearSampler },
      ],
    });
  }

  particleBindGroup(positionBuffer) {
    return this.device.createBindGroup({ layout: this.particleLayout, entries: [{ binding: 0, resource: { buffer: positionBuffer } }] });
  }

  writeUniforms({ camera, particleRadius, sunDirection, blurRadius, stone, boxSize, waterLevel, thicknessScale, blurDirection, debugView = 0, sliceZ = 0, sliceHalfWidth = 1e9 }) {
    const floats = new Float32Array(this.uniformData);
    const aspect = this.width / this.height;
    const { view, projection, inverseView } = camera.matrices(aspect);
    floats.set(view, 0);
    floats.set(projection, 16);
    floats.set(inverseView, 32);
    floats.set(camera.position, 48); floats[51] = particleRadius;
    floats.set(sunDirection, 52); floats[55] = blurRadius;
    floats.set(stone ? stone.position : [0, 0, 0], 56); floats[59] = stone ? stone.radius : 0;
    floats.set(boxSize, 60); floats[63] = waterLevel;
    floats[64] = this.width; floats[65] = this.height;
    const focalY = 1 / Math.tan(camera.fov / 2);
    floats[66] = focalY / aspect; floats[67] = focalY;
    floats[68] = blurDirection[0]; floats[69] = blurDirection[1];
    floats[70] = thicknessScale; floats[71] = stone ? 1 : 0;
    floats[72] = debugView;
    floats[73] = sliceZ;
    floats[74] = sliceHalfWidth;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
  }

  /**
   * Record and submit the frame. The blur direction lives in the uniforms, so
   * the two blur passes need two uniform states: the frame goes out as two
   * command buffers with a uniform write between them. `writeUniformsFor`
   * writes the uniforms for a blur direction; `beforeLastSubmit` lets the
   * caller add a readback copy to the final command buffer.
   */
  render({ targetView, particleGroup, particleCount, writeUniformsFor, beforeLastSubmit, rawParticles = false }) {
    const views = this.views;
    const clearColour = { r: 0, g: 0, b: 0, a: 1 };
    const noDepth = { r: 1e9, g: 0, b: 0, a: 0 };

    writeUniformsFor([1, 0]);
    {
      const encoder = this.device.createCommandEncoder();
      const scene = encoder.beginRenderPass({
        colorAttachments: [
          { view: views.sceneColour, loadOp: 'clear', clearValue: clearColour, storeOp: 'store' },
          { view: views.sceneDepth, loadOp: 'clear', clearValue: noDepth, storeOp: 'store' },
        ],
      });
      scene.setPipeline(this.scenePipeline);
      scene.setBindGroup(0, this.uniformBindGroup);
      scene.draw(3);
      scene.end();

      const depth = encoder.beginRenderPass({
        colorAttachments: [{ view: views.particleDepth, loadOp: 'clear', clearValue: noDepth, storeOp: 'store' }],
        depthStencilAttachment: { view: views.zBuffer, depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'store' },
      });
      depth.setPipeline(this.particleDepthPipeline);
      depth.setBindGroup(0, this.uniformBindGroup);
      depth.setBindGroup(1, particleGroup);
      depth.draw(6, particleCount);
      depth.end();

      const thickness = encoder.beginRenderPass({
        colorAttachments: [{ view: views.thickness, loadOp: 'clear', clearValue: clearColour, storeOp: 'store' }],
      });
      thickness.setPipeline(this.thicknessPipeline);
      thickness.setBindGroup(0, this.uniformBindGroup);
      thickness.setBindGroup(1, particleGroup);
      thickness.draw(6, particleCount);
      thickness.end();

      const blurHorizontal = encoder.beginRenderPass({
        colorAttachments: [{ view: views.blurA, loadOp: 'clear', clearValue: noDepth, storeOp: 'store' }],
      });
      blurHorizontal.setPipeline(this.blurPipeline);
      blurHorizontal.setBindGroup(0, this.uniformBindGroup);
      blurHorizontal.setBindGroup(1, this.blurGroupFromParticles);
      blurHorizontal.draw(3);
      blurHorizontal.end();
      this.device.queue.submit([encoder.finish()]);
    }

    writeUniformsFor([0, 1]);
    {
      const encoder = this.device.createCommandEncoder();
      const blurVertical = encoder.beginRenderPass({
        colorAttachments: [{ view: views.blurB, loadOp: 'clear', clearValue: noDepth, storeOp: 'store' }],
      });
      blurVertical.setPipeline(this.blurPipeline);
      blurVertical.setBindGroup(0, this.uniformBindGroup);
      blurVertical.setBindGroup(1, this.blurGroupFromA);
      blurVertical.draw(3);
      blurVertical.end();

      const composite = encoder.beginRenderPass({
        colorAttachments: [{ view: targetView, loadOp: 'clear', clearValue: clearColour, storeOp: 'store' }],
      });
      composite.setPipeline(this.compositePipeline);
      composite.setBindGroup(0, this.uniformBindGroup);
      composite.setBindGroup(1, this.compositeGroup);
      composite.draw(3);
      composite.end();
      if (rawParticles) {
        const particles = encoder.beginRenderPass({
          colorAttachments: [{ view: targetView, loadOp: 'load', storeOp: 'store' }],
          depthStencilAttachment: { view: views.zBuffer, depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'store' },
        });
        particles.setPipeline(this.particleColourPipeline);
        particles.setBindGroup(0, this.uniformBindGroup);
        particles.setBindGroup(1, particleGroup);
        particles.draw(6, particleCount);
        particles.end();
      }
      beforeLastSubmit?.(encoder);
      this.device.queue.submit([encoder.finish()]);
    }
  }
}
