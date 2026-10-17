'use strict';

/**
 * Generates the README figures from bench results.
 *
 *   node scripts/make-assets.cjs
 *
 * Requires playwright + the system Edge/Chromium (channel: msedge). The SVGs
 * are written next to the PNGs, so the figures can be regenerated or edited
 * without rerunning the benchmarks.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(OUT, { recursive: true });

const bench = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'bench.json'), 'utf8'));
const compiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'results', 'compiles.json'), 'utf8'));

const C = {
  cream: '#F7F1E6',
  ink: '#241C16',
  muted: '#7A6A5C',
  faint: '#A29383',
  grid: '#DFD0BB',
  terracotta: '#BF4E2A',
  amber: '#D08A2C',
  brown: '#6B5747',
  taupe: '#A29383',
  card: '#FFFBF2',
  olive: '#6F7F4E'
};

const FONT = "Microsoft YaHei, Segoe UI, sans-serif";
const esc = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const text = (x, y, value, opts = {}) => {
  const {
    size = 14, fill = C.ink, weight = 400, anchor = 'start', opacity = 1, spacing = 0
  } = opts;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" ` +
    `fill="${fill}" text-anchor="${anchor}" opacity="${opacity}" letter-spacing="${spacing}">${esc(value)}</text>`;
};

const rect = (x, y, w, h, opts = {}) => {
  const { fill = C.card, stroke = 'none', rx = 8, sw = 1.5, opacity = 1 } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
};

const line = (x1, y1, x2, y2, opts = {}) => {
  const { stroke = C.brown, sw = 2, dash = '', opacity = 1 } = opts;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ` +
    `stroke-dasharray="${dash}" opacity="${opacity}" marker-end="url(#arrow)"/>`;
};

const arrowPath = (d, opts = {}) => {
  const { stroke = C.brown, sw = 2, dash = '' } = opts;
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}" marker-end="url(#arrow)"/>`;
};

const byId = Object.fromEntries(bench.map(row => [row.cell, row]));

/* ------------------------------------------------------------------ */
/* Figure 1: speedup by scenario                                       */
/* ------------------------------------------------------------------ */

const speedRows = [
  ['extglob', 'src/**/!(*.test|*.spec).@(js|ts) · 4k files', 's3a-extglob'],
  ['brace + globstar', '**/{src,test}/**/*.{js,ts,jsx,tsx} · 4k files', 's3b-brace-globstar'],
  ['brace', 'src/**/*.{js,ts} · 8k files', 's1b-ismatch'],
  ['negation', '!**/node_modules/** · 4k files', 's3c-negation'],
  ['simple glob', '*.js · 8k files', 's1c-simple'],
  ['mm(list, p)', '主入口：列表内已复用编译 · 8k files', 's1a-list'],
  ['unique patterns', '8k 一次性 pattern · 0% 命中', 's2-unique']
];

