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
    // JS-0 destinations are anchors all the way down — EXCEPT the home's
    // Charts carousel (2026-09-10), whose two arrow buttons are real
    // `<button>`s rather than anchors on purpose: a native `disabled` state
    // at either end needs one (index.astro's markup comment). Checked as a
    // SUBSET, not exact equality: a 120-keystroke Tab-press loop is a timing
    // race under parallel test load by nature (one dropped/coalesced
    // keystroke skips whatever element was next), and this file's own job is
    // "every tag we DID land on is an expected primitive, and outlines paint
    // on all of them" — not "we are guaranteed to land on every one of
    // them". The carousel button's own keyboard-focusability and outline are
    // both checked deterministically (a direct `.focus()`, no Tab-mashing)
    // in browser.contrast.spec.ts's focus-ring test, which is the right
    // place to require it be reachable.
    const allowed = path === '/' ? ['A', 'BUTTON'] : ['A'];
    // NON-EMPTY FIRST (2026-09-10). The two loops below iterate `seen`, so a
    // walk that found NOTHING satisfies both of them without executing a
    // single expectation — the vacuous pass this repo keeps rediscovering.
    // The predecessor `toEqual(['A'])` failed on an empty set for free;
    // widening it to an allow-list gave that up, so the floor is restated
    // here explicitly. Every page in this suite has at least the masthead.
    expect(seen.length, `${path}에서 탭으로 도달한 요소가 하나도 없음`).toBeGreaterThan(0);
    expect(seen.map((s) => s.tag), `${path}에 앵커가 하나도 없음`).toContain('A');
    for (const s of seen) expect(allowed, `${path}에서 예상 밖 태그 ${s.tag}`).toContain(s.tag);
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

  // POLLED, NOT READ ONCE (2026-09-10). `hover()` scrolls the target into
  // view first, and the chart card now lives in a horizontal scroll
  // container with `scroll-behavior: smooth` (the carousel). Reading the
  // transform immediately after can catch the card mid-scroll, and this
  // test failed exactly once that way in a full-suite run while passing
  // alone — a flake, which in this repo is worse than a failure because it
  // teaches people to re-run instead of to look.
  //
  // The assertion is unchanged: the zoom must exist without reduced-motion
  // and must be gone with it. Polling only removes the race — if the zoom
  // genuinely broke, the poll times out and still fails.
  const hoverCard = async () => {
    await page.locator('.board a.row-link').first().hover();
  };
  const scaleOf = () => cover.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);

  await hoverCard();
  await expect.poll(scaleOf, { message: '커버 hover 줌 부재' }).toBeGreaterThan(1);
  // The frame clips it — the art never grows outside its own box.
  expect(await page.locator('.board .cover-frame').first().evaluate((el) => getComputedStyle(el).overflow)).toBe(
    'hidden',
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await hoverCard();
  await expect.poll(scaleOf, { message: 'reduced-motion인데 변형 잔존' }).toBe(1);
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
 * THE HOVER ANSWER ON A CARD TITLE, AND THE ABSENCE OF CLIPPING.
 *
 * This test used to assert a cursor-following mint spotlight (--title-spot).
 * The effect was withdrawn on 2026-09-07; the assertions were MOVED rather
 * than deleted, because two of the three were never about the spotlight —
 * they were about the ways a title can stop being readable:
 *   · a RESTING title must paint a real colour. `background-clip: text` with
 *     `color: transparent` is one typo away from an invisible title, and the
 *     resting state is where that would be permanent;
 *   · a hovered title must ANSWER. A list whose links do nothing under the
 *     pointer does not read as a list of links;
 *   · nothing on this element may be clipped any more. That is the new half:
 *     with the gradient gone, `color: transparent` at any point in the hover
 *     chain is a defect rather than a mechanism, so it is asserted directly
 *     instead of being asserted only in the resting state.
 */
test('홈 카드 제목 hover — 라벤더 한 단계 · 어느 상태에서도 클리핑 없음', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/'));
  const card = page.locator('section[aria-label="최신 리뷰"] .card-link').first();
  const title = card.locator('.title').first();
  await expect(title).toBeVisible();
  const read = () =>
    title.evaluate((el) => ({ color: getComputedStyle(el).color, image: getComputedStyle(el).backgroundImage }));

  // Resting: a real colour, no clipping. `rgba(0, 0, 0, 0)` here would mean
  // every card title on the home is invisible.
  const resting = await read();
  expect(resting.color, '비호버 카드 제목이 투명').toBe('rgb(232, 233, 242)');
  expect(resting.image).toBe('none');

  // Pointer on the card: lavender. This is the whole affordance now, so it is
  // asserted at both places the pointer can be — the body of the card and the
  // title itself — and it has to be the SAME answer in both.
  await card.locator('.excerpt, .date').first().hover();
  await expect.poll(async () => (await read()).color).toBe('rgb(185, 165, 247)');
  expect((await read()).image, '카드 hover에서 배경이 칠해짐').toBe('none');

  const box = (await title.boundingBox())!;
  for (const fraction of [0.1, 0.5, 0.9]) {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await page.waitForTimeout(120);
    const hovered = await read();
    expect(hovered.color, `제목 hover x=${fraction}에서 색이 라벤더가 아님`).toBe('rgb(185, 165, 247)');
    // The old failure shape, now forbidden outright rather than only in the
    // resting state: a clipped title reports its colour as transparent.
    expect(hovered.image, `제목 hover x=${fraction}에서 그라데이션이 다시 칠해짐`).toBe('none');
  }

  // No pointer to follow → the same flat lavender, still not clipped.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(120);
  const reduced = await read();
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
 * The row variant's UNDERLINE is the assertion that outlived the spotlight,
 * and it is the one that matters most. A row title answers the pointer with
 * colour AND a rule, so the affordance never rests on colour alone (WCAG
 * 1.4.1) — which is what a reader with a colour vision deficiency, or one
 * whose high-contrast palette has flattened the hue, is left with.
 *
 * It used to be asserted against a specific hazard (a decoration paints in
 * currentColor, which was `transparent` while the text was clipped, so the
 * underline vanished exactly where the colour was working hardest). That
 * hazard is gone with the clipping. The PROPERTY is not, so it stays.
 */
test('아카이브 행 제목 hover — 라벤더 + 밑줄, 두 채널이 모두 산다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(u('/archive/reviews/'));
  const title = page.locator('.row-card-link .title').first();
  await expect(title).toBeVisible();

  const read = () =>
    title.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, image: cs.backgroundImage, deco: cs.textDecorationLine, decoColor: cs.textDecorationColor };
    });

  const resting = await read();
  expect(resting.color, '비호버 행 제목이 투명').toBe('rgb(232, 233, 242)');
  expect(resting.deco).toBe('none');

  const box = (await title.boundingBox())!;
  for (const fraction of [0.15, 0.85]) {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await page.waitForTimeout(200);
    const hovered = await read();
    expect(hovered.color, `행 제목 hover x=${fraction}`).toBe('rgb(185, 165, 247)');
    expect(hovered.image, '행 제목에 그라데이션이 다시 칠해짐').toBe('none');
    // Both channels, and the underline in a colour that is actually painted.
    expect(hovered.deco).toBe('underline');
    expect(hovered.decoColor, '밑줄이 보이지 않는 색').toBe('rgb(185, 165, 247)');
  }
});

