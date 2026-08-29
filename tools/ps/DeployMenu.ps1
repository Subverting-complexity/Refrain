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
    maps to a Deploy.ps1 command, and that command is printed as the run starts,
    so the menu teaches the command line rather than replacing it.

    The menu is deliberately bare, and it does not ask twice. There is no "are
    you sure": the store question is the last point of no return and its Back
    option is the way out. That trades a safety net for a menu that does not
    argue with someone using it several times a day, which is the trade the
    person using it asked for.

    HOW THE RELEASE IS RUN, and why it is not a pipe. Start-Process
    -NoNewWindow hands the child THIS console rather than a pipe, which three
    things depend on:

      - Colour. PowerShell drops Write-Host colours when it is not writing to a
        console, so a piped release comes out flat.
      - Prompts. `eas build` asks about credentials, and a question written to a
        pipe is never seen and can never be answered. A release that reached
        that point simply stopped, with no way to tell it apart from a slow
        upload.
      - Output at all. A child called inside a function puts its output on that
        function's stream, and a caller that discards the stream to keep an exit
        code discards the release log with it.

    A child process rather than a call in this session, because Deploy.ps1 sets
    its own strict mode, pushes its own location and ends by exiting, and a run
    that stops halfway would otherwise leave this menu holding all of it. It is
    passed -NoPause so only one of the two scripts waits for a keypress.

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

<#
.SYNOPSIS
    The bump level a store release will use, read the same way Deploy.ps1 reads
    it.

.DESCRIPTION
    Shown in the header rather than asked as a question. It is a setting, and a
    setting the operator cannot see is one they find out about from the version
    number after the release.

    This reads .env directly rather than the process environment, because the
    menu never loads .env: the child release does that for itself.
#>
function Get-BumpLevel {
    try {
        $envPath = Join-Path $RepoRoot '.env'
        if (-not (Test-Path $envPath)) { return 'minor' }
        foreach ($line in Get-Content $envPath) {
            $trimmed = $line.Trim()
            if (-not $trimmed.StartsWith('REFRAIN_BUMP_LEVEL=')) { continue }
            $value = $trimmed.Substring('REFRAIN_BUMP_LEVEL='.Length).Trim().Trim('"', "'").ToLowerInvariant()
            if (@('major', 'minor', 'patch') -contains $value) { return $value }
            if ($value -ne '') { return "$value (not a level Deploy.ps1 accepts)" }
            return 'minor'
        }
        return 'minor'
    } catch {
        return 'minor'
    }
}

function Show-Header {
    $version = Get-AppVersion
    $branch = Get-CurrentBranch

    Write-Host ""
    Write-Host "  Refrain - Release" -ForegroundColor White
    Write-Host "  =================" -ForegroundColor DarkGray
    if ($version) { Write-Host "  Version : $version" -ForegroundColor Gray }
    if ($branch)  { Write-Host "  Branch  : $branch" -ForegroundColor Gray }
    Write-Host "  Bump    : $(Get-BumpLevel)" -ForegroundColor Gray
    if ($branch -and $branch -ne 'main') {
        Write-Warn "A store release bumps the version on main. This branch is not main, so it will stop."
    }
}

function Read-Choice {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Options
    )

    while ($true) {
        Write-Host ""
        Write-Host "  $Title" -ForegroundColor White
        Write-Host "  $('-' * $Title.Length)" -ForegroundColor DarkGray
        foreach ($index in 0..($Options.Count - 1)) {
            Write-Host ("   {0}) {1}" -f ($index + 1), $Options[$index]) -ForegroundColor Gray
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

<#
.SYNOPSIS
    Runs Deploy.ps1 with this console, and returns its exit code.

.DESCRIPTION
    See the note in this script's header for why this is Start-Process
    -NoNewWindow rather than a call or a pipe. In short: the release needs a
    real console for its colours, its prompts and its output, and none of those
    survive PowerShell reading the child's output into a pipeline.

    -PassThru with -Wait gives the exit code. Arguments carrying spaces are
    quoted first, because Start-Process joins ArgumentList on spaces and this
    repository's own path has one in "Software Development".
#>
function Invoke-Deploy {
    param([Parameter(Mandatory = $true)][string[]]$DeployArgs)

    $hostExe = Get-HostExecutable
    $invocation = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $DeployScript) + $DeployArgs + @('-NoPause')
    $quoted = $invocation | ForEach-Object {
        if ("$_" -match '\s') { '"' + $_ + '"' } else { "$_" }
    }

    $process = Start-Process -FilePath $hostExe -ArgumentList $quoted -NoNewWindow -Wait -PassThru
    $process.WaitForExit()
    $code = $process.ExitCode

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
    The same three answers whichever action asked, so it is asked in one place.
    'Back' is always present: the first menu is one keypress from a public
    release, and a way out of the second question is what makes answering the
    first one wrongly cost nothing.
#>
function Read-Platform {
    switch (Read-Choice -Title 'Which store?' -Options @('Android', 'iOS', 'Both', 'Back')) {
        1 { return 'android' }
        2 { return 'ios' }
        3 { return 'both' }
        default { return $null }
    }
}

function Wait-ForMenu {
    Write-Host ""
    Write-Host "  Press Enter to return to the menu..." -ForegroundColor DarkGray
    $null = Read-Host
}

# -- The menu -----------------------------------------------------------------
Show-Header

while ($true) {
    $action = Read-Choice -Title 'What do you want to do?' -Options @(
        'Store release',
        'Test build',
        'Store listing only',
        'Quit'
    )

    if ($action -eq 4) {
        Write-Host ""
        Write-Host "  Nothing was run." -ForegroundColor DarkGray
        exit 0
    }

    $platform = Read-Platform
    if (-not $platform) {
        Show-Header
        continue
    }

    $deployArgs = switch ($action) {
        1 { @('-Platform', $platform, '-Lane', 'store') }
        2 { @('-Platform', $platform, '-Lane', 'fast') }
        3 { @('-Platform', $platform, '-ListingOnly') }
    }

    Write-Host ""
    Write-Host "  Running" -ForegroundColor White
    Write-Host "  -------" -ForegroundColor DarkGray
    Write-Host "    .\tools\Deploy.cmd $($deployArgs -join ' ')" -ForegroundColor Cyan
    Write-Host ""
    $null = Invoke-Deploy -DeployArgs $deployArgs

    Wait-ForMenu
    Show-Header
}
