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
the stone size, the throw strength and slow motion. The menu button at the
top right opens the settings, laid out as the Moon app's menu is (a list,
each setting a page of its choices with a line on each), and each choice is
remembered on the device:
- Water: how clear it is. Clear, a spring's, where the sand shows far out
  and each ring throws rings of light on it; Pond, the default, a clean
  pond's, where the sand shows near the bank and fades out by where the
  stones land; Murky, a lake after rain.
- Sky: Meadow (the default), Lakeside, Sunrise, Alpine or Open sky. The
  photo (about 6 MB) loads while the old sky stays; then the sky, the sun's
  direction and colour and everything they light change at once.
- Wind: Calm (the default, a still day), Breeze or Windy.
- Quality: Auto, Low, Medium or High.
Auto starts on High everywhere and steps down by itself if the idle
pond or the first splash renders too slowly, and later whenever the frame
rate stays under 25 for a few seconds (the readout in the corner shows the
frame rate and the preset in use); a preset fixes it. A preset sets
the work a frame does: High runs the 512² solver, a 254-segment water mesh
and full-resolution targets; Medium and Low a 256² solver, 160 and 128
segments, the under-water view and the mirror image at half resolution and
the splash's buffers at half, and draw a pond where nothing happens at 30
frames a second; High keeps 10 stones' rings, Medium 8 and Low 6. The
canvas never holds more than 2.6 million pixels.
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
returns the height and vertical velocity for rendering. It holds the near
field: the drops' landings and the jet's mound and base; the ring a stone
sends across the pond is the rings' (below), so the patch's damping, about
ten times a real pond's, only has to outlast that near field before its waves
come round the periodic patch. A foam map rides
along: how much foam each cell holds, of two kinds that last very
differently (a boil and a raft, below), and how long each lasts; stamped by
the splash, carried outward by its surface flows and downwind by the breeze,
spreading a little and decaying. A change of quality carries the
waves and the foam to the new grid. When nothing has disturbed the water for
75 s (more than the time the biggest splash's longest waves, which the
solver damps least, take to fade below a pixel's notice) and nothing of the
splash is left, the solver sleeps: it clears its textures once and runs no
passes until the next splat.

**Rings** (`src/rings.js`). The ring a stone sends out crosses the whole
pond as a real pond's would, a widening train of crests that outruns its
short ripples. Its source is a downward push released just after the stone
goes in (an oblique entry's pushes down its path, and the heights that run
it forward, included), fitted to a reference simulation of the splash
(`tools/basilisk/`: a 6 cm stone going in straight at 6.3 m/s, its ring
followed on linearly from 1 s): with the simulation's damping its height
from trough to crest is within 7% of the simulation's from 0.5 to 2 m
(9 mm at 1 m, 4.5 mm at 2 m), its highest crest passes when the
simulation's does (2.7 s at 1 m, 5 s at 2 m) and its waves are as long
(36 to 46 cm). It scales with the stone as the splash does (lengths with
its radius, times with √(R/g), the push with the entry speed: one
reference throw, so an assumption). The jet's fall-back adds no ring of
its own: the simulated ring holds its share. It is evolved exactly by
linear theory, outside the solver:

    η(r, t) = ∫ k dk J0(kr) e^{−γ(k)t} [Ĥ(k) cos ωt + V̂(k) sin(ωt)/ω]

with the solver's dispersion ω(k), Ĥ and V̂ the Hankel transforms of its
splats (so near the stone it is what the solver would draw: they agree to
under 3% over the first 2 m and 2 s), and γ(k) a pond's damping: natural
water carries a surface film, which pins the surface and damps a wave by
k·√(νω/8) per second (Lamb; van Dorn), 0.03/s for 30 cm waves where the
solver damps 0.3/s (the ring comes out 3 to 9% under the clean
simulation's at 0.5 to 2 m). An oblique entry's ring is a symmetric part
and a cos θ part, so it runs stronger ahead (1.3 to 1.5 times). Near the
stone, while the splash stands, linear theory would dig the hole's bowl
under the drawn cavity and jet, so there the ring fades in over about its
first second. While any ring lives, a GPU pass evaluates each ring's
spectrum at the frame's time and one pass per ring sums it into a radial
profile of height and slope out to its reach (2 to 40 m), mipmapped; the
water adds every ring's slope to its normal everywhere and its height to
the inner patch, the floor its curvature to the caustics, the foam specks
and a crown's foot ride it. A ring costs a pixel only between the water it
has left and its leading waves, and its passes sum only the waves the film
has not yet damped. A ring retires once no slope of it is steeper than
1e-4 as the view's pixels can show it (each averages it over its own
footprint), under a third of a pixel's turn of the mirror image: the
reference stone's after about a minute and a half, by then 35 m out; a
1.5 cm pebble's after 50 s. At most 10 rings live on High (8 on Medium, 6
on Low); a newer one makes the faintest fade out over 1.5 s. With no ring
alive there is no pass and no cost per pixel. `RING_SOURCE.strength`
scales every ring source (1: as fitted).

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
quarter of it, which also hides the tile's repetition. The Wind control
scales the whole field by one factor (its slope variance below a pixel by
the square) and the foam's drift with it: Calm 0.3, a glassy pond with faint
cat's paws, on which a stone's rings read far; Breeze 1, the look the pond
had before the control; Windy 1.8.

