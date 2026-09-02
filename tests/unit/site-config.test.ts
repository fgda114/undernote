/**
 * SiteConfig contract — the §7-approved optional field early_stage_threshold
 * (api-contracts §3.8): absent → default 6, present → value wins, invalid → reject.
 */
import { describe, expect, it } from 'vitest';
import { siteConfigSchema } from '../../src/lib/schema';

const base = { site_name: 'undernote', base_url: 'https://example.com', active_year: 2026 };

describe('early_stage_threshold (§7 가산 필드)', () => {
  it('부재 → 기본값 6 (기존 site.yaml 무수정 유효 — 하위 호환)', () => {
    const parsed = siteConfigSchema.parse(base);
    expect(parsed.early_stage_threshold).toBe(6);
  });

  it('명시값이 이긴다', () => {
    expect(siteConfigSchema.parse({ ...base, early_stage_threshold: 9 }).early_stage_threshold).toBe(9);
  });

  it('0 이하·비정수는 거부', () => {
    expect(siteConfigSchema.safeParse({ ...base, early_stage_threshold: 0 }).success).toBe(false);
    expect(siteConfigSchema.safeParse({ ...base, early_stage_threshold: 6.5 }).success).toBe(false);
  });
});
