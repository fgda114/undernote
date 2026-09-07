/**
 * Post-build integrity scan over dist/ (sequence B, checker stage 2):
 *
 *   E-111 — every HTML page must carry the OG trio (title/description/image).
 *   E-112 — every internal link must resolve to a file in dist.
 *   E-116 — no page may carry a <script> outside the site's allow-list.
 *   E-117 — the CSP meta's hash must match the script that page actually ships.
 *
 * E-116/E-117 exist because markdown bodies pass raw HTML straight through:
 * a <script> pasted into a review shipped and ran, and the "one script per
 * page" contract that was supposed to prevent it was only ever checked
 * against a SYNTHETIC fixture dist in e2e. These two run against the dist
 * built from real content, which is the only dist that gets deployed.
 *
 * E-113 (orphan detection) is NOT here — its final form lives in the 4-axis
 * archive index (src/lib/derive/archive.ts:detectOrphans), a pre-build
 * cross-file check over RepoData (W5.3). This stage only ever held a
 * narrower dist/-reachability scaffold that predated the archive; do not
 * re-add it here (it would just duplicate archive.ts's already-widened check).
 *
 * E-115 is deliberately NOT here as a substring scan: scanning HTML for
 * score-like strings false-positives on normal copy ("1983년" contains
 * "8.3"). Its enforcement is structural — card/OG input types carry no score
 * field (src/lib/og/types.ts) — and unit tests pin the assembly functions.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ANALYTICS_ORIGIN, enhanceJs, scriptHash } from '../csp.ts';
import type { Finding } from './types.ts';

export function listHtmlFiles(distDir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(distDir, rel)).sort()) {
    const relPath = rel ? `${rel}/${name}` : name;
    const full = join(distDir, relPath);
    if (statSync(full).isDirectory()) out.push(...listHtmlFiles(distDir, relPath));
    else if (name.endsWith('.html')) out.push(relPath);
  }
  return out;
}

const OG_REQUIRED = ['og:title', 'og:description', 'og:image'] as const;

export function checkOgTrio(distDir: string): Finding[] {
  const findings: Finding[] = [];
  for (const file of listHtmlFiles(distDir)) {
    const html = readFileSync(join(distDir, file), 'utf8');
    const missing = OG_REQUIRED.filter((key) => !html.includes(`property="${key}"`));
    if (missing.length > 0) {
      findings.push({
        code: 'E-111',
        message: `E-111: OG 필수 메타 ${missing.join(', ')}가 없습니다. Base 레이아웃을 거치지 않은 페이지인지 확인하세요 — 카드가 항상 완성돼 있어야 "원 노동 0"이 성립합니다.`,
        file: `dist/${file}`,
      });
    }
  }
  return findings;
}

/**
 * Internal links only: href/src="/..." — external/anchor/mailto are ignored.
 * BASE-AWARE (B-1 fix): dist's directory layout never contains the deploy
 * base, so URLs are resolved after stripping it — and with a non-root base,
 * any internal URL that does NOT carry the prefix is itself an E-112
 * failure. That is the structural detector B-1 lacked: a hand-written
 * root-relative href would 404 under a subpath deploy while resolving fine
 * inside dist, so existence checking alone can never catch it.
 */
