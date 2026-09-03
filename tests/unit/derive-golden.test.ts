/**
 * Golden-file test (AC14): the full derive output for a fixed fixture set is
 * snapshotted — if ANY bit of ordering or shape drifts between runs or
 * refactors, this fails before the CI hash gate ever has to. Covers R-1 ties
 * (same/different day), R-3 attribution (old release), R-7 etc masterpiece,
 * R-4 empty bucket, R-6 under-ten, all at once.
 */
import { describe, expect, it } from 'vitest';
import type { Entry, RepoData } from '../../src/lib/checker/load';
import {
  deriveBoard,
  deriveMonthlyRecaps,
  deriveTop10,
  joinReviews,
} from '../../src/lib/derive/lists';
import type { Album, Artist, GenresConfig, ReviewFrontmatter, SiteConfig } from '../../src/lib/schema';

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

function entry<T>(slug: string, data: T): Entry<T> {
  return { slug, file: `fixture/${slug}`, data, body: '본문' };
}

const albums: [string, string, string][] = [
  // slug, release_date, bucket
  ['tie-same-day-a', '2026-01-10', 'pop'],
  ['tie-same-day-z', '2026-01-11', 'pop'],
  ['tie-diff-day', '2026-02-01', 'pop'],
  ['etc-masterpiece', '2026-03-01', 'etc'],
  ['old-release', '2025-07-01', 'rock'],
  ['hiphop-solo', '2026-04-01', 'hiphop-rnb'],
];

const reviews: [string, string, string][] = [
  // slug, score, date — tie-same-day pair shares score AND date (3rd key
  // decides); tie-diff-day shares the score with them but publishes later.
  ['tie-same-day-a', '8.5', '2026-05-01'],
  ['tie-same-day-z', '8.5', '2026-05-01'],
  ['tie-diff-day', '8.5', '2026-05-20'],
  ['etc-masterpiece', '9.1', '2026-06-01'],
  ['old-release', '9.5', '2026-06-15'], // 2025 release — archives/monthly only (R-3)
  ['hiphop-solo', '7.9', '2026-07-01'],
];

const repo: RepoData = {
  albums: albums.map(([slug, release_date, bucket]) =>
    entry<Album>(slug, { title: `앨범 ${slug}`, artists: ['artist-a'], release_date, bucket, tags: [] }),
  ),
  reviews: reviews.map(([slug, score, date]) =>
    entry<ReviewFrontmatter>(slug, { album: slug, score, date, editorial_check: true }),
  ),
  stories: [],
  artists: [entry<Artist>('artist-a', { name: '아티스트A' })],
  snapshots: [],
  site: { site_name: 'undernote', base_url: 'https://example.com', active_year: 2026, og_use_cover: true, early_stage_threshold: 6 } as SiteConfig,
  genres,
  tags: { tags: [] },
};

describe('골든 파일 — 전체 도출 산출물 고정', () => {
  const joined = joinReviews(repo);
  const output = {
    board: deriveBoard(joined, genres, 2026),
    top10: deriveTop10(joined, 2026),
    recaps: deriveMonthlyRecaps(joined, '2026-08'),
  };

  it('도출 결과가 골든 스냅샷과 일치한다', async () => {
    await expect(JSON.stringify(output, null, 2)).toMatchFileSnapshot('./__golden__/derive-output.json');
  });

  it('핵심 순서가 규칙과 일치한다 (스냅샷 이중 확인)', () => {
    // pop bucket: same-day tie → slug asc; later publication of equal score sinks.
    expect(output.board.buckets[1].entries.map((e) => e.album)).toEqual([
      'tie-same-day-a',
      'tie-same-day-z',
      'tie-diff-day',
    ]);
    // top10: etc included (9.1 first), 2025 release excluded despite 9.5.
    expect(output.top10.entries[0].album).toBe('etc-masterpiece');
    expect(output.top10.entries.map((e) => e.album)).not.toContain('old-release');
    // rock bucket empty (its only album released 2025) — present, zero rows.
    expect(output.board.buckets[2].entries).toEqual([]);
  });
});