const speedFigure = () => {
  const W = 1200;
  const H = 760;
  const x0 = 380;
  const x1 = W - 56;
  const top = 158;
  const bottom = H - 96;
  const rowH = (bottom - top) / speedRows.length;
  const lo = Math.log(0.5);
  const hi = Math.log(20);
  const X = v => x0 + ((Math.log(v) - lo) / (hi - lo)) * (x1 - x0);

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${C.cream}"/>`);
  parts.push(`<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.brown}"/></marker>
    <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="7" height="7" fill="${C.taupe}" opacity="0.18"/>
      <line x1="0" y1="0" x2="0" y2="7" stroke="${C.taupe}" stroke-width="2"/>
    </pattern>
  </defs>`);

  parts.push(text(56, 62, 'micromatch 4.0.4 · 编译缓存加速比', { size: 30, weight: 700 }));
  parts.push(text(56, 92, '同一份确定性输入 · 9 轮交错 · 逐轮比值中位数 · 越靠右越好', { size: 14.5, fill: C.muted }));

  // legend
  parts.push(rect(788, 44, 16, 16, { fill: C.terracotta, rx: 3 }));
  parts.push(text(812, 57, '重复 pattern 有收益', { size: 13, fill: C.muted }));
  parts.push(rect(1000, 44, 16, 16, { fill: 'url(#hatch)', stroke: C.taupe, rx: 3, sw: 1 }));
  parts.push(text(1024, 57, '≈1× 或更慢', { size: 13, fill: C.muted }));

  // grid + ticks
  for (const tick of [0.5, 1, 2, 5, 10, 20]) {
    const x = X(tick);
    parts.push(`<line x1="${x}" y1="${top - 12}" x2="${x}" y2="${bottom}" stroke="${C.grid}" stroke-width="1"/>`);
    parts.push(text(x, bottom + 26, tick === 1 ? '1×' : tick + '×', { size: 12, fill: C.muted, anchor: 'middle' }));
  }

  speedRows.forEach(([name, sub, id], i) => {
    const ratio = byId[id].median.ratioWarm;
    const y = top + i * rowH;
    const cy = y + rowH / 2;
    const barY = cy - 13;
    const w = Math.max(X(ratio) - x0, 3);
    const slow = ratio < 1.02;
    const fill = ratio >= 10 ? C.terracotta : ratio >= 3 ? C.amber : slow ? 'url(#hatch)' : C.brown;

    parts.push(text(56, cy - 2, name, { size: 16.5, weight: 700 }));
    parts.push(text(56, cy + 19, sub, { size: 11.5, fill: C.muted }));
    parts.push(rect(x0, barY, w, 26, { fill, rx: 4, stroke: slow ? C.taupe : 'none', sw: 1 }));
    parts.push(text(X(ratio) + 10, cy + 6, ratio.toFixed(2) + '×', {
      size: 15.5, weight: 700, fill: ratio < 1.02 ? C.muted : C.ink
    }));
  });

  parts.push(`<line x1="${X(1)}" y1="${top - 12}" x2="${X(1)}" y2="${bottom}" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.55"/>`);

  parts.push(text(56, H - 34, '数据：results/bench.json · Node v22.22.2 · 命中率 100% 的场景为 8k/4k 次 isMatch 逐条调用', { size: 11.5, fill: C.faint }));
  parts.push(text(56, H - 16, '一次性 pattern 的 0.77× 是缓存探测固定成本（约 +0.9 µs/次），可 setMaxEntries(0) 关闭', { size: 11.5, fill: C.faint }));
  parts.push('</svg>');
  return { svg: parts.join('\n'), width: W, height: H, name: 'speedup-by-scenario' };
};

/* ------------------------------------------------------------------ */
/* Figure 2: how many compiles actually happen                         */
/* ------------------------------------------------------------------ */

const compileRows = [
  ['mm(list, p)', 'mm(list, pattern)'],
  ['isMatch · 同 pattern', 'isMatch x N (same pattern)'],
  ['matcher()', 'matcher() x N'],
  ['some()', 'some() x N'],
  ['every()', 'every() x N'],
  ['all()', 'all() x N'],
  ['isMatch · 全唯一', 'isMatch, unique patterns']
];

