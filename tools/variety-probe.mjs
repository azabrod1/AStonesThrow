// CPU probe of how splashes vary from throw to throw (src/splash.js
// chooseSplash and jetForm, src/jet.js forms, src/cavity.js seals and
// asymmetry, src/rock.js's stones), without a browser.
//
// Throws stones as the app does from the home view (src/main.js: the hand,
// the aim, the power; src/rock.js's own random shapes, tumbles and spins, the
// stone flown to the water), builds each splash with SplashSystem.impact
// against a stand-in pond and steps it as the app's frame loop does (frames
// of 1/60 s in substeps of 1/240 s, the geometry once per frame) to its end.
// Throw i is seeded as the shoot harness seeds a page (tools/shoot.mjs with
// --eval seeding Math.random just before the throw, Park–Miller from seed + i,
// the splash system already built), so a seed's throw here is that seed's
// throw there at the same aim and power, and a run repeats exactly. For each
// set of throws (by default the default 6 cm stone thrown normally, softly and
// hard at the reference aim, then a 16 cm stone and a 1.5 cm pebble thrown
// normally) it prints
//   - the stones: their elongation, flatness and irregularity, what touched
//     first (face, edge or point), how blunt it was there and the spin ratio
//     ω·R/V;
//   - the regimes: how often each jet form and each seal came up (with the
//     surface seal's chance, src/splash.js chooseSplash), and a jet leaning
//     more than LEANING_DEGREES;
//   - the jet: its top (the highest its column reached or its tip drops
//     reach, flown with the splash's own drag; the highest drop of 1.5 mm and
//     more too, the crown's included), the tip
//     beads (count and radii), its lean from
//     vertical, the hole's lopsidedness (the mouth's widest over its
//     narrowest while it is open) and the crown's height, overall and by form;
//   - the CPU cost per frame (mean, 95th percentile, worst);
// with --list, every throw of the first set on a line of its own (its seed,
// form, seal and the surface seal's chance, asymmetry, lean, top, tip beads),
// and checks, failing with exit code 1 if any check fails:
//   - no throw of the default stone at normal power makes an invisible
//     splash: its crown's rim rises at least VISIBLE_CROWN, and its jet's top
//     or its highest drop at least VISIBLE_JET; and a throw with no jet at all
//     stays rare there (at most NO_JET_SHARE: it needs a surface seal, which a
//     normal throw seldom makes);
//   - the default stone's throws are not all alike: at least four jet forms
//     come up at least MIN_SHARE of the time each and none more than
//     MAX_SHARE; the jet's top has a coefficient of variation of at least
//     MIN_HEIGHT_SPREAD; the tip beads take at least three counts; the lean
//     spreads by at least MIN_LEAN_SPREAD degrees (as a vector, its direction
//     varying too: the root of the summed variances of its two components).
//     Why these numbers: side by side, two jets whose heights differ by a
//     third look different at a glance (a jet 30 cm tall against one 40 cm
//     tall), so a spread of 0.3 means a typical pair of throws differs by
//     that much; before the forms (8dd8202) every default throw made the
//     same jet: its top spread by under 0.01, one tip bead, the lean the
//     aim sets (17°, back along the throw: spread 0°).
//
//   node tools/variety-probe.mjs [throws=200] [--seed=1] [--aim=x:z] [--sets=default|all|grid] [--list]
//
// --sets=default runs only the default stone's three sets (normal, soft and
// hard), leaving out the 16 cm stone and the pebble; --sets=grid runs every
// size of the slider (1.5, 4, 6, 8, 16 and 30 cm) at every power.
import * as THREE from 'three';
import { SplashSystem } from '../src/splash.js';
import { JetColumn } from '../src/jet.js';
import { Rock, throwFlightTime } from '../src/rock.js';

