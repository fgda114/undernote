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

describe('goatcounter_code (§7 가산 필드 — JS 0 옵트인 예외)', () => {
  it('부재 허용 (기본 = 계측 미설치·스크립트 0)', () => {
    expect(siteConfigSchema.parse(base).goatcounter_code).toBeUndefined();
  });

  it('유효 코드 통과, 형식 위반은 한국어 메시지로 거부', () => {
    expect(siteConfigSchema.parse({ ...base, goatcounter_code: 'my-site1' }).goatcounter_code).toBe('my-site1');
    const bad = siteConfigSchema.safeParse({ ...base, goatcounter_code: 'My_Site!' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toContain('goatcounter_code');
  });
});
