#!/usr/bin/env node
/**
 * Bridge between publish.mjs's JSON result file and GitHub Actions' step
 * outputs, so the workflow YAML can branch on `steps.<id>.outputs.*` instead
 * of re-parsing JSON inline in a `run:` block. Multi-line values (only
 * `message` can be) use the GITHUB_OUTPUT heredoc form with a random
 * delimiter — GitHub's own documented way to pass a value that might
 * contain "EOF"-looking text, which a Korean error message quoting a build
 * report absolutely can.
 *
 * A MISSING result file (publish.mjs crashed before writing one — see its
 * own doc comment on why that is never a PD-* outcome) is reported here as
 * ok=false with an EMPTY code, which is exactly what the workflow's
 * "infra failure" branch checks for.
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const resultPath = process.env.PUBLISH_RESULT_PATH;
const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) throw new Error('GITHUB_OUTPUT is not set — this script must run as a GitHub Actions step.');

const result = existsSync(resultPath)
  ? JSON.parse(readFileSync(resultPath, 'utf8'))
  : { ok: false, code: '', message: '' };

function writeLine(line) {
  appendFileSync(outputPath, line + '\n', 'utf8');
}

writeLine(`ok=${result.ok}`);
writeLine(`code=${result.code ?? ''}`);
// 'publish' | 'update' | 'takedown' — added alongside those two pipelines
// (2026-09-08); absent from an older result shape only if this script and
// publish.mjs somehow drift apart, so it defaults to 'publish' rather than
// leaving the workflow's mode-aware steps to branch on an empty string.
writeLine(`action=${result.action ?? 'publish'}`);
writeLine(`kind=${result.kind ?? ''}`);
writeLine(`slug=${result.slug ?? ''}`);
writeLine(`url=${result.url ?? ''}`);
writeLine(`notes=${(result.notes ?? []).join(' / ')}`);
// Only set by publishReview when THIS run created a brand-new artist file —
// consumed by the "Comment build failure" step to filter a DERIVED E-113
// (report-comment.mjs#suppressDerivedOrphan). Empty for every other result.
writeLine(`created_artist=${result.createdArtistSlug ?? ''}`);

const delimiter = `EOF_${randomUUID()}`;
writeLine(`message<<${delimiter}`);
writeLine(result.message ?? '');
writeLine(delimiter);
