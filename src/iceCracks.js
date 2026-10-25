// The ice's cracks (src/ice.js crackLines) drawn on the sheet: each crack a
// ribbon along its points (ICE_CRACK_VERTEX and ICE_CRACK_FRAGMENT in
// src/shaders/scene.js), so a crack is as sharp as the screen, its kinks
// kinks and its width its own, tapering to a hairline, however near the eye
// comes. (The ice's mask, 1.2 cm a texel, would round its kinks and could
// give it no width of its own, and its distance field, signed by the side
// of the crack, crossed zero between two cracks near each other, drawing a
// dotted line there that no crack was.)
//
// Each point of a crack is two vertices, one either side; each segment two
// triangles. New cracks are appended once a frame (update), and only the
// vertices and indices they add are sent to the GPU (the buffers' update
// ranges). The buffers hold CRACK_DRAW.vertices at most (src/ice.js stops
// cracks at CRACK.mostSegments, under it); when the ice is made whole
// (src/ice.js crackEpoch) they start again. The mesh is one draw call over
// the ice, its program one material's, see-through (blended over the
// sheet, writing no depth, drawn before the other see-through things), on
// the main camera's layer only: the mirror image never holds it. From
// under the water it is drawn just under the sheet, dark. Each vertex keeps
// when the crack reached it (src/ice.js `times`), and a crack is drawn only
// as far as it has run by the ice's clock (uIceClock), so a break spreads
// from its blow.
import * as THREE from 'three';
import { ICE_CRACK_VERTEX, ICE_CRACK_FRAGMENT } from './shaders/scene.js';

// Vertices the ribbons hold at most (two a point; 16-bit indices), and how far a miter may stretch at a sharp turn.
const CRACK_DRAW = { vertices: 65000, miterMost: 3 };

export class IceCracks {
  /**
   * @param ice the sheet (src/ice.js IceSheet): its crackLines and uniforms
   * @param lighting src/main.js's: the sun, the sky's light, the water's extinction (shared vectors)
   * @param resolution the drawing buffer's size in pixels (a shared Vector2)
   * @param haze the weather's haze uniforms (src/sky.js hazeUniforms), which the cracks fade into with distance
   */
  constructor(ice, lighting, resolution, haze) {
    this.ice = ice;
    const capacity = CRACK_DRAW.vertices;
    this.lineData = new Float32Array(4 * capacity);
    this.shapeData = new Float32Array(4 * capacity);
    this.timeData = new Float32Array(capacity);
    this.indexData = new Uint16Array(3 * capacity);
    const geometry = new THREE.BufferGeometry();
    this.lineAttribute = new THREE.BufferAttribute(this.lineData, 4).setUsage(THREE.DynamicDrawUsage);
    this.shapeAttribute = new THREE.BufferAttribute(this.shapeData, 4).setUsage(THREE.DynamicDrawUsage);
    this.timeAttribute = new THREE.BufferAttribute(this.timeData, 1).setUsage(THREE.DynamicDrawUsage);
    this.indexAttribute = new THREE.BufferAttribute(this.indexData, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aLine', this.lineAttribute);
    geometry.setAttribute('aShape', this.shapeAttribute);
    geometry.setAttribute('aTime', this.timeAttribute);
    geometry.setIndex(this.indexAttribute);
    geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...ice.uniforms,
        uSunDir: { value: lighting.sunDirection },
        uSunIrradiance: { value: lighting.sunIrradiance },
        uSkyAmbient: { value: lighting.skyAmbient },
        uExtinction: { value: lighting.extinction },
        uResolution: { value: resolution },
        uIceClock: { value: 0 },   // the ice's clock (src/ice.js time): how far each crack has run
        ...haze,   // the weather's haze (src/sky.js)
      },
      vertexShader: ICE_CRACK_VERTEX,
      fragmentShader: ICE_CRACK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
    this.epoch = ice.crackEpoch;
    this.warming = false;
    this.drawn = 0;       // crackLines drawn so far
    this.vertices = 0;
    this.indices = 0;
  }

