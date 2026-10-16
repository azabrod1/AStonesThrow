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
// elevation above the pivot's level. clampOrbit keeps the eye's height
// between what `bounds` allows where it stands (lowestAt and highestAt, of
// its x and z: above the water at least LOWEST_EYE over the ground or the
// still water, so a wave never crosses it; under it, between the bed and
// the surface, src/main.js) and the elevation within HIGHEST_ELEVATION of
// level (straight down or up, the yaw would be undefined).
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

/** Over still water and no ground: the eye LOWEST_EYE above the water at least. */
export const ABOVE_WATER = { lowestAt: () => LOWEST_EYE, highestAt: () => Infinity };

/**
 * The elevation that puts the eye at heightAt(x, z) where it then stands;
 * that place depends on the elevation, so it is found in a few passes (the
 * ground changes gently, so they settle at once).
 */
function elevationAtHeight(orbit, heightAt) {
  let elevation = orbit.elevation;
  for (let pass = 0; pass < 3; pass++) {
    const eye = orbitEye({ ...orbit, elevation });
    elevation = Math.asin(clamp((heightAt(eye.x, eye.z) - orbit.pivotY) / orbit.distance, -1, 1));
  }
  return elevation;
}

/** The orbit with its eye kept within `bounds` (the header) and HIGHEST_ELEVATION of level, its azimuth wrapped. */
export function clampOrbit(orbit, bounds = ABOVE_WATER) {
  const highest = Math.min(elevationAtHeight(orbit, bounds.highestAt), HIGHEST_ELEVATION);
  const lowest = Math.min(Math.max(elevationAtHeight(orbit, bounds.lowestAt), -HIGHEST_ELEVATION), highest);
  return { ...orbit, azimuth: wrapAngle(orbit.azimuth), elevation: clamp(orbit.elevation, lowest, highest) };
}

/**
 * The orbit turned by a drag of (dragX, dragY) pixels, `radiansPerPixel`
 * each way: what is under the finger follows it, so a drag to the right
 * walks the eye to the left about the pivot and a drag down raises it.
 */
export function turnOrbit(orbit, dragX, dragY, radiansPerPixel, bounds = ABOVE_WATER) {
  return clampOrbit({ ...orbit, azimuth: orbit.azimuth - dragX * radiansPerPixel, elevation: orbit.elevation + dragY * radiansPerPixel }, bounds);
}

/**
 * The orbit `share` (0 to 1) of the way from one to the other, the azimuth
 * the short way round, kept within `bounds`; none (null) for a glide that
 * crosses the surface, between two orbits that each keep to their own side.
 */
export function blendOrbits(from, to, share, bounds = ABOVE_WATER) {
  const mix = (start, end) => start + (end - start) * share;
  const blended = {
    pivotX: mix(from.pivotX, to.pivotX),
    pivotY: mix(from.pivotY, to.pivotY),
    pivotZ: mix(from.pivotZ, to.pivotZ),
    azimuth: from.azimuth + wrapAngle(to.azimuth - from.azimuth) * share,
    elevation: mix(from.elevation, to.elevation),
    distance: mix(from.distance, to.distance),
  };
  return bounds ? clampOrbit(blended, bounds) : { ...blended, azimuth: wrapAngle(blended.azimuth) };
}

/** Whether two orbits put the eye in the same place facing the same way. */
export function orbitsMatch(first, second, tolerance = 1e-6) {
  return Math.abs(first.pivotX - second.pivotX) < tolerance && Math.abs(first.pivotY - second.pivotY) < tolerance && Math.abs(first.pivotZ - second.pivotZ) < tolerance
    && Math.abs(wrapAngle(first.azimuth - second.azimuth)) < tolerance && Math.abs(first.elevation - second.elevation) < tolerance && Math.abs(first.distance - second.distance) < tolerance;
}
