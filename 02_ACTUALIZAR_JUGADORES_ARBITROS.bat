@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title INCASTATS - JUGADORES MASTER V1
echo =====================================================
echo INCA - JUGADORES / ARBITROS
echo =====================================================
echo.
echo FASE ACTUAL: catalogo de jugadores por ID.
echo ARBITROS: solo se audita la fuente TITAN, no se fusiona.
echo NO ACTUALIZA stats/fotos de jugadores ni arbitros.
echo.
where py >nul 2>nul
if errorlevel 1 (echo [ERROR] Necesitas Python 3 y py. & pause & exit /b 1)
if not exist "INCA_ACTUALIZAR_CATALOGOS_MASTER.py" (
  echo [ERROR] Falta script central.
  pause
  exit /b 1
)
set /p "INCA_IN=Arrastra aqui el ZIP, JSON o carpeta de jugadores: "
set "INCA_IN=%INCA_IN:"=%"
if not defined INCA_IN (echo [CANCELADO]& pause & exit /b 1)
py -3 "INCA_ACTUALIZAR_CATALOGOS_MASTER.py" jugadores "%INCA_IN%"
if errorlevel 1 (echo [BLOQUEADO] Revisa errores. & pause & exit /b 2)
choice /C SN /N /M "Aplicar catalogo de jugadores al MASTER? [S/N]: "
if errorlevel 2 (echo [CANCELADO]& pause & exit /b 0)
py -3 "INCA_ACTUALIZAR_CATALOGOS_MASTER.py" jugadores "%INCA_IN%" --aplicar
echo.
echo Los arbitros siguen en TITAN_REFEREES_CURRENT intactos.
pause
