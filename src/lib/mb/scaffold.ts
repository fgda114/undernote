/**
 * Pure scaffolding logic for album-add: MB data → album/artist file contents.
 * Separated from the CLI so the mapping is unit-testable without prompts or
 * network. YAML is emitted with a fixed key order — file diffs stay minimal
 * and deterministic across runs.
 */
import { stringify } from 'yaml';
import { SLUG_PATTERN } from '../schema';
import type { MbReleaseGroup } from './types';

/** ASCII-only kebab slug from a display name. Returns '' when nothing
 * survives (e.g. an all-Korean name) — the CLI must then ask the User. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export interface AlbumScaffoldInput {
  title: string;
  artistSlugs: string[];
  releaseDate: string;
  bucket: string;
  mbid?: string;
  cover?: string;
  coverSource?: string;
  label?: string;
}

/** content/albums/<slug>.yaml body. Only known-present fields are written —
 * absent optionals stay absent (schema defaults handle the rest). */
export function albumYaml(input: AlbumScaffoldInput): string {
  const doc: Record<string, unknown> = {
    title: input.title,
    artists: input.artistSlugs,
    release_date: input.releaseDate,
    bucket: input.bucket,
  };
  if (input.cover) doc.cover = input.cover;
  if (input.coverSource) doc.cover_source = input.coverSource;
  if (input.mbid) doc.mbid = input.mbid;
  if (input.label) doc.label = input.label;
  // Quote release_date so YAML cannot reinterpret "2026" as a number.
  return stringify(doc, { defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' });
}

/** content/artists/<slug>.md — empty body is a designed state (US-14). */
export function artistMarkdown(name: string): string {
  return `---\nname: ${JSON.stringify(name)}\n---\n`;
}

/** Extract the artist display names from an MB release group credit chain. */
export function creditNames(rg: MbReleaseGroup): string[] {
  return (rg['artist-credit'] ?? []).map((c) => c.name || c.artist.name);
}

/** MB first-release-date arrives as YYYY, YYYY-MM or YYYY-MM-DD — pass
 * through when valid, '' when absent (release year is mandatory: the CLI
 * must then prompt, E-401 fallback). */
export function releaseDateFrom(rg: MbReleaseGroup): string {
  const date = rg['first-release-date'] ?? '';
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(date) ? date : '';
}
