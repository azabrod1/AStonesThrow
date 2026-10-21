// Rings: the waves a stone's splash sends across the whole pond.
//
// The splash solver (src/spectralWater.js) is a 6 m periodic patch whose
// damping is set so that its waves die before they wrap around it. A real
// pond's ripples travel much farther: what damps them is the surface film
// (RING_DAMPING), so the ring a stone throws should cross the pond for
// tens of seconds. Its source is therefore not handed to the solver but
// evolved here exactly: a downward push released just after the stone goes
// in (stampCavity and RING in src/splash.js), with the pair of heights that
// makes an oblique entry's ring run stronger ahead and the pushes a little
// down its path. The solver keeps the near field: the drops' landings, the
// jet's mound and its base. Linear waves add, so the surface is the
// solver's field, the wind's (src/ambientWaves.js) and the rings' together.
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
// two radial profiles. A push's pair, heights raised ahead and lowered
// behind (a dipole, all in η1), is a quarter period out of step with the
// push itself, so far out J1's quarter-wave lag puts it in step: the waves
// ahead grow and those behind shrink (an in-step pair of velocities would
// only move the crests). The parts m ≥ 2 are left out. An oblique throw's
// splats and pairs lie 1 to 21 cm from its centre (with the stone's size),
// so they are not small: they move up to a tenth of the ring's height around
// it, a sixth for an 8 or 16 cm stone's at 4 s (tools/ring-probe.mjs
// measures it). Seen from above the ring keeps its circles, their spacing
// and its lean forward; only the contrast around it is a little more even.
// Keeping m ≤ 3 would take four profiles a ring (a second render target) and
// twice the work in the profile pass.
//
// The source, fitted to a reference simulation (tools/basilisk/: a 3 cm-
// radius stone going in straight at 6.3 m/s, its surface continued linearly
// from 1 s, results/rings_linear.md). The simulated ring's spectrum at 1 s
// is that of a push released in the hole's first tenth of a second, most of
// its height in 20 to 50 cm waves: fitted to it, a velocity alone (so the
// ring starts from flat water) of σ = 2R less one of σ·2.5, released
// 0.9·sqrt(R/g) after entry at 0.195 of the entry speed. With the
// simulation's damping (2νk², the film off) its height from trough to crest
// is 0.94, 0.96, 0.98, 1.02 and 1.07 of the simulation's at 0.5, 0.75, 1, 1.5
// and 2 m (8.7 mm at 1 m), its highest crest passes within 0.5% of the
// simulation's time at 0.75 to 2 m (2.7 s at 1 m, 5.0 s at 2 m) with the
// same wavelength within 8%, and before 1 s the field outside the hole is
// much the simulation's too (its outgoing crest 19 mm high at 0.11 m at
// 0.5 s, the simulation's 29 mm); with the film it is 5 to 10% lower. Of
// the simulation's 10 to 16 cm waves it has a fifth: the train of them
// that trails the simulated ring (1 to 1.7 mm rms behind it at 0.25 to 1 m)
// comes from its centre after the push, where the jet's base falls and a
// second jet rises on the axis until about 1.6 s, exactly axisymmetric
// there and so more coherent than a real column, and where the app's own
// jet and drops ring the solver instead. The jet the throw draws adds no
// ring of its own when it falls back: the simulated ring holds its share.
// Lengths scale with R and times with sqrt(R/g) (Froude similarity),
// and the push with the entry speed, as the old cavity splat's did: one
// reference throw cannot tell how a ring's height grows with R and V, so its
// V·sqrt(R) is an assumption, as is the simulation's air, ten times lighter
// than real (with real air that throw seals at the surface, which may change
// its ring by tens of percent). RING_SOURCE.strength multiplies every source
// (1: as fitted); tools/ring-probe.mjs checks the fit.
//
// The near field. Near the stone, while the splash stands, linear theory
// makes the hole's bowl (5 to 7 cm deep at 0.15 s for the reference stone,
// as the simulation's funnel is) and a central mound after it, under the
// drawn cavity, crown and jet, which would stand over a bowl or sink into a
// mound. So the ring is faded out there (NEAR_FIELD), the more the nearer its
// centre, so the fade itself is never steep: inside 4σ while the hole is
// drawn, then, once it has filled, only over the jet's base (0.5σ to 1.75σ:
// 3 to 10.5 cm for the reference stone, from about 0.35 s), until
// 11·sqrt(σ/g) after its release, fully in by 16·sqrt(σ/g) (0.86 and 1.25 s
// for the reference stone), when only a few millimetres of it are left
// there. The ring's first trough and crest leave the centre while the jet
// stands (the simulation has them 10 cm out at 0.3 and 0.5 s, as this ring
// does); hidden inside 4σ until then, they showed only once 24 cm out, about
// 0.75 s after entry, and the rings looked late after the splash.
//
// In a pool (src/spectralWater.js setPool) the ring has walls to come back
// off, which an analytic ring cannot: its source goes into the solver, whose
// patch reflects it. The solver has no near field to fade, so here the
// source is a near-field ring (add's nearOnly): the part NEAR_FIELD hides,
// with its sign turned, so with the solver's ring the surface is the same
// faded ring the open pond draws until the fade is over, and then the
// solver's alone. It is drawn out to the near field's outer radius only and
// retires when the fade ends (16·sqrt(σ/g) after its release: 1.25 s for
// the reference stone, 2.8 s for a 30 cm rock). It needs its release to be
// the solver's: src/splash.js hands both the same source in the same frame.
//
// A source (one throw's ring) is up to MAX_GROUPS groups, each a splat and
// its pair released together; a splat joins the source started at most
// MERGE.seconds earlier within MERGE.reach of its σ (the pushes down an
// oblique entry's path), and the source's centre is the strength-weighted
// centroid of its splats. At most liveLimit sources are live (the quality
// presets' rings, src/main.js: 24 on High, 12 on Medium, 8 on Low). A
// reference stone's ring lives 90 to 120 s, so a stone every four seconds
// or so fills High's (and a Skip throw starts a source at each touch); a
// new one past them makes the live one closest to retiring, the faintest
// as a rule, fade out over FADE_SECONDS (8 s) in its layer. Such a ring is
// as a rule tens of seconds old and a millimetre or so high, so it loses
// well under a millimetre a second and nobody sees it go. The MAX_RINGS
// layers leave MAX_RINGS − liveLimit for rings fading out (8 on High); when
// none is free, the ring that would stop being drawn soonest goes at once.
//
// Each source's sampling is planned (planSource) from a stationary-phase
// envelope of its ring. At time τ the wavenumber k is found at
// r = c_g(k)·τ with slope about k^{3/2} A(k) e^{−γτ} / (τ √(c_g |c_g'|))
// (A the splats' amplitude; the spread capped near the capillary-gravity
// minimum of c_g, where the stationary point is an Airy caustic). That is
// the asymptotic amplitude, not a bound (a velocity-only splat's exact slope
// meets it), so for each k the age at which it falls below
// SLOPE_VISIBLE/RETIRE_MARGIN gives the ring's lifetime, and how far its
// packet has gone by then the extent the ring shows to. With a camera
// (setCamera: src/main.js hands it the view's pixels per radian and the
// nearest water the shore frame shows while the eye stands at the shore,
// and none anywhere else), a packet counts only as much as a
// pixel shows of it (resolvedShare): the mip chain averages it over the
// pixel's footprint along the radius, at least (d² + h²)/(h·f)·cos α at the
// nearest d the camera sees of its circle (h the camera's height, f its
// pixels per radian, α the angle the radius makes with the view), and a box
// keeps at most 2/(kF) of a sinusoid; of a circle the camera stands outside,
// the sides run across the view, so all of it counts. So a far, long ring
// retires sooner. A view with REPLAN times more pixels per radian than a
// live source was planned for (a zoom, a bigger canvas) plans it again, one
// source a frame, so a zoom never plans every live ring in one frame. The
// profile's reach R is REACH.margin times the extent over TAPER_START, so the
// taper begins beyond anything that shows (R within REACH.least and
// REACH.most). The k-sum is a midpoint rule of step Δk, under which what
// lies at radius r' reappears near 2π/Δk − r' and 2π/Δk + r' (Poisson
// summation; the Bessel functions' 1/√r makes an image near the centre
// stronger than what made it). So the spectrum pass fades out each
// wavenumber whose packet c_g(k)·τ has passed WINDOW.start·R, all of it gone
// by WINDOW.end·R (beyond the reach, where nothing is drawn), and Δk is
// 2π/(ALIAS_PERIOD·R), which puts every image of what is left beyond R. The
// sum runs to where the narrowest Gaussian's spectrum is 1e-4 (at most
// WAVENUMBER_CAP and MAX_WAVENUMBERS; a pebble's reach is cut by the latter).
// The plan also keeps, for each k, the age until which its packet is still
// SLOPE_VISIBLE·OUTER.share steep: at age τ a ring has nothing to draw
// beyond OUTER.margin times the farthest such packet (outerRadius) and needs
// no wavenumber beyond OUTER.margin times the shortest (usedCount: the film
// damps the short waves first). tools/ring-probe.mjs checks the plan against
// the exact profile: no ring retires while it shows, and what is drawn
// matches the exact profile over the reach and beyond.
//
// Retirement. A ring retires when its largest slope anywhere (as the
// camera's pixels show it) falls below SLOPE_VISIBLE = 1e-4: that turns the
// mirror image by 2e-4 rad, under a third of a pixel at the phone's framing
// (about 1400 pixels per radian), moves the refraction by a twentieth of
// one, and changes the floor's caustics by under 0.1% (the bound the solver
// sleeps by, src/spectralWater.js). A ring whose reach is cut (at REACH.most,
// 40 m, past the far edge of the pond the view shows, or by MAX_WAVENUMBERS)
// retires once nothing that shows is left inside it. tools/ring-probe.mjs
// prints each stone's, thrown as the app throws, by the slope alone and by
// the home view: the reference 6 cm stone's retires 119 s after the throw by
// the slope (it would show to 92 m; the reach is 40 m), 93 s by the home view
// on a desktop and 101 s on a phone; a 1.5 cm pebble's 50 to 52 s (14 m); a
// 4 cm stone's 79 to 86 s, an 8 cm stone's 99 to 105 s and a 16 cm stone's
// 96 to 98 s. When it retires by a home view, the steepest slope any of its
// pixels shows, each averaging the exact ring over its own footprint, is
// under SLOPE_VISIBLE.
//
// Each rendered frame, while any ring lives (update):
//   1. one spectrum pass (RING_SPECTRUM_FRAGMENT) over MAX_WAVENUMBERS × MAX_RINGS
//      texels evaluates, for every source and k on its grid it sums that
//      frame (usedCount), the two profiles' weights k·Δk·W·e^{−γτ}[…] summed
//      over its groups (each released at its own time; W the window above),
//      divided by √k and by k^{3/2} for the asymptotic sums below; float32
//      where the device renders it, else half floats, scaled by
//      COEFFICIENT_SCALE into their normal range. It reads each layer's
//      grid, its groups' start times, splats and pairs from sourceTable, a
//      float32 texture of SOURCE_TABLE_WIDTH texels a layer filled each
//      frame: as uniform arrays they took 10 vectors a layer, 320 for 32
//      layers, past the 224 a WebGL2 fragment shader is sure of;
//   2. one profile pass per source drawn (RING_PROFILE_FRAGMENT) writes its
//      layer of PROFILE_TEXELS radii. Texel i is at u = i/(N − 1), so the
//      first is the centre and the last the reach and linear filtering is
//      exact at both ends; its radius is R·(u² + a·u)/(1 + a), a =
//      PROFILE_MAPPING: 7.5e-5·R apart at the centre and 9e-4·R at the rim
//      (3 mm and 3.6 cm for a 40 m reach), fine enough that what the water
//      reads between texels matches the exact profile (tools/ring-probe.mjs).
//      Outside its annulus it writes zero at once: inside innerRadius (no
//      wave is slower than SLOWEST_GROUP_SPEED, the capillary-gravity
//      minimum, so at age τ no part of the ring is nearer its centre than
//      that times τ, less the source's own extent (SOURCE_EXTENT of its
//      widest splat's σ·rim, and its offsets), but the Airy tail of the
//      caustic there, exponentially small: INNER_SHARE keeps a margin) and
//      beyond outerRadius, so a young ring costs little and an old one less.
//      Elsewhere terms with kr < DIRECT_LIMIT evaluate J0 and J1 in full
//      (Abramowitz and Stegun 9.4.1 to 9.4.6), the rest by their Hankel
//      asymptotics to 1/(kr) with the phase kr − π/4 advanced from term to
//      term by a rotation (Δk·r per step), so a term costs a fetch and a
//      dozen multiply-adds. Then the near field is faded out (NEAR_FIELD), a
//      ring leaving faded by its fade, and it writes ∂η0/∂r, ∂η1/∂r, η1 and
//      η0, times RING_TEXTURE_UNITS, half floats, tapered to zero over the
//      last 15% of R;
//   3. the array's mip chain is rebuilt once (Three.js, after the last layer),
//      so that a pixel reads a ring averaged over its own footprint along the
//      radius (textureGrad, GLSL_COMMON in src/shaders/scene.js), and far
//      ripples average to flat instead of shimmering.
// The water surface adds each ring's slope to its normal and its height to
// the inner patch's displacement, the floor's caustics its Laplacian, the
// foam specks and a crown's foot ride its height (GLSL_COMMON's ringSlope,
// ringHeight and ringLaplacian, behind a branch on uRingCount, so with no
// ring alive a frame costs what it did and no pass runs); each lookup skips
// a ring outside its annulus, so a ring costs a pixel only where its waves
// are. The floor's caustics take only the youngest rings, those holding the
// CAUSTIC_RINGS youngest live ones (a ring fading out among them too, as the
// other lookups take it): a ring's curvature falls fast as its waves
// lengthen (the reference stone's, its symmetric part's largest, from about
// 1.9/m at 4 s to 0.46/m at 12 s and 0.15/m at 24 s), and the floor's
// lookups cost as much as the water's. A ring past them leaves the caustics
// over CAUSTIC_FADE_SECONDS rather than at once (and comes back as gently
// if a younger one retires first): each source's share (RingSources
// updateCaustics) multiplies its Laplacian. uniforms() gives the uniforms
// those materials spread.
//
// The cost. A minute of throwing (tools/ring-probe.mjs: the default stone
// every 3 to 5 s at random places in view, then quiet) keeps about 11
// rings drawn on High and on Medium (9.2 on Low, those fading out among
// them), whose profile passes fetch 20 M spectrum texels a frame (18 M on
// Low) and whose lookups come to about 10.4 M of the water's pixels' on a
// desktop, 10.9 M on a phone, and 8.3 M of the floor's (desktop: its
// caustics take 6.7 rings). A stone every 1.5 s fills the live rings: on
// High it keeps 24 drawn (30 at most) at 47 M fetches and 25 M of a
// desktop's water lookups (26 M of a phone's, 11 M of the floor's), on Low
// 13 at 25 M fetches and 21 M of a phone's. The weaker rings before this
// calibration, two to a throw and looked up at every pixel within their
// reach, kept 12 drawn at 33 M fetches and 22 M lookups a frame. Its last ring retires 96 to 103 s
// after the last throw (63 s before, for rings a seventh as strong). On the
// CPU a source is planned when it starts, about 0.7 ms on a desktop (a zoom
// plans the live ones again, one a frame), and update's bookkeeping takes
// some 40 µs a frame.
import * as THREE from 'three';
import { FullscreenPass, createFloatTarget } from './gpu.js';

