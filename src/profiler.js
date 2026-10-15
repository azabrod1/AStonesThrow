// A profiling run on a real device: ?profile=1 on the page.
//
// Frame rates measured headless mean nothing (CLAUDE.md), and WebGL on
// phones has no GPU timer, so this measures the way a phone allows: it
// switches parts of the frame off one at a time and times the frames that
// remain, against frames with everything on measured just before and after.
// src/main.js honours each step's `skip` flags in simulate and render, holds
// the quality fixed while profiling (?quality=, else medium) and never caps
// the frame rate.
//
// The protocol (SCHEDULE):
//   1. The floor: frames that neither simulate nor draw (the frame loop
//      returns at once). It is what the browser gives an empty
//      requestAnimationFrame: about 16.7 ms on a 60 Hz display; 33 ms means
//      the browser caps frames at 30 (iOS does in Low Power Mode), and then
//      no step below can read less, whatever it costs.
//   2. Steps on the still pond (cleared first, so the solver sleeps), then
//      steps of a splash, each variant between two baselines: baseline,
//      variant, baseline, variant, ... A variant is reported against the
//      mean of the two baselines around it, so a drift (heat, the battery)
//      cancels.
//   3. Every splash step replays the same throw: the pond is cleared, Math.random
//      is seeded (SEED) from the throw to the step's end, and the simulation
//      advances 1/60 s per frame whatever the frame rate, so every replay
//      simulates the same frames. Its frames are measured from the impact.
//   4. For every step, medians over its measured frames: the interval
//      between frames from the browser's own timestamps (unclamped; the
//      simulation keeps its 0.1 s clamp), the JS time spent in simulate and
//      in render (performance.now around each: the CPU's part, not the
//      GPU's), and the draw calls and triangles (renderer.info). The
//      browser's timestamps come in whole display frames, so the median
//      interval moves in steps of one (16.7 ms at 60 Hz); the mean interval,
//      in brackets, shows what falls between.
// The report ends with the memory the render targets hold (an estimate from
// their formats, src/gpu.js) and renderer.info.memory. It goes to onReport
// (the page shows it in the corner readout) and to the console.

const IDLE_VARIANTS = [
  { name: 'no pond floor pass', skip: { floor: true } },
  { name: 'no water surface', skip: { surface: true } },
  { name: 'no wind waves', skip: { ambient: true } },
  { name: 'solver kept awake', skip: { sleep: true } },
  { name: 'a quarter of the pixels', skip: { halfDensity: true } },
];
const SPLASH_VARIANTS = [
  { name: 'no droplet passes', skip: { fluid: true } },
  { name: 'no mirror pass', skip: { mirror: true } },
  { name: 'no cavity drawn', skip: { cavity: true } },
  { name: 'no splash solver', skip: { solver: true } },
];
const interleave = (baseline, variants) => [baseline, ...variants.flatMap((variant) => [variant, baseline])];
export const SCHEDULE = [
  { name: 'empty frames', empty: true },
  ...interleave({ name: 'idle', baseline: true, skip: {} }, IDLE_VARIANTS).map((step) => ({ ...step, clearFirst: true })),
  ...interleave({ name: 'splash', baseline: true, skip: {} }, SPLASH_VARIANTS).map((step) => ({ ...step, throwStone: true })),
];
const WARM_UP_FRAMES = 15;    // dropped at the start of a step (after the impact, for a splash step)
const MEASURED_FRAMES = 60;   // a still pond's step
const SPLASH_FRAMES = 60;     // a splash step's, from the impact: one second of splash
const FLIGHT_FRAMES = 120;    // a throw that has not landed by then is measured anyway
const SEED = 20251015;
const FRAME_SECONDS = 1 / 60;

const mean = (values) => (values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length);
const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : 0.5 * (sorted[middle - 1] + sorted[middle]);
};

