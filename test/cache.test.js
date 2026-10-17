'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const mm = require('../vendor/micromatch-4.0.4-cached');

beforeEach(() => {
  mm.matcherCache.setMaxEntries(1000);
  mm.matcherCache.clear();
});

test('a warm cache turns N compilations into 2', () => {
  for (let i = 0; i < 500; i++) {
    assert.strictEqual(mm.isMatch(`src/file-${i}.js`, 'src/**/*.{js,ts}'), true);
  }
  const stats = mm.matcherCache.stats;
  assert.strictEqual(stats.misses, 2, 'first sighting + admission both compile');
  assert.strictEqual(stats.hits, 498);
  assert.strictEqual(mm.matcherCache.size, 1);
});

test('one-shot patterns are compiled but never retained', () => {
  for (let i = 0; i < 1000; i++) {
    mm.isMatch(`file-${i}.js`, `file-${i}.*.js`);
  }
  const stats = mm.matcherCache.stats;
  assert.strictEqual(stats.rejected, 1000);
  assert.strictEqual(stats.misses, 1000);
  assert.strictEqual(stats.hits, 0);
  assert.strictEqual(mm.matcherCache.size, 0, 'no one-shot matcher may be retained');
});

test('function-valued options always take the uncached path', () => {
  for (let i = 0; i < 10; i++) {
    mm.isMatch('a.js', '*.js', { onResult: () => {} });
  }
  const stats = mm.matcherCache.stats;
  assert.strictEqual(stats.misses, 0, 'bypassed calls are not cache lookups');
  assert.strictEqual(stats.hits, 0);
  assert.strictEqual(mm.matcherCache.size, 0);
});

test('nested functions and non-plain objects are not cached', () => {
  class Options {
    constructor() {
      this.dot = true;
    }
  }
  mm.isMatch('.a.js', '*.js', new Options());
  mm.isMatch('.a.js', '*.js', { expandRange: (a, b) => `${a}-${b}` });
  assert.strictEqual(mm.matcherCache.size, 0);
});

test('LRU eviction keeps the recently used entry', () => {
  mm.matcherCache.setMaxEntries(2);
  const hit = (input, pattern) => {
    mm.isMatch(input, pattern);
    mm.isMatch(input, pattern);
  };

  hit('a.js', 'a*.js');
  hit('b.js', 'b*.js');
  mm.isMatch('a.js', 'a*.js'); // hit, A becomes most recent
  hit('c.js', 'c*.js'); // admits C, evicts B

  assert.strictEqual(mm.matcherCache.size, 2);
  assert.strictEqual(mm.matcherCache.stats.evictions, 1);

  const beforeA = mm.matcherCache.stats;
  mm.isMatch('a.js', 'a*.js');
  assert.strictEqual(mm.matcherCache.stats.hits, beforeA.hits + 1, 'A should still be cached');

  const beforeB = mm.matcherCache.stats;
  mm.isMatch('b.js', 'b*.js');
  assert.strictEqual(mm.matcherCache.stats.misses, beforeB.misses + 1, 'B should have been evicted');
});

test('the cache never exceeds its bound', () => {
  mm.matcherCache.setMaxEntries(50);
  for (let i = 0; i < 500; i++) {
    mm.isMatch(`file-${i}.js`, `file-${i}.*.js`);
    mm.isMatch(`file-${i}.js`, `file-${i}.*.js`);
  }
  assert.strictEqual(mm.matcherCache.size, 50);
  assert.strictEqual(mm.matcherCache.stats.misses, 1000);
  assert.strictEqual(mm.matcherCache.stats.evictions, 450);
});

test('cache keys separate options that change matching', () => {
  const pattern = '*.js';
  const optionSets = [
    { dot: true }, { dot: false }, { nocase: true }, { basename: true },
    { ignore: 'a.js' }, { contains: true }, { capture: true }, { flags: 'i' }, { windows: true }
  ];
  for (const options of optionSets) {
    mm.isMatch('a.js', pattern, options);
    mm.isMatch('a.js', pattern, options);
  }
  assert.strictEqual(mm.matcherCache.stats.misses, 18);
  assert.strictEqual(mm.matcherCache.size, 9);

  mm.isMatch('a.js', pattern, { dot: false });
  mm.isMatch('a.js', pattern, { flags: 'i' });
  assert.strictEqual(mm.matcherCache.stats.hits, 2);
});

test('matcher() shares the compiled matcher once it is admitted', () => {
  const a = mm.matcher('src/**/*.js', { dot: true });
  const b = mm.matcher('src/**/*.js', { dot: true });
  const c = mm.matcher('src/**/*.js', { dot: true });
  const d = mm.matcher('src/**/*.js', { dot: false });

  assert.notStrictEqual(a, b, 'first sighting is not retained');
  assert.strictEqual(b, c, 'admitted matcher is reused');
  assert.notStrictEqual(b, d);
  assert.strictEqual(c('src/a/b.js'), true);
  assert.strictEqual(c('src/.a.js'), true);
  assert.strictEqual(d('src/.a.js'), false);
});

test('array patterns are cached as one unit', () => {
  const patterns = ['*.js', '!a.js'];
  for (let i = 0; i < 20; i++) {
    mm.isMatch('b.js', patterns);
  }
  assert.strictEqual(mm.matcherCache.stats.misses, 2);
  assert.strictEqual(mm.matcherCache.stats.hits, 18);
});

test('clear() releases entries and resets counters', () => {
  mm.isMatch('a.js', '*.js');
  mm.isMatch('a.js', '*.js');
  assert.strictEqual(mm.matcherCache.size, 1);
  mm.matcherCache.clear();
  assert.strictEqual(mm.matcherCache.size, 0);
  assert.deepStrictEqual(
    { hits: mm.matcherCache.stats.hits, misses: mm.matcherCache.stats.misses },
    { hits: 0, misses: 0 }
  );
});

test('undefined options and {} are distinct keys but equivalent results', () => {
  for (let i = 0; i < 2; i++) {
    assert.strictEqual(mm.isMatch('a.js', '*.js'), true);
    assert.strictEqual(mm.isMatch('a.js', '*.js', {}), true);
  }
  assert.strictEqual(mm.matcherCache.stats.misses, 4);
  assert.strictEqual(mm.matcherCache.size, 2);
});

test('setMaxEntries(0) disables the cache and clears what was stored', () => {
  mm.isMatch('a.js', '*.js');
  mm.isMatch('a.js', '*.js');
  assert.strictEqual(mm.matcherCache.size, 1);

  mm.matcherCache.setMaxEntries(0);
  assert.strictEqual(mm.matcherCache.size, 0);
  assert.strictEqual(mm.matcherCache.stats.max, 0);

  for (let i = 0; i < 100; i++) {
    assert.strictEqual(mm.isMatch('a.js', '*.js'), true);
  }
  assert.deepStrictEqual(
    { hits: mm.matcherCache.stats.hits, misses: mm.matcherCache.stats.misses, size: mm.matcherCache.size },
    { hits: 0, misses: 0, size: 0 }
  );
});
