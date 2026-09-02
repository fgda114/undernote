/**
 * Verification result types — api-contracts §4.6 (Finding) and the 3-grade
 * policy (§2): failures block the build, warnings and notices ride along in
 * the build report. Everything is collected before reporting (B-1: never stop
 * at the first failure — the editor gets one complete list, not n round trips).
 */

export interface Finding {
  /** Error code, e.g. "E-105" (registry: 04-architecture/exceptions.md). */
  code: string;
  /** Korean, human-oriented: what is wrong and how to fix it. */
  message: string;
  /** Repo-relative path of the offending file. */
  file: string;
}

export interface CheckResult {
  failures: Finding[];   // E-1xx — build must fail, nothing deploys
  warnings: Finding[];   // E-2xx — proceed, record in build report
  notices: Finding[];    // E-3xx — proceed, relay to the editor
}

export function emptyResult(): CheckResult {
  return { failures: [], warnings: [], notices: [] };
}

export function mergeResults(...results: CheckResult[]): CheckResult {
  return {
    failures: results.flatMap((r) => r.failures),
    warnings: results.flatMap((r) => r.warnings),
    notices: results.flatMap((r) => r.notices),
  };
}
