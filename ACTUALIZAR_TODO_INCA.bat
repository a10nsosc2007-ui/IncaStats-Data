@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title INCASTATS V4 - ACTUALIZADOR DE STATS LOCAL

echo =============================================================
echo  INCASTATS V4 - ACTUALIZAR STATS EQUIPOS JUGADORES Y ARBITROS
echo =============================================================
where node >nul 2>nul
if errorlevel 1 (
 echo [ERROR] Instala Node.js LTS para ejecutar el actualizador.
 echo https://nodejs.org/
 goto failed
)
if not exist "%~dp0tools\unified\sync.cjs" (
 echo [ERROR] Falta tools\unified\sync.cjs.
 echo Descomprime el ZIP COMPLETO, no solamente este BAT.
 goto failed
)
if "%~1"=="" (
 node "%~dp0tools\unified\setup.cjs"
 if errorlevel 1 goto failed
 echo.
 echo [INFO] Abriendo EXTRACTOR_UNICO_SOFA.js para copiarlo a F12...
 if exist "%~dp0EXTRACTOR_UNICO_SOFA.js" start "" notepad.exe "%~dp0EXTRACTOR_UNICO_SOFA.js"
 echo Arrastra un INCA_UNIFICADO_STATS_V4_*.json sobre este BAT para sincronizarlo.
 pause
 exit /b 0
)
set "INCA_INPUT=%~f1"
if not exist "%INCA_INPUT%" (
 echo [ERROR] No existe el archivo:
 echo "%INCA_INPUT%"
 goto failed
)
echo.
echo [1/2] Validando archivo, masters, integridad y destino...
node --max-old-space-size=4096 "%~dp0tools\unified\sync.cjs" "%INCA_INPUT%" --check
if errorlevel 1 goto failed
echo.
echo [2/2] Fusionando eventos por ID con respaldos atomicos...
node --max-old-space-size=4096 "%~dp0tools\unified\sync.cjs" "%INCA_INPUT%"
if errorlevel 1 goto failed
echo.
echo [OK] Datos V4 consolidados en: data\unified\
echo [NOTA] Los modulos V3 heredados requieren adaptar su lector para usar esta base V4.
echo [NOTA] No se han tocado JSON antiguos, CSV, repositorios ni claves.
pause
exit /b 0
:failed
echo.
echo [ERROR] Actualizacion cancelada. Tu historico anterior permanece intacto.
pause
exit /b 1
