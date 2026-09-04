/**
 * Album frontmatter schema — api-contracts §3.1 (content/albums/<slug>.yaml).
 *
 * Cross-file rules (artist existence E-103, bucket-vs-year E-104) are the
 * checker's job — this schema only validates shape. `additionalProperties:
 * false` is strict(): arbitrary/tool-specific fields would break portability
 * (P6 — content must outlive the tooling).
 */
import { z } from 'astro/zod';
import { releaseDateSchema, slugSchema } from './common.ts';

export const listenLinkSchema = z
  .object({
    service: z.enum(['spotify', 'apple-music', 'youtube-music', 'other'], {
      error: (iss) =>
        `listen_links.service "${String(iss.input)}"은(는) 지원 목록에 없습니다. spotify · apple-music · youtube-music · other 중 하나로 적으세요.`,
    }),
    // https only (api-contracts §3.1 · UN-SEC-004): javascript:/http: never
    // reach an href — defence in depth, the author is the only writer anyway.
    url: z.url({
      protocol: /^https$/,
      error: (iss) => `listen_links.url "${String(iss.input)}"은(는) 유효한 https URL이 아닙니다. https로 시작하는 주소만 쓸 수 있습니다.`,
    }),
  })
  .strict();

export const albumSchema = z
  .object({
    title: z
      .string({ error: () => '앨범 title이 없습니다. 앨범명을 적으세요.' })
      .min(1, { error: () => '앨범 title이 비어 있습니다. 앨범명을 적으세요.' }),
    // Artist slugs — each must exist as content/artists/<slug>.md (E-103, checker).
    artists: z
      .array(slugSchema, {
        error: () => 'artists가 없습니다. 아티스트 slug 목록을 적으세요 (예: artists: [some-artist]).',
      })
      .min(1, { error: () => 'artists가 비어 있습니다. 최소 1명의 아티스트 slug가 필요합니다.' }),
    release_date: releaseDateSchema,
    // Bucket id from the release year's config block, or the reserved "etc"
    // (explicit opt-out — never a silent default). Validity vs config = E-104.
    bucket: z.string({
      error: () => 'bucket이 없습니다. 발매 연도 설정의 버킷 id 또는 "etc"를 명시하세요 (침묵 기본값은 없습니다).',
    }),
    tags: z.array(slugSchema).default([]),
    // Fixed shape covers/<slug>.jpg (api-contracts §3.1 · UN-SEC-005): matches
    // what album-add writes and the data-model master spec; a path pattern
    // cannot traverse out of public/ at the two readFile sites.
    cover: z
      .string()
      .regex(/^covers\/[a-z0-9]+(-[a-z0-9]+)*\.jpg$/, {
        error: (iss) =>
          `cover "${String(iss.input)}"은(는) covers/<slug>.jpg 형식이 아닙니다. 커버 마스터는 public/covers/ 안의 .jpg 파일만 가능합니다 (예: covers/some-artist-some-album.jpg).`,
      })
      .optional(),
    cover_source: z.string().optional(),
    listen_links: z.array(listenLinkSchema).optional(),
    mbid: z.string().optional(),
    label: z.string().optional(),
  })
  .strict();

export type Album = z.infer<typeof albumSchema>;