/**
 * NO TITLE ON THIS SITE IS A CLIPPING HOST ANY MORE (2026-09-07).
 *
 * This test used to assert the one EXCEPTION to the spotlight — Charts, whose
 * card title sits ~8px under the site's only filled mint surface, where a
 * mint highlight would have stopped reading as "the score made this". The
 * exception outlived the rule: the spotlight is gone from every list, so the
 * assertion is generalised rather than dropped. `.title-spot` returning zero
 * across the site is what proves the removal is complete rather than partial
 * — a leftover host would keep the forced-colors defect alive on whichever
 * page still carried it.
 *
 * The second half is unchanged and is the reason this is not just a grep:
 * Charts' title still ANSWERS the pointer, in the same lavender as every
 * other title. Removing an effect must not remove the affordance.
 */
test('제목 클리핑 호스트 0 — 차트 카드 제목은 여전히 라벤더로 답한다', async ({ page }) => {
  for (const path of ['/', '/archive/reviews/', '/archive/stories/']) {
    await page.goto(u(path));
    await expect(page.locator('.title-spot'), `${path}에 스포트라이트 호스트가 남음`).toHaveCount(0);
  }

  await page.goto(u('/'));
  await expect(page.locator('.chart-card')).not.toHaveCount(0);
  const title = page.locator('.chart-card .title').first();
  await page.locator('.chart-card a.row-link').first().hover();
  await expect
    .poll(async () => title.evaluate((el) => getComputedStyle(el).color))
    .toBe('rgb(185, 165, 247)');
  expect(await title.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
});

/**
 * THE MASTHEAD IS ONE ROW, AND ITS ITEMS SHARE ONE LINE (2026-09-07, item
 * count revised 2026-09-08 when Artists left the masthead — see
 * Masthead.astro for why. Everything below the count is unchanged: it was
 * already asserting the ROW, not a number of items, via `.nav-link`).
 *
 * Two reported defects, one measurement. The nav wrapped on narrow screens —
 * ARCHIVE dropped to a second line at 360px and ARTISTS (when it was still a
 * fifth item) joined it below ~345px — which made the site's navigation a
 * two-storey block above every mobile page. And the items were reported as
 * sitting at different heights from each other.
 *
 * The second report did not reproduce: measured on the shipped build, the
 * items' glyph boxes and their PAINTED INK were identical to within 0.25px
 * at 1x, 2x and 4x, on three pages and five widths. The only real vertical
 * difference in that masthead was the wrap itself. So this test fixes the
 * invariant in place rather than a bug: at every audited width the items
 * occupy ONE ROW and ONE vertical position, and the touch target stays
 * whole in both axes. If either half ever stops being true it is now a
 * failing test rather than something someone has to notice.
 *
 * 320px is deliberately NOT audited: the supported floor is 360, and below
 * ~345 the row is allowed to wrap rather than overflow — degrading into a
 * second line is the correct failure, a horizontal scrollbar is not. With
 * one fewer item and one fewer gap the row is now narrower at every width
 * than it was when this margin was measured, so the wrap floor this
 * paragraph describes is the OLD, tighter one — a lower bound that still
 * holds, not a claim that it moved down with the item count.
 */
test('마스트헤드 내비 — 360px부터 네 항목이 한 줄 · 세로 위치 동일 · 44px 타깃', async ({ page }) => {
  await page.goto(u('/'));
  const problems: string[] = [];
  const lines: string[] = [];
  for (const width of [360, 400, 480, 640, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const m = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.nav-link')].map((a) => {
        const box = a.getBoundingClientRect();
        // The glyph run, not the padded box: this is where a baseline shift
        // would show up and the box would not.
        const range = document.createRange();
        range.selectNodeContents(a);
        const glyph = range.getBoundingClientRect();
        return {
          label: (a.textContent ?? '').trim(),
          w: box.width,
          h: box.height,
          glyphTop: Math.round(glyph.top * 100) / 100,
        };
      });
      return {
        items,
        rows: new Set(items.map((i) => i.glyphTop)).size,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    expect(m.items.length, '내비 항목이 4개가 아님').toBe(4);
    lines.push(
      `${width}: rows=${m.rows} · ${m.items.map((i) => `${i.label} ${i.w.toFixed(1)}x${i.h.toFixed(1)}`).join(' · ')}`,
    );
    if (m.rows !== 1) problems.push(`${width}px — 내비가 ${m.rows}줄로 접힘`);
    for (const i of m.items) {
      if (i.w < 44 || i.h < 44) {
        problems.push(`${width}px — ${i.label} 터치 타깃 ${i.w.toFixed(1)}x${i.h.toFixed(1)} (44px 미만)`);
      }
    }
    if (m.scrollW > m.clientW) problems.push(`${width}px — 가로 스크롤 ${m.scrollW}>${m.clientW}`);
  }
  console.log(`마스트헤드 내비 실측:\n  ${lines.join('\n  ')}`);
  expect(problems, problems.join('\n')).toEqual([]);

  // aria-current and the hover underline survive the mobile tightening: the
  // row was made to fit by changing tracking and gap, never by removing a
  // state indicator.
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(u('/archive/reviews/'));
  const current = page.locator('.nav-link.current');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('aria-current', 'page');
  const marks = await current.evaluate((el) => ({
    color: getComputedStyle(el).color,
    weight: getComputedStyle(el).fontWeight,
    bar: getComputedStyle(el, '::after').backgroundColor,
    scale: getComputedStyle(el, '::after').transform,
  }));
  expect(marks.color).toBe('rgb(232, 233, 242)');
  expect(marks.weight).toBe('800');
  expect(marks.bar, '현재 항목 바가 악센트가 아님').toBe('rgb(99, 239, 192)');
  expect(marks.scale, '현재 항목 바가 접혀 있음').not.toContain('0, 0, 0, 1, 0, 0');

  // A non-current item's underline is present-but-collapsed at rest and opens
  // on hover — the animation, not just the bar, is the thing a tightening
  // edit could quietly drop.
  const other = page.locator('.nav-link:not(.current)').first();
  expect(await other.evaluate((el) => getComputedStyle(el, '::after').transform)).toContain('0, 0, 0, 1, 0, 0');
  await other.hover();
  await expect
    .poll(async () => other.evaluate((el) => getComputedStyle(el, '::after').transform))
    .not.toContain('0, 0, 0, 1, 0, 0');
});

/**
 * THE WORDMARK AND THE NAV SIT ON ONE SHARED BASELINE (2026-09-08, revised).
 *
 * This test used to assert that the two groups' GLYPH-RUN CENTRES coincide.
 * That was itself a repair of an earlier bug (box centres agreeing while the
 * text inside disagreed by 1px), but centring the ink bands turned out to be
 * the wrong invariant, not just an imprecise one: a reader lines up two
 * pieces of text on a shared row by their BASELINES, not by the midpoint of
 * their ink. "undernote." is lowercase with ascenders and no descenders;
 * "CHARTS · REVIEWS · …" is all-caps with no ascenders past cap-height and no
 * descenders. Those are differently-shaped bands — centring them was
 * measured to land the wordmark's baseline ~7px below the nav's, which reads
 * as the wordmark sagging even while every centre-based assertion here was
 * green. This is exactly the "gate passes, defect ships" shape the rest of
 * this suite exists to catch, just self-inflicted by an earlier version of
 * this same test.
 *
 * HOW THE BASELINE IS MEASURED, and why not `getBoundingClientRect`. Neither
 * a box edge nor a Range's rect is the baseline — both are ink extents, which
 * is exactly what centring measured and got wrong above. A zero-size
 * `inline-block` appended as the last child of the run, at default
 * `vertical-align: baseline`, is laid out so its OWN bottom margin edge sits
 * ON the surrounding text's baseline; reading that edge's
 * `getBoundingClientRect().bottom` is the baseline position itself, not a
 * derived approximation of it. The probe is added and removed inside one
 * `page.evaluate`, so it never paints.
 *
 * TOLERANCE. Unlike the old centre check, this is not comparing two
 * different-shaped ink bands — it is comparing where the browser's own layout
 * engine placed a baseline it computed once (via CSS `align-items: baseline`
 * propagated through .masthead-inner > .nav-list > li > .nav-link, see
 * Masthead.astro for why every level needs the property set). There is no
 * per-typeface geometry left to disagree about, so the 0.25px tolerance below
 * is headroom against float rounding, not a fudge factor — measured 0.000px
 * at every compared width on the shipped build.
 *
 * Widths below ~471px are skipped BY MEASUREMENT, not by a hardcoded list:
 * there the nav wraps onto its own row under the wordmark, and comparing
 * baselines of two different rows would be meaningless rather than wrong.
 * The wrap itself is already covered above.
 */
test('마스트헤드 — 워드마크와 내비가 같은 줄에서 기준선을 공유', async ({ page }) => {
  await page.goto(u('/'));
  const problems: string[] = [];
  const lines: string[] = [];
  for (const width of [480, 640, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const m = await page.evaluate(() => {
      // Zero-height inline-block, default vertical-align: baseline — its own
      // bottom margin edge lands exactly on the run's baseline. Appended and
      // read inside one evaluate call, then removed, so it never paints.
      const baselineOf = (el: Element) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        el.appendChild(probe);
        const b = probe.getBoundingClientRect().bottom;
        probe.remove();
        return b;
      };
      const wmEl = document.querySelector('.wordmark')!;
      const wmTop = wmEl.getBoundingClientRect().top;
      const wm = baselineOf(wmEl);
      const nav = [...document.querySelectorAll('.nav-link')].map((a) => ({
        label: (a.textContent ?? '').trim(),
        baseline: baselineOf(a),
        top: a.getBoundingClientRect().top,
      }));
      // Row membership is judged by TOP proximity, not baseline proximity —
      // baseline is exactly the quantity under test, so using it here would
      // make the skip condition circular.
      return { wm, nav, sameRow: nav.every((n) => Math.abs(n.top - wmTop) < 30) };
    });
    if (!m.sameRow) {
      lines.push(`${width}: 내비가 별도 행 — 비교 대상 아님`);
      continue;
    }
    const worst = Math.max(...m.nav.map((n) => Math.abs(n.baseline - m.wm)));
    lines.push(`${width}: 워드마크 기준선 ${m.wm.toFixed(3)} · 내비 ${m.nav.map((n) => n.baseline.toFixed(3)).join(' ')} · 최대차 ${worst.toFixed(3)}`);
    if (worst > 0.25) {
      problems.push(`${width}px — 워드마크와 내비의 기준선이 ${worst.toFixed(3)}px 어긋남 (허용 0.25)`);
    }
  }
  console.log(`마스트헤드 기준선 정렬 실측:\n  ${lines.join('\n  ')}`);
  expect(problems, problems.join('\n')).toEqual([]);
  // At least one width must actually have been compared — a run where every
  // width wrapped would otherwise report success having measured nothing.
  expect(lines.filter((l) => l.includes('최대차')).length, '비교된 폭이 하나도 없음').toBeGreaterThan(4);

  // The underline's 2px is reserved on BOTH block edges so the border-box
  // (and therefore the row height the baseline maths above run against) is
  // identical whether or not the bar is painted — that symmetry, the
  // underline position, and the touch target are asserted here so a later
  // "cleanup" of the top border has to explain itself to a failing test.
  await page.setViewportSize({ width: 1440, height: 900 });
  const geom = await page.locator('.nav-link').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      borderTop: cs.borderTopWidth,
      borderBottom: cs.borderBottomWidth,
      height: r.height,
      afterBottom: getComputedStyle(el, '::after').bottom,
      afterHeight: getComputedStyle(el, '::after').height,
    };
  });
  expect(geom.borderTop, '테두리가 비대칭이면 44px 박스 안에서 CLS 없이 상태가 바뀐다는 전제가 깨진다').toBe(geom.borderBottom);
  expect(geom.height, '44px 터치 타깃').toBeGreaterThanOrEqual(44);
  expect(geom.afterBottom).toBe('-2px');
  expect(geom.afterHeight).toBe('2px');
});

