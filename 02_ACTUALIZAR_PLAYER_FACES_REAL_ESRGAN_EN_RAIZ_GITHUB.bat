@echo off
setlocal
cd /d "%~dp0"
title TITAN PLAYER FACES SYNC V1
echo ==============================================================
echo   TITAN PLAYER FACES - F12 ^> REAL-ESRGAN ^> GITHUB
echo ==============================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 TITAN_PLAYER_FACES_SYNC_V1.py
) else (
  python TITAN_PLAYER_FACES_SYNC_V1.py
)
pause
