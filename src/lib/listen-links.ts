/**
 * Listen-link derivation (CF-10 · SS-13) — search-style outlinks by design.
 * Exact-match streaming APIs are out of scope (cost/benefit — Joshua's call):
 * a search link is honest, needs no tokens and never rots with catalog moves.
 *
 * Rule: a manual link in album.listen_links REPLACES the auto search link for
 * that service; services without patterns (e.g. "other") appear only manually.
 * Output order is deterministic: pattern definition order, then extra manual
 * services in their YAML order.
 */

export interface ListenLink {
  service: string;
  /** Display label — micro-copy is "{서비스명} ↗" (arrow added by the template). */
  label: string;
  url: string;
}

/** api-contracts §6.3 default patterns; site.yaml listen_link_patterns overrides. */
export const defaultListenLinks: Record<string, string> = {
  'youtube-music': 'https://music.youtube.com/search?q={q}',
  spotify: 'https://open.spotify.com/search/{q}/albums',
  'apple-music': 'https://music.apple.com/kr/search?term={q}',
};

const SERVICE_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  'apple-music': 'Apple Music',
  'youtube-music': 'YouTube Music',
};

function labelFor(service: string): string {
  return SERVICE_LABELS[service] ?? service;
}

export function buildListenLinks(
  album: { title: string; artistsLabel: string; listen_links?: { service: string; url: string }[] },
  patterns: Record<string, string> = defaultListenLinks,
): ListenLink[] {
  const manual = new Map((album.listen_links ?? []).map((l) => [l.service, l.url]));
  const q = encodeURIComponent(`${album.artistsLabel} ${album.title}`);
  const links: ListenLink[] = [];

  for (const [service, pattern] of Object.entries(patterns)) {
    const url = manual.get(service) ?? pattern.replace('{q}', q);
    manual.delete(service);
    links.push({ service, label: labelFor(service), url });
  }
  // Manual-only services (not covered by a pattern) keep their YAML order.
  for (const [service, url] of manual) {
    links.push({ service, label: labelFor(service), url });
  }
  return links;
}
