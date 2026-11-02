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
// floater's centre follows. While nothing can meet a floater (`quiet`:
// everything at rest, nothing held or touched, src/main.js render) the
// height is only wanted for a tap picking one up where it is drawn
// (src/objectGrab.js), so a read is asked for every QUIET_EVERY frames
// instead of every frame: a pass, a fence and its polling a frame is what a
// dozen resting floaters would otherwise cost a phone for as long as they
// float. The first frame something moves reads at once.
// A browser that cannot read back keeps every floater on the still water
// (rideHeight 0), as the physics always had it.
//
// The ride as drawn (`place`, `values`). A floater is drawn lifted by the
// water's height under its middle and turned to the water's slope across its
// width (src/rock.js rideTheWater): five of the water's heights, the same for
// every corner of it, and each sums the solver, the wind's waves and every
// live ring. Its vertex shader once worked them out at every corner, in each
// of its three passes (above the water, under it, in the mirror): a bouquet
// of roses, 23 000 triangles, eight afloat took an M5 Max's GPU from 0.65 ms
// a frame to 6.4, a phone's to some 40 ms. So once a frame, before the first
// pass that draws a floater (src/main.js render), `place` draws one point a
// floater riding the water into `values` (MAX_FLOATERS × 1, full floats), its
// vertex shader working out the five heights as the floater's did, from the
// same model matrix (its translation and its first column, as attributes)
// and the same uniforms, in the same stage (a fragment shader would pick the
// wind's mip by its neighbours'), and each floater's vertex shader reads its
// texel (its `rideIndex`): the water's height under its middle, and its slope
// across its width before its `ride` share. Its corners then cost what any
// thing's do. Past MAX_FLOATERS, or where full-float targets cannot be drawn
// (half floats would round the height), a floater's index is −1 and it works
// them out itself, as before.
// The passes' programs are compiled under the loading veil (src/main.js warmUp).
import * as THREE from 'three';
import { createFloatTarget, FullscreenPass } from './gpu.js';
import { FLOATER_WATER } from './shaders/scene.js';

export const MAX_FLOATERS = 56;   // the most floaters any preset keeps (src/main.js QUALITY: afloat and the ice's shards, High's 32 + 24)
const QUIET_EVERY = 6;            // frames between reads while nothing can meet a floater (the header): 10 a second at 60
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

