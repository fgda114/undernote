# undernote — 데이터 모델 (ERD · 접근 패턴 · 성장 가정)

| | |
|---|---|
| 작성 | James (역할 #4 · 아키텍트) · 2026-09-01 |
| 입력 | Joshua `core-features.md` §5 (v1.1) · charter §1·§5 · ADR-0003·0004·0005·0007 |
| 저장 실체 | **DB 없음.** 전 엔터티 = git 저장소 내 Markdown/YAML/JSON 파일 (ADR-0001). "테이블"은 파일 컬렉션이다 |
| 기계가독 스키마 | `api-contracts.md` (JSON Schema — 그쪽이 규범, 본 문서는 관계·근거) |

---

## 1. ERD

저장 엔터티(실선 8종)와 빌드 파생물(§4 — 저장하지 않음)을 구분한다.

```mermaid
erDiagram
    ALBUM ||--o| REVIEW : "1:1 (평론은 앨범당 최대 1편 — 파일명 강제 + E-108)"
    ALBUM }o--|{ ARTIST : "artists[] 참조 (복수 가능)"
    STORY }o--o{ ALBUM : "albums[] 참조 (role 옵션: lead/follow)"
    ALBUM }o--|| GENRE_YEAR : "bucket ∈ 발매연도 설정 (+ etc)"
    ALBUM }o--o{ TAG : "tags[] (등록부 정규화, 0~n)"
    STORY }o--o{ TAG : "tags[] (옵션)"
    SNAPSHOT }o--|{ REVIEW : "항목→평론 slug (SS-8 검사 대상)"
    SITE_CONFIG ||--o{ GENRE_YEAR : "active_year 지정"

    ALBUM {
        string slug PK "파일명 = {artist}-{album} kebab. User 확정"
        string title "앨범명"
        string_list artists FK "artist slug 목록 — 해석 실패 E-103"
        string release_date "YYYY[-MM[-DD]] — 연도만도 허용 (MB 지연·B6 대응, 연도 = 귀속 키)"
        string bucket "장르 버킷 slug 또는 etc"
        string_list tags "세부 태그 canonical slug"
        string cover "자체 호스팅 사본 경로 (옵션 — 부재 시 E-202)"
        json_list listen_links "수기 오버라이드 {service,url} — 자동 검색형보다 우선 (옵션)"
        string cover_source "커버 출처 기록 (ADR-0008 §3)"
        string mbid "MusicBrainz release-group ID (옵션)"
        string label "레이블 (옵션 — 출처 명시용, ADR-0008)"
    }
    REVIEW {
        string album PK_FK "파일명 = ALBUM.slug (1:1 강제 · 불일치 E-108)"
        string score "정규식 검증 문자열 — 연산은 십분위 정수 (ADR-0004)"
        date date "발행일 YYYY-MM-DD (Asia/Seoul)"
        bool editorial_check "편집 체크: 안 들으면 손해인가 (USP-C) — true 필수 (E-106)"
        markdown body "본문"
    }
    STORY {
        string slug PK "파일명"
        string title
        date date
        json_list albums "각 항목 {ref|text, role?} — ref 미해석 E-204"
        string_list tags "옵션"
        markdown body
    }
    ARTIST {
        string slug PK "파일명. 첫 참조 시 스캐폴드 CLI가 생성"
        string name "표시명 — 유일한 정의처 (앨범에 중복 저장 금지)"
        markdown body "소개글 — 빈 본문 허용 = 소개 없는 집계 페이지 (SS-12)"
    }
    GENRE_YEAR {
        int year PK "genres.yaml 연도 블록"
        json_list buckets "{slug, label} 목록 — 과거 연도 블록 수정 금지"
        int minReviewsToPublish "연말 버킷 발행 최소 편수 (기본 3 — D1)"
    }
    TAG {
        string slug PK "tags.yaml canonical"
        string label
        string_list aliases "정규화 별칭"
    }
    SNAPSHOT {
        int year PK "snapshots/(year).md — 프론트매터 동결 + 본문 서문. 확정 후 불변 (ADR-0005)"
        date finalized_at "확정 시점 기록 (도출 입력 아님 — R-10)"
        json top10 "rank·album slug·score·표시필드 비정규화"
        json buckets "버킷별 노미네이트 5 + winner. 미발행 버킷은 사유와 함께 기록"
    }
    SITE_CONFIG {
        int active_year "홈 보드·진행형 리스트 기준 연도 (ADR-0005 — 시계 아닌 설정)"
        json listen_link_patterns "검색형 듣기 링크 패턴 오버라이드 (SS-13, 옵션)"
        bool og_use_cover "커버의 OG 카드 사용 킬스위치 (ADR-0008 §5)"
        string site_name
    }
```

파일 배치는 `code-structure.md`, 필드별 검증 규칙은 `api-contracts.md` + `exceptions.md`.

## 2. 모델링 결정 근거 (요약 — 상세는 ADR)

| 결정 | 근거 |
|---|---|
| 앨범 독립 엔터티 · 평론 1:1 | 평론 없는 앨범을 이야기가 참조(SS-9) · 소급 링크의 동일성 키 · ADR-0003 |
| 아티스트 = 참조 대상 파일, 표시명 단일 정의처 | 앨범마다 이름 중복 저장 시 표기 드리프트. 소개글 유무와 페이지 성립이 독립 (US-14 AC2) |
| 점수 문자열 + 십분위 정수 | 부동소수점 비교 오염 차단 — 정렬이 제품 약속 (ADR-0004) |
| 버킷 = 연도별 설정, 태그 = 등록부 | 장르 2층 분리 · 과거 리스트 고정 (ADR-0007, 과제 ①) |
| 리스트 비저장 + 연간 스냅샷 비정규화 | 도출 불변식 + 발표 시점 선언의 불변성 (ADR-0005) |
| `release_date` 유연 정밀도 (YYYY[-MM[-DD]]) | MB가 연도만 주는 앨범 실존(B6). 연도는 리스트 귀속에 필수, 월·일은 표시용 — 정밀도를 패턴으로 정직하게 허용 |
| 편집 체크 `editorial_check` | USP-C 기록 요구(SS-1). false인 평론은 발행 불가(E-106) — "실림 = 추천"의 데이터화 |

## 3. 접근 패턴 → 사전 계산 (이것이 이 모델의 역설계 원점)

런타임 쿼리는 존재하지 않는다. 전 접근 패턴을 빌드 타임에 사전 계산해 정적 페이지로 굽는다.

| # | 접근 패턴 (소비 지면) | 계산 (빌드 내 인메모리) | 근거 SS |
|---|---|---|---|
| P1 | 버킷별 당해 발매작 평론 점수 상위 5 (보드·홈) | reviews × albums 조인 → filter(releaseYear=activeYear, bucket≠etc) → group by bucket → sort | SS-4 |
| P2 | 당해 발매작 평론 전체 상위 10 (진행형 10선) | 위 필터(etc 포함) → sort → take 10 | SS-5 |
| P3 | 월별 발행 평론 점수순 (월말정산) | group by month(date) → sort | SS-7 |
| P4 | 앨범 X를 참조하는 이야기 (평론 페이지 역링크) | stories.albums 역인덱스 Map<albumSlug, story[]> | SS-10 |
| P5 | 태그·버킷 일치 이야기 (사다리 폴백 ②③) | Map<tag, story[]> · Map<bucket, story[]> | SS-10 |
| P6 | 아티스트별 전체 글 (아티스트 페이지) | Map<artistSlug, (review|story)[]> — 복수 아티스트 전원 집계 | SS-12 |
| P7 | 연도·버킷·태그·아티스트 아카이브 축 | 4개 역인덱스 — 전 글 유형 포함, 점수 필드 미전달(D2) | SS-11 |
| P8 | 보드 상태 → 평론 배지 | P1 결과의 역방향 Map<albumSlug, {bucket, rank}> | SS-4 |
| P9 | 리스트 항목 → 평론 실존 (무결성) | 전 리스트·스냅샷 항목의 slug 해석 검사 | SS-8 |

전부 O(n) 스캔 + 해시맵. n = 파일 수백 (아래 §5) — **인덱스 튜닝·증분 계산은 하지 않는다** (낭비).

## 4. 파생물 (저장 금지 목록)

보드 · 진행형 10선 · 월말정산 · 아카이브 인덱스 · 역링크 · 아티스트 집계 · 배지 · OG 카드.
이들이 파일로 커밋되어 있다면 그것은 버그다 (유일 예외: 확정 스냅샷 · OG 카드는 dist/ 산출물).

## 5. 성장 가정 · 카디널리티

| 엔터티 | 1년차 | 5년차 (외삽) | 근거 |
|---|---|---|---|
| 앨범·평론 | ~15–25 | ~75–125 | charter §1 역산표 (Q1 확정 전 범위) |
| 음악 이야기 | ~10 내외 | ~50 | 부차 코너 — 실측 전 추정치임을 명시 |
| 아티스트 | ~20–40 | ~150 | 앨범당 1~2명 |
| 총 파일 | < 150 | < 600 | 빌드 전량 재계산 유지 충분 |

핫키·경합 없음: **작성자 1(User) · 저장소 1 · 빌드 단일 프로세스.** 트랜잭션 경계 = git 커밋
(발행 1건 = 앨범+평론+커버 원자 커밋 — 부분 발행 없음 SS-1은 커밋 규약 + 빌드 검증 이중 방어).
격리 수준·잠금: 해당 없음 (동시 쓰기 경로가 존재하지 않는다). 이것은 결핍이 아니라 ADR-0001의 이득이다.

## 6. 시간·정렬 규칙 (결정성 — 규범은 exceptions.md §1)

- 모든 날짜 `YYYY-MM-DD`, 시간대 Asia/Seoul, 시각 미저장.
- 전 리스트 정렬 키: `(scoreTenths desc, review.date asc, album slug asc)` — 3차 키까지 고정해 완전 결정.
- 연도 귀속: 연간 리스트 = **발매 연도** / 월말정산 = **발행 월** / 아카이브 연도 축 = **발행 연도** (SS-5·7·11).

## 7. 마이그레이션 전략

- 스키마 버전 = `api-contracts.md`의 JSON Schema가 규범. 변경은 **가산적(additive) 우선** — 옵션 필드 추가는 무비용.
- 파괴적 변경 시: 콘텐츠 파일 전량을 1회성 codemod 스크립트로 변환 (n < 600 — 수 초). DB 마이그레이션 도구 불요.
- 이식(charter §5 유일 요구): 본문 Markdown + 메타 YAML은 그대로 타 도구로 이동 가능. 파생물은 재계산하면 되므로 이식 대상이 아니다.
