/**
 * Turn a writer's plain-language textarea text into valid CommonMark.
 *
 * The writer does not know markdown (docs/publishing.md, 필자용 섹션). They
 * type paragraphs and press Enter between them, the same way they would in
 * any text app — not necessarily twice. Astro's renderer (`render()` from
 * astro:content, plain remark/rehype) follows CommonMark, where a single
 * newline is a SOFT break inside the same paragraph, not a new paragraph.
 * Left alone, a writer's one-Enter-per-thought draft would render as one
 * run-on paragraph.
 *
 * The only transformation applied is structural: every run of newlines in
 * the source becomes a paragraph break in the output (blank line). Nothing
 * about the writer's wording, spelling, spacing or punctuation is touched —
 * that is their voice, not ours to correct (explicit instruction from the
 * publishing design: 필자가 쓴 맞춤법·띄어쓰기·빠진 마침표는 고치지 않는다).
 *
 * One safety net IS applied: a small set of ASCII characters are CommonMark
 * block markers when they open a line (`#`, `-`, `*`, `+`, `>`, `1.`, a
 * fenced-code backtick run). A writer who happens to start a sentence with
 * one of these — "-이런 이유로" is a plausible Korean sentence opener — would
 * otherwise see it silently turn into a heading/list/quote in the published
 * page, which is a much bigger surprise than the fix: CommonMark lets any
 * ASCII punctuation be backslash-escaped without changing how it displays,
 * so `\-이런` still renders as "-이런" but is no longer a list marker.
 * Escaping is scoped to the FIRST character of a paragraph only, so it can
 * never touch inline content or the `[text](url)` link syntax the writer is
 * told they may use (docs/publishing.md).
 */

const LEADING_MARKER = /^(#{1,6}(?=\s|$)|[-*+](?=\s|$)|\d{1,9}[.)](?=\s|$)|>|`{3,}|~{3,})/;

function escapeLeadingMarker(paragraph) {
  const match = LEADING_MARKER.exec(paragraph);
  if (!match) return paragraph;
  const marker = match[1];
  // Escape only the marker's final punctuation character so the escape is
  // visible to CommonMark but invisible to the reader once rendered:
  // "1." -> "1\."  ·  "#" -> "\#"  ·  "```" -> "\`\`\`" collapses to one
  // escape being enough (only the first backtick needs escaping to break
  // the fence-opening rule).
  const escaped = marker.length > 1 && /^\d/.test(marker)
    ? `${marker.slice(0, -1)}\\${marker.slice(-1)}`
    : `\\${marker[0]}${marker.slice(1)}`;
  return escaped + paragraph.slice(marker.length);
}

/**
 * @param {string} raw - the textarea field's raw value, as GitHub returns it.
 * @returns {string} CommonMark body text, paragraphs separated by one blank
 *   line, ready to follow the frontmatter block. No trailing newline is
 *   added — callers append their own file-ending newline once.
 */
export function toMarkdownBody(raw) {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const paragraphs = normalized
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(escapeLeadingMarker);
  return paragraphs.join('\n\n');
}
