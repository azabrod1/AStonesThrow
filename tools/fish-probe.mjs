// The fish on the CPU (src/fish.js), and checks:
//
//   node tools/fish-probe.mjs
//
// - every place's fish (FISH_BY_PLACE) start in their water: inside its
//   box, under the surface, over the bed, at their kind's depths, and the
//   Pool has none;
// - two minutes of swimming each place keeps every fish in its water, at a
//   speed its kind can swim, and its company together: a school's fish a
//   body length or two from their nearest neighbour, a shoal's a few;
// - a stone coming down frightens the fish under where it will land before
//   it lands: they bolt away from it, and their group takes fright after
//   them; a thing lying still on the bed frightens none;
// - something edible floating in the Koi pond brings the koi to it once it
//   has settled: no more than FEEDERS at a time, each biting at its edge,
//   at the surface; a sunk one they bite where it lies; none while wary;
// - nothing passes through a fish: stones and bowling balls dropped onto
//   them, a pizza sinking among them, one adrift, a stone lying on the bed
//   and their own food: no fish's body ever enters a thing, and keepClear
//   rarely has to push one (they get out of the way first);
// - under ice and a gale's waves they keep deeper (setConditions);
// - edible things (src/things.js `edible`) and their bites (edibleBites);
// - the population draws no Math.random (its own seeded stream): a seeded
//   throw is the same with fish, and the same place's fish swim the same;
// - the cost: a frame's step for each place, with a throw's threats.
import { FishPopulation, FISH_BY_PLACE, FISH_SPECIES, FEEDERS, edibleBites } from '../src/fish.js';
import { floorDepthAt, koiFloorDepthAt, KOI_SHORE } from '../src/pondFloor.js';
import { POOL } from '../src/pool.js';
import { THINGS } from '../src/things.js';

const failures = [];
function check(condition, message) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) failures.push(message); }

// The waters src/main.js gives them (applyFish): the lake's solver patch, inset (FISH_LAKE_INSET), or the pool's basin.
const LAKE = { bounds: { minX: -2.6, minZ: -3.2, maxX: 2.6, maxZ: 2.0 }, depthAt: floorDepthAt };
const BASIN = { bounds: { minX: -1.5, minZ: -2.5, maxX: 1.5, maxZ: 0.5 }, depthAt: () => POOL.depth };
const koiReach = KOI_SHORE.base + KOI_SHORE.lobes.reduce((sum, [amplitude]) => sum + amplitude, 0);
const KOI = { bounds: { minX: KOI_SHORE.centre[0] - koiReach, minZ: KOI_SHORE.centre[1] - koiReach, maxX: KOI_SHORE.centre[0] + koiReach, maxZ: KOI_SHORE.centre[1] + koiReach }, depthAt: koiFloorDepthAt };
const waterOf = (place) => (place === 'pool' ? BASIN : place === 'koi' ? KOI : LAKE);
const FRAME = 1 / 60;
const realRandom = Math.random;
Math.random = () => { throw new Error('the fish drew Math.random'); };

function inWater(population, fish, slack = 1e-6) {
  const { bounds, depthAt } = population.water;
  const bed = depthAt(fish.x, fish.z);
  return fish.x >= bounds.minX - slack && fish.x <= bounds.maxX + slack && fish.z >= bounds.minZ - slack && fish.z <= bounds.maxZ + slack
    && fish.y < 0 && fish.y > -bed && Number.isFinite(fish.x + fish.y + fish.z + fish.heading + fish.speed);
}
const nearestApart = (fish, members) => Math.min(...members.filter((other) => other !== fish).map((other) => Math.hypot(other.x - fish.x, other.y - fish.y, other.z - fish.z)));

