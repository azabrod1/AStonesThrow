// Something in the loch (src/main.js PLACES `loch`, `visitor`): now and then,
// far out on the water, something comes up, goes along a little, and goes
// down again. What it is the scene never says. It is drawn as one long,
// dark, wet body, of which the water shows only what breaks it, and each
// sighting is a different form (FORMS) of what may be the same thing:
//
// - humps: two or three low humps in a row, a wave running back along a
//   body that stays under, the humps moving on slower than the water slides
//   past them, with no head showing; the wake runs ahead of them.
// - neck: a slender neck and a small head lifted out of the water, a low
//   back behind it or none, the head turning slowly, as something looking
//   about; or a branch, standing up from a sunken tree.
// - back: one long low back, barely out, rolling a little as a log does,
//   but going steadily against the wind, and then down.
// - wake: nothing at all above the water: a V of waves and a swirl going
//   along, as something big just under the surface would leave, or a boat
//   long out of sight.
//
// Never the same form twice running. The sightings come every one to two
// and a half minutes (SCHEDULE), the first within a minute of arriving; one
// lasts fifteen to thirty seconds, its wake and rings a while longer.
//
// Out of reach. It shows only from SCHEDULE.distance out from the shore's
// eye, past where anything thrown can go (a floater drifted past 30 m from
// the pond goes, src/main.js FARTHEST_AWAY), and it has no body for the
// physics: no collider, no contact with anything thrown (src/collide.js
// knows nothing of it), and the splash and the solver never meet it (its
// waves are the water shader's, below). A sighting never starts with a
// thing thrown within SCHEDULE.clear of its course, and one under way that a
// thing comes within SCHEDULE.startle of goes down at once, fast, with a
// heavier swirl: nothing thrown ever reaches where it is. Under ice
// (Frozen) or a gale's waves it does not come up.
//
// The water. Its wake, a breach's and a dive's rings, the water it heaps
// up where it breaks the surface and the foam it churns are the water
// shader's (src/shaders/visitor.js, VISITOR_WATER: Kelvin's wake by
// stationary phase, the Cauchy–Poisson rings, a dipole at each contact);
// `uniforms` (uVisitor*) are what it reads, set each frame from the pose.
//
// Its motion is closed form in time: a sighting is drawn (from its own
// seeded stream, seededRandom, never Math.random) and changed (cut short)
// in the physics steps (step, from src/main.js's endStep), and each frame
// poses it at the frame's time (showAt), so it goes alike at any frame
// rate. It swims a straight course at an even speed; rises front first (a
// lag along the body) and goes down front first, the body easing up from
// SINK under the water, through the peat-dark water in which nothing a
// metre under can be seen (WATER_CLARITIES.peat in src/main.js).
//
// The body is a tube along a spine of SPINE_POINTS (its radius by form,
// head to tail, an ellipse across, wider than deep, lumpy by a few
// per cent from the sighting's seed, a row of low knobbles along its back),
// its frame keeping its back up, its points moved and its normals taken
// from the grid once a frame on the CPU while any of it is within reach of the
// surface: SPINE_POINTS × AROUND vertices (its colours once a sighting).
// Three meshes draw it, as a boulder's do (src/boulders.js sceneryShader):
// `above`, clipped to y ≥ 0, in the main scene, its skin dark and wet, a
// hide (hideTexture: folds, warts and pores in its relief, wet and dry
// patches in its gloss, blotches in its colour) laid in metres on the
// body, wetter just over the waterline and washed with broken foam at it;
// `below`, clipped to
// y ≤ 0, in the under-water pass, drawn where the still surface shows it
// and fading into the water; and its mirror image on the mirror layer, its
// distance in alpha, which src/main.js draws again each frame it shows
// (so `above` and `mirror` show only while some of it is out). All three
// are built under the loading veil (warmUp), whatever the place.
import * as THREE from 'three';
import { seededRandom } from './spray.js';
import { sceneryShader } from './boulders.js';
import { VISITOR_CONTACTS, VISITOR_RINGS } from './shaders/visitor.js';

const GRAVITY = 9.81;
export const SCHEDULE = {
  seed: 1933,                 // its stream's (the year the road along the loch's north shore opened, and the sightings began)
  first: [20, 45],            // s after arriving: the first sighting
  between: [60, 150],         // s from the end of one (its wake gone) to the start of the next
  distance: [48, 80],         // m out from the shore's eye to the middle of its run, along the home view's line...
  fogDistance: [48, 54],      // ...nearer in a fog, which would hide it out there (src/main.js WEATHERS.fog)
  bearing: 34,                // degrees either side of that line
  across: 25,                 // degrees its course strays from straight across the line of sight: never toward the shore
  nearest: 36,                // m: no part of it ever comes nearer the eye (tools/visitor-probe.mjs checks)
  clear: 22,                  // m: no sighting starts with a thing thrown this near its course
  startle: 16,                // m: one under way goes down at once if a thing comes this near
  retry: 7,                   // s: a sighting held back (a thing near, ice, a gale) is tried again this much later
  linger: 30,                 // s its wake and rings are kept after it has gone under
};
const SINK = 2.2;             // m: how far under its back waits before it rises, and goes back to (unseen in peat water)
const RISE_LAG = 0.12;        // s per metre of body: it rises and goes down front first
const STARTLED_DIVE = 2.4;    // s: how fast it goes down when something comes near
const SPINE_POINTS = 192;
const AROUND = 24;            // vertices round the tube, and one more at the seam (under the belly) for the hide's texture
const RING = AROUND + 1;
const HIDE = { size: 256, tile: 0.8 };   // the hide's texture (hideTexture): texels a side, and metres a tile covers on the body
const EYE = { x: 0, z: 2.45 };   // the shore's eye (src/main.js VIEWS.shore), which the distance is measured from
const SKIN = { color: [0.05, 0.044, 0.034], spread: 0.25, roughness: 0.22, bump: 0.04, reflection: 0.75, below: 0.3 };   // wet: the sky's glint along its back, broken by the hide (its roughness times the texture's)
// (bump: the hide's relief in metres, three.js's bumpScale being in world units: a few centimetres of folds and warts)
const KNOBBLES = { height: 0.07, spacing: 0.42, top: 8 };   // a row of low knobbles along the back: share of the girth, metres apart, how tightly to the top

