# undernote

> 묻혀 있던 명반을 찾아 듣고, 기록하고, 평가하는 음악 매거진.

## 무엇

차트 밖에서 사라진 앨범들 — 절판된 인디 레코드, 한 장 내고 해체한 밴드, 평단이 놓친 2집 —
을 소개하고 리뷰하는 웹 매거진입니다.

- **리뷰** — 앨범 단위 비평. 점수보다 맥락과 문장을 우선.
- **아카이브** — 아티스트 · 연도 · 장르 · 레이블로 탐색.
- **셀렉션** — 주제별 큐레이션 (예: "1997년 한국 언더그라운드", "한 장으로 끝난 밴드들").

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
