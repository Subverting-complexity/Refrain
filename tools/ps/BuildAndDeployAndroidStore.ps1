<#
.SYNOPSIS
    Build a production Android AAB via EAS and submit to the Google Play
    Internal Testing track. No local Gradle needed.
.PARAMETER NoSubmit
    Build only, don't auto-submit to Play Console.
.PARAMETER NonInteractive
    Run without prompts (requires cached EAS + Play credentials).
.PARAMETER SkipChecks
    Skip prerequisite verification.
.PARAMETER Patch
    Bump the patch version instead of the default minor.
.PARAMETER Major
    Bump the major version instead of the default minor.
.PARAMETER AllowDirty
    Cut the release branch from a dirty working tree anyway. Never skips the
    version bump's own dirty-tree check -- see tools/version-bump.mjs.
.EXAMPLE
    .\tools\BuildAndDeployAndroidStore.ps1
    .\tools\BuildAndDeployAndroidStore.ps1 -NoSubmit
    .\tools\BuildAndDeployAndroidStore.ps1 -Patch
#>
param(
    [switch]$NoSubmit,
    [switch]$NonInteractive,
    [switch]$SkipChecks,
    [switch]$Patch,
    [switch]$Major,
    [switch]$AllowDirty
)
Set-StrictMode -Version Latest

function Write-Step { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Test-Command { param([string]$cmd) $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }
function Wait-AndExit {
    param([int]$Code = 1)
    Write-Host ""
    Write-Host "Press any key to close this window..." -ForegroundColor DarkGray
    try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep 5 }
    exit $Code
}

if ($Patch -and $Major) {
    Write-Err "-Patch and -Major are mutually exclusive."
    Wait-AndExit 1
}
$BumpLevel = if ($Major) { 'major' } elseif ($Patch) { 'patch' } else { 'minor' }

# Version bump (Invoke-VersionBump) and release-branch tracking
# (Start-ReleaseBranch, Complete-ReleaseBranch, Get-LatestEasBuild). Both use
# the Write-* helpers above.
. (Join-Path $PSScriptRoot 'VersionBump.ps1')
. (Join-Path $PSScriptRoot 'ReleaseBranch.ps1')

# Load KEY=VALUE pairs from a local .env file into the process environment.
# Existing environment values win, so an explicitly-set EXPO_TOKEN is never
# clobbered. Lines that are blank or start with '#' are ignored.
function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $eq = $trimmed.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $trimmed.Substring(0, $eq).Trim()
        $val = $trimmed.Substring($eq + 1).Trim()
        if ($val.Length -ge 2 -and
            (($val.StartsWith('"') -and $val.EndsWith('"')) -or
             ($val.StartsWith("'") -and $val.EndsWith("'")))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($key))) { continue }
        Set-Item -Path "Env:$key" -Value $val
    }
}

$logPath = Join-Path $PSScriptRoot 'android-build-log.json'
function Read-BuildLog {
    if (Test-Path $logPath) {
        try {
            $content = Get-Content $logPath -Raw | ConvertFrom-Json
            if ($content -is [array]) { return $content }
            elseif ($null -ne $content) { return @($content) }
        } catch { Write-Warn "Log corrupt. Starting fresh." }
    }
    return @()
}
function Write-BuildLog { param([array]$Log) $Log | ConvertTo-Json -Depth 5 | Set-Content $logPath -Encoding UTF8 }
function Add-BuildEntry {
    param([string]$Status, [string]$Notes = "")
    $log = @(Read-BuildLog)
    $log += [PSCustomObject]@{
        timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        platform  = "android"
        profile   = "production"
        status    = $Status
        submitted = (-not $NoSubmit) -and ($Status -eq "success")
        notes     = $Notes
    }
    Write-BuildLog $log
    return $log
}

Write-Host ""
Write-Host "  Refrain - Android Build & Deploy (Play Store)" -ForegroundColor White
Write-Host "  =============================================" -ForegroundColor DarkGray

# Scripts live in tools/ps/, so the project root is two levels up.
$AppDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $AppDir 'package.json'))) { $AppDir = Get-Location }
if (-not (Test-Path (Join-Path $AppDir 'package.json'))) {
    Write-Err "Cannot find package.json."
    Wait-AndExit 1
}
Push-Location $AppDir

