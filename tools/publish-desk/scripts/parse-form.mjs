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
 * Extract the raw text under `### <label>` up to the next `### ` heading (or
 * the end of the body). Returns '' for an explicit "_No response_" or a
 * genuinely missing section — callers decide whether '' is acceptable.
 */
export function extractField(body, label) {
  // Deliberately NOT the 'm' flag: with multiline mode, `$` matches before
  // EVERY newline in the body, not just true end-of-string — which made the
  // lazy capture below stop after the section's first LINE instead of its
  // last one (caught by a real multi-paragraph fixture in testing). `^` and
  // `$` here mean exactly "start of body" / "end of body"; `(?:^|\n)` finds
  // the heading either way (also matches when it opens the body).
  const re = new RegExp(`(?:^|\\n)### ${escapeRegExp(label)}\\s*\\n+([\\s\\S]*?)(?=\\n### |$)`);
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
export function extractCheckbox(body, label, optionLabel) {
  const section = extractField(body, label);
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
export function extractCheckedOptions(body, label) {
  const section = extractField(body, label);
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

export const REVIEW_LABELS = {
  artistName: '아티스트 이름',
  artistSlugHint: '(선택) 아티스트 영문 표기',
  albumTitle: '앨범 이름',
  albumSlugHint: '(선택) 앨범 주소',
  releaseDate: '발매일',
  // MULTI-GENRE (2026-09-08): the field became a checkboxes group (see
  // review.yml) so the label carries the "여러 개" hint the field itself
  // now needs — parseReviewForm below reads it with extractCheckedOptions,
  // not extractField.
  genre: '장르 (여러 개 선택 가능)',
  score: '점수',
  editorialCheck: '최종 확인',
  cover: '커버 이미지 (있으면)',
  body: '글',
};

export const REVIEW_EDITORIAL_OPTION = '이 앨범, 안 들으면 손해라고 확신합니다.';

/** Pull every field out of a review-template issue body. Every value is a
 * trimmed string (possibly ''); nothing here is validated yet. */
export function parseReviewForm(rawBody) {
  const body = normalize(rawBody);
  return {
    artistName: extractField(body, REVIEW_LABELS.artistName),
    artistSlugHint: extractField(body, REVIEW_LABELS.artistSlugHint),
    albumTitle: extractField(body, REVIEW_LABELS.albumTitle),
    albumSlugHint: extractField(body, REVIEW_LABELS.albumSlugHint),
    releaseDate: extractField(body, REVIEW_LABELS.releaseDate),
    // MULTI-GENRE (2026-09-08): zero or more checked labels, template order,
    // never deduplicated/validated here (see resolveGenreBuckets for why).
    genreLabels: extractCheckedOptions(body, REVIEW_LABELS.genre),
    score: extractField(body, REVIEW_LABELS.score),
    editorialCheck: extractCheckbox(body, REVIEW_LABELS.editorialCheck, REVIEW_EDITORIAL_OPTION),
    coverField: extractField(body, REVIEW_LABELS.cover),
    bodyText: extractField(body, REVIEW_LABELS.body),
  };
}

export const STORY_LABELS = {
  title: '제목',
  albums: '언급한 앨범들 (있으면)',
  body: '글',
};

/** Pull every field out of a story-template issue body. */
export function parseStoryForm(rawBody) {
  const body = normalize(rawBody);
  const albumsRaw = extractField(body, STORY_LABELS.albums);
  return {
    title: extractField(body, STORY_LABELS.title),
    // One mention per line: "앨범명 (아티스트명)" or bare "앨범명".
    albumLines: albumsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    bodyText: extractField(body, STORY_LABELS.body),
  };
}
