# W5 구현 노트 — Andrew (Frontend)

> 스토리 진행에 따라 갱신. 최신 항목이 위.

---

## W5.3 — 탐색: 아카이브 4축 + 아티스트 (2026-09-02)

### 주요 결정·발견 (다음 스토리 필독)

1. **아카이브 라우팅 확정**: `/archive/` 허브(축 값 나열) · `/archive/{year}/` · `/archive/genre/{bucket}/` · `/archive/tag/{tag}/` · 아티스트 축은 `/artists/{slug}/` 직결. 프리셋 `/archive/reviews|stories/`는 전체 목록으로 승격.
2. **ArchiveItem → ArticleCard 변환은 단일 지점**: site-data의 `allArticles`(전량, date desc) + `articleByUrl` 맵 — 아카이브 지면은 인덱스의 url을 이 맵에 통과시켜 렌더 (부제·형식 라벨 중복 조립 없음).
3. **아티스트 소개(artist-intro)는 ArchiveItem으로 방출하지 않음** — 계약(§4.4)이 date를 요구하는데 아티스트에겐 발행일이 없다. 아티스트 페이지 도달은 아티스트 축 자체가 보장. **이 결정의 귀결로 E-113 확정판의 실질 대상 = 무참조 아티스트** (평론·이야기는 발행일이 있어 연도 축에 정의상 편입 — 고아 불가능이 설계의 완전성 증명).
4. E-113 통합 실증: tests/fixtures/orphan/orphan-artist.md를 content/artists/에 복사하면 빌드가 한국어 메시지와 함께 실패 (실측 완료).
5. **아티스트명 링크 승격 완료** (W5.1 플레인 텍스트 → /artists/ 링크, 밑줄 색비의존). ReviewPageData에 artistLinks[] 추가.
6. 이야기 픽스처는 리드 해소 주석대로 통합 빌드에 포함 (W5.2의 /stories/ 셸 선행 덕).
7. 12 HTML 지면 · 테스트 119개 · 태그 축은 등록부 라벨 표시, 미등록 태그도 리터럴 slug로 인덱싱(E-201 경고는 별도).

---

## W5.2 — 리스트 엔진 + 홈 (2026-09-02)

### 재현 명령

```bash
npm test                                             # 112 테스트 (골든 파일 포함)
npm run build                                        # 사전 패스 + 렌더 + E-111/112 후처리 스캔
node scripts/finalize.ts --year 2026 --preface <서문.md> [--yes]   # 연말 확정
```

### 주요 결정·발견 (다음 스토리 필독)

1. **checker 2단계**: `astro:config:done` 사전 패스(E-100~110·114 + E-3xx 알림) + `astro:build:done` 후처리(E-111 OG 3요소·E-112 내부 링크 dist 전수 스캔). 후처리 실패도 비영 종료 → 배포 차단. E-113은 구조 준비만 — 이 단계에선 모든 평론이 월말정산으로 정의상 도달 가능, W5.3에서 4축으로 확장.
2. **E-115는 계속 구조적**: 카드·OG 입력 타입에 score 부재 + 단위 테스트. HTML 부분 문자열 스캔 없음.
3. **E-303은 로컬 전용 의미**: reports/build-report.json의 board_state와 diff — CI 콜드 빌드에선 미산출(수용된 속성, 알림은 로컬 빌드하는 User/원 대상).
4. **홈 4상태는 시계 0 분기**: empty(평론 0)/early(노미네이트<임계)/post-finalize(직전 연도 스냅샷 존재+새 보드 얇음)/normal. §1.6 "12월~이듬해 초"는 벽시계가 아니라 "새해 보드가 찰 때까지"로 실현.
5. **극초기 임계값 = `EARLY_STAGE_THRESHOLD(6)` 상수** (src/lib/derive/site-data.ts 단일 정의). site.yaml 옵션 필드 승격은 §7 절차로 리드에 요청함 — 승인 시 스키마 필드로 전환.
6. **보드 캡션 날짜 = 최신 발행일** (저장소 유래 — 빌드 시계 지면 유입 0).
7. **/stories/[slug] 최소 셸을 이 스토리에서 생성** (스토리 파일 미명시 — E-112+픽스처 이야기 존재로 필연. C-2와 같은 논리. W5.4가 AlbumBox·본문 링크로 완성).
8. **E-104 구반 보정**: 발매 연도 블록 없으면 전 연도 버킷 합집합 ∪ etc로 검증 (R-8 — W5.1 구현의 수정).
9. **finalize가 genres.yaml에 이듬해 블록 자동 추가** (확정 연도 버킷 복사 — "이듬해 빈 보드"의 전제. 과거 블록 무수정, 파일은 라인 치환·append로 주석 보존).
10. **월말정산은 종료 월만** 생성 — 현재 월 평론은 보드/10선/최신글로 도달. 골든 파일: tests/unit/__golden__/derive-output.json (동점·귀속·etc·빈버킷 전 케이스 고정).
11. finalize E2E 실검증 완료(스냅샷·active_year·§1.6 홈·동결 리스트·서문 렌더) 후 원복. 자동 테스트는 temp 저장소 사본으로 3케이스.

