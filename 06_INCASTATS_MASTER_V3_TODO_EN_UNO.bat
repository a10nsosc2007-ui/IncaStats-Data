@echo off & title INCASTATS MASTER V3 - META / PLAYERS / LIMPIEZA & py -3 -x "%~f0" & echo. & pause & exit /b
# -*- coding: utf-8 -*-
"""INCA MASTER V3 - independent BAT/Python hybrid, no pip, no API requests.
All destructive actions require confirmation and a separate user-created backup.
Current app in Downloads is NOT modified. Partial reruns are idempotent by ID.
"""
from __future__ import annotations
import collections
import csv
import datetime
import io
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "INCA_BASE_MAESTRA"
TITAN = ROOT / "TITAN_ALONSINHO_V1_GITHUB_READY"
MAN = TITAN / "manifest"
TCSV = TITAN / "data" / "teams_csv"
PLAYER = ROOT / "TITAN_PLAYERS_MASTER_2025_PLUS"
TCAT = MASTER / "BASE_EQUIPOS_MASTER.json"
PCAT = MASTER / "BASE_JUGADORES_MASTER.json"
THIST = PLAYER / "MASTER" / "PLAYER_MATCH_STATS_2025_PLUS.csv"
DELTA = MASTER / "JUGADORES" / "PLAYER_MATCH_STATS_MASTER.csv"
TNAME = MAN / "teams.json"
GNAME = MAN / "manifest_global.json"
DNAME = MAN / "team_details.json"
CNAME = MAN / "competitions.json"
SNAME = MAN / "seasons.json"
PREPORT = MASTER / "CONTROL" / "INCA_V3_DIAGNOSTICO.json"
P_FIELDS = [
    "ID_Jugador","Jugador","Event_ID","Fecha","Competition_ID","Torneo",
    "Season_ID","Season","Team_ID","Equipo","Rival_ID","Rival","Condicion",
    "Posicion","Minutos_Jugados","Rating","Goles","Asistencias","xG_Esperados",
    "Tiros_Totales","Tiros_Al_Arco","Tiros_Al_Palo","Pases_Totales",
    "Pases_Acertados","Pases_Clave","Grandes_Ocasiones_Creadas",
    "Duelos_Ganados","Atajadas","Faltas_Cometidas","Faltas_Recibidas",
    "Entradas_Tackles","Intercepciones","Tarjetas","Tarjetas_Amarillas",
    "Tarjetas_Rojas","Offsides"
]

def readj(path):
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)

def encj(data):
    return (json.dumps(data, ensure_ascii=False, indent=2)+"\n").encode("utf-8")

def replace_atomic(path, b):
    """One small temporary file PER changed target, never copy the whole repo."""
    if path.is_file() and path.read_bytes() == b:
        return False
    tmp = path.with_name(path.name+".inca_v3_writing")
    if tmp.exists():
        raise RuntimeError("Temporal de escritura anterior, revisar antes de reintentar: "+str(tmp))
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tmp.open("xb") as f:
            f.write(b)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if tmp.exists():tmp.unlink()
    return True

def savej(path,data):
    return replace_atomic(path,encj(data))

def valid_list(payload, field, schema=None):
    if not isinstance(payload,dict) or not isinstance(payload.get(field),list):
        raise RuntimeError("El JSON no contiene "+field)
    if schema and payload.get("schema")!=schema:
        raise RuntimeError("Schema incorrecto: "+str(payload.get("schema")))
    return payload[field]

def byid(rows, field, label):
    result={}
    for r in rows:
        if not isinstance(r,dict) or r.get(field) is None:
            raise RuntimeError(label+" tiene registro sin ID")
        ident=str(r[field]).strip()
        if not ident or ident in result:
            raise RuntimeError(label+" tiene ID vacio o duplicado "+ident)
        result[ident]=r
    return result

def native_state():
    t=readj(TCAT);p=readj(PCAT);m=readj(TNAME);g=readj(GNAME)
    teams=byid(valid_list(t,"teams","incastats.master.teams.v1"),"team_id","MASTER EQUIPOS")
    players=byid(valid_list(p,"players","incastats.master.players.v1"),"id","MASTER JUGADORES")
    nt=byid(valid_list(m,"teams","titan.teams.v1"),"team_id","TITAN")
    for payload,arr,title in [(t,teams,"MASTER EQUIPOS"),(p,players,"MASTER JUGADORES"),(m,nt,"TITAN")]:
        if payload.get("count")!=len(arr):
            raise RuntimeError(title+": count no coincide con IDs unicos")
    if not set(nt).issubset(teams):
        raise RuntimeError("TITAN tiene IDs que no existen en MASTER, revisar.")
    if not isinstance(g.get("coverage"),dict) or not isinstance(g.get("counts"),dict):
        raise RuntimeError("GLOBAL sin esquema esperado")
    return t,p,m,g,teams,players,nt

