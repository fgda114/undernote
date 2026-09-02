# W5 구현 노트 — Andrew (Frontend)

> 스토리 진행에 따라 갱신. 최신 항목이 위.

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
