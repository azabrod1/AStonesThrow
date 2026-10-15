# Stone Pond

Throw stones into a pond and watch the splash. A WebGL toy built with
Three.js: the water is a real wave solver, the splash is choreographed from
the physics of a stone entering water, and the droplets are rendered as water.

Live at https://azabrod1.github.io/IntoTheWater/, published from `main` by
GitHub Pages on every push. Locally, open `index.html` through any static
server (`npm start`, then http://localhost:8123/). There is no build step.
Three.js loads from a CDN.

Tap or click the water to throw a stone there. Space throws one at random.
Scroll or pinch to zoom toward what is under the pointer (down to an 8°
field of view); Escape or Reset view goes back. The strip at the bottom sets
the stone size, the throw strength, slow motion and the rendering quality.
The quality starts on High everywhere and steps down by itself if the idle
pond or the first splash renders too slowly (the readout in the corner shows
the frame rate and the preset in use); the buttons fix a preset.

## How it works

**Water surface** (`src/spectralWater.js`). The pond is a 6 m square patch of
512 × 512 cells (256 on low quality) kept in Fourier space: for each wave
vector the complex amplitude of the height and of its time derivative. Linear
water waves obey

    ω² = (g k + σ k³ / ρ) · tanh(k D)

so each mode is advanced exactly by rotating through ω·dt, which is stable for
any time step and gives the right dispersion: long ripples outrun short ones,
as they do on a real pond. Disturbances are Gaussian splats with a raised rim
(zero net volume, so no long-wave mound), added in Fourier space from their
closed-form spectrum. One inverse FFT per frame (2·log2 N passes on the GPU)
returns the height and vertical velocity for rendering. A foam map decays,
diffuses and is stamped by the splash.

**Wind ripples** (`src/ambientWaves.js`). Between throws the pond is never
still: a second spectral field, on its own 6 m tile of 256 × 256 laid over
all the water, carries the ripples a breeze raises. It is a fixed random draw
from a wind-wave spectrum (wavelengths from 5 to about 60 cm, mostly
travelling downwind, a tenth as much upwind, rms slope 0.035) evaluated
afresh every frame at the world time, with the same dispersion as the splash,
so it has no state to drift and slow motion slows it too; linear waves add,
so the splash simply rides on it. One evaluation pass and one inverse FFT per
frame give the height, its exact slopes and its Laplacian, mipmapped so that
far ripples average to flat instead of shimmering; the slope they average
away becomes roughness in the sun's glitter, so the glitter keeps its
brightness with distance. Gusts multiply it: patches of ripple about 3 m
across (cat's paws) drift downwind at 1.5 m/s over calmer water that keeps a
quarter of it, which also hides the tile's repetition.

**Splash** (`src/splash.js`). A stone entering water goes through stages with
known timing, and the droplets are choreographed from them:

1. crown (`src/crown.js`): a thin sheet rising from a ring just outside the
   stone, biased forward. It is water launched from the ring over a few
   milliseconds, each element then flying on its own, slowed by surface
   tension and air, so the whole sheet is a closed form in launch time,
   azimuth and time. Its rim thickens into a bead, goes wavy and sheds drops
   from the crests; after about 60 ms (for a 3 cm stone) the sheet tears
   from the rim down into drops that carry its velocity. A thrown stone enters obliquely (about 40
   to 55° from vertical), and then a fan comes first: the same sheet model
   over a sector 60° either side of the direction of travel, launched from
   the forward contact line at about 0.9 of the entry speed and 65 to 75°
   from vertical, half as thick, which flares low ahead of the crown and
   tears into fine spray after 20 ms;
2. cavity and pinch-off about 2.1·√(R/g) seconds after entry. An oblique
   entry drags the cavity forward: its depression and foam stretch one to
   two radii along the path, and its ring runs stronger ahead than behind;
3. Worthington jet (`src/jet.js`): a glassy column fired up, after an
   oblique entry leaning back along the stone's path (by half the entry
   angle, at most 25°) and a little slower. It is
   water launched from the collapse point, fastest first, each element then
   flying ballistically, so the column is a closed form in launch time,
   azimuth and time; it stretches as it rises, its radius set by volume
   conservation, widest at the base. A bulb at its tip pinches off into one
   to three large drops (the largest of the splash), then the column breaks
   from the top down into drops about twice its local radius, as a
   Rayleigh–Plateau instability does, growing varicose beads before it
   parts; its slow base falls back into a mound that throws a small
   secondary ring. For a 3 cm stone it reaches about half a metre and is
   gone about half a second after entry;
4. bubbles that follow the stone down its path, rise and burst into foam.

Drops ring the water where they land, and the big ones (the jet's, and the
crown's largest) throw a small crown of their own, the classic drop-impact
crown: the same sheet model with the drop's radius and speed, standing for
about 20 ms. Foam specks (`src/foamSpecks.js`) are the grain of the foam the
splash leaves: rafts of 2 to 4 mm points riding the waves where the crown
stood, where the jet fell back, where drops landed and where bubbles
surfaced, drifting outward and popping over 2 to 8 seconds.

The splash scales with the stone (the slider's 1.5 to 16 cm is its
diameter; the constants were tuned at 3 cm radius). Wherever the physics
allows it scales as a Froude-similar splash does: lengths with the radius,
times with √(R/g), speeds with the entry speed. The crown's sheet is as thick
as the stone is big, so air and surface tension slow it less, it drains
slower and stands longer: a 16 cm stone's crown stands for 160 ms, its rim
17 cm high and 70 cm across, and tears into drops of up to 7 mm, while a
1.5 cm pebble's rises 4 cm. Its rim fingers as a decelerating rim does, so a
big crown has more, finer fingers rather than a few huge petals. A big
stone's jet is fat (its Froude number is lower, so the cavity's collapse is
less singular) and breaks up slowly (a column's capillary time grows as its
radius to the 1.5): a 16 cm stone's is 11 cm across at the water, rises
45 cm (80 cm dropped straight in) and mostly falls back as a column, which
throws a second, strong ring. Drop counts grow faster than the stone's area
and drop sizes as √R, so a big splash is both denser and coarser; the foam it
leaves covers the cavity's mouth and is denser. The pond damps waves longer
than 30 cm less than ripples, as a real one does, so a big stone's ring
carries across it. The stone starts the splash the moment its lowest point
touches the water. `tools/splash-probe.mjs` prints the whole table.

Droplets are integrated on the CPU and rendered as a screen-space fluid:
sphere impostors stretched along their motion like a camera shutter would,
into a depth buffer (with each drop's sun glint) and an additive thickness
buffer; a bilateral blur merges neighbouring drops into sheets; the composite
pass shades the result with sky reflection, refraction of the scene behind,
sun highlights and white scattering for fine spray, then tone-maps the frame.
The crown sheet and the jet column are meshes drawn into the same two
buffers, so they are shaded as the same water: the sheet with a milky
scattering for its rippled, aerated film, the column (and the large drops it
breaks into) as clear glass, a lens that shows the pond and the sun's glitter
from well to the side and, through its bulb, the sky upside down.

**Sky** (`src/sky.js`). The sky is a photograph: an equirectangular HDRI
of a meadow with trees on a dome at the far plane, turned about the vertical
(and mirrored, where that puts better scenery ahead) so that its sun stands
where the scene's does (28° right of straight ahead) and at the photo's own
elevation, which becomes the scene's. Its brightness is
anchored on the sun: `tools/sky-probe.mjs` measures the photo's sun
irradiance and sky radiance, and the dome is scaled so that its sun matches
the scene's (times π, the scene's convention for diffuse light), so the
photo's own balance of sky and sun carries over, and the sky's mean radiance
becomes the ambient light of the foam and the sand. The sun's light reaches
the scene through the directional light and the analytic highlights, so the
dome's radiance is capped at 30 times the mean sky. The water reaches 3 km,
far enough to meet the dome's horizon with no strip of the photo's ground
between them, so the photo's treeline stands on the far shore. The dome and
a water-coloured lower hemisphere are captured once into a cube map that the
droplets reflect, and a prefiltered copy lights the stones.

**Rendering** (`src/main.js`, `src/shaders/`). Each frame: the floor,
submerged stones and bubbles are rendered to a texture with depth; the main
scene renders the sky dome and the water surface, which refracts that texture
with absorption by path length through the water, reflects a planar mirror
image of the sky dome, clouds and treeline (the camera never moves, so it is
re-rendered only when the view zooms or turns) in the direction each ripple
turns the view ray, so reflections wobble into vertical streaks, and adds
the sun's glitter: a Beckmann highlight on the rippled normal, widened by the
ripple finer than the pixel; the foam specks ride on it.
Caustics on the sand come from the Laplacian of the surface height above,
splash and wind ripples both, so they drift with the ripples.
Stones are faceted procedural geometry with a small rigid-body model: a
ballistic arc, quadratic drag under water, and a settle into the sand.

## Development

- `npm test` checks the GPU FFT formulation and the splat spectrum on the CPU,
  then runs `tools/wave-probe.mjs`.
- Deployment: `.github/workflows/deploy.yml` runs the tests and `npm run site`
  on every push to `main` and publishes `_site/` to GitHub Pages. `npm run site`
  (`tools/build-site.mjs`) copies only what the page loads: `index.html`,
  `src/` and `assets/`. A new file or folder loaded at run time outside those
  must be added to its list. `node tools/site-check.mjs`, after
  `npm run site`, serves `_site/` under `/IntoTheWater/` as Pages does and
  checks that the pond starts and no request fails.
- `node tools/wave-probe.mjs [--wind=x,z]` checks the wind ripples on the CPU
  with the GPU's own FFT passes: the field is real, its rms slope is the
  target, waves travel downwind, it repeats seamlessly after its period, and
  the roughness each mip level hands the glitter matches a measurement; it
  prints the cost of a frame.
- `npm run shoot -- --label=name --throws=x:z:radius --times=0.1,0.5` renders
  deterministic frames headlessly (Playwright + Chromium) into `shots/name/`,
  at exact times after the first impact.
  Options: `--fov`, `--look=x:y:z`, `--preimpact=seconds`, `--ui=1`,
  `--debug=under|height|foam|env|face|ambient`, `--eval="js"`, `--w --h --dpr`,
  `--crop=x:y:w:h --cropscale=n` (an enlarged crop of each frame),
  `--report="js"` (printed after each frame), `--floats=half`,
  `--power=soft|normal|hard` (soft is a higher arc, so a steeper entry,
  about 30° from vertical). With
  `--eval="window.__pond.setTimeScale(0.1)"` the frames are slow motion, 1/600 s
  of world time each, so `--times=0.07,0.0716667,…` are consecutive frames;
  the flight is stepped in slow frames too, so the first frame is at most
  1/600 s after the impact (a `--preimpact` just short of it saves time).
  `--throws=none` throws nothing and takes `--times` seconds after `idle.png`
  (which follows `--preroll=seconds`), for a run of idle frames.
- `?floats=half` on the page forces half-float render targets everywhere, the
  path devices without `EXT_color_buffer_float` take.
- `?paused=1` starts the page with its clock stopped (the harness does, so
  its frames start from world time zero and every run renders the same water).
- `?wind=x,z` on the page (`--wind=x:z` for the harness) sets the direction
  the wind blows toward, in world XZ (the camera looks toward −Z); the
  default is (0.45, −0.9), away from the camera and a little to the right.
- `?sky=name` on the page (`--sky=name` for the harness) picks the sky
  panorama, a key of `SKIES` in `src/sky.js`.
- `node tools/sky-probe.mjs assets/sky/name_2k.hdr [--png=preview.png]`
  measures a sky panorama (the sun's direction, the sun's irradiance, the
  sky's mean radiance, the horizon's) and writes `assets/sky/name.json`,
  which `src/sky.js` reads; `--png` also writes a tone-mapped preview with the
  sun marked. A new panorama needs this run once.
- `node tools/jet-probe.mjs [radius] [entrySpeed] [profileTime] [horizontalFraction]`
  runs one Worthington jet on the CPU and prints its timeline, drops, volume
  budget, when its big drops land and cost per frame; a horizontal fraction
  makes it the leaning jet of an oblique entry.
- `node tools/splash-probe.mjs [radius ...] [--aim=x:z] [--power=name] [--vertical]`
  throws stones as the app does and runs their whole splash on the CPU: for
  each size the crown's height, reach and life, the jet's top and width, the
  drops by source and at most alive, the cavity, the foam, the ring the pond
  makes of it at 0.5, 1 and 2 m (the solver's own dispersion and damping),
  and the CPU cost per frame. Without radii it runs the slider's 1.5, 4, 8
  and 16 cm and the 3 cm-radius reference.
- `node tools/fan-probe.mjs [radius] [entrySpeed] [horizontalFraction]` runs
  the forward fan of an oblique entry on the CPU and prints its timeline,
  its drops, where they land and its cost per frame.
- `node tools/quality-probe.mjs` runs the page unpaused at phone size with
  automatic quality, waits for the idle and first-splash measurements, and
  checks the preset steps down when the frame rate is low and that the readout
  and the quality buttons follow.
- `node tools/zoom-probe.mjs [--w=390 --h=844]` drives the wheel, a pinch, a
  tap and Escape through the page's own handlers and checks that what is under
  the pointer stays there.
- `window.__pond` exposes the app in the console: `throwAt(x, z, { radius, power })`,
  `setTimeScale` (and `timeScale`), `pause()`, `advance(seconds)` (in the frames the app would
  draw at the current time scale), `setDebugView(name)`, `setFov(degrees)`,
  `lookAt(x, y, z)`, `resetView()`.

Install the development dependencies with `npm install` (Three.js is only
needed locally for the headless harness, which serves it instead of the CDN).

## Credits

The sky panorama is *Meadow 2* by Sergej Majboroda, from
[Poly Haven](https://polyhaven.com), CC0.
