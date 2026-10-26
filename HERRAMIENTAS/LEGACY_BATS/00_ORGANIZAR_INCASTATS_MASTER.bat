@echo off & py -3 -x "%~f0" %* & pause & exit /b
# -*- coding: utf-8 -*-
"""
INCASTATS | ORGANIZADOR LOCAL SEGURO V1
Archivo hibrido BAT + Python 3. Corre directamente desde la raiz IncaStats-Data.
NO copia, NO borra, NO extrae, NO crea ZIP, NO toca datos TITAN.
"""
from __future__ import annotations

import datetime
import json
import os
import sys
from pathlib import Path

VERSION = "1.0.0"
ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "INCA_BASE_MAESTRA"
CONTROL = MASTER / "CONTROL"
INBOX = MASTER / "ENTRADAS"
CATEGORIES = ("EQUIPOS", "JUGADORES", "ARBITROS", "MIXTAS")

TRACKED = {
    "equipos": ROOT / "TITAN_ALONSINHO_V1_GITHUB_READY" / "manifest" / "teams.json",
    "equipos_manifest": ROOT / "TITAN_ALONSINHO_V1_GITHUB_READY" / "manifest" / "manifest_global.json",
    "jugadores_current": ROOT / "TITAN_PLAYERS_CURRENT" / "manifest.json",
    "jugadores_historicos": ROOT / "TITAN_PLAYERS_MASTER_2025_PLUS" / "manifest.json",
    "arbitros": ROOT / "TITAN_REFEREES_CURRENT" / "manifest.json",
    "master_equipos": MASTER / "BASE_EQUIPOS_MASTER.json",
    "master_jugadores": MASTER / "BASE_JUGADORES_MASTER.json",
}
HEAVY = {
    "exportaciones_viejas": MASTER / "EXPORTACIONES",
    "respaldos_master_viejos": MASTER / "RESPALDOS",
    "respaldos_player_viejos": ROOT / "_BACKUPS_PLAYER_DELTA",
}
BLOCKED_SOURCE_NAMES = {
    ".git", "INCA_BASE_MAESTRA", "TITAN_ALONSINHO_V1_GITHUB_READY",
    "TITAN_ALONSINHO_DATA", "TITAN_PLAYERS_CURRENT",
    "TITAN_PLAYERS_MASTER_2025_PLUS", "TITAN_PLAYERS_FACES_CURRENT",
    "TITAN_LOGOS", "TITAN_LOGOS_COMP", "TITAN_REFEREES_CURRENT",
    "INBOX_PLAYER_DELTA", "TOOLS_PLAYER_DELTA", "_BACKUPS_PLAYER_DELTA",
    "_PLAYER_DELTA_AUDIT", "ACTUALIZADORES",
}

def banner():
    print("\n" + "=" * 70)
    print(" INCASTATS | ORGANIZADOR MASTER SEGURO V" + VERSION)
    print("=" * 70)
    print(" RUTA:", ROOT)
    print(" POLITICA: SIN COPIAS / SIN BACKUPS / SIN ZIPS / SIN BORRADOS\n")

def safe_json(path):
    try:
        if not path.is_file():
            return None
        with path.open("r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (ValueError, OSError, UnicodeError) as exc:
        print(" [ADVERTENCIA] JSON no legible:", path.name, str(exc)[:120])
        return None

def get_team_ids(payload):
    if payload is None:
        return None
    obj = payload
    if isinstance(obj, dict):
        for key in ("teams", "equipos", "clubs", "items", "records", "data"):
            val = obj.get(key)
            if isinstance(val, list):
                obj = val
                break
            if isinstance(val, dict):
                obj = val
                break
    if isinstance(obj, list):
        ids = set()
        for item in obj:
            if not isinstance(item, dict):
                continue
            v = next((item[k] for k in ("team_id", "Team_ID", "ID_Equipo", "sofascore_id", "id") if item.get(k) is not None), None)
            if v is not None and str(v).strip():
                ids.add(str(v).strip())
        return ids if ids else None
    if isinstance(obj, dict):
        numeric = {str(k) for k, v in obj.items() if str(k).isdigit() and isinstance(v, dict)}
        if numeric:
            return numeric
    return None

def get_player_count(payload):
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        for key in ("players", "jugadores", "items", "records"):
            if isinstance(payload.get(key), list):
                return len(payload[key])
        for key in ("count", "player_count", "total"):
            if isinstance(payload.get(key), int):
                return payload[key]
    return None

def dir_size(path):
    if not path.exists():
        return 0, 0
    size = 0
    count = 0
    for base, dirs, files in os.walk(path, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(base) / d).is_symlink()]
        for name in files:
            p = Path(base) / name
            try:
                if p.is_symlink():
                    continue
                size += p.stat().st_size
                count += 1
            except OSError:
                pass
    return size, count

