# W5.5 공개 게이트 기록 — Andrew (2026-09-02)

> 스토리 w5-5의 산출 문서. QA 전수(AC7)는 Matthias 몫 — 아래 "게이트 잔여"에 상태 기재.

## 1. 성능 실측 (AC5 — 설계 예산 500KB)

| 지면 | HTML(gzip) | CSS | 폰트(로드 면) | 합계 |
|---|---|---|---|---|
| 홈 | 3.8KB | 인라인(HTML에 포함) | ~750KB (Pretendard 428 + Noto700 322) | **~754KB** |
| 평론 | 4.2KB | 인라인 | 1,063KB (3면 전부 — 본문 세리프 400 추가) | **~1,067KB** |
| 리스트 | 3.5KB | 인라인 | ~750KB | **~754KB** |

- **판정: 500KB 예산 초과 — "실패"가 아니라 조정 협의 대상** (AC5 문언 그대로).
- 원인은 폰트가 전부: HTML+CSS는 지면당 ~4KB. 폰트 합계 1,063KB는 디자인 계약(3면 서브셋, <1.5MB 캐시 예산) 안이며 2페이지째부터는 캐시 히트 0KB.
- 협의 옵션: ⓐ 예산 재조정 수용 (woff2 서브셋은 이미 최적, 재방문 비용 0) ⓑ unicode-range 동적 서브셋 분할(구글식 슬라이스 — 초기 전송 ~150-300KB로 감소, 서브셋 파이프라인 확장 반나절) ⓒ 자모 세트 추가 축소 (한계 효용 낮음).
- **권고: 1차 공개는 ⓐ, 트래픽 실측 후 ⓑ 검토.** 리드/User 결정 대기.

## 2. 계측 선정 (AC6 — 공식 문서 실확인 2026-09-02)

| 후보 | 확인 내용 | 출처 |
|---|---|---|
| **GoatCounter (선정)** | 호스티드 무료("reasonable public usage" — 개인·중소 사이트 명시 허용), 쿠키 0·고유 식별자 0·GDPR 고지 불요, 스크립트 ~3.5KB 1개, 리퍼러 기록(내부 이동 = 평론↔이야기 이동률 측정 가능), 오픈소스 | goatcounter.com (확인 2026-09-02) |
| Cloudflare Web Analytics | 전 플랜 무료·프라이버시 우선. 단 CF 계정 신규 필요(호스팅이 GitHub Pages라 벤더 추가) | developers.cloudflare.com/web-analytics (수정일 2026-04-16) |
| 호스팅 내장 분석 | **GitHub Pages에는 내장 분석이 없음** — 후보 소멸 | — |

- **선정: GoatCounter.** 근거: 쿠키리스+스니펫 1개(JS 0 원칙의 유일 예외 계약 충족), 계정 1개로 끝, 리퍼러 기반 내부 이동률 측정 충족.
- **설치는 대기** ("선정 전까지는 계측 없음" — 계정 생성이 User 작업): ① User가 goatcounter.com 가입 → 코드 확보 ② site.yaml 옵션 필드 `goatcounter_code` 계약 가산(§7 — 리드/James) ③ Base.astro에 조건부 스니펫 1줄:
  `<script data-goatcounter="https://{code}.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>`

## 3. design-handoff §5 자가 점검 (AC8 — 10항목)

| # | 항목 | 자가 점검 | 근거 |
|---|---|---|---|
| 1 | 색 하드코딩 0 | ✅ | grep 검증 — hex는 tokens.css·og/template.ts(동기화 상수 주석)·favicon뿐 |
| 2 | seal 5자리 집중 | ✅ | 전 사용처 = 평결·1위·배지·오버라인·본문 링크 + 계약 명시 부속(워드마크 마침표 §1·focus 아웃라인 §6·seal 화살표 §11) |
| 3 | D2 3규칙 | ✅ | 히어로 무점수·평결 본문 후·탐색 무점수 — 빌드 HTML 검증 + 데이터 레벨 강제 |
| 4 | 조건부 미출력 | ✅ | 배지·듣기·사다리·앨범상자 전부 데이터 없으면 미렌더 (테스트) |
| 5 | 보드 빈 상태 | ✅ | 카피 정확·자리채움 0·행=링크·1위 seal+보더 (빌드 검증) |
| 6 | 키보드 전 지면 | ✅(구조) / 실기기 QA 잔여 | JS 0·전부 `<a>`·DOM 순서 = 읽기 순서·:focus-visible 공통 규칙 |
| 7 | reduced-motion | ✅ | 보드 스태거 animation:none + 전역 트랜지션 축소 |
| 8 | 다크 모드 | ✅(구조) / 실기기 QA 잔여 | prefers-color-scheme 토큰 전환 — tokens.md 다크 값 그대로 |
| 9 | 360px 가로 스크롤 0 | ✅(구조) / 실기기 QA 잔여 | 고정폭 요소 최대 320px(히어로 커버)·그리드 auto-fit·이미지 max-width 100% |
| 10 | OG 전 유형 무점수 | ✅ | 타입 레벨(E-115) + 카드 시각 확인 |

## 4. 운영 수칙 (build-plan §4 승계 — 09-docs용 정리)

1. **GitHub 계정 2FA 필수** (저장소 = 제품 전체).
2. **스냅샷 수동 편집 금지** — 잘못된 확정은 파일 삭제 후 `finalize` 재실행.
3. **과거 연도 버킷 블록 수정 금지** — 변경은 새 연도 블록으로 (finalize가 자동 생성).
4. **발행 1건 = 원자 커밋 1개** (`publish: <slug>` — 앨범+평론+커버 함께).
5. **build-report의 E-3xx 알림을 원에게 전달** (경계 동점·확정 필요·보드 진입/탈락 — reports/build-report.md 원 전달 섹션).
+ slug는 발행 후 불변(R-9) — 불가피한 변경은 호스팅 리다이렉트 규칙과 함께.

## 5. 게이트 잔여 (공개 전 체크리스트)

- [ ] **Matthias QA: US-1~15 AC 전수 수동 확인** (user-stories.md가 시나리오) — 리드 배정 대기. dev 서버: `npm run dev` (localhost:4321). 시드: 픽스처 콘텐츠가 content/에 있음
- [ ] **실기기 확인 3건**: 키보드 통독·다크 모드·360px (자가 점검은 구조 확인까지)
- [ ] **User 작업**: ① GitHub Pages 활성화 (Settings→Pages→Source=GitHub Actions) ② GoatCounter 가입(계측 원하면) ③ 사이트 이름 확정 시 site.yaml 1곳 치환 ④ 커스텀 도메인(선택 — 전까지 /undernote/ 서브패스: astro.config `base` 설정 필요, 5분 작업)
- [ ] **픽스처 콘텐츠 제거 + 실콘텐츠 최소 세트 투입** (원의 첫 평론) — 제거 대상: content/{albums,reviews,artists,stories}/fixture-* · public/covers/fixture-*
- [ ] 성능 예산 협의 (§1 — 리드/User 결정)
- [ ] about 본문 카피 협의분 반영 (현재: 필수 3문 최소 지면으로 성립 — 공개 가능 상태)
