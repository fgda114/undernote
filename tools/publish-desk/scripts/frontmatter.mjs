/**
 * Pure frontmatter assemblers — field values in, exact file text out.
 *
 * These mirror the hand-written frontmatter shape already used throughout
 * the public repo's own content/ (see e.g. content/reviews/*.md and
 * scripts/album-add.ts's albumYaml()/artistMarkdown()), not the public
 * repo's Zod schemas: shape/format validity is the build's job (E-1xx),
 * not ours (docs/publishing.md §"검증을 중복 구현하지 마십시오"). The one
 * rule enforced HERE rather than left to the build is quoting: `score` and
 * `release_date` are always emitted as quoted YAML strings, because an
 * unquoted numeric-looking value is a determinism trap the schema exists to
 * catch (src/lib/schema/review.ts's own comment: "An unquoted `score: 8.35`
 * arrives here as a JS number") — quoting is a mechanical constant, not a
 * judgment call, so getting it right here costs nothing and saves a
 * guaranteed first-round build failure for every single submission.
 */

/** JSON.stringify doubles as a correct single-line YAML double-quoted
 * scalar (same escaping rules for \, ", control chars) — used everywhere a
 * free-text string must be quoted, matching scripts/album-add.ts's own
 * artistMarkdown(). */
function yamlString(value) {
  return JSON.stringify(value);
}

/** content/reviews/<album-slug>.md frontmatter + body. */
export function reviewFile({ albumSlug, score, date, body }) {
  const front = ['---', `album: ${albumSlug}`, `score: "${score}"`, `date: ${date}`, `editorial_check: true`, '---', ''].join(
    '\n',
  );
  return `${front}\n${body}\n`;
}

/** content/albums/<slug>.yaml — no body (albums are data-only, api-contracts §3.1).
 * `buckets` (MULTI-GENRE, 2026-09-08 — was singular `bucket`): one or more
 * bucket ids, written verbatim in the order resolveGenreBuckets returned
 * them (checked-option / template order — carries no ranking meaning, see
 * src/lib/schema/album.ts). `subtitle` (2026-09-09, "(선택) 부제" form field)
 * and `duration` (2026-09-09, "(선택) 앨범 길이" form field) are both omitted
 * entirely when absent — same "no key at all, not an empty string"
 * convention as `cover`/`tags` below, so an old album written before either
 * field existed and a new album with neither typed are byte-identical (both
 * schema fields are optional, api-contracts stays backward compatible
 * either way). `duration` is written UNQUOTED, unlike `score`/`release_date`
 * above: this file's own module doc explains why THOSE need quoting (YAML
 * would otherwise silently reinterpret a numeric-looking scalar) — a
 * "MM:SS" value like "52:26" has no such trap (verified against both YAML
 * parsers this project uses, see src/lib/schema/common.ts#durationSchema),
 * so quoting it would only add visual noise with no correctness benefit. */
export function albumFile({ title, artistSlugs, releaseDate, subtitle, duration, buckets, tags = [], cover, coverSource }) {
  const lines = [
    `title: ${yamlString(title)}`,
    `artists: [${artistSlugs.join(', ')}]`,
    `release_date: "${releaseDate}"`,
    `buckets: [${buckets.join(', ')}]`,
  ];
  if (subtitle) lines.push(`subtitle: ${yamlString(subtitle)}`);
  if (duration) lines.push(`duration: ${duration}`);
  if (tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);
  if (cover) lines.push(`cover: ${cover}`, `cover_source: ${yamlString(coverSource ?? '')}`);
  return lines.join('\n') + '\n';
}

/**
 * Surgically set (or replace) the `cover:` and `cover_source:` lines of an
 * EXISTING album YAML file's raw text — used by the publish desk's "수정"
 * (update) path, where a writer adds/replaces a cover on an album that was
 * already published, possibly long ago.
 *
 * Why a line-level edit instead of the parse-then-`albumFile()` round trip
 * every other writer in this file uses? `albumFile()` only knows the fields
 * THIS package ever writes (title/artists/release_date/bucket/tags/cover/
 * cover_source) — a developer may since have hand-added `mbid`, `label`, or
 * `listen_links` (album-add.ts writes all three). Regenerating the whole
 * file from a plain object would silently DROP those — a correct-looking
 * cover update that quietly destroys unrelated data is exactly the kind of
 * failure this project does not accept (no swallowed data loss). Touching
 * only the two lines this operation actually owns has no such risk and is
 * directly testable against a real hand-shaped album.yaml fixture.
 */
