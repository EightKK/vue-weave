@echo off
setlocal
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 LTS and run Start.cmd again.
  echo https://nodejs.org/
  popd
  pause
  exit /b 1
)
node.exe "scripts\serve.mjs" --open
set "DEMO_EXIT=%errorlevel%"
popd
if not "%DEMO_EXIT%"=="0" pause
exit /b %DEMO_EXIT%
