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

/** content/albums/<slug>.yaml — no body (albums are data-only, api-contracts §3.1). */
export function albumFile({ title, artistSlugs, releaseDate, bucket, tags = [], cover, coverSource }) {
  const lines = [
    `title: ${yamlString(title)}`,
    `artists: [${artistSlugs.join(', ')}]`,
    `release_date: "${releaseDate}"`,
    `bucket: ${bucket}`,
  ];
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
 * content/stories/<slug>.md frontmatter + body.
 * @param {{title: string, date: string, body: string, albums: Array<{ref: string} | {text: string, artist?: string}>}} input
 */
export function storyFile({ title, date, body, albums }) {
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
  lines.push('---', '');
  return lines.join('\n') + `\n${body}\n`;
}