export const MAX_RINGS = 32;          // layers of the profile texture: live and fading sources together
export const DEFAULT_LIVE_LIMIT = 24; // sources that count as live at once (setLiveLimit; the quality presets set it), so the rings leaving have MAX_RINGS − this layers to fade out in
export const FADE_SECONDS = 8;        // a ring pushed out by a newer one fades out over this long: slowly enough that nobody sees it go (the header)
export const CAUSTIC_RINGS = 6;       // the floor's caustics take the youngest this many live rings (ringLaplacian in src/shaders/scene.js)...
export const CAUSTIC_FADE_SECONDS = 3;   // ...and an older one leaves them over this long
export const MAX_GROUPS = 4;          // splat groups a source holds (an oblique entry's cavity uses three)
export const SOURCE_TABLE_WIDTH = 2 + 2 * MAX_GROUPS;   // texels a layer of the spectrum pass's table: its grid, its groups' start times, then each group's splat and pair
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
// Every ring source's strength against the source src/splash.js makes (RING
// there, fitted to the reference simulation's ring: the header).
export const RING_SOURCE = { strength: 1 };
export const SLOPE_VISIBLE = 1e-4;    // a ring retires once no slope of it is this steep (the header)
const RETIRE_MARGIN = 1.3;            // the envelope is planned against SLOPE_VISIBLE over this, so a ring retires late, never early
export const REACH = { least: 2, most: 40, margin: 1.15 };   // a profile's radius: margin × where it shows, over TAPER_START, within these (m)
export const WINDOW = { start: 1.15, end: 1.4 };     // in reaches: where the spectrum pass fades out a wavenumber's packet
export const ALIAS_PERIOD = 2.5;      // 2π/Δk in reaches: the images of what the window keeps lie beyond the reach
export const SLOWEST_GROUP_SPEED = 0.177;   // m/s: c_g's minimum (4.3 cm waves); no part of a ring is nearer its centre than this times its age
export const INNER_SHARE = 0.85;      // the profile pass writes zero inside this share of that radius...
export const SOURCE_EXTENT = 4;       // ...less this many of the source's widest σ·rim (a Gaussian keeps 3e-4 of its peak there)
export const OUTER = { share: 0.1, margin: 1.25 };   // the ring is drawn out to margin × the farthest packet still SLOPE_VISIBLE·share steep, and to the shortest such wave
// The drawn splash (the cavity, the crown, the jet and the solver's mound)
// is the near field: the ring is faded out inside `outer` of the source's
// widest σ beyond its offsets (from `inner` out, the more the nearer its
// centre, by a quintic), until `from`, and fully in by `to`, in sqrt(σ/g)
// after its release. Linear theory makes the hole's wide, deep bowl there
// (5 to 7 cm deep for the reference stone at 0.15 s, as the simulation's
// funnel is), which would leave the drawn cavity standing over it, and then
// a central mound under the drawn jet. The bowl is the hole's, so the wide
// region is hidden only while the hole is drawn: the hole has filled 2.2 to
// 3 sqrt(σ/g) after the release for every stone (tools/cavity-probe.mjs),
// and over `settle` the hidden region shrinks to the jet's base (`base`,
// inner and outer in σ), so the ring's first trough and crest, which the
// reference simulation has 8 to 24 cm out from 0.25 s on (as this ring
// does), show as they leave the centre rather than once past 4σ. By `to`
// the ring has gone out past the jet, and what is left near the centre is a
// few mm.
export const NEAR_FIELD = { inner: 0, outer: 4, from: 11, to: 16, settle: [2.5, 4], base: { inner: 0.5, outer: 1.75 } };
const WAVENUMBER_CAP = 400;           // rad/m: 1.6 cm waves, which the film damps within 15 cm
const GAUSSIAN_REACH = 4.29;          // σ·k at which a splat's Gaussian spectrum is 1e-4: the rest adds under 3e-5 to a slope
const MERGE = { seconds: 0.05, reach: 3 };   // a splat joins a source started this recently, this many of its σ away
const REPLAN = 1.25;                  // a live source is planned again when the camera has this many times the pixels per radian it was planned for
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

