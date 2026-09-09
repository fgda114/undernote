/**
 * Ladder derivation tests (SS-9·10 · US-3·4·11): the 4 fallback modes —
 * especially "direct 0 + tag 1 + bucket 3 → tag ONE only" (stages never
 * mix) — publication-desc ordering, AlbumBox row states, and the
 * RETROACTIVE link (story first, review later → both sides link on the
 * next derivation, zero editing of the old story).
 */
import { describe, expect, it } from 'vitest';
import type { Entry, RepoData } from '../../src/lib/checker/load';
import { excerptFrom } from '../../src/lib/derive/excerpt';
import { deriveAlbumBoxRows, deriveBacklinks, prepareLadder } from '../../src/lib/derive/links';
import type { Album, Artist, ReviewFrontmatter, SiteConfig, Story } from '../../src/lib/schema';

function entry<T>(slug: string, data: T, body = '본문'): Entry<T> {
  return { slug, file: `fixture/${slug}`, data, body };
}

function albumOf(slug: string, over: Partial<Album> = {}): Entry<Album> {
  return entry<Album>(slug, {
    title: `앨범 ${slug}`,
    artists: ['artist-a'],
    release_date: '2026-01-01',
    buckets: ['pop'],
    tags: [],
    ...over,
  } as Album);
}

function storyOf(slug: string, date: string, albums: Story['albums'], tags: string[] = []): Entry<Story> {
  return entry<Story>(slug, { title: `이야기 ${slug}`, date, albums, tags }, `${slug} 요지.`);
}

function repoOf(input: Partial<RepoData>): RepoData {
  return {
    albums: [],
    reviews: [],
    stories: [],
    artists: [entry<Artist>('artist-a', { name: '아티스트A' })],
    snapshots: [],
    site: { site_name: 'undernote', base_url: 'https://example.com', active_year: 2026, og_use_cover: true, early_stage_threshold: 6 } as SiteConfig,
    genres: { years: [{ year: 2026, buckets: [{ id: 'pop', label: '팝', order: 1 }], min_reviews_to_publish: 3 }] },
    tags: { tags: [] },
    ...input,
  };
}

describe('폴백 사슬 4모드 (섞기 금지)', () => {
  const target = { slug: 'target', tags: ['city-pop'], buckets: ['pop'] };

  it('① 직접 참조 ≥1 → 전부, 발행 역순', () => {
    const repo = repoOf({
      albums: [albumOf('target')],
      stories: [
        storyOf('older', '2026-01-01', [{ ref: 'target' }]),
        storyOf('newer', '2026-02-01', [{ ref: 'target' }]),
      ],
    });
    const { stories, refIndex, albumBuckets } = prepareLadder(repo, excerptFrom);
    const result = deriveBacklinks(target, stories, refIndex, albumBuckets);
    expect(result.mode).toBe('direct');
    expect(result.stories.map((s) => s.url)).toEqual(['/stories/newer/', '/stories/older/']);
  });

  it('② 직접 0 + 태그 1 + 버킷 3 → 태그 1편만 (핵심 계약)', () => {
    const repo = repoOf({
      albums: [albumOf('target'), albumOf('same-bucket-1'), albumOf('same-bucket-2'), albumOf('same-bucket-3')],
      stories: [
        storyOf('tag-match', '2026-01-01', [], ['city-pop']),
        storyOf('bucket-1', '2026-02-01', [{ ref: 'same-bucket-1' }]),
        storyOf('bucket-2', '2026-02-02', [{ ref: 'same-bucket-2' }]),
        storyOf('bucket-3', '2026-02-03', [{ ref: 'same-bucket-3' }]),
      ],
    });
    const { stories, refIndex, albumBuckets } = prepareLadder(repo, excerptFrom);
    const result = deriveBacklinks(target, stories, refIndex, albumBuckets);
    expect(result.mode).toBe('tag');
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].url).toBe('/stories/tag-match/');
  });

  it('③ 태그도 0 → 같은 버킷 참조 이야기 최대 2편', () => {
    const repo = repoOf({
      albums: [albumOf('target', { tags: [] }), albumOf('b1'), albumOf('b2'), albumOf('b3')],
      stories: [
        storyOf('s1', '2026-01-01', [{ ref: 'b1' }]),
        storyOf('s2', '2026-01-02', [{ ref: 'b2' }]),
        storyOf('s3', '2026-01-03', [{ ref: 'b3' }]),
      ],
    });
    const { stories, refIndex, albumBuckets } = prepareLadder(repo, excerptFrom);
    const result = deriveBacklinks({ ...target, tags: [] }, stories, refIndex, albumBuckets);
    expect(result.mode).toBe('bucket');
    expect(result.stories).toHaveLength(2);
    expect(result.stories.map((s) => s.url)).toEqual(['/stories/s3/', '/stories/s2/']);
  });

  it('④ 전부 0 → mode none (영역 미표시)', () => {
    const repo = repoOf({ albums: [albumOf('target')] });
    const { stories, refIndex, albumBuckets } = prepareLadder(repo, excerptFrom);
    expect(deriveBacklinks(target, stories, refIndex, albumBuckets).mode).toBe('none');
  });
});

describe('AlbumBox 행 상태 (안 A · US-4)', () => {
  const story: Story = {
    title: '이야기',
    date: '2026-05-01',
    albums: [
      { ref: 'reviewed-album' },
      { ref: 'pending-album' },
      { text: '미등록 명반', artist: '어떤 아티스트' },
    ],
    tags: [],
  };
  const repo = repoOf({
    albums: [albumOf('reviewed-album'), albumOf('pending-album')],
    reviews: [
      entry<ReviewFrontmatter>('reviewed-album', {
        album: 'reviewed-album',
        score: '8.0',
        date: '2026-04-01',
        editorial_check: true,
      }),
    ],
  });
  const rows = deriveAlbumBoxRows(story, repo);

  it('평론 있음 → 링크 / 없음·미등록 → 링크 없음 (유사 링크 금지)', () => {
    expect(rows).toHaveLength(3);
    expect(rows[0].reviewUrl).toBe('/reviews/reviewed-album/');
    expect(rows[1].reviewUrl).toBeNull();
    expect(rows[2].reviewUrl).toBeNull();
    expect(rows[2].title).toBe('미등록 명반');
    expect(rows[2].meta).toBe('어떤 아티스트');
  });

  it('소급: 평론이 나중에 발행되면 다음 도출에서 링크로 승격 (원 수정 0)', () => {
    const upgraded = repoOf({
      albums: repo.albums,
      reviews: [
        ...repo.reviews,
        entry<ReviewFrontmatter>('pending-album', {
          album: 'pending-album',
          score: '7.0',
          date: '2026-06-01',
          editorial_check: true,
        }),
      ],
    });
    const after = deriveAlbumBoxRows(story, upgraded);
    expect(after[1].reviewUrl).toBe('/reviews/pending-album/');
    // …and the review side gains the direct backlink simultaneously.
    const { stories, refIndex, albumBuckets } = prepareLadder(
      { ...upgraded, stories: [entry<Story>('the-story', story, '요지.')] },
      excerptFrom,
    );
    const back = deriveBacklinks({ slug: 'pending-album', tags: [], buckets: ['pop'] }, stories, refIndex, albumBuckets);
    expect(back.mode).toBe('direct');
    expect(back.stories[0].url).toBe('/stories/the-story/');
  });
});
