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
 * an empty string. The states are pinned STRUCTURALLY instead.
 *
 * REVISED 2026-09-07: the home now renders all three sections whether or not
 * they hold anything, so "no reviews" can no longer be proved by the Charts
 * section's ABSENCE. Reversed, not dropped — the empty state is now proved
 * by the section being present and DEMONSTRABLY EMPTY: its definition block
 * stands where the cards would be, no card markup exists, and no review link
 * appears anywhere on the page. That is a stricter statement than the old
 * one (it pins the empty treatment as well as the emptiness), and the
 * restored state still proves the retroactive round-trip reaches the home's
 * chart down to the score plate.
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
  // … and all three sections stand. The two REVIEW-fed ones are empty and
  // show it structurally (their empty ground stands where cards would be);
  // 음악 이야기 is not empty, because deleting a review does not delete the
  // story — which is precisely the asymmetry this sandbox exercises.
  expect(home).toContain('aria-label="올해의 앨범"');
  expect(home).toContain('aria-label="최신 리뷰"');
  expect(home).toContain('aria-label="음악 이야기"');
  expect(home.match(/class="section-empty/g)?.length).toBe(2);
  expect(home).not.toContain('class="chart-card'); // no chart card markup at all
  expect(home).toContain('class="article-card'); // the story card survives
  expect(home).toContain(`href="${B}/stories/fixture-story/"`);
  expect(home).not.toContain(`href="${B}/reviews/`);
  // An empty section says ONE approved line, the same line every empty
  // listing on the site says. The negatives are the drafts this replaced:
  // a per-page variant, and a sentence describing what the section would
  // have held. Both were rejected for the same reason — surfaces explaining
  // themselves in their own words.
  expect(home).toContain('아직 글이 없습니다.');
  expect(home).not.toContain('아직 발행된');
  expect(home).not.toContain('준비 중입니다');
  expect(home).not.toContain('맨 앞에 놓입니다');
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

  // The home swings back to its content face: the Charts section fills with
  // the restored review and prints its score plate (Charts is a LIST surface
  // — D2 — so the figure belongs there). The section was present in both
  // states; what changed is whether it holds cards.
  const home = readPage(dir, '/');
  expect(home).not.toContain('첫 평론을 준비하고 있습니다.');
  expect(home).toContain('aria-label="올해의 앨범"');
  expect(home).toContain('class="chart-card');
  expect(home).toContain(`href="${B}/reviews/fixture-artist-fixture-album/"`);
  expect(home).toContain('>8.3<');
  // With the review back, every section holds something: the empty line is
  // gone from the page entirely. The empty treatment is a state, not
  // furniture.
  expect(home).not.toContain('class="section-empty');
  expect(home).not.toContain('아직 글이 없습니다.');
});