/**
 * The share of a wave of this wavenumber, `radius` from its source's centre,
 * that a pixel of `camera` can show (the header): the mip chain averages it
 * over the pixel's footprint along the radius, at least
 * F = (d² + h²)/(h·f)·cos α, d the nearest the camera sees of that circle (at
 * least camera.nearest), h the camera's height, f its pixels per radian and
 * α the angle the radius makes with the view (at most asin(D/r), D the
 * camera's distance from the centre), and a box keeps at most 2/(kF) of a
 * sinusoid. Of a circle the camera stands outside, the sides run across the
 * view, so all of it shows; without a camera, all of it.
 */
function resolvedShare(camera, wavenumber, radius) {
  if (!camera || radius <= camera.distance) return 1;
  const nearest = Math.max(radius - camera.distance, camera.nearest);
  const footprint = (nearest * nearest + camera.height * camera.height) / (camera.height * camera.pixelsPerRadian) * Math.sqrt(1 - (camera.distance / radius) ** 2);
  return Math.min(1, 2 / (wavenumber * footprint));
}

/** The envelope of the slope that wavenumbers near this table entry make, at age τ, for amplitude A(k) (the header), as much as `camera` shows of it. */
function slopeEnvelope(entry, amplitude, age, camera = null) {
  const spread = Math.min(1 / Math.sqrt(entry.bend * age), AIRY * (entry.twist * age) ** (-1 / 3));
  const shown = resolvedShare(camera, entry.wavenumber, entry.groupVelocity * age);
  return entry.wavenumber ** 1.5 * amplitude * Math.exp(-entry.damping * age) * spread / Math.sqrt(entry.groupVelocity * age) * shown;
}

