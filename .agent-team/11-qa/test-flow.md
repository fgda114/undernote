# W6 테스트 흐름 — 실행 구조와 재현 절차

| | |
|---|---|
| 작성 | Matthias (역할 #15) · 2026-09-03 |
| 스위트 위치 | `e2e/` (자체 워크스페이스 — 제품 `package.json` 무수정, `@playwright/test` 1.62.1 자체 lockfile) |
| 원칙 | 저장소 원본 무수정 — 모든 변이는 `e2e/.sandbox/<이름>/` 사본에서. node_modules는 정션(junction) 연결 (rmSync가 정션을 따라가지 않음을 사전 실증하고 사용) |

## 실행 방법

```bash
cd e2e
npm install                 # 최초 1회 (@playwright/test)
npx playwright install chromium   # 최초 1회 (브라우저)
npm run e2e                 # = node lib/setup-rich.mjs && playwright test
node lib/measure-latency.mjs      # latency/NFR 실측 (스케일 빌드 포함 — 수 분)
```

- Windows 로컬 이슈: npm이 띄우는 셸에 node가 없으면 Playwright `webServer`가 실패한다 — config가 `process.execPath` 절대 경로를 쓰도록 되어 있어 회피됨.
- `astro preview`는 Astro 7에서 데몬화되어 Playwright webServer와 호환되지 않는다 — 자체 정적 서버(`lib/static-server.mjs`, 404.html을 실제 404 상태로 서빙)를 쓴다.
- 헬스체크·바인딩은 `127.0.0.1` 고정 (localhost는 ::1로 해석되어 ECONNREFUSED).

## 흐름도

```
setup (lib/setup-rich.mjs)
  └─ .sandbox/rich  ← 사본 + rich 콘텐츠(평론 8) → astro build (시간 기록)
       │
playwright test
  ├─ [build 프로젝트]  ← 샌드박스별 독립, 실빌드로 상태 전이 검증
  │    ├─ retro    : 사본 → 평론 삭제 → build → 단언 → 복원 → build → 단언
  │    ├─ ladder   : 사본 → build(direct) → 이야기 변이 → build(tag)
  │    │             → 버킷 이웃 앨범 추가 → build(bucket) → 삭제 → build(none)
  │    ├─ finalize : 사본 + rich 콘텐츠 → finalize CLI → build(확정)
  │    │             → 점수 수정 → build(불변) → 소급 평론 추가 → build(불변)
  │    └─ dist-matrix : .sandbox/rich/dist 전수 스캔 (빌드 없음)
  └─ [browser 프로젝트]  ← webServer: static-server → 127.0.0.1:4180 (rich dist)
       ├─ flows      : 클릭 내비게이션 5종 + 404 + JS 요청 0
       ├─ a11y       : Tab 통독 · 다크 모드 · reduced-motion (emulateMedia)
       └─ responsive : 360×800로 전 지면 순회 (가로 스크롤 0)
```

## 스토리 → 흐름 매핑 (요약)

| 사용자 여정 | 자동화 흐름 |
|---|---|
| 독자: 홈 → 보드 → 평론 → 평결 → 듣기 | browser.flows BF-1 + dist-matrix DM-9 |
| 독자: 평론 → 사다리 → 이야기 → 다른 평론 | build.ladder LD-1~4 + browser.flows BF-3 |
| 독자: 아카이브 → 소개 (기준 확인) | browser.flows BF-4 + DM-2 |
| 원: 발행 → 보드/리스트/카드 자동 완성 | rich 세트 생성 → setup 빌드 (4+4필드만 입력) |
| 원: 평론 없는 언급 → 나중 발행 → 자동 링크 | build.retro-link RL-1→RL-2 |
| 원: 연말 확정 → 이듬해 → 소급 수정 | build.finalize FN-1~4 |

## 플레이키니스 정책

- 재시도 0 (`retries: 0`) — 플레이크는 수리 대상이지 재시도 대상이 아니다.
- 빌드 단언은 전부 정적 dist 파일 검사 (타이밍 비의존).
- 브라우저 단언은 정적 사이트 + JS 0이라 대기 조건이 단순 (`load`/`networkidle` 즉시 안정).
- 관찰된 플레이크: 0 (전 수행에서 결정적 통과/실패만).

## 소유·정리

- `e2e/.sandbox/`·`test-results/`·`playwright-report/`·`node_modules/`는 gitignore.
- 샌드박스 삭제는 반드시 `removeSandbox()` 경유 (정션 선해제 → rmSync).
