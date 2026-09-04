from __future__ import annotations
from pathlib import Path
import csv, io, json, zipfile, shutil, sys, os, hashlib
from datetime import datetime, timezone
from collections import defaultdict, Counter

MASTER_FIELDS=['ID_Jugador','Jugador','Event_ID','Fecha','Competition_ID','Torneo','Season_ID','Season','Team_ID','Equipo','Rival_ID','Rival','Condicion','Posicion','Minutos_Jugados','Rating','Goles','Asistencias','xG_Esperados','Tiros_Totales','Tiros_Al_Arco','Tiros_Al_Palo','Pases_Totales','Pases_Acertados','Pases_Clave','Grandes_Ocasiones_Creadas','Duelos_Ganados','Atajadas','Faltas_Cometidas','Faltas_Recibidas','Entradas_Tackles','Intercepciones','Tarjetas','Tarjetas_Amarillas','Tarjetas_Rojas','Offsides']
RECENT_FIELDS=['ID_Jugador','Jugador','Event_ID','Fecha','Competition_ID','Torneo','Season_ID','Season','Team_ID','Equipo','Rival','Condicion','Posicion','Minutos_Jugados','Rating','Goles','Asistencias','Tiros_Totales','Tiros_Al_Arco','Pases_Totales','Pases_Acertados','Atajadas','Faltas_Cometidas','Faltas_Recibidas','Entradas_Tackles','Tarjetas','Tarjetas_Amarillas','Tarjetas_Rojas','Offsides']
CURRENT_EXPECTED=['Event_ID','Player_ID','Team_ID','Competition_ID','Season_ID','Season_Label','Start_Timestamp','Condicion','Titular','Fuente_Stats','Liga','Temporada','Partido','Fecha','Jugador','Posicion','Equipo','Minutos_Jugados','Rating','Goles','Asistencias','xG','xA','Tiros_Totales','Tiros_Al_Arco','Tiros_Al_Palo','Pases_Totales','Pases_Clave','Grandes_Ocasiones_Creadas','Grandes_Ocasiones_Falladas','Toques','Regates_Completados','Entradas(Tackles)','Intercepciones','Duelos_Ganados','Faltas_Cometidas','Faltas_Recibidas','Tarjetas_Amarillas','Tarjetas_Rojas','Offsides','Atajadas(Portero)']

def now(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def parse_date(s):
    s=str(s or '').strip()
    for fmt in ('%d/%m/%Y','%Y-%m-%d'):
        try:return datetime.strptime(s,fmt)
        except:pass
    return datetime.min

def read_csv_bytes(b):
    text=b.decode('utf-8-sig',errors='replace')
    return list(csv.DictReader(io.StringIO(text)))

def read_csv_file(p):
    if not p.exists(): return []
    with p.open('r',encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))

def write_csv(p,fields,rows):
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+'.tmp')
    with tmp.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
    tmp.replace(p)

def validate_repo_root(repo:Path):
    master=repo/'TITAN_PLAYERS_MASTER_2025_PLUS/MASTER/PLAYER_MATCH_STATS_2025_PLUS.csv'
    if not master.is_file():
        raise RuntimeError(
            'Este script debe vivir en la RAIZ de IncaStats-Data. No encuentro: '+str(master)
        )
    return repo

def choose_zip(args, inbox:Path):
    # Solo acepta un archivo ZIP real. Nunca una carpeta ni un argumento vacio.
    if args:
        raw=str(args[0] or '').strip().strip('"')
        if raw:
            p=Path(raw).expanduser().resolve()
            if p.is_file() and p.suffix.lower()=='.zip':
                return p
            raise FileNotFoundError(f'El argumento no es un ZIP valido: {p}')
    zs=sorted((p for p in inbox.glob('*.zip') if p.is_file()),key=lambda p:p.stat().st_mtime,reverse=True)
    if zs:
        return zs[0]
    raw=input('Arrastra aqui el ZIP PLAYER DELTA y pulsa ENTER: ').strip().strip('"')
    if not raw:
        raise FileNotFoundError('No se indico ningun ZIP DELTA.')
    p=Path(raw).expanduser().resolve()
    if not p.is_file() or p.suffix.lower()!='.zip':
        raise FileNotFoundError(f'No es un archivo ZIP valido: {p}')
    return p

