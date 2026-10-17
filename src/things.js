// What can be thrown (the Object setting, src/main.js setThing): a
// registry of definitions (defineThing), each a plain description of the
// real thing, which is all the physics needs to know of it (src/rock.js,
// src/cavity.js, src/collide.js) and all the page needs to offer it (the
// setting's cards, the strip's slider, index.html). A definition is data,
// in the parts a physics engine gives a body:
//   - body: its `shape` for the physics (src/rock.js: `sphere`, analytic, or
//     `mesh`, its mesh's own shape, moments and lowest point),
//     its `density` (kg/m³) where that is what it has, and its `size`, which
//     the slider sets:
//       { by: 'diameter', unit: 'cm', min, max, step, initial }   (needs a density; its mass a ball's of it)
//       { by: 'mass', unit: 'g' | 'kg' | 'lb' | 'ct', min, max, step, initial }   (a body.diameter, or a density)
//       { by: 'preset', unit, presets: [{ value, label, diameter, mass }], initial }
//       { by: 'fixed', diameter, mass }   (the slider off)
//     A sphere's density follows from its mass and diameter; a mesh's from
//     its mass and its mesh's own volume (src/rock.js), a pizza's being a disc.
//   - material: how it meets the pool's deck and other things (src/rock.js
//     meetGround, src/collide.js): `bounce`, the share of the speed it came
//     down at it leaves at (a range: a stone's lumps strike unevenly),
//     `friction` (Coulomb), `roll` ('solid', 'shell' or none: a ball keeps 5/7
//     or 3/5 of its speed along the ground once it rolls; a thing that does
//     not roll tumbles) and `rolling`, its rolling resistance.
//   - air: `drag`, its drag coefficient in flight (on the disc of its nominal
//     radius: 0.47 a ball's; a pizza, flat on, more), and its `model`:
//     `ballistic` (it tumbles as it flies) or `flutter` (a soft, flat thing:
//     it turns broadside to the air, wobbles, spins on its face and glides a
//     little, src/rock.js Rock.flutter).
//   - body.upright: it is kept one way up (its own +y: a pizza's toppings),
//     in the air and afloat; otherwise a flat floater lies either way up.
//   - body.soft, a soft thing's give (a pizza's): in the air its edges trail
//     the centre, cupped against the air, and flap (src/rock.js Rock.flex).
//   - water: `restingHeight`, its centre over the bed at rest, in radii, and
//     `dry`, for a thing with a rim (a pizza's crust), the share of its radius
//     inside the rim that the water does not reach: it rides the water, so its
//     rim holds it out (src/waterSurface.js setDryDiscs).
//   - look: `mesh`, the kind of mesh it is drawn with (src/thingMeshes.js,
//     registerMesh), that kind's own parameters, and the material's
//     `roughness` and `reflection`; `thumbnail`, its card's picture.
//   - abilities: `skips` (Skip skips it: a stone), `held` (a throw puts at
//     most THROW_WORK into it, so a heavy thing leaves slower; a stone keeps
//     its throw as it always was).
// Besides: `name`, `short` (the strip's name for it), `group` (the setting's
// heading), `note` (the card's line) and `called` (the throw button's
// "Throw …"; else the group's).
//
// defineThing checks a definition (validateThing, which says what is wrong
// with it, so one written by hand, or by a user, fails plainly), derives
// from it what the rest reads (the slider, measure, readout, fastest) and
// registers it; onThingsChange tells the page. A new thing is a definition;
// a new look is a mesh builder (src/thingMeshes.js); a new kind of body or of
// flight (a feather's flutter, which falls slower than any drag on a disc
// says) a body or an air model in src/rock.js, its name added here.
//
// The things defined here:
//   - stones (src/thingMeshes.js createRockGeometry, each kind its own squash,
//     lumps, colouring and density): the river stone, the default and the
//     only one before (2600 kg/m³; its geometry, its draws and its throw as
//     they always were, so a seeded throw is the same stone,
//     tools/variety-probe.mjs), slate (2750, a flat slab in layers), granite
//     (2700, pale, flecked), basalt (3000, dark: it sinks fastest), pumice
//     (650: it floats, until it soaks, which here it never does); 1.5 to
//     30 cm across;
//   - balls, the rules' sizes and weights: golf (42.7 mm, 45.9 g: 1130 kg/m³,
//     it sinks slowly), tennis (6.7 cm, 58 g: 370, it floats 2.8 cm under),
//     bowling (21.6 cm, 6 to 16 lb: one of 11 lb or lighter floats),
//     basketball (sizes 5 to 7: 87 kg/m³, it floats 4.3 cm under);
//   - gems, cut as brilliants, 5 to 1000 carats (1 ct = 0.2 g), all sinking:
//     diamond (3510), emerald (2760), ruby and sapphire (corundum, 4000);
//   - other things: an apple (100 to 300 g at 815 kg/m³: a quarter of it is
//     air, so it floats, low), a pizza (20, 30 or 40 cm across, a disc with
//     its crust, cheese and pepperoni, about 420 kg/m³, mostly airy bread: it
//     floats flat, toppings up; soft, it flutters through the air, level,
//     flexing), a watermelon (2 to 10 kg at 960 kg/m³: it floats with only a
//     sliver of its back above the water) and a brick (215 × 102.5 × 65 mm,
//     2.7 kg: about 1900 kg/m³, its density from its mesh's volume; it sinks,
//     and lands on the deck with a thud).
//
// One material serves them all (src/rock.js): what tells them apart is in
// the geometry, the vertex colours and the material's colour, roughness and
// reflection, which are uniforms, so no thing compiles a program of its own
// (src/main.js warmUp).
import { meshKind } from './thingMeshes.js';

