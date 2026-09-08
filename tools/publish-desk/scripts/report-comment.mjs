/**
 * Pure formatters for the comment the workflow posts back to the issue.
 *
 * Per the pipeline design (docs/publishing.md), a content-validation failure
 * is always the PUBLIC repo's own `npm run build` output, relayed close to
 * verbatim — its E-1xx messages are already written for a non-developer
 * reader (Korean, "무엇이 잘못됐고 어떻게 고치는지"). We do not rephrase
 * them; rephrasing risks silently dropping information from a message
 * someone else designed carefully. We only add one framing sentence so the
 * writer knows what they are looking at and what to do next.
 */

const EDIT_TO_RETRY = '이 이슈를 그대로 수정해서 저장하면(다시 "Submit new issue"를 누를 필요 없이) 자동으로 다시 시도합니다.';

/** A content-validation failure — `reportMarkdown` is reports/build-report.md
 * from the public repo checkout, produced by the SAME gate that guards
 * every other publish (src/lib/checker/index.ts#formatReport). */
export function formatBuildFailureComment(reportMarkdown) {
  return [
    '이 글은 아직 발행되지 않았습니다 — 아래 문제 때문에 사이트 빌드가 실패했습니다.',
    '',
    reportMarkdown.trim(),
    '',
    EDIT_TO_RETRY,
  ].join('\n');
}

/** A pre-check failure this package itself raised (a "PD-*" code — see
 * docs/publishing.md for why these are a distinct namespace from the site's
 * own E-1xx build codes): things the build cannot detect because they are
 * about EXISTING repo state (slug collisions, ambiguous name matches) or
 * about a field the Issue Form itself cannot validate (a dropdown label
 * that no longer matches config/genres.yaml). */
export function formatPdErrorComment(code, message) {
  return [`이 글은 아직 발행되지 않았습니다 (${code}).`, '', message, '', EDIT_TO_RETRY].join('\n');
}

/** An infrastructure failure (checkout/npm ci/push failed) — deliberately
 * does NOT surface the raw error to the writer, who has no action to take
 * on a system fault; the real detail stays in the Action run's own log for
 * the developer (P1: templates render, they don't decide — this comment
 * "renders" a role-appropriate message, the log carries the decision-grade
 * detail). */
export function formatInfraErrorComment(runUrl) {
  return [
    '이 글은 아직 발행되지 않았습니다 — 원고 문제가 아니라 시스템 쪽 오류입니다.',
    '수정할 것은 없습니다. User(개발 담당)에게 이 이슈 번호를 알려주세요.',
    runUrl ? `(개발자용) 실행 로그: ${runUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatSuccessComment({ kind, url }) {
  const label = kind === 'story' ? '이야기' : '평론';
  return [`발행됐습니다. ${label} 주소: ${url}`, '', '보통 몇 분 안에 실제 사이트에도 반영됩니다.'].join('\n');
}
