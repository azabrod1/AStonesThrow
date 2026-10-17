// A Stone’s Throw: throw rocks into a lake and watch the splash.
//
// Frame pipeline:
//   1. advance the stones, droplets and bubbles (CPU), feeding the water;
//   2. step the spectral water surface (GPU) and its foam, unless it sleeps
//      (Low power, below);
//   3. evaluate the ambient wind waves at the frame's time (GPU, once per
//      rendered frame; src/ambientWaves.js), under a gale its waves and
//      their foam (src/galeWaves.js), the profiles of the rings that
//      cross the pond (GPU, while any lives; src/rings.js), the rain's
//      tile of raindrops' rings (GPU, while it rains; src/rain.js) and the
//      splash's sheets and columns (CPU);
//   4. while a splash lives, draw it into the water's mirror image (below);
//   5. render what is under the surface (the lake bed or the pool's basin,
//      submerged stones, bubbles) to a texture with depth, the stones,
//      bubbles and basin where the still surface shows them (src/rock.js,
//      src/pool.js);
//   6. render the main scene (sky dome, water surface refracting pass 5 and
//      reflecting the mirror image, the stones' cavities in it
//      (src/cavity.js), foam specks riding the surface, stones above the
//      surface, the rain's streaks and flecks, the gale's spray) to an HDR
//      texture with depth;
//   7. draw the splash's water over it and tone-map to the canvas; with no
//      water in the air, only the tone map (src/splash.js).
// All simulation runs in world seconds scaled by the slow-motion factor.
//
// The view. The camera stands on an orbit about a pivot (src/viewOrbit.js),
// facing it: at home on the shore view the page opens with (VIEWS.shore),
// 1.15 m above the bank, looking out over the pond. A one-finger or mouse
// drag (a press that moves TAP_SLOP pixels or more, which never throws) walks
// it round the pivot and up or down, what is under the finger following it,
// ORBIT_TURN radians for a drag across the canvas's height; the View setting
// glides it to another orbit (VIEWS: the shore, down at the water, high
// above, under the water) over GLIDE_SECONDS, and Escape and the Reset view
// button glide it home. An orbit whose pivot is under the water keeps its
// eye under it too (eyeBounds), so a drag never takes it through the
// surface; only a glide does. Under the water the frame is UNDER_FOV times
// wider, and the frame is drawn from below (renderFromBelow): no mirror, no
// under-water pass, the bed, stones and bubbles faded by the water to the
// eye, the surface and the cavities with their from-below shading (Snell's
// window, the mirror past it, the sun's shafts), and nothing in the air. Wherever it stands, the view zooms by narrowing the field of view
// (from the frame's 48° landscape or 62° portrait down to 8°) and turning
// the camera, horizon level, so that what is under the pointer stays there
// (src/viewZoom.js): the mouse wheel by 0.9 per notch, a two-finger pinch
// with the inverse of the change in finger spacing, while the fingers'
// midpoint holds on to what was under it. A zoomed view stays inside the
// unzoomed frame, so zooming all the way out returns to it, and turns with
// it; a drag that starts zoomed first moves the pivot to what the view looks
// at (the water under its centre, or a point as far off as the pivot was),
// so it turns round that. The rocks are always thrown from the shore, by a
// hand beside and below the shore view's eye, so every throw enters the
// water as the tools reproduce it. The mirror image of the sky is
// re-rendered at the next frame whenever the view has changed, and while a
// splash lives it is drawn over where the splash's own mirror image falls,
// each frame (updateReflection). A tap throws at the water under it, brought
// inside the solver's patch less POND_MARGIN (or MARGIN_RADII of a big
// rock's radius) when it is beyond (or on the sky): a splash nearer the
// patch's edge would ring across it, since the patch is periodic. In the pool
// it is brought inside the pool's walls less POOL_MARGIN instead, so the
// splash stands clear of them. A skip keeps the tap's direction, even on
// the sky (aimPoint's `keep` off): its first touch lands along it (below).
// For testing, ?trace=1, the T key or setTrace
// traces each stone from the hand (traceRock): its path, its track on the
// water under it, a cross where it touches and a line down from the top of
// each arc, over everything.
// With Skip on (setSkip: the Throw group's
// switch, off while a ball or a gem is chosen) a tap throws a stone of any
// kind as a skip instead (skipThrow, aimSkip in src/rock.js):
// a flat stone, from the hand let down to SKIP_THROW.handHeight, at
// SKIP_THROW's speed for the strength (gentler in the pool; slower for a big
// stone), towards the tap and nearly level (SKIP_THROW.elevation): it first
// touches the water at the tap if a release that level reaches it, else as
// near to it as one does, so it always comes in low (a skip cannot be thrown
// to land at one's feet), and on open water (SKIP_THROW.shallowest deep, or
// inside the pool); if no such touch lies along the tap's direction, along
// the direction of the tap brought onto the water as a throw is; failing
// that (a big stone thrown slowly in the pool) as far as it reaches, on the
// deck, which it lands on as ground (src/rock.js groundAt, src/pool.js
// poolGround). The aim's ring and arc show where it comes down. From there it skips on as
// src/rock.js works out, out of the patch and the pool too. While a
// press aims (or a mouse hovers) a ring on the water and a faint arc from
// the hand show the throw; a throw hides them, a mouse's until it moves on,
// or the arc's end would hang in the splash as a hairline. A press held
// still for HOLD_MS dips a finger into the water there instead (src/
// touch.js): the arc goes, a small ring marks the finger, dragging trails it
// through the water and letting go lifts it out; it neither throws nor
// turns the view.
//
// What is thrown. The Object setting (setThing, remembered on this device;
// ?thing=) picks a kind of stone or a ball (src/things.js THINGS), and the
// strip's slider sets its size in its own unit (setSize: a stone's
// diameter, a bowling ball's pounds, a basketball's size; a golf or tennis
// ball has one size). measureThing gives what a throw is: its radius, mass
// and density. A river stone is thrown as stones always were
// (throwVelocity); anything else is aimed by src/rock.js aimThrow, which
// flies it against the air's drag (a tennis ball or a piece of pumice
// would fall several centimetres short) and throws a heavy ball no faster
// than it can be thrown (a 16 lb bowling ball 5.75 m/s), short of a tap
// beyond its reach; the aim's ring and arc show where it comes down. A big
// ball leaves the hand lower, as a big rock does (handPosition). A floater
// (src/rock.js `float`) comes up with a ring (`ripple`, src/splash.js
// ripple), is in the water's mirror image (its meshMirror, redrawn where it
// is whenever it is not where it was last drawn: updateReflection), drifts downwind under a gale
// (setDrift). A thing thrown at a floater meets it (src/collide.js: they
// bounce off each other, the floater dipping and bobbing, ringing the
// water and throwing off spray), floaters bump, and the pool's walls send
// things back (src/pool.js holdInPool, run in collideThings' passes, so a
// knock passes along a row and off a wall within the substep). In the pool the deck is
// ground to anything thrown (src/pool.js poolGround). What is in sight
// stays: a floater, or a thing at rest on the deck (keptInSight), goes only
// when more than MAX_IN_SIGHT are kept (the oldest first) or a gale has
// drifted it FARTHEST_AFLOAT away; a throw past MAX_ROCKS retires the
// oldest thing out of sight (in the air, under the water, on the bed), and
// a stone at rest on the bed goes after 40 s.
//
// The pool. The Pool water (WATER_CLARITIES.pool) puts the rocks in a tiled
// pool instead of the lake: the solver's patch becomes a basin whose walls
// reflect the waves (src/spectralWater.js setPool), the lake's bed, beach and
// open water give way to the pool's basin and deck (src/pool.js:
// showScenery), the rocks rest on its floor and the eye stands on the deck
// or in the water, under it inside the walls (eyeBounds; a glide across the
// surface goes in over the water). The views are the lake's but for the
// shore view, which looks down into the pool from its near corner, and the
// low one, whose eye is just inside the pool's near wall (POOL_VIEWS). A
// change between the pool and the lake starts the new one still
// (setPooled).
//
// Quality. Each preset of QUALITY sets the work a frame does: the splash
// solver's grid, the inner water patch's mesh (src/waterSurface.js), the
// resolution of the under-water pass and of the mirror image (underScale of
// the canvas's), the splash's fluid buffers (fluidScale), the cap on device
// pixels per CSS pixel, and the frame rate of a pond where nothing happens;
// never a target's format (QUALITY says why). Whatever the preset, the canvas holds at
// most PIXEL_BUDGET device pixels (the pixel ratio is lowered to fit).
// applyQuality rebuilds whatever the preset changes: the solver (which keeps
// its waves, src/spectralWater.js), the mesh, every target.
// window.__pond.budget reports what is built, with an estimate of the GPU
// memory the render targets hold.
//
// Low power. A pond where nothing happens does as little as it can. The
// solver sleeps (no passes at all) once its last splat or foam stamp is
// SLEEP_SECONDS of simulated time behind and nothing of the splash is left
// (src/spectralWater.js derives the time from its damping); the composite is
// a plain tone map while no water is in the air; and on a preset with an
// idleFrameRate, once nothing has moved, been touched or zoomed for
// IDLE.quietSeconds, frames come at most that often (every other
// requestAnimationFrame on a 60 Hz display), the simulated time still
// advancing by the real time between them.
//
// Starting is asynchronous: the sky is a photographed panorama
// (src/sky.js) that has to load before anything is built, because the sun's
// elevation is the photo's. Before the pond reports ready, under the page's
// loading veil, warmUp throws a stone (and a floater, drawn once in the
// mirror image) and draws its flight and splash at a
// few moments, so that every GPU program a throw needs (the stone's, the
// splash's passes, the mirror's, the cavity's, the composite's, the specks')
// is compiled then rather than at the first throw, then clears it all away:
// the pond starts still, at time zero. The settings (the page's panel)
// each have their own localStorage key, and the page's parameters win over
// them: ?sky=<name> picks the place, ?time=<hour> its hour (src/sky.js:
// a place's hours are photographs of it through a day; setSky and setHour
// load another later, in place: the sun follows, and the mirror image is
// drawn again; a place takes the hour nearest the time of day last chosen,
// TIME_STORAGE_KEY, and ?sky=sunrise, the old Sunrise sky, is Lakeside at
// sunrise);
// ?view=shore|level|high|under stands the camera at one of VIEWS (showView);
// ?water=pool|clear|lake|pond|murky the water (WATER_CLARITIES; setClarity);
// ?wind=x,z sets the direction the wind blows toward in world XZ
// (DEFAULT_WIND otherwise); ?windStrength=calm|breeze|windy|gale the wind's
// strength (WIND_STRENGTHS in src/ambientWaves.js, a gale's waves
// GALE_STRENGTHS in src/galeWaves.js; setWind);
// ?weather=clear|light-rain|heavy-rain|storm the weather (WEATHERS: the sky's cloud and
// haze, src/sky.js, the rain, src/rain.js, and a storm's lightning,
// src/lightning.js, and gale; setWeather); each otherwise
// the one last chosen on this device, or lakeside's afternoon, lake, calm
// and clear; ?paused=1
// starts with the clock stopped
// (resume() starts it); ?quality=high|medium|low fixes a preset (QUALITY),
// otherwise the quality calibrates itself from the frame rate (CALIBRATION),
// keeps watching it, and reports each change through onQualityChange.
// ?profile=1 runs the profiling steps of src/profiler.js and reports through
// onProfile.
import * as THREE from 'three';
import { SpectralWater } from './spectralWater.js';
import { AmbientWaves, DEFAULT_WIND, WIND_STRENGTHS } from './ambientWaves.js';
import { GaleWaves, GALE_STRENGTHS } from './galeWaves.js';
import { Rain } from './rain.js';
import { lightningAt } from './lightning.js';
import { Rings } from './rings.js';
import { createEnvironment, SKY_NAMES, skyHours, resolveHour, nearestHour } from './sky.js';
import { createWaterSurface } from './waterSurface.js';
import { createPondFloor, createShore, floorDepthAt, groundHeightAt } from './pondFloor.js';
import { Rock, aimSkip, aimThrow, flutterTrial, skipSpeed, SKIP_THROW } from './rock.js';
import { THINGS, DEFAULT_THING, defineThing } from './things.js';
import { collideThings } from './collide.js';
import { SplashSystem, MIRROR_LAYER } from './splash.js';
import { createFloatTarget, FullscreenPass, configureFloatSupport, renderTargetBytes } from './gpu.js';
import { UNDER_BACKGROUND_FRAGMENT } from './shaders/scene.js';
import { directionAt, placeDirection, clampToFrame, zoomToward, isZoomed, viewFacing } from './viewZoom.js';
import { orbitEye, orbitFacing, orbitAbout, clampOrbit, turnOrbit, blendOrbits, orbitsMatch, keepInside, LOWEST_EYE } from './viewOrbit.js';
import { Profiler } from './profiler.js';
import { FingerInWater, FINGER } from './touch.js';
import { createPool, holdInPool, poolGround, poolInside, POOL } from './pool.js';

