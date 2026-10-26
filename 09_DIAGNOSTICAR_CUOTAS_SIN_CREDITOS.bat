@echo off & title INCASTATS V3 - DIAGNOSTICO DE CUOTAS CACHEADAS & py -3 -x "%~f0" & echo. & pause & exit /b
# -*- coding: utf-8 -*-
"""Read-only odds cache diagnostics. Does not access private keys nor cost credits."""
from __future__ import annotations
import collections
import datetime as dt
import json
import os
from pathlib import Path

def choose():
    try:
        import tkinter as tk
        from tkinter import filedialog
        t=tk.Tk();t.withdraw();t.attributes("-topmost",True)
        p=filedialog.askdirectory(parent=t,title="Selecciona tu APP que contiene index.html")
        t.destroy()
        if p:return Path(p)
    except Exception:pass
    return Path(input("Ruta APP V2.9: ").strip().strip('"'))

def extract(obj):
    if isinstance(obj,list):return obj
    if isinstance(obj,dict):
        for key in ("odds","events","fixtures","playerprops","data","items","matches"):
            val=obj.get(key)
            if isinstance(val,list):return val
    return []

def values(x):
    seen=set();n=0;counts=collections.Counter()
    def visit(item,depth):
        nonlocal n
        if depth>8 or n>150000 or not item or not isinstance(item,(dict,list)):return
        if id(item) in seen:return
        seen.add(id(item))
        if isinstance(item,list):
            for sub in item[:25000]:visit(sub,depth+1)
            return
        k=str(item.get("market_key") or item.get("key") or "")
        price=item.get("price")
        try:
            if isinstance(price,(float,int,str)) and 1.001<float(price)<200:
                n+=1
                counts[k or "MERCADO_DESCONOCIDO"]+=1
        except (TypeError,ValueError):pass
        for value in item.values():
            if isinstance(value,(dict,list)):visit(value,depth+1)
    visit(x,0)
    return n,counts

def inspect(app,label,relative):
    p=app/relative
    if not p.is_file():return {"exists":False,"file":relative}
    try:
        with p.open("r",encoding="utf-8-sig") as f:payload=json.load(f)
        rows=extract(payload)
        n,by_market=values(payload)
        date=None
        if isinstance(payload,dict):
            date=payload.get("fetched_at") or payload.get("updated_at") or payload.get("generated_at")
        return {"exists":True,"file":relative,"bytes":p.stat().st_size,
                "rows":len(rows),"prices_valid":n,"markets":dict(by_market.most_common(30)),
                "last_updated":date,"source":payload.get("source","") if isinstance(payload,dict) else ""}
    except (ValueError,OSError) as e:
        return {"exists":True,"file":relative,"invalid":str(e)[:150]}

def main():
    app=choose()
    if not (app/"index.html").is_file():raise RuntimeError("Carpeta APP incorrecta")
    checks=[
        ("cuotas_estaticas","data/api-cache/odds_current.json"),
        ("cuotas_live","data/live/odds_next.json"),
        ("props","data/api-cache/playerprops_current.json"),
        ("agenda_estatica","data/api-cache/fixtures_current.json"),
        ("agenda_live","data/live/fixtures_next.json"),
        ("arbitros","data/api-cache/referees_current.json")
    ]
    report={key:inspect(app,key,file) for key,file in checks}
    print("\n INCA STATS V3 - RESULTADO DEL CACHE (SIN GASTAR CREDITOS)")
    for name,row in report.items():
        print(" ",name,"Archivo:",row["file"],"EXISTE:",row["exists"],
              "| registros:",row.get("rows","?"),"| cuotas verificables:",row.get("prices_valid","?"))
        if row.get("markets"):print("   Mercados:",", ".join(row["markets"]))
        if row.get("invalid"):print("   ERROR:",row["invalid"])
    raw=sum(r.get("prices_valid",0) for r in report.values() if isinstance(r.get("prices_valid"),int))
    print("\n Cuotas publicadas en estos archivos locales:",raw)
    if raw==0:
        print("  --> No hay ningun precio verificable en las rutas comunes.")
        print("  --> 9 claves NO equivalen a disponibilidad. Requiere INGESTA")
        print("      de odds oficiales al cache, con evento+mercado+linea.")
    print("  --> No se ejecutaron APIs, no se leyeron tokens ni se gastaron creditos.")
    report_path=app/"data"/"admin"/"inca_v3_cache_diagnostic.json"
    report_path.parent.mkdir(parents=True,exist_ok=True)
    with report_path.open("w",encoding="utf-8") as f:
        json.dump({"checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
                   "result":report,"keys_read":False,"api_requests":0},
                  f,ensure_ascii=False,indent=2)
    print("  Informe tecnico:",report_path)

if __name__=="__main__":
    try:main()
    except Exception as e:print(" [ERROR]",type(e).__name__,str(e))
