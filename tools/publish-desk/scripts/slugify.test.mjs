import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, isValidSlug, combinedSlug, firstAvailableSlug, hashSlugFragment, fallbackSlug, SLUG_PATTERN } from './slugify.mjs';

test('slugify: ASCII display name becomes kebab-case', () => {
  assert.equal(slugify('Phoebe Bridgers'), 'phoebe-bridgers');
  assert.equal(slugify('Boy Genius'), 'boy-genius');
});

test('slugify: diacritics are stripped, not dropped', () => {
  assert.equal(slugify('Beyoncé'), 'beyonce');
  assert.equal(slugify('Sigur Rós'), 'sigur-ros');
});

test('slugify: ampersand becomes "and"', () => {
  assert.equal(slugify('Selena & The Band'), 'selena-and-the-band');
});

test('slugify: punctuation collapses to single hyphens, no leading/trailing hyphen', () => {
  assert.equal(slugify('  --Lost Weekend!! (Deluxe)--  '), 'lost-weekend-deluxe');
});

test('slugify: all-Korean input yields empty string (caller must ask for a romanization)', () => {
  assert.equal(slugify('피비 브리저스'), '');
});

test('isValidSlug matches SLUG_PATTERN exactly', () => {
  assert.equal(isValidSlug('phoebe-bridgers'), true);
  assert.equal(isValidSlug('phoebe--bridgers'), false); // no // in pattern, double hyphen invalid
  assert.equal(isValidSlug('Phoebe-Bridgers'), false); // uppercase invalid
  assert.equal(isValidSlug('-phoebe'), false); // leading hyphen invalid
  assert.equal(isValidSlug(''), false);
  assert.equal(isValidSlug(undefined), false);
});

test('SLUG_PATTERN is anchored (no partial match)', () => {
  assert.equal(SLUG_PATTERN.test('ok-slug extra'), false);
});

test('combinedSlug joins artist + title through slugify', () => {
  assert.equal(combinedSlug(['Phoebe Bridgers', 'Lost Weekend']), 'phoebe-bridgers-lost-weekend');
});

test('combinedSlug drops falsy parts', () => {
  assert.equal(combinedSlug(['Phoebe Bridgers', '', undefined]), 'phoebe-bridgers');
});

test('firstAvailableSlug returns the base when free', () => {
  assert.equal(firstAvailableSlug('some-story', new Set()), 'some-story');
});

test('firstAvailableSlug increments on collision', () => {
  const taken = new Set(['some-story', 'some-story-2']);
  assert.equal(firstAvailableSlug('some-story', taken), 'some-story-3');
});

// ── fallbackSlug / hashSlugFragment (2026-09-08 — no more asking back) ────

test('hashSlugFragment is deterministic (same text → same fragment, every run)', () => {
  assert.equal(hashSlugFragment('피비 브리저스'), hashSlugFragment('피비 브리저스'));
});

test('hashSlugFragment is a valid slug fragment (lowercase hex, fixed length)', () => {
  assert.match(hashSlugFragment('아무 이름'), /^[a-f0-9]{6}$/);
});

test('hashSlugFragment differs for different text (not a constant)', () => {
  assert.notEqual(hashSlugFragment('아이유'), hashSlugFragment('아이유 '));
});

test('fallbackSlug("album", …): all-Korean title → release year-month, no romanized part', () => {
  const slug = fallbackSlug('album', '한글 제목', '2026-05-03');
  assert.equal(slug, '202605');
  assert.equal(isValidSlug(slug), true);
});

test('fallbackSlug("album", …): a mixed-script title keeps its romanized fragment after the year-month', () => {
  const slug = fallbackSlug('album', 'phoebe-bridgers 한글 제목', '2026-05-03');
  assert.equal(slug, '202605-phoebe-bridgers');
});

test('fallbackSlug("album", …): year-only release date pads the month', () => {
  assert.equal(fallbackSlug('album', '한글', '2026'), '202600');
});

test('fallbackSlug("album", …): no release date at all falls back to the content hash', () => {
  const slug = fallbackSlug('album', '한글 제목', undefined);
  assert.equal(slug, hashSlugFragment('한글 제목'));
});

test('fallbackSlug("artist", …): all-Korean name → "artist-" + content hash', () => {
  const slug = fallbackSlug('artist', '피비 브리저스');
  assert.equal(slug, `artist-${hashSlugFragment('피비 브리저스')}`);
  assert.equal(isValidSlug(slug), true);
});

test('fallbackSlug("artist", …): a mixed-script name keeps its romanized fragment before the hash', () => {
  const slug = fallbackSlug('artist', 'BTS 한글그룹');
  assert.equal(slug, `bts-${hashSlugFragment('BTS 한글그룹')}`);
});

test('fallbackSlug is deterministic across repeated calls (same input → same output)', () => {
  assert.equal(fallbackSlug('artist', '같은 이름'), fallbackSlug('artist', '같은 이름'));
  assert.equal(fallbackSlug('album', '같은 제목', '2026-01-01'), fallbackSlug('album', '같은 제목', '2026-01-01'));
});
