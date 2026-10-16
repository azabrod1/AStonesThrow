# A reference simulation of the splash (Basilisk)

The app's splash is a set of closed-form models (`src/cavity.js`,
`src/crown.js`, `src/jet.js`, the ring from the splats in
`tools/splash-probe.mjs`). This folder holds one offline simulation of the
same case, made to compare those models against and tune them to: the app's
reference stone (radius R = 3 cm, density 2600 kg/m³) entering still water
vertically at 6.3 m/s, computed with [Basilisk](http://basilisk.fr) as an
axisymmetric two-phase flow (incompressible Navier–Stokes, a VOF interface
with surface tension, gravity) on an adaptive quadtree. Nothing here runs in
the app or its tests.

## Results (`results/`)

The reference is level 12 with air ten times lighter than real (see below
why); level 11 and level 13 are the resolution checks. Times are from first
contact; R = 3 cm, sqrt(R/g) = 55.3 ms. `comparison.md` sets every number
against the app's for the same vertical entry at 6.3 m/s (app-numbers.mjs).
**State of the files:** the splash's results (the cavity, the jet, the
crown, the stone: their CSV files, plots and rows of the table) were made
when the reference run had reached 0.33 s, against the app of that commit
(`app.json`). The run has since reached 4 s, and the rings come from it:
`rings_linear.csv`, `.md` and `.png` (rings.py: the surface at 1 s followed
on linearly to 8 s), `rings.csv` and `rings.png` (the gauges to 4 s, with that
continuation and the app's ring), the ring rows of the table (from the
continuation) and the ring section of `app.json` (app-numbers.mjs as of the
rings' calibration, `src/rings.js`, with the surface film off as in the
simulation); `summary.json` has the continued ring under `rings` and the
gauges' own measures under `rings_from_gauges`.

- **Cavity.** It pinches off 109.8 ms after contact (1.99 sqrt(R/g); level 11:
  108.7 ms, 1% apart; Duclaux et al.: 2.06), 226 mm down (7.5 R), with the
  stone 13.3 R down (ratio 0.57). The app: 112 ms, 8.2 R, 13.0 R, 0.63. The
  top of the hole is a wide funnel: its wall at the still surface widens to
  3.1 R by the pinch-off and keeps widening as a bowl after it (3.8 R at
  0.2 s); the app's mouth peaks at 1.45 R at 59 ms. After the pinch-off the
  bowl above it is still open, 10 cm deep at 130 ms and 5 cm at 165 ms; the
  app closes the surface at 134 ms.
- **Jet.** A thread a few millimetres thick shoots out of the pinch-off and
  clears the still surface at 118 ms (level 11: 126 ms) at 13 to 16 m/s,
  shedding drops of 2 to 6 mm from 120 ms on; the column's joined top
  reaches 75 cm at 0.2 s and 81 cm at 0.33 s, slowing to about 4 m/s by
  0.25 s, while the bowl's collapse builds a broad cone under it (5 cm across
  at the surface at 0.25 s). The app's jet starts at 134 ms at 3.35 m/s and
  tops out at 0.51 m at 450 ms.
- **Crown.** With the light air it stands open at levels 11 and 12, 11 to
  12 cm high at 0.1 s with its rim 8 to 10 cm out, breaking off rings of 2 to
  14 ml from 27 ms on (an axisymmetric sheet cannot finger). At level 13 its
  thinner sheet closes over the hole (rim 17 mm from the axis at 55 ms). With
  real air it closes over the hole by 36 ms (level 12) or 24 ms (level 13).
  The app's crown peaks at 6.7 cm at 54 ms and tears at 56 ms.
- **Stone.** While the hole is open the force on the app's path fits
  F = Cd·½ρU²πR² + Ch·ρgh·πR² with Cd = 0.46 and Ch = 0.6 (level 11: 0.55 and
  0.86): the head on the stone's front, which the app leaves out, decelerates
  it as much as the drag below 20 cm.