// Quality presets. The splash lives in a few dozen pixels, so the fluid
// buffer's resolution is what it is made of: a drop narrower than a buffer
// pixel is widened to one, so at half resolution on a 1× canvas every fleck
// of spray became a 4-pixel square.
//   grid          the splash solver's cells per side (6 m): 512 resolves 2.3 cm
//                 ripples, 256 4.7 cm ones;
//   meshSegments  the inner water patch's quads per side (it only carries the
//                 displacement; the shading's normals come from the textures);
//   underScale    the under-water pass's and the mirror image's resolution, of
//                 the canvas's (both are seen through ripples);
//   fluidScale    the splash's fluid buffers', of the canvas's;
//   idleFrameRate the frame rate of a pond where nothing happens (0: every frame);
//   maxDpr        the cap on device pixels per CSS pixel;
//   rings         the stones' rings drawn at once (src/rings.js): a newer one
//                 makes the faintest fade out. Each costs every water pixel
//                 its waves cover a lookup, and a pass a frame;
//   rainTexels    the rain's tile's texels per side (src/rain.js, 1 m): 512
//                 resolves its rings' shortest crests, 256 blurs them a little.
// Every target keeps its format on every preset, so a program drawn under the
// loading veil (warmUp) meets no new pipeline state after a change of preset;
// and every mesh takes 16-bit indices (at most 254 segments: Three.js keeps
// the index 65535 for primitive restart).
export const QUALITY = {
  high: { grid: 512, meshSegments: 254, underScale: 1.0, fluidScale: 1.0, idleFrameRate: 0, maxDpr: 2.0, rings: 10, rainTexels: 512 },
  medium: { grid: 256, meshSegments: 160, underScale: 0.5, fluidScale: 0.5, idleFrameRate: 30, maxDpr: 2.0, rings: 8, rainTexels: 256 },
  low: { grid: 256, meshSegments: 128, underScale: 0.5, fluidScale: 0.5, idleFrameRate: 30, maxDpr: 1.5, rings: 6, rainTexels: 256 },
};
export const PIXEL_BUDGET = 2.6e6;   // device pixels in the canvas, on every preset
const QUALITY_ORDER = ['high', 'medium', 'low'];
// Automatic quality starts every device on high and steps down from what it
// measures, never from what the device looks like: the frame rate of the idle
// pond after warm-up, then of the first splash (the fluid passes run only
// while drops are in the air, so the idle rate overestimates). From the idle
// measurement on it keeps watching: a frame rate below sustainedMinimumFps
// over sustainedSeconds of frames drawn one per requestAnimationFrame steps
// down once more. It never steps up.
const CALIBRATION = {
  warmUpFrames: 30,          // the first mip chains and caches
  windowFrames: 60,          // frames averaged for one measurement
  fewestFrames: 20,          // a splash that ends sooner is measured on what it gave
  idleMinimumFps: 50,        // idle below this: one step down; below splashMinimumFps: two
  splashMinimumFps: 30,      // the first splash below this: one step down
  sustainedMinimumFps: 25,   // later, this or less...
  sustainedSeconds: 3,       // ...over this long: one step down
  settleSeconds: 2,          // nothing is judged this long after a change of preset
  stallSeconds: 0.5,         // a longer interval is a stall (a hidden tab, a rebuild), not a frame rate
};
const IDLE = {
  quietSeconds: 1,           // nothing moving, touched or zoomed for this long...
  tolerance: 0.004,          // ...and frames come at the preset's idleFrameRate, this many seconds early at most
};
const POWER = { soft: 1.3, normal: 1.0, hard: 0.72 };   // flight-time multipliers
const POND_DEPTH = 0.8;       // the depth the waves take (the solver, the wind's ripples, the rings): see the bed below
const POND_MARGIN = 0.4;      // metres inside the solver's patch that a tap's throw keeps to...
const MARGIN_RADII = 4;       // ...or this many of the rock's radius, if more: a 30 cm rock's splats reach 3 radii out
const POOL_MARGIN = 0.25;     // metres inside the pool's walls a throw keeps to (or MARGIN_RADII of the rock's radius)
const EYE_EDGE = 0.3;         // metres inside the pool's edge over which the deck's height eases in for the eye
const MAX_ROCKS = 10;          // things out of sight (flying, sinking, on the bed) at once: a throw past this retires the oldest of them
const MAX_IN_SIGHT = 12;       // things kept in sight (floaters, things at rest on the deck): only past this is the oldest of them retired
const FARTHEST_AFLOAT = 30;    // m: a floater a gale has drifted this far from the pond is out of sight, and goes
const TRACE = { points: 4000, step: 0.01, marks: 100, cross: 0.06 };   // a stone's traced path (setTracing): at most this many points, one per this many metres it moves; at most this many touches and arc tops marked; a touch's cross this many metres each way
const MIN_FOV = 8;            // degrees: the narrowest zoom
const WHEEL_STEP = 0.9;       // field of view factor per wheel notch
const HOME_TARGET = [0, 0.12, -1.0];
const TAP_SLOP = 14;          // CSS pixels a press may move and still throw; past them it turns the view
const HOLD_MS = 300;          // a press held this long within TAP_SLOP dips a finger into the water
const ORBIT_TURN = Math.PI;   // radians the view turns for a drag across the canvas's height
const GLIDE_SECONDS = 1.0;    // a glide to another view
// The View setting's choices (src/viewOrbit.js): the shore view the page
// opens with, 1.15 m above the water's edge; down at the water, its eye 16 cm
// up, 1.9 m from where the rocks land; high above, 2.4 m up and a little to
// the side, looking down on where they land; under the water, 0.85 m down
// over the shallows, 1.5 m short of where they land, looking up and out
// toward it and the sun, its shafts coming down through Snell's window.
const VIEWS = {
  shore: orbitAbout({ x: 0, y: 1.15, z: 2.45 }, { x: HOME_TARGET[0], y: HOME_TARGET[1], z: HOME_TARGET[2] }),
  level: orbitAbout({ x: 0, y: 0.16, z: 0.5 }, { x: 0, y: 0.1, z: -1.4 }),
  high: orbitAbout({ x: 1.0, y: 2.4, z: 0.6 }, { x: 0, y: 0, z: -1.3 }),
  under: orbitAbout({ x: -0.7, y: -0.85, z: -0.1 }, { x: 0, y: -0.3, z: -1.4 }),
};
// In the pool (src/pool.js) the shore view stands on the deck at the pool's
// near corner, 1.7 m up and 1.2 m back from it, a little to the side, and
// looks down into the pool, its floor and two of its walls; the low view's
// eye is over the water just inside the near wall, 25 cm in from it, rather
// than at the lake's edge, where the pool's deck stands. The rocks are thrown
// from the lake's shore view's hand all the same (handPosition).
const POOL_VIEWS = {
  ...VIEWS,
  shore: orbitAbout({ x: 0.6, y: 1.7, z: 1.7 }, { x: 0, y: 0, z: -1.1 }),
  level: orbitAbout({ x: 0, y: 0.16, z: 0.25 }, { x: 0, y: 0.1, z: -1.4 }),
};
// Where the eye may stand (clampOrbit, src/viewOrbit.js): over the water at
// least LOWEST_EYE above the beach or the still water; under it, on an orbit
// whose pivot is under it, UNDER_GAP clear of the bed and of the surface.
const UNDER_GAP = 0.15;
// Under the water the frame is this much wider (72° landscape), so Snell's
// window overhead and the bed below fit in one view.
const UNDER_FOV = 1.5;
const SUN_AZIMUTH = Math.atan2(0.42, 0.78);   // radians right of straight ahead (−Z), about 28°
const DEBUG_MODES = { under: 0, height: 1, foam: 2, env: 3, face: 4, ambient: 5 };   // setDebugView names
const DEFAULT_WIND_STRENGTH = 'calm';
const WIND_STORAGE_KEY = 'stone-pond-wind';   // the Wind setting's last choice on this device
const WATER_STORAGE_KEY = 'stone-pond-water'; // the Water setting's
const SKY_STORAGE_KEY = 'stone-pond-sky';     // the Location setting's
const TIME_STORAGE_KEY = 'stone-pond-time';   // the Time setting's: the local time ('hh:mm') of the hour last chosen
const WEATHER_STORAGE_KEY = 'stone-pond-weather';   // the Weather setting's
const THING_STORAGE_KEY = 'stone-pond-thing';       // the Object setting's: what is thrown (src/things.js)
// The Weather setting: the cloud's cover and the light under it, against a
// clear sky's (src/sky.js setWeather: overcast takes the sun and greys the
// sky), the rain's visibility (its haze), the rain (src/rain.js) and how wet
// the pool's deck goes. A light rain falls from a thin, bright overcast
// (about a third of a clear day's light, 10 km to see), a downpour from a
// dark one (an eighth, 1.5 km), a storm's from a darker one (a twentieth,
// 800 m), with lightning (src/lightning.js) and a gale (`wind`: choosing it
// sets the Wind setting too, unless the page's ?windStrength says).
const WEATHERS = {
  clear: { cover: 0, light: 1, visibility: Infinity, rain: null, wet: 0 },
  'light-rain': { cover: 1, light: 0.35, visibility: 10000, rain: 'light', wet: 0.5 },
  'heavy-rain': { cover: 1, light: 0.12, visibility: 1500, rain: 'heavy', wet: 1 },
  storm: { cover: 1, light: 0.05, visibility: 800, rain: 'heavy', wet: 1, lightning: true, wind: 'gale' },
};
const GALE_EYE_CLEARANCE = 0.45;  // m the eye keeps from the still water under a gale: its crests and troughs reach about 0.4
const GALE_MIRROR_MARGIN = 0.1;   // m: the splash's mirror image under a gale is reckoned this much roomier (the waves under it are not level)
const RAIN_WIND = 3;   // m/s the rain drifts with the Breeze; the wind's strength scales it
const SUN_BALANCE = [3.0, 2.85, 2.55];        // the sun's irradiance under the meadow sky; another sky's has its photo's colour (src/sky.js)
// The water (the Water setting): its absorption, per metre, which dims the
// light going down to the bed; its extinction, per metre, absorption plus
// scattering, which dims the bed seen through the water; and the radiance of
// water too deep to see through (lighting below; WATER_FRAGMENT in
// src/shaders/scene.js). The bed deepens from the bank (src/pondFloor.js),
// so in any of them the sand shows near the bank and fades with depth, and a
// ring's light on the sand is gone where the rocks land.
// Lake, the default, is a clear Alpine lake's (Lake Zurich's): little
// absorbed but red, so the sand under the shallows is lit nearly white and
// deep water is turquoise-blue. Clear is a spring's, bluer and clearer
// still. Pond is a green pond's, its blue absorbed by dissolved matter;
// Murky a lake after rain, where the sand shows only at the bank. Pool is
// the pool's (src/pool.js), with its basin in place of the lake: filtered
// water, nearly pure water's absorption (about 0.35, 0.06 and 0.015 per
// metre in red, green and blue) and little scattering, so the white tiles
// show through the whole basin, tinted aqua by the red it takes out.
const WATER_CLARITIES = {
  pool: { absorb: [0.35, 0.06, 0.015], extinction: [0.42, 0.11, 0.06], color: [0.010, 0.090, 0.130] },
  clear: { absorb: [0.40, 0.07, 0.05], extinction: [0.9, 0.35, 0.32], color: [0.012, 0.085, 0.115] },
  lake: { absorb: [0.45, 0.10, 0.07], extinction: [1.3, 0.85, 0.8], color: [0.014, 0.075, 0.100] },
  pond: { absorb: [0.95, 0.36, 0.34], extinction: [2.0, 1.45, 1.65], color: [0.015, 0.074, 0.041] },
  murky: { absorb: [1.0, 0.45, 0.55], extinction: [3.0, 2.4, 2.7], color: [0.022, 0.082, 0.040] },
};
const DEFAULT_WATER = 'lake';
// The warm-up's throw (the reference stone, aimed as the profiler's) and the
// moments after its impact it draws: the crown, the fan, the cavity, spray
// and the mirror; the jet column; the specks and the drops' landing crowns.
// Its randomness is seeded (Park–Miller, as tools/shoot.mjs seeds a throw):
// seed 4 raises a clean jet 90 cm tall (tools/variety-probe.mjs --list), so
// the column's three programs are built too, where an unseeded throw raised
// none about one time in thirty (its jet form "none") and the first throw
// with a jet then built them.
const WARM_UP = { x: 0, z: -1.4, radius: 0.03, moments: [0.02, 0.16, 0.4], seed: 4, floaters: ['pumice', 'pizza'] };   // a floater of each program: pumice the stones', a pizza its textured one

