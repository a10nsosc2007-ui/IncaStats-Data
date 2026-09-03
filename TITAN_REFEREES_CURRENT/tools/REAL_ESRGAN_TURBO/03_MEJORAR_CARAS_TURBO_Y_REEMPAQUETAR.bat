@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title INCASTATS - REAL ESRGAN TURBO REFEREES
echo.
echo ============================================================
echo  PASO 3 - REAL-ESRGAN TURBO + ZIP FINAL GITHUB
echo ============================================================
echo.
py -3 -c "import PIL" >nul 2>&1
if errorlevel 1 (
 echo Instalando Pillow...
 py -3 -m pip install pillow
)
py -3 real_esrgan_turbo.py
if errorlevel 1 python real_esrgan_turbo.py
if errorlevel 1 (
 echo.
 echo ERROR: no se pudo terminar Real-ESRGAN.
 pause
 exit /b 1
)
echo.
echo LISTO. Busca: TITAN_REFEREES_CURRENT_GITHUB_READY_HD.zip
pause
