/**
 * Reads the checked-out PUBLIC repo (content/, config/genres.yaml) to answer
 * three questions the build cannot ask on our behalf, because they are not
 * shape/format questions — they are "does this already exist" questions:
 *
 *   1. Does an artist with this name already have a page? (reuse its slug,
 *      never create a second file for the same person.)
 *   2. Does an album by this artist with this title already exist? (reuse
 *      it — this is the normal path for a review that follows an
 *      album-add.ts run, per that script's own "다음 단계" message.)
 *   3. Which config/genres.yaml bucket id does the dropdown's selected
 *      LABEL correspond to? (the Issue Form can only offer static text —
 *      see docs/publishing.md for why this is resolved against the LIVE
 *      config at run time instead of a hardcoded label→id table that could
 *      drift out of sync with it.)
 *
 * Every function here takes an explicit `root` path (the public repo
 * checkout) rather than assuming `process.cwd()`, so tests can point it at
 * a small fixture tree instead of a real checkout.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function readFrontmatter(path) {
  const raw = readFileSync(path, 'utf8');
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return null;
  return parseYaml(match[1]) ?? {};
}

function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort();
}

/** Normalize a display name for equality comparison: Unicode-normalize,
 * collapse internal whitespace, trim, lowercase (ASCII names only — Korean
 * has no case, so lowercasing is a no-op for them and exact for the rest). */
export function normalizeName(name) {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** @returns {Array<{slug: string, name: string}>} every content/artists/*.md. */
export function listArtists(root) {
  const dir = join(root, 'content', 'artists');
  return listFiles(dir, '.md').map((f) => {
    const slug = f.slice(0, -3);
    const data = readFrontmatter(join(dir, f));
    return { slug, name: String(data?.name ?? '') };
  });
}

/** @returns {Array<{slug: string, title: string, artists: string[]}>} every content/albums/*.yaml. */
export function listAlbums(root) {
  const dir = join(root, 'content', 'albums');
  return listFiles(dir, '.yaml').map((f) => {
    const slug = f.slice(0, -5);
    const raw = readFileSync(join(dir, f), 'utf8');
    const data = parseYaml(raw) ?? {};
    return { slug, title: String(data.title ?? ''), artists: Array.isArray(data.artists) ? data.artists : [] };
  });
}

export function existingSlugSet(root, kind, ext) {
  return new Set(listFiles(join(root, 'content', kind), ext).map((f) => f.slice(0, -ext.length)));
}

/**
 * @returns {Array<{slug: string, album: string}>} every content/reviews/*.md,
 * reduced to just its own `album:` reference. Used by takedown.mjs to answer
 * "does any SURVIVING review still point at this album" — not a shape/schema
 * read (that is the build's job), so an unparsable or partially-invalid file
 * still contributes whatever `album` value it has rather than being dropped
 * silently (a takedown plan must never UNDER-count references).
 */
export function listReviews(root) {
  const dir = join(root, 'content', 'reviews');
  return listFiles(dir, '.md').map((f) => {
    const slug = f.slice(0, -3);
    const data = readFrontmatter(join(dir, f));
    return { slug, album: String(data?.album ?? '') };
  });
}

/**
 * @returns {Array<{slug: string, albumRefs: string[]}>} every
 * content/stories/*.md, reduced to the album slugs it {ref}-erences. A
 * free-text `{text, artist}` mention is deliberately excluded — it carries
 * no reachability, exactly mirroring how src/lib/derive/archive.ts builds
 * `by_artist` (a story only reaches an artist THROUGH a registered album
 * ref, never through prose alone). takedown.mjs relies on this exact
 * exclusion to decide what an artist/album takedown may safely remove.
 */
export function listStories(root) {
  const dir = join(root, 'content', 'stories');
  return listFiles(dir, '.md').map((f) => {
    const slug = f.slice(0, -3);
    const data = readFrontmatter(join(dir, f));
    const albums = Array.isArray(data?.albums) ? data.albums : [];
    const albumRefs = albums.filter((a) => a && typeof a.ref === 'string').map((a) => a.ref);
    return { slug, albumRefs };
  });
}

/**
 * @returns {Array<{slug: string, year: number, referencedAlbums: string[]}>}
 * every content/snapshots/*.md, reduced to the album slugs its FROZEN
 * top10/bucket entries reference — exactly the set src/lib/checker/resolve.ts
 * checks against content/reviews/ at build time (E-110). Reading it here lets
 * a takedown be refused with a specific, actionable reason BEFORE any file is
 * touched, instead of surfacing later as an opaque build failure (R-2 —
 * confirmed annual lists are immutable, so there is no "fix" for the writer
 * to make; only a developer can decide to override it).
 */
export function listSnapshots(root) {
  const dir = join(root, 'content', 'snapshots');
  return listFiles(dir, '.md').map((f) => {
    const slug = f.slice(0, -3);
    const data = readFrontmatter(join(dir, f)) ?? {};
    const top10 = Array.isArray(data.top10) ? data.top10 : [];
    const buckets = Array.isArray(data.buckets) ? data.buckets : [];
    const referencedAlbums = [
      ...top10.map((t) => t?.album).filter((a) => typeof a === 'string'),
      ...buckets.flatMap((b) => [
        ...(typeof b?.winner === 'string' ? [b.winner] : []),
        ...(Array.isArray(b?.nominees) ? b.nominees.map((n) => n?.album).filter((a) => typeof a === 'string') : []),
      ]),
    ];
    return { slug, year: Number(data.year), referencedAlbums };
  });
}

/**
 * Find an existing artist by exact normalized name. Returns:
 *   {status: 'found', slug} — reuse this slug, do not write a new file.
 *   {status: 'none'}        — no match, caller creates a new artist.
 *   {status: 'ambiguous', slugs} — more than one artist file shares this
 *     normalized name (a pre-existing data problem, not something a
 *     publish run should silently pick a winner for).
 */
export function findArtistByName(name, artists) {
  const target = normalizeName(name);
  const matches = artists.filter((a) => normalizeName(a.name) === target);
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'ambiguous', slugs: matches.map((m) => m.slug) };
  return { status: 'found', slug: matches[0].slug };
}