console.log('places:');
for (const [place, kinds] of Object.entries(FISH_BY_PLACE)) {
  const population = new FishPopulation({ seed: 1 });
  population.setWaters({ place, ...waterOf(place) });
  const expected = kinds.reduce((sum, { count }) => sum + count, 0);
  check(population.fish.length === expected, `${place}: ${expected} fish (${kinds.map(({ species, count }) => `${count} ${FISH_SPECIES[species].name}`).join(', ') || 'none'})`);
  check(population.fish.every((fish) => inWater(population, fish)), `${place}: all start in the water`);
  check(population.fish.every((fish) => -fish.y >= Math.min(fish.species.depth[0], 0.04) - 1e-9), `${place}: all start at their kind's depths`);
  // Two minutes' swimming.
  let out = 0, tooFast = 0;
  const depths = population.fish.map((fish) => [fish.y, fish.y]);
  const spacing = { school: [], shoal: [] };
  for (let frame = 0; frame < 120 / FRAME; frame++) {
    population.step(FRAME);
    for (const fish of population.fish) {
      if (!inWater(population, fish)) out++;
      if (fish.speed > fish.species.cruise * fish.length * 1.6 + 1e-9) tooFast++;
    }
    population.fish.forEach((fish, index) => { depths[index][0] = Math.min(depths[index][0], fish.y); depths[index][1] = Math.max(depths[index][1], fish.y); });
    if (frame % 60 === 0) {
      for (const group of population.groups) {
        if (group.members.length < 2 || !spacing[group.species.company]) continue;
        const mean = group.members.reduce((sum, fish) => sum + nearestApart(fish, group.members) / fish.length, 0) / group.members.length;
        spacing[group.species.company].push(mean);
      }
    }
  }
  check(out === 0, `${place}: two minutes, every fish stays in its water (${out} fish-frames out)`);
  const spans = depths.map(([low, high]) => high - low).sort((a, b) => a - b);
  if (spans.length) check(spans[Math.floor(spans.length / 2)] > 0.15, `${place}: they change depth, not keeping one level (half rose or sank over ${spans[Math.floor(spans.length / 2)].toFixed(2)} m or more)`);
  check(tooFast === 0, `${place}: unfrightened, none swims faster than 1.6 times its cruise (${tooFast})`);
  for (const [company, samples] of Object.entries(spacing)) {
    if (samples.length === 0) continue;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const [least, most] = company === 'school' ? [0.6, 3] : [1, 8];
    check(mean >= least && mean <= most, `${place}: a ${company}'s fish ${mean.toFixed(2)} body lengths from their nearest (${least} to ${most})`);
  }
}
console.log('\nsteady (no trembling):');
for (const place of ['lakeside', 'koi']) {
  const population = new FishPopulation({ seed: 2 });
  population.setWaters({ place, ...waterOf(place) });
  for (let frame = 0; frame < 5 / FRAME; frame++) population.step(FRAME);
  const last = population.fish.map((fish) => ({ heading: fish.heading, turn: 0, climb: fish.climb, reversals: 0, rises: 0, jump: 0 }));
  const seconds = 60;
  const pizza = { id: 'pizza', x: 0.2, y: 0, z: -0.9, radius: 0.15, floating: true, settled: 10 };
  for (let frame = 0; frame < seconds / FRAME; frame++) {
    population.step(FRAME, { foods: frame > 20 / FRAME ? [pizza] : [] });
    population.fish.forEach((fish, index) => {
      const turn = Math.atan2(Math.sin(fish.heading - last[index].heading), Math.cos(fish.heading - last[index].heading));
      if (Math.abs(turn) > 2e-3 && Math.abs(last[index].turn) > 2e-3 && Math.sign(turn) !== Math.sign(last[index].turn)) last[index].reversals++;
      if (Math.abs(turn) > 2e-3) last[index].turn = turn;
      last[index].jump = Math.max(last[index].jump, Math.abs(turn));
      last[index].heading = fish.heading;
    });
  }
  const reversals = Math.max(...last.map((entry) => entry.reversals)) / seconds;
  const jump = Math.max(...last.map((entry) => entry.jump));
  check(reversals < 0.6, `${place}: cruising and feeding, no fish turns one way then the other more than ${reversals.toFixed(2)} times a second (under 0.6)`);
  check(jump * 60 < 5, `${place}: unfrightened, none turns faster than ${(jump * 60).toFixed(1)} rad/s (under 5)`);
}
check(new FishPopulation().fish.length === 0 && (() => { const pool = new FishPopulation(); pool.setWaters({ place: 'pool', ...BASIN }); return pool.fish.length === 0; })(), 'the Pool has no fish');

