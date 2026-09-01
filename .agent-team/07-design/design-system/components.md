# undernote 디자인 시스템 — 컴포넌트 계약

| | |
|---|---|
| 작성 | Jonnathan · 2026-09-01 (W2 2단계) |
| 규칙 | 전 컴포넌트 토큰만 참조 · JS 0 · 상태 전수 명시 · a11y 계약 포함 |
| 참조 | 시각 실물: `../lineage-concepts.html` (AlbumBox·LineageBlock·CoverImage·프레임) |

폼·모달·토스트는 이 제품에 존재하지 않는다 (계정·댓글·관리 UI 없음 —
charter §5, D7). 계약 대상은 아래 12종이 전부다.

---

## 1. Masthead (전역 헤더)
- **구성:** 워드마크(홈 링크) + 내비 5항목 `평론 · 이야기 · 올해의앨범 · 아카이브 · 소개`
- **토큰:** 높이 64px(모바일 56px) · 하단 `--line` 헤어라인 · sans 15/600
- **상태:** default / 현재 지면 항목: `--ink` 700 + 하단 2px `--ink` 보더
  (색 비의존) / hover: `--seal` 120ms / focus-visible: 공통 아웃라인
- **a11y:** `<header><nav aria-label="주 메뉴">` · 링크 타깃 높이 44px
- **스크롤 고정 없음** — 긴 글에서 화면을 점유하지 않는다 (읽기 우선)

## 2. Footer
- 구성: 소개/기준 · 아카이브 링크 + 원 SNS 아웃링크(인스타/유튜브) + ©
- 상태: 단일. a11y: `<footer>` · 아웃링크 `rel="noopener"`

## 3. FormatLabel (형식 오버라인)
- **변이:** `평론` / `음악 이야기` / `아티스트` / 지면 오버라인(`2026 올해의 앨범` 등)
- 토큰: sans 13/700 · letter-spacing .14em · `--seal`
- a11y: 장식 아님 — 실제 텍스트로 렌더 (스크린리더가 형식을 먼저 읽는 것이 의도)

## 4. BoardRow (보드 행) — 홈·연간 보드 공용
- **구성:** `<li>` 전체가 `<a>` → 평론. 내부: 순위(tabular 15/700, 폭 20px) ·
  CoverImage 48px · 앨범명(sans 16/700)+아티스트(14 `--muted`) · 점수(tabular 15/600, 우측)
- **변이:** default / **first** (1위): 순위 `--seal` + 좌측 2px `--seal` 보더
- **상태:** default / hover: 배경 `--wash` 120ms / focus-visible / 커버 없음:
  CoverImage 자리표시 변이
- 높이 ≥56px (타깃 충족). 점수 소수 1자리 고정 문자열 (SS-3).
- **a11y:** `<ol>` 안의 `<li>` — 순위는 마크업 순서와 일치. 링크 접근명 =
  "앨범명, 아티스트" (점수는 시각 보조 — `aria-hidden` 아님, 뒤에 읽혀도 무방)

## 5. BoardPanel (버킷 보드)
- 구성: 버킷 라벨(sans 15/700) + BoardRow×0~5 + 빈 상태
- **상태:** 5행 만석 / 1~4행 (있는 만큼 — 자리 채움 금지) / **0행**: 라벨 +
  `아직 이 장르의 후보가 없습니다.` (15 `--muted`) / 확정 후: 연간 지면에서
  선정 1위에 `--seal` 강조 (ui-spec §4.2)
- 그리드: 부모가 `grid + gap 24px` 배치 (반응형 ui-spec §12)

## 6. ListRankRow (리스트 지면 행) — 10선·월말정산
- BoardRow 확장: 커버 64px(확정 1위 160px) · 앨범명 serif 700 · 점수 표시
- 변이: default / champion(확정 1위) / 상태는 BoardRow와 동일
- 불변식: 나열 순서 = 점수 내림차순 (빌드 보장 SS-8 — 디자인은 재정렬 UI를
  제공하지 않는다)

## 7. ArticleCard (탐색·최신 글 행)
- 구성: FormatLabel(13px, 텍스트만) · 제목(17/700) · 부제(아티스트 또는
  요지 1줄, 15 `--muted`) · 날짜(13 tabular)
- **점수 프로퍼티 없음** — 데이터 계약상 필드 자체가 안 들어온다 (D2).
- 상태: default / hover(제목 `--seal` 밑줄) / focus-visible
- a11y: 제목이 링크 접근명. 날짜는 `<time datetime>`

