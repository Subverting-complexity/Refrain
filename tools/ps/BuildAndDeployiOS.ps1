<#
.SYNOPSIS
    Build and deploy Refrain to iOS via EAS Build + TestFlight.
    No Mac required. Builds run in Expo's cloud macOS runners.
    Interactive by default so you can enter Apple credentials and approve prompts.
.PARAMETER SkipChecks
    Skip prerequisite verification (faster for repeat builds).
.PARAMETER SkipClean
    Skip cache clearing (reuse Metro cache and Expo artifacts).
.PARAMETER NoSubmit
    Build only, don't auto-submit to App Store Connect / TestFlight.
.PARAMETER NonInteractive
    Run in non-interactive mode (for CI/automation). Will fail if credentials aren't cached.
.PARAMETER Profile
    EAS build profile: 'development' (dev-client for device testing),
    'preview' (internal distribution IPA), or 'production' (TestFlight).
    Defaults to 'production'. Development + preview builds do NOT auto-submit.
.EXAMPLE
    .\tools\BuildAndDeployiOS.ps1
    .\tools\BuildAndDeployiOS.ps1 -Profile development
    .\tools\BuildAndDeployiOS.ps1 -SkipClean
    .\tools\BuildAndDeployiOS.ps1 -SkipChecks
    .\tools\BuildAndDeployiOS.ps1 -NoSubmit
    .\tools\BuildAndDeployiOS.ps1 -NonInteractive
#>
param(
    [switch]$SkipChecks,
    [switch]$SkipClean,
    [switch]$NoSubmit,
    [switch]$NonInteractive,
    [ValidateSet('development', 'preview', 'production')]
    [string]$Profile = 'production'
)

# Non-production builds never submit.
if ($Profile -ne 'production') {
    $NoSubmit = $true
}
Set-StrictMode -Version Latest

# -- Helper functions ---------------------------------------------------------
function Write-Step  { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Wait-AndExit {
    param([int]$Code = 1)
    Write-Host ""
    Write-Host "Press any key to close this window..." -ForegroundColor DarkGray
    try {
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    } catch {
        Start-Sleep -Seconds 5
    }
    exit $Code
}
function Test-Command { param([string]$cmd) $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

# -- Build log functions ------------------------------------------------------
function Get-BuildLogPath {
    return Join-Path $PSScriptRoot 'ios-build-log.json'
}

function Read-BuildLog {
    $logPath = Get-BuildLogPath
    if (Test-Path $logPath) {
        try {
            $content = Get-Content $logPath -Raw | ConvertFrom-Json
            if ($content -is [array]) { return $content }
            elseif ($null -ne $content) { return @($content) }
            else { return @() }
        } catch {
            Write-Warn "Build log was corrupted. Starting fresh."
            return @()
        }
    }
    return @()
}

function Write-BuildLog {
    param([array]$Log)
    $logPath = Get-BuildLogPath
    $Log | ConvertTo-Json -Depth 5 | Set-Content $logPath -Encoding UTF8
}

function Add-BuildEntry {
    param(
        [string]$Status,
        [string]$Profile = "production",
        [string]$Notes = ""
    )
    $log = Read-BuildLog
    $entry = [PSCustomObject]@{
        timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        platform  = "ios"
        profile   = $Profile
        status    = $Status
        submitted = (-not $NoSubmit) -and ($Status -eq "success")
        notes     = $Notes
    }
    $log += $entry
    Write-BuildLog $log
    return $log
}

function Show-BuildSummary {
    param([array]$Log)
    $currentMonth = (Get-Date).ToString("yyyy-MM")
    $monthBuilds = @($Log | Where-Object { $_.timestamp -like "$currentMonth*" })
    $successBuilds = @($monthBuilds | Where-Object { $_.status -eq "success" })
    $failedBuilds = @($monthBuilds | Where-Object { $_.status -eq "failed" })
    $totalAll = $Log.Count

    Write-Host ""
    Write-Host "  Build Log Summary" -ForegroundColor White
    Write-Host "  -----------------" -ForegroundColor DarkGray
    Write-Host "  This month:  $($monthBuilds.Count) builds ($($successBuilds.Count) succeeded, $($failedBuilds.Count) failed)" -ForegroundColor Gray
    Write-Host "  All time:    $totalAll builds" -ForegroundColor Gray

    if ($monthBuilds.Count -ge 25 -and $monthBuilds.Count -lt 30) {
        Write-Warn "Approaching Expo free tier limit (30 builds/month). Consider upgrading at expo.dev/pricing."
    } elseif ($monthBuilds.Count -ge 30) {
        Write-Err "Expo free tier limit reached (30 builds/month). Builds may be queued or rejected."
    }
    Write-Host ""
}

# -- Banner -------------------------------------------------------------------
Write-Host ""
Write-Host "  Refrain - iOS Build & Deploy (TestFlight)" -ForegroundColor White
Write-Host "  =========================================" -ForegroundColor DarkGray

# -- Locate project -----------------------------------------------------------
# Scripts live in tools/ps/, so the project root is two levels up.
$AppDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $AppDir 'package.json'))) {
    $AppDir = Get-Location
}
if (-not (Test-Path (Join-Path $AppDir 'package.json'))) {
    Write-Err "Cannot find package.json. Run this script from the mobile app directory."
    Wait-AndExit 1
}
Push-Location $AppDir

