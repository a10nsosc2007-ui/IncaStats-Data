@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas Node.js instalado para ejecutar este actualizador.
  pause
  exit /b 1
)
if "%~1"=="" (
  node "%~dp0tools\unified\setup.cjs"
  if errorlevel 1 goto failed
  echo Carga los TRES JSON de ENTRADAS_EXTRACTOR en el panel de SofaScore.
  echo Para actualizar: arrastra el RESULTADO descargado sobre este BAT.
  echo El CHECKPOINT solo sirve para restaurar la extraccion.
  start "" notepad.exe "%~dp0EXTRACTOR_UNICO_SOFA.js"
  pause
  exit /b 0
)
node --max-old-space-size=4096 "%~dp0tools\unified\sync.cjs" "%~1" --check
if errorlevel 1 goto failed
node --max-old-space-size=4096 "%~dp0tools\unified\sync.cjs" "%~1"
if errorlevel 1 goto failed
echo Repositorio local y aplicacion actualizados. Recarga tu aplicacion.
echo Revisa los cambios en GitHub Desktop antes de publicar.
echo Tu historico anterior tiene copia en .backups.
pause
exit /b 0
:failed
echo No se completo la actualizacion. Revisa el error mostrado arriba.
pause
exit /b 1
