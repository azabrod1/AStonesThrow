// Spray: the fine drops a splash throws, under a millimetre across, from tens
// of thousands to millions a throw, where the CPU's drops (src/splash.js) are
// the few hundred to few thousand of a millimetre and more. A torn sheet's
// film, the satellites a pinching ligament leaves, the contact's first ejecta
// and the boil at the jet's base fragment into it; seen from the shore it is
// a veil of mist round the crown and the jet, and a sparkle against the sun.
//
// Each sprite is written once, at its birth, and its whole flight is a closed
// form of the splash time, evaluated in the vertex shader (SPRAY_VERTEX in
// src/shaders/fluid.js). A drop slows by the air's drag towards its terminal
// fall (and the wind's drift w), in two phases, each linear drag with a
// response time τ, whose solution is closed:
//   v(t) = v∞ + (v₀ − v∞)·e^(−t/τ),   x(t) = x₀ + v∞·t + τ·(v₀ − v∞)·(1 − e^(−t/τ)).
// A drop launched faster than its terminal speed v_t first loses that speed
// to a drag far stronger than at v_t (it grows about as the square of the
// speed): for t1 = τ1·ln(v₀ / v_t), with v∞ = (w_x, −g·τ1, w_z) and τ1 the
// stopping distance S from v₀ down to v_t by drag alone over v₀ − v_t, so it
// goes as far in that phase as it would. Then (and from the start for a
// slower drop) τ2 = v_t / g with v∞ = (w_x, −v_t, w_z), so it falls at v_t
// and starts falling at g, and across the water τ2 times COAST (a drop
// slower than v_t near its apex feels less drag than its fall's: the probe
// fits it). v_t is where Schiller and Naumann's drag on a sphere
// (dragDeceleration) balances the drop's weight (0.25 m/s for a drop 0.1 mm
// across, 1.2 for 0.3 mm, 3.9 for 1 mm: Gunn and Kinzer measured 0.27, 1.17
// and 4.03; Best's fit to raindrops is 30% fast at 0.1 mm), S the integral
// of v / a(v) dv under the same drag, both tabulated by radius (and speed)
// when the module loads. tools/spray-probe.mjs flies drops of 0.05 to 1 mm
// at 1 to 12 m/s against an integration of that drag: the reach, apex and
// time down are within 4% at the median, 14% at worst (a single τ, shortened
// for a fast launch, erred by 15% at the median and 100% at worst, and its
// fine drops fell three times too slowly). Its life is a bound, reckoned at
// its birth, on the time it takes to come down to still water (landingBound:
// for each phase steps of Newton's method from past the landing, where the
// height is concave, so the steps stay past it), and the vertex shader leaves
// it out once it is under the still water (the gale lifts it as drawn, as it
// does the drops). So per frame the spray costs a uniform and one instanced
// draw a pass, its CPU only the writing of new sprites: nothing is stepped,
// nothing read back, and slow motion, pause and a seeded throw need nothing
// of their own. Nothing is drawn once every sprite has landed.
//
// A sprite stands for `weight` like drops (1 to tens: a rock's mist is
// millions of drops, which no phone draws one by one). The fragments carry
// a sprite's coverage, water and glints times its weight; a puff of more
// than one is drawn as a disc its drops cover PUFF_COVER of (fluid.js), a
// fixed size in the world, and as mist: it writes no depth. How many sprites
// a burst writes is its drops times the density, DENSITY·(R / 3 cm)^−1.4 of
// the preset's share (setBudget) times (r / DENSITY_RADIUS)² for its drops'
// mean radius r, at most 1, so a bigger stone and a lower preset draw fewer,
// heavier sprites, and the same light, and a sprite carries about as much of
// it (a drop's cover goes as r²) whatever the size of its drops. And the
// spray keeps count of the sprites it wrote over the last CROWD_SECONDS or so
// (a count that decays by e each CROWD_SECONDS) and a burst's own: past
// CROWD_RATE a second for each slot of its ring, the density falls in
// proportion, so a hard throw's crown (ten times a medium toss's spray), a
// pebble's fan torn in one frame or a handful of stones thrown at once write
// about as many sprites a second as the ring holds for their flights, and the
// CPU about as many a frame (a few thousand on High), whatever the throw.
//
// The sprites live in a ring of SPRAY_CAPACITY slots allocated once; the
// preset sets how much of it is used (setBudget's ring), the oldest slot is
// reused when it is full, only the slots written since the last frame are
// uploaded, and once every sprite has landed the next is written at slot 0
// again, so the draw covers only what was thrown since the pond was last
// still. A burst's sizes are drawn from a gamma distribution of order 4
// about its mean radius (Villermaux's ligament fragmentation), within
// SPRAY_LEAST_RADIUS and the caller's most, and its velocities are the
// carrier's plus a kick in a random direction. Each emitter passes its own
// random stream (seededRandom), so the spray spends no draw of Math.random
// and a seeded throw splashes the same with it as without it.
//
// Each sprite keeps the wind's drift it was born in (setWind), so a change
// of the Wind setting moves no drop already in the air.
//
// The mirror (src/main.js) draws the sprites from MIRROR_SPRAY_RADIUS up,
// while one of them flies; mirrorBounds gives it a box round every flight,
// reckoned at birth.
import * as THREE from 'three';

