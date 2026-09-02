/**
 * Astro configuration + the build-time verification gate.
 *
 * The inline integration runs the checker PRE-PASS (sequence B-1) before
 * Astro's own content sync: it loads content/ + config/ from disk, validates
 * everything with the single schema definitions in src/lib/schema, aggregates
 * EVERY finding into one Korean report (never stops at the first), writes
 * reports/build-report.{md,json}, and throws on any E-1xx failure — so
 * nothing invalid can ever deploy and the editor fixes everything in one
 * round trip. It lives here (config layer) because src/lib must stay
 * framework-free. Astro's per-entry schema validation stays on as a second
 * net (same Zod modules — one definition, two consumers).
 *
 * Build-only on purpose: the dev server must keep running while the editor
 * fixes content, so the gate does not block `astro dev`.
 *
 * `site`/`base` are intentionally not set yet: public domain undecided (site
 * name pending). They land in W5.2 with the OG url wiring.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import type { AstroIntegration } from 'astro';
import { formatReport, runPrePass, writeBuildReport } from './src/lib/checker';

function undernoteChecker(): AstroIntegration {
  let command = '';
  return {
    name: 'undernote-checker',
    hooks: {
      'astro:config:setup': ({ command: cmd }) => {
        command = cmd;
      },
      // config:done fires before content sync — our aggregated report must
      // win the race against Astro's first-broken-entry error.
      'astro:config:done': ({ logger }) => {
        if (command !== 'build') return;
        const root = fileURLToPath(new URL('.', import.meta.url));
        const { result } = runPrePass(root);
        writeBuildReport(root, result);
        if (result.warnings.length + result.notices.length > 0) {
          logger.warn('\n' + formatReport({ ...result, failures: [] }));
        }
        if (result.failures.length > 0) {
          throw new Error('콘텐츠 검증 실패 — 배포되지 않습니다.\n' + formatReport({ ...result, warnings: [], notices: [] }));
        }
      },
    },
  };
}

export default defineConfig({
  integrations: [undernoteChecker()],
});
