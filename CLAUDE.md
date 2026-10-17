# CLAUDE.md

Keep this file short. Every future session reads all of it, so most notes belong in a comment beside their code.

## Commands

```bash
npm install                # three (served to the headless harness) and playwright
npm start                  # static server; open http://localhost:8123/
npm test                   # CPU checks: the solver's FFT, splat spectrum, Nyquist bins, half floats and pool walls (fft-test), the wind ripples and the Wind control (wave-probe), the foam pattern (foam-probe), the cavity (cavity-probe), the rings (ring-probe), the raindrop's ring (rain-probe), the gale's waves (gale-probe), skipping (skip-probe), the things thrown (thing-probe)
npm run shoot -- --label=name --throws=0:-1.4:0.03 --times=0.1,0.5   # frames into shots/name/; --seed=1 --fov --look --crop --report --eval --floats=half --sky=name --time=hour --weather=light-rain|heavy-rain|storm --water=pool|murky --wind=x:z --wind-strength=breeze --power=soft --thing=basketball|bowling:16 --view=high --orbit=az:el:dist --touch=x0:z0:x1:z1:s --skip --trace; --throws=none for idle water
node tools/jet-probe.mjs 0.03 6.3      # one Worthington jet on the CPU: timeline, drops, cost
node tools/fan-probe.mjs 0.03 6.9 0.68 # the forward fan of an oblique entry on the CPU
node tools/splash-probe.mjs            # the whole splash on the CPU for each stone size: crown, jet, drops, ring, cost per frame
node tools/ring-probe.mjs --gpu        # the rings against the solver, each ring's retirement and drawn profile, the fit to tools/basilisk's ring, a minute of throwing's cost; --gpu reads the GPU's back
node tools/cavity-probe.mjs            # the stone's cavity on the CPU for each size: timeline, pinch, closure, cost; checks the hole hides the surface, for random throws too
node tools/pool-probe.mjs              # the pool's waves on the CPU: how long a splash's ripples run round the basin, and that the solver sleeps only once they are gone (POOL_SLEEP_SECONDS)
node tools/thing-probe.mjs             # each thing thrown (src/things.js): its aim, depth, float or sink, rest; the pool's deck; things meeting things and walls (src/collide.js)
node tools/variety-probe.mjs           # how splashes vary throw to throw on the CPU (seed n = the harness's seeded throw n): jet forms, seals, tops, tip drops, lean; --list per throw
node tools/skip-probe.mjs              # Skip throws on the CPU: skips per throw, hops, angles in and out, where it goes in, cost; ?trace=1 on the page draws the paths
node tools/zoom-probe.mjs              # drives the page's zoom, orbit and touch handlers: the anchor stays put, a drag turns and never throws, the views glide, a held press dips a finger
node tools/sky-probe.mjs assets/sky/meadow_2_2k.hdr   # measures a sky panorama into assets/sky/meadow_2.json
node tools/rain-probe.mjs --write      # the raindrop's ring on the CPU: timeline, checks; --write rewrites assets/rain/ring.json and ring_profile.bin
node tools/gale-probe.mjs              # the gale's waves on the CPU with the GPU's passes: height, peak, downwind, the CPU's surface, breaking, mip roughness, cost
node tools/wave-probe.mjs              # the wind ripples on the CPU: real field, rms slope, travel direction, mip roughness, cost
node tools/foam-probe.mjs              # the foam's bubble pattern on the CPU: the shader's fade constants, antialiasing against supersampling, cost
node tools/quality-probe.mjs           # every preset builds its sizes (__pond.budget) from every other, the calibration and its watch step down, the idle frame cap, pause/resume, no program at the first throw
node tools/profile-probe.mjs           # runs ?profile=1 headless and checks the report's shape (its milliseconds mean nothing here)
node tools/controls-probe.mjs          # the controls as phones' browsers lay them out (viewport tag, touch, 3×): sizes, fit, the slider's tap and drag
npm run site && node tools/site-check.mjs   # build what Pages publishes into _site/ and load it under /AStonesThrow/
```

There is no build step. The page loads Three.js from jsDelivr through the import map in `index.html`.

## Rules

