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
// per cent from the sighting's seed), its points moved and its normals
// computed once a frame on the CPU while any of it is within reach of the
// surface: SPINE_POINTS × AROUND vertices. Three meshes draw it, as a
// boulder's do (src/boulders.js): `above`, clipped to y ≥ 0, in the main
// scene, its skin glossy and dark, a pale band of foam and wet just over the
// waterline; `below`, clipped to y ≤ 0, in the under-water pass, drawn where
// the still surface shows it (SEEN_THROUGH_WATER) and fading into the water;
// and its mirror image on the mirror layer, its distance in alpha. All three
// are built under the loading veil (warmUp), whatever the place.
import * as THREE from 'three';
import { seededRandom } from './spray.js';
import { SEEN_THROUGH_WATER } from './shaders/scene.js';
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
const SPINE_POINTS = 112;
const AROUND = 16;
const EYE = { x: 0, z: 2.45 };   // the shore's eye (src/main.js VIEWS.shore), which the distance is measured from
const SKIN = { color: [0.045, 0.040, 0.032], spread: 0.25, roughness: 0.16, reflection: 1.0, below: 0.3 };   // wet: the sky's glint along its back
const MIRROR_NEARNESS_SCALE = 4;   // the mirror image's alpha is 1 − this / distance (MIRROR_COMMON in src/shaders/scene.js)

// The forms (the header): how often each comes (weight); the body's length
// and girth (its widest radius, m); how high its highest point stands over
// the water when fully up (crest, m; under 0 it stays under); the wave
// along its body (height, m, length, m, and speed back along it as a share
// of its own); its speed (m/s); how long it rises, holds and sinks (s); the
// head's and the neck's length and radius (m); whether it rolls as a log.
// [least, most] pairs are drawn evenly between.
const FORMS = {
  humps: { weight: 3, length: [7.5, 10], girth: [0.4, 0.55], crest: [0.3, 0.5], wave: [0.42, 0.55], waveLength: [2.3, 3.0], waveSpeed: 0.6, speed: [0.8, 1.3], rise: [3, 4.5], hold: [9, 15], sink: [3.5, 5], head: [0.55, 0.2], neck: [0, 0] },
  neck: { weight: 2, length: [5.5, 7.5], girth: [0.4, 0.52], crest: [-0.06, 0.1], wave: [0.06, 0.1], waveLength: [4, 5], waveSpeed: 0.5, speed: [0.25, 0.45], rise: [3.5, 5], hold: [7, 11], sink: [3.5, 5], head: [0.34, 0.11], neck: [1.9, 2.5] },
  back: { weight: 2, length: [3.6, 5], girth: [0.3, 0.38], crest: [0.14, 0.24], wave: [0, 0], waveLength: [3, 3], waveSpeed: 0, speed: [0.35, 0.7], rise: [4, 6], hold: [8, 13], sink: [5, 7], head: [0, 0], neck: [0, 0], log: true },
  wake: { weight: 2, length: [6, 8], girth: [0.4, 0.5], crest: [-0.16, -0.07], wave: [0.12, 0.18], waveLength: [3.5, 4.5], waveSpeed: 0.7, speed: [1.3, 1.9], rise: [3, 4], hold: [9, 14], sink: [3, 4], head: [0.55, 0.2], neck: [0, 0] },
};
const FORM_NAMES = Object.keys(FORMS);
const NECK = { up: 1.32, dip: 0.2, lift: 2.4, lower: 1.8, yaw: [0.35, 0.8], yawRate: [0.25, 0.45] };   // its curve (rad), how long it takes to lift and lower (s), how far and fast the head turns
const RING_STRENGTH = { breach: 0.3, dive: 0.35, startled: 0.7 };   // m³: the rings' sizes (src/shaders/visitor.js)
const WAKE_HEIGHT = 0.16;    // m at a metre behind, for a girth of 0.45 m at 1.2 m/s (some 4 m³ moved, a rowing boat's several times): the Kelvin wake's height scale

