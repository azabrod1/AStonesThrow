// The place's gravity: what everything that falls, flies, sinks or rings
// at the pond is pulled down by (m/s²).
//
// A place may name its own (`gravity` in src/places.js PLACES: Europa's
// 1.315); every other place has Earth's, EARTH_GRAVITY. src/main.js
// applyPlace puts it in force with setGravity, between physics steps and
// with the pond cleared (clearPond) when it changes, so no throw, ring or
// floater lives under two gravities and none changes in a step.
//
// It is one live binding: a module that pulls things down imports GRAVITY
// (ES modules' imports follow the export, so each reads the place's at the
// moment it computes) and a shader takes `uGravity`, the one uniform
// object every program that needs it shares (gravityUniform), so a change
// reaches them all at once and compiles nothing. At Earth's every number is
// the one it always was: GRAVITY is 9.81 exactly, as each module's own
// constant was, and the uniform holds the float the shaders' literal did.
//
// What follows it: the throw's flight and its aim (src/main.js
// throwVelocity, src/rock.js), the stone's flight, skips, sinking and
// flotation (src/rock.js), the splash's crown, cavity, jet and spray
// (src/crown.js, src/cavity.js, src/splash.js, src/jet.js and its solver,
// src/spray.js and the spray's shader, src/shaders/fluid.js), the rings and
// the solver's dispersion (src/rings.js, src/shaders/spectral.js), the
// wind's ripples (src/ambientWaves.js; an airless place holds its wind
// calm: src/places.js placeAirless),
// the ice's flotation and its holes' rims (src/ice.js), the fish's view of
// what falls (src/fish.js), the birds' (src/birds.js), the water cannon and
// its churn (src/waterCannon.js, src/shaders/whiteWater.js). The air is
// still Earth's everywhere (the drag on what flies: src/rock.js, src/spray.js,
// src/splash.js), Europa's too. What keeps
// Earth's, EARTH_GRAVITY by name: what only wind and weather make (the
// gale's sea, src/galeWaves.js, and the rain's splashes and rings,
// src/shaders/rain.js and assets/rain/), which only air brings, and the
// Loch Ness visitor (src/lochVisitor.js), which is the loch's alone.
export const EARTH_GRAVITY = 9.81;
export let GRAVITY = EARTH_GRAVITY;
/** The shaders' `uGravity` (the header): one object, shared by every material that takes it. */
export const gravityUniform = { value: EARTH_GRAVITY };

/** Puts `value` (m/s²) in force everywhere (the header): only between physics steps, with nothing in flight. */
export function setGravity(value = EARTH_GRAVITY) {
  if (!(value > 0)) throw new Error(`gravity must be positive, not ${value}`);
  GRAVITY = value;
  gravityUniform.value = value;
}
