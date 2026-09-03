# W6 코드 리뷰 — Thomas (2026-09-03)

| | |
|---|---|
| 대상 | `src/**` · `scripts/**` · `tests/**` · `config/**` · `.github/workflows/ci.yml` · `astro.config.ts` (77파일 · 테스트 131개) |
| 기준 | `04-architecture/`(api-contracts · exceptions R-1~10/E-100~405 · design-patterns P1~P10 · code-structure) · `08-impl-notes/` |
| 방법 | 전 소스 정독 + 실측(테스트 스위트 실행 · 2회 빌드 해시 비교 · 스키마/라벨 프로브 4건 실행) |
| 판정 | **blocking 1 · major 4 · minor 11.** blocking은 코드 결함이 아니라 배포 경로 결함(서브패스)이며, 해소 경로 2개 중 선택은 리드 몫 |

리드 지시대로 다음 3건은 결함으로 취급하지 않았다: ① `derive/lists.ts` 종료월 시계(R-10 유일 허용 소비처 — 소스 감사로 유일성 확인함) ② GoatCounter 옵트인 스크립트(§3.8 명문 예외) ③ `artist-intro` ArchiveItem 미방출(§4.4 승인 결정). 기지 사항(성능 예산·픽스처 콘텐츠·E-303 콜드 스타트)도 재지적하지 않았다.

---

## 0. 실측 결과 (사실)

- `npm test`: **131/131 통과** (12파일, 4.0s).
- **결정성 게이트 로컬 재현: 통과.** 콜드 캐시 2회 빌드(`--outDir` 분리) dist 해시 동일 — `12426efe…d72e1d`. (주: 리뷰 초반 2회 빌드 실패는 동시 진행 중인 QA 세션과의 `dist/` 경합이었다 — 코드 결함 아님. CI는 단일 빌드라 무관.)
- **시계·로케일·순회 감사: 깨끗.** `Date.now`/`new Date` 소비처 전수 = `currentYearMonthSeoul`(R-10 허용) · `writeBuildReport` built_at(dist 밖) · mb 스로틀(편집 시점) · finalize `todaySeoul`(기록값 — 도출 입력 아님). `localeCompare` 0건. `Object.entries` 순회는 YAML 삽입 순서라 결정적.
- **E-100~E-405 전수 대조: 29코드 전부 정의와 일치하는 지점에서 사용.** 고아 코드·미정의 참조 없음. E-115는 문서화된 대로 타입 레벨 강제(카드 입력 타입에 score 필드 부재 + 단위 테스트 고정) — 승인된 방식.
- **R-1 전순서: 단일 comparator(`compareR1`)를 보드·10선·월말정산·E-301·finalize가 전부 공유.** 도출 경로 간 불일치 없음. 점수는 문자열 저장 + `scoreToTenths` 정수 연산으로 일관 — float 누수 지점을 찾지 못했다.
- **스키마 단일 정의 규칙: 준수.** `src/lib/schema/`가 유일 정의, `content.config.ts`는 배선만, checker `load.ts`는 동일 모듈 소비. 위반 없음.

---

## BLOCKING

### B-1. 서브패스 배포 시 전 내부 링크·에셋 파손 — 게이트 체크리스트의 처방이 틀려 있다

- **위치:** `astro.config.ts:23-25`(site/base 의도적 미설정) · `config/site.yaml:5`(`base_url: https://fgda114.github.io/undernote`) · URL 생성 전 지점(`src/lib/derive/lists.ts:104` `review_url: /reviews/…` 등 derive·pages·components 전반 — `BASE_URL`/`import.meta.env` 사용 **0건**, grep 실측).
- **재현:** launch-gate §5 체크리스트를 그대로 이행(①Pages 활성화 → 픽스처 제거 → push)하면 CI deploy가 `fgda114.github.io/undernote/`(프로젝트 서브패스)에 배포한다. 산출 HTML의 `href="/archive/"`는 `fgda114.github.io/archive/` → **404**. `/fonts/*`·`/covers/*`·`/og/*`도 전부 404 → 전 내비게이션·폰트·커버·OG 이미지 사망. E-112는 dist 내부 정합만 보므로 구조적으로 검출 불능.
- **왜 blocking인가:** `w5-5-launch-gate.md` §5 ④는 이를 "커스텀 도메인(**선택**) — 전까지 astro.config `base` 설정 필요, **5분 작업**"으로 기재했는데 **두 가지가 틀렸다.** (1) Astro `base`는 템플릿·derive에 수기로 쓴 루트 상대 href를 재작성하지 않는다 — base만 설정하면 페이지는 `/undernote/` 밑에 놓이고 링크는 여전히 루트를 가리켜 오히려 확실히 깨진다. (2) 따라서 '선택'이 아니라 서브패스 배포의 성립 불능 조건이다. 체크리스트를 신뢰하고 공개하면 100% 파손 상태로 릴리스된다.
- **권고 (양자택일 — 리드 결정):**
  - **ⓐ 커스텀 도메인(루트 배포)을 릴리스 전제 조건으로 승격** — 코드 무수정. User 작업 ④를 '선택'에서 '필수(서브패스 배포 포기)'로 정정.
  - **ⓑ base prefix 리팩터** — URL을 만드는 전 지점(derive의 `review_url`·`/stories/`·`/artists/`·`/archive/`·covers·og 경로, 컴포넌트 href, Base 레이아웃 폰트 preload)에 base 접두를 관통시키는 반나절 규모 작업(Hananiah). "5분"이 아니다.
  - 어느 쪽이든 **launch-gate 문서의 잘못된 처방 문구는 정정 필요** (문서 소유자 경유).