export const SPRAY_CAPACITY = 65536;
export const SPRAY_STRIDE = 15;          // floats a slot: origin and birth, launch and life, radius, weight, τ1, t1, τ2 and the wind's drift at birth (x, z)
const STRIDE = SPRAY_STRIDE;
const GRAVITY = 9.81;
export const SPRAY_LEAST_RADIUS = 0.00005;
export const SPRAY_MOST_RADIUS = 0.001;  // larger fragments are the CPU's drops
const MOST_LIFE = 4;                     // s: no sprite flies longer
const AIR = { density: 1.2, viscosity: 1.5e-5 };   // kg/m³ and m²/s (kinematic)
const WATER_DENSITY = 1000;
export const COAST = 1.4;                // τ2's share across the water (the header; tools/spray-probe.mjs)
const RADIUS_STEP = 0.00001;             // m: the tables' radii...
const RADIUS_STEPS = 121;                // ...to 1.2 mm
const SPEED_STEP = 0.1;                  // m/s: the stopping distances' speeds...
const SPEED_STEPS = 161;                 // ...to 16 m/s
const LANDING_STEPS = 2;                 // Newton's steps to a sprite's landing (linearLanding)
export const MIRROR_SPRAY_RADIUS = 0.0004;   // finer sprites are left out of the mirror
export const SPRAY_WIND = 1.5;           // m/s of drift per unit of the wind's strength (WIND_STRENGTHS, src/ambientWaves.js)
const DENSITY = 0.2;                     // sprites per drop for the 3 cm stone's drops of DENSITY_RADIUS, at a share of 1...
const DENSITY_POWER = 2.2;               // ...times (R / 3 cm)^−DENSITY_POWER...
const DENSITY_RADIUS = 0.0003;           // ...and times (r / DENSITY_RADIUS)²: a sprite stands for as much light, whatever its drops' size
const CROWD_RATE = 1.5;                  // sprites a second, per slot of the ring in use, past which a burst writes fewer, heavier ones...
const CROWD_SECONDS = 1 / 30;            // ...the writing reckoned over about this long (an exponential memory): two frames
const GAMMA_ORDER = 4;
const GAMMA_TABLE_SIZE = 257;            // the gamma's quantiles, tabulated (gammaQuantiles)

/**
 * A random sequence of an emitter's own, seeded by `values` (a place and a
 * time): draws from it shift no other draw of the splash. Murmur3's
 * finaliser over the values' bits, then mulberry32.
 */
