# undernote — 추적성 매트릭스 (Traceability Matrix)

| | |
|---|---|
| 작성 | Timothy (역할 #11 · Docs Engineer) · 2026-09-03 |
| 방법 | `user-stories.md`(US-1~15) → `service-sequences.md`(SS-1~15) → 구현 코드(file:line) → 테스트(file:line/describe) 순으로 역추적. 코드·테스트 존재를 직접 읽고 확인한 것만 "✅"로 표기, 확인 못 한 것은 "미확인" |
| 테스트 총계 | 실측(2026-09-03): `npm test` → **12 Test Files, 131 Tests, 전부 통과** |

기호: ✅ 코드·테스트 확인됨 · ⚠ 코드는 있으나 테스트 커버리지 미확인/부분적 · ✖ 미구현(설계된 대기 상태 포함, 사유 명시) · 🔗 `design-vs-impl-gaps.md` 교차 참조

---

## 1. 독자 스토리 (US-1~9)

| US | 요구 | SS/원칙 | 코드 | 테스트 | 상태 |
|---|---|---|---|---|---|
| US-1 리스트→근거 | AC1 전 항목 클릭 시 평론 도달 | SS-8(E-110) | `ListEntry.review_url` 필수 필드(`lists.ts:35-43`), `resolve.ts:158-178` E-110 | `checker-integrity.test.ts:57` "E-110 — 스냅샷 항목의 평론 실존" | ✅ |
| US-2 진행 중 리스트 | AC2 5편 미만 버킷 = 있는 만큼 | SS-4, R-4 | `deriveBoard`(`lists.ts:119-135`) — `slice(0,5)`, 채움 로직 없음 | `derive-lists.test.ts:168` "R-4·R-6 — 빈 집합과 미달" | ✅ |
| US-3 이해의 사다리 | AC2 폴백 사슬 순서, 섞지 않음 | SS-9·10 | `deriveBacklinks`(`links.ts:60-87`) | `derive-links.test.ts:47` "폴백 사슬 4모드 (섞기 금지)" | ✅ |
| US-4 이야기→평론 | AC2 미평론 앨범 = 비링크 텍스트 | SS-9 | `deriveAlbumBoxRows`(`links.ts:109-132`) `reviewUrl: null` | `derive-links.test.ts:104` "AlbumBox 행 상태 (안 A · US-4)" | ✅ |
| US-5 월말정산 | AC2 0편 월 = 페이지 미생성 | SS-7, R-4 | `deriveMonthlyRecaps`(`lists.ts:154-164`) — 빈 월은 Map에 미등록 | `derive-lists.test.ts:168` (R-4 스위트 공유) | ✅ |
| US-6 아카이브 탐색 | AC3 고아 콘텐츠 0 | SS-11, E-113 | `detectOrphans`(`archive.ts:101-113`) | `derive-archive.test.ts:95` "E-113 — 고아 검사 확정판" | ✅ |
| US-7 듣기 링크 | AC2 자동·수기 모두 없음 = 경고 | SS-13, E-205 | `buildListenLinks`(`listen-links.ts:36-54`), `resolve.ts:117-127` | `derive.test.ts:13` "listen-links (SS-13)" | ✅ |
| US-8 선별 규칙 | AC1 소개 페이지 3원칙 | CF-8 | `src/pages/about.astro` (본문 카피 — 코드 검사 대상 아님) | 없음(수동 QA 영역) | ⚠ Matthias QA 소관 |
| US-9 아티스트 페이지 | AC2 소개글 없어도 페이지 성립 | SS-12, R-4 | `artistSchema`(빈 본문 허용, `artist.ts`), `resolve.ts:13-16`(E-101 제외) | `review-schema.test.ts` 계열에는 아티스트 스키마 전용 테스트 없음 — `checker.test.ts:15` 유효 저장소 스위트가 빈 본문 아티스트 픽스처 포함 | ✅(간접) |

## 2. 편집자(원) 스토리 (US-10~15)

| US | 요구 | SS/원칙 | 코드 | 테스트 | 상태 |
|---|---|---|---|---|---|
| US-10 평론 발행 | AC2 4필드 누락 = 미발행 | SS-1, E-100~106 | `reviewSchema`(`review.ts:42-57`) | `review-schema.test.ts:23` "Review 스키마 — 유효/무효 픽스처 쌍" | ✅ |
| US-10 | AC4 미분류 = etc | E-104 예외 | `resolve.ts:86-101` (`bucket !== 'etc'`일 때만 검사) | `checker-integrity.test.ts:66` "E-104 — 구반은 전 연도 합집합 (R-8)" | ✅ |
| US-11 이야기 발행 | AC1 양방향 자동 링크 | SS-9·10 | `storyRefIndex`+`deriveBacklinks`(`links.ts:48-87`) | `derive-links.test.ts:47` | ✅ |
| US-11 | AC2 소급 링크(재빌드 시 생성) | 전량 재계산 특성 | 별도 코드 없음 — `joinReviews`/`deriveArchiveIndex`가 매 빌드 전체 재계산이라는 사실 자체가 근거 | 전용 회귀 테스트는 없음(설계상 "공짜 속성"이라 상태 저장 코드가 없어 테스트할 대상도 없음) | ✅(구조적) |
| US-12 점수 수정 | AC1 확정 스냅샷만 불변 | R-2, SS-3 | `deriveMonthlyRecaps`가 스냅샷을 읽지 않고 리뷰만 읽음(`lists.ts:154`) — 스냅샷은 별도 컬렉션 | `derive-lists.test.ts:189` "R-2·R-5 — 점수 수정은 과거 월말정산까지 전파" | ✅ |
| US-12 | AC2 경계 동점 알림 | E-301 | `detectBoundaryTies`(`lists.ts:270-295`) | `derive-lists.test.ts:223` "E-301 — 경계 동점만 알림" | ✅ |
| US-13 연말 확정 | AC1 스냅샷 동결+이듬해 빈 보드 | SS-6 | `scripts/finalize.ts:79-166` | `finalize.test.ts:39` "finalize — 시퀀스 C" | ✅ |
| US-13 | AC3 2편 이하 버킷 미발행 | D1 성립 규칙 | `finalize.ts:90` `published = bucket.entries.length >= minToPublish` | `finalize.test.ts`(시퀀스 C 스위트 내) | ⚠ 성립 규칙 단독 케이스 라인 미확인(스위트 3건 요약만 확인, 개별 assert 미열람) |
| US-14 아티스트 소개 | AC2 순서 무관 자동 집계 | SS-12 | `deriveArchiveIndex`의 `by_artist`(`archive.ts:65,82`) — 파일 로드 순서와 무관한 Map 집계 | `derive-archive.test.ts:59` "4축 역인덱스" | ✅ |
| US-15 공유 카드 | AC2 점수 없음 | SS-15, E-115 | `og/types.ts` 3개 Input 타입 전부 score 필드 없음 | `og.test.ts:12` "assembleReviewCard" | ✅ |
| US-15 | AC3 커버 없음 = 기본형 폴백 | ADR-0010 | `template.ts:56-65` `reviewCard()` 폴백 분기 | `og.test.ts:47` "cardTree" | ✅ |

## 3. 서비스 시퀀스 (SS-1~15) → 코드 진입점

| SS | 시퀀스 | 진입점 코드 | 비고 |
|---|---|---|---|
| SS-1 검증 | A·B-1 | `checker/load.ts`(형태) + `checker/resolve.ts`(교차 참조) | |
| SS-2 MB 조회 | A | `scripts/album-add.ts` + `lib/mb/client.ts` | |
| SS-3 정렬·수정 전파 | B-2·D | `lists.ts:88-93` `compareR1` | |
| SS-4 보드 | B-3 | `lists.ts:119-135` `deriveBoard` | |
| SS-5 진행형 10선 | B-4 | `lists.ts:139-148` `deriveTop10` | |
| SS-6 연말 확정 | C | `scripts/finalize.ts` | |
| SS-7 월말정산 | B-5 | `lists.ts:154-164` `deriveMonthlyRecaps` | |
| SS-8 무결성 | B-8 | `resolve.ts`(E-110·113) + `postbuild.ts`(E-111·112) | |
| SS-9 이야기→평론 | B-6 | `links.ts:109-132` `deriveAlbumBoxRows` | |
| SS-10 역링크 폴백 | B-6 | `links.ts:60-87` `deriveBacklinks` | |
| SS-11 아카이브 4축 | B-7 | `archive.ts:44-89` `deriveArchiveIndex` | |
| SS-12 아티스트 | B-7 | `archive.ts`의 `by_artist` 축 + 아티스트 스키마 | |
| SS-13 듣기 링크 | A(엣지) | `listen-links.ts` | |
| SS-14 커버 | A(엣지) | `mb/client.ts:92-110`(CAA) + `covers.ts` | |
| SS-15 OG | B-9 | `lib/og/**` | |

## 4. 오류 코드 (E-*) → 코드 위치 → 테스트

전수(`exceptions.md` 2부) 중 코드에 실제 구현된 것만. E-4xx(편집 도구)는 `scripts/album-add.ts` 내 인라인 처리(별도 함수 분리 없음)라 파일:행 대신 스크립트 전체를 가리킨다.

| 코드 | 등급 | 코드 위치 | 테스트 |
|---|---|---|---|
| E-100 | 실패 | `checker/load.ts:73-88` (Zod 매핑) | `checker.test.ts:28` |
| E-101 | 실패 | `resolve.ts:46-53`(리뷰)·`131-138`(이야기) — **아티스트 제외**(🔗 gaps#1) | `resolve.ts` 주석 + `checker.test.ts` 무효 스위트 |
| E-102 | 실패 | `resolve.ts:61-68` | `checker.test.ts:28` |
| E-103 | 실패 | `resolve.ts:71-80` | `checker.test.ts:28` |
| E-104 | 실패 | `resolve.ts:86-101` (R-8 구반 합집합 포함) | `checker-integrity.test.ts:66` |
| E-105 | 실패 | `schema/review.ts:19-40` (Zod) | `review-schema.test.ts:43` |
| E-106 | 실패 | `schema/review.ts:50-53` (`z.literal(true)`) | `review-schema.test.ts:87` |
| E-107 | 실패 | `schema/common.ts:18-25` + `checker/load.ts:132-138`(파일명) | `review-schema.test.ts:87` |
| E-108 | 실패 | `resolve.ts:54-59` | `checker.test.ts:28` |
| E-109 | 실패 | `schema/config.ts:12-15` (Zod `.refine`) | `checker.test.ts:77` "설정 오류 저장소 — E-109 예약어" |
| E-110 | 실패 | `resolve.ts:158-178` | `checker-integrity.test.ts:57` |
| E-111 | 실패 | `postbuild.ts:35-49` | `checker-integrity.test.ts:30` |
| E-112 | 실패 | `postbuild.ts:53-76` | `checker-integrity.test.ts:42` |
| E-113 | 실패 | `archive.ts:101-113` | `derive-archive.test.ts:95` |
| E-114 | 실패 | `resolve.ts:180-193` | 개별 describe 미확인(파일 스캔으로 존재만 확인, `checker.test.ts` 무효 스위트 내 포함 추정) — ⚠ |
| E-115 | 실패 | 구조적(타입 레벨) — `og/types.ts` | `og.test.ts:12,47` |
| E-201 | 경고 | `resolve.ts:203-216` | `checker.test.ts:28`(무효 스위트 경고 포함 여부는 describe명만으로 미확정) — ⚠ |
| E-202 | 경고 | `resolve.ts:109-115` | 없음(직접 커버 미확인) — ⚠ |
| E-203 | 경고 | `resolve.ts:139-144` | 없음(직접 커버 미확인) — ⚠ |
| E-204 | 경고 | `resolve.ts:146-154` | 없음(직접 커버 미확인) — ⚠ |
| E-205 | 경고 | `resolve.ts:117-127` | `derive.test.ts:13`(listen-links 스위트 내 간접) |
| E-301 | 알림 | `lists.ts:270-295` | `derive-lists.test.ts:223` |
| E-302 | 알림 | `lists.ts:299-312` | `derive-lists.test.ts:243` "E-302·E-303" |
| E-303 | 알림 | `lists.ts:319-345` | `derive-lists.test.ts:243` |
| E-401~405 | 편집 도구 | `scripts/album-add.ts`·`finalize.ts` 인라인 | `mb.test.ts:31`(MbClient 목 응답), `finalize.test.ts:39`(E-405 케이스는 시퀀스 C 스위트 내로 추정 — 개별 assert 미열람) |

**"⚠" 표기 항목에 대한 정직한 고지:** describe 블록 이름만으로 파악한 것과, 개별 `it(...)` 단언문까지 직접 읽어 확인한 것을 구분했다. 이 매트릭스는 전자(구조적 스캔) 기준이며, 개별 코드가 없다는 뜻이 아니라 **이 문서 작성 과정에서 라인 단위로 검증하지 못했다**는 뜻이다. 완전한 라인 단위 검증은 QA(Matthias)의 몫으로 남긴다.

## 5. NFR·비기능 요구 → 코드/실측

| 항목 | 설계 예산 | 실측/코드 근거 |
|---|---|---|
| 결정성(동일 입력→동일 산출) | R-1~R-10 전수 | CI 2회 빌드 해시 비교(`ci.yml:67-78`) — Timothy는 재실행하지 않았으나 impl-notes 로컬 실측 기록(W5.0: 동일 해시 2회) 확인 |
| 페이지 무게 < 500KB | `architecture-overview.md` §4 | **초과 — 리드 수용 결정**(`w5-5-launch-gate.md` §1, 🔗 gaps 참고4) |
| 클라이언트 JS = 0(기본값) | ADR-0002 | GoatCounter 옵트인 시 1개(🔗 gaps 참고2) |
| 빌드 시간 < 60초(콘텐츠 300건 기준) | ADR-0002 | 픽스처 1세트 기준 실측 31.14s(`build` 로그) — 300건 규모 실측은 아직 없음(콘텐츠가 그 규모에 못 미침, 미확인 상태 유지) |
| 타입 오류 0 | impl-notes 반복 언급 | **현재 위반 — 🔗 gaps#3** |
