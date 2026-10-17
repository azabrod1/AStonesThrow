// GLSL for the spectral water solver (src/spectralWater.js) and the ambient
// wind waves (src/ambientWaves.js).
//
// State texture (RGBA32F, one texel per wave vector): H = (r, g) complex height
// spectrum, V = (b, a) complex spectrum of the vertical velocity dH/dt, both
// in the forward transform's units: summed over the cells, not averaged, so
// N² times the coefficients the inverse transform takes. A splat's are then
// its amplitude times about its area in texels; with the 1/N², a small
// stone's height coefficients were 1e-8 to 1e-9, under binary16's smallest
// subnormal (6e-8), and on devices without float32 targets its ring was lost.
// The update pass rotates each mode by its own angular frequency, applies
// damping, and adds the closed-form spectra of this frame's Gaussian splats.
// In a pool (uWalls, src/spectralWater.js) each splat comes with its mirror
// images across the pool's walls, so the patch's periodic waves are the
// pool's, reflected at its walls.
// The FFT passes then bring h and v back to the grid for rendering, the
// solver's dividing out the N² on the way (SOLVER_FFT_PASS_FRAGMENT). They
// transform both complex pairs of a texel, (r, g) and (b, a), at once: the
// ambient waves' evaluation pass fills both, the solver only the first.
// tools/fft-test.mjs reproduces these passes on the CPU, also through
// binary16 storage.

