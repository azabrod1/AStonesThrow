# A Stone’s Throw

Throw rocks into a lake, or a tiled pool, and watch the splash. A WebGL toy
built with Three.js: the water is a real wave solver, the splash is
choreographed from the physics of a stone entering water, and the droplets
are rendered as water.

Live at https://azabrod1.github.io/AStonesThrow/, published from `main` by
GitHub Pages on every push. Locally, open `index.html` through any static
server (`npm start`, then http://localhost:8123/). Development loads Three.js
from a CDN; `npm run site` packages it alongside the published site.

Tap or click to throw a rock there, even when tapping an existing object
(beyond the simulated patch, at its nearest point). Hold an existing object
you can see still for a quarter of a second to pick it up: a ring under it
marks where it will come down, it follows your drag (leaving a wake through
the water), and drops from rest when released. Moving before the hold activates
turns the view instead. Escape cancels a grab and drops the object. Space
throws one at random; the rocks are always thrown from the shore. Press
and hold still on empty water for a moment and a hand dips
into the water there instead: drag to trail it through, leaving a wake, and
let go to lift it out (`src/touch.js`). Drag the water to walk the view round the pond and
up or down (from just above the water to nearly straight down), and scroll
or pinch to zoom toward what is under the pointer (down to an 8° field of
view); a drag that starts zoomed turns round what the view is looking at.
Escape or Reset view (under the menu button while the view is away from
the shore's) glides back to the shore. The strip at the bottom sets what is
thrown: its name opens a dropdown of every thing under its group, each with
its picture (`src/thingMenu.js`), and its slider sets the size (a stone 1.5
to 30 cm across, a bowling ball 6 to 16 lb, a basketball size 5 to 7, a gem
5 to 1000 carats; a golf or a tennis ball has one size). Then how it is
thrown, in two parts: the manner, Toss (the low way round), Lob (the high
way) or Skip, and the strength, Soft, Medium or Hard, which is the pace
either way (`ARC` in `src/main.js`: a toss flies flatter the harder it is
thrown, a lob higher; a hard toss is let go fast on the low arc and goes in
about twice as fast, with a far bigger splash: below; the medium toss is
the throw the splash is tuned to). Then the slow-motion clock, each press
the next rate round (1×, ¼×, ⅒× real time), lit while slow; then the throw
button, the strip's one lit control. With Skip, a flat stone (or a pizza,
spun like a frisbee) is thrown low and level, spinning, at the strength's
speed, and skips across the water (below), in the direction of the tap
(even on the sky); its first touch lands where a level throw puts it. Skip
is greyed out for what cannot skip, and choosing such a thing goes back to
Toss. On a phone in portrait, where the title's line is hidden, a cue over
the water says to tap it, until the first throw. The menu button at the
top right opens the settings, laid out as the Moon app's menu is: a list in
four groups (what is thrown: What to throw; the place: Location, Water and Time of
day; the conditions: Weather, Wind and Sound; the viewing: View and Quality), each row an icon, its name
over a line on what it sets and where it stands, and each setting a page of
its choices (Location and Water as pictures) with a line on each. Each choice
is remembered on the device (but the view, which opens on the shore):
- What to throw (`?thing=`): stones (a river stone, the default; slate,
  granite, basalt, pumice), balls (golf, tennis, bowling, basketball), gems
  (diamond, emerald, ruby, sapphire) and others (an apple, a watermelon, a
  pizza, a frozen pizza, a pie, a rubber duck, a brick), each the size, weight
  and density of the real thing (`src/things.js`). The foot of the strip's
  dropdown opens this page. What is lighter than water floats; the rest sink.
  What comes to rest stays, on the bed or the pool's floor as on the deck, up
  to the quality preset's count (below); past it the oldest shrinks away.
  A pizza comes with
  a recipe's toppings drawn at random (Margherita, Pepperoni, Funghi,
  Hawaiian, Vegetariana, Diavola, Capricciosa), slaps the water flat, floats
  draped over the waves, soaks and, waterlogged after two or three minutes,
  sinks; a frozen one thaws first, its frost fading, and only then goes soft
  and soaks. A pie's filling is drawn at random too: apple and pumpkin float
  low, cherry and blueberry sink. Plates use the same direction-aware water
  forces while entering, floating and sinking: their face takes the drag and
  carries water, their edge meets skin and rim drag, and under the water the
  flow turns them broadside (at the surface they plane, and float level). A
  pie's weight sits a little low in it, so under the water it turns back
  right way up.
  Wetting progressively slows the face rather than instantly stopping it;
  plates make spray and rings without a sphere-shaped cavity. Wetting uses
  submerged volume as a proxy for wetted face area; ventilation and a resolved
  free surface are not modelled. Toppings still add mass without displacement,
  and the frozen pizza retains its existing lighter mass presets. These are
  approximations, not material measurements. A weighted rubber duck rights
  itself however it lands. Each choice's picture
  (`assets/things/thumbs/`) is a harness frame of it at rest on the pool's
  deck, shrunk to 160×90: `--sky=pool --thing=name
  --throws=-1.75:0.75:0.05 --times=3 --seed=1 --w=320 --h=180`, looked at
  where it rests (`--report` says) with `--look=x:y:z` and a `--fov` that
  frames it (a duck 4°, a pie 8°, a pizza 9°).
- View: Shore, standing on the bank as the page opens; Low, down at the
  water, the splash against the far shore; High, from above, the rings
  spreading over the pond; Under, under the water, looking up at the rocks
  coming down through the sky's bright window, their air cavities silver
  mirrors, the sun's shafts slanting down. A choice glides there; a drag
  turns from it (under the water it stays under). In the pool, Shore stands
  on the deck at the pool's near corner looking down into it, Low just
  inside its near wall, and under the water the eye keeps inside its walls.
- Water (`?water=`): Clear, a spring's, bluer and clearer; Lake, the
  default, a clear Alpine lake's (bright sand in the shallows,
  turquoise-blue where it is deep); Pond, a green pond's; Murky, a lake
  after rain; or Frozen (below). In the Pool the lake's four give way to
  the pool's own filtered water. Each choice's
  picture (`assets/water/thumbs/`) is a harness frame shrunk to 160×90:
  `--water=name --throws=0:-1.4:0.03 --times=1.0 --seed=1
  --orbit=0:35:2.4:0:0:0.8`, which looks out from over the bank so the
  sand's fading shows each water's clarity (Frozen's at `--times=3`, its
  cracks and shards). The lake bed
  slopes down from the shore, 0.7 m deep at the bottom of the view to 1.7 m
  where the rocks land and 3.5 m far out, so the sand shows in the shallows
  and is gone where the rocks land, and with it the light a ring throws on
  it. Behind the waterline, just behind the shore view, a sand beach rises
  into a grassy bank that takes its colour from the sky photo's own land, so
  turned round, the view sees a shore rather than water to the horizon.
- Frozen (`?water=frozen`, or `?ice=thin|thick`; under the Water cards,
  Thin, 1 cm, the default, or Thick, 4 cm), over the lake's water last
  chosen or the pool's (below). What is thrown lands on it,
  bounces, slides far and rests, knocking into what already lies there; a
  stone, a brick or a bowling ball goes through thin ice, a light ball, a gem
  or a pebble does not, and only a big rock or a heavy ball lobbed high goes
  through thick ice, anywhere over the water, the pool's corners too. A
  break opens a jagged hole with cracks running out from it, more and longer
  the harder the blow, joined by rings of crack into a web, ending where
  they meet a crack already there, and the stone splashes in
  as into open water, without the crown, whose sheet would stand on ice. The
  broken ice comes up in the hole as floating shards, the water floods the
  ice round it and freezes glazed, and a hole left alone for 40 seconds
  freezes over again in half a minute, its shards frozen in, its new ice
  thin enough for the next throw to break.
- Location (`?sky=`): Swiss Alps, Rocky cove, Highlands, Desert oasis,
  Lakeside (the default), Mesas, or Pool. Swiss Alps replaces Alpine with a
  sharper 4K Lago d’Isola panorama, framed across its snowy ridge, and starts
  at water level with Frozen water (thin ice unless Thick was last chosen). Choosing liquid
  water is remembered when reloading the same place; entering Swiss Alps
  from another place reapplies Frozen. Entry from the untouched shore view
  moves to water level; a custom view stays put. Explicit `?water=`, `?ice=`
  and `?view=` win at startup.
  Meadow and Open sky are retired; their old links and saved settings open
  Lakeside, and `?sky=alpine` opens Swiss Alps. Pool is a tiled pool on a
  deck by Lakeside's lake, through its hours. A photo (0.2 to 0.8 MB, or 1.8 MB
  for Swiss Alps) loads while the old sky stays; then the sky, sun and
  everything they light change together. Older Pool-water and Ice settings
  carry over to the Pool location and Frozen water.
- Time of day: named buttons and a slider select each photographed hour:
  Lakeside's dawn, sunrise, afternoon and night; Mesas' twelve hours from
  dawn to moonlight; Highlands' dawn, sunrise, noon, sunset and dusk; Desert
  oasis' moonlight, golden hour and starlight. The land keeps still and the
  sun moves round it. By night the eye sees mostly as its rods do: a
  moonlit blue that keeps some of the photo's colour. Adjacent hours are
  fetched ahead while the Time page is open. A new choice cancels a pending
  download; another place takes the hour nearest the time last chosen.
  Swiss Alps and Rocky cove each have one photograph, so their time controls
  hide and explain the available light.