const compileFigure = () => {
  const W = 1200;
  const H = 720;
  const x0 = 340;
  const x1 = W - 90;
  const top = 176;
  const bottom = H - 96;
  const rowH = (bottom - top) / compileRows.length;
  const lo = Math.log(1);
  const hi = Math.log(1200);
  const X = v => x0 + ((Math.log(Math.max(v, 1)) - lo) / (hi - lo)) * (x1 - x0);

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${C.cream}"/>`);
  parts.push(`<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.brown}"/></marker>
  </defs>`);

  parts.push(text(56, 62, '同一批调用，实际触发多少次 glob 编译', { size: 30, weight: 700 }));
  parts.push(text(56, 92, 'isMatch 调用 1000 次；matcher / some / every / all 各 100 次 · 对数轴 · 越少越好', { size: 14.5, fill: C.muted }));

  parts.push(rect(816, 44, 16, 16, { fill: '#C9B7A2', rx: 3 }));
  parts.push(text(840, 57, 'baseline 4.0.4', { size: 13, fill: C.muted }));
  parts.push(rect(1000, 44, 16, 16, { fill: C.terracotta, rx: 3 }));
  parts.push(text(1024, 57, '补丁版', { size: 13, fill: C.muted }));

  for (const tick of [1, 2, 10, 100, 1000]) {
    const x = X(tick);
    parts.push(`<line x1="${x}" y1="${top - 14}" x2="${x}" y2="${bottom}" stroke="${C.grid}" stroke-width="1"/>`);
    parts.push(text(x, bottom + 26, String(tick), { size: 12, fill: C.muted, anchor: 'middle' }));
  }

  compileRows.forEach(([label, key], i) => {
    const row = compiles.find(item => item.case === key);
    const y = top + i * rowH;
    const cy = y + rowH / 2;
    const b = row.baselineCompiles;
    const p = row.patchedCompiles;

    parts.push(text(56, cy + 5, label, { size: 15.5, weight: 600 }));

    const bh = 15;
    const bw = value => Math.max(X(value) - x0, 5);
    parts.push(rect(x0, cy - bh - 3, bw(b), bh, { fill: '#C9B7A2', rx: 3 }));
    parts.push(text(x0 + bw(b) + 8, cy - 5, String(b), { size: 12.5, fill: C.muted, weight: 600 }));

    const fill = p === b ? C.taupe : C.terracotta;
    parts.push(rect(x0, cy + 3, bw(p), bh, { fill, rx: 3 }));
    parts.push(text(x0 + bw(p) + 8, cy + 17, String(p), { size: 12.5, fill: p === b ? C.muted : C.ink, weight: 700 }));
  });

  parts.push(text(56, H - 32, '计数方式：插桩 picomatch.makeRe，只加计数器，其余源码逐字节相同；results/compiles.json', { size: 11.5, fill: C.faint }));
  parts.push('</svg>');
  return { svg: parts.join('\n'), width: W, height: H, name: 'compiles-per-run' };
};

/* ------------------------------------------------------------------ */
/* Figure 3: cache decision flow                                       */
/* ------------------------------------------------------------------ */

