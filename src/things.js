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
//       { by: 'preset', unit, presets: [{ value, label, diameter, mass, name }], initial }   (`name` what the size is called: "Size 7")
//       { by: 'fixed', diameter, mass }   (the slider off)
//     A sphere's density follows from its mass and diameter; a mesh's from
//     its mass and its mesh's own volume (src/rock.js), a pizza's being a disc;
//     one sized by its mass and density is as big as they make its mesh's own
//     volume (a cut gem). A thing sized by its diameter has a sphere's mass of
//     its density (`mass` in src/rock.js), as the river stone always has. Its
//     nominal radius is half its length, or, for a long thin thing (a
//     banana, a toy slide), its ball's of like volume: its splash is sized
//     by it, as by what it displaces, and its mesh says how long it is
//     (src/thingMeshes.js unitLength), which the strip shows.
//     `size.share`, a family's name, makes things share one slider value (the
//     stones' 'stones'); otherwise each thing keeps its own. A preset may
//     have a `look`, `water` and `air` of its own, and a `body` with only a
//     `ballast` (below), each laid over its definition's (its mesh's kind
//     stays its definition's): at that preset it is a thing of its own
//     (variantAt; defineThing), checked as one of that one size, made ready
//     and drawn as itself (src/rock.js prepareThing), so one slider can run
//     through things of different shapes (an iPad's steps, each device its
//     own proportions, from an iPhone to an iPad Pro; a bouquet's, each its
//     own count of roses).
//   - material: how it meets the pool's deck and other things (src/rock.js
//     meetGround, src/collide.js): `bounce`, the share of the speed it came
//     down at it leaves at (a range: a stone's lumps strike unevenly),
//     `friction` (Coulomb), `roll` ('solid', 'shell' or none: a ball keeps 5/7
//     or 3/5 of its speed along the ground once it rolls; a thing that does
//     not roll tumbles; a shell is hollow, and strikes ice softer, src/ice.js)
//     and `rolling`, its rolling resistance (on ice the lesser of its own and
//     the ice's); `rollsAbout`, a ball's own axis it rolls about on its side
//     (an apple's core: its own lumps and give then slow it, on ice too), and
//     `curve`, its path's curvature on its side times its radius (a cone
//     rolls round towards its narrow end, that axis's −: src/rock.js rollStep;
//     a mesh drawn each its own scales it by its geometry's
//     `userData.curveScale`).
//   - air: `drag`, its drag coefficient in flight (on the disc of its nominal
//     radius: 0.47 a ball's; a pizza, flat on, more), and its `model`:
//     `ballistic` (it tumbles as it flies) or `flutter` (a flat thing: a plate
//     in the air, turned by the air's push on its face and its spin, let go
//     flat with a little tilt, src/rock.js Rock.flutter); `spin`, [least,
//     most] rad/s, its own tumble where a stone's (5 to 30) is wrong for it
//     (a toy slide a metre long turns over a few times a second at most).
//   - body.upright: its own +y is its top (a pizza's toppings): which way up
//     it is let go, which way its rim keeps the water off afloat (the water
//     turns it as it will: upside down it stays so), the axis its buoyancy is
//     cut along, and the faces it settles onto on the deck (src/rock.js
//     restOn). body.ballast, its centre of mass off its volume's middle, in
//     radii of its own frame, at most LIMITS.ballast (a rubber duck's heavy
//     base, [0, -0.2, 0]; a rose's, far down its stem): the
//     water turns it about that, so a duck rights itself (a pie, [0, -0.06,
//     0], under the water); on the deck only one weighted as low as a duck
//     rolls onto its base (src/rock.js GROUND.rightsFrom).
//   - body.soft, a soft thing's give (a pizza's): a spring that the air cups
//     in flight, steadying it, and the water and the deck fling (src/rock.js
//     Rock.bendStep, drawn by Rock.flex); its `drape`, how far, afloat, it is
//     drawn lying over the waves rather than turned rigidly on them (all of
//     it once soaked through: src/rock.js rideTheWater).
//   - water: `restingHeight`, its centre over the bed at rest, in radii, and
//     `dry`, for a thing with a rim (a pizza's crust), the share of its radius
//     inside the rim that the water does not reach: it rides the water, so its
//     rim holds it out (src/waterSurface.js setDryDiscs); `soaks`, for a thing
//     that takes up water (bread), `takes`, the share of its volume of water
//     it holds soaked through, and `seconds`, how long it takes wholly under
//     to soak most of the way (src/rock.js soak: heavier, it floats lower and
//     soaks faster, and waterlogged past water's density it sinks; soft, it
//     goes limp; its rim no longer holds the water out); `thaws`, for a
//     frozen thing, the `seconds` it takes wholly under to thaw (in air some
//     fifteen times as long): until it has, it is rigid and frosted, and it
//     soaks only as far as it has thawed. `columns`, how many columns its
//     buoyancy is cut into across its widest (src/rock.js buoyancyColumns;
//     20 unless it says): a long thin thing needs more for enough across
//     its girth (a banana, 40), or, lying with its columns level, the
//     water's push on it comes in steps and it never settles; `columnsAlong`,
//     the axis they are cut along in its own frame (its own +y if it is kept
//     upright, else its short axis): a thing that may float lying any way up
//     needs one slanted to all its faces (a toy slide's, [1, 1, 1]), for the
//     same reason.
//   - A thing that flies as a plate (`air.model` 'flutter') meets the water
//     as one too (src/rock.js plateWaterStep): its wetting face carries a disc's
//     water and takes normal drag, its edge skin drag; the flow turns it.
//   - look: `mesh`, the kind of mesh it is drawn with (src/thingMeshes.js,
//     registerMesh), that kind's own parameters, and the material's
//     `roughness` and `reflection`; `wet`, how much `darker` and `glossier`
//     it looks wet (out of the water it dries, src/rock.js showWet; a stone
//     darkens most, a gem not at all); `thumbnail`, its card's picture;
//     `seenThrough`, clear (a shard of ice): afloat, what lies under it shows
//     through its top by its mesh's `clearShare`, and under the water it is
//     not drawn from above (src/rock.js).
//   - abilities: `skips` (Skip skips it: a stone, a pizza), `held` (a throw puts at
//     most THROW_WORK into it, so a heavy thing leaves slower; a stone keeps
//     its throw as it always was).
//   - body.meetsAtRim: two such things meet rim to rim (src/collide.js), as
//     discs in the level of their whole radii: flat pieces of ice afloat
//     side by side, which must not slide into each other; anything else
//     meets one as it meets any thing.
//   - edible: fish eat it (src/fish.js): once it has settled in the water they
//     come to it and bite, and after as many bites as its mass says
//     (edibleBites) it is gone (a frozen one only once thawed).
// Besides: `name`, `short` (the strip's name for it), `group` (the setting's
// heading), `note` (the card's line, one line on it: some 40 characters fit
// a phone's card whole, a longer one is cut short) and `called` (the throw button's
// "Throw …"; else the group's). `hidden`: it is never offered (thingGroups
// leaves it out, and the setting will not take it): a shard of ice, which
// only the ice makes (src/ice.js), as a thing so that it floats, bumps and
// rests as any thing does.
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
//   - the rest, under Food (the apple, the pizzas, the pie, the watermelon,
//     the banana, the bread, the cake), Toys (the duck, the slide),
//     Electronics (the TV, the iPhone, the iPad) and Other (the brick, the
//     snowball, the frying pan, the roses):
//     an apple (100 to 300 g at 815 kg/m³: a quarter of it is
//     air, so it floats, low), a pizza (20, 30 or 40 cm across, a disc with
//     its crust and cheese, each one thrown dressed with a recipe's toppings
//     drawn at random, 5 to 14% more weight; about 450 kg/m³, mostly airy
//     bread: a plate in the air, cupped by it as it flies, it slaps the water
//     and floats flat, draped over the waves, and soaks, sinking lower and
//     going limp until, waterlogged after two or three minutes, it sinks
//     flat to the bed; Skip skims it), a frozen pizza (the same, rigid,
//     lighter for its size, frosted: it tumbles more and floats higher, and
//     thaws afloat over several minutes, its frost going, before it goes
//     soft and soaks), a pie (12, 23 or 28 cm in its tin, thrown flat, filled
//     at random: apple, about 860 kg/m³, and pumpkin float low, cherry and
//     blueberry sink), a watermelon (2 to 10 kg at 960 kg/m³: it floats with
//     only a sliver of its back above the water), a banana (100 to 250 g,
//     about 920 kg/m³ whole: it floats with all but a sliver under, and
//     tumbles end over end in the air), a slice of bread (12 cm, 30 g, about
//     175 kg/m³: a floppier plate than a pizza, it floats nearly all out,
//     then soaks fast and, waterlogged in about two minutes, sinks), a
//     birthday cake (16, 22 or 28 cm, sponge under buttercream, about 460
//     kg/m³, with one to six candles drawn at random: it floats half out
//     and, waterlogged in two or three minutes, sinks), a rubber duck (5, 9
//     or 25 cm, hollow vinyl, 120 to 250 kg/m³: it bobs high, and its heavy
//     base rights it however it lands), a
//     brick (215 × 102.5 × 65 mm, 2.7 kg: about 1900 kg/m³, its density from
//     its mesh's volume; it sinks, and lands on the deck with a thud), a
//     flat-screen TV (54 × 32 × 1.8 cm, 3.6 kg) and an iPhone (15 × 7.2 ×
//     0.8 cm, 180 g, its home screen painted on its glass and its camera
//     standing out of its back), rigid rectangular plates with their screens
//     on +y (they slap the water, sink and settle on a broad face), a snowball (5
//     to 15 cm, packed snow at 450 kg/m³: it floats half out, then soaks to
//     slush in under half a minute and floats on, nine tenths under) and a
//     toddler's toy slide (99 × 46 × 70 cm, 4.1 kg, hollow plastic: about
//     104 kg/m³, it floats nine tenths out), an iPad (its slider's steps
//     each a device of its own: an iPhone, an iPad mini, an iPad and a
//     13-inch iPad Pro, each its maker's size and weight, 1500 to
//     2100 kg/m³: plates that sink, each but the iPhone its home screen
//     painted on its glass), a cast-iron frying pan (20, 25 or 30 cm, 1.5 to
//     3.4 kg, iron's 7150 kg/m³: a plate that sinks broadside) and red roses
//     (one, or 3, 6, 12 or 24 tied, blooms of layered petals: about 30 g a
//     rose, 300 to 350 kg/m³, floating by their blooms' hulls as a raft,
//     blooms up);
//   - a shard of ice (hidden: src/ice.js breaks each one, its own outline,
//     src/thingMeshes.js createShardGeometry): 917 kg/m³, a plate in the
//     water as a pizza is, so it comes up and floats flat, its top a little
//     out, as the sheet does.
//
// One material serves them all (src/rock.js): what tells them apart is in
// the geometry, the vertex colours and the material's colour, roughness and
// reflection, which are uniforms, and a stone's grain (src/shaders/stone.js:
// its kind and seed, uniforms too, no kind for anything else), so no thing
// compiles a program of its own (src/main.js warmUp).
import { meshKind, unitVolume, unitLength } from './thingMeshes.js';
import { withRandom } from './withRandom.js';

