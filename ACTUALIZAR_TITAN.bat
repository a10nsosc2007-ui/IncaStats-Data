@echo off
setlocal
title TITAN SYNC V1
cd /d "%~dp0"

where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "%~dp0TITAN_SYNC_V1.py" %*
  goto :end
)

where python >nul 2>&1
if %errorlevel%==0 (
  python "%~dp0TITAN_SYNC_V1.py" %*
  goto :end
)

echo.
echo ==============================================================
echo  FALTA PYTHON 3 EN WINDOWS
echo ==============================================================
echo TITAN SYNC usa solo Python estandar, pero no encuentro "py" ni "python".
echo Instala Python 3 y vuelve a ejecutar este BAT.
echo.
pause
:end