def teamfile(item):
    rel=str(item.get("file") or "").replace("\\","/").lstrip("/")
    path=(TITAN/rel).resolve()
    if not rel or not path.is_relative_to(TCSV.resolve()):
        raise RuntimeError("Ruta CSV fuera del TITAN: "+rel)
    if not path.is_file():
        raise RuntimeError("Archivo no existe: "+str(path))
    return path

def check_team_rows(path, tid, pairs=None, events=None):
    count=0
    ev=set()
    with path.open("r",encoding="utf-8-sig",newline="") as f:
        rd=csv.DictReader(f)
        required={"Event_ID","Team_ID","Tiempo","Competition_ID","Season_ID"}
        if not required.issubset(rd.fieldnames or []):
            raise RuntimeError("CSV incompatibles: "+path.name)
        for row in rd:
            if str(row.get("Team_ID") or "").strip()!=str(tid):
                raise RuntimeError("ID equipo incorrecto: "+path.name)
            event=str(row.get("Event_ID") or "").strip()
            if not event:raise RuntimeError("Evento sin ID en "+path.name)
            count+=1
            ev.add(event)
            if events is not None:events.add(event)
            if pairs is not None:
                cid=str(row.get("Competition_ID") or "").strip()
                sid=str(row.get("Season_ID") or "").strip()
                if cid.isdigit() and sid.isdigit():
                    key=(int(cid),int(sid))
                    pair=pairs.setdefault(key,{"phases":set(),"stages":set(),"types":set(),"dates":[]})
                    if row.get("Competition_Phase"):pair["phases"].add(row["Competition_Phase"])
                    if row.get("Competition_Stage"):pair["stages"].add(row["Competition_Stage"])
                    if row.get("Competition_Type"):pair["types"].add(row["Competition_Type"])
                    if row.get("Fecha") and len(pair["dates"])<2:pair["dates"].append(row["Fecha"])
    return count,len(ev)

def inspect(full=False):
    t,p,m,g,teams,players,nt=native_state()
    missing_files=[];bad_files=[];added_files=[];seen=set()
    for tid,item in nt.items():
        try:
            path=teamfile(item)
            if full:
                check_team_rows(path,tid,events=seen)
            if item.get("source_batch")=="INCA_BASE_MAESTRA_EXPANSION":
                added_files.append(tid)
        except Exception as exc:
            bad_files.append({"id":tid,"error":str(exc)})
    hist_missing=0
    for pid,row in players.items():
        rel=str(row.get("source_file") or "").replace("\\","/")
        if not rel or not (PLAYER/rel).is_file():
            hist_missing+=1
    print("\n"+"="*70)
    print(" INCASTATS MASTER V3 - AUDITORIA DEL GITHUB LOCAL")
    print("="*70)
    print(" Equipos MASTER:",len(teams),"| TITAN:",len(nt))
    print(" Equipos expansion integrados:",len(added_files))
    print(" Jugadores MASTER:",len(players))
    print(" Jugadores sin ruta historical JSON en catalogo:",hist_missing)
    print(" Arbitros (TITAN):",
          readj(ROOT/"TITAN_REFEREES_CURRENT"/"manifest.json").get("referee_count","?"))
    print(" CSV nativos invalidos/ausentes:",len(bad_files))
    print(" manifest_global equipos:",g["coverage"].get("teams"))
    print(" manifest_global partidos:",g["counts"].get("unique_matches"))
    if full:print(" Partidos unicos verificados por CSV:",len(seen))
    for b in bad_files[:12]:print(" [PROBLEMA]",b)
    return (t,p,m,g,teams,players,nt,bad_files,seen)

def dates_range_from_label(label):
    s=str(label or "")
    m=re.search(r"(20\d{2})\s*[-/]\s*(20\d{2}|\d{2})",s)
    if m:
        a=int(m[1]);b=int(m[2]);b=b+2000 if b<100 else b
        return a,b
    m=re.search(r"\b(20\d{2})\b",s)
    if m:return int(m[1]),int(m[1])
    return 0,0

