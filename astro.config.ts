/**
 * Astro configuration + the build-time verification gates.
 *
 * Two-stage checker (sequence B — same Zod definitions as content.config.ts):
 *
 *  1. PRE-PASS at astro:config:done (before Astro's own content sync, so our
 *     aggregated Korean report wins the race against the first-broken-entry
 *     error): shape + cross-file integrity (E-100~110·114) and the notice
 *     pass (E-301~303, sharing the derive code path with the pages). Any
 *     E-1xx failure throws — nothing invalid can deploy, and the editor gets
 *     ONE complete list, not n round trips.
 *
 *  2. POST-BUILD at astro:build:done: dist-wide OG trio scan (E-111) and
 *     internal link resolution (E-112). E-115 is NOT a substring scan — it
 *     is enforced structurally (og input types carry no score field).
 *
 * Build-only on purpose: the dev server must keep running while the editor
 * fixes content, so neither gate blocks `astro dev`.
 *
 * `site`/`base` are intentionally not set yet: public domain undecided (site
 * name pending); og:url derives from config/site.yaml#base_url instead.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import type { AstroIntegration } from 'astro';
import {
  formatReport,
  readPreviousBoardState,
  runNoticePass,
  runPostBuildChecks,
  runPrePass,
  writeBuildReport,
  type CheckResult,
} from './src/lib/checker';

function undernoteChecker(): AstroIntegration {
  let command = '';
  let preResult: CheckResult = { failures: [], warnings: [], notices: [] };
  let boardState: Record<string, string[]> | undefined;
  const root = fileURLToPath(new URL('.', import.meta.url));

  return {
    name: 'undernote-checker',
    hooks: {
      'astro:config:setup': ({ command: cmd }) => {
        command = cmd;
      },
      'astro:config:done': ({ logger }) => {
        if (command !== 'build') return;
        const { data, result } = runPrePass(root);
        const noticeOutcome = runNoticePass(data, readPreviousBoardState(root));
        preResult = { ...result, notices: [...result.notices, ...noticeOutcome.notices] };
        boardState = noticeOutcome.boardState;
        writeBuildReport(root, preResult, boardState);
        if (preResult.warnings.length + preResult.notices.length > 0) {
          logger.warn('\n' + formatReport({ ...preResult, failures: [] }));
        }
        if (preResult.failures.length > 0) {
          throw new Error(
            '콘텐츠 검증 실패 — 배포되지 않습니다.\n' + formatReport({ ...preResult, warnings: [], notices: [] }),
          );
        }
      },
      'astro:build:done': ({ dir, logger }) => {
        if (command !== 'build') return;
        const postFailures = runPostBuildChecks(fileURLToPath(dir));
        const finalResult: CheckResult = { ...preResult, failures: postFailures };
        writeBuildReport(root, finalResult, boardState);
        if (postFailures.length > 0) {
          throw new Error(
            '산출물 무결성 검사 실패 — 배포되지 않습니다.\n' +
              formatReport({ failures: postFailures, warnings: [], notices: [] }),
          );
        }
        logger.info('무결성 검사 통과 (OG 3요소 · 내부 링크).');
      },
    },
  };
}

export default defineConfig({
  integrations: [undernoteChecker()],
});
