@echo off & title INCASTATS - INSTALAR V3 RESCATE EN APP V2.9 & py -3 -x "%~f0" & echo. & pause & exit /b
# -*- coding: utf-8 -*-
"""Safe local V2.9 bridge installer. No Python dependencies beyond standard lib."""
from __future__ import annotations
import csv
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO=Path(__file__).resolve().parent
TITAN=REPO/"TITAN_ALONSINHO_V1_GITHUB_READY"
MASTER=REPO/"INCA_BASE_MAESTRA"
PATCH_SHA="f477ff48998a6cdc2ad0a3ed6b3fc03ea1367d84"
RAW="https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/"+PATCH_SHA+"/APP_V3_PATCH/"
FILES=("inca-v3-rescue.js","inca-v3-player-streaks.js","inca-v3-rescue.css")

def load(p):
    with p.open("r",encoding="utf-8-sig") as f:return json.load(f)

def write_atom(path,data):
    if path.is_file() and path.read_bytes()==data:return False
    tmp=path.with_name(path.name+".inca_v3_tmp")
    if tmp.exists():raise RuntimeError("Existe temporal anterior: "+str(tmp))
    path.parent.mkdir(parents=True,exist_ok=True)
    with tmp.open("xb") as f:
        f.write(data);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)
    return True

def enc(obj):
    return (json.dumps(obj,ensure_ascii=False,indent=2)+"\n").encode("utf-8")

def choose_folder():
    try:
        import tkinter as tk
        from tkinter import filedialog
        top=tk.Tk();top.withdraw();top.attributes("-topmost",True)
        path=filedialog.askdirectory(title="Selecciona carpeta APP V2.9 que contiene index.html",parent=top)
        top.destroy()
        if path:return Path(path).resolve()
    except Exception:pass
    return Path(input("Arrastra la carpeta APP V2.9 y pulsa ENTER: ").strip().strip('"')).resolve()

def fetch_patch():
    resources={}
    for name in FILES:
        req=urllib.request.Request(RAW+name,headers={"User-Agent":"INCASTATS-V3-INSTALLER"})
        with urllib.request.urlopen(req,timeout=25) as res:
            data=res.read(300_000)
        if not data or len(data)>250_000:raise RuntimeError("Parche vacio o muy grande: "+name)
        txt=data.decode("utf-8")
        if name.endswith(".js") and "INCA_V3_" not in txt:raise RuntimeError("Parche JS invalido: "+name)
        if name.endswith(".css") and ".inca-v3-" not in txt:raise RuntimeError("Parche CSS invalido")
        resources[name]=data
    return resources

def update_indexes(app):
    root=app/"fast-assets"/"titan-core"
    a=app/"fast-assets"/"titan-season-files.json"
    localplayers=app/"data"/"player-master-2025"/"manifest.json"
    mandatory=[root/"teams.json",root/"manifest_global.json",root/"competitions.json",root/"seasons.json",a,localplayers]
    missing=[x for x in mandatory if not x.is_file()]
    if missing:raise RuntimeError("La V2.9 no tiene los FAST indices conocidos: "+", ".join(x.name for x in missing))
    teams=load(TITAN/"manifest"/"teams.json")
    globalm=load(TITAN/"manifest"/"manifest_global.json")
    comps=load(TITAN/"manifest"/"competitions.json")
    seasons=load(TITAN/"manifest"/"seasons.json")
    players=load(MASTER/"BASE_JUGADORES_MASTER.json")
    if teams.get("schema")!="titan.teams.v1" or len(teams.get("teams",[]))!=782:
        raise RuntimeError("MASTER publicado no tiene 782 equipos validados. No se instala.")
    if globalm.get("coverage",{}).get("teams")!=782:
        raise RuntimeError("Manifest global sigue desincronizado con equipos")
    if players.get("schema")!="incastats.master.players.v1" or not isinstance(players.get("players"),list):
        raise RuntimeError("MASTER de jugadores inesperado")
    idx=load(a)
    if not isinstance(idx.get("keys"),dict) or idx.get("schema")!="inca.fast-season-files.v1":
        raise RuntimeError("Indice FAST no compatible; no modificar.")
    keymaps={}
    for k,rows in idx["keys"].items():
        if isinstance(rows,list):
            keymaps[k]={str(r.get("team_id")) for r in rows}
    appended=0;skipped=[]
    for entry in teams["teams"]:
        if entry.get("source_batch")!="INCA_BASE_MAESTRA_EXPANSION":continue
        teamid=str(entry["team_id"])
        rel=str(entry.get("file") or "").replace("\\","/").lstrip("/")
        path=(TITAN/rel).resolve()
        if not path.is_file() or not path.is_relative_to((TITAN/"data"/"teams_csv").resolve()):
            raise RuntimeError("CSV nuevo no existe: "+rel)
        seen=set()
        with path.open("r",encoding="utf-8-sig",newline="") as f:
            reader=csv.DictReader(f)
            if not {"Competition_ID","Season_ID","Event_ID","Team_ID"}.issubset(reader.fieldnames or []):
                raise RuntimeError("CSV TITAN incompatible "+rel)
            for row in reader:
                if row.get("Team_ID")!=teamid:raise RuntimeError("Team_ID invalido "+rel)
                cid=str(row.get("Competition_ID") or "");sid=str(row.get("Season_ID") or "")
                if cid.isdigit() and sid.isdigit() and row.get("Event_ID"):
                    seen.add(cid+"|"+sid)
        if not seen:raise RuntimeError("El equipo no tiene pares Competition/Season "+teamid)
        for key in seen:
            if key not in idx["keys"]:idx["keys"][key]=[]
            if teamid in keymaps.setdefault(key,set()):continue
            idx["keys"][key].append({"file":rel,"team_id":int(teamid),"name":entry.get("name") or teamid})
            keymaps[key].add(teamid);appended+=1
    idx["competition_season_keys"]=len(idx["keys"])
    idx["entries"]=sum(len(x) for x in idx["keys"].values())
    # No fake player statistics; just make metadata findable in Player Picks.
    appplayers=load(localplayers)
    if not isinstance(appplayers.get("players"),list) or not isinstance(appplayers.get("counts"),dict):
        raise RuntimeError("Manifest Player Picks local inesperado")
    pm={str(r["id"]):r for r in appplayers["players"] if isinstance(r,dict) and r.get("id") is not None}
    addedplayers=0
    for row in players["players"]:
        pid=str(row.get("id") or "")
        if not pid or pid in pm:continue
        rel=str(row.get("source_file") or "").replace("\\","/").lstrip("/")
        path=(REPO/"TITAN_PLAYERS_MASTER_2025_PLUS"/rel).resolve()
        valid=bool(re.fullmatch(r"BY_PLAYER/\d{2}/\d+\.json",rel) and
                   path.is_relative_to((REPO/"TITAN_PLAYERS_MASTER_2025_PLUS").resolve()) and path.is_file())
        pm[pid]={"id":pid,"name":row.get("name") or "Jugador "+pid,
                 "primary_team":row.get("team") or "",
                 "primary_team_id":str(row.get("team_id") or ""),
                 "primary_competition_id":str(row.get("competition_id") or ""),
                 "position":row.get("position") or "",
                 "file":rel if valid else "",
                 "photo":row.get("photo") or "",
                 "matches":int(row.get("matches") or 0) if valid else 0}
        addedplayers+=1
    appplayers["players"]=list(pm.values())
    for k in ("final_players","players"):
        if k in appplayers["counts"]:appplayers["counts"][k]=len(pm)
    print("\n Previo a instalar:")
    print("   EQUIPOS disponibles:",teams["count"])
    print("   Asociaciones nuevas equipo/temporada:",appended)
    print("   JUGADORES en directorio app tras revision:",len(pm))
    print("   Nuevos jugadores sin datos falsos:",addedplayers)
    print("   ARC activos: no se descargan imágenes ni datos enormes")
    return [(root/"teams.json",enc(teams)),(root/"manifest_global.json",enc(globalm)),
            (root/"competitions.json",enc(comps)),(root/"seasons.json",enc(seasons)),
            (a,enc(idx)),(localplayers,enc(appplayers))]

