# Starts the local test API on port 5056 for the test database named in .env
# (2026-11-09: mizan_test_clean, files in artifacts/api-server/uploads-mizan-test-clean).
# Development only: no e-mail, SMS or push leaves the machine (OUTBOUND_DELIVERY=off).
# Only a process running artifacts/api-server/dist/index.mjs on that port is stopped.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "scripts/.seedgen/logs"
New-Item -ItemType Directory -Force $logs | Out-Null

$port = 5056
$c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
  if ($p.CommandLine -match "dist/index.mjs") { Stop-Process -Id $p.ProcessId -Force -Confirm:$false }
  else { throw "Port $port is used by another program : $($p.CommandLine)" }
}

$env:OUTBOUND_DELIVERY = "off"
$env:PORT = "$port"
$env:LOCAL_UPLOADS_DIR = "uploads-mizan-test-clean"
Start-Process -FilePath node -ArgumentList "--env-file=../../.env", "./dist/index.mjs" -WorkingDirectory (Join-Path $root "artifacts/api-server") -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "api5056.log") -RedirectStandardError (Join-Path $logs "api5056.err.log")
Remove-Item Env:PORT, Env:OUTBOUND_DELIVERY, Env:LOCAL_UPLOADS_DIR

$ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
  try { Invoke-WebRequest -UseBasicParsing "http://localhost:$port/api/health" -TimeoutSec 2 | Out-Null; $ok = $true } catch { if ($_.Exception.Response) { $ok = $true } else { Start-Sleep -Milliseconds 750 } }
}
"API $port : $(if ($ok) { 'ready' } else { 'NOT STARTED' })"
