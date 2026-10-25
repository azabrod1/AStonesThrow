// The physics of a thin column of water in flight: the one-dimensional
// slender-jet equations of Eggers & Dupont (1994, J. Fluid Mech. 262, 205),
// the model physicists use for jets and the drops they make (Eggers 1997,
// Rev. Mod. Phys. 69, 865; Eggers & Villermaux 2008, Rep. Prog. Phys. 71,
// 036601). src/jet.js feeds it the Worthington jet's water and draws it.
//
// The model. A column of radius h(s) along its axis s, its water moving along
// the axis at v(s) (a plug flow, uniform across the column), keeps its volume,
//
//   ∂t(h²) + ∂s(v·h²) = 0,
//
// and its momentum, pulled by the Laplace pressure p = σ·κ of its surface (the
// full mean curvature of a surface of revolution, κ = 1/(h·√(1 + h_s²)) −
// h_ss/(1 + h_s²)^(3/2)), stretched against its viscosity (Trouton's 3μ) and
// pulled down by gravity:
//
//   ρ·(∂t v + v·∂s v) = −∂s p + 3μ·∂s(h²·∂s v)/h² + ρ·g_s.
//
// Its capillary and viscous terms are the gradient of the force a cross-
// section carries,
//
//   F = π·σ·(h/√(1 + h_s²) + h²·h_ss/(1 + h_s²)^(3/2)) + 3·μ·π·h²·∂s v
//
// (the surface's tension around the section less the pressure over it, πσh
// for a cylinder, zero through a sphere at rest), so it is solved here in
// that conservative form, by material (Lagrangian) nodes along a polyline:
// between two neighbouring nodes a segment holds a fixed volume of water,
// its radius that volume over its length (sqrt(V/(π·L))), and each node is
// pulled along its two segments by their forces F, and down by gravity.
// Volume is kept exactly and momentum to rounding. Each node also carries a
// number its caller stamps on it (src/jet.js: its water's launch time),
// interpolated when a segment is split. The nodes are points in
// space, so a column whose water was thrown up at a slant arcs over as a
// fountain does. The model's one approximation is the slenderness (the flow
// uniform across the column), which is what makes it one-dimensional and
// cheap. F is held between 0 and FORCE_MOST·πσh: a thread is never in
// compression (a section through a sphere carries none, and anything less
// is a bump the grid cannot hold), and h_s and h·h_ss within ±SLOPE_MOST.
//
// What comes out of it, rather than being put in:
//   - Rayleigh–Plateau. A column of radius a is unstable to varicose waves
//     longer than its circumference (k·a < 1): they grow at a rate whose
//     peak, sqrt(σ/(8ρa³)) at k·a = 0.71 in this model (Rayleigh's exact
//     0.343·sqrt(σ/(ρa³)) at 0.70), is set by the column's own capillary
//     time sqrt(ρa³/σ). A needle a millimetre or two thick beads within
//     milliseconds; a column several centimetres thick needs seconds, longer
//     than it is in the air, so it rises and falls back whole.
//   - Taylor–Culick. A free end is pulled back along the column by the force
//     πσa the column carries: it gathers the column into a bulb that runs
//     back at sqrt(σ/(ρa)).
//   - Pinch-off and drops. Where a neck's radius falls to PINCH_SHARE of the
//     water on both sides of it, it pinches: the column is cut in two, the
//     neck's water shared between the sides. A piece that has drawn itself
//     into a single bead (DROP_SHAPE) is a drop; so the drops' sizes, the
//     bulb a tip leaves, the beads of a breaking column and the satellites
//     between them come from the dynamics (end-pinching, Stone & Leal 1989;
//     the stretched jets of Gordillo & Gekle 2010).
//   - Threads. A thread thinner than THREAD_FLOOR breaks within a few of its
//     capillary times (a few milliseconds) into drops too small to see as
//     more than glitter; following it there would cost most of the solver's
//     time (its step is a share of that capillary time), so it is broken at
//     once into what Rayleigh–Plateau makes of it: drops of THREAD_DROP of
//     its radius, the water of each most unstable wavelength (9.02 radii).
//
// The water carries small disturbances at every scale (the collapse that
// launches it is turbulent): a newly resolved stretch of column (a split
// segment) has its pieces' water uneven by NOISE, from the caller's random
// stream; the column amplifies what it can.
//
// Beads. A segment shorter than COMPACT_LENGTH of its radius is no longer a
// column but part of a round bead, so it is folded into a lumped sphere at a
// node (`bead`, its volume): the node's mass, at its centre, the segments on
// either side meeting its surface. Folding keeps volume and momentum. A
// sphere carries no tension of its own, so a bulb is pulled only by the
// columns it hangs on; a segment about to be folded pulls as a column that
// squat (its tension fades as it folds, rather than growing with its width).
//
// Resolution. Segments are cut to about TARGET_LENGTH local radii once past
// SPLIT_LENGTH (under π, so the shortest waves the grid holds are stable:
// k·a > 1; within LEAST_LENGTH and MOST_LENGTH): a few nodes per
// Rayleigh–Plateau wavelength. The time step is taken from the state alone
// (stableStep): the shortest capillary wave's period (ω ≈ sqrt(σa/2ρ)·k² at
// k = π/L, STEP_CAPILLARY of the explicit limit), the thinnest neck's
// capillary time (STEP_GROWTH of it), and nodes closing on each other by at
// most STEP_MOVE of their spacing, at the speed they close at or from the
// forces on them; at most STEP_MOST. So a run of steps is the same however
// the caller's frames fall (src/jet.js never cuts a step short to meet a
// frame). The scheme is symplectic Euler (velocities, then positions).
//
// Pieces. The nodes are stored in order, a chain at a time: a chain is a run
// of nodes joined by segments, `chainEnd` marking each chain's last node.
// The last chain may be held to an inflow (`inflow`: its last node is placed
// by the caller every step, where the water leaves, and the volume the
// caller adds flows into its last segment) or stand in the pool (`anchored`:
// its last node's tension is balanced, as if the column went on into the
// water, so it does not run up out of it). Every other chain is free: a
// piece in flight. The caller reads what happened from `events`: pinches
// (where, the water's velocity there, the bead's radius) and drops (where,
// velocity, volume, radius); and `fallen` (m³), the water that came down
// into the pool: nodes of the held chain under `waterLevel`, on their way
// down. A free piece that reaches `landingLevel` leaves as drops, node by
// node, so it lands where it reaches it.
//
// Cost. A step costs a few dozen floating-point operations per node; the
// structure changes (pinch, thread, fold, split, drop) are made in place,
// moving the arrays' tails (copyWithin) only where something changed. The
// solver's time goes as the column's length over its radius times the
// frame over its capillary time, a^(-2.5) for a column of radius a: a
// needle's millimetre threads are most of it, a rock's centimetre column
// almost nothing.

