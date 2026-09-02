# undernote — Data Contracts (api-contracts)

| | |
|---|---|
| 작성 | James · 2026-09-01 |
| 성격 | **이 제품에 런타임 REST API는 없다** (정적 사이트 — charter B5·A3). 이 문서는 그 대신 실제로 존재하는 세 종류의 기계가독 계약을 규정한다 |
| 규범성 | 이 문서가 스키마의 SSOT다. `data-model-erd.md`와 충돌 시 이 문서가 이긴다. 구현(Zod)·검증·테스트는 이 스키마를 기준으로 작성한다 |

**세 가지 계약:**

| § | 계약 | 실체 | 검증 주체 |
|---|---|---|---|
| §3 | **콘텐츠 프론트매터 스키마** | 원·User가 쓰는 파일의 필수/선택 필드 | 빌드 (SS-1) — 위반 = 빌드 실패 |
| §4 | **빌드 도출 데이터 구조** | 보드·10선·월말정산·인덱스·build-report가 소비/산출하는 형태 | derive 단위 테스트 + checker |
| §6 | **외부 API** | MusicBrainz·Cover Art Archive 조회 (편집 시점 한정 — A5·B6) | `album-add` 스크립트 |

표기: JSON Schema (draft 2020-12)를 YAML로 적는다. 구현체는 Zod로 옮기되
**의미가 달라지면 이 문서를 먼저 고친다.**

---

## 1. 공통 타입

```yaml
$defs:
  slug:            # 파일명·URL·상호 참조의 키. 발행 후 불변 (E-107)
    type: string
    pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
  score:           # 0.0~10.0 소수 1자리 (E-105) — 문자열 (ADR-0004)
    type: string
    pattern: "^(10\\.0|[0-9]\\.[0-9])$"
    # number가 아닌 이유 (ADR-0004): ① YAML 파서가 8.30을 8.3으로 접어
    # SS-3 인수조건("8.30 입력 = 실패")이 검출 불능이 되고 ② 부동소수 비교가
    # 정렬(R-1)을 오염시킨다. 연산·정렬은 로드 시 십분위 정수(83)로 변환해
    # 수행하고(lib/score 단일 파서), 표시는 저장 문자열 그대로 쓴다
  isodate:         # 발행일 등
    type: string
    pattern: "^\\d{4}-\\d{2}-\\d{2}$"
  releaseDate:     # 발매일 — 연도만도 허용 (SS-2: 연도가 귀속 키)
    type: string
    pattern: "^\\d{4}(-\\d{2}(-\\d{2})?)?$"
```

---

## 2. 검증 정책 (계약 위반의 3등급 — `exceptions.md`와 연동)

| 등급 | 의미 | 결과 |
|---|---|---|
| **실패 (E-1xx)** | 필수 필드·참조 무결성·범위 위반 | **빌드 실패 = 배포 없음.** 부분 발행 없음 (SS-1) |
| **경고 (E-2xx)** | 옵션 품질 문제 (커버 부재·미등록 태그·참조 불일치) | 빌드 진행 + build-report 기재 |
| **알림 (E-3xx)** | 원에게 전달할 정보 (보드 경계 동점 등) | 빌드 진행 + build-report의 원 전달 섹션 |

---

## 3. 콘텐츠 프론트매터 스키마

### 3.1 Album — `content/albums/<slug>.yaml`

```yaml
$id: undernote/album
type: object
required: [title, artists, release_date, bucket]
additionalProperties: false        # 도구 종속·임의 필드 금지 (이식성 — §5 요구 9)
properties:
  title:        { type: string, minLength: 1 }
  artists:      # artist slug 목록. 각 항목은 content/artists/<slug>.md 실존 (E-103)
    type: array
    items: { $ref: "#/$defs/slug" }
    minItems: 1
  release_date: { $ref: "#/$defs/releaseDate" }   # 연도 = 리스트 귀속 (R-3)
  bucket:       # 발매 연도 버킷 설정의 id 또는 "etc" (E-104)
    type: string
  tags:         # 태그 등록부 canonical slug. 미등록 → E-201 경고
    type: array
    items: { $ref: "#/$defs/slug" }
    default: []
  cover:        { type: string }                   # public/covers/ 내 경로. 부재 → E-202
  cover_source: { type: string }                   # 출처 기록 — ADR-0008 §3 (출처 명시)
  listen_links: # 수기 오버라이드. 있으면 자동 검색형 링크보다 우선 (SS-13)
    type: array
    items:
      type: object
      required: [service, url]
      additionalProperties: false
      properties:
        service: { enum: [spotify, apple-music, youtube-music, other] }
        url:     { type: string, format: uri }
  mbid:         { type: string }                   # MusicBrainz release-group MBID
  label:        { type: string }
```

