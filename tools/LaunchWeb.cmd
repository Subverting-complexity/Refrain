@echo off
REM Double-click to launch the web UI preview. Args pass through, e.g.:
REM   LaunchWeb.cmd -Port 8088
REM   LaunchWeb.cmd -NoOpen
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\LaunchWeb.ps1" %*
popd