const option = (name, fallback) => { const hit = process.argv.find((argument) => argument.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const throwCount = Number(process.argv.slice(2).find((argument) => !argument.startsWith('--')) ?? 200);
const firstSeed = Number(option('seed', '1'));
const [aimX, aimZ] = option('aim', '0:-1.4').split(':').map(Number);
const setChoice = option('sets', 'all');
const allSets = setChoice === 'all';
const listing = process.argv.includes('--list');

const GRAVITY = 9.81;
const FRAME = 1 / 60;
const SUBSTEPS = 4;
const POND_DEPTH = 0.8;
const LEANING_DEGREES = 20;     // a jet leaning more than this from vertical counts as leaning
const VISIBLE_CROWN = 0.02;     // m: a crown's rim must rise at least this...
const VISIBLE_JET = 0.05;       // ...and its jet (or a drop) this, for a 6 cm stone (in proportion for others)
const NO_JET_SHARE = 0.05;
const MIN_SHARE = 0.05;
const MAX_SHARE = 0.6;
const MIN_HEIGHT_SPREAD = 0.3;
const MIN_LEAN_SPREAD = 5;

const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 60000);
camera.position.set(0, 1.15, 2.45);
camera.lookAt(0, 0.12, -1.0);
camera.updateMatrixWorld();
const hand = new THREE.Vector3(0.30, -0.32, -0.55).applyMatrix4(camera.matrixWorld);
const originalRandom = Math.random;

/** Math.random as the shoot harness seeds it (Park–Miller). */
function seedRandom(seed) {
  let state = seed;
  Math.random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}

function standIns() {
  const water = { heightTexture: null, domainMin: [-3, -4], domainSize: 6, uvOffset: 0.5 / 512, cell: 6 / 512, depth: POND_DEPTH, addSplat() {}, addFoam() {} };
  const lighting = { sunDirection: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Vector3(3, 2.85, 2.55), skyAmbient: new THREE.Vector3(0.36, 0.48, 0.66), absorb: new THREE.Vector3(), exposure: 0.55 };
  const splash = new SplashSystem({ environment: { cubeTexture: null }, lighting, water, ambientWaves: { uniforms: () => ({}) } });
  return { water, splash };
}

/** The splash system first (the page has one before the seed is set), then the seeded throw, flown to the water. */
function throwStone(radius, power, seed) {
  Math.random = originalRandom;
  const { water, splash } = standIns();
  seedRandom(seed);
  const target = new THREE.Vector3(aimX, 0, aimZ);
  const flightTime = throwFlightTime(hand, target, power, radius);
  const velocity = target.clone().sub(hand).divideScalar(flightTime);
  velocity.y += 0.5 * GRAVITY * flightTime;
  const rock = new Rock({ radius, position: hand, velocity, envTexture: null });
  for (let step = 0; step < 4 * 240; step++) {
    const impact = rock.update(FRAME / SUBSTEPS, POND_DEPTH);
    if (impact) return { impact, rock, water, splash };
  }
  throw new Error('the stone never reached the water');
}

// The tip beads each jet pinches off (a split tip's two halves count as two),
// and the highest they fly (their apex, flown from where they left with the
// splash's own drag and substep, src/splash.js update).
let tipRecord = null;
let tipApex = 0;
function apex(y, velocityX, velocityY, velocityZ, radius) {
  const step = FRAME / SUBSTEPS;
  let highest = y;
  while (velocityY > 0) {
    const drag = Math.min((0.00027 / radius) * Math.hypot(velocityX, velocityY, velocityZ) * step, 0.5);
    velocityX -= velocityX * drag; velocityY -= velocityY * drag; velocityZ -= velocityZ * drag;
    velocityY -= GRAVITY * step;
    y += velocityY * step;
    highest = Math.max(highest, y);
  }
  return highest;
}
const pinchTip = JetColumn.prototype.pinchTip;
JetColumn.prototype.pinchTip = function (splash) {
  const before = splash.count;
  const split = this.form.splitTip && this.tipDrops === 0;
  pinchTip.call(this, splash);
  if (!tipRecord) return;
  // The tip drop (or the two of a split tip) are the first drops this pinch spawned.
  for (let index = before; index < Math.min(before + (split ? 2 : 1), splash.count); index++) {
    tipRecord.push(splash.radii[index]);
    tipApex = Math.max(tipApex, apex(splash.positions[index * 3 + 1], splash.velocities[index * 3], splash.velocities[index * 3 + 1], splash.velocities[index * 3 + 2], splash.radii[index]));
  }
};

function runThrow(radius, power, seed) {
  const { impact, rock, water, splash } = throwStone(radius, power, seed);
  tipRecord = [];
  tipApex = 0;
  splash.impact(impact, water);
  const choice = splash.lastChoice;
  const cavity = splash.cavities[0];
  const crown = splash.crowns.find((candidate) => !candidate.landing && !candidate.fan);
  const result = {
    seed, impact, regime: choice.regime, seal: choice.seal.kind, surfaceChance: choice.surfaceChance ?? 0, asymmetry: choice.asymmetry,
    lean: THREE.MathUtils.radToDeg(Math.atan(Math.hypot(choice.lean.x, choice.lean.z))),
    leanVector: [THREE.MathUtils.radToDeg(Math.atan(choice.lean.x)), THREE.MathUtils.radToDeg(Math.atan(choice.lean.z))],
    jetTop: 0, dropTop: 0, crownTop: 0, lopsided: 1, frames: [],
  };
  const columns = new Set();
  for (let frame = 0; frame < 6 * 60; frame++) {
    const started = performance.now();
    splash.setFrameSeconds(FRAME);
    for (let substep = 0; substep < SUBSTEPS; substep++) {
      rock.update(FRAME / SUBSTEPS, POND_DEPTH);
      splash.update(FRAME / SUBSTEPS, water);
    }
    splash.prepareFrame();
    const spent = performance.now() - started;
    if (splash.count > 0 || splash.crowns.length > 0 || splash.columns.length > 0) result.frames.push(spent);
    if (splash.crowns.includes(crown)) for (let vertex = 1; vertex < crown.positions.length; vertex += 3) result.crownTop = Math.max(result.crownTop, crown.positions[vertex]);
    for (const column of splash.columns) {
      columns.add(column);
      result.jetTop = Math.max(result.jetTop, column.positions[1]);
    }
    for (let index = 0; index < splash.count; index++) if (splash.radii[index] >= 0.0015) result.dropTop = Math.max(result.dropTop, splash.positions[index * 3 + 1]);
    if (cavity && splash.cavities.includes(cavity) && cavity.age < cavity.pinchTime && cavity.lip.mouth > 0.9 * cavity.radius) {
      const shapes = Array.from(cavity.columnShape);
      result.lopsided = Math.max(result.lopsided, Math.max(...shapes) / Math.min(...shapes));
    }
    if (splash.time > 1.5 && !splash.inMotion) break;
  }
  result.tipBeads = tipRecord.slice();
  result.jetTop = Math.max(result.jetTop, tipApex);
  result.columns = columns.size;
  tipRecord = null;
  return result;
}

const percent = (share) => `${(100 * share).toFixed(0)}%`;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const deviation = (values) => { const average = mean(values); return Math.sqrt(mean(values.map((value) => (value - average) ** 2))); };
const quantile = (values, share) => { const sorted = [...values].sort((first, second) => first - second); return sorted[Math.min(Math.floor(share * sorted.length), sorted.length - 1)]; };
const spread = (values, unit = 1, digits = 1) => `${(quantile(values, 0.1) * unit).toFixed(digits)} / ${(quantile(values, 0.5) * unit).toFixed(digits)} / ${(quantile(values, 0.9) * unit).toFixed(digits)}`;
const tally = (values) => { const counts = {}; for (const value of values) counts[value] = (counts[value] ?? 0) + 1; return counts; };
const shares = (counts, total) => Object.entries(counts).sort((first, second) => second[1] - first[1]).map(([name, count]) => `${name} ${percent(count / total)}`).join(', ');

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };

