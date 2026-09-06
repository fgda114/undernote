/**
 * List derivation engine — the body of USP-A ("모든 리스트 항목은 실존 평론으로
 * 연결된다"). Everything here is a pure function over repo data: lists are
 * NEVER stored (a committed derivative is a bug); every build re-derives in
 * O(n) + maps (n < 600 — no incremental machinery).
 *
 * Determinism contract (P10):
 *  - R-1 total order: score tenths desc → review date asc → album slug asc
 *    (3rd key kills same-day-tie nondeterminism; code-point compare only).
 *  - The ONLY clock consumer is the ended-month judgment for monthly recaps,
 *    fixed to Asia/Seoul (KST = UTC+9, no DST) and injectable for tests.
 *  - Attribution axes are SPEC, not contradiction (R-3): annual lists key on
 *    RELEASE year, archives on PUBLICATION year, monthly recaps on
 *    PUBLICATION month (old albums included).
 */
import { coverSetFor, type CoverSet } from '../covers.ts';
import { scoreToTenths } from '../score.ts';
import type { Album, GenresConfig, ReviewFrontmatter } from '../schema/index.ts';
import type { Entry, RepoData } from '../checker/load.ts';
import type { Finding } from '../checker/types.ts';

// ── Joined unit ────────────────────────────────────────────────────────

/** A review joined to its album — the atom every list is built from. */
export interface JoinedReview {
  slug: string; // album slug = review file name = URL segment
  review: ReviewFrontmatter;
  album: Album;
  artistsLabel: string;
  scoreTenths: number;
  releaseYear: number;
}

/** api-contracts §4 ListEntry — what list pages render verbatim. */
export interface ListEntry {
  album: string;
  title: string;
  artists_label: string;
  score: string; // stored string, displayed verbatim
  review_url: string;
  bucket: string;
  cover: CoverSet | null;
}

export interface Board {
  year: number;
  buckets: { id: string; label: string; entries: ListEntry[] }[];
}

export interface Top10Progressive {
  year: number;
  entries: ListEntry[];
}

export interface MonthlyRecap {
  month: string; // "YYYY-MM"
  entries: ListEntry[];
}

/** Join reviews to albums/artists. Assumes checker-passed data (E-102/103);
 * entries with a missing album are skipped, not defended against. */
export function joinReviews(data: RepoData): JoinedReview[] {
  const albums = new Map(data.albums.map((a) => [a.slug, a.data]));
  const artists = new Map(data.artists.map((a) => [a.slug, a.data]));
  const joined: JoinedReview[] = [];
  for (const review of data.reviews) {
    const album = albums.get(review.data.album);
    if (!album) continue;
    joined.push({
      slug: review.slug,
      review: review.data,
      album,
      artistsLabel: album.artists.map((s) => artists.get(s)?.name ?? s).join(', '),
      scoreTenths: scoreToTenths(review.data.score),
      releaseYear: Number(album.release_date.slice(0, 4)),
    });
  }
  return joined;
}

// ── R-1 total order ────────────────────────────────────────────────────

/** Code-point string compare — never localeCompare (environment-dependent). */
function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareR1(a: JoinedReview, b: JoinedReview): number {
  if (a.scoreTenths !== b.scoreTenths) return b.scoreTenths - a.scoreTenths; // desc
  const byDate = codePointCompare(a.review.date, b.review.date); // ISO strings: asc
  if (byDate !== 0) return byDate;
  return codePointCompare(a.slug, b.slug); // asc — final tiebreaker (slug is immutable, R-9)
}

export function toListEntry(j: JoinedReview): ListEntry {
  return {
    album: j.slug,
    title: j.album.title,
    artists_label: j.artistsLabel,
    score: j.review.score,
    review_url: `/reviews/${j.slug}/`,
    bucket: j.album.bucket,
    cover: coverSetFor({ slug: j.slug, title: j.album.title, artistsLabel: j.artistsLabel, cover: j.album.cover }),
  };
}

// ── Clock (single consumer — R-10) ─────────────────────────────────────

/** Current "YYYY-MM" in Asia/Seoul. KST is fixed UTC+9 (no DST) — pure
 * arithmetic, no Intl, identical on every runner. */
export function currentYearMonthSeoul(nowMs: number = Date.now()): string {
  return new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 7);
}

// ── Derivations ────────────────────────────────────────────────────────

/** Genre board (SS-4): activeYear releases only, etc EXCLUDED, buckets in
 * config order, top 5 per bucket. */
export function deriveBoard(joined: JoinedReview[], genres: GenresConfig, activeYear: number): Board {
  const block = genres.years.find((y) => y.year === activeYear);
  const buckets = [...(block?.buckets ?? [])].sort((a, b) => a.order - b.order);
  const eligible = joined.filter((j) => j.releaseYear === activeYear);
  return {
    year: activeYear,
    buckets: buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      entries: eligible
        .filter((j) => j.album.bucket === bucket.id)
        .sort(compareR1)
        .slice(0, 5)
        .map(toListEntry),
    })),
  };
}

