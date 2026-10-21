#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""INCASTATS MASTER · actualizador incremental V1 (stdlib, sin backups ni ZIP de salida).
Dry-run y confirmacion antes de aplicar; nunca altera los masters historicos nativos.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "INCA_BASE_MAESTRA"
TITAN = ROOT / "TITAN_ALONSINHO_V1_GITHUB_READY"
TEAM_CATALOG = MASTER / "BASE_EQUIPOS_MASTER.json"
PLAYER_CATALOG = MASTER / "BASE_JUGADORES_MASTER.json"
NATIVE_TEAMS = TITAN / "manifest" / "teams.json"
NATIVE_PLAYER_FILES = [
    ROOT / "TITAN_PLAYERS_MASTER_2025_PLUS/MASTER/PLAYER_MATCH_STATS_2025_PLUS.csv",
    ROOT / "TITAN_PLAYERS_CURRENT/MASTER/PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv",
]
NATIVE_REF_MATCHES = ROOT / "TITAN_REFEREES_CURRENT/matches_master.csv"
NATIVE_REF_INDEX = ROOT / "TITAN_REFEREES_CURRENT/referees_master.csv"
NEW_PLAYER_STATS = MASTER / "JUGADORES/ESTADISTICAS/DELTA_PARTIDOS.csv"
NEW_REF_MATCHES = MASTER / "ARBITROS/DELTA_PARTIDOS.csv"
NEW_REF_INDEX = MASTER / "ARBITROS/DELTA_ARBITROS.csv"
MAX_ENTRY_BYTES = 100 * 1024 * 1024
MAX_INPUT_BYTES = 240 * 1024 * 1024
MAX_ENTRIES = 12000
SKIP_DIRS = {".git", "EXPORTACIONES", "RESPALDOS", "_BACKUPS_PLAYER_DELTA", "__pycache__"}

def die(message):
    raise RuntimeError(message)

def valid_id(v):
    val = str(v if v is not None else "").strip()
    return val if val.isdecimal() and int(val) > 0 else ""

def text_val(v):
    return str(v if v is not None else "").strip()

def nonblank(v):
    return v is not None and str(v).strip() != ""

def read_json_file(path):
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)

def indexed(items, key, label):
    result = {}
    for row in items:
        if not isinstance(row, dict):
            die(label + ": elemento que no es objeto JSON")
        ident = valid_id(row.get(key))
        if not ident:
            die(label + ": registro sin ID " + key)
        if ident in result:
            die(label + ": ID duplicado " + ident)
        result[ident] = dict(row)
    return result

def read_csv_bytes(raw, label):
    decoded = raw.decode("utf-8-sig")
    rd = csv.DictReader(io.StringIO(decoded, newline=""))
    fields = rd.fieldnames
    if not fields or any(not f for f in fields):
        die(label + ": encabezado CSV vacio o invalido")
    rows = list(rd)
    if not all(None not in row for row in rows):
        die(label + ": fila con mas columnas que encabezados")
    return list(fields), rows

def read_csv_file(path):
    if not path.exists():
        return [], []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rd = csv.DictReader(f)
        fields = list(rd.fieldnames or [])
        if not fields:
            die("CSV existente sin encabezado: " + str(path))
        rows = list(rd)
    return fields, rows

