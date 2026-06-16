<#
.SYNOPSIS
    Launches the Refrain web preview for UI smoke-testing.

.DESCRIPTION
    Starts `expo start --web` on http://localhost:8081 and opens the default
    browser when Metro is ready. The web target is a dev-time UI smoke test,
    not a shipping platform: native-backed subsystems (audio playback via
    expo-audio, the expo-sqlite store, expo-file-system imports) behave
    differently in a browser than on device, so use web only to click
    through screen layouts, theming, and navigation.

    For anything audio-related (loop import, playback, A/B markers against a
    real clip), build to a device with BuildAndDeployiOS.ps1 -Profile
    development or BuildAndDeployAndroid.ps1.

    The window pauses for a keypress on every exit path -- including
    errors and Ctrl+C -- so you can read the output before it closes.

.PARAMETER Port
    Metro bundler port. Defaults to 8081.

.PARAMETER NoOpen
    Start Metro but don't auto-open the browser.

.PARAMETER NoPause
    Skip the keypress pause on exit (useful when chained from other scripts).

.EXAMPLE
    .\tools\LaunchWeb.ps1
    .\tools\LaunchWeb.ps1 -Port 8088
    .\tools\LaunchWeb.ps1 -NoOpen
#>
param(
    [int]$Port = 8081,
    [switch]$NoOpen,
    [switch]$NoPause
)

# Notes on error handling below:
#   * We use 'Continue' rather than 'Stop' so a single step's failure
#     prints its own message, then we can Wait-AndExit with the full log
#     still on screen.
#   * Every exit goes through Wait-AndExit so the window stays up by
#     default. Set -NoPause (or $env:CI='true') to bypass.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$IsCI = $env:CI -eq 'true' -or $env:TF_BUILD -eq 'true' -or $env:GITHUB_ACTIONS -eq 'true'

function Write-Step { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Test-Command { param([string]$cmd) $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

function Wait-AndExit {
    param([int]$Code = 0)

    # Always try to leave the caller's working directory clean.
    try { Pop-Location -ErrorAction SilentlyContinue } catch { }

    if ($IsCI -or $NoPause) {
        exit $Code
    }

    Write-Host ""
    if ($Code -eq 0) {
        Write-Host "Metro stopped. Press any key to close this window..." -ForegroundColor DarkGray
    } else {
        Write-Host "Exited with code $Code. Press any key to close this window..." -ForegroundColor Yellow
    }
    try {
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    } catch {
        # ReadKey isn't available in the PowerShell ISE; fall back to a sleep.
        Start-Sleep -Seconds 10
    }
    exit $Code
}

# Trap uncaught terminating errors anywhere below so they don't slip past
# Wait-AndExit. Without this a ParserError or similar closes the window
# before the user sees the traceback.
trap {
    Write-Err "Uncaught: $($_.Exception.Message)"
    Write-Host ($_.ScriptStackTrace) -ForegroundColor DarkGray
    Wait-AndExit 1
}

Write-Host ""
Write-Host "  Refrain - Web Preview" -ForegroundColor White
Write-Host "  =====================" -ForegroundColor DarkGray
Write-Host "  Web is a dev-time UI smoke test only. Native audio behaves differently." -ForegroundColor DarkGray

# -- Locate project ----------------------------------------------------------
# Scripts live in tools/ps/, so the project root is two levels up.
$AppDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $AppDir 'package.json'))) { $AppDir = Get-Location }
if (-not (Test-Path (Join-Path $AppDir 'package.json'))) {
    Write-Err "Cannot find package.json. Run from the mobile app directory."
    Wait-AndExit 1
}
Push-Location $AppDir

# -- Prereqs ----------------------------------------------------------------
Write-Step "Checking prerequisites"
if (-not (Test-Command 'node')) {
    Write-Err "Node.js not found. Install via: winget install OpenJS.NodeJS.LTS"
    Wait-AndExit 1
}
Write-Ok "Node $((node -v).Trim())"

# -- Dependencies -----------------------------------------------------------
if (-not (Test-Path (Join-Path $AppDir 'node_modules'))) {
    Write-Step "Installing dependencies (npm ci)"
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm ci failed (exit $LASTEXITCODE). Read the error above."
        Wait-AndExit 1
    }
    Write-Ok "Dependencies installed"
}

# Verify web deps are present (expo-start silently bails without them).
$hasReactDom = Test-Path (Join-Path $AppDir 'node_modules\react-dom')
$hasRnWeb    = Test-Path (Join-Path $AppDir 'node_modules\react-native-web')
if (-not $hasReactDom -or -not $hasRnWeb) {
    Write-Warn "Web deps missing -- installing react-dom + react-native-web"
    # Single-quote the scoped package name so PowerShell doesn't interpret `@` as a splat.
    npx expo install react-dom react-native-web '@expo/metro-runtime' -- --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Web dep install failed (exit $LASTEXITCODE). Read the error above."
        Wait-AndExit 1
    }
}
Write-Ok "Web dependencies available"

# -- Free the port if a stale Metro is holding it ---------------------------
Write-Step "Checking port $Port"
$portInUse = $null
try {
    $portInUse = (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Listen' } | Select-Object -First 1)
} catch {
    # Get-NetTCPConnection isn't available on all systems; ignore.
}
if ($portInUse) {
    $ownerPid = $portInUse.OwningProcess
    Write-Warn "Port $Port is already in use by PID $ownerPid. Killing stale process."
    try { Stop-Process -Id $ownerPid -Force -ErrorAction Stop }
    catch { Write-Warn "Could not stop PID ${ownerPid}: $($_.Exception.Message)" }
}
Write-Ok "Port ready"

# -- Open the browser once Metro is ready -----------------------------------
$browserJob = $null
if (-not $NoOpen) {
    $url = "http://localhost:$Port"
    Write-Step "Opening $url when Metro is ready"
    $browserJob = Start-Job -Name 'refrain-web-open' -ScriptBlock {
        param($targetUrl)
        $attempts = 0
        while ($attempts -lt 60) {
            try {
                $r = Invoke-WebRequest -Uri $targetUrl -Method Head -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                if ($r.StatusCode -eq 200) {
                    Start-Process $targetUrl
                    return
                }
            } catch {
                Start-Sleep -Milliseconds 500
            }
            $attempts++
        }
    } -ArgumentList $url
}

# -- Launch Metro in web mode -----------------------------------------------
Write-Step "Starting Metro bundler (web)"
Write-Host "  Press Ctrl+C to stop Metro. The window will pause before closing.`n" -ForegroundColor DarkGray

$env:EXPO_WEB_PORT = "$Port"
# We don't want `npx expo start` failures to throw -- we want to print + pause.
try {
    npx expo start --web --port $Port
    $metroExit = $LASTEXITCODE
} catch {
    Write-Err "expo start threw an exception: $($_.Exception.Message)"
    $metroExit = 1
}

# Cleanup: stop the browser-opener job if it's still pending.
if ($null -ne $browserJob) {
    Get-Job -Name 'refrain-web-open' -ErrorAction SilentlyContinue |
        Remove-Job -Force -ErrorAction SilentlyContinue
}

if ($metroExit -ne 0) {
    Write-Err "Metro exited with code $metroExit. Scroll up for details."
}
Wait-AndExit $metroExit
