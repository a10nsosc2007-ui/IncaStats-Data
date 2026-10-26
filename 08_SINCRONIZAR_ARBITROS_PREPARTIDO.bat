@echo off & title INCASTATS - ARBITROS PROXIMOS (CONSULTA LIMITADA) & py -3 -x "%~f0" & echo. & pause & exit /b
# -*- coding: utf-8 -*-
"""Optional referee appointment check. No bypass of 403/429, no keys, low frequency."""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT=Path(__file__).resolve().parent
MAX_CALLS=12

def choose():
    try:
        import tkinter as tk
        from tkinter import filedialog
        t=tk.Tk();t.withdraw();t.attributes("-topmost",True)
        p=filedialog.askdirectory(title="Selecciona carpeta APP V2.9 que contiene index.html",parent=t)
        t.destroy()
        if p:return Path(p).resolve()
    except Exception:pass
    return Path(input("Ruta APP V2.9: ").strip().strip('"')).resolve()

def parse_date(x):
    if isinstance(x,(int,float)) and x>1e9:
        return dt.datetime.fromtimestamp(x/1000 if x>1e11 else x,tz=dt.timezone.utc)
    if isinstance(x,str):
        try:return dt.datetime.fromisoformat(x.strip().replace("Z","+00:00")).astimezone(dt.timezone.utc)
        except ValueError:pass
    return None

def read_fixtures(app):
    paths=[app/"data"/"api-cache"/"fixtures_current.json",
           app/"data"/"runtime"/"TITAN_FIXTURES_CORE_31_V4.json"]
    for path in paths:
        if not path.is_file():continue
        try:
            with path.open("r",encoding="utf-8-sig") as f:payload=json.load(f)
            if isinstance(payload,list):rows=payload
            elif isinstance(payload,dict):
                rows=next((payload[k] for k in ("fixtures","matches","events","data")
                           if isinstance(payload.get(k),list)),[])
            else:rows=[]
            if rows:return rows,str(path)
        except (ValueError,OSError):
            pass
    return [],""

def value(row,*keys):
    for k in keys:
        v=row.get(k)
        if v not in (None,""):return v
    return None

def pick(row):
    if not isinstance(row,dict):return None
    idv=value(row,"sofascore_event_id","sofa_event_id","sofascoreEventId","event_id","eventId","id")
    if not str(idv or "").isdigit():return None
    kickoff=parse_date(value(row,"kickoff_utc","commence_time","start_time","startTimestamp","start_timestamp","date","kickoff"))
    if kickoff is None:return None
    def name(*keys):
        a=value(row,*keys)
        return str(a.get("name","")) if isinstance(a,dict) else str(a or "")
    return {"event_id":str(idv),"kickoff_utc":kickoff.isoformat(),
            "home_team":name("home_team","homeTeam","local"),
            "away_team":name("away_team","awayTeam","visita")}

def fetch_assignment(event):
    ev=event["event_id"]
    url="https://www.sofascore.com/api/v1/event/"+ev
    request=urllib.request.Request(url,headers={
        "User-Agent":"INCASTATS-Local-RefereeChecker/1.0",
        "Accept":"application/json"})
    with urllib.request.urlopen(request,timeout=12) as res:
        if res.status!=200:raise RuntimeError("HTTP_"+str(res.status))
        raw=res.read(500_000)
    obj=json.loads(raw)
    root=obj.get("event",obj) if isinstance(obj,dict) else {}
    r=root.get("referee") or root.get("referees")
    name=(str(r.get("name") or r.get("fullName") or "") if isinstance(r,dict)
          else str(r[0].get("name") or "") if isinstance(r,list) and r and isinstance(r[0],dict)
          else "")
    name=name.strip()
    if not name:return None
    result=dict(event)
    result.update({"referee_name":name,"referee_confirmed":True,
                   "source_label":"SofaScore","verified_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()})
    return result

def atomic_save(path,data):
    blob=(json.dumps(data,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    tmp=path.with_name(path.name+".inca_ref_tmp")
    if tmp.exists():raise RuntimeError("Temporal pendiente: "+str(tmp))
    path.parent.mkdir(parents=True,exist_ok=True)
    with tmp.open("xb") as f:f.write(blob);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)

def main():
    print("INCASTATS V3 - REFEREES / DESIGNACIONES PREPARTIDO")
    print("Consulta SOLO si hay SofaScore event_id numerico y partido proximo.")
    print("No modifica perfiles historicos ni el API original.")
    app=choose()
    if not (app/"index.html").is_file():raise RuntimeError("Carpeta APP no valida")
    rows,path=read_fixtures(app)
    print(" Agenda:",path or "SIN DATOS")
    now=dt.datetime.now(dt.timezone.utc)
    selected={}
    for r in rows:
        x=pick(r)
        if x:
            ts=parse_date(x["kickoff_utc"])
            hours=(ts-now).total_seconds()/3600
            if -1<=hours<=24:
                selected[x["event_id"]]=x
    if not selected:
        print("No hay encuentros proximos con SofaScore event_id utilizable.")
        print("No se consultara la web ni se crearan arbitros ficticios.");return
    upcoming=list(sorted(selected.values(),key=lambda x:x["kickoff_utc"]))[:MAX_CALLS]
    print(" Partidos candidatos:",len(selected),"| limite de consultas:",len(upcoming))
    if input(" Escribe CONSULTAR para consultar el origen publico: ").strip()!="CONSULTAR":
        print("Cancelado");return
    output=app/"data"/"api-cache"/"referees_verified_v3.json"
    data={"schema":"incastats.referee_assignments.v3",
          "fetched_at_utc":now.isoformat(),"events":[],"requests":0,
          "source":"SofaScore public event endpoint (best effort)"}
    if output.exists():
        try:
            old=json.loads(output.read_text(encoding="utf-8-sig"))
            if old.get("schema")==data["schema"]:
                for x in old.get("events",[]):
                    parsed_date=parse_date(x.get("kickoff_utc"))
                    if (x.get("referee_name") and x.get("referee_confirmed") and
                        parsed_date is not None and parsed_date>=now-dt.timedelta(hours=2)):
                        data["events"].append(x)
        except (OSError,ValueError):pass
    byid={str(x["event_id"]):x for x in data["events"]}
    for n,ev in enumerate(upcoming,1):
        try:
            previous=byid.get(ev["event_id"])
            previous_when=parse_date(previous.get("verified_at_utc")) if previous else None
            if previous_when is not None and now-previous_when < dt.timedelta(minutes=30):
                continue
            print(" Consultando",n,"/",len(upcoming),ev["event_id"])
            data["requests"]+=1
            item=fetch_assignment(ev)
            if item:byid[ev["event_id"]]=item;print("  Designacion:",item["referee_name"])
            else:print("  Sin arbitro publicado; se mantiene pendiente")
            time.sleep(0.7)
        except urllib.error.HTTPError as err:
            print("  Proveedor HTTP",err.code,"; no se intentara eludir restricciones")
            if err.code in (401,403,429):break
        except (urllib.error.URLError,ValueError,TimeoutError,RuntimeError) as err:
            print("  Sin lectura:",str(err)[:100])
    data["events"]=sorted(byid.values(),key=lambda x:x.get("kickoff_utc",""))
    atomic_save(output,data)
    print("\n Resultado:",len(data["events"]),"designaciones publicadas en",output)
    print("Una designacion publicada puede cambiar. Nunca tomar un nombre pendiente como confirmado.")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("[ERROR]",type(exc).__name__,str(exc))
        sys.exit(1)