/** The age (s) at which the envelope (as `camera` shows it) falls below `threshold`, by bisection on a geometric scale: it only falls with age. */
function ageBelow(entry, amplitude, threshold, camera = null) {
  let young = 0.25, old = 3000;
  if (slopeEnvelope(entry, amplitude, young, camera) < threshold) return 0;
  for (let step = 0; step < 18; step++) {
    const middle = Math.sqrt(young * old);
    if (slopeEnvelope(entry, amplitude, middle, camera) > threshold) young = middle; else old = middle;
  }
  return old;
}

/** The largest |height| and |velocity|/ω a group can give a wave of this wavenumber: Ŝ(|h| + |v|/ω), the pair's two Gaussians of height too. */
function groupAmplitude(group, wavenumber, omega) {
  let amplitude = Math.abs(splatSpectrum(wavenumber, group.sigma, group.rim)) * (Math.abs(group.height) + Math.abs(group.velocity) / omega);
  if (group.pair) amplitude += 2 * Math.abs(group.pair.height) * splatSpectrum(wavenumber, group.pair.sigma, 1);
  return amplitude;
}

/**
 * A source's sampling (the header): its k-grid (step Δk and count), its
 * profile's reach R (m), when it retires (end, world seconds), its lifetime
 * after its last splat and how far it shows; and `visible`, for each
 * wavenumber of the envelope's table, its group speed and the age until
 * which its packet is still SLOPE_VISIBLE·OUTER.share steep (outerRadius and
 * usedCount). `groups` hold their start times and splat parameters; with
 * `camera` ({ distance from the source's centre, height, pixelsPerRadian,
 * nearest }, resolvedShare), only as much of each packet counts as the
 * camera's pixels can show.
 */
export function planSource(groups, depth = 0.8, camera = null) {
  const table = envelopeTable(depth);
  const latest = Math.max(...groups.map((group) => group.start));
  const earliest = Math.min(...groups.map((group) => group.start));
  let lifetime = 0, extent = 0;
  const visible = [];
  for (const entry of table) {
    let amplitude = 0;
    for (const group of groups) amplitude += groupAmplitude(group, entry.wavenumber, entry.omega);
    if (!(amplitude > 0)) continue;
    const visibleAge = ageBelow(entry, amplitude, SLOPE_VISIBLE / RETIRE_MARGIN, camera);
    lifetime = Math.max(lifetime, visibleAge);
    if (visibleAge > 0) extent = Math.max(extent, entry.groupVelocity * (visibleAge + latest - earliest));
    const drawnAge = ageBelow(entry, amplitude, SLOPE_VISIBLE * OUTER.share, camera);
    if (drawnAge > 0) visible.push({ wavenumber: entry.wavenumber, speed: entry.groupVelocity, until: drawnAge });
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
      lifetime = Math.max(lifetime, Math.min(ageBelow(entry, amplitude, SLOPE_VISIBLE / RETIRE_MARGIN, camera), reach / entry.groupVelocity));
    }
  }
  return { step, count, reach, end: latest + lifetime, lifetime, extent, visible };
}

