/**
 * US-12 AC1 · US-13 · SS-6 — finalize year transition + snapshot immutability,
 * measured with the real CLI + real builds on the rich content set (7 pop +
 * 1 hiphop reviews). Also captures the home 'post-finalize' state
 * (4-state coverage, state 4).
 */
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePathOf, build, finalize, makeSandbox, readPage } from '../lib/sandbox.mjs';
import { writeRichContent } from '../lib/rich-content.mjs';

test.describe.configure({ mode: 'serial' });

let dir: string;
let B: string;

test.beforeAll(async () => {
  dir = makeSandbox('finalize');
  B = basePathOf(dir);
  await writeRichContent(dir);
});

test('finalize CLI — 스냅샷 동결 + active_year 전이 + 이듬해 버킷 블록', () => {
  const result = finalize(dir, 2026, '# 2026 서문\n\n한 해를 요약하는 문장.');
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const snapshot = readFileSync(join(dir, 'content/snapshots/2026.md'), 'utf8');
  expect(snapshot).toContain('year: 2026');
  // Bucket publish rule (US-13 AC3): pop has 7 reviews (≥3) → published,
  // hiphop has 1 (<3) → withheld this year.
  expect(snapshot).toMatch(/published: true/);
  expect(snapshot).toMatch(/published: false/);

  expect(readFileSync(join(dir, 'config/site.yaml'), 'utf8')).toContain('active_year: 2027');
  expect(readFileSync(join(dir, 'config/genres.yaml'), 'utf8')).toContain('year: 2027');
});

test('확정 빌드 — 동결 리스트 지면 + 홈 post-finalize 상태', () => {
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const list = readPage(dir, '/list/2026/');
  // The overline used to read "2026 올해의 앨범 — 확정" and this line pinned
  // that string. It was removed on 2026-09-07 because it restated the page's
  // own h1 one line above it. What the assertion protects — "a frozen list
  // declares itself frozen, and says what it is frozen to" — is unchanged, so
  // it moved onto the structure that now carries it: the state chip, the
  // immutability sentence it stands for, and the title that survived.
  expect(list).toContain('class="finalized-mark"');
  expect(list).toContain('확정된 리스트입니다');
  // The page title became a single English line, "Charts {year}", on
  // 2026-09-07 (every other tab names itself in one line; this one was
  // spending two). The literal string moved OUT of the assertion rather than
  // out of the suite: what is worth pinning is that the page's one h1 names
  // the YEAR it is the list for — a finalized 2026 page that titled itself
  // 2027 would be the real defect — and that survives the next rewording.
  expect(list).toMatch(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>[^<]*2026[^<]*<\/h1>/);
  expect(list).toContain('8장의 앨범');
  // …and the progressive face of the same route carries none of it.
  expect(readPage(dir, '/list/2027/')).not.toContain('class="finalized-mark"');
  // USP-A on the frozen surface: every entry links to a review.
  const anchors = list.match(new RegExp(`href="${B}/reviews/[^"]+"`, 'g')) ?? [];
  expect(new Set(anchors).size).toBe(8);
  // Rank = score desc: champion score renders first.
  expect(list.indexOf('>9.1<')).toBeGreaterThan(-1);
  expect(list.indexOf('>9.1<')).toBeLessThan(list.indexOf('>8.8<'));

  const home = readPage(dir, '/');
  expect(home).toContain('finalized-card');
  expect(home).toContain('2026 올해의 앨범 — 확정');
  expect(home).toContain(`href="${B}/list/2026/"`);
  // The new year starts with an empty chart. Until 2026-09-07 the home simply
  // omitted an empty Charts section and the proof was its ABSENCE; the home
  // now always renders the section, so the assertion is REVERSED — the
  // section is present, it stands on its empty ground instead of holding
  // cards, its heading has rolled over to the NEW year, and last year's
  // albums are gone rather than carried over as this year's nominees. Same
  // property, stated on the surface that now exists.
  expect(home).toContain('aria-label="올해의 앨범"');
  expect(home).toContain('2027 올해의 앨범');
  expect(home).toContain('class="section-empty');
  expect(home).not.toContain('class="chart-card');

  // "Last year's champion is no longer a nominee" used to be proved by the
  // absence of >9.1< from the whole page. D2-R2 (2026-09-07) put scores on
  // the home's 최신 리뷰 cards, and that review is still published — so the
  // figure is legitimately on the page now and the proof has to be scoped to
  // the section that makes the claim. Sliced, not deleted: the Charts section
  // must contain no figure at all, and the review must still be there below
  // it, which together is exactly what post-finalize means.
  const chartsAt = home.indexOf('aria-label="올해의 앨범"');
  const reviewsAt = home.indexOf('aria-label="최신 리뷰"');
  expect(reviewsAt).toBeGreaterThan(chartsAt);
  const chartsSection = home.slice(chartsAt, reviewsAt);
  expect(chartsSection, '빈 차트에 점수').not.toMatch(/>\d\.\d</);
  expect(home.slice(reviewsAt), '평론이 홈에서 사라짐').toContain('>9.1<');
  // 최신 리뷰 is NOT empty here: the eight reviews are still published, they
  // are simply no longer nominees. An empty chart above a full review list is
  // exactly the post-finalize shape.
  expect(home).toContain('class="article-card');
  // Genre boards were removed from /list/{year}/ entirely (2026-09-09,
  // list/[year]/index.astro's own intro) — the per-bucket "아직 이 장르의
  // 후보가 없습니다" placeholder this used to count (3 buckets: pop, hiphop,
  // rock) no longer renders anywhere, for a brand-new all-empty year same as
  // any other. Proven both ways so a page that silently dropped ALL its
  // content (not just the genre boards) would not slip past a one-sided
  // absence check: the old placeholder text is gone, AND the page still
  // renders something real for a reader who just finalized last year — the
  // link back to it.
  const newYearList = readPage(dir, '/list/2027/');
  expect(newYearList).not.toContain('아직 이 장르의 후보가 없습니다');
  expect(newYearList).not.toContain('aria-label="Genre Nominees"');
  expect(newYearList).toContain('지난해 확정 리스트');
  expect(newYearList).toContain(`href="${B}/list/2026/"`);
});

