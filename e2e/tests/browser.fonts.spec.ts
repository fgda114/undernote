/**
 * 'Undernote Sans' ACTUALLY LOADS AND PAINTS (2026-09-10, Matthias/QA — PR #16
 * round, font-rename commit a3d66aa).
 *
 * WHY THIS NEEDS A BROWSER, NOT A BYTE CHECK. The rename fixed the font's own
 * `name` table (nameID 1/4/16 → "Undernote Sans") to resolve an OFL Reserved
 * Font Name conflict on the Pretendard subset — see licenses/README.md and
 * that commit's message for the full reasoning. Nothing about that operation
 * is checkable by reading the woff2/ttf bytes with a text scan (woff2 is
 * brotli-compressed; a name-table parse is a second implementation of font
 * parsing this suite has no reason to carry). What IS checkable, and is the
 * one thing that actually matters to a reader, is stated in the commit
 * message itself: "이름이 어긋나면 조용히 대체 폰트로 떨어지므로" — a family-name
 * MISMATCH between the CSS `@font-face` declaration (Base.astro,
 * `font-family:'Undernote Sans'`) and whatever name actually ended up in the
 * font's own table fails SILENTLY. The browser just falls through the `--sans`
 * stack to `Pretendard` (present only on a reader who has it installed) or
 * further to system sans-serif — same layout, same everything, wrong face,
 * and nothing in a build log would ever say so. `document.fonts` is the one
 * API that reports the DECODED family name the way the browser actually saw
 * it, which is what this test reads.
 *
 * NOT COVERED HERE: the OG card renderer (src/lib/og/render.ts) reads the
 * build-only TTF directly with satori under its OWN internal labels ('sans'/
 * 'serif', src/lib/og/render.ts#loadFonts) rather than the font's own name
 * table, so the rename cannot affect it by construction — satori never reads
 * nameID 1/4/16 at all. build.dist-matrix.spec.ts's "OG 카드 산출물" test
 * already proves every review/list/default card renders a real, correctly
 * sized PNG off these same TTFs; that is the OG side of this rename fully
 * covered, and restating it here would just be a second reader of the same
 * fact.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { SANDBOX_ROOT, basePathOf } from '../lib/sandbox.mjs';

const B = basePathOf(join(SANDBOX_ROOT, 'rich'));

test("'Undernote Sans' — document.fonts에 loaded로 등록되고 워드마크에 실제 적용된다", async ({ page }) => {
  await page.goto(`${B}/`);
  await page.evaluate(() => document.fonts.ready);

  const result = await page.evaluate(() => {
    const wm = document.querySelector('.wordmark');
    const families = [...document.fonts].map((f) => ({ family: f.family, status: f.status }));
    return {
      computedFontFamily: wm ? getComputedStyle(wm).fontFamily : null,
      families,
    };
  });

  // The stack itself — CSS never dropped 'Undernote Sans' from first place
  // (tokens.css --sans).
  expect(result.computedFontFamily, '워드마크 font-family 스택에 Undernote Sans가 없음').toContain('Undernote Sans');

  // The one fact a byte-level check cannot give: the browser actually
  // DECODED the woff2 and registered its own name table entry as
  // "Undernote Sans", status "loaded" — not "error" (parse/name mismatch)
  // and not merely "unloaded" (declared but never fetched, which a page with
  // no on-screen use of the family could also show).
  const undernoteSans = result.families.find((f) => f.family === 'Undernote Sans');
  expect(undernoteSans, `document.fonts에 'Undernote Sans'가 없음 — 등록된 패밀리: ${result.families.map((f) => f.family).join(', ')}`).toBeTruthy();
  expect(undernoteSans?.status, "'Undernote Sans' 상태가 loaded가 아님 — 이름 불일치로 폰트를 못 찾았거나 파싱에 실패했을 가능성").toBe('loaded');
});