/** How far (m) a source's splats reach from its centre: its widest σ·rim, or its pair's, beyond its offset. */
function sourceExtent(source) {
  let extent = 0;
  for (const group of source.groups) {
    extent = Math.max(extent, Math.abs(group.offset ?? 0) + group.sigma * Math.max(group.rim, 1));
    if (group.pair) extent = Math.max(extent, Math.abs(group.offset ?? 0) + group.pair.offset + group.pair.sigma);
  }
  return extent;
}

/** The radius (m) inside which a source has nothing at world time `time` (the header): what the profile pass leaves at zero. */
export function innerRadius(source, time) {
  const youngest = Math.max(...source.groups.map((group) => group.start));
  return Math.max(INNER_SHARE * SLOWEST_GROUP_SPEED * (time - youngest) - SOURCE_EXTENT * sourceExtent(source), 0);
}

/**
 * The radius (m) beyond which a source has nothing to draw at world time
 * `time` (the header): OUTER.margin times the farthest a packet still
 * SLOPE_VISIBLE·OUTER.share steep has gone since the first splat, past
 * SOURCE_EXTENT of its extent; at most its reach, and nothing before it starts.
 */
export function outerRadius(source, time) {
  const age = time - Math.min(...source.groups.map((group) => group.start));
  if (!(age > 0)) return 0;
  let farthest = 0;
  for (const entry of source.plan.visible) if (entry.until > age) farthest = Math.max(farthest, entry.speed * age);
  return Math.min(OUTER.margin * farthest + SOURCE_EXTENT * sourceExtent(source), source.plan.reach);
}

/**
 * How many of a source's wavenumbers its sums take at world time `time`
 * (the header): up to OUTER.margin times the shortest wave whose packet is
 * still SLOPE_VISIBLE·OUTER.share steep (the film damps the short ones
 * first), on its grid.
 */
export function usedCount(source, time) {
  const age = time - Math.max(...source.groups.map((group) => group.start));
  let shortest = 0;
  for (const entry of source.plan.visible) if (entry.until > age) shortest = Math.max(shortest, entry.wavenumber);
  return Math.min(source.plan.count, Math.ceil(OUTER.margin * shortest / source.plan.step));
}

/**
 * The near field (NEAR_FIELD) of a source at world time `time`: the radii
 * (m) over which its ring fades in, and how much of it is hidden inside them
 * (1, while the splash stands, to 0).
 */
export function nearField(source, time) {
  let widest = 0, offset = 0;
  for (const group of source.groups) {
    widest = Math.max(widest, group.sigma);
    offset = Math.max(offset, Math.abs(group.offset ?? 0));
  }
  const unit = Math.sqrt(widest / GRAVITY);
  const age = time - Math.min(...source.groups.map((group) => group.start));
  const settled = THREE.MathUtils.smoothstep(age, NEAR_FIELD.settle[0] * unit, NEAR_FIELD.settle[1] * unit);
  return {
    inner: offset + THREE.MathUtils.lerp(NEAR_FIELD.inner, NEAR_FIELD.base.inner, settled) * widest,
    outer: offset + THREE.MathUtils.lerp(NEAR_FIELD.outer, NEAR_FIELD.base.outer, settled) * widest,
    hide: 1 - THREE.MathUtils.smoothstep(age, NEAR_FIELD.from * unit, NEAR_FIELD.to * unit),
  };
}

/** When a source's near field is fully in (world seconds): a near-field ring (the header) retires then. */
export function nearFieldEnd(source) {
  const widest = Math.max(...source.groups.map((group) => group.sigma));
  return Math.min(...source.groups.map((group) => group.start)) + NEAR_FIELD.to * Math.sqrt(widest / GRAVITY);
}

