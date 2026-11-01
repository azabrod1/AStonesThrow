// Check the wave-vector expressions in the actual shader against numerical
// spatial derivatives of its phase. Both Kelvin branches, both sides of the
// track, several headings/speeds, and the outward breach rings are covered.
import assert from 'node:assert/strict';
import { VISITOR_WATER } from '../src/shaders/visitor.js';
const kelvin = VISITOR_WATER.split('vec3 visitorKelvin(')[1].split('vec3 visitorRings(')[0];
const phaseExpression = kelvin.match(/float phase = (.*);/)[1];
const vectorExpression = kelvin.match(/vec2 waveVector = (.*);/)[1].replaceAll('sign(', 'Math.sign(');
const phaseAt = new Function('waveNumber', 'behind', 'across', 'cosTheta', 'sinTheta', `return ${phaseExpression}`);
const vectorAt = new Function('waveNumber', 'cosTheta', 'heading', 'sinTheta', 'side', 'sideways', `return ${vectorExpression}`);
const step = 1e-5;
let checked = 0;
for (const speed of [0.4, 1.2, 1.9]) {
  for (const angle of [0, 0.7, 2.1]) {
    const heading = [Math.cos(angle), Math.sin(angle)], sideways = [-heading[1], heading[0]];
    for (const ratio of [-0.34, -0.2, -0.02, 0.02, 0.2, 0.34]) {
      for (const branch of [0, 1]) {
        const sample = (point) => {
          const behind = -(point[0] * heading[0] + point[1] * heading[1]);
          const side = point[0] * sideways[0] + point[1] * sideways[1], across = Math.abs(side);
          const tanAlpha = across / behind, root = Math.sqrt(1 - 8 * tanAlpha * tanAlpha);
          const transverse = 2 * tanAlpha / (1 + root), tangent = branch === 0 ? transverse : 0.5 / transverse;
          const cosTheta = 1 / Math.sqrt(1 + tangent * tangent), sinTheta = tangent * cosTheta;
          const waveNumber = 9.81 / (speed * speed * cosTheta * cosTheta);
          return {
            phase: phaseAt(waveNumber, behind, across, cosTheta, sinTheta),
            gradient: heading.map((component, axis) => vectorAt(waveNumber, cosTheta, component, sinTheta, side, sideways[axis])),
          };
        };
        const point = heading.map((component, axis) => -20 * component + 20 * ratio * sideways[axis]);
        const analytic = sample(point).gradient;
        for (let axis = 0; axis < 2; axis++) {
          const before = [...point], after = [...point];
          before[axis] -= step; after[axis] += step;
          const derivative = (sample(after).phase - sample(before).phase) / (2 * step);
          assert(Math.abs(derivative - analytic[axis]) < 1e-5 * Math.max(1, Math.abs(derivative)), 'Kelvin wave vector must be its phase gradient');
          checked++;
        }
      }
    }
  }
}
const rings = VISITOR_WATER.split('vec3 visitorRings(')[1].split('vec3 visitorContacts(')[0];
const radialExpression = rings.match(/visitorWave\(height, phase \+ 1\.5707963, (.*), acrossX, acrossY\)/)[1];
const radialAt = new Function('waveNumber', 'offset', 'radius', `return ${radialExpression}`);
for (const age of [0.5, 2, 8]) {
  for (const radius of [1, 5, 20]) {
    const phase = (distance) => 9.81 * age * age / (4 * distance);
    const numerical = (phase(radius + step) - phase(radius - step)) / (2 * step);
    assert(Math.abs(numerical - radialAt(phase(radius) / radius, radius, radius)) < 1e-6, 'ring gradient must point inward as its phase decreases outward');
  }
}
console.log(`visitor-wave-probe: ${checked} Kelvin gradient components and 9 ring gradients passed`);
