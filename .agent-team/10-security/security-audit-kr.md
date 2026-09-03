# W6 보안 감사 — Michael (2026-09-03)

| | |
|---|---|
| 기준 커밋 | `0f7694c` — 감사 근거 파일 전부가 이 커밋과 바이트 동일함을 `git diff`로 확인 (Andrew의 진행 중 B-1 리팩터는 astro.config·components·pages·postbuild를 건드리며, 아래 발견 위치와 **비중첩**) |
| 대상 | `src/**` · `scripts/**` · `config/**` · `.github/workflows/**` · `astro.config.ts` · `package.json` · `package-lock.json` (+ 설계 문서 참조: ADR-0008 · 코드 리뷰 `10-review/`) |
| 방법 | **정적·수동 코드 감사 + 로컬 프로브만.** 스키마 파싱 프로브 3건, `npm audit`, `npm query`(라이프사이클 스크립트), `npm ls`, grep 전수 스캔. **외부 호스트 대상 능동 테스트 0건** (RoE 준수 — MB/CAA 무접촉) |
| 판정 | **확정 8건 (High 0 · Medium 성격 3 · Low/Info 5) · 미확정 4건 · 릴리스 차단급 0건** |
| 기계 판독본 | `security-findings.json` (SARIF 2.1.0, 동일 8건) |

---

## 경영진 요약

**이 제품의 실제 공격면은 좁고, 그 좁은 면 안에서 심각한 결함은 발견되지 않았다.**
런타임 서버·DB·인증·사용자 입력이 없는 정적 사이트이므로, 신뢰 경계는 사실상 세 곳뿐이다:
① npm 의존성이 실행되는 **빌드 머신/CI**, ② 배포 권한을 쥔 **CI 파이프라인**, ③ 편집 시점에
외부 데이터(MusicBrainz/CAA)를 들여오는 **편집 도구**. 세 곳 모두 감사했고, 발견은 전부
"침해됐다"가 아니라 "**표준 하드닝이 아직 안 붙어 있다**" 수준이다.

**우선 조치 Top 4** (전부 소규모 — 합쳐서 30분 미만 작업량):

1. **CI 토큰 최소권한** — `ci.yml`에 명시적 `permissions:` 부재 (UN-SEC-001). 3줄 추가.
2. **sharp 의존 명시** — 커버 파이프라인(ADR-0008 §2 축소 통제의 실행 지점)과 빌드가
   astro의 *optionalDependencies*에 얹혀 있다 (UN-SEC-006). `package.json` 1줄.
3. **의존성 자동 모니터링** — 오늘 `npm audit` 0건(실측)이나 유지 장치가 없다 (UN-SEC-003).
   `dependabot.yml` 1파일.
4. **액션 SHA 핀** — 4개 액션이 태그 핀. 전부 GitHub 공식이라 실위험 낮음 (UN-SEC-002).

긍정 실측(별도 절): 비밀값 커밋 0건 · 알려진 취약점 0건 · `set:html` 0건 · fetch 지점 단일 ·
워크플로 식 주입 없음 · `pull_request_target` 미사용 · 외부 스크립트 현재 0개.

**하드닝 코드 수정은 전부 미적용 상태다** — Prime Directive(Human Approval Gate)에 따라
제안까지만이며, 리드/User 승인 후 적용한다. 게이트 자기 판정: **CONCERNS** (사유: 저장소
설정 4건이 로컬에서 확인 불능 → 미확정 분리, 수정 미적용·미검증).

---

## 0. 위협 모델 (MODEL)

```
[npm registry] ──(npm ci, 락파일 해시 고정)──> [빌드 머신·CI 러너]   ← 경계 ①
[GitHub Actions] ──(GITHUB_TOKEN·Pages OIDC)──> [배포]              ← 경계 ②
[MusicBrainz/CAA] ──(편집 시 fetch·이미지 재인코딩)──> [편집 머신] ──(git 커밋)──> 저장소  ← 경계 ③
[원의 수기 프론트매터] ──(Zod 게이트)──> [빌드] ──(Astro 이스케이프)──> HTML  ← 경계 ④ (단일 저자 = 신뢰 입력)
[독자 브라우저] <── GitHub Pages (+ 옵트인 시 gc.zgo.at 1개)         ← 경계 ⑤
```

