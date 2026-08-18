@echo off
setlocal
cd /d "%~dp0"
title TITAN SYNC V3 UNIFIED
echo ==============================================================
echo   TITAN SYNC V3 - MATCHES + PLAYER STATS DE LIGA
echo ==============================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 TITAN_SYNC_V3_UNIFIED.py
) else (
  python TITAN_SYNC_V3_UNIFIED.py
)
pause
