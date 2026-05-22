# 한 줄로 릴리스: .\release.ps1 [patch|minor|major]
# 예: .\release.ps1 patch  →  0.1.1 → 0.1.2
$bump = if ($args[0]) { $args[0] } else { "patch" }

Write-Host "==> Bumping version ($bump)" -ForegroundColor Cyan
npm version $bump --no-git-tag-version | Out-Null
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "    New version: $v" -ForegroundColor Green

Write-Host "==> Syncing Cargo.toml + tauri.conf.json" -ForegroundColor Cyan
(Get-Content src-tauri/Cargo.toml) -replace '^version = "[^"]*"', "version = `"$v`"" | Set-Content src-tauri/Cargo.toml
$t = Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
$t.version = $v
$t | ConvertTo-Json -Depth 20 | Set-Content src-tauri/tauri.conf.json

Write-Host "==> Committing v$v" -ForegroundColor Cyan
git add .
git commit -m "release v$v"

# Collect release notes via a temp file edited in Notepad
$notesFile = Join-Path $env:TEMP "claude-os-release-notes-$v.md"
@"
# v$v release notes
#
# - 라인 하나에 한 항목씩 작성 (예: - 사이드카 spawn 버그 수정)
# - 이 파일을 저장하고 닫으면 그 내용이 릴리스 설명에 들어갑니다
# - 빈 파일로 닫으면 기본 메시지가 들어감
# - '#' 으로 시작하는 줄은 주석으로 무시됨

"@ | Set-Content -Path $notesFile -Encoding UTF8

Write-Host "==> Opening Notepad for release notes (save and close when done)" -ForegroundColor Cyan
Start-Process notepad.exe -ArgumentList "`"$notesFile`"" -Wait

$rawNotes = Get-Content $notesFile -Raw -Encoding UTF8
$lines = ($rawNotes -split "`r?`n") |
    Where-Object { $_ -notmatch '^\s*#' } |
    Where-Object { $_.Trim() -ne '' }
$notes = ($lines -join "`n").Trim()

if ([string]::IsNullOrWhiteSpace($notes)) {
    $notes = "See commits since previous release."
}

Write-Host "==> Tagging v$v with notes:" -ForegroundColor Cyan
Write-Host $notes -ForegroundColor DarkGray
git tag -a "v$v" -m $notes
Remove-Item $notesFile -ErrorAction SilentlyContinue

Write-Host "==> Pushing to GitHub" -ForegroundColor Cyan
git push
git push --tags

Write-Host "==> Watching CI build (Ctrl+C to detach)" -ForegroundColor Green
gh run watch
