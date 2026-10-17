'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const baseline = require('../vendor/micromatch-4.0.4');
const patched = require('../vendor/micromatch-4.0.4-cached');

const serialize = value => {
  if (value instanceof RegExp) return { $regex: value.source, $flags: value.flags };
  if (typeof value === 'function') return { $fn: value.name || 'anonymous' };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = serialize(value[key]);
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (typeof value === 'undefined') return { $undefined: true };
  return value;
};

const run = (mm, fn, trace) => {
  try {
    return { ok: serialize(fn(mm, trace)) };
  } catch (err) {
    return { error: `${err.name}: ${err.message}` };
  }
};

const PATTERNS = [
  '*', '*.js', '.*', '**', '**/*.js', 'a/**/b', 'src/**/*.{js,ts}', '{a,b}/c',
  '!*.js', '!**/node_modules/**', '!(*.test).js', 'src/**/!(*.test|*.spec).@(js|ts)',
  '+(a|b).js', '?(a|b).js', '*+(a|b).js', '[a-z]*.js', '[!a-z]*.js', '[[:alpha:]]*.js',
  'foo\\*bar', 'foo\\{a,b\\}', 'foo\\[bar\\]', 'a/b/', './*.js', '../*.js', '/abs/*.js',
  'C:\\\\path\\\\*.js', 'a\\\\b\\\\*.js', '', '[', '{a,b', '!()', '**/**/**/*.js',
  '*.*.*.*.*.*', 'a{b,c{d,e}}f', '\\!foo', 'foo/bar/**', '!(a|b)/**/*.js',
  'src/**', 'src/**/', '**/.*', '{,**/}*.js'
];

const INPUTS = [
  'a.js', 'a.ts', 'a.txt', '.eslintrc', '.a.js', '.gitignore', 'src/a/b.js',
  'src/a/b.test.js', 'src/a/b.spec.ts', 'node_modules/x/y.js', 'src/node_modules/y.js',
  'a/b/', 'a/b/c', 'foo*bar', 'foo{a,b}', 'foo[bar]', '!foo', '', './a.js', '../a.js',
  '/abs/a.js', 'C:\\path\\a.js', 'a\\b\\a.js', 'a b.js', 'a+b.js', '(a).js', '[a].js',
  'a{b}.js', 'x/y/z/deep/deeper/file.js', 'A.JS', 'ä.js', 'a/b\\c.js', 'src', 'src/',
  '.a/.b/c.js', 'a.js/', 'a/b.js', 'src/a/b/c/d.js'
];

const OPTION_SETS = [
  ['none', () => undefined],
  ['empty', () => ({})],
  ['dot', () => ({ dot: true })],
  ['nocase', () => ({ nocase: true })],
  ['basename', () => ({ basename: true })],
  ['matchBase', () => ({ matchBase: true })],
  ['ignore-string', () => ({ ignore: '**/node_modules/**' })],
  ['ignore-array', () => ({ ignore: ['**/node_modules/**', '*.test.js'] })],
  ['nonegate', () => ({ nonegate: true })],
  ['noext', () => ({ noext: true })],
  ['nobrace', () => ({ nobrace: true })],
  ['noglobstar', () => ({ noglobstar: true })],
  ['bash', () => ({ bash: true })],
  ['strictBrackets', () => ({ strictBrackets: true })],
  ['literalBrackets', () => ({ literalBrackets: false })],
  ['unescape', () => ({ unescape: true })],
  ['contains', () => ({ contains: true })],
  ['capture', () => ({ capture: true })],
  ['flags-i', () => ({ flags: 'i' })],
  ['windows', () => ({ windows: true })],
  ['posix', () => ({ posix: true })],
  ['posix-false', () => ({ windows: false })],
  ['keepQuotes', () => ({ keepQuotes: true })],
  ['noextglob', () => ({ noextglob: true })],
  ['regex-false', () => ({ regex: false })],
  ['maxLength', () => ({ maxLength: 10 })],
  ['mixed', () => ({ dot: true, nocase: true, basename: true })],
  ['onResult', () => ({ onResult: () => {} })],
  ['onMatch', () => ({ onMatch: () => {} })]
];

