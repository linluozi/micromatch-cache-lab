'use strict';

/**
 * Shared benchmark corpus and scenario definitions.
 *
 * Corpus is deterministic: every run sees byte-identical paths, so the
 * baseline/patched comparison is on the same input (differential benchmark).
 */

const FILES = (() => {
  const out = [];
  const ext = ['js', 'ts', 'jsx', 'tsx', 'md'];
  for (let i = 0; i < 8000; i++) {
    const pkg = i % 20;
    const mod = i % 37;
    const e = ext[i % 5];
    let file;
    if (i % 10 === 0) {
      file = `test/pkg-${pkg}/module-${mod}/file-${i}.test.${e}`;
    } else if (i % 20 === 0) {
      file = `node_modules/pkg-${pkg}/index.${e}`;
    } else if (i % 50 === 0) {
      file = `src/pkg-${pkg}/.hidden-${i}.${e}`;
    } else {
      file = `src/pkg-${pkg}/module-${mod}/file-${i}.${e}`;
    }
    out.push(file);
  }
  return out;
})();

const S1 = { pattern: 'src/**/*.{js,ts}', files: FILES };

const S2 = (() => {
  const calls = [];
  for (let i = 0; i < 8000; i++) {
    // 8000 distinct patterns, each used exactly once: a cache can never help.
    calls.push([
      FILES[(i * 7919) % FILES.length],
      `src/pkg-${i % 20}/**/file-${i}.*`
    ]);
  }
  return { calls };
})();

const S3 = [
  {
    id: 's3a-extglob',
    label: 'S3a 复杂 extglob',
    pattern: 'src/**/!(*.test|*.spec).@(js|ts)',
    files: FILES.slice(0, 4000)
  },
  {
    id: 's3b-brace-globstar',
    label: 'S3b 复杂 brace+globstar',
    pattern: '**/{src,test}/**/*.{js,ts,jsx,tsx}',
    files: FILES.slice(0, 4000)
  },
  {
    id: 's3c-negation',
    label: 'S3c 否定模式',
    pattern: '!**/node_modules/**',
    files: FILES.slice(0, 4000)
  }
];

/**
 * Each cell is executed in its own child process. `run(mm, mode)` must be
 * self-contained: the runner only times it.
 *
 * mode: 'warm'  -> cache is left alone (baseline ignores it)
 *       'cold'  -> cache cleared before every single call, i.e. every call
 *                  pays the compile, which is what the baseline always does
 */
const CELLS = [
  {
    id: 's1a-list',
    label: 'S1 同 pattern × 8k 文件 · mm(list, p)',
    ops: FILES.length,
    reps: 21,
    run: (mm, mode) => {
      if (mode === 'cold' && mm.matcherCache) mm.matcherCache.clear();
      mm(S1.files, S1.pattern);
    }
  },
  {
    id: 's1b-ismatch',
    label: 'S1 同 pattern × 8k 文件 · isMatch 逐条（brace）',
    ops: FILES.length,
    run: (mm, mode) => {
      for (let i = 0; i < S1.files.length; i++) {
        if (mode === 'cold' && mm.matcherCache) mm.matcherCache.clear();
        mm.isMatch(S1.files[i], S1.pattern);
      }
    }
  },
  {
    id: 's1c-simple',
    label: 'S1 同 pattern × 8k 文件 · isMatch 逐条（简单 *.js）',
    ops: FILES.length,
    run: (mm, mode) => {
      for (let i = 0; i < FILES.length; i++) {
        if (mode === 'cold' && mm.matcherCache) mm.matcherCache.clear();
        mm.isMatch(FILES[i], '*.js');
      }
    }
  },
  {
    id: 's2-unique',
    label: 'S2 每次不同 pattern · 8k 唯一 pattern × 1 目标',
    ops: S2.calls.length,
    run: (mm, mode) => {
      for (let i = 0; i < S2.calls.length; i++) {
        if (mode === 'cold' && mm.matcherCache) mm.matcherCache.clear();
        mm.isMatch(S2.calls[i][0], S2.calls[i][1]);
      }
    }
  },
  ...S3.map(s => ({
    id: s.id,
    label: s.label + ' · isMatch 逐条',
    ops: s.files.length,
    run: (mm, mode) => {
      for (let i = 0; i < s.files.length; i++) {
        if (mode === 'cold' && mm.matcherCache) mm.matcherCache.clear();
        mm.isMatch(s.files[i], s.pattern);
      }
    }
  }))
];

module.exports = { FILES, S1, S2, S3, CELLS };