/** How many profile texels lie between two radii of a profile of this reach (what a profile pass computes). */
export function texelsBetween(inner, outer, reach) {
  const position = (radius) => 0.5 * (Math.sqrt(PROFILE_MAPPING ** 2 + 4 * (1 + PROFILE_MAPPING) * Math.min(Math.max(radius, 0), reach) / reach) - PROFILE_MAPPING);
  if (!(outer > inner)) return 0;
  return Math.max(Math.floor(position(outer) * (PROFILE_TEXELS - 1)) - Math.ceil(position(inner) * (PROFILE_TEXELS - 1)) + 1, 0);
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
// Ĥ1 = 2h·Ŝ·J1(kd) (V̂ the same with v); its pair, plain Gaussians of height
// at d + δ raised and at d − δ lowered by h_p, gives height only. Times are
// seconds since the oldest live source began (uTime and the table's start
// times), so they stay small. The sources are read from uSources
// (Rings.sourceTable), row `layer`: texel 0 its grid, 1 its groups' start
// times, 2 + 2g group g's splat and 3 + 2g its pair.
export const RING_SPECTRUM_FRAGMENT = /* glsl */`
#define MAX_GROUPS ${MAX_GROUPS}
#define PI 3.141592653589793
#define WINDOW_START ${WINDOW.start.toFixed(3)}
#define WINDOW_END ${WINDOW.end.toFixed(3)}
uniform float uTime;
uniform float uDepth;
uniform float uViscosity;
uniform float uFilm;
uniform float uScale;
// Per layer (row): texel 0, Δk (rad/m), wavenumbers in use, reach R (m);
// texel 1, the groups' start times (a group not in use: never); then per
// group, its splat: offset d along the direction (m), σ (m), rim, height h
// (m); and its pair: velocity v (m/s), the pair's height h_p (m), its σ (m),
// its half-separation δ (m).
uniform sampler2D uSources;
${RING_MATH}
void main() {
  int layer = int(gl_FragCoord.y);
  int index = int(gl_FragCoord.x);
  vec4 grid = texelFetch(uSources, ivec2(0, layer), 0);
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
  vec4 starts = texelFetch(uSources, ivec2(1, layer), 0);
  float zeroth = 0.0;
  float first = 0.0;
  for (int group = 0; group < MAX_GROUPS; group++) {
    float age = uTime - starts[group];
    if (age < 0.0) continue;
    vec4 splat = texelFetch(uSources, ivec2(2 + 2 * group, layer), 0);
    vec4 pair = texelFetch(uSources, ivec2(3 + 2 * group, layer), 0);
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
      height0 += pairShape * (besselJ0(ahead) - besselJ0(behind));
      height1 += 2.0 * pairShape * (besselJ1(ahead) - besselJ1(behind));
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
uniform float uInner;         // m: inside this the ring has nothing (the header)...
uniform float uOuter;         // ...nor beyond this
uniform vec3 uNearField;      // m, m, share: inside the first radius the ring is hidden by the share, fading in to the second (NEAR_FIELD)
uniform float uNearOnly;      // 1 for a pool's near-field ring (the header): what the fade hides, its sign turned
uniform float uTexels;
uniform float uOutputScale;   // RING_TEXTURE_UNITS / COEFFICIENT_SCALE, times the fade of a ring leaving
${RING_MATH}
void main() {
  float position = (gl_FragCoord.x - 0.5) / (uTexels - 1.0);   // texel i: i/(N − 1)
  float mapping = uGrid.w;
  float reach = uGrid.z;
  float radius = reach * (position * position + mapping * position) / (1.0 + mapping);
  if (radius < uInner || radius > uOuter) { gl_FragColor = vec4(0.0); return; }
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
  // The near field, the drawn splash's: hidden, and the slopes of what shows
  // take the fade's own (∂(mη)/∂r = m ∂η/∂r + η ∂m/∂r). The fade is a
  // quintic, flat to its second derivative at both ends, so the slopes it
  // makes have no kink for the texels to cut. A near-field ring shows what
  // the fade hides, turned over: m − 1, whose slope is the fade's own.
  float fadeWidth = max(uNearField.y - uNearField.x, 1e-6);
  float across = clamp((radius - uNearField.x) / fadeWidth, 0.0, 1.0);
  float shown = 1.0 - uNearOnly - uNearField.z * (1.0 - across * across * across * (10.0 - 15.0 * across + 6.0 * across * across));
  float shownSlope = uNearField.z * 30.0 * across * across * (1.0 - across) * (1.0 - across) / fadeWidth;
  slope0 = shown * slope0 + shownSlope * height0;
  slope1 = shown * slope1 + shownSlope * height1;
  height0 *= shown;
  height1 *= shown;
  float taper = 1.0 - smoothstep(TAPER_START * reach, reach, radius);
  gl_FragColor = vec4(slope0, slope1, height1, height0) * (uOutputScale * taper);
}
`;

/** When a source stops being drawn: its plan's end, or the end of its fade. */
const endOf = (source) => (source.fading ? Math.min(source.fading.end, source.plan.end) : source.plan.end);

/**
 * The rings' bookkeeping, without a GPU (the CPU probes use it on its own):
 * the sources drawn, oldest first, each { layer, centreX, centreZ,
 * directionX, directionZ, groups, plan, fading, caustic }; how a splat
 * joins one or starts one (the header); which have faded. At most liveLimit
 * are live; a new one past that makes the live one closest to retiring (the
 * faintest, as a rule) fade out over FADE_SECONDS (fading: { start, end })
 * in its layer, and when no layer is free the one that would stop being
 * drawn soonest goes at once. caustic is its share of the floor's caustics
 * (updateCaustics).
 */
export class RingSources {
  constructor({ depth = 0.8, liveLimit = DEFAULT_LIVE_LIMIT, camera = null } = {}) {
    this.depth = depth;
    this.sources = [];
    this.liveLimit = liveLimit;
    this.camera = camera;
    this.freeLayers = Array.from({ length: MAX_RINGS }, (unused, layer) => MAX_RINGS - 1 - layer);
    this.causticTime = null;   // the world time updateCaustics last ran at
  }

  /** At most this many live sources (1 to MAX_RINGS), from the next new one on. */
  setLiveLimit(limit) { this.liveLimit = THREE.MathUtils.clamp(Math.round(limit), 1, MAX_RINGS); }

  /**
   * The camera the rings retire by: { x, z, height, pixelsPerRadian,
   * nearest } (its position, its pixels per radian across the canvas, the
   * nearest water it can see), or null to plan without one (planSource).
   * A source planned for fewer pixels per radian than REPLAN times this
   * one's is planned again, so a zoom that shows more keeps more; with no
   * camera, every source planned for one is, by its slope alone, so it lives
   * as long as any view could show it. Marked here, planned by retire, one a
   * frame (a plan takes about 0.7 ms on a desktop, tools/ring-probe.mjs).
   */
  setCamera(camera) {
    this.camera = camera;
    for (const source of this.sources) {
      if (camera ? !source.plannedFor || camera.pixelsPerRadian > REPLAN * source.plannedFor.pixelsPerRadian : source.plannedFor) source.replan = true;
    }
  }

  /** The source's plan for the current camera; a near-field ring's ends with its near field. */
  planFor(source) {
    const camera = this.camera && { distance: Math.hypot(source.centreX - this.camera.x, source.centreZ - this.camera.z), height: this.camera.height, pixelsPerRadian: this.camera.pixelsPerRadian, nearest: this.camera.nearest };
    source.plannedFor = camera;
    source.replan = false;
    const plan = planSource(source.groups, this.depth, camera);
    if (source.nearOnly) plan.end = Math.min(plan.end, nearFieldEnd(source));
    return plan;
  }

  /** Every source gone. */
  reset() {
    for (const source of this.sources) this.freeLayers.push(source.layer);
    this.sources = [];
  }

  /**
   * A ring source at splash time `time` (its release; the future is fine):
   * a splat (centre, σ as `radius`, rim, height, velocity) and optionally
   * the pair that drags it forward ({ height, radius, offset, directionX,
   * directionZ }: plain Gaussians of σ = radius at offset either side of the
   * centre along the direction, raised ahead and lowered behind by height).
   * nearOnly makes it a pool's near-field ring (the header). It joins a
   * source of the same throw (the header) or starts one; false, adding
   * nothing, for a splat that makes no wave.
   */
  add({ x, z, radius, height = 0, velocity = 0, rim = 1.7, pair = null, nearOnly = false }, time) {
    const strength = RING_SOURCE.strength;
    const group = {
      start: time, x, z, sigma: radius, rim, height: height * strength, velocity: velocity * strength,
      pair: pair && pair.height !== 0 ? { height: pair.height * strength, sigma: pair.radius, offset: pair.offset, directionX: pair.directionX, directionZ: pair.directionZ } : null,
    };
    if (!(radius > 0) || (group.height === 0 && group.velocity === 0 && !group.pair)) return false;
    let source = this.sources.find((candidate) => !candidate.fading && candidate.groups.length < MAX_GROUPS && candidate.nearOnly === nearOnly
      && time - candidate.groups[0].start <= MERGE.seconds
      && Math.hypot(x - candidate.centreX, z - candidate.centreZ) <= MERGE.reach * radius
      && (!group.pair || !candidate.hasDirection || group.pair.directionX * candidate.directionX + group.pair.directionZ * candidate.directionZ > 0.9));
    if (!source) {
      const live = this.sources.filter((candidate) => !candidate.fading);
      if (live.length >= this.liveLimit) {
        let soonest = live[0];
        for (const candidate of live) if (candidate.plan.end < soonest.plan.end) soonest = candidate;
        soonest.fading = { start: time, end: time + FADE_SECONDS };
      }
      if (this.freeLayers.length === 0) {
        let dropped = this.sources[0];
        for (const candidate of this.sources) if (endOf(candidate) < endOf(dropped)) dropped = candidate;
        this.sources.splice(this.sources.indexOf(dropped), 1);
        this.freeLayers.push(dropped.layer);
      }
      source = { layer: this.freeLayers.pop(), centreX: x, centreZ: z, directionX: 1, directionZ: 0, hasDirection: false, nearOnly, groups: [], plan: null, plannedFor: null, replan: false, fading: null, caustic: 1 };
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
    source.plan = this.planFor(source);
  }

  /** Plan again the first live source setCamera marked (one a frame), then drop the sources that have faded by world time `time`. */
  retire(time) {
    const marked = this.sources.find((source) => source.replan && !source.fading);
    if (marked) marked.plan = this.planFor(marked);
    const kept = [];
    for (const source of this.sources) {
      if (endOf(source) > time) kept.push(source);
      else this.freeLayers.push(source.layer);
    }
    this.sources = kept;
  }

  /** How much of a source is drawn at world time `time`: 1, or less while it fades out. */
  shown(source, time) {
    return source.fading ? 1 - THREE.MathUtils.smoothstep(time, source.fading.start, source.fading.end) : 1;
  }

  /**
   * The floor's caustics at world time `time` (the header): the youngest
   * sources up to and with the CAUSTIC_RINGS-th youngest live one take part
   * in full (a source fading out among them too), each older one's share
   * (source.caustic) falls to 0 over CAUSTIC_FADE_SECONDS, and climbs back
   * as gently should it be among them again. Returns how many of the
   * youngest sources have a share: the caustics' loop takes those.
   */
  updateCaustics(time) {
    const change = this.causticTime === null ? 0 : Math.max(time - this.causticTime, 0) / CAUSTIC_FADE_SECONDS;
    this.causticTime = time;
    let liveSeen = 0, taking = 0;
    for (let index = this.sources.length - 1; index >= 0; index--) {
      const source = this.sources[index];
      const among = liveSeen < CAUSTIC_RINGS;
      if (!source.fading) liveSeen++;
      source.caustic = among ? Math.min(source.caustic + change, 1) : Math.max(source.caustic - change, 0);
      if (source.caustic > 0) taking = this.sources.length - index;
    }
    return taking;
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
    this.passesRun = 0;      // passes in the last update (for the budget report)...
    this.fetchesRun = 0;     // ...and the spectrum fetches its profile passes made (texels computed × wavenumbers summed)

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
    // The spectrum pass's sources (RING_SPECTRUM_FRAGMENT): a row a layer,
    // float32 on every device (it is only read, texel by texel), filled each frame.
    this.sourceTable = new THREE.DataTexture(new Float32Array(SOURCE_TABLE_WIDTH * MAX_RINGS * 4), SOURCE_TABLE_WIDTH, MAX_RINGS, THREE.RGBAFormat, THREE.FloatType);
    this.sourceTable.minFilter = THREE.NearestFilter;
    this.sourceTable.magFilter = THREE.NearestFilter;
    this.sourceTable.generateMipmaps = false;
    this.sourceTable.needsUpdate = true;

    this.spectrumPass = new FullscreenPass(RING_SPECTRUM_FRAGMENT, {
      uTime: { value: 0 },
      uDepth: { value: depth },
      uViscosity: { value: RING_DAMPING.viscosity },
      uFilm: { value: RING_DAMPING.film },
      uScale: { value: COEFFICIENT_SCALE },
      uSources: { value: this.sourceTable },
    });
    this.profilePass = new FullscreenPass(RING_PROFILE_FRAGMENT, {
      uSpectrum: { value: this.spectrumTarget.texture },
      uLayer: { value: 0 },
      uGrid: { value: new THREE.Vector4() },
      uInner: { value: 0 },
      uOuter: { value: 0 },
      uNearField: { value: new THREE.Vector3() },
      uNearOnly: { value: 0 },
      uTexels: { value: PROFILE_TEXELS },
      uOutputScale: { value: RING_TEXTURE_UNITS / COEFFICIENT_SCALE },
    });

    this.sharedUniforms = {
      uRingCount: { value: 0 },
      uRingPlaces: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
      uRingShapes: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
      uRingProfiles: { value: this.profileTarget.texture },
      uCausticRings: { value: 0 },
      uRingCaustics: { value: Array.from({ length: Math.ceil(MAX_RINGS / 4) }, () => new THREE.Vector4()) },
    };
    this.clearTextures();
  }

  /** Uniforms for every material that draws the rings (GLSL_COMMON's ringHeight, ringSlope, ringLaplacian): shared objects. */
  uniforms() { return this.sharedUniforms; }

  /** The sources drawn, oldest first (RingSources). */
  get sources() { return this.book.sources; }

  /** Rings drawn: the live ones and those fading out. */
  get live() { return this.book.sources.length; }

  /** Rings fading out, pushed out by newer ones (RingSources). */
  get fading() { return this.book.sources.filter((source) => source.fading).length; }

  /** At most this many live rings (RingSources.setLiveLimit; the quality presets set it). */
  setLiveLimit(limit) { this.book.setLiveLimit(limit); }
  get liveLimit() { return this.book.liveLimit; }

  /** The camera the rings retire by (RingSources.setCamera). */
  setCamera(camera) { this.book.setCamera(camera); }

  /** Bytes the rings' textures hold: the spectrum, the profiles with their mip chain, and the spectrum pass's table of sources. */
  get bytes() {
    const spectrumBytes = MAX_WAVENUMBERS * MAX_RINGS * 4 * (this.spectrumTarget.texture.type === THREE.FloatType ? 4 : 2);
    return Math.round(spectrumBytes + PROFILE_TEXELS * MAX_RINGS * 4 * 2 * 2 + this.sourceTable.image.data.byteLength);
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
   * the materials the live rings' places and their shares of the caustics.
   */
  update(time) {
    this.book.retire(time);
    const shared = this.sharedUniforms;
    shared.uRingCount.value = this.sources.length;
    shared.uCausticRings.value = this.book.updateCaustics(time);
    this.passesRun = 0;
    this.fetchesRun = 0;
    if (this.sources.length === 0) return;

    // Each source's annulus, wavenumbers in use, near field and fade this frame (the header).
    // A near-field ring has nothing beyond its near field's outer radius.
    const frames = this.sources.map((source) => {
      const inner = innerRadius(source, time);
      const near = nearField(source, time);
      const outer = source.nearOnly ? Math.min(outerRadius(source, time), near.outer) : outerRadius(source, time);
      return { inner, outer: Math.max(outer, inner), count: usedCount(source, time), near, shown: this.book.shown(source, time) };
    });
    const epoch = Math.min(...this.sources.map((source) => source.groups[0].start));
    this.spectrumPass.material.uniforms.uTime.value = time - epoch;
    // The table of sources (RING_SPECTRUM_FRAGMENT): a layer with no source has no wavenumbers in use.
    const table = this.sourceTable.image.data;
    table.fill(0);
    const put = (layer, texel, first, second, third, fourth) => {
      const offset = 4 * (layer * SOURCE_TABLE_WIDTH + texel);
      table[offset] = first;
      table[offset + 1] = second;
      table[offset + 2] = third;
      table[offset + 3] = fourth;
    };
    this.sources.forEach((source, index) => {
      const layer = source.layer;
      put(layer, 0, source.plan.step, frames[index].count, source.plan.reach, 0);
      const start = (slot) => (slot < source.groups.length ? source.groups[slot].start - epoch : 1e9);   // a group not in use: never
      put(layer, 1, start(0), start(1), start(2), start(3));
      source.groups.forEach((group, slot) => {
        put(layer, 2 + 2 * slot, group.offset, group.sigma, group.rim, group.height);
        if (group.pair) put(layer, 3 + 2 * slot, group.velocity, group.pair.height, group.pair.sigma, group.pair.offset);
        else put(layer, 3 + 2 * slot, group.velocity, 0, 1, 0);
      });
    });
    this.sourceTable.needsUpdate = true;
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    this.spectrumPass.render(renderer, this.spectrumTarget);

    const profile = this.profilePass.material.uniforms;
    const texture = this.profileTarget.texture;
    this.sources.forEach((source, index) => {
      const frame = frames[index];
      profile.uLayer.value = source.layer;
      profile.uGrid.value.set(source.plan.step, frame.count, source.plan.reach, PROFILE_MAPPING);
      profile.uInner.value = frame.inner;
      profile.uOuter.value = frame.outer;
      profile.uNearField.value.set(frame.near.inner, frame.near.outer, frame.near.hide);
      profile.uNearOnly.value = source.nearOnly ? 1 : 0;
      profile.uOutputScale.value = frame.shown * RING_TEXTURE_UNITS / COEFFICIENT_SCALE;
      // Three.js rebuilds the array's mip chain after a render into it: once, after the last layer.
      texture.generateMipmaps = index === this.sources.length - 1;
      renderer.setRenderTarget(this.profileTarget, source.layer);
      renderer.render(this.profilePass.scene, this.passCamera);
      shared.uRingPlaces.value[index].set(source.centreX, source.centreZ, source.directionX, source.directionZ);
      shared.uRingShapes.value[index].set(source.plan.reach, frame.outer, source.layer, frame.inner);
      shared.uRingCaustics.value[Math.floor(index / 4)].setComponent(index % 4, source.caustic);
      this.fetchesRun += texelsBetween(frame.inner, frame.outer, source.plan.reach) * frame.count;
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
    this.sourceTable.image.data.fill(0);
    this.sourceTable.needsUpdate = true;
    this.spectrumPass.render(renderer, this.spectrumTarget);
    const profile = this.profilePass.material.uniforms;
    profile.uGrid.value.set(1, 0, 1, PROFILE_MAPPING);
    profile.uInner.value = 0;
    profile.uOuter.value = 1;
    profile.uNearField.value.set(0, 0, 0);
    profile.uNearOnly.value = 0;
    profile.uOutputScale.value = RING_TEXTURE_UNITS / COEFFICIENT_SCALE;
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
