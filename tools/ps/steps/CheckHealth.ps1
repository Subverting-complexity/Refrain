<#
.SYNOPSIS
    Verifies core tooling is present before the gate continues.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$missing = @()

function Test-Tool {
    param([string]$Name, [string]$Hint)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) {
        Write-Host "   [MISS] $Name (hint: $Hint)" -ForegroundColor Red
        $script:missing += $Name
    } else {
        Write-Host "   [OK]  $Name" -ForegroundColor Green
    }
}

Test-Tool 'node' 'winget install OpenJS.NodeJS.LTS'
Test-Tool 'npm'  'bundled with Node.js'
Test-Tool 'git'  'winget install Git.Git'

# package.json sanity
if (-not (Test-Path (Join-Path (Get-Location) 'package.json'))) {
    Write-Host "   [MISS] package.json at repo root" -ForegroundColor Red
    $missing += 'package.json'
} else {
    Write-Host "   [OK]  package.json present" -ForegroundColor Green
}

# node_modules presence (not fatal -- QualityGate.ps1 -Install installs)
if (-not (Test-Path (Join-Path (Get-Location) 'node_modules'))) {
    Write-Host "   [WARN] node_modules missing - run QualityGate.ps1 -Install" -ForegroundColor Yellow
}

if ($missing.Count -gt 0) {
    exit 1
}
exit 0
