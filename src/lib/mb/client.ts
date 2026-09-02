/**
 * MusicBrainz + Cover Art Archive clients — the ONLY fetch site in the
 * codebase (layer rule: callers are scripts/ only; the deployed site makes
 * zero external calls).
 *
 * MB etiquette (verified against musicbrainz.org/doc/MusicBrainz_API/
 * Rate_Limiting, 2026-09-02): meaningful User-Agent of the form
 * "name/version ( contact-url )" and at most 1 request/second per IP — we
 * space requests 1100ms apart to stay safely under. No retry loops beyond
 * the single retry the CLI offers (P9 — a human is at the keyboard).
 */
import { MbError, type MbReleaseGroup, type MbSearchResponse } from './types';

const MB_ROOT = 'https://musicbrainz.org/ws/2';
const CAA_ROOT = 'https://coverartarchive.org';

/** MB-required contact point — the project repository. */
export const MB_USER_AGENT = 'undernote-album-add/0.1.0 ( https://github.com/fgda114/undernote )';

export interface MbClientOptions {
  fetchFn?: typeof fetch;
  userAgent?: string;
  /** Gap enforced between MB requests. 1100ms > the 1 req/s policy. */
  minIntervalMs?: number;
  timeoutMs?: number;
}

/** Escape Lucene special characters for the MB search query. */
export function luceneEscape(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
}

export class MbClient {
  private fetchFn: typeof fetch;
  private userAgent: string;
  private minIntervalMs: number;
  private timeoutMs: number;
  private lastRequestAt = 0;

  constructor(options: MbClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.userAgent = options.userAgent ?? MB_USER_AGENT;
    this.minIntervalMs = options.minIntervalMs ?? 1100;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async request(url: string): Promise<unknown> {
    await this.throttle();
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new MbError('timeout', `MusicBrainz 응답이 ${this.timeoutMs / 1000}초를 넘겼습니다.`);
      }
      throw new MbError('network', 'MusicBrainz에 연결할 수 없습니다 (네트워크 오류).');
    }
    if (response.status === 503) {
      throw new MbError('server', 'MusicBrainz가 요청을 제한했습니다 (503). 잠시 뒤에 다시 시도하세요.');
    }
    if (!response.ok) {
      throw new MbError('server', `MusicBrainz 오류 응답 (${response.status}).`);
    }
    return response.json();
  }

  /** Search release groups by artist + title. Empty array = no hit (E-401 —
   * not an error: brand-new releases lag behind, B6). */
  async searchReleaseGroups(artist: string, album: string, limit = 5): Promise<MbReleaseGroup[]> {
    const query = `releasegroup:"${luceneEscape(album)}" AND artist:"${luceneEscape(artist)}"`;
    const url = `${MB_ROOT}/release-group?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
    const json = (await this.request(url)) as MbSearchResponse;
    return json['release-groups'] ?? [];
  }

  async getReleaseGroup(mbid: string): Promise<MbReleaseGroup> {
    const url = `${MB_ROOT}/release-group/${mbid}?inc=artist-credits&fmt=json`;
    return (await this.request(url)) as MbReleaseGroup;
  }

  /** CAA front cover at 500px. null = no cover exists (E-404 — placeholder
   * publishing is a normal path, SS-14). Redirects (307) follow automatically. */
  async fetchCoverFront(mbid: string): Promise<{ buffer: Buffer; sourceUrl: string } | null> {
    await this.throttle();
    let response: Response;
    const url = `${CAA_ROOT}/release-group/${mbid}/front-500`;
    try {
      response = await this.fetchFn(url, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new MbError('timeout', 'Cover Art Archive 응답이 시간을 넘겼습니다.');
      }
      throw new MbError('network', 'Cover Art Archive에 연결할 수 없습니다.');
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new MbError('server', `Cover Art Archive 오류 응답 (${response.status}).`);
    return { buffer: Buffer.from(await response.arrayBuffer()), sourceUrl: response.url || url };
  }
}