## 8. CoverImage (커버)
- **변이:** 48(보드) / 64(리스트) / 160(확정 1위) / 320(평론 히어로) —
  James 파생 4종(96/320/640 @2x)과 매핑
- **상태:** loaded(WebP+폴백, `--r-4`, lazy) / **placeholder**: `--ink` 바탕 +
  앨범명 첫 글자(serif, `--paper`) — SS-14 / loading 중: 배경 `--wash`
- a11y: `alt="{앨범명} 커버"` · placeholder는 `role="img"` + 동일 alt

## 9. ScoreVerdict (평결 블록) — 평론 전용
- 구성(순서 고정): seal 2px×48px 룰 → 오버라인 `평결` → 점수(serif 42/700
  + `/10` 15 `--muted`) → NominateBadge(조건부) → 듣기 링크 행(조건부)
- **상태:** 기본 / 배지 없음(행 미출력) / 듣기 링크 0(행 미출력) —
  빈 껍데기 금지 (US-3 AC3 원칙 준용)
- 위치 불변식: **본문 종료 후에만** (D2 — 이 컴포넌트를 본문 앞에 놓는
  구현은 반려)
- a11y: `<section aria-label="평결">` · 점수는 텍스트 "8.3/10"으로 읽힘

## 10. NominateBadge (노미네이트 배지)
- 구성: `● 지금 {버킷} 노미네이트 {n}위` → `/list/{year}/` 링크. 데이터:
  James 계약(버킷 라벨·순위 1~5·연도)만 사용.
- 토큰: sans 14/600 · `--seal` 텍스트+도트 · `--r-2` · `--wash` 배경
- 상태: 노미네이트 중 / 아님(미출력 — SS-4 파생). 색 비의존: 텍스트가 전부 말함
- 위치: ScoreVerdict 내부 전용 (ui-spec §2.3 근거 — 히어로 배치 금지)

## 11. LadderBlock (이해의 사다리) — 평론 전용
- 구성: `--wash` 카드(`--r-4`) · 리드 카피(sans 15 `--muted`) · 이야기 제목
  (sans 17/700) + 발췌 1줄 · `--seal` 화살표
- **변이:** direct(직접 참조, 발행 역순 전부) / fallback(같은 버킷, 1~2편,
  리드 카피 교체 — ui-spec §2.6) / **none: 컴포넌트 미출력** (US-3 AC1~3)
- 시각 문법: 산세리프 — 이야기의 목소리로 초대 (톤 다리, charter §4)

## 12. AlbumBox (이 글에 나온 앨범) — 이야기 전용 · 계보 안 A
- 구성: 상단 2px `--ink` 룰 · 제목 `이 글에 나온 앨범` · 행: CoverImage 44 ·
  앨범명(16/700)/아티스트·연도(14 `--muted`) · 우측 액션
- **행 상태:** reviewed → `평론 읽기 →` (`--seal` 600) / not-reviewed →
  `평론 준비 중` (13 `--muted`, **링크 아님** — US-4 AC2) / 참조 0 → 박스 미출력
- a11y: `<ul>` · 행 높이 ≥44px · 링크 접근명 "{앨범명} 평론 읽기"

## 12b. LineageBlock (계보 블록) — **예비 계약 (원이 안 B 선택 시 활성)**
- 구성: `--wash` 컨테이너 · 티어1 `시작한 앨범`(seal 라벨) — lead 카드
  (좌측 3px `--seal` 보더, 커버 64, serif 제목, 1줄 설명) · 연결선+`이어받은
  앨범들` · 티어2 follow 카드 그리드(2열→1열) · `시도하는 아티스트` 한 줄
- 데이터: 참조 목록의 `role?: 선도|추종` (James 확정 옵션 필드)
- **상태:** role 태그 ≥1(선도 1개 이상 필수) → 렌더 / 태그 없음 → **미출력,
  AlbumBox만** (자동 폴백 — 원에게 태깅을 강제하지 않음, D7)
- 시각 실물: `../lineage-concepts.html` 안 B 섹션

---

## 공통 계약

- **focus-visible:** `outline: 2px solid var(--seal); outline-offset: 2px` 전 인터랙티브 요소
- **hover:** 색 전환 120ms ease-out만. transform 금지
- **빈 껍데기 금지:** 조건부 컴포넌트는 "빈 채로 표시"가 아니라 **미출력**이
  기본 (본 문서에 명시된 빈 상태 카피가 있는 경우만 예외 — BoardPanel 0행)
- **날조 금지:** 자리 채움·가짜 항목·"곧 공개" 예고 UI 없음
