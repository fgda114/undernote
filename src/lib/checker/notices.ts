/**
 * Notice pass (E-3xx) — editor-facing signals derived alongside the lists.
 * Consumes the same derive code path as the pages (no second implementation).
 * E-303 diffs against the previous LOCAL build report (reports/ is
 * gitignored; cold CI builds emit no E-303 — an accepted property, since
 * notices exist for the editor who builds locally).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  boardState,
  deriveBoard,
  detectBoardChanges,
  detectBoundaryTies,
  detectUnfinalizedYear,
  joinReviews,
} from '../derive/lists.ts';
import type { RepoData } from './load.ts';
import type { Finding } from './types.ts';

export interface NoticeOutcome {
  notices: Finding[];
  /** Serialized board for the NEXT build's E-303 diff. */
  boardState: Record<string, string[]>;
}

export function readPreviousBoardState(root: string): Record<string, string[]> | null {
  const path = join(root, 'reports', 'build-report.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { board_state?: Record<string, string[]> };
    return parsed.board_state ?? null;
  } catch {
    return null;
  }
}

export function runNoticePass(data: RepoData, previousBoard: Record<string, string[]> | null): NoticeOutcome {
  if (!data.site || !data.genres) return { notices: [], boardState: {} };
  const joined = joinReviews(data);
  const board = deriveBoard(joined, data.genres, data.site.active_year);
  return {
    notices: [
      ...detectBoundaryTies(joined, data.genres, data.site.active_year),
      ...detectUnfinalizedYear(data, joined),
      ...detectBoardChanges(previousBoard, board),
    ],
    boardState: boardState(board),
  };
}