  /** Append the cracks made since (src/ice.js crackLines), or start again if the ice was made whole: once a frame. */
  update() {
    if (this.warming) return;
    const ice = this.ice, lines = ice.crackLines;
    this.material.uniforms.uIceClock.value = ice.time;
    if (ice.crackEpoch !== this.epoch) {
      this.epoch = ice.crackEpoch;
      this.drawn = this.vertices = this.indices = 0;
      this.mesh.geometry.setDrawRange(0, 0);
    }
    this.mesh.visible = ice.on && this.indices > 0;
    if (this.drawn >= lines.length) return;
    const firstVertex = this.vertices, firstIndex = this.indices;
    for (; this.drawn < lines.length; this.drawn++) {
      const crack = lines[this.drawn], count = crack.points.length / 2;
      if (this.vertices + 2 * count > CRACK_DRAW.vertices) { this.drawn = lines.length; break; }   // full: what is drawn stays
      this.append(crack);
    }
    if (this.vertices === firstVertex) return;
    this.send(firstVertex, firstIndex);
    this.mesh.visible = ice.on;
  }

  /** The vertices and indices from these on to the GPU, and the draw to them. */
  send(firstVertex, firstIndex) {
    for (const [attribute, size] of [[this.lineAttribute, 4], [this.shapeAttribute, 4], [this.timeAttribute, 1]]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(size * firstVertex, size * (this.vertices - firstVertex));
      attribute.needsUpdate = true;
    }
    this.indexAttribute.clearUpdateRanges();
    this.indexAttribute.addUpdateRange(firstIndex, this.indices - firstIndex);
    this.indexAttribute.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.indices);
  }

  /**
   * src/main.js's warm-up: a short crack at (x, z), shown whether there is
   * ice or not, so the program is built under the veil (warming: update
   * leaves it be); endWarmUp clears it.
   */
  warmUp(x, z) {
    this.warming = true;
    const firstVertex = this.vertices, firstIndex = this.indices;
    this.append({ points: [x, z, x + 0.03, z + 0.01, x + 0.06, z], widths: [0.001, 0.001, 0.0005], times: [-1e6, -1e6, -1e6], shade: 1 });
    this.send(firstVertex, firstIndex);
    this.mesh.visible = true;
  }

  endWarmUp() {
    this.warming = false;
    this.epoch = -1;   // the next update starts again from the ice's cracks
  }

  /** One crack's vertices (two a point: its normal there the miter of its segments) and its segments' triangles. */
  append(crack) {
    const points = crack.points, widths = crack.widths, count = points.length / 2;
    const base = this.vertices;
    for (let index = 0; index < count; index++) {
      const previous = Math.max(index - 1, 0), next = Math.min(index + 1, count - 1);
      // The unit tangents of the segments either side (one at an end).
      let inX = points[2 * index] - points[2 * previous], inZ = points[2 * index + 1] - points[2 * previous + 1];
      let outX = points[2 * next] - points[2 * index], outZ = points[2 * next + 1] - points[2 * index + 1];
      const inLength = Math.hypot(inX, inZ), outLength = Math.hypot(outX, outZ);
      if (inLength < 1e-9) { inX = outX; inZ = outZ; } else { inX /= inLength; inZ /= inLength; }
      if (outLength < 1e-9) { outX = inX; outZ = inZ; } else { outX /= outLength; outZ /= outLength; }
      if (inLength < 1e-9 && outLength >= 1e-9) { inX = outX; inZ = outZ; }
      let tangentX = inX + outX, tangentZ = inZ + outZ;
      const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
      tangentX /= tangentLength;
      tangentZ /= tangentLength;
      const normalX = -tangentZ, normalZ = tangentX;
      // The miter's stretch, so the ribbon keeps its width across each segment: 1 over the cosine of half the turn.
      const miter = Math.min(1 / Math.max(normalX * -outZ + normalZ * outX, 1e-3), CRACK_DRAW.miterMost);
      for (const side of [-1, 1]) {
        const vertex = this.vertices++;
        this.lineData.set([points[2 * index], points[2 * index + 1], normalX, normalZ], 4 * vertex);
        this.shapeData.set([side, widths[index] ?? widths[widths.length - 1], miter, crack.shade], 4 * vertex);
        this.timeData[vertex] = crack.times?.[index] ?? -1e6;
      }
    }
    for (let segment = 0; segment + 1 < count; segment++) {
      const first = base + 2 * segment;
      this.indexData.set([first, first + 1, first + 2, first + 1, first + 3, first + 2], this.indices);
      this.indices += 6;
    }
  }

  /** The GPU memory its buffers hold (bytes), for src/main.js's budget. */
  get bytes() { return this.lineData.byteLength + this.shapeData.byteLength + this.timeData.byteLength + this.indexData.byteLength; }
}
