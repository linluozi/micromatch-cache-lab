'use strict';
/**
 * Counts how many times a glob is actually compiled (parsed + regex built).
 * This is the evidence that the repeated work exists, and that the patch
 * removes it. Run with:
 *   node bench/count-compiles.js
 */
const picomatch = require('picomatch');

const originalMakeRe = picomatch.makeRe;
let compiles = 0;
picomatch.makeRe = function (...args) {
  compiles++;
  return originalMakeRe.apply(this, args);
};

const baseline = require('../vendor/micromatch-4.0.4');
const patched = require('../vendor/micromatch-4.0.4-cached');

const files = Array.from({ length: 1000 }, (_, i) => `src/a/b/file-${i}.${i % 2 ? 'js' : 'ts'}`);
const pattern = 'src/**/*.{js,ts}';

const measure = (label, fn) => {
  compiles = 0;
  fn();
  return { label, compiles };
};

const cases = [
  ['mm(list, pattern)          ', mm => measure('', () => mm(files, pattern))],
  ['isMatch x N (same pattern) ', mm => measure('', () => files.forEach(f => mm.isMatch(f, pattern)))],
  ['matcher() x N              ', mm => measure('', () => { for (let i = 0; i < 100; i++) mm.matcher(pattern); })],
  ['some() x N                 ', mm => measure('', () => { for (let i = 0; i < 100; i++) mm.some(files, pattern); })],
  ['every() x N                ', mm => measure('', () => { for (let i = 0; i < 100; i++) mm.every(files, pattern); })],
  ['all() x N                  ', mm => measure('', () => { for (let i = 0; i < 100; i++) mm.all(files[0], pattern); })],
  ['isMatch, unique patterns   ', mm => measure('', () => { for (let i = 0; i < 1000; i++) mm.isMatch(files[i], `src/**/file-${i}.{js,ts}`); })]
];

const rows = [];
for (const [label, run] of cases) {
  const b = run(baseline);
  patched.matcherCache.clear();
  const p = run(patched);
  const stats = patched.matcherCache.stats;
  rows.push({
    case: label.trim(),
    baselineCompiles: b.compiles,
    patchedCompiles: p.compiles,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits + stats.misses === 0 ? '0%' : ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) + '%'
  });
}

console.table(rows);
console.log('\nmatcherCache size after run:', patched.matcherCache.size, '/', patched.matcherCache.stats.max);

// Machine-readable copy for the chart generator.
const fs = require('fs');
const path = require('path');
const outDir = path.join(__dirname, '..', 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'compiles.json'), JSON.stringify(rows, null, 2));