**Splash** (`src/splash.js`). A stone entering water goes through stages with
known timing, and the droplets are choreographed from them:

1. crown (`src/crown.js`): a thin sheet rising from the lip of the stone's
   cavity (2.), biased forward. It is water launched from the ring over a few
   milliseconds, each element then flying on its own, slowed by surface
   tension and air, so the whole sheet is a closed form in launch time,
   azimuth and time: a tall, nearly upright wall that stands on the lip and
   leans in, 11 cm high at 90 ms for a 3 cm stone dropped straight in at
   6.3 m/s (the reference simulation's: 11 to 12 cm at 0.1 s, below). Its rim
   thickens into a bead and grows fingers: narrow rods of water between
   shallow arcs of rim, each ending in a round bead that swells, pinches off
   as a drop as big as the rim is thick, and starts again; once its rim stalls
   (about 90 ms for a 3 cm stone) the sheet tears, the arcs first and the
   fingers last, from the rim down into drops that carry its velocity. A
   thrown stone enters obliquely (about 40
   to 55° from vertical), and then a fan comes first: the same sheet model
   over a sector 60° either side of the direction of travel, launched from
   the forward contact line at about 0.9 of the entry speed and 65 to 75°
   from vertical, half as thick, which flares low ahead of the crown and
   tears into fine spray after 20 ms;
2. cavity (`src/cavity.js`): the stone opens a dark, air-filled hole in the
   water, its lip lifted around it and the stone at its bottom, sheared
   along an oblique stone's path. Each slice of water opens when the stone
   passes it and closes under the water's pressure (the Rayleigh–Besant
   picture: a(z, t) = R·√(1 + B·s − (1 + B)·s⁴), s the slice's age over its
   lifetime), so the hole is a wide funnel that necks and pinches off about
   2.06·√(R/g) after entry, about 7.5 R down for a 3 cm stone dropped straight
   in at 6.3 m/s; the bowl above the neck stays open and fills from below,
   and has flattened into the surface about √(z/g) after the pinch, z its
   depth (a deep seal; some throws seal shallower or at the surface, below).
   While the hole is open the water's head presses on the stone's front, as
   well as its drag, and nothing buoys it. It is a closed form drawn as a mesh with
   the water's own shader, darkening with depth; the surface dips under its
   lip so it never shows through. A stone is no ball: each slice opens to the
   outline the stone had as it passed, turning as it tumbles, with a bulge and
   lobes from its lumps, so an irregular stone's hole is oval, lopsided and
   wobbles with depth, and closes off-centre, towards its bulge. For a 3 cm
   stone thrown at 6.3 m/s the mouth widens to 3.6 R, and sealing deep the
   hole pinches about 6 R down at about 115 ms and its bowl has flattened by
   about 240 ms. The ring (Rings, above) is a push released just after entry,
   fitted to the reference simulation's; an oblique entry drags it forward,
   so the ring runs stronger ahead than behind; its foam comes when the bowl
   has flattened;
