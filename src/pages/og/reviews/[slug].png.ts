/**
 * Review share cards /og/reviews/<slug>.png — cover composite (ADR-0008 §5:
 * cover + album/artist text + wordmark, never the bare cover), falling back
 * to the base layout when no cover exists or og_use_cover is off.
 * Scores cannot appear here: the card input type has no score field (E-115).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, getEntry } from 'astro:content';
import { assembleReviewCard } from '../../../lib/og/assemble.ts';
import { renderCard } from '../../../lib/og/render.ts';
import { artistsLabelFor } from '../../../lib/derive/review-page.ts';
import { getSiteConfig } from '../../../lib/site.ts';

export const getStaticPaths = (async () => {
  const reviews = await getCollection('reviews');
  return reviews.map((review) => ({ params: { slug: review.id }, props: { albumSlug: review.data.album } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { albumSlug } = props as { albumSlug: string };
  const album = (await getEntry('albums', albumSlug))!;
  const artistEntries = await Promise.all(album.data.artists.map((slug) => getEntry('artists', slug)));
  const artists = new Map(artistEntries.filter((e) => e != null).map((e) => [e.id, e.data]));

  const png = await renderCard(
    assembleReviewCard({
      album: album.data,
      artistsLabel: artistsLabelFor(album.data.artists, artists),
      site: getSiteConfig(),
    }),
  );
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
