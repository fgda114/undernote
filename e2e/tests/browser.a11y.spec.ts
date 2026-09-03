/**
 * W5 carry-over #2 — the three "real device" checks, automated in headless
 * Chromium: keyboard traversal, dark mode token switch, reduced motion.
 * (Viewport 360px lives in browser.responsive.spec.ts.)
 */
import { expect, test } from '@playwright/test';

for (const path of ['/', '/reviews/aurora-line-first-light/']) {
  test(`키보드 통독 — ${path}: 포커스 대상 전부 앵커 + focus-visible 아웃라인`, async ({ page }) => {
    await page.goto(path);
    const seen: { tag: string; outline: string }[] = [];
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return { tag: el.tagName, outline: getComputedStyle(el).outlineStyle };
      });
      if (info === null) break; // wrapped around to body — full traversal done
      seen.push(info);
    }
    expect(seen.length).toBeGreaterThan(5);
    // JS 0 sites have exactly one interactive primitive: the anchor.
    expect([...new Set(seen.map((s) => s.tag))]).toEqual(['A']);
    // :focus-visible must paint an outline on keyboard focus.
    for (const s of seen) expect(s.outline).not.toBe('none');
  });
}

test('다크 모드 — prefers-color-scheme 토큰 전환 실측', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).not.toBe(light);
  // Dark background should actually be dark (mean channel < 128).
  const channels = dark.match(/\d+/g)!.slice(0, 3).map(Number);
  expect(channels.reduce((a, b) => a + b, 0) / 3).toBeLessThan(128);
});

test('reduced-motion — 보드 스태거 애니메이션 제거 실측', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const animated = await page
    .locator('.stagger > *')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page
    .locator('.stagger > *')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animated).not.toBe('none'); // baseline: the stagger exists
  expect(reduced).toBe('none');
});
