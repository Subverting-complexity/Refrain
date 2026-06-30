<#
.SYNOPSIS
    Quality Gate Orchestrator for Refrain.
.DESCRIPTION
    A cohesive testing environment that manages static analysis, quality checks,
    build integrity, and functional testing.
    - Local: fixes issues where possible and pauses on completion.
    - CI: strict verification and non-zero exit on any failure.
    All phases always run so you get a complete picture in one pass.
.PARAMETER Install
    Run `npm ci` before the gate phases.
.PARAMETER SkipTests
    Skip the functional/unit test phase.
.EXAMPLE
    .\tools\QualityGate.ps1
    .\tools\QualityGate.ps1 -Install
    .\tools\QualityGate.ps1 -SkipTests
#>
param(
    [switch]$Install,
    [switch]$SkipTests
)

# --- CONFIGURATION ---
$isCI = $env:CI -eq 'true' -or $env:TF_BUILD -eq 'true' -or $env:GITHUB_ACTIONS -eq 'true'
$isInteractive = [Environment]::UserInteractive
# Scripts live in tools/ps/, so the repo root is two levels up.
$repoRoot = (Get-Item (Join-Path $PSScriptRoot "..\..")).FullName
Set-Location $repoRoot

# Results collection
$Script:results = @()

# --- UI HELPERS ---
$Divider = "=" * 70
function Write-Header {
    param([string]$Text)
    Write-Host "`n$Divider" -ForegroundColor Gray
    Write-Host "  $Text" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host "$Divider" -ForegroundColor Gray
    Write-Host "  ROOT: $repoRoot" -ForegroundColor DarkGray
    Write-Host "  MODE: $(if ($isCI) { 'CI (STRICT)' } else { 'LOCAL (AUTO-FIX)' })" -ForegroundColor DarkGray
    Write-Host "  TIME: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
    Write-Host ("-" * 70) -ForegroundColor Gray
}

# --- STEP ORCHESTRATOR ---
function Invoke-Phase {
    param([string]$ScriptFile, [string]$Title)

    Write-Host "`n[ RUNNING ] $Title" -ForegroundColor Magenta
    $stepPath = Join-Path $PSScriptRoot "steps\$ScriptFile"

    if (-not (Test-Path $stepPath)) {
        Write-Host "   [SKIP] Step not found: $stepPath" -ForegroundColor Yellow
        $Script:results += [PSCustomObject]@{ Phase = $Title; Status = 'SKIP'; Code = 0 }
        return
    }

    $IsCI = $isCI
    try {
        . $stepPath
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
    } catch {
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        $code = 1
    }

    if ($code -ne 0) {
        Write-Host "`n[ !! ] FAILURE in phase: $Title (code: $code)" -ForegroundColor Red
        $status = 'FAIL'
    } else {
        Write-Host "   [ OK ] Phase complete." -ForegroundColor Green
        $status = 'PASS'
    }

    $Script:results += [PSCustomObject]@{ Phase = $Title; Status = $status; Code = $code }
}

# --- SUMMARY PRINTER ---
function Write-Summary {
    $totalPassed = ($Script:results | Where-Object { $_.Status -eq 'PASS' }).Count
    $totalFailed = ($Script:results | Where-Object { $_.Status -eq 'FAIL' }).Count
    $totalSkipped = ($Script:results | Where-Object { $_.Status -eq 'SKIP' }).Count

    Write-Host "`n$Divider" -ForegroundColor Gray
    Write-Host "  QUALITY GATE SUMMARY" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host $Divider -ForegroundColor Gray

    foreach ($r in $Script:results) {
        $icon = switch ($r.Status) {
            'PASS' { '[PASS]' }
            'FAIL' { '[FAIL]' }
            default { '[SKIP]' }
        }
        $color = switch ($r.Status) {
            'PASS' { 'Green' }
            'FAIL' { 'Red' }
            default { 'Yellow' }
        }
        Write-Host "   $icon $($r.Phase)" -ForegroundColor $color
    }

    Write-Host ("-" * 70) -ForegroundColor Gray
    Write-Host "   Total: $($Script:results.Count)   Passed: $totalPassed   Failed: $totalFailed   Skipped: $totalSkipped" -ForegroundColor $(if ($totalFailed -gt 0) { 'Red' } else { 'Green' })
    Write-Host $Divider -ForegroundColor Gray

    return $totalFailed
}

# --- MAIN EXECUTION PIPELINE ---
try {
    if ($isInteractive -and -not $isCI) { Clear-Host }
    Write-Header "REFRAIN - QUALITY GATE"

    if ($Install) {
        Write-Host "`n>> PHASE: Package Synchronization (npm ci)" -ForegroundColor Cyan
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "Package install failed." }
        Write-Host "   [ OK ] Dependencies synced." -ForegroundColor Green
    }

    Invoke-Phase "CheckHealth.ps1"        "Project Health"
    Invoke-Phase "VerifyAssets.ps1"       "Asset Bundle"
    Invoke-Phase "RunStaticAnalysis.ps1"  "Static Analysis"
    Invoke-Phase "ValidateQuality.ps1"    "Code Quality"
    Invoke-Phase "VerifyFormatting.ps1"   "Code Style"
    Invoke-Phase "TestBuild.ps1"          "Build Integrity"

    if (-not $SkipTests) {
        Invoke-Phase "ExecuteTests.ps1"   "Functional Testing + Coverage"
    }

    $failCount = Write-Summary

    if ($failCount -eq 0) {
        Write-Host "`n  [ SUCCESS ] ALL GATES PASSED`n" -ForegroundColor Green
    }
}
catch {
    Write-Host "`n[ !! ] CRITICAL SYSTEM ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $Script:results += [PSCustomObject]@{ Phase = 'System'; Status = 'FAIL'; Code = 1 }
    $null = Write-Summary
}
finally {
    $hasFailed = ($Script:results | Where-Object { $_.Status -eq 'FAIL' }).Count -gt 0

    if ($isInteractive -and -not $isCI) {
        Write-Host "Quality Gate complete. Press any key to exit..." -ForegroundColor Yellow
        $null = Read-Host
    }
    if ($hasFailed) { exit 1 }
}
