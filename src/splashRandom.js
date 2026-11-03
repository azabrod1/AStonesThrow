// The splash's own chance: what its drops, bubbles, knocks and foam draw as
// it plays (src/splash.js, src/crown.js) comes from this stream, never
// Math.random, and so do the Three.js ids of what it makes as it plays
// (asSplash). A splash is played frame by frame, so how many draws it makes
// depends on the frame rate; drawn from Math.random they would move every
// draw after them, a later throw's seed among them (src/rock.js `random`),
// and a seeded game would go otherwise at 120 frames a second than at 60.
// Each impact reseeds it from its throw's own seed (Splash.impact), so a
// seeded throw's splash plays as it did, frame for frame.
import { seededRandom } from './spray.js';
import { withRandom } from './withRandom.js';

const FIRST_SEED = 0x5b1a5;
let stream = seededRandom(FIRST_SEED);

/** A draw in [0, 1) from the splash's stream. */
export function splashRandom() {
  return stream();
}

/** Start the stream afresh from `values` (an impact's seed, a skip's touch), or as it first started (a splash new or cleared). */
export function reseedSplashRandom(...values) {
  stream = seededRandom(...(values.length ? values : [FIRST_SEED]));
}

/**
 * `work()` with Math.random the splash's stream: Three.js draws every
 * object's id from Math.random, and what the splash makes as it plays (a
 * landing drop's crown, its sheet and mesh) is made when a frame reaches it.
 */
export function asSplash(work) {
  return withRandom(splashRandom, work);
}
