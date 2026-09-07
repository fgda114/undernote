/**
 * Default share card /og/default.png — the wordmark on the site's ground and
 * nothing else (2026-09-07). Every page without a card of its own points
 * here, so the card must not assert anything a particular page might not
 * say; the sentence a reader sees beside it is the page's own meta
 * description. Text in a shared image also cannot be translated, selected or
 * read by a screen reader — the mark has none of those problems.
 */
import type { APIRoute } from 'astro';
import { assembleMarkCard } from '../../lib/og/assemble.ts';
import { renderCard } from '../../lib/og/render.ts';
import { getSiteConfig } from '../../lib/site.ts';

export const GET: APIRoute = async () => {
  const site = getSiteConfig();
  const png = await renderCard(assembleMarkCard(site.site_name));
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
