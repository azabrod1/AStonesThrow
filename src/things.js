// What can be thrown (the Throw setting, src/main.js setThing): five kinds
// of stone and four balls, each the size, weight and make of the real thing,
// which is all the physics needs to know of it (src/rock.js, src/cavity.js).
//
// The stones are src/rock.js's procedural stone (createRockGeometry), each
// kind with its own squash, lumps, colouring and density (`look`):
//   - river stone, the default and the only one before: 2600 kg/m³, worn
//     smooth, brown-grey (its geometry and its draws are as they always were,
//     so a seeded throw is the same stone, tools/variety-probe.mjs);
//   - slate, 2750: a flat slab, blue-grey, its layers showing as bands;
//   - granite, 2700: rounder, pale pinkish grey, flecked with black mica and
//     white quartz;
//   - basalt, 3000: dark charcoal, finely speckled, the heaviest;
//   - pumice, 650: pale, lumpy and pitted with the gas bubbles that make it
//     lighter than water: it floats (src/rock.js `float`), about two thirds
//     under, until it soaks (it never does here).
// The slider (the strip's) sets a stone's size, 1.5 to 30 cm across, and its
// weight follows from its density.
//
// The balls, their sizes and weights the rules' (`measure`), each a sphere of
// SUBDIVISIONS of an icosahedron painted per vertex (createBallGeometry):
//   - golf ball: 42.7 mm, 45.9 g (density 1130: it sinks, slowly), white,
//     dimpled; on paving it comes back at BOUNCE 0.8 of the speed it came down at;
//   - tennis ball: 6.7 cm, 58 g (370: it floats, 2.8 cm of it under),
//     optic yellow felt with its white seam;
//   - bowling ball: 21.6 cm, 6 to 16 lb by the slider (520 to 1380 kg/m³:
//     one of 11 lb or lighter floats, one of 12 lb or more sinks), glossy,
//     swirled, with its three finger holes; it barely bounces, and rolls;
//   - basketball: sizes 5, 6 and 7 by the slider (22.2 to 23.9 cm, 480 to
//     620 g: 87 kg/m³), orange with black seams: it floats 4.3 cm deep and
//     on paving comes back at 0.85.
// The gems, each cut as a brilliant (createGemGeometry: a table, a crown of
// facets, the girdle, a pavilion to the culet; an emerald stretched into
// its step cut's oblong, a ruby and a sapphire into ovals), weighed in
// carats by the slider (5 to 1000 ct, 1 ct = 0.2 g), all sinking:
//   - diamond, 3510 kg/m³: colourless, its facets flashing white and in
//     the colours of its fire;
//   - emerald, 2760: deep green; ruby and sapphire (corundum), 4000: red and
//     blue.
// They are drawn with the same material as the rest, smooth and strongly
// reflecting, each facet's colour its own (as light comes back out of the
// stone through it); what one would see through a real gem is not drawn.
//
// Each has its own `ground` (src/rock.js meetGround: how it comes off the
// pool's deck, its friction there, whether it rolls and how much it is
// held back rolling) and, for the heavy ones, the fastest it can be thrown
// (`fastest`, from the work a throw puts into it, THROW_WORK).
//
// One material serves them all (src/rock.js): what tells them apart is in
// the geometry, the vertex colours and the material's colour, roughness and
// reflection, which are uniforms, so no kind compiles a program of its own
// (src/main.js warmUp).
import * as THREE from 'three';

export const WATER_DENSITY = 1000;
export const STONE_DENSITY = 2600;   // a river stone's: the splash and the cavity were fitted to it (tools/basilisk)
const POUND = 0.45359237;            // kg
const THROW_WORK = 120;              // J: the most a throw puts into a heavy thing (one arm, from the shore), so it leaves at most sqrt(2W/m)
const SUBDIVISIONS = 5;              // a ball's icosphere: 10242 vertices, 4 mm apart on a basketball

