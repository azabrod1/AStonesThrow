// The clock the CPU probes' budgets are timed on: what a piece of work costs
// the process's main thread, not how long it waited for a core.
//
// A budget timed on the wall clock (performance.now()) holds for a probe run
// alone on an idle machine. Beside other probes (npm test runs them side by
// side, tools/run-probes.mjs) or beside another job on the machine (the
// pre-push hook runs wherever the work is going on), the process spends part
// of the time waiting for a core, and the wait lands in whatever is being
// timed: in the container a fish's frame read 222 µs where it costs 30 to 50,
// and a step of the ice's clock 74 ms where it costs 2 to 8.
//
// The process's CPU time (process.cpuUsage()) stops while it waits, but it
// also counts V8's helper threads, which compile and collect beside the main
// thread without holding it up: their time is added in lumps of up to a
// scheduler tick (4 ms in the container) whenever the kernel takes stock of
// them. Each clock can only overstate the main thread's own time over an
// interval, never understate it: a thread cannot run for longer than the time
// that passes, and the process's time holds the calling thread's exactly
// (Linux brings the caller's up to date before it sums the threads: kernel/
// sched/cputime.c, thread_group_cputime). So the lesser of the two is the
// tighter bound, and it is overstated only when both are at once.
// (process.threadCpuUsage() would count the main thread alone, but Linux reads
// one thread's time as of its last tick or switch, so it moves in 4 ms steps:
// too coarse for the 10 µs steps some probes time.)
//
// A busy machine still slows the work itself (another process on the same
// core's caches, a hyperthread's sibling), so a budget keeps its room.
//
//   const started = costClock();
//   ...the work...
//   const milliseconds = costSince(started);
//
// costBetween(start, end) times between two readings, for a frame timed in
// parts (tools/jet-probe.mjs).

const processMilliseconds = () => {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
};

/** A reading of both clocks, to time from. */
export function costClock() {
  return { wall: performance.now(), cpu: processMilliseconds() };
}

/** Milliseconds of the main thread's time between two readings (costClock): the lesser of the wall's and the process's CPU's. */
export function costBetween(start, end) {
  return Math.min(end.wall - start.wall, end.cpu - start.cpu);
}

/** Milliseconds of the main thread's time since `start` (costClock()). */
export function costSince(start) {
  return costBetween(start, costClock());
}
