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

/** ArticleCard data (components.md §4).
 *
 * D2-R2 (2026-09-07) — THIS TYPE NOW CARRIES A SCORE, and that is a reversal
 * worth stating plainly. D2's third row said browsing surfaces never show
 * scores, and the enforcement was that this interface HAD NO SCORE FIELD: a
 * template could not leak what the data never held. The editor reversed the
 * rule for the home's 최신 리뷰 and /archive/reviews/, so the field is here.
 *
 * What replaces the deleted guard, because "remember not to" is not a guard:
 *   1. rendering is OPT-IN per surface (`showScore` on ArticleCard). A page
 *      shows figures only by naming itself, so the set of score-bearing
 *      surfaces is a short, greppable list rather than a default.
 *   2. the OG card guard is UNTOUCHED and is still type-level: no card input
 *      type in lib/og has a score field (E-115), and share cards were
 *      explicitly excluded from this reversal.
 *   3. build.dist-matrix.spec.ts asserts the surface list in BOTH directions
 *      — which dist pages must contain score tokens and which must not — so
 *      mixing them up fails the build rather than shipping quietly.
 *
 * `score` is optional because stories do not have one and never will.
 *
 * `cover` was added for the home card grid (reskin 2026-09): the card
 * variant shows the album art, and a story — which has no art by definition
 * — falls back to a typographic block rather than a fabricated image. It is
 * declared optional so the many hand-built ArticleItems in tests and
 * fixtures stay valid; deriveLatestArticles always populates it. */
export interface ArticleItem {
  type: 'review' | 'story';
  url: string;
  title: string;
  /** Artist label (reviews) or one-line gist (stories). */
  subtitle: string;
  date: string;
  formatLabel: string;
  /** Album art for review items; null when the album has no cover, absent
   * for stories (which never have one). */
  cover?: CoverSet | null;
  /** Stored score string, displayed verbatim (reviews only) — see the intro
   * for why this field exists and what keeps it off the wrong surfaces. */
  score?: string;
  /** First-paragraph excerpt for the home's card grids (2026-09-07). Cards
   * used to show a title and an artist and nothing of the writing itself,
   * which made a browsing grid look like a directory rather than a
   * magazine. Optional and short-form: absent for the row variant, and
   * absent for a review whose own figure appears in its opening paragraph
   * -- see deriveLatestArticles for why that case drops out. */
  excerpt?: string;
}

/** Card excerpts are a two-line object, not an og:description -- 96 chars is
 * about two lines of Korean at 14px in the widest card (the full-width
 * feature) and overflows into the CSS clamp in the narrow grid ones.
 * Shipping the 160-char default instead would put ~60 invisible characters
 * in every card's HTML. */
export const CARD_EXCERPT_MAX = 96;

/**
 * Excerpt screen. Under D2-R2 a review card may now PRINT its score in its
 * own plate, so this is no longer about hiding the figure — it is about not
 * printing it twice, in two different registers, one of them mid-sentence.
 * An excerpt that opens with "이 앨범에 8.5점을 줬다" next to a plate reading
 * 8.5 reads as a duplication bug. Two things prevent it:
 *
 *  1. excerptFrom only ever returns the FIRST paragraph, so a figure quoted
 *     later in the piece cannot reach a card at all.
 *  2. if the opening paragraph does contain the review's own score string,
 *     the excerpt is DROPPED for that card. Not masked, not truncated --
 *     rewriting someone's sentence would be worse than showing none of it,
 *     and a card without an excerpt is an ordinary card shape (a story
 *     feature already renders that way).
 *
 * The match is on the stored string verbatim ("8.4"), which is the same form
 * D2-R displays, so "8.4점" and "8.4/10" are both caught. A DIFFERENT
 * album's figure quoted in the prose is not this review's judgment and is
 * left alone -- D2 is about the score this page assigned, not about digits.
 */
function cardExcerpt(text: string, score: string): string | undefined {
  if (text.length === 0) return undefined;
  return text.includes(score) ? undefined : text;
}

