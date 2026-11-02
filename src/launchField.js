// The crown's launch field: how a stone's own shape launches its sheet
// (src/crown.js evaluate).
//
// A smooth sphere throws a clean axisymmetric sheet; a thrown stone is no
// sphere. Its ejecta leaves the contact line, where its surface crosses the
// water, and leaves along that surface: Wagner's spray root. For a surface
// meeting the water at the deadrise angle β (the angle between the surface
// and the still water) and advancing into the water at the speed v_n along
// its own normal, the spray root runs at about v_n·cot β and the jet leaves
// along the surface, so a flat face entering face-on throws a fast, low,
// thick sheet and a steep face a slow, high, thin one. A stone presents
// facets at 20° and 70° within a centimetre of each other, and corners
// sweeping through the waterline, so its ejecta varies by factors around
// the ring and over the launch; the material then flies ballistically,
// separating by speed: the lopsided, folded sheet every photograph of a
// thrown stone shows, crumpled where a sphere's is a clean cylinder.
//
// The field is computed once per throw at impact, from the stone's physics
// mesh (src/thingMeshes.js createRockGeometry: 320 faces in the stone's
// frame, scaled by its radius), its orientation and its velocity at entry
// (the stone turns too little over the launch, a few milliseconds, to
// matter). At SAMPLES launch times over the main launch (0 to T, src/crown.js
// launchDuration) the stone is placed where it is then (its centre at entry
// plus the velocity times the time; drag over the launch neglected), its
// mesh is cut by the water plane, and each cut triangle's segment is binned
// by azimuth about the stone's centre into BINS bins (the outermost where a
// lump folds the outline over itself) with the surface's outward normal n
// there, the mesh's vertex normals (each corner's faces averaged)
// interpolated along the cut edges: the stone's lumps and facets, not the
// mesh's own faceting (by face normals a 320-face sphere's field wandered
// by a fifth, since cot β is steep near a flat face).
// The same is done for the sphere of the stone's radius on the same path,
// the reference the crown's launch was fitted to (src/crown.js CROWN_SPEED,
// CROWN_TILT). Then, per bin and sample, with push = max(v̂·n, 0), the
// surface's normal speed into the water over the entry speed (a receding
// face pushes nothing), and the deadrise β = acos(|n.y|), at least
// DEADRISE_LEAST (the root's speed is not infinite at a flat face: the air
// and the water's own inertia cap it) and 90° for a face leaning in over
// the water:
//   speed     ∝ push·(COT_FLOOR + cot β)   a wall at 90° throws at the body's own speed, no more
//   thickness ∝ push                       the flux the face displaces
//   tilt      = 90° − β                    the sheet leaves along the face
// each the stone's against the sphere's (speed and thickness as ratios,
// softened by SOFTENING where the sphere pushes nothing; tilt as a
// difference), then less their mean around the ring, so the field only
// redistributes what the fitted launch gives: a sphere gets 1, 1 and 0
// everywhere, and the reference throw keeps its calibrated sheet on
// average. They are clamped (SPEED_RANGE, THICKNESS_RANGE, TILT_RANGE:
// surface tension and the air smooth what a facet's edge would make a
// step) and smoothed over SMOOTH bins around and the neighbouring samples
// along the launch. A sample whose cut fills under LEAST_FILLED bins (the
// first contact, a point) is a sphere's; bins a sample misses take their
// nearest filled neighbour's. sampleLaunchField interpolates the field at
// an azimuth and a launch time (the tail, after T, takes the last sample's).
// Cost: 320 triangles × SAMPLES cuts, well under a millisecond, once a
// throw; nothing random, so a seeded throw's field is its own.

const BINS = 72;                   // azimuth bins around the stone
const SAMPLES = 7;                 // launch times over the main launch
const DEADRISE_LEAST = (20 * Math.PI) / 180;   // the deadrise angle is at least this (the header)
const COT_FLOOR = 0.35;            // a wall's root runs at this times its push (the header's speed law)
const SOFTENING = 0.05;            // added to both sides of a ratio, so a face the sphere does not push stays finite
const SPEED_RANGE = [0.35, 2.2];   // the speed ratio's bounds...
const THICKNESS_RANGE = [0.4, 2.0];   // ...the thickness ratio's...
const TILT_RANGE = [(-15 * Math.PI) / 180, (40 * Math.PI) / 180];   // ...and the tilt difference's (radians; positive is lower, further out)
const SMOOTH = [1, 2, 3, 2, 1];    // the smoothing kernel around the ring (bins)
const LEAST_FILLED = 8;            // a cut filling fewer bins than this is a point: the sphere's field