const compare = (label, fn, traceFactory) => {
  const traceA = traceFactory ? traceFactory() : null;
  const traceB = traceFactory ? traceFactory() : null;
  patched.matcherCache.clear();
  const cold = run(patched, fn, traceB);
  const expected = run(baseline, fn, traceA);
  assert.deepStrictEqual(cold, expected, `${label} [cold]`);

  // Pass 2 admits the pattern to the cache, pass 3 is a real cache hit.
  run(patched, fn, traceFactory ? traceFactory() : null);
  const warmTrace = traceFactory ? traceFactory() : null;
  const warm = run(patched, fn, warmTrace);
  assert.deepStrictEqual(warm, expected, `${label} [warm]`);
  if (traceA) assert.deepStrictEqual(warmTrace, traceA, `${label} [trace]`);
};

test('isMatch matrix: patterns x inputs x options', () => {
  let cases = 0;
  for (const pattern of PATTERNS) {
    for (const input of INPUTS) {
      for (const [optName, optFactory] of OPTION_SETS) {
        compare(
          `isMatch(${JSON.stringify(input)}, ${JSON.stringify(pattern)}, ${optName})`,
          mm => mm.isMatch(input, pattern, optFactory()),
          () => []
        );
        cases++;
      }
    }
  }
  assert.ok(cases > 20000, `expected a wide matrix, got ${cases} cases`);
});

test('isMatch with array patterns and nested arrays', () => {
  const sets = [
    [],
    ['*.js'],
    ['*.js', '*.ts'],
    ['!*.js', '*.ts'],
    ['**/*.js', '!**/node_modules/**'],
    [['*.js'], ['*.ts']]
  ];
  for (const set of sets) {
    for (const input of ['a.js', '.a.js', 'src/a/b.ts', 'node_modules/x.js', '']) {
      for (const [optName, optFactory] of [['none', () => undefined], ['dot', () => ({ dot: true })]]) {
        compare(`isMatch(${JSON.stringify(input)}, ${JSON.stringify(set)}, ${optName})`,
          mm => mm.isMatch(input, set, optFactory()));
      }
    }
  }
});

test('mm(list, patterns) semantics are untouched', () => {
  const lists = [
    [],
    ['a.js'],
    INPUTS,
    ['.a.js', 'a.js', 'src/a/b.js', 'node_modules/x/y.js']
  ];
  const patternSets = [
    '*.js',
    ['*.js', '!a.js'],
    ['!*.js'],
    ['**/*.js', '!**/node_modules/**'],
    ['src/**/*.{js,ts}'],
    [],
    ['!**/*.js', '!**/*.ts']
  ];
  for (const list of lists) {
    for (const patterns of patternSets) {
      for (const [optName, optFactory] of [['none', () => undefined], ['dot', () => ({ dot: true })], ['ignore', () => ({ ignore: '**/node_modules/**' })]]) {
        compare(`mm(${JSON.stringify(list.slice(0, 3))}..., ${JSON.stringify(patterns)}, ${optName})`,
          mm => mm(list, patterns, optFactory()));
      }
    }
  }
});

test('some / every / all', () => {
  const lists = [['a.js'], ['a.js', 'a.ts'], ['.a.js'], [], ['node_modules/x/y.js', 'src/a/b.js']];
  const patternSets = ['*.js', ['*.js', '*.ts'], '!*.js', ['**/*.js'], ['.*'], ['!(*.test).js']];
  for (const list of lists) {
    for (const patterns of patternSets) {
      for (const [optName, optFactory] of [['none', () => undefined], ['dot', () => ({ dot: true })]]) {
        compare(`some(${JSON.stringify(list)}, ${JSON.stringify(patterns)}, ${optName})`,
          mm => mm.some(list, patterns, optFactory()));
        compare(`every(${JSON.stringify(list)}, ${JSON.stringify(patterns)}, ${optName})`,
          mm => mm.every(list, patterns, optFactory()));
        for (const input of ['a.js', '.a.js', 'src/a/b.ts']) {
          compare(`all(${input}, ${JSON.stringify(patterns)}, ${optName})`,
            mm => mm.all(input, patterns, optFactory()));
        }
      }
    }
  }
});

