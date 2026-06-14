<#
.SYNOPSIS
    Verifies the Expo-managed dependency set is aligned with the SDK
    version in use. A full Metro bundle dry-run requires many transitive
    packages to be version-locked in ways that churn between SDK minor
    releases; `expo install --check` is the tool built for exactly this
    gate and is what `eas build` calls internally.

    Full native build integrity is exercised by
    BuildAndDeployAndroid.ps1 / BuildAndDeployiOS.ps1.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host "   expo install --check (SDK compatibility)" -ForegroundColor DarkGray

npx expo install --check 2>&1 | Out-Host
$code = $LASTEXITCODE

if ($code -ne 0 -and -not $IsCI) {
    Write-Host "   [AUTO] Running expo install --fix locally" -ForegroundColor Yellow
    npx expo install --fix 2>&1 | Out-Host
    # Re-check to confirm the fix converged.
    npx expo install --check 2>&1 | Out-Host
    $code = $LASTEXITCODE
}

exit $code
