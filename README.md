# Stone Pond

Throw stones into a pond and watch the splash. A WebGL toy built with
Three.js: the water is a real wave solver, the splash is choreographed from
the physics of a stone entering water, and the droplets are rendered as water.

Open `index.html` through any static server (`npm start`, then
http://localhost:8123/). There is no build step. Three.js loads from a CDN.

Tap or click the water to throw a stone there. Space throws one at random.
The strip at the bottom sets the stone size, the throw strength, slow motion
and the rendering quality.

## How it works

**Water surface** (`src/spectralWater.js`). The pond is a 6 m square patch of
512 × 512 cells (256 on low quality) kept in Fourier space: for each wave
vector the complex amplitude of the height and of its time derivative. Linear
water waves obey

    ω² = (g k + σ k³ / ρ) · tanh(k D)

so each mode is advanced exactly by rotating through ω·dt, which is stable for
any time step and gives the right dispersion: long ripples outrun short ones,
as they do on a real pond. Disturbances are Gaussian splats with a raised rim
(zero net volume, so no long-wave mound), added in Fourier space from their
closed-form spectrum. One inverse FFT per frame (2·log2 N passes on the GPU)
returns the height and vertical velocity for rendering. A foam map decays,
diffuses and is stamped by the splash.

**Splash** (`src/splash.js`). A stone entering water goes through stages with
known timing, and the droplets are choreographed from them:

1. crown: a sheet flung up and out from the contact ring, biased forward;
2. cavity and pinch-off about 2.1·√(R/g) seconds after entry;
3. Worthington jet: a narrow column fired straight up, tip first;
4. bubbles that rise and burst into foam.

Droplets are integrated on the CPU and rendered as a screen-space fluid:
sphere impostors stretched along their motion like a camera shutter would,
into a depth buffer (with each drop's sun glint) and an additive thickness
buffer; a bilateral blur merges neighbouring drops into sheets; the composite
pass shades the result with sky reflection, refraction of the scene behind,
sun highlights and white scattering for fine spray, then tone-maps the frame.

**Rendering** (`src/main.js`, `src/shaders/`). Each frame: the floor,
submerged stones and bubbles are rendered to a texture with depth; the main
scene renders the sky, shore and water surface, which refracts that texture
with absorption by path length through the water, reflects a planar mirror
image of the sky and shore rendered once (the camera never moves), and adds a
GGX sun highlight that widens with distance to stand in for sub-pixel glitter.
Caustics on the sand come from the Laplacian of the surface height above.
Stones are faceted procedural geometry with a small rigid-body model: a
ballistic arc, quadratic drag under water, and a settle into the sand.

## Development

- `npm test` checks the GPU FFT formulation and the splat spectrum on the CPU.
- `npm run shoot -- --label=name --throws=x:z:radius --times=0.1,0.5` renders
  deterministic frames headlessly (Playwright + Chromium) into `shots/name/`.
  Options: `--fov`, `--look=x:y:z`, `--preimpact=seconds`, `--ui=1`,
  `--debug=under|height|foam|env|face`, `--eval="js"`, `--w --h --dpr`.
- `window.__pond` exposes the app in the console: `throwAt(x, z, { radius })`,
  `setTimeScale`, `pause()`, `advance(seconds)`, `setDebugView(name)`.

Install the development dependencies with `npm install` (Three.js is only
needed locally for the headless harness, which serves it instead of the CDN).
