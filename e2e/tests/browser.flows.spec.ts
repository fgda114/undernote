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
  await expect(page.locator('.verdict')).toBeVisible();
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

test('US-8 — 전역 내비 "소개" → 기준 3문 명문', async ({ page }) => {
  await page.goto(u('/archive/2026/'));
  await page.getByRole('link', { name: '소개' }).first().click();
  await expect(page).toHaveURL(/\/about\/$/);
  const body = await page.locator('main').innerText();
  expect(body).toContain('안 들으면 손해');
  expect(body).toContain('다루지 않'); // 다루지 않음 = 추천하지 않음
  expect(body).toContain('순위');
});

test('404 — 없는 주소는 404 지면', async ({ page }) => {
  const response = await page.goto(u('/no-such-page/'));
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('이 주소에는 글이 없습니다');
  await expect(page.getByRole('link', { name: '아카이브' }).first()).toBeVisible();
});

test('NFR — 주요 흐름 전체에서 JS 요청 0 (클라이언트 JS 0 실측)', async ({ page }) => {
  const jsRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('.js') || req.resourceType() === 'script') jsRequests.push(req.url());
  });
  for (const path of ['/', '/list/2026/', '/reviews/aurora-line-first-light/', '/archive/', '/about/']) {
    await page.goto(u(path), { waitUntil: 'networkidle' });
  }
  expect(jsRequests).toEqual([]);
});