const ballMass = (radius, mass) => ({ radius, mass, density: mass / ((4 / 3) * Math.PI * radius ** 3) });
const CARAT = 0.0002;                // kg
/** An sRGB colour (0 to 255) in the linear values vertex colours take. */
function linear(red, green, blue) { return new THREE.Color().setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace); }
/** A gem (the header): weighed in carats, its radius the ball's of its mass and density (its nominal size, as a stone's). */
function gem(name, note, density, color, cut) {
  return {
    name, short: name, group: 'Gems', note,
    slider: { min: 5, max: 1000, step: 5, initial: 100, unit: 'ct' },
    measure: (carats) => { const mass = carats * CARAT; return { radius: Math.cbrt((3 * mass) / (4 * Math.PI * density)), mass, density }; },
    readout: (carats) => `${carats} ct`,
    cut: { color, ...cut }, roughness: cut.roughness, reflection: cut.reflection,
    ground: { bounce: [0.35, 0.5], friction: 0.4 },
  };
}

/**
 * The kinds (the header). `group` is the Throw page's heading; `slider` the
 * strip's range in its unit (null: a fixed size, the slider off), and
 * `measure(value)` its radius, mass and density; `readout(value)` the
 * strip's text for it. A stone's `look` is createRockGeometry's (src/rock.js);
 * a ball's `paint` colours its sphere (createBallGeometry). `ground` is how
 * it meets the pool's deck: `bounce` the share of the speed it came down at
 * it leaves at (a range: a stone's lumps strike unevenly), `friction` the
 * Coulomb coefficient, `roll` the share of its speed along the ground it
 * keeps once it rolls (5/7 for a solid ball, 3/5 for a shell; none for a
 * stone, which tumbles) and `rolling` its rolling resistance.
 */