export const WATER_DENSITY = 1000;
export const STONE_DENSITY = 2600;   // a river stone's: the splash and the cavity were fitted to it (tools/basilisk)
const THROW_WORK = 120;              // J: the most a throw puts into a held thing (one arm, from the shore), so it leaves at most sqrt(2W/m)
const MASS_UNITS = { g: 0.001, kg: 1, lb: 0.45359237, ct: 0.0002 };   // kg per unit
const ROLLS = { solid: 5 / 7, shell: 3 / 5 };   // the share of its speed along the ground a ball keeps once it rolls
const BODY_SHAPES = ['sphere', 'mesh'];         // the bodies src/rock.js knows
const AIR_MODELS = ['ballistic', 'flutter'];    // the flights src/rock.js knows (Rock.fly)
const CALLED = { Stones: 'a rock', Balls: 'a ball', Gems: 'a gem' };
const DEFAULTS = { air: { drag: 0.47, model: 'ballistic' }, look: { roughness: 0.92, reflection: 0.9 }, abilities: { skips: false, held: true } };

export const THINGS = {};
export const THING_NAMES = [];
export const DEFAULT_THING = 'stone';
const listeners = new Set();

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** What is wrong with a definition (the header), as sentences; none for a good one. */
export function validateThing(key, definition) {
  const problems = [];
  const need = (condition, problem) => { if (!condition) problems.push(problem); };
  need(typeof key === 'string' && /^[a-z][a-z0-9-]*$/.test(key), `its key "${key}" must be lower case letters, digits and dashes`);
  if (!definition || typeof definition !== 'object') return [...problems, 'it is not an object'];
  for (const field of ['name', 'group', 'note']) need(typeof definition[field] === 'string' && definition[field].length > 0, `it needs a ${field}`);
  const { body, material, look } = definition;
  need(body && BODY_SHAPES.includes(body.shape), `body.shape must be one of ${BODY_SHAPES.join(', ')}`);
  const size = body?.size;
  need(size && ['diameter', 'mass', 'preset', 'fixed'].includes(size.by), 'body.size.by must be diameter, mass, preset or fixed');
  if (size?.by === 'diameter' || size?.by === 'mass') {
    need(isNumber(size.min) && isNumber(size.max) && isNumber(size.step) && size.min > 0 && size.max > size.min && size.step > 0, 'body.size needs min < max and a step, all above 0');
    need(isNumber(size.initial) && size.initial >= size.min && size.initial <= size.max, 'body.size.initial must lie between its min and max');
  }
  if (size?.by === 'diameter') need(size.unit === 'cm' && isNumber(body.density) && body.density > 0, 'a thing sized by its diameter needs unit cm and a body.density');
  if (size?.by === 'mass') {
    need(Object.hasOwn(MASS_UNITS, size.unit), `body.size.unit must be one of ${Object.keys(MASS_UNITS).join(', ')}`);
    need((isNumber(body.diameter) && body.diameter > 0) || (isNumber(body.density) && body.density > 0), 'a thing sized by its mass needs a body.diameter or a body.density');
  }
  if (size?.by === 'preset') {
    need(Array.isArray(size.presets) && size.presets.length > 0 && size.presets.every((preset, index) => isNumber(preset.value) && preset.diameter > 0 && preset.mass > 0 && typeof preset.label === 'string' && (index === 0 || preset.value === size.presets[index - 1].value + 1)),
      'body.size.presets must be a list of { value, label, diameter, mass }, their values counting up by 1');
    need(size.presets?.some((preset) => preset.value === size.initial), 'body.size.initial must be one of its presets\' values');
  }
  if (size?.by === 'fixed') need(isNumber(size.diameter) && size.diameter > 0 && isNumber(size.mass) && size.mass > 0, 'a thing of one size needs body.size.diameter and body.size.mass');
  const bounce = material?.bounce;
  need(Array.isArray(bounce) && bounce.length === 2 && bounce.every(isNumber) && bounce[0] >= 0 && bounce[0] <= bounce[1] && bounce[1] <= 1, 'material.bounce must be [least, most] within 0 to 1');
  need(isNumber(material?.friction) && material.friction >= 0, 'material.friction must be 0 or more');
  need(material?.roll === undefined || material.roll === null || Object.hasOwn(ROLLS, material.roll), 'material.roll must be solid, shell or none');
  need(!material?.roll || (isNumber(material.rolling) && material.rolling >= 0), 'a thing that rolls needs material.rolling');
  need(definition.air?.drag === undefined || (isNumber(definition.air.drag) && definition.air.drag > 0), 'air.drag must be above 0');
  need(definition.air?.model === undefined || AIR_MODELS.includes(definition.air.model), `air.model must be one of ${AIR_MODELS.join(', ')}`);
  need(definition.body?.upright === undefined || typeof definition.body.upright === 'boolean', 'body.upright must be true or false');
  const soft = definition.body?.soft;
  need(soft === undefined || ['cup', 'most', 'flap', 'rate'].every((field) => isNumber(soft[field]) && soft[field] >= 0), 'body.soft needs cup, most, flap and rate, each 0 or more');
  need(isNumber(definition.water?.restingHeight) && definition.water.restingHeight > 0, 'water.restingHeight must be above 0');
  need(definition.water?.dry === undefined || (isNumber(definition.water.dry) && definition.water.dry > 0 && definition.water.dry < 1), 'water.dry must lie between 0 and 1');
  need(look && meshKind(look.mesh), `look.mesh "${look?.mesh}" is no registered mesh (src/thingMeshes.js)`);
  return problems;
}

