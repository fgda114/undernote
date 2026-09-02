/**
 * Integrity checker tests (W5.2 layer): E-110 snapshot link-rate, E-111 OG
 * trio scan, E-112 internal link scan (against a synthetic dist tree), the
 * E-104 back-catalog union rule (R-8), and the notice pass wiring
 * (E-301/302 landing in build-report notices — Matthias N-4).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrePass } from '../../src/lib/checker';
import { runNoticePass } from '../../src/lib/checker/notices';
import { checkInternalLinks, checkOgTrio } from '../../src/lib/checker/postbuild';

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
