/**
 * QA measurement probe (not a test): gathers the accessibility numbers the
 * W6 reskin brief asks for — contrast across the whole gradient ramp,
 * focus-visible ring contrast, forced-colors survival, and PAINTED-PIXEL
 * proof that clipped titles are actually visible.
 * Own port + own server so it never collides with the suite on 4180.
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const E2E = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RICH = join(E2E, '.sandbox', 'rich');
const PORT = 4187;
const BASE = new URL(readFileSync(join(RICH, 'config', 'site.yaml'), 'utf8').match(/^base_url:\s*"?([^"\s]+)"?/m)[1]).pathname.replace(/\/+$/, '');

const srv = spawn(process.execPath, ['lib/static-server.mjs', String(PORT)], { cwd: E2E, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const U = (p) => `http://127.0.0.1:${PORT}${BASE}${p}`;

// ── WCAG 2.x ────────────────────────────────────────────────────────────
const srgb = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

const out = { tokens: [], ramp: [], pixels: [], focus: [], forced: [] };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

// ── 1. Token pairs, read from the live cascade (not from the .css source) ──
await page.goto(U('/'));
const tok = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const names = ['--bg','--surface','--surface-2','--surface-3','--ink','--ink-prose','--muted','--line','--line-strong','--accent','--accent-dim','--accent-ink','--on-accent','--accent-2','--accent-2-ink','--on-accent-2','--good','--warn','--critical'];
  const o = {};
  for (const n of names) o[n] = cs.getPropertyValue(n).trim();
  o['--head-sheen'] = cs.getPropertyValue('--head-sheen').trim();
  o['--accent-sheen'] = cs.getPropertyValue('--accent-sheen').trim();
  o['--spot-r'] = cs.getPropertyValue('--spot-r').trim();
  o.bodyBg = getComputedStyle(document.body).backgroundColor;
  o.bodyBgImage = getComputedStyle(document.body).backgroundImage;
  return o;
});
const H = (h) => { const s = h.replace('#',''); return [0,2,4].map((i) => parseInt(s.slice(i,i+2),16)); };
const pairs = [
  ['--ink on --bg', tok['--ink'], tok['--bg'], 4.5],
  ['--ink-prose on --bg', tok['--ink-prose'], tok['--bg'], 4.5],
  ['--ink-prose on --surface', tok['--ink-prose'], tok['--surface'], 4.5],
  ['--muted on --bg', tok['--muted'], tok['--bg'], 4.5],
  ['--muted on --surface-2', tok['--muted'], tok['--surface-2'], 4.5],
  ['--accent-ink on --bg', tok['--accent-ink'], tok['--bg'], 4.5],
  ['--accent-2-ink on --bg', tok['--accent-2-ink'], tok['--bg'], 4.5],
  ['--accent-2-ink on --surface-2', tok['--accent-2-ink'], tok['--surface-2'], 4.5],
  ['--on-accent on --accent', tok['--on-accent'], tok['--accent'], 4.5],
  ['--on-accent-2 on --accent-2', tok['--on-accent-2'], tok['--accent-2'], 4.5],
  ['--line-strong on --bg (UI 3:1)', tok['--line-strong'], tok['--bg'], 3.0],
  ['--line on --bg (장식 전용)', tok['--line'], tok['--bg'], 0],
  ['--critical on --bg', tok['--critical'], tok['--bg'], 4.5],
  ['--warn on --bg', tok['--warn'], tok['--bg'], 4.5],
];
for (const [name, fg, bg, min] of pairs) {
  const r = ratio(H(fg), H(bg));
  out.tokens.push({ name, fg, bg, ratio: +r.toFixed(2), min, pass: min === 0 ? null : r >= min });
}

// ── 2. Gradient ramps, sampled across the WHOLE ramp (sRGB interpolation,
//       which is what these gradients declare) ──
function stopsOf(gradient) {
  // "linear-gradient(100deg, #8bf7d2 0%, #63efc0 34%, #b9a5f7 100%)"
  const inner = gradient.slice(gradient.indexOf('(') + 1, gradient.lastIndexOf(')'));
  const parts = inner.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => !/^\d+deg$/.test(s));
  return parts.map((p) => {
    const m = p.match(/(#[0-9a-f]{6}|rgba?\([^)]*\))\s*([\d.]+)%/i);
    const col = m[1].startsWith('#') ? H(m[1]) : m[1].match(/\d+/g).slice(0, 3).map(Number);
    return { col, pos: parseFloat(m[2]) / 100 };
  });
}
function sampleRamp(stops, t) {
  if (t <= stops[0].pos) return stops[0].col;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].pos) {
      const a = stops[i - 1], b = stops[i];
      const f = (t - a.pos) / (b.pos - a.pos);
      return a.col.map((c, k) => Math.round(c + (b.col[k] - a.col[k]) * f));
    }
  }
  return stops[stops.length - 1].col;
}
const rampChecks = [
  ['--head-sheen on --bg', tok['--head-sheen'], tok['--bg'], 4.5],
  ['--accent-sheen 위의 --on-accent', tok['--accent-sheen'], null, 4.5, tok['--on-accent']],
  ['--title-spot(mint↔lavender) on --surface-2', `linear-gradient(90deg, ${tok['--accent-2-ink']} 0%, ${tok['--accent-ink']} 50%, ${tok['--accent-2-ink']} 100%)`, tok['--surface-2'], 4.5],
  ['--title-spot on --bg', `linear-gradient(90deg, ${tok['--accent-2-ink']} 0%, ${tok['--accent-ink']} 50%, ${tok['--accent-2-ink']} 100%)`, tok['--bg'], 4.5],
];
for (const [name, grad, bg, min, fgOnTop] of rampChecks) {
  const stops = stopsOf(grad);
  let worst = Infinity, worstAt = 0, worstCol = null;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const c = sampleRamp(stops, t);
    const r = fgOnTop ? ratio(H(fgOnTop), c) : ratio(c, H(bg));
    if (r < worst) { worst = r; worstAt = t; worstCol = c; }
  }
  out.ramp.push({ name, floor: +worst.toFixed(2), at: `${Math.round(worstAt * 100)}%`, color: hex(worstCol), min, pass: worst >= min, samples: 41 });
}

// ── 3. PAINTED PIXELS: does the reader actually see the effect? ──
async function pixelReport(label, locator, opts = {}) {
  const buf = await locator.screenshot();
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const k = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = info.width * info.height;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const bg = sorted[0][0].split(',').map(Number);
  // "core ink" = the highest-contrast colour that still covers >= 0.3% of the
  // box; a single antialiased pixel is not what a reader sees.
  let best = { r: 1, col: bg, share: 0 };
  for (const [k, n] of sorted) {
    if (n / total < 0.003) continue;
    const col = k.split(',').map(Number);
    const r = ratio(col, bg);
    if (r > best.r) best = { r, col, share: n / total };
  }
  const distinct = counts.size;
  out.pixels.push({
    label, box: `${info.width}x${info.height}`, bg: hex(bg), ink: hex(best.col),
    contrast: +best.r.toFixed(2), inkShare: +(best.share * 100).toFixed(1), distinctColors: distinct, ...opts,
  });
  return best.r;
}

// home card title — resting, hovered-card, hovered-title at 3 x positions
await page.goto(U('/'));
const card = page.locator('section[aria-label="최신 리뷰"] .card-link').first();
const title = card.locator('.title-spot').first();
await title.scrollIntoViewIfNeeded();
await pixelReport('홈 카드 제목 — 비호버(휴지)', title, { state: 'rest' });
await card.locator('.excerpt, .date').first().hover();
await page.waitForTimeout(300);
await pixelReport('홈 카드 제목 — 카드 hover(단색 라벤더)', title, { state: 'card-hover' });
const box = await title.boundingBox();
for (const f of [0.1, 0.5, 0.9]) {
  await page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await pixelReport(`홈 카드 제목 — 제목 hover, 커서 x=${f}`, title, { state: `spot@${f}` });
}
// Charts head (fixed gradient) + score plate + chart leader plate
await page.mouse.move(0, 0);
await page.waitForTimeout(200);
await pixelReport('Charts 섹션 제목 (--head-sheen 클리핑)', page.locator('.section-head .title.head-sheen').first());
await pixelReport('차트 1위 랭크 플레이트 (--accent-sheen 위 --on-accent)', page.locator('.chart-card.first .rank-plate').first());

// archive row title spotlight (worst-case wash behind a row)
await page.goto(U('/archive/reviews/'));
const rowTitle = page.locator('.row-card-link .title-spot').first();
await rowTitle.scrollIntoViewIfNeeded();
await pixelReport('아카이브 행 제목 — 비호버', rowTitle, { state: 'rest' });
const rb = await rowTitle.boundingBox();
for (const f of [0.15, 0.5, 0.85]) {
  await page.mouse.move(rb.x + rb.width * f, rb.y + rb.height / 2);
  await page.waitForTimeout(300);
  await pixelReport(`아카이브 행 제목 — hover 커서 x=${f}`, rowTitle, { state: `spot@${f}` });
}
await pixelReport('썸네일 점수 칩 (커버 위 불투명 배경)', page.locator('.thumb-score').first());

// review page: score mark + prose
await page.goto(U('/reviews/aurora-line-first-light/'));
await pixelReport('평론 점수 마크 (--accent-sheen 플레이트)', page.locator('.score-mark').first());

// ── 4. focus-visible ring, measured against what it sits on ──
await page.goto(U('/'));
const focus = await page.evaluate(() => {
  const results = [];
  const targets = [
    ['마스트헤드 내비 링크', '.nav-link'],
    ['홈 카드 링크', 'section[aria-label="최신 리뷰"] .card-link'],
    ['차트 행 링크', '.chart-card a.row-link'],
    ['푸터 About', '.footer-about'],
    ['페이저 버튼', '.pager-btn'],
  ];
  for (const [label, sel] of targets) {
    const el = document.querySelector(sel);
    if (!el) { results.push({ label, sel, missing: true }); continue; }
    el.focus();
    const cs = getComputedStyle(el);
    // what the ring is drawn over: the nearest ancestor with a real bg
    let p = el, bg = 'rgba(0, 0, 0, 0)';
    while (p && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
    results.push({ label, sel, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, offset: cs.outlineOffset, over: bg });
  }
  return results;
});
const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
for (const f of focus) {
  if (f.missing) { out.focus.push(f); continue; }
  out.focus.push({ ...f, ratio: +ratio(rgb(f.color), rgb(f.over)).toFixed(2), min: 3.0, pass: ratio(rgb(f.color), rgb(f.over)) >= 3.0 });
}

// ── 5. forced-colors: active — does anything go invisible? ──
await page.emulateMedia({ forcedColors: 'active' });
await page.goto(U('/'));
await page.waitForTimeout(300);
const fc = await page.evaluate(() => {
  const probe = (label, sel) => {
    const el = document.querySelector(sel);
    if (!el) return { label, missing: true };
    const cs = getComputedStyle(el);
    return { label, color: cs.color, bgImage: cs.backgroundImage === 'none' ? 'none' : 'GRADIENT', bg: cs.backgroundColor, adjust: cs.forcedColorAdjust, border: cs.borderTopWidth };
  };
  return [
    probe('Charts 제목 .head-sheen', '.section-head .title.head-sheen'),
    probe('카드 제목 .title-spot', 'section[aria-label="최신 리뷰"] .title-spot'),
    probe('차트 1위 플레이트 .rank-plate', '.chart-card.first .rank-plate'),
    probe('본문 링크', 'main a'),
  ];
});
out.forced = fc;
// pixel proof under forced colors: the Charts heading must still have ink
const fcHead = page.locator('.section-head .title.head-sheen').first();
await fcHead.scrollIntoViewIfNeeded();
await pixelReport('forced-colors: Charts 제목', fcHead, { state: 'forced-colors' });
await page.emulateMedia({ forcedColors: 'none' });

// ── 6. prefers-contrast: more ──
await page.emulateMedia({ contrast: 'more' });
await page.goto(U('/'));
const pc = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return { line: cs.getPropertyValue('--line').trim(), muted: cs.getPropertyValue('--muted').trim() };
});
out.prefersContrast = pc;

await browser.close();
srv.kill();
console.log('\n===== RESULT JSON =====');
console.log(JSON.stringify(out, null, 2));
