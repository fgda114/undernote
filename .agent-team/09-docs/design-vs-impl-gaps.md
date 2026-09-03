# undernote — 설계 vs 구현 간극 (Design-vs-Impl Gaps)

| | |
|---|---|
| 작성 | Timothy (역할 #11 · Docs Engineer) · 2026-09-03 |
| 방법 | 상류 설계 문서(`.agent-team/04-architecture/**`)와 W5 구현 코드(77파일)를 직접 대조. 코드 근거 없는 항목은 적지 않았다. 실행 가능한 것은 실제로 실행해 확인했다(`npm test`·`npm run check`·`npm run build`) |
| 범위 | 리드가 지정한 이미 확인된 gap 2건(①·②) + 자체 발견 3건(③·④·⑤) + "이미 판단 끝난 것 재확인" 1건 |

---

## ① E-101 문구 부정확 — `exceptions.md`가 아티스트를 잘못 포함한다

**상태: 확인됨. 코드는 옳고, 설계 문서 문구가 틀렸다.**

- `exceptions.md:124` — `E-101 | 본문 없는 평론·이야기·**소개글**` (아티스트 소개글을 포함하는 문구)
- `api-contracts.md:150` — Artist 스키마: `name: { minLength: 1 } # 표기명. 본문 = 소개글 (빈 본문 허용 — US-14)`

이 둘은 같은 문서군 안에서 서로 모순된다. 구현은 §3.4·US-14 쪽을 따랐다:

```ts
// src/lib/checker/resolve.ts:13-16
// Empty artist body is NOT E-101: an aggregation-only artist page is a
// designed state (api-contracts §3.4, US-14/R-4) — E-101 applies to reviews
// and stories, where the body IS the product.
```

`resolve.ts:46-53`(리뷰)과 `resolve.ts:131-138`(이야기)에서만 빈 본문을 E-101 실패로 처리하고, 아티스트 루프(`resolve.ts:71-128`)에는 그런 검사가 아예 없다 — 의도적 배제이지 누락이 아니다(주석이 명시적).

단위 테스트도 이 동작을 고정한다: `tests/unit/checker.test.ts` 무효 저장소 스위트가 아티스트 빈 본문을 실패로 기대하지 않는다(빈 본문 아티스트 픽스처가 유효 저장소 쪽에 있음 — `tests/fixtures/valid-repo/content/artists/fixture-artist.md` 등).

**정정안 (제안):**

```diff
- E-101 | 본문 없는 평론·이야기·소개글
+ E-101 | 본문 없는 평론·이야기 (아티스트 소개글은 예외 — 빈 본문 허용, §3.4·US-14·R-4)
```

`exceptions.md` 2부 표(§`E-1xx`)의 E-101 행 문구를 위와 같이 바꾸는 것을 제안한다. 반영은 리드 승인 사항(James 소유 문서, Timothy는 정정안 제시까지).

---

## ② `ArchiveItem`/`artist-intro` — 계약 결함은 해소됐으나, 해소 방식이 문서 지시와 다르다

**상태: 원래 결함은 W5.3에서 이미 해소됨(설계 문서에 기록 완료). 그런데 해소를 구현한 방식이 문서가 명시한 지시와 어긋난 부분이 하나 있다 — 실질 영향은 없지만 정확히 기록한다.**

`api-contracts.md` §4.4는 원래 `type` enum에 `artist-intro`를 허용하면서 `date`를 required로 두어 충족 불가능한 요구였다(아티스트는 발행일이 없음). 해소책은 **"artist-intro를 방출하지 않는다 + `type` enum에서 artist-intro를 제거하지 않고 남겨 둔다"**(`api-contracts.md:387-406`, 리드 Paul 승인 명시):

> `type` enum에서 `artist-intro`를 제거하지 않고 남겨 둔다 — 향후 아티스트에게 발행일 개념이 생기면(예: 소개글 작성일 도입) 계약 변경 없이 켤 수 있다. **현재는 미사용이다.**

그런데 실제 TypeScript 구현은 enum에서 **완전히 제거**했다:

```ts
// src/lib/derive/archive.ts:23
export interface ArchiveItem {
  type: 'review' | 'story';   // 'artist-intro' 없음
  ...
}
```

**동작(비방출)은 문서의 해소책과 정확히 일치한다** — `archive.ts:14-16` 주석이 같은 근거(발행일 없음)를 그대로 재진술한다. 어긋나는 것은 "미래를 위해 enum에 값을 남겨 둔다"는 지시뿐이다. TypeScript의 판별 유니온 타입(discriminated union)은 JSON Schema의 enum과 성격이 달라 — "정의는 되어 있으나 값은 안 나온다"를 타입 레벨에서 표현하려면 `type: 'review' | 'story' | 'artist-intro'`로 남겨두고 소비 측에서 분기 누락을 감수해야 하는데, 그렇게 하지 않았다.

**실무 영향: 없음.** 아티스트에게 발행일 개념이 생기는 시점에 `type` 유니온에 멤버 하나를 추가하는 것은 사소한 변경이며 "계약 변경 없이 켠다"던 원래 취지(문서 쪽 수정 불요)도 이미 훼손되지 않는다 — 코드 쪽 한 줄 추가로 끝난다. **문서와 코드 중 어느 쪽을 고칠지는 리드 판단 사항으로 남긴다:**
- 안 A: `api-contracts.md`의 "제거하지 않고 남겨 둔다" 문구를 "코드에서는 제거해도 무방(재추가 비용 낮음)"으로 완화.
- 안 B: `archive.ts:23`의 유니온에 `'artist-intro'`를 추가하고 방출 코드에서 절대 만들지 않는 방식으로 문서 지시를 문자 그대로 따름(현재 아무 이득 없이 타입만 넓어짐).

Timothy 권고(제안일 뿐, 결정은 리드): 안 A. 코드가 이미 정확하고 테스트(`tests/unit/derive-archive.test.ts`)가 이 상태를 고정하고 있어, 억지로 타입을 되돌리는 것은 "당장 쓰이지 않는 유연성"을 위해 타입 안전성을 낮추는 트레이드오프다.

---

## ③ [신규 발견] `npm run check`가 현재 재현 가능하게 실패한다

**상태: 실측·재현 완료(3회 연속 동일 결과). 코드 결함이지 문서 결함이 아니다.**

```
tests/unit/derive-lists.test.ts:47:7 - error ts(2741):
  Property 'early_stage_threshold' is missing in type
  '{ site_name: string; base_url: string; active_year: number; og_use_cover: true; }'
  but required in type '...; early_stage_threshold: number; ...'.
```

**원인:** `src/lib/schema/config.ts:55-77` `siteConfigSchema`에 `og_use_cover`(W5.2 §7 가산)와 `early_stage_threshold`(W5.2 §7 가산)가 `.default()`로 추가됐다. Zod v4에서 `.default()`가 붙은 필드는 **입력 타입에서는 옵션이지만 출력 타입(`z.infer`)에서는 필수**가 된다 — 이 breaking change는 `.agent-team/08-impl-notes/frontend.md`의 W5.0 절 "Zod v4 breaking 실확인 ②"에 이미 정확히 문서화돼 있다. 그런데 W5.2에서 이 필드들을 추가할 때 `tests/unit/derive-lists.test.ts:47-52`의 `const site: SiteConfig = {...}` 리터럴 픽스처가 갱신되지 않았다.

**영향 범위 (실측으로 구분):**

| 명령 | 영향 | 근거 |
|---|---|---|
| `npm test` (vitest) | ❌ 무관 | esbuild가 타입을 지우고 실행 — 131/131 통과 실측 |
| `npm run build` (astro build) | ❌ 무관 | 별개의 타입 생성 경로 — 정상 완료 실측(exit 0, 13 pages) |
| `npm run check` (astro check) | ✅ **실패** | tsc 전수 타입 검사 — 3회 재현 |
| CI `verify` 잡 | **영향 예상** | `.github/workflows/ci.yml:37-38`에 `npm run check` 단계가 있고 실패 허용 옵션이 없음 — 그대로 push하면 CI가 이 단계에서 실패할 것으로 판단됨(실제 CI 실행으로 재확인은 못 함, GitHub Actions 실행 권한 밖) |

이 항목이 CI에서 이미 막혔던 적이 있는지(즉 이번이 회귀인지, 애초에 그린을 본 적이 없는지)는 git 이력·Actions 로그 확인이 필요해 **미확인**으로 남긴다. impl-notes 각 스토리는 반복적으로 "npm run check → 타입 0오류"를 재현 명령에 포함시켰는데(W5.1: "80 테스트 · 타입 0오류"), W5.2/W5.5에서 필드 추가 후 이 재현 명령을 실제로 재실행했다는 기록은 impl-notes에 없다.

**수정 방향 (제안, 코드 변경은 Timothy 권한 밖 — 리드/Andrew 몫):** `tests/unit/derive-lists.test.ts:47-52`의 `site` 픽스처에 `early_stage_threshold: 6` 추가(그리고 향후 `goatcounter_code` 등 신규 옵션 필드 추가 시 이 파일이 유일한 리터럴 타입 픽스처임을 코드 리뷰 체크리스트에 남기는 것을 권고).

---

## ④ [신규 발견] `CoverSet.fallback` — §7 절차 없이 추가된 파생 인터페이스 필드

**상태: 실무 영향 낮음(하위 호환 가산). 절차 누락만 기록.**

`api-contracts.md` §4.3 `CoverSet`은 `w96 · w320 · w640 · alt` 4필드만 규정한다. 구현(`src/lib/covers.ts:16-24`)은 다섯 번째 필드 `fallback`(비-WebP 에이전트용 `<img>` 폴백 — 축소 마스터 원본 경로)을 추가했다:

```ts
export interface CoverSet {
  w96: string; w320: string; w640: string; alt: string;
  fallback: string;   // 문서에 없음
}
```

`api-contracts.md` §7은 "필드 추가는 하위 호환(옵션으로 추가)"을 허용하지만 절차는 "문서 먼저 → Zod 반영"이다. `CoverSet`은 Zod 스키마가 아니라 파생 데이터 구조(§4)이지만, 같은 문서가 §4 전체를 "규범"으로 선언하고 있어(`api-contracts.md:14` 표: "빌드 도출 데이터 구조 ... 검증 주체: derive 단위 테스트 + checker") 이 필드도 그 대상이다. 문서 갱신이 코드보다 뒤처진 사례.

**정정안 (제안):** `api-contracts.md` §4.3 CoverSet에 `fallback: { type: string }  # 축소 마스터 원본 — non-WebP 에이전트 <img> 폴백` 한 줄 추가.

---

## ⑤ [확인 완료 — gap 아님, 기록만] astro.config의 `site`/`base` 미설정과 하드코딩된 절대경로 링크

이미 `w5-5-launch-gate.md` §5의 User 잔여 작업 ④로 명시적으로 추적되고 있는 항목이라 **숨겨진 gap은 아니다.** 다만 "왜 필요한가"의 구체적 메커니즘이 어느 문서에도 적혀 있지 않아, 코드 확인 결과를 여기 남긴다.

- `astro.config.ts:21-22` 주석: "`site`/`base`가 intentionally not set … og:url derives from config/site.yaml#base_url instead."
- 그러나 리스트·아카이브·역링크 등 전 도출 데이터의 URL 필드는 Astro의 base 인식 헬퍼가 아니라 **하드코딩된 루트 상대 경로 문자열**이다: 예) `lists.ts:101` `review_url: \`/reviews/${j.slug}/\``, `archive.ts:58,71` `url: \`/reviews/${review.slug}/\`` 등.
- Astro의 `base` 설정은 이런 직접 작성 문자열 href를 자동으로 접두하지 않는다(Astro 공식 동작 — `base`는 라우팅·자체 자산 헬퍼에만 적용). 즉 **`base`를 지금 설정해도 이 하드코딩 경로들은 별도 수정 없이는 여전히 서브패스를 반영하지 않는다** — `base`만 설정하면 끝나는 "5분 작업"(impl-notes 표현)이 아닐 수 있다.
- `config/site.yaml:5`의 실제 `base_url`은 이미 서브패스(`https://fgda114.github.io/undernote`)다. 즉 **현재 상태로 GitHub Pages에 배포하면 canonical/OG URL(절대 URL, `absoluteUrl()` 경유)은 서브패스를 포함해 올바르지만, 사이트 내부 탐색 링크(`<a href="/reviews/...">` 등)는 서브패스 없이 도메인 루트를 가리켜 404가 날 가능성이 있다.**
- E-112(내부 링크 검사, `postbuild.ts:53-76`)는 `dist/` 산출물 **자체 내부의 상대적 일관성**만 검사한다 — `base` 불일치로 인한 배포 후 404는 이 검사의 탐지 범위 밖이다(로컬 `dist/`에는애초에 `/undernote` 프리픽스가 없는 파일 트리이므로 자기 자신과는 항상 일치한다).

