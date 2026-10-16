// Rings: the waves a stone's splash sends across the whole pond.
//
// The splash solver (src/spectralWater.js) is a 6 m periodic patch whose
// damping is set so that its waves die before they wrap around it. A real
// pond's ripples travel much farther: what damps them is the surface film
// (RING_DAMPING), so the ring a stone throws should cross the pond for
// tens of seconds. Its sources are therefore not handed to the solver but
// evolved here exactly: the cavity's splat (stampCavity in src/splash.js,
// with the pair of splats that drags an oblique entry's ring forward and the
// wake splats a little down its path) and the secondary ring the jet throws
// where it falls back (src/jet.js through the splash's columnWater). The
// solver keeps the near field: the drops' landings, the jet's mound and its
// base. Linear waves add, so the surface is the solver's field, the wind's
// (src/ambientWaves.js) and the rings' together.
//
// The exact linear solution. A splat is a radial shape s(r) (a Gaussian of
// σ less one of the same volume and σ·rim, as the solver injects it) times a
// height h and a vertical velocity v, released at t₀. With Ŝ(k) its Hankel
// transform, σ²(e^{−σ²k²/2} − e^{−σ²rim²k²/2}), the surface it makes about
// its own centre is
//     η(r, t) = ∫ k dk J0(kr) e^{−γ(k)τ} [h Ŝ cos ωτ + v Ŝ sin(ωτ)/ω],   τ = t − t₀,
// with ω(k) the solver's dispersion, ω² = (g k + σ k³/ρ) tanh(k D), and γ(k)
// the film's damping (RING_DAMPING). Several splats of one throw lie a few
// centimetres apart along one direction e: about a common centre c each
// splat at a signed distance d along e contributes, by Graf's addition
// theorem, Ŝ·J0(kd) to the axisymmetric part η0(r) and 2·Ŝ·J1(kd) to a part
// η1(r)·cos θ (θ from e) through J1(kr) in place of J0(kr). So each source is
// two radial profiles, and its ring runs stronger ahead than behind. The
// parts m ≥ 2 are left out. An oblique throw's splats and pairs lie up to
// 1.4 to 16 cm from its centre (with the stone's size), so they are not
// small: they move up to about a fifth of the ring's height around it for
// a 4 to 8 cm stone, a third for a 16 cm stone's at 4 s and a 1.5 cm
// pebble's at 1 s (tools/ring-probe.mjs measures it). Seen from above the
// ring keeps its circles, their spacing and its lean forward; only the
// contrast around it is a little more even than the solver's was. Keeping
// m ≤ 3 would bring that under 4%, for four profiles a ring (a second
// render target) and twice the work in the profile pass.
//
// A source (one throw's cavity, or one jet's fall-back) is up to MAX_GROUPS
// groups, each a splat and its pair released together; a splat joins the
// source started at most MERGE.seconds earlier within MERGE.reach of its σ
// (the wake splats of an oblique entry), and the source's centre is the
// strength-weighted centroid of its splats. At most MAX_RINGS sources live
// at once, each a layer of the profile texture (six throws, each a cavity's
// ring and a fall-back's); a new one past that takes the layer of the one
// closest to retiring, the faintest as a rule, which vanishes then.
//
// Each source's sampling is planned once (planSource) from a stationary-
// phase envelope of its ring. At time τ the wavenumber k is found at
// r = c_g(k)·τ with slope about k^{3/2} A(k) e^{−γτ} / (τ √(c_g |c_g'|))
// (A the splats' amplitude; the spread capped near the capillary-gravity
// minimum of c_g, where the stationary point is an Airy caustic). That is
// the asymptotic amplitude, not a bound (a velocity-only splat's exact slope
// meets it), so for each k the age at which it falls below
// SLOPE_VISIBLE/RETIRE_MARGIN gives the ring's lifetime, and how far its
// packet has gone by then the extent the ring shows to. The profile's reach
// R is REACH.margin times that extent over TAPER_START, so the taper begins
// beyond anything that shows (R within REACH.least and REACH.most). The
// k-sum is a midpoint rule of step Δk, under which what lies at radius r'
// reappears near 2π/Δk − r' and 2π/Δk + r' (Poisson summation; the Bessel
// functions' 1/√r makes an image near the centre stronger than what made
// it). So the spectrum pass fades out each wavenumber whose packet c_g(k)·τ
// has passed WINDOW.start·R, all of it gone by WINDOW.end·R (beyond the
// reach, where nothing is drawn), and Δk is 2π/(ALIAS_PERIOD·R), which puts
// every image of what is left beyond R. The sum runs to where the narrowest
// Gaussian's spectrum is 1e-4 (at most WAVENUMBER_CAP). tools/ring-probe.mjs
// checks the plan against the exact profile: no ring retires while it
// shows, and what is drawn matches the exact profile over the reach and
// beyond.
//
// Retirement. A ring retires when its largest slope anywhere falls below
// SLOPE_VISIBLE = 1e-4: that turns the mirror image by 2e-4 rad, under a
// third of a pixel at the phone's framing (about 1400 pixels per radian),
// moves the refraction by a twentieth of one, and changes the floor's
// caustics by under 0.1% (the bound the solver sleeps by, src/
// spectralWater.js). A ring whose reach is cut at REACH.most (40 m, past
// the far edge of the pond the view shows; an 8 cm stone's and bigger are,
// a 6 cm one's is 31 m) retires once nothing that shows is left inside it,
// and a 16 cm stone's still shows faintly where its taper fades it out
// (up to 4e-4 of slope beyond 34 m, about 50 s on). tools/ring-probe.mjs
// prints each stone's (thrown as the app throws): the reference 6 cm stone's
// cavity ring retires 63 s after the throw and shows to 23 m, its jet's
// fall-back ring 57 s and 20 m; a 1.5 cm pebble's 17 s and 4 m; a 4 cm
// stone's 43 s and 13 m; an 8 cm stone's 82 s and a 16 cm stone's 110 s, at
// the 40 m cut. Each retires 0.7 to 19 s after its exact steepest slope
// falls under SLOPE_VISIBLE.
//
// Each rendered frame, while any ring lives (update):
//   1. one spectrum pass (RING_SPECTRUM_FRAGMENT) over MAX_WAVENUMBERS × MAX_RINGS
//      texels evaluates, for every source and k on its grid, the two
//      profiles' weights k·Δk·W·e^{−γτ}[…] summed over its groups (each
//      released at its own time; W the window above), divided by √k and by
//      k^{3/2} for the asymptotic sums below; float32 where the device
//      renders it, else half floats, scaled by COEFFICIENT_SCALE into their
//      normal range;
//   2. one profile pass per live source (RING_PROFILE_FRAGMENT) writes its
//      layer of PROFILE_TEXELS radii. Texel i is at u = i/(N − 1), so the
//      first is the centre and the last the reach and linear filtering is
//      exact at both ends; its radius is R·(u² + a·u)/(1 + a), a =
//      PROFILE_MAPPING: 7.5e-5·R apart at the centre and 9e-4·R at the rim
//      (1.6 mm and 1.9 cm for a 21 m reach), fine enough that what the water
//      reads between texels matches the exact profile (tools/ring-probe.mjs).
//      Inside innerRadius it writes zero at once: no wave is slower than
//      SLOWEST_GROUP_SPEED (the capillary-gravity minimum), so at age τ no
//      part of the ring is nearer its centre than that times τ, less the
//      source's own extent (SOURCE_EXTENT of its widest splat's σ·rim, and
//      its offsets), but the Airy tail of the caustic there, exponentially
//      small (INNER_SHARE keeps a margin); a ring costs less as it ages.
//      Elsewhere terms with kr < DIRECT_LIMIT evaluate J0 and J1 in full
//      (Abramowitz and Stegun 9.4.1 to 9.4.6), the rest by their Hankel
//      asymptotics to 1/(kr) with the phase kr − π/4 advanced from term to
//      term by a rotation (Δk·r per step), so a term costs a fetch and a
//      dozen multiply-adds. It writes ∂η0/∂r, ∂η1/∂r, η1 and η0, times
//      RING_TEXTURE_UNITS, half floats, tapered to zero over the last 15% of
//      R;
//   3. the array's mip chain is rebuilt once (Three.js, after the last layer),
//      so that a pixel reads a ring averaged over its own footprint along the
//      radius (textureGrad, GLSL_COMMON in src/shaders/scene.js), and far
//      ripples average to flat instead of shimmering.
// The water surface adds each live ring's slope to its normal and its height
// to the inner patch's displacement, the floor's caustics its Laplacian, the
// foam specks ride its height (GLSL_COMMON's ringSlope, ringHeight and
// ringLaplacian, behind a branch on uRingCount, so with no ring alive a
// frame costs what it did and no pass runs). uniforms() gives the uniforms
// those materials spread.
//
// The ring's strength. RING_SOURCE.strength multiplies every ring source
// (the cavity's splats and the jet's secondary ring) against the splats the
// solver was given; it is the constant a calibration against a reference
// simulation sets (tools/ring-probe.mjs prints the reference vertical drop's
// ring at 0.5, 1 and 2 m).
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';

