/**
 * Take-down planning — PURE decision logic only. `planReviewTakedown` /
 * `planStoryTakedown` never touch the filesystem beyond reading (publish.mjs
 * applies the plan). Two questions this module answers that the build
 * cannot ask on our behalf, mirroring resolve-content.mjs's own module doc:
 *
 *   1. Is this review locked into a FROZEN year-end snapshot (R-2 — a
 *      confirmed annual list never changes, exceptions.md)? Deleting it
 *      anyway would only surface later as an opaque E-110 build failure
 *      ("스냅샷 항목에 해당하는 평론이 없습니다") with no obvious next step for
 *      a non-technical writer — `lockedSnapshotYears` catches it BEFORE any
 *      file is touched and lets publish.mjs explain it in plain words
 *      instead (docs/publishing.md).
 *   2. After removing this review/story, does its album and/or artist still
 *      have another reason to exist — i.e. is it still reachable through
 *      the SAME rule the build enforces as E-113
 *      (src/lib/derive/archive.ts#deriveArchiveIndex's `by_artist`
 *      construction: an artist is reachable only through a SURVIVING
 *      review's album, or a SURVIVING story's {ref} to an album — never
 *      through a bare-text `{text, artist}` mention)?
 *
 * This module MIRRORS that E-113 rule rather than importing it (a
 * documented sync point, the same convention as slugify.mjs — see its own
 * header): this package lives in a different repository from the one that
 * defines archive.ts. Getting it wrong is bounded in one direction only —
 * UNDER-deleting (leaving something that should have gone) still fails the
 * real E-113 for real on the build that follows, so the writer is never
 * left with silent breakage; OVER-deleting is structurally impossible here,
 * because this module only ever proposes removing a file when NOTHING
 * currently on disk still points at it.
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { listAlbums, listReviews, listStories, listSnapshots } from './resolve-content.mjs';

/** Every artist slug reachable through the given reviews/stories — the
 * exact rule archive.ts#deriveArchiveIndex uses to populate `by_artist`. */
function reachableArtists({ reviews, stories, albumsBySlug }) {
  const set = new Set();
  for (const r of reviews) {
    const album = albumsBySlug.get(r.album);
    if (album) for (const a of album.artists) set.add(a);
  }
  for (const s of stories) {
    for (const ref of s.albumRefs) {
      const album = albumsBySlug.get(ref);
      if (album) for (const a of album.artists) set.add(a);
    }
  }
  return set;
}

/** Every album slug still referenced by a review's own `album:` field or a
 * story's `{ref}` — one level down from `reachableArtists`, same idea. */
function reachableAlbums({ reviews, stories }) {
  const set = new Set();
  for (const r of reviews) set.add(r.album);
  for (const s of stories) for (const ref of s.albumRefs) set.add(ref);
  return set;
}

/**
 * Which confirmed year(s) freeze `albumSlug` into their list. Empty means
 * "safe to take down" as far as snapshots are concerned. Plural on purpose —
 * nothing in the schema forbids the same slug appearing in more than one
 * snapshot file, and this module never assumes the data it reads is
 * internally consistent (that is E-114's job, at build time).
 */
export function lockedSnapshotYears(albumSlug, publicRepoDir) {
  return listSnapshots(publicRepoDir)
    .filter((s) => s.referencedAlbums.includes(albumSlug))
    .map((s) => s.year);
}

/**
 * Plan a review take-down. `slug` doubles as the album slug (E-108: a
 * review's file name always equals its `album` field) — the caller
 * (publish.mjs) must have already confirmed via `lockedSnapshotYears` that
 * nothing here is frozen.
 *
 * @returns {{ deleteFiles: string[], deleteAlbum: boolean, deleteArtists: string[], albumSlug: string }}
 */
export function planReviewTakedown({ slug, publicRepoDir }) {
  const albumsBySlug = new Map(listAlbums(publicRepoDir).map((a) => [a.slug, a]));
  const reviews = listReviews(publicRepoDir);
  const stories = listStories(publicRepoDir); // a review takedown never removes a story
  const survivingReviews = reviews.filter((r) => r.slug !== slug);

  const deleteAlbum = !reachableAlbums({ reviews: survivingReviews, stories }).has(slug);
  const albumsAfter = deleteAlbum ? new Map([...albumsBySlug].filter(([s]) => s !== slug)) : albumsBySlug;

  const before = reachableArtists({ reviews, stories, albumsBySlug });
  const after = reachableArtists({ reviews: survivingReviews, stories, albumsBySlug: albumsAfter });
  const deleteArtists = [...before].filter((a) => !after.has(a));

  const deleteFiles = [`content/reviews/${slug}.md`];
  if (deleteAlbum) {
    deleteFiles.push(`content/albums/${slug}.yaml`);
    if (existsSync(join(publicRepoDir, 'public', 'covers', `${slug}.jpg`))) {
      deleteFiles.push(`public/covers/${slug}.jpg`);
    }
  }
  for (const a of deleteArtists) deleteFiles.push(`content/artists/${a}.md`);

  return { deleteFiles, deleteAlbum, deleteArtists, albumSlug: slug };
}

/**
 * Plan a story take-down. A story owns no album/cover of its own (SS-9 —
 * every album it mentions is either a shared {ref} or free {text}), so the
 * only symmetric cleanup is: the story file itself, plus any artist who
 * becomes unreachable once this story's {ref} mentions are gone.
 *
 * @returns {{ deleteFiles: string[], deleteArtists: string[] }}
 */
export function planStoryTakedown({ slug, publicRepoDir }) {
  const albumsBySlug = new Map(listAlbums(publicRepoDir).map((a) => [a.slug, a]));
  const reviews = listReviews(publicRepoDir); // a story takedown never removes a review/album
  const stories = listStories(publicRepoDir);
  const survivingStories = stories.filter((s) => s.slug !== slug);

  const before = reachableArtists({ reviews, stories, albumsBySlug });
  const after = reachableArtists({ reviews, stories: survivingStories, albumsBySlug });
  const deleteArtists = [...before].filter((a) => !after.has(a));

  return { deleteFiles: [`content/stories/${slug}.md`, ...deleteArtists.map((a) => `content/artists/${a}.md`)], deleteArtists };
}
