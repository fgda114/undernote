/**
 * EVERY var() RESOLVES — the cheapest possible latch on a failure mode this
 * codebase has already shipped once.
 *
 * On 2026-09-07 a comment rewrite in tokens.css deleted the three lines that
 * declared --bg-sheen and left the paragraph describing them. global.css kept
 * saying `background-image: var(--bg-sheen)`, which is not an error in CSS:
 * an unresolvable var() computes to the guaranteed-invalid value, the property
 * falls back to its initial value (`none`), and the page renders. The reskin's
 * signature — the mint/lavender wash under every page — was simply absent, and
 * typecheck, unit, e2e and the determinism gate all passed.
 *
 * WHAT THIS ASSERTS. Every `var(--x)` WITHOUT A FALLBACK, anywhere in the
 * styles or in a component's <style> block, names a custom property that is
 * declared somewhere in the same source tree.
 *
 * WHY FALLBACKS ARE EXEMPT. `var(--px, 0)` is a deliberate contract, not an
 * oversight: --px is written by the inline module in Base.astro at runtime and
 * is SUPPOSED to be absent when no script ran. A reference with a fallback has
 * already stated what it does when the property is missing; a bare one has not,
 * and that is exactly the difference between the two cases.
 *
 * WHY THE WHOLE TREE AND NOT JUST THE TWO SHEETS. A component may declare a
 * property on its own element and read it back (a legitimate local pattern), so
 * the declared set has to include component styles or the test would report
 * those as missing. The cost is that this cannot catch "declared in component A,
 * read in component B" — a real but much louder failure, since it breaks in one
 * place rather than everywhere at once.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return ['.css', '.astro'].includes(extname(p)) ? [p] : [];
  });
}

const files = walk(SRC);
const declared = new Set<string>();
/** name → the files that reference it, for a failure message that says where. */
const referenced = new Map<string, Set<string>>();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]);
  // No comma before the closing paren = no fallback declared.
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    const rel = file.slice(SRC.length).replaceAll('\\', '/');
    (referenced.get(m[1]) ?? referenced.set(m[1], new Set()).get(m[1])!).add(rel);
  }
}

describe('CSS 커스텀 속성 — 참조 ⊆ 선언', () => {
  it('스위트가 실제로 무언가를 보고 있다 (빈 집합으로 통과하지 않는다)', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(declared.size).toBeGreaterThan(40);
    expect(referenced.size).toBeGreaterThan(20);
  });

  it('폴백 없는 var()는 전부 선언된 토큰을 가리킨다', () => {
    const missing = [...referenced]
      .filter(([name]) => !declared.has(name))
      .map(([name, where]) => `${name} — 선언 없음 (참조: ${[...where].join(', ')})`);
    expect(
      missing,
      `선언되지 않은 커스텀 속성을 참조합니다. 해석 불가능한 var()는 오류가 아니라 조용히 초기값이 되므로 화면에서만 사라집니다:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('--bg-sheen — 지면 워시가 선언돼 있고 body가 그것을 쓴다', () => {
    // The specific regression this file was written for, pinned by name: the
    // set test above would also catch it, but only as one line in a list.
    expect(declared.has('--bg-sheen')).toBe(true);
    expect(referenced.get('--bg-sheen')).toBeDefined();
    expect(readFileSync(join(SRC, 'styles', 'global.css'), 'utf8')).toContain(
      'background-image: var(--bg-sheen)',
    );
  });
});