/**
 * The launch field of a throw (the header), or null when the impact carries
 * no stone mesh (a landing drop's crown, a probe's stand-in). `impact` is
 * src/rock.js's record: x, z, height (the centre's, above the water),
 * velocity, radius, rock (its physicsPositions) and spin.orientation (a
 * quaternion). launchDuration is the main launch's T.
 */
export function buildLaunchField(impact, launchDuration) {
  const positions = impact?.rock?.physicsPositions;
  const orientation = impact?.spin?.orientation;
  const velocity = impact?.velocity;
  if (!positions || positions.length < 9 || !orientation || !velocity) return null;
  const radius = impact.radius;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (!(speed > 0) || !(radius > 0)) return null;
  const directionX = velocity.x / speed, directionY = velocity.y / speed, directionZ = velocity.z / speed;

  // The mesh in the world's frame about the stone's centre: turned by the orientation, scaled by the radius; and
  // its vertex normals (the header), each corner's faces' averaged, turned the same way.
  const pointCount = positions.length / 3;
  const world = new Float64Array(pointCount * 3);
  const normals = vertexNormals(positions);
  const qx = orientation.x, qy = orientation.y, qz = orientation.z, qw = orientation.w;
  const turn = (x, y, z, out, at) => {
    // q·p·q⁻¹ as t = 2·(q × p), p' = p + w·t + q × t.
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    out[at] = x + qw * tx + (qy * tz - qz * ty);
    out[at + 1] = y + qw * ty + (qz * tx - qx * tz);
    out[at + 2] = z + qw * tz + (qx * ty - qy * tx);
  };
  for (let point = 0; point < pointCount; point++) {
    turn(positions[point * 3] * radius, positions[point * 3 + 1] * radius, positions[point * 3 + 2] * radius, world, point * 3);
    turn(normals[point * 3], normals[point * 3 + 1], normals[point * 3 + 2], normals, point * 3);
  }

  const speedField = new Float32Array(SAMPLES * BINS);
  const thicknessField = new Float32Array(SAMPLES * BINS);
  const tiltField = new Float32Array(SAMPLES * BINS);
  const binNormalX = new Float64Array(BINS), binNormalY = new Float64Array(BINS), binNormalZ = new Float64Array(BINS);
  const binReach = new Float64Array(BINS);
  const binFilled = new Uint8Array(BINS);
  const rawSpeed = new Float64Array(BINS), rawThickness = new Float64Array(BINS), rawTilt = new Float64Array(BINS);
  const corner = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const cornerNormal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const cut = [[0, 0, 0], [0, 0, 0]];
  const cutNormal = [[0, 0, 0], [0, 0, 0]];

  const binOf = (angle) => (((Math.floor((angle / (2 * Math.PI)) * BINS) % BINS) + BINS) % BINS);
  /** The root's speed and the push of a face with outward normal (nx, ny, nz) (the header), into `out`. */
  const faceLaw = (nx, ny, nz, out) => {
    const push = Math.max(directionX * nx + directionY * ny + directionZ * nz, 0);
    const deadrise = ny > 0 ? Math.PI / 2 : Math.max(Math.acos(Math.min(-ny, 1)), DEADRISE_LEAST);
    out.push = push;
    out.speed = push * (COT_FLOOR + 1 / Math.tan(deadrise));
    out.deadrise = deadrise;
  };
  const stoneLaw = { push: 0, speed: 0, deadrise: 0 }, sphereLaw = { push: 0, speed: 0, deadrise: 0 };

  for (let sample = 0; sample < SAMPLES; sample++) {
    const tau = (launchDuration * sample) / (SAMPLES - 1);
    const centreY = impact.height + velocity.y * tau;   // the centre's height over the water now (the x and z only move the azimuth's origin, which the bins are about)
    binFilled.fill(0);
    binReach.fill(-1);
    // Cut every triangle by the water plane (y = 0 in the stone-centred frame is the water at −centreY).
    for (let triangle = 0; triangle < pointCount / 3; triangle++) {
      for (let vertex = 0; vertex < 3; vertex++) {
        const point = (triangle * 3 + vertex) * 3;
        corner[vertex][0] = world[point]; corner[vertex][1] = world[point + 1] + centreY; corner[vertex][2] = world[point + 2];
        cornerNormal[vertex][0] = normals[point]; cornerNormal[vertex][1] = normals[point + 1]; cornerNormal[vertex][2] = normals[point + 2];
      }
      let crossings = 0;
      for (let edge = 0; edge < 3 && crossings < 2; edge++) {
        const a = corner[edge], b = corner[(edge + 1) % 3];
        if ((a[1] < 0) === (b[1] < 0)) continue;
        const along = a[1] / (a[1] - b[1]);
        cut[crossings][0] = a[0] + (b[0] - a[0]) * along;
        cut[crossings][1] = 0;
        cut[crossings][2] = a[2] + (b[2] - a[2]) * along;
        const na = cornerNormal[edge], nb = cornerNormal[(edge + 1) % 3];
        for (let axis = 0; axis < 3; axis++) cutNormal[crossings][axis] = na[axis] + (nb[axis] - na[axis]) * along;
        crossings++;
      }
      if (crossings < 2) continue;
      // The surface's outward normal along the segment: the cut points' vertex normals, averaged.
      let nx = cutNormal[0][0] + cutNormal[1][0], ny = cutNormal[0][1] + cutNormal[1][1], nz = cutNormal[0][2] + cutNormal[1][2];
      const length = Math.hypot(nx, ny, nz);
      if (length < 1e-9) continue;
      nx /= length; ny /= length; nz /= length;
      // The segment's bins, the short way round from one end to the other.
      const angleA = Math.atan2(cut[0][2], cut[0][0]), angleB = Math.atan2(cut[1][2], cut[1][0]);
      let turn = angleB - angleA;
      if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
      const reach = 0.5 * (Math.hypot(cut[0][0], cut[0][2]) + Math.hypot(cut[1][0], cut[1][2]));
      const steps = Math.max(Math.ceil((Math.abs(turn) / (2 * Math.PI)) * BINS), 1);
      for (let step = 0; step <= steps; step++) {
        const bin = binOf(angleA + (turn * step) / steps);
        if (reach <= binReach[bin]) continue;
        binReach[bin] = reach;
        binFilled[bin] = 1;
        binNormalX[bin] = nx; binNormalY[bin] = ny; binNormalZ[bin] = nz;
      }
    }
    let filled = 0;
    for (let bin = 0; bin < BINS; bin++) filled += binFilled[bin];
    const base = sample * BINS;
    if (filled < LEAST_FILLED) {
      for (let bin = 0; bin < BINS; bin++) { speedField[base + bin] = 1; thicknessField[base + bin] = 1; tiltField[base + bin] = 0; }
      continue;
    }
    // Bins the outline misses take the nearest filled bin's face.
    for (let bin = 0; bin < BINS; bin++) {
      if (binFilled[bin]) continue;
      for (let away = 1; away < BINS; away++) {
        const before = (bin - away + BINS) % BINS, after = (bin + away) % BINS;
        const found = binFilled[before] ? before : binFilled[after] ? after : -1;
        if (found < 0) continue;
        binNormalX[bin] = binNormalX[found]; binNormalY[bin] = binNormalY[found]; binNormalZ[bin] = binNormalZ[found];
        break;
      }
    }
    // The sphere's contact line at this sample: its normal at each azimuth.
    const sphereCos = Math.max(Math.min(centreY / radius, 1), -1);   // the sphere's normal's downward component on the waterline (1 at first contact, 0 at the equator)
    const sphereRing = Math.sqrt(Math.max(1 - sphereCos * sphereCos, 0));
    let speedMean = 0, thicknessMean = 0, tiltMean = 0;
    for (let bin = 0; bin < BINS; bin++) {
      const angle = ((bin + 0.5) / BINS) * 2 * Math.PI;
      faceLaw(binNormalX[bin], binNormalY[bin], binNormalZ[bin], stoneLaw);
      faceLaw(sphereRing * Math.cos(angle), -sphereCos, sphereRing * Math.sin(angle), sphereLaw);
      rawSpeed[bin] = (stoneLaw.speed + SOFTENING) / (sphereLaw.speed + SOFTENING);
      rawThickness[bin] = (stoneLaw.push + SOFTENING) / (sphereLaw.push + SOFTENING);
      rawTilt[bin] = sphereLaw.deadrise - stoneLaw.deadrise;
      speedMean += rawSpeed[bin]; thicknessMean += rawThickness[bin]; tiltMean += rawTilt[bin];
    }
    speedMean /= BINS; thicknessMean /= BINS; tiltMean /= BINS;
    for (let bin = 0; bin < BINS; bin++) {
      speedField[base + bin] = clamp(rawSpeed[bin] / speedMean, SPEED_RANGE[0], SPEED_RANGE[1]);
      thicknessField[base + bin] = clamp(rawThickness[bin] / thicknessMean, THICKNESS_RANGE[0], THICKNESS_RANGE[1]);
      tiltField[base + bin] = clamp(rawTilt[bin] - tiltMean, TILT_RANGE[0], TILT_RANGE[1]);
    }
  }
  for (const field of [speedField, thicknessField, tiltField]) smoothField(field);
  return { bins: BINS, samples: SAMPLES, launchDuration, speed: speedField, thickness: thicknessField, tilt: tiltField };
}