export const WATER = Object.freeze({ density: 1000, surfaceTension: 0.072, viscosity: 1.0e-3 });

const TARGET_LENGTH = 2.0;     // segments are cut to about this many local radii...
const SPLIT_LENGTH = 3.0;      // ...once past this many (under π, so the shortest waves stay stable)...
const COMPACT_LENGTH = 0.5;    // ...and folded into a bead below this many (the header)
const LEAST_LENGTH = 0.0005;   // m: no segment is cut shorter than this...
const MOST_LENGTH = 0.03;      // ...nor left longer than this (the column's arc)
const PINCH_SHARE = 0.25;      // a neck pinches off at this share of the water on both sides of it
const PINCH_REACH = 3;         // segments either side that "the water on both sides" spans
const THREAD_FLOOR = 0.0005;   // m: a thread thinner than this breaks at once into its Rayleigh–Plateau drops...
const THREAD_DROP = 1.89;      // ...of this many of its radii
const STEP_MOST = 0.002;       // s
const STEP_LEAST = 1e-6;       // s
const STEP_CAPILLARY = 0.45;   // share of the explicit limit 2/ω of the shortest capillary wave
const STEP_GROWTH = 0.7;       // share of the thinnest neck's capillary time sqrt(ρa³/σ)
const STEP_MOVE = 0.2;         // nodes close on each other by at most this share of their spacing a step
const NOISE = 0.02;            // a newly resolved stretch of column's water is uneven by this share
const DROP_SHAPE = 2.4;        // a free piece no longer than this many of its sphere's radii is a drop
const SLOPE_MOST = 4;          // h_s within ±this, h·h_ss within ±this
const FORCE_MOST = 4;          // a section's force within 0 and this many πσh (the header)

// The structure changes refine() makes, per segment.
const PINCH = 1, FOLD = 2, SPLIT = 3, THREAD = 4;

const sphereRadius = (volume) => Math.cbrt((3 * Math.max(volume, 0)) / (4 * Math.PI));
const goalLength = (radius) => Math.min(Math.max(TARGET_LENGTH * radius, LEAST_LENGTH), MOST_LENGTH);
const splitLength = (radius) => Math.max(Math.min(SPLIT_LENGTH * radius, 1.6 * MOST_LENGTH), 1.6 * LEAST_LENGTH);
// A small deterministic stream (Park–Miller), for a solver given none.
const lehmer = (seed) => { let state = seed; return () => { state = (state * 16807) % 2147483647; return state / 2147483647; }; };

export class SlenderJet {
  /**
   * @param capacity the most nodes it holds (past it, segments are not split)
   * @param gravity m/s²
   * @param water {density, surfaceTension, viscosity}
   * @param random the stream the seeds (NOISE) are drawn from
   */
  constructor({ capacity = 1024, gravity = 9.81, water = WATER, random = null } = {}) {
    this.capacity = capacity;
    this.density = water.density;
    this.surfaceTension = water.surfaceTension;
    this.viscosity = water.viscosity;
    this.gravity = gravity;
    this.random = random ?? lehmer(1);
    const nodes = () => new Float64Array(capacity);
    this.positionX = nodes(); this.positionY = nodes(); this.positionZ = nodes();
    this.velocityX = nodes(); this.velocityY = nodes(); this.velocityZ = nodes();
    this.bead = nodes();                       // the lumped sphere's volume at the node (m³)
    this.volume = nodes();                     // the segment's from this node to the next (m³)
    this.chainEnd = new Uint8Array(capacity);  // 1: the last node of its chain (no segment to the next)
    this.stamp = nodes();                      // a number the caller stamps on each node (src/jet.js: its water's launch time), carried with it
    this.stored = [this.positionX, this.positionY, this.positionZ, this.velocityX, this.velocityY, this.velocityZ, this.bead, this.volume, this.chainEnd, this.stamp];
    // Rebuilt each step: per segment (indexed by its first node) and per node.
    this.segmentLength = nodes();
    this.tangentX = nodes(); this.tangentY = nodes(); this.tangentZ = nodes();
    this.segmentRadius = nodes();
    this.segmentForce = nodes();
    this.accelerationX = nodes(); this.accelerationY = nodes(); this.accelerationZ = nodes();
    this.mass = nodes();
    this.beadRadii = nodes();                  // each node's bead's sphere radius
    this.measured = [this.segmentLength, this.tangentX, this.tangentY, this.tangentZ, this.segmentRadius, this.beadRadii];
    this.flags = new Uint8Array(capacity);     // the structure changes refine() makes, per segment
    this.weights = new Float64Array(65);       // a split's pieces' shares of its water
    this.count = 0;
    this.inflow = false;           // the last chain's last node is held to the inflow
    this.anchored = false;         // the last chain stands in the pool
    this.inflowRadius = 0;         // the inflow's radius (m), for its segment while that is shorter than it
    this.waterLevel = -Infinity;   // the held chain's nodes under this fall back into the pool...
    this.landingLevel = 0;         // ...and free pieces that reach this leave as drops
    this.fallen = 0;
    this.events = [];
    this.fresh = false;            // measure() is up to date with the nodes (refine() leaves it so)
  }

