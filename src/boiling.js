// Open water boiling in vacuum (src/air.js: Europa, whose air is a trillionth
// of Earth's, far under water's triple point of 611 Pa): wherever water is
// open to the sky there, its vapour pressure (611 Pa at 0 °C) has nothing to
// hold it down, so it boils at its surface, bubbles of vapour welling up and
// bursting, and its boiling carries off the heat that freezes it (src/ice.js
// setVacuum: the lead, the only hole in a crust nothing breaks, is kept open
// by the ocean welling up into it). The vapour rises over it, its grains of frost lit by
// the sun (src/boilingVapour.js).
//
// Each physics step (src/main.js simulate, so a seeded game boils alike at
// any frame rate) bursts BOIL.rate bubbles a square metre a second over the
// open water, on the average: in each hole's open water (src/ice.js holeAt;
// the lead's, a stone's new hole's until it skins over) when the water is
// frozen, over the whole patch's water when it is not. Each burst is a small
// dome thrown up on the solver (water.addSplat, BOIL.lift) and a boil of foam
// (water.addFoam: the water's shader draws a boil as bursting bubbles,
// src/shaders/scene.js FOAM_PATTERN), BOIL.radius across, gone in
// BOIL.lifetime. Its randomness is its own seeded stream (seededRandom, from
// the step's time), never Math.random. Nothing of it where there is air.
//
// A patch of open water bursts no more than BOIL.most a step, so a frame's stamps fit the
// solver's one pass (MAX_SPLATS, MAX_FOAM in src/spectralWater.js) down to
// about 45 frames a second: where more would boil (thawed, the whole
// patch's 36 m², about ten a step), BOIL.most bursts as many times wider
// in area, so as much of the water fizzes (a burst is about a solver texel
// across anyway: its stamp's σ is held to one at least). The lead and a
// stone's hole boil fewer than that, as they always did.
import { seededRandom } from './spray.js';
import { AIR_DENSITY } from './air.js';

export const BOIL = {
  rate: 70,               // bursts a square metre of open water a second
  radius: [0.003, 0.012], // m: a burst's radius (its splat's σ and its foam's)
  lift: [0.02, 0.05],     // m/s: the dome its vapour throws up, as an upward velocity on the solver
  foam: [0.06, 0.16],     // the boil of foam each leaves (the water's boil, a share of full): a fizz, not froth
  lifetime: 0.25,         // s: how long its foam lasts
  tries: 6,               // draws to find a point in a hole's open water before giving up on a burst
  most: 3,                // bursts a patch of open water a physics step at most (the header): wider beyond it
};

/** The shoelace area of a polygon's corners ([x, z, …], m²). */
function polygonArea(corners) {
  let area = 0;
  for (let index = 0, count = corners.length / 2, previous = count - 1; index < count; previous = index++) {
    area += corners[2 * previous] * corners[2 * index + 1] - corners[2 * index] * corners[2 * previous + 1];
  }
  return Math.abs(area) / 2;
}

/**
 * The boiling (the header). step(time, dt, { water, ice }) bursts what boils in the step from `time`; `bursts` counts
 * them since the last reset (tools read it).
 */
export class Boiling {
  constructor() {
    this.bursts = 0;
  }

  reset() {
    this.bursts = 0;
  }

  step(time, dt, { water, ice }) {
    if (AIR_DENSITY !== 0) return;
    const random = seededRandom(Math.round(time * 1e4), 0xb011);
    let widen = 1;   // a burst's radius against its own, where BOIL.most stands for more (the header)
    const allowed = (count) => {
      if (count <= BOIL.most) { widen = 1; return count; }
      widen = Math.sqrt(count / BOIL.most);
      return BOIL.most;
    };
    const burst = (x, z) => {
      const radius = widen * (BOIL.radius[0] + (BOIL.radius[1] - BOIL.radius[0]) * random());
      water.addSplat({ x, z, radius, velocity: BOIL.lift[0] + (BOIL.lift[1] - BOIL.lift[0]) * random() });
      water.addFoam({ x, z, radius, amount: BOIL.foam[0] + (BOIL.foam[1] - BOIL.foam[0]) * random(), lifetime: BOIL.lifetime, boil: true });
      this.bursts++;
    };
    if (!ice.on) {
      // Thawed: the whole patch's water boils (beyond the waterline, or outside the pool, nothing).
      const [minX, minZ] = water.domainMin, size = water.domainSize;
      const count = allowed(Math.floor(BOIL.rate * size * size * dt + random()));
      for (let index = 0; index < count; index++) {
        const x = minX + size * random(), z = minZ + size * random();
        if (ice.overWater(x, z)) burst(x, z);
      }
      return;
    }
    for (const hole of ice.holes) {
      if (hole.skin?.closed) continue;
      const corners = hole.corners;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let index = 0; index < corners.length; index += 2) {
        minX = Math.min(minX, corners[index]); maxX = Math.max(maxX, corners[index]);
        minZ = Math.min(minZ, corners[index + 1]); maxZ = Math.max(maxZ, corners[index + 1]);
      }
      const count = allowed(Math.floor(BOIL.rate * polygonArea(corners) * dt + random()));
      for (let index = 0; index < count; index++) {
        for (let attempt = 0; attempt < BOIL.tries; attempt++) {
          const x = minX + (maxX - minX) * random(), z = minZ + (maxZ - minZ) * random();
          if (ice.holeAt(x, z) !== hole) continue;
          burst(x, z);
          break;
        }
      }
    }
  }
}
