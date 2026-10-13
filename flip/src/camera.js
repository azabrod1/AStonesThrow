// A fixed perspective camera and the small amount of matrix maths it needs.
// Matrices are column-major Float32Arrays, as WGSL expects; the projection
// maps depth to [0, 1] for WebGPU.

export function perspective(fovYRadians, aspect, near, far) {
  const focal = 1 / Math.tan(fovYRadians / 2);
  const matrix = new Float32Array(16);
  matrix[0] = focal / aspect;
  matrix[5] = focal;
  matrix[10] = far / (near - far);
  matrix[11] = -1;
  matrix[14] = (near * far) / (near - far);
  return matrix;
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((component) => component / length);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function lookAt(eye, target, up) {
  const backward = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const right = normalize(cross(up, backward));
  const trueUp = cross(backward, right);
  const matrix = new Float32Array(16);
  matrix[0] = right[0]; matrix[4] = right[1]; matrix[8] = right[2]; matrix[12] = -dot(right, eye);
  matrix[1] = trueUp[0]; matrix[5] = trueUp[1]; matrix[9] = trueUp[2]; matrix[13] = -dot(trueUp, eye);
  matrix[2] = backward[0]; matrix[6] = backward[1]; matrix[10] = backward[2]; matrix[14] = -dot(backward, eye);
  matrix[15] = 1;
  return matrix;
}

/** Inverse of a rigid view matrix (rotation and translation only). */
export function invertRigid(matrix) {
  const inverse = new Float32Array(16);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      inverse[column * 4 + row] = matrix[row * 4 + column];
    }
  }
  const translation = [matrix[12], matrix[13], matrix[14]];
  for (let row = 0; row < 3; row++) {
    inverse[12 + row] = -(inverse[row] * translation[0] + inverse[4 + row] * translation[1] + inverse[8 + row] * translation[2]);
  }
  inverse[15] = 1;
  return inverse;
}

export class Camera {
  constructor({ target, distance, elevationDegrees, azimuthDegrees, fovDegrees = 38, near = 0.05, far = 20 }) {
    this.target = target;
    this.distance = distance;
    this.elevation = (elevationDegrees * Math.PI) / 180;
    this.azimuth = (azimuthDegrees * Math.PI) / 180;
    this.fov = (fovDegrees * Math.PI) / 180;
    this.near = near;
    this.far = far;
  }

  get position() {
    const horizontal = Math.cos(this.elevation) * this.distance;
    return [
      this.target[0] + Math.sin(this.azimuth) * horizontal,
      this.target[1] + Math.sin(this.elevation) * this.distance,
      this.target[2] + Math.cos(this.azimuth) * horizontal,
    ];
  }

  matrices(aspect) {
    const view = lookAt(this.position, this.target, [0, 1, 0]);
    return { view, projection: perspective(this.fov, aspect, this.near, this.far), inverseView: invertRigid(view) };
  }
}
