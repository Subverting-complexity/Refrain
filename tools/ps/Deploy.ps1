<#
.SYNOPSIS
    Build and deploy Refrain to the App Store and/or Google Play through EAS.
    One entry point for both platforms. No Mac and no local Gradle required:
    every build runs on Expo's cloud runners.

.DESCRIPTION
    Shared setup runs exactly once per release however many platforms are
    selected: .env loading, prerequisite checks, the version bump, and the
    release branch. Only build, submit and the listing push repeat per
    platform.

    Both platforms build SEQUENTIALLY, each as its own single-platform EAS
    invocation, rather than as one `--platform all` build. A combined
    invocation collapses both results into a single exit code that can only
    report that at least one platform failed, never which. One invocation per
    platform keeps a real per-platform exit code and lets each platform be
    tagged as it finishes. The cost is wall-clock: roughly the sum of both
    build times rather than the longer of the two.

    iOS builds first. Its credential path (certificates, provisioning profiles,
    and an Apple sign-in that is a separate identity from the EAS login) is the
    more fragile of the two, so failing there first is the cheaper failure.

    A failed platform stops the release; remaining platforms are not built.
    That limits wasted builds against the monthly quota. It does not make the
    release atomic -- a submission that has already succeeded cannot be
    withdrawn -- so if iOS ships and Android then fails, the stores sit at
    different versions until the next successful Android release. Retry with
    -Platform android: the version bump is a no-op on a retry, so the rebuild
    carries the same version.

.PARAMETER Platform
    Which stores to ship to: 'both' (default), 'ios', or 'android'.

.PARAMETER Lane
    Where the build is headed. 'store' (default) is the public release.
    'fast' puts a build in front of internal testers without a public release:
    the Play 'internal' track on Android, and a plain TestFlight upload on iOS,
    which has no track parameter of its own. The fast lane does not bump the
    marketing version and never touches the public store listing.

.PARAMETER Listing
    Whether to push the store listing (metadata, screenshots, privacy
    declarations) after the binary: 'auto' (default) pushes a platform's
    listing only when that platform's listing files changed since its last
    successful store release, 'on' pushes regardless, 'off' skips it.
    Store lane only; the fast lane never pushes the public listing, and neither
    does a -NoSubmit run.

.PARAMETER Profile
    EAS build profile: 'production' (default, the only one that releases),
    'development' (dev-client for device testing), or 'preview' (internal
    distribution build). Development and preview builds carry no version bump,
    no release branch, no submit and no listing push -- they are not releases.

.PARAMETER Patch
    Store lane only: bump the patch version for this run.

.PARAMETER Major
    Store lane only: bump the major version for this run.

    Neither flag is needed for the usual case. The level defaults to minor, and
    REFRAIN_BUMP_LEVEL in .env changes that default for this machine (major,
    minor or patch). These two flags override the setting for one run, which is
    what a one-off patch release wants.

.PARAMETER NoSubmit
    Build only. Do not hand the binary to either store, and do not push either
    store's listing: the listing follows the submit, so with no submit there is
    nothing for it to follow.

.PARAMETER ListingOnly
    Push the store listing and nothing else: no build, no submit, no version
    bump, no release branch. For a listing fix that does not need a new binary,
    where a full release would burn a version and a build to deliver corrected
    copy. Store lane and production profile only.

.PARAMETER NoPause
    Skip the keypress this script waits for before closing. For a caller that
    does its own pausing, which is what DeployMenu.ps1 does when it runs this
    script and then returns to its menu.

.PARAMETER NonInteractive
    Run without prompts (for CI). Fails if credentials are not already cached.

.PARAMETER SkipChecks
    Skip prerequisite verification (faster for repeat builds).

.PARAMETER SkipClean
    Skip cache clearing (reuse Metro cache and Expo artifacts).

.PARAMETER AllowDirty
    Cut the release branch from a dirty working tree anyway. Never skips the
    version bump's own dirty-tree check -- see tools/version-bump.mjs.

.EXAMPLE
    .\tools\Deploy.cmd
    .\tools\Deploy.cmd -Platform ios
    .\tools\Deploy.cmd -Lane fast
    .\tools\Deploy.cmd -Platform android -Listing on
    .\tools\Deploy.cmd -Profile development -Platform ios
    .\tools\Deploy.cmd -Patch
    .\tools\Deploy.cmd -ListingOnly -Platform android
