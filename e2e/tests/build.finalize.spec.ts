/**
 * US-12 AC1 · US-13 · SS-6 — finalize year transition + snapshot immutability,
 * measured with the real CLI + real builds on the rich content set (7 pop +
 * 1 hiphop-rnb reviews). Also captures the home 'post-finalize' state
 * (4-state coverage, state 4).
 */
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePathOf, build, finalize, makeSandbox, readPage } from '../lib/sandbox.mjs';
import { writeRichContent } from '../lib/rich-content.mjs';

test.describe.configure({ mode: 'serial' });

let dir: string;
let B: string;

test.beforeAll(async () => {
  dir = makeSandbox('finalize');
  B = basePathOf(dir);
  await writeRichContent(dir);
});

test('finalize CLI — 스냅샷 동결 + active_year 전이 + 이듬해 버킷 블록', () => {
  const result = finalize(dir, 2026, '# 2026 서문\n\n한 해를 요약하는 문장.');
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const snapshot = readFileSync(join(dir, 'content/snapshots/2026.md'), 'utf8');
  expect(snapshot).toContain('year: 2026');
  // Bucket publish rule (US-13 AC3): pop has 7 reviews (≥3) → published,
  // hiphop-rnb has 1 (<3) → withheld this year.
  expect(snapshot).toMatch(/published: true/);
  expect(snapshot).toMatch(/published: false/);

  expect(readFileSync(join(dir, 'config/site.yaml'), 'utf8')).toContain('active_year: 2027');
  expect(readFileSync(join(dir, 'config/genres.yaml'), 'utf8')).toContain('year: 2027');
});

test('확정 빌드 — 동결 리스트 지면 + 홈 post-finalize 상태', () => {
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const list = readPage(dir, '/list/2026/');
  expect(list).toContain('2026 올해의 앨범 — 확정');
  expect(list).toContain('8장의 앨범');
  // USP-A on the frozen surface: every entry links to a review.
  const anchors = list.match(new RegExp(`href="${B}/reviews/[^"]+"`, 'g')) ?? [];
  expect(new Set(anchors).size).toBe(8);
  // Rank = score desc: champion score renders first.
  expect(list.indexOf('>9.1<')).toBeGreaterThan(-1);
  expect(list.indexOf('>9.1<')).toBeLessThan(list.indexOf('>8.8<'));

  const home = readPage(dir, '/');
  expect(home).toContain('finalized-card');
  expect(home).toContain('2026 올해의 앨범 — 확정');
  expect(home).toContain(`href="${B}/list/2026/"`);
  // The new year starts with an empty chart. Since the W5 home rebuild the
  // home omits an empty Charts section outright (R-4: a conditional block is
  // omitted, not shown empty), so the proof is its ABSENCE plus the fact
  // that last year's albums no longer sit on the home as nominees.
  expect(home).not.toContain('aria-label="올해의 앨범"');
  expect(home).not.toContain('>9.1<');
  // The bucket structure itself did not disappear — it moved to where a
  // reader goes for it. 2027's list page still declares all three buckets.
  const newYearList = readPage(dir, '/list/2027/');
  expect(newYearList.match(/아직 이 장르의 후보가 없습니다/g)?.length).toBe(3);
});

test('점수 수정 → 평론은 반영, 확정 스냅샷 지면은 불변 (US-12 AC1)', () => {
  const reviewFile = join(dir, 'content/reviews/aurora-line-first-light.md');
  writeFileSync(reviewFile, readFileSync(reviewFile, 'utf8').replace('score: "9.1"', 'score: "9.9"'), 'utf8');
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const review = readPage(dir, '/reviews/aurora-line-first-light/');
  expect(review).toContain('>9.9<');

  const list = readPage(dir, '/list/2026/');
  expect(list).toContain('>9.1<'); // frozen at finalize time
  expect(list).not.toContain('>9.9<');
});

test('확정 후 지난해 발매작 평론 발행 → 스냅샷 불변 + 아카이브만 편입 (US-13 AC2)', () => {
  writeFileSync(
    join(dir, 'content/albums/late-arrival.yaml'),
    'title: 뒤늦은 도착\nartists: [fixture-artist]\nrelease_date: "2026-08-30"\nbucket: pop\n',
    'utf8',
  );
  writeFileSync(
    join(dir, 'content/reviews/late-arrival.md'),
    '---\nalbum: late-arrival\nscore: "9.5"\ndate: 2026-12-30\neditorial_check: true\n---\n\n확정 이후에 도착한 평론.\n',
    'utf8',
  );
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const list = readPage(dir, '/list/2026/');
  expect(list).toContain('8장의 앨범'); // still 8 — 9.5 does not enter
  expect(list).not.toContain('late-arrival');

  const archive = readPage(dir, '/archive/2026/');
  expect(archive).toContain(`href="${B}/reviews/late-arrival/"`);

  const home = readPage(dir, '/');
  expect(home).toContain('finalized-card'); // still post-finalize
});
