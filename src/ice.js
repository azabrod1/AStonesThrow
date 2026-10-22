// The ice: a frozen lake or pool (the Ice setting, src/main.js setIce), a
// sheet over the water that what is thrown comes down on, slides along and,
// struck hard enough, breaks through into the water.
//
// The ice adds one piece of physics, whether it breaks, and borrows the rest:
// on it a thing is on ground (src/rock.js `ground`: it bounces, tumbles,
// rolls and rests as on the pool's deck, the ice slick: ICE_MATERIAL), things
// on it knock each other along (src/collide.js), and through it a thing goes
// into the water as into open water (src/rock.js breakThrough: the cavity,
// the jet, the foam, the drops), with no crown (src/splash.js: its sheet
// stands on ice). So whatever improves those improves the ice.
//
// The sheet. It is ICE_THICKNESS thick (h) and floats with ρi/ρw of it under
// the water, so its top stands h·(1 − ρi/ρw) above the still water (`top`:
// 0.8 mm for thin ice, 3.3 mm for thick). It is rigid: a floating plate
// bends over its characteristic length l_c = (E·h³/(12·(1 − ν²)·ρw·g))^¼
// (0.54 m for 1 cm, 1.5 m for 4 cm), so every wave the splash makes in the
// 6 m patch is stiffened by orders of magnitude, and the solver
// (src/spectralWater.js) runs on under it unchanged, seen only in the holes.
//
// Breaking. A thing coming down on the ice strikes it with a blow
// m·v²/R (its mass, the speed it comes down at, its collision radius: a
// force scale, its momentum over the time its own size takes to pass), less
// for a thing that spreads the blow over a longer touch (ICE.give: a hollow
// ball, a soft thing as far as it has thawed). The ice holds a blow of up to
// ICE.strength·h², times e^(ICE.spread·N(0,1)) from blow to blow (floating
// ice bears a load as h², Gold's P = A·h²; the strength here is set so that
// tools/ice-probe.mjs's table of what breaks what comes out, not measured:
// a dynamic punch through floating ice is local crushing and the plate's
// inertia, which no closed form gives, so it is uncertain by a factor of a
// few). Only the speed down counts: a lob breaks through where a hard, flat
// throw skids off. A blow it holds but over ICE.crackShare of what it holds
// stars the ice with cracks (CRACK.star). One it does not hold opens a hole:
// the thing keeps the share `keep` of its speed (the break takes about the
// holding force times the thickness from its energy, at least ICE.keepLeast
// of its speed kept) and goes in (src/rock.js breakThrough). Things that do
// not fit through a hole meet its edge (meet), which holds or breaks the
// same way; ones that do but whose splash would stand on the ice open it
// wider. A hole only opens where the solver's water is (in the patch less
// HOLE.edge; in the pool inside its walls less it): beyond, the ice holds.
//
// A hole is as wide as the cavity's lip (src/cavity.js): opened at once as a
// round hole's lip would be (roundLipReach), then, once the splash has made
// its cavity, fitted to that cavity's own lip, lopsided and drawn forward as
// it is (fitCavity: Cavity.lipReach, its crest at its widest and HOLE.fall of
// its fall outside), so the hole holds the cavity, its lip and the jet. Its
// edge is broken: a polygon of HOLE.corners corners, each out beyond the lip
// by HOLE.margin and a jag of its own, with a few bites where a piece broke
// away, drawn from the hole's own seeded stream (so a seeded throw breaks
// the same hole every run). Radial cracks run out from its corners, CRACK
// .count of them, each a random walk of CRACK.reach times l_c, with a
// branch now and then and, at CRACK.ring odds, an arc of ring crack around
// it (settle).
//
// The mask (update): what the shaders know of the ice, an RGBA8 texture of
// MASK.texels² over the solver's patch (1.2 cm texels), linearly filtered:
// R the signed distance to the nearest hole's edge, negative inside one (ice
// where it is positive), capped at MASK.holeFar either way; G the distance
// to the nearest crack, signed by its side along a crack's span (so it
// interpolates across the crack exactly), capped at MASK.crackFar; each as
// a byte, 127.5·(1 + d/far) (ICE_MASK in src/shaders/scene.js reads them
// back); B and A held for the ice's wet and a hole's new skin. A hole and
// its cracks are painted into it once, the frame after they open: holes as
// the least of signed distances (their union), their insides by scanline
// and the distance in a band about each edge; each crack in a band about
// it; only what changed is converted. Beyond the patch there is ice and no
// hole. The physics never reads the mask: it asks the holes' polygons.
//
// The ground (ground(deck)): src/rock.js's `ground` for everything thrown
// while the ice is on: `at` the ice's top over the water but in a hole (the
// pool's deck round a frozen pool; a frozen lake's beach and bank behind its
// waterline), `materialAt` the ice's own surface over the water, `meet` the
// break (above). `contain` holds a floater that went in by a hole inside it
// (src/collide.js, as the pool's walls hold things), so it comes up there and
// never floats under the ice. `events` keeps the breaks and cracks for
// src/main.js's sound (src/sound.js ice).
import * as THREE from 'three';
import { groundHeightAt, shoreDistance } from './pondFloor.js';
import { roundLipReach } from './cavity.js';

