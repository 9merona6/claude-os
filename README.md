# my-claude-terminal

Tauri + React + `@anthropic-ai/claude-agent-sdk` 기반의 커스텀 터미널.

```
┌─────────────────────────────────────┬──────────────┐
│  Terminal (chat-style)              │  📋 Plan     │
│                                     │              │
│  $ refactor src/auth.ts             │  ☑ Read     │
│  > Read(auth.ts)                    │  ◐ Refactor  │
│  ✓ ...                              │  ☐ Test      │
│                                     ├──────────────┤
│  > _                                │  💰 Usage    │
│                                     │  [chart]     │
└─────────────────────────────────────┴──────────────┘
```

## 구조

- **`src/`** — React 프론트엔드 (Vite)
- **`sidecar/`** — Node.js WebSocket 서버 (Agent SDK 래핑)
- **`src-tauri/`** — Tauri 데스크톱 셸 (Rust)

프론트엔드는 `ws://127.0.0.1:7891` 로 사이드카에 붙어서 이벤트를 받습니다.

## 사전 요구사항

- **Node.js 20+**
- **Rust** (https://rustup.rs)
- **Anthropic API 키** — `ANTHROPIC_API_KEY` 환경변수
- **Claude Code CLI** — Agent SDK 가 내부적으로 사용
  ```sh
  npm install -g @anthropic-ai/claude-code
  ```

Tauri 의존성(Windows의 경우 WebView2)은 https://tauri.app/start/prerequisites/ 참고.

## 설치

```sh
cd C:\Users\dev.ljm\my-claude-terminal
npm install
cd sidecar && npm install && cd ..
```

## 개발 실행

환경변수 설정 후:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

**방법 1 — Tauri 창에서 실행 (권장)**

```sh
npm run tauri dev
```

`tauri.conf.json` 의 `beforeDevCommand` 가 `npm run dev` 를 실행하므로
사이드카(WebSocket :7891)와 Vite(:1420) 둘 다 자동으로 뜹니다.

**방법 2 — 브라우저에서 먼저 확인 (Tauri 없이)**

```sh
npm run dev
```

그 다음 브라우저에서 `http://127.0.0.1:1420` 접속.

## 사용법

1. 앱이 뜨면 우측 상단에 `sidecar connected` 표시 확인
2. 하단 입력창에 프롬프트 입력 (Enter 전송, Shift+Enter 줄바꿈)
3. 좌측: 대화/툴 호출 스트림
4. 우측 상단: 에이전트가 `TodoWrite` 호출하면 자동으로 플랜 업데이트
5. 우측 하단: 토큰·비용 실시간 라인 차트

## 시각화되는 이벤트

| 이벤트 | 어디서 보임 |
|---|---|
| 어시스턴트 텍스트 | Terminal |
| Extended thinking | Terminal (회색 이탤릭) |
| 도구 호출 (Read/Edit/Bash 등) | Terminal (🔧 태그) |
| 도구 결과 | Terminal (✓/❌ 태그) |
| `TodoWrite` | Plan 패널 |
| 토큰 사용량 | Usage 차트 + 상단 카드 |
| 누적 비용 | Usage 패널 헤더 (`$0.0000`) |

## 가격표 조정

`sidecar/src/index.ts` 상단의 `PRICE_*_PER_M` 상수를 사용하는 모델에 맞춰 수정하세요.
기본값은 Opus 4.7 기준이며, Agent SDK 가 `result` 메시지에서 `total_cost_usd` 를
돌려주면 그 값으로 덮어쓰기 때문에 대개는 그대로 둬도 됩니다.

## 빌드 (배포용 바이너리)

```sh
npm run tauri build
```

`src-tauri/target/release/bundle/` 에 인스톨러가 생성됩니다.

> ⚠️ 배포 빌드는 Node.js 사이드카를 따로 번들링해야 합니다.
> `pkg` 또는 `bun build --compile` 로 단일 바이너리로 만든 뒤
> `src-tauri/binaries/` 에 두고 `tauri.conf.json` 의 `bundle.externalBin`
> 으로 등록하는 작업이 필요합니다. (MVP에서는 dev 모드 동작만 검증)

## 다음 단계 아이디어

- [ ] Tauri 사이드카 바이너리 번들링 (`pkg` / `bun`)
- [ ] 세션 저장·재개
- [ ] 권한 모드 토글 (`bypassPermissions` → `acceptEdits` 등)
- [ ] MCP 서버 추가 UI
- [ ] 모델 스위처
- [ ] 도구 호출 타임라인 시각화
- [ ] 컨텍스트 사용량 게이지 (1M 윈도우 대비 %)