- Weather: Clear (the default), Light rain, Heavy rain, Storm, Light snow,
  Heavy snow or Blizzard. Rain comes under
  an overcast that hides the sun and greys the sky, with a haze that fades
  the far shore; its drops ring the water, streak past the eye and throw up
  flecks where they land, and the pool's deck goes dark with wet. A light
  rain's rings are fine and far apart; a downpour hammers the whole surface.
  Rain at night is dark: the cloud hides the moon. A storm is a downpour
  under a darker sky, with lightning, and brings a gale. Snow falls from a
  brighter overcast, its flakes drifting with the wind, swaying and melting
  on the water without a ring; a haze, whiter than rain's, hides the far
  shore; it lies on the beach, the bank and the pool's deck, in patches
  under a light snow and all over under a heavy one, except on the wet sand
  by the water and where a splash's drops come down. In its freezing air a
  frozen pizza thaws only in the water and wet things barely dry. A
  blizzard is fine snow driven by a gale. The seven are one list of cards,
  as the Water page's. Each choice's picture (`assets/weather/thumbs/`) is a
  harness frame shrunk to 160×90: `--weather=name --throws=none --times=2
  --seed=1 --w=320 --h=180 --orbit=120:15:2:0:0:2`, which looks along the
  beach so the sand, the water and the haze all show.
- Wind: Calm (the default, a still day), Breeze, Windy or Gale. A gale
  raises waves a third of a metre high out to the horizon, white-capped,
  with spray off the crests and foam in streaks along the wind; the stones
  and their splashes ride them, and the Low view's eye stands above them.
  The pool is too small for waves: there a gale only ripples hard.
- Quality: Auto, Low, Medium or High.
Auto starts on High everywhere and steps down by itself if the idle
pond or the first splash renders too slowly, and later whenever the frame
rate stays under 25 for a few seconds (the readout in the corner shows the
frame rate and the preset in use); a preset fixes it. A preset sets
the work a frame does: High runs the 512² solver, a 254-segment water mesh
and full-resolution targets; Medium and Low a 256² solver, 160 and 128
segments, the under-water view and the mirror image at half resolution and
the splash's buffers at half. Every preset draws a frame no sooner than
about 9.7 ms after the last (a sixtieth of a second, less some slack),
whatever the screen's refresh rate: a 60 or a 90 Hz screen draws every
refresh, a 120 Hz one every other, 60 frames a second (72 on a 144 Hz
one), and a pond where nothing happens at 30 frames a second; High keeps
24 stones' rings, Medium 12 and Low 10, 24 of the little rings the
splash's drops leave (16 and 12), a ring of 65 536 spray sprites,
Medium 16 384 drawing two fifths of High's and Low 8192 a fifth (each
sprite standing for that many more drops), and 40 things at rest (a stone on
the bottom is one draw call) and 16 afloat (a floater costs more: its
physics, its ride and its mirror image), Medium 30 and 14, Low 20 and 12;
up to 20 things may be on the move at once, on every preset. Past a count
the oldest of that kind shrinks away over 0.6 s, never vanishing at once.
The canvas never holds more than 2.6 million pixels.
Core stone/splash programs are compiled while the page loads, under its
veil: a stone is thrown and drawn there, then cleared away (with the water
Frozen, into open water first, then a second through a sheet made thin for
it, so the first break builds nothing, then the ice as chosen). Rain and gale
programs are warmed only when selected at startup; otherwise
they compile on first use, which can briefly pause that first interaction.
No background warm-up modifies the live scene. The final scene, including
remembered weather, is rendered before the veil lifts, even when paused.

The published site serves Three.js alongside its own files (`npm run site`
creates `_site/vendor/three`). Dependency failures offer Retry. Modules have a
30-second deadline; sky and rain transfers time out only after 30 seconds
without progress, so slow downloads can finish. Sky calibration and the panorama
load together, and a failed replacement leaves the current sky visible.
The published page preloads every module it imports (the site build lists the
whole import graph), so they download at once as the page is parsed, and it asks
for the first sky's photo from its head, before any module has run: the sky
shown last on the device, or on a first visit the default place's. The pond is
built and its programs compiled while the photo downloads. A remembered
rain downloads alongside the sky; failure offers Retry and Continue without
rain under the veil. Continuing selects and remembers Clear weather, renders
that scene, then enables input. Later rain failures offer Retry beside the weather controls,
and stale completions cannot overwrite a newer weather choice.

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
spectrum at the frame's time, a second sums it into radial profiles of
height and slope out to each ring's reach (2 to 40 m), every radius's sum
split into 16 slices of the wavenumbers that the GPU runs side by side,
and one pass per ring adds its slices into its profile, mipmapped: five
rings take about 0.17 ms of a frame on a desktop's GPU, where summing each
radius whole took 1.4 ms. The water adds every ring's slope to its normal everywhere and its height to
the inner patch, the floor the curvature of the youngest six to the
caustics (a ring's curvature falls fast as its waves lengthen; an older
one's light fades out over 3 s), the foam specks and a crown's foot ride
it. A ring costs a pixel only between the water it has left and its
leading waves, and its passes sum only the waves the film has not yet
damped. A ring retires once no slope of it is steeper than
1e-4 as the view's pixels can show it (each averages it over its own
footprint), under a third of a pixel's turn of the mirror image: the
reference stone's after about a minute and a half, by then 35 m out; a
1.5 cm pebble's after 50 s. At most 24 rings live on High (12 on Medium,
10 on Low); a newer one makes the one closest to retiring, the faintest as
a rule, fade out over 8 s on High, so slowly that nobody sees it go (4 s
on Medium and 3 s on Low, where a ring still fading costs what a live one
does). With no ring
alive there is no pass and no cost per pixel. `RING_SOURCE.strength`
scales every ring source (1: as fitted).

**The pool** (`src/pool.js`, `setPool` in `src/spectralWater.js`). The
Pool place puts the rocks in a 3 m square pool, 1.4 m deep, tiled, its
walls rising 10 cm out of the water to a stone coping and a paved deck in a
lawn. Its walls reflect the waves to every order, at no cost: the pool is
the middle quarter of the solver's 6 m periodic patch, and every splat goes
in with its mirror images across the walls, whose periodic sum is even about
every wall, which is what a wall that reflects does (the four images' phase
shifts multiply, two per axis, so a splat costs what it did; `tools/fft-test.mjs`
checks the field is the four Gaussians, stays even about every wall as it
evolves and is the open patch's field read at the point and its mirror
images). A ring's source therefore goes into the solver too, and the rings
draw only what its near field hides under the drawn splash, turned over and
for its first second or so, so the splash looks as it does on the lake. A
basin's waves cannot spread away, so the pool damps them less than the
lake's solver does but never less than 0.05/s, its walls and floor damping
even the longest: a 6 cm stone's rings run back and forth off the walls for
about a minute, and the solver sleeps 165 s after its last splat
(`tools/pool-probe.mjs` evolves the largest splash in the basin and checks
it is still by then). The basin is drawn under the water where the still
surface shows it (its floor looks shallower than it is and its tiles break
at the waterline, as in a real pool), lit as the lake bed is, through the
water with the ripples' caustics on the floor and the walls, and shaded by
the sunward walls; the water reflects the walls and the deck by their
distance, as it does the splash, so a ripple moves their image little, and
from under the water the surface mirrors the basin, met exactly. The grout
and the pavers' joints are box-filtered over each pixel's footprint, so
they grey evenly far off rather than shimmer.

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

**Things** (`src/things.js`, `src/thingMeshes.js`, `src/rock.js`,
`src/collide.js`). What can be thrown is a registry of plain, validated
definitions (`defineThing`); `__pond.defineThing(key, definition)` adds one.
`tools/thing-probe.mjs` checks them.

**Splash** (`src/splash.js`). A stone entering water goes through stages with
known timing, and the droplets are choreographed from them:

