/**
 * Review page view model (ui-spec §2) — ALL judgment happens here; the page
 * template renders the result verbatim (P1: no logic in templates).
 *
 * Hero carries exactly four fields (album · artist label · bucket label ·
 * release date) and NO score — the score appears only in the verdict block
 * after the body (D2: the verdict must not leak before the argument).
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
  bucketLabel: string;
  releaseDateText: string;
  cover: CoverSet | null;
  /** Stored score string, rendered verbatim in the verdict (no reformatting). */
  score: string;
  listenLinks: ListenLink[];
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
}): ReviewPageData {
  const { slug, review, album, artists, genres, site } = input;
  const artistsLabel = artistsLabelFor(album.artists, artists);
  return {
    slug,
    title: album.title,
    artistsLabel,
    artistLinks: album.artists.map((s) => ({ slug: s, name: artists.get(s)?.name ?? s })),
    bucketLabel: bucketLabelFor(album.bucket, Number(album.release_date.slice(0, 4)), genres),
    releaseDateText: formatReleaseDate(album.release_date),
    cover: coverSetFor({ slug, title: album.title, artistsLabel, cover: album.cover }),
    score: review.score,
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