export const THINGS = {
  stone: {
    name: 'River stone', short: 'Rock', group: 'Stones', note: 'Worn smooth, 2.6 times as heavy as water',
    slider: { min: 1.5, max: 30, step: 0.5, initial: 6, unit: 'cm' },
    look: { kind: 'river', density: 2600, restingHeight: 0.75 },
    ground: { bounce: [0.25, 0.45], friction: 0.6 },
  },
  slate: {
    name: 'Slate', short: 'Slate', group: 'Stones', note: 'A flat slab, blue-grey, in layers',
    slider: { min: 1.5, max: 30, step: 0.5, initial: 6, unit: 'cm' },
    look: {
      kind: 'slate', density: 2750, restingHeight: 0.35, squash: [0.22, 0.1, 0.55, 0.2], lumps: 0.45,
      hue: [0.57, 0.04], saturation: [0.03, 0.04], lightness: [0.26, 0.08], roughness: 0.8,
    },
    ground: { bounce: [0.2, 0.35], friction: 0.6 },
  },
  granite: {
    name: 'Granite', short: 'Granite', group: 'Stones', note: 'Pale and flecked; a little heavier',
    slider: { min: 1.5, max: 30, step: 0.5, initial: 6, unit: 'cm' },
    look: {
      kind: 'granite', density: 2700, restingHeight: 0.8, squash: [0.7, 0.18, 0.84, 0.16], lumps: 0.85,
      hue: [0.02, 0.03], saturation: [0.16, 0.08], lightness: [0.42, 0.08], roughness: 0.75,
    },
    ground: { bounce: [0.3, 0.45], friction: 0.6 },
  },
  basalt: {
    name: 'Basalt', short: 'Basalt', group: 'Stones', note: 'Dark and dense: sinks fastest',
    slider: { min: 1.5, max: 30, step: 0.5, initial: 6, unit: 'cm' },
    look: {
      kind: 'basalt', density: 3000, restingHeight: 0.75, squash: [0.62, 0.2, 0.8, 0.2], lumps: 0.9,
      hue: [0.6, 0.1], saturation: [0.02, 0.03], lightness: [0.1, 0.05], roughness: 0.85,
    },
    ground: { bounce: [0.25, 0.45], friction: 0.6 },
  },
  pumice: {
    name: 'Pumice', short: 'Pumice', group: 'Stones', note: 'Full of bubbles: lighter than water, it floats',
    slider: { min: 1.5, max: 30, step: 0.5, initial: 6, unit: 'cm' },
    look: {
      kind: 'pumice', density: 650, restingHeight: 0.8, squash: [0.66, 0.22, 0.8, 0.2], lumps: 1.25,
      hue: [0.1, 0.03], saturation: [0.22, 0.1], lightness: [0.68, 0.08], roughness: 1.0,
    },
    ground: { bounce: [0.2, 0.35], friction: 0.7 },
  },
  golf: {
    name: 'Golf ball', short: 'Golf ball', group: 'Balls', note: '46 g; a little heavier than water: it sinks slowly',
    slider: null,
    measure: () => ballMass(0.04267 / 2, 0.0459),
    readout: () => '46 g',
    paint: 'golf', roughness: 0.35, reflection: 0.9,
    ground: { bounce: [0.75, 0.82], friction: 0.4, roll: 5 / 7, rolling: 0.05 },
  },
  tennis: {
    name: 'Tennis ball', short: 'Tennis ball', group: 'Balls', note: '58 g; a hollow shell: it floats',
    slider: null,
    measure: () => ballMass(0.067 / 2, 0.058),
    readout: () => '58 g',
    paint: 'tennis', roughness: 1.0, reflection: 0.5,
    ground: { bounce: [0.72, 0.77], friction: 0.6, roll: 3 / 5, rolling: 0.04 },
  },
  bowling: {
    name: 'Bowling ball', short: 'Bowling ball', group: 'Balls', note: '11 lb and lighter float; 12 lb and heavier sink',
    slider: { min: 6, max: 16, step: 1, initial: 14, unit: 'lb' },
    measure: (pounds) => ballMass(0.2159 / 2, pounds * POUND),
    readout: (pounds) => `${pounds} lb`,
    paint: 'bowling', roughness: 0.14, reflection: 1.0,
    ground: { bounce: [0.15, 0.25], friction: 0.3, roll: 5 / 7, rolling: 0.015 },
  },
  basketball: {
    name: 'Basketball', short: 'Basketball', group: 'Balls', note: 'Sizes 5 to 7; it floats high',
    slider: { min: 5, max: 7, step: 1, initial: 7, unit: 'size' },
    measure: (size) => [ballMass(0.222 / 2, 0.48), ballMass(0.23 / 2, 0.54), ballMass(0.239 / 2, 0.62)][THREE.MathUtils.clamp(Math.round(size) - 5, 0, 2)],
    readout: (size) => ['480 g', '540 g', '620 g'][THREE.MathUtils.clamp(Math.round(size) - 5, 0, 2)],
    paint: 'basketball', roughness: 0.62, reflection: 0.8,
    ground: { bounce: [0.83, 0.87], friction: 0.6, roll: 3 / 5, rolling: 0.02 },
  },
  diamond: gem('Diamond', 'Colourless, its facets flashing', 3510, linear(232, 240, 255), { stretch: 1, fire: 0.15, contrast: [0.15, 1.6], roughness: 0.03, reflection: 2.0 }),
  emerald: gem('Emerald', 'Deep green, in its oblong cut', 2760, linear(18, 150, 80), { stretch: 1.4, fire: 0, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }),
  ruby: gem('Ruby', 'Red corundum, an oval', 4000, linear(190, 12, 45), { stretch: 1.25, fire: 0, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }),
  sapphire: gem('Sapphire', 'Blue corundum, an oval', 4000, linear(25, 55, 185), { stretch: 1.25, fire: 0, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }),
};
for (const [key, thing] of Object.entries(THINGS)) {
  thing.key = key;
  thing.stone = Boolean(thing.look);
  thing.ball = Boolean(thing.paint);
  thing.gem = Boolean(thing.cut);
  if (thing.stone) {
    // A stone's slider is its diameter; its mass a ball's of its density (the air's drag's, src/rock.js `mass`).
    thing.measure = (centimetres) => {
      const radius = centimetres / 200;
      return { radius, mass: thing.look.density * (4 / 3) * Math.PI * radius ** 3, density: thing.look.density };
    };
    thing.readout = (centimetres) => `${centimetres % 1 === 0 ? centimetres : centimetres.toFixed(1)} cm`;
  }
  // The fastest a throw sends it (the header): only a heavy thing is held back. A stone keeps its throw as before.
  thing.fastest = (value) => (thing.stone ? Infinity : Math.sqrt((2 * THROW_WORK) / thing.measure(value ?? thing.slider?.initial).mass));
}
export const THING_NAMES = Object.keys(THINGS);
export const DEFAULT_THING = 'stone';