export const MAX_RINGS = 12;          // sources alive at once: layers of the profile texture
export const MAX_GROUPS = 4;          // splat groups a source holds (an oblique entry's cavity uses three)
export const PROFILE_TEXELS = 2048;   // radii per profile
export const MAX_WAVENUMBERS = 2048;  // wavenumbers per source at most
export const PROFILE_MAPPING = 0.18;  // a: the radius at u is R·(u² + a·u)/(1 + a)
export const DIRECT_LIMIT = 12;       // kr under which J0 and J1 are evaluated in full
export const COEFFICIENT_SCALE = 1e6; // the spectrum's weights, into half floats' normal range
export const RING_TEXTURE_UNITS = 1000;   // the profiles hold millimetres and slopes times 1000
// The damping of ripples on a pond: a surface film (natural water nearly
// always carries one) holds the surface still horizontally, which shears a
// boundary layer √(2ν/ω) thick under it and damps a wave by k·√(νω/8) per
// second (Lamb, Hydrodynamics §351; van Dorn 1966), plus the bulk's 2νk²:
// 0.03/s for 30 cm waves, 0.05/s for 20 cm, 0.12/s for 10 cm, 0.6/s for
// 3 cm. A clean surface (film 0) would damp a 30 cm wave by 0.001/s only.
export const RING_DAMPING = { viscosity: 1.0e-6, film: 1 };
// Every ring source's strength against the splat the solver used to take
// (src/splash.js's cavity splat, the jet's secondary ring): the constant a
// calibration against a reference simulation sets.
export const RING_SOURCE = { strength: 1 };
export const SLOPE_VISIBLE = 1e-4;    // a ring retires once no slope of it is this steep (the header)
const RETIRE_MARGIN = 1.3;            // the envelope is planned against SLOPE_VISIBLE over this, so a ring retires late, never early
export const REACH = { least: 2, most: 40, margin: 1.15 };   // a profile's radius: margin × where it shows, over TAPER_START, within these (m)
export const WINDOW = { start: 1.15, end: 1.4 };     // in reaches: where the spectrum pass fades out a wavenumber's packet
export const ALIAS_PERIOD = 2.5;      // 2π/Δk in reaches: the images of what the window keeps lie beyond the reach
export const SLOWEST_GROUP_SPEED = 0.177;   // m/s: c_g's minimum (4.3 cm waves); no part of a ring is nearer its centre than this times its age
export const INNER_SHARE = 0.85;      // the profile pass writes zero inside this share of that radius...
export const SOURCE_EXTENT = 4;       // ...less this many of the source's widest σ·rim (a Gaussian keeps 3e-4 of its peak there)
const WAVENUMBER_CAP = 400;           // rad/m: 1.6 cm waves, which the film damps within 15 cm
const GAUSSIAN_REACH = 4.29;          // σ·k at which a splat's Gaussian spectrum is 1e-4: the rest adds under 3e-5 to a slope
const MERGE = { seconds: 0.05, reach: 3 };   // a splat joins a source started this recently, this many of its σ away
const AIRY = 1.2945;                  // the stationary-phase spread's cap at a caustic: 3.245/√(2π) (the cubic phase integral)
export const TAPER_START = 0.85;      // of the reach: the profile fades to zero from here
const GRAVITY = 9.81;
const SURFACE_TENSION_OVER_DENSITY = 7.2e-5;

