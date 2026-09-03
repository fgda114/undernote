# undernote — 기능 명세 (Functional Spec)

| | |
|---|---|
| 작성 | Timothy (역할 #11 · Docs Engineer) · 2026-09-03 |
| 성격 | **코드 근거 기반.** 설계 문서(`.agent-team/03-service-planning/user-stories.md` 등)가 아니라 W5 구현(Andrew, 77파일)이 실제로 무엇을 하는지 기술한다. 설계 의도와의 차이는 `design-vs-impl-gaps.md`로 분리했다 |
| 독자 | 6개월 뒤의 개발자 (User 본인 가능성 높음) — 기술 용어 사용 |
| 검증 | 2026-09-03 로컬 실행 확인: `npm test`(131/131 통과) · `npm run build`(13 page(s) built, exit 0) — 재현 절차는 `operations.md` |

이 제품은 **런타임이 없다.** "기능"은 화면의 동작이 아니라 **빌드가 저장소 상태로부터
무엇을 도출·검증·생성하는가**다. 아래는 라우트 단위로 실제 동작을 정리한다.

---

## 1. 페이지 목록 (실측 13종 HTML + 404)

2026-09-03 `npm run build` 산출물 기준 (`dist/` — 빈 저장소에 픽스처 콘텐츠 1세트만 있는 상태):

| 라우트 | 소스 | 목적 |
|---|---|---|
| `/` | `src/pages/index.astro` | 홈 — 보드 현황판 + 최신 글, 4상태 분기 |
| `/reviews/<slug>/` | `src/pages/reviews/[slug].astro` | 평론 |
| `/stories/<slug>/` | `src/pages/stories/[slug].astro` | 음악 이야기 |
| `/artists/<slug>/` | `src/pages/artists/[slug].astro` | 아티스트 |
| `/list/<year>/` | `src/pages/list/[year]/index.astro` | 연간 리스트 (activeYear=진행형, 과거=스냅샷) |
| `/list/<year>/<mm>/` | `src/pages/list/[year]/[mm].astro` | 월말정산 |
| `/archive/` | `src/pages/archive/index.astro` | 4축 허브 |
| `/archive/<year>/` | `src/pages/archive/[year].astro` | 연도 축 (발행 연도 — R-3) |
| `/archive/genre/<bucket>/` | `src/pages/archive/genre/[bucket].astro` | 버킷 축 |
| `/archive/tag/<tag>/` | `src/pages/archive/tag/[tag].astro` | 태그 축 |
| `/archive/reviews/` | `src/pages/archive/reviews.astro` | 평론 전체 목록 |
| `/archive/stories/` | `src/pages/archive/stories.astro` | 이야기 전체 목록 |
| `/about/` | `src/pages/about.astro` | 소개/기준 |
| `/404` | `src/pages/404.astro` | 404 |

부가 산출물(HTML 아님): `/covers/derived/<slug>-w{96,320,640}.webp` (`src/pages/covers/derived/[image].webp.ts`), `/og/default.png` · `/og/list/<key>.png` · `/og/reviews/<slug>.png` (satori 카드).

**아티스트 축은 별도 `/archive/artist/*` 라우트가 없다** — `by_artist` 인덱스 키는 `/artists/<slug>/`로 직결된다 (`src/lib/derive/archive.ts:65,82`). impl-notes W5.3 결정과 일치.

---

## 2. 홈 (`/`)

`src/lib/derive/lists.ts:253-262` `deriveHomeVariant()` — 시계를 쓰지 않고 저장소 상태만으로 4상태 중 하나를 고른다:

| 상태 | 조건 | 표시 |
|---|---|---|
| `empty` | `reviewCount === 0` | 평론 0편 — 사전 공개 문구 |
| `early` | 노미네이트 총수 < `early_stage_threshold`(기본 6, `config/site.yaml`) | 진행 배너 + 최신 평론 히어로 |
| `post-finalize` | 임계 미달 + **직전 연도 스냅샷 존재** | 확정 카드 + 새 빈 보드 |
| `normal` | 노미네이트 총수 ≥ 임계 | 보드 현황판 + 최신 글 |

호출 지점: `src/lib/derive/site-data.ts:88-93`. 보드 캡션 날짜는 저장소 유래 최신 발행일(`latestPublicationDate`, `lists.ts:234-239`)이며 빌드 시각을 쓰지 않는다.

---

## 3. 평론 (`/reviews/<slug>/`)

뷰모델 조립: `src/lib/derive/review-page.ts:52-76` `buildReviewPageData()`.

- 히어로 4필드만: 앨범명·아티스트 링크·버킷 라벨·발매일 — **점수 없음** (`review-page.ts:13-25` 주석 + 인터페이스에 score 필드가 verdict 전용 위치에만 있음).
- 아티스트명은 `/artists/<slug>/` 링크로 렌더 (`artistLinks[]`, `review-page.ts:17,66`).
- 버킷 라벨은 **발매 연도**의 `genres.yaml` 블록에서 조회 (`bucketLabelFor`, `review-page.ts:39-46` — R-3).
- 듣기 링크: `buildListenLinks()` (`listen-links.ts:36-54`) — 수기 오버라이드가 있으면 해당 서비스의 자동 검색형 링크를 대체, 패턴 미적용 서비스는 수기만 표시.
- 커버: `coverSetFor()` (`covers.ts:30-44`) — 없으면 `null`, 페이지가 플레이스홀더로 대체(E-202 경고는 빌드 시점에 별도 기록).
- "이 앨범이 등장하는 이야기": `deriveBacklinks()` (`links.ts:60-87`) — 직접 참조 → 태그 교집합(최대 2) → 같은 버킷(최대 2) → 없으면 영역 미표시. 단계는 섞이지 않는다.
- "{아티스트}의 다른 글": 복수 아티스트 합집합, 현재 평론 제외 (impl-notes W5.4 #4 — 코드 근거는 아카이브 by_artist 축 재사용).

---

## 4. 리스트 엔진 (`/list/<year>/`, `/list/<year>/<mm>/`)

정렬은 저장소 전체에서 **딱 하나의 전순서**로 통일된다 — `src/lib/derive/lists.ts:88-93` `compareR1()`:

```
1차: scoreTenths desc
2차: review.date asc (코드포인트 비교)
3차: album slug asc (코드포인트 비교)
```

| 도출물 | 함수 | 대상 | 위치 |
|---|---|---|---|
| Board(보드) | `deriveBoard` | activeYear 발매, **etc 제외**, 버킷별 상위 5 | `lists.ts:119-135` |
| Top10Progressive(진행형 10선) | `deriveTop10` | activeYear 발매, **etc 포함**, 전체 상위 10 | `lists.ts:139-148` |
| MonthlyRecap(월말정산) | `deriveMonthlyRecaps` | 발행월 귀속, **종료된 월만** | `lists.ts:154-164` |

과거 연도(`/list/<year>/`, year < activeYear)는 `content/snapshots/<year>.md`에서만 렌더된다 — 스냅샷이 없으면 그 연도 지면 자체가 없다(스냅샷은 `finalize` CLI 전용 산출물, `scripts/finalize.ts`).

**"종료된 월" 판정의 유일한 시계 소비처**: `currentYearMonthSeoul()` (`lists.ts:111-113`) — KST 고정 산술(`Date.now() + 9*3600_000`), Intl·로케일 미사용. 이 외 전 도출은 시계와 무관 — 같은 저장소 = 같은 사이트(결정성)가 유지된다.

---

## 5. 아카이브 (`/archive/**`)

4축 역인덱스: `src/lib/derive/archive.ts:44-89` `deriveArchiveIndex()`.

- **연도 축은 발행 연도** — 연간 리스트(발매 연도 축)와 의도적으로 다른 키(R-3, `archive.ts:8-9` 주석).
- 4축 전부 **점수 필드가 타입에 없음** (`ArchiveItem` 인터페이스, `archive.ts:22-27`) — 탐색 지면은 구조적으로 점수를 렌더할 수 없다.
- `type: 'review' | 'story'` — **`artist-intro`는 타입에 없다.** 아티스트 페이지는 `by_artist` 축의 키 자체로 도달한다(`ArchiveIndex.by_artist`). 이 결정과 상류 계약(`api-contracts.md` §4.4)의 표현 차이는 `design-vs-impl-gaps.md` #2 참조.
- 고아 검사(E-113): `detectOrphans()` (`archive.ts:101-113`) — 어떤 축의 `by_artist`에도 없는 아티스트 파일을 빌드 실패로 잡는다. 평론·이야기는 발행일이 있어 연도 축에 정의상 편입되므로 구조적으로 고아가 될 수 없다(같은 파일 주석).

---

## 6. 이해의 사다리 (평론 ↔ 이야기)

`src/lib/derive/links.ts` — USP-B의 구현 전부. 두 방향:

1. **평론 → 이야기** (역링크, `deriveBacklinks`, `links.ts:60-87`): 폴백 4단계(직접/태그/버킷/없음), 첫 비지 않는 단계만.
2. **이야기 → 평론** (AlbumBox, `deriveAlbumBoxRows`, `links.ts:109-132`): 등록 앨범 참조 중 평론이 있으면 링크, 없으면 "평론 준비 중" 비링크 텍스트(`reviewUrl: null`); 미등록 언급(`{text}`)은 항상 텍스트.

계보 시각화(role: lead/follow 기반 그룹핑)는 **구현되지 않았다** — 스키마 필드(`storyAlbumRefSchema`, `src/lib/schema/story.ts:12-18`)는 존재하나 소비 코드가 없다. impl-notes W5.4 #1: 원이 계보 선택(안 A/안 B) 무응답 → 안 A(AlbumBox만) 확정 구현, 설계 결정이지 결함이 아니다.

재계산의 공짜 속성: 평론이 나중에 발행되면 다음 빌드에서 자동으로 소급 링크된다 — 별도 코드 경로 없음(전량 재계산 구조의 자연스러운 결과).

---

## 7. 발행 파이프라인 (원 → 사이트, 편집 시점)

`scripts/album-add.ts` — 대화형 CLI. 실제 동작 순서(코드 근거):

1. `config/genres.yaml` 로드 + 검증 (`album-add.ts:53-61`) — 실패 시 즉시 종료.
2. MusicBrainz 검색 (`MbClient.searchReleaseGroups`, 1회 타임아웃 재시도) → 결과 선택 프롬프트 (`album-add.ts:86-118`).
3. 필드 확정: 앨범명·발매일(연도 필수)·아티스트별 slug(자동 제안 + 수정 가능)·버킷(발매 연도 설정값 또는 `etc`, 침묵 기본값 없음) — `album-add.ts:120-177`.
4. 커버: CAA 다운로드 → sharp로 640px 이하 재인코딩 → `public/covers/<slug>.jpg` 저장, 실패 시 플레이스홀더로 계속 진행 — `album-add.ts:180-206`.
5. `content/albums/<slug>.yaml` 생성(+ 신규 아티스트면 `content/artists/<slug>.md`) — 이미 존재하면 거부(slug 불변, R-9) — `album-add.ts:150-155,208-221`.
6. **평론 작성은 CLI 밖** — User가 `content/reviews/<slug>.md`를 직접 작성해 push.

`scripts/finalize.ts` — 연말 확정. 빌드와 **같은 derive 코드 경로**(`deriveTop10`/`deriveBoard`)를 그대로 호출해 이중 구현을 피한다(`finalize.ts:79-81`). 검증 실패 상태(체커 실패 findings 존재)면 확정 자체를 거부(`finalize.ts:64-69`). 확정 시 `content/snapshots/<year>.md` 생성 + `config/site.yaml`의 `active_year` 증가 + `config/genres.yaml`에 다음 연도 블록 자동 추가(과거 블록은 건드리지 않음) — `finalize.ts:109-166`.

---

## 8. 빌드 게이트 (읽기와 발행 사이의 유일한 관문)

`astro.config.ts`의 `undernoteChecker()` 통합이 2단계로 실행된다(빌드 명령에서만, `astro dev`는 미실행):

1. **`astro:config:done`** — 사전 패스: 스키마+교차 참조 검증(E-1xx) + E-3xx 알림 산출. E-1xx가 하나라도 있으면 `throw` — Astro의 나머지 빌드를 막는다 (`astro.config.ts:57-63`).
2. **`astro:build:done`** — 사후 패스: `dist/` 전수 스캔으로 OG 3요소(E-111)·내부 링크(E-112) 검사 (`astro.config.ts:66-76`).

두 단계 모두 `reports/build-report.{md,json}`을 always 산출(성공이어도) — `checker/index.ts:43-66`. `built_at`이 비결정적이므로 `reports/`는 `dist/` 밖(gitignore) — CI 해시 게이트가 `dist/`만 비교하는 이유.

**실측(2026-09-03):** 픽스처 콘텐츠 상태로 `npm run build` 정상 완료, "13 page(s) built", `undernote-checker: 무결성 검사 통과`.

---

## 9. 사용자 스토리 대응 요약

전체 US-1~15의 코드 근거는 `traceability-matrix.md`. 이 절은 대표 항목만:

- **US-1(리스트→근거)**: `ListEntry.review_url`이 모든 리스트 항목에 필수(`lists.ts:35-43`) — 항목 자체가 링크다.
- **US-10(발행 노동 최소화)**: 원의 입력은 리뷰 프론트매터 4필드(`album`·`score`·`date`·`editorial_check`, `src/lib/schema/review.ts:42-57`)뿐 — 나머지는 `album-add`/빌드가 채운다.
- **US-13(연말 확정)**: 위 §7 `finalize.ts`.
- **US-15(공유 카드)**: `src/lib/og/` 전체 — 타입 레벨에서 score 필드 부재(`og/types.ts`)로 E-115를 컴파일 타임에 강제.

---

## 10. 관측된 한계 (기능적으로 미구현·미완)

- 계측(GoatCounter) — `Base.astro:66-73`에 조건부 스니펫은 있으나 `config/site.yaml`에 `goatcounter_code`가 없어 **현재 비활성**(User의 가입이 선행 조건, impl-notes W5.5).
- 커스텀 도메인 미설정 — `base_url`이 GitHub Pages 서브패스(`config/site.yaml:5`)이고 `astro.config.ts`에 `site`/`base` 설정 자체가 없음(주석 처리된 설명, `astro.config.ts:21-22`). GitHub Pages 배포 시 서브패스 라우팅이 실제로 동작하는지는 **미확인** — User가 Pages 활성화 후 실측 필요.
- 픽스처 콘텐츠가 `content/`에 커밋된 상태 — 실콘텐츠 투입 전 제거 대상(운영 수칙, `operations.md` 참조). CI `deploy` 잡에는 이를 막는 게이트가 있다(`.github/workflows/ci.yml:99-112`).