  /** The radius (m) of the sphere a node's bead makes. */
  beadRadius(node) { return this.bead[node] > 0 ? sphereRadius(this.bead[node]) : 0; }

  /** Whether `node` is the inflow's (placed by the caller). */
  held(node) { return this.inflow && node === this.count - 1; }

  /** The first node of the chain holding `node`. */
  firstOfChain(node) {
    let first = node;
    while (first > 0 && this.chainEnd[first - 1] === 0) first--;
    return first;
  }

  /** The first node of the held chain (count when there is none). */
  heldFirst() {
    return (this.inflow || this.anchored) && this.count > 0 ? this.firstOfChain(this.count - 1) : this.count;
  }

  /** The water in the solver (m³): every bead and segment. */
  water() {
    let total = 0;
    for (let node = 0; node < this.count; node++) total += this.bead[node] + (this.chainEnd[node] ? 0 : this.volume[node]);
    return total;
  }

  /** Add a node at the end of the last chain, with its stamp; the segment to it starts empty. */
  push(x, y, z, vx, vy, vz, stamp = 0) {
    if (this.count >= this.capacity) return -1;
    const node = this.count++;
    this.positionX[node] = x; this.positionY[node] = y; this.positionZ[node] = z;
    this.velocityX[node] = vx; this.velocityY[node] = vy; this.velocityZ[node] = vz;
    this.stamp[node] = stamp;
    this.bead[node] = 0;
    this.volume[node] = 0;
    this.chainEnd[node] = 1;
    if (node > 0) this.chainEnd[node - 1] = 0;
    this.fresh = false;
    return node;
  }

  /**
   * Lengths, tangents and radii of every segment: its length less the beads'
   * radii at its ends (the column runs from one bead's surface to the next).
   * The inflow's segment, shorter than its inflow radius, takes that radius.
   */
  measure() {
    const count = this.count, last = count - 1;
    const positionX = this.positionX, positionY = this.positionY, positionZ = this.positionZ;
    const bead = this.bead, beadRadii = this.beadRadii, chainEnd = this.chainEnd, volume = this.volume;
    const tangentX = this.tangentX, tangentY = this.tangentY, tangentZ = this.tangentZ;
    const segmentLength = this.segmentLength, segmentRadius = this.segmentRadius;
    for (let node = 0; node < count; node++) beadRadii[node] = bead[node] > 0 ? sphereRadius(bead[node]) : 0;
    const inflowSegment = this.inflow ? last - 1 : -1;
    for (let node = 0; node < last; node++) {
      if (chainEnd[node]) continue;
      const deltaX = positionX[node + 1] - positionX[node];
      const deltaY = positionY[node + 1] - positionY[node];
      const deltaZ = positionZ[node + 1] - positionZ[node];
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
      const inverse = distance > 1e-12 ? 1 / distance : 0;
      tangentX[node] = deltaX * inverse; tangentY[node] = inverse > 0 ? deltaY * inverse : 1; tangentZ[node] = deltaZ * inverse;
      const length = Math.max(distance - beadRadii[node] - beadRadii[node + 1], 1e-7);
      segmentLength[node] = length;
      segmentRadius[node] = node === inflowSegment && length < this.inflowRadius ? this.inflowRadius : Math.sqrt(volume[node] / (Math.PI * length));
    }
    this.fresh = true;
  }

  /** measure() for the nodes' beads and the segments around one place the structure changed (refine). */
  measureAround(firstNode, lastNode) {
    for (let node = Math.max(firstNode, 0); node <= lastNode && node < this.count; node++) this.beadRadii[node] = this.bead[node] > 0 ? sphereRadius(this.bead[node]) : 0;
    const last = this.count - 1;
    const inflowSegment = this.inflow ? last - 1 : -1;
    for (let node = Math.max(firstNode - 1, 0); node <= lastNode && node < last; node++) {
      if (this.chainEnd[node]) continue;
      const deltaX = this.positionX[node + 1] - this.positionX[node];
      const deltaY = this.positionY[node + 1] - this.positionY[node];
      const deltaZ = this.positionZ[node + 1] - this.positionZ[node];
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
      const inverse = distance > 1e-12 ? 1 / distance : 0;
      this.tangentX[node] = deltaX * inverse; this.tangentY[node] = inverse > 0 ? deltaY * inverse : 1; this.tangentZ[node] = deltaZ * inverse;
      const length = Math.max(distance - this.beadRadii[node] - this.beadRadii[node + 1], 1e-7);
      this.segmentLength[node] = length;
      this.segmentRadius[node] = node === inflowSegment && length < this.inflowRadius ? this.inflowRadius : Math.sqrt(this.volume[node] / (Math.PI * length));
    }
  }

