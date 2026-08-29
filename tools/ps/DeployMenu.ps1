<#
.SYNOPSIS
    Interactive release menu. What Deploy.cmd opens when it is double-clicked
    with no arguments.

.DESCRIPTION
    Deploy.ps1 takes its instructions from parameters, and its defaults are the
    most consequential run it has: a public release of both stores. That is the
    right default for a command somebody typed and the wrong one for a file
    somebody double-clicked, where the zero-argument path is the one that needs
    asking about rather than the one that needs to be quickest.

    Nothing is reachable here that is not reachable by typing it. Every choice
    maps to a Deploy.ps1 command, and the confirmation prints that command
    before running it, so the menu teaches the command line rather than
    replacing it. The flags it does not offer (-Patch, -Major, -NoSubmit,
    -SkipClean and the rest) are still there for anyone who wants them.

    Deploy.ps1 runs as a CHILD PROCESS rather than being called in this session.
    It sets its own strict mode, pushes its own location, and ends by exiting
    with a code; running it as a child means none of that can leave this menu
    holding state from a run that stopped halfway. It is passed -NoPause so the
    keypress before the menu is redrawn is this script's alone.

.EXAMPLE
    .\tools\Deploy.cmd
#>

Set-StrictMode -Version Latest

function Write-Ok   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DeployScript = Join-Path $PSScriptRoot 'Deploy.ps1'

if (-not (Test-Path $DeployScript)) {
    # Paused, unlike the Quit path below. This script is normally reached by
    # double-clicking, where the window closes the moment it returns, and an
    # error nobody can read is the same as no error at all.
    Write-Err "Deploy.ps1 is not next to this script. Expected it at: $DeployScript"
    Write-Host ""
    Write-Host "  Press Enter to close..." -ForegroundColor DarkGray
    $null = Read-Host
    exit 1
}

# The executable this menu is itself running under, so the child release runs on
# the same host rather than on whichever PowerShell happens to be first on PATH.
function Get-HostExecutable {
    try {
        $path = (Get-Process -Id $PID).Path
        if ($path -and (Test-Path $path)) { return $path }
    } catch { }
    foreach ($candidate in @('pwsh.exe', 'powershell.exe')) {
        $resolved = Join-Path $PSHOME $candidate
        if (Test-Path $resolved) { return $resolved }
    }
    return 'powershell'
}

function Get-AppVersion {
    try {
        $appJson = Join-Path $RepoRoot 'app.json'
        if (-not (Test-Path $appJson)) { return $null }
        return (Get-Content $appJson -Raw | ConvertFrom-Json).expo.version
    } catch {
        return $null
    }
}

function Get-CurrentBranch {
    try {
        $branch = & git -C $RepoRoot rev-parse --abbrev-ref HEAD 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        return ($branch | Select-Object -First 1)
    } catch {
        return $null
    }
}

function Show-Header {
    $version = Get-AppVersion
    $branch = Get-CurrentBranch

    Write-Host ""
    Write-Host "  Refrain - Release" -ForegroundColor White
    Write-Host "  =================" -ForegroundColor DarkGray
    if ($version) { Write-Host "  Version : $version (what a store release bumps FROM)" -ForegroundColor Gray }
    if ($branch)  { Write-Host "  Branch  : $branch" -ForegroundColor Gray }
    if ($branch -and $branch -ne 'main') {
        Write-Warn "A store release bumps the version on main. This branch is not main, so it will stop."
    }
}

<#
.SYNOPSIS
    Prints a numbered menu and returns the 1-based choice.

.DESCRIPTION
    Options carry a Label and a Detail, because every choice on this menu is one
    somebody could reasonably pick by mistake from the label alone. "Test build"
    and "Store release" are two words apart and a public release apart.
