/**
 * List share cards /og/list/<year>.png and /og/list/<year>-<mm>.png —
 * rank·album·artist ONLY (the rank is the hook; the evidence sits behind the
 * click). Scores cannot appear: the list card input type has no score field
 * (E-115, structural).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { renderCard } from '../../../lib/og/render.ts';
import { getSiteData } from '../../../lib/derive/site-data.ts';
import type { ListCardInput } from '../../../lib/og/types.ts';

export const getStaticPaths = (async () => {
  const { site, top10, recaps, data } = getSiteData();
  const paths: { params: { key: string }; props: { card: ListCardInput } }[] = [];

  const entriesOf = (list: { title: string; artists_label: string }[]) =>
    list.slice(0, 3).map((e, i) => ({ rank: i + 1, title: e.title, artistsLabel: e.artists_label }));

  // Progressive annual card (active year).
  paths.push({
    params: { key: String(site.active_year) },
    props: {
      card: {
        kind: 'list',
        pageTitle: `${site.active_year} 올해의 앨범 — 현재 노미네이트`,
        entries: entriesOf(top10.entries),
        siteName: site.site_name,
      },
    },
  });

  // Finalized years — frozen snapshot strings.
  for (const snap of data.snapshots) {
    if (snap.data.year === site.active_year) continue;
    paths.push({
      params: { key: String(snap.data.year) },
      props: {
        card: {
          kind: 'list',
          pageTitle: `${snap.data.year} 올해의 앨범`,
          entries: entriesOf(snap.data.top10),
          siteName: site.site_name,
        },
      },
    });
  }

  // Monthly recaps.
  for (const recap of recaps) {
    const [year, mm] = recap.month.split('-');
    paths.push({
      params: { key: `${year}-${mm}` },
      props: {
        card: {
          kind: 'list',
          pageTitle: `${Number(mm)}월의 앨범`,
          entries: entriesOf(recap.entries),
          siteName: site.site_name,
        },
      },
    });
  }

  return paths;
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard((props as { card: ListCardInput }).card);
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
