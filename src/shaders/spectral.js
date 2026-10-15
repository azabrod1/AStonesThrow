// GLSL for the spectral water solver (src/spectralWater.js) and the ambient
// wind waves (src/ambientWaves.js).
//
// State texture (RGBA32F, one texel per wave vector): H = (r, g) complex height
// spectrum, V = (b, a) complex spectrum of the vertical velocity dH/dt.
// The update pass rotates each mode by its own angular frequency, applies
// damping, and adds the closed-form spectra of this frame's Gaussian splats.
// The FFT passes then bring h and v back to the grid for rendering. They
// transform both complex pairs of a texel, (r, g) and (b, a), at once: the
// ambient waves' evaluation pass fills both, the solver only the first.

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
uniform float uGamma0;       // base damping, 1/s
uniform float uNu;           // k² damping coefficient, m²/s
uniform float uKLow;         // below this wavenumber waves are damped hard (no sloshing)
uniform float uGammaLow;
uniform int uSplatCount;
uniform vec4 uSplats[MAX_SPLATS];      // x,y: centre in texels; z: sigma in texels; w: rim ratio (0 = plain Gaussian)
uniform vec2 uSplatAmps[MAX_SPLATS];   // x: height (m), y: vertical velocity (m/s)

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
  float gamma = uGamma0 + uNu * k * k + (k < uKLow ? uGammaLow : 0.0);

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

  for (int i = 0; i < MAX_SPLATS; i++) {
    if (i >= uSplatCount) break;
    vec4 splat = uSplats[i];
    float sigma = splat.z;
    // A crater displaces water into a rim around it, so the shape is the
    // difference of two equal-volume Gaussians: zero mean, no long-wave mound.
    float rimSigma = sigma * max(splat.w, 1.0);
    float shape = exp(-0.5 * sigma * sigma * qMag * qMag);
    if (splat.w > 1.0) shape -= exp(-0.5 * rimSigma * rimSigma * qMag * qMag);
    float magnitude = 2.0 * PI * sigma * sigma / (uN * uN) * shape;
    float phase = -(q.x * splat.x + q.y * splat.y);
    vec2 e = vec2(cos(phase), sin(phase)) * magnitude;
    nextHeight += uSplatAmps[i].x * e;
    nextVelocity += uSplatAmps[i].y * e;
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

// One radix-2 Stockham pass along one axis, on both complex pairs of the
// texel. With uFromState the pass reads the solver's state texture and
// combines H + iV into the first pair (the second is zero), so the inverse
// transform yields h in the real part and v in the imaginary part.
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
  gl_FragColor = even + vec4(complexMultiply(twiddle, odd.xy), complexMultiply(twiddle, odd.zw));
}
`;

// Foam: decays, diffuses a little, is churned up where the surface moves fast,
// and is stamped in by splashes. The map holds the amount in R (0 to 1) and,
// in G, the lifetime τ of the foam there: each stamp brings its own (a big
// splash's raft is thicker and lasts longer), and where foam of different
// lifetimes mixes, by stamping or diffusing, G is their amount-weighted mean,
// so the amount decays as exp(−dt/τ) with the τ of the foam actually there.
export const FOAM_FRAGMENT = /* glsl */`
#define MAX_FOAM 16
#define SHORTEST_LIFETIME 0.5
uniform sampler2D uFoam;
uniform sampler2D uHeight;
uniform float uN;
uniform float uDt;
uniform float uDiffusionRate;          // 1/s: 4·D/cell², D the diffusivity in m²/s
uniform float uChurnLifetime;          // seconds: τ of the foam fast surface motion makes
uniform int uFoamCount;
uniform vec4 uFoamSplats[MAX_FOAM];    // x,y texels; z sigma texels; w amount
uniform float uFoamLifetimes[MAX_FOAM];   // seconds
varying vec2 vUv;

// Adds amount of foam with its lifetime to (amount, amount × lifetime).
vec2 addFoam(vec2 carried, float amount, float lifetime) {
  return carried + vec2(amount, amount * lifetime);
}

void main() {
  vec2 texelSize = vec2(1.0 / uN);
  vec2 centre = texture2D(uFoam, vUv).rg;
  vec2 east = texture2D(uFoam, vUv + vec2(texelSize.x, 0.0)).rg;
  vec2 west = texture2D(uFoam, vUv - vec2(texelSize.x, 0.0)).rg;
  vec2 north = texture2D(uFoam, vUv + vec2(0.0, texelSize.y)).rg;
  vec2 south = texture2D(uFoam, vUv - vec2(0.0, texelSize.y)).rg;
  // (amount, amount × lifetime): both diffuse, so the lifetime follows the foam.
  vec2 carried = vec2(centre.r, centre.r * centre.g);
  vec2 neighbours = vec2(east.r, east.r * east.g) + vec2(west.r, west.r * west.g)
    + vec2(north.r, north.r * north.g) + vec2(south.r, south.r * south.g);
  carried = mix(carried, neighbours * 0.25, min(uDt * uDiffusionRate, 1.0));
  float lifetime = carried.x > 1e-6 ? carried.y / carried.x : SHORTEST_LIFETIME;
  carried *= exp(-uDt / max(lifetime, SHORTEST_LIFETIME));
  float speed = abs(texture2D(uHeight, vUv).g);
  carried = addFoam(carried, max(speed - 1.4, 0.0) * uDt * 0.5, uChurnLifetime);
  vec2 texel = gl_FragCoord.xy - 0.5;
  for (int index = 0; index < MAX_FOAM; index++) {
    if (index >= uFoamCount) break;
    vec4 splat = uFoamSplats[index];
    vec2 offset = texel - splat.xy;
    float falloff = exp(-dot(offset, offset) / (2.0 * splat.z * splat.z));
    carried = addFoam(carried, splat.w * falloff * (1.0 - carried.x), uFoamLifetimes[index]);
  }
  float amount = clamp(carried.x, 0.0, 1.0);
  gl_FragColor = vec4(amount, carried.x > 1e-6 ? carried.y / carried.x : SHORTEST_LIFETIME, 0.0, 1.0);
}
`;
