/**
 * List engine contract tests — each determinism rule (R-1·2·3·4·6·7·10) gets
 * at least one case, plus the E-301/302/303 notice semantics. R-9 (slug/URL
 * immutability) is deliberately NOT tested here: it is an operations rule
 * audited via git history (declared exclusion, build-plan §3 / Matthias N-4).
 *
 * Fixtures are built in memory: derive is pure over RepoData, so file I/O
 * would only add noise.
 */
import { describe, expect, it } from 'vitest';
import type { Entry, RepoData } from '../../src/lib/checker/load';
import {
  CARD_EXCERPT_MAX,
  boardState,
  compareR1,
  currentYearMonthSeoul,
  deriveBadgeMap,
  deriveBoard,
  deriveHomeSections,
  deriveHomeVariant,
  deriveLatestArticles,
  deriveMonthlyRecaps,
  deriveTop10,
  detectBoardChanges,
  detectBoundaryTies,
  detectUnfinalizedYear,
  joinReviews,
} from '../../src/lib/derive/lists';
import { excerptFrom } from '../../src/lib/derive/excerpt';
import type { Album, Artist, GenresConfig, ReviewFrontmatter, SiteConfig, Snapshot, Story } from '../../src/lib/schema';

// ── fixture builders ───────────────────────────────────────────────────

const genres: GenresConfig = {
  years: [
    {
      year: 2026,
      buckets: [
        { id: 'hiphop-rnb', label: '힙합/R&B', order: 1 },
        { id: 'pop', label: '팝', order: 2 },
        { id: 'rock', label: '록', order: 3 },
      ],
      min_reviews_to_publish: 3,
    },
  ],
};

const site: SiteConfig = {
  site_name: 'undernote',
  base_url: 'https://example.com',
  active_year: 2026,
  og_use_cover: true,
  // Zod v4 .default() makes this REQUIRED in the output type (documented
  // breaking change) — fixtures typed as SiteConfig must carry it.
  early_stage_threshold: 6,
};

let counter = 0;

function entry<T>(slug: string, data: T, body = '본문'): Entry<T> {
  return { slug, file: `fixture/${slug}`, data, body };
}

function albumOf(slug: string, over: Partial<Album> = {}): Entry<Album> {
  return entry(slug, {
    title: `앨범 ${slug}`,
    artists: ['artist-a'],
    release_date: '2026-03-01',
    bucket: 'pop',
    tags: [],
    ...over,
  } as Album);
}

function reviewOf(slug: string, score: string, date: string): Entry<ReviewFrontmatter> {
  return entry(slug, { album: slug, score, date, editorial_check: true } as ReviewFrontmatter);
}

function repoOf(input: {
  albums?: Entry<Album>[];
  reviews?: Entry<ReviewFrontmatter>[];
  stories?: Entry<Story>[];
  snapshots?: Entry<Snapshot>[];
}): RepoData {
  return {
    albums: input.albums ?? [],
    reviews: input.reviews ?? [],
    stories: input.stories ?? [],
    artists: [entry<Artist>('artist-a', { name: '아티스트A' })],
    snapshots: input.snapshots ?? [],
    site,
    genres,
    tags: { tags: [] },
  };
}

// ── R-1 total order ────────────────────────────────────────────────────

describe('R-1 — 3키 전순서', () => {
  it('점수 내림차순 → 발행일 오름차순 → slug 사전순', () => {
    const repo = repoOf({
      albums: [albumOf('b-early'), albumOf('a-late'), albumOf('c-top')],
      reviews: [
        reviewOf('b-early', '8.0', '2026-01-01'),
        reviewOf('a-late', '8.0', '2026-02-01'),
        reviewOf('c-top', '9.0', '2026-03-01'),
      ],
    });
    const sorted = joinReviews(repo).sort(compareR1);
    expect(sorted.map((j) => j.slug)).toEqual(['c-top', 'b-early', 'a-late']);
  });

  it('같은 날 동점은 slug 사전순 (3차 키 — 비결정성 차단)', () => {
    const repo = repoOf({
      albums: [albumOf('zeta'), albumOf('alpha')],
      reviews: [reviewOf('zeta', '8.0', '2026-01-01'), reviewOf('alpha', '8.0', '2026-01-01')],
    });
    const sorted = joinReviews(repo).sort(compareR1);
    expect(sorted.map((j) => j.slug)).toEqual(['alpha', 'zeta']);
  });

  it('"10.0"(100)과 "9.9"(99) — 십분위 정수 비교 (float 오염 없음)', () => {
    const repo = repoOf({
      albums: [albumOf('nine'), albumOf('ten')],
      reviews: [reviewOf('nine', '9.9', '2026-01-01'), reviewOf('ten', '10.0', '2026-01-02')],
    });
    expect(joinReviews(repo).sort(compareR1)[0].slug).toBe('ten');
  });
});

