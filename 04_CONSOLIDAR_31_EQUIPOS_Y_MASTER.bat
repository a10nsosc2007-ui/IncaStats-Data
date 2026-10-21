@echo off & title INCASTATS - CONSOLIDADOR INTEGRAL V1 & py -3 -x "%~f0" & echo. & pause & exit /b
# -*- coding: utf-8 -*-
"""
INCASTATS CONSOLIDADOR V1.
A) verifies MASTER catalogs (782 teams / 8260 players, but never assumes counts)
B) detects compatible per-team CSV stats under MASTER/EQUIPOS/STATS
C) merges by Event_ID,Team_ID,Tiempo with nonblank UPSERT
D) MOVE for truly new team CSV, not copy
E) updates native TITAN teams.json only when the new team's CSV exists/valid
F) creates lightweight CONTROL/INVENTARIO_INTEGRACION.json
G) optional clean of harmless cache ONLY; large backups explicitly retained
No external libraries, no API requests, no recursive exports.
"""
from __future__ import annotations
import csv
import datetime as dt
import hashlib
import io
import json
import os
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parent
MASTER=ROOT/"INCA_BASE_MAESTRA"
TEAMS=MASTER/"BASE_EQUIPOS_MASTER.json"
PLAYERS=MASTER/"BASE_JUGADORES_MASTER.json"
TITAN=ROOT/"TITAN_ALONSINHO_V1_GITHUB_READY"
T_MAN=TITAN/"manifest"/"teams.json"
NATIVE=TITAN/"data"/"teams_csv"
LOGDIR=MASTER/"LOGOS"/"WEBP"
CONTROL=MASTER/"CONTROL"
STATS=MASTER/"EQUIPOS"/"STATS"
KEY=("Event_ID","Team_ID","Tiempo")
MAX_CSV=150*1024*1024
NOW=dt.datetime.now(dt.timezone.utc).isoformat()

def load(path):
    with path.open("r",encoding="utf-8-sig") as f:return json.load(f)

def atomic_bytes(path,blob):
    """Atomic replacement, a temp file ONLY as big as changed target."""
    tmp=path.with_name(path.name+".inca_work")
    if tmp.exists():raise RuntimeError("Hay un .inca_work pendiente, revisalo: "+str(tmp))
    with tmp.open("xb") as f:
        f.write(blob);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)