def iter_sources(path):
    """Lee solo JSON/CSV de una extraccion; no descomprime un ZIP en el disco."""
    total, count = 0, 0
    if path.is_file() and path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as arc:
            names = [e for e in arc.infolist() if not e.is_dir()
                     and Path(e.filename).suffix.lower() in (".csv", ".json")
                     and not any(p.upper() in {x.upper() for x in SKIP_DIRS}
                                 for p in Path(e.filename).parts)]
            if len(names) > MAX_ENTRIES:
                die("ZIP demasiado grande en numero de entradas; dividir la extraccion")
            for entry in names:
                if ".." in Path(entry.filename).parts or entry.file_size > MAX_ENTRY_BYTES:
                    die("Entrada ZIP insegura o demasiado grande: " + entry.filename)
                total += entry.file_size
                if total > MAX_INPUT_BYTES:
                    die("Demasiados datos en un solo lote. Dividir la extraccion.")
                with arc.open(entry) as f:
                    raw = f.read(MAX_ENTRY_BYTES + 1)
                if len(raw) > MAX_ENTRY_BYTES:
                    die("Entrada ZIP supera el limite: " + entry.filename)
                yield entry.filename.replace("\\", "/"), raw
    elif path.is_dir():
        for base, dirs, files in os.walk(path, followlinks=False):
            dirs[:] = [d for d in sorted(dirs) if d not in SKIP_DIRS
                      and not (Path(base) / d).is_symlink()]
            for name in sorted(files):
                fpath = Path(base) / name
                if fpath.is_symlink() or fpath.suffix.lower() not in (".csv", ".json"):
                    continue
                count += 1
                if count > MAX_ENTRIES:
                    die("Demasiados archivos; divide la extraccion")
                size = fpath.stat().st_size
                total += size
                if size > MAX_ENTRY_BYTES or total > MAX_INPUT_BYTES:
                    die("Extraccion demasiado grande; divide el lote: " + str(fpath))
                yield fpath.relative_to(path).as_posix(), fpath.read_bytes()
    elif path.is_file() and path.suffix.lower() in (".csv", ".json"):
        if path.stat().st_size > MAX_ENTRY_BYTES:
            die("Archivo de entrada demasiado grande; dividir")
        yield path.name, path.read_bytes()
    else:
        die("Entrada no compatible: debe ser carpeta, ZIP, JSON o CSV")

def merge_record(old, delta, *, player=False):
    ans = dict(old)
    older = player and text_val(delta.get("last_date")) and text_val(old.get("last_date")) \
        and str(delta["last_date"]) < str(old["last_date"])
    for key, value in delta.items():
        if key in ("id", "team_id") and (not player or key == "id"):
            continue
        if key == "in_existing_inca" and old:
            continue
        if older and key in ("team_id", "team", "position", "last_date", "competition_id"):
            continue
        if nonblank(value):
            ans[key] = value
        elif key not in ans:
            ans[key] = value
    return ans

def csv_key(row, keys, label):
    parts = []
    for key in keys:
        item = text_val(row.get(key))
        if not item:
            die(label + ": fila sin " + key)
        parts.append(item)
    return tuple(parts)

def merge_csv_rows(existing, incoming, fields, keys, label):
    out = {}
    for row in existing:
        key = csv_key(row, keys, label + " existente")
        if key in out:
            die(label + ": clave duplicada en el MASTER " + str(key))
        out[key] = dict(row)
    before = len(out)
    changed = 0
    added = 0
    for row in incoming:
        key = csv_key(row, keys, label + " entrada")
        previous = out.get(key)
        if previous is None:
            out[key] = {field: row.get(field, "") for field in fields}
            added += 1
        else:
            merged = dict(previous)
            for field in fields:
                if nonblank(row.get(field)):
                    merged[field] = row[field]
            if merged != previous:
                out[key] = merged
                changed += 1
    if len(out) < before:
        die(label + ": verificacion historica fallida")
    return list(out.values()), added, changed

def serialize_csv(fields, rows):
    result = io.StringIO(newline="")
    wr = csv.DictWriter(result, fields, extrasaction="ignore", lineterminator="\n")
    wr.writeheader()
    wr.writerows(rows)
    return result.getvalue().encode("utf-8-sig")

def serialize_json(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

class Plan:
    def __init__(self):
        self.data = {}
        self.stat = []
    def add(self, dest, contents, message):
        if dest in self.data:
            die("Destinos duplicados en el plan: " + str(dest))
        if dest.exists() and dest.read_bytes() == contents:
            self.stat.append("[IGUAL] " + message)
            return
        self.data[dest] = contents
        self.stat.append(("[ACTUALIZAR] " if dest.exists() else "[CREAR] ") + message)
    def execute(self):
        for dest, raw in self.data.items():
            dest.parent.mkdir(parents=True, exist_ok=True)
            fd, temp = tempfile.mkstemp(prefix=".inca_", suffix=".tmp", dir=dest.parent)
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(raw)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(temp, dest)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)

def native_team_paths():
    cat = read_json_file(NATIVE_TEAMS) if NATIVE_TEAMS.is_file() else {}
    result = {}
    for row in cat.get("teams", []):
        tid = valid_id(row.get("team_id"))
        rel = str(row.get("file") or "")
        if not tid or not rel:
            continue
        dest = (TITAN / rel).resolve()
        try:
            dest.relative_to(TITAN.resolve())
        except ValueError:
            die("Ruta no segura en el manifest TITAN: " + rel)
        if dest.exists():
            result[tid] = dest
    return result

