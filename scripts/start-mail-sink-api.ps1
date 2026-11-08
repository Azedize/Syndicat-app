# Test API wired to the local mail sink (2026-11-08) — test base only.
#   powershell -ExecutionPolicy Bypass -File scripts/start-mail-sink-api.ps1
#
# Starts the SMTP sink on 127.0.0.1:1025 and an API on port 5057 whose mail goes
# to it. The variables below are set for these two processes only: .env and the
# production SMTP settings are not read for mail and not changed. The API refuses
# the sink mode unless the SMTP host is on the loopback interface (EMAIL_SINK=on,
# lib/email/deliverability.ts). Point the emulator at it with:
#   adb reverse tcp:5056 tcp:5057
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "scripts/.seedgen/logs"
New-Item -ItemType Directory -Force $logs | Out-Null

foreach ($port in 1025, 5057) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Start-Process -FilePath node -ArgumentList "--import=tsx", "src/mail-sink.ts", "serve" -WorkingDirectory (Join-Path $root "scripts") -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "mail-sink.log") -RedirectStandardError (Join-Path $logs "mail-sink.err.log")

# Process environment wins over --env-file: these values replace the SMTP ones of .env for this API only.
$env:PORT = "5057"
$env:RATE_LIMIT_PROFILE = "test"
$env:EMAIL_SINK = "on"
$env:SMTP_HOST = "127.0.0.1"
$env:SMTP_PORT = "1025"
$env:SMTP_SECURE = "false"
$env:USE_TLS = "false"
$env:SMTP_USER = "sink"
$env:SMTP_PASS = "sink"
$env:SMTP_FROM = "MIZAN Test <no-reply@mizan.test>"
Start-Process -FilePath pnpm.cmd -ArgumentList "run", "-s", "testdb", "--", "exec", "node", "--env-file=../.env", "../artifacts/api-server/dist/index.mjs" `
  -WorkingDirectory (Join-Path $root "scripts") -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "api5057.log") -RedirectStandardError (Join-Path $logs "api5057.err.log")
Remove-Item Env:PORT, Env:RATE_LIMIT_PROFILE, Env:EMAIL_SINK, Env:SMTP_HOST, Env:SMTP_PORT, Env:SMTP_SECURE, Env:USE_TLS, Env:SMTP_USER, Env:SMTP_PASS, Env:SMTP_FROM

$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  Start-Sleep -Milliseconds 500
  try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5057/api/subscriptions/plans/public" -TimeoutSec 2 | Out-Null; $ok = $true } catch {}
}
"API 5057 (mail sink) : $(if ($ok) { 'ready' } else { 'not ready' })"
