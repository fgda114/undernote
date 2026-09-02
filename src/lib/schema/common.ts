/**
 * Shared field schemas for all content types (api-contracts §1 common types).
 *
 * Lives in src/lib/schema/ — the ONLY place Zod content schemas are defined
 * (project rule: content.config.ts and the checker both consume this module;
 * two definitions would inevitably diverge and break the "build keeps the
 * promise" guarantee).
 *
 * Error messages are Korean, prefixed with their error code (exceptions.md
 * message convention: what is wrong + how to fix it). Astro prepends the
 * offending file path when it reports frontmatter errors.
 */
import { z } from 'astro/zod';

/** kebab-case ASCII slug — file name, URL segment and cross-reference key (E-107). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const slugSchema = z
  .string({
    error: () => 'E-107: slug가 문자열이 아닙니다. 소문자·숫자·하이픈만 쓰는 kebab-case로 적으세요 (예: some-artist-some-album).',
  })
  .regex(SLUG_PATTERN, {
    error: (iss) =>
      `E-107: "${String(iss.input)}"은(는) slug 형식이 아닙니다. 소문자 영문·숫자·하이픈만 사용하세요 (예: some-artist-some-album).`,
  });

/** Full ISO date (YYYY-MM-DD) — publication dates. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Astro's frontmatter YAML parser turns an unquoted `date: 2026-09-02` into
 * a JS Date (constructed at UTC midnight — verified against Astro 7.2.10).
 * We normalize that Date back to its YYYY-MM-DD string via toISOString():
 * a UTC-in/UTC-out round trip, so the result is byte-identical on every
 * machine regardless of local timezone (determinism promise). Date
 * ATTRIBUTION (which month/year a review belongs to) is a separate concern,
 * computed later in lib code under Asia/Seoul (R-10) — never here.
 */
export const isoDateSchema = z.preprocess(
  (input) => (input instanceof Date ? input.toISOString().slice(0, 10) : input),
  z
    .string({
      error: () => 'date가 없습니다. YYYY-MM-DD 형식으로 적으세요 (예: 2026-09-02).',
    })
    .regex(ISO_DATE_PATTERN, {
      error: (iss) => `date "${String(iss.input)}"은(는) YYYY-MM-DD 형식이 아닙니다 (예: 2026-09-02).`,
    }),
);

/** Release date — year alone is enough (the year is the list-attribution key,
 * SS-2). YAML may hand us a number (2024), a Date (2024-05-03 unquoted) or a
 * string; normalize all three to the canonical string form. */
export const RELEASE_DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export const releaseDateSchema = z.preprocess(
  (input) => {
    if (input instanceof Date) return input.toISOString().slice(0, 10);
    if (typeof input === 'number' && Number.isInteger(input)) return String(input);
    return input;
  },
  z
    .string({
      error: () => 'release_date가 없습니다. 최소한 발매 연도는 필요합니다 — 연도가 없으면 리스트 귀속이 불가능합니다 (예: "2026" 또는 "2026-05-03").',
    })
    .regex(RELEASE_DATE_PATTERN, {
      error: (iss) =>
        `release_date "${String(iss.input)}"은(는) YYYY·YYYY-MM·YYYY-MM-DD 중 하나가 아닙니다 (예: "2026-05-03").`,
    }),
);
