@echo off
setlocal
title IncaStats - Limpiar Player Props antiguo

cd /d "%~dp0"

if not exist "TITAN_ALONSINHO_V1_GITHUB_READY" (
  echo.
  echo ERROR: Ejecuta este BAT desde la raiz de IncaStats-Data.
  echo Debe existir la carpeta TITAN_ALONSINHO_V1_GITHUB_READY.
  echo.
  pause
  exit /b 1
)

echo ============================================================
echo   INCASTATS - LIMPIEZA PLAYER PROPS ANTIGUO
echo ============================================================
echo.
echo Se borraran SOLO estas bases experimentales antiguas:
echo   data\player-props-master
echo   data\player-props-rescates-v1
echo   data\player-scout-current
echo.
echo NO se toca:
echo   data\player-props-v2
echo   TITAN_PLAYERS_CURRENT
echo   IncaStats_Caras
echo   teams_csv
echo   fixtures
echo   historic / leaderboards
echo.
choice /C SN /N /M "Continuar? [S/N]: "
if errorlevel 2 exit /b 0

for %%D in (
  "TITAN_ALONSINHO_V1_GITHUB_READY\data\player-props-master"
  "TITAN_ALONSINHO_V1_GITHUB_READY\data\player-props-rescates-v1"
  "TITAN_ALONSINHO_V1_GITHUB_READY\data\player-scout-current"
) do (
  if exist %%D (
    echo Borrando %%D
    rmdir /s /q %%D
  )
)

echo.
echo LISTO. GitHub Desktop mostrara las carpetas antiguas como eliminadas.
echo Ahora verifica que exista:
echo TITAN_ALONSINHO_V1_GITHUB_READY\data\player-props-v2\manifest.json
echo.
pause