test('matcher() results match, including returnObject shape and state', () => {
  for (const pattern of PATTERNS) {
    for (const [optName, optFactory] of [['none', () => undefined], ['dot', () => ({ dot: true })], ['windows', () => ({ windows: true })], ['nocase', () => ({ nocase: true })]]) {
      for (const input of INPUTS) {
        compare(`matcher(${JSON.stringify(pattern)}, ${optName})(${JSON.stringify(input)}, true)`, mm => {
          const fn = mm.matcher(pattern, optFactory());
          const res = fn(input, true);
          if (!res) return res;
          // `state.tokens` is large but stable; assert on every observable field.
          return {
            isMatch: res.isMatch,
            output: res.output,
            input: res.input,
            glob: res.glob,
            posix: res.posix,
            match: res.match,
            regex: res.regex,
            negated: res.state.negated,
            negatedExtglob: res.state.negatedExtglob,
            tokens: res.state.tokens
          };
        });
      }
    }
  }
});

test('callback options are never shared through the cache', () => {
  const expected = {
    first: [
      ['first', 'result', 'a.js', true],
      ['first', 'ignore', 'a.js'],
      ['first', 'result', 'b.js', true],
      ['first', 'match', 'b.js'],
      ['second', 'result', 'a.js', true],
      ['second', 'ignore', 'a.js'],
      ['second', 'result', 'b.js', true],
      ['second', 'match', 'b.js']
    ]
  };

  for (const mm of [baseline, patched]) {
    if (mm.matcherCache) mm.matcherCache.clear();
    const events = [];
    const make = tag => ({
      onResult: state => events.push([tag, 'result', state.output, state.isMatch]),
      onMatch: state => events.push([tag, 'match', state.output]),
      onIgnore: state => events.push([tag, 'ignore', state.output])
    });

    const first = mm.matcher('*.js', { ...make('first'), ignore: 'a.js' });
    first('a.js');
    first('b.js');
    // A second, independently created callback set must fire, not `first`'s.
    const second = mm.matcher('*.js', { ...make('second'), ignore: 'a.js' });
    second('a.js');
    second('b.js');

    assert.deepStrictEqual(events, expected.first, `${mm === baseline ? 'baseline' : 'patched'} callback trace`);
  }

  // A cached matcher built without callbacks must not satisfy a later call
  // that *does* pass callbacks.
  patched.matcherCache.clear();
  patched.isMatch('b.js', '*.js'); // populates the cache with a callback-free matcher
  let fired = 0;
  assert.strictEqual(patched.isMatch('b.js', '*.js', { onResult: () => fired++ }), true);
  assert.strictEqual(fired, 1, 'onResult must still fire when the cache is warm');
});

test('onResult call count and order for isMatch / some / all', () => {
  const traceFactory = () => [];
  for (const api of ['isMatch', 'some', 'every', 'all']) {
    compare(`${api} onResult trace`, (mm, trace) => {
      const options = {
        onResult: state => trace.push([state.input, state.output, state.isMatch])
      };
      if (api === 'isMatch') return mm.isMatch('src/a/b.js', 'src/**/*.js', options);
      if (api === 'all') return mm.all('src/a/b.js', 'src/**/*.js', options);
      return mm[api](['src/a/b.js', '.a.js', 'x.ts'], 'src/**/*.js', options);
    }, traceFactory);
  }
});

test('untouched APIs: not / contains / matchKeys / capture / makeRe / parse / braces', () => {
  const lists = [INPUTS, ['.a.js', 'a.js']];
  for (const list of lists) {
    for (const patterns of ['*.js', ['*.js', '!a.js'], '**/*.js']) {
      compare(`not(${JSON.stringify(patterns)})`, mm => mm.not(list, patterns));
      compare(`contains(${JSON.stringify(patterns)})`, mm => mm.contains('src/a/b.js', patterns));
    }
  }
  compare('matchKeys', mm => mm.matchKeys({ 'a.js': 1, 'b.ts': 2, '.c.js': 3 }, '*.js'));
  compare('capture', mm => mm.capture('test/*.js', 'test/foo.js'));
  compare('capture flags g twice', mm => [mm.capture('test/*.js', 'test/foo.js', { flags: 'g' }), mm.capture('test/*.js', 'test/foo.js', { flags: 'g' })]);
  compare('makeRe', mm => mm.makeRe('src/**/*.{js,ts}'));
  compare('parse', mm => mm.parse(['src/**/*.{js,ts}', '!*.js'], { dot: true }));
  compare('braces', mm => mm.braces('a/{b,c}d'));
  compare('braceExpand', mm => mm.braceExpand('a/{b,c}d'));
  compare('scan', mm => mm.scan('!./foo/*.js'));
});

