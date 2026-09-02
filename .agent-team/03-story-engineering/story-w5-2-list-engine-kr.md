---
status: ready-for-dev
story_key: w5-2-list-engine
epic: E2 — 리스트 엔진 + 홈 (CF-2 · CF-3 · CF-4 + CF-7 일부)
owner: Andrew (W5 단독 구현)
source_hash: 2768bb719646d116b9c6080098e5c7f2562da472193b029b7ef5f893f2cda427
depends_on: w5-1-review-pipeline
compiled_by: Matthew (#17) · 2026-09-02
---

# 스토리 W5.2: 리스트 엔진 + 홈 — "USP-A의 몸체이자 1년차의 얼굴"

Status: ready-for-dev

## 스토리(Story) — story_requirements

As a **독자**,
I want **연말까지 기다리지 않고 지금의 올해의 앨범 후보(보드·진행형 10선·월말정산)를 보고, 전 항목에서 클릭 1회로 평론에 도달하기**,
so that **리스트를 믿어도 되는지 근거로 확인할 수 있다.**

[Source: 03-service-planning/user-stories.md#US-1] [Source: 03-service-planning/user-stories.md#US-2] [Source: 03-service-planning/user-stories.md#US-5]

## 인수 기준(Acceptance Criteria)

**도출 (SS-3·4·5·7):**
1. Given 힙합/R&B 평론 7편 / Then 보드에 상위 5만, 각 항목 평론 링크 보유. Given 6위로 밀린 앨범 / Then 보드 제외 + 배지 제거. [Source: 03-service-planning/service-stories.md#SS-4]
2. Given "그 외"(etc) 버킷 9.1점 앨범 / Then 10선 후보 포함·보드 제외. Given 2025년 발매 앨범의 2026년 평론 / Then 2026 10선 후보 아님 (아카이브·월말정산엔 포함 — R-3). [Source: 03-service-planning/service-stories.md#SS-5] [Source: 04-architecture/exceptions.md#R-7]
3. Given **경계 동점**(보드 5↔6위) 두 앨범 / Then 발행일 이른 쪽 상위 + E-301 알림 파일 생성 (빌드는 막지 않음). 같은 날 동점은 slug 사전순 (R-1 3차 키). Given **비경계 동점**(예: 보드 2↔3위) / Then 정렬 규칙만 적용, **E-301 미산출** — E-301의 규범은 exceptions(경계 한정: 보드 5↔6 · 버킷 1↔2 · 10선 10↔11)이며 SS-3 문언의 광의 해석을 따르지 않는다 (Thomas N-1 — 상류 모순의 해소 명시). [Source: 04-architecture/exceptions.md#R-1] [Source: 03-service-planning/service-stories.md#SS-3]
4. Given 9월 평론 3편 / Then "9월의 앨범" 페이지에 3편 점수순, 전 항목 링크. Given 10월 평론 0편 / Then 10월 페이지·목록 항목 부재. [Source: 03-service-planning/service-stories.md#SS-7]
5. Given 점수 수정 / Then 보드·진행형 10선·**과거 월말정산**·아카이브 재도출, 확정 스냅샷만 불변. [Source: 04-architecture/exceptions.md#R-2]

**무결성 checker (SS-8 · SS-15):**
6. Given 평론 파일이 삭제된 스냅샷 항목 / When 빌드 / Then **E-110 실패** + 항목 명시. 내부 링크 깨짐 = E-112, 4축 인덱스 어디에도 없는 글 = E-113 실패. [Source: 03-service-planning/service-stories.md#SS-8]
7. Given OG 3요소 부재 페이지 / Then E-111 실패 (렌더 산출 HTML 전수 검사 — 메타 태그 존재는 구조 검사). Given OG 메타·카드 생성 경로에 점수 유입 / Then **E-115 실패** — **검출은 구조적이다:** ① og·카드 조립 입력 타입에 score 필드 부재 (W5.1 타입 레벨 + 단위 테스트) ② og:title/description **생성기가 score 필드를 참조하지 않음**을 검사. **HTML 부분 문자열 스캔으로 점수를 찾지 않는다** — "1983년"에 "8.3"이 포함돼 정상 콘텐츠가 오탐 실패하고, 오발화하는 검사기는 무시당해 죽는다 (Thomas N-5 · Matthias N-1 — 리드 가중 지시). [Source: 04-architecture/api-contracts.md#5-og-메타-계약]
8. Given 빌드 완료 / Then `reports/build-report.md`+`.json` 산출 — failures/warnings/notices(원 전달 섹션) 구조. [Source: 04-architecture/api-contracts.md#4-빌드-도출-데이터-구조] (§4.6 BuildReport)

**연말 확정 (SS-6 · US-13):**
9. Given 원의 확정 선언+서문 / When **`finalize --year 2026 --preface <서문 파일 경로>`** (서문 입력은 CLI 인자 — 초안 파일은 `content/` 밖에 두고 finalize가 스냅샷 본문으로 결합한다. 생성 후 스냅샷을 열어 서문을 붙여넣는 방식 금지 — "스냅샷 수동 편집 금지" 수칙과 충돌, Thomas N-6) / Then 그 시점 10선·버킷 선정·노미네이트가 스냅샷 동결(표시 문자열 비정규화) + `active_year` +1 + 이듬해 빈 보드 + **다음 빌드에서 홈이 확정 직후 변형(ui-spec §1.6 — 확정 리스트 링크 카드 + 새해 빈 보드)으로 렌더** (Matthias N-3). 평론 ≤`min_reviews_to_publish`-1인 버킷은 `published: false`. 대상 연도 평론 0편이면 E-405 확정 거부. [Source: 04-architecture/service-sequences.md#시퀀스-C] [Source: 07-design/ui-spec.md#1.6] [Source: 04-architecture/build-plan.md#4-운영-수칙]
10. Given 확정 후 점수 수정·지난해 발매작 평론 발행 / Then 스냅샷 불변, 아카이브에만 반영. [Source: 03-service-planning/user-stories.md#US-13]

**홈 + 리스트 지면 (D5 · US-1·2):**
11. Given 홈 / Then 버킷별 노미네이트(0~5)가 점수순, 클릭 1회로 평론 도달, 5편 미만 버킷은 있는 만큼만 (빈 칸 가짜 채움 금지). 빈 버킷 = `아직 이 장르의 후보가 없습니다.` [Source: 03-service-planning/user-stories.md#US-2] [Source: 07-design/ui-spec.md#1-홈]
12. Given 전체 노미네이트 총수 <6 (설정값 — 하드코딩 금지) / Then 극초기 변형: 보드는 진행 배너로 축소 + 최신 평론 히어로가 얼굴. 평론 0편이면 소개 요지 + `첫 평론을 준비하고 있습니다.` [Source: 07-design/ui-spec.md#1.5]
13. Given 확정된 `/list/{year}/` / Then 서문이 리스트 위, 순위 = 점수 내림차순 일치, 제목은 `{연도} 올해의 앨범`(개수 하드코딩 금지 — 캡션 `{n}장의 앨범` 자동), 확정 캡션 표기. [Source: 03-service-planning/user-stories.md#US-1] [Source: 07-design/ui-spec.md#4.2]

**결정성 게이트 (이 단계의 핵심 테스트):**
14. Given 동일 픽스처 / When 2회 빌드 / Then 산출 HTML 해시 동일. R-1(동점)·R-3(귀속)·R-7(etc) 픽스처 각 1개 이상의 골든 파일 테스트 통과. [Source: 04-architecture/build-plan.md#W5.2]

## 작업/하위작업(Tasks / Subtasks)

- [ ] 작업 1 — `src/lib/derive/lists.ts` (AC: #1~5)
  - [ ] R-1 3키 정렬 (십분위 정수 · 코드포인트 비교 — 로케일 collation 금지)
  - [ ] Board(activeYear·etc 제외·버킷 order 순) → Top10Progressive(etc 포함·당해 발매) → MonthlyRecap(발행월·종료 월만·0편 미생성)
  - [ ] 배지 역맵 Map<albumSlug,{bucket,rank}> (P8 접근 패턴)
  - [ ] E-301 경계 동점 감지 (보드 5↔6·10선 10↔11·버킷 1↔2)
- [ ] 작업 2 — `src/lib/checker/` 확장 (AC: #6~8)
  - [ ] E-110 링크율 100% (스냅샷 포함) · E-112 내부 링크 · E-113 고아 (4축 인덱스는 W5.3 전이라 이 시점엔 "리스트·홈 도달 검사 + 구조 준비" — 4축 완성 시 W5.3에서 검사 대상 확장)
  - [ ] E-111·E-115: dist HTML 전수 스캔
  - [ ] BuildReport 산출 (failures→배포 중단·warnings·notices 3분류, 한국어 메시지)
- [ ] 작업 3 — `scripts/finalize.ts` (AC: #9, #10)
  - [ ] 시퀀스 B의 derive **같은 코드 경로** 재사용 (이중 구현 금지)
  - [ ] 스냅샷 md 생성(프론트매터 동결 + `--preface` 인자의 서문 파일을 본문으로 결합)·E-405·경계 동점 최종 알림·active_year 전환 (서문 입력 계약은 AC9 — 수동 편집 경로 금지)
- [ ] 작업 4 — 지면 (AC: #11~13)
  - [ ] **[C-2 수리 — E-112 도입 전제] 최소 셸 선행 생성:** ① `/about/` — US-8 필수 3문만의 최소 지면 (W5.5가 "3문만으로 성립"을 명시 — 그 최소형을 여기서 먼저 만든다. W5.5가 완성본으로 대체) ② `/archive/` — 빈 상태 셸 + 프리셋 URL 확정 (W5.3이 실구현으로 대체). **이것 없이 E-112를 켜면 Masthead의 `/archive/`·`/about/` 링크가 전 페이지에서 빌드를 실패시켜 이 스토리의 결정성 게이트에 도달할 수 없다** (Thomas C-2 — 리드 채택 수리안 a. 상류 수정 0)
  - [ ] BoardPanel/BoardRow(1위 seal 처리·행 전체 링크·`<ol>`)·ListRankRow(확정 1위 160px champion 변이)
  - [ ] **홈 "최신 글" 섹션 (최신 8개, 유형 혼합, 점수 비표시)** + 이를 위한 **ArticleCard 컴포넌트를 이 스토리에서 구현** (W5.3이 아카이브에서 재사용 — Thomas N-4. score 프로퍼티 없는 계약 그대로) [Source: 07-design/ui-spec.md#1.1] [Source: 07-design/design-system/components.md#7-articlecard]
  - [ ] 홈 3+1상태 (일반/극초기/평론 0/확정 직후) + 보드 스태거 모션(240ms·60ms·reduced-motion 제거)
  - [ ] `/list/{year}/` 진행형(후보 상위 10 + 버킷 보드)·확정형(스냅샷만 렌더) — activeYear/스냅샷 존재로 분기
  - [ ] `/list/{year}/{mm}/` + 리스트 카드 OG (순위·앨범·아티스트만 — 점수 금지)
- [ ] 작업 5 — 결정성 게이트 (AC: #14)
  - [ ] 픽스처: 동점(같은 점수 다른 날·같은 날)·귀속(구반 평론)·etc 걸작·빈 버킷·10편 미만 해
  - [ ] 골든 파일 테스트 + CI 2회 빌드 해시 비교를 실픽스처로 강화

---

## Developer Context (개발자 컨텍스트) — developer_context

### 이 스토리에서 무엇을 구현하는가
**제품의 약속을 코드로 만든다.** 리스트는 저장하지 않고 매 빌드 순수 함수로 도출하며(P1 — 파생물이 파일로 커밋되어 있다면 버그), 순위가 곧 제품이므로 빌드마다 순서가 1비트도 흔들리면 안 된다(P10). 홈은 이 보드의 현황판이고, finalize는 진행형→확정 스냅샷의 유일한 전이다. 파생 로직은 이미 알고리즘 수준으로 사양화되어 있다 — **구현은 번역 작업**이다 [Source: 04-architecture/service-sequences.md#시퀀스-B] [Source: 04-architecture/exceptions.md#R-1].

### 중요한 제약·전제
- **정렬 전순서 3키:** `scoreTenths desc → review.date asc → album slug asc`. 3차 키는 같은 날 동점의 비결정성 차단용 — 생략하면 CI 해시 게이트가 간헐 실패한다 [Source: 04-architecture/exceptions.md#R-1].
- **연도 귀속 2축은 모순이 아니라 사양:** 리스트 = 발매 연도("올해 나온 앨범 중 최고"), 아카이브 = 발행 연도, 월말정산 = 발행 월(구반 포함). 하나로 "정리"하려 들면 안 된다 [Source: 04-architecture/exceptions.md#R-3].
- **시계 의존은 딱 한 곳:** 월말정산의 "종료된 월" 판정뿐, Asia/Seoul 고정. `new Date()` 산재 금지. 연도 전환은 시계가 아니라 `active_year` 설정 [Source: 04-architecture/adr/ADR-0005-derived-lists-snapshot.md] [Source: 04-architecture/exceptions.md#R-10].
- **불변의 예외는 스냅샷 하나:** 월말정산은 살아 있는 도출물(점수 수정 반영 — R-5). 스냅샷은 표시 문자열까지 비정규화 동결, 이후 어떤 입력에도 불변 [Source: 04-architecture/design-patterns.md#P3].
- finalize는 derive와 **같은 코드 경로** — 별도 구현하면 확정 직전 화면과 스냅샷이 어긋날 수 있다 [Source: 04-architecture/service-sequences.md#시퀀스-C].
- 페이지는 derive 출력(Board·Top10Progressive·MonthlyRecap·ListEntry — api-contracts §4 구조)을 **가공 없이** 렌더. 정렬·필터가 템플릿에 보이면 반려 [Source: 04-architecture/api-contracts.md#4-빌드-도출-데이터-구조].
- 전량 재계산 O(n)+해시맵 — 증분·인덱스 튜닝은 낭비 (n < 600) [Source: 04-architecture/data-model-erd.md#3-접근-패턴].
- 극초기 전환 임계값(노미네이트 ≥6)은 시안값 — **설정으로** 빼고 하드코딩 금지 [Source: 07-design/ui-spec.md#1.5].

### 해서는 안 되는 것
- 보드·10선·월말정산·역링크·배지를 파일로 저장 (유일 예외: 확정 스냅샷) [Source: 04-architecture/data-model-erd.md#4-파생물].
- float 점수 비교, 로케일 collation, 파일 시스템 순회 순서 의존 [Source: 04-architecture/design-patterns.md#P10].
- 스냅샷 수동 편집 허용 경로 (잘못된 확정 = 삭제 후 finalize 재실행) [Source: 04-architecture/build-plan.md#4-운영-수칙].
- 빈 버킷 숨기기(연간 구조가 보이는 것이 D5의 목적) 또는 빈 칸 자리 채움 [Source: 07-design/ui-spec.md#1.4].
- 경계 동점을 빌드 실패로 승격 (알림이 사양 — 빌드를 막지 않는다) [Source: 03-service-planning/service-stories.md#SS-3].
- 지면에 "10선" 노출·제목 개수 하드코딩 [Source: 07-design/ui-spec.md#4.2].
- **빌드 시각을 지면에 출력** — ui-spec §1.1 보드 캡션의 "{날짜} 기준"을 빌드 시계로 채우면 2회 빌드 해시 게이트가 깨진다. 저장소 유래 값(최신 평론 발행일)으로 채울 것 (R-10: 빌드 시각의 유일한 소비처 = 종료 월 판정) [Source: 04-architecture/exceptions.md#R-10].

---

## Architecture Compliance (아키텍처 준수) — architecture_compliance

- 도출 데이터 계약: Board·Top10Progressive·MonthlyRecap·ListEntry·CoverSet·BuildReport — 필드명 그대로 [Source: 04-architecture/api-contracts.md#4-빌드-도출-데이터-구조]
- 빌드 5단계 순서: schema→resolver→derive→checker→render (단계 순서 = 의존 순서) [Source: 04-architecture/service-sequences.md#시퀀스-B]
- etc 취급 전 지면 표 (보드 제외·10선 포함·월말 포함·아카이브 "그 외" 그룹·배지 없음) [Source: 04-architecture/exceptions.md#R-7]
- R-6 10편 미만 해: 있는 만큼 동결, 제목 무숫자 + 캡션 자동 [Source: 04-architecture/exceptions.md#R-6]
- R-8 버킷 검증은 발매 연도 블록 기준, 과거 연도 지면은 스냅샷에서만 렌더 [Source: 04-architecture/exceptions.md#R-8]
- 스냅샷 스키마 (top10 maxItems 10·buckets published/winner/nominees) + E-114 중복·위반 검사 [Source: 04-architecture/api-contracts.md#3.7]

## Library / Framework Requirements — library_framework_requirements

| 라이브러리/프레임워크 | 버전 | 비고 |
|----------------------|------|------|
| (신규 의존 없음) | — | 이 스토리는 W5.0~1 스택 위의 순수 TS + 지면. 신규 라이브러리가 필요해 보이면 먼저 의심할 것 — 전부 O(n) 스캔+Map으로 사양화되어 있다 [Source: 04-architecture/data-model-erd.md#3-접근-패턴] |
| 해시 비교 | Node 내장 crypto | CI 결정성 게이트용 |

## File Structure Requirements — file_structure_requirements

```
신규:
  src/lib/derive/lists.ts          # R-1 정렬·보드·10선·월말정산·배지 역맵 (순수 함수 — 골든 테스트 대상)
  scripts/finalize.ts
  src/pages/index.astro            # 홈 3+1상태
  src/pages/list/[year]/index.astro
  src/pages/list/[year]/[mm].astro
  src/pages/about.astro            # [C-2 셸] US-8 필수 3문 최소 지면 — W5.5가 완성본으로 대체
  src/pages/archive/index.astro    # [C-2 셸] 빈 상태 셸 + 프리셋 URL 확정 — W5.3이 실구현으로 대체
  src/components/{BoardPanel,BoardRow,ListRankRow,ArticleCard}.astro   # ArticleCard는 홈 최신 글용 — W5.3 재사용 (N-4)
  tests/fixtures/{tie-same-day,tie-diff-day,attribution,etc-bucket,empty-bucket,under-ten}/
  tests/unit/{derive-lists,checker-integrity,finalize}.test.ts + 골든 파일
수정:
  src/lib/checker/                 # E-110~115·E-301·build-report 추가
  src/lib/og/                      # 리스트형 카드 템플릿
  config/site.yaml                 # 극초기 임계값 설정 추가 시 스키마(§3.8)와 함께
```
[Source: 04-architecture/code-structure.md#1-저장소-트리]
(주 — 극초기 임계값의 site.yaml 계약 확장, 리드 확정 2026-09-02: **선결하지 않는다.** 이 스토리에서 실제로 필요해질 때 api-contracts §7 절차 — **문서 먼저 갱신 → 코드** — 로 옵션 필드를 가산 추가한다. `additionalProperties: false`를 뚫는 **임의 키 추가는 절대 금지** — 막히면 즉흥 확장이 아니라 §7 절차다. 상류 문서 갱신은 리드·James 경유.)

## Testing Requirements — testing_requirements

- **단위 테스트**: derive 순수 함수 — **R-1·R-2·R-3·R-4·R-5·R-6·R-7·R-8·R-10 각각 최소 1케이스** + 골든 파일. **R-9(slug·URL 불변)는 의도적 테스트 비대상** — 운영 수칙으로 검증 (git 이력 감사, build-plan §4). 침묵 누락이 아니라 선언된 제외다 (Matthias N-4) [Source: 04-architecture/build-plan.md#3-테스트-전략]
- **단위 테스트(추가)**: **홈 "최신 글" 카드에 전달되는 데이터에 score 필드 미존재 검사** — ArticleCard 계약과 동일한 데이터 레벨 강제 (ui-spec §1.1 "점수 비표시"의 자동화. W5.5 수동 검사까지 미루지 않는다 — Matthias N-2, 리드 가중)
- **통합 테스트**: checker E-110~115가 각각 그 코드로 실패하는 픽스처 / **E-302(해 넘김 미확정)·E-303(보드 진입/탈락) 각 1 픽스처가 build-report notices에 그 코드로 산출되는지** (Matthias N-4) / finalize 실행 → 스냅샷 생성·active_year 전환·이후 빌드에서 스냅샷 렌더 + 홈 §1.6 변형 확인
- **결정성**: 동일 픽스처 2회 빌드 해시 동일 (CI 게이트 — 이 스토리의 핵심 DoD)
- **E2E**: 없음 (수동 인수는 W5.5)

## Dev Notes (개발 노트)

- DoD: SS-3~8 인수조건 전부 + US-1·2·12·13 AC [Source: 04-architecture/build-plan.md#W5.2]
- 보드 교체·배지는 상태 저장 없는 도출 결과의 차이일 뿐 — "교체 이력" 연출은 1차 비범위 [Source: 04-architecture/service-sequences.md#B-3] [Source: 07-design/ui-spec.md#1.3]
- E-302(해 넘김 미확정)·E-303(보드 진입/탈락) 알림도 이 단계 checker/derive에서 산출 [Source: 04-architecture/exceptions.md#E-3xx]

### 이전 스토리 인텔리전스 (previous_story_intelligence)
- **착수 전 `story-w5-1-review-pipeline-kr.md`의 Dev Agent Record를 읽을 것.** 특히: ① `lib/score.ts`의 실제 인터페이스 (이 스토리의 정렬이 전적으로 의존) ② checker의 Finding/등급 반환 구조 (E-110~115를 같은 구조로 추가) ③ OG 렌더 함수 시그니처 (리스트형 템플릿 추가) ④ ListEntry에 공급할 CoverSet 파생 경로 ⑤ W5.1이 확립한 컴포넌트 스타일 관례 (BoardRow가 CoverImage·토큰을 재사용 — 재발명 금지).

### Git Intelligence (git_intelligence)
- 착수 시 최근 5커밋에서 W5.1의 실제 파일 배치·테스트 패턴을 확인. W5.1 위반 픽스처들이 계속 통과하는지 회귀 확인 후 시작.

### Latest Tech Information (latest_tech_information)
- 신규 외부 의존 없음 — 추가 리서치 불요. CI 해시 비교 시 dist 내 타임스탬프성 산출물(있다면)이 오탐을 만들 수 있음: 빌드 시각을 HTML에 넣지 않는 것이 사양이다 (R-10 — 빌드 시각의 유일한 소비처는 종료 월 판정. 보드 캡션의 "{날짜} 기준"은 최신 평론 발행일 등 저장소 유래 값으로 — **빌드 시계 사용 금지**) [Source: 04-architecture/exceptions.md#R-10].

### Project Context Reference (project_context_reference)
- [Source: 03-story-engineering/project-context-kr.md#4-결정성] — R-* 응축본
- [Source: 03-story-engineering/project-context-kr.md#7-빈-상태] · [#10-미결-3건]

---

## Dev Agent Record (구현 기록)

### 사용 모델(Agent Model Used)
_(구현 시 기입)_

### 디버그 로그 참조
_(구현 시 기입)_

### 완료 노트 목록(Completion Notes List)
- _(구현 시 기입 — 극초기 임계값의 최종 처리 방식·site.yaml 스키마 변경 여부 필수)_

### 파일 목록(File List)
<!-- ⚠️ 다음 스토리(W5.3)의 이전 스토리 인텔리전스 입력 — 반드시 채울 것 (D4) -->

| 파일 경로 | 상태 (신규/수정/삭제) |
|-----------|----------------------|
| _(구현 시 기입)_ | |
