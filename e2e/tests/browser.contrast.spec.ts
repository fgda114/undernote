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
      // 캐러셀 버튼 (2026-09-10 rebuild): the previous `.pager-btn` row was
      // removed the same day the control was briefly deleted, then restored
      // under its new name and shape (`.carousel-btn`, a real `<button>`
      // rather than an anchor — see index.astro's intro for the round trip).
      // `.carousel-btn:not(:disabled)` specifically: the `prev` button opens
      // `disabled` (the carousel always starts on card 0), and a disabled
      // native button cannot receive focus at all — `el.focus()` below would
      // silently no-op on it and report whatever ring was already showing
      // elsewhere on the page, not this control's own ring.
      ['캐러셀 버튼', '.carousel-btn:not(:disabled)'],
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

  // Archive search input (search-hub design, 2026-09-09) — the one new
  // focusable control this round added. It lives on /archive/, not the home
  // page every row above is read from, so it gets its own navigation rather
  // than riding on the home evaluate() call above.
  await page.goto(u('/archive/'));
  const searchRing = await page.evaluate(() => {
    const el = document.querySelector('.search-input') as HTMLElement | null;
    if (!el) return null;
    el.focus();
    const cs = getComputedStyle(el);
    let p: HTMLElement | null = el, bg = 'rgba(0, 0, 0, 0)';
    while (p && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
    return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, over: bg };
  });
  if (!searchRing) {
    failures.push('아카이브 검색창 — 선택자 .search-input 없음 (스위트가 낡음)');
  } else {
    const c = ratio(rgb(searchRing.color), rgb(searchRing.over));
    lines.push(`아카이브 검색창: ${searchRing.style} ${searchRing.width} ${searchRing.color} on ${searchRing.over} = ${c.toFixed(2)}:1`);
    if (searchRing.style === 'none') failures.push('아카이브 검색창 — 아웃라인 없음');
    if (parseFloat(searchRing.width) < 2) failures.push(`아카이브 검색창 — 아웃라인 ${searchRing.width} (2px 미만)`);
    if (c < 3) failures.push(`아카이브 검색창 — 링 대비 ${c.toFixed(2)}:1 < 3`);
  }

  // Axis chips (axis-chip redesign, 2026-09-09) — resting AND pressed. The
  // pressed state flips the chip's own fill/border to --accent-2 (see
  // archive/index.astro's `.chip[aria-pressed='true']`), and that same rule
  // flips the focus ring's colour too (the `.plate` pattern global.css
  // already uses for --accent) — checked separately because a ring that
  // reads fine at rest could still vanish once pressed if that second flip
  // were ever dropped.
  const chipRings = await page.evaluate(() => {
    const chip = document.querySelector('.chip[data-axis-value]') as HTMLElement | null;
    if (!chip) return null;
    const ring = () => {
      chip.focus();
      const cs = getComputedStyle(chip);
      let p: HTMLElement | null = chip, bg = 'rgba(0, 0, 0, 0)';
      while (p && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
      return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, over: bg };
    };
    const rest = ring();
    chip.click();
    const pressed = ring();
    chip.click(); // toggle back off — leave the page as it was found
    return { rest, pressed };
  });
  if (!chipRings) {
    failures.push('아카이브 축 칩 — 선택자 .chip[data-axis-value] 없음 (스위트가 낡음)');
  } else {
    for (const [state, r] of [['휴지', chipRings.rest], ['눌림', chipRings.pressed]] as const) {
      const c = ratio(rgb(r.color), rgb(r.over));
      lines.push(`아카이브 축 칩(${state}): ${r.style} ${r.width} ${r.color} on ${r.over} = ${c.toFixed(2)}:1`);
      if (r.style === 'none') failures.push(`아카이브 축 칩(${state}) — 아웃라인 없음`);
      if (parseFloat(r.width) < 2) failures.push(`아카이브 축 칩(${state}) — 아웃라인 ${r.width} (2px 미만)`);
      if (c < 3) failures.push(`아카이브 축 칩(${state}) — 링 대비 ${c.toFixed(2)}:1 < 3`);
    }
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

  // Archive search + chip UI (2026-09-09) — the label, the live result
  // count, and an axis chip are the new text roles this round added. The
  // count is `hidden` at rest (2026-09-09 revision — see archive/index.
  // astro's intro), so a query is typed first to reveal it before probing;
  // an element with zero rendered size has no glyphs for `inkOf` to clip.
  // The input's own placeholder/typed text is left to the UA's own
  // forced-colors form-control handling, which this suite does not
  // otherwise probe.
  await page.goto(u('/archive/'));
  await page.waitForTimeout(200);
  await page.fill('#archive-q', '2026');
  for (const [label, sel] of [
    ['검색 라벨', '.search .axis-title'] as const,
    ['검색 결과 카운트', '.search-count'] as const,
    ['아카이브 축 칩', '.chip[data-axis-value]'] as const,
  ]) {
    const r = await inkOf(page, sel);
    lines.push(`${label}: bg ${hex(r.bg)} · 잉크 ${hex(r.color)} ${r.ratio.toFixed(2)}:1 (${(r.share * 100).toFixed(1)}%)`);
    if (r.ratio < 4.5) failures.push(`${label} — 고대비 모드에서 ${r.ratio.toFixed(2)}:1 (${hex(r.color)} on ${hex(r.bg)})`);
  }

  console.log(`forced-colors 픽셀 실측:\n  ${lines.join('\n  ')}`);
  expect(failures, `고대비 모드에서 안 보이는 텍스트:\n${failures.join('\n')}`).toEqual([]);
});

