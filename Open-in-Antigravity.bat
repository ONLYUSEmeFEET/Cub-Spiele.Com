@echo off
title Open Cub Spiele.Com in Google Antigravity IDE
cd /d "%~dp0"
where antigravity >nul 2>nul
if %errorlevel%==0 (
  start "" antigravity cub-spiele-com.code-workspace
  exit /b 0
)
where agy >nul 2>nul
if %errorlevel%==0 (
  start "" agy cub-spiele-com.code-workspace
  exit /b 0
)
if exist "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe" (
  start "" "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe" "%~dp0cub-spiele-com.code-workspace"
  exit /b 0
)
echo Launching cub-spiele-com.code-workspace...
start "" "%~dp0cub-spiele-com.code-workspace"
