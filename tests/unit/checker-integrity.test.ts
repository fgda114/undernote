/**
 * Integrity checker tests (W5.2 layer): E-110 snapshot link-rate, E-111 OG
 * trio scan, E-112 internal link scan (against a synthetic dist tree), the
 * E-104 back-catalog union rule (R-8), the notice pass wiring (E-301/302
 * landing in build-report notices — Matthias N-4), and the dist script
 * allow-list + CSP hash pairing (E-116/E-117).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrePass } from '../../src/lib/checker';
import { runNoticePass } from '../../src/lib/checker/notices';
import { checkCspHash, checkInternalLinks, checkOgTrio, checkScripts } from '../../src/lib/checker/postbuild';
import { ANALYTICS_ORIGIN, enhanceJs, scriptHash } from '../../src/lib/csp';

const fixtureRoot = (name: string) => fileURLToPath(new URL(`../fixtures/${name}/`, import.meta.url));

// ── synthetic dist tree ────────────────────────────────────────────────

const dist = mkdtempSync(join(tmpdir(), 'undernote-dist-'));
afterAll(() => rmSync(dist, { recursive: true, force: true }));

function page(rel: string, body: string) {
  mkdirSync(join(dist, rel, '..'), { recursive: true });
  writeFileSync(join(dist, rel), body, 'utf8');
}

const OG = '<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i">';

describe('E-111 — OG 3요소 dist 전수 스캔', () => {
  it('3요소가 있는 페이지는 통과, 빠진 페이지는 실패로 잡힌다', () => {
    page('index.html', `<html><head>${OG}</head><body></body></html>`);
    page('broken/index.html', '<html><head><meta property="og:title" content="t"></head><body></body></html>');
    const findings = checkOgTrio(dist);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('E-111');
    expect(findings[0].file).toContain('broken');
    expect(findings[0].message).toContain('og:description');
  });
});

describe('E-112 — 내부 링크 해석', () => {
  it('실존 대상은 통과, 깨진 내부 링크는 실패, 외부 링크는 무시', () => {
    page('links/index.html', `<html><head>${OG}</head><body>
      <a href="/">home</a>
      <a href="/broken/">ok</a>
      <a href="/nowhere/">dead</a>
      <a href="https://example.com/x">external</a>
    </body></html>`);
    const findings = checkInternalLinks(dist);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('E-112');
    expect(findings[0].message).toContain('/nowhere/');
  });
});

describe('E-110 — 스냅샷 항목의 평론 실존 (USP-A)', () => {
  it('삭제된 평론을 참조하는 스냅샷 → E-110 실패 + 항목 명시', () => {
    const { result } = runPrePass(fixtureRoot('snapshot-broken-repo'));
    const e110 = result.failures.filter((f) => f.code === 'E-110');
    expect(e110).toHaveLength(1);
    expect(e110[0].message).toContain('ghost-album');
  });
});

describe('E-104 — 구반(연도 블록 없음)은 전 연도 합집합으로 검증 (R-8)', () => {
  it('2020년 발매 + 존재하는 버킷 id → 통과', () => {
    const { result } = runPrePass(fixtureRoot('back-catalog-repo'));
    expect(result.failures.map((f) => f.code)).not.toContain('E-104');
  });
});

describe('알림 패스 — E-301·E-302가 notices로 산출 (Matthias N-4)', () => {
  it('경계 동점 + 해 넘김 픽스처가 각각 그 코드로 나온다', () => {
    const { data } = runPrePass(fixtureRoot('notice-repo'));
    const { notices } = runNoticePass(data, null);
    const codes = notices.map((n) => n.code);
    expect(codes).toContain('E-301');
    expect(codes).toContain('E-302');
  });
});

/**
 * E-116/E-117 (2026-09-07). These two exist because a review body's raw HTML
 * reaches dist untouched, and the "one hand-written script" contract was
 * only ever asserted against a SYNTHETIC e2e fixture dist — never against
 * the bytes that deploy (10-security UN-SEC-010).
 *
 * The negative cases below are the point of the tests: a gate that only
 * proves the current site passes is a gate nobody has seen fail.
 */
