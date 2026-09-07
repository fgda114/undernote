/**
 * Site configuration accessor — reads config/site.yaml once per build process
 * and validates it with the single schema definition. Pages and layouts
 * consume this instead of hardcoding the site name / base URL (the site name
 * is undecided; when it lands, config/site.yaml is the one place to change).
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { siteConfigSchema, type SiteConfig } from './schema/index.ts';

let cached: SiteConfig | null = null;

export function getSiteConfig(): SiteConfig {
  if (cached) return cached;
  // Resolved from CWD: both `astro build/dev` and tests run at the repo root.
  const raw = parse(readFileSync('config/site.yaml', 'utf8'));
  const parsed = siteConfigSchema.safeParse(raw);
  if (!parsed.success) {
    // The checker pre-pass reports this properly during builds; throwing here
    // covers direct consumers (dev server, tests) with a pointed message.
    throw new Error('config/site.yaml이 유효하지 않습니다 — 빌드 리포트를 확인하세요.');
  }
  cached = parsed.data;
  return cached;
}

/**
 * The site's one-sentence identity. It reaches a reader as META TEXT only —
 * the home's description, which is also what a pasted link shows underneath
 * the card image. The share card itself no longer carries any text (see
 * lib/og/template.ts), so this string and that image are now two different
 * kinds of object: the image is the mark, this is the sentence. It lives here rather than in config/site.yaml because adding a
 * field there means touching siteConfigSchema and every fixture that
 * constructs a SiteConfig; a module constant buys the same single source at
 * a fraction of the blast radius. If the editor ever needs to change it
 * without a deploy, that is the moment to promote it to config.
 */
export const SITE_TAGLINE = '음악을 좋아하는 평범한 사람의 솔직한 음악이야기';

/** Absolute URL for a site path — og:url / og:image need absolute forms. */
export function absoluteUrl(path: string): string {
  const base = getSiteConfig().base_url.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