---

## W5.1 — 평론 + 발행 파이프라인 (2026-09-02)

### 재현 명령

```bash
npm ci && npm test && npm run check && npm run build   # 80 테스트 · 타입 0오류
npm run dev                                            # dev 서버 http://localhost:4321
node scripts/album-add.ts "아티스트" "앨범명"           # 편집 CLI (Node 22.18+/24 — TS 네이티브)
python scripts/subset-fonts.py <PretendardVariable.ttf> <NotoSerifKR[wght].ttf>  # 폰트 재서브셋 (pip install fonttools brotli)
```

- 시드 데이터: **픽스처 콘텐츠 1세트가 content/에 커밋돼 있음** (앨범+아티스트+평론+이야기+커버). E2E·후속 스토리 개발용 — **W5.5 런칭 전 제거 항목**.
- 실서비스 페이지: `/reviews/fixture-artist-fixture-album/` · `/og/reviews/fixture-artist-fixture-album.png` · `/og/default.png`

### 확정 버전 (착수일 npm 실확인)

satori **0.33.4** · @resvg/resvg-js **2.6.2** (핀). yaml 2.9.0은 dependencies로 승격 (checker가 빌드 경로에서 사용).

### 주요 결정·발견 (다음 스토리 필독)

1. **checker 게이트 훅 = `astro:config:done`** (astro.config.ts 인라인 통합). build:start는 콘텐츠 동기화보다 늦어 Astro의 첫-파일 오류가 선점 — config:done이라야 B-1 집계 보고가 먼저 나온다. build 명령에만 발동 (dev는 수정 중 실행 유지).
2. **Zod 이슈 코드 → E-코드 매핑**: 스키마 메시지가 "E-105:" 접두를 가지면 그 코드, 아니면 E-100. unrecognized_keys는 load.ts에서 한국어로 번역 (Zod v4는 strict()의 키별 메시지 훅이 없음).
3. **satori는 가변 TTF를 못 읽음** ("reading '256'" 크래시) — Pretendard는 satori용으로 400 고정 인스턴스를 별도 산출 (`src/assets/fonts/Pretendard-400-sub.ttf`). 웹 woff2는 가변 유지.
4. **E-115는 타입 레벨**: `src/lib/og/types.ts` 카드 입력에 score 필드 자체가 없음 + assemble 테스트가 runtime 고정. HTML 부분 문자열 스캔 금지 ("1983년" 오탐) — W5.2 checker(E-111·115)도 이 원칙.
5. **커버 파생 = 정적 엔드포인트** `src/pages/covers/derived/[image].webp.ts` (96/320/640). 원본 640 마스터(public/covers)에서 다운스케일만. sharp는 astro 동봉(0.35.4) — 직접 의존 미추가 (스토리 지시).
6. **node 네이티브 TS 실행 제약**: 상대 import에 `.ts` 확장자 필수(전 lib 통일), 파라미터 프로퍼티 금지. tsconfig `allowImportingTsExtensions`.
7. **듣기 링크 패턴 3종 실확인** (2026-09-02, 전부 HTTP 200) — 제거된 서비스 없음. 수기 링크는 서비스 단위 대체.
8. **MB UA 확정형**: `undernote-album-add/0.1.0 ( https://github.com/fgda114/undernote )` — 공식 Rate_Limiting 문서 형식. 1100ms 간격. 실검색 스모크 1회 통과.
9. **아티스트명은 히어로에서 플레인 텍스트** — /artists/ 라우트가 W5.3 산출이라 링크 승격은 W5.3 소유 (E-112 충돌 방지, 스토리 명시).
10. **Masthead 링크 목록** (W5.2 최소 셸 의무 대상): `/archive/reviews/` · `/archive/stories/` · `/list/{active_year}/` · `/archive/` · `/about/` (+Footer의 `/about/`·`/archive/`).
11. **버킷 etc 표시 라벨 = "그 외"** (설계 문서 미지정 — 구현 결정, 마이크로카피 검수 대상).
12. 상류 모순 1건 해소: E-101은 "평론·이야기·소개글"이라 쓰나 api-contracts §3.4·US-14는 아티스트 빈 본문 허용 — **아티스트는 E-101 제외**로 구현 (R-4 정신).

