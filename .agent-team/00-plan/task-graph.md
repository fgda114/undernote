# undernote — Task Graph (W0~W6)

Lv3 · 가동 웨이브 **W1 · W2 · W3 · W5 · W6** (W0 · W4 제외 — `_state/wave-log.md` 근거 기록)
동시 스폰 상한 **3명**.

---

## 0. 의존성 개요

```
[W0 Analysis]  ── 제외 ──┐
                         │
W1 Discovery ────────────┴─→ W2 Design ─→ W3 Story Gate ─→ W5 Implement ─→ W6 Verify
  John(리버스)               Joshua(게이트)   Matthew(#17)      Phillip           Thomas
  Caleb(시장분석)             ↓                ↓                Andrew            Timothy
      ↓                     James(아키)      Thomas(리뷰)      (Stephen)         Matthias
  USP Readiness            Jonnathan(디자인)  Matthias(QA)          ↓               ↓
      게이트                    ↓                ↓                            Michael(보안)
                          Plan Readiness    PASS/CONCERNS/FAIL                     ↓
                              게이트          ← 여기서 FAIL이면 W5 진입 차단      Hananiah(리팩터)
                                                                                   ↓
[W4 IP·연구]  ── 제외 ──                                                       Martin(리포트)
                                                                                   ↓
                                                                          Release Readiness 게이트
```

**게이트는 통과 조건이지 형식이 아니다.** W3가 FAIL이면 W5는 시작하지 않는다
(`gate-enforce` 훅이 실제로 차단한다).

---

## W1 — Discovery  ⟨2명 동시⟩

| # | 태스크 | 담당 | 산출 | 비고 |
|---|---|---|---|---|
| 1.1 | 기존 자산 리버스 | John | `01-reverse/` | **범위 최소** — 빈 저장소. BATHOS 설치본 외 코드 없음. 30분 내 종료 |
| 1.2 | 경쟁 지형 분석 | Caleb | `02-market-analysis/` | Pitchfork · RateYourMusic · Discogs · 국내 음악 매체 · 개인 음악 블로그 |
| 1.3 | **A1 검증 — 범위 확장 후의 차별점** | Caleb | `02-market-analysis/usp.md` | **이 웨이브의 핵심.** charter §7-A1 |
| 1.4 | USP를 측정 가능한 명제로 | Caleb | 위 문서 내 | charter §3 성공기준에 역반영 |

**게이트: USP Readiness** — 통과 조건에 **A1의 답**이 반드시 포함되어야 한다.
"음반 전반으로 넓힌 뒤에도 이 매거진을 읽을 이유"가 한 문장으로 나오지 않으면 통과시키지 않는다.

**의존:** 없음 (W0 제외로 W1이 시작점)

---

## W2 — Design  ⟨Joshua 선행 → James·Jonnathan 2명 동시⟩

| # | 태스크 | 담당 | 산출 | 결정 대상 |
|---|---|---|---|---|
| 2.1 | 제품 정의 · 기능 확정/배제 | Joshua | `03-service-planning/` | **A2**(점수제 여부) |
| 2.2 | 정보 구조 (리뷰 · 아카이브 · 셀렉션) | Joshua | 〃 | 4축 탐색의 실제 형태 |
| 2.3 | 아키텍처 · 스택 확정 | James | `04-architecture/` | **A3**(파일 vs DB) · **A5**(메타데이터 수기 vs API) |
| 2.4 | ML 필요성 명시적 판정 | James | 〃 | **A4** — 불필요 판정 시 W5에서 Stephen 미스폰 |
| 2.5 | 저작권 정리 (커버 아트 인용 범위) | James | 〃 | charter §6 제약 |
| 2.6 | 디자인 시스템 · 읽기 경험 | Jonnathan | `07-design/` | 긴 글을 읽게 만드는 타이포그래피가 핵심 |
| 2.7 | 발행 워크플로우 설계 | James + Joshua | 〃 | charter §3 "발행 30분 이내"의 실현 경로 |

**게이트: Plan Readiness**
**의존:** W1 USP 확정. 특히 2.1은 1.3의 답 없이는 시작할 수 없다.

---

## W3 — Story Engineering & Readiness Gate  ⟨Matthew 단독 → Thomas·Matthias 독립 리뷰⟩