// The ride as drawn (the header): one point a floater, at its slot's texel. `position` is its middle's x and z
// (its model matrix's translation) and its slot; `column` its model matrix's first column, whose length is its width
// across. What it writes is what src/rock.js rideTheWater's vertex shader worked out from the same: the water's
// height under its middle, and its slope across its width (x, z).
const VALUES_VERTEX = /* glsl */`
${FLOATER_WATER}
attribute vec3 column;
varying vec4 vValue;
void main() {
  vec2 middle = position.xy;
  float across = length(column);
  vec2 slope = vec2(
    floaterWaterHeight(middle + vec2(across, 0.0)) - floaterWaterHeight(middle - vec2(across, 0.0)),
    floaterWaterHeight(middle + vec2(0.0, across)) - floaterWaterHeight(middle - vec2(0.0, across))) / (2.0 * across);
  vValue = vec4(floaterWaterHeight(middle), slope, 1.0);
  gl_Position = vec4((position.z + 0.5) / ${MAX_FLOATERS}.0 * 2.0 - 1.0, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;
const VALUES_FRAGMENT = /* glsl */`
varying vec4 vValue;
void main() { gl_FragColor = vValue; }
`;

/** The floaters' ride, read back and as drawn (the header); `water` is the water's ride uniforms (src/waterSurface.js rideUniforms). */
export function createFloaterRide(water) {
  const target = new THREE.WebGLRenderTarget(MAX_FLOATERS, 1, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
  target.texture.generateMipmaps = false;
  const points = Array.from({ length: MAX_FLOATERS }, () => new THREE.Vector2());
  const pass = new FullscreenPass(RIDE_FRAGMENT, { ...water, uPoints: { value: points } });
  const pixels = new Uint8Array(MAX_FLOATERS * 4);
  let reading = null;     // the floaters of the read that is out
  let working = true;     // false once a read has failed: every floater stays on the still water
  let reads = 0, requests = 0;
  let quietFrames = 0;    // frames since the last read was asked for, while quiet

  // The ride as drawn (the header): its target, its points and their pass.
  const valuesTarget = createFloatTarget(MAX_FLOATERS, 1, { type: THREE.FloatType });
  const exact = valuesTarget.texture.type === THREE.FloatType;   // half floats would round the height: each floater works its own out
  const values = { value: valuesTarget.texture };
  const places = new Float32Array(MAX_FLOATERS * 3), columns = new Float32Array(MAX_FLOATERS * 3);
  const valuesGeometry = new THREE.BufferGeometry();
  valuesGeometry.setAttribute('position', new THREE.BufferAttribute(places, 3).setUsage(THREE.DynamicDrawUsage));
  valuesGeometry.setAttribute('column', new THREE.BufferAttribute(columns, 3).setUsage(THREE.DynamicDrawUsage));
  const valuesPoints = new THREE.Points(valuesGeometry, new THREE.ShaderMaterial({
    vertexShader: VALUES_VERTEX, fragmentShader: VALUES_FRAGMENT, uniforms: { ...water },
    blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  }));
  valuesPoints.frustumCulled = false;
  const valuesScene = new THREE.Scene();
  valuesScene.add(valuesPoints);
  const valuesCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const drawValues = (renderer, count) => {
    valuesGeometry.setDrawRange(0, count);
    valuesGeometry.attributes.position.needsUpdate = true;
    valuesGeometry.attributes.column.needsUpdate = true;
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(valuesTarget);
    renderer.render(valuesScene, valuesCamera);
    renderer.setRenderTarget(before);
  };

  return {
    /** The ride as drawn, each floater's texel (the header): src/rock.js rideTheWater's `uRideValues`. */
    values,
    /**
     * The ride as drawn (the header), once a frame before the first pass that draws a floater: each of `things` riding
     * the water gets a slot (its `rideIndex`) and its texel in `values`; anything else, or past MAX_FLOATERS, −1.
     */
    place(renderer, things) {
      let count = 0;
      for (const thing of things) {
        if (!thing.rideIndex) continue;
        if (!exact || !(thing.rideShare.value > 0) || count >= MAX_FLOATERS) { thing.rideIndex.value = -1; continue; }
        // Its model matrix as the renderer will make it (its meshes all stand where its meshAbove does: syncMeshes, drawAt).
        const mesh = thing.meshAbove;
        mesh.updateMatrixWorld();
        const matrix = mesh.matrixWorld.elements;
        places[count * 3] = matrix[12]; places[count * 3 + 1] = matrix[14]; places[count * 3 + 2] = count;
        columns[count * 3] = matrix[0]; columns[count * 3 + 1] = matrix[1]; columns[count * 3 + 2] = matrix[2];
        thing.rideIndex.value = count++;
      }
      if (count > 0) drawValues(renderer, count);
    },
    /**
     * Each floater riding the water gets its rideHeight from the last read; a new read is asked for if none is out,
     * and, `quiet` (the header: nothing can meet a floater this frame), only every QUIET_EVERY frames.
     */
    update(renderer, floaters, quiet = false) {
      if (!working || reading) return;
      if (quiet && ++quietFrames < QUIET_EVERY) return;
      quietFrames = 0;
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
      // And the ride as drawn: one point, a still floater 10 cm wide at the middle of the pond (slot 0 is drawn over
      // the first frame a floater rides).
      places.set([0, 0, 0]); columns.set([0.1, 0, 0]);
      drawValues(renderer, 1);
    },
    /** How many reads have come back, and whether reading works here (tools/quality-probe.mjs). */
    get reads() { return reads; },
    get requests() { return requests; },
    get working() { return working; },
  };
}
