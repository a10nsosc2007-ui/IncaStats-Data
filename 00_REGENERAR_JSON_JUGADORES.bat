@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo.
echo =========================================================
echo  REGENERAR TITAN_DELTA_PLAYERS DESDE MASTER
 echo =========================================================
if not exist "TITAN_PLAYERS_MASTER_2025_PLUS\MASTER\PLAYER_MATCH_STATS_2025_PLUS.csv" (
  echo [ERROR] Ejecuta este BAT desde la RAIZ de IncaStats-Data.
  pause
  exit /b 2
)
py -3 "%~dp000_REGENERAR_JSON_JUGADORES.py"
if errorlevel 1 python "%~dp000_REGENERAR_JSON_JUGADORES.py"
pause
