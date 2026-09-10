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
      // The browsing section is a carousel too now (2026-09-10), so it has
      // the same two boxes the chart section has: an outer wrapper on the
      // frame's edge and a card pushed in by the leading arrow. Both are
      // read, because the comparison below moved up one level with it.
      const browseCarousel = document.querySelector(
        'section[aria-label="최신 리뷰"] .carousel',
      ) as HTMLElement;
      const browse = document.querySelector(
        'section[aria-label="최신 리뷰"] .article-card',
      ) as HTMLElement;
      const c = chart.getBoundingClientRect();
      const car = carousel.getBoundingClientRect();
      const bcar = browseCarousel.getBoundingClientRect();
      const b = browse.getBoundingClientRect();
      return {
        chartW: c.width,
        browseW: b.width,
        carouselX: car.x,
        cardInset: c.x - car.x,
        browseCarouselX: bcar.x,
        browseInset: b.x - bcar.x,
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
    rows.push(`${label}: chart ${m.chartW.toFixed(1)} / browse ${m.browseW.toFixed(1)} · inset 차트 ${m.cardInset.toFixed(1)} / 탐색 ${m.browseInset.toFixed(1)}`);
    if (m.chartW < m.browseW - EPS) {
      violations.push(`${label} — 차트 ${m.chartW.toFixed(1)} < 탐색 ${m.browseW.toFixed(1)}`);
    }
    // WHAT "SHARES THE LEFT EDGE" MEANS NOW (2026-09-10, revised twice on
    // the same date as the two sections converged).
    //
    // FIRST REVISION, EARLIER TODAY: the two grids used to share the edge at
    // the CARD's own edge, and the chart carousel's new leading arrow button
    // was structural content with nothing on the browsing side to match, so
    // the chart card sat one button plus one gap in while the browsing card
    // did not. This test compared the chart CAROUSEL's outer box against the
    // browsing CARD, which was the same edge for as long as the browsing
    // side had no wrapper of its own.
    //
    // SECOND REVISION, THIS PASS: the browsing sections became carousels
    // too, so they have that wrapper now and their cards carry the SAME 52px
    // inset. The old comparison started reporting an 52px "misalignment" at
    // every width from 641 up — correctly, in the sense that the two boxes
    // it named really had stopped matching, and uselessly, in the sense that
    // the page is more consistent than it was, not less. So the property
    // moves up one level with the markup: THE TWO SECTIONS' WRAPPERS share
    // the frame's left edge, and EACH card is inset from its own wrapper by
    // whatever the breakpoint says. That is strictly more than the old test
    // checked — it now also catches the two sections drifting apart from
    // EACH OTHER, which was not expressible while only one of them had a
    // wrapper.
    //
    // BELOW 641px THE BUTTONS MOVE UNDER THE CARD and both insets return to
    // zero. That is not an exception bolted onto this test: a fixed 2 x 44px
    // of flanking circles takes a growing share of a shrinking viewport, and
    // at 390px it left the chart card 63% of the width when "one card taking
    // the full width" is that section's entire brief. Measured before the
    // fix: 1200px gave 78%, 390px gave 63%; after, 390px gives 90%.
    //
    // What is still a defect, and still caught here: either wrapper drifting
    // from the shared edge (an accidental margin creeping into a section or
    // an ancestor), and either inset drifting from whichever value the
    // breakpoint says it should be — both would mean something OTHER than
    // the documented layout is pushing a card around.
    if (Math.abs(m.carouselX - m.browseCarouselX) > EPS) {
      misaligned.push(
        `${label} — 차트 캐러셀 x=${m.carouselX.toFixed(1)} vs 탐색 캐러셀 x=${m.browseCarouselX.toFixed(1)}`,
      );
    }
    const inset = expectedInset(width);
    if (Math.abs(m.cardInset - inset) > EPS) {
      misaligned.push(`${label} — 차트 카드 들여쓰기 ${m.cardInset.toFixed(1)}px ≠ 기대 ${inset}px`);
    }
    if (Math.abs(m.browseInset - inset) > EPS) {
      misaligned.push(`${label} — 탐색 카드 들여쓰기 ${m.browseInset.toFixed(1)}px ≠ 기대 ${inset}px`);
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

  // 1920 caps the frame at --shell (1440) — the width where four equal
  // shares of the row would resolve to 348px and overtake the chart card.
  //
  // MEASURED ON THE CARDS, NOT ON `grid-template-columns` (2026-09-10). This
  // used to read the track list off the browsing grid; `.cards` is now a flex
  // scroller (index.astro), and a card's width lives on the card. That is the
  // better place for it regardless of which layout ships: a track list is
  // what the CSS ASKED FOR, a card's rect is what the reader GOT, and the
  // 320px cap is a promise about the second one. Four per page is asserted
  // as "four cards fit inside the scroller's own visible width", which is
  // also what the arrows step by — so this now checks the property the
  // pager depends on rather than a column count that happened to imply it.
  // `eps` is an ARGUMENT, not a closure: this function is serialised and run
  // inside the page, where this module's own consts do not exist.
  const page4 = await page.evaluate((eps: number) => {
    const rail = document.querySelector('section[aria-label="최신 리뷰"] .cards') as HTMLElement;
    const cards = [...rail.querySelectorAll('.article-card')] as HTMLElement[];
    const railLeft = rail.getBoundingClientRect().left;
    return {
      widths: cards.map((el) => el.getBoundingClientRect().width),
      // How many whole cards sit inside one screenful of the rail.
      visible: cards.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left - railLeft >= -eps && r.right - railLeft <= rail.clientWidth + eps;
      }).length,
      total: cards.length,
    };
  }, EPS);
  expect(page4.total, 'rich 픽스처의 최신 리뷰가 4장 미만 — 이 측정이 무의미해짐').toBeGreaterThanOrEqual(4);
  expect(page4.visible, '1920에서 한 화면에 탐색 카드 4장이 아님').toBe(4);
  for (const w of page4.widths) expect(w, `탐색 카드 ${w}px가 320 상한 초과`).toBeLessThanOrEqual(320 + EPS);

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
 * THE OTHER DIRECTION: A CARD THAT IS TOO NARROW (2026-09-07; two tracks
 * 2026-09-08; a paged scroller 2026-09-10).
 *
 * Every measurement in this file and in browser.responsive.spec.ts asks
 * whether something OVERFLOWS. Nothing asked whether something falls SHORT,
 * and a layout that is short of its frame passes an overflow audit at every
 * width, forever. That is how the browsing grid shipped capped at 320px
 * through the whole 361–640 single-column band while the grid it sits in, the
 * chart card, the headings and the footer all ran to the full frame — measured
 * at 600px: grid 20→580, card 20→340.
 *
 * THE DEFECT'S SHAPE OUTLIVES THREE LAYOUTS, WHICH IS WHY THIS TEST DOES. It
 * began as "the one track fills the grid", became "two tracks plus their gap
 * fill the grid" when the band went two-column (editor request: four cards as
 * "1 2 / 3 4" on a phone), and is now "the first PAGE fills the rail" — the
 * band pages sideways two cards at a time instead of wrapping to a second row
 * (2026-09-10). The invariant moves each time; it never disappears, because
 * what it catches — a card sized short of the space actually available to it
 * — is a property of the sizing arithmetic, not of the layout mode.
 *
 * WHAT "THE RAIL" MEANS NOW. `.cards` is a horizontal scroll container, so
 * its bounding rect is the VISIBLE window onto a row that runs off to the
 * right; the cards past the first page are really there, just outside it. So
 * the right edge is compared against `clientWidth` measured from the rail's
 * own left edge, rather than against the rect — the same two outer edges as
 * before, read the way a scroller reports them.
 *
 * IT CHECKS THE OUTER TWO EDGES, NOT EITHER CARD'S WIDTH. A card that is
 * undersized but centred in its share would still match on left and right
 * individually; the page can only span the rail if neither card fell short.
 *
 * AND IT CHECKS THAT THERE IS SOMETHING TO SCROLL TO. The rich fixture holds
 * eight reviews and this band shows two at a time, so a rail that does not
 * overflow means the paging arithmetic collapsed — cards too narrow, or the
 * limit quietly back at 4 — and every edge assertion above would still pass
 * on a row that fits entirely on screen.
 */
