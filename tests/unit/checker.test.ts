/**
 * Checker pre-pass contract tests (sequence B-1):
 *  - the valid fixture repo yields zero failures;
 *  - the invalid fixture repo yields EVERY expected code in ONE aggregated
 *    pass (never stops at the first failure — that is the B-1 promise);
 *  - messages are Korean and carry the file path + how to fix.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatReport, runPrePass } from '../../src/lib/checker';

const fixtureRoot = (name: string) =>
  fileURLToPath(new URL(`../fixtures/${name}/`, import.meta.url));

describe('유효 저장소 — 실패 0', () => {
  const { result } = runPrePass(fixtureRoot('valid-repo'));

  it('failures가 없다', () => {
    expect(result.failures).toEqual([]);
  });

  it('커버가 있는 앨범은 E-202 경고가 없다', () => {
    expect(result.failures.map((f) => f.code)).not.toContain('E-202');
    expect(result.warnings.map((f) => f.code)).not.toContain('E-202');
  });
});

describe('무효 저장소 — 전 코드가 한 번의 패스로 모인다 (B-1)', () => {
  const { result } = runPrePass(fixtureRoot('invalid-repo'));
  const failureCodes = result.failures.map((f) => f.code);
  const warningCodes = result.warnings.map((f) => f.code);

  it.each([
    ['E-100', '미지 필드(socre 오타)'],
    ['E-101', '빈 본문 평론'],
    ['E-102', '앨범 참조 불실존'],
    ['E-103', '아티스트 참조 불실존'],
    ['E-104', '발매 연도 설정에 없는 버킷'],
    ['E-105', '소수 2자리 점수'],
    ['E-106', 'editorial_check false'],
    ['E-107', '파일명 slug 위반'],
    ['E-108', '파일명 ≠ album 필드'],
    ['E-114', '동일 연도 중복 스냅샷'],
  ])('%s (%s)가 실패로 잡힌다', (code) => {
    expect(failureCodes).toContain(code);
  });

  it.each([
    ['E-201', '미등록/별칭 태그'],
    ['E-202', '커버 미확보 — 플레이스홀더 발행 + 원 통지 (M-1)'],
    ['E-203', '참조 0개 이야기'],
    ['E-204', '불실존 ref'],
  ])('%s (%s)가 경고로 잡힌다', (code) => {
    expect(warningCodes).toContain(code);
  });

  it('E-201 별칭은 canonical 제안을, 신규는 등록 제안을 담는다', () => {
    const msgs = result.warnings.filter((w) => w.code === 'E-201').map((w) => w.message);
    expect(msgs.some((m) => m.includes('city-pop'))).toBe(true); // alias → canonical
    expect(msgs.some((m) => m.includes('unregistered-tag') && m.includes('등록부'))).toBe(true);
  });

  it('모든 finding에 파일 경로가 있고 메시지가 한국어다', () => {
    for (const f of [...result.failures, ...result.warnings]) {
      expect(f.file.length).toBeGreaterThan(0);
      expect(f.message).toMatch(/[가-힣]/);
    }
  });

  it('formatReport가 실패·경고를 사람이 읽을 블록으로 만든다', () => {
    const report = formatReport(result);
    expect(report).toContain('빌드 실패');
    expect(report).toContain('경고');
  });
});

describe('설정 오류 저장소 — E-109 예약어', () => {
  const { result } = runPrePass(fixtureRoot('invalid-config-repo'));

  it('버킷 id "etc"가 E-109 실패다', () => {
    expect(result.failures.map((f) => f.code)).toContain('E-109');
  });
});
