# Restarts the two local test APIs (development only):
#   5055  working base (syndycat_global_cps), production rate limits, files in uploads/
#   5056  isolated test base (syndycat_test), test rate-limit profile, files in uploads-test/
# Only processes running artifacts/api-server/dist/index.mjs on those ports are stopped.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "scripts/.seedgen/logs"
New-Item -ItemType Directory -Force $logs | Out-Null

foreach ($port in 5055, 5056) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
    if ($p.CommandLine -match "dist/index.mjs") { Stop-Process -Id $p.ProcessId -Force -Confirm:$false }
    else { throw "Port $port is used by another program : $($p.CommandLine)" }
  }
}

$api = Join-Path $root "artifacts/api-server"
# Test APIs: no e-mail, SMS or push leaves the machine (an empty SMTP_HOST
# would be removed by PowerShell and reloaded from .env).
$env:OUTBOUND_DELIVERY = "off"
$env:PORT = "5055"
Start-Process -FilePath node -ArgumentList "--env-file=../../.env", "./dist/index.mjs" -WorkingDirectory $api -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "api5055.log") -RedirectStandardError (Join-Path $logs "api5055.err.log")

$env:PORT = "5056"
$env:RATE_LIMIT_PROFILE = "test"
Start-Process -FilePath pnpm.cmd -ArgumentList "run", "-s", "testdb", "--", "exec", "node", "--env-file=../.env", "../artifacts/api-server/dist/index.mjs" `
  -WorkingDirectory (Join-Path $root "scripts") -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "api5056.log") -RedirectStandardError (Join-Path $logs "api5056.err.log")
Remove-Item Env:RATE_LIMIT_PROFILE, Env:PORT, Env:OUTBOUND_DELIVERY

foreach ($port in 5055, 5056) {
  $ok = $false
  for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://localhost:$port/api/health" -TimeoutSec 2 | Out-Null; $ok = $true } catch { if ($_.Exception.Response) { $ok = $true } else { Start-Sleep -Milliseconds 750 } }
  }
  "API $port : $(if ($ok) { 'ready' } else { 'NOT STARTED' })"
}
