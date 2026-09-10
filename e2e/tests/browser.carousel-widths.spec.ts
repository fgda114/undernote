/**
 * CAROUSEL WIDTH SWEEP — "ONE ARROW PRESS = ONE SCREEN, EVERY BREAKPOINT"
 * (2026-09-10, Matthias/QA — PR #16 round).
 *
 * browser.flows.spec.ts's own pager test ("화살표 한 번에 한 화면씩…") proves the
 * property at exactly two widths, 390 and 1440 — one point inside the 2-up band
 * and one inside the 4-up band. That leaves the two widths the `.cards` ladder
 * (index.astro) actually STEPS at — 839→840 (2-up→3-up) and 1159→1160 (3-up→4-up)
 * — and the ladder's own lower boundary (640→641, where the track formula
 * switches from `calc(50vw - 28px)` to `min(320px, …)` without the column count
 * changing) entirely unmeasured for the one thing that matters most there: does
 * the step SIZE (`box.clientWidth`, computed live off whatever width the CSS
 * produced) still land exactly on a card boundary the instant the column count
 * — and therefore every card's own width — changes underneath it.
 *
 * WHAT WOULD BREAK AND NOT SHOW UP AT 390/1440. `enhance.js` never knows how
 * many cards fit a page; it scrolls by the rail's measured `clientWidth` and
 * trusts `scroll-snap-align: start` on every card to land the result on a
 * boundary. That trust is well-placed AS LONG AS `clientWidth` is an exact
 * multiple of one page's card-widths-plus-gaps at the CURRENT width. The one
 * place that arithmetic is genuinely at risk is a boundary width, because two
 * different CSS rules (the ≤640 and 641+ track formulas, or the 2-/3-/4-up
 * column counts) are one pixel apart and only ONE of them is in force at any
 * measured width — a rounding disagreement between them would show up as a
 * card sliced in half after a click, and only ever at 839/840 or 1159/1160,
 * nowhere else in the range.
 *
 * WHAT "CORRECT" MEANS ACROSS A CLAMPED FINAL PAGE. The rich fixture holds 8
 * reviews; at 3-up (840–1159px) that is not an even multiple of the page size,
 * so the last press cannot advance a full page without overrunning the rail —
 * the browser clamps the scroll to `scrollWidth - clientWidth` and
 * `scroll-snap-align: start` resolves that clamped position to the last FULL
 * page, which overlaps the previous one by design (cards 4–6 then 6–8, not
 * 4–6 then 7–8-and-a-sliver). That overlap is the mechanism working, not a
 * defect — the defect this file is written to catch is a SKIPPED card (one
 * that is never wholly visible on any page) or an overlap on a page that is
 * NOT the last one (which would mean a press moved short of a full screen for
 * no reason tied to running out of content).
 *
 * SCROLLBAR-WIDTH, MEASURED RATHER THAN ASSUMED. `.cards` sets
 * `scrollbar-width: thin`, on the theory that — unlike an OS overlay
 * scrollbar — it always carves real space out of the content box, so
 * `clientWidth` is already net of it. Checked against three Chromium
 * launches (default, `--disable-features=OverlayScrollbar`, and with the
 * Fluent variants added too): `clientWidth === offsetWidth` in every one —
 * this headless build renders the horizontal scrollbar as an overlay
 * regardless of `scrollbar-width: thin`, so asserting "clientWidth must be
 * less than offsetWidth" here would test this TEST ENVIRONMENT's scrollbar
 * chrome, not the page. What the reader actually needs, and what holds
 * regardless of whether their own browser reserves scrollbar space, is
 * TILING: whatever `clientWidth` turns out to be at runtime, one page's
 * worth of cards must fill it edge to edge, because `flex-basis` percentages
 * resolve against the SAME content-box `clientWidth` reports — CSS box-model
 * construction, not an implementation detail this suite could drift out of
 * sync with. The tiling check below is the property that would actually
 * catch a reserved-vs-overlay scrollbar disagreement, on a platform where
 * one exists to disagree.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SANDBOX_ROOT, basePathOf } from '../lib/sandbox.mjs';

const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
const SEC = 'section[aria-label="최신 리뷰"]';
const TOTAL_CARDS = 8; // rich fixture — see rich-content.mjs (RICH_SET 7 + the base fixture).

/** The ladder index.astro's own comment states, restated as a pure function
 * so a change to either place shows up as a disagreement here rather than a
 * silently-adjusted expectation. */