def fmt(n):
    return f"{n / (1024 ** 3):,.2f} GB" if n >= 1024 ** 3 else f"{n / (1024 ** 2):,.1f} MB"

def report():
    legacy = safe_json(TRACKED["equipos"])
    master = safe_json(TRACKED["master_equipos"])
    ids_old = get_team_ids(legacy)
    ids_new = get_team_ids(master)
    new_ids = sorted(ids_new - ids_old) if ids_old is not None and ids_new is not None else None
    j = safe_json(TRACKED["master_jugadores"])
    master_player_count = get_player_count(j)
    refs = safe_json(TRACKED["arbitros"])
    old_manifest = safe_json(TRACKED["equipos_manifest"])
    backups = {k: {"exists": p.exists(), "bytes": dir_size(p)[0], "files": dir_size(p)[1]}
               for k, p in HEAVY.items()}
    result = {
        "schema": "incastats.organizador.audit.v1",
        "generated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repo": str(ROOT),
        "master_exists": MASTER.is_dir(),
        "master_teams_count": len(ids_new) if ids_new is not None else None,
        "legacy_teams_count": len(ids_old) if ids_old is not None else None,
        "new_team_ids_vs_legacy": new_ids,
        "master_players_count": master_player_count,
        "arbitros_manifest_count": refs.get("referee_count") if isinstance(refs, dict) else None,
        "legacy_matches_count": (old_manifest.get("counts") or {}).get("unique_matches") if isinstance(old_manifest, dict) else None,
        "files": {k: {"exists": p.is_file(), "bytes": p.stat().st_size if p.is_file() else 0}
                  for k, p in TRACKED.items()},
        "existing_heavy_folders": backups,
        "native_data_will_not_move": [
            "TITAN_ALONSINHO_V1_GITHUB_READY", "TITAN_PLAYERS_CURRENT",
            "TITAN_PLAYERS_MASTER_2025_PLUS", "TITAN_REFEREES_CURRENT", "TITAN_LOGOS_COMP"
        ],
        "policy": "No se copian, borran ni migran los TITAN; importaciones futuras solo se trasladan explicitamente."
    }
    print(" [AUDITORIA]")
    print("  MASTER local:", "SI" if MASTER.is_dir() else "NO")
    print("  Equipos TITAN:", result["legacy_teams_count"] if result["legacy_teams_count"] is not None else "sin lectura")
    print("  Equipos MASTER:", result["master_teams_count"] if result["master_teams_count"] is not None else "formato no reconocido")
    print("  IDs adicionales:", len(new_ids) if new_ids is not None else "no verificable")
    print("  Jugadores MASTER:", master_player_count if master_player_count is not None else "no verificable")
    print("  Arbitros TITAN:", result["arbitros_manifest_count"])
    for k, val in backups.items():
        if val["exists"]:
            print("  REVISAR (sin borrar):", k, fmt(val["bytes"]), val["files"], "archivos")
    if new_ids is not None and len(new_ids) != 31:
        print(" [NOTA] No se asume que haya exactamente 31 nuevos. Revisar IDs.")
    if not MASTER.is_dir():
        print(" [BLOQUEO] La BASE MAESTRA no existe en esta carpeta. No se creara vacia.")
    return result

def write_json_atomic(path, payload):
    tmp = path.with_name(path.name + ".incatmp")
    if tmp.exists():
        raise RuntimeError("Existe temporal anterior; revisar antes de ejecutar: " + str(tmp))
    with tmp.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)