// ── R-3 attribution + R-7 etc ──────────────────────────────────────────

describe('R-3 — 귀속 2축 공존 (사양)', () => {
  const repo = repoOf({
    albums: [albumOf('old-album', { release_date: '2025-06-01' }), albumOf('new-album')],
    reviews: [reviewOf('old-album', '9.5', '2026-04-01'), reviewOf('new-album', '8.0', '2026-04-02')],
  });
  const joined = joinReviews(repo);

  it('2025 발매의 2026 평론 → 2026 10선 후보 아님', () => {
    const top10 = deriveTop10(joined, 2026);
    expect(top10.entries.map((e) => e.album)).toEqual(['new-album']);
  });

  it('…그러나 발행월 정산에는 포함 (구반 포함)', () => {
    const recaps = deriveMonthlyRecaps(joined, '2026-05');
    expect(recaps).toHaveLength(1);
    expect(recaps[0].month).toBe('2026-04');
    expect(recaps[0].entries.map((e) => e.album)).toEqual(['old-album', 'new-album']); // 9.5 > 8.0
  });
});

describe('R-7 — etc 버킷 취급', () => {
  const repo = repoOf({
    albums: [albumOf('etc-masterpiece', { bucket: 'etc' }), albumOf('pop-album')],
    reviews: [reviewOf('etc-masterpiece', '9.1', '2026-01-01'), reviewOf('pop-album', '8.0', '2026-01-02')],
  });
  const joined = joinReviews(repo);

  it('10선 포함 · 보드 제외 · 배지 없음', () => {
    const top10 = deriveTop10(joined, 2026);
    expect(top10.entries[0].album).toBe('etc-masterpiece');
    const board = deriveBoard(joined, genres, 2026);
    const allBoard = board.buckets.flatMap((b) => b.entries.map((e) => e.album));
    expect(allBoard).not.toContain('etc-masterpiece');
    expect(deriveBadgeMap(board).has('etc-masterpiece')).toBe(false);
  });
});

// ── R-4 empty & 5-cap · R-6 under-ten ─────────────────────────────────

describe('R-4 · R-6 — 빈 집합과 미달', () => {
  it('빈 버킷도 구조에 남고(entries 0) 5편 초과는 상위 5만', () => {
    const albums = Array.from({ length: 7 }, (_, i) => albumOf(`hh-${i}`, { bucket: 'hiphop-rnb' }));
    const reviews = albums.map((a, i) => reviewOf(a.slug, `${(9 - i * 0.1).toFixed(1)}`, '2026-01-01'));
    const joined = joinReviews(repoOf({ albums, reviews }));
    const board = deriveBoard(joined, genres, 2026);
    expect(board.buckets.map((b) => b.id)).toEqual(['hiphop-rnb', 'pop', 'rock']); // config order 유지
    expect(board.buckets[0].entries).toHaveLength(5);
    expect(board.buckets[1].entries).toHaveLength(0); // 빈 버킷 — 숨기지 않음 (지면이 카피 처리)
  });

  it('당해 평론이 10편 미만이면 10선도 있는 만큼만', () => {
    const joined = joinReviews(
      repoOf({ albums: [albumOf('only-one')], reviews: [reviewOf('only-one', '8.0', '2026-01-01')] }),
    );
    expect(deriveTop10(joined, 2026).entries).toHaveLength(1);
  });
});

// ── R-2/R-5 재도출 ─────────────────────────────────────────────────────