export const WATER_DENSITY = 1000;
export const STONE_DENSITY = 2600;   // a river stone's: the splash and the cavity were fitted to it (tools/basilisk)
const THROW_WORK = 120;              // J: the most a throw puts into a held thing (one arm, from the shore), so it leaves at most sqrt(2W/m)
const MASS_UNITS = { g: 0.001, kg: 1, lb: 0.45359237, ct: 0.0002 };   // kg per unit
const ROLLS = { solid: 5 / 7, shell: 3 / 5 };   // the share of its speed along the ground a ball keeps once it rolls
const BODY_SHAPES = ['sphere', 'mesh'];         // the bodies src/rock.js knows
const AIR_MODELS = ['ballistic', 'flutter'];    // the flights src/rock.js knows (Rock.fly)
const CALLED = { Stones: 'a rock', Balls: 'a ball', Gems: 'a gem' };
const LAST_GROUPS = ['Gems', 'Other'];           // listed after every other group (thingGroups), whenever defined: a gem, seldom thrown, and last what fits no group
const PRESET_OWN = ['look', 'water', 'air', 'body'];   // what a size preset may have of its own (the header's `size.presets`; of its body only its ballast)
const DEFAULTS = { air: { drag: 0.47, model: 'ballistic' }, look: { roughness: 0.92, reflection: 0.9, wet: { darker: 0.15, glossier: 0.4 } }, abilities: { skips: false, held: true } };

export const THINGS = {};
export const THING_NAMES = [];
export const DEFAULT_THING = 'stone';
const listeners = new Set();

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const within = (value, [least, most]) => isNumber(value) && value >= least && value <= most;
// The bounds a definition's numbers must keep (validateThing), and that it must keep at every size (defineThing).
const LIMITS = {
  density: [50, 25000],     // kg/m³: lighter than balsa's half, heavier than gold
  diameter: [0.005, 2],     // m across
  mass: [0.0001, 100],      // kg
  centimetres: [0.5, 200],  // a slider sized by its diameter
  bounce: [0, 1], friction: [0, 5], rolling: [0, 1], drag: [0.01, 10],
  spin: 100,                   // rad/s: the most a thing's own tumble (air.spin) may be
  columns: [8, 60],            // its buoyancy's columns across its widest (water.columns)
  restingHeight: [0.001, 2],   // its centre over the bed at rest, in radii
  ballast: 4,                  // radii: the farthest its weight may be from its volume's middle (body.ballast; a long-stemmed rose's is far down its stem in its small radii)
  text: 120,                   // characters in a name, group or note
};

/**
 * What is wrong with a definition (the header), as sentences; none for a
 * good one. It reads anything at all, as JSON might bring it, without
 * failing: a field of the wrong kind is a problem, never an error.
 */
export function validateThing(key, definition) {
  try {
    return definitionProblems(key, definition);
  } catch (error) {
    return [`it could not be read (${error.message})`];
  }
}

