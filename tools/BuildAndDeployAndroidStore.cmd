@echo off
REM Double-click for a production Play Store AAB build + submit.
REM Args pass through, e.g.:
REM   BuildAndDeployAndroidStore.cmd -NoSubmit
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\BuildAndDeployAndroidStore.ps1" %*
popd
