# Starts the API (http://127.0.0.1:8000) and the React dev server
# (http://localhost:5173) in this terminal. Ctrl+C stops both.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'frontend\node_modules') -or -not (Test-Path 'backend\.venv')) {
    Write-Host 'Installing dependencies...'
    npm run setup
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$api = Start-Process -FilePath 'uv' -NoNewWindow -PassThru -ArgumentList @(
    'run', '--project', 'backend', 'uvicorn', 'prepflip.main:app', '--reload', '--port', '8000'
)

try {
    npm --prefix frontend run dev
} finally {
    # /T also stops uvicorn's reloader child process.
    if (-not $api.HasExited) { taskkill /PID $api.Id /T /F | Out-Null }
}