/** The radius (m), mass (kg) and density (kg/m³, a sphere's of its radius; a mesh's own is src/rock.js's) of a definition at its slider's `value`. */
function measureFor(definition) {
  const { body } = definition;
  const size = body.size;
  const ball = (radius, mass) => ({ radius, mass, density: mass / ((4 / 3) * Math.PI * radius ** 3) });
  switch (size.by) {
    case 'diameter':
      // Its mass a ball's of its density (the air's drag's, src/rock.js `mass`, as a stone's always was).
      return (centimetres) => {
        const radius = centimetres / 200;
        return { radius, mass: body.density * (4 / 3) * Math.PI * radius ** 3, density: body.density };
      };
    case 'mass':
      return (value) => {
        const mass = value * MASS_UNITS[size.unit];
        if (isNumber(body.diameter)) return ball(body.diameter / 2, mass);
        return { radius: Math.cbrt((3 * mass) / (4 * Math.PI * body.density)), mass, density: body.density };
      };
    case 'preset':
      return (value) => {
        const preset = size.presets.find((candidate) => candidate.value === Math.round(value)) ?? size.presets[0];
        return ball(preset.diameter / 2, preset.mass);
      };
    default:
      return () => ball(size.diameter / 2, size.mass);
  }
}

/** The strip's text for a definition's slider `value`. */
function readoutFor(definition) {
  const size = definition.body.size;
  const grams = (mass) => (mass < 1 ? `${Math.round(mass * 1000)} g` : `${mass.toFixed(1)} kg`);
  switch (size.by) {
    case 'diameter': return (value) => `${value % 1 === 0 ? value : value.toFixed(1)} cm`;
    case 'mass': return (value) => `${value} ${size.unit}`;
    case 'preset': return (value) => (size.presets.find((preset) => preset.value === Math.round(value)) ?? size.presets[0]).label;
    default: return () => grams(size.mass);
  }
}