def backup(repo:Path,paths:list[Path]):
    stamp=datetime.now().strftime('%Y%m%d_%H%M%S');dst=repo/'_BACKUPS_PLAYER_DELTA'/stamp
    for p in paths:
        if p.exists():
            q=dst/p.relative_to(repo);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
    return dst

def pack_rows(fields,rows): return [[r.get(k,'') for k in fields] for r in rows]

def main():
    here=Path(__file__).resolve().parent
    repo=validate_repo_root(here)
    inbox=repo/'INBOX_PLAYER_DELTA'
    inbox.mkdir(parents=True,exist_ok=True)
    zpath=choose_zip(sys.argv[1:],inbox)
    print('\nINCASTATS PLAYER DELTA MERGER V1')
    print('Repo:',repo);print('Inbox:',inbox);print('Delta:',zpath)
    with zipfile.ZipFile(zpath) as z:
        bad=z.testzip()
        if bad: raise RuntimeError('ZIP corrupto: '+bad)
        need=['players/player_match_stats_master_upsert.csv','players/player_match_stats_current_upsert.csv']
        for n in need:
            if n not in z.namelist(): raise RuntimeError('Falta '+n)
        delta_master=read_csv_bytes(z.read(need[0]));delta_current=read_csv_bytes(z.read(need[1]))
        delta_info=read_csv_bytes(z.read('players/players_info_upsert.csv')) if 'players/players_info_upsert.csv' in z.namelist() else []
        dm=json.loads(z.read('player_delta_manifest.json').decode('utf-8')) if 'player_delta_manifest.json' in z.namelist() else {}
    if not delta_master: raise RuntimeError('Delta master vacío')
    # validate keys
    for r in delta_master[:100]:
        if not r.get('Event_ID') or not r.get('ID_Jugador'):raise RuntimeError('Delta sin Event_ID/ID_Jugador')

    master_root=repo/'TITAN_PLAYERS_MASTER_2025_PLUS';current_root=repo/'TITAN_PLAYERS_CURRENT'
    master_csv=master_root/'MASTER/PLAYER_MATCH_STATS_2025_PLUS.csv';current_csv=current_root/'MASTER/PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv'
    manifest_p=master_root/'manifest.json';players_index_p=master_root/'INDEX/players.json';info_p=master_root/'MASTER/PLAYERS_INFO.csv';recent_p=master_root/'RECENT/recent20.json';current_manifest_p=current_root/'manifest.json'
    if not master_csv.exists():raise RuntimeError('No encuentro '+str(master_csv))
    bdir=backup(repo,[master_csv,manifest_p,players_index_p,info_p,recent_p,current_csv,current_manifest_p])
    print('Backup:',bdir)

    # MASTER upsert
    base=read_csv_file(master_csv);m={(str(r.get('ID_Jugador')),str(r.get('Event_ID'))):r for r in base}
    inserted=replaced=0;affected=set()
    for r in delta_master:
        k=(str(r.get('ID_Jugador')),str(r.get('Event_ID')));affected.add(k[0]);
        if k in m: replaced+=1
        else: inserted+=1
        m[k]={f:r.get(f,'') for f in MASTER_FIELDS}
    merged=list(m.values());merged.sort(key=lambda r:(parse_date(r.get('Fecha')),int(r.get('Event_ID') or 0),int(r.get('ID_Jugador') or 0)))
    write_csv(master_csv,MASTER_FIELDS,merged)
    print(f'MASTER: {len(base)} + {inserted} nuevos · {replaced} reemplazos => {len(merged)}')

    # INFO upsert: existing 9 core fields preserved, add only when nonblank from delta
    info_fields=['ID_Jugador','Jugador','Foto_URL','Pais','Fecha_Nacimiento','Posicion','Altura','Pie','Valor_Mercado']
    infos=read_csv_file(info_p);im={str(r.get('ID_Jugador')):r for r in infos}
    for r in delta_info:
        pid=str(r.get('ID_Jugador') or '')
        if not pid:continue
        old=im.get(pid,{f:'' for f in info_fields});old['ID_Jugador']=pid
        for f in info_fields[1:]:
            if str(r.get(f,'')).strip():old[f]=r.get(f,'')
        if not old.get('Foto_URL'):old['Foto_URL']=f'https://api.sofascore.com/api/v1/player/{pid}/image'
        im[pid]=old
    write_csv(info_p,info_fields,sorted(im.values(),key=lambda r:int(r['ID_Jugador']) if str(r['ID_Jugador']).isdigit() else 10**20))

    # Aggregate per affected and all counts while master is already in memory
    by_player=defaultdict(list);comp=set();events=set()
    for r in merged:
        pid=str(r.get('ID_Jugador') or '')
        if pid in affected:by_player[pid].append(r)
        if r.get('Competition_ID'):comp.add(str(r['Competition_ID']))
        if r.get('Event_ID'):events.add(str(r['Event_ID']))
    for pid,rows in by_player.items():
        rows.sort(key=lambda r:parse_date(r.get('Fecha')),reverse=True)
        out=master_root/'BY_PLAYER'/f'{int(pid)%100:02d}'/f'{pid}.json';out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps({'schema_version':'incastats.player_history.v1','player_id':pid,'fields':MASTER_FIELDS,'rows':pack_rows(MASTER_FIELDS,rows)},ensure_ascii=False,separators=(',',':')),encoding='utf-8')

    # Recent20 rebuild exact (324k rows is fine and avoids stale rachas)
    allp=defaultdict(list)
    for r in merged:allp[str(r.get('ID_Jugador') or '')].append(r)
    recent=[]
    for pid,rows in allp.items():
        rows.sort(key=lambda r:parse_date(r.get('Fecha')),reverse=True);recent.extend(rows[:20])
    recent.sort(key=lambda r:(str(r.get('ID_Jugador')),parse_date(r.get('Fecha'))),reverse=False)
    recent_p.parent.mkdir(parents=True,exist_ok=True);recent_p.write_text(json.dumps({'schema_version':'incastats.player_recent20.v1','fields':RECENT_FIELDS,'rows':pack_rows(RECENT_FIELDS,recent)},ensure_ascii=False,separators=(',',':')),encoding='utf-8')

    # Player index update from exact master groups + existing metadata
    old_index=[]
    if players_index_p.exists():
        try:old_index=json.loads(players_index_p.read_text(encoding='utf-8-sig'))
        except:old_index=[]
    ix={str(x.get('id')):x for x in old_index if x.get('id')}
    info_map={str(x.get('ID_Jugador')):x for x in im.values()}
    for pid,rows in allp.items():
        if pid not in affected and pid in ix:continue
        rows.sort(key=lambda r:parse_date(r.get('Fecha')))
        first,last=rows[0],rows[-1];inf=info_map.get(pid,{})
        x=ix.get(pid,{})
        x.update({'id':pid,'name':inf.get('Jugador') or last.get('Jugador') or x.get('name') or f'Jugador {pid}','photo':inf.get('Foto_URL') or x.get('photo') or f'https://api.sofascore.com/api/v1/player/{pid}/image','country':inf.get('Pais') or x.get('country',''),'birth_date':inf.get('Fecha_Nacimiento') or x.get('birth_date',''),'position':last.get('Posicion') or inf.get('Posicion') or x.get('position',''),'height':inf.get('Altura') or x.get('height',''),'foot':inf.get('Pie') or x.get('foot',''),'market_value':inf.get('Valor_Mercado') or x.get('market_value',''),'primary_competition_id':str(last.get('Competition_ID') or ''),'primary_team_id':str(last.get('Team_ID') or ''),'primary_team':last.get('Equipo') or '','matches':len(rows),'first_date':parse_date(first.get('Fecha')).strftime('%Y-%m-%d'),'last_date':parse_date(last.get('Fecha')).strftime('%Y-%m-%d'),'file':f'BY_PLAYER/{int(pid)%100:02d}/{pid}.json','info_status':'OK' if pid in info_map else 'MISSING_INFO','source':'MASTER_2025_PLUS_DELTA'})
        ix[pid]=x
    players_index=sorted(ix.values(),key=lambda x:int(x['id']) if str(x.get('id','')).isdigit() else 10**20)
    players_index_p.parent.mkdir(parents=True,exist_ok=True);players_index_p.write_text(json.dumps(players_index,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

    # Master manifest
    mf={}
    if manifest_p.exists():
        try:mf=json.loads(manifest_p.read_text(encoding='utf-8-sig'))
        except:mf={}
    mf['schema_version']='incastats.players_master_2025_plus.v1';mf['provider']='sofascore';mf['generated_at']=now();mf['merge_key']=['ID_Jugador','Event_ID'];mf['merge_policy']='DELTA_UPSERT; APP_CURRENT_WINS';mf.setdefault('scope',{})['to']=max((parse_date(r.get('Fecha')) for r in merged),default=datetime.min).strftime('%Y-%m-%d')
    c=mf.setdefault('counts',{});c.update({'final_rows':len(merged),'players':len(allp),'unique_events':len(events),'competitions':len(comp),'recent20_rows':len(recent),'duplicate_keys_after_build':0});mf['players']=players_index
    manifest_p.write_text(json.dumps(mf,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

    # CURRENT upsert using extractor native extended contract
    cur=read_csv_file(current_csv);cm={(str(r.get('Event_ID')),str(r.get('Player_ID'))):r for r in cur};ci=cr=0
    fields=list(cur[0].keys()) if cur else CURRENT_EXPECTED
    for f in CURRENT_EXPECTED:
        if f not in fields:fields.append(f)
    for r in delta_current:
        k=(str(r.get('Event_ID')),str(r.get('Player_ID')))
        if k in cm:cr+=1
        else:ci+=1
        old=cm.get(k,{})
        old.update(r);cm[k]=old
    curm=list(cm.values());curm.sort(key=lambda r:(int(float(r.get('Start_Timestamp') or 0)),int(r.get('Event_ID') or 0),int(r.get('Player_ID') or 0)))
    write_csv(current_csv,fields,curm)
    print(f'CURRENT: {len(cur)} + {ci} nuevos · {cr} reemplazos => {len(curm)}')
    comps={str(r.get('Competition_ID')) for r in curm if r.get('Competition_ID')};evs={str(r.get('Event_ID')) for r in curm if r.get('Event_ID')};pls={str(r.get('Player_ID')) for r in curm if r.get('Player_ID')}
    current_root.mkdir(parents=True,exist_ok=True)
    cmf={}
    if current_manifest_p.exists():
        try:cmf=json.loads(current_manifest_p.read_text(encoding='utf-8-sig'))
        except:cmf={}
    cmf.update({'schema_version':'incastats.player_current_master.v3','provider':'sofascore','generated_at':now(),'scope':'CURRENT_OVERLAY_ALL_OFFICIAL_DELTA','merge_key':['Event_ID','Player_ID'],'merge_policy':'PLAYER_DELTA_UPSERT_REPLACE_SAME_KEY','counts':{'rows':len(curm),'unique_events':len(evs),'unique_players':len(pls),'competitions':len(comps)},'last_delta_manifest':dm})
    current_manifest_p.write_text(json.dumps(cmf,ensure_ascii=False,indent=2),encoding='utf-8')

    audit={'applied_at':now(),'delta_zip':zpath.name,'delta_sha256':hashlib.sha256(zpath.read_bytes()).hexdigest(),'delta_rows_master':len(delta_master),'delta_rows_current':len(delta_current),'affected_players':len(affected),'master_inserted':inserted,'master_replaced':replaced,'current_inserted':ci,'current_replaced':cr,'master_rows_after':len(merged),'current_rows_after':len(curm),'backup':str(bdir)}
    ad=repo/'_PLAYER_DELTA_AUDIT';ad.mkdir(exist_ok=True);ap=ad/f"APPLY_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json";ap.write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print('\n===============================================')
    print(' LISTO · PLAYER DELTA APLICADO SIN CONCATENAR A CIEGAS')
    print(' MASTER 2025+ :',len(merged))
    print(' CURRENT       :',len(curm))
    print(' AFECTADOS     :',len(affected),'jugadores')
    print(' AUDIT         :',ap)
    print('===============================================')

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('\nERROR:',e)
        raise
