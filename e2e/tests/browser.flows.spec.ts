/**
 * Real click-through flows in headless Chromium against `astro preview` of
 * the rich dist — the user's path, not unit truth: home board → review →
 * artist, story → review, global nav, 404, and the zero-JS network property.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SANDBOX_ROOT, basePathOf } from '../lib/sandbox.mjs';

// Deploy base path — visiting through u() keeps the suite valid when the
// base changes (custom domain → '/').
const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
const u = (p: string) => `${B}${p}`;

test('US-2/US-1 — 홈 보드 행 클릭 → 평론 도달 (클릭 1회)', async ({ page }) => {
  await page.goto(u('/'));
  await expect(page.locator('.board')).toBeVisible();
  await page.locator('.board a.row-link').first().click();
  await expect(page).toHaveURL(/\/reviews\/[^/]+\/$/);
  await expect(page.locator('.score-mark')).toBeVisible(); // D2-R: the dial IS the landing proof
});

test('US-9 — 평론 히어로 아티스트명 클릭 → 아티스트 페이지', async ({ page }) => {
  await page.goto(u('/reviews/aurora-line-first-light/'));
  await page.locator('a.artist-link').first().click();
  await expect(page).toHaveURL(/\/artists\/shared-artist\/$/);
  await expect(page.locator(`a[href="${u('/reviews/aurora-line-first-light/')}"]`)).toHaveCount(1);
});

test('US-4 — 이야기 AlbumBox "평론 읽기" 클릭 → 평론 / 미등록은 비링크', async ({ page }) => {
  await page.goto(u('/stories/fixture-story/'));
  const pending = page.locator('span.pending');
  await expect(pending).toHaveText('평론 준비 중');
  // The unregistered mention row must not be wrapped in any anchor.
  expect(await pending.evaluate((el) => el.closest('a') === null)).toBe(true);
  await page.locator('a.action').first().click();
  await expect(page).toHaveURL(/\/reviews\/fixture-artist-fixture-album\/$/);
});

test('US-8 — About 도달 + 필자 소개 지면 성립', async ({ page }) => {
  // Was /archive/2026/ — retired in the 2026-09-09 axis-chip redesign (the
  // per-year archive page no longer exists; the hub itself still does and
  // serves the same "any page with the masthead + footer" purpose here).
  await page.goto(u('/archive/'));
  await page.getByRole('link', { name: 'About' }).first().click();
  await expect(page).toHaveURL(/\/about\/$/);
  // WHAT THIS TEST NO LONGER VERIFIES (2026-09-07). It used to pin the three
  // promises US-8 required /about/ to put in writing — 실림 = 추천 /
  // 미수록 ≠ 혹평 / 점수 = 순위. The page was rewritten as the writer's own
  // introduction and none of the three appears on the site any more, so
  // there is nothing left to assert about them. That LOSS is recorded in
  // 08-impl-notes/frontend.md; it is not something this test can carry.
  //
  // What survives is US-8's other half — the route works and the page is a
  // real page — plus the structure the new copy actually has: one h1 and
  // three paragraphs of introduction.
  await expect(page.locator('main h1')).toHaveText('About');
  await expect(page.locator('main .intro p')).toHaveCount(3);
  const body = await page.locator('main').innerText();
  expect(body).toContain('음악 팬입니다'); // first paragraph, verbatim
  expect(body.trim().length).toBeGreaterThan(80);
});

/**
 * The other half of the budget: the page has to be whole without scripting.
 * `javaScriptEnabled: false` is the honest test of "progressive enhancement"
 * — the inline module never runs, so anything it was secretly holding up
 * fails here. It holds up nothing: the covers zoom from CSS, every
 * destination is a real href, and the only thing missing is the cursor
 * following the art.
 */
test('점진적 향상 — 스크립트 비활성 상태에서도 지면·링크가 온전', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(u('/'));
  // The three home sections and the chart's cards render server-side.
  for (const label of ['올해의 앨범', '최신 리뷰', '음악 이야기']) {
    await expect(page.locator(`section[aria-label="${label}"]`)).toHaveCount(1);
  }
  await expect(page.locator('.board a.row-link').first()).toBeVisible();
  // The CSS-only half of the cover treatment is present with no script.
  await expect(page.locator('.board .cover-frame').first()).toBeVisible();
  // The Charts carousel's two arrow buttons ship in the HTML regardless of
  // script (2026-09-10 rebuild — index.astro's intro), because R-4 only
  // withholds them when there is nothing to step to; the rich fixture's 8
  // reviews clear that floor. Clicking them does nothing here — enhance.js
  // never runs in this context — but that is an accepted gap (see the
  // intro's "script is an enhancement" paragraph): the row itself is a
  // native `overflow-x` + `scroll-snap` container, so a reader can still
  // move it by touch or trackpad with zero script, which this click-only
  // harness cannot exercise but the buttons' mere presence and reachability
  // by keyboard can still be checked without one.
  await expect(page.locator('.board .carousel-btn')).toHaveCount(2);
  expect(await page.locator('.board .chart-cards .chart-card').count(), '차트 카드가 2장 미만 — 화살표가 가리킬 곳이 없음').toBeGreaterThan(1);
  await expect(page.locator('.board a.section-more')).toHaveAttribute('href', /\/list\/\d+\/$/);

  // Navigation still works: it is anchors all the way down.
  await page.locator('.board a.row-link').first().click();
  await expect(page).toHaveURL(/\/reviews\/[^/]+\/$/);
  await expect(page.locator('.score-mark')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();

  await context.close();
});

