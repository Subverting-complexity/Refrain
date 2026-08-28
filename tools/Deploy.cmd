@echo off
REM Double-click for a public store release of both platforms.
REM Args pass through, e.g.:
REM   Deploy.cmd -Platform ios
REM   Deploy.cmd -Lane fast
REM   Deploy.cmd -Platform android -Listing on
REM   Deploy.cmd -Patch
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\Deploy.ps1" %*
popd