/** Progressive top10 (SS-5): activeYear releases, etc INCLUDED (R-7 — no
 * masterpiece lost outside buckets). */
export function deriveTop10(joined: JoinedReview[], activeYear: number): Top10Progressive {
  return {
    year: activeYear,
    entries: joined
      .filter((j) => j.releaseYear === activeYear)
      .sort(compareR1)
      .slice(0, 10)
      .map(toListEntry),
  };
}

/** Monthly recaps (SS-7): keyed on PUBLICATION month (old albums included —
 * R-3), ENDED months only (the one clock consumer), zero-review months are
 * simply absent (R-4: no page, no list item). Living derivations — later
 * score edits re-derive past months (R-5). */
export function deriveMonthlyRecaps(joined: JoinedReview[], nowYm: string): MonthlyRecap[] {
  const byMonth = new Map<string, JoinedReview[]>();
  for (const j of joined) {
    const month = j.review.date.slice(0, 7);
    if (month >= nowYm) continue; // current/future month not ended yet
    (byMonth.get(month) ?? byMonth.set(month, []).get(month)!).push(j);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => codePointCompare(a, b))
    .map(([month, list]) => ({ month, entries: list.sort(compareR1).map(toListEntry) }));
}

/** Badge reverse map (P8): album slug → current board position. etc albums
 * never appear (not board material — by definition, R-7). */
export interface BadgeInfo {
  bucketId: string;
  bucketLabel: string;
  rank: number;
  year: number;
}

export function deriveBadgeMap(board: Board): Map<string, BadgeInfo> {
  const map = new Map<string, BadgeInfo>();
  for (const bucket of board.buckets) {
    bucket.entries.forEach((entry, i) => {
      map.set(entry.album, { bucketId: bucket.id, bucketLabel: bucket.label, rank: i + 1, year: board.year });
    });
  }
  return map;
}

// ── Home surface data ──────────────────────────────────────────────────

/** ArticleCard data (components.md §7) — NO score field by contract (D2:
 * browsing surfaces never see scores; the field simply doesn't exist here). */
export interface ArticleItem {
  type: 'review' | 'story';
  url: string;
  title: string;
  /** Artist label (reviews) or one-line gist (stories). */
  subtitle: string;
  date: string;
  formatLabel: string;
}

export function deriveLatestArticles(
  data: RepoData,
  joined: JoinedReview[],
  excerpt: (body: string) => string,
  limit = 8,
): ArticleItem[] {
  const items: ArticleItem[] = [];
  for (const j of joined) {
    items.push({
      type: 'review',
      url: `/reviews/${j.slug}/`,
      title: j.album.title,
      subtitle: j.artistsLabel,
      date: j.review.date,
      formatLabel: 'Reviews',
    });
  }
  for (const story of data.stories) {
    items.push({
      type: 'story',
      url: `/stories/${story.slug}/`,
      title: story.data.title,
      subtitle: excerpt(story.body),
      date: story.data.date,
      formatLabel: 'Notes',
    });
  }
  // date desc → url asc: total order without a clock.
  items.sort((a, b) => codePointCompare(b.date, a.date) || codePointCompare(a.url, b.url));
  return items.slice(0, limit);
}

/** Latest review hero (ui-spec §1.5 'early' variant) — newest by publication
 * date; equal dates fall through to the R-1 comparator (score desc → date →
 * slug), so the tiebreak follows the SAME total order as every other list
 * rather than an ad hoc rule (W6 m-4: this judgment used to live inline in
 * the page — moved here so it is covered by the golden-file test, not just
 * eyeballed in .astro, which vitest never touches). */
export function latestReviewHero(joined: JoinedReview[]): ListEntry | null {
  if (joined.length === 0) return null;
  const latest = [...joined].sort((a, b) => codePointCompare(b.review.date, a.review.date) || compareR1(a, b))[0];
  return toListEntry(latest);
}

/** Latest publication date across all content — feeds the board caption
 * "{날짜} 기준" with a REPO-DERIVED value (build-clock output is forbidden:
 * it would break the double-build hash gate, R-10). */
export function latestPublicationDate(data: RepoData): string | null {
  let latest: string | null = null;
  for (const r of data.reviews) if (!latest || r.data.date > latest) latest = r.data.date;
  for (const s of data.stories) if (!latest || s.data.date > latest) latest = s.data.date;
  return latest;
}

export type HomeVariant = 'empty' | 'early' | 'post-finalize' | 'normal';

