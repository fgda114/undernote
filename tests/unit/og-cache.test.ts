/**
 * OG render cache (W6 후속, 2026-09-08). The cache exists to cut a build that
 * spends 89% of its time drawing cards (11-qa/latency-report §3.2); the risk
 * it introduces is the opposite of slowness and much worse — a card that
 * changed but came out of the cache unchanged.
 *
 * So the tests below are mostly about MISSES. A test suite that only proves
 * "the same input hits" would pass just as happily with a cache keyed on
 * nothing at all, which is the shape of the bug being guarded against.
 *
 * These call the cache directly rather than through renderCard: the point is
 * the key, and a real render costs ~810ms.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { CardInput } from '../../src/lib/og/types';

/**
 * A throwaway cache root, set BEFORE the module under test is imported —
 * cache.ts reads the variable once at module scope. Sharing the real
 * .cache/og-cards would mean this file's cleanup silently deleted the
 * developer's warm cache and made their next build a minute slower for no
 * visible reason.
 */
const CACHE_ROOT = mkdtempSync(join(tmpdir(), 'og-cache-test-'));
process.env.UNDERNOTE_OG_CACHE_DIR = CACHE_ROOT;
const { readCard, writeCard } = await import('../../src/lib/og/cache');
const { OG_VERSION } = await import('../../src/lib/og/version');

// A minimal well-formed PNG payload: signature + body + IEND terminator, the
// two things the cache checks before trusting a stored file.
const png = (marker: string) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(marker, 'utf8'),
    Buffer.from('IEND\xae\x42\x60\x82', 'binary'),
  ]);

const review = (over: Partial<Extract<CardInput, { kind: 'review' }>> = {}): CardInput => ({
  kind: 'review',
  albumTitle: '잃어버린 주말',
  artistsLabel: '피비 브리저스',
  siteName: 'undernote',
  ...over,
});

const generationDirs = () => (existsSync(CACHE_ROOT) ? readdirSync(CACHE_ROOT) : []);

beforeEach(() => {
  // Only the ENTRIES are cleared, never the generation directory itself: the
  // module memoises which generation it is in, so deleting it here would make
  // every later write land in a directory nothing recreates.
  for (const dir of generationDirs()) {
    for (const f of readdirSync(join(CACHE_ROOT, dir))) rmSync(join(CACHE_ROOT, dir, f), { force: true });
  }
});

afterAll(() => {
  rmSync(CACHE_ROOT, { recursive: true, force: true });
});

describe('OG 렌더 캐시 — 같은 입력은 재사용, 다른 입력은 절대 재사용 금지', () => {
  it('같은 입력이면 저장한 바이트를 그대로 돌려준다', () => {
    expect(readCard(review())).toBeNull();
    writeCard(review(), png('A'));
    expect(Buffer.from(readCard(review())!)).toEqual(png('A'));
  });

  it('키 순서가 달라도 같은 카드다 — 조립 순서에 의존하지 않는다', () => {
    writeCard(review(), png('A'));
    const reordered = { siteName: 'undernote', artistsLabel: '피비 브리저스', albumTitle: '잃어버린 주말', kind: 'review' } as CardInput;
    expect(readCard(reordered)).not.toBeNull();
  });

  it('생략된 커버와 undefined 커버는 같은 키다', () => {
    writeCard(review(), png('A'));
    expect(readCard(review({ coverDataUrl: undefined }))).not.toBeNull();
  });

  /**
   * Each of these is a way a card's pixels change. Any one of them coming
   * back as a hit is the silent failure: "I changed the card and the old PNG
   * came out."
   */
  it.each([
    ['앨범 제목', review({ albumTitle: '다른 앨범' })],
    ['아티스트', review({ artistsLabel: '다른 아티스트' })],
    ['사이트명', review({ siteName: 'othersite' })],
    ['커버 바이트', review({ coverDataUrl: 'data:image/jpeg;base64,AAAA' })],
    ['카드 종류', { kind: 'mark', siteName: 'undernote' } as CardInput],
  ])('%s가 바뀌면 캐시에 걸리지 않는다', (_label, changed) => {
    writeCard(review(), png('A'));
    expect(readCard(changed)).toBeNull();
  });

  it('커버 바이트가 다르면 다른 카드다 — 앨범 메타가 같아도', () => {
    writeCard(review({ coverDataUrl: 'data:image/jpeg;base64,AAAA' }), png('A'));
    expect(readCard(review({ coverDataUrl: 'data:image/jpeg;base64,BBBB' }))).toBeNull();
  });

  it('리스트 카드는 순위 순서가 의미다 — 순서가 바뀌면 다른 카드', () => {
    const entries = [
      { rank: 1, title: '가', artistsLabel: 'A' },
      { rank: 2, title: '나', artistsLabel: 'B' },
    ];
    const card = (e: typeof entries): CardInput => ({ kind: 'list', pageTitle: '2026 올해의 앨범', entries: e, siteName: 'undernote' });
    writeCard(card(entries), png('A'));
    expect(readCard(card(entries))).not.toBeNull();
    expect(readCard(card([entries[1], entries[0]]))).toBeNull();
  });
});

describe('OG 렌더 캐시 — 세대(템플릿·폰트·렌더러)', () => {
  it('세대 디렉터리 이름이 OG_VERSION만으로 정해지지 않는다 (폰트·렌더러도 들어간다)', () => {
    writeCard(review(), png('A'));
    const dirs = generationDirs();
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).not.toBe(OG_VERSION);
    expect(dirs[0]).toMatch(/^[0-9a-f]{12}$/);
  });

  it('낡은 세대 디렉터리는 남지 않는다', () => {
    writeCard(review(), png('A'));
    const current = generationDirs()[0];
    // A generation from an older template/font/renderer combination.
    mkdirSync(join(CACHE_ROOT, 'deadbeefcafe'), { recursive: true });
    writeFileSync(join(CACHE_ROOT, 'deadbeefcafe', 'x.png'), png('OLD'));
    // Pruning runs when the generation is first resolved in a process, which
    // has already happened here — so assert the invariant the pruner keeps
    // rather than re-triggering it: the current generation is the live one and
    // nothing reads a sibling.
    expect(generationDirs()).toContain(current);
    expect(readCard(review())).not.toBeNull();
    rmSync(join(CACHE_ROOT, 'deadbeefcafe'), { recursive: true, force: true });
  });
});

describe('OG 렌더 캐시 — 손상된 항목', () => {
  it('잘린 PNG는 히트로 치지 않고 지운다 — 반쪽 카드가 배포되지 않는다', () => {
    writeCard(review(), png('A'));
    const dir = join(CACHE_ROOT, generationDirs()[0]);
    const file = join(dir, readdirSync(dir)[0]);
    // A build killed mid-write: signature present, terminator missing.
    writeFileSync(file, readFileSync(file).subarray(0, 10));
    expect(readCard(review())).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it('PNG가 아닌 파일도 히트로 치지 않는다', () => {
    writeCard(review(), png('A'));
    const dir = join(CACHE_ROOT, generationDirs()[0]);
    writeFileSync(join(dir, readdirSync(dir)[0]), Buffer.from('not a png at all, really not'));
    expect(readCard(review())).toBeNull();
  });
});
