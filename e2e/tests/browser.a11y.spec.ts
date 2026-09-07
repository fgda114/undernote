/**
 * W5 carry-over #2 — the three "real device" checks, automated in headless
 * Chromium: keyboard traversal, dark mode token switch, reduced motion.
 * (Viewport 360px lives in browser.responsive.spec.ts.)
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SANDBOX_ROOT, basePathOf } from '../lib/sandbox.mjs';

const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
const u = (p: string) => `${B}${p}`;

for (const path of ['/', '/reviews/aurora-line-first-light/']) {
  test(`키보드 통독 — ${path}: 포커스 대상 전부 앵커 + focus-visible 아웃라인`, async ({ page }) => {
    await page.goto(u(path));
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

/**
 * Dark is FIXED (2026-09-07 — the light palette was deleted, reskin Q2 answer
 * B). This test used to assert light !== dark, i.e. "the scheme switch
 * works". Reversed, not removed: the same measurement now proves the
 * opposite property — that a reader whose OS asks for light gets the dark
 * page anyway. That is the riskier direction to leave unmeasured, because a
 * single stray `@media (prefers-color-scheme: light)` block reintroduced
 * anywhere in the cascade would silently produce a half-light page.
 */
test('다크 고정 — 양쪽 스킴에서 동일한 다크 배경', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(u('/'));
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).toBe(dark);
  // …and the one they both resolve to is actually dark (mean channel < 128).
  const channels = dark.match(/\d+/g)!.slice(0, 3).map(Number);
  expect(channels.reduce((a, b) => a + b, 0) / 3).toBeLessThan(128);
  // color-scheme: dark is what keeps the UA's own surfaces (scrollbars, the
  // canvas before CSS arrives) from flashing white around a dark page.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
});

/**
 * Cover hover zoom (2026-09-07) — the brief added it, so its opt-out is
 * measured rather than assumed. Under prefers-reduced-motion the transform
 * must be gone entirely, not merely fast: collapsing transition-duration
 * alone would still snap the cover to 1.06 on hover, which is the size jump
 * the preference exists to suppress.
 */
test('커버 hover 줌 — reduced-motion에서 변형 제거 실측', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/'));
  const cover = page.locator('.board .cover-frame > .cover').first();
  await expect(cover).toBeVisible();

  const scaleOf = async () => {
    // Hover the anchor, not the image: the rule is `a:hover .cover-frame`.
    await page.locator('.board a.row-link').first().hover();
    return cover.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  };
  expect(await scaleOf()).toBeGreaterThan(1); // baseline: the zoom exists
  // The frame clips it — the art never grows outside its own box.
  expect(await page.locator('.board .cover-frame').first().evaluate((el) => getComputedStyle(el).overflow)).toBe(
    'hidden',
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await scaleOf()).toBe(1);
});

test('reduced-motion — 보드 스태거 애니메이션 제거 실측', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/'));
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