// The forms (the header): how often each comes (weight); the body's length
// and girth (its widest radius, m); how high its highest point stands over
// the water when fully up (crest, m; under 0 it stays under); the wave
// along its body (height, m, length, m, and speed back along it as a share
// of its own); its speed (m/s); how long it rises, holds and sinks (s); the
// head's and the neck's length and radius (m); whether it rolls as a log.
// [least, most] pairs are drawn evenly between.
const FORMS = {
  humps: { weight: 3, length: [8, 10.5], girth: [0.28, 0.36], crest: [0.36, 0.55], wave: [0.55, 0.72], waveLength: [2.2, 2.8], waveSpeed: 0.6, speed: [0.8, 1.3], rise: [3, 4.5], hold: [9, 15], sink: [3.5, 5], head: [0.55, 0.2], neck: [0, 0] },
  neck: { weight: 2, length: [5.5, 7.5], girth: [0.4, 0.52], crest: [-0.06, 0.1], wave: [0.06, 0.1], waveLength: [4, 5], waveSpeed: 0.5, speed: [0.25, 0.45], rise: [3.5, 5], hold: [7, 11], sink: [3.5, 5], head: [0.34, 0.11], neck: [1.9, 2.5] },
  back: { weight: 2, length: [3.6, 5], girth: [0.3, 0.38], crest: [0.14, 0.24], wave: [0, 0], waveLength: [3, 3], waveSpeed: 0, speed: [0.35, 0.7], rise: [4, 6], hold: [8, 13], sink: [5, 7], head: [0, 0], neck: [0, 0], log: true },
  wake: { weight: 2, length: [6, 8], girth: [0.4, 0.5], crest: [-0.16, -0.07], wave: [0.12, 0.18], waveLength: [3.5, 4.5], waveSpeed: 0.7, speed: [1.3, 1.9], rise: [3, 4], hold: [9, 14], sink: [3, 4], head: [0.55, 0.2], neck: [0, 0] },
};
const FORM_NAMES = Object.keys(FORMS);
const NECK = { up: 1.32, dip: 0.2, lift: 2.4, lower: 1.8, startled: 0.9, yaw: [0.35, 0.8], yawRate: [0.25, 0.45] };   // its curve (rad), how long it takes to lift and lower (s; startled, faster), how far and fast the head turns
const RING_STRENGTH = { breach: 0.3, dive: 0.35, startled: 0.7 };   // m³: the rings' sizes (src/shaders/visitor.js)
const RING_LEAST = 2e-4;      // m: a ring's height (src/shaders/visitor.js) past which the water shader leaves it out (uVisitorReach)
const WAKE_HEIGHT = 0.16;    // m at a metre behind, for a girth of 0.45 m at 1.2 m/s (some 4 m³ moved, a rowing boat's several times): the Kelvin wake's height scale

const ease = (edge0, edge1, value) => THREE.MathUtils.smootherstep(value, edge0, edge1);