console.log('\nfright:');
{
  const population = new FishPopulation({ seed: 3 });
  population.setWaters({ place: 'koi', ...BASIN });
  for (let frame = 0; frame < 20 / FRAME; frame++) population.step(FRAME);
  // A 6 cm stone coming down at 7 m/s over the middle of the koi.
  // Over the koi nearest the pond's middle, so the walls leave them room to flee.
  const koi = population.fish.filter((fish) => fish.species === FISH_SPECIES.koi).sort((a, b) => Math.hypot(a.x, a.z + 1) - Math.hypot(b.x, b.z + 1));
  const middle = { x: koi[0].x + 0.1, z: koi[0].z };
  const radius = 0.03, alarm = (0.5 + 11 * radius) * FISH_SPECIES.koi.shy;
  const near = population.fish.filter((fish) => Math.hypot(fish.x - middle.x, fish.z - middle.z, Math.max(Math.abs(fish.y) - 0.4, 0)) < alarm * 0.9);   // as startle measures
  const before = near.map((fish) => Math.hypot(fish.x - middle.x, fish.z - middle.z));
  // Still high in the air, 0.7 s from landing: no fright yet.
  population.step(FRAME, { threats: [{ x: middle.x - 2, y: 3, z: middle.z, radius, vx: 2.5, vy: -1, vz: 0, inAir: true }] });
  check(population.fish.every((fish) => fish.fright === 0), 'a stone high in the air frightens nothing');
  const toGo = (-5 + Math.sqrt(25 + 2 * 9.81 * 0.6)) / 9.81;   // s: from 0.6 m up at 5 m/s down
  population.step(FRAME, { threats: [{ x: middle.x - toGo, y: 0.6, z: middle.z, radius, vx: 1, vy: -5, vz: 0, inAir: true }] });
  const frightened = near.filter((fish) => fish.fright > 0).length;
  check(near.length > 0 && frightened === near.length, `coming down, it frightens every fish within ${alarm.toFixed(2)} m of where it lands (${(toGo * 1000).toFixed(0)} ms to go), before it lands (${frightened} of ${near.length})`);
  for (let frame = 0; frame < 1 / FRAME; frame++) population.step(FRAME);
  const after = near.map((fish) => Math.hypot(fish.x - middle.x, fish.z - middle.z));
  const fled = after.filter((distance, index) => distance > before[index] + 0.15).length;
  check(fled >= Math.ceil(near.length * 0.6), `a second on, ${fled} of ${near.length} are at least 15 cm farther away (mean ${(after.reduce((a, b) => a + b, 0) / after.length).toFixed(2)} m, from ${(before.reduce((a, b) => a + b, 0) / before.length).toFixed(2)})`);
  const groupMates = population.fish.filter((fish) => !near.includes(fish) && fish.group.members.some((other) => near.includes(other)));
  check(groupMates.length === 0 || groupMates.some((fish) => fish.wary > 0), `their group takes fright after them (${groupMates.filter((fish) => fish.wary > 0).length} of ${groupMates.length} others wary)`);
  // Frightened against a wall, again and again: they bolt along it, never into it, no faster than BURST_MOST.
  {
    const cornered = new FishPopulation({ seed: 4 });
    cornered.setWaters({ place: 'koi', ...BASIN });
    let intoWall = 0, fastest = 0;
    for (let frame = 0; frame < 30 / FRAME; frame++) {
      if (frame % 90 === 0) for (const fish of cornered.fish) cornered.startle(fish.x - Math.cos(fish.heading) * 0.2 + (fish.x < 0 ? 0.3 : -0.3), 0, fish.z, 0.8);
      cornered.step(FRAME);
      for (const fish of cornered.fish) {
        fastest = Math.max(fastest, fish.speed);
        const noseX = fish.x + Math.cos(fish.heading) * fish.length * 0.5, noseZ = fish.z + Math.sin(fish.heading) * fish.length * 0.5;
        if (noseX < BASIN.bounds.minX || noseX > BASIN.bounds.maxX || noseZ < BASIN.bounds.minZ || noseZ > BASIN.bounds.maxZ) intoWall++;
      }
    }
    check(intoWall === 0, `frightened toward the walls for 30 s, no koi's nose goes into one (${intoWall} fish-frames)`);
    check(fastest <= 0.8 + 1e-9, `the fastest bolt ${fastest.toFixed(2)} m/s (at most 0.8)`);
  }
  // In the Koi pond, frightened toward its shore again and again: none ever swims out of the water, nose or middle.
  {
    const pond = new FishPopulation({ seed: 4 });
    pond.setWaters({ place: 'koi', ...KOI });
    let ashore = 0;
    for (let frame = 0; frame < 30 / FRAME; frame++) {
      if (frame % 90 === 0) for (const fish of pond.fish) pond.startle(fish.x - Math.cos(fish.heading) * 0.2, 0, fish.z - Math.sin(fish.heading) * 0.2, 0.8);
      pond.step(FRAME);
      for (const fish of pond.fish) {
        const noseX = fish.x + Math.cos(fish.heading) * fish.length * 0.5, noseZ = fish.z + Math.sin(fish.heading) * fish.length * 0.5;
        if (koiFloorDepthAt(fish.x, fish.z) <= 0.05 || koiFloorDepthAt(noseX, noseZ) <= 0) ashore++;
      }
    }
    check(ashore === 0, `frightened toward the Koi pond's shore for 30 s, none swims out of the water (${ashore} fish-frames)`);
  }
  // A thing lying still on the bed frightens none.
  const calm = new FishPopulation({ seed: 3 });
  calm.setWaters({ place: 'koi', ...BASIN });
  for (let frame = 0; frame < 5 / FRAME; frame++) calm.step(FRAME, { threats: [{ x: 0, y: -1.37, z: -1, radius: 0.03, inAir: false, still: true }] });
  check(calm.fish.every((fish) => fish.wary === 0), 'a stone lying still on the bed frightens none');
}