### 3.2 Review — `content/reviews/<album-slug>.md` (프론트매터)

```yaml
$id: undernote/review
type: object
required: [album, score, date, editorial_check]
additionalProperties: false
properties:
  album:           { $ref: "#/$defs/slug" }   # 실존 앨범 (E-102) + 파일명 일치 (E-108)
  score:           { $ref: "#/$defs/score" }
  date:            { $ref: "#/$defs/isodate" }
  editorial_check: { const: true }            # "안 들으면 손해" — false·부재 = E-106 빌드 실패
# 본문(Markdown)은 비어 있으면 안 됨 (E-101) — 스키마 밖, checker가 검사
```

### 3.3 Story — `content/stories/<slug>.md` (프론트매터)

```yaml
$id: undernote/story
type: object
required: [title, date]
additionalProperties: false
properties:
  title:  { type: string, minLength: 1 }
  date:   { $ref: "#/$defs/isodate" }
  albums: # 참조 목록. 빈 배열 허용하되 E-203 경고 (SS-1)
    type: array
    default: []
    items:
      oneOf:
        - type: object            # 등록된 앨범 참조 — 링크 생성 대상
          required: [ref]
          additionalProperties: false
          properties:
            ref:  { $ref: "#/$defs/slug" }   # 실존 안 하면 E-204 경고 (오타 탐지)
            role: { enum: [lead, follow] }   # 계보 축 — 옵션 (시안 확정 전)
        - type: object            # 미등록 앨범 — 링크 없는 텍스트 렌더 (SS-9)
          required: [text]
          additionalProperties: false
          properties:
            text:   { type: string, minLength: 1 }
            artist: { type: string }
            role:   { enum: [lead, follow] }
  tags:
    type: array
    items: { $ref: "#/$defs/slug" }
    default: []
```

### 3.4 Artist — `content/artists/<slug>.md` (프론트매터)

```yaml
$id: undernote/artist
type: object
required: [name]
additionalProperties: false
properties:
  name: { type: string, minLength: 1 }   # 표기명. 본문 = 소개글 (빈 본문 허용 — US-14)
```

### 3.5 GenresConfig — `config/genres.yaml` (연도 블록 — D1)

```yaml
$id: undernote/genres-config
type: object
required: [years]
additionalProperties: false
properties:
  years:
    type: array
    minItems: 1
    items:
      type: object
      required: [year, buckets]
      additionalProperties: false
      properties:
        year: { type: integer, minimum: 2026 }
        buckets:
          type: array
          minItems: 1
          items:
            type: object
            required: [id, label, order]
            additionalProperties: false
            properties:
              id:    { $ref: "#/$defs/slug" }   # "etc"는 예약어 — 설정에 넣으면 E-109
              label: { type: string }
              order: { type: integer }          # 보드 지면의 버킷 표시 순서
        min_reviews_to_publish: { type: integer, default: 3 }   # 연말 성립 규칙 (D1)
# 과거 연도 블록 수정 금지 (R-8 — 운영 수칙). 이듬해 변경은 새 연도 블록 추가로
```

### 3.6 TagRegistry — `config/tags.yaml`

```yaml
$id: undernote/tag-registry
type: object
required: [tags]
properties:
  tags:
    type: array
    items:
      type: object
      required: [slug, label]
      additionalProperties: false
      properties:
        slug:    { $ref: "#/$defs/slug" }        # canonical — 콘텐츠는 이 값만 저장
        label:   { type: string }
        aliases: { type: array, items: { type: string }, default: [] }
```

### 3.7 Snapshot — `content/snapshots/<year>.md` (프론트매터 · finalize가 생성, 수동 편집 금지)

