// Lightning, in a storm (the Weather setting's Storm, src/main.js): flashes
// that light the clouds from inside, and with most of them a bolt to the
// ground, seen against the sky and in the water's mirror image.
//
// Nothing is stored: the strikes come from the clock. Time is cut into bins
// of STRIKE_BIN seconds; each bin holds a strike with STRIKE_CHANCE, at a
// hashed moment in it, so the harness renders the same storm every run and
// a strike is never missed between two frames. A strike has two to four
// return strokes STROKE_GAP apart (give or take), each a flash that rises at
// once and decays over STROKE_DECAY, then a faint afterglow over
// AFTERGLOW_DECAY; its distance, DISTANCES (km), sets how bright it is (the
// light of the cloud it fills falls with the distance squared, softened by
// the eye's adaptation to the power 1 − ADAPTATION, as the sky's hours are,
// src/sky.js) and how high its bolt reaches above the horizon (from the
// cloud base, CLOUD_BASE metres up, to the ground). Its bearing is within
// BEARING_SPREAD of the shore view's line of sight, so most strikes are seen,
// and a few show no bolt (the cloud hides it: BOLT_CHANCE).
//
// at(time) gives the sky's light (1 with no strike: the scene's sky and the
// dome are multiplied by it, src/sky.js setFlash) and the bolt (its bearing
// in radians from straight ahead, −Z, toward +X; its top's elevation; its
// brightness against the sky; a seed for its zigzag), which the dome draws
// (BOLT in src/sky.js).
const STRIKE_BIN = 7;          // seconds
const STRIKE_CHANCE = 0.75;
const STROKE_GAP = 0.09;       // seconds between return strokes
const STROKE_DECAY = 0.045;    // seconds
const AFTERGLOW_DECAY = 0.35;
const AFTERGLOW = 0.15;        // of a stroke's flash
const DISTANCES = [1.5, 6];    // km
const FLASH_AT_ONE_KM = 14;    // the sky's light added by a stroke a kilometre off, against the storm's own
const ADAPTATION = 0.75;       // as src/sky.js's
const CLOUD_BASE = 600;        // metres
const BEARING_SPREAD = 0.5;    // radians either side of straight ahead
const BOLT_CHANCE = 0.8;
const BOLT_BRIGHTNESS = 60;    // a bolt's core against the sky's mean radiance

/** A hash of a whole number and a salt, in [0, 1). */
function hash(index, salt) {
  let state = (Math.imul(index, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b) >>> 0;
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
}

/** The strike in bin `bin`, or null. */
function strikeIn(bin) {
  if (hash(bin, 0) >= STRIKE_CHANCE) return null;
  const distance = DISTANCES[0] * (DISTANCES[1] / DISTANCES[0]) ** hash(bin, 2);
  const strokes = 2 + Math.floor(3 * hash(bin, 3));
  return {
    start: (bin + 0.1 + 0.6 * hash(bin, 1)) * STRIKE_BIN,
    strokes,
    gaps: Array.from({ length: strokes }, (unused, stroke) => STROKE_GAP * (0.6 + 0.8 * hash(bin, 10 + stroke))),
    flash: FLASH_AT_ONE_KM * distance ** (-2 * (1 - ADAPTATION)),
    bearing: BEARING_SPREAD * (2 * hash(bin, 4) - 1),
    top: Math.atan2(CLOUD_BASE, distance * 1000),
    bolt: hash(bin, 5) < BOLT_CHANCE,
    seed: hash(bin, 6) * 1000,
  };
}

/** The strike's light at `since` seconds after its start: its strokes' flashes and the afterglow, against a stroke's peak. */
function strikeLight(strike, since) {
  if (since < 0) return 0;
  let light = 0, strokeStart = 0;
  for (let stroke = 0; stroke < strike.strokes; stroke++) {
    if (since >= strokeStart) light += Math.exp(-(since - strokeStart) / STROKE_DECAY) * (stroke === 0 ? 1 : 0.7);
    strokeStart += strike.gaps[stroke];
  }
  return light + AFTERGLOW * Math.exp(-since / AFTERGLOW_DECAY);
}

/**
 * The sky's light and the bolt at world time `time`: { flash (≥ 1), bolt:
 * { bearing, top, brightness, seed } (brightness 0 for none) }.
 */
export function lightningAt(time, result = { flash: 1, bolt: { bearing: 0, top: 0, brightness: 0, seed: 0 } }) {
  result.flash = 1;
  result.bolt.brightness = 0;
  const bin = Math.floor(time / STRIKE_BIN);
  for (const candidate of [bin - 1, bin]) {
    const strike = strikeIn(candidate);
    if (!strike) continue;
    const light = strikeLight(strike, time - strike.start);
    if (light < 1e-3) continue;
    result.flash += strike.flash * light;
    if (strike.bolt) {
      const brightness = BOLT_BRIGHTNESS * Math.min(light, 1);
      if (brightness > result.bolt.brightness) Object.assign(result.bolt, { bearing: strike.bearing, top: strike.top, brightness, seed: strike.seed });
    }
  }
  return result;
}