// ── 6. --bg-sheen — exists everywhere, not re-asserted by colour value ────
/**
 * 배경 그라데이션 일관성 (2026-09-10, 결정권자 지시: "모바일 화면에서 배경 색
 * 그라데이션 들어가있는데 모바일 홈화면이랑 데스크탑 전체에서는 그라데이션
 * 없어. 다 그라데이션 있게 고쳐줘"). `--bg-sheen`(tokens.css)가 `1100px 620px
 * at 18% -12%` 같은 px+percent-of-body 좌표를 썼던 시절에는, 문서 높이가
 * 뷰포트보다 큰 어느 지면에서든 `%` 위치가 문서 전체 높이 기준으로 계산돼
 * 화면 최상단 ~300px 안에서 완전히 사라졌다 — 데스크톱일수록, 그리고 지면이
 * 길수록 더 빨리. `vw`/`vh`로 바꾼 근거와 실측은 tokens.css의 --bg-sheen
 * 코멘트에 있다.
 *
 * 색값을 다시 적는 테스트는 쓸모없다 — 구현과 테스트가 같이 틀릴 수 있다
 * (tokens.css가 잘못된 rgba를 적어도, 그 값을 그대로 베낀 테스트는 통과한다).
 * 그 대신 "렌더된 픽셀이 배경색과 실제로 다른가"를 잰다: 모든 요소를
 * `visibility:hidden`으로 감추면 <body> 자신이 칠한 바닥만 남는다(팀장의
 * 방법 그대로) — 그 위에서 스크린샷을 찍어 raw 픽셀을 읽는다.
 */
async function sheenColumn(page: Page, x: number, sampleHeight: number) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) (el as HTMLElement).style.visibility = 'hidden';
  });
  const clip = { x, y: 0, width: 1, height: sampleHeight };
  const { data, info } = await sharp(await page.screenshot({ clip })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rows: number[][] = [];
  for (let y = 0; y < info.height; y++) {
    const i = y * info.channels;
    rows.push([data[i], data[i + 1], data[i + 2]]);
  }
  return rows;
}