def ensure_ignore():
    path = ROOT / ".gitignore"
    old = path.read_text(encoding="utf-8") if path.exists() else ""
    rules = (
        "/INCA_BASE_MAESTRA/EXPORTACIONES/",
        "/INCA_BASE_MAESTRA/RESPALDOS/",
        "/_BACKUPS_PLAYER_DELTA/",
        "/__pycache__/",
        "**/__pycache__/",
        "*.incatmp",
    )
    missing = [v for v in rules if v not in old.splitlines()]
    if missing:
        with path.open("a", encoding="utf-8", newline="\n") as f:
            f.write(("\n" if old and not old.endswith("\n") else "") + "\n# INCASTATS: temporales y respaldos antiguos (no se borran)\n")
            f.write("\n".join(missing) + "\n")
        print("  .gitignore: agregadas", len(missing), "reglas")
    else:
        print("  .gitignore: ya configurado")
    print("  Aviso: .gitignore NO desversiona archivos previamente rastreados.")

def apply_order():
    if not MASTER.is_dir():
        print(" [CANCELADO] No existe INCA_BASE_MAESTRA en esta PC.")
        return
    answer = input("\n Para crear SOLO estructura y reportes, escribe ORDENAR: ").strip()
    if answer != "ORDENAR":
        print(" [CANCELADO] No se modifico nada.")
        return
    CONTROL.mkdir(exist_ok=True)
    for category in CATEGORIES:
        (INBOX / category).mkdir(parents=True, exist_ok=True)
    data = report()
    write_json_atomic(CONTROL / "AUDITORIA_ACTUAL.json", data)
    refs = {
        "schema": "incastats.rutas.central.v1",
        "base": "INCA_BASE_MAESTRA",
        "equipos_native": "TITAN_ALONSINHO_V1_GITHUB_READY",
        "jugadores_current": "TITAN_PLAYERS_CURRENT",
        "jugadores_historicos": "TITAN_PLAYERS_MASTER_2025_PLUS",
        "arbitros_native": "TITAN_REFEREES_CURRENT",
        "logos_competiciones": "TITAN_LOGOS_COMP",
        "master_equipos": "INCA_BASE_MAESTRA/BASE_EQUIPOS_MASTER.json",
        "master_jugadores": "INCA_BASE_MAESTRA/BASE_JUGADORES_MASTER.json",
        "bandeja_equipos": "INCA_BASE_MAESTRA/ENTRADAS/EQUIPOS",
        "bandeja_jugadores": "INCA_BASE_MAESTRA/ENTRADAS/JUGADORES",
        "bandeja_arbitros": "INCA_BASE_MAESTRA/ENTRADAS/ARBITROS",
        "warning": "Estas rutas registran las fuentes actuales; no cambian las rutas que consume la app."
    }
    routes_path = CONTROL / "RUTAS_ACTIVAS.json"
    if routes_path.exists():
        prior = safe_json(routes_path)
        if not isinstance(prior, dict) or prior.get("schema") != refs["schema"]:
            print(" [AVISO] RUTAS_ACTIVAS.json ajeno: no se sobrescribe.")
        else:
            write_json_atomic(routes_path, refs)
    else:
        write_json_atomic(routes_path, refs)
    ensure_ignore()
    print("\n [LISTO] Organizacion logica aplicada SIN tocar archivos TITAN.")
    print("  Auditoria:", CONTROL / "AUDITORIA_ACTUAL.json")
    print("  Rutas:", routes_path)
    print("  Nuevas extracciones: INCA_BASE_MAESTRA/ENTRADAS/")
    print("  No se copiaron, eliminaron ni comprimieron archivos.")

def under(p, base):
    try:
        return os.path.commonpath([os.path.normcase(str(p.resolve())),
                                   os.path.normcase(str(base.resolve()))]) == os.path.normcase(str(base.resolve()))
    except (ValueError, OSError):
        return False