describe('R-2 · R-5 — 점수 수정은 과거 월말정산까지 전파', () => {
  it('입력만 바꾸면 과거 월 정산 순서가 재도출된다 (살아 있는 도출물)', () => {
    const albums = [albumOf('first'), albumOf('second')];
    const before = joinReviews(
      repoOf({ albums, reviews: [reviewOf('first', '8.0', '2026-01-01'), reviewOf('second', '7.0', '2026-01-02')] }),
    );
    const after = joinReviews(
      repoOf({ albums, reviews: [reviewOf('first', '8.0', '2026-01-01'), reviewOf('second', '9.0', '2026-01-02')] }),
    );
    expect(deriveMonthlyRecaps(before, '2026-03')[0].entries[0].album).toBe('first');
    expect(deriveMonthlyRecaps(after, '2026-03')[0].entries[0].album).toBe('second');
  });
});

// ── R-10 clock ─────────────────────────────────────────────────────────

describe('R-10 — Asia/Seoul 종료 월 판정 (유일한 시계 소비처)', () => {
  it('UTC 말일 15:00(=KST 다음 달 1일 00:00)에 월이 넘어간다', () => {
    const utc = Date.UTC(2026, 8, 30, 15, 0, 0); // 2026-09-30T15:00Z = KST 10-01 00:00
    expect(currentYearMonthSeoul(utc)).toBe('2026-10');
    expect(currentYearMonthSeoul(utc - 1)).toBe('2026-09');
  });

  it('현재 월은 정산 페이지가 없다 (종료 월만)', () => {
    const joined = joinReviews(
      repoOf({ albums: [albumOf('now')], reviews: [reviewOf('now', '8.0', '2026-09-02')] }),
    );
    expect(deriveMonthlyRecaps(joined, '2026-09')).toHaveLength(0);
    expect(deriveMonthlyRecaps(joined, '2026-10')).toHaveLength(1);
  });
});

// ── notices ────────────────────────────────────────────────────────────

describe('E-301 — 경계 동점만 알림', () => {
  it('보드 5↔6위 동점 → E-301, 비경계(2↔3위) 동점 → 미산출', () => {
    const albums = Array.from({ length: 6 }, (_, i) => albumOf(`hh-${i}`, { bucket: 'hiphop-rnb' }));
    // 5th and 6th share 8.0 (boundary); 2nd/3rd share 8.5 (non-boundary).
    const scores = ['9.0', '8.5', '8.5', '8.2', '8.0', '8.0'];
    const reviews = albums.map((a, i) => reviewOf(a.slug, scores[i], `2026-01-0${i + 1}`));
    const notices = detectBoundaryTies(joinReviews(repoOf({ albums, reviews })), genres, 2026);
    const boundary = notices.filter((n) => n.message.includes('5↔6위'));
    expect(boundary).toHaveLength(1);
    expect(notices.some((n) => n.message.includes('2↔3위'))).toBe(false);
  });

  it('버킷 1↔2위 동점도 경계다', () => {
    const albums = [albumOf('a1', { bucket: 'pop' }), albumOf('a2', { bucket: 'pop' })];
    const reviews = [reviewOf('a1', '9.0', '2026-01-01'), reviewOf('a2', '9.0', '2026-01-02')];
    const notices = detectBoundaryTies(joinReviews(repoOf({ albums, reviews })), genres, 2026);
    expect(notices.some((n) => n.message.includes('1↔2위'))).toBe(true);
  });
});

describe('E-302 · E-303', () => {
  it('이후 연도 발매작 평론 존재 + 미확정 → E-302', () => {
    const repo = repoOf({
      albums: [albumOf('next-year', { release_date: '2027-01-05', bucket: 'etc' })],
      reviews: [reviewOf('next-year', '8.0', '2027-01-10')],
    });
    const notices = detectUnfinalizedYear(repo, joinReviews(repo));
    expect(notices.map((n) => n.code)).toEqual(['E-302']);
  });

  it('직전 빌드 보드 상태와의 차이 → E-303 진입/탈락', () => {
    const repo = repoOf({
      albums: [albumOf('rising', { bucket: 'pop' })],
      reviews: [reviewOf('rising', '8.5', '2026-01-01')],
    });
    const board = deriveBoard(joinReviews(repo), genres, 2026);
    const notices = detectBoardChanges({ pop: ['falling'], 'hiphop-rnb': [], rock: [] }, board);
    expect(notices.some((n) => n.message.includes('진입'))).toBe(true);
    expect(notices.some((n) => n.message.includes('탈락'))).toBe(true);
    expect(boardState(board)).toEqual({ 'hiphop-rnb': [], pop: ['rising'], rock: [] });
  });
});

