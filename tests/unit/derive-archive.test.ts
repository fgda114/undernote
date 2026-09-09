/**
 * Archive index + artist aggregation contract tests (SS-11 · SS-12):
 * publication-year attribution, etc grouping, canonical tags, multi-artist
 * full aggregation, empty axes absent, and the score-free data contract.
 * Plus E-113 orphan detection (unreferenced artist).
 */
import { describe, expect, it } from 'vitest';
import type { Entry, RepoData } from '../../src/lib/checker/load';
import { bucketLabelMap, deriveArchiveIndex, deriveArtistIndex, deriveHubIndex, detectOrphans, ETC_BUCKET_LABEL } from '../../src/lib/derive/archive';
import type { ArticleItem } from '../../src/lib/derive/lists';
import type { Album, Artist, ReviewFrontmatter, SiteConfig, Story } from '../../src/lib/schema';

function entry<T>(slug: string, data: T, body = '본문'): Entry<T> {
  return { slug, file: `fixture/${slug}`, data, body };
}

const repo: RepoData = {
  albums: [
    entry<Album>('duo-album', {
      title: '듀오 앨범',
      artists: ['artist-a', 'artist-b'],
      release_date: '2025-04-01', // released 2025…
      buckets: ['etc'],
      tags: ['city-pop'],
    }),
    entry<Album>('solo-album', {
      title: '솔로 앨범',
      artists: ['artist-a'],
      release_date: '2026-01-01',
      buckets: ['pop'],
      tags: [],
    }),
  ],
  reviews: [
    // …but REVIEWED in 2026 → year axis puts it under 2026 (publication, R-3).
    entry<ReviewFrontmatter>('duo-album', { album: 'duo-album', score: '8.3', date: '2026-02-01', editorial_check: true }),
    entry<ReviewFrontmatter>('solo-album', { album: 'solo-album', score: '7.5', date: '2026-03-01', editorial_check: true }),
  ],
  stories: [
    entry<Story>('duo-story', {
      title: '듀오 이야기',
      date: '2026-04-01',
      albums: [{ ref: 'duo-album' }],
      tags: ['city-pop'],
    }),
  ],
  artists: [
    entry<Artist>('artist-a', { name: 'A' }),
    entry<Artist>('artist-b', { name: 'B' }),
    entry<Artist>('orphan-artist', { name: '고아' }), // referenced by nothing
  ],
  snapshots: [],
  site: { site_name: 'undernote', base_url: 'https://example.com', active_year: 2026, og_use_cover: true, early_stage_threshold: 6 } as SiteConfig,
  genres: { years: [{ year: 2026, buckets: [{ id: 'pop', label: '팝', order: 1 }], min_reviews_to_publish: 3 }] },
  tags: { tags: [{ slug: 'city-pop', label: '시티팝', aliases: [] }] },
};

const index = deriveArchiveIndex(repo);

describe('4축 역인덱스', () => {
  it('연도 축은 발행 연도 기준 (2025 발매·2026 평론 → 2026)', () => {
    expect([...index.by_year.keys()]).toEqual(['2026']);
    expect(index.by_year.get('2026')).toHaveLength(3); // 평론 2 + 이야기 1
  });

  it('버킷 축: etc는 "etc" 그룹 (지면 라벨 "그 외")', () => {
    expect(index.by_bucket.get('etc')?.map((i) => i.url)).toEqual(['/reviews/duo-album/']);
    expect(ETC_BUCKET_LABEL).toBe('그 외');
  });

  it('태그 축: canonical slug — 평론과 이야기가 함께 편입', () => {
    expect(index.by_tag.get('city-pop')?.map((i) => i.type).sort()).toEqual(['review', 'story']);
  });

  it('아티스트 축: 복수 아티스트 전원 집계 + 이야기는 참조 앨범 경유', () => {
    expect(index.by_artist.get('artist-a')?.map((i) => i.url)).toEqual([
      '/stories/duo-story/', // date desc
      '/reviews/solo-album/',
      '/reviews/duo-album/',
    ]);
    expect(index.by_artist.get('artist-b')?.map((i) => i.url)).toEqual(['/stories/duo-story/', '/reviews/duo-album/']);
  });

  it('빈 축 값은 존재하지 않는다 (R-4)', () => {
    expect(index.by_year.has('2025')).toBe(false);
    expect(index.by_tag.size).toBe(1);
  });

  it('ArchiveItem에 score 키가 없다 (D2 데이터 계약)', () => {
    for (const items of index.by_year.values()) {
      for (const item of items) expect(Object.keys(item).sort()).toEqual(['date', 'title', 'type', 'url']);
    }
  });
});