/**
 * Register a thing under `key` (the header): checked (it throws, listing
 * what is wrong), its defaults filled in and what the rest reads derived:
 * `slider` (the strip's range in its unit, or null), `measure(value)`,
 * `readout(value)`, `fastest(value)` (m/s), `called`, the material's `roll`
 * as a share, and `sphere`, `byDiameter`, `skips`. A key already defined is
 * replaced. Returns the thing.
 */
export function defineThing(key, definition) {
  const problems = validateThing(key, definition);
  if (problems.length > 0) throw new Error(`The thing "${key}" cannot be defined: ${problems.join('; ')}.`);
  const size = definition.body.size;
  const thing = {
    ...definition,
    key,
    short: definition.short ?? definition.name,
    called: definition.called ?? CALLED[definition.group] ?? `a ${definition.name.toLowerCase()}`,
    air: { ...DEFAULTS.air, ...definition.air },
    look: { ...DEFAULTS.look, thumbnail: `assets/things/thumbs/${key}.jpg`, ...definition.look },
    abilities: { ...DEFAULTS.abilities, ...definition.abilities },
    material: { ...definition.material, roll: definition.material.roll ? ROLLS[definition.material.roll] : null },
    sphere: definition.body.shape === 'sphere',
    byDiameter: size.by === 'diameter',
    slider: size.by === 'fixed' ? null
      : size.by === 'preset' ? { min: size.presets[0].value, max: size.presets.at(-1).value, step: 1, initial: size.initial, unit: size.unit }
        : { min: size.min, max: size.max, step: size.step, initial: size.initial, unit: size.unit },
    measure: measureFor(definition),
    readout: readoutFor(definition),
  };
  thing.skips = thing.abilities.skips;
  // The fastest a throw sends it: a held thing no faster than THROW_WORK lets it go; a stone as it always was.
  thing.fastest = (value) => (thing.abilities.held ? Math.sqrt((2 * THROW_WORK) / thing.measure(value ?? thing.slider?.initial).mass) : Infinity);
  THINGS[key] = thing;
  if (!THING_NAMES.includes(key)) THING_NAMES.push(key);
  for (const listener of listeners) listener(key);
  return thing;
}

/** Call `listener(key)` whenever a thing is defined (the page rebuilds its cards). Returns the way to stop. */
export function onThingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The groups, in the order their first things were defined, each with its things' keys. */
export function thingGroups() {
  const groups = new Map();
  for (const key of THING_NAMES) {
    const group = THINGS[key].group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(key);
  }
  return [...groups].map(([name, keys]) => ({ name, keys }));
}