- 배포 사이트는 **런타임 외부 호출 0** (fetch 지점은 `src/lib/mb/client.ts` 유일 — grep 실측,
  소비자는 `scripts/`뿐). 런타임 SSRF·주입·세션·DoS 계열은 **성립 요건 자체가 없다**.
- 경계 ④의 공격자 = 콘텐츠 저자 = 사이트 소유자 1인. 제3자 콘텐츠 투입 경로(댓글·제보·PR 콘텐츠
  수용)가 없으므로 콘텐츠 경유 발견들(UN-SEC-004/005)은 **방어심층**으로만 분류했다.

---

## 1. 확정 발견 (TRIAGE 통과 — 전건 프로브 또는 실측 근거 보유)

> CVSS 표기 원칙: 외부 공격자 경로가 성립하지 않는 항목에 점수를 만들어 붙이지 않았다.
> 산정 가능한 2건만 참고치 벡터를 명시하고, 나머지는 "미산정 + 조정 우선순위"로 표기한다.
> 근거 없는 심각도가 FAIL 사유라는 규율의 이행이다.

### UN-SEC-001 — CI 워크플로에 명시적 `permissions:` 부재
- **위치:** `.github/workflows/ci.yml:13-19` (워크플로 최상위 — `env:` 다음, `jobs:` 앞)
- **분류:** CWE-250 (최소권한) · CI/CD 공급망 · **우선순위 Medium** (CVSS 미산정 — 실효 영향이 저장소 설정 U-1에 조건부)
- **증거:** 파일 전문에 워크플로/verify 잡 수준 `permissions:` 없음. `deploy` 잡만 92행에 `pages: write` + `id-token: write` 보유.
- **의미:** verify 잡의 GITHUB_TOKEN이 저장소 기본 설정을 따른다. 기본이 read-write면, 잡 안에서 실행되는 **모든 전이 의존 코드**(npm 라이프사이클·vitest·빌드 = 425개 패키지)가 저장소 쓰기 가능 토큰과 같은 프로세스 환경에서 돈다. 의존성 침해 시 피해 상한을 토큰 권한이 정한다.
- **수정 (제안):** 최상위에 `permissions: { contents: read }` 추가. `deploy` 잡 permissions에 `contents: read` 병기 — 현재 deploy 잡은 `checkout`을 쓰는데 permissions 블록이 있으면 미기재 스코프는 none이 된다 (실패 여부는 U-2 미확정 — 선제 병기가 어느 쪽이든 정답).
- **롤백:** 3줄 삭제. **검증:** 다음 CI 런 녹색 + 런 로그의 "GITHUB_TOKEN Permissions" 섹션에서 contents: read 확인.

### UN-SEC-006 — `sharp` 팬텀 의존 (astro *optionalDependencies* 경유)
- **위치:** `package.json:17-22` (dependencies에 부재) · 소비: `scripts/album-add.ts:190` (동적 import — CAA 커버 640px 재인코딩 = **ADR-0008 §2 통제의 실행 지점**) · `src/pages/covers/derived/[image].webp.ts:16` (정적 import — **빌드 자체가 의존**)
- **분류:** CWE-1104 · **우선순위 Medium** (CVSS 미산정 — 가용성·공급망 위생 결함이지 침해 아님)
- **증거:** `npm ls sharp` 실측 → `astro@7.2.10 └── sharp@0.35.4` (astro의 optionalDependencies — 락파일 2745행). 프로젝트 직접 선언 없음.
- **의미:** `npm ci --omit=optional` 환경이나 astro의 향후 sharp 제거/교체 시 커버 파이프라인·빌드가 깨진다(fail-closed — 무결성 침해는 아님). 더 중요하게, sharp(libvips)에 취약점 공지가 났을 때 **프로젝트가 버전을 직접 통제할 계약상 지위가 없다.** CAA 커버는 누구나 업로드할 수 있는 서드파티 이미지이고 그걸 파싱하는 게 sharp다 — 이 의존은 명시적이어야 한다.
- **수정 (제안):** dependencies에 `"sharp": "^0.35.4"` 추가. 락파일은 이미 동일 버전 보유 → dist 해시 불변 기대.
- **롤백:** 1줄 삭제. **검증:** `npm ci && npm run build` + CI 결정성 게이트 통과.

