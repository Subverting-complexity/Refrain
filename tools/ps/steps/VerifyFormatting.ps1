<#
.SYNOPSIS
    Prettier. Local: rewrite files in place. CI: fail if any file would change.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

if ($IsCI) {
    Write-Host "   prettier --check" -ForegroundColor DarkGray
    npm run format:check --silent
} else {
    Write-Host "   prettier --write" -ForegroundColor DarkGray
    npm run format --silent
}
exit $LASTEXITCODE