def player_competition_evidence():
    """Only real named competition+season labels from player historical CSV."""
    result={}
    if not THIST.is_file():return result
    with THIST.open("r",encoding="utf-8-sig",newline="") as f:
        rd=csv.DictReader(f)
        if not {"Competition_ID","Season_ID","Torneo","Season"}.issubset(rd.fieldnames or []):
            return result
        for row in rd:
            a=str(row.get("Competition_ID") or "").strip()
            b=str(row.get("Season_ID") or "").strip()
            if a.isdigit() and b.isdigit():
                key=(int(a),int(b))
                name=str(row.get("Torneo") or "").strip()
                label=str(row.get("Season") or "").strip()
                if name and label and key not in result:
                    result[key]={"name":name,"label":label}
    return result

def repair_metadata():
    t,p,m,g,teams,players,nt,bad,_=inspect(full=False)
    if bad:raise RuntimeError("Hay CSV nativos ausentes; se bloquea reparacion")
    # Read all known indices before writing any file.
    details=readj(DNAME);comps=readj(CNAME);seasons=readj(SNAME)
    detail_rows=valid_list(details,"teams")
    comp_rows=valid_list(comps,"competitions","titan.competitions.v1")
    season_rows=valid_list(seasons,"seasons","titan.seasons.v1")
    dm=byid(detail_rows,"team_id","DETALLES")
    cm=byid(comp_rows,"competition_id","COMPETICIONES")
    sm={(str(r.get("competition_id")),str(r.get("season_id"))):r for r in season_rows}
    evidence=player_competition_evidence()
    missing_evidence=set()
    created_detail=created_comp=created_season=0
    # Repair ALL missing team_detail entries, not only explicitly tagged 31.
    for tid,item in nt.items():
        if tid in dm:continue
        pairs={}
        path=teamfile(item)
        rows,unique=check_team_rows(path,tid,pairs=pairs)
        if not pairs:
            print(" [AVISO] sin competiciones verificables:",tid)
            continue
        d={
            "team_id":int(tid),"name":item.get("name") or teams[tid].get("name") or tid,
            "country":item.get("country") or teams[tid].get("country") or "",
            "region":item.get("region") or "",
            "source_batch":item.get("source_batch") or "INCA_BASE_MAESTRA_EXPANSION",
            "file":item.get("file"),"valid_matches":unique,
            "incomplete_matches":0,"competition_details":[]
        }
        for (cid,sid),info in pairs.items():
            ck=str(cid); sk=(str(cid),str(sid))
            ev=evidence.get((cid,sid),{})
            name=cm.get(ck,{}).get("name") or ev.get("name") or ""
            label=sm.get(sk,{}).get("label") or ev.get("label") or ""
            if not name or not label:
                missing_evidence.add(sk)
            kind=sorted(info["types"])[0] if info["types"] else ""
            if ck not in cm and name:
                cm[ck]={"competition_id":cid,"name":name,
                        "competition_type":kind or "UNKNOWN",
                        "regions":[],"season_ids":[sid]}
                comp_rows.append(cm[ck]);created_comp+=1
            if ck in cm:
                ss=cm[ck].setdefault("season_ids",[])
                if sid not in ss:ss.append(sid)
            if sk not in sm and label:
                start,end=dates_range_from_label(label)
                sm[sk]={"competition_id":cid,"season_id":sid,"label":label,
                        "start_year":start,"end_year":end,
                        "season_format":"NORMAL" if start!=end else "CALENDAR",
                        "competition_type":kind or "UNKNOWN",
                        "season_status":"FINISHED" if end and end<2026 else "UNKNOWN",
                        "season_status_basis":"INCA_V3_REAL_SOURCE_LABEL",
                        "phases":sorted(info["phases"]),
                        "stages":sorted(info["stages"]),"regions":[]}
                season_rows.append(sm[sk]);created_season+=1
            d["competition_details"].append({
                "competition_id":cid,"competition_name":name,
                "season_id":sid,"season_label":label,
                "start_year":sm.get(sk,{}).get("start_year",0),
                "end_year":sm.get(sk,{}).get("end_year",0),
                "competition_phase":sorted(info["phases"])[0] if info["phases"] else "",
                "competition_stage":sorted(info["stages"])[0] if info["stages"] else "",
                "competition_type":kind,
                "season_format":sm.get(sk,{}).get("season_format",""),
            })
        dm[tid]=d;detail_rows.append(d);created_detail+=1
    details["count"]=len(detail_rows)
    comps["count"]=len(comp_rows)
    seasons["count"]=len(season_rows)
    # Recount verified unique Event_ID across all 782 historical CSVs.
    all_events=set()
    for idx,(tid,row) in enumerate(nt.items(),1):
        check_team_rows(teamfile(row),tid,events=all_events)
        if idx%150==0:print(" Revisados",idx,"de",len(nt),"CSV ...")
    g["coverage"]["teams"]=len(nt)
    g["coverage"]["regions"]=dict(collections.Counter(
        str(v.get("region") or "").strip() or "Unknown" for v in nt.values()))
    countries={str(v.get("country")).strip() for v in nt.values() if str(v.get("country") or "").strip()}
    g["coverage"]["countries"]=len(countries)
    g["counts"]["unique_matches"]=len(all_events)
    g["counts"]["competitions"]=len(comp_rows)
    g["counts"]["competition_seasons"]=len(season_rows)
    print("\n METADATA V3 -- PREVIA:")
    print(" team_details nuevos:",created_detail)
    print(" competiciones con nombre verificado nuevas:",created_comp)
    print(" temporadas con etiqueta real nuevas:",created_season)
    print(" combinaciones SIN nombre/etiqueta corroborada:",len(missing_evidence))
    print(" partidos unicos reales:",len(all_events))
    print(" NO se fabricaran nombres de competiciones ni etiquetas de temporada.")
    if input(" Escribe REPARAR_META para guardar estos 4 metadatos: ").strip()!="REPARAR_META":
        print(" Cancelado; ningun archivo modificado.");return
    paths=[(DNAME,details),(CNAME,comps),(SNAME,seasons),(GNAME,g)]
    changed=0
    for path,obj in paths:
        result=savej(path,obj)
        changed+=int(result)
        print("  ",path.name,"ACTUALIZADO" if result else "SIN CAMBIOS")
    report={"schema":"incastats.v3.meta_report","teams":len(nt),
            "details":len(detail_rows),"competitions":len(comp_rows),
            "seasons":len(season_rows),"matches_unique":len(all_events),
            "source_labels_missing":sorted([list(x) for x in missing_evidence]),
            "changed_files":changed,
            "warning":"La app local puede necesitar refrescar fast-assets; meta reparada no significa app ya actualizada."}
    savej(PREPORT,report)
    print("\n META reparada. Usa BAT 05 para reconstruir indices locales de la APP si son compatibles.")

