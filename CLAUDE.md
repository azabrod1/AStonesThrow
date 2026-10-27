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

Local development loads Three.js from jsDelivr through the import map. `npm run site` copies the pinned runtime modules into `_site/vendor/three` and rewrites the published import map to same-origin URLs.

## Rules

- The Three.js version is pinned in three places: the import map in `index.html`, the CDN route in `tools/shoot.mjs`, and `package.json`. Change all three together, then run `node tools/sky-encode.mjs --verify`: the skies are encoded for UltraHDRLoader's own arithmetic.
- Each module's opening comment is its documentation. Read it before changing the module, and update it when the behaviour changes.
- Units are metres and seconds. The pond is a 6 m square patch; `window.__pond` drives the app (see `README.md`).
- The crown sheet, the jet column, the forward fan and the cavity are closed-form surfaces evaluated once per rendered frame (`src/crown.js`, `src/jet.js`, `src/cavity.js`); their tear and breakup also run once per frame. Keep it that way: substep work is what a phone pays for.
- Tune the splash by looking at frames: close-ups through `--fov=12 --look=x:y:z` with crops, and the home view. The reference throw `0:-1.4:0.03` (a medium toss) enters at about 41° from vertical, so it is oblique. A throw's arc is its manner's and strength's flight time (`ARC` in `src/main.js`); keep the medium toss as it is, since the splash is tuned to it.
- Use descriptive variable names, never single letters.
- Core throw programs are compiled under the loading veil (`warmUp` in `src/main.js`). Optional rain and gale programs warm only if selected at startup, otherwise compile on first use. Never run a temporary warm-up scene after interaction starts. No preset may change a target's format. Disposing a material's last user deletes its program.
- A quality change rebuilds the solver, the water mesh and every target (`applyQuality`). Whatever samples the solver takes its sizes from `water.gridUniforms`; its textures keep their objects.
- `assets/sky/*.json` is written by `tools/sky-probe.mjs` from its `.hdr`, and the `*_2k.jpg` and `*_horizon.jpg` the page loads (JPEG gain maps; the horizon strip is cut from Poly Haven's 8k file, downloaded and gitignored, never committed; the site never publishes an `.hdr`) by `tools/sky-encode.mjs`; rerun them, never edit any. A new sky also needs encoding, its `SKIES` entry (`src/skies.js`; orientation chosen from home-view frames), a thumbnail in `assets/sky/thumbs/` and a card on the Location page in `index.html`. A place's hours are probed with `--taken --at` and, sun down, `--align` (the runs are in `README.md`), so the land keeps still between them. The first sky's download starts in `index.html`'s head (`startFirstPanorama`), whose choice of it is a twin of `src/main.js`'s: change both.
- The settings panel is `src/settingsPanel.js` (What to throw is the code's `thing`, Location its `sky`); each setting but View is remembered under its own `localStorage` key, and a page parameter wins over it.
- Every push to `main` deploys to GitHub Pages (https://azabrod1.github.io/AStonesThrow/). A new runtime folder goes in `SITE_FILES` (`tools/build-site.mjs`); a new Three.js addon and its dependencies go in the build's vendor file list. Use relative paths: the site lives under `/AStonesThrow/`.
- The page is laid out for phones by its viewport tag, which the shoot harness (a desktop browser) ignores: check any change to the page's controls with `tools/controls-probe.mjs`.
- The page opens on Calm wind; frames from before the Wind control are Breeze (`--wind-strength=breeze`; byte-identical when idle until the rings' calibration moved and sharpened the floor's caustics).
- The shore (`SHORE`, `floorDepthAt` in `src/pondFloor.js`) has a GLSL twin, `LAKE_BED` in `src/shaders/scene.js`: change both, or the rocks rest off the drawn bed.
- A stone's ring crosses the pond as `src/rings.js`, not the solver: a ring source given to `water.addSplat` instead would wrap round the 6 m patch. Its source (`RING` in `src/splash.js`) is fitted to `tools/basilisk/`'s ring; refit it there, not by eye.
- The Pool water is the patch's middle quarter with mirror-image walls (`setPool`): there the solver carries the ring and `src/rings.js` draws only its hidden near field, turned over (`nearOnly`), both released in one frame (`releasePoolRing`). Change the ring's source in one and you change it in both.
- `assets/rain/` is written by `tools/rain-probe.mjs --write`; never edit it. The cloud and haze are the sky's (`setWeather` in `src/sky.js`), the drops `src/rain.js`'s.
- Under a gale the splash and the stones compute on still water (surface at 0) and are lifted as drawn (`galeLift` in `src/shaders/gale.js`, `Rock.syncMeshes`). Anything new drawn on the water must be lifted too, or it floats or sinks in the waves.
- Add files by name, never `git add -A`. `shots/` is ignored and stays local.

## The cloud container

- WebGL renders headless through SwiftShader. It is correct but slow, so frame rates measured there mean nothing.
- Every tool that opens a browser launches it through `tools/browser.mjs`: the GPU when there is one (a Mac's Metal), SwiftShader otherwise and on CI. Frames differ slightly between the two, so compare frames from one renderer; `PW_GPU=software` forces SwiftShader.
- WebGPU compute and offscreen render-to-texture with readback work headless, on a localhost page only. Presenting a WebGPU canvas fails, so capture WebGPU frames by reading back an offscreen texture.