function definitionProblems(key, definition) {
  const problems = [];
  const need = (condition, problem) => { if (!condition) problems.push(problem); };
  need(typeof key === 'string' && /^[a-z][a-z0-9-]*$/.test(key) && key.length <= 40, `its key "${String(key).slice(0, 40)}" must be lower case letters, digits and dashes`);
  if (!isObject(definition)) return [...problems, 'it is not an object'];
  for (const field of ['name', 'group', 'note']) need(typeof definition[field] === 'string' && definition[field].length > 0 && definition[field].length <= LIMITS.text, `it needs a ${field} of 1 to ${LIMITS.text} characters`);
  // A group is a tab of the dropdown of things (src/thingMenu.js), beside its own Favourites.
  need(typeof definition.group !== 'string' || definition.group.toLowerCase() !== 'favourites', 'its group cannot be called Favourites: the dropdown of things has its own tab of that name');
  for (const field of ['short', 'called']) need(definition[field] === undefined || (typeof definition[field] === 'string' && definition[field].length > 0 && definition[field].length <= LIMITS.text), `${field} must be text of 1 to ${LIMITS.text} characters`);
  for (const part of ['body', 'material', 'water', 'look']) need(isObject(definition[part]), `it needs a ${part}, an object`);
  for (const part of ['air', 'abilities']) need(definition[part] === undefined || isObject(definition[part]), `${part} must be an object`);
  if (problems.length > 0) return problems;
  const { body, material, water, look } = definition;
  const air = definition.air ?? {}, abilities = definition.abilities ?? {};

  need(BODY_SHAPES.includes(body.shape), `body.shape must be one of ${BODY_SHAPES.join(', ')}`);
  need(body.density === undefined || within(body.density, LIMITS.density), `body.density must be ${LIMITS.density.join(' to ')} kg/m³`);
  need(body.diameter === undefined || within(body.diameter, LIMITS.diameter), `body.diameter must be ${LIMITS.diameter.join(' to ')} m`);
  need(body.upright === undefined || typeof body.upright === 'boolean', 'body.upright must be true or false');
  need(body.ballast === undefined || (Array.isArray(body.ballast) && body.ballast.length === 3 && body.ballast.every((value) => within(value, [-LIMITS.ballast, LIMITS.ballast]))), `body.ballast must be three numbers from -${LIMITS.ballast} to ${LIMITS.ballast} (radii)`);
  const soft = body.soft;
  need(soft === undefined || (isObject(soft) && ['cup', 'most', 'flap', 'rate'].every((field) => within(soft[field], [0, 10])) && (soft.drape === undefined || within(soft.drape, [0, 1]))), 'body.soft needs cup, most, flap and rate, each 0 to 10 (and a drape, if any, 0 to 1)');
  const size = body.size;
  if (!isObject(size) || !['diameter', 'mass', 'preset', 'fixed'].includes(size.by)) {
    problems.push('body.size must be an object whose `by` is diameter, mass, preset or fixed');
  } else {
    need(size.share === undefined || (typeof size.share === 'string' && size.share.length > 0 && size.share.length <= 40), 'body.size.share must be a family\'s name');
    if (size.by === 'diameter' || size.by === 'mass') {
      need(isNumber(size.min) && isNumber(size.max) && isNumber(size.step) && size.min > 0 && size.max > size.min && size.step > 0 && (size.max - size.min) / size.step <= 10000, 'body.size needs min < max and a step, all above 0 (at most 10000 steps)');
      need(isNumber(size.initial) && size.initial >= size.min && size.initial <= size.max, 'body.size.initial must lie between its min and max');
    }
    if (size.by === 'diameter') {
      need(size.unit === 'cm' && within(body.density, LIMITS.density), 'a thing sized by its diameter needs unit cm and a body.density');
      need(!isNumber(size.min) || !isNumber(size.max) || (within(size.min, LIMITS.centimetres) && within(size.max, LIMITS.centimetres)), `its diameters must be ${LIMITS.centimetres.join(' to ')} cm`);
    }
    if (size.by === 'mass') {
      need(Object.hasOwn(MASS_UNITS, size.unit), `body.size.unit must be one of ${Object.keys(MASS_UNITS).join(', ')}`);
      need(within(body.diameter, LIMITS.diameter) || within(body.density, LIMITS.density), 'a thing sized by its mass needs a body.diameter or a body.density');
      need(isNumber(body.diameter) || body.shape !== 'mesh' || Boolean(meshKind(look.mesh)?.volume), `a mesh sized by its mass and density needs a mesh of known volume (look.mesh "${look.mesh}" has none)`);
    }
    if (size.by === 'preset') {
      const presets = size.presets;
      need(Array.isArray(presets) && presets.length > 0 && presets.length <= 20 && presets.every((preset, index) => isObject(preset) && isNumber(preset.value) && within(preset.diameter, LIMITS.diameter) && within(preset.mass, LIMITS.mass) && typeof preset.label === 'string' && preset.label.length <= 40 && (preset.name === undefined || (typeof preset.name === 'string' && preset.name.length <= 40)) && (index === 0 || preset.value === presets[index - 1].value + 1)),
        'body.size.presets must be a list of 1 to 20 { value, label, diameter, mass, name? }, their values counting up by 1');
      need(Array.isArray(presets) && presets.some((preset) => isObject(preset) && preset.value === size.initial), 'body.size.initial must be one of its presets\' values');
      // A preset's own look, water, air and ballast (PRESET_OWN), each over its definition's: its mesh's kind stays its definition's.
      need(!Array.isArray(presets) || presets.every((preset) => !isObject(preset) || PRESET_OWN.every((part) => preset[part] === undefined || isObject(preset[part]))), `a preset's ${PRESET_OWN.join(', ')} must each be an object`);
      need(!Array.isArray(presets) || presets.every((preset) => !isObject(preset?.look) || preset.look.mesh === undefined || preset.look.mesh === definition.look?.mesh), 'a preset\'s look keeps its definition\'s look.mesh');
      need(!Array.isArray(presets) || presets.every((preset) => !isObject(preset?.body) || Object.keys(preset.body).every((field) => field === 'ballast')), 'a preset\'s body may have only its own ballast');
    }
    if (size.by === 'fixed') need(within(size.diameter, LIMITS.diameter) && within(size.mass, LIMITS.mass), `a thing of one size needs body.size.diameter (${LIMITS.diameter.join(' to ')} m) and body.size.mass (${LIMITS.mass.join(' to ')} kg)`);
  }

  const bounce = material.bounce;
  need(Array.isArray(bounce) && bounce.length === 2 && bounce.every(isNumber) && bounce[0] >= 0 && bounce[0] <= bounce[1] && bounce[1] <= 1, 'material.bounce must be [least, most] within 0 to 1');
  need(within(material.friction, LIMITS.friction), `material.friction must be ${LIMITS.friction.join(' to ')}`);
  need(material.roll === undefined || material.roll === null || (typeof material.roll === 'string' && Object.hasOwn(ROLLS, material.roll)), 'material.roll must be solid, shell or none');
  need(!material.roll || within(material.rolling, LIMITS.rolling), 'a thing that rolls needs material.rolling, 0 to 1');
  need(material.rollsAbout === undefined || (material.roll && body.shape === 'sphere' && Array.isArray(material.rollsAbout) && material.rollsAbout.length === 3 && material.rollsAbout.every(isNumber) && Math.abs(Math.hypot(...material.rollsAbout) - 1) < 1e-6), 'material.rollsAbout must be a unit [x, y, z] of a sphere that rolls');
  need(material.curve === undefined || (material.rollsAbout && within(material.curve, [0, 0.5])), 'material.curve needs material.rollsAbout, and is 0 to 0.5');
  need(air.drag === undefined || within(air.drag, LIMITS.drag), `air.drag must be ${LIMITS.drag.join(' to ')}`);
  need(air.model === undefined || AIR_MODELS.includes(air.model), `air.model must be one of ${AIR_MODELS.join(', ')}`);
  need(air.spin === undefined || (Array.isArray(air.spin) && air.spin.length === 2 && air.spin.every(isNumber) && air.spin[0] >= 0 && air.spin[0] <= air.spin[1] && air.spin[1] <= LIMITS.spin), `air.spin must be [least, most] within 0 to ${LIMITS.spin} rad/s`);
  need(within(water.restingHeight, LIMITS.restingHeight), `water.restingHeight must be ${LIMITS.restingHeight.join(' to ')} radii`);
  need(water.dry === undefined || (isNumber(water.dry) && water.dry > 0 && water.dry < 1), 'water.dry must lie between 0 and 1');
  need(water.soaks === undefined || (isObject(water.soaks) && within(water.soaks.seconds, [1, 100000]) && within(water.soaks.takes, [0, 2])), 'water.soaks needs seconds (1 to 100000) and takes (0 to 2, of its volume)');
  need(water.thaws === undefined || (isObject(water.thaws) && within(water.thaws.seconds, [1, 100000])), 'water.thaws needs seconds (1 to 100000)');
  need(water.columns === undefined || (Number.isInteger(water.columns) && within(water.columns, LIMITS.columns)), `water.columns must be a whole number from ${LIMITS.columns.join(' to ')}`);
  need(water.columnsAlong === undefined || (Array.isArray(water.columnsAlong) && water.columnsAlong.length === 3 && water.columnsAlong.every((value) => within(value, [-1, 1])) && Math.hypot(...water.columnsAlong) > 0.1), 'water.columnsAlong must be three numbers from -1 to 1, not all near 0');
  for (const ability of ['skips', 'held']) need(abilities[ability] === undefined || typeof abilities[ability] === 'boolean', `abilities.${ability} must be true or false`);
  need(definition.hidden === undefined || typeof definition.hidden === 'boolean', 'hidden must be true or false');
  need(definition.edible === undefined || typeof definition.edible === 'boolean', 'edible must be true or false');
  need(body.meetsAtRim === undefined || typeof body.meetsAtRim === 'boolean', 'body.meetsAtRim must be true or false');
  const mesh = typeof look.mesh === 'string' ? meshKind(look.mesh) : undefined;
  need(mesh, `look.mesh "${String(look.mesh)}" is no registered mesh (src/thingMeshes.js)`);
  for (const field of ['roughness', 'reflection']) need(look[field] === undefined || within(look[field], [0, 4]), `look.${field} must be 0 to 4`);
  need(look.thumbnail === undefined || typeof look.thumbnail === 'string', 'look.thumbnail must be a path');
  need(look.wet === undefined || (isObject(look.wet) && within(look.wet.darker, [0, 1]) && within(look.wet.glossier, [0, 1])), 'look.wet needs darker and glossier, each 0 to 1');
  need(look.seenThrough === undefined || typeof look.seenThrough === 'boolean', 'look.seenThrough must be true or false');
  // The mesh's own fields (src/thingMeshes.js registerMesh `check`).
  if (mesh?.check) problems.push(...mesh.check(look));
  // Each preset with parts of its own is checked as the thing it makes (presetDefinition), of its one size.
  if (problems.length === 0 && size.by === 'preset') {
    for (const preset of size.presets.filter(hasOwnParts)) {
      for (const problem of definitionProblems(key, presetDefinition(definition, preset))) problems.push(`its preset ${preset.value} (${preset.name ?? preset.label}): ${problem}`);
    }
  }
  return problems;
}

