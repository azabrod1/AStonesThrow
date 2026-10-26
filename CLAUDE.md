# CLAUDE.md

Keep this file short. Every future session reads all of it, so most notes belong in a comment beside their code.

## Commands

```bash
npm install                # three (served to the headless harness) and playwright
npm start                  # static server; open http://localhost:8123/
npm test                   # the CPU probes (package.json lists them)
npm run shoot -- --label=name --throws=0:-1.4:0.03 --times=0.1,0.5   # frames into shots/name/; every flag is in tools/shoot.mjs's opening comment; --throws=none for idle water
npm run site && node tools/startup-probe.mjs   # startup-probe and site-check load _site/, so build it first
```

Each tool in `tools/` says what it checks and what it takes in its opening comment (README's tool list has the same); pick the probes a change can break from those.

Local development loads Three.js from jsDelivr through the import map. `npm run site` copies the pinned runtime modules into `_site/vendor/three`, rewrites the published import map to same-origin URLs and adds a modulepreload for every module the page imports.

## Rules

- The Three.js version is pinned in three places: the import map in `index.html`, the CDN route in `tools/shoot.mjs`, and `package.json`. Change all three together, then run `node tools/sky-encode.mjs --verify`: the skies are encoded for UltraHDRLoader's own arithmetic.
- Each module's opening comment is its documentation. Read it before changing the module, and update it when the behaviour changes.
- Units are metres and seconds. The pond is a 6 m square patch; `window.__pond` drives the app (see `README.md`).
- The crown sheet, the forward fan and the cavity are closed-form surfaces evaluated once per rendered frame (`src/crown.js`, `src/cavity.js`); the crown's tear also runs once per frame. Keep it that way: substep work is what a phone pays for. The jet column is the one solver (`src/slenderJet.js`, driven by `src/jet.js`): it steps on its own clock, whole steps up to the splash's time, so a seeded throw's jet is the same at any frame rate; keep it so, and keep its cost in `tools/jet-probe.mjs`'s bound. The spray (`src/spray.js`) is written once per sprite and flown in the vertex shader; its emitters draw from their own seeded streams (`seededRandom`), never `Math.random`, so seeded throws stay as they were.
- Tune the splash by looking at frames: close-ups through `--fov=12 --look=x:y:z` with crops, and the home view. The reference throw `0:-1.4:0.03` (a medium toss) enters at about 41° from vertical, so it is oblique. A throw's arc is its manner's and strength's flight time (`ARC` in `src/main.js`); keep the medium toss as it is, since the splash is tuned to it.
- A stone's physics walks its 320-face mesh (`userData.physics`, `src/thingMeshes.js` `createRockGeometry`: its random draws and corners as they always were, so a seeded throw keeps its splash); what is drawn is the same surface cut finer, its grain and relief the fragment shader's (`src/shaders/stone.js`, in every thing's program, `uStoneKind` 0 for anything but a stone).
- Use descriptive variable names, never single letters.
- The first sky downloads while the pond is built and warmed up (`src/sky.js` Starting); `index.html` asks for it before any module runs, its first-visit files the default sky's (startup-probe checks they match).
- Core throw programs are compiled under the loading veil (`warmUp` in `src/main.js`). Optional rain, snow and gale programs warm only if selected at startup, otherwise compile on first use; Frozen at startup, the warm-up throws into open water first, then breaks a sheet made thin for it (on thick ice its stone would skid, and the first break would build programs mid-throw). Never run a temporary warm-up scene after interaction starts. No preset may change a target's format. Disposing a material's last user deletes its program.
- A quality change rebuilds the solver, the water mesh and every target (`applyQuality`). Whatever samples the solver takes its sizes from `water.gridUniforms`; its textures keep their objects.
- `assets/sky/*.json` is written by `tools/sky-probe.mjs` from its `.hdr`, and the `*_2k.jpg` (Swiss Alps' `_4k.jpg`) the page loads (a JPEG gain map; the site never publishes the `.hdr`) by `tools/sky-encode.mjs`; rerun them, never edit either. A new sky also needs encoding, its `SKIES` entry (`src/sky.js`; orientation chosen from home-view frames), a thumbnail in `assets/sky/thumbs/` and a card on the Location page in `index.html`. A place's hours are probed with `--taken --at` and, sun down, `--align` (the runs are in `README.md`), so the land keeps still between them.
- The settings panel is `src/settingsPanel.js` (What to throw is the code's `thing`; Location its `sky`, a place of `PLACES`: a sky, or the Pool; Water a clarity or Frozen, whose Thin or Thick is `ice`; Effects its `fish`, on or off); each setting but View is remembered under its own `localStorage` key, and a page parameter wins over it.
- Every push to `main` deploys to GitHub Pages (https://azabrod1.github.io/AStonesThrow/). A new runtime folder goes in `SITE_FILES` (`tools/build-site.mjs`); a new Three.js addon and its dependencies go in the build's vendor file list. Use relative paths: the site lives under `/AStonesThrow/`.
- The page is laid out for phones by its viewport tag, which the shoot harness (a desktop browser) ignores: check any change to the page's controls with `tools/controls-probe.mjs`.
- The page opens on Calm wind; frames from before the Wind control are Breeze (`--wind-strength=breeze`; byte-identical when idle until the rings' calibration moved and sharpened the floor's caustics).
- The shore (`SHORE`, `floorDepthAt` in `src/pondFloor.js`) has a GLSL twin, `LAKE_BED` in `src/shaders/scene.js`: change both, or the rocks rest off the drawn bed.
- A stone's ring crosses the pond as `src/rings.js`, not the solver: a ring source given to `water.addSplat` instead would wrap round the 6 m patch. Its source (`RING` in `src/splash.js`) is fitted to `tools/basilisk/`'s ring; refit it there, not by eye.
- The Pool place's water is the patch's middle quarter with mirror-image walls (`setPool`): there the solver carries the ring and `src/rings.js` draws only its hidden near field, turned over (`nearOnly`), both released in one frame (`releasePoolRing`). Change the ring's source in one and you change it in both.
- The fish (`src/fish.js`, drawn by `src/fishMeshes.js` in the under-water pass) are scenery: they never touch the splash or the physics, but a thing thrown frightens them and an `edible` thing (`src/things.js`) is bitten away. Their randomness is their own seeded stream, never `Math.random`. The Koi pond (`PLACES.koi`) is the lake's water inside its own shore: `KOI_SHORE`/`koiFloorDepthAt` in `src/pondFloor.js` and its GLSL twin in `LAKE_BED` (`uKoiPond`): change both; its sky is `garden` (`src/sky.js`, no place of its own), its garden `src/koiGarden.js`, scenery out of reach: aims are kept inside its water (`keepInPond`) and what reaches a bank is caught where the planting is drawn (its catch table, from the garden's own corners). Quality over quantity: a few things done well.
- `assets/rain/` is written by `tools/rain-probe.mjs --write` and `assets/jet/` by `tools/basilisk/sweep.py` (from a sweep of Basilisk runs: `tools/basilisk/README.md`); never edit either. The cloud and haze are the sky's (`setWeather` in `src/sky.js`), the drops `src/rain.js`'s, the flakes `src/snow.js`'s (`flakeAt` is `FLAKE_MOTION`'s CPU twin: change both).
- Under a gale the splash and the stones compute on still water (surface at 0) and are lifted as drawn (`galeLift` in `src/shaders/gale.js`, `Rock.syncMeshes`). Anything new drawn on the water must be lifted too, or it floats or sinks in the waves.
- The ice (`src/ice.js`) is the water's surface frozen: the water's shaders draw it from its mask (`ICE_COMMON` in `src/shaders/scene.js`), so the sheet has no program or mesh of its own; its cracks are one mesh and program of their own (`src/iceCracks.js`, built under the veil by `warmUp`). On it things are on ground (`src/rock.js` `ground`); its only physics of its own is whether it breaks. A hole is fitted to the splash's cavity (`fitCavity`): change the cavity's lip and the hole follows. Its shards are things (`ice-shard`, hidden in `src/things.js`) floating by the plate model; its clock (`setTime`) runs each physics step, and anything dear it does (a hole's new ice) is spread over steps.
- Add files by name, never `git add -A`. `shots/` is ignored and stays local.

## The cloud container

- WebGL renders headless through SwiftShader. It is correct but slow, so frame rates measured there mean nothing.
- Every tool that opens a browser launches it through `tools/browser.mjs`: the GPU when there is one (a Mac's Metal), SwiftShader otherwise. CI's browser probes run on a macOS runner's GPU (`PW_GPU=hardware` in `.github/workflows/check.yml`). Frames differ slightly between the two, so compare frames from one renderer; `PW_GPU=software` forces SwiftShader.
- WebGPU compute and offscreen render-to-texture with readback work headless, on a localhost page only. Presenting a WebGPU canvas fails, so capture WebGPU frames by reading back an offscreen texture.
