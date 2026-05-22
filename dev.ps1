# Dev 모드 원클릭 실행: .\dev.ps1
# - 기존 사이드카/앱 프로세스 정리 (포트 7891 점유 해제)
# - sidecar/dist/index.js 없으면 한 번 빌드 (Tauri 가 참조하니까)
# - npm run tauri dev 실행

Write-Host "==> Killing leftover processes" -ForegroundColor Cyan
Get-Process node, "claude-os", "my-claude-terminal" -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "    stopping $($_.ProcessName) (pid=$($_.Id))" -ForegroundColor DarkGray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }

# 포트 7891 잡고 있는 게 또 있으면 죽이기
$port = netstat -ano | Select-String ":7891\s.*LISTENING"
if ($port) {
    $pidVal = ($port -split '\s+')[-1]
    if ($pidVal -match '^\d+$') {
        Write-Host "    killing pid=$pidVal on :7891" -ForegroundColor DarkGray
        Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
    }
}

$sidecarDist = "sidecar/dist/index.js"
if (-not (Test-Path $sidecarDist)) {
    Write-Host "==> Building sidecar (one-time)" -ForegroundColor Cyan
    Push-Location sidecar
    npm run build
    Pop-Location
} else {
    Write-Host "==> sidecar/dist exists, skipping build" -ForegroundColor DarkGray
}

Write-Host "==> Starting Tauri dev" -ForegroundColor Green
npm run tauri dev
