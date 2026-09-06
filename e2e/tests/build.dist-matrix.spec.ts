/**
 * Dist-wide invariants on the shared rich sandbox (built by lib/setup-rich.mjs):
 *  - D2-R score-exposure matrix (list surfaces show/sort · review = hero dial ·
 *    browsing surfaces none · share cards none — all types)
 *  - board top-5 cut (US-2), monthly recap ordering (US-5)
 *  - OG 5-element completeness + PNG assets (US-15/SS-15, E-111 positive)
 *  - E-202 warning emission (W5 M-1 regression) + placeholder publishing
 *  - listen links: manual override + auto search trio (US-7/SS-13)
 *  - client JS = 0 on every page (NFR)
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

test('지면 전수 — 13유형 상당(33지면) + 404 생성', () => {
  expect(pages.length).toBe(33); // 32 pages + 404.html
  for (const must of ['/', '/about/', '/archive/', '/list/2026/', '/list/2026/08/', '/404.html']) {
    expect(pages).toContain(must);
  }
});

test('D2 — 탐색 지면(아카이브·아티스트·이야기·소개)에 점수 문자열 0', () => {
  const browsing = pages.filter(
    (p) => p.startsWith('/archive/') || p.startsWith('/artists/') || p.startsWith('/stories/') || p === '/about/',
  );
  expect(browsing.length).toBeGreaterThanOrEqual(15);
  for (const p of browsing) {
    const html = readPage(dir, p);
    expect(html, p).not.toContain('class="score');
    for (const s of SCORES) expect(html, `${p} leaks ${s}`).not.toContain(scoreToken(s));
  }
});

test('D2 — 리스트 지면은 점수 표시·정렬 / 홈 보드 top5 컷 / 최신 글 무점수', () => {
  const home = readPage(dir, '/');
  // Board shows top-5 scores…
  for (const s of ['9.1', '8.8', '8.3', '7.9', '7.5', '8.0']) expect(home).toContain(scoreToken(s));
  // …but never the two below the cut (US-2 AC — top 5 only).
  expect(home).not.toContain(scoreToken('7.2'));
  expect(home).not.toContain(scoreToken('6.8'));
  // Everything BELOW the Charts section is a browsing surface and carries no
  // scores. The home's section order is the score-exposure order, so slicing
  // at the first browsing section covers 최신 리뷰 AND 음악 이야기 at once.
  // The explicit index check matters: indexOf(-1) would make slice() return
  // the last character and the loop below would pass on nothing at all —
  // that is how this assertion used to die quietly when the anchor moved.
  const browsingAt = home.indexOf('aria-label="최신 리뷰"');
  expect(browsingAt, '홈 최신 리뷰 섹션 앵커 부재').toBeGreaterThan(-1);
  const browsing = home.slice(browsingAt);
  for (const s of SCORES) expect(browsing, `browsing sections leak ${s}`).not.toContain(scoreToken(s));

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

test('NFR — 클라이언트 JS 0: 전 지면 script 태그 부재 (goatcounter 미설정)', () => {
  for (const p of pages) {
    expect(readPage(dir, p), p).not.toContain('<script');
  }
});
