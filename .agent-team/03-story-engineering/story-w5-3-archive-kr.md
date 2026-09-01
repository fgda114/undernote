---
status: ready-for-dev
story_key: w5-3-archive
epic: E3 — 탐색 (CF-7 아카이브 · CF-6 아티스트)
owner: Andrew (W5 단독 구현)
source_hash: e6503e3ee0304562b8a41a4fdfe0a606053766108f45fc48e28e1c3bb7709b67
depends_on: w5-2-list-engine
compiled_by: Matthew (#17) · 2026-09-02
---

# 스토리 W5.3: 탐색 — 아카이브 4축 + 아티스트 페이지

Status: ready-for-dev

## 스토리(Story) — story_requirements

As a **독자**,
I want **연도·장르(버킷)·세부 태그·아티스트 4축으로 지난 글 전체를 탐색하고, 아티스트 페이지에서 그 사람을 다룬 글을 한눈에 보기**,
so that **관심 축을 따라 글로 앨범을 고를 수 있다 (점수가 아니라).**

[Source: 03-service-planning/user-stories.md#US-6] [Source: 03-service-planning/user-stories.md#US-9]

## 인수 기준(Acceptance Criteria)

1. Given 아카이브 / When 연도·장르(버킷)·아티스트 중 한 축 선택 / Then 해당 축 전체 글 나열 (평론·이야기·아티스트 소개 포함). 태그 있는 글은 태그 축으로도 도달. [Source: 03-service-planning/user-stories.md#US-6]
2. Given 아카이브 목록 / Then **점수 비표시** — ArchiveItem에 score 필드 자체가 없다 (템플릿이 아니라 데이터 계약으로 강제). [Source: 04-architecture/api-contracts.md#4-빌드-도출-데이터-구조] (§4.4)
3. Given 새 평론 발행 / Then 해당 연도(발행 기준)·버킷·아티스트 인덱스 자동 편입 (+태그 있으면 태그 인덱스). [Source: 03-service-planning/service-stories.md#SS-11]
4. Given 발행된 모든 글 / Then 최소 한 축에서 도달 가능 — **글 하나를 의도적으로 고아로 만들어 E-113 빌드 실패를 실증하는 테스트 포함** (W5.3 DoD). [Source: 04-architecture/build-plan.md#W5.3]
5. Given 글에서 다뤄진 아티스트명 클릭 / Then 아티스트 페이지: 소개글(있으면) + 그 아티스트를 다룬 전체 글(평론·참조된 이야기). 복수 아티스트 앨범은 전원에 집계. [Source: 03-service-planning/user-stories.md#US-9] [Source: 03-service-planning/service-stories.md#SS-12]
6. Given 소개글 없는 아티스트의 평론 2편 / Then 집계만으로 페이지 성립, 빈 소개 영역 미표시. 소개글·집계는 순서 독립 (US-14 AC2). [Source: 03-service-planning/user-stories.md#US-14]
7. Given 태그 0개인 초기 상태 / Then 태그 탭 미표시. 글 0편인 연도 등 빈 축 값은 목록에 없음. [Source: 07-design/ui-spec.md#6-아카이브]
8. Given 전역 내비 "평론"·"이야기" / Then 아카이브의 유형 축 프리셋으로 연결 (별도 지면 아님 — 화면 8종 유지). [Source: 07-design/ux-flow-map.md#1-정보구조]

## 작업/하위작업(Tasks / Subtasks)

- [ ] 작업 1 — `src/lib/derive/` 인덱스 (AC: #1~3)
  - [ ] ArchiveIndex 4축 역인덱스 (by_year 발행 기준·by_bucket etc는 "그 외" 그룹·by_tag·by_artist) — ArchiveItem {type,url,title,date}만 (score 없음)
  - [ ] 아티스트 집계 Map<artistSlug,(review|story)[]> — 복수 아티스트 전원
- [ ] 작업 2 — checker 확장 (AC: #4)
  - [ ] E-113 고아 검사를 4축 인덱스 완성본 기준으로 확정 (W5.2의 준비분 대체)
- [ ] 작업 3 — 지면 (AC: #5~8)
  - [ ] `/archive/…` 4축 탭 + 유형 필터 프리셋. 버킷 = 굵은 라벨, 태그 = muted 소문자 칩(`--r-2`) 시각 구분
  - [ ] ArticleCard (형식 라벨·제목·부제·`<time>` — 점수 프로퍼티 없음)
  - [ ] `/artists/[slug].astro` — 이름(세리프 27px)·소개글(산세리프)·집계 섹션 `{이름}을 다룬 글`
  - [ ] Masthead "평론/이야기" 프리셋 연결

---

## Developer Context (개발자 컨텍스트) — developer_context

### 이 스토리에서 무엇을 구현하는가
빌드 타임 사전 계산 인덱스로 3+1축 탐색을 만든다. 규모상 사치가 아니라 정적 생성의 공짜 속성이다 (30편 → ~120항목, 성능 무시 수준) [Source: 03-service-planning/core-features.md#CF-7]. 핵심 계약은 두 가지: **탐색 지면에 점수가 흐르지 않게 하는 것**(D2 — 필드 미전달로 구조 강제)과 **고아 콘텐츠 0**(E-113이 이 축들의 완전성을 빌드 실패 조건으로 만든다).

### 중요한 제약·전제
- 아카이브 연도 축은 **발행 연도** 기준이다 — 리스트의 발매 연도 기준과 의도적으로 다르다. "통일"하지 말 것 [Source: 04-architecture/exceptions.md#R-3].
- 아티스트 표시명의 유일한 정의처는 `content/artists/<slug>.md`의 `name` — 앨범에 이름을 중복 저장하지 않는다 (표기 드리프트 방지) [Source: 04-architecture/data-model-erd.md#2-모델링-결정-근거].
- 아티스트 페이지는 아티스트가 처음 참조될 때 생성 — 소개글 없어도 성립 (빈 본문 허용이 스키마 사양) [Source: 04-architecture/api-contracts.md#3.4].
- 인덱스는 전 글 유형 포함 (평론·이야기·소개). 이야기는 W5.4 전이므로 이 시점 픽스처는 평론·소개 중심 + 이야기 픽스처 1개를 미리 넣어 유형 처리를 검증할 것 (이야기 스키마는 W5.1에서 이미 확정됨).
- 태그 축은 canonical slug 기준 (등록부 정규화 — E-201은 W5.1 기구현) [Source: 04-architecture/adr/ADR-0007-genre-two-tier.md].

### 해서는 안 되는 것
- ArchiveItem·ArticleCard에 score 필드 추가 ("나중에 쓸지 모르니" 금지 — 계약 위반) [Source: 07-design/design-system/components.md#7-articlecard].
- 클라이언트 검색·필터 JS (30편 규모 + 정적 탐색으로 충분 — Non-goals) [Source: 03-service-planning/core-features.md#3-non-goals].
- 빈 축·빈 연도의 자리 표시 렌더 (R-4) [Source: 04-architecture/exceptions.md#R-4].
- 아티스트 페이지의 소개글 유무에 따른 집계 로직 분기 (순서 독립이 계약 — US-14 AC2).

---

## Architecture Compliance (아키텍처 준수) — architecture_compliance

- ArchiveIndex·ArchiveItem 구조 그대로 (§4.4 — score 필드 부재가 계약) [Source: 04-architecture/api-contracts.md#4-빌드-도출-데이터-구조]
- 접근 패턴 P6(아티스트 집계)·P7(4축 역인덱스) — O(n)+Map, 증분 없음 [Source: 04-architecture/data-model-erd.md#3-접근-패턴]
- 라우트: `/archive/…` · `/artists/{slug}/` (slug 불변 R-9) [Source: 04-architecture/code-structure.md#2-url-설계]
- 탐색 지면 D2 비표시 [Source: 03-service-planning/core-features.md#D2]

## Library / Framework Requirements — library_framework_requirements

| 라이브러리/프레임워크 | 버전 | 비고 |
|----------------------|------|------|
| (신규 의존 없음) | — | 순수 TS 역인덱스 + Astro 페이지. 검색 라이브러리(pagefind 등) 추가 금지 — Non-goals [Source: 03-service-planning/core-features.md#3-non-goals] |

## File Structure Requirements — file_structure_requirements

```
신규:
  src/lib/derive/archive.ts        # 4축 역인덱스 + 아티스트 집계 (또는 links.ts에 병합 — W5.1 파일 구성 관례 따름)
  src/pages/archive/…              # 4축 라우팅 (구체 하위 경로 설계는 Andrew 재량 — /archive/{year|genre|tag|artist}/… 패턴 준수)
  src/pages/artists/[slug].astro
  src/components/ArticleCard.astro
  tests/fixtures/orphan/           # 의도적 고아 글 (E-113 실증)
  tests/unit/{derive-archive,artist-agg}.test.ts
수정:
  src/lib/checker/                 # E-113 확정판
  src/components/Masthead.astro    # 프리셋 연결
```
[Source: 04-architecture/code-structure.md#1-저장소-트리] [Source: 07-design/ux-flow-map.md#1-정보구조]

## Testing Requirements — testing_requirements

- **단위 테스트**: 4축 인덱스 (발행 연도 귀속·etc 그룹·태그 canonical·복수 아티스트 전원 집계·빈 축 미생성) / ArchiveItem에 score 부재 검사
- **통합 테스트**: 고아 픽스처 → E-113 빌드 실패 실증 (DoD 명시 항목) / 새 평론 픽스처 추가 → 재빌드 → 전 축 편입 확인 (US-6 AC 시나리오)
- **E2E**: 없음 (W5.5 수동 인수)
[Source: 04-architecture/build-plan.md#W5.3] [Source: 04-architecture/build-plan.md#3-테스트-전략]

## Dev Notes (개발 노트)

- DoD: SS-11·12 + US-6·9·14 AC + 고아 검사 실동작 [Source: 04-architecture/build-plan.md#W5.3]
- 규모 S — 이 스토리에서 어려운 건 코드가 아니라 **계약 위반 유혹**(점수 노출·검색 추가)을 참는 것이다.

### 이전 스토리 인텔리전스 (previous_story_intelligence)
- **착수 전 `story-w5-2-list-engine-kr.md`의 Dev Agent Record를 읽을 것.** 특히: ① derive 모듈 파일 구성 (archive를 별파일로 뺄지 links에 넣을지 — W5.2 관례 따름) ② checker의 E-113 준비분 위치와 인터페이스 ③ ListEntry/ArchiveItem이 공유하는 타입 정의 위치 ④ 픽스처 세트 구조 (기존 픽스처 재사용 — 재발명 금지).

### Git Intelligence (git_intelligence)
- 착수 시 최근 5커밋에서 W5.2의 derive·checker 실배치 확인. W5.2 골든 테스트 전체가 통과하는 상태에서 시작 (회귀 기준선).

### Latest Tech Information (latest_tech_information)
- 신규 외부 의존 없음 — 추가 리서치 불요.

### Project Context Reference (project_context_reference)
- [Source: 03-story-engineering/project-context-kr.md#3-점수] (표시 매트릭스 — 탐색 비표시)
- [Source: 03-story-engineering/project-context-kr.md#7-빈-상태] · [#11-안티패턴]

---

## Dev Agent Record (구현 기록)

### 사용 모델(Agent Model Used)
_(구현 시 기입)_

### 디버그 로그 참조
_(구현 시 기입)_

### 완료 노트 목록(Completion Notes List)
- _(구현 시 기입)_

### 파일 목록(File List)
<!-- ⚠️ 다음 스토리(W5.4)의 이전 스토리 인텔리전스 입력 — 반드시 채울 것 (D4) -->

| 파일 경로 | 상태 (신규/수정/삭제) |
|-----------|----------------------|
| _(구현 시 기입)_ | |