  /**
   * The force each segment carries (the header's F), from its radius and
   * those of its neighbours in the chain (the slope and curvature at its
   * centre, the beads between them counted in their spacing) and its rate of
   * stretching.
   */
  sectionForces() {
    const tension = this.surfaceTension, viscosity = this.viscosity;
    const last = this.count - 1;
    const chainEnd = this.chainEnd, segmentLength = this.segmentLength, segmentRadius = this.segmentRadius, beadRadii = this.beadRadii, volume = this.volume;
    const velocityX = this.velocityX, velocityY = this.velocityY, velocityZ = this.velocityZ;
    const tangentX = this.tangentX, tangentY = this.tangentY, tangentZ = this.tangentZ, segmentForce = this.segmentForce;
    const squat = 1 / (Math.PI * COMPACT_LENGTH);
    for (let node = 0; node < last; node++) {
      if (chainEnd[node]) continue;
      const length = segmentLength[node];
      // A segment about to be folded pulls as a column that squat (the header).
      const radius = length < COMPACT_LENGTH * segmentRadius[node] ? Math.cbrt(volume[node] * squat) : segmentRadius[node];
      const before = node > 0 && !chainEnd[node - 1];
      const after = node + 1 < last && !chainEnd[node + 1];
      let slope = 0, curvature = 0;
      if (before && after) {
        const spacingBefore = 0.5 * (segmentLength[node - 1] + length) + 2 * beadRadii[node];
        const spacingAfter = 0.5 * (length + segmentLength[node + 1]) + 2 * beadRadii[node + 1];
        const riseBefore = (radius - segmentRadius[node - 1]) / spacingBefore;
        const riseAfter = (segmentRadius[node + 1] - radius) / spacingAfter;
        const span = spacingBefore + spacingAfter;
        slope = (riseBefore * spacingAfter + riseAfter * spacingBefore) / span;
        curvature = (2 * (riseAfter - riseBefore)) / span;
      } else if (before) {
        slope = (radius - segmentRadius[node - 1]) / (0.5 * (segmentLength[node - 1] + length) + 2 * beadRadii[node]);
      } else if (after) {
        slope = (segmentRadius[node + 1] - radius) / (0.5 * (length + segmentLength[node + 1]) + 2 * beadRadii[node + 1]);
      }
      if (slope > SLOPE_MOST) slope = SLOPE_MOST; else if (slope < -SLOPE_MOST) slope = -SLOPE_MOST;
      let bend = curvature * radius;
      if (bend > SLOPE_MOST) bend = SLOPE_MOST; else if (bend < -SLOPE_MOST) bend = -SLOPE_MOST;
      const lean = 1 / Math.sqrt(1 + slope * slope);
      const stretch = ((velocityX[node + 1] - velocityX[node]) * tangentX[node]
        + (velocityY[node + 1] - velocityY[node]) * tangentY[node]
        + (velocityZ[node + 1] - velocityZ[node]) * tangentZ[node]) / length;
      let capillary = Math.PI * tension * radius * lean * (1 + bend * lean * lean);
      const bound = FORCE_MOST * Math.PI * tension * radius;
      if (capillary > bound) capillary = bound; else if (capillary < 0) capillary = 0;
      segmentForce[node] = capillary + 3 * viscosity * Math.PI * radius * radius * stretch;
    }
  }

  /** Each node's acceleration: its segments' forces over its mass, and gravity (the held node's none). */
  accelerate() {
    this.sectionForces();
    const count = this.count, last = count - 1, density = this.density, gravity = this.gravity;
    const accelerationX = this.accelerationX, accelerationY = this.accelerationY, accelerationZ = this.accelerationZ;
    const chainEnd = this.chainEnd, segmentForce = this.segmentForce, tangentX = this.tangentX, tangentY = this.tangentY, tangentZ = this.tangentZ;
    const bead = this.bead, volume = this.volume, mass = this.mass;
    accelerationX.fill(0, 0, count); accelerationY.fill(0, 0, count); accelerationZ.fill(0, 0, count);
    for (let node = 0; node < last; node++) {
      if (chainEnd[node]) continue;
      const force = segmentForce[node];
      const alongX = force * tangentX[node], alongY = force * tangentY[node], alongZ = force * tangentZ[node];
      accelerationX[node] += alongX; accelerationY[node] += alongY; accelerationZ[node] += alongZ;
      accelerationX[node + 1] -= alongX; accelerationY[node + 1] -= alongY; accelerationZ[node + 1] -= alongZ;
    }
    // A column standing in the pool goes on into it: its last node is pulled down as much as up.
    if (this.anchored && !this.inflow && last > 0 && !chainEnd[last - 1]) {
      const force = segmentForce[last - 1];
      accelerationX[last] += force * tangentX[last - 1]; accelerationY[last] += force * tangentY[last - 1]; accelerationZ[last] += force * tangentZ[last - 1];
    }
    for (let node = 0; node < count; node++) {
      const water = bead[node] + 0.5 * ((node > 0 && !chainEnd[node - 1] ? volume[node - 1] : 0) + (chainEnd[node] ? 0 : volume[node]));
      mass[node] = density * Math.max(water, 1e-15);
      const inverseMass = 1 / mass[node];
      accelerationX[node] *= inverseMass;
      accelerationY[node] = accelerationY[node] * inverseMass - gravity;
      accelerationZ[node] *= inverseMass;
    }
    if (this.inflow && count > 0) { accelerationX[last] = 0; accelerationY[last] = 0; accelerationZ[last] = 0; }
  }