---

## MAJOR

### M-1. `album-add`: 기존 커버를 존재 검사 **전에** 덮어씀 — 중단하면서 이미 파괴

- **위치:** `scripts/album-add.ts:186-197`(커버 다운로드·`public/covers/<slug>.jpg` 저장 = 스텝 3) vs `scripts/album-add.ts:203-208`(`albumPath` 존재 검사·중단 = 스텝 4).
- **재현:** 이미 발행된 slug와 같은 값으로 `album-add` 실행 → CAA 커버가 **기존 커버 파일을 먼저 덮어쓴 뒤** "이미 있습니다 — 중단합니다"가 출력된다. 사용자는 아무 일도 없었다고 믿지만 `public/covers/<slug>.jpg`는 이미 교체됐다. 다음 빌드에서 파생 webp 3종이 전부 조용히 바뀐다. (git이 잡아주지만 `publish` 커밋에 섞이면 그대로 배포된다.)
- **권고:** `existsSync(albumPath)` 검사를 스텝 3(커버 확보) **이전**으로 이동. 1줄 이동 수준.

### M-2. `album-add` 부분 쓰기 → 고아 아티스트 → E-113으로 **전 사이트 발행 정지**

- **위치:** `scripts/album-add.ts:151-156`(아티스트 파일을 스텝 2에서 즉시 생성) vs `scripts/album-add.ts:210-215`(앨범 파일은 스텝 4에서 생성).
- **재현:** `album-add` 실행 → 아티스트 slug 프롬프트까지 답한 뒤 버킷 프롬프트에서 Ctrl-C(또는 커버 단계 크래시, 또는 M-1의 중복 slug 중단) → `content/artists/<slug>.md`만 잔존. 다음 빌드에서 E-113(무참조 아티스트) = **E-1xx 빌드 실패** → "부분 발행 없음" 원칙에 의해 **무관한 신규 평론까지 전부 배포 불가.** E-113 메시지가 파일 경로를 알려주므로 복구는 가능하지만, 편집 도구가 검증 게이트를 걸어 넘어뜨리는 함정이다.
- **부수:** E-113 메시지의 "이 아티스트를 다루는 **앨범**/이야기를 발행하거나"(`src/lib/derive/archive.ts:104`)는 부정확 — 앨범 파일만으론 축에 편입되지 않고 **평론**이 있어야 한다.
- **권고:** 파일 쓰기(아티스트+앨범+커버)를 전부 수집 후 말미에 일괄 수행(원자화). 메시지의 "앨범"→"평론" 정정.

### M-3. `finalize`가 shape 검증만 하고 확정 — cross-file 결함(E-102 등)을 안은 채 동결 가능

- **위치:** `scripts/finalize.ts:70-76` — `loadRepo`만 호출. `resolveRepo`(E-101~114 cross-file)를 안 거친다. 메시지는 "콘텐츠 검증 실패 상태에서는 확정할 수 없습니다"라 주장하지만 실제로는 **절반만 검사**한다.
- **재현:** 평론 X의 `album` 필드에 오타(실존 slug 형식, E-102 상태) → 빌드는 실패 중이지만 `finalize --year 2026 --yes`는 **성공**한다. `joinReviews`가 X를 조용히 탈락시킨 채(`src/lib/derive/lists.ts:70` `if (!album) continue`) 10선·버킷을 동결 → **X가 빠진 잘못된 연간 리스트가 불변 스냅샷으로 확정.** 이후 오타를 고쳐도 스냅샷엔 소급되지 않는다(R-2 — 그게 스냅샷의 정의라서 더 위험). 제품의 유일한 불변 산출물이 조용히 오염되는 경로다. 복구는 "스냅샷 삭제 후 재실행" 수칙으로 가능하나, 잘못됐음을 알아챌 장치가 없다.
- **권고:** `loadRepo` 대신 `runPrePass(root)`(`src/lib/checker/index.ts:18`) 사용 — 1줄 교체로 전 E-1xx가 확정 전 관문이 된다.

