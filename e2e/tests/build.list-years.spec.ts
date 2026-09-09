/**
 * Chart year navigation (R-8 rewrite, 2026-09-08) — a retroactively-built
 * PAST year (a genres.yaml block below active_year, built up the same way
 * active_year is, per the new "freeze is finalized-only" rule) gets its own
 * /list/{year}/ page and prev/next links appear/disappear correctly at the
 * ends of the known-years range. Also pins that the home's Charts section
 * stays on active_year regardless of how many other years exist (§3 of the
 * task — home was already correct; this just guards the invariant here too).
 */
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePathOf, build, makeSandbox, readPage } from '../lib/sandbox.mjs';
import { writeRichContent } from '../lib/rich-content.mjs';

test.describe.configure({ mode: 'serial' });

let dir: string;
let B: string;

test.beforeAll(async () => {
  dir = makeSandbox('list-years');
  B = basePathOf(dir);
  await writeRichContent(dir); // active_year: 2026, one 2026 genres block, 8 reviews.

  // Retroactively stand up a 2025 block — the exact workflow R-8's rewrite
  // exists for: a not-yet-finalized past year, built the same way 2026 is.
  const genresPath = join(dir, 'config/genres.yaml');
  writeFileSync(
    genresPath,
    readFileSync(genresPath, 'utf8').trimEnd() +
      '\n  - year: 2025\n    buckets:\n      - { id: "pop", label: "Pop", order: 1 }\n    min_reviews_to_publish: 3\n',
    'utf8',
  );
  // Reuses shared-artist (already written by writeRichContent) rather than a
  // fresh artist file — a new artist reachable through nothing else would
  // trip E-113 (orphan content), which is not what this spec is about.
  writeFileSync(
    join(dir, 'content/albums/retro-2025-album.yaml'),
    'title: 소급 앨범\nartists: [shared-artist]\nrelease_date: "2025-05-01"\nbuckets: [pop]\n',
    'utf8',
  );
  writeFileSync(
    join(dir, 'content/reviews/retro-2025-album.md'),
    '---\nalbum: retro-2025-album\nscore: "7.7"\ndate: 2026-01-05\neditorial_check: true\n---\n\n2025년 발매작에 대한 소급 평론.\n',
    'utf8',
  );
});

test('빌드 통과 — 소급 연도 블록 + 리뷰가 checker를 통과한다', () => {
  const result = build(dir);
  expect(result.status, result.out.slice(-4000)).toBe(0);
});

test('/list/2026/ (최신 연도) — 이전 링크는 2025, 다음 링크는 없다', () => {
  const list2026 = readPage(dir, '/list/2026/');
  expect(list2026).toContain('class="year-nav"');
  expect(list2026).toContain(`href="${B}/list/2025/"`);
  expect(list2026).not.toContain(`href="${B}/list/2027/"`);
});

test('/list/2025/ (최고령 연도) — 다음 링크는 2026, 이전 링크는 없다', () => {
  const list2025 = readPage(dir, '/list/2025/');
  expect(list2025).toContain('class="year-nav"');
  expect(list2025).toContain(`href="${B}/list/2026/"`);
  // No year before 2025 exists in this sandbox at all.
  expect(list2025).not.toMatch(new RegExp(`href="${B}/list/202[0-4]/"`));
  // 2025 has one review and no snapshot yet — progressive face, not finalized.
  expect(list2025).not.toContain('class="finalized-mark"');
});

test('홈의 Charts는 소급 연도가 생겨도 active_year(2026)에 고정된다', () => {
  const home = readPage(dir, '/');
  expect(home).toContain('2026 올해의 앨범');
  expect(home).not.toContain('2025 올해의 앨범');
  expect(home).toContain(`href="${B}/list/2026/"`);
});
