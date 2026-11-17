@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title IncaStats - Actualizador de Arbitros

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Se necesita Node.js instalado en el sistema para ejecutar este script[cite: 3].
  pause
  exit /b 1
)

:: Si se arrastró un archivo sobre el .BAT
if not "%~1"=="" (
  set "ZIP_FILE=%~1"
  goto procesar
)

:: Si se ejecutó directamente con doble clic
echo ========================================================
echo         INCASTATS · ACTUALIZADOR DE ARBITROS V9
echo ========================================================
echo.
echo Carga el JSON de arbitros usando EXTRACTOR_ARBITROS_SOFA.js
echo.
echo Arrastra el archivo ZIP generado aqui y presiona ENTER:
set /p "ZIP_FILE=Ruta del archivo ZIP: "
set "ZIP_FILE=!ZIP_FILE:"=!"

if "!ZIP_FILE!"=="" (
  echo Abriendo EXTRACTOR_ARBITROS_SOFA.js en el Bloc de Notas para copiar...
  start "" notepad.exe "%~dp0EXTRACTOR_ARBITROS_SOFA.js"
  pause
  exit /b 0
)

:procesar
echo.
echo [1/2] Verificando integridad del ZIP descargado...
node --max-old-space-size=4096 "%~dp0tools\unified\sync.cjs" "!ZIP_FILE!" --check
if errorlevel 1 goto error_sync

echo.
echo [2/2] Aplicando UPSERT a la base de datos de Arbitros...
node --max-old-space-size=4096 "%~dp0tools\unified\sync.cjs" "!ZIP_FILE!"
if errorlevel 1 goto error_sync

echo.
echo ========================================================
echo  ACTUALIZACION EXITOSA: Base de arbitros al dia[cite: 3].
echo  Historicos y backups creados en .backups[cite: 3].
echo ========================================================
pause
exit /b 0

:error_sync
echo.
echo [ERROR] Ocurrio un problema durante la sincronizacion. Revisa la consola arriba[cite: 3].
pause
exit /b 1