export const FULLSCREEN_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SPECTRAL_UPDATE_FRAGMENT = /* glsl */`
#define MAX_SPLATS 32
#define PI 3.141592653589793
uniform sampler2D uState;
uniform float uN;            // grid size (texels per side)
uniform float uCell;         // metres per texel
uniform float uDepth;        // pond depth, metres
uniform float uDt;           // seconds advanced this pass
uniform float uGamma0;       // base damping, 1/s, above uKDamp...
uniform float uKDamp;        // ...and in proportion to k below it, but...
uniform float uGammaLeast;   // ...never less than this (a pool's walls and floor: src/spectralWater.js); 0 in the open pond
uniform float uNu;           // k² damping coefficient, m²/s
uniform float uKLow;         // below this wavenumber waves are damped hard (no sloshing)
uniform float uGammaLow;
uniform float uGammaBreaking;  // a pool's breaking waves (src/spectralWater.js BREAKING), 1/s, for every wave; 0 in the open pond
uniform int uSplatCount;
uniform vec4 uSplats[MAX_SPLATS];      // x,y: centre in texels; z: sigma in texels; w: rim ratio (0 = plain Gaussian)
uniform vec2 uSplatAmps[MAX_SPLATS];   // x: height (m), y: vertical velocity (m/s)
uniform vec3 uWalls;                   // x, y: a wall of the pool along each axis (texels); z: 1 in a pool, 0 in the open pond

vec2 complexMultiply(vec2 first, vec2 second) {
  return vec2(first.x * second.x - first.y * second.y, first.x * second.y + first.y * second.x);
}

// e^{i·phase}, from |phase|: the mirror bin's phase is exactly −phase, so its
// value is exactly the conjugate whatever the GPU's sin and cos do with signs.
vec2 phasor(float phase) {
  return vec2(cos(abs(phase)), sign(phase) * sin(abs(phase)));
}

// The shift along one axis, real along a Nyquist axis (main).
vec2 axisShift(float phase, bool nyquist) {
  return nyquist ? vec2(cos(phase), 0.0) : phasor(phase);
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec4 state = texelFetch(uState, texel, 0);
  int n = int(uN);
  float kx = float(texel.x < n / 2 ? texel.x : texel.x - n);
  float ky = float(texel.y < n / 2 ? texel.y : texel.y - n);
  vec2 q = 2.0 * PI * vec2(kx, ky) / uN;     // radians per texel
  float qMag = length(q);
  float k = qMag / uCell;                      // radians per metre
  float omega2 = (9.81 * k + 7.2e-5 * k * k * k) * tanh(min(k * uDepth, 20.0));
  float omega = sqrt(omega2);
  float gamma = max(uGamma0 * min(k / uKDamp, 1.0), uGammaLeast) + uNu * k * k + (k < uKLow ? uGammaLow : 0.0) + uGammaBreaking;

  vec2 height = state.xy;
  vec2 velocity = state.zw;
  float c = cos(omega * uDt);
  float s = sin(omega * uDt);
  float sOverOmega = omega > 1e-6 ? s / omega : uDt;
  vec2 nextHeight = height * c + velocity * sOverOmega;
  vec2 nextVelocity = -height * omega * s + velocity * c;
  float decay = exp(-gamma * uDt);
  nextHeight *= decay;
  nextVelocity *= decay;

  // A splat's spectrum is its Gaussian's, G(q) = 2π·σ²·exp(−σ²|q|²/2) in the
  // forward transform's units (no 1/N², see the top), times the shift to its
  // centre x0, e^{−i q·x0}: the band-limited Gaussian, each bin the continuous
  // spectrum at its own q. A real field needs H(−q) = conj H(q), and the
  // Nyquist row and column (texel N/2, q = −π along that axis) are their own
  // mirror images, so there the coefficient must be real along that axis. The
  // transform of the sampled Gaussian puts both images ±π in that bin,
  // 2·G(π)·cos(π·x0); the band-limited spectrum used everywhere else drops
  // the images beyond ±π and so takes half of each at the edge of the band:
  // G(π)·cos(π·x0), the real part of the shift. So along a Nyquist axis the
  // shift is the cosine of that axis's phase, and the axes' factors multiply.
  // A complex coefficient there leaked into the other field of the packed
  // transform: the velocity of a small stone's splat at a fractional centre
  // put a line of alternating ripples through it into the height, at first
  // 0.4 (512²) to 1.2 (256²) times the splat's own height.
  //
  // In a pool (uWalls.z) the splat comes with its mirror images: across the
  // wall x = a along x, a Gaussian at 2a − x0 as well as at x0, and so along
  // y, four in all. The patch is periodic over twice the pool's width, so
  // they mirror it across its far walls too (2a − x0 + N is the image across
  // a + N/2), and their periodic sum is the field of a splat in the pool
  // with walls that reflect every wave (the cosine series a closed basin's
  // waves are): it is even about every wall, so it never slopes across one.
  // The four images' shift is the product of each axis's two, each as above
  // (real along a Nyquist axis), so the mirror bin's is still exactly its
  // conjugate; and the update keeps the evenness, since each mode turns and
  // decays as its mirror modes do.
  bool nyquistX = texel.x == n / 2;
  bool nyquistY = texel.y == n / 2;
  for (int i = 0; i < MAX_SPLATS; i++) {
    if (i >= uSplatCount) break;
    vec4 splat = uSplats[i];
    float sigma = splat.z;
    // A crater displaces water into a rim around it, so the shape is the
    // difference of two equal-volume Gaussians: zero mean, no long-wave mound.
    float rimSigma = sigma * max(splat.w, 1.0);
    float shape = exp(-0.5 * sigma * sigma * qMag * qMag);
    if (splat.w > 1.0) shape -= exp(-0.5 * rimSigma * rimSigma * qMag * qMag);
    float magnitude = 2.0 * PI * sigma * sigma * shape;
    float phaseX = -q.x * splat.x;
    float phaseY = -q.y * splat.y;
    vec2 shift;
    if (uWalls.z > 0.5) {
      shift = complexMultiply(axisShift(phaseX, nyquistX) + axisShift(-q.x * (2.0 * uWalls.x - splat.x), nyquistX),
                              axisShift(phaseY, nyquistY) + axisShift(-q.y * (2.0 * uWalls.y - splat.y), nyquistY));
    } else if (nyquistX || nyquistY) {
      shift = complexMultiply(nyquistX ? vec2(cos(phaseX), 0.0) : phasor(phaseX), nyquistY ? vec2(cos(phaseY), 0.0) : phasor(phaseY));
    } else {
      shift = phasor(phaseX + phaseY);
    }
    vec2 spectrum = shift * magnitude;
    nextHeight += uSplatAmps[i].x * spectrum;
    nextVelocity += uSplatAmps[i].y * spectrum;
  }
  if (texel.x == 0 && texel.y == 0) { nextHeight = vec2(0.0); nextVelocity = vec2(0.0); }
  gl_FragColor = vec4(nextHeight, nextVelocity);
}
`;

