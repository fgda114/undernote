/**
 * Astro Content Layer wiring (Astro 7 — src/content.config.ts).
 *
 * This file only WIRES collections to loaders. The Zod schemas live in
 * src/lib/schema/ (single definition — also consumed by the checker); do not
 * define or extend schemas here. Cross-file integrity (E-102~) is the
 * checker's job, wired in astro.config.ts.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { albumSchema, artistSchema, reviewSchema, snapshotSchema, storySchema } from './lib/schema/index.ts';

export const collections = {
  // File name = album slug = URL segment (1:1, E-108 — checker).
  reviews: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './content/reviews' }),
    schema: reviewSchema,
  }),
  albums: defineCollection({
    loader: glob({ pattern: '**/*.yaml', base: './content/albums' }),
    schema: albumSchema,
  }),
  stories: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './content/stories' }),
    schema: storySchema,
  }),
  artists: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './content/artists' }),
    schema: artistSchema,
  }),
  snapshots: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './content/snapshots' }),
    schema: snapshotSchema,
  }),
};