/** Whether a preset has parts of its own (PRESET_OWN: its look, water, air or ballast), so it is a thing of its own (presetDefinition). */
const hasOwnParts = (preset) => PRESET_OWN.some((part) => preset[part] !== undefined);

/**
 * The definition a preset with parts of its own makes (the header's
 * `size.presets`): its definition with the preset's look, water, air and
 * ballast laid over its own, of the preset's one size.
 */
function presetDefinition(definition, preset) {
  const own = Object.fromEntries(PRESET_OWN.map((part) => [part, { ...definition[part], ...preset[part] }]));
  return { ...definition, ...own, body: { ...own.body, size: { by: 'fixed', diameter: preset.diameter, mass: preset.mass } } };
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
        // As big as its density makes it: a sphere's volume, or its mesh's own (a cut gem's), so mass, density and the
        // volume it displaces and meets things with agree (src/rock.js reads the mesh's volume to the same number).
        const volume = body.shape === 'mesh' ? unitVolume(definition) : (4 / 3) * Math.PI;
        return { radius: Math.cbrt(mass / (body.density * volume)), mass, density: body.density };
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
  switch (size.by) {
    case 'diameter': return (value) => `${value % 1 === 0 ? value : value.toFixed(1)} cm`;
    case 'mass': return (value) => `${value} ${size.unit}`;
    case 'preset': return (value) => (size.presets.find((preset) => preset.value === Math.round(value)) ?? size.presets[0]).label;
    default: return () => grams(size.mass);
  }
}

/** Metres or kilograms as the strip writes them: "6.7 cm", "620 g", "5.0 kg". */
const centimetres = (metres) => { const tenths = Math.round(1000 * metres); return `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)} cm`; };
const grams = (mass) => (mass < 1 ? `${Math.round(mass * 1000)} g` : `${mass.toFixed(1)} kg`);

/**
 * What a definition is at its slider's `value`, as the picker and the strip
 * show it and the physics has it (src/rock.js reads the same mass and
 * volume): its diameter and mass (m, kg), its true density (a mesh's mass
 * over its mesh's own volume, a fixed mesh's or a cut gem's; else its
 * definition's, or a sphere's), whether it floats (`floats`, plain;
 * `alwaysFloats`, however it is dressed), and `text`, the strip's
 * line: what sets its size, then the other of its size and mass ("Size 7 ·
 * 620 g", "14 lb · 21.6 cm", "6.7 cm · 58 g").
 */
function propertiesFor(definition, measure, readout) {
  const size = definition.body.size;
  return (value) => {
    const { radius, mass } = measure(value);
    const volume = definition.body.shape === 'mesh' ? unitVolume(definition) : null;
    const density = definition.body.density ?? (volume ? mass / (volume * radius ** 3) : mass / ((4 / 3) * Math.PI * radius ** 3));
    const preset = size.by === 'preset' ? size.presets.find((candidate) => candidate.value === Math.round(value)) ?? size.presets[0] : null;
    // Its size as its length: its diameter, or, where its mesh says its nominal radius is not half its length (a
    // banana's is its ball's of like volume), its mesh's own length (src/thingMeshes.js unitLength).
    const length = unitLength(definition) * radius;
    const text = size.by === 'fixed' ? `${centimetres(length)} · ${grams(mass)}`
      : preset?.name ? `${preset.name} · ${preset.label}`
        : size.by === 'mass' ? `${readout(value)} · ${centimetres(length)}`
          : `${readout(value)} · ${grams(mass)}`;
    // Dressed as it is thrown (src/thingMeshes.js registerMesh `heaviest`: a pie's filling), it may sink though it floats plain.
    const heaviest = meshKind(definition.look.mesh)?.heaviest ?? 0;
    return { diameter: 2 * radius, mass, density, floats: density < WATER_DENSITY, alwaysFloats: density * (1 + heaviest) < WATER_DENSITY, text };
  };
}

/**
 * Register a thing under `key` (the header): checked (it throws, listing
 * what is wrong), its defaults filled in and what the rest reads derived:
 * `slider` (the strip's range in its unit, or null), `measure(value)`,
 * `readout(value)`, `properties(value)` (propertiesFor: the picker's and
 * the strip's), `fastest(value)` (m/s; `fastestFor(mass)`, for one of
 * that mass: a pie with its filling), `called`, the material's `roll`
 * as a share, and `sphere`, `byDiameter`, `sizeShare`, `skips`;
 * `variantAt(value)`, what is thrown at a slider value (a preset with a look
 * of its own makes a thing of its own; else the thing itself), and
 * `variants`, the thing and each of those (each made ready: src/rock.js
 * prepareThing). A key already defined is replaced. Returns the thing.
 *
 * It is all or nothing: the definition is copied as plain data (so it is
 * the registry's, whatever its maker does with theirs after), checked, then
 * tried before it is registered: measured at its slider's least, first and
 * most (each within LIMITS) and, unless `trial` is false (the things below,
 * which tools/thing-probe.mjs throws), its mesh built once (each variant's
 * too). One that fails any of it is not registered, and the error says why.
 */
export function defineThing(key, definition, { trial = true } = {}) {
  let plain;
  try { plain = withoutUndefined(structuredClone(definition)); } catch { throw new Error(`The thing "${key}" cannot be defined: it must be plain data (no functions or classes).`); }
  const problems = validateThing(key, plain);
  if (problems.length > 0) throw new Error(`The thing "${key}" cannot be defined: ${problems.join('; ')}.`);
  definition = plain;
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
    hollow: definition.material.roll === 'shell',   // a ball whose roll is a shell's is hollow (src/ice.js spreads its blow)
    sphere: definition.body.shape === 'sphere',
    byDiameter: size.by === 'diameter',
    sizeShare: size.share ?? null,
    slider: size.by === 'fixed' ? null
      : size.by === 'preset' ? { min: size.presets[0].value, max: size.presets.at(-1).value, step: 1, initial: size.initial, unit: size.unit }
        : { min: size.min, max: size.max, step: size.step, initial: size.initial, unit: size.unit },
    measure: measureFor(definition),
    readout: readoutFor(definition),
  };
  thing.skips = thing.abilities.skips;
  // The fastest a throw sends it: a held thing no faster than THROW_WORK lets it go; a stone as it always was.
  thing.fastestFor = (mass) => (thing.abilities.held ? Math.sqrt((2 * THROW_WORK) / mass) : Infinity);
  thing.fastest = (value) => thing.fastestFor(thing.measure(value ?? thing.slider?.initial).mass);
  // A preset with parts of its own (the header's `size.presets`) is a thing of its own, the same in all but its look,
  // water, air and ballast: what is thrown at that preset (variantAt), made ready and drawn as itself (src/rock.js
  // prepareThing). Every variant answers variantAt and properties alike, as its thing does.
  const variants = new Map();
  if (size.by === 'preset') {
    for (const preset of size.presets.filter(hasOwnParts)) {
      variants.set(preset.value, { ...thing, look: { ...thing.look, ...preset.look }, water: { ...thing.water, ...preset.water }, air: { ...thing.air, ...preset.air }, body: { ...thing.body, ...preset.body }, preset: preset.value });
    }
  }
  thing.variantAt = (value) => variants.get(Math.round(value ?? thing.slider?.initial)) ?? thing;
  thing.variants = [thing, ...variants.values()];
  // Each one's strip line its own (a variant's length and volume its own mesh's); the thing's from its plain definition,
  // whose mesh's volume its measure has measured already (unitVolume).
  const ownProperties = new Map(thing.variants.map((variant) => [variant, propertiesFor(variant === thing ? definition : variant, thing.measure, thing.readout)]));
  thing.properties = (value) => ownProperties.get(thing.variantAt(value))(value);
  for (const variant of variants.values()) Object.assign(variant, { variantAt: thing.variantAt, variants: thing.variants, properties: thing.properties });
  const failed = tryThing(thing, trial);
  if (failed) throw new Error(`The thing "${key}" cannot be defined: ${failed}.`);
  THINGS[key] = thing;
  if (!THING_NAMES.includes(key)) THING_NAMES.push(key);
  for (const listener of listeners) listener(key);
  return thing;
}

