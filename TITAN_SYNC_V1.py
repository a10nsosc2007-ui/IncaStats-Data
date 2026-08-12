#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TITAN SYNC V1
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

def csv_write(path: Path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fieldnames})
    tmp.replace(path)

def row_key(row):
    return "|".join(str(row.get(k, "") or "").strip() for k in KEY_FIELDS)

def merge_csv(master: Path, delta: Path):
    old_rows, old_fields = csv_read(master)
    new_rows, new_fields = csv_read(delta)
    fields = list(old_fields)
    for f in new_fields:
        if f not in fields:
            fields.append(f)
    if not fields:
        return 0, 0, 0

    merged = OrderedDict()
    for r in old_rows:
        k = row_key(r)
        if k.strip("|"):
            merged[k] = r

    before = len(merged)
    replacements = 0
    inserts = 0
    for r in new_rows:
        k = row_key(r)
        if not k.strip("|"):
            continue
        if k in merged:
            replacements += 1
        else:
            inserts += 1
        merged[k] = r

    # Orden estable: Event_ID numérico, Team_ID, ALL/1ST/2ND.
    order_time = {"ALL": 0, "1ST": 1, "2ND": 2}
    def sk(item):
        r = item[1]
        try: ev = int(str(r.get("Event_ID","")).strip())
        except: ev = 0
        try: tid = int(str(r.get("Team_ID","")).strip())
        except: tid = 0
        return (ev, tid, order_time.get(str(r.get("Tiempo","")).upper(), 9))
    rows = [r for _, r in sorted(merged.items(), key=sk)]
    csv_write(master, rows, fields)
    return before, inserts, replacements

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

def main():
    print("="*66)
    print("TITAN SYNC V1  |  DELTA -> IncaStats-Data -> GitHub Desktop")
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
            f"Pon TITAN_SYNC_V1.py en la raíz local de IncaStats-Data o selecciónala.")

    delta_zip = None
    if len(sys.argv) > 1:
        p = Path(sys.argv[1].strip('"'))
        if p.is_file():
            delta_zip = p
    if delta_zip is None:
        delta_zip = pick_file()
    if delta_zip is None or not delta_zip.is_file():
        die("No seleccionaste un ZIP DELTA.")

    if not zipfile.is_zipfile(delta_zip):
        die("El archivo elegido no es un ZIP válido.")

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
        allowed = [safe_int(x) for x in scope.get("allowed_competition_ids", [])]
        allowed = [x for x in allowed if x is not None]
        if len(set(allowed)) != 31:
            die(f"Este DELTA no trae las 31 ligas esperadas. Encontré {len(set(allowed))}.")

        counts = dmanifest.get("counts") or {}
        print(f"\nDELTA: {delta_zip.name}")
        print(f"  Eventos válidos: {counts.get('valid_events', 0)}")
        print(f"  Equipos afectados: {counts.get('affected_teams', 0)}")
        print(f"  Incompletos auditados: {counts.get('incomplete', 0)}")
        print(f"  Ligas permitidas: {len(set(allowed))}")

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

        for dp in sorted(delta_csv_dir.glob("*.csv")):
            try:
                tid = int(dp.name.split("_", 1)[0])
            except Exception:
                print("WARN: nombre sin team_id:", dp.name)
                continue

            target = team_filename_for_id(team_dir, tid, dp.name)
            if target.exists():
                backup_csv_dir = backup_root / "teams_csv"
                backup_csv_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup_csv_dir/target.name)

            _, ins, rep = merge_csv(target, dp)
            total_inserts += ins
            total_replacements += rep
            affected_files.append(target)
            affected_ids.append(tid)

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
                    "source_batch": "DELTA_V1",
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
                    "source_batch": "DELTA_V1",
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
                if cid not in set(allowed):
                    continue

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
                    "season_status_basis": md.get("season_status_basis") or "TITAN_DELTA_V1",
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
                        "season_status_basis": md.get("season_status_basis") or "TITAN_DELTA_V1",
                        "phases": [],
                        "stages": [],
                        "regions": [reg] if reg else []
                    }
                    seasons_arr.append(sobj); season_index[sk] = sobj
                if md.get("season_status") == "CURRENT":
                    sobj["season_status"] = "CURRENT"
                    sobj["season_status_basis"] = md.get("season_status_basis") or "TITAN_DELTA_V1"
                phases = list(sobj.get("phases") or [])
                if phase and phase not in phases: phases.append(phase)
                sobj["phases"] = phases
                stages = list(sobj.get("stages") or [])
                if stage and stage not in stages: stages.append(stage)
                sobj["stages"] = stages
                regs = list(sobj.get("regions") or [])
                if reg and reg not in regs: regs.append(reg)
                sobj["regions"] = regs

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
            "sync_version": "TITAN_SYNC_V1",
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
            "schema_version": "incastats.titan_sync.v1",
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

        print("\n" + "="*66)
        print("SYNC TERMINADO")
        print("="*66)
        print("Archivos de equipos modificados:", len(set(affected_files)))
        print("Filas nuevas insertadas:", total_inserts)
        print("Filas DELTA reemplazadas:", total_replacements)
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
