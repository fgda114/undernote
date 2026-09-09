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
 *
 * One narrow, documented exception (2026-09-08): `formatBuildFailureComment`
 * drops a DERIVED E-113 finding — one caused, in the very same run, by a
 * sibling failure this pipeline itself introduced — rather than showing a
 * writer an orphan-artist error about a page they only just created because
 * ITS review failed for an unrelated reason. See `suppressDerivedOrphan`'s
 * own comment for exactly what is and is not removed.
 */

const EDIT_TO_RETRY = '이 이슈를 그대로 수정해서 저장하면(다시 "Submit new issue"를 누를 필요 없이) 자동으로 다시 시도합니다.';

/**
 * Drop the E-113 bullet for `artistSlug` from the "실패" section of a
 * build-report.md, but ONLY when that section ALSO contains at least one
 * OTHER failure. Why that guard matters: this is called only when
 * `artistSlug` is the artist THIS SAME publish run just created
 * (createdArtistSlug on the success result — never guessed from the report
 * itself), so an E-113 for it can only mean one of two things — (a) some
 * OTHER failure in this same report (a bad score, a bad genre, …) made the
 * checker reject the sibling review file, which is the only thing that made
 * this artist reachable, so the "orphan" is a downstream ECHO of that other
 * failure, not new information the writer needs to act on separately; or
 * (b) — if there is no other failure — something has gone wrong in a way
 * this filter does not understand, and hiding it would be a real orphan
 * disappearing from view. Case (b) is why the "at least one other failure"
 * guard exists, and why the filter is scoped to a slug the caller can PROVE
 * this run created: it can never touch an E-113 for any OTHER artist, so a
 * genuine pre-existing orphan is never at risk of being hidden by it.
 *
 * A pure text transform (not a JSON round trip) on purpose: build-report.md
 * has no per-section item COUNT to keep in sync (writeBuildReport,
 * src/lib/checker/index.ts, just emits `## 실패` + one bullet per line), so
 * removing exactly one bullet line — nothing else — cannot desynchronize
 * anything else on the page.
 */
function suppressDerivedOrphan(reportMarkdown, artistSlug) {
  if (!artistSlug) return reportMarkdown;
  const marker = `E-113: 아티스트 "${artistSlug}"`;
  return reportMarkdown
    .split(/(?=^## )/m)
    .map((section) => {
      if (!section.startsWith('## 실패')) return section;
      const lines = section.split('\n');
      const failureLineIdx = lines.reduce((acc, l, i) => (l.startsWith('- `') ? [...acc, i] : acc), []);
      const derivedIdx = failureLineIdx.find((i) => lines[i].includes(marker));
      if (derivedIdx === undefined || failureLineIdx.length <= 1) return section;
      lines.splice(derivedIdx, 1);
      return lines.join('\n');
    })
    .join('');
}

/**
 * A content-validation failure — `reportMarkdown` is reports/build-report.md
 * from the public repo checkout, produced by the SAME gate that guards
 * every other publish (src/lib/checker/index.ts#formatReport). Relayed close
 * to verbatim on purpose (see this module's own header) — the one exception
 * is `createdArtistSlug` (see suppressDerivedOrphan above): a DERIVED E-113
 * this exact run caused, on an artist file this exact run just wrote, is
 * removed from what the writer sees, because it names a problem they cannot
 * fix separately from the real failure already in the same report.
 */
export function formatBuildFailureComment(reportMarkdown, { createdArtistSlug } = {}) {
  return [
    '이 글은 아직 발행되지 않았습니다 — 아래 문제 때문에 사이트 빌드가 실패했습니다.',
    '',
    suppressDerivedOrphan(reportMarkdown, createdArtistSlug).trim(),
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

/**
 * Success comment for all three actions. `action` defaults to 'publish' so
 * every call site from before the update/take-down pipelines existed still
 * behaves exactly as before (backward-compatible signature).
 *
 * `notes` — publishReview/publishStory's own `notes: string[]` (e.g. "커버
 * 이미지는 반영되지 않았습니다", or the 2026-09-08 auto-slug lines from
 * resolveArtist/resolveAlbum, or take-down's "the artist page went too").
 * These describe a DECISION made on the writer's behalf, so they must reach
 * the one place the writer actually reads — this comment — not just sit in
 * the JSON result file. Bulleted under a "참고:" heading in every action,
 * take-down included: a decision made for someone reads the same way
 * whichever pipeline made it.
 */
function noteLines(notes) {
  return notes.length > 0 ? ['참고:', ...notes.map((note) => `- ${note}`), ''] : [];
}

export function formatSuccessComment({ action = 'publish', kind, url, notes = [] }) {
  const label = kind === 'story' ? '이야기' : '평론';
  if (action === 'takedown') {
    // No URL line: the page this comment is about no longer exists.
    const lines = [`이 ${label}을(를) 사이트에서 내렸습니다.`];
    if (notes.length > 0) lines.push('', ...noteLines(notes).slice(0, -1));
    return lines.join('\n');
  }
  const verb = action === 'update' ? '수정' : '발행';
  const lines = [`${verb}됐습니다. ${label} 주소: ${url}`, ''];
  lines.push(...noteLines(notes));
  lines.push('보통 몇 분 안에 실제 사이트에도 반영됩니다.');
  return lines.join('\n');
}
