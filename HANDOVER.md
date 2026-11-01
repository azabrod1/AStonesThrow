# Handover: Loch Ness and the Polynesian lagoon

A cloud session's notes for the local session that picks this up. Delete this
file before `tropical-beach` merges.

## Where things stand

| Branch | State | PR |
|---|---|---|
| `loch-ness` | Done, reviewed, pushed | Draft #41 |
| `tropical-beach` | Reworked locally (below), not yet committed | None yet |

Both branch from `main` and edit the same places (`PLACES` and
`WATER_CLARITIES` in `src/main.js`, the Location and Water cards in
`index.html`, `README.md`, `CLAUDE.md`). Whichever merges second needs a
small conflict fix. Both add the same helpers independently: `placeShore`,
`PLACES[...].water` in `applyWater`, and the `ownWaterName` getter. Keep one
copy of each.

### Loch Ness (`loch-ness`, PR #41)

- `PLACES.loch`: the Highlands sky, a shingle shore, no reeds, peat water
  (`WATER_CLARITIES.peat`), trout, char and minnows.
- `src/lochVisitor.js`: an ambiguous creature (humps, neck, back, or a wake
  only) that surfaces 48–80 m out every 1–2.5 minutes. It has no collider,
  never comes within 36 m of the eye, dives if a thrown thing comes near,
  and stays down under ice or a gale.
- `src/shaders/visitor.js`, in `WATER_FRAGMENT`:
  - the Kelvin wake, by stationary phase;
  - Cauchy–Poisson rings at each breach and dive;
  - capsule contacts where it breaks the surface, with ripples and foam.
- The water fragment shader is at 205 of 224 uniform vectors.
  `tools/visitor-probe.mjs` is in `npm test`; `frame-rate-probe` has a
  `loch` scene.
- Not rerun since its last commit: the full `npm test` and `site-check`.
  Run both before marking it ready.

### Tropical be### Polynesian lagoon (`tropical-beach`; the place's key stays `tropical`)

The first pass (the cove's sky and granite, a 105 m motu) was judged "It looks
terrible" and has been reworked from photographs of Aitutaki's Tapuaetai and
Bora Bora:

- **Sky.** `SKIES.lagoon`: Poly Haven's released *Kloofendal 48d Partly
  Cloudy (Pure Sky)*, its land taken out. Poly Haven's beach HDRIs with palms
  (the "Beach Vault": Alkantstrand, Thompson's Bay, Ingwe, Zula) are still
  locked, and are South African anyway. The sky is very bright against its
  sun, so it is exposed half-way adapted (`adapt: 0.5` in `src/sky.js`).
  Its 8k file is gitignored; never commit it.
- **Land.** `LAGOON_SHORE` in `src/pondFloor.js` and its GLSL twin in
  `LAKE_BED` (`uShoreKind`, which replaced `uKoiPond`, with
  `SHORE_LAKE`/`SHORE_KOI`/`SHORE_LAGOON`): the lake's beach under the eye
  runs on into a motu's along the right of the frame, 430 m to a point. It has
  its own ring mesh (`lagoonLandGeometry`, `lagoonLand` in `src/main.js`).
- **Scenery** (`src/tropics.js`, its opening comment has the detail):
  - coconut palms from a GPU-baked frond atlas, six variants at three levels
    of detail;
  - a beach row and a palm forest;
  - naupaka scrub and fallen coconuts;
  - four motus;
  - a high island at 7 km;
  - aerial haze;
  - the canopy's shade;
  - mip-scaled alpha test;
  - per-instance culling when the camera moves.
  It is built the first time the place is shown (a stand-in palm compiles
  its two programs in the warm-up).
- **Cost.**
  - Home view: 79 draws, 583k triangles (Lakeside 46 and 224k; Koi pond 43
    and 489k).
  - Warm-up: 77 programs, unchanged.
  - Building `Tropics` at page start: about 5 ms. The scenery's build, the
    first time the lagoon is shown: about 115 ms cold on an M1.
  - The first, unculled version drew 2.1M triangles.
- **Passing:** `npm test` (`garden-probe` now names `uShoreKind`),
  `uniform-probe` (water 191 of 224, unchanged), `startup-probe`,
  `site-check`, `controls-probe`, `fish-probe`, `frame-rate-probe`. Changing
  place to the lagoon compiles nothing.
- **Open:**
  - no shadows of the palms on the sand or the water;
  - the reef fish not re-checked in close-ups;
  - no Low-quality reduction of the scenery.

 this work (gotchas)

- **Check triangle winding on any procedural mesh.** The Loch Ness
  creature's tube was wound inward: from outside it drew the far inner
  wall, which looked pale, flat and faceted. The tropical motu was wound
  downward. Verify with a quick Node check of a vertex normal (`node`
  imports `src/*.js` fine), or look at a close-up frame.
- **three.js `bumpScale` is in world units.** 0.9 meant 90 cm of relief.
  Use about 0.01–0.04 for skin or bark.
- **GLSL reserves `out`** (and other keywords) as an identifier.
- **The water's mirror image is cached.** It is redrawn only on view
  changes, or for regions something asks for. Anything that moves on the
  mirror layer must feed `measureSplashImage` / `updateReflection` in
  `src/main.js`, or its reflection freezes. Loch Ness does this
  (`visitorShown`). Swaying palms only update their reflection when the
  view changes, as the reeds do.
- **The foam map is logarithmic** (`FOAM_PATTERN`): half cover at 0.1,
  none under 0.01. Visible lace needs values of about 0.02–0.05.
- **The frame-rate probe compares world state, not drawn state.** Drawn
  positions at a frame time differ by 1e-12 between frame patterns.
- **The harness can aim at a moving thing.** Use `--eval` with
  `p.advance(0.001)` and then `p.lookAt(...)`. For Loch Ness,
  `__pond.visitor.body` gives the creature's position, and
  `__pond.sightVisitor(form, { elapsed, distance, bearing, course })` makes
  it surface.
- **On SwiftShader, run browser probes alone.** Several at once crowd the
  CPU-time budgets (ice, jet, fish, visitor), which then fail beside each
  other but pass alone.

## Handy commands

```bash
git fetch origin && git checkout tropical-beach    # or loch-ness
npm install
npm test
npm run shoot -- --label=tr --sky=tropical --throws=none --times=0.05 --w=960 --h=540
npm run shoot -- --label=tr_up --sky=tropical --throws=none --times=0.05 --fov=40 --look=-2.4:6:0.6   # a beach palm's crown
npm run shoot -- --label=loch --sky=loch --time=sunset --throws=none --times=0.05 --eval="window.__pond.sightVisitor('neck',{elapsed:9,distance:50,bearing:6,course:180})"
npm run site && node tools/startup-probe.mjs
node tools/uniform-probe.mjs
```