```yaml
$id: undernote/snapshot
type: object
required: [year, finalized_at, top10, buckets]
additionalProperties: false
properties:
  year:         { type: integer }
  finalized_at: { $ref: "#/$defs/isodate" }
  top10:
    type: array
    maxItems: 10                    # 평론 10편 미만 해는 있는 만큼 (R-6)
    items:
      type: object
      required: [rank, album, title, artists_label, score]
      properties:
        rank:          { type: integer, minimum: 1, maximum: 10 }
        album:         { $ref: "#/$defs/slug" }   # 평론 페이지 실존 검사 대상 (E-110)
        title:         { type: string }           # 동결 표기 — 이후 앨범 파일 변경과 무관
        artists_label: { type: string }
        score:         { $ref: "#/$defs/score" }  # 동결 점수 — 이후 수정 반영 안 함 (SS-6)
  buckets:
    type: array
    items:
      type: object
      required: [id, label, published]
      properties:
        id:        { type: string }
        label:     { type: string }
        published: { type: boolean }              # false = 성립 규칙 미달로 미발행 (D1)
        winner:    { $ref: "#/$defs/slug" }       # published=true면 필수
        nominees:                                 # winner 포함 최대 5, 동결 순위
          type: array
          maxItems: 5
          items:
            type: object
            required: [album, title, artists_label, score]
            properties:
              album:         { $ref: "#/$defs/slug" }
              title:         { type: string }
              artists_label: { type: string }
              score:         { $ref: "#/$defs/score" }
# 본문(Markdown) = 원의 서문 (US-13 — 연말에 원이 쓰는 유일한 추가물)
```

### 3.8 SiteConfig — `config/site.yaml`

```yaml
$id: undernote/site-config
type: object
required: [site_name, base_url, active_year]
additionalProperties: false
properties:
  site_name:    { type: string }                  # 이름 미확정 — 원 보류 중 (charter §9)
  base_url:     { type: string, format: uri }
  active_year:  { type: integer }                 # 진행형 보드·10선 대상 연도. finalize가 +1
  og_use_cover: { type: boolean, default: true }  # 커버의 OG 카드 사용 킬스위치 (ADR-0008 §5)
  placeholder_cover: { type: string }             # 커버 부재 시 대체 이미지 경로
  listen_link_patterns:                           # §6.3 검색형 패턴 오버라이드 (옵션 — 부재 시 §6.3 기본값)
    type: object
    additionalProperties: { type: string }        # service → urlTemplate ({q} 치환)
  early_stage_threshold: { type: integer, default: 6 }  # 홈 극초기 변형 전환 임계 (ui-spec §1.5)
  goatcounter_code: { type: string, pattern: "^[a-z0-9-]+$" }  # 옵션 — GoatCounter 사이트 코드. 부재 = 계측 미설치
```

> **`early_stage_threshold` 가산 (W5.2, 2026-09-02 — Andrew 요청 · 리드 Paul 승인).**
> ui-spec §1.5는 "노미네이트 총수 ≥6이면 일반형"을 규정하고 스토리 AC12는 이 시안값을
> **하드코딩하지 말고 설정으로 뺄 것**을 요구한다. 옵션 + 기본값 6이므로 기존
> `site.yaml` 무수정으로 하위 호환하며, §7의 "필드 추가는 하위 호환(옵션으로 추가)"에
> 해당해 ADR 갱신은 불요하다. `additionalProperties: false` 위반이 아닌 정식 가산이다.
>
> Andrew가 임의 키를 넣지 않고 §7 절차(문서 먼저 → Zod 반영)를 따랐다 — W3 게이트에서
> 확정한 "임의 키 추가 금지" 규칙이 실제로 작동한 사례다.

> ### `goatcounter_code` 가산 (W5.5, 2026-09-02 — Andrew 요청 · 리드 Paul 승인)
>
> 계측 도구를 **GoatCounter**로 확정한다(무료 · 쿠키 0 · GDPR 고지 불요 · 스크립트 1개).
> **리퍼러로 평론↔이야기 이동률을 측정**할 수 있어 charter §3 체류 지표의 실측 수단이 된다.
> GitHub Pages에는 내장 분석이 없음이 확인돼 후보에서 소멸했다.
>
> **의미론:** 값이 있으면 Base 레이아웃이 스니펫을 **정확히 1개** 출력하고, 부재 시 **0개**다.
> 패턴은 GoatCounter 서브도메인 코드 형식(소문자·숫자·하이픈).
>
> ⚠️ **"클라이언트 JS 0" 약속과의 관계 — 의식적 예외로 기록한다.**
> ADR-0002 요구 2와 Jonnathan 확정은 *전 지면 정적 HTML+CSS, 클라이언트 JS 0* 이다.
> 계측을 켜면 **async 스크립트 1개가 들어간다.** 이는 위반이 아니라 **옵트인 예외**이며,
> 정확히는 다음과 같이 읽어야 한다:
>
> > **기본값은 JS 0. 계측을 명시 활성화한 경우에만 async 스크립트 1개.**
>
> 대안은 측정을 포기하는 것인데, charter §3이 유입·체류를 실측하도록 요구하고 성능 예산
> 재설정(1차 공개 수용분)도 이 데이터에 의존한다. **측정 없이는 예산 재검토가 불가능하다.**
> W6에서 이 예외가 "약속 위반"으로 오인되지 않도록 여기 남긴다.
>
> **구현 주의:** Andrew 명세의 `src="//gc.zgo.at/count.js"`는 **프로토콜 상대 URL**이다.
> 이 사이트는 HTTPS 전용이므로 `https://`를 명시할 것 — 프로토콜 상대 URL은 현재 권장되지
> 않으며 혼합 콘텐츠 판정을 복잡하게 만든다.