const GRAVITY = 9.81;
const WATER_DENSITY = 1000;

export const ICE = {
  density: 917,          // kg/m³
  modulus: 9e9,          // Pa: freshwater ice's Young's modulus (9 to 10 GPa)
  poisson: 0.33,
  strength: 1.28e6,      // N/m²: it holds a blow of up to this times h² (the header)...
  spread: 0.2,           // ...times e^(spread·N(0,1)) from blow to blow
  crackShare: 0.6,       // a blow it holds but over this share of what it holds stars it with cracks
  give: { shell: 0.15, soft: 0.3 },   // a hollow ball's blow (its touch lasts some ten times a stone's), and a soft thing's, against a rigid thing's of its mass and speed
  keepLeast: 0.4,        // the least share of its speed a thing keeps breaking through
};
// The Ice setting's choices (src/main.js): the sheet's thickness, metres. Everything here takes metres.
export const ICE_THICKNESS = { none: 0, thin: 0.01, thick: 0.04 };
// The ice's own surface (src/rock.js `ground` material): slick. A stone on it slides more than it tumbles.
export const ICE_MATERIAL = Object.freeze({ kind: 'ice', friction: 0.1, rolling: 0.01, tumbling: 0.12, tumble: 0.15 });
// A hole (the header): corners round it; the lip's fall it takes in (Cavity.lipReach's `fall`); each corner out beyond
// the lip by `margin` and a jag from 0 to `jag` of the lip's reach, besides the slow waves `waves` (amplitude, each of
// modes 2 to 5); `bites` (least, most) where a piece broke away, each `bite` (least, most) deeper over `biteSpan`
// corners; at least `least` collision radii wide; kept `edge` (m) inside the solver's patch or the pool's walls; at
// most `most` holes (past them the ice holds: a lake so broken has done its work).
// A thing going in by a hole narrower than its splash's lip opens it wider if faster than `widensFrom` (m/s).
const HOLE = { corners: 36, fall: 0.5, margin: 0.06, jag: 0.16, waves: 0.04, bites: [1, 3], bite: [0.12, 0.35], biteSpan: [2, 4], least: 1.3, edge: 0.15, most: 64, widensFrom: 2 };
// Cracks (settle): `count` (least, most) radial ones from a hole's corners, each `reach` (least, most) times l_c long, at
// most `longest` (m), in steps of `step` (least, most; m), its heading wandering by `wander` (radians, σ, per 5 cm); a
// branch at `branch` odds a step, `branchReach` of l_c long, `branchAngle` off (least, most; radians); at `ring` odds an
// arc of ring crack at `ringRadius` (least, most) hole radii, over `ringSpan` (least, most; radians); a blow the ice
// holds stars it with `star` (least, most) cracks `starReach` of l_c long.
const CRACK = {
  count: [4, 8], reach: [0.6, 1.6], longest: 3, step: [0.03, 0.06], wander: 0.11, branch: 0.06, branchReach: [0.1, 0.35], branchAngle: [0.35, 0.9],
  ring: 0.5, ringRadius: [1.4, 2.2], ringSpan: [1.0, 2.6], star: [3, 6], starReach: [0.12, 0.45],
};
// The mask (the header): texels a side over the solver's patch, and the caps of its distances (m).
const MASK = { texels: 512, holeFar: 0.06, crackFar: 0.02 };

/** A seeded random stream (mulberry32), as src/rock.js's. */
function seededStream(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A standard normal draw (Box–Muller). */
function gaussian(random) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}
const between = (random, [least, most]) => least + (most - least) * random();

/** The characteristic length of floating ice `thickness` thick (m; the header). */
export function iceLength(thickness) {
  return ((ICE.modulus * thickness ** 3) / (12 * (1 - ICE.poisson ** 2) * WATER_DENSITY * GRAVITY)) ** 0.25;
}

/** The distance from (x, z) to the segment from (ax, az) to (bx, bz), and how far along it the nearest point lies (0 to 1, unclamped). */
function segmentDistance(x, z, ax, az, bx, bz, out) {
  const alongX = bx - ax, alongZ = bz - az;
  const lengthSquared = alongX * alongX + alongZ * alongZ;
  const along = lengthSquared > 0 ? ((x - ax) * alongX + (z - az) * alongZ) / lengthSquared : 0;
  const share = Math.min(Math.max(along, 0), 1);
  out.distance = Math.hypot(x - ax - alongX * share, z - az - alongZ * share);
  out.along = along;
  out.side = alongX * (z - az) - alongZ * (x - ax);   // its sign: which side of the segment's line (x, z) is on
  return out;
}
const nearest = { distance: 0, along: 0, side: 0 };