def csv_rows(path):
    with path.open("r",encoding="utf-8-sig",newline="") as f:
        rd=csv.DictReader(f)
        fields=rd.fieldnames or []
        if not {"ID_Jugador","Event_ID"}.issubset(fields):
            raise RuntimeError("CSV sin ID_Jugador / Event_ID: "+str(path))
        records={}
        for row in rd:
            pid=str(row.get("ID_Jugador") or "").strip()
            eid=str(row.get("Event_ID") or "").strip()
            if not pid or not eid:raise RuntimeError("CSV contiene ID nulo")
            key=(pid,eid)
            if key in records:raise RuntimeError("Duplicado interno "+str(key)+" en "+path.name)
            records[key]=row
    return records,fields

def players_preview():
    if not DELTA.is_file() or not THIST.is_file():
        raise RuntimeError("Faltan CSV nativos o delta jugadores")
    incoming,fields=csv_rows(DELTA)
    old,ofields=csv_rows(THIST)
    required={"ID_Jugador","Event_ID","Fecha","Team_ID","Competition_ID"}
    if not required.issubset(fields):
        raise RuntimeError("CSV delta no es compatible (faltan): "+str(required-set(fields)))
    if not set(P_FIELDS).issubset(set(ofields)):
        raise RuntimeError("Historial TITAN tiene campos inesperados")
    extra=[x for x in fields if x not in P_FIELDS]
    added=set(incoming)-set(old)
    replaced=set(incoming)&set(old)
    ids_delta={p for p,_ in incoming}
    report={"master_rows":len(old),"delta_rows":len(incoming),
            "new_match_rows":len(added),"overlapping_keys":len(replaced),
            "affected_players":len(ids_delta),
            "delta_extra_columns":extra,"accepted_core_keys":True}
    print("\n JUGADORES: ESTADISTICAS REALES (vista previa)")
    for k,v in report.items():print(" ",k,":",v)
    print(" MASTER conserva historial; CURRENT no se modifica;")
    print(" el analizador seguirá priorizando CURRENT en fechas superpuestas.")
    return report,incoming,old,fields,ofields

