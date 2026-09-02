/**
 * MusicBrainz WS/2 response shapes — only the fields album-add consumes
 * (api-contracts §6.1 mapping table). MB's JSON uses kebab-case keys.
 */

export interface MbArtist {
  id: string;
  name: string;
  'sort-name'?: string;
}

export interface MbArtistCredit {
  name: string;
  joinphrase?: string;
  artist: MbArtist;
}

export interface MbReleaseGroup {
  id: string;
  title: string;
  'first-release-date'?: string;
  'primary-type'?: string;
  'artist-credit'?: MbArtistCredit[];
  /** Search relevance 0-100 — present only on search results. */
  score?: number;
}

export interface MbSearchResponse {
  'release-groups': MbReleaseGroup[];
}

/** Failure classification — maps to the editing-tool error codes:
 * notfound→E-401 · timeout/network→E-402 · server/ratelimit→E-403. */
export type MbErrorKind = 'timeout' | 'network' | 'server';

export class MbError extends Error {
  constructor(
    public kind: MbErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'MbError';
  }
}
