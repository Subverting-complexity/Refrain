<#
.SYNOPSIS
    Build Refrain and install it on a USB-connected Android device.
    Metro bundler stays running after launch. Window never closes automatically.

.DESCRIPTION
    The local development loop: prebuild, Gradle, install over adb, Metro. It
    touches neither store. Deploy.ps1 is the store release, and the two share
    nothing beyond the word "build"; this script was called
    BuildAndDeployAndroid until that name kept reading as "the Android half of
    Deploy".

.PARAMETER SkipChecks
    Skip prerequisite verification (faster for repeat builds).

.PARAMETER SkipClean
    Skip the clean step (reuse Metro cache, native project, and Gradle artifacts).

.PARAMETER Device
    Target a specific device serial (from adb devices).

.EXAMPLE
    .\tools\LaunchAndroid.cmd
    .\tools\LaunchAndroid.cmd -SkipClean
    .\tools\LaunchAndroid.cmd -SkipChecks
    .\tools\LaunchAndroid.cmd -Device "RFXXXXXXX"
#>
param(
    [switch]$SkipChecks,
    [switch]$SkipClean,
    [string]$Device
)

Set-StrictMode -Version Latest

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

Write-Host ""
Write-Host "  Refrain - Android Build & Deploy" -ForegroundColor White
Write-Host "  ================================" -ForegroundColor DarkGray

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

$AndroidDir = Join-Path $AppDir 'android'

# -- Prerequisite checks ------------------------------------------------------

function Assert-Prerequisites {
    Write-Step "Checking prerequisites"

    if (-not (Test-Command 'node')) {
        Write-Err "Node.js not found. Install via: winget install OpenJS.NodeJS.LTS"
        Wait-AndExit 1
    }
    Write-Ok "Node $((node -v).Trim())"

    if (-not (Test-Command 'java')) {
        Write-Err "Java not found. Set JAVA_HOME to Android Studio bundled JDK."
        Wait-AndExit 1
    }
    Write-Ok "Java: $((java -version 2>&1 | Select-Object -First 1).ToString())"

    if (-not $env:JAVA_HOME) {
        Write-Warn "JAVA_HOME is not set. Gradle may fail."
    }

    if (-not (Test-Command 'adb')) {
        Write-Err "ADB not found. Install Android SDK Platform-Tools and add to PATH."
        Wait-AndExit 1
    }
    Write-Ok "ADB available"
}

if (-not $SkipChecks) {
    Assert-Prerequisites
}

# -- Device detection ---------------------------------------------------------

Write-Step "Detecting connected devices"

$null = adb start-server 2>&1

$deviceLines = adb devices | Where-Object { $_ -match '\tdevice$' }
$deviceSerials = @($deviceLines | ForEach-Object { ($_ -split '\t')[0] })

if ($deviceSerials.Count -eq 0) {
    Write-Err "No Android devices connected."
    Write-Err "  1. Connect a device via USB"
    Write-Err "  2. Enable USB Debugging in Developer Options"
    Write-Err "  3. Approve the debugging prompt on the device"
    Wait-AndExit 1
}

if ($Device) {
    if ($Device -notin $deviceSerials) {
        Write-Err "Device '$Device' not found. Connected: $($deviceSerials -join ', ')"
        Wait-AndExit 1
    }
    $TargetDevice = $Device
} elseif ($deviceSerials.Count -gt 1) {
    Write-Warn "Multiple devices connected: $($deviceSerials -join ', ')"
    Write-Err "Use -Device <serial> to target a specific one."
    Wait-AndExit 1
} else {
    $TargetDevice = $deviceSerials[0]
}

# Expo expects the model name from `adb devices -l` (underscores, not hyphens)
$deviceDetailLine = adb devices -l 2>&1 | Where-Object { $_ -match "^$TargetDevice" }
$expoDeviceName = $null
if ($deviceDetailLine -match 'model:(\S+)') {
    $expoDeviceName = $Matches[1]
}
$deviceModel = (adb -s $TargetDevice shell getprop ro.product.model 2>&1 | Out-String).Trim()
if ($deviceModel) {
    Write-Ok "Target: $deviceModel ($TargetDevice)"
} else {
    Write-Ok "Target: $TargetDevice"
}

