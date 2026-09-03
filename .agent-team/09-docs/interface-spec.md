# undernote — 인터페이스 명세 (Interface Spec)

| | |
|---|---|
| 작성 | Timothy (역할 #11 · Docs Engineer) · 2026-09-03 |
| 성격 | 이 제품에 **런타임 REST API는 없다** (정적 사이트). 실제로 존재하는 4종의 기계가독 인터페이스를 코드 근거로 규정한다: ① 콘텐츠 프론트매터 스키마 ② CLI ③ 빌드 파생 데이터 구조 ④ 외부 API(편집 시점 한정) |
| 규범 문서와의 관계 | `.agent-team/04-architecture/api-contracts.md`가 설계 SSOT. 이 문서는 **실제 구현 코드**를 근거로 재기술하며, 구현이 설계와 다른 지점은 명시하고 `design-vs-impl-gaps.md`로 교차 참조한다 |

---

## 1. 공통 타입 (구현: `src/lib/schema/common.ts`)

| 타입 | 정규식/규칙 | 근거 |
|---|---|---|
| slug | `/^[a-z0-9]+(-[a-z0-9]+)*$/` | `common.ts:16` `SLUG_PATTERN` |
| isodate (YYYY-MM-DD) | `/^\d{4}-\d{2}-\d{2}$/` | `common.ts:28` `ISO_DATE_PATTERN` |
| releaseDate (YYYY[-MM[-DD]]) | `/^\d{4}(-\d{2}(-\d{2})?)?$/` | `common.ts:53` `RELEASE_DATE_PATTERN` |
| score | `/^(10\.0|[0-9]\.[0-9])$/` | `src/lib/score.ts:17` `SCORE_PATTERN` |

**Astro YAML 프론트매터 특이사항 (실측, 코드 주석 근거):** 따옴표 없는 `date: 2026-09-02`는 Astro의 콘텐츠 로더에서 JS `Date` 객체(UTC 자정)로 파싱된다. `isoDateSchema`(`common.ts:39-48`)와 `releaseDateSchema`(`common.ts:55-69`)는 `z.preprocess`로 이 `Date`를 `toISOString().slice(0,10)`로 되돌려 결정적 문자열을 만든다(UTC in/out 왕복이라 실행 머신의 로컬 시간대와 무관 — `common.ts:30-38` 주석). **날짜 귀속(어느 월·연도 소속인지) 계산은 이 스키마 레이어에서 절대 하지 않는다** — Asia/Seoul 고정 로직은 `src/lib/derive/lists.ts:111-113` 한 곳뿐(R-10).

`score`는 **문자열**이어야 한다(`review.ts:19-40`). 숫자로 적으면 YAML이 `8.30`→`8.3`처럼 접어버려 검증이 무력화되므로, 숫자가 들어오면 스키마가 즉시 "따옴표로 감싸라"는 한국어 메시지로 거부한다(`review.ts:26-33`). 연산·정렬용 변환은 `src/lib/score.ts:25-33` `scoreToTenths()` 한 곳뿐 — "8.3" → 83.

---

## 2. 콘텐츠 프론트매터 스키마 (Zod, `src/lib/schema/*.ts` → `src/content.config.ts`가 배선)

전부 `.strict()`(`additionalProperties: false`) — 오타 필드는 침묵 무시되지 않고 즉시 빌드 실패한다(`checker/load.ts:81-82`가 Zod의 `unrecognized_keys` 이슈를 한국어 E-100 메시지로 번역).

### 2.1 Album — `content/albums/<slug>.yaml` (구현: `src/lib/schema/album.ts`)

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `title` | string, minLength 1 | ✅ | |
| `artists` | slug[], minItems 1 | ✅ | 존재 검사는 스키마 밖 — 체커 E-103 |
| `release_date` | releaseDate | ✅ | 연도만도 허용 |
| `bucket` | string | ✅ | `etc` 또는 발매 연도 설정 버킷 id — 체커 E-104 |
| `tags` | slug[] | — | 기본 `[]` |
| `cover` | string | — | `public/` 기준 상대경로 |
| `cover_source` | string | — | |
| `listen_links` | `{service, url}[]` | — | service enum: `spotify\|apple-music\|youtube-music\|other` (`album.ts:14`) |
| `mbid` | string | — | |
| `label` | string | — | |

### 2.2 Review — `content/reviews/<album-slug>.md` 프론트매터 (구현: `src/lib/schema/review.ts:42-57`)

| 필드 | 타입 | 필수 |
|---|---|---|
| `album` | slug | ✅ |
| `score` | score(문자열) | ✅ |
| `date` | isodate | ✅ |
| `editorial_check` | `z.literal(true)` — 정확히 `true`만 통과 | ✅ |

본문(마크다운) 공백 검사는 스키마 밖, 체커(`resolve.ts:47-53`)의 E-101. **아티스트와 달리 리뷰는 빈 본문이 실패다** — 아래 §2.4 참조.

### 2.3 Story — `content/stories/<slug>.md` (구현: `src/lib/schema/story.ts`)

| 필드 | 타입 | 필수 |
|---|---|---|
| `title` | string, minLength 1 | ✅ |
| `date` | isodate | ✅ |
| `albums` | `StoryAlbumRef[]` | — 기본 `[]` |
| `tags` | slug[] | — 기본 `[]` |

`albums` 항목은 **두 형태의 유니온**(`story.ts:16-31`):
- `{ ref: slug, role?: 'lead'|'follow' }` — 등록 앨범 참조. `ref`가 실존하지 않으면 체커 E-204 경고(오타 가능성).
- `{ text: string(minLength 1), artist?: string, role?: 'lead'|'follow' }` — 미등록 앨범의 의도적 텍스트 표기.

`role` 필드는 스키마에 있으나 **소비 코드가 없다**(§ interface-spec 5.2 참조 — 계보 시각화 미구현, 설계된 대기 상태).

### 2.4 Artist — `content/artists/<slug>.md` (구현: `src/lib/schema/artist.ts`)

| 필드 | 타입 | 필수 |
|---|---|---|
| `name` | string, minLength 1 | ✅ |

본문 = 소개글. **빈 본문이 허용된다** — `resolve.ts:13-16` 주석: "Empty artist body is NOT E-101: an aggregation-only artist page is a designed state". 이 규칙이 상류 문서(`exceptions.md`)의 E-101 문구와 정확히 일치하지 않는 점은 `design-vs-impl-gaps.md` #1 참조.

### 2.5 GenresConfig — `config/genres.yaml` (구현: `src/lib/schema/config.ts:10-39`)

연도 블록 배열. 각 블록: `year`(정수, ≥2026) · `buckets[]`(`{id, label, order}`, id는 slug이며 `etc` 사용 시 스키마 레벨에서 즉시 거부 — `config.ts:12-15`, E-109) · `min_reviews_to_publish`(기본 3).

### 2.6 TagRegistry — `config/tags.yaml` (구현: `config.ts:41-53`)

`{ tags: [{ slug, label, aliases: string[] }] }` — canonical + 별칭 등록부. 콘텐츠는 canonical slug만 저장(검사는 체커 `resolve.ts:203-216` E-201).

### 2.7 Snapshot — `content/snapshots/<year>.md` (구현: `src/lib/schema/snapshot.ts`) — **finalize CLI 전용 산출물, 수기 편집 대상 아님**

| 필드 | 비고 |
|---|---|
| `year`, `finalized_at` | |
| `top10[]` | `{rank(1-10), album, title, artists_label, score}` — 표시값 비정규화 동결 |
| `buckets[]` | `{id, label, published, winner?, nominees?(≤5)}` |

`.refine()`으로 `published: true`인 버킷은 `winner`가 반드시 있어야 함을 강제(`snapshot.ts:44-46`).

### 2.8 SiteConfig — `config/site.yaml` (구현: `config.ts:55-77`)

| 필드 | 필수 | 기본값 |
|---|---|---|
| `site_name`, `base_url`, `active_year` | ✅ | — |
| `og_use_cover` | — | `true` |
| `early_stage_threshold` | — | `6` |
| `goatcounter_code` | — | 없음(=계측 비활성) |
| `placeholder_cover` | — | — |
| `listen_link_patterns` | — | — |

**주의(구현 세부, `design-vs-impl-gaps.md` #4 참조):** `og_use_cover`·`early_stage_threshold`는 Zod `.default()`가 붙어 있어 **입력에서는 옵션이지만 `z.infer` 출력 타입에서는 필수 필드가 된다.** 이 타입 레벨의 차이가 `tests/unit/derive-lists.test.ts:47`의 `SiteConfig` 리터럴 픽스처와 충돌해 `npm run check`가 현재 실패한다(실측, `operations.md` §4 참조).

---

## 3. CLI

### 3.1 `album-add` — `scripts/album-add.ts`

```
node scripts/album-add.ts "아티스트" "앨범명" [앨범-slug]
```

| 항목 | 내용 |
|---|---|
| 실행 환경 | Node 22.18+/24, 네이티브 TS 실행(확장자 `.ts` import 필수) |
| 동작 | 대화형 프롬프트. MB 검색 → 선택 → 필드 확정(발매일·아티스트 slug·버킷) → CAA 커버 다운로드+재인코딩 → `content/albums/<slug>.yaml`(+신규 아티스트면 `content/artists/<slug>.md`) 파일 생성 |
| 실패 모드 | MB 미적중(0건) → 수기 입력 프롬프트, 빌드 실패 아님(`album-add.ts:91-94`) · MB 타임아웃 → 1회 재시도 후 수기 폴백(`album-add.ts:100-103`) · MB 5xx/네트워크 → 즉시 수기 폴백(`album-add.ts:104-108`) · CAA 404 → 플레이스홀더로 진행(`album-add.ts:185-188`) · slug 형식 위반 → `process.exit(1)`(`album-add.ts:146-148,174-177`) · 앨범 파일 이미 존재(slug 재사용 시도) → `process.exit(1)`(`album-add.ts:210-215`, R-9 보호) |
| 부작용 | 파일 시스템 쓰기만(`content/albums/`·`content/artists/`·`public/covers/`). **빌드에 관여하지 않는다** — 리뷰 작성·git push는 CLI 밖 수동 절차 |
| 종속 | `src/lib/mb/client.ts`(MB/CAA HTTP), `src/lib/mb/scaffold.ts`(순수 변환 로직, 네트워크 없음 — 단위 테스트 대상) |

### 3.2 `finalize` — `scripts/finalize.ts`

```
node scripts/finalize.ts --year 2026 --preface <서문.md 경로> [--yes]
```

| 항목 | 내용 |
|---|---|
| 사전 조건 | `loadRepo()` 결과에 실패(failures)가 하나라도 있으면 즉시 거부(`finalize.ts:64-69`) · 대상 연도 발매작 평론 0편이면 E-405로 거부(`finalize.ts:74-77`) · 대상 연도 스냅샷 파일이 이미 있으면 거부(`finalize.ts:59-62`, 수동 편집 금지 — 삭제 후 재실행이 유일한 정정 경로) |
| 동작 | 빌드와 **동일한** `deriveTop10`/`deriveBoard` 호출(`finalize.ts:80-81`, 이중 구현 방지) → 경계 동점 알림 출력(`finalize.ts:86-87`) → 확인 프롬프트(`--yes`로 생략 가능) → `content/snapshots/<year>.md` 생성 → `config/site.yaml`의 `active_year` 를 정규식 치환으로 갱신(`finalize.ts:141`, 파일의 나머지 부분·주석 보존) → `config/genres.yaml`에 `<year+1>` 블록을 없을 때만 append(`finalize.ts:146-166`, 과거 블록 무수정) |
| 실패 모드(E-4xx) | E-405(대상 연도 평론 0편) 외에는 전부 `console.error` + `process.exit(1)` — 재시도 로직 없음(사람이 CLI 앞에 있다는 전제, `design-patterns.md` P9) |
| 출력 | 콘솔 요약(올해의 앨범 n장 · 성립 버킷 x/y) — 파일 출력 없음. **커밋·push는 CLI 밖** |

---

## 4. 빌드 파생 데이터 구조 (구현 소스가 규범 — `api-contracts.md` §4의 실제 TypeScript 표현)

페이지 템플릿은 이 구조를 가공 없이 렌더한다(P1 — `design-patterns.md`). 전부 `src/lib/derive/*.ts`가 산출하며 **저장되지 않는다**(매 빌드 재계산).

### 4.1 ListEntry / Board / Top10Progressive / MonthlyRecap (`src/lib/derive/lists.ts:35-58`)

```ts
interface ListEntry {
  album: string; title: string; artists_label: string;
  score: string;           // 저장 문자열 그대로, 재포맷 없음
  review_url: string; bucket: string;
  cover: CoverSet | null;
}
interface Board { year: number; buckets: { id, label, entries: ListEntry[] }[] }
interface Top10Progressive { year: number; entries: ListEntry[] }
interface MonthlyRecap { month: string /* "YYYY-MM" */; entries: ListEntry[] }
```

### 4.2 ArchiveIndex / ArchiveItem (`src/lib/derive/archive.ts:22-34`)

```ts
interface ArchiveItem { type: 'review' | 'story'; url: string; title: string; date: string; }
interface ArchiveIndex {
  by_year: Map<string, ArchiveItem[]>; by_bucket: Map<string, ArchiveItem[]>;
  by_tag: Map<string, ArchiveItem[]>; by_artist: Map<string, ArchiveItem[]>;
}
```

**`type`에 `'artist-intro'`가 없다** (설계 문서 `api-contracts.md` §4.4는 enum에 남겨두라고 명시했으나 구현 타입에는 아예 없음). 동작(아티스트 소개를 방출하지 않음)은 설계 의도와 일치하지만 타입 표현이 다르다 — `design-vs-impl-gaps.md` #2.

### 4.3 CoverSet (구현: `src/lib/covers.ts:16-24`)

```ts
interface CoverSet { w96: string; w320: string; w640: string; alt: string; fallback: string; }
```

`fallback`(원본 축소 마스터 경로, non-WebP 에이전트용)은 **설계 문서(`api-contracts.md` §4)에 없는 구현 추가 필드**다. 하위 호환 가산(additive)이라 계약 위반은 아니지만 §7 절차(문서 먼저 → Zod 반영)를 거치지 않았다 — `design-vs-impl-gaps.md` #5.

### 4.4 Backlinks (`src/lib/derive/links.ts:19-31`)

```ts
type BacklinkMode = 'direct' | 'tag' | 'bucket' | 'none';
interface Backlinks { mode: BacklinkMode; stories: { url, title, date, excerpt }[] }
```

### 4.5 BuildReport / Finding (`src/lib/checker/types.ts:8-21`)

```ts
interface Finding { code: string /* "E-###" */; message: string /* 한국어 */; file: string; }
interface CheckResult { failures: Finding[]; warnings: Finding[]; notices: Finding[]; }
```

산출 파일: `reports/build-report.md` + `.json` (`checker/index.ts:43-66`) — `dist/` 밖(gitignore), `built_at` 필드가 비결정적이기 때문(결정성 해시 게이트가 `dist/`만 비교하는 이유, `.github/workflows/ci.yml:65-66`).

### 4.6 OG 카드 입력 (`src/lib/og/types.ts`)

```ts
interface BaseCardInput { kind: 'base'; title: string; formatLabel?: string; siteName: string; }
interface ReviewCardInput { kind: 'review'; albumTitle: string; artistsLabel: string; siteName: string; coverDataUrl?: string; }
interface ListCardInput { kind: 'list'; pageTitle: string; entries: { rank, title, artistsLabel }[]; siteName: string; }
```

세 타입 모두 **score 필드가 존재하지 않는다** — E-115(카드 점수 비표시)가 컴파일 타임에 구조적으로 강제된다(`og/types.ts:1-10` 주석). HTML 부분 문자열 스캔은 의도적으로 사용하지 않는다("1983년"이 "8.3"을 포함해 오탐하므로).

---

## 5. 외부 API 계약 (편집 시점 전용 — `scripts/` 만 호출, 배포 사이트는 호출 0)

### 5.1 MusicBrainz (구현: `src/lib/mb/client.ts`)

| 항목 | 구현값 |
|---|---|
| 엔드포인트 | `https://musicbrainz.org/ws/2/release-group?query=...&fmt=json` (검색) · `.../release-group/<mbid>?inc=artist-credits&fmt=json` (상세) — `client.ts:14,80,86` |
| User-Agent | `undernote-album-add/0.1.0 ( https://github.com/fgda114/undernote )` — `client.ts:18` |
| 레이트리밋 | 요청 간 1100ms 강제 대기(`throttle()`, `client.ts:47-51`) |
| 타임아웃 | 15000ms(`client.ts:44`), `AbortSignal.timeout` |
| 실패 분류 | `503` → `MbError('server', …)` · 기타 비2xx → `MbError('server', …)` · 타임아웃/네트워크 → `MbError('timeout'|'network', …)` (`client.ts:53-74`) — CLI에서 E-401~403 매핑 |

### 5.2 Cover Art Archive (구현: `client.ts:92-110`)

| 항목 | 구현값 |
|---|---|
| 엔드포인트 | `https://coverartarchive.org/release-group/<mbid>/front-500` |
| 404 처리 | `null` 반환 — 정상 경로(E-404, 플레이스홀더 발행) |
| 후처리 | `album-add.ts:190-201`: sharp로 `resize(640,640,{fit:'inside',withoutEnlargement:true})` + `jpeg({quality:82,mozjpeg:true})` → `public/covers/<slug>.jpg` |

### 5.3 스트리밍 검색 링크 (API 아님 — URL 패턴, 구현: `src/lib/listen-links.ts:20-24`)

```ts
{
  'youtube-music': 'https://music.youtube.com/search?q={q}',
  spotify: 'https://open.spotify.com/search/{q}/albums',
  'apple-music': 'https://music.apple.com/kr/search?term={q}',
}
```

`site.yaml#listen_link_patterns`가 있으면 이 기본값을 완전히 대체(override, merge 아님) — `review-page.ts:71-74`. 앨범의 `listen_links`(수기)가 있으면 해당 서비스의 자동 링크를 대체(`listen-links.ts:44-47`).

### 5.4 GoatCounter (계측, API 아님 — 스니펫 삽입)

`Base.astro:66-73` — `config/site.yaml#goatcounter_code`가 있을 때만 `<script async src="https://gc.zgo.at/count.js" data-goatcounter="https://{code}.goatcounter.com/count">` 1개 삽입. 부재 시 스크립트 0개(클라이언트 JS 0 기본값의 유일한 옵트인 예외).

---

## 6. 레이어 경계 (코드 근거)

`src/lib/`는 Astro를 import하지 않는다 — 실측: `grep -rl "astro" src/lib/**/*.ts` 결과 `astro/zod`(스키마 모듈)만 검출, `astro:content`/`astro:*` 프레임워크 API는 `src/pages/`·`src/content.config.ts`에만 나타난다. 이 경계 덕에 `tests/unit/*.test.ts`가 Astro 런타임 없이 순수 vitest로 derive/checker를 검증한다(`build-plan.md` 원칙과 일치, impl-notes W5.1 #1).