#>
function Read-Choice {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][object[]]$Options
    )

    while ($true) {
        Write-Host ""
        Write-Host "  $Title" -ForegroundColor White
        Write-Host "  $('-' * $Title.Length)" -ForegroundColor DarkGray
        for ($i = 0; $i -lt $Options.Count; $i++) {
            Write-Host ("   {0}) {1}" -f ($i + 1), $Options[$i].Label) -ForegroundColor Gray
            if ($Options[$i].Detail) {
                Write-Host ("      {0}" -f $Options[$i].Detail) -ForegroundColor DarkGray
            }
        }
        Write-Host ""

        $answer = Read-Host "  Choose 1-$($Options.Count)"
        $parsed = 0
        if ([int]::TryParse(("$answer").Trim(), [ref]$parsed) -and $parsed -ge 1 -and $parsed -le $Options.Count) {
            return $parsed
        }
        Write-Warn "Type a number between 1 and $($Options.Count)."
    }
}

function Confirm-Run {
    param([Parameter(Mandatory = $true)][string[]]$DeployArgs)

    Write-Host ""
    Write-Host "  This runs:" -ForegroundColor White
    Write-Host "    .\tools\Deploy.cmd $($DeployArgs -join ' ')" -ForegroundColor Cyan
    Write-Host ""
    $answer = ("$(Read-Host '  Go ahead? [y/N]')").Trim().ToLowerInvariant()
    return ($answer -eq 'y' -or $answer -eq 'yes')
}

function Invoke-Deploy {
    param([Parameter(Mandatory = $true)][string[]]$DeployArgs)

    $hostExe = Get-HostExecutable
    $invocation = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $DeployScript) + $DeployArgs + @('-NoPause')

    # Out-Host, for the reason Invoke-ListingPush in Deploy.ps1 and the note in
    # ReleaseBranch.ps1 both give: without it every line the release printed
    # joins this function's output stream, and the caller here discards that
    # stream to keep the exit code. The build would run, take its twenty
    # minutes, and show nothing on screen.
    & $hostExe @invocation | Out-Host
    $code = $LASTEXITCODE

    Write-Host ""
    if ($code -eq 0) {
        Write-Ok "Finished: .\tools\Deploy.cmd $($DeployArgs -join ' ')"
    } else {
        Write-Err "Stopped with exit code ${code}: .\tools\Deploy.cmd $($DeployArgs -join ' ')"
    }
    return $code
}

<#
.SYNOPSIS
    Asks which store, and returns 'ios', 'android', 'both', or $null for Back.

.DESCRIPTION
    The same three answers whichever action asked the question, so it is asked
    in one place. 'Back' is deliberately always present: the action menu is one
    keypress away from a public release, and a way out of the second question is
    what makes answering the first one wrongly cost nothing.
#>
function Read-Platform {
    param([Parameter(Mandatory = $true)][string]$Title)

    $options = @(
        [PSCustomObject]@{ Label = 'Android'; Detail = 'Google Play only' }
        [PSCustomObject]@{ Label = 'iOS';     Detail = 'App Store only' }
        [PSCustomObject]@{ Label = 'Both';    Detail = 'iOS builds first; a failure there stops the release' }
        [PSCustomObject]@{ Label = 'Back';    Detail = 'return to the main menu without running anything' }
    )

    switch (Read-Choice -Title $Title -Options $options) {
        1 { return 'android' }
        2 { return 'ios' }
        3 { return 'both' }
        default { return $null }
    }
}

<#
.SYNOPSIS
    What one bump level would do to the current version, as "1.3.0 -> 1.4.0".

.DESCRIPTION
    The words major, minor and patch describe the rule rather than the result,
    and the result is what the operator is actually choosing between. Showing
    both is the difference between picking a level and picking a version.

    An unreadable or non-numeric version falls back to describing the rule.
    app.json is the only place the version comes from and it is not this
    script's to validate: the version bump reads the same file and will say so
    far more precisely than a menu preview can.
#>
function Get-BumpPreview {
    param(
        [string]$Version,
        [Parameter(Mandatory = $true)][ValidateSet('major', 'minor', 'patch')][string]$Level
    )

    $fallback = @{
        major = 'the first number up, the rest back to zero'
        minor = 'the middle number up, the last back to zero'
        patch = 'the last number up'
    }[$Level]

    if (-not $Version) { return $fallback }
    $parts = "$Version".Split('.')
    if ($parts.Count -ne 3) { return $fallback }

    $numbers = @(0, 0, 0)
    for ($i = 0; $i -lt 3; $i++) {
        $parsed = 0
        if (-not [int]::TryParse($parts[$i], [ref]$parsed)) { return $fallback }
        $numbers[$i] = $parsed
    }

    $next = $fallback
    switch ($Level) {
        'major' { $next = "$($numbers[0] + 1).0.0" }
        'minor' { $next = "$($numbers[0]).$($numbers[1] + 1).0" }
        'patch' { $next = "$($numbers[0]).$($numbers[1]).$($numbers[2] + 1)" }
    }
    return "$Version -> $next"
}

