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
  boardState,
  compareR1,
  currentYearMonthSeoul,
  deriveBadgeMap,
  deriveBoard,
  deriveHomeVariant,
  deriveLatestArticles,
  deriveMonthlyRecaps,
  deriveTop10,
  detectBoardChanges,
  detectBoundaryTies,
  detectUnfinalizedYear,
  joinReviews,
  latestPublicationDate,
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

describe('최신 글 (ui-spec §1.1) — 점수 필드 부재가 계약', () => {
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

  it('어떤 항목에도 score 키가 없다 (D2 데이터 레벨 강제 — Matthias N-2)', () => {
    for (const item of items) {
      expect(Object.keys(item)).not.toContain('score');
    }
    expect(JSON.stringify(items)).not.toContain('"score"');
  });

  it('보드 캡션 날짜 = 저장소 유래 최신 발행일 (빌드 시계 금지)', () => {
    expect(latestPublicationDate(repo)).toBe('2026-06-01');
  });
});
