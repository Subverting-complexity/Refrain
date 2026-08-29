<#
.SYNOPSIS
    Records each store release as one branch and a tag per platform.

    Dot-sourced by Deploy.ps1 after its Write-Step / Write-Ok / Write-Warn
    helpers are defined, because it uses them.

.DESCRIPTION
    Almost nothing happens in here. The rules about what a release branch is
    called, when each platform's outcome tag is written, whether a store
    listing needs pushing and which branches have outlived their usefulness
    live in tools/release-branch.mjs and the three modules under tools/lib/
    that it reads, so that they can be unit-tested. This file is the call
    sites and the one thing that genuinely belongs on this side: an optional
    lookup of the EAS build a platform produced, so the tag can name the build
    log rather than leaving you to find it by date.

    See docs/RELEASING.md for the whole scheme.
#>

# Keep this file ASCII, or give it a UTF-8 byte-order mark. PowerShell's
# default parser encoding on Windows is locale-dependent, and a stray
# non-ASCII character has silently corrupted a script here before.

<#
.SYNOPSIS
    Runs tools/release-branch.mjs and returns its exit code.

.DESCRIPTION
    Returns 0 when the tool is absent rather than an error. A checkout without
    it is a checkout from before this existed, and refusing to deploy from one
    would be a bookkeeping feature breaking the thing it books.

    Note the Out-Host, which is not decoration. Anything a native command
    writes to stdout inside a PowerShell function joins that function's output
    stream, so `& node ...` followed by `return $LASTEXITCODE` does not return
    the exit code: it returns an array of every line node printed with the exit
    code on the end. The caller's `if ($code -ne 0)` then compares against an
    array, which filters rather than tests, and a non-empty result is true. The
    effect would be a release that had succeeded, tagged itself and pushed
    correctly being announced as a failure that had stopped the deploy.

    Out-Host sends node's output straight to the console and puts nothing on
    the output stream, so the exit code comes back alone. The cost is that node
    no longer sees a terminal on stdout and so writes plain text rather than
    colour, which suits these scripts anyway: they do their own colouring
    through the Write-* helpers.

    This is also why listing-check answers through an exit code rather than by
    printing its decision: reading one line of a native command's stdout from
    PowerShell means giving up that guarantee everywhere else in this file.
#>
function Invoke-ReleaseTool {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][string[]]$ToolArgs
    )

    $tool = Join-Path $AppDir (Join-Path 'tools' 'release-branch.mjs')
    if (-not (Test-Path $tool)) {
        Write-Warn "tools/release-branch.mjs is missing. Skipping release-branch tracking."
        return 0
    }

    & node $tool @ToolArgs | Out-Host
    return $LASTEXITCODE
}

<#
.SYNOPSIS
    Cuts and pushes the one release branch for a release about to start.

.DESCRIPTION
    Returns $true when the deploy may go ahead and $false when it must not.
    The only thing that returns $false is a dirty working tree, which is
    refused because a branch cut from one names a commit that is not what gets
    built, and a record that looks trustworthy and is not is worse than none.

    A push that fails does not stop the deploy. The branch stays local and
    Complete-ReleasePlatform tries the push again at the end.

    Platforms is the whole set this release covers, not the one being built
    now. The run record has to know the set up front, or a release that stops
    after the first platform leaves state nobody will ever clear.
#>
function Start-Release {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][string]$Platforms,
        [ValidateSet('store', 'fast')][string]$Lane = 'store',
        [string]$BuildProfile = 'production',
        [string]$Remote = 'origin',
        [switch]$AllowDirty
    )

    Write-Step "Cutting the release branch"

    $toolArgs = @(
        'start',
        '--platforms', $Platforms,
        '--lane', $Lane,
        '--profile', $BuildProfile,
        '--remote', $Remote
    )
    if ($AllowDirty) { $toolArgs += '--allow-dirty' }

    $code = Invoke-ReleaseTool -AppDir $AppDir -ToolArgs $toolArgs
    if ($code -ne 0) {
        Write-Err "No release branch was cut, so this deploy is not going ahead."
        return $false
    }
    return $true
}

<#
.SYNOPSIS
    Writes one platform's outcome tag on the release branch.

.DESCRIPTION
    Never fails the caller. By the time this runs that platform's build has
    already happened and its exit code is the one that matters; a tag that
    could not be written is worth a warning and nothing more.

    Called immediately after each platform finishes, before the next one
    starts, so a run that dies during the second build has already recorded the
    first platform's result.

    Listing is free text rather than a switch: it records what happened to the
    store listing for this platform, which is a separate question from whether
    the binary shipped. A listing that failed after a successful submit leaves
    the outcome a success and says so here.
#>
function Complete-ReleasePlatform {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][ValidateSet('ios', 'android')][string]$Platform,
        [Parameter(Mandatory = $true)][ValidateSet('success', 'failed')][string]$Outcome,
        [int]$BuildExitCode = 0,
        [string]$Duration = '',
        [bool]$Submitted = $false,
        [string]$Listing = '',
        [string]$SubmitProfile = '',
        [string]$EasBuildId = '',
        [string]$EasBuildUrl = '',
        [string]$Notes = '',
        [string]$Remote = 'origin'
    )

    Write-Step "Recording the $Platform outcome"

    $toolArgs = @(
        'finish',
        '--platform', $Platform,
        '--outcome', $Outcome,
        '--exit-code', "$BuildExitCode",
        '--remote', $Remote
    )
    if ($Duration)      { $toolArgs += @('--duration', $Duration) }
    if ($Listing)       { $toolArgs += @('--listing', $Listing) }
    if ($SubmitProfile) { $toolArgs += @('--submit-profile', $SubmitProfile) }
    if ($EasBuildId)    { $toolArgs += @('--eas-build-id', $EasBuildId) }
    if ($EasBuildUrl)   { $toolArgs += @('--eas-build-url', $EasBuildUrl) }
    if ($Notes)         { $toolArgs += @('--notes', $Notes) }
    if ($Submitted)     { $toolArgs += '--submitted' }

    $code = Invoke-ReleaseTool -AppDir $AppDir -ToolArgs $toolArgs
    if ($code -ne 0) {
        Write-Warn "The $Platform outcome was not recorded. The build result above still stands."
    }
}

