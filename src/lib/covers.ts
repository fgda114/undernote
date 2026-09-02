/**
 * CoverSet derivation (api-contracts §4 CoverSet · ADR-0008).
 *
 * The stored master is public/covers/<slug>.jpg (longest side <=640px — the
 * legal/performance ceiling). The build generates 96/320/640 WebP derivatives
 * through static endpoints (src/pages/covers/derived/), so URLs here must
 * stay in lockstep with that route. null = no cover: the renderer substitutes
 * the placeholder (never a broken image) and the checker emits the E-202
 * warning (src/lib/checker/resolve.ts — build-report is how the editor
 * learns about missing covers).
 */

export const COVER_WIDTHS = [96, 320, 640] as const;
export type CoverWidth = (typeof COVER_WIDTHS)[number];

export interface CoverSet {
  w96: string;
  w320: string;
  w640: string;
  /** "앨범명 — 아티스트 앨범 커버" (ADR-0008 §3 attribution). */
  alt: string;
  /** Original reduced master — <img> fallback for non-WebP agents. */
  fallback: string;
}

export function derivedCoverPath(slug: string, width: CoverWidth): string {
  return `/covers/derived/${slug}-w${width}.webp`;
}

export function coverSetFor(album: {
  slug: string;
  title: string;
  artistsLabel: string;
  cover?: string;
}): CoverSet | null {
  if (!album.cover) return null;
  return {
    w96: derivedCoverPath(album.slug, 96),
    w320: derivedCoverPath(album.slug, 320),
    w640: derivedCoverPath(album.slug, 640),
    alt: `${album.title} — ${album.artistsLabel} 앨범 커버`,
    fallback: `/${album.cover}`,
  };
}
