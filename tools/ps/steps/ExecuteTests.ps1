<#
.SYNOPSIS
    Jest test suite. Always runs with coverage so the threshold gate is
    exercised in both CI and local runs. In CI, a failing threshold is
    fatal; locally, failures print a banner but don't auto-fix (there is
    no auto-fix for low coverage -- the remedy is to write more tests).
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

if ($IsCI) {
    Write-Host "   jest --ci --coverage" -ForegroundColor DarkGray
    npx jest --ci --coverage --coverageReporters=text-summary --coverageReporters=lcov --coverageReporters=json-summary
} else {
    # Locally we still run coverage, but without --ci so Jest uses a
    # developer-friendly reporter and doesn't bail on the first failure.
    Write-Host "   jest --coverage" -ForegroundColor DarkGray
    npx jest --coverage --coverageReporters=text-summary --coverageReporters=lcov --coverageReporters=json-summary
}
$code = $LASTEXITCODE

# Summary extract -- read coverage-summary.json if present and print a one-liner.
$summary = Join-Path (Get-Location) 'coverage/coverage-summary.json'
if (Test-Path $summary) {
    try {
        $json = Get-Content $summary -Raw | ConvertFrom-Json
        $total = $json.total
        $line = "   Coverage: {0}% stmts / {1}% branch / {2}% func / {3}% lines" -f `
            $total.statements.pct, $total.branches.pct, $total.functions.pct, $total.lines.pct
        $colour = if ($code -eq 0) { 'Green' } else { 'Yellow' }
        Write-Host $line -ForegroundColor $colour
    } catch {
        Write-Host "   Coverage summary unreadable: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

exit $code
