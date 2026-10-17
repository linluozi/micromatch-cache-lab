'use strict';
/**
 * Exploratory probe (NOT the final benchmark).
 * Q1: How much of a repeated mm.isMatch() call is compilation?
 * Q2: Does mm(list, pattern) already amortise compile across the list?
 * Q3: What does a compile cost for simple vs complex patterns?
 */
const mm = require('micromatch');
const picomatch = require('picomatch');

const hr = () => process.hrtime.bigint();
const ms = (a, b) => Number(b - a) / 1e6;

function bestOf(n, fn) {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = hr();
    fn();
    const dt = ms(t0, hr());
    if (dt < best) best = dt;
  }
  return best;
}

const patterns = {
  simple: '*.js',
  brace: 'src/**/*.{js,jsx,ts,tsx}',
  extglob: 'src/**/!(*.test|*.spec).@(js|ts)',
  globstar: '**/*.js'
};

const files = Array.from({ length: 20000 }, (_, i) => `src/a/b/c/file-${i}.${i % 2 ? 'js' : 'ts'}`);

console.log('--- compile cost (best of 200) ---');
for (const [name, p] of Object.entries(patterns)) {
  const t = bestOf(200, () => picomatch(p));
  const tRe = bestOf(200, () => picomatch.makeRe(p));
  console.log(`${name.padEnd(9)} picomatch(): ${t.toFixed(4)} ms   makeRe(): ${tRe.toFixed(4)} ms`);
}

console.log('\n--- per-match cost (matcher compiled once) ---');
for (const [name, p] of Object.entries(patterns)) {
  const m = picomatch(p);
  const t = bestOf(50, () => { for (const f of files) m(f); });
  console.log(`${name.padEnd(9)} ${t.toFixed(2)} ms for ${files.length} files  => ${(t * 1000 / files.length).toFixed(3)} us/file`);
}

console.log('\n--- API shapes, same pattern over many files ---');
for (const [name, p] of Object.entries(patterns)) {
  const m = picomatch(p);
  const tList = bestOf(20, () => mm(files, p));
  const tIsMatchLoop = bestOf(3, () => { for (const f of files) mm.isMatch(f, p); });
  const tMatcherLoop = bestOf(20, () => { for (const f of files) m(f); });
  const tBatches = bestOf(20, () => {
    for (let i = 0; i < files.length; i += 500) mm(files.slice(i, i + 500), p);
  });
  console.log(`${name.padEnd(9)} mm(list,p): ${tList.toFixed(2)} ms | isMatch loop: ${tIsMatchLoop.toFixed(2)} ms | matcher loop: ${tMatcherLoop.toFixed(2)} ms | 500-batches: ${tBatches.toFixed(2)} ms`);
}
