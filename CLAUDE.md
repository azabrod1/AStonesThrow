# CLAUDE.md

Keep this file short. Every future session reads all of it, so most notes belong in a comment beside their code.

## Commands

```bash
npm install                # three (served to the headless harness) and playwright
npm start                  # static server; open http://localhost:8123/
npm test                   # CPU check of the GPU FFT and the splat spectrum
npm run shoot -- --label=name --throws=0:-1.4:0.03 --times=0.1,0.5   # frames into shots/name/
node tools/flip-shoot.mjs --label=name --quality=coarse --radius=0.02 --speed=4 --times=0.02,0.1   # FLIP experiment frames
node tools/flip-probe.mjs coarse        # FLIP pressure convergence and still-water test
node tools/flip-grid-probe.mjs coarse 0.04 5 0.04   # FLIP grid slice: cell types and Vy around the stone
```

There is no build step. The page loads Three.js from jsDelivr through the import map in `index.html`. The FLIP experiment at `flip/` is raw WebGPU with no dependencies; `flip/src/main.js` documents its `window.__flip` API and the URL switches (`quality`, `view`, `debug`, `slice`, solver settings).

## Rules

- The Three.js version is pinned in three places: the import map in `index.html`, the CDN route in `tools/shoot.mjs`, and `package.json`. Change all three together.
- Each module's opening comment is its documentation. Read it before changing the module, and update it when the behaviour changes.
- Units are metres and seconds. The pond is a 6 m square patch; `window.__pond` drives the app (see `README.md`).
- Use descriptive variable names, never single letters.
- Add files by name, never `git add -A`. `shots/` is ignored and stays local.

## The cloud container

- WebGL renders headless through SwiftShader. It is correct but slow, so frame rates measured there mean nothing.
- WebGPU compute and offscreen render-to-texture with readback work headless, on a localhost page only. Presenting a WebGPU canvas fails, so capture WebGPU frames by reading back an offscreen texture.
