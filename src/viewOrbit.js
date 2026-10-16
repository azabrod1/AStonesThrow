// Where the pond's camera stands: on a sphere about a pivot, the orbit.
// Unzoomed, the camera faces the pivot (orbitFacing); src/viewZoom.js then
// turns and narrows it from there. A one-finger or mouse drag turns the
// orbit about the pivot (turnOrbit), the View setting's choices and Reset
// view glide it to another orbit (blendOrbits), and src/main.js says the rest.
//
// An orbit is { pivotX, pivotY, pivotZ, azimuth, elevation, distance }:
// metres, radians, radians, metres. The eye stands at the pivot plus
// distance · (sin a·cos e, sin e, cos a·cos e): azimuth 0 on the +Z side of
// the pivot (the bank the shore view stands on), growing toward +X, and the
// elevation above the pivot's level. clampOrbit keeps the eye at least
// LOWEST_EYE above the ground under it (`groundAt`, the beach's height, or
// the still water's, 0: a wave must never cross it) and the elevation under
// HIGHEST_ELEVATION (straight down, the yaw would be undefined).
//
// Pure math with no Three.js, so tools can check it in Node.
import { viewFacing } from './viewZoom.js';

export const LOWEST_EYE = 0.1;                          // metres above the still water
export const HIGHEST_ELEVATION = 80 * Math.PI / 180;    // radians

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The eye of an orbit, in world coordinates. */
export function orbitEye(orbit) {
  const across = orbit.distance * Math.cos(orbit.elevation);
  return {
    x: orbit.pivotX + across * Math.sin(orbit.azimuth),
    y: orbit.pivotY + orbit.distance * Math.sin(orbit.elevation),
    z: orbit.pivotZ + across * Math.cos(orbit.azimuth),
  };
}

/** The yaw and pitch (src/viewZoom.js) that look from the eye at the pivot. */
export function orbitFacing(orbit) {
  const eye = orbitEye(orbit);
  return viewFacing(orbit.pivotX - eye.x, orbit.pivotY - eye.y, orbit.pivotZ - eye.z);
}

/** The orbit that puts the eye at `eye` about `pivot` (both { x, y, z }). */
export function orbitAbout(eye, pivot) {
  const offsetX = eye.x - pivot.x, offsetY = eye.y - pivot.y, offsetZ = eye.z - pivot.z;
  const distance = Math.max(Math.hypot(offsetX, offsetY, offsetZ), 1e-6);
  return {
    pivotX: pivot.x, pivotY: pivot.y, pivotZ: pivot.z,
    azimuth: Math.atan2(offsetX, offsetZ),
    elevation: Math.asin(clamp(offsetY / distance, -1, 1)),
    distance,
  };
}

const flatWater = () => 0;

/**
 * The lowest elevation that keeps the eye LOWEST_EYE above the ground under
 * it; the ground is under the eye at that elevation, so it is found in a few
 * passes (the beach rises gently, so they settle at once).
 */
export function lowestElevation(orbit, groundAt = flatWater) {
  let elevation = orbit.elevation;
  for (let pass = 0; pass < 3; pass++) {
    const eye = orbitEye({ ...orbit, elevation });
    elevation = Math.asin(clamp((LOWEST_EYE + groundAt(eye.x, eye.z) - orbit.pivotY) / orbit.distance, -1, 1));
  }
  return elevation;
}

/** The orbit with its elevation kept between lowestElevation and HIGHEST_ELEVATION, its azimuth wrapped. */
export function clampOrbit(orbit, groundAt = flatWater) {
  return {
    ...orbit,
    azimuth: wrapAngle(orbit.azimuth),
    elevation: clamp(orbit.elevation, Math.min(lowestElevation(orbit, groundAt), HIGHEST_ELEVATION), HIGHEST_ELEVATION),
  };
}

/**
 * The orbit turned by a drag of (dragX, dragY) pixels, `radiansPerPixel`
 * each way: what is under the finger follows it, so a drag to the right
 * walks the eye to the left about the pivot and a drag down raises it.
 */
export function turnOrbit(orbit, dragX, dragY, radiansPerPixel, groundAt = flatWater) {
  return clampOrbit({ ...orbit, azimuth: orbit.azimuth - dragX * radiansPerPixel, elevation: orbit.elevation + dragY * radiansPerPixel }, groundAt);
}

/** The orbit `share` (0 to 1) of the way from one to the other, the azimuth the short way round. */
export function blendOrbits(from, to, share, groundAt = flatWater) {
  const mix = (start, end) => start + (end - start) * share;
  return clampOrbit({
    pivotX: mix(from.pivotX, to.pivotX),
    pivotY: mix(from.pivotY, to.pivotY),
    pivotZ: mix(from.pivotZ, to.pivotZ),
    azimuth: from.azimuth + wrapAngle(to.azimuth - from.azimuth) * share,
    elevation: mix(from.elevation, to.elevation),
    distance: mix(from.distance, to.distance),
  }, groundAt);
}

/** Whether two orbits put the eye in the same place facing the same way. */
export function orbitsMatch(first, second, tolerance = 1e-6) {
  return Math.abs(first.pivotX - second.pivotX) < tolerance && Math.abs(first.pivotY - second.pivotY) < tolerance && Math.abs(first.pivotZ - second.pivotZ) < tolerance
    && Math.abs(wrapAngle(first.azimuth - second.azimuth)) < tolerance && Math.abs(first.elevation - second.elevation) < tolerance && Math.abs(first.distance - second.distance) < tolerance;
}
