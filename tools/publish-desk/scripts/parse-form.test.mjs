import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  extractField,
  extractCheckbox,
  extractCheckedOptions,
  parseReviewForm,
  parseStoryForm,
  REVIEW_LABELS,
  STORY_LABELS,
} from './parse-form.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');

/** Read the `label:` GitHub will actually render for every field in an Issue
 * Form template, in template order (markdown-only blocks have no `label` and
 * are skipped — GitHub never renders a `### ` heading for those either). */
function templateLabels(templatePath) {
  const doc = parseYaml(readFileSync(templatePath, 'utf8'));
  return doc.body.filter((field) => field.attributes?.label).map((field) => field.attributes.label);
}

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

// MJ-2 (code review, 2026-09-09): a writer's own "### " line inside a field
// used to be mistaken for the NEXT field's heading, silently dropping
// everything after it — no error, no PD-* code, publish "succeeded" with a
// truncated review. Reproduces the lead's exact repro case.
test('extractField does NOT stop at a "### " line the writer typed themselves', () => {
  const body = [
    '### A',
    '',
    '첫 문단입니다.',
    '',
    '### 여담',
    '',
    '이 뒤의 문단이 살아 있어야 합니다.',
    '',
    '마지막 문단입니다.',
    '',
    '### B',
    '',
    'value b',
    '',
  ].join('\n');
  // Without a knownLabels list ("A" isn't part of a known set here), the
  // writer's own "### 여담" would still end the section under the OLD
  // behaviour — passing knownLabels=['A', 'B'] is what fixes it: only a
  // heading matching one of those two ends "A"'s section.
  const value = extractField(body, 'A', ['A', 'B']);
  assert.match(value, /첫 문단입니다\./);
  assert.match(value, /### 여담/);
  assert.match(value, /이 뒤의 문단이 살아 있어야 합니다\./);
  assert.match(value, /마지막 문단입니다\./);
  assert.equal(extractField(body, 'B', ['A', 'B']), 'value b');
});

test('extractField without knownLabels keeps the old "any ### " behaviour (fallback for callers with no fixed field set)', () => {
  const body = '### A\n\nfirst\n\n### 여담\n\nlost\n\n### B\n\nvalue b\n';
  assert.equal(extractField(body, 'A'), 'first');
});

// Guards against the two label lists (this file's REVIEW_LABELS/STORY_LABELS
// vs. the Issue Form templates' own `label:` values) drifting apart —
// review.yml's own comment already flags this as a hand-synced pair for the
// genre options; this test extends the same guarantee to every field label,
// since parseReviewForm/parseStoryForm now depend on the FULL set matching
// exactly for field-boundary detection (not just individual lookups).
test('REVIEW_LABELS matches review.yml label text and order exactly', () => {
  const templatePath = join(here, '..', '.github', 'ISSUE_TEMPLATE', 'review.yml');
  assert.deepEqual(Object.values(REVIEW_LABELS), templateLabels(templatePath));
});

test('STORY_LABELS matches story.yml label text and order exactly', () => {
  const templatePath = join(here, '..', '.github', 'ISSUE_TEMPLATE', 'story.yml');
  assert.deepEqual(Object.values(STORY_LABELS), templateLabels(templatePath));
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
  assert.equal(parsed.albumSubtitle, 'Deluxe Edition');
  assert.equal(parsed.releaseDate, '2026');
  assert.deepEqual(parsed.genreLabels, ['Hip-Hop / R&B', 'Rock']); // MULTI-GENRE fixture
  assert.deepEqual(parsed.tagTexts, ['시티팝', 'dream pop']);
  assert.equal(parsed.score, '8.4');
  assert.equal(parsed.editorialCheck, true);
  assert.match(parsed.coverField, /^!\[lost-weekend\]\(https:\/\/private-user-images/);
  assert.match(parsed.bodyText, /이 앨범도 그렇게 접했다/);
  assert.match(parsed.bodyText, /\[이 곡\]\(https:\/\/open\.spotify\.com/);
});

test('parseReviewForm handles the minimal/optional-fields-empty fixture', () => {
  const parsed = parseReviewForm(fixture('review-form-body-minimal.txt'));
  assert.equal(parsed.albumSubtitle, '');
  assert.equal(parsed.releaseDate, '2026-05-03');
  assert.deepEqual(parsed.genreLabels, ['그 외']);
  assert.deepEqual(parsed.tagTexts, []);
  assert.equal(parsed.score, '8.35'); // deliberately malformed — validated later, not here
  assert.equal(parsed.coverField, '');
  assert.equal(parsed.editorialCheck, true);
});

// PD-COVER-NOT-IMAGE real-world repro (2026-09-09, `fgda114/undernote-desk#2`)
// — this fixture's cover field is the ACTUAL HTML GitHub inserted, not a
// hand-written markdown stand-in (see the fixture file's own "글" text).
test('parseReviewForm: the cover field can be a real GitHub <img> tag, not just markdown', () => {
  const parsed = parseReviewForm(fixture('review-form-body-img-cover.txt'));
  assert.match(parsed.coverField, /^<img width="640" height="640" alt="Image" src="https:\/\/github\.com\/user-attachments\/assets\//);
});

test('parseStoryForm splits "언급한 앨범들" into one entry per line', () => {
  const parsed = parseStoryForm(fixture('story-form-body.txt'));
  assert.equal(parsed.title, '93년 여름의 플레이리스트');
  assert.deepEqual(parsed.albumLines, ['Lost Weekend (피비 브리저스)', '아직 평론 없는 어떤 앨범 (아직 모르는 아티스트)']);
  assert.deepEqual(parsed.tagTexts, ['여름', '플레이리스트']);
  assert.match(parsed.bodyText, /그 해 여름은 유난히 길었다/);
});
