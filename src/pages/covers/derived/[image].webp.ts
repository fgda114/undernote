/**
 * Build-time cover derivatives — /covers/derived/<slug>-w{96|320|640}.webp
 *
 * Static endpoints are the framework-idiomatic way to emit generated binary
 * files into dist/ (no scripts involvement: the build reads repo state only).
 * Source of truth is the committed master public/covers/<slug>.jpg (<=640px,
 * ADR-0008 §2) — derivatives only ever scale DOWN from it.
 *
 * Determinism: sharp output is byte-stable for identical input + identical
 * sharp version (lockfile-pinned), so these files pass the double-build gate.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import sharp from 'sharp';
import { COVER_WIDTHS } from '../../../lib/covers.ts';

export const getStaticPaths = (async () => {
  const albums = await getCollection('albums');
  return albums
    .filter((album) => typeof album.data.cover === 'string')
    .flatMap((album) =>
      COVER_WIDTHS.map((width) => ({
        params: { image: `${album.id}-w${width}` },
        props: { cover: album.data.cover as string, width },
      })),
    );
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { cover, width } = props as { cover: string; width: number };
  const master = await readFile(join('public', cover));
  const buffer = await sharp(master)
    .resize(width, width, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/webp' } });
};
