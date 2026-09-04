@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo.
echo =========================================================
echo  INCASTATS PLAYER DATA - VALIDAR REPO V5
echo =========================================================
echo.
if not exist "TITAN_PLAYERS_MASTER_2025_PLUS\MASTER\PLAYER_MATCH_STATS_2025_PLUS.csv" (
  echo [ERROR] Este BAT debe estar en la RAIZ de IncaStats-Data.
  pause
  exit /b 2
)
py -3 "%~dp0validate_player_data.py"
if errorlevel 1 python "%~dp0validate_player_data.py"
if errorlevel 1 (
  echo.
  echo [ERROR] Validacion con problemas.
  pause
  exit /b 1
)
echo.
echo [OK] Validacion terminada.
pause