console.log('\nfood:');
{
  const population = new FishPopulation({ seed: 5 });
  population.setWaters({ place: 'koi', ...BASIN });
  const pizza = { id: 'pizza', x: 0, y: 0.01, z: -1, radius: 0.15, floating: true, settled: 0 };
  let firstBite = null, bites = [], mostAt = 0;
  for (let frame = 0; frame < 60 / FRAME; frame++) {
    pizza.settled += FRAME;
    const taken = population.step(FRAME, { foods: [pizza], threats: [{ ...pizza, thickness: 0.012, normal: [0, 1, 0], inAir: false, still: true }] });
    if (taken.length && firstBite === null) firstBite = frame * FRAME;
    bites.push(...taken);
    mostAt = Math.max(mostAt, population.fish.filter((fish) => fish.food?.id === 'pizza').length);
  }
  check(firstBite !== null && firstBite < 20, `a floating pizza: the first bite at ${firstBite?.toFixed(1)} s (under 20)`);
  check(bites.length > 0.4 * edibleBites(0.38) && bites.length < 4 * edibleBites(0.38), `${bites.length} bites in a minute: a 30 cm pizza (${edibleBites(0.38)} bites) eaten in ${(60 * edibleBites(0.38) / bites.length).toFixed(0)} s`);
  check(mostAt <= FEEDERS && mostAt >= 3, `at most ${mostAt} fish at it at once (3 to ${FEEDERS})`);
  check(bites.every((bite) => bite.floating && Math.abs(Math.hypot(bite.x - pizza.x, bite.z - pizza.z) - pizza.radius * 0.8) < 1e-6), 'each bite at its edge, at the surface');
  // Before it has settled, none comes.
  const early = new FishPopulation({ seed: 5 });
  early.setWaters({ place: 'koi', ...BASIN });
  let earlyBites = 0;
  for (let frame = 0; frame < 1.5 / FRAME; frame++) earlyBites += early.step(FRAME, { foods: [{ ...pizza, settled: frame * FRAME }] }).length;
  check(earlyBites === 0, 'none bites before it has settled');
  // A frightened fish will not feed while wary.
  const wary = new FishPopulation({ seed: 5 });
  wary.setWaters({ place: 'koi', ...BASIN });
  wary.startle(0, 0, -1, 10);
  let waryBites = 0;
  for (let frame = 0; frame < 2.5 / FRAME; frame++) waryBites += wary.step(FRAME, { foods: [{ ...pizza, settled: 10 }] }).length;
  check(waryBites === 0, 'frightened, none feeds while wary');
  // A pie sunk to the floor: bitten where it lies.
  const sunk = new FishPopulation({ seed: 7 });
  sunk.setWaters({ place: 'koi', ...BASIN });
  const pie = { id: 'pie', x: 0.4, y: -POOL.depth + 0.03, z: -1.2, radius: 0.115, floating: false, settled: 10 };
  let sunkBites = [];
  for (let frame = 0; frame < 60 / FRAME; frame++) sunkBites.push(...sunk.step(FRAME, { foods: [pie] }));
  const bottom = Math.min(...sunk.fish.filter((fish) => fish.food?.id === 'pie').map((fish) => fish.y));
  check(sunkBites.length > 10 && sunkBites.every((bite) => !bite.floating) && bottom < pie.y + 0.15, `a sunk pie: ${sunkBites.length} bites in a minute, on the floor (its feeders down to ${bottom.toFixed(2)} m, the pie at ${pie.y.toFixed(2)})`);
  // In each lake, something thrown in draws fish to it: their groupmates follow the first.
  for (const place of ['lakeside', 'swiss', 'highlands', 'mesas', 'desert', 'cove']) {
    const population = new FishPopulation({ seed: 1 });
    population.setWaters({ place, ...LAKE });
    for (let frame = 0; frame < 10 / FRAME; frame++) population.step(FRAME);
    const apple = { id: 'apple', x: 0, y: 0, z: -1.2, radius: 0.04, floating: true, settled: 0 };
    let most = 0, bitten = 0;
    for (let frame = 0; frame < 40 / FRAME; frame++) {
      apple.settled += FRAME;
      bitten += population.step(FRAME, { foods: [apple] }).length;
      most = Math.max(most, population.fish.filter((fish) => fish.food?.id === 'apple').length);
    }
    check(most >= 3 && bitten > 0, `${place}: an apple thrown in draws ${most} fish to it, ${bitten} bites in 40 s`);
  }
  // Lake fish that do not eat (a pike) never come.
  const lake = new FishPopulation({ seed: 1 });
  lake.setWaters({ place: 'lakeside', ...LAKE });
  for (let frame = 0; frame < 30 / FRAME; frame++) lake.step(FRAME, { foods: [{ id: 'apple', x: 0, y: 0, z: -0.5, radius: 0.04, floating: true, settled: 10 }] });
  check(lake.fish.filter((fish) => !fish.species.eats).every((fish) => !fish.food), 'a pike never comes to food');
}