/** Whether (x, z) is inside a closed polygon of corners [x0, z0, x1, z1, …] (crossing number). */
function insidePolygon(corners, x, z) {
  let inside = false;
  const count = corners.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const ax = corners[2 * index], az = corners[2 * index + 1], bx = corners[2 * previous], bz = corners[2 * previous + 1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** The distance from (x, z) to a closed polygon's edge (m). */
function polygonEdgeDistance(corners, x, z) {
  let least = Infinity;
  const count = corners.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    least = Math.min(least, segmentDistance(x, z, corners[2 * previous], corners[2 * previous + 1], corners[2 * index], corners[2 * index + 1], nearest).distance);
  }
  return least;
}

export class IceSheet {
  /**
   * The ice over the solver's patch (`domainMin`, `domainSize`: src/
   * spectralWater.js's), off (no thickness) until setThickness.
   */
  constructor({ domainMin, domainSize, texels = MASK.texels }) {
    this.domainMin = [domainMin[0], domainMin[1]];
    this.domainSize = domainSize;
    this.texels = texels;
    this.cell = domainSize / texels;
    this.thickness = 0;
    this.pool = null;            // the pool's square ({ minX, minZ, size }) when the water is the pool's, else the lake (setPool)
    this.deck = null;            // the pool's deck as ground (src/pool.js poolGround), round a frozen pool
    this.holes = [];
    this.cracks = [];            // polylines ([x0, z0, x1, z1, …]) not yet painted
    this.events = [];            // breaks and cracks since src/main.js last took them (its sound)
    this.streams = new WeakMap();   // each thing's own stream of the ice's draws, seeded from its splash's seed
    // The mask (the header): half floats for the GPU, and R and G as floats here, to paint unions into.
    this.holeField = new Float32Array(texels * texels).fill(MASK.holeFar);
    this.crackField = new Float32Array(texels * texels).fill(MASK.crackFar);
    this.maskData = new Uint8Array(texels * texels * 4);
    this.changed = [];           // rectangles of texels painted since the mask was last filled
    this.fillMask();
    this.texture = new THREE.DataTexture(this.maskData, texels, texels, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    // The shaders' (src/shaders/scene.js ICE_MASK): shared objects, which setThickness and update fill.
    this.uniforms = {
      uIceMask: { value: this.texture },
      uIceArea: { value: new THREE.Vector3(this.domainMin[0], this.domainMin[1], domainSize) },
      uIceOn: { value: 0 },
      uIceTop: { value: 0 },
      uIceThickness: { value: 0 },
      uIceFar: { value: new THREE.Vector2(MASK.holeFar, MASK.crackFar) },   // the caps the mask's bytes span (fillMask)
      uIceWet: { value: 0 },   // how wet the rain has made it: src/main.js shares the weather's object
    };
    this.dirty = false;
    // The ground (src/rock.js `ground`): the ice, over the deck round a frozen pool.
    this.groundObject = {
      at: (x, z) => this.at(x, z),
      materialAt: (x, z) => (this.overWater(x, z) ? ICE_MATERIAL : null),
      meet: (rock, height) => this.meet(rock, height),
    };
  }

  /** Whether there is ice. */
  get on() { return this.thickness > 0; }

  /** The ice's top over the still water (m: the header). */
  get top() { return this.thickness * (1 - ICE.density / WATER_DENSITY); }

  /** Its characteristic length (m: the header). */
  get length() { return iceLength(this.thickness); }

  /** The ice `metres` thick (0: none), whole again: every hole and crack gone. */
  setThickness(metres) {
    this.thickness = Math.max(metres, 0);
    this.uniforms.uIceOn.value = this.on ? 1 : 0;
    this.uniforms.uIceTop.value = this.top;
    this.uniforms.uIceThickness.value = this.thickness;
    this.clear();
  }

  /** The water it covers: the pool's square and its deck (`deck`, src/pool.js poolGround), or the lake (null). */
  setPool(square, deck = null) {
    this.pool = square ?? null;
    this.deck = square ? deck : null;
    this.clear();
  }

  /** Whole again: no hole, no crack. */
  clear() {
    this.holes.length = 0;
    this.cracks.length = 0;
    this.events.length = 0;
    this.holeField.fill(MASK.holeFar);
    this.crackField.fill(MASK.crackFar);
    this.maskData.fill(0);
    this.fillMask();
    this.changed.length = 0;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  /** The ground for src/rock.js (the header). */
  get ground() { return this.groundObject; }

  /** Whether (x, z) lies over the water the ice covers: the lake out from its waterline, or inside the pool's walls. */
  overWater(x, z) {
    const pool = this.pool;
    if (pool) return x > pool.minX && x < pool.minX + pool.size && z > pool.minZ && z < pool.minZ + pool.size;
    return shoreDistance(x, z) > 0;
  }

  /** Whether a hole may open at (x, z), `reach` (m) about it: over the solver's water, HOLE.edge inside its patch or the pool's walls. */
  mayOpen(x, z, reach) {
    const box = this.pool ?? { minX: this.domainMin[0], minZ: this.domainMin[1], size: this.domainSize };
    const room = reach + HOLE.edge;
    return this.holes.length < HOLE.most && x - room > box.minX && x + room < box.minX + box.size && z - room > box.minZ && z + room < box.minZ + box.size && this.overWater(x, z);
  }

  /** The hole (x, z) is in, or null. */
  holeAt(x, z) {
    for (let index = this.holes.length - 1; index >= 0; index--) {
      const hole = this.holes[index];
      if (Math.hypot(x - hole.x, z - hole.z) <= hole.outer && insidePolygon(hole.corners, x, z)) return hole;
    }
    return null;
  }

  /** How far (x, z), in a hole, is from the ice (m: the farthest from the edge of any hole it is in; the holes' union is at least that open), or 0. */
  clearance(x, z) {
    let clear = 0;
    for (const hole of this.holes) {
      if (Math.hypot(x - hole.x, z - hole.z) > hole.outer || !insidePolygon(hole.corners, x, z)) continue;
      clear = Math.max(clear, polygonEdgeDistance(hole.corners, x, z));
    }
    return clear;
  }

  /** The ground's height at (x, z) (src/rock.js `ground`): the ice's top over the water but in a hole; the deck round a pool, the land behind a lake's waterline. */
  at(x, z) {
    if (!this.on) return this.deck ? this.deck.at(x, z) : null;
    if (this.pool) {
      if (!this.overWater(x, z)) return this.deck ? this.deck.at(x, z) : null;
    } else if (shoreDistance(x, z) <= 0) {
      return Math.max(groundHeightAt(x, z), this.top);
    }
    return this.holeAt(x, z) ? null : this.top;
  }

  /** The ice's draws for a thing: a stream of its own, seeded from its splash's seed, so a seeded throw breaks alike however it is stepped. */
  streamFor(rock) {
    if (!this.streams.has(rock)) this.streams.set(rock, seededStream((rock.splashSeed ?? 0) ^ 0x1ce5eed));
    return this.streams.get(rock);
  }

  /**
   * The blow a thing strikes coming down at its speed now (N: the header),
   * over its collision radius, or a plate's face's (it comes down flat).
   */
  blow(rock) {
    const down = Math.max(-rock.velocity.y, 0);
    const thing = rock.thing;
    const give = thing.hollow ? ICE.give.shell : thing.body.soft ? 1 - (1 - ICE.give.soft) * (rock.thawed ?? 1) : 1;
    return (give * rock.mass * down * down) / (rock.plate ? rock.faceRadius : rock.collisionRadius);
  }

  /** What the ice holds this time (N: the header), drawn from `random`. */
  holds(random) {
    return ICE.strength * this.thickness ** 2 * Math.exp(ICE.spread * gaussian(random));
  }

  /**
   * A thing coming down on the ground (`height`) or onto the water (null)
   * (src/rock.js `ground` meet; the header): `{ ground: height }` if the ice
   * holds it (it lands on it, even over a hole too small for it: then moved
   * off the hole onto the ice), `{ hole, broke, keep, open }` if it goes into
   * the water by a hole (broke: the ice gave way, or opened wider for its
   * splash; keep: the share of its speed it keeps; open: whether the water
   * about it is open enough for its whole splash, a crown standing on it),
   * or null: no ice here.
   */
  meet(rock, height) {
    if (!this.on) return null;
    const x = rock.position.x, z = rock.position.z;
    if (!this.overWater(x, z)) return null;
    if (height !== null) return this.strike(rock);
    const hole = this.holeAt(x, z);
    // Onto the water over the ice (it came over a hole's edge in the air): it strikes the ice there.
    if (!hole) return this.strike(rock) ?? { ground: this.top };
    // Too wide for the hole: it strikes the hole's edge, which holds (it lands on the ice beside the hole) or breaks.
    if (hole.inner < rock.collisionRadius) {
      const struck = this.strike(rock);
      if (struck) return struck;
      this.moveOffHole(rock, hole);
      return { ground: this.top };
    }
    // It fits through. Its splash would stand on the ice if the hole is narrower than its lip: a fast one opens the
    // hole wider (the water it throws aside breaks the edge); a slow one (sliding in off the edge) goes in without its
    // crown.
    const speed = rock.velocity.length(), horizontal = Math.hypot(rock.velocity.x, rock.velocity.z);
    const room = roundLipReach(rock.radius, speed, horizontal / Math.max(speed, 1e-6), 0, HOLE.fall);
    if (this.clearance(x, z) >= room) return { hole, broke: false, keep: 1, open: true };
    if (speed < HOLE.widensFrom || !this.mayOpen(x, z, room)) return { hole, broke: false, keep: 1, open: false };
    return { hole: this.openHole(rock, x, z), broke: true, keep: 1, open: false };
  }

  /** A thing over a hole too small for it, its edge holding: moved out, away from the hole's middle, until its middle is over the ice. */
  moveOffHole(rock, hole) {
    let awayX = rock.position.x - hole.x, awayZ = rock.position.z - hole.z;
    const away = Math.hypot(awayX, awayZ);
    if (away < 1e-6) { awayX = 1; awayZ = 0; } else { awayX /= away; awayZ /= away; }
    let distance = Math.max(away, 0);
    while (this.holeAt(hole.x + awayX * distance, hole.z + awayZ * distance) && distance < hole.outer + 1) distance += 0.005;
    rock.position.x = hole.x + awayX * (distance + 0.002);
    rock.position.z = hole.z + awayZ * (distance + 0.002);
  }

  /**
   * A thing striking the ice (meet; the header): null if the ice holds (a
   * near miss stars it with cracks), else the hole it opens, broke, and the
   * share of its speed it keeps.
   */
  strike(rock) {
    const random = this.streamFor(rock);
    const blow = this.blow(rock);
    const holds = this.holds(random);
    const x = rock.position.x, z = rock.position.z;
    const speed = rock.velocity.length(), horizontal = Math.hypot(rock.velocity.x, rock.velocity.z);
    const reach = roundLipReach(rock.radius, speed, horizontal / Math.max(speed, 1e-6), 1, HOLE.fall) * (1 + HOLE.margin + HOLE.jag);
    this.lastStrike = { blow, holds, x, z };   // for tools/ice-probe.mjs
    if (blow < holds || !this.mayOpen(x, z, reach)) {
      if (blow > ICE.crackShare * holds) this.star(x, z, random, blow / holds);
      return null;
    }
    const energy = 0.5 * rock.mass * speed * speed;
    const work = holds * this.thickness;
    const keep = Math.sqrt(Math.max(1 - work / Math.max(energy, 1e-9), ICE.keepLeast ** 2));
    const hole = this.openHole(rock, x, z);
    this.events.push({ kind: 'break', x, z, strength: blow / holds, radius: rock.radius, thickness: this.thickness });
    return { hole, broke: true, keep, open: false };
  }

  /**
   * A hole opened at (x, z) by a thing going in there (strike, meet): as wide
   * as a round hole's lip for its speed and its direction (roundLipReach),
   * until fitCavity fits it to its cavity's.
   */
  openHole(rock, x, z) {
    const random = this.streamFor(rock);
    const speed = rock.velocity.length(), horizontal = Math.hypot(rock.velocity.x, rock.velocity.z);
    const fraction = Math.min(horizontal / Math.max(speed, 1e-6), 1);
    const headingX = horizontal > 1e-4 ? rock.velocity.x / horizontal : 1, headingZ = horizontal > 1e-4 ? rock.velocity.z / horizontal : 0;
    const corners = HOLE.corners;
    const hole = {
      x, z, radius: rock.radius, least: HOLE.least * rock.collisionRadius,
      seed: Math.floor(random() * 4294967296), corners: new Float64Array(2 * corners), inner: 0, outer: 0,
      settled: false, painted: false, cracks: [],
    };
    // Each corner's azimuth, a little off even, from the hole's own stream.
    const shapeRandom = seededStream(hole.seed);
    hole.angles = Float64Array.from({ length: corners }, (unused, index) => (2 * Math.PI * (index + 0.35 * (shapeRandom() - 0.5))) / corners);
    hole.cosines = hole.angles.map(Math.cos);
    hole.sines = hole.angles.map(Math.sin);
    const reaches = hole.cosines.map((cosine, index) => roundLipReach(rock.radius, speed, fraction, cosine * headingX + hole.sines[index] * headingZ, HOLE.fall));
    this.shapeHole(hole, reaches);
    this.holes.push(hole);
    this.dirty = true;
    return hole;
  }

  /**
   * Fit a hole to the cavity the thing that broke it opened (src/cavity.js,
   * src/main.js after the splash's impact): each corner out beyond the
   * cavity's lip (Cavity.lipReach) as openHole put it beyond a round one's.
   */
  fitCavity(hole, cavity) {
    if (!hole || !cavity || hole.settled) return;
    const reaches = cavity.lipReach(hole.x, hole.z, hole.cosines, hole.sines, new Float64Array(hole.cosines.length), HOLE.fall);
    this.shapeHole(hole, reaches);
  }

  /**
   * A hole's corners from the lip's reach along each corner's azimuth
   * (`reaches`, m): each beyond it by HOLE.margin, the slow waves and its own
   * jag, deeper where a piece broke away (the header), at least `least` out,
   * and inside where a hole may be (mayOpen's box); then its inner and outer
   * radius about its middle.
   */
  shapeHole(hole, reaches) {
    const random = seededStream(hole.seed ^ 0x5eed);
    const count = hole.angles.length;
    const waves = [2, 3, 4, 5].map((mode) => ({ mode, amplitude: HOLE.waves * random(), phase: 2 * Math.PI * random() }));
    const bites = new Float64Array(count);
    const biteCount = Math.round(between(random, HOLE.bites));
    for (let bite = 0; bite < biteCount; bite++) {
      const centre = Math.floor(random() * count), span = between(random, HOLE.biteSpan), depth = between(random, HOLE.bite);
      for (let offset = -Math.ceil(span); offset <= Math.ceil(span); offset++) {
        const share = Math.max(1 - Math.abs(offset) / span, 0);
        const corner = (centre + offset + count) % count;
        bites[corner] = Math.max(bites[corner], depth * share);
      }
    }
    const box = this.pool ?? { minX: this.domainMin[0], minZ: this.domainMin[1], size: this.domainSize };
    const low = [box.minX + HOLE.edge, box.minZ + HOLE.edge], high = [box.minX + box.size - HOLE.edge, box.minZ + box.size - HOLE.edge];
    let outer = 0;
    for (let index = 0; index < count; index++) {
      const angle = hole.angles[index];
      const slow = waves.reduce((sum, wave) => sum + wave.amplitude * (1 + Math.cos(wave.mode * angle + wave.phase)) / 2, 0);
      const out = Math.max(reaches[index] * (1 + HOLE.margin + slow + HOLE.jag * random() + bites[index]), hole.least);
      const x = Math.min(Math.max(hole.x + hole.cosines[index] * out, low[0]), high[0]);
      const z = Math.min(Math.max(hole.z + hole.sines[index] * out, low[1]), high[1]);
      hole.corners[2 * index] = x;
      hole.corners[2 * index + 1] = z;
      outer = Math.max(outer, Math.hypot(x - hole.x, z - hole.z));
    }
    hole.outer = outer;
    hole.inner = polygonEdgeDistance(hole.corners, hole.x, hole.z);
  }

  /** A blow the ice held stars it (strike): CRACK.star cracks from where it struck, `share` of what it holds the blow's. */
  star(x, z, random, share) {
    const count = Math.round(between(random, CRACK.star));
    const length = this.length;
    const start = 2 * Math.PI * random();
    for (let crack = 0; crack < count; crack++) {
      const heading = start + (2 * Math.PI * (crack + 0.4 * (random() - 0.5))) / count;
      const reach = between(random, CRACK.starReach) * length * Math.min(share, 1);
      this.cracks.push(this.walk(x, z, heading, reach, random, false));
    }
    this.events.push({ kind: 'crack', x, z, strength: share, thickness: this.thickness });
    this.dirty = true;
  }

  /**
   * A crack from (x, z) along `heading` (radians from +x toward +z), `reach`
   * metres long at most, wandering (CRACK.wander), stopping where the ice
   * ends (the pool's walls, the shore, the patch's edge); a branch now and
   * then if `branches`. Returns its points; its branches go to this.cracks.
   */
  walk(x, z, heading, reach, random, branches) {
    const points = [x, z];
    let travelled = 0;
    const box = this.pool ?? { minX: this.domainMin[0], minZ: this.domainMin[1], size: this.domainSize };
    const inside = (pointX, pointZ) => pointX > box.minX && pointX < box.minX + box.size && pointZ > box.minZ && pointZ < box.minZ + box.size && this.overWater(pointX, pointZ);
    while (travelled < reach) {
      const step = Math.min(between(random, CRACK.step), reach - travelled);
      heading += CRACK.wander * gaussian(random) * Math.sqrt(step / 0.05);
      const nextX = x + Math.cos(heading) * step, nextZ = z + Math.sin(heading) * step;
      if (!inside(nextX, nextZ)) break;
      x = nextX; z = nextZ;
      points.push(x, z);
      travelled += step;
      if (branches && random() < CRACK.branch) {
        const turn = between(random, CRACK.branchAngle) * (random() < 0.5 ? -1 : 1);
        this.cracks.push(this.walk(x, z, heading + turn, between(random, CRACK.branchReach) * this.length, random, false));
      }
    }
    return points;
  }

  /** A hole's cracks (the header), once its shape is final: radial ones from its corners and, at CRACK.ring odds, an arc of ring crack. */
  settle(hole) {
    if (hole.settled) return;
    hole.settled = true;
    const random = seededStream(hole.seed ^ 0xc4ac);
    const length = this.length;
    const count = Math.round(between(random, CRACK.count));
    const corners = hole.angles.length;
    const start = random() * corners;
    for (let crack = 0; crack < count; crack++) {
      const corner = Math.floor(start + (corners * (crack + 0.5 * (random() - 0.5))) / count) % corners;
      const x = hole.corners[2 * corner], z = hole.corners[2 * corner + 1];
      const heading = Math.atan2(z - hole.z, x - hole.x) + 0.3 * (random() - 0.5);
      const reach = Math.min(between(random, CRACK.reach) * length, CRACK.longest);
      hole.cracks.push(this.walk(x, z, heading, reach, random, true));
    }
    if (random() < CRACK.ring) {
      const radius = between(random, CRACK.ringRadius) * (hole.inner + hole.outer) / 2;
      const span = between(random, CRACK.ringSpan), from = 2 * Math.PI * random();
      const points = [];
      const steps = Math.max(Math.ceil((span * radius) / 0.04), 2);
      const box = this.pool ?? { minX: this.domainMin[0], minZ: this.domainMin[1], size: this.domainSize };
      for (let step = 0; step <= steps; step++) {
        const angle = from + (span * step) / steps, out = radius * (1 + 0.04 * gaussian(random));
        const x = hole.x + Math.cos(angle) * out, z = hole.z + Math.sin(angle) * out;
        if (!(x > box.minX && x < box.minX + box.size && z > box.minZ && z < box.minZ + box.size && this.overWater(x, z))) break;
        points.push(x, z);
      }
      if (points.length >= 4) hole.cracks.push(points);
    }
    this.cracks.push(...hole.cracks);
    this.dirty = true;
  }

  /**
   * A floater that went into the water by a hole (src/rock.js iceHole), held
   * inside it (src/collide.js `contain`, as src/pool.js holdInPool holds a
   * thing in the pool): inside the hole's inner radius less its own, its
   * speed outward turned back at its own bounce (the water between takes
   * some). Returns how hard it was turned back ({ change, normalX, normalZ },
   * the normal into the hole), or null.
   */
  contain(rock) {
    const hole = rock.iceHole;
    if (!this.on || !hole || !rock.floats || !(rock.state === 'water' || rock.state === 'float' || rock.afloat)) return null;
    const awayX = rock.position.x - hole.x, awayZ = rock.position.z - hole.z;
    const away = Math.hypot(awayX, awayZ);
    const room = Math.max(hole.inner - rock.collisionRadius, 0);
    if (away <= room || away < 1e-9) return null;
    const normalX = -awayX / away, normalZ = -awayZ / away;
    const outward = -(rock.velocity.x * normalX + rock.velocity.z * normalZ);
    const change = outward > 0 ? (1 + rock.collisionBounce * 0.8) * outward : 0;
    rock.knock(normalX * change, 0, normalZ * change, normalX * (away - room), 0, normalZ * (away - room));
    return { change, normalX, normalZ };
  }

  // ---- the mask (the header) -----------------------------------------------

  /** Paint what has opened or cracked since (once a frame, src/main.js): holes' shapes are final by then (fitCavity). Returns whether the mask changed. */
  update() {
    if (!this.dirty) return false;
    this.dirty = false;
    for (const hole of this.holes) {
      if (hole.painted) continue;
      this.settle(hole);
      this.paintHole(hole);
      hole.painted = true;
    }
    for (const points of this.cracks) this.paintCrack(points);
    this.cracks.length = 0;
    this.fillMask(this.changed);
    this.changed.length = 0;
    this.texture.needsUpdate = true;
    return true;
  }

  /** The texel range [first, last] along an axis covering [low, high] (m). */
  texelRange(low, high, axis) {
    const origin = this.domainMin[axis];
    return [Math.max(Math.floor((low - origin) / this.cell - 0.5), 0), Math.min(Math.ceil((high - origin) / this.cell - 0.5), this.texels - 1)];
  }

  /**
   * A hole into R: the signed distance to its edge, the least of it and what
   * was there (the holes' union). Its texels' insides by scanline, each
   * texel's middle against the edges a row crosses; the distance only in a
   * band MASK.holeFar about each edge (deeper inside it is −holeFar).
   */
  paintHole(hole) {
    const far = MASK.holeFar;
    const [firstColumn, lastColumn] = this.texelRange(hole.x - hole.outer - far, hole.x + hole.outer + far, 0);
    const [firstRow, lastRow] = this.texelRange(hole.z - hole.outer - far, hole.z + hole.outer + far, 1);
    const width = lastColumn - firstColumn + 1, height = lastRow - firstRow + 1;
    if (width <= 0 || height <= 0) return;
    const distance = new Float32Array(width * height).fill(far);
    const inside = new Uint8Array(width * height);
    const corners = hole.corners, count = corners.length / 2;
    const columnX = (column) => this.domainMin[0] + (column + 0.5) * this.cell;
    const rowZ = (row) => this.domainMin[1] + (row + 0.5) * this.cell;
    // Inside, by scanline.
    const crossings = [];
    for (let row = 0; row < height; row++) {
      const z = rowZ(firstRow + row);
      crossings.length = 0;
      for (let index = 0, previous = count - 1; index < count; previous = index++) {
        const az = corners[2 * previous + 1], bz = corners[2 * index + 1];
        if ((az > z) === (bz > z)) continue;
        const ax = corners[2 * previous], bx = corners[2 * index];
        crossings.push(ax + ((z - az) * (bx - ax)) / (bz - az));
      }
      crossings.sort((first, second) => first - second);
      for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
        const from = Math.max(Math.ceil((crossings[pair] - this.domainMin[0]) / this.cell - 0.5), firstColumn);
        const to = Math.min(Math.floor((crossings[pair + 1] - this.domainMin[0]) / this.cell - 0.5), lastColumn);
        for (let column = from; column <= to; column++) inside[row * width + column - firstColumn] = 1;
      }
    }
    // The distance, in a band about each edge.
    for (let index = 0, previous = count - 1; index < count; previous = index++) {
      const ax = corners[2 * previous], az = corners[2 * previous + 1], bx = corners[2 * index], bz = corners[2 * index + 1];
      const [fromColumn, toColumn] = this.texelRange(Math.min(ax, bx) - far, Math.max(ax, bx) + far, 0);
      const [fromRow, toRow] = this.texelRange(Math.min(az, bz) - far, Math.max(az, bz) + far, 1);
      for (let row = Math.max(fromRow, firstRow); row <= Math.min(toRow, lastRow); row++) {
        const z = rowZ(row);
        for (let column = Math.max(fromColumn, firstColumn); column <= Math.min(toColumn, lastColumn); column++) {
          const local = (row - firstRow) * width + column - firstColumn;
          const reach = segmentDistance(columnX(column), z, ax, az, bx, bz, nearest).distance;
          if (reach < distance[local]) distance[local] = reach;
        }
      }
    }
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const local = row * width + column;
        const signed = inside[local] ? -distance[local] : distance[local];
        const texel = (firstRow + row) * this.texels + firstColumn + column;
        if (signed < this.holeField[texel]) this.holeField[texel] = signed;
      }
    }
    this.changed.push([firstColumn, lastColumn, firstRow, lastRow]);
  }

  /** A crack into G, in a band about each of its segments (the header): the nearest crack's distance, signed by its side along its span. */
  paintCrack(points) {
    const far = MASK.crackFar;
    const count = points.length / 2;
    for (let segment = 0; segment + 1 < count; segment++) {
      const ax = points[2 * segment], az = points[2 * segment + 1], bx = points[2 * segment + 2], bz = points[2 * segment + 3];
      const firstJoint = segment > 0, lastJoint = segment + 2 < count;   // its ends where the crack goes on
      const [firstColumn, lastColumn] = this.texelRange(Math.min(ax, bx) - far, Math.max(ax, bx) + far, 0);
      const [firstRow, lastRow] = this.texelRange(Math.min(az, bz) - far, Math.max(az, bz) + far, 1);
      if (lastColumn < firstColumn || lastRow < firstRow) continue;
      for (let row = firstRow; row <= lastRow; row++) {
        const z = this.domainMin[1] + (row + 0.5) * this.cell;
        for (let column = firstColumn; column <= lastColumn; column++) {
          const x = this.domainMin[0] + (column + 0.5) * this.cell;
          segmentDistance(x, z, ax, az, bx, bz, nearest);
          if (nearest.distance >= far) continue;
          // Signed by its side along the span, and past a joint (where the next segment carries the side on); unsigned past the crack's tips.
          const signed = (nearest.along >= 0 || firstJoint) && (nearest.along <= 1 || lastJoint) ? Math.sign(nearest.side || 1) * nearest.distance : nearest.distance;
          const texel = row * this.texels + column;
          if (Math.abs(signed) < Math.abs(this.crackField[texel])) this.crackField[texel] = signed;
        }
      }
      this.changed.push([firstColumn, lastColumn, firstRow, lastRow]);
    }
  }

  /**
   * The fields into the texture's bytes over the rectangles of texels painted
   * since (`changed`), or all of it: each distance d as 127.5·(1 + d/far),
   * far its cap (a byte's step is 0.5 mm of a hole's edge, 0.16 mm of a
   * crack's: finer than a pixel ever sees). B and A: none yet.
   */
  fillMask(rectangles = [[0, this.texels - 1, 0, this.texels - 1]]) {
    const holeScale = 127.5 / MASK.holeFar, crackScale = 127.5 / MASK.crackFar;
    for (const [firstColumn, lastColumn, firstRow, lastRow] of rectangles) {
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          const texel = row * this.texels + column;
          this.maskData[4 * texel] = Math.round(127.5 + this.holeField[texel] * holeScale);
          this.maskData[4 * texel + 1] = Math.round(127.5 + this.crackField[texel] * crackScale);
        }
      }
    }
  }

  /** What src/main.js's budget reports. */
  get budget() {
    return { thickness: this.thickness, holes: this.holes.length, maskBytes: this.maskData.byteLength };
  }
}
