# James2 → James 인계 문서

| | |
|---|---|
| 작성 | James2 (중복 스폰 세션) · 2026-09-01 |
| 수신 | 원본 James (04-architecture 최종 소유자 — 리드 중재 결정) · 리드 Paul |
| 성격 | 이 문서 작성 후 James2는 종료. **04-architecture에 대한 James2의 추가 쓰기 없음** |

---

## 0. 가장 급한 것 — 핑퐁 위험 1건

James의 정합화 통보(항목 5)는 "당신 SSOT로 역정렬: `config/buckets/<year>.yaml` ·
`config/genre-tags.yaml`"이라 했으나, **저는 반대 방향으로 이미 통일해 뒀습니다** —
디스크 현재 상태는 **`config/genres.yaml`(연도 블록) + `config/tags.yaml`**로
전 문서(api-contracts §3.5/3.6 · exceptions R-8 · code-structure · design-patterns ·
architecture-overview · ERD) 불일치 0입니다.

**지금 buckets/<year>.yaml로 되돌리면 6곳+ 를 동시에 바꿔야 하고, 한 곳이라도
빠지면 다시 갈라집니다.** 어느 규약이든 James의 선택이 맞지만, 바꿀 거면
원자적으로. 그대로 두면 할 일이 없습니다.

---

## 1. 파일별 최종 상태 (2026-09-01 James2 종료 시점)

| 파일 | 디스크 버전의 저자 | 비고 |
|---|---|---|
| `api-contracts.md` | James2 + James의 정합 편집 병합 | score string(ADR-0004)·640px·CoverSet·listen_link_patterns는 James 편집 — 유지했음. §3.5/3.6은 James2가 genres.yaml/tags.yaml로 전환 |
| `service-sequences.md` | James2 + James의 소폭 편집(640px 등) | SS 1~15 전수, 커버리지 매트릭스 15/15 |
| `exceptions.md` | James2 | R-1~R-10 + E-코드 레지스트리 (아래 §2) |
| `build-plan.md` | James2 | **완성 상태** — 게이트 필수 항목. 요약은 §3 |
| `code-structure.md` | James2 | 트리·레이어 경계·URL 설계·명명 |
| `design-patterns.md` | James2 | P1~P10 + 배제 패턴 목록 |
| `architecture-overview.md` | James (James2 초판을 덮음) | 이의 없음 — §4에 검토 요청 2건만 |
| `data-model-erd.md` | James (James2 초판을 덮음) + James2의 기계적 정렬 | 필드명·E-코드만 손댐 (아래 §2) |
| `adr/` 11파일 | James | James2는 ADR-0003·0008·0010의 코드 참조만 교정 (아래 §2) |

---

## 2. 두 라인이 갈라졌던 지점 전부 — 그리고 현재 디스크의 통일 상태

원본 James가 정합을 재검할 때 이 표만 보면 됩니다. **"현재 상태" 열이 디스크 사실입니다.**

| # | 갈라진 지점 | James2 초안 | James 라인 | 현재 디스크 상태 (통일값) |
|---|---|---|---|---|
| 1 | 점수 표현 | number + 코드 refine | **string + 십분위 정수 (ADR-0004)** | **James 안 채택** — api-contracts §1 · ADR-0004. SS-3 "8.30 입력 = 실패" 검출 가능성이 근거 (YAML number는 8.30을 접음) |
| 2 | 오류 코드 체계 | E-1xx/2xx/3xx/4xx 단일 레지스트리 | E-1xx + W-2xx/W-4xx 혼재 | **James2 안 채택** — exceptions.md가 SSOT. W-* 전면 소거. ERD·ADR-0003·0008·0010의 참조를 실코드로 교정 완료: E-105(1:1)→E-108, E-104(아티스트)→E-103, W-203→E-202, W-201→E-204, W-401/E-401→E-111·E-115 |
| 3 | E-115 (신설) | — | ADR-0010이 "평론 카드 점수 비표시를 빌드 검증으로 강제" 요구 | **E-115 = 평론 OG 메타·카드에 점수 문자열 포함 → 빌드 실패**로 exceptions.md에 추가. ADR-0010의 요구를 코드화한 것 — 유지 권장 |
| 4 | 필드명 | album·score·date·editorial_check·albums[ref\|text] | albumId·published·worthIt·refs | **James2 안 채택** (James도 항목 5에서 수용 — "ref\|text oneOf가 낫다") — api-contracts §3 = 규범, ERD 정렬 완료 |
| 5 | 설정 파일 경로 | buckets/<year>.yaml · genre-tags.yaml | genres.yaml 연도 블록 · tags.yaml | **James 안 채택** — §0 참조. 되돌리려면 원자적으로 |
| 6 | 스냅샷 형식 | `snapshots/<year>.md` 프론트매터+서문 본문 | `snapshots/<year>.json` + forewordPath | **James2 안 채택** (James 항목 5에서 수용) — api-contracts §3.7이 규범 |
| 7 | 커버 크기 | 800px | **640px (ADR-0008 §2, Jonnathan 합의 96/320/640)** | **James 안 채택** — api-contracts·시퀀스 A 반영 완료 |
| 8 | ListEntry.cover | 없음 | CoverSet(w96/w320/w640/alt, null 허용) | **James 안 채택** — 보드 썸네일 렌더에 필수. api-contracts §4 반영 완료 |
| 9 | ADR 번호 | 0006 커버·0009 OG·0008 호스팅 (James2 구상) | **디스크 실재: 0008 커버·0010 OG·0009 호스팅** | **James 번호가 사실** — build-plan·code-structure·design-patterns의 참조는 이미 실재 번호로 작성/교정됨. 깨진 링크 grep 기준 0 |
| 10 | site.yaml | og_use_cover·placeholder_cover | listenLinkTemplates | **병합됨** — §3.8에 둘 다 (og_use_cover 킬스위치는 ADR-0008 §5의 "템플릿 이원화 전환"의 스위치 실체이므로 유지 권장) |

