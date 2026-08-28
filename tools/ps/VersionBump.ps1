<#
.SYNOPSIS
    Bumps the release version and lands it on main by pull request, once per
    store release.

    Dot-sourced by Deploy.ps1 after its Write-Step / Write-Ok / Write-Err
    helpers are defined, because it uses them. Same arrangement as
    ReleaseBranch.ps1.

.DESCRIPTION
    Almost nothing happens in here. The semver arithmetic, the file edit, and
    the commit-push-pull-request-merge sequence all live in
    tools/version-bump.mjs and tools/lib/version-bump.mjs, so the arithmetic
    can be unit-tested. This file is the one call site.

    See tools/version-bump.mjs's header comment for the full scheme, including
    why the bump commits on the release branch, why the pull request is merged
    immediately rather than armed with --auto, and why native build numbers are
    not touched here.
#>

# Keep this file ASCII, or give it a UTF-8 byte-order mark. Same reasoning as
# ReleaseBranch.ps1.

<#
.SYNOPSIS
    Bumps app.json + package.json's version and lands it on main.

.DESCRIPTION
    Returns $true when the deploy may go ahead and $false when it must not.
    A version bump reaches main automatically, so it refuses -- and returns
    $false -- on anything that would make that commit untrustworthy: not being
    on main, a dirty tree, main being out of sync with the remote, no GitHub
    CLI to open the pull request with, or a pull request that would not merge.
    Those are exactly the cases tools/version-bump.mjs itself refuses; this
    function only relays its exit code.

    A second call in the same sitting is a no-op rather than a second bump, and
    that is what makes a retry after a partial failure rebuild the failed
    platform at the same version.

    Uses Out-Host for the same reason Invoke-ReleaseTool in ReleaseBranch.ps1
    does: without it, node's stdout joins this function's output stream and
    $LASTEXITCODE stops meaning what the caller expects.
#>
function Invoke-VersionBump {
    param(
        [Parameter(Mandatory = $true)][string]$AppDir,
        [ValidateSet('patch', 'minor', 'major')][string]$Level = 'minor',
        [string]$BaseBranch = 'main',
        [string]$Remote = 'origin'
    )

    $tool = Join-Path $AppDir (Join-Path 'tools' 'version-bump.mjs')
    if (-not (Test-Path $tool)) {
        Write-Warn "tools/version-bump.mjs is missing. Skipping the version bump."
        return $true
    }

    Write-Step "Bumping the release version ($Level)"

    & node $tool bump --level $Level --base $BaseBranch --remote $Remote | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Err "The version was not bumped, so this deploy is not going ahead."
        return $false
    }
    return $true
}
