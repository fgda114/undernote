/**
 * COLOUR, MEASURED — tokens, the whole gradient ramp, the focus ring, and
 * PAINTED PIXELS (2026-09-07, Matthias).
 *
 * WHY PIXELS AND NOT COMPUTED STYLE. The W6 incident that nearly shipped was
 * `background-clip: text` + `color: transparent` losing a specificity fight,
 * so a gradient sat under an opaque colour and the effect was simply not
 * there. Every existing gate — typecheck, unit, e2e, determinism — passed.
 * The only thing that could have caught it was looking at what the renderer
 * actually painted. So the three tests at the bottom of this file take a
 * screenshot of a text run, clipped to THE GLYPHS rather than the element
 * box (a row title's span is ~1000px wide and mostly empty — a statistic
 * taken over the box is diluted into meaninglessness), and ask one question
 * of the bitmap: is there ink here, and does it contrast with its own
 * background?
 *
 * "핵심 잉크" = the highest-contrast colour that still covers ≥0.3% of the
 * clipped box. A single antialiased pixel is not something a reader sees;
 * a colour that paints a few hundred pixels of a glyph run is.
 *
 * The numbers in tokens.css's comments are reproduced here as ASSERTIONS
 * rather than as prose. A comment claiming 13.50:1 is a claim; this file is
 * the measurement. `e2e/lib/measure-a11y.mjs` prints the same figures as a
 * report when someone needs the whole table.
 */
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
// `sharp` is NOT in e2e/package.json and does not need to be: node resolution
// walks up from e2e/ to the product's own node_modules, which the harness
// already depends on through the sandbox junction (every build test needs it).
// Adding a second copy here would be a second version to keep in step.
import sharp from 'sharp';
import { SANDBOX_ROOT, basePathOf } from '../lib/sandbox.mjs';

const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
const u = (p: string) => `${B}${p}`;

// ── WCAG 2.x relative luminance ────────────────────────────────────────
const chan = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: number[]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hx = (h: string) => { const s = h.trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const rgb = (s: string) => s.match(/\d+/g)!.slice(0, 3).map(Number);
const hex = ([r, g, b]: number[]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Screenshot a text run clipped to its glyphs and report the ink that a
 *  reader actually sees against the background it is actually on. */
async function inkOf(page: Page, selector: string, nth = 0) {
  await page.locator(selector).nth(nth).scrollIntoViewIfNeeded();
  const clip = await page.evaluate(
    ({ selector, nth }) => {
      const el = document.querySelectorAll(selector)[nth];
      if (!el) return null;
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      return { x: Math.floor(b.x), y: Math.floor(b.y), width: Math.ceil(b.width), height: Math.ceil(b.height) };
    },
    { selector, nth },
  );
  if (!clip || clip.width < 2 || clip.height < 2) throw new Error(`글리프 범위를 못 구함: ${selector}`);
  const { data, info } = await sharp(await page.screenshot({ clip })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += info.channels) counts.set(`${data[i]},${data[i + 1]},${data[i + 2]}`, (counts.get(`${data[i]},${data[i + 1]},${data[i + 2]}`) ?? 0) + 1);
  const total = info.width * info.height;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const bg = sorted[0][0].split(',').map(Number);
  let ink = { ratio: 1, color: bg, share: 0 };
  for (const [k, n] of sorted) {
    if (n / total < 0.003) continue;
    const color = k.split(',').map(Number);
    const r = ratio(color, bg);
    if (r > ink.ratio) ink = { ratio: r, color, share: n / total };
  }
  return { bg, ...ink, box: `${info.width}x${info.height}` };
}

// ── 1. Tokens ──────────────────────────────────────────────────────────
test('대비 — 토큰 조합 실측 (AA 4.5:1 · UI 3:1)', async ({ page }) => {
  await page.goto(u('/'));
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (n: string) => cs.getPropertyValue(n).trim();
    return Object.fromEntries(
      ['--bg','--surface','--surface-2','--surface-3','--ink','--ink-prose','--muted','--line','--line-strong','--accent','--accent-ink','--on-accent','--accent-2','--accent-2-ink','--on-accent-2','--critical','--warn'].map((n) => [n, get(n)]),
    ) as Record<string, string>;
  });
  const table: [string, string, string, number][] = [
    ['--ink on --bg', t['--ink'], t['--bg'], 4.5],
    ['--ink-prose on --bg', t['--ink-prose'], t['--bg'], 4.5],
    ['--ink-prose on --surface', t['--ink-prose'], t['--surface'], 4.5],
    ['--muted on --bg', t['--muted'], t['--bg'], 4.5],
    // The worst case a reader is exposed to: secondary text on the deepest
    // surface step. If any single number in this file is going to fall below
    // AA first, it is this one.
    ['--muted on --surface-3', t['--muted'], t['--surface-3'], 4.5],
    ['--accent-ink on --bg', t['--accent-ink'], t['--bg'], 4.5],
    ['--accent-2-ink on --bg', t['--accent-2-ink'], t['--bg'], 4.5],
    ['--accent-2-ink on --surface-2', t['--accent-2-ink'], t['--surface-2'], 4.5],
    ['--on-accent on --accent', t['--on-accent'], t['--accent'], 4.5],
    ['--on-accent-2 on --accent-2', t['--on-accent-2'], t['--accent-2'], 4.5],
    ['--line-strong on --bg (의미 있는 보더)', t['--line-strong'], t['--bg'], 3.0],
    ['--critical on --bg', t['--critical'], t['--bg'], 4.5],
    ['--warn on --bg', t['--warn'], t['--bg'], 4.5],
  ];
  const failures: string[] = [];
  const lines: string[] = [];
  for (const [name, fg, bg, min] of table) {
    const r = ratio(hx(fg), hx(bg));
    lines.push(`${name}: ${r.toFixed(2)}:1 (기준 ${min})`);
    if (r < min) failures.push(`${name} — ${r.toFixed(2)}:1 < ${min}`);
  }
  console.log(`토큰 대비 실측:\n  ${lines.join('\n  ')}`);
  expect(failures, failures.join('\n')).toEqual([]);

  // --line is DECORATION ONLY (tokens.css). Asserted as an upper bound, not
  // a lower one: the moment it clears 3:1 someone will start using it to
  // carry meaning, and the token's contract says it may not.
  expect(ratio(hx(t['--line']), hx(t['--bg'])), '--line이 의미선 수준까지 올라옴 — 용도 재확인 필요').toBeLessThan(3.0);
});