test('배경 그라데이션 — 전 지면·전 폭에서 존재 (홈·리뷰 상세 × 모바일·데스크톱)', async ({ page }) => {
  // BUG FOUND BY THE LEAD (2026-09-10): a first version read `--bg` via
  // `getComputedStyle` ONCE, before the loop's first `page.goto()` — i.e.
  // against `about:blank`, where the custom property does not exist. `hx('')`
  // silently produced `[NaN, NaN, NaN]`, and every `Math.abs(px - NaN) > 2`
  // comparison below is `false` no matter what the pixel is — the test
  // reported "no pixel differs from --bg anywhere" on EVERY page, including
  // ones a screenshot plainly shows the wash on (the lead's own real-build
  // measurement caught this; the mutation test that should have caught it
  // never ran against a passing baseline first — see frontend.md).
  //
  // Fixed by not reading a CSS token as the reference at all (the lead's
  // suggestion): the reference background is the sampled column's OWN bottom
  // pixel — well below where the wash has measurably faded to nothing at
  // every target below — so the comparison never depends on `page.goto`
  // having run yet, or on any value read outside the loop.
  const targets: [string, string, number, number][] = [
    ['홈 · 모바일', u('/'), 390, 900],
    ['홈 · 데스크톱', u('/'), 1440, 1000],
    ['리뷰 상세 · 모바일', u('/reviews/aurora-line-first-light/'), 390, 900],
    ['리뷰 상세 · 데스크톱', u('/reviews/aurora-line-first-light/'), 1440, 1000],
  ];
  const failures: string[] = [];
  const lines: string[] = [];
  for (const [label, path, width, height] of targets) {
    await page.setViewportSize({ width, height });
    await page.goto(path);
    await page.waitForTimeout(150);
    const col = await sheenColumn(page, 5, height);
    const bg = col[col.length - 1];
    // "존재" = 칼럼 맨 아래(순수 배경) 톤과 조금이라도 다른 픽셀이 있다.
    // sRGB 채널 diff 2는 스크린샷 인코딩 자체의 반올림보다는 크고, 실측된
    // 실제 차이(수 채널 10~20)보다는 훨씬 작은 문턱이라 오탐(과대 판정)도
    // 누락(과소 판정)도 만들지 않는다.
    const differs = (px: number[]) => Math.abs(px[0] - bg[0]) > 2 || Math.abs(px[1] - bg[1]) > 2 || Math.abs(px[2] - bg[2]) > 2;
    const existsAt = col.findIndex(differs);
    // "첫 화면 안에서 사라지지 않는다" = 위쪽 근처(상단 1/4)뿐 아니라 화면
    // 중간대(y = height*0.4 ~ height*0.7 사이의 어느 한 지점)에서도 바닥과
    // 구분되는 픽셀이 있다 — 이게 원래 결함의 실측 지점("첫 화면 위쪽 ~300px
    // 안에서 완전히 소실")과 정확히 겹치는 구간이다.
    const midStart = Math.floor(height * 0.4);
    const midEnd = Math.floor(height * 0.7);
    const existsMid = col.slice(midStart, midEnd).some(differs);
    lines.push(`${label}: bg(맨아래) ${hex(bg)} · 상단 첫 발견=${existsAt < 0 ? '없음' : `y=${existsAt}`} · 중간대(${midStart}-${midEnd}) 존재=${existsMid}`);
    if (existsAt < 0) failures.push(`${label} — 화면 어디에서도 맨아래 바닥색과 다른 픽셀이 없음 (그라데이션 미표시)`);
    if (!existsMid) failures.push(`${label} — 중간대(${midStart}~${midEnd}px)에서 바닥색과 같음 — 첫 화면 안에서 소실`);
  }
  console.log(`배경 그라데이션 존재 실측:\n  ${lines.join('\n  ')}`);
  expect(failures, failures.join('\n')).toEqual([]);
});

/**
 * `--line-strong` 위 워시 대비 (2026-09-10, QA 권고 — 리드 채택, 리드 재검토
 * 후 방법 변경). `--bg-sheen` 기하 변경(위 테스트) 전까지 이 저장소의 대비
 * 테스트 전부가 평평한 `--bg` 위에서만 재고 있었다 — 그라데이션이 실제로
 * 밝히는 워시 색 위의 대비는 이 스위트 어디에도 게이트가 없었다.
 *
 * 첫 버전은 `.chart-carousel .carousel-btn.next` 한 지점의 보더-배경 쌍을
 * 그 자리에서 통째로 쟀다 — 그런데 그 버튼은 워시 피크(`--bg-sheen`의 두 레이어
 * 중심, 뷰포트 최상단 좌우)가 아니라 섹션 헤드 아래, 화면 중간 높이에 있다.
 * 거기 워시가 피크보다 약하면 이 테스트는 최악이 아닌 더 쉬운 조건을 재고
 * 통과시켜, 알파를 올렸을 때 정작 더 위쪽의 다른 보더가 조용히 깨지는 걸
 * 못 잡을 수 있다 — 검사가 있는데도 못 잡는, 이 저장소가 반복해 온 형태다.
 * 리드 지시로 두 값을 각각 독립적으로 뽑아 합치는 방식으로 바꿨다:
 *
 *   ① 보더의 실제 칠해진 색 — `--line-strong`은 불투명이라 위치와 무관하게
 *      항상 같은 색이다. 버튼 하나에서 그대로 읽는다(위치는 무관, 표본일 뿐).
 *   ② 그 페이지에서 워시가 가장 밝은 지점 — 전 요소 `visibility:hidden`
 *      스크린샷(위 존재 테스트와 같은 방법)에서 **가장 밝은(명도 최댓값)
 *      픽셀**을 찾는다. `--line-strong`(#6f7791 상당의 중간 회색)은 `--bg`
 *      보다 항상 밝고 워시는 배경을 밝히기만 하므로(어둡게 하지 않음), 가장
 *      밝은 배경 픽셀이 보더 색에 가장 가까워지는 지점 = 실제 최악이다.
 *
 * `tokens.css`를 읽지 않는다 — 둘 다 스크린샷 픽셀에서 뽑고, 대비만 계산한다.
 * 보더가 실제로 어디 있든, 앞으로 다른 요소로 옮겨져도 이 조합 자체는 유효하다.
 * 폭 여러 개(390/768/1440)에서 잰다 — 기하가 vw/vh이므로 워시 피크의 절대
 * 밝기가 폭에 따라 달라질 수 있다.
 */
