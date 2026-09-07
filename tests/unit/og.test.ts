/**
 * OG card assembly tests — pins the E-115 design: assembled card inputs
 * never carry a score key (type-level exclusion, verified at runtime here so
 * a future refactor cannot quietly widen the input).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assembleBaseCard, assembleMarkCard, assembleReviewCard } from '../../src/lib/og/assemble';
import { cardTree } from '../../src/lib/og/template';

const site = { site_name: 'undernote', og_use_cover: true };

// assembleReviewCard reads public/<cover> off disk and base64s the bytes (it
// never decodes them), so the test owns a throwaway file instead of pointing
// at whichever album happens to be published — published content comes and
// goes (the fixture set is on the launch checklist), this test must not.
const TMP_COVER = 'covers/tmp-og-test-cover.jpg';
const TMP_PATH = join('public', TMP_COVER);
beforeAll(() => {
  mkdirSync(join('public', 'covers'), { recursive: true });
  writeFileSync(TMP_PATH, Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]));
});
afterAll(() => rmSync(TMP_PATH, { force: true }));

describe('assembleReviewCard', () => {
  it('조립 결과에 score 키가 존재하지 않는다 (E-115 데이터 레벨 강제)', () => {
    const card = assembleReviewCard({
      album: { title: '앨범', cover: undefined },
      artistsLabel: '아티스트',
      site,
    });
    expect(Object.keys(card)).not.toContain('score');
    expect(JSON.stringify(card)).not.toContain('score');
  });

  it('커버 없음 → coverDataUrl 없음 (렌더러가 기본형 폴백)', () => {
    const card = assembleReviewCard({ album: { title: 'T', cover: undefined }, artistsLabel: 'A', site });
    expect(card.coverDataUrl).toBeUndefined();
  });

  it('og_use_cover=false 킬스위치 → 커버가 있어도 미사용 (ADR-0008 §5)', () => {
    const card = assembleReviewCard({
      album: { title: 'T', cover: TMP_COVER },
      artistsLabel: 'A',
      site: { site_name: 'undernote', og_use_cover: false },
    });
    expect(card.coverDataUrl).toBeUndefined();
  });

  it('커버 + 킬스위치 on → data URL 포함', () => {
    const card = assembleReviewCard({
      album: { title: 'T', cover: TMP_COVER },
      artistsLabel: 'A',
      site,
    });
    expect(card.coverDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe('cardTree', () => {
  it('커버 없는 평론 카드는 기본형 트리로 내려간다', () => {
    const tree = cardTree(assembleReviewCard({ album: { title: '앨범', cover: undefined }, artistsLabel: 'A', site }));
    expect(JSON.stringify(tree)).toContain('Reviews'); // format label survives
    expect(JSON.stringify(tree)).not.toContain('data:image');
  });

  it('리스트 카드는 순위·제목·아티스트만 담는다 (점수 문자열 없음)', () => {
    const tree = cardTree({
      kind: 'list',
      pageTitle: '2026 올해의 앨범',
      entries: [{ rank: 1, title: '앨범', artistsLabel: '아티스트' }],
      siteName: 'undernote',
    });
    const json = JSON.stringify(tree);
    expect(json).toContain('앨범');
    expect(json).not.toContain('score');
  });

  // The accent period is the wordmark's only surviving piece of colour, so
  // it doubles as the check that the card tracks the site palette. The hex
  // is the CURRENT --accent value; when tokens.css changes, og/template.ts
  // and this literal move together or the share cards silently keep the old
  // identity (W5 palette pass, 2026-09-06: lime #D2F53C → mint #63EFC0).
  it('기본형 카드에 워드마크(사이트명 + 악센트 마침표)가 있다', () => {
    const json = JSON.stringify(cardTree(assembleBaseCard('제목', 'undernote')));
    expect(json).toContain('undernote');
    expect(json).toContain('#63EFC0');
  });
});

describe('기본 공유 카드 — 워드마크만 (2026-09-07)', () => {
  it('사이트 이름과 악센트 마침표만 있고 다른 텍스트가 없다', () => {
    const json = JSON.stringify(cardTree(assembleMarkCard('undernote')));
    expect(json).toContain('undernote');
    expect(json).toContain('#63EFC0'); // the accent period survives
    expect(json).toContain('#080C16'); // the site's own ground
    // The tagline used to be printed here and is not any more: the card is a
    // mark, the sentence is the page's meta description.
    expect(json).not.toContain('차트 밖의 명반');
    expect(json).not.toContain('음악을 좋아하는');
  });

  it('D2/E-115 — 입력 타입에 score가 없다 (D2-R2로 뒤집히지 않는 규칙)', () => {
    const card = assembleMarkCard('undernote');
    expect(Object.keys(card)).not.toContain('score');
    // Browsing surfaces show figures now; share cards still never do, and it
    // is still the TYPE that guarantees it rather than a rendering habit.
    expect(JSON.stringify(cardTree(card))).not.toContain('score');
  });
});
