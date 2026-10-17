# A Stone’s Throw

Throw rocks into a lake, or a tiled pool, and watch the splash. A WebGL toy
built with Three.js: the water is a real wave solver, the splash is
choreographed from the physics of a stone entering water, and the droplets
are rendered as water.

Live at https://azabrod1.github.io/AStonesThrow/, published from `main` by
GitHub Pages on every push. Locally, open `index.html` through any static
server (`npm start`, then http://localhost:8123/). There is no build step.
Three.js loads from a CDN.

Tap or click the water to throw a rock there (beyond the simulated patch,
at its nearest point). Space throws one at random; the rocks are always
thrown from the shore. Press and hold still for a moment and a hand dips
into the water there instead: drag to trail it through, leaving a wake, and
let go to lift it out (`src/touch.js`). Drag the water to walk the view round the pond and
up or down (from just above the water to nearly straight down), and scroll
or pinch to zoom toward what is under the pointer (down to an 8° field of
view); a drag that starts zoomed turns round what the view is looking at.
Escape or Reset view glides back to the shore. The strip at the bottom sets
the size of what is thrown (a stone 1.5 to 30 cm across, a bowling ball 6
to 16 lb, a basketball size 5 to 7, a gem 5 to 1000 carats; a golf or a
tennis ball has one size), the throw strength, Skip and the speed (real
time, or slow motion at ¼ or ⅒). With Skip on, a flat stone is thrown low
and level, spinning, and skips across the water (below), in the direction
of the tap (even on the sky); its first touch lands where a level throw
puts it. The menu button at the
top right opens the settings, laid out as the Moon app's menu is: a list in
four groups (what is thrown: Object; the place: Location, Water and Time of
day; the conditions: Weather and Wind; the viewing: View and Quality), each row an icon, its name
over a line on what it sets and where it stands, and each setting a page of
its choices (Location and Water as pictures) with a line on each. Each choice
is remembered on the device (but the view, which opens on the shore):
- Object (`?thing=`, what is thrown): a river stone (the default), slate, granite,
  basalt or pumice; a golf ball, a tennis ball, a bowling ball or a
  basketball; a gem; an apple, a watermelon or a pizza; a brick. Each is
  pictured, in a fold for its group (Stones, Balls, Gems, Other; the
  chosen thing's open, one at a time; tapping one closes the settings, so
  the next tap on the water throws it),
  each the size, weight and density of the real thing (`src/things.js`), and
  the throw button names it ("Throw a rock", "Throw a ball", "Throw a
  pizza"). Pumice, a tennis ball, a basketball and a bowling ball
  of 11 lb or less are lighter than water: they come back up, bob and
  float (a basketball 4.3 cm under, mirrored in the water, drifting under a
  gale), as do an apple (low: a quarter of it is air), a watermelon (2 to
  10 kg, nearly as heavy as water: it plunges deep, comes back up slowly
  and floats with only its striped back showing) and a pizza (a soft
  disc made by hand, its outline and crust uneven: thrown, it spins level
  like a frisbee, wobbling, its edges cupped against the air; afloat, its
  toppings up and dry, as much of it under as Archimedes says). A floater
  rides the water as it is drawn, ripples, rings and wind waves, rising
  and tilting with them, and the water meets it at its true surface (a
  pizza's crust holds it off the toppings); the rest sink, a golf ball
  slowly, basalt fastest. A gem (diamond, emerald, ruby or sapphire, cut and
  faceted, 5 to 1000 carats) sinks, as does a brick (2.7 kg of fired clay).
  Each choice's picture (`assets/things/thumbs/`) is a harness frame of
  the thing at rest on the pool's deck, its middle 70% shrunk to 160×90:
  `--water=pool --throws=none --times=0.05 --look=0.25:y:0.85 --fov=f`
  (y the deck's 0.1 m plus its radius, f = 2·atan(1.25·d/1.8) for its
  diameter d; a stone 10 cm, a gem 3 cm, a pizza 30 cm, a watermelon 25 cm,
  a brick 21.5 cm) and `--eval` throwing it, turning
  it upright and laying it there with `restOn(0.1)`.
  Anything thrown at a floater knocks it: they bounce off each other, the
  floater dipping, ringing the water and throwing off spray, and the knock
  passes on to whatever it is driven into, floaters and the pool's walls
  (which send things back off them) alike. Floaters and things at rest on
  the deck stay in sight; a throw retires the oldest thing out of sight. In the pool,
  anything that comes down on the deck bounces as it would on paving (a
  basketball back to 70% of its fall, a bowling ball hardly at all) and
  rolls or tumbles to a stop, or off the edge into the water. A splash
  meets the pool's walls and deck as well: its sheet and jet run up a wall
  they reach, drops that hit a wall's side fall back into the pool, and
  those thrown over it land on the paving, big ones splattering, and leave
  it wet where they fall; the more come down, the darker and longer it
  stays wet, drying from the edges over up to forty seconds. The pool's
  waves break: throw after throw into one corner no longer piles them into
  glassy humps, as they spill their energy once they stay too steep.
- View: Shore, standing on the bank as the page opens; Low, down at the
  water, the splash against the far shore; High, from above, the rings
  spreading over the pond; Under, under the water, looking up at the rocks
  coming down through the sky's bright window, their air cavities silver
  mirrors, the sun's shafts slanting down. A choice glides there; a drag
  turns from it (under the water it stays under). In the pool, Shore stands
  on the deck at the pool's near corner looking down into it, Low just
  inside its near wall, and under the water the eye keeps inside its walls.
- Water: Clear, a spring's, bluer and clearer; Lake, the
  default, a clear Alpine lake's (bright sand in the shallows,
  turquoise-blue where it is deep); Pond, a green pond's; Murky, a lake
  after rain; Pool, a tiled pool on a deck in a lawn (below). Each choice's
  picture (`assets/water/thumbs/`) is a harness frame shrunk to 160×90:
  `--water=name --throws=0:-1.4:0.03 --times=1.0 --seed=1
  --orbit=0:35:2.4:0:0:0.8`, which looks out from over the bank so the
  sand's fading shows each water's clarity (the pool: its shore view,
  cropped to the pool). The lake bed
  slopes down from the shore, 0.7 m deep at the bottom of the view to 1.7 m
  where the rocks land and 3.5 m far out, so the sand shows in the shallows
  and is gone where the rocks land, and with it the light a ring throws on
  it. Behind the waterline, just behind the shore view, a sand beach rises
  into a grassy bank that takes its colour from the sky photo's own land, so
  turned round, the view sees a shore rather than water to the horizon.
- Location (the sky photo, `?sky=`): Lakeside (the default), Mesas, Meadow,
  Alpine or Open sky, each a panorama of a place, its land and its sky. The
  photo (about 6 MB) loads while the old sky stays; then the sky, the sun's
  direction and colour and everything they light change at once.
- Time of day: Lakeside and Mesas were each photographed from one spot
  through a day, and a slider picks the hour: Lakeside's dawn, sunrise,
  afternoon and starlit night, Mesas' twelve hours from dawn to moonrise and
  moonlight. The land keeps still and the sun moves round it: Lakeside faces
  its afternoon sun, Mesas its sunrise and moonrise. By night the eye sees
  as its rods do, in a moonlit blue. Another place takes its hour nearest the
  time of day last chosen; the other skies are one photograph each.
- Weather: Clear (the default), Light rain, Heavy rain or Storm. Rain comes under
  an overcast that hides the sun and greys the sky, with a haze that fades
  the far shore; its drops ring the water, streak past the eye and throw up
  flecks where they land, and the pool's deck goes dark with wet. A light
  rain's rings are fine and far apart; a downpour hammers the whole surface.
  Rain at night is dark: the cloud hides the moon. A storm is a downpour
  under a darker sky, with lightning, and brings a gale.
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

**The pool** (`src/pool.js`, `setPool` in `src/spectralWater.js`). The
Pool water puts the rocks in a 3 m square pool, 1.4 m deep, tiled, its
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

**Things** (`src/things.js`, `src/thingMeshes.js`, `src/rock.js`). What
can be thrown is a registry of definitions (`defineThing`), plain data in the
parts a physics engine gives a body: its body (a sphere, or its mesh's own
shape; its density and how the slider sizes it), its material (bounce,
friction, rolling), its drag in the air, its rest on the bed, its look (a
mesh builder, `registerMesh`, and its parameters) and what it can do (skip;
be held to a human throw). A definition is checked (`validateThing` says
what is wrong), so one can come from outside: `__pond.defineThing(key,
definition)` adds a thing, and the Object page shows it. A new thing
is a definition; a new look, a mesh builder; a new body or flight (a
feather's flutter), a body or air model in `src/rock.js`. What is thrown is a kind
of stone (the river stone's procedural geometry in its own squash, lumps,
colours and density) or a ball (an icosphere painted per vertex: a
basketball's seams, a tennis ball's, a golf ball's dimples, a bowling ball's
swirl and finger holes), all drawn with one material, so a new kind compiles
nothing. Under the water each moves with its own density's drag, head, lift
and buoyancy, divided by its inertia with the water it carries (half the
water it displaces, against the reference stone's, whose fit already holds
it: a basketball carries six times its own mass). A floater rises once its
hole has closed and floats on the water over its submerged cap, damped by
the waves it makes, and rests at Archimedes' depth. A ball is aimed against
the air's drag and thrown no faster than it can be (`aimThrow`); a lighter
thing throws a slower jet (`lightJet` in `src/splash.js`).
Things meet things in `src/collide.js`: spheres exchanging a collision's
impulse (momentum kept, the bounce of the pair's materials, a floater's
mass counting the water it carries), gone over several times a step with
the pool's walls so a knock passes along a row within the step.
`tools/thing-probe.mjs` checks the sizes, aims, depths, bounces and meetings.

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

**Skipping** (`src/rock.js`, a Skip throw). The thrower picks a flat stone
and lets it go from a crouch, 30 cm over the water, nearly level, at 7, 10
or 13 m/s (Soft, Normal, Hard; a stone over 8 cm across goes slower), its
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
layer of bubbles, lets the water show through. The larger bubbles have clear
centres and bright rims, with milky fine bubbles between them. The map's
separate boil and raft amounts control this material: fresh, dense froth
scatters more light; as it drains, the water shows through the bubble films.
Those films use the existing bubble cells and fade to their measured mean
opacity at a distance, adding no texture or noise layer. A 4 cm stone's raft is gone
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
the raft is dense. The specks flatten into ellipses at a grazing view and
fade with their projected area, so distant bubbles do not remain bright,
camera-facing flecks.

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
(a lakeside with a far shore by default, or one of four others) on a dome at the far
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
power 0.25 (an eye that adapts most of the way) and, below 10 lux, where
the rods take over, to 0.1 further: sunset comes out 0.56 of the
afternoon's, twilight at 5° below the horizon a tenth, moonlight 0.07 and
a starlit night 0.04. While the sun is down the scene's sun is dark, or is
the moon, a full moon's light 400,000 times the sun's at its elevation; the
deep water's colour dims with the light. Below 10 lux the picture also
turns towards what rods see, colourless and blue-shifted (Jensen et al.'s
scotopic luminance, in the tone map), fully by 0.03 lux.

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
the eye's 1/30 s, slanted by the wind, in a 20 m box about the eye; where a
drop lands near where the eye looks, a fleck of white rises and falls.

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

- `npm test` runs `tools/fft-test.mjs`, `tools/wave-probe.mjs`,
  `tools/foam-probe.mjs`, `tools/cavity-probe.mjs`, `tools/ring-probe.mjs`,
  `tools/rain-probe.mjs`, `tools/gale-probe.mjs`, `tools/skip-probe.mjs` and
  `tools/thing-probe.mjs`;
  each exits with 1 if a check fails.
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
  `src/` and `assets/`. A new file or folder loaded at run time outside those
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
  about 30° from vertical), `--skip` (skip throws, the times counted from
  the first touch), `--trace` (each stone's path drawn as a line),
  `--wind-strength=calm|breeze|windy|gale` (the page's
  own default is calm), `--weather=clear|light-rain|heavy-rain|storm` (waits for
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
  `?windStrength=calm|breeze|windy|gale` (`--wind-strength=` for the harness)
  sets its strength, over the one the Wind setting last chose on the device
  (kept in `localStorage`); calm otherwise.
- `?sky=name` on the page (`--sky=name` for the harness) picks the sky's
  place, a key of `SKIES` in `src/sky.js`, over the one last chosen on the
  device (`sunrise`, the old Sunrise sky, is Lakeside at sunrise), and
  `?time=hour` (`--time=` for the harness) its hour, over the one nearest the
  time of day last chosen (the harness's browser keeps none: the place's
  anchor hour); `?water=clear|lake|pond|murky` (`--water=` for the harness) the
  water's clarity, `WATER_CLARITIES` in `src/main.js`;
  `?weather=clear|light-rain|heavy-rain|storm` (`--weather=` for the harness) the
  weather, `WEATHERS` in `src/main.js`, over the one last chosen on the
  device (a storm brings a gale, unless `?windStrength` says otherwise).
- `?view=shore|level|high|under` on the page (`--view=` for the harness) opens on
  one of the View setting's choices (`VIEWS` in `src/main.js`);
  `--orbit=azimuth:elevation:distance[:x:y:z]` stands the harness's camera on
  any orbit (degrees, degrees, metres, and the pivot; `src/viewOrbit.js`).
  The rocks are thrown from the shore whatever the view.
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
  tile takes the preset's size, and a clear sky again stops it; the gale
  compiles no program and draws its finer sheet, a throw into it and the
  storm through a lightning strike neither, and in the pool it raises no
  waves; and pausing and resuming twice
  in one tick must leave one frame loop. On a fake clock it checks that the watch after
  calibration steps down at 20 frames a second and that a still pond on
  Medium draws every other frame with its time keeping up; and that a large
  window keeps within the pixel budget.
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
  at a large phone's portrait and landscape and a small phone's portrait and
  landscape, and in a desktop window, and checks that the page is laid out at the device's
  width, every control is on the screen, the strip covers at most 30% of the
  height, the stone slider is 44 points tall (and most of the width in
  portrait) and every button 34, and that a tap or a drag anywhere along the
  slider sets the stone; that the settings open with their seven rows, each
  row's value whole beside its name, the Water page's pictured choices each
  reachable by scrolling and its Pool and Murky taking, the
  Time of day page's slider spans it and, tapped at its left end, loads the
  first hour, and a lone photograph's page hides it, and the Weather page's
  choices set the weather; it saves each screen to
  `shots/controls-probe/`. The
  shoot harness and the other probes emulate a desktop browser, which ignores
  the viewport tag, so only this probe sees the page as a phone does.
- `window.__pond` exposes the app in the console: `throwAt(x, z, { radius, power, skip, thing, size })`,
  `setSkip(on)` (and `skipping`), `setTrace(on)`,
  `setThing(name)` (and `thing`: a key of `THINGS` in `src/things.js`, remembered
  on the device) and `setSize(value)` (and `size`: the slider's value in its unit),
  `setTimeScale` (and `timeScale`), `pause()`, `advance(seconds)` (in the frames the app would
  draw at the current time scale), `setDebugView(name)`, `setFov(degrees)`,
  `lookAt(x, y, z)`, `resetView()`, `setWind(name)` (and `wind`: calm,
  breeze or windy, remembered on the device), `setSky(place)` and
  `setHour(name)` (and `sky`, `hour`, and `hours`, the shown place's),
  `setWeather(name)` (and `weather`, and `raining`, once the rain's table
  has come and it falls), `rings` (the live rings and
  their plans), and `budget`: what the preset built (the solver's grid, the
  mesh, the pixel ratio, every target's size, an estimate of the render
  targets' memory, the programs compiled and the warm-up's, whether the
  solver sleeps and the frame rate is capped, the rings drawn, how many
  are fading out and the preset's limit, their passes and the spectrum
  fetches those made, the wind, the gale's sheet, the weather and the
  rain's tile).

Install the development dependencies with `npm install` (Three.js is only
needed locally for the headless harness, which serves it instead of the CDN).

## Credits

The sky panoramas are from [Poly Haven](https://polyhaven.com), CC0:
*Meadow 2* by Sergej Majboroda; *Lakeside* by Greg Zaal; *Lakeside Sunrise*,
*Lakeside Dawn*, *Lakeside Night* and the *Qwantani* series (Dawn, Sunrise,
Mid Morning, Noon, Afternoon, Late Afternoon, Sunset, Dusk 1 and 2,
Moonrise, Moon Noon) by Greg Zaal, processed by Jarod Guest, and
*Qwantani Morning* by Jarod Guest; *Lago d'Isola* by Andreas Mischok;
and *Kloofendal 48d Partly Cloudy (Pure Sky)* by Greg Zaal, its sky edited by
Jarod Guest.
