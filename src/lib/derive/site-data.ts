/**
 * One-stop assembled site data for page frontmatter — loads the repo once per
 * build process and runs every derivation. Pages import THIS and render the
 * results verbatim (P1); if a page needs a new shape, it is added here, not
 * inlined in a template.
 */
import { loadRepo, type RepoData } from '../checker/load.ts';
import { deriveArchiveIndex, deriveArtistIndex, type ArchiveIndex, type ArtistIndexEntry } from './archive.ts';
import { excerptFrom } from './excerpt.ts';
import { prepareLadder } from './links.ts';
import {
  currentYearMonthSeoul,
  deriveBadgeMap,
  deriveBoard,
  deriveHomeSections,
  deriveHomeVariant,
  deriveLatestArticles,
  deriveMonthlyRecaps,
  deriveTop10,
  joinReviews,
  type ArticleItem,
  type BadgeInfo,
  type Board,
  type HomeSections,
  type HomeVariant,
  type JoinedReview,
  type MonthlyRecap,
  type Top10Progressive,
} from './lists.ts';
import type { SiteConfig } from '../schema/index.ts';

/**
 * Early-stage threshold default (ui-spec §1.5) — the schema default for
 * site.yaml#early_stage_threshold (§7-approved optional field). The config
 * value wins; this constant only backs non-config consumers/tests.
 */
export const EARLY_STAGE_THRESHOLD = 6;

export interface SiteData {
  data: RepoData;
  site: SiteConfig;
  joined: JoinedReview[];
  board: Board;
  top10: Top10Progressive;
  recaps: MonthlyRecap[];
  badgeMap: Map<string, BadgeInfo>;
  /** Every article in ArticleItem form, date desc — archive listings map
   * ArchiveItem urls through this (single conversion point). */
  allArticles: ArticleItem[];
  articleByUrl: Map<string, ArticleItem>;
  /** The home's Charts / Latest Reviews / Notes sections. */
  homeSections: HomeSections;
  archive: ArchiveIndex;
  /** /artists/ rows — name + per-format counts, name order (see archive.ts). */
  artistIndex: ArtistIndexEntry[];
  /** Prepared ladder inputs (story list + reverse index) — review pages call
   * deriveBacklinks with these. */
  ladder: ReturnType<typeof prepareLadder>;
  homeVariant: HomeVariant;
  /** Snapshot years present in content (for /list/[year] static paths). */
  snapshotYears: number[];
  /**
   * Every year /list/{year}/ renders for (2026-09-08, chart year nav): the
   * union of years with a genres.yaml block, years with a snapshot, and
   * active_year itself. A block-less year never appears (nothing to derive a
   * progressive board from and no snapshot to render), and a year is present
   * here for exactly as long as R-8's freeze condition allows it to be
   * EDITED — before a snapshot exists it can still change build to build, so
   * this list is recomputed fresh every build rather than cached across them.
   * Sorted ascending; list/[year]/index.astro's prev/next nav walks it
   * directly, so this is also the single definition of "which years exist"
   * for that feature.
   */
  listYears: number[];
}

let cached: SiteData | null = null;

export function getSiteData(): SiteData {
  if (cached) return cached;
  const { data } = loadRepo(process.cwd());
  if (!data.site || !data.genres) {
    // The checker gate reports this before any page renders during builds.
    throw new Error('config/site.yaml 또는 config/genres.yaml이 유효하지 않습니다 — 빌드 리포트를 확인하세요.');
  }
  const joined = joinReviews(data);
  const archive = deriveArchiveIndex(data);
  const board = deriveBoard(joined, data.genres, data.site.active_year);
  const nominateTotal = board.buckets.reduce((n, b) => n + b.entries.length, 0);
  const allArticles = deriveLatestArticles(data, joined, excerptFrom, Number.MAX_SAFE_INTEGER);
  cached = {
    data,
    site: data.site,
    joined,
    board,
    top10: deriveTop10(joined, data.site.active_year),
    recaps: deriveMonthlyRecaps(joined, currentYearMonthSeoul()),
    badgeMap: deriveBadgeMap(board),
    allArticles,
    articleByUrl: new Map(allArticles.map((a) => [a.url, a])),
    homeSections: deriveHomeSections(board, allArticles),
    archive,
    artistIndex: deriveArtistIndex(data, archive),
    ladder: prepareLadder(data, excerptFrom),
    homeVariant: deriveHomeVariant({
      reviewCount: data.reviews.length,
      nominateTotal,
      threshold: data.site.early_stage_threshold ?? EARLY_STAGE_THRESHOLD,
      hasPreviousSnapshot: data.snapshots.some((s) => s.data.year === data.site!.active_year - 1),
    }),
    snapshotYears: data.snapshots.map((s) => s.data.year).sort((a, b) => a - b),
    listYears: [
      ...new Set([
        data.site.active_year,
        ...data.genres.years.map((y) => y.year),
        ...data.snapshots.map((s) => s.data.year),
      ]),
    ].sort((a, b) => a - b),
  };
  return cached;
}
