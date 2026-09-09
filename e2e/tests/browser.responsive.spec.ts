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
 * (2026-09-08, STRUCTURAL REWRITE 2026-09-09).
 *
 * A DESKTOP pass already unified every `.page-title` page onto one shared top
 * offset (the reader's "각 메뉴 탭마다 제목부분이 다른데 통일성을 맞춰줘"
 * request). This test used to assert TWO groups by a hardcoded page list —
 * axis-NAME pages (no eyebrow) and axis-VALUE pages (a FormatLabel eyebrow
 * above the `<h1>`, e.g. /archive/{year}/) — because at the time both groups
 * were real and non-empty.
 *
 * THE EYEBROWED GROUP IS GONE (2026-09-09, axis-chip redesign). Every
 * `.page-title` page that carried a FormatLabel eyebrow was a per-axis-value
 * page (`/archive/{year}/`, `/archive/genre/{bucket}/`, `/archive/tag/
 * {tag}/`), and all three were retired in favour of chips on the one archive
 * hub — see archive/index.astro's intro. The one other page on this site
 * with an eyebrow over an axis VALUE, `/artists/{slug}/`, titles itself with
 * its own `.name` class rather than the shared `.page-title` (see that
 * page's template) and was never part of this comparison.
 *
 * REWRITTEN TO CLASSIFY STRUCTURALLY RATHER THAN BY A HARDCODED LIST (the
 * lead's standing instruction, already followed by the title→content gap
 * test below — a hardcoded array only proves today's pages agree with EACH
 * OTHER and says nothing the moment a page is added, removed, or, as
 * happened here, a whole GROUP disappears). Each `.page-title` page found in
 * the built site is classified by whether its `<h1>` has a preceding sibling
 * (an eyebrow) or not, the two groups are each asserted internally flush,
 * and — only if a future page brings the eyebrowed group back — the two
 * groups' offsets are compared. Today that second check is skipped rather
 * than faked: asserting a relationship between an empty group and a
 * non-empty one would either pass vacuously or fail on a group that no
 * longer exists, neither of which tests anything real. */
test('모바일 — .page-title 계열 상단 위치가 같은 그룹끼리 일치 (지면 목록 하드코딩 없음)', async ({ page }) => {
  const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
  const pages = distPagePaths(join(SANDBOX_ROOT, 'rich')).filter((p) => p !== '/404.html');

  const classify = async (width: number, path: string) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${B}${path}`, { waitUntil: 'load' });
    return page.evaluate(() => {
      const h1 = document.querySelector('main h1.page-title');
      if (!h1) return null;
      return { eyebrowed: h1.previousElementSibling !== null, top: h1.getBoundingClientRect().top };
    });
  };

  for (const width of [360, 390, 414]) {
    const flushTops: number[] = [];
    const eyebrowedTops: number[] = [];
    for (const p of pages) {
      const m = await classify(width, p);
      if (!m) continue; // not a .page-title page at all (review/story/recap)
      (m.eyebrowed ? eyebrowedTops : flushTops).push(m.top);
    }

    expect(flushTops.length, `${width}px — 비교할 이름축(.page-title, 이유브로우 없음) 지면이 없음`).toBeGreaterThan(0);
    const flushSpread = Math.max(...flushTops) - Math.min(...flushTops);
    expect(flushSpread, `${width}px — 이름축 페이지 상단 위치가 서로 어긋남: ${flushTops.join(', ')}`).toBeLessThanOrEqual(0.5);

    if (eyebrowedTops.length > 0) {
      const eyebrowedSpread = Math.max(...eyebrowedTops) - Math.min(...eyebrowedTops);
      expect(eyebrowedSpread, `${width}px — 값축 페이지 상단 위치가 서로 어긋남: ${eyebrowedTops.join(', ')}`).toBeLessThanOrEqual(0.5);
    }
  }
});

/**
 * TITLE→CONTENT GAP — EVERY BARE `.page-title` AGREES ON ONE NUMBER
 * (2026-09-08).
 *
 * The test above proves five listing pages agree on where their title's TOP
 * edge sits. It says nothing about where the title's BOTTOM edge sits
 * relative to what follows it, which is the report this test answers: "각
 * 탭 별로 제목이랑 컨텐츠 간격이 일정하지가 않다" (Charts/Reviews/Notes/
 * Artists/Archive). Measured before this fix: Reviews, Notes, Artists and
 * the three archive axis-value listings all opened 24px under their title
 * (`.cards`/`.rows` `margin-top: var(--s-24)`, set per page); the Archive hub
 * and About opened 32px (`.archive`/`.about`'s flex `gap`, built for spacing
 * BETWEEN that page's own sections and only incidentally governing the first
 * one too); Charts (the active year, what the masthead's Charts link
 * actually opens) opened 48px, same cause. Three numbers for what a reader
 * experiences as one relationship, on the one axis nothing else in this
 * suite checks.
 *
 * NO PAGE LIST, BY DESIGN — the lead's standing instruction after today's
 * mobile-listing miss (4343fbc): a hardcoded array only proves five pages
 * agree with EACH OTHER, and stops meaning anything the moment a sixth page
 * is added and nobody remembers to extend it. What is asserted instead is
 * the RULE global.css's own `.page-title` comment already states — "every
 * page has exactly one h1" — walked one step further: a `.page-title` whose
 * title block carries NOTHING beside the h1 itself (no frozen-year chip, no
 * caption, no byline) is a "BARE" title, and every bare title on the built
 * site, whichever page it is on, shares one title→content gap. That
 * structural test (not a path) is what makes this survive new pages without
 * an edit: a future tab with a bare `.page-title` is picked up automatically;
 * a future page that adds byline/caption furniture under its title correctly
 * falls out of the comparison instead of failing it, because a bare-title
 * gap and a captioned one are not the same measurement (the finalized face of
 * `/list/{year}/` and the monthly recap are today's examples — both keep a
 * caption between the title and the list, which is content, not drift).
 *
 * WHAT COUNTS AS THE TITLE'S OWN BLOCK, since some pages wrap the h1 in a
 * `<header>` (Charts, for the frozen-year chip and immutability caption that
 * only render on a FINALIZED year) and others do not (every
 * `.listing`/`.artists`/`.archive` page, where the h1 sits directly in
 * `<main>` beside `FormatLabel`/`.cards` as siblings, never inside a
 * `<header>` of its own). `h1.closest('header')` is the structural signal —
 * a semantic tag the pages already use with exactly this meaning, not a
 * class name invented for this test. Where a `<header>` exists, IT is the
 * title block and is bare only while the h1 is its ONLY child; where none
 * exists, the h1 itself is the block and is always bare (nothing can sit
 * between an unwrapped h1 and whatever follows it — FormatLabel, the one
 * eyebrow this test's sibling above already covers, only ever renders
 * BEFORE the h1). Either way "bare" means the block's next element sibling
 * is the first content the reader sees, with nothing structural between the
 * title and it.
 */
test('타이틀→콘텐츠 간격 — 형제 요소 없는 순수 .page-title 지면은 모두 동일 (지면 목록 하드코딩 없음)', async ({ page }) => {
  const B = basePathOf(join(SANDBOX_ROOT, 'rich'));
  const pages = distPagePaths(join(SANDBOX_ROOT, 'rich')).filter((p) => p !== '/404.html');

  const measure = async (width: number) => {
    await page.setViewportSize({ width, height: 1000 });
    const bare: { path: string; gap: number }[] = [];
    const skipped: string[] = [];
    for (const path of pages) {
      await page.goto(`${B}${path}`, { waitUntil: 'load' });
      const m = await page.evaluate(() => {
        const h1 = document.querySelector('main h1.page-title');
        if (!h1) return null;
        // The title's own block: the closest <header> ancestor if one wraps
        // the h1 (Charts' `.head`), the h1 itself otherwise (every other
        // `.page-title` page — see the intro above for why that split is
        // exhaustive rather than a guess).
        const header = h1.closest('header');
        const block = header ?? h1;
        const isBare = header ? header.children.length === 1 : true;
        const next = block.nextElementSibling;
        if (!isBare || !next) return { bare: false as const };
        return {
          bare: true as const,
          gap: Math.round((next.getBoundingClientRect().top - h1.getBoundingClientRect().bottom) * 100) / 100,
        };
      });
      if (m === null) continue; // not a .page-title page at all (review/story/recap/404)
      if (!m.bare) {
        skipped.push(path);
        continue;
      }
      bare.push({ path, gap: m.gap });
    }
    return { bare, skipped };
  };

  for (const width of [1440, 390]) {
    const { bare, skipped } = await measure(width);
    console.log(
      `${width}px — bare .page-title 간격 실측 ${bare.length}건 (제외 ${skipped.length}: ${skipped.join(', ') || '없음'}):\n  ` +
        bare.map((b) => `${b.path}=${b.gap}`).join('\n  '),
    );
    // A run that found nothing to compare would pass vacuously — the same
    // guard the baseline test above uses.
    expect(bare.length, '비교된 bare .page-title 지면이 하나도 없음').toBeGreaterThan(4);
    const gaps = bare.map((b) => b.gap);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    expect(
      spread,
      `${width}px — bare 타이틀 지면들의 콘텐츠 간격이 서로 어긋남: ${bare.map((b) => `${b.path}=${b.gap}`).join(', ')}`,
    ).toBeLessThanOrEqual(0.5);
  }
});
