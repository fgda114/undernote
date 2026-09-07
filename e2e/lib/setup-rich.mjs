/**
 * Pre-test setup: build the shared "rich" sandbox (8 reviews / 3 buckets)
 * that the browser project serves via `astro preview`, and record the build
 * duration for the latency report.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, makeSandbox, SANDBOX_ROOT } from './sandbox.mjs';
import { lockHolder } from './run-lock.mjs';
import { writeRichContent } from './rich-content.mjs';

// Refuse to rebuild the shared sandbox out from under a running suite —
// that collision is what the W6 "parallel flake" actually was.
const held = lockHolder();
if (held) {
  throw new Error(
    `e2e 스위트가 실행 중입니다 (pid ${held.pid} · 시작 ${held.started}). ` +
      'rich 샌드박스를 다시 만들면 그 실행이 서빙 중인 dist가 사라져 무관한 테스트가 실패합니다. ' +
      '앞의 실행이 끝난 뒤 다시 실행하십시오.',
  );
}

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