### UN-SEC-003 — 의존성 취약점 자동 모니터링 부재
- **위치:** `.github/` (dependabot.yml 없음 — 실측, `.github` 하위 파일은 `workflows/ci.yml` 단 1개) · CI에 감사 단계 없음
- **분류:** CWE-1104 · A06:2021 예방 관점 · **우선순위 Medium** (현재 실피해 0 — 시간 경과에 따라 위험 단조 증가)
- **증거:** `npm audit` 실측 (2026-09-03): **취약점 0건** / 총 425 패키지 (prod 204 · dev 102 · optional 120). 유지 장치 부재.
- **의미:** "빌드가 곧 런타임"인 제품이라 빌드 타임 의존(satori·resvg·sharp·astro)이 곧 신뢰 경계인데, 이 경계의 노후를 알려줄 장치가 없다. 1인 운영 매체는 수동 점검 루틴을 기대할 수 없다.
- **수정 (제안):** `.github/dependabot.yml` — `npm` + `github-actions` 두 생태계, 주간 스케줄. CI 내 `npm audit` 게이트는 차선(수정 불가 권고 하나로 전 발행이 볼모가 됨 — "부분 발행 없음" 원칙과 상성이 나쁨).
- **롤백:** 파일 삭제. **검증:** 저장소 Security 탭에 Dependabot 활성 표시.

### UN-SEC-002 — 액션 태그 핀 (커밋 SHA 미핀)
- **위치:** `ci.yml:23·25·84·104·114` — `actions/checkout@v7` ×2 · `setup-node@v7` · `upload-pages-artifact@v5` · `deploy-pages@v5`
- **분류:** CWE-829 · **우선순위 Low** (전제 조건 = GitHub 공식 액션 저장소 침해 — 원격·저확률이나 발생 시 배포 토큰까지 파급)
- **증거:** 5개 참조 전부 가변 태그. 서드파티(비공식) 액션 사용은 **0건** (긍정 신호).
- **수정 (제안):** 풀 커밋 SHA 핀 + 주석으로 태그 병기, dependabot `github-actions` 생태계로 갱신 자동화 (UN-SEC-003과 한 몸).
- **롤백:** 태그 표기 복원. **검증:** 다음 CI 런 녹색.

### UN-SEC-004 — `listen_links.url` 스킴 미제한 — `javascript:` 통과
- **위치:** `src/lib/schema/album.ts:18-20` (`z.url()`) → 방출: `src/components/ScoreVerdict.astro:39` (`<a href={link.url}>`)
- **분류:** CWE-79 잠재 / CWE-20 · **우선순위 Low — 방어심층** · CVSS 참고치 3.0 (`AV:N/AC:H/PR:H/UI:R/S:C/C:L/I:L/A:N` — 전제: 저자 자신이 악성 값을 커밋)
- **증거 (프로브 실측):** `listenLinkSchema.safeParse({service:'other', url:'javascript:alert(1)'})` → **통과.** Astro는 속성값을 HTML 이스케이프하지만 URL 스킴은 무해화하지 않는다.
- **오탐 검토:** 외부 공격자 경로 없음(단일 저자·제3자 투입 경로 0) — "취약점"이 아니라 **저자의 복붙 사고를 막는 스키마 계약 강화**로 분류. 자동 생성 링크(`buildListenLinks`)는 `encodeURIComponent` + https 패턴이라 안전 확인.
- **수정 (제안):** `z.url({ protocol: /^https$/ })` (Zod 4 지원). 기존 콘텐츠 영향: 픽스처 포함 전부 https — 위반 0건 기대.
- **검증:** 프로브 재실행 → 거부 확인 + `npm test`.