#>
param(
    [ValidateSet('both', 'ios', 'android')]
    [string]$Platform = 'both',
    [ValidateSet('store', 'fast')]
    [string]$Lane = 'store',
    [ValidateSet('auto', 'on', 'off')]
    [string]$Listing = 'auto',
    [ValidateSet('development', 'preview', 'production')]
    [string]$Profile = 'production',
    [switch]$Patch,
    [switch]$Major,
    [switch]$NoSubmit,
    [switch]$ListingOnly,
    [switch]$NoPause,
    [switch]$NonInteractive,
    [switch]$SkipChecks,
    [switch]$SkipClean,
    [switch]$AllowDirty
)

Set-StrictMode -Version Latest

# -- Helper functions ---------------------------------------------------------
function Write-Step  { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Test-Command { param([string]$cmd) $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

# Shortens an email address to the part that confirms which account it is,
# without printing the address itself.
#
# The domain is what tells the operator whether they picked the work account
# or the personal one, so it stays whole; the local part is the personal half
# and is cut to its first few characters. adrienne@example.com prints as
# adr***@example.com. A local part of three characters or fewer keeps only its
# first, so a short address does not arrive intact.
#
# Anything without an '@' is not an address and falls back to the same mask
# EXPO_TOKEN uses: enough to recognise, not enough to reuse.
function Format-MaskedEmail {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return $Value }

    $at = $Value.LastIndexOf('@')
    if ($at -lt 1) {
        $keep = [Math]::Min(3, $Value.Length)
        return "$($Value.Substring(0, $keep))***"
    }

    $local = $Value.Substring(0, $at)
    $domain = $Value.Substring($at)
    $keep = if ($local.Length -le 3) { 1 } else { 3 }
    return "$($local.Substring(0, $keep))***$domain"
}

function Wait-AndExit {
    param([int]$Code = 1)
    # DeployMenu.ps1 runs this script as a child process and pauses itself
    # before redrawing its menu, so pausing here too would be a keypress the
    # operator has to make twice to get back to a menu they are already at.
    if ($NoPause) { exit $Code }
    Write-Host ""
    Write-Host "Press any key to close this window..." -ForegroundColor DarkGray
    try {
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    } catch {
        Start-Sleep -Seconds 5
    }
    exit $Code
}

# Version bump (Invoke-VersionBump) and release tracking (Start-Release,
# Complete-ReleasePlatform, Stop-Release, Test-ListingNeeded,
# Test-ListingPrerequisites, Get-LatestEasBuild). Both use the Write-* helpers
# above, so they are dot-sourced after them.
. (Join-Path $PSScriptRoot 'VersionBump.ps1')
. (Join-Path $PSScriptRoot 'ReleaseBranch.ps1')

# Load KEY=VALUE pairs from a local .env file into the process environment.
# Existing environment values win, so an explicitly-set variable is never
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

# -- Store listing ------------------------------------------------------------
<#
.SYNOPSIS
    Pushes one platform's store listing, and says what happened in one line.

.DESCRIPTION
    Returns the sentence that goes in the outcome tag's Listing field and in
    the run summary. It never fails the caller, on purpose: by the time this
    runs the binary has already been submitted and cannot be withdrawn, so a
    listing that would not push is not a failed release. It is, however, a
    thing somebody has to go and finish, which is why the failure path shouts
    rather than logging a warning among the build output.

    Two of those sentences are load-bearing rather than decorative. 'pushed' and
    'not pushed: unchanged ...' are what the next release's -Listing auto reads
    back out of the tag to decide it has a commit worth diffing against; see
    listingIsLive in tools/lib/release-listing.mjs, which matches on those two
    prefixes. Reword either one here without changing it there and every later
    auto decision quietly becomes a push. Anything unrecognised is read as "the
    store did not catch up at that release", which is the harmless direction.

    fastlane is run from the fastlane/ directory because that is where its
    Gemfile lives; fastlane itself then resolves the project root as the parent,
    which is what the repo-root-relative paths in the Fastfile expect.

    The Out-Host on the fastlane call is the gotcha documented at length in
    ReleaseBranch.ps1: without it, every line fastlane printed joins this
    function's output stream and the caller receives an array instead of the
    one-line result.
#>
function Invoke-ListingPush {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][ValidateSet('ios', 'android')][string]$BuildPlatform,
        [Parameter(Mandatory = $true)][ValidateSet('store', 'fast')][string]$BuildLane,
        [Parameter(Mandatory = $true)][ValidateSet('auto', 'on', 'off')][string]$Selector,
        [switch]$ListingOnly
    )

    if (-not (Test-ListingNeeded -AppDir $AppDir -Platform $BuildPlatform -Lane $BuildLane -Selector $Selector)) {
        return 'not pushed: unchanged since the last successful store release'
    }

    Write-Step "Pushing the $BuildPlatform store listing"

    if (-not (Test-Command 'bundle')) {
        Write-Warn "Ruby's 'bundle' is not on PATH, so the listing was not pushed."
        return 'failed: bundle is not installed'
    }

    Push-Location (Join-Path $AppDir 'fastlane')
    try {
        & bundle exec fastlane $BuildPlatform listing | Out-Host
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    if ($code -eq 0) {
        Write-Ok "$BuildPlatform store listing pushed."
        return 'pushed'
    }

    Write-Host ""
    if ($ListingOnly) {
        # A listing-only run shipped nothing, so the release banner below would
        # be a plain lie about the most consequential thing it could say. This
        # failure is also the whole run rather than a loose end after one, so it
        # needs no shouting: the exit code and the summary already carry it.
        Write-Err "The $BuildPlatform store listing was not pushed."
        Write-Err "  Nothing else ran, so nothing is half-done. Fix the cause and run it again."
        Write-Err "  The equivalent by hand is:"
        Write-Err "    cd fastlane; bundle exec fastlane $BuildPlatform listing"
        Write-Host ""
        return "failed: fastlane exited $code"
    }

    # Deliberately loud. The build succeeded and went to the store, so nothing
    # else on screen says anything is wrong, and a quiet warning here is one
    # that gets read as part of a successful release.
    Write-Err "============================================================"
    Write-Err " The $BuildPlatform BINARY SHIPPED. Its STORE LISTING did not."
    Write-Err "============================================================"
    Write-Err " The release is NOT a failure: the build was submitted and is"
    Write-Err " on its way. The store page still describes the previous"
    Write-Err " version until the listing is pushed."
    Write-Err " Fix the cause, then run:"
    Write-Err "   cd fastlane; bundle exec fastlane $BuildPlatform listing"
    Write-Host ""
    return "failed: fastlane exited $code"
}