# -- Load per-repo auth (.env) ------------------------------------------------
# Lets EAS authenticate as the Expo account THIS project belongs to
# (subvertingcomplexity) via EXPO_TOKEN, independent of the global `eas login`
# session your other repos use. No direnv required.
Import-DotEnv -Path (Join-Path $AppDir '.env')
$easTokenPlaceholder = 'PASTE_YOUR_PERSONAL_EXPO_TOKEN_HERE'
if ($env:EXPO_TOKEN -eq $easTokenPlaceholder) {
    Write-Warn ".env still contains the placeholder EXPO_TOKEN."
    Write-Warn "  Paste your real personal access token into .env, or EAS will use your global login (wrong account)."
    $env:EXPO_TOKEN = $null
} elseif (-not [string]::IsNullOrEmpty($env:EXPO_TOKEN)) {
    $maskLen = [Math]::Min(6, $env:EXPO_TOKEN.Length)
    Write-Ok "EXPO_TOKEN loaded from .env ($($env:EXPO_TOKEN.Substring(0, $maskLen))...) - building as that token's account."
}

if (-not (Test-Path (Join-Path $AppDir 'eas.json'))) {
    Write-Err "eas.json missing. Run 'eas build:configure' first."
    Pop-Location; Wait-AndExit 1
}

if (-not $SkipChecks) {
    Write-Step "Checking prerequisites"
    if (-not (Test-Command 'node')) { Write-Err "Node.js not found."; Pop-Location; Wait-AndExit 1 }
    if (-not (Test-Command 'eas'))  { Write-Err "EAS CLI not found. Install: npm i -g eas-cli"; Pop-Location; Wait-AndExit 1 }
    Write-Ok "Node $((node -v).Trim())"
    Write-Ok "EAS CLI $((eas --version 2>&1 | Out-String).Trim())"

    eas whoami 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        if ($NonInteractive) {
            Write-Err "Not logged into EAS. Run 'eas login' first."
            Pop-Location; Wait-AndExit 1
        }
        eas login
        if ($LASTEXITCODE -ne 0) { Write-Err "EAS login failed."; Pop-Location; Wait-AndExit 1 }
    }
    Write-Ok "Logged in: $((eas whoami 2>&1 | Out-String).Trim())"
}

# -- Bump the release version --------------------------------------------------
# Before the release branch is cut, so the branch (and the build it names)
# carries the bumped version rather than the one it is about to replace.
# Invoke-VersionBump is a no-op if HEAD is already a bump commit -- see
# tools/version-bump.mjs -- so running this and BuildAndDeployiOS.cmd back to
# back for the same version bumps exactly once.
if (-not (Invoke-VersionBump -AppDir $AppDir -Level $BumpLevel)) {
    Pop-Location; Wait-AndExit 1
}

# -- Cut the release branch ---------------------------------------------------
# Before the build rather than after it, so that a run which never comes back
# still left a record of having been attempted.
if (-not (Start-ReleaseBranch -AppDir $AppDir -Platform 'android' -BuildProfile 'production' -AllowDirty:$AllowDirty)) {
    Pop-Location; Wait-AndExit 1
}

Write-Step "Starting EAS production build for Android (cloud)"
Write-Host "  Output: signed AAB for Play Console." -ForegroundColor DarkGray
Write-Host "  Typical build time: 10-20 minutes." -ForegroundColor DarkGray

$buildArgs = @("build", "--profile", "production", "--platform", "android")
if (-not $NoSubmit) { $buildArgs += "--auto-submit" }
if ($NonInteractive) { $buildArgs += "--non-interactive" }

$buildStart = Get-Date
eas @buildArgs
$buildExitCode = $LASTEXITCODE
$buildDuration = ((Get-Date) - $buildStart).ToString("hh\:mm\:ss")

if ($buildExitCode -eq 0) {
    Add-BuildEntry -Status "success" -Notes "Duration: $buildDuration" | Out-Null
    if ($NoSubmit) {
        Write-Ok "Build complete. Duration: $buildDuration"
        Write-Host "  Run 'eas submit --platform android' to send to Play Console." -ForegroundColor Gray
    } else {
        Write-Ok "Build complete and submitted to Play Console. Duration: $buildDuration"
    }
} else {
    Add-BuildEntry -Status "failed" -Notes "Exit $buildExitCode. Duration: $buildDuration" | Out-Null
    Write-Err "EAS build failed (exit $buildExitCode). Duration: $buildDuration"
}

# -- Record the outcome on the release branch ---------------------------------
$release = @{
    AppDir        = $AppDir
    Platform      = 'android'
    Outcome       = $(if ($buildExitCode -eq 0) { 'success' } else { 'failed' })
    BuildExitCode = $buildExitCode
    Duration      = $buildDuration
    Submitted     = ((-not $NoSubmit) -and ($buildExitCode -eq 0))
}
$easBuild = Get-LatestEasBuild -EasCommand 'eas' -Platform 'android' -Since $buildStart
if ($easBuild) {
    $release['EasBuildId']  = $easBuild.Id
    $release['EasBuildUrl'] = $easBuild.Url
}
Complete-ReleaseBranch @release

Pop-Location
Wait-AndExit $buildExitCode
