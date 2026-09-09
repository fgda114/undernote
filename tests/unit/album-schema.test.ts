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