def main():
    print("\n INCASTATS - RESCATE APP V2.9 -> V3 (PARCHE REAL, NO APP COMPLETA)")
    if not (REPO/".git").is_dir() or not MASTER.is_dir() or not TITAN.is_dir():
        raise RuntimeError("Guarda este BAT en la raiz de IncaStats-Data")
    app=choose_folder()
    if not app.is_dir() or not (app/"index.html").is_file() or not (app/"titan-data.js").is_file():
        raise RuntimeError("Carpeta APP incorrecta. Busca la que abres con Go Live.")
    if app==REPO or REPO in app.parents:
        raise RuntimeError("La APP debe ser separada del repositorio de datos")
    index=app/"index.html"
    html=index.read_text(encoding="utf-8-sig")
    if "streaks-pro.js" not in html or "</body>" not in html.lower() or "</head>" not in html.lower():
        raise RuntimeError("Tu V2.9 no coincide con la estructura esperada; NADA modificado.")
    print("  APP encontrada:",app)
    patches=fetch_patch()  # download+verify BEFORE ANY writes
    actions=update_indexes(app) # build+validate BEFORE ANY writes
    banner='<link rel="stylesheet" href="./inca-v3-rescue.css?v=3.0.0">'
    scripts=(
      '<script defer src="./inca-v3-rescue.js?v=3.0.0"></script>\n'
      '<script defer src="./inca-v3-player-streaks.js?v=3.0.0"></script>\n'
    )
    if 'inca-v3-rescue.css' not in html: html=re.sub(r"</head>",banner+"\n</head>",html,count=1,flags=re.I)
    if 'inca-v3-rescue.js' not in html: html=re.sub(r"</body>",scripts+"</body>",html,count=1,flags=re.I)
    print("  Se instala recuperador del ANALIZADOR + Rachas de Jugadores.")
    print("  No cambia tus claves, base SQL, ni el motor de cuotas original.")
    print("  Solo sincroniza indices JSON pequenos; NO copia CSV historicos.")
    if input("\n Escribe INSTALAR_V3 para aplicar en esta APP: ").strip()!="INSTALAR_V3":
        print(" Cancelado sin cambios.");return
    original=index.read_bytes()
    saved=app/"index.html.antes_rescate_v3"
    if not saved.exists():write_atom(saved,original)  # ~100KB, not a 62 GB backup
    for name,data in patches.items():
        write_atom(app/name,data)
    for path,data in actions:write_atom(path,data)
    write_atom(index,html.encode("utf-8"))
    print("\n [OK] Reparacion instalada en:",app)
    print(" Abre Live Server, recarga con Ctrl+Shift+R.")
    print(" Acceso alternativo al Analizador: Alt+A")
    print(" Diagnostico tecnico en consola (F12): await INCA_V3_RESCUE.report()")
    print(" Cuotas reales: solo si tu backend/cache ya devuelve eventos y mercados.")
    print(" NO hay llamadas directas nuevas a The Odds API ni APIs de pago.")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("\n [SIN COMPLETAR]",type(exc).__name__,str(exc))
        sys.exit(1)