console.log('\nnothing passes through a fish:');
{
  // A fish's least clearance of a thing (src/fish.js clearOf: its spine less its thickness).
  const away = { x: 0, y: 0, z: 0 };
  const clearance = (population, thing) => Math.min(...population.fish.map((fish) => population.clearOf(fish, thing, thing.x, thing.y, thing.z, fish.x, fish.y, fish.z, fish.heading, fish.pitch, away)));
  const scenario = (name, place, water, seed, seconds, makeThings, { foods: makeFoods = null, pushes = 0.1 } = {}) => {
    const population = new FishPopulation({ seed });
    population.setWaters({ place, ...water });
    for (let frame = 0; frame < 8 / FRAME; frame++) population.step(FRAME);
    let least = Infinity, pushed = 0, pushedFrames = 0, frames = 0;
    for (let frame = 0; frame < seconds / FRAME; frame++) {
      const things = makeThings(frame * FRAME, population);
      population.step(FRAME, { threats: things, foods: makeFoods ? makeFoods(things) : [] });
      for (const thing of things) if (thing.y - thing.radius <= 0) least = Math.min(least, clearance(population, thing));
      pushed = Math.max(pushed, population.pushed);
      if (population.pushed > 0.002) pushedFrames++;
      frames++;
    }
    check(least >= -1e-6, `${name}: no fish ever inside it (least clearance ${(least * 100).toFixed(1)} cm)`);
    check(pushedFrames / frames < pushes, `${name}: they get out of its way, held off it in ${(100 * pushedFrames / frames).toFixed(1)}% of frames (the farthest ${(pushed * 100).toFixed(1)} cm)`);
  };
  // A thing falling from 1.5 m onto a fish every 1.5 s, sinking at its own speed once in, to the bed.
  const dropped = (radius, sink, bedAt) => (time, population) => {
    const cycle = Math.floor(time / 1.5), into = time - cycle * 1.5;
    population.target ??= [];
    if (!population.target[cycle]) { const fish = population.fish[cycle % population.fish.length]; population.target[cycle] = { x: fish.x, z: fish.z }; }
    const { x, z } = population.target[cycle];
    const fall = Math.sqrt(2 * 1.5 / 9.81);
    if (into < fall) return [{ x, y: 1.5 - 0.5 * 9.81 * into * into, z, radius, vx: 0, vy: -9.81 * into, vz: 0, inAir: true }];
    const bed = -bedAt(x, z) + radius;
    const y = Math.max(-sink * (into - fall), bed);
    return [{ x, y, z, radius, vx: 0, vy: y > bed ? -sink : 0, vz: 0, inAir: false, still: y <= bed }];
  };
  scenario('stones dropped onto the koi', 'koi', KOI, 11, 30, dropped(0.04, 1.2, koiFloorDepthAt));
  scenario('bowling balls dropped onto the koi', 'koi', KOI, 12, 30, dropped(0.11, 2.5, koiFloorDepthAt), { pushes: 0.15 });
  scenario('stones dropped onto the minnows', 'lakeside', LAKE, 13, 30, dropped(0.04, 1.2, floorDepthAt));
  // A pizza (a disc 15 cm across its half, 1 cm thick) adrift at the surface, through the koi.
  scenario('a pizza adrift through them', 'koi', KOI, 14, 30, (time) => [{ id: 'pizza', x: -2.5 + 0.15 * time, y: -0.005, z: -1.2, radius: 0.15, thickness: 0.012, normal: [0, 1, 0], vx: 0.15, vy: 0, vz: 0, inAir: false, still: false }]);
  // A pizza sinking slowly, tilted, among them, then lying on the bed; they come to eat it.
  scenario('a pizza sinking, then eaten on the bed', 'koi', KOI, 15, 40, (time) => {
    const bed = -koiFloorDepthAt(0, -1.2) + 0.012, y = Math.max(-0.12 * time, bed);
    return [{ id: 'pizza', x: 0, y, z: -1.2, radius: 0.15, thickness: 0.012, normal: [0.3, 0.95, 0], vx: 0, vy: y > bed ? -0.12 : 0, vz: 0, inAir: false, still: y <= bed }];
  }, { foods: ([pizza]) => [{ id: 'pizza', x: pizza.x, y: pizza.y, z: pizza.z, radius: 0.15, floating: false, settled: pizza.still ? 10 : 0 }] });
  // A floating pizza they feed at, from under it.
  scenario('a floating pizza they feed at', 'koi', KOI, 16, 40, () => [{ id: 'pizza', x: 0.5, y: -0.005, z: -1.5, radius: 0.15, thickness: 0.012, normal: [0, 1, 0], vx: 0, vy: 0, vz: 0, inAir: false, still: true }],
    { foods: () => [{ id: 'pizza', x: 0.5, y: -0.005, z: -1.5, radius: 0.15, floating: true, settled: 10 }] });
  // Stones lying on the bed where the fish swim.
  scenario('stones lying on the bed', 'koi', KOI, 17, 60, () => [[0, -1.2], [1, -0.5], [-1, -2]].map(([x, z]) => ({ x, y: -koiFloorDepthAt(x, z) + 0.06, z, radius: 0.06, vx: 0, vy: 0, vz: 0, inAir: false, still: true })), { pushes: 0.02 });
}

