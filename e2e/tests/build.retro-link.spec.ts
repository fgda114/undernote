/**
 * US-11 AC2 / SS-9 — retroactive link round-trip, measured on real builds:
 * delete the review → the story row degrades to the honest non-link
 * ("평론 준비 중"), restore it → the next build regenerates the link with
 * zero editor intervention. Also captures home 'empty' and 'early' states
 * (US home 4-state coverage, states 1–2).
 */
import { expect, test } from '@playwright/test';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build, makeSandbox, pageExists, readPage, REPO } from '../lib/sandbox.mjs';

test.describe.configure({ mode: 'serial' });

let dir: string;
const REVIEW = 'content/reviews/fixture-artist-fixture-album.md';

test.beforeAll(() => {
  dir = makeSandbox('retro');
});

test('평론 삭제 → 이야기 행이 "평론 준비 중"(비링크)으로 강등 + 홈 empty 상태', () => {
  rmSync(join(dir, REVIEW));
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  expect(pageExists(dir, '/reviews/fixture-artist-fixture-album/')).toBe(false);

  const story = readPage(dir, '/stories/fixture-story/');
  expect(story).toContain('평론 준비 중');
  expect(story).not.toContain('평론 읽기');
  expect(story).not.toContain('href="/reviews/');

  const home = readPage(dir, '/');
  expect(home).toContain('첫 평론을 준비하고 있습니다.');
});

test('평론 복원 → 다음 빌드에서 자동 링크 소급 생성 (원 개입 0) + 홈 early 상태', () => {
  copyFileSync(join(REPO, REVIEW), join(dir, REVIEW));
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);

  const story = readPage(dir, '/stories/fixture-story/');
  expect(story).toContain('평론 읽기');
  expect(story).toContain('href="/reviews/fixture-artist-fixture-album/"');
  // The unregistered {text} mention must stay a plain-text row (US-4 AC2).
  expect(story).toContain('미등록 명반');
  expect(story).toContain('평론 준비 중');

  // Backlink direction: the review page carries the ladder block again.
  const review = readPage(dir, '/reviews/fixture-artist-fixture-album/');
  expect(review).toContain('이 점수가 낯설다면');
  expect(review).toContain('href="/stories/fixture-story/"');

  const home = readPage(dir, '/');
  expect(home).toContain('지금까지 평론 1편');
});