1. crown (`src/crown.js`): a thin sheet rising from the lip of the stone's
   cavity (2.), biased forward. It is water launched from the ring over a few
   milliseconds, each element then flying on its own, slowed by surface
   tension and air, so the whole sheet is a closed form in launch time,
   azimuth and time: a tall, nearly upright wall that stands on the lip and
   leans in, 11 cm high at 90 ms for a 3 cm stone dropped straight in at
   6.3 m/s (the reference simulation's: 11 to 12 cm at 0.1 s, below). Its rim
   thickens into a bead and grows fingers: rods of water, unevenly spaced and
   of uneven length (some only stubs), between arcs of rim that sag each
   their own way, each ending in a bead that swells, pinches off as a drop
   as big as the rim is thick, give or take a third, and starts again. The
   sheet is no clean film: it wrinkles, holes open high in it as it thins
   and the tear nears, and it carries froth, white streaks drawn out up the
   wall and along the holes' edges, the more the bigger and faster the
   throw (as the stone's Weber number), so a pebble's crown is glass, the
   default stone's a clear sheet frosted at its edges, and a 30 cm rock's
   streaked white; the foot the lip carries stays clear water. Once its rim stalls
   (about 90 ms for a 3 cm stone) the sheet tears, the arcs first and the
   fingers last, from the rim down into drops that carry its velocity. A
   thrown stone enters obliquely (about 30° from vertical thrown softly, 40
   to 45° normally, 70 to 73° and twice as fast thrown hard), and then a fan comes first: the same sheet model
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
   little slower. Its water is launched from a point that rises with the
   bowl's floor, fastest first: a thin needle at up to three times the body's
   speed, the body, and a broad slow base that the bowl's collapse builds
   (the launch is fitted to the reference simulation; its body leaves at 3.2
   times the hole's collapse speed at its pinch depth, sqrt(g·z_p), which is
   0.75 of the reference throw's entry speed). The column in flight is
   physics, not a drawing: the slender-jet equations of Eggers and Dupont
   (`src/slenderJet.js`, mass and momentum along the column with surface
   tension, viscosity and gravity, solved by material nodes on their own
   clock), so how it thins and beads (Rayleigh–Plateau), how its tip draws
   back into a bulb (Taylor–Culick), where it pinches, and every drop it
   throws and that drop's size come out of the equations: a needle a
   millimetre or two thick beads within milliseconds, a column centimetres
   thick rises and falls back whole. Its base flies as a ballistic sleeve
   and falls back into a mound (its ring is part of the stone's). For a 3 cm
   stone dropped straight in at 6.3 m/s the needle clears the surface 131 ms
   after entry at 13 m/s, its water reaches 70 cm and its largest drop is
   6 mm (the reference simulation: 118 ms, 13 to 16 m/s, 75 to 81 cm, 6 mm;
   `tools/jet-probe.mjs` checks the solver against the textbook growth rate,
   retraction speed and drop size, and the jet against the simulation);
   thrown at 42° a clean jet stands 25 to 45 cm, its drops flying higher,
   but each throw's collapse launches its jet its own way (below). Bigger
   stones' launches come from a sweep of simulations of 10 to 30 cm stones
   (`tools/basilisk/README.md`, `assets/jet/sweep.json`): a 30 cm rock's
   hole pinches 4 R down, not the reference's 7.5, so the cavity's head
   scales with the Froude number, and its column, 0.5 R thick at the base
   and 2 cm thick ten radii up, carries the air its collapse entrained
   (drawn white, bumpy, its base a mound no wider than 1.2 R) and sheds
   centimetre lumps, which fly whole until the air tears them (by their
   Weber number) instead of leaving as strings of 4 mm beads;
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
first; at the surface, the crown pulled shut over the hole into a low dome,
a thin sheet whipped shut, white with air, buckled and torn, not a glass
bell, when the entry's Froude number V²/(g·R) passes Birkhoff and Isaacs'
108, less readily the more oblique the entry and the more irregular the
stone: Worthington's roughened marble dropped 15 cm threw a tall jet and
from 140 cm none, Truscott and Techet's billiard balls at 6 m/s dome over,
and the app does the same), what follows a seal (the hole still pinches
under the dome and its jet bursts up through it, flinging the dome's water,
as Truscott and Techet saw; or, when the dome closed early, it is drawn
down into the hole before the jet arrives and the jet is trapped, the
surface heaving and seething, as Worthington saw from 140 cm), how lopsided
the hole is, how the crown leans (a spinning stone drags water up on one
side), and how the collapse launches the jet: clean, leaning towards the
hole's bulge, ragged (an uneven collapse launches the column rough, so it
comes apart along its length), stubby (short and fat: big stones, flat
entries, shallow seals), or none at all (a trapped jet: only a low mound
heaves up and subsides). For the default 6 cm stone thrown normally about
one throw in ten seals at the surface, four jets in ten are clean, a fifth
to a quarter ragged, one in six leans, one in eight is stubby; thrown softly
(nearer vertical) a third seal; a 1.5 cm pebble nearly always seals and its
jet is nearly always trapped, a 16 cm stone never seals and its jets are
mostly stubby (`tools/variety-probe.mjs` prints the distributions).

**Skipping** (`src/rock.js`, a Skip throw). The thrower picks a flat stone
and lets it go from a crouch, 30 cm over the water, nearly level, at 7, 10
or 13 m/s (the strip's Soft, Medium and Hard, the harness's `--power`; a
stone over 8 cm across goes slower), its
face tilted nose-up about 20° along the throw (Clanet, Hersen & Bocquet's
"magic angle") and spinning fast about its short axis, which holds that
tilt. Each touch is worked out once, on the CPU, as Bocquet (2003) models
it: the water pushes the face along its normal by ½·ρ·C·|v|² times the part
of it that is wet (a little more while the stone comes down, a little less
as it climbs), and drags it along the face. The stone either rises back
out and flies on, or goes in, when its face goes wholly under, its leading
edge catches, it slows too much, or it would leave too flat to do more than
glide. A normal throw skips three to five times: its hops are arcs of much
the same shape, each about six tenths the size of the last, the touches
coming quicker and quicker (2.7 m long and 16 cm high, then 1.6 m and 9 cm,
0.9 m and 5 cm, 0.6 m and 3 cm), all in the vertical plane it was thrown
in. In the pool it is thrown gentler (6, 7.5 or 9 m/s), so most skips stay
in it, coming back off the far wall; a hard one may clear the wall and land
on the paving, where it bounces low, tumbling end over end, and tumbles to a
stop a few metres on. Every touch sends out a ring, throws a fan of spray ahead
and leaves a moment's white churn; the last is any stone's splash
(`tools/skip-probe.mjs` prints all of it). A 30 cm rock is thrown too slowly
to skip.

**Foam** (`FOAM_PATTERN` in `src/shaders/scene.js`, the map in
`src/spectralWater.js`). A pond is fresh water, and a bubble on fresh water
bursts within a second (0.01 to 3 s, against 0.3 to 30 s on sea water, where
salt keeps bubbles from merging: Anguelova & Huq 2017), so a stone leaves no
raft. Where its hole closes, its air comes up as a boil: big bubbles,
popping as they surface (the boil's lifetime τ is 0.45 s), arriving over
the time the pinched-off air takes to rise from the pinch depth (about
0.7 s for a 6 cm stone, up to 2.5 s for a rock), so at any moment only
the bubbles just arrived show, a fizz rather than a lump; the jet rises
from a boil of its own and leaves a fainter one where it falls back, and
each big drop that lands leaves a speck of boil. (The map keeps a second,
longer-lived kind, the raft of small bubbles that sea foam is; the gale's
whitecaps use it, a stone never does.) The amounts are small: the pattern
below whitens about half the water at a map value of 0.1, and the map under
a 6 cm stone's foam peaks near 0.1. The hole's boil grows with the stone's
radius (its air goes as R³, the mouth it comes up through as R²) for as long
as the air takes to come up, so a big stone's boil is denser as well as
wider and longer. The surface holds only so much of it: on fresh water one
layer of bubbles bursts at a time, and the rest is the cloud of bubbles
just under the surface, which most of a real boil's white is. So the water
shader draws a boil up to that hold (a map value of 0.035) as bubbles
bursting on the surface, a random few at a time and most of them small,
each a clear cap whitening toward its edge that swells, glints and bursts
within half a second, and the rest as the cloud, a milky tint of the water
seen through the surface (its colour the water's own absorption against the
bubbles' scattering, the lake's blue-green paled), churned in lumps that
break up its edge, under the sky's reflection; the gale's whitecaps, a
breaking wave's packed froth, stay white. Foam specks ride over a boil's
cloud as over clear water. A pebble's boil is nearly all fizz; a big stone's mostly
cloud. Each is stamped as
a patch of three to five sub-stamps of unequal sizes at random offsets,
never one round Gaussian, so no two boils share a shape. Surface flows carry
the foam: where the hole closed the jet's base wells up, and where the jet
falls back the mound spreads, each sweeping the foam out of a disc into a
ring (keeping its amount), so a churn turns ring-like or crescent-shaped as
it pops, with arcs where the flow stretched it, and the place the jet fell
clears. The whole of it drifts downwind at 3 cm/s in a breeze (with the
wind's strength), and its pattern and specks with it. The foam map says
where and how much, but its cells are over a centimetre wide, so the water
shader draws the raft from three layers of cellular noise: bubbles 2 to 3 mm
across packed together, larger ones of 3 to 7 mm among them, and a lace of
curved filaments around holes a few centimetres wide. A boil, the bubbles a
splash leaves bursting on fresh water, takes no lace: it is drawn from the
bubble layers alone, and only a raft (the gale's sea foam) thins into
filaments. The map's strength,
lumped at 3 and 14 cm strongly enough to show from a phone 4 m away, so
that a boil is mottled and a raft's edge broken rather than a round, even
white, sets the threshold they must pass. Where it is strong the raft is
nearly solid white, its bubbles shaded darker at their rims and catching the
sun; as it weakens the holes open, the filaments thin to strings of bubbles
and clumps, then only the biggest bubbles are left, so a raft thins from its
edge inward the way foam pops, and foam just over the threshold, a single
layer of bubbles, lets the water show through. The larger bubbles have clear
centres and bright rims, with milky fine bubbles between them. The map's
separate boil and raft amounts control this material: a breaking wave's
dense froth scatters more light; as it drains, the water shows through the
bubble films.
Those films use the existing bubble cells and fade to their measured mean
opacity at a distance, adding no texture or noise layer. Close up (the
shoot harness, `--seed=1`, `--view=high --fov=16`), a 6 cm stone thrown
normally leaves a faint milky ring and a see-through fizz over about its
hole's mouth at 0.3 to 0.8 s and a few foam specks after; a 20 cm rock a
milky, soft-edged churn about 30 cm across from 0.4 to 1.4 s, thinning to
patches at 1.7 s and clear water by 2.2, with hardly any solid white
(about 5 cm² of it, against 180 cm² when the boil was drawn as surface
froth). From the bank, where the surface mostly mirrors the sky, either is
a faint pale patch.
The threshold's edge is one pixel wide at any distance (from the pattern's
exact gradient and the pixel's footprint on the water), and each layer fades
into an even white of the right strength before its cells shrink to a couple
of pixels, so distant foam neither shimmers nor goes grey. Only pixels with
foam compute the pattern. Foam specks (`src/foamSpecks.js`) are the bubbles
that drift out of the raft: 2 to 4 mm points riding the waves where the
crown stood, where the jet fell back, where drops landed and where bubbles
surfaced, drifting outward and popping over 0.8 to 3 seconds (fresh water's
bubbles), faded out where the foam is dense. The specks flatten into ellipses at a grazing view and
fade with their projected area, so distant bubbles do not remain bright,
camera-facing flecks.

The splash scales with the stone (the slider's 1.5 to 16 cm is its
diameter; the constants were tuned at 3 cm radius). Wherever the physics
allows it scales as a Froude-similar splash does: lengths with the radius,
times with √(R/g), speeds with the entry speed. The crown's sheet is as thick
as the stone is big, so air and surface tension slow it less, it drains
slower and stands longer: a 16 cm stone's crown stands for 160 ms, its rim
25 to 40 cm high, and tears into some 3000 drops on High (2000 on Medium and Low), none over 4 mm in radius
(surface tension holds no bigger drop together in flight, so a big sheet
tears into more drops, not bigger ones), while a 1.5 cm
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
what is behind it, aerated (whitened) along its rim bead and torn edges and
by its froth, which scatters along the path through it, so a sheet seen
face-on stays clear where one seen edge-on goes white; its holes are cut
in each pass, antialiased, and those under a pixel or two only thin it to
the right transparency, so a far sheet never sparkles; the column is a lens that shows the pond and its glitter from well to
the side and, through its bulb, the sky upside down. A drop two device
pixels or wider is a glass bead, the pond in its top, the sky upside down
in its lower half, with two glints, the sun reflected off it and the sun
refracted through it (which makes a splash sparkle against the light),
each a point whatever the drop's size; a streak or a small bead shows the
drop's mean light. Drops under a pixel are a mist whose brightness follows
the water they really cover, so a lone fine drop all but vanishes. The
splash throws tens to a few thousand drops of a millimetre and more a stone
(a 16 cm stone about 1500 over its life, at most about 700 in the air at
once), stepped on the CPU, and besides them its spray (`src/spray.js`): the
drops under a millimetre that a torn sheet's film, a pinching neck, the
contact's first ejecta and a sealing dome's spike fragment into, from tens
of thousands for the default stone to millions for a rock, a third of a
torn patch's water for the reference toss and three quarters for a rock. Each
spray sprite is written once and flies a closed form of its age in the
vertex shader (two phases of linear drag, fitted to Schiller and Naumann's
drag on a sphere within 4% at the median), through the same passes as the
drops, so it costs a uniform and a draw a pass and nothing stepped; a
sprite stands for one to several hundred like drops, drawn as a soft puff,
so Medium and Low draw fewer, heavier sprites and the same mist, and a
throttle keeps any throw within the ring's sprites. Seen from the shore it is
the white veil round a big stone's crown and jet, and a sparkle against the
sun. The water mirrors the splash:
while it lives, its sheets, columns, drops and spray are drawn as cheap water into
the mirror image the pond reflects, over just the rectangle they cover, with
how far each is from the mirror's camera, so that the water looks a near
thing's reflection up where it is: the jet's reflection hangs under the jet
and only trembles with the ripples, where the sky's streaks with them.

**Sky** (`src/sky.js`). The sky is a photograph: an equirectangular HDRI
(a lakeside with a far shore by default, or one of seven others) on a dome at the far
plane, turned about the vertical (and mirrored, where that puts better
scenery ahead) so that its sun stands where the scene's does (28° right of
straight ahead) and at the photo's own elevation, which becomes the scene's
(27° for the meadow, 5° at sunrise, 50° in the Alps). The page loads it as
a JPEG gain map (`tools/sky-encode.mjs`), a tenth to a thirtieth of the
HDRI's bytes, that Three.js's UltraHDRLoader decodes to the HDRI's own half
floats. Its brightness is anchored on the sun: `tools/sky-probe.mjs` measures the photo's sun
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

**Hours.** Lakeside and Mesas are Poly Haven's series by Greg Zaal and Jarod
Guest: twelve of thirteen panoramas from one tripod on a hill over a dammed lake in
South Africa, 18 to 22 August 2024, and four from a rock on its shore 350 m
away (the 2019 afternoon among them). Poly Haven turns each panorama so its
sun lands on the same column, so `tools/sky-probe.mjs` finds where north is
in each file: from the true sun's position at the photo's time and place
(NOAA's algorithm), or, when the sun is down, by lining the far shore's
skyline up with another hour's. The two agree within 0.5° wherever both
apply; the photos' time stamps turn out to be local time, and the 2019
afternoon's sun puts it at 14:41 to 0.1°. One hour of each place is turned
as a single photograph is (Lakeside's afternoon, as before; Mesas' moonrise),
and the others keep its land where it is, so their suns stand where they
stood. Poly Haven exposes each panorama to be looked at, as an adapted eye
would see it (dawn as bright as noon), so an hour keeps its file's
brightness against the place's sunlit anchor hour times the clear-sky light
on the ground at its true sun's elevation against the anchor's, to the
power 0.2 (an eye that adapts most of the way) and, below 10 lux, where
the rods take over, to 0.02 further: sunset comes out 0.63 of the
afternoon's, twilight at 5° below the horizon 0.17, moonlight 0.16 and a
starlit night 0.15, about 2.7 stops under the day (set at 4 to 5 stops
under, the nights were a dark grey photograph). While the sun is down the
scene's sun is dark, or is the moon, a full moon's light 400,000 times the
sun's at its elevation; the deep water's colour dims with the light. Below
10 lux the picture also turns towards what rods see (Jensen et al.'s
scotopic luminance, in the tone map), fully by 0.03 lux, drawn as a film
draws a night: tinted nearly Jensen's night blue, keeping 40% of the
cones' colour, and going to white where it is bright, so the moon's
glitter and a splash's glints are silver on blue water.

The curated locations include:

- **Swiss Alps** (`?sky=swiss`): a 4K upgrade of Alpine, facing Lago d’Isola’s
  snowy ridge from water level, with Frozen water by default. One midday photo.
- **Rocky cove** (`?sky=cove`): Secluded Beach, framed toward the sea opening
  between the boulders. One photographed morning.
- **Highlands** (`?sky=highlands`): five Kiara panoramas, from dawn and sunrise
  to noon, sunset and dusk. Starts at sunset unless a remembered clock is
  nearer another hour; noon remains the lighting calibration anchor.
- **Desert oasis** (`?sky=desert`): Rogland's golden hour, starry night and
  moonlit early morning, framed toward the lower rock skyline. The water is
  the simulation's, surrounded by the photographed desert.

The Time of day page has named buttons as well as the slider. Selecting a
new location or hour cancels an obsolete download immediately; it never
waits behind that download or briefly applies its lighting. Returning to
the displayed hour also cancels a pending change. Failed loads keep the
current scene and restore the controls, so the same choice can be retried.
The photographs still change together with their lighting in one frame;
there is no continuous sun animation or crossfade between photographs.

Kiara's camera times are approximate and its nearby rocks shift slightly
between tripod positions. The ridges are aligned with the probe's
`--band=-15,-5` (the valley lies below the photographic horizon), using the
measured sun for daylight. Rogland uses `--band=0,18`; its clocks are the
camera's local times (UTC+2), including moonlight at 05:33 on another day.
The new HDRIs are CC0, stored locally at 2K (about 6 MB each), and the page
loads each hour's JPEG gain map, 0.2 to 0.8 MB.
Swiss Alps uses [Lago d’Isola](https://polyhaven.com/a/lago_disola), photographed
at 46.450379, 9.189087 in Switzerland, upgraded from the old Alpine's 2K
asset to 4K (25 MB; its JPEG 1.8 MB). Its rotation faces the snowy ridge across the lake.
Meadow and Open sky are removed from the picker; Meadow's measurement and
source remain for the original lighting calibration. Only the chosen
panorama and up to two prefetched neighbours load in the browser.

Reproduce the new measurements (all paths below are in `assets/sky/`):

```bash
node tools/sky-probe.mjs assets/sky/lago_disola_4k.hdr
node tools/sky-probe.mjs assets/sky/secluded_beach_2k.hdr
node tools/sky-probe.mjs assets/sky/kiara_5_noon_2k.hdr --taken=2016-08-24T12:15:00+02:00 --at=-28.508926,28.56648
node tools/sky-probe.mjs assets/sky/kiara_2_sunrise_2k.hdr --align=assets/sky/kiara_5_noon_2k.hdr --band=-15,-5
node tools/sky-probe.mjs assets/sky/kiara_1_dawn_2k.hdr --taken=2016-08-24T06:20:00+02:00 --at=-28.508926,28.5664 --align=assets/sky/kiara_2_sunrise_2k.hdr --band=-15,-5
node tools/sky-probe.mjs assets/sky/kiara_8_sunset_2k.hdr --align=assets/sky/kiara_5_noon_2k.hdr --band=-15,-5
node tools/sky-probe.mjs assets/sky/kiara_9_dusk_2k.hdr --taken=2016-08-25T17:55:00+02:00 --at=-28.508926,28.56656 --align=assets/sky/kiara_8_sunset_2k.hdr --band=-15,-5
node tools/sky-probe.mjs assets/sky/rogland_sunset_2k.hdr --taken=2023-09-05T17:31:00+02:00 --at=-29.68232655273397,17.949190420193943
node tools/sky-probe.mjs assets/sky/rogland_clear_night_2k.hdr --taken=2023-09-05T21:22:00+02:00 --at=-29.68232655273397,17.949190420193943 --align=assets/sky/rogland_sunset_2k.hdr --band=0,18
node tools/sky-probe.mjs assets/sky/rogland_moonlit_night_2k.hdr --taken=2023-09-07T05:33:00+02:00 --at=-29.68232655273397,17.949190420193943 --align=assets/sky/rogland_sunset_2k.hdr --band=0,18
```

**Rain** (`src/rain.js`, `src/shaders/rain.js`; the cloud and haze in
`src/sky.js`). The Weather setting clouds the sky over: the sun's direct
light goes, and the dome's luminance is evened out about its clear mean (to
the power 0.4, so the sun's glow sinks and the shaded land lifts, as under a
cloud deck), greyed a little blue and scaled to the cloud's brightness, the
hour's whole clear-sky light times the share a rain cloud lets through (a
third for light rain, an eighth for a downpour) as the adapted eye sees it.
The rain's haze fades what lies d metres off by 1 − exp(−3d/visibility)
(10 km and 1.5 km): the water by its distance, the dome by the distance a
ray climbs out of a 1 km layer of rain, at most 400 m, where the photo's land
stands. A raindrop's ring is worked out once by `tools/rain-probe.mjs`:
the crater a 2 mm drop opens (3 mm deep, a Gaussian 2.5 mm wide) let go as
linear capillary-gravity waves on deep water, with viscosity, summed by
Hankel transform. Capillary waves are fast where short and gravity waves
where long, so the ring is a train of crests, the short ones running ahead,
closing up behind on the slowest waves (1.7 cm, 0.23 m/s), as rain's rings
do on a pond. The table of its height and slope over radius and time is
loaded as a half-float texture, and each frame one pass draws the rings of
the moment's drops into a 1 m tile, each drop's ring scaled to its size as a
capillary ring scales, f·η(r/f, t/f^1.5). The drops come from a schedule
with no state, hashed from the clock and the tile's cells, so the harness
renders the same rain every run. The water reads the tile twice, the second
time turned and shifted, so the repeat does not show; far off, where the
rings are finer than a pixel, what the mip levels average away comes back as
roughness, from the rings' slope spectrum by Campbell's theorem (as the
wind's ripples do). The falling drops are streaks, each the path it cuts in
the eye's 1/30 s, slanted by the wind: drops of the same schedule, so each
falls to the very place its ring opens and its fleck of white rises and
falls. A few of each tile's drops near the eye fall as streaks, about as many
to a cubic metre as before, fading out 11 m away. Since every tile drops the
same drops at the same moments, the tiles take turns, so a drop's twin a
metre away does not fall beside it in step (its twins are 3 to 5 m apart);
what is left of the repeat is a gentle swell in how many streaks are in view
(about 8% over a second, against 2% for drops wholly at random).

**Drop rings** (`src/dropRings.js`; its shader `DROP_RING_SLOPES` in
`src/shaders/rain.js`). Each of a splash's drops 1.5 mm in radius or more
leaves where it lands the little concentric rings a raindrop does, which
the solver's 1.2 cm cells cannot hold: the rain's own ring, scaled to the
drop (f, its diameter over 2 mm, at most 3) and weighted by its fall
(√f·v/6.5 m/s, the ring's energy a share of the drop's), its slopes added
to the water's as the stones' rings' are, averaged over each pixel's
footprint. A lump's drops landing together make one ring; at most 24 are
drawn on High, the first of a burst kept until their crests have formed,
and each lives under 1.2 s. The rain's table is fetched once, at the first
impact, and shared with the rain.

**Gale** (`src/galeWaves.js`; its shaders in `src/shaders/gale.js` and
`src/shaders/spectral.js`). A gale of 18 m/s over 1.5 km of open water
raises a young wind sea, whose spectrum is JONSWAP's for that wind and
fetch (Hasselmann et al. 1973): a significant height of about 0.34 m, a
peak period of 1.85 s and 5.8 m waves (the formula's peak is 5.3 m), spread
in direction as Donelan et al. measured, narrowest at the peak. It is drawn
once, from a seeded generator, on a 32 m tile of 128² wave vectors (waves
down to 0.5 m; the ripples, four times their Breeze, carry the shorter),
and evaluated on the GPU each frame by two FFTs, as the ripples are: the
height, a sideways move that carries the water toward each crest
(Tessendorf's choppy waves), which sharpens the crests and broadens the
troughs, the slopes, and the derivatives of the move. All the water moves:
the patch, and the sheet to the horizon, cut finer while the gale blows
(75,000 triangles, 12 cm apart at the patch and growing outward), its
vertices reading the waves no shorter than their spacing, so far off they
flatten and the shading carries them on, with what the mips average away
given back as roughness. Near the stones, within 4.5 m of the patch's
centre, the water moves only up and down (the sideways move grows in by
12 m), so the splash needs only the height under it. The splash computes
everything on still water, as it always has, and the gale moves it as it
is drawn: what is in the air (crown, jet, drops, spray) rises with the
wave under it, what is under the water (the cavity, bubbles, a sinking
stone) rises as the water column stretches between the fixed bed and the
moving surface, so a stone on the bed stays put. A stone meets the water
at the height of the waves under it, which the CPU sums from the same
spectrum (all but 0.3% of its variance, to 5 mm), and the mirror image is
taken about the water's height under the latest splash. Whitecaps: where
the sideways move crowds the water past breaking (its Jacobian under 0.66,
about 3% of the sea), a foam map on the tile takes a dense boil that pops
within a second and a raft that drains over five, which the water shades
as it shades a splash's foam, the raft gathered into thin wavering streaks
along the wind; and spray is torn off where the boil says a crest has just
broken, wisps of drops blown downwind as streaks. When the gale rises its
foam is run over the six seconds before, so the sea opens as one that has
been blowing. The eye keeps 0.45 m clear of the still water either way.
`tools/gale-probe.mjs` checks the field on the CPU with the GPU's passes.

**Snow** (`src/snow.js`, `src/shaders/snow.js`; the cloud and haze in
`src/sky.js`, the snow on the ground `SNOW_COVER` in `src/shaders/scene.js`).
Snow clouds the sky over as rain does, from a brighter cloud (0.55 of a
clear day's light for light snow, 0.35 for heavy, 0.22 for a blizzard), and
its haze is whiter (0.85 to 0.9 of the cloud against rain's 0.6) and
thicker (1.5 km, 400 m, 150 m to see). A snowflake meets the water at about
1 m/s, weighing milligrams: it melts and leaves no ring, so the water is
left as the wind has it. The flakes are one instanced draw in a box about
the eye (16, 40 and 60 thousand of them), each falling at its terminal
speed (0.9 to 1.1 m/s, give or take a fifth), carried at the wind's speed,
swaying on a small ellipse and tossed by gusts of 0.3 of the wind, drawn as
the capsule it sweeps in 1/120 s: round in still air, a streak in a
blizzard's, with the same light either way; a flake under 1.2 pixels is
drawn that wide and fainter, and the haze carries the snow beyond the box
(Medium draws 0.6 of the flakes, Low 0.4). The box keeps its floor under
the water however high the eye goes, and the shader never multiplies the
clock: the wind's carry and the fall come wrapped into the box, worked out
in doubles, and every sway and gust repeats in a minute, so a flake is
where it should be however long the page has been open.
Under a gale they are cut at its waves. On the ground the snow lies in
value-noise patches under a light snow and whole under a heavy one, melts
on the beach's wet sand (4 cm above the water) and on the deck where the
splash's drops land, and whitens the far land half way. In its air (`setAir`
in `src/rock.js`) a frozen thing thaws only in the water and wet things,
and the deck's splashed patches, dry a twentieth as fast.
`tools/snow-probe.mjs` checks the flakes' motion (its twin on the CPU,
`flakeAt`) and drawing.

**Ice** (`src/ice.js`; drawn by the water's shaders, `ICE_COMMON` in
`src/shaders/scene.js`). The ice adds one piece of physics, whether it
breaks, and borrows the rest. On it a thing is on ground (`src/rock.js`
`ground`): it bounces, tumbles or rolls and rests as on the pool's deck, but
slick (friction 0.1, a stone slowing at 0.12 g, a ball rolling on), so a
throw slides metres and a hard, flat one tens of metres, out of sight past
30 m; things on the ice, as on the deck, knock each other along
(`src/collide.js`). A thing coming down on it strikes a blow m·v²/R (its
speed down only, so a lob breaks where a flat throw skids; a hollow ball or
a soft thing spreads its blow over a longer touch), and the ice holds up to
1.28 MN/m² times its thickness squared (floating ice bears a load as h²),
that is 128 N for thin ice and 2 kN for thick, times a spread of 20% from
blow to blow. That strength is not measured: a punch through floating ice
is local crushing and the plate's inertia, and the constant is set so that
the table `tools/ice-probe.mjs` prints comes out (a 6 cm stone thrown
normally strikes thin ice at twice what it holds, thick at an eighth; a
30 cm rock thick ice at two and a half times), uncertain by a factor of a
few. A blow over six tenths of what it holds stars the ice with cracks.
One it does not hold opens a hole, and the thing, slowed by what the break
took, goes in as into open water (`src/rock.js` breakThrough): the cavity,
the jet, the bubbles and the foam are the open water's, but no crown or fan
stands up (`src/splash.js`), and the drops that come down on the ice land
there as on the deck, wetting it. The hole is as wide as the cavity's lip: opened as a round lip's for
the throw (`roundLipReach` in `src/cavity.js`), then fitted, in the same
step, to the cavity the splash made (`Cavity.lipReach`: its crest at the
widest and half its fall, lopsided and drawn forward as it is), with a
broken edge of 36 corners beyond it and a bite or two out of it, from the
hole's own seeded stream; a hole may open anywhere over the water, its edge
brought in to 4 mm of a pool's walls. Radial cracks run out from its
corners, three to six of them and one and a half more for each doubling of
the blow over what the ice held, 0.35 to 1.5 times the sheet's
characteristic length (0.54 m for thin ice, 1.5 m for thick) and now and
then one far longer: each in straight runs of 3 to 15 cm with kinks
between, pulled back the way it set out, forking now and then, tapering to
a hairline. Rings of crack join neighbouring radials farther out, chords
from one to the next, so a hard break leaves a web. A crack stops where it
meets one already there, as real cracks do, so older breaks bound newer
ones; a near miss stars the ice, sometimes ringed. A thing sliding into a hole falls in; one too wide for a hole
strikes its edge; a floater that went in by a hole comes up in it and is
held there. The ice that was in the hole broke into pieces between its
radial cracks, and across them where a wedge is wide or deep, each a convex
slab of the ice's thickness, with a chip or two from the crushed middle: as
many as float in the hole uncrowded (their rims' discs at most 55% of it;
a 6 cm stone through thin ice makes six or so, 7 to 13 cm across). Once the
cavity has closed they are let go a little under the water, tilted, each a
thing (`ice-shard` in `src/things.js`, hidden from the menus; its mesh
built to its own outline, `src/thingMeshes.js`), so they come up and float
flat at the sheet's own freeboard by the plate model a pizza floats by,
bump each other rim to rim (`src/collide.js`), and are held in the hole by
its edge's reach in each direction. A shard is drawn as clear ice
(`look.seenThrough`, `src/rock.js`): its outline broken along its sides
(scaled back to its own area, so its mass stays ice's), its top showing
what lies under it through its milk (the sheet's, for its thickness) and
the sheet's own snow, frost, bubbles and crystal lines, its rim rounded and
whiter. Under the water ice bends light all but as water does, so from
above its submerged part is all but invisible: the under-water pass draws
only its sides' inner faces, bright with the light turned back off them, a
band along its far edges as wide as it is thick seen aslant, and, faintly,
its top where a ripple has washed over it. As they go the water the splash threw
aside comes back over the ice round the hole, out to about one and a half
times its reach, leaning the way the stone went, and each drop that lands on
the ice wets a spot; the film freezes over 75 seconds, leaving the ice
glazed, its frost gone. A hole left alone 40 seconds (nothing gone in by it,
nothing thrown afloat in it) skins over from its edge inward in 30 seconds:
new ice, clear and smooth, 4 mm thick a minute after its front passed and
thinner before, so it holds a pebble but not a stone; a shard it reaches is
frozen in, painted into the sheet where it lay. (Real ice skins over in
minutes to hours on a calm, cold night; this is quicker, for the play of
it.) The sheet is rigid at the pond's scales (bending waves shorter
than its characteristic length are stiffened by orders of magnitude), so
the solver runs on under it, seen only in the holes, and carries a stone's
ring there as in the pool (its waves run under the ice out of sight); no
gale blows on ice. The holes are painted into a mask over the patch (an
RGBA8 texture of 512²: the signed distance to the nearest hole's edge, how
wet, and the signed distance to new ice's front; only the rows that change
are sent), which the water's own shaders read: where it says ice they draw
the ice, held flat at its freeboard, and in the holes' open water the
water, blending them over the pixel at the edge; so the sheet costs no
program of its own, and a shard is drawn as any floater is. The cracks are
drawn over it as ribbons (`src/iceCracks.js`: one mesh, one program, built
under the loading veil), so each is as sharp as the screen, its kinks and
its width its own, however near the eye comes: the mask's 1.2 cm texels
would round them, and its distance field crossed zero between two cracks
near each other, a dotted line where no crack was. The ice is a lake's,
every part of it crisp (soft noise read as a texture magnified, the
picture blurred): mostly clear black ice, the water and the bed showing
through it and a mirror, the sun a small hard glint in it; its crystals'
boundaries faint lines in patches; snow ice in wind-streaked patches with
ragged edges (more on thick ice) and cloudy ice frozen from slush, both
frosted, the sun's sheen on them broken into glints; frost specks and
frozen bubbles in clusters; a veil of the light even clear ice scatters,
greater looking along it; round a frozen pool a white rim where the ice
froze to the tiles, and drifts against the walls. A crack is a bright line,
brighter and dimmer along it, its fracture face showing white down through
clear ice as wide as the sheet's thickness seen along the refracted ray, a
dark line in snow ice; round a hole the ice is wet, and wet ice is darker
and a mirror; a hole's new ice is clear and glassy, its old edge a faint
seam. Under the ice in the pool the tiles keep the screen's sharpness
however coarse the under-water pass is drawn (Medium and Low draw it at
half resolution): the shader works out the tiles' pattern where the eye's
ray, bent into the water, meets the basin, and multiplies the pass by that
pattern over a screen pixel against the same over the pass's texel, so the
grout is sharp and the pass keeps its light; still pool water does the same
while the refraction moves the lookup by under a pixel. Under flat ice the light is not focused: no
caustics on the bed and no shafts in the water but under the holes. From
below, clear ice lets the sky's window through unrippled and white ice
glows. A thing landing on ice is heard with the chirp floating ice is known
for: bending waves run faster the higher they are, so from a blow d metres
off the high arrives first, falling to the low, a "pew" the longer the
farther it struck (`src/sound.js`); a break cracks.

**Lightning** (`src/lightning.js`, drawn by `src/sky.js`). In a storm the
strikes come from the clock, so every run has the same: one in most seven
seconds, two to four return strokes each, decaying over 45 ms, then an
afterglow. A flash multiplies the dome's light, the scene's ambient sky
and the haze by up to about ten for a strike 1.5 km off (the light falls
with the distance squared, softened as the eye adapts), and most strikes
show a bolt on the dome, a jagged line from the cloud's base, 600 m up,
to the horizon, hidden where the photo's land stands in front of it; the
mirror image is drawn again while it flashes, so the water shows it.

**From under the water** (the Under view; `renderFromBelow` in `src/main.js`,
`UNDER_FOG` and `WATER_UNDER_FRAGMENT` in `src/shaders/scene.js`). The water's
own light, darker looking down and brighter looking up toward the surface,
is drawn behind everything; the bed (with its caustics), the stones and the
bubbles are drawn where they are, faded into it by the extinction over their
distance; then the surface from below: within 48.6° of its normal the eye's
ray leaves into the air and shows the sky (the cube the droplets reflect,
with the sun's disc), squeezed into Snell's window, the far shore round its
edge and the ripples, rings and splash bending it; past that the surface
mirrors what lies below, the bed where the mirrored ray meets it. A stone's
cavity is shaded the same way from its air side, so it is a silver mirror
with the sky down its mouth. The sun's shafts are the light the water
scatters toward the eye from the sunlight the ripples focus: along each ray
the curvature where that sunlight crossed the surface, dimmed on its way down
and out to the eye, scattered forward. Nothing in the air is drawn from
below but what the window shows of the sky.

**Rendering** (`src/main.js`, `src/shaders/`). Each frame: the floor,
submerged stones and bubbles are rendered to a texture with depth (at half
the canvas's resolution on Medium and Low), the stones and bubbles where the
still surface shows them, bent by refraction (a stone 10 cm down is seen a
third as far in front of the point above it as a straight line from the
camera puts it, and one on the floor half as far), the floor on the
straight line; the main
scene renders the sky dome and the water surface (with any open cavity, drawn
by the same shader), which refracts that texture,
fading it by path length through the water (absorbed and scattered, as the
Water setting says) into the water's own colour, reflects a planar mirror
image of the sky dome, clouds and treeline (re-rendered only when the view
zooms, turns or moves; while a splash lives, it is
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
caustic lies down-sun of it on the sand by the refracted sun's tan θt times
the depth there (0.9 times it under the meadow's sun, 27° up). The
floor is a lake bed that deepens away from the bank (`floorDepthAt` in
`src/pondFloor.js`): each point is lit through its own depth of water, and
the rocks and their holes come to rest on it. How strongly the surface
focuses the light follows Snell's law for the sun's height (three times
what a sun overhead would give), so a crest draws a thin bright line where
its focus meets the sand, eased into 0.45 to 2.6 times the sun's own light
(`src/pondFloor.js`), crisp enough that the ripples' web and a ring's light
stand out on the shallow sand.
Stones are procedural geometry, lumpy, worn smooth and speckled, with a
small rigid-body model: a ballistic arc, quadratic drag under water, and a
settle into the sand. A rock over 16 cm across leaves the hand lower and
farther out, so it rises into the view rather than filling its corner.

## Development

- `npm test` runs `tools/load-asset-test.mjs`, `tools/fft-test.mjs`,
  `tools/wave-probe.mjs`, `tools/foam-probe.mjs`, `tools/cavity-probe.mjs`,
  `tools/ring-probe.mjs`, `tools/rain-probe.mjs`, `tools/snow-probe.mjs`,
  `tools/gale-probe.mjs`, `tools/skip-probe.mjs`, `tools/thing-probe.mjs`,
  `tools/ice-probe.mjs`, `tools/spray-probe.mjs`, `tools/jet-probe.mjs` and
  `tools/drop-ring-probe.mjs`;
  each exits with 1 if a check fails.
- `node tools/ice-probe.mjs [--list]` throws every thing at thin and thick
  ice as the app throws it, each way, with the splash on the CPU, and
  prints what breaks what: each throw's blow against what the ice holds and
  whether it went through, starred the ice or held (and how far it slid).
  It checks that the pebble, the tennis ball, the basketball, the duck and
  the pizza hold on thin ice, that the default stone breaks thin ice and
  holds on thick and a 30 cm rock breaks thick, that each outcome is the one
  its blow and its draw say, that whatever held rests on the ice and was
  never under it, that every hole holds its cavity's lip and the jet's foot
  at every moment and its cracks lie on the ice, that a stone slides four
  times as far on ice as on the deck, that a skip skitters, that a stone
  slid into a hole falls in and a floater that broke through floats in its
  hole, that a stone slid into one at rest knocks it on with the momentum
  kept, that a frozen pool keeps everything on its ice or its deck and turns
  a slide back off its walls, that a seeded throw breaks the same hole and
  halving the substep changes little, and what a break costs.
- `node tools/gale-probe.mjs [--wind=x,z]` builds the gale's seed with the
  app's code and runs its evaluation and FFT passes on the CPU: the field is
  real and its packed channels are the fields; the sideways move squeezes
  the crests and stretches the troughs; the significant height and the peak
  are JONSWAP's; the waves travel downwind; the field repeats after its
  period; the CPU's surface (for the stones and the splash) is the field;
  the mips lose the slope variance the shader's model says; and it prints
  how much of the sea breaks, and the cost.
- `node tools/rain-probe.mjs [--write]` works out a raindrop's ring on the
  CPU and prints its timeline and slope spectrum, checking the sum starts
  as the crater, the slowest waves go 0.23 m/s, the steepest crest runs at
  about their group speed and the table's edge cuts nothing; `--write`
  writes `assets/rain/ring.json` and `ring_profile.bin`, which the page
  loads the first time it rains.
- `node tools/skip-probe.mjs [throws=60] [--seed=1] [--aim=x:z] [--list]`
  throws skips as the app does with Skip on, through the app's own aiming
  (`aimSkip` and `SKIP_THROW` in `src/rock.js`): in the lake the 6 cm stone
  softly, normally and hard, then a 3, a 16 and a 30 cm stone normally; in
  the pool, with its walls and deck, the 6 cm stone at each strength and a
  30 cm rock. It flies, skips and sinks each on the CPU with a splash system
  and prints the skips per throw, the first touch (its angles in and out,
  how long it lasts, the speeds), the first hop's length and height, a
  touch's spray and ring pushes, where the stone went in, how far the first
  touch lies from where the aim shows it, where pool throws end and the cost
  of a contact and a frame. It checks that a normal throw mostly skips (a
  median of 3 to 8), that softer throws skip less, that a 30 cm rock never
  skips, that no skip leaves rising faster than it came down and the first
  hop stays under 30 cm, that every hop is an arc (at least 1/40 as high as
  it is long), that in the lake the stone stays in the vertical plane it was
  thrown in, that every skip rings and sprays, that every stone comes to
  rest, that the aim shows the first touch within 12 cm, that in the pool no
  stone goes below the deck outside the walls and soft and normal skips stay
  in it, that halving the contact's step or the frame's substeps changes
  little, and that a contact costs under a millisecond.
- `node tools/fft-test.mjs` checks the splash solver's spectral passes on the
  CPU with the shaders' arithmetic: the FFT against a naive DFT, a splat's
  spectrum against its Gaussian, the Nyquist bins (splats at fractional
  centres make real fields, with no velocity in the height or height in the
  velocity), and the half-float path: the smallest stone's ring survives with
  every stored value rounded to binary16, subnormals kept or flushed to zero,
  and fields well beyond the largest a splash makes fit in it; and the pool's
  walls: a splat's mirror images, a field even about every wall, and real
  fields at fractional centres with them.
- `node tools/pool-probe.mjs [--radius=0.15] [--power=hard]` throws a stone
  into the pool on the CPU, keeps every splat its solver would take (the
  ring's too) and evolves them in the basin with the solver's own arithmetic,
  for the lake's damping and the pool's (and any others given as
  `POOL_CANDIDATES="base,least;…"`): the largest slope, height and caustic
  change in the pool at times after the last splat, and how long its ripples
  stay plain and visible. It checks that the largest rock's waves (30 cm,
  thrown hard) are under what a pixel shows when the pool's solver sleeps.
- Deployment: `.github/workflows/deploy.yml` runs the tests and `npm run site`
  on every push to `main` and publishes `_site/` to GitHub Pages. `npm run site`
  (`tools/build-site.mjs`) copies only what the page loads: `index.html`,
  `src/` and `assets/`, less the skies' Radiance files (`.hdr`), which only
  the tools read. A new file or folder loaded at run time outside those
  must be added to its list. `node tools/site-check.mjs`, after
  `npm run site`, serves `_site/` under `/AStonesThrow/` as Pages does and
  checks that the pond starts, rain falls once asked for (its files load only
  then) and no request fails.
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
- `node tools/drop-ring-probe.mjs [--list]` throws the reference stone into
  the lake and a 12 cm rock into the pool on the CPU and counts the drops
  that ring where they land (when, how far, how fast), the rings drawn
  (sizes, weights, lives; merged, turned away, made to fade early) at each
  preset's limit, and checks the limit holds and every ring retires in time.
- `node tools/ring-probe.mjs [--all] [--gpu]` checks the rings
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
  float64; `--all` runs every stone
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
  `--power=soft|normal|hard` (the strip's Soft, Medium and Hard: a soft
  toss is a higher arc, so a steeper entry, about 33° from vertical; a hard
  one is let go at 12 m/s, fast and flat, and goes in at 12.4 m/s, 73° from
  vertical: `throwFlightTime` in `src/rock.js`), `--manner=toss|lob|skip`
  (the strip's Toss, Lob and Skip: a lob the high way round, higher the
  harder), `--skip` (skip throws, as `--manner=skip`, the times counted from
  the first touch), `--trace` (each stone's path drawn as a line),
  `--wind-strength=calm|breeze|windy|gale` (the page's
  own default is calm), `--weather=clear|light-rain|heavy-rain|storm|light-snow|heavy-snow|blizzard` (waits for
  the rain's table before the first frame). With
  `--eval="window.__pond.setTimeScale(0.1)"` the frames are slow motion, 1/600 s
  of world time each, so `--times=0.07,0.0716667,…` are consecutive frames;
  the flight is stepped in slow frames too, so the first frame is at most
  1/600 s after the impact (a `--preimpact` just short of it saves time).
  `--throws=none` throws nothing and takes `--times` seconds after `idle.png`
  (which follows `--preroll=seconds`), for a run of idle frames.
- `?floats=half` on the page forces half-float render targets everywhere, the
  path devices without `EXT_color_buffer_float` take.
- `?trace=1` on the page, or the T key, traces each stone over everything
  (`__pond.setTrace`): its path from the hand until it goes in (yellow), its
  track on the water under it (white), a red cross at each touch and a white
  line down from the top of each arc.
- `?profile=1` on a real device runs the profiling steps of `src/profiler.js`.
  It first measures the floor: frames that neither simulate nor draw, which
  shows what the browser allows (33 ms there means a 30 Hz cap, as iOS Low
  Power Mode sets). Then, on the still pond and through a splash replayed
  from the same seeded throw at 1/60 s per frame, it switches parts of the
  frame off one at a time (the floor pass, the water surface, the wind
  waves, the solver's sleep, three quarters of the pixels; the droplet
  passes, the spray, the mirror pass, the cavity, the solver), each between two
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
  `?windStrength=calm|breeze|windy|gale` (`--wind-strength=` for the harness)
  sets its strength, over the one the Wind setting last chose on the device
  (kept in `localStorage`); calm otherwise.
- `?sky=name` on the page (`--sky=name` for the harness) picks the place,
  `PLACES` in `src/main.js` (a key of `SKIES` in `src/sky.js`, or `pool`, the
  old `?water=pool` too), over the one last chosen on the device (`sunrise`,
  the old Sunrise sky, is Lakeside at sunrise), and `?time=hour` (`--time=`
  for the harness) its sky's hour, over the one nearest the time of day last
  chosen (the harness's browser keeps none: the anchor hour);
  `?water=clear|lake|pond|murky|frozen` (`--water=` for the harness) the
  water, `WATER_CHOICES` in `src/main.js`; `?ice=thin|thick` (`--ice=` for the
  harness) freezes it that thick, `ICE_THICKNESS` in `src/ice.js` (`none`
  thaws it);
  `?weather=clear|light-rain|heavy-rain|storm|light-snow|heavy-snow|blizzard`
  (`--weather=` for the harness) the weather, `WEATHERS` in `src/main.js`,
  over the one last chosen on the device (a storm or a blizzard brings a
  gale while it lasts, unless `?windStrength` says otherwise).
- `?view=shore|level|high|under` on the page (`--view=` for the harness) opens on
  one of the View setting's choices (`VIEWS` in `src/main.js`);
  `--orbit=azimuth:elevation:distance[:x:y:z]` stands the harness's camera on
  any orbit (degrees, degrees, metres, and the pivot; `src/viewOrbit.js`).
  The rocks are thrown from the shore whatever the view.
- `node tools/sky-encode.mjs [assets/sky/name_2k.hdr ...] [--verify]` encodes
  each sky's Radiance file (every one, by default) as the JPEG gain map the
  page loads, `assets/sky/name_2k.jpg`: a base image and a gain map, matched
  to the arithmetic of Three.js's UltraHDRLoader so that it decodes to the
  half floats the Radiance file gave, the sun's disc and all, in 0.2 to
  0.6 MB against 5 to 7. The gain map is constant over each 8×8 block (so
  that every browser decodes it alike) except where a block holds the sun or
  a sharp edge, and the photo's ground below the horizon, which the water
  hides, is blurred. It prints each file's size and its error over the sky;
  `--verify` decodes the files with the pinned loader in the headless
  browser and checks they come out as the tool modelled them. A new
  panorama, or a Three.js upgrade, needs this run.
- `node tools/sky-probe.mjs assets/sky/name_2k.hdr [--png=preview.png]`
  measures a sky panorama (the sun's direction, the sun's irradiance, the
  sky's mean radiance, the horizon's) and writes `assets/sky/name.json`,
  which `src/sky.js` reads; `--png` also writes a tone-mapped preview with the
  sun marked. A new panorama needs this run once. A place's hours also take
  `--taken=` (the photo's time with its offset from UTC) `--at=` (latitude,
  longitude) and, where the sun is down, `--align=` another hour's panorama,
  for what lights them and where north is. The two series were measured so
  (times as Poly Haven gives them, which are local, UTC+2):

  ```sh
  Q=--at=-28.48533209827116,29.012639559934758 L=--at=-28.482577018138976,29.01429985008855
  node tools/sky-probe.mjs assets/sky/qwantani_noon_2k.hdr --taken=2024-08-21T12:18:00+02:00 $Q
  # with --align=assets/sky/qwantani_noon_2k.hdr:
  #   dawn 2024-08-19T06:28, sunrise 08-19T06:43, morning 08-20T08:09, mid_morning 08-20T10:05,
  #   afternoon 08-21T14:04, late_afternoon 08-18T16:04, sunset 08-18T17:09, dusk_1 08-22T17:47,
  #   dusk_2 08-22T18:06, moonrise 08-20T19:41, moon_noon 08-18T21:06
  node tools/sky-probe.mjs assets/sky/lakeside_sunrise_2k.hdr --taken=2024-08-21T06:58:00+02:00 $L
  # with --align=assets/sky/lakeside_sunrise_2k.hdr: dawn 2024-08-21T06:27, night 08-21T19:51;
  # and lakeside (2019, its time stamp off by a quarter of an hour) with --align alone
  ```
- `node tools/jet-probe.mjs [radius] [entrySpeed] [horizontalFraction]`
  checks the slender-jet solver (`src/slenderJet.js`) against the textbook:
  Rayleigh–Plateau's growth rate, Taylor–Culick's retraction speed, the drop
  size of a breaking column, and the water kept; runs one Worthington jet of
  the clean form on the CPU over the bowl its stone's cavity leaves (the
  reference throw by default, checked against the reference simulation's
  timing and heights, and against itself at other frame rates) and prints
  its timeline, drops, water and cost per frame; checks Worthington's marble
  and Truscott and Techet's billiard ball against the surface seal's odds,
  timing and what follows; a horizontal fraction makes it the leaning jet of
  an oblique entry. Part of `npm test`.
- `node tools/variety-probe.mjs [throws=200] [--seed=1] [--aim=x:z] [--sets=default|all|grid] [--list]`
  throws stones as the app does (seed n is the shoot harness's seeded throw n
  at the same aim and power) and prints how their splashes vary: the stones'
  shapes, contacts and spins; how often each jet form and seal comes up (with
  the surface seal's chance); the
  jets' tops, drops and lean, the holes' lopsidedness and the crowns'
  heights, by form (a jet's top is its column's or its drops' highest,
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
- `node tools/spray-probe.mjs` checks the spray's flight (its closed form
  against an integration of Schiller and Naumann's drag for drops of 0.05
  to 1 mm at 1 to 12 m/s, which fits its COAST; the terminal speeds against
  Gunn and Kinzer's; the life the CPU reckons against the landing) and runs
  every stone size's splash at each power, and a skip, on High, Medium and
  Low: the sprites, the drops they stand for, the spray's water, sizes and
  launch speeds, the most in the air (within each preset's ring) and the
  CPU cost a frame; and that a seeded throw writes the same spray twice and
  spends no draw of Math.random on it, and that the ring uploads what was
  written, across its end too. In `npm test`.
- `node tools/cavity-probe.mjs [diameter-in-cm ...] [--aim=x:z] [--seed=n] [--variety=n]` throws and
  drops each stone (1.5, 4, 6, 8 and 16 cm) and runs its cavity on the CPU:
  the timeline (the pinch-off's time and depth, the jet's start, the bowl's
  floor as it rises and when it has flattened), the mouth, the lip and the
  depth over time, and the cost of a frame's mesh; it checks that the cavity
  follows the stone `src/rock.js` moves, that the pinch comes when the
  throw's seal says, the jet with it, that the bowl's floor only rises and
  reaches the surface when the hole is gone, that
  the cone the surface dips into holds the whole hole and the lip covers
  where it dips, that the normals face the air (the floor's centre and,
  after the pinch, the closing point face up however flat the bowl has
  become) and that the crown stands on the lip; then it does the same for
  `--variety` (24) more throws of each size at random aims and powers, every
  one a stone and a hole of its own, and exits with 1 if any check fails.
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
  a splash must keep the waves; the pool, switched to and back, compiles no
  program, draws only its own quads of the water mesh and keeps a throw's
  ring only while its near field is hidden; each weather's rain compiles no
  program, a throw into a downpour and a change to Medium neither, the rain's
  tile takes the preset's size, and a clear sky again stops it; the first
  snow compiles its flakes' one program and every later one, a throw into
  it and a blizzard's gale none more, it adds one draw call, and clear
  again neither falls nor lies; the gale
  compiles no program and draws its finer sheet, a throw into it and the
  storm through a lightning strike neither, and in the pool it raises no
  waves; and pausing and resuming twice
  in one tick must leave one frame loop. On a fake clock it checks that the watch after
  calibration steps down at 20 frames a second and that a still pond on
  Medium draws every other frame with its time keeping up; that on High a
  still pond draws every other frame of a 60 Hz clock and every fourth of a
  120 Hz one, and a throw every other frame of a 120 Hz clock (held to 60 a
  second) and every frame of a 60 Hz one; and that a large window keeps
  within the pixel budget.
- `node tools/zoom-probe.mjs [--w=390 --h=844]` drives the wheel, a pinch, a
  tap and Escape through the page's own handlers and checks that what is under
  the pointer stays there; then drags, by touch and by mouse, and checks that
  they turn the view about its pivot, keep the eye above the water and throw
  nothing, that a drag that starts zoomed turns round what the view shows,
  and that the View choices and Reset view glide where they should; in the
  pool, that the views stand where they should, the eye under its water
  keeps inside its walls and comes back out once turned from one, a glide
  into its water and out goes over the water, and a tap on the deck throws
  inside the walls.
- `node tools/controls-probe.mjs [--root=path] [--label=name]` loads the page
  as phones' browsers do (mobile layout by the viewport tag, touch, 3× pixels)
  at a large phone's portrait and a small phone's portrait and landscape
  (a large phone's landscape has room wherever the small one's does), and in
  a desktop window, and checks that the page is laid out at the device's
  width, every control is on the screen, the strip covers at most 30% of the
  height, the stone slider is 44 points tall (and most of the width in
  portrait) and every button 34, and that a tap or a drag anywhere along the
  slider sets the stone; that the first visit's cue shows on a phone in
  portrait and goes with the first throw; that Toss, Lob and Skip set the
  manner, Soft, Medium and Hard the strength, and the clock goes round 1×, ¼×
  and ⅒×; that the name's dropdown fits over the
  strip (a phone in portrait without scrolling), its pills tall enough for a
  finger, a pill tapped is thrown next, a press on the pond closes it without
  throwing and the keyboard works it; that the settings open with their rows, each
  row's value whole beside its name, the Water page's pictured choices each
  reachable by scrolling, its Frozen freezing the water, Thin and Thick
  under the cards fitting and taking, and Murky thawing it, the Location
  page's Pool putting the rocks in the pool with its own water, the
  Time of day page's slider spans it and, tapped at its left end, loads the
  first hour, and a lone photograph's page hides it, and the Weather page's
  choices, one list of cards, fit and set the weather; it saves each screen to
  `shots/controls-probe/`. The
  shoot harness and the other probes emulate a desktop browser, which ignores
  the viewport tag, so only this probe sees the page as a phone does.
- `window.__pond` exposes the app in the console: `throwAt(x, z, { radius, power, manner, skip, thing, size })`,
  `setPower(name)` (and `power`), `setManner(name)` (and `manner`), `setSkip(on)` (and `skipping`), `setTrace(on)`,
  `setThing(name)` (and `thing`: a key of `THINGS` in `src/things.js`, remembered
  on the device) and `setSize(value)` (and `size`: the slider's value in its unit),
  `setTimeScale` (and `timeScale`), `pause()`, `advance(seconds)` (in the frames the app would
  draw at the current time scale), `setDebugView(name)`, `setFov(degrees)`,
  `lookAt(x, y, z)`, `resetView()`, `setWind(name)` (and `wind`: calm,
  breeze or windy, remembered on the device), `setSky(place)` and
  `setHour(name)` (and `sky`, `pooled`, `hour`, and `hours`, the shown
  place's), `setWater(name)` (and `waterChoice`, and `clarity`, the water
  drawn),
  `prefetchHours()` (fetches the hours either side of the one asked for ahead),
  `setWeather(name)` (and `weather`, and `raining`, once the rain's table
  has come and it falls, and `snowing`), `setIce(name)` (and `ice`, `iceThickness`, and
  `iceSheet`, its holes, cracks and mask), `rings` (the live rings and
  their plans), `dropRings` (the drops' rings drawn, src/dropRings.js), and `budget`: what the preset built (the solver's grid, the
  mesh, the pixel ratio, every target's size, an estimate of the render
  targets' memory, the programs compiled and the warm-up's, whether the
  solver sleeps and the frame rate is capped, the rings drawn, how many
  are fading out and the preset's limit, their passes and the spectrum
  fetches those made, the drops' rings drawn and their limit, the wind, the gale's sheet, the weather, the
  rain's tile, the snow's flakes and cover, the spray's ring, share and sprites drawn, the last frame's draw calls
  and triangles, and how many fixed meshes and waterlines `prepareThing`
  has made).

Install the development dependencies with `npm install` (Three.js is only
needed locally for the headless harness, which serves it instead of the CDN).

## Credits

The sky panoramas are from [Poly Haven](https://polyhaven.com), CC0:
*Meadow 2* by Sergej Majboroda; *Lakeside* by Greg Zaal; *Lakeside Sunrise*,
*Lakeside Dawn*, *Lakeside Night* and the *Qwantani* series (Dawn, Sunrise,
Mid Morning, Noon, Afternoon, Late Afternoon, Sunset, Dusk 1 and 2,
Moonrise, Moon Noon) by Greg Zaal, processed by Jarod Guest, and
*Qwantani Morning* by Jarod Guest; *Lago d'Isola* by Andreas Mischok. The added *Secluded Beach* (backplates by Rico Cilliers),
*Kiara 1 Dawn*, *Kiara 2 Sunrise*, *Kiara 5 Noon*, *Kiara 8 Sunset*,
*Kiara 9 Dusk*, *Rogland Sunset*, *Rogland Clear Night* and
*Rogland Moonlit Night* are by Greg Zaal. Source pages:
[Secluded Beach](https://polyhaven.com/a/secluded_beach),
[Kiara](https://polyhaven.com/a/kiara_8_sunset),
[Rogland](https://polyhaven.com/a/rogland_clear_night).
