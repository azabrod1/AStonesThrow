// Zooming the pond's view: the field of view and the look direction of a
// camera that never moves (the planar reflection and the hand assume its
// position), with the horizon kept level.
//
// A view is { yaw, pitch, fov }: radians, radians and the vertical field of
// view in degrees, for a camera turned by yaw about +Y and then by pitch about
// its own X axis, which is what lookAt with up = +Y gives (Euler order 'YXZ').
// Its forward direction is (−cos p·sin y, sin p, −cos p·cos y).
//
// Zooming toward a point keeps the world direction under that point where it
// is on screen. The camera stays put, so that is the same as keeping the
// water point under the pointer there. placeDirection solves for the yaw and
// pitch that put a world direction at given normalised device coordinates
// under a given field of view, in closed form: the pitch alone sets the ray's
// height, the yaw then turns it into place. clampToFrame keeps a zoomed view
// inside the home view, in angle, so zooming out drifts back toward the home
// framing and arrives there exactly when the field of view does.
//
// Pure math with no Three.js, so tools can check it in Node.
const DEGREES = Math.PI / 180;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The yaw and pitch that look along a world direction (any length). */
export function viewFacing(directionX, directionY, directionZ) {
  const length = Math.hypot(directionX, directionY, directionZ) || 1;
  return { yaw: Math.atan2(-directionX, -directionZ), pitch: Math.asin(clamp(directionY / length, -1, 1)) };
}

/** Unit world direction through the given normalised device coordinates of a view. */
export function directionAt(view, aspect, ndcX, ndcY) {
  const tanHalf = Math.tan((view.fov * DEGREES) / 2);
  const rayX = ndcX * tanHalf * aspect;
  const rayY = ndcY * tanHalf;
  const cosPitch = Math.cos(view.pitch), sinPitch = Math.sin(view.pitch);
  // The camera-space ray (rayX, rayY, −1), turned by the pitch about X, then by the yaw about Y.
  const pitchedY = rayY * cosPitch + sinPitch;
  const pitchedZ = rayY * sinPitch - cosPitch;
  const cosYaw = Math.cos(view.yaw), sinYaw = Math.sin(view.yaw);
  const worldX = rayX * cosYaw + pitchedZ * sinYaw;
  const worldZ = -rayX * sinYaw + pitchedZ * cosYaw;
  const length = Math.hypot(worldX, pitchedY, worldZ);
  return { x: worldX / length, y: pitchedY / length, z: worldZ / length };
}

/** The yaw and pitch that put a unit world direction at the given device coordinates under field of view `fov`. */
export function placeDirection(direction, ndcX, ndcY, fov, aspect) {
  const tanHalf = Math.tan((fov * DEGREES) / 2);
  const rayX = ndcX * tanHalf * aspect;
  const rayY = ndcY * tanHalf;
  // After the pitch the ray's height is rayY·cos p + sin p = sqrt(1 + rayY²)·sin(p + atan rayY),
  // which must equal the direction's height scaled to the ray's length; the yaw leaves it alone.
  const rayLength = Math.hypot(rayX, rayY, 1);
  const pitch = Math.asin(clamp((direction.y * rayLength) / Math.hypot(1, rayY), -1, 1)) - Math.atan(rayY);
  const pitchedZ = rayY * Math.sin(pitch) - Math.cos(pitch);
  const yaw = wrapAngle(Math.atan2(direction.x, direction.z) - Math.atan2(rayX, pitchedZ));
  return { yaw, pitch };
}

/** Half the horizontal angle a view spans along its centre row. */
function halfWidth(fov, pitch, aspect) {
  return Math.atan((Math.tan((fov * DEGREES) / 2) * aspect) / Math.max(Math.cos(pitch), 0.2));
}

/** Keep a view inside the home view: its edges may not pass the home view's, in yaw and in pitch. */
export function clampToFrame(view, home, aspect) {
  const pitchRoom = Math.max(((home.fov - view.fov) * DEGREES) / 2, 0);
  const pitch = home.pitch + clamp(view.pitch - home.pitch, -pitchRoom, pitchRoom);
  const yawRoom = Math.max(halfWidth(home.fov, home.pitch, aspect) - halfWidth(view.fov, pitch, aspect), 0);
  const yaw = home.yaw + clamp(wrapAngle(view.yaw - home.yaw), -yawRoom, yawRoom);
  return { yaw, pitch, fov: view.fov };
}

/**
 * Zoom to field of view `fov` keeping what is under the device coordinates
 * there. Zooming out is also held inside the home view.
 */
export function zoomToward(view, home, aspect, ndcX, ndcY, fov) {
  const placed = placeDirection(directionAt(view, aspect, ndcX, ndcY), ndcX, ndcY, fov, aspect);
  const next = { yaw: placed.yaw, pitch: placed.pitch, fov };
  return fov > view.fov ? clampToFrame(next, home, aspect) : next;
}

/** Whether a view differs from the home view. */
export function isZoomed(view, home) {
  return Math.abs(view.fov - home.fov) > 1e-6 || Math.abs(wrapAngle(view.yaw - home.yaw)) > 1e-6 || Math.abs(view.pitch - home.pitch) > 1e-6;
}
