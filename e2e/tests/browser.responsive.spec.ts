/**
 * Horizontal-scroll audit across the reported viewport range: every generated
 * page is loaded and must not scroll sideways.
 *
 * 360px is the W5 carry-over and keeps its own test, unchanged — it is the
 * narrowest supported screen and the one the contract was written against.
 * The four wider widths were added on 2026-09-07 (Matthias) because the two
 * viewports where W5 actually found defects, 768 and 1440, were both added
 * LATE and by hand. A width nobody automates is a width that regresses
 * quietly: --gutter is a clamp with two knees and --shell caps the frame at
 * 1680, so an overflow can exist at 1440 while 360 and 1920 are both clean.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SANDBOX_ROOT, basePathOf, distPagePaths } from '../lib/sandbox.mjs';

test.use({ viewport: { width: 360, height: 800 } });

async function audit(page: import('@playwright/test').Page, width: number) {
  const pages = distPagePaths(join(SANDBOX_ROOT, 'rich'));
  const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
  const offenders: string[] = [];
  for (const path of pages) {
    await page.goto(`${B}${path}`, { waitUntil: 'load' });
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    if (scrollW > clientW) offenders.push(`${width}px ${path} (${scrollW}>${clientW})`);
  }
  return { offenders, count: pages.length };
}

test('360px — 전 지면 가로 스크롤 0', async ({ page }) => {
  const { offenders } = await audit(page, 360);
  expect(offenders, `가로 스크롤 발생 지면: ${offenders.join(', ')}`).toEqual([]);
});

test('768 · 1440 · 1920 · 2560px — 전 지면 가로 스크롤 0', async ({ page }) => {
  const all: string[] = [];
  let measured = 0;
  for (const width of [768, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const { offenders, count } = await audit(page, width);
    all.push(...offenders);
    measured += count;
  }
  console.log(`가로 스크롤 실측 ${measured}건 (4폭 × 지면 전수)`);
  expect(all, `가로 스크롤 발생: ${all.join(', ')}`).toEqual([]);
});
