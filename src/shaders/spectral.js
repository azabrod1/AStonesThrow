// GLSL for the spectral water solver (src/spectralWater.js).
//
// State texture (RGBA32F, one texel per wave vector): H = (r, g) complex height
// spectrum, V = (b, a) complex spectrum of the vertical velocity dH/dt.
// The update pass rotates each mode by its own angular frequency, applies
// damping, and adds the closed-form spectra of this frame's Gaussian splats.
// The FFT passes then bring h and v back to the grid for rendering.

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

// One radix-2 Stockham pass along one axis. The first pass reads the state
// texture and combines H + iV into a single complex field, so the inverse
// transform yields h in the real part and v in the imaginary part.
export const FFT_PASS_FRAGMENT = /* glsl */`
#define PI 3.141592653589793
uniform sampler2D uInput;
uniform float uN;
uniform float uSubSize;
uniform int uHorizontal;
uniform int uFromState;

vec2 fetchValue(ivec2 texel) {
  vec4 v = texelFetch(uInput, texel, 0);
  if (uFromState == 1) return vec2(v.x - v.w, v.y + v.z);
  return v.xy;
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
  vec2 even = fetchValue(evenTexel);
  vec2 odd = fetchValue(oddTexel);
  float angle = 2.0 * PI * float(index) / uSubSize;
  vec2 twiddle = vec2(cos(angle), sin(angle));
  vec2 result = even + vec2(twiddle.x * odd.x - twiddle.y * odd.y, twiddle.x * odd.y + twiddle.y * odd.x);
  gl_FragColor = vec4(result, 0.0, 1.0);
}
`;

// Foam: decays, diffuses a little, is churned up where the surface moves fast,
// and is stamped in by splashes.
export const FOAM_FRAGMENT = /* glsl */`
#define MAX_FOAM 16
uniform sampler2D uFoam;
uniform sampler2D uHeight;
uniform float uN;
uniform float uDt;
uniform float uTau;
uniform int uFoamCount;
uniform vec4 uFoamSplats[MAX_FOAM];   // x,y texels; z sigma texels; w amount
varying vec2 vUv;

void main() {
  vec2 texelSize = vec2(1.0 / uN);
  float foam = texture2D(uFoam, vUv).r;
  float neighbours = texture2D(uFoam, vUv + vec2(texelSize.x, 0.0)).r
    + texture2D(uFoam, vUv - vec2(texelSize.x, 0.0)).r
    + texture2D(uFoam, vUv + vec2(0.0, texelSize.y)).r
    + texture2D(uFoam, vUv - vec2(0.0, texelSize.y)).r;
  foam = mix(foam, neighbours * 0.25, min(uDt * 6.0, 1.0));
  foam *= exp(-uDt / uTau);
  float speed = abs(texture2D(uHeight, vUv).g);
  foam += max(speed - 1.4, 0.0) * uDt * 0.5;
  vec2 texel = gl_FragCoord.xy - 0.5;
  for (int i = 0; i < MAX_FOAM; i++) {
    if (i >= uFoamCount) break;
    vec4 splat = uFoamSplats[i];
    vec2 d = texel - splat.xy;
    float g = exp(-dot(d, d) / (2.0 * splat.z * splat.z));
    foam += splat.w * g * (1.0 - foam);
  }
  gl_FragColor = vec4(clamp(foam, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;
