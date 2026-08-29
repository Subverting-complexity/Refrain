@echo off
REM Double-click to build + install on a USB-connected Android device.
REM This is the local dev loop, not a store release: see Deploy.cmd for that.
REM Args pass through, e.g.:
REM   LaunchAndroid.cmd -SkipClean
REM   LaunchAndroid.cmd -Device RFXXXXXXX
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\LaunchAndroid.ps1" %*
popd