export function updateAlbumCover(rawYaml, { cover, coverSource }) {
  const lines = rawYaml.replace(/\n$/, '').split('\n');
  const coverLine = `cover: ${cover}`;
  const sourceLine = `cover_source: ${yamlString(coverSource)}`;
  const coverIdx = lines.findIndex((l) => /^cover:\s/.test(l));
  const sourceIdx = lines.findIndex((l) => /^cover_source:\s/.test(l));
  if (coverIdx === -1) {
    // No prior cover at all (an E-202 placeholder album) — append both.
    lines.push(coverLine, sourceLine);
  } else {
    lines[coverIdx] = coverLine;
    if (sourceIdx === -1) lines.splice(coverIdx + 1, 0, sourceLine);
    else lines[sourceIdx] = sourceLine;
  }
  return lines.join('\n') + '\n';
}

/** content/artists/<slug>.md — empty body is a designed state (US-14); the
 * publish-desk pipeline never has intro-text to offer, so it always writes
 * an empty body, exactly like album-add.ts's artistMarkdown(). */
export function artistFile({ name }) {
  return `---\nname: ${yamlString(name)}\n---\n`;
}

/**
 * content/stories/<slug>.md frontmatter + body. `tags` (2026-09-09) mirrors
 * albumFile's own convention — omitted entirely when empty, never an
 * explicit `tags: []` (unlike `albums:`, which IS always written even when
 * empty, per the test below — `albums` is the ladder's own required axis so
 * its absence-vs-empty distinction matters structurally; `tags` has no such
 * consumer that cares about the difference, so the shorter, cleaner omission
 * is preferred, matching every other optional field in this file).
 * @param {{title: string, date: string, body: string, albums: Array<{ref: string} | {text: string, artist?: string}>, tags?: string[]}} input
 */
export function storyFile({ title, date, body, albums, tags = [] }) {
  const lines = ['---', `title: ${yamlString(title)}`, `date: ${date}`];
  if (albums.length === 0) {
    lines.push('albums: []');
  } else {
    lines.push('albums:');
    for (const a of albums) {
      if ('ref' in a) lines.push(`  - { ref: ${a.ref} }`);
      else if (a.artist) lines.push(`  - { text: ${yamlString(a.text)}, artist: ${yamlString(a.artist)} }`);
      else lines.push(`  - { text: ${yamlString(a.text)} }`);
    }
  }
  if (tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);
  lines.push('---', '');
  return lines.join('\n') + `\n${body}\n`;
}

/**
 * Register newly-minted tags into config/tags.yaml's raw text (2026-09-09 —
 * resolve-content.mjs#resolveTags decides WHICH tags are new; this function
 * only writes them). A LINE-level append, same reasoning as
 * `updateAlbumCover` above: `config/tags.yaml` is not a file this package
 * fully owns the shape of (a developer may hand-curate `aliases:` on any
 * entry at any time), so a parse-then-regenerate round trip risks silently
 * dropping hand-added data the tagRegistrySchema itself allows but this
 * package never reads (aliases beyond what it writes here — always `[]` for
 * a brand-new tag, a developer fills them in later if a tag turns out to
 * need one).
 *
 * Handles the two real shapes `config/tags.yaml` can be in: a block list
 * with at least one existing entry (the common case — new lines simply
 * extend it), and the file's own shipped-empty form `tags: []` (a flow-style
 * empty list, which cannot have block-style items appended after it without
 * becoming invalid YAML — the flow form is rewritten to a bare `tags:`
 * header first, then followed by the new entries as normal block items).
 */
export function appendTagEntries(rawYaml, entries) {
  if (entries.length === 0) return rawYaml;
  let text = rawYaml.replace(/\r\n/g, '\n').replace(/\n$/, '');
  const newLines = entries.map((e) => `  - { slug: ${e.slug}, label: ${yamlString(e.label)}, aliases: [] }`);
  if (/^tags:\s*\[\s*\]\s*$/m.test(text)) {
    text = text.replace(/^tags:\s*\[\s*\]\s*$/m, 'tags:');
  } else if (!/^tags:\s*$/m.test(text)) {
    // No `tags:` key at all (an empty/missing file) — start one. Unreachable
    // for the public repo's real config/tags.yaml (the checker requires the
    // file to exist, E-100), kept only so this function never assumes a
    // shape it has not verified.
    text = text.length > 0 ? `${text}\ntags:` : 'tags:';
  }
  return `${text}\n${newLines.join('\n')}\n`;
}