- The Three.js version is pinned in three places: the import map in `index.html`, the CDN route in `tools/shoot.mjs`, and `package.json`. Change all three together.
- Each module's opening comment is its documentation. Read it before changing the module, and update it when the behaviour changes.
- Units are metres and seconds. The pond is a 6 m square patch; `window.__pond` drives the app (see `README.md`).
- The crown sheet, the jet column, the forward fan and the cavity are closed-form surfaces evaluated once per rendered frame (`src/crown.js`, `src/jet.js`, `src/cavity.js`); their tear and breakup also run once per frame. Keep it that way: substep work is what a phone pays for.
- Tune the splash by looking at frames: close-ups through `--fov=12 --look=x:y:z` with crops, and the home view. The reference throw `0:-1.4:0.03` enters at about 41° from vertical, so it is oblique.
- Use descriptive variable names, never single letters.
- Every GPU program is compiled under the loading veil (`warmUp` in `src/main.js`): a new material must be drawn there, and no preset may change a target's format, or the first throw stutters. Disposing a material's last user deletes its program.
- A quality change rebuilds the solver, the water mesh and every target (`applyQuality`). Whatever samples the solver takes its sizes from `water.gridUniforms`; its textures keep their objects.
- `assets/sky/*.json` is written by `tools/sky-probe.mjs` from its `.hdr`; rerun the probe, never edit the JSON. A new sky also needs its `SKIES` entry (orientation chosen from home-view frames), a thumbnail in `assets/sky/thumbs/` and a card on the Location page in `index.html`. A place's hours are probed with `--taken --at` and, sun down, `--align` (the runs are in `README.md`), so the land keeps still between them.
- The settings (Location, the code's `sky`; Water; Time of day; Weather; Wind; View; Quality) live in the panel the top-right button opens (`src/settingsPanel.js`); each remembered setting (all but View) has its own `localStorage` key, and a page parameter wins over it.
- Every push to `main` deploys to GitHub Pages (https://azabrod1.github.io/AStonesThrow/). Only `index.html`, `src/` and `assets/` are published (`SITE_FILES` in `tools/build-site.mjs`); a new runtime folder goes there too. Use relative paths: the site lives under `/AStonesThrow/`.
- The page is laid out for phones by its viewport tag, which the shoot harness (a desktop browser) ignores: check any change to the page's controls with `tools/controls-probe.mjs`.
- The page opens on Calm wind; frames from before the Wind control are Breeze (`--wind-strength=breeze`; byte-identical when idle until the rings' calibration moved and sharpened the floor's caustics).
- The shore (`SHORE`, `floorDepthAt` in `src/pondFloor.js`) has a GLSL twin, `LAKE_BED` in `src/shaders/scene.js`: change both, or the rocks rest off the drawn bed.
- A stone's ring crosses the pond as `src/rings.js`, not the solver: a ring source given to `water.addSplat` instead would wrap round the 6 m patch. Its source (`RING` in `src/splash.js`) is fitted to `tools/basilisk/`'s ring; refit it there, not by eye.
- The Pool water is the patch's middle quarter with mirror-image walls (`setPool`): there the solver carries the ring and `src/rings.js` draws only its hidden near field, turned over (`nearOnly`), both released in one frame (`releasePoolRing`). Change the ring's source in one and you change it in both.
- `assets/rain/` is written by `tools/rain-probe.mjs --write`; never edit it. The cloud and haze are the sky's (`setWeather` in `src/sky.js`), the drops `src/rain.js`'s.
- Under a gale the splash and the stones compute on still water (surface at 0) and are lifted as drawn (`galeLift` in `src/shaders/gale.js`, `Rock.syncMeshes`). Anything new drawn on the water must be lifted too, or it floats or sinks in the waves.
- What can be thrown is a registry of definitions in `src/things.js` (`defineThing`: plain, validated data; body, material, air, water, look, abilities); its meshes are `src/thingMeshes.js`'s builders (`registerMesh`). `src/rock.js` reads the definition and never asks what a thing is. A river stone (the default) must stay exactly as it was: seeded throws match `main`'s in `tools/variety-probe.mjs`, `tools/cavity-probe.mjs` and `tools/skip-probe.mjs` (a new mesh or material on every stone draws random ids and moves them). Things' looks live in geometry, vertex colours and uniforms, so they compile no program of their own.
- Add files by name, never `git add -A`. `shots/` is ignored and stays local.

## The cloud container

- WebGL renders headless through SwiftShader. It is correct but slow, so frame rates measured there mean nothing.
- WebGPU compute and offscreen render-to-texture with readback work headless, on a localhost page only. Presenting a WebGPU canvas fails, so capture WebGPU frames by reading back an offscreen texture.