### UN-SEC-005 — `album.cover` 경로 패턴 미제약 — 빌드 타임 경로 순회
- **위치:** `src/lib/schema/album.ts:42` (`z.string().optional()`) → 소비: `src/lib/og/assemble.ts:29` (`readFileSync(join('public', album.cover))` — 판독 바이트가 base64로 OG 카드 합성) · `src/pages/covers/derived/[image].webp.ts:33` (sharp 재인코딩 후 dist 방출)
- **분류:** CWE-22 · **우선순위 Low — 방어심층** · CVSS 참고치 2.5 (`AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N`)
- **증거 (프로브 실측):** `albumSchema`가 `cover: '../../outside/secret.jpg'`를 **통과**시킨다. `join`은 `../` 순회를 막지 않으므로 머신의 임의 이미지 파일이 공개 산출물에 포함될 수 있다. 검사기 E-202는 **부재**만 보고 경로 형태·실존은 안 본다(`resolve.ts:109` 실측).
- **오탐 검토:** 입력은 소유자 수기 YAML — 신뢰 입력. `album-add`는 검증된 slug로만 `covers/<slug>.jpg`를 쓰므로 도구 경유 오염 경로 없음(실측). 방어심층 + "존재하지 않는 파일" 오류가 스키마 단계에서 잡히는 부수 이득.
- **수정 (제안):** `cover`를 `/^covers\/[a-z0-9]+(-[a-z0-9]+)*\.jpg$/` 패턴으로 제약(album-add 산출 형식과 일치), `cover_source`는 https URL 제약. 픽스처 `covers/fixture-artist-fixture-album.jpg` 부합 — 위반 0건 기대.
- **검증:** 프로브 재실행 + `npm test` + 빌드.

### UN-SEC-007 — CSP 부재 + GoatCounter 스크립트의 무결성 보증 구조 부재
- **위치:** `src/layouts/Base.astro:44` (`<head>` — CSP meta 없음) · `:76-81` (옵트인 스니펫 — `https://gc.zgo.at/count.js`, SRI 없음)
- **분류:** CWE-693/829 · A05:2021 (정적 호스팅 제약 하) · **우선순위 Low** (CVSS 미산정 — 예방적)
- **증거:** GitHub Pages는 응답 헤더 커스텀 불가(플랫폼 제약). **현재 `config/site.yaml`에 `goatcounter_code` 미설정 → 오늘 기준 배포 산출물의 외부 스크립트 0개 (실측).** 활성화 시 gc.zgo.at이 유일한 외부 코드 원점이 되며, 원격 자동 갱신 스크립트라 SRI는 구조적으로 불가.
- **전제 존중:** GoatCounter 채택 자체(§3.8 명문 예외·쿠키 0)는 결함이 아니다 — 지적은 "그 1개를 CSP로 **상한**으로 만들 수 있다"는 것.
- **수정 (제안, 2단):** ① Base.astro `<head>`에 `<meta http-equiv="Content-Security-Policy" content="script-src 'self' https://gc.zgo.at; object-src 'none'; base-uri 'self'">` — 향후 어떤 경로로든 주입된 인라인/타 원점 스크립트를 브라우저가 차단(방어심층 상한). **적용 전 빌드 산출물에 인라인 `<script>`가 없는지 검증 필수** (현재 없음 — 실측 `set:html` 0건·클라이언트 JS 0. 단 meta CSP는 `frame-ancestors`·`report-uri` 무시 — 한계 명시). `style-src`는 Astro 스코프 스타일(`<style>` 인라인)과 충돌하므로 **포함하지 않는다.** ② 대안(선택): `count.js` 셀프호스트로 외부 원점 자체 제거 — 갱신 수동화 비용과 맞교환, User 결정 사안.
- **검증:** 격리 빌드 + 브라우저 콘솔에서 CSP 위반 0건 + GoatCounter 활성 상태 카운트 정상 동작 확인.

