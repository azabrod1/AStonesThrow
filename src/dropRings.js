// Drop rings: the little rings a splash's bigger drops leave where they come
// down, as each drop of a real stone's splash does (a few concentric ripples
// a few centimetres across round every landing, gone within a second).
//
// Why not the solver. Each landing drop also pushes a splat into the solver
// (src/splash.js, its landings), but the solver's cells are 1.2 cm on High
// and 2.3 cm on Medium and Low (src/spectralWater.js: 6 m over its grid),
// and the ring a drop leaves is a train of capillary crests closing up on
// the slowest waves, 1.7 cm long: the grid cannot hold it. The solver keeps
// the larger, slower bump of the landing (a splat 1.5 cm or more across);
// the train is drawn here. The two do not double: frames of the reference
// throw with the landing splats left out look the same as with them, the
// drawn rings being all that a landing shows.
//
// The ring. The rain already has it: tools/rain-probe.mjs's table of a
// raindrop's ring (assets/rain/ring.json and ring_profile.bin: height and
// radial slope over radius and time, for a reference drop 2 mm across at
// 6.5 m/s), which src/rain.js uploads as a half-float texture with its
// mipmaps. A drop ring is that ring scaled to its drop as a capillary ring
// scales (the rain's drops are, RAIN_TILE_FRAGMENT): of size f it is
// f·η(r/f, t/f^1.5), and its slope η′(r/f, t/f^1.5), so f stretches it
// and slows it but leaves its steepness. f is the drop's diameter over the
// reference's, capped at DROP_RING.largestSize: a drop of DROP_CEILING
// (src/crown.js, 4 mm radius) would be f = 4, but the train's crests are
// about 1.7·f cm long, and from f = 3 (5 cm, four of the High solver's
// cells) the solver's splat holds them.
//
// Its height. The table is for a drop landing at 6.5 m/s, a raindrop's
// terminal speed; a splash's drops come down from tens of centimetres (one
// falling 20 cm lands at 2 m/s). Its slopes are scaled by min(√f·v/6.5, 1)·
// DROP_RING.strength: the ring's energy, capillary waves' σ∫|∇η|² dA, which
// for a ring scaled by f and weighted w grows as w²f², is taken to be a fixed
// share of the drop's kinetic energy, which grows as f³v². The other scaling
// one can argue, the crater's depth (which sets the ring's height in the
// probe's linear model: depth ∝ D·Fr^¼, so w ∝ f^−¼·(v/6.5)^½), gives within
// a third of it over the splash's 1 to 2.5 m/s and f of 1.5 to 3.
//
// Which drops. Every landing drop of radius DROP_RING.least or more on open
// water (src/splash.js: not the pool's deck, not the beach), crowned or
// not: a landing crown's ring is drawn too. The splash hands each substep's
// landings biggest first. At most liveLimit rings are drawn at once (the
// quality presets' dropRings, src/main.js; MAX_DROP_RINGS, the shader's
// arrays, on any). A drop landing when they are all taken gets no ring, but
// the one that shows least now (its weight and fade over its age in the
// reference ring's seconds: the table's steepest slope falls about as 1/t)
// fades out over DROP_RING.fadeOut if it shows less than yieldShare of what
// the newcomer would, so a later drop finds room and no ring ever vanishes
// at once, and none goes before its crests have formed (a quarter of a
// young ring's slope: 0.08 s of the reference ring's time, 0.4 s for f = 3).
// A splash's drops come down in a burst (a reference throw's, some 230 of
// 1.5 mm or more, half of them within 0.18 s of the impact and 14 cm of
// it, round its own ring: tools/drop-ring-probe.mjs): the room goes to the
// first, biggest first, and comes back as they age. Drops
// of one lump land together, a few centimetres apart: one landing within
// DROP_RING.mergeReach·f of a ring at most mergeSeconds after it joins that
// ring, adding its energy (the weights' root sum of squares, at most
// DROP_RING.heaviest: crests a centimetre or two apart are out of step), so
// a lump's dozen drops take one place, not twelve.
//
// A ring lives DROP_RING.life of the reference ring's seconds scaled by
// f^1.5, at most DROP_RING.longest seconds, fading out over the table's last
// fadeShare of that, and is drawn out to f·DROP_RING.reach, fading over the
// table's edgeShare of it: within that its train runs out at its leading
// capillary waves' speed.
//
// The table is fetched at the first impact (load: src/main.js calls it at
// each impact once the page takes input, so not for the warm-up's stone
// under the loading veil), not at startup, and only once: it is the rain's
// (Rain.load), shared with it, so a rain later finds it there and a rain
// earlier left it. Until it has come no drop ring is added or drawn (the
// drops of a first throw over a slow network may land ringless); a failed
// fetch is tried again at the next impact. The water shader binds the
// rain's 1×1 placeholder until then, so its program does not change when
// the table comes.
//
// Drawing. Each frame (update) the live rings go to the water's shader as
// uniform arrays: centre, drawn radius and f (uDropRingPlaces), age in the
// reference ring's seconds and weight (uDropRingTimes: the fall's scale
// times the fade). DROP_RING_SLOPES (src/shaders/rain.js) adds their slopes
// wherever the water adds the rain's and the stones' rings' (WATER_FRAGMENT,
// WATER_UNDER_FRAGMENT), behind a branch on uDropRingCount, so with none
// alive a frame costs what it did. Slopes only: a drop ring is a fraction of
// a millimetre high, so it displaces no mesh and lights no caustic. Each
// lookup is averaged over the pixel's footprint along the radius
// (textureGrad, as the stones' rings are) and the table's mip chain averages
// its time alike (a crest moves about one radius texel a time texel), so a
// far ring averages out instead of shimmering. A pixel outside the box that
// holds every live ring's disc (uDropRingBounds: a splash's rings lie
// about it) costs four comparisons; inside it, each live ring
// a distance test, and inside a ring's disc a fetch and some 25 operations.
// Under a gale the rings are drawn where the water is drawn (vWorld.xz),
// as the stones' rings are. In the pool a ring runs on under its walls (the
// deck hides it): it does not reflect, but it has gone within a second.
//
// tools/drop-ring-probe.mjs counts the rings of the reference throw and of a
// 12 cm rock in the pool on the CPU: the drops that ring, the rings' sizes,
// weights and lives, and that each preset's limit holds.
import * as THREE from 'three';

