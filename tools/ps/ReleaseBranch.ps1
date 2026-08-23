<#
.SYNOPSIS
    Records each store release attempt as a branch and an outcome tag.

    Dot-sourced by BuildAndDeployiOS.ps1 and BuildAndDeployAndroidStore.ps1
    after their Write-Step / Write-Ok / Write-Warn helpers are defined, because
    it uses them.

.DESCRIPTION
    Almost nothing happens in here. The rules about what a release branch is
    called, when its outcome tag is written and which branches have outlived
    their usefulness live in tools/release-branch.mjs and the two modules under
    tools/lib/ that it reads, so that they can be unit-tested. This file is the
    three call sites and the one thing that genuinely belongs on this side: an
    optional lookup of the EAS build the run produced, so the tag can name the
    build log rather than leaving you to find it by date.

    See docs/release-branches.md for the whole scheme.
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
    Cuts and pushes the release branch for a run about to start.

.DESCRIPTION
    Returns $true when the deploy may go ahead and $false when it must not.
    The only thing that returns $false is a dirty working tree, which is
    refused because a branch cut from one names a commit that is not what gets
    built, and a record that looks trustworthy and is not is worse than none.

    A push that fails does not stop the deploy. The branch stays local and
    Complete-ReleaseBranch tries the push again at the end.
#>
function Start-ReleaseBranch {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][ValidateSet('ios', 'android')][string]$Platform,
        [string]$BuildProfile = 'production',
        [string]$Remote = 'origin',
        [switch]$AllowDirty
    )

    Write-Step "Cutting the release branch"

    $toolArgs = @('start', '--platform', $Platform, '--profile', $BuildProfile, '--remote', $Remote)
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
    Writes the outcome tag for a finished run, then prunes old branches.

.DESCRIPTION
    Never fails the caller. By the time this runs the build has already
    happened and its exit code is the one that matters; a tag that could not be
    written is worth a warning and nothing more.
#>
function Complete-ReleaseBranch {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [Parameter(Mandatory = $true)][ValidateSet('ios', 'android')][string]$Platform,
        [Parameter(Mandatory = $true)][ValidateSet('success', 'failed')][string]$Outcome,
        [int]$BuildExitCode = 0,
        [string]$Duration = '',
        [bool]$Submitted = $false,
        [string]$EasBuildId = '',
        [string]$EasBuildUrl = '',
        [string]$Notes = '',
        [string]$Remote = 'origin'
    )

    Write-Step "Recording the release outcome"

    $toolArgs = @(
        'finish',
        '--platform', $Platform,
        '--outcome', $Outcome,
        '--exit-code', "$BuildExitCode",
        '--remote', $Remote
    )
    if ($Duration)    { $toolArgs += @('--duration', $Duration) }
    if ($EasBuildId)  { $toolArgs += @('--eas-build-id', $EasBuildId) }
    if ($EasBuildUrl) { $toolArgs += @('--eas-build-url', $EasBuildUrl) }
    if ($Notes)       { $toolArgs += @('--notes', $Notes) }
    if ($Submitted)   { $toolArgs += '--submitted' }

    $code = Invoke-ReleaseTool -AppDir $AppDir -ToolArgs $toolArgs
    if ($code -ne 0) {
        Write-Warn "The release outcome was not recorded. The build result above still stands."
    }
}

<#
.SYNOPSIS
    The EAS build this run produced, as a hashtable with Id and Url, or $null.

.DESCRIPTION
    Entirely optional, and written so that every way it can go wrong ends in
    $null rather than in an error. The tag is more useful with a link to the
    build log than without one, and not useful enough to justify failing a
    deploy over.

    The createdAt check is the part that earns its keep. `eas build:list` hands
    back the most recent build for the platform whether or not this run created
    one, so a run that died before EAS got as far as starting a build would
    otherwise tag itself with somebody else's build from last week. Only a
    build created since this run began can be this run's build.
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
