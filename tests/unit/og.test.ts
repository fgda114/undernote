/**
 * OG card assembly tests — pins the E-115 design: assembled card inputs
 * never carry a score key (type-level exclusion, verified at runtime here so
 * a future refactor cannot quietly widen the input).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assembleBaseCard, assembleReviewCard } from '../../src/lib/og/assemble';
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

  it('기본형 카드에 워드마크(사이트명 + seal 마침표)가 있다', () => {
    const json = JSON.stringify(cardTree(assembleBaseCard('제목', 'undernote')));
    expect(json).toContain('undernote');
    expect(json).toContain('#B23A2F');
  });
});