### M-4. 구반 앨범의 버킷 라벨이 raw id로 노출 + 지면 간 불일치 — 주석이 성립하지 않는 전제를 주장

- **위치:** `src/lib/derive/review-page.ts:52-58` `bucketLabelFor` — 주석 "The checker (E-104) guarantees existence at build time; the fallback only serves non-build consumers"는 **틀렸다.** R-8에 따라 발매 연도 블록이 없는 구반 앨범은 전 연도 합집합으로 E-104를 **통과**하므로, 실빌드에서 `block === undefined` → 라벨이 raw id로 떨어진다.
- **재현 (프로브 실측):** `bucketLabelFor('pop', 2020, {years:[{year:2026, buckets:[{id:'pop', label:'팝',…}]}]})` → `"pop"` 반환. 즉 2020년 발매작 평론(구반 — R-3가 명시 지원하는 1급 콘텐츠)의 히어로에 "팝" 대신 "pop"이 표시된다. 한편 아카이브 허브(`src/pages/archive/index.astro:17-23`)는 자체 합집합 조회로 "팝"을 표시 — **같은 버킷이 지면마다 다른 표기.**
- **권고:** 발매 연도 블록 부재 시 전 연도 블록에서 라벨 탐색(합집합 폴백 — E-104 검증 로직과 대칭). stale 주석 정정. 이 폴백 케이스는 테스트 사각지대이기도 하다(`bucketLabelFor` 테스트는 정상 블록·etc만 커버).

---

## MINOR

### m-1. `snapshotSchema`에 `.strict()` 누락 — 계약 §3.7 `additionalProperties: false` 불일치
`src/lib/schema/snapshot.ts:20-38`. 프로브 실측: 미지 최상위 키가 통과한다. E-114("스냅샷 스키마 위반")의 검출력이 계약보다 약하다. 수동 편집 금지 수칙의 기술적 짝이 스냅샷에서만 빠져 있다(다른 콘텐츠 스키마는 전부 strict). 권고: `.strict()` 추가(중첩 top10/nominee 항목 포함 여부는 계약 문언상 최상위만 필수).

### m-2. `tagRegistrySchema` — 계약은 `tags` 필수(`required: [tags]`), 구현은 `default([])`
`src/lib/schema/config.ts:52-63`. 프로브 실측: `{}`가 통과. 실해는 없으나(빈 등록부와 동치) 계약-코드 자구 불일치. 문서 §7 원칙("의미가 달라지면 문서를 먼저 고친다")에 따라 코드를 계약에 맞추거나 계약을 옵션으로 완화.

### m-3. 달력 유효성 미검증 — `"2026-13-45"`가 date로 통과 (PLAUSIBLE)
`src/lib/schema/common.ts:27-50` — 패턴만 검사(계약 §1도 패턴만 요구하므로 **계약 위반은 아님**). 실측: 통과. 귀결: `date: "2026-13-01"` 오타는 이듬해가 되면 `"2026-13" < "2027-xx"`로 종료월 판정을 넘어 **존재하지 않는 "13월" 정산 페이지**를 생성할 수 있다. 방어 제안: 월 01–12·일 01–31 범위 refine 1개.

### m-4. P1 침식 2건 — 판단 로직이 페이지 프론트매터에
- `src/pages/index.astro:28-32` — 최신 평론 히어로 선정 정렬(date desc → compareR1)이 페이지에 인라인.
- `src/pages/reviews/[slug].astro:66-75` — "{아티스트}의 다른 글" 복수 아티스트 합집합·현재 평론 제외·URL 중복 제거가 페이지에 인라인.
둘 다 결정적 comparator를 쓰므로 결정성 문제는 없으나, **골든 테스트가 못 보는 위치**다(.astro는 vitest 사각). derive로 이동하면 기존 테스트 체계에 편입된다. code-structure §3.2 자구("정렬·필터가 템플릿에 나타나면 반려")를 엄격 적용하면 반려감이지만, 규모·결정성을 감안해 minor로 분류.

### m-5. 평론 페이지가 genres.yaml을 재판독 — 로드 경로 이원화
`src/pages/reviews/[slug].astro:41` — `readFileSync + parseYaml + genresConfigSchema.parse`를 페이지에서 직접 수행. `getSiteData().data.genres`가 같은 프론트매터에서 이미 로드돼 있다. 중복 IO(평론 수만큼)+ 두 경로가 어긋날 여지. 권고: siteData 사용으로 통일.

