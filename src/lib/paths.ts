/**
 * Base-path handling (B-1 fix): the site may deploy under a subpath
 * (GitHub Pages project site → /undernote/) or at a domain root. Derive
 * outputs stay SITE-RELATIVE ("/reviews/x/") — templates pass every internal
 * href/src through withBase() at render time. Astro's `base` config does NOT
 * rewrite hand-written hrefs (the root cause of B-1), so this helper is the
 * single translation point.
 *
 * The base value flows from config/site.yaml#base_url (repo state → still
 * deterministic) via astro.config.ts → import.meta.env.BASE_URL.
 * E-112 enforces usage: with a non-root base, any internal link in dist that
 * lacks the prefix fails the build (postbuild.ts) — the defect class B-1
 * described is structurally caught from now on.
 */

/** Pure join: normalizes a base ("/", "/undernote", "/undernote/") against a
 * site-relative path ("/about/"). Exported for tests. */
export function joinBase(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, ''); // "/" → "" · "/undernote/" → "/undernote"
  if (!path.startsWith('/')) path = `/${path}`;
  return `${trimmed}${path}` || '/';
}

// Vite injects BASE_URL in astro/vitest contexts; node-native consumers
// (scripts/) never build hrefs, so the '/' fallback is only a type guard.
const BASE = typeof import.meta.env !== 'undefined' ? (import.meta.env.BASE_URL ?? '/') : '/';

/** Site-relative path → deploy path. Root deploys are identity. */
export function withBase(path: string): string {
  return joinBase(BASE, path);
}
