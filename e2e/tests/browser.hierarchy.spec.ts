/**
 * THE HOME HIERARCHY INVARIANT, MEASURED BY MACHINE (2026-09-07, Matthias).
 *
 * > A CHART CARD IS NEVER NARROWER THAN A BROWSING CARD.
 *   (src/pages/index.astro intro · 08-impl-notes/frontend.md §9-11)
 *
 * WHY THIS FILE EXISTS. The invariant broke three times inside W5 — a 5-column
 * Charts grid, an `auto-fit` track collapsing onto 336px, and a track that
 * ballooned at 768px — and all three were found by a person opening a browser
 * and measuring. The 80-measurement table in 08-impl-notes is real, but a
 * table is a photograph: it says the invariant HELD on 2026-09-07, and it
 * cannot say anything at all about the next commit. Three regressions in one
 * week is the definition of something that needs a latch rather than a habit.
 *
 * WHAT IS MEASURED, AND WHAT IS NOT.
 *   · Ten viewport widths, chosen as the CSS's own step edges and the two
 *     sides of each (see WIDTHS): every breakpoint in index.astro and the
 *     gutter curve in tokens.css is crossed at least once. Two of the three
 *     historical breaks were width-dependent at a fixed card count, which is
 *     exactly this axis.
 *   · Three Charts card-count layouts (n-1 / n-2 / n-3+). The third is what
 *     the rich sandbox actually renders; the other two are produced by
 *     TRIMMING the rendered <ol> and re-labelling it, which is honest for the
 *     property under test — the count classes select a grid rule, and the
 *     rule is measured on the real markup with the real stylesheet. The one
 *     thing the trim does not reproduce is ChartCard's `feature` INTERNALS at
 *     n-1 (bigger cover, bigger title); those do not change the card's outer
 *     width, which is what the invariant is about. Stated so nobody reads
 *     more into a green run than it earned.
 *   · Browsing card width no longer depends on card count at all (the `n-*`
 *     variants were deleted on 2026-09-07), so that axis has one value.
 *
 * A tie is NOT a violation. At ≤640px every grid on the page is one column
 * and both cards are the frame width; the invariant says "never narrower",
 * and the hierarchy is carried by order, the gradient heading and the score
 * plate there. The assertion is `>=` for that reason, with a 0.5px tolerance
 * for sub-pixel track rounding.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SANDBOX_ROOT, basePathOf } from '../lib/sandbox.mjs';

const B = basePathOf(join(SANDBOX_ROOT, 'rich'));

/** The CSS's own edges, plus the two ends of the real display range.
 *  641/840/1160 are `.cards` column steps; 640/839/1159 are one pixel below
 *  each (a step that fires early or late shows up here and nowhere else);
 *  768/1024/1440 are the reported viewports; 1680 is where --shell starts
 *  capping the frame; 1920/2560 are past it.
 *
 *  430 and 600 were added on 2026-09-07 with the defect they would have
 *  caught. The single-column range 361–640 had exactly two audited points at
 *  its ends (360 and 640), and 360 is the ONE width in it where the frame is
 *  already 320px — so a browsing track capped at 320 looked correct there and
 *  was short everywhere else in the band. Two interior points make the band a
 *  measured range rather than two endpoints. */
const WIDTHS = [360, 430, 600, 640, 641, 768, 839, 840, 1024, 1159, 1160, 1440, 1680, 1920, 2560];

const EPS = 0.5; // sub-pixel grid track rounding

test('위계 불변식 — 13폭 × 3 차트 레이아웃: 차트 카드 ≥ 탐색 카드 (실측)', async ({ page }) => {
  await page.goto(`${B}/`);

  // The n-1 / n-2 layouts are produced in-page. `restore` puts the list back
  // so the next width measures the shipped state again.
  const setChartCount = (n: number | null) =>
    page.evaluate((count) => {
      const ol = document.querySelector('.chart-cards') as HTMLElement;
      const w = window as unknown as { __chartBackup?: string; __chartClass?: string };
      if (w.__chartBackup === undefined) {
        w.__chartBackup = ol.innerHTML;
        w.__chartClass = ol.className;
      }
      if (count === null) {
        ol.innerHTML = w.__chartBackup;
        ol.className = w.__chartClass!;
        return;
      }
      ol.innerHTML = w.__chartBackup;
      ol.className = `chart-cards stagger n-${Math.min(count, 3)}`;
      while (ol.children.length > count) ol.lastElementChild!.remove();
    }, n);

  const measure = () =>
    page.evaluate(() => {
      const chart = document.querySelector('.chart-card') as HTMLElement;
      const browse = document.querySelector(
        'section[aria-label="최신 리뷰"] .article-card',
      ) as HTMLElement;
      const c = chart.getBoundingClientRect();
      const b = browse.getBoundingClientRect();
      return {
        chartW: c.width,
        browseW: b.width,
        chartX: c.x,
        browseX: b.x,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });

  const rows: string[] = [];
  const violations: string[] = [];
  const misaligned: string[] = [];
  const overflow: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [1, 2, 8]) {
      await setChartCount(count);
      const m = await measure();
      const label = `c${count === 8 ? '3+' : count} @${width}`;
      rows.push(`${label}: chart ${m.chartW.toFixed(1)} / browse ${m.browseW.toFixed(1)}`);
      if (m.chartW < m.browseW - EPS) {
        violations.push(`${label} — 차트 ${m.chartW.toFixed(1)} < 탐색 ${m.browseW.toFixed(1)}`);
      }
      // The two grids share the page's left edge; a track rule that indents
      // one of them is a layout defect even when the widths still order.
      if (Math.abs(m.chartX - m.browseX) > EPS) {
        misaligned.push(`${label} — 차트 x=${m.chartX.toFixed(1)} vs 탐색 x=${m.browseX.toFixed(1)}`);
      }
      if (m.scrollW > m.clientW) overflow.push(`${label} — ${m.scrollW}>${m.clientW}`);
    }
    await setChartCount(null);
  }

  console.log(`위계 실측 ${rows.length}건:\n  ${rows.join('\n  ')}`);
  expect(violations, `위계 역전:\n${violations.join('\n')}`).toEqual([]);
  expect(misaligned, `좌측 정렬 어긋남:\n${misaligned.join('\n')}`).toEqual([]);
  expect(overflow, `가로 스크롤:\n${overflow.join('\n')}`).toEqual([]);
});

