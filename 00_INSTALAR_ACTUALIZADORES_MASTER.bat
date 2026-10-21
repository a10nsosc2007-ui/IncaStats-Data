@echo off & py -3 -x "%~f0" %* & pause & exit /b
# -*- coding: utf-8 -*-
"""Instalador liviano INCASTATS: baja scripts de GitHub, NO toca datos."""
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = "https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/incastats/actualizadores-master-v1/"
FILES = (
    "01_ACTUALIZAR_EQUIPOS_STATS.bat",
    "02_ACTUALIZAR_JUGADORES_ARBITROS.bat",
    "03_ACTUALIZAR_TODO_MASTER.bat",
    "INCA_ACTUALIZADORES/inca_master_updater.py",
    "INCA_ACTUALIZADORES/test_inca_master_updater.py",
)
print("\n" + "=" * 68)
print("INCASTATS - INSTALAR ACTUALIZADORES MASTER V1")
print("=" * 68)
print("Repositorio local:", ROOT)
print("SIN COPIAS GRANDES / SIN ZIP / SIN BACKUPS / NO MOVER TITAN")
if not (ROOT / ".git").is_dir() or not (ROOT / "TITAN_PLAYERS_CURRENT").is_dir():
    print("[ERROR] Guarda ESTE BAT dentro de la raiz de IncaStats-Data.")
    sys.exit(2)
if not (ROOT / "INCA_BASE_MAESTRA" / "BASE_EQUIPOS_MASTER.json").is_file():
    print("[ERROR] Primero confirma tu MASTER local y sus archivos.")
    sys.exit(2)
print("\nSe instalaran o actualizaran solo estos archivos de codigo:")
for item in FILES:
    print(" ", item)
if input("\nEscribe INSTALAR para continuar: ").strip() != "INSTALAR":
    print("Cancelado, no se ha tocado nada.")
    sys.exit(0)
blobs = {}
try:
    for item in FILES:
        url = BASE + item
        request = urllib.request.Request(url, headers={"User-Agent": "INCASTATS-MASTER-INSTALLER/1"})
        with urllib.request.urlopen(request, timeout=35) as response:
            data = response.read(250_001)
        if len(data) > 250_000 or len(data) < 20:
            raise RuntimeError("Descarga de tamano inesperado: " + item)
        if item.endswith(".bat") and not data.startswith(b"@echo off"):
            raise RuntimeError("Contenido BAT no valido: " + item)
        if item.endswith(".py") and b"import " not in data:
            raise RuntimeError("Contenido Python no valido: " + item)
        blobs[item] = data
        print(" DESCARGADO:", item, f"{len(data):,} bytes")
except Exception as exc:
    print("\n[ERROR DE DESCARGA] No se ha instalado ningun archivo.")
    print(exc)
    sys.exit(1)
print("\nDescargas verificadas. Guardando scripts pequenos...")
try:
    for item, data in blobs.items():
        target = ROOT / item
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".inca_install_", suffix=".tmp", dir=target.parent)
        try:
            with os.fdopen(fd, "wb") as fp:
                fp.write(data)
                fp.flush()
                os.fsync(fp.fileno())
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
except OSError as exc:
    print("[ERROR] No se pudo guardar un script. Verifica OneDrive/antivirus/permisos.")
    print(exc)
    sys.exit(1)
print("\n[OK] Instalacion de scripts completada.")
print("Puedes ejecutar 01_ACTUALIZAR_EQUIPOS_STATS.bat o 02_ACTUALIZAR_JUGADORES_ARBITROS.bat.")
print("El instalador NO ha actualizado ningun equipo, jugador, estadistica ni arbitro.")