### 폰트 산출물

| 파일 | 크기 | 비고 |
|---|---|---|
| public/fonts/PretendardVariable-sub.woff2 | 428KB | 가변 유지 |
| public/fonts/NotoSerifKR-400-sub.woff2 | 313KB | |
| public/fonts/NotoSerifKR-700-sub.woff2 | 322KB | |
| 합계 | **1,063KB** | 예산 1,536KB 내 |

서브셋 = KS X 1001 한글 2,350자(cp949 바이트 범위로 판별 — Python euc_kr 코덱은 확장 완성형까지 통과하므로 주의) + ASCII + Latin-1 + UI 기호(↗→●© 등).

---

## W5.0 — 저장소 스캐폴드 · CI · 호스팅 (2026-09-02)

### 재현 명령 (Windows · PowerShell/Git Bash 공통)

```bash
npm ci                 # lockfile 고정 설치 (Node >= 22.12.0 필요 — 로컬 v24.14.0 확인)
npm test               # vitest 단위 테스트 (28개)
npm run check          # astro check (타입)
npm run build          # 정적 빌드 → dist/
npm run dev            # dev 서버 (기본 http://localhost:4321)
npm run preview        # dist/ 미리보기
```

- **환경 변수: `TZ=Asia/Seoul`** (R-10). CI에는 워크플로 `env:`로 명시. 로컬 Windows는 시스템이 KST면 무설정으로 동일.
- **시드 데이터 (E2E·수동 확인용):** 유효 픽스처를 콘텐츠로 복사하면 됨 —
  `cp tests/fixtures/valid/fixture-artist-fixture-album.md content/reviews/` 후 빌드/dev.
  위반 픽스처(빌드 실패 재현): `cp tests/fixtures/invalid/review-score-two-decimals.md content/reviews/`.
  확인 후 반드시 삭제 (콘텐츠 디렉터리는 실콘텐츠 전용).
- 결정성 수동 확인: 2회 빌드 후
  `(cd dist && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum)` 비교.
  로컬 실측 2회 동일: `cb5aa5cf8f05dd4d1cc46f006358d6c31ba5b60e92bf8471c18476da6b299a6a` (빈 사이트, 3파일).

### 버전 확정 (AC6 — npm·공식 문서 실확인, 2026-09-02)

| 항목 | 값 | 근거 |
|---|---|---|
| Astro | **7.2.10 정확 핀** (`package.json` exact + lockfile) | `npm view astro dist-tags.latest` = 7.2.10 (스토리 리서치 시점 7.2.9에서 패치 +1). engines `>=22.12.0` |
| Node | >= 22.12.0 (로컬 v24.14.0) | 공식 v6 업그레이드 가이드 (docs.astro.build/en/guides/upgrade-to/v6/) |
| Zod | Astro 동봉 **^4.3.6 → 4.5.4 잠금** — 직접 의존 추가 안 함, `astro/zod`로 import | `npm view astro@7.2.10 dependencies` |
| TypeScript | ~6.0.3 (Astro 자체 devDep과 동일 계열, @astrojs/check peer `^5||^6` 충족) | npm 실확인 |
| vitest | ^4.1.11 | npm 실확인 |

**Zod v4 breaking 실확인 (공식 v6 가이드):** ① 커스텀 `errorMap` 제거 → 체크별 `error:` 파라미터로 한국어 메시지 작성 (스키마 코드에 적용됨) ② default가 출력 타입 기준으로 변경 ③ Astro 내부와 동일 버전을 쓰려면 `astro/zod`에서 import (적용). **v7 breaking (공식 v7 가이드):** Vite 8 내부 변경 중심 — "Most Astro users should be able to upgrade without any changes". Content Layer API 유지 확인.

### 호스팅 확정 (AC5 — 공식 문서 실확인 2026-09-02)

