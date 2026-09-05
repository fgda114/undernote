/**
 * US-3 / SS-10 — the fallback chain, each stage proven on a real build:
 *   ① direct reference  ② tag intersection  ③ same-bucket  ④ none (no shell).
 * Stage identity is asserted via lead copy where it differs (bucket) and via
 * reference topology where it doesn't (tag stage = story shown WITHOUT any
 * direct ref).
 */
import { expect, test } from '@playwright/test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePathOf, build, makeSandbox, readPage } from '../lib/sandbox.mjs';

test.describe.configure({ mode: 'serial' });

let dir: string;
let B: string;
const REVIEW_PATH = '/reviews/fixture-artist-fixture-album/';
const STORY = 'content/stories/fixture-story.md';

test.beforeAll(() => {
  dir = makeSandbox('ladder');
  B = basePathOf(dir);
});

test('① direct — 직접 참조 이야기가 평론에 표시', () => {
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);
  const review = readPage(dir, REVIEW_PATH);
  expect(review).toContain('이 점수가 낯설다면 — 이 앨범이 놓인 흐름 이야기');
  expect(review).toContain(`href="${B}/stories/fixture-story/"`);
});

test('② tag — 직접 참조 0 + 태그 교집합(city-pop)으로 폴백', () => {
  // Story no longer references the album directly, but shares the city-pop tag.
  writeFileSync(
    join(dir, STORY),
    `---
title: 픽스처 이야기
date: 2026-09-01
albums:
  - { text: "미등록 명반", artist: "어떤 아티스트" }
tags: [city-pop]
---

직접 참조 없이 태그만 겹치는 본문.
`,
    'utf8',
  );
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);
  const review = readPage(dir, REVIEW_PATH);
  expect(review).toContain('이 점수가 낯설다면 — 이 앨범이 놓인 흐름 이야기');
  expect(review).toContain(`href="${B}/stories/fixture-story/"`);
});

test('③ bucket — 태그 교집합 0 + 같은 버킷 참조로 폴백 (전용 리드 카피)', () => {
  // Story now references a DIFFERENT pop album (no review) and has no tags:
  // only the bucket stage can match.
  writeFileSync(
    join(dir, 'content', 'albums', 'bucket-buddy.yaml'),
    `title: 버킷 이웃
artists: [fixture-artist]
release_date: "2026-02-01"
bucket: pop
`,
    'utf8',
  );
  writeFileSync(
    join(dir, STORY),
    `---
title: 픽스처 이야기
date: 2026-09-01
albums:
  - { ref: bucket-buddy }
---

같은 버킷의 다른 앨범만 참조하는 본문.
`,
    'utf8',
  );
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);
  const review = readPage(dir, REVIEW_PATH);
  expect(review).toContain('이 장르가 낯설다면 — 팝 이야기');
  expect(review).toContain(`href="${B}/stories/fixture-story/"`);
});

test('④ none — 대상 0이면 영역 자체가 미출력 (빈 껍데기 금지)', () => {
  rmSync(join(dir, STORY));
  rmSync(join(dir, 'content', 'albums', 'bucket-buddy.yaml'));
  const result = build(dir);
  expect(result.status, result.out.slice(-2000)).toBe(0);
  const review = readPage(dir, REVIEW_PATH);
  // Both ladder lead copies gone = no block at all. (A broad "/stories/"
  // negative would false-positive on the masthead's /archive/stories/ link.)
  expect(review).not.toContain('낯설다면');
  expect(review).not.toContain(`href="${B}/stories/fixture-story/"`);
});
