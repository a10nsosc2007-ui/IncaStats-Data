@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title INCASTATS - EQUIPOS MASTER V1
echo ===============================================
echo   INCA - EQUIPOS (CATALOGO POR ID)
echo ===============================================
echo.
echo Solo cataloga equipos. NO fusiona partidos ni logos.
echo Primero muestra vista previa. No hace backups.
echo.
where py >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Instala Python 3 y el launcher py.
  pause
  exit /b 1
)
if not exist "INCA_ACTUALIZAR_CATALOGOS_MASTER.py" (
  echo [ERROR] Falta INCA_ACTUALIZAR_CATALOGOS_MASTER.py en la raiz.
  pause
  exit /b 1
)
set /p "INCA_IN=Arrastra aqui el ZIP, JSON o carpeta de equipos: "
set "INCA_IN=%INCA_IN:"=%"
if not defined INCA_IN (echo [CANCELADO]& pause& exit /b 1)
py -3 "INCA_ACTUALIZAR_CATALOGOS_MASTER.py" equipos "%INCA_IN%"
if errorlevel 1 (echo [BLOQUEADO] Revisa errores. & pause & exit /b 2)
echo.
choice /C SN /N /M "Aplicar estos datos al MASTER? [S/N]: "
if errorlevel 2 (echo [CANCELADO]& pause & exit /b 0)
py -3 "INCA_ACTUALIZAR_CATALOGOS_MASTER.py" equipos "%INCA_IN%" --aplicar
echo.
pause