export const MAX_DROP_RINGS = 24;            // the shader's arrays (DROP_RING_SLOPES)
export const DEFAULT_DROP_RING_LIMIT = 24;   // rings live at once (setLiveLimit; the quality presets set it)
export const DROP_RING = {
  least: 0.0015,         // m: the smallest drop radius that leaves a ring (f = 1.5)
  referenceDiameter: 0.002,   // m: the table's drop (tools/rain-probe.mjs)
  referenceSpeed: 6.5,   // m/s: the table's drop's fall
  largestSize: 3,        // f at most (the header)
  strength: 1,           // the ring's slopes against the table's, at the table's speed
  life: 0.35,            // the reference ring's seconds a ring lives, scaled by f^1.5...
  longest: 1.2,          // ...at most this many seconds
  reach: 0.1,            // the reference ring's metres it is drawn to, scaled by f
  youngest: 0.02,        // the reference ring's seconds under which a ring counts as just landed (showing)
  fadeOut: 0.12,         // seconds a ring takes to fade when a newcomer finds no room (the header)...
  yieldShare: 0.25,      // ...if it shows less than this share of what the newcomer would
  mergeReach: 0.015,     // m per unit of f: a drop landing this near a ring...
  mergeSeconds: 0.04,    // ...this soon after it joins it (the header)
  heaviest: 1,           // the weight a ring of merged drops reaches at most
};

/** A ring's size f, its weight at the table's speed scaled, and its life (s), for a drop of `radius` falling at `fallSpeed`. */
export function dropRingShape(radius, fallSpeed) {
  const size = Math.min((2 * radius) / DROP_RING.referenceDiameter, DROP_RING.largestSize);
  const weight = DROP_RING.strength * Math.min(Math.sqrt(size) * Math.max(fallSpeed, 0) / DROP_RING.referenceSpeed, 1);
  const life = Math.min(DROP_RING.life * size ** 1.5, DROP_RING.longest);
  return { size, weight, life };
}

export class DropRings {
  /**
   * @param rain the Rain (src/rain.js) whose table and its uniforms are shared; none on the CPU
   * @param ring ring.json's numbers, for a CPU probe with no Rain (then the table counts as come)
   * @param liveLimit rings live at once
   */
  constructor({ rain = null, ring = null, liveLimit = DEFAULT_DROP_RING_LIMIT } = {}) {
    this.rain = rain;
    this.cpuRing = ring;
    this.rings = [];          // drawn: { x, z, size, weight, life, start, end (when it has faded out, if made to) }
    this.setLiveLimit(liveLimit);
    this.added = 0;           // rings added, drops merged into one, drops turned away, and rings made to fade early (for the probe)
    this.merged = 0;
    this.refused = 0;
    this.faded = 0;
    const table = rain ? rain.tilePass.material.uniforms : null;
    this.sharedUniforms = {
      uDropRingCount: { value: 0 },
      uDropRingBounds: { value: new THREE.Vector4() },
      uDropRingPlaces: { value: Array.from({ length: MAX_DROP_RINGS }, () => new THREE.Vector4()) },
      uDropRingTimes: { value: Array.from({ length: MAX_DROP_RINGS }, () => new THREE.Vector2()) },
      // The rain's own uniform objects: they follow its table when it comes (Rain.load).
      uDropRingProfile: table ? table.uProfile : { value: null },
      uDropRingTexels: table ? table.uProfileTexels : { value: new THREE.Vector2(1, 1) },
      uDropRingTableRadius: table ? table.uProfileRadius : { value: 0.3 },
      uDropRingTableTime: table ? table.uProfileTime : { value: 0.8 },
      uDropRingEdgeShare: table ? table.uEdgeShare : { value: 0.15 },
    };
  }

