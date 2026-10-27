// The glare: the light of every bright thing in the frame, above all the
// sun's image in the water, spread a little over the frame as a lens and the
// eye spread it. src/main.js draws it from the finished scene each frame;
// the composite and the plain tone map (src/splash.js, src/shaders/fluid.js)
// mix it into the scene before the tone map.
//
// The mechanism. A lens, and the eye, scatter a small share of the light
// from every point into a wide halo round it. The eye's is the CIE's
// disability glare (CIE 146:2002, Vos and van den Berg): the veil at θ
// degrees from a glare source is, per lux of its illuminance at the eye,
// 10/θ³ + 5/θ² (1 + (age/62.5)⁴) + 0.1 p/θ (1 + (age/62.5)⁴) + 0.0025 p
// cd/m², from 0.1° to 100°, p the eye's pigmentation (GLARE_PSF: an eye of
// thirty, p = 1). Over a pond the veil is nothing to see, but the sun's
// image in the water is thousands of times brighter than the sky, and a few
// percent of it, spread so, is the halo a photograph shows round the sun's
// reflection and round every glint, and the veil on the water near it.
// Without it the sun's image is a hard disc the tone map clips white, which
// is a render's tell. The share spread is a camera lens's, SHARE, a few
// percent: the eye's own, that equation integrated over the frame, is near a
// fifth of the light, and a frame so veiled looks wrong because the brain
// takes its own veil away.
//
// How it is drawn. The scene (the main target, linear radiance) is averaged
// down to a quarter of its size (a 4 × 4 box of its pixels, four bilinear
// taps), then halved level by level with a 13-tap filter (Jimenez, Next
// Generation Post Processing in Call of Duty: Advanced Warfare, 2014) until
// the next level would be under SMALLEST pixels on its shorter side; then
// each level, enlarged through a 3 × 3 tent, is added to the one above it,
// down to the first. Level k holds the whole scene's light blurred over the
// angle θ_k of one of its texels, twice the last's, so the levels are the
// octaves of angle, and each is weighted by the light the CIE's veil holds
// between θ_k and 2θ_k (levelWeights: ∫ veil · 2πθ dθ over the octave,
// normalised over the levels built), which the frame's degrees per pixel
// fix. The number of levels follows the frame's size, so the halo reaches
// the same share of the frame at any resolution. The composite takes SHARE
// of the glare in place of the same share of the scene: no light is added,
// and a frame with nothing bright in it is the same frame.
//
// Cost. The levels hold a twelfth of the frame's pixels between them, in
// half floats (a 1170 × 2532 phone frame: 2 MB), and each pass reads a few
// taps per pixel. The enlarging passes add into their level by blending, so
// no level is held twice.
import * as THREE from 'three';
import { createFloatTarget, FullscreenPass } from './gpu.js';

/** The share of the scene's light that is spread: a camera lens's stray light, a few percent. */
export const GLARE_SHARE = 0.05;
/** The last level is the first whose shorter side would fall under this many pixels if halved again. */
const SMALLEST = 4;
const FIRST_SCALE = 0.25;
/** The CIE veil's terms for an eye of thirty with p = 1, in the order 1/θ³, 1/θ², 1/θ, 1 (θ in degrees). */
const AGE_FACTOR = 1 + (30 / 62.5) ** 4;
const GLARE_PSF = [10, 5 * AGE_FACTOR, 0.1 * AGE_FACTOR, 0.0025];

/**
 * The light the CIE veil holds in the octave from theta to 2 theta degrees,
 * 2π ∫ veil(θ) θ dθ: the weight of the level whose texel spans theta.
 */
export function octaveLight(theta) {
  const [cubic, square, linear, flat] = GLARE_PSF;
  return 2 * Math.PI * (cubic * 0.5 / theta + square * Math.LN2 + linear * theta + flat * 1.5 * theta * theta);
}

