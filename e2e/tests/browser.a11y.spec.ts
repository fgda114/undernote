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

/**
 * Hover treatments, 2026-09-07. A screenshot cannot prove any of these — a
 * still frame of an animation is indistinguishable from a still frame of no
 * animation — so the three properties that could regress silently are
 * measured: the underline grows from the CENTRE, it does not move the item
 * it belongs to, and the reduced-motion path still SHOWS the state instead
 * of hiding it. That last one is the reason this test exists at all:
 * "respect the preference" is easy to implement as "delete the indicator",
 * which would leave a keyboard-and-motion-sensitive reader with no hover
 * feedback at all.
 */
test('내비 hover 밑줄 — 가운데에서 퍼짐 · 시프트 0 · reduced-motion에서는 즉시 표시', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/'));
  const link = page.locator('.nav-link').nth(1); // not the current page
  const read = () =>
    link.evaluate((el) => {
      const a = getComputedStyle(el, '::after');
      const r = el.getBoundingClientRect();
      return { transform: a.transform, origin: a.transformOrigin, duration: a.transitionDuration, width: r.width, height: r.height };
    });
  const scaleX = (m: string) => (m === 'none' ? 1 : Number(m.match(/matrix\(([-\d.]+)/)![1]));

  const rest = await read();
  expect(scaleX(rest.transform), '기본 상태에서 밑줄이 이미 보임').toBe(0);
  // The origin is the box's own centre — that IS "opens from the middle".
  expect(Math.abs(parseFloat(rest.origin) - rest.width / 2)).toBeLessThan(1);
  expect(parseFloat(rest.duration), '애니메이션 없음').toBeGreaterThan(0.05);

  await link.hover();
  // Polled, not slept: the bar is mid-transition for 120ms after the pointer
  // arrives, and reading it on the same tick measures the animation's first
  // frame rather than its destination.
  await expect.poll(async () => scaleX((await read()).transform)).toBeCloseTo(1, 2);
  const hovered = await read();
  // Zero layout shift: the bar is an absolutely positioned pseudo-element
  // over a permanently reserved 2px border, so the item cannot move.
  expect([hovered.width, hovered.height]).toEqual([rest.width, rest.height]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await link.hover();
  const still = await read();
  expect(parseFloat(still.duration), 'reduce에서 전환이 살아 있음').toBeLessThanOrEqual(0.001);
  // No poll here on purpose: under `reduce` the bar has to be at full width
  // on the SAME tick the pointer arrives. Polling would hide exactly the
  // failure this line exists to catch.
  expect(scaleX(still.transform), 'reduce에서 상태 표시 자체가 사라짐').toBeCloseTo(1, 2);
});

test('About hover — 밑줄 없음 · 색은 바뀜 · focus-visible 아웃라인 유지', async ({ page }) => {
  await page.goto(u('/'));
  const about = page.locator('.footer-about');
  const read = () =>
    about.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        color: s.color,
        decoration: s.textDecorationLine,
        border: s.borderBottomColor,
        after: getComputedStyle(el, '::after').content,
      };
    });
  const rest = await read();
  await about.hover();
  // …the link must still answer the pointer, or it stops reading as one.
  // Polled: the colour step is a 120ms transition.
  await expect.poll(async () => (await read()).color).not.toBe(rest.color);
  const hovered = await read();
  // Three ways an underline could appear here; none of them may.
  expect(hovered.decoration).toBe('none');
  expect(hovered.border).toContain('rgba(0, 0, 0, 0)');
  expect(hovered.after).toBe('none');
  // The keyboard reader's position indicator is untouched by all of that.
  const outline = await about.evaluate((el) => {
    el.focus();
    const s = getComputedStyle(el);
    return `${s.outlineStyle} ${s.outlineWidth}`;
  });
  expect(outline).toBe('solid 2px');
});

/**
 * The home CARD title's cursor spotlight (--title-spot). Three properties,
 * and the last two are the ones that could regress silently:
 *   · the light moves with the pointer across the glyphs;
 *   · a RESTING title is never clipped — `background-clip: text` with a
 *     transparent colour is one typo away from an invisible title, so the
 *     un-hovered state has to paint a real colour;
 *   · every environment without a pointer to follow (reduced motion, touch)
 *     lands on flat lavender rather than on the middle of the ramp.
 *
 * The effect moved here from the section headings on 2026-09-07. This test
 * moved with it rather than being rewritten from scratch, which is why it
 * asserts the same three properties about a different element.
 */