export function seededRandom(...values) {
  const finalise = (bits) => {
    let mixed = Math.imul(bits ^ (bits >>> 16), 0x85ebca6b);
    mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
    return (mixed ^ (mixed >>> 16)) >>> 0;
  };
  const number = new Float64Array(1);
  const words = new Uint32Array(number.buffer);
  let state = 0x9e3779b9;
  for (const value of values) {
    number[0] = value;
    state = finalise(state ^ words[0]);
    state = finalise(state ^ words[1]);
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many drops `water` m³ makes in drops of mean radius `meanRadius` (a gamma of order 4: E[r³] = 1.875·mean³). */
export function sprayDrops(water, meanRadius) {
  const cubed = ((GAMMA_ORDER + 1) * (GAMMA_ORDER + 2)) / (GAMMA_ORDER * GAMMA_ORDER);
  return water / ((4 / 3) * Math.PI * cubed * meanRadius ** 3);
}

/**
 * The quantiles of a gamma of order 4 with mean 1 at GAMMA_TABLE_SIZE − 1
 * even steps of probability (the last at 0.999), found by bisection on its
 * distribution 1 − e^(−x)·(1 + x + x²/2 + x³/6) (x = 4·r / mean): a drop's
 * size is one draw and a lookup.
 */
function gammaQuantiles() {
  const distribution = (scaled) => 1 - Math.exp(-scaled) * (1 + scaled + (scaled * scaled) / 2 + (scaled * scaled * scaled) / 6);
  return Float64Array.from({ length: GAMMA_TABLE_SIZE }, (_, index) => {
    const probability = Math.min(index / (GAMMA_TABLE_SIZE - 1), 0.999);
    let low = 0, high = 30;
    for (let step = 0; step < 60; step++) {
      const middle = 0.5 * (low + high);
      if (distribution(middle) < probability) low = middle; else high = middle;
    }
    return (0.5 * (low + high)) / GAMMA_ORDER;
  });
}
const GAMMA_QUANTILES = gammaQuantiles();

/**
 * A water drop's deceleration by the air (m/s²) at `speed` for its radius:
 * (3/8)·(ρ_air / ρ_water)·C_d·v² / r, with Schiller and Naumann's drag
 * coefficient C_d = 24 / Re·(1 + 0.15·Re^0.687) (a sphere, Re under about
 * 1000: drops of a millimetre's radius and less keep round).
 */
export function dragDeceleration(radius, speed) {
  const reynolds = Math.max((2 * radius * speed) / AIR.viscosity, 1e-9);
  const coefficient = (24 / reynolds) * (1 + 0.15 * reynolds ** 0.687);
  return (0.375 * AIR.density * coefficient * speed * speed) / (WATER_DENSITY * radius);
}

/** A drop's terminal speed in still air (m/s) for its radius (m): where dragDeceleration meets g (bisection). */
export function terminalSpeed(radius) {
  if (radius <= 0) return 0;
  let low = 0, high = 20;
  for (let step = 0; step < 50; step++) {
    const middle = 0.5 * (low + high);
    if (dragDeceleration(radius, middle) < GRAVITY) low = middle; else high = middle;
  }
  return 0.5 * (low + high);
}
const TERMINAL_SPEEDS = Float64Array.from({ length: RADIUS_STEPS }, (_, index) => terminalSpeed(index * RADIUS_STEP));

/** How far a drop slows from each speed to rest by drag alone (m), by radius and speed: the midpoint rule on v / a(v). */
const STOPPING = (() => {
  const table = new Float32Array(RADIUS_STEPS * SPEED_STEPS);
  for (let radiusIndex = 1; radiusIndex < RADIUS_STEPS; radiusIndex++) {
    const radius = radiusIndex * RADIUS_STEP, row = radiusIndex * SPEED_STEPS;
    for (let speedIndex = 1; speedIndex < SPEED_STEPS; speedIndex++) {
      const speed = (speedIndex - 0.5) * SPEED_STEP;
      table[row + speedIndex] = table[row + speedIndex - 1] + (speed / dragDeceleration(radius, speed)) * SPEED_STEP;
    }
  }
  return table;
})();

/** A drop's terminal speed (m/s) for its radius, from the table. */
function tabulatedTerminal(radius) {
  const place = Math.min(Math.max(radius / RADIUS_STEP, 0), RADIUS_STEPS - 1.001), index = place | 0;
  return TERMINAL_SPEEDS[index] + (TERMINAL_SPEEDS[index + 1] - TERMINAL_SPEEDS[index]) * (place - index);
}

/** How far a drop of `radius` slows from `speed` to rest by drag alone (m), from the table. */
function stoppingDistance(radius, speed) {
  const radiusPlace = Math.min(Math.max(radius / RADIUS_STEP, 0), RADIUS_STEPS - 1.001), radiusIndex = radiusPlace | 0;
  const speedPlace = Math.min(Math.max(speed / SPEED_STEP, 0), SPEED_STEPS - 1.001), speedIndex = speedPlace | 0;
  const radiusShare = radiusPlace - radiusIndex, speedShare = speedPlace - speedIndex;
  const row = radiusIndex * SPEED_STEPS, next = row + SPEED_STEPS;
  const low = STOPPING[row + speedIndex] + (STOPPING[row + speedIndex + 1] - STOPPING[row + speedIndex]) * speedShare;
  const high = STOPPING[next + speedIndex] + (STOPPING[next + speedIndex + 1] - STOPPING[next + speedIndex]) * speedShare;
  return low + (high - low) * radiusShare;
}

/**
 * The phases of a drop of `radius` launched at `speed` (the header), into
 * `out`: fastTau (τ1) and fastTime (t1; 0 for a drop no faster than its
 * terminal speed) and slowTau (τ2 = v_t / g).
 */
export function sprayFlight(radius, speed, out = { fastTau: 0, fastTime: 0, slowTau: 0 }) {
  const terminal = tabulatedTerminal(radius);
  out.slowTau = terminal / GRAVITY;
  out.fastTau = out.slowTau;
  out.fastTime = 0;
  if (speed > terminal * 1.001) {
    out.fastTau = Math.max(stoppingDistance(radius, speed) - stoppingDistance(radius, terminal), 1e-6) / (speed - terminal);
    out.fastTime = out.fastTau * Math.log(speed / terminal);
  }
  return out;
}

/**
 * Where a drop launched from (x, y, z) at (vx, vy, vz) with phases
 * (fastTau, fastTime, slowTau) is `age` later in a drift (windX, windZ),
 * into `out` (x, y, z): SPRAY_VERTEX's closed form (`coast` COAST but in
 * the probe's fit).
 */
export function flightPosition(x, y, z, vx, vy, vz, fastTau, fastTime, slowTau, windX, windZ, age, out, coast = COAST) {
  const early = Math.min(age, fastTime), late = age - early;
  const fastFall = -GRAVITY * fastTau, decay = Math.exp(-early / fastTau);
  let px = x + windX * early + fastTau * (vx - windX) * (1 - decay);
  let py = y + fastFall * early + fastTau * (vy - fastFall) * (1 - decay);
  let pz = z + windZ * early + fastTau * (vz - windZ) * (1 - decay);
  const sx = windX + (vx - windX) * decay, sy = fastFall + (vy - fastFall) * decay, sz = windZ + (vz - windZ) * decay;
  const slowFall = -GRAVITY * slowTau, coastTau = coast * slowTau;
  const across = 1 - Math.exp(-late / coastTau), down = 1 - Math.exp(-late / slowTau);
  px += windX * late + coastTau * (sx - windX) * across;
  py += slowFall * late + slowTau * (sy - slowFall) * down;
  pz += windZ * late + coastTau * (sz - windZ) * across;
  out.x = px; out.y = py; out.z = pz;
  return out;
}

/** The apex landingBound found last (m above the still water): the bounds' (SpraySystem.write). */
let lastApex = 0;

/**
 * A time by which a drop launched up at `rise` from `height` under linear
 * drag of response time `tau` towards a fall of g·τ has come down to the
 * still water (0 if it never rises above it): the fall at that speed past τ
 * from the apex (it falls at least g·τ·(s − τ) in s), then LANDING_STEPS of
 * Newton's method, which from past the landing stay past it while the
 * height is concave (launched slower downward than g·τ); a drop launched
 * downward faster falls faster than g·τ all the way, so it is down by its
 * fall over g·τ. Its apex goes to lastApex.
 */
function linearLanding(height, rise, tau) {
  const terminal = GRAVITY * tau;
  const lift = rise + terminal;
  let apexTime = 0, apexHeight = height;
  // At the apex e^(−t/τ) = g·τ / (rise + g·τ), so the height is the launch's plus τ·rise less g·τ·t.
  if (rise > 0) { apexTime = tau * Math.log(lift / terminal); apexHeight = height + tau * rise - terminal * apexTime; }
  lastApex = apexHeight;
  if (apexHeight <= 0) return 0;
  if (lift <= 0) return height / terminal;
  let time = apexTime + apexHeight / terminal + tau;
  for (let step = 0; step < LANDING_STEPS; step++) {
    const decay = Math.exp(-time / tau);
    const speed = lift * decay - terminal;
    if (speed > -1e-6) break;
    time -= (height - terminal * time + tau * lift * (1 - decay)) / speed;
  }
  return time;
}

/**
 * A time by which a drop launched up at `rise` from `height` with phases
 * `flight` (sprayFlight) has come down to the still water, at most
 * MOST_LIFE (0 if it never rises above it): each phase's linearLanding, the
 * slow one's from where the fast one leaves it. The sprite's ring slot is
 * free after it; SPRAY_VERTEX leaves the drop out once it is under the
 * water, so it need not be exact.
 */
export function landingBound(height, rise, flight) {
  const { fastTau, fastTime, slowTau } = flight;
  if (fastTime <= 0) return Math.min(linearLanding(height, rise, slowTau), MOST_LIFE);
  const fast = linearLanding(height, rise, fastTau);
  if (fast <= fastTime) return fast;
  const apex = lastApex;
  const fastFall = GRAVITY * fastTau, decay = Math.exp(-fastTime / fastTau);
  const middleHeight = height - fastFall * fastTime + fastTau * (rise + fastFall) * (1 - decay);
  if (middleHeight <= 0) { lastApex = apex; return fastTime; }
  const slow = linearLanding(middleHeight, -fastFall + (rise + fastFall) * decay, slowTau);
  lastApex = Math.max(apex, lastApex);
  return Math.min(fastTime + slow, MOST_LIFE);
}

/** A random unit vector into `out`, by Marsaglia's method (no angles, no trigonometry). */
function randomDirection(random, out) {
  let first, second, square;
  do {
    first = 2 * random() - 1;
    second = 2 * random() - 1;
    square = first * first + second * second;
  } while (square >= 1 || square === 0);
  const scale = 2 * Math.sqrt(1 - square);
  out[0] = first * scale;
  out[1] = 1 - 2 * square;
  out[2] = second * scale;
  return out;
}

export class SpraySystem {
  /**
   * @param capacity the ring's slots (SPRAY_CAPACITY); setBudget uses part of it
   * The spray's four materials (the fluid passes' depth and optics, the
   * mirror's colour and distance) are the splash's (src/splash.js), built
   * on SPRAY_VERTEX with `uniforms` (its clock and the wind's drift) among
   * theirs; attach them with setMaterials.
   */
  constructor({ capacity = SPRAY_CAPACITY } = {}) {
    this.capacity = capacity;
    this.ring = capacity;         // the slots in use (setBudget)
    this.share = 1;               // of DENSITY's sprites (setBudget)
    this.next = 0;                // the slot the next sprite takes
    this.used = 0;                // slots written since the ring last started over: the draw
    this.lastDeath = -Infinity;   // splash time the last sprite lands
    this.mirrorDeath = -Infinity; // and the last the mirror draws
    this.dirtyStart = 0;          // the run of slots written since the last commit
    this.dirtyCount = 0;
    this.windX = 0;               // the drift a drop born now is blown to (m/s; setWind), which it keeps
    this.windZ = 0;
    this.box = new THREE.Box3();  // round every flight since the ring started over
    this.direction = [0, 0, 0];   // burst's scratch
    this.flight = { fastTau: 0, fastTime: 0, slowTau: 0 };   // write's
    this.recent = 0;              // sprites written lately, decaying by e each CROWD_SECONDS (the header)
    this.recentTime = 0;          // the splash time it was reckoned at
    this.tally = { sprites: 0, drops: 0, water: 0 };   // since the last reset: sprites written, the drops they stand for, their water (m³)

    this.data = new Float32Array(capacity * STRIDE);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE).setUsage(THREE.DynamicDrawUsage);
    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('aOrigin', new THREE.InterleavedBufferAttribute(this.buffer, 4, 0));
    geometry.setAttribute('aLaunch', new THREE.InterleavedBufferAttribute(this.buffer, 4, 4));
    geometry.setAttribute('aDrop', new THREE.InterleavedBufferAttribute(this.buffer, 4, 8));
    geometry.setAttribute('aSlow', new THREE.InterleavedBufferAttribute(this.buffer, 3, 12));
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.uniforms = { uTime: { value: 0 } };
    this.mesh = new THREE.Mesh(geometry);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** The materials the passes draw the sprites with: depth and optics (the splash swaps them per pass). */
  setMaterials(depth, thickness) {
    this.depthMaterial = depth;
    this.thicknessMaterial = thickness;
    this.mesh.material = depth;
  }

  /** The preset's spray (QUALITY.spray, src/main.js): the ring's slots in use and the share of DENSITY's sprites. */
  setBudget({ ring, share }) {
    this.ring = Math.max(1, Math.min(ring, this.capacity));
    this.share = share;
    if (this.next >= this.ring) this.next = 0;
    if (this.used > this.ring) { this.used = this.ring; this.geometry.instanceCount = this.used; }
    if (this.dirtyStart >= this.ring) { this.dirtyStart = 0; this.dirtyCount = Math.min(this.dirtyCount, this.ring); }
  }

  /**
   * The wind's drift at the spray's height: a direction (world x, z, unit)
   * and the wind's strength. A sprite keeps the drift it was born in, so a
   * change of wind moves no drop already in the air.
   */
  setWind(directionX, directionZ, strength) {
    this.windX = directionX * SPRAY_WIND * strength;
    this.windZ = directionZ * SPRAY_WIND * strength;
  }

  /** Sprites per drop for a stone of size factor `sizeFactor` (R / 3 cm) and drops of mean radius `radius`, at most 1. */
  density(sizeFactor, radius) {
    return Math.min(this.share * DENSITY * Math.max(sizeFactor, 0.25) ** -DENSITY_POWER * (radius / DENSITY_RADIUS) ** 2, 1);
  }

  /**
   * `drops` drops of mean radius `radius` (gamma-distributed about it, at
   * most `most`) leaving from within `spread` of (x, y, z) at (vx, vy, vz),
   * each kicked by up to `kick` m/s in a random direction (from a third of
   * it), born at splash time `time`, as the stone of size factor
   * `sizeFactor`'s sprites; `random` the emitter's stream (seededRandom).
   * Returns the sprites written.
   */
  burst({ x, y, z, vx, vy, vz, drops, radius, kick = 0, spread = 0, time, random, sizeFactor = 1, most = SPRAY_MOST_RADIUS }) {
    if (!(drops > 0) || radius <= 0) return 0;
    if (time > this.recentTime) {
      this.recent *= Math.exp((this.recentTime - time) / CROWD_SECONDS);
      this.recentTime = time;
    }
    const uncrowded = this.density(sizeFactor, radius);
    const crowding = Math.min((CROWD_RATE * CROWD_SECONDS * this.ring) / Math.max(this.recent + drops * uncrowded, 1), 1);
    const density = uncrowded * crowding;
    const wanted = drops * density;
    const sprites = Math.floor(wanted) + (random() < wanted - Math.floor(wanted) ? 1 : 0);
    const weight = 1 / density;
    const direction = this.direction;
    for (let sprite = 0; sprite < sprites; sprite++) {
      // Gamma of order 4 about the mean, from its quantiles.
      const place = random() * (GAMMA_TABLE_SIZE - 1), index = place | 0;
      const gamma = GAMMA_QUANTILES[index] + (GAMMA_QUANTILES[Math.min(index + 1, GAMMA_TABLE_SIZE - 1)] - GAMMA_QUANTILES[index]) * (place - index);
      const dropRadius = Math.min(Math.max(radius * gamma, SPRAY_LEAST_RADIUS), most);
      randomDirection(random, direction);
      const speed = (kick * (1 + 2 * random())) / 3;
      const kickX = direction[0] * speed, kickY = direction[1] * speed, kickZ = direction[2] * speed;
      randomDirection(random, direction);
      const out = spread * random();
      this.write(
        x + direction[0] * out, Math.max(y + direction[1] * out, 0), z + direction[2] * out,
        vx + kickX, vy + kickY, vz + kickZ, dropRadius, weight, time,
      );
    }
    this.recent += sprites;
    return sprites;
  }

  /** One sprite: a drop (or `weight` like drops) of `radius` at (x, y, z) moving at (vx, vy, vz), born at `time`. */
  write(x, y, z, vx, vy, vz, radius, weight, time) {
    const flight = sprayFlight(radius, Math.sqrt(vx * vx + vy * vy + vz * vz), this.flight);
    const life = landingBound(y, vy, flight);
    if (life <= 0) return;
    // Every sprite since then has landed: start the ring over, so the draw covers only what flies now.
    if (time >= this.lastDeath && this.used > 0) {
      this.next = 0;
      this.used = 0;
      this.dirtyStart = 0;
      this.dirtyCount = 0;
      this.box.makeEmpty();
    }
    const slot = this.next;
    if (this.dirtyCount === 0) this.dirtyStart = slot;
    this.dirtyCount = Math.min(this.dirtyCount + 1, this.ring);
    this.next = (slot + 1) % this.ring;
    this.used = Math.max(this.used, slot + 1);
    const base = slot * STRIDE, data = this.data;
    data[base] = x; data[base + 1] = y; data[base + 2] = z; data[base + 3] = time;
    data[base + 4] = vx; data[base + 5] = vy; data[base + 6] = vz; data[base + 7] = life;
    data[base + 8] = radius; data[base + 9] = weight; data[base + 10] = flight.fastTau; data[base + 11] = flight.fastTime; data[base + 12] = flight.slowTau;
    data[base + 13] = this.windX; data[base + 14] = this.windZ;
    this.lastDeath = Math.max(this.lastDeath, time + life);
    if (radius >= MIRROR_SPRAY_RADIUS) this.mirrorDeath = Math.max(this.mirrorDeath, time + life);
    // Its flight's box: no further out than the wind's drift for its life and its launch's reach against it in each phase, no higher than its apex.
    const reach = (flight.fastTime > 0 ? flight.fastTau : 0) + COAST * flight.slowTau;
    const reachX = Math.abs(this.windX) * life + reach * Math.abs(vx - this.windX);
    const reachZ = Math.abs(this.windZ) * life + reach * Math.abs(vz - this.windZ);
    const apex = lastApex;
    const box = this.box;
    if (box.isEmpty()) box.set(box.min.set(x - reachX, 0, z - reachZ), box.max.set(x + reachX, apex, z + reachZ));
    else {
      box.min.x = Math.min(box.min.x, x - reachX); box.max.x = Math.max(box.max.x, x + reachX);
      box.min.z = Math.min(box.min.z, z - reachZ); box.max.z = Math.max(box.max.z, z + reachZ);
      box.min.y = 0; box.max.y = Math.max(box.max.y, apex);
    }
    const tally = this.tally;
    tally.sprites++;
    tally.drops += weight;
    tally.water += weight * 4.18879 * radius * radius * radius;
  }

  /** Whether a sprite was in the air at the last commit. */
  get alive() { return this.mesh.visible; }

  /** Whether one the mirror draws (MIRROR_SPRAY_RADIUS and up) is, at splash time `time`. */
  mirrored(time) { return time < this.mirrorDeath; }

  /** Grow `box` round every flight the mirror may draw. */
  mirrorBounds(box) { if (!this.box.isEmpty()) box.union(this.box); }

  /** Every sprite gone at once (the splash's reset). */
  reset() {
    this.next = 0;
    this.used = 0;
    this.lastDeath = -Infinity;
    this.mirrorDeath = -Infinity;
    this.dirtyStart = 0;
    this.dirtyCount = 0;
    this.box.makeEmpty();
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
    this.recent = 0;
    this.recentTime = 0;
    this.tally = { sprites: 0, drops: 0, water: 0 };
  }

  /** Once per simulation step: the clock, visibility, and the upload of the sprites written since the last. */
  commit(time) {
    this.uniforms.uTime.value = time;
    this.mesh.visible = time < this.lastDeath;
    if (this.dirtyCount === 0) return;
    const buffer = this.buffer;
    const start = this.dirtyStart, end = start + this.dirtyCount;
    if (this.dirtyCount >= this.ring) buffer.addUpdateRange(0, this.ring * STRIDE);
    else if (end <= this.ring) buffer.addUpdateRange(start * STRIDE, this.dirtyCount * STRIDE);
    else {
      buffer.addUpdateRange(start * STRIDE, (this.ring - start) * STRIDE);
      buffer.addUpdateRange(0, (end - this.ring) * STRIDE);
    }
    buffer.needsUpdate = true;
    this.geometry.instanceCount = this.used;
    this.dirtyCount = 0;
  }

  /** Sprites in the air at splash time `time` (for reports; walks every slot in use). */
  liveCount(time) {
    let live = 0;
    const point = { x: 0, y: 0, z: 0 };
    for (let slot = 0; slot < this.used; slot++) if (this.positionAt(slot, time, point)) live++;
    return live;
  }

  /** Where sprite `slot` is at splash time `time`, into `out` (x, y, z), or null if it is not in the air (for probes). */
  positionAt(slot, time, out) {
    const base = slot * STRIDE, data = this.data;
    const age = time - data[base + 3];
    if (age < 0 || age >= data[base + 7]) return null;
    flightPosition(data[base], data[base + 1], data[base + 2], data[base + 4], data[base + 5], data[base + 6],
      data[base + 10], data[base + 11], data[base + 12], data[base + 13], data[base + 14], age, out);
    return out.y < 0 ? null : out;
  }
}