/** `value` with its fields left undefined taken out (as JSON has them), so a field given as undefined takes its default. */
function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, withoutUndefined(entry)]));
}

/** What goes wrong with a thing made as defineThing makes it (its sizes, and with `build` its mesh), or null. */
function tryThing(thing, build) {
  try {
    const values = thing.slider ? [thing.slider.min, thing.slider.initial, thing.slider.max] : [undefined];
    for (const value of values) {
      const { radius, mass } = thing.measure(value);
      if (!within(2 * radius, LIMITS.diameter) || !within(mass, LIMITS.mass)) {
        return `at ${value ?? 'its size'} it would be ${isNumber(radius) ? `${(200 * radius).toFixed(1)} cm` : 'no size'} across and weigh ${isNumber(mass) ? `${mass.toPrecision(3)} kg` : 'nothing'} (it must be ${LIMITS.diameter.join(' to ')} m and ${LIMITS.mass.join(' to ')} kg)`;
      }
    }
    if (build) {
      // Built once (each preset with a look of its own too: variantAt), its random draws (a stone's lumps) from a still
      // stream, so that a seeded throw after it is unchanged.
      const mesh = meshKind(thing.look.mesh);
      for (const variant of thing.variants) {
        const count = withRandom(() => 0.5, () => {
          const geometry = mesh.build(variant, {});
          mesh.color(variant);
          const corners = geometry?.attributes?.position?.count ?? 0;
          geometry?.dispose?.();
          return corners;
        });
        if (count === 0) return `its mesh${variant === thing ? '' : ` at its preset ${variant.preset}`} is empty`;
      }
    }
    return null;
  } catch (error) {
    return `it fails as it is made (${error.message})`;
  }
}

/** Call `listener(key)` whenever a thing is defined (the page rebuilds its cards). Returns the way to stop. */
export function onThingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The groups, in the order their first things were defined but LAST_GROUPS's at the end, each with its things' keys:
 * what is offered, the hidden left out.
 */
export function thingGroups() {
  const groups = new Map();
  for (const key of THING_NAMES) {
    if (THINGS[key].hidden) continue;
    const group = THINGS[key].group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(key);
  }
  const lastRank = (name) => LAST_GROUPS.indexOf(name);   // -1, before any of them, for every other group
  return [...groups].sort(([first], [second]) => lastRank(first) - lastRank(second)).map(([name, keys]) => ({ name, keys }));
}

// ---- the things ------------------------------------------------------------

// Each tried by tools/thing-probe.mjs, which throws them all; its mesh is not built as it is defined (defineThing `trial`).
const defineBuiltIn = (key, definition) => defineThing(key, definition, { trial: false });

const stone = (name, note, density, look, { short = name, restingHeight = 0.75, bounce = [0.25, 0.45], friction = 0.6 } = {}) => ({
  name, short, group: 'Stones', note,
  body: { shape: 'mesh', density, size: { by: 'diameter', unit: 'cm', min: 1.5, max: 30, step: 0.5, initial: 6, share: 'stones' } },
  material: { bounce, friction },
  water: { restingHeight },
  look: { mesh: 'stone', wet: { darker: 0.35, glossier: 0.5 }, ...look },
  abilities: { skips: true, held: false },
});
defineBuiltIn('stone', stone('River stone', 'Worn smooth; 2.6 times as heavy as water', 2600, { pattern: 'river' }, { short: 'Rock' }));
defineBuiltIn('slate', stone('Slate', 'A flat slab, blue-grey, in layers', 2750, {
  pattern: 'slate', squash: [0.22, 0.1, 0.55, 0.2], lumps: 0.45, hue: [0.57, 0.04], saturation: [0.03, 0.04], lightness: [0.26, 0.08], roughness: 0.8,
}, { restingHeight: 0.35, bounce: [0.2, 0.35] }));
defineBuiltIn('granite', stone('Granite', 'Pale and flecked; a little heavier', 2700, {
  pattern: 'granite', squash: [0.7, 0.18, 0.84, 0.16], lumps: 0.85, hue: [0.02, 0.03], saturation: [0.16, 0.08], lightness: [0.42, 0.08], roughness: 0.75,
}, { restingHeight: 0.8, bounce: [0.3, 0.45] }));
defineBuiltIn('basalt', stone('Basalt', 'Dark and dense: sinks fastest', 3000, {
  pattern: 'basalt', squash: [0.62, 0.2, 0.8, 0.2], lumps: 0.9, hue: [0.6, 0.1], saturation: [0.02, 0.03], lightness: [0.1, 0.05], roughness: 0.85,
}));
defineBuiltIn('pumice', stone('Pumice', 'Full of bubbles: it floats', 650, {
  pattern: 'pumice', squash: [0.66, 0.22, 0.8, 0.2], lumps: 1.25, hue: [0.1, 0.03], saturation: [0.22, 0.1], lightness: [0.68, 0.08], roughness: 1.0,
}, { restingHeight: 0.8, bounce: [0.2, 0.35], friction: 0.7 }));

const ball = (name, note, size, material, look) => ({
  name, group: 'Balls', note,
  body: { shape: 'sphere', ...size },
  material,
  water: { restingHeight: 0.97 },
  look: { mesh: 'ball', ...look },
});
defineBuiltIn('golf', ball('Golf ball', '46 g; just heavier than water: it sinks', { size: { by: 'fixed', diameter: 0.04267, mass: 0.0459 } },
  { bounce: [0.75, 0.82], friction: 0.4, roll: 'solid', rolling: 0.05 }, { paint: 'golf', roughness: 0.35, reflection: 0.9 }));
defineBuiltIn('tennis', ball('Tennis ball', '58 g; a hollow shell: it floats', { size: { by: 'fixed', diameter: 0.067, mass: 0.058 } },
  { bounce: [0.72, 0.77], friction: 0.6, roll: 'shell', rolling: 0.04 }, { paint: 'tennis', roughness: 1.0, reflection: 0.5 }));
defineBuiltIn('bowling', ball('Bowling ball', '6 to 16 lb: 11 lb and lighter float', { diameter: 0.2159, size: { by: 'mass', unit: 'lb', min: 6, max: 16, step: 1, initial: 14 } },
  { bounce: [0.15, 0.25], friction: 0.3, roll: 'solid', rolling: 0.015 }, { paint: 'bowling', roughness: 0.14, reflection: 1.0 }));