### UN-SEC-008 — MB `mbid` 무검증 URL 보간 + 응답 무검증 캐스트
- **위치:** `src/lib/mb/client.ts:85-96` (`getReleaseGroup`·`fetchCoverFront` — 검색 응답의 `picked.id`를 UUID 검증 없이 URL 경로에 보간) · 응답 `as MbSearchResponse` 캐스트
- **분류:** CWE-20 · **우선순위 Info** (전제 = musicbrainz.org 침해/MITM — 원격)
- **하류 방어 확인 (오탐 검토):** MB발 문자열의 파일 유입은 `yaml stringify(QUOTE_DOUBLE)`·`JSON.stringify` 안전 직렬화 → 재판독 시 Zod 게이트 → 렌더 시 Astro 이스케이프. slug·경로에는 검증된 값만. **주입 경로는 하류에서 닫혀 있다.**
- **수정 (제안):** UUID 정규식 1개 (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`). 계약의 명시화 목적.

---

## 2. 미확정 (별도 분리 — 확정 발견과 섞지 않음)

로컬 작업 트리에서 **원리적으로 확인 불가능**한 저장소/플랫폼 설정 4건. 전부 GitHub 웹 UI 1분 확인.

| # | 항목 | 확인 방법 | 왜 중요한가 |
|---|---|---|---|
| U-1 | Actions 기본 토큰 권한이 read-only인가 | Settings → Actions → General → Workflow permissions | UN-SEC-001의 실효 심각도를 정한다 (2023-02 이후 신규 저장소 기본은 read-only이나 **가정하지 않는다**) |
| U-2 | deploy 잡의 `checkout`이 `contents` 미지정(→none) 상태로 성공하는가 | 첫 Pages 배포 런 관찰 (선제 수정이 정답이라 실험 불요) | 실패 시 배포 자체가 안 됨 — 보안 아닌 가용성 |
| U-3 | main 브랜치 보호(직접 push 차단 + CI 필수) 설정 여부 | Settings → Branches | push→main이 곧 배포 트리거다. 1인 운영이라도 크리덴셜 탈취 시 보호선이 된다 |
| U-4 | Pages "Enforce HTTPS" 활성 여부 | Pages 활성화 시(launch-gate §5 ①) Settings → Pages | github.io 기본 제공이나 명시 확인 필요 |

## 3. 해당 없음 (정직한 N/A — 억지 항목 없음)

SQL/NoSQL 주입 · 인증·세션·접근제어(A01/A07) · CSRF · 런타임 SSRF(**배포 사이트의 외부 호출 0** — fetch는 편집 CLI 전용) · XXE·역직렬화 · 런타임 DoS/레이트리밋 · 런타임 시크릿 관리 — **성립 요건(서버·상태·입력)이 제품에 존재하지 않는다.** 저작권/판례 판단은 ADR-0008에 이미 "미확인 — 법률 검토 필요"로 명시돼 있어 재논평하지 않는다(리드 지시 — 본 감사는 취득 경로의 기술 안전성만 봤고, 위 UN-SEC-005/006/008이 그 결과다).

## 4. 긍정 실측 (검증하고 통과한 것)

- **비밀값 커밋 0건** — API 키·토큰·개인키 패턴 grep 전수(src·scripts·config·content·public·.github): 매치 0. `.gitignore`가 `.env*`·`*.pem`·`*.key`·감사로그 키를 선제 차단.
- **알려진 취약점 0건** — `npm audit` 425패키지 (2026-09-03 실측).
- **라이프사이클 스크립트 최소** — `npm query` 실측: install 훅 보유 패키지는 `esbuild@0.28.2` postinstall **단 1개** (표준·주지). sharp/resvg는 prebuilt optionalDependencies 방식 — install 스크립트 0.
- **워크플로 위생** — `pull_request_target` 미사용 · `run:`에 비신뢰 컨텍스트(`${{ github.event.* }}` 류) 보간 0건 · 시크릿 참조 0건(Pages OIDC만) · 배포는 main push + 전 게이트 통과 후 검증된 `dist-1` 바이트 그대로(ADR-0009 원자성 구조 확인).
- **출력 경로** — `set:html`·`innerHTML` 0건(grep 전수) · OG 카드는 문자열 HTML 조립이 아닌 element-tree(satori) · 외부 링크 `rel="noopener"` · 폰트 셀프호스트(CDN 0) · `cover_source`는 기록 전용(HTML 방출 지점 없음 — grep 실측).
- **MB 클라이언트 예절** — UA에 연락처(공개 저장소 URL — PII 아님·의도된 설계 확인) · 1.1s 스로틀 · Lucene 이스케이프 + `encodeURIComponent` · 타임아웃·단일 재시도.
- **PII 수집 지점 0** — 현재 구성 기준 쿠키·폼·계측 모두 없음(GoatCounter 활성화 시에도 쿠키 0 설계).

## 5. 커버리지 명세 (본 것 / 못 본 것)

**본 것:** 리드 지정 5개 표면 전부 — ① 공급망(audit·라이프사이클·팬텀 의존·락파일 구조), ② CI/배포(ci.yml 전문·트리거·권한·핀·주입·원자성), ③ 외부 데이터(mb/client·scaffold·album-add·finalize의 쓰기 경로·스키마 프로브), ④ 출력(레이아웃·컴포넌트 방출 지점·OG 파이프라인·CSP/헤더 제약), ⑤ 비밀값·PII(패턴 스캔·gitignore·UA).

**못 본 것 (정직 공개):** ⓐ 저장소/플랫폼 설정 — §2 미확정 4건. ⓑ 425개 전이 의존의 **소스 레벨** 감사 — `npm audit`(공지 DB)와 라이프사이클 훅 조회로 대체, 미공지 악성코드는 본 방법으론 못 잡는다. ⓒ `tests/`·`e2e/` 내부와 빌드 산출물(dist) 바이트 스캔 — 배포 전 산출물 검사는 QA(Matthias) E2E와 postbuild 게이트가 커버 중. ⓓ `subset-fonts.py` 전문(헤더 40행만 — 편집 타임 로컬 도구·네트워크 접근 없음 확인 수준). ⓔ MB/CAA **실서비스** 응답 검증 — RoE상 무접촉.

## 6. 재개 지점 (다음 감사 세션용)

1. §2 미확정 4건 확인 (User의 GitHub UI 1분 ×4) → UN-SEC-001 실효 심각도 확정.
2. 승인 시 §1 수정 8건 적용 + 각 항 "검증" 절차 수행 — **적용 전까지 전부 '제안' 상태.**
3. Andrew의 B-1 리팩터 커밋 후: `withBase` 관통이 새 URL 조립 지점을 만들었는지 1회 재점검(경로 조작 관점 — 현재 진행분과 본 발견은 비중첩 확인됨).
4. GoatCounter 활성화 결정 시: UN-SEC-007 CSP meta 적용·검증을 그 직전에.

## 7. 게이트 자기 판정 — **CONCERNS**

- 범위 준수 100% · Do No Harm 위반 0(외부 접촉 0) · 확정 발견 전건 증거+수정안+롤백 구비 · 오탐 검토 수행(§1 각 항 명시) · 비밀값 노출 0(마스킹할 대상 자체가 미발견).
- **CONCERNS 사유:** ① 미확정 4건 존재(로컬 확인 불능 — §2), ② 수정 전건 미적용·미검증(승인 게이트 대기), ③ §5 ⓑ~ⓔ 커버리지 공백. PASS 선언은 ①·② 해소 후에 가능하다.
