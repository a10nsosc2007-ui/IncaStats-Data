(() => {
'use strict';

const CFG=()=>window.INCA_ARCH||{};
const TITAN=()=>window.INCA_TITAN;
const state={ready:false,loading:null,source:'',meta:null,events:[],byCompetition:new Map()};

function unique(arr){return [...new Set((arr||[]).filter(Boolean))];}
function urls(){
  const c=CFG();
  return unique([
    c.titanFixturesPortalUrl,
    ...(c.titanFixturesFallbackUrls||[]),
    c.titanFixturesRawUrl,
    ...(c.titanFixturesRawFallbackUrls||[])
  ]);
}
async function fetchFirst(){
  let last=null;
  for(const url of urls()){
    try{
      const r=await fetch(url,{cache:'no-cache'});
      if(!r.ok)throw new Error(`HTTP_${r.status}`);
      const data=await r.json();
      if(!Array.isArray(data?.events))throw new Error('EVENTS_MISSING');
      if(data.strict_league_only!==true)throw new Error('NOT_STRICT_LEAGUE_ONLY');
      if(Number(data.completed_competitions||data.competition_count||0)<31)throw new Error('INCOMPLETE_31');
      return{url,data};
    }catch(e){last=e;}
  }
  throw last||new Error('TITAN_FIXTURES_UNAVAILABLE');
}
function normalize(e){
  const kickoff=String(e?.kickoff_utc||'');
  return{
    event_id:Number(e?.event_id)||0,
    competition_id:Number(e?.competition_id)||0,
    competition_name:String(e?.competition_name||''),
    country:String(e?.country||''),region:String(e?.region||''),
    season_id:Number(e?.season_id)||0,season_name:String(e?.season_name||''),
    kickoff_utc:kickoff,start_timestamp:Number(e?.start_timestamp)||0,
    status_type:String(e?.status_type||'').toLowerCase(),
    status_description:String(e?.status_description||''),
    round:e?.round??null,round_name:e?.round_name??null,
    home_id:Number(e?.home_id)||0,home:String(e?.home||''),
    away_id:Number(e?.away_id)||0,away:String(e?.away||''),
    home_score:e?.home_score??null,away_score:e?.away_score??null,
    venue:String(e?.venue||''),slug:String(e?.slug||''),source:String(e?.source||'sofascore_unique_tournament')
  };
}
function build(data,url){
  state.source=url;state.meta=data;
  state.events=(data.events||[]).map(normalize).filter(x=>x.event_id&&x.competition_id&&x.kickoff_utc);
  state.byCompetition=new Map();
  for(const e of state.events){if(!state.byCompetition.has(e.competition_id))state.byCompetition.set(e.competition_id,[]);state.byCompetition.get(e.competition_id).push(e);}
  for(const arr of state.byCompetition.values())arr.sort((a,b)=>new Date(a.kickoff_utc)-new Date(b.kickoff_utc)||a.event_id-b.event_id);
  state.ready=true;
  try{window.dispatchEvent(new CustomEvent('inca:fixtures-ready',{detail:{competitionCount:state.byCompetition.size,eventCount:state.events.length,generatedAt:data?.generated_at||null}}));}catch{}
}
async function ensureReady(){
  if(state.ready)return state;
  if(state.loading)return state.loading;
  state.loading=(async()=>{const {url,data}=await fetchFirst();build(data,url);return state;})();
  try{return await state.loading;}finally{state.loading=null;}
}
function competitionMeta(id){
  const n=Number(id), list=state.meta?.competitions||[];
  return list.find(x=>Number(x.competition_id)===n)||null;
}
function findEvent(eventId){
  const id=Number(eventId)||0;
  if(!id)return null;
  return state.events.find(e=>Number(e.event_id)===id)||null;
}
function statusAllowed(e){return !['finished','ended','cancelled','canceled','abandoned'].includes(e.status_type);}
function forCompetition(id,opt={}){
  const arr=state.byCompetition.get(Number(id))||[];
  const from=Number(opt.from??-Infinity),to=Number(opt.to??Infinity);
  return arr.filter(e=>{const t=new Date(e.kickoff_utc).getTime();return Number.isFinite(t)&&t>=from&&t<=to&&(opt.includeEnded===true||statusAllowed(e));});
}
function upcoming(opt={}){
  const from=Number(opt.from??(Date.now()-3600000)),to=Number(opt.to??Infinity),comp=opt.competitionId==null?null:Number(opt.competitionId);
  const src=comp?forCompetition(comp,{from,to}):state.events.filter(statusAllowed);
  return src.filter(e=>{const t=new Date(e.kickoff_utc).getTime();return Number.isFinite(t)&&t>=from&&t<=to;}).sort((a,b)=>new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
}
function titanLogo(name,id){try{return TITAN()?.logoUrl?.(name,id)||''}catch{return''}}
function toMatchCenter(e){return{
  id:String(e.event_id),sofascore_event_id:e.event_id,api_fixture_id:null,source:'titan-fixtures-github',
  start_time:e.kickoff_utc,status_type:e.status_type,status_description:e.status_description,
  round:e.round,round_name:e.round_name,
  home:{id:e.home_id,name:e.home,logo:titanLogo(e.home,e.home_id)},
  away:{id:e.away_id,name:e.away,logo:titanLogo(e.away,e.away_id)},
  venue:{name:e.venue||''},competition_id:e.competition_id,season_id:e.season_id,season_name:e.season_name
};}
function toCacheFixture(e){return{
  fixture_id:e.event_id,api_fixture_id:null,sofascore_event_id:e.event_id,
  sofascore_competition_id:e.competition_id,league_name:e.competition_name,season_id:e.season_id,season_name:e.season_name,
  kickoff_utc:e.kickoff_utc,status_type:e.status_type,status_description:e.status_description,round:e.round,round_name:e.round_name,
  home_sofascore_team_id:e.home_id,home_api_team_id:null,home_team_name:e.home,home_logo:titanLogo(e.home,e.home_id),
  away_sofascore_team_id:e.away_id,away_api_team_id:null,away_team_name:e.away,away_logo:titanLogo(e.away,e.away_id),
  venue:e.venue||'',source:'titan-fixtures-github'
};}
function nextForTeam(teamId,competitionId=null){
  const id=Number(teamId),now=Date.now()-3600000;
  const rows=upcoming({from:now,competitionId}).filter(e=>e.home_id===id||e.away_id===id);
  const normal=rows.find(e=>!['postponed','suspended'].includes(e.status_type));
  return normal||rows[0]||null;
}
function info(){return{ready:state.ready,source:state.source,eventCount:state.events.length,competitionCount:state.byCompetition.size,generatedAt:state.meta?.generated_at||null};}

window.INCA_FIXTURES=Object.freeze({ensureReady,forCompetition,upcoming,competitionMeta,findEvent,toMatchCenter,toCacheFixture,nextForTeam,info});
})();