<#
.SYNOPSIS
    Closes the release, whether or not every platform reported.

.DESCRIPTION
    Called unconditionally at the end of every release, including one that
    stopped after a failure. A platform that was never attempted is left
    untagged: it did not fail, it was not tried, and it produced no build to
    link a tag to.

    Also runs the prune, so old failed and unfinished branches are cleared out
    once per release rather than once per platform.
#>
function Stop-Release {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [string]$Remote = 'origin'
    )

    Write-Step "Closing the release"
    Invoke-ReleaseTool -AppDir $AppDir -ToolArgs @('stop', '--remote', $Remote) | Out-Null
}

<#
.SYNOPSIS
    Whether this release should push one platform's store listing.

.DESCRIPTION
    Exit code 0 means push, 20 means there is nothing to push, and anything
    else is a real error -- in which case this returns $true and the listing is
    pushed anyway. That asymmetry is deliberate: pushing a listing that had not
    changed is harmless and idempotent, and skipping one that had changed ships
    a release whose store page still describes the previous one.
#>
function Test-ListingNeeded {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][ValidateSet('ios', 'android')][string]$Platform,
        [ValidateSet('store', 'fast')][string]$Lane = 'store',
        [ValidateSet('auto', 'on', 'off')][string]$Selector = 'auto',
        [string]$Remote = 'origin'
    )

    $code = Invoke-ReleaseTool -AppDir $AppDir -ToolArgs @(
        'listing-check',
        '--platform', $Platform,
        '--lane', $Lane,
        '--listing', $Selector,
        '--remote', $Remote
    )

    if ($code -eq 20) { return $false }
    if ($code -ne 0) {
        Write-Warn "Could not work out whether the $Platform listing changed. Pushing it to be safe."
    }
    return $true
}

<#
.SYNOPSIS
    Checks the listing toolchain and credentials before the first build.

.DESCRIPTION
    Returns $true when a listing push could succeed, or when this run is not
    going to push one at all. Run before the first build rather than at the
    point of use: a missing App Store Connect key should fail the release in
    seconds rather than after a build has already been paid for and shipped.
#>
function Test-ListingPrerequisites {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][string]$Platforms,
        [ValidateSet('store', 'fast')][string]$Lane = 'store',
        [ValidateSet('auto', 'on', 'off')][string]$Selector = 'auto',
        [switch]$ListingOnly
    )

    $toolArgs = @(
        'listing-preflight',
        '--platforms', $Platforms,
        '--lane', $Lane,
        '--listing', $Selector
    )
    # Changes no check. It only stops a failed -ListingOnly run advising the
    # operator to skip the listing and ship the binary, which is a run that has
    # no binary to ship.
    if ($ListingOnly) { $toolArgs += '--listing-only' }

    $code = Invoke-ReleaseTool -AppDir $AppDir -ToolArgs $toolArgs
    return ($code -eq 0)
}

<#
.SYNOPSIS
    The EAS build one platform produced, as a hashtable with Id and Url, or $null.

.DESCRIPTION
    Entirely optional, and written so that every way it can go wrong ends in
    $null rather than in an error. The tag is more useful with a link to the
    build log than without one, and not useful enough to justify failing a
    deploy over.

    The createdAt check is the part that earns its keep. `eas build:list` hands
    back the most recent build for the platform whether or not this run created
    one, so a run that died before EAS got as far as starting a build would
    otherwise tag itself with somebody else's build from last week. Only a
    build created since this platform's build began can be its build.
#>
function Get-LatestEasBuild {
    param(
        [Parameter(Mandatory = $true)][string]$EasCommand,
        [Parameter(Mandatory = $true)][ValidateSet('ios', 'android')][string]$Platform,
        [Parameter(Mandatory = $true)][datetime]$Since
    )

    try {
        $raw = & $EasCommand build:list --platform $Platform --limit 1 --json --non-interactive 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }

        $text = ($raw | ForEach-Object { "$_" }) -join "`n"
        if (-not $text.Trim()) { return $null }

        $builds = @($text | ConvertFrom-Json)
        if ($builds.Count -eq 0) { return $null }
        $build = $builds[0]

        $properties = $build.PSObject.Properties.Name
        if ($properties -notcontains 'id') { return $null }

        if ($properties -contains 'createdAt') {
            $createdAt = [datetime]::MinValue
            if (-not [datetime]::TryParse("$($build.createdAt)", [ref]$createdAt)) { return $null }
            # A minute of slack: the two clocks being compared are this machine
            # and Expo's, and they are not the same clock.
            if ($createdAt -lt $Since.AddMinutes(-1)) { return $null }
        }

        $url = ''
        if ($properties -contains 'buildUrl' -and $build.buildUrl) { $url = "$($build.buildUrl)" }

        return @{ Id = "$($build.id)"; Url = $url }
    } catch {
        return $null
    }
}
