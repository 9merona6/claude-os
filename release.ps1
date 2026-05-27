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

# Collect release notes via a temp file edited in Notepad.
# Write template with UTF-8 + BOM via .NET API so Notepad detects encoding
# correctly and any Korean you type is preserved.
$notesFile = Join-Path $env:TEMP "claude-os-release-notes-$v.md"
$template = @"
# Release notes for v$v
#
# Write one bullet per line below this block. Lines starting with '#' are ignored.
# Save and close Notepad to continue. Leave empty for a default message.
# Korean / English both fine.
#
# Example:
#   - sidecar spawn buf fix
#   - markdown rendering for code blocks
#   - silent updates on Windows

"@
$utf8WithBom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($notesFile, $template, $utf8WithBom)

Write-Host "==> Opening Notepad for release notes (save and close when done)" -ForegroundColor Cyan
Start-Process notepad.exe -ArgumentList "`"$notesFile`"" -Wait

# Read back as UTF-8 (handles BOM automatically)
$rawNotes = [System.IO.File]::ReadAllText($notesFile, [System.Text.Encoding]::UTF8)
$lines = ($rawNotes -split "`r?`n") |
    Where-Object { $_ -notmatch '^\s*#' } |
    Where-Object { $_.Trim() -ne '' }
$notes = ($lines -join "`n").Trim()

if ([string]::IsNullOrWhiteSpace($notes)) {
    $notes = "Release v$v"
    Write-Host "    (no notes entered — using default '$notes')" -ForegroundColor Yellow
}

# Write tag message to a temp file so multi-line + unicode survives the shell
$tagMsgFile = Join-Path $env:TEMP "claude-os-tag-$v.txt"
[System.IO.File]::WriteAllText($tagMsgFile, $notes, $utf8WithBom)

Write-Host "==> Tagging v$v (annotated) with notes:" -ForegroundColor Cyan
Write-Host $notes -ForegroundColor DarkGray
git tag -a "v$v" -F $tagMsgFile
Remove-Item $notesFile -ErrorAction SilentlyContinue
Remove-Item $tagMsgFile -ErrorAction SilentlyContinue

Write-Host "==> Pushing to GitHub" -ForegroundColor Cyan
git push
git push --tags

Write-Host "==> Watching CI build (Ctrl+C to detach)" -ForegroundColor Green
gh run watch
