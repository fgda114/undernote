/**
 * GitHub Issue Form body parser.
 *
 * When a writer submits `.github/ISSUE_TEMPLATE/review.yml` (or story.yml),
 * GitHub renders every field into the issue body as a fixed, documented
 * markdown shape (this format has been stable across GitHub's Issue Forms
 * feature since its GA and is what every third-party issue-form parser
 * relies on — see docs/publishing.md §"검증 못 한 것" for the one thing we
 * could not test against a real issue: we have no live GitHub instance in
 * this environment, so this parser is exercised only against the fixtures
 * in scripts/fixtures/, not a real submitted issue):
 *
 *   ### <field label>
 *
 *   <answer, or literally the text "_No response_" for an empty optional field>
 *
 * repeated once per field, in template order. Checkboxes render as a
 * markdown task list instead of plain text:
 *
 *   ### <field label>
 *
 *   - [X] <option label>
 *
 * This module only knows how to pull a labelled section or a checkbox state
 * out of that shape — it does not judge whether the VALUE is well-formed.
 * Format/semantic validation is intentionally not duplicated here (see
 * resolve-content.mjs and docs/publishing.md for where that judgment is
 * made, and why almost none of it lives in this package).
 */

const NO_RESPONSE = '_No response_';

/** Escape a label for use inside a RegExp (labels are plain text we wrote
 * ourselves in the .yml templates, but this stays correct even if a future
 * label contains regex-special characters). */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the raw text under `### <label>` up to the next KNOWN field
 * heading (or the end of the body). Returns '' for an explicit
 * "_No response_" or a genuinely missing section — callers decide whether ''
 * is acceptable.
 *
 * `knownLabels` MUST be every label GitHub Issue Forms can render for this
 * template (REVIEW_LABELS/STORY_LABELS below — parseReviewForm/parseStoryForm
 * always pass the full set). Only a `### ` line whose text is EXACTLY one of
 * those labels ends the section; any other `### `-looking line is just text
 * the writer typed and stays part of the value. Before this, boundary
 * detection used to be "the next `### ` ANYWHERE" — a writer who typed their
 * own `### 여담`-style aside inside the "글" field had everything after it
 * silently dropped, with no error and a successful publish (caught by
 * review, MJ-2). Treating an UNKNOWN heading as plain text is the safer
 * failure direction: worst case a writer's own `###` line survives verbatim
 * in the markdown output (harmless — it just renders as a heading), instead
 * of the field's own text disappearing.
 */
export function extractField(body, label, knownLabels) {
  // Deliberately NOT the 'm' flag: with multiline mode, `$` matches before
  // EVERY newline in the body, not just true end-of-string — which made the
  // lazy capture below stop after the section's first LINE instead of its
  // last one (caught by a real multi-paragraph fixture in testing). `^` and
  // `$` here mean exactly "start of body" / "end of body"; `(?:^|\n)` finds
  // the heading either way (also matches when it opens the body).
  //
  // The lookahead only stops at a heading line whose text matches one of
  // `knownLabels` verbatim — built as an alternation so `(?:\n### (?:A|B|C)\s*\n|$)`
  // reads as "a KNOWN heading, or end of body". Without a `knownLabels` list
  // (e.g. a caller extracting a sub-slice that never contains further
  // headings, like extractCheckbox's checkbox line search) this falls back
  // to "any `### `", preserving old behaviour for those callers.
  const boundary = knownLabels && knownLabels.length
    ? `(?:\\n### (?:${knownLabels.map(escapeRegExp).join('|')})\\s*\\n|$)`
    : `(?:\\n### |$)`;
  const re = new RegExp(`(?:^|\\n)### ${escapeRegExp(label)}\\s*\\n+([\\s\\S]*?)(?=${boundary})`);
  const match = re.exec(body);
  if (!match) return '';
  const value = match[1].trim();
  return value === NO_RESPONSE ? '' : value;
}

/**
 * Checkbox field state. GitHub only lets a submission through with a
 * `required: true` checkbox item ticked, so in practice this is always true
 * for our editorial_check field by the time the issue exists — this
 * function exists anyway as defence in depth (P1-equivalent: never trust a
 * value just because the UI was supposed to enforce it upstream).
 */
export function extractCheckbox(body, label, optionLabel, knownLabels) {
  const section = extractField(body, label, knownLabels);
  const re = new RegExp(`^-\\s*\\[( |x|X)\\]\\s*${escapeRegExp(optionLabel)}`, 'm');
  const match = re.exec(section);
  return match ? match[1].toLowerCase() === 'x' : false;
}

/**
 * Every CHECKED option's label text under a checkboxes-type field, in
 * template order — for a checkboxes group used as a MULTI-SELECT (the genre
 * field, 2026-09-08), where the caller wants the whole set that was ticked,
 * not one specific option's state (that is extractCheckbox above).
 */
export function extractCheckedOptions(body, label, knownLabels) {
  const section = extractField(body, label, knownLabels);
  const re = /^-\s*\[(x|X)\]\s*(.+)$/gm;
  const checked = [];
  for (const match of section.matchAll(re)) checked.push(match[2].trim());
  return checked;
}

/**
 * Normalize the CRLF GitHub's web editor may hand back into the plain \n
 * every regex above assumes.
 */
function normalize(body) {
  return body.replace(/\r\n?/g, '\n');
}

