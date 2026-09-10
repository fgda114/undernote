/**
 * Dist-wide invariants on the shared rich sandbox (built by lib/setup-rich.mjs):
 *  - D2-R2 score-exposure matrix (list surfaces show/sort · review = hero dial ·
 *    TWO named browsing surfaces show · every other browsing surface none ·
 *    share cards none — all types)
 *  - board top-5 cut (US-2), monthly recap ordering (US-5)
 *  - OG 5-element completeness + PNG assets (US-15/SS-15, E-111 positive)
 *  - E-202 warning emission (W5 M-1 regression) + placeholder publishing
 *  - listen links: manual override + auto search trio (US-7/SS-13)
 *  - client JS BUDGET on every page (NFR — replaced 'JS = 0', 2026-09-07)
 */
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SANDBOX_ROOT, basePathOf, distPagePaths, readPage, readBuildReport } from '../lib/sandbox.mjs';
import { RICH_SET } from '../lib/rich-content.mjs';

const dir = join(SANDBOX_ROOT, 'rich');
const B = basePathOf(dir);
const SCORES = ['9.1', '8.8', '8.3', '8.0', '7.9', '7.5', '7.2', '6.8'];
const scoreToken = (s: string) => `>${s}<`;

let pages: string[];
test.beforeAll(() => {
  pages = distPagePaths(dir);
});

test('지면 전수 — 12유형 상당(29지면) + 404 생성', () => {
  // 34 → 29 on 2026-09-09 (axis-chip archive redesign): the per-value pages
  // `/archive/{year}/`, `/archive/genre/{bucket}/` (×2 for the rich set's
  // pop/hiphop), `/archive/tag/{tag}/`, and the `/artists/` LIST page
  // were retired — every one of those axes is now a chip on /archive/
  // instead of a page of its own (5 pages removed). The per-artist detail
  // pages under /artists/{slug}/ are UNCHANGED and still exist; only the
  // list page above them is gone, which is why '/artists/' itself is no
  // longer in the must-exist set below.
  expect(pages.length).toBe(29); // 28 pages + 404.html
  for (const must of ['/', '/about/', '/archive/', '/list/2026/', '/list/2026/08/', '/404.html']) {
    expect(pages).toContain(must);
  }
});

/**
 * D2-R2 (2026-09-07). The editor reversed D2's third row for exactly two
 * browsing surfaces: the home's 최신 리뷰 section and /archive/reviews/.
 *
 * This test used to assert "no browsing page contains a score". Reversed, not
 * deleted — and made STRICTER in the process. What used to be enforced by the
 * data (ArticleItem had no score field, so no template could leak one) is now
 * enforced here, in both directions: the two reversed surfaces MUST show
 * figures, and every other browsing surface must still show none. Mixing them
 * up fails the build instead of shipping quietly, which is the whole point of
 * writing the list down.
 */
const SCORE_SURFACES = ['/archive/reviews/'];

test('D2-R2 — 점수를 보이는 탐색 지면은 명시된 목록뿐', () => {
  const shown = readPage(dir, '/archive/reviews/');
  for (const s of SCORES) expect(shown, `/archive/reviews/ missing ${s}`).toContain(scoreToken(s));

  // Everything else that browses stays score-free.
  const silent = pages.filter(
    (p) =>
      (p.startsWith('/archive/') || p.startsWith('/artists/') || p.startsWith('/stories/') || p === '/about/') &&
      !SCORE_SURFACES.includes(p),
  );
  // 14 → 12 on 2026-09-09: the per-value archive pages this floor used to
  // count (`/archive/{year}/`, two `/archive/genre/{bucket}/`,
  // `/archive/tag/{tag}/`) are gone — see the page-count test's own comment.
  // What is left under `/archive/` is just the hub and the two format
  // presets (minus /archive/reviews/, the one SCORE_SURFACES entry) = 2,
  // plus 8 artist pages + 1 story page + /about/ = 12.
  expect(silent.length).toBeGreaterThanOrEqual(12);
  for (const p of silent) {
    const html = readPage(dir, p);
    for (const s of SCORES) expect(html, `${p} leaks ${s}`).not.toContain(scoreToken(s));
  }
});

