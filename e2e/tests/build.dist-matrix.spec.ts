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

test('지면 전수 — 13유형 상당(34지면) + 404 생성', () => {
  // 33 → 34 on 2026-09-07: /artists/ was promoted from an axis on /archive/
  // to a page of its own with a masthead item. Nothing else was added; the
  // per-artist pages under /artists/{slug}/ already existed.
  expect(pages.length).toBe(34); // 33 pages + 404.html
  for (const must of ['/', '/about/', '/archive/', '/artists/', '/list/2026/', '/list/2026/08/', '/404.html']) {
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
  expect(silent.length).toBeGreaterThanOrEqual(14);
  for (const p of silent) {
    const html = readPage(dir, p);
    for (const s of SCORES) expect(html, `${p} leaks ${s}`).not.toContain(scoreToken(s));
  }
});

test('D2-R2 — 리스트 지면 점수 표시·정렬 / 홈 보드 top5 컷 / 최신 리뷰 표시·이야기 무점수', () => {
  const home = readPage(dir, '/');
  // Board shows top-5 scores…
  for (const s of ['9.1', '8.8', '8.3', '7.9', '7.5', '8.0']) expect(home).toContain(scoreToken(s));
  // …but never the two below the cut (US-2 AC — top 5 only).
  expect(home).not.toContain(scoreToken('7.2'));
  expect(home).not.toContain(scoreToken('6.8'));
  // D2-R2 reversal on the home, asserted section by section. The explicit
  // index checks matter: indexOf(-1) would make slice() return the last
  // character and the loops below would pass on nothing at all — that is how
  // this assertion used to die quietly when an anchor moved.
  const reviewsAt = home.indexOf('aria-label="최신 리뷰"');
  const notesAt = home.indexOf('aria-label="음악 이야기"');
  expect(reviewsAt, '홈 최신 리뷰 섹션 앵커 부재').toBeGreaterThan(-1);
  expect(notesAt, '홈 음악 이야기 섹션 앵커 부재').toBeGreaterThan(reviewsAt);

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
 *   byte ceiling  · a hand-written enhancement fits in 1KB; a library does
 *                   not. Raising this number is a decision someone has to
 *                   make on purpose, in a diff, with a reason.
 *
 * Turning goatcounter on adds a second (external) tag and will fail this
 * test until it is taught about that one — deliberately: the budget should
 * notice a change of that size.
 */
const INLINE_JS_BUDGET_BYTES = 2048;

test('NFR — 클라이언트 JS 예산: 지면당 인라인 1개 · 외부 JS 0 · 2KB 이하', () => {
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
