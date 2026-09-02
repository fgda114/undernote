/**
 * Config file schemas — api-contracts §3.5 (genres), §3.6 (tags), §3.8 (site).
 * Config is data (D1): year buckets, tag registry and site identity change by
 * editing YAML, never code. The reserved bucket id "etc" is rejected at the
 * schema level (E-109) so a bad config can never reach the derive layer.
 */
import { z } from 'astro/zod';
import { slugSchema } from './common.ts';

export const genreBucketSchema = z
  .object({
    id: slugSchema.refine((v) => v !== 'etc', {
      error: () =>
        'E-109: 버킷 id "etc"는 예약어입니다. etc는 설정에 없는 나머지 전부를 뜻하므로 버킷으로 등록할 수 없습니다 — 다른 id를 쓰세요.',
    }),
    label: z.string({ error: () => '버킷 label이 없습니다. 지면에 표시할 라벨을 적으세요.' }),
    order: z.int({ error: () => '버킷 order가 없습니다. 보드 표시 순서를 정수로 적으세요.' }),
  })
  .strict();

export const genresConfigSchema = z
  .object({
    years: z
      .array(
        z
          .object({
            year: z.int().min(2026, {
              error: (iss) => `연도 ${String(iss.input)}은(는) 2026 이전입니다. 연도 블록은 2026부터 시작합니다.`,
            }),
            buckets: z.array(genreBucketSchema).min(1, {
              error: () => '연도 블록의 buckets가 비어 있습니다. 최소 1개 버킷이 필요합니다.',
            }),
            min_reviews_to_publish: z.int().default(3),
          })
          .strict(),
      )
      .min(1, { error: () => 'genres.yaml에 연도 블록이 없습니다. 최소 1개 연도가 필요합니다.' }),
  })
  .strict();

export const tagRegistrySchema = z.object({
  tags: z
    .array(
      z
        .object({
          slug: slugSchema,
          label: z.string({ error: () => '태그 label이 없습니다.' }),
          aliases: z.array(z.string()).default([]),
        })
        .strict(),
    )
    .default([]),
});

export const siteConfigSchema = z
  .object({
    site_name: z.string({ error: () => 'site_name이 없습니다. 매체명 문자열을 적으세요.' }),
    base_url: z.url({ error: (iss) => `base_url "${String(iss.input)}"은(는) 유효한 URL이 아닙니다.` }),
    active_year: z.int({ error: () => 'active_year가 없습니다. 진행형 보드 대상 연도를 정수로 적으세요.' }),
    og_use_cover: z.boolean().default(true),
    // Home early-stage switch threshold (ui-spec §1.5) — api-contracts §3.8
    // optional field, added via the §7 additive procedure (lead-approved).
    early_stage_threshold: z.int().min(1).default(6),
    placeholder_cover: z.string().optional(),
    listen_link_patterns: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type GenresConfig = z.infer<typeof genresConfigSchema>;
export type GenreBucket = z.infer<typeof genreBucketSchema>;
export type TagRegistry = z.infer<typeof tagRegistrySchema>;
export type SiteConfig = z.infer<typeof siteConfigSchema>;