export function checkInternalLinks(distDir: string, base = '/'): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const prefix = base.replace(/\/+$/, ''); // '/' → '' · '/undernote/' → '/undernote'
  for (const file of listHtmlFiles(distDir)) {
    const html = readFileSync(join(distDir, file), 'utf8');
    for (const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      const target = match[1].split('#')[0].split('?')[0];
      if (target === '') continue;
      const key = `${file} → ${target}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (prefix && !(target === prefix || target.startsWith(`${prefix}/`))) {
        findings.push({
          code: 'E-112',
          message: `E-112: 내부 링크 "${target}"에 배포 접두 "${prefix}"가 없습니다 — 서브패스 배포에서 404가 됩니다. 템플릿에서 withBase()를 거치세요 (src/lib/paths.ts).`,
          file: `dist/${file}`,
        });
        continue;
      }

      const sitePath = prefix ? target.slice(prefix.length) : target;
      if (sitePath === '/' || sitePath === '') continue;
      const rel = sitePath.replace(/^\//, '');
      const candidates = [rel, join(rel, 'index.html'), rel.replace(/\/$/, '') + '/index.html'];
      if (!candidates.some((c) => existsSync(join(distDir, c)))) {
        findings.push({
          code: 'E-112',
          message: `E-112: 내부 링크 "${target}"가 빌드 산출물에 없습니다. 링크 오타이거나 대상 지면이 아직 없는 경우입니다 — 링크를 고치거나 대상 페이지를 먼저 만드세요.`,
          file: `dist/${file}`,
        });
      }
    }
  }
  return findings;
}

/**
 * Every `<script>` element in a document, split into its attributes and body.
 *
 * CASE-INSENSITIVE, and that flag is the whole reason this comment exists.
 * HTML tag and attribute names are case-insensitive, so `<SCRIPT>` and
 * `<Script Src=…>` run in a browser exactly like the lowercase spelling —
 * but a case-sensitive scan walks straight past them, finds nothing to
 * report, and lets the build go green. Measured on an isolated copy of the
 * repo: a review body ending in `<SCRIPT>window.pwn=1</SCRIPT>` reached dist
 * with E-116 silent. The runtime CSP still blocked it, which is precisely
 * why the hole was survivable and therefore easy to miss.
 *
 * The closing tag allows trailing space (`</script >` is valid HTML) for the
 * same reason: the markup being scanned was written by somebody else.
 */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/**
 * `src` as an ATTRIBUTE of the tag being examined.
 *
 * `(?:^|\s)` rather than `\b` so that `data-src` is not read as a `src` —
 * the analytics tag carries `data-goatcounter`, and a mis-parse there would
 * turn the site's own external script into an unnamed one. Quotes are
 * optional and either kind, because pasted markup is not Astro's output and
 * need not follow its conventions.
 */
const SRC_ATTR = /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

function scriptTags(html: string): { attrs: string; body: string }[] {
  return [...html.matchAll(SCRIPT_TAG)].map((m) => ({ attrs: m[1], body: m[2] }));
}

/** The `src` URL of a tag, or undefined when it is an inline block. */
function srcOf(attrs: string): string | undefined {
  const m = attrs.match(SRC_ATTR);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** The five entities Astro escapes inside an attribute value, reversed. */
function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * E-116 — the deployed pages may carry the site's OWN scripts and nothing
 * else. Three properties, and the third is the one that catches a paste:
 *
 *   exactly one inline module   · a second block cannot appear quietly
 *   its body is byte-identical  · an edited or injected inline block fails
 *                                 even at the right COUNT
 *   external src allow-list     · only the analytics loader, only when
 *                                 config/site.yaml opted in
 *
 * Body identity is what a count-only gate misses. A review body that ends in
 * `<script>…</script>` produces TWO tags on that page, but a review that
 * somehow replaced the module would produce one — and a count would shrug.
 * Comparing against the source string closes both doors with one rule, and
 * as a by-product proves the string E-117 hashed is the string that shipped.
 */
export function checkScripts(distDir: string, goatcounter?: string): Finding[] {
  const findings: Finding[] = [];
  const allowedSrc = `${ANALYTICS_ORIGIN}/count.js`;

  for (const file of listHtmlFiles(distDir)) {
    const html = readFileSync(join(distDir, file), 'utf8');
    const at = `dist/${file}`;
    let inlineCount = 0;
    let externalCount = 0;

    // An UNCLOSED `<script` never reaches the loop below — the tag pattern
    // needs a closing tag to match — yet a browser happily swallows the rest
    // of the document as script text. Comparing openings to parsed elements
    // turns that silent miss into a failure. `<script` cannot appear in page
    // text: an editor writing about a script types `&lt;script`.
    const opened = (html.match(/<script\b/gi) ?? []).length;
    const tags = scriptTags(html);
    if (opened !== tags.length) {
      findings.push({
        code: 'E-116',
        file: at,
        message: `E-116: 이 지면에 닫히지 않은 <script>가 있습니다 (여는 태그 ${opened}개 · 온전한 요소 ${tags.length}개). 브라우저는 닫히지 않은 스크립트 뒤의 지면 전체를 코드로 읽습니다 — 본문에 붙여 넣은 <script> 덩이를 지우세요.`,
      });
    }

    for (const tag of tags) {
      const src = srcOf(tag.attrs);
      if (src !== undefined) {
        externalCount += 1;
        if (!goatcounter || unescapeAttr(src) !== allowedSrc) {
          findings.push({
            code: 'E-116',
            file: at,
            message: `E-116: 이 지면이 외부 스크립트 "${src}"를 불러옵니다. 이 사이트는 독자의 브라우저에서 남의 코드를 실행하지 않습니다 — 평론·이야기 본문에 붙여 넣은 임베드 코드가 아닌지 확인하고 지우세요. 마크다운의 HTML은 그대로 지면에 실립니다.`,
          });
        }
        continue;
      }
      inlineCount += 1;
      if (tag.body !== enhanceJs()) {
        findings.push({
          code: 'E-116',
          file: at,
          message: `E-116: 이 지면에 사이트의 것이 아닌 인라인 <script>가 있습니다 (${Buffer.byteLength(tag.body, 'utf8')}바이트). 평론·이야기 본문에 붙여 넣은 임베드 코드를 지우세요 — 마크다운의 HTML은 그대로 지면에 실립니다. 사이트가 싣는 유일한 스크립트는 src/scripts/enhance.js입니다.`,
        });
      }
    }

    if (inlineCount !== 1) {
      findings.push({
        code: 'E-116',
        file: at,
        message: `E-116: 이 지면의 사이트 인라인 모듈이 ${inlineCount}개입니다 (허용: 정확히 1개). 지면이 Base 레이아웃을 거치지 않았거나, 본문에 <script>가 섞여 들어간 경우입니다.`,
      });
    }
    const expectedExternal = goatcounter ? 1 : 0;
    if (externalCount !== expectedExternal) {
      findings.push({
        code: 'E-116',
        file: at,
        message: `E-116: 이 지면의 외부 <script>가 ${externalCount}개입니다 (허용: ${expectedExternal}개). 허용되는 외부 스크립트는 config/site.yaml에 goatcounter_code가 설정된 경우의 계측 스니펫 1개뿐입니다.`,
      });
    }
  }
  return findings;
}

/**
 * E-117 — the CSP that shipped must authorise the script that shipped.
 *
 * This check exists because the failure it guards is SILENT. The one module
 * is pure decoration, so a wrong hash blocks it and the page still looks
 * right; nobody finds out that the site's only runtime control is dead. The
 * assertion is deliberately made against dist rather than against the source
 * both values came from — a check that re-derives both sides from the same
 * variable proves only that the variable equals itself.
 */
export function checkCspHash(distDir: string): Finding[] {
  const findings: Finding[] = [];
  for (const file of listHtmlFiles(distDir)) {
    const html = readFileSync(join(distDir, file), 'utf8');
    const at = `dist/${file}`;
    const meta = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/i);
    if (!meta) {
      findings.push({
        code: 'E-117',
        file: at,
        message: 'E-117: 이 지면에 Content-Security-Policy <meta>가 없습니다. Base 레이아웃을 거치지 않은 지면이거나 CSP 방출이 제거된 경우입니다 — src/layouts/Base.astro를 확인하세요.',
      });
      continue;
    }
    const policy = unescapeAttr(meta[1]);
    for (const tag of scriptTags(html)) {
      // Only the SITE's own module is checked. External sources are named by
      // origin rather than hashed, and an injected inline block SHOULD be
      // absent from the policy — that is the policy working. E-116 is what
      // reports the injection; E-117 asks only whether the script we meant
      // to ship is the script we authorised.
      if (srcOf(tag.attrs) !== undefined || tag.body !== enhanceJs()) continue;
      const expected = scriptHash(tag.body);
      if (!policy.includes(expected)) {
        findings.push({
          code: 'E-117',
          file: at,
          message: `E-117: CSP의 script-src에 이 지면 인라인 스크립트의 해시(${expected})가 없습니다. 브라우저가 사이트 자신의 스크립트를 차단하며, 그 스크립트는 장식이라 아무도 눈치채지 못합니다 — Base.astro가 lib/csp.ts의 enhanceJs()로 해시를 만들고 같은 문자열을 방출하는지 확인하세요.`,
        });
      }
    }
  }
  return findings;
}

export function runPostBuildChecks(distDir: string, base = '/', goatcounter?: string): Finding[] {
  return [
    ...checkOgTrio(distDir),
    ...checkInternalLinks(distDir, base),
    ...checkScripts(distDir, goatcounter),
    ...checkCspHash(distDir),
  ];
}
