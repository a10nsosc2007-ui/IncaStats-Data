@echo off
setlocal
title INCASTATS - AUDITORIA SEGURA

set "INCA_ROOT=%~dp0"

echo.
echo ==========================================
echo       INCASTATS - AUDITORIA GENERAL
echo ==========================================
echo.
echo Analizando repositorio...
echo No se modificara ningun archivo.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$root=$env:INCA_ROOT; $out=Join-Path $env:TEMP 'INCASTATS_AUDITORIA.txt';" ^
"'INCASTATS - AUDITORIA DEL REPOSITORIO' | Set-Content $out -Encoding UTF8;" ^
"'RUTA: '+$root | Add-Content $out;" ^
"'FECHA: '+(Get-Date) | Add-Content $out;" ^
"'' | Add-Content $out;" ^
"'=== CARPETAS PRINCIPALES ===' | Add-Content $out;" ^
"Get-ChildItem -LiteralPath $root -Directory -Force | Sort-Object Name | ForEach-Object {$_.Name} | Add-Content $out;" ^
"'' | Add-Content $out;" ^
"'=== ARCHIVOS POR EXTENSION ===' | Add-Content $out;" ^
"$files=Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue;" ^
"$files | Group-Object Extension | Sort-Object Count -Descending | Select-Object Name,Count | Format-Table -AutoSize | Out-String | Add-Content $out;" ^
"'' | Add-Content $out;" ^
"'=== 30 ARCHIVOS MAS GRANDES ===' | Add-Content $out;" ^
"$files | Sort-Object Length -Descending | Select-Object -First 30 @{N='MB';E={[math]::Round($_.Length/1MB,2)}},FullName | Format-Table -Wrap | Out-String -Width 300 | Add-Content $out;" ^
"'' | Add-Content $out;" ^
"'=== BASE MAESTRA ===' | Add-Content $out;" ^
"$master=Join-Path $root 'INCA_BASE_MAESTRA';" ^
"if(Test-Path $master){Get-ChildItem $master -Force | Select-Object Name,Length | Format-Table | Out-String | Add-Content $out}else{'NO ENCONTRADA' | Add-Content $out};" ^
"Write-Host ('AUDITORIA GENERADA: '+$out); Start-Process notepad.exe -ArgumentList $out"

echo.
echo Auditoria finalizada.
pause