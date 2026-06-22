<#
.SYNOPSIS
    TypeScript type check across the whole repo.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host "   tsc --noEmit" -ForegroundColor DarkGray
npm run typecheck --silent
exit $LASTEXITCODE
