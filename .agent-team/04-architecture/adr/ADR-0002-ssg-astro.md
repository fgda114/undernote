# ADR-0002. 사이트 생성기 = Astro (현행 메이저 7.x)

| | |
|---|---|
| 상태 | ✅ **Accepted** — User 승인 (2026-09-01). 구현 방식 결정권은 User(charter §6) |
| 개정 | **2026-09-01 — 버전 정정: Astro 5 → 7.x.** W3(Matthew) 최신기술 확인 단계에서 지연 발견 |
| 작성 | James · 2026-09-01 |
| 승인 | User · 2026-09-01 · 리드 Paul 기록 |
| 의존 | ADR-0001 |

## 맥락

SSG에 요구되는 것 (SS·디자인 계약에서 역산):

1. **프론트매터 스키마의 빌드 타임 검증** — SS-1(필수 필드 누락 = 빌드 실패)이 제품의 핵심 약속(USP-A 링크율 100%)을 지키는 1차 관문.
2. **클라이언트 JS 0** — Jonnathan 확정(전 지면 정적 HTML+CSS). 유입 축이 공유 카드이므로 페이지는 가벼워야 한다.
3. **이미지 파이프라인** — 커버 파생 4크기 + OG 카드 생성 (SS-14·15).
4. 개발 환경 = Windows 11 · Node/npm (charter §6).
5. 파생 로직(리스트 도출·역링크)이 **테스트 가능한 일반 코드**여야 한다 — 결정성이 제품 약속이므로 (exceptions.md).

## 결정

**Astro 현행 메이저(7.x)를 채택한다.**

> ⚠️ **버전 정정 (2026-09-01).** 이 ADR은 최초에 "Astro 5"로 작성됐으나, W3의 Matthew가
> 최신기술 확인 단계에서 **작성 시점 기준 두 메이저 뒤처짐**을 발견했다. 리드가 재확인:
>
> | | |
> |---|---|
> | 현행 안정판 | **7.2.9** ([Astro Releases](https://github.com/withastro/astro/releases)) |
> | Astro 7.0 | 2026-06 — Vite 8 · Rust 컴파일러 · Advanced Routing |
> | Astro 6.0 | 2026-03 — Fonts API · CSP API · Node 22 최소 |
>
> **채택 근거는 그대로 유효하다** — Content Collections(Content Layer) + Zod 스키마
> 빌드 타임 검증은 5→7에서 유지된다. 프레임워크 선택이 아니라 버전 표기만 정정한다.
>
> **환경 확인 완료:** 로컬 Node v24.14.0 · npm 11.9.0 — Astro 7의 Node 22 최소 요건 충족.
> **정확한 마이너 핀과 Zod v4 등 breaking change 대응은 W5.0에서 실확인**한다
> (story-w5-0-setup 참조). 여기서 지어낸 버전을 박지 않는다.

콘텐츠는 Content Collections(Content Layer)로 로드하고, Zod 스키마로 빌드 타임 검증한다.

- Content Collections가 요구 1을 **프레임워크 기본 기능으로** 제공 — 스키마 불일치 시 빌드가 실패한다. 출처: [Astro Docs — Content collections](https://docs.astro.build/en/guides/content-collections/)
- zero-JS 기본 출력이 요구 2와 일치. 아일랜드는 쓰지 않는다(필요 없음).
- `astro:assets`(sharp 기반)가 요구 3의 리사이즈를 담당. OG 카드는 ADR-0010.
- 파생 로직은 `src/lib/`의 순수 TypeScript 모듈 — 프레임워크 비의존, 단독 테스트 가능 (요구 5).

## 대안

1. **Eleventy** — 더 단순하지만 스키마 검증·타입·이미지 파이프라인이 전부 DIY. 요구 1을 직접 만들면 Astro 채택분보다 코드가 늘어난다.
2. **Hugo** — 빌드 최속이나 Go 템플릿 안에 도출 로직을 넣게 되어 요구 5(단독 테스트 가능한 파생 로직)가 무너진다. Node 환경(charter §6)과도 이질.
3. **Next.js static export** — React 런타임 전제가 요구 2와 상충(끄는 것이 일). 이 규모에 과체급.

## 결과

- (+) SS-1·SS-8 검증의 절반이 프레임워크 기본값으로 해결된다.
- (−) Astro 메이저 버전 갱신 비용 — 콘텐츠가 도구 중립(ADR-0001)이므로 갇히지 않는다. 빌드 시간은 콘텐츠 수백 건 규모에서 문제되지 않는 수준으로 보고됨(외부 측정 예: 500페이지 ~18초 — [athanasiadis.me](https://athanasiadis.me/blog/content-collections/) 계열 커뮤니티 보고, 자체 실측 전 참고치).
- 빌드 시간 예산: **콘텐츠 300건에서 < 60초** (예산이며 실측 후 조정 — exceptions.md 원칙).
