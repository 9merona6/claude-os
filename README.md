# Claude OS

[Claude Code](https://docs.anthropic.com/claude-code) 용 홀로그래픽 데스크톱 터미널. Tauri + React 로 만든 사이버펑크 GUI 로, 공식 [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) 를 감싸고 있습니다.

```
┌─────────────┬───────────────────────────────────────┬──────────────┐
│  SESSIONS   │  NEURAL INTERFACE      [OPUS 4.7  ▾]  │  TELEMETRY   │
│             │                                       │              │
│  · dev.ljm  │       ◐  IDLE                         │  Plan quota  │
│  · champ-1  │                                       │  5h  ▓▓░░░░  │
│  · champ-2  │   YOU  prompt                         │  Weekly ░░░  │
│             │   > refactor src/auth.ts              │              │
│   + NEW     │                                       │  Daily 7d    │
│             │   CLAUDE response                     │  ▆▂▃▅▇█▃     │
│  PLAN/TODO  │   ▼ Update (src/auth.ts)              │              │
│  ☑ Read     │     1 - const x = 1                   │  Tools 152x  │
│  ◐ Refactor │     1 + const x = 2                   │              │
│  ☐ Test     │                                       │  Context 0/1M│
└─────────────┴───────────────────────────────────────┴──────────────┘
```

## 안내

**Claude OS 는 비공식(unofficial) 소프트웨어입니다.** Anthropic, PBC 와 제휴·후원·승인·연관 관계가 없습니다. "Claude" 는 Anthropic 의 상표이며, 본 프로젝트는 그 기반 기술을 식별하기 위한 용도로만 해당 명칭을 사용합니다.

사용자는 본인의 Claude Pro / Max / Team 구독으로 표준 Claude Code CLI 로그인 절차를 거쳐 사용합니다. 이 앱에는 어떠한 인증 정보, API 접근 권한, 사용량(quota) 도 포함되어 있지 않습니다.

## 설치

Windows 10/11 에서 테스트되었습니다.

1. [Node.js 20 이상](https://nodejs.org) 설치
2. Claude Code 를 전역 설치하고 로그인:
   ```sh
   npm install -g @anthropic-ai/claude-code
   claude
   # → /login → 브라우저에서 Claude 계정으로 인증
   ```
3. [Releases 페이지](https://github.com/lee-jongmyoung/my-claude-terminal/releases/latest) 에서 최신 `.exe` 인스톨러를 받아 실행
4. 시작 메뉴에서 실행. 이후 업데이트는 백그라운드에서 자동으로(완전 무음) 적용됩니다.

## 주요 기능

- 홀로그래픽 터미널 UI — 사이버펑크 테마, neural orb 상태 표시기, 앰비언트 스캔라인
- 멀티 세션 탭 — `~/.claude/projects/` 에서 자동 감지, 이름 변경 / 삭제 가능
- 실시간 텔레메트리 — Plan 할당량 (5시간 + 주간), 7일 토큰 차트, 툴 호출 카운터, 컨텍스트 미터
- 풍부한 응답 렌더링 — 마크다운, 코드 문법 강조, 라인 단위 diff, 접고 펼칠 수 있는 툴 카드
- 세션별 모델 선택 (Opus / Sonnet / Haiku)
- 자동 업데이트 — Ed25519 서명된 무음 인앱 업데이터
- 폴더 선택 네이티브 다이얼로그

## 라이선스

[MIT](LICENSE) — 개인 취미 프로젝트이며 별도의 지원은 제공되지 않습니다.

이 프로젝트는 다음과 같은 서드파티 패키지를 사용하며, 각각의 라이선스를 따릅니다: Tauri, React, `@anthropic-ai/claude-agent-sdk`, recharts, react-markdown, react-syntax-highlighter, diff.
