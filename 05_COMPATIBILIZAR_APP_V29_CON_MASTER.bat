@echo off & title INCASTATS - APP V29 INTEGRACION MASTER & py -3 -x "%~f0" & echo. & pause & exit /b
# -*- coding: utf-8 -*-
"""INCASTATS APP MASTER BRIDGE V1.
Run from IncaStats-Data. Accepts user-selected app folder.
Syncs only lightweight local app indexes; never copies large TITAN databases.
Requires stats native CSVs to be merged first by 04 BAT.
"""
from __future__ import annotations
import csv
import datetime as dt
import json
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
MASTER=ROOT/"INCA_BASE_MAESTRA"
TEAMCAT=MASTER/"BASE_EQUIPOS_MASTER.json"
PLAYERCAT=MASTER/"BASE_JUGADORES_MASTER.json"
TITAN=ROOT/"TITAN_ALONSINHO_V1_GITHUB_READY"
TEAMMAN=TITAN/"manifest"/"teams.json"
GLOBAL=TITAN/"manifest"/"manifest_global.json"

def load(p):
    with p.open("r",encoding="utf-8-sig") as f:return json.load(f)

def put(path,raw):
    if path.exists() and path.read_bytes()==raw:return False
    tmp=path.with_name(path.name+".inca_app_tmp")
    if tmp.exists():raise RuntimeError("Temporal anterior; revisar "+str(tmp))
    with tmp.open("xb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)
    return True

def putjson(path,obj):
    return put(path,(json.dumps(obj,ensure_ascii=False,indent=2)+"\n").encode("utf-8"))

def choose():
    print("\n La carpeta de tu APP V2.9 es la que contiene index.html y titan-data.js.")
    print(" Abre carpeta de Downloads / Descargas, NO selecciones IncaStats-Data.")
    try:
        import tkinter as tk
        from tkinter import filedialog
        root=tk.Tk()
        root.withdraw()
        root.attributes("-topmost",True)
        picked=filedialog.askdirectory(parent=root,title="Seleccionar APP INCASTATS V2.9 (con index.html)")
        root.destroy()
        if picked:return Path(picked).resolve()
    except Exception:pass
    return Path(input(" Arrastra la carpeta APP y ENTER: ").strip().strip('"')).resolve()

def idmap(seq,key):
    if not isinstance(seq,list):raise ValueError("Arreglo de catalogo invalido")
    out={}
    for row in seq:
        if not isinstance(row,dict) or str(row.get(key) or "").strip()=="":
            raise ValueError("Catalogo con registro sin ID")
        ident=str(row[key]).strip()
        if ident in out:raise ValueError("ID repetido: "+ident)
        out[ident]=row
    return out

def parse_comp_seasons(teamfile,team_id):
    seen=set()
    with teamfile.open("r",encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        fields=reader.fieldnames or []
        if not {"Team_ID","Event_ID","Competition_ID","Season_ID","Tiempo"}.issubset(fields):
            raise ValueError("CSV carece de columnas TITAN")
        for row in reader:
            if str(row.get("Team_ID") or "").strip()!=team_id:
                raise ValueError("CSV de equipo incorrecto: "+teamfile.name)
            c=str(row.get("Competition_ID") or "").strip()
            s=str(row.get("Season_ID") or "").strip()
            if c.isdigit() and s.isdigit() and row.get("Event_ID"):
                seen.add((str(int(c)),str(int(s))))
    return seen

def main():
    print("\n"+"="*75)
    print(" INCA STATS - COMPATIBILIZAR APP LOCAL CON MASTER")
    print("="*75)
    print("  SIN COPIAR DB / SIN EXPORTAR ZIP / SIN RESPALDOS AUTOMATICOS")
    if not (ROOT/".git").is_dir() or not TEAMMAN.is_file() or not TEAMCAT.is_file():
        raise RuntimeError("Guarda este BAT en la RAIZ de IncaStats-Data y ejecutalo ahi")
    app=choose()
    if not (app/"index.html").is_file() or not (app/"titan-data.js").is_file():
        raise RuntimeError("Carpeta APP no valida (faltan index.html y titan-data.js)")
    if app==ROOT or ROOT in app.parents:
        raise RuntimeError("APP dentro de GitHub Data no se debe modificar con este BAT")
    paths={
        "season_index":app/"fast-assets"/"titan-season-files.json",
        "teams_core":app/"fast-assets"/"titan-core"/"teams.json",
        "global_core":app/"fast-assets"/"titan-core"/"manifest_global.json",
        "players_local":app/"data"/"player-master-2025"/"manifest.json",
        "titan_js":app/"titan-data.js",
    }
    required=("season_index","teams_core","global_core","players_local","titan_js")
    if any(not paths[k].is_file() for k in required):
        missing=[k for k in required if not paths[k].is_file()]
        raise RuntimeError("APP no compatible con V2.8/V2.9 conocida; faltan: "+", ".join(missing))
    teams_master=load(TEAMCAT)
    players_master=load(PLAYERCAT)
    team_native=load(TEAMMAN)
    global_native=load(GLOBAL)
    if teams_master.get("schema")!="incastats.master.teams.v1" or players_master.get("schema")!="incastats.master.players.v1":
        raise RuntimeError("Esquemas MASTER desconocidos")
    raw_teams=idmap(team_native["teams"],"team_id")
    all_teams=idmap(teams_master["teams"],"team_id")
    players=idmap(players_master["players"],"id")
    native_count=len(raw_teams)
    total=len(all_teams)
    if native_count!=total or set(raw_teams)!=set(all_teams):
        raise RuntimeError("Primero integra los 31 CSV con BAT 04 opcion 2 (FUSIONAR). "+
                           f"TITAN tiene {native_count} y MASTER {total}; no se agregaran equipos sin stats.")
    if global_native.get("coverage",{}).get("teams")!=native_count:
        raise RuntimeError("manifest_global.json no coincide; primero BAT 04 actualizado")
    season_index=load(paths["season_index"])
    team_core=load(paths["teams_core"])
    global_core=load(paths["global_core"])
    player_local=load(paths["players_local"])
    if not isinstance(season_index.get("keys"),dict):
        raise RuntimeError("Indice rapido FAST con esquema desconocido")
    if team_core.get("schema")!="titan.teams.v1":
        raise RuntimeError("Core teams desconocido")
    if not isinstance(player_local.get("players"),list) or not isinstance(player_local.get("counts"),dict):
        raise RuntimeError("Player manifest local inesperado; no se modifica")
    # Full read / validation BEFORE any write.
    keys=season_index["keys"]
    team_sets={k:{str(row.get("team_id")) for row in v}
               for k,v in keys.items() if isinstance(v,list)}
    # Append only NEWly missing names+files to comp-season fast index.
    fast_added=0
    for tid,team in raw_teams.items():
        if team.get("source_batch")!="INCA_BASE_MAESTRA_EXPANSION":
            continue
        rel=str(team.get("file") or "").replace("\\","/").lstrip("/")
        csvpath=(TITAN/rel).resolve()
        if not csvpath.is_file() or not csvpath.is_relative_to(TITAN.resolve()):
            raise RuntimeError("CSV de expansion ausente: "+rel)
        pairs=parse_comp_seasons(csvpath,tid)
        if not pairs:raise RuntimeError("CSV sin pares Competition/Season: "+rel)
        for comp,season in pairs:
            group_key=comp+"|"+season
            if group_key not in keys:keys[group_key]=[]
            if tid in team_sets.setdefault(group_key,set()):continue
            keys[group_key].append({"file":rel,"team_id":int(tid),"name":team.get("name") or tid})
            team_sets[group_key].add(tid);fast_added+=1
    season_index["competition_season_keys"]=len(keys)
    season_index["entries"]=sum(len(v) for v in keys.values())
    season_index["source"]+=" + INCA_BASE_MAESTRA_EXPANSION" if "INCA_BASE_MAESTRA_EXPANSION" not in season_index.get("source","") else ""
    # Core fallback must match remote globals, in case GitHub RAW/ CDN lags after push.
    team_core["teams"]=team_native["teams"]
    team_core["count"]=len(team_native["teams"])
    global_core["coverage"]=global_native["coverage"]
    # Players: local app manifest includes historical players; 865 new catalog-only
    # players must be visible by ID without pretending we have match stats for them.
    current_app_players=idmap(player_local["players"],"id")
    meta_added=0
    for pid,p in players.items():
        if pid in current_app_players:continue
        rec={
            "id":pid,"name":p.get("name") or "Jugador "+pid,
            "primary_team_id":str(p.get("team_id") or ""),
            "primary_team":p.get("team") or "",
            "primary_competition_id":str(p.get("competition_id") or ""),
            "position":p.get("position") or "",
            "photo":p.get("photo") or "",
            "last_date":p.get("last_date") or "",
            "file":"","matches":0,"source":"INCA_BASE_MAESTRA_CATALOG_ONLY"
        }
        current_app_players[pid]=rec;meta_added+=1
    player_local["players"]=list(current_app_players.values())
    counts=player_local["counts"]
    if "players" in counts: counts["players"]=len(current_app_players)
    if "final_players" in counts: counts["final_players"]=len(current_app_players)
    counts["catalog_only_players"]=sum(
        1 for p in current_app_players.values()
        if p.get("source")=="INCA_BASE_MAESTRA_CATALOG_ONLY")
    # Local preference when published remote is still behind main branch.
    js_path=paths["titan_js"]
    old_js=js_path.read_text(encoding="utf-8-sig")
    marker="// INCA MASTER V1: prefer updated local fallback catalog while remote 751"
    needle="      let [teamsPayload, competitionsPayload, seasonsPayload] = await Promise.all(["
    if marker not in old_js and needle not in old_js:
        raise RuntimeError("titan-data.js no contiene el anclaje esperado. Se aborta SIN CAMBIOS.")
    if marker not in old_js:
        addition=(
            "      "+marker+"\n"
            "      try {\n"
            "        const localMasterGlobal = await fetchLocalCore('manifest_global.json');\n"
            "        if (Number(localMasterGlobal?.coverage?.teams || 0) > Number(state.global?.coverage?.teams || 0)) {\n"
            "          state.global = localMasterGlobal;\n"
            "        }\n"
            "      } catch (_) {}\n"
        )
        new_js=old_js.replace(needle,addition+needle,1)
    else:
        new_js=old_js
    print("\n APP:",app)
    print("  Equipo MASTER:",total,"| TITAN nativo:",native_count)
    print("  Nuevas asociaciones equipo/temporada:",fast_added)
    print("  Jugadores en app tras fusion:",len(current_app_players))
    print("  Jugadores nuevos de catalogo:",meta_added)
    print("  Fotografias, logos y partidos NO se copian ni inventan.")
    print("  El lector de equipos continua usando las rutas RAW GitHub que ya conoce.")
    print("\n ADVERTENCIA: Sin COMMIT+PUSH de datos TITAN en GitHub main,")
    print(" los CSV nuevos no estaran disponibles para la app publicada.")
    if input("\n Escribe ADAPTAR para escribir estos indices en la APP: ").strip()!="ADAPTAR":
        print(" Cancelado, 0 cambios.");return
    results={}
    results["fast_seasons"]=putjson(paths["season_index"],season_index)
    results["fast_teams"]=putjson(paths["teams_core"],team_core)
    results["fast_global"]=putjson(paths["global_core"],global_core)
    results["players_catalog"]=putjson(paths["players_local"],player_local)
    results["titan_js"]=put(js_path,new_js.encode("utf-8"))
    print("\n [LISTO] App indexada con MASTER:",results)
    print(" Abre Go Live y recarga Ctrl+Shift+R.")
    print(" No se hizo push ni se copio ningun directorio TITAN a la APP.")

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("\n [BLOQUEADO]",type(e).__name__,str(e))
        sys.exit(1)