export async function startPond({ canvas, quality = 'auto', onReady, onError, onStats, onViewChange, onQualityChange, onProfile }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (error) {
    onError?.('WebGL 2 is not available in this browser.');
    throw error;
  }
  // ?floats=half takes the half-float path that devices without
  // EXT_color_buffer_float get, to test it on any machine.
  const pageParameters = new URLSearchParams(window.location.search);
  const forceHalfFloat = pageParameters.get('floats') === 'half';
  configureFloatSupport(renderer, { forceHalfFloat });
  // EXT_color_buffer_float also makes half floats renderable, so either will do.
  const renderableFloats = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  if (!renderer.capabilities.isWebGL2 || !renderableFloats) {
    onError?.('This browser cannot render to floating-point textures, which the water needs.');
    throw new Error('floating-point render targets missing');
  }
  renderer.localClippingEnabled = true;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  // A frame is many render() calls: render() resets the counts once per frame, so they are the frame's.
  renderer.info.autoReset = false;

  // Lighting shared by every shader. Values are linear radiance in arbitrary
  // units chosen so that a sunlit pond tone-maps well at the given exposure.
  // The sun's direction and the sky's ambient radiance come from the sky
  // panorama; shaders hold these vectors by reference, so they are filled in
  // place, never replaced; so is the sun's irradiance, which the sky sets
  // too (src/sky.js). The water (WATER_FRAGMENT in src/shaders/scene.js says
  // how): absorb, per metre, dims the light going down to the floor and
  // through the splash's thin water; extinction, per metre, absorption plus
  // scattering, dims the floor seen through the water, which fades into
  // waterColor, the radiance of water too deep to see through. The Water
  // setting sets those two (WATER_CLARITIES).
  const lighting = {
    sunDirection: new THREE.Vector3(),
    sunIrradiance: new THREE.Vector3(),
    skyAmbient: new THREE.Vector3(),
    absorb: new THREE.Vector3(),
    extinction: new THREE.Vector3(),
    waterColor: new THREE.Vector3(),
    exposure: 0.55,
    night: 0,   // how far the eye sees with its rods (src/sky.js; NIGHT_VISION in src/shaders/fluid.js)
  };
  const storedChoice = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };

  // The sky: ?sky, else the place last chosen here; its hour ?time, else the
  // one nearest the time of day last chosen here (chosenClock).
  let chosenClock = storedChoice(TIME_STORAGE_KEY);
  const placeAndHour = (place, hour) => (place === 'sunrise' ? ['lakeside', 'sunrise'] : [place, hour ?? nearestHour(place, chosenClock)]);
  const [firstPlace, firstHour] = placeAndHour(pageParameters.get('sky') ?? storedChoice(SKY_STORAGE_KEY), pageParameters.get('time'));
  let environment;
  try {
    environment = await createEnvironment(renderer, { name: firstPlace, hour: firstHour, sunAzimuth: SUN_AZIMUTH, sunBalance: new THREE.Vector3(...SUN_BALANCE), lighting });
  } catch (error) {
    onError?.('The sky could not be loaded. Check the connection and reload the page.');
    throw error;
  }
  const sunDirection = lighting.sunDirection;

  const profiling = pageParameters.get('profile') === '1';
  let automaticQuality = !profiling && (quality === 'auto' || !QUALITY[quality]);
  let qualityName = automaticQuality ? 'high' : QUALITY[quality] ? quality : 'medium';
  let settings = QUALITY[qualityName];
  // Parts of the frame the profiler switches off (src/profiler.js); all on otherwise.
  const skip = { floor: false, surface: false, solver: false, ambient: false, fluid: false, mirror: false, cavity: false, halfDensity: false, sleep: false };

  const water = new SpectralWater(renderer, { size: settings.grid, domainSize: 6, centre: [0, -1.0], depth: POND_DEPTH });
  const windParameter = pageParameters.get('wind')?.split(',').map(Number);
  const windDirection = windParameter?.length === 2 && windParameter.every(Number.isFinite) && Math.hypot(...windParameter) > 0 ? windParameter : DEFAULT_WIND;
  const ambientWaves = new AmbientWaves(renderer, { windDirection, depth: POND_DEPTH });
  // The gale's waves (src/galeWaves.js): their uniforms join the ripples'
  // before any material spreads those in; they blow only under a gale, and
  // never in the pool (applyGale).
  const galeWaves = new GaleWaves(renderer, { windDirection, centre: water.centre, sharedWith: ambientWaves, lighting });
  // The water's height at world (x, z) under the gale (its CPU sum), for the stones, the mirror and the eye.
  const galeSample = { height: 0, slopeX: 0, slopeZ: 0 };
  const galeSurfaceAt = (x, z) => galeWaves.sample(x, z, galeSample).height;
  // The rain (src/rain.js): its rings on the water, its streaks and flecks;
  // none until the Weather brings it (applyWeather). The pool's deck wets.
  const rain = new Rain(renderer, lighting, { texels: settings.rainTexels, gale: galeWaves.uniforms() });
  const wetDeck = { value: 0 };
  // The rings that cross the whole pond: the splash hands them its ring
  // sources through the solver it is given (water.rings), and the surface,
  // the floor and the foam specks draw them.
  const rings = new Rings(renderer, { depth: POND_DEPTH });
  rings.setLiveLimit(settings.rings);
  water.rings = rings;
  // The pool (src/pool.js), whose meshes the scenes take below; pooled while
  // the water is the pool's (setPooled). The bed the splash's holes and the
  // rocks rest on is the lake's (src/pondFloor.js), or the pool's floor,
  // whose walls hold the rocks in (holdInPool).
  const pool = createPool(water, lighting, ambientWaves, environment, { rings, haze: environment.hazeUniforms, wet: wetDeck });
  let pooled = false;
  const bedDepthAt = (x, z) => (pooled ? POOL.depth : floorDepthAt(x, z));
  water.floorDepthAt = bedDepthAt;
  const surface = createWaterSurface(water, lighting, ambientWaves, { meshSegments: settings.meshSegments, rings, skyCube: environment.cubeTexture, rain, haze: environment.hazeUniforms, gale: galeWaves });
  const splash = new SplashSystem({ environment, lighting, water, ambientWaves, surface });
  // The wind's strength: the page's ?windStrength, else the last choice here, else calm.
  const storedWind = storedChoice(WIND_STORAGE_KEY);
  const requestedWind = pageParameters.get('windStrength');
  let windName = Object.hasOwn(WIND_STRENGTHS, requestedWind ?? '') ? requestedWind : Object.hasOwn(WIND_STRENGTHS, storedWind ?? '') ? storedWind : DEFAULT_WIND_STRENGTH;
  function applyWind(name) {
    windName = name;
    ambientWaves.setStrength(WIND_STRENGTHS[name]);
    water.setWindStrength(WIND_STRENGTHS[name]);
    rain.setWind(windDirection, RAIN_WIND * WIND_STRENGTHS[name]);
    galeWaves.setFoamVelocity(water.foamUniforms.uFoamVelocity.value);
    applyGale();
  }
  /** The gale's waves, as the wind and the water have them: a pool's basin is too small to raise any. */
  function applyGale() {
    const strength = pooled ? 0 : GALE_STRENGTHS[windName] ?? 0;
    galeWaves.setStrength(strength);
    surface.setGale(strength > 0);
  }
  applyWind(windName);
  // The weather: the page's ?weather, else the last choice here, else clear;
  // applied once the pond is built (applyWeather, after the warm-up).
  const storedWeather = storedChoice(WEATHER_STORAGE_KEY);
  const requestedWeather = pageParameters.get('weather');
  let weatherName = Object.hasOwn(WEATHERS, requestedWeather ?? '') ? requestedWeather : Object.hasOwn(WEATHERS, storedWeather ?? '') ? storedWeather : 'clear';
  // A storm brings its gale, unless the page's ?windStrength says otherwise.
  if (WEATHERS[weatherName].wind && !Object.hasOwn(WIND_STRENGTHS, requestedWind ?? '')) applyWind(WEATHERS[weatherName].wind);
  // The water's clarity: the page's ?water, else the last choice here, else pond.
  const storedWater = storedChoice(WATER_STORAGE_KEY);
  const requestedWater = pageParameters.get('water');
  let waterName = Object.hasOwn(WATER_CLARITIES, requestedWater ?? '') ? requestedWater : Object.hasOwn(WATER_CLARITIES, storedWater ?? '') ? storedWater : DEFAULT_WATER;
  pooled = waterName === 'pool';
  water.setPool(pooled);
  applyGale();
  function applyWater(name) {
    waterName = name;
    lighting.absorb.fromArray(WATER_CLARITIES[name].absorb);
    lighting.extinction.fromArray(WATER_CLARITIES[name].extinction);
    applyWaterColor();
  }
  /** The deep water's radiance: the clarity's, lit by the hour's light (the sky's level, src/sky.js). */
  function applyWaterColor() {
    lighting.waterColor.fromArray(WATER_CLARITIES[waterName].color).multiplyScalar(environment.level);
  }
  applyWater(waterName);
  galeWaves.setBed(floorDepthAt(water.centre[0], water.centre[1]));
  // Its view of the bed takes the absorption, set only now, and the bed's depth and albedo.
  splash.setBed({ depth: bedDepthAt(water.centre[0], water.centre[1]), albedo: pooled ? POOL.tileAlbedo : undefined });
  /** The ground the splash's drops meet: the pool's walls and deck, which they wet (src/splash.js setGround); none in the lake. */
  function applyGround() {
    splash.setGround(pooled ? { square: pool.square, deck: POOL.deck, onWet: (x, z, radius) => pool.wetSpot(x, z, radius) } : null);
  }
  applyGround();

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 60000);
  // The floor's pattern is baked once, a tile laid out on the world (src/pondFloor.js).
  const floor = createPondFloor(water, lighting, ambientWaves, { renderer, rings });
  surface.setBed(floor.material.uniforms);   // the bed its mirror shows from under the water
  const floorPattern = floor.material.uniforms.uPattern.value;   // RGBA8, with its mip chain
  const floorPatternBytes = Math.round(floorPattern.image.width * floorPattern.image.height * 4 * (floorPattern.generateMipmaps ? 4 / 3 : 1));
  // The view: orbit is where the eye stands, facing its pivot; home the frame
  // it sees from there unzoomed (yaw and pitch toward the pivot, and the
  // widest field of view); view the current one, zoomed inside home.
  const requestedView = pageParameters.get('view');
  const viewsNow = () => (pooled ? POOL_VIEWS : VIEWS);
  const orbit = { ...viewsNow()[Object.hasOwn(VIEWS, requestedView ?? '') ? requestedView : 'shore'] };
  // The ground the eye keeps over: the beach, or the pool's deck, eased in
  // over EYE_EDGE inside the pool's edge so the eye never stands at the
  // deck's lip. Under a pool's water it keeps inside the walls too.
  const square = water.poolSquare;
  const poolBox = { minX: square.minX, maxX: square.minX + square.size, minZ: square.minZ, maxZ: square.minZ + square.size };
  const underBox = { minX: poolBox.minX + UNDER_GAP, maxX: poolBox.maxX - UNDER_GAP, minZ: poolBox.minZ + UNDER_GAP, maxZ: poolBox.maxZ - UNDER_GAP };
  const outsidePool = (x, z) => Math.max(Math.abs(x - (square.minX + square.size / 2)), Math.abs(z - (square.minZ + square.size / 2))) - square.size / 2;
  const eyeGroundAt = (x, z) => (pooled ? POOL.deck * THREE.MathUtils.smoothstep(outsidePool(x, z), -EYE_EDGE, 0) : groundHeightAt(x, z));
  // Under a gale the eye keeps GALE_EYE_CLEARANCE clear of the still water
  // too, over and under it, so no crest or trough reaches it.
  const galeClearance = () => (galeWaves.on ? GALE_EYE_CLEARANCE : 0);
  const aboveWater = { lowestAt: (x, z) => LOWEST_EYE + Math.max(eyeGroundAt(x, z), galeClearance()), highestAt: () => Infinity };
  const underWater = { lowestAt: (x, z) => UNDER_GAP - (pooled ? POOL.depth : floorDepthAt(x, z)), highestAt: () => -UNDER_GAP - galeClearance(), get box() { return pooled ? underBox : null; } };
  /** Where an orbit's eye may stand: under the water if its pivot is. */
  const eyeBounds = (target) => (target.pivotY < 0 ? underWater : aboveWater);
  Object.assign(orbit, clampOrbit(orbit, eyeBounds(orbit)));   // the views stand within them, but under a gale
  const home = { ...orbitFacing(orbit), fov: 48 };
  const view = { ...home };
  // The thrower's hand stands beside and below the shore view's eye, wherever the camera is (handPosition).
  const shoreEye = orbitEye(VIEWS.shore);
  const shoreFacing = orbitFacing(VIEWS.shore);
  const shoreFrame = new THREE.Matrix4().compose(
    new THREE.Vector3(shoreEye.x, shoreEye.y, shoreEye.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(shoreFacing.pitch, shoreFacing.yaw, 0, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );

  // The sun's lights for the stones: its irradiance above the water, and
  // below it what crosses the water column (absorbed over the path the
  // floor's sunlight takes, FLOOR_VERTEX). The sky sets both (applySky).
  const sun = new THREE.DirectionalLight(new THREE.Color(), 1.0);
  const sunUnder = new THREE.DirectionalLight(new THREE.Color(), 1.0);
  function applySunLights() {
    sun.position.copy(sunDirection).multiplyScalar(50);
    sun.color.setRGB(lighting.sunIrradiance.x, lighting.sunIrradiance.y, lighting.sunIrradiance.z);
    sunUnder.position.copy(sun.position);
    const sunPath = bedDepthAt(HOME_TARGET[0], HOME_TARGET[2]) / Math.max(sunDirection.y, 0.2);
    sunUnder.color.copy(sun.color).multiply(new THREE.Color(Math.exp(-lighting.absorb.x * sunPath), Math.exp(-lighting.absorb.y * sunPath), Math.exp(-lighting.absorb.z * sunPath)));
  }
  applySunLights();

  const sceneUnder = new THREE.Scene();
  sceneUnder.add(floor, splash.bubblePoints, sunUnder);
  const sceneMain = new THREE.Scene();
  sceneMain.add(environment.sky, surface.inner, surface.outer, splash.cavityGroup, splash.foamSpecks.points, sun, rain.streaks, rain.flecks, galeWaves.spray);
  // MIRROR_LAYER holds what the water mirrors: the sky dome, far shore
  // included, and while a splash lives its crowns, columns and drops. The
  // cavities are not on it: a hole lies below the mirror plane, so the water
  // reflects none of it (its lip stands a centimetre at most above the water).
  environment.sky.layers.enable(MIRROR_LAYER);
  // The beach behind the waterline (src/pondFloor.js), which the water mirrors too.
  const shore = createShore(floor, lighting, environment);
  shore.layers.enable(MIRROR_LAYER);
  sceneMain.add(shore);
  // The pool's basin under the water, its walls and deck in the main scene
  // and the mirror (src/pool.js); shown in place of the lake's while the
  // water is the pool's (showScenery).
  sceneUnder.add(pool.basin);
  sceneMain.add(pool.walls, pool.mirrorWalls, pool.yard, pool.mirrorYard);
  /** The lake's bed, beach and open water, or the pool's basin and deck: the meshes only (setPooled changes the water). */
  function showScenery(asPool) {
    floor.visible = shore.visible = !asPool;
    pool.setVisible(asPool);
    surface.setPool(asPool ? { ...pool.square, depth: POOL.depth, deck: POOL.deck } : null);
  }
  showScenery(pooled);
  sceneMain.environment = environment.envTexture;
  sceneUnder.environment = environment.envTexture;

  // Aim marker: a ring on the water and a faint arc from the hand.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.004;
  marker.visible = false;
  const arcPoints = new Float32Array(25 * 3);
  const arcGeometry = new THREE.BufferGeometry();
  arcGeometry.setAttribute('position', new THREE.BufferAttribute(arcPoints, 3).setUsage(THREE.DynamicDrawUsage));
  const arc = new THREE.Line(arcGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  arc.visible = false;
  arc.frustumCulled = false;
  sceneMain.add(marker, arc);

  // Debug views for development: show the under-water pass, the height
  // field, the foam, the environment cube or the ambient waves' height tile.
  let debugView = 'none';
  const debugPass = new FullscreenPass(`
    uniform sampler2D uTexture; uniform samplerCube uCube; uniform float uMode; varying vec2 vUv;
    void main() {
      if (uMode > 4.5) { gl_FragColor = vec4(vec3(clamp(0.5 + texture2D(uTexture, vUv).r * 0.1, 0.0, 1.0)), 1.0); return; }   // ambient: millimetres
      if (uMode > 3.5) {
        // One cube face (-Z), base mip level, horizon band magnified 4x vertically.
        vec3 dir = vec3((vUv.x - 0.5) * 2.0, (vUv.y - 0.5) * 0.5, -1.0);
        gl_FragColor = vec4(pow(clamp(textureCubeLodEXT(uCube, dir, 0.0).rgb * 0.8, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return;
      }
      if (uMode > 2.5) {
        float lon = (vUv.x - 0.5) * 6.2831853; float lat = (vUv.y - 0.5) * 3.1415926;
        vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
        gl_FragColor = vec4(pow(clamp(textureCube(uCube, dir).rgb * 0.8, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return;
      }
      vec4 t = texture2D(uTexture, vUv);
      if (uMode < 0.5) { gl_FragColor = vec4(pow(clamp(t.rgb * 0.8, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return; }
      if (uMode < 1.5) { float h = t.r * 40.0; gl_FragColor = vec4(0.5 + h, 0.5 + h, 0.5 + h * 0.5 + abs(t.g) * 2.0, 1.0); return; }
      gl_FragColor = vec4(vec3(t.r), 1.0);
    }`, { uTexture: { value: null }, uCube: { value: environment.cubeTexture }, uMode: { value: 0 } });
  let underTarget = null;
  let mainTarget = null;
  let reflectionTarget = null;

  // The mirror image of the sky is rendered whole only when the view changes
  // (a resize, a zoom, a turn or glide of the eye), through a camera
  // reflected in the water plane (the same construction as Three.js's
  // Reflector), then sampled by the water shader through this matrix. While a
  // splash lives, what it lists in mirrorObjects() (its crowns, columns and
  // drops, each with the cheap water material mirrorWith gave it) is drawn
  // into the mirror every frame over the sky: only inside the rectangle its
  // image covers there, joined with the last frame's so that the sky paints
  // over where it was. Each is drawn twice, its colour and then its distance
  // from the mirror camera into the target's alpha (MIRROR_COMMON in
  // src/shaders/fluid.js); the dome and the clear leave alpha at 1, which
  // says "as far as the sky". The water shader looks near objects up by that
  // distance inside the rectangle the splash's image covers (splashRect,
  // handed to the surface each frame). With nothing alive the cached mirror
  // stays untouched: no pass at all. The mirror image has underScale of the
  // canvas's resolution; the rectangle is in its own pixels.
  const mirrorCamera = new THREE.PerspectiveCamera();
  mirrorCamera.layers.set(MIRROR_LAYER);
  const reflectionMatrix = new THREE.Matrix4();
  const reflectionClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0);
  const mirrorNormal = new THREE.Vector3(0, 1, 0);
  const mirrorEye = new THREE.Vector3();
  const mirrorTarget = new THREE.Vector3();
  const mirrorRotation = new THREE.Matrix4();
  const mirrorBox = new THREE.Box3();
  const floaterBox = new THREE.Box3();
  const unmirrored = new THREE.Vector3(Infinity, Infinity, Infinity);   // where a floater not yet in the mirror image was drawn
  const floaterSize = new THREE.Vector3();
  const mirrorCorner = new THREE.Vector3();
  const mirrorShift = new THREE.Vector3();
  const splashRect = new THREE.Vector4();     // this frame's splash image in the reflection target (x, y, width, height; 0 wide: none)
  const mirroredRect = new THREE.Vector4();   // the last frame's
  const mirrorRegion = new THREE.Vector4();
  const nothingMirrored = [];
  let viewChanged = true;      // the mirror image is stale
  // Under a gale the mirror is about the water's height under the latest
  // splash (mirrorLevel, which the water's and the splash's mirror shaders
  // share), so the splash's image stands on the waves where it stands; the
  // sky's and the far shore's hardly move. On still water, 0.
  const mirrorLevel = surface.uniforms.uMirrorLevel;
  let mirrorPlacedAt = 0;      // the level the mirror camera was placed at
  let lastImpact = null;       // { x, z } of the latest stone's entry

  function placeMirrorCamera() {
    camera.updateMatrixWorld();
    const level = mirrorLevel.value;
    mirrorPlacedAt = level;
    reflectionClip.constant = -level;
    mirrorEye.setFromMatrixPosition(camera.matrixWorld);
    mirrorRotation.extractRotation(camera.matrixWorld);
    // Mirrored about y = 0, then raised twice the level: about y = level.
    mirrorTarget.set(0, 0, -1).applyMatrix4(mirrorRotation).add(mirrorEye).negate().reflect(mirrorNormal).negate();
    mirrorTarget.y += 2 * level;
    mirrorCamera.position.copy(mirrorEye).negate().reflect(mirrorNormal).negate();
    mirrorCamera.position.y += 2 * level;
    mirrorCamera.up.set(0, 1, 0).applyMatrix4(mirrorRotation).reflect(mirrorNormal);
    mirrorCamera.lookAt(mirrorTarget);
    mirrorCamera.near = camera.near;
    mirrorCamera.far = camera.far;
    mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    reflectionMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    reflectionMatrix.multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
  }

  /** The mirror image, over `region` of the target (or all of it), with the splash's `objects` in it. */
  function drawMirror(region, objects) {
    if (region) {
      reflectionTarget.scissor.copy(region);
      reflectionTarget.scissorTest = true;
    }
    for (const object of objects) {
      object.userData.passMaterial = object.material;
      object.material = object.userData.mirrorMaterial;
    }
    if (objects.length > 0) splash.setMirrorView(mirrorCamera, reflectionTarget.height);
    renderer.clippingPlanes = [reflectionClip];
    renderer.setRenderTarget(reflectionTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(sceneMain, mirrorCamera);
    if (objects.length > 0) {
      renderer.render(splash.particleScene, mirrorCamera);
      for (const object of objects) object.material = object.userData.mirrorDistanceMaterial;
      renderer.render(splash.particleScene, mirrorCamera);
    }
    renderer.clippingPlanes = [];
    for (const object of objects) object.material = object.userData.passMaterial;
    reflectionTarget.scissorTest = false;
    renderer.setRenderTarget(null);
  }

  /**
   * Where the splash's mirror image falls in the reflection target, and the
   * mirror images of the floaters not where they were last drawn
   * (`floaters`, src/rock.js meshMirror: drawn as they move and once more
   * still, then held in the cached image),
   * into splashRect (0 wide when nowhere).
   */
  function measureSplashImage(objects, floaters = []) {
    splashRect.set(0, 0, 0, 0);
    if (objects.length === 0 && floaters.length === 0) return;
    if (objects.length > 0) splash.mirrorBounds(mirrorBox);
    else mirrorBox.makeEmpty();
    // The splash is reckoned on still water and drawn lifted with the waves (galeLift): its image is about as much higher.
    if (!mirrorBox.isEmpty() && mirrorLevel.value !== 0) { mirrorBox.translate(mirrorShift.set(0, mirrorLevel.value, 0)); mirrorBox.expandByScalar(GALE_MIRROR_MARGIN); }
    // A floater's image, where it is drawn (lifted already), a little wider than it for its last frame's place.
    for (const rock of floaters) mirrorBox.union(floaterBox.setFromCenterAndSize(rock.meshMirror.position, floaterSize.setScalar(3 * rock.radius)));
    if (mirrorBox.isEmpty() || mirrorBox.max.y <= mirrorLevel.value) return;   // only what stands above the water is mirrored
    mirrorBox.min.y = Math.max(mirrorBox.min.y, mirrorLevel.value);
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (let corner = 0; corner < 8; corner++) {
      mirrorCorner.set(corner & 1 ? mirrorBox.max.x : mirrorBox.min.x, corner & 2 ? mirrorBox.max.y : mirrorBox.min.y, corner & 4 ? mirrorBox.max.z : mirrorBox.min.z);
      mirrorCorner.applyMatrix4(mirrorCamera.matrixWorldInverse);
      if (mirrorCorner.z > -mirrorCamera.near) { left = -1; right = 1; bottom = -1; top = 1; break; }   // reaches behind the camera: all of it
      mirrorCorner.applyMatrix4(mirrorCamera.projectionMatrix);
      left = Math.min(left, mirrorCorner.x); right = Math.max(right, mirrorCorner.x);
      bottom = Math.min(bottom, mirrorCorner.y); top = Math.max(top, mirrorCorner.y);
    }
    const width = reflectionTarget.width;
    const height = reflectionTarget.height;
    const x0 = THREE.MathUtils.clamp(Math.floor((left * 0.5 + 0.5) * width) - 2, 0, width);
    const x1 = THREE.MathUtils.clamp(Math.ceil((right * 0.5 + 0.5) * width) + 2, 0, width);
    const y0 = THREE.MathUtils.clamp(Math.floor((bottom * 0.5 + 0.5) * height) - 2, 0, height);
    const y1 = THREE.MathUtils.clamp(Math.ceil((top * 0.5 + 0.5) * height) + 2, 0, height);
    if (x1 > x0 && y1 > y0) splashRect.set(x0, y0, x1 - x0, y1 - y0);
  }

  function updateReflection() {
    const objects = skip.fluid || skip.mirror ? nothingMirrored : splash.mirrorObjects();
    // A floater whose image is not where it now is (moving, or come to rest since it was last drawn).
    const floaters = skip.mirror ? nothingMirrored : rocks.filter((rock) => rock.meshMirror?.visible && !rock.meshMirror.position.equals(rock.mirroredAt ?? unmirrored));
    mirrorLevel.value = galeWaves.on && lastImpact && objects.length > 0 ? galeSurfaceAt(lastImpact.x, lastImpact.z) : 0;
    if (Math.abs(mirrorLevel.value - mirrorPlacedAt) > 1e-4 && !viewChanged) placeMirrorCamera();   // the splash's region is drawn again below
    if (viewChanged) {
      placeMirrorCamera();
      drawMirror(null, objects);
      viewChanged = false;
      measureSplashImage(objects, floaters);
      mirroredRect.copy(splashRect);
      for (const rock of rocks) if (rock.meshMirror) rock.mirroredAt = rock.meshMirror.visible ? rock.meshMirror.position.clone() : null;
      return;
    }
    if (objects.length === 0 && floaters.length === 0 && mirroredRect.z === 0) return;   // still water: the cached mirror stands
    measureSplashImage(objects, floaters);
    if (splashRect.z === 0) mirrorRegion.copy(mirroredRect);
    else if (mirroredRect.z === 0) mirrorRegion.copy(splashRect);
    else {
      const x0 = Math.min(splashRect.x, mirroredRect.x);
      const y0 = Math.min(splashRect.y, mirroredRect.y);
      mirrorRegion.set(x0, y0, Math.max(splashRect.x + splashRect.z, mirroredRect.x + mirroredRect.z) - x0, Math.max(splashRect.y + splashRect.w, mirroredRect.y + mirroredRect.w) - y0);
    }
    if (mirrorRegion.z > 0) drawMirror(mirrorRegion, objects);
    for (const rock of floaters) rock.mirroredAt = rock.meshMirror.position.clone();
    mirroredRect.copy(splashRect);
  }
  const resolution = new THREE.Vector2();
  let dpr = 1;

  // ---- the view ----------------------------------------------------------
  const viewEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  let viewFromApi = false;     // set by setFov / lookAt, which may leave the home frame
  let reportedView;            // what onViewChange last reported: { atHome, view }
  let lastActivity = 0;        // performance.now() of the last input, view change or motion (IDLE)
  let glide = null;            // { from, to, name, fromFov, fromTurn, started }: the eye on its way to another orbit

  // The sky (setSky): a load replaces the dome and the environment maps and
  // fills lighting's sun and sky in place (src/sky.js); then what holds the
  // sun by value follows, and the mirror image is drawn again.
  let skyRequest = { place: environment.name, hour: environment.hour };   // the sky last asked for
  let skyLoading = Promise.resolve();    // the loads queued so far
  /**
   * Queue a load of the place at the hour (resolveHour's); only the last
   * asked for is loaded. Resolves when it is shown, or failed.
   */
  function requestSky(place, hour) {
    const request = { place, hour: resolveHour(place, hour) };
    skyRequest = request;
    skyLoading = skyLoading.then(async () => {
      if (skyRequest !== request || (environment.name === request.place && environment.hour === request.hour)) return;
      await environment.load(request.place, request.hour);
      applySky();
    }).catch((error) => console.error(error));
    return skyLoading.then(() => environment.name);
  }
  /**
   * The weather by name (WEATHERS): the sky's cloud and haze at once, the
   * deck's wet, and the rain, which falls once its ring's table has come.
   */
  function applyWeather(name) {
    weatherName = name;
    const weather = WEATHERS[name];
    environment.setWeather(weather);
    if (!weather.lightning) environment.setFlash(1);
    wetDeck.value = weather.wet;
    applySky();
    return rain.setIntensity(weather.rain).catch((error) => console.error(error));
  }

  // Lightning in a storm (src/lightning.js), each frame: the sky's light and
  // a bolt on the dome; the mirror image is drawn again while it flashes.
  const lightning = { flash: 1, bolt: { bearing: 0, top: 0, brightness: 0, seed: 0 } };
  let flashing = false;
  function updateLightning(time) {
    if (!WEATHERS[weatherName].lightning) return;
    lightningAt(time, lightning);
    const lit = lightning.flash > 1.001 || lightning.bolt.brightness > 0;
    if (lit || flashing) {
      environment.setFlash(lightning.flash, lightning.bolt);
      viewChanged = true;   // the mirror holds the sky: drawn again, and once more as the flash ends
    }
    flashing = lit;
  }

  // Where the eye looks at the water (world XZ): where its line of sight
  // crosses the surface, at most FOCUS_REACH off, or under the eye when it
  // looks away from the surface. The rain's flecks are laid about it.
  const FOCUS_REACH = 30;
  const focusDirection = new THREE.Vector3();
  function viewFocus() {
    camera.getWorldDirection(focusDirection);
    const along = Math.abs(focusDirection.y) > 1e-3 ? -camera.position.y / focusDirection.y : -1;
    const reach = along > 0 ? Math.min(along, FOCUS_REACH) : 0;
    return [camera.position.x + focusDirection.x * reach, camera.position.z + focusDirection.z * reach];
  }

  function applySky() {
    applyWaterColor();
    applySunLights();
    splash.updateLighting();
    viewChanged = true;
    lastActivity = performance.now();
  }

  /** The VIEWS (POOL_VIEWS in the pool) entry the eye stands at, or null. */
  function viewName(views = viewsNow()) {
    return Object.keys(views).find((name) => orbitsMatch(orbit, views[name])) ?? null;
  }

  /** Stand the camera on the orbit and point it as `view` says; the mirror image follows at the next frame. */
  function applyView() {
    const eye = orbitEye(orbit);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.fov = view.fov;
    camera.quaternion.setFromEuler(viewEuler.set(view.pitch, view.yaw, 0, 'YXZ'));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // The rings retire once this view's pixels can no longer show them
    // (src/rings.js), the nearest water being the shore frame's; anywhere
    // else they live as long as their slope shows (no camera), so none
    // retires that a view the eye goes on to would show.
    const atShore = orbitsMatch(orbit, viewsNow().shore);
    if (atShore) {
      const homeBelow = -home.pitch + THREE.MathUtils.degToRad(home.fov) / 2;
      rings.setCamera({
        x: camera.position.x, z: camera.position.z, height: camera.position.y,
        pixelsPerRadian: 0.5 * resolution.y / Math.tan(THREE.MathUtils.degToRad(view.fov) / 2),
        nearest: camera.position.y / Math.tan(Math.min(homeBelow, 1.5)),
      });
    } else {
      rings.setCamera(null);
    }
    splash.updateViewUniforms(camera, resolution.y, dpr, underTarget.height);
    viewChanged = true;
    lastActivity = performance.now();
    // While it glides, the view is the one it goes to.
    const report = { atHome: !glide && atShore && !isZoomed(view, home), view: glide ? glide.name : viewName() };
    if (report.atHome !== reportedView?.atHome || report.view !== reportedView?.view) { reportedView = report; onViewChange?.({ ...report }); }
  }

  function setView(next, fromApi = false) {
    view.yaw = next.yaw;
    view.pitch = next.pitch;
    view.fov = next.fov;
    viewFromApi = fromApi;
    applyView();
  }

  /** The orbit becomes `next`, every field of it: no reach (src/viewOrbit.js) is left from before. */
  function placeOrbit(next) {
    delete orbit.reach;
    Object.assign(orbit, next);
  }

  /** Stand the eye on another orbit, at once; a zoomed view turns with its frame and stays inside it. */
  function moveEye(next) {
    const turnedYaw = view.yaw - home.yaw;
    const turnedPitch = view.pitch - home.pitch;
    placeOrbit(clampOrbit(next, eyeBounds(next)));
    Object.assign(home, orbitFacing(orbit));
    view.yaw = home.yaw + turnedYaw;
    view.pitch = home.pitch + turnedPitch;
    if (isZoomed(view, home)) Object.assign(view, clampToFrame(view, home, camera.aspect));
    viewFromApi = false;
    applyView();
  }

  /**
   * Before a drag turns a zoomed view: the pivot moves to what the view
   * looks at (the water under its centre, if within three times the pivot's
   * distance, else a point as far off as the pivot was), the eye staying
   * where it is, so the view is its new frame's centre and turns round it.
   */
  function pivotOnView() {
    if (!isZoomed(view, home)) return;
    const centre = directionAt(view, camera.aspect, 0, 0);
    const toWater = centre.y < 0 ? camera.position.y / -centre.y : Infinity;
    const reach = toWater <= 3 * orbit.distance ? toWater : orbit.distance;
    const pivot = { x: camera.position.x + centre.x * reach, y: camera.position.y + centre.y * reach, z: camera.position.z + centre.z * reach };
    placeOrbit(orbitAbout(camera.position, pivot));
    Object.assign(home, orbitFacing(orbit));
    view.yaw = home.yaw;
    view.pitch = home.pitch;
    viewFromApi = false;
  }

  /** The widest field of view (degrees) of the frame from an orbit: 48° landscape, 62° portrait, wider under the water. */
  function frameFov(target = orbit) {
    return (canvas.clientWidth >= canvas.clientHeight ? 48 : 62) * (target.pivotY < 0 ? UNDER_FOV : 1);
  }

  /** Glide the eye to an orbit (one of VIEWS, by `name`) over GLIDE_SECONDS, the zoom easing out on the way. */
  function glideTo(target, name = null) {
    glide = { from: { ...orbit }, to: target, name, fromFov: view.fov, fromFrameFov: home.fov, fromTurn: { yaw: view.yaw - home.yaw, pitch: view.pitch - home.pitch }, started: performance.now() };
    stepGlide(glide.started);
  }

  /**
   * The orbit `eased` (0 to 1) of the way from one orbit to another. A glide
   * that crosses the surface keeps to no side's bounds on the way; in the
   * pool, it goes in (or out) over the water, never through the deck.
   */
  function glideOrbit(from, target, eased) {
    if (eased >= 1) return clampOrbit(target, eyeBounds(target));
    const sameSide = (from.pivotY < 0) === (target.pivotY < 0);
    const next = blendOrbits(from, target, eased, sameSide ? eyeBounds(target) : null);
    return !sameSide && pooled && orbitEye(next).y < POOL.deck + LOWEST_EYE ? keepInside(next, poolBox) : next;
  }

  /** The glide at time `now` (performance.now()); at its end the eye stands exactly on its orbit. */
  function stepGlide(now) {
    if (!glide) return;
    const progress = Math.min((now - glide.started) / (1000 * GLIDE_SECONDS), 1);
    const eased = progress * progress * (3 - 2 * progress);
    const target = glide.to;
    placeOrbit(glideOrbit(glide.from, target, eased));
    Object.assign(home, orbitFacing(orbit));
    home.fov = glide.fromFrameFov + (frameFov(target) - glide.fromFrameFov) * eased;
    view.yaw = home.yaw + glide.fromTurn.yaw * (1 - eased);
    view.pitch = home.pitch + glide.fromTurn.pitch * (1 - eased);
    view.fov = glide.fromFov + (home.fov - glide.fromFov) * eased;
    Object.assign(view, clampToFrame(view, home, camera.aspect));
    viewFromApi = false;
    if (progress >= 1) glide = null;
    applyView();
  }

  /** One of VIEWS by name: glided to, or (glide false) stood at at once. */
  function showView(name, { glide: gliding = true } = {}) {
    if (!Object.hasOwn(VIEWS, name)) return;
    if (gliding) { glideTo(viewsNow()[name], name); return; }
    glide = null;
    placeOrbit(clampOrbit(viewsNow()[name], eyeBounds(viewsNow()[name])));
    Object.assign(home, orbitFacing(orbit), { fov: frameFov() });
    setView(home);
  }

  function resetView() { showView('shore'); }

  function toDeviceCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: -((clientY - rect.top) / rect.height) * 2 + 1 };
  }

  /** Zoom to a field of view, keeping what is under the client point there (zooming out also heads home). */
  function zoomAt(clientX, clientY, fov) {
    const point = toDeviceCoordinates(clientX, clientY);
    const target = THREE.MathUtils.clamp(fov, MIN_FOV, home.fov);
    let next = zoomToward(view, home, camera.aspect, point.x, point.y, target);
    if (fov > view.fov) next = clampToFrame(next, home, camera.aspect);
    if (isZoomed(next, view)) setView(next);   // otherwise nothing moved: at a limit
  }

  /** Width and height of `fraction` of the canvas's resolution, at least one pixel. */
  const scaledSize = (fraction) => [Math.max(1, Math.round(resolution.x * fraction)), Math.max(1, Math.round(resolution.y * fraction))];

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    // The preset's cap and the pixel budget, whichever is lower.
    dpr = Math.min(window.devicePixelRatio || 1, settings.maxDpr, Math.sqrt(PIXEL_BUDGET / (width * height))) * (skip.halfDensity ? 0.5 : 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(resolution);
    const zoomed = isZoomed(view, home);
    camera.aspect = width / height;
    home.fov = frameFov();
    // A view set through the API stays as it is; the user's zoom stays inside the new home frame.
    if (!zoomed) Object.assign(view, home);
    else if (!viewFromApi) Object.assign(view, clampToFrame({ ...view, fov: Math.min(view.fov, home.fov) }, home, camera.aspect));
    underTarget?.dispose();
    mainTarget?.dispose();
    reflectionTarget?.dispose();
    const [underWidth, underHeight] = scaledSize(settings.underScale);
    underTarget = createFloatTarget(underWidth, underHeight, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true, depthTexture: true });
    mainTarget = createFloatTarget(resolution.x, resolution.y, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true, depthTexture: true });
    reflectionTarget = createFloatTarget(underWidth, underHeight, { type: THREE.HalfFloatType, filter: THREE.LinearFilter, depth: true });
    splash.resize(resolution.x, resolution.y, settings.fluidScale);
    applyView();
  }
  resize();
  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);

  // ---- stones and throwing ---------------------------------------------
  const rocks = [];
  // The traced paths (the header), for testing: each stone's path (yellow)
  // until it goes in, its track on the water under it (white), a red cross
  // where it touches the water and a line down to the water from the top of
  // each arc (white), drawn over everything and kept until the stone retires.
  let tracing = pageParameters.get('trace') === '1';
  const traces = new Map();   // rock -> { path, track, marks, count, markCount, rising }
  const traceMaterial = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, opacity, depthTest: false, depthWrite: false, transparent: true });
  const traceMaterials = { path: traceMaterial(0xffd34d), track: traceMaterial(0xffffff, 0.55), touch: traceMaterial(0xff5a4d) };
  function traceLine(vertices, material, Kind) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const line = new Kind(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = 10;
    sceneMain.add(line);
    return line;
  }
  function traceSegment(trace, line, x0, y0, z0, x1, y1, z1) {
    const vertices = line.geometry.attributes.position;
    const at = trace.marks.get(line) ?? 0;
    if (at + 2 > vertices.count) return;
    vertices.setXYZ(at, x0, y0, z0);
    vertices.setXYZ(at + 1, x1, y1, z1);
    vertices.needsUpdate = true;
    trace.marks.set(line, at + 2);
    line.geometry.setDrawRange(0, at + 2);
  }
  /** Trace where `rock` is now; `touch` (a skip's touch or the impact) marks where it met the water. */
  function traceRock(rock, touch = null) {
    let trace = traces.get(rock);
    if (!trace) {
      trace = {
        path: traceLine(TRACE.points, traceMaterials.path, THREE.Line), track: traceLine(TRACE.points, traceMaterials.track, THREE.Line),
        tops: traceLine(TRACE.marks * 2, traceMaterials.track, THREE.LineSegments), touches: traceLine(TRACE.marks * 4, traceMaterials.touch, THREE.LineSegments),
        marks: new Map(), count: 0, rising: rock.velocity.y > 0,
      };
      traces.set(rock, trace);
    }
    const { x, y, z } = rock.position;
    // The top of an arc: a line down to the water.
    if (rock.state === 'air') {
      if (trace.rising && rock.velocity.y <= 0) traceSegment(trace, trace.tops, x, y, z, x, 0, z);
      trace.rising = rock.velocity.y > 0;
    }
    if (touch) {
      const size = TRACE.cross;
      traceSegment(trace, trace.touches, touch.x - size, 0, touch.z - size, touch.x + size, 0, touch.z + size);
      traceSegment(trace, trace.touches, touch.x - size, 0, touch.z + size, touch.x + size, 0, touch.z - size);
    }
    const points = trace.path.geometry.attributes.position;
    const last = trace.count - 1;
    if (trace.count >= TRACE.points) return;
    if (trace.count > 0 && Math.hypot(x - points.getX(last), y - points.getY(last), z - points.getZ(last)) < TRACE.step) return;
    points.setXYZ(trace.count, x, y, z);
    trace.track.geometry.attributes.position.setXYZ(trace.count, x, 0, z);
    trace.count++;
    for (const line of [trace.path, trace.track]) {
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.setDrawRange(0, trace.count);
    }
  }
  function untrace(rock) {
    const trace = traces.get(rock);
    if (!trace) return;
    for (const line of [trace.path, trace.track, trace.tops, trace.touches]) {
      sceneMain.remove(line);
      line.geometry.dispose();
    }
    traces.delete(rock);
  }
  /** Tracing on or off (the header; ?trace=1, the T key, setTrace): off takes the lines away. */
  function setTracing(on) {
    tracing = Boolean(on);
    if (!tracing) for (const rock of [...traces.keys()]) untrace(rock);
  }
  let stoneRadius = 0.03;
  let power = 'normal';
  let skipping = false;   // Skip: taps throw skips (skipThrow)
  // What is thrown (the Object setting, src/things.js): the page's ?thing, else the last choice here, else a river stone;
  // and each kind's slider value (a stone's size is stoneRadius).
  const storedThing = storedChoice(THING_STORAGE_KEY);
  const requestedThing = pageParameters.get('thing');
  let thingName = Object.hasOwn(THINGS, requestedThing ?? '') ? requestedThing : Object.hasOwn(THINGS, storedThing ?? '') ? storedThing : DEFAULT_THING;
  const thingShapes = new Map();   // each kind's shape, from one made (a fluttering thing's aim flies it)
  const thingSizes = Object.fromEntries(Object.entries(THINGS).map(([name, thing]) => [name, thing.slider?.initial ?? null]));
  let timeScale = 1;
  let simulationTime = 0;

  // The hand, beside and below the shore view's eye (shoreFrame), wherever
  // the camera stands. A rock over 16 cm across leaves it lower and farther
  // out, by its size beyond that, so that from the shore it rises into the
  // view from below its edge rather than filling the corner of it.
  function handPosition(radius = measureThing(thingName).radius) {
    const beyond = Math.max(radius - 0.08, 0);
    return new THREE.Vector3(0.30, -0.32 - 1.6 * beyond, -0.55 - 1.2 * beyond).applyMatrix4(shoreFrame);
  }

  function throwVelocity(hand, target, powerName = power) {
    const distance = hand.distanceTo(target);
    const flightTime = THREE.MathUtils.clamp(0.42 + 0.11 * distance, 0.5, 1.0) * POWER[powerName];
    const velocity = target.clone().sub(hand).divideScalar(flightTime);
    velocity.y += 0.5 * 9.81 * flightTime;
    return { velocity, flightTime };
  }

  /**
   * A skip throw (the header): from the hand let down to
   * SKIP_THROW.handHeight, at the strength's speed (skipSpeed), aimed by
   * aimSkip at the target, on open water (SKIP_THROW.shallowest deep, or in
   * the pool less throwMargin()), falling back on the target brought onto
   * the water (keepOnWater). With the hand, the velocity, the flight time
   * and where it comes down, for the aim.
   */
  function skipThrow(hand, target, radius, powerName = power) {
    const from = hand.clone();
    from.y = Math.min(from.y, SKIP_THROW.handHeight);
    const margin = throwMargin();
    const onWater = pooled ? poolInside(pool.square, margin) : (x, z) => bedDepthAt(x, z) >= SKIP_THROW.shallowest;
    return { hand: from, ...aimSkip(from, target, skipSpeed(powerName, radius, pooled), onWater, keepOnWater(target.clone(), margin)) };
  }

  /**
   * A thrown thing's velocity (the header), for what measureThing says it
   * is: a river stone's as throwVelocity says, as it always was; anything
   * else's as src/rock.js aimThrow finds it, no faster than it can be thrown
   * and aimed for the air's drag. With the flight time and, but for a river
   * stone, its path and where it comes down.
   */
  function thingVelocity(hand, target, powerName, measured, flight = null) {
    const { velocity, flightTime } = throwVelocity(hand, target, powerName);
    if (measured.thing.key === DEFAULT_THING) return { velocity, flightTime, path: null, landing: target };
    return aimThrow(hand, target, flightTime, measured, flight);
  }

  /** What is thrown (`name`, else the Object setting's): its kind, its radius and mass at its slider's value `size` (a stone's radius `radius`). */
  function measureThing(name, size, radius) {
    const thing = THINGS[name];
    if (thing.byDiameter) {
      const nominal = radius ?? stoneRadius;
      return { thing, radius: nominal, mass: thing.measure(200 * nominal).mass, size: null };
    }
    const value = size ?? thingSizes[name] ?? thing.slider?.initial;
    return { thing, ...thing.measure(value), size: value };
  }

  function throwAt(x, z, options = {}) {
    const name = Object.hasOwn(THINGS, options.thing ?? '') ? options.thing : thingName;
    const { thing, radius, mass, size } = measureThing(name, options.size, options.radius);
    // Skip skips what skips (src/things.js abilities: a stone of any kind); anything else is thrown as ever.
    const skips = (options.skip ?? skipping) && thing.skips;
    const target = new THREE.Vector3(x, 0, z);
    const skipped = skips ? skipThrow(handPosition(radius), target, radius, options.power ?? power) : null;
    const hand = skipped?.hand ?? handPosition(radius);
    // Made first, so a thing that flutters is aimed by its own flight (src/rock.js trialFlight).
    const rock = new Rock({ radius, position: hand, velocity: new THREE.Vector3(), envTexture: environment.envTexture, waterFog: { extinction: lighting.extinction, color: lighting.waterColor }, thing: name, mass, mirrorLayer: MIRROR_LAYER, skip: skips, water: surface.rideUniforms });
    thingShapes.set(name, rock.shape);
    const { velocity } = skipped ?? thingVelocity(hand, target, options.power ?? power, { thing, radius, mass, size }, rock.trialFlight());
    rock.velocity.copy(velocity);
    if (skips) {
      rock.launchSkip(velocity);
      // In the pool it touches and skims only inside the walls, less its radius (src/pool.js holds it off them).
      if (pooled) rock.skip.inside = poolInside(pool.square, radius);
    }
    // In the pool the deck is ground (src/pool.js poolGround).
    if (pooled) rock.groundAt = poolGround(pool.square);
    rocks.push(rock);
    sceneMain.add(rock.meshAbove);
    sceneUnder.add(rock.meshBelow);
    if (rock.meshMirror) sceneMain.add(rock.meshMirror);
    // The oldest out of sight goes first; one in sight only when there are too many of those (keptInSight).
    for (const [kept, most] of [[false, MAX_ROCKS], [true, MAX_IN_SIGHT]]) {
      const among = rocks.filter((candidate) => keptInSight(candidate) === kept);
      for (let index = 0; among.length - index > most; index++) retireRock(among[index]);
    }
    lastActivity = performance.now();
    return rock;
  }

  /** A frame from an orbit, unzoomed (the warm-up's view from below), the view put back after. */
  function renderFrom(target) {
    const keptOrbit = { ...orbit }, keptHome = { ...home }, keptView = { ...view };
    placeOrbit(target);
    Object.assign(home, orbitFacing(orbit), { fov: frameFov() });
    Object.assign(view, { yaw: home.yaw, pitch: home.pitch, fov: home.fov });
    applyView();
    render();
    placeOrbit(keptOrbit);
    Object.assign(home, keptHome);
    Object.assign(view, keptView);
    applyView();
  }

  /** Whether a thing is kept in sight (the header): a floater, or at rest on the deck (or on its way there). */
  function keptInSight(rock) { return rock.floats || rock.onGround || rock.state === 'ground'; }

  /** Take a stone out of the scenes; keepMaterials frees only its geometry (warmUp keeps a stone's materials, so their program stays compiled). */
  function retireRock(rock, { keepMaterials = false } = {}) {
    untrace(rock);
    sceneMain.remove(rock.meshAbove);
    sceneUnder.remove(rock.meshBelow);
    if (rock.meshMirror) {
      if (rock.meshMirror.visible) viewChanged = true;   // the mirror image is drawn again without it
      sceneMain.remove(rock.meshMirror);
    }
    if (keepMaterials) rock.geometry.dispose();
    else rock.dispose();
    rocks.splice(rocks.indexOf(rock), 1);
  }

  function throwRandom() {
    const point = keepOnWater({ x: THREE.MathUtils.randFloatSpread(1.8), z: -0.3 - Math.random() * 2.2 }, throwMargin());
    return throwAt(point.x, point.z);
  }

  // Pointer aiming: pick the water plane under the pointer, kept inside the
  // solver's patch (or the pool) less throwMargin(). A pointer on the sky
  // aims as far as the water reaches in its direction.
  const raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const throwMargin = () => Math.max(pooled ? POOL_MARGIN : POND_MARGIN, MARGIN_RADII * measureThing(thingName).radius);
  /** The point ({ x, z }, changed in place) brought inside the solver's patch, or the pool's walls, less `margin`. */
  function keepOnWater(point, margin) {
    const bounds = pooled ? pool.square : { minX: water.domainMin[0], minZ: water.domainMin[1], size: water.domainSize };
    point.x = THREE.MathUtils.clamp(point.x, bounds.minX + margin, bounds.minX + bounds.size - margin);
    point.z = THREE.MathUtils.clamp(point.z, bounds.minZ + margin, bounds.minZ + bounds.size - margin);
    return point;
  }
  /** The water under the pointer, brought onto the water less `margin` (keepOnWater) unless `keep` is false. */
  function aimPoint(clientX, clientY, margin = throwMargin(), keep = true) {
    const point = toDeviceCoordinates(clientX, clientY);
    pointer.set(point.x, point.y);
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (camera.position.y < 0 && raycaster.ray.direction.y < 0) {
      // From under the water, a ray down: at the water over where it meets the bed.
      const { origin, direction } = raycaster.ray;
      let along = 0;
      while (along < 40 && origin.y + direction.y * along > -bedDepthAt(origin.x + direction.x * along, origin.z + direction.z * along)) along += 0.05;
      hit.set(origin.x + direction.x * along, 0, origin.z + direction.z * along);
    } else if (!raycaster.ray.intersectPlane(waterPlane, hit)) {
      const horizontal = Math.hypot(raycaster.ray.direction.x, raycaster.ray.direction.z);
      if (horizontal < 1e-6) return null;
      hit.set(camera.position.x + (raycaster.ray.direction.x / horizontal) * 100, 0, camera.position.z + (raycaster.ray.direction.z / horizontal) * 100);
    }
    return keep ? keepOnWater(hit, margin) : hit;
  }
  /** Where a tap aims a throw: a skip keeps the tap's direction (skipThrow brings its touch onto the water). */
  const throwAim = (clientX, clientY) => aimPoint(clientX, clientY, throwMargin(), !skipping);

  function showAim(hit) {
    if (!hit) { marker.visible = false; arc.visible = false; return; }
    marker.visible = true;
    marker.scale.setScalar(1);
    const measured = measureThing(thingName);
    const skipped = skipping && measured.thing.skips ? skipThrow(handPosition(measured.radius), hit, measured.radius) : null;
    const hand = skipped?.hand ?? handPosition(measured.radius);
    // A fluttering thing's arc is its flight's (src/rock.js flutterTrial), once one of its kind has been made (the warm-up makes a pizza).
    const shape = thingShapes.get(thingName);
    const flight = measured.thing.air.model === 'flutter' && shape ? flutterTrial({ thing: measured.thing, shape, radius: measured.radius, density: measured.mass / (shape.volume * measured.radius ** 3), ownMass: measured.mass }) : null;
    const thrown = skipped ?? thingVelocity(hand, hit, power, measured, flight);
    const { velocity, flightTime } = thrown;
    // Where it comes down: a skip's first touch; anything else's flown path's end (the air's drag, the fastest it can be thrown).
    const path = skipped ? null : thrown.path;
    const landing = skipped?.touch ?? (path ? thrown.landing : hit);
    marker.position.set(landing.x, 0.004 + (galeWaves.on ? galeSurfaceAt(landing.x, landing.z) : 0), landing.z);
    for (let i = 0; i < 25; i++) {
      const t = flightTime * i / 24;
      if (path) { arcPoints.set(path[Math.round((i / 24) * (path.length - 1))].toArray(), i * 3); continue; }
      arcPoints[i * 3] = hand.x + velocity.x * t;
      arcPoints[i * 3 + 1] = hand.y + velocity.y * t - 0.5 * 9.81 * t * t;
      arcPoints[i * 3 + 2] = hand.z + velocity.z * t;
    }
    arcGeometry.attributes.position.needsUpdate = true;
    arc.visible = true;
  }

  // A press that lifts where it went down throws; one that moves TAP_SLOP
  // pixels turns the view instead, for as long as it lasts. A second finger
  // turns the gesture into a pinch, which never throws, even when one finger
  // lifts first.
  const activePointers = new Map();   // pointerId -> { x, y } in client pixels
  let pressStart = null;              // { id, x, y } of the press that may throw
  let turning = null;                 // { x, y }: the press is turning the view, last seen here
  let pinch = null;                   // { distance, fov, direction } when the pinch began
  let thrownFrom = null;              // { x, y }: a mouse threw here; its aim stays hidden until it moves on (its arc would hang in the splash)
  const finger = new FingerInWater(water);
  let holdTimer = 0;                  // the press's timeout to dip the finger, 0 when none
  let touching = null;                // { id }: the press whose finger is in the water

  /** The finger's small ring on the water where it is (or none). */
  function showFinger(point) {
    arc.visible = false;
    marker.visible = Boolean(point);
    if (point) { marker.scale.setScalar(0.45); marker.position.set(point.x, 0.004 + (galeWaves.on ? galeSurfaceAt(point.x, point.z) : 0), point.z); }
  }

  /** Dip the finger in under the client point, if it is over the water. */
  function startTouch(pointerId, clientX, clientY) {
    const point = aimPoint(clientX, clientY, FINGER.margin);
    if (!point) return;
    touching = { id: pointerId };
    finger.dip(point.x, point.z);
    showFinger(point);
    lastActivity = performance.now();
  }

  function endTouch() {
    if (!touching) return;
    finger.lift();
    touching = null;
    showFinger(null);
  }

  function cancelHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
  }

  function pinchSpan() {
    const [first, second] = activePointers.values();
    return { x: 0.5 * (first.x + second.x), y: 0.5 * (first.y + second.y), distance: Math.max(Math.hypot(first.x - second.x, first.y - second.y), 1) };
  }

  function startPinch() {
    const span = pinchSpan();
    const point = toDeviceCoordinates(span.x, span.y);
    pinch = { distance: span.distance, fov: view.fov, direction: directionAt(view, camera.aspect, point.x, point.y) };
  }

  function movePinch() {
    const span = pinchSpan();
    const point = toDeviceCoordinates(span.x, span.y);
    const fov = THREE.MathUtils.clamp((pinch.fov * pinch.distance) / span.distance, MIN_FOV, home.fov);
    const placed = placeDirection(pinch.direction, point.x, point.y, fov, camera.aspect);
    setView(clampToFrame({ yaw: placed.yaw, pitch: placed.pitch, fov }, home, camera.aspect));
  }

  function stopTurning() {
    turning = null;
    canvas.style.removeProperty('cursor');
  }

  function releasePointer(event) {
    activePointers.delete(event.pointerId);
    if (pinch && activePointers.size < 2) pinch = null;
    if (pressStart?.id === event.pointerId) { pressStart = null; stopTurning(); cancelHold(); }
    if (touching?.id === event.pointerId) endTouch();
  }

  canvas.addEventListener('pointerdown', (event) => {
    lastActivity = performance.now();
    glide = null;   // the hand takes the view from a glide where it stands
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { canvas.setPointerCapture(event.pointerId); } catch { /* a synthetic or already released pointer */ }
    if (activePointers.size === 1) {
      pressStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      showAim(throwAim(event.clientX, event.clientY));
      // Held still, the press dips a finger in where it is then.
      const pointerId = event.pointerId;
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = 0;
        const held = activePointers.get(pointerId);
        if (pressStart?.id === pointerId && !turning && !pinch && held) startTouch(pointerId, held.x, held.y);
      }, HOLD_MS);
    } else if (activePointers.size === 2) {
      pressStart = null;
      stopTurning();
      cancelHold();
      endTouch();
      showAim(null);
      startPinch();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    lastActivity = performance.now();
    const tracked = activePointers.get(event.pointerId);
    if (tracked) { tracked.x = event.clientX; tracked.y = event.clientY; }
    if (pinch) { if (tracked) movePinch(); return; }
    if (touching?.id === event.pointerId) {
      const point = aimPoint(event.clientX, event.clientY, FINGER.margin);
      if (point) { finger.moveTo(point.x, point.z); showFinger(point); }
      return;
    }
    if (pressStart?.id === event.pointerId) {
      if (!turning && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) >= TAP_SLOP) {
        cancelHold();
        turning = { x: pressStart.x, y: pressStart.y };
        canvas.style.cursor = 'grabbing';
        pivotOnView();
        showAim(null);
      }
      if (turning) {
        moveEye(turnOrbit(orbit, event.clientX - turning.x, event.clientY - turning.y, ORBIT_TURN / Math.max(canvas.clientHeight, 1), eyeBounds(orbit)));
        turning.x = event.clientX;
        turning.y = event.clientY;
        return;
      }
    }
    if (thrownFrom && Math.hypot(event.clientX - thrownFrom.x, event.clientY - thrownFrom.y) < TAP_SLOP) return;
    thrownFrom = null;
    if (event.pointerType === 'mouse' || pressStart) showAim(throwAim(event.clientX, event.clientY));
  });
  canvas.addEventListener('pointerup', (event) => {
    lastActivity = performance.now();
    const press = pressStart?.id === event.pointerId ? pressStart : null;
    const turned = press && turning;
    const touched = touching?.id === event.pointerId;
    releasePointer(event);
    if (press && !turned && !touched) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      const hit = throwAim(event.clientX, event.clientY);
      if (hit && moved < TAP_SLOP) { throwAt(hit.x, hit.z); if (event.pointerType === 'mouse') thrownFrom = { x: event.clientX, y: event.clientY }; }
    }
    if (event.pointerType !== 'mouse' || thrownFrom || touched) showAim(null);
  });
  canvas.addEventListener('pointercancel', (event) => { releasePointer(event); showAim(null); });
  // A held press is a finger in the water; a phone's browser may open its menu on one instead.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerleave', (event) => { if (!activePointers.has(event.pointerId)) showAim(null); });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    glide = null;
    // Notches: a mouse wheel sends about 100 pixels or 3 lines each. A trackpad
    // pinch arrives as ctrl + wheel in small steps, scaled to feel like the page zoom.
    let notches = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaMode === 2 ? event.deltaY : event.deltaY / 100;
    if (event.ctrlKey) notches *= 10;
    notches = THREE.MathUtils.clamp(notches, -4, 4);
    zoomAt(event.clientX, event.clientY, view.fov * WHEEL_STEP ** -notches);
  }, { passive: false });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat && event.target === document.body) { event.preventDefault(); throwRandom(); }
    if (event.key === 'Escape' && !reportedView?.atHome) resetView();
    if ((event.key === 't' || event.key === 'T') && !event.repeat && event.target === document.body) setTracing(!tracing);
  });

  // ---- simulation and rendering ----------------------------------------
  function simulate(dt) {
    // The tear and breakup fronts advance once per frame, so the splash needs the frame's length first.
    splash.setFrameSeconds(dt);
    finger.advance(dt);   // the finger's wake along its path this frame (src/touch.js)
    const substep = 1 / 240;
    const steps = Math.min(Math.max(1, Math.ceil(dt / substep)), 12);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const rock of rocks) {
        // A gale drifts a floater downwind (src/rock.js); the pool has no gale's waves.
        if (rock.floats) rock.setDrift(galeWaves.on && !pooled ? galeWaves.windDirection : null);
        const impact = rock.update(h, bedDepthAt, galeWaves.on ? galeSurfaceAt : null);
        if (tracing && (rock.state === 'air' || rock.state === 'skim' || impact)) traceRock(rock, impact);
        if (impact?.skim) splash.skim(impact, water);
        else if (impact?.ripple) splash.ripple(impact, water);
        else if (impact) splash.impact(impact, water);
        if (impact && !impact.ripple) lastImpact = { x: impact.x, z: impact.z };
      }
      // A thing striking a floater, floaters bumping, the pool's walls turning things back (and a skipping stone off
      // their sides, src/pool.js): src/collide.js; the knocked floater rings and throws off spray.
      for (const { ripple, knock } of collideThings(rocks, pooled ? (rock) => holdInPool(rock, pool.square) : null)) {
        splash.ripple(ripple, water);
        splash.knock(knock);
      }
      splash.update(h, water);
      simulationTime += h;
    }
    // A stone at rest on the bed goes after a while; what is kept in sight stays (the header), unless a gale drifts it out of sight.
    for (const rock of [...rocks]) {
      if (rock.restTime > 40 && !keptInSight(rock)) retireRock(rock);
      else if (rock.floats && Math.hypot(rock.position.x, rock.position.z) > FARTHEST_AFLOAT) retireRock(rock);
    }
    if (!skip.solver) {
      // The solver sleeps once its waves and foam have faded and nothing of the splash is left (the header);
      // the profiler's 'solver kept awake' step keeps it stepping.
      if (skip.sleep) water.wake();
      else if (!water.asleep && water.settled && splash.settled) water.sleep();
      water.step(dt);
    }
  }

  let framesRendered = 0;
  function render() {
    for (const rock of rocks) rock.flex();   // a soft thing's shape as it is drawn now (src/rock.js)
    pool.setTime(simulationTime);            // its deck's splashed patches dry by it
    renderer.info.reset();
    framesRendered++;
    camera.updateMatrixWorld();
    if (!skip.ambient) ambientWaves.update(simulationTime);
    galeWaves.update(simulationTime);   // nothing with no gale
    galeWaves.updateView(simulationTime, camera, resolution, viewFocus());
    updateLightning(simulationTime);
    rain.update(simulationTime, camera, resolution, viewFocus());
    rings.update(simulationTime);
    // The splash's sheets and columns to this frame, for the mirror and the droplet passes.
    if (!skip.fluid) splash.prepareFrame();
    const fromBelow = camera.position.y < (galeWaves.on ? galeSurfaceAt(camera.position.x, camera.position.z) : 0);
    if (!fromBelow) updateReflection();   // from below no mirror is needed; a change of view keeps it marked stale until the eye surfaces
    // A floater whose rim keeps the water off its top (a pizza afloat, toppings up): the water is not drawn inside its rim.
    surface.setDryDiscs(rocks.filter((rock) => rock.thing.water.dry && (rock.state === 'float' || rock.afloat) && rock.uprightAxis.clone().applyQuaternion(rock.quaternion).y > 0.9).map((rock) => ({
      x: rock.meshAbove.position.x, z: rock.meshAbove.position.z, radius: rock.thing.water.dry * rock.radius,
    })));
    surface.update({ underTarget, reflectionTarget, reflectionMatrix, mirrorRect: splashRect, stonesUnder: rocks.some((rock) => rock.state === 'skim' || rock.state === 'water' || rock.state === 'float' || rock.afloat || (rock.state === 'rest' && rock.position.y < 0)), resolution, camera, time: simulationTime });
    splash.prepareScene();   // the stones' cavities, and the patch dipping under them
    if (skip.cavity) surface.setCavities([]);
    surface.inner.visible = !skip.surface;
    surface.outer.visible = !skip.surface && !surface.pooled;   // the pool has no open water
    splash.cavityGroup.visible = !skip.surface && !skip.cavity;

    if (fromBelow) {
      renderFromBelow();
    } else {
      renderer.setRenderTarget(underTarget);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      if (!skip.floor) renderer.render(sceneUnder, camera);

      renderer.setRenderTarget(mainTarget);
      renderer.clear(true, true, false);
      renderer.render(sceneMain, camera);
    }

    if (Object.hasOwn(DEBUG_MODES, debugView)) {
      const debugTextures = { under: underTarget.texture, height: water.heightTexture, ambient: ambientWaves.heightTexture };
      debugPass.material.uniforms.uTexture.value = debugTextures[debugView] ?? water.foamTexture;
      debugPass.material.uniforms.uMode.value = DEBUG_MODES[debugView];
      debugPass.render(renderer, null);
      return;
    }
    // The profiler's plain tone map in place of the droplet passes, or the
    // splash over the scene; from below, what flies in the air is not drawn.
    if (skip.fluid || fromBelow) splash.toneMap(renderer, mainTarget, null);
    else splash.render(renderer, camera, mainTarget, null);
  }

  // The view from under the water (VIEWS.under). What the under-water pass
  // draws (floor, stones under the water, bubbles) goes straight into the
  // main target, each fading into the water's colour with the water between
  // it and the eye (UNDER_FOG, src/shaders/scene.js), over the water's own
  // colour where nothing is; then the surface and the stones' cavities as
  // seen from below (surface.fromBelow: the sky in Snell's window, the water
  // mirrored past it), with the foam's specks. The sky's dome, the beach, the
  // aim's marker and the stones above the water are behind the surface and
  // not drawn.
  const belowBackground = new FullscreenPass(UNDER_BACKGROUND_FRAGMENT, {
    uInverseProjection: { value: camera.projectionMatrixInverse },
    uCameraWorld: { value: camera.matrixWorld },
    uEye: { value: camera.position },
    uExtinction: { value: lighting.extinction },
    uWaterColor: { value: lighting.waterColor },
    uSunDir: { value: lighting.sunDirection },
    uSunIrradiance: { value: lighting.sunIrradiance },
    ...ambientWaves.uniforms(),
  });
  const hiddenFromBelow = () => [environment.sky, shore, pool.walls, pool.yard, marker, arc, ...rocks.map((rock) => rock.meshAbove)];
  function renderFromBelow() {
    renderer.setRenderTarget(mainTarget);
    renderer.clear(true, true, false);
    belowBackground.render(renderer, mainTarget);
    if (!skip.floor) renderer.render(sceneUnder, camera);
    const hidden = hiddenFromBelow();
    const wasVisible = hidden.map((object) => object.visible);
    for (const object of hidden) object.visible = false;
    surface.fromBelow(true);
    for (const mesh of splash.cavityGroup.children) mesh.material = surface.cavityUnderMaterial;
    renderer.render(sceneMain, camera);
    for (const mesh of splash.cavityGroup.children) mesh.material = surface.cavityMaterial;
    surface.fromBelow(false);
    hidden.forEach((object, index) => { object.visible = wasVisible[index]; });
  }

  // ?paused=1 starts with the clock stopped, so the harness's frames start
  // from world time zero whatever the page's start-up took.
  let running = pageParameters.get('paused') !== '1';
  let frameRequest = 0;        // the pending requestAnimationFrame, 0 when none: never two loops
  let lastFrame = performance.now();
  let fpsAverage = 60;
  let frames = 0;

  // ---- what is built, and its memory -------------------------------------
  const sizeOf = (target) => ({ width: target.width, height: target.height });
  /** The bytes the render targets hold, by owner (renderTargetBytes in src/gpu.js), and the sky's textures. */
  function memoryEstimate() {
    const sum = (targets) => targets.reduce((total, target) => total + renderTargetBytes(target), 0);
    const parts = {
      solver: sum([water.stateA, water.stateB, water.fftA, water.fftB, water.heightTarget, water.foamA, water.foamB]),
      wind: sum([ambientWaves.spectrumTarget, ambientWaves.fftA, ambientWaves.fftB, ambientWaves.heightTarget]),
      gale: sum([galeWaves.spectrumTarget, galeWaves.fftA, galeWaves.fftB, galeWaves.displacementTarget, galeWaves.derivativeTarget]),
      rain: renderTargetBytes(rain.tileTarget),
      rings: rings.bytes,
      scene: sum([underTarget, mainTarget, reflectionTarget]),
      splash: sum(Object.values(splash.targets)),
      sky: sum(environment.targets) + environment.panoramaBytes,
      floor: floorPatternBytes,
    };
    return { ...parts, total: Object.values(parts).reduce((total, bytes) => total + bytes, 0) };
  }
  function budget() {
    return {
      quality: qualityName,
      grid: water.size,
      meshSegments: surface.meshSegments,
      meshTriangles: surface.triangles,
      pixelRatio: dpr,
      canvas: { width: resolution.x, height: resolution.y },
      targets: { main: sizeOf(mainTarget), under: sizeOf(underTarget), reflection: sizeOf(reflectionTarget), fluid: sizeOf(splash.targets.info), solver: sizeOf(water.heightTarget) },
      targetBytes: memoryEstimate(),
      memory: { ...renderer.info.memory },
      programs: renderer.info.programs?.length ?? 0,
      solverAsleep: water.asleep,
      rings: { live: rings.live, fading: rings.fading, limit: rings.liveLimit, passes: rings.passesRun, fetches: rings.fetchesRun },
      wind: windName,
      gale: { blowing: galeWaves.on, sheetTriangles: surface.sheetTriangles },
      rain: { weather: weatherName, falling: rain.on, texels: rain.texels },
      clarity: waterName,
      sky: environment.name,
      frameCapped,
      calibration: automaticQuality ? calibration.phase : 'fixed',
      warmUp: { ...warmUpReport },
    };
  }

  function applyQuality(name) {
    qualityName = name;
    settings = QUALITY[name];
    rings.setLiveLimit(settings.rings);
    rain.setTexels(settings.rainTexels);
    water.resize(settings.grid);
    surface.setMeshSegments(settings.meshSegments);
    resize();
    monitor.settle = CALIBRATION.settleSeconds;
    onQualityChange?.(name);
  }

  // The calibration (CALIBRATION above): 'idle' measures the still pond,
  // 'splash' the first splash, then it is done. Only when the quality is automatic.
  const calibration = { phase: 'idle', frames: 0, seconds: 0 };
  function stepDown(steps) {
    const index = Math.min(QUALITY_ORDER.indexOf(qualityName) + steps, QUALITY_ORDER.length - 1);
    if (QUALITY_ORDER[index] !== qualityName) applyQuality(QUALITY_ORDER[index]);
  }
  function calibrate(dtReal) {
    if (!automaticQuality || calibration.phase === 'done') return;
    if (calibration.phase === 'awaitingSplash') {
      if (splash.count === 0) return;
      Object.assign(calibration, { phase: 'splash', frames: 0, seconds: 0 });
    }
    const splashOver = calibration.phase === 'splash' && splash.count === 0;
    if (!splashOver) {
      calibration.frames++;
      // The first splash frames upload its buffers; the idle warm-up covers the rest.
      const warmUp = calibration.phase === 'idle' ? CALIBRATION.warmUpFrames : 5;
      if (calibration.frames <= warmUp) return;
      calibration.seconds += dtReal;
      if (calibration.frames - warmUp < CALIBRATION.windowFrames) return;
    } else if (calibration.frames - 5 < CALIBRATION.fewestFrames) {
      Object.assign(calibration, { phase: 'awaitingSplash', frames: 0, seconds: 0 });   // too short to judge: the next splash
      return;
    }
    const measuredFrames = calibration.frames - (calibration.phase === 'idle' ? CALIBRATION.warmUpFrames : 5);
    const fps = measuredFrames / Math.max(calibration.seconds, 1e-3);
    if (calibration.phase === 'idle') {
      if (fps < CALIBRATION.splashMinimumFps) stepDown(2);
      else if (fps < CALIBRATION.idleMinimumFps) stepDown(1);
      Object.assign(calibration, { phase: 'awaitingSplash', frames: 0, seconds: 0 });
    } else {
      if (fps < CALIBRATION.splashMinimumFps) stepDown(1);
      calibration.phase = 'done';
    }
  }

  // After the idle measurement the frame rate stays watched (CALIBRATION):
  // windows of sustainedSeconds of frames drawn one per requestAnimationFrame;
  // a capped frame or a stall starts the window again.
  const monitor = { seconds: 0, frames: 0, settle: 0 };
  function watchFrameRate(interval, everyFrame) {
    if (!automaticQuality || calibration.phase === 'idle' || calibration.phase === 'splash') return;
    if (!everyFrame || interval > CALIBRATION.stallSeconds) { monitor.seconds = 0; monitor.frames = 0; return; }
    if (monitor.settle > 0) { monitor.settle -= interval; return; }
    monitor.seconds += interval;
    monitor.frames++;
    if (monitor.seconds < CALIBRATION.sustainedSeconds) return;
    if (monitor.frames / monitor.seconds < CALIBRATION.sustainedMinimumFps) stepDown(1);
    monitor.seconds = 0;
    monitor.frames = 0;
  }

  // ---- the frame loop ------------------------------------------------------
  /** Whether frames are coming at the preset's idleFrameRate: nothing moving, touched or zoomed for IDLE.quietSeconds. */
  let frameCapped = false;
  function capFrames(now) {
    frameCapped = settings.idleFrameRate > 0 && (!profiler || profiler.done) && activePointers.size === 0 && now - lastActivity > 1000 * IDLE.quietSeconds;
    return frameCapped;
  }
  let profiler = null;

  function frame(now) {
    frameRequest = 0;
    if (!running) return;
    frameRequest = requestAnimationFrame(frame);
    const interval = (now - lastFrame) / 1000;   // real seconds since the last frame drawn, unclamped
    if (profiler?.emptyFrames) {
      // The profiler's floor: a frame that neither simulates nor draws.
      lastFrame = now;
      profiler.frame({ interval, simulateMilliseconds: 0, renderMilliseconds: 0, calls: 0, triangles: 0 });
      return;
    }
    const capped = capFrames(now);
    if (capped && interval < 1 / settings.idleFrameRate - IDLE.tolerance) return;   // this one is skipped; the next draws both intervals
    lastFrame = now;
    const dtReal = Math.min(interval, 0.1);
    if (dtReal > 0) {
      fpsAverage += (1 / dtReal - fpsAverage) * 0.05;
      if ((++frames & 15) === 0) onStats?.({ fps: fpsAverage, droplets: splash.count, quality: qualityName });
      calibrate(dtReal);
      watchFrameRate(interval, !capped);
    }
    stepGlide(now);
    const simulateStart = performance.now();
    simulate((profiler?.fixedSeconds ?? dtReal) * timeScale);
    const renderStart = performance.now();
    render();
    const renderEnd = performance.now();
    if (splash.inMotion || rain.on || rocks.some((rock) => rock.state !== 'rest')) lastActivity = now;
    profiler?.frame({ interval, simulateMilliseconds: renderStart - simulateStart, renderMilliseconds: renderEnd - renderStart, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  }

  /** The pond back to still water at time zero: no stones, no splash, the solver cleared and asleep. */
  function clearPond() {
    for (const rock of [...rocks]) retireRock(rock);
    water.clear();
    pool.dry();
    splash.reset(renderer);
    rings.reset();
    simulationTime = 0;
    viewChanged = true;   // the mirror image is drawn whole again, without the splash
    mirroredRect.set(0, 0, 0, 0);
    splashRect.set(0, 0, 0, 0);
  }

  /**
   * The water the pool's (true) or the lake's (the header: the pool): the
   * solver's walls, the scenery, the bed the splash's drops see, and a still
   * pond of the new kind; the eye on the same view of the new kind (or the
   * one it glides to), or kept where it may stand there.
   */
  function setPooled(asPool) {
    if (asPool === pooled) return;
    const standing = glide ? glide.name : viewName();
    pooled = asPool;
    clearPond();
    water.setPool(asPool);
    applyGale();
    showScenery(asPool);
    splash.setBed({ depth: bedDepthAt(water.centre[0], water.centre[1]), albedo: asPool ? POOL.tileAlbedo : undefined });
    applyGround();
    glide = null;
    if (standing) showView(standing, { glide: false });
    else moveEye({ ...orbit });
  }

  // ---- warm-up: every program a throw needs, compiled under the veil -----
  // Three.js deletes a program once no material uses it. The splash's
  // materials live as long as the page; a stone's die with it, so the warm-up
  // stone's two materials are kept (programKeepers) and every later stone,
  // made the same way, finds their program.
  const warmUpReport = { programs: 0, milliseconds: 0 };
  const programKeepers = [];
  function warmUp() {
    const started = performance.now();
    const programsBefore = renderer.info.programs?.length ?? 0;
    const random = Math.random;
    let state = WARM_UP.seed;
    Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
    marker.visible = arc.visible = true;   // the aim marker's programs too
    rain.show(true);                       // and the rain's: its tile's pass, its streaks and flecks (none drawn: none set)
    const galeWarmUp = galeWaves.warmUp();   // and the gale's passes and spray (its FFT's program is the ripples')
    const stone = throwAt(WARM_UP.x, WARM_UP.z, { radius: WARM_UP.radius, power: 'normal', thing: DEFAULT_THING });
    // A floater's mirror image (src/rock.js meshMirror), in the whole mirror drawn now, and a textured thing's
    // materials (a pizza's: above, below and in the mirror): their programs too.
    const floaters = WARM_UP.floaters.map((name) => throwAt(WARM_UP.x, WARM_UP.z, { thing: name }));
    for (const floater of floaters) floater.meshMirror.visible = true;
    viewChanged = true;
    render();
    for (const floater of floaters) {
      programKeepers.push(floater.meshAbove.material, floater.meshBelow.material, floater.meshMirror.material);
      retireRock(floater, { keepMaterials: true });
    }
    galeWarmUp.done();
    marker.visible = arc.visible = false;
    rain.show(false);
    for (let step = 0; step < 180 && !rocks.some((rock) => rock.state !== 'air'); step++) simulate(1 / 60);
    let elapsed = 0;
    for (const [index, moment] of WARM_UP.moments.entries()) {
      while (elapsed < moment - 1e-6) { const dt = Math.min(1 / 60, moment - elapsed); simulate(dt); elapsed += dt; }
      render();
      if (index === 0) {
        renderFrom(VIEWS.under);   // the cavity is open: the surface's and the cavity's programs from below
        // The other water's scenery (the pool's, or the lake's), from above
        // and below, so a change of water compiles nothing.
        showScenery(!pooled);
        render();
        renderFrom(VIEWS.under);
        showScenery(pooled);
      }
    }
    Math.random = random;
    programKeepers.push(stone.meshAbove.material, stone.meshBelow.material);
    retireRock(stone, { keepMaterials: true });
    clearPond();
    warmUpReport.programs = (renderer.info.programs?.length ?? 0) - programsBefore;
    warmUpReport.milliseconds = performance.now() - started;
  }
  warmUp();
  await applyWeather(weatherName);   // a remembered rain falls before the veil lifts, not just after

  profiler = profiling ? new Profiler({
    applySkips(flags) {
      const wasHalfDensity = skip.halfDensity;
      for (const key of Object.keys(skip)) skip[key] = Boolean(flags[key]);
      if (skip.halfDensity !== wasHalfDensity) resize();
    },
    throwStone: () => throwAt(0, -1.4, { radius: 0.03, power: 'normal' }),
    hasImpacted: () => rocks.some((rock) => rock.state !== 'air' || rock.skip?.skips > 0),
    clearPond,
    describe: () => `${qualityName}, ${resolution.x}×${resolution.y} at ${dpr.toFixed(2)}×, grid ${water.size}, mesh ${surface.meshSegments}`,
    memory: () => ({ ...memoryEstimate(), textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }),
    onReport: (lines) => onProfile?.(lines),
  }) : null;

  lastFrame = performance.now();
  if (running) frameRequest = requestAnimationFrame(frame);
  onReady?.();

  const api = {
    throwAt,
    throwRandom,
    setStoneRadius(radius) { stoneRadius = radius; },
    /** What is thrown (a key of src/things.js THINGS: a kind of stone or a ball), remembered on this device. */
    setThing(name) {
      if (!Object.hasOwn(THINGS, name)) return;
      thingName = name;
      try { window.localStorage.setItem(THING_STORAGE_KEY, name); } catch { /* storage refused: the choice lasts this visit */ }
    },
    get thing() { return thingName; },
    /** The strip's slider for what is thrown, in its unit (src/things.js `slider`): a stone's diameter (cm), a bowling ball's pounds, a basketball's size. */
    setSize(value) {
      const thing = THINGS[thingName];
      if (thing.byDiameter) stoneRadius = value / 200;
      else if (thing.slider) thingSizes[thingName] = THREE.MathUtils.clamp(value, thing.slider.min, thing.slider.max);
    },
    get size() { return THINGS[thingName].byDiameter ? 200 * stoneRadius : thingSizes[thingName] ?? THINGS[thingName].slider?.initial; },
    /**
     * Define a thing to throw (src/things.js defineThing: a definition, checked;
     * it throws saying what is wrong), from the console or a page that makes
     * them; the setting's cards follow (onThingsChange).
     */
    defineThing,
    setPower(name) { if (POWER[name]) power = name; },
    /** Skip on or off: taps, Space and throwRandom throw skips (the header); throwAt's `skip` option overrides it. */
    setSkip(on) { skipping = Boolean(on); },
    get skipping() { return skipping; },
    /** Trace each stone (the header; ?trace=1, the T key) from its next step on; off takes the traces away. */
    setTrace(on) { setTracing(on); },
    /** The wind's strength by name (WIND_STRENGTHS: calm, breeze, windy), remembered on this device. */
    setWind(name) {
      if (!Object.hasOwn(WIND_STRENGTHS, name)) return;
      applyWind(name);
      moveEye({ ...orbit });   // a gale's eye stands clear of its waves (galeClearance)
      try { window.localStorage.setItem(WIND_STORAGE_KEY, name); } catch { /* storage refused: the choice lasts this visit */ }
    },
    get wind() { return windName; },
    /** The water by name (WATER_CLARITIES: pool, clear, lake, pond, murky; the pool is the pool's basin, the others the lake), remembered on this device. */
    setClarity(name) {
      if (!Object.hasOwn(WATER_CLARITIES, name)) return;
      applyWater(name);
      setPooled(name === 'pool');
      applySky();   // the absorption lights the stones under the water and the splash's view of the bed
      try { window.localStorage.setItem(WATER_STORAGE_KEY, name); } catch { /* storage refused: the choice lasts this visit */ }
    },
    get clarity() { return waterName; },
    /**
     * The sky by place (a key of SKIES in src/sky.js), remembered on this
     * device, at its hour nearest the time of day last chosen. Its photo
     * loads first and the old sky stays until it has arrived; then the sky,
     * the sun and everything they light change in one frame. Resolves to the
     * place then shown (the old one if the photo could not be fetched).
     * Choices made while one loads queue behind it, and only the last is
     * loaded.
     */
    setSky(name) {
      const [place, hour] = placeAndHour(name);
      if (!SKY_NAMES.includes(place)) return Promise.resolve(environment.name);
      try { window.localStorage.setItem(SKY_STORAGE_KEY, place); } catch { /* storage refused: the choice lasts this visit */ }
      return requestSky(place, hour);
    },
    get sky() { return environment.name; },
    /**
     * The hour of the place last asked for (a name from `hours`), its local
     * time remembered on this device as the time of day other places follow.
     * Loads as setSky does; resolves to the hour then shown. (`time` is the
     * simulation's clock.)
     */
    setHour(name) {
      const hour = skyHours(skyRequest.place).find((entry) => entry.name === name);
      if (!hour) return Promise.resolve(environment.hour);
      if (hour.clock) {
        chosenClock = hour.clock;
        try { window.localStorage.setItem(TIME_STORAGE_KEY, hour.clock); } catch { /* storage refused: the choice lasts this visit */ }
      }
      return requestSky(skyRequest.place, name).then(() => environment.hour);
    },
    get hour() { return environment.hour; },
    /**
     * The weather by name (WEATHERS: clear, light-rain, heavy-rain), remembered
     * on this device. The sky clouds over at once; the rain falls once its
     * ring's table has come (the first time, about 0.6 MB). Resolves when
     * it falls.
     */
    setWeather(name) {
      if (!Object.hasOwn(WEATHERS, name)) return Promise.resolve(weatherName);
      try { window.localStorage.setItem(WEATHER_STORAGE_KEY, name); } catch { /* storage refused: the choice lasts this visit */ }
      if (WEATHERS[name].wind) this.setWind(WEATHERS[name].wind);
      return applyWeather(name).then(() => weatherName);
    },
    get weather() { return weatherName; },
    /** Whether rain is falling (its ring's table has come). */
    get raining() { return rain.on; },
    /** The shown place's hours, in the order of the day: { name, label, clock } (clock 'hh:mm', or undefined for a lone photograph). */
    get hours() { return skyHours(environment.name); },
    setTimeScale(scale) { timeScale = scale; },
    /** A preset by name, which ends the automatic calibration; 'auto' starts it again from high. */
    setQuality(name) {
      automaticQuality = name === 'auto';
      if (automaticQuality) Object.assign(calibration, { phase: 'idle', frames: 0, seconds: 0 });
      else if (!QUALITY[name]) return;
      applyQuality(automaticQuality ? 'high' : name);
    },
    pause() {
      running = false;
      if (frameRequest) cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    },
    resume() {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      if (!frameRequest) frameRequest = requestAnimationFrame(frame);
    },
    /**
     * Deterministic stepping for screenshots: simulate `seconds` of world time
     * in the frames the app would draw, 1/60 s of real time each (so a time
     * scale of 0.1 makes frames of 1/600 s), then draw once. beforeFrame, if
     * given, is called before each with the seconds simulated so far (the
     * harness moves a finger with it).
     */
    advance(seconds, beforeFrame = null) {
      if (glide) stepGlide(Infinity);   // a glide arrives at once
      const chunk = Math.max(timeScale, 0.01) / 60;
      let remaining = seconds;
      while (remaining > 1e-6) { const dt = Math.min(chunk, remaining); beforeFrame?.(seconds - remaining); simulate(dt); remaining -= dt; }
      render();
    },
    /** Whether a stone has met the water: gone in, or skipped (a skip's touch can be over within a frame). */
    hasImpacted() { return rocks.some((rock) => rock.state !== 'air' || rock.skip?.skips > 0); },
    /** Where the eye would stand at `steps` + 1 even shares of a glide from where it is to the view `name` (tools/zoom-probe.mjs). */
    glidePath(name, steps = 50) {
      const from = { ...orbit }, target = viewsNow()[name];
      return Array.from({ length: steps + 1 }, (unused, step) => { const share = step / steps; return orbitEye(glideOrbit(from, target, share * share * (3 - 2 * share))); });
    },
    /** A finger into the water at world (x, z), as a held press puts it (src/touch.js); then dragTouch moves it and liftTouch lifts it. */
    touchWater(x, z) { endTouch(); touching = { id: 'api' }; finger.dip(x, z); showFinger({ x, z }); },
    dragTouch(x, z) { finger.moveTo(x, z); showFinger({ x, z }); },
    liftTouch() { endTouch(); },
    /** Whether a finger is in the water, and where ({ x, z }, or null). */
    get touching() { return finger.inWater; },
    get fingerPosition() { return finger.target ? { ...finger.target } : null; },
    setDebugView(name) { debugView = name; },
    /** Set the field of view (degrees), keeping the look direction; unlike the user's zoom it may leave the home frame. */
    setFov(degrees) { setView({ yaw: view.yaw, pitch: view.pitch, fov: degrees }, true); },
    /** Turn the camera to look at a world point, horizon level. */
    lookAt(x, y, z) { setView({ ...viewFacing(x - camera.position.x, y - camera.position.y, z - camera.position.z), fov: view.fov }, true); },
    /** Glide back to the shore view the page opens with, unzoomed. */
    resetView,
    /** One of VIEWS by name (shore, level, high, under), glided to; with { glide: false } at once. */
    showView,
    /** The VIEWS entry the eye stands at (or glides to), null when turned off them. */
    get viewName() { return glide ? glide.name : viewName(); },
    /** A glide under way arrives now (for the probes, which draw no frames). */
    settleView() { if (glide) stepGlide(Infinity); },
    /**
     * Stand the eye at once on an orbit: { azimuth, elevation } in degrees
     * (src/viewOrbit.js), distance in metres, pivot [x, y, z] (each kept as
     * it is when left out); the view is unzoomed.
     */
    setOrbit({ azimuth, elevation, distance, pivot } = {}) {
      glide = null;
      const { reach, ...next } = orbit;   // a distance given is the one it wants
      if (azimuth !== undefined) next.azimuth = THREE.MathUtils.degToRad(azimuth);
      if (elevation !== undefined) next.elevation = THREE.MathUtils.degToRad(elevation);
      next.distance = distance ?? reach ?? orbit.distance;
      if (pivot) [next.pivotX, next.pivotY, next.pivotZ] = pivot;
      placeOrbit(clampOrbit(next, eyeBounds(next)));
      Object.assign(home, orbitFacing(orbit), { fov: frameFov() });
      setView(home);
    },
    /** The orbit the eye stands on: azimuth and elevation in degrees, distance in metres, pivot [x, y, z]. */
    get orbit() { return { azimuth: THREE.MathUtils.radToDeg(orbit.azimuth), elevation: THREE.MathUtils.radToDeg(orbit.elevation), distance: orbit.distance, pivot: [orbit.pivotX, orbit.pivotY, orbit.pivotZ] }; },
    get zoomed() { return isZoomed(view, home); },
    /** Whether the view is the shore's, unzoomed (Reset view and Escape go there). */
    get atHome() { return reportedView?.atHome ?? true; },
    get time() { return simulationTime; },
    get timeScale() { return timeScale; },
    get rocks() { return rocks; },
    get quality() { return qualityName; },
    /** Whether the quality is chosen automatically (setQuality('auto'), and the page's start unless ?quality= fixes it). */
    get automaticQuality() { return automaticQuality; },
    /**
     * What the preset built (read-only): the solver's grid, the patch's mesh,
     * the pixel ratio, every target's size, the render targets' bytes by owner
     * (an estimate from their formats), renderer.info.memory, the programs
     * compiled, whether the solver sleeps and the frame rate is capped, and
     * the warm-up's programs and milliseconds.
     */
    get budget() { return budget(); },
    /** Frames drawn so far (render() calls), for the probes. */
    get framesRendered() { return framesRendered; },
    /** Where the splash was drawn into the mirror image at the last frame, in its target's pixels (0 wide: nowhere), and the target's size. */
    get mirrorRegion() { return { x: splashRect.x, y: splashRect.y, width: splashRect.z, height: splashRect.w, targetWidth: reflectionTarget.width, targetHeight: reflectionTarget.height }; },
    renderer,
    camera,
    lighting,
    water,
    ambientWaves,
    galeWaves,
    rings,
    splash,
    surface,
    sceneUnder,
    sceneMain,
    THREE,
  };
  return api;
}