3. Worthington jet (`src/jet.js`): a glassy column fired up the axis from
   the bowl's floor at the pinch-off, after an oblique entry leaning back
   along the stone's path (by 0.4 of the entry angle, at most 18°) and a
   little slower. It is water launched from a point that rises with the
   bowl's floor, fastest first: a thin needle at up to three times the body's
   speed, the body, and a broad slow base that the bowl's collapse builds,
   each element then flying ballistically, so the column is a closed form in
   launch time, azimuth and time; it stretches as it rises, its radius set by
   volume conservation, widest at the base. A bulb at its tip pinches off
   into drops, none to four of them, with satellites, then the column breaks
   from the top down into drops about twice its local radius, a piece every
   capillary time of the column, as a Rayleigh–Plateau instability does,
   growing uneven varicose beads before it parts; its slow base falls back
   into a mound (its ring is part of the stone's). For a 3 cm stone dropped
   straight in at 6.3 m/s the needle clears the surface 131 ms after entry at
   14 m/s, its first tip drop 3 mm in radius, and the column is 6 cm across
   at the water at 0.25 s and stands 60 to 70 cm tall at half a second
   (the reference simulation: 118 ms, 13 to 16 m/s, 2.4 mm, 5 cm, and an
   unbroken 81 cm, an upper bound); thrown at 42° a clean jet stands 25 to
   45 cm, its tip drops flying higher, but each throw's jet has a form of its
   own (below);
4. bubbles that follow the stone down its path, rise and burst into foam.

Drops ring the water where they land, and the big ones (the jet's, and the
crown's largest) throw a small crown of their own, the classic drop-impact
crown: the same sheet model with the drop's radius and speed, standing for
about 20 ms.

No two throws splash alike, as no two stones go in alike. Each stone
(`src/rock.js`) is its own faceted lump, and it reports at impact its shape
(elongation and flatness from the principal axes of its solid, and how lumpy
it is), what touched the water first (a flat face, an edge or a point, and
how blunt it was there) and its spin (rate, axis, and ω·R/V); a tilted flat
stone or a lumpy, spinning one is pushed sideways as it goes in, so its path
curves a little. From these, the throw's size, speed and angle and a random
stream seeded by the stone, the splash chooses (`chooseSplash` in
`src/splash.js`): how the hole seals (deep; shallow for a flat face going in
first; at the surface, the crown pulled shut over the hole into a low glassy
dome, when the entry's Froude number V²/(g·R) passes Birkhoff and Isaacs'
108, less readily the more oblique the entry and the more irregular the
stone), how lopsided it is, how the crown leans (a spinning stone drags
water up on one side), and the jet's form: clean (none to four tip drops of
varying size), leaning towards the hole's bulge and whipping, ragged (the
column comes apart early from the top into irregular drops and spray),
stubby (short and fat: big stones, flat entries, shallow seals), split in two
(rare), or none at all (after a surface seal: only a low glassy mound
heaves up and subsides). For the default 6 cm stone
thrown normally about one throw in ten seals at the surface, four jets in
ten are clean, a fifth to a quarter ragged, one in six leans, one in eight
is stubby and a few split or never rise; a 1.5 cm pebble nearly always seals
at the surface, a 16 cm stone almost never, and its jets are mostly stubby
(`tools/variety-probe.mjs` prints the distributions).

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
downwind at 3 cm/s in a breeze (with the wind's strength), and its pattern
and specks with it. The foam map says
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
25 to 40 cm high, and tears into drops of up to 9 mm, while a 1.5 cm
pebble's rises 5 cm when it seals deep (it nearly always seals at the
surface instead, under a dome 1 cm high). Its rim fingers as a decelerating rim does, so a
big crown has more fingers rather than a few huge petals: 24 on a 16 cm
stone's, 15 on a 6 cm one's, 12 on a 4 cm one's. A big
stone's jet is fat (its Froude number is lower, so the cavity's collapse is
less singular) and breaks up slowly (a column's capillary time grows as its
radius to the 1.5): a 16 cm stone's is 10 to 20 cm across at the water,
rises 20 to 50 cm and mostly falls back as a column. Drop counts grow faster than the stone's area
and drop sizes as √R, so a big splash is both denser and coarser; the foam it
leaves covers the cavity's mouth and is denser. Its ring, longer and
higher (as √R), crosses the whole pond (Rings, above): 1 m ahead of a
16 cm stone thrown normally it is 4.5 cm from trough to crest, ahead of a
6 cm one 1.2 cm, of a 1.5 cm pebble 1 mm. The stone starts the splash the moment its lowest point
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
(a meadow with trees by default, or one of four others) on a dome at the far
plane, turned about the vertical (and mirrored, where that puts better
scenery ahead) so that its sun stands where the scene's does (28° right of
straight ahead) and at the photo's own elevation, which becomes the scene's
(27° for the meadow, 5° at sunrise, 50° in the Alps). Its brightness is
anchored on the sun: `tools/sky-probe.mjs` measures the photo's sun
irradiance and sky radiance, and the dome is scaled so that its sun matches
the scene's (times π, the scene's convention for diffuse light), so the
photo's own balance of sky and sun carries over, and the sky's mean radiance
becomes the ambient light of the foam and the sand. The sun keeps one
brightness under every sky and takes the colour of the photo's sun against
the meadow's, so it is orange at sunrise. The sun's light reaches
the scene through the directional light and the analytic highlights, so the
dome's radiance is capped at 30 times the mean sky. The water reaches 3 km,
far enough to meet the dome's horizon with no strip of the photo's ground
between them, so the photo's treeline stands on the far shore. The dome and
a water-coloured lower hemisphere are captured into a cube map that the
droplets reflect, and a prefiltered copy lights the stones; another sky is
captured into the same maps, in the frame it arrives.