describe('deriveArtistIndex — /artists/ 인덱스 (2026-09-07)', () => {
  it('형식별 편수를 각각 센다 (평론·이야기는 다른 작업물)', () => {
    const entries = deriveArtistIndex(repo, index);
    expect(entries.map((e) => [e.slug, e.reviews, e.stories])).toEqual([
      ['artist-a', 2, 1],
      ['artist-b', 1, 1],
    ]);
  });

  it('고아 아티스트는 목록에 들어올 수 없다 (E-113이 빌드를 막는 대상)', () => {
    expect(deriveArtistIndex(repo, index).map((e) => e.slug)).not.toContain('orphan-artist');
  });

  it('표시명 코드포인트 오름차순 — 라틴 블록이 한글 블록보다 앞', () => {
    // localeCompare would order these by the runner's ICU tables and could
    // differ between machines, which the double-build hash gate would catch
    // as nondeterminism (R-10). Code-point order is one fixed answer.
    const named: RepoData = {
      ...repo,
      artists: [
        entry<Artist>('a1', { name: '한글가' }),
        entry<Artist>('a2', { name: 'Zebra' }),
        entry<Artist>('a3', { name: 'Apple' }),
        entry<Artist>('a4', { name: '한글나' }),
      ],
    };
    const idx = { ...index, by_artist: new Map(['a1', 'a2', 'a3', 'a4'].map((k) => [k, index.by_artist.get('artist-b')!])) };
    expect(deriveArtistIndex(named, idx).map((e) => e.name)).toEqual(['Apple', 'Zebra', '한글가', '한글나']);
  });

  it('동명이인은 slug로 갈린다 (전순서 — 빌드마다 같은 순서)', () => {
    const dupes: RepoData = {
      ...repo,
      artists: [entry<Artist>('zz', { name: '같은 이름' }), entry<Artist>('aa', { name: '같은 이름' })],
    };
    const idx = { ...index, by_artist: new Map(['zz', 'aa'].map((k) => [k, index.by_artist.get('artist-b')!])) };
    expect(deriveArtistIndex(dupes, idx).map((e) => e.slug)).toEqual(['aa', 'zz']);
  });
});

describe('bucketLabelMap — 버킷 id → 라벨 (연도 축 아카이브·검색 허브 공용, 2026-09-09)', () => {
  it('설정된 버킷 id는 라벨로 조회된다', () => {
    expect(bucketLabelMap(repo).get('pop')).toBe('팝');
  });

  it('etc처럼 config에 없는 id는 매핑에 없다 (호출부가 ETC_BUCKET_LABEL로 따로 처리)', () => {
    expect(bucketLabelMap(repo).has('etc')).toBe(false);
  });
});

describe('deriveHubIndex — /archive/ 검색 허브 (search-hub design, 2026-09-09)', () => {
  // Hand-built ArticleItem[] rather than deriveLatestArticles' full pipeline
  // — this function only needs url/title/date/formatLabel to attach facets
  // and build the haystack, so the fixture stays minimal and isolated.
  const allArticles: ArticleItem[] = [
    { type: 'story', url: '/stories/duo-story/', title: '듀오 이야기', subtitle: '', date: '2026-04-01', formatLabel: 'Notes' },
    { type: 'review', url: '/reviews/solo-album/', title: '솔로 앨범', subtitle: 'A', date: '2026-03-01', formatLabel: 'Reviews' },
    { type: 'review', url: '/reviews/duo-album/', title: '듀오 앨범', subtitle: 'A · B', date: '2026-02-01', formatLabel: 'Reviews' },
  ];
  const hub = deriveHubIndex(repo, index, allArticles);

  it('행 수 = allArticles 그대로 — 허브가 곧 색인이라 별도 필터링이 없다', () => {
    expect(hub).toHaveLength(3);
  });

  it('리뷰 행에 발행 연도·장르(버킷)·태그·아티스트 라벨이 붙는다', () => {
    const duo = hub.find((h) => h.item.url === '/reviews/duo-album/')!;
    expect(duo.year).toBe('2026');
    expect(duo.genres).toEqual([ETC_BUCKET_LABEL]); // duo-album의 버킷은 'etc'
    expect(duo.tags).toEqual(['시티팝']);
    expect(duo.artists.sort()).toEqual(['A', 'B']); // 복수 아티스트 전원

    const solo = hub.find((h) => h.item.url === '/reviews/solo-album/')!;
    expect(solo.genres).toEqual(['팝']); // 'pop' 버킷 라벨
    expect(solo.tags).toEqual([]); // solo-album은 태그 없음
  });

  it('이야기 행은 장르 축이 없고(버킷은 리뷰만 가짐) 참조 앨범 경유로 아티스트를 얻는다', () => {
    const story = hub.find((h) => h.item.url === '/stories/duo-story/')!;
    expect(story.genres).toEqual([]);
    expect(story.artists.sort()).toEqual(['A', 'B']);
    expect(story.tags).toEqual(['시티팝']);
  });

  it('haystack은 제목·아티스트·연도·장르·태그·형식을 소문자로 이어붙인 것', () => {
    const duo = hub.find((h) => h.item.url === '/reviews/duo-album/')!;
    for (const part of ['듀오 앨범', 'a', 'b', '2026', ETC_BUCKET_LABEL, '시티팝', 'reviews']) {
      expect(duo.haystack, `haystack에 "${part}" 없음: ${duo.haystack}`).toContain(part);
    }
    // 원래 대소문자('Reviews')는 haystack에 남지 않는다 — 대소문자 무관 매치의 전제.
    expect(duo.haystack).not.toContain('Reviews');
  });
});

describe('E-113 — 고아 검사 확정판', () => {
  it('무참조 아티스트만 고아로 잡힌다', () => {
    const findings = detectOrphans(repo, index);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('E-113');
    expect(findings[0].message).toContain('orphan-artist');
  });
});
