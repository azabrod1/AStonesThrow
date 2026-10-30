// Math.random stood in for while a piece of work runs (withRandom), and put
// back after it whatever happens. Three.js draws every object's id from
// Math.random, and so do a stone's lumps (src/thingMeshes.js
// createRockGeometry): what the page makes besides a throw (a granite on the
// shore, a ball's coarser meshes, a mirror image made on the ice, what the
// splash makes as it plays, the preview, the warm-up) draws from a stream of
// its own instead, so a seeded throw after it draws what it always drew.
// parkMiller is the stream the shoot harness and the probes seed Math.random
// with (Park–Miller), for the work that is seeded as they seed it.

/** `work()`, with Math.random `random` while it runs: what it returns. */
export function withRandom(random, work) {
  const native = Math.random;
  Math.random = random;
  try {
    return work();
  } finally {
    Math.random = native;
  }
}

/** A Park–Miller stream from `seed` (a positive integer), as tools/shoot.mjs seeds Math.random: draws in (0, 1). */
export function parkMiller(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