/** A seeded Math.random (mulberry32). */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export class Profiler {
  /**
   * @param applySkips called with a step's skip flags (all false to restore)
   * @param throwStone throws the reference stone
   * @param hasImpacted whether the stone has reached the water
   * @param clearPond back to still water at time zero (no stones, no splash, the solver asleep)
   * @param describe a line naming the quality and resolution
   * @param memory the render targets' bytes by owner, and renderer.info.memory
   * @param onReport called with the lines of the report when every step is done
   */
  constructor({ applySkips, throwStone, hasImpacted, clearPond, describe, memory, onReport }) {
    Object.assign(this, { applySkips, throwStone, hasImpacted, clearPond, describe, memory, onReport });
    this.stepIndex = -1;
    this.results = [];
    this.done = false;
    this.originalRandom = null;
    this.nextStep();
  }

  get step() { return SCHEDULE[this.stepIndex]; }

  /** The frame loop draws nothing while this is true (the floor). */
  get emptyFrames() { return !this.done && Boolean(this.step?.empty); }

  /** Simulated seconds per frame while profiling: fixed, so every replay does the same work. */
  get fixedSeconds() { return this.done ? undefined : FRAME_SECONDS; }

  nextStep() {
    this.restoreRandom();
    this.stepIndex++;
    this.samples = [];
    this.frames = 0;
    this.impactFrame = null;
    if (this.stepIndex >= SCHEDULE.length) {
      this.finish();
      return;
    }
    const step = this.step;
    this.applySkips(step.skip ?? {});
    if (step.clearFirst || step.throwStone) this.clearPond();
    if (step.throwStone) {
      this.originalRandom = Math.random;
      Math.random = seededRandom(SEED);
      this.throwStone();
    }
  }

  restoreRandom() {
    if (this.originalRandom) Math.random = this.originalRandom;
    this.originalRandom = null;
  }

  /**
   * Once per requestAnimationFrame that the loop handles: { interval } in
   * seconds since the previous one (unclamped), and the frame's JS
   * milliseconds in simulate and render, draw calls and triangles.
   */
  frame(sample) {
    if (this.done) return;
    this.frames++;
    const step = this.step;
    if (step.throwStone) {
      if (this.impactFrame === null) {
        if (this.hasImpacted() || this.frames > FLIGHT_FRAMES) this.impactFrame = this.frames;
        return;
      }
      if (this.frames - this.impactFrame < 1) return;
      this.samples.push(sample);
      if (this.samples.length >= SPLASH_FRAMES) this.endStep();
      return;
    }
    if (this.frames <= WARM_UP_FRAMES) return;
    this.samples.push(sample);
    if (this.samples.length >= MEASURED_FRAMES) this.endStep();
  }

  endStep() {
    const pick = (key) => median(this.samples.map((sample) => sample[key]));
    this.results.push({
      step: this.step,
      milliseconds: 1000 * pick('interval'),
      meanMilliseconds: 1000 * mean(this.samples.map((sample) => sample.interval)),
      simulate: pick('simulateMilliseconds'),
      render: pick('renderMilliseconds'),
      calls: pick('calls'),
      triangles: pick('triangles'),
    });
    this.nextStep();
  }

  finish() {
    this.done = true;
    this.restoreRandom();
    this.applySkips({});
    this.clearPond();
    const lines = [`profile · ${this.describe()}`];
    const consoleLines = [...lines];
    const javascript = (result) => `js ${result.simulate.toFixed(1)}+${result.render.toFixed(1)}`;
    const work = (result) => `${Math.round(result.calls)} calls ${(result.triangles / 1000).toFixed(0)}k tri`;
    for (const [index, result] of this.results.entries()) {
      const { step } = result;
      if (step.empty) {
        const line = `floor ${result.milliseconds.toFixed(1)} ms (${(1000 / result.milliseconds).toFixed(0)} fps, empty frames)`;
        lines.push(line);
        consoleLines.push(line);
        continue;
      }
      if (step.baseline) {
        // A group (the still pond, the splash) is headed by its first baseline, with the medians of all of them.
        if (this.results.findIndex((other) => other.step.name === step.name) !== index) continue;
        const group = this.results.filter((other) => other.step.name === step.name);
        const typical = Object.fromEntries(['milliseconds', 'meanMilliseconds', 'simulate', 'render', 'calls', 'triangles'].map((key) => [key, median(group.map((other) => other[key]))]));
        const line = `${step.name} ${typical.milliseconds.toFixed(1)} ms (${typical.meanMilliseconds.toFixed(1)}) ${javascript(typical)} ${work(typical)}`;
        lines.push(line);
        consoleLines.push(`${line}  (baselines ${group.map((other) => other.milliseconds.toFixed(1)).join(', ')})`);
        continue;
      }
      const before = this.results[index - 1];
      const after = this.results[index + 1];
      const reference = 0.5 * (before.milliseconds + (after ?? before).milliseconds);
      const change = result.milliseconds - reference;
      const line = ` ${step.name} ${result.milliseconds.toFixed(1)} (${result.meanMilliseconds.toFixed(1)}) ${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)} ${javascript(result)}`;
      lines.push(line);
      consoleLines.push(`${line} ${work(result)}  (against ${reference.toFixed(1)})`);
    }
    const memory = this.memory();
    const megabytes = (bytes) => (bytes / 1048576).toFixed(1);
    lines.push(`targets ${megabytes(memory.total)} MB: solver ${megabytes(memory.solver)} wind ${megabytes(memory.wind)} scene ${megabytes(memory.scene)} splash ${megabytes(memory.splash)} sky ${megabytes(memory.sky)} floor ${megabytes(memory.floor)}`);
    lines.push(`textures ${memory.textures}, geometries ${memory.geometries}`);
    consoleLines.push(...lines.slice(-2));
    console.log(['profile (median ms per frame, the mean in brackets; js: simulate + render ms):', ...consoleLines].join('\n'));
    this.onReport(lines);
  }
}