/** Smooth a field around the ring by SMOOTH and along the launch by [1, 2, 1], in place. */
function smoothField(field) {
  const scratch = new Float32Array(field.length);
  const half = (SMOOTH.length - 1) / 2;
  const weight = SMOOTH.reduce((sum, value) => sum + value, 0);
  for (let sample = 0; sample < SAMPLES; sample++) {
    const base = sample * BINS;
    for (let bin = 0; bin < BINS; bin++) {
      let sum = 0;
      for (let tap = 0; tap < SMOOTH.length; tap++) sum += SMOOTH[tap] * field[base + ((bin + tap - half + BINS) % BINS)];
      scratch[base + bin] = sum / weight;
    }
  }
  for (let sample = 0; sample < SAMPLES; sample++) {
    const before = Math.max(sample - 1, 0), after = Math.min(sample + 1, SAMPLES - 1);
    for (let bin = 0; bin < BINS; bin++) {
      field[sample * BINS + bin] = 0.25 * scratch[before * BINS + bin] + 0.5 * scratch[sample * BINS + bin] + 0.25 * scratch[after * BINS + bin];
    }
  }
}

/**
 * The field at an azimuth (radians) and a launch time (seconds; the tail,
 * past the main launch, takes the last sample's), into `out`: speed and
 * thickness as factors on the fitted launch's, tilt as radians added to
 * its launch angle from vertical.
 */
