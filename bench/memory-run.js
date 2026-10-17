'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const run = (variant, mode, kind) => {
  const child = spawnSync(process.execPath, [
    '--expose-gc',
    path.join(__dirname, 'memory.js'),
    variant, mode, kind
  ], { encoding: 'utf8', timeout: 180000 });
  if (child.status !== 0) {
    console.error(child.stderr);
    process.exit(1);
  }
  return JSON.parse(child.stdout);
};

const fill = [];
for (const kind of ['simple', 'brace', 'extglob']) {
  const baseline = run('baseline', 'fill', kind);
  const patched = run('patched', 'fill', kind);
  fill.push({ kind, baseline, patched });
}

const loop = {
  baseline: run('baseline', 'loop', 'brace'),
  patched: run('patched', 'loop', 'brace')
};
const unique = {
  baseline: run('baseline', 'unique', 'brace'),
  patched: run('patched', 'unique', 'brace')
};

const kb = bytes => (bytes / 1024).toFixed(1) + ' KB';
const mb = bytes => (bytes / 1048576).toFixed(2) + ' MB';

const lines = [];
lines.push('### 缓存常驻内存（填满默认上限 256 条）');
lines.push('');
lines.push('| pattern 类型 | 条目 | 每条约 | 合计 | baseline 堆增量 |');
lines.push('|---|---:|---:|---:|---:|');
for (const { kind, baseline, patched } of fill) {
  lines.push(`| ${kind} | ${patched.cacheSize} | ${kb(patched.bytesPerEntry)} | ${mb(patched.heapDeltaBytes)} | ${kb(baseline.heapDeltaBytes)} |`);
}
lines.push('');
lines.push('### 持续命中同一 pattern（20 万次调用）');
lines.push('');
lines.push('| 指标 | baseline | 命中缓存 |');
lines.push('|---|---:|---:|');
lines.push(`| 堆峰值增量 | ${mb(loop.baseline.heapPeakDelta)} | ${mb(loop.patched.heapPeakDelta)} |`);
lines.push(`| 结束后缓存条目 | 0 | ${loop.patched.cacheSize} |`);
lines.push('');
lines.push('### 2 万个一次性 pattern（全部未命中）');
lines.push('');
lines.push('| 指标 | baseline | 命中缓存 |');
lines.push('|---|---:|---:|');
lines.push(`| 堆峰值增量 | ${mb(unique.baseline.heapPeakDelta)} | ${mb(unique.patched.heapPeakDelta)} |`);
lines.push(`| 缓存条目 / 被拒 | 0 | ${unique.patched.cacheSize} / ${unique.patched.stats.rejected} |`);

const out = { fill, loop, unique };
fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'results', 'memory.json'), JSON.stringify(out, null, 2));
const text = lines.join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'results', 'memory.md'), text + '\n');
console.log(text);