// ── 2. The whole ramp, not its endpoints ───────────────────────────────
test('대비 — 그라데이션 램프 전 구간 (41점 샘플)', async ({ page }) => {
  await page.goto(u('/'));
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      head: cs.getPropertyValue('--head-sheen').trim(),
      accent: cs.getPropertyValue('--accent-sheen').trim(),
      bg: cs.getPropertyValue('--bg').trim(),
      surface2: cs.getPropertyValue('--surface-2').trim(),
      onAccent: cs.getPropertyValue('--on-accent').trim(),
      mint: cs.getPropertyValue('--accent-ink').trim(),
      lav: cs.getPropertyValue('--accent-2-ink').trim(),
    };
  });
  /** Stops of a plain sRGB linear-gradient. These gradients are declared in
   *  sRGB deliberately (tokens.css) — interpolating here the same way the
   *  engine does is what makes a sampled midpoint a real colour and not an
   *  estimate. */
  const stops = (g: string) =>
    g.slice(g.indexOf('(') + 1, g.lastIndexOf(')'))
      .split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => /%/.test(s))
      .map((p) => {
        const m = p.match(/(#[0-9a-f]{6}|rgba?\([^)]*\))\s*([\d.]+)%/i)!;
        return { col: m[1].startsWith('#') ? hx(m[1]) : rgb(m[1]), pos: parseFloat(m[2]) / 100 };
      });
  const at = (ss: ReturnType<typeof stops>, x: number) => {
    if (x <= ss[0].pos) return ss[0].col;
    for (let i = 1; i < ss.length; i++) {
      if (x <= ss[i].pos) {
        const f = (x - ss[i - 1].pos) / (ss[i].pos - ss[i - 1].pos);
        return ss[i - 1].col.map((c, k) => Math.round(c + (ss[i].col[k] - c) * f));
      }
    }
    return ss[ss.length - 1].col;
  };
  // TWO RAMPS, NOT FOUR (2026-09-07). --title-spot was withdrawn, so the two
  // rows that sampled it are gone from HERE and not from the suite: a hovered
  // list title is now a FLAT colour, which is a token pair rather than a ramp,
  // and the token table above already asserts both of the backgrounds it lands
  // on (--accent-2-ink on --surface-2 for the hovered card, on --bg for the
  // archive row). A flat colour measured 41 times is 41 copies of one number.
  const ramps: [string, string, number, string | null, string | null][] = [
    ['--head-sheen 위 텍스트 on --bg', t.head, 4.5, t.bg, null],
    ['--accent-sheen 면 위의 --on-accent', t.accent, 4.5, null, t.onAccent],
  ];
  // Kept as a live reference so the removal above cannot quietly become "the
  // hovered title is no longer measured anywhere".
  expect(ratio(hx(t.lav), hx(t.surface2)), 'hover된 카드 제목이 카드 면에서 AA 미달').toBeGreaterThanOrEqual(4.5);
  expect(ratio(hx(t.lav), hx(t.bg)), 'hover된 행 제목이 지면 바탕에서 AA 미달').toBeGreaterThanOrEqual(4.5);
  const failures: string[] = [];
  const lines: string[] = [];
  for (const [name, grad, min, bg, over] of ramps) {
    const ss = stops(grad);
    let floor = Infinity, where = 0, col: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const c = at(ss, i / 40);
      const r = over ? ratio(hx(over), c) : ratio(c, hx(bg!));
      if (r < floor) { floor = r; where = i / 40; col = c; }
    }
    lines.push(`${name}: 바닥 ${floor.toFixed(2)}:1 @${Math.round(where * 100)}% ${hex(col)}`);
    if (floor < min) failures.push(`${name} — 램프 바닥 ${floor.toFixed(2)}:1 < ${min} (${Math.round(where * 100)}% 지점)`);
  }
  console.log(`램프 바닥 실측 (41점 × 4램프):\n  ${lines.join('\n  ')}`);
  expect(failures, failures.join('\n')).toEqual([]);
});

