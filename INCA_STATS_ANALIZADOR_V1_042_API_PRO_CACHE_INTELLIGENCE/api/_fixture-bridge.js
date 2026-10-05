'use strict';

const TITAN=require('../data/runtime/TITAN_FIXTURES_CORE_31_V4.json');
const TEAM_MAP=require('../data/live/titan_team_map.json').teams||[];
const byComp=new Map();
for(const e of TITAN.events||[]){const id=Number(e.competition_id)||0;if(!id)continue;if(!byComp.has(id))byComp.set(id,[]);byComp.get(id).push(e);}
for(const arr of byComp.values())arr.sort((a,b)=>Number(a.start_timestamp||0)-Number(b.start_timestamp||0));

function norm(v=''){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/\b(fc|cf|sc|ac|afc|cd|sd|ca|fk|sk|club|deportivo|futbol club|football club)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function sim(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .94;const A=new Set(a.split(' ')),B=new Set(b.split(' '));const hit=[...A].filter(x=>B.has(x)).length;return hit/Math.max(A.size,B.size,1);}
function mapSofaTeam(apiName,competitionId,country=''){
  const cid=Number(competitionId)||0,c=norm(country);
  let candidates=TEAM_MAP.filter(t=>Array.isArray(t.competition_ids)&&t.competition_ids.some(x=>Number(x)===cid));
  if(!candidates.length)candidates=TEAM_MAP;
  let best=null,score=0;
  for(const t of candidates){const tc=norm(t.country||'');if(c&&tc&&c!==tc)continue;const s=sim(apiName,t.name);if(s>score){best=t;score=s;}}
  return score>=.82?{team_id:Number(best.team_id),name:best.name,score}:null;
}
function matchFixture(f){
  const comp=Number(f.sofascore_competition_id)||0,kick=new Date(f.kickoff_utc).getTime();
  if(!comp||!Number.isFinite(kick))return null;
  const candidates=(byComp.get(comp)||[]).filter(e=>Math.abs(new Date(e.kickoff_utc).getTime()-kick)<=18*3600000);
  let best=null,bestScore=0,method='';
  for(const e of candidates){
    const exactIds=Number(f.home_sofascore_team_id)&&Number(f.away_sofascore_team_id)&&Number(e.home_id)===Number(f.home_sofascore_team_id)&&Number(e.away_id)===Number(f.away_sofascore_team_id);
    const timeDiff=Math.abs(new Date(e.kickoff_utc).getTime()-kick),timeScore=Math.max(0,1-timeDiff/(18*3600000));
    let score;
    if(exactIds)score=.96+timeScore*.04;
    else score=(sim(f.home_team_name,e.home)+sim(f.away_team_name,e.away))*.44+timeScore*.12;
    if(score>bestScore){best=e;bestScore=score;method=exactIds?'TEAM_IDS+KICKOFF':'TEAM_NAMES+KICKOFF';}
  }
  if(!best||bestScore<.82)return null;
  return {event:best,confidence:Number(bestScore.toFixed(4)),method};
}
function bridgeRow(f){
  const m=matchFixture(f);if(!m)return null;const e=m.event;
  return{
    fixture_id:Number(f.fixture_id),sofascore_event_id:Number(e.event_id),sofascore_competition_id:Number(e.competition_id),
    api_kickoff_utc:new Date(f.kickoff_utc).toISOString(),sofascore_kickoff_utc:new Date(e.kickoff_utc).toISOString(),
    home_api_team_id:Number(f.home_api_team_id)||null,away_api_team_id:Number(f.away_api_team_id)||null,
    home_sofascore_team_id:Number(e.home_id)||null,away_sofascore_team_id:Number(e.away_id)||null,
    home_team_name:String(e.home||f.home_team_name||''),away_team_name:String(e.away||f.away_team_name||''),
    confidence:m.confidence,match_method:m.method,updated_at:new Date().toISOString()
  };
}
function stats(){return{events:(TITAN.events||[]).length,competitions:byComp.size,teams:TEAM_MAP.length,generated_at:TITAN.generated_at||null};}

module.exports={mapSofaTeam,matchFixture,bridgeRow,stats,norm,sim};