/**
 * THE MASTHEAD'S INK IS VERTICALLY CENTRED IN THE MASTHEAD (2026-09-08),
 * IN BOTH OF THE SHAPES THE MASTHEAD HAS (2026-09-10).
 *
 * Baseline alignment fixed the wordmark against the nav and, on its own,
 * broke something the item-to-item test cannot see: the nav-link's 44px
 * touch target hung entirely BELOW the shared baseline, so the flex line was
 * bottom-heavy and centring it left the visible row 10.5px under the top
 * edge with 31.5px of nothing beneath. Every baseline assertion passed
 * throughout — they measure the two runs against EACH OTHER, and both were
 * high together, which is the same blind spot the item-to-item nav test had
 * before baselines were introduced. One level up each time.
 *
 * This measures the ink against the MASTHEAD'S OWN EDGES, so it needs no
 * second element to compare with and cannot be satisfied by two things
 * being wrong in the same direction.
 *
 * WHAT IS PINNED IS THE SYMMETRY, NOT THE PADDING. `.nav-link`'s 17px/7px
 * split (one row) and 12px/12px split (two rows) are derived from
 * measurement and a typeface change can invalidate either; a test that
 * pinned "17px" would keep passing while the row drifted off centre. 2px of
 * tolerance is under one CSS pixel of asymmetry per edge and an order of
 * magnitude below the 21px defect this replaced.
 *
 * THE WRAPPED WIDTHS USED TO BE SKIPPED, AND THAT IS EXACTLY HOW THE NEXT
 * DEFECT SHIPPED (2026-09-10). This test read, in its own words, "below
 * ~471px the nav takes its own row, and 'the ink' is then two rows with a
 * gap rather than one band to centre" — and then measured nothing there. It
 * was a real difficulty and the wrong answer: the two-row masthead is what
 * every phone renders, it had never been styled, and it showed. The
 * wordmark's box sat at y=0 with nothing above it, the rows were 41px apart
 * ink-to-ink, and the bar came to 101px at 390px. Nothing failed, because
 * nothing looked.
 *
 * So the wrapped state gets its own invariants rather than an exemption:
 *
 *   1. SYMMETRY, the same property and the same 2px, measured against the
 *      union of both rows' ink — the outer edges are still two edges of one
 *      painted band whichever shape the bar is in.
 *   2. THE GAP BETWEEN THE ROWS IS NOT THE TALLEST THING IN THE BAR. 41px of
 *      air between two 16-24px runs of text is the specific defect, and it
 *      is invisible to a symmetry check: padding both ends equally would
 *      have "centred" it perfectly. Bounded by the nav row's own height,
 *      which is the 44px touch target — a number this site already holds
 *      everywhere and does not get to grow.
 *   3. BOTH SHAPES ARE ACTUALLY REACHED. A future rule that made the
 *      masthead one-row at every width — or two-row at every width — would
 *      otherwise satisfy every assertion above by never entering the other
 *      state, which is how the skip above passed for two days.
 *
 * The widths are real phone widths on purpose (390 iPhone 14/15, 393 Pixel,
 * 402 iPhone 16, 414 iPhone Plus, 430 Pro Max) and they straddle the 405/406
 * boundary Masthead.astro derives, so a font change that moves that boundary
 * shows up here as a state flip with numbers attached rather than as silence.
 */