**Rendering** (`src/main.js`, `src/shaders/`). Each frame: the floor,
submerged stones and bubbles are rendered to a texture with depth (at half
the canvas's resolution on Medium and Low), the stones and bubbles where the
still surface shows them, bent by refraction (a stone 10 cm down is seen a
third as far in front of the point above it as a straight line from the
camera puts it, and one on the floor half as far), the floor on the
straight line; the main
scene renders the sky dome and the water surface (with any open cavity, drawn
by the same shader), which refracts that texture,
fading it by path length through the water (absorbed and scattered, about as
clear as a clean pond's: the sand shows near the bank and is gone about 9 m
out) into the water's own green, reflects a planar mirror
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
splash, wind ripples and rings together, so they drift with the ripples and a
ring throws a ring of light on the sand. They are placed as the water's
refraction places them: each floor pixel takes them at the floor point the
eye really sees through the still surface (the floor itself is drawn on
the straight line), lit by the sun refracted into the water, so a ring's
caustic lies 0.7 m down-sun of it on the sand. How strongly the surface
focuses the light follows Snell's law for the sun's height (three times
what a sun overhead would give), so a crest draws a thin bright line where
its focus meets the sand, eased into 0.65 to 1.6 times the sun's own light
(`src/pondFloor.js`).
Stones are faceted procedural geometry with a small rigid-body model: a
ballistic arc, quadratic drag under water, and a settle into the sand.

## Development

- `npm test` runs `tools/fft-test.mjs`, `tools/wave-probe.mjs`,
  `tools/foam-probe.mjs`, `tools/cavity-probe.mjs` and `tools/ring-probe.mjs`;
  each exits with 1 if a check fails.
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
  the roughness each mip level hands the glitter matches a measurement; that
  each of the Wind control's strengths scales the field, its roughness and
  the foam's drift as it should, and Breeze restores them exactly; it prints
  the cost of a frame.
- `node tools/ring-probe.mjs [--all] [--gpu[=half]]` checks the rings
  (`src/rings.js`) on the CPU: an isolated ring source evolved by the
  solver's own lattice, injection, dispersion and damping against the rings'
  Hankel integral and their sampled scheme (they agree to under 3% over 2 m
  and 2 s); every ring source a splash makes, made as the app makes them,
  with its sampling and its retirement (the exact steepest slope when it
  retires is under the visible bound, so no ring vanishes while it shows,
  and when it retires by the home view on a desktop and a phone, no pixel of
  them shows it steeper than that either; the drawn profile, with its
  annulus, the wavenumbers it sums and its near field, matches the exact one
  over its reach), and an oblique ring's lead ahead; the reference vertical
  drop's ring at 0.5, 0.75, 1, 1.5 and 2 m against the reference
  simulation's (`tools/basilisk/results/rings_linear.md`: within 15% at 0.75
  to 2 m with the same damping, the crest's time within 5% and its
  wavelength within 15%); and the cost of a frame (each pass's fetches over
  a ring's life; a minute of throwing at each quality preset's limit of
  rings: how many live, the profile passes' fetches, the lookups of the
  water's and the floor's pixels; the CPU's). `--gpu` reads the rings'
  spectrum and profiles back from a headless page against the same sums in
  float64 (`--gpu=half` on the half-float path); `--all` runs every stone
  size.
- `npm run shoot -- --label=name --throws=x:z:radius --times=0.1,0.5` renders
  deterministic frames headlessly (Playwright + Chromium) into `shots/name/`,
  at exact times after the first impact.
  Options: `--fov`, `--look=x:y:z`, `--preimpact=seconds`, `--ui=1`,
  `--debug=under|height|foam|env|face|ambient`, `--eval="js"`, `--w --h --dpr`,
  `--crop=x:y:w:h --cropscale=n` (an enlarged crop of each frame),
  `--report="js"` (printed after each frame), `--floats=half`,
  `--seed=n` (Math.random seeded from n + i just before throw i, so the
  stone and its splash are the same every run: `tools/variety-probe.mjs`'s
  seed n + i),
  `--power=soft|normal|hard` (soft is a higher arc, so a steeper entry,
  about 30° from vertical), `--wind-strength=calm|breeze|windy` (the page's
  own default is calm). With
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
  `?windStrength=calm|breeze|windy` (`--wind-strength=` for the harness)
  sets its strength, over the one the Wind setting last chose on the device
  (kept in `localStorage`); calm otherwise.
- `?sky=name` on the page (`--sky=name` for the harness) picks the sky
  panorama, a key of `SKIES` in `src/sky.js`, over the one last chosen on
  the device; `?water=clear|pond|murky` (`--water=` for the harness) the
  water's clarity, `WATER_CLARITIES` in `src/main.js`.
- `node tools/sky-probe.mjs assets/sky/name_2k.hdr [--png=preview.png]`
  measures a sky panorama (the sun's direction, the sun's irradiance, the
  sky's mean radiance, the horizon's) and writes `assets/sky/name.json`,
  which `src/sky.js` reads; `--png` also writes a tone-mapped preview with the
  sun marked. A new panorama needs this run once.
- `node tools/jet-probe.mjs [radius] [entrySpeed] [profileTime] [horizontalFraction]`
  runs one Worthington jet of the default (clean) form on the CPU over the
  bowl its stone's cavity leaves and prints its timeline (the needle clearing
  the surface, the tip drops, the breakup, the fall-back), its profile at the
  given time after entry, its drops, volume budget, when its big drops land,
  whether its normals face outward and its cost per frame; a horizontal
  fraction makes it the leaning jet of an oblique entry.