// The ambient wind waves at one time, from their seed (src/ambientWaves.js
// explains the construction): H(k, t) = A₋ e^{−iωt} + A₊ e^{+iωt}, with ω the
// update pass's dispersion rounded to a whole multiple of uFrequencyStep, so
// the field repeats every 2π/uFrequencyStep seconds and uTime arrives wrapped
// into that period. The texel holds two complex spectra, each of two real
// fields: H + i·(i kx H) in (r, g) and i kz H + i·(−k² H) in (b, a), so the
// inverse FFT gives height, ∂h/∂x, ∂h/∂z and the Laplacian ∇²h, all exact,
// scaled to the height texture's units.
export const AMBIENT_EVALUATE_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D uSeed;        // per wave vector: A₋ (r, g), A₊ (b, a), metres
uniform float uN;               // texels per side
uniform float uTileSize;        // metres per side
uniform float uDepth;           // pond depth, metres
uniform float uFrequencyStep;   // rad/s
uniform float uTime;            // seconds, within one period
uniform float uOutputScale;     // height texture units per metre

vec2 complexMultiply(vec2 first, vec2 second) {
  return vec2(first.x * second.x - first.y * second.y, first.x * second.y + first.y * second.x);
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec4 seed = texelFetch(uSeed, texel, 0);
  int size = int(uN);
  vec2 latticeIndex = vec2(texel.x < size / 2 ? texel.x : texel.x - size, texel.y < size / 2 ? texel.y : texel.y - size);
  float wavenumber = 2.0 * PI * length(latticeIndex) / uTileSize;
  float omega = sqrt((9.81 * wavenumber + 7.2e-5 * wavenumber * wavenumber * wavenumber) * tanh(min(wavenumber * uDepth, 20.0)));
  omega = floor(omega / uFrequencyStep + 0.5) * uFrequencyStep;
  float angle = omega * uTime;
  vec2 turn = vec2(cos(angle), sin(angle));
  vec2 height = complexMultiply(seed.xy, vec2(turn.x, -turn.y)) + complexMultiply(seed.zw, turn);
  vec2 waveVector = 2.0 * PI * latticeIndex / uTileSize;   // rad/m along world x and z
  vec2 slopeX = complexMultiply(vec2(0.0, waveVector.x), height);
  vec2 slopeZ = complexMultiply(vec2(0.0, waveVector.y), height);
  vec2 laplacian = -dot(waveVector, waveVector) * height;
  // i·z = (−z.y, z.x)
  gl_FragColor = vec4(height + vec2(-slopeX.y, slopeX.x), slopeZ + vec2(-laplacian.y, laplacian.x)) * uOutputScale;
}
`;

// The gale's waves at one time, from their seed (src/galeWaves.js explains
// the construction), H(k, t) evolved as the ripples' are, and with it the
// sideways move D = λ i k̂ H and the derivatives, packed two real fields to a
// complex spectrum so that one inverse FFT gives four real fields:
//   uPart 0, the displacement:  H + i·Dx in (r, g), Dz + i·∂Dx/∂z in (b, a);
//   uPart 1, the derivatives:   i kx H + i·(i kz H) in (r, g),
//                               ∂Dx/∂x + i·∂Dz/∂z in (b, a);
// with ∂Dx/∂x = −λ kx²/k H, ∂Dz/∂z = −λ kz²/k H, ∂Dx/∂z = −λ kx kz/k H, all
// scaled to the textures' units.
export const GALE_EVALUATE_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D uSeed;        // per wave vector: A₋ (r, g), A₊ (b, a), metres
uniform float uN;               // texels per side
uniform float uTileSize;        // metres per side
uniform float uDepth;           // the lake's depth for the dispersion, metres
uniform float uFrequencyStep;   // rad/s
uniform float uTime;            // seconds, within one period
uniform float uOutputScale;     // texture units per metre
uniform float uChoppiness;      // λ
uniform int uPart;              // 0: the displacement; 1: the derivatives

vec2 complexMultiply(vec2 first, vec2 second) {
  return vec2(first.x * second.x - first.y * second.y, first.x * second.y + first.y * second.x);
}
// i·z
vec2 timesI(vec2 value) { return vec2(-value.y, value.x); }

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec4 seed = texelFetch(uSeed, texel, 0);
  int size = int(uN);
  vec2 latticeIndex = vec2(texel.x < size / 2 ? texel.x : texel.x - size, texel.y < size / 2 ? texel.y : texel.y - size);
  vec2 waveVector = 2.0 * PI * latticeIndex / uTileSize;   // rad/m along world x and z
  float wavenumber = length(waveVector);
  float omega = sqrt((9.81 * wavenumber + 7.2e-5 * wavenumber * wavenumber * wavenumber) * tanh(min(wavenumber * uDepth, 20.0)));
  omega = floor(omega / uFrequencyStep + 0.5) * uFrequencyStep;
  float angle = omega * uTime;
  vec2 turn = vec2(cos(angle), sin(angle));
  vec2 height = complexMultiply(seed.xy, vec2(turn.x, -turn.y)) + complexMultiply(seed.zw, turn);
  float reach = wavenumber > 0.0 ? uChoppiness / wavenumber : 0.0;   // λ/k
  if (uPart == 0) {
    vec2 moveX = timesI(reach * waveVector.x * height);
    vec2 moveZ = timesI(reach * waveVector.y * height);
    vec2 moveXZ = -reach * waveVector.x * waveVector.y * height;
    gl_FragColor = vec4(height + timesI(moveX), moveZ + timesI(moveXZ)) * uOutputScale;
  } else {
    vec2 slopeX = timesI(waveVector.x * height);
    vec2 slopeZ = timesI(waveVector.y * height);
    vec2 stretchX = -reach * waveVector.x * waveVector.x * height;
    vec2 stretchZ = -reach * waveVector.y * waveVector.y * height;
    gl_FragColor = vec4(slopeX + timesI(slopeZ), stretchX + timesI(stretchZ)) * uOutputScale;
  }
}
`;