---

## 4. 빌드 도출 데이터 구조 (derive 계층의 출력 계약)

페이지 템플릿과 checker·테스트가 소비한다. 페이지는 이 구조를 **가공 없이**
렌더한다 (판단 로직의 템플릿 침투 금지 — `design-patterns.md` P1).

```yaml
# 4.1 Board — 버킷별 노미네이트 (SS-4). activeYear 한정
Board:
  type: object
  required: [year, buckets]
  properties:
    year: { type: integer }
    buckets:
      type: array        # bucket-config의 order 순
      items:
        type: object
        required: [id, label, entries]
        properties:
          id: { type: string }
          label: { type: string }
          entries:       # 0~5개, R-1 정렬 (점수 desc → 발행일 asc → slug asc)
            type: array
            maxItems: 5
            items: { $ref: "#/$defs/ListEntry" }

# 4.2 Top10Progressive — 진행형 10선 (SS-5). etc 버킷 포함, 당해 발매만
Top10Progressive:
  type: object
  required: [year, entries]
  properties:
    year:    { type: integer }
    entries: { type: array, maxItems: 10, items: { $ref: "#/$defs/ListEntry" } }

# 4.3 MonthlyRecap — 월말정산 (SS-7). 발행월 귀속, 발매 연도 무관 (R-3)
MonthlyRecap:
  type: object
  required: [month, entries]      # month: "YYYY-MM". entries ≥1 (0이면 페이지 자체 미생성)
  properties:
    month:   { type: string, pattern: "^\\d{4}-\\d{2}$" }
    entries: { type: array, minItems: 1, items: { $ref: "#/$defs/ListEntry" } }

# 공통 리스트 항목 — "전 항목이 평론으로 연결"의 단위 (SS-8 검사 대상)
ListEntry:
  type: object
  required: [album, title, artists_label, score, review_url]
  properties:
    album:         { $ref: "#/$defs/slug" }
    title:         { type: string }
    artists_label: { type: string }     # "아티스트A, 아티스트B" 표시 문자열
    score:         { $ref: "#/$defs/score" }
    review_url:    { type: string }     # 실존 평론 페이지 — 없으면 도출 불가 (정의상)
    bucket:        { type: string }
    cover:         { $ref: "#/$defs/CoverSet" }   # null 허용 — 렌더가 플레이스홀더 대체 (E-202)

# 커버 파생 세트 — 원본 저장 상한 640px에서 빌드가 생성 (ADR-0008 §2 · Jonnathan 합의 96/320/640)
CoverSet:
  type: [object, "null"]
  required: [w96, w320, w640, alt]
  properties:
    w96:  { type: string }    # 보드 행 썸네일 (2x 밀도 기준)
    w320: { type: string }    # 카드
    w640: { type: string }    # 평론 히어로 · OG 합성 원료
    alt:  { type: string }    # "앨범명 — 아티스트 앨범 커버" (ADR-0008 §3)

# 4.4 ArchiveIndex — 4축 인덱스 (SS-11). 점수 없음 (D2 — 탐색 지면 비표시)
ArchiveIndex:
  type: object
  properties:
    by_year:    { type: object }   # 발행 연도 → ArchiveItem[] (R-3: 아카이브는 발행 기준)
    by_bucket:  { type: object }   # bucket id("etc" 포함) → ArchiveItem[]
    by_tag:     { type: object }   # tag slug → ArchiveItem[]
    by_artist:  { type: object }   # artist slug → ArchiveItem[]
ArchiveItem:
  type: object
  required: [type, url, title, date]   # type: review | story | artist-intro. score 필드 없음
  properties:
    type:  { enum: [review, story, artist-intro] }
    url:   { type: string }
    title: { type: string }
    date:  { $ref: "#/$defs/isodate" }
```

