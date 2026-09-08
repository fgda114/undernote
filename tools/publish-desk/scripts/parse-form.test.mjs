import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { extractField, extractCheckbox, extractCheckedOptions, parseReviewForm, parseStoryForm } from './parse-form.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');

test('extractField pulls the section body and stops at the next heading', () => {
  const body = '### A\n\nvalue a\n\n### B\n\nvalue b\n';
  assert.equal(extractField(body, 'A'), 'value a');
  assert.equal(extractField(body, 'B'), 'value b');
});

test('extractField returns "" for an explicit "_No response_"', () => {
  const body = '### A\n\n_No response_\n';
  assert.equal(extractField(body, 'A'), '');
});

test('extractField returns "" for a section that does not exist', () => {
  assert.equal(extractField('### Only\n\nvalue\n', 'Missing'), '');
});

test('extractCheckbox reads a ticked box', () => {
  const body = '### 확인\n\n- [X] 동의합니다.\n';
  assert.equal(extractCheckbox(body, '확인', '동의합니다.'), true);
});

test('extractCheckbox reads an unticked box as false', () => {
  const body = '### 확인\n\n- [ ] 동의합니다.\n';
  assert.equal(extractCheckbox(body, '확인', '동의합니다.'), false);
});

test('extractCheckedOptions returns every ticked label, in order, skipping unticked ones', () => {
  const body = '### 장르\n\n- [X] Rock\n- [ ] Pop\n- [x] Hip-Hop / R&B\n';
  assert.deepEqual(extractCheckedOptions(body, '장르'), ['Rock', 'Hip-Hop / R&B']);
});

test('extractCheckedOptions returns [] when nothing is ticked', () => {
  const body = '### 장르\n\n- [ ] Rock\n- [ ] Pop\n';
  assert.deepEqual(extractCheckedOptions(body, '장르'), []);
});

test('parseReviewForm extracts every field from a full real-shaped fixture', () => {
  const parsed = parseReviewForm(fixture('review-form-body.txt'));
  assert.equal(parsed.artistName, '피비 브리저스');
  assert.equal(parsed.artistSlugHint, 'phoebe-bridgers');
  assert.equal(parsed.albumTitle, 'Lost Weekend');
  assert.equal(parsed.albumSlugHint, '');
  assert.equal(parsed.releaseDate, '2026');
  assert.deepEqual(parsed.genreLabels, ['Hip-Hop / R&B', 'Rock']); // MULTI-GENRE fixture
  assert.equal(parsed.score, '8.4');
  assert.equal(parsed.editorialCheck, true);
  assert.match(parsed.coverField, /^!\[lost-weekend\]\(https:\/\/private-user-images/);
  assert.match(parsed.bodyText, /이 앨범도 그렇게 접했다/);
  assert.match(parsed.bodyText, /\[이 곡\]\(https:\/\/open\.spotify\.com/);
});

test('parseReviewForm handles the minimal/optional-fields-empty fixture', () => {
  const parsed = parseReviewForm(fixture('review-form-body-minimal.txt'));
  assert.equal(parsed.releaseDate, '2026-05-03');
  assert.deepEqual(parsed.genreLabels, ['그 외']);
  assert.equal(parsed.score, '8.35'); // deliberately malformed — validated later, not here
  assert.equal(parsed.coverField, '');
  assert.equal(parsed.editorialCheck, true);
});

test('parseStoryForm splits "언급한 앨범들" into one entry per line', () => {
  const parsed = parseStoryForm(fixture('story-form-body.txt'));
  assert.equal(parsed.title, '93년 여름의 플레이리스트');
  assert.deepEqual(parsed.albumLines, ['Lost Weekend (피비 브리저스)', '아직 평론 없는 어떤 앨범 (아직 모르는 아티스트)']);
  assert.match(parsed.bodyText, /그 해 여름은 유난히 길었다/);
});