# -- Build log functions ------------------------------------------------------
# One file per platform, kept where the per-platform scripts left them so the
# existing history is not orphaned by this script replacing them.
function Get-BuildLogPath {
    param([string]$BuildPlatform)
    return Join-Path $PSScriptRoot "$BuildPlatform-build-log.json"
}

function Read-BuildLog {
    param([string]$BuildPlatform)
    $logPath = Get-BuildLogPath -BuildPlatform $BuildPlatform
    if (Test-Path $logPath) {
        try {
            $content = Get-Content $logPath -Raw | ConvertFrom-Json
            if ($content -is [array]) { return $content }
            elseif ($null -ne $content) { return @($content) }
            else { return @() }
        } catch {
            Write-Warn "The $BuildPlatform build log was corrupted. Starting fresh."
            return @()
        }
    }
    return @()
}

function Add-BuildEntry {
    param(
        [string]$BuildPlatform,
        [string]$Status,
        [string]$BuildProfile = 'production',
        [string]$BuildLane = 'store',
        [bool]$WasSubmitted = $false,
        [string]$Notes = ''
    )
    $log = @(Read-BuildLog -BuildPlatform $BuildPlatform)
    $log += [PSCustomObject]@{
        timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        platform  = $BuildPlatform
        profile   = $BuildProfile
        lane      = $BuildLane
        status    = $Status
        submitted = $WasSubmitted
        notes     = $Notes
    }
    $log | ConvertTo-Json -Depth 5 | Set-Content (Get-BuildLogPath -BuildPlatform $BuildPlatform) -Encoding UTF8
    return $log
}

function Show-BuildSummary {
    param([string]$BuildPlatform, [array]$Log)
    $currentMonth = (Get-Date).ToString('yyyy-MM')
    $monthBuilds = @($Log | Where-Object { $_.timestamp -like "$currentMonth*" })
    $successBuilds = @($monthBuilds | Where-Object { $_.status -eq 'success' })
    $failedBuilds = @($monthBuilds | Where-Object { $_.status -eq 'failed' })

    Write-Host "  $BuildPlatform : this month $($monthBuilds.Count) builds ($($successBuilds.Count) ok, $($failedBuilds.Count) failed); all time $($Log.Count)" -ForegroundColor Gray
    return $monthBuilds.Count
}

# -- Resolve the run ----------------------------------------------------------
if ($Patch -and $Major) {
    Write-Err "-Patch and -Major are mutually exclusive."
    exit 1
}