- `node tools/variety-probe.mjs [throws=200] [--seed=1] [--aim=x:z] [--sets=default|all|grid] [--list]`
  throws stones as the app does (seed n is the shoot harness's seeded throw n
  at the same aim and power) and prints how their splashes vary: the stones'
  shapes, contacts and spins; how often each jet form and seal comes up (with
  the surface seal's chance); the
  jets' tops, tip drops and lean, the holes' lopsidedness and the crowns'
  heights, by form (a jet's top is its column's or its tip drops' highest,
  flown with the splash's drag); and the cost per frame, for the default stone thrown
  normally, softly and hard and for a 16 cm stone and a pebble
  (`--sets=default` leaves out the last two; `--sets=grid` runs every size of
  the slider at every power). `--list`
  prints each throw of the first set. It checks that no default throw at
  normal power is all but invisible, that hardly any lacks a jet, and that
  they are not alike: at least four forms each a twentieth of the time and
  none over three fifths, the jets' tops spread by at least 0.3 of their
  mean, the tip drops taking at least three counts and the lean spread by
  at least 5°.
- `node tools/splash-probe.mjs [radius ...] [--aim=x:z] [--power=name] [--vertical]`
  throws stones as the app does and runs their whole splash on the CPU: for
  each size the crown's height, reach and life, the jet's form and seal (the
  stones are not seeded, so these change from run to run), its top and
  width, the drops by source and at most alive, the cavity, the foam, the ring the pond
  makes of it at 0.5, 1 and 2 m (the solver's own dispersion and damping),
  and the CPU cost per frame. Without radii it runs the slider's 1.5, 4, 8
  and 16 cm and the 3 cm-radius reference.
- `node tools/cavity-probe.mjs [diameter-in-cm ...] [--aim=x:z] [--seed=n] [--variety=n]` throws and
  drops each stone (1.5, 4, 6, 8 and 16 cm) and runs its cavity on the CPU:
  the timeline (the pinch-off's time and depth, the jet's start, the bowl's
  floor as it rises and when it has flattened), the mouth, the lip and the
  depth over time, and the cost of a frame's mesh; it checks that the cavity
  follows the stone `src/rock.js` moves, that the pinch comes when the
  throw's seal says, the jet with it, that the bowl's floor only rises and
  reaches the surface when the hole is gone, that
  the cone the surface dips into holds the whole hole and the lip covers
  where it dips, that the normals face the air and that the crown stands on
  the lip; then it does the same for `--variety` (24) more throws of each
  size at random aims and powers, every one a stone and a hole of its own,
  and exits with 1 if any check fails.
- `node tools/fan-probe.mjs [radius] [entrySpeed] [horizontalFraction]` runs
  the forward fan of an oblique entry on the CPU and prints its timeline,
  its drops, where they land and its cost per frame.
- `node tools/quality-probe.mjs` runs the page unpaused at phone size with
  automatic quality, waits for the idle and first-splash measurements, and
  checks the preset steps down when the frame rate is low, that the readout
  and the settings' Quality page follow and that the first throw compiles no
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
  at a large phone's portrait and landscape and a small phone's portrait and
  landscape, and in a desktop window, and checks that the page is laid out at the device's
  width, every control is on the screen, the strip covers at most 30% of the
  height, the stone slider is 44 points tall (and most of the width in
  portrait) and every button 34, and that a tap or a drag anywhere along the
  slider sets the stone; it saves each screen to `shots/controls-probe/`. The
  shoot harness and the other probes emulate a desktop browser, which ignores
  the viewport tag, so only this probe sees the page as a phone does.
- `window.__pond` exposes the app in the console: `throwAt(x, z, { radius, power })`,
  `setTimeScale` (and `timeScale`), `pause()`, `advance(seconds)` (in the frames the app would
  draw at the current time scale), `setDebugView(name)`, `setFov(degrees)`,
  `lookAt(x, y, z)`, `resetView()`, `setWind(name)` (and `wind`: calm,
  breeze or windy, remembered on the device), `rings` (the live rings and
  their plans), and `budget`: what the preset built (the solver's grid, the
  mesh, the pixel ratio, every target's size, an estimate of the render
  targets' memory, the programs compiled and the warm-up's, whether the
  solver sleeps and the frame rate is capped, the rings drawn, how many
  are fading out and the preset's limit, their passes and the spectrum
  fetches those made, the wind).

Install the development dependencies with `npm install` (Three.js is only
needed locally for the headless harness, which serves it instead of the CDN).

## Credits

The sky panoramas are from [Poly Haven](https://polyhaven.com), CC0:
*Meadow 2* by Sergej Majboroda; *Lakeside* by Greg Zaal; *Lakeside Sunrise*
by Greg Zaal, processed by Jarod Guest; *Lago d'Isola* by Andreas Mischok;
and *Kloofendal 48d Partly Cloudy (Pure Sky)* by Greg Zaal, its sky edited by
Jarod Guest.
