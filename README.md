# undernote

> 앨범 리뷰와 음악 이야기를 올리는 매거진 

## 무엇

- **올해의앨범** - 연도별 앨범 리스트 제공.
- **리뷰** — 앨범 단위 비평.
- **노트** — 음악 이야기.
- **아카이브** — 연도 · 장르 · 아티스트로 탐색.

## 상태

운영 중 — https://fgda114.github.io/undernote/

정적 사이트(Astro)이고 GitHub Pages로 배포합니다. 빌드가 곧 검증입니다: 콘텐츠 규칙
위반은 `E-1xx` 코드로 **빌드를 실패시켜** 배포되지 않습니다.

## 글은 어떻게 올라가나

글 쓰는 사람은 이 저장소를 쓰지 않습니다. **비공개 저장소의 폼**에 칸을 채우면
GitHub Actions가 파일을 만들어 여기에 커밋합니다. 규칙 검증은 이 저장소의 빌드가
그대로 하고, 실패하면 그 오류 문구가 폼 화면에 댓글로 돌아갑니다.

절차와 설정은 [`docs/publishing.md`](docs/publishing.md)에 있습니다 — 글 쓰는
사람용(§1)과 개발 담당용(§2)이 나뉘어 있습니다.

## 개발

```bash
npm install
npm run dev          # 개발 서버
npm run check        # 타입 검사
npm test             # 유닛
npm run build        # 빌드 + 콘텐츠 검증 게이트
cd e2e && npm run e2e   # 브라우저 검증 (npx playwright test 아님 — 샌드박스를 다시 만들지 않습니다)
```

설계 문서와 파이프라인 산출물은 `.agent-team/`에 쌓이며 git에는 올리지 않습니다.

## 서체

본문 서체는 SIL Open Font License 1.1 서체의 **서브셋**입니다. 라이선스 사본과
개명 근거는 [`licenses/`](licenses/)에 있습니다.

## 라이선스

코드는 미정. 평론·이야기 본문의 저작권은 글쓴이에게 있습니다.