test('홈 카드 제목 hover — 커서 위치로 스포트라이트가 움직이고, 비호버·reduced-motion은 단색', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/'));
  const card = page.locator('section[aria-label="최신 리뷰"] .card-link').first();
  const title = card.locator('.title-spot').first();
  await expect(title).toBeVisible();

  // Resting: a real colour, no clipping. `rgba(0, 0, 0, 0)` here would mean
  // every card title on the home is invisible.
  const resting = await title.evaluate((el) => ({
    color: getComputedStyle(el).color,
    image: getComputedStyle(el).backgroundImage,
  }));
  expect(resting.color, '비호버 카드 제목이 투명').toBe('rgb(232, 233, 242)');
  expect(resting.image).toBe('none');

  // Pointer on the CARD but not on the title: flat lavender, still no clip.
  await card.locator('.excerpt, .date').first().hover();
  await page.waitForTimeout(250);
  expect(await title.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(185, 165, 247)');

  // Pointer on the TITLE: the gradient is positioned by the pointer, so
  // moving across the glyphs moves the light. background-position is what
  // carries it — `color` is transparent while clipping, so the glyph colour
  // cannot be sampled and the gradient's own value is the proof.
  const box = (await title.boundingBox())!;
  const imageAt = async (fraction: number) => {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await page.waitForTimeout(200);
    return title.evaluate((el) => getComputedStyle(el).backgroundImage);
  };
  const left = await imageAt(0.1);
  const right = await imageAt(0.9);
  expect(left, '커서를 옮겨도 스포트라이트가 그대로').not.toBe(right);
  expect(left).toContain('gradient');
  expect(await title.evaluate((el) => getComputedStyle(el).color)).toBe('rgba(0, 0, 0, 0)');

  // No pointer to follow → flat lavender, and NOT clipped.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(200);
  const reduced = await title.evaluate((el) => ({
    color: getComputedStyle(el).color,
    image: getComputedStyle(el).backgroundImage,
  }));
  expect(reduced.color).toBe('rgb(185, 165, 247)');
  expect(reduced.image).toBe('none');
});

/**
 * Section headings, after the same 2026-09-07 swap: they carry NO hover
 * treatment at all, and only the one that names the list the scores produced
 * carries the fixed gradient. Asserted because the round that gave all three
 * of them a hover effect also, briefly, painted two headings with the
 * score's colour — which is the doctrine failure --head-sheen exists to
 * prevent, and it is cheaper to measure than to remember.
 */
test('홈 섹션 제목 — Charts만 고정 그라데이션, 셋 다 hover 효과 없음', async ({ page }) => {
  await page.goto(u('/'));
  const heads = page.locator('.section-head .title');
  await expect(heads).toHaveCount(3);

  // Charts (first) takes the gradient; the two browsing heads take plain ink.
  await expect(heads.nth(0)).toHaveClass(/head-sheen/);
  for (const i of [1, 2]) {
    await expect(heads.nth(i)).not.toHaveClass(/head-sheen/);
    expect(await heads.nth(i).evaluate((el) => getComputedStyle(el).color)).toBe('rgb(232, 233, 242)');
  }

  // Hovering any of them changes nothing: a section heading is not a link.
  for (const i of [0, 1, 2]) {
    const before = await heads.nth(i).evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.color}|${cs.backgroundImage}`;
    });
    await heads.nth(i).hover();
    await page.waitForTimeout(250);
    const after = await heads.nth(i).evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.color}|${cs.backgroundImage}`;
    });
    expect(after, `섹션 제목 ${i}에 hover 효과`).toBe(before);
  }
});

/**
 * The list thumbnail's score chip (2026-09-07) is the ONE place this site
 * overlays album art, so the trade it was accepted on is measured: the
 * figure's legibility must not depend on the artwork underneath. The chip is
 * opaque, which is what makes that true — this test would fail the moment
 * someone made it translucent to show more of the cover.
 */
test('목록 썸네일 점수 칩 — 커버와 무관한 불투명 배경 · 커버 위 우하단', async ({ page }) => {
  await page.goto(u('/archive/reviews/'));
  const chip = page.locator('.thumb-score').first();
  const frame = page.locator('.article-card .cover-frame').first();
  await expect(chip).toBeVisible();

  const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg, '반투명 배경은 커버에 가독성을 맡기는 것').toBe('rgb(31, 38, 55)');

  // Bottom-right, inside the artwork, and small: the overlay is a corner
  // mark, not a band across the cover.
  const c = (await chip.boundingBox())!;
  const f = (await frame.boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
  expect(c.y + c.height).toBeLessThanOrEqual(f.y + f.height + 0.5);
  expect(c.x).toBeGreaterThan(f.x + f.width / 2);
  expect(c.y).toBeGreaterThan(f.y + f.height / 2);
  expect((c.width * c.height) / (f.width * f.height), '커버를 가리는 면적').toBeLessThan(0.15);
});
