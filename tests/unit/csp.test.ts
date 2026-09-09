/**
 * CSP — the policy must cover every origin the page actually talks to.
 *
 * WHY THIS FILE EXISTS. Adding `default-src 'self'` (2026-09-09, closing
 * UN-SEC-017) silently blocked GoatCounter's pageview beacon: `script-src`
 * had been widened for the LOADER (gc.zgo.at) and nothing covered the
 * BEACON ({code}.goatcounter.com), so it fell through to the new default.
 * The loader still fetches, the script still runs, the page looks perfect —
 * only the analytics never arrive. A security control that silently
 * disables a feature is exactly the failure mode this codebase keeps
 * producing, and it survived a security audit and a code review before a
 * third reader caught it by reading two files side by side.
 *
 * HOW THESE TESTS AVOID REPEATING THAT MISTAKE. The obvious test — assert
 * cspContent() contains "https://x.goatcounter.com" — is worthless here: it
 * restates the implementation, so an implementation that names the wrong
 * host passes against a test that names the same wrong host. That is the
 * shape of nearly every silent failure in this repo's history: two things
 * compared against each other, both wrong together.
 *
 * So the expected origins are read out of `src/layouts/Base.astro` — the
 * file whose markup decides where the browser actually sends bytes. If
 * someone changes the beacon URL there, these fail. If someone narrows the
 * policy here, these fail. Neither file can drift alone.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_ORIGIN, analyticsBeaconOrigin, cspContent } from '../../src/lib/csp.ts';

const LAYOUT = readFileSync('src/layouts/Base.astro', 'utf8');
const SAMPLE_CODE = 'undernote-test';

/** Every directive of a policy string, as name → value list. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

/**
 * The origins Base.astro's analytics tag actually names, derived from the
 * template literals in the markup rather than restated here. Returns the
 * loader's `src` and the beacon's `data-goatcounter` host, with the code
 * substituted the same way Astro would.
 */
function originsFromLayout(code: string): { loader: string; beacon: string } {
  const src = LAYOUT.match(/src="(https:\/\/[^"]+)\/count\.js"/);
  const beacon = LAYOUT.match(/data-goatcounter=\{`https:\/\/\$\{goatcounter\}\.([^/`]+)\/count`\}/);
  if (!src || !beacon) {
    throw new Error('Base.astro no longer carries the analytics tag in the expected shape — update this test WITH the markup, not around it.');
  }
  return { loader: src[1], beacon: `https://${code}.${beacon[1]}` };
}

describe('CSP — 분석 태그가 실제로 말하는 출처를 정책이 덮는가', () => {
  it('로더와 비컨은 서로 다른 출처다 (이 테스트의 전제)', () => {
    const { loader, beacon } = originsFromLayout(SAMPLE_CODE);
    expect(loader).not.toBe(beacon);
    // If these two ever became the same origin, the bug this file guards
    // could not happen — and a passing suite would stop meaning anything.
    // Fail loudly instead of quietly guarding nothing.
    expect(loader).toBe(ANALYTICS_ORIGIN);
  });

  it('분석이 켜지면 로더는 script-src에 있다', () => {
    const { loader } = originsFromLayout(SAMPLE_CODE);
    expect(directives(cspContent(SAMPLE_CODE)).get('script-src')).toContain(loader);
  });

  it('분석이 켜지면 비컨 출처가 connect-src와 img-src 둘 다에 있다', () => {
    const { beacon } = originsFromLayout(SAMPLE_CODE);
    const d = directives(cspContent(SAMPLE_CODE));
    // Both: GoatCounter has shipped an <img> beacon and a fetch/sendBeacon
    // path at different versions, and the policy must not depend on which.
    expect(d.get('connect-src'), 'beacon blocked under connect-src').toContain(beacon);
    expect(d.get('img-src'), 'beacon blocked under img-src').toContain(beacon);
  });

  it('비컨 출처를 만드는 함수가 마크업이 쓰는 형태와 같다', () => {
    expect(analyticsBeaconOrigin(SAMPLE_CODE)).toBe(originsFromLayout(SAMPLE_CODE).beacon);
  });

  it('분석이 꺼지면 외부 출처가 정책 어디에도 없다', () => {
    const policy = cspContent(undefined);
    expect(policy).not.toContain('goatcounter');
    expect(policy).not.toContain(ANALYTICS_ORIGIN);
    // …and the page's own resources still work: default-src plus the two
    // directives that would otherwise narrow to nothing.
    const d = directives(policy);
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('connect-src')).toContain("'self'");
    expect(d.get('img-src')).toContain("'self'");
  });

  it("default-src 'self'가 남아 있다 — 이 정책의 바닥", () => {
    expect(directives(cspContent(SAMPLE_CODE)).get('default-src')).toEqual(["'self'"]);
  });
});
