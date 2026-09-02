/**
 * Astro Content Layer wiring (Astro 7 — src/content.config.ts).
 *
 * This file only WIRES collections to loaders. The Zod schemas themselves
 * live in src/lib/schema/ (single definition, consumed by both this file and
 * the checker) — do not define or extend schemas here.
 *
 * W5.0 registers the reviews collection only; albums/stories/artists/
 * snapshots follow in W5.1.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { reviewSchema } from './lib/schema/review';

const reviews = defineCollection({
  // File name = album slug = URL segment (1:1, E-108 — checked in W5.1).
  loader: glob({ pattern: '**/*.md', base: './content/reviews' }),
  schema: reviewSchema,
});

export const collections = { reviews };
