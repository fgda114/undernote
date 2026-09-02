/**
 * Contract tests for the Review schema (api-contracts §3.2) and the score
 * representation rule (ADR-0004).
 *
 * The fixture-file tests run real YAML parsing on purpose: the whole point
 * of string-stored scores is how YAML mangles numbers (8.30 → 8.3), and only
 * a parse round-trip can prove the schema catches that.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SCORE_PATTERN, scoreToTenths } from '../../src/lib/score';
import { reviewSchema } from '../../src/lib/schema/review';

/** Extract and parse YAML frontmatter from a markdown fixture. */
function loadFrontmatter(path: string): unknown {
  const raw = readFileSync(new URL(path, import.meta.url), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) throw new Error(`픽스처에 프론트매터가 없습니다: ${path}`);
  return parse(match[1]);
}

describe('Review 스키마 — 유효/무효 픽스처 쌍 (AC2)', () => {
  it('유효 픽스처는 통과한다', () => {
    const fm = loadFrontmatter('../fixtures/valid/fixture-artist-fixture-album.md');
    const result = reviewSchema.safeParse(fm);
    expect(result.success).toBe(true);
  });

  it('위반 픽스처(score: 8.35, 따옴표 없음)는 E-105 한국어 메시지로 실패한다', () => {
    const fm = loadFrontmatter('../fixtures/invalid/review-score-two-decimals.md');
    const result = reviewSchema.safeParse(fm);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('E-105');
      // Korean guidance, not raw system vocabulary (exceptions.md convention).
      expect(messages).toMatch(/수정|적으세요/);
    }
  });
});

describe('score 저장 규칙 — 문자열이어야 YAML 접힘이 검출된다 (ADR-0004)', () => {
  it('YAML은 따옴표 없는 8.30을 숫자 8.3으로 접는다 — number 저장이면 검출 불능이었을 케이스', () => {
    const parsed = parse('score: 8.30') as { score: unknown };
    expect(parsed.score).toBe(8.3); // the fold actually happens
    // …and the string-typed schema turns that fold into a build failure:
    const result = reviewSchema.safeParse({
      album: 'a-b',
      score: parsed.score,
      date: '2026-09-02',
      editorial_check: true,
    });
    expect(result.success).toBe(false);
  });

  it('문자열 "8.30"(소수 2자리)도 E-105로 거부된다', () => {
    expect(SCORE_PATTERN.test('8.30')).toBe(false);
  });

  it.each(['0.0', '5.5', '9.9', '10.0'])('경계값 "%s"는 유효하다', (s) => {
    expect(SCORE_PATTERN.test(s)).toBe(true);
  });

  it.each(['10.1', '11.0', '-1.0', '8', '8.', '.3', '08.3', '8,3', ''])(
    '"%s"는 무효하다',
    (s) => {
      expect(SCORE_PATTERN.test(s)).toBe(false);
    },
  );
});

describe('scoreToTenths — 유일한 점수 파서', () => {
  it.each([
    ['0.0', 0],
    ['8.3', 83],
    ['10.0', 100],
  ])('"%s" → %i', (s, n) => {
    expect(scoreToTenths(s)).toBe(n);
  });

  it('검증 안 된 값이 오면 던진다 (스키마 우회 = 버그)', () => {
    expect(() => scoreToTenths('8.35')).toThrow();
  });
});

describe('나머지 필드 게이트', () => {
  const valid = {
    album: 'fixture-artist-fixture-album',
    score: '8.3',
    date: '2026-09-02',
    editorial_check: true,
  };

  it('editorial_check가 true가 아니면 E-106', () => {
    const result = reviewSchema.safeParse({ ...valid, editorial_check: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message).join('\n')).toContain('E-106');
    }
  });

  it('editorial_check 부재도 E-106', () => {
    const { editorial_check: _omitted, ...rest } = valid;
    expect(reviewSchema.safeParse(rest).success).toBe(false);
  });

  it('slug 형식 위반은 E-107', () => {
    const result = reviewSchema.safeParse({ ...valid, album: 'Not_A_Slug' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message).join('\n')).toContain('E-107');
    }
  });

  it('date 형식 위반은 거부된다', () => {
    expect(reviewSchema.safeParse({ ...valid, date: '2026/09/02' }).success).toBe(false);
  });

  it('오타 필드(socre 등 미지 키)는 strict로 거부된다', () => {
    expect(reviewSchema.safeParse({ ...valid, socre: '8.3' }).success).toBe(false);
  });
});

describe('date 필드 — Astro YAML 파서의 Date 객체 정규화', () => {
  const valid = {
    album: 'fixture-artist-fixture-album',
    score: '8.3',
    editorial_check: true,
  };

  it('따옴표 없는 YAML date(→ Date 객체)는 YYYY-MM-DD 문자열로 정규화된다', () => {
    // Astro's frontmatter parser yields Date for `date: 2026-09-02` —
    // simulate that exact input (UTC midnight, as js-yaml constructs it).
    const result = reviewSchema.safeParse({
      ...valid,
      date: new Date(Date.UTC(2026, 8, 2)),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBe('2026-09-02');
  });

  it('문자열 "2026-09-02"도 그대로 유효하다', () => {
    const result = reviewSchema.safeParse({ ...valid, date: '2026-09-02' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBe('2026-09-02');
  });
});
