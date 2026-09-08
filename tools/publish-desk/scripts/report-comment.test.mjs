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