/** "태그" field raw text -> trimmed, non-empty tag strings, comma-separated
 * (unlike "언급한 앨범들", which is one-per-LINE — tags are short enough that
 * a single line of comma-separated values matches how tag lists are
 * conventionally typed, and keeps the field a single-line `input`, not a
 * multi-line `textarea`). Resolution to a registry slug (matching an
 * existing label, or minting a new one) is NOT this module's job — see
 * resolve-content.mjs#resolveTags, same "parse now, resolve later" split
 * every other field in this file follows. */
function splitTags(raw) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export const REVIEW_LABELS = {
  artistName: '아티스트 이름',
  artistSlugHint: '(선택) 아티스트 영문 표기',
  albumTitle: '앨범 이름',
  albumSlugHint: '(선택) 앨범 주소',
  albumSubtitle: '(선택) 부제',
  releaseDate: '발매일',
  // MULTI-GENRE (2026-09-08): the field became a checkboxes group (see
  // review.yml) so the label carries the "여러 개" hint the field itself
  // now needs — parseReviewForm below reads it with extractCheckedOptions,
  // not extractField.
  genre: '장르 (여러 개 선택 가능)',
  tags: '태그 (있으면, 쉼표로 구분)',
  score: '점수',
  editorialCheck: '최종 확인',
  cover: '커버 이미지 (있으면)',
  body: '글',
};

// Wording neutralized 2026-09-09 (decision-maker request) — was "이 앨범, 안
// 들으면 손해라고 확신합니다." The gate itself (editorial_check must be
// literal true, E-106) is unchanged; only this option's display text is.
export const REVIEW_EDITORIAL_OPTION = '최종 확인했습니다.';

// The exact set of `### ` headings GitHub can render for this template —
// EVERY extractField/extractCheckbox/extractCheckedOptions call below passes
// this as `knownLabels` so a writer's own `### something` line inside a
// textarea (most realistically "글", the last field) is never mistaken for
// the next field's boundary (MJ-2). This array and review.yml's `label:`
// values must match exactly; parse-form.test.mjs asserts that against the
// real template file so drift between the two fails CI instead of silently
// mis-parsing a live submission.
const REVIEW_KNOWN_LABELS = Object.values(REVIEW_LABELS);

/** Pull every field out of a review-template issue body. Every value is a
 * trimmed string (possibly ''); nothing here is validated yet. */
export function parseReviewForm(rawBody) {
  const body = normalize(rawBody);
  return {
    artistName: extractField(body, REVIEW_LABELS.artistName, REVIEW_KNOWN_LABELS),
    artistSlugHint: extractField(body, REVIEW_LABELS.artistSlugHint, REVIEW_KNOWN_LABELS),
    albumTitle: extractField(body, REVIEW_LABELS.albumTitle, REVIEW_KNOWN_LABELS),
    albumSlugHint: extractField(body, REVIEW_LABELS.albumSlugHint, REVIEW_KNOWN_LABELS),
    albumSubtitle: extractField(body, REVIEW_LABELS.albumSubtitle, REVIEW_KNOWN_LABELS),
    releaseDate: extractField(body, REVIEW_LABELS.releaseDate, REVIEW_KNOWN_LABELS),
    // MULTI-GENRE (2026-09-08): zero or more checked labels, template order,
    // never deduplicated/validated here (see resolveGenreBuckets for why).
    genreLabels: extractCheckedOptions(body, REVIEW_LABELS.genre, REVIEW_KNOWN_LABELS),
    tagTexts: splitTags(extractField(body, REVIEW_LABELS.tags, REVIEW_KNOWN_LABELS)),
    score: extractField(body, REVIEW_LABELS.score, REVIEW_KNOWN_LABELS),
    editorialCheck: extractCheckbox(body, REVIEW_LABELS.editorialCheck, REVIEW_EDITORIAL_OPTION, REVIEW_KNOWN_LABELS),
    coverField: extractField(body, REVIEW_LABELS.cover, REVIEW_KNOWN_LABELS),
    // "글" is the LAST field in review.yml, so its boundary is really just
    // "end of body" — but it goes through the same knownLabels-guarded call
    // as every other field rather than a separate "read to the end" path,
    // so this stays correct even if a future template reorders fields.
    bodyText: extractField(body, REVIEW_LABELS.body, REVIEW_KNOWN_LABELS),
  };
}

export const STORY_LABELS = {
  title: '제목',
  albums: '언급한 앨범들 (있으면)',
  tags: '태그 (있으면, 쉼표로 구분)',
  body: '글',
};

// See REVIEW_KNOWN_LABELS above — same reasoning, story.yml's template.
const STORY_KNOWN_LABELS = Object.values(STORY_LABELS);

/** Pull every field out of a story-template issue body. */
export function parseStoryForm(rawBody) {
  const body = normalize(rawBody);
  const albumsRaw = extractField(body, STORY_LABELS.albums, STORY_KNOWN_LABELS);
  return {
    title: extractField(body, STORY_LABELS.title, STORY_KNOWN_LABELS),
    // One mention per line: "앨범명 (아티스트명)" or bare "앨범명".
    albumLines: albumsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    tagTexts: splitTags(extractField(body, STORY_LABELS.tags, STORY_KNOWN_LABELS)),
    bodyText: extractField(body, STORY_LABELS.body, STORY_KNOWN_LABELS),
  };
}