test('2열 구간 — 탐색 카드 두 장이 레일 한 화면을 가득 채운다 (361~640px)', async ({ page }) => {
  await page.goto(`${B}/`);
  const rows: string[] = [];
  const short: string[] = [];
  for (const width of [361, 430, 500, 600, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const m = await page.evaluate(() => {
      const rail = document.querySelector('section[aria-label="최신 리뷰"] .cards') as HTMLElement;
      const cards = [...rail.querySelectorAll('.article-card')] as HTMLElement[];
      const railLeft = rail.getBoundingClientRect().left;
      // The first page: every card whose whole box lies inside the rail's
      // visible window, measured from the rail's own left edge.
      const page1 = cards.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left - railLeft >= -0.5 && r.right - railLeft <= rail.clientWidth + 0.5;
      });
      const first = page1[0].getBoundingClientRect();
      const last = page1[page1.length - 1].getBoundingClientRect();
      return {
        total: cards.length,
        pageLen: page1.length,
        railWidth: rail.clientWidth,
        cLeft: first.left - railLeft,
        cRight: last.right - railLeft,
        scrollable: rail.scrollWidth > rail.clientWidth + 0.5,
      };
    });
    rows.push(
      `${width}: 한 화면 ${m.pageLen}장 / 전체 ${m.total}장 · 레일 폭 ${m.railWidth.toFixed(1)} · 첫 페이지 ${m.cLeft.toFixed(1)}→${m.cRight.toFixed(1)} · 더 있음 ${m.scrollable}`,
    );
    if (m.total < 4) short.push(`${width}px — 픽스처의 최신 리뷰가 4건 미만 (${m.total}) — 이 측정이 무의미해짐`);
    if (m.pageLen !== 2) short.push(`${width}px — 한 화면에 2장이 아님 (${m.pageLen}장)`);
    if (Math.abs(m.cLeft) > EPS) short.push(`${width}px — 첫 페이지 좌측 ${m.cLeft.toFixed(1)} ≠ 레일 좌측 0`);
    if (Math.abs(m.cRight - m.railWidth) > EPS) {
      short.push(`${width}px — 첫 페이지 우측 ${m.cRight.toFixed(1)} ≠ 레일 폭 ${m.railWidth.toFixed(1)} (카드가 짧음)`);
    }
    if (!m.scrollable) short.push(`${width}px — 레일에 넘길 것이 없음 — 8건을 2장씩 넘기는 구조가 아님`);
  }
  console.log(`2열 구간 실측:\n  ${rows.join('\n  ')}`);
  expect(short, short.join('\n')).toEqual([]);
});
