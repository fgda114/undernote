# Blocking Issues — W6 코드 리뷰 (Thomas · 2026-09-03)

> 상세·재현·전체 finding은 `code-review.md`. 이 파일은 Release Readiness 게이트 판단용 요약.

## Blocking: 1건

### B-1. 서브패스 배포 시 전 내부 링크·에셋 파손 (launch-gate 체크리스트의 처방 오류 포함)

- **실체:** 전 URL이 루트 상대(`/reviews/…`, `/fonts/…`)로 하드코딩돼 있고(`BASE_URL` 사용 0건 — grep 실측), 배포 대상은 GitHub Pages **프로젝트 서브패스**(`fgda114.github.io/undernote/`). 체크리스트대로 공개하면 전 내비·폰트·커버·OG 이미지가 404.
- **처방 오류:** `w5-5-launch-gate.md` §5 ④의 "astro.config `base` 설정, 5분"은 성립하지 않는다 — Astro `base`는 수기 루트 상대 href를 재작성하지 않는다. 또한 이 항목은 '선택'이 아니라 서브패스 배포의 성립 불능 조건이다.
- **검출 불능:** E-112는 dist 내부 정합 검사라 이 파손을 구조적으로 잡을 수 없다. CI 전 게이트가 초록인 채로 깨진 사이트가 나간다.
- **해소 경로 (리드 결정):**
  - **ⓐ (권장, 코드 무수정)** 커스텀 도메인(루트 배포)을 릴리스 전제 조건으로 승격 + launch-gate 문구 정정.
  - **ⓑ** URL 생성 전 지점 base prefix 리팩터 — 반나절 규모(Hananiah), "5분" 아님.

## Blocking 아님 — 단 실콘텐츠 투입 전 수정 강권 (major 4)

| # | 요약 | 위치 | 왜 지금 |
|---|---|---|---|
| M-1 | album-add가 기존 커버를 존재 검사 **전에** 덮어씀 — 중단하면서 이미 파괴 | `scripts/album-add.ts:186-208` | 원의 도구 사용 시작 전. 1줄 이동 |
| M-2 | album-add 중도 이탈 → 고아 아티스트 잔존 → E-113으로 전 발행 정지 | `scripts/album-add.ts:151-156` | 동상. 파일 쓰기 말미 일괄화 |
| M-3 | **finalize가 cross-file 검증(E-102/110/113/114) 없이 확정** — 결함 안은 잘못된 리스트가 불변 스냅샷으로 동결될 수 있음 | `scripts/finalize.ts:70-76` | 연말에 터지면 비가역. `runPrePass` 1줄 교체 |
| M-4 | 구반 앨범 버킷 라벨이 raw id로 노출("팝"→"pop") + 지면 간 불일치 + stale 주석 | `src/lib/derive/review-page.ts:52-58` | 구반 평론 첫 발행 전까지 유예 가능 |

minor 11건은 `code-review.md` 참조 (스냅샷 `.strict()` 누락 · 달력 유효성 · P1 침식 2건 · stale 주석 등).

## 실측 통과 확인 (게이트 긍정 신호)

- 테스트 131/131 통과 · 콜드 캐시 2회 빌드 dist 해시 동일(결정성 게이트 로컬 재현 성공).
- 시계·로케일·순회 비결정성 감사: 누수 없음. R-1은 단일 comparator로 전 도출 경로 공유.
- E-100~405 29코드 전수: 정의-사용 일치, 고아·미정의 없음. 스키마 단일 정의 규칙 준수.