// The gale's whitecaps (src/galeWaves.js): one step of its foam map, which
// lies on the gale's tile at rest positions, as the solver's foam map's
// kinds do (r the whole foam, g its raft). Where the crests crowd the water
// past breaking (the Jacobian J of the sideways move, from GALE_BREAK_START
// down to GALE_BREAK_FULL) they churn a boil of GALE_BOIL, the big bubbles,
// which pops within a second (uBoilKeep a step), and lay a raft at
// GALE_RAFT_RATE a second of breaking, the small bubbles, which drains over
// seconds (uRaftKeep); the water shows the raft gathered into the wind's
// streaks (galeStreaks in src/shaders/scene.js). The whole map drifts
// downwind with the surface (uDrift), taken from upstream, semi-Lagrangian.
export const GALE_FOAM_FRAGMENT = /* glsl */`
uniform sampler2D uPrevious;      // the map a step ago: (foam, raft)
uniform sampler2D uDisplacement;  // the gale's fields (GALE_EVALUATE_FRAGMENT), in texture units
uniform sampler2D uDerivatives;
uniform float uMetresPerUnit;     // the gale's strength over the units
uniform float uFieldTexels;       // the fields' texels per side
uniform float uTexels;            // the map's
uniform vec2 uDrift;              // the surface's drift this step, in the tile's uv
uniform float uStep;              // seconds
uniform float uBoilKeep;          // exp(−step/τ) of the boil
uniform float uRaftKeep;          // and of the raft
#define GALE_BREAK_START 0.66
#define GALE_BREAK_FULL 0.5
#define GALE_BOIL 0.6
#define GALE_RAFT_RATE 1.0
#define GALE_RAFT_MOST 0.5

void main() {
  vec2 uv = gl_FragCoord.xy / uTexels;
  vec2 before = texture2D(uPrevious, uv - uDrift).rg;
  // The fields' texel n holds the field at n·cell; the map's texel centre is at uv·tile.
  vec2 fieldUv = uv + 0.5 / uFieldTexels - 0.5 / uTexels;
  vec4 derivatives = texture2D(uDerivatives, fieldUv) * uMetresPerUnit;
  float crossTerm = texture2D(uDisplacement, fieldUv).a * uMetresPerUnit;
  float jacobian = (1.0 + derivatives.z) * (1.0 + derivatives.w) - crossTerm * crossTerm;
  float breaking = 1.0 - smoothstep(GALE_BREAK_FULL, GALE_BREAK_START, jacobian);
  float boil = max(before.r - before.g, 0.0) * uBoilKeep;
  boil = max(boil, breaking * GALE_BOIL);
  float raft = min(before.g * uRaftKeep + breaking * GALE_RAFT_RATE * uStep, GALE_RAFT_MOST);
  gl_FragColor = vec4(boil + raft, raft, 0.0, 1.0);
}
`;

