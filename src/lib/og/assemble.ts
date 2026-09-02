/**
 * Card input assembly from content data. These functions accept only the
 * fields they need — REVIEW DATA (score etc.) never enters, so the compiler
 * itself proves E-115 (see types.ts). A unit test additionally pins that no
 * assembled object carries a score key.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Album, SiteConfig } from '../schema/index.ts';
import type { BaseCardInput, ReviewCardInput } from './types.ts';

export function assembleBaseCard(title: string, siteName: string, formatLabel?: string): BaseCardInput {
  return { kind: 'base', title, formatLabel, siteName };
}

/**
 * Review card input. The cover becomes a data URL only when both the album
 * has one AND the og_use_cover kill switch is on (ADR-0008 §5 — flipping the
 * switch instantly degrades every review card to the base layout).
 */
export function assembleReviewCard(input: {
  album: Pick<Album, 'title' | 'cover'>;
  artistsLabel: string;
  site: Pick<SiteConfig, 'site_name' | 'og_use_cover'>;
}): ReviewCardInput {
  const { album, artistsLabel, site } = input;
  let coverDataUrl: string | undefined;
  if (site.og_use_cover && album.cover) {
    const buffer = readFileSync(join('public', album.cover));
    coverDataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }
  return {
    kind: 'review',
    albumTitle: album.title,
    artistsLabel,
    siteName: site.site_name,
    coverDataUrl,
  };
}
