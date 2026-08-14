#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TITAN SYNC V2.1 SAFE
Fusiona un ZIP DELTA de TITAN con la carpeta viva:
  IncaStats-Data/TITAN_ALONSINHO_V1_GITHUB_READY/
No hace push: GitHub Desktop muestra los cambios y el usuario hace Commit + Push.
Solo usa librería estándar de Python.
"""

from __future__ import annotations
from pathlib import Path
from collections import OrderedDict
import csv, json, os, shutil, sys, tempfile, zipfile, hashlib
from datetime import datetime, timezone

LIVE_FOLDER = "TITAN_ALONSINHO_V1_GITHUB_READY"
TEAM_CSV_REL = Path("data/teams_csv")
MANIFEST_REL = Path("manifest")
DELTA_ARCHIVE_REL = Path("deltas")
SYNC_REL = Path("sync")

KEY_FIELDS = ("Event_ID", "Team_ID", "Tiempo")

def die(msg: str, code: int = 1):
    print("\nERROR:", msg)
    input("\nEnter para cerrar...")
    raise SystemExit(code)

def pick_file(title="Selecciona TITAN_DELTA_*.zip"):
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
        p = filedialog.askopenfilename(
            title=title,
            filetypes=[("TITAN Delta ZIP", "*.zip"), ("ZIP", "*.zip"), ("Todos", "*.*")]
        )
        root.destroy()
        return Path(p) if p else None
    except Exception:
        return None

def pick_dir(title="Selecciona la carpeta local IncaStats-Data"):
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
        p = filedialog.askdirectory(title=title)
        root.destroy()
        return Path(p) if p else None
    except Exception:
        return None

def load_json(path: Path):
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)

def save_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp.replace(path)

def csv_read(path: Path):
    if not path.exists():
        return [], []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        return list(r), list(r.fieldnames or [])

def csv_format_info(path: Path):
    """Preserva el formato físico del CSV para no reescribir Git innecesariamente."""
    if not path.exists():
        return {"lineterminator": "\n", "final_newline": False}
    raw = path.read_bytes()
    if b"\r\n" in raw:
        lt = "\r\n"
    else:
        lt = "\n"
    return {"lineterminator": lt, "final_newline": raw.endswith(b"\n") or raw.endswith(b"\r")}

def csv_write(path: Path, rows, fieldnames, fmt=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    fmt = fmt or {"lineterminator": "\n", "final_newline": False}
    with tmp.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=fieldnames,
            extrasaction="ignore",
            lineterminator=fmt.get("lineterminator", "\n")
        )
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fieldnames})
    # Los CSV TITAN originales normalmente no terminan en salto de línea.
    # Preservarlo evita que Git marque cambios fantasma.
    if not fmt.get("final_newline", False):
        raw = tmp.read_bytes()
        if raw.endswith(b"\r\n"):
            raw = raw[:-2]
        elif raw.endswith(b"\n") or raw.endswith(b"\r"):
            raw = raw[:-1]
        tmp.write_bytes(raw)
    tmp.replace(path)

def row_key(row):
    return "|".join(str(row.get(k, "") or "").strip() for k in KEY_FIELDS)

def _nonblank(v):
    return v is not None and str(v).strip() != ""

def validate_delta_structure(rows, delta_name="DELTA"):
    """Cada partido válido de un shard de equipo debe traer 2 equipos x ALL/1ST/2ND = 6 filas."""
    by_event = {}
    for r in rows:
        k = row_key(r)
        if not k.strip("|"):
            raise RuntimeError(f"{delta_name}: fila sin clave Event_ID + Team_ID + Tiempo")
        ev = str(r.get("Event_ID", "")).strip()
        by_event.setdefault(ev, []).append(r)
    for ev, group in by_event.items():
        team_periods = {}
        for r in group:
            tid = str(r.get("Team_ID", "")).strip()
            per = str(r.get("Tiempo", "")).strip().upper()
            team_periods.setdefault(tid, set()).add(per)
        if len(group) != 6 or len(team_periods) != 2 or any(v != {"ALL", "1ST", "2ND"} for v in team_periods.values()):
            raise RuntimeError(
                f"{delta_name}: Event_ID {ev} no tiene estructura TITAN 2 equipos x ALL/1ST/2ND. "
                f"Filas={len(group)}, equipos={len(team_periods)}"
            )

def merge_csv(master: Path, delta: Path):
    """
    UPSERT NO DESTRUCTIVO V2.1:
      - conserva EXACTAMENTE el orden histórico existente;
      - reemplaza una clave existente EN SU MISMA POSICIÓN;
      - agrega claves nuevas al final;
      - nunca elimina una clave histórica;
      - un valor vacío del DELTA no borra un valor histórico no vacío;
      - preserva LF/CRLF y newline final para evitar diffs gigantes de Git.
    """
    old_rows, old_fields = csv_read(master)
    new_rows, new_fields = csv_read(delta)
    fields = list(old_fields)
    for f in new_fields:
        if f not in fields:
            fields.append(f)
    if not fields:
        return 0, 0, 0

    validate_delta_structure(new_rows, delta.name)

    # MASTER debe ser único por clave. Si no lo es, NO tocamos nada.
    old_index = {}
    for i, r in enumerate(old_rows):
        k = row_key(r)
        if not k.strip("|"):
            raise RuntimeError(f"{master.name}: fila histórica sin clave en posición {i+2}")
        if k in old_index:
            raise RuntimeError(f"{master.name}: clave histórica duplicada {k}. Se aborta para no perder datos.")
        old_index[k] = i

    before_keys = set(old_index)
    before_events = {str(r.get("Event_ID", "")).strip() for r in old_rows if str(r.get("Event_ID", "")).strip()}
    rows = [dict(r) for r in old_rows]
    inserts = 0
    replacements = 0
    inserted_index = {}

    for r in new_rows:
        k = row_key(r)
        if k in old_index:
            idx = old_index[k]
            base = dict(rows[idx])
            # Delta puede actualizar valores reales, pero jamás convertir un dato existente en vacío.
            for f in fields:
                nv = r.get(f, "")
                if _nonblank(nv) or not _nonblank(base.get(f, "")):
                    base[f] = nv
            rows[idx] = base
            replacements += 1
        elif k in inserted_index:
            idx = inserted_index[k]
            base = dict(rows[idx])
            for f in fields:
                nv = r.get(f, "")
                if _nonblank(nv) or not _nonblank(base.get(f, "")):
                    base[f] = nv
            rows[idx] = base
        else:
            nr = {f: r.get(f, "") for f in fields}
            inserted_index[k] = len(rows)
            rows.append(nr)
            inserts += 1

    after_keys = {row_key(r) for r in rows if row_key(r).strip("|")}
    after_events = {str(r.get("Event_ID", "")).strip() for r in rows if str(r.get("Event_ID", "")).strip()}

    missing_keys = before_keys - after_keys
    missing_events = before_events - after_events
    if missing_keys or missing_events or len(rows) < len(old_rows):
        raise RuntimeError(
            f"BLOQUEO DE SEGURIDAD {master.name}: el merge intentaría perder histórico. "
            f"keys_faltantes={len(missing_keys)}, eventos_faltantes={len(missing_events)}, "
            f"filas_antes={len(old_rows)}, filas_despues={len(rows)}"
        )

    # Verificación adicional de todos los eventos tocados por el DELTA.
    touched = {str(r.get("Event_ID", "")).strip() for r in new_rows}
    by_event_out = {}
    for r in rows:
        ev = str(r.get("Event_ID", "")).strip()
        if ev in touched:
            by_event_out.setdefault(ev, []).append(r)
    validate_delta_structure([r for ev in touched for r in by_event_out.get(ev, [])], master.name + " output")

    fmt = csv_format_info(master)
    csv_write(master, rows, fields, fmt=fmt)

    # Releer lo escrito: una segunda barrera contra corrupción de serialización.
    check_rows, _ = csv_read(master)
    check_keys = {row_key(r) for r in check_rows if row_key(r).strip("|")}
    if not before_keys.issubset(check_keys) or len(check_rows) < len(old_rows):
        raise RuntimeError(f"POST-WRITE FAIL {master.name}: validación final no superada.")

    return len(old_rows), inserts, replacements

def unique_event_count(csv_path: Path):
    seen = set()
    if not csv_path.exists():
        return 0
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            v = str(row.get("Event_ID","")).strip()
            if v:
                seen.add(v)
    return len(seen)

def sha256(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def region_normalize(v):
    s = str(v or "").upper()
    if "EURO" in s: return "Europe"
    if "AM" in s: return "America"
    return v or None

def team_filename_for_id(team_dir: Path, team_id: int, fallback_name: str):
    matches = sorted(team_dir.glob(f"{team_id}_*.csv"))
    if matches:
        return matches[0]
    return team_dir / fallback_name

def ensure_list(obj, key):
    v = obj.get(key)
    if not isinstance(v, list):
        obj[key] = []
    return obj[key]

def safe_int(v):
    try: return int(v)
    except: return None

def delta_team_ids_from_zip(delta_zip: Path):
    ids = set()
    with zipfile.ZipFile(delta_zip, "r") as z:
        for name in z.namelist():
            if not name.startswith("teams_csv_delta/") or not name.lower().endswith(".csv"):
                continue
            base = Path(name).name
            try:
                ids.add(int(base.split("_", 1)[0]))
            except Exception:
                pass
    return ids

def latest_backup(repo: Path):
    root = repo.parent / f"{repo.name}_TITAN_BACKUPS"
    if not root.is_dir():
        return None
    candidates = [p for p in root.iterdir() if p.is_dir() and (p / "manifest").is_dir() and (p / "teams_csv").is_dir()]
    return sorted(candidates, key=lambda p: p.name, reverse=True)[0] if candidates else None

def restore_latest_backup(repo: Path, live: Path, delta_zip: Path):
    """Restaura SOLO lo que el último SYNC tocó y conserva cualquier cambio previo al sync fallido."""
    b = latest_backup(repo)
    if b is None:
        die("No encontré backup automático del SYNC anterior. NO se hará una restauración a ciegas.")
    print("\nMODO REPARACIÓN")
    print("Backup detectado:", b)
    ans = input("¿Restaurar este backup previo al SYNC fallido? [S/N]: ").strip().lower()
    if ans not in {"s", "si", "sí", "y", "yes"}:
        die("Reparación cancelada por el usuario.")

    team_dir = live / TEAM_CSV_REL
    man_dir = live / MANIFEST_REL
    touched_ids = delta_team_ids_from_zip(delta_zip)

    # Snapshot de la situación rota, por seguridad adicional.
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    broken = repo.parent / f"{repo.name}_TITAN_BROKEN_SNAPSHOTS" / stamp
    (broken / "teams_csv").mkdir(parents=True, exist_ok=True)
    (broken / "manifest").mkdir(parents=True, exist_ok=True)
    for tid in touched_ids:
        for p in team_dir.glob(f"{tid}_*.csv"):
            shutil.copy2(p, broken / "teams_csv" / p.name)
    for p in man_dir.glob("*.json"):
        if (b / "manifest" / p.name).exists():
            shutil.copy2(p, broken / "manifest" / p.name)

    # Manifiestos previos.
    for bp in (b / "manifest").glob("*.json"):
        shutil.copy2(bp, man_dir / bp.name)

    # CSV previos. Si un team era completamente nuevo y no tenía backup, eliminamos
    # solo el archivo que el DELTA fallido pudo haber creado.
    for tid in touched_ids:
        backups = sorted((b / "teams_csv").glob(f"{tid}_*.csv"))
        live_matches = sorted(team_dir.glob(f"{tid}_*.csv"))
        if backups:
            keep_name = backups[0].name
            for lp in live_matches:
                if lp.name != keep_name:
                    lp.unlink(missing_ok=True)
            shutil.copy2(backups[0], team_dir / keep_name)
        else:
            for lp in live_matches:
                lp.unlink(missing_ok=True)

    print("Restauración previa completada.")
    print("Snapshot del estado roto guardado en:", broken)
    print("Ahora se aplicará el mismo DELTA con SYNC V2.1 SAFE.\n")

def main():
    print("="*66)
    print("TITAN SYNC V2.1 SAFE  |  DELTA ALL-OFFICIAL -> IncaStats-Data -> GitHub Desktop")
    print("="*66)

    script_dir = Path(__file__).resolve().parent
    repo = script_dir

    # Si el script no está en la raíz del repo, permite elegirla.
    if not (repo / LIVE_FOLDER).is_dir():
        chosen = pick_dir()
        if chosen:
            repo = chosen
    live = repo / LIVE_FOLDER
    if not live.is_dir():
        die(f"No encuentro {LIVE_FOLDER} dentro de:\n{repo}\n"
            f"Pon TITAN_SYNC_V2_1_SAFE.py en la raíz local de IncaStats-Data o selecciónala.")

    args = list(sys.argv[1:])
    repair_mode = "--repair-latest-backup" in args
    file_args = [a for a in args if not a.startswith("--")]

    delta_zip = None
    if file_args:
        p = Path(file_args[0].strip('"'))
        if p.is_file():
            delta_zip = p
    if delta_zip is None:
        delta_zip = pick_file()
    if delta_zip is None or not delta_zip.is_file():
        die("No seleccionaste un ZIP DELTA.")

    if not zipfile.is_zipfile(delta_zip):
        die("El archivo elegido no es un ZIP válido.")

    if repair_mode:
        restore_latest_backup(repo, live, delta_zip)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = repo.parent / f"{repo.name}_TITAN_BACKUPS" / stamp
    temp = Path(tempfile.mkdtemp(prefix="titan_sync_"))

    try:
        with zipfile.ZipFile(delta_zip, "r") as z:
            z.extractall(temp)

        manifest_path = temp / "delta_manifest.json"
        if not manifest_path.exists():
            die("El ZIP no contiene delta_manifest.json.")
        dmanifest = load_json(manifest_path)

        if dmanifest.get("schema_version") != "incastats.delta_manifest.v1":
            die("Schema DELTA no reconocido.")
        if dmanifest.get("provider") != "sofascore":
            die("Proveedor DELTA inesperado.")

        scope = dmanifest.get("scope") or {}
        # V2: las 31 ligas son el universo que SELECCIONA los equipos.
        # No son un filtro de competiciones de sus partidos.
        seed = scope.get("seed_competition_ids", scope.get("allowed_competition_ids", []))
        allowed = [safe_int(x) for x in seed]
        allowed = [x for x in allowed if x is not None]
        if len(set(allowed)) != 31:
            die(f"Este DELTA no trae las 31 ligas semilla esperadas. Encontré {len(set(allowed))}.")
        event_scope = scope.get("event_competition_scope", "LEGACY_31_ONLY")

        counts = dmanifest.get("counts") or {}
        print(f"\nDELTA: {delta_zip.name}")
        print(f"  Eventos válidos: {counts.get('valid_events', 0)}")
        print(f"  Equipos afectados: {counts.get('affected_teams', 0)}")
        print(f"  Incompletos auditados: {counts.get('incomplete', 0)}")
        print(f"  Ligas semilla: {len(set(allowed))}")
        print(f"  Alcance de partidos: {event_scope}")

        team_dir = live / TEAM_CSV_REL
        man_dir = live / MANIFEST_REL
        required = [
            man_dir/"manifest_global.json",
            man_dir/"teams.json",
            man_dir/"competitions.json",
            man_dir/"seasons.json",
            man_dir/"team_details.json",
        ]
        for p in required:
            if not p.exists():
                die(f"Falta archivo maestro: {p}")

        delta_csv_dir = temp / "teams_csv_delta"
        delta_json_dir = temp / "teams_json_delta"
        if not delta_csv_dir.is_dir():
            die("Falta teams_csv_delta/ en el ZIP.")

        # ---------- BACKUP ----------
        (backup_root / "manifest").mkdir(parents=True, exist_ok=True)
        for p in required:
            shutil.copy2(p, backup_root/"manifest"/p.name)

        # ---------- LOAD MANIFESTS ----------
        global_m = load_json(man_dir/"manifest_global.json")
        teams_m = load_json(man_dir/"teams.json")
        comps_m = load_json(man_dir/"competitions.json")
        seasons_m = load_json(man_dir/"seasons.json")
        details_m = load_json(man_dir/"team_details.json")

        teams_arr = ensure_list(teams_m, "teams")
        comps_arr = ensure_list(comps_m, "competitions")
        seasons_arr = ensure_list(seasons_m, "seasons")
        details_arr = ensure_list(details_m, "teams")

        team_index = {safe_int(t.get("team_id")): t for t in teams_arr if safe_int(t.get("team_id")) is not None}
        detail_index = {safe_int(t.get("team_id")): t for t in details_arr if safe_int(t.get("team_id")) is not None}
        comp_index = {safe_int(c.get("competition_id")): c for c in comps_arr if safe_int(c.get("competition_id")) is not None}
        season_index = {}
        for s in seasons_arr:
            cid, sid = safe_int(s.get("competition_id")), safe_int(s.get("season_id"))
            if cid is not None and sid is not None:
                season_index[(cid, sid)] = s

        # Team packages DELTA para metadata/manifests.
        delta_team_packages = {}
        if delta_json_dir.is_dir():
            for jp in delta_json_dir.glob("*.json"):
                try:
                    obj = load_json(jp)
                    tid = safe_int((obj.get("team") or {}).get("id"))
                    if tid is not None:
                        delta_team_packages[tid] = obj
                except Exception as e:
                    print("WARN JSON:", jp.name, e)

        # ---------- MERGE TEAM CSVs ----------
        affected_files = []
        total_inserts = total_replacements = 0
        affected_ids = []
        safety_files = []
        original_exists = {}

        try:
            for dp in sorted(delta_csv_dir.glob("*.csv")):
                try:
                    tid = int(dp.name.split("_", 1)[0])
                except Exception:
                    print("WARN: nombre sin team_id:", dp.name)
                    continue

                target = team_filename_for_id(team_dir, tid, dp.name)
                original_exists[target] = target.exists()
                if target.exists():
                    backup_csv_dir = backup_root / "teams_csv"
                    backup_csv_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(target, backup_csv_dir/target.name)

                before_rows, ins, rep = merge_csv(target, dp)
                after_rows = len(csv_read(target)[0])
                if after_rows < before_rows:
                    raise RuntimeError(f"SAFE GUARD {target.name}: {before_rows} -> {after_rows} filas")
                total_inserts += ins
                total_replacements += rep
                affected_files.append(target)
                affected_ids.append(tid)
                safety_files.append({
                    "team_id": tid,
                    "file": target.name,
                    "rows_before": before_rows,
                    "rows_after": after_rows,
                    "rows_inserted": ins,
                    "rows_replaced": rep,
                    "historical_rows_lost": 0
                })

                pkg = delta_team_packages.get(tid) or {}
                team_info = pkg.get("team") or {}
                memberships = team_info.get("source_memberships") or []
                primary = memberships[0] if memberships else {}
                region = region_normalize(primary.get("region"))
                country = team_info.get("country") or primary.get("country") or None
                relfile = target.relative_to(live).as_posix()

                # teams.json
                t = team_index.get(tid)
                if t is None:
                    t = {
                        "team_id": tid,
                        "name": team_info.get("name") or dp.stem.split("_",1)[-1].replace("_"," "),
                        "country": country,
                        "region": region,
                        "source_batch": "DELTA_V2_1_SAFE",
                        "file": relfile,
                        "valid_matches": 0,
                        "incomplete_matches": 0
                    }
                    teams_arr.append(t); team_index[tid] = t
                t["file"] = relfile
                t["valid_matches"] = unique_event_count(target)
                if country and not t.get("country"): t["country"] = country
                if region and not t.get("region"): t["region"] = region

                # team_details.json
                td = detail_index.get(tid)
                if td is None:
                    td = {
                        "team_id": tid,
                        "name": t.get("name"),
                        "country": t.get("country"),
                        "region": t.get("region"),
                        "source_batch": "DELTA_V2_1_SAFE",
                        "file": relfile,
                        "valid_matches": t["valid_matches"],
                        "incomplete_matches": 0,
                        "competition_details": []
                    }
                    details_arr.append(td); detail_index[tid] = td
                td["file"] = relfile
                td["valid_matches"] = t["valid_matches"]
                if not isinstance(td.get("competition_details"), list):
                    td["competition_details"] = []

                # Metadata de partidos DELTA.
                for match in pkg.get("matches") or []:
                    md = match.get("metadata") or {}
                    cid, sid = safe_int(md.get("competition_id")), safe_int(md.get("season_id"))
                    if cid is None or sid is None:
                        continue
                    # V2: NO filtrar metadata por las 31 ligas semilla.
                    # Si el equipo seleccionado juega copa o torneo internacional,
                    # esa competición también debe entrar al manifiesto.

                    # Región del membership correspondiente.
                    mem = next((m for m in memberships if safe_int(m.get("competition_id")) == cid and safe_int(m.get("season_id")) == sid), None) or primary
                    reg = region_normalize(mem.get("region")) or region

                    # competition_details
                    phase = md.get("competition_phase") or "REGULAR"
                    stage = md.get("competition_stage") or ""
                    existing_detail = next((
                        d for d in td["competition_details"]
                        if safe_int(d.get("competition_id")) == cid
                        and safe_int(d.get("season_id")) == sid
                        and str(d.get("competition_phase") or "") == str(phase)
                        and str(d.get("competition_stage") or "") == str(stage)
                    ), None)
                    drow = {
                        "competition_id": cid,
                        "competition_name": md.get("competition_name"),
                        "season_id": sid,
                        "season_label": md.get("season_label_original"),
                        "start_year": safe_int(md.get("start_year")) or 0,
                        "end_year": safe_int(md.get("end_year")) or 0,
                        "season_format": md.get("season_format"),
                        "competition_phase": phase,
                        "competition_stage": stage,
                        "competition_type": md.get("competition_type"),
                        "season_status": md.get("season_status"),
                        "season_status_basis": md.get("season_status_basis") or "TITAN_DELTA_V2_1_SAFE",
                        "titan_pro_validation": True,
                        "filename": f"compat_{cid}_{sid}.csv",
                        "last_update": datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
                    }
                    if existing_detail is None:
                        td["competition_details"].append(drow)
                    else:
                        existing_detail.update(drow)

                    # competitions.json
                    comp = comp_index.get(cid)
                    if comp is None:
                        comp = {
                            "competition_id": cid,
                            "name": md.get("competition_name") or f"Competition {cid}",
                            "competition_type": md.get("competition_type") or "LEAGUE",
                            "regions": [reg] if reg else [],
                            "season_ids": [sid]
                        }
                        comps_arr.append(comp); comp_index[cid] = comp
                    else:
                        ids = [safe_int(x) for x in (comp.get("season_ids") or [])]
                        ids = [x for x in ids if x is not None]
                        if sid not in ids: ids.append(sid)
                        comp["season_ids"] = sorted(set(ids))
                        regs = list(comp.get("regions") or [])
                        if reg and reg not in regs: regs.append(reg)
                        comp["regions"] = regs

                    # seasons.json
                    sk = (cid, sid)
                    sobj = season_index.get(sk)
                    if sobj is None:
                        sobj = {
                            "competition_id": cid,
                            "season_id": sid,
                            "label": md.get("season_label_original"),
                            "start_year": safe_int(md.get("start_year")) or 0,
                            "end_year": safe_int(md.get("end_year")) or 0,
                            "season_format": md.get("season_format"),
                            "season_status": md.get("season_status"),
                            "season_status_basis": md.get("season_status_basis") or "TITAN_DELTA_V2_1_SAFE",
                            "phases": [],
                            "stages": [],
                            "regions": [reg] if reg else []
                        }
                        seasons_arr.append(sobj); season_index[sk] = sobj
                    if md.get("season_status") == "CURRENT":
                        sobj["season_status"] = "CURRENT"
                        sobj["season_status_basis"] = md.get("season_status_basis") or "TITAN_DELTA_V2_1_SAFE"
                    phases = list(sobj.get("phases") or [])
                    if phase and phase not in phases: phases.append(phase)
                    sobj["phases"] = phases
                    stages = list(sobj.get("stages") or [])
                    if stage and stage not in stages: stages.append(stage)
                    sobj["stages"] = stages
                    regs = list(sobj.get("regions") or [])
                    if reg and reg not in regs: regs.append(reg)
                    sobj["regions"] = regs

        except Exception as merge_error:
            print("\nBLOQUEO DE SEGURIDAD ACTIVADO:", merge_error)
            print("Restaurando automáticamente los CSV que alcanzaron a tocarse...")
            bcsv = backup_root / "teams_csv"
            for target, existed in original_exists.items():
                bp = bcsv / target.name
                try:
                    if existed and bp.exists():
                        shutil.copy2(bp, target)
                    elif not existed and target.exists():
                        target.unlink()
                except Exception as re:
                    print("WARN rollback", target.name, re)
            raise RuntimeError("SYNC CANCELADO Y CSV RESTAURADOS. No hagas commit.") from merge_error

        # ---------- SORT + COUNTS ----------
        teams_arr.sort(key=lambda x: str(x.get("name") or "").casefold())
        details_arr.sort(key=lambda x: str(x.get("name") or "").casefold())
        comps_arr.sort(key=lambda x: str(x.get("name") or "").casefold())
        seasons_arr.sort(key=lambda x: (safe_int(x.get("competition_id")) or 0, safe_int(x.get("start_year")) or 0, safe_int(x.get("season_id")) or 0))

        teams_m["count"] = len(teams_arr)
        comps_m["count"] = len(comps_arr)
        seasons_m["count"] = len(seasons_arr)

        # Recuento exacto de partidos únicos de la carpeta viva.
        global_events = set()
        for fp in team_dir.glob("*.csv"):
            try:
                with fp.open("r", encoding="utf-8-sig", newline="") as f:
                    r = csv.DictReader(f)
                    for row in r:
                        ev = str(row.get("Event_ID","")).strip()
                        if ev: global_events.add(ev)
            except Exception as e:
                print("WARN leyendo", fp.name, e)

        global_m["generated_at"] = datetime.now(timezone.utc).date().isoformat()
        coverage = global_m.setdefault("coverage", {})
        coverage["teams"] = len(teams_arr)
        region_counts = {}
        countries = set()
        for t in teams_arr:
            reg = str(t.get("region") or "Unknown")
            region_counts[reg] = region_counts.get(reg, 0) + 1
            if t.get("country"):
                countries.add(str(t.get("country")))
        coverage["regions"] = region_counts
        coverage["countries"] = len(countries)

        global_m.setdefault("counts", {})["competitions"] = len(comps_arr)
        global_m["counts"]["competition_seasons"] = len(seasons_arr)
        global_m["counts"]["unique_matches"] = len(global_events)
        global_m["counts"]["portal_shards"] = len(seasons_arr)
        global_m["counts"]["portal_rows"] = len(global_events) * 6
        global_m["live_update"] = {
            "sync_version": "TITAN_SYNC_V2_1_SAFE",
            "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
            "delta_file": delta_zip.name,
            "delta_sha256": sha256(delta_zip),
            "window": dmanifest.get("window"),
            "delta_counts": counts,
            "affected_team_files": len(set(affected_files)),
            "inserted_rows": total_inserts,
            "replaced_rows": total_replacements,
            "note": "cards count remains the original full snapshot unless a future full cards rebuild is run"
        }

        save_json(man_dir/"teams.json", teams_m)
        save_json(man_dir/"team_details.json", details_m)
        save_json(man_dir/"competitions.json", comps_m)
        save_json(man_dir/"seasons.json", seasons_m)
        save_json(man_dir/"manifest_global.json", global_m)

        # ---------- COPY DELTA AS AUDIT ----------
        w = dmanifest.get("window") or {}
        date_hint = str(w.get("requested_to") or datetime.now(timezone.utc).isoformat())[:10]
        try:
            y, m, _ = date_hint.split("-")
        except Exception:
            y, m = datetime.now().strftime("%Y"), datetime.now().strftime("%m")
        archive_dir = live / DELTA_ARCHIVE_REL / y / m
        archive_dir.mkdir(parents=True, exist_ok=True)
        archived_delta = archive_dir / delta_zip.name
        shutil.copy2(delta_zip, archived_delta)

        # ---------- SYNC STATE ----------
        sync_dir = live / SYNC_REL
        sync_dir.mkdir(parents=True, exist_ok=True)
        sync_log = {
            "schema_version": "incastats.titan_sync.v2.1",
            "synced_at": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
            "delta": delta_zip.name,
            "delta_sha256": sha256(delta_zip),
            "window": dmanifest.get("window"),
            "counts": counts,
            "merge": {
                "team_files_changed": len(set(affected_files)),
                "rows_inserted": total_inserts,
                "rows_replaced": total_replacements,
                "master_unique_matches_after": len(global_events),
                "teams_after": len(teams_arr),
                "competitions_after": len(comps_arr),
                "seasons_after": len(seasons_arr)
            },
            "backup_folder": str(backup_root)
        }
        save_json(sync_dir/"last_sync.json", sync_log)
        save_json(sync_dir/"version.json", {
            "data_version": datetime.now(timezone.utc).strftime("%Y.%m.%d.%H%M%S"),
            "updated_at": sync_log["synced_at"],
            "delta": delta_zip.name,
            "master_unique_matches": len(global_events)
        })
        save_json(sync_dir/"safety_last_sync.json", {
            "schema_version": "incastats.titan_sync_safety.v2.1",
            "synced_at": sync_log["synced_at"],
            "delta": delta_zip.name,
            "status": "PASS",
            "rule": "rows_after >= rows_before AND all historical keys/events preserved",
            "files": safety_files,
            "total_historical_rows_lost": 0,
            "total_rows_inserted": total_inserts,
            "total_rows_replaced": total_replacements
        })

        print("\n" + "="*66)
        print("SYNC TERMINADO")
        print("="*66)
        print("Archivos de equipos modificados:", len(set(affected_files)))
        print("Filas nuevas insertadas:", total_inserts)
        print("Filas DELTA reemplazadas:", total_replacements)
        print("Histórico perdido:", 0, "filas  <-- SAFE PASS")
        print("Partidos únicos MASTER:", len(global_events))
        print("Equipos MASTER:", len(teams_arr))
        print("Competiciones MASTER:", len(comps_arr))
        print("Temporadas MASTER:", len(seasons_arr))
        print("Backup:", backup_root)
        print("\nAHORA ABRE GITHUB DESKTOP:")
        print("1) Repository = IncaStats-Data")
        print("2) Revisa Changes")
        print(f"3) Summary: TITAN DELTA {date_hint} · {counts.get('valid_events',0)} eventos")
        print("4) Commit to main")
        print("5) Push origin")
        print("\nNO subas/edites el ZIP FULL DATA RELEASE en cada DELTA.")
        input("\nEnter para cerrar...")

    finally:
        shutil.rmtree(temp, ignore_errors=True)

if __name__ == "__main__":
    main()
