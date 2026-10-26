@echo off & title INCASTATS MASTER - AUDITAR & py -3 -x "%~f0" auditar & echo. & pause & exit /b
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""INCASTATS Master Catalog Updater V1 — Python stdlib, zero APIs.

Catalogs validated:
  INCA_BASE_MAESTRA/BASE_EQUIPOS_MASTER.json    {schema,count,teams:[{team_id,...}]}
  INCA_BASE_MAESTRA/BASE_JUGADORES_MASTER.json  {schema,count,players:[{id,...}]}

Only the two JSON catalog schemas are changed. Stats and referee native datasets
are not modified until their incremental merge schemas are separately validated.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "INCA_BASE_MAESTRA"
KINDS = {
    "equipos": {
        "target": MASTER / "BASE_EQUIPOS_MASTER.json",
        "bucket": "EQUIPOS",
        "array": "teams",
        "key": "team_id",
        "schema": "incastats.master.teams.v1",
        "aliases": ("team_id", "Team_ID"),
    },
    "jugadores": {
        "target": MASTER / "BASE_JUGADORES_MASTER.json",
        "bucket": "JUGADORES",
        "array": "players",
        "key": "id",
        "schema": "incastats.master.players.v1",
        "aliases": ("id", "Player_ID", "ID_Jugador"),
    },
}

def read_json_bytes(raw, label):
    try:
        obj = json.loads(raw.decode("utf-8-sig"))
    except (ValueError, UnicodeError) as exc:
        raise RuntimeError(f"JSON invalido ({label}): {exc}") from exc
    return obj

def read_json(p):
    return read_json_bytes(p.read_bytes(), str(p))

def canon(value):
    if isinstance(value, bool) or value is None:
        return ""
    v = str(value).strip()
    return str(int(v)) if v.isdigit() else v

def extract(obj, kind, label):
    conf = KINDS[kind]
    if isinstance(obj, dict):
        if conf["array"] not in obj:
            raise RuntimeError(f"{label}: falta arreglo '{conf['array']}'")
        arr = obj[conf["array"]]
    elif isinstance(obj, list):
        arr = obj
    else:
        raise RuntimeError(f"{label}: JSON debe ser objeto o lista")
    if not isinstance(arr, list):
        raise RuntimeError(f"{label}: {conf['array']} no es lista")
    out = {}
    for pos, item in enumerate(arr, 1):
        if not isinstance(item, dict):
            raise RuntimeError(f"{label}: registro {pos} no es objeto")
        ident = ""
        for field in conf["aliases"]:
            if item.get(field) is not None:
                ident = canon(item[field])
                if ident:
                    break
        if not ident:
            raise RuntimeError(f"{label}: registro {pos} sin ID")
        if ident in out:
            raise RuntimeError(f"{label}: ID repetido dentro del mismo lote: {ident}")
        record = dict(item)
        # Normalize aliases into the canonical key. Preserve the other metadata.
        record[conf["key"]] = int(ident) if kind == "equipos" and ident.isdigit() else ident
        out[ident] = record
    return out

def merge(old, new, kind):
    updated = dict(old)
    inserted = changed = 0
    conflicts = []
    for ident, rec in new.items():
        if ident not in updated:
            updated[ident] = rec
            inserted += 1
            continue
        base = dict(updated[ident])
        # Key immutable; missing/blank incoming fields never erase existing data.
        # New metadata can refresh existing catalog fields when present.
        if rec.get("name") and base.get("name") and str(rec["name"]).casefold() != str(base["name"]).casefold():
            conflicts.append({"id": ident, "original": base["name"], "nuevo": rec["name"]})
            # Keep original name; manual review required for name conflicts.
            rec = dict(rec)
            rec.pop("name")
        for field, value in rec.items():
            if field in ("id", "team_id", "in_existing_inca") and field != KINDS[kind]["key"]:
                continue
            if field == KINDS[kind]["key"]:
                continue
            if value is not None and value != "" and value != [] and value != {}:
                base[field] = value
        if base != updated[ident]:
            changed += 1
            updated[ident] = base
    return updated, inserted, changed, conflicts

