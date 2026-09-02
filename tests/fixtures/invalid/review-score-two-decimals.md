---
album: fixture-artist-fixture-album
score: 8.35
date: 2026-09-02
editorial_check: true
---

의도적 스키마 위반 픽스처입니다 (AC2). `score: 8.35`는 두 가지를 동시에 위반합니다:
따옴표가 없어 YAML 숫자로 파싱되고(문자열 저장 규칙 위반), 소수 2자리라 E-105
범위 규칙도 위반합니다. 이 파일이 `content/reviews/`에 있으면 빌드는 반드시
실패해야 합니다 — CI가 이를 게이트로 검증합니다.