// ---- the balls ------------------------------------------------------------

/** An icosphere of unit radius, indexed: each of the icosahedron's faces cut into four `subdivisions` times, the midpoints shared. */
function icosphere(subdivisions) {
  const golden = (1 + Math.sqrt(5)) / 2;
  const corners = [
    [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
    [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
    [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1],
  ];
  const positions = [];
  for (const [x, y, z] of corners) { const length = Math.hypot(x, y, z); positions.push(x / length, y / length, z / length); }
  let faces = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  for (let level = 0; level < subdivisions; level++) {
    const midpoints = new Map();
    const midpoint = (first, second) => {
      const key = first < second ? first * 65536 + second : second * 65536 + first;
      let index = midpoints.get(key);
      if (index === undefined) {
        const x = positions[first * 3] + positions[second * 3], y = positions[first * 3 + 1] + positions[second * 3 + 1], z = positions[first * 3 + 2] + positions[second * 3 + 2];
        const length = Math.hypot(x, y, z);
        index = positions.length / 3;
        positions.push(x / length, y / length, z / length);
        midpoints.set(key, index);
      }
      return index;
    };
    const next = [];
    for (let face = 0; face < faces.length; face += 3) {
      const [first, second, third] = [faces[face], faces[face + 1], faces[face + 2]];
      const one = midpoint(first, second), two = midpoint(second, third), three = midpoint(third, first);
      next.push(first, one, three, second, two, one, third, three, two, one, two, three);
    }
    faces = next;
  }
  return { positions: new Float32Array(positions), indices: faces };
}

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function valueNoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let result = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    result += (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz) * hash3(ix + dx, iy + dy, iz + dz);
  }
  return result;
}
const smoothstep = (edge0, edge1, value) => { const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1); return t * t * (3 - 2 * t); };

// A basketball's seams: its two great circles (x = 0 and y = 0) and the two
// curved ones round the ends of its x axis, |x| = 0.75 − 0.35·y², each
// SEAM.width (radians) wide and SEAM.depth (in R) deep.
const BASKETBALL = { orange: linear(196, 88, 40), seam: linear(28, 22, 20), width: 0.024, depth: 0.012 };
// A tennis ball's seam, the curve (a·cos t + b·cos 3t, a·sin t − b·sin 3t, 2·sqrt(a·b)·sin 2t) with a + b = 1, on the sphere.
const TENNIS = { felt: linear(214, 236, 66), seam: linear(236, 236, 226), lobe: 0.28, width: 0.05, depth: 0.012, samples: 720 };
// A golf ball's dimples about the vertices of a sixfold icosphere (362), each DIMPLE.radius (radians) across its half and DIMPLE.depth deep.
const GOLF = { white: linear(242, 242, 236), radius: 0.075, depth: 0.012, shade: 0.9 };
// A bowling ball's three holes (thumb and two fingers, radians across and in R deep) and its swirled shells, one pair of colours drawn per ball.
const BOWLING = {
  holes: [{ direction: [0.12, 0.99, 0], radius: 0.09 }, { direction: [-0.12, 0.99, 0], radius: 0.09 }, { direction: [0, 0.62, -0.78], radius: 0.105 }],
  holeDepth: 0.3, inside: linear(12, 12, 14),
  shells: [[linear(20, 40, 140), linear(110, 170, 235)], [linear(150, 20, 30), linear(25, 18, 20)], [linear(80, 30, 120), linear(220, 120, 200)], [linear(22, 22, 26), linear(120, 120, 130)], [linear(20, 100, 80), linear(120, 210, 190)]],
};

