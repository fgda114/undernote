/**
 * Satori element trees for the three card templates (ui-spec §11 · ADR-0010):
 * base (title typography — the universal fallback), review (cover composite),
 * list (rank stack). 1200×630, paper background, ink typography, exactly one
 * seal accent per card — the same identity as the site, in image form.
 *
 * Colors are the LIGHT palette constants from tokens.md §2 (cards are static
 * images — no media queries, and share cards render on white-ish feeds).
 */
import type { BaseCardInput, CardInput, ListCardInput, ReviewCardInput } from './types.ts';

// tokens.md §2 light values — keep in sync with src/styles/tokens.css.
const PAPER = '#FAF9F7';
const INK = '#201E1B';
const MUTED = '#6E6A63';
const SEAL = '#B23A2F';

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
  backgroundColor: PAPER,
  color: INK,
  fontFamily: 'serif',
};

function overline(text: string): El {
  return el('div', { fontFamily: 'sans', fontSize: '26px', fontWeight: 700, letterSpacing: '0.14em', color: SEAL }, text);
}

/** Wordmark row — serif 700 + seal period (the favicon motif in type form). */
function wordmark(siteName: string): El {
  return el('div', { display: 'flex', fontSize: '32px', fontWeight: 700 }, [
    el('span', {}, siteName),
    el('span', { color: SEAL }, '.'),
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
        style: { borderRadius: '8px' },
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
          el('div', { fontSize: '44px', fontWeight: 700, color: i === 0 ? SEAL : INK, width: '56px' }, String(entry.rank)),
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
