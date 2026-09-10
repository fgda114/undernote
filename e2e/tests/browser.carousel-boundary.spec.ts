/**
 * TWO GAPS THE RICH FIXTURE CANNOT SHOW (2026-09-10, Matthias/QA — PR #16
 * round): the rich sandbox always holds 8 reviews, which is ≥ 4 at every
 * breakpoint the browsing rows use, so `latestReviews.length > 2` (the
 * threshold index.astro's own comment gates the arrows on) has never been
 * exercised anywhere NEAR its boundary, and no existing spec drives real
 * keyboard focus through the carousels at all. Both need their own fixture
 * or their own walk; neither is a one-line addition to an existing file.
 *
 * PART 1 — THE 3/4-CARD DEAD BUTTON (F-1, 2026-09-10) — TWO FIXES, ONE WRONG.
 * `> 2` is calibrated to the NARROWEST layout (index.astro: "two is a full
 * page at the narrowest layout"), which is a correct reason to pick 2 as the
 * cutoff and was an unexamined one at the counts just above it: a section of
 * 3 is a full page from 840px up, and a section of 4 is a full page from
 * 1160px up, so at those (count, width) pairs BOTH arrows point at nothing
 * (R-4) — a real defect Matthias found with a purpose-built sandbox this
 * file (re)builds below.
 *
 * THE FIRST FIX WAS WRONG, AND THE WRONGNESS IS THE REASON THIS SUITE NOW
 * SWEEPS THE WHOLE WIDTH LADDER INSTEAD OF TWO FIXED VIEWPORTS. It gated
 * `next`'s SSR `disabled` on the count ALONE ("disable whenever the section
 * holds ≤4 cards") — a rule with no viewport in it, applied to a defect that
 * IS about viewport. It fixed the two cells the bug report named (3@≥840,
 * 4@≥1160) and broke the two it didn't check: a 3-card section at 641-839px
 * and a 4-card one at 840-1159px both genuinely overflow there (page size is
 * still 2 and 3 respectively), and the count-only rule shipped `next`
 * disabled anyway — a JS-off reader on those exact widths could never reach
 * the last card at all. Caught before merge only because this file was
 * rewritten to check EVERY (count, width) cell against the ladder rather
 * than the two the original report happened to mention — the shape of the
 * mistake (a rule proven at the cells a bug report names, silently wrong at
 * the cells it doesn't) is exactly what the earlier, narrower version of
 * this file (desktop 1440 + mobile 390 only) would not have caught either.
 *
 * THE ACTUAL FIX IS GEOMETRIC, NOT A `disabled` GATE (index.astro). Each
 * carousel carries `data-count`, and two `@media` rules — placed beside the
 * card-width rules that already declare "3 cards fill a page from 840px" and
 * "4 cards fill a page from 1160px", not restated as a second literal —
 * `display: none` the WHOLE button pair at exactly those widths. Pure CSS:
 * correct on the very first paint, with or without a script, and it hides
 * `prev` along with `next` rather than leaving one dimmed and one gone (two
 * different answers to "can this row move?" on one row).
 *
 * THE INVARIANT THIS FILE NOW CHECKS, STATED SO IT CANNOT DRIFT AGAIN:
 *
 *   the arrow pair is visible  ⇔  the rail is actually scrollable
 *
 * at every (card count, viewport width) cell the ladder produces, in BOTH
 * script states. `scrollWidth > clientWidth` is measured directly off the
 * rendered rail rather than re-deriving "should this be scrollable" from the
 * page-size table a second time — a second copy of the ladder in the test
 * file is exactly how a future breakpoint edit could go unnoticed on one
 * side only.
 *
 * PART 2 — KEYBOARD REACHES AN OFFSCREEN CARD, AND THE RAIL FOLLOWS.
 * `.cards`/`.chart-cards` are native `overflow-x` scroll containers, so the
 * HTML "scroll an element into view" step that runs whenever a descendant
 * receives focus is what a JS-off reader has to lean on to reach — and see —
 * card 5 and beyond on the desktop rail with the keyboard alone (no visible
 * scrollbar interaction, no pointer). Nothing in this codebase implements
 * that; it is a browser default this suite has never pinned. If a future
 * change wrapped the rail in something that suppresses native scroll
 * anchoring (e.g. `overflow: clip` in a strange place, or a `tabindex`
 * container intercepting focus), this is the test that would say so.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { SANDBOX_ROOT, basePathOf, build, makeSandbox } from '../lib/sandbox.mjs';
import { writeBaseContent } from '../lib/rich-content.mjs';

const RICH_B = basePathOf(join(SANDBOX_ROOT, 'rich'));
const SEC = 'section[aria-label="최신 리뷰"]';

// The shared Playwright webServer (playwright.config.ts, port 4180) only ever
// serves the 'rich' sandbox — a bare `page.goto('/undernote/')` against the
// configured baseURL would silently load RICH's 8-review home instead of this
// file's 3/4-review boundary fixture, passing for the wrong reason. Each
// boundary sandbox gets its own static-server.mjs instance on its own port
// instead (lib/static-server.mjs now takes the sandbox name as a 3rd arg —
// see that file's own comment for why).
let nextPort = 4190;
async function serve(sandboxName: string): Promise<{ url: string; stop: () => void }> {
  const port = nextPort++;
  const child: ChildProcess = spawn(process.execPath, [join(SANDBOX_ROOT, '..', 'lib', 'static-server.mjs'), String(port), sandboxName], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}${basePathOf(join(SANDBOX_ROOT, sandboxName))}`;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${url}/`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, stop: () => child.kill() };
}

// ── Part 1 fixture: exactly N reviews, one bucket, all in active_year. ────
// Built from writeBaseContent's single fixture review (1) plus N-1 more,
// deliberately NOT reusing writeRichContent's 7-album RICH_SET — this test's
// whole point is a count the rich fixture never produces.
async function writeBoundaryContent(dir: string, extraCount: number) {
  await writeBaseContent(dir); // 1 review (fixture-artist-fixture-album) + 1 story.
  const artistsDir = join(dir, 'content/artists');
  for (let i = 0; i < extraCount; i++) {
    const slug = `boundary-artist-${i}`;
    writeFileSync(join(artistsDir, `${slug}.md`), `---\nname: 경계 아티스트 ${i}\n---\n`, 'utf8');
    writeFileSync(
      join(dir, 'content/albums', `boundary-album-${i}.yaml`),
      `title: 경계 앨범 ${i}\nartists: [${slug}]\nrelease_date: "2026-0${(i % 8) + 1}-10"\nbuckets: [pop]\n`,
      'utf8',
    );
    writeFileSync(
      join(dir, 'content/reviews', `boundary-album-${i}.md`),
      `---\nalbum: boundary-album-${i}\nscore: "7.${i}"\ndate: 2026-08-2${i}\neditorial_check: true\n---\n\n경계 조건을 보는 본문. 숫자는 없다.\n`,
      'utf8',
    );
  }
}

// The width ladder index.astro's own CSS declares (comment above
// `.cards > :global(.article-card)`), read here as PLAIN WIDTHS to probe —
// not re-derived as a page-size table, so this file cannot quietly drift
// into agreeing with a stale copy of the same ladder. One representative
// width per rung: the exact boundary pixel is already covered by
// `browser.hierarchy.spec.ts`'s own width sweep; this file's job is the
// (count × rung) cross product, not the boundary pixel itself.
const WIDTHS = [
  { width: 390, rung: '≤640 (2-up)' },
  { width: 700, rung: '641–839 (2-up)' },
  { width: 900, rung: '840–1159 (3-up)' },
  { width: 1300, rung: '≥1160 (4-up)' },
];

for (const totalReviews of [3, 4]) {
  test.describe(`${totalReviews}건 경계`, () => {
    const sandboxName = `boundary-${totalReviews}`;
    let siteUrl: string;
    let stopServer: () => void;

    test.beforeAll(async () => {
      const dir = makeSandbox(sandboxName);
      await writeBoundaryContent(dir, totalReviews - 1);
      const result = build(dir);
      if (result.status !== 0) throw new Error(`빌드 실패 (${totalReviews}건):\n${result.out.slice(-3000)}`);
      const server = await serve(sandboxName);
      siteUrl = server.url;
      stopServer = server.stop;
    });

    test.afterAll(() => stopServer?.());

    for (const { width, rung } of WIDTHS) {
      for (const js of [true, false]) {
        test(`${rung} · JS ${js ? 'on' : 'off'} — 화살표 쌍 가시성이 실제 스크롤 가능 여부와 일치 (F-1)`, async ({ browser }) => {
          const context = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: 900 } });
          const page = await context.newPage();
          await page.goto(`${siteUrl}/`);

          const rail = page.locator(`${SEC} .cards`);
          const cards = page.locator(`${SEC} .article-card`);
          await expect(cards).toHaveCount(totalReviews);

          // THE INDEPENDENT MEASUREMENT: what the rail itself can do, off the
          // rendered geometry — not re-derived from the width-to-page-size
          // table (see this file's own intro for why a second copy of that
          // table is exactly the risk here).
          const geo = await rail.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
          const scrollable = geo.scrollWidth > geo.clientWidth + 1;

          // count > 2 is satisfied by both 3 and 4, so the button PAIR is
          // always IN THE DOM here — `.toBeVisible()` is what actually tells
          // the two states apart, since the `display: none` fix (index.astro)
          // removes them from the box tree without removing the elements.
          const next = page.locator(`${SEC} .carousel-btn.next`);
          const prev = page.locator(`${SEC} .carousel-btn.prev`);
          const pairVisible = (await next.isVisible()) && (await prev.isVisible());

          expect(
            pairVisible,
            `${totalReviews}건 · ${rung} · JS ${js ? 'on' : 'off'}: 화살표 가시성(${pairVisible}) ≠ 레일 스크롤 가능(${scrollable}) — scrollWidth=${geo.scrollWidth} clientWidth=${geo.clientWidth}`,
          ).toBe(scrollable);

          // Where the pair IS visible, prove the row is reachable WITHOUT a
          // script too (native overflow-x + scroll-snap, unconditional on
          // `js`) — the buttons are a convenience, never the only way to
          // move a rail that genuinely has more than one page.
          if (scrollable) {
            await page.evaluate((sec: string) => {
              const box = document.querySelector(`${sec} .cards`) as HTMLElement;
              box.scrollLeft = box.clientWidth;
            }, SEC);
            const after = await page.evaluate((sec: string) => (document.querySelector(`${sec} .cards`) as HTMLElement).scrollLeft, SEC);
            expect(after, '레일이 실제로 스크롤 가능한데 프로그램적 스크롤이 움직이지 않음').toBeGreaterThan(0);
          }

          await context.close();
        });
      }
    }
  });
}

// ── Part 2: keyboard reaches an offscreen card and the rail follows ───────
test.describe('키보드 — 오프스크린 카드로 포커스 이동 시 레일이 따라 스크롤된다', () => {
  test('데스크톱 4-up — 5번째 카드에 포커스하면 레일이 스크롤되어 보인다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${RICH_B}/`);

    const rail = page.locator(`${SEC} .cards`);
    const before = await rail.evaluate((el) => el.scrollLeft);
    expect(before, '시작 스크롤 위치가 0이 아님 — 측정 전제가 깨짐').toBe(0);

    // Card 5 sits on page 2 of a 4-up rail (8 cards total) — wholly offscreen
    // at rest. `.focus()` triggers the SAME native "scroll into view" step a
    // real Tab keypress would (HTML focusing steps §6.6.4), and is
    // deterministic where a 100+-keystroke Tab walk is a timing race under
    // parallel load (the reason browser.a11y.spec.ts's own Tab-walk test
    // checks reachable primitives rather than a specific offscreen target).
    const fifthCard = page.locator(`${SEC} .article-card a.card-link`).nth(4);
    await fifthCard.focus();
    await expect.poll(() => rail.evaluate((el) => el.scrollLeft), { timeout: 4000 }).toBeGreaterThan(0);

    const visible = await page.evaluate((sec: string) => {
      const box = document.querySelector(`${sec} .cards`) as HTMLElement;
      const cards = [...box.querySelectorAll('.article-card')];
      const target = cards[4] as HTMLElement;
      const r = target.getBoundingClientRect();
      const railBox = box.getBoundingClientRect();
      return r.left >= railBox.left - 1 && r.right <= railBox.right + 1;
    }, SEC);
    expect(visible, '포커스된 5번째 카드가 레일 스크롤 후에도 화면 밖').toBe(true);
  });

  test('탭 순서 — 비활성 prev는 건너뛰고, 카드 링크가 문서 순서대로 이어진다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${RICH_B}/`);

    // Start from the section's own prev button (disabled at rest, so a real
    // Tab press from here must land on the FIRST card link, not on prev
    // itself) — anchoring the walk on a known element rather than counting
    // keystrokes from <body> keeps this independent of everything ABOVE the
    // section (masthead item count, etc.), which browser.a11y.spec.ts's own
    // whole-page Tab walk already covers.
    const firstCard = page.locator(`${SEC} .article-card a.card-link`).first();
    await firstCard.focus();
    const firstTag = await page.evaluate(() => document.activeElement?.className);
    expect(firstTag).toContain('card-link');

    await page.keyboard.press('Tab');
    const second = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      cls: document.activeElement?.className,
    }));
    // The next stop after card 1 is card 2's own link — not `next` (still
    // several cards away in document order) and never `prev` (disabled, so
    // it is pulled out of the tab order entirely by the native button
    // semantics index.astro's own markup comment relies on).
    expect(second.tag, `Tab 이후 도달한 태그: ${second.tag} (${second.cls})`).toBe('A');
    expect(second.cls).toContain('card-link');
  });
});
