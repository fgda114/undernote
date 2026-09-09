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
    // Short qualifier shown next to the title on the review page (2026-09-09,
    // decision-maker request — e.g. "The 3rd Studio Album", "Deluxe
    // Edition"). Optional and additive: existing album files with no
    // `subtitle:` line parse exactly as before (api-contracts §7 additive
    // procedure — same pattern as og_use_cover/early_stage_threshold in
    // config.ts). Rendering it on the review page is a page-layer concern
    // (src/lib/derive/review-page.ts passes it through verbatim); this
    // schema only says the field may exist and must be a non-empty string
    // when it does — an empty string would render as a blank subtitle row,
    // which is never useful, so it is rejected here rather than left for a
    // template to special-case.
    subtitle: z.string().min(1, { error: () => 'subtitle이 빈 문자열입니다. 부제가 없으면 필드 자체를 생략하세요.' }).optional(),
    release_date: releaseDateSchema,
    // Bucket ids the album belongs to, from the release year's config block,
    // or the single reserved "etc" (explicit opt-out — never a silent
    // default). MULTI-GENRE (2026-09-08, decision-maker-confirmed — see
    // .agent-team/08-impl-notes/backend.md "복수 장르"): a real-world album
    // is often not one genre, so an album may now list MORE THAN ONE bucket
    // and becomes a candidate in every one of those genre's charts at once —
    // not a "primary genre + tags" compromise, which was considered and
    // rejected. Array ORDER carries no ranking meaning (every listed bucket
    // is an equal candidate everywhere a build derives from it — deriveBoard,
    // the archive bucket axis, the ladder's same-bucket fallback all use
    // `.includes()`, never index [0]); order is kept verbatim only for
    // round-trip fidelity of what the editor typed. Cross-file validity
    // against config/genres.yaml (per element) = E-104, still the checker's
    // job (resolve.ts) since it needs the OTHER file. What IS shape-checked
    // right here, because it needs no other file, is E-118: the array itself
    // must have no duplicate id and must not mix "etc" with a real bucket —
    // "etc" means "outside every configured bucket", so pairing it with one
    // is a self-contradiction, not a richer answer.
    buckets: z
      .array(slugSchema, {
        error: () => 'buckets가 없습니다. 발매 연도 설정의 버킷 id 1개 이상 또는 ["etc"]를 명시하세요 (침묵 기본값은 없습니다).',
      })
      .min(1, { error: () => 'buckets가 비어 있습니다. 최소 1개(등록된 버킷 id 또는 "etc")가 필요합니다.' })
      .superRefine((ids, ctx) => {
        const seen = new Set<string>();
        const dupes = new Set<string>();
        for (const id of ids) {
          if (seen.has(id)) dupes.add(id);
          seen.add(id);
        }
        if (dupes.size > 0) {
          ctx.addIssue({
            code: 'custom',
            message: `E-118: buckets에 중복된 값이 있습니다 (${[...dupes].join(', ')}). 각 버킷은 한 번씩만 적으세요.`,
          });
        }
        if (ids.includes('etc') && ids.length > 1) {
          ctx.addIssue({
            code: 'custom',
            message: `E-118: buckets에 "etc"와 다른 버킷(${ids.filter((id) => id !== 'etc').join(', ')})을 함께 쓸 수 없습니다 — etc는 "설정된 버킷 어디에도 속하지 않음"이라는 뜻이라 다른 버킷과 모순됩니다. etc만 남기거나 etc를 빼고 실제 버킷만 쓰세요.`,
          });
        }
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
