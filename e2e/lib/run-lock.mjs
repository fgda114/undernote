/**
 * ONE SUITE RUN PER CHECKOUT AT A TIME.
 *
 * Measured root cause of the W6 "parallel flake" (11-qa/test-flow.md §플레이크):
 * the suite is not re-entrant, and nothing said so. A second `npm run e2e`
 * begins by DELETING `.sandbox/rich` — the exact directory the first run's
 * static server is serving and the exact directory `distPagePaths()` walks.
 * The first run then fails in whatever test happened to be mid-flight, which
 * is why the observed failures were "a different one or two browser tests
 * every time" rather than a repeatable set. It was never `workers: 2`
 * (measured: five consecutive clean full-suite runs at workers 2).
 *
 * The guard is a PID lock rather than a comment in a README, because the
 * collision is invisible from inside either run: both look like a product
 * defect. A stale lock (a run that was killed) is detected and taken over —
 * a lock file that needs manual deletion is a lock file that gets deleted
 * reflexively, and then it protects nothing.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCK = join(HERE, '..', '.sandbox', 'run.lock');

function alive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = existence check, does not kill
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but owned by someone else
  }
}

/** Returns the holder ({ pid, started, label }) if the suite is already
 *  running here, or null. Stale locks are cleared as a side effect. */
export function lockHolder() {
  if (!existsSync(LOCK)) return null;
  let held;
  try {
    held = JSON.parse(readFileSync(LOCK, 'utf8'));
  } catch {
    rmSync(LOCK, { force: true }); // unreadable = not a claim
    return null;
  }
  if (!alive(held.pid)) {
    rmSync(LOCK, { force: true });
    return null;
  }
  return held;
}

export function acquire(label) {
  const held = lockHolder();
  if (held) {
    throw new Error(
      `이 저장소에서 e2e 스위트가 이미 실행 중입니다 (pid ${held.pid} · ${held.label} · ${held.started}).\n` +
        `두 실행은 같은 e2e/.sandbox/rich 를 쓰기 때문에 동시에 돌릴 수 없습니다 — ` +
        `나중에 시작한 쪽이 앞선 실행이 서빙 중인 dist를 지워, 서로 무관한 브라우저 테스트가 무작위로 실패합니다.\n` +
        `앞의 실행이 끝난 뒤 다시 실행하십시오. 앞의 실행이 이미 죽었다면 이 잠금은 자동으로 해제됩니다 ` +
        `(그래도 남아 있으면 e2e/.sandbox/run.lock 삭제).`,
    );
  }
  mkdirSync(dirname(LOCK), { recursive: true });
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, label, started: new Date().toISOString() }), 'utf8');
}

export function release() {
  const held = lockHolder();
  if (held && held.pid === process.pid) rmSync(LOCK, { force: true });
}
