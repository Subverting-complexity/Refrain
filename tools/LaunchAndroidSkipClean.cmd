@echo off
REM Double-click for a quick relaunch: LaunchAndroid.cmd with -SkipClean added,
REM so the two cannot drift apart. Keeps the Metro and Expo caches, the
REM generated android/ project and the last Gradle build, and rebuilds only
REM what changed. Right for JavaScript and TypeScript edits. After a change to
REM app.json, a config plugin or a native dependency, use LaunchAndroid.cmd
REM instead, because android/ is not regenerated here.
pushd "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps\LaunchAndroid.ps1" -SkipClean %*
popd
