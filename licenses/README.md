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

## Reserved Font Name — **해소됨 (2026-09-10)**

**Pretendard에는 RFN이 걸려 있고**(상류 `LICENSE` 2행
`with Reserved Font Name 'Pretendard'`), **서브셋은 Modified Version이므로 그 이름을 쓸 수 없다.**
SIL 공식 FAQ 2.6이 이 경우를 직접 다룬다:

> **2.6 Is subsetting a webfont considered modification?**
> Yes. Removing any parts of the font when delivering a webfont to a browser, including unused glyphs
> and smart font code, is considered modification. This is permitted by the OFL but **would not
> normally allow the use of RFNs.**

FAQ 2.8의 예외(Functional Equivalence)는 네 조건 전부를 요구하는데 이 저장소의 산출물은
문자 목록을 KS X 1001 범위로 잘랐으므로 이미 어긴다.

### 무엇을 했는가

**서브셋을 개명했다.** 원본 폰트가 없어도 되는 방법이었다 — 이미 있는 서브셋 파일의 `name`
테이블을 직접 고치면 된다(fontTools). 2026-09-08 기록은 "원본으로 다시 서브셋해야 한다"고
적었는데 **그건 틀린 판단이었다.**

| 대상 | 이전 | 지금 |
|---|---|---|
| `name` ID 1·4·16 (family) | `Pretendard Variable` | **`Undernote Sans`** |
| `name` ID 6 (PostScript) | `PretendardVariable-Regular` | **`UndernoteSans-Regular`** |
| `name` ID 3 (unique id) | `1.309;CTUS;PretendardVariable` | **`1.309;UNDN;UndernoteSans-Regular`** |
| CSS `font-family` | `'Pretendard Variable'` | **`'Undernote Sans'`** |

**저작권 표시(`name` ID 0 — `Copyright © 2023 Kil Hyung-jin`)는 건드리지 않았다.** OFL이
요구하는 것은 이름을 쓰지 않는 것이지 출처를 지우는 것이 아니다.

**`--sans` 스택에서 `Pretendard`는 그대로 다음 자리에 남겼다.** 진짜를 설치해 둔 독자는 그것을
받고, 받되 **그것의 진짜 이름으로** 받는다.

### 같이 고친 것 — 라이선스 메타데이터

서브셋터 기본값이 `name` ID 13(라이선스 본문)·14(URL)를 버려서 **세 서체의 TTF/woff2 모두에
없었다.** OFL §2가 요구하는 고지 자체이고 FE 조건 중 메타데이터 항목이기도 하다. 네 파일
전부에 복원했다.

**Noto Serif KR은 개명하지 않았다** — 상류 `LICENSE`에 RFN 선언이 한 건도 없다(본문
"Definitions"에 나오는 것은 용어 정의이지 선언이 아니다). 13·14만 복원했다.

### 검증

실브라우저에서 확인했다 — `PretendardVariable-sub.woff2`가 200으로 로드되고,
`document.fonts`에 `Undernote Sans`가 `loaded`로 등록되며, 워드마크의 computed
`font-family`가 `"Undernote Sans"`다. **이름이 어긋나면 조용히 대체 폰트로 떨어지므로
그 확인이 이 작업의 핵심이었다.**

`scripts/subset-fonts.py`는 앞으로 name ID 0·13·14를 보존한다(2026-09-08). **다음에 원본으로
다시 서브셋을 돌린다면 개명도 그 스크립트에서 함께 해야 한다** — 지금은 산출물에만 적용돼
있다.
