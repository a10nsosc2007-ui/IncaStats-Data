@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title INCASTATS - INSTALAR REAL ESRGAN
set "URL=https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip"
set "ZIP=%TEMP%\realesrgan-ncnn-vulkan-20220424-windows.zip"
set "DEST=%~dp0REAL_ESRGAN"
if exist "%DEST%\realesrgan-ncnn-vulkan.exe" goto :ok
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
echo.
echo Descargando Real-ESRGAN oficial...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%ZIP%'"
if errorlevel 1 (
 echo ERROR descargando Real-ESRGAN.
 pause
 exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%DEST%' -Force"
del /q "%ZIP%" >nul 2>&1
:ok
echo.
echo REAL-ESRGAN LISTO.
echo Ahora ejecuta 03_MEJORAR_CARAS_TURBO_Y_REEMPAQUETAR.bat
pause
