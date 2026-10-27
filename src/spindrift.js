// Spindrift: the spray a gale blows off its breaking crests. At Beaufort 8
// the edges of the crests break into spindrift, foam blown in streaks along
// the wind; a whitecap here throws puffs of mist that the wind carries
// downwind off the crest, which is what the whitecaps lacked: on a surface
// alone, however well drawn, they read as a pattern laid on the water.
//
// The spray is points flown in the vertex shader (SPINDRIFT_VERTEX in
// src/shaders/gale.js, which says how one flies): a lattice of CELL-metre
// cells over REACH metres round the point the camera looks at, SLOTS points
// a cell (SPECK_SLOTS of them specks, the drops themselves, the rest faint
// puffs of mist), each point one slot, hashed from the cell, the slot and
// the clock, so nothing is stepped or written per frame and a seeded
// throw's spray is the same every run; a point draws only where the gale's
// foam map (src/galeWaves.js) holds a fresh whitecap, which is a few per
// cent of the water, so nearly every point costs its vertex (two texture
// reads) and nothing more: about 50,000 vertices a frame under a gale, one
// draw, none otherwise (setOn). The lattice follows the focus by whole
// cells (update), so a throw keeps its place as the view turns.
import * as THREE from 'three';
import { SPINDRIFT_VERTEX, SPINDRIFT_FRAGMENT } from './shaders/gale.js';

const CELL = 0.25;       // metres: a lake whitecap is a few tenths of a metre across, so a cell this size gives it a few puffs in flight
const REACH = 10;        // metres round the focus, each way
const SLOTS = 8;         // throws a cell can have in flight, at their own phases...
const SPECK_SLOTS = 6;   // ...of which this many are specks, the rest puffs of mist
const MIN_PIXELS = 2;
const OPACITY = 0.85;

export class Spindrift {
  /**
   * @param lighting the scene's lighting (src/main.js): the puffs take the sky's light and the sun's
   * @param gale the gale's uniforms (GaleWaves.uniforms(), src/galeWaves.js): the foam map and the surface
   * @param crestSpeed m/s a breaking crest's whitewater travels (GaleWaves.crestSpeed times WHITECAP_SPEED)
   */
  constructor(lighting, { gale, crestSpeed }) {
    const span = Math.ceil(2 * REACH / CELL);
    const count = span * span * SLOTS;
    const geometry = new THREE.BufferGeometry();
    const cells = new Float32Array(count * 3);
    let index = 0;
    for (let row = 0; row < span; row++) {
      for (let column = 0; column < span; column++) {
        for (let slot = 0; slot < SLOTS; slot++) {
          cells[index++] = column - span / 2;
          cells[index++] = row - span / 2;
          cells[index++] = slot;
        }
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aCell', new THREE.Float32BufferAttribute(cells, 3));
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      vertexShader: SPINDRIFT_VERTEX,
      fragmentShader: SPINDRIFT_FRAGMENT,
      uniforms: {
        uFocusCell: { value: new THREE.Vector2() },
        uCellSize: { value: CELL },
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2(0, -1) },
        uCrestSpeed: { value: crestSpeed },
        uProjScale: { value: 1000 },
        uMinPixels: { value: MIN_PIXELS },
        uOpacity: { value: OPACITY },
        uSpeckSlots: { value: SPECK_SLOTS },
        uSkyAmbient: { value: lighting.skyAmbient },
        uSunIrradiance: { value: lighting.sunIrradiance },
        uSunDir: { value: lighting.sunDirection },
        ...gale,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** The direction the wind blows toward, world XZ ([x, z], normalised here). */
  setWind(direction) {
    const length = Math.hypot(direction[0], direction[1]) || 1;
    this.points.material.uniforms.uWind.value.set(direction[0] / length, direction[1] / length);
  }

  /** Whether a gale blows: only then is anything drawn. */
  setOn(on) { this.points.visible = on; }

  /** Place the lattice for the frame: world time `time`, the camera (its render target `resolution` pixels), looking at the water about `focus` (world XZ). */
  update(time, camera, resolution, focus) {
    if (!this.points.visible) return;
    const uniforms = this.points.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uProjScale.value = camera.projectionMatrix.elements[5] * resolution.y * 0.5;
    uniforms.uFocusCell.value.set(Math.floor(focus[0] / CELL), Math.floor(focus[1] / CELL));
  }
}
