/**
 * Checker pre-pass entry point (sequence B-1): load + shape-validate + resolve,
 * everything aggregated into one CheckResult. The caller (build integration in
 * astro.config.ts) decides what a failure means — this module only reports.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRepo, type LoadOutcome } from './load';
import { resolveRepo } from './resolve';
import { mergeResults, type CheckResult, type Finding } from './types';

export type { CheckResult, Finding } from './types';
export type { RepoData, Entry } from './load';

export function runPrePass(root: string): LoadOutcome {
  const { data, result } = loadRepo(root);
  // Cross-file checks only run against shape-valid entries; shape failures
  // are already in `result` and the two sets never overlap.
  return { data, result: mergeResults(result, resolveRepo(data)) };
}

/** One human-readable Korean block per grade — what broke and how to fix it. */
export function formatReport(result: CheckResult): string {
  const lines: string[] = [];
  const section = (title: string, findings: Finding[]) => {
    if (findings.length === 0) return;
    lines.push(`${title} (${findings.length}건)`);
    for (const f of findings) lines.push(`  ${f.file} — ${f.message}`);
  };
  section('빌드 실패', result.failures);
  section('경고', result.warnings);
  section('알림', result.notices);
  return lines.join('\n');
}

/**
 * Write reports/build-report.{md,json} (api-contracts §4.6). Lives OUTSIDE
 * dist/ on purpose: built_at is inherently non-deterministic and would
 * permanently break the determinism hash gate if it shipped with the site.
 */
export function writeBuildReport(root: string, result: CheckResult): void {
  const reportsDir = join(root, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const builtAt = new Date().toISOString();

  const json = { built_at: builtAt, ...result };
  writeFileSync(join(reportsDir, 'build-report.json'), JSON.stringify(json, null, 2) + '\n', 'utf8');

  const md: string[] = [`# 빌드 리포트`, ``, `생성: ${builtAt}`, ``];
  const section = (title: string, findings: Finding[], empty: string) => {
    md.push(`## ${title}`, ``);
    if (findings.length === 0) {
      md.push(empty, ``);
      return;
    }
    for (const f of findings) md.push(`- \`${f.file}\` — ${f.message}`);
    md.push(``);
  };
  section('실패', result.failures, '없음 — 배포 가능한 상태입니다.');
  section('경고', result.warnings, '없음.');
  section('원에게 전하는 알림', result.notices, '없음.');
  writeFileSync(join(reportsDir, 'build-report.md'), md.join('\n'), 'utf8');
}
