# ADR 색인 — undernote W2 아키텍처

| # | 결정 | 상태 |
|---|---|---|
| [ADR-0001](ADR-0001-file-based-static.md) | 파일 기반 + 정적 생성 (A3 확정) | Accepted |
| [ADR-0002](ADR-0002-ssg-astro.md) | SSG = Astro 5 | Proposed → User 확인 |
| [ADR-0003](ADR-0003-album-entity.md) | 앨범 독립 엔터티 · 평론:앨범 1:1 | Accepted |
| [ADR-0004](ADR-0004-score-representation.md) | 점수 = 문자열 저장 + 정수 십분위 연산 | Accepted |
| [ADR-0005](ADR-0005-derived-lists-snapshot.md) | 리스트 = 빌드 도출 + 연간 스냅샷만 영속 | Accepted |
| [ADR-0006](ADR-0006-musicbrainz-caa.md) | MusicBrainz + Cover Art Archive, 편집 시점 CLI (A5 확정) | Accepted |
| [ADR-0007](ADR-0007-genre-two-tier.md) | 장르 2층: 연도별 버킷 설정 + 태그 등록부 | Accepted (버킷 구성 = 원 Q1) |
| [ADR-0008](ADR-0008-cover-art-policy.md) | 커버 아트 저장·표시 5원칙 (법적 실무 판단) | Accepted (미확인 항목 명시) |
| [ADR-0009](ADR-0009-hosting.md) | 호스팅 요건 확정, 벤더는 W5 실확인 후 | Accepted / Deferred |
| [ADR-0010](ADR-0010-og-card-generation.md) | 공유 카드 = satori+resvg 빌드 생성 | Accepted |

원 결정 대기(Q1 버킷 구성 · Q2 노미네이트 방식 · Q3 월간 성격)는 어떤 답이 와도
**설정값·상수만 바뀌도록** 설계되어 있다 — 재설계 트리거 아님.
