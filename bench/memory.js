'use strict';

/**
 * Memory / allocation cost of the compile cache.
 * Must be run with --expose-gc:
 *   node --expose-gc bench/memory.js <variant> <mode> <kind>
 *
 * variant: baseline | patched
 * mode:    fill | loop | unique
 * kind:    simple | brace | extglob
 *
 * All measurement loops live inside functions on purpose: top-level loops are
 * not optimised by V8 and report ~5x inflated per-call numbers.
 */

const variant = process.argv[2];
const mode = process.argv[3];
const kind = process.argv[4] || 'simple';

const mm = require(variant === 'patched'
  ? '../vendor/micromatch-4.0.4-cached'
  : '../vendor/micromatch-4.0.4');
const { S2 } = require('./scenarios');

const gc = () => {
  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }
};

const heap = () => process.memoryUsage().heapUsed;

const PATTERNS = {
  simple: i => `file-${i}.js`,
  brace: i => `src/pkg-${i}/**/*.{js,ts}`,
  extglob: i => `src/pkg-${i}/**/!(*.test|*.spec).@(js|ts)`
};

const makePattern = PATTERNS[kind];
const TARGET = 'src/pkg-1/module-2/file-2.js';

// Both warmup and measurement call the same function so V8 optimises the
// exact loop that is being timed.
const uniquePass = calls => {
  for (let i = 0; i < calls.length; i++) mm.isMatch(calls[i][0], calls[i][1]);
};

const loopPass = (n, pattern, sample) => {
  let peak = 0;
  for (let i = 0; i < n; i++) {
    mm.isMatch(TARGET, pattern);
    if (sample && i % 5000 === 0) peak = Math.max(peak, process.memoryUsage().heapUsed);
  }
  return peak;
};

const runFill = () => {
  const N = mm.matcherCache ? mm.matcherCache.stats.max : 1000;
  if (mm.matcherCache) mm.matcherCache.clear();
  gc();
  const before = heap();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const pattern = makePattern(i);
    mm.isMatch(TARGET, pattern);
    mm.isMatch(TARGET, pattern); // second use admits it
  }
  const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
  gc();
  const after = heap();
  const stats = mm.matcherCache ? mm.matcherCache.stats : null;

  return {
    variant, mode, kind,
    entries: N,
    seconds: elapsed,
    cacheSize: mm.matcherCache ? mm.matcherCache.size : 0,
    heapDeltaBytes: after - before,
    bytesPerEntry: mm.matcherCache && mm.matcherCache.size
      ? Math.round((after - before) / mm.matcherCache.size)
      : null,
    stats
  };
};

const runLoop = () => {
  const N = 200000;
  const pattern = 'src/**/*.{js,ts}';
  if (mm.matcherCache) mm.matcherCache.clear();
  loopPass(2000, pattern, false);
  // No gc() here: a forced full GC flushes V8's RegExp compile cache and
  // inflates the compile path ~5x. Heap deltas are still taken after the run.
  const before = heap();
  const t0 = process.hrtime.bigint();
  const peak = loopPass(N, pattern, true);
  const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
  gc();
  const after = heap();

  return {
    variant, mode, kind,
    calls: N,
    seconds: elapsed,
    usPerCall: (elapsed * 1000) / N,
    heapBefore: before,
    heapAfter: after,
    heapPeak: peak,
    heapPeakDelta: peak - before,
    retainedDelta: after - before,
    cacheSize: mm.matcherCache ? mm.matcherCache.size : 0
  };
};

const runUnique = () => {
  const calls = S2.calls;
  const N = calls.length;
  if (mm.matcherCache) mm.matcherCache.clear();
  // Two full warmup passes on the identical code path, then a clean cache.
  uniquePass(calls);
  uniquePass(calls);
  if (mm.matcherCache) mm.matcherCache.clear();
  const before = heap();
  let peak = before;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    mm.isMatch(calls[i][0], calls[i][1]);
    if (i % 500 === 0) peak = Math.max(peak, heap());
  }
  const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
  gc();
  const after = heap();

  return {
    variant, mode, kind,
    calls: N,
    seconds: elapsed,
    usPerCall: (elapsed * 1000) / N,
    heapPeakDelta: peak - before,
    retainedDelta: after - before,
    cacheSize: mm.matcherCache ? mm.matcherCache.size : 0,
    stats: mm.matcherCache ? mm.matcherCache.stats : null
  };
};

const runners = { fill: runFill, loop: runLoop, unique: runUnique };
const result = runners[mode]();
process.stdout.write(JSON.stringify(result));
