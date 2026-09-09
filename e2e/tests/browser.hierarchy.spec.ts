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
 *     gutter curve in tokens.css is crossed at least once.
 *   · Charts renders up to ten cards now (2026-09-10, a one-card-at-a-time
 *     CAROUSEL — see index.astro's intro), but exactly ONE is ever visible:
 *     `.chart-cards` clips to the first card's width and scrolls the rest
 *     offscreen, so `document.querySelector('.chart-card')` below always
 *     measures the one a reader actually sees, regardless of how many
 *     `charts` holds. No DOM surgery, same as the previous (single-card)
 *     version of this file: what changed is the SOURCE of the guarantee —
 *     the earlier version measured the section's only card; this one
 *     measures the section's only VISIBLE card, both by construction rather
 *     than a rule this file has to simulate.
 *   · Browsing card width no longer depends on card count at all (the `n-*`
 *     variants were deleted on 2026-09-07), so that axis has one value.
 *
 * A tie is NOT a violation. The assertion is `>=`, with a 0.5px tolerance for
 * sub-pixel track rounding, because Charts and the browsing grids are not
 * guaranteed to differ at every width — only never to invert.
 *
 * BELOW 641px THE TWO GRIDS ARE DIFFERENT COLUMN COUNTS, NOT A TIE
 * (2026-09-08). Charts stays one column (a full-width chart card) but the
 * browsing grids became two (four latest reviews as "1 2 / 3 4" on a phone —
 * editor request), so a browsing card is now roughly HALF the chart card's
 * width in that band rather than equal to it. The invariant only ever
 * required "never narrower", so this is a wider margin, not a regression —
 * recorded here so the next reader does not go looking for the tie this
 * comment used to promise below 640px and conclude something broke. */
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
// `.carousel-btn` is a fixed 44px circle, `.chart-carousel`'s gap is
// `var(--s-8)` = 8px (index.astro) — the exact, deliberate distance the
// carousel's leading arrow button reserves before the visible card, on
// every width the carousel renders at all (charts.length > 1, which the
// rich fixture's 8 candidates always satisfy). Named here so a change to
// either value in index.astro is a change to ONE number in this file too,
// not a silently-adjusted tolerance.
const BTN_INSET = 44 + 8;
/** Below this the buttons sit UNDER the card, so it is flush again.
    Mirrors index.astro's `@media (max-width: 640px)` — the layout has one
    breakpoint and the test reads it from the same number, not from a
    guess about which widths "look mobile". */
const BTN_FLANK_MIN_WIDTH = 641;
const expectedInset = (width: number) => (width >= BTN_FLANK_MIN_WIDTH ? BTN_INSET : 0);

test('위계 불변식 — 13폭: 차트 카드(캐러셀의 보이는 한 장, feature) ≥ 탐색 카드 (실측)', async ({ page }) => {
  // No DOM surgery: the rich fixture's Charts section holds up to ten cards
  // (2026-09-10 carousel — see the file intro), but `.chart-card` below
  // matches the first one in document order, which is the one card ever
  // visible without scrolling the row — so the shipped page IS the one
  // layout worth measuring, same as before this rebuild.
  await page.goto(`${B}/`);

  const measure = () =>
    page.evaluate(() => {
      const carousel = document.querySelector('.chart-carousel') as HTMLElement;
      const chart = document.querySelector('.chart-card') as HTMLElement;
      const browse = document.querySelector(
        'section[aria-label="최신 리뷰"] .article-card',
      ) as HTMLElement;
      const c = chart.getBoundingClientRect();
      const car = carousel.getBoundingClientRect();
      const b = browse.getBoundingClientRect();
      return {
        chartW: c.width,
        browseW: b.width,
        carouselX: car.x,
        cardInset: c.x - car.x,
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
    const m = await measure();
    const label = `@${width}`;
    rows.push(`${label}: chart ${m.chartW.toFixed(1)} / browse ${m.browseW.toFixed(1)} · inset ${m.cardInset.toFixed(1)}`);
    if (m.chartW < m.browseW - EPS) {
      violations.push(`${label} — 차트 ${m.chartW.toFixed(1)} < 탐색 ${m.browseW.toFixed(1)}`);
    }
    // WHAT "SHARES THE LEFT EDGE" MEANS NOW (2026-09-10). The two grids used
    // to share it at the CARD's own edge. From 641px up the carousel's
    // leading arrow button is new structural content with nothing on the
    // browsing side to match, so the card it precedes sits one button plus
    // one gap in — index.astro's intro documents that as the affordance's
    // honest cost.
    //
    // BELOW 641px THE BUTTONS MOVE UNDER THE CARD and the inset returns to
    // zero. That is not an exception bolted onto this test: a fixed 2 x 44px
    // of flanking circles takes a growing share of a shrinking viewport, and
    // at 390px it left the card 63% of the width when "one card taking the
    // full width" is this section's entire brief. Measured before the fix:
    // 1200px gave 78%, 390px gave 63%; after, 390px gives 90%.
    //
    // What is still a defect, and still caught here: the CAROUSEL's own
    // outer box drifting from the shared edge (an accidental margin creeping
    // into `.chart-carousel` or an ancestor), and the inset drifting from
    // whichever value the breakpoint says it should be — either would mean
    // something OTHER than the documented layout is pushing the card around.
    if (Math.abs(m.carouselX - m.browseX) > EPS) {
      misaligned.push(`${label} — 캐러셀 x=${m.carouselX.toFixed(1)} vs 탐색 x=${m.browseX.toFixed(1)}`);
    }
    const inset = expectedInset(width);
    if (Math.abs(m.cardInset - inset) > EPS) {
      misaligned.push(`${label} — 카드 들여쓰기 ${m.cardInset.toFixed(1)}px ≠ 기대 ${inset}px`);
    }
    if (m.scrollW > m.clientW) overflow.push(`${label} — ${m.scrollW}>${m.clientW}`);
  }

  console.log(`위계 실측 ${rows.length}건:\n  ${rows.join('\n  ')}`);
  expect(violations, `위계 역전:\n${violations.join('\n')}`).toEqual([]);
  expect(misaligned, `정렬 어긋남:\n${misaligned.join('\n')}`).toEqual([]);
  expect(overflow, `가로 스크롤:\n${overflow.join('\n')}`).toEqual([]);
});

/**
 * The invariant's CSS expression, asserted directly so a failure names the
 * rule that broke rather than the pixel that moved. `minmax(0, 320px)` on the
 * browsing track is still the half that can invert the hierarchy at a wide
 * viewport — a `1fr` creeping back in is the specific edit that inverted it
 * once already in W5, and it is invisible in a screenshot at most widths.
 *
 * THE CHART SIDE OF THIS TEST CHANGED SHAPE TWICE, NOT JUST NUMBER
 * (2026-09-10, first to a single always-block card, then to the carousel
 * this file now measures — index.astro's intro has the full round trip).
 * "Fixed 336px" was the pre-2026-09-07 scroller card's own promise; neither
 * shape since has one, and pinning a literal pixel width on a card that is
 * supposed to fill its row would pin the WRONG property — a full-width card
 * that happened to render at exactly 336px on one viewport would pass that
 * assertion while failing the actual invariant everywhere else. What is
 * asserted instead is the structural facts that make the chart card win by
 * construction rather than by coincidence: `.chart-carousel` is a flex row
 * (not a grid the browsing side's 320px cap could apply to), its two arrow
 * buttons are a FIXED 44px each regardless of viewport (so the margin they
 * cost only widens as the frame grows, never shrinks it further), and the
 * feature layout's own cover column stays fixed at 440px rather than growing
 * or shrinking with the frame — all three are asserted directly against
 * index.astro's and ChartCard's own rules, not inferred from a single
 * measured number. The REAL cross-check — does the chart card actually stay
 * wider than the browsing card at every one of these widths — is the first
 * test above, which measures the shipped page rather than these rules in
 * isolation; this test exists so a failure here names the STRUCTURAL rule
 * that broke, not just the pixel.
 */
test('위계 불변식 — 탐색 트랙 상한 320px · 차트 캐러셀은 플렉스(고정폭 버튼, 트랙 없음) (CSS 규칙)', async ({ page }) => {
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

  // `.chart-carousel` has to stay a flex row with no `minmax(0, 320px)` cap
  // of its own — the moment the browsing grid's own track system leaks into
  // it, the visible card can shrink below the browsing grid's cap the same
  // way the old n-2/n-3 rules once did.
  const carousel = await page.evaluate(() => {
    const el = document.querySelector('.chart-carousel') as HTMLElement;
    const btn = document.querySelector('.carousel-btn') as HTMLElement;
    return { display: getComputedStyle(el).display, btnWidth: getComputedStyle(btn).width };
  });
  expect(carousel.display, '.chart-carousel이 flex가 아님 — 트랙 시스템이 되돌아옴').toBe('flex');
  expect(carousel.btnWidth, '캐러셀 버튼이 44px 고정에서 벗어남 (뷰포트에 비례하면 위계가 흔들릴 수 있음)').toBe('44px');

  // ChartCard's `feature` grid: `440px minmax(0, var(--column))`. Only the
  // fixed first value is asserted — the second track's resolved px is a
  // function of the viewport by design (index.astro's intro).
  const featureFirstColumn = await page.evaluate(() => {
    const link = document.querySelector('.chart-card.feature .row-link') as HTMLElement;
    return getComputedStyle(link).gridTemplateColumns.split(/\s+/)[0];
  });
  expect(featureFirstColumn, '피처 카드 커버 열이 440px 고정에서 벗어남').toBe('440px');
});

/**
 * THE OTHER DIRECTION: A CARD THAT IS TOO NARROW (2026-09-07, property moved
 * to two tracks 2026-09-08).
 *
 * Every measurement in this file and in browser.responsive.spec.ts asks
 * whether something OVERFLOWS. Nothing asked whether something falls SHORT,
 * and a layout that is short of its frame passes an overflow audit at every
 * width, forever. That is how the browsing grid shipped capped at 320px
 * through the whole 361–640 single-column band while the grid it sits in, the
 * chart card, the headings and the footer all ran to the full frame — measured
 * at 600px: grid 20→580, card 20→340.
 *
 * BAND IS NOW TWO COLUMNS, NOT ONE (2026-09-08). index.astro's `.cards` moved
 * from a single `1fr` track to `repeat(2, 1fr)` below 641px so the home shows
 * four latest-review cards as "1 2 / 3 4" on a phone screen instead of one
 * card per screen (editor request). That changes what "fills its grid" means
 * — there are now two tracks and a gap to account for, not one — but the
 * DEFECT this test exists to catch is unchanged in shape: a track sized
 * short of the space actually available, leaving the row's right edge
 * short of the grid's. So the invariant moves rather than disappears: THE
 * TWO CARDS' COMBINED SPAN (both widths plus the gap between them) FILLS THE
 * GRID — left edge of the first card to the grid's left edge, right edge of
 * the second to the grid's right edge. A card that is undersized but centred
 * in its track would still match on left+right here, which is why this
 * checks the OUTER two edges of the row rather than either card's own width:
 * the row can only span the full grid if neither track fell short of it.
 */
test('2열 구간 — 탐색 카드 두 트랙이 격자를 가득 채운다 (361~640px)', async ({ page }) => {
  await page.goto(`${B}/`);
  const rows: string[] = [];
  const short: string[] = [];
  for (const width of [361, 430, 500, 600, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const m = await page.evaluate(() => {
      const grid = document.querySelector('section[aria-label="최신 리뷰"] .cards') as HTMLElement;
      const cards = [...grid.querySelectorAll('.article-card')] as HTMLElement[];
      const g = grid.getBoundingClientRect();
      // First row: every card whose top matches the first card's top.
      const firstTop = cards[0].getBoundingClientRect().top;
      const row = cards.filter((el) => Math.abs(el.getBoundingClientRect().top - firstTop) < 1);
      const first = row[0].getBoundingClientRect();
      const last = row[row.length - 1].getBoundingClientRect();
      return {
        tracks: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
        rowLen: row.length,
        gLeft: g.left, gRight: g.right, cLeft: first.left, cRight: last.right,
      };
    });
    rows.push(`${width}: tracks ${m.tracks} · 첫행카드수 ${m.rowLen} · 격자 ${m.gLeft.toFixed(1)}→${m.gRight.toFixed(1)} · 행 ${m.cLeft.toFixed(1)}→${m.cRight.toFixed(1)}`);
    if (m.tracks !== 2) short.push(`${width}px — 2열이 아님 (트랙 ${m.tracks}개)`);
    if (m.rowLen !== 2) short.push(`${width}px — 첫 행 카드 수가 2가 아님 (${m.rowLen}) — 데이터가 4건 미만이거나 줄바꿈이 어긋남`);
    if (Math.abs(m.cLeft - m.gLeft) > EPS) short.push(`${width}px — 행 좌측 ${m.cLeft.toFixed(1)} ≠ 격자 ${m.gLeft.toFixed(1)}`);
    if (Math.abs(m.cRight - m.gRight) > EPS) short.push(`${width}px — 행 우측 ${m.cRight.toFixed(1)} ≠ 격자 ${m.gRight.toFixed(1)} (트랙이 짧음)`);
  }
  console.log(`2열 구간 실측:\n  ${rows.join('\n  ')}`);
  expect(short, short.join('\n')).toEqual([]);
});
