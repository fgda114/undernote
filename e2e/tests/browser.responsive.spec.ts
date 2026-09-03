/**
 * W5 carry-over — 360px horizontal scroll audit, automated: every generated
 * page is loaded at 360×800 in Chromium and must not scroll horizontally.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SANDBOX_ROOT, distPagePaths } from '../lib/sandbox.mjs';

test.use({ viewport: { width: 360, height: 800 } });

test('360px — 전 지면 가로 스크롤 0', async ({ page }) => {
  const pages = distPagePaths(join(SANDBOX_ROOT, 'rich'));
  const offenders: string[] = [];
  for (const path of pages) {
    await page.goto(path === '/404.html' ? '/404.html' : path, { waitUntil: 'load' });
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    if (scrollW > clientW) offenders.push(`${path} (${scrollW}>${clientW})`);
  }
  expect(offenders, `가로 스크롤 발생 지면: ${offenders.join(', ')}`).toEqual([]);
});
