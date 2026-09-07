/**
 * OG cache-busting version — a short hash of THIS LIBRARY'S SOURCE.
 *
 * THE PROBLEM IT SOLVES. Share platforms (KakaoTalk, X, Slack…) scrape a
 * page's og:image once and cache the bytes against that URL, sometimes for
 * months. When the card design changed in the 2026-09 reskin, every already-
 * scraped link kept showing the old light-palette card even though the file
 * on the server was correct — the URL had not changed, so nothing re-fetched.
 * Appending a version to the URL is the only lever a static site has here.
 *
 * WHY THE SOURCE AND NOT THE CARD DATA. The obvious "content-derived hash"
 * is a hash of each card's input, and it would NOT have fixed the reported
 * bug: no album title changed, the TEMPLATE did. What determines a card's
 * bytes is the input plus the code that draws it, and it was the second half
 * that moved. Hashing the drawing code catches exactly the class of change
 * that broke, automatically, with nobody having to remember a number.
 *
 * WHY NOT THE RENDERED PNG'S BYTES, which would be the most precise answer:
 * the PNGs are produced by separate endpoint routes (src/pages/og/**.png.ts)
 * and the meta tag is rendered by a page route, with no ordering guarantee
 * between them and no way for a page to read another route's output. The
 * only way to get the bytes at meta-render time is to render every card a
 * second time — ~0.9s each, on top of a build whose duration is already a
 * tracked budget (W6 L-1). Not worth it for a cache key.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH: an edit to an album's title or
 * artist changes that one card's pixels without changing this hash, so that
 * one link keeps its cached image until the platform expires it on its own.
 * Fixing that would mean plumbing every card's input down into Base.astro to
 * hash per page. The trade is stated rather than hidden: design changes are
 * site-wide and visibly wrong when stale; a single album's metadata edit is
 * neither.
 *
 * DETERMINISM (R-10). This is a pure function of files in the repository —
 * no clock, no randomness, no mtime. Two clean builds of the same commit
 * produce the same string, which is what the double-build hash gate checks.
 * Reading source at build time follows the precedent already set by
 * render.ts, which loads its fonts from CWD-relative paths for the same
 * reason (builds run at the repo root).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Every runtime file of the OG library, sorted. The list is "the whole
 * library" rather than a curated subset on purpose: deciding per file
 * whether it can affect the pixels is exactly the judgment call that goes
 * stale. types.ts carries no runtime behaviour and is included anyway,
 * because a rule with no exceptions needs no maintenance.
 *
 * cache.ts is in the list for that same reason, and the exception it might
 * have earned was weighed and refused: a render cache does not change what a
 * card looks like, so including it means an edit to caching code re-scrapes
 * every already-shared link for nothing. It is in anyway, because the ONE
 * way cache code fails is by handing back pixels that no longer match the
 * inputs — precisely the staleness this version string exists to break, and
 * the direction to be wrong in is the cheap one.
 */
const SOURCES = [
  'src/lib/og/assemble.ts',
  'src/lib/og/cache.ts',
  'src/lib/og/render.ts',
  'src/lib/og/template.ts',
  'src/lib/og/types.ts',
];

/**
 * Eight hex characters. Long enough that an accidental collision between two
 * revisions is not a practical concern, short enough to read in a URL while
 * debugging a share preview.
 *
 * Computed once per build process. A failure to read a source file is left
 * to throw rather than falling back to a constant: a build that silently
 * shipped a wrong-but-stable cache key would look healthy and keep serving
 * stale cards, which is the bug this file exists to prevent.
 */
export const OG_VERSION: string = (() => {
  const hash = createHash('sha256');
  for (const file of SOURCES) hash.update(readFileSync(file));
  return hash.digest('hex').slice(0, 8);
})();

/** `/og/default.png` → `https://…/og/default.png?v=1a2b3c4d`. */
export function ogImageUrl(absolute: string): string {
  return `${absolute}?v=${OG_VERSION}`;
}