**James2가 Joshua 사양 위에 추가한 아키텍처 결정 (검토 대상):**
- **R-1 3차 정렬 키 = album slug** (Joshua는 2키까지) — 같은 날 동점의 비결정성 차단
- **R-10 시간대 Asia/Seoul 고정** — CI(UTC)에서 월말정산 경계가 흔들리는 버그의 선제 차단
- **R-3 연도 귀속 2축 공존 판정** — 리드 확인 요청 항목("SS-11 발행 기준 확인할 것")의 해소: SS-5(발매)와 SS-11(발행)은 모순이 아니라 다른 지면의 다른 질문. exceptions.md R-3에 표로 명문화
- **R-8 과거 고정 메커니즘** — "과거 리스트는 스냅샷에서만 렌더 + 과거 연도 블록 수정 금지" = 설정 변경으로 과거가 바뀌는 경로가 구조적으로 부재

---

## 3. build-plan.md — 완성돼 있음 (게이트 필수. 원본이 취사선택)

리드 지시로 James2의 추가 수정은 없습니다. 디스크 버전의 핵심 판단:

1. **W5 = 1인(Andrew) 단독 권고, Phillip 미스폰.** 근거: 런타임 백엔드가 0이라
   나눌 대상이 없고, 억지로 나누면 `src/content.config.ts`·`package.json`·CI가
   공유 지대가 되어 "교집합 0" 요건이 인위적 인터페이스를 강요함. 작업 중심은
   Jonnathan 시안 구현(지면 ~10종)이고 파생 로직은 이미 알고리즘 수준으로
   사양화됨(구현은 번역 작업).
2. **2인 강행 시 폴백 절단선** (교집합 0): Phillip = `scripts/** · src/lib/** ·
   tests/** · src/content.config.ts` + `package.json`·CI 단독 소유 / Andrew =
   `src/pages/** · components/** · layouts/** · styles/** · public/**`.
   인터페이스 = api-contracts §4 도출 구조.
3. **단계 W5.0~5.5** = Joshua 에픽 E1~E5 + 셋업. 최소 공개 단위 = E1+E2+E5.
   각 단계 DoD = 해당 SS 인수조건 전수 + E-코드 구현.
4. **결정성 게이트**: 동일 픽스처 2회 빌드 → 산출 해시 동일 (CI 게이트).
   R-1~R-10 각각 최소 1 테스트 케이스.
5. **Stephen(A4·ML) 미스폰 판정 입력** 명시 (charter B7 + Joshua Non-goals).
6. ADR-0002(Astro)는 **User 확인 대상**으로 유지 — charter §6 (구현 방식
   결정권은 User).

## 4. 원본 버전에 대한 검토 요청 2건 (James2 관점 — 강제 아님)

1. **architecture-overview.md에 NFR "설계 예산" 절이 있는지 확인** — James2
   초판에 있던 것: 페이지 전송량 예산 ≤300KB(설계 예산이지 실측 주장 아님),
   빌드 시간 "미정 — 실측 후", 관측 요구는 "평론↔이야기 이동률 측정 가능할
   것"(usp.md §2) 하나. 현재 build-plan W5.5에만 남아 있음 — overview에도
   있으면 게이트에서 "수치 NFR" 항목이 명확해짐.
2. **exceptions.md 3부(장애·부분 실패)** — "재시도·서킷브레이커·큐를 안 두는
   이유(편집 도구엔 사람이 앉아 있다)"를 명시적 판단으로 남겨 뒀습니다.
   원본 문서 어딘가에 같은 판단이 있다면 중복 제거, 없다면 유지 권장.

## 5. 승계되는 미결 (04-architecture 밖 대기)

- ADR-0002 (Astro 5) — User 확인
- Q1(버킷)·Q2(노미네이트)·Q3(월간) — 원 답변. 전부 설정값이라 비차단
- 리스트 카드의 점수 표시 여부 — Jonnathan 시안 확정 대기 (SS-15)
- 커버 아트 국내 판례 — 미확인, 법률 검토 필요 (ADR-0008)
- W5 착수 시 재확인: MB User-Agent 권장 형식 · CAA 제공 크기 옵션 ·
  스트리밍 검색 URL 패턴 실동작 · 호스팅 무료 한도 (ADR-0009)

이상입니다. 충돌 감지 이후의 목표는 하나였습니다 — 구현자가 이 폴더만 보고
후속 질문 없이 시작할 수 있는 단일 정합 상태. 현재 디스크가 그 상태이며,
이후의 모든 변경 권한은 원본 James에게 있습니다.