test('점수 수정 → 평론은 반영, 확정 스냅샷 지면은 불변 (US-12 AC1)', () => {
  const reviewFile = join(dir, 'content/reviews/aurora-line-first-light.md');
  writeFileSync(reviewFile, readFileSync(reviewFile, 'utf8').replace('score: "9.1"', 'score: "9.9"'), 'utf8');
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const review = readPage(dir, '/reviews/aurora-line-first-light/');
  expect(review).toContain('>9.9<');

  const list = readPage(dir, '/list/2026/');
  expect(list).toContain('>9.1<'); // frozen at finalize time
  expect(list).not.toContain('>9.9<');
});

test('확정 후 지난해 발매작 평론 발행 → 스냅샷 불변 + 아카이브만 편입 (US-13 AC2)', () => {
  writeFileSync(
    join(dir, 'content/albums/late-arrival.yaml'),
    'title: 뒤늦은 도착\nartists: [fixture-artist]\nrelease_date: "2026-08-30"\nbuckets: [pop]\n',
    'utf8',
  );
  writeFileSync(
    join(dir, 'content/reviews/late-arrival.md'),
    '---\nalbum: late-arrival\nscore: "9.5"\ndate: 2026-12-30\neditorial_check: true\n---\n\n확정 이후에 도착한 평론.\n',
    'utf8',
  );
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const list = readPage(dir, '/list/2026/');
  expect(list).toContain('8장의 앨범'); // still 8 — 9.5 does not enter
  expect(list).not.toContain('late-arrival');

  // Was /archive/2026/ — the per-publication-year archive page was retired
  // in the 2026-09-09 axis-chip redesign (archive/index.astro's own intro).
  // The hub IS the index now: every article renders there unconditionally,
  // so "incorporated into the archive" is checked directly against it rather
  // than against a page scoped to one year. R-3's actual claim — that this
  // review attributes to its PUBLICATION year (2026) rather than the new
  // active_year (2027) — is unit-tested at the derive layer
  // (tests/unit/derive-archive.test.ts, "연도 축은 발행 연도 기준"); this
  // e2e assertion only needs to prove the real build actually reaches the
  // real page.
  const archive = readPage(dir, '/archive/');
  expect(archive).toContain(`href="${B}/reviews/late-arrival/"`);

  const home = readPage(dir, '/');
  expect(home).toContain('finalized-card'); // still post-finalize
});
