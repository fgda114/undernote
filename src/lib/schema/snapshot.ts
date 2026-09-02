/**
 * Snapshot frontmatter schema — api-contracts §3.7 (content/snapshots/<year>.md).
 * Written only by the finalize CLI; humans never edit it (frozen year — R-2).
 * Titles/labels/scores are frozen copies on purpose: later edits to album or
 * review files must NOT retroactively change a finalized year (SS-6).
 */
import { z } from 'astro/zod';
import { isoDateSchema, slugSchema } from './common.ts';
import { scoreSchema } from './review.ts';

const top10EntrySchema = z.object({
  rank: z.int().min(1).max(10),
  album: slugSchema,
  title: z.string(),
  artists_label: z.string(),
  score: scoreSchema,
});

const bucketNomineeSchema = z.object({
  album: slugSchema,
  title: z.string(),
  artists_label: z.string(),
  score: scoreSchema,
});

export const snapshotSchema = z
  .object({
    year: z.int({ error: () => '스냅샷 year가 없습니다. finalize가 생성한 파일인지 확인하세요.' }),
    finalized_at: isoDateSchema,
    top10: z.array(top10EntrySchema).max(10, {
      error: () => 'top10이 10개를 초과합니다. 연간 리스트는 최대 10장입니다.',
    }),
    buckets: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        published: z.boolean(),
        winner: slugSchema.optional(),
        nominees: z.array(bucketNomineeSchema).max(5).optional(),
      }),
    ),
  })
  // published=true requires a winner — D1 establishment rule frozen into data.
  .refine((s) => s.buckets.every((b) => !b.published || typeof b.winner === 'string'), {
    error: () => 'published: true인 버킷에 winner가 없습니다. finalize 산출물이 손상되었는지 확인하세요.',
  });

export type Snapshot = z.infer<typeof snapshotSchema>;
