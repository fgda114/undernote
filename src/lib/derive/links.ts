/**
 * The understanding ladder (USP-B): automatic bidirectional links between
 * reviews and stories — and NOTHING more (dedicated pages/visualizations are
 * deliberately out of scope). Retroactive linking is the free property of
 * full recomputation: a review published later simply resolves on the next
 * build — no stored state, no migration (B-6).
 *
 * Fallback chain (P5 — api-contracts §4.5 Backlinks): the FIRST non-empty
 * stage wins, stages are never mixed:
 *   ① direct story references (all, publication desc)
 *   ② detail-tag intersection (max 2)
 *   ③ same-bucket reference   (max 2)
 *   ④ none → the caller renders nothing (no empty shells, R-4)
 */
import type { RepoData } from '../checker/load.ts';
import { coverSetFor, type CoverSet } from '../covers.ts';
import type { Story } from '../schema/index.ts';

export interface BacklinkStory {
  url: string;
  title: string;
  date: string;
  excerpt: string;
}

export type BacklinkMode = 'direct' | 'tag' | 'bucket' | 'none';

export interface Backlinks {
  mode: BacklinkMode;
  stories: BacklinkStory[];
}

interface StoryLite {
  slug: string;
  data: Story;
  excerpt: string;
}

function byDateDescSlugAsc(a: StoryLite, b: StoryLite): number {
  return a.data.date < b.data.date ? 1 : a.data.date > b.data.date ? -1 : a.slug < b.slug ? -1 : 1;
}

function toBacklink(story: StoryLite): BacklinkStory {
  return { url: `/stories/${story.slug}/`, title: story.data.title, date: story.data.date, excerpt: story.excerpt };
}

/** Direct-reference reverse index: album slug → stories referencing it (P4). */
export function storyRefIndex(stories: StoryLite[]): Map<string, StoryLite[]> {
  const index = new Map<string, StoryLite[]>();
  for (const story of stories) {
    for (const ref of story.data.albums) {
      if ('ref' in ref) (index.get(ref.ref) ?? index.set(ref.ref, []).get(ref.ref)!).push(story);
    }
  }
  for (const list of index.values()) list.sort(byDateDescSlugAsc);
  return index;
}

/** Backlinks for one album (the review page's "이 앨범이 등장하는 이야기"). */
export function deriveBacklinks(
  album: { slug: string; tags: string[]; bucket: string },
  stories: StoryLite[],
  refIndex: Map<string, StoryLite[]>,
  albumBuckets: Map<string, string>,
): Backlinks {
  // ① direct — everything, publication desc.
  const direct = refIndex.get(album.slug) ?? [];
  if (direct.length > 0) return { mode: 'direct', stories: direct.map(toBacklink) };

  // ② tag intersection — max 2. Never merged with ③ (first non-empty only).
  if (album.tags.length > 0) {
    const tagSet = new Set(album.tags);
    const byTag = stories.filter((s) => s.data.tags.some((t) => tagSet.has(t))).sort(byDateDescSlugAsc);
    if (byTag.length > 0) return { mode: 'tag', stories: byTag.slice(0, 2).map(toBacklink) };
  }

  // ③ same bucket — a story qualifies when any of its referenced albums
  // shares X's bucket. Max 2.
  const byBucket = stories
    .filter((s) =>
      s.data.albums.some((ref) => 'ref' in ref && ref.ref !== album.slug && albumBuckets.get(ref.ref) === album.bucket),
    )
    .sort(byDateDescSlugAsc);
  if (byBucket.length > 0) return { mode: 'bucket', stories: byBucket.slice(0, 2).map(toBacklink) };

  return { mode: 'none', stories: [] };
}

/** Build the StoryLite list + supporting maps from repo data. */
export function prepareLadder(data: RepoData, excerpt: (body: string) => string) {
  const stories: StoryLite[] = data.stories.map((s) => ({ slug: s.slug, data: s.data, excerpt: excerpt(s.body) }));
  const refIndex = storyRefIndex(stories);
  const albumBuckets = new Map(data.albums.map((a) => [a.slug, a.data.bucket]));
  return { stories, refIndex, albumBuckets };
}

// ── AlbumBox rows (story page, plan A) ─────────────────────────────────

/** One row of "이 글에 나온 앨범": reviewed → link, otherwise the honest
 * "평론 준비 중" non-link (US-4 AC2 — no pseudo-link styling). A later
 * review publication upgrades the row on the next build (retroactive). */
export interface AlbumBoxRow {
  title: string;
  meta: string; // "아티스트 · 연도" or the manual artist text
  cover: CoverSet | null;
  reviewUrl: string | null; // null = 평론 준비 중
}

export function deriveAlbumBoxRows(story: Story, data: RepoData): AlbumBoxRow[] {
  const albums = new Map(data.albums.map((a) => [a.slug, a.data]));
  const artists = new Map(data.artists.map((a) => [a.slug, a.data.name]));
  const reviews = new Set(data.reviews.map((r) => r.slug));

  const rows: AlbumBoxRow[] = [];
  for (const ref of story.albums) {
    if ('ref' in ref) {
      const album = albums.get(ref.ref);
      if (!album) continue; // dead ref — already warned as E-204
      const artistsLabel = album.artists.map((s) => artists.get(s) ?? s).join(', ');
      rows.push({
        title: album.title,
        meta: `${artistsLabel} · ${album.release_date.slice(0, 4)}`,
        cover: coverSetFor({ slug: ref.ref, title: album.title, artistsLabel, cover: album.cover }),
        reviewUrl: reviews.has(ref.ref) ? `/reviews/${ref.ref}/` : null,
      });
    } else {
      // Unregistered mention — plain text row, never a link (SS-9).
      rows.push({ title: ref.text, meta: ref.artist ?? '', cover: null, reviewUrl: null });
    }
  }
  return rows;
}