// ── 3. Focus ring ──────────────────────────────────────────────────────
test('focus-visible — 링이 자기 배경에서 3:1 이상 (전 인터랙티브 유형)', async ({ page }) => {
  await page.goto(u('/'));
  const rings = await page.evaluate(() => {
    const targets: [string, string][] = [
      ['마스트헤드 내비', '.nav-link'],
      ['홈 카드 링크', 'section[aria-label="최신 리뷰"] .card-link'],
      ['차트 행 링크', '.chart-card a.row-link'],
      ['페이저 버튼', '.pager-btn'],
      ['섹션 더보기', '.section-more'],
      ['푸터 About', '.footer-about'],
    ];
    return targets.map(([label, sel]) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { label, sel, missing: true };
      el.focus();
      const cs = getComputedStyle(el);
      let p: HTMLElement | null = el, bg = 'rgba(0, 0, 0, 0)';
      while (p && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
      return { label, sel, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, over: bg };
    });
  });
  const failures: string[] = [];
  const lines: string[] = [];
  for (const r of rings) {
    if (r.missing) { failures.push(`${r.label} — 선택자 ${r.sel} 없음 (스위트가 낡음)`); continue; }
    const c = ratio(rgb(r.color!), rgb(r.over!));
    lines.push(`${r.label}: ${r.style} ${r.width} ${r.color} on ${r.over} = ${c.toFixed(2)}:1`);
    if (r.style === 'none') failures.push(`${r.label} — 아웃라인 없음`);
    if (parseFloat(r.width!) < 2) failures.push(`${r.label} — 아웃라인 ${r.width} (2px 미만)`);
    if (c < 3) failures.push(`${r.label} — 링 대비 ${c.toFixed(2)}:1 < 3`);
  }
  console.log(`포커스 링 실측:\n  ${lines.join('\n  ')}`);
  expect(failures, failures.join('\n')).toEqual([]);
});