  /**
   * The accelerations now and the longest step the state allows (the
   * header), measuring first unless the solver is fresh. advance() then
   * takes the step under these accelerations. The inflow's own segment is
   * left out: it is placed, not stepped.
   */
  stableStep() {
    if (!this.fresh) this.measure();
    this.accelerate();
    const density = this.density, tension = this.surfaceTension;
    const halfTension = Math.sqrt(tension / (2 * density)), growthScale = Math.sqrt(density / tension);
    const velocityX = this.velocityX, velocityY = this.velocityY, velocityZ = this.velocityZ;
    const accelerationX = this.accelerationX, accelerationY = this.accelerationY, accelerationZ = this.accelerationZ;
    const chainEnd = this.chainEnd, segmentLength = this.segmentLength, segmentRadius = this.segmentRadius;
    let step = STEP_MOST;
    const last = this.count - 1;
    const inflowSegment = this.inflow ? last - 1 : -1;
    for (let node = 0; node < last; node++) {
      if (chainEnd[node] || node === inflowSegment) continue;
      const radius = Math.max(segmentRadius[node], 1e-6);
      const length = segmentLength[node];
      const waveLength = Math.max(length, COMPACT_LENGTH * radius);
      const rootRadius = Math.sqrt(radius);
      const wave = (Math.PI * Math.PI * halfTension * rootRadius) / (waveLength * waveLength) + (0.5 * halfTension) / (radius * rootRadius);
      const capillary = (STEP_CAPILLARY * 2) / wave;
      const growth = STEP_GROWTH * growthScale * radius * rootRadius;
      if (capillary < step) step = capillary;
      if (growth < step) step = growth;
      const closingX = velocityX[node + 1] - velocityX[node];
      const closingY = velocityY[node + 1] - velocityY[node];
      const closingZ = velocityZ[node + 1] - velocityZ[node];
      const closing = Math.sqrt(closingX * closingX + closingY * closingY + closingZ * closingZ);
      if (STEP_MOVE * length < step * closing) step = (STEP_MOVE * length) / closing;
      const pullX = accelerationX[node + 1] - accelerationX[node], pullY = accelerationY[node + 1] - accelerationY[node], pullZ = accelerationZ[node + 1] - accelerationZ[node];
      const pull = Math.sqrt(pullX * pullX + pullY * pullY + pullZ * pullZ);
      if (STEP_MOVE * length < 0.5 * pull * step * step) step = Math.sqrt((2 * STEP_MOVE * length) / pull);
    }
    return Math.max(step, STEP_LEAST);
  }

  /**
   * Take a step of `step` seconds under the accelerations stableStep() found.
   * The inflow's node is placed by the caller after; `inflowVolume` (m³)
   * flows into its segment. Then refine().
   */
  advance(step, inflowVolume = 0) {
    const count = this.count, last = count - 1;
    const accelerationX = this.accelerationX, accelerationY = this.accelerationY, accelerationZ = this.accelerationZ;
    const positionX = this.positionX, positionY = this.positionY, positionZ = this.positionZ;
    const velocityX = this.velocityX, velocityY = this.velocityY, velocityZ = this.velocityZ;
    const moving = this.inflow ? last : count;
    for (let node = 0; node < moving; node++) {
      velocityX[node] += step * accelerationX[node];
      velocityY[node] += step * accelerationY[node];
      velocityZ[node] += step * accelerationZ[node];
      positionX[node] += step * velocityX[node];
      positionY[node] += step * velocityY[node];
      positionZ[node] += step * velocityZ[node];
    }
    if (this.inflow && last > 0 && !this.chainEnd[last - 1]) this.volume[last - 1] += inflowVolume;
    this.fresh = false;
  }

  // ---- structure -------------------------------------------------------------

  /**
   * After the caller has placed the inflow's node: pinch the necks, break the
   * threads, fold compact segments into beads, split long ones, let go of
   * free pieces that have become drops, drain the held chain's nodes that
   * have fallen into the pool and land the free pieces that have reached the
   * water. Leaves the solver measured. `time` stamps the events.
   */
  refine(time) {
    this.measure();
    if (this.markChanges()) {
      // From the end back, so the nodes still to be changed keep their places.
      const flags = this.flags;
      for (let node = this.count - 2; node >= 0; node--) {
        const flag = flags[node];
        if (flag === 0 || this.chainEnd[node]) continue;
        if (flag === THREAD) {
          let first = node;
          while (first > 0 && !this.chainEnd[first - 1] && flags[first - 1] === THREAD) first--;
          this.breakThread(first, node, time);
          node = first;
        } else if (flag === PINCH) this.pinch(node, time);
        else if (flag === FOLD) this.fold(node);
        else if (flag === SPLIT) this.split(node);
      }
      this.releaseDrops(time);
    }
    if (this.drainHeld() | this.landPieces(time)) this.measure();
    this.fresh = true;
  }

