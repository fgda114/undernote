import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, isValidSlug, combinedSlug, firstAvailableSlug, SLUG_PATTERN } from './slugify.mjs';

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