const CSP_META = (policy: string) => `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
const SITE_SCRIPT = `<script type="module">${enhanceJs()}</script>`;

describe('E-116 — 실 dist 스크립트 허용 목록', () => {
  it('사이트 모듈 1개뿐인 지면은 통과한다', () => {
    page('ok/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}</body></html>`);
    expect(checkScripts(join(dist, 'ok'))).toEqual([]);
  });

  it('본문에 붙여 넣은 인라인 <script>는 실패시킨다 — 편집자용 메시지', () => {
    page('injected/index.html', `<html><head>${OG}</head><body><script>window.x=1</script>${SITE_SCRIPT}</body></html>`);
    const findings = checkScripts(join(dist, 'injected'));
    expect(findings.map((f) => f.code)).toEqual(['E-116', 'E-116']);
    expect(findings[0].message).toContain('붙여 넣은 임베드 코드');
    expect(findings[1].message).toContain('2개');
  });

  it('외부 스크립트는 goatcounter 미설정 시 전부 실패, 설정 시 그 1개만 허용', () => {
    const gc = `<script data-goatcounter="x" async src="${ANALYTICS_ORIGIN}/count.js"></script>`;
    page('gc/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}${gc}</body></html>`);
    expect(checkScripts(join(dist, 'gc'))).not.toEqual([]);
    expect(checkScripts(join(dist, 'gc'), 'undernote')).toEqual([]);

    // …and opting in does NOT open the door to any other origin.
    page('other/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}<script src="https://evil.example/x.js"></script></body></html>`);
    const other = checkScripts(join(dist, 'other'), 'undernote');
    expect(other.map((f) => f.code)).toEqual(['E-116']);
    expect(other[0].message).toContain('evil.example');
  });

  it('모듈이 아예 없는 지면도 실패시킨다 (방출이 사라진 회귀)', () => {
    page('nojs/index.html', `<html><head>${OG}</head><body></body></html>`);
    const findings = checkScripts(join(dist, 'nojs'));
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('0개');
  });

  /**
   * The four below were all MISSED by the first version of this gate, and
   * each was confirmed on an isolated build before the fix: `<SCRIPT>` and
   * `<Script Src=…>` reached dist with nothing reported. HTML tag and
   * attribute names are case-insensitive, so every one of these executes;
   * only the scanner cared about the casing.
   */
  it('대문자 <SCRIPT>도 잡는다 — 브라우저는 대소문자를 가리지 않는다', () => {
    page('upper/index.html', `<html><head>${OG}</head><body><SCRIPT>window.x=1</SCRIPT>${SITE_SCRIPT}</body></html>`);
    const findings = checkScripts(join(dist, 'upper'));
    expect(findings.map((f) => f.code)).toEqual(['E-116', 'E-116']);
    expect(findings[0].message).toContain('붙여 넣은 임베드 코드');
  });

  it('대소문자 섞인 외부 <Script Src>도 잡는다', () => {
    page('mixed/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}<Script Src="https://evil.example/a.js"></Script></body></html>`);
    const findings = checkScripts(join(dist, 'mixed'), 'undernote');
    expect(findings.map((f) => f.code)).toEqual(['E-116']);
    expect(findings[0].message).toContain('evil.example');
  });

  it("따옴표 없는·홑따옴표 src도 외부로 센다", () => {
    page('quotes/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}<script src='https://a.example/1.js'></script><script src=https://b.example/2.js></script></body></html>`);
    const urls = checkScripts(join(dist, 'quotes'), 'undernote').map((f) => f.message);
    expect(urls.filter((m) => m.includes('a.example'))).toHaveLength(1);
    expect(urls.filter((m) => m.includes('b.example'))).toHaveLength(1);
  });

  it('닫히지 않은 <script>는 요소로 파싱되지 않으므로 여는 태그 수로 잡는다', () => {
    page('unclosed/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}<script>window.x=1</body></html>`);
    const findings = checkScripts(join(dist, 'unclosed'));
    expect(findings[0].code).toBe('E-116');
    expect(findings[0].message).toContain('닫히지 않은');
  });

  it("data-src는 src가 아니다 — 계측 태그를 오파싱하지 않는다", () => {
    const gc = `<script data-src="x" data-goatcounter="y" async src="${ANALYTICS_ORIGIN}/count.js"></script>`;
    page('datasrc/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}${gc}</body></html>`);
    expect(checkScripts(join(dist, 'datasrc'), 'undernote')).toEqual([]);
  });
});

describe('E-117 — CSP 해시가 실린 스크립트와 짝이 맞는가', () => {
  const good = `script-src ${scriptHash(enhanceJs())}; object-src 'none'; base-uri 'self'`;

  it('해시가 맞으면 통과한다', () => {
    page('csp-ok/index.html', `<html><head>${OG}${CSP_META(good)}</head><body>${SITE_SCRIPT}</body></html>`);
    expect(checkCspHash(join(dist, 'csp-ok'))).toEqual([]);
  });

  it('해시가 어긋나면 실패한다 — 이 실패가 없으면 CSP가 조용히 죽는다', () => {
    const stale = `script-src ${scriptHash(`${enhanceJs()} `)}; object-src 'none'`;
    page('csp-stale/index.html', `<html><head>${OG}${CSP_META(stale)}</head><body>${SITE_SCRIPT}</body></html>`);
    const findings = checkCspHash(join(dist, 'csp-stale'));
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('E-117');
  });

  it('meta 자체가 없으면 실패한다', () => {
    page('csp-none/index.html', `<html><head>${OG}</head><body>${SITE_SCRIPT}</body></html>`);
    expect(checkCspHash(join(dist, 'csp-none'))[0].message).toContain('<meta>가 없습니다');
  });

  it('주입된 스크립트가 허용 목록에 없는 것은 정상이다 — E-117이 울지 않는다', () => {
    page('csp-inj/index.html', `<html><head>${OG}${CSP_META(good)}</head><body><script>window.x=1</script>${SITE_SCRIPT}</body></html>`);
    expect(checkCspHash(join(dist, 'csp-inj'))).toEqual([]);
  });
});