// One radix-2 Stockham pass along one axis, on both complex pairs of the
// texel. With uFromState the pass reads the solver's state texture and
// combines H + iV into the first pair (the second is zero), so the inverse
// transform yields h in the real part and v in the imaginary part.
//
// With SOLVER_SCALING defined (SOLVER_FFT_PASS_FRAGMENT, the solver's passes)
// the passes divide out the state's N² as they go: those along x halve their
// output, which keeps the rows at the scale of the coefficients (1/N over the
// log2 N passes); those along y leave it, so the columns hold N times the
// field; the last divides by N. Every value a pass stores so stays well
// inside binary16's range on the half-float path, from a small stone's ripples
// to the fastest splash. One 1/N² in the last pass would leave up to N²/2
// times the field in the scratch targets, over binary16's largest value
// (65504) once the field passes 0.5 m/s on 512², as a 16 cm stone's does
// (1.4 m/s); and a constant scale small enough for that would let a small
// stone's coefficients fall under binary16's smallest normal value again,
// which some GPUs flush to zero.
// The factors are powers of two, so on float32 targets they change nothing.
export const FFT_PASS_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D uInput;
uniform float uN;
uniform float uSubSize;
uniform int uHorizontal;
uniform int uFromState;

vec4 fetchValue(ivec2 texel) {
  vec4 v = texelFetch(uInput, texel, 0);
  if (uFromState == 1) return vec4(v.x - v.w, v.y + v.z, 0.0, 0.0);
  return v;
}

vec2 complexMultiply(vec2 first, vec2 second) {
  return vec2(first.x * second.x - first.y * second.y, first.x * second.y + first.y * second.x);
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  int index = uHorizontal == 1 ? texel.x : texel.y;
  int sub = int(uSubSize);
  int halfSize = sub / 2;
  int n = int(uN);
  int evenIndex = (index / sub) * halfSize + (index - (index / halfSize) * halfSize);
  int oddIndex = evenIndex + n / 2;
  ivec2 evenTexel = uHorizontal == 1 ? ivec2(evenIndex, texel.y) : ivec2(texel.x, evenIndex);
  ivec2 oddTexel = uHorizontal == 1 ? ivec2(oddIndex, texel.y) : ivec2(texel.x, oddIndex);
  vec4 even = fetchValue(evenTexel);
  vec4 odd = fetchValue(oddTexel);
  float angle = 2.0 * PI * float(index) / uSubSize;
  vec2 twiddle = vec2(cos(angle), sin(angle));
  vec4 result = even + vec4(complexMultiply(twiddle, odd.xy), complexMultiply(twiddle, odd.zw));
#ifdef SOLVER_SCALING
  result *= uHorizontal == 1 ? 0.5 : (sub == n ? 1.0 / uN : 1.0);
#endif
  gl_FragColor = result;
}
`;

// The solver's inverse passes: FFT_PASS_FRAGMENT with its scaling (above).
export const SOLVER_FFT_PASS_FRAGMENT = `#define SOLVER_SCALING\n${FFT_PASS_FRAGMENT}`;