/**
 * The invariant's CSS expression, asserted directly so a failure names the
 * rule that broke rather than the pixel that moved. `minmax(0, 320px)` on the
 * browsing track and a fixed 336px chart card are the two halves; a `1fr`
 * creeping back into either is the specific edit that inverted the hierarchy
 * in W5, and it is invisible in a screenshot at most widths.
 */
test('위계 불변식 — 탐색 트랙 상한 320px · 차트 카드 고정 336px (CSS 규칙)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(`${B}/`);

  // 1920 caps the frame at --shell (1440) — the width where four `1fr`
  // tracks would resolve to 348px and overtake the chart card.
  const tracks = await page.evaluate(() => {
    const cards = document.querySelector('section[aria-label="최신 리뷰"] .cards') as HTMLElement;
    return getComputedStyle(cards).gridTemplateColumns.split(/\s+/).map(parseFloat);
  });
  expect(tracks.length, '1920에서 탐색 그리드가 4열이 아님').toBe(4);
  for (const t of tracks) expect(t, `탐색 트랙 ${t}px가 320 상한 초과`).toBeLessThanOrEqual(320 + EPS);

  const chartW = await page.locator('.chart-card').first().evaluate((el) => el.getBoundingClientRect().width);
  expect(chartW, '차트 카드가 336px 고정에서 벗어남').toBeCloseTo(336, 0);
});

/**
 * THE OTHER DIRECTION: A CARD THAT IS TOO NARROW (2026-09-07).
 *
 * Every measurement in this file and in browser.responsive.spec.ts asks
 * whether something OVERFLOWS. Nothing asked whether something falls SHORT,
 * and a layout that is short of its frame passes an overflow audit at every
 * width, forever. That is how the browsing grid shipped capped at 320px
 * through the whole 361–640 single-column band while the grid it sits in, the
 * chart card, the headings and the footer all ran to the full frame — measured
 * at 600px: grid 20→580, card 20→340.
 *
 * The invariant is structural rather than numeric, so it does not need
 * updating when the gutter curve moves: IN A SINGLE-COLUMN LAYOUT THE CARD
 * FILLS ITS GRID. Left edges and right edges both, because a card that is
 * centred in an over-wide track would match on width and be wrong.
 */
test('단일 컬럼 구간 — 탐색 카드가 격자를 가득 채운다 (361~640px)', async ({ page }) => {
  await page.goto(`${B}/`);
  const rows: string[] = [];
  const short: string[] = [];
  for (const width of [361, 430, 500, 600, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const m = await page.evaluate(() => {
      const grid = document.querySelector('section[aria-label="최신 리뷰"] .cards') as HTMLElement;
      const card = grid.querySelector('.article-card') as HTMLElement;
      const g = grid.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        tracks: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
        gLeft: g.left, gRight: g.right, cLeft: c.left, cRight: c.right,
      };
    });
    rows.push(`${width}: tracks ${m.tracks} · 격자 ${m.gLeft.toFixed(1)}→${m.gRight.toFixed(1)} · 카드 ${m.cLeft.toFixed(1)}→${m.cRight.toFixed(1)}`);
    if (m.tracks !== 1) short.push(`${width}px — 단일 컬럼이 아님 (트랙 ${m.tracks}개)`);
    if (Math.abs(m.cLeft - m.gLeft) > EPS) short.push(`${width}px — 카드 좌측 ${m.cLeft.toFixed(1)} ≠ 격자 ${m.gLeft.toFixed(1)}`);
    if (Math.abs(m.cRight - m.gRight) > EPS) short.push(`${width}px — 카드 우측 ${m.cRight.toFixed(1)} ≠ 격자 ${m.gRight.toFixed(1)} (카드가 짧음)`);
  }
  console.log(`단일 컬럼 실측:\n  ${rows.join('\n  ')}`);
  expect(short, short.join('\n')).toEqual([]);
});
