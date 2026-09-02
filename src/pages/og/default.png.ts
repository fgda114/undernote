/**
 * Default share card /og/default.png — the base template with the product's
 * one-sentence identity. Every page without a more specific card (home,
 * shells) points here.
 */
import type { APIRoute } from 'astro';
import { assembleBaseCard } from '../../lib/og/assemble.ts';
import { renderCard } from '../../lib/og/render.ts';
import { getSiteConfig } from '../../lib/site.ts';

export const GET: APIRoute = async () => {
  const site = getSiteConfig();
  const png = await renderCard(assembleBaseCard('이 리스트의 모든 앨범에는 이미 평론이 씌어 있다.', site.site_name));
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
