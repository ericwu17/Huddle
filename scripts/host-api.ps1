# Host the real API (api/) on this Windows laptop for Maincloud: start it on
# 127.0.0.1, open a Cloudflare quick tunnel, check the tunnel from outside, then
# (after you confirm) point the SpacetimeDB module at the new URL.
# Windows counterpart of scripts/tunnels.sh, without the voice service:
# VOICE_BASE_URL is removed, so bookings play the module's scripted call.
#
# Usage, from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/host-api.ps1 [-Yes] [-NoPublish] [-Port 8000]
#     -Yes         publish the new URL without asking
#     -NoPublish   start the API and tunnel only; leave the module settings alone
#
# A quick tunnel gets a new URL on every start, so every run republishes it.
# Local SpacetimeDB can't replace the tunnel: procedures refuse private
# addresses, including 127.0.0.1 (checked with 2.13.0).
#
# Needs api/.venv (Python 3.13, see api/README.md; the pins don't install on 3.11 or 3.14),
# api/.env with HUDDLE_SHARED_SECRET and ANTHROPIC_API_KEY, cloudflared, and the
# spacetime CLI logged in. Secrets stay in api/.env and are never printed.
# Ctrl+C stops the API and the tunnel.
param(
  [switch]$Yes,
  [switch]$NoPublish,
  [int]$Port = 8000,
  [string]$Server = "maincloud",
  [string]$Database = "huddle-calhacks"
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Logs = Join-Path $Root "logs\host-api"
New-Item -ItemType Directory -Force $Logs | Out-Null

function Say($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function EnvValue($file, $key) {
  $line = Get-Content $file | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
  if ($line) { return ($line -replace "^$key=", "").Trim() }
  return ""
}
function StatusCode($url, $secret) {
  $headers = @()
  if ($secret) { $headers = @("-H", "X-Huddle-Secret: $secret") }
  return (& curl.exe -s -o NUL -m 10 -w "%{http_code}" @headers $url)
}

# ---------- preflight ----------
$py = Join-Path $Root "api\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "api/.venv missing. Run: uv venv --python 3.13 api/.venv; uv pip install --python api/.venv/Scripts/python.exe -r api/requirements.txt" }
if (-not (Test-Path "api\.env")) { throw "api/.env missing; copy api/.env.example and fill it in" }
$secret = EnvValue "api\.env" "HUDDLE_SHARED_SECRET"
if (-not $secret) { throw "HUDDLE_SHARED_SECRET is empty in api/.env" }
if (-not (EnvValue "api\.env" "ANTHROPIC_API_KEY")) {
  Write-Warning "No ANTHROPIC_API_KEY in api/.env: parsing falls back to keyword rules and the council to Safe"
}
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
$Cloudflared = if ($cf) { $cf.Source } else { Join-Path $env:LOCALAPPDATA "HuddleLocal\bin\cloudflared.exe" }
if (-not (Test-Path $Cloudflared)) { throw "cloudflared not found on PATH or in %LOCALAPPDATA%\HuddleLocal\bin" }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "port $Port is already in use (an API from an earlier run?)"
}

$api = $null
$tunnel = $null
try {
  # ---------- API ----------
  Say "Starting the API on 127.0.0.1:$Port (logs in logs/host-api/)"
  # The API reads its data files as UTF-8; Windows defaults to another encoding.
  $env:PYTHONUTF8 = "1"
  $api = Start-Process -FilePath $py -PassThru -NoNewWindow `
    -ArgumentList "-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "$Port", "--no-access-log" `
    -RedirectStandardOutput "$Logs\api.log" -RedirectStandardError "$Logs\api.err.log"
  $ok = $false
  for ($i = 0; $i -lt 60; $i++) {
    if ((StatusCode "http://127.0.0.1:$Port/health" $secret) -eq "200") { $ok = $true; break }
    if ($api.HasExited) { break }
    Start-Sleep 1
  }
  if (-not $ok) { throw "the API did not become healthy (see logs/host-api/api.err.log)" }
  $health = & curl.exe -s -m 10 -H "X-Huddle-Secret: $secret" "http://127.0.0.1:$Port/health"
  if ($health -notmatch '"stub":false') { throw "the API reports stub mode: $health" }

  # ---------- tunnel ----------
  Say "Opening a Cloudflare quick tunnel"
  $tunnel = Start-Process -FilePath $Cloudflared -PassThru -NoNewWindow `
    -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://localhost:$Port" `
    -RedirectStandardOutput "$Logs\tunnel.log" -RedirectStandardError "$Logs\tunnel.err.log"
  $url = $null
  for ($i = 0; $i -lt 60; $i++) {
    $log = Get-Content "$Logs\tunnel.err.log" -Raw -ErrorAction SilentlyContinue
    if ($log -and $log -match "Registered tunnel connection") {
      $m = [regex]::Matches($log, "https://[a-z0-9-]+\.trycloudflare\.com") | Where-Object { $_.Value -notmatch "//api\." } | Select-Object -First 1
      if ($m) { $url = $m.Value; break }
    }
    if ($tunnel.HasExited) { break }
    Start-Sleep 1
  }
  if (-not $url) { throw "no tunnel URL from cloudflared (see logs/host-api/tunnel.err.log)" }

  Say "Checking the tunnel from outside (DNS can take a few seconds)"
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    if ((StatusCode "$url/health" $secret) -eq "200") { $ok = $true; break }
    Start-Sleep 2
  }
  if (-not $ok) { throw "the tunnel never answered (see logs/host-api/tunnel.err.log)" }
  $noSecret = StatusCode "$url/health" ""
  if ($noSecret -ne "401") { throw "the tunnel answered $noSecret without a secret; expected 401" }
  Write-Host "    api: $url"
  Set-Content -Path "$Logs\tunnel-url.txt" -Value $url

  # ---------- publish ----------
  if (-not $NoPublish) {
    Say "Pointing $Database on $Server at $url"
    Write-Host "    Settings only: FASTAPI_BASE_URL=<tunnel>, STUB_MODE=false, VOICE_BASE_URL removed."
    Write-Host "    The shared secret, code and data are untouched. Start new groups afterwards."
    $go = $Yes
    if (-not $go) { $go = (Read-Host "    Continue? [y/N]") -match "^(y|yes)$" }
    if ($go) {
      # Only these two values go out; clear any other module key from this shell first.
      foreach ($k in "HUDDLE_SHARED_SECRET", "FASTAPI_BASE_URL", "STUB_MODE", "VOICE_BASE_URL", "COUNCIL_ENABLED", "AGENT_LANGUAGE", "STUB_SCENARIO") {
        Remove-Item "Env:$k" -ErrorAction SilentlyContinue
      }
      $env:FASTAPI_BASE_URL = $url
      $env:STUB_MODE = "false"
      & spacetime publish $Database -s $Server --env-only --no-config --unset-env VOICE_BASE_URL --yes=remote
      $code = $LASTEXITCODE
      Remove-Item Env:FASTAPI_BASE_URL, Env:STUB_MODE -ErrorAction SilentlyContinue
      if ($code -ne 0) { throw "spacetime publish failed; the module settings are unchanged" }
    } else {
      Write-Host "    Skipped. The API and tunnel keep running."
    }
  }

  Say "Up. Keep this window open and the laptop awake. Ctrl+C to stop."
  while (-not $api.HasExited -and -not $tunnel.HasExited) { Start-Sleep 5 }
  if ($api.HasExited) { throw "the API exited (see logs/host-api/api.err.log)" }
  throw "the tunnel exited; a new one gets a new URL, so rerun this script"
}
finally {
  foreach ($p in $tunnel, $api) {
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
  if (-not $NoPublish) {
    Write-Host "Stopped. $Database still points at this tunnel, which is now gone:"
    Write-Host "new groups fall back to labeled demo mode until you rerun this script."
  }
}
