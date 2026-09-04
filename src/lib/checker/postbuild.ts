/**
 * Post-build integrity scan over dist/ (sequence B, checker stage 2):
 *
 *   E-111 — every HTML page must carry the OG trio (title/description/image).
 *   E-112 — every internal link must resolve to a file in dist.
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

export function runPostBuildChecks(distDir: string, base = '/'): Finding[] {
  return [...checkOgTrio(distDir), ...checkInternalLinks(distDir, base)];
}