def atomic_write(path, obj):
    raw = (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if path.is_file() and path.read_bytes() == raw:
        return False
    temporary = path.with_name(path.name + ".incatmp")
    if temporary.exists():
        raise RuntimeError("Temporal existente; revisar antes de continuar: " + str(temporary))
    try:
        with temporary.open("xb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            # Only remove temporary created by this operation.
            temporary.unlink()
    return True

def catalog_candidates(src, kind):
    if not src.exists():
        raise RuntimeError("No existe entrada: " + str(src))
    # A fresh list per file — team and player JSON must be separate and explicit.
    names = {"equipos": {"BASE_EQUIPOS_MASTER.json", "teams.json", "equipos.json",
                         "BASE_EQUIPOS_REUTILIZABLE.json"},
             "jugadores": {"BASE_JUGADORES_MASTER.json", "players.json", "jugadores.json",
                           "BASE_JUGADORES_REUTILIZABLE.json"}}[kind]
    if src.is_file() and src.suffix.lower() == ".json":
        yield src.name, src.read_bytes()
    elif src.is_file() and src.suffix.lower() == ".zip":
        with zipfile.ZipFile(src) as z:
            paths = [i for i in z.infolist()
                     if not i.is_dir() and i.filename.split("/")[-1] in names]
            if not paths:
                raise RuntimeError("ZIP sin catalogo compatible " + kind + ". No se importo.")
            if len(paths) > 1:
                raise RuntimeError("ZIP con varios catalogos " + kind + "; seleccion ambigua. Nada modificado.")
            info = paths[0]
            if info.file_size > 25 * 1024 * 1024:
                raise RuntimeError("Catalogo supera limite de 25 MB descomprimidos.")
            yield info.filename, z.read(info)
    elif src.is_dir():
        options = [p for p in src.rglob("*.json") if p.name in names and p.is_file()]
        if len(options) != 1:
            raise RuntimeError(f"Directorio con {len(options)} catalogos {kind}, se requiere exactamente uno.")
        p = options[0]
        if p.stat().st_size > 25 * 1024 * 1024:
            raise RuntimeError("Catalogo supera 25 MB.")
        yield str(p), p.read_bytes()
    else:
        raise RuntimeError("Entrada debe ser .json, .zip o carpeta.")

def run(kind, src, apply, allow_conflicts):
    conf = KINDS[kind]
    target = conf["target"]
    if not target.is_file():
        raise RuntimeError("Falta MASTER; no se va a crear vacio: " + str(target))
    existing = read_json(target)
    if not isinstance(existing, dict) or existing.get("schema") != conf["schema"]:
        raise RuntimeError(f"Schema no esperado en {target.name}; operacion bloqueada.")
    old = extract(existing, kind, "MASTER " + kind)
    if int(existing.get("count", -1)) != len(old):
        raise RuntimeError(f"MASTER {kind}: count declarado distinto de IDs unicos.")
    sources = list(catalog_candidates(src, kind))
    if len(sources) != 1:
        raise RuntimeError("Numero ambiguo de entradas compatibles")
    label, raw = sources[0]
    incoming = extract(read_json_bytes(raw, label), kind, label)
    merged, added, changed, conflicts = merge(old, incoming, kind)
    print("\n",kind.upper())
    print(" MASTER ANTES", len(old), "| ENTRADA",len(incoming), "| NUEVOS",added, "| ACTUALIZADOS",changed)
    print(" RESULTADO",len(merged),"| COLISIONES DE NOMBRE",len(conflicts))
    for c in conflicts[:15]:
        print("  [REVISAR]",c)
    if conflicts and not allow_conflicts:
        print(" [BLOQUEADO] Nombres discordantes; revisa antes de aplicar. No se modifico el MASTER.")
        return 3
    if not apply:
        print(" [PREVISUALIZACION] 0 archivos modificados. Para aplicar usa --aplicar.")
        return 0
    if input(" Escribe APLICAR para escribir el catalogo (sin backup): ").strip() != "APLICAR":
        print(" [CANCELADO] 0 cambios")
        return 4
    payload = dict(existing)
    payload[conf["array"]] = list(merged.values())
    payload["count"] = len(merged)
    # Preserve existing schema and additional metadata fields.
    changed_disk = atomic_write(target, payload)
    check = read_json(target)
    after = extract(check, kind, "POST-ESCRITURA")
    if len(after) != len(merged) or not set(old).issubset(after):
        raise RuntimeError("FALLO validacion posterior: revisar archivo MASTER")
    print(" [OK]",target, "| escrito:",changed_disk, "| IDs:",len(after))
    print(" [IMPORTANTE] Este proceso NO incorpora automaticamente estadisticas, logos ni fotos.")
    return 0

def main():
    ap = argparse.ArgumentParser(description="Actualizador seguro de catalogos INCA MASTER.")
    ap.add_argument("tipo",choices=tuple(KINDS)+("auditar",))
    ap.add_argument("entrada", nargs="?")
    ap.add_argument("--aplicar",action="store_true")
    ap.add_argument("--permitir-conflictos",action="store_true")
    a = ap.parse_args()
    if not (ROOT / ".git").is_dir() or not MASTER.is_dir():
        raise RuntimeError("Este script debe estar en la RAIZ local de IncaStats-Data, con .git y MASTER.")
    if a.tipo == "auditar":
        for kind, conf in KINDS.items():
            p = conf["target"]
            ids = extract(read_json(p),kind,p.name)
            print(kind,":",len(ids),"IDs en el catalogo actual")
        print("Fuente nativa arbitros: TITAN_REFEREES_CURRENT (sin cambios)")
        return 0
    if a.entrada:
        src = Path(a.entrada.strip('"')).expanduser()
    else:
        print("Arrastra un JSON, ZIP o carpeta que contenga el catalogo",a.tipo)
        val = input(" RUTA: ").strip().strip('"')
        if not val:
            return 4
        src = Path(val).expanduser()
    return run(a.tipo, src.resolve(), a.aplicar, a.permitir_conflictos)

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("\n [ERROR] SIN CONTINUAR:",type(exc).__name__,str(exc))
        sys.exit(2)
