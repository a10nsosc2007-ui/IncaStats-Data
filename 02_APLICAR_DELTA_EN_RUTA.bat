@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo.
echo =========================================================
echo  INCASTATS PLAYER DELTA 15D SAFE V2 - APLICAR EN RUTA
echo =========================================================
echo.
echo Este BAT busca TITAN_PLAYERS_MASTER_2025_PLUS y TITAN_PLAYERS_CURRENT
echo en esta carpeta o en carpetas superiores.
echo.
echo OPCION A: mete el ZIP DELTA en INBOX_PLAYER_DELTA y ejecuta este BAT.
echo OPCION B: arrastra el ZIP encima de este BAT.
echo.
set "ARG=%~1"
py -3 apply_player_delta.py "%ARG%"
if errorlevel 1 (
  python apply_player_delta.py "%ARG%"
)
echo.
pause