- **Rings.** Past the splash the rings are small linear waves, so rings.py
  follows the surface on from 1 s (its elevation and rate of change then, 2νk²
  damping, 0.8 m deep; `rings_linear.md`). Trough to crest (the largest swing
  within 0.6 s) the ring is about 16 mm at 0.5 m (that window still holds the
  near field), 11.7 mm at 0.75 m, 8.9 mm at 1 m, 5.9 mm at 1.5 m and 4.2 mm at
  2 m; its highest crest passes 1 m at 2.7 s and 2 m at 5.0 s, 36 to 49 cm
  long. From 1.1 s the heights agree within 1% beyond 0.75 m; from 0.8 s they
  are 10 to 15% lower. Against the run's own gauges over 1 to 4 s (the run
  ends before the main crest reaches 2 m at 5 s) the continuation follows the
  main ring wave for wave (rms difference 7 to 9% of the gauges' at 0.75 and
  1 m over the first second, 15% at 1.5 m over three, correlation 0.99; the
  main crests within 2% at 1 m and 9% at 1.5 m). The train of short waves
  behind it carries the gauges' energy (its rms after the main crest within 5%
  at 0.5 to 1 m) but its crests fall elsewhere (rms difference 40% at 1 m and
  70 to 100% at 0.25 to 0.75 m over three seconds): it comes from the centre,
  where the water goes on rising and falling until about 1.6 s (the jet's base
  falls, then a second jet 14 cm high rises on the axis at 1.4 s), and the
  continuation takes the jet's column on the axis at 1 s for a surface.
  Followed on from 2 s instead (`--start 2`), it matches the gauge at 1 m
  within 13% over 2 to 4 s, and the main ring's heights at 1 to 2 m within 4%
  of those from 1 s. At 1 s the ring holds 0.29 J, 5% of the stone's 5.8 J
  (πρg∫|Z|²k dk, Z its complex amplitude; the app's ring 0.32 J). Its long
  waves are robust; its short waves near the centre may be overstated (a real
  crown's drops land incoherently), and with real air this throw seals at the
  surface at 36 ms, which may change the ring by tens of percent. The app's
  ring is fitted to it (`src/rings.js` says how; `tools/ring-probe.mjs` checks
  it).


## The setup, and why

**The stone** is a rigid body imposed by direct forcing: every face inside its
mask carries the stone's velocity into the pressure projection, and the mask
holds the stone's density. The mask is filled with the air the stone carried
in, and the volume fraction is never reset, so no water is created or
destroyed. To the water the stone is a gas-filled body it cannot wet (contact
angle effectively 180°): the "rough stone" of the brief, for which a cavity
always forms (a smooth hydrophilic sphere would need about 7 m/s, Duez et
al. 2007). Only its front half is masked. With the whole sphere, the gas
trapped in a rigid mask can hold suction, and at 123 cells per radius a water
film stays on the rear half and closes over the top, as on a wetting sphere;
the half sphere's rim makes the water leave at the equator, where the
contact line of a non-wetting sphere pins (Marston et al. 2016) and where the
app's cavity starts. The stone follows the app's own path (`src/rock.js`:
quadratic drag with Cd 0.5 and buoyancy-reduced gravity from first contact),
which the app's cavity also follows, so the two compare like for like; the
force the water actually puts on the stone along that path is logged.

**The air** of the reference is ten times lighter than real air (0.12 kg/m³).
With real air this case seals at the surface: the air rushing into the
growing hole (about 0.05 m³/s, at up to 30 m/s) sucks the crown inward until
it closes over the hole: its water reaches the axis 5 to 6 cm up 36 ms after
contact at level 12 and 24 ms at level 13, sooner as the grid lets the sheet
thin (`results/seal.png`). That is expected: Birkhoff & Isaacs' empirical boundary
between deep and surface seal, F = (ρ/ρa)²/6400 (Aristoff & Bush 2009,
figure 19), is F = 108 at 1 atm and this case has F = V²/(gR) = 135, so a real
6 cm stone at 6.3 m/s is just past it (the boundary is 5.6 m/s for this size).
But an incompressible model cannot follow a sealed hole: the trapped air
cannot expand, so the hole becomes a closed bubble that the stone drags down.
Air ten times lighter, as at a tenth of an atmosphere (Gilbarg & Anderson
1948 saw the surface seal disappear at reduced pressure), moves the boundary
to F = 10 800: at levels 11 and 12 the crown stays open and the hole
deep-seals, which is what the app models. At level 13 the crown's thinner
sheet still closes, at about 60 ms, drawn in by its own surface tension like
a water bell (and what suction is left): the crown's fate depends on how thin
the grid lets its sheet get, which an axisymmetric model cannot settle (a real
crown also fingers and tears). The air's inertia matters to nothing else here.

**The pinch-off.** Where the hole pinches, an incompressible solver leaves a
thread of air a cell or two wide on the axis, through which the bubble below
(whose volume the stone, still moving away, keeps changing) must breathe: at
1000 m/s and more, with a time step of 0.3 µs and a suction of 100 kPa on the
stone, for as long as the thread lasts (0.3 ms of simulated time took 10
minutes and was not over). Real air would choke, and at 1 atm it holds the
bubble's volume to a few percent anyway. So a thread thinner than a cell is
filled (`close_necks` in `stone.c`): 0.06 ml of water at the pinch-off,
logged. The first jets out of the pinch are needle-thin and fast (25 to
35 m/s); the drops they throw up are removed above 2 m (four times the app's
jet), where they would otherwise fly for seconds and hold the time step down.

**The cavity's walls ripple.** From about 30 ms (level 12; 15 ms at level 13)
the upper wall of the hole grows ripples 10 to 15 cells long, which fold over
by 60 ms. They are not the air's doing (they come out the same with air 100
times lighter than real and ten times more viscous, so not Kelvin–Helmholtz),
nor reduced.h's (the same with gravity as a body force, `-DBODY_GRAVITY=1`),
nor the removal of small drops and bubbles, nor the mesh in the air. That
their length follows the cell size says they are numerical, seeded perhaps
where the water leaves the stone's rim (a run with the whole sphere rippled
later). They roughen the wall the app draws smooth, and they are the main
reason the cavity's numbers are less certain than they look; the resolution
check below measures by how much.

