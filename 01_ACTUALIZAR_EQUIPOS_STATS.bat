@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title INCASTATS - ACTUALIZAR EQUIPOS Y STATS
echo =============================================================
echo   INCASTATS - ACTUALIZAR EQUIPOS Y STATS
echo   SIN BACKUPS - SIN COPIAS GIGANTES - CONFIRMACION OBLIGATORIA
echo =============================================================
echo.
if not exist "%~dp0INCA_ACTUALIZADORES\inca_master_updater.py" (
  echo [ERROR] Faltan archivos. Coloca este BAT en la raiz de IncaStats-Data.
  pause
  exit /b 2
)
set "PYTHON=python"
where py >nul 2>nul
if not errorlevel 1 set "PYTHON=py -3"
set "LOTE=%~1"
if not defined LOTE (
  echo Arrastra aqui el ZIP o carpeta de la extraccion NUEVA.
  set /p "LOTE=Ruta del lote: "
)
if not defined LOTE (
  echo [CANCELADO] No se indico un lote.
  pause
  exit /b 2
)
echo.
echo PRIMERA FASE: VISTA PREVIA (sin escribir).
%PYTHON% -u "%~dp0INCA_ACTUALIZADORES\inca_master_updater.py" equipos --input "%LOTE%"
if errorlevel 1 (
  echo [ERROR] La auditoria fallo. NO se aplicara nada.
  pause
  exit /b 1
)
echo.
choice /C SN /N /M "Quieres iniciar la validacion final para APLICAR? S/N: "
if errorlevel 2 (
  echo [CANCELADO] Sin cambios.
  pause
  exit /b 0
)
%PYTHON% -u "%~dp0INCA_ACTUALIZADORES\inca_master_updater.py" equipos --input "%LOTE%" --apply
if errorlevel 1 (
  echo [ERROR] Operacion detenida. Revisa lo mostrado arriba.
  pause
  exit /b 1
)
echo.
echo [FINALIZADO] Revisa los cambios en GitHub Desktop antes de hacer commit.
pause
