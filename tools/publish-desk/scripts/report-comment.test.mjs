import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBuildFailureComment, formatPdErrorComment, formatInfraErrorComment, formatSuccessComment } from './report-comment.mjs';

test('formatBuildFailureComment relays the build report verbatim, framed', () => {
  const report = '## 실패\n\n- `content/reviews/x.md` — E-105: score "8.35"은(는) ...';
  const out = formatBuildFailureComment(report);
  assert.match(out, /아직 발행되지 않았습니다/);
  assert.match(out, /E-105: score "8\.35"/); // the ORIGINAL message text, untouched
  assert.match(out, /다시 시도합니다/);
});

test('formatPdErrorComment includes the PD code and the message verbatim', () => {
  const out = formatPdErrorComment('PD-SLUG-EMPTY', '새 아티스트의 영문 표기가 필요합니다.');
  assert.match(out, /PD-SLUG-EMPTY/);
  assert.match(out, /새 아티스트의 영문 표기가 필요합니다\./);
});

test('formatInfraErrorComment never leaks the raw error, only the run URL', () => {
  const out = formatInfraErrorComment('https://github.com/org/repo/actions/runs/1');
  assert.doesNotMatch(out, /Error:|stack|TypeError/);
  assert.match(out, /https:\/\/github\.com\/org\/repo\/actions\/runs\/1/);
});

test('formatInfraErrorComment omits the run-url line when not given', () => {
  const out = formatInfraErrorComment(undefined);
  assert.doesNotMatch(out, /실행 로그/);
});

test('formatSuccessComment names the kind and includes the URL', () => {
  assert.match(formatSuccessComment({ kind: 'review', url: 'https://x/reviews/y/' }), /평론 주소: https:\/\/x\/reviews\/y\//);
  assert.match(formatSuccessComment({ kind: 'story', url: 'https://x/stories/y/' }), /이야기 주소: https:\/\/x\/stories\/y\//);
});

test('formatSuccessComment: action="update" says "수정됐습니다", not "발행됐습니다"', () => {
  const out = formatSuccessComment({ action: 'update', kind: 'review', url: 'https://x/reviews/y/' });
  assert.match(out, /수정됐습니다/);
  assert.doesNotMatch(out, /발행됐습니다/);
});

test('formatSuccessComment: action="takedown" has no URL, mentions the notes (e.g. artist also removed)', () => {
  const out = formatSuccessComment({ action: 'takedown', kind: 'review', notes: ['아티스트 페이지도 함께 내렸습니다: phoebe-bridgers.'] });
  assert.match(out, /내렸습니다/);
  assert.match(out, /phoebe-bridgers/);
  assert.doesNotMatch(out, /https:\/\//);
});

test('formatBuildFailureComment: WITHOUT createdArtistSlug, relays every failure verbatim (unchanged behavior)', () => {
  const report = ['## 실패', '', '- `content/reviews/x.md` — E-105: score...', '- `content/artists/x.md` — E-113: 아티스트 "x"...', ''].join('\n');
  const out = formatBuildFailureComment(report);
  assert.match(out, /E-105/);
  assert.match(out, /E-113/);
});

test('formatBuildFailureComment: a DERIVED E-113 (same slug this run created) is dropped WHEN another failure exists', () => {
  const report = [
    '## 실패',
    '',
    '- `content/reviews/pipeline-check.md` — E-105: score "8.35"은(는) 소수 1자리 형식이 아닙니다.',
    '- `content/artists/pipeline-check.md` — E-113: 아티스트 "pipeline-check"을(를) 참조하는 글이 없습니다.',
    '',
    '## 경고',
    '',
    '없음.',
    '',
  ].join('\n');
  const out = formatBuildFailureComment(report, { createdArtistSlug: 'pipeline-check' });
  assert.match(out, /E-105/);
  assert.doesNotMatch(out, /E-113/, 'derivative orphan for the artist THIS run created must be filtered out');
});

test('formatBuildFailureComment: an E-113 is NEVER filtered when it is the ONLY failure (no other failure to derive from)', () => {
  const report = ['## 실패', '', '- `content/artists/pipeline-check.md` — E-113: 아티스트 "pipeline-check"을(를) 참조하는 글이 없습니다.', ''].join(
    '\n',
  );
  const out = formatBuildFailureComment(report, { createdArtistSlug: 'pipeline-check' });
  assert.match(out, /E-113/, 'a sole E-113 might be a REAL orphan bug — never hide it');
});

test('formatBuildFailureComment: an E-113 for a DIFFERENT artist is never touched by the filter', () => {
  const report = [
    '## 실패',
    '',
    '- `content/reviews/pipeline-check.md` — E-105: score "8.35"은(는) 소수 1자리 형식이 아닙니다.',
    '- `content/artists/some-other-artist.md` — E-113: 아티스트 "some-other-artist"을(를) 참조하는 글이 없습니다.',
    '',
  ].join('\n');
  const out = formatBuildFailureComment(report, { createdArtistSlug: 'pipeline-check' });
  assert.match(out, /some-other-artist/, 'only the slug THIS run created may ever be suppressed — never a pre-existing orphan');
});

test('formatSuccessComment omits the "참고" block when there are no notes', () => {
  assert.doesNotMatch(formatSuccessComment({ kind: 'review', url: 'https://x/' }), /참고:/);
});

test('formatSuccessComment relays every note under "참고" (2026-09-08 — e.g. an auto-generated slug)', () => {
  const out = formatSuccessComment({
    kind: 'review',
    url: 'https://x/reviews/y/',
    notes: ['아티스트 주소를 자동으로 "artist-abc123"(으)로 정했습니다.', '커버 이미지는 반영되지 않았습니다.'],
  });
  assert.match(out, /참고:/);
  assert.match(out, /- 아티스트 주소를 자동으로 "artist-abc123"\(으\)로 정했습니다\./);
  assert.match(out, /- 커버 이미지는 반영되지 않았습니다\./);
});
