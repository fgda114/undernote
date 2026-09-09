/**
 * GenresConfig year bound (R-8 rewrite, 2026-09-08) — the floor moved from
 * "site launch year" (2026) to a wide, calendar-independent typo guard, since
 * a year block's freeze is now decided by whether it has been finalized
 * (a snapshot exists), not by how it compares to today. See config.ts and
 * exceptions.md R-8.
 */
import { describe, expect, it } from 'vitest';
import { genresConfigSchema } from '../../src/lib/schema';

const yearBlock = (year: number) => ({
  years: [{ year, buckets: [{ id: 'pop', label: '팝', order: 1 }] }],
});

describe('genres.yaml — year 범위 (오타 방지용 하한/상한, 달력 무관)', () => {
  it('2026 이전 연도(소급 연도)도 통과한다 — R-8은 더 이상 달력을 근거로 막지 않는다', () => {
    expect(genresConfigSchema.safeParse(yearBlock(2025)).success).toBe(true);
    expect(genresConfigSchema.safeParse(yearBlock(2020)).success).toBe(true);
  });

  it('자릿수 빠진 오타(예: 202)는 거부된다', () => {
    const bad = genresConfigSchema.safeParse(yearBlock(202));
    expect(bad.success).toBe(false);
  });

  it('자릿수 넘친 오타(예: 20260)는 거부된다', () => {
    const bad = genresConfigSchema.safeParse(yearBlock(20260));
    expect(bad.success).toBe(false);
  });

  it('합리적 범위 안의 값은 통과한다', () => {
    expect(genresConfigSchema.safeParse(yearBlock(2000)).success).toBe(true);
    expect(genresConfigSchema.safeParse(yearBlock(2100)).success).toBe(true);
  });
});