/** ω (rad/s) for a wavenumber (rad/m) on water of the given depth: the solver's dispersion. */
export function ringFrequency(wavenumber, depth) {
  return Math.sqrt((GRAVITY * wavenumber + SURFACE_TENSION_OVER_DENSITY * wavenumber ** 3) * Math.tanh(Math.min(wavenumber * depth, 20)));
}

/** c_g = dω/dk (m/s) for a wavenumber (rad/m) on water of the given depth. */
export function ringGroupSpeed(wavenumber, depth) {
  const tangent = Math.tanh(Math.min(wavenumber * depth, 20));
  const force = GRAVITY * wavenumber + SURFACE_TENSION_OVER_DENSITY * wavenumber ** 3;
  const forceSlope = GRAVITY + 3 * SURFACE_TENSION_OVER_DENSITY * wavenumber ** 2;
  const tangentSlope = wavenumber * depth < 20 ? depth * (1 - tangent * tangent) : 0;
  return (forceSlope * tangent + force * tangentSlope) / (2 * ringFrequency(wavenumber, depth));
}

/** γ (1/s): the film's damping of a wave of this wavenumber, and the bulk's (RING_DAMPING). */
export function ringDamping(wavenumber, depth) {
  return RING_DAMPING.film * wavenumber * Math.sqrt(RING_DAMPING.viscosity * ringFrequency(wavenumber, depth) / 8) + 2 * RING_DAMPING.viscosity * wavenumber * wavenumber;
}

/** A splat's radial spectrum Ŝ(k): σ²(e^{−σ²k²/2} − e^{−σ²rim²k²/2}), or the plain Gaussian's for rim ≤ 1. */
export function splatSpectrum(wavenumber, sigma, rim) {
  let shape = Math.exp(-0.5 * sigma * sigma * wavenumber * wavenumber);
  if (rim > 1) shape -= Math.exp(-0.5 * (sigma * rim) ** 2 * wavenumber * wavenumber);
  return sigma * sigma * shape;
}

// Per wavenumber of a geometric table: ω, c_g, |ω''|, |ω'''| and γ, for the envelope.
const envelopeTables = new Map();
function envelopeTable(depth) {
  if (envelopeTables.has(depth)) return envelopeTables.get(depth);
  const groupVelocity = (wavenumber) => ringGroupSpeed(wavenumber, depth);
  const bend = (wavenumber, step) => (groupVelocity(wavenumber + step) - groupVelocity(wavenumber - step)) / (2 * step);
  const table = [];
  for (let wavenumber = 0.3; wavenumber < 1.06 * WAVENUMBER_CAP; wavenumber *= 1.05) {
    const step = 1e-3 * wavenumber;
    table.push({
      wavenumber,
      omega: ringFrequency(wavenumber, depth),
      groupVelocity: groupVelocity(wavenumber),
      bend: Math.abs(bend(wavenumber, step)),
      twist: Math.abs((bend(wavenumber + 4 * step, step) - bend(wavenumber - 4 * step, step)) / (8 * step)),
      damping: ringDamping(wavenumber, depth),
    });
  }
  envelopeTables.set(depth, table);
  return table;
}

/** The envelope of the slope that wavenumbers near this table entry make, at age τ, for amplitude A(k) (the header). */
function slopeEnvelope(entry, amplitude, age) {
  const spread = Math.min(1 / Math.sqrt(entry.bend * age), AIRY * (entry.twist * age) ** (-1 / 3));
  return entry.wavenumber ** 1.5 * amplitude * Math.exp(-entry.damping * age) * spread / Math.sqrt(entry.groupVelocity * age);
}

/** The age (s) at which the envelope falls below `threshold`, by bisection on a geometric scale. */
function ageBelow(entry, amplitude, threshold) {
  let young = 0.25, old = 3000;
  if (slopeEnvelope(entry, amplitude, young) < threshold) return 0;
  for (let step = 0; step < 18; step++) {
    const middle = Math.sqrt(young * old);
    if (slopeEnvelope(entry, amplitude, middle) > threshold) young = middle; else old = middle;
  }
  return old;
}