let tennisSeam = null;   // the seam's points, once
let golfDimples = null;  // the dimples' centres, once

/** Paint one vertex of a ball (unit direction x, y, z): how far in (in R) it is pressed, and its colour into `color`. */
function paintBall(paint, x, y, z, color, shells) {
  if (paint === 'basketball') {
    const curved = Math.abs(Math.abs(x) - (0.75 - 0.35 * y * y)) / Math.sqrt(1 + (0.7 * y) ** 2);
    const seam = Math.min(Math.abs(x), Math.abs(y), curved);
    const inSeam = 1 - smoothstep(0.6 * BASKETBALL.width, BASKETBALL.width, seam);
    const pebble = 0.93 + 0.1 * valueNoise3(x * 60, y * 60, z * 60);
    color.copy(BASKETBALL.orange).multiplyScalar(pebble).lerp(BASKETBALL.seam, inSeam);
    return BASKETBALL.depth * inSeam;
  }
  if (paint === 'tennis') {
    let nearest = Infinity;
    for (let index = 0; index < tennisSeam.length; index += 3) {
      const dot = x * tennisSeam[index] + y * tennisSeam[index + 1] + z * tennisSeam[index + 2];
      nearest = Math.min(nearest, 1 - dot);
    }
    const angle = Math.sqrt(2 * Math.max(nearest, 0));
    const inSeam = 1 - smoothstep(0.6 * TENNIS.width, TENNIS.width, angle);
    const fuzz = 0.9 + 0.14 * valueNoise3(x * 40, y * 40, z * 40);
    color.copy(TENNIS.felt).multiplyScalar(fuzz).lerp(TENNIS.seam, inSeam);
    return TENNIS.depth * inSeam;
  }
  if (paint === 'golf') {
    let nearest = -1;
    for (let index = 0; index < golfDimples.length; index += 3) nearest = Math.max(nearest, x * golfDimples[index] + y * golfDimples[index + 1] + z * golfDimples[index + 2]);
    const angle = Math.acos(Math.min(nearest, 1));
    const inside = Math.max(1 - (angle / GOLF.radius) ** 2, 0);
    color.copy(GOLF.white).multiplyScalar(1 - (1 - GOLF.shade) * inside);
    return GOLF.depth * inside;
  }
  // The bowling ball: a swirl of its two colours, and its holes.
  const warp = valueNoise3(x * 1.7 + 3, y * 1.7, z * 1.7) * 2.5;
  const swirl = smoothstep(0.38, 0.62, valueNoise3(x * 2.2 + warp, y * 2.2 - warp, z * 2.2 + 1.3));
  color.copy(shells[0]).lerp(shells[1], swirl);
  for (const hole of BOWLING.holes) {
    const [hx, hy, hz] = hole.direction;
    const length = Math.hypot(hx, hy, hz);
    const angle = Math.acos(Math.min((x * hx + y * hy + z * hz) / length, 1));
    if (angle < hole.radius) {
      const inside = smoothstep(hole.radius, 0.8 * hole.radius, angle);
      color.lerp(BOWLING.inside, inside);
      return BOWLING.holeDepth * inside;
    }
  }
  return 0;
}

const ballCache = new Map();   // paint (and shell) → the painted sphere's attributes