# -ListingOnly is the store listing on its own: the copy, screenshots and
# privacy declarations, with no binary anywhere near it. It earns a mode of its
# own because a listing fix is frequently the only thing that needs to reach the
# store, and the alternative is a full release that burns a version and a cloud
# build to deliver a corrected sentence.
#
# The flags it refuses are the ones that would leave it doing nothing at all.
# Each of these would be silently accepted otherwise, and a mode that can be
# asked to do nothing is one that gets run twice before anybody notices.
if ($ListingOnly) {
    $conflicts = @()
    if ($Lane -ne 'store')         { $conflicts += "-Lane $Lane, which never touches the public listing" }
    if ($Profile -ne 'production') { $conflicts += "-Profile $Profile, which has no public listing to push" }
    if ($Listing -eq 'off')        { $conflicts += "-Listing off, which switches off the only thing this mode does" }
    if ($NoSubmit)                 { $conflicts += "-NoSubmit, which holds back a build this mode does not run" }
    if ($Patch -or $Major)         { $conflicts += "-Patch/-Major, which bump a version this mode does not touch" }
    if ($conflicts.Count -gt 0) {
        Write-Err "-ListingOnly cannot be combined with:"
        foreach ($conflict in $conflicts) { Write-Err "  $conflict" }
        exit 1
    }

    # 'auto' asks whether the listing changed since the last successful store
    # release. Asked of a run whose whole purpose is to push the listing, the
    # answer is sometimes still "no", and the operator is left looking at a
    # summary that says nothing happened. An explicitly typed -Listing auto is
    # left alone: somebody who asked that question wanted it asked.
    if (-not $PSBoundParameters.ContainsKey('Listing')) { $Listing = 'on' }
}

# A development or preview build is not something anyone ships, so it earns
# neither a version bump nor a branch/tag record -- recording either would fill
# both with attempts nobody will ever look up. It never submits either.
$IsRelease = ($Profile -eq 'production')
if (-not $IsRelease) {
    $NoSubmit = $true
    $Lane = 'fast'
    $Listing = 'off'
}

# iOS first: see the script header.
#
# Wrapped in @() a second time on purpose. A single-element array coming out of
# an if is unwrapped to the scalar inside it, so a one-platform run left
# $Targets holding a plain string, and $Targets.Count threw under strict mode --
# on the failure path, which is where it was least welcome and last noticed.
$Targets = @(if ($Platform -eq 'both') { 'ios', 'android' } else { $Platform })

# The lane picks the submit configuration rather than being hardcoded. On
# Android these are genuinely different destinations (the 'production' and
# 'internal' Play tracks, defined in eas.json). On iOS there is no track
# parameter on submit at all: both profiles upload to App Store Connect, which
# makes the build available to TestFlight internal testers once Apple has
# processed it. What the store lane adds on iOS is the public listing push, and
# then a separate, explicit submit-for-review step once the build is processed.
$SubmitProfile = if ($Lane -eq 'store') { 'production' } else { 'internal' }

# The store lane bumps the marketing version; the fast lane does not. EAS
# increments the native build number remotely on every production build
# regardless, so consecutive test builds are already distinguishable without
# burning a marketing version on builds nobody outside the team sees.
# The -not $ListingOnly on both of these is belt to the listing-only block's
# braces: that block returns long before either flag is read, so neither
# changes what runs today. They are the flags anyone reads to answer "does this
# run bump a version, does it push a listing after a build", and leaving them
# saying yes for a mode that does neither is how the next edit gets it wrong.
$ShouldBump = $IsRelease -and ($Lane -eq 'store') -and (-not $ListingOnly)

# Whether this run pushes the public store listing at all. Resolved once here
# rather than restated at each call site, so the prerequisite check and the push
# itself cannot disagree about whether a listing is happening.
#
# -NoSubmit is the part worth spelling out. The listing push runs after the
# binary submit, so a run that submits nothing has nothing for it to follow, and
# pushing anyway would publish the new copy, screenshots and privacy label for a
# build that never left this machine. On iOS it would go further than that: the
# listing lane opens the App Store version record for the new version, so the
# store would be carrying a version with no binary behind it.
$ShouldPushListing = $IsRelease -and ($Lane -eq 'store') -and ($Listing -ne 'off') -and (-not $NoSubmit) -and (-not $ListingOnly)