  /** Uniforms for every material that draws the drop rings (DROP_RING_SLOPES): shared objects. */
  uniforms() { return this.sharedUniforms; }

  /** ring.json's numbers once the table has come, else null. */
  get ring() { return this.rain ? this.rain.ring : this.cpuRing; }

  /** Whether the table has come, so rings are added and drawn. */
  get ready() { return this.ring !== null; }

  /** Rings live now. */
  get live() { return this.rings.length; }

  setLiveLimit(limit) { this.liveLimit = THREE.MathUtils.clamp(Math.round(limit), 0, MAX_DROP_RINGS); }

  /** Fetch the table (the rain's, once) if it has not come; a failure is tried again at the next call. */
  load() {
    if (this.ready || !this.rain) return;
    this.rain.load().catch(() => {});
  }

  /** How much a ring shows at splash time `time` (the header): its weight and fade over its age in reference seconds. */
  showing(ring, time) {
    const age = Math.max(time - ring.start, 0);
    return ring.weight * this.fade(ring, age) / Math.max(age / ring.size ** 1.5, DROP_RING.youngest);
  }

  /** The ring's fade at `age` seconds: out over the table's last fadeShare of its life, or sooner if made to (ring.end). */
  fade(ring, age) {
    const fadeShare = this.ring?.fadeShare ?? 0.3;
    const early = ring.end < ring.start + ring.life ? Math.min(Math.max((ring.end - ring.start - age) / DROP_RING.fadeOut, 0), 1) : 1;
    return (1 - THREE.MathUtils.smoothstep(age, ring.life * (1 - fadeShare), ring.life)) * early * early * (3 - 2 * early);
  }

  /**
   * The ring of a drop landing at splash time `time`: { x, z, radius, fallSpeed }
   * (src/splash.js's landings). Returns the ring, or null: too small, the
   * table not come, or no room (the header: then the faintest ring that
   * shows less than this one would starts to fade out, making room).
   */
  add({ x, z, radius, fallSpeed }, time) {
    if (radius < DROP_RING.least || this.liveLimit === 0) return null;
    if (!this.ready) return null;
    const shape = dropRingShape(radius, fallSpeed);
    const ring = { x, z, ...shape, start: time, end: time + shape.life };
    if (ring.weight <= 0) return null;
    for (const near of this.rings) {
      if (time - near.start > DROP_RING.mergeSeconds || Math.hypot(x - near.x, z - near.z) > DROP_RING.mergeReach * near.size) continue;
      // A drop of the same lump, landing with it: one ring, their energies added.
      near.weight = Math.min(Math.hypot(near.weight, ring.weight), DROP_RING.heaviest);
      this.merged++;
      return near;
    }
    if (this.rings.length >= this.liveLimit) {
      this.refused++;
      let faintest = null;
      for (const candidate of this.rings) {
        if (candidate.end - time <= DROP_RING.fadeOut) continue;   // fading out already
        if (!faintest || this.showing(candidate, time) < this.showing(faintest, time)) faintest = candidate;
      }
      if (faintest && this.showing(faintest, time) < DROP_RING.yieldShare * this.showing(ring, time)) {
        faintest.end = time + DROP_RING.fadeOut;
        this.faded++;
      }
      return null;
    }
    this.rings.push(ring);
    this.added++;
    return ring;
  }

  /** Every ring gone at once (the app's clearPond). */
  reset() {
    this.rings.length = 0;
    this.sharedUniforms.uDropRingCount.value = 0;
  }

  /** Retire the rings that have lived their life, and hand the materials the rest at world time `time`. */
  update(time) {
    this.rings = this.rings.filter((ring) => time < ring.end);
    while (this.rings.length > this.liveLimit) this.rings.shift();   // a lower limit (a quality change): the oldest go
    const shared = this.sharedUniforms;
    const count = this.ready ? this.rings.length : 0;
    shared.uDropRingCount.value = count;
    const bounds = shared.uDropRingBounds.value.set(Infinity, Infinity, -Infinity, -Infinity);
    for (let index = 0; index < count; index++) {
      const ring = this.rings[index];
      const age = Math.max(time - ring.start, 0);
      const reach = ring.size * DROP_RING.reach;
      shared.uDropRingPlaces.value[index].set(ring.x, ring.z, reach, ring.size);
      shared.uDropRingTimes.value[index].set(age / ring.size ** 1.5, ring.weight * this.fade(ring, age));
      bounds.set(Math.min(bounds.x, ring.x - reach), Math.min(bounds.y, ring.z - reach), Math.max(bounds.z, ring.x + reach), Math.max(bounds.w, ring.z + reach));
    }
    if (count === 0) bounds.set(0, 0, 0, 0);
  }
}
