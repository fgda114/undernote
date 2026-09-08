# publish-desk

이 디렉터리는 **비공개 저장소의 루트 그대로 올릴 파일 트리**입니다. 무엇을 위한 것인지, 어떻게
쓰는지는 사용자 대상 문서를 보십시오 — 여기(README)는 "이 트리를 어떻게 새 저장소에 옮기는가"만
다룹니다.

- 글 쓰는 사람(원)이 실제로 따라 할 순서: **`docs/publishing.md`** (undernote 공개 저장소, 이
  파일과 같이 커밋됨) §"글 쓰는 사람용"
- 저장소를 만들고 이 트리를 올리는 절차, PAT 발급, 첫 동작 확인: **`docs/publishing.md`**
  §"사용자(개발자)용"

## 이 트리가 왜 이런 모양인가

```
tools/publish-desk/                 ← 이 디렉터리 전체가
  .github/ISSUE_TEMPLATE/*.yml        새 비공개 저장소의
  .github/workflows/publish.yml       루트 .github/ 로,
  scripts/                            루트 scripts/ 로,
  package.json                        루트 package.json 등으로
  ...                                 그대로 옮겨집니다.
```

즉 비공개 저장소를 만든 뒤 `tools/publish-desk/` **안의 내용물**(디렉터리 자체가 아니라 그
안의 `.github/`, `scripts/`, `package.json` 등)을 그 저장소 루트에 복사하면 됩니다.
`docs/publishing.md`는 옮기지 않습니다 — 그건 공개 저장소에 남아 개발자가 참고하는 문서입니다.

## 로컬에서 확인하기

```sh
cd tools/publish-desk
npm install     # sharp(커버 리사이즈) · yaml(프론트매터/설정 파싱)
npm test        # node --test — 네트워크 없이 도는 순수 함수 테스트 전부
```

`npm test`가 실제로 하는 것과 하지 않는 것 — 정직하게: 폼 파싱·슬러그 생성·프론트매터 조립·
장르 라벨 매칭·커버 리사이즈(진짜 sharp로, 합성 이미지 상대) 전부 실제 코드로 검증합니다.
**GitHub Issue Form이 실제로 만드는 본문을 상대로 검증한 적은 없습니다** — `scripts/fixtures/`의
텍스트는 GitHub 공식 문서에 기술된 렌더링 형식을 손으로 재현한 것입니다. 저장소를 만들고 첫 이슈를
한 번 올려서 실제로 맞는지 확인하는 절차가 `docs/publishing.md`에 있습니다.

**수정·삭제(2026-09-08 추가)**: 이슈 번호 → slug 복원(`resolve-published.mjs`)은 이 세션이
직접 만든 진짜 `git init` 저장소를 상대로, 삭제 대상 판정(`takedown.mjs`)과 오케스트레이션
(`publish.mjs`의 `updateReview`/`updateStory`/`takedownReview`/`takedownStory`)은 실제
파일 시스템(임시 디렉터리) 상대로 end-to-end 검증했습니다. **실제 GitHub 이슈를 수정
저장하거나 라벨을 붙여본 적은 없습니다** — `docs/publishing.md` §3.4에 무엇을 검증했고 무엇을
못 했는지 자세히 적어 뒀습니다.

## 소유권 경계 (BATHOS_OWNED_PATHS)

이 디렉터리와 `docs/publishing.md`만 이 작업에서 다뤘습니다. `src/**` · `content/**` ·
`config/**` · `e2e/**`는 건드리지 않았습니다 — 특히 `config/genres.yaml`의 장르 목록은
`.github/ISSUE_TEMPLATE/review.yml`의 드롭다운과 손으로 맞춰야 하는 지점이고, 그 이유와 어긋났을
때 무슨 일이 일어나는지는 `resolve-content.mjs`의 `resolveGenreBucket` 주석과
`docs/publishing.md`에 적어 두었습니다.