test('404 — 없는 주소는 404 지면 + 자체 탈출 경로', async ({ page }) => {
  const response = await page.goto(u('/no-such-page/'));
  // The one line here that must never change: a 404 page that answers 200 is
  // worse than no 404 page at all.
  expect(response?.status()).toBe(404);

  // The h1 used to BE the Korean sentence and this test pinned that string.
  // On 2026-09-07 the page took the one-line title every other surface uses
  // ("404") and the sentence moved into the body. The assertion moved with
  // it rather than being deleted: what is worth protecting is that the page
  // has exactly one heading and says somewhere in its own main what
  // happened — not which of those two nodes the sentence lives in.
  await expect(page.locator('main h1')).toHaveCount(1);
  const main = page.locator('main');
  await expect(main).toContainText('이 주소에는 글이 없습니다');

  // The escape routes are the reason this page exists, so they are asserted
  // INSIDE main. A document-wide check would pass on the masthead alone,
  // i.e. it would pass on a 404 page that offers nothing of its own.
  await expect(main.locator('.exits a')).toHaveCount(3);
  for (const name of ['Reviews', 'Notes', 'Archive']) {
    await expect(main.getByRole('link', { name, exact: true })).toBeVisible();
  }
  // …and they are real destinations, not decoration.
  await main.getByRole('link', { name: 'Reviews', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${B}/archive/reviews/$`));
});

/**
 * Half of the old "client JS 0" contract survives the 2026-09-07 budget
 * change UNCHANGED, and it is the half that matters most: the site ships one
 * INLINE module, so the number of JavaScript bytes fetched over the network
 * is still exactly zero. No bundle, no chunk, no CDN.
 */
test('NFR — 주요 흐름 전체에서 외부 JS 요청 0 (인라인만 허용)', async ({ page }) => {
  const jsRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('.js') || req.resourceType() === 'script') jsRequests.push(req.url());
  });
  for (const path of ['/', '/list/2026/', '/reviews/aurora-line-first-light/', '/archive/', '/about/']) {
    await page.goto(u(path), { waitUntil: 'networkidle' });
  }
  expect(jsRequests).toEqual([]);
});

/**
 * Archive search + chips — JS OFF (axis-chip redesign, 2026-09-09, building
 * on the 2026-09-09 search-hub design). "The hub is the index": every
 * article is already server-rendered under /archive/, so a reader without
 * JavaScript is not missing a feature, only the FILTER on top of it — see
 * archive/index.astro's and Base.astro's own intros for why there is
 * deliberately no <noscript> fallback text for that. Chips are BUTTONS
 * (in-page action, not navigation — WAI-ARIA), so with no click listener to
 * run they are exactly what the brief asked for: they "그냥 앉아 있다".
 */
test('아카이브 검색+칩 — 스크립트 비활성 상태에서 전체 목록이 온전하고 입력창·칩은 그냥 앉아있다', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(u('/archive/'));

  // A real, visible TEXT label — not sr-only decoration a JS-off reader
  // loses. (The input has a SECOND `<label for="archive-q">`, the
  // magnifying-glass icon — see archive/index.astro's intro — so the
  // selector is scoped to the text one specifically; a bare
  // `label[for="archive-q"]` resolves to both and Playwright's strict mode
  // refuses to guess which.)
  await expect(page.locator('.search .axis-title[for="archive-q"]')).toBeVisible();
  const input = page.locator('#archive-q');
  await expect(input).toBeVisible();

  const rows = page.locator('#archive-list [data-s]');
  const total = await rows.count();
  expect(total, '리치 세트 = 평론 8 + 이야기 1').toBe(9);

  // The live count exists (a screen reader can still reach it once a query
  // narrows something) but starts hidden — see the "완전 무결" note in
  // archive/index.astro's intro on why hidden-at-rest is correct here, not
  // a gap: with no listener, a query never narrows anything, so it never
  // un-hides either.
  await expect(page.locator('#archive-n')).toBeHidden();

  // Typing does nothing without the listener that would hide non-matches —
  // every row stays exactly as rendered, which is the honest JS-off answer.
  await input.fill('이문자열과일치하는글은세상에없다');
  await expect(rows).toHaveCount(total);
  await expect(page.locator('#archive-list [data-s][hidden]')).toHaveCount(0);

  // Chips render and are visible, but a click reaches no listener — same
  // "sits there" answer as the query box, and the row count proves it.
  const genreChip = page.locator('.chip[data-axis-value="Pop"]');
  await expect(genreChip).toBeVisible();
  await genreChip.click();
  await expect(rows).toHaveCount(total);
  await expect(page.locator('#archive-list [data-s][hidden]')).toHaveCount(0);

  await context.close();
});

/**
 * Archive search — JS ON: typing filters, the live count is hidden at rest
 * and appears only while a query narrows the list (2026-09-09 revision —
 * see archive/index.astro's intro for why an always-visible count was
 * withdrawn), and a zero-match query says so explicitly. Rows a query
 * misses are `hidden`, not removed — matches stay in the DOM (still 9),
 * only their visibility flips.
 */
test('아카이브 검색 — 스크립트 활성 상태에서 실제로 걸러지고, 결과 수는 걸러지는 동안만 보인다', async ({ page }) => {
  await page.goto(u('/archive/'));
  const rows = page.locator('#archive-list [data-s]');
  const total = await rows.count();
  expect(total).toBe(9);
  const count = page.locator('#archive-n');

  // Hidden at rest — nothing has narrowed the list yet.
  await expect(count).toBeHidden();

  // One known title from the rich set (aurora-line-first-light) — exactly one match.
  await page.fill('#archive-q', '퍼스트 라이트');
  await expect(count).toBeVisible();
  await expect(rows).toHaveCount(total); // still in the DOM…
  await expect(page.locator('#archive-list [data-s]:not([hidden])')).toHaveCount(1); // …only one shown
  await expect(count).toHaveText('1개');

  // Zero matches says so, explicitly, and the count stays visible to say it.
  await page.fill('#archive-q', '이문자열과일치하는글은세상에없다');
  await expect(page.locator('#archive-list [data-s]:not([hidden])')).toHaveCount(0);
  await expect(count).toBeVisible();
  await expect(count).toHaveText('일치하는 글이 없습니다.');

  // Clearing the query restores the full list AND re-hides the count.
  await page.fill('#archive-q', '');
  await expect(page.locator('#archive-list [data-s]:not([hidden])')).toHaveCount(total);
  await expect(count).toBeHidden();
});

/**
 * Axis chips — JS ON: a chip fills the query box with its own label and
 * runs the SAME filter typing does (archive/index.astro's intro: "a chip is
 * a pre-written query", not a second matching rule). Covers a second click
 * toggling the filter back off, and `aria-pressed` tracking selection
 * without colour alone (WCAG 1.4.1).
 */
test('아카이브 칩 — 클릭하면 그 값으로 필터링되고, 다시 누르면 해제된다', async ({ page }) => {
  await page.goto(u('/archive/'));
  const input = page.locator('#archive-q');
  const count = page.locator('#archive-n');
  const genreChip = page.locator('.chip[data-axis-value="Pop"]');

  await expect(genreChip).toHaveAttribute('aria-pressed', 'false');
  await genreChip.click();

  // Clicking a chip is "the same as typing" — the box shows the query.
  await expect(input).toHaveValue('Pop');
  await expect(genreChip).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toBeVisible();
  // Rich set: 6 pop reviews (RICH_SET) + the base fixture (also pop) = 7 —
  // publishing and archiving are unaffected by the board's top-5 cut.
  await expect(page.locator('#archive-list [data-s]:not([hidden])')).toHaveCount(7);

  // A DIFFERENT axis's chip does not need the first one released first —
  // clicking it simply replaces the query (single query box, single source
  // of truth), and the first chip's pressed state follows.
  const tagChip = page.locator('.chip[data-axis-value="시티팝"]');
  await tagChip.click();
  await expect(input).toHaveValue('시티팝');
  await expect(genreChip).toHaveAttribute('aria-pressed', 'false');
  await expect(tagChip).toHaveAttribute('aria-pressed', 'true');

  // Clicking the SAME chip again clears the query — the toggle-off path.
  await tagChip.click();
  await expect(input).toHaveValue('');
  await expect(tagChip).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toBeHidden();
  await expect(page.locator('#archive-list [data-s]:not([hidden])')).toHaveCount(9);
});

/**
 * `?q=` landing param — the mechanism SpecMeta's Release/Genre/Tags links
 * rely on to reach a PRE-FILTERED hub with no server: a plain static link
 * (works with JS off, lands on the unfiltered hub) that enhance.js reads on
 * load when JS is on. Genre and Release both point here in real content —
 * this test exercises Release's own value (a release year) end to end.
 */
test('아카이브 — ?q= 로 도착하면 로드 시점에 그 값으로 미리 걸러진다', async ({ page }) => {
  // aurora-line-first-light released 2026-03-20 — SpecMeta's Release row on
  // that review links to /archive/?q=2026.
  await page.goto(u('/archive/?q=2026'));
  const input = page.locator('#archive-q');
  const count = page.locator('#archive-n');
  await expect(input).toHaveValue('2026');
  await expect(count).toBeVisible();
  // Every rich-set item is dated 2026 (published) and every review not
  // otherwise noted also released in 2026 — the query matches all 9.
  await expect(page.locator('#archive-list [data-s]:not([hidden])')).toHaveCount(9);
});

/**
 * THE ARROWS STEP ONE SCREENFUL — NOT ONE CARD, NOT AN ARBITRARY DISTANCE
 * (2026-09-10).
 *
 * The browsing sections became paged scrollers on the editor's brief: "지금처럼
 * 두개만 보이고 옆으로 버튼 누르거나(버튼 누르면 한번에 두카드씩 넘어가게)
 * 슬라이드해서 4개 목록까지 커버되게". The step size IS the request, and until
 * this test nothing measured it — the suite could see that two buttons shipped
 * (browser.flows) and that a page of cards fills the rail (browser.hierarchy),
 * but not that pressing one moves the row by exactly one page.
 *
 * WHY THAT GAP MATTERS MORE THAN IT SOUNDS. `enhance.js` scrolls by
 * `box.clientWidth`, which is not a number anyone wrote down — it is whatever
 * the CSS made the rail. That is the design's whole economy (one line of
 * script serves 2-up and 4-up without being told which), and it is also the
 * failure mode: any rule that makes a card's width stop dividing the rail
 * evenly turns "one press = one page" into "one press = a page and a bit,
 * snapped back to something". The reader sees a card they have already read,
 * or skips one entirely, and every existing assertion still passes.
 *
 * SO IT MEASURES CARD IDENTITY, NOT PIXELS. The assertion is which cards are
 * wholly visible before and after — [1,2] → [3,4] → [5,6] on a phone,
 * [1,2,3,4] → [5,6,7,8] on the desktop — because a pixel figure would have to
 * restate `clientWidth` and would then agree with a broken implementation for
 * the same reason it agrees with a correct one. Which cards a reader can see
 * is the property; the scroll offset is an implementation of it.
 *
 * The two ends are checked in the same pass: `prev` ships `disabled` from the
 * server (the row always opens on card 1) and `next` must become disabled once
 * the last page is reached, which is the only signal a reader gets that the
 * row has ended.
 */
test('탐색 캐러셀 — 화살표 한 번에 한 화면씩, 양 끝에서 멈춘다 (모바일 2장 · 데스크톱 4장)', async ({ page }) => {
  await page.goto(u('/'));
  const SEC = 'section[aria-label="최신 리뷰"]';

  /** Indices (1-based) of the cards wholly inside the rail's visible window. */
  const visible = () =>
    page.evaluate((sec: string) => {
      const rail = document.querySelector(`${sec} .cards`) as HTMLElement;
      const left = rail.getBoundingClientRect().left;
      return [...rail.querySelectorAll('.article-card')]
        .map((el, i) => ({ i: i + 1, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.left - left >= -1 && r.right - left <= rail.clientWidth + 1)
        .map(({ i }) => i);
    }, SEC);

  const next = page.locator(`${SEC} .carousel-btn.next`);
  const prev = page.locator(`${SEC} .carousel-btn.prev`);
  // `scroll-snap` settles asynchronously after `scrollBy`, so every read goes
  // through `expect.poll` rather than a fixed wait — a sleep long enough to be
  // reliable on a loaded CI box is long enough to hide a slow bug.
  const seeing = (want: number[]) => expect.poll(visible, { timeout: 4000 }).toEqual(want);

  // ── Phone: two per page ──
  await page.setViewportSize({ width: 390, height: 1200 });
  await seeing([1, 2]);
  await expect(prev, '행이 첫 페이지에서 열리는데 이전 버튼이 살아 있음').toBeDisabled();
  await next.click();
  await seeing([3, 4]);
  await next.click();
  await seeing([5, 6]);
  await prev.click();
  await seeing([3, 4]);

  // ── Desktop: four per page, and the row ends ──
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate((sec: string) => {
    (document.querySelector(`${sec} .cards`) as HTMLElement).scrollLeft = 0;
  }, SEC);
  await seeing([1, 2, 3, 4]);
  await next.click();
  await seeing([5, 6, 7, 8]);
  await expect(next, '마지막 페이지인데 다음 버튼이 아직 살아 있음 — 끝이 보이지 않는다').toBeDisabled();
  await expect(prev, '첫 페이지를 벗어났는데 이전 버튼이 죽어 있음').toBeEnabled();
});