/**
 * Home face selection (ui-spec §1.1/1.5/1.6) — clock-free by design:
 *  - no reviews at all → 'empty' (pre-launch line)
 *  - previous year's snapshot exists while the new board is still thin →
 *    'post-finalize' (finalized card + fresh empty board). The §1.6 window
 *    "12월~이듬해 초" is realized as "until the new year's board fills up",
 *    not as a wall-clock date — same repo, same site.
 *  - nominate total under threshold → 'early' (progress banner + latest
 *    review hero)
 */
export function deriveHomeVariant(input: {
  reviewCount: number;
  nominateTotal: number;
  threshold: number;
  hasPreviousSnapshot: boolean;
}): HomeVariant {
  if (input.reviewCount === 0) return 'empty';
  if (input.nominateTotal >= input.threshold) return 'normal';
  return input.hasPreviousSnapshot ? 'post-finalize' : 'early';
}

// ── Notices (E-3xx — ride along in the build report) ───────────────────

/** Boundary ties only (board 5↔6, bucket 1↔2, top10 10↔11): the rule still
 * decides the order; the editor merely gets the chance to split the tie by
 * score. Non-boundary ties are NOT notices (Thomas N-1 — exceptions.md is
 * the norm, not the broad SS-3 wording). */
export function detectBoundaryTies(joined: JoinedReview[], genres: GenresConfig, activeYear: number): Finding[] {
  const notices: Finding[] = [];
  const eligible = joined.filter((j) => j.releaseYear === activeYear);
  const block = genres.years.find((y) => y.year === activeYear);

  const tieAt = (sorted: JoinedReview[], boundary: number, label: string) => {
    const a = sorted[boundary - 1];
    const b = sorted[boundary];
    if (a && b && a.scoreTenths === b.scoreTenths) {
      const first = a.review.date !== b.review.date ? '발행일 이른 쪽' : 'slug 사전순 앞쪽';
      notices.push({
        code: 'E-301',
        message: `E-301: ${label} 경계 동점입니다 (${a.slug} ↔ ${b.slug}, ${a.review.score}점). 지금 순서는 ${first} 우선. 가르시려면 소수점 조정(예: 8.5→8.6)을 알려주세요.`,
        file: `content/reviews/${b.slug}.md`,
      });
    }
  };

  for (const bucket of block?.buckets ?? []) {
    const sorted = eligible.filter((j) => j.album.bucket === bucket.id).sort(compareR1);
    tieAt(sorted, 1, `${bucket.label} 버킷 1↔2위`);
    tieAt(sorted, 5, `${bucket.label} 보드 5↔6위`);
  }
  tieAt(eligible.slice().sort(compareR1), 10, '10선 10↔11위');
  return notices;
}

/** E-302: reviews for albums released AFTER active_year exist but the
 * active year is not finalized — a gentle nudge, never a block. */
export function detectUnfinalizedYear(data: RepoData, joined: JoinedReview[]): Finding[] {
  const activeYear = data.site?.active_year;
  if (activeYear === undefined) return [];
  const hasNewer = joined.some((j) => j.releaseYear > activeYear);
  const hasSnapshot = data.snapshots.some((s) => s.data.year === activeYear);
  if (!hasNewer || hasSnapshot) return [];
  return [
    {
      code: 'E-302',
      message: `E-302: ${activeYear} 리스트 확정이 필요해 보입니다 (이후 연도 발매작 평론이 발행됨). 서문을 주시면 확정합니다 — 강제는 아닙니다.`,
      file: 'config/site.yaml',
    },
  ];
}

/** E-303: board entry/exit vs. the PREVIOUS build's recorded board state.
 * Stateless builds can't know history, so this diffs against the last local
 * build report (reports/ is gitignored) — cold CI runs simply emit nothing.
 * That is acceptable: notices are editor-facing material, produced where the
 * editor builds. */
export function detectBoardChanges(previous: Record<string, string[]> | null, board: Board): Finding[] {
  if (!previous) return [];
  const notices: Finding[] = [];
  for (const bucket of board.buckets) {
    const before = new Set(previous[bucket.id] ?? []);
    const after = new Set(bucket.entries.map((e) => e.album));
    for (const slug of after) {
      if (!before.has(slug)) {
        notices.push({
          code: 'E-303',
          message: `E-303: ${slug}이(가) ${bucket.label} 보드에 진입했습니다 — 연중 콘텐츠 소재입니다.`,
          file: `content/reviews/${slug}.md`,
        });
      }
    }
    for (const slug of before) {
      if (!after.has(slug)) {
        notices.push({
          code: 'E-303',
          message: `E-303: ${slug}이(가) ${bucket.label} 보드에서 탈락했습니다.`,
          file: `content/reviews/${slug}.md`,
        });
      }
    }
  }
  return notices;
}

/** Serializable board state for the next build's E-303 diff. */
export function boardState(board: Board): Record<string, string[]> {
  return Object.fromEntries(board.buckets.map((b) => [b.id, b.entries.map((e) => e.album)]));
}
