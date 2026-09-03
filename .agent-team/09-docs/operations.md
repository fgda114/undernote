# undernote — 운영 문서 (Operations)

| | |
|---|---|
| 작성 | Timothy (역할 #11 · Docs Engineer) · 2026-09-03 |
| 목표 | **이 문서만으로 클린 환경에서 빌드·실행이 재현된다.** 모든 명령은 2026-09-03 로컬(Windows 11)에서 직접 실행해 확인했다 — 실행 결과를 그대로 인용한다 |
| 독자 | 6개월 뒤의 개발자 |

---

## 1. 환경 요건

| 항목 | 요건 | 근거 |
|---|---|---|
| OS | Windows 11 개발 확인됨 (CI는 Ubuntu) | `.github/workflows/ci.yml:21` `runs-on: ubuntu-latest` |
| Node | `>= 22.12.0` (로컬 실측 v24.14.0) | `package.json:6-8` `engines`, `.github/workflows/ci.yml:27` `node-version: 22` |
| 시간대 | **`TZ=Asia/Seoul` 필수** (R-10 — 월말정산 "종료된 월" 판정에 영향) | `.github/workflows/ci.yml:16-17` |
| 패키지 매니저 | npm (lockfile 고정, `npm ci`만 — `npm install` 금지) | `.github/workflows/ci.yml:31-32` |
| 폰트 서브셋 재생성(옵션) | Python + `fonttools`·`brotli` | `scripts/subset-fonts.py` |

## 2. 설치

```bash
npm ci
```

**Windows 로컬 주의(실측 문제 및 해결):** Git Bash에서 `npm test`/`npm run build` 등 npm 스크립트가 자식 프로세스(`cmd.exe`)를 거칠 때 `node`를 못 찾아 다음 오류가 날 수 있다:

```
'"node"'은(는) 내부 또는 외부 명령... 이 아닙니다.
```

해결: PATH에 Node 설치 경로를 앞에 추가.

```bash
export PATH="/d/nodejs:$PATH"   # 실제 Node 설치 경로에 맞게 조정
```

시스템 PATH에 Node가 이미 등록돼 있으면(설치 관리자 기본 설정) 이 조치가 불필요할 수 있다.

## 3. 로컬 실행

| 명령 | 동작 | 확인 |
|---|---|---|
| `npm run dev` | 개발 서버, 기본 `http://localhost:4321` | 체커 게이트는 **미실행**(코드 근거: `astro.config.ts:44` `if (command !== 'build') return;`) — 콘텐츠 수정 중에도 서버가 죽지 않음 |
| `npm test` | vitest 단위 테스트 | **실측(2026-09-03): 12 Test Files passed, 131 Tests passed, 8.57s** |
| `npm run check` | `astro check` 타입 검사 | §4 참조 — **현재 재현 가능한 실패 1건 있음** |
| `npm run build` | 프로덕션 빌드 → `dist/` | §5 참조 |
| `npm run preview` | `dist/` 로컬 미리보기 | |

### 시드 콘텐츠 (수동 확인용)

저장소에는 픽스처 콘텐츠 1세트가 이미 `content/`에 커밋돼 있다(앨범+아티스트+평론+이야기+커버) — 별도 시딩 없이 `npm run dev`/`npm run build`가 바로 동작한다. **이 픽스처는 공개 배포 전 제거 대상**이다 — §8 참조.

## 4. 알려진 이슈 — `npm run check`가 현재 실패한다 (실측·재현됨)

3회 연속 재현(clean 상태에서):

```
tests/unit/derive-lists.test.ts:47:7 - error ts(2741):
  Property 'early_stage_threshold' is missing in type
  '{ site_name: string; base_url: string; active_year: number; og_use_cover: true; }'
  but required in type '{ ...; early_stage_threshold: number; ... }'.

Result (78 files):
- 1 error
```

**원인 (코드 근거):** `src/lib/schema/config.ts:63` `early_stage_threshold: z.int().min(1).default(6)` — Zod의 `.default()`는 **입력 타입에서는 옵션이지만 출력 타입(`z.infer`)에서는 필수 필드**가 된다(이 breaking change는 `.agent-team/08-impl-notes/frontend.md` W5.0 절 "Zod v4 breaking 실확인" ②에 이미 문서화돼 있다). `tests/unit/derive-lists.test.ts:47-52`의 `const site: SiteConfig = {...}` 리터럴이 `early_stage_threshold`를 포함하지 않아 타입 체크에서 걸린다.

**영향 범위:** `npm test`(vitest)는 esbuild로 타입을 지운 채 실행하므로 **영향받지 않는다**(131/131 통과, §3). `npm run build`도 Astro의 자체 타입 생성과는 별개 경로라 **영향받지 않는다**(§5에서 정상 완료 확인). **오직 `npm run check` 단독 실행만 실패한다.**

이것이 CI에서 안 잡혔어야 정상인지, 이미 알려진 채로 방치된 것인지는 **미확인** — `design-vs-impl-gaps.md`에 기록했다. 재현 절차: 위 §2~3 그대로 실행.

## 5. 프로덕션 빌드 — 절차와 관측된 함정

```bash
npm run build
```

**정상 완료 시 실측 출력 끝부분(2026-09-03):**

```
[undernote-checker] 무결성 검사 통과 (OG 3요소 · 내부 링크).
[build] 13 page(s) built in 31.14s
[build] Complete!
```

**관측된 함정 — 콜드 캐시 레이스 (재현 조건 한정적, 참고용):** `npm run check`와 `npm run build`를 **동시에** 실행하면(예: 병렬 셸에서 둘 다 `.astro/` 콘텐츠 타입 생성에 의존) `npm run check` 쪽에서 다음과 같은 무관한 대량 오류가 쏟아질 수 있다 — `getCollection`/`getEntry` 반환값이 `never` 타입으로 보이는 증상(`Property 'data' does not exist on type 'never'`, `src/pages/reviews/[slug].astro` 등 다수). **이것은 §4의 진짜 오류가 아니다** — `.astro/` 타입 생성 파일을 두 프로세스가 동시에 쓰고 읽어 생기는 레이스로 관측됐다. 해결: 두 명령을 **순차 실행**한다(CI는 이미 순차 — `.github/workflows/ci.yml:34-38`).

캐시가 꼬였다고 의심되면:

```bash
rm -rf dist .astro node_modules/.astro
npm run build
```

## 6. CI 파이프라인 (`.github/workflows/ci.yml`)

```
verify (push · PR, ubuntu-latest, TZ=Asia/Seoul)
  npm ci
  npm test
  npm run check
  [의도적 스키마 위반 픽스처 주입 → build 실패 확인 → 원복]
  npm run build → dist-1
  [캐시 삭제] npm run build → dist-2
  sha256(dist-1) == sha256(dist-2) 필수 (결정성 게이트)
  (main push만) dist-1 업로드

deploy (needs: verify, main push만)
  fixture-* 파일 잔존 검사 → 있으면 중단
  dist-1을 GitHub Pages에 그대로 배포 (재빌드 없음)
```

**주의:** §4의 `npm run check` 실패가 실제로 CI를 막는지는 워크플로 정의상 **막는다**(`ci.yml:37-38`에 실패 허용 옵션 없음) — 즉 현재 상태로 push하면 CI의 `verify` 잡이 이 단계에서 실패할 것으로 예상된다. 로컬에서 §4 그대로 재현했으니 push 전에 확인 필요.

## 7. 배포

- **호스트: GitHub Pages** (Actions 배포, `deploy` 잡). 대안(Cloudflare Pages 등)은 `.agent-team/04-architecture/adr/ADR-0009-hosting.md` 참조 — 코드 변경 없이 `dist/`만 옮기면 전환 가능.
- **User 1회 작업 (미완료 가능성 — 코드에서 확인 불가, 운영자 확인 필요):** GitHub 저장소 **Settings → Pages → Source = "GitHub Actions"**. 이것 없이는 `deploy` 잡이 실패한다(impl-notes W5.0).
- **URL:** `config/site.yaml:5` `base_url: "https://fgda114.github.io/undernote"` — 커스텀 도메인 전까지 서브패스. **`astro.config.ts`에 `site`/`base` 설정이 없다**(주석에 "site name 미확정이라 의도적으로 비움"이라고만 적혀 있음, `astro.config.ts:21-22`) — GitHub Pages 서브패스 배포 시 절대경로 링크(`/reviews/...` 등)가 실제로 올바르게 동작하는지는 **코드 정적 분석만으로는 확인 불가, 배포 후 실측 필요**.
- **롤백:** 정적 호스팅 특성상 배포 실패 시 자동으로 마지막 성공 배포가 계속 서빙된다(별도 롤백 절차 불요). 수동 롤백이 필요하면 GitHub Pages 배포 이력에서 이전 아티팩트 재배포(GitHub 표준 기능, 이 저장소 고유 절차 없음).

## 8. 공개 전 체크리스트 (운영 수칙 — `.agent-team/08-impl-notes/w5-5-launch-gate.md` §4-5 승계, 재확인)

- [ ] 픽스처 콘텐츠 제거: `content/{albums,reviews,artists,stories}/fixture-*`, `public/covers/fixture-*` — 남아 있으면 `deploy` 잡이 자동 차단(`ci.yml:105-112`, 실제 코드로 확인됨).
- [ ] 저장소·GitHub 계정 2FA.
- [ ] `config/site.yaml`의 `site_name` 확정 시 1곳 치환.
- [ ] 계측 원하면 GoatCounter 가입 → `goatcounter_code` 추가(§5.4 `interface-spec.md`).
- [ ] `npm run check` §4 이슈 해결(또는 CI 예상 실패 인지).

## 9. 운영 수칙 (게시 후 지켜야 하는 것 — 코드가 강제하는 것과 절차로만 지키는 것 구분)

| 수칙 | 강제 방식 |
|---|---|
| 스냅샷 수동 편집 금지 | **코드가 막지 않음** — `finalize.ts:59-62`는 파일이 이미 있으면 재실행만 막을 뿐, 기존 파일의 수기 편집 자체는 막을 방법이 없다. 절차 규칙. 정정: 파일 삭제 후 `finalize` 재실행 |
| 과거 연도 버킷 블록 수정 금지 (R-8) | **코드가 막지 않음** — `config/genres.yaml`은 일반 텍스트 파일. 절차 규칙(git 이력으로 감사) |
| slug 변경 금지 (R-9) | 부분 강제 — `album-add.ts:210-215`가 **같은 slug 재사용**(파일 이미 존재)은 막지만, slug를 다른 값으로 "바꾸는" 행위 자체(파일명 변경)는 막지 못함. 절차 규칙 |
| 발행 1건 = 원자 커밋 | **코드가 강제하지 않음** — git 커밋 관례일 뿐 |
| E-3xx 알림을 원에게 전달 | User의 수동 절차. `reports/build-report.md`의 "원에게 전하는 알림" 섹션이 산출까지만 자동(`checker/index.ts:64`) |

이 표는 "설계가 절차 규칙으로 남긴 것"과 "빌드가 실제로 막는 것"을 혼동하지 않기 위한 목록이다 — 전부 코드를 직접 읽고 확인했다.

## 10. 트러블슈팅 빠른 참조

| 증상 | 원인 | 조치 |
|---|---|---|
| npm 스크립트가 `'"node"'... 아닙니다` | PATH에 Node 없음(Windows Git Bash) | §2 `export PATH` |
| `npm run check`가 `early_stage_threshold` 관련 에러 | §4 알려진 이슈 | 테스트 픽스처 수정 필요(코드 변경 — Timothy 권한 밖, 리드 보고) |
| `npm run check`가 `getCollection`/`never` 대량 에러 | `.astro/` 타입 생성 레이스(§5) | `check`/`build` 순차 실행, 또는 `.astro/` 삭제 후 재시도 |
| CI `deploy` 잡 실패 (fixture 파일) | 픽스처 콘텐츠 잔존 | §8 체크리스트 |
| CI `deploy` 잡이 애초에 안 뜸 | GitHub Pages Source 미설정 | §7 User 1회 작업 |
