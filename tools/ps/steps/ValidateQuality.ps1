<#
.SYNOPSIS
    ESLint. In local mode, runs with --fix to auto-repair trivial issues.
    In CI mode, runs strict with no fixes.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

if ($IsCI) {
    Write-Host "   eslint (strict, no fix)" -ForegroundColor DarkGray
    npm run lint --silent
} else {
    Write-Host "   eslint --fix" -ForegroundColor DarkGray
    npm run lint --silent -- --fix
}
exit $LASTEXITCODE
