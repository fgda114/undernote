# undernote — Project Context (확정 헌법)

| | |
|---|---|
| 작성 | Matthew (역할 #17 · Story Engineer) · 2026-09-02 |
| 성격 | **W5 구현(Andrew 1인)의 팀 공통 기술 규칙.** 모든 스토리 파일이 이 문서를 `project_context_reference`로 참조한다. 스토리와 충돌 시 이 문서가 아니라 **상류 SSOT**(각 조항의 `[Source:]`)가 이긴다 — 이 문서는 응축본이다 |
| source_hash | `2768bb719646d116b9c6080098e5c7f2562da472193b029b7ef5f893f2cda427` (sha256 — 산출 방법은 말미 §12) |
| 전제 | Timothy의 초안(`09-docs/project-context-draft-kr.md`)은 존재하지 않아(해당 역할 미스폰) 본 문서를 신규 확정본으로 작성 |

---

## 1. 제품 한 문장과 불변식

> **"이 리스트의 모든 앨범에는 이미 평론이 씌어 있다."** [Source: 03-service-planning/usp.md#0-제품-한-문장]

- **불변식(USP-A):** 모든 리스트 지면(보드·10선·월말정산·확정 스냅샷)의 전 항목은 실존 평론 페이지로 연결된다. 위반 = **E-110 빌드 실패** (경고 아님). [Source: 03-service-planning/service-stories.md#SS-8] [Source: 04-architecture/exceptions.md#E-1xx]
- **런타임이 없다.** 서버·DB·API 0. 제품 로직 전부가 빌드 타임에 실행되고 독자는 CDN 위 정적 HTML만 만난다. [Source: 04-architecture/architecture-overview.md#0-형태를-결정한-세-가지-사실]
- **배포 사이트 ↔ 외부 API 호출 = 0.** MusicBrainz/CAA 조회는 편집 시점 CLI에만 존재한다. [Source: 04-architecture/adr/ADR-0006-musicbrainz-caa.md]

## 2. 스택 · 버전 정책

| 항목 | 값 | 근거 |
|---|---|---|
| SSG | **Astro 현행 메이저 7.x** (ADR-0002 Accepted — User 승인, 2026-09-01 버전 정정 개정) + Content Collections(Content Layer) + Zod 스키마 검증 | [Source: 04-architecture/adr/ADR-0002-ssg-astro.md] |
| 언어 | TypeScript 단일 npm 프로젝트 | [Source: 04-architecture/build-plan.md#1-인력-구성-판단] |
| 이미지 | astro:assets(sharp) — 커버 파생 96/320/640 | [Source: 04-architecture/adr/ADR-0002-ssg-astro.md] [Source: 04-architecture/api-contracts.md#4-빌드-도출-데이터-구조] |
| OG 카드 | satori + @resvg/resvg-js, 1200×630 PNG, 빌드 생성 | [Source: 04-architecture/adr/ADR-0010-og-card-generation.md] |
| 클라이언트 JS | **0** (유일 예외 후보: 쿠키리스 계측 스니펫 1개 — W5.5에서 선정) | [Source: 04-architecture/architecture-overview.md#6-관측-가능성] |
| 호스팅 | 정적 CDN — 후보 3종(Cloudflare Pages·Netlify·GitHub Pages) 무료 한도 **W5.0에서 실확인 후** 확정 | [Source: 04-architecture/adr/ADR-0009-hosting.md] |

> **해소됨 (2026-09-02): Astro 메이저 버전.** W3 최신기술 확인이 ADR-0002의 "Astro 5" 표기가 두 메이저 지연임을 발견 → 리드가 재확인(현행 안정 7.2.9) 후 **ADR-0002를 "Astro (현행 메이저 7.x)"로 개정**했다. 채택 근거(Content Collections + Zod 빌드 타임 검증)는 5→7 유지 — 프레임워크 선택이 아니라 버전 표기 정정. 로컬 환경 Node v24.14.0·npm 11.9.0 확인 완료(Astro 7의 Node 22 요건 충족 — 리드 검증). **W5.0에 남는 것: 정확한 마이너 핀 + Zod v4 breaking change 실확인**뿐이다. [Source: 04-architecture/adr/ADR-0002-ssg-astro.md]

- 신규 라이브러리 추가는 최소 원칙 + lockfile(`npm ci`) 고정. [Source: 04-architecture/architecture-overview.md#5-보안]

## 3. 점수 — 이 제품의 심장 규칙

1. **저장 = 문자열** `score: "8.3"`, 정규식 `^(10\.0|[0-9]\.[0-9])$`. **number로 저장하면 YAML 파서가 8.30을 8.3으로 접어 SS-3 인수조건("8.30 입력 = 실패")이 검출 불능이 된다.** [Source: 04-architecture/adr/ADR-0004-score-representation.md] [Source: 04-architecture/api-contracts.md#1-공통-타입]
2. **연산 = 십분위 정수** (`"8.3"` → 83). 파서는 `src/lib/score.ts` **한 곳뿐**. 부동소수 비교 금지. [Source: 04-architecture/adr/ADR-0004-score-representation.md]
3. **표시 = 저장 문자열 그대로.** 재포맷·반올림·패딩 금지. [Source: 07-design/design-system/components.md#공통-계약]
4. **표시 위치 매트릭스 (D2):** 리스트 지면 = 표시+점수 내림차순 / 평론 페이지 = 말미 평결 블록만(히어로 금지) / 탐색 지면(아카이브·최신 글·아티스트) = 비표시(데이터 필드 자체 미전달) / **OG 카드·메타 = 전 유형 비표시(E-115 빌드 실패)**. [Source: 03-service-planning/core-features.md#D2] [Source: 04-architecture/api-contracts.md#5-og-메타-계약]

## 4. 결정성 — "같은 저장소 = 같은 사이트"

- **R-1 전순서 3키:** `score desc → review.date asc → album slug asc`. 문자열 비교는 코드포인트 고정(로케일 collation 금지). [Source: 04-architecture/exceptions.md#R-1]
- **R-3 귀속 2축 공존(사양이다):** 연간 리스트 = **발매 연도** / 아카이브 연도 축 = **발행 연도** / 월말정산 = **발행 월**(구반 포함). "2025 발매 앨범의 2026 평론" = 2026 리스트 ❌ · 2026 아카이브 ✅ · 발행월 정산 ✅. [Source: 04-architecture/exceptions.md#R-3]
- **R-10 시간대:** 모든 날짜 귀속·종료 월 판정 = **Asia/Seoul 고정** (CI가 UTC여도 동일 결과 — 빌드 설정에 TZ 명시). 빌드 시각의 유일한 소비처 = 월말정산 종료 월 판정. [Source: 04-architecture/exceptions.md#R-10]
- **CI 게이트:** 동일 입력 2회 빌드 → 산출 해시 동일. [Source: 04-architecture/build-plan.md#3-테스트-전략]
- **R-2/R-5 수정 전파:** 점수 수정은 전 지면 재도출(과거 월말정산 포함), **확정 연간 스냅샷만 불변**. [Source: 04-architecture/exceptions.md#R-2]
- **R-9 slug·URL 불변** (발행 후 변경 금지 — 공유 링크 사망 방지). [Source: 04-architecture/exceptions.md#R-9]

## 5. 레이어 경계 (위반 = 코드 리뷰 반려)

```
content/·config/ → src/lib/schema(Zod 단일 정의) → src/lib/(derive·checker) → pages/·components/
     데이터           계약 검증 (유일한 정의)         판단 (전부)               렌더 (판단 0)
```
0. **Zod 스키마는 `src/lib/schema/`에 단일 정의한다** (순수 모듈·한국어 메시지). `content.config.ts`는 그것을 감싸기만 하고, checker의 사전 전량 패스(B-1)도 같은 모듈을 소비한다 — code-structure의 "유일한 구현체"는 "유일한 정의"로 읽는다 (리드 확정 2026-09-02, W3 게이트 Thomas N-2. 두 곳 정의는 반드시 갈라진다). [Source: 04-architecture/code-structure.md#3-레이어-경계]
1. `src/lib/`는 Astro를 import하지 않는다 (순수 TS — 프레임워크 없이 테스트).
2. `pages/`는 판단하지 않는다 — 정렬·필터·귀속·폴백 선택이 템플릿에 보이면 반려(P1). 템플릿 조건문은 "빈 배열 → 영역 미표시"(R-4)까지만.
3. `scripts/`는 빌드에 관여하지 않는다 — 파일 생성만. 빌드는 저장소 상태만 읽는다.
4. `content/`에 도구 종속 문법 금지 (MDX 본문 금지 — P6 이식성).
5. fetch는 `src/lib/mb/`에만, 호출자는 `scripts/`뿐.
[Source: 04-architecture/code-structure.md#3-레이어-경계]

## 6. 검증 3등급과 빌드 게이트

| 등급 | 의미 | 결과 |
|---|---|---|
| E-1xx (실패) | 필수 필드·참조 무결성·범위·링크율·고아·OG | **빌드 실패 = 배포 없음.** 전부 모아 한 번에 보고 |
| E-2xx (경고) | 커버 부재·미등록 태그·참조 불일치·듣기 링크 부재 | 진행 + build-report 기재 |
| E-3xx (알림) | 경계 동점·확정 필요·보드 진입/탈락 | 진행 + build-report 원 전달 섹션 |
[Source: 04-architecture/api-contracts.md#2-검증-정책] [Source: 04-architecture/exceptions.md#2부-오류-코드-전수]

- 오류 메시지는 **한국어 + 파일 경로 + 무엇을 어떻게 고치는지**까지. 시스템 로그 어휘 금지. [Source: 04-architecture/exceptions.md#2부-오류-코드-전수] [Source: 07-design/ui-spec.md#10-마이크로카피-표]
- 새 오류 코드는 `exceptions.md`에 먼저 (SSOT). [Source: 04-architecture/code-structure.md#4-명명-규칙]

## 7. 빈 상태 — "가짜로 채우지도, 사과하지도 않는다" (R-4)

버킷 5편 미만 = 있는 만큼만 / 월 평론 0 = 페이지 미생성 / 역링크 폴백 전부 0 = 영역 미표시 / 소개글 없는 아티스트 = 집계만 / 조건부 컴포넌트는 "빈 채 표시"가 아니라 **미출력**. [Source: 04-architecture/exceptions.md#R-4] [Source: 07-design/design-system/components.md#공통-계약]

## 8. 원의 접점 상한 (D7) — 설계 제약

원이 평론 1편에 제공하는 것: **글 + 앨범/아티스트명 + 장르 버킷 1개 + 점수 + "안 들으면 손해" 체크 1문항** (+옵션 세부 태그). 그 이상을 원에게 요구하는 구현은 잘못된 구현이다. 메타데이터·커버·링크·리스트·카드·배포는 전부 시스템 또는 User의 일. [Source: 03-service-planning/core-features.md#D7]

## 9. 명명 · 커밋 규약

- slug: `kebab-case` ASCII (E-107). 앨범 slug = `<artist>-<album>` 요약형(User 확정). 평론 파일명 = 앨범 slug (1:1, E-108). 파일명 = slug = URL 조각 삼자 일치. [Source: 04-architecture/code-structure.md#4-명명-규칙]
- 발행 1건 = 원자 커밋 1개 (`publish: <slug>` 관례 — 앨범+평론+커버 함께). [Source: 04-architecture/build-plan.md#4-운영-수칙]
- 라우트 8종: `/` · `/reviews/{slug}/` · `/stories/{slug}/` · `/artists/{slug}/` · `/list/{year}/` · `/list/{year}/{mm}/` · `/archive/…` · `/about/` (+404). [Source: 04-architecture/code-structure.md#2-url-설계]

## 10. 미결 3건 + 디자인 대기 1건 — 전부 비차단 (스토리를 미루는 사유가 아니다)

| 미결 | 흡수 위치 | 무응답 시 기본값 |
|---|---|---|
| Q1 장르 버킷 수 | `config/genres.yaml` 연도 블록 (데이터) | B안 3버킷으로 구현, 열 수는 CSS `auto-fit` — 코드 수정 없이 증감 |
| Q2 노미네이트 자동/수동 | 도출 방식 — 보드 UI 동일 | A안 자동 (D4 기본안) |
| Q3 월간 리스트 성격 | 월말정산(SS-7) 상수 | A안 월말정산 |
| 계보 A/B/C 시안 | `role` 옵션 필드 + LineageBlock 예비 계약 | **안 A** (AlbumBox만 — 원 노동 0) |
| 사이트 이름 | `config/site.yaml#site_name` 문자열 1곳 | `undernote` |
[Source: 03-service-planning/open-decisions.md] [Source: 07-design/design-handoff.md#2-원-결정-대기-항목] [Source: 04-architecture/adr/README.md]

## 11. 안티패턴 (요청되어도 만들지 않는다)

파생물(보드·인덱스·역링크·배지) 파일 커밋 · 템플릿 내 판단 로직 · 리스트 수동 관리 · 증분 캐시(1차) · 재시도 루프/서킷브레이커(편집 도구엔 사람이 있다 — P9) · 계정/DB 대비 추상화 · 클라이언트 검색/hydration · CMS/관리자 UI(1차) · 점수 float 연산 · 스냅샷 수동 편집 · 과거 연도 버킷 설정 수정 · SEO 투자(기본 위생만) · 사이트→SNS 자동 포스팅. [Source: 04-architecture/design-patterns.md#배제한-패턴] [Source: 03-service-planning/core-features.md#3-non-goals]

## 12. source_hash 산출 방법 (D3 신선도 — 재검증 절차) — v2, eol 비의존

**해싱 대상 표현을 명시한다:** ① 내용 = **HEAD 커밋에 저장된 저장소 정규화 내용**(`git show HEAD:<path>` — `.gitattributes`의 `text=auto`로 LF 통일). 작업 트리 `cat`은 **금지** — Windows CRLF 체크아웃에서 다른 값이 나온다 (머신·`core.autocrlf` 의존, Matthias C-1/N-0 실측). `git hash-object`도 **금지** — blob 헤더가 섞이는 다른 스킴이다. ② 파일 목록·순서 = 아래 패턴을 `git ls-files`로 확장해 **경로 바이트 사전순**(`LC_ALL=C sort`). ③ 연결 후 sha256 1회.

```bash
# 저장소 루트에서 (Git Bash)
git ls-files '.agent-team/00-plan/charter.md' \
  '.agent-team/03-service-planning/*.md' \
  '.agent-team/04-architecture/*.md' '.agent-team/04-architecture/adr/*.md' \
  '.agent-team/07-design/*.md' '.agent-team/07-design/design-system/*.md' \
  | LC_ALL=C sort | while read f; do git show "HEAD:$f"; done | sha256sum
```
(2026-09-02 기준 31파일. 참고 실행값 — HEAD `1f79dce`에서 `2768bb71…cda427`, 2회 실행 동일 확인.)

이 값이 스토리 파일 상단의 `source_hash`와 다르면 **상류가 변경된 것**이다 — 해당 스토리는 stale이며 W3 재컴파일 대상이다 (구현 착수 금지, 리드 보고). 미커밋 상류 수정은 이 절차에 안 잡히므로, 상류 문서 수정은 **커밋 후** 재검증한다.

> **경과 주:** 스토리 frontmatter의 현 선언값은 구절차(작업 트리 기준) 값이다. Thomas 리뷰 반영이 끝나는 대로 **본 v2 절차로 최종 1회 재산출해 전 7파일에 스탬프**한다 (게이트 판정 전 완료 — readiness-report에 최종값 기록).