// ---- the things ------------------------------------------------------------

const stone = (name, note, density, look, { short = name, restingHeight = 0.75, bounce = [0.25, 0.45], friction = 0.6 } = {}) => ({
  name, short, group: 'Stones', note,
  body: { shape: 'mesh', density, size: { by: 'diameter', unit: 'cm', min: 1.5, max: 30, step: 0.5, initial: 6 } },
  material: { bounce, friction },
  water: { restingHeight },
  look: { mesh: 'stone', ...look },
  abilities: { skips: true, held: false },
});
defineThing('stone', stone('River stone', 'Worn smooth, 2.6 times as heavy as water', 2600, { pattern: 'river' }, { short: 'Rock' }));
defineThing('slate', stone('Slate', 'A flat slab, blue-grey, in layers', 2750, {
  pattern: 'slate', squash: [0.22, 0.1, 0.55, 0.2], lumps: 0.45, hue: [0.57, 0.04], saturation: [0.03, 0.04], lightness: [0.26, 0.08], roughness: 0.8,
}, { restingHeight: 0.35, bounce: [0.2, 0.35] }));
defineThing('granite', stone('Granite', 'Pale and flecked; a little heavier', 2700, {
  pattern: 'granite', squash: [0.7, 0.18, 0.84, 0.16], lumps: 0.85, hue: [0.02, 0.03], saturation: [0.16, 0.08], lightness: [0.42, 0.08], roughness: 0.75,
}, { restingHeight: 0.8, bounce: [0.3, 0.45] }));
defineThing('basalt', stone('Basalt', 'Dark and dense: sinks fastest', 3000, {
  pattern: 'basalt', squash: [0.62, 0.2, 0.8, 0.2], lumps: 0.9, hue: [0.6, 0.1], saturation: [0.02, 0.03], lightness: [0.1, 0.05], roughness: 0.85,
}));
defineThing('pumice', stone('Pumice', 'Full of bubbles: lighter than water, it floats', 650, {
  pattern: 'pumice', squash: [0.66, 0.22, 0.8, 0.2], lumps: 1.25, hue: [0.1, 0.03], saturation: [0.22, 0.1], lightness: [0.68, 0.08], roughness: 1.0,
}, { restingHeight: 0.8, bounce: [0.2, 0.35], friction: 0.7 }));

const ball = (name, note, size, material, look) => ({
  name, group: 'Balls', note,
  body: { shape: 'sphere', ...size },
  material,
  water: { restingHeight: 0.97 },
  look: { mesh: 'ball', ...look },
});
defineThing('golf', ball('Golf ball', '46 g; a little heavier than water: it sinks slowly', { size: { by: 'fixed', diameter: 0.04267, mass: 0.0459 } },
  { bounce: [0.75, 0.82], friction: 0.4, roll: 'solid', rolling: 0.05 }, { paint: 'golf', roughness: 0.35, reflection: 0.9 }));
defineThing('tennis', ball('Tennis ball', '58 g; a hollow shell: it floats', { size: { by: 'fixed', diameter: 0.067, mass: 0.058 } },
  { bounce: [0.72, 0.77], friction: 0.6, roll: 'shell', rolling: 0.04 }, { paint: 'tennis', roughness: 1.0, reflection: 0.5 }));
defineThing('bowling', ball('Bowling ball', '6 to 16 lb: 11 lb and lighter float', { diameter: 0.2159, size: { by: 'mass', unit: 'lb', min: 6, max: 16, step: 1, initial: 14 } },
  { bounce: [0.15, 0.25], friction: 0.3, roll: 'solid', rolling: 0.015 }, { paint: 'bowling', roughness: 0.14, reflection: 1.0 }));