def choose_team_path(tid, natives):
    # El MASTER tiene prioridad para un equipo nuevo; los historicos TITAN siguen en su ruta nativa.
    folder = MASTER / "EQUIPOS/STATS"
    existing = [p for p in folder.glob("*.csv") if p.stem == tid or p.stem.startswith(tid + "_")]
    if len(existing) > 1:
        die("Equipo " + tid + ": mas de un CSV MASTER, no se elegira a ciegas.")
    if existing:
        return existing[0]
    return natives.get(tid, folder / (tid + ".csv"))

def native_keys(paths, key_fields):
    keys = set()
    for path in paths:
        if not path.is_file():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            rd = csv.DictReader(f)
            if not rd.fieldnames or not {"Event_ID"}.issubset(rd.fieldnames):
                die("Native CSV sin Event_ID: " + str(path))
            for row in rd:
                event = text_val(row.get("Event_ID"))
                entity = text_val(row.get(key_fields[1])) or (
                    text_val(row.get("ID_Jugador")) if key_fields[1] == "Player_ID" else "")
                if event and entity:
                    keys.add((event, entity))
    return keys

def build_plan(mode, source):
    data = list(iter_sources(source))
    team_input, player_input, team_stats, player_stats = {}, {}, defaultdict(list), []
    ref_index, ref_matches = [], []
    stats_seen = False
    for name, raw in data:
        low = Path(name).name.lower()
        if low.endswith(".json"):
            if low in ("base_equipos_master.json", "teams.json", "equipos.json") and mode in ("equipos", "todo"):
                obj = json.loads(raw.decode("utf-8-sig"))
                rows = obj.get("teams", obj.get("equipos", [])) if isinstance(obj, dict) else obj
                if isinstance(rows, list) and rows and all(isinstance(r, dict) and "team_id" in r for r in rows):
                    for ident, rec in indexed(rows, "team_id", name).items():
                        if ident in team_input and team_input[ident] != rec:
                            die("Equipo conflictivo en varios catalogos: " + ident)
                        team_input[ident] = rec
            elif low in ("base_jugadores_master.json", "players.json", "jugadores.json") and mode in ("jugadores", "todo"):
                obj = json.loads(raw.decode("utf-8-sig"))
                rows = obj.get("players", obj.get("jugadores", [])) if isinstance(obj, dict) else obj
                if isinstance(rows, list) and rows and all(isinstance(r, dict) and "id" in r for r in rows):
                    for ident, rec in indexed(rows, "id", name).items():
                        if ident in player_input and player_input[ident] != rec:
                            die("Jugador conflictivo en varios catalogos: " + ident)
                        player_input[ident] = rec
            continue

        fields, rows = read_csv_bytes(raw, name)
        fs = set(fields)
        if mode in ("equipos", "todo") and {"Event_ID", "Team_ID", "Tiempo"}.issubset(fs):
            stats_seen = True
            for row in rows:
                tid = valid_id(row.get("Team_ID"))
                if not tid:
                    die(name + ": Team_ID invalido")
                team_stats[tid].append(row)
        elif mode in ("jugadores", "todo") and {"Event_ID", "Player_ID"}.issubset(fs) and "Tiempo" not in fs:
            stats_seen = True
            for row in rows:
                row = dict(row)
                row.setdefault("ID_Jugador", row["Player_ID"])
                player_stats.append(row)
        elif mode in ("jugadores", "todo") and {"Event_ID", "ID_Jugador"}.issubset(fs) and "Tiempo" not in fs:
            stats_seen = True
            for row in rows:
                row = dict(row)
                row["Player_ID"] = row["ID_Jugador"]
                player_stats.append(row)
        elif mode in ("jugadores", "todo") and {"Event_ID", "Arbitro_ID"}.issubset(fs):
            ref_matches.extend(rows)
            stats_seen = True
        elif mode in ("jugadores", "todo") and {"referee_id", "name"}.issubset(fs):
            ref_index.extend(rows)
            stats_seen = True

    plan = Plan()
    if mode in ("equipos", "todo"):
        if not TEAM_CATALOG.is_file():
            die("No encuentro el MASTER local de equipos: " + str(TEAM_CATALOG))
        obj = read_json_file(TEAM_CATALOG)
        if obj.get("schema") != "incastats.master.teams.v1":
            die("Formato BASE_EQUIPOS_MASTER.json incompatible")
        existing = indexed(obj.get("teams", []), "team_id", "MASTER equipos")
        natives = native_team_paths()
        added = updated = 0
        for tid, row in team_input.items():
            row = dict(row)
            row["team_id"] = int(tid)
            if tid not in existing:
                row["in_existing_inca"] = tid in natives
                existing[tid] = row
                added += 1
            else:
                merged = merge_record(existing[tid], row)
                if merged != existing[tid]:
                    existing[tid] = merged
                    updated += 1
        if team_input:
            obj["teams"] = sorted(existing.values(), key=lambda x: int(x["team_id"]))
            obj["count"] = len(obj["teams"])
            plan.add(TEAM_CATALOG, serialize_json(obj), f"Catalogo equipos +{added} nuevos / {updated} actualizados")
        for tid, incoming in sorted(team_stats.items(), key=lambda x: int(x[0])):
            if tid not in existing and tid not in natives:
                die("Hay stats del equipo " + tid + " pero no existe en catalogo. Falta su metadata.")
            dest = choose_team_path(tid, natives)
            old_fields, old_rows = read_csv_file(dest)
            new_fields = list(dict.fromkeys(k for row in incoming for k in row.keys()))
            all_fields = list(dict.fromkeys(old_fields + new_fields))
            merged, a, u = merge_csv_rows(old_rows, incoming, all_fields,
                                         ("Event_ID", "Team_ID", "Tiempo"), "Equipo " + tid)
            plan.add(dest, serialize_csv(all_fields, merged), f"Equipo {tid}: {a} partidos-periodos nuevos, {u} corregidos")

    if mode in ("jugadores", "todo"):
        if not PLAYER_CATALOG.is_file():
            die("No encuentro el MASTER local de jugadores: " + str(PLAYER_CATALOG))
        obj = read_json_file(PLAYER_CATALOG)
        if obj.get("schema") != "incastats.master.players.v1":
            die("Formato BASE_JUGADORES_MASTER.json incompatible")
        existing = indexed(obj.get("players", []), "id", "MASTER jugadores")
        added = updated = 0
        for pid, row in player_input.items():
            row = dict(row)
            row["id"] = pid
            if pid not in existing:
                existing[pid] = row
                added += 1
            else:
                merged = merge_record(existing[pid], row, player=True)
                if merged != existing[pid]:
                    existing[pid] = merged
                    updated += 1
        if player_input:
            obj["players"] = sorted(existing.values(), key=lambda x: int(x["id"]))
            obj["count"] = len(obj["players"])
            plan.add(PLAYER_CATALOG, serialize_json(obj), f"Catalogo jugadores +{added} nuevos / {updated} actualizados")
        if player_stats:
            for row in player_stats:
                if not valid_id(row.get("Player_ID")) or not valid_id(row.get("Event_ID")):
                    die("Stats jugador sin Event_ID o Player_ID")
                if valid_id(row["Player_ID"]) not in existing:
                    die("Stats jugador sin ficha de catalogo: " + str(row["Player_ID"]))
            before_native = native_keys(NATIVE_PLAYER_FILES, ("Event_ID", "Player_ID"))
            old_fields, old_rows = read_csv_file(NEW_PLAYER_STATS)
            kept = [r for r in player_stats if (text_val(r["Event_ID"]), text_val(r["Player_ID"])) not in before_native]
            skip = len(player_stats) - len(kept)
            if kept:
                fields = list(dict.fromkeys(old_fields + [k for r in kept for k in r.keys()]))
                merged, a, u = merge_csv_rows(old_rows, kept, fields,
                                             ("Event_ID", "Player_ID"), "Jugador partido")
                plan.add(NEW_PLAYER_STATS, serialize_csv(fields, merged),
                         f"Delta jugadores: +{a}, corregidos={u}; omitidos nativos={skip}")
            else:
                plan.stat.append(f"[IGUAL] Jugadores: {skip} eventos-jugador ya estan en TITAN nativo.")
        if ref_matches:
            before_native = native_keys([NATIVE_REF_MATCHES], ("Event_ID", "Arbitro_ID"))
            old_fields, old_rows = read_csv_file(NEW_REF_MATCHES)
            kept = [r for r in ref_matches if (text_val(r["Event_ID"]), text_val(r["Arbitro_ID"])) not in before_native]
            if kept:
                fields = list(dict.fromkeys(old_fields + [k for r in kept for k in r]))
                merged, a, u = merge_csv_rows(old_rows, kept, fields,
                                              ("Event_ID", "Arbitro_ID"), "Arbitros partido")
                plan.add(NEW_REF_MATCHES, serialize_csv(fields, merged),
                         f"Delta arbitros: +{a}, corregidos={u}; ya TITAN={len(ref_matches)-len(kept)}")
            else:
                plan.stat.append("[IGUAL] Partidos arbitrales ya en TITAN.")
        if ref_index:
            _, natives = read_csv_file(NATIVE_REF_INDEX)
            known = {text_val(r.get("referee_id")): r for r in natives if valid_id(r.get("referee_id"))}
            # Evitar clonar el indice nativo; guardar solo nuevas fichas o cambios reales.
            newer = []
            skipped = 0
            for row in ref_index:
                refid = valid_id(row.get("referee_id"))
                if not refid:
                    die("Catalogo arbitros: referee_id invalido")
                old_native = known.get(refid)
                if old_native and not any(nonblank(v) and text_val(old_native.get(k)) != text_val(v)
                                      for k, v in row.items() if k != "referee_id"):
                    skipped += 1
                    continue
                newer.append(row)
            if newer:
                old_fields, old_rows = read_csv_file(NEW_REF_INDEX)
                fields = list(dict.fromkeys(old_fields + [k for r in newer for k in r]))
                merged, a, u = merge_csv_rows(old_rows, newer, fields,
                                              ("referee_id",), "Catalogo arbitros")
                plan.add(NEW_REF_INDEX, serialize_csv(fields, merged),
                         f"Catalogo arbitros DELTA: +{a}, corregidos={u}, identicos al TITAN={skipped}")
            else:
                plan.stat.append("[IGUAL] Arbitros: todas las fichas identicas a TITAN.")

    if not (team_input or player_input or stats_seen):
        die("No se detectaron catalogos o CSV compatibles en esta entrada. No se aplico nada.")
    return plan, len(data)

