# Run the API and Expo for a physical phone through Cloudflare quick tunnels,
# for networks where the phone cannot reach the PC (Wi-Fi client isolation).
#
#   powershell -ExecutionPolicy Bypass -File scripts\dev-phone.ps1
#
# 1. Starts the API on $ApiPort in its own window (or reuses one that answers /api/healthz).
# 2. Opens two tunnels: API and Metro. Their URLs change on every run.
# 3. Starts Expo with EXPO_PUBLIC_API_URL (API tunnel) and EXPO_PACKAGER_PROXY_URL
#    (Metro tunnel), so the QR code and the bundle URLs use the public host.
# Ctrl+C stops Expo and both tunnels. The API window stays open.

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

function Test-Listening([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
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

# Tunnels left by a previous run of this script.
if (Test-Path $pidFile) {
  foreach ($id in Get-Content $pidFile) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq "cloudflared") { Stop-Process -Id $id -Force }
  }
  Remove-Item $pidFile -Force
}

$cloudflared = Find-Cloudflared

if (Test-Listening $MetroPort) {
  throw "Le port $MetroPort est deja utilise (un autre Expo/Metro ?). Fermez-le puis relancez."
}

# --- API ---
$localHealth = "http://localhost:$ApiPort/api/healthz"
if (Test-Health $localHealth) {
  Write-Host "API deja en marche sur le port $ApiPort : reutilisee." -ForegroundColor Yellow
  Write-Host "  (Si elle date d'avant vos derniers changements, fermez-la et relancez ce script.)"
} elseif (Test-Listening $ApiPort) {
  throw "Le port $ApiPort est occupe par un processus qui ne repond pas a /api/healthz."
} else {
  Write-Host "Demarrage de l'API (nouvelle fenetre)..."
  Start-Process powershell -WorkingDirectory $apiDir -ArgumentList "-NoExit", "-Command", "npm run dev"
  Wait-Until { Test-Health $localHealth } 120 "l'API ne repond pas sur $localHealth"
  Write-Host "API prete." -ForegroundColor Green
}

# --- Tunnels ---
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

# A new trycloudflare host can take a few seconds to resolve.
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

# --- Expo ---
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