# -- Banner -------------------------------------------------------------------
Write-Host ""
if ($ListingOnly) {
    Write-Host "  Refrain - Store listing" -ForegroundColor White
    Write-Host "  =======================" -ForegroundColor DarkGray
    Write-Host "  Stores    : $($Targets -join ' then ')" -ForegroundColor Gray
    Write-Host "  Listing   : $Listing" -ForegroundColor Gray
    Write-Host "  No build, no submit, no version bump: store copy only." -ForegroundColor DarkGray
} else {
    Write-Host "  Refrain - Build & Deploy" -ForegroundColor White
    Write-Host "  ========================" -ForegroundColor DarkGray
    Write-Host "  Platforms : $($Targets -join ' then ')" -ForegroundColor Gray
    Write-Host "  Profile   : $Profile" -ForegroundColor Gray
    if ($IsRelease) {
        Write-Host "  Lane      : $Lane ($(if ($Lane -eq 'store') { 'public store release' } else { 'internal testers' }))" -ForegroundColor Gray
        Write-Host "  Listing   : $Listing" -ForegroundColor Gray
    } else {
        Write-Host "  Lane      : none - a $Profile build is not a release" -ForegroundColor Gray
        Write-Host "  No version bump, no release branch, no submit, no listing push." -ForegroundColor DarkGray
    }
}

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

# -- Load per-repo credentials (.env) -----------------------------------------
# One load for the whole release. It carries three separate identities:
#   EXPO_TOKEN     the Expo account THIS project belongs to
#                  (subvertingcomplexity), independent of the global `eas login`
#                  session other repos use.
#   EXPO_APPLE_ID  the Apple Developer account, read directly by eas-cli.
#   APPLE_ID / ASC_* / SUPPLY_JSON_KEY
#                  fastlane's own credentials for the store listing push.
# All of them live in the gitignored .env rather than in eas.json, because this
# repository is public. See .env.example.
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

# -- How far this release moves the version -----------------------------------
# Resolved here rather than with the other arguments because REFRAIN_BUMP_LEVEL
# is read from .env, which is loaded above. It is a setting for a machine, not a
# decision for a release, which is why it is not a question the deploy menu
# asks: the answer is the same almost every time.
#
# -Patch and -Major still win, so the occasional patch release stays one flag
# rather than a settings change and a settings change back.
#
# A value this does not recognise stops the run. Falling back to minor would be
# the same silence the -Listing selector refuses elsewhere: a typo that quietly
# ships a different version than the one the setting says it will.
# Only worked out for a run that will use it. A listing push or a fast-lane
# build bumps nothing, and stopping one of those over a typo in a setting it
# never reads would be a gate on the wrong thing.
$BumpLevel = 'minor'
if ($ShouldBump) {
    if ($Patch) {
        $BumpLevel = 'patch'
    } elseif ($Major) {
        $BumpLevel = 'major'
    } else {
        $configuredBump = "$($env:REFRAIN_BUMP_LEVEL)".Trim().ToLowerInvariant()
        if ($configuredBump -eq '') {
            $BumpLevel = 'minor'
        } elseif (@('major', 'minor', 'patch') -contains $configuredBump) {
            $BumpLevel = $configuredBump
        } else {
            Write-Err "REFRAIN_BUMP_LEVEL in .env is '$configuredBump'. Expected major, minor or patch."
            Write-Err "  Leave it blank for the default, which is minor."
            Pop-Location
            Wait-AndExit 1
        }
    }
    Write-Ok "Version bump: $BumpLevel"
}