async function borderColor(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} — boundingBox 없음`);
  const cx = Math.round(box.x + box.width / 2);
  const top = Math.round(box.y);
  // 원형 버튼(`border-radius: var(--r-full)`)의 정점(top-center) — 폭 1px
  // 보더가 안티앨리어싱 없이 가장 또렷하게 걸리는 지점. 위 8px(배경)부터
  // 아래 6px(버튼 내부)까지 세로로 가로지르는 스트립을 찍어, 배경에서
  // 뚜렷하게(채널당 8 이상) 갈라지는 첫 행을 보더로 삼는다 — 불투명한 색이라
  // 어디서 재든 같아야 하고, 안티앨리어싱이 섞이면 순수색보다 오히려 더
  // 엄격한(대비를 낮게 잡는) 쪽으로만 치우친다.
  const clip = { x: cx, y: top - 8, width: 1, height: 14 };
  const { data, info } = await sharp(await page.screenshot({ clip })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rows: number[][] = [];
  for (let y = 0; y < info.height; y++) {
    const i = y * info.channels;
    rows.push([data[i], data[i + 1], data[i + 2]]);
  }
  const bg = rows[0];
  const border = rows.slice(1).find((px) => Math.abs(px[0] - bg[0]) > 8 || Math.abs(px[1] - bg[1]) > 8 || Math.abs(px[2] - bg[2]) > 8);
  if (!border) throw new Error(`${selector} — 배경과 구분되는 테두리 전환부를 못 찾음 (스트립: ${JSON.stringify(rows)})`);
  return border;
}

/** 전 요소를 숨긴 뒤 지면 전체(뷰포트 높이만큼)를 스크린샷해 명도가 가장 높은
 *  픽셀을 찾는다 — `sheenColumn`과 같은 은폐 기법이지만 한 줄이 아니라 2D
 *  전체를 스캔해 "이 폭에서 워시가 실제로 도달하는 최댓값"을 구한다. */
async function brightestPixel(page: Page, width: number, height: number) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) (el as HTMLElement).style.visibility = 'hidden';
  });
  const { data, info } = await sharp(await page.screenshot({ clip: { x: 0, y: 0, width, height } }))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let best = [0, 0, 0];
  let bestLum = -1;
  for (let i = 0; i < data.length; i += info.channels) {
    const px = [data[i], data[i + 1], data[i + 2]];
    const l = lum(px);
    if (l > bestLum) {
      bestLum = l;
      best = px;
    }
  }
  return best;
}

test('대비 — --line-strong 보더가 지면 최밝 지점(워시 피크) 위에서도 3:1 이상 (픽셀 실측, 폭 3종)', async ({ page }) => {
  const failures: string[] = [];
  const lines: string[] = [];
  for (const width of [390, 768, 1440]) {
    const height = 1000;
    await page.setViewportSize({ width, height });
    await page.goto(u('/'));
    const border = await borderColor(page, '.chart-carousel .carousel-btn.next');
    // brightestPixel이 전 요소를 숨기므로, 보더 색은 그 전에 이미 뽑아 둔다.
    const brightest = await brightestPixel(page, width, height);
    const r = ratio(border, brightest);
    lines.push(`${width}px: border ${hex(border)} · 최밝 배경 ${hex(brightest)} · ${r.toFixed(3)}:1`);
    if (r < 3.0) failures.push(`${width}px — ${r.toFixed(3)}:1 (border=${hex(border)} brightest=${hex(brightest)})`);
  }
  console.log(`--line-strong on 지면 최밝 지점:\n  ${lines.join('\n  ')}`);
  expect(failures, `--line-strong 보더가 지면에서 가장 밝은 지점 대비 3:1 미달:\n${failures.join('\n')}`).toEqual([]);
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