# -- Auto-setup ---------------------------------------------------------------

if (-not (Test-Path (Join-Path $AppDir 'node_modules'))) {
    Write-Step "Installing dependencies (npm ci)"
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm ci failed."
        Wait-AndExit 1
    }
    Write-Ok "Dependencies installed"
}

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
    Write-Ok "Metro, Expo, and module caches cleared"

    # Stop Gradle daemon and any Metro processes that may lock the android/ directory
    if (Test-Path $AndroidDir) {
        Write-Step "Stopping processes that may lock android/"
        $gradlew = Join-Path $AndroidDir 'gradlew.bat'
        if (Test-Path $gradlew) {
            Push-Location $AndroidDir
            ./gradlew --stop 2>&1 | Out-Null
            Pop-Location
        }
        Get-Process -Name 'java' -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle -eq '' } |
            Stop-Process -Force -ErrorAction SilentlyContinue
        # Kill any node/Metro processes from previous runs
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'metro|expo' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Write-Ok "Stale processes stopped"
    }

    Write-Step "Regenerating native Android project (expo prebuild --clean)"
    npx expo prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) {
        Write-Err "expo prebuild --clean failed."
        Write-Err "  If EBUSY: close Android Studio, file explorers, or any terminal in the android/ folder."
        Wait-AndExit 1
    }
    Write-Ok "Native project regenerated"
} elseif (-not (Test-Path $AndroidDir)) {
    Write-Step "Generating native Android project (expo prebuild)"
    npx expo prebuild --platform android
    if ($LASTEXITCODE -ne 0) {
        Write-Err "expo prebuild failed."
        Wait-AndExit 1
    }
    Write-Ok "Android project generated"
}

# Ensure local.properties exists with SDK path (prebuild --clean wipes it)
$localProps = Join-Path $AndroidDir 'local.properties'
if ((Test-Path $AndroidDir) -and -not (Test-Path $localProps)) {
    $sdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME }
               elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT }
               else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    if (Test-Path $sdkPath) {
        $escapedPath = $sdkPath -replace '\\', '/'
        Set-Content -Path $localProps -Value "sdk.dir=$escapedPath"
        Write-Ok "Restored local.properties (sdk.dir=$escapedPath)"
    } else {
        Write-Err "Android SDK not found. Set ANDROID_HOME or create android/local.properties manually."
        Wait-AndExit 1
    }
}

if (-not $SkipClean -and (Test-Path $AndroidDir)) {
    Write-Step "Cleaning Gradle build artifacts"
    Push-Location $AndroidDir
    ./gradlew clean 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Gradle cleaned"
}

# -- ADB reverse for Metro bundler ---------------------------------------------

Write-Step "Setting up adb reverse port (Metro bundler)"
adb -s $TargetDevice reverse tcp:8081 tcp:8081 2>&1 | Out-Null
Write-Ok "adb reverse: :8081 (Metro)"

# -- Build, deploy, and run Metro ---------------------------------------------

Write-Step "Building, installing, and launching (Metro stays running)"
Write-Host "  Press Ctrl+C to stop Metro bundler when done.`n" -ForegroundColor DarkGray

if ($expoDeviceName) {
    npx expo run:android -d $expoDeviceName
} else {
    npx expo run:android -d
}

Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Err "expo run:android exited with code $LASTEXITCODE"
    Write-Err "Common fixes:"
    Write-Err "  - Verify JAVA_HOME is set correctly"
    Write-Err "  - Check device is still connected (adb devices)"
    Write-Err "  - If already running a clean build, check Gradle logs above"
} else {
    Write-Host "`nMetro bundler stopped." -ForegroundColor Cyan
}

Wait-AndExit $LASTEXITCODE
