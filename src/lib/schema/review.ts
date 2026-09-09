/**
 * Review frontmatter schema — api-contracts §3.2 (minimal W5.0 skeleton;
 * Album/Story/Artist/Snapshot schemas arrive in W5.1).
 *
 * This is the build gate that makes "잘못된 콘텐츠는 배포될 수 없다" true:
 * Astro's content sync runs this schema over every content/reviews/*.md file
 * and a single violation fails the whole build (E-1xx policy — no partial
 * publish, SS-1).
 *
 * Note the score field: it must be a quoted STRING in YAML. An unquoted
 * `score: 8.35` arrives here as a JS number and is rejected by the type
 * check below — that is intentional, not an inconvenience (see lib/score.ts
 * for why float storage would silently break validation).
 */
import { z } from 'astro/zod';
import { SCORE_PATTERN } from '../score.ts';
import { isoDateSchema, slugSchema } from './common.ts';

export const scoreSchema = z
  .string({
    error: (iss) => {
      if (iss.input === undefined)
        return 'E-105: score가 없습니다. "0.0"~"10.0" 소수 1자리 문자열로 적으세요 (예: score: "8.3").';
      // Numbers get a repair hint: quote it if already one-decimal, otherwise
      // suggest the two neighbouring one-decimal values (exceptions.md format).
      if (typeof iss.input === 'number') {
        const raw = String(iss.input);
        if (SCORE_PATTERN.test(raw))
          return `E-105: score ${raw}은(는) 따옴표로 감싼 문자열이 아닙니다. YAML은 숫자 8.30을 8.3으로 접어버려 검증이 불가능해지므로 score: "${raw}" 로 적으세요.`;
        const lo = (Math.floor(iss.input * 10) / 10).toFixed(1);
        const hi = (Math.ceil(iss.input * 10) / 10).toFixed(1);
        return `E-105: score ${raw}은(는) 소수 1자리가 아닙니다. "${lo}" 또는 "${hi}"로 수정하세요 (따옴표 포함).`;
      }
      return `E-105: score는 문자열이어야 합니다. "0.0"~"10.0" 소수 1자리로 적으세요 (예: score: "8.3").`;
    },
  })
  .regex(SCORE_PATTERN, {
    error: (iss) =>
      `E-105: score ${String(iss.input)}은(는) 소수 1자리 형식이 아닙니다. "0.0"~"10.0" 범위에서 소수 1자리로 수정하세요 (예: "8.3" 또는 "8.4").`,
  });

export const reviewSchema = z
  .object({
    // Must reference an existing album (E-102) and match the file name (E-108)
    // — both are cross-file checks done by the checker (W5.1), not by Zod.
    album: slugSchema,
    score: scoreSchema,
    date: isoDateSchema,
    // The editor's final-confirmation gate (USP-C): literal true or the build
    // fails. Wording neutralized 2026-09-09 (decision-maker request — the
    // field NAME stays `editorial_check` so existing review files keep
    // parsing; only the user-facing message text changed).
    editorial_check: z.literal(true, {
      error: () => 'E-106: editorial_check가 true가 아닙니다. 최종 확인 후 editorial_check: true로 적어야 발행됩니다.',
    }),
  })
  // additionalProperties: false — typos like "socre" must fail loudly,
  // not silently pass as unknown extra keys.
  .strict();

export type ReviewFrontmatter = z.infer<typeof reviewSchema>;
