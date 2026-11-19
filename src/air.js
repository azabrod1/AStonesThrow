// The place's air: how dense it is (kg/m³), for what flies through it at
// the pond: the drag on a thrown thing (src/rock.js), on the spray's drops
// (src/spray.js and its shader) and the tearing of a big drop (src/splash.js).
//
// Every place has Earth's sea-level air, EARTH_AIR, but one that is airless
// (src/places.js placeAirless: Europa). Europa's atmosphere is a trace of
// oxygen knocked off its ice (Hall et al. 1995 found its glow with Hubble),
// about 0.1 µPa at the surface, a trillionth of Earth's: nothing flies
// through it but as through vacuum, so its density here is 0. That also
// means no air for a stone to drag under the water, so a splash there
// leaves no foam and no bubbles (src/splash.js setAirless), and that open
// water boils (src/boiling.js): 0.1 µPa is far under water's triple point,
// 611 Pa.
//
// As src/gravity.js's GRAVITY, AIR_DENSITY is one live binding: a module
// imports it and reads the place's at the moment it computes. src/main.js
// applyPlace puts it in force with setAirDensity, between physics steps and
// with the pond cleared, so nothing in flight lives under two airs. At
// Earth's every number is the one it always was.
export const EARTH_AIR = 1.2;   // kg/m³: sea-level air, each module's constant before this one
export let AIR_DENSITY = EARTH_AIR;

/** Puts `density` (kg/m³) in force everywhere (the header): only between physics steps, with nothing in flight. */
export function setAirDensity(density = EARTH_AIR) {
  if (!(density >= 0)) throw new Error(`air density must be 0 or more, not ${density}`);
  AIR_DENSITY = density;
}