// ── 4. Painted pixels: the effect is on the screen, not just in the CSSOM ──
/**
 * REAIMED, NOT RETIRED (2026-09-07). These two tests were written against the
 * cursor spotlight and asked "does the mint band move across the glyphs?".
 * The spotlight was withdrawn, so that question has no subject — but the
 * question UNDER it is the reason the file exists and applies to whatever the
 * hover does: IS THE STATE CHANGE ON THE SCREEN? The W6 incident shipped a
 * page whose computed style changed on hover and whose pixels did not, and a
 * flat colour swap can fail that way just as silently as a gradient can (a
 * lost specificity fight, a rule scoped to the wrong element, an inherited
 * colour that happens to match).
 *
 * So the assertions are the same three, aimed at the flat lavender:
 *   · resting ink is visible against its own background;
 *   · hovered ink is visible;
 *   · hovered ink is a DIFFERENT COLOUR from resting ink — measured in the
 *     bitmap, not in the CSSOM.
 */
test('픽셀 실측 — 카드 제목이 휴지·hover 양쪽에서 보이고, hover가 실제로 칠을 바꾼다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/'));
  const lines: string[] = [];
  const report = async (label: string, sel: string) => {
    const r = await inkOf(page, sel);
    lines.push(`${label}: bg ${hex(r.bg)} · 잉크 ${hex(r.color)} ${r.ratio.toFixed(2)}:1 (${(r.share * 100).toFixed(1)}%) · ${r.box}`);
    return r;
  };

  const CARD_TITLE = 'section[aria-label="최신 리뷰"] .card .title';
  const rest = await report('홈 카드 제목 — 휴지', CARD_TITLE);
  expect(rest.ratio, '비호버 카드 제목이 배경과 구분되지 않음 (투명 제목)').toBeGreaterThanOrEqual(4.5);

  // Hover the CARD but not the title.
  await page.locator('section[aria-label="최신 리뷰"] .card-link .excerpt, section[aria-label="최신 리뷰"] .card-link .date').first().hover();
  await page.waitForTimeout(250);
  const flat = await report('홈 카드 제목 — 카드 hover', CARD_TITLE);
  expect(flat.ratio).toBeGreaterThanOrEqual(4.5);

  // Hover the TITLE itself: same answer, and it has to be painted at every
  // point along the run — a rule that only reaches part of the glyphs would
  // show up here as a different dominant ink at one of the three positions.
  const glyph = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!; const r = document.createRange(); r.selectNodeContents(el);
    const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, CARD_TITLE);
  const painted: string[] = [];
  for (const f of [0.1, 0.5, 0.9]) {
    await page.mouse.move(glyph.x + glyph.w * f, glyph.y + glyph.h / 2);
    await page.waitForTimeout(300);
    const r = await report(`홈 카드 제목 — 제목 hover x=${f}`, CARD_TITLE);
    expect(r.ratio, `hover 상태에서 글리프가 안 보임 (x=${f})`).toBeGreaterThanOrEqual(4.5);
    painted.push(hex(r.color));
  }
  expect(new Set([...painted, hex(flat.color)]).size, `제목 위치에 따라 칠이 달라짐: ${painted.join(' / ')}`).toBe(1);
  // The hover REACHED THE PIXELS. Equal colours here would mean the affordance
  // exists only in the stylesheet.
  expect(hex(flat.color), 'hover 전후로 칠해진 색이 같음 — hover 반응이 화면에 없다').not.toBe(hex(rest.color));

  console.log(`픽셀 실측 (홈 카드):\n  ${lines.join('\n  ')}`);
});

test('픽셀 실측 — 아카이브 행 제목의 hover 반응이 글리프에 실제로 칠해진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/archive/reviews/'));
  const SEL = '.row-card-link .title';
  await page.locator(SEL).first().scrollIntoViewIfNeeded();
  const rest = await inkOf(page, SEL);
  expect(rest.ratio, '비호버 행 제목이 안 보임').toBeGreaterThanOrEqual(4.5);

  const glyph = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!; const r = document.createRange(); r.selectNodeContents(el);
    const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, SEL);
  const seen: string[] = [];
  const lines = [`휴지: ${hex(rest.color)} ${rest.ratio.toFixed(2)}:1`];
  for (const f of [0.1, 0.5, 0.9]) {
    await page.mouse.move(glyph.x + glyph.w * f, glyph.y + glyph.h / 2);
    await page.waitForTimeout(320);
    const r = await inkOf(page, SEL);
    lines.push(`hover x=${f}: ${hex(r.color)} ${r.ratio.toFixed(2)}:1 (${(r.share * 100).toFixed(1)}%)`);
    expect(r.ratio, `행 제목이 hover 상태에서 안 보임 (x=${f})`).toBeGreaterThanOrEqual(4.5);
    seen.push(hex(r.color));
  }
  console.log(`픽셀 실측 (아카이브 행):\n  ${lines.join('\n  ')}`);
  expect(new Set(seen).size, `제목 위치에 따라 칠이 달라짐: ${seen.join(' / ')}`).toBe(1);
  expect(seen[0], 'hover 전후로 칠해진 색이 같음 — hover 반응이 화면에 없다').not.toBe(hex(rest.color));
});