# -- Verify eas.json exists ---------------------------------------------------
if (-not (Test-Path (Join-Path $AppDir 'eas.json'))) {
    Write-Err "eas.json not found in project root."
    Write-Err "  Run 'eas build:configure' to generate it, then configure your production profile."
    Pop-Location
    Wait-AndExit 1
}

# -- Prerequisite checks ------------------------------------------------------
function Assert-Prerequisites {
    Write-Step "Checking prerequisites"

    if (-not (Test-Command 'node')) {
        Write-Err "Node.js not found. Install via: winget install OpenJS.NodeJS.LTS"
        Pop-Location
        Wait-AndExit 1
    }
    Write-Ok "Node $((node -v).Trim())"

    if (-not (Test-Command 'eas')) {
        Write-Err "EAS CLI not found. Install via: npm install -g eas-cli"
        Pop-Location
        Wait-AndExit 1
    }
    $easVersion = (eas --version 2>&1 | Out-String).Trim()
    Write-Ok "EAS CLI $easVersion"

    # Verify EAS login
    $easUser = eas whoami 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Not logged into EAS."
        if ($NonInteractive) {
            Write-Err "Cannot log in during non-interactive mode. Run 'eas login' first."
            Pop-Location
            Wait-AndExit 1
        }
        Write-Host "  Launching EAS login..." -ForegroundColor Gray
        eas login
        if ($LASTEXITCODE -ne 0) {
            Write-Err "EAS login failed."
            Pop-Location
            Wait-AndExit 1
        }
    }
    $easUser = (eas whoami 2>&1 | Out-String).Trim()
    Write-Ok "Logged in as: $easUser"

    # Verify bundle identifier is set
    $appJson = Join-Path $AppDir 'app.json'
    if (Test-Path $appJson) {
        try {
            $appConfig = Get-Content $appJson -Raw | ConvertFrom-Json
            $bundleId = $appConfig.expo.ios.bundleIdentifier
            if (-not $bundleId) {
                Write-Warn "ios.bundleIdentifier not set in app.json. EAS will prompt you for it."
            } elseif ($bundleId -like 'com.yourname.*') {
                Write-Warn "Bundle ID still uses a 'com.yourname.*' placeholder. Update app.json before TestFlight."
            } else {
                Write-Ok "Bundle ID: $bundleId"
            }
        } catch {
            Write-Warn "Could not parse app.json. Continuing anyway."
        }
    }
}

if (-not $SkipChecks) {
    Assert-Prerequisites
}

# -- Dependencies -------------------------------------------------------------
if (-not (Test-Path (Join-Path $AppDir 'node_modules'))) {
    Write-Step "Installing dependencies (npm ci)"
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm ci failed."
        Pop-Location
        Wait-AndExit 1
    }
    Write-Ok "Dependencies installed"
}

