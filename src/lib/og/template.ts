/**
 * Satori element trees for the three card templates (ui-spec §11 · ADR-0010):
 * base (title typography — the universal fallback), review (cover composite),
 * list (rank stack). 1200×630, dark ground, pale typography, exactly one
 * mint accent per card — the same identity as the site, in image form.
 *
 * The 2026-09 reskin turned these dark. A white card next to a dark site is
 * a different publication's object, and a dark tile actually stands out in a
 * feed. Colors are the DARK palette constants from src/styles/tokens.css —
 * cards are static images, so there are no media queries here. The W5
 * palette pass (2026-09-06) re-toned them from lime on neutral dark to mint
 * on deep navy; a share card still carrying the old accent is a card from a
 * site that no longer exists.
 *
 * Unchanged by that decision: share cards of every type carry NO score
 * (E-115, enforced structurally — the input types have no score field).
 */
import type { BaseCardInput, CardInput, ListCardInput, ReviewCardInput } from './types.ts';

// Dark palette values — keep in sync with src/styles/tokens.css. ACCENT is
// used as TEXT here (wordmark period, section label, rank 1), so it is the
// --accent-ink value: 13.62:1 on BG.
const BG = '#080C16';
const INK = '#E8E9F2';
const MUTED = '#98A0B8';
const ACCENT = '#63EFC0';

type El = { type: string; props: Record<string, unknown> };

function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

const frame = {
  width: '1200px',
  height: '630px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '64px',
  backgroundColor: BG,
  color: INK,
  fontFamily: 'serif',
};

function overline(text: string): El {
  return el('div', { fontFamily: 'sans', fontSize: '26px', fontWeight: 700, letterSpacing: '0.14em', color: ACCENT }, text);
}

/** Wordmark row — the site name plus its accent period (the favicon motif in
 * type form). The face stays the serif satori already has loaded: adding a
 * display weight would mean shipping another build-only TTF for one glyph
 * row, and the card's identity is carried by the palette and the plate. */
function wordmark(siteName: string): El {
  return el('div', { display: 'flex', fontSize: '32px', fontWeight: 700 }, [
    el('span', {}, siteName),
    el('span', { color: ACCENT }, '.'),
  ]);
}

function baseCard(input: BaseCardInput): El {
  return el('div', frame, [
    input.formatLabel ? overline(input.formatLabel) : el('div', {}, ''),
    el('div', { fontSize: '76px', fontWeight: 700, lineHeight: 1.3, maxWidth: '1000px' }, input.title),
    wordmark(input.siteName),
  ]);
}

function reviewCard(input: ReviewCardInput): El {
  // No cover (or kill switch off) → base layout with the album line as title.
  if (!input.coverDataUrl) {
    return baseCard({
      kind: 'base',
      title: input.albumTitle,
      formatLabel: 'Reviews',
      siteName: input.siteName,
    });
  }
  return el('div', { ...frame, flexDirection: 'row', justifyContent: 'flex-start', gap: '56px', alignItems: 'center' }, [
    {
      type: 'img',
      props: {
        src: input.coverDataUrl,
        width: 400,
        height: 400,
        // Square, like every other surface since the reskin (--r-0).
        style: { borderRadius: '0px' },
      },
    },
    el('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '400px', flexGrow: 1 }, [
      overline('Reviews'),
      el('div', { display: 'flex', flexDirection: 'column', gap: '16px' }, [
        el('div', { fontSize: '60px', fontWeight: 700, lineHeight: 1.3 }, input.albumTitle),
        el('div', { fontFamily: 'sans', fontSize: '34px', color: MUTED }, input.artistsLabel),
      ]),
      wordmark(input.siteName),
    ]),
  ]);
}

function listCard(input: ListCardInput): El {
  return el('div', frame, [
    overline(input.pageTitle),
    el(
      'div',
      { display: 'flex', flexDirection: 'column', gap: '24px' },
      input.entries.slice(0, 3).map((entry, i) =>
        el('div', { display: 'flex', alignItems: 'baseline', gap: '24px' }, [
          el('div', { fontSize: '44px', fontWeight: 700, color: i === 0 ? ACCENT : INK, width: '56px' }, String(entry.rank)),
          el('div', { fontSize: '44px', fontWeight: 700, maxWidth: '760px' }, entry.title),
          el('div', { fontFamily: 'sans', fontSize: '28px', color: MUTED }, entry.artistsLabel),
        ]),
      ),
    ),
    wordmark(input.siteName),
  ]);
}

export function cardTree(input: CardInput): El {
  switch (input.kind) {
    case 'base':
      return baseCard(input);
    case 'review':
      return reviewCard(input);
    case 'list':
      return listCard(input);
  }
}
