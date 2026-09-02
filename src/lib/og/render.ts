/**
 * Card rendering: satori (element tree → SVG) + resvg (SVG → PNG).
 *
 * Fonts are the build-only subset TTFs from src/assets/fonts (satori cannot
 * read woff2; these never ship in dist). Deterministic: same input + same
 * lockfile ⇒ byte-identical PNG — the CI double-build hash gate covers this.
 */
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { cardTree } from './template.ts';
import type { CardInput } from './types.ts';

// Loaded once per build process — paths are CWD-relative (builds run at the
// repo root, same assumption as lib/site.ts).
let fonts: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | null = null;

function loadFonts() {
  if (!fonts) {
    fonts = [
      { name: 'serif', data: readFileSync('src/assets/fonts/NotoSerifKR-400-sub.ttf'), weight: 400, style: 'normal' },
      { name: 'serif', data: readFileSync('src/assets/fonts/NotoSerifKR-700-sub.ttf'), weight: 700, style: 'normal' },
      // Pretendard registers as 400; card sans text requests 400/700 — satori
      // falls back to the closest registered weight (bold sans is avoided in
      // templates for this reason).
      { name: 'sans', data: readFileSync('src/assets/fonts/Pretendard-400-sub.ttf'), weight: 400, style: 'normal' },
    ];
  }
  return fonts;
}

export async function renderCard(input: CardInput): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await satori(cardTree(input) as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: loadFonts(),
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  // Copy into a plain ArrayBuffer-backed view — Response's BodyInit typing
  // rejects ArrayBufferLike (SharedArrayBuffer-capable) views.
  return new Uint8Array(png);
}
