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
 * Deterministic hex fragment derived from a string's own UTF-8 bytes (FNV-1a,
 * 32-bit, 6 hex chars) — NOT a slug by itself, a building block for one.
 *
 * Used as the "no romanizable characters survived" fallback (see
 * fallbackSlug below): it depends on nothing but the input TEXT, never on
 * wall-clock time, randomness, or environment, so the same display name
 * always produces the same fragment on every run and every machine — the
 * same determinism discipline the public repo's own derive layer holds
 * itself to for build output (src/lib/derive/lists.ts's R-1/R-10 comments).
 */
export function hashSlugFragment(text) {
  let h = 0x811c9dc5; // FNV offset basis
  for (const byte of Buffer.from(text.normalize('NFC'), 'utf8')) {
    h ^= byte;
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

/**
 * Deterministic replacement for asking the writer "영문 표기를 알려주세요"
 * when `slugify(text)` comes back empty (an all-Korean name, typically) —
 * publish-desk must never block a writer mid-submission for a romanization
 * answer (lead directive, 2026-09-08): a slug is still produced, from data
 * already ON the issue, and the caller is responsible for telling the writer
 * what got used (see publish.mjs's `notes`, surfaced in the success comment)
 * since the resulting URL segment is not something they typed themselves.
 *
 * `kind` picks what stands in for the missing romanization:
 *   'album'  → the release year-month (already on every review submission,
 *              human-readable, and groups a writer's Korean-titled albums by
 *              when they came out rather than by an opaque fragment)
 *   'artist' → a content hash (no release date exists at artist-resolution
 *              time — this runs BEFORE the album is resolved)
 * Either way, any ASCII fragment `slugify(text)` DID recover (a mixed-script
 * name) is kept and prepended/appended — the fallback is a last resort for
 * what remains unreadable, not a replacement for what already romanized.
 */
export function fallbackSlug(kind, text, releaseDate) {
  const processable = slugify(text);
  if (kind === 'album') {
    const ym = /^(\d{4})-?(\d{2})?/.exec(releaseDate ?? '');
    const stamp = ym ? `${ym[1]}${ym[2] ?? '00'}` : hashSlugFragment(text);
    return processable ? `${stamp}-${processable}` : stamp;
  }
  const hash = hashSlugFragment(text);
  return processable ? `${processable}-${hash}` : `artist-${hash}`;
}

/**
 * Pick the first slug in `slug`, `slug-2`, `slug-3`, … that is not already
 * taken. Used where a collision is a harmless naming coincidence (music
 * stories — see resolve-content.mjs for the album/artist HINT/name case,
 * which still fails instead of guessing) and as the collision backstop for
 * `fallbackSlug` above, whose output is otherwise unreviewed by a human.
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