export function sampleLaunchField(field, angle, tau, out) {
  const bins = field.bins, samples = field.samples;
  const along = clamp((tau / field.launchDuration) * (samples - 1), 0, samples - 1);
  const sample0 = Math.min(Math.floor(along), samples - 1), sample1 = Math.min(sample0 + 1, samples - 1);
  const sampleShare = along - sample0;
  const around = (((angle / (2 * Math.PI)) * bins - 0.5) % bins + bins) % bins;
  const bin0 = Math.floor(around) % bins, bin1 = (bin0 + 1) % bins;
  const binShare = around - Math.floor(around);
  const read = (values) => {
    const low = values[sample0 * bins + bin0] * (1 - binShare) + values[sample0 * bins + bin1] * binShare;
    const high = values[sample1 * bins + bin0] * (1 - binShare) + values[sample1 * bins + bin1] * binShare;
    return low * (1 - sampleShare) + high * sampleShare;
  };
  out.speed = read(field.speed);
  out.thickness = read(field.thickness);
  out.tilt = read(field.tilt);
  return out;
}

/** The field's spread, for the probes: the least and greatest speed and thickness factors and tilt shift (degrees) over all samples. */
export function describeLaunchField(field) {
  if (!field) return null;
  const spread = (values) => [Math.min(...values), Math.max(...values)];
  const [tiltLeast, tiltMost] = spread(field.tilt);
  return { speed: spread(field.speed), thickness: spread(field.thickness), tilt: [(tiltLeast * 180) / Math.PI, (tiltMost * 180) / Math.PI] };
}

/**
 * The vertex normals of a mesh of separate triangles (each corner repeated in
 * every triangle it touches): every corner's faces' normals averaged, in the
 * mesh's own frame, outward (a face whose normal points into the mesh, by
 * its winding, is turned out by its centroid).
 */
function vertexNormals(positions) {
  const pointCount = positions.length / 3;
  const normals = new Float64Array(pointCount * 3);
  const sums = new Map();
  const keyOf = (point) => `${positions[point * 3]},${positions[point * 3 + 1]},${positions[point * 3 + 2]}`;
  for (let triangle = 0; triangle < pointCount / 3; triangle++) {
    const first = triangle * 3;
    const ax = positions[first * 3], ay = positions[first * 3 + 1], az = positions[first * 3 + 2];
    const bx = positions[first * 3 + 3], by = positions[first * 3 + 4], bz = positions[first * 3 + 5];
    const cx = positions[first * 3 + 6], cy = positions[first * 3 + 7], cz = positions[first * 3 + 8];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (nx * (ax + bx + cx) + ny * (ay + by + cy) + nz * (az + bz + cz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (let vertex = 0; vertex < 3; vertex++) {
      const key = keyOf(first + vertex);
      const sum = sums.get(key);
      if (sum) { sum[0] += nx; sum[1] += ny; sum[2] += nz; } else sums.set(key, [nx, ny, nz]);
    }
  }
  for (let point = 0; point < pointCount; point++) {
    const sum = sums.get(keyOf(point));
    const length = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    normals[point * 3] = sum[0] / length; normals[point * 3 + 1] = sum[1] / length; normals[point * 3 + 2] = sum[2] / length;
  }
  return normals;
}

function clamp(value, low, high) { return value < low ? low : value > high ? high : value; }