/** The largest |height| and |velocity|/ω a group can give a wave of this wavenumber: Ŝ(|h| + |v|/ω), the pair's two Gaussians too. */
function groupAmplitude(group, wavenumber, omega) {
  let amplitude = Math.abs(splatSpectrum(wavenumber, group.sigma, group.rim)) * (Math.abs(group.height) + Math.abs(group.velocity) / omega);
  if (group.pair) amplitude += 2 * Math.abs(group.pair.lift) * splatSpectrum(wavenumber, group.pair.sigma, 1) / omega;
  return amplitude;
}

/**
 * A source's sampling (the header): its k-grid (step Δk and count), its
 * profile's reach R (m), when it retires (end, world seconds), its lifetime
 * after its last splat and how far it shows. `groups` hold their start
 * times and splat parameters.
 */
export function planSource(groups, depth = 0.8) {
  const table = envelopeTable(depth);
  const latest = Math.max(...groups.map((group) => group.start));
  const earliest = Math.min(...groups.map((group) => group.start));
  let lifetime = 0, extent = 0;
  for (const entry of table) {
    let amplitude = 0;
    for (const group of groups) amplitude += groupAmplitude(group, entry.wavenumber, entry.omega);
    if (!(amplitude > 0)) continue;
    const visibleAge = ageBelow(entry, amplitude, SLOPE_VISIBLE / RETIRE_MARGIN);
    lifetime = Math.max(lifetime, visibleAge);
    if (visibleAge > 0) extent = Math.max(extent, entry.groupVelocity * (visibleAge + latest - earliest));
  }
  let narrowest = Infinity;
  for (const group of groups) narrowest = Math.min(narrowest, group.sigma, group.pair ? group.pair.sigma : Infinity);
  const largestWavenumber = Math.min(GAUSSIAN_REACH / narrowest, WAVENUMBER_CAP);
  let reach = THREE.MathUtils.clamp(REACH.margin * extent / TAPER_START, REACH.least, REACH.most);
  let step = 2 * Math.PI / (ALIAS_PERIOD * reach);
  let count = Math.ceil(largestWavenumber / step);
  if (count > MAX_WAVENUMBERS) {
    // Coarser: the images come back sooner, so the profile stops sooner.
    count = MAX_WAVENUMBERS;
    step = largestWavenumber / count;
    reach = 2 * Math.PI / (ALIAS_PERIOD * step);
  }
  if (reach < REACH.margin * extent / TAPER_START) {
    // A cut reach (a big stone's ring at REACH.most): the ring retires once
    // nothing that shows is left inside it, each wavenumber counting until its
    // packet has gone past the reach.
    lifetime = 0;
    for (const entry of table) {
      let amplitude = 0;
      for (const group of groups) amplitude += groupAmplitude(group, entry.wavenumber, entry.omega);
      if (!(amplitude > 0)) continue;
      lifetime = Math.max(lifetime, Math.min(ageBelow(entry, amplitude, SLOPE_VISIBLE / RETIRE_MARGIN), reach / entry.groupVelocity));
    }
  }
  return { step, count, reach, end: latest + lifetime, lifetime, extent };
}

/** The radius (m) inside which a source has nothing at world time `time` (the header): what the profile pass leaves at zero. */
export function innerRadius(source, time) {
  let youngest = -Infinity, extent = 0;
  for (const group of source.groups) {
    youngest = Math.max(youngest, group.start);
    extent = Math.max(extent, Math.abs(group.offset ?? 0) + group.sigma * Math.max(group.rim, 1));
    if (group.pair) extent = Math.max(extent, Math.abs(group.offset ?? 0) + group.pair.offset + group.pair.sigma);
  }
  return Math.max(INNER_SHARE * SLOWEST_GROUP_SPEED * (time - youngest) - SOURCE_EXTENT * extent, 0);
}

/** The radius (m) at u along a profile of this reach (texel i is at u = i/(PROFILE_TEXELS − 1)). */
export const profileRadius = (u, reach) => reach * (u * u + PROFILE_MAPPING * u) / (1 + PROFILE_MAPPING);

// For both passes: sin and cos to about 1e-7 (GLSL promises only 2^−11, and
// the profile's phase recurrence below multiplies an error in its step's
// angle by the number of terms: in SwiftShader that cost 0.2% of the ring),
// from the Taylor series of a quarter of the angle, brought into [−π, π], and
// two doublings; and J0 and J1 (Abramowitz and Stegun 9.4.1 to 9.4.6).
const RING_MATH = /* glsl */`
vec2 sineCosine(float angle) {
  float turned = angle - 6.283185307179586 * floor(angle / 6.283185307179586 + 0.5);
  float quarter = 0.25 * turned;
  float square = quarter * quarter;
  float sine = quarter * (1.0 - square * (1.0 / 6.0 - square * (1.0 / 120.0 - square * (1.0 / 5040.0 - square * (1.0 / 362880.0 - square / 39916800.0)))));
  float cosine = 1.0 - square * (0.5 - square * (1.0 / 24.0 - square * (1.0 / 720.0 - square * (1.0 / 40320.0 - square / 3628800.0))));
  for (int doubling = 0; doubling < 2; doubling++) {
    float doubled = 2.0 * sine * cosine;
    cosine = cosine * cosine - sine * sine;
    sine = doubled;
  }
  return vec2(sine, cosine);
}
float besselJ0(float x) {
  float magnitude = abs(x);
  if (magnitude <= 3.0) {
    float ratio = magnitude * magnitude / 9.0;
    return 1.0 + ratio * (-2.2499997 + ratio * (1.2656208 + ratio * (-0.3163866 + ratio * (0.0444479 + ratio * (-0.0039444 + ratio * 0.00021)))));
  }
  float inverse = 3.0 / magnitude;
  float amplitude = 0.79788456 + inverse * (-0.00000077 + inverse * (-0.0055274 + inverse * (-0.00009512 + inverse * (0.00137237 + inverse * (-0.00072805 + inverse * 0.00014476)))));
  float phase = magnitude - 0.78539816 + inverse * (-0.04166397 + inverse * (-0.00003954 + inverse * (0.00262573 + inverse * (-0.00054125 + inverse * (-0.00029333 + inverse * 0.00013558)))));
  return amplitude * cos(phase) * inversesqrt(magnitude);
}
float besselJ1(float x) {
  float magnitude = abs(x);
  float value;
  if (magnitude <= 3.0) {
    float ratio = magnitude * magnitude / 9.0;
    value = magnitude * (0.5 + ratio * (-0.56249985 + ratio * (0.21093573 + ratio * (-0.03954289 + ratio * (0.00443319 + ratio * (-0.00031761 + ratio * 0.00001109))))));
  } else {
    float inverse = 3.0 / magnitude;
    float amplitude = 0.79788456 + inverse * (0.00000156 + inverse * (0.01659667 + inverse * (0.00017105 + inverse * (-0.00249511 + inverse * (0.00113653 - inverse * 0.00020033)))));
    float phase = magnitude - 2.35619449 + inverse * (0.12499612 + inverse * (0.0000565 + inverse * (-0.00637879 + inverse * (0.00074348 + inverse * (0.00079824 - inverse * 0.00029166)))));
    value = amplitude * cos(phase) * inversesqrt(magnitude);
  }
  return x < 0.0 ? -value : value;
}
`;

