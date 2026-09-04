/**
 * Derive-layer contract tests: listen links (manual precedence, {q}
 * encoding), release-date formatting (pure string math), excerpts and cover
 * sets — everything the review page renders verbatim.
 */
import { describe, expect, it } from 'vitest';
import { coverSetFor, derivedCoverPath } from '../../src/lib/covers';
import { excerptFrom } from '../../src/lib/derive/excerpt';
import { bucketLabelFor, formatReleaseDate } from '../../src/lib/derive/review-page';
import { buildListenLinks, defaultListenLinks } from '../../src/lib/listen-links';
import type { GenresConfig } from '../../src/lib/schema';

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

describe('formatReleaseDate — Date 객체 없이 문자열 연산만 (결정성)', () => {
  it.each([
    ['2026-05-01', '2026. 5. 1.'],
    ['2026-11', '2026. 11.'],
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
