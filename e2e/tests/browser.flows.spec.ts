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
  await page.goto(u('/archive/2026/'));
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
  // The pager arrows are anchors, so they are real links with no script —
  // they point at the first and last card instead of stepping.
  const pager = page.locator('.board .pager-btn');
  if ((await pager.count()) > 0) {
    await expect(pager.first()).toHaveAttribute('href', /#chart-/);
  }

  // Navigation still works: it is anchors all the way down.
  await page.locator('.board a.row-link').first().click();
  await expect(page).toHaveURL(/\/reviews\/[^/]+\/$/);
  await expect(page.locator('.score-mark')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();

  await context.close();
});

test('404 — 없는 주소는 404 지면', async ({ page }) => {
  const response = await page.goto(u('/no-such-page/'));
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('이 주소에는 글이 없습니다');
  await expect(page.getByRole('link', { name: 'Archive' }).first()).toBeVisible();
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
