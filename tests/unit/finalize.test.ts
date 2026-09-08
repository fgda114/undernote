/**
 * finalize CLI integration test — runs the real script against a throwaway
 * copy of a fixture repo (cwd = temp dir; the script resolves everything
 * from cwd). Verifies: snapshot creation with frozen strings, active_year
 * advance, next-year bucket block, E-405 refusal, re-run refusal, and
 * (2026-09-08, R-8 rewrite) that a RETROACTIVE finalize — a past year built
 * up after later years already exist — never moves active_year backwards.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
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

  it(
    '소급 확정(2025, 2026·2027이 이미 있는 상태) — active_year는 되돌아가지 않는다',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      // Pre-condition inherited from the first test in this file: 2026 is
      // already finalized and active_year already advanced to 2027.
      expect(readFileSync(join(work, 'config/site.yaml'), 'utf8')).toMatch(/active_year: 2027/);

      // Retroactively stand up a 2025 block — this is the freedom R-8's
      // rewrite grants for any not-yet-finalized year, however far in the
      // past (parse/re-stringify rather than hand-written YAML text, so this
      // stays correct if the fixture's own genres.yaml formatting changes).
      const genresPath = join(work, 'config/genres.yaml');
      const genres = parse(readFileSync(genresPath, 'utf8')) as {
        years: { year: number; buckets: unknown[]; min_reviews_to_publish: number }[];
      };
      genres.years.push({ year: 2025, buckets: [{ id: 'pop', label: '팝', order: 1 }], min_reviews_to_publish: 1 });
      writeFileSync(genresPath, stringify(genres, { defaultKeyType: 'PLAIN' }), 'utf8');

      // One 2025 review — E-405 needs at least one to have something to freeze.
      writeFileSync(
        join(work, 'content/albums/retro-album.yaml'),
        'title: 소급 앨범\nartists: [fixture-artist]\nrelease_date: "2025-05-01"\nbuckets: [pop]\n',
        'utf8',
      );
      writeFileSync(
        join(work, 'content/reviews/retro-album.md'),
        '---\nalbum: retro-album\nscore: "8.0"\ndate: 2025-06-01\neditorial_check: true\n---\n\n소급으로 쓴 평론.\n',
        'utf8',
      );

      const { status, output } = runFinalize(['--year', '2025', '--preface', preface]);
      expect(status, output).toBe(0);
      expect(output).toContain('소급 확정');

      const snapshot = readFileSync(join(work, 'content/snapshots/2025.md'), 'utf8');
      expect(snapshot).toContain('year: 2025');

      // THE BUG THIS PINS: an unconditional `active_year → year+1` would
      // silently regress 2027 back to 2026 here. It must not move at all.
      expect(readFileSync(join(work, 'config/site.yaml'), 'utf8')).toMatch(/active_year: 2027/);
      // No spurious/duplicate 2026 block from the retroactive path either —
      // it already existed, and the auto-copy is skipped for retroactive runs.
      const genresAfter = readFileSync(join(work, 'config/genres.yaml'), 'utf8');
      expect(genresAfter.match(/year: 2026/g)?.length).toBe(1);
    },
  );
});
