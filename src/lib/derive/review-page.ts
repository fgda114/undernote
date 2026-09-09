/**
 * Review page view model (ui-spec §2) — ALL judgment happens here; the page
 * template renders the result verbatim (P1: no logic in templates).
 *
 * The score lives in the hero and nowhere else on the page (D2-R): it is the
 * entry point, not the conclusion. The spec block added in the 2026-09
 * reskin is assembled here too — strictly from fields the content model
 * already has, so an editor never has to invent metadata to fill a layout.
 */
import { coverSetFor, type CoverSet } from '../covers.ts';
import { buildListenLinks, defaultListenLinks, type ListenLink } from '../listen-links.ts';
import type { Album, Artist, GenresConfig, ReviewFrontmatter, SiteConfig } from '../schema/index.ts';
import type { ArchiveItem } from './archive.ts';
import type { ArticleItem } from './lists.ts';

export interface ReviewPageData {
  slug: string;
  title: string;
  artistsLabel: string;
  /** Per-artist link data — hero renders names as /artists/ links (US-9 AC1). */
  artistLinks: { slug: string; name: string }[];
  /** First bucket's label (array order — see Album#buckets doc, order is
   * NOT a ranking). Kept singular for existing callers (SpecMeta, the hero
   * subtitle, LadderBlock's bucket lead copy) that only ever show one genre;
   * `bucketLabels` below carries all of them for a future multi-genre
   * display. MULTI-GENRE GAP (2026-09-08): an album in more than one bucket
   * still only SHOWS its first one here — see 08-impl-notes/backend.md. */
  bucketLabel: string;
  /** First bucket's id — the /archive/genre/ link target on the spec block. */
  bucketId: string;
  /** Every bucket this album belongs to, resolved to {id, label} pairs, same
   * array order as Album#buckets. Not consumed by any page yet (2026-09-08) —
   * added additively for a future multi-genre spec-block/hero row. */
  bucketLabels: { id: string; label: string }[];
  releaseDateText: string;
  cover: CoverSet | null;
  /** Stored score string, rendered verbatim in the verdict (no reformatting). */
  score: string;
  listenLinks: ListenLink[];
  /* ── Spec block (components.md §7). Every field below already exists in
     the content model — nothing here is invented, and fields the model does
     NOT have (tracklist, runtime, BPM, staff) are deliberately absent. ── */
  /** Record label — optional in the album schema, row omitted when absent. */
  label?: string;
  /** Detail tags resolved against the registry; empty ⇒ no TAGS row. */
  tags: { slug: string; label: string }[];
  /** Publication date of the review itself (<time datetime>). */
  reviewDate: string;
  /** Cover attribution line (ADR-0008) — caption under the cover, if given. */
  coverSource?: string;
}

/** "2026-05-01" → "2026. 5. 1." · "2026-05" → "2026. 5." · "2026" → "2026"
 * — pure string math, no Date object, no locale, no timezone (deterministic). */
export function formatReleaseDate(releaseDate: string): string {
  const [y, m, d] = releaseDate.split('-');
  if (d) return `${y}. ${Number(m)}. ${Number(d)}.`;
  if (m) return `${y}. ${Number(m)}.`;
  return y;
}

/** Bucket id → display label. Resolution mirrors the E-104 validation rule
 * (R-8): the RELEASE YEAR's block first, then the union of every year block
 * — back-catalog albums (release year without a block) are VALID content,
 * so their label must resolve too (W6 M-4: raw ids like "pop" were leaking
 * into the hero, disagreeing with the archive surface). "etc" is the
 * reserved everything-else bucket — fixed label, never configured (E-109).
 * Ascending-year scan keeps the pick deterministic when labels differ. */
export function bucketLabelFor(bucket: string, releaseYear: number, genres: GenresConfig): string {
  if (bucket === 'etc') return '그 외';
  const block = genres.years.find((y) => y.year === releaseYear);
  const inYear = block?.buckets.find((b) => b.id === bucket);
  if (inYear) return inYear.label;
  for (const year of [...genres.years].sort((a, b) => a.year - b.year)) {
    const found = year.buckets.find((b) => b.id === bucket);
    if (found) return found.label;
  }
  // Unreachable for checker-passed content (E-104 validates against the same
  // union); raw id only for partial test data.
  return bucket;
}

export function artistsLabelFor(artistSlugs: string[], artists: Map<string, Artist>): string {
  return artistSlugs.map((slug) => artists.get(slug)?.name ?? slug).join(', ');
}

export function buildReviewPageData(input: {
  slug: string;
  review: ReviewFrontmatter;
  album: Album;
  artists: Map<string, Artist>;
  genres: GenresConfig;
  site: SiteConfig;
  /** Tag registry — same resolution the archive surfaces use; an
   * unregistered tag falls back to its own slug rather than vanishing. */
  tagLabels?: Map<string, string>;
}): ReviewPageData {
  const { slug, review, album, artists, genres, site, tagLabels } = input;
  const artistsLabel = artistsLabelFor(album.artists, artists);
  const releaseYear = Number(album.release_date.slice(0, 4));
  return {
    slug,
    title: album.title,
    artistsLabel,
    artistLinks: album.artists.map((s) => ({ slug: s, name: artists.get(s)?.name ?? s })),
    bucketLabel: bucketLabelFor(album.buckets[0], releaseYear, genres),
    bucketId: album.buckets[0],
    bucketLabels: album.buckets.map((id) => ({ id, label: bucketLabelFor(id, releaseYear, genres) })),
    releaseDateText: formatReleaseDate(album.release_date),
    cover: coverSetFor({ slug, title: album.title, artistsLabel, cover: album.cover }),
    score: review.score,
    label: album.label,
    tags: album.tags.map((t) => ({ slug: t, label: tagLabels?.get(t) ?? t })),
    reviewDate: review.date,
    coverSource: album.cover_source,
    listenLinks: buildListenLinks(
      { title: album.title, artistsLabel, listen_links: album.listen_links },
      site.listen_link_patterns ?? defaultListenLinks,
    ),
  };
}

/**
 * "{artist}의 다른 글" follow block (§2.5 ②) — union of every credited
 * artist's archive items, current review excluded, one row per URL (a shared
 * archive item — e.g. a duo album — is pushed onto EACH artist's axis in
 * archive.ts, so a naive concat would repeat it once per shared artist).
 * First-occurrence dedup preserves archive order (date desc, already a total
 * order per archive.ts:byDateDesc) without a second sort (W6 m-4: this
 * judgment used to live inline in the page — moved here so a golden-file
 * test can see it; vitest never touches .astro).
 */
export function otherWorkByArtist(
  currentReviewUrl: string,
  artistSlugs: string[],
  byArtist: Map<string, ArchiveItem[]>,
  articleByUrl: Map<string, ArticleItem>,
): ArticleItem[] {
  const deduped = new Map<string, ArchiveItem>();
  for (const slug of artistSlugs) {
    for (const item of byArtist.get(slug) ?? []) {
      if (item.url === currentReviewUrl || deduped.has(item.url)) continue;
      deduped.set(item.url, item);
    }
  }
  const result: ArticleItem[] = [];
  for (const item of deduped.values()) {
    const article = articleByUrl.get(item.url);
    if (article) result.push(article);
  }
  return result;
}
