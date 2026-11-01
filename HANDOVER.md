# Handover: Loch Ness and Tropical beach

A cloud session's notes for the local session that picks this up. Delete this
file before `tropical-beach` merges.

## Where things stand

| Branch | State | PR |
|---|---|---|
| `loch-ness` | Done, reviewed, pushed | Draft #41 |
| `tropical-beach` | First pass, pushed; **the user found it not good enough** (below) | None yet |

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

### Tropical beach (`tropical-beach`, commit 14aaf8d)

- `PLACES.tropical` reuses the **cove** sky. It has its own shore
  (`SHORE_LOOKS.coral`) and water (`WATER_CLARITIES.lagoon`), plus
  `src/tropics.js`:
  - procedural coconut palms on the beach;
  - a sand motu 105 m out with palms and shrubs;
  - reef fish (`sergeant`, `yellowTang`, `blueTang` in `src/fish.js` and
    `src/fishMeshes.js`).
- Passing: all CPU probes, `uniform-probe`, `startup-probe` (15/15),
  `site-check`. `controls-probe` fails 3 checks ("River stone" cut off), and
  fails the same 3 on `main`.

## What the user asked for next (the actual task)

The user's verdict on the tropical beach: "It looks terrible". They want:

- a **real photo of a tropical beach** to build on;
- **rich green vegetation** and a **wonderful sand beach**;
- **not many large rocks** in the background (the cove sky's granite
  boulders are the problem);
- **palm trees that look real**, not simple geometric shapes;
- AAA-game quality.

Why the cloud session couldn't do it: its network policy blocked every image
host. Poly Haven, Wikimedia, Unsplash, jsDelivr and Hugging Face were all
refused; only npm, PyPI and GitHub clones got through. **A local session
has no such limit**, so this is now possible.

### Suggested plan

1. **The sky: a real beach HDRI.** Poly Haven (CC0) candidates, checked
   2026-11-01:
   - **Released:** [Spiaggia di Mondello](https://polyhaven.com/a/spiaggia_di_mondello)
     is a sunny sand beach with turquoise water and no big boulders. Its
     trees are coastal ones, not palms.
   - **Locked in the "Beach Vault"** (check whether they're out now):
     [Alkantstrand Radio Station](https://polyhaven.com/a/alkantstrand_radio_station),
     a sunny beach with palms and the best match;
     [Thompson's Bay Dawn](https://polyhaven.com/a/thompsons_bay_dawn), with
     palms and greenery; Ingwe Beach Sunny; Zula Beach.
   - Add the chosen sky as a new `SKIES` entry. The pipeline is in
     `CLAUDE.md` (the rule on `assets/sky/*.json`) and the runs are in
     `README.md`. In short:
     1. Download the `_2k.hdr`, and the 8k file for the horizon strip
        (gitignored, never committed).
     2. Run `tools/sky-probe.mjs` to write the `.json`.
     3. Run `tools/sky-encode.mjs` to write the `_2k.jpg` and
        `_horizon.jpg`.
     4. Choose its orientation (`sunAzimuth`, `mirrored`) from home-view
        frames.
   - Point `PLACES.tropical.sky` at the new sky and drop the cove boulders
     there: `boulders.show` keys them by sky name.
2. **The palms and vegetation: real models.** Replace the procedural palms in
   `src/tropics.js` with scanned or authored glTF models (CC0: Poly Haven's
   plant models, the tropical "Smuggler's Cove" collection). Load them with
   GLTFLoader. GLTFLoader and its dependencies must be added to the build's
   vendor file list in `tools/build-site.mjs`.
   - Mirror them in the water: enable `MIRROR_LAYER`.
   - Sway them in the vertex shader. `PALM_MOVE` in `src/tropics.js` has the
     wind model and its uniforms.
   - Build their programs under the loading veil: `tropics.setVisible(true)`
     in `warmUp` already does this.
   - Watch the triangle budget on phones; use LODs, or the motu at a lower
     detail.
   - Keep or drop the motu depending on the photo. If the photo has its
     own land, the motu may fight it.
3. **The sand.** `SHORE_LOOKS.coral` in `src/pondFloor.js` drives the
   beach and the bed. A real PBR sand texture (Poly Haven's
   "Textures > Ground > Sand") would need `LAND_FRAGMENT` and `FLOOR_SAND`
   in `src/shaders/scene.js` to sample it. Mind the 16-texture limit, and
   check with `tools/uniform-probe.mjs`.
4. Re-shoot the thumbnail (`assets/sky/thumbs/tropical.jpg`, 320×180, from a
   640×360 home-view frame). Update `README.md`'s Location and "The
   tropics" sections, and the `CLAUDE.md` line on the Tropical beach.

## Lessons from this work (gotchas)

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