### m-6. `postbuild.ts` 헤더 주석 stale — E-113 "SCAFFOLD, W5.3 widens"
`src/lib/checker/postbuild.ts:5-11` — E-113은 W5.3에서 `resolve.ts`+`archive.ts` 확정판으로 이동 완료됐는데, 이 주석은 여전히 "reachability is computed here"·"W5.3에서 확장 예정"이라 말한다. 6개월 뒤 혼자 읽을 때 E-113 구현 위치를 오도하는 전형적 stale 주석. (①번 렌즈 기준 이 코드베이스의 주석 품질은 전반적으로 매우 높다 — 어긋난 주석은 이것과 M-4 두 건이 전부였다.)

### m-7. E-112가 `srcset`을 스캔하지 않음
`src/lib/checker/postbuild.ts:64` 정규식이 `href|src`만 매칭. `CoverImage`의 `<source srcset={…webp}>`(`src/components/CoverImage.astro:40`)은 사각. 현재는 파생 엔드포인트가 같은 `cover` 필드에서 생성되므로 실질 위험 낮음 — 기록 목적.

### m-8. `finalize`의 active_year 치환 실패가 침묵 (PLAUSIBLE)
`scripts/finalize.ts:139-141` — `replace(/^active_year:\s*\d+/m, …)`가 미적중이면(예: 값이 따옴표로 감싸진 경우) 파일 무변경인데 "active_year → {n}" 성공 로그를 찍는다. 현재 site.yaml 형식에선 발생하지 않음. 권고: 치환 전 `test()` 확인 후 미적중 시 오류.

### m-9. 버킷 라벨 "첫 블록 우선" 정책이 미문서 + 두 페이지에 중복 구현
`src/pages/archive/index.astro:17-23` · `src/pages/archive/genre/[bucket].astro:19-24` — 동일 로직 복붙. 이듬해 블록에서 라벨을 개명하면 아카이브는 **가장 오래된** 라벨을 계속 표시한다(결정적이긴 함). 최신 블록 우선이 직관적일 수 있음 — 정책 확정 후 lib 단일 함수로.

### m-10. 월말정산 OG 카드 제목에 연도 부재
`src/pages/og/list/[key].png.ts:56` — `"{n}월의 앨범"`. 연도가 다른 두 해의 같은 달 카드가 동일 제목이 된다(페이지 `<title>`은 연도 포함). 유통 단위가 월말정산이라는 설계 의도상 카드에 연도를 넣는 편이 안전.

### m-11. 실패 빌드도 `board_state`를 갱신 — E-303 알림 유실 창
`astro.config.ts:50-53` — 사전 패스 실패 시에도 `writeBuildReport`가 board_state를 갱신하므로, "실패 빌드에서 관측된 진입/탈락"은 다음 성공 빌드의 diff에서 사라질 수 있다. E-303이 로컬 전용·비강제 알림이라는 수용 속성의 연장선 — 기록만 남긴다.

---

## 잘된 것 (검증 노력의 방향 유지를 위해)

1. **결정성 설계가 실제로 관통한다** — 단일 comparator·정수 점수·시계 소비 1곳·코드포인트 비교·삽입순서 순회. 실측 해시 일치. P10이 문서가 아니라 코드에 있다.
2. **E-105 오류 메시지의 수리 힌트**(`review.ts` — 숫자 입력 시 이웃 소수 1자리 2개 제안)는 exceptions.md 메시지 규약("어떻게 고치는지까지")의 모범 구현.
3. **CI의 "게이트 생존 증명"**(의도적 위반 픽스처가 빌드를 실패시키는지 CI가 매번 확인) — 검증 게이트 자체의 회귀를 잡는 드문 설계.
4. 테스트가 계약 번호(R-*·E-*·SS-*)로 이름 붙어 있어 traceability가 산다. 131개가 장식이 아니다.

## 게이트 권고 (Thomas 관점)

**B-1 해소 전 Release Readiness 통과 불가.** 단, 해소는 코드 리팩터가 아니라 "커스텀 도메인을 릴리스 전제로 승격 + launch-gate 문구 정정"만으로도 가능하다(ⓐ안 — 권장: 서브패스는 어차피 임시 상태였다). M-1~M-3은 편집 도구 결함이라 **독자 노출 0**이며 릴리스를 막을 성격은 아니나, 원이 도구를 쓰기 시작하기 전(=첫 실콘텐츠 투입 전) 수정을 강권한다 — 특히 M-3은 연말에 터지면 되돌릴 수 없다. M-4는 구반 평론 첫 발행 전까지만 유예 가능.
