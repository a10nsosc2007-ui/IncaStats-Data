from pathlib import Path
import json, datetime, sys
ROOT=Path(__file__).resolve().parent
idx=ROOT/'TITAN_PLAYERS_MASTER_2025_PLUS'/'INDEX'/'players.json'
if not idx.exists(): idx=None
if not idx:
 print('ERROR: Este script debe estar en la RAIZ de IncaStats-Data y necesita TITAN_PLAYERS_MASTER_2025_PLUS/INDEX/players.json.')
 input('ENTER...');sys.exit(1)
players=json.loads(idx.read_text(encoding='utf-8'))
out=[]
for p in players:
 out.append({'id':str(p.get('id','')),'name':p.get('name') or '','team_id':str(p.get('primary_team_id') or ''),'team':p.get('primary_team') or '','competition_id':str(p.get('primary_competition_id') or ''),'position':p.get('position') or '','photo':p.get('photo') or '','last_date':p.get('last_date') or None,'source_file':p.get('file') or None})
payload={'schema_version':'incastats.player_selection.v1','provider':'sofascore','generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':str(idx),'player_count':len(out),'derived_team_count':len({x['team_id'] for x in out if x['team_id']}),'players':out}
tools=ROOT/'TOOLS_PLAYER_DELTA';tools.mkdir(parents=True,exist_ok=True)
target=tools/f'TITAN_DELTA_PLAYERS_{len(out)}.json'
target.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'OK: {target.name} · {len(out)} jugadores')
input('ENTER...')
