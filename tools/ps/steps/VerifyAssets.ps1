<#
.SYNOPSIS
    Ensures the PNG assets referenced by app.json exist and are non-empty.
    Guards against EAS build-time failures caused by missing icon/splash
    files. Refrain checks the icon, both splash images (light and dark),
    the favicon, and the three Android adaptive-icon layers. A missing or
    zero-byte asset fails the gate in both local and CI modes (there is no
    placeholder generator -- the remedy is to restore the real artwork in
    assets/images/).
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$required = @(
    'assets/images/icon.png',
    'assets/images/splash-icon-light.png',
    'assets/images/splash-icon-dark.png',
    'assets/images/favicon.png',
    'assets/images/android-icon-foreground.png',
    'assets/images/android-icon-background.png',
    'assets/images/android-icon-monochrome.png'
)

$missing = @()
$empty = @()

foreach ($rel in $required) {
    $abs = Join-Path (Get-Location) $rel
    if (-not (Test-Path $abs)) {
        $missing += $rel
        continue
    }
    if ((Get-Item $abs).Length -le 0) {
        $empty += $rel
    } else {
        Write-Host "   [OK]  $rel" -ForegroundColor Green
    }
}

if ($missing.Count -gt 0 -or $empty.Count -gt 0) {
    foreach ($m in $missing) { Write-Host "   [MISS] $m" -ForegroundColor Red }
    foreach ($e in $empty) { Write-Host "   [EMPTY] $e" -ForegroundColor Red }
    Write-Host "   Restore the missing artwork in assets/images/ before building." -ForegroundColor Yellow
    exit 1
}

exit 0
