# Stone Pond

Throw stones into a pond and watch the splash. A WebGL toy built with
Three.js: the water is a real wave solver, the splash is choreographed from
the physics of a stone entering water, and the droplets are rendered as water.

Live at https://azabrod1.github.io/IntoTheWater/, published from `main` by
GitHub Pages on every push. Locally, open `index.html` through any static
server (`npm start`, then http://localhost:8123/). There is no build step.
Three.js loads from a CDN.

Tap or click the water to throw a stone there (beyond the simulated patch,
at its nearest point). Space throws one at random.
Scroll or pinch to zoom toward what is under the pointer (down to an 8°
field of view); Escape or Reset view goes back. The strip at the bottom sets
the stone size, the throw strength, slow motion and the rendering quality.
The quality starts on High everywhere and steps down by itself if the idle
pond or the first splash renders too slowly, and later whenever the frame
rate stays under 25 for a few seconds (the readout in the corner shows the
frame rate and the preset in use); the buttons fix a preset. A preset sets
the work a frame does: High runs the 512² solver, a 254-segment water mesh
and full-resolution targets; Medium and Low a 256² solver, 160 and 128
segments, the under-water view and the mirror image at half resolution and
the splash's buffers at half, and draw a pond where nothing happens at 30
frames a second. The canvas never holds more than 2.6 million pixels.
Every GPU program a throw needs is compiled while the page loads, under its
veil: a stone is thrown and drawn there, then cleared away.

## How it works

**Water surface** (`src/spectralWater.js`). The pond is a 6 m square patch of
512 × 512 cells (256 on Medium and Low) kept in Fourier space: for each wave
vector the complex amplitude of the height and of its time derivative. Linear
water waves obey

    ω² = (g k + σ k³ / ρ) · tanh(k D)

so each mode is advanced exactly by rotating through ω·dt, which is stable for
any time step and gives the right dispersion: long ripples outrun short ones,
as they do on a real pond. Disturbances are Gaussian splats with a raised rim
(zero net volume, so no long-wave mound), added in Fourier space from their
closed-form spectrum. One inverse FFT per frame (2·log2 N passes on the GPU)
returns the height and vertical velocity for rendering. A foam map rides
along: how much foam each cell holds, of two kinds that last very
differently (a boil and a raft, below), and how long each lasts; stamped by
the splash, carried outward by its surface flows and downwind by the breeze,
spreading a little and decaying. A change of quality carries the
waves and the foam to the new grid. When nothing has disturbed the water for
75 s (the time the biggest splash's longest waves, which the pond damps
least, take to fade below a pixel's notice) and nothing of the splash is
left, the solver sleeps: it clears its textures once and runs no passes
until the next splat.

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

1. crown (`src/crown.js`): a thin sheet rising from the lip of the stone's
   cavity (2.), biased forward. It is water launched from the ring over a few
   milliseconds, each element then flying on its own, slowed by surface
   tension and air, so the whole sheet is a closed form in launch time,
   azimuth and time. Its rim thickens into a bead and grows fingers: narrow
   rods of water between shallow arcs of rim, each ending in a round bead
   that swells, pinches off as a drop as big as the rim is thick, and
   starts again; after about 60 ms (for a 3 cm stone) the sheet tears, the
   arcs first and the fingers last, from the rim down into drops that carry
   its velocity. A thrown stone enters obliquely (about 40
   to 55° from vertical), and then a fan comes first: the same sheet model
   over a sector 60° either side of the direction of travel, launched from
   the forward contact line at about 0.9 of the entry speed and 65 to 75°
   from vertical, half as thick, which flares low ahead of the crown and
   tears into fine spray after 20 ms;
2. cavity (`src/cavity.js`): the stone opens a dark, air-filled hole in the
   water, its lip lifted around it and the stone at its bottom, sheared
   along an oblique stone's path. Each slice of water opens when the stone
   passes it and closes under the water's pressure (the Rayleigh–Besant
   picture: a(z, t) = R·√((1 − s)(1 + (1 + B)s)), s the slice's age over its
   lifetime), so the hole necks and pinches off about 2.1·√(R/g) after entry
   at about half the stone's depth then, closes from the neck up and closes
   at the surface 0.4·√(R/g) later. It is a closed form drawn as a mesh with
   the water's own shader, darkening with depth; the surface dips under its
   lip so it never shows through. For a 3 cm stone thrown at 6.3 m/s the
   mouth widens to 1.45 R, the hole pinches 6.2 R down at 116 ms and closes
   at 138 ms. Its splat launches the ring; an oblique entry drags it
   forward, so the ring runs stronger ahead than behind; its foam comes when
   the hole closes;
3. Worthington jet (`src/jet.js`): a glassy column fired up from where the
   hole closed, after an oblique entry leaning back along the stone's path (by half the entry
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
about 20 ms.

**Foam** (`FOAM_PATTERN` in `src/shaders/scene.js`, the map in
`src/spectralWater.js`). Where the stone's hole closes, its air erupts as a
boil: big bubbles, dense and white, popping within a second or two. What
remains is a raft of small bubbles, sparse and lasting seconds, longer the
bigger the stone (its lifetime τ is 3.2 s for the smallest, 5.4 s for a
16 cm stone); the jet rises from a boil of its own and leaves another boil
and raft where it falls back. Each is stamped as a patch of three to five
sub-stamps of unequal sizes at random offsets, never one round Gaussian, so
no two rafts share a shape. Surface flows carry the foam: where the hole
closed the jet's base wells up, and where the jet falls back the mound
spreads, each sweeping the foam out of a disc into a ring (keeping its
amount), so a raft turns ring-like or crescent-shaped, with arcs where the
flow stretched it, and the place the jet fell clears. The whole raft drifts
downwind at 3 cm/s, and its pattern and specks with it. The foam map says
where and how much, but its cells are over a centimetre wide, so the water
shader draws the raft from three layers of cellular noise: bubbles 2 to 3 mm
across packed together, larger ones of 3 to 7 mm among them, and a lace of
curved filaments around holes a few centimetres wide. The map's strength,
lumped at 3 and 14 cm strongly enough to show from a phone 4 m away, so
that a boil is mottled and a raft's edge broken rather than a round, even
white, sets the threshold they must pass. Where it is strong the raft is
nearly solid white, its bubbles shaded darker at their rims and catching the
sun; as it weakens the holes open, the filaments thin to strings of bubbles
and clumps, then only the biggest bubbles are left, so a raft thins from its
edge inward the way foam pops, and foam just over the threshold, a single
layer of bubbles, lets the water show through. A 4 cm stone's raft is gone
in about 6 s; a 16 cm stone's is patchy clusters by 4 s and scattered,
faint ones by 8.
The threshold's edge is one pixel wide at any distance (from the pattern's
exact gradient and the pixel's footprint on the water), and each layer fades
into an even white of the right strength before its cells shrink to a couple
of pixels, so distant foam neither shimmers nor goes grey. Only pixels with
foam compute the pattern. Foam specks (`src/foamSpecks.js`) are the bubbles
that drift out of the raft: 2 to 4 mm points riding the waves where the
crown stood, where the jet fell back, where drops landed and where bubbles
surfaced, drifting outward and popping over 2 to 8 seconds, faded out where
the raft is dense.

The splash scales with the stone (the slider's 1.5 to 16 cm is its
diameter; the constants were tuned at 3 cm radius). Wherever the physics
allows it scales as a Froude-similar splash does: lengths with the radius,
times with √(R/g), speeds with the entry speed. The crown's sheet is as thick
as the stone is big, so air and surface tension slow it less, it drains
slower and stands longer: a 16 cm stone's crown stands for 160 ms, its rim
17 cm high and 70 cm across, and tears into drops of up to 9 mm, while a
1.5 cm pebble's rises 4 cm. Its rim fingers as a decelerating rim does, so a
big crown has more fingers rather than a few huge petals: 24 on a 16 cm
stone's, 15 on a 6 cm one's, 12 on a 4 cm one's. A big
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

Everything the splash throws up is shaded as the same water as the pond
(`src/shaders/fluid.js`): Fresnel between the light it reflects (the sky,
or the pond below the horizon, with the sand under it and the sun's glitter)
and the light it lets through, absorbed by the pond's own coefficients over
the water crossed, and the sun's glitter with the pond's own model. The
crown sheet and the jet column are meshes and the droplets sphere impostors,
stretched along their motion as a camera's shutter would smear them, all
drawn into one buffer of depth, kind and exact normal and one of summed
thickness, coverage, sun glints and aeration; the composite pass shades
them and tone-maps the frame. The sheet is a clear film that barely bends
what is behind it, aerated (a faint white) only along its rim bead and torn
edges; the column is a lens that shows the pond and its glitter from well to
the side and, through its bulb, the sky upside down. A drop two device
pixels or wider is a glass bead, the pond in its top, the sky upside down
in its lower half, with two glints, the sun reflected off it and the sun
refracted through it (which makes a splash sparkle against the light),
each a point whatever the drop's size; a streak or a small bead shows the
drop's mean light. Drops under a pixel are a mist whose brightness follows
the water they really cover, so a lone fine drop all but vanishes. The
splash throws tens to a few hundred drops a stone (a 16 cm stone about 1500
over its life, at most about 700 in the air at once, most of them several
millimetres across), not thousands of specks. The water mirrors the splash:
while it lives, its sheets, columns and drops are drawn as cheap water into
the mirror image the pond reflects, over just the rectangle they cover, with
how far each is from the mirror's camera, so that the water looks a near
thing's reflection up where it is: the jet's reflection hangs under the jet
and only trembles with the ripples, where the sky's streaks with them.

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
submerged stones and bubbles are rendered to a texture with depth (at half
the canvas's resolution on Medium and Low), the stones and bubbles where the
still surface shows them, bent by refraction (a stone 10 cm down is seen a
third as far in front of the point above it as a straight line from the
camera puts it, and one on the floor half as far), the floor on the
straight line; the main
scene renders the sky dome and the water surface (with any open cavity, drawn
by the same shader), which refracts that texture
with absorption by path length through the water, reflects a planar mirror
image of the sky dome, clouds and treeline (the camera never moves, so it is
re-rendered only when the view zooms or turns; while a splash lives, it is
drawn into it each frame, over the rectangle it covers) in the direction each ripple
turns the view ray, so reflections wobble into vertical streaks (near
things, the splash's, by their distance, so they move far less), and adds
the sun's glitter: a Beckmann highlight on the rippled normal, widened by the
ripple finer than the pixel. Where there is foam it replaces the surface, a
diffuse white under the sun and the sky; the foam specks ride on it. The
splash's passes then draw its water over the scene and tone-map it; with no
water in the air the frame is only tone-mapped. The inner patch's mesh only
carries the displacement (the normals come from the height textures per
pixel), so it is coarser than the solver's grid.
Caustics on the sand come from the Laplacian of the surface height above,
splash and wind ripples both, so they drift with the ripples.
Stones are faceted procedural geometry with a small rigid-body model: a
ballistic arc, quadratic drag under water, and a settle into the sand.

## Development

- `npm test` runs `tools/fft-test.mjs`, `tools/wave-probe.mjs`,
  `tools/foam-probe.mjs` and `tools/cavity-probe.mjs`; each exits with 1 if a
  check fails.
- `node tools/fft-test.mjs` checks the splash solver's spectral passes on the
  CPU with the shaders' arithmetic: the FFT against a naive DFT, a splat's
  spectrum against its Gaussian, the Nyquist bins (splats at fractional
  centres make real fields, with no velocity in the height or height in the
  velocity), and the half-float path: the smallest stone's ring survives with
  every stored value rounded to binary16, subnormals kept or flushed to zero,
  and fields well beyond the largest a splash makes fit in it.
- Deployment: `.github/workflows/deploy.yml` runs the tests and `npm run site`
  on every push to `main` and publishes `_site/` to GitHub Pages. `npm run site`
  (`tools/build-site.mjs`) copies only what the page loads: `index.html`,
  `src/` and `assets/`. A new file or folder loaded at run time outside those
  must be added to its list. `node tools/site-check.mjs`, after
  `npm run site`, serves `_site/` under `/IntoTheWater/` as Pages does and
  checks that the pond starts and no request fails.
- `node tools/foam-probe.mjs` runs the foam's bubble pattern on the CPU, with
  the constants read from the shader: each layer's median and spread and the
  bubbles' mean shade match what the shader fades them to, and at the home,
  phone and close-up framings the antialiased pattern covers what a
  supersampled one does and changes no more than it when the water moves
  under the pixels; it prints the cell visits per foam pixel. Then it runs
  the foam map's step with the shader's arithmetic: a surface flow keeps the
  amount to a few per cent and brightens nothing, clears its core, carries a
  raft out to where a source of its area would and leaves a clean hole; the
  wind's drift moves a raft at its speed without widening it (bilinear
  samples, printed for comparison, would blur both); and a boil over a raft
  leaves the raft its own lifetime.
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
- `?profile=1` on a real device runs the profiling steps of `src/profiler.js`.
  It first measures the floor: frames that neither simulate nor draw, which
  shows what the browser allows (33 ms there means a 30 Hz cap, as iOS Low
  Power Mode sets). Then, on the still pond and through a splash replayed
  from the same seeded throw at 1/60 s per frame, it switches parts of the
  frame off one at a time (the floor pass, the water surface, the wind
  waves, the solver's sleep, three quarters of the pixels; the droplet
  passes, the mirror pass, the cavity, the solver), each between two
  measurements with everything on, and prints for each the median interval
  between frames (unclamped; the mean in brackets, since the median moves in
  whole display frames), its change against the baselines around it, and
  the JS milliseconds spent in simulate and in render, with draw calls and
  triangles, then the render targets' memory, in the corner readout and
  the console. Frame rates measured headless mean nothing, and phones have
  no GPU timer, so this is how the cost of each part is found on a phone.
  `&quality=` fixes the preset (medium otherwise). `node tools/profile-probe.mjs`
  runs it headless and checks the report's shape.
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
- `node tools/cavity-probe.mjs [diameter-in-cm ...] [--aim=x:z]` throws and
  drops each stone (1.5, 4, 6, 8 and 16 cm) and runs its cavity on the CPU:
  the timeline (the pinch-off's time and depth, the closure, the jet's start),
  the mouth, the lip and the depth over time, and the cost of a frame's mesh;
  it checks that the cavity follows the stone `src/rock.js` moves, that the
  pinch and the closure come when they should, that the cone the surface dips
  into holds the whole hole and the lip covers where it dips, that the
  normals face the air and that the crown stands on the lip, and exits with 1
  if not.
- `node tools/fan-probe.mjs [radius] [entrySpeed] [horizontalFraction]` runs
  the forward fan of an oblique entry on the CPU and prints its timeline,
  its drops, where they land and its cost per frame.
- `node tools/quality-probe.mjs` runs the page unpaused at phone size with
  automatic quality, waits for the idle and first-splash measurements, and
  checks the preset steps down when the frame rate is low, that the readout
  and the quality buttons follow and that the first throw compiles no
  program. After every change of preset, from each to each other, it checks
  what is actually built (`window.__pond.budget`): the solver's grid, the
  water mesh, the canvas and every target's size; a change in the middle of
  a splash must keep the waves; and pausing and resuming twice in one tick
  must leave one frame loop. On a fake clock it checks that the watch after
  calibration steps down at 20 frames a second and that a still pond on
  Medium draws every other frame with its time keeping up; and that a large
  window keeps within the pixel budget.
- `node tools/zoom-probe.mjs [--w=390 --h=844]` drives the wheel, a pinch, a
  tap and Escape through the page's own handlers and checks that what is under
  the pointer stays there.
- `node tools/controls-probe.mjs [--root=path] [--label=name]` loads the page
  as phones' browsers do (mobile layout by the viewport tag, touch, 3× pixels)
  at a large phone's portrait and landscape and a small phone's portrait, and
  in a desktop window, and checks that the page is laid out at the device's
  width, every control is on the screen, the strip covers at most 30% of the
  height, the stone slider is 44 points tall (and most of the width in
  portrait) and every button 34, and that a tap or a drag anywhere along the
  slider sets the stone; it saves each screen to `shots/controls-probe/`. The
  shoot harness and the other probes emulate a desktop browser, which ignores
  the viewport tag, so only this probe sees the page as a phone does.
- `window.__pond` exposes the app in the console: `throwAt(x, z, { radius, power })`,
  `setTimeScale` (and `timeScale`), `pause()`, `advance(seconds)` (in the frames the app would
  draw at the current time scale), `setDebugView(name)`, `setFov(degrees)`,
  `lookAt(x, y, z)`, `resetView()`, and `budget`: what the preset built (the
  solver's grid, the mesh, the pixel ratio, every target's size, an estimate
  of the render targets' memory, the programs compiled and the warm-up's,
  whether the solver sleeps and the frame rate is capped).

Install the development dependencies with `npm install` (Three.js is only
needed locally for the headless harness, which serves it instead of the CDN).

## Credits

The sky panorama is *Meadow 2* by Sergej Majboroda, from
[Poly Haven](https://polyhaven.com), CC0.
