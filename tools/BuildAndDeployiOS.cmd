@echo off
REM Double-click for a production TestFlight build. Args pass through, e.g.:
REM   BuildAndDeployiOS.cmd -Profile development
REM   BuildAndDeployiOS.cmd -Profile preview
REM   BuildAndDeployiOS.cmd -NoSubmit
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\BuildAndDeployiOS.ps1" %*
popd
