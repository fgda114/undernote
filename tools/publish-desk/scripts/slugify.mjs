/**
 * Slug helpers — MIRROR ONLY, not the source of truth.
 *
 * The undernote public repo defines the real slug contract in two places:
 *   - `src/lib/schema/common.ts` (SLUG_PATTERN, enforced at build as E-107)
 *   - `src/lib/mb/scaffold.ts` (slugify(), used by the interactive album-add
 *     CLI to turn a display name into a URL-safe id)
 *
 * We deliberately do NOT cross-repo-import those modules (this package lives
 * in a *different* GitHub repository from the site — see docs/publishing.md
 * §"왜 검증을 다시 만들지 않았는가"). A copy here is safe precisely because
 * it is advisory, not authoritative: this module only decides whether the
 * publish workflow can pick a slug automatically or must ask the human
 * first. The one gate that actually matters — whether a slug is well-formed
 * — is still `npm run build` in the public repo (E-107), run for real on
 * every publish. If SLUG_PATTERN or slugify() ever changes upstream and this
 * copy drifts, the worst case is a slightly wrong pre-check UX (asking when
 * unnecessary, or not asking when it should); it can never let a malformed
 * slug reach content/, because the build still rejects it.
 */

/** Kebab-case ASCII slug pattern — verbatim copy of SLUG_PATTERN. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(value) {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

/**
 * ASCII-only kebab slug from a display name — verbatim port of
 * src/lib/mb/scaffold.ts#slugify. Returns '' when nothing ASCII survives
 * (an all-Korean name, for example); callers must then fall back to asking
 * the writer for a romanized/English form.
 */
export function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic slug for a "artist + title" pair (album/story naming
 * convention observed across the repo's published content: the album slug
 * is `slugify(firstArtistName + ' ' + title)`, e.g.
 * "phoebe-bridgers" + "lost weekend" -> "phoebe-bridgers-lost-weekend").
 */
export function combinedSlug(parts) {
  return slugify(parts.filter(Boolean).join(' '));
}

/**
 * Pick the first slug in `slug`, `slug-2`, `slug-3`, … that is not already
 * taken. Used only where a collision is a harmless naming coincidence, not
 * a sign of an actual duplicate (music stories — see resolve-content.mjs
 * for the album/artist case, which fails instead of guessing).
 */
export function firstAvailableSlug(base, existingSlugs) {
  if (!existingSlugs.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }
  // Practically unreachable (1000 title collisions), but fail loudly rather
  // than loop forever or return a colliding slug.
  throw new Error(`firstAvailableSlug: "${base}"에 대해 사용 가능한 슬러그를 998개 시도 안에 찾지 못했습니다.`);
}