// The foam map's step (src/spectralWater.js says what the map holds). Each
// texel takes its foam from where the surface brought it, semi-Lagrangian:
// the upstream point is the texel moved back by the wind's drift (uniform, a
// small fraction of a texel a step) and then back through each flow. A flow
// is a source on the surface, water welling up through a core and spreading
// outward: this step it adds an area A, and a point at r from its centre came
// from
//     r_up = r · exp(−(A/2π) / (r² + core²)),
// which keeps area beyond the core (r² − r_up² → A/π) and stretches the core,
// so foam is carried outward without piling up and the core clears. `stretch`
// is that map's Jacobian, r_up·dr_up / (r·dr) ≤ 1, the share of the area here
// that came from there: multiplying by it keeps the amount, so a raft swept
// into a ring is no brighter than it was. The foam at the upstream point is
// read from the five texel centres around the texel nearest it, interpolated
// to it quadratically and kept within those five values: where only the wind
// moves the map, that is Lax–Wendroff, which moves a raft by a fraction of a
// texel a step without smearing it, and under a flow it keeps a cleared
// hole's edge sharp, where a bilinear sample would blur both by the square
// root of the distance moved times a texel (a raft drifting for 8 s by 40%,
// a 16 cm stone's hole by 6 cm). The spreading is the diffusion on the same
// five samples. Then each kind decays at its own lifetime, fast surface
// motion churns up a boil, and the stamps come in.
export const FOAM_FRAGMENT = /* glsl */`
#define MAX_FOAM 16
#define MAX_FLOWS 8
#define SHORTEST_LIFETIME 0.3
uniform sampler2D uFoam;
uniform sampler2D uHeight;
uniform float uN;
uniform float uDt;
uniform float uDiffusionRate;          // 1/s: 4·D/cell², D the diffusivity in m²/s
uniform float uChurnLifetime;          // seconds: τ of the boil fast surface motion churns up
uniform vec2 uDrift;                   // texels the whole map drifts this step (the wind)
uniform int uFlowCount;
uniform vec4 uFlows[MAX_FLOWS];        // centre x, y (texels); this step's area over 2π (texels²); core radius squared (texels²)
uniform int uFoamCount;
uniform vec4 uFoamSplats[MAX_FOAM];    // x, y texels; z sigma texels; w amount
uniform vec2 uFoamKinds[MAX_FOAM];     // lifetime (s); 1 for a boil, 0 for a raft
varying vec2 vUv;

// (amount, amount × lifetime) of one kind, decayed over this step.
vec2 decayed(vec2 kind) {
  float lifetime = kind.x > 1e-6 ? kind.y / kind.x : SHORTEST_LIFETIME;
  return kind * exp(-uDt / max(lifetime, SHORTEST_LIFETIME));
}

void main() {
  vec2 position = gl_FragCoord.xy - 0.5 - uDrift;   // texels
  float stretch = 1.0;
  for (int index = 0; index < MAX_FLOWS; index++) {
    if (index >= uFlowCount) break;
    vec4 flow = uFlows[index];
    vec2 offset = position - flow.xy;
    float distanceSquared = dot(offset, offset);
    float reach = distanceSquared + flow.w;
    float shrink = exp(-flow.z / reach);
    position = flow.xy + offset * shrink;
    stretch *= shrink * shrink * (1.0 + 2.0 * flow.z * distanceSquared / (reach * reach));
  }
  vec2 nearest = floor(position + 0.5);
  vec2 within = position - nearest;   // at most half a texel
  vec2 texelSize = vec2(1.0 / uN);
  vec2 uv = (nearest + 0.5) * texelSize;
  // (total, raft, raft × its lifetime, boil × its lifetime): all add, so all
  // advect, spread and drift alike.
  vec4 centre = texture2D(uFoam, uv);
  vec4 east = texture2D(uFoam, uv + vec2(texelSize.x, 0.0));
  vec4 west = texture2D(uFoam, uv - vec2(texelSize.x, 0.0));
  vec4 north = texture2D(uFoam, uv + vec2(0.0, texelSize.y));
  vec4 south = texture2D(uFoam, uv - vec2(0.0, texelSize.y));
  vec4 upstream = centre + 0.5 * within.x * (east - west) + 0.5 * within.y * (north - south)
    + 0.5 * within.x * within.x * (east + west - 2.0 * centre) + 0.5 * within.y * within.y * (north + south - 2.0 * centre);
  upstream = clamp(upstream, min(min(min(east, west), min(north, south)), centre), max(max(max(east, west), max(north, south)), centre));
  vec4 carried = (upstream + min(uDt * uDiffusionRate, 1.0) * (0.25 * (east + west + north + south) - centre)) * stretch;
  carried = max(carried, 0.0);
  vec2 raft = decayed(carried.gb);
  vec2 boil = decayed(vec2(max(carried.r - carried.g, 0.0), carried.a));
  float speed = abs(texture2D(uHeight, vUv).g);
  boil += vec2(1.0, uChurnLifetime) * max(speed - 1.4, 0.0) * uDt * 0.5;
  vec2 texel = gl_FragCoord.xy - 0.5;
  for (int index = 0; index < MAX_FOAM; index++) {
    if (index >= uFoamCount) break;
    vec4 splat = uFoamSplats[index];
    vec2 offset = texel - splat.xy;
    // A stamp saturates toward full foam: a boil against all the foam there, a
    // raft against the raft (one under a boil keeps its amount when the boil pops).
    bool isBoil = uFoamKinds[index].y > 0.5;
    float room = max(1.0 - raft.x - (isBoil ? boil.x : 0.0), 0.0);
    vec2 stamp = splat.w * exp(-dot(offset, offset) / (2.0 * splat.z * splat.z)) * room * vec2(1.0, uFoamKinds[index].x);
    if (isBoil) boil += stamp; else raft += stamp;
  }
  float total = boil.x + raft.x;
  float keep = total > 1.0 ? 1.0 / total : 1.0;
  gl_FragColor = vec4(total, raft, boil.y) * keep;
}
`;
