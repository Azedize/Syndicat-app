# Run the API and Expo for a physical phone through Cloudflare quick tunnels,
# for networks where the phone cannot reach the PC (Wi-Fi client isolation).
#
#   powershell -ExecutionPolicy Bypass -File scripts\dev-phone.ps1

param(
  [int]$ApiPort = 5000,
  [int]$MetroPort = 8081,
  [switch]$NoClear
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $root "artifacts\mobile"
$apiDir = Join-Path $root "artifacts\api-server"
$logDir = Join-Path $env:TEMP "mizan-dev-phone"
$pidFile = Join-Path $logDir "tunnels.pid"
New-Item -ItemType Directory -Force $logDir | Out-Null

function Find-Cloudflared {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\cloudflared\cloudflared.exe", "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe")) {
    if (Test-Path $p) { return $p }
  }
  throw "cloudflared introuvable. Installez-le : winget install --id Cloudflare.cloudflared -e"
}

function Stop-PortOwner([int]$port) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($connections) {
    foreach ($conn in $connections) {
      $procId = $conn.OwningProcess
      if ($procId -and $procId -ne 0) {
        Write-Host "Fermeture du processus PID $procId utilisant le port $port..." -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
    Start-Sleep -Seconds 1
  }
}

function Test-Health([string]$url) {
  try { return (Invoke-RestMethod -Uri $url -TimeoutSec 5).status -eq "ok" } catch { return $false }
}

function Wait-Until([scriptblock]$check, [int]$seconds, [string]$what) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (& $check) { return }
    Start-Sleep -Milliseconds 700
  }
  throw "Delai depasse : $what"
}

# 1. Arret des anciens tunnels enregistres
if (Test-Path $pidFile) {
  foreach ($id in Get-Content $pidFile) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq "cloudflared") { Stop-Process -Id $id -Force }
  }
  Remove-Item $pidFile -Force
}

$cloudflared = Find-Cloudflared

# 2. Fermeture automatique de tout ce qui tourne sur les ports API et Metro
Write-Host "Nettoyage des anciens processus sur les ports $ApiPort et $MetroPort..." -ForegroundColor Cyan
Stop-PortOwner $ApiPort
Stop-PortOwner $MetroPort

# 3. Demarrage propre du Backend API
$localHealth = "http://localhost:$ApiPort/api/healthz"
Write-Host "Demarrage du nouveau Backend API..." -ForegroundColor Green
Start-Process powershell -WorkingDirectory $apiDir -ArgumentList "-NoExit", "-Command", "npm run dev"
Wait-Until { Test-Health $localHealth } 120 "l'API ne repond pas sur $localHealth"
Write-Host "API prete." -ForegroundColor Green

# 4. Demarrage des Tunnels Cloudflare
function Start-Tunnel([int]$port, [string]$name) {
  $log = Join-Path $logDir "$name.log"
  if (Test-Path $log) { Remove-Item $log -Force }
  $p = Start-Process $cloudflared -PassThru -WindowStyle Hidden `
    -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://localhost:$port" `
    -RedirectStandardError $log -RedirectStandardOutput "$log.out"
  Add-Content $pidFile $p.Id
  $url = $null
  $deadline = (Get-Date).AddSeconds(60)
  while (-not $url -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 700
    if ($p.HasExited) { throw "Tunnel $name arrete. Journal : $log" }
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  if (-not $url) { throw "Pas d'URL pour le tunnel $name. Journal : $log" }
  return $url
}

Write-Host "Ouverture des tunnels Cloudflare..."
$apiTunnel = Start-Tunnel $ApiPort "api"
$metroTunnel = Start-Tunnel $MetroPort "metro"

Wait-Until { Test-Health "$apiTunnel/api/healthz" } 60 "le tunnel API ne repond pas ($apiTunnel/api/healthz)"
Write-Host "Tunnel API verifie : $apiTunnel/api/healthz" -ForegroundColor Green

$metroHost = ([Uri]$metroTunnel).Host
Write-Host ""
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host " API     : $apiTunnel/api"
Write-Host " Metro   : $metroTunnel"
Write-Host " Expo Go : scannez le QR code ci-dessous, ou saisissez"
Write-Host "           exp://${metroHost}:443"
Write-Host " Journaux des tunnels : $logDir"
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""

# 5. Demarrage d'Expo
$env:EXPO_PUBLIC_API_URL = "$apiTunnel/api"
$env:EXPO_PACKAGER_PROXY_URL = $metroTunnel
$expoArgs = @("exec", "expo", "start", "--port", "$MetroPort")
if (-not $NoClear) { $expoArgs += "--clear" }
Push-Location $mobileDir
try {
  & pnpm @expoArgs
} finally {
  Pop-Location
  $left = @()
  if (Test-Path $pidFile) {
    foreach ($id in Get-Content $pidFile) {
      if (-not (Get-Process -Id $id -ErrorAction SilentlyContinue)) { continue }
      try { Stop-Process -Id $id -Force -ErrorAction Stop } catch { $left += $id }
    }
    if ($left.Count -eq 0) { Remove-Item $pidFile -Force }
  }
  if ($left.Count -eq 0) { Write-Host "Tunnels arretes." }
  else { Write-Warning "Tunnels encore ouverts (PID $($left -join ', ')). Fermez-les : Stop-Process -Id $($left -join ',') -Force" }
}