# 서체 라이선스

이 저장소가 배포하는 웹폰트는 **SIL Open Font License 1.1** 서체의 **서브셋(Modified Version)** 이다.
OFL 1.1 §2는 수정본을 배포할 때 **저작권 고지와 라이선스 사본을 함께 둘 것**을 조건으로 두므로,
이 디렉터리의 텍스트 파일이 그 사본이다.

**두 `.txt`는 상류 원문 그대로다.** 요약·번역·재작성하지 않았다 — OFL이 요구하는 것은 사본이지 설명이 아니다.
이 README만 우리가 쓴 것이고, 조건을 바꾸지 않는다.

## 어떤 파일이 무엇을 덮는가

| 라이선스 사본 | 덮는 산출물 |
|---|---|
| `Pretendard-OFL.txt` | `public/fonts/PretendardVariable-sub.woff2` · `src/assets/fonts/Pretendard-400-sub.ttf` |
| `NotoSerifKR-OFL.txt` | `public/fonts/NotoSerifKR-{400,700}-sub.woff2` · `src/assets/fonts/NotoSerifKR-{400,700}-sub.ttf` |

`src/assets/fonts/`의 TTF는 OG 카드 렌더러(satori)가 빌드 시점에만 읽는 파일로 `dist/`에 실리지 않는다.
그래도 저장소로 배포되므로 같은 조건이 걸린다.

## 출처 (2026-09-08 취득)

| 서체 | 원문 URL | sha256 |
|---|---|---|
| Pretendard | `https://raw.githubusercontent.com/orioncactus/pretendard/main/LICENSE` | `82e9c8a4b203261f10ddba1296422d64914ff3d4b7bd8a12896d03f0f088d70a` |
| Noto Serif KR | `https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/LICENSE` | `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2` |

## 저작권 고지

Noto의 상류 `LICENSE`에는 저작권 줄이 없다(라이선스 본문만 담고 있다). 고지는 폰트 자신의 `name` 테이블에 있고,
이 저장소의 서브셋 파일에서 실제로 읽은 값을 그대로 옮긴다:

```
Noto Serif KR   (c) 2017-2024 Adobe (http://www.adobe.com/).      [name ID 0]
Pretendard      Copyright © 2023 Kil Hyung-jin                     [name ID 0]
```

Pretendard의 상류 `LICENSE`는 자체 고지를 머리에 달고 있다(`Copyright (c) 2021, Kil Hyung-jin`).
Pretendard가 Source Han Sans · Inter · M PLUS 1에서 파생됐으므로 그 세 건의 고지도 같은 파일에 함께 있다.

## Reserved Font Name — **Pretendard에 걸려 있다** (확인함, 2026-09-08)

| 서체 | RFN 선언 |
|---|---|
| **Pretendard** | **있음** — `with Reserved Font Name 'Pretendard'` (상류 `LICENSE` 2행). 파생 원본의 `'Source'`·`'Inter'`·`'M PLUS 1'`도 함께 선언돼 있다 |
| Noto Serif KR | **없음** — 상류 `LICENSE`에 `with Reserved Font Name` 선언이 한 건도 없다. 본문 §"Definitions"에 나오는 것은 용어 정의이지 선언이 아니다 |

**서브셋은 Modified Version이고, 따라서 RFN을 쓸 수 없다.** SIL의 공식 FAQ가 이 경우를 직접 다룬다:

> **2.6 Is subsetting a webfont considered modification?**
> Yes. Removing any parts of the font when delivering a webfont to a browser, including unused glyphs
> and smart font code, is considered modification. This is permitted by the OFL but **would not
> normally allow the use of RFNs.**
> — `https://openfontlicense.org/documents/OFL-FAQ.txt`

FAQ 2.7·2.8은 예외를 둔다 — **Functional Equivalence**를 지키면 RFN을 유지할 수 있다. 네 조건 전부를 만족해야 하고,
`scripts/subset-fonts.py`의 산출물은 그중 **둘을 명백히 어긴다**:

| FE 조건 | 이 저장소의 서브셋 |
|---|---|
| 같은 문자 목록 전부 지원 | **위반** — KS X 1001 2,350자 + ASCII + Latin-1 + 기호 소수로 잘랐다 |
| 같은 스마트 폰트 동작 | 축소 — 기본 레이아웃 피처 목록만 남기고 힌팅·`DSIG` 제거 |
| 시각적 품질 저하 없음 | 유지로 판단 |
| **원 저작자·프로젝트·라이선스 메타데이터 보존** | **위반이었음** — 서브셋터 기본값이 name ID 13(라이선스 본문)·14(URL)를 버렸다. 이 저장소의 세 TTF 모두 13·14가 없음을 실측 확인 |

### 지금 무엇이 충돌하는가

RFN 제한은 OFL §3의 문구대로 **"the primary font name as presented to the users"** 에 걸린다.
파일명이 아니라 **사용자에게 제시되는 주 서체명**이다. 그래서:

| 대상 | 값 | 판정 |
|---|---|---|
| 폰트 `name` 테이블 family (ID 1) | `Pretendard Variable` | **RFN 포함 — 충돌** |
| CSS `font-family` (`src/layouts/Base.astro` · `src/styles/tokens.css`) | `'Pretendard Variable'` | **RFN 포함 — 충돌** |
| 파일명 `PretendardVariable-sub.woff2` 등 | — | 주 서체명이 아니므로 §3의 직접 대상이 아니다. 다만 위 둘을 고치면 함께 정리하는 것이 자연스럽다 |
| OG 카드 렌더러 등록명 (`src/lib/og/render.ts`) | `sans` / `serif` | 무관 — 내부 별칭이라 RFN을 쓰지 않는다 |

### 해소 경로 (둘 중 하나, 결정 필요)

1. **개명한다.** 서브셋의 `name` 테이블 family와 CSS `font-family`를 `'Pretendard'`를 포함하지 않는 이름으로 바꾼다.
   `scripts/subset-fonts.py`를 원본 폰트 파일과 함께 다시 돌려야 하고(원본은 이 저장소에 없다), 시각적 변화는 0이다.
2. **저작자에게 서면 허가를 받는다.** OFL §3이 명시하는 다른 한 경로다(FAQ 2.7도 이쪽을 권한다).

**이 저장소는 아직 어느 쪽도 하지 않았다.** 미해소 상태를 여기 적어 두는 이유는, 라이선스 사본만 넣고
RFN을 조용히 넘어가면 다음 사람이 "확인됐다"고 읽기 때문이다.

### 이미 고친 것

`scripts/subset-fonts.py`가 앞으로는 name ID 0·13·14(저작권·라이선스 본문·라이선스 URL)를 **보존**한다.
FE 조건 중 메타데이터 항목이자, RFN과 무관하게 OFL §2가 요구하는 고지 그 자체다.
**현재 저장소에 커밋돼 있는 폰트 파일에는 아직 적용되지 않았다** — 원본 폰트로 서브셋을 다시 돌려야 반영된다.
