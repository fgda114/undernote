/**
 * Plain-text excerpt from a markdown body — feeds og:description (contract:
 * first body paragraph; the score never passes through here because this
 * function only ever sees the body, not frontmatter).
 */

/** Strip the markdown syntax that could survive into one flowing line. */
function stripMarkdown(paragraph: string): string {
  return paragraph
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')            // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')         // links → text
    .replace(/[*_`~#>]/g, '')                        // emphasis/quotes/headers
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerptFrom(body: string, maxLength = 160): string {
  const paragraphs = body.split(/\r?\n\s*\r?\n/);
  for (const raw of paragraphs) {
    const text = stripMarkdown(raw);
    if (text.length === 0) continue;
    if (text.length <= maxLength) return text;
    // Cut at the last space inside the limit — never mid-word.
    const cut = text.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > maxLength / 2 ? lastSpace : maxLength)}…`;
  }
  return '';
}
