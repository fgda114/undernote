import { test } from 'node:test';
import assert from 'node:assert/strict';
import { determineMode } from './determine-mode.mjs';

const REVIEW = ['publish:review'];
const REVIEW_PUBLISHED = ['publish:review', 'published'];
const STORY = ['publish:story'];

test('determineMode: a brand new review issue -> publish', () => {
  assert.equal(determineMode({ eventName: 'issues', action: 'opened', issueLabels: REVIEW }), 'publish');
});

test('determineMode: editing an UNPUBLISHED issue (fixing a PD-* error) -> publish (retry)', () => {
  assert.equal(determineMode({ eventName: 'issues', action: 'edited', issueLabels: REVIEW }), 'publish');
});

test('determineMode: editing an ALREADY-PUBLISHED issue -> update', () => {
  assert.equal(determineMode({ eventName: 'issues', action: 'edited', issueLabels: REVIEW_PUBLISHED }), 'update');
});

test('determineMode: editing an already-published STORY -> update', () => {
  assert.equal(determineMode({ eventName: 'issues', action: 'edited', issueLabels: [...STORY, 'published'] }), 'update');
});

test('determineMode: adding OUR take-down label -> takedown', () => {
  assert.equal(
    determineMode({ eventName: 'issues', action: 'labeled', labelName: '내림', issueLabels: REVIEW_PUBLISHED }),
    'takedown',
  );
});

test('determineMode: adding an UNRELATED label -> skip (never reacts to a stranger label)', () => {
  assert.equal(
    determineMode({ eventName: 'issues', action: 'labeled', labelName: 'bug', issueLabels: REVIEW_PUBLISHED }),
    'skip',
  );
});

test('determineMode: an issue with neither publish:review nor publish:story -> skip', () => {
  assert.equal(determineMode({ eventName: 'issues', action: 'opened', issueLabels: ['question'] }), 'skip');
});

test('determineMode: a non-issues event -> skip', () => {
  assert.equal(determineMode({ eventName: 'pull_request', action: 'opened', issueLabels: REVIEW }), 'skip');
});

test('determineMode: an unrecognized action on our template -> skip', () => {
  assert.equal(determineMode({ eventName: 'issues', action: 'closed', issueLabels: REVIEW }), 'skip');
});

test('determineMode: take-down label added to an issue that is somehow not yet published -> still takedown', () => {
  // Defensive: determineMode does not gate 'takedown' on the published label
  // itself — publish.mjs's own resolveOriginalPublication is the real
  // authority on whether there is anything to take down at all.
  assert.equal(determineMode({ eventName: 'issues', action: 'labeled', labelName: '내림', issueLabels: REVIEW }), 'takedown');
});