| 후보 | 무료 한도 (출처·확인일) |
|---|---|
| Cloudflare Pages | 500 빌드/월 · 동시 1 · 20,000파일 · 파일당 25MiB · 커스텀 도메인 100개/프로젝트. 출처: developers.cloudflare.com/pages/platform/limits/ (문서 수정일 2026-07-16, 확인 2026-09-02) |
| Netlify | **크레딧 모델로 전환됨**: Free 1,000크레딧/월, 빌드 15크레딧/회(≈66회), 대역폭 20크레딧/GB(≈50GB). 출처: netlify.com/pricing (확인 2026-09-02) |
| GitHub Pages | 사이트 1GB · 대역폭 100GB/월(soft) · 10빌드/시(soft — **커스텀 Actions 워크플로에는 미적용**) · 배포 타임아웃 10분 · 상업용 금지. 출처: docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (확인 2026-09-02) |

**확정: GitHub Pages (Actions 배포).** 근거:
1. 저장소가 이미 GitHub(fgda114/undernote) — 신규 계정·외부 연동 0, 검증 게이트와 배포가 **같은 파이프라인 1개** (검증 통과한 dist-1 바이트를 그대로 배포 — 재빌드 없음 = 원자성).
2. 한도 충분: 이 사이트는 수백 페이지·커버 수백 KB 수준 (≪1GB, 대역폭 100GB/월 여유).
3. 요건 4종 충족: 정적+CDN / 커스텀 도메인+HTTPS 자동 / push 연동 원자 배포 / 월 0원.
4. ADR-0009 우선순위 1번은 Cloudflare Pages였음 — 대역폭 무제한으로 지표상 우위지만 계정 연결이 User 대시보드 작업이라 지금 "동작"시킬 수 없음. **산출물이 표준 정적 디렉터리라 이전 비용 ~0** — 트래픽이 100GB/월에 근접하면 그때 CF로 이전 (락인 없음, ADR-0009 설계 그대로).

**⚠ User 작업 1건 (배포 활성화):** GitHub 저장소 **Settings → Pages → Source를 "GitHub Actions"로 설정**. 이것 전까지 CI의 deploy 잡은 실패한다 (verify 게이트는 무관하게 동작). gh CLI 부재로 API 활성화 불가했음.
- 커스텀 도메인 전까지 URL은 `https://fgda114.github.io/undernote/` (서브패스). W5.0 셸은 절대 링크가 없어 무관하나, **W5.2에서 `astro.config`의 `site`/`base` 설정 필요** — 커스텀 도메인 확정 시 `base` 제거.

### 주요 결정사항 (다음 스토리가 알아야 할 것)

1. **스키마 단일 정의 위치 = `src/lib/schema/`** (`common.ts` + `review.ts`). `content.config.ts`는 감싸기만 함. Zod은 `astro/zod`에서 import — 순수 vitest에서 Astro 런타임 없이 임포트됨을 실확인 (레이어 규칙과 충돌 없음).
2. **점수 파서 단일 위치 = `src/lib/score.ts`** (`SCORE_PATTERN` + `scoreToTenths`). 문자열 저장·십분위 정수 연산의 이유가 주석에 있음 — 되돌리지 말 것.
3. **Astro 프론트매터 YAML은 따옴표 없는 `date: 2026-09-02`를 JS Date 객체로 만든다** (js-yaml 계열 — 테스트용 `yaml` 패키지는 문자열로 파싱하는 것과 다름! 실측). `isoDateSchema`가 Date→"YYYY-MM-DD" 정규화 (UTC in/out 왕복이라 머신 TZ 무관 결정적). 원은 따옴표 유무 신경 안 써도 됨.
4. **위반 픽스처 빌드 실패 실증됨**: `score: 8.35`(따옴표 없음) → `InvalidContentEntryDataError` + E-105 한국어 메시지 + 파일 경로, 종료 코드 비영. (Windows·node 24에서 실패 종료 시 libuv assertion 잡음과 exit 127이 관찰됨 — 게이트 판정에는 무영향, Linux CI에선 exit 1.)
5. **Windows 로컬 npm 이슈**: npm 자식 스크립트(cmd.exe)가 node를 못 찾으면 `PATH`에 `D:\nodejs` 선행 필요 (Git Bash: `export PATH="/d/nodejs:$PATH"`). 시스템 PATH에 이미 있으면 무관.
6. CI 해시 게이트 범위 = **dist/ 한정** (reports/의 `built_at`은 본질 비결정 — 스토리 AC4·Thomas N-7ⓑ).
7. `config/genres.yaml` 2026 블록 = B안 3버킷 기본값 (Q1 미답 — 값만 교체하면 됨). `tags.yaml`은 빈 등록부 (R-4: 가짜로 채우지 않음).

### 파일 목록 → 스토리 파일 Dev Agent Record 참조
