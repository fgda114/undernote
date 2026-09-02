/**
 * Score representation — the single source of truth (ADR-0004).
 *
 * Scores are STORED AS STRINGS ("8.3") and COMPUTED AS TENTHS INTEGERS (83).
 * Never change this to a float:
 *  - YAML parsers fold the number 8.30 into 8.3, which makes the SS-3
 *    acceptance rule ("8.30 input = build failure") undetectable. Only a
 *    string preserves the author's exact keystrokes for validation (E-105).
 *  - Float comparison would contaminate the total ordering R-1
 *    (score desc → review date asc → slug asc), which must be exact.
 * Display always uses the stored string verbatim — no reformatting.
 *
 * This module is the ONLY score parser in the codebase (project rule).
 */

/** Valid scores: "0.0"–"9.9" or exactly "10.0" — one decimal, no padding (E-105). */
export const SCORE_PATTERN = /^(10\.0|[0-9]\.[0-9])$/;

/**
 * Convert a validated score string to a tenths integer for sorting/aggregation
 * ("8.3" → 83). Throws on invalid input: callers must validate first (Zod
 * schema uses SCORE_PATTERN), so an invalid value reaching here is a bug,
 * not a content error.
 */
export function scoreToTenths(score: string): number {
  if (!SCORE_PATTERN.test(score)) {
    throw new Error(
      `scoreToTenths: 유효하지 않은 점수 문자열 "${score}" — 스키마 검증(E-105)을 거치지 않은 값이 전달되었습니다.`,
    );
  }
  const [whole, tenth] = score.split('.');
  return Number(whole) * 10 + Number(tenth);
}