**The mesh** is adaptive (`adapt_regions`, adapt_wavelet with a maximum level
that depends on the place): the finest level within 0.3 m of the axis, coarser
outward, and a band at the surface held fine enough for the rings out to
2.4 m (2 mm cells to 1.6 m). The velocity is refined only in the water and
next to it: refining the air's 30 m/s jet into the hole changes nothing in
the water (the interfaces agree to the cell at 5 to 14 ms) and costs time. A
sponge beyond 2.6 m and a 4 m domain keep the rings from coming back.

**Resolution.** The machine was shared with two agents rendering on the CPU
(load 16 to 21 on 4 cores), and a level-13 run advanced about 1 ms of
simulated time per minute. So the splash (crown, cavity, pinch-off, the jet's
start) was to come from level 13, 0.49 mm cells and 61 per stone radius. But
at level 13 the crown's sheet is thin enough to close over the hole even with
the light air (its rim drew in from 37 mm at 25 ms to 17 mm at 55 ms, 9 cm
up, and would have closed at about 60 ms), which spoils what follows, so that
run was stopped at 56 ms and checks only the first 55 ms. The reference is
level 12 (0.98 mm, 31 per radius) to 0.2 s and from then on, the jet and the
rings, with the splash zone at level 11 (1.95 mm) to 4 s; level 11
throughout, to 0.2 s, is the coarser check. The brief asked for 100 cells
per radius: not affordable here, and the crown shows why more resolution is
not simply better in an axisymmetric model.

## Files

- `stone.c`: the simulation. Its opening comment documents the setup, the
  arguments and the outputs.
- `run.sh`: builds `stone.c` into a run directory and starts it in the
  background (niced, one thread), or resumes a run killed midway from its
  latest dump.
- `analyse.py`: turns a run into the files under `results/`, with the app's
  numbers and the other resolutions on the plots.
- `app-numbers.mjs`: the app's splash for the same case as time series
  (JSON): the stone's path, the cavity, the crown, the jet and its drops, the
  ring at the gauges' radii (the ring source the app hands `src/rings.js`,
  with the simulation's damping, and the solver's near field).
- `rings.py`: the rings followed on linearly from a run's surface at one
  moment, with the table of their heights, crest times and wavelengths and
  how well they agree with the run's gauges (`--film` adds a pond's
  surface film to the damping, as the app's rings have).
- `seal.py`: the figure of the crown with real air against the reference's.
- `results/`: the reference's numbers (below).

## How to run it

Basilisk's `qcc` must be built ([installation](http://basilisk.fr/src/INSTALL));
`BASILISK` points at its `src/` and is on the `PATH`. Python needs numpy and
matplotlib.

```sh
export BASILISK=/path/to/basilisk/src PATH=$PATH:$BASILISK
tools/basilisk/run.sh runs/L12 level=12 end=4 late=0.2 air=0.12        # the reference
tools/basilisk/run.sh runs/L11 level=11 end=0.2 air=0.12               # the coarser check
tools/basilisk/run.sh runs/L13 level=13 end=0.056 air=0.12             # the finer check (its crown closes)
tools/basilisk/run.sh runs/L12real level=12 end=0.06 air=1.2 airadapt=1   # real air: the surface seal
tools/basilisk/run.sh --resume runs/L12                                # after a restart
node tools/basilisk/app-numbers.mjs runs/app.json
python3 tools/basilisk/rings.py runs/L12 --start 1.0 --end 8 --out tools/basilisk/results   # first: analyse.py reads its rings_linear.csv
python3 tools/basilisk/analyse.py runs/L12 --check runs/L11 --check runs/L13 --app runs/app.json --out tools/basilisk/results
python3 tools/basilisk/seal.py runs/L12 runs/L12real runs/L13 runs/L13real --out tools/basilisk/results/seal.png
```

Each run writes its outputs (`stone.c` lists them) into its directory, with
restart dumps every 25 ms; keep the run directories (tens of megabytes) out of
the repository.
