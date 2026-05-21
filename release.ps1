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

Write-Host "==> Committing + tagging v$v" -ForegroundColor Cyan
git add .
git commit -m "release v$v"
git tag "v$v"

Write-Host "==> Pushing to GitHub" -ForegroundColor Cyan
git push
git push --tags

Write-Host "==> Watching CI build (Ctrl+C to detach)" -ForegroundColor Green
gh run watch
