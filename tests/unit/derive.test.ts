/**
 * Derive-layer contract tests: listen links (manual precedence, {q}
 * encoding), release-date formatting (pure string math), excerpts and cover
 * sets — everything the review page renders verbatim.
 */
import { describe, expect, it } from 'vitest';
import { coverSetFor, derivedCoverPath } from '../../src/lib/covers';
import { excerptFrom } from '../../src/lib/derive/excerpt';
import { buildReviewPageData, bucketLabelFor, formatReleaseDate, otherWorkByArtist } from '../../src/lib/derive/review-page';
import type { ArchiveItem } from '../../src/lib/derive/archive';
import type { ArticleItem } from '../../src/lib/derive/lists';
import { buildListenLinks, defaultListenLinks } from '../../src/lib/listen-links';
import type { Album, Artist, GenresConfig, ReviewFrontmatter, SiteConfig } from '../../src/lib/schema';

describe('listen-links (SS-13)', () => {
  const album = { title: 'OK Computer', artistsLabel: 'Radiohead' };

  it('자동 검색형 링크가 패턴 정의 순서로 생성된다', () => {
    const links = buildListenLinks(album);
    expect(links.map((l) => l.service)).toEqual(['youtube-music', 'spotify', 'apple-music']);
    expect(links[0].url).toBe('https://music.youtube.com/search?q=Radiohead%20OK%20Computer');
  });

  it('{q}는 URL 인코딩된 "아티스트 앨범명"', () => {
    const links = buildListenLinks({ title: 'A&B?', artistsLabel: '아티스트' });
    expect(links[0].url).toContain(encodeURIComponent('아티스트 A&B?'));
  });

  it('수기 링크가 해당 서비스의 자동 링크를 대체한다', () => {
    const links = buildListenLinks({
      ...album,
      listen_links: [{ service: 'spotify', url: 'https://open.spotify.com/album/xyz' }],
    });
    const spotify = links.find((l) => l.service === 'spotify');
    expect(spotify?.url).toBe('https://open.spotify.com/album/xyz');
    expect(links).toHaveLength(3); // replacement, not addition
  });

  it('패턴에 없는 수기 서비스(other)는 뒤에 붙는다', () => {
    const links = buildListenLinks({
      ...album,
      listen_links: [{ service: 'other', url: 'https://bandcamp.com/x' }],
    });
    expect(links.at(-1)).toMatchObject({ service: 'other', url: 'https://bandcamp.com/x' });
  });

  it('패턴이 빈 객체면 수기 링크만 남는다 (E-205 판정의 전제)', () => {
    expect(buildListenLinks(album, {})).toEqual([]);
  });

  it('기본 패턴 3종이 계약(§6.3)과 일치한다', () => {
    expect(Object.keys(defaultListenLinks)).toEqual(['youtube-music', 'spotify', 'apple-music']);
  });
});

// 2026-09-09 (decision-maker request): ISO verbatim, not a Korean-style
// dotted date — Release and Reviewed now render the exact same format so
// the two sit-side-by-side dates in SpecMeta are directly comparable (see
// formatReleaseDate's own doc comment in review-page.ts). Still an identity
// transform test, not a Date/locale one: every granularity release_date can
// actually store (YYYY / YYYY-MM / YYYY-MM-DD) must survive unchanged, with
// nothing invented for a missing month/day.
describe('formatReleaseDate — ISO 그대로, Reviewed와 표기 통일 (결정성)', () => {
  it.each([
    ['2026-05-01', '2026-05-01'],
    ['2026-11', '2026-11'],
    ['2026', '2026'],
  ])('%s → %s', (input, expected) => {
    expect(formatReleaseDate(input)).toBe(expected);
  });
});

describe('bucketLabelFor', () => {
  const genres: GenresConfig = {
    years: [
      {
        year: 2026,
        buckets: [{ id: 'pop', label: '팝', order: 1 }],
        min_reviews_to_publish: 3,
      },
    ],
  };

  it('발매 연도 블록에서 라벨을 찾는다', () => {
    expect(bucketLabelFor('pop', 2026, genres)).toBe('팝');
  });

  it('etc는 예약 라벨 "그 외"', () => {
    expect(bucketLabelFor('etc', 2026, genres)).toBe('그 외');
  });

  it('구반(연도 블록 없음)도 전 연도 합집합에서 라벨 해석 — raw id 노출 금지 (M-4)', () => {
    expect(bucketLabelFor('pop', 2020, genres)).toBe('팝');
  });
});

