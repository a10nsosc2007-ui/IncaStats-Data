@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title INCASTATS - AUDITORIA MASTER
echo =================================================
echo        INCASTATS AUDITORIA DE CATALOGOS
echo =================================================
where py >nul 2>nul
if errorlevel 1 (echo [ERROR] Necesitas Python 3 y py. & pause & exit /b 1)
py -3 "INCA_ACTUALIZAR_CATALOGOS_MASTER.py" auditar
echo.
echo Este programa no ha cambiado datos.
pause