test('errors are stable and never cached', () => {
  const bad = [
    () => baseline.isMatch('a', ''),
    () => baseline.isMatch('a', null),
    () => baseline.isMatch('a', 42),
    () => baseline.isMatch('a', ['*.js', null]),
    () => baseline.isMatch(null, '*.js'),
    () => baseline.isMatch('a', '['),
    () => baseline.isMatch('a', '[', { strictBrackets: true }),
    () => baseline.isMatch('a', '{a,b', { strictBrackets: true }),
    () => baseline.all('a', '*.js'),
    () => baseline.contains('a', '*.js', { strictBrackets: true })
  ];
  for (const fn of bad) {
    compare(`error case ${fn.toString().slice(0, 60)}`, fn);
  }

  patched.matcherCache.clear();
  for (let i = 0; i < 3; i++) {
    assert.throws(() => patched.isMatch('a', '[', { strictBrackets: true }), SyntaxError);
  }
  assert.strictEqual(patched.matcherCache.size, 0, 'throwing patterns must not be cached');

  // Same pattern, different options: a failed strict compile must not leak.
  patched.matcherCache.clear();
  assert.throws(() => patched.isMatch('a', '[', { strictBrackets: true }));
  assert.strictEqual(patched.isMatch('[', '[', { strictBrackets: false }), true);
  assert.strictEqual(patched.isMatch('[', '[', { strictBrackets: false }), true);
  assert.strictEqual(patched.matcherCache.size, 1);
});

test('options object order does not create divergent entries', () => {
  patched.matcherCache.clear();
  const a = patched.isMatch('a.js', '*.js', { dot: true, nocase: true });
  const b = patched.isMatch('a.js', '*.js', { nocase: true, dot: true });
  const c = patched.isMatch('a.js', '*.js', { dot: true, nocase: true });
  assert.deepStrictEqual([a, b, c], [true, true, true]);
  assert.strictEqual(patched.matcherCache.stats.misses, 2);
  assert.strictEqual(patched.matcherCache.stats.hits, 1);
});

test('dotfile and separator edge cases stay identical', () => {
  const edge = [
    ['.a.js', '*.js', undefined],
    ['.a.js', '*.js', { dot: true }],
    ['.a.js', '.*', undefined],
    ['.a/.b', '**/.*', undefined],
    ['a\\b\\c.js', '**/*.js', { windows: true }],
    ['a\\b\\c.js', 'a/b/*.js', { windows: true }],
    ['a/b/c.js', 'a\\b\\*.js', { windows: true }],
    ['a/b/c.js', 'a/b/*.js', { windows: false }],
    ['a\\b\\c.js', 'a/b/*.js', undefined],
    ['!a.js', '\\!*.js', undefined],
    ['*a.js', 'foo\\*bar.js', undefined],
    ['a{b}.js', 'a\\{b\\}.js', undefined],
    ['[a].js', '\\[a\\].js', undefined],
    ['a/b', 'a/b/**', undefined],
    ['a/b', 'a/b/**/', undefined]
  ];
  for (const [input, pattern, options] of edge) {
    compare(`edge ${JSON.stringify(input)} vs ${JSON.stringify(pattern)} ${JSON.stringify(options)}`,
      mm => mm.isMatch(input, pattern, options));
  }
});

test('cache isolation: same pattern, different options', () => {
  patched.matcherCache.clear();
  const pattern = '*.js';
  const cases = [
    ['a.js', undefined, true],
    ['.a.js', undefined, false],
    ['.a.js', { dot: true }, true],
    ['A.JS', { nocase: true }, true],
    ['A.JS', undefined, false],
    ['a.js', { ignore: 'a.js' }, false],
    ['a.js', { basename: true }, true]
  ];
  for (const [input, options, expected] of cases) {
    assert.strictEqual(patched.isMatch(input, pattern, options), expected,
      `${input} / ${JSON.stringify(options)}`);
    assert.strictEqual(baseline.isMatch(input, pattern, options), expected);
  }
});
