/**
 * Artist frontmatter schema — api-contracts §3.4 (content/artists/<slug>.md).
 * Body markdown = intro text; an empty body is valid (US-14 — aggregation-only
 * artist pages are a designed state, R-4).
 */
import { z } from 'astro/zod';

export const artistSchema = z
  .object({
    name: z
      .string({ error: () => '아티스트 name이 없습니다. 표기명을 적으세요.' })
      .min(1, { error: () => '아티스트 name이 비어 있습니다. 표기명을 적으세요.' }),
  })
  .strict();

export type Artist = z.infer<typeof artistSchema>;