export function deriveLatestArticles(
  data: RepoData,
  joined: JoinedReview[],
  excerpt: (body: string, maxLength?: number) => string,
  limit = 8,
): ArticleItem[] {
  const items: ArticleItem[] = [];
  // joined carries frontmatter, not prose; the body lives on the raw entry.
  const bodyBySlug = new Map(data.reviews.map((r) => [r.slug, r.body]));
  for (const j of joined) {
    items.push({
      type: 'review',
      url: `/reviews/${j.slug}/`,
      title: j.album.title,
      subtitle: j.artistsLabel,
      date: j.review.date,
      formatLabel: 'Reviews',
      cover: coverSetFor({ slug: j.slug, title: j.album.title, artistsLabel: j.artistsLabel, cover: j.album.cover }),
      score: j.review.score,
      excerpt: cardExcerpt(excerpt(bodyBySlug.get(j.slug) ?? '', CARD_EXCERPT_MAX), j.review.score),
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
      cover: null,
      excerpt: excerpt(story.body, CARD_EXCERPT_MAX),
    });
  }
  // date desc → url asc: total order without a clock.
  items.sort((a, b) => codePointCompare(b.date, a.date) || codePointCompare(a.url, b.url));
  return items.slice(0, limit);
}

// ── Home sections (W5 home rebuild, 2026-09-06) ────────────────────────

/** A board entry carried onto the home chart grid. */
export interface ChartCardEntry extends ListEntry {
  bucketLabel: string;
  /** Rank INSIDE its own bucket (1..5), not a position in the flat grid.
   * Rank 1 is what earns the accent plate; whether the NUMERAL is printed
   * depends on bucketCount below. */
  rank: number;
  /** How many entries the card's bucket holds. The home flattens the
   * buckets into one row, so a card cannot show its ordinal without saying
   * what it is an ordinal OF — and in a bucket of one there is no ordering
   * to state at all. The card uses this to decide (2026-09-07). */
  bucketCount: number;
}

/**
 * The home's three sections (W5 editorial rebuild): Charts / Latest Reviews
 * / Notes. Which sections exist and what goes in them is a data judgment, so
 * it lives here and the page renders the result verbatim (P1).
 */
export interface HomeSections {
  /** Board entries flattened in board order (bucket order → rank). The
   * bucket columns collapse into one grid because the home shows covers, not
   * three text columns; each card still carries its bucket label, and the
   * full bucket structure — empty buckets included — stays on /list/{year}/. */
  charts: ChartCardEntry[];
  latestReviews: ArticleItem[];
  notes: ArticleItem[];
}

/**
 * @param limit cards per browsing section.
 *
 * FOUR, NOT SIX (2026-09-07). The home's browsing grids are now a FIXED
 * four-column row on desktop rather than an auto-filling one, so the count
 * and the layout have to agree: six cards would wrap to a second row holding
 * two, leaving two empty tracks on the right of the page's widest grid. One
 * full row per section is the shape the sections were asked for, and it is
 * also the shape that survives every breakpoint — at three columns it is
 * 4 = 3 + 1, at two it is 2 + 2, at one it is a short list. The limit is the
 * same for both sections on purpose: they are siblings, and giving Notes a
 * different count would invent a rank the editorial structure does not have.
 *
 * Overlap between "best of the year" and "most recent" is normal in any
 * magazine and is NOT deduplicated -- the two sections answer different
 * questions, and they now look different answering them: a chart card
 * carries a rank and a figure, a review card carries an excerpt and a date.
 *
 * An earlier pass suppressed 최신 리뷰 entirely when the chart already listed
 * every review there is, to avoid printing the same album twice on a young
 * site. That rule is GONE (2026-09-07). The home now always renders all
 * three sections, so suppression no longer produces "one section instead of
 * two" -- it produces an empty 최신 리뷰 sitting directly under a chart that
 * is visibly full of reviews, which reads as a fault rather than as
 * restraint. The genuinely empty case is handled by the page.
 */
export function deriveHomeSections(board: Board, allArticles: ArticleItem[], limit = 4): HomeSections {
  const charts = board.buckets.flatMap((bucket) =>
    bucket.entries.map((entry, i) => ({
      ...entry,
      bucketLabel: bucket.label,
      rank: i + 1,
      bucketCount: bucket.entries.length,
    })),
  );
  return {
    charts,
    latestReviews: allArticles.filter((a) => a.type === 'review').slice(0, limit),
    notes: allArticles.filter((a) => a.type === 'story').slice(0, limit),
  };
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
