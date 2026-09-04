@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo =========================================================
echo  INCASTATS PLAYER DELTA - APLICAR DESDE RAIZ DEL REPO V5
echo =========================================================
echo Repo local: %CD%
echo.

if not exist "TITAN_PLAYERS_MASTER_2025_PLUS\MASTER\PLAYER_MATCH_STATS_2025_PLUS.csv" (
  echo [ERROR] Este BAT debe estar en la RAIZ de IncaStats-Data.
  echo [ERROR] No encuentro TITAN_PLAYERS_MASTER_2025_PLUS\MASTER\PLAYER_MATCH_STATS_2025_PLUS.csv
  echo.
  echo Copia 02_APLICAR_PLAYER_DELTA.bat y apply_player_delta.py a:
  echo   ...\IncaStats-Data\
  echo.
  pause
  exit /b 2
)

if not exist "INBOX_PLAYER_DELTA" mkdir "INBOX_PLAYER_DELTA"

if "%~1"=="" (
  py -3 "%~dp0apply_player_delta.py"
  if errorlevel 1 python "%~dp0apply_player_delta.py"
) else (
  py -3 "%~dp0apply_player_delta.py" "%~1"
  if errorlevel 1 python "%~dp0apply_player_delta.py" "%~1"
)

if errorlevel 1 (
  echo.
  echo [ERROR] No se aplico el DELTA. Revisa el mensaje de arriba.
  pause
  exit /b 1
)

echo.
echo [OK] DELTA aplicado en este repo local.
where git >nul 2>nul
if not errorlevel 1 (
  git rev-parse --is-inside-work-tree >nul 2>nul
  if not errorlevel 1 (
    echo.
    echo Cambios Git pendientes:
    git status --short
  )
)
echo.
pause