/** The levels' weights, summing to one, for texels of these many degrees (the first level's, doubling each level). */
export function levelWeights(firstTexelDegrees, levels) {
  const weights = Array.from({ length: levels }, (_, index) => octaveLight(firstTexelDegrees * 2 ** index));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

// The quarter-size first level: the destination pixel's centre lies between four source pixels; four
// bilinear taps a source pixel out from it each average four, a 4 × 4 box in all.
const FIRST_FRAGMENT = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
varying vec2 vUv;
void main() {
  vec2 off = uSourceTexel;
  vec3 sum = texture2D(uSource, vUv + vec2(-off.x, -off.y)).rgb + texture2D(uSource, vUv + vec2(off.x, -off.y)).rgb
           + texture2D(uSource, vUv + vec2(-off.x, off.y)).rgb + texture2D(uSource, vUv + vec2(off.x, off.y)).rgb;
  gl_FragColor = vec4(sum * 0.25, 1.0);
}
`;

// The halving pass (Jimenez's 13 taps: a 2 × 2 box of the source's pixels at the centre, four more
// boxes about it and four at the corners, weighted so no source pixel is counted twice).
const HALVE_FRAGMENT = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
varying vec2 vUv;
vec3 at(float x, float y) { return texture2D(uSource, vUv + vec2(x, y) * uSourceTexel).rgb; }
void main() {
  vec3 centre = at(0.0, 0.0);
  vec3 corners = at(-2.0, 2.0) + at(2.0, 2.0) + at(-2.0, -2.0) + at(2.0, -2.0);
  vec3 edges = at(0.0, 2.0) + at(-2.0, 0.0) + at(2.0, 0.0) + at(0.0, -2.0);
  vec3 inner = at(-1.0, 1.0) + at(1.0, 1.0) + at(-1.0, -1.0) + at(1.0, -1.0);
  gl_FragColor = vec4(centre * 0.125 + corners * 0.03125 + edges * 0.0625 + inner * 0.125, 1.0);
}
`;

// The enlarging pass: the smaller level through a 3 × 3 tent (a texel of its own out), scaled by its
// weight over the level above's, added to that level by blending.
const ENLARGE_FRAGMENT = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
uniform float uScale;
varying vec2 vUv;
vec3 at(float x, float y) { return texture2D(uSource, vUv + vec2(x, y) * uSourceTexel).rgb; }
void main() {
  vec3 tent = at(0.0, 0.0) * 4.0
    + (at(-1.0, 0.0) + at(1.0, 0.0) + at(0.0, -1.0) + at(0.0, 1.0)) * 2.0
    + at(-1.0, -1.0) + at(1.0, -1.0) + at(-1.0, 1.0) + at(1.0, 1.0);
  gl_FragColor = vec4(tent * (uScale / 16.0), 1.0);
}
`;

// The first level and the second enlarged into it, scaled by the first's weight: the glare.
const SUM_FRAGMENT = /* glsl */`
uniform sampler2D uSource;
uniform sampler2D uAbove;
uniform vec2 uSourceTexel;
uniform float uScale;
varying vec2 vUv;
vec3 at(float x, float y) { return texture2D(uSource, vUv + vec2(x, y) * uSourceTexel).rgb; }
void main() {
  vec3 tent = at(0.0, 0.0) * 4.0
    + (at(-1.0, 0.0) + at(1.0, 0.0) + at(0.0, -1.0) + at(0.0, 1.0)) * 2.0
    + at(-1.0, -1.0) + at(1.0, -1.0) + at(-1.0, 1.0) + at(1.0, 1.0);
  gl_FragColor = vec4((texture2D(uAbove, vUv).rgb + tent / 16.0) * uScale, 1.0);
}
`;

export class Glare {
  constructor() {
    this.levels = [];        // the halved levels, the first a quarter of the frame
    this.output = null;      // the glare: the levels' sum over their number, the first level's size
    this.share = GLARE_SHARE;
    const texel = () => ({ uSource: { value: null }, uSourceTexel: { value: new THREE.Vector2() } });
    this.firstPass = new FullscreenPass(FIRST_FRAGMENT, texel());
    this.halvePass = new FullscreenPass(HALVE_FRAGMENT, texel());
    this.enlargePass = new FullscreenPass(ENLARGE_FRAGMENT, { ...texel(), uScale: { value: 1 } },
      { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, transparent: true });
    this.sumPass = new FullscreenPass(SUM_FRAGMENT, { ...texel(), uAbove: { value: null }, uScale: { value: 1 } });
  }

  /** The glare's texture, the first level's size, filtered: sample it at the frame's uv. */
  get texture() { return this.output?.texture ?? null; }

  /** The levels for a frame of this many device pixels; call on every resize. */
  resize(width, height) {
    this.dispose();
    let levelWidth = Math.max(1, Math.round(width * FIRST_SCALE));
    let levelHeight = Math.max(1, Math.round(height * FIRST_SCALE));
    const level = (sizeX, sizeY) => createFloatTarget(sizeX, sizeY, { type: THREE.HalfFloatType, filter: THREE.LinearFilter });
    this.levels.push(level(levelWidth, levelHeight));
    while (Math.min(levelWidth, levelHeight) >= 2 * SMALLEST) {
      levelWidth = Math.max(1, Math.round(levelWidth / 2));
      levelHeight = Math.max(1, Math.round(levelHeight / 2));
      this.levels.push(level(levelWidth, levelHeight));
    }
    this.output = level(this.levels[0].width, this.levels[0].height);
  }

  /** All the levels and the output, for the memory estimate. */
  get targets() { return [...this.levels, this.output].filter(Boolean); }

  /** The glare of the scene in sceneTarget (linear radiance), into this.texture; degreesPerPixel is the frame's. */
  render(renderer, sceneTarget, degreesPerPixel) {
    const levels = this.levels;
    const weights = levelWeights(degreesPerPixel / FIRST_SCALE, levels.length);
    const previousTarget = renderer.getRenderTarget();
    const source = (pass, target) => {
      pass.material.uniforms.uSource.value = target.texture;
      pass.material.uniforms.uSourceTexel.value.set(1 / target.width, 1 / target.height);
    };
    source(this.firstPass, sceneTarget);
    this.firstPass.render(renderer, levels[0]);
    for (let index = 1; index < levels.length; index++) {
      source(this.halvePass, levels[index - 1]);
      this.halvePass.render(renderer, levels[index]);
    }
    for (let index = levels.length - 1; index >= 2; index--) {
      source(this.enlargePass, levels[index]);
      this.enlargePass.material.uniforms.uScale.value = weights[index] / weights[index - 1];
      this.enlargePass.render(renderer, levels[index - 1]);   // added to the level above: no clear
    }
    if (levels.length > 1) {
      source(this.sumPass, levels[1]);
      this.sumPass.material.uniforms.uAbove.value = levels[0].texture;
      this.sumPass.material.uniforms.uScale.value = weights[0];
      this.sumPass.render(renderer, this.output);
    } else {
      source(this.enlargePass, levels[0]);   // a frame too small for a second level: the first is the glare
      this.enlargePass.material.uniforms.uScale.value = 1;
      renderer.setRenderTarget(this.output);
      renderer.clear(true, false, false);
      this.enlargePass.render(renderer, this.output);
    }
    renderer.setRenderTarget(previousTarget);
  }

  dispose() {
    for (const target of this.levels) target.dispose();
    this.levels.length = 0;
    this.output?.dispose();
    this.output = null;
  }
}
