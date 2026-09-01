# undernote — Code Structure (저장소 트리 · 레이어 경계 · 명명)

| | |
|---|---|
| 작성 | James · 2026-09-01 |
| 전제 | 단일 저장소 · 단일 npm 프로젝트 · Astro 5 (ADR-0002, User 확인 대상) |
| 규칙 | W5는 이 트리대로 스캐폴드한다. 구조 변경은 이 문서 갱신과 함께 |

---

## 1. 저장소 트리

```
undernote/
├─ content/                    # ★ 원·User의 콘텐츠 — 도구 중립 (이식 대상의 전부)
│  ├─ albums/<slug>.yaml       #   앨범 메타 (album-add가 생성, User 수기 폴백)
│  ├─ reviews/<slug>.md        #   평론 — 파일명 = 앨범 slug (1:1 강제)
│  ├─ stories/<slug>.md        #   음악 이야기
│  ├─ artists/<slug>.md        #   아티스트 표기명 + 소개글(본문, 빈 본문 허용)
│  └─ snapshots/               #   연간 확정 (finalize 생성 · 이후 불변 — R-2)
├─ config/                     # ★ 설정 = 데이터 (코드 아님 — D1)
│  ├─ site.yaml                #   activeYear · 매체명 · base URL · og_use_cover · 듣기 링크 패턴
│  ├─ genres.yaml              #   연도별 버킷 블록 (과거 블록 수정 금지 — R-8)
│  └─ tags.yaml                #   세부 태그 등록부 (canonical + aliases)
├─ scripts/                    # 편집 시점 CLI (빌드와 독립 실행)
│  ├─ album-add.ts             #   MB 조회 → CAA 커버 → 앨범·아티스트 파일 생성 (시퀀스 A)
│  └─ finalize.ts              #   연말 확정: 스냅샷 + activeYear 전환 (시퀀스 C)
├─ src/
│  ├─ content.config.ts        # Zod 스키마 — api-contracts §3의 유일한 구현체
│  ├─ lib/                     # ★ 순수 TS — Astro import 금지 (테스트 가능성의 경계)
│  │  ├─ derive/               #   정렬(R-1)·보드·10선·월말정산·아카이브·역링크·배지
│  │  ├─ checker/              #   E-* 검사 전부 + build-report 생성
│  │  ├─ mb/                   #   MusicBrainz·CAA 클라이언트 (scripts만 사용)
│  │  └─ og/                   #   카드 데이터 조립 (시각 렌더는 ADR-0010 경로)
│  ├─ layouts/                 # 문서 골격 (OG 메타 주입 지점 — 전 페이지 공통)
│  ├─ pages/                   # 라우트 — derive 출력의 순수 소비자 (P1)
│  ├─ components/              # 지면 부품 (Jonnathan 시안의 구현 단위)
│  └─ styles/
├─ public/
│  ├─ covers/<slug>.jpg        # 커버 사본 — 축소 저장 (ADR-0008)
│  └─ fonts/                   # 서브셋 폰트
├─ tests/
│  ├─ fixtures/                # 픽스처 콘텐츠 세트 (동점·경계·귀속·고아 케이스 포함)
│  └─ unit/                    # derive·checker·스키마 계약 테스트
├─ reports/                    # build-report 산출 (gitignore — 산출물이지 콘텐츠 아님)
└─ .github/ 또는 호스팅 CI 설정  # TZ=Asia/Seoul 명시 (R-10)
```

---

## 2. URL 설계 (slug 불변 — R-9)

| 경로 | 지면 |
|---|---|
| `/` | 홈 — 보드 현황판 + 최신 글 (빈 상태 포함, D5) |
| `/reviews/<slug>/` | 평론 (CF-1) |
| `/stories/<slug>/` | 음악 이야기 (CF-5) |
| `/artists/<slug>/` | 아티스트 (CF-6) |
| `/list/<year>/` | 연간 리스트 — activeYear면 진행형(보드+10선), 과거면 확정 스냅샷 |
| `/monthly/<yyyy-mm>/` | 월말정산 (평론 있는 달만 — R-4) |
| `/archive/…` | 4축 탐색 (연도·버킷·태그·아티스트 — 점수 비표시) |
| `/about/` | 소개/기준 (CF-8 — 전역 내비 필수, US-8 AC2) |

---

## 3. 레이어 경계 (위반 = 코드 리뷰 반려)

```
content/·config/  →  content.config.ts(스키마)  →  lib/derive·checker  →  pages/·components/
      데이터              계약 검증                     판단 (전부)            렌더 (판단 0)
```

1. **`lib/`는 Astro를 모른다.** 순수 함수 + 일반 타입. 결정성 테스트(동일
   입력 → 동일 출력)가 프레임워크 없이 돌아야 한다.
2. **`pages/`는 판단하지 않는다.** 정렬·필터·귀속·폴백 선택이 템플릿에
   나타나면 반려 (P1). 템플릿의 조건문은 "빈 배열이면 영역 미표시"(R-4)까지만.
3. **`scripts/`는 빌드에 관여하지 않는다.** 파일을 만들 뿐이다. 빌드는
   저장소 상태만 읽는다 — "편집 시점 vs 빌드 시점"의 물리적 분리.
4. **`content/`에 도구 종속 문법 금지** (P6 — 이식성. charter §5의 유일한
   미래 대비).
5. 외부 네트워크 호출은 `lib/mb/`에만 존재하고 `scripts/`만 부른다.
   `lib/derive·checker`·`pages/`에서 fetch가 보이면 아키텍처 위반이다
   (배포 사이트 API 호출 0 — B6 승계).

---

## 4. 명명 규칙

- slug: `kebab-case` ASCII (E-107). 앨범 = `<artist>-<album>` 요약형, User 확정.
- 파일명 = slug = URL 조각 — 삼자 일치가 깨지면 안 된다 (E-108이 리뷰에서 검사).
- 오류 코드: `E-###` (`exceptions.md`가 SSOT). 새 코드는 그 문서에 먼저.
- 커밋: 발행 1건 = 원자 커밋 1개 (`publish: <slug>` 관례 — 부분 발행 금지의 규약).
