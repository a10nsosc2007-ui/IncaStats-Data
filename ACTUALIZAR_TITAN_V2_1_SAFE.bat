@echo off
setlocal
title TITAN SYNC V2.1 SAFE
cd /d "%~dp0"

echo ==============================================================
echo   TITAN SYNC V2.1 SAFE - ACTUALIZACIONES FUTURAS
echo ==============================================================
echo.
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "%~dp0TITAN_SYNC_V2_1_SAFE.py" %*
  goto :end
)
where python >nul 2>&1
if %errorlevel%==0 (
  python "%~dp0TITAN_SYNC_V2_1_SAFE.py" %*
  goto :end
)
echo FALTA PYTHON 3.
pause
:end