function expectedPerPage(width: number): number {
  if (width >= 1160) return 4;
  if (width >= 840) return 3;
  return 2; // 641–839 and ≤640 are both 2-up (see index.astro's ladder table).
}

/** Every CSS step edge in the ladder, both sides of each, plus the two extra
 * phone widths the QA round asked for by name (390, 430) and the reported
 * viewports (768, 1920). */
const WIDTHS = [360, 390, 430, 600, 640, 641, 768, 839, 840, 1024, 1159, 1160, 1440, 1680, 1920];
const EPS = 0.5; // sub-pixel track rounding — same tolerance browser.hierarchy.spec.ts uses.

/** Indices (1-based) of `.article-card`s wholly inside the rail's own visible
 * window — the same "wholly visible" rule browser.flows.spec.ts's pager test
 * and browser.hierarchy.spec.ts's 2-column test both use, so a card counted
 * here is a card counted the same way everywhere else in the suite. */
function visibleIndices(page: import('@playwright/test').Page) {
  return page.evaluate((sec: string) => {
    const rail = document.querySelector(`${sec} .cards`) as HTMLElement;
    const left = rail.getBoundingClientRect().left;
    return [...rail.querySelectorAll('.article-card')]
      .map((el, i) => ({ i: i + 1, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.left - left >= -0.5 && r.right - left <= rail.clientWidth + 0.5)
      .map(({ i }) => i);
  }, SEC);
}

/** The exact page a reader should see after `k` presses of `next`, GIVEN the
 * clamped-final-page rule the file intro explains: every page but the last is
 * a plain `[k*per+1 .. k*per+per]` window; the last page is pulled back to
 * `[total-per+1 .. total]` so a partial page never renders. Asserting the
 * EXACT array (not just "not empty") is what forces every read to wait out
 * the CSS smooth-scroll animation before it is trusted — `expect.poll`
 * against an exact target only turns green once the animation, and the
 * `scroll` handler that flips `disabled`, have both actually settled. */
function expectedPage(k: number, per: number, total: number): number[] {
  const start = Math.min(k * per + 1, total - per + 1);
  return Array.from({ length: per }, (_, i) => start + i);
}

test('캐러셀 폭 전수 — 화면당 카드 수 · 한 번에 한 화면 · 경계(640/641·839/840·1159/1160)에서 건너뛰거나 겹치지 않는다', async ({ page }) => {
  await page.goto(`${B}/`);

  const table: string[] = [];
  const perPageProblems: string[] = [];
  const halfVisibleProblems: string[] = [];
  const tilingProblems: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // Fresh scroll position per width — a previous width's page offset must
    // not leak into this one's "first page" measurement.
    await page.evaluate((sec: string) => {
      (document.querySelector(`${sec} .cards`) as HTMLElement).scrollLeft = 0;
    }, SEC);

    const page1 = await visibleIndices(page);
    const want = expectedPerPage(width);

    // Tiling — see the file intro's scrollbar note for why this, not an
    // offsetWidth/clientWidth comparison, is the property that survives a
    // headless environment with no reserved-space scrollbar to observe.
    //
    // NOT exact equality. First measured as "the last card's right edge must
    // equal clientWidth exactly" and that over-fired at 839px and at
    // 1680/1920px (2px and 8px short respectively) — both cases where the
    // 320px `min(320px, …)` cap (index.astro's ladder) is what's binding, not
    // the track share: once a card hits its OWN cap, there is no rule that
    // stretches it to fill leftover track space, so a few px of dead rail
    // space past the last card is the DESIGNED result of that cap, not a
    // defect — and `scroll-snap-align: start` already absorbs it (the
    // exact-page walk below proves zero skips at every one of these widths).
    // What WOULD be a defect is that gap growing to a whole card's width,
    // which is the one thing that could make a `clientWidth`-sized step
    // overshoot past a card before snap-back corrects it. So the bound here
    // is "smaller than one card", not "zero".
    const tiling = await page.evaluate(
      ({ sec, per }: { sec: string; per: number }) => {
        const rail = document.querySelector(`${sec} .cards`) as HTMLElement;
        const cards = [...rail.querySelectorAll('.article-card')] as HTMLElement[];
        const railLeft = rail.getBoundingClientRect().left;
        const nth = cards[per - 1];
        return {
          rightEdge: nth.getBoundingClientRect().right - railLeft,
          clientWidth: rail.clientWidth,
          cardWidth: nth.getBoundingClientRect().width,
        };
      },
      { sec: SEC, per: want },
    );
    const gap = tiling.clientWidth - tiling.rightEdge;
    if (gap < -EPS) {
      tilingProblems.push(`${width}px — ${want}번째 카드가 레일 우측을 ${(-gap).toFixed(1)}px 넘침 (잘려 보일 수 있음)`);
    } else if (gap > tiling.cardWidth) {
      tilingProblems.push(`${width}px — 레일 잔여 공간 ${gap.toFixed(1)}px가 카드 폭 ${tiling.cardWidth.toFixed(1)}px 이상 — 한 번의 화살표가 카드 하나를 건너뛸 수 있음`);
    }

    table.push(`${width}: 1페이지=[${page1.join(',')}] (기대 ${want}장)`);
    if (page1.length !== want) {
      perPageProblems.push(`${width}px — 1페이지 카드 ${page1.length}장, 기대 ${want}장`);
    }
    if (page1[0] !== 1) {
      perPageProblems.push(`${width}px — 1페이지가 카드 1부터 시작하지 않음 (${page1.join(',')})`);
    }
    // Contiguous, no internal gap — a card sliced exactly at the rail's edge
    // would otherwise silently vanish from this list without failing the
    // length check if another card happened to take its place count-wise.
    for (let k = 1; k < page1.length; k++) {
      if (page1[k] !== page1[k - 1] + 1) {
        halfVisibleProblems.push(`${width}px — 1페이지 카드 번호가 연속하지 않음: [${page1.join(',')}]`);
        break;
      }
    }

    // Walk every page with `next`, asserting the EXACT expected window each
    // time (see expectedPage's own comment for why "exact" rather than
    // "non-empty" is what actually waits out the smooth-scroll animation).
    const next = page.locator(`${SEC} .carousel-btn.next`);
    const prev = page.locator(`${SEC} .carousel-btn.prev`);
    await expect(prev, `${width}px — 첫 페이지인데 이전 버튼이 살아 있음`).toBeDisabled();

    const totalPages = Math.ceil(TOTAL_CARDS / want);
    for (let k = 1; k < totalPages; k++) {
      await next.click();
      const want_k = expectedPage(k, want, TOTAL_CARDS);
      try {
        await expect.poll(async () => visibleIndices(page), { timeout: 4000 }).toEqual(want_k);
      } catch {
        const got = await visibleIndices(page);
        perPageProblems.push(`${width}px — ${k + 1}페이지 기대 [${want_k.join(',')}], 실제 [${got.join(',')}]`);
      }
    }
    await expect(next, `${width}px — 마지막 페이지인데 다음 버튼이 살아 있음`).toBeDisabled();
    if (totalPages > 1) {
      await expect(prev, `${width}px — 첫 페이지를 벗어났는데 이전 버튼이 죽어 있음`).toBeEnabled();
    }
  }

  console.log(`캐러셀 폭 전수 실측 (${WIDTHS.length}폭):\n  ${table.join('\n  ')}`);
  expect(tilingProblems, tilingProblems.join('\n')).toEqual([]);
  expect(halfVisibleProblems, halfVisibleProblems.join('\n')).toEqual([]);
  expect(perPageProblems, perPageProblems.join('\n')).toEqual([]);
});
