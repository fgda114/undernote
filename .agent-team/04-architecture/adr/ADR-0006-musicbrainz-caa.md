# ADR-0006. 메타데이터 조회 = MusicBrainz + Cover Art Archive, 편집 시점 CLI (charter A5 확정)

| | |
|---|---|
| 상태 | **Accepted** (John A5 권고의 아키텍처 비준) |
| 작성 | James · 2026-09-01 |
| 의존 | ADR-0001·0003 · SS-2·13·14 · B6 |

## 맥락

원은 앨범명·아티스트만 준다(D7). 발매일(연도는 리스트 귀속에 필수)·커버·듣기 링크는
시스템이 채워야 한다. 배포 사이트에는 API 호출이 없어야 한다 (John 확인 사항).

## 결정

**발행 스캐폴드 CLI(`scripts/new-review.mjs` 등)가 편집 시점에 1회 조회한다:**

1. **MusicBrainz API** — release-group 검색 → 발매일·아티스트 정규명·MBID.
   레이트리밋 초당 1회 · 의미 있는 User-Agent 필수. 출처: [MusicBrainz API 문서](https://musicbrainz.org/doc/MusicBrainz_API)
2. **Cover Art Archive** — `GET coverartarchive.org/release-group/{mbid}/front-500` (307 → archive.org 리다이렉트 추적)로 커버 **사본 다운로드** 후 자체 자산으로 저장 (핫링크 금지 — John 권고 · SS-14). 명시된 레이트리밋 없음. 출처: [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API)
   ※ CAA에서 받은 사본도 저작권 취급은 ADR-0008 정책에 종속된다 (CAA는 라이선스를 부여하지 않는다).
3. **실패 시 수기 폴백** — CLI가 빈 필드를 명시한 앨범 YAML을 생성하고 User가 채운다. 발매 연도 공백은 빌드 실패(E-103). MB 지연 반영(B6)은 수기 선입력 + 추후 `mbid` 연결 허용 (SS-2).
4. **듣기 링크(SS-13)** — 아티스트+앨범명 URL 인코딩 **검색형 링크**를 설정된 템플릿 목록(`config/site.yaml` — 기본: 국내 대상 서비스 포함해 W5에서 2종 내외 확정)으로 자동 생성. 수기 `links` 필드가 항상 우선. 검색형은 死링크가 없어 유지비 0.

## 대안

1. **Discogs 병용** — 사양·리밋 미확인(John 웹페치 403). 필요 실측 전 복잡도만 추가. 보류.
2. **스트리밍 API(Spotify 등)로 정확 링크** — 키 관리·토큰 갱신 운영 부담 + 국내 서비스 커버리지 별개 문제. 검색형으로 충분, 정밀 링크는 수기 오버라이드가 흡수. 기각(1차).

## 결과

- (+) 원 접점 불변(D7) · 배포 사이트 API 호출 0 · 오프라인 빌드 가능.
- (−) MB 비적중(비서구 인디)이면 User 수기 ~5분 (John 추정) — 월 1~2편 규모에서 수용.
