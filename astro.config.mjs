/**
 * Astro configuration — deliberately minimal for W5.0.
 *
 * `site`/`base` are intentionally NOT set yet: the public domain is undecided
 * (site name pending) and the W5.0 empty shell has no absolute links or OG
 * meta that would need them. They land in W5.2 together with layouts.
 *
 * Output stays the default `static` — this product has no runtime by design
 * (no server, no DB, no API; all logic runs at build time).
 */
import { defineConfig } from 'astro/config';

export default defineConfig({});
