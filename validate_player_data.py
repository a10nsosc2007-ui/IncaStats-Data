from pathlib import Path
import csv,json,sys

root=Path(__file__).resolve().parent
if not (root/'TITAN_PLAYERS_MASTER_2025_PLUS/MASTER/PLAYER_MATCH_STATS_2025_PLUS.csv').is_file():
 print('[ERROR] validate_player_data.py debe estar en la RAIZ de IncaStats-Data')
 sys.exit(2)
checks=[]
for rel,keya,keyb in [('TITAN_PLAYERS_MASTER_2025_PLUS/MASTER/PLAYER_MATCH_STATS_2025_PLUS.csv','ID_Jugador','Event_ID'),('TITAN_PLAYERS_CURRENT/MASTER/PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv','Player_ID','Event_ID')]:
 p=root/rel
 if not p.exists():checks.append((rel,'FALTA',0,0));continue
 seen=set();dups=0;rows=0
 with p.open(encoding='utf-8-sig',newline='') as f:
  for r in csv.DictReader(f):
   rows+=1;k=(r.get(keya,''),r.get(keyb,''));dups+=k in seen;seen.add(k)
 checks.append((rel,'OK' if dups==0 else 'DUPLICADOS',rows,dups))
for c in checks:print(f'{c[1]:12} rows={c[2]:8} dups={c[3]:5}  {c[0]}')
if any(c[1]!='OK' for c in checks):sys.exit(2)