console.log('\nice and gale:');
for (const gap of [0.07, 0.35]) {
  const population = new FishPopulation({ seed: 2 });
  population.setWaters({ place: 'koi', ...BASIN });
  population.setConditions({ surfaceGap: gap });
  let shallowest = -Infinity;
  for (let frame = 0; frame < 30 / FRAME; frame++) {
    population.step(FRAME);
    if (frame > 5 / FRAME) for (const fish of population.fish) shallowest = Math.max(shallowest, fish.y + 0.5 * fish.species.shape.depth * fish.length);
  }
  check(shallowest <= -gap + 0.02, `their backs keep ${gap} m under (the highest back at ${shallowest.toFixed(3)} m)`);
}

console.log('\nedible things:');
const edible = Object.entries(THINGS).filter(([, thing]) => thing.edible).map(([key]) => key);
check(['pizza', 'frozen-pizza', 'pie', 'apple', 'watermelon'].every((key) => edible.includes(key)) && !edible.includes('stone') && !edible.includes('duck'), `edible: ${edible.join(', ')}`);
check(edibleBites(0.38) === 95 && edibleBites(0.11) === 30 && edibleBites(5) === 500, `bites: a 30 cm pizza ${edibleBites(0.38)}, a 20 cm one ${edibleBites(0.11)}, a 5 kg watermelon ${edibleBites(5)}`);

