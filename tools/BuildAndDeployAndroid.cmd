@echo off
REM Double-click to build + install on a USB-connected Android device.
REM Args pass through, e.g.:
REM   BuildAndDeployAndroid.cmd -SkipClean
REM   BuildAndDeployAndroid.cmd -Device RFXXXXXXX
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\BuildAndDeployAndroid.ps1" %*
popd