test('마스트헤드 — 한 줄일 때도 두 줄일 때도 잉크가 세로 중앙 (위·아래 여백 대칭)', async ({ page }) => {
  await page.goto(u('/'));
  const problems: string[] = [];
  const lines: string[] = [];
  const states = new Set<string>();
  for (const width of [360, 390, 393, 402, 405, 406, 414, 430, 480, 640, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const m = await page.evaluate(() => {
      const ink = (el: Element) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const b = r.getBoundingClientRect();
        return { top: b.top, bot: b.bottom };
      };
      const bar = document.querySelector('.masthead')!.getBoundingClientRect();
      const wm = ink(document.querySelector('.wordmark')!);
      const nav = [...document.querySelectorAll('.nav-link')].map(ink);
      const navTop = Math.min(...nav.map((n) => n.top));
      const navBot = Math.max(...nav.map((n) => n.bot));
      // The painted band is the union of both runs — the nav sets the top on
      // no width today, but reading the union means the assertion survives a
      // type-scale change that reverses which one does, and it is what makes
      // the same two numbers meaningful in the two-row shape.
      const top = Math.min(wm.top, navTop);
      const bottom = Math.max(wm.bot, navBot);
      const navBox = document.querySelector('.nav-link')!.getBoundingClientRect();
      return {
        above: top - bar.top,
        below: bar.bottom - bottom,
        barHeight: bar.height,
        wrapped: navTop > wm.bot,
        rowGapInk: navTop - wm.bot,
        navRowHeight: navBox.height,
      };
    });
    states.add(m.wrapped ? '2행' : '1행');
    const skew = Math.abs(m.above - m.below);
    lines.push(
      `${width}: ${m.wrapped ? '2행' : '1행'} · 바 ${m.barHeight.toFixed(0)} · 위 ${m.above.toFixed(1)} · 아래 ${m.below.toFixed(1)} · 차 ${skew.toFixed(1)}` +
        (m.wrapped ? ` · 행간 ${m.rowGapInk.toFixed(1)}` : ''),
    );
    if (skew > 2) {
      problems.push(`${width}px — 마스트헤드 잉크가 위 ${m.above.toFixed(1)} / 아래 ${m.below.toFixed(1)}로 ${skew.toFixed(1)}px 치우침 (허용 2)`);
    }
    if (m.wrapped && m.rowGapInk > m.navRowHeight) {
      problems.push(
        `${width}px — 로고와 메뉴 사이가 ${m.rowGapInk.toFixed(1)}px로 메뉴 행 높이 ${m.navRowHeight.toFixed(1)}px보다 큼 (두 줄이 한 덩어리로 읽히지 않음)`,
      );
    }
  }
  console.log(`마스트헤드 세로 여백 실측:\n  ${lines.join('\n  ')}`);
  expect(problems, problems.join('\n')).toEqual([]);
  expect(lines.length, '측정된 폭이 없음').toBeGreaterThan(10);
  expect([...states].sort(), '마스트헤드가 두 형태 중 한쪽만 나옴 — 다른 쪽 규칙이 죽었거나 도달 불가').toEqual(['1행', '2행']);
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