  /**
   * Flag every segment's change (after measure()): a thread under
   * THREAD_FLOOR, a segment to fold, a neck thinner than PINCH_SHARE of the
   * water on both sides of it, a segment to split; and say whether a free
   * piece of a few nodes has drawn itself into a drop. True if anything.
   */
  markChanges() {
    const count = this.count, last = count - 1;
    const chainEnd = this.chainEnd, segmentLength = this.segmentLength, segmentRadius = this.segmentRadius, beadRadii = this.beadRadii, flags = this.flags;
    const inflowSegment = this.inflow ? last - 1 : -1;
    const room = count < this.capacity - 2;
    let any = false;
    for (let node = 0; node < last; node++) {
      flags[node] = 0;
      if (chainEnd[node] || node === inflowSegment) continue;
      const radius = segmentRadius[node];
      const length = segmentLength[node];
      if (radius < THREAD_FLOOR) { flags[node] = THREAD; any = true; continue; }
      if (length < COMPACT_LENGTH * radius) { flags[node] = FOLD; any = true; continue; }
      // A neck: much thinner than the water on each side of it.
      let before = beadRadii[node], after = beadRadii[node + 1];
      for (let other = node - 1, reach = 0; other >= 0 && reach < PINCH_REACH && !chainEnd[other]; other--, reach++) {
        if (segmentRadius[other] > before) before = segmentRadius[other];
        if (beadRadii[other] > before) before = beadRadii[other];
      }
      for (let other = node + 1, reach = 0; other < last && reach < PINCH_REACH && !chainEnd[other]; other++, reach++) {
        if (segmentRadius[other] > after) after = segmentRadius[other];
        if (beadRadii[other + 1] > after) after = beadRadii[other + 1];
      }
      if (radius < PINCH_SHARE * Math.min(before, after)) { flags[node] = PINCH; any = true; continue; }
      if (room && length > splitLength(radius)) { flags[node] = SPLIT; any = true; }
    }
    // Free pieces of a few nodes may have drawn themselves into drops.
    const heldFirst = this.heldFirst();
    let chainStart = 0;
    for (let node = 0; node < heldFirst && !any; node++) {
      if (!chainEnd[node]) continue;
      if (node - chainStart < 4 && this.compact(chainStart, node)) any = true;
      chainStart = node + 1;
    }
    return any;
  }

  /** Whether the chain from `first` to `last` is short enough to be one drop (DROP_SHAPE; after measure()). */
  compact(first, last) {
    if (first === last) return true;
    let water = 0, extent = this.beadRadii[first] + this.beadRadii[last];
    for (let node = first; node <= last; node++) {
      water += this.bead[node];
      if (node < last) { water += this.volume[node]; extent += this.segmentLength[node]; }
      if (node > first && node < last) extent += 2 * this.beadRadii[node];
    }
    return extent <= DROP_SHAPE * sphereRadius(water);
  }

  /** Open a gap of `size` nodes after `node` (the tail moves along). */
  openAfter(node, size) {
    for (const array of this.stored) array.copyWithin(node + 1 + size, node + 1, this.count);
    for (const array of this.measured) array.copyWithin(node + 1 + size, node + 1, this.count);
    this.count += size;
  }

  /** Remove `size` nodes from `start` (the tail moves back). */
  removeFrom(start, size) {
    for (const array of this.stored) array.copyWithin(start, start + size, this.count);
    for (const array of this.measured) array.copyWithin(start, start + size, this.count);
    this.count -= size;
  }

  /** Cut the segment after `node`: each side keeps half its water, in its end's bead. */
  pinch(node, time) {
    const half = 0.5 * this.volume[node];
    this.bead[node] += half;
    this.bead[node + 1] += half;
    this.volume[node] = 0;
    this.chainEnd[node] = 1;
    this.measureAround(node, node + 1);
    this.events.push({
      kind: 'pinch', time, x: this.positionX[node + 1], y: this.positionY[node + 1], z: this.positionZ[node + 1],
      vx: this.velocityX[node + 1], vy: this.velocityY[node + 1], vz: this.velocityZ[node + 1],
      radius: Math.max(this.beadRadius(node), this.beadRadius(node + 1)),
    });
  }

  /** Fold the segment after `node`, and the node after it, into `node`'s bead (volume and momentum kept). */
  fold(node) {
    const next = node + 1;
    const water = (index) => this.bead[index] + 0.5 * ((index > 0 && !this.chainEnd[index - 1] ? this.volume[index - 1] : 0) + (this.chainEnd[index] ? 0 : this.volume[index]));
    const own = water(node), other = water(next);
    const share = other / Math.max(own + other, 1e-18);
    this.positionX[node] += (this.positionX[next] - this.positionX[node]) * share;
    this.positionY[node] += (this.positionY[next] - this.positionY[node]) * share;
    this.positionZ[node] += (this.positionZ[next] - this.positionZ[node]) * share;
    this.velocityX[node] += (this.velocityX[next] - this.velocityX[node]) * share;
    this.velocityY[node] += (this.velocityY[next] - this.velocityY[node]) * share;
    this.velocityZ[node] += (this.velocityZ[next] - this.velocityZ[node]) * share;
    this.bead[node] += this.volume[node] + this.bead[next];
    this.volume[node] = this.volume[next];
    this.chainEnd[node] = this.chainEnd[next];
    this.removeFrom(next, 1);
    this.measureAround(node, node);
  }

