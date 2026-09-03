# undernote — 데이터·이벤트 흐름 (Data & Events)

| | |
|---|---|
| 작성 | Timothy (역할 #11 · Docs Engineer) · 2026-09-03 |
| 성격 | 코드 근거 기반. 엔터티 관계는 `interface-spec.md` §2의 스키마를, 파생 데이터 구조는 §4를 그대로 참조 — 이 문서는 **저장 위치·수명주기·트리거(이벤트)**에 집중한다 |
| 전제 | 런타임 DB·이벤트 큐가 없다. "이벤트"는 ① git push(빌드 트리거) ② 원→User 전달(편집 트리거) ③ CLI 실행 세 가지뿐이다 |

---

## 1. 엔터티 저장 위치 (DB 없음 — 전부 git 저장소 파일)

| 엔터티 | 경로 | 형식 | 생성 주체 | 스키마 |
|---|---|---|---|---|
| Album | `content/albums/<slug>.yaml` | YAML | `album-add` CLI 또는 수기 | `src/lib/schema/album.ts` |
| Review | `content/reviews/<slug>.md` | MD+frontmatter | User 수기(원의 글 전달받아) | `src/lib/schema/review.ts` |
| Story | `content/stories/<slug>.md` | MD+frontmatter | User 수기 | `src/lib/schema/story.ts` |
| Artist | `content/artists/<slug>.md` | MD+frontmatter | `album-add`(신규 시 자동 생성, 빈 본문) 또는 수기 소개글 추가 | `src/lib/schema/artist.ts` |
| Snapshot | `content/snapshots/<year>.md` | MD+frontmatter | **`finalize` CLI 전용** — 수기 편집 금지 | `src/lib/schema/snapshot.ts` |
| GenresConfig | `config/genres.yaml` | YAML | 수기 초기 설정, `finalize`가 다음 연도 블록 append | `src/lib/schema/config.ts` |
| TagRegistry | `config/tags.yaml` | YAML | 수기 | `src/lib/schema/config.ts` |
| SiteConfig | `config/site.yaml` | YAML | 수기, `finalize`가 `active_year`만 치환 | `src/lib/schema/config.ts` |

파일명 = slug = URL 조각의 삼자 일치가 강제된다(리뷰: E-108, `resolve.ts:54-59`). **파생물(보드·10선·월말정산·아카이브 인덱스·역링크·배지·OG 카드)은 저장되지 않는다** — 매 빌드 `src/lib/derive/*.ts`가 전량 재계산한다(`data-model-erd.md` §4 원칙과 코드가 일치 — 저장소 어디에도 이들의 파일 형태가 없음, 실측: `find content -type d`가 albums/artists/reviews/snapshots/stories 5종만 반환).

## 2. 엔터티 관계 (참조 방향)

```
Review --album(slug)--> Album --artists[](slug)--> Artist
Album --bucket(slug)--> GenresConfig[release_year].buckets
Album --tags[](slug)--> TagRegistry.tags (canonical 또는 alias)
Story --albums[].ref(slug)--> Album (옵션, 없으면 albums[].text로 미등록 표기)
Story --tags[](slug)--> TagRegistry.tags
Snapshot --top10[].album / buckets[].winner / buckets[].nominees[].album (slug)--> Review (반드시 실존, E-110)
SiteConfig.active_year --> GenresConfig.years[].year (진행형 보드 대상 연도)
```

참조 무결성은 전부 빌드 시점에 `src/lib/checker/resolve.ts`가 검사한다(E-102·103·104·204·110) — 런타임 외래키 제약이 없는 대신 빌드 게이트가 그 역할을 한다.

## 3. 빌드 파이프라인 — 단계별 데이터 변환

트리거는 `git push` → CI(`astro build`) 또는 로컬 `npm run build`. 단계는 `astro.config.ts`(체커 통합)와 `astro:content`(Zod 스키마 동기화)가 함께 구성한다.

```
1. 로드           content/**·config/** 파일 시스템 읽기
                  → src/lib/checker/load.ts loadRepo()
                  → RepoData { albums, reviews, stories, artists, snapshots, site, genres, tags }

2. 형태 검증       Zod 스키마 각 컬렉션 적용 — 실패는 전부 모아 한 번에 보고 (E-1xx)
                  → src/lib/checker/load.ts:97-148 loadCollection()

3. 참조 해석       교차 파일 무결성 — 앨범→아티스트, 리뷰→앨범, 버킷↔연도설정, 태그 등록부
                  → src/lib/checker/resolve.ts resolveRepo()  (E-101~114·201·203~205)

4. 도출           정렬(R-1) → Board → Top10 → MonthlyRecap → ArchiveIndex → Backlinks → BadgeMap
                  → src/lib/derive/lists.ts, archive.ts, links.ts
                  → SiteData (src/lib/derive/site-data.ts:38-59, 빌드 프로세스당 1회 캐시)

5. 알림 패스       동점(E-301)·미확정(E-302)·보드 변동(E-303) — derive와 같은 코드 경로 재사용
                  → src/lib/checker/notices.ts runNoticePass()

6. 렌더            Astro 페이지가 SiteData를 가공 없이 소비 → dist/*.html
                  + OG 카드 satori 렌더 → dist/og/**.png
                  + 커버 파생 sharp 리사이즈 → dist/covers/derived/**.webp

7. 사후 검증       dist/ 전수 스캔 — OG 3요소(E-111)·내부 링크(E-112)
                  → src/lib/checker/postbuild.ts runPostBuildChecks()

8. 리포트          reports/build-report.{md,json} — 매 빌드 항상 산출 (성공이어도)
                  → src/lib/checker/index.ts writeBuildReport()
```

**게이트 지점(코드 근거):** 3단계 이후 E-1xx 존재 시 `astro.config.ts:57-63`에서 `throw` — 4~8단계 자체가 실행되지 않는다(Astro 빌드 전체 중단). 7단계 실패 시 `astro.config.ts:66-76`에서 다시 `throw` — 이 시점엔 `dist/`가 이미 생성돼 있으나 CI가 이 exit code를 보고 배포 잡을 건너뛴다(`.github/workflows/ci.yml` `deploy` 잡의 `needs: verify`).

## 4. 이벤트 — 편집 시점 (원 → User → 저장소)

| 이벤트 | 트리거 | 산출 | 코드 |
|---|---|---|---|
| 앨범 등록 | User가 `album-add` 실행 | `content/albums/*.yaml`(+ 신규 아티스트 `.md`), `public/covers/*.jpg` | `scripts/album-add.ts` |
| 평론 발행 | User가 `content/reviews/<slug>.md` 작성 후 `git push` | 다음 빌드에서 평론 페이지+보드+아카이브+OG 카드 전부 갱신 | 빌드 파이프라인(§3) 전체 |
| 점수 수정 | User가 기존 리뷰 파일의 `score` 수정 후 push | 평론·보드·진행형 리스트·과거 월말정산·아카이브 **재도출**. 확정 스냅샷만 불변(R-2) | `lists.ts` 전량 재계산 — 별도 이벤트 처리 코드 없음(파생 특성의 자연 결과) |
| 연말 확정 | User가 `finalize --year <Y> --preface <파일>` 실행 후 push | `content/snapshots/<Y>.md` 생성, `site.yaml#active_year` 증가, `genres.yaml`에 `<Y+1>` 블록 추가 | `scripts/finalize.ts` |
| 이야기 발행 | User가 `content/stories/<slug>.md` 작성 후 push | 이야기 페이지 + (참조 앨범이 있으면) 해당 평론 페이지에 역링크 자동 생성 | 빌드 파이프라인, `derive/links.ts` |
| 커버 삭제(권리자 요청) | User가 `public/covers/<slug>.jpg` 삭제 | 다음 빌드부터 해당 앨범 플레이스홀더 발행 + E-202 경고, **빌드는 깨지지 않음** | `covers.ts:36` `coverSetFor()`가 `cover` 필드 부재 시 `null` 반환 |

## 5. 이벤트 — CI (git push → 배포)

`.github/workflows/ci.yml` 기준 (`on: push[main], pull_request`):

```
push/PR → verify 잡
  1. npm ci (lockfile 고정)
  2. npm test (vitest — 131개, 2026-09-03 로컬 실측)
  3. npm run check (astro check — 타입)
  4. 의도적 스키마 위반 픽스처 주입 → build가 반드시 실패해야 통과(게이트 존재 증명)
  5. 1차 build → dist-1
  6. 캐시 삭제 후 2차 build → dist-2
  7. 결정성 게이트: sha256(dist-1) == sha256(dist-2) 필수
  8. (main push만) dist-1을 Pages 아티팩트로 업로드

→ deploy 잡 (needs: verify, main push만)
  1. 픽스처 콘텐츠(`fixture-*`) 잔존 검사 — 있으면 배포 중단
  2. dist-1 그대로 GitHub Pages에 배포 (재빌드 없음 — 검증된 바이트 그대로)
```

**배포되는 것은 검증된 `dist-1`이지, 재빌드 산출물이 아니다** — `ci.yml:80-86` 주석 및 `deploy` 잡이 `dist-1` artifact를 그대로 참조. 실패 시 GitHub Pages는 마지막 성공 배포를 계속 서빙(`exceptions.md` 3부와 일치 — 정적 호스팅의 기본 속성).

## 6. 시간·결정성 — 데이터에 언제 시계가 개입하는가

| 소비처 | 시계 사용 | 코드 |
|---|---|---|
| 월말정산 "종료된 월" 판정 | ✅ 유일한 정식 소비처 | `lists.ts:111-113` `currentYearMonthSeoul()` — KST 고정 산술 |
| 보드 캡션 날짜 | ❌ (저장소 유래) | `lists.ts:234-239` `latestPublicationDate()` — 최신 발행일 사용, `new Date()` 미사용 |
| 스냅샷 `finalized_at` | 기록용, 도출 입력 아님 | `finalize.ts:38-42` `todaySeoul()` — 결과 데이터로만 저장, 다른 도출에 영향 없음 |
| `build-report.json`의 `built_at` | 기록용, `dist/` 밖 | `checker/index.ts:46` — 결정성 해시 게이트 범위 밖으로 의도적으로 격리 |
| 그 외 전 도출 | ❌ | 순수 함수 — 동일 저장소 상태 → 동일 출력 (CI 2회 빌드 해시 비교로 실측 검증됨) |