**결론: 새 gap이 아니라 이미 추적 중인 항목의 실패 메커니즘을 구체화한 것.** User가 커스텀 도메인을 쓰지 않고 서브패스 그대로 공개할 경우, `base` 설정만으로는 부족하고 URL 생성 지점(위 하드코딩 문자열들)을 `import.meta.env.BASE_URL` 등으로 일괄 치환하는 작업이 필요할 수 있다는 점을 배포 전 재확인 항목으로 제안한다. 실제 배포 후 실측 전까지는 **미확인**.

---

## 참고 — gap으로 오인하지 말 것 (리드 사전 안내 + Timothy 재확인)

아래는 리드가 사전에 "이미 판단 끝남"으로 안내한 항목이며, 코드를 직접 읽고 실제로 그렇게 구현돼 있음을 재확인했다(재론하지 않음):

1. `derive/lists.ts`의 종료월 판정 시계(`currentYearMonthSeoul`, `lists.ts:111-113`) — R-10이 허용한 유일한 도출(derive) 시계 소비처. `grep -rn "new Date\|Date.now" src/lib`로 확인: 이 함수 외에는 `mb/client.ts`(MB 레이트리밋 간격 측정 — 날짜 귀속과 무관)와 `checker/index.ts:46`(`build-report.json`의 `built_at`, 기록용·`dist/` 밖)뿐. `scripts/finalize.ts`의 `todaySeoul()`(기록용 `finalized_at`)은 `src/lib` 밖이라 이 grep 범위에는 없지만 별도로 확인함 — 전부 R-10 원칙(도출 로직은 시계 무관)과 합치.
2. GoatCounter 스크립트 — ADR-0002 "클라이언트 JS 0"의 옵트인 예외로 `api-contracts.md` §3.8에 명문화, `Base.astro:58-73` 코드가 그 문서 그대로 조건부 삽입.
3. 성능 예산(500KB) 초과 — 리드 1차 공개 수용 확정 기록이 `w5-5-launch-gate.md` §1에 있고, 실측치(폰트 포함 ~754~1,067KB)도 같은 문서에 있음.
4. ADR-0002 Astro 버전 정정(5→7.x) — `adr/ADR-0002-ssg-astro.md`에 정정 이력 기록, `package.json:11` `"astro": "7.2.10"`과 일치.

추가로 Timothy가 자체 확인한 것 — **계보 시각화(role: lead/follow) 미구현**은 스키마에 필드는 있으나(`story.ts:12-18`) 소비 코드가 없다(`grep -rn "role" src/lib`가 스키마 정의 외에는 미검출). `.agent-team/08-impl-notes/frontend.md` W5.4 #1이 "원 무응답 → 안 A 확정 구현"이라고 명시적으로 기록한 **설계된 대기 상태**이므로 gap으로 분류하지 않았다.
