/**
 * Story frontmatter schema — api-contracts §3.3 (content/stories/<slug>.md).
 *
 * The albums list accepts two shapes: {ref} for registered albums (link
 * candidates; nonexistent ref = E-204 warning, checker) and {text} for
 * deliberate unregistered mentions (rendered as plain text — SS-9). The
 * optional role field is the lineage axis (plan B standby; plan A ignores it).
 */
import { z } from 'astro/zod';
import { isoDateSchema, slugSchema } from './common.ts';

const roleSchema = z.enum(['lead', 'follow'], {
  error: (iss) => `role "${String(iss.input)}"은(는) 유효하지 않습니다. lead 또는 follow만 가능합니다.`,
});

export const storyAlbumRefSchema = z.union(
  [
    z.object({ ref: slugSchema, role: roleSchema.optional() }).strict(),
    z
      .object({
        text: z.string().min(1, { error: () => 'albums.text가 비어 있습니다. 앨범 표기 텍스트를 적으세요.' }),
        artist: z.string().optional(),
        role: roleSchema.optional(),
      })
      .strict(),
  ],
  {
    error: () =>
      'albums 항목은 {ref: 앨범-slug} (등록 앨범) 또는 {text: "표기"} (미등록 앨범) 중 한 형태여야 합니다.',
  },
);

export const storySchema = z
  .object({
    title: z
      .string({ error: () => '이야기 title이 없습니다. 제목을 적으세요.' })
      .min(1, { error: () => '이야기 title이 비어 있습니다. 제목을 적으세요.' }),
    date: isoDateSchema,
    // Empty is allowed but warned (E-203) — a story without album references
    // cannot participate in the ladder (US-3).
    albums: z.array(storyAlbumRefSchema).default([]),
    tags: z.array(slugSchema).default([]),
  })
  .strict();

export type Story = z.infer<typeof storySchema>;
export type StoryAlbumRef = z.infer<typeof storyAlbumRefSchema>;