/**
 * A ball's geometry, of unit radius (the caller scales it): the icosphere
 * pressed in where it is grooved, dimpled or drilled, its normals the
 * surface's, its colours painted per vertex (the header). A bowling ball
 * draws its pair of colours from `random`. Built once per kind (and pair),
 * then copied.
 */
export function createBallGeometry(name, random = Math.random) {
  const paint = THINGS[name].paint;
  const shellIndex = paint === 'bowling' ? Math.floor(random() * BOWLING.shells.length) : 0;
  const key = `${paint}:${shellIndex}`;
  if (!ballCache.has(key)) {
    if (paint === 'tennis' && !tennisSeam) {
      const a = 1 - TENNIS.lobe, b = TENNIS.lobe, lift = 2 * Math.sqrt(a * b);
      tennisSeam = new Float32Array(TENNIS.samples * 3);
      for (let sample = 0; sample < TENNIS.samples; sample++) {
        const t = (sample / TENNIS.samples) * Math.PI * 2;
        tennisSeam.set([a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), lift * Math.sin(2 * t)], sample * 3);
      }
    }
    if (paint === 'golf' && !golfDimples) {
      // The sixfold icosphere's vertices: each face's points i·a + j·b + k·c over 6, normalized, kept once.
      const { positions, indices } = icosphere(0);
      const points = new Map();
      for (let face = 0; face < indices.length; face += 3) {
        const corner = (index) => [positions[indices[face + index] * 3], positions[indices[face + index] * 3 + 1], positions[indices[face + index] * 3 + 2]];
        const [first, second, third] = [corner(0), corner(1), corner(2)];
        for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6 - i; j++) {
          const k = 6 - i - j;
          const point = [0, 1, 2].map((axis) => i * first[axis] + j * second[axis] + k * third[axis]);
          const length = Math.hypot(...point);
          const unit = point.map((value) => value / length);
          points.set(unit.map((value) => value.toFixed(4)).join(','), unit);
        }
      }
      golfDimples = new Float32Array([...points.values()].flat());
    }
    const { positions, indices } = icosphere(SUBDIVISIONS);
    const colors = new Float32Array(positions.length);
    const color = new THREE.Color();
    const shells = paint === 'bowling' ? BOWLING.shells[shellIndex] : null;
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      const x = positions[vertex], y = positions[vertex + 1], z = positions[vertex + 2];
      const pressed = paintBall(paint, x, y, z, color, shells);
      positions[vertex] = x * (1 - pressed); positions[vertex + 1] = y * (1 - pressed); positions[vertex + 2] = z * (1 - pressed);
      colors[vertex] = color.r; colors[vertex + 1] = color.g; colors[vertex + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    ballCache.set(key, geometry);
  }
  return ballCache.get(key).clone();
}

// ---- the stones' looks ----------------------------------------------------

/**
 * A stone's colour at a vertex (createRockGeometry, src/rock.js) for a kind
 * other than the river stone's: `direction` the unit direction from its
 * centre, `point` the vertex (squashed), `seed` its noise's, `tint` the face's
 * faint tint (about 1), into `out` as linear values about 1 (the material's
 * colour multiplies them).
 */
export function stoneColor(kind, direction, point, seed, tint, out) {
  stonePattern(kind, direction, point, seed, tint, out);
  // Warmed as a river stone's speckle is (src/rock.js), or the sky's light leaves it blue.
  return out.multiply(STONE_WARMTH[kind]);
}
// Each kind's warmth: its vertex colours' red, green and blue against grey (a river stone's is about 1.25, 1, 0.75).
const STONE_WARMTH = { slate: new THREE.Color(1.05, 1, 0.92), granite: new THREE.Color(1.25, 1, 0.8), basalt: new THREE.Color(1.1, 1, 0.9), pumice: new THREE.Color(1.25, 1.05, 0.72) };

