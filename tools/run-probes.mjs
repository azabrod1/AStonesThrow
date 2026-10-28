// Runs the CPU probes (npm test) side by side, then any that failed again
// alone, and says which.
//
//   node tools/run-probes.mjs fish-probe.mjs "skip-probe.mjs 30" ...
//
// Each argument is a probe in tools/, with its own arguments after a space.
// They start in the order given, as many at once as the machine has cores
// (os.availableParallelism(), or PROBE_JOBS: PROBE_JOBS=1 runs them one after
// another, as npm test always did), so package.json lists the longest first:
// a long probe started last would finish alone. Each probe's output is held
// and printed whole when it ends, under a line with its name, its time and
// how it ended, so the outputs never interleave.
//
// A probe's checks are of two kinds. Most are computed: every probe seeds its
// own randomness, so they come out the same however busy the machine is.
// Some are budgets of wall-clock time (a frame's step, a skip's contact, the
// ice's break: fish, skip, ice, jet, snow, thing), written for a probe
// running alone, which another probe on the next core can break. So a probe
// that fails beside others is run again alone, once everything else has
// ended, and its verdict is that run's: a computed check fails again, and a
// budget passes or fails as it would have run alone. The summary names every
// probe run again and how that ended, so nothing is passed over unseen. It
// exits with 1 if any probe failed alone (or could not start).
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const probes = process.argv.slice(2).map((specification) => {
  const [file, ...probeArguments] = specification.split(' ').filter(Boolean);
  return { name: specification, file: path.join(toolsDirectory, file), probeArguments };
});
if (probes.length === 0) {
  console.error('run-probes: name the probes to run (package.json\'s test script lists them)');
  process.exit(1);
}
const jobs = Math.max(1, Number(process.env.PROBE_JOBS) || availableParallelism());

/** Runs one probe, its output held; resolves with its exit code, its output and its time (s). */
function run(probe) {
  return new Promise((resolve) => {
    const started = performance.now();
    const chunks = [];
    const child = spawn(process.execPath, [probe.file, ...probe.probeArguments], { cwd: path.dirname(toolsDirectory), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => chunks.push(Buffer.from(`run-probes: could not start ${probe.name}: ${error.message}\n`)));
    child.on('close', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), output: Buffer.concat(chunks).toString(), seconds: (performance.now() - started) / 1000 }));
  });
}

function report(probe, result, how) {
  const outcome = result.code === 0 ? 'passed' : `failed (exit ${result.code})`;
  process.stdout.write(`\n── ${probe.name}: ${outcome} in ${result.seconds.toFixed(1)} s${how} ──\n${result.output}`);
}

const started = performance.now();
console.log(`run-probes: ${probes.length} probes, ${Math.min(jobs, probes.length)} at a time`);
const results = new Map();
let nextIndex = 0;
async function worker() {
  while (nextIndex < probes.length) {
    const probe = probes[nextIndex++];
    const result = await run(probe);
    results.set(probe, result);
    report(probe, result, jobs > 1 ? ', beside others' : '');
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, probes.length) }, worker));

// Every failure again, alone, one after another.
const failedBeside = probes.filter((probe) => results.get(probe).code !== 0);
const alone = new Map();
if (jobs > 1) {
  for (const probe of failedBeside) {
    const result = await run(probe);
    alone.set(probe, result);
    report(probe, result, ', run again alone');
  }
}

const failed = probes.filter((probe) => (alone.get(probe) ?? results.get(probe)).code !== 0);
const totalSeconds = (performance.now() - started) / 1000;
const workSeconds = probes.reduce((sum, probe) => sum + results.get(probe).seconds, 0);
console.log(`\nrun-probes: ${probes.length - failed.length} of ${probes.length} passed in ${totalSeconds.toFixed(0)} s (${workSeconds.toFixed(0)} s of probes, ${Math.min(jobs, probes.length)} at a time)`);
for (const probe of failedBeside) {
  const second = alone.get(probe);
  if (second) console.log(`  ${probe.name}: failed beside others, ${second.code === 0 ? 'passed alone (a time budget the others crowded)' : 'failed again alone'}`);
}
if (failed.length) {
  console.log(`  failed: ${failed.map((probe) => probe.name).join(', ')}`);
  process.exit(1);
}
