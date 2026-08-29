@echo off
REM Double-click for the interactive release menu (store release, test build,
REM or a store listing push on its own).
REM
REM Pass any argument to skip the menu and run that release directly, e.g.:
REM   Deploy.cmd -Platform ios
REM   Deploy.cmd -Lane fast
REM   Deploy.cmd -Platform android -Listing on
REM   Deploy.cmd -ListingOnly -Platform android
REM   Deploy.cmd -Patch
pushd "%~dp0.."
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\DeployMenu.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\Deploy.ps1" %*
)
popd