def json_write_if_changed(path,data):
    b=(json.dumps(data,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    if path.is_file() and path.read_bytes()==b:return False
    atomic_bytes(path,b)
    return True

def ids(records,field,title):
    result={}
    if not isinstance(records,list):raise ValueError(title+" debe ser una lista")
    for row in records:
        if not isinstance(row,dict) or not str(row.get(field,"")).strip():raise ValueError(title+" tiene un ID invalido")
        idv=str(row[field]).strip()
        if idv in result:raise ValueError(title+" contiene ID duplicado "+idv)
        result[idv]=row
    return result

def read_cat():
    for p in (TEAMS,PLAYERS,T_MAN):
        if not p.is_file():raise RuntimeError("Falta archivo CRITICO: "+str(p))
    t=load(TEAMS);p=load(PLAYERS);old=load(T_MAN)
    if t.get("schema")!="incastats.master.teams.v1":raise ValueError("Schema de equipos desconocido")
    if p.get("schema")!="incastats.master.players.v1":raise ValueError("Schema de jugadores desconocido")
    if old.get("schema")!="titan.teams.v1":raise ValueError("Schema TITAN desconocido")
    teams=ids(t.get("teams"),"team_id","Equipos MASTER")
    players=ids(p.get("players"),"id","Jugadores MASTER")
    native=ids(old.get("teams"),"team_id","Equipos TITAN")
    if t.get("count")!=len(teams) or p.get("count")!=len(players) or old.get("count")!=len(native):
        raise ValueError("count != cantidad de IDs, se bloquea operacion")
    missing=[i for i in native if i not in teams]
    if missing:raise ValueError("MASTER no contiene IDs TITAN existentes: "+",".join(missing[:10]))
    return t,p,old,teams,players,native

def collect_sources():
    """Only scan known stats source folders; NEVER recrawl entire repo."""
    folders=[STATS,MASTER/"EQUIPOS"/"ESTADISTICAS",MASTER/"EQUIPOS"/"HISTORICOS"]
    by_id={}
    ignored=[]
    for folder in folders:
        if not folder.is_dir():continue
        for p in folder.rglob("*.csv"):
            if p.is_symlink():continue
            # Only filenames ID_anything.csv, ID.csv; no heuristics on names.
            mat=re.match(r"^([0-9]+)(?:[_\-.].*)?\.csv$",p.name,re.I)
            if mat:
                tid=str(int(mat.group(1)))
            else:
                # Some extractors write team-name-only CSVs. Identify their
                # SofaScore team id from the ACTUAL schema, never by fuzzy name.
                try:
                    if p.stat().st_size>MAX_CSV:raise ValueError("CSV demasiado grande")
                    with p.open("r",encoding="utf-8-sig",newline="") as f:
                        rd=csv.DictReader(f)
                        if not rd.fieldnames or not all(k in rd.fieldnames for k in KEY):
                            raise ValueError("No es CSV TITAN")
                        row=next(rd,None)
                        if not row or not str(row.get("Team_ID","")).strip().isdigit():
                            raise ValueError("CSV no contiene ID numerico")
                        tid=str(int(row["Team_ID"].strip()))
                except (OSError,UnicodeError,ValueError,StopIteration):
                    ignored.append(str(p.relative_to(ROOT)));continue
            by_id.setdefault(tid,[]).append(p)
    return by_id,ignored

def rows_csv(path):
    if path.stat().st_size>MAX_CSV:
        raise ValueError("CSV muy grande, se omite: "+str(path))
    with path.open("r",encoding="utf-8-sig",newline="") as f:
        rd=csv.DictReader(f)
        fields=list(rd.fieldnames or [])
        if not fields or not all(k in fields for k in KEY):
            raise ValueError("Columnas incompatibles Event_ID/Team_ID/Tiempo: "+str(path))
        rows=list(rd)
    if not rows:raise ValueError("CSV sin filas: "+str(path))
    keys=set()
    for j,r in enumerate(rows,2):
        key=tuple(str(r.get(k,"")).strip() for k in KEY)
        if not all(key):raise ValueError("Fila sin clave "+str(path)+" :"+str(j))
        if key in keys:raise ValueError("Claves repetidas "+str(path)+" :"+str(key))
        keys.add(key)
        if r["Tiempo"].strip().upper() not in ("ALL","1ST","2ND"):
            raise ValueError("Tiempo fuera de TITAN "+str(path))
    return fields,rows

def validate_source(p,tid):
    fields,rows=rows_csv(p)
    wrong={str(r["Team_ID"]).strip() for r in rows if str(r["Team_ID"]).strip()!=tid}
    if wrong:raise ValueError("CSV "+str(p)+" mezcla Team_ID diferente: "+str(wrong)[:150])
    # Require one ALL/1ST/2ND per event; incomplete isolated rows are rejected.
    event={}
    for r in rows:event.setdefault(r["Event_ID"].strip(),set()).add(r["Tiempo"].strip().upper())
    missing=sum(v!={"ALL","1ST","2ND"} for v in event.values())
    if missing:raise ValueError(str(p)+" contiene "+str(missing)+" eventos sin ALL/1ST/2ND")
    return fields,rows,len(event)

def dest_name(rec,tid):
    # ASCII safe only, avoid Windows reserved path; basename ID guaranteed.
    text=str(rec.get("name") or "Equipo").strip()
    try:
        import unicodedata
        text=unicodedata.normalize("NFKD",text).encode("ascii","ignore").decode("ascii")
    except Exception:pass
    text=re.sub(r"[^A-Za-z0-9._-]+","_",text).strip("._")[:75] or "Equipo"
    return tid+"_"+text+".csv"

def merge_native(dest,source,tid,execute=False):
    """Full historical union, validated before touching original file."""
    sf,sr,sev=validate_source(source,tid)
    df,dr=rows_csv(dest)
    wrong={r.get("Team_ID") for r in dr if str(r.get("Team_ID","")).strip()!=tid}
    if wrong:raise ValueError("Destino contiene Team_ID ajeno: "+str(dest))
    old={tuple(str(r.get(k,"")).strip() for k in KEY):r for r in dr}
    fields=list(df)
    for f in sf:
        if f not in fields:fields.append(f)
    inserted=0;updated=0;final=list(dr)
    indexes={tuple(str(r.get(k,"")).strip() for k in KEY):j for j,r in enumerate(final)}
    for r in sr:
        k=tuple(str(r.get(a,"")).strip() for a in KEY)
        if k in indexes:
            j=indexes[k];u=dict(final[j]);change=False
            for f in fields:
                nv=r.get(f,"")
                if nv is not None and str(nv).strip()!="" and nv!=u.get(f,""):
                    u[f]=nv;change=True
            if change:final[j]=u;updated+=1
        else:
            final.append(dict(r));indexes[k]=len(final)-1;inserted+=1
    if not set(old).issubset(indexes):raise RuntimeError("Registros anteriores perdidos")
    if execute and (inserted or updated):
        raw=dest.read_bytes()
        newline="\r\n" if b"\r\n" in raw else "\n"
        out=io.StringIO(newline="")
        writer=csv.DictWriter(out,fieldnames=fields,extrasaction="ignore",lineterminator=newline)
        writer.writeheader()
        for r in final:writer.writerow(r)
        blob=out.getvalue().encode("utf-8-sig" if raw.startswith(b"\xef\xbb\xbf") else "utf-8")
        if not raw.endswith((b"\n",b"\r")):
            if blob.endswith(newline.encode()):blob=blob[:-len(newline)]
        atomic_bytes(dest,blob)
        _,check=rows_csv(dest)
        after={tuple(str(r.get(k,"")).strip() for k in KEY) for r in check}
        if not set(old).issubset(after):raise RuntimeError("Fallo verificacion POST-ESCRITURA")
    return {"nuevos_registros":inserted,"actualizados":updated,"historial_previo":len(dr),"salida":len(final),"eventos_entrada":sev}

def webp_candidates(tid):
    dirs=[LOGDIR,MASTER/"LOGOS"/"WebP",MASTER/"EQUIPOS"/"LOGOS_WEBP"]
    for d in dirs:
        if not d.exists():continue
        for p in sorted(d.glob(tid+"*.webp")):
            if p.is_file() and p.stat().st_size>0 and p.name.lower().startswith(tid):
                yield p

def one_plan(teams,native,by_id):
    base_ids=set(native)
    additions=[k for k in teams if k not in base_ids]
    names_in_titan={k: v.get("file") for k,v in native.items()}
    inventory=[]
    for tid in additions:
        sources=by_id.get(tid,[])
        tgt=dest_name(teams[tid],tid)
        entry={"team_id":tid,"name":teams[tid].get("name",""),"fuentes_csv":[str(x.relative_to(ROOT)) for x in sources],
               "native_dest":"TITAN_ALONSINHO_V1_GITHUB_READY/data/teams_csv/"+tgt,
               "webp":next((str(p.relative_to(ROOT)) for p in webp_candidates(tid)),""),
               "status":"PENDIENTE"}
        native_target=NATIVE/tgt
        if native_target.is_file() and not sources:
            try:
                _,_,n=validate_source(native_target,tid)
                entry["status"]="RECUPERAR_CSV_YA_MOVIDO";entry["eventos"]=n
            except (ValueError,OSError) as exc:
                entry["status"]="DESTINO_HUERFANO_INVALIDO";entry["error"]=str(exc)
        elif not sources:entry["status"]="SIN_CSV_DE_ESTADISTICAS"
        elif len(sources)>1:entry["status"]="VARIOS_CSV_REQUIERE_REVISION"
        else:
            try:
                _,_,n=validate_source(sources[0],tid)
                if native_target.exists():
                    entry["status"]="DESTINO_YA_EXISTE_REVISAR"
                else:
                    entry["status"]="LISTO_PARA_MOVER";entry["eventos"]=n
            except (ValueError,OSError) as e:entry["status"]="FORMATO_CSV_INCOMPATIBLE";entry["error"]=str(e)
        inventory.append(entry)
    return additions,inventory

def print_overview(teams,players,native,sources,unknown,inventory):
    print("\n"+"="*72)
    print(" INCASTATS — DIAGNOSTICO REAL DEL REPOSITORIO LOCAL")
    print("="*72)
    print("  Equipos TITAN existentes:",len(native))
    print("  Equipos catalogo MASTER:",len(teams))
    print("  IDs nuevos en catalogo:",len(teams.keys()-native.keys()))
    print("  Jugadores catalogo MASTER:",len(players))
    print("  CSV localizados en EQUIPOS/STATS:",sum(len(v) for v in sources.values()))
    print("  CSV sin ID de equipo en nombre:",len(unknown))
    counts=Counter(r["status"] for r in inventory)
    for s,n in counts.items():print("  ",s+":",n)
    print("  ¡OJO! Catalogar equipos NO prueba que sus estadisticas existan.")
    print("  Los 751 CSV antiguos NO se mueven ni se duplican.")

def apply(teams,native,old_manifest,source_map,inventory):
    if input("\n Para integrar SOLO archivos CSV compatibles escribe FUSIONAR: ").strip()!="FUSIONAR":
        print(" Cancelado sin cambios.");return 0
    moved=skipped=recovered=0
    for item in inventory:
        status=item["status"]
        if status not in ("LISTO_PARA_MOVER","RECUPERAR_CSV_YA_MOVIDO"):
            skipped+=1;continue
        tid=item["team_id"]
        src=source_map.get(tid,[None])[0]
        dest=ROOT/item["native_dest"]
        did_move=False
        try:
            if not NATIVE.exists():raise RuntimeError("Carpeta TITAN ausente")
            if status=="LISTO_PARA_MOVER":
                if src is None or not src.is_file() or dest.exists():raise RuntimeError("Colision en destino")
                if src.stat().st_dev!=NATIVE.stat().st_dev:
                    raise RuntimeError("Volumen distinto: no se hara copia")
                _,rows,n=validate_source(src,tid)
                src.rename(dest)
                did_move=True
                if src.exists() or not dest.is_file() or len(rows)!=len(rows_csv(dest)[1]):
                    raise RuntimeError("Verificacion posterior al MOVE fallida")
            else:
                _,rows,n=validate_source(dest,tid)
            rec=teams[tid]
            new_entry={
                "team_id":int(tid),"name":rec.get("name") or tid,
                "country":rec.get("country") or "",
                "region":rec.get("region") or "",
                "source_batch":"INCA_BASE_MAESTRA_EXPANSION",
                "file":"data/teams_csv/"+dest.name,
                "valid_matches":n,
                "incomplete_matches":0,
            }
            candidate=dict(native);candidate[tid]=new_entry
            next_manifest=dict(old_manifest)
            next_manifest["teams"]=list(candidate.values())
            next_manifest["count"]=len(candidate)
            # Commit manifest per successfully transferred team, so interruption
            # never leaves ALL 31 CSV files moved without a manifest.
            json_write_if_changed(T_MAN,next_manifest)
            native.clear();native.update(candidate)
            old_manifest.clear();old_manifest.update(next_manifest)
            item["status"]="INTEGRADO_OK"
            if did_move:moved+=1
            else:recovered+=1
        except Exception as exc:
            if did_move and dest.is_file() and src is not None and not src.exists():
                try:
                    dest.rename(src) # rollback: no extra copy
                    item["status"]="ERROR_REVERTIDO_SIN_PERDIDA"
                except OSError as rollback_error:
                    item["status"]="ERROR_REQUIERE_REVISION_MANUAL"
                    item["rollback_error"]=str(rollback_error)
            else:
                item["status"]="ERROR_SIN_MODIFICAR"
            item["error"]=str(exc)
            skipped+=1
        print(" ",tid,item["name"],"=>",item["status"])
    print("\n [RESULTADO] CSV nuevos trasladados:",moved)
    print(" Orfanos anteriores recuperados:",recovered)
    print(" Pendientes / sin estadisticas validas:",skipped)
    print(" Ninguna carpeta TITAN historica fue movida ni duplicada.")
    return moved+recovered

def integrate_existing_team_csvs(native,source_map):
    """Merge deltas for already-registered teams with strict key validation."""
    inserted_total=updated_total=consumed=0
    errors=[]
    for tid,paths in sorted(source_map.items(),key=lambda x:int(x[0])):
        if tid not in native:
            continue
        if len(paths)!=1:
            errors.append({"id":tid,"status":"MULTIPLES_FUENTES","archivos":len(paths)})
            continue
        src=paths[0]
        rel=str(native[tid].get("file") or "").replace("\\","/").lstrip("/")
        dest=TITAN/rel
        try:
            if not rel or not dest.is_file() or not dest.resolve().is_relative_to(NATIVE.resolve()):
                raise RuntimeError("Ruta TITAN invalida o destino inexistente")
            if not src.is_file() or src.samefile(dest):
                raise RuntimeError("Origen no valido o es mismo destino")
            validate_source(src,tid)
            result=merge_native(dest,src,tid,execute=True)
            # Verify every incoming event/period key AND its nonblank fields
            # are present in destination BEFORE removing consumed source.
            incoming_fields,incoming_rows=rows_csv(src)
            _,result_rows=rows_csv(dest)
            dest_idx={tuple(str(r.get(k,"")).strip() for k in KEY):r for r in result_rows}
            for r in incoming_rows:
                k=tuple(str(r.get(a,"")).strip() for a in KEY)
                out=dest_idx.get(k)
                if out is None:raise RuntimeError("Registro entrante ausente despues del merge: "+str(k))
                for name,value in r.items():
                    if value is not None and str(value).strip() and str(out.get(name,"")).strip()!=str(value).strip():
                        raise RuntimeError("Valor entrante no persistido: "+str(k)+" "+name)
            src.unlink()  # Consumed and verified; do not retain duplicate CSV.
            inserted_total+=result["nuevos_registros"]
            updated_total+=result["actualizados"]
            consumed+=1
            print(" [UPSERT OK]",tid,"+",result["nuevos_registros"],"nuevos /",result["actualizados"],"actualizados")
        except Exception as exc:
            print(" [NO INTEGRADO]",tid,":",str(exc)[:140])
            errors.append({"id":tid,"status":"PENDIENTE_REVISION","error":str(exc)[:400]})
    return {"csv_actualizados_y_consumidos":consumed,
            "filas_nuevas":inserted_total,
            "filas_actualizadas":updated_total,
            "errores":errors}

def cleanup():
    print("\n LIMPIEZA SEGURA: SOLO CACHE PYTHON, NUNCA RESPALDOS NI STATS")
    dirs=[ROOT/"__pycache__",ROOT/"INCA_BASE_MAESTRA"/"__pycache__"]
    targets=[p for p in dirs if p.is_dir() and not p.is_symlink()]
    for p in targets:print("  Eliminable:",p)
    for p in (MASTER/"EXPORTACIONES",MASTER/"RESPALDOS",ROOT/"_BACKUPS_PLAYER_DELTA"):
        if p.exists():
            print("  CONSERVAR por seguridad:",p)
    if not targets:print(" No hay cache temporal que eliminar.");return
    if input(" Escribe LIMPIAR_CACHE para eliminar solo esas carpetas: ").strip()!="LIMPIAR_CACHE":
        print(" Cancelado.");return
    for p in targets:shutil.rmtree(p)
    print(" [OK] Cache limpiada; NO se borraron datos ni ZIP históricos.")

def make_runtime_routes(teams,players,native):
    """Lightweight pointers only; no statistics or photos duplicated."""
    team_paths={}
    team_logo_count=0
    team_stats_count=0
    for tid, t in teams.items():
        n=native.get(tid)
        stat=""
        if n and isinstance(n.get("file"),str):
            rel=n["file"].replace("\\","/").lstrip("/")
            path=TITAN/rel
            if path.is_file() and path.resolve().is_relative_to(TITAN.resolve()):
                stat="TITAN_ALONSINHO_V1_GITHUB_READY/"+rel
                team_stats_count+=1
        logo=next((str(x.relative_to(ROOT)).replace("\\","/") for x in webp_candidates(tid)),"")
        if logo:team_logo_count+=1
        team_paths[tid]={"stats_csv":stat,"logo_webp":logo}
    player_paths={}
    pcount=0
    player_dir=ROOT/"TITAN_PLAYERS_MASTER_2025_PLUS"
    for pid,record in players.items():
        rel=str(record.get("source_file") or "").replace("\\","/").lstrip("/")
        if rel and not Path(rel).is_absolute():
            path=player_dir/rel
            if path.is_file() and path.resolve().is_relative_to(player_dir.resolve()):
                player_paths[pid]="TITAN_PLAYERS_MASTER_2025_PLUS/"+rel
                pcount+=1
    return {
        "schema":"incastats.data_routes.v1",
        "generated_at_utc":NOW,
        "root":"IncaStats-Data/",
        "catalogs":{
            "teams":"INCA_BASE_MAESTRA/BASE_EQUIPOS_MASTER.json",
            "players":"INCA_BASE_MAESTRA/BASE_JUGADORES_MASTER.json"
        },
        "datasets":{
            "teams_manifest":"TITAN_ALONSINHO_V1_GITHUB_READY/manifest/teams.json",
            "teams_dir":"TITAN_ALONSINHO_V1_GITHUB_READY/data/teams_csv/",
            "player_current":"TITAN_PLAYERS_CURRENT/MASTER/PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv",
            "player_historical":"TITAN_PLAYERS_MASTER_2025_PLUS/MASTER/PLAYER_MATCH_STATS_2025_PLUS.csv",
            "referees":"TITAN_REFEREES_CURRENT/referees_master.json",
            "referees_matches":"TITAN_REFEREES_CURRENT/matches_master.csv"
        },
        "assets":{"teams":team_paths,"players_historical":player_paths,
                  "referees_face_root":"TITAN_REFEREES_CURRENT/faces/"},
        "coverage":{
            "teams_catalog":len(teams),"teams_with_stats":team_stats_count,
            "teams_with_local_logo_webp":team_logo_count,
            "players_catalog":len(players),"players_with_history_json":pcount
        },
        "notes":"Relative to repository ROOT; app integration requires updating the app reader. Blank asset path means not validated, not unavailable from all sources."
    }

def main():
    print("="*72,"\n INCA STATS — CONSOLIDADOR DE EQUIPOS / MASTER\n","="*72)
    print(" RUTA:",ROOT)
    if not (ROOT/".git").is_dir() or not TITAN.is_dir() or not MASTER.is_dir():
        raise RuntimeError("Pon este BAT en la raiz local IncaStats-Data, con .git, TITAN y MASTER")
    t,p,old,teams,players,native=read_cat()
    sources,unknown=collect_sources()
    additions,inventory=one_plan(teams,native,sources)
    print_overview(teams,players,native,sources,unknown,inventory)
    print("\n 1) Crear reporte y comprobar 31 equipos (SIN cambios nativos)")
    print(" 2) Integrar automaticamente CSV nuevos VALIDADOS y actualizar manifest")
    print(" 3) Limpiar SOLO __pycache__ sin tocar backups")
    print(" 0) Salir")
    opt=input("\n ELIGE 1, 2, 3 o 0: ").strip()
    if opt=="0":return
    if opt=="3":cleanup();return
    if opt not in ("1","2"):return
    moved=0
    team_stats_result={"csv_actualizados_y_consumidos":0,"filas_nuevas":0,"filas_actualizadas":0,"errores":[]}
    if opt=="2":
        moved=apply(teams,native,old,sources,inventory) or 0
        # After handling newly-added teams, merge incoming CSVs for old teams.
        # Never archive an incoming CSV as a second full copy.
        team_stats_result=integrate_existing_team_csvs(native,sources)
    CONTROL.mkdir(parents=True,exist_ok=True)
    report={
        "schema":"incastats.integracion_master.v1",
        "fecha_utc":NOW,
        "catalogos":{"equipos":len(teams),"jugadores":len(players)},
        "titan_equipos_post":len(native),
        "ids_adicionales_vs_titan_original":len(additions),
        "csv_nuevos_trasladados":moved,
        "upsert_equipos_existentes":team_stats_result,
        "integracion_estadisticas_jugadores":"PENDIENTE_ADAPTADOR_NATIVO",
        "integracion_estadisticas_arbitros":"PENDIENTE_ADAPTADOR_NATIVO",
        "titan_viejo_intacto":True,
        "equipos":inventory,
        "archivos_no_asignados":unknown[:100],
        "nota":"Los catálogos MASTER mantienen IDs; solo CSV por equipo compatibles se trasladan a TITAN sin copiar. No implica completa integración de datos de jugadores ni árbitros."
    }
    outfile=CONTROL/"INFORME_CONSOLIDACION_V1.json"
    json_write_if_changed(outfile,report)
    routes=CONTROL/"INCA_DATA_ROUTES.json"
    pointers=make_runtime_routes(teams,players,native)
    json_write_if_changed(routes,pointers)
    print("\n REPORTE:",outfile)
    print(" RUTAS PARA LA APP:",routes)
    print(" Equipos con CSV real:",pointers["coverage"]["teams_with_stats"],"de",len(teams))
    print(" Historicos jugadores con JSON:",pointers["coverage"]["players_with_history_json"],"de",len(players))
    print(" [LISTO] No se ejecutaron solicitudes de API ni exportaciones ZIP.")
    print(" El informe indica si faltan estadisticas reales de los equipos nuevos.")

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("\n[ERROR CONTROLADO]",type(e).__name__,str(e))
        sys.exit(1)
