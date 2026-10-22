// What the water does under each floater, read back from the GPU for the
// physics: the water's ripples, wind waves and rings are the GPU's (the
// solver, src/spectralWater.js; the rings, src/rings.js), and a floater is
// drawn riding them (src/rock.js rideTheWater, FLOATER_WATER), while the
// physics floats it on still water. Things meeting it (src/collide.js) meet
// it where it is drawn: its `rideHeight`, the water's height at its middle
// as FLOATER_WATER has it, is read here.
//
// Each frame with floaters on the water, a pass draws one texel a floater
// (at most MAX_FLOATERS), the water's height at its middle packed into two
// bytes (HEIGHT_RANGE either way, to 1/65535 of it: about 0.015 mm), and
// reads them back without waiting (WebGLRenderer.readRenderTargetPixelsAsync:
// a fence, polled), a frame or two later; while one read is out no other is
// asked for. So nothing stalls the frame, and the height a knock sees is at
// most a few frames old, the slow part of the water's motion, which is all a
// floater's centre follows. A browser that cannot read back keeps every
// floater on the still water (rideHeight 0), as the physics always had it.
// The pass's program is compiled under the loading veil (src/main.js warmUp).
import * as THREE from 'three';
import { FullscreenPass } from './gpu.js';
import { FLOATER_WATER } from './shaders/scene.js';

export const MAX_FLOATERS = 32;   // the most floaters any preset keeps (src/main.js QUALITY: afloat and the ice's shards)
const HEIGHT_RANGE = 0.5;   // m: heights from −this to +this

const RIDE_FRAGMENT = /* glsl */`
${FLOATER_WATER}
uniform vec2 uPoints[${MAX_FLOATERS}];
void main() {
  int index = int(gl_FragCoord.x);
  float height = clamp(floaterWaterHeight(uPoints[index]) / ${(2 * HEIGHT_RANGE).toFixed(3)} + 0.5, 0.0, 1.0);
  float packed = floor(height * 65535.0 + 0.5);
  float high = floor(packed / 256.0);
  gl_FragColor = vec4(high / 255.0, (packed - high * 256.0) / 255.0, 0.0, 1.0);
}
`;

/** The floaters' ride, read back (the header); `water` is the water's ride uniforms (src/waterSurface.js rideUniforms). */
export function createFloaterRide(water) {
  const target = new THREE.WebGLRenderTarget(MAX_FLOATERS, 1, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
  target.texture.generateMipmaps = false;
  const points = Array.from({ length: MAX_FLOATERS }, () => new THREE.Vector2());
  const pass = new FullscreenPass(RIDE_FRAGMENT, { ...water, uPoints: { value: points } });
  const pixels = new Uint8Array(MAX_FLOATERS * 4);
  let reading = null;     // the floaters of the read that is out
  let working = true;     // false once a read has failed: every floater stays on the still water
  let reads = 0, requests = 0;

  return {
    /** Each floater riding the water gets its rideHeight from the last read; a new read is asked for if none is out. */
    update(renderer, floaters) {
      if (!working || reading) return;
      const riding = floaters.slice(0, MAX_FLOATERS);
      for (const floater of floaters) if (!riding.includes(floater)) floater.rideHeight = 0;
      if (riding.length === 0) return;
      riding.forEach((floater, index) => points[index].set(floater.meshAbove.position.x, floater.meshAbove.position.z));
      const before = renderer.getRenderTarget();
      pass.render(renderer, target);
      renderer.setRenderTarget(before);
      reading = riding;
      requests++;
      let asked;
      try { asked = renderer.readRenderTargetPixelsAsync(target, 0, 0, MAX_FLOATERS, 1, pixels); } catch { asked = null; }
      if (!asked) { working = false; reading = null; return; }
      // Three leaves its pixel buffer bound while it waits, which would fail any other readPixels meanwhile (as src/spectralWater.js's).
      const gl = renderer.getContext();
      if (gl.PIXEL_PACK_BUFFER) gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      asked.then(() => {
        reading.forEach((floater, index) => {
          const packed = pixels[index * 4] * 256 + pixels[index * 4 + 1];
          floater.rideHeight = (packed / 65535 - 0.5) * 2 * HEIGHT_RANGE;
        });
        reads++;
        reading = null;
      }, () => { working = false; reading = null; });
    },
    /** Draw the pass once (src/main.js warmUp: its program under the veil). */
    warmUp(renderer) {
      const before = renderer.getRenderTarget();
      pass.render(renderer, target);
      renderer.setRenderTarget(before);
    },
    /** How many reads have come back, and whether reading works here (tools/quality-probe.mjs). */
    get reads() { return reads; },
    get requests() { return requests; },
    get working() { return working; },
  };
}