> ### ⚠️ 계약 결함 해소 — `artist-intro`는 방출하지 않는다 (W5.3, 2026-09-02)
>
> **결함:** `type` enum은 `artist-intro`를 허용하는데 `date`가 `required`다.
> **아티스트에겐 발행일이 없다**(`api-contracts` §3.4 — 본문=소개글, 빈 본문 허용).
> 계약이 충족 불가능한 것을 요구한다.
>
> **해소 (Andrew 제안 · 리드 Paul 승인):** `artist-intro`를 `ArchiveItem`으로 **방출하지
> 않는다.** 대안은 날짜를 지어내는 것뿐이며(첫 평론일 등), 이 프로젝트는 없는 값을
> 만들지 않는다.
>
> **아티스트 페이지 도달성은 `by_artist` 축 자체가 보장한다** — 축의 **키 집합이 곧
> 아티스트 목록**이므로 `/archive/`에서 링크가 렌더된다. `ArchiveItem` 항목이 아니라
> 축 키로 도달하는 구조다.
>
> **귀결 — E-113의 실질 대상은 "무참조 아티스트"다.** 평론·이야기는 발행일이 있어
> `by_year`에 정의상 편입되므로 구조적으로 고아가 될 수 없다. E-113은 오늘 발화하지
> 않지만 **인덱스 빌더가 나중에 무언가를 걸러내기 시작하면 잡는 안전망**이므로 유지한다.
>
> `type` enum에서 `artist-intro`를 제거하지 않고 남겨 둔다 — 향후 아티스트에게 발행일
> 개념이 생기면(예: 소개글 작성일 도입) 계약 변경 없이 켤 수 있다. **현재는 미사용이다.**
```yaml
# 4.5 Backlinks — 평론 페이지의 "이 앨범이 등장하는 이야기" (SS-10 폴백 사슬)
Backlinks:
  type: object                    # album slug → 결과
  additionalProperties:
    type: object
    required: [mode, stories]
    properties:
      mode:    { enum: [direct, tag, bucket, none] }   # none = 영역 미표시 (US-3 AC3)
      stories: { type: array, items: { type: object, required: [url, title, date] } }

# 4.6 BuildReport — 경고·알림 산출물 (원 전달용 — SS-3). 파일: reports/build-report.md + .json
BuildReport:
  type: object
  required: [built_at, failures, warnings, notices]
  properties:
    built_at: { type: string }
    failures: { type: array, items: { $ref: "#/$defs/Finding" } }   # 있으면 배포 중단
    warnings: { type: array, items: { $ref: "#/$defs/Finding" } }   # E-2xx
    notices:  { type: array, items: { $ref: "#/$defs/Finding" } }   # E-3xx — 원 전달 섹션
Finding:
  type: object
  required: [code, message, file]
  properties:
    code:    { type: string, pattern: "^E-\\d{3}$" }
    message: { type: string }     # 한국어, 무엇을 어떻게 고치는지 포함
    file:    { type: string }
```

---

## 5. OG 메타 계약 (SS-15 · CF-11)

전 공개 페이지가 아래 3요소를 **반드시** 보유한다. 페이지 유형별 내용:

| 페이지 유형 | og:title | og:description | og:image |
|---|---|---|---|
| 평론 | `앨범명 — 아티스트` | 발췌 (본문 첫 문단, 점수 문자열 포함 금지) | 커버 카드 (**점수 비표시** — D2). `og_use_cover=false`거나 커버 부재 시 기본 카드 |
| 10선·보드·월말정산 | 리스트 제목 (`2026 올해의 앨범 — 현재 노미네이트` 등) | 리스트 성격 요약 | 리스트 카드 — 순위·앨범·아티스트만 |
| 이야기·아티스트·기타 | 글 제목 | 발췌 | 기본형 카드 (제목 + 매체명) |

- **카드·OG 메타 전 유형 점수 비표시** (ui-spec §11 확정 2026-09-01 — 점수는 간판이 아니라 인프라, D2). 위반 = E-115 빌드 실패.
- 추가로 `og:type`·`og:url`·`twitter:card`(summary_large_image) 포함.
- **검증:** checker가 렌더 산출 HTML에서 3요소 존재를 전수 확인 (부재 = E-111 실패 —
  "원 노동 0" 약속은 카드가 항상 완성돼 있어야 성립한다).
