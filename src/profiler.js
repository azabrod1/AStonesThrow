// A profiling run on a real device: ?profile=1 on the page.
//
// Frame rates measured headless mean nothing (CLAUDE.md), and WebGL on
// phones has no GPU timer, so this measures the only way a phone allows: it
// switches parts of the frame off one at a time and times the frames that
// remain. Each step of PROFILE_STEPS runs with its `skip` flags applied
// (src/main.js honours them in simulate and render), waits WARM_UP_FRAMES,
// then averages the next MEASURED_FRAMES real frame times. The last step
// throws a stone first and measures through its splash. The difference
// between a step and "everything" is what that part costs; the splash step
// shows what a throw adds. The report goes to onProfile (the page shows it
// in the corner readout) and to the console, as milliseconds per frame.
// The quality stays fixed while profiling (?quality=, else medium), so the
// calibration cannot change the preset halfway through.

export const PROFILE_STEPS = [
  { name: 'everything', skip: {} },
  { name: 'no pond floor pass', skip: { floor: true } },
  { name: 'no water surface', skip: { surface: true } },
  { name: 'no splash solver (FFT)', skip: { solver: true } },
  { name: 'no wind waves (FFT)', skip: { ambient: true } },
  { name: 'no droplet passes, plain tone map', skip: { fluid: true } },
  { name: 'a quarter of the pixels', skip: { halfDensity: true } },
  { name: 'everything, during a splash', skip: {}, throwStone: true },
];
const WARM_UP_FRAMES = 15;
const MEASURED_FRAMES = 60;
const SPLASH_FRAMES = 90;

export class Profiler {
  /**
   * @param applySkips called with a step's skip flags (all false to restore)
   * @param throwStone throws the reference stone
   * @param onReport called with the lines of the report when every step is done
   */
  constructor({ applySkips, throwStone, onReport }) {
    this.applySkips = applySkips;
    this.throwStone = throwStone;
    this.onReport = onReport;
    this.stepIndex = -1;
    this.results = [];
    this.done = false;
    this.nextStep();
  }

  nextStep() {
    this.stepIndex++;
    this.frames = 0;
    this.seconds = 0;
    if (this.stepIndex >= PROFILE_STEPS.length) {
      this.done = true;
      this.applySkips({});
      const everything = this.results[0].milliseconds;
      const lines = this.results.map(({ name, milliseconds }) => {
        const saved = everything - milliseconds;
        const note = name === 'everything' ? `${(1000 / milliseconds).toFixed(0)} fps` : saved >= 0 ? `saves ${saved.toFixed(1)}` : `adds ${(-saved).toFixed(1)}`;
        return `${milliseconds.toFixed(1).padStart(6)} ms  ${name}  (${note})`;
      });
      console.log(['profile (ms per frame):', ...lines].join('\n'));
      this.onReport(lines);
      return;
    }
    const step = PROFILE_STEPS[this.stepIndex];
    this.applySkips(step.skip);
    if (step.throwStone) this.throwStone();
  }

  /** Once per rendered frame, with the real seconds since the previous one. */
  frame(frameSeconds) {
    if (this.done) return;
    this.frames++;
    if (this.frames <= WARM_UP_FRAMES) return;
    this.seconds += frameSeconds;
    const wanted = PROFILE_STEPS[this.stepIndex].throwStone ? SPLASH_FRAMES : MEASURED_FRAMES;
    if (this.frames - WARM_UP_FRAMES < wanted) return;
    this.results.push({ name: PROFILE_STEPS[this.stepIndex].name, milliseconds: (1000 * this.seconds) / wanted });
    this.nextStep();
  }
}