defineThing('basketball', ball('Basketball', 'Sizes 5 to 7; it floats high', {
  size: { by: 'preset', unit: 'size', initial: 7, presets: [{ value: 5, label: '480 g', diameter: 0.222, mass: 0.48 }, { value: 6, label: '540 g', diameter: 0.23, mass: 0.54 }, { value: 7, label: '620 g', diameter: 0.239, mass: 0.62 }] },
}, { bounce: [0.83, 0.87], friction: 0.6, roll: 'shell', rolling: 0.02 }, { paint: 'basketball', roughness: 0.62, reflection: 0.8 }));

const gem = (name, note, density, look) => ({
  name, group: 'Gems', note,
  body: { shape: 'mesh', density, size: { by: 'mass', unit: 'ct', min: 5, max: 1000, step: 5, initial: 100 } },
  material: { bounce: [0.35, 0.5], friction: 0.4 },
  water: { restingHeight: 0.45 },
  look: { mesh: 'gem', ...look },
});
defineThing('diamond', gem('Diamond', 'Colourless, its facets flashing', 3510, { color: [232, 240, 255], stretch: 1, fire: 0.15, contrast: [0.15, 1.6], roughness: 0.03, reflection: 2.0 }));
defineThing('emerald', gem('Emerald', 'Deep green, in its oblong cut', 2760, { color: [18, 150, 80], stretch: 1.4, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }));
defineThing('ruby', gem('Ruby', 'Red corundum, an oval', 4000, { color: [190, 12, 45], stretch: 1.25, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }));
defineThing('sapphire', gem('Sapphire', 'Blue corundum, an oval', 4000, { color: [25, 55, 185], stretch: 1.25, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }));

defineThing('apple', {
  name: 'Apple', group: 'Other', note: 'A quarter of it is air: it floats, low', called: 'an apple',
  body: { shape: 'sphere', density: 815, size: { by: 'mass', unit: 'g', min: 100, max: 300, step: 10, initial: 180 } },
  material: { bounce: [0.25, 0.35], friction: 0.6, roll: 'solid', rolling: 0.06 },
  water: { restingHeight: 0.95 },
  look: { mesh: 'apple', roughness: 0.45, reflection: 1.0 },
});
defineThing('pizza', {
  name: 'Pizza', group: 'Other', note: 'A flat disc: it sails, and floats flat', called: 'a pizza',
  body: {
    shape: 'mesh',
    upright: true,
    soft: { cup: 0.0025, most: 0.12, flap: 0.05, rate: 3 },
    size: { by: 'preset', unit: 'size', initial: 2, presets: [{ value: 1, label: '20 cm', diameter: 0.2, mass: 0.11 }, { value: 2, label: '30 cm', diameter: 0.3, mass: 0.38 }, { value: 3, label: '40 cm', diameter: 0.4, mass: 0.9 }] },
  },
  material: { bounce: [0.05, 0.12], friction: 0.9 },
  air: { drag: 1.1, model: 'flutter' },
  water: { restingHeight: 0.06, dry: 0.88 },
  look: { mesh: 'pizza', roughness: 1.0, reflection: 0.6 },
});
defineThing('watermelon', {
  name: 'Watermelon', group: 'Other', note: 'Nearly as heavy as water: it floats, almost under', called: 'a watermelon',
  body: { shape: 'mesh', density: 960, size: { by: 'mass', unit: 'kg', min: 2, max: 10, step: 0.5, initial: 5 } },
  material: { bounce: [0.08, 0.15], friction: 0.6 },
  water: { restingHeight: 0.9 },
  look: { mesh: 'watermelon', roughness: 0.45, reflection: 0.9 },
});

defineThing('brick', {
  name: 'Brick', group: 'Other', note: '2.7 kg of fired clay: it sinks', called: 'a brick',
  body: { shape: 'mesh', size: { by: 'fixed', diameter: 0.215, mass: 2.7 } },
  material: { bounce: [0.1, 0.2], friction: 0.7 },
  air: { drag: 1.0 },
  water: { restingHeight: 0.3 },
  look: { mesh: 'brick', roughness: 0.95, reflection: 0.6 },
});
