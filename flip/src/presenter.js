// Where the final image goes. Normally the WebGPU canvas. With readback the
// frame is rendered into a texture, copied to a buffer and painted onto a 2D
// canvas, which is how the headless harness captures WebGPU frames in the
// cloud container, where presenting a WebGPU canvas fails.

export function createPresenter(device, canvas, { readback }) {
  if (!readback) {
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    return {
      format,
      readback: false,
      resize(width, height) { canvas.width = width; canvas.height = height; },
      targetView() { return context.getCurrentTexture().createView(); },
      encodeCopy() {},
      async present() {},
    };
  }

  const context2d = canvas.getContext('2d');
  const format = 'rgba8unorm';
  let texture = null;
  let buffer = null;
  let bytesPerRow = 0;
  let width = 0;
  let height = 0;
  return {
    format,
    readback: true,
    resize(newWidth, newHeight) {
      width = newWidth;
      height = newHeight;
      canvas.width = width;
      canvas.height = height;
      texture?.destroy();
      buffer?.destroy();
      texture = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      bytesPerRow = Math.ceil((width * 4) / 256) * 256;
      buffer = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    },
    targetView() { return texture.createView(); },
    encodeCopy(encoder) {
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height]);
    },
    async present() {
      await buffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(buffer.getMappedRange());
      const image = context2d.createImageData(width, height);
      for (let row = 0; row < height; row++) {
        image.data.set(mapped.subarray(row * bytesPerRow, row * bytesPerRow + width * 4), row * width * 4);
      }
      buffer.unmap();
      context2d.putImageData(image, 0, 0);
    },
  };
}
