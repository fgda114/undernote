/**
 * Content-addressed cache for rendered OG cards.
 *
 * WHY. A card costs ~810ms to draw (satori → resvg) and that number does not
 * move with content size, so build time is essentially `11s + 0.81s × cards`
 * — 326 documents measured at ~103s, and the 300-review budget point
 * extrapolates to ~255s against a 60s budget (11-qa/latency-report §3.2,
 * Finding L-1). Almost none of that work is new on a rebuild: publishing one
 * review re-draws every other review's card unchanged.
 *
 * WHAT THE KEY MUST COVER, and the failure if it does not. A card's pixels
 * are a function of THREE things, and a key missing any one of them produces
 * the silent failure of "I changed the card and the old PNG came out":
 *
 *   the card's input   · album title, artists, cover BYTES (they arrive
 *                        already inlined as a data URL), site name
 *   the drawing code   · OG_VERSION already hashes the whole og library —
 *                        reused here rather than recomputed, so the URL
 *                        cache-buster and this cache can never disagree
 *   the font subsets   · re-running scripts/subset-fonts.py changes glyph
 *                        outlines and metrics without touching a line of
 *                        code or a byte of content
 *
 * A FOURTH, not in the original list and included anyway: the resolved
 * versions of satori and @resvg/resvg-js. A renderer upgrade changes pixels
 * with neither the code nor the content moving, and "I upgraded satori and
 * the cards did not change" is the same silent failure wearing a different
 * hat.
 *
 * The first goes in the entry name; the other three form the DIRECTORY name.
 * Splitting them that way means a template or font change starts a fresh
 * directory instead of shadowing entries inside a shared one, which in turn
 * makes the old generation obviously stale and safe to delete — see
 * pruneOldGenerations below.
 *
 * WHERE IT LIVES, and why not under node_modules. `.cache/` is gitignored,
 * is never read by the build's output stage, and is CWD-relative like the
 * rest of this library. node_modules was the obvious candidate and is the
 * wrong one HERE: the e2e sandboxes junction node_modules to the real tree
 * (e2e/lib/sandbox.mjs), so a cache under it would be shared between the
 * repo and every sandbox — the exact cross-contamination `isolateCaches`
 * exists to prevent. A CWD-relative directory is per-sandbox by construction,
 * so sandbox builds stay cold and measure what they mean to measure.
 *
 * DETERMINISM. A hit returns the bytes a render would have produced, so a
 * warm build's dist is byte-identical to a cold one; that equality is
 * asserted rather than assumed (tests/unit/og-cache.test.ts, and the
 * cold/warm dist hash comparison recorded in 08-impl-notes/frontend.md).
 * Set `UNDERNOTE_OG_CACHE=0` to bypass the cache entirely — useful when the
 * question is whether the cache itself is lying.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { OG_VERSION } from './version.ts';
import type { CardInput } from './types.ts';

/**
 * CWD-relative, and overridable so the unit tests do not share a directory
 * with the developer's own builds. Without the override the test suite's
 * cleanup deleted the real cache on every run, which is a slow build nobody
 * would have connected to a test file.
 */
const CACHE_ROOT = process.env.UNDERNOTE_OG_CACHE_DIR ?? '.cache/og-cards';
const FONT_DIR = 'src/assets/fonts';

/** The renderers whose output this cache stands in for. */
const RENDERERS = ['satori', '@resvg/resvg-js'];

export const cacheEnabled = process.env.UNDERNOTE_OG_CACHE !== '0';

/**
 * JSON with object keys sorted, so two structurally equal inputs hash the
 * same regardless of the order the assemble functions happened to build
 * them in. Arrays keep their order — a list card's ranking is its meaning.
 * `undefined` properties are dropped, matching JSON.stringify, so an
 * explicitly-absent cover and an omitted one are one key rather than two.
 */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort()
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableJson(record[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Every font file the renderer could load, by directory listing rather than
 * by a hand-kept list. A curated list is a second place to remember to edit;
 * a directory cannot drift from itself. An unused font added to the folder
 * costs one needless generation, which is the harmless direction.
 */
function fontFingerprint(hash: ReturnType<typeof createHash>): void {
  for (const file of readdirSync(FONT_DIR).sort()) {
    hash.update(file);
    hash.update(readFileSync(join(FONT_DIR, file)));
  }
}

function rendererVersions(): string {
  const require = createRequire(join(process.cwd(), 'noop.js'));
  // A failure to resolve is left to THROW. Falling back to a constant would
  // key every generation the same and turn a renderer upgrade into stale
  // cards that look correct — the failure this whole module is built around.
  return RENDERERS.map((name) => `${name}@${require(require.resolve(`${name}/package.json`)).version}`).join(' ');
}

/**
 * The directory for the current combination of drawing code, fonts and
 * renderers. Computed once per process: each part reads files, and a build
 * asks for it once per card.
 */
let generationDir: string | null = null;

function generation(): string {
  if (generationDir === null) {
    const hash = createHash('sha256');
    hash.update(OG_VERSION);
    hash.update(rendererVersions());
    fontFingerprint(hash);
    generationDir = join(CACHE_ROOT, hash.digest('hex').slice(0, 12));
    mkdirSync(generationDir, { recursive: true });
    pruneOldGenerations(generationDir);
  }
  return generationDir;
}

/**
 * Delete sibling generations on first use. Without this the cache grows by a
 * full set of cards every time the template or a font changes, and nothing
 * would ever remove them — a developer's disk is not a place to leave litter
 * that no process owns. Only whole generations are pruned; entries for a
 * deleted album linger inside the current one until the next template
 * change, which is bounded by content churn and cheap.
 */
function pruneOldGenerations(current: string): void {
  for (const entry of readdirSync(CACHE_ROOT)) {
    const dir = join(CACHE_ROOT, entry);
    if (dir !== current) rmSync(dir, { recursive: true, force: true });
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from('IEND\xae\x42\x60\x82', 'binary');

/**
 * A cached file is trusted only if it is a whole PNG. The realistic
 * corruption is a build killed mid-write, and a truncated card would ship
 * looking like a rendering bug rather than a cache bug. Checking the
 * signature and the terminating chunk costs nothing against an 810ms render.
 */
function isWholePng(bytes: Buffer): boolean {
  return bytes.length > PNG_MAGIC.length + PNG_END.length && bytes.subarray(0, 8).equals(PNG_MAGIC) && bytes.subarray(-8).equals(PNG_END);
}

function entryPath(input: CardInput): string {
  const key = createHash('sha256').update(stableJson(input), 'utf8').digest('hex').slice(0, 32);
  return join(generation(), `${key}.png`);
}

/** The cached PNG for this input, or null when it must be drawn. */
export function readCard(input: CardInput): Uint8Array<ArrayBuffer> | null {
  if (!cacheEnabled) return null;
  const file = entryPath(input);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  if (!isWholePng(bytes)) {
    rmSync(file, { force: true });
    return null;
  }
  return new Uint8Array(bytes);
}

/**
 * Store a freshly drawn card. Written to a temporary name and renamed, so a
 * build interrupted mid-write leaves a stray temp file rather than a
 * half-PNG under a key that later reads as a hit. The pid keeps two
 * concurrent route renders from choosing the same temp name.
 */
export function writeCard(input: CardInput, png: Uint8Array): void {
  if (!cacheEnabled) return;
  const file = entryPath(input);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, png);
  renameSync(temp, file);
}