// ── home surface ───────────────────────────────────────────────────────

describe('홈 상태 분기 (시계 없음)', () => {
  it.each([
    [{ reviewCount: 0, nominateTotal: 0, threshold: 6, hasPreviousSnapshot: false }, 'empty'],
    [{ reviewCount: 3, nominateTotal: 3, threshold: 6, hasPreviousSnapshot: false }, 'early'],
    [{ reviewCount: 3, nominateTotal: 3, threshold: 6, hasPreviousSnapshot: true }, 'post-finalize'],
    [{ reviewCount: 9, nominateTotal: 7, threshold: 6, hasPreviousSnapshot: true }, 'normal'],
  ])('%o → %s', (input, expected) => {
    expect(deriveHomeVariant(input)).toBe(expected);
  });
});

describe('최신 글 (ui-spec §1.1) — D2-R2 이후의 점수 계약', () => {
  const repo = repoOf({
    albums: [albumOf('rev-a')],
    reviews: [reviewOf('rev-a', '8.3', '2026-05-01')],
    stories: [
      entry<Story>('story-a', { title: '이야기 A', date: '2026-06-01', albums: [], tags: [] }, '요지 첫 문단.'),
    ],
  });
  const items = deriveLatestArticles(repo, joinReviews(repo), excerptFrom);

  it('유형 혼합·날짜 내림차순', () => {
    expect(items.map((i) => i.type)).toEqual(['story', 'review']);
  });

  // D2-R2 (2026-09-07) reversed this. The field exists now, so the data-level
  // guarantee is gone and the assertion is inverted rather than deleted: what
  // must still hold is that a STORY never carries one, because a story has no
  // score to carry. The surface-level guard moved to ArticleCard's opt-in
  // `showScore` and to build.dist-matrix.spec.ts's two-way surface list.
  it('평론 항목은 score를 싣고 이야기 항목은 싣지 않는다 (D2-R2)', () => {
    const byType = Object.fromEntries(items.map((i) => [i.type, i]));
    expect(byType.review.score).toBe('8.3');
    expect(byType.story.score).toBeUndefined();
  });
});

