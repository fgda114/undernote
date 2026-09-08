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

/**
 * MOBILE TITLE POSITION — THE .page-title FAMILY AGREES ON ONE TOP EDGE
 * (2026-09-08).
 *
 * A DESKTOP pass already unified every `.page-title` page onto one shared top
 * offset (the reader's "각 메뉴 탭마다 제목부분이 다른데 통일성을 맞춰줘"
 * request). Five `.listing` pages — /archive/reviews/, /archive/stories/, and
 * the three axis-VALUE pages /archive/{year}/, /archive/genre/{bucket}/,
 * /archive/tag/{tag}/ — never got the matching mobile rule
 * (`padding-top: var(--s-32)` below 640px); every sibling page had it. The
 * five sat 16px lower than the pages a reader compares them against directly
 * from the masthead, on every phone width, which is what the "상세페이지들
 * 제목위치 안 맞음" report was measuring.
 *
 * TWO GROUPS, NOT ONE, AND THAT SPLIT IS CORRECT. The three axis-value pages
 * carry a FormatLabel eyebrow ("Archive") above the `<h1>` that the other
 * five do not — a `<h1>` that is an axis VALUE takes the overline, one that
 * is the axis NAME does not (see archive/[year].astro's intro). That is a
 * content difference, not a bug, and it is the same 16px-taller gap on
 * desktop (measured 113 vs 129 at 1024px) — so this test asserts each group
 * is internally flush AND that the gap between the groups is the SAME
 * constant on mobile as it already is on desktop, rather than asserting one
 * single position for every page, which would fight the eyebrow rather than
 * account for it. */
test('모바일 — .page-title 계열 상단 위치가 데스크톱과 같은 두 그룹으로 일치', async ({ page }) => {
  const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
  // No FormatLabel eyebrow above the <h1> — the axis NAME pages.
  const flush = ['/about/', '/archive/', '/archive/reviews/', '/archive/stories/', '/artists/', '/list/2026/'];
  // FormatLabel eyebrow above the <h1> — the axis VALUE pages.
  const eyebrowed = ['/archive/2026/', '/archive/genre/pop/', '/archive/tag/city-pop/'];

  // One `page`, so navigations are sequential — Promise.all over goto() on a
  // single page would race two navigations against each other.
  const topOf = async (width: number, path: string) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${B}${path}`, { waitUntil: 'load' });
    return page.locator('main h1').first().evaluate((el) => el.getBoundingClientRect().top);
  };
  const topsOf = async (width: number, paths: string[]) => {
    const out: number[] = [];
    for (const p of paths) out.push(await topOf(width, p));
    return out;
  };

  // Measured once: the reference gap the desktop pass already established
  // between the two groups (1024px, well above every breakpoint in play).
  const desktopGap = (await topOf(1024, eyebrowed[0])) - (await topOf(1024, flush[0]));

  for (const width of [360, 390, 414]) {
    const flushTops = await topsOf(width, flush);
    const eyebrowedTops = await topsOf(width, eyebrowed);

    const flushSpread = Math.max(...flushTops) - Math.min(...flushTops);
    const eyebrowedSpread = Math.max(...eyebrowedTops) - Math.min(...eyebrowedTops);
    const mobileGap = eyebrowedTops[0] - flushTops[0];

    expect(flushSpread, `${width}px — 이름축 페이지 상단 위치가 서로 어긋남: ${flush.map((p, i) => `${p}=${flushTops[i]}`).join(', ')}`).toBeLessThanOrEqual(0.5);
    expect(eyebrowedSpread, `${width}px — 값축 페이지 상단 위치가 서로 어긋남: ${eyebrowed.map((p, i) => `${p}=${eyebrowedTops[i]}`).join(', ')}`).toBeLessThanOrEqual(0.5);
    expect(mobileGap, `${width}px — 값축 그룹과 이름축 그룹의 간격(${mobileGap})이 데스크톱(${desktopGap})과 다름`).toBeCloseTo(desktopGap, 0);
  }
});
