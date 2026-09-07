import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdownBody } from './body-to-markdown.mjs';

test('single Enter between thoughts becomes a paragraph break', () => {
  const raw = '첫 문장이다\n둘째 문장이다';
  assert.equal(toMarkdownBody(raw), '첫 문장이다\n\n둘째 문장이다');
});

test('an already-blank-line-separated draft is left as-is (idempotent)', () => {
  const raw = '첫 문단\n\n둘째 문단';
  assert.equal(toMarkdownBody(raw), '첫 문단\n\n둘째 문단');
});

test('CRLF line endings are normalized', () => {
  const raw = '첫 줄\r\n둘째 줄';
  assert.equal(toMarkdownBody(raw), '첫 줄\n\n둘째 줄');
});

test('leading/trailing blank lines and runs of blank lines collapse cleanly', () => {
  const raw = '\n\n첫 문단\n\n\n\n둘째 문단\n\n';
  assert.equal(toMarkdownBody(raw), '첫 문단\n\n둘째 문단');
});

test('spelling, spacing and missing punctuation inside a paragraph are untouched', () => {
  const raw = '나는  음악을 찾아서 듣는 편이 아니다 근데 마침표가 없다';
  assert.equal(toMarkdownBody(raw), raw);
});

test('inline [text](url) link syntax is never touched, anywhere in a paragraph', () => {
  const raw = '이건 [이 곡](https://open.spotify.com/track/x) 이야기다\n다음 문단.';
  const result = toMarkdownBody(raw);
  assert.match(result, /\[이 곡\]\(https:\/\/open\.spotify\.com\/track\/x\)/);
  assert.equal(result, '이건 [이 곡](https://open.spotify.com/track/x) 이야기다\n\n다음 문단.');
});

test('a paragraph starting with "- " is escaped so it does not become a list item', () => {
  // CommonMark only treats "-" as a list marker when followed by whitespace
  // (a bare "-word" is just a hyphen) — the escape mirrors that rule exactly.
  assert.equal(toMarkdownBody('- 이런 이유로 좋았다'), '\\- 이런 이유로 좋았다');
});

test('a paragraph starting with "# " is escaped so it does not become a heading', () => {
  assert.equal(toMarkdownBody('# 해시태그 얘기를 시작하며'), '\\# 해시태그 얘기를 시작하며');
});

test('a paragraph starting with "1. " is escaped so it does not become an ordered list', () => {
  assert.equal(toMarkdownBody('1. 트랙이 가장 좋았다'), '1\\. 트랙이 가장 좋았다');
});

test('a paragraph starting with ">" is escaped so it does not become a blockquote', () => {
  assert.equal(toMarkdownBody('>이건 인용이 아니다'), '\\>이건 인용이 아니다');
});

test('a hyphen or hash that is NOT at the start of a paragraph is left alone', () => {
  assert.equal(toMarkdownBody('중간에 -하이픈과 #해시가 있다'), '중간에 -하이픈과 #해시가 있다');
});

test('a leading "-" NOT followed by a space is not a list marker and is left alone', () => {
  assert.equal(toMarkdownBody('-이것은-그냥-단어다'), '-이것은-그냥-단어다');
});
