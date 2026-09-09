/**
 * MB client + scaffold contract tests. The client is tested against MOCK
 * fetch responses (build-plan rule: no live MB calls in tests — rate-limit
 * etiquette; real API gets a manual smoke only).
 */
import { describe, expect, it, vi } from 'vitest';
import { luceneEscape, MbClient, MB_USER_AGENT } from '../../src/lib/mb/client';
import { albumYaml, artistMarkdown, creditNames, releaseDateFrom, slugify } from '../../src/lib/mb/scaffold';
import { type MbReleaseGroup } from '../../src/lib/mb/types';
import { parse as parseYaml } from 'yaml';
import { albumSchema } from '../../src/lib/schema';

const searchFixture = {
  'release-groups': [
    {
      id: 'mbid-1234',
      title: 'Fixture Album',
      'first-release-date': '2026-05-01',
      'artist-credit': [{ name: 'Fixture Artist', artist: { id: 'a1', name: 'Fixture Artist' } }],
      score: 100,
    },
  ],
};

function mockFetch(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('MbClient — 목 응답 기반', () => {
  it('검색이 release-group 배열을 돌려주고 UA·fmt=json을 보낸다', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toContain('fmt=json');
      expect((init?.headers as Record<string, string>)['User-Agent']).toBe(MB_USER_AGENT);
      return new Response(JSON.stringify(searchFixture), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new MbClient({ fetchFn, minIntervalMs: 0 });
    const hits = await client.searchReleaseGroups('Fixture Artist', 'Fixture Album');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('mbid-1234');
  });

  it('503은 server 오류(E-403 경로)로 분류된다', async () => {
    const client = new MbClient({ fetchFn: mockFetch(503), minIntervalMs: 0 });
    await expect(client.searchReleaseGroups('a', 'b')).rejects.toMatchObject({ kind: 'server' });
  });

  it('CAA 404는 null (E-404 — 오류 아님, 플레이스홀더 경로)', async () => {
    const client = new MbClient({ fetchFn: mockFetch(404), minIntervalMs: 0 });
    await expect(client.fetchCoverFront('mbid-1234')).resolves.toBeNull();
  });

  it('연속 요청 사이에 최소 간격을 강제한다 (1 req/s 정책)', async () => {
    const stamps: number[] = [];
    const fetchFn = vi.fn(async () => {
      stamps.push(Date.now());
      return new Response(JSON.stringify(searchFixture), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new MbClient({ fetchFn, minIntervalMs: 120 });
    await client.searchReleaseGroups('a', 'b');
    await client.searchReleaseGroups('a', 'b');
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(110);
  });

  it('luceneEscape가 특수문자를 이스케이프한다', () => {
    expect(luceneEscape('AC/DC (Live!)')).toBe('AC\\/DC \\(Live\\!\\)');
  });
});

describe('scaffold — MB 응답 → 파일 내용', () => {
  const rg = searchFixture['release-groups'][0] as MbReleaseGroup;

  it('creditNames·releaseDateFrom 매핑', () => {
    expect(creditNames(rg)).toEqual(['Fixture Artist']);
    expect(releaseDateFrom(rg)).toBe('2026-05-01');
  });

  it('albumYaml 산출물이 Album 스키마를 통과한다 (도구가 만든 파일이 게이트에 걸리면 안 된다)', () => {
    const yaml = albumYaml({
      title: 'Fixture Album',
      artistSlugs: ['fixture-artist'],
      releaseDate: '2026-05-01',
      buckets: ['pop'],
      mbid: 'mbid-1234',
      cover: 'covers/fixture-artist-fixture-album.jpg',
      coverSource: 'https://coverartarchive.org/...',
    });
    const parsed = albumSchema.safeParse(parseYaml(yaml));
    expect(parsed.success).toBe(true);
  });

  it('release_date가 문자열로 저장된다 (YAML 숫자 접힘 방지)', () => {
    const yaml = albumYaml({ title: 'T', artistSlugs: ['a'], releaseDate: '2026', buckets: ['etc'] });
    expect(yaml).toContain('"2026"');
  });

  it('artistMarkdown이 Artist 스키마 통과 프론트매터를 만든다', () => {
    expect(artistMarkdown('픽스처 "아티스트"')).toContain('name: "픽스처 \\"아티스트\\""');
  });

  it('slugify — 한글만 있으면 빈 문자열 (CLI가 수기 입력을 요구해야 함)', () => {
    expect(slugify('픽스처 아티스트')).toBe('');
    expect(slugify('Beyoncé & JAY-Z')).toBe('beyonce-and-jay-z');
    expect(slugify('  The Album!!  ')).toBe('the-album');
  });
});