# -- Listing-only run ---------------------------------------------------------
# Placed ahead of every EAS concern on purpose: a listing push talks to fastlane
# and the stores directly, so it needs neither the EAS CLI, nor a login, nor
# eas.json, and gating it on any of those would fail a run for a reason that has
# nothing to do with what it does.
#
# It writes no release branch and no outcome tag, because it is not a release.
# The visible consequence is that a later -Listing auto cannot see that this
# push happened and may push the same content again. That is the harmless
# direction: a repeat push is idempotent, and a skipped one is not.
if ($ListingOnly) {
    Write-Step "Checking the listing setup"
    if (-not (Test-ListingPrerequisites -AppDir $AppDir -Platforms $Platform -Lane $Lane -Selector $Listing -ListingOnly)) {
        Write-Err "Nothing was pushed. Fix the listing setup and run it again."
        Pop-Location
        Wait-AndExit 1
    }

    $listingResults = @()
    $listingExitCode = 0
    foreach ($target in $Targets) {
        $outcome = Invoke-ListingPush -AppDir $AppDir -BuildPlatform $target -BuildLane $Lane -Selector $Listing -ListingOnly
        if ($outcome -like 'failed:*') { $listingExitCode = 1 }
        $listingResults += [PSCustomObject]@{ Platform = $target; Listing = $outcome }
    }

    Write-Host ""
    Write-Host "  Listing summary" -ForegroundColor White
    Write-Host "  ---------------" -ForegroundColor DarkGray
    foreach ($listingResult in $listingResults) {
        $colour = if ($listingResult.Listing -like 'failed:*') { 'Red' } else { 'Green' }
        Write-Host "  $($listingResult.Platform.PadRight(8)) $($listingResult.Listing)" -ForegroundColor $colour
    }
    Write-Host ""
    Write-Host "  No build, no submit, and no version bump: this pushed store copy only." -ForegroundColor DarkGray

    Pop-Location
    Wait-AndExit $listingExitCode
}

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
    Write-Ok "EAS CLI $((eas --version 2>&1 | Out-String).Trim())"

    # Verify EAS login
    eas whoami 2>&1 | Out-Null
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
    Write-Ok "Logged in as: $((eas whoami 2>&1 | Out-String).Trim())"

    # Verify bundle identifier / package name is set
    $appJson = Join-Path $AppDir 'app.json'
    if (Test-Path $appJson) {
        try {
            $appConfig = Get-Content $appJson -Raw | ConvertFrom-Json
            if ($Targets -contains 'ios') {
                $bundleId = $appConfig.expo.ios.bundleIdentifier
                if (-not $bundleId) {
                    Write-Warn "ios.bundleIdentifier not set in app.json. EAS will prompt you for it."
                } elseif ($bundleId -like 'com.yourname.*') {
                    Write-Warn "Bundle ID still uses a 'com.yourname.*' placeholder. Update app.json before TestFlight."
                } else {
                    Write-Ok "Bundle ID: $bundleId"
                }
            }
            if ($Targets -contains 'android') {
                $package = $appConfig.expo.android.package
                if (-not $package) {
                    Write-Warn "android.package not set in app.json. EAS will prompt you for it."
                } else {
                    Write-Ok "Package: $package"
                }
            }
        } catch {
            Write-Warn "Could not parse app.json. Continuing anyway."
        }
    }

    # The store lane lands its version bump through a pull request, so the
    # GitHub CLI is a prerequisite rather than a convenience. Checked here
    # rather than when the bump runs, so a missing gh costs seconds.
    if ($ShouldBump) {
        if (-not (Test-Command 'gh')) {
            Write-Err "The GitHub CLI (gh) is not installed, and the version bump lands by pull request."
            Write-Err "  Install from https://cli.github.com, then run 'gh auth login'."
            Pop-Location
            Wait-AndExit 1
        }
        gh auth status 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Err "gh is installed but not authenticated. Run 'gh auth login'."
            Pop-Location
            Wait-AndExit 1
        }
        Write-Ok "GitHub CLI authenticated"
    }

    # The listing push needs Ruby and credentials that are entirely separate
    # from the EAS token. Checked before the first build, so a missing App
    # Store Connect key fails the release in seconds rather than after a build
    # has already been paid for and shipped.
    if ($ShouldPushListing) {
        if (-not (Test-ListingPrerequisites -AppDir $AppDir -Platforms $Platform -Lane $Lane -Selector $Listing)) {
            Write-Err "Fix the listing setup, or re-run with -Listing off to ship the binary only."
            Pop-Location
            Wait-AndExit 1
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

    foreach ($cache in @((Join-Path $env:TEMP 'metro-*'), (Join-Path $env:TEMP 'haste-map-*'),
                         (Join-Path $AppDir '.expo'), (Join-Path $AppDir 'node_modules\.cache'))) {
        if (Test-Path $cache) {
            Remove-Item $cache -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Kill any stale Metro processes from previous runs
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'metro|expo' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Write-Ok "Metro, Expo, and module caches cleared"
}

# -- Show build history before starting ---------------------------------------
Write-Step "Build history"
$monthTotal = 0
foreach ($target in $Targets) {
    $monthTotal += Show-BuildSummary -BuildPlatform $target -Log @(Read-BuildLog -BuildPlatform $target)
}
if ($monthTotal -ge 25 -and $monthTotal -lt 30) {
    Write-Warn "Approaching the Expo free tier limit (30 builds/month). See expo.dev/pricing."
} elseif ($monthTotal -ge 30) {
    Write-Err "Expo free tier limit reached (30 builds/month). Builds may be queued or rejected."
}

# -- Pin the Apple ID for credential sign-in ----------------------------------
# EAS prompts for an Apple ID during certificate and profile generation. Left to
# itself it prefills from a cached username (~/.app-store/auth/username.json),
# which is whatever Apple ID was typed last -- possibly a work account rather
# than the one that owns this app.
#
# The value is deliberately NOT in eas.json: this repository is public and the
# Apple ID is a personal address. It lives in the gitignored .env, loaded near
# the top of this script, and eas-cli reads EXPO_APPLE_ID directly before it
# reaches the prompt.
#
# It is masked on the way out for the same reason it is not in eas.json.
# Deploy output gets pasted into issues and attached to support requests, so
# printing the address in full puts it in the same public places the .env was
# meant to keep it out of. The masked form still answers the only question
# this line exists to answer: which account is this build going to.
if ($Targets -contains 'ios') {
    if ($env:EXPO_APPLE_ID) {
        Write-Ok "Apple ID from EXPO_APPLE_ID: $(Format-MaskedEmail $env:EXPO_APPLE_ID)"
    } else {
        Write-Warn "EXPO_APPLE_ID is not set. EAS will prompt and prefill from its cached username,"
        Write-Warn "  which may be a different Apple account. Add EXPO_APPLE_ID to .env (see .env.example)"
        Write-Warn "  rather than accepting whatever the prompt offers."
    }
}

# -- Bump the release version --------------------------------------------------
# Once per release, before any build and before the release branch is recorded,
# so both platforms build from one commit carrying one version. A no-op when
# the bump is already on main, which is what makes a retry after a partial
# failure rebuild the failed platform at the same version.
if ($ShouldBump) {
    if (-not (Invoke-VersionBump -AppDir $AppDir -Level $BumpLevel)) {
        Pop-Location
        Wait-AndExit 1
    }
} elseif ($IsRelease) {
    Write-Step "Skipping the version bump"
    Write-Host "  The fast lane keeps the current marketing version. EAS still increments the" -ForegroundColor DarkGray
    Write-Host "  build number remotely, so this build is distinguishable from the last one." -ForegroundColor DarkGray
}

# -- Record the release --------------------------------------------------------
# Before the first build rather than after it, so that a release which never
# comes back still left a record of having been attempted. One branch for the
# whole release; the per-platform outcomes go on tags.
if ($IsRelease) {
    if (-not (Start-Release -AppDir $AppDir -Platforms $Platform -Lane $Lane -BuildProfile $Profile -AllowDirty:$AllowDirty)) {
        Pop-Location
        Wait-AndExit 1
    }
}

# -- Build each platform in turn ----------------------------------------------
# The loop is wrapped in try/finally so the release is closed however it ends:
# normally, after a failure stopped it, or on an error nobody anticipated. An
# open run left behind is what would make the *next* release find a release
# already in flight, and that is a worse failure than whatever caused it.
$overallExitCode = 0
$results = @()

try {

foreach ($target in $Targets) {
    Write-Step "Starting EAS $Profile build for $target (cloud)"
    if ($target -eq 'ios') {
        Write-Host "  Runs on Expo's macOS cloud runners. Typical build time: 5-15 minutes." -ForegroundColor DarkGray
        Write-Host "  A first run prompts for Apple credentials and certificate generation." -ForegroundColor DarkGray
    } else {
        Write-Host "  Output: signed AAB for Play Console. Typical build time: 10-20 minutes." -ForegroundColor DarkGray
    }

    $buildArgs = @('build', '--profile', $Profile, '--platform', $target)
    if (-not $NoSubmit) {
        # --auto-submit-with-profile rather than --auto-submit, because the
        # submit profile is chosen by the lane and does not always share the
        # build profile's name.
        $buildArgs += @('--auto-submit-with-profile', $SubmitProfile)
        Write-Host "  Submitting with the '$SubmitProfile' submit profile." -ForegroundColor DarkGray
    }
    if ($NonInteractive) { $buildArgs += '--non-interactive' }

    $buildStart = Get-Date
    eas @buildArgs
    $buildExitCode = $LASTEXITCODE
    $buildDuration = ((Get-Date) - $buildStart).ToString('hh\:mm\:ss')
    $succeeded = ($buildExitCode -eq 0)
    $submitted = ((-not $NoSubmit) -and $succeeded)

    if ($succeeded) {
        Write-Host ""
        if ($submitted) {
            Write-Ok "$target build complete and submitted. Duration: $buildDuration"
        } else {
            Write-Ok "$target build complete (not submitted). Duration: $buildDuration"
        }
    } else {
        Write-Err "$target EAS build failed (exit code $buildExitCode). Duration: $buildDuration"
        Write-Err "Common fixes:"
        if ($target -eq 'ios') {
            Write-Err "  - Check eas.json has valid ascAppId and appleTeamId"
            Write-Err "  - Check EXPO_APPLE_ID is set (in .env); it is not in eas.json"
            Write-Err "  - If Apple credentials expired, re-run without -NonInteractive"
        } else {
            Write-Err "  - Check the Play service-account JSON named by eas.json is present"
            Write-Err "  - A brand-new app may need its first AAB uploaded by hand in Play Console"
        }
        Write-Err "  - Run 'eas login' to re-authenticate with Expo"
        Write-Err "  - Check build logs at https://expo.dev"
    }

    # -- Push the store listing -----------------------------------------------
    # After the binary submit, not before: on iOS the review submission is part
    # of the listing tooling and needs a build attached to the version, so it
    # cannot run first. Only after a successful build, because a listing update
    # for a release that never shipped describes a version nobody can install.
    $listingResult = 'not attempted'
    if ($ShouldPushListing -and $succeeded) {
        $listingResult = Invoke-ListingPush -AppDir $AppDir -BuildPlatform $target -BuildLane $Lane -Selector $Listing
    } elseif ($IsRelease -and $Lane -ne 'store') {
        $listingResult = "not pushed: the $Lane lane does not touch the public listing"
    } elseif ($IsRelease -and $Listing -eq 'off') {
        $listingResult = 'not pushed: -Listing off'
    } elseif ($IsRelease -and $NoSubmit) {
        $listingResult = 'not pushed: -NoSubmit, so there was no submit for it to follow'
    }

    # -- Record this platform's outcome ---------------------------------------
    $notes = "Exit code: $buildExitCode. Duration: $buildDuration"
    Add-BuildEntry -BuildPlatform $target -Status $(if ($succeeded) { 'success' } else { 'failed' }) `
        -BuildProfile $Profile -BuildLane $Lane -WasSubmitted $submitted -Notes $notes | Out-Null

    if ($IsRelease) {
        $release = @{
            AppDir        = $AppDir
            Platform      = $target
            Outcome       = $(if ($succeeded) { 'success' } else { 'failed' })
            BuildExitCode = $buildExitCode
            Duration      = $buildDuration
            Submitted     = $submitted
            Listing       = $listingResult
            SubmitProfile = $(if ($NoSubmit) { '' } else { $SubmitProfile })
        }
        $easBuild = Get-LatestEasBuild -EasCommand 'eas' -Platform $target -Since $buildStart
        if ($easBuild) {
            $release['EasBuildId']  = $easBuild.Id
            $release['EasBuildUrl'] = $easBuild.Url
        }
        Complete-ReleasePlatform @release
    }

    $results += [PSCustomObject]@{
        Platform = $target
        Status   = $(if ($succeeded) { 'success' } else { 'failed' })
        Duration = $buildDuration
        Listing  = $listingResult
    }

    if (-not $succeeded) {
        $overallExitCode = $buildExitCode
        if ($Targets.IndexOf($target) -lt ($Targets.Count - 1)) {
            Write-Host ""
            Write-Warn "Stopping here. The remaining platform(s) are not being built."
            Write-Warn "  A release is meant to put the same version on both stores, and continuing"
            Write-Warn "  past a failure spends build quota on an outcome already out of reach."
            Write-Warn "  Once the cause is fixed, retry just this platform:"
            Write-Warn "    .\tools\Deploy.cmd -Platform $target -Lane $Lane"
        }
        break
    }
}

} finally {
    # -- Close the release -----------------------------------------------------
    # Unconditionally, including after a failure. A platform that was never
    # attempted is left untagged: it did not fail, it was not tried.
    if ($IsRelease) {
        Stop-Release -AppDir $AppDir
    }
}

# -- Final summary -------------------------------------------------------------
Write-Host ""
Write-Host "  Release summary" -ForegroundColor White
Write-Host "  ---------------" -ForegroundColor DarkGray
foreach ($result in $results) {
    $colour = if ($result.Status -eq 'success') { 'Green' } else { 'Red' }
    Write-Host "  $($result.Platform.PadRight(8)) $($result.Status.PadRight(8)) $($result.Duration)" -ForegroundColor $colour
    Write-Host "           listing: $($result.Listing)" -ForegroundColor DarkGray
}
$notBuilt = @($Targets | Where-Object { $_ -notin ($results | ForEach-Object { $_.Platform }) })
foreach ($skipped in $notBuilt) {
    Write-Host "  $($skipped.PadRight(8)) not attempted" -ForegroundColor DarkGray
}

if ($IsRelease -and $Lane -eq 'store' -and $overallExitCode -eq 0 -and ($Targets -contains 'ios')) {
    Write-Host ""
    Write-Host "  iOS review submission is a separate step." -ForegroundColor White
    Write-Host "  Apple needs 5-15 minutes to process the upload first, which is why it is not" -ForegroundColor DarkGray
    Write-Host "  folded into this run. Once TestFlight shows the build as processed:" -ForegroundColor DarkGray
    Write-Host "    cd fastlane; bundle exec fastlane ios listing submit:true" -ForegroundColor Gray
}

Pop-Location
Wait-AndExit $overallExitCode
