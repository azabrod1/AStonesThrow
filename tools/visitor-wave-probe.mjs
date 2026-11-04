// Check the wave-vector expressions in the actual shader against numerical
// spatial derivatives of its phase. Both Kelvin branches, both sides of the
// track, several headings/speeds, and the outward breach rings are covered.
// And the contacts' heap and trough (visitorContacts), the shader's own lines
// run as JS: their slope has no curl and is the numerical gradient of the
// height they state, inside a piece's span, past its ends and beside it; the
// heap stands a width before the front, the trough a width behind the back,
// the water level along the flank between.
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

// The heap and the trough: the shader's lines from their comment to the slope, scalars as they are (exp and dot as
// JS's); the slope's vec2 line once for each axis, `heading` and `sideways` that axis's component.
const contacts = VISITOR_WATER.split('vec3 visitorContacts(')[1].split('vec3 visitorSlope(')[0];
const heapBegins = contacts.indexOf('// The heap and the trough');
const slopeLine = contacts.slice(heapBegins).match(/vec2 slope = (.*);/);
assert(heapBegins >= 0 && slopeLine, 'the contacts\' heap and trough and their slope must be in visitorContacts');
const heapLines = contacts.slice(heapBegins, heapBegins + slopeLine.index).split('\n')
  .map((line) => line.replace(/\/\/.*$/, '').trim()).filter(Boolean)
  .map((line) => {
    assert(line.startsWith('float '), `the heap's lines must be scalars: ${line}`);
    return line.replace(/^float /, 'let ').replaceAll(/\bexp\(/g, 'Math.exp(');
  });
const heapAt = new Function('offset', 'heading', 'sideways', 'capsule', 'span', 'width', 'contact', 'footprint', 'dot', `${heapLines.join('\n')}
  const slopeOn = (heading, sideways) => ${slopeLine[1]};
  return { height: typeof height === 'number' ? height : null, slope: [slopeOn(heading[0], sideways[0]), slopeOn(heading[1], sideways[1])] };`);
const dot = (one, other) => one[0] * other[0] + one[1] * other[1];
/** The heap at `point` (world xz) of a contact at the origin: the shader's visitorCapsule, then its lines. */
const heapSample = (point, heading, span, width, pushed) => {
  const sideways = [-heading[1], heading[0]], along = dot(point, heading);
  const capsule = { x: Math.sign(along) * Math.max(Math.abs(along) - span, 0), y: dot(point, sideways) };
  return heapAt(point, heading, sideways, capsule, span, width, { z: width, w: pushed }, 0, dot);
};
let curlWorst = 0, gradientWorst = 0, heapPoints = 0;
for (const angle of [0, 0.7, 2.1]) {
  const heading = [Math.cos(angle), Math.sin(angle)], sideways = [-heading[1], heading[0]];
  for (const width of [0.06, 0.16, 0.35]) {
    for (const span of [0, 0.3, 2]) {
      for (const pushed of [0.02, 0.1]) {
        const scale = pushed / width;   // the slopes' size
        for (const alongShare of [-0.97, -0.71, -0.43, -0.13, 0.07, 0.29, 0.61, 0.89]) {
          for (const sideShare of [-0.9, -0.4, 0.1, 0.5, 0.95]) {
            const along = alongShare * (span + 4 * width), side = sideShare * 3 * width;
            const point = [along * heading[0] + side * sideways[0], along * heading[1] + side * sideways[1]];
            const at = (axis, by) => { const moved = [...point]; moved[axis] += by; return heapSample(moved, heading, span, width, pushed); };
            const { height, slope } = heapSample(point, heading, span, width, pushed);
            const curl = (at(0, step).slope[1] - at(0, -step).slope[1] - at(1, step).slope[0] + at(1, -step).slope[0]) / (2 * step);
            curlWorst = Math.max(curlWorst, Math.abs(curl) * width / scale);
            for (let axis = 0; axis < 2 && height !== null; axis++) {
              gradientWorst = Math.max(gradientWorst, Math.abs((at(axis, step).height - at(axis, -step).height) / (2 * step) - slope[axis]) / scale);
            }
            if (height === null) gradientWorst = Infinity;
            heapPoints++;
          }
        }
      }
    }
  }
}
assert(curlWorst < 1e-5, `the contacts' slope must have no curl (it is a height's gradient): ${curlWorst.toExponential(2)} of its size per width`);
assert(gradientWorst < 1e-6, gradientWorst === Infinity ? 'the heap\'s lines must state the height (`height`) its slope is the gradient of' : `the contacts' slope must be its height's gradient: off by ${gradientWorst.toExponential(2)} of its size`);
{
  // A long piece (its half-length three widths): the heap's top a width before its front, the trough's a width behind
  // its back, both pushed / √e; the water at its middle, beside it, level.
  const heading = [Math.cos(0.7), Math.sin(0.7)], width = 0.3, span = 0.9, pushed = 0.05;
  const heightAt = (along, side = 0) => heapSample([along * heading[0] - side * heading[1], along * heading[1] + side * heading[0]], heading, span, width, pushed).height;
  const top = Math.exp(-0.5) * pushed;
  assert(Math.abs(heightAt(span + width) - top) < 0.01 * top && Math.abs(heightAt(-span - width) + top) < 0.01 * top, 'the heap a width before the front, the trough a width behind the back');
  assert(Math.abs(heightAt(0, 1.5 * width)) < 0.01 * top && Math.abs(heightAt(0)) < 0.01 * top, 'level along the flank between them');
}

console.log(`visitor-wave-probe: ${checked} Kelvin gradient components, 9 ring gradients and the contacts' heap at ${heapPoints} points passed (curl ${curlWorst.toExponential(1)}, gradient ${gradientWorst.toExponential(1)} of its size)`);