| # | 태스크 | 담당 | 산출 |
|---|---|---|---|
| 3.1 | 자족적 스토리 파일 응축 | Matthew(#17) | `03-story-engineering/` |
| 3.2 | 스토리별 `[Source:]` 앵커 · `developer_context` 완비 | Matthew | 〃 |
| 3.3 | 독립 코드 리뷰 관점 검수 | Thomas | `10-review/` |
| 3.4 | 독립 QA 관점 검수 | Matthias | `11-qa/` |

**게이트: PASS / CONCERNS / FAIL** — 파이프라인의 심장.
설계 의도가 구현 단계로 넘어갈 때 새는 것을 여기서 막는다.
`artifact-verify` 훅이 `[Source:]` 누락과 `developer_context` 누락을 실제로 차단한다.

**의존:** W2 Plan Readiness 통과

---

## W5 — Implementation  ⟨최대 3명 동시 · 파일 소유 경계 필수⟩

> ⚠️ **스택 미정이므로 아래 경로는 초안이다.** W2(2.3) 확정 후 실제 경로로 치환한다.
> 확정 시 지켜야 할 불변 조건은 하나다: **소유 경로 교집합 = 0.**

| 담당 | 소유 경로(초안) | 책임 |
|---|---|---|
| **Phillip** (백엔드) | `src/lib/**` · `src/data/**` · `content/**` 스키마 | 콘텐츠 모델 · 메타데이터 · 빌드/질의 계층 |
| **Andrew** (프론트) | `src/routes/**` · `src/components/**` · `src/styles/**` | 리뷰 페이지 · 아카이브 탐색 · 디자인 시스템 구현 |
| **Stephen** (ML) | — | **A4 판정에 따라 미스폰 예상.** 스폰 시에만 `src/ml/**` 배타 할당 |

**공유 경로 취급:** `package.json` · 설정 파일 등 공유가 불가피한 파일은
**Phillip 단독 소유**로 두고 Andrew는 요청만 한다. 동시 편집 충돌을 구조적으로 없앤다.

**의존:** W3 게이트 PASS (또는 CONCERNS + 조건 명시). FAIL이면 진입 차단.

---

## W6 — Verify & Report  ⟨순차 — 병렬 아님⟩

| 순서 | 담당 | 산출 | 비고 |
|---|---|---|---|
| 1 | Thomas · Timothy · Matthias (동시 3명) | `10-review/` `09-docs/` `11-qa/` | 코드리뷰 · 문서화 · QA 검증 |
| 2 | Michael (보안) | `10-review/security/` | 1 완료 후 |
| 3 | Hananiah (리팩터) | — | Thomas·Michael 결과 반영 후 |
| 4 | Martin (리포트) | `12-report/` | 최종 집계 |

**게이트: Release Readiness**
**의존:** W5 구현 완료

---

## 제외 웨이브

| 웨이브 | 사유 |
|---|---|
| **W0 Analysis** | team=solo. 1인 매거진에서 시장분석 전단은 산출물 대비 소모 과다. W1의 Caleb이 흡수한다. |
| **W4 IP·연구** | `regulation_ip=A`. 특허·논문 계획 없음 (`w4_mode=Optional`). Mark · Nathanael 미가동. |

> 두 웨이브의 미실행은 드리프트가 아니라 **User 확정 스코프**다. 근거: `_state/wave-log.md`

---

## 리드 메모 — 이 그래프의 취약점

1. **W1의 A1이 풀리지 않으면 그 뒤가 전부 흔들린다.** 차별점 없이 W2로 넘어가면
   "잘 만든 음악 블로그"가 나온다. 게이트를 느슨하게 통과시키지 않는다.
2. **A3(파일 vs DB)가 W5 소유 경계를 바꾼다.** 정적 생성이면 Phillip의 몫이 크게 줄어
   사실상 Andrew 단독 구현이 된다. 그 경우 W5는 1명으로 운영한다.
3. **1인 제품에 17역할은 과하다.** 실제로는 A4로 Stephen이 빠지고, W4로 2명이 빠져
   가동 인원은 15명 이하다. 각 웨이브에서 필요 없는 역할은 스폰하지 않는 것이 원칙이다.