test('D2-R2 — 리스트 지면 점수 표시·정렬 / 홈 보드 캐러셀(최대 10장·랭크순) / 최신 리뷰 표시·이야기 무점수', () => {
  const home = readPage(dir, '/');
  // D2-R2 reversal on the home, asserted section by section. The explicit
  // index checks matter: indexOf(-1) would make slice() return the last
  // character and the loops below would pass on nothing at all — that is how
  // this assertion used to die quietly when an anchor moved.
  const boardAt = home.indexOf('aria-label="올해의 앨범"');
  const reviewsAt = home.indexOf('aria-label="최신 리뷰"');
  const notesAt = home.indexOf('aria-label="음악 이야기"');
  expect(boardAt, '홈 올해의 앨범 섹션 앵커 부재').toBeGreaterThan(-1);
  expect(reviewsAt, '홈 최신 리뷰 섹션 앵커 부재').toBeGreaterThan(boardAt);
  expect(notesAt, '홈 음악 이야기 섹션 앵커 부재').toBeGreaterThan(reviewsAt);

  // Board is a one-card-at-a-time CAROUSEL now (2026-09-10 rebuild — see
  // index.astro's intro for the round trip through a same-day misreading
  // that briefly cut this to a single un-navigable card). All ten reachable
  // candidates render into the DOM in year-rank order, not just the leader:
  // stepping the carousel with no script (native scroll-snap) or with the
  // arrow buttons has to have somewhere to go. The rich fixture holds
  // exactly SCORES.length (8) reviews, under the ten-card cap, so every
  // score in SCORES appears here — SCORES is already sorted high → low,
  // the same order deriveTop10/deriveHomeSections produce, so checking each
  // token's index only ever increases doubles as a rank-order check.
  const board = home.slice(boardAt, reviewsAt);
  // `<li class="chart-card…` specifically — a bare `class="chart-card` regex
  // would also match the wrapping `<ol class="chart-cards…` (the plural is a
  // substring match away), silently counting the LIST as an extra card.
  expect((board.match(/<li class="chart-card/g) ?? []).length, `홈 보드 카드 수 ≠ ${SCORES.length}`).toBe(SCORES.length);
  let cursor = -1;
  for (const s of SCORES) {
    const at = board.indexOf(scoreToken(s), cursor + 1);
    expect(at, `홈 보드에 점수 ${s} 부재이거나 랭크 순서가 어긋남`).toBeGreaterThan(cursor);
    cursor = at;
  }
  // Two arrow buttons ship because the rich fixture's 8 candidates clear the
  // R-4 floor (more than one, so a "next"/"prev" control points at something
  // real). The carousel always opens on card 0, so `prev` renders `disabled`
  // server-side rather than waiting on the inline module to compute it
  // (index.astro's markup comment) — checked here as a static HTML property,
  // not a runtime one, since this file reads dist output rather than driving
  // a browser.
  expect((board.match(/class="carousel-btn prev"[^>]*\bdisabled\b/g) ?? []).length, '홈 보드 이전 버튼이 초기 disabled 상태가 아님').toBe(1);
  expect((board.match(/class="carousel-btn next"/g) ?? []).length, '홈 보드 다음 버튼 부재').toBe(1);

  // 최신 리뷰 SHOWS figures now (it is one of the two reversed surfaces)…
  const latest = home.slice(reviewsAt, notesAt);
  expect(latest, '홈 최신 리뷰에 점수 부재').toContain('class="card-score"');
  expect(latest.match(/>\d\.\d</g)?.length ?? 0, '홈 최신 리뷰 점수 개수').toBeGreaterThan(0);
  // …and 음악 이야기 below it does not, because a story has no score at all.
  const notes = home.slice(notesAt);
  for (const s of SCORES) expect(notes, `음악 이야기 leaks ${s}`).not.toContain(scoreToken(s));
  expect(notes, '이야기 카드에 점수 플레이트').not.toContain('class="card-score"');

  // Progressive annual list: all 8, descending.
  const list = readPage(dir, '/list/2026/');
  let prev = -1;
  for (const s of SCORES) {
    const at = list.indexOf(scoreToken(s));
    expect(at, `list missing ${s}`).toBeGreaterThan(-1);
    expect(at, `list order broken at ${s}`).toBeGreaterThan(prev);
    prev = at;
  }
});

/**
 * MJ-1 (2026-09-10). a527482 added `ArticleItem.releaseYear` and wired it
 * into ONLY the `row` variant's markup (ArticleCard's archive listing rows);
 * the `card` variant the home's 최신 리뷰 section renders never got the same
 * line. Nothing failed — `releaseYear` is optional on the type and neither
 * template branch references the other — so the build stayed green and the
 * gap only showed up by looking at the two rendered pages side by side.
 *
 * Regression-shaped test: this asserts the field reaches the SHIPPED HTML,
 * on BOTH surfaces, not merely that `ArticleItem` carries it (derive-lists
 * already covers that). Comparing the two surfaces to each other would not
 * have caught the original bug either way — one of them was silently
 * correct — so each is checked against the fixture's own release year
 * independently.
 */
test('MJ-1 — 발매 연도가 row·card 두 변형 모두에 출력된다 (row=/archive/reviews/, card=홈 최신 리뷰)', () => {
  const target = RICH_SET.find((a) => a.slug === 'aurora-line-first-light')!;
  const releaseYear = target.release.slice(0, 4);
  const hrefFrag = `href="${B}/reviews/${target.slug}/"`;
  // A REGEX, NOT A LITERAL SUBSTRING (fixed after this test failed against
  // correct output on first run). Astro writes a scoped-CSS attribute
  // (`data-astro-cid-…`, a hash of the component file) between the class
  // string and the closing `>` of every element it emits — `[^>]*` absorbs
  // that without hardcoding the hash itself, which changes on any edit to
  // ArticleCard.astro and would otherwise silently re-break this exact
  // assertion the next time someone touches that file.
  const needle = new RegExp(`class="release-year tnum"[^>]*>\\s*·\\s*${releaseYear}<`);

  // card — home's 최신 리뷰 section, SCOPED TO THAT SECTION. `target` is the
  // board's own #1 (9.1, the rich set's highest score), so its href appears
  // TWICE on the home page — once as the Charts carousel's `row-link` (which
  // never carries a release year at all; ChartCard is a different component)
  // and once as the 최신 리뷰 section's `card`. An unscoped `indexOf` finds
  // the FIRST occurrence, i.e. the Charts one, and would make this assertion
  // pass or fail for a reason that has nothing to do with MJ-1 — sliced to
  // the section boundary first, same anchors the neighbouring test computes.
  const home = readPage(dir, '/');
  const reviewsAt = home.indexOf('aria-label="최신 리뷰"');
  const notesAt = home.indexOf('aria-label="음악 이야기"');
  expect(reviewsAt, '홈 최신 리뷰 섹션 앵커 부재').toBeGreaterThan(-1);
  expect(notesAt, '홈 음악 이야기 섹션 앵커 부재').toBeGreaterThan(reviewsAt);
  const latestReviewsSection = home.slice(reviewsAt, notesAt);
  const homeHrefAt = latestReviewsSection.indexOf(hrefFrag);
  expect(homeHrefAt, `홈 최신 리뷰 섹션에 ${target.slug} 카드 링크 부재`).toBeGreaterThan(-1);
  // The whole card lives inside one <a>, so the next `</a>` after the href
  // closes it and bounds the search window to THIS card (no nested anchors
  // exist inside ArticleCard's markup).
  const homeCloseAt = latestReviewsSection.indexOf('</a>', homeHrefAt);
  expect(latestReviewsSection.slice(homeHrefAt, homeCloseAt), `홈 card 변형에 발매 연도 부재 (MJ-1)`).toMatch(needle);

  // row — /archive/reviews/, same bounding technique (this page only ever
  // renders the `row` variant, so no section-scoping is needed here).
  const archive = readPage(dir, '/archive/reviews/');
  const rowHrefAt = archive.indexOf(hrefFrag);
  expect(rowHrefAt, `/archive/reviews/에 ${target.slug} 행 링크 부재`).toBeGreaterThan(-1);
  const rowCloseAt = archive.indexOf('</a>', rowHrefAt);
  expect(archive.slice(rowHrefAt, rowCloseAt), `/archive/reviews/ row 변형에 발매 연도 부재`).toMatch(needle);
});

test('D2-R — 평론 히어로에 자기 점수 1회, 본문 이후 중복 없음', () => {
  for (const a of RICH_SET) {
    const html = readPage(dir, `/reviews/${a.slug}/`);
    // Both anchors are asserted BEFORE they are used to slice. indexOf(-1)
    // does not throw: `slice(-1, n)` yields '' and `slice(-1)` yields '>',
    // so a renamed class turns the "no duplicate downstream" check into an
    // unconditional pass and the hero check into a misleading "score
    // missing" failure. Locating the anchor is its own assertion now.
    const heroAt = html.indexOf('class="hero');
    const bodyAt = html.indexOf('review-body');
    expect(heroAt, `${a.slug} hero 앵커(class="hero) 부재`).toBeGreaterThan(-1);
    expect(bodyAt, `${a.slug} 본문 앵커(review-body) 부재`).toBeGreaterThan(heroAt);

    const hero = html.slice(heroAt, bodyAt);
    // The dial carries this album's score — and only this album's.
    expect(hero, `${a.slug} hero missing ${a.score}`).toContain(scoreToken(a.score));
    for (const s of SCORES) {
      if (s === a.score) continue;
      expect(hero, `${a.slug} hero leaks ${s}`).not.toContain(scoreToken(s));
    }
    // The old verdict block is gone: no second copy of the figure downstream.
    const tail = html.slice(bodyAt);
    expect(tail, `${a.slug} score duplicated after body`).not.toContain(scoreToken(a.score));
  }
});

test('US-5 — 월말정산 8월: 3편 점수순 + 전 항목 평론 링크, 진행 월(9월) 페이지 부재', () => {
  const aug = readPage(dir, '/list/2026/08/');
  const i91 = aug.indexOf(scoreToken('9.1'));
  const i88 = aug.indexOf(scoreToken('8.8'));
  const i80 = aug.indexOf(scoreToken('8.0'));
  expect(i91).toBeGreaterThan(-1);
  expect(i88).toBeGreaterThan(i91);
  expect(i80).toBeGreaterThan(i88);
  const anchors = new Set(aug.match(new RegExp(`href="${B}/reviews/[^"]+"`, 'g')) ?? []);
  expect(anchors.size).toBe(3);
  expect(pages).not.toContain('/list/2026/09/'); // September is in progress (review dated 09-02 exists)
});

test('US-15/SS-15 — 전 지면 OG 5요소 + twitter:card, 메타에 점수 0 (E-115)', () => {
  for (const p of pages) {
    const html = readPage(dir, p);
    for (const needle of ['property="og:title"', 'property="og:description"', 'property="og:image"', 'property="og:url"', 'property="og:type"', 'name="twitter:card"']) {
      expect(html, `${p} missing ${needle}`).toContain(needle);
    }
    const metas = (html.match(/<meta[^>]*>/g) ?? []).join('\n');
    for (const s of SCORES) expect(metas, `${p} meta leaks ${s}`).not.toContain(s);
  }
});

/**
 * OG cache busting (2026-09-07). Share platforms key their image cache on
 * the URL, so a card whose DESIGN changes keeps serving the version they
 * scraped months ago — which is exactly what happened to this site's reskin.
 * The og:image URL now carries a version derived from the OG library's
 * source (src/lib/og/version.ts).
 *
 * Two properties, and the second is the one a careless "fix" would break:
 * every page must carry the key, and every page must carry the SAME key. A
 * per-page or per-build value would bust the cache on every deploy, which
 * turns a cache into a bandwidth bill and makes the previews flicker between
 * scrapes. Determinism itself is covered by the double-build hash gate — a
 * clock or a random value would fail that instead.
 */
test('OG 캐시 버스팅 — 전 지면 og:image에 동일한 버전 키', () => {
  const versions = new Set<string>();
  for (const p of pages) {
    const html = readPage(dir, p);
    const m = html.match(/property="og:image" content="([^"]+)"/);
    expect(m, `${p} og:image 부재`).not.toBeNull();
    const url = m![1];
    expect(url, `${p} og:image에 버전 키 없음`).toMatch(/\.png\?v=[0-9a-f]{8}$/);
    versions.add(url.slice(url.indexOf('?v=')));
  }
  expect(versions.size, `버전 키가 지면마다 다름: ${[...versions].join(' ')}`).toBe(1);
});

test('OG 카드 산출물 — 전 평론 PNG + 리스트 카드 + 기본형', () => {
  for (const a of [...RICH_SET.map((r) => r.slug), 'fixture-artist-fixture-album']) {
    expect(existsSync(join(dir, 'dist', 'og', 'reviews', `${a}.png`)), a).toBe(true);
  }
  expect(existsSync(join(dir, 'dist', 'og', 'default.png'))).toBe(true);
});

test('SS-14 — 커버 미확보: E-202 경고 방출(M-1 회귀) + 발행은 성공', () => {
  expect(readBuildReport(dir)).toContain('E-202');
  expect(existsSync(join(dir, 'dist', 'reviews', 'ember-field-ash', 'index.html'))).toBe(true);
});

test('US-7/SS-13 — 수기 링크 우선 + 자동 검색형 3종', () => {
  const manual = readPage(dir, '/reviews/fixture-artist-fixture-album/');
  expect(manual).toContain('https://open.spotify.com/album/fixture');

  const auto = readPage(dir, '/reviews/paper-crane-fold/');
  expect(auto).toContain('music.youtube.com/search');
  expect(auto).toContain('open.spotify.com/search');
  expect(auto).toContain('music.apple.com/kr/search');
});

test('US-9/SS-12 — 아티스트 집계: 공유 아티스트 2편, 복수 아티스트 양쪽 집계', () => {
  const shared = readPage(dir, '/artists/shared-artist/');
  expect(shared).toContain(`href="${B}/reviews/aurora-line-first-light/"`);
  expect(shared).toContain(`href="${B}/reviews/aurora-line-second-wind/"`);
  for (const artist of ['motif-one', 'motif-two']) {
    expect(readPage(dir, `/artists/${artist}/`)).toContain(`href="${B}/reviews/twin-motif-duet/"`);
  }
});

/**
 * 2026-09-09 — the review rail's spec block: row set, row ORDER, multi-genre
 * display, and the Release row's link to a pre-filtered archive query. See
 * SpecMeta.astro's own intro for the ordering rationale (identity → category
 * → dates) and why Title duplicates the hero on purpose.
 */
// Astro stamps a `data-astro-cid-…` attribute onto EVERY element inside a
// component that has a scoped <style> block — including elements that carry
// no attributes at all in the source (`<dt>Title</dt>` ships as `<dt
// data-astro-cid-xxxxxxxx>Title</dt>`). A literal `<dt>Title</dt>` substring
// check would look reasonable and match nothing, which is exactly the
// "assertion that is silently vacuous" trap the lead's brief warned about —
// so every bare-tag lookup below goes through this regex helper instead of
// indexOf on a literal string.
function findTag(html: string, tag: string, text: string): number {
  const m = html.match(new RegExp(`<${tag}(?:\\s[^>]*)?>${text}</${tag}>`));
  return m ? m.index! : -1;
}

test('SpecMeta — Title·Artist·Genre·Tags·Release·Reviewed 순서 + Release/Genre/Tags 링크', () => {
  const html = readPage(dir, '/reviews/fixture-artist-fixture-album/');
  const at = (tag: string, text: string) => {
    const i = findTag(html, tag, text);
    expect(i, `spec block에 <${tag}>${text}</${tag}> 없음`).toBeGreaterThan(-1);
    return i;
  };
  // fixture-artist-fixture-album: bucket pop, tag city-pop, no label, no
  // subtitle, release 2026-05-01.
  const order = [
    at('dt', 'Title'),
    at('dt', 'Artist'),
    at('dt', 'Genre'),
    at('dt', 'Tags'),
    at('dt', 'Release'),
    at('dt', 'Reviewed'),
  ];
  for (let i = 1; i < order.length; i++) expect(order[i], 'spec block 행 순서 어긋남').toBeGreaterThan(order[i - 1]);
  expect(findTag(html, 'dt', 'Label'), 'Label 필드가 없는 앨범인데 Label 행이 있음').toBe(-1);

  // Title row: title alone, no parenthetical — this album has no `subtitle`.
  expect(findTag(html, 'dd', '픽스처 앨범')).toBeGreaterThan(-1);

  // Release links to /archive/?q=<release year>, not the retired per-year page.
  expect(html).toContain(`href="${B}/archive/?q=2026"`);
  // Genre links to /archive/?q=<bucket label>.
  expect(html).toContain(`href="${B}/archive/?q=${encodeURIComponent('Pop')}"`);
  // Tags links to /archive/?q=<tag label> (시티팝, the registered label for city-pop).
  expect(html).toContain(`href="${B}/archive/?q=${encodeURIComponent('시티팝')}"`);
});

test('SpecMeta — 복수 장르 앨범은 Genre 행에 버킷 전부가 뜬다', () => {
  // twin-motif-duet is single-bucket in the rich set (no multi-genre fixture
  // there); this asserts the SHAPE holds for a single bucket too — exactly
  // one Genre value, linked — which is the n=1 case of the same code path
  // multi-genre uses (bucketLabels.map(...), array of length 1 here).
  // MULTI-GENRE ITSELF is unit-tested directly against buildReviewPageData
  // (tests/unit/derive.test.ts) and deriveHubIndex (derive-archive.test.ts),
  // since the rich E2E fixture set has no album spanning two buckets.
  const html = readPage(dir, '/reviews/twin-motif-duet/');
  const genreStart = findTag(html, 'dt', 'Genre');
  const releaseStart = findTag(html, 'dt', 'Release');
  expect(genreStart).toBeGreaterThan(-1);
  expect(releaseStart).toBeGreaterThan(genreStart);
  const genreRow = html.slice(genreStart, releaseStart);
  expect((genreRow.match(/class="meta-link"/g) ?? []).length).toBe(1);
  expect(genreRow).toContain('Pop');
});

/**
 * 2026-09-09 — prev/next chain (AdjacentNav), both formats. Order is
 * publication date ascending (lib/derive/lists.ts#deriveAdjacentMap) — see
 * that function's own comment for the full definition. The rich set's
 * review dates, ascending: ember-field-ash(04-02) < paper-crane-fold(05-15)
 * < quiet-harbor-tide(06-05) < twin-motif-duet(07-10) < low-orbit-signal
 * (08-01) < aurora-line-second-wind(08-14) < aurora-line-first-light(08-21)
 * < fixture-artist-fixture-album(09-02, the base fixture).
 */
test('이전·다음 글 — 평론 체인이 발행일 오름차순, 첫/마지막은 한쪽만', () => {
  const first = readPage(dir, '/reviews/ember-field-ash/');
  expect(first, '체인의 첫 항목인데 이전 글 링크가 있음').not.toContain('class="adjacent-link prev"');
  expect(first).toContain('class="adjacent-link next"');
  expect(first).toContain(`href="${B}/reviews/paper-crane-fold/"`);

  const middle = readPage(dir, '/reviews/quiet-harbor-tide/');
  expect(middle).toContain(`href="${B}/reviews/paper-crane-fold/"`); // prev
  expect(middle).toContain(`href="${B}/reviews/twin-motif-duet/"`); // next

  const last = readPage(dir, '/reviews/fixture-artist-fixture-album/');
  expect(last).toContain('class="adjacent-link prev"');
  expect(last, '체인의 마지막 항목인데 다음 글 링크가 있음').not.toContain('class="adjacent-link next"');
  expect(last).toContain(`href="${B}/reviews/aurora-line-first-light/"`);
});

test('이전·다음 글 — 이야기가 하나뿐이면 nav 자체가 렌더링되지 않는다 (R-4)', () => {
  const story = readPage(dir, '/stories/fixture-story/');
  expect(story).not.toContain('class="adjacent"');
});

/**
 * Archive hub — axis-chip redesign (2026-09-09): four axes as chips (not
 * links), no "All" section heading, and the page still titles itself
 * "Archive" (masthead label reverted the same day — Masthead.astro's intro).
 */
test('아카이브 허브 — Year·Genre·Artist·Tag 칩 개수 + ALL 제목 제거 + 지면 제목 Archive', () => {
  const html = readPage(dir, '/archive/');
  expect(html).toMatch(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>Archive<\/h1>/);
  expect(html).not.toContain('>All<');

  const chipValues = (axis: string) => {
    const start = findTag(html, 'h2', axis);
    expect(start, `${axis} 축 섹션 없음`).toBeGreaterThan(-1);
    const end = html.indexOf('</section>', start);
    return [...html.slice(start, end).matchAll(/data-axis-value="([^"]*)"/g)].map((m) => m[1]);
  };
  // Rich set: publication year 2026 only.
  expect(chipValues('Year')).toEqual(['2026']);
  // Buckets actually used: hiphop, pop (rock is configured but unused —
  // by_bucket only has keys for buckets that appear on content, R-4).
  // config/genres.yaml's 2026 block labels bucket "hiphop" plain "Hip-Hop"
  // (the 3→8 bucket split on 2026-09-09 retired the old combined "Hip-Hop /
  // R&B" id in favour of separate "hiphop"/"rnb" ids — see that config's own
  // history), so there is no `&` left in this particular value to escape;
  // the general HTML-escaping behaviour this comment used to also document
  // (Astro's attribute encoding, & → &amp;) is unit-tested elsewhere and not
  // this test's job to re-prove with a value that no longer exercises it.
  expect(chipValues('Genre').sort()).toEqual(['Hip-Hop', 'Pop']);
  // 8 artists — 7 from RICH_SET (shared-artist credited twice, once each
  // way) + the base fixture's own artist.
  expect(chipValues('Artist')).toHaveLength(8);
  expect(chipValues('Artist')).toContain('공유 아티스트');
  // One registered tag actually used.
  expect(chipValues('Tag')).toEqual(['시티팝']);

  // Every chip is a real <button>, not a link (in-page filter, not
  // navigation — WAI-ARIA), and starts unpressed.
  expect(html).not.toMatch(/<a[^>]*data-axis-value/);
  expect((html.match(/data-axis-value="[^"]*"[^>]*aria-pressed="false"/g) ?? []).length).toBeGreaterThan(0);

  // The magnifying-glass is a <label>, not a <button> — zero-JS focus
  // shortcut (see the component intro) — and the live count starts hidden.
  expect(html).toMatch(/<label for="archive-q" class="search-icon-btn"/);
  expect(html).toMatch(/<p id="archive-n"[^>]*hidden[^>]*>/);
});

/**
 * NFR, revised 2026-09-07. This used to assert the string `<script` never
 * appeared in dist. The site now ships one inline module (the cover cursor
 * tracking), so the assertion was REVERSED INTO A BUDGET rather than
 * deleted: the property worth protecting was never "no script tag", it was
 * "this site does not grow a client runtime", and a ceiling states that
 * directly. Each clause below is the door it keeps shut:
 *
 *   count === 1   · a second feature cannot quietly add a second block
 *   no src=       · nothing is fetched — no bundler output, no CDN, no
 *                   framework runtime. This is the clause that makes
 *                   "hand-written and reviewable" enforceable rather than
 *                   aspirational.
 *   byte ceiling  · a hand-written enhancement fits in a couple of KB; a
 *                   library does not. Raising this number is a decision
 *                   someone has to make on purpose, in a diff, with a reason.
 *
 * Turning goatcounter on adds a second (external) tag and will fail this
 * test until it is taught about that one — deliberately: the budget should
 * notice a change of that size.
 *
 * CEILING HISTORY. 1024 → 2048 when the chart pager arrived; 2048 → 2304 on
 * 2026-09-07, when the pointer tracking grew from one reader to THREE (the
 * cover zoom, plus a hovered card title's colour ramp and a hovered section
 * heading's spotlight) and the block measured 2076B. It was raised rather
 * than shaved: a ceiling you sit two bytes under is not a ceiling, it is a
 * trap for the next edit, and shortening working comments to hit a byte
 * count is the wrong reason to edit a comment.
 *
 * 2304 → 2048, LATER THE SAME DAY, when the card-title spotlight was
 * withdrawn: the tracked-box selector lost `.title-spot` and the comment
 * naming its second reader went with it, and the block measured 1995B. THE
 * CEILING CAME DOWN BECAUSE A BUDGET NOBODY IS NEAR IS NOT A BUDGET — it
 * stops being a decision anyone has to make and becomes a number in a file.
 * 2048 is where this block sat before the tracking grew, and the 53B of
 * headroom is the same standard as before, stated honestly: the next
 * hand-written line moves this number, on purpose, in a diff.
 *
 * The number has now moved three times inside two days, which is worth
 * recording because it is what the mechanism is FOR: the ramp was
 * implemented, withdrawn on a re-scoping, reinstated when the re-scoping
 * turned out to be an addition, and finally removed outright. Each time,
 * this line is what said so out loud instead of letting the payload drift.
 *
 * THE CEILING DID NOT MOVE A FOURTH TIME on 2026-09-08, but the payload
 * shrank again: 1995B → 1970B, when the module's text moved out of
 * Base.astro into src/scripts/enhance.js so that the CSP hash and the shipped
 * bytes come from one string (lib/csp.ts). Twenty-five bytes of prose moved
 * to the emit point, where comments cost nothing; nothing was minified and no
 * behaviour changed. 2048 stayed: a move that shrinks the payload by 1% is
 * not a decision about the budget.
 *
 * 2048 → 2560 on 2026-09-09 (lead decision), when the archive hub grew a
 * search filter — the module's first FUNCTIONAL reader, not a third
 * decoration. Before this feature the block sat at 1970B against the 2048B
 * ceiling (78B headroom, per the immediately preceding paragraph); the
 * filter alone would not have fit in that headroom, so the ceiling moved
 * rather than the payload being shaved to squeeze under it — which is
 * exactly the "decision someone has to make on purpose, in a diff, with a
 * reason" the comment above this constant already calls out. The block
 * measured 2544B against 2560B at that point.
 *
 * 2560 → 3072, LATER THE SAME DAY (lead-approved, fifth move), when the
 * archive's four axes — Year, Genre, Artist, Tag — became CHIPS that drive
 * the same filter instead of links to their own pages (the axis-chip
 * redesign: archive/index.astro's own intro has the full reasoning). This
 * is a widening of the search filter's existing functional reader, not a
 * fourth one: one `run()` still owns the whole feature, now triggered by a
 * chip click or a `?q=` landing param in addition to typing. What it costs:
 * a chip click-handler loop, an `aria-pressed` sync pass inside `run()`
 * itself, and the `URLSearchParams` read on load — none of it decorative.
 * The block measured 3020B against 3072B at that point.
 *
 * 3072 → 2176 on 2026-09-10 (sixth move, and the first DOWN since the
 * 2304 → 2048 correction), when the home Charts pager was deleted outright
 * rather than left unrendered — AN INTERMEDIATE PASS misread the
 * decision-maker's request as "one card total" rather than "restore the
 * single-card SHAPE" (index.astro's intro has the full account of the
 * misreading and its correction), and a control that scrolls a row of cards
 * that no longer exists is not a feature waiting to come back, it is dead
 * code — which is what this move was against, at the time it was made.
 * Removing the scroll handler, its two listeners and the sync/click closures
 * took the block from 3020B to 2123B — an 897B drop, by far the largest
 * single move this budget had made up to that point. The ceiling followed it
 * down to 2176 (53B headroom, matching the 2048 ceiling's own standard).
 *
 * 2176 → 2836, HOURS LATER THE SAME DAY (seventh move — a reversal, not a
 * new feature). The misreading above was caught and corrected: the
 * decision-maker's request asked for the carousel BACK, with arrow buttons
 * flanking a single visible card, not for the arrows to stay gone
 * (index.astro's intro, "CHARTS IS A ONE-CARD-AT-A-TIME CAROUSEL"). The
 * rebuilt version is not a byte-for-byte revert of what was deleted — it
 * steps exactly one card (`box.clientWidth * 1`, matching the new
 * `flex: 0 0 100%` single-card row) rather than the old pager's `* 0.8`
 * screenful across a multi-card grid, and it marks its ends with a real
 * `<button>`'s native `disabled` rather than an anchor's `aria-disabled` —
 * so it is SMALLER than what was removed, not merely restored: the block
 * measured 2783B against the new 2836B ceiling (53B headroom again),
 * against 3020B for the original pager. NET ACROSS BOTH MOVES: 3072 → 2836,
 * −236B, because the rebuilt control does the same job in less code, not
 * because it does less of the job. Two decorative readers ship again — the
 * cover-zoom pointer tracking and the Charts carousel arrows — alongside the
 * one functional reader, the archive search + axis chips. Documented in full
 * in Base.astro (search under "The site's ONE script"), not repeated here:
 * this file only ever needs to carry the NUMBER and why it moved.
 */
const INLINE_JS_BUDGET_BYTES = 2836;

test('NFR — 클라이언트 JS 예산: 지면당 인라인 1개 · 외부 JS 0 · 상한 이하', () => {
  for (const p of pages) {
    const html = readPage(dir, p);
    const tags = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? [];
    expect(tags.length, `${p} script 태그 개수`).toBe(1);
    for (const tag of tags) {
      expect(tag.slice(0, tag.indexOf('>')), `${p} 외부 스크립트`).not.toContain('src=');
    }
    const body = tags[0].replace(/^<script\b[^>]*>/, '').replace(/<\/script>$/, '');
    expect(Buffer.byteLength(body, 'utf8'), `${p} 인라인 JS 바이트`).toBeLessThanOrEqual(INLINE_JS_BUDGET_BYTES);
  }
});
