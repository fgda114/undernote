/**
 * Pre-test setup: build the shared "rich" sandbox (8 reviews / 3 buckets)
 * that the browser project serves via `astro preview`, and record the build
 * duration for the latency report.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, makeSandbox, SANDBOX_ROOT } from './sandbox.mjs';
import { writeRichContent } from './rich-content.mjs';

const dir = makeSandbox('rich');
await writeRichContent(dir);
console.log('rich sandbox 빌드 중...');
const result = build(dir);
if (result.status !== 0) {
  console.error(result.out.slice(-4000));
  throw new Error(`rich sandbox 빌드 실패 (exit ${result.status})`);
}
const metrics = { rich_build_ms: result.ms, built_at: new Date().toISOString(), reviews: 8 };
writeFileSync(join(SANDBOX_ROOT, 'build-metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
console.log(`rich sandbox 빌드 완료 — ${result.ms}ms`);