def main():
    p = argparse.ArgumentParser(description="INCASTATS MASTER | UPSERT incremental, sin backups")
    p.add_argument("modo", choices=["equipos", "jugadores", "todo"])
    p.add_argument("--input", required=True, dest="entrada")
    p.add_argument("--apply", action="store_true", help="Permite confirmar actualizaciones")
    args = p.parse_args()
    src = Path(args.entrada.strip().strip('"')).expanduser().resolve()
    if not (ROOT / ".git").is_dir() or not MASTER.is_dir():
        die("Este script debe estar en el clon LOCAL IncaStats-Data con MASTER creado.")
    if not src.exists() or src == ROOT or src == MASTER:
        die("Selecciona un lote nuevo (carpeta/ZIP/CSV/JSON), NO la raiz del GitHub ni MASTER.")
    if src.is_dir() and (src / ".git").exists():
        die("No se admite importar un repositorio completo.")
    print("\n" + "=" * 70)
    print("INCASTATS MASTER | " + args.modo.upper() + " | " + ("APLICAR" if args.apply else "AUDITORIA"))
    print("=" * 70)
    print("Repo:", ROOT)
    print("Origen:", src)
    print("NO ZIP de salida / NO respaldos / NO borrar / NO copiar bases TITAN")
    plan, files = build_plan(args.modo, src)
    print("\nArchivos fuente examinados:", files)
    print("Destinos con cambios:", len(plan.data))
    for m in plan.stat[:100]:
        print(" ", m)
    if len(plan.stat) > 100:
        print("  ... y", len(plan.stat) - 100, "avisos mas.")
    if not plan.data:
        print("\n[OK] No hay cambios nuevos. Operacion idempotente.")
        return
    if not args.apply:
        print("\n[VISTA PREVIA] No se ha modificado nada. Para aplicar usa --apply.")
        return
    print("\nATENCION: NO hay respaldos automaticos. Git no protege archivos sin commit.")
    if input("Escribe APLICAR para actualizar solamente estos archivos: ").strip() != "APLICAR":
        print("[CANCELADO] Sin cambios.")
        return
    plan.execute()
    print("\n[OK] Archivos escritos de forma atomica, uno por uno.")
    print("[NOTA] Los deltas centrales de jugadores/arbitros TODAVIA no alimentan los derivados nativos de la app.")
    print("Revisa git status y valida antes de commit.")

if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, UnicodeError, zipfile.BadZipFile, json.JSONDecodeError) as e:
        print("\n[ERROR / SIN CONTINUAR]", e)
        sys.exit(1)