# -- Clean caches (optional) --------------------------------------------------
if (-not $SkipClean) {
    Write-Step "Cleaning bundler and project caches"

    $MetroCacheDir = Join-Path $env:TEMP 'metro-*'
    if (Test-Path $MetroCacheDir) {
        Remove-Item $MetroCacheDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $HermesCacheDir = Join-Path $env:TEMP 'haste-map-*'
    if (Test-Path $HermesCacheDir) {
        Remove-Item $HermesCacheDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $ExpoCacheDir = Join-Path $AppDir '.expo'
    if (Test-Path $ExpoCacheDir) {
        Remove-Item $ExpoCacheDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $NodeModulesCache = Join-Path $AppDir 'node_modules\.cache'
    if (Test-Path $NodeModulesCache) {
        Remove-Item $NodeModulesCache -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Kill any stale Metro processes from previous runs
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'metro|expo' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Write-Ok "Metro, Expo, and module caches cleared"
}

# -- Show build history before starting ---------------------------------------
Write-Step "Build history"
$existingLog = Read-BuildLog
if ($existingLog.Count -gt 0) {
    Show-BuildSummary $existingLog
} else {
    Write-Host "  No previous iOS builds logged." -ForegroundColor Gray
}

# -- Build --------------------------------------------------------------------
Write-Step "Starting EAS $Profile build for iOS (cloud)"
Write-Host "  Build runs on Expo's macOS cloud runners." -ForegroundColor DarkGray
Write-Host "  First run will prompt for Apple credentials and certificate generation." -ForegroundColor DarkGray
Write-Host "  Typical build time: 5-15 minutes.`n" -ForegroundColor DarkGray

$buildArgs = @("build", "--profile", $Profile, "--platform", "ios")

if (-not $NoSubmit) {
    $buildArgs += "--auto-submit"
}

if ($NonInteractive) {
    $buildArgs += "--non-interactive"
}

$buildStart = Get-Date
eas @buildArgs
$buildExitCode = $LASTEXITCODE
$buildDuration = ((Get-Date) - $buildStart).ToString("hh\:mm\:ss")

# -- Log the result -----------------------------------------------------------
if ($buildExitCode -eq 0) {
    $updatedLog = Add-BuildEntry -Status "success" -Profile $Profile -Notes "Duration: $buildDuration"
    Write-Host ""
    if ($Profile -eq 'development') {
        Write-Ok "Dev client build complete. Duration: $buildDuration"
        Write-Host ""
        Write-Host "  Next steps on your iPhone:" -ForegroundColor White
        Write-Host "    1. Open the expo.dev build page link shown above" -ForegroundColor Gray
        Write-Host "    2. Scan the QR code with your iPhone camera" -ForegroundColor Gray
        Write-Host "    3. After install, run 'npx expo start --dev-client' on this machine" -ForegroundColor Gray
        Write-Host "    4. Tap the dev-client app on your phone to connect to Metro" -ForegroundColor Gray
    } elseif ($Profile -eq 'preview') {
        Write-Ok "Preview (internal) build complete. Duration: $buildDuration"
        Write-Host "  Distribute the IPA from the expo.dev build page." -ForegroundColor Gray
    } elseif ($NoSubmit) {
        Write-Ok "Build complete (not submitted). Duration: $buildDuration"
        Write-Host "  Run 'eas submit --platform ios' to send to TestFlight." -ForegroundColor Gray
    } else {
        Write-Ok "Build complete and submitted to App Store Connect. Duration: $buildDuration"
        Write-Host ""
        Write-Host "  Next steps on your iPhone:" -ForegroundColor White
        Write-Host "    1. Go to appstoreconnect.apple.com > TestFlight" -ForegroundColor Gray
        Write-Host "    2. Approve the compliance questionnaire (if prompted)" -ForegroundColor Gray
        Write-Host "    3. Open TestFlight on your iPhone and install/update" -ForegroundColor Gray
    }
} else {
    $updatedLog = Add-BuildEntry -Status "failed" -Profile $Profile -Notes "Exit code: $buildExitCode. Duration: $buildDuration"
    Write-Err "EAS build failed (exit code $buildExitCode). Duration: $buildDuration"
    Write-Err "Common fixes:"
    Write-Err "  - Check eas.json has valid appleId, ascAppId, and appleTeamId"
    Write-Err "  - Run 'eas login' to re-authenticate with Expo"
    Write-Err "  - Check build logs at https://expo.dev"
    Write-Err "  - If Apple credentials expired, re-run without -NonInteractive"
}

# -- Final summary ------------------------------------------------------------
Show-BuildSummary $updatedLog

Pop-Location
Wait-AndExit $buildExitCode