describe('buildReviewPageData — subtitle pass-through (2026-09-09, 앨범 스키마 §7 추가 필드)', () => {
  const genres: GenresConfig = {
    years: [{ year: 2026, buckets: [{ id: 'rock', label: '록', order: 1 }], min_reviews_to_publish: 3 }],
  };
  const site = { site_name: 'undernote', base_url: 'https://example.com', active_year: 2026, og_use_cover: true, early_stage_threshold: 6 } as SiteConfig;
  const review: ReviewFrontmatter = { album: 'lost-weekend', score: '8.4', date: '2026-05-01', editorial_check: true };
  const artists = new Map<string, Artist>([['phoebe-bridgers', { name: 'Phoebe Bridgers' }]]);
  const baseAlbum: Album = {
    title: 'Lost Weekend',
    artists: ['phoebe-bridgers'],
    release_date: '2026-05-01',
    buckets: ['rock'],
    tags: [],
  };

  it('subtitle이 있으면 그대로 전달된다', () => {
    const data = buildReviewPageData({
      slug: 'lost-weekend',
      review,
      album: { ...baseAlbum, subtitle: 'The 3rd Studio Album' },
      artists,
      genres,
      site,
    });
    expect(data.subtitle).toBe('The 3rd Studio Album');
  });

  it('subtitle이 없으면 undefined — 지면이 그 줄 자체를 생략할 수 있다', () => {
    const data = buildReviewPageData({ slug: 'lost-weekend', review, album: baseAlbum, artists, genres, site });
    expect(data.subtitle).toBeUndefined();
  });
});

describe('buildReviewPageData — duration pass-through (2026-09-09, 앨범 스키마 §7 추가 필드)', () => {
  const genres: GenresConfig = {
    years: [{ year: 2026, buckets: [{ id: 'rock', label: '록', order: 1 }], min_reviews_to_publish: 3 }],
  };
  const site = { site_name: 'undernote', base_url: 'https://example.com', active_year: 2026, og_use_cover: true, early_stage_threshold: 6 } as SiteConfig;
  const review: ReviewFrontmatter = { album: 'lost-weekend', score: '8.4', date: '2026-05-01', editorial_check: true };
  const artists = new Map<string, Artist>([['phoebe-bridgers', { name: 'Phoebe Bridgers' }]]);
  const baseAlbum: Album = {
    title: 'Lost Weekend',
    artists: ['phoebe-bridgers'],
    release_date: '2026-05-01',
    buckets: ['rock'],
    tags: [],
  };

  it('duration이 있으면 그대로(포맷 재가공 없이) 전달된다', () => {
    const data = buildReviewPageData({ slug: 'lost-weekend', review, album: { ...baseAlbum, duration: '52:26' }, artists, genres, site });
    expect(data.duration).toBe('52:26');
  });

  it('duration이 없으면 undefined — 지면이 그 줄 자체를 생략할 수 있다', () => {
    const data = buildReviewPageData({ slug: 'lost-weekend', review, album: baseAlbum, artists, genres, site });
    expect(data.duration).toBeUndefined();
  });
});

describe('buildReviewPageData — releaseYear (2026-09-09, SpecMeta Release 링크용)', () => {
  const genres: GenresConfig = {
    years: [{ year: 2026, buckets: [{ id: 'rock', label: '록', order: 1 }], min_reviews_to_publish: 3 }],
  };
  const site = { site_name: 'undernote', base_url: 'https://example.com', active_year: 2026, og_use_cover: true, early_stage_threshold: 6 } as SiteConfig;
  const artists = new Map<string, Artist>([['phoebe-bridgers', { name: 'Phoebe Bridgers' }]]);

  it('발매 연도를 4자리 문자열로 뽑는다 — releaseDateText와 별도 필드', () => {
    const review: ReviewFrontmatter = { album: 'old-classic', score: '9.0', date: '2026-08-01', editorial_check: true };
    const album: Album = {
      title: 'Old Classic',
      artists: ['phoebe-bridgers'],
      release_date: '1975-11-14', // back-catalog — release year ≠ review year
      buckets: ['rock'],
      tags: [],
    };
    const data = buildReviewPageData({ slug: 'old-classic', review, album, artists, genres, site });
    expect(data.releaseYear).toBe('1975');
    expect(data.reviewDate).toBe('2026-08-01'); // the two years genuinely differ
  });
});