/**
 * Find an existing album by normalized title AND at least one overlapping
 * artist slug (an album can have several artists; the review form only
 * names one, so "overlap" rather than "exact set equality" is correct).
 */
export function findAlbumByTitleArtist(title, artistSlug, albums) {
  const target = normalizeName(title);
  const matches = albums.filter((a) => normalizeName(a.title) === target && a.artists.includes(artistSlug));
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'ambiguous', slugs: matches.map((m) => m.slug) };
  return { status: 'found', slug: matches[0].slug };
}

/**
 * Resolve a genre dropdown's selected LABEL text to a bucket id, by reading
 * config/genres.yaml LIVE from the checked-out public repo (never a copy —
 * see module doc). Matches against every configured year block, because a
 * bucket id is meant to be stable across years even though the Issue Form
 * cannot know which year's block a still-unpublished album belongs to.
 *
 * "그 외" is the one entry NOT looked up in config — it is genres.yaml's own
 * permanently reserved id (E-109 forbids it from ever being configured), so
 * mapping it here can never drift.
 */
export function resolveGenreBucket(label, root) {
  if (label.trim() === '그 외') return { status: 'found', id: 'etc' };
  const path = join(root, 'config', 'genres.yaml');
  const config = parseYaml(readFileSync(path, 'utf8'));
  const ids = new Set();
  for (const year of config.years ?? []) {
    for (const bucket of year.buckets ?? []) {
      if (bucket.label === label) ids.add(bucket.id);
    }
  }
  if (ids.size === 0) return { status: 'none' };
  if (ids.size > 1) return { status: 'ambiguous', ids: [...ids] };
  return { status: 'found', id: [...ids][0] };
}
