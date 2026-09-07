/**
 * OG card input types — E-115 IS ENFORCED HERE, at the type level.
 *
 * No card input type has a score field, so a score string physically cannot
 * reach a card template ("점수는 간판이 아니라 인프라", D2 · ui-spec §11).
 * Deliberately NOT enforced by scanning rendered HTML for score-like
 * substrings: normal copy such as "1983년" contains "8.3" and would
 * false-positive the build (Thomas N-5). If you are tempted to add a score
 * field here — that is the exact regression this design guards against.
 */

/**
 * The default share card (2026-09-07): the wordmark on the site's ground and
 * nothing else. It carries no title, so it cannot go stale when copy changes
 * and it cannot say something the page it stands for does not say. The
 * sentence a reader sees next to it comes from the page's meta description,
 * which is a different channel with different rules.
 */
export interface MarkCardInput {
  kind: 'mark';
  siteName: string;
}

export interface BaseCardInput {
  kind: 'base';
  /** Large typographic title (story title, page name…). */
  title: string;
  /** Format overline: 평론 / 음악 이야기 / 아티스트 / page label. Optional. */
  formatLabel?: string;
  siteName: string;
}

export interface ReviewCardInput {
  kind: 'review';
  albumTitle: string;
  artistsLabel: string;
  siteName: string;
  /** Reduced cover as a data URL (satori needs inline images). Absent →
   * the renderer falls back to the base layout (ADR-0008 §5 kill switch or
   * cover-less album). */
  coverDataUrl?: string;
}

export interface ListCardInput {
  kind: 'list';
  /** e.g. "2026 올해의 앨범 — 현재 노미네이트" */
  pageTitle: string;
  /** Top 1~3 — rank/title/artists only. NO scores (rank is the hook). */
  entries: { rank: number; title: string; artistsLabel: string }[];
  siteName: string;
}

export type CardInput = MarkCardInput | BaseCardInput | ReviewCardInput | ListCardInput;