/** A drawn sighting: its form and every number it is posed from (draw), and its timeline. */
function drawSighting(stream, form, start, { near, eye = EYE }) {
  const shape = FORMS[form];
  const between = ([least, most]) => least + (most - least) * stream();
  const range = near ? SCHEDULE.fogDistance : SCHEDULE.distance;
  const distance = between(range);
  const bearing = THREE.MathUtils.degToRad((stream() * 2 - 1) * SCHEDULE.bearing);
  // Across the line of sight, either way, within SCHEDULE.across of straight across.
  const course = Math.atan2(-Math.cos(bearing), Math.sin(bearing)) + (stream() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + THREE.MathUtils.degToRad((stream() * 2 - 1) * SCHEDULE.across);
  const speed = between(shape.speed);
  const rise = between(shape.rise), hold = between(shape.hold), sink = between(shape.sink);
  const length = between(shape.length);
  const travelled = speed * (rise + hold + sink);
  // Its middle at the time it holds, `distance` out along the bearing: it starts half its run back along its course.
  const middleX = eye.x + Math.sin(bearing) * distance, middleZ = eye.z - Math.cos(bearing) * distance;
  const headingX = Math.cos(course), headingZ = Math.sin(course);
  return {
    form,
    start,
    rise,
    sinkStart: start + rise + hold,
    sinkSeconds: sink,
    lowerFrom: start + rise + hold - NECK.lower,   // the neck starts down (startle brings it forward)...
    lowerSeconds: NECK.lower + 0.2,                // ...and is down after this
    startled: false,
    heavyDive: false,   // startled before its dive's ring went out: that ring is heavier (waterAt)
    middleX,
    middleZ,
    startX: middleX - headingX * travelled / 2,
    startZ: middleZ - headingZ * travelled / 2,
    headingX,
    headingZ,
    speed,
    length,
    girth: between(shape.girth),
    crest: between(shape.crest),
    wave: between(shape.wave),
    waveLength: between(shape.waveLength),
    wavePhase: stream() * Math.PI * 2,
    sway: 0.04 + 0.05 * stream(),
    headLength: shape.head[0],
    headRadius: shape.head[1],
    neckLength: between(shape.neck),
    yaw: between(NECK.yaw) * (stream() < 0.5 ? -1 : 1),
    yawRate: between(NECK.yawRate),
    yawPhase: stream() * Math.PI * 2,
    roll: shape.log ? 0.12 + 0.1 * stream() : 0,
    rollRate: 0.3 + 0.2 * stream(),
    bob: 0.025 + 0.02 * stream(),
    lumpPhases: Array.from({ length: 6 }, () => stream() * Math.PI * 2),
    tone: stream(),
  };
}

/** The angle round the tube of column `around`: from under the belly (−π/2) round the right side, over the back and back down. */
const aroundAngle = (around) => -Math.PI / 2 + (2 * Math.PI * around) / AROUND;

/**
 * The hide (HIDE): a tile that wraps both ways, in its red the height the
 * bump map reads (folds running round the body, close along it; a scatter
 * of warts; pores), in its green the roughness's share (wet patches glossier,
 * the folds' crests drier), in its blue the colour's blotches. Value noise
 * on lattices that wrap with the tile, and warts in a jittered grid, from
 * its own seeded stream: the same hide every time.
 */
function hideTexture() {
  const size = HIDE.size;
  const stream = seededRandom(SCHEDULE.seed, 4);
  const lattice = Array.from({ length: 64 * 64 }, () => stream());
  // Smooth value noise at (x, y) in [0, 1)², `cellsX` × `cellsY` cells that wrap.
  const noise = (x, y, cellsX, cellsY, salt) => {
    const gridX = x * cellsX, gridY = y * cellsY;
    const cornerX = Math.floor(gridX), cornerY = Math.floor(gridY);
    const fractionX = gridX - cornerX, fractionY = gridY - cornerY;
    const value = (offsetX, offsetY) => lattice[(((cornerX + offsetX) % cellsX + salt * 7) % 64) * 64 + (((cornerY + offsetY) % cellsY + salt * 13) % 64)];
    const smoothX = fractionX * fractionX * (3 - 2 * fractionX), smoothY = fractionY * fractionY * (3 - 2 * fractionY);
    const bottom = value(0, 0) + (value(1, 0) - value(0, 0)) * smoothX, top = value(0, 1) + (value(1, 1) - value(0, 1)) * smoothX;
    return bottom + (top - bottom) * smoothY;
  };
  const warts = Array.from({ length: 12 * 12 }, () => ({ x: stream(), y: stream(), size: 0.25 + 0.3 * stream(), height: 0.4 + 0.6 * stream() }));
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = column / size, y = row / size;   // x along the body, y round it
      const folds = 1 - Math.abs(2 * noise(x, y, 24, 5, 1) - 1) * 0.7 - Math.abs(2 * noise(x, y, 48, 9, 2) - 1) * 0.3;
      let wart = 0;
      const cellX = Math.floor(x * 12), cellY = Math.floor(y * 12);
      for (let nearX = -1; nearX <= 1; nearX++) {
        for (let nearY = -1; nearY <= 1; nearY++) {
          const wrappedX = (cellX + nearX + 12) % 12, wrappedY = (cellY + nearY + 12) % 12;
          const one = warts[wrappedX * 12 + wrappedY];
          let apartX = (cellX + nearX + one.x) / 12 - x, apartY = (cellY + nearY + one.y) / 12 - y;
          apartX -= Math.round(apartX); apartY -= Math.round(apartY);
          const distance = Math.hypot(apartX, apartY) * 12 / one.size;
          if (distance < 1) wart = Math.max(wart, one.height * (1 - distance * distance) ** 2);
        }
      }
      const pores = noise(x, y, 64, 64, 3);
      const height = 0.45 * folds + 0.4 * wart + 0.15 * pores;
      const wetness = noise(x, y, 4, 3, 4);
      const roughness = 0.2 + 0.7 * wetness ** 2 + 0.6 * Math.max(folds - 0.55, 0) + 0.35 * wart;
      const blotch = 0.55 * noise(x, y, 6, 4, 5) + 0.3 * noise(x, y, 13, 7, 6) + 0.15 * pores;
      const offset = (row * size + column) * 4;
      data[offset] = Math.round(255 * Math.min(Math.max(height, 0), 1));
      data[offset + 1] = Math.round(255 * Math.min(Math.max(roughness, 0), 1));
      data[offset + 2] = Math.round(255 * Math.min(Math.max(blotch, 0), 1));
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** When a sighting is over, its wake and rings too (s). */
const sightingEnd = (sighting) => sighting.sinkStart + sighting.sinkSeconds + SCHEDULE.linger;
/** Where its head is at `time` along its course (x, z). */
const headAt = (sighting, time) => {
  const along = sighting.speed * (time - sighting.start);
  return [sighting.startX + sighting.headingX * along, sighting.startZ + sighting.headingZ * along];
};

/** How far up the body is at `time`, `along` metres behind the head: 0 under (SINK), 1 risen; front first both ways. */
function emergence(sighting, time, along) {
  const local = time - RISE_LAG * along;
  return ease(sighting.start, sighting.start + sighting.rise, local) * (1 - ease(sighting.sinkStart, sighting.sinkStart + sighting.sinkSeconds, local));
}

/** The body's radius `along` metres behind the head (its widest is its girth), by form. */
function radiusAt(sighting, along) {
  const { length, girth, headLength, headRadius, neckLength } = sighting;
  const share = along / length;
  if (FORMS[sighting.form].log) return girth * Math.pow(Math.max(1 - Math.pow(Math.abs(2 * share - 1), 6), 0), 0.35);
  const tail = Math.pow(Math.max(1 - ease(0.5, 1, share) ** 1.2, 0), 0.75);
  const head = headRadius * Math.sqrt(Math.sin(Math.PI / 2 * Math.min(along / Math.max(headLength, 1e-3), 1)));
  if (neckLength > 0) {
    // The head, then the neck widening a little to its base, then the shoulders into the body.
    const neckRadius = headRadius * (1.05 + 0.5 * ease(headLength, neckLength, along));
    const body = THREE.MathUtils.lerp(neckRadius, girth, ease(neckLength - 0.2, neckLength + 1.1, along)) * tail;
    return along < headLength ? head * (0.8 + 0.2 * along / headLength) + 0.02 * Math.sin(Math.PI * along / headLength) : body;
  }
  const body = THREE.MathUtils.lerp(headRadius * 1.1, girth, ease(headLength, headLength + 1.6, along)) * tail;
  return along < headLength ? head : body;
}

export class LochVisitor {
  constructor({ envTexture, waterFog, mirrorLayer }) {
    this.uniforms = {
      uVisitorOn: { value: 0 },
      uVisitorSource: { value: new THREE.Vector4(0, 0, 1, 0) },
      uVisitorWake: { value: new THREE.Vector4(1, 0, 0, 0.4) },
      uVisitorEnvelope: { value: new THREE.Vector4() },
      uVisitorContacts: { value: Array.from({ length: VISITOR_CONTACTS }, () => new THREE.Vector4()) },
      uVisitorRings: { value: Array.from({ length: VISITOR_RINGS }, () => new THREE.Vector4()) },
      uVisitorSpans: { value: new THREE.Vector4() },
      uVisitorReach: { value: new THREE.Vector4() },
    };
    this.geometry = this.buildGeometry();
    this.hideMap = hideTexture();
    this.skin = { churn: { value: 0 } };   // the waterline's foam band (above)
    this.above = new THREE.Mesh(this.geometry, this.material('above', { envTexture, waterFog }));
    this.below = new THREE.Mesh(this.geometry, this.material('below', { envTexture, waterFog }));
    this.mirror = new THREE.Mesh(this.geometry, this.material('mirror', { envTexture, waterFog }));
    this.mirror.layers.set(mirrorLayer);
    this.meshes = [this.above, this.below, this.mirror];
    this.bounds = new THREE.Box3();   // what it takes up as posed (src/main.js redraws its mirror image there)
    for (const mesh of this.meshes) { mesh.frustumCulled = false; mesh.visible = false; }
    // The spine, posed each frame: its points, tangents and the frame across them.
    this.spine = Array.from({ length: SPINE_POINTS }, () => ({ point: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), radius: 0, flat: 1, roll: 0 }));
    this.here = false;       // the place is the loch (setPlace)
    this.open = false;       // and the water open: no ice, no gale (step's conditions)
    this.near = false;       // a fog: it comes nearer
    this.sighting = null;
    this.lastForm = null;
    this.sightings = 0;      // how many so far since arriving (the probe's and the API's)
    this.coloured = null;    // the sighting its skin's colours are (colour)
    this.reset(0);
  }

  /**
   * The tube's indices; its texture coordinates and colours are a
   * sighting's (colour), its positions and normals posed each frame.
   */
  buildGeometry() {
    const geometry = new THREE.BufferGeometry();
    const count = SPINE_POINTS * RING;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));   // once a sighting (colour)
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));   // once a sighting (colour)
    const indices = [];
    for (let along = 0; along < SPINE_POINTS - 1; along++) {
      for (let around = 0; around < AROUND; around++) {
        const here = along * RING + around, next = here + 1;   // wound outward: round the tube toward the back, then along toward the tail
        indices.push(here, next, here + RING, next, next + RING, here + RING);
      }
    }
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return geometry;
  }

  material(side, { envTexture, waterFog }) {
    const made = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: SKIN.roughness,
      roughnessMap: this.hideMap,
      bumpMap: this.hideMap,
      bumpScale: SKIN.bump,
      metalness: 0,
      envMap: envTexture,
      envMapIntensity: side === 'below' ? SKIN.below : SKIN.reflection,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, side === 'below' ? -1 : 1, 0), 0)],
    });
    made.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vVisitorHeight;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vVisitorHeight = (modelMatrix * vec4(transformed, 1.0)).y;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vVisitorHeight;');
      if (side !== 'below') {
        // Just over the waterline: wet, and a band of churned foam as it goes (uVisitorChurn); higher, the skin dries
        // a little rougher.
        shader.uniforms.uVisitorChurn = this.skin.churn;
        // The hide's blotches (the texture's blue) in its colour; at the waterline a wash of foam, broken by them.
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uVisitorChurn;')
          .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 visitorHide = texture2D(bumpMap, vBumpMapUv);
  diffuseColor.rgb *= 0.6 + 0.8 * visitorHide.b;
  float visitorWet = 1.0 - smoothstep(0.0, 0.2, vVisitorHeight);
  diffuseColor.rgb *= 1.0 - 0.3 * visitorWet;
  float visitorWash = (1.0 - smoothstep(0.0, 0.012 + 0.03 * uVisitorChurn, vVisitorHeight)) * smoothstep(0.35, 0.65, texture2D(bumpMap, vBumpMapUv * 3.0 + 0.37).b);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.62, 0.6), visitorWash * (0.2 + 0.5 * uVisitorChurn));`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.06, visitorWet * (1.0 - visitorWash));`);
      }
      sceneryShader(shader, side, waterFog);   // below: seen through the water; mirror: its distance in alpha (src/boulders.js)
    };
    made.customProgramCacheKey = () => `loch-visitor-${side}`;
    return made;
  }

  /** The sky's map (src/sky.js fills it in place; a new object comes with a new place). */
  setEnvironment(texture) {
    for (const mesh of this.meshes) {
      if (mesh.material.envMap === texture) continue;
      mesh.material.envMap = texture;
      mesh.material.needsUpdate = true;
    }
  }

  /** Whether the place is the loch: elsewhere nothing comes up. */
  setPlace(here) {
    this.here = here;
    if (!here) this.hide();
  }

  /** Back to the start, at world `time` (src/main.js clearPond): nothing up, the first sighting within SCHEDULE.first, from its stream's start. */
  reset(time) {
    this.stream = seededRandom(SCHEDULE.seed, 1);
    this.sighting = null;
    this.lastForm = null;
    this.sightings = 0;
    this.nextAt = time + this.between(SCHEDULE.first);
    this.hide();
  }

  between([least, most]) { return least + (most - least) * this.stream(); }

  /** A form drawn by weight, never the one before. */
  drawForm() {
    const choices = FORM_NAMES.filter((name) => name !== this.lastForm);
    const total = choices.reduce((sum, name) => sum + FORMS[name].weight, 0);
    let pick = this.stream() * total;
    for (const name of choices) { pick -= FORMS[name].weight; if (pick <= 0) return name; }
    return choices[choices.length - 1];
  }

  /**
   * A physics step's end at world `time` (src/main.js endStep): a sighting
   * begins when it is due, the water open (`open`: no ice or gale) and
   * nothing thrown near its course (`things`: each with its position, x and z); one under
   * way goes down at once when a thing comes near; one over is let go and
   * the next is due.
   */
  step(time, things, { open, near }) {
    this.open = open;
    this.near = near;
    if (!this.here) return;
    const sighting = this.sighting;
    if (sighting) {
      if (time >= sightingEnd(sighting)) {
        this.sighting = null;
        this.nextAt = time + this.between(SCHEDULE.between);
        return;
      }
      const going = time < sighting.sinkStart + sighting.sinkSeconds;
      if (going && !sighting.startled && (!open || this.thingNear(sighting, time, things, SCHEDULE.startle))) this.startle(sighting, time);
      return;
    }
    if (time < this.nextAt) return;
    if (!open) { this.nextAt = time + SCHEDULE.retry; return; }
    const form = this.drawForm();
    const drawn = drawSighting(this.stream, form, time, { near });
    if (this.thingNear(drawn, null, things, SCHEDULE.clear)) { this.nextAt = time + SCHEDULE.retry; return; }
    this.begin(drawn);
  }

  begin(sighting) {
    this.sighting = sighting;
    this.lastForm = sighting.form;
    this.sightings++;
  }

  /**
   * It goes down now, fast (STARTLED_DIVE), front first: a neck comes down
   * over NECK.startled from where it stands, never at once; and if its
   * dive's ring has not gone out yet, that ring is heavier (a swirl). One
   * already going down goes on as it was.
   */
  startle(sighting, time) {
    sighting.startled = true;
    if (time >= sighting.sinkStart) return;
    sighting.sinkStart = time;
    sighting.sinkSeconds = Math.min(sighting.sinkSeconds, STARTLED_DIVE);
    if (time < sighting.lowerFrom + sighting.lowerSeconds) {
      sighting.lowerSeconds = Math.min(sighting.lowerFrom + sighting.lowerSeconds, time + NECK.startled) - Math.min(sighting.lowerFrom, time);
      sighting.lowerFrom = Math.min(sighting.lowerFrom, time);
    }
    sighting.heavyDive = true;
  }

  /** Whether any of `things` (x, z) is within `reach` of its course (time null: the whole course), or of its body at `time`. */
  thingNear(sighting, time, things, reach) {
    const end = sighting.sinkStart + sighting.sinkSeconds;
    const [fromX, fromZ] = headAt(sighting, time ?? sighting.start);
    const [toX, toZ] = headAt(sighting, time ?? end);
    const tailX = fromX - sighting.headingX * sighting.length, tailZ = fromZ - sighting.headingZ * sighting.length;
    for (const thing of things) {
      const { x, z } = thing.position ?? thing;
      if (distanceToSegment(x, z, tailX, tailZ, toX, toZ) < reach) return true;
    }
    return false;
  }

  /**
   * Summon a sighting (the API's, src/main.js `sightVisitor`), begun
   * `elapsed` seconds before world `time`: of `form` (drawn, by weight, if
   * none), the middle of its run `distance` m out at `bearing` degrees, its
   * `course` (degrees from +x toward +z); what is not given is drawn as a
   * sighting's would be. Its draws are its own stream's, so the schedule's
   * sightings after it are as they would have been.
   */
  summon(time, form, { elapsed = 0, distance, bearing, course } = {}) {
    const stream = seededRandom(SCHEDULE.seed, 2, this.sightings);
    const chosen = Object.hasOwn(FORMS, form ?? '') ? form : FORM_NAMES[Math.floor(stream() * FORM_NAMES.length)];
    const drawn = drawSighting(stream, chosen, time - elapsed, { near: this.near });
    if (course !== undefined) { const turn = THREE.MathUtils.degToRad(course); drawn.headingX = Math.cos(turn); drawn.headingZ = Math.sin(turn); }
    if (distance !== undefined || bearing !== undefined) {
      const drawnDistance = Math.hypot(drawn.middleX - EYE.x, drawn.middleZ - EYE.z);
      const drawnBearing = Math.atan2(drawn.middleX - EYE.x, EYE.z - drawn.middleZ);
      const angle = bearing === undefined ? drawnBearing : THREE.MathUtils.degToRad(bearing), out = distance ?? drawnDistance;
      drawn.middleX = EYE.x + Math.sin(angle) * out;
      drawn.middleZ = EYE.z - Math.cos(angle) * out;
    }
    const along = drawn.speed * (drawn.sinkStart + drawn.sinkSeconds - drawn.start) / 2;
    drawn.startX = drawn.middleX - drawn.headingX * along;
    drawn.startZ = drawn.middleZ - drawn.headingZ * along;
    this.begin(drawn);
    return this.report(time);
  }

  /** What it is doing at `time`, for the API and the probe. */
  report(time) {
    const sighting = this.sighting;
    if (!sighting) return { up: false, sightings: this.sightings, nextAt: this.nextAt };
    const [x, z] = headAt(sighting, time);
    const body = this.bounds.isEmpty() ? null : this.bounds.getCenter(new THREE.Vector3()).toArray();   // as last posed
    return { up: true, form: sighting.form, x, z, body, distance: Math.hypot(x - EYE.x, z - EYE.z), emerged: emergence(sighting, time, 0), startled: sighting.startled, sightings: this.sightings, endsAt: sightingEnd(sighting) };
  }

  hide() {
    for (const mesh of this.meshes) mesh.visible = false;
    this.uniforms.uVisitorOn.value = 0;
  }

  /** Show it in the warm-up (src/main.js warmUp) whatever the place, so its three programs are built under the veil; false puts it back. */
  warmUp(on) {
    if (!on) { this.hide(); return; }
    const sighting = drawSighting(seededRandom(SCHEDULE.seed, 3), 'neck', -6, { near: false });
    this.pose(sighting, 0);
    for (const mesh of this.meshes) mesh.visible = true;
  }

  /**
   * Posed at the frame's world `time` (src/main.js simulate, after the
   * steps): the meshes and the water's uniforms. The part under the water
   * is drawn while any of it is near the surface, the part above and the
   * mirror image only while some of it is out (the mirror is redrawn each
   * frame it shows). Under ice or a gale (the steps' `open` false) nothing
   * shows: it is going down, and the gale's waves would wash through a body
   * drawn on still water.
   */
  showAt(time) {
    if (!this.here || !this.sighting || !this.open) { this.hide(); return; }
    const sighting = this.sighting;
    const highest = this.pose(sighting, time);
    this.below.visible = highest > -0.6;   // deeper, nothing of it shows through the peat
    this.above.visible = this.mirror.visible = highest > 0;
    this.waterAt(sighting, time);
  }

  /**
   * The spine and the tube at `time`; returns the height of its highest
   * point over the water (the tube is built only within 0.6 m of the
   * surface: deeper, in peat water, it is not seen).
   */
  pose(sighting, time) {
    const { length, headingX, headingZ, neckLength } = sighting;
    const sideX = -headingZ, sideZ = headingX;
    const [headX, headZ] = headAt(sighting, time);
    const elapsed = time - sighting.start;
    // The body's centre at full height: its crest at `crest` over the water.
    const flat = 0.86;
    const base = sighting.crest - sighting.wave - sighting.girth * flat;
    const waveSpeed = FORMS[sighting.form].waveSpeed * sighting.speed;
    const neckLift = neckLength > 0
      ? ease(sighting.start + sighting.rise * 0.6, sighting.start + sighting.rise * 0.6 + NECK.lift, time) * (1 - ease(sighting.lowerFrom, sighting.lowerFrom + sighting.lowerSeconds, time))
      : 0;
    let highest = -Infinity;
    for (let index = 0; index < SPINE_POINTS; index++) {
      const knot = this.spine[index];
      const along = (index / (SPINE_POINTS - 1)) * length;
      const share = along / length;
      const humps = ease(0.05, 0.2, share) * (1 - ease(0.8, 1, share));
      // A crest steeper in front than behind and peaked over flatter troughs (a skewed phase, a second harmonic).
      const phase = (2 * Math.PI * (along - waveSpeed * elapsed)) / sighting.waveLength + sighting.wavePhase;
      const skewed = phase + 0.45 * Math.sin(phase);
      let height = base + sighting.wave * humps * ((Math.sin(skewed) - 0.22 * Math.cos(2 * skewed)) / 1.22 + 0.18 * (1 - humps));
      height += sighting.bob * Math.sin(1.1 * elapsed + 2.1 * share);
      height -= SINK * (1 - emergence(sighting, time, along));
      const sway = sighting.sway * share * Math.sin((2 * Math.PI * along) / 2.8 - 1.7 * elapsed);
      knot.point.set(headX - headingX * along + sideX * sway, height, headZ - headingZ * along + sideZ * sway);
      knot.radius = radiusAt(sighting, along);
      knot.flat = neckLength > 0 ? THREE.MathUtils.lerp(1, flat, ease(neckLength - 0.3, neckLength + 0.8, along)) : along < sighting.headLength ? 0.9 : flat;
      knot.roll = sighting.roll * Math.sin(sighting.rollRate * elapsed * Math.PI * 2 * 0.25 + share);
    }
    if (neckLength > 0) this.liftNeck(sighting, time, neckLift);
    this.frames();
    // Deeper than half a metre all over, nothing of it shows through the peat.
    this.bounds.makeEmpty();
    for (const knot of this.spine) {
      highest = Math.max(highest, knot.point.y + knot.radius * knot.flat);
      this.bounds.expandByPoint(knot.point);
    }
    this.bounds.expandByScalar(sighting.girth * 1.3);
    if (highest < -0.6) return highest;
    this.skin.churn.value = Math.min(sighting.speed / 1.2, 1) * emergence(sighting, time, 0);
    if (this.coloured !== sighting) this.colour(sighting);
    this.buildSkin(sighting);
    return highest;
  }

  /**
   * The neck, lifted `lift` (0 to 1) from its base: marched from the base
   * toward the head, its direction climbing to nearly upright, then over
   * into the head, which is turned slowly from side to side (NECK).
   */
  liftNeck(sighting, time, lift) {
    const { neckLength, length } = sighting;
    const baseIndex = Math.min(Math.round((neckLength / length) * (SPINE_POINTS - 1)), SPINE_POINTS - 1);
    const step = length / (SPINE_POINTS - 1);
    const turn = lift * sighting.yaw * Math.sin(sighting.yawRate * (time - sighting.start) * Math.PI * 2 * 0.3 + sighting.yawPhase);
    const position = this.spine[baseIndex].point.clone();
    for (let index = baseIndex - 1; index >= 0; index--) {
      const reach = 1 - (index * step) / neckLength;   // 0 at the base, 1 at the head
      const climb = lift * (NECK.up * ease(0, 0.35, reach) - (NECK.up + NECK.dip) * ease(0.74, 1, reach));
      const heading = turn * ease(0.45, 1, reach);
      const forwardX = sighting.headingX * Math.cos(heading) - sighting.headingZ * Math.sin(heading);
      const forwardZ = sighting.headingX * Math.sin(heading) + sighting.headingZ * Math.cos(heading);
      position.x += step * Math.cos(climb) * forwardX;
      position.z += step * Math.cos(climb) * forwardZ;
      position.y += step * Math.sin(climb);
      this.spine[index].point.copy(position);
    }
  }

  /**
   * Tangents along the spine and a frame across them: its normal the
   * world's up, square to the spine, wherever the spine lies anywhere near
   * level (so the body's back is on top, its belly under); up a lifted
   * neck, where up runs along it, carried from below without twist
   * (parallel transport), blended between. Then each point's roll.
   */
  frames() {
    const spine = this.spine;
    for (let index = 0; index < SPINE_POINTS; index++) {
      const before = spine[Math.max(index - 1, 0)].point, after = spine[Math.min(index + 1, SPINE_POINTS - 1)].point;
      spine[index].tangent.subVectors(before, after).normalize();   // toward the head
    }
    const up = new THREE.Vector3(0, 1, 0);
    const tail = spine[SPINE_POINTS - 1];
    tail.normal.copy(up).addScaledVector(tail.tangent, -up.dot(tail.tangent)).normalize();
    const level = new THREE.Vector3();
    for (let index = SPINE_POINTS - 2; index >= 0; index--) {
      const knot = spine[index];
      knot.normal.copy(spine[index + 1].normal).addScaledVector(knot.tangent, -spine[index + 1].normal.dot(knot.tangent)).normalize();
      const steep = Math.abs(knot.tangent.y);
      if (steep < 0.9) {
        level.copy(up).addScaledVector(knot.tangent, -knot.tangent.y).normalize();
        knot.normal.lerp(level, 1 - ease(0.5, 0.9, steep)).addScaledVector(knot.tangent, -knot.normal.dot(knot.tangent)).normalize();
      }
    }
    for (const knot of spine) {
      knot.binormal.crossVectors(knot.tangent, knot.normal);
      if (knot.roll !== 0) {
        const cos = Math.cos(knot.roll), sin = Math.sin(knot.roll);
        const normalX = knot.normal.x * cos + knot.binormal.x * sin, normalY = knot.normal.y * cos + knot.binormal.y * sin, normalZ = knot.normal.z * cos + knot.binormal.z * sin;
        knot.binormal.set(knot.binormal.x * cos - knot.normal.x * sin, knot.binormal.y * cos - knot.normal.y * sin, knot.binormal.z * cos - knot.normal.z * sin);
        knot.normal.set(normalX, normalY, normalZ);
      }
    }
  }

  /** The skin's colours and the hide's tiling, once a sighting: darker under, a little olive and mottled over the back, by its seed. */
  colour(sighting) {
    const colors = this.geometry.attributes.color.array;
    const lumps = sighting.lumpPhases;
    const tone = 0.85 + 0.3 * sighting.tone;
    for (let along = 0; along < SPINE_POINTS; along++) {
      const share = along / (SPINE_POINTS - 1);
      for (let around = 0; around < RING; around++) {
        const angle = aroundAngle(around);
        const mottle = 0.8 + 0.35 * (0.5 + 0.5 * Math.sin(23 * share + 1.7 * Math.sin(3 * angle + lumps[4]) + lumps[5]));
        const shade = tone * mottle * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(angle)));
        const offset = (along * RING + around) * 3;
        colors[offset] = SKIN.color[0] * shade * (1 + SKIN.spread * 0.2);
        colors[offset + 1] = SKIN.color[1] * shade;
        colors[offset + 2] = SKIN.color[2] * shade * (1 - SKIN.spread * 0.3);
      }
    }
    this.geometry.attributes.color.needsUpdate = true;
    // The hide in tiles of HIDE.tile metres on the body as this sighting's radii make it: along it, and round it from
    // the belly round the right side, over the back and down (its two seam columns together under the belly, where
    // the tiles need not meet: the water hides it), so the neck's hide is the body's, not crowded.
    const uvs = this.geometry.attributes.uv.array;
    for (let along = 0; along < SPINE_POINTS; along++) {
      const metres = (along / (SPINE_POINTS - 1)) * sighting.length;
      const round = 2 * Math.PI * Math.max(radiusAt(sighting, metres), 0.04);
      for (let around = 0; around < RING; around++) {
        uvs[(along * RING + around) * 2] = metres / HIDE.tile;
        uvs[(along * RING + around) * 2 + 1] = (around / AROUND) * round / HIDE.tile;
      }
    }
    this.geometry.attributes.uv.needsUpdate = true;
    this.coloured = sighting;
  }

  /**
   * The tube round the spine: an ellipse across, wider than deep, lumpy by
   * the sighting's seed, a row of low knobbles along the top of the back
   * (KNOBBLES); its normals from its faces, the seam's two columns given
   * one.
   */
  buildSkin(sighting) {
    const positions = this.geometry.attributes.position.array;
    const lumps = sighting.lumpPhases;
    const knobbled = sighting.neckLength > 0 ? sighting.neckLength + 0.4 : sighting.headLength + 0.3;   // from the shoulders back
    for (let along = 0; along < SPINE_POINTS; along++) {
      const knot = this.spine[along];
      const share = along / (SPINE_POINTS - 1);
      const metres = share * sighting.length;
      const knobbleRow = KNOBBLES.height * sighting.girth * ease(knobbled, knobbled + 0.6, metres) * (1 - ease(0.7, 0.95, share))
        * Math.max(Math.sin((2 * Math.PI * metres) / KNOBBLES.spacing + lumps[2]), 0) ** 2;
      for (let around = 0; around < RING; around++) {
        const angle = aroundAngle(around);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const lump = 1 + 0.05 * Math.sin(17 * share * Math.PI + 2 * angle + lumps[0]) * Math.sin(29 * share + lumps[1])
          + 0.03 * Math.sin(41 * share + 3 * angle + lumps[2]) + 0.02 * Math.sin(7 * angle + 53 * share + lumps[3]);
        const knobble = knobbleRow * Math.max(sin, 0) ** KNOBBLES.top;
        const across = knot.radius * lump / Math.sqrt(knot.flat), up = knot.radius * lump * knot.flat + knobble;
        const offset = (along * RING + around) * 3;
        positions[offset] = knot.point.x + knot.binormal.x * cos * across + knot.normal.x * sin * up;
        positions[offset + 1] = knot.point.y + knot.binormal.y * cos * across + knot.normal.y * sin * up;
        positions[offset + 2] = knot.point.z + knot.binormal.z * cos * across + knot.normal.z * sin * up;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    // Normals from the grid: the cross of its change round the tube and its change along it, both central differences
    // (round the seam, its columns' neighbours either side, so the seam has one normal); at the closed ends, where the
    // ring is a point, along the spine.
    const normals = this.geometry.attributes.normal.array;
    for (let along = 0; along < SPINE_POINTS; along++) {
      const before = Math.max(along - 1, 0), after = Math.min(along + 1, SPINE_POINTS - 1);
      for (let around = 0; around < RING; around++) {
        const left = around === 0 ? AROUND - 1 : around - 1, right = around === AROUND ? 1 : around + 1;
        const rightAt = (along * RING + right) * 3, leftAt = (along * RING + left) * 3;
        const afterAt = (after * RING + around) * 3, beforeAt = (before * RING + around) * 3;
        const roundX = positions[rightAt] - positions[leftAt], roundY = positions[rightAt + 1] - positions[leftAt + 1], roundZ = positions[rightAt + 2] - positions[leftAt + 2];
        const alongX = positions[afterAt] - positions[beforeAt], alongY = positions[afterAt + 1] - positions[beforeAt + 1], alongZ = positions[afterAt + 2] - positions[beforeAt + 2];
        let normalX = roundY * alongZ - roundZ * alongY, normalY = roundZ * alongX - roundX * alongZ, normalZ = roundX * alongY - roundY * alongX;
        let length = Math.hypot(normalX, normalY, normalZ);
        if (length < 1e-9) {
          const end = this.spine[along].tangent, outward = along === 0 ? 1 : -1;
          normalX = end.x * outward; normalY = end.y * outward; normalZ = end.z * outward; length = 1;
        }
        const offset = (along * RING + around) * 3;
        normals[offset] = normalX / length;
        normals[offset + 1] = normalY / length;
        normals[offset + 2] = normalZ / length;
      }
    }
    this.geometry.attributes.normal.needsUpdate = true;
  }

  /**
   * The water's uniforms at `time` (src/shaders/visitor.js): the wake's
   * source at the head, at the depth its top holds when risen; where the
   * body breaks the surface (contacts: the front of each piece out, then
   * the backs); a breach's ring as the front comes up and a dive's as it
   * goes down.
   */
  waterAt(sighting, time) {
    const uniforms = this.uniforms;
    uniforms.uVisitorOn.value = 1;
    const head = this.spine[0];
    uniforms.uVisitorSource.value.set(head.point.x, head.point.z, sighting.headingX, sighting.headingZ);
    // The wake's source: the body's front half, at the depth of its top when risen (a hump's out: none).
    const risenTop = sighting.crest;
    const wakeHeight = WAKE_HEIGHT * (sighting.girth / 0.45) * Math.min(sighting.speed / 1.2, 1.4) ** 1.5;
    uniforms.uVisitorWake.value.set(sighting.speed, wakeHeight, Math.max(-risenTop, 0), sighting.girth);
    const ago = (moment) => time - moment;
    uniforms.uVisitorEnvelope.value.set(ago(sighting.start), ago(sighting.start + sighting.rise), ago(sighting.sinkStart), ago(sighting.sinkStart + sighting.sinkSeconds));
    // Contacts: the pieces of spine whose top is out of the water.
    const pieces = [];
    let piece = null;
    for (let index = 0; index < SPINE_POINTS; index++) {
      const knot = this.spine[index];
      const out = knot.point.y + knot.radius * knot.flat;
      if (out > -0.02) {
        if (!piece) { piece = { front: index, back: index, top: out }; pieces.push(piece); }
        piece.back = index;
        piece.top = Math.max(piece.top, out);
      } else piece = null;
    }
    pieces.sort((one, other) => other.top - one.top);
    // Each piece a capsule along the course: its middle, its half-length, and its half-width at the waterline (the
    // widest cut of its knots' ellipses by the water), pushing up the bow's height, U² / 2g, as much as it is out.
    const contacts = uniforms.uVisitorContacts.value;
    const spans = uniforms.uVisitorSpans.value;
    const bow = (sighting.speed * sighting.speed) / (2 * GRAVITY);
    for (let slot = 0; slot < VISITOR_CONTACTS; slot++) {
      const piece = pieces[slot];
      if (!piece) { contacts[slot].set(0, 0, 1, 0); spans.setComponent(slot, 0); continue; }
      const front = this.spine[piece.front].point, back = this.spine[piece.back].point;
      let width = 0.06;
      for (let index = piece.front; index <= piece.back; index++) {
        const knot = this.spine[index];
        const deep = knot.radius * knot.flat, wide = knot.radius / Math.sqrt(knot.flat);
        const cut = Math.min(Math.max(knot.point.y / Math.max(deep, 1e-3), -1), 1);
        width = Math.max(width, wide * Math.sqrt(1 - cut * cut));
      }
      const middleX = (front.x + back.x) / 2, middleZ = (front.z + back.z) / 2;
      const span = Math.abs((front.x - back.x) * sighting.headingX + (front.z - back.z) * sighting.headingZ) / 2;
      contacts[slot].set(middleX, middleZ, width, (bow + 0.02) * Math.min(piece.top / 0.15 + 0.3, 1));
      spans.setComponent(slot, span);
    }
    // Rings: a breach's where the front first comes up, a dive's where it goes down (a startled dive's heavier).
    const rings = uniforms.uVisitorRings.value;
    const shows = sighting.crest > -0.02 || sighting.neckLength > 0;
    const breachAt = sighting.start + sighting.rise * 0.65;
    const diveAt = sighting.sinkStart + sighting.sinkSeconds * 0.35;
    const events = [
      { at: breachAt, strength: shows ? RING_STRENGTH.breach : RING_STRENGTH.breach * 0.4 },
      { at: diveAt, strength: sighting.heavyDive ? RING_STRENGTH.startled : shows ? RING_STRENGTH.dive : RING_STRENGTH.dive * 0.4 },
    ];
    for (let slot = 0; slot < VISITOR_RINGS; slot++) {
      const event = events[slot];
      if (!event || time <= event.at) { rings[slot].set(0, 0, 0, 0); continue; }
      const [x, z] = headAt(sighting, event.at);
      const middle = Math.min(1.2, sighting.length * 0.15);   // a little behind the head: where most of it moves the water
      rings[slot].set(x - sighting.headingX * middle, z - sighting.headingZ * middle, time - event.at, event.strength * (sighting.girth / 0.45) ** 2);
    }
    // The circle all of it is inside (uVisitorReach): the wake out behind as far as the source has come (its energy
    // goes no faster than the source); each ring out to where its height, S g t² / 4r³, falls under RING_LEAST, and
    // no farther than its front; the body and what it heaps up round it.
    const reach = uniforms.uVisitorReach.value;
    let radius = sighting.speed * Math.max(time - sighting.start, 0) * 1.07 + sighting.length + 3;
    for (const ring of rings) {
      if (ring.w <= 0) continue;
      const age = ring.z;
      const ringReach = Math.min(Math.cbrt((ring.w * GRAVITY * age * age) / (4 * RING_LEAST)), (GRAVITY * age * age) / (4 * 0.8));
      radius = Math.max(radius, Math.hypot(ring.x - head.point.x, ring.y - head.point.z) + ringReach);
    }
    reach.set(head.point.x, head.point.z, radius, time - sighting.start);   // w: its clock, which its ripples run on
  }
}

/** The distance from (x, z) to the segment from (fromX, fromZ) to (toX, toZ). */
function distanceToSegment(x, z, fromX, fromZ, toX, toZ) {
  const alongX = toX - fromX, alongZ = toZ - fromZ;
  const lengthSquared = alongX * alongX + alongZ * alongZ;
  const share = lengthSquared > 0 ? Math.min(Math.max(((x - fromX) * alongX + (z - fromZ) * alongZ) / lengthSquared, 0), 1) : 0;
  return Math.hypot(x - fromX - share * alongX, z - fromZ - share * alongZ);
}
