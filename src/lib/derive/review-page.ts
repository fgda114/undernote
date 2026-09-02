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

/** Bucket id → display label from the RELEASE YEAR's config block (R-3:
 * annual attribution key is the release year). "etc" is the reserved
 * everything-else bucket — fixed label, never configured (E-109). */
export function bucketLabelFor(bucket: string, releaseYear: number, genres: GenresConfig): string {
  if (bucket === 'etc') return '그 외';
  const block = genres.years.find((y) => y.year === releaseYear);
  const found = block?.buckets.find((b) => b.id === bucket);
  // The checker (E-104) guarantees existence at build time; the fallback only
  // serves non-build consumers (tests with partial data).
  return found?.label ?? bucket;
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