const ease = (edge0, edge1, value) => {
  const share = Math.min(Math.max((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0), 1);
  return share * share * share * (share * (share * 6 - 15) + 10);
};

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
    startled: false,
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
    };
    this.geometry = this.buildGeometry();
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
    this.reset(0);
  }

  /** The tube's indices and its own colours (its positions and normals are posed each frame). */
  buildGeometry() {
    const geometry = new THREE.BufferGeometry();
    const count = SPINE_POINTS * AROUND;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const indices = [];
    for (let along = 0; along < SPINE_POINTS - 1; along++) {
      for (let around = 0; around < AROUND; around++) {
        const here = along * AROUND + around, next = along * AROUND + (around + 1) % AROUND;
        indices.push(here, here + AROUND, next, next, here + AROUND, next + AROUND);
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
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uVisitorChurn;')
          .replace('#include <color_fragment>', `#include <color_fragment>
  float visitorBand = 1.0 - smoothstep(0.0, 0.035 + 0.04 * uVisitorChurn, vVisitorHeight);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.64, 0.62), visitorBand * uVisitorChurn * 0.85);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.08, 1.0 - smoothstep(0.0, 0.25, vVisitorHeight));`);
      }
      if (side === 'below') {
        shader.uniforms.uFogExtinction = { value: waterFog.extinction };
        shader.uniforms.uFogColor = { value: waterFog.color };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${SEEN_THROUGH_WATER}`)
          .replace('#include <project_vertex>', `vec4 visitorWorld = modelMatrix * vec4(transformed, 1.0);
  vec4 mvPosition = viewMatrix * vec4(seenThroughWater(visitorWorld.xyz, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uFogExtinction;\nuniform vec3 uFogColor;')
          .replace('#include <fog_fragment>', `#include <fog_fragment>
  if (cameraPosition.y < 0.0) gl_FragColor.rgb = mix(uFogColor, gl_FragColor.rgb, exp(-uFogExtinction * length(vViewPosition)));`);
      }
      if (side === 'mirror') {
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.a = 1.0 - ${MIRROR_NEARNESS_SCALE.toFixed(1)} / max(length(vViewPosition), 0.05);`);
      }
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

  /** It goes down now, fast (STARTLED_DIVE), front first, with a heavier swirl. */
  startle(sighting, time) {
    sighting.startled = true;
    if (time < sighting.sinkStart) {
      sighting.sinkStart = time;
      sighting.sinkSeconds = Math.min(sighting.sinkSeconds, STARTLED_DIVE);
    }
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

  /** Summon a sighting of `form` (the API's, src/main.js `sightVisitor`), begun `elapsed` seconds before world `time`, `distance` m out at `bearing` degrees. */
  summon(time, form = this.drawForm(), { elapsed = 0, distance, bearing, course } = {}) {
    const stream = seededRandom(SCHEDULE.seed, 2, this.sightings);
    const drawn = drawSighting(stream, form, time - elapsed, { near: this.near });
    if (distance !== undefined || bearing !== undefined || course !== undefined) {
      const along = drawn.speed * (drawn.sinkStart + drawn.sinkSeconds - drawn.start) / 2;
      if (course !== undefined) { const turn = THREE.MathUtils.degToRad(course); drawn.headingX = Math.cos(turn); drawn.headingZ = Math.sin(turn); }
      const angle = THREE.MathUtils.degToRad(bearing ?? 0), out = distance ?? 60;
      drawn.startX = EYE.x + Math.sin(angle) * out - drawn.headingX * along;
      drawn.startZ = EYE.z - Math.cos(angle) * out - drawn.headingZ * along;
    }
    this.begin(drawn);
    return this.report(time);
  }

  /** What it is doing at `time`, for the API and the probe. */
  report(time) {
    const sighting = this.sighting;
    if (!sighting) return { up: false, sightings: this.sightings, nextAt: this.nextAt };
    const [x, z] = headAt(sighting, time);
    return { up: true, form: sighting.form, x, z, distance: Math.hypot(x - EYE.x, z - EYE.z), emerged: emergence(sighting, time, 0), startled: sighting.startled, sightings: this.sightings, endsAt: sightingEnd(sighting) };
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

  /** Posed at the frame's world `time` (src/main.js simulate, after the steps): the meshes and the water's uniforms. */
  showAt(time) {
    if (!this.here || !this.sighting) { this.hide(); return; }
    const sighting = this.sighting;
    const up = this.pose(sighting, time);
    for (const mesh of this.meshes) mesh.visible = up;
    this.waterAt(sighting, time);
  }

  /**
   * The spine and the tube at `time`: whether any of it is near enough the
   * surface to draw (deeper, in peat water, it is not seen).
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
      ? ease(sighting.start + sighting.rise * 0.6, sighting.start + sighting.rise * 0.6 + NECK.lift, time) * (1 - ease(sighting.sinkStart - NECK.lower, sighting.sinkStart + 0.2, time))
      : 0;
    let highest = -Infinity;
    for (let index = 0; index < SPINE_POINTS; index++) {
      const knot = this.spine[index];
      const along = (index / (SPINE_POINTS - 1)) * length;
      const share = along / length;
      const humps = ease(0.05, 0.2, share) * (1 - ease(0.8, 1, share));
      let y = base + sighting.wave * humps * Math.sin((2 * Math.PI * (along - waveSpeed * elapsed)) / sighting.waveLength + sighting.wavePhase);
      y += sighting.bob * Math.sin(1.1 * elapsed + 2.1 * share) ;
      y -= SINK * (1 - emergence(sighting, time, along));
      const sway = sighting.sway * share * Math.sin((2 * Math.PI * along) / 2.8 - 1.7 * elapsed);
      knot.point.set(headX - headingX * along + sideX * sway, y, headZ - headingZ * along + sideZ * sway);
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
    if (highest < -0.6) return false;
    this.skin.churn.value = Math.min(sighting.speed / 1.2, 1) * emergence(sighting, time, 0);
    this.buildSkin(sighting);
    return true;
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

  /** Tangents along the spine and a frame carried along it without twist (parallel transport), turned by each point's roll. */
  frames() {
    const spine = this.spine;
    for (let index = 0; index < SPINE_POINTS; index++) {
      const before = spine[Math.max(index - 1, 0)].point, after = spine[Math.min(index + 1, SPINE_POINTS - 1)].point;
      spine[index].tangent.subVectors(before, after).normalize();   // toward the head
    }
    const up = new THREE.Vector3(0, 1, 0);
    const tail = spine[SPINE_POINTS - 1];
    tail.normal.copy(up).addScaledVector(tail.tangent, -up.dot(tail.tangent)).normalize();
    for (let index = SPINE_POINTS - 2; index >= 0; index--) {
      const knot = spine[index];
      knot.normal.copy(spine[index + 1].normal).addScaledVector(knot.tangent, -spine[index + 1].normal.dot(knot.tangent)).normalize();
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

  /** The tube round the spine: an ellipse across, wider than deep, lumpy by the sighting's seed; its colours darker below, mottled. */
  buildSkin(sighting) {
    const positions = this.geometry.attributes.position.array;
    const colors = this.geometry.attributes.color.array;
    const lumps = sighting.lumpPhases;
    const tone = 0.85 + 0.3 * sighting.tone;
    for (let along = 0; along < SPINE_POINTS; along++) {
      const knot = this.spine[along];
      const share = along / (SPINE_POINTS - 1);
      for (let around = 0; around < AROUND; around++) {
        const angle = (around / AROUND) * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const lump = 1 + 0.05 * Math.sin(17 * share * Math.PI + 2 * angle + lumps[0]) * Math.sin(29 * share + lumps[1])
          + 0.03 * Math.sin(41 * share + 3 * angle + lumps[2]) + 0.02 * Math.sin(7 * angle + 53 * share + lumps[3]);
        const across = knot.radius * lump / Math.sqrt(knot.flat), up = knot.radius * lump * knot.flat;
        const offset = (along * AROUND + around) * 3;
        positions[offset] = knot.point.x + knot.binormal.x * cos * across + knot.normal.x * sin * up;
        positions[offset + 1] = knot.point.y + knot.binormal.y * cos * across + knot.normal.y * sin * up;
        positions[offset + 2] = knot.point.z + knot.binormal.z * cos * across + knot.normal.z * sin * up;
        // Darker under, a little olive and mottled over the back.
        const mottle = 0.8 + 0.35 * (0.5 + 0.5 * Math.sin(23 * share + 1.7 * Math.sin(3 * angle + lumps[4]) + lumps[5]));
        const shade = tone * mottle * (0.55 + 0.45 * (0.5 + 0.5 * sin));
        colors[offset] = SKIN.color[0] * shade * (1 + SKIN.spread * 0.2);
        colors[offset + 1] = SKIN.color[1] * shade;
        colors[offset + 2] = SKIN.color[2] * shade * (1 - SKIN.spread * 0.3);
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
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
    const contacts = uniforms.uVisitorContacts.value;
    const bow = (sighting.speed * sighting.speed) / (2 * GRAVITY);
    const placed = [];
    for (const { front, top } of pieces) placed.push({ index: front, height: (bow + 0.02) * Math.min(top / 0.15 + 0.3, 1) });
    for (const { back, front, top } of pieces) if (back > front + 2) placed.push({ index: back, height: 0.5 * (bow + 0.01) * Math.min(top / 0.15 + 0.3, 1) });
    for (let slot = 0; slot < VISITOR_CONTACTS; slot++) {
      const contact = placed[slot];
      if (!contact) { contacts[slot].set(0, 0, 1, 0); continue; }
      const knot = this.spine[contact.index];
      const width = Math.max(knot.radius / Math.sqrt(knot.flat), 0.08);
      contacts[slot].set(knot.point.x, knot.point.z, width, contact.height);
    }
    // Rings: a breach's where the front first comes up, a dive's where it goes down (a startled dive's heavier).
    const rings = uniforms.uVisitorRings.value;
    const shows = sighting.crest > -0.02 || sighting.neckLength > 0;
    const breachAt = sighting.start + sighting.rise * 0.65;
    const diveAt = sighting.sinkStart + sighting.sinkSeconds * 0.35;
    const events = [
      { at: breachAt, strength: shows ? RING_STRENGTH.breach : RING_STRENGTH.breach * 0.4 },
      { at: diveAt, strength: sighting.startled ? RING_STRENGTH.startled : shows ? RING_STRENGTH.dive : RING_STRENGTH.dive * 0.4 },
    ];
    for (let slot = 0; slot < VISITOR_RINGS; slot++) {
      const event = events[slot];
      if (!event || time <= event.at) { rings[slot].set(0, 0, 0, 0); continue; }
      const [x, z] = headAt(sighting, event.at);
      const middle = Math.min(1.2, sighting.length * 0.15);   // a little behind the head: where most of it moves the water
      rings[slot].set(x - sighting.headingX * middle, z - sighting.headingZ * middle, time - event.at, event.strength * (sighting.girth / 0.45) ** 2);
    }
  }
}

/** The distance from (x, z) to the segment from (fromX, fromZ) to (toX, toZ). */
function distanceToSegment(x, z, fromX, fromZ, toX, toZ) {
  const alongX = toX - fromX, alongZ = toZ - fromZ;
  const lengthSquared = alongX * alongX + alongZ * alongZ;
  const share = lengthSquared > 0 ? Math.min(Math.max(((x - fromX) * alongX + (z - fromZ) * alongZ) / lengthSquared, 0), 1) : 0;
  return Math.hypot(x - fromX - share * alongX, z - fromZ - share * alongZ);
}