// 1. The spectrum (the header): texel (j, layer) holds, for the source in that
// layer and k = (j + ½)·Δk, the weights w = k·Δk·Σ_groups W e^{−γτ}[Ĥ cos ωτ +
// V̂ sin(ωτ)/ω] of η0 (m = 0) and of η1 (m = 1), as (w0/√k, w0/k^{3/2},
// w1/√k, w1/k^{3/2}) times COEFFICIENT_SCALE; W is the window, which fades a
// wavenumber out as its packet c_g(k)·τ goes from WINDOW.start to
// WINDOW.end reaches. A group's splat at signed
// distance d along the source's direction gives Ĥ0 = h·Ŝ·J0(kd) and
// Ĥ1 = 2h·Ŝ·J1(kd) (V̂ the same with v); its pair, plain Gaussians at d ∓ δ
// rising and sinking at ±lift, gives velocity only. Times are seconds since
// the oldest live source began (uTime and uStarts), so they stay small.
export const RING_SPECTRUM_FRAGMENT = /* glsl */`
#define MAX_RINGS ${MAX_RINGS}
#define MAX_GROUPS ${MAX_GROUPS}
#define PI 3.141592653589793
#define WINDOW_START ${WINDOW.start.toFixed(3)}
#define WINDOW_END ${WINDOW.end.toFixed(3)}
uniform float uTime;
uniform float uDepth;
uniform float uViscosity;
uniform float uFilm;
uniform float uScale;
uniform vec4 uGrids[MAX_RINGS];                  // per layer: Δk (rad/m), wavenumbers in use, reach R (m)
uniform vec4 uStarts[MAX_RINGS];                 // per layer: the groups' start times (a group not in use: never)
uniform vec4 uSplats[MAX_RINGS * MAX_GROUPS];    // offset d along the direction (m), σ (m), rim, height h (m)
uniform vec4 uPairs[MAX_RINGS * MAX_GROUPS];     // velocity v (m/s), the pair's lift (m/s), its σ (m), its half-separation δ (m)
${RING_MATH}
void main() {
  int layer = int(gl_FragCoord.y);
  int index = int(gl_FragCoord.x);
  vec4 grid = uGrids[layer];
  if (float(index) >= grid.y) { gl_FragColor = vec4(0.0); return; }
  float wavenumber = (float(index) + 0.5) * grid.x;
  float omega = sqrt((9.81 * wavenumber + 7.2e-5 * wavenumber * wavenumber * wavenumber) * tanh(min(wavenumber * uDepth, 20.0)));
  float damping = uFilm * wavenumber * sqrt(uViscosity * omega / 8.0) + 2.0 * uViscosity * wavenumber * wavenumber;
  // The group velocity dω/dk, for the window.
  float depthPhase = min(wavenumber * uDepth, 20.0);
  float tangent = tanh(depthPhase);
  float force = 9.81 * wavenumber + 7.2e-5 * wavenumber * wavenumber * wavenumber;
  float forceSlope = 9.81 + 3.0 * 7.2e-5 * wavenumber * wavenumber;
  float speed = (forceSlope * tangent + (depthPhase < 20.0 ? force * uDepth * (1.0 - tangent * tangent) : 0.0)) / (2.0 * omega);
  vec4 starts = uStarts[layer];
  float zeroth = 0.0;
  float first = 0.0;
  for (int group = 0; group < MAX_GROUPS; group++) {
    float age = uTime - starts[group];
    if (age < 0.0) continue;
    vec4 splat = uSplats[layer * MAX_GROUPS + group];
    vec4 pair = uPairs[layer * MAX_GROUPS + group];
    float sigma = splat.y;
    float shape = exp(-0.5 * sigma * sigma * wavenumber * wavenumber);
    if (splat.z > 1.0) shape -= exp(-0.5 * sigma * sigma * splat.z * splat.z * wavenumber * wavenumber);
    shape *= sigma * sigma;
    float alongZeroth = besselJ0(wavenumber * splat.x);
    float alongFirst = 2.0 * besselJ1(wavenumber * splat.x);
    float height0 = splat.w * shape * alongZeroth;
    float height1 = splat.w * shape * alongFirst;
    float velocity0 = pair.x * shape * alongZeroth;
    float velocity1 = pair.x * shape * alongFirst;
    if (pair.y != 0.0) {
      float pairShape = pair.z * pair.z * exp(-0.5 * pair.z * pair.z * wavenumber * wavenumber) * pair.y;
      float behind = wavenumber * (splat.x - pair.w);
      float ahead = wavenumber * (splat.x + pair.w);
      velocity0 += pairShape * (besselJ0(behind) - besselJ0(ahead));
      velocity1 += 2.0 * pairShape * (besselJ1(behind) - besselJ1(ahead));
    }
    vec2 turn = sineCosine(omega * age);
    float decay = exp(-damping * age) * (1.0 - smoothstep(WINDOW_START * grid.z, WINDOW_END * grid.z, speed * age));
    float cosine = turn.y;
    float sineOverOmega = turn.x / omega;
    zeroth += decay * (height0 * cosine + velocity0 * sineOverOmega);
    first += decay * (height1 * cosine + velocity1 * sineOverOmega);
  }
  float weight = sqrt(wavenumber) * grid.x * uScale;   // k·Δk/√k
  gl_FragColor = vec4(zeroth * weight, zeroth * weight / wavenumber, first * weight, first * weight / wavenumber);
}
`;

