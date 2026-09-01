---
status: ready-for-dev
story_key: w5-1-review-pipeline
epic: E1 — 평론 + 발행 파이프라인 (CF-1 · CF-9 · CF-10 · CF-11)
owner: Andrew (W5 단독 구현)
source_hash: e6503e3ee0304562b8a41a4fdfe0a606053766108f45fc48e28e1c3bb7709b67
depends_on: w5-0-setup
compiled_by: Matthew (#17) · 2026-09-02
---

# 스토리 W5.1: 평론 + 발행 파이프라인 — "모든 것의 원자재" (최대 단계 L)

Status: ready-for-dev

## 스토리(Story) — story_requirements

As a **필자 원**,
I want **글 + 4필드 + 체크 1문항만 전달하면 평론 페이지·커버·듣기 링크·공유 카드가 완성되는 발행 파이프라인**,
so that **글쓰기 외의 노동이 0인 채로 첫 평론부터 유통 가능하다.**

[Source: 03-service-planning/user-stories.md#US-10] [Source: 03-service-planning/core-features.md#4-에픽과-릴리스-순서] (E1 = "모든 것의 원자재. 공유 카드는 첫 평론부터 유통 가능해야")

## 인수 기준(Acceptance Criteria)

**발행 검증 (SS-1·SS-3):**
1. Given 점수 없는 평론 / When 빌드 / Then 빌드 실패 + "점수 누락" 한국어 메시지. [Source: 03-service-planning/service-stories.md#SS-1]
2. Given `score: "8.30"` 또는 범위 밖 / Then E-105 실패 ("8.3 또는 8.4로 수정하세요" 형식). [Source: 04-architecture/exceptions.md#2부-오류-코드-전수]
3. Given `editorial_check`가 true 아님·부재 / Then E-106 실패 (USP-C 관문). [Source: 04-architecture/api-contracts.md#3.2]
4. Given 전 필수 필드 충족 + 세부 태그 없음 / Then 발행 완료 (태그는 옵션 — US-10 AC5). Given 미등록 태그 표기 / Then E-201 경고(alias인지 신규인지 구분한 등록 제안문) + 발행 진행. [Source: 03-service-planning/service-stories.md#SS-1]
5. Given 버킷이 발매 연도 설정에 없음(etc 제외) / Then E-104 실패. `bucket: etc`는 명시 입력 (침묵 기본값 금지). [Source: 04-architecture/service-sequences.md#시퀀스-A]
6. Given 검증 실패 다수 / Then 전부 모아 한 번에 보고 (첫 실패 중단 금지). [Source: 04-architecture/service-sequences.md#B-1]

**앨범 메타 해석 (SS-2):**
7. Given MB 적중 / Then 원 입력 없이 메타 완성. Given MB 실패 + 수기 없음 / Then 빌드 실패 + 누락 필드 명시 (발매 연도 없는 앨범 = 리스트 귀속 불능 E-102). [Source: 03-service-planning/service-stories.md#SS-2]
8. Given MB 미등재 신보(B6 지연) / Then 수기 선입력 후 `mbid` 추후 연결 가능. [Source: 03-service-planning/service-stories.md#SS-2]

**평론 지면 (CF-1 · D2):**
9. Given 평론 페이지 / Then 히어로에 앨범·아티스트·버킷 라벨·발매일만 — **점수·배지 없음**. 점수는 본문 종료 후 평결 블록에 저장 문자열 그대로. [Source: 07-design/ui-spec.md#2-평론] [Source: 03-service-planning/core-features.md#D2]
10. Given 수기 듣기 링크 존재 / Then 자동 검색형보다 우선. Given 둘 다 없음 / Then E-205 경고 + 링크 영역 미표시로 발행. [Source: 03-service-planning/service-stories.md#SS-13]
11. Given 커버 미확보 앨범 / Then 발행 성공 + E-202 경고 + 플레이스홀더(`--ink` 바탕 + 앨범명 첫 글자). [Source: 03-service-planning/service-stories.md#SS-14] [Source: 07-design/ui-spec.md#2.4]

**공유 카드 (SS-15 · US-15):**
12. Given 임의 공개 페이지 / Then OG 3요소(title·description·image) + `og:type`·`og:url`·`twitter:card` 존재, 유형별 템플릿 일치. [Source: 04-architecture/api-contracts.md#5-og-메타-계약]
13. Given 평론 카드 / Then 커버·앨범·아티스트·매체명 있고 **점수 문자열 없음** (전 유형 — E-115의 행동 규정. 자동 게이트는 W5.2 checker). Given 커버 없음 또는 `og_use_cover: false` / Then 텍스트 기본형 카드 폴백. [Source: 03-service-planning/user-stories.md#US-15] [Source: 04-architecture/adr/ADR-0010-og-card-generation.md]

**전체 (US-10):**
14. Given 원이 글+4항목 전달 / When User가 `album-add` + 평론 파일 작성 + push / Then 원 추가 개입 없이 픽스처 평론 1편이 파이프라인 전체를 통과해 카드까지 완성 (W5.1 DoD). [Source: 04-architecture/build-plan.md#W5.1]

## 작업/하위작업(Tasks / Subtasks)

- [ ] 작업 1 — 콘텐츠 스키마 전체 (AC: #1~5)
  - [ ] `src/content.config.ts`: api-contracts §3의 8스키마 전부 Zod 번역 (Album·Review·Story·Artist·GenresConfig·TagRegistry·Snapshot·SiteConfig). `additionalProperties: false` 의미의 strict 스키마
  - [ ] score 정규식 `^(10\.0|[0-9]\.[0-9])$` — **문자열 타입** (number 금지)
  - [ ] `src/lib/score.ts`: 문자열↔십분위 정수 유일 파서
  - [ ] resolver: E-102(앨범 실존·발매 연도)·E-103(아티스트 실존)·E-104(버킷)·E-107(slug 형식)·E-108(파일명=album 필드)·E-109(etc 예약어)
  - [ ] E-201 태그 등록부 대조 (canonical/alias 정규화)
- [ ] 작업 2 — `album-add` CLI (AC: #7, #8)
  - [ ] `src/lib/mb/` MB·CAA 클라이언트 (fetch는 여기에만) + `scripts/album-add.ts`
  - [ ] MB release-group 검색→상세, **1100ms 간격**, 의미 있는 User-Agent (정확한 권장 형식은 MB 문서로 착수 시 재확인 — api-contracts 명시)
  - [ ] CAA front-500 다운로드 → **장변 640px 이하 재인코딩** → `public/covers/<slug>.jpg` + `cover_source` 기록. 원본 보관 금지
  - [ ] E-401~404 수기 폴백 대화 흐름 (1회 재시도, 재시도 루프 금지 — P9)
  - [ ] 앨범 YAML + 아티스트 md(신규 시) 스캐폴드 생성
- [ ] 작업 3 — 디자인 기반 (AC: #9)
  - [ ] tokens.md의 CSS 변수화 (라이트/다크 `prefers-color-scheme`) — 하드코딩 0
  - [ ] 폰트: Pretendard Variable + Noto Serif KR 400/700 **셀프호스팅 한글 서브셋 woff2** (합계 <1.5MB, CDN 금지)
  - [ ] Masthead(5항목, 스크롤 고정 없음)·Footer·본문 컬럼 660px 레이아웃
- [ ] 작업 4 — 평론 지면 (AC: #9, #10, #11)
  - [ ] 히어로(2컬럼/모바일 상단)·본문(세리프 17/1.8)·ScoreVerdict(순서 고정: 룰→오버라인→점수→배지 조건부→듣기 조건부)
  - [ ] CoverImage 컴포넌트 (WebP+폴백·지연 로드·96/320/640 파생·플레이스홀더 변이)
  - [ ] `src/lib/listen-links.ts`: 검색형 패턴({q} 치환) + 수기 우선. 패턴 실동작 확인, 깨진 서비스 제거
  - [ ] NominateBadge·LadderBlock·"아티스트의 다른 글"은 **조건부 미출력 상태로 자리만** — 데이터 공급은 W5.2·W5.4 (빈 껍데기 렌더 금지)
- [ ] 작업 5 — OG 메타 + 카드 (AC: #12, #13)
  - [ ] layouts에 OG 메타 주입 지점 (전 페이지 공통)
  - [ ] `src/lib/og/` 카드 데이터 조립 + satori+resvg 렌더. **구현 순서: 기본형 → 리스트형 → 평론형** (평론형 커버 합성은 ADR-0008 §5 잔여 검토와 무관하게 기본형 폴백 성립)
  - [ ] `og_use_cover` 킬스위치 동작
- [ ] 작업 6 — 픽스처 통과 (AC: #6, #14)
  - [ ] 유효 픽스처 1세트(앨범+평론+커버) end-to-end + 무효 픽스처 코드별

---

## Developer Context (개발자 컨텍스트) — developer_context

### 이 스토리에서 무엇을 구현하는가
**발행의 원자 단위**를 완성한다: 원의 5입력(글·앨범/아티스트·버킷·점수·체크)이 들어오면 검증(스키마+참조)→메타 완성(MB/수기)→지면(평론 페이지)→유통물(OG 카드)까지 사람 개입 없이 이어지는 파이프라인. 이 스토리가 끝나면 **평론 1편만으로 사이트가 유통 가능**해야 한다 (E1이 최소 공개 단위의 절반 [Source: 03-service-planning/core-features.md#4-에픽과-릴리스-순서]).

### 중요한 제약·전제
- **점수는 문자열이다.** `score: 8.3`(number)으로 스키마를 짜면 YAML 파서가 `8.30`을 접어 AC2가 검출 불능 — 이 프로젝트에서 가장 치명적인 단일 실수다. 연산은 `lib/score.ts` 십분위 정수만 [Source: 04-architecture/adr/ADR-0004-score-representation.md].
- **fetch는 `src/lib/mb/`에만, 호출자는 `scripts/`뿐.** derive·checker·pages에서 fetch가 보이면 아키텍처 위반 (배포 사이트 API 호출 0) [Source: 04-architecture/code-structure.md#3-레이어-경계].
- **원의 접점 상한(D7):** 이 파이프라인의 어떤 단계도 원에게 추가 입력을 요구하면 안 된다. 커버·발매일·링크는 시스템+User 폴백 [Source: 03-service-planning/core-features.md#D7].
- **부분 발행 없음:** 필수 누락 = 전체 실패. 반대로 옵션 부재(태그·커버·듣기 링크)는 발행을 막지 않는다 — 3등급(실패/경고/알림)이 계약이다 [Source: 04-architecture/design-patterns.md#P7].
- 오류 메시지는 한국어 + 경로 + 수정 방법. 원에게 전달될 문구는 사람 말 (`점수가 빠졌어요. 점수만 알려주시면 바로 나갑니다.` 형식) [Source: 07-design/ui-spec.md#10-마이크로카피-표].
- 커버는 축소 사본만 저장·서빙(장변 640px, 개당 ≤100KB WebP 파생), 출처 기록, alt 텍스트 — 법적 5원칙 [Source: 04-architecture/adr/ADR-0008-cover-art-policy.md].
- 톤 분리는 활자로: 평론 = 세리프 헤드/본문, 이야기 = 산세리프 (W5.4에서 소비되지만 토큰·레이아웃은 지금 확정) [Source: 07-design/ui-spec.md#0-트리트먼트-판정과-두-톤의-시각-문법].
- `--seal` 악센트는 5자리(평결·1위·배지·오버라인·본문 링크)에만 — 그 외 사용은 반려 [Source: 07-design/design-system/tokens.md#2-색].
- 접근성: WCAG 2.2 AA — 대비 계산치 준수·색 비의존·키보드 전 경로·타깃 44px·`prefers-reduced-motion` [Source: 07-design/design-system/tokens.md#6-접근성-기준선].

### 해서는 안 되는 것
- 평론 히어로에 점수·배지 배치 (D2 위반 — "논증 전에 판결을 누설하지 않는다") [Source: 07-design/ui-spec.md#2.1].
- score 재포맷(`8.3`→`8.30`·`8`), float 연산·비교 [Source: 07-design/design-system/components.md#공통-계약].
- 조건부 블록(배지·듣기·사다리)의 빈 껍데기 렌더 (R-4 — 미출력이 기본) [Source: 04-architecture/exceptions.md#R-4].
- 스트리밍 정확 매칭 API 연동 (검색형 링크가 사양 — 비용 대비 가치 없음) [Source: 04-architecture/api-contracts.md#6.3].
- MDX 본문·프론트매터 렌더 힌트 (P6 이식성 위반) [Source: 04-architecture/design-patterns.md#P6].
- 편집 CLI의 데몬화·자동 재시도 루프 (P9 — 사람이 앉아 있다) [Source: 04-architecture/design-patterns.md#P9].
- 클라이언트 JS 추가 (0이 계약 — hover/focus/anchor CSS만) [Source: 07-design/ui-spec.md#0-트리트먼트-판정과-두-톤의-시각-문법].

---

## Architecture Compliance (아키텍처 준수) — architecture_compliance

- 프론트매터 스키마 SSOT = api-contracts §3. **Zod는 그 번역이며 의미 변경은 문서부터** (P2 schema-first) [Source: 04-architecture/api-contracts.md#3-콘텐츠-프론트매터-스키마] [Source: 04-architecture/design-patterns.md#P2]
- 발행 시퀀스 A의 엣지 표 전수 구현 (점수 누락·버킷 미기입·태그·MB 지연·연도 불명·듣기 링크·커버) [Source: 04-architecture/service-sequences.md#시퀀스-A]
- MB 계약: 검색→상세 엔드포인트·1req/s·UA 헤더·실패 시 E-401~403 수기 폴백 [Source: 04-architecture/api-contracts.md#6.1]
- CAA 계약: front-500 (307 리다이렉트 추적, 실제 제공 크기 옵션은 구현 시 확인)·640px 축소·cover_source [Source: 04-architecture/api-contracts.md#6.2] [Source: 04-architecture/adr/ADR-0006-musicbrainz-caa.md]
- OG 메타 계약 표 (유형별 title/description/image + 점수 금지) [Source: 04-architecture/api-contracts.md#5-og-메타-계약]
- 페이지는 derive/콘텐츠 출력의 순수 소비자 — 판단 로직 침투 금지 (P1) [Source: 04-architecture/design-patterns.md#P1]
- 데이터 스키마는 **이 스토리에서 전부 확정** (참조 필드·버킷·태그 포함 — 소급 태깅 노동 방지) [Source: 03-service-planning/core-features.md#4-에픽과-릴리스-순서]

## Library / Framework Requirements — library_framework_requirements

| 라이브러리/프레임워크 | 버전 | 비고 |
|----------------------|------|------|
| Astro + Zod + sharp | W5.0에서 확정된 버전 (W5.0 완료 노트 참조) | Zod v4 계열이면 v3 문법(`.strict()` 등) 차이 주의 — 설치 버전 문서 기준 |
| satori | 최신 안정 — **착수 시 npm 실확인 (버전 미확인)** | HTML/CSS→SVG. 한글 폰트 파일 명시 로드 필요 (서브셋 woff2 재사용) |
| @resvg/resvg-js | 최신 안정 — **착수 시 npm 실확인 (버전 미확인)** | SVG→PNG. Windows 네이티브 바이너리 동작 확인 |
| MusicBrainz WS/2 | REST (버전 없음) | 1 req/s · UA 필수. 스키마 변동 리스크 낮음 |

2026-09-02 리서치: satori+resvg 조합은 Astro 빌드 타임 OG 생성의 통용 패턴으로 활발히 유지됨(복수 구현 사례 확인). 구체 버전·breaking은 **미확인 — 착수 시 확인** 후 W5.1 완료 노트에 기록할 것.

## File Structure Requirements — file_structure_requirements

```
수정: src/content.config.ts        # W5.0 골격 → 8스키마 전체
신규:
  src/lib/score.ts                 # 유일한 점수 파서
  src/lib/checker/                 # E-100~109 · E-201~205 (E-110~115는 W5.2)
  src/lib/mb/                      # MB·CAA 클라이언트 (fetch 유일 지점)
  src/lib/listen-links.ts
  src/lib/og/                      # 카드 데이터 조립 + satori 렌더
  scripts/album-add.ts
  src/layouts/Base.astro           # OG 메타 주입 지점
  src/pages/reviews/[slug].astro
  src/components/{Masthead,Footer,FormatLabel,CoverImage,ScoreVerdict,NominateBadge}.astro
  src/styles/tokens.css            # tokens.md 번역 (라이트/다크)
  public/fonts/                    # 서브셋 woff2 3파일
  tests/fixtures/valid/ · tests/unit/{schema,score,listen-links,og}.test.ts
```
[Source: 04-architecture/code-structure.md#1-저장소-트리] [Source: 04-architecture/architecture-overview.md#3-c4-l3-component]

## Testing Requirements — testing_requirements

- **단위 테스트**: `lib/score`(파싱·범위·"8.30" 거부) · 스키마 계약(**E-100~E-109 각 코드가 실제 그 코드로 실패하는 유효/무효 픽스처 쌍**) · listen-links(수기 우선·{q} 인코딩) · og 데이터 조립(점수 문자열 부재 검사) [Source: 04-architecture/build-plan.md#3-테스트-전략]
- **통합 테스트**: 픽스처 평론 1편의 파이프라인 전체 통과 → 페이지 HTML에 히어로 4필드·말미 점수·OG 메타 존재 확인 (AC14)
- **편집 도구**: album-add는 **MB 목(mock) 응답 픽스처**로 테스트 — 실 API는 수동 스모크만 (레이트리밋 존중) [Source: 04-architecture/build-plan.md#3-테스트-전략]
- **E2E**: 없음 (QA 수동 인수는 W5.5에서 US 전수)

## Dev Notes (개발 노트)

- DoD: SS-1·2·13·14·15 인수조건 전부 + US-10 AC1~5. 픽스처 평론 1편이 카드까지 완성 [Source: 04-architecture/build-plan.md#W5.1]
- ScoreVerdict를 본문 앞에 놓는 구현은 반려 (컴포넌트 계약 위치 불변식) [Source: 07-design/design-system/components.md#9-scoreverdict]
- 모션은 2종뿐(마이크로 120ms + 홈 보드 스태거 — 후자는 W5.2). transform·스크롤 리빌 금지 [Source: 07-design/design-system/tokens.md#5-모션]

### 이전 스토리 인텔리전스 (previous_story_intelligence)
- **착수 전 `story-w5-0-setup-kr.md`의 Dev Agent Record(완료 노트·파일 목록)를 읽을 것.** 특히: ① 확정된 Astro 메이저·Zod 버전 (스키마 문법이 갈린다) ② 테스트 러너 선택 ③ genres.yaml 초기 버킷 구성 ④ 호스팅 확정 내용. W5.0이 만든 `content.config.ts` 골격은 **교체가 아니라 확장** — 위반 픽스처 테스트가 계속 통과해야 한다 (회귀 방지).

### Git Intelligence (git_intelligence)
- W5.0 커밋들이 첫 제품 코드 이력이 된다 — 착수 시 `git log`로 W5.0의 실제 산출(계획 대비 변경)을 확인할 것. W2까지의 이력은 전부 문서.

### Latest Tech Information (latest_tech_information)
- Astro 6+ = Zod v4: 스키마 정의 문법이 v3과 다른 지점 존재(2차 출처) — `content.config.ts` 작성 전 설치 버전의 공식 문서 확인. satori·resvg-js 버전은 **미확인 — 착수 시 확인** (위 표). Pretendard·Noto Serif KR 서브셋 도구 선택은 Andrew 재량 (산출 예산 <1.5MB만 계약).

### Project Context Reference (project_context_reference)
- [Source: 03-story-engineering/project-context-kr.md#3-점수] — 점수 4규칙 전문
- [Source: 03-story-engineering/project-context-kr.md#5-레이어-경계] · [#8-원의-접점-상한]

---

## Dev Agent Record (구현 기록)

### 사용 모델(Agent Model Used)
_(구현 시 기입)_

### 디버그 로그 참조
_(구현 시 기입)_

### 완료 노트 목록(Completion Notes List)
- _(구현 시 기입 — satori/resvg 확정 버전·Zod 문법 이슈·MB UA 확정 형식 필수)_

### 파일 목록(File List)
<!-- ⚠️ 다음 스토리(W5.2)의 이전 스토리 인텔리전스 입력 — 반드시 채울 것 (D4) -->

| 파일 경로 | 상태 (신규/수정/삭제) |
|-----------|----------------------|
| _(구현 시 기입)_ | |
