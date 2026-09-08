#!/usr/bin/env node
/**
 * CLI glue: pick the right formatter from report-comment.mjs, write its
 * result to a file. Kept as a separate step from `gh issue comment` (rather
 * than piping a heredoc built inline in the workflow YAML) so an untrusted
 * value — a build-report.md that quotes content the writer typed — is never
 * interpolated into a shell command; `gh issue comment --body-file` reads it
 * as inert file bytes.
 *
 * Usage: node scripts/write-comment.mjs <mode> <outputFile>
 *   mode=pd-error       env CODE, MESSAGE
 *   mode=build-failure  env REPORT_PATH   (reports/build-report.md from the public checkout)
 *                       env CREATED_ARTIST (optional — see report-comment.mjs's derived-E-113 filter)
 *   mode=infra-error    env RUN_URL       (optional)
 *   mode=success        env ACTION (optional, default publish), KIND, URL, NOTES (optional, " / "-joined)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  formatPdErrorComment,
  formatBuildFailureComment,
  formatInfraErrorComment,
  formatSuccessComment,
} from './report-comment.mjs';

const [, , mode, outputFile] = process.argv;

const bodies = {
  'pd-error': () => formatPdErrorComment(process.env.CODE ?? 'PD-UNKNOWN', process.env.MESSAGE ?? ''),
  'build-failure': () =>
    formatBuildFailureComment(readFileSync(process.env.REPORT_PATH, 'utf8'), {
      createdArtistSlug: process.env.CREATED_ARTIST || undefined,
    }),
  'infra-error': () => formatInfraErrorComment(process.env.RUN_URL || undefined),
  success: () =>
    formatSuccessComment({
      action: process.env.ACTION || undefined,
      kind: process.env.KIND,
      url: process.env.URL,
      notes: (process.env.NOTES ?? '').split(' / ').filter(Boolean),
    }),
};

const build = bodies[mode];
if (!build) {
  console.error(`알 수 없는 모드: "${mode}" (pd-error | build-failure | infra-error | success 중 하나)`);
  process.exit(1);
}
if (!outputFile) {
  console.error('출력 파일 경로가 필요합니다.');
  process.exit(1);
}
writeFileSync(outputFile, build(), 'utf8');