  /**
   * Split the segment after `node` into pieces of about goalLength along the
   * straight line between its nodes, velocities in proportion (momentum
   * kept), its water uneven by NOISE (kept in sum).
   */
  split(node) {
    const radius = this.segmentRadius[node];
    const pieces = Math.min(Math.max(Math.round(this.segmentLength[node] / goalLength(radius)), 2), this.capacity - this.count + 1, 64);
    if (pieces < 2) return;
    let weightSum = 0;
    for (let piece = 0; piece < pieces; piece++) { this.weights[piece] = 1 + NOISE * (2 * this.random() - 1); weightSum += this.weights[piece]; }
    const water = this.volume[node] / weightSum;
    this.openAfter(node, pieces - 1);
    const end = node + pieces;   // where the old next node now is
    const startX = this.positionX[node], startY = this.positionY[node], startZ = this.positionZ[node];
    const startVX = this.velocityX[node], startVY = this.velocityY[node], startVZ = this.velocityZ[node];
    const startStamp = this.stamp[node];
    for (let piece = 0; piece < pieces; piece++) {
      const index = node + piece;
      this.volume[index] = water * this.weights[piece];
      this.chainEnd[index] = 0;
      if (piece === 0) continue;
      const along = piece / pieces;
      this.positionX[index] = startX + (this.positionX[end] - startX) * along;
      this.positionY[index] = startY + (this.positionY[end] - startY) * along;
      this.positionZ[index] = startZ + (this.positionZ[end] - startZ) * along;
      this.velocityX[index] = startVX + (this.velocityX[end] - startVX) * along;
      this.velocityY[index] = startVY + (this.velocityY[end] - startVY) * along;
      this.velocityZ[index] = startVZ + (this.velocityZ[end] - startVZ) * along;
      this.stamp[index] = startStamp + (this.stamp[end] - startStamp) * along;
      this.bead[index] = 0;
    }
    this.measureAround(node, end - 1);
  }

  /**
   * A thread (the segments from the one after `first` to the one after
   * `last`, each under THREAD_FLOOR) breaks at once into its
   * Rayleigh–Plateau drops (the header): its water, walked along it, in drops
   * of THREAD_DROP of its radius there, each at its water's centre with its
   * momentum; the nodes inside leave with it, and the chain is cut at both
   * of its ends.
   */
  breakThread(first, last, time) {
    let water = 0, centreX = 0, centreY = 0, centreZ = 0, momentumX = 0, momentumY = 0, momentumZ = 0;
    const emit = () => {
      if (water <= 0) return;
      const inverse = 1 / water;
      this.events.push({
        kind: 'drop', time, volume: water, radius: sphereRadius(water), thread: true,
        x: centreX * inverse, y: centreY * inverse, z: centreZ * inverse, vx: momentumX * inverse, vy: momentumY * inverse, vz: momentumZ * inverse,
      });
      water = 0; centreX = 0; centreY = 0; centreZ = 0; momentumX = 0; momentumY = 0; momentumZ = 0;
    };
    const add = (amount, x, y, z, vx, vy, vz) => {
      water += amount; centreX += amount * x; centreY += amount * y; centreZ += amount * z;
      momentumX += amount * vx; momentumY += amount * vy; momentumZ += amount * vz;
    };
    for (let node = first; node <= last; node++) {
      const next = node + 1;
      const radius = Math.max(this.segmentRadius[node], 1e-6);
      const dropWater = (4 / 3) * Math.PI * (THREAD_DROP * radius) ** 3;
      // The nodes inside the thread go with it, beads and all.
      if (node > first) add(this.bead[node], this.positionX[node], this.positionY[node], this.positionZ[node], this.velocityX[node], this.velocityY[node], this.velocityZ[node]);
      add(this.volume[node], 0.5 * (this.positionX[node] + this.positionX[next]), 0.5 * (this.positionY[node] + this.positionY[next]), 0.5 * (this.positionZ[node] + this.positionZ[next]),
        0.5 * (this.velocityX[node] + this.velocityX[next]), 0.5 * (this.velocityY[node] + this.velocityY[next]), 0.5 * (this.velocityZ[node] + this.velocityZ[next]));
      if (water >= dropWater) emit();
    }
    emit();
    this.events.push({ kind: 'pinch', time, x: this.positionX[first], y: this.positionY[first], z: this.positionZ[first], vx: this.velocityX[first], vy: this.velocityY[first], vz: this.velocityZ[first], radius: Math.max(this.beadRadius(first), this.segmentRadius[first]) });
    // Keep `first` and the node after the thread, unjoined; the nodes between go.
    this.volume[first] = 0;
    this.chainEnd[first] = 1;
    if (last > first) this.removeFrom(first + 1, last - first);
  }