- 카드 이미지 생성 방식은 [ADR-0010](adr/ADR-0010-og-card-generation.md). 시각 템플릿은
  Jonnathan 시안 확정 후 W5 구현 — 이 계약(3요소 + 점수 규칙)은 시안과 무관하게 고정.

---

## 6. 외부 API 계약 (편집 시점 한정 — 배포 사이트 호출 0)

### 6.1 MusicBrainz (메타데이터 조회 — `album-add`)

| 항목 | 값 | 출처 |
|---|---|---|
| 엔드포인트 | `https://musicbrainz.org/ws/2/release-group?query=...&fmt=json` (검색) → `release-group/<mbid>?inc=artist-credits` (상세) | MB API 문서 (John이 W1에서 확인: https://musicbrainz.org/doc/MusicBrainz_API) |
| 인증 | 읽기 불필요 | John W1 확인 |
| 레이트리밋 | **초당 1회** — 스크립트에 1100ms 간격 강제 | John W1 확인 |
| 필수 헤더 | 의미 있는 `User-Agent` (앱명/버전 + 연락처) — MB 정책 | MB 문서. 정확한 권장 형식은 W5 구현 시 재확인 |
| 취득 필드 → 매핑 | `title`→참고(원 표기 우선) · `first-release-date`→`release_date` · `artist-credit`→`artists` 후보 · `id`→`mbid` · 레이블은 release 레벨 조회 필요(옵션) | |
| 실패 처리 | 미적중·타임아웃·5xx → **수기 폴백 프롬프트** (E-401~403, 빌드와 무관 — 편집 시점 도구) | SS-2 |
| 신보 지연 (B6) | 검색 0건이어도 오류 아님 — 수기 입력 후 `mbid` 추후 연결 허용 | SS-2 예외 |

### 6.2 Cover Art Archive (커버 확보 — `album-add`)

| 항목 | 값 |
|---|---|
| 엔드포인트 | `https://coverartarchive.org/release-group/<mbid>/front-500` (500px 크기 — 실제 제공 크기 옵션은 W5 구현 시 확인) |
| 라이선스 주의 | CAA 이미지는 권리가 원권리자에게 있다 — 사용 근거는 ADR-0008 (인용·비평 목적), CAA는 전송 수단일 뿐 |
| 처리 | 다운로드 → **장변 640px 이하로 축소 재인코딩** (ADR-0008 §2 — 법적·성능 예산) → `public/covers/<slug>.jpg` 저장 + `cover_source` 기록. 원본 해상도 보관·재배포 금지 (ADR-0008) |
| 실패 처리 | 404(커버 없음) → 수기 확보(레이블 보도자료 등) 또는 플레이스홀더 (E-202 경고) |

### 6.3 스트리밍 아웃링크 (CF-10 · SS-13 — API 아님, URL 패턴)

자동 생성은 **검색형 링크**다 (Joshua 허용 명시). API 연동·정확 매칭은
비범위 — 비용(토큰 관리·매칭 오류) 대비 가치가 없다.

```yaml
listen_link_patterns:            # {q} = URL 인코딩된 "아티스트명 앨범명"
  youtube-music: "https://music.youtube.com/search?q={q}"
  spotify:       "https://open.spotify.com/search/{q}/albums"
  apple-music:   "https://music.apple.com/kr/search?term={q}"
# 규칙: album.listen_links(수기)가 있으면 해당 서비스의 자동 링크를 대체 (SS-13)
# 패턴 유효성은 시점 민감 — W5 구현 시 실동작 확인, 깨진 서비스는 제거
```

---

## 7. 계약 변경 규칙 (버저닝)

- 스키마 변경은 **이 문서 수정 → Zod 반영 → 기존 콘텐츠 전량 재검증 통과** 순.
  빌드가 전량 검증이므로 마이그레이션 스크립트는 콘텐츠 수십 편 규모에선
  일회성 코드모드로 충분하다.
- 필드 추가는 하위 호환(옵션으로 추가). 필수 승격·의미 변경은 ADR 갱신 필수.
- `additionalProperties: false`가 미지 필드를 즉시 잡아낸다 — 오타 필드가
  조용히 무시되는 사고(옵션 필드의 침묵 실패)를 계약이 차단한다.
