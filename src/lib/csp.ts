/**
 * The site's client-script contract, in one module so that the bytes we ship,
 * the hash we authorise, and the gate that checks dist all read the SAME
 * string. Nothing here may be duplicated elsewhere: two copies of "what the
 * one script is" is exactly how a CSP goes quietly wrong.
 *
 * WHY A CSP AT ALL, ON A SITE WITH NO USERS TO ATTACK. Markdown bodies pass
 * raw HTML straight through to dist — a `<script>` pasted into a review (a
 * streaming widget, an embed copied from somewhere else) ships and runs, and
 * before E-116 no gate said anything. The build-time gate stops it leaving;
 * this stops it running. They are a pair, not alternatives.
 *
 * WHY THE HASH IS COMPUTED FROM SOURCE AND NEVER FROM dist. Hashing what is
 * already in dist would put an injected script's own hash on the allow-list
 * and the control would disarm itself. The only input is the one file below.
 *
 * WHY NEWLINES ARE NORMALISED. .gitattributes checks JS out as CRLF on
 * Windows and LF on CI, so the same commit would otherwise produce two
 * different hashes AND two different documents. A determinism gate that
 * builds twice on one machine cannot see that class of defect — it has to be
 * removed at the source.
 *
 * WHAT IS DELIBERATELY NOT DIRECTIVE'D. `style-src` is absent: Astro's
 * scoped styles plus the @font-face injection put three inline <style>
 * blocks on every page, so it would need 'unsafe-inline' and would then
 * assert nothing. `frame-ancestors` is absent because a <meta> CSP ignores
 * it and GitHub Pages cannot set response headers — accepted, with the
 * reasoning recorded in 10-security/security-audit-kr.md §1.1.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** GoatCounter's loader origin — the one external script the site may ever
 * fetch, and only when config/site.yaml opts in (ADR-0002). */
export const ANALYTICS_ORIGIN = 'https://gc.zgo.at';

let cached: string | null = null;

/**
 * The one client module, read once per process. CWD-relative like
 * lib/site.ts and lib/og/version.ts — builds run at the repo root.
 *
 * LAZY, not a module constant: the checker barrel re-exports the dist scan
 * that uses this, and scripts/finalize.ts imports that barrel while running
 * in a throwaway fixture directory that has no src/ tree at all. A read at
 * import time made an unrelated CLI die on a file it never needed.
 *
 * A read failure is still left to throw at the point of use: shipping a page
 * whose CSP authorises a script that is not there would look healthy and
 * silently kill the site's own enhancements.
 */
export function enhanceJs(): string {
  cached ??= readFileSync('src/scripts/enhance.js', 'utf8').replace(/\r\n/g, '\n');
  return cached;
}

/** base64 sha256 of an inline script body, in the form a CSP source expects. */
export function scriptHash(body: string): string {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

/**
 * The policy string for a page. `goatcounter` is the site code from config;
 * when it is absent the analytics origin is not listed at all, so turning
 * the feature off also narrows the policy rather than leaving a hole open.
 */
export function cspContent(goatcounter?: string): string {
  const scriptSrc = [scriptHash(enhanceJs()), ...(goatcounter ? [ANALYTICS_ORIGIN] : [])];
  return [`script-src ${scriptSrc.join(' ')}`, "object-src 'none'", "base-uri 'self'"].join('; ');
}