const flowFigure = () => {
  const W = 1200;
  const H = 840;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${C.cream}"/>`);
  parts.push(`<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.brown}"/></marker>
  </defs>`);

  parts.push(text(56, 62, '编译缓存如何决定「复用还是重编译」', { size: 30, weight: 700 }));
  parts.push(text(56, 92, '只接管 5 个便捷 API；mm(list, p) 主循环不经过这里', { size: 14.5, fill: C.muted }));

  const cx = 268;
  const box = (x, y, w, h, title, sub, fill = C.card, stroke = '#CDBBA3') => {
    const out = [rect(x, y, w, h, { fill, stroke, rx: 10, sw: 1.5 })];
    out.push(text(x + 20, y + (sub ? h / 2 - 3 : h / 2 + 5), title, { size: 16, weight: 700 }));
    if (sub) out.push(text(x + 20, y + h / 2 + 19, sub, { size: 11.5, fill: C.muted }));
    return out.join('\n');
  };

  const diamond = (ccx, ccy, hw, hh, title, sub) => {
    const pts = `${ccx},${ccy - hh} ${ccx + hw},${ccy} ${ccx},${ccy + hh} ${ccx - hw},${ccy}`;
    return `<polygon points="${pts}" fill="#F6E6C9" stroke="${C.amber}" stroke-width="1.8"/>` +
      text(ccx, ccy - (sub ? 2 : 6), title, { size: 15.5, weight: 700, anchor: 'middle' }) +
      (sub ? text(ccx, ccy + 20, sub, { size: 11, fill: C.muted, anchor: 'middle' }) : '');
  };

  // Why the main entry point is absent from this flow.
  parts.push(rect(640, 140, 470, 120, { fill: '#F3EBDD', stroke: '#DDCDB5', rx: 10, sw: 1.2 }));
  parts.push(text(664, 174, 'mm(list, p) 不经过这里', { size: 15.5, weight: 700 }));
  parts.push(text(664, 202, '每个 pattern 每调用只编译 1 次，结果用于整个列表；', { size: 12, fill: C.muted }));
  parts.push(text(664, 224, '基准 0.99×，主匹配循环零改动。', { size: 12, fill: C.muted }));

  // spine
  parts.push(box(108, 140, 320, 58, 'pattern + options', null));
  parts.push(arrowPath(`M ${cx} 198 L ${cx} 236`));
  parts.push(box(108, 236, 320, 70, '1  构造缓存键', '长度前缀 pattern + 排序序列化 options'));
  parts.push(arrowPath(`M ${cx} 306 L ${cx} 330`));

  parts.push(diamond(cx, 388, 132, 58, '2  LRU 命中？', 'Map.get'));
  // hit branch
  parts.push(arrowPath(`M ${cx + 132} 388 L 520 388 L 520 360 L 640 360`));
  parts.push(text(470, 378, '是', { size: 13, fill: C.olive, weight: 700 }));
  parts.push(box(640, 326, 470, 68, '重排 LRU → 直接返回 matcher', '命中率 99.8%（8k 次 isMatch）', '#F1F3E8', '#B9C3A2'));

  parts.push(arrowPath(`M ${cx} 446 L ${cx} 486`));
  parts.push(text(cx + 12, 470, '否', { size: 13, fill: C.muted, weight: 700 }));

  parts.push(diamond(cx, 544, 132, 58, '3  首次出现？', 'seenOnce'));
  // first sighting
  parts.push(arrowPath(`M ${cx + 132} 544 L 520 544 L 520 516 L 640 516`));
  parts.push(text(462, 534, '是（首次）', { size: 12, fill: C.muted, weight: 700 }));
  parts.push(box(640, 482, 470, 68, '编译 → 记下键 → 返回', '不保留：一次性 pattern 不占缓存、不压 GC', '#FBF3E6', '#D9C4A3'));

  parts.push(arrowPath(`M ${cx} 602 L ${cx} 646`));
  parts.push(text(cx + 12, 628, '否（第二次）', { size: 12, fill: C.terracotta, weight: 700 }));

  parts.push(box(108, 646, 1002, 68, '4  编译 → 写入 LRU（默认 256 条）→ 淘汰最旧 → 返回 matcher', null, '#F9E8E1', '#D8A894'));

  parts.push(text(56, H - 52, '带函数的 options（onResult / onMatch / onIgnore / format / expandRange）直接走原路径，不进入缓存：matcher 闭包会捕获回调，共享会串用。', { size: 12, fill: C.muted }));
  parts.push(text(56, H - 30, '单条 4–10 KB · 默认 2 MB 量级 · setMaxEntries(0) 可整体关闭 · 返回的 matcher 无状态', { size: 12, fill: C.faint }));
  parts.push('</svg>');
  return { svg: parts.join('\n'), width: W, height: H, name: 'cache-decision-flow' };
};

/* ------------------------------------------------------------------ */

const html = (svg, width, height) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:${C.cream};}
  svg{display:block;}
</style></head><body>${svg}</body></html>`;

(async () => {
  const figures = [speedFigure(), compileFigure(), flowFigure()];
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });

  for (const fig of figures) {
    fs.writeFileSync(path.join(OUT, fig.name + '.svg'), fig.svg);
    await page.setViewportSize({ width: fig.width, height: fig.height });
    await page.setContent(html(fig.svg, fig.width, fig.height), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, fig.name + '.png') });
    console.log('wrote assets/' + fig.name + '.png', fig.width + 'x' + fig.height + ' @2x');
  }

  await browser.close();
})();