defineBuiltIn('basketball', ball('Basketball', 'Sizes 5 to 7; it floats high', {
  size: { by: 'preset', unit: 'size', initial: 7, presets: [{ value: 5, name: 'Size 5', label: '480 g', diameter: 0.222, mass: 0.48 }, { value: 6, name: 'Size 6', label: '540 g', diameter: 0.23, mass: 0.54 }, { value: 7, name: 'Size 7', label: '620 g', diameter: 0.239, mass: 0.62 }] },
}, { bounce: [0.83, 0.87], friction: 0.6, roll: 'shell', rolling: 0.02 }, { paint: 'basketball', roughness: 0.62, reflection: 0.8 }));

const gem = (name, note, density, look) => ({
  name, group: 'Gems', note,
  body: { shape: 'mesh', density, size: { by: 'mass', unit: 'ct', min: 5, max: 1000, step: 5, initial: 100 } },
  material: { bounce: [0.35, 0.5], friction: 0.4 },
  water: { restingHeight: 0.45 },
  look: { mesh: 'gem', wet: { darker: 0, glossier: 0 }, ...look },
});
defineBuiltIn('diamond', gem('Diamond', 'Colourless, its facets flashing', 3510, { color: [232, 240, 255], stretch: 1, fire: 0.15, contrast: [0.15, 1.6], roughness: 0.03, reflection: 2.0 }));
defineBuiltIn('emerald', gem('Emerald', 'Deep green, in its oblong cut', 2760, { color: [18, 150, 80], stretch: 1.4, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }));
defineBuiltIn('ruby', gem('Ruby', 'Red corundum, an oval', 4000, { color: [190, 12, 45], stretch: 1.25, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }));
defineBuiltIn('sapphire', gem('Sapphire', 'Blue corundum, an oval', 4000, { color: [25, 55, 185], stretch: 1.25, contrast: [0.5, 1.0], roughness: 0.06, reflection: 1.5 }));

defineBuiltIn('apple', {
  name: 'Apple', group: 'Food', note: 'A quarter of it is air: it floats, low', called: 'an apple', edible: true,
  body: { shape: 'sphere', density: 815, size: { by: 'mass', unit: 'g', min: 100, max: 300, step: 10, initial: 180 } },
  // Lumpy and soft, it rolls on its side about its core, wider at its shoulder than its calyx (src/thingMeshes.js
  // createAppleGeometry: each apple's own shoulder, 0.02 to 0.08): a cone, its path veering towards its calyx, though by a
  // sixth of what so slight a cone rolling true would (its dimples and lumps keep it off its girth). `curve` is the middle
  // shoulder's (0.05), each apple's scaled by its own (its geometry's curveScale, 0.4 to 1.6); its own give and lumps slow
  // it, on ice as on the deck.
  material: { bounce: [0.25, 0.35], friction: 0.6, roll: 'solid', rolling: 0.15, rollsAbout: [0, 1, 0], curve: 0.008 },
  water: { restingHeight: 0.95 },
  look: { mesh: 'apple', roughness: 0.45, reflection: 1.0 },
});
// A pizza's give (body.soft): the air cups it and flaps it; afloat it drapes over the waves, wholly once soaked.
const PIZZA_GIVE = { cup: 0.0025, most: 0.12, flap: 0.05, rate: 3, drape: 0.7 };
defineBuiltIn('pizza', {
  name: 'Pizza', group: 'Food', note: 'Random toppings: it sails, skims, soaks', called: 'a pizza', edible: true,
  body: {
    shape: 'mesh',
    upright: true,
    soft: PIZZA_GIVE,
    size: { by: 'preset', unit: 'size', initial: 2, presets: [{ value: 1, label: '20 cm', diameter: 0.2, mass: 0.11 }, { value: 2, label: '30 cm', diameter: 0.3, mass: 0.38 }, { value: 3, label: '40 cm', diameter: 0.4, mass: 0.9 }] },
  },
  material: { bounce: [0.05, 0.12], friction: 0.9 },
  air: { drag: 1.1, model: 'flutter' },
  // Soaked through it holds more water than its air's room: waterlogged, it sinks, in two or three minutes afloat.
  water: { restingHeight: 0.06, dry: 0.88, soaks: { seconds: 60, takes: 0.62 } },
  look: { mesh: 'pizza', roughness: 1.0, reflection: 0.6, wet: { darker: 0.3, glossier: 0.5 } },
  abilities: { skips: true },   // flat and spinning, it skims (src/rock.js skim), as a stone does
});
defineBuiltIn('frozen-pizza', {
  name: 'Frozen pizza', short: 'Frozen', group: 'Food', note: 'Rigid and frosted: it thaws, then soaks', called: 'a frozen pizza', edible: true,
  body: {
    shape: 'mesh',
    upright: true,
    soft: PIZZA_GIVE,   // once thawed (water.thaws): frozen, it is rigid
    size: { by: 'preset', unit: 'size', initial: 2, presets: [{ value: 1, label: '20 cm', diameter: 0.2, mass: 0.09 }, { value: 2, label: '30 cm', diameter: 0.3, mass: 0.3 }, { value: 3, label: '40 cm', diameter: 0.4, mass: 0.72 }] },
  },
  material: { bounce: [0.15, 0.25], friction: 0.5 },
  air: { drag: 1.1, model: 'flutter' },
  // Frozen through, it thaws in two and a half minutes wholly under (afloat, a third under, in seven or so), and only
  // as it thaws does it go soft and take up water, as a fresh one does.
  water: { restingHeight: 0.06, dry: 0.88, thaws: { seconds: 150 }, soaks: { seconds: 60, takes: 0.72 } },
  look: { mesh: 'pizza', tint: [225, 232, 242], frost: 0.22, roughness: 0.5, reflection: 1.2, wet: { darker: 0.1, glossier: 0.3 } },
  abilities: { skips: true },   // flat and spinning, it skims (src/rock.js skim), as a stone does
});
// A fruit pie in its tin, thrown flat (a plate in the air, as a pizza is), its filling drawn at random as it is thrown
// (src/thingMeshes.js pieFilling): an apple pie (its sizes' masses) about 860 kg/m³ floats low, a pumpkin one lower,
// and cherry and blueberry, a fifth heavier, sink. Its crimped rim keeps the water off its top; its pastry soaks a little,
// where its tin does not hold the water off (never enough to sink a pie that floats). Its tin and filling are low in
// it, the air under its crust high (what floats an apple pie): its weight is a little under its volume's middle
// (`ballast`), so under the water it turns back right way up, where the flow had turned it on its edge.
defineBuiltIn('pie', {
  name: 'Pie', group: 'Food', note: 'Filled at random: it floats or sinks', called: 'a pie', edible: true,
  body: {
    shape: 'mesh',
    upright: true,
    ballast: [0, -0.06, 0],
    size: { by: 'preset', unit: 'size', initial: 2, presets: [{ value: 1, name: 'Tart', label: '12 cm', diameter: 0.12, mass: 0.185 }, { value: 2, name: 'Pie', label: '23 cm', diameter: 0.23, mass: 1.3 }, { value: 3, name: 'Family', label: '28 cm', diameter: 0.28, mass: 2.3 }] },
  },
  material: { bounce: [0.04, 0.1], friction: 0.8 },
  air: { drag: 1.0, model: 'flutter' },
  water: { restingHeight: 0.22, dry: 0.82, soaks: { seconds: 300, takes: 0.04 } },
  look: { mesh: 'pie', roughness: 0.7, reflection: 0.8, wet: { darker: 0.2, glossier: 0.4 } },
});
defineBuiltIn('watermelon', {
  name: 'Watermelon', group: 'Food', note: 'Nearly as heavy as water: it floats low', called: 'a watermelon', edible: true,
  body: { shape: 'mesh', density: 960, size: { by: 'mass', unit: 'kg', min: 2, max: 10, step: 0.5, initial: 5 } },
  material: { bounce: [0.08, 0.15], friction: 0.6 },
  water: { restingHeight: 0.9 },
  look: { mesh: 'watermelon', roughness: 0.45, reflection: 0.9 },
});