describe('excerptFrom — og:description 원료', () => {
  it('첫 문단을 평문으로 뽑는다 (링크·강조 제거)', () => {
    const body = '\n\n**강조**와 [링크](https://x.com)가 있는 첫 문단.\n\n둘째 문단.';
    expect(excerptFrom(body)).toBe('강조와 링크가 있는 첫 문단.');
  });

  it('길면 단어 경계에서 끊고 말줄임', () => {
    const body = `${'가나다 '.repeat(100)}`;
    const out = excerptFrom(body, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
  });

  it('빈 본문 → 빈 문자열', () => {
    expect(excerptFrom('')).toBe('');
  });
});

describe('coverSetFor (ADR-0008 §3)', () => {
  it('커버 없으면 null (E-202 경로 — 렌더러가 플레이스홀더)', () => {
    expect(coverSetFor({ slug: 'a', title: 'T', artistsLabel: 'A' })).toBeNull();
  });

  it('파생 경로·출처 표기 alt·원본 폴백을 만든다', () => {
    const set = coverSetFor({ slug: 'a-b', title: '앨범', artistsLabel: '아티스트', cover: 'covers/a-b.jpg' });
    expect(set).toMatchObject({
      w96: '/covers/derived/a-b-w96.webp',
      w640: '/covers/derived/a-b-w640.webp',
      alt: '앨범 — 아티스트 앨범 커버',
      fallback: '/covers/a-b.jpg',
    });
    expect(derivedCoverPath('a-b', 320)).toBe('/covers/derived/a-b-w320.webp');
  });
});

describe('otherWorkByArtist — "{아티스트}의 다른 글" (§2.5 ②, W6 m-4 — 페이지에서 이관)', () => {
  function article(url: string): ArticleItem {
    return { type: 'review', url, title: url, subtitle: '', date: '2026-01-01', formatLabel: 'Reviews' };
  }
  function archiveItem(url: string, date: string): ArchiveItem {
    return { type: 'review', url, title: url, date };
  }

  it('공유 아티스트(듀오 앨범 등)가 여러 아티스트 축에 걸쳐도 한 번만 나온다', () => {
    const shared = archiveItem('/reviews/duo/', '2026-03-01');
    const byArtist = new Map([
      ['artist-a', [shared]],
      ['artist-b', [shared]],
    ]);
    const articleByUrl = new Map([['/reviews/duo/', article('/reviews/duo/')]]);
    const result = otherWorkByArtist('/reviews/current/', ['artist-a', 'artist-b'], byArtist, articleByUrl);
    expect(result).toHaveLength(1);
  });

  it('현재 평론 자신은 제외된다', () => {
    const byArtist = new Map([['artist-a', [archiveItem('/reviews/current/', '2026-01-01')]]]);
    const articleByUrl = new Map([['/reviews/current/', article('/reviews/current/')]]);
    expect(otherWorkByArtist('/reviews/current/', ['artist-a'], byArtist, articleByUrl)).toEqual([]);
  });

  it('아카이브 순서(발행일 내림차순)를 그대로 유지한다', () => {
    const byArtist = new Map([
      ['artist-a', [archiveItem('/reviews/newer/', '2026-05-01'), archiveItem('/reviews/older/', '2026-01-01')]],
    ]);
    const articleByUrl = new Map([
      ['/reviews/newer/', article('/reviews/newer/')],
      ['/reviews/older/', article('/reviews/older/')],
    ]);
    const result = otherWorkByArtist('/reviews/current/', ['artist-a'], byArtist, articleByUrl);
    expect(result.map((a) => a.url)).toEqual(['/reviews/newer/', '/reviews/older/']);
  });

  it('articleByUrl에 없는 항목은 조용히 걸러진다 (방어적 filter(Boolean))', () => {
    const byArtist = new Map([['artist-a', [archiveItem('/reviews/missing/', '2026-01-01')]]]);
    expect(otherWorkByArtist('/reviews/current/', ['artist-a'], byArtist, new Map())).toEqual([]);
  });
});
