'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CELLS } = require('./scenarios');

const median = values => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const min = values => (values.length ? Math.min(...values) : null);
const fmt = value => (value === null ? '—' : value.toFixed(2));
const pct = value => (value === null ? '—' : (value * 100).toFixed(1) + '%');

const rows = [];
for (const cell of CELLS) {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'runner.js'), cell.id], {
    encoding: 'utf8',
    timeout: 120000
  });
  if (child.status !== 0) {
    console.error(`runner failed for ${cell.id}\n${child.stderr}`);
    process.exit(1);
  }
  const data = JSON.parse(child.stdout);
  const coldSeries = data.cold.length ? data.cold : data.warm;
  const ratios = data.baseline.map((b, i) => (data.warm[i] ? b / data.warm[i] : null)).filter(Boolean);
  const coldRatios = data.baseline
    .map((b, i) => (coldSeries[i] ? b / coldSeries[i] : null))
    .filter(Boolean);

  rows.push({
    ...data,
    best: {
      baseline: min(data.baseline),
      warm: min(data.warm),
      cold: min(coldSeries)
    },
    median: {
      baseline: median(data.baseline),
      warm: median(data.warm),
      cold: median(coldSeries),
      coldMeasured: data.cold.length > 0,
      ratioWarm: median(ratios),
      ratioCold: median(coldRatios),
      ratioWarmMin: Math.min(...ratios),
      ratioWarmMax: Math.max(...ratios)
    },
    ratios
  });
}

const outDir = path.join(__dirname, '..', 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'bench.json'), JSON.stringify(rows, null, 2));

const lines = [];
lines.push('| 场景 | 操作数 | baseline 最优 (ms) | 命中缓存 最优 (ms) | 未命中缓存 最优 (ms) | 命中加速比（比值中位数） | 未命中比值 | 命中率 |');
lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const row of rows) {
  lines.push(
    `| ${row.label} | ${row.ops} | ${fmt(row.best.baseline)} | ${fmt(row.best.warm)} | ${fmt(row.best.cold)} | ` +
    `${row.median.ratioWarm === null ? '—' : row.median.ratioWarm.toFixed(2) + '×'} | ` +
    `${row.median.ratioCold === null ? '—' : row.median.ratioCold.toFixed(2) + '×'} | ` +
    `${pct(row.stats.hitRate)} (${row.stats.hits}/${row.stats.hits + row.stats.misses}) |`
  );
}
lines.push('');
lines.push('逐轮比值（baseline / 命中缓存），用于确认不是单轮抖动：');
lines.push('');
for (const row of rows) {
  lines.push(`- ${row.label}: ${row.ratios.map(r => r.toFixed(2)).join(', ')}`);
}

const table = lines.join('\n');
fs.writeFileSync(path.join(outDir, 'bench.md'), table + '\n');
console.log(table);