defineBuiltIn('duck', {
  name: 'Rubber duck', short: 'Duck', group: 'Toys', note: 'Hollow vinyl: it rights itself afloat', called: 'a rubber duck',
  body: {
    shape: 'mesh',
    upright: true,
    ballast: [0, -0.2, 0],
    size: { by: 'preset', unit: 'size', initial: 2, presets: [{ value: 1, name: 'Mini', label: '5 cm', diameter: 0.05, mass: 0.005 }, { value: 2, name: 'Classic', label: '9 cm', diameter: 0.09, mass: 0.028 }, { value: 3, name: 'Jumbo', label: '25 cm', diameter: 0.25, mass: 0.3 }] },
  },
  material: { bounce: [0.45, 0.6], friction: 0.8 },
  air: { drag: 0.6 },
  water: { restingHeight: 0.4 },
  look: { mesh: 'duck', roughness: 0.35, reflection: 1.0, wet: { darker: 0.03, glossier: 0.45 } },
});

defineBuiltIn('brick', {
  name: 'Brick', group: 'Other', note: '2.7 kg of fired clay: it sinks', called: 'a brick',
  body: { shape: 'mesh', size: { by: 'fixed', diameter: 0.215, mass: 2.7 } },
  material: { bounce: [0.1, 0.2], friction: 0.7 },
  air: { drag: 1.0 },
  water: { restingHeight: 0.3 },
  look: { mesh: 'brick', roughness: 0.95, reflection: 0.6 },
});

defineBuiltIn('tv', {
  name: 'TV', group: 'Electronics', note: 'A flat screen, 3.6 kg: it sinks', called: 'a TV',
  body: { shape: 'mesh', upright: true, size: { by: 'fixed', diameter: 0.54, mass: 3.6 } },
  material: { bounce: [0.06, 0.12], friction: 0.65 },
  air: { drag: 1.15, model: 'flutter' },
  water: { restingHeight: 1.8 / 54 },
  look: { mesh: 'tv', roughness: 0.25, reflection: 1.0, wet: { darker: 0.05, glossier: 0.25 } },
});

defineBuiltIn('iphone', {
  name: 'iPhone', group: 'Electronics', note: 'Glass and metal, 180 g: it sinks', called: 'an iPhone',
  body: { shape: 'mesh', upright: true, size: { by: 'fixed', diameter: 0.15, mass: 0.18 } },
  material: { bounce: [0.12, 0.22], friction: 0.4 },
  air: { drag: 1.1, model: 'flutter' },
  water: { restingHeight: 0.8 / 15 },
  look: { mesh: 'iphone', roughness: 0.18, reflection: 1.1, wet: { darker: 0.03, glossier: 0.2 } },
});

// A shard of ice (the header): each one the ice breaks has its own outline, and the mass of ice its slab holds (src/ice.js
// shards), so its density is ice's, 917 kg/m³, as the plain one's here is (its slab's 4.65e-5 m³ at 10 cm across),
// thrown as any thing is (tools/thing-probe.mjs). Ice is slick.
defineBuiltIn('ice-shard', {
  name: 'Ice shard', group: 'Other', note: 'A piece of broken ice: it floats', called: 'a shard of ice', hidden: true,
  body: { shape: 'mesh', meetsAtRim: true, size: { by: 'fixed', diameter: 0.1, mass: 0.0426 } },
  material: { bounce: [0.15, 0.3], friction: 0.1 },
  air: { drag: 1.1, model: 'flutter' },
  water: { restingHeight: 0.1 },
  look: { mesh: 'shard', roughness: 0.06, reflection: 0.5, wet: { darker: 0, glossier: 0.3 }, seenThrough: true },
  abilities: { held: false },
});

// The things below are defined after the shard so that every thing before keeps its place in THING_NAMES (the probes
// seed each thing's throws by it); the menu lists each group's in the order defined (and the groups so, but LAST_GROUPS).

