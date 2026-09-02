---
status: done
story_key: w5-4-ladder
epic: E4 — 이해의 사다리 (CF-5 음악 이야기 + 자동 상호 링크)
owner: Andrew (W5 단독 구현)
source_hash: 2768bb719646d116b9c6080098e5c7f2562da472193b029b7ef5f893f2cda427
depends_on: w5-3-archive
compiled_by: Matthew (#17) · 2026-09-02
---

# 스토리 W5.4: 이해의 사다리 — 이야기 지면 + 양방향 자동 링크

Status: done

## 스토리(Story) — story_requirements

As a **점수에 동의하지 못한 독자**,
I want **평론에서 그 앨범의 맥락을 다루는 음악 이야기로, 이야기에서 개별 평론으로 자동 연결되기**,
so that **"왜 점수가 높지?"가 이탈이 아니라 이해의 입구가 된다.**

As a **필자 원**, I want **글에 이미 등장하는 앨범 이름 외의 링크 작업 0** (US-11).

[Source: 03-service-planning/user-stories.md#US-3] [Source: 03-service-planning/user-stories.md#US-4] [Source: 03-service-planning/user-stories.md#US-11]

## 인수 기준(Acceptance Criteria)

1. Given 참조 3개 중 평론 2개 존재 / Then 2개 링크 + 1개 플레인 텍스트 (유사 링크 스타일 금지). Given 그 1개의 평론이 이후 발행 / Then **다음 빌드에서 3개 링크** (소급 — 원의 옛 글 수정 불요). [Source: 03-service-planning/service-stories.md#SS-9] [Source: 03-service-planning/user-stories.md#US-11]
2. Given 앨범 X를 직접 참조하는 이야기 ≥1 / When X의 평론 열람 / Then "이 앨범이 등장하는 이야기" 목록(발행일 역순) + 클릭 이동. [Source: 03-service-planning/user-stories.md#US-3]
3. Given 직접 참조 0 + 태그 일치 1 + 버킷 일치 3 / Then **태그 일치 1편만** 표시 (폴백은 섞지 않는다 — 최초 비지 않는 단계만). [Source: 03-service-planning/service-stories.md#SS-10]
4. Given 폴백 대상 전부 0편 / Then 영역 자체 미표시 (빈 껍데기 금지). [Source: 03-service-planning/user-stories.md#US-3] (AC3)
5. Given 이야기의 `ref`가 불실존 slug / Then E-204 경고(오타 탐지), 실패 아님 — 의도적 미등록 참조는 `text` 항목이 규약. Given 참조 앨범 0개 / Then E-203 경고 + 발행 진행. [Source: 04-architecture/api-contracts.md#3.3]
6. Given 이야기 지면 / Then 산세리프 톤(17/1.75) + 말미 AlbumBox(안 A): `평론 읽기 →`(있을 때) / `평론 준비 중`(링크 아님). 참조 0 → 상자 미출력. [Source: 07-design/ui-spec.md#3-음악-이야기]
7. Given `role: lead|follow` 태그가 있는 글 + 원이 안 B를 선택한 경우 / Then LineageBlock 렌더 (lead ≥1 필수), 태그 없으면 자동으로 안 A만. **원 무응답 시 기본 = 안 A — LineageBlock은 예비 계약 상태로 두고 활성화하지 않는다.** [Source: 07-design/design-system/components.md#12b-lineageblock] [Source: 07-design/design-handoff.md#2-원-결정-대기-항목]
8. Given 사다리 리드 카피 / Then mode별로: **direct** = `이 점수가 낯설다면 — 이 앨범이 놓인 흐름 이야기` / **tag** = direct 카피 재사용 (`이 앨범이 놓인 흐름`은 세부 태그 일치에도 참 — **W3 결정** (Thomas N-8): ui-spec §2.6은 카피 2종만 정의해 mode=tag가 미정의였고, `{버킷}` 카피는 태그 매칭에 부정확하다. Jonnathan 이의 시 문자열 1곳 교체) / **bucket** = `이 장르가 낯설다면 — {버킷} 이야기`. **표시 상한: direct = 전부(발행 역순) / tag·bucket = 최대 2편** [Source: 07-design/design-system/components.md#11-ladderblock] [Source: 07-design/ui-spec.md#2.6]

## 작업/하위작업(Tasks / Subtasks)

- [x] 작업 1 — `src/lib/derive/links.ts` (AC: #1~5)
  - [x] 참조 해석: ref→평론 실존 여부 (P4 역인덱스 Map<albumSlug,story[]>)
  - [x] 역링크 폴백 사슬: ① 직접 참조(발행 역순) ② tags 교집합 ③ 버킷 일치(이야기의 참조 앨범 중 X.bucket과 같은 버킷 앨범 존재) ④ none — mode 필드로 반환 (Backlinks 계약 §4.5)
  - [x] E-203·204 경고 산출
- [x] 작업 2 — 이야기 지면 (AC: #6, #7)
  - [x] `/stories/[slug].astro` — 산세리프 헤드(29/800)/본문, 660px
  - [x] AlbumBox 컴포넌트 (2px 잉크 룰·행 44px·두 행 상태·0개 미출력)
  - [x] 본문 내 앨범 언급 링크 처리 — **W3 해석 명시:** ui-spec §3은 "본문 내 앨범 언급 링크"를 적었으나, 규범인 US-4 AC1은 "본문 **또는** 참조 목록에서 링크"다 [Source: 03-service-planning/user-stories.md#US-4]. 본문은 순수 Markdown이고(P6) 원은 링크 작업을 하지 않으므로(US-11), **AlbumBox 링크로 AC1을 충족**한다. 본문 자동 이름 매칭 링크는 만들지 않는다 (오매칭 리스크 + 사양 부재). 원 글에 링크가 이미 있으면 그대로 렌더
  - [x] LineageBlock 예비 구현 여부는 안 B 확정 시에만 (기본: 스킵 — AC7)
- [x] 작업 3 — 평론 페이지 결선 (AC: #2~4, #8)
  - [x] W5.1에서 자리만 잡은 LadderBlock에 Backlinks 데이터 연결 (변이: direct/fallback/none)
  - [x] "{아티스트}의 다른 글" 부속 결선 (W5.3 아티스트 집계 재사용)
- [x] 작업 4 — 소급 링크 테스트 (AC: #1)
  - [x] 픽스처: 이야기 발행 → 참조 앨범 평론 추가 → 재빌드 → 링크 생성 확인

---

## Developer Context (개발자 컨텍스트) — developer_context

### 이 스토리에서 무엇을 구현하는가
USP-B의 구현체 전부다 — 그리고 그것은 **자동 양방향 링크뿐**이다. 전용 지면·시각화는 1차 비범위(수요 미검증 — 베팅 규모를 비용 0으로) [Source: 03-service-planning/usp.md#2-usp-b]. 소급 링크는 전체 재계산 방식의 공짜 속성이다 — 상태 저장이나 마이그레이션을 만들면 오히려 틀린 것 [Source: 04-architecture/service-sequences.md#B-6].

### 중요한 제약·전제
- **폴백 사슬은 섞지 않는다.** 최초로 비지 않는 단계 하나만 표시 — ②태그와 ③버킷 결과를 합치면 계약 위반 [Source: 04-architecture/service-sequences.md#B-6].
- 이야기 참조 스키마는 2형: `{ref, role?}`(등록 앨범 — 링크 대상) / `{text, artist?, role?}`(미등록 — 플레인 렌더). oneOf 구분 그대로 [Source: 04-architecture/api-contracts.md#3.3].
- LadderBlock은 산세리프 — "이야기의 목소리로 초대"하는 톤 다리. 평론(세리프)과 이야기(산세리프)는 구분되되 단절되지 않는다 [Source: 07-design/ui-spec.md#0-트리트먼트-판정과-두-톤의-시각-문법].
- 계보 시각 층은 원 선택 대기 (A/B/C — 무응답 기본 A). **role 필드는 스키마에 이미 있고(W5.1) 소비만 조건부** — 데이터 층과 시각 층의 분리가 설계의 핵심이다 [Source: 07-design/lineage-concepts.md#1-세-안-요약].
- 원의 접점: 이야기 발행 = 글 + 참조 앨범 목록(글에 이미 등장하는 이름들) + 태그(옵션). 그 이상 요구 금지 [Source: 03-service-planning/core-features.md#D7].

### 해서는 안 되는 것
- `/lineage/…` 라우트 추가 (안 C는 1차 비범위 — 라우트 8종 밖) [Source: 07-design/design-handoff.md#7-concerns].
- 평론 없는 참조에 링크·빈 페이지 생성 (US-4 AC2 — 깨진 링크 금지).
- role 태그를 필수화하거나 원에게 태깅 강제 (미태깅 = 안 A 자동 폴백이 사양) [Source: 07-design/design-system/components.md#12b-lineageblock].
- 백링크 결과를 파일로 저장 (파생물 — 매 빌드 재계산) [Source: 04-architecture/data-model-erd.md#4-파생물].
- E-204(참조 오타)를 실패로 승격 — 경고가 사양 (이야기는 미등록 앨범도 다룬다).

---

## Architecture Compliance (아키텍처 준수) — architecture_compliance

- Backlinks 계약: `{mode: direct|tag|bucket|none, stories[]}` — 페이지는 mode를 보고 리드 카피만 고른다 (판단은 derive에) [Source: 04-architecture/api-contracts.md#4-빌드-도출-데이터-구조] (§4.5)
- 접근 패턴 P4(직접 참조 역인덱스)·P5(태그·버킷 폴백 Map) [Source: 04-architecture/data-model-erd.md#3-접근-패턴]
- P5 Fallback chain 패턴 — 단계적 저하, 빈 껍데기 금지 [Source: 04-architecture/design-patterns.md#P5]
- 라우트 `/stories/{slug}/` (slug 불변 R-9) [Source: 04-architecture/code-structure.md#2-url-설계]
- 이야기 OG = 기본형 카드 (제목+형식 라벨+워드마크) — W5.1 기구현 재사용 [Source: 07-design/ui-spec.md#11-og-공유-카드]

## Library / Framework Requirements — library_framework_requirements

| 라이브러리/프레임워크 | 버전 | 비고 |
|----------------------|------|------|
| (신규 의존 없음) | — | 역인덱스 Map + Astro 페이지. 그래프 라이브러리 등 추가 금지 (안 C 보류가 사양) |

## File Structure Requirements — file_structure_requirements

```
신규:
  src/lib/derive/links.ts          # 참조 해석 + 역링크 폴백 사슬 (W5.3 파일 구성 관례에 맞춰 병합 가능)
  src/pages/stories/[slug].astro
  src/components/{AlbumBox,LadderBlock}.astro   # LadderBlock은 W5.1 자리 → 실구현으로 교체
  tests/fixtures/{ladder-direct,ladder-tag,ladder-bucket,ladder-none,retro-link}/
  tests/unit/derive-links.test.ts
수정:
  src/pages/reviews/[slug].astro   # 자동 부속 결선 (등장하는 이야기 · 아티스트의 다른 글)
  src/lib/checker/                 # E-203·204 (W5.1에 없다면)
```
[Source: 04-architecture/code-structure.md#1-저장소-트리]

## Testing Requirements — testing_requirements

- **단위 테스트**: 폴백 사슬 4모드 각각 (특히 "직접 0 + 태그 1 + 버킷 3 → 태그 1편만") · 발행 역순 정렬 · ref/text 2형 렌더 데이터 · E-203/204
- **통합 테스트**: **소급 링크** — 이야기 픽스처 빌드 → 평론 추가 → 재빌드 → 이야기 쪽 링크 + 평론 쪽 백링크 동시 생성 확인 (W5.4 DoD 명시 항목) [Source: 04-architecture/build-plan.md#W5.4]
- **E2E**: 없음 (W5.5 수동 인수)

## Dev Notes (개발 노트)

- DoD: SS-9·10 + US-3·4·11 AC + 소급 링크 테스트 [Source: 04-architecture/build-plan.md#W5.4]
- 계보 시각화는 **이 단계에 없다** — 시안 → 원 선택 → 실측 후 별도 판단 [Source: 04-architecture/build-plan.md#W5.4]
- **W5.3이 유닛 한정으로 격리해 둔 이야기 픽스처를 이 스토리에서 통합 빌드에 편입**하고 (이제 `/stories/` 라우트가 실존 — E-112 충돌 소멸), 이야기가 4축 아카이브·고아 검사에 잡히는지 통합으로 확인 (Thomas C-2 부수의 마감).

### 이전 스토리 인텔리전스 (previous_story_intelligence)
- **착수 전 `story-w5-3-archive-kr.md`의 Dev Agent Record를 읽을 것.** 특히: ① derive 파일 구성 관례 (links를 어디 두는지) ② 아티스트 집계 인터페이스 ("아티스트의 다른 글" 재사용 — 재발명 금지) ③ W5.1 LadderBlock 자리의 실제 형태 (교체 방식) ④ 태그 canonical 처리 위치.

### Git Intelligence (git_intelligence)
- 착수 시 최근 5커밋에서 W5.3 실배치 확인 + 전체 테스트 통과 기준선에서 시작.

### Latest Tech Information (latest_tech_information)
- 신규 외부 의존 없음 — 추가 리서치 불요.

### Project Context Reference (project_context_reference)
- [Source: 03-story-engineering/project-context-kr.md#7-빈-상태] — 폴백·미출력 원칙
- [Source: 03-story-engineering/project-context-kr.md#10-미결-3건] — 계보 A/B/C 기본값

---

## Dev Agent Record (구현 기록)

### 사용 모델(Agent Model Used)
Claude (Andrew · 역할 #9) — 2026-09-02 구현

### 디버그 로그 참조
- 08-impl-notes/frontend.md W5.4 절

### 완료 노트 목록(Completion Notes List)
- **계보 선택 상태 = 원 무응답 → 안 A 기본 구현.** AlbumBox(안 A)만 렌더, LineageBlock은 예비 계약 유지·미활성 (role 필드는 W5.1 스키마에 존재, 소비만 조건부 — 안 B 확정 시 derive 그룹핑+컴포넌트 신작 반나절 규모).
- 폴백 사슬 derive/links.ts: ①직접(전부·발행 역순) ②태그(≤2) ③버킷(≤2) ④none — 첫 비지 않는 단계만, 혼합 금지 테스트 고정. 리드 카피 3모드(tag=direct 카피 재사용 — N-8).
- AlbumBox 2행 상태(평론 읽기→ / 평론 준비 중 비링크) + 미등록 text 플레인 렌더. 본문 자동 이름 매칭 없음(스토리 해석 그대로 — AlbumBox가 US-4 AC1 충족).
- 소급 링크 테스트: 평론 추가 → 이야기 행 승격 + 평론 쪽 direct 백링크 동시 생성 (양방향 검증).
- "{아티스트}의 다른 글" 결선 (W5.3 집계 재사용·현 평론 제외). 이야기 지면 완성(산세리프 29/800 — --fs-29 토큰 추가).
- 이야기 픽스처는 W5.3에서 이미 통합 편입됨 (리드 해소 주석) — 4축·고아 검사 포함 확인. 테스트 125개·check 0오류·2회 빌드 해시 동일.

### 파일 목록(File List)
<!-- ⚠️ 다음 스토리(W5.5)의 이전 스토리 인텔리전스 입력 — 반드시 채울 것 (D4) -->

| 파일 경로 | 상태 (신규/수정/삭제) |
|-----------|----------------------|
| src/lib/derive/links.ts | 신규 (역인덱스·폴백 사슬·AlbumBox 행) |
| src/lib/derive/site-data.ts | 수정 (ladder 준비물 노출) |
| src/components/AlbumBox.astro | 신규 (안 A) |
| src/components/LadderBlock.astro | 수정 (3모드 리드 카피) |
| src/pages/stories/[slug].astro | 수정 (셸 → 완성: 29/800·AlbumBox) |
| src/pages/reviews/[slug].astro | 수정 (사다리·아티스트의 다른 글 결선) |
| src/styles/tokens.css | 수정 (--fs-29) |
| tests/unit/derive-links.test.ts | 신규 (10 테스트 — 계 125) |
