# undernote

> 앨범 리뷰와 음악 이야기를 올리는 매거진 

## 무엇

- **올해의앨범** - 연도별 앨범 리스트 제공.
- **리뷰** — 앨범 단위 비평.
- **노트** — 음악 이야기.
- **아카이브** — 연도 · 장르 · 아티스트로 탐색.

## 상태

초기 설계 단계. 스택과 정보 구조는 BATHOS 파이프라인의 Wave 1~2에서 확정합니다.

## 개발

이 저장소는 [BATHOS](https://github.com/fgda114/bathos) 메서드 패키지 위에서 개발합니다.
`.claude/`, `assets/`, `modules/` 는 BATHOS 설치본이며, 파이프라인 산출물은
`.agent-team/` 에 쌓입니다 (git에는 올리지 않음).

```powershell
# 엔진 경로 (BATHOS 레포에 빌드된 바이너리를 가리킴)
$env:BATHOS_BIN = "D:\su\Documents\Github\bathos\core\target\release\bathos.exe"
```

Claude Code 세션에서:

```text
/team-kickoff
/route         D:\su\Documents\Github\undernote
/wave1-discovery  D:\su\Documents\Github\undernote
```

## 라이선스

미정.
