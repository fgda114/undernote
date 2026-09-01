---
status: ready-for-dev
story_key: w5-0-setup
epic: 셋업 (E1~E5 전제 — build-plan W5.0)
owner: Andrew (W5 단독 구현 — Phillip·Stephen 미스폰)
source_hash: e6503e3ee0304562b8a41a4fdfe0a606053766108f45fc48e28e1c3bb7709b67
compiled_by: Matthew (#17) · 2026-09-02
---

# 스토리 W5.0: 저장소 스캐폴드 · CI · 호스팅 — "파이프라인의 존재 증명"

Status: ready-for-dev

## 스토리(Story) — story_requirements

As a **User(개발·발행 담당)**,
I want **빈 콘텐츠로도 빌드·배포가 성공하고, 의도적 스키마 위반이 빌드를 실패시키는 저장소 골격**,
so that **이후 전 에픽(E1~E5)이 "검증이 먼저 있는" 파이프라인 위에서 구현된다.**

[Source: 04-architecture/build-plan.md#W5.0] [Source: 03-service-planning/user-stories.md#US-10] (AC2 "반쪽 발행 금지"의 인프라 전제)

## 인수 기준(Acceptance Criteria)

1. **Given** 빈 `content/` + 유효한 `config/` 3종 / **When** 빌드 / **Then** 빌드·배포가 성공한다 (빈 상태 홈이 렌더됨 — 완성도는 W5.2에서). [Source: 04-architecture/build-plan.md#W5.0]
2. **Given** 의도적 스키마 위반 픽스처 1개(예: `score: 8.35`) / **When** 빌드 / **Then** 빌드가 실패하고 한국어 오류 메시지(파일 경로 + 수정 방법)가 출력된다. [Source: 04-architecture/build-plan.md#W5.0] [Source: 04-architecture/exceptions.md#2부-오류-코드-전수]
3. **Given** git push / **Then** CI가 검증→테스트→빌드를 실행하고, 실패 시 배포가 일어나지 않으며 기존 사이트는 마지막 성공 상태로 유지된다. [Source: 04-architecture/exceptions.md#3부-장애-부분-실패-설계]
4. **Given** CI 환경 / **Then** `TZ=Asia/Seoul`이 명시돼 있고, 동일 입력 2회 빌드의 산출 해시가 동일하다 (결정성 게이트의 골격 — 본격 픽스처는 W5.2). [Source: 04-architecture/exceptions.md#R-10] [Source: 04-architecture/build-plan.md#3-테스트-전략]
5. **Given** 호스팅 후보 3종(Cloudflare Pages·Netlify·GitHub Pages) / **When** W5.0 착수일에 공식 문서로 무료 한도 실확인 / **Then** 1개를 확정하고 git 연동 자동 빌드가 동작한다. 확인 내용(날짜·출처 URL·한도 수치)을 커밋 메시지 또는 `08-impl-notes/`에 기록한다. [Source: 04-architecture/adr/ADR-0009-hosting.md]
6. **Given** Astro 설치 / **Then** **현행 메이저 7.x**(ADR-0002 개정판 확정 — User 승인 기존재·로컬 Node v24.14.0 검증 완료)에서 **정확한 마이너 핀 + Zod v4 breaking change를 npm·공식 문서로 실확인**하고 기록한다. 메이저 선택은 더 이상 미결이 아니다. [Source: 04-architecture/adr/ADR-0002-ssg-astro.md]

## 작업/하위작업(Tasks / Subtasks)

- [ ] 작업 1 — Astro 7.x 마이너 핀 + Zod v4 확인 (AC: #6)
  - [ ] npm에서 astro 7.x 최신 마이너 실확인 후 lockfile 핀 (본 스토리 latest_tech는 2026-09-02 기준 — 착수일에 재확인)
  - [ ] Zod v4 breaking change를 공식 업그레이드 가이드로 확인 (`content.config.ts` 문법에 영향)
- [ ] 작업 2 — 저장소 스캐폴드 (AC: #1)
  - [ ] `code-structure.md` §1 트리 그대로 생성 (content/·config/·scripts/·src/·public/·tests/·reports/)
  - [ ] `config/site.yaml`·`genres.yaml`(2026 블록, B안 3버킷 기본값)·`tags.yaml`(빈 등록부) 초기값
  - [ ] `reports/` gitignore 등록 (산출물이지 콘텐츠 아님)
- [ ] 작업 3 — 스키마 최소 골격 (AC: #2)
  - [ ] `src/content.config.ts` — Review 스키마 1종만 우선 (score 정규식 포함). 전체 스키마는 W5.1
  - [ ] 위반 픽스처 `tests/fixtures/invalid/` 1개 + 실패 확인 테스트
- [ ] 작업 4 — CI (AC: #3, #4)
  - [ ] push → `npm ci` → 검증·테스트·빌드. `TZ=Asia/Seoul` 환경변수 명시
  - [ ] 동일 입력 2회 빌드 해시 비교 스텝 (초기엔 빈 사이트 대상)
- [ ] 작업 5 — 호스팅 확정 + 연동 (AC: #5)

---

## Developer Context (개발자 컨텍스트) — developer_context

### 이 스토리에서 무엇을 구현하는가
제품 코드가 아니라 **게이트의 존재 증명**을 만든다. 이 시스템은 "런타임이 없는 시스템"이며 빌드가 곧 제품 로직의 실행 지점이다 [Source: 04-architecture/architecture-overview.md#0-형태를-결정한-세-가지-사실]. 따라서 W5.0의 완료 기준은 "사이트가 예쁘게 뜬다"가 아니라 **"잘못된 콘텐츠가 배포될 수 없음이 증명된다"**이다 (AC2). 스캐폴드는 `code-structure.md` §1 트리를 그대로 따른다 — 임의 변형 금지 (구조 변경은 그 문서 갱신과 함께) [Source: 04-architecture/code-structure.md#1-저장소-트리].

### 중요한 제약·전제
- **Astro 메이저 = 7.x 확정 (해소됨 — 2026-09-02 ADR-0002 개정).** W3가 "Astro 5" 표기의 두 메이저 지연을 발견 → 리드 재확인(현행 안정 7.2.9) 후 ADR 개정. 채택 근거(Content Collections 빌드 타임 Zod 검증·zero-JS·astro:assets·순수 lib 분리)는 5→7 유지. 남은 것은 **마이너 핀 + Zod v4 breaking 실확인**뿐 [Source: 04-architecture/adr/ADR-0002-ssg-astro.md]. build-plan의 "User 확인 후 착수" 요건은 개정 ADR의 기존 User 승인으로 충족 [Source: 04-architecture/build-plan.md#W5.0].
- Node 22+ 필요 (Astro 6부터 최소 요구 — latest_tech). 개발 환경 = Windows 11 · PowerShell · Node/npm [Source: 00-plan/charter.md#6-제약].
- CI에 `TZ=Asia/Seoul` 명시는 협상 불가 — 월말정산 종료 월 판정이 이 값에 걸려 있다 [Source: 04-architecture/exceptions.md#R-10].
- 호스팅 요건 4개: 정적+CDN / 커스텀 도메인+HTTPS 자동 / git push 연동 원자적 배포 / 월 비용 0 목표 [Source: 04-architecture/adr/ADR-0009-hosting.md].
- `genres.yaml` 초기값은 **B안 3버킷(힙합/R&B·팝·록)** — Q1 미답 기본값이며 설정값이므로 원의 답이 오면 데이터만 바꾼다. `etc`는 예약어로 설정에 넣으면 안 됨 (E-109) [Source: 04-architecture/api-contracts.md#3.5] [Source: 07-design/design-handoff.md#2-원-결정-대기-항목].

### 해서는 안 되는 것
- 지어낸 무료 한도 수치로 호스팅을 "확정"하는 것 — 반드시 착수일 공식 문서 실확인 (ADR-0009가 명시적으로 이를 금지했다).
- DB·계정·CMS 흔적을 스캐폴드에 넣는 것 [Source: 00-plan/charter.md#5-범위-비범위].
- `reports/` 산출물 커밋, 파생물 파일 커밋 [Source: 04-architecture/data-model-erd.md#4-파생물].
- CI에서 lockfile 없는 `npm install` (공급망 — `npm ci` 고정) [Source: 04-architecture/architecture-overview.md#5-보안].

---

## Architecture Compliance (아키텍처 준수) — architecture_compliance

- 저장소 트리: `code-structure.md` §1 **그대로** [Source: 04-architecture/code-structure.md#1-저장소-트리]
- 레이어 경계 4계층 (데이터→계약→판단→렌더): 스캐폴드 시점부터 디렉터리로 물리화 [Source: 04-architecture/code-structure.md#3-레이어-경계]
- 검증 3등급 (E-1xx 실패 / E-2xx 경고 / E-3xx 알림) — checker 골격의 반환 타입에 반영 [Source: 04-architecture/api-contracts.md#2-검증-정책]
- 실패는 전부 모아 한 번에 보고 (첫 실패 중단 금지 — User n회 왕복 방지) [Source: 04-architecture/service-sequences.md#B-1]
- 빌드 실패 시 기존 사이트는 마지막 성공 상태 서빙 (정적 호스팅 기본 속성 — 별도 구현 불요, 호스팅 선택 시 이 속성 확인) [Source: 04-architecture/exceptions.md#3부-장애-부분-실패-설계]

## Library / Framework Requirements — library_framework_requirements

| 라이브러리/프레임워크 | 버전 | 비고 |
|----------------------|------|------|
| Astro | **7.x — 착수일 npm에서 최신 마이너 실확인 후 핀** (2026-09-02 확인: 7.2.9) | ADR-0002 개정판이 7.x 명기 (2026-09-01 정정). 아래 latest_tech의 6·7 breaking 목록 참조. Content Layer API 유지 |
| Node.js | 22+ | Astro 6부터 최소 요구 (2차 출처 — 착수일 공식 문서 재확인) |
| Zod | Astro 동봉 버전 사용 (Astro 6+는 v4 계열) | v3→v4 스키마 문법 차이 있음 — `content.config.ts` 작성 시 설치된 버전 문서 기준 |
| TypeScript | Astro 권장 버전 | |
| sharp | astro:assets 동봉 | 별도 직접 의존 추가 금지 (W5.1에서 커버 파이프라인) |

satori·resvg는 이 스토리 범위 아님 (W5.1). 신규 의존 추가는 최소 원칙 [Source: 04-architecture/architecture-overview.md#5-보안].

## File Structure Requirements — file_structure_requirements

```
신규 (code-structure.md §1 트리 준수):
  package.json · package-lock.json · astro.config.* · tsconfig.json
  config/site.yaml            # site_name: "undernote"(기본값) · base_url · active_year: 2026 · og_use_cover: true
  config/genres.yaml          # years: [{year: 2026, buckets: 힙합/R&B·팝·록(B안 기본), min_reviews_to_publish: 3}]
  config/tags.yaml            # tags: [] (빈 등록부)
  content/albums/ · content/reviews/ · content/stories/ · content/artists/ · content/snapshots/  # 빈 디렉터리
  src/content.config.ts       # Review 스키마 최소 골격 (W5.1에서 전체화)
  src/lib/ · src/layouts/ · src/pages/ · src/components/ · src/styles/
  public/covers/ · public/fonts/
  tests/fixtures/invalid/ · tests/unit/
  .gitignore                  # reports/ · dist/ 포함
  CI 설정 (.github/workflows/ 또는 호스팅 CI)  # TZ=Asia/Seoul
```
[Source: 04-architecture/code-structure.md#1-저장소-트리] [Source: 04-architecture/api-contracts.md#3.5] [Source: 04-architecture/api-contracts.md#3.8]

## Testing Requirements — testing_requirements

- **단위 테스트**: 테스트 러너 셋업(Astro 호환 — vitest 계열 권장, 선택은 User/Andrew) + Review 스키마 유효/무효 픽스처 쌍 1세트 (E-105가 실제 그 코드로 실패하는지) [Source: 04-architecture/build-plan.md#3-테스트-전략]
- **통합 테스트**: CI에서 빈 콘텐츠 빌드 성공 + 위반 픽스처 빌드 실패 (파이프라인 존재 증명 — 이 스토리의 DoD)
- **E2E**: 없음 (지면이 아직 없다 — R-4 정신: 가짜로 채우지 않는다)
- **결정성**: 2회 빌드 해시 비교 스텝이 CI에 존재하고 통과 [Source: 04-architecture/build-plan.md#3-테스트-전략]

## Dev Notes (개발 노트)

- 이 스토리의 산출이 이후 전 스토리의 전제다. **DoD: "빈 콘텐츠로 빌드·배포 성공 + 의도적 스키마 위반 픽스처가 빌드를 실패시킴"** [Source: 04-architecture/build-plan.md#W5.0]
- 완료 시 아래 Dev Agent Record의 파일 목록(File List)을 반드시 채울 것 — 다음 스토리(W5.1)의 이전 스토리 인텔리전스 입력이다 (D4).
- 구현 노트는 `.agent-team/08-impl-notes/`에 남긴다 (BATHOS 인계 규약 + W5 훅 검사 대상).

### 이전 스토리 인텔리전스 (previous_story_intelligence)
- 없음 — 첫 스토리다. (W5 이전에 구현된 제품 코드가 저장소에 존재하지 않음을 git 이력으로 확인 — 아래 git_intelligence.)

### Git Intelligence (git_intelligence)
- 저장소 최근 커밋은 전부 문서(W1·W2 산출물)이며 **제품 코드·의존성 0** — 회귀 걱정 없이 그린필드 스캐폴드 가능. 커밋 규약은 한국어 conventional commit 형태(`docs:`·`chore:`)가 확립돼 있다 — 구현 커밋도 이 관례를 따를 것 (발행 커밋은 `publish: <slug>` [Source: 04-architecture/code-structure.md#4-명명-규칙]).

### Latest Tech Information (latest_tech_information) — 2026-09-02 리서치
- **Astro 최신 안정 = 7.2.9** (7.2: 2026-08 — 실험적 증분 정적 빌드 등 / 7.0: 2026-06-22 — Vite 8·신규 Rust 컴파일러). 출처: astro.build/blog + github.com/withastro/astro/releases (리드 재확인 2026-09-02). ADR-0002는 이 발견으로 "5"→"7.x" 개정됨.
- **Astro 6 (2026-03 안정) breaking**: Node 22 최소 / Zod v4 / `Astro.glob()`·`emitESMImage()`·`<ViewTransitions />` 제거(→`<ClientRouter />`) / i18n redirect 동작 변경. **Content Layer API(Astro 5 도입)는 유지.** 출처: southwellmedia.com 정리 글 — **2차 출처이므로 착수일 공식 업그레이드 가이드로 재확인 필수.**
- Astro 5.x의 현행 지원·보안 패치 상태: **미확인.**
- 본 프로젝트는 `Astro.glob()`·ViewTransitions·i18n을 쓰지 않으므로 위 제거 항목의 직접 영향 없음. 실질 영향은 ① Node 22 요구 ② Zod v4 문법 두 가지다.

### Project Context Reference (project_context_reference)
- [Source: 03-story-engineering/project-context-kr.md#2-스택-버전-정책] — Astro 버전 CONCERNS 원문
- [Source: 03-story-engineering/project-context-kr.md#4-결정성] · [#6-검증-3등급과-빌드-게이트]

---

## Dev Agent Record (구현 기록)

### 사용 모델(Agent Model Used)
_(구현 시 기입)_

### 디버그 로그 참조
_(구현 시 기입)_

### 완료 노트 목록(Completion Notes List)
- _(구현 시 기입 — Astro 핀 버전·Zod v4 확인 결과·호스팅 확정 내용 필수)_

### 파일 목록(File List)
<!-- ⚠️ 다음 스토리(W5.1)의 이전 스토리 인텔리전스 입력 — 반드시 채울 것 (D4) -->

| 파일 경로 | 상태 (신규/수정/삭제) |
|-----------|----------------------|
| _(구현 시 기입)_ | |