// ── 5. forced-colors ───────────────────────────────────────────────────
/**
 * Windows High Contrast. Dark is FIXED on this site and there is no toggle,
 * so `forced-colors` and `prefers-contrast` are, by the palette's own
 * declaration (tokens.css), THE ONLY colour controls a reader has left.
 * That makes this the highest-stakes untested path on the page, and it is
 * tested by PIXELS rather than by computed style because the failure mode
 * here is the same one W6 already hit once: a rule that sets
 * `forced-color-adjust: none` uncontested while its `color` companion loses
 * a specificity fight leaves the UA told not to help AND the dark-theme ink
 * on the reader's white canvas.
 */
test('forced-colors — 전 텍스트 역할이 시스템 캔버스에서 보인다 (픽셀)', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(u('/'));
  await page.waitForTimeout(300);

  const canvas = rgb(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  const lines: string[] = [`캔버스: ${hex(canvas)}`];
  const failures: string[] = [];
  const probes: [string, string][] = [
    // The selector moved with the markup: this element used to be
    // `.title-spot`, and the 1.21:1 it reported is the defect that removing
    // the spotlight closed. It is probed by ROLE (the browsing card's title)
    // so the measurement survives the class going away.
    ['홈 카드 제목', 'section[aria-label="최신 리뷰"] .card .title'],
    ['Charts 제목 (.head-sheen)', '.section-head .title.head-sheen'],
    ['카드 발췌', 'section[aria-label="최신 리뷰"] .excerpt'],
    ['차트 카드 제목', '.chart-card .title'],
    ['섹션 더보기 링크', '.section-more'],
  ];
  for (const [label, sel] of probes) {
    const r = await inkOf(page, sel);
    lines.push(`${label}: bg ${hex(r.bg)} · 잉크 ${hex(r.color)} ${r.ratio.toFixed(2)}:1 (${(r.share * 100).toFixed(1)}%)`);
    if (r.ratio < 4.5) failures.push(`${label} — 고대비 모드에서 ${r.ratio.toFixed(2)}:1 (${hex(r.color)} on ${hex(r.bg)})`);
  }

  await page.goto(u('/archive/reviews/'));
  await page.waitForTimeout(200);
  const row = await inkOf(page, '.row-card-link .title');
  lines.push(`아카이브 행 제목: bg ${hex(row.bg)} · 잉크 ${hex(row.color)} ${row.ratio.toFixed(2)}:1`);
  if (row.ratio < 4.5) failures.push(`아카이브 행 제목 — 고대비 모드에서 ${row.ratio.toFixed(2)}:1`);

  console.log(`forced-colors 픽셀 실측:\n  ${lines.join('\n  ')}`);
  expect(failures, `고대비 모드에서 안 보이는 텍스트:\n${failures.join('\n')}`).toEqual([]);
});

test('prefers-contrast: more — 헤어라인 승격 · 보조 텍스트 본문색', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' });
  await page.goto(u('/'));
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      line: cs.getPropertyValue('--line').trim(),
      lineStrong: cs.getPropertyValue('--line-strong').trim(),
      muted: cs.getPropertyValue('--muted').trim(),
      ink: cs.getPropertyValue('--ink').trim(),
      bg: cs.getPropertyValue('--bg').trim(),
    };
  });
  expect(t.line, '대비 선호에서 헤어라인이 승격되지 않음').toBe(t.lineStrong);
  expect(t.muted, '대비 선호에서 보조 텍스트가 본문색으로 오르지 않음').toBe(t.ink);
  expect(ratio(hx(t.muted), hx(t.bg))).toBeGreaterThanOrEqual(7); // AAA
});
