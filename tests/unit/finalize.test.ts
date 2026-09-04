/**
 * finalize CLI integration test — runs the real script against a throwaway
 * copy of a fixture repo (cwd = temp dir; the script resolves everything
 * from cwd). Verifies: snapshot creation with frozen strings, active_year
 * advance, next-year bucket block, E-405 refusal, re-run refusal.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const script = join(repoRoot, 'scripts', 'finalize.ts');
const fixture = fileURLToPath(new URL('../fixtures/valid-repo/', import.meta.url));

const work = mkdtempSync(join(tmpdir(), 'undernote-finalize-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

cpSync(fixture, work, { recursive: true });
const preface = join(work, 'preface.md');
writeFileSync(preface, '픽스처 서문입니다.\n', 'utf8');

function runFinalize(args: string[]): { status: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [script, ...args, '--yes'], {
      cwd: work,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/**
 * TIMEOUT NOTE: each test spawns a real `node` subprocess that runs the FULL
 * pre-pass (runPrePass — shape + cross-file integrity, E-100~110). That
 * thoroughness is deliberate (W6 P2: finalize must refuse to freeze an
 * E-102 state — irreversible snapshot). Solo the file finishes in ~2s, but
 * under the parallel suite the default 5s flakes. Do NOT "fix" this by
 * reverting finalize to the cheaper loadRepo — raise the timeout instead.
 */
const SUBPROCESS_TIMEOUT = 30_000;

describe('finalize — 시퀀스 C', () => {
  it('스냅샷 생성 + active_year 전환 + 이듬해 블록', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const { status, output } = runFinalize(['--year', '2026', '--preface', preface]);
    expect(status).toBe(0);

    const snapshot = readFileSync(join(work, 'content/snapshots/2026.md'), 'utf8');
    expect(snapshot).toContain('year: 2026');
    expect(snapshot).toContain('score: "8.3"'); // frozen as a string
    expect(snapshot).toContain('픽스처 서문입니다.');
    // Fixture has 1 review < min 3 → every bucket unpublished.
    expect(snapshot).toContain('published: false');
    expect(snapshot).not.toContain('winner:');

    expect(readFileSync(join(work, 'config/site.yaml'), 'utf8')).toMatch(/active_year: 2027/);
    expect(readFileSync(join(work, 'config/genres.yaml'), 'utf8')).toContain('year: 2027');
    expect(output).toContain('스냅샷 생성');
  });

  it('재실행은 거부된다 (스냅샷 수동 편집 금지 수칙의 짝)', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const { status, output } = runFinalize(['--year', '2026', '--preface', preface]);
    expect(status).not.toBe(0);
    expect(output).toContain('이미 있습니다');
  });

  it('평론 0편인 연도는 E-405 확정 거부', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const { status, output } = runFinalize(['--year', '2031', '--preface', preface]);
    expect(status).not.toBe(0);
    expect(output).toContain('E-405');
  });
});
