/**
 * US-11 AC2 / SS-9 — retroactive link round-trip, measured on real builds:
 * delete the review → the story row degrades to the honest non-link
 * ("평론 준비 중"), restore it → the next build regenerates the link with
 * zero editor intervention. Also captures the home's two content states
 * (US home 4-state coverage, states 1–2).
 *
 * HOME ASSERTIONS, 2026-09-06 (W5 home rebuild — editor-approved): the home
 * used to be pinned by two copy strings, one of which ("지금까지 평론 1편")
 * was deleted with the progress strip. Copy is the weakest possible anchor
 * anyway — `indexOf` misses silently and a slice-based check then passes on
 * an empty string. The states are now pinned STRUCTURALLY: no reviews → no
 * Charts section and no review link anywhere on the home; one review → the
 * Charts section is back, carrying the restored review's link AND its score
 * plate. That also proves the retroactive round-trip reaches the home, which
 * the old string pair never did.
 */
import { expect, test } from '@playwright/test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePathOf, build, makeSandbox, pageExists, readPage } from '../lib/sandbox.mjs';
import { writeBaseContent } from '../lib/rich-content.mjs';

test.describe.configure({ mode: 'serial' });

let dir: string;
let B: string; // deploy base path — assertions must survive a base change
const REVIEW = 'content/reviews/fixture-artist-fixture-album.md';
/** Captured at seed time so the restore step needs no repo file (published
 *  content is removable — see writeBaseContent). */
let reviewSource: string;

test.beforeAll(async () => {
  dir = makeSandbox('retro');
  B = basePathOf(dir);
  await writeBaseContent(dir);
  reviewSource = readFileSync(join(dir, REVIEW), 'utf8');
});

test('평론 삭제 → 이야기 행이 "평론 준비 중"(비링크)으로 강등 + 홈 empty 상태', () => {
  rmSync(join(dir, REVIEW));
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  expect(pageExists(dir, '/reviews/fixture-artist-fixture-album/')).toBe(false);

  const story = readPage(dir, '/stories/fixture-story/');
  expect(story).toContain('평론 준비 중');
  expect(story).not.toContain('평론 읽기');
  expect(story).not.toContain(`href="${B}/reviews/`);

  const home = readPage(dir, '/');
  // 'empty' variant: the declaration line survives (it is the only copy the
  // home has in this state) …
  expect(home).toContain('첫 평론을 준비하고 있습니다.');
  // … and nothing else does. No Charts section, no review anywhere.
  expect(home).not.toContain('aria-label="올해의 앨범"');
  expect(home).not.toContain(`href="${B}/reviews/`);
});

test('평론 복원 → 다음 빌드에서 자동 링크 소급 생성 (원 개입 0) + 홈 early 상태', () => {
  writeFileSync(join(dir, REVIEW), reviewSource, 'utf8');
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const story = readPage(dir, '/stories/fixture-story/');
  expect(story).toContain('평론 읽기');
  expect(story).toContain(`href="${B}/reviews/fixture-artist-fixture-album/"`);
  // The unregistered {text} mention must stay a plain-text row (US-4 AC2).
  expect(story).toContain('미등록 명반');
  expect(story).toContain('평론 준비 중');

  // Backlink direction: the review page carries the ladder block again.
  const review = readPage(dir, '/reviews/fixture-artist-fixture-album/');
  expect(review).toContain('이 점수가 낯설다면');
  expect(review).toContain(`href="${B}/stories/fixture-story/"`);

  // The home swings back to its content face: the Charts section exists
  // again, holds the restored review, and prints its score plate (Charts is
  // a LIST surface — D2 — so the figure belongs there).
  const home = readPage(dir, '/');
  expect(home).not.toContain('첫 평론을 준비하고 있습니다.');
  expect(home).toContain('aria-label="올해의 앨범"');
  expect(home).toContain(`href="${B}/reviews/fixture-artist-fixture-album/"`);
  expect(home).toContain('>8.3<');
});