<#
.SYNOPSIS
    Asks how far a store release should move the version.
    Returns 'minor', 'patch', 'major', or $null for Back.

.DESCRIPTION
    Minor is first and marked as the default because it is Deploy.ps1's default
    and the ordinary answer. The other two are listed rather than hidden behind
    an argument because the level is a real per-release decision, and a menu
    that could only ever cut a minor release would send anybody wanting a patch
    back to the command line for the one flag it would not offer.
#>
function Read-BumpLevel {
    $version = Get-AppVersion

    $options = @(
        [PSCustomObject]@{ Label = 'Minor (default)'; Detail = Get-BumpPreview -Version $version -Level 'minor' }
        [PSCustomObject]@{ Label = 'Patch';           Detail = Get-BumpPreview -Version $version -Level 'patch' }
        [PSCustomObject]@{ Label = 'Major';           Detail = Get-BumpPreview -Version $version -Level 'major' }
        [PSCustomObject]@{ Label = 'Back';            Detail = 'return to the main menu without running anything' }
    )

    switch (Read-Choice -Title 'Store release: which version bump?' -Options $options) {
        1 { return 'minor' }
        2 { return 'patch' }
        3 { return 'major' }
        default { return $null }
    }
}

function Wait-ForMenu {
    Write-Host ""
    Write-Host "  Press Enter to return to the menu..." -ForegroundColor DarkGray
    $null = Read-Host
}

# -- The menu -----------------------------------------------------------------
$actions = @(
    [PSCustomObject]@{
        Label  = 'Store release'
        Detail = 'public: bumps the version by pull request, builds, submits, pushes the listing'
    }
    [PSCustomObject]@{
        Label  = 'Test build'
        Detail = 'internal testers: Play internal track / TestFlight. No version bump, no public listing'
    }
    [PSCustomObject]@{
        Label  = 'Store listing only'
        Detail = 'fastlane: pushes copy, screenshots and privacy declarations. No build, no submit'
    }
    [PSCustomObject]@{
        Label  = 'Quit'
        Detail = ''
    }
)

Show-Header

while ($true) {
    $action = Read-Choice -Title 'What do you want to do?' -Options $actions

    if ($action -eq 4) {
        Write-Host ""
        Write-Host "  Nothing was run." -ForegroundColor DarkGray
        exit 0
    }

    $platform = $null
    $deployArgs = @()

    switch ($action) {
        1 {
            $platform = Read-Platform -Title 'Store release: which store?'
            if ($platform) {
                # Back out of the bump question by clearing the platform, which
                # is what the guard below reads to send us round to the main
                # menu. Two questions deep is exactly where somebody realises
                # they picked the wrong thing on the first one.
                $bump = Read-BumpLevel
                if ($bump) {
                    $deployArgs = @('-Platform', $platform, '-Lane', 'store')
                    if ($bump -eq 'patch') { $deployArgs += '-Patch' }
                    if ($bump -eq 'major') { $deployArgs += '-Major' }
                } else {
                    $platform = $null
                }
            }
        }
        2 {
            $platform = Read-Platform -Title 'Test build: which platform?'
            if ($platform) { $deployArgs = @('-Platform', $platform, '-Lane', 'fast') }
        }
        3 {
            $platform = Read-Platform -Title 'Store listing: which store?'
            if ($platform) { $deployArgs = @('-Platform', $platform, '-ListingOnly') }
        }
    }

    if (-not $platform) { continue }

    if (Confirm-Run -DeployArgs $deployArgs) {
        $null = Invoke-Deploy -DeployArgs $deployArgs
    } else {
        Write-Host ""
        Write-Host "  Cancelled. Nothing was run." -ForegroundColor DarkGray
    }

    Wait-ForMenu
    Show-Header
}