def parse_date(s):
    text=str(s or "").strip()
    for fmt in ("%d/%m/%Y","%Y-%m-%d"):
        try:return datetime.datetime.strptime(text,fmt)
        except ValueError:pass
    return datetime.datetime.min

def integrate_player_history():
    report,delta,old,fields,ofields=players_preview()
    extra=report["delta_extra_columns"]
    if extra:
        print("\n [ALERTA] Hay columnas EXTRA sin contrato TITAN. No se aplicaran (quedan en origen).")
    if input("\n Escribe INTEGRAR_PLAYERS para fusionar DELTA con historico: ").strip()!="INTEGRAR_PLAYERS":
        print(" Cancelado.");return
    # Keep metadata from existing records; only non-empty matching columns update.
    merged=dict(old);affected=set()
    for key,row in delta.items():
        affected.add(key[0])
        if key in merged:
            dest=dict(merged[key])
            for f in P_FIELDS:
                v=row.get(f)
                if v is not None and str(v).strip()!="":dest[f]=v
            merged[key]=dest
        else:
            merged[key]={f:row.get(f,"") for f in P_FIELDS}
    # Check that all historical keys are preserved; no destructive concat.
    if not set(old).issubset(merged) or len(merged)!=len(old)+report["new_match_rows"]:
        raise RuntimeError("Integridad keyset fallida, no se escribe nada.")
    packed=list(merged.values())
    packed.sort(key=lambda r:(parse_date(r.get("Fecha")),
                str(r.get("Event_ID") or ""),str(r.get("ID_Jugador") or "")))
    temp=THIST.with_name(THIST.name+".inca_v3_writing")
    if temp.exists():raise RuntimeError("Existe temporal anterior: "+str(temp))
    # Stream to temp, avoid creating 60GB recursive archives.
    with temp.open("x",encoding="utf-8-sig",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=P_FIELDS,extrasaction="ignore")
        writer.writeheader();writer.writerows(packed)
    check,check_fields=csv_rows(temp)
    if len(check)!=len(merged) or not set(old).issubset(check):
        raise RuntimeError("Validacion temporal fallida. Se conserva temporal para inspeccion.")
    os.replace(temp,THIST)
    print(" [OK] Historial MASTER:",len(old),"->",len(check))
    # Update player BY_PLAYER shard only for affected IDs.
    byplayer=collections.defaultdict(list)
    for row in packed:
        pid=str(row.get("ID_Jugador") or "")
        if pid in affected:byplayer[pid].append(row)
    for pid,rows in byplayer.items():
        if not pid.isdigit():continue
        rows.sort(key=lambda r:parse_date(r.get("Fecha")),reverse=True)
        target=PLAYER/"BY_PLAYER"/f"{int(pid)%100:02d}"/(pid+".json")
        obj={"schema_version":"incastats.player_history.v1",
             "player_id":pid,"fields":P_FIELDS,
             "rows":[[r.get(f,"") for f in P_FIELDS] for r in rows]}
        savej(target,obj)
    # Update INDEX & manifest player metadata only when based on REAL new rows.
    index_path=PLAYER/"INDEX"/"players.json"
    manifest_path=PLAYER/"manifest.json"
    index=readj(index_path);manifest=readj(manifest_path)
    if not isinstance(index,list) or not isinstance(manifest.get("players"),list):
        raise RuntimeError("Indice/manifest de jugadores inesperados (historico ya salvo)")
    ix=byid(index,"id","INDEX")
    mi=byid(manifest["players"],"id","MANIFEST")
    for pid,rows in byplayer.items():
        latest=rows[0]
        for dest in (ix,mi):
            row=dict(dest.get(pid,{}))
            row.setdefault("id",pid)
            if not row.get("name"):row["name"]=latest.get("Jugador") or "Jugador "+pid
            row["matches"]=len(rows)
            if pid.isdigit():row["file"]=f"BY_PLAYER/{int(pid)%100:02d}/{pid}.json"
            row["last_date"]=parse_date(latest.get("Fecha")).strftime("%Y-%m-%d")
            dest[pid]=row
    manifest["players"]=list(mi.values())
    counts=manifest.setdefault("counts",{})
    counts["final_rows"]=len(packed)
    counts["players_with_history"]=len({x[0] for x in merged})
    counts["unique_events"]=len({x[1] for x in merged})
    if "players" in counts:counts["players"]=len(mi)
    if "final_players" in counts:counts["final_players"]=len(mi)
    savej(index_path,list(ix.values()))
    savej(manifest_path,manifest)
    # The historical RECENT file stays unchanged if not reproducible from
    # current compatible schema. Prevent false/stale recent picks by warning.
    print(" [ATENCION] RECENT/recent20.json y CURRENT siguen sin reconstruir.")
    print(" No consideres terminados los Player Picks hasta implementar ese overlay.")
    print(" Origen DELTA conservado para verificaciones (6-7 MB, no gigas).")

