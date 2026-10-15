# CLAUDE.md

Keep this file short. Every future session reads all of it, so most notes belong in a comment beside their code.

## Commands

```bash
npm install                # three (served to the headless harness) and playwright
npm start                  # static server; open http://localhost:8123/
npm test                   # CPU checks: the solver's FFT, splat spectrum, Nyquist bins and half floats (fft-test), the wind ripples (wave-probe), the foam pattern (foam-probe), the cavity (cavity-probe)
npm run shoot -- --label=name --throws=0:-1.4:0.03 --times=0.1,0.5   # frames into shots/name/; --fov --look --crop --report --eval --floats=half --sky=name --wind=x:z --power=soft; --throws=none for idle water
node tools/jet-probe.mjs 0.03 6.3      # one Worthington jet on the CPU: timeline, drops, cost
node tools/fan-probe.mjs 0.03 6.9 0.68 # the forward fan of an oblique entry on the CPU
node tools/splash-probe.mjs            # the whole splash on the CPU for each stone size: crown, jet, drops, ring, cost per frame
node tools/cavity-probe.mjs            # the stone's cavity on the CPU for each size: timeline, pinch, closure, cost; checks the hole hides the surface
node tools/zoom-probe.mjs              # drives the page's zoom handlers and checks the anchor stays put
node tools/sky-probe.mjs assets/sky/meadow_2_2k.hdr   # measures a sky panorama into assets/sky/meadow_2.json
node tools/wave-probe.mjs              # the wind ripples on the CPU: real field, rms slope, travel direction, mip roughness, cost
node tools/foam-probe.mjs              # the foam's bubble pattern on the CPU: the shader's fade constants, antialiasing against supersampling, cost
node tools/quality-probe.mjs           # every preset builds its sizes (__pond.budget) from every other, the calibration and its watch step down, the idle frame cap, pause/resume, no program at the first throw
node tools/profile-probe.mjs           # runs ?profile=1 headless and checks the report's shape (its milliseconds mean nothing here)
node tools/controls-probe.mjs          # the controls as phones' browsers lay them out (viewport tag, touch, 3×): sizes, fit, the slider's tap and drag
npm run site && node tools/site-check.mjs   # build what Pages publishes into _site/ and load it under /IntoTheWater/
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
- `assets/sky/*.json` is written by `tools/sky-probe.mjs` from its `.hdr`; rerun the probe, never edit the JSON.
- Every push to `main` deploys to GitHub Pages (https://azabrod1.github.io/IntoTheWater/). Only `index.html`, `src/` and `assets/` are published (`SITE_FILES` in `tools/build-site.mjs`); a new runtime folder goes there too. Use relative paths: the site lives under `/IntoTheWater/`.
- The page is laid out for phones by its viewport tag, which the shoot harness (a desktop browser) ignores: check any change to the page's controls with `tools/controls-probe.mjs`.
- Add files by name, never `git add -A`. `shots/` is ignored and stays local.

## The cloud container

- WebGL renders headless through SwiftShader. It is correct but slow, so frame rates measured there mean nothing.
- WebGPU compute and offscreen render-to-texture with readback work headless, on a localhost page only. Presenting a WebGPU canvas fails, so capture WebGPU frames by reading back an offscreen texture.
