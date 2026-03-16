@echo off
rem Wrapper script for the band CLI binary on Windows.
rem Looks for the Cargo-built binary relative to this script's location.

set "SCRIPT_DIR=%~dp0.."

if exist "%SCRIPT_DIR%\target\release\band.exe" (
  "%SCRIPT_DIR%\target\release\band.exe" %*
  exit /b %ERRORLEVEL%
)

if exist "%SCRIPT_DIR%\target\debug\band.exe" (
  "%SCRIPT_DIR%\target\debug\band.exe" %*
  exit /b %ERRORLEVEL%
)

echo error: band binary not found. Run 'pnpm --filter @band/cli build' first. >&2
exit /b 1