function stonePattern(kind, direction, point, seed, tint, out) {
  const grain = (scale, offset) => valueNoise3(direction.x * scale + seed + offset, direction.y * scale + offset, direction.z * scale + 2 * offset);
  if (kind === 'slate') {
    // Layers across its thickness (the short axis, y), a little wavy, and a faint grain.
    const layers = 0.88 + 0.2 * Math.sin(point.y * 45 + 4 * grain(3, 1)) + 0.1 * (grain(25, 2) - 0.5);
    return out.setScalar(layers * (0.9 + 0.1 * tint));
  }
  if (kind === 'granite') {
    // Black mica and white quartz in a pinkish feldspar.
    const mica = smoothstep(0.66, 0.72, grain(18, 3));
    const quartz = smoothstep(0.68, 0.74, grain(15, 7));
    out.setRGB(1.0, 0.96, 0.94).multiplyScalar(0.85 + 0.15 * tint);
    out.lerp(new THREE.Color(1.12, 1.1, 1.08), 0.7 * quartz);
    return out.lerp(new THREE.Color(0.22, 0.2, 0.2), 0.85 * mica);
  }
  if (kind === 'basalt') {
    const speckle = 0.85 + 0.3 * grain(30, 4);
    return out.setScalar(speckle * (0.9 + 0.1 * tint));
  }
  // Pumice: pale, its pits (the bubbles) dark.
  const pit = smoothstep(0.6, 0.7, grain(14, 5)) + 0.6 * smoothstep(0.62, 0.72, grain(32, 6));
  return out.setScalar((0.92 + 0.1 * tint) * (1 - 0.45 * Math.min(pit, 1)));
}

// ---- the gems --------------------------------------------------------------

// A brilliant of unit girdle radius: GEM.facets round, its table GEM.table
// across at GEM.crown up, its culet GEM.pavilion down.
const GEM = { facets: 8, table: 0.55, crown: 0.38, pavilion: 0.9, girdle: 1.08 };
const FIRE = [linear(255, 120, 90), linear(255, 220, 110), linear(120, 255, 170), linear(120, 170, 255), linear(220, 130, 255)];

/**
 * A gem's geometry (the header), separate triangles flat-shaded so each
 * facet catches the light on its own, stretched along z by its cut's
 * `stretch`; each facet's colour the gem's at a brightness drawn from
 * `random` over its cut's `contrast` (light coming back out of the stone:
 * a diamond's from near black to bright), a diamond's a share
 * (`fire`) of them in the spectrum's colours.
 */
export function createGemGeometry(name, random = Math.random) {
  const { color, stretch, fire, contrast } = THINGS[name].cut;
  const ring = (radius, height) => Array.from({ length: GEM.facets }, (unused, index) => {
    const angle = (index / GEM.facets) * Math.PI * 2;
    return [radius * Math.cos(angle) * GEM.girdle, height, radius * Math.sin(angle) * GEM.girdle * stretch];
  });
  const table = ring(GEM.table, GEM.crown), girdle = ring(1, 0), centre = [0, GEM.crown, 0], culet = [0, -GEM.pavilion, 0];
  const triangles = [];
  for (let index = 0; index < GEM.facets; index++) {
    const next = (index + 1) % GEM.facets;
    triangles.push([centre, table[next], table[index]]);
    triangles.push([table[index], table[next], girdle[index]], [table[next], girdle[next], girdle[index]]);
    triangles.push([girdle[index], girdle[next], culet]);
  }
  const positions = new Float32Array(triangles.length * 9), colors = new Float32Array(triangles.length * 9);
  const facet = new THREE.Color();
  triangles.forEach((corners, face) => {
    const spark = contrast[0] + contrast[1] * random();
    facet.copy(random() < fire ? FIRE[Math.floor(random() * FIRE.length)] : color).multiplyScalar(spark);
    corners.forEach((corner, cornerIndex) => {
      positions.set(corner, face * 9 + cornerIndex * 3);
      colors.set([facet.r, facet.g, facet.b], face * 9 + cornerIndex * 3);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
