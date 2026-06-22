@echo off
REM Double-click to run the full quality gate. Args pass through, e.g.:
REM   QualityGate.cmd -Install
REM   QualityGate.cmd -SkipTests
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\QualityGate.ps1" %*
popd
