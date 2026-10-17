'use strict';

/**
 * Runs exactly one benchmark cell in its own process.
 * Usage: node bench/runner.js <cellId>
 *
 * Protocol: for every round, all variants are measured back to back in a
 * rotating order, so slow drift (thermal, GC, frequency scaling) hits every
 * variant inside the same round. Ratios are computed per round; the report
 * uses the median ratio, never a ratio of absolute medians.
 */

const { CELLS } = require('./scenarios');

const cellId = process.argv[2];
const cell = CELLS.find(c => c.id === cellId);
if (!cell) {
  console.error(`Unknown cell: ${cellId}`);
  process.exit(2);
}

const baseline = require('../vendor/micromatch-4.0.4');
const patched = require('../vendor/micromatch-4.0.4-cached');

const now = () => Number(process.hrtime.bigint()) / 1e6;

const bestOf = (times, fn) => {
  let best = Infinity;
  for (let i = 0; i < times; i++) {
    const t0 = now();
    fn();
    const dt = now() - t0;
    if (dt < best) best = dt;
  }
  return best;
};

const ROUNDS = 9;
const REPS = 3;

// Warm up both implementations before any measurement.
cell.run(baseline, 'warm');
cell.run(patched, 'warm');

// Steady-state hit rate from a dedicated warm pass (cold mode resets stats).
patched.matcherCache.clear();
cell.run(patched, 'warm');
const stats = patched.matcherCache.stats;
const lookups = stats.hits + stats.misses;

const result = {
  cell: cell.id,
  label: cell.label,
  ops: cell.ops,
  rounds: ROUNDS,
  baseline: [],
  warm: [],
  cold: [],
  stats: {
    hits: stats.hits,
    misses: stats.misses,
    evictions: stats.evictions,
    hitRate: lookups === 0 ? null : stats.hits / lookups,
    size: stats.size,
    max: stats.max
  }
};

const reps = cell.reps || REPS;
const measureBaseline = () => bestOf(reps, () => cell.run(baseline, 'warm'));
const measureWarm = () => bestOf(reps, () => cell.run(patched, 'warm'));
const measureCold = () => bestOf(1, () => cell.run(patched, 'cold'));

for (let round = 0; round < ROUNDS; round++) {
  const order = round % 3;
  if (order === 0) {
    result.baseline.push(measureBaseline());
    result.warm.push(measureWarm());
    if (cell.id !== 's2-unique') result.cold.push(measureCold());
  } else if (order === 1) {
    if (cell.id !== 's2-unique') result.cold.push(measureCold());
    result.warm.push(measureWarm());
    result.baseline.push(measureBaseline());
  } else {
    result.warm.push(measureWarm());
    result.baseline.push(measureBaseline());
    if (cell.id !== 's2-unique') result.cold.push(measureCold());
  }
}

process.stdout.write(JSON.stringify(result));
