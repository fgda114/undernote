/**
 * Archive derivation (SS-11 · SS-12): the 4-axis reverse index and the
 * artist aggregation — pure O(n)+Map passes (P6/P7; n < 600).
 *
 * Contract points:
 *  - ArchiveItem has NO score field (api-contracts §4.4). Browsing surfaces
 *    never receive scores — enforced by this data shape, not by templates.
 *  - The year axis keys on PUBLICATION year (R-3) — deliberately different
 *    from the annual lists' release-year key. Do not "unify" them.
 *  - Bucket axis groups etc under the reserved id "etc" (label "그 외").
 *    MULTI-GENRE (2026-09-08): an album with more than one bucket is pushed
 *    into EVERY one of its buckets' lists — same "복수 전원" rule the artist
 *    axis already used below, extended to genre.
 *  - Tag axis uses canonical slugs only (registry normalization is E-201's
 *    job upstream — unregistered tags still index under their literal slug).
 *  - Artist intros are NOT emitted as ArchiveItems: the contract requires a
 *    date and artists have none (no publication date exists to attribute).
 *    Artist pages are reached through the artist axis itself; an artist
 *    nobody references is exactly the E-113 orphan case.
 */
import type { RepoData } from '../checker/load.ts';
import type { Finding } from '../checker/types.ts';

/** api-contracts §4.4 — score deliberately absent. */
export interface ArchiveItem {
  type: 'review' | 'story';
  url: string;
  title: string;
  date: string;
}

export interface ArchiveIndex {
  by_year: Map<string, ArchiveItem[]>;
  by_bucket: Map<string, ArchiveItem[]>;
  by_tag: Map<string, ArchiveItem[]>;
  by_artist: Map<string, ArchiveItem[]>;
}

function byDateDesc(a: ArchiveItem, b: ArchiveItem): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

function push(map: Map<string, ArchiveItem[]>, key: string, item: ArchiveItem): void {
  (map.get(key) ?? map.set(key, []).get(key)!).push(item);
}

export function deriveArchiveIndex(data: RepoData): ArchiveIndex {
  const index: ArchiveIndex = {
    by_year: new Map(),
    by_bucket: new Map(),
    by_tag: new Map(),
    by_artist: new Map(),
  };
  const albums = new Map(data.albums.map((a) => [a.slug, a.data]));

  for (const review of data.reviews) {
    const album = albums.get(review.data.album);
    if (!album) continue;
    const item: ArchiveItem = {
      type: 'review',
      url: `/reviews/${review.slug}/`,
      title: album.title,
      date: review.data.date,
    };
    push(index.by_year, review.data.date.slice(0, 4), item); // publication year (R-3)
    for (const bucket of album.buckets) push(index.by_bucket, bucket, item); // 복수 전원 (multi-genre) — etc stays "etc" ("그 외")
    for (const tag of album.tags) push(index.by_tag, tag, item);
    for (const artist of album.artists) push(index.by_artist, artist, item); // 복수 전원 (SS-12)
  }

  for (const story of data.stories) {
    const item: ArchiveItem = {
      type: 'story',
      url: `/stories/${story.slug}/`,
      title: story.data.title,
      date: story.data.date,
    };
    push(index.by_year, story.data.date.slice(0, 4), item);
    for (const tag of story.data.tags) push(index.by_tag, tag, item);
    // Stories reach artists through their referenced albums' artists.
    const artistSet = new Set<string>();
    for (const ref of story.data.albums) {
      if ('ref' in ref) for (const artist of albums.get(ref.ref)?.artists ?? []) artistSet.add(artist);
    }
    for (const artist of artistSet) push(index.by_artist, artist, item);
  }

  for (const list of [index.by_year, index.by_bucket, index.by_tag, index.by_artist]) {
    for (const items of list.values()) items.sort(byDateDesc);
  }
  return index;
}

/** Fixed display label for the reserved bucket (never configured — E-109). */
export const ETC_BUCKET_LABEL = '그 외';

/** One row of /artists/ — display name plus what this publication has
 * written about them, split by format because the two are different work. */
export interface ArtistIndexEntry {
  slug: string;
  name: string;
  reviews: number;
  stories: number;
}

/**
 * The /artists/ index (2026-09-07). Derived here rather than in the page,
 * like every other list on this site (P1): the page renders the result.
 *
 * SORT: display name ascending by CODE POINT, slug as the tiebreaker.
 *
 * Not localeCompare — it is environment-dependent and would break the
 * double-build hash gate on a runner with a different ICU build (R-10, the
 * same reason compareR1 exists). Code-point order puts Latin names before
 * Hangul ones, which reads as two clean blocks rather than as a mistake.
 *
 * Not "most reviewed first", which was the other candidate: an index is a
 * LOOKUP surface, and count-ordering moves every name on the page each time
 * something is published. A reader who remembers where a name sat would find
 * it somewhere else next visit. The counts are still shown — they are just
 * not the axis.
 *
 * Artists with nothing written about them cannot appear: they cannot exist
 * (E-113 fails the build on an unreferenced artist), so this list is empty
 * only when the whole site is.
 */
export function deriveArtistIndex(data: RepoData, index: ArchiveIndex): ArtistIndexEntry[] {
  const names = new Map(data.artists.map((a) => [a.slug, a.data.name]));
  const entries: ArtistIndexEntry[] = [];
  for (const [slug, items] of index.by_artist) {
    entries.push({
      slug,
      name: names.get(slug) ?? slug,
      reviews: items.filter((i) => i.type === 'review').length,
      stories: items.filter((i) => i.type === 'story').length,
    });
  }
  return entries.sort((a, b) => cp(a.name, b.name) || cp(a.slug, b.slug));
}

/** Code-point compare — never localeCompare (see deriveArtistIndex). */
function cp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * E-113 — orphan check, final form (W5.3): every published piece must be
 * reachable through at least one axis. Reviews and stories always land in
 * the year axis by construction (they carry dates), so the practical orphan
 * is an ARTIST nobody references: the artist page exists but no axis, list
 * or article ever links to it.
 */
export function detectOrphans(data: RepoData, index: ArchiveIndex): Finding[] {
  const findings: Finding[] = [];
  for (const artist of data.artists) {
    if (!index.by_artist.has(artist.slug)) {
      findings.push({
        code: 'E-113',
        message: `E-113: 아티스트 "${artist.slug}"을(를) 참조하는 글이 없습니다 — 어떤 축에서도 이 페이지에 도달할 수 없습니다 (고아). 이 아티스트를 다루는 앨범/이야기를 발행하거나, 잘못 만든 파일이면 삭제하세요.`,
        file: artist.file,
      });
    }
  }
  return findings;
}