// Warm up (the code, not the statistics: each throw is seeded on its own).
for (let warmUp = 0; warmUp < 4; warmUp++) runThrow(0.03, 'normal', 1000000 + warmUp);

// --sets=grid: the slider's sizes, each thrown softly, normally and hard (the
// seal and the forms' odds across them), with the default stone's checks.
const GRID_SIZES = [1.5, 4, 6, 8, 16, 30];
const sets = setChoice === 'grid'
  ? GRID_SIZES.flatMap((diameter) => ['soft', 'normal', 'hard'].map((power) => ({ label: `${diameter} cm stone, ${power} power`, radius: diameter / 200, power, checked: diameter === 6 && power === 'normal' })))
  : [
    { label: '6 cm stone, normal power', radius: 0.03, power: 'normal', checked: true },
    { label: '6 cm stone, soft power', radius: 0.03, power: 'soft' },
    { label: '6 cm stone, hard power', radius: 0.03, power: 'hard' },
    ...(allSets ? [
      { label: '16 cm stone, normal power', radius: 0.08, power: 'normal' },
      { label: '1.5 cm pebble, normal power', radius: 0.0075, power: 'normal' },
    ] : []),
  ];
console.log(`${throwCount} throws a set at (${aimX}, ${aimZ}), seeds ${firstSeed} to ${firstSeed + throwCount - 1} (Park–Miller); frames of 1/60 s in ${SUBSTEPS} substeps`);
for (const [setIndex, set] of sets.entries()) {
  const results = [];
  for (let index = 0; index < throwCount; index++) results.push(runThrow(set.radius, set.power, firstSeed + index));
  const scale = set.radius / 0.03;
  const speeds = results.map((result) => result.impact.speed);
  const angles = results.map((result) => THREE.MathUtils.radToDeg(Math.asin(Math.min(Math.hypot(result.impact.velocity.x, result.impact.velocity.z) / result.impact.speed, 1))));
  console.log(`\n${set.label}: enters at ${spread(speeds, 1, 2)} m/s, ${spread(angles, 1, 0)}° from vertical (10th / 50th / 90th percentiles)`);
  console.log(`  stones: elongation ${spread(results.map((result) => result.impact.shape.elongation), 1, 2)}, flatness ${spread(results.map((result) => result.impact.shape.flatness), 1, 2)}, irregularity ${spread(results.map((result) => result.impact.shape.irregularity), 1, 3)}; first contact ${shares(tally(results.map((result) => result.impact.contact.kind)), throwCount)}; bluntness ${spread(results.map((result) => result.impact.contact.bluntness), 1, 2)}; spin ratio ${spread(results.map((result) => result.impact.spin.ratio), 1, 3)}`);
  const regimes = tally(results.map((result) => result.regime));
  const leaning = results.filter((result) => result.lean > LEANING_DEGREES).length;
  console.log(`  jet forms: ${shares(regimes, throwCount)}; leaning more than ${LEANING_DEGREES}°: ${percent(leaning / throwCount)}`);
  console.log(`  seals: ${shares(tally(results.map((result) => result.seal)), throwCount)} (the surface seal's chance ${spread(results.map((result) => result.surfaceChance), 100, 0)}%); asymmetry ${spread(results.map((result) => result.asymmetry), 1, 2)}; the mouth's widest over narrowest ${spread(results.map((result) => result.lopsided), 1, 2)}`);
  const tops = results.map((result) => result.jetTop);
  const tipCounts = tally(results.map((result) => result.tipBeads.length));
  const tipRadii = results.flatMap((result) => result.tipBeads);
  console.log(`  jet top ${spread(tops, 100, 1)} cm (mean ${(100 * mean(tops)).toFixed(1)}, spread ${(deviation(tops) / Math.max(mean(tops), 1e-9)).toFixed(2)}); highest drop ${spread(results.map((result) => result.dropTop), 100, 1)} cm; crown ${spread(results.map((result) => result.crownTop), 100, 1)} cm`);
  // The lean's spread as a vector (its direction varies as well as its angle): the root of the variances of its two components.
  const leanSpread = Math.hypot(deviation(results.map((result) => result.leanVector[0])), deviation(results.map((result) => result.leanVector[1])));
  console.log(`  tip beads: ${shares(tipCounts, throwCount)} (counts); radii ${tipRadii.length ? spread(tipRadii, 1000, 1) : '-'} mm; lean ${spread(results.map((result) => result.lean), 1, 0)}° (spread as a vector ${leanSpread.toFixed(1)}°); two columns ${percent(results.filter((result) => result.columns > 1).length / throwCount)}`);
  for (const regime of Object.keys(regimes)) {
    const ofRegime = results.filter((result) => result.regime === regime);
    console.log(`    ${regime.padEnd(8)} top ${spread(ofRegime.map((result) => result.jetTop), 100, 1)} cm, tip beads ${mean(ofRegime.map((result) => result.tipBeads.length)).toFixed(1)}, lean ${mean(ofRegime.map((result) => result.lean)).toFixed(0)}°, highest drop ${(100 * mean(ofRegime.map((result) => result.dropTop))).toFixed(1)} cm`);
  }
  const frames = results.flatMap((result) => result.frames);
  console.log(`  CPU: ${mean(frames).toFixed(2)} ms per frame on average, 95th percentile ${quantile(frames, 0.95).toFixed(2)}, worst ${Math.max(...frames).toFixed(2)} ms`);
  if (listing && setIndex === 0) {
    for (const result of results) {
      console.log(`    seed ${result.seed}: ${result.regime} (${result.seal} seal; the surface seal's chance ${(100 * result.surfaceChance).toFixed(0)}%), asymmetry ${result.asymmetry.toFixed(2)}, lean ${result.lean.toFixed(0)}°, top ${(100 * result.jetTop).toFixed(1)} cm, highest drop ${(100 * result.dropTop).toFixed(1)} cm, tip beads ${result.tipBeads.map((bead) => (1000 * bead).toFixed(1)).join(' ') || 'none'}; ${result.impact.contact.kind} first, spin ratio ${result.impact.spin.ratio.toFixed(3)}`);
    }
  }
  if (set.checked) {
    for (const result of results) {
      check(result.crownTop >= VISIBLE_CROWN * scale && Math.max(result.jetTop, result.dropTop) >= VISIBLE_JET * scale,
        `${set.label}: seed ${result.seed} is all but invisible (crown ${(100 * result.crownTop).toFixed(1)} cm, jet ${(100 * result.jetTop).toFixed(1)} cm, highest drop ${(100 * result.dropTop).toFixed(1)} cm)`);
    }
    check((regimes.none ?? 0) <= NO_JET_SHARE * throwCount, `${set.label}: ${percent((regimes.none ?? 0) / throwCount)} of the throws make no jet, over ${percent(NO_JET_SHARE)}`);
    const common = Object.values(regimes).filter((count) => count >= MIN_SHARE * throwCount).length;
    check(common >= 4, `${set.label}: only ${common} jet forms come up ${percent(MIN_SHARE)} of the time or more`);
    check(Math.max(...Object.values(regimes)) <= MAX_SHARE * throwCount, `${set.label}: one jet form comes up more than ${percent(MAX_SHARE)} of the time`);
    const heightSpread = deviation(tops) / Math.max(mean(tops), 1e-9);
    check(heightSpread >= MIN_HEIGHT_SPREAD, `${set.label}: the jet's top spreads by ${heightSpread.toFixed(2)} of its mean, under ${MIN_HEIGHT_SPREAD}`);
    check(Object.keys(tipCounts).length >= 3, `${set.label}: the tip beads take only ${Object.keys(tipCounts).length} counts`);
    check(leanSpread >= MIN_LEAN_SPREAD, `${set.label}: the lean spreads by ${leanSpread.toFixed(1)}°, under ${MIN_LEAN_SPREAD}°`);
  }
}
console.log(failures.length === 0 ? '\nvariety-probe: all checks pass' : `\nvariety-probe: ${failures.length} checks fail:\n  ${failures.slice(0, 20).join('\n  ')}`);
process.exitCode = failures.length === 0 ? 0 : 1;