console.log('\nthe same every time:');
{
  const swim = (place) => {
    const population = new FishPopulation({ seed: 1 });
    population.setWaters({ place, ...waterOf(place) });
    for (let frame = 0; frame < 10 / FRAME; frame++) population.step(FRAME);
    return population.fish.map((fish) => [fish.x, fish.y, fish.z].map((value) => value.toFixed(9)).join()).join(';');
  };
  check(swim('lakeside') === swim('lakeside') && swim('koi') === swim('koi'), 'a place\'s fish swim the same every time, with no Math.random drawn');
}

console.log('\ncost (a frame, 1/60 s):');
Math.random = realRandom;
for (const place of Object.keys(FISH_BY_PLACE)) {
  const population = new FishPopulation({ seed: 1 });
  population.setWaters({ place, ...waterOf(place) });
  const threats = [{ x: 0, y: 0.5, z: -1, radius: 0.03, vx: 1, vy: -4, vz: 0, inAir: true }, { x: 0.3, y: -0.5, z: -1, radius: 0.03, inAir: false, still: false }];
  const foods = [{ id: 'pizza', x: 0, y: 0, z: -1, radius: 0.15, floating: true, settled: 10 }];
  for (let frame = 0; frame < 600; frame++) population.step(FRAME, { threats, foods });
  const frames = 3000;
  const started = performance.now();
  for (let frame = 0; frame < frames; frame++) population.step(FRAME, { threats, foods });
  const milliseconds = (performance.now() - started) / frames;
  console.log(`  ${place}: ${population.fish.length} fish, ${(milliseconds * 1000).toFixed(1)} µs`);
  check(milliseconds < 0.25, `${place}: a frame's step under 0.25 ms (${milliseconds.toFixed(3)})`);
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall ok');
process.exit(failures.length ? 1 : 0);
