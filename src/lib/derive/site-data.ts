/**
 * One-stop assembled site data for page frontmatter — loads the repo once per
 * build process and runs every derivation. Pages import THIS and render the
 * results verbatim (P1); if a page needs a new shape, it is added here, not
 * inlined in a template.
 */
import { loadRepo, type RepoData } from '../checker/load.ts';
import { deriveArchiveIndex, type ArchiveIndex } from './archive.ts';
import { excerptFrom } from './excerpt.ts';
import { prepareLadder } from './links.ts';
import {
  currentYearMonthSeoul,
  deriveBadgeMap,
  deriveBoard,
  deriveHomeVariant,
  deriveLatestArticles,
  deriveMonthlyRecaps,
  deriveTop10,
  joinReviews,
  latestPublicationDate,
  type ArticleItem,
  type BadgeInfo,
  type Board,
  type HomeVariant,
  type JoinedReview,
  type MonthlyRecap,
  type Top10Progressive,
} from './lists.ts';
import type { SiteConfig } from '../schema/index.ts';

/**
 * Early-stage threshold (ui-spec §1.5: board becomes a progress banner while
 * nominate total is below this). Single definition — a site.yaml optional
 * field is pending the api-contracts §7 additive procedure (lead/James);
 * when approved this constant becomes the schema default.
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
  latestArticles: ArticleItem[];
  latestPubDate: string | null;
  archive: ArchiveIndex;
  /** Prepared ladder inputs (story list + reverse index) — review pages call
   * deriveBacklinks with these. */
  ladder: ReturnType<typeof prepareLadder>;
  homeVariant: HomeVariant;
  /** Snapshot years present in content (for /list/[year] static paths). */
  snapshotYears: number[];
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
    latestArticles: allArticles.slice(0, 8),
    latestPubDate: latestPublicationDate(data),
    archive: deriveArchiveIndex(data),
    ladder: prepareLadder(data, excerptFrom),
    homeVariant: deriveHomeVariant({
      reviewCount: data.reviews.length,
      nominateTotal,
      threshold: EARLY_STAGE_THRESHOLD,
      hasPreviousSnapshot: data.snapshots.some((s) => s.data.year === data.site!.active_year - 1),
    }),
    snapshotYears: data.snapshots.map((s) => s.data.year).sort((a, b) => a - b),
  };
  return cached;
}