  /** Free pieces that have drawn themselves into one drop leave (the header): their water's centre and momentum. */
  releaseDrops(time) {
    let heldFirst = this.heldFirst();
    let chainStart = 0;
    for (let node = 0; node < heldFirst; node++) {
      if (!this.chainEnd[node]) continue;
      if (node - chainStart < 4 && this.compact(chainStart, node)) {
        let water = 0, centreX = 0, centreY = 0, centreZ = 0, momentumX = 0, momentumY = 0, momentumZ = 0;
        for (let index = chainStart; index <= node; index++) {
          const share = this.bead[index] + 0.5 * ((index > chainStart ? this.volume[index - 1] : 0) + (index < node ? this.volume[index] : 0));
          water += share;
          centreX += share * this.positionX[index]; centreY += share * this.positionY[index]; centreZ += share * this.positionZ[index];
          momentumX += share * this.velocityX[index]; momentumY += share * this.velocityY[index]; momentumZ += share * this.velocityZ[index];
        }
        const inverse = water > 0 ? 1 / water : 0;
        this.events.push({
          kind: 'drop', time, volume: water, radius: sphereRadius(water),
          x: centreX * inverse, y: centreY * inverse, z: centreZ * inverse, vx: momentumX * inverse, vy: momentumY * inverse, vz: momentumZ * inverse,
        });
        this.removeFrom(chainStart, node - chainStart + 1);
        heldFirst -= node - chainStart + 1;
        node = chainStart - 1;
        continue;
      }
      chainStart = node + 1;
    }
  }

  /**
   * The held chain's nodes that have fallen under the water level drain into
   * the pool (`fallen`): a node on its way down (and, once nothing holds the
   * chain to the inflow, its last node), its bead and half of each of its
   * segments; the halves left join its neighbours. A chain drained to
   * nothing is no longer held.
   */
  drainHeld() {
    if (!(this.inflow || this.anchored) || this.count === 0) return false;
    const last = this.count - 1;
    const first = this.firstOfChain(last);
    const sinking = (node) => !this.held(node) && this.positionY[node] < this.waterLevel && (this.velocityY[node] <= 0 || (node === last && !this.inflow));
    let any = false;
    for (let node = first; node <= last && !any; node++) any = sinking(node);
    if (!any) return false;
    let written = first;
    let incoming = 0;      // the segment's volume from the last node kept to this one
    let kept = false;
    for (let node = first; node <= last; node++) {
      const outgoing = node < last ? this.volume[node] : 0;
      if (sinking(node)) {
        if (kept) {
          this.fallen += this.bead[node] + 0.5 * (incoming + outgoing);
          incoming = 0.5 * (incoming + outgoing);
        } else {
          this.fallen += this.bead[node] + outgoing;
          incoming = 0;
        }
        continue;
      }
      if (written !== node) {
        this.positionX[written] = this.positionX[node]; this.positionY[written] = this.positionY[node]; this.positionZ[written] = this.positionZ[node];
        this.velocityX[written] = this.velocityX[node]; this.velocityY[written] = this.velocityY[node]; this.velocityZ[written] = this.velocityZ[node];
        this.bead[written] = this.bead[node];
        this.stamp[written] = this.stamp[node];
      }
      if (kept) { this.volume[written - 1] = incoming; this.chainEnd[written - 1] = 0; }
      this.chainEnd[written] = 1;
      this.volume[written] = 0;
      kept = true;
      written++;
      incoming = outgoing;
    }
    // What led on from the last node kept to nodes that sank has fallen too.
    if (kept) this.fallen += incoming;
    this.count = written;
    if (!kept) { this.inflow = false; this.anchored = false; }
    return true;
  }

  /** Free pieces that reach the water leave as drops, node by node (so they land where they reach it). */
  landPieces(time) {
    const heldFirst = this.heldFirst();
    let any = false;
    for (let node = 0; node < heldFirst && !any; node++) any = this.positionY[node] < this.landingLevel && this.velocityY[node] < 0;
    if (!any) return false;
    let written = 0;
    let chainStart = 0;
    const count = this.count;
    while (chainStart < count) {
      let chainLast = chainStart;
      while (chainLast < count - 1 && !this.chainEnd[chainLast]) chainLast++;
      let landed = false;
      if (chainStart < heldFirst) {
        for (let node = chainStart; node <= chainLast && !landed; node++) landed = this.positionY[node] < this.landingLevel && this.velocityY[node] < 0;
      }
      if (landed) {
        for (let node = chainStart; node <= chainLast; node++) {
          const water = this.bead[node] + 0.5 * ((node > chainStart ? this.volume[node - 1] : 0) + (node < chainLast ? this.volume[node] : 0));
          this.events.push({
            kind: 'drop', time, volume: water, radius: sphereRadius(water), landing: true,
            x: this.positionX[node], y: this.positionY[node], z: this.positionZ[node],
            vx: this.velocityX[node], vy: this.velocityY[node], vz: this.velocityZ[node],
          });
        }
      } else {
        for (let node = chainStart; node <= chainLast; node++, written++) {
          if (written === node) continue;
          for (const array of this.stored) array[written] = array[node];
        }
      }
      chainStart = chainLast + 1;
    }
    this.count = written;
    return true;
  }

  /** Everything still in the air leaves as drops, node by node (a column cut short). */
  releaseAll(time) {
    for (let node = 0; node < this.count; node++) {
      const water = this.bead[node] + 0.5 * ((node > 0 && !this.chainEnd[node - 1] ? this.volume[node - 1] : 0) + (this.chainEnd[node] ? 0 : this.volume[node]));
      this.events.push({
        kind: 'drop', time, volume: water, radius: sphereRadius(water), landing: true,
        x: this.positionX[node], y: this.positionY[node], z: this.positionZ[node],
        vx: this.velocityX[node], vy: this.velocityY[node], vz: this.velocityZ[node],
      });
    }
    this.count = 0;
    this.inflow = false;
    this.anchored = false;
    this.fresh = false;
  }
}
