/**
 * F-2 (2026-09-10, QA 권고 채택). `4aa3283`이 고친 결함 — 같은 다장르 앨범을
 * 홈 보드는 `Rage`(보드에서 마지막으로 발견된 버킷), 리뷰 상세는
 * `Digicore`(album.buckets[0])로 서로 다르게 불렀다 — 를 겨냥한 e2e가 그
 * 커밋에도, 이후에도 없었다. tests/unit/derive-lists.test.ts에 같은 성질의
 * 유닛 테스트를 추가했지만(파생 함수 레벨), 이 파일은 실제 `astro build` 산출물
 * 두 장을 나란히 읽어 같은 성질을 한 번 더 고정한다 — 유닛 테스트가 못 잡는
 * 실패(템플릿이 파생 함수가 준 값을 엉뚱한 필드로 렌더링하는 것 등)는 이쪽만
 * 잡는다.
 *
 * 공유 rich 샌드박스(RICH_SET)에 다장르 항목을 추가하지 않았다 — 그 샌드박스는
 * `build.dist-matrix.spec.ts`가 지면 수(29) · 점수 배열(SCORES, 8건) ·
 * 아티스트 칩 수(8) 등 정확한 개수로 고정해 둔 공용 자원이라, 항목 하나를
 * 보태는 것만으로도 그 단언들이 전부 깨진다. 대신 `build.ladder.spec.ts`가 쓰는
 * 것과 같은 전용 격리 샌드박스를 새로 만든다 — 이 파일이 무엇을 검사하는지가
 * 다른 스펙의 픽스처 크기에 좌우되지 않는다.
 *
 * 서로 비교하는 것만으로는 부족하다: 홈과 리뷰 상세가 똑같이 틀린 값(예: 둘 다
 * "마지막 버킷"을 읽도록 나란히 회귀)에 수렴해도 통과해 버린다. 그래서 두 지면의
 * 라벨을 config/genres.yaml에서 직접 읽은 라벨(album.buckets[0]에 대응하는
 * 값)과 각각 대조한다 — 하드코딩된 "Digicore" 문자열이 아니라, 빌드가 실제로
 * 읽은 설정 파일에서 뽑은 값과 비교한다(build.ladder.spec.ts가 popLabel을
 * 읽는 것과 같은 방식).
 */
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePathOf, build, makeSandbox, readPage } from '../lib/sandbox.mjs';
import { writeBaseContent } from '../lib/rich-content.mjs';

const SLUG = 'multi-genre-album';
const ARTIST = 'multi-genre-artist';

test('다장르 앨범 — 홈 보드·리뷰 상세가 같은 장르 라벨을 보이고, 둘 다 album.buckets[0]과 일치 (F-2)', async () => {
  const dir = makeSandbox('genre-consistency');
  const B = basePathOf(dir);

  // writeBaseContent seeds the single pop fixture review this suite's other
  // specs rely on (ladder, retro-link) — not needed here, but a completely
  // empty content tree fails other build invariants, and reusing the same
  // base keeps this fixture ordinary rather than a new special case.
  await writeBaseContent(dir);

  // Real config/genres.yaml (copied into the sandbox by makeSandbox), 2026
  // block — `digicore` (order 3) before `rage` (order 4), the exact pairing
  // the original defect report used (slayr — Half Blood, `buckets:
  // [digicore, rage]`).
  writeFileSync(join(dir, 'content', 'artists', `${ARTIST}.md`), '---\nname: 다장르 아티스트\n---\n\n소개글.\n', 'utf8');
  writeFileSync(
    join(dir, 'content', 'albums', `${SLUG}.yaml`),
    ['title: 다장르 앨범', `artists: [${ARTIST}]`, 'release_date: "2026-04-01"', 'buckets: [digicore, rage]', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(dir, 'content', 'reviews', `${SLUG}.md`),
    ['---', `album: ${SLUG}`, 'score: "8.5"', 'date: 2026-08-30', 'editorial_check: true', '---', '', '다장르 앨범 본문. 숫자는 없다.', ''].join('\n'),
    'utf8',
  );

  const result = build(dir);
  expect(result.status, result.out.slice(-3000)).toBe(0);

  // Ground truth: digicore's OWN label, read from the same genres.yaml the
  // build consumed — never hardcoded, so a future relabel cannot make this
  // test compare against a string the config no longer says.
  const genresYaml = readFileSync(join(dir, 'config', 'genres.yaml'), 'utf8');
  const digicoreLabel = genresYaml.match(/id:\s*"digicore",\s*label:\s*"([^"]+)"/)?.[1];
  const rageLabel = genresYaml.match(/id:\s*"rage",\s*label:\s*"([^"]+)"/)?.[1];
  expect(digicoreLabel, 'genres.yaml에서 digicore 라벨을 못 읽음 — 픽스처 전제가 깨짐').toBeTruthy();
  expect(rageLabel, 'genres.yaml에서 rage 라벨을 못 읽음 — 픽스처 전제가 깨짐').toBeTruthy();

  // ── 홈 보드 (ChartCard, `.bucket` span) ──
  const home = readPage(dir, '/');
  const boardHrefFrag = `href="${B}/reviews/${SLUG}/"`;
  const boardAt = home.indexOf(boardHrefFrag);
  expect(boardAt, `홈 보드에 ${SLUG} 카드 링크 부재`).toBeGreaterThan(-1);
  // The chart card's own closing tag bounds the search to THIS card only —
  // same technique build.dist-matrix.spec.ts's MJ-1 test uses.
  const boardCardEnd = home.indexOf('</li>', boardAt);
  const boardCard = home.slice(boardAt, boardCardEnd);
  expect(boardCard, `홈 보드 라벨이 digicore(buckets[0])가 아님 — 카드 조각:\n${boardCard}`).toContain(`>${digicoreLabel}<`);
  expect(boardCard, '홈 보드가 buckets[1](rage) 라벨을 보임 — F-2 회귀').not.toContain(`>${rageLabel}<`);

  // ── 리뷰 상세 (hero-sub의 "아티스트 · 장르 · 연도" 줄) ──
  const review = readPage(dir, `/reviews/${SLUG}/`);
  expect(review, `리뷰 상세 라벨이 digicore(buckets[0])가 아님`).toContain(`· ${digicoreLabel} ·`);
  expect(review, '리뷰 상세가 buckets[1](rage) 라벨을 보임 — F-2 회귀').not.toContain(`· ${rageLabel} ·`);
});