// A banana (the header): about 920 kg/m³ whole, ripe (Ambon bananas, measured by what they displace, 932 falling to
// 890 kg/m³ as they ripened), so it floats with all but a sliver of it under. Long and thin, its nominal radius is its
// ball's of like volume (src/thingMeshes.js asUnitBall), which its splash is sized by: a stone of its radius displaces
// what it does. Thrown, it tumbles end over end. Its buoyancy is cut finer (`columns`), for enough across its girth.
defineBuiltIn('banana', {
  name: 'Banana', group: 'Food', note: 'For scale: it floats, just', called: 'a banana', edible: true,
  body: { shape: 'mesh', density: 920, size: { by: 'mass', unit: 'g', min: 100, max: 250, step: 10, initial: 160 } },
  material: { bounce: [0.12, 0.22], friction: 0.7 },
  air: { drag: 1.1 },
  water: { restingHeight: 0.55, columns: 40 },
  look: { mesh: 'banana', roughness: 0.45, reflection: 0.8, wet: { darker: 0.08, glossier: 0.45 } },
});
// A slice of sandwich bread (the header), 12 cm and 30 g: white bread's crumb is 4 to 6 cm³ a gram, so the slice is
// about 175 kg/m³ and floats nearly all out of the water, a plate in the air as a pizza is, and floppier. Its crumb is
// some 85% air, open to the water: it soaks fast, and waterlogged (its pores all but full, 0.88 of its volume) it
// sinks, in two or three minutes afloat.
const BREAD_GIVE = { cup: 0.004, most: 0.15, flap: 0.07, rate: 4, drape: 0.8 };
defineBuiltIn('bread', {
  name: 'Slice of bread', short: 'Bread', group: 'Food', note: 'For the ducks: it floats, soaks, sinks', called: 'a slice of bread', edible: true,
  body: { shape: 'mesh', soft: BREAD_GIVE, size: { by: 'fixed', diameter: 0.13, mass: 0.03 } },
  material: { bounce: [0.03, 0.08], friction: 0.9 },
  air: { drag: 1.1, model: 'flutter' },
  water: { restingHeight: 0.1, soaks: { seconds: 25, takes: 0.88 } },
  look: { mesh: 'bread', roughness: 1.0, reflection: 0.5, wet: { darker: 0.2, glossier: 0.3 } },
});
// A birthday cake (the header), two layers under buttercream, with a random number of candles: sponge cake is 0.3
// to 0.4 g/cm³ (some 75% air) and buttercream about 0.9, so the whole is about 460 kg/m³ and floats half out. Its
// frosting's weight is high in it, a little over its middle (`ballast`), so either way up it lands it stays; kept
// upright, on the deck it settles flat, on its top or its base, never on its edge. Its
// sponge soaks through its bare underside and sides, slowed by its frosting: waterlogged (0.62 of its volume), it
// sinks, in three or four minutes afloat. Thrown, it tumbles.
defineBuiltIn('cake', {
  name: 'Birthday cake', short: 'Cake', group: 'Food', note: 'Sponge and frosting: floats, then soaks', called: 'a cake', edible: true,
  body: {
    shape: 'mesh',
    upright: true,
    ballast: [0, 0.03, 0],
    size: { by: 'preset', unit: 'size', initial: 2, presets: [{ value: 1, name: 'Small', label: '16 cm', diameter: 0.16, mass: 0.66 }, { value: 2, name: 'Party', label: '22 cm', diameter: 0.22, mass: 1.7 }, { value: 3, name: 'Big', label: '28 cm', diameter: 0.28, mass: 3.5 }] },
  },
  material: { bounce: [0.02, 0.06], friction: 0.9 },
  air: { drag: 0.9 },
  water: { restingHeight: 0.45, soaks: { seconds: 60, takes: 0.62 } },
  look: { mesh: 'cake', roughness: 0.6, reflection: 0.7, wet: { darker: 0.12, glossier: 0.35 } },
});
// A snowball (the header), packed by hand, about 450 kg/m³ (packed snow is 300 to 500): it floats half out, then the
// water floods the air between its grains, as much as 0.45 of its volume, in under half a minute, and it floats on as
// slush, nearly all under (ice and water, still lighter than water). Melting it would take tens of minutes.
defineBuiltIn('snowball', {
  name: 'Snowball', group: 'Other', note: 'Packed snow: it floats, soaked to slush', called: 'a snowball',
  body: { shape: 'sphere', density: 450, size: { by: 'diameter', unit: 'cm', min: 5, max: 15, step: 0.5, initial: 8 } },
  material: { bounce: [0.03, 0.1], friction: 0.9, roll: 'solid', rolling: 0.4 },
  water: { restingHeight: 0.95, soaks: { seconds: 6, takes: 0.45 } },
  look: { mesh: 'snowball', roughness: 0.8, reflection: 0.7, wet: { darker: 0.3, glossier: 0.5 } },
});
// A toddler's slide (the header), 99 × 46 × 70 cm and 4.1 kg (9 lb), moulded with hollow walls: its hull holds 39
// litres (src/thingMeshes.js), so it is about 104 kg/m³ and floats nine tenths out of the water. Its nominal radius
// is its hull's ball of like volume (0.211 m, a 42 cm ball: its splash is a thing's that displaces as much), its size
// shown as its length. A throw puts no more than THROW_WORK into it, and it tumbles slowly (`air.spin`), dragged by
// the air on more than its ball's disc. Kept upright, it settles on the deck on its feet or upside down, not balanced
// on a corner; afloat the water leaves it as it lands (on its feet, its side or upside down: it is no heavier low
// down), its buoyancy cut slantwise to all its faces (`columnsAlong`).
defineBuiltIn('slide', {
  name: 'Toy slide', short: 'Slide', group: 'Toys', note: 'Hollow plastic, 4 kg: it floats high', called: 'a toy slide',
  body: { shape: 'mesh', upright: true, size: { by: 'fixed', diameter: 0.422, mass: 4.1 } },
  material: { bounce: [0.15, 0.25], friction: 0.5 },
  air: { drag: 2.2, spin: [1, 4] },
  water: { restingHeight: 0.8, columnsAlong: [1, 1, 1] },
  look: { mesh: 'slide', roughness: 0.45, reflection: 0.9, wet: { darker: 0.02, glossier: 0.3 } },
});
// An iPad (the header): each step of its slider a device of its own (a preset's `look.model`, src/thingMeshes.js
// TABLETS), from an iPhone, the phone's own, through an iPad mini and an iPad to a 13-inch iPad Pro, each its maker's
// size and weight (glass over aluminium, 1500 to 2100 kg/m³), so each sinks, a plate as the iPhone and the TV are: it
// slaps the water flat and flutters down, its screen on +y. Each rests on the bed as thick as it is (`restingHeight`).
defineBuiltIn('ipad', {
  name: 'iPad', group: 'Electronics', note: 'From an iPhone to an iPad Pro: it sinks', called: 'an iPad',
  body: {
    shape: 'mesh',
    upright: true,
    size: {
      by: 'preset', unit: 'model', initial: 3, presets: [
        { value: 1, name: 'iPhone', label: '180 g', diameter: 0.15, mass: 0.18, look: { model: 'iphone' }, water: { restingHeight: 0.8 / 15 } },
        { value: 2, name: 'iPad mini', label: '293 g', diameter: 0.1954, mass: 0.293, look: { model: 'ipad-mini' }, water: { restingHeight: 6.3 / 195.4 } },
        { value: 3, name: 'iPad 11″', label: '477 g', diameter: 0.2486, mass: 0.477 },
        { value: 4, name: 'iPad Pro 13″', label: '579 g', diameter: 0.2816, mass: 0.579, look: { model: 'ipad-pro' }, water: { restingHeight: 5.1 / 281.6 } },
      ],
    },
  },
  material: { bounce: [0.12, 0.22], friction: 0.4 },
  air: { drag: 1.1, model: 'flutter' },
  water: { restingHeight: 7.0 / 248.6 },
  look: { mesh: 'tablet', model: 'ipad', roughness: 0.18, reflection: 1.1, wet: { darker: 0.03, glossier: 0.2 } },
});
// A cast-iron skillet (the header), each step its own size (a preset's `look.size`, src/thingMeshes.js PAN), a
// Lodge's: 20, 25 and 30 cm across its rim, 1.5, 2.4 and 3.4 kg, its walls as thick as iron of that weight makes them
// (7150 kg/m³); its nominal radius half its length, its handle and all. Thrown flat and spinning on its face, as a
// plate is, it slaps the water and flutters down broadside, as a dish does, to lie on the bed on its base or its rim;
// on the deck it lands with a thud, hardly bouncing.
defineBuiltIn('pan', {
  name: 'Frying pan', short: 'Pan', group: 'Other', note: 'Cast iron, 1.5 to 3.4 kg: it sinks', called: 'a frying pan',
  body: {
    shape: 'mesh',
    upright: true,
    size: {
      by: 'preset', unit: 'size', initial: 2, presets: [
        { value: 1, name: '20 cm', label: '1.5 kg', diameter: 0.3261, mass: 1.5, look: { size: 20 }, water: { restingHeight: 0.1216 } },
        { value: 2, name: '25 cm', label: '2.4 kg', diameter: 0.3945, mass: 2.4 },
        { value: 3, name: '30 cm', label: '3.4 kg', diameter: 0.4916, mass: 3.4, look: { size: 30 }, water: { restingHeight: 0.0919 } },
      ],
    },
  },
  material: { bounce: [0.08, 0.16], friction: 0.45 },
  air: { drag: 1.1, model: 'flutter' },
  water: { restingHeight: 0.1049 },
  look: { mesh: 'pan', size: 25, roughness: 0.55, reflection: 0.9, wet: { darker: 0.05, glossier: 0.35 } },
});
// Red roses (the header), each step its own count (a preset's `look.count`, src/thingMeshes.js ROSES): one
// long-stemmed rose, or 3, 6, 12 or 24 tied in a spiral under a satin ribbon. Each weighs what its parts do (ROSES'
// densities: a bloom some 12 g, its stem and leaves about as heavy as the water they displace, its ribbon a few grams):
// about 30 g a rose. Its petals hold air between them, so the whole is 250 to 350 kg/m³ and floats, a third or less
// under; its weight is lower than its volume's middle (`ballast`, each its own: a rose's far down its stem), so it
// floats lying on the water, its stems under and its blooms up, not on its blooms with its stems in the air. Its
// nominal radius is its ball's of like volume (its splash a thing's that displaces as much). One rose's buoyancy is
// cut finer (`columns`), so its stem floats as well as its bloom, and two dozen's, so its columns hold its body. It
// floats by its blooms' hulls, its petals drawn open (src/thingMeshes.js createRosesGeometry). Thrown, it tumbles
// slowly, end over end.
defineBuiltIn('roses', {
  name: 'Roses', group: 'Other', note: 'One, or a bouquet of up to 24: it floats', called: 'roses',
  body: {
    shape: 'mesh',
    ballast: [0, -0.606, 0],
    size: {
      by: 'preset', unit: 'roses', initial: 4, presets: [
        { value: 1, name: '1 rose', label: '29 g', diameter: 0.0561, mass: 0.0292, look: { count: 1 }, water: { columns: 60, columnsAlong: [1, 0, 0] }, body: { ballast: [0.3, -2.352, 0] } },
        { value: 2, name: '3 roses', label: '127 g', diameter: 0.0885, mass: 0.1272, look: { count: 3 }, body: { ballast: [0, -1.429, 0] } },
        { value: 3, name: '6 roses', label: '239 g', diameter: 0.1129, mass: 0.2393, look: { count: 6 }, body: { ballast: [0, -0.926, 0] } },
        { value: 4, name: '12 roses', label: '433 g', diameter: 0.1396, mass: 0.4332 },
        { value: 5, name: '24 roses', label: '802 g', diameter: 0.1729, mass: 0.8022, look: { count: 24 }, water: { columns: 24 }, body: { ballast: [0, -0.327, 0] } },
      ],
    },
  },
  material: { bounce: [0.05, 0.12], friction: 0.8 },
  air: { drag: 1.0, spin: [1.5, 6] },
  water: { restingHeight: 0.5, columnsAlong: [0, 1, 0] },
  look: { mesh: 'roses', count: 12, roughness: 0.75, reflection: 0.7, wet: { darker: 0.1, glossier: 0.4 } },
});