describe('deriveHomeSections — 홈 3섹션 (W5 재편 2026-09-06)', () => {
  const storyOf = (slug: string, date: string) =>
    entry<Story>(slug, { title: `이야기 ${slug}`, date, albums: [], tags: [] } as Story, '이야기 본문.');

  /** Board + articles for a repo, in the same order the home consumes them. */
  const sectionsFor = (repo: RepoData, limit?: number) => {
    const joined = joinReviews(repo);
    const board = deriveBoard(joined, genres, 2026);
    const articles = deriveLatestArticles(repo, joined, excerptFrom, Number.MAX_SAFE_INTEGER);
    return deriveHomeSections(board, articles, limit);
  };

  it('charts = 보드를 버킷 순서 → 순위 순으로 평탄화하고 버킷 라벨·버킷 내 순위를 싣는다', () => {
    const repo = repoOf({
      albums: [albumOf('pop-hi'), albumOf('pop-lo'), albumOf('hip', { bucket: 'hiphop-rnb' })],
      reviews: [
        reviewOf('pop-hi', '9.0', '2026-01-01'),
        reviewOf('pop-lo', '7.0', '2026-01-02'),
        reviewOf('hip', '8.0', '2026-01-03'),
      ],
    });
    const { charts } = sectionsFor(repo);
    // genres.yaml order is hiphop-rnb(1) → pop(2) → rock(3), and rank is the
    // position INSIDE the bucket, so both buckets start again at 1.
    expect(charts.map((c) => [c.album, c.bucketLabel, c.rank])).toEqual([
      ['hip', '힙합/R&B', 1],
      ['pop-hi', '팝', 1],
      ['pop-lo', '팝', 2],
    ]);
    // bucketCount travels with the rank (2026-09-07). The card prints the
    // ordinal only from two entries up, because the home flattens the
    // buckets into one row and a "1위" out of one album orders nothing —
    // which is a judgment the CARD makes and the derive layer only supplies
    // the fact for. Both cases are present here on purpose: the lone
    // hiphop-rnb entry and the two-deep pop bucket.
    expect(charts.map((c) => c.bucketCount)).toEqual([1, 2, 2]);
  });

  it('빈 버킷은 charts에 아무것도 기여하지 않는다 (R-4 — 홈은 미출력, 구조는 /list/{year}/가 보인다)', () => {
    const repo = repoOf({
      albums: [albumOf('only-pop')],
      reviews: [reviewOf('only-pop', '8.0', '2026-01-01')],
    });
    const { charts } = sectionsFor(repo);
    expect(charts).toHaveLength(1);
    expect(charts.every((c) => c.bucketLabel === '팝')).toBe(true);
  });

  // Direction reversed 2026-09-07 (the home always shows three sections, so
  // suppressing this one would leave an empty 최신 리뷰 under a full chart).
  // The assertion is kept, not deleted: it still pins what happens when the
  // chart already covers every review — the overlap is now ALLOWED, and the
  // two cards of the same album must be different objects (the chart card
  // carries the score, the review card carries no score field at all).
  it('차트가 전 평론을 싣고 있어도 최신 리뷰는 같은 평론을 다시 싣는다 (중복 허용 · 서로 다른 카드)', () => {
    const repo = repoOf({
      albums: [albumOf('one')],
      reviews: [reviewOf('one', '8.0', '2026-01-01')],
    });
    const { charts, latestReviews } = sectionsFor(repo);
    expect(charts).toHaveLength(1);
    expect(latestReviews.map((a) => a.url)).toEqual(['/reviews/one/']);
    expect(charts[0].score).toBe('8.0');
    // Both cards now carry the figure (D2-R2); what still separates them is
    // that only the chart card carries a RANK.
    expect(latestReviews[0].score).toBe('8.0');
    expect(charts[0].rank).toBe(1);
    expect('rank' in latestReviews[0]).toBe(false);
  });

  it('차트 밖 평론이 하나라도 있으면 최신 리뷰가 발행일 내림차순으로 나온다 (중복 허용)', () => {
    // 6 pop albums: the board keeps 5, so 'sixth' can never be in charts.
    const albums = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => albumOf(`pop-${k}`));
    const reviews = ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) =>
      reviewOf(`pop-${k}`, `${9 - i}.0`, `2026-01-0${i + 1}`),
    );
    const { charts, latestReviews } = sectionsFor(repoOf({ albums, reviews }));
    expect(charts).toHaveLength(5); // top-5 cut
    // Newest first; the lowest-scored album is the newest review here. The
    // DEFAULT limit dropped 6 → 4 on 2026-09-07 when the home's browsing
    // grids became a fixed four-column row — six cards would have left two
    // empty tracks on a second row. Asserted explicitly rather than by
    // shortening the list, because "one full row" is the property.
    expect(latestReviews).toHaveLength(4);
    expect(latestReviews.map((a) => a.url)).toEqual([
      '/reviews/pop-f/',
      '/reviews/pop-e/',
      '/reviews/pop-d/',
      '/reviews/pop-c/',
    ]);
  });

  it('연도 밖 발매작만 있으면 charts는 비고 최신 리뷰가 그 평론을 싣는다 (R-3 귀속 2축)', () => {
    const repo = repoOf({
      albums: [albumOf('old', { release_date: '2024-05-01' })],
      reviews: [reviewOf('old', '9.5', '2026-01-01')],
    });
    const { charts, latestReviews } = sectionsFor(repo);
    expect(charts).toEqual([]);
    expect(latestReviews.map((a) => a.url)).toEqual(['/reviews/old/']);
  });

  it('notes는 이야기만, 발행일 내림차순, limit까지', () => {
    const repo = repoOf({
      stories: [storyOf('s-old', '2026-01-01'), storyOf('s-new', '2026-03-01'), storyOf('s-mid', '2026-02-01')],
    });
    const { notes } = sectionsFor(repo, 2);
    expect(notes.map((n) => n.url)).toEqual(['/stories/s-new/', '/stories/s-mid/']);
    expect(notes.every((n) => n.type === 'story')).toBe(true);
  });

  it('콘텐츠 0 = 세 섹션 모두 빈 배열 (파생 계층은 자리를 채우지 않는다)', () => {
    // The derive layer never fabricates: zero content is three empty arrays.
    // What the home puts in the resulting hole is a page decision
    // (SectionDefinition), not a data one — no placeholder item ever enters
    // these lists.
    const { charts, latestReviews, notes } = sectionsFor(repoOf({}));
    expect([charts, latestReviews, notes]).toEqual([[], [], []]);
  });

  it('카드 발췌 — 평론·이야기 양쪽에 실리고 CARD_EXCERPT_MAX를 넘지 않는다', () => {
    const repo = repoOf({
      albums: [albumOf('rev')],
      reviews: [reviewOf('rev', '8.0', '2026-01-01')],
      stories: [storyOf('story', '2026-02-01')],
    });
    const { latestReviews, notes } = sectionsFor(repo);
    expect(latestReviews[0].excerpt).toBeTruthy();
    expect(notes[0].excerpt).toBeTruthy();
    for (const item of [...latestReviews, ...notes]) {
      expect(item.excerpt!.length).toBeLessThanOrEqual(CARD_EXCERPT_MAX + 1); // +1 = the ellipsis
    }
  });

  it('D2 — 첫 문단에 자기 점수가 있으면 카드 발췌를 싣지 않는다 (탐색 지면 무점수)', () => {
    const repo = repoOf({
      albums: [albumOf('leaky'), albumOf('clean')],
      reviews: [
        { ...reviewOf('leaky', '8.5', '2026-01-02'), body: '이 앨범에 8.5점을 줬다. 이유는 다음과 같다.' },
        { ...reviewOf('clean', '8.5', '2026-01-01'), body: '점수 이야기는 아직 하지 않는다.' },
      ],
    });
    const { latestReviews } = sectionsFor(repo);
    const byUrl = new Map(latestReviews.map((a) => [a.url, a]));
    expect(byUrl.get('/reviews/leaky/')!.excerpt).toBeUndefined();
    // The card itself survives — only the excerpt drops out.
    expect(byUrl.get('/reviews/leaky/')!.title).toBeTruthy();
    expect(byUrl.get('/reviews/clean/')!.excerpt).toBe('점수 이야기는 아직 하지 않는다.');
  });

  it('D2 — 다른 앨범의 점수가 인용된 문단은 발췌로 살아남는다 (숫자가 아니라 이 평론의 판단이 기준)', () => {
    const repo = repoOf({
      albums: [albumOf('quoting')],
      reviews: [{ ...reviewOf('quoting', '8.4', '2026-01-01'), body: '그 시절 나는 다른 앨범에 8.5점을 줬다.' }],
    });
    const { latestReviews } = sectionsFor(repo);
    expect(latestReviews[0].excerpt).toBe('그 시절 나는 다른 앨범에 8.5점을 줬다.');
  });

  it('D2-R2 — 최신 리뷰 항목은 저장된 점수 문자열을 그대로 싣는다', () => {
    const albums = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => albumOf(`pop-${k}`));
    const reviews = ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) =>
      reviewOf(`pop-${k}`, `${9 - i}.0`, `2026-01-0${i + 1}`),
    );
    // Explicit limit: this test is about the SCORE STRINGS, not about how
    // many cards the home shows, so it asks for all six rather than tracking
    // the section cap (which moved 6 → 4 on 2026-09-07).
    const { latestReviews, notes } = sectionsFor(repoOf({ albums, reviews }), 6);
    // Verbatim, never reformatted — the same rule list surfaces follow.
    expect(latestReviews.map((a) => a.score)).toEqual(['4.0', '5.0', '6.0', '7.0', '8.0', '9.0']);
    // Stories still cannot carry one.
    expect(notes.every((n) => n.score === undefined)).toBe(true);
  });
});