def move_incoming():
    if not MASTER.is_dir():
        print(" [CANCELADO] Falta MASTER; ejecuta auditoria.")
        return
    print("\n Mueve una EXTRACCION NUEVA a una bandeja central.")
    print(" NO fusiona las estadisticas ni toca datos TITAN existentes.")
    for i, cat in enumerate(CATEGORIES, 1):
        print(f" {i}. {cat}")
    rawcat = input(" Tipo (1-4): ").strip()
    if rawcat not in ("1", "2", "3", "4"):
        print(" [CANCELADO] Tipo no valido.")
        return
    cat = CATEGORIES[int(rawcat) - 1]
    raw = input(" Ruta de archivo o carpeta NUEVA (puedes arrastrarla): ").strip().strip('"')
    if not raw:
        return
    src = Path(raw).expanduser().resolve()
    if not src.exists() or src.is_symlink():
        print(" [ERROR] Origen inexistente o enlace simbolico:", src)
        return
    if src == ROOT or src == MASTER or under(src, MASTER):
        print(" [BLOQUEO] No se mueve una ruta que ya esta dentro del MASTER.")
        return
    if under(ROOT, src):
        print(" [BLOQUEO] El origen contiene el repositorio completo.")
        return
    if under(src, ROOT) and src.parent == ROOT and src.name.upper() in {n.upper() for n in BLOCKED_SOURCE_NAMES}:
        print(" [BLOQUEO] Ruta nativa protegida. No romper TITAN ni scripts.")
        return
    if src.is_dir() and (src / ".git").exists():
        print(" [BLOQUEO] No se trasladan repositorios Git enteros.")
        return
    dest_dir = INBOX / cat
    dest_dir.mkdir(parents=True, exist_ok=True)
    dst = dest_dir / src.name
    if dst.exists():
        print(" [BLOQUEO] Ya existe destino. No se sobrescribe:", dst)
        return
    try:
        if src.stat().st_dev != dest_dir.stat().st_dev:
            print(" [BLOQUEO] Discos/volumenes distintos. Copiar estaba prohibido.")
            return
    except OSError as exc:
        print(" [ERROR] No se puede comprobar el volumen:", exc)
        return
    print("\n ORIGEN:", src)
    print(" DESTINO:", dst)
    print(" OPERACION: os.rename (mover, NO copiar).")
    if input(" Escribe MOVER para continuar: ").strip() != "MOVER":
        print(" [CANCELADO] Sin cambios.")
        return
    was_file = src.is_file()
    old_size = src.stat().st_size if was_file else None
    try:
        src.rename(dst)
        if not dst.exists() or src.exists():
            raise RuntimeError("Comprobacion de existencia tras traslado no superada.")
        if was_file and dst.stat().st_size != old_size:
            raise RuntimeError("Tamano modificado inesperadamente: revisar destino.")
    except (OSError, RuntimeError) as exc:
        print(" [ERROR] Traslado no completado o necesita revision:", exc)
        return
    print("\n [LISTO] TRASLADADO (no copiado):", dst)
    print(" [PENDIENTE] El archivo esta en ENTRADAS; todavia NO ha sido fusionado a los JSON/CSV.")

def main():
    banner()
    if not (ROOT / ".git").is_dir() or not (ROOT / "TITAN_PLAYERS_CURRENT").is_dir():
        print(" [BLOQUEO] Pon ESTE BAT directamente en la raiz del clon IncaStats-Data.")
        print(" Deben existir .git y TITAN_PLAYERS_CURRENT en esa misma carpeta.")
        return 2
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if arg not in ("auditar", "ordenar", "mover"):
        print(" 1 = AUDITAR TODO (solo lectura)")
        print(" 2 = ORDENAR MASTER (estructura ligera + manifest y .gitignore)")
        print(" 3 = MOVER EXTRACCION NUEVA al MASTER (cortar/pegar, no copiar)")
        arg = {"1": "auditar", "2": "ordenar", "3": "mover"}.get(input("\n Elige 1, 2 o 3: ").strip(), "")
    if arg == "auditar":
        report()
    elif arg == "ordenar":
        apply_order()
    elif arg == "mover":
        move_incoming()
    else:
        print(" Operacion cancelada.")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(" [ERROR CONTROLADO]", type(exc).__name__, str(exc))
        sys.exit(1)