// 2. One source's profile (the header), into its layer: texel i is the radius
// at u = i/(PROFILE_TEXELS − 1). With w0, w1 the weights of the spectrum and
// x = kr: η0 = Σ w0 J0(x), ∂η0/∂r = −Σ w0 k J1(x), η1 = Σ w1 J1(x),
// ∂η1/∂r = Σ w1 k (J0(x) − J1(x)/x). For x ≥ DIRECT_LIMIT, with C + iS =
// e^{i(x − π/4)} and A = √(2/(π r)):
//     J0 ≈ √(2/(πx)) (C + S/(8x)),   J1 ≈ √(2/(πx)) (S + 3C/(8x)),   J1' ≈ √(2/(πx)) (C − 7S/(8x)),
// so η0 = A(Σ (w0/√k) C + Σ (w0/k^{3/2}) S/(8r)), and so on: six running sums
// of the fetched weights against C and S, which advance by the rotation
// e^{iΔk·r} each term. Their dropped 1/x² terms are under 0.1% at x = 12.
export const RING_PROFILE_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
#define DIRECT_LIMIT ${DIRECT_LIMIT.toFixed(1)}
#define TAPER_START ${TAPER_START}
uniform sampler2D uSpectrum;
uniform int uLayer;
uniform vec4 uGrid;           // Δk (rad/m), wavenumbers in use, reach R (m), mapping a
uniform float uInner;         // m: inside this the ring has nothing (the header)
uniform float uTexels;
uniform float uOutputScale;   // RING_TEXTURE_UNITS / COEFFICIENT_SCALE
${RING_MATH}
void main() {
  float position = (gl_FragCoord.x - 0.5) / (uTexels - 1.0);   // texel i: i/(N − 1)
  float mapping = uGrid.w;
  float reach = uGrid.z;
  float radius = reach * (position * position + mapping * position) / (1.0 + mapping);
  if (radius < uInner) { gl_FragColor = vec4(0.0); return; }
  float step = uGrid.x;
  int count = int(uGrid.y);
  float directTerms = DIRECT_LIMIT / max(radius * step, 1e-9) - 0.5;   // the centre (texel 0) takes every term in full
  int directCount = directTerms >= float(count) ? count : int(ceil(directTerms));
  float height0 = 0.0, slope0 = 0.0, height1 = 0.0, slope1 = 0.0;
  for (int index = 0; index < directCount; index++) {
    vec4 weights = texelFetch(uSpectrum, ivec2(index, uLayer), 0);
    float wavenumber = (float(index) + 0.5) * step;
    float root = sqrt(wavenumber);
    float zeroth = weights.x * root;
    float first = weights.z * root;
    float argument = wavenumber * radius;
    float j0 = besselJ0(argument);
    float j1 = besselJ1(argument);
    height0 += zeroth * j0;
    slope0 -= zeroth * wavenumber * j1;
    height1 += first * j1;
    slope1 += first * wavenumber * (j0 - (argument > 1e-6 ? j1 / argument : 0.5));   // J1(x)/x → ½ at the centre
  }
  if (directCount < count) {
    vec2 start = sineCosine((float(directCount) + 0.5) * step * radius - 0.25 * PI);
    float cosine = start.y;
    float sine = start.x;
    vec2 turn = sineCosine(step * radius);
    float turnCosine = turn.y;
    float turnSine = turn.x;
    float cosineSum0 = 0.0, sineSum0 = 0.0, scaledSineSum0 = 0.0;
    float sineSum1 = 0.0, cosineSum1 = 0.0, scaledCosineSum1 = 0.0;
    for (int index = directCount; index < count; index++) {
      vec4 weights = texelFetch(uSpectrum, ivec2(index, uLayer), 0);
      float wavenumber = (float(index) + 0.5) * step;
      cosineSum0 += weights.x * cosine;
      sineSum0 += weights.y * sine;
      scaledSineSum0 += weights.x * wavenumber * sine;
      sineSum1 += weights.z * sine;
      cosineSum1 += weights.w * cosine;
      scaledCosineSum1 += weights.z * wavenumber * cosine;
      float nextCosine = cosine * turnCosine - sine * turnSine;
      sine = sine * turnCosine + cosine * turnSine;
      cosine = nextCosine;
    }
    float amplitude = sqrt(2.0 / (PI * radius));
    float inverse = 1.0 / (8.0 * radius);
    height0 += amplitude * (cosineSum0 + sineSum0 * inverse);
    slope0 -= amplitude * (scaledSineSum0 + 3.0 * cosineSum0 * inverse);
    height1 += amplitude * (sineSum1 + 3.0 * cosineSum1 * inverse);
    slope1 += amplitude * (scaledCosineSum1 - 7.0 * sineSum1 * inverse);
  }
  float taper = 1.0 - smoothstep(TAPER_START * reach, reach, radius);
  gl_FragColor = vec4(slope0, slope1, height1, height0) * (uOutputScale * taper);
}
`;

/**
 * The rings' bookkeeping, without a GPU (the CPU probes use it on its own):
 * the live sources, oldest first, each { layer, centreX, centreZ,
 * directionX, directionZ, groups, plan }; how a splat joins one or starts
 * one (the header); which have faded.
 */
export class RingSources {
  constructor({ depth = 0.8 } = {}) {
    this.depth = depth;
    this.sources = [];
    this.freeLayers = Array.from({ length: MAX_RINGS }, (unused, layer) => MAX_RINGS - 1 - layer);
  }

  /** Every source gone. */
  reset() {
    for (const source of this.sources) this.freeLayers.push(source.layer);
    this.sources = [];
  }

  /**
   * A ring source at splash time `time`: a splat (centre, σ as `radius`,
   * rim, height, velocity) and optionally the pair that drags it forward
   * ({ lift, radius, offset, directionX, directionZ }: plain Gaussians of
   * σ = radius at offset either side of the centre along the direction,
   * rising behind and sinking ahead at lift). It joins a source of the same
   * throw (the header) or starts one; false, adding nothing, for a splat
   * that makes no wave.
   */
  add({ x, z, radius, height = 0, velocity = 0, rim = 1.7, pair = null }, time) {
    const strength = RING_SOURCE.strength;
    const group = {
      start: time, x, z, sigma: radius, rim, height: height * strength, velocity: velocity * strength,
      pair: pair && pair.lift !== 0 ? { lift: pair.lift * strength, sigma: pair.radius, offset: pair.offset, directionX: pair.directionX, directionZ: pair.directionZ } : null,
    };
    if (!(radius > 0) || (group.height === 0 && group.velocity === 0 && !group.pair)) return false;
    let source = this.sources.find((candidate) => candidate.groups.length < MAX_GROUPS
      && time - candidate.groups[0].start <= MERGE.seconds
      && Math.hypot(x - candidate.centreX, z - candidate.centreZ) <= MERGE.reach * radius
      && (!group.pair || !candidate.hasDirection || group.pair.directionX * candidate.directionX + group.pair.directionZ * candidate.directionZ > 0.9));
    if (!source) {
      if (this.freeLayers.length === 0) {
        // The one closest to retiring (the faintest, as a rule) gives its layer to the new one.
        let soonest = 0;
        this.sources.forEach((candidate, index) => { if (candidate.plan.end < this.sources[soonest].plan.end) soonest = index; });
        const [dropped] = this.sources.splice(soonest, 1);
        this.freeLayers.push(dropped.layer);
      }
      source = { layer: this.freeLayers.pop(), centreX: x, centreZ: z, directionX: 1, directionZ: 0, hasDirection: false, groups: [], plan: null };
      this.sources.push(source);
    }
    source.groups.push(group);
    this.arrange(source);
    return true;
  }

  /** The source's centre (its splats' strength-weighted centroid), direction, the splats' offsets along it, and its plan. */
  arrange(source) {
    const directed = source.groups.find((group) => group.pair);
    if (directed) {
      const length = Math.hypot(directed.pair.directionX, directed.pair.directionZ) || 1;
      source.directionX = directed.pair.directionX / length;
      source.directionZ = directed.pair.directionZ / length;
      source.hasDirection = true;
    }
    let weightSum = 0, sumX = 0, sumZ = 0;
    for (const group of source.groups) {
      const weight = Math.abs(group.velocity) + Math.abs(group.height) * Math.sqrt(GRAVITY / group.sigma);
      weightSum += weight;
      sumX += weight * group.x;
      sumZ += weight * group.z;
    }
    if (weightSum > 0) { source.centreX = sumX / weightSum; source.centreZ = sumZ / weightSum; }
    for (const group of source.groups) group.offset = (group.x - source.centreX) * source.directionX + (group.z - source.centreZ) * source.directionZ;
    source.plan = planSource(source.groups, this.depth);
  }

  /** Drop the sources that have faded by world time `time`. */
  retire(time) {
    const kept = [];
    for (const source of this.sources) {
      if (source.plan.end > time) kept.push(source);
      else this.freeLayers.push(source.layer);
    }
    this.sources = kept;
  }
}

export class Rings {
  /**
   * @param renderer THREE.WebGLRenderer
   * @param depth pond depth in metres, for the dispersion
   */
  constructor(renderer, { depth = 0.8 } = {}) {
    this.renderer = renderer;
    this.depth = depth;
    this.book = new RingSources({ depth });
    this.passesRun = 0;      // profile passes in the last update (for the budget report)

    this.spectrumTarget = createFloatTarget(MAX_WAVENUMBERS, MAX_RINGS);
    this.profileTarget = new THREE.WebGLArrayRenderTarget(PROFILE_TEXELS, 1, MAX_RINGS, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: true,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.spectrumPass = new FullscreenPass(RING_SPECTRUM_FRAGMENT, {
      uTime: { value: 0 },
      uDepth: { value: depth },
      uViscosity: { value: RING_DAMPING.viscosity },
      uFilm: { value: RING_DAMPING.film },
      uScale: { value: COEFFICIENT_SCALE },
      uGrids: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
      uStarts: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
      uSplats: { value: Array.from({ length: MAX_RINGS * MAX_GROUPS }, () => new THREE.Vector4()) },
      uPairs: { value: Array.from({ length: MAX_RINGS * MAX_GROUPS }, () => new THREE.Vector4()) },
    });
    this.profilePass = new FullscreenPass(RING_PROFILE_FRAGMENT, {
      uSpectrum: { value: this.spectrumTarget.texture },
      uLayer: { value: 0 },
      uGrid: { value: new THREE.Vector4() },
      uInner: { value: 0 },
      uTexels: { value: PROFILE_TEXELS },
      uOutputScale: { value: RING_TEXTURE_UNITS / COEFFICIENT_SCALE },
    });

    this.sharedUniforms = {
      uRingCount: { value: 0 },
      uRingPlaces: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
      uRingShapes: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
      uRingProfiles: { value: this.profileTarget.texture },
    };
    this.clearTextures();
  }

  /** Uniforms for every material that draws the rings (GLSL_COMMON's ringHeight, ringSlope, ringLaplacian): shared objects. */
  uniforms() { return this.sharedUniforms; }

  /** The live sources, oldest first (RingSources). */
  get sources() { return this.book.sources; }

  /** Rings alive. */
  get live() { return this.book.sources.length; }

  /** Bytes the rings' render targets hold: the spectrum and the profiles with their mip chain. */
  get bytes() {
    const spectrumBytes = MAX_WAVENUMBERS * MAX_RINGS * 4 * (this.spectrumTarget.texture.type === THREE.FloatType ? 4 : 2);
    return Math.round(spectrumBytes + PROFILE_TEXELS * MAX_RINGS * 4 * 2 * 2);
  }

  /** Every ring gone at once (the app's clearPond). */
  reset() {
    this.book.reset();
    this.sharedUniforms.uRingCount.value = 0;
  }

  /** A ring source (RingSources.add) at splash time `time`. */
  add(splat, time) { return this.book.add(splat, time); }

  /**
   * Retire the rings that have faded, then (if any live) run the spectrum
   * pass and one profile pass per live ring for world time `time`, and hand
   * the materials the live rings' places.
   */
  update(time) {
    this.book.retire(time);
    const shared = this.sharedUniforms;
    shared.uRingCount.value = this.sources.length;
    this.passesRun = 0;
    if (this.sources.length === 0) return;

    const epoch = Math.min(...this.sources.map((source) => source.groups[0].start));
    const spectrum = this.spectrumPass.material.uniforms;
    spectrum.uTime.value = time - epoch;
    for (const grid of spectrum.uGrids.value) grid.set(0, 0, 0, 0);
    for (const source of this.sources) {
      const layer = source.layer;
      spectrum.uGrids.value[layer].set(source.plan.step, source.plan.count, source.plan.reach, 0);
      const starts = spectrum.uStarts.value[layer];
      starts.set(1e9, 1e9, 1e9, 1e9);
      source.groups.forEach((group, index) => {
        starts.setComponent(index, group.start - epoch);
        spectrum.uSplats.value[layer * MAX_GROUPS + index].set(group.offset, group.sigma, group.rim, group.height);
        if (group.pair) spectrum.uPairs.value[layer * MAX_GROUPS + index].set(group.velocity, group.pair.lift, group.pair.sigma, group.pair.offset);
        else spectrum.uPairs.value[layer * MAX_GROUPS + index].set(group.velocity, 0, 1, 0);
      });
    }
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    this.spectrumPass.render(renderer, this.spectrumTarget);

    const profile = this.profilePass.material.uniforms;
    const texture = this.profileTarget.texture;
    this.sources.forEach((source, index) => {
      profile.uLayer.value = source.layer;
      profile.uGrid.value.set(source.plan.step, source.plan.count, source.plan.reach, PROFILE_MAPPING);
      profile.uInner.value = innerRadius(source, time);
      // Three.js rebuilds the array's mip chain after a render into it: once, after the last layer.
      texture.generateMipmaps = index === this.sources.length - 1;
      renderer.setRenderTarget(this.profileTarget, source.layer);
      renderer.render(this.profilePass.scene, this.passCamera);
      shared.uRingPlaces.value[index].set(source.centreX, source.centreZ, source.directionX, source.directionZ);
      shared.uRingShapes.value[index].set(source.plan.reach, PROFILE_MAPPING, source.layer, 0);
    });
    texture.generateMipmaps = true;
    this.passesRun = 1 + this.sources.length;
    renderer.setRenderTarget(previousTarget);
  }

  /**
   * Every layer of the profile texture zeroed, with its mip chain, so the
   * texture is complete before the first ring (and both passes compiled):
   * each layer drawn with no wavenumbers in use.
   */
  clearTextures() {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    for (const grid of this.spectrumPass.material.uniforms.uGrids.value) grid.set(0, 0, 0, 0);
    this.spectrumPass.render(renderer, this.spectrumTarget);
    const profile = this.profilePass.material.uniforms;
    profile.uGrid.value.set(1, 0, 1, PROFILE_MAPPING);
    profile.uInner.value = 0;
    const texture = this.profileTarget.texture;
    for (let layer = 0; layer < MAX_RINGS; layer++) {
      profile.uLayer.value = layer;
      texture.generateMipmaps = layer === MAX_RINGS - 1;
      renderer.setRenderTarget(this.profileTarget, layer);
      renderer.render(this.profilePass.scene, this.passCamera);
    }
    texture.generateMipmaps = true;
    renderer.setRenderTarget(previousTarget);
  }
}
