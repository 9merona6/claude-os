# 배포 + 자동 업데이트 가이드

이 문서는 my-claude-terminal을 다른 PC에 배포하고 자동 업데이트가 동작하도록 설정하는 방법입니다.

## 한 번만 하는 셋업

### 1) GitHub 저장소 만들기

```powershell
cd C:\Users\dev.ljm\my-claude-terminal
git init
git add .
git commit -m "initial commit"

# GitHub CLI로 한 번에 생성 + push (gh auth login 먼저 필요)
gh repo create my-claude-terminal --private --source=. --push

# 또는 GitHub 웹에서 빈 저장소 만든 뒤
# git remote add origin https://github.com/<user>/my-claude-terminal.git
# git push -u origin main
```

### 2) tauri.conf.json 의 endpoint 수정

`src-tauri/tauri.conf.json` 에서 `{REPO_OWNER}` 와 `{REPO_NAME}` 을 실제 값으로 교체:

```jsonc
"endpoints": [
  "https://github.com/asdtlkh12/my-claude-terminal/releases/latest/download/latest.json"
]
```

이걸 안 바꾸면 클라이언트가 업데이트 못 찾습니다.

### 3) GitHub Secrets 설정

저장소 페이지 → Settings → Secrets and variables → Actions → "New repository secret" 두 개:

| 이름 | 값 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `src-tauri/updater.key` 파일 내용 통째로 복사 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (비어있음 — 그냥 빈 값으로 저장) |

> ⚠️ **`updater.key` 파일은 절대 git에 올라가면 안 됩니다.** .gitignore에 추가되어 있습니다. 별도 안전한 곳(1Password 등)에 백업해두세요. 잃어버리면 다시 만들어야 하는데, 그러면 모든 PC에서 앱 재설치 필요합니다.

### 4) 첫 릴리스 푸시

```powershell
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions가 자동으로:
- Tauri 앱 + 사이드카 빌드
- .msi 인스톨러 생성
- Ed25519 서명
- `latest.json` 매니페스트 생성
- GitHub Release에 모두 업로드

3-5분 정도 걸립니다. 끝나면 https://github.com/<user>/my-claude-terminal/releases 에서 확인.

### 5) 다른 PC에 첫 설치

다른 노트북에서:

```powershell
# 사전 요구사항 (한 번만)
# 1. Node.js 20+ 설치: https://nodejs.org
# 2. Claude Code 설치
npm install -g @anthropic-ai/claude-code
# 3. 로그인
claude
# (/login 누르고 Pro/Max 계정으로)

# 그 다음 .msi 다운로드해서 설치
# https://github.com/<user>/my-claude-terminal/releases 에서 받기
```

설치하면 시작 메뉴에 "My Claude Terminal" 등록됨.

## 평소 사용 (업데이트 푸시)

코드 수정한 뒤:

```powershell
cd C:\Users\dev.ljm\my-claude-terminal

# 1. 버전 올리기 (src-tauri/tauri.conf.json + src-tauri/Cargo.toml + package.json 셋 다)
# 또는 npm version 으로 일괄
npm version patch   # 0.1.0 → 0.1.1

# 2. 변경사항 커밋 + 태그
git add .
git commit -m "your message"
git tag v0.1.1
git push && git push --tags
```

GitHub Actions가 자동 빌드 → Release 발행.

## 다른 PC에서 자동 업데이트

설치된 앱을 실행하면:

1. **앱 시작할 때** 자동으로 `latest.json` 체크
2. 새 버전 발견하면 **상단에 시안색 배너** 표시:
   ```
   ⬆ 새 버전 v0.1.1 가 사용 가능합니다  [지금 설치]
   ```
3. **"지금 설치" 클릭** → 다운로드 → 설치 → "재시작" 버튼
4. 클릭하면 앱 재시작되며 새 버전으로

자동으로 됨. 다른 PC들 따로 git pull 같은 거 안 해도 됩니다.

## 문제 해결

### "업데이트 실패: ..." 빨간 배너

- `tauri.conf.json` endpoint URL 확인
- GitHub Release에 `latest.json` 이 있는지 확인
- `latest.json` 안의 서명이 앱에 등록된 public key와 일치하는지 확인

### 다른 PC 첫 실행 후 사이드카가 안 뜸

- Node.js 깔려있는지: `node --version`
- Claude Code 깔려있는지: `claude --version`
- 로그인 됐는지: `claude auth status`

### 서명 키를 새로 만들어야 하는 경우

```powershell
npx tauri signer generate -w src-tauri/updater.key -p "" -f
```

- 새 public key (`updater.key.pub` 내용) 를 `tauri.conf.json` 의 `pubkey` 에 붙여넣기
- 새 private key (`updater.key` 내용) 를 GitHub Secret `TAURI_SIGNING_PRIVATE_KEY` 에 업데이트
- 모든 PC에 새 .msi 재설치 필요 (이전 키로 서명된 update는 거부)

## 한 번에 한 PC만 작업하면 더 좋은 워크플로우

매번 `npm version patch + git tag + push` 가 귀찮으면 더 간단한 방법:

```powershell
# bump-and-release.ps1
$bump = $args[0]  # patch / minor / major
npm version $bump --no-git-tag-version
$v = (Get-Content package.json | ConvertFrom-Json).version

# Cargo.toml과 tauri.conf.json도 같이 업데이트
(Get-Content src-tauri/Cargo.toml) -replace 'version = "[^"]*"', "version = `"$v`"" | Set-Content src-tauri/Cargo.toml
$tauri = Get-Content src-tauri/tauri.conf.json | ConvertFrom-Json
$tauri.version = $v
$tauri | ConvertTo-Json -Depth 10 | Set-Content src-tauri/tauri.conf.json

git add .
git commit -m "release v$v"
git tag "v$v"
git push && git push --tags
```

저장하면 `.\bump-and-release.ps1 patch` 한 줄로 릴리스.
