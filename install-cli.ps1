# PowerShell 어디서나 `claude-os {dev|build|release [patch|minor|major]}` 쓸 수 있게
# 사용자 프로필에 함수 등록.
# 사용법: .\install-cli.ps1 (한 번만 실행)

$projectDir = (Resolve-Path $PSScriptRoot).Path

$marker = "# --- claude-os CLI (auto-installed) ---"
$endMarker = "# --- end claude-os CLI ---"

$func = @"
$marker
function claude-os {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)][string]`$Cmd = "dev",
        [Parameter(Position=1)][string]`$Arg
    )
    `$proj = "$projectDir"
    Push-Location `$proj
    try {
        switch (`$Cmd) {
            "dev"     { & .\dev.ps1 }
            "build"   { npm run tauri build }
            "release" { & .\release.ps1 `$Arg }
            "help"    { Write-Host "Usage: claude-os {dev|build|release [patch|minor|major]}" }
            default   { Write-Host "Unknown command: `$Cmd`nUsage: claude-os {dev|build|release [patch|minor|major]}" }
        }
    } finally {
        Pop-Location
    }
}
$endMarker
"@

if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
    Write-Host "==> Created profile: $PROFILE" -ForegroundColor Cyan
}

$existing = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
if ($existing -and $existing.Contains($marker)) {
    Write-Host "==> claude-os CLI already installed in profile, replacing" -ForegroundColor Yellow
    $pattern = "(?s)$([regex]::Escape($marker)).*?$([regex]::Escape($endMarker))"
    $existing = [regex]::Replace($existing, $pattern, "").Trim()
    Set-Content $PROFILE -Value ($existing + "`n`n" + $func)
} else {
    Add-Content $PROFILE -Value "`n$func"
    Write-Host "==> Installed claude-os CLI to profile" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! Reload your shell or run:" -ForegroundColor Green
Write-Host "    . `$PROFILE" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then anywhere:" -ForegroundColor Green
Write-Host "    claude-os dev       # 로컬 dev 모드" -ForegroundColor White
Write-Host "    claude-os build     # 프로덕션 빌드" -ForegroundColor White
Write-Host "    claude-os release   # 버전 bump + 푸시 (patch)" -ForegroundColor White
Write-Host "    claude-os release minor" -ForegroundColor White