def cleanup():
    # Only safe regenerable bytecode. Old scripts/data remain.
    caches=[]
    for p in ROOT.rglob("__pycache__"):
        if ".git" in p.parts:continue
        if p.is_dir() and not p.is_symlink():caches.append(p)
    print("\n CACHES REGENERABLES:",len(caches))
    for p in caches[:25]:print(" ",p.relative_to(ROOT))
    for danger in ("_BACKUPS_PLAYER_DELTA","INBOX_PLAYER_DELTA","TITAN_PLAYERS_MASTER_2025_PLUS",
                   "TITAN_REFEREES_CURRENT","INCA_BASE_MAESTRA"):
        print(" [PROTEGIDO] NO BORRAR:",danger)
    if not caches:
        print(" Nada que limpiar.");return
    if input("\n Escribe ELIMINAR_CACHE para BORRAR SOLO __pycache__: ").strip()!="ELIMINAR_CACHE":
        print(" Cancelado.");return
    for p in caches:shutil.rmtree(p)
    print(" [LISTO] Cache eliminada. Ningun JSON/CSV/TITAN/backups tocado.")

def archive_old():
    candidates=[
        "00_AUDITAR_INCASTATS.bat",
        "00_ORGANIZAR_INCASTATS_MASTER.bat",
        "01_ACTUALIZAR_EQUIPOS_MASTER.bat",
        "02_ACTUALIZAR_JUGADORES_ARBITROS.bat",
        "03_AUDITAR_ACTUALIZADORES_MASTER.bat"
    ]
    dest=ROOT/"HERRAMIENTAS"/"LEGACY_BATS"
    present=[p for n in candidates if (p:=ROOT/n).is_file()]
    print("\n BATS antiguos propuestos para ARCHIVAR (NO BORRAR):")
    for p in present:print(" ",p.name)
    print(" Se conservan 04, 05, TITAN_SYNC_V3_UNIFIED.py, apply_player_delta.py")
    print(" y los generadores/validadores. No se cambia ni un byte de ellos.")
    if not present:return
    if input("\n Escribe ARCHIVAR para trasladar estos BATS: ").strip()!="ARCHIVAR":
        print(" Cancelado.");return
    dest.mkdir(parents=True,exist_ok=True)
    for p in present:
        out=dest/p.name
        if out.exists():
            print(" [COLISION, NO SE MUEVE]",p);continue
        p.rename(out)
        print(" [TRASLADADO]",p.name)
    print(" GitHub Desktop mostrara movimientos/deletions para esos BAT,")
    print(" pero no se han eliminado del disco.")

def main():
    print("\nINCASTATS - BASE MAESTRA V3 | SIN ZIP GIGANTES NI BACKUPS NUEVOS")
    if not (ROOT/".git").is_dir() or not MASTER.is_dir() or not TCSV.is_dir():
        raise RuntimeError("Coloca este BAT en la RAIZ local de IncaStats-Data")
    print(" RUTA:",ROOT)
    print("\n 1 - AUDITAR MASTER Y LOS 31 EQUIPOS (SOLO LECTURA)")
    print(" 2 - REPARAR METADATOS TITAN (DETALLES/COMPS/SEASONS/COUNTS)")
    print(" 3 - PROBAR CSV PLAYER DELTA (SOLO LECTURA)")
    print(" 4 - INTEGRAR HISTORIAL PLAYER DELTA COMPATIBLE (MODIFICA DATOS)")
    print(" 5 - BORRAR SOLO CACHES __pycache__")
    print(" 6 - ARCHIVAR BATS ANTIGUOS SIN BORRARLOS")
    print(" 0 - SALIR")
    opt=input("\n ELIGE: ").strip()
    if opt=="1":inspect()
    elif opt=="2":repair_metadata()
    elif opt=="3":players_preview()
    elif opt=="4":integrate_player_history()
    elif opt=="5":cleanup()
    elif opt=="6":archive_old()
    else:print(" Sin cambios.")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("\n [BLOQUEADO] ",type(exc).__name__,str(exc))
        sys.exit(1)
