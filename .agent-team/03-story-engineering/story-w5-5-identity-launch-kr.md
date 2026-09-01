---
status: ready-for-dev
story_key: w5-5-identity-launch
epic: E5 — 정체성 지면 + 공개 게이트 (CF-8)
owner: Andrew (W5 단독 구현) · 카피는 원+리드 협의
source_hash: e6503e3ee0304562b8a41a4fdfe0a606053766108f45fc48e28e1c3bb7709b67
depends_on: w5-2-list-engine   # 최소 공개 단위 = E1+E2+E5. E3·E4는 공개 후 순차 가능
compiled_by: Matthew (#17) · 2026-09-02
---

# 스토리 W5.5: 소개/기준 지면 + 공개 게이트 — "실림 = 추천"의 명문화

Status: ready-for-dev

## 스토리(Story) — story_requirements

As a **독자**,
I want **"왜 화제작 ○○의 리뷰가 없지?"에 스스로 답할 수 있는 선별 기준 지면**,
so that **"없음 = 문턱 미달"이라는 이 매체의 신호를 읽을 수 있다.**

[Source: 03-service-planning/user-stories.md#US-8] [Source: 03-service-planning/usp.md#3-usp-c]

## 인수 기준(Acceptance Criteria)

1. Given 소개/기준 페이지 / Then 세 문장이 명문으로 있다: ① `여기 실린 앨범은 전부 "안 들으면 손해" 문턱을 통과한 것입니다.` ② `다루지 않았다는 것은, 아직 추천하지 않는다는 뜻입니다.` ③ `점수는 들을까 말까가 아니라, 이미 검증된 것들 사이의 순위입니다.` (소제목 구조 — 본문 카피는 원+리드 협의분으로 채움). [Source: 03-service-planning/user-stories.md#US-8] [Source: 07-design/ui-spec.md#8-소개-기준]
2. Given 전체 사이트 어느 페이지 / Then 전역 내비에 소개/기준 경로 존재 (US-8 AC2 — Masthead 5항목에 이미 있음을 확인). [Source: 03-service-planning/user-stories.md#US-8]
3. Given 404 / Then 세리프 1줄 `이 주소에는 글이 없습니다.` + 홈·아카이브 링크 2개, 장식 없음. [Source: 07-design/ui-spec.md#9-404]
4. Given about 지면 / Then 커버 아트 권리자 연락 경로 명시 (ADR-0008 제거 프로세스의 접점). [Source: 04-architecture/adr/ADR-0008-cover-art-policy.md]
5. Given 공개 전 점검 / Then 페이지 초기 전송(HTML+CSS+폰트) < 500KB — 대표 지면(홈·평론·리스트)에서 실측, 초과 시 조정 협의. [Source: 04-architecture/build-plan.md#W5.5]
6. Given 계측 요구 (평론↔이야기 이동률 측정 가능) / Then 쿠키리스 경량 계측 1종을 **무료 한도 공식 문서 실확인 후** 선정·설치 (스니펫 1개 초과 금지 — "클라이언트 JS 0"의 유일한 예외). 선정 전까지는 계측 없음. [Source: 04-architecture/architecture-overview.md#6-관측-가능성]
7. Given 공개 게이트 / Then Matthias(QA)의 US-1~15 AC 전수 수동 확인이 완료되고 결과가 기록된다 (user-stories.md가 그대로 시나리오). [Source: 04-architecture/build-plan.md#W5.5]
8. Given 디자인 수용 검사 목록 / Then design-handoff §5의 10항목 전부 통과 (토큰 하드코딩 0·seal 5자리·D2 3규칙·조건부 미출력·키보드·reduced-motion·다크·360px 가로 스크롤 0·OG 전 유형 무점수). [Source: 07-design/design-handoff.md#5-수용-검사]

## 작업/하위작업(Tasks / Subtasks)

- [ ] 작업 1 — `/about/` 지면 (AC: #1, #2, #4)
  - [ ] 세리프 본문 지면 + 필수 3문 소제목 구조 (틀 먼저, 카피는 원+리드 협의분 수급 — 협의 지연 시 3문 + 자리 표시가 아닌 **3문만으로 성립하는 최소 지면**으로 공개 가능)
  - [ ] 권리자 연락 경로 1줄
- [ ] 작업 2 — 404 (AC: #3)
- [ ] 작업 3 — 성능 예산 실측 (AC: #5)
  - [ ] 홈·평론·리스트 초기 전송 실측 + 폰트 서브셋 합계 확인 (<1.5MB 캐시 예산)
- [ ] 작업 4 — 계측 선정 (AC: #6)
  - [ ] 후보(호스트 내장 분석·GoatCounter 류) 무료 한도 실확인 → 1종 선정 근거 기록 → 스니펫 1개 설치 → 평론↔이야기 이동률이 실제로 측정 가능한지 확인
- [ ] 작업 5 — 공개 게이트 (AC: #7, #8)
  - [ ] 픽스처가 아닌 실콘텐츠 최소 세트로 스테이징 빌드 → Matthias QA 전수 → 발견 결함 수정 → 재확인
  - [ ] design-handoff §5 체크리스트 자가 점검 기록

---

## Developer Context (개발자 컨텍스트) — developer_context

### 이 스토리에서 무엇을 구현하는가
개발량은 최소(지면 2개 + 계측 1스니펫)지만 **공개 판정이 이 스토리의 본체**다. E1+E2+E5 = 최소 공개 단위 — "평론 몇 편 + 진행형 보드 + 기준 지면"이 첫 얼굴이다. E3(탐색)·E4(사다리)는 공개 후 순차 가능하므로, 리드·User 판단에 따라 이 스토리는 W5.2 직후에 앞당겨 실행될 수 있다 (depends_on이 w5-2인 이유) [Source: 03-service-planning/core-features.md#4-에픽과-릴리스-순서].

### 중요한 제약·전제
- USP-C는 기능이 아니라 규칙이다 — 만들 것은 지면 1개와 (이미 W5.1에 있는) 체크 1문항의 기록뿐. 점수 루브릭·평가 기준표는 만들지 않는다 (Non-goals — "척도는 원의 것, 문서화가 오히려 족쇄") [Source: 03-service-planning/core-features.md#3-non-goals].
- about 카피의 소유는 원+리드 (개발 최소·콘텐츠 위주 에픽) — Andrew는 틀과 필수 3문 위치만 고정 [Source: 07-design/ui-spec.md#8-소개-기준].
- 계측 후보의 무료 한도는 **미확인**이 현재 상태다 — 지어내지 말고 실확인 (ADR-0009 확인 작업과 같은 규율) [Source: 04-architecture/architecture-overview.md#6-관측-가능성].
- 500KB는 측정치가 아니라 **설계 예산**이다 — 초과 시 "실패"가 아니라 조정 협의 (폰트 서브셋 재검토 등) [Source: 04-architecture/architecture-overview.md#4-nfr].
- E3·E4를 건너뛰고 공개하는 경우: 내비 "아카이브"·이야기 관련 링크가 깨진 채 노출되면 안 된다 — 해당 지면 부재 시 내비 항목 처리 방식을 리드와 확인 (고아·링크 검사 E-112·113과의 정합 포함). 이는 릴리스 순서의 함의이며 코드 문제가 아니다.

### 해서는 안 되는 것
- 카피 협의가 늦어진다고 임시 문구("준비 중입니다")로 공개 (R-4 — 사과하는 지면 금지. 3문만으로 성립하는 최소 지면이 대안).
- 계측 스니펫 2개 이상, 쿠키 기반 도구, 동의 배너가 필요한 도구 (JS 0 원칙의 예외는 1개뿐) [Source: 04-architecture/architecture-overview.md#6-관측-가능성].
- QA 결함을 "공개 후 수정"으로 넘기며 게이트 통과 처리 (완료 거짓말 — AC7은 전수 확인이 사양).
- SEO 투자 (기본 위생: 메타태그·시맨틱만 — 유입 축은 리스트 유통 + 원 SNS) [Source: 03-service-planning/core-features.md#3-non-goals].

---

## Architecture Compliance (아키텍처 준수) — architecture_compliance

- 라우트 `/about/` + 404 — 화면 8종+404의 마지막 조각 [Source: 04-architecture/code-structure.md#2-url-설계] [Source: 07-design/ux-flow-map.md#1-정보구조]
- about OG = 기본형 카드 (기타 유형) [Source: 04-architecture/api-contracts.md#5-og-메타-계약]
- 운영 수칙 5항(2FA·스냅샷 수정 금지·과거 버킷 금지·원자 커밋·E-3xx 전달)을 `09-docs` 승계용으로 구현 노트에 정리 [Source: 04-architecture/build-plan.md#4-운영-수칙]
- 공개 시점 = E5 동반이 릴리스 판단 [Source: 03-service-planning/core-features.md#4-에픽과-릴리스-순서]

## Library / Framework Requirements — library_framework_requirements

| 라이브러리/프레임워크 | 버전 | 비고 |
|----------------------|------|------|
| 계측 도구 1종 | **미정 — 착수 시 후보별 무료 한도·쿠키리스 여부 실확인 후 선정** | 후보: 호스팅 내장 분석 · GoatCounter 류 [Source: 04-architecture/architecture-overview.md#6-관측-가능성]. 선정 근거(날짜·출처)를 완료 노트에 기록 |
| (그 외 신규 의존 없음) | — | |

## File Structure Requirements — file_structure_requirements

```
신규:
  src/pages/about.astro
  src/pages/404.astro
  (계측 스니펫 — 선정 도구에 따라 layouts/Base.astro 수정 1곳)
수정:
  src/layouts/Base.astro           # 계측 스니펫 주입 (1개 상한)
산출(코드 아님):
  .agent-team/08-impl-notes/w5-5-launch-gate.md   # QA 전수 결과·성능 실측·계측 선정 근거·운영 수칙 정리
```
[Source: 04-architecture/code-structure.md#1-저장소-트리] [Source: 04-architecture/build-plan.md#4-운영-수칙]

## Testing Requirements — testing_requirements

- **단위 테스트**: about·404가 OG 3요소를 갖는지 (E-111 대상에 자동 포함 — checker가 이미 전수 검사)
- **통합 테스트**: 전체 픽스처 빌드에서 about이 전역 내비로 도달 가능 (US-8 AC2)
- **E2E / 인수**: **US-1~15 AC 전수 수동 확인 (Matthias)** — user-stories.md의 Given/When/Then이 그대로 시나리오. + design-handoff §5 10항목 + 초기 전송 실측 [Source: 04-architecture/build-plan.md#W5.5] [Source: 07-design/design-handoff.md#5-수용-검사]

## Dev Notes (개발 노트)

- DoD: E1+E2+E5 완성 = 최소 공개 단위. E3·E4는 공개 후 순차 가능 [Source: 04-architecture/build-plan.md#W5.5]
- 사이트 이름이 공개 전 확정되면 `config/site.yaml#site_name` 문자열 1곳 치환이 전부 (워드마크 = 텍스트 로고) [Source: 07-design/design-handoff.md#2-원-결정-대기-항목]

### 이전 스토리 인텔리전스 (previous_story_intelligence)
- **착수 전, 실행 시점까지 완료된 모든 W5 스토리의 Dev Agent Record를 읽을 것** (이 스토리는 W5.2 직후로 앞당겨질 수 있어 직전 스토리가 유동적이다). 특히: ① 확정 호스팅 (계측 후보 중 "호스트 내장 분석"의 실체가 이것으로 정해진다) ② W5.2 완료 노트의 미해결 항목 ③ 폰트 실측치 (500KB 예산의 최대 변수).

### Git Intelligence (git_intelligence)
- 착수 시 최근 커밋에서 완료 스토리 범위 확인. 공개 직전이므로 **전체 테스트 + 결정성 게이트 통과 상태**가 전제.

### Latest Tech Information (latest_tech_information)
- 계측 도구 무료 한도·정책은 시점 민감 정보 — 본 스토리에 수치를 적지 않는다 (착수 시 실확인이 사양). 그 외 신규 의존 없음.

### Project Context Reference (project_context_reference)
- [Source: 03-story-engineering/project-context-kr.md#1-제품-한-문장과-불변식]
- [Source: 03-story-engineering/project-context-kr.md#10-미결-3건] — 사이트 이름 처리

---

## Dev Agent Record (구현 기록)

### 사용 모델(Agent Model Used)
_(구현 시 기입)_

### 디버그 로그 참조
_(구현 시 기입)_

### 완료 노트 목록(Completion Notes List)
- _(구현 시 기입 — QA 전수 결과 위치·성능 실측치·계측 선정 근거 필수)_

### 파일 목록(File List)

| 파일 경로 | 상태 (신규/수정/삭제) |
|-----------|----------------------|
| _(구현 시 기입)_ | |
