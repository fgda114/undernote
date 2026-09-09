/**
 * Contract tests for the Album schema (api-contracts §3.1), focused on
 * E-118 (`src/lib/schema/album.ts#albumSchema`'s `superRefine` on `buckets`)
 * — code review MJ-3 found this gate had ZERO tests anywhere in the repo, so
 * a refactor could silently break it (e.g. a zod upgrade reordering
 * `.strict()`/`.superRefine()`) with CI staying green throughout.
 */
import { describe, expect, it } from 'vitest';
import { albumSchema } from '../../src/lib/schema/album';

describe('Album 스키마 — E-118 (buckets 자기모순 게이트)', () => {
  const valid = {
    title: 'Lost Weekend',
    artists: ['phoebe-bridgers'],
    release_date: '2026',
    buckets: ['rock'],
  };

  it('정상 입력(단일 버킷)은 통과한다', () => {
    const result = albumSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('정상 입력(복수의 서로 다른 버킷, MULTI-GENRE)도 통과한다', () => {
    const result = albumSchema.safeParse({ ...valid, buckets: ['rock', 'pop'] });
    expect(result.success).toBe(true);
  });

  it('정상 입력("etc" 단독)도 통과한다', () => {
    const result = albumSchema.safeParse({ ...valid, buckets: ['etc'] });
    expect(result.success).toBe(true);
  });

  it('중복된 버킷 id는 E-118로 거부된다', () => {
    const result = albumSchema.safeParse({ ...valid, buckets: ['rock', 'rock'] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('E-118');
      expect(messages).toMatch(/중복/);
    }
  });

  it('"etc"와 실제 버킷의 혼합은 E-118로 거부된다', () => {
    const result = albumSchema.safeParse({ ...valid, buckets: ['etc', 'rock'] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('E-118');
      expect(messages).toMatch(/etc/);
    }
  });
});

describe('Album 스키마 — subtitle (선택 필드, 2026-09-09 추가, 하위호환)', () => {
  const valid = {
    title: 'Lost Weekend',
    artists: ['phoebe-bridgers'],
    release_date: '2026',
    buckets: ['rock'],
  };

  it('subtitle이 없어도 통과한다 (기존 앨범 파일과의 하위호환)', () => {
    const result = albumSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subtitle).toBeUndefined();
  });

  it('subtitle이 있으면 그대로 통과한다', () => {
    const result = albumSchema.safeParse({ ...valid, subtitle: 'The 3rd Studio Album' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subtitle).toBe('The 3rd Studio Album');
  });

  it('subtitle이 빈 문자열이면 거부된다 (빈 줄을 렌더하느니 필드 생략을 요구)', () => {
    const result = albumSchema.safeParse({ ...valid, subtitle: '' });
    expect(result.success).toBe(false);
  });
});

describe('Album 스키마 — duration (선택 필드, 2026-09-09 추가, 하위호환)', () => {
  const valid = {
    title: 'Lost Weekend',
    artists: ['phoebe-bridgers'],
    release_date: '2026',
    buckets: ['rock'],
  };

  it('duration이 없어도 통과한다 (기존 앨범 파일과의 하위호환)', () => {
    const result = albumSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.duration).toBeUndefined();
  });

  it('"52:26"처럼 총 분:초 형식이면 통과한다', () => {
    const result = albumSchema.safeParse({ ...valid, duration: '52:26' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.duration).toBe('52:26');
  });

  it('1시간을 넘는 앨범도 "H:MM:SS"가 아니라 분이 60을 넘는 형태로 통과한다', () => {
    const result = albumSchema.safeParse({ ...valid, duration: '92:15' });
    expect(result.success).toBe(true);
  });

  it('초가 60 이상이면 거부된다', () => {
    const result = albumSchema.safeParse({ ...valid, duration: '52:60' });
    expect(result.success).toBe(false);
  });

  it('"H:MM:SS" 형식(콜론 2개)은 거부된다 — 총 분:초 형식만 받는다', () => {
    const result = albumSchema.safeParse({ ...valid, duration: '1:32:15' });
    expect(result.success).toBe(false);
  });

  it('빈 문자열은 거부된다', () => {
    const result = albumSchema.safeParse({ ...valid, duration: '' });
    expect(result.success).toBe(false);
  });
});
