// The warm-up's first pass (src/main.js warmUp): every render only starts
// compiling the programs it would draw, and draws nothing. Three.js builds a
// program the first time something draws with it and waits there for the
// driver, one program after another; a program started early is built on the
// driver's own threads, side by side with the others
// (KHR_parallel_shader_compile; Chrome and WebKit alike), and by the time
// it draws it is ready or nearly so. A browser keeps what it has built for
// shader text it has seen, but a deploy that changes a shader sends every
// program built from it through the driver again: on a first visit after one,
// the warm-up took 9 s with its programs built one by one on an M5 Max, and
// 2 s with them started together. What started but is never drawn under the
// veil keeps building after it lifts; drawn before it is done, it is waited
// for, as any program is at its first draw. The GPU's pipeline for a program
// is still built at that first draw (Metal builds it then, one at a time),
// which no WebGL call can start early.
//
// What a render would draw is compiled as it would be drawn: each visible
// object in the camera's layers, under the target then bound (three's program
// for a shader material differs drawn to the canvas or to a target), with the
// clipping planes its material would get, the renderer's and, with local
// clipping, its own (three's WebGLClipping setState); an empty render sets
// the plane count the program's key takes. Three's own compile(scene) takes
// every object, seen or not, and the plane count of whatever drew last: it
// built dozens of programs here that nothing drew. Objects out of the
// camera's view are compiled too (a render would cull them): a program or two
// more than the drawing builds, for a mirror image drawn later if ever.
import * as THREE from 'three';
import { withRandom, parkMiller } from './withRandom.js';

let emptyScene = null;

/** `work()` with `renderer.render` compiling what it would draw, not drawing it: what `work` returns. */
export function compileOnly(renderer, work) {
  const draw = renderer.render;
  // Its id from a stream of its own: drawn from Math.random it would move every seeded throw after it.
  emptyScene ??= withRandom(parkMiller(1), () => new THREE.Scene());
  renderer.render = (scene, camera) => compileAsDrawn(renderer, draw, scene, camera);
  try {
    return work();
  } finally {
    renderer.render = draw;
  }
}

/** The programs `draw` (the renderer's own render) would draw `scene` from `camera` with, started compiling. */
function compileAsDrawn(renderer, draw, scene, camera) {
  const global = renderer.clippingPlanes;
  let planes = -1;   // the plane count the renderer was last set to here
  scene.traverseVisible((object) => {
    if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite) || !object.material) return;
    if (!object.layers.test(camera.layers)) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const local = renderer.localClippingEnabled && material.clippingPlanes?.length ? material.clippingPlanes : [];
    if (global.length + local.length !== planes) {
      planes = global.length + local.length;
      renderer.clippingPlanes = [...global, ...local];
      try { draw.call(renderer, emptyScene, camera); } finally { renderer.clippingPlanes = global; }
    }
    // The object alone (compile takes an object's children too, seen or not): they are visited in their turn.
    const children = object.children;
    object.children = [];
    try { renderer.compile(object, camera, scene); } finally { object.children = children; }
  });
}